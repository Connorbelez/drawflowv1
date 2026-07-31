import { internal } from "./_generated/api.js";
import {
  buildActionItemQueueSortAt,
  resetBuildActionItemDeadlineSchedule,
} from "./build_action_item_deadline_model";
import { MAX_ACTION_ITEM_REFERENCES } from "./build_action_item_queue_projection";
import { migrations } from "./migrations";

/**
 * Makes every pre-deployment Action Item visible to the indexed deadline
 * processor. Rows without a due date are explicitly marked complete.
 */
export const backfillBuildActionItemDeadlineSchedules = migrations.define({
  table: "buildActionItems",
  migrateOne: (_ctx, item) => ({
    ...(item.deadlineProcessingState === undefined
      ? resetBuildActionItemDeadlineSchedule(
          item.dueAt,
          item.status,
          item.deadlineScheduleGeneration
        )
      : {}),
    ...(item.queueSortAt === undefined
      ? { queueSortAt: buildActionItemQueueSortAt(item.dueAt, item.status) }
      : {}),
  }),
});

export const backfillBuildActionItemReferenceQueueSort = migrations.define({
  batchSize: 1,
  table: "buildCollaborationReferences",
  migrateOne: async (ctx, reference) => {
    if (reference.ownerKind !== "actionItem") {
      return;
    }
    const actionItemId = ctx.db.normalizeId(
      "buildActionItems",
      reference.ownerRecordId
    );
    const item = actionItemId ? await ctx.db.get(actionItemId) : null;
    if (
      !item ||
      item.organizationId !== reference.organizationId ||
      item.brokerageId !== reference.brokerageId ||
      item.buildId !== reference.buildId ||
      item.originatingPostId !== reference.postId
    ) {
      throw new Error(
        `Action Item reference queue projection integrity failure for ${reference._id}.`
      );
    }
    const ownerReferences = await ctx.db
      .query("buildCollaborationReferences")
      .withIndex("by_ownerKind_and_ownerRecordId", (query) =>
        query
          .eq("ownerKind", "actionItem")
          .eq("ownerRecordId", reference.ownerRecordId)
      )
      .take(MAX_ACTION_ITEM_REFERENCES + 1);
    if (ownerReferences.length > MAX_ACTION_ITEM_REFERENCES) {
      throw new Error(
        `Action Item reference integrity exceeds the safe limit for ${item._id}.`
      );
    }
    const duplicates = ownerReferences
      .filter(
        (candidate) =>
          candidate.entityKind === reference.entityKind &&
          candidate.entityId === reference.entityId
      )
      .sort(
        (left, right) =>
          left._creationTime - right._creationTime ||
          String(left._id).localeCompare(String(right._id))
      );
    const keeper = duplicates[0];
    if (keeper && keeper._id !== reference._id) {
      await ctx.db.delete(reference._id);
      return;
    }
    const actionItemQueueSortAt =
      item.queueSortAt ?? buildActionItemQueueSortAt(item.dueAt, item.status);
    const primary = duplicates.some((candidate) => candidate.primary);
    return {
      ...(reference.actionItemQueueSortAt === actionItemQueueSortAt
        ? {}
        : { actionItemQueueSortAt }),
      ...(reference.primary === primary ? {} : { primary }),
    };
  },
});

export const runBuildActionItemDeadlineScheduleBackfill = migrations.runner([
  internal.build_action_item_deadline_migrations
    .backfillBuildActionItemDeadlineSchedules,
  internal.build_action_item_deadline_migrations
    .backfillBuildActionItemReferenceQueueSort,
]);

export const runBuildActionItemReferenceQueueSortBackfill = migrations.runner(
  internal.build_action_item_deadline_migrations
    .backfillBuildActionItemReferenceQueueSort
);
