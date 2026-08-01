import { v } from "convex/values";

import { authenticatedQuery } from "./authz";
import { canReadCollaborationPost } from "./build_collaboration_access";
import { canReadCollaborationAsset } from "./build_collaboration_asset_access";
import { collaborationFocusedPostContextValidator } from "./build_collaboration_contracts";
import { projectReadableBuildCollaborationPost } from "./build_collaboration_projection";
import { authorizeActiveBuildCollaborationAccess } from "./build_collaboration_rollout";
import type { Id, QueryCtx } from "./types";

export const getFocusedBuildActionItemContext = authenticatedQuery
  .input({
    actionItemId: v.string(),
    buildId: v.id("activeBuilds"),
    organizationId: v.string(),
  })
  .returns(
    v.union(
      v.null(),
      v.object({
        actionItemId: v.id("buildActionItems"),
        postId: v.id("buildCollaborationPosts"),
      })
    )
  )
  .handler(async (ctx, args) => {
    const authorization = await authorizeActiveBuildCollaborationAccess(
      ctx,
      args
    );
    const actionItemId = ctx.db.normalizeId(
      "buildActionItems",
      args.actionItemId
    );
    const item = actionItemId ? await ctx.db.get(actionItemId) : null;
    if (
      !item ||
      item.buildId !== authorization.build._id ||
      item.organizationId !== authorization.organizationId
    ) {
      return null;
    }
    const post = await ctx.db.get(item.originatingPostId);
    if (!(post && (await canReadCollaborationPost(ctx, authorization, post)))) {
      return null;
    }
    return { actionItemId: item._id, postId: post._id };
  })
  .public();

export const getFocusedBuildCollaborationAssetContext = authenticatedQuery
  .input({
    assetId: v.string(),
    buildId: v.id("activeBuilds"),
    organizationId: v.string(),
  })
  .returns(
    v.union(
      v.object({ state: v.literal("revoked") }),
      v.object({
        assetId: v.id("buildCollaborationAssets"),
        commentId: v.optional(v.id("buildCollaborationComments")),
        postId: v.id("buildCollaborationPosts"),
        state: v.literal("visible"),
      })
    )
  )
  .handler(async (ctx, args) => {
    const authorization = await authorizeActiveBuildCollaborationAccess(
      ctx,
      args
    );
    const assetId = ctx.db.normalizeId(
      "buildCollaborationAssets",
      args.assetId
    );
    const asset = assetId ? await ctx.db.get(assetId) : null;
    if (
      !asset ||
      asset.buildId !== authorization.build._id ||
      asset.organizationId !== authorization.organizationId ||
      !(await canReadCollaborationAsset(ctx, { asset, authorization }))
    ) {
      return { state: "revoked" as const };
    }
    const owner = await resolvePublishedAssetOwner(ctx, {
      assetId: asset._id,
      buildId: asset.buildId,
    });
    const postId = asset.originatingPostId ?? owner?.postId;
    const post = postId ? await ctx.db.get(postId) : null;
    if (!(post && (await canReadCollaborationPost(ctx, authorization, post)))) {
      return { state: "revoked" as const };
    }
    return {
      assetId: asset._id,
      commentId: owner?.commentId,
      postId: post._id,
      state: "visible" as const,
    };
  })
  .public();

export const getFocusedBuildCollaborationPostContext = authenticatedQuery
  .input({
    buildId: v.id("activeBuilds"),
    organizationId: v.string(),
    postId: v.string(),
  })
  .returns(collaborationFocusedPostContextValidator)
  .handler(async (ctx, args) => {
    const authorization = await authorizeActiveBuildCollaborationAccess(
      ctx,
      args
    );
    const postId = ctx.db.normalizeId("buildCollaborationPosts", args.postId);
    const post = postId ? await ctx.db.get(postId) : null;
    if (
      !post ||
      post.buildId !== authorization.build._id ||
      post.organizationId !== authorization.organizationId ||
      !(await canReadCollaborationPost(ctx, authorization, post))
    ) {
      return { state: "revoked" as const };
    }
    const entry = await projectReadableBuildCollaborationPost(ctx, {
      authorization,
      post,
      unavailableKey: `focused-unavailable-${post._id}`,
    });
    return entry.kind === "post"
      ? { entry, state: "visible" as const }
      : { state: "revoked" as const };
  })
  .public();

async function resolvePublishedAssetOwner(
  ctx: QueryCtx,
  input: {
    assetId: Id<"buildCollaborationAssets">;
    buildId: Id<"activeBuilds">;
  }
) {
  const attachment = await ctx.db
    .query("buildCollaborationAttachments")
    .withIndex("by_buildId_and_attachmentKind_and_attachmentId", (query) =>
      query
        .eq("buildId", input.buildId)
        .eq("attachmentKind", "collaborationAsset")
        .eq("attachmentId", input.assetId)
    )
    .first();
  if (!attachment) {
    return null;
  }
  switch (attachment.ownerKind) {
    case "postRevision": {
      const revisionId = ctx.db.normalizeId(
        "buildCollaborationPostRevisions",
        attachment.ownerRecordId
      );
      const revision = revisionId ? await ctx.db.get(revisionId) : null;
      return revision ? { postId: revision.postId } : null;
    }
    case "commentRevision": {
      const revisionId = ctx.db.normalizeId(
        "buildCollaborationCommentRevisions",
        attachment.ownerRecordId
      );
      const revision = revisionId ? await ctx.db.get(revisionId) : null;
      return revision
        ? { commentId: revision.commentId, postId: revision.postId }
        : null;
    }
    case "actionItem": {
      const actionItemId = ctx.db.normalizeId(
        "buildActionItems",
        attachment.ownerRecordId
      );
      const item = actionItemId ? await ctx.db.get(actionItemId) : null;
      return item ? { postId: item.originatingPostId } : null;
    }
    default:
      return null;
  }
}
