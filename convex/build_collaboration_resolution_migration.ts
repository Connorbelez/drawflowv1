import { v } from "convex/values";

import { internal } from "./_generated/api";
import { internalMutation } from "./fluent";

const MIGRATION_BATCH_SIZE = 100;

const migrationResultValidator = v.object({
  continueCursor: v.string(),
  isDone: v.boolean(),
  patchedCount: v.number(),
  rescheduledCount: v.number(),
  scannedCount: v.number(),
});

/**
 * Idempotently normalizes collaboration rows created before threadRevision and
 * persisted Announcement prominence were introduced. Future Announcement
 * expirations are deliberately rescheduled on every migration pass; the expiry
 * mutation validates the exact timestamp and is therefore safe under duplicate
 * scheduler delivery.
 */
export const migrateBuildCollaborationThreadOutcomeState = internalMutation
  .input({
    cursor: v.union(v.string(), v.null()),
  })
  .returns(migrationResultValidator)
  .handler(async (ctx, args) => {
    const page = await ctx.db.query("buildCollaborationPosts").paginate({
      cursor: args.cursor,
      numItems: MIGRATION_BATCH_SIZE,
    });
    const now = Date.now();
    let patchedCount = 0;
    let rescheduledCount = 0;
    for (const post of page.page) {
      const announcementProminent =
        post.postType === "announcement" &&
        (post.announcementExpiresAt === undefined ||
          post.announcementExpiresAt > now);
      const patch: {
        announcementProminent?: boolean;
        threadRevision?: number;
      } = {};
      if (post.threadRevision === undefined) {
        patch.threadRevision = 0;
      }
      if (post.announcementProminent !== announcementProminent) {
        patch.announcementProminent = announcementProminent;
      }
      if (Object.keys(patch).length > 0) {
        await ctx.db.patch(post._id, patch);
        patchedCount += 1;
      }
      if (
        post.postType === "announcement" &&
        post.announcementExpiresAt !== undefined &&
        post.announcementExpiresAt > now
      ) {
        await ctx.scheduler.runAt(
          post.announcementExpiresAt,
          internal.build_collaboration_resolution
            .expireBuildCollaborationAnnouncementProminence,
          {
            announcementExpiresAt: post.announcementExpiresAt,
            postId: post._id,
          }
        );
        rescheduledCount += 1;
      }
    }
    if (!page.isDone) {
      await ctx.scheduler.runAfter(
        0,
        internal.build_collaboration_resolution_migration
          .migrateBuildCollaborationThreadOutcomeState,
        { cursor: page.continueCursor }
      );
    }
    return {
      continueCursor: page.continueCursor,
      isDone: page.isDone,
      patchedCount,
      rescheduledCount,
      scannedCount: page.page.length,
    };
  })
  .internal();
