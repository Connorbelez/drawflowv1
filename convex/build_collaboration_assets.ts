import { v } from "convex/values";

import { internal } from "./_generated/api";
import type { ActiveBuildAuthorization } from "./activeBuildAccess";
import { authenticatedMutation, authenticatedQuery } from "./authz";
import {
  canReadCollaborationPost,
  resolveCurrentCollaborationPostReaderIds,
} from "./build_collaboration_access";
import { authorizeActiveBuildCollaborationPreparerAccess } from "./build_collaboration_actor";
import {
  canReadAssetStagingContext,
  canReadCollaborationAsset,
} from "./build_collaboration_asset_access";
import { canReadDrawCoordination } from "./build_draw_coordination";
import { authorizeActiveBuildCollaborationAccess } from "./build_collaboration_rollout";
import { buildCollaborationAssetStagingContextValidator } from "./build_collaboration_validators";
import type { Doc, Id, MutationCtx, QueryCtx } from "./types";

const MAX_ASSET_BYTES = 100 * 1024 * 1024;
const MAX_ASSETS_PER_REQUEST = 100;
const MAX_ACTIVE_STAGING_SESSIONS = 25;
const MAX_COST_DOCUMENT_DRAFT_ACTIVE_STAGING_SESSIONS = 50;
const STAGING_SESSION_TTL_MS = 24 * 60 * 60 * 1000;
const COST_DOCUMENT_DRAFT_STAGING_SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_CAPTURE_CLOCK_SKEW_MS = 5 * 60 * 1000;
const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const BLOCKED_MIME_TYPES = new Set([
  "application/javascript",
  "application/x-httpd-php",
  "application/x-msdownload",
  "application/x-sh",
  "image/svg+xml",
  "text/html",
]);

interface FinalizeAssetUploadInput {
  buildId: Id<"activeBuilds">;
  contentHashSha256: string;
  fileName: string;
  mimeType?: string;
  organizationId: string;
  stagingSessionId: Id<"buildCollaborationAssetStagingSessions">;
  storageId: Id<"_storage">;
  supersedesAssetId?: Id<"buildCollaborationAssets">;
}

const finalizeAssetUploadFields = {
  buildId: v.id("activeBuilds"),
  contentHashSha256: v.string(),
  fileName: v.string(),
  mimeType: v.optional(v.string()),
  organizationId: v.string(),
  stagingSessionId: v.id("buildCollaborationAssetStagingSessions"),
  storageId: v.id("_storage"),
  supersedesAssetId: v.optional(v.id("buildCollaborationAssets")),
};

const assetStatusValidator = v.object({
  _id: v.id("buildCollaborationAssets"),
  contentHashSha256: v.optional(v.string()),
  fileName: v.string(),
  mimeType: v.string(),
  scanMessage: v.optional(v.string()),
  scanState: v.optional(
    v.union(
      v.literal("pending"),
      v.literal("clean"),
      v.literal("rejected"),
      v.literal("error")
    )
  ),
  sizeBytes: v.number(),
  sourceCapturedAt: v.optional(v.number()),
  state: v.union(
    v.literal("staged"),
    v.literal("quarantined"),
    v.literal("available"),
    v.literal("rejected"),
    v.literal("superseded")
  ),
  version: v.number(),
});

