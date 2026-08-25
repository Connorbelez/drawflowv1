import { v } from "convex/values";

import { internal } from "./_generated/api";
import {
  type ActiveBuildAuthorization,
  selectActiveBuildAuthorizationCapacity,
} from "./activeBuildAccess";
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
import { resolveCostDocumentDraftAccessForAuthorization } from "./cost_document_access";
import type { Doc, Id, MutationCtx, QueryCtx } from "./types";

import {
  authorizeStagingContext,
  authorizeCostDocumentDraftStagingContext,
  requireOwnedOpenSession,
  resolveVersionPlacement,
  assertStagingCapacity,
  stagingAudience,
  readablePost,
  canManageStagingSession,
  canInspectAsset,
  projectAssetStatus,
  canonicalMimeType,
  assertSourceCapturedAt,
  assertAssetSize,
  boundedText,
  recordAssetAudit,
  abandonUnpublishedAsset,
} from "./build_collaboration_assets/helpers";
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
    let authorization = await authorizeActiveBuildCollaborationPreparerAccess(
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
    const stagingContext = await authorizeStagingContext(ctx, {
      authorization,
      contextKind: args.contextKind,
      contextRecordId: args.contextRecordId,
    });
    authorization = stagingContext.authorization;
    const contextRecordId = stagingContext.contextRecordId;
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
        actorCapacity:
          args.contextKind === "costDocumentDraft"
            ? authorization.effectiveRole.role
            : undefined,
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
      let authorization = await authorizeActiveBuildCollaborationPreparerAccess(
        ctx,
        args
      );
      const now = Date.now();
      const openSession = await requireOwnedOpenSession(
        ctx,
        authorization,
        args.stagingSessionId,
        now
      );
      const { session } = openSession;
      authorization = openSession.authorization;
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
  let authorization = await authorizeActiveBuildCollaborationPreparerAccess(
    ctx,
    args
  );
  const now = Date.now();
  const openSession = await requireOwnedOpenSession(
    ctx,
    authorization,
    args.stagingSessionId,
    now
  );
  const { session } = openSession;
  authorization = openSession.authorization;
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
      const sessionAuthorization = session
        ? selectActiveBuildAuthorizationCapacity(
            authorization,
            session.actorCapacity
          )
        : authorization;
      const assetAuthorization = session
        ? (
            await authorizeStagingContext(ctx, {
              authorization: sessionAuthorization,
              contextKind: session.contextKind,
              contextRecordId: session.contextRecordId,
            })
          ).authorization
        : authorization;
      if (
        !(asset && session) ||
        asset.organizationId !== assetAuthorization.organizationId ||
        asset.buildId !== assetAuthorization.build._id ||
        asset.brokerageId !== assetAuthorization.brokerage._id ||
        asset.publishedAt ||
        !(await canManageStagingSession(ctx, assetAuthorization, session))
      ) {
        throw new Error("A staged collaboration asset is unavailable.");
      }
      const activeCostDocumentDraftPages = await ctx.db
        .query("costDocumentDraftPages")
        .withIndex("by_assetId_and_state", (query) =>
          query.eq("assetId", asset._id).eq("state", "active")
        )
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
      await abandonUnpublishedAsset(ctx, assetAuthorization, {
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

export async function abandonUnpublishedCostDocumentDraftAsset(
  ctx: MutationCtx,
  authorization: ActiveBuildAuthorization,
  input: {
    asset: Doc<"buildCollaborationAssets">;
    draftId: Id<"costDocumentDrafts">;
    now: number;
    reason: string;
    session: Doc<"buildCollaborationAssetStagingSessions">;
  }
) {
  const access = await resolveCostDocumentDraftAccessForAuthorization(ctx, {
    authorization,
    draftId: input.draftId,
  });
  if (!access) {
    throw new Error("The Cost Document draft asset cannot be abandoned.");
  }
  if (
    input.session.contextKind !== "costDocumentDraft" ||
    input.asset.publishedAt ||
    input.asset.stagingSessionId !== input.session._id ||
    input.asset.organizationId !== access.authorization.organizationId ||
    input.asset.brokerageId !== access.authorization.brokerage._id ||
    input.asset.buildId !== access.authorization.build._id ||
    input.session.contextRecordId !== String(access.draft._id) ||
    input.session.organizationId !== access.authorization.organizationId ||
    input.session.brokerageId !== access.authorization.brokerage._id ||
    input.session.buildId !== access.authorization.build._id ||
    access.authorization.viewer.subject !== authorization.viewer.subject
  ) {
    throw new Error("The Cost Document draft asset cannot be abandoned.");
  }
  await abandonUnpublishedAsset(ctx, access.authorization, input);
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
