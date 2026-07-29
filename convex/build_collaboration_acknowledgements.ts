import { v } from "convex/values";
import { authorizeActiveBuildAccess } from "./activeBuildAccess";
import { authenticatedMutation } from "./authz";
import { canReadCollaborationPost } from "./build_collaboration_access";

export const acknowledgeBuildCollaborationPost = authenticatedMutation
  .input({
    buildId: v.id("activeBuilds"),
    organizationId: v.string(),
    postId: v.id("buildCollaborationPosts"),
  })
  .returns(v.id("buildCollaborationAcknowledgements"))
  .handler(async (ctx, args) => {
    const authorization = await authorizeActiveBuildAccess(ctx, args);
    const post = await ctx.db.get(args.postId);
    if (
      !post ||
      post.buildId !== authorization.build._id ||
      !(await canReadCollaborationPost(ctx, authorization, post))
    ) {
      throw new Error("Post not found.");
    }
    const target = await ctx.db
      .query("buildCollaborationAcknowledgementTargets")
      .withIndex("by_postId_and_workosUserId", (query) =>
        query
          .eq("postId", post._id)
          .eq("workosUserId", authorization.viewer.subject)
      )
      .first();
    if (!target || target.waivedAt) {
      throw new Error("No acknowledgement is required from you.");
    }
    const existing = await ctx.db
      .query("buildCollaborationAcknowledgements")
      .withIndex("by_postId_and_workosUserId", (query) =>
        query
          .eq("postId", post._id)
          .eq("workosUserId", authorization.viewer.subject)
      )
      .first();
    if (existing && existing.acknowledgedRevision >= post.revision) {
      return existing._id;
    }
    if (existing) {
      await ctx.db.patch(existing._id, {
        acknowledgedAt: Date.now(),
        acknowledgedRevision: post.revision,
        targetId: target._id,
      });
      return existing._id;
    }
    return await ctx.db.insert("buildCollaborationAcknowledgements", {
      acknowledgedAt: Date.now(),
      acknowledgedRevision: post.revision,
      brokerageId: authorization.brokerage._id,
      buildId: authorization.build._id,
      organizationId: authorization.organizationId,
      postId: post._id,
      targetId: target._id,
      workosUserId: authorization.viewer.subject,
    });
  })
  .public();
