import { v } from "convex/values";

import { internal } from "./_generated/api";
import { internalMutation } from "./fluent";

const MIGRATION_BATCH_SIZE = 100;

const migrationResultValidator = v.object({
  continueCursor: v.string(),
  deletedCount: v.number(),
  isDone: v.boolean(),
  scannedCount: v.number(),
});

/**
 * Idempotently removes duplicate collaboration pins created before exact-key
 * pin toggles were introduced. Each batch is bounded and schedules the next
 * page so historical corruption cannot exceed one Convex transaction.
 */
export const normalizeBuildCollaborationPins = internalMutation
  .input({
    cursor: v.union(v.string(), v.null()),
  })
  .returns(migrationResultValidator)
  .handler(async (ctx, args) => {
    const page = await ctx.db.query("buildCollaborationPins").paginate({
      cursor: args.cursor,
      numItems: MIGRATION_BATCH_SIZE,
    });
    let deletedCount = 0;
    for (const pin of page.page) {
      const canonical = await ctx.db
        .query("buildCollaborationPins")
        .withIndex(
          "by_postId_and_commentId_and_workosUserId_and_kind",
          (query) =>
            query
              .eq("postId", pin.postId)
              .eq("commentId", pin.commentId)
              .eq("workosUserId", pin.workosUserId)
              .eq("kind", pin.kind)
        )
        .first();
      if (canonical && canonical._id !== pin._id) {
        await ctx.db.delete(pin._id);
        deletedCount += 1;
      }
    }
    if (!page.isDone) {
      await ctx.scheduler.runAfter(
        0,
        internal.build_collaboration_pin_migration
          .normalizeBuildCollaborationPins,
        { cursor: page.continueCursor }
      );
    }
    return {
      continueCursor: page.continueCursor,
      deletedCount,
      isDone: page.isDone,
      scannedCount: page.page.length,
    };
  })
  .internal();
