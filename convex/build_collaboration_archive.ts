import type { ActiveBuildAuthorization } from "./activeBuildAccess";
import { canSeeCollaborationReceipt } from "./build_collaboration_access";
import { canReadDrawCoordination } from "./build_draw_coordination";
import { canReadMilestoneSystemActionItem } from "./build_collaboration_system_event_access";
import type { Doc, Id, QueryCtx } from "./types";
import { ARCHIVE_PAGE_SIZE, ARCHIVE_ROW_LIMIT } from "./build_collaboration_archive/contracts";
import type {
  ActionItemChildArchiveCursor,
  ActionItemChildArchiveSection,
  BuildCollaborationHistoryArchiveSection,
  CollaborationPostArchiveSection,
  CollaborationPostArchiveSnapshot,
  NestedArchiveCursor,
} from "./build_collaboration_archive/contracts";
import {
  buildAcknowledgementEventArchivePage,
  buildModerationEventArchivePage,
  buildRevisionChildArchivePage,
  decodeNestedArchiveCursor,
  encodeNestedArchiveCursor,
  omitMutableFields,
  redactArchivePost,
  redactArchiveSnapshot,
} from "./build_collaboration_archive/revision";
import {
  archiveActionItem,
  archiveActionItemSnapshot,
  buildActionItemChildArchivePage,
  decodeActionItemChildCursor,
  encodeActionItemChildCursor,
} from "./build_collaboration_archive/action_items";
import {
  isVisibleArchivePin,
  moderationHistory,
  sanitizeModerationEvidenceSnapshot,
} from "./build_collaboration_archive/moderation";
import { limited, ownerAttachments, ownerReferences } from "./build_collaboration_archive/common";

export { COLLABORATION_POST_ARCHIVE_SECTIONS } from "./build_collaboration_archive/contracts";
export type {
  BuildCollaborationHistoryArchiveSection,
  CollaborationPostArchiveSection,
  CollaborationPostArchiveSnapshot,
} from "./build_collaboration_archive/contracts";

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
    if (
      !(await canReadMilestoneSystemActionItem(ctx, {
        actionItem: item,
        buildId: authorization.build._id,
        role: authorization.effectiveRole.role,
        workosUserId: authorization.viewer.subject,
      }))
    ) {
      continue;
    }
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
