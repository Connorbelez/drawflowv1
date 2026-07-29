import { v } from "convex/values";

import { authenticatedQuery } from "./authz";
import { canReadCollaborationPost } from "./build_collaboration_access";
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
    if (!post || !(await canReadCollaborationPost(ctx, authorization, post))) {
      return null;
    }
    return { postId: post._id };
  })
  .public();
