import { v } from "convex/values";

import type { ActiveBuildAuthorization } from "./activeBuildAccess";
import { authenticatedMutation } from "./authz";
import { canReadCollaborationPost } from "./build_collaboration_access";
import {
  canReadCollaborationAsset,
  isCleanCollaborationAsset,
} from "./build_collaboration_asset_access";
import { requireHumanCollaborationActor } from "./build_collaboration_human";
import { authorizeActiveBuildCollaborationAccess } from "./build_collaboration_rollout";
import type { Doc, Id, MutationCtx } from "./types";

const EXPORT_TTL_MS = 15 * 60_000;
const EXPORT_BURST_WINDOW_MS = 60 * 60_000;
const EXPORT_BURST_WARNING_COUNT = 10;
const EXPORT_BURST_LIMIT = 20;
const MAX_EXPORT_POSTS = 2000;
const MAX_EXPORT_ASSETS = 2000;

const requestedScopeValidator = v.union(
  v.literal("build"),
  v.literal("thread"),
  v.literal("asset")
);

const exportScopeValidator = v.union(
  v.literal("full_archive"),
  v.literal("authorized_build"),
  v.literal("thread"),
  v.literal("asset")
);

const exportRequestResultValidator = v.object({
  expiresAt: v.number(),
  exportId: v.id("buildCollaborationExports"),
  scope: exportScopeValidator,
  token: v.string(),
});

const exportDownloadValidator = v.object({
  aclSnapshotJson: v.string(),
  assets: v.array(
    v.object({
      assetId: v.id("buildCollaborationAssets"),
      fileName: v.string(),
      mimeType: v.string(),
      sizeBytes: v.number(),
      url: v.string(),
      version: v.number(),
    })
  ),
  expiresAt: v.number(),
  manifestJson: v.string(),
  scope: exportScopeValidator,
});

export const requestBuildCollaborationExport = authenticatedMutation
  .input({
    assetId: v.optional(v.id("buildCollaborationAssets")),
    buildId: v.id("activeBuilds"),
    organizationId: v.string(),
    postId: v.optional(v.id("buildCollaborationPosts")),
    scope: requestedScopeValidator,
  })
  .returns(exportRequestResultValidator)
  .handler(async (ctx, args) => {
    const authorization = await authorizeActiveBuildCollaborationAccess(
      ctx,
      args
    );
    await requireHumanCollaborationActor(ctx, authorization);
    const scope = resolveExportScope(authorization, args.scope);
    validateScopeTarget(args);
    await enforceExportBurstLimit(ctx, authorization);

    const generatedAt = Date.now();
    const snapshot = await buildExportSnapshot(ctx, {
      assetId: args.assetId,
      authorization,
      generatedAt,
      postId: args.postId,
      scope,
    });
    const token = `${crypto.randomUUID()}-${crypto.randomUUID()}`;
    const tokenHash = await sha256Hex(token);
    const expiresAt = generatedAt + EXPORT_TTL_MS;
    const exportId = await ctx.db.insert("buildCollaborationExports", {
      accessCount: 0,
      aclSnapshotJson: JSON.stringify(snapshot.aclSnapshot),
      assetId: args.assetId,
      brokerageId: authorization.brokerage._id,
      buildId: authorization.build._id,
      createdAt: generatedAt,
      expiresAt,
      manifestJson: JSON.stringify(snapshot.manifest),
      organizationId: authorization.organizationId,
      postId: args.postId,
      recordCount: snapshot.recordCount,
      requestedByRole: authorization.effectiveRole.role,
      requestedByWorkosUserId: authorization.viewer.subject,
      scope,
      state: "active",
      tokenHash,
    });
    const auditState = JSON.stringify({
      expiresAt,
      recordCount: snapshot.recordCount,
      scope,
    });
    await ctx.db.insert("auditEvents", {
      actorRoles: authorization.roles,
      actorWorkosUserId: authorization.viewer.subject,
      brokerageId: authorization.brokerage._id,
      command: "requestBuildCollaborationExport",
      createdAt: generatedAt,
      entityId: exportId,
      entityType: "buildCollaborationExport",
      eventType: "build.collaboration.export.created",
      newState: auditState,
      organizationId: authorization.organizationId,
      warnings: [],
    });
    await ctx.db.insert("eventOutbox", {
      brokerageId: authorization.brokerage._id,
      createdAt: generatedAt,
      eventType: "build.collaboration.export.created",
      organizationId: authorization.organizationId,
      payloadPreview: auditState,
      relatedEntityId: exportId,
      relatedEntityType: "buildCollaborationExport",
      status: "pending",
    });
    return { expiresAt, exportId, scope, token };
  })
  .public();

