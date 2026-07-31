import type { ActiveBuildAuthorization } from "./activeBuildAccess";
import { canSeeCollaborationReceipt } from "./build_collaboration_access";
import {
  collaborationModeratedContent,
  collaborationTombstoneContent,
} from "./build_collaboration_content";
import { collaborationModerationCapabilities } from "./build_collaboration_moderation";
import { resolveCurrentBuildCollaborationReference } from "./build_collaboration_references";
import { projectAcceptedBuildCollaborationAnswerForViewer } from "./build_collaboration_resolution";
import type { Doc, QueryCtx } from "./types";

const MAX_REFERENCES_PER_POST = 100;
const MAX_ACTION_ITEMS_PER_POST = 100;

/**
 * Produces the canonical, viewer-scoped post shape used by both the paginated
 * feed and focused deep-link hydration. Callers must authorize the Build and
 * verify that the viewer can read the post before invoking this projector.
 */
export async function projectReadableBuildCollaborationPost(
  ctx: QueryCtx,
  input: {
    authorization: ActiveBuildAuthorization;
    post: Doc<"buildCollaborationPosts">;
    unavailableKey: string;
  }
) {
  const { authorization, post } = input;
  const revision = post.currentRevisionId
    ? await ctx.db.get(post.currentRevisionId)
    : null;
  if (!revision || revision.postId !== post._id) {
    return {
      kind: "unavailable" as const,
      placeholderKey: input.unavailableKey,
    };
  }
  const moderationCase = post.activeModerationCaseId
    ? await ctx.db.get(post.activeModerationCaseId)
    : null;
  const moderationCapabilities = collaborationModerationCapabilities({
    authorRole: post.authorRole,
    authorWorkosUserId: post.authorWorkosUserId,
    caseStatus: moderationCase?.status,
    contentState: post.contentState,
    minimumReviewerTier: moderationCase?.appealReviewerMinimumTier,
    viewerRole: authorization.effectiveRole.role,
    viewerWorkosUserId: authorization.viewer.subject,
  });
  if (post.contentState !== "active") {
    const replacement =
      post.contentState === "tombstoned"
        ? collaborationTombstoneContent("post")
        : collaborationModeratedContent("post");
    return {
      acknowledgement: { acknowledged: false, required: false },
      actionItems: [],
      following: false,
      kind: "post" as const,
      pins: [],
      post: collaborationPostSummary({
        authorization,
        moderationCapabilities,
        post,
        redacted: true,
      }),
      reactions: [],
      receipts: [],
      references: [],
      revision: {
        _creationTime: revision._creationTime,
        _id: revision._id,
        createdAt: post.updatedAt,
        editReason: undefined,
        plainText: replacement.plainText,
        revision: post.revision,
        tiptapJson: replacement.tiptapJson,
      },
    };
  }
  const [
    references,
    actionItems,
    reactions,
    pins,
    receipts,
    follows,
    acknowledgementTargets,
    acknowledgements,
  ] = await Promise.all([
    ctx.db
      .query("buildCollaborationReferences")
      .withIndex("by_ownerKind_and_ownerRecordId", (query) =>
        query.eq("ownerKind", "postRevision").eq("ownerRecordId", revision._id)
      )
      .take(MAX_REFERENCES_PER_POST),
    ctx.db
      .query("buildActionItems")
      .withIndex("by_originatingPostId_and_status", (query) =>
        query.eq("originatingPostId", post._id)
      )
      .take(MAX_ACTION_ITEMS_PER_POST),
    ctx.db
      .query("buildCollaborationReactions")
      .withIndex("by_postId_and_workosUserId", (query) =>
        query.eq("postId", post._id)
      )
      .take(500),
    ctx.db
      .query("buildCollaborationPins")
      .withIndex("by_postId_and_workosUserId_and_kind", (query) =>
        query
          .eq("postId", post._id)
          .eq("workosUserId", authorization.viewer.subject)
      )
      .take(20),
    ctx.db
      .query("buildCollaborationReceipts")
      .withIndex("by_postId_and_workosUserId", (query) =>
        query.eq("postId", post._id)
      )
      .take(500),
    ctx.db
      .query("buildCollaborationFollows")
      .withIndex("by_postId_and_workosUserId", (query) =>
        query
          .eq("postId", post._id)
          .eq("workosUserId", authorization.viewer.subject)
      )
      .take(20),
    ctx.db
      .query("buildCollaborationAcknowledgementTargets")
      .withIndex("by_postId_and_workosUserId", (query) =>
        query
          .eq("postId", post._id)
          .eq("workosUserId", authorization.viewer.subject)
      )
      .take(20),
    ctx.db
      .query("buildCollaborationAcknowledgements")
      .withIndex("by_postId_and_workosUserId", (query) =>
        query
          .eq("postId", post._id)
          .eq("workosUserId", authorization.viewer.subject)
      )
      .take(20),
  ]);
  const acknowledgementTarget = acknowledgementTargets.find(
    (target) => !target.waivedAt
  );
  const projectedResolutionSummary =
    post.postType === "question" &&
    post.threadState === "resolved" &&
    post.acceptedCommentId
      ? (
          await projectAcceptedBuildCollaborationAnswerForViewer(ctx, {
            authorization,
            commentId: post.acceptedCommentId,
            post,
          })
        )?.plainText
      : post.resolutionSummary;
  return {
    acknowledgement: acknowledgementTarget
      ? {
          acknowledged: acknowledgements.some(
            (acknowledgement) =>
              acknowledgement.acknowledgedRevision >= post.revision
          ),
          dueAt: acknowledgementTarget.dueAt,
          required: true,
        }
      : { acknowledged: false, required: false },
    actionItems: actionItems.map((item) => ({
      _creationTime: item._creationTime,
      _id: item._id,
      currentRevision: item.currentRevision,
      priority: item.priority,
      status: item.status,
      title: item.title,
    })),
    following: follows.some((follow) => follow.active),
    kind: "post" as const,
    pins: pins.map((pin) => ({
      _creationTime: pin._creationTime,
      _id: pin._id,
    })),
    post: collaborationPostSummary({
      authorization,
      moderationCapabilities,
      post,
      redacted: false,
      resolutionSummary: projectedResolutionSummary,
    }),
    reactions: reactions
      .filter(
        (reaction) =>
          reaction.commentId === undefined &&
          reaction.organizationId === authorization.organizationId &&
          reaction.brokerageId === authorization.brokerage._id &&
          reaction.buildId === authorization.build._id &&
          reaction.postId === post._id
      )
      .map((reaction) => ({
        _creationTime: reaction._creationTime,
        _id: reaction._id,
        reaction: reaction.reaction,
        workosUserId: reaction.workosUserId,
      })),
    receipts: receipts
      .filter((receipt) => canSeeCollaborationReceipt(authorization, receipt))
      .map((receipt) => ({
        _creationTime: receipt._creationTime,
        _id: receipt._id,
        lastViewedAt: receipt.lastViewedAt,
        latestRevisionViewed: receipt.latestRevisionViewed,
        viewerRole: receipt.viewerRole,
        workosUserId: receipt.workosUserId,
      })),
    references: await Promise.all(
      references.map(async (reference) => {
        try {
          const current = await resolveCurrentBuildCollaborationReference(ctx, {
            authorization,
            entityId: reference.entityId,
            entityKind: reference.entityKind,
          });
          return {
            _creationTime: reference._creationTime,
            _id: reference._id,
            entityId: reference.entityId,
            entityKind: reference.entityKind,
            labelSnapshot: current.label,
            summarySnapshot: current.summary,
          };
        } catch {
          return {
            _creationTime: reference._creationTime,
            _id: reference._id,
            entityId: reference.entityId,
            entityKind: reference.entityKind,
            labelSnapshot: "Unavailable reference",
            summarySnapshot: undefined,
          };
        }
      })
    ),
    revision: {
      _creationTime: revision._creationTime,
      _id: revision._id,
      createdAt: revision.createdAt,
      editReason: revision.editReason,
      plainText: revision.plainText,
      revision: revision.revision,
      tiptapJson: revision.tiptapJson,
    },
  };
}

