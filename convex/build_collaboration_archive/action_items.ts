import { canReadMilestoneSystemActionItem } from "../build_collaboration_system_event_access";
import type { ActiveBuildAuthorization } from "../activeBuildAccess";
import type { Doc, Id, QueryCtx } from "../types";
import { ARCHIVE_PAGE_SIZE, ARCHIVE_ROW_LIMIT } from "./contracts";
import type {
  ActionItemChildArchiveCursor,
  ActionItemChildArchiveSection,
} from "./contracts";
import { limited, ownerAttachments, ownerReferences } from "./common";
import { omitMutableFields } from "./revision";

export async function archiveActionItemSnapshot(
  ctx: QueryCtx,
  item: Doc<"buildActionItems">,
  snapshotAt: number
) {
  const revision = await ctx.db
    .query("buildActionItemRevisions")
    .withIndex("by_actionItemId_and_revision", (query) =>
      query.eq("actionItemId", item._id)
    )
    .filter((query) => query.lte(query.field("createdAt"), snapshotAt))
    .order("desc")
    .first();
  return {
    actionItemId: item._id,
    brokerageId: item.brokerageId,
    buildId: item.buildId,
    createdAt: item.createdAt,
    organizationId: item.organizationId,
    originatingPostId: item.originatingPostId,
    parentActionItemId: item.parentActionItemId,
    snapshot: revision ? JSON.parse(revision.snapshotJson) : item,
    snapshotRevision: revision,
  };
}

export async function buildActionItemChildArchivePage(
  ctx: QueryCtx,
  input: {
    authorization: ActiveBuildAuthorization;
    cursor: string | null;
    postId: Id<"buildCollaborationPosts">;
    section: ActionItemChildArchiveSection;
    snapshotAt: number;
  }
) {
  const state = decodeActionItemChildCursor(input.cursor);
  let item: Doc<"buildActionItems"> | null = null;
  let nextItemCursor = state.nextItemCursor;
  let outerIsDone = false;
  if (state.actionItemId) {
    item = await ctx.db.get(state.actionItemId);
    if (
      !item ||
      item.originatingPostId !== input.postId ||
      item.createdAt > input.snapshotAt
    ) {
      throw new Error("Archive Action Item cursor is invalid.");
    }
  } else {
    const itemPage = await ctx.db
      .query("buildActionItems")
      .withIndex("by_originatingPostId_and_createdAt", (query) =>
        query
          .eq("originatingPostId", input.postId)
          .lte("createdAt", input.snapshotAt)
      )
      .paginate({ cursor: state.nextItemCursor, numItems: 1 });
    item = itemPage.page[0] ?? null;
    nextItemCursor = itemPage.continueCursor;
    outerIsDone = itemPage.isDone;
  }
  if (!item) {
    return { continueCursor: "", data: [], isDone: true };
  }
  if (
    !(await canReadMilestoneSystemActionItem(ctx, {
      actionItem: item,
      buildId: input.authorization.build._id,
      role: input.authorization.effectiveRole.role,
      workosUserId: input.authorization.viewer.subject,
    }))
  ) {
    const isDone = outerIsDone || nextItemCursor === null;
    return {
      continueCursor: isDone
        ? ""
        : encodeActionItemChildCursor({
            actionItemId: undefined,
            childCursor: null,
            nextItemCursor,
          }),
      data: [],
      isDone,
    };
  }

  const childPage = await actionItemChildPage(ctx, {
    actionItemId: item._id,
    cursor: state.childCursor,
    section: input.section,
    snapshotAt: input.snapshotAt,
  });
  const isDone = childPage.isDone && outerIsDone;
  return {
    continueCursor: isDone
      ? ""
      : encodeActionItemChildCursor({
          actionItemId: childPage.isDone ? undefined : item._id,
          childCursor: childPage.isDone ? null : childPage.continueCursor,
          nextItemCursor,
        }),
    data: childPage.page.map((row) => ({
      actionItemId: item._id,
      row: stableActionItemChildRow(input.section, row),
    })),
    isDone,
  };
}

