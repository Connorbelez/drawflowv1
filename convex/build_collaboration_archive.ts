import type { ActiveBuildAuthorization } from "./activeBuildAccess";
import { canSeeCollaborationReceipt } from "./build_collaboration_access";
import type { Doc, Id, QueryCtx } from "./types";

const ARCHIVE_ROW_LIMIT = 2000;
const ARCHIVE_PAGE_SIZE = 2;

export const COLLABORATION_POST_ARCHIVE_SECTIONS = [
  "core",
  "revisions",
  "comments",
  "comment_revisions",
  "action_items",
  "action_item_attachments",
  "action_item_checklist",
  "action_item_comments",
  "action_item_events",
  "action_item_labels",
  "action_item_post_links",
  "action_item_references",
  "action_item_relations_incoming",
  "action_item_relations_outgoing",
  "action_item_revisions",
  "acknowledgements",
  "audience_members",
  "creation_requests",
  "decision_outcomes",
  "follows",
  "moderation",
  "pins",
  "reactions",
  "receipts",
  "references",
  "thread_events",
] as const;

export type CollaborationPostArchiveSection =
  (typeof COLLABORATION_POST_ARCHIVE_SECTIONS)[number];

type ActionItemChildArchiveSection = Extract<
  CollaborationPostArchiveSection,
  `action_item_${string}`
>;

interface ActionItemChildArchiveCursor {
  actionItemId?: Id<"buildActionItems">;
  childCursor: string | null;
  nextItemCursor: string | null;
}

export interface CollaborationPostArchiveSnapshot {
  createdAt: number;
  currentRevisionId?: Id<"buildCollaborationPostRevisions">;
  postId: Id<"buildCollaborationPosts">;
  revision: number;
  threadRevision: number;
  updatedAt: number;
  [key: string]: unknown;
}

export async function buildBuildCollaborationHistoryArchive(
  ctx: QueryCtx,
  input: {
    authorization: ActiveBuildAuthorization;
  }
) {
  const lifecycle = await ctx.db
    .query("buildCollaborationBuildStates")
    .withIndex("by_buildId", (query) =>
      query.eq("buildId", input.authorization.build._id)
    )
    .unique();
  const lifecycleEvents = await limited(
    ctx.db
      .query("buildCollaborationBuildLifecycleEvents")
      .withIndex("by_buildId_and_createdAt", (query) =>
        query.eq("buildId", input.authorization.build._id)
      )
      .take(ARCHIVE_ROW_LIMIT + 1),
    "Build lifecycle events"
  );
  const closureWaivers = await limited(
    ctx.db
      .query("buildCollaborationClosureWaivers")
      .withIndex("by_buildId_and_lifecycleRevision", (query) =>
        query.eq("buildId", input.authorization.build._id)
      )
      .take(ARCHIVE_ROW_LIMIT + 1),
    "Build closure waivers"
  );
  const lifecycleAudit = lifecycle
    ? await limited(
        ctx.db
          .query("auditEvents")
          .withIndex("by_entity", (query) =>
            query
              .eq("entityType", "buildCollaborationBuildState")
              .eq("entityId", lifecycle._id)
          )
          .take(ARCHIVE_ROW_LIMIT + 1),
        "Build lifecycle audit events"
      )
    : [];
  return { closureWaivers, lifecycle, lifecycleAudit, lifecycleEvents };
}

