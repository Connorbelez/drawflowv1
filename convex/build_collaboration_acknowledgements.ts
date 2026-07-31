import { v } from "convex/values";
import { authenticatedMutation } from "./authz";
import {
  canReadCollaborationPost,
  resolveCurrentCollaborationNotificationReaderIds,
} from "./build_collaboration_access";
import { authorizeActiveBuildHumanCollaborationAccess } from "./build_collaboration_actor";
import { emitCanonicalBuildCollaborationNotification } from "./build_collaboration_notifications";
import type { Id } from "./types";

export const acknowledgeBuildCollaborationPost = authenticatedMutation
  .input({
    buildId: v.id("activeBuilds"),
    organizationId: v.string(),
    postId: v.id("buildCollaborationPosts"),
  })
  .returns(v.id("buildCollaborationAcknowledgements"))
  .handler(async (ctx, args) => {
    const authorization = await authorizeActiveBuildHumanCollaborationAccess(
      ctx,
      args
    );
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
    const now = Date.now();
    let acknowledgementId: Id<"buildCollaborationAcknowledgements">;
    if (existing) {
      await ctx.db.patch(existing._id, {
        acknowledgedAt: now,
        acknowledgedRevision: post.revision,
        targetId: target._id,
      });
      acknowledgementId = existing._id;
    } else {
      acknowledgementId = await ctx.db.insert(
        "buildCollaborationAcknowledgements",
        {
          acknowledgedAt: now,
          acknowledgedRevision: post.revision,
          brokerageId: authorization.brokerage._id,
          buildId: authorization.build._id,
          organizationId: authorization.organizationId,
          postId: post._id,
          targetId: target._id,
          workosUserId: authorization.viewer.subject,
        }
      );
    }
    const readerIds = await resolveCurrentCollaborationNotificationReaderIds(
      ctx,
      authorization,
      post
    );
    if (post.authorWorkosUserId) {
      await emitCanonicalBuildCollaborationNotification(ctx, {
        actionLabel: "Open thread",
        authorization,
        body: `${authorization.viewer.email ?? authorization.viewer.subject} acknowledged the thread.`,
        dedupeKey: `build-collaboration:acknowledgement:${acknowledgementId}:revision:${post.revision}:${post.authorWorkosUserId}`,
        entityId: post._id,
        entityType: "buildCollaborationPost",
        href: `/backoffice/builds/${authorization.build._id}?tab=details&collaborationPost=${post._id}`,
        kind: "acknowledgement_received",
        now,
        postId: post._id,
        readerIds,
        recipientWorkosUserId: post.authorWorkosUserId,
        title: "Thread acknowledged",
      });
    }
    return acknowledgementId;
  })
  .public();