export const beginBuildCollaborationAssetUpload = authenticatedMutation
  .input({
    buildId: v.id("activeBuilds"),
    contextKind: buildCollaborationAssetStagingContextValidator,
    contextRecordId: v.optional(v.string()),
    fileName: v.string(),
    mimeType: v.optional(v.string()),
    organizationId: v.string(),
    sizeBytes: v.number(),
    sourceCapturedAt: v.optional(v.number()),
  })
  .returns(
    v.object({
      expiresAt: v.number(),
      stagingSessionId: v.id("buildCollaborationAssetStagingSessions"),
      uploadUrl: v.string(),
    })
  )
  .handler(async (ctx, args) => {
    const authorization = await authorizeActiveBuildCollaborationPreparerAccess(
      ctx,
      args
    );
    if (
      authorization.viewer.actorKind === "agent" &&
      args.contextKind !== "draft"
    ) {
      throw new Error("Agents may stage assets only inside an owned draft.");
    }
    const expectedFileName = boundedText(args.fileName, "File name", 240);
    const expectedMimeType = canonicalMimeType(undefined, args.mimeType);
    assertAssetSize(args.sizeBytes);
    const contextRecordId = await authorizeStagingContext(ctx, {
      authorization,
      contextKind: args.contextKind,
      contextRecordId: args.contextRecordId,
    });
    const now = Date.now();
    assertSourceCapturedAt(args.sourceCapturedAt, now);
    await assertStagingCapacity(ctx, authorization, now, args.contextKind);
    const expiresAt =
      now +
      (args.contextKind === "costDocumentDraft"
        ? COST_DOCUMENT_DRAFT_STAGING_SESSION_TTL_MS
        : STAGING_SESSION_TTL_MS);
    const stagingSessionId = await ctx.db.insert(
      "buildCollaborationAssetStagingSessions",
      {
        brokerageId: authorization.brokerage._id,
        buildId: authorization.build._id,
        contextKind: args.contextKind,
        contextRecordId,
        createdAt: now,
        expectedFileName,
        expectedMimeType,
        expectedSizeBytes: args.sizeBytes,
        sourceCapturedAt: args.sourceCapturedAt,
        expiresAt,
        organizationId: authorization.organizationId,
        ownerWorkosUserId: authorization.viewer.subject,
        state: "open",
        updatedAt: now,
      }
    );
    await recordAssetAudit(ctx, authorization, {
      command: "beginBuildCollaborationAssetUpload",
      entityId: stagingSessionId,
      entityType: "buildCollaborationAssetStagingSession",
      eventType: "build.collaboration.asset.upload_authorized",
      newState: JSON.stringify({
        contextKind: args.contextKind,
        expectedFileName,
        expectedMimeType,
        expectedSizeBytes: args.sizeBytes,
        expiresAt,
        sourceCapturedAt: args.sourceCapturedAt,
      }),
      now,
    });
    await ctx.scheduler.runAt(
      expiresAt,
      internal.build_collaboration_asset_maintenance
        .expireBuildCollaborationAssetStagingSession,
      { stagingSessionId }
    );
    return {
      expiresAt,
      stagingSessionId,
      uploadUrl: await ctx.storage.generateUploadUrl(),
    };
  })
  .public();

export const finalizeBuildCollaborationAssetUpload = authenticatedMutation
  .input(finalizeAssetUploadFields)
  .returns(v.id("buildCollaborationAssets"))
  .handler(
    async (ctx, args) =>
      await finalizeAssetUpload(ctx, args, { scanInBackground: true })
  )
  .public();

export const registerBuildCollaborationAssetUploadedStorage =
  authenticatedMutation
    .input({
      buildId: v.id("activeBuilds"),
      organizationId: v.string(),
      stagingSessionId: v.id("buildCollaborationAssetStagingSessions"),
      storageId: v.id("_storage"),
    })
    .returns(v.null())
    .handler(async (ctx, args) => {
      const authorization =
        await authorizeActiveBuildCollaborationPreparerAccess(ctx, args);
      const now = Date.now();
      const session = await requireOwnedOpenSession(
        ctx,
        authorization,
        args.stagingSessionId,
        now
      );
      if (
        session.pendingStorageId &&
        session.pendingStorageId !== args.storageId
      ) {
        throw new Error("This staging session already owns another upload.");
      }
      const metadata = await ctx.db.system.get(args.storageId);
      if (!metadata) {
        throw new Error("The uploaded file is unavailable.");
      }
      const [existingAsset, existingSessions] = await Promise.all([
        ctx.db
          .query("buildCollaborationAssets")
          .withIndex("by_storageId", (query) =>
            query.eq("storageId", args.storageId)
          )
          .unique(),
        ctx.db
          .query("buildCollaborationAssetStagingSessions")
          .withIndex("by_pendingStorageId", (query) =>
            query.eq("pendingStorageId", args.storageId)
          )
          .take(2),
      ]);
      if (
        existingAsset ||
        existingSessions.some(
          (existingSession) => existingSession._id !== session._id
        )
      ) {
        throw new Error("This uploaded storage identity is already in use.");
      }
      await ctx.db.patch(session._id, {
        pendingStorageId: args.storageId,
        updatedAt: now,
      });
      return null;
    })
    .public();

export const finalizeBuildCollaborationAssetUploadForAction =
  authenticatedMutation
    .input(finalizeAssetUploadFields)
    .returns(v.id("buildCollaborationAssets"))
    .handler(
      async (ctx, args) =>
        await finalizeAssetUpload(ctx, args, { scanInBackground: false })
    )
    .internal();

