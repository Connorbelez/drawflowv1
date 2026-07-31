import type { Doc, MutationCtx } from "./types";

export const MAX_ACTION_ITEM_REFERENCES = 100;

/**
 * Keeps entity queue cursors aligned with the canonical Action Item queue.
 * The reference projection is bounded by the same per-item integrity limit used
 * by reference creation and replacement.
 */
export async function syncBuildActionItemReferenceQueueSortAt(
  ctx: MutationCtx,
  item: Doc<"buildActionItems">,
  queueSortAt: number
) {
  const references = await ctx.db
    .query("buildCollaborationReferences")
    .withIndex("by_ownerKind_and_ownerRecordId", (query) =>
      query.eq("ownerKind", "actionItem").eq("ownerRecordId", item._id)
    )
    .take(MAX_ACTION_ITEM_REFERENCES + 1);
  if (references.length > MAX_ACTION_ITEM_REFERENCES) {
    throw new Error("Action Item reference integrity exceeds the safe limit.");
  }
  if (
    references.some(
      (reference) =>
        reference.ownerKind !== "actionItem" ||
        reference.ownerRecordId !== item._id ||
        reference.organizationId !== item.organizationId ||
        reference.brokerageId !== item.brokerageId ||
        reference.buildId !== item.buildId ||
        reference.postId !== item.originatingPostId
    )
  ) {
    throw new Error("Action Item reference scope integrity failure.");
  }
  for (const reference of references) {
    if (reference.actionItemQueueSortAt !== queueSortAt) {
      await ctx.db.patch(reference._id, { actionItemQueueSortAt: queueSortAt });
    }
  }
}
