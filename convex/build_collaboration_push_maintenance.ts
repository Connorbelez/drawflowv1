import { v } from "convex/values";

import { internal } from "./_generated/api";
import { removePushPreferenceWhenNoDevices } from "./build_collaboration_push";
import { internalMutation } from "./fluent";

export const cleanupTransferredBuildCollaborationPushEndpoint = internalMutation
  .input({ endpoint: v.string(), priorWorkosUserId: v.string() })
  .returns(v.null())
  .handler(async (ctx, args) => {
    const subscription = await ctx.db
      .query("buildCollaborationPushSubscriptions")
      .withIndex("by_endpoint_and_workosUserId_and_state", (query) =>
        query
          .eq("endpoint", args.endpoint)
          .eq("workosUserId", args.priorWorkosUserId)
          .eq("state", "active")
      )
      .first();
    if (!subscription) {
      return null;
    }
    const now = Date.now();
    await ctx.db.patch(subscription._id, {
      revokedAt: now,
      state: "revoked",
      updatedAt: now,
    });
    if (subscription.buildId) {
      await removePushPreferenceWhenNoDevices(
        ctx,
        {
          buildId: subscription.buildId,
          organizationId: subscription.organizationId,
          workosUserId: subscription.workosUserId,
        },
        now
      );
    }
    await ctx.scheduler.runAfter(
      0,
      internal.build_collaboration_push_maintenance
        .cleanupTransferredBuildCollaborationPushEndpoint,
      args
    );
    return null;
  })
  .internal();
