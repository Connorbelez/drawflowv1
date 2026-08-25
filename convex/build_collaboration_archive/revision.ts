import type { ActiveBuildAuthorization } from "../activeBuildAccess";
import type { Doc, Id, QueryCtx } from "../types";
import { ARCHIVE_PAGE_SIZE } from "./contracts";
import { sanitizeModerationEvidenceSnapshot } from "./moderation";
import type {
  CollaborationPostArchiveSection,
  CollaborationPostArchiveSnapshot,
  NestedArchiveCursor,
} from "./contracts";

export async function buildRevisionChildArchivePage(
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

export async function revisionChildPage(
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

export async function buildAcknowledgementEventArchivePage(
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

export async function buildModerationEventArchivePage(
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

export function nestedPageResult<T extends { _id: string }>(
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

export function decodeNestedArchiveCursor(cursor: string | null): NestedArchiveCursor {
  if (!cursor) {
    return { childCursor: null, nextParentCursor: null };
  }
  try {
    return JSON.parse(cursor) as NestedArchiveCursor;
  } catch {
    throw new Error("Archive nested cursor is malformed.");
  }
}

export function encodeNestedArchiveCursor(cursor: NestedArchiveCursor) {
  return JSON.stringify(cursor);
}

export function omitMutableFields<T extends object>(row: T, keys: string[]) {
  const projection = { ...row } as Record<string, unknown>;
  for (const key of keys) {
    delete projection[key];
  }
  return projection;
}

export function redactArchiveSnapshot(snapshot: CollaborationPostArchiveSnapshot) {
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

export function redactArchivePost(post: Doc<"buildCollaborationPosts">) {
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

