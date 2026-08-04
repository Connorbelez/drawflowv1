import type { ActiveBuildAuthorization } from "./activeBuildAccess";
import { canSeeCollaborationReceipt } from "./build_collaboration_access";
import { canReadDrawCoordination } from "./build_draw_coordination";
import { canReadMilestoneSystemActionItem } from "./build_collaboration_system_event_access";
import type { Doc, Id, QueryCtx } from "./types";

const ARCHIVE_ROW_LIMIT = 2000;
const ARCHIVE_PAGE_SIZE = 2;

export const COLLABORATION_POST_ARCHIVE_SECTIONS = [
  "core",
  "revisions",
  "post_revision_attachments",
  "post_revision_audience_snapshots",
  "post_revision_references",
  "comments",
  "comment_revisions",
  "comment_revision_attachments",
  "comment_revision_references",
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
  "acknowledgement_events",
  "audience_members",
  "creation_requests",
  "decision_outcomes",
  "follows",
  "moderation",
  "moderation_events",
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

interface NestedArchiveCursor {
  childCursor: string | null;
  nextParentCursor: string | null;
  parentId?: string;
}

export interface CollaborationPostArchiveSnapshot {
  createdAt: number;
  currentRevisionId?: Id<"buildCollaborationPostRevisions">;
  postId: Id<"buildCollaborationPosts">;
  revision: number;
  threadRevision?: number;
  updatedAt: number;
  [key: string]: unknown;
}

export type BuildCollaborationHistoryArchiveSection =
  | "build_state"
  | "lifecycle_events"
  | "closure_waivers"
  | "lifecycle_audit";

export async function buildBuildCollaborationHistoryArchivePage(
  ctx: QueryCtx,
  input: {
    authorization: ActiveBuildAuthorization;
    cursor: string | null;
    section: string;
    snapshotAt: number;
    snapshotJson: string;
  }
) {
  if (input.section === "build_state") {
    const snapshot = JSON.parse(input.snapshotJson) as unknown;
    return {
      continueCursor: "",
      data: snapshot ? [snapshot] : [],
      isDone: true,
    };
  }
  const lifecycle = await ctx.db
    .query("buildCollaborationBuildStates")
    .withIndex("by_buildId", (query) =>
      query.eq("buildId", input.authorization.build._id)
    )
    .unique();
  const pagination = { cursor: input.cursor, numItems: ARCHIVE_PAGE_SIZE };
  if (input.section === "lifecycle_events") {
    const page = await ctx.db
      .query("buildCollaborationBuildLifecycleEvents")
      .withIndex("by_buildId_and_createdAt", (query) =>
        query
          .eq("buildId", input.authorization.build._id)
          .lte("createdAt", input.snapshotAt)
      )
      .paginate(pagination);
    return { ...page, data: page.page, page: undefined };
  }
  if (input.section === "closure_waivers") {
    const page = await ctx.db
      .query("buildCollaborationClosureWaivers")
      .withIndex("by_buildId_and_lifecycleRevision", (query) =>
        query.eq("buildId", input.authorization.build._id)
      )
      .filter((query) => query.lte(query.field("createdAt"), input.snapshotAt))
      .paginate(pagination);
    return { ...page, data: page.page, page: undefined };
  }
  if (input.section !== "lifecycle_audit") {
    throw new Error("Build history archive section is invalid.");
  }
  if (!lifecycle) {
    return { continueCursor: "", data: [], isDone: true };
  }
  const page = await ctx.db
    .query("auditEvents")
    .withIndex("by_entity", (query) =>
      query
        .eq("entityType", "buildCollaborationBuildState")
        .eq("entityId", lifecycle._id)
    )
    .filter((query) => query.lte(query.field("createdAt"), input.snapshotAt))
    .paginate(pagination);
  return { ...page, data: page.page, page: undefined };
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
  const postRow = await ctx.db.get(post._id);
  if (!postRow) {
    return { continueCursor: "", data: [], isDone: true };
  }
  const drawCoordinationReadable =
    postRow.systemPostKind !== "draw" ||
    (await canReadDrawCoordination(ctx, {
      authorization,
      post: postRow,
    }));
  if (
    postRow.systemPostKind === "draw" &&
    !drawCoordinationReadable &&
    section !== "core"
  ) {
    return { continueCursor: "", data: [], isDone: true };
  }
  if (section === "core") {
    return {
      continueCursor: "",
      data: [
        drawCoordinationReadable
          ? postSnapshot
          : redactArchiveSnapshot(postSnapshot),
      ],
      isDone: true,
    };
  }
  if (section === "revisions") {
    const result = await ctx.db
      .query("buildCollaborationPostRevisions")
      .withIndex("by_postId_and_revision", (query) =>
        query.eq("postId", post._id)
      )
      .filter((query) => query.lte(query.field("createdAt"), snapshotAt))
      .paginate({ cursor, numItems: ARCHIVE_PAGE_SIZE });
    const page = result.page.filter(
      (candidate) =>
        candidate.createdAt <= snapshotAt &&
        candidate.revision <= postSnapshot.revision
    );
    return { ...result, page: undefined, data: page };
  }
  if (section.startsWith("post_revision_")) {
    return await buildRevisionChildArchivePage(ctx, {
      cursor,
      postId: post._id,
      postRevisionCeiling: postSnapshot.revision,
      revisionKind: "post",
      section,
      snapshotAt,
    });
  }
  if (section === "comments") {
    const result = await ctx.db
      .query("buildCollaborationComments")
      .withIndex("by_postId_and_createdAt", (query) =>
        query.eq("postId", post._id).lte("createdAt", snapshotAt)
      )
      .paginate({ cursor, numItems: ARCHIVE_PAGE_SIZE });
    return {
      ...result,
      page: undefined,
      data: result.page.map((comment) => ({
        authorDisplayNameSnapshot: comment.authorDisplayNameSnapshot,
        authorRole: comment.authorRole,
        authorWorkosUserId: comment.authorWorkosUserId,
        commentId: comment._id,
        createdAt: comment.createdAt,
        logicalDepth: comment.logicalDepth,
        parentCommentId: comment.parentCommentId,
        postId: comment.postId,
      })),
    };
  }
  if (section === "comment_revisions") {
    const result = await ctx.db
      .query("buildCollaborationCommentRevisions")
      .withIndex("by_postId_and_createdAt", (query) =>
        query.eq("postId", post._id).lte("createdAt", snapshotAt)
      )
      .paginate({ cursor, numItems: ARCHIVE_PAGE_SIZE });
    return { ...result, page: undefined, data: result.page };
  }
  if (section.startsWith("comment_revision_")) {
    return await buildRevisionChildArchivePage(ctx, {
      cursor,
      postId: post._id,
      revisionKind: "comment",
      section,
      snapshotAt,
    });
  }
  if (section === "action_items") {
    const result = await ctx.db
      .query("buildActionItems")
      .withIndex("by_originatingPostId_and_createdAt", (query) =>
        query.eq("originatingPostId", post._id).lte("createdAt", snapshotAt)
      )
      .paginate({ cursor, numItems: ARCHIVE_PAGE_SIZE });
    const visibleItems: Record<string, unknown>[] = [];
    for (const item of result.page) {
      if (
        await canReadMilestoneSystemActionItem(ctx, {
          actionItem: item,
          buildId: authorization.build._id,
          role: authorization.effectiveRole.role,
          workosUserId: authorization.viewer.subject,
        })
      ) {
        visibleItems.push(
          await archiveActionItemSnapshot(ctx, item, snapshotAt)
        );
      }
    }
    return {
      ...result,
      page: undefined,
      data: visibleItems,
    };
  }
  if (section.startsWith("action_item_")) {
    return await buildActionItemChildArchivePage(ctx, {
      authorization,
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
    return {
      ...result,
      page: undefined,
      data: result.page.map((target) => ({
        createdAt: target.createdAt,
        dueAt: target.dueAt,
        postId: target.postId,
        targetId: target._id,
        workosUserId: target.workosUserId,
      })),
    };
  }
  if (section === "acknowledgement_events") {
    return await buildAcknowledgementEventArchivePage(ctx, {
      cursor,
      postId: post._id,
      snapshotAt,
    });
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
      .filter((query) => query.lte(query.field("createdAt"), snapshotAt))
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
      data: result.page
        .filter(
          (follow) => follow.workosUserId === authorization.viewer.subject
        )
        .map((follow) => omitMutableFields(follow, ["active", "updatedAt"])),
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
      data: result.page.map((moderationCase) => ({
        caseId: moderationCase._id,
        contentAuthorRole: moderationCase.contentAuthorRole,
        contentAuthorWorkosUserId: moderationCase.contentAuthorWorkosUserId,
        createdAt: moderationCase.createdAt,
        entityId: moderationCase.entityId,
        entityKind: moderationCase.entityKind,
        evidenceSnapshotJson: sanitizeModerationEvidenceSnapshot(
          authorization,
          moderationCase.evidenceSnapshotJson
        ),
        moderatorRole: moderationCase.moderatorRole,
        moderatorTier: moderationCase.moderatorTier,
        moderatorWorkosUserId: moderationCase.moderatorWorkosUserId,
        postId: moderationCase.postId,
      })),
    };
  }
  if (section === "moderation_events") {
    return await buildModerationEventArchivePage(ctx, {
      authorization,
      cursor,
      postId: post._id,
      snapshotAt,
    });
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
      data: result.page
        .filter((pin) => isVisibleArchivePin(authorization, pin))
        .map((pin) => omitMutableFields(pin, ["updatedAt"])),
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
      data: result.page
        .filter((receipt) => canSeeCollaborationReceipt(authorization, receipt))
        .map((receipt) =>
          omitMutableFields(receipt, [
            "lastViewedAt",
            "latestRevisionViewed",
            "updatedAt",
            "viewerRole",
            "viewCount",
          ])
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

async function buildRevisionChildArchivePage(
  ctx: QueryCtx,
  input: {
    cursor: string | null;
    postId: Id<"buildCollaborationPosts">;
    postRevisionCeiling?: number;
    revisionKind: "comment" | "post";
    section: CollaborationPostArchiveSection;
    snapshotAt: number;
  }
) {
  const state = decodeNestedArchiveCursor(input.cursor);
  let parent:
    | Doc<"buildCollaborationCommentRevisions">
    | Doc<"buildCollaborationPostRevisions">
    | null = null;
  let nextParentCursor = state.nextParentCursor;
  let outerIsDone = false;
  if (state.parentId) {
    parent =
      input.revisionKind === "post"
        ? await ctx.db.get(
            state.parentId as Id<"buildCollaborationPostRevisions">
          )
        : await ctx.db.get(
            state.parentId as Id<"buildCollaborationCommentRevisions">
          );
    if (
      !parent ||
      parent.postId !== input.postId ||
      parent.createdAt > input.snapshotAt ||
      (input.revisionKind === "post" &&
        input.postRevisionCeiling !== undefined &&
        parent.revision > input.postRevisionCeiling)
    ) {
      throw new Error("Archive revision cursor is invalid.");
    }
  } else if (input.revisionKind === "post") {
    const page = await ctx.db
      .query("buildCollaborationPostRevisions")
      .withIndex("by_postId_and_revision", (query) =>
        query.eq("postId", input.postId)
      )
      .filter((query) =>
        query.and(
          query.lte(query.field("createdAt"), input.snapshotAt),
          query.lte(
            query.field("revision"),
            input.postRevisionCeiling ?? Number.MAX_SAFE_INTEGER
          )
        )
      )
      .paginate({ cursor: state.nextParentCursor, numItems: 1 });
    parent = page.page[0] ?? null;
    nextParentCursor = page.continueCursor;
    outerIsDone = page.isDone;
  } else {
    const page = await ctx.db
      .query("buildCollaborationCommentRevisions")
      .withIndex("by_postId_and_createdAt", (query) =>
        query.eq("postId", input.postId).lte("createdAt", input.snapshotAt)
      )
      .paginate({ cursor: state.nextParentCursor, numItems: 1 });
    parent = page.page[0] ?? null;
    nextParentCursor = page.continueCursor;
    outerIsDone = page.isDone;
  }
  if (!parent) {
    return { continueCursor: "", data: [], isDone: true };
  }
  const childPage = await revisionChildPage(ctx, {
    cursor: state.childCursor,
    revisionId: parent._id,
    section: input.section,
    snapshotAt: input.snapshotAt,
  });
  const isDone = childPage.isDone && outerIsDone;
  return {
    continueCursor: isDone
      ? ""
      : encodeNestedArchiveCursor({
          childCursor: childPage.isDone ? null : childPage.continueCursor,
          nextParentCursor,
          parentId: childPage.isDone ? undefined : parent._id,
        }),
    data: childPage.page.map((row) => ({ revisionId: parent._id, row })),
    isDone,
  };
}

async function revisionChildPage(
  ctx: QueryCtx,
  input: {
    cursor: string | null;
    revisionId:
      | Id<"buildCollaborationCommentRevisions">
      | Id<"buildCollaborationPostRevisions">;
    section: CollaborationPostArchiveSection;
    snapshotAt: number;
  }
) {
  const pagination = { cursor: input.cursor, numItems: ARCHIVE_PAGE_SIZE };
  if (
    input.section === "post_revision_attachments" ||
    input.section === "comment_revision_attachments"
  ) {
    const ownerKind = input.section.startsWith("post_")
      ? "postRevision"
      : "commentRevision";
    return await ctx.db
      .query("buildCollaborationAttachments")
      .withIndex("by_ownerKind_and_ownerRecordId", (query) =>
        query.eq("ownerKind", ownerKind).eq("ownerRecordId", input.revisionId)
      )
      .filter((query) => query.lte(query.field("createdAt"), input.snapshotAt))
      .paginate(pagination);
  }
  if (input.section === "post_revision_audience_snapshots") {
    return await ctx.db
      .query("buildCollaborationAudienceSnapshots")
      .withIndex("by_postRevisionId_and_workosUserId", (query) =>
        query.eq(
          "postRevisionId",
          input.revisionId as Id<"buildCollaborationPostRevisions">
        )
      )
      .filter((query) => query.lte(query.field("createdAt"), input.snapshotAt))
      .paginate(pagination);
  }
  const ownerKind = input.section.startsWith("post_")
    ? "postRevision"
    : "commentRevision";
  return await ctx.db
    .query("buildCollaborationReferences")
    .withIndex("by_ownerKind_and_ownerRecordId", (query) =>
      query.eq("ownerKind", ownerKind).eq("ownerRecordId", input.revisionId)
    )
    .filter((query) => query.lte(query.field("createdAt"), input.snapshotAt))
    .paginate(pagination);
}

async function buildAcknowledgementEventArchivePage(
  ctx: QueryCtx,
  input: {
    cursor: string | null;
    postId: Id<"buildCollaborationPosts">;
    snapshotAt: number;
  }
) {
  const state = decodeNestedArchiveCursor(input.cursor);
  let target: Doc<"buildCollaborationAcknowledgementTargets"> | null = null;
  let nextParentCursor = state.nextParentCursor;
  let outerIsDone = false;
  if (state.parentId) {
    target = await ctx.db.get(
      state.parentId as Id<"buildCollaborationAcknowledgementTargets">
    );
    if (
      !target ||
      target.postId !== input.postId ||
      target.createdAt > input.snapshotAt
    ) {
      throw new Error("Archive acknowledgement cursor is invalid.");
    }
  } else {
    const page = await ctx.db
      .query("buildCollaborationAcknowledgementTargets")
      .withIndex("by_postId_and_createdAt", (query) =>
        query.eq("postId", input.postId).lte("createdAt", input.snapshotAt)
      )
      .paginate({ cursor: state.nextParentCursor, numItems: 1 });
    target = page.page[0] ?? null;
    nextParentCursor = page.continueCursor;
    outerIsDone = page.isDone;
  }
  if (!target) {
    return { continueCursor: "", data: [], isDone: true };
  }
  const targetId = target._id;
  const childPage = await ctx.db
    .query("buildCollaborationAcknowledgements")
    .withIndex("by_targetId", (query) => query.eq("targetId", targetId))
    .filter((query) =>
      query.lte(query.field("acknowledgedAt"), input.snapshotAt)
    )
    .paginate({ cursor: state.childCursor, numItems: ARCHIVE_PAGE_SIZE });
  return nestedPageResult(
    state,
    targetId,
    nextParentCursor,
    outerIsDone,
    childPage
  );
}

async function buildModerationEventArchivePage(
  ctx: QueryCtx,
  input: {
    authorization: ActiveBuildAuthorization;
    cursor: string | null;
    postId: Id<"buildCollaborationPosts">;
    snapshotAt: number;
  }
) {
  const state = decodeNestedArchiveCursor(input.cursor);
  let moderationCase: Doc<"buildCollaborationModerationCases"> | null = null;
  let nextParentCursor = state.nextParentCursor;
  let outerIsDone = false;
  if (state.parentId) {
    moderationCase = await ctx.db.get(
      state.parentId as Id<"buildCollaborationModerationCases">
    );
    if (
      !moderationCase ||
      moderationCase.postId !== input.postId ||
      moderationCase.createdAt > input.snapshotAt
    ) {
      throw new Error("Archive moderation cursor is invalid.");
    }
  } else {
    const page = await ctx.db
      .query("buildCollaborationModerationCases")
      .withIndex("by_postId_and_createdAt", (query) =>
        query.eq("postId", input.postId).lte("createdAt", input.snapshotAt)
      )
      .paginate({ cursor: state.nextParentCursor, numItems: 1 });
    moderationCase = page.page[0] ?? null;
    nextParentCursor = page.continueCursor;
    outerIsDone = page.isDone;
  }
  if (!moderationCase) {
    return { continueCursor: "", data: [], isDone: true };
  }
  const moderationCaseId = moderationCase._id;
  const childPage = await ctx.db
    .query("buildCollaborationModerationEvents")
    .withIndex("by_caseId_and_createdAt", (query) =>
      query.eq("caseId", moderationCaseId).lte("createdAt", input.snapshotAt)
    )
    .paginate({ cursor: state.childCursor, numItems: ARCHIVE_PAGE_SIZE });
  const result = nestedPageResult(
    state,
    moderationCaseId,
    nextParentCursor,
    outerIsDone,
    childPage
  );
  return {
    ...result,
    data: result.data.map(({ parentId, row }) => ({
      parentId,
      row: {
        ...row,
        newState: sanitizeModerationEvidenceSnapshot(
          input.authorization,
          row.newState
        ),
        priorState: sanitizeModerationEvidenceSnapshot(
          input.authorization,
          row.priorState
        ),
      },
    })),
  };
}

function nestedPageResult<T extends { _id: string }>(
  _state: NestedArchiveCursor,
  parentId: string,
  nextParentCursor: string | null,
  outerIsDone: boolean,
  childPage: {
    continueCursor: string;
    isDone: boolean;
    page: T[];
  }
) {
  const isDone = childPage.isDone && outerIsDone;
  return {
    continueCursor: isDone
      ? ""
      : encodeNestedArchiveCursor({
          childCursor: childPage.isDone ? null : childPage.continueCursor,
          nextParentCursor,
          parentId: childPage.isDone ? undefined : parentId,
        }),
    data: childPage.page.map((row) => ({ parentId, row })),
    isDone,
  };
}

function decodeNestedArchiveCursor(cursor: string | null): NestedArchiveCursor {
  if (!cursor) {
    return { childCursor: null, nextParentCursor: null };
  }
  try {
    return JSON.parse(cursor) as NestedArchiveCursor;
  } catch {
    throw new Error("Archive nested cursor is malformed.");
  }
}

function encodeNestedArchiveCursor(cursor: NestedArchiveCursor) {
  return JSON.stringify(cursor);
}

function omitMutableFields<T extends object>(row: T, keys: string[]) {
  const projection = { ...row } as Record<string, unknown>;
  for (const key of keys) {
    delete projection[key];
  }
  return projection;
}

function redactArchiveSnapshot(snapshot: CollaborationPostArchiveSnapshot) {
  const retainedFields = new Set([
    "createdAt",
    "postId",
    "redacted",
    "redactedFields",
    "revision",
    "updatedAt",
  ]);
  return {
    createdAt: snapshot.createdAt,
    postId: snapshot.postId,
    redacted: true,
    redactedFields: Object.keys(snapshot)
      .filter((key) => !retainedFields.has(key))
      .sort(),
    revision: snapshot.revision,
    updatedAt: snapshot.updatedAt,
  };
}

function redactArchivePost(post: Doc<"buildCollaborationPosts">) {
  return {
    ...omitMutableFields(post, [
      "acceptedCommentId",
      "commentCount",
      "currentRevisionId",
      "decisionOutcome",
      "decisionOwnerWorkosUserId",
      "latestActivityActorWorkosUserId",
      "openActionItemCount",
      "resolvedAt",
      "resolvedByWorkosUserId",
      "resolutionSummary",
      "systemDisposition",
      "systemLifecycle",
      "threadRevision",
      "threadState",
    ]),
    redacted: true,
    redactedFields: [
      "acceptedCommentId",
      "commentCount",
      "currentRevisionId",
      "decisionOutcome",
      "decisionOwnerWorkosUserId",
      "latestActivityActorWorkosUserId",
      "openActionItemCount",
      "resolvedAt",
      "resolvedByWorkosUserId",
      "resolutionSummary",
      "systemDisposition",
      "systemLifecycle",
      "threadRevision",
      "threadState",
    ],
  };
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

function stableActionItemChildRow(
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

export async function buildCollaborationPostArchive(
  ctx: QueryCtx,
  input: {
    authorization: ActiveBuildAuthorization;
    post: Doc<"buildCollaborationPosts">;
  }
) {
  const { authorization, post } = input;
  const drawCoordinationReadable =
    post.systemPostKind !== "draw" ||
    (await canReadDrawCoordination(ctx, { authorization, post }));
  const revisions = drawCoordinationReadable
    ? await limited(
        ctx.db
          .query("buildCollaborationPostRevisions")
          .withIndex("by_postId_and_revision", (query) =>
            query.eq("postId", post._id)
          )
          .take(ARCHIVE_ROW_LIMIT + 1),
        "post revisions"
      )
    : [];
  const revisionHistory: Record<string, unknown>[] = [];
  for (const revision of revisions) {
    revisionHistory.push({
      attachments: drawCoordinationReadable
        ? await ownerAttachments(ctx, "postRevision", revision._id)
        : [],
      audienceSnapshots: drawCoordinationReadable
        ? await limited(
            ctx.db
              .query("buildCollaborationAudienceSnapshots")
              .withIndex("by_postRevisionId_and_workosUserId", (query) =>
                query.eq("postRevisionId", revision._id)
              )
              .take(ARCHIVE_ROW_LIMIT + 1),
            "post audience snapshots"
          )
        : [],
      references: drawCoordinationReadable
        ? await ownerReferences(ctx, "postRevision", revision._id)
        : [],
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
  for (const comment of drawCoordinationReadable ? comments : []) {
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
  for (const item of drawCoordinationReadable ? actionItems : []) {
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
  for (const target of drawCoordinationReadable ? acknowledgementTargets : []) {
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
    acknowledgements: drawCoordinationReadable ? acknowledgements : [],
    actionItems: drawCoordinationReadable ? actionItemHistory : [],
    audienceMembers: drawCoordinationReadable ? await limited(
      ctx.db
        .query("buildCollaborationAudienceMembers")
        .withIndex("by_postId_and_workosUserId", (query) =>
          query.eq("postId", post._id)
        )
        .take(ARCHIVE_ROW_LIMIT + 1),
      "audience members"
    ) : [],
    comments: drawCoordinationReadable ? commentHistory : [],
    creationRequests: drawCoordinationReadable ? await limited(
      ctx.db
        .query("buildActionItemCreationRequests")
        .withIndex("by_postId_and_creatorWorkosUserId_and_requestId", (query) =>
          query.eq("postId", post._id)
        )
        .take(ARCHIVE_ROW_LIMIT + 1),
      "Action Item creation requests"
    ) : [],
    decisionOutcomeRevisions: drawCoordinationReadable ? await limited(
      ctx.db
        .query("buildCollaborationDecisionOutcomeRevisions")
        .withIndex("by_postId_and_revision", (query) =>
          query.eq("postId", post._id)
        )
        .take(ARCHIVE_ROW_LIMIT + 1),
      "decision outcome revisions"
    ) : [],
    follows: drawCoordinationReadable ? (
      await limited(
        ctx.db
          .query("buildCollaborationFollows")
          .withIndex("by_postId_and_workosUserId", (query) =>
            query.eq("postId", post._id)
          )
          .take(ARCHIVE_ROW_LIMIT + 1),
        "post follows"
      )
    ).filter((follow) => follow.workosUserId === authorization.viewer.subject) : [],
    moderation: drawCoordinationReadable
      ? await moderationHistory(ctx, authorization, "post", post._id)
      : [],
    pins: drawCoordinationReadable ? (
      await limited(
        ctx.db
          .query("buildCollaborationPins")
          .withIndex("by_postId_and_workosUserId_and_kind", (query) =>
            query.eq("postId", post._id)
          )
          .take(ARCHIVE_ROW_LIMIT + 1),
        "post pins"
      )
    ).filter((pin) => isVisibleArchivePin(authorization, pin)) : [],
    post: drawCoordinationReadable ? post : redactArchivePost(post),
    reactions: drawCoordinationReadable ? await limited(
      ctx.db
        .query("buildCollaborationReactions")
        .withIndex("by_postId_and_workosUserId", (query) =>
          query.eq("postId", post._id)
        )
        .take(ARCHIVE_ROW_LIMIT + 1),
      "post reactions"
    ) : [],
    receipts: drawCoordinationReadable ? (
      await limited(
        ctx.db
          .query("buildCollaborationReceipts")
          .withIndex("by_postId_and_workosUserId", (query) =>
            query.eq("postId", post._id)
          )
          .take(ARCHIVE_ROW_LIMIT + 1),
        "post receipts"
      )
    ).filter((receipt) => canSeeCollaborationReceipt(authorization, receipt)) : [],
    references: drawCoordinationReadable ? await limited(
      ctx.db
        .query("buildCollaborationReferences")
        .withIndex("by_postId", (query) => query.eq("postId", post._id))
        .take(ARCHIVE_ROW_LIMIT + 1),
      "post references"
    ) : [],
    revisions: revisionHistory,
    threadEvents: drawCoordinationReadable ? await limited(
      ctx.db
        .query("buildCollaborationThreadEvents")
        .withIndex("by_postId_and_createdAt", (query) =>
          query.eq("postId", post._id)
        )
        .take(ARCHIVE_ROW_LIMIT + 1),
      "thread events"
    ) : [],
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