async function finalizeAssetUpload(
  ctx: MutationCtx & { viewer: ActiveBuildAuthorization["viewer"] },
  args: FinalizeAssetUploadInput,
  options: { scanInBackground: boolean }
) {
  const authorization = await authorizeActiveBuildCollaborationPreparerAccess(
    ctx,
    args
  );
  const now = Date.now();
  const session = await requireOwnedOpenSession(
    ctx,
    authorization,
    args.stagingSessionId,
    now
  );
  const metadata = await ctx.db.system.get(args.storageId);
  if (!metadata) {
    throw new Error("The uploaded file is unavailable.");
  }
  if (session.pendingStorageId && session.pendingStorageId !== args.storageId) {
    throw new Error(
      "The uploaded storage identity does not match its staging session."
    );
  }
  const pendingStorageSessions = await ctx.db
    .query("buildCollaborationAssetStagingSessions")
    .withIndex("by_pendingStorageId", (query) =>
      query.eq("pendingStorageId", args.storageId)
    )
    .take(2);
  if (
    pendingStorageSessions.some(
      (pendingStorageSession) => pendingStorageSession._id !== session._id
    )
  ) {
    throw new Error(
      "This uploaded storage identity belongs to another session."
    );
  }
  assertAssetSize(metadata.size);
  const existingStorage = await ctx.db
    .query("buildCollaborationAssets")
    .withIndex("by_storageId", (query) => query.eq("storageId", args.storageId))
    .unique();
  if (existingStorage) {
    throw new Error("This upload has already been finalized.");
  }
  const fileName = boundedText(args.fileName, "File name", 240);
  const mimeType = canonicalMimeType(metadata.contentType, args.mimeType);
  if (
    (session.expectedFileName && session.expectedFileName !== fileName) ||
    (session.expectedMimeType && session.expectedMimeType !== mimeType) ||
    (session.expectedSizeBytes !== undefined &&
      session.expectedSizeBytes !== metadata.size)
  ) {
    throw new Error("The uploaded file does not match its staging intent.");
  }
  const contentHashSha256 = args.contentHashSha256.trim().toLowerCase();
  if (!SHA256_PATTERN.test(contentHashSha256)) {
    throw new Error("A valid SHA-256 content hash is required.");
  }
  const versionPlacement = args.supersedesAssetId
    ? await resolveVersionPlacement(ctx, authorization, args.supersedesAssetId)
    : null;
  const { maximumAudienceMode, readerWorkosUserIds } = await stagingAudience(
    ctx,
    authorization,
    session
  );
  const assetId = await ctx.db.insert("buildCollaborationAssets", {
    brokerageId: authorization.brokerage._id,
    buildId: authorization.build._id,
    contentHashSha256,
    createdAt: now,
    fileName,
    maximumAudienceMode,
    mimeType,
    lineageRootAssetId: versionPlacement?.lineageRootAssetId,
    organizationId: authorization.organizationId,
    readerWorkosUserIds,
    scanState: "pending",
    sizeBytes: metadata.size,
    sourceCapturedAt: session.sourceCapturedAt,
    stagingSessionId: session._id,
    state: "quarantined",
    storageId: args.storageId,
    supersedesAssetId: versionPlacement?.predecessorAssetId,
    updatedAt: now,
    uploadedByWorkosUserId: authorization.viewer.subject,
    version: versionPlacement?.version ?? 1,
  });
  if (!versionPlacement) {
    await ctx.db.patch(assetId, { lineageRootAssetId: assetId });
  }
  await ctx.db.patch(session._id, {
    assetId,
    state: "finalized",
    updatedAt: now,
  });
  await recordAssetAudit(ctx, authorization, {
    command: "finalizeBuildCollaborationAssetUpload",
    entityId: assetId,
    entityType: "buildCollaborationAsset",
    eventType: "build.collaboration.asset.quarantined",
    newState: JSON.stringify({
      contentHashSha256,
      mimeType,
      scanState: "pending",
      sizeBytes: metadata.size,
      storageId: args.storageId,
      version: versionPlacement?.version ?? 1,
    }),
    now,
  });
  if (options.scanInBackground) {
    await ctx.scheduler.runAfter(
      0,
      internal.build_collaboration_asset_maintenance
        .processBuildCollaborationAssetScan,
      { assetId }
    );
  }
  return assetId;
}

export const listBuildCollaborationAssetStatuses = authenticatedQuery
  .input({
    assetIds: v.array(v.id("buildCollaborationAssets")),
    buildId: v.id("activeBuilds"),
    organizationId: v.string(),
  })
  .returns(v.array(assetStatusValidator))
  .handler(async (ctx, args) => {
    const authorization = await authorizeActiveBuildCollaborationAccess(
      ctx,
      args
    );
    if (args.assetIds.length > MAX_ASSETS_PER_REQUEST) {
      throw new Error(
        `At most ${MAX_ASSETS_PER_REQUEST} assets may be requested.`
      );
    }
    const rows: ReturnType<typeof projectAssetStatus>[] = [];
    for (const assetId of new Set(args.assetIds)) {
      const asset = await ctx.db.get(assetId);
      if (asset && (await canInspectAsset(ctx, authorization, asset))) {
        rows.push(projectAssetStatus(asset));
      }
    }
    return rows;
  })
  .public();

