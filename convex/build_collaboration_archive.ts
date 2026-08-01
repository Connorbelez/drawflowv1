import type { ActiveBuildAuthorization } from "./activeBuildAccess";
import { canSeeCollaborationReceipt } from "./build_collaboration_access";
import type { Doc, QueryCtx } from "./types";

const ARCHIVE_ROW_LIMIT = 2000;

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
      ).filter((pin) => pin.workosUserId === authorization.viewer.subject),
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
    ).filter((pin) => pin.workosUserId === authorization.viewer.subject),
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
    history.push({
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
    });
  }
  return history;
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