export async function buildCollaborationPostArchivePage(
  ctx: QueryCtx,
  input: {
    authorization: ActiveBuildAuthorization;
    cursor: string | null;
    post: Pick<Doc<"buildCollaborationPosts">, "_id">;
    postSnapshot: CollaborationPostArchiveSnapshot;
    section: CollaborationPostArchiveSection;
    snapshotAt: number;
  }
) {
  const { authorization, cursor, post, postSnapshot, section, snapshotAt } =
    input;
  if (section === "core") {
    return {
      continueCursor: "",
      data: [postSnapshot],
      isDone: true,
    };
  }
  if (section === "revisions") {
    const result = await ctx.db
      .query("buildCollaborationPostRevisions")
      .withIndex("by_postId_and_revision", (query) =>
        query.eq("postId", post._id)
      )
      .paginate({ cursor, numItems: ARCHIVE_PAGE_SIZE });
    const page: Record<string, unknown>[] = [];
    for (const revision of result.page.filter(
      (candidate) =>
        candidate.createdAt <= snapshotAt &&
        candidate.revision <= postSnapshot.revision
    )) {
      page.push({
        attachments: await ownerAttachments(ctx, "postRevision", revision._id),
        audienceSnapshots: await limited(
          ctx.db
            .query("buildCollaborationAudienceSnapshots")
            .withIndex("by_postRevisionId_and_workosUserId", (query) =>
              query.eq("postRevisionId", revision._id)
            )
            .take(ARCHIVE_ROW_LIMIT + 1),
          "post audience snapshots"
        ),
        references: await ownerReferences(ctx, "postRevision", revision._id),
        revision,
      });
    }
    return { ...result, page: undefined, data: page };
  }
  if (section === "comments") {
    const result = await ctx.db
      .query("buildCollaborationComments")
      .withIndex("by_postId_and_createdAt", (query) =>
        query.eq("postId", post._id).lte("createdAt", snapshotAt)
      )
      .paginate({ cursor, numItems: ARCHIVE_PAGE_SIZE });
    return { ...result, page: undefined, data: result.page };
  }
  if (section === "comment_revisions") {
    const result = await ctx.db
      .query("buildCollaborationCommentRevisions")
      .withIndex("by_postId_and_createdAt", (query) =>
        query.eq("postId", post._id).lte("createdAt", snapshotAt)
      )
      .paginate({ cursor, numItems: ARCHIVE_PAGE_SIZE });
    const page = await Promise.all(
      result.page.map(async (revision) => ({
        attachments: await ownerAttachments(
          ctx,
          "commentRevision",
          revision._id
        ),
        references: await ownerReferences(ctx, "commentRevision", revision._id),
        revision,
      }))
    );
    return { ...result, page: undefined, data: page };
  }
  if (section === "action_items") {
    const result = await ctx.db
      .query("buildActionItems")
      .withIndex("by_originatingPostId_and_createdAt", (query) =>
        query.eq("originatingPostId", post._id).lte("createdAt", snapshotAt)
      )
      .paginate({ cursor, numItems: ARCHIVE_PAGE_SIZE });
    return {
      ...result,
      page: undefined,
      data: await Promise.all(
        result.page.map((item) =>
          archiveActionItemSnapshot(ctx, item, snapshotAt)
        )
      ),
    };
  }
  if (section.startsWith("action_item_")) {
    return await buildActionItemChildArchivePage(ctx, {
      cursor,
      postId: post._id,
      section: section as ActionItemChildArchiveSection,
      snapshotAt,
    });
  }
  if (section === "acknowledgements") {
    const result = await ctx.db
      .query("buildCollaborationAcknowledgementTargets")
      .withIndex("by_postId_and_createdAt", (query) =>
        query.eq("postId", post._id).lte("createdAt", snapshotAt)
      )
      .paginate({ cursor, numItems: ARCHIVE_PAGE_SIZE });
    const page = await Promise.all(
      result.page.map(async (target) => ({
        acknowledgements: await limited(
          ctx.db
            .query("buildCollaborationAcknowledgements")
            .withIndex("by_targetId", (query) =>
              query.eq("targetId", target._id)
            )
            .take(ARCHIVE_ROW_LIMIT + 1),
          "acknowledgements"
        ),
        target,
      }))
    );
    return { ...result, page: undefined, data: page };
  }
  if (section === "audience_members") {
    const result = await ctx.db
      .query("buildCollaborationAudienceMembers")
      .withIndex("by_postId_and_createdAt", (query) =>
        query.eq("postId", post._id).lte("createdAt", snapshotAt)
      )
      .paginate({ cursor, numItems: ARCHIVE_PAGE_SIZE });
    return { ...result, page: undefined, data: result.page };
  }
  if (section === "creation_requests") {
    const result = await ctx.db
      .query("buildActionItemCreationRequests")
      .withIndex("by_postId_and_createdAt", (query) =>
        query.eq("postId", post._id).lte("createdAt", snapshotAt)
      )
      .paginate({ cursor, numItems: ARCHIVE_PAGE_SIZE });
    return { ...result, page: undefined, data: result.page };
  }
  if (section === "decision_outcomes") {
    const result = await ctx.db
      .query("buildCollaborationDecisionOutcomeRevisions")
      .withIndex("by_postId_and_revision", (query) =>
        query.eq("postId", post._id)
      )
      .paginate({ cursor, numItems: ARCHIVE_PAGE_SIZE });
    return { ...result, page: undefined, data: result.page };
  }
  if (section === "follows") {
    const result = await ctx.db
      .query("buildCollaborationFollows")
      .withIndex("by_postId_and_createdAt", (query) =>
        query.eq("postId", post._id).lte("createdAt", snapshotAt)
      )
      .paginate({ cursor, numItems: ARCHIVE_PAGE_SIZE });
    return {
      ...result,
      page: undefined,
      data: result.page.filter(
        (follow) => follow.workosUserId === authorization.viewer.subject
      ),
    };
  }
  if (section === "moderation") {
    const result = await ctx.db
      .query("buildCollaborationModerationCases")
      .withIndex("by_postId_and_createdAt", (query) =>
        query.eq("postId", post._id).lte("createdAt", snapshotAt)
      )
      .paginate({ cursor, numItems: ARCHIVE_PAGE_SIZE });
    return {
      ...result,
      page: undefined,
      data: await Promise.all(
        result.page
          .filter((moderationCase) => moderationCase.entityKind === "post")
          .map((moderationCase) =>
            archiveModerationCase(ctx, authorization, moderationCase)
          )
      ),
    };
  }
  if (section === "pins") {
    const result = await ctx.db
      .query("buildCollaborationPins")
      .withIndex("by_postId_and_createdAt", (query) =>
        query.eq("postId", post._id).lte("createdAt", snapshotAt)
      )
      .paginate({ cursor, numItems: ARCHIVE_PAGE_SIZE });
    return {
      ...result,
      page: undefined,
      data: result.page.filter((pin) =>
        isVisibleArchivePin(authorization, pin)
      ),
    };
  }
  if (section === "reactions") {
    const result = await ctx.db
      .query("buildCollaborationReactions")
      .withIndex("by_postId_and_createdAt", (query) =>
        query.eq("postId", post._id).lte("createdAt", snapshotAt)
      )
      .paginate({ cursor, numItems: ARCHIVE_PAGE_SIZE });
    return { ...result, page: undefined, data: result.page };
  }
  if (section === "receipts") {
    const result = await ctx.db
      .query("buildCollaborationReceipts")
      .withIndex("by_postId_and_firstViewedAt", (query) =>
        query.eq("postId", post._id).lte("firstViewedAt", snapshotAt)
      )
      .paginate({ cursor, numItems: ARCHIVE_PAGE_SIZE });
    return {
      ...result,
      page: undefined,
      data: result.page.filter((receipt) =>
        canSeeCollaborationReceipt(authorization, receipt)
      ),
    };
  }
  if (section === "references") {
    const result = await ctx.db
      .query("buildCollaborationReferences")
      .withIndex("by_postId_and_createdAt", (query) =>
        query.eq("postId", post._id).lte("createdAt", snapshotAt)
      )
      .paginate({ cursor, numItems: ARCHIVE_PAGE_SIZE });
    return { ...result, page: undefined, data: result.page };
  }
  const result = await ctx.db
    .query("buildCollaborationThreadEvents")
    .withIndex("by_postId_and_createdAt", (query) =>
      query.eq("postId", post._id).lte("createdAt", snapshotAt)
    )
    .paginate({ cursor, numItems: ARCHIVE_PAGE_SIZE });
  return { ...result, page: undefined, data: result.page };
}