export const authorizeBuildCollaborationAssetDownload = authenticatedMutation
  .input({
    assetId: v.id("buildCollaborationAssets"),
    buildId: v.id("activeBuilds"),
    organizationId: v.string(),
  })
  .returns(v.string())
  .handler(async (ctx, args) => {
    const authorization = await authorizeActiveBuildCollaborationPreparerAccess(
      ctx,
      args,
      { allowClosed: true }
    );
    const asset = await ctx.db.get(args.assetId);
    if (
      !(
        asset &&
        (await canReadCollaborationAsset(ctx, { asset, authorization }))
      )
    ) {
      throw new Error("The collaboration asset is unavailable.");
    }
    const url = await ctx.storage.getUrl(asset.storageId);
    if (!url) {
      throw new Error("The collaboration asset file is unavailable.");
    }
    await recordAssetAudit(ctx, authorization, {
      command: "authorizeBuildCollaborationAssetDownload",
      entityId: asset._id,
      entityType: "buildCollaborationAsset",
      eventType: "build.collaboration.asset.download_authorized",
      newState: JSON.stringify({ version: asset.version }),
      now: Date.now(),
    });
    return url;
  })
  .public();

export const abandonMyBuildCollaborationAssets = authenticatedMutation
  .input({
    assetIds: v.array(v.id("buildCollaborationAssets")),
    buildId: v.id("activeBuilds"),
    organizationId: v.string(),
    reason: v.string(),
  })
  .returns(v.number())
  .handler(async (ctx, args) => {
    const authorization = await authorizeActiveBuildCollaborationPreparerAccess(
      ctx,
      args
    );
    const assetIds = [...new Set(args.assetIds)];
    if (assetIds.length > 25) {
      throw new Error("At most 25 staged assets may be abandoned at once.");
    }
    const reason = boundedText(args.reason, "Abandonment reason", 500);
    const now = Date.now();
    let abandoned = 0;
    for (const assetId of assetIds) {
      const asset = await ctx.db.get(assetId);
      const session = asset?.stagingSessionId
        ? await ctx.db.get(asset.stagingSessionId)
        : null;
      if (
        !(asset && session) ||
        asset.organizationId !== authorization.organizationId ||
        asset.buildId !== authorization.build._id ||
        asset.brokerageId !== authorization.brokerage._id ||
        asset.publishedAt ||
        !(await canManageStagingSession(ctx, authorization, session))
      ) {
        throw new Error("A staged collaboration asset is unavailable.");
      }
      const activeCostDocumentDraftPages = await ctx.db
        .query("costDocumentDraftPages")
        .withIndex("by_assetId", (query) => query.eq("assetId", asset._id))
        .filter((query) => query.eq(query.field("state"), "active"))
        .take(1);
      if (activeCostDocumentDraftPages.length > 0) {
        throw new Error(
          "Cost Document draft source pages cannot be abandoned while still bound."
        );
      }
      const attachments = await ctx.db
        .query("buildCollaborationAttachments")
        .withIndex("by_buildId_and_attachmentKind_and_attachmentId", (query) =>
          query
            .eq("buildId", authorization.build._id)
            .eq("attachmentKind", "collaborationAsset")
            .eq("attachmentId", asset._id)
        )
        .take(1);
      if (attachments.length > 0) {
        throw new Error("Published collaboration assets cannot be abandoned.");
      }
      await abandonUnpublishedAsset(ctx, authorization, {
        asset,
        now,
        reason,
        session,
      });
      abandoned += 1;
    }
    return abandoned;
  })
  .public();

async function authorizeStagingContext(
  ctx: MutationCtx,
  input: {
    authorization: ActiveBuildAuthorization;
    contextKind:
      | "composer"
      | "costDocumentDraft"
      | "draft"
      | "post"
      | "actionItem";
    contextRecordId?: string;
  }
) {
  if (input.contextKind === "composer") {
    if (input.contextRecordId) {
      throw new Error("Composer uploads cannot specify a context record.");
    }
    return;
  }
  if (!input.contextRecordId) {
    throw new Error("This upload context requires a record.");
  }
  if (input.contextKind === "draft") {
    const draftId = ctx.db.normalizeId(
      "buildCollaborationDrafts",
      input.contextRecordId
    );
    const draft = draftId ? await ctx.db.get(draftId) : null;
    if (
      !draft ||
      draft.buildId !== input.authorization.build._id ||
      draft.organizationId !== input.authorization.organizationId ||
      (draft.ownerWorkosUserId !== input.authorization.viewer.subject &&
        !(
          input.authorization.viewer.actorKind === "human" &&
          draft.approvalOwnerWorkosUserId === input.authorization.viewer.subject
        )) ||
      (draft.state !== "active" && draft.state !== "scheduled")
    ) {
      throw new Error("The collaboration draft is unavailable.");
    }
    return draft._id;
  }
  if (input.contextKind === "costDocumentDraft") {
    return await authorizeCostDocumentDraftStagingContext(
      ctx,
      input.authorization,
      input.contextRecordId
    );
  }
  if (input.contextKind === "post") {
    const post = await readablePost(
      ctx,
      input.authorization,
      input.contextRecordId
    );
    return post._id;
  }
  const actionItemId = ctx.db.normalizeId(
    "buildActionItems",
    input.contextRecordId
  );
  const actionItem = actionItemId ? await ctx.db.get(actionItemId) : null;
  if (
    !actionItem ||
    actionItem.buildId !== input.authorization.build._id ||
    actionItem.organizationId !== input.authorization.organizationId
  ) {
    throw new Error("The Action Item is unavailable.");
  }
  await readablePost(ctx, input.authorization, actionItem.originatingPostId);
  return actionItem._id;
}

