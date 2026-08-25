import type { ActiveBuildAuthorization } from "./activeBuildAccess";
import { backofficeRoleSlugs } from "./authz";
import { canSeeCollaborationReceipt } from "./build_collaboration_access";
import { projectCollaborationAssetAttachments } from "./build_collaboration_asset_projection";
import {
  collaborationModeratedContent,
  collaborationTombstoneContent,
} from "./build_collaboration_content";
import { canEditBuildCollaborationPost } from "./build_collaboration_editing";
import { collaborationModerationCapabilities } from "./build_collaboration_moderation";
import { resolveCurrentBuildCollaborationReference } from "./build_collaboration_references";
import { projectAcceptedBuildCollaborationAnswerForViewer } from "./build_collaboration_resolution";
import { canReadMilestoneSystemActionItem } from "./build_collaboration_system_event_access";
import {
  addBuildLocalDays,
  deriveMilestoneSystemActionItemPresentation,
} from "./build_collaboration_system_posts";
import {
  canReadDrawCoordination,
  projectDrawCoordinationState,
} from "./build_draw_coordination";
import type { Doc, QueryCtx } from "./types";

const MAX_REFERENCES_PER_POST = 100;
const MAX_ACTION_ITEMS_PER_POST = 100;
const PROPOSAL_ROW_OCCURRENCE_PATTERN = /proposal-row:([^:/]+)/;
const LEGACY_DRAW_KEY_OCCURRENCE_PATTERN = /legacy-key:([^:]+)/;

interface SystemMilestonePlanningSummary {
  attention: {
    assignmentGaps: number;
    dependencyExceptions: number;
    overdueCompletion: number;
    requiredSiteVisits: number;
    reviewSla: number;
  };
  counts: {
    approved: number;
    backlog: number;
    behind_schedule: number;
    in_progress: number;
    in_review: number;
    superseded: number;
  };
  lifecycle: "open" | "resolved" | "reopened";
  readyForApproval: boolean;
}

interface SystemDrawFacts {
  approval: {
    approvedAt?: string;
    note?: string;
    state:
      | "not_started"
      | "pending"
      | "approved"
      | "final_decline"
      | "withdrawn"
      | "cancelled"
      | "released";
  };
  disposition?: {
    at?: string;
    kind: "withdrawal" | "cancellation" | "final_decline" | "released";
    note?: string;
  };
  evidence: {
    assetCount: number;
    locationUnverifiedCount: number;
    state:
      | "not_started"
      | "submitted"
      | "location_unverified"
      | "approved"
      | "changes_requested";
  };
  generatedActionItems: number;
  occurrenceKey: string;
  planned?: {
    _id: Doc<"plannedDrawScheduleRows">["_id"];
    amountCents: number;
    drawKey: string;
    label: string;
    milestoneKey?: string;
    scheduledDate?: string;
    status: Doc<"plannedDrawScheduleRows">["status"];
    timingDay: number;
  };
  release: {
    releasedAt?: string;
    releaseDate?: string;
    note?: string;
    state:
      | "not_started"
      | "approved_for_release"
      | "released"
      | "withdrawn"
      | "cancelled"
      | "final_decline";
  };
  request?: {
    _id: Doc<"activeBuildDrawRequests">["_id"];
    amountCents: number;
    displayId: string;
    note?: string;
    requestedAt: string;
    requestKey: string;
    status: Doc<"activeBuildDrawRequests">["status"];
  };
  review: {
    operationsReviewStartedAt?: string;
    recommendationNote?: string;
    reviewedAt?: string;
    state:
      | "not_started"
      | "in_review"
      | "ready_for_admin"
      | "approved"
      | "final_decline"
      | "withdrawn"
      | "cancelled"
      | "released";
    note?: string;
  };
  siteVisit: {
    cancelled: number;
    complete: number;
    count: number;
    requested: number;
  };
}