export async function actionItemChildPage(
  ctx: QueryCtx,
  input: {
    actionItemId: Id<"buildActionItems">;
    cursor: string | null;
    section: ActionItemChildArchiveSection;
    snapshotAt: number;
  }
) {
  const pagination = { cursor: input.cursor, numItems: ARCHIVE_PAGE_SIZE };
  if (input.section === "action_item_attachments") {
    return await ctx.db
      .query("buildCollaborationAttachments")
      .withIndex("by_ownerKind_and_ownerRecordId", (query) =>
        query
          .eq("ownerKind", "actionItem")
          .eq("ownerRecordId", input.actionItemId)
      )
      .filter((query) => query.lte(query.field("createdAt"), input.snapshotAt))
      .paginate(pagination);
  }
  if (input.section === "action_item_checklist") {
    return await ctx.db
      .query("buildActionItemChecklistItems")
      .withIndex("by_actionItemId_and_order", (query) =>
        query.eq("actionItemId", input.actionItemId)
      )
      .filter((query) => query.lte(query.field("createdAt"), input.snapshotAt))
      .paginate(pagination);
  }
  if (input.section === "action_item_comments") {
    return await ctx.db
      .query("buildActionItemComments")
      .withIndex("by_actionItemId_and_createdAt", (query) =>
        query
          .eq("actionItemId", input.actionItemId)
          .lte("createdAt", input.snapshotAt)
      )
      .paginate(pagination);
  }
  if (input.section === "action_item_events") {
    return await ctx.db
      .query("buildActionItemEvents")
      .withIndex("by_actionItemId_and_createdAt", (query) =>
        query
          .eq("actionItemId", input.actionItemId)
          .lte("createdAt", input.snapshotAt)
      )
      .paginate(pagination);
  }
  if (input.section === "action_item_labels") {
    return await ctx.db
      .query("buildActionItemLabels")
      .withIndex("by_actionItemId_and_normalizedLabel", (query) =>
        query.eq("actionItemId", input.actionItemId)
      )
      .filter((query) => query.lte(query.field("createdAt"), input.snapshotAt))
      .paginate(pagination);
  }
  if (input.section === "action_item_post_links") {
    return await ctx.db
      .query("buildActionItemPostLinks")
      .withIndex("by_actionItemId_and_postId", (query) =>
        query.eq("actionItemId", input.actionItemId)
      )
      .filter((query) => query.lte(query.field("createdAt"), input.snapshotAt))
      .paginate(pagination);
  }
  if (input.section === "action_item_references") {
    return await ctx.db
      .query("buildCollaborationReferences")
      .withIndex("by_ownerKind_and_ownerRecordId", (query) =>
        query
          .eq("ownerKind", "actionItem")
          .eq("ownerRecordId", input.actionItemId)
      )
      .filter((query) => query.lte(query.field("createdAt"), input.snapshotAt))
      .paginate(pagination);
  }
  if (input.section === "action_item_relations_incoming") {
    return await ctx.db
      .query("buildActionItemRelations")
      .withIndex("by_targetActionItemId_and_status", (query) =>
        query.eq("targetActionItemId", input.actionItemId)
      )
      .filter((query) => query.lte(query.field("createdAt"), input.snapshotAt))
      .paginate(pagination);
  }
  if (input.section === "action_item_relations_outgoing") {
    return await ctx.db
      .query("buildActionItemRelations")
      .withIndex("by_sourceActionItemId_and_status", (query) =>
        query.eq("sourceActionItemId", input.actionItemId)
      )
      .filter((query) => query.lte(query.field("createdAt"), input.snapshotAt))
      .paginate(pagination);
  }
  return await ctx.db
    .query("buildActionItemRevisions")
    .withIndex("by_actionItemId_and_revision", (query) =>
      query.eq("actionItemId", input.actionItemId)
    )
    .filter((query) => query.lte(query.field("createdAt"), input.snapshotAt))
    .paginate(pagination);
}