async function authorizeCostDocumentDraftStagingContext(
  ctx: MutationCtx,
  authorization: ActiveBuildAuthorization,
  contextRecordId: string
) {
  if (
    authorization.viewer.actorKind !== "human" ||
    (authorization.effectiveRole.role !== "builder" &&
      authorization.effectiveRole.role !== "builder-staff")
  ) {
    throw new Error("Forbidden: Cost Document Builder access");
  }
  const draftId = ctx.db.normalizeId("costDocumentDrafts", contextRecordId);
  const draft = draftId ? await ctx.db.get(draftId) : null;
  const batch = draft?.batchId ? await ctx.db.get(draft.batchId) : null;
  if (
    !(draft && batch) ||
    draft.buildId !== authorization.build._id ||
    draft.organizationId !== authorization.organizationId ||
    draft.brokerageId !== authorization.brokerage._id ||
    draft.ownerWorkosUserId !== authorization.viewer.subject ||
    draft.lifecycle !== "draft" ||
    draft.activeStep !== "capture_confirm" ||
    batch.organizationId !== draft.organizationId ||
    batch.brokerageId !== draft.brokerageId ||
    batch.buildId !== draft.buildId ||
    batch.ownerWorkosUserId !== draft.ownerWorkosUserId ||
    batch.state !== "active"
  ) {
    throw new Error("The Cost Document draft is unavailable.");
  }
  return draft._id;
}

async function requireOwnedOpenSession(
  ctx: MutationCtx,
  authorization: ActiveBuildAuthorization,
  sessionId: Id<"buildCollaborationAssetStagingSessions">,
  now: number
) {
  const session = await ctx.db.get(sessionId);
  if (
    !session ||
    session.organizationId !== authorization.organizationId ||
    session.brokerageId !== authorization.brokerage._id ||
    session.buildId !== authorization.build._id ||
    !(await canManageStagingSession(ctx, authorization, session)) ||
    session.state !== "open" ||
    session.expiresAt <= now
  ) {
    throw new Error("The asset staging session is unavailable.");
  }
  await authorizeStagingContext(ctx, {
    authorization,
    contextKind: session.contextKind,
    contextRecordId: session.contextRecordId,
  });
  return session;
}

async function resolveVersionPlacement(
  ctx: MutationCtx,
  authorization: ActiveBuildAuthorization,
  assetId: Id<"buildCollaborationAssets">
) {
  const asset = await ctx.db.get(assetId);
  if (
    !asset ||
    asset.organizationId !== authorization.organizationId ||
    asset.brokerageId !== authorization.brokerage._id ||
    asset.buildId !== authorization.build._id ||
    asset.scanState !== "clean" ||
    asset.state !== "available" ||
    !asset.publishedAt ||
    !(await canReadCollaborationAsset(ctx, { asset, authorization }))
  ) {
    throw new Error("The prior asset version is unavailable.");
  }
  const [draftPage, submittedPage] = await Promise.all([
    ctx.db
      .query("costDocumentDraftPages")
      .withIndex("by_assetId", (query) => query.eq("assetId", asset._id))
      .first(),
    ctx.db
      .query("costDocumentPages")
      .withIndex("by_buildId_and_assetId", (query) =>
        query.eq("buildId", authorization.build._id).eq("assetId", asset._id)
      )
      .first(),
  ]);
  if (draftPage || submittedPage) {
    // Cost Document page identity is frozen by its own draft/submission
    // lifecycle. Generic collaboration versioning would later supersede the
    // source asset and invalidate immutable Cost Document replay.
    throw new Error("The prior asset version is unavailable.");
  }
  const lineageRootAssetId = asset.lineageRootAssetId ?? asset._id;
  const lineage = await ctx.db
    .query("buildCollaborationAssets")
    .withIndex("by_lineageRootAssetId_and_version", (query) =>
      query.eq("lineageRootAssetId", lineageRootAssetId)
    )
    .order("desc")
    .take(101);
  if (lineage.length > 100) {
    throw new Error("This asset has reached its 100-version limit.");
  }
  const latest = lineage[0] ?? asset;
  if (
    latest._id !== asset._id &&
    (latest.state !== "rejected" || latest.publishedAt !== undefined)
  ) {
    throw new Error(
      "A newer asset version already exists; refresh before replacing it."
    );
  }
  return {
    lineageRootAssetId,
    predecessorAssetId: latest._id,
    version: latest.version + 1,
  };
}