export const downloadBuildCollaborationExport = authenticatedMutation
  .input({
    buildId: v.id("activeBuilds"),
    exportId: v.id("buildCollaborationExports"),
    organizationId: v.string(),
    token: v.string(),
  })
  .returns(exportDownloadValidator)
  .handler(async (ctx, args) => {
    const authorization = await authorizeActiveBuildCollaborationAccess(
      ctx,
      args
    );
    await requireHumanCollaborationActor(ctx, authorization);
    const row = await ctx.db.get(args.exportId);
    if (
      !row ||
      row.organizationId !== authorization.organizationId ||
      row.brokerageId !== authorization.brokerage._id ||
      row.buildId !== authorization.build._id ||
      row.requestedByWorkosUserId !== authorization.viewer.subject ||
      row.tokenHash !== (await sha256Hex(args.token))
    ) {
      throw new Error("Collaboration export link is invalid or unavailable.");
    }
    const now = Date.now();
    if (row.state !== "active" || row.expiresAt <= now) {
      throw new Error("Collaboration export link has expired.");
    }

    const manifest = JSON.parse(row.manifestJson) as {
      assetIds?: Id<"buildCollaborationAssets">[];
      posts?: { postId: Id<"buildCollaborationPosts"> }[];
    };
    for (const exportedPost of manifest.posts ?? []) {
      const post = await ctx.db.get(exportedPost.postId);
      if (
        !(post && (await canReadCollaborationPost(ctx, authorization, post)))
      ) {
        throw new Error(
          "Collaboration export access changed; request a new authorized export."
        );
      }
    }
    const assets: {
      assetId: Id<"buildCollaborationAssets">;
      fileName: string;
      mimeType: string;
      sizeBytes: number;
      url: string;
      version: number;
    }[] = [];
    for (const assetId of manifest.assetIds ?? []) {
      const asset = await ctx.db.get(assetId);
      if (
        !(
          asset &&
          (await canReadCollaborationAsset(ctx, { asset, authorization }))
        )
      ) {
        throw new Error(
          "Collaboration export access changed; request a new authorized export."
        );
      }
      const url = await ctx.storage.getUrl(asset.storageId);
      if (!url) {
        throw new Error("An exported collaboration asset is unavailable.");
      }
      assets.push({
        assetId: asset._id,
        fileName: asset.fileName,
        mimeType: asset.mimeType,
        sizeBytes: asset.sizeBytes,
        url,
        version: asset.version,
      });
    }
    await ctx.db.patch(row._id, {
      accessCount: row.accessCount + 1,
      lastAccessedAt: now,
    });
    return {
      aclSnapshotJson: row.aclSnapshotJson,
      assets,
      expiresAt: row.expiresAt,
      manifestJson: row.manifestJson,
      scope: row.scope,
    };
  })
  .public();

function resolveExportScope(
  authorization: ActiveBuildAuthorization,
  requestedScope: "asset" | "build" | "thread"
): Doc<"buildCollaborationExports">["scope"] {
  const role = authorization.effectiveRole.role;
  if (requestedScope === "build") {
    if (role === "admin" || role === "principle-broker") {
      return "full_archive";
    }
    if (role === "broker" || role === "builder" || role === "broker-staff") {
      return "authorized_build";
    }
    throw new Error("Your role may export only an individual visible record.");
  }
  if (role === "contractor" && requestedScope !== "asset") {
    throw new Error("Contractors may export only contractor-visible assets.");
  }
  return requestedScope;
}

function validateScopeTarget(input: {
  assetId?: Id<"buildCollaborationAssets">;
  postId?: Id<"buildCollaborationPosts">;
  scope: "asset" | "build" | "thread";
}) {
  if (
    (input.scope === "build" && (input.assetId || input.postId)) ||
    (input.scope === "thread" && (!input.postId || input.assetId)) ||
    (input.scope === "asset" && (!input.assetId || input.postId))
  ) {
    throw new Error("The export target does not match the requested scope.");
  }
}

