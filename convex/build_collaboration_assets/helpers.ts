import { v } from "convex/values";

import { internal } from "../_generated/api";
import {
  type ActiveBuildAuthorization,
  selectActiveBuildAuthorizationCapacity,
} from "../activeBuildAccess";
import { authenticatedMutation, authenticatedQuery } from "../authz";
import {
  canReadCollaborationPost,
  resolveCurrentCollaborationPostReaderIds,
} from "../build_collaboration_access";
import { authorizeActiveBuildCollaborationPreparerAccess } from "../build_collaboration_actor";
import {
  canReadAssetStagingContext,
  canReadCollaborationAsset,
} from "../build_collaboration_asset_access";
import { canReadDrawCoordination } from "../build_draw_coordination";
import { authorizeActiveBuildCollaborationAccess } from "../build_collaboration_rollout";
import { buildCollaborationAssetStagingContextValidator } from "../build_collaboration_validators";
import { resolveCostDocumentDraftAccessForAuthorization } from "../cost_document_access";
import type { Doc, Id, MutationCtx, QueryCtx } from "../types";

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


export async function authorizeStagingContext(
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
    return { authorization: input.authorization, contextRecordId: undefined };
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
    return {
      authorization: input.authorization,
      contextRecordId: draft._id,
    };
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
    return {
      authorization: input.authorization,
      contextRecordId: post._id,
    };
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
  return {
    authorization: input.authorization,
    contextRecordId: actionItem._id,
  };
}

export async function authorizeCostDocumentDraftStagingContext(
  ctx: MutationCtx,
  authorization: ActiveBuildAuthorization,
  contextRecordId: string
) {
  const draftId = ctx.db.normalizeId("costDocumentDrafts", contextRecordId);
  if (!draftId) {
    throw new Error("The Cost Document draft is unavailable.");
  }
  const access = await resolveCostDocumentDraftAccessForAuthorization(ctx, {
    authorization,
    draftId,
  });
  if (!access) {
    throw new Error("The Cost Document draft is unavailable.");
  }
  const { batch, draft } = access;
  if (
    access.authorization.build._id !== authorization.build._id ||
    access.authorization.organizationId !== authorization.organizationId ||
    access.authorization.brokerage._id !== authorization.brokerage._id ||
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
  return {
    authorization: access.authorization,
    contextRecordId: draft._id,
  };
}

export async function requireOwnedOpenSession(
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
  const sessionAuthorization = selectActiveBuildAuthorizationCapacity(
    authorization,
    session.actorCapacity
  );
  const stagingContext = await authorizeStagingContext(ctx, {
    authorization: sessionAuthorization,
    contextKind: session.contextKind,
    contextRecordId: session.contextRecordId,
  });
  return { authorization: stagingContext.authorization, session };
}

export async function resolveVersionPlacement(
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

export async function assertStagingCapacity(
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

export async function stagingAudience(
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

export async function readablePost(
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

export async function canManageStagingSession(
  ctx: QueryCtx,
  authorization: ActiveBuildAuthorization,
  session: Doc<"buildCollaborationAssetStagingSessions">
) {
  if (session.contextKind === "costDocumentDraft") {
    if (
      session.ownerWorkosUserId !== authorization.viewer.subject ||
      !session.contextRecordId
    ) {
      return false;
    }
    const draftId = ctx.db.normalizeId(
      "costDocumentDrafts",
      session.contextRecordId
    );
    if (!draftId) {
      return false;
    }
    try {
      const access = await resolveCostDocumentDraftAccessForAuthorization(ctx, {
        authorization,
        draftId,
      });
      return Boolean(
        access &&
          access.authorization.build._id === authorization.build._id &&
          access.authorization.organizationId ===
            authorization.organizationId &&
          access.draft._id === draftId
      );
    } catch {
      return false;
    }
  }
  if (session.ownerWorkosUserId === authorization.viewer.subject) {
    return true;
  }
  if (
    authorization.viewer.actorKind !== "human" ||
    session.contextKind !== "draft" ||
    !session.contextRecordId
  ) {
    return false;
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

export async function canInspectAsset(
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
  // Cost Document assets have an exact-Draft/submitted-document audience. A
  // session-owner shortcut here would let a revoked collaborator retain status
  // visibility even after the grant is gone.
  if (session?.contextKind === "costDocumentDraft") {
    if (await canReadCollaborationAsset(ctx, { asset, authorization })) {
      return true;
    }
    const draftId = session.contextRecordId
      ? ctx.db.normalizeId("costDocumentDrafts", session.contextRecordId)
      : null;
    if (
      !draftId ||
      session.ownerWorkosUserId !== authorization.viewer.subject
    ) {
      return false;
    }
    // Status polling begins before a scan turns the asset into a readable
    // source page. The uploader may inspect that in-flight status only while
    // they still hold current exact-Draft edit access.
    return Boolean(
      await resolveCostDocumentDraftAccessForAuthorization(ctx, {
        authorization,
        draftId,
      })
    );
  }
  if (
    session?.ownerWorkosUserId === authorization.viewer.subject &&
    (await canReadAssetStagingContext(ctx, authorization, session))
  ) {
    return true;
  }
  return await canReadCollaborationAsset(ctx, { asset, authorization });
}

export function projectAssetStatus(asset: Doc<"buildCollaborationAssets">) {
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

export function canonicalMimeType(metadataType?: string, submittedType?: string) {
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

export function assertSourceCapturedAt(value: number | undefined, now: number) {
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

export function assertAssetSize(sizeBytes: number) {
  if (
    !Number.isSafeInteger(sizeBytes) ||
    sizeBytes <= 0 ||
    sizeBytes > MAX_ASSET_BYTES
  ) {
    throw new Error("Collaboration files must be between 1 byte and 100 MB.");
  }
}

export function boundedText(value: string, label: string, max: number) {
  const normalized = value.trim();
  if (!normalized || normalized.length > max) {
    throw new Error(`${label} must be between 1 and ${max} characters.`);
  }
  return normalized;
}

export async function recordAssetAudit(
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
    actorRole: authorization.effectiveRole.role,
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

export async function abandonUnpublishedAsset(
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