async function assertStagingCapacity(
  ctx: QueryCtx,
  authorization: ActiveBuildAuthorization,
  now: number,
  contextKind?:
    | "composer"
    | "costDocumentDraft"
    | "draft"
    | "post"
    | "actionItem"
) {
  const maxActiveSessions =
    contextKind === "costDocumentDraft"
      ? MAX_COST_DOCUMENT_DRAFT_ACTIVE_STAGING_SESSIONS
      : MAX_ACTIVE_STAGING_SESSIONS;
  let activeCount = 0;
  for (const state of ["open", "finalized"] as const) {
    const sessions = await ctx.db
      .query("buildCollaborationAssetStagingSessions")
      .withIndex("by_buildId_and_ownerWorkosUserId_and_state", (query) =>
        query
          .eq("buildId", authorization.build._id)
          .eq("ownerWorkosUserId", authorization.viewer.subject)
          .eq("state", state)
      )
      .take(maxActiveSessions + 1);
    activeCount += sessions.filter((session) => session.expiresAt > now).length;
  }
  if (activeCount >= maxActiveSessions) {
    throw new Error(
      `At most ${maxActiveSessions} active asset uploads are allowed per participant and Build.`
    );
  }
}

async function stagingAudience(
  ctx: MutationCtx,
  authorization: ActiveBuildAuthorization,
  session: Doc<"buildCollaborationAssetStagingSessions">
): Promise<{
  maximumAudienceMode: "build_wide" | "author_tier_and_higher" | "custom";
  readerWorkosUserIds?: string[];
}> {
  if (session.contextKind === "post" && session.contextRecordId) {
    const post = await readablePost(
      ctx,
      authorization,
      session.contextRecordId
    );
    return {
      maximumAudienceMode: post.audienceMode,
      readerWorkosUserIds: await resolveCurrentCollaborationPostReaderIds(
        ctx,
        authorization,
        post
      ),
    };
  }
  if (session.contextKind === "actionItem" && session.contextRecordId) {
    const actionItemId = ctx.db.normalizeId(
      "buildActionItems",
      session.contextRecordId
    );
    const actionItem = actionItemId ? await ctx.db.get(actionItemId) : null;
    if (!actionItem) {
      throw new Error("The Action Item is unavailable.");
    }
    const post = await readablePost(
      ctx,
      authorization,
      actionItem.originatingPostId
    );
    return {
      maximumAudienceMode: post.audienceMode,
      readerWorkosUserIds: await resolveCurrentCollaborationPostReaderIds(
        ctx,
        authorization,
        post
      ),
    };
  }
  if (session.contextKind === "costDocumentDraft") {
    return {
      maximumAudienceMode: "custom",
      readerWorkosUserIds: [authorization.viewer.subject],
    };
  }
  return { maximumAudienceMode: "build_wide" };
}

async function readablePost(
  ctx: QueryCtx,
  authorization: ActiveBuildAuthorization,
  recordId: string
) {
  const postId = ctx.db.normalizeId("buildCollaborationPosts", recordId);
  const post = postId ? await ctx.db.get(postId) : null;
  if (
    !post ||
    post.organizationId !== authorization.organizationId ||
    post.brokerageId !== authorization.brokerage._id ||
    post.buildId !== authorization.build._id ||
    !(await canReadCollaborationPost(ctx, authorization, post)) ||
    (post.systemPostKind === "draw" &&
      !(await canReadDrawCoordination(ctx, { authorization, post })))
  ) {
    throw new Error("The collaboration post is unavailable.");
  }
  return post;
}