async function archiveActionItemSnapshot(
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

async function buildActionItemChildArchivePage(
  ctx: QueryCtx,
  input: {
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
    data: childPage.page.map((row) => ({ actionItemId: item._id, row })),
    isDone,
  };
}

async function actionItemChildPage(
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

function decodeActionItemChildCursor(
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

function encodeActionItemChildCursor(cursor: ActionItemChildArchiveCursor) {
  return JSON.stringify(cursor);
}

export async function buildCollaborationPostArchive(
  ctx: QueryCtx,
  input: {
    authorization: ActiveBuildAuthorization;
    post: Doc<"buildCollaborationPosts">;
  }
) {
  const { authorization, post } = input;
  const revisions = await limited(
    ctx.db
      .query("buildCollaborationPostRevisions")
      .withIndex("by_postId_and_revision", (query) =>
        query.eq("postId", post._id)
      )
      .take(ARCHIVE_ROW_LIMIT + 1),
    "post revisions"
  );
  const revisionHistory: Record<string, unknown>[] = [];
  for (const revision of revisions) {
    revisionHistory.push({
      attachments: await ownerAttachments(ctx, "postRevision", revision._id),
      audienceSnapshots: await limited(
        ctx.db
          .query("buildCollaborationAudienceSnapshots")
          .withIndex("by_postRevisionId_and_workosUserId", (query) =>
            query.eq("postRevisionId", revision._id)
          )
          .take(ARCHIVE_ROW_LIMIT + 1),
        "post audience snapshots"
      ),
      references: await ownerReferences(ctx, "postRevision", revision._id),
      revision,
    });
  }
  const comments = await limited(
    ctx.db
      .query("buildCollaborationComments")
      .withIndex("by_postId_and_createdAt", (query) =>
        query.eq("postId", post._id)
      )
      .take(ARCHIVE_ROW_LIMIT + 1),
    "comments"
  );
  const commentHistory: Record<string, unknown>[] = [];
  for (const comment of comments) {
    const commentRevisions = await limited(
      ctx.db
        .query("buildCollaborationCommentRevisions")
        .withIndex("by_commentId_and_revision", (query) =>
          query.eq("commentId", comment._id)
        )
        .take(ARCHIVE_ROW_LIMIT + 1),
      "comment revisions"
    );
    const revisionEntries: Record<string, unknown>[] = [];
    for (const revision of commentRevisions) {
      revisionEntries.push({
        attachments: await ownerAttachments(
          ctx,
          "commentRevision",
          revision._id
        ),
        references: await ownerReferences(ctx, "commentRevision", revision._id),
        revision,
      });
    }
    commentHistory.push({
      comment,
      moderation: await moderationHistory(
        ctx,
        authorization,
        "comment",
        comment._id
      ),
      pins: (
        await limited(
          ctx.db
            .query("buildCollaborationPins")
            .withIndex(
              "by_postId_and_commentId_and_workosUserId_and_kind",
              (query) =>
                query.eq("postId", post._id).eq("commentId", comment._id)
            )
            .take(ARCHIVE_ROW_LIMIT + 1),
          "comment pins"
        )
      ).filter((pin) => isVisibleArchivePin(authorization, pin)),
      reactions: await limited(
        ctx.db
          .query("buildCollaborationReactions")
          .withIndex("by_commentId_and_workosUserId", (query) =>
            query.eq("commentId", comment._id)
          )
          .take(ARCHIVE_ROW_LIMIT + 1),
        "comment reactions"
      ),
      revisions: revisionEntries,
    });
  }
  const actionItems = await limited(
    ctx.db
      .query("buildActionItems")
      .withIndex("by_originatingPostId_and_queueSortAt", (query) =>
        query.eq("originatingPostId", post._id)
      )
      .take(ARCHIVE_ROW_LIMIT + 1),
    "Action Items"
  );
  const actionItemHistory: Record<string, unknown>[] = [];
  for (const item of actionItems) {
    actionItemHistory.push(await archiveActionItem(ctx, item));
  }
  const acknowledgementTargets = await limited(
    ctx.db
      .query("buildCollaborationAcknowledgementTargets")
      .withIndex("by_postId_and_workosUserId", (query) =>
        query.eq("postId", post._id)
      )
      .take(ARCHIVE_ROW_LIMIT + 1),
    "acknowledgement targets"
  );
  const acknowledgements: Record<string, unknown>[] = [];
  for (const target of acknowledgementTargets) {
    acknowledgements.push({
      acknowledgements: await limited(
        ctx.db
          .query("buildCollaborationAcknowledgements")
          .withIndex("by_targetId", (query) => query.eq("targetId", target._id))
          .take(ARCHIVE_ROW_LIMIT + 1),
        "acknowledgements"
      ),
      target,
    });
  }
  return {
    acknowledgements,
    actionItems: actionItemHistory,
    audienceMembers: await limited(
      ctx.db
        .query("buildCollaborationAudienceMembers")
        .withIndex("by_postId_and_workosUserId", (query) =>
          query.eq("postId", post._id)
        )
        .take(ARCHIVE_ROW_LIMIT + 1),
      "audience members"
    ),
    comments: commentHistory,
    creationRequests: await limited(
      ctx.db
        .query("buildActionItemCreationRequests")
        .withIndex("by_postId_and_creatorWorkosUserId_and_requestId", (query) =>
          query.eq("postId", post._id)
        )
        .take(ARCHIVE_ROW_LIMIT + 1),
      "Action Item creation requests"
    ),
    decisionOutcomeRevisions: await limited(
      ctx.db
        .query("buildCollaborationDecisionOutcomeRevisions")
        .withIndex("by_postId_and_revision", (query) =>
          query.eq("postId", post._id)
        )
        .take(ARCHIVE_ROW_LIMIT + 1),
      "decision outcome revisions"
    ),
    follows: (
      await limited(
        ctx.db
          .query("buildCollaborationFollows")
          .withIndex("by_postId_and_workosUserId", (query) =>
            query.eq("postId", post._id)
          )
          .take(ARCHIVE_ROW_LIMIT + 1),
        "post follows"
      )
    ).filter((follow) => follow.workosUserId === authorization.viewer.subject),
    moderation: await moderationHistory(ctx, authorization, "post", post._id),
    pins: (
      await limited(
        ctx.db
          .query("buildCollaborationPins")
          .withIndex("by_postId_and_workosUserId_and_kind", (query) =>
            query.eq("postId", post._id)
          )
          .take(ARCHIVE_ROW_LIMIT + 1),
        "post pins"
      )
    ).filter((pin) => isVisibleArchivePin(authorization, pin)),
    post,
    reactions: await limited(
      ctx.db
        .query("buildCollaborationReactions")
        .withIndex("by_postId_and_workosUserId", (query) =>
          query.eq("postId", post._id)
        )
        .take(ARCHIVE_ROW_LIMIT + 1),
      "post reactions"
    ),
    receipts: (
      await limited(
        ctx.db
          .query("buildCollaborationReceipts")
          .withIndex("by_postId_and_workosUserId", (query) =>
            query.eq("postId", post._id)
          )
          .take(ARCHIVE_ROW_LIMIT + 1),
        "post receipts"
      )
    ).filter((receipt) => canSeeCollaborationReceipt(authorization, receipt)),
    references: await limited(
      ctx.db
        .query("buildCollaborationReferences")
        .withIndex("by_postId", (query) => query.eq("postId", post._id))
        .take(ARCHIVE_ROW_LIMIT + 1),
      "post references"
    ),
    revisions: revisionHistory,
    threadEvents: await limited(
      ctx.db
        .query("buildCollaborationThreadEvents")
        .withIndex("by_postId_and_createdAt", (query) =>
          query.eq("postId", post._id)
        )
        .take(ARCHIVE_ROW_LIMIT + 1),
      "thread events"
    ),
  };
}

async function archiveActionItem(ctx: QueryCtx, item: Doc<"buildActionItems">) {
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

function isVisibleArchivePin(
  authorization: ActiveBuildAuthorization,
  pin: Doc<"buildCollaborationPins">
) {
  return (
    pin.kind !== "personal" || pin.workosUserId === authorization.viewer.subject
  );
}

async function moderationHistory(
  ctx: QueryCtx,
  authorization: ActiveBuildAuthorization,
  entityKind: "comment" | "post",
  entityId: string
) {
  const cases = await limited(
    ctx.db
      .query("buildCollaborationModerationCases")
      .withIndex("by_entityKind_and_entityId", (query) =>
        query.eq("entityKind", entityKind).eq("entityId", entityId)
      )
      .take(ARCHIVE_ROW_LIMIT + 1),
    "moderation cases"
  );
  const history: Record<string, unknown>[] = [];
  for (const moderationCase of cases) {
    history.push(
      await archiveModerationCase(ctx, authorization, moderationCase)
    );
  }
  return history;
}

async function archiveModerationCase(
  ctx: QueryCtx,
  authorization: ActiveBuildAuthorization,
  moderationCase: Doc<"buildCollaborationModerationCases">
) {
  return {
    case: {
      ...moderationCase,
      evidenceSnapshotJson: sanitizeModerationEvidenceSnapshot(
        authorization,
        moderationCase.evidenceSnapshotJson
      ),
    },
    events: await limited(
      ctx.db
        .query("buildCollaborationModerationEvents")
        .withIndex("by_caseId_and_createdAt", (query) =>
          query.eq("caseId", moderationCase._id)
        )
        .take(ARCHIVE_ROW_LIMIT + 1),
      "moderation events"
    ),
  };
}

function sanitizeModerationEvidenceSnapshot(
  authorization: ActiveBuildAuthorization,
  value: string
) {
  try {
    const parsed = JSON.parse(value) as Record<string, unknown>;
    const receiptSnapshots = Array.isArray(parsed.receiptSnapshots)
      ? parsed.receiptSnapshots.filter(
          (
            receipt
          ): receipt is {
            viewerRole: Doc<"buildCollaborationReceipts">["viewerRole"];
            workosUserId: string;
          } =>
            Boolean(
              receipt &&
                typeof receipt === "object" &&
                typeof (receipt as Record<string, unknown>).workosUserId ===
                  "string" &&
                typeof (receipt as Record<string, unknown>).viewerRole ===
                  "string" &&
                canSeeCollaborationReceipt(
                  authorization,
                  receipt as {
                    viewerRole: Doc<"buildCollaborationReceipts">["viewerRole"];
                    workosUserId: string;
                  }
                )
            )
        )
      : [];
    return JSON.stringify({ ...parsed, receiptSnapshots });
  } catch {
    return JSON.stringify({
      attachmentIds: [],
      receiptSnapshots: [],
      referenceIds: [],
    });
  }
}

async function ownerAttachments(
  ctx: QueryCtx,
  ownerKind: Doc<"buildCollaborationAttachments">["ownerKind"],
  ownerRecordId: string
) {
  return await limited(
    ctx.db
      .query("buildCollaborationAttachments")
      .withIndex("by_ownerKind_and_ownerRecordId", (query) =>
        query.eq("ownerKind", ownerKind).eq("ownerRecordId", ownerRecordId)
      )
      .take(ARCHIVE_ROW_LIMIT + 1),
    `${ownerKind} attachments`
  );
}

async function ownerReferences(
  ctx: QueryCtx,
  ownerKind: Doc<"buildCollaborationReferences">["ownerKind"],
  ownerRecordId: string
) {
  return await limited(
    ctx.db
      .query("buildCollaborationReferences")
      .withIndex("by_ownerKind_and_ownerRecordId", (query) =>
        query.eq("ownerKind", ownerKind).eq("ownerRecordId", ownerRecordId)
      )
      .take(ARCHIVE_ROW_LIMIT + 1),
    `${ownerKind} references`
  );
}

async function limited<T>(promise: Promise<T[]>, label: string) {
  const rows = await promise;
  if (rows.length > ARCHIVE_ROW_LIMIT) {
    throw new Error(
      `Full archive exceeds the ${ARCHIVE_ROW_LIMIT} ${label} limit.`
    );
  }
  return rows;
}
