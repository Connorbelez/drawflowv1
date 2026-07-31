import { v } from "convex/values";

import { authenticatedQuery } from "./authz";
import { canReadCollaborationPost } from "./build_collaboration_access";
import { collaborationFocusedPostContextValidator } from "./build_collaboration_contracts";
import { projectReadableBuildCollaborationPost } from "./build_collaboration_projection";
import { authorizeActiveBuildCollaborationAccess } from "./build_collaboration_rollout";

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