async function canManageStagingSession(
  ctx: QueryCtx,
  authorization: ActiveBuildAuthorization,
  session: Doc<"buildCollaborationAssetStagingSessions">
) {
  if (session.ownerWorkosUserId === authorization.viewer.subject) {
    return true;
  }
  if (
    authorization.viewer.actorKind !== "human" ||
    (session.contextKind !== "draft" &&
      session.contextKind !== "costDocumentDraft") ||
    !session.contextRecordId
  ) {
    return false;
  }
  if (session.contextKind === "costDocumentDraft") {
    const draftId = ctx.db.normalizeId(
      "costDocumentDrafts",
      session.contextRecordId
    );
    const draft = draftId ? await ctx.db.get(draftId) : null;
    return Boolean(
      draft &&
        draft.organizationId === authorization.organizationId &&
        draft.buildId === authorization.build._id &&
        draft.ownerWorkosUserId === authorization.viewer.subject
    );
  }
  const draftId = ctx.db.normalizeId(
    "buildCollaborationDrafts",
    session.contextRecordId
  );
  const draft = draftId ? await ctx.db.get(draftId) : null;
  return Boolean(
    draft &&
      draft.organizationId === authorization.organizationId &&
      draft.buildId === authorization.build._id &&
      draft.approvalOwnerWorkosUserId === authorization.viewer.subject
  );
}

async function canInspectAsset(
  ctx: QueryCtx,
  authorization: ActiveBuildAuthorization,
  asset: Doc<"buildCollaborationAssets">
) {
  if (
    asset.organizationId !== authorization.organizationId ||
    asset.brokerageId !== authorization.brokerage._id ||
    asset.buildId !== authorization.build._id
  ) {
    return false;
  }
  const session = asset.stagingSessionId
    ? await ctx.db.get(asset.stagingSessionId)
    : null;
  if (
    session?.ownerWorkosUserId === authorization.viewer.subject &&
    (await canReadAssetStagingContext(ctx, authorization, session))
  ) {
    return true;
  }
  return await canReadCollaborationAsset(ctx, { asset, authorization });
}

function projectAssetStatus(asset: Doc<"buildCollaborationAssets">) {
  return {
    _id: asset._id,
    contentHashSha256: asset.contentHashSha256,
    fileName: asset.fileName,
    mimeType: asset.mimeType,
    scanMessage: asset.scanMessage,
    scanState: asset.scanState,
    sizeBytes: asset.sizeBytes,
    sourceCapturedAt: asset.sourceCapturedAt,
    state: asset.state,
    version: asset.version,
  };
}

function canonicalMimeType(metadataType?: string, submittedType?: string) {
  const metadata = metadataType?.trim().toLowerCase();
  const submitted = submittedType?.trim().toLowerCase();
  if (metadata && submitted && metadata !== submitted) {
    throw new Error("The uploaded file MIME type does not match its metadata.");
  }
  const mimeType = metadata || submitted || "application/octet-stream";
  if (mimeType.length > 200 || BLOCKED_MIME_TYPES.has(mimeType)) {
    throw new Error("This file type cannot be used in Build collaboration.");
  }
  return mimeType;
}

function assertSourceCapturedAt(value: number | undefined, now: number) {
  if (value === undefined) {
    return;
  }
  if (
    !Number.isFinite(value) ||
    value <= 0 ||
    value > now + MAX_CAPTURE_CLOCK_SKEW_MS
  ) {
    throw new Error("The source capture timestamp is invalid.");
  }
}

function assertAssetSize(sizeBytes: number) {
  if (
    !Number.isSafeInteger(sizeBytes) ||
    sizeBytes <= 0 ||
    sizeBytes > MAX_ASSET_BYTES
  ) {
    throw new Error("Collaboration files must be between 1 byte and 100 MB.");
  }
}

function boundedText(value: string, label: string, max: number) {
  const normalized = value.trim();
  if (!normalized || normalized.length > max) {
    throw new Error(`${label} must be between 1 and ${max} characters.`);
  }
  return normalized;
}

async function recordAssetAudit(
  ctx: MutationCtx,
  authorization: ActiveBuildAuthorization,
  input: {
    command: string;
    entityId: string;
    entityType: string;
    eventType: string;
    newState?: string;
    now: number;
  }
) {
  await ctx.db.insert("auditEvents", {
    actorRoles: authorization.roles,
    actorWorkosUserId: authorization.viewer.subject,
    brokerageId: authorization.brokerage._id,
    command: input.command,
    createdAt: input.now,
    entityId: input.entityId,
    entityType: input.entityType,
    eventType: input.eventType,
    newState: input.newState,
    organizationId: authorization.organizationId,
    warnings: [],
  });
}

async function abandonUnpublishedAsset(
  ctx: MutationCtx,
  authorization: ActiveBuildAuthorization,
  input: {
    asset: Doc<"buildCollaborationAssets">;
    now: number;
    reason: string;
    session: Doc<"buildCollaborationAssetStagingSessions">;
  }
) {
  if (!input.asset.storageDeletedAt) {
    await ctx.storage.delete(input.asset.storageId);
  }
  await ctx.db.patch(input.asset._id, {
    scanCompletedAt: input.now,
    scanMessage: input.reason,
    scanState: "rejected",
    state: "rejected",
    storageDeletedAt: input.now,
    updatedAt: input.now,
  });
  await ctx.db.patch(input.session._id, {
    state: "abandoned",
    updatedAt: input.now,
  });
  await recordAssetAudit(ctx, authorization, {
    command: "abandonMyBuildCollaborationAssets",
    entityId: input.asset._id,
    entityType: "buildCollaborationAsset",
    eventType: "build.collaboration.asset.abandoned",
    newState: JSON.stringify({
      reason: input.reason,
      sessionState: "abandoned",
      state: "rejected",
      storageDeleted: true,
    }),
    now: input.now,
  });
}