export function decodeActionItemChildCursor(
  cursor: string | null
): ActionItemChildArchiveCursor {
  if (!cursor) {
    return { childCursor: null, nextItemCursor: null };
  }
  try {
    return JSON.parse(cursor) as ActionItemChildArchiveCursor;
  } catch {
    throw new Error("Archive Action Item cursor is malformed.");
  }
}

export function encodeActionItemChildCursor(cursor: ActionItemChildArchiveCursor) {
  return JSON.stringify(cursor);
}

export function stableActionItemChildRow(
  section: ActionItemChildArchiveSection,
  row: object
) {
  if (section === "action_item_checklist") {
    return omitMutableFields(row, [
      "completedAt",
      "completedByWorkosUserId",
      "completed",
      "updatedAt",
    ]);
  }
  if (
    section === "action_item_relations_incoming" ||
    section === "action_item_relations_outgoing"
  ) {
    return omitMutableFields(row, ["status", "updatedAt"]);
  }
  return row;
}


export async function archiveActionItem(ctx: QueryCtx, item: Doc<"buildActionItems">) {
  const relations = [
    ...(await limited(
      ctx.db
        .query("buildActionItemRelations")
        .withIndex("by_sourceActionItemId_and_status", (query) =>
          query.eq("sourceActionItemId", item._id)
        )
        .take(ARCHIVE_ROW_LIMIT + 1),
      "outgoing Action Item relations"
    )),
    ...(await limited(
      ctx.db
        .query("buildActionItemRelations")
        .withIndex("by_targetActionItemId_and_status", (query) =>
          query.eq("targetActionItemId", item._id)
        )
        .take(ARCHIVE_ROW_LIMIT + 1),
      "incoming Action Item relations"
    )),
  ];
  return {
    attachments: await ownerAttachments(ctx, "actionItem", item._id),
    checklist: await limited(
      ctx.db
        .query("buildActionItemChecklistItems")
        .withIndex("by_actionItemId_and_order", (query) =>
          query.eq("actionItemId", item._id)
        )
        .take(ARCHIVE_ROW_LIMIT + 1),
      "Action Item checklist entries"
    ),
    comments: await limited(
      ctx.db
        .query("buildActionItemComments")
        .withIndex("by_actionItemId_and_createdAt", (query) =>
          query.eq("actionItemId", item._id)
        )
        .take(ARCHIVE_ROW_LIMIT + 1),
      "Action Item comments"
    ),
    events: await limited(
      ctx.db
        .query("buildActionItemEvents")
        .withIndex("by_actionItemId_and_createdAt", (query) =>
          query.eq("actionItemId", item._id)
        )
        .take(ARCHIVE_ROW_LIMIT + 1),
      "Action Item events"
    ),
    item,
    labels: await limited(
      ctx.db
        .query("buildActionItemLabels")
        .withIndex("by_actionItemId_and_normalizedLabel", (query) =>
          query.eq("actionItemId", item._id)
        )
        .take(ARCHIVE_ROW_LIMIT + 1),
      "Action Item labels"
    ),
    postLinks: await limited(
      ctx.db
        .query("buildActionItemPostLinks")
        .withIndex("by_actionItemId_and_postId", (query) =>
          query.eq("actionItemId", item._id)
        )
        .take(ARCHIVE_ROW_LIMIT + 1),
      "Action Item post links"
    ),
    references: await ownerReferences(ctx, "actionItem", item._id),
    relations: [...new Map(relations.map((row) => [row._id, row])).values()],
    revisions: await limited(
      ctx.db
        .query("buildActionItemRevisions")
        .withIndex("by_actionItemId_and_revision", (query) =>
          query.eq("actionItemId", item._id)
        )
        .take(ARCHIVE_ROW_LIMIT + 1),
      "Action Item revisions"
    ),
  };
}

