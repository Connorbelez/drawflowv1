import { v } from "convex/values";

import type { ActiveBuildAuthorization } from "./activeBuildAccess";
import type { AuthorizedViewer } from "./authz";
import { authenticatedMutation } from "./authz";
import { canReadCollaborationPost } from "./build_collaboration_access";
import { buildFullBuildCollaborationArchive } from "./build_collaboration_archive";
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
const TRAILING_SLASH_PATTERN = /\/$/;

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

const exportAssetAuthorizationValidator = v.object({
  expiresAt: v.number(),
  fileName: v.string(),
  mimeType: v.string(),
  storageId: v.id("_storage"),
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
    const { authorization, manifest, now, row } = await requireAuthorizedExport(
      ctx,
      args
    );
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
      assets.push({
        assetId: asset._id,
        fileName: asset.fileName,
        mimeType: asset.mimeType,
        sizeBytes: asset.sizeBytes,
        url: buildExportAssetDownloadUrl({
          assetId: asset._id,
          buildId: authorization.build._id,
          exportId: row._id,
          organizationId: authorization.organizationId,
          token: args.token,
        }),
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

export const authorizeBuildCollaborationExportAssetDownload =
  authenticatedMutation
    .input({
      assetId: v.id("buildCollaborationAssets"),
      buildId: v.id("activeBuilds"),
      exportId: v.id("buildCollaborationExports"),
      organizationId: v.string(),
      token: v.string(),
    })
    .returns(exportAssetAuthorizationValidator)
    .handler(async (ctx, args) => {
      const { authorization, manifest, now, row } =
        await requireAuthorizedExport(ctx, args);
      if (!(manifest.assetIds ?? []).includes(args.assetId)) {
        throw new Error("The asset is not part of this collaboration export.");
      }
      const asset = await ctx.db.get(args.assetId);
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
      await ctx.db.patch(row._id, {
        accessCount: row.accessCount + 1,
        lastAccessedAt: now,
      });
      return {
        expiresAt: row.expiresAt,
        fileName: asset.fileName,
        mimeType: asset.mimeType,
        storageId: asset.storageId,
      };
    })
    .public();

async function requireAuthorizedExport(
  ctx: MutationCtx & { viewer: AuthorizedViewer },
  args: {
    buildId: Id<"activeBuilds">;
    exportId: Id<"buildCollaborationExports">;
    organizationId: string;
    token: string;
  }
) {
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
  assertCurrentExportScope(authorization, row.scope);
  const manifest = JSON.parse(row.manifestJson) as {
    assetIds?: Id<"buildCollaborationAssets">[];
    posts?: { postId: Id<"buildCollaborationPosts"> }[];
  };
  return { authorization, manifest, now, row };
}

function assertCurrentExportScope(
  authorization: ActiveBuildAuthorization,
  storedScope: Doc<"buildCollaborationExports">["scope"]
) {
  let currentScope: Doc<"buildCollaborationExports">["scope"];
  try {
    currentScope = resolveExportScope(
      authorization,
      storedScope === "full_archive" || storedScope === "authorized_build"
        ? "build"
        : storedScope
    );
  } catch {
    throw new Error(
      "Collaboration export scope changed; request a new authorized export."
    );
  }
  const stillAllowed =
    currentScope === storedScope ||
    (storedScope === "authorized_build" && currentScope === "full_archive");
  if (!stillAllowed) {
    throw new Error(
      "Collaboration export scope changed; request a new authorized export."
    );
  }
}

function buildExportAssetDownloadUrl(input: {
  assetId: Id<"buildCollaborationAssets">;
  buildId: Id<"activeBuilds">;
  exportId: Id<"buildCollaborationExports">;
  organizationId: string;
  token: string;
}) {
  const query = new URLSearchParams({
    assetId: input.assetId,
    buildId: input.buildId,
    exportId: input.exportId,
    organizationId: input.organizationId,
    token: input.token,
  });
  const path = `/api/build-collaboration/export-asset?${query.toString()}`;
  const siteUrl = process.env.CONVEX_SITE_URL?.replace(
    TRAILING_SLASH_PATTERN,
    ""
  );
  return siteUrl ? `${siteUrl}${path}` : path;
}

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
  const posts = await buildExportedPosts(ctx, selectedPosts);
  const actionItems = await buildExportedActionItems(ctx, selectedPosts);
  const assets = await selectExportAssets(ctx, {
    ...input,
    postIds,
  });
  const participant = input.authorization.participants.find(
    (candidate) => candidate.workosUserId === input.authorization.viewer.subject
  );
  const fullArchive =
    input.scope === "full_archive"
      ? await buildFullBuildCollaborationArchive(ctx, {
          authorization: input.authorization,
          posts: selectedPosts,
        })
      : undefined;
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
    fullArchive,
    posts,
    scope: input.scope,
  };
  const aclSnapshot = await buildExportAclSnapshot(ctx, {
    assets,
    authorization: input.authorization,
    generatedAt: input.generatedAt,
    manifestAssetIds: manifest.assetIds,
    participantPeriod: participant?.participationPeriod,
    posts: selectedPosts,
    scope: input.scope,
  });
  return {
    aclSnapshot,
    manifest,
    recordCount: posts.length + actionItems.length + assets.length,
  };
}

async function buildExportedPosts(
  ctx: MutationCtx,
  selectedPosts: Doc<"buildCollaborationPosts">[]
) {
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
  return posts;
}

async function buildExportedActionItems(
  ctx: MutationCtx,
  selectedPosts: Doc<"buildCollaborationPosts">[]
) {
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
  return actionItems;
}

async function buildExportAclSnapshot(
  ctx: MutationCtx,
  input: {
    assets: Doc<"buildCollaborationAssets">[];
    authorization: ActiveBuildAuthorization;
    generatedAt: number;
    manifestAssetIds: Id<"buildCollaborationAssets">[];
    participantPeriod?: number;
    posts: Doc<"buildCollaborationPosts">[];
    scope: Doc<"buildCollaborationExports">["scope"];
  }
) {
  return {
    assetIds: input.manifestAssetIds,
    effectiveRole: input.authorization.effectiveRole.role,
    generatedAt: input.generatedAt,
    organizationId: input.authorization.organizationId,
    participantPeriod: input.participantPeriod,
    assetDecisions: input.assets.map((asset) => ({
      assetId: asset._id,
      basis: asset.readerWorkosUserIds?.includes(
        input.authorization.viewer.subject
      )
        ? "published_reader_snapshot"
        : "originating_post_acl",
      maximumAudienceMode: asset.maximumAudienceMode,
      originatingPostId: asset.originatingPostId,
      readerSnapshotIncludedViewer: Boolean(
        asset.readerWorkosUserIds?.includes(input.authorization.viewer.subject)
      ),
    })),
    postDecisions: await Promise.all(
      input.posts.map(async (post) => {
        const customMembership =
          post.audienceMode === "custom"
            ? await ctx.db
                .query("buildCollaborationAudienceMembers")
                .withIndex("by_postId_and_workosUserId", (query) =>
                  query
                    .eq("postId", post._id)
                    .eq("workosUserId", input.authorization.viewer.subject)
                )
                .unique()
            : null;
        const roleTierAuthorized =
          input.authorization.effectiveRole.tier >= post.audienceFloorTier;
        return {
          audienceFloorTier: post.audienceFloorTier,
          audienceMode: post.audienceMode,
          basis: roleTierAuthorized
            ? "role_tier"
            : post.audienceMode === "build_wide"
              ? "build_wide"
              : "custom_audience_membership",
          customAudienceMembershipId: customMembership?._id,
          customAudienceAddedAt: customMembership?.createdAt,
          customAudienceAddedByWorkosUserId:
            customMembership?.addedByWorkosUserId,
          decision: "authorized",
          postId: post._id,
          viewerRoleTier: input.authorization.effectiveRole.tier,
        };
      })
    ),
    roles: input.authorization.roles,
    scope: input.scope,
    viewerWorkosUserId: input.authorization.viewer.subject,
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