/**
 * Retires an unpublished Cost Document draft asset after a page replacement.
 * The draft page owns the storage lineage, so this deliberately reuses the
 * governed abandonment path instead of introducing a second uploader/cleanup
 * implementation.
 */
export async function abandonUnpublishedCostDocumentDraftAsset(
  ctx: MutationCtx,
  authorization: ActiveBuildAuthorization,
  input: {
    asset: Doc<"buildCollaborationAssets">;
    now: number;
    reason: string;
    session: Doc<"buildCollaborationAssetStagingSessions">;
  }
) {
  if (
    input.session.contextKind !== "costDocumentDraft" ||
    input.asset.publishedAt ||
    input.session.organizationId !== authorization.organizationId ||
    input.session.brokerageId !== authorization.brokerage._id ||
    input.session.buildId !== authorization.build._id ||
    input.session.ownerWorkosUserId !== authorization.viewer.subject
  ) {
    throw new Error("The Cost Document draft asset cannot be abandoned.");
  }
  await abandonUnpublishedAsset(ctx, authorization, input);
}

export async function reconcileDraftAssetStagingSessions(
  ctx: MutationCtx,
  input: {
    authorization: ActiveBuildAuthorization;
    draftId: Id<"buildCollaborationDrafts">;
    now: number;
    retainedAssetIds: Id<"buildCollaborationAssets">[];
  }
) {
  const retained = new Set(input.retainedAssetIds);
  const sessions = (
    await Promise.all(
      (["open", "finalized"] as const).map((state) =>
        ctx.db
          .query("buildCollaborationAssetStagingSessions")
          .withIndex("by_contextKind_and_contextRecordId_and_state", (query) =>
            query
              .eq("contextKind", "draft")
              .eq("contextRecordId", input.draftId)
              .eq("state", state)
          )
          .take(100)
      )
    )
  ).flat();
  for (const session of sessions) {
    if (
      session.organizationId !== input.authorization.organizationId ||
      session.buildId !== input.authorization.build._id ||
      (session.assetId && retained.has(session.assetId))
    ) {
      continue;
    }
    if (!session.assetId) {
      let storageDeleted = false;
      if (session.pendingStorageId) {
        const pendingStorageId = session.pendingStorageId;
        const [boundAsset, boundSessions] = await Promise.all([
          ctx.db
            .query("buildCollaborationAssets")
            .withIndex("by_storageId", (query) =>
              query.eq("storageId", pendingStorageId)
            )
            .unique(),
          ctx.db
            .query("buildCollaborationAssetStagingSessions")
            .withIndex("by_pendingStorageId", (query) =>
              query.eq("pendingStorageId", pendingStorageId)
            )
            .take(2),
        ]);
        if (
          !boundAsset &&
          boundSessions.length === 1 &&
          boundSessions[0]?._id === session._id
        ) {
          await ctx.storage.delete(pendingStorageId);
          storageDeleted = true;
        }
      }
      await ctx.db.patch(session._id, {
        state: "abandoned",
        updatedAt: input.now,
      });
      await recordAssetAudit(ctx, input.authorization, {
        command: "reconcileDraftAssetStagingSessions",
        entityId: session._id,
        entityType: "buildCollaborationAssetStagingSession",
        eventType: "build.collaboration.asset.upload_abandoned",
        newState: JSON.stringify({
          reason: "Removed from its private draft before finalization.",
          state: "abandoned",
          storageDeleted,
        }),
        now: input.now,
      });
      continue;
    }
    const assetId = session.assetId;
    const asset = await ctx.db.get(assetId);
    const attachments = await ctx.db
      .query("buildCollaborationAttachments")
      .withIndex("by_buildId_and_attachmentKind_and_attachmentId", (query) =>
        query
          .eq("buildId", input.authorization.build._id)
          .eq("attachmentKind", "collaborationAsset")
          .eq("attachmentId", assetId)
      )
      .take(1);
    if (asset && attachments.length === 0 && !asset.publishedAt) {
      await abandonUnpublishedAsset(ctx, input.authorization, {
        asset,
        now: input.now,
        reason: "Removed from its private draft before publication.",
        session,
      });
    } else {
      await ctx.db.patch(session._id, {
        state: "abandoned",
        updatedAt: input.now,
      });
    }
  }
}