async function buildExportSnapshot(
  ctx: MutationCtx,
  input: {
    assetId?: Id<"buildCollaborationAssets">;
    authorization: ActiveBuildAuthorization;
    generatedAt: number;
    postId?: Id<"buildCollaborationPosts">;
    scope: Doc<"buildCollaborationExports">["scope"];
  }
) {
  const selectedPosts = await selectExportPosts(ctx, input);
  const postIds = new Set(selectedPosts.map((post) => post._id));
  const posts: Record<string, unknown>[] = [];
  for (const post of selectedPosts) {
    const revision = post.currentRevisionId
      ? await ctx.db.get(post.currentRevisionId)
      : null;
    if (!revision || revision.postId !== post._id) {
      throw new Error("A collaboration post is missing its current revision.");
    }
    const comments = await ctx.db
      .query("buildCollaborationComments")
      .withIndex("by_postId_and_createdAt", (query) =>
        query.eq("postId", post._id)
      )
      .take(2001);
    if (comments.length > 2000) {
      throw new Error("A thread exceeds the 2,000-comment export limit.");
    }
    const exportedComments: Record<string, unknown>[] = [];
    for (const comment of comments) {
      const commentRevision = comment.currentRevisionId
        ? await ctx.db.get(comment.currentRevisionId)
        : null;
      if (!commentRevision || commentRevision.commentId !== comment._id) {
        continue;
      }
      exportedComments.push({
        authorDisplayName: comment.authorDisplayNameSnapshot,
        authorRole: comment.authorRole,
        commentId: comment._id,
        contentState: comment.contentState,
        createdAt: comment.createdAt,
        parentCommentId: comment.parentCommentId,
        plainText: commentRevision.plainText,
        revision: comment.revision,
        tiptapJson: commentRevision.tiptapJson,
      });
    }
    posts.push({
      audienceFloorTier: post.audienceFloorTier,
      audienceMode: post.audienceMode,
      authorDisplayName: post.authorDisplayNameSnapshot,
      authorRole: post.authorRole,
      comments: exportedComments,
      contentState: post.contentState,
      createdAt: post.createdAt,
      plainText: revision.plainText,
      postId: post._id,
      postType: post.postType,
      revision: post.revision,
      threadState: post.threadState,
      tiptapJson: revision.tiptapJson,
    });
  }
  const assets = await selectExportAssets(ctx, {
    ...input,
    postIds,
  });
  const actionItems: Record<string, unknown>[] = [];
  for (const post of selectedPosts) {
    const rows = await ctx.db
      .query("buildActionItems")
      .withIndex("by_originatingPostId_and_queueSortAt", (query) =>
        query.eq("originatingPostId", post._id)
      )
      .take(2001);
    if (rows.length > 2000) {
      throw new Error("A thread exceeds the 2,000-Action-Item export limit.");
    }
    actionItems.push(
      ...rows.map((item) => ({
        actionItemId: item._id,
        assigneeWorkosUserId: item.assigneeWorkosUserId,
        createdAt: item.createdAt,
        descriptionPlainText: item.descriptionPlainText,
        originatingPostId: item.originatingPostId,
        priority: item.priority,
        status: item.status,
        title: item.title,
      }))
    );
  }
  const participant = input.authorization.participants.find(
    (candidate) => candidate.workosUserId === input.authorization.viewer.subject
  );
  const manifest = {
    actionItems,
    assetIds: assets.map((asset) => asset._id),
    assets: assets.map((asset) => ({
      assetId: asset._id,
      fileName: asset.fileName,
      mimeType: asset.mimeType,
      sizeBytes: asset.sizeBytes,
      version: asset.version,
    })),
    build: {
      buildId: input.authorization.build._id,
      buildName: input.authorization.build.buildName,
    },
    exportedAt: input.generatedAt,
    posts,
    scope: input.scope,
  };
  const aclSnapshot = {
    assetIds: manifest.assetIds,
    effectiveRole: input.authorization.effectiveRole.role,
    generatedAt: input.generatedAt,
    organizationId: input.authorization.organizationId,
    participantPeriod: participant?.participationPeriod,
    postDecisions: selectedPosts.map((post) => ({
      audienceFloorTier: post.audienceFloorTier,
      audienceMode: post.audienceMode,
      decision: "authorized",
      postId: post._id,
    })),
    roles: input.authorization.roles,
    scope: input.scope,
    viewerWorkosUserId: input.authorization.viewer.subject,
  };
  return {
    aclSnapshot,
    manifest,
    recordCount: posts.length + actionItems.length + assets.length,
  };
}