function collaborationPostSummary(input: {
  authorization: ActiveBuildAuthorization;
  moderationCapabilities: {
    canAppeal: boolean;
    canModerate: boolean;
    canResolveAppeal: boolean;
  };
  post: Doc<"buildCollaborationPosts">;
  redacted: boolean;
  resolutionSummary?: string;
}) {
  const {
    authorization,
    moderationCapabilities,
    post,
    redacted,
    resolutionSummary,
  } = input;
  const viewerIsAuthor =
    post.authorWorkosUserId === authorization.viewer.subject;
  const decisionOwnerDisplayName =
    !redacted && post.decisionOwnerWorkosUserId
      ? (authorization.participants.find(
          (participant) =>
            participant.workosUserId === post.decisionOwnerWorkosUserId
        )?.displayName ?? "Former Build participant")
      : undefined;
  return {
    _creationTime: post._creationTime,
    _id: post._id,
    acceptedCommentId: redacted ? undefined : post.acceptedCommentId,
    agentDrafted: post.agentDrafted,
    announcementExpiresAt: redacted ? undefined : post.announcementExpiresAt,
    announcementProminent:
      !redacted &&
      post.postType === "announcement" &&
      (post.announcementProminent ?? true),
    audienceMode: post.audienceMode,
    authorDisplayNameSnapshot: post.authorDisplayNameSnapshot,
    authorRole: post.authorRole,
    authorWorkosUserId: post.authorWorkosUserId,
    commentCount: redacted ? 0 : post.commentCount,
    contentState: post.contentState,
    createdAt: post.createdAt,
    decisionOutcome: redacted ? undefined : post.decisionOutcome,
    decisionOwnerDisplayName,
    decisionOwnerWorkosUserId: redacted
      ? undefined
      : post.decisionOwnerWorkosUserId,
    postType: post.postType,
    readRevision: post.readRevision ?? post.revision,
    resolutionSummary: redacted ? undefined : resolutionSummary,
    resolvedAt: post.resolvedAt,
    revision: post.revision,
    source: post.source,
    threadState: post.threadState,
    updatedAt: post.updatedAt,
    viewerCanAppeal: moderationCapabilities.canAppeal,
    viewerCanManageThread:
      !redacted && (viewerIsAuthor || authorization.effectiveRole.tier >= 3),
    viewerCanModerate: moderationCapabilities.canModerate,
    viewerCanResolveAppeal: moderationCapabilities.canResolveAppeal,
    viewerIsAuthor,
  };
}
