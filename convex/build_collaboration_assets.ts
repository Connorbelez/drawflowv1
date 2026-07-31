import { v } from "convex/values";

import { internal } from "./_generated/api";
import type { ActiveBuildAuthorization } from "./activeBuildAccess";
import { authenticatedMutation, authenticatedQuery } from "./authz";
import {
  canReadCollaborationPost,
  resolveCurrentCollaborationPostReaderIds,
} from "./build_collaboration_access";
import { authorizeActiveBuildHumanCollaborationAccess } from "./build_collaboration_actor";
import { canReadCollaborationAsset } from "./build_collaboration_asset_access";
import { authorizeActiveBuildCollaborationAccess } from "./build_collaboration_rollout";
import { buildCollaborationAssetStagingContextValidator } from "./build_collaboration_validators";
import type { Doc, Id, MutationCtx, QueryCtx } from "./types";

const MAX_ASSET_BYTES = 100 * 1024 * 1024;
const MAX_ASSETS_PER_REQUEST = 100;
const STAGING_SESSION_TTL_MS = 24 * 60 * 60 * 1000;
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
    organizationId: v.string(),
  })
  .returns(
    v.object({
      expiresAt: v.number(),
      stagingSessionId: v.id("buildCollaborationAssetStagingSessions"),
      uploadUrl: v.string(),
    })
  )
  .handler(async (ctx, args) => {
    const authorization = await authorizeActiveBuildHumanCollaborationAccess(
      ctx,
      args
    );
    const contextRecordId = await authorizeStagingContext(ctx, {
      authorization,
      contextKind: args.contextKind,
      contextRecordId: args.contextRecordId,
    });
    const now = Date.now();
    const expiresAt = now + STAGING_SESSION_TTL_MS;
    const stagingSessionId = await ctx.db.insert(
      "buildCollaborationAssetStagingSessions",
      {
        brokerageId: authorization.brokerage._id,
        buildId: authorization.build._id,
        contextKind: args.contextKind,
        contextRecordId,
        createdAt: now,
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
      newState: JSON.stringify({ contextKind: args.contextKind, expiresAt }),
      now,
    });
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
  const authorization = await authorizeActiveBuildHumanCollaborationAccess(
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
  if (metadata.size <= 0 || metadata.size > MAX_ASSET_BYTES) {
    throw new Error("Collaboration files must be between 1 byte and 100 MB.");
  }
  const existingStorage = await ctx.db
    .query("buildCollaborationAssets")
    .withIndex("by_storageId", (query) => query.eq("storageId", args.storageId))
    .unique();
  if (existingStorage) {
    throw new Error("This upload has already been finalized.");
  }
  const fileName = boundedText(args.fileName, "File name", 240);
  const mimeType = canonicalMimeType(metadata.contentType, args.mimeType);
  const contentHashSha256 = args.contentHashSha256.trim().toLowerCase();
  if (!SHA256_PATTERN.test(contentHashSha256)) {
    throw new Error("A valid SHA-256 content hash is required.");
  }
  const supersededAsset = args.supersedesAssetId
    ? await requireVersionSource(ctx, authorization, args.supersedesAssetId)
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
    organizationId: authorization.organizationId,
    readerWorkosUserIds,
    scanState: "pending",
    sizeBytes: metadata.size,
    stagingSessionId: session._id,
    state: "quarantined",
    storageId: args.storageId,
    supersedesAssetId: supersededAsset?._id,
    updatedAt: now,
    uploadedByWorkosUserId: authorization.viewer.subject,
    version: supersededAsset ? supersededAsset.version + 1 : 1,
  });
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
      version: supersededAsset ? supersededAsset.version + 1 : 1,
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
    const authorization = await authorizeActiveBuildHumanCollaborationAccess(
      ctx,
      args
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

async function authorizeStagingContext(
  ctx: MutationCtx,
  input: {
    authorization: ActiveBuildAuthorization;
    contextKind: "composer" | "draft" | "post" | "actionItem";
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
      draft.ownerWorkosUserId !== input.authorization.viewer.subject ||
      (draft.state !== "active" && draft.state !== "scheduled")
    ) {
      throw new Error("The collaboration draft is unavailable.");
    }
    return draft._id;
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
    session.ownerWorkosUserId !== authorization.viewer.subject ||
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

async function requireVersionSource(
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
    (asset.state !== "available" && asset.state !== "superseded") ||
    !(await canReadCollaborationAsset(ctx, { asset, authorization }))
  ) {
    throw new Error("The prior asset version is unavailable.");
  }
  return asset;
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
    !(await canReadCollaborationPost(ctx, authorization, post))
  ) {
    throw new Error("The collaboration post is unavailable.");
  }
  return post;
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
  if (session?.ownerWorkosUserId === authorization.viewer.subject) {
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
  const sessions = await ctx.db
    .query("buildCollaborationAssetStagingSessions")
    .withIndex("by_contextKind_and_contextRecordId_and_state", (query) =>
      query
        .eq("contextKind", "draft")
        .eq("contextRecordId", input.draftId)
        .eq("state", "finalized")
    )
    .take(100);
  for (const session of sessions) {
    if (
      session.organizationId !== input.authorization.organizationId ||
      session.buildId !== input.authorization.build._id ||
      !session.assetId ||
      retained.has(session.assetId)
    ) {
      continue;
    }
    const assetId = session.assetId;
    const attachments = await ctx.db
      .query("buildCollaborationAttachments")
      .withIndex("by_buildId_and_attachmentKind_and_attachmentId", (query) =>
        query
          .eq("buildId", input.authorization.build._id)
          .eq("attachmentKind", "collaborationAsset")
          .eq("attachmentId", assetId)
      )
      .take(1);
    await ctx.db.patch(session._id, {
      state: "abandoned",
      updatedAt: input.now,
    });
    if (attachments.length === 0) {
      await ctx.db.patch(assetId, {
        scanMessage: "Removed from its private draft before publication.",
        state: "rejected",
        updatedAt: input.now,
      });
      await ctx.db.insert("auditEvents", {
        actorRoles: input.authorization.roles,
        actorWorkosUserId: input.authorization.viewer.subject,
        brokerageId: input.authorization.brokerage._id,
        command: "reconcileDraftAssetStagingSessions",
        createdAt: input.now,
        entityId: assetId,
        entityType: "buildCollaborationAsset",
        eventType: "build.collaboration.asset.abandoned",
        newState: JSON.stringify({
          draftId: input.draftId,
          state: "rejected",
        }),
        organizationId: input.authorization.organizationId,
        warnings: [],
      });
    }
  }
}