async function selectExportPosts(
  ctx: MutationCtx,
  input: {
    authorization: ActiveBuildAuthorization;
    postId?: Id<"buildCollaborationPosts">;
    scope: Doc<"buildCollaborationExports">["scope"];
  }
) {
  if (input.scope === "asset") {
    return [];
  }
  const candidates = input.postId
    ? [await ctx.db.get(input.postId)].filter(
        (post): post is Doc<"buildCollaborationPosts"> => Boolean(post)
      )
    : await ctx.db
        .query("buildCollaborationPosts")
        .withIndex("by_buildId_and_createdAt", (query) =>
          query.eq("buildId", input.authorization.build._id)
        )
        .take(MAX_EXPORT_POSTS + 1);
  if (candidates.length > MAX_EXPORT_POSTS) {
    throw new Error(`Build export exceeds ${MAX_EXPORT_POSTS} posts.`);
  }
  const readable: Doc<"buildCollaborationPosts">[] = [];
  for (const post of candidates) {
    if (await canReadCollaborationPost(ctx, input.authorization, post)) {
      readable.push(post);
    }
  }
  if (input.postId && readable.length !== 1) {
    throw new Error("The requested collaboration thread is unavailable.");
  }
  return readable;
}

async function selectExportAssets(
  ctx: MutationCtx,
  input: {
    assetId?: Id<"buildCollaborationAssets">;
    authorization: ActiveBuildAuthorization;
    postIds: Set<Id<"buildCollaborationPosts">>;
    scope: Doc<"buildCollaborationExports">["scope"];
  }
) {
  if (input.scope === "asset") {
    const asset = input.assetId ? await ctx.db.get(input.assetId) : null;
    if (
      !(
        asset &&
        (await canReadCollaborationAsset(ctx, {
          asset,
          authorization: input.authorization,
        }))
      )
    ) {
      throw new Error("The requested collaboration asset is unavailable.");
    }
    return [asset];
  }
  const candidates = (
    await Promise.all(
      ["available", "superseded"].map((state) =>
        ctx.db
          .query("buildCollaborationAssets")
          .withIndex("by_buildId_and_state_and_createdAt", (query) =>
            query
              .eq("buildId", input.authorization.build._id)
              .eq("state", state as "available" | "superseded")
          )
          .take(MAX_EXPORT_ASSETS + 1)
      )
    )
  ).flat();
  if (candidates.length > MAX_EXPORT_ASSETS) {
    throw new Error(`Build export exceeds ${MAX_EXPORT_ASSETS} assets.`);
  }
  const readable: Doc<"buildCollaborationAssets">[] = [];
  for (const asset of candidates) {
    if (
      isCleanCollaborationAsset(asset) &&
      asset.originatingPostId &&
      input.postIds.has(asset.originatingPostId) &&
      (await canReadCollaborationAsset(ctx, {
        asset,
        authorization: input.authorization,
      }))
    ) {
      readable.push(asset);
    }
  }
  return readable;
}

async function enforceExportBurstLimit(
  ctx: MutationCtx,
  authorization: ActiveBuildAuthorization
) {
  const now = Date.now();
  const recent = (
    await ctx.db
      .query("buildCollaborationExports")
      .withIndex(
        "by_organizationId_and_requestedByWorkosUserId_and_createdAt",
        (query) =>
          query
            .eq("organizationId", authorization.organizationId)
            .eq("requestedByWorkosUserId", authorization.viewer.subject)
      )
      .order("desc")
      .take(EXPORT_BURST_LIMIT + 1)
  ).filter((row) => row.createdAt >= now - EXPORT_BURST_WINDOW_MS);
  if (recent.length >= EXPORT_BURST_LIMIT) {
    throw new Error(
      "Export rate limit reached. Try again after the one-hour window resets."
    );
  }
  if (recent.length + 1 === EXPORT_BURST_WARNING_COUNT) {
    await ctx.db.insert("eventOutbox", {
      brokerageId: authorization.brokerage._id,
      createdAt: now,
      eventType: "build.collaboration.export.burst_detected",
      organizationId: authorization.organizationId,
      payloadPreview: JSON.stringify({
        count: recent.length + 1,
        windowMs: EXPORT_BURST_WINDOW_MS,
      }),
      relatedEntityId: authorization.build._id,
      relatedEntityType: "activeBuild",
      status: "pending",
    });
  }
}

async function sha256Hex(value: string) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value)
  );
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0")
  ).join("");
}