export async function projectReadableBuildCollaborationPost(
  ctx: QueryCtx,
  input: {
    asOf?: number;
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
    systemAuthored: post.systemPostKind !== undefined,
    viewerRole: authorization.effectiveRole.role,
    viewerWorkosUserId: authorization.viewer.subject,
  });
  const activationPlanningRevision = post.activationPlanningRevisionId
    ? await ctx.db.get(post.activationPlanningRevisionId)
    : null;
  if (post.contentState !== "active") {
    const replacement =
      post.contentState === "tombstoned"
        ? collaborationTombstoneContent("post")
        : collaborationModeratedContent("post");
    return {
      acknowledgement: { acknowledged: false, required: false },
      actionItems: [],
      attachments: [],
      following: false,
      kind: "post" as const,
      pins: [],
      post: collaborationPostSummary({
        authorization,
        moderationCapabilities,
        post,
        redacted: true,
        planningSummary: undefined,
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
  const drawCoordinationReadable =
    post.systemPostKind === "draw" &&
    (await canReadDrawCoordination(ctx, { authorization, post }));
  const acknowledgementTarget = acknowledgementTargets.find(
    (target) => !target.waivedAt
  );
  const attachments = await projectCollaborationAssetAttachments(ctx, {
    buildId: authorization.build._id,
    organizationId: authorization.organizationId,
    ownerKind: "postRevision",
    ownerRecordId: revision._id,
  });
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
  const canonicalMilestoneId = post.canonicalBuildMilestoneId;
  const canonicalMilestone = canonicalMilestoneId
    ? await ctx.db.get(canonicalMilestoneId)
    : null;
  const systemRecoveryRequired =
    post.systemPostKind === "milestone" && canonicalMilestone
      ? (
          await ctx.db
            .query("buildSubmilestones")
            .withIndex("by_milestone", (query) =>
              query.eq("buildMilestoneId", canonicalMilestone._id)
            )
            .take(1)
        ).length === 0
      : false;
  const readableActionItems = [] as Doc<"buildActionItems">[];
  for (const item of actionItems) {
    if (post.systemPostKind === "draw" && !drawCoordinationReadable) {
      continue;
    }
    if (
      await canReadMilestoneSystemActionItem(ctx, {
        actionItem: item,
        buildId: authorization.build._id,
        role: authorization.effectiveRole.role,
        workosUserId: authorization.viewer.subject,
      })
    ) {
      readableActionItems.push(item);
    }
  }
  // Prefer a caller-supplied as-of so feed queries stay deterministic when the
  // client passes a stable clock; fall back only when the caller omits it.
  const asOf = input.asOf ?? Date.now();
  const projectedActionItems = await Promise.all(
    readableActionItems.map((item) =>
      projectActionItemSummary(ctx, authorization, item, asOf)
    )
  );
  const planningSummary =
    post.systemPostKind === "milestone"
      ? deriveSystemMilestonePlanningSummary({
          actionItems: projectedActionItems,
          lifecycle: visibleSystemPostLifecycle(post),
        })
      : undefined;
  const drawFacts =
    post.systemPostKind === "draw" && drawCoordinationReadable
      ? await projectSystemDrawFacts(ctx, {
          authorization,
          generatedActionItems: projectedActionItems.length,
          post,
        })
      : undefined;
  const drawCoordination =
    post.systemPostKind === "draw" && drawCoordinationReadable
      ? await projectDrawCoordinationState(ctx, { authorization, post })
      : undefined;
  const drawCoordinationRedacted =
    post.systemPostKind === "draw" && !drawCoordinationReadable;
  const projectedAttachments =
    post.systemPostKind === "draw" && !drawCoordinationReadable
      ? []
      : attachments;
  const projectedReferences =
    post.systemPostKind === "draw" && !drawCoordinationReadable
      ? []
      : references;
  return {
    acknowledgement: drawCoordinationRedacted
      ? { acknowledged: false, required: false }
      : acknowledgementTarget
        ? {
            acknowledged: acknowledgements.some(
              (acknowledgement) =>
                acknowledgement.acknowledgedRevision >= post.revision
            ),
            dueAt: acknowledgementTarget.dueAt,
            required: true,
          }
        : { acknowledged: false, required: false },
    actionItems: projectedActionItems,
    attachments: projectedAttachments,
    following:
      post.systemPostKind === "draw" && !drawCoordinationReadable
        ? false
        : follows.some((follow) => follow.active),
    kind: "post" as const,
    pins: drawCoordinationRedacted
      ? []
      : pins.map((pin) => ({
          _creationTime: pin._creationTime,
          _id: pin._id,
        })),
    post: collaborationPostSummary({
      authorization,
      moderationCapabilities,
      post,
      milestoneKey: canonicalMilestone?.key,
      redacted: false,
      coordinationRedacted: drawCoordinationRedacted,
      commentCountOverride:
        post.systemPostKind === "draw" && !drawCoordinationReadable
          ? 0
          : undefined,
      resolutionSummary: projectedResolutionSummary,
      systemRecoveryRequired,
      planningSummary,
      activationPlanningRevision: activationPlanningRevision?.revision,
      drawFacts,
      drawCoordination,
    }),
    reactions: (post.systemPostKind === "draw" && !drawCoordinationReadable
      ? []
      : reactions
    )
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
    receipts: (post.systemPostKind === "draw" && !drawCoordinationReadable
      ? []
      : receipts
    )
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
      projectedReferences.map(async (reference) => {
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


import {
  deriveSystemMilestonePlanningSummary,
  visibleSystemPostLifecycle,
  projectSystemDrawFacts,
  projectActionItemSummary,
  collaborationPostSummary,
} from "./build_collaboration_projection/helpers";
