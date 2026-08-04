import type { ActiveBuildAuthorization } from "./activeBuildAccess";
import { canSeeCollaborationReceipt } from "./build_collaboration_access";
import {
  canReadDrawCoordination,
  projectDrawCoordinationState,
} from "./build_draw_coordination";
import { projectCollaborationAssetAttachments } from "./build_collaboration_asset_projection";
import {
  collaborationModeratedContent,
  collaborationTombstoneContent,
} from "./build_collaboration_content";
import { collaborationModerationCapabilities } from "./build_collaboration_moderation";
import { resolveCurrentBuildCollaborationReference } from "./build_collaboration_references";
import { projectAcceptedBuildCollaborationAnswerForViewer } from "./build_collaboration_resolution";
import { canReadMilestoneSystemActionItem } from "./build_collaboration_system_event_access";
import {
  addBuildLocalDays,
  deriveMilestoneSystemActionItemPresentation,
} from "./build_collaboration_system_posts";
import type { Doc, QueryCtx } from "./types";

const MAX_REFERENCES_PER_POST = 100;
const MAX_ACTION_ITEMS_PER_POST = 100;

type SystemMilestonePlanningSummary = {
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
};

type SystemDrawFacts = {
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
};

function deriveSystemMilestonePlanningSummary(input: {
  actionItems: Array<{
    dependencyCount: number;
    systemPresentation?: {
      column:
        | "backlog"
        | "behind_schedule"
        | "in_progress"
        | "in_review"
        | "approved"
        | "superseded";
      executionOwnership?: { state: "assigned" | "assignment_required" };
      attention?: "overdue_completion";
      evidenceReviewState?:
        | "not_ready"
        | "in_review"
        | "changes_requested"
        | "approved";
      reviewDecisionState?:
        | "in_review"
        | "changes_requested"
        | "approved"
        | "reopened";
      parentReadyForApproval?: boolean;
      siteVisitRequirement?: { status: string };
    };
  }>;
  lifecycle: "open" | "resolved" | "reopened";
}): SystemMilestonePlanningSummary {
  const counts = {
    approved: 0,
    backlog: 0,
    behind_schedule: 0,
    in_progress: 0,
    in_review: 0,
    superseded: 0,
  };
  const attention = {
    assignmentGaps: 0,
    dependencyExceptions: 0,
    overdueCompletion: 0,
    requiredSiteVisits: 0,
    reviewSla: 0,
  };
  let activeCount = 0;
  let readyCount = 0;
  for (const actionItem of input.actionItems) {
    const presentation = actionItem.systemPresentation;
    if (!presentation) continue;
    counts[presentation.column] += 1;
    if (presentation.column !== "superseded") {
      activeCount += 1;
      if (presentation.parentReadyForApproval === true) readyCount += 1;
    }
    if (presentation.executionOwnership?.state === "assignment_required") {
      attention.assignmentGaps += 1;
    }
    attention.dependencyExceptions += Math.max(0, actionItem.dependencyCount);
    if (presentation.attention === "overdue_completion") {
      attention.overdueCompletion += 1;
    }
    if (
      presentation.evidenceReviewState === "in_review" ||
      presentation.reviewDecisionState === "in_review"
    ) {
      attention.reviewSla += 1;
    }
    if (presentation.siteVisitRequirement?.status === "required") {
      attention.requiredSiteVisits += 1;
    }
  }
  return {
    attention,
    counts,
    lifecycle: input.lifecycle,
    readyForApproval: activeCount > 0 && readyCount === activeCount,
  };
}

async function projectSystemDrawFacts(
  ctx: QueryCtx,
  input: {
    authorization: ActiveBuildAuthorization;
    post: Doc<"buildCollaborationPosts">;
  },
): Promise<SystemDrawFacts | undefined> {
  const { authorization, post } = input;
  if (post.systemPostKind !== "draw" || !post.systemOccurrenceKey) {
    return undefined;
  }
  const plannedRows = await ctx.db
    .query("plannedDrawScheduleRows")
    .withIndex("by_build_order", (query) =>
      query.eq("buildId", authorization.build._id),
    )
    .take(500);
  const primaryPlannedId = post.primaryReferenceKind === "draw"
    ? ctx.db.normalizeId("plannedDrawScheduleRows", post.primaryReferenceId ?? "")
    : null;
  const planned =
    (primaryPlannedId
      ? plannedRows.find((row) => row._id === primaryPlannedId)
      : undefined) ??
    plannedRows.find((row) =>
      post.canonicalBuildDrawOccurrenceKey?.includes(
        `proposal-row:${String(row.proposalDrawScheduleRowId)}`,
      ),
    );
  const requests = await ctx.db
    .query("activeBuildDrawRequests")
    .withIndex("by_build", (query) => query.eq("buildId", authorization.build._id))
    .take(500);
  const primaryRequestId = post.primaryReferenceKind === "draw"
    ? ctx.db.normalizeId("activeBuildDrawRequests", post.primaryReferenceId ?? "")
    : null;
  const request =
    (primaryRequestId
      ? requests.find((candidate) => candidate._id === primaryRequestId)
      : undefined) ??
    requests
      .filter(
        (candidate) =>
          planned !== undefined && candidate.plannedDrawKey === planned.drawKey,
      )
      .sort((left, right) => right.createdAt - left.createdAt)[0];

  const allocations = request
    ? await ctx.db
        .query("activeBuildDrawRequestAllocations")
        .withIndex("by_request", (query) => query.eq("drawRequestId", request._id))
        .take(500)
    : [];
  const milestoneKeys = [
    ...new Set([
      ...allocations.map((allocation) => allocation.milestoneKey),
      ...(planned?.milestoneKey ? [planned.milestoneKey] : []),
    ]),
  ];
  const [evidenceAssets, siteVisits, milestones] = await Promise.all([
    Promise.all(
      milestoneKeys.map((milestoneKey) =>
        ctx.db
          .query("buildEvidenceAssets")
          .withIndex("by_build_milestone", (query) =>
            query.eq("buildId", authorization.build._id).eq("milestoneKey", milestoneKey),
          )
          .take(500),
      ),
    ).then((groups) => groups.flat()),
    Promise.all(
      milestoneKeys.map((milestoneKey) =>
        ctx.db
          .query("buildSiteVisits")
          .withIndex("by_build_milestone", (query) =>
            query.eq("buildId", authorization.build._id).eq("milestoneKey", milestoneKey),
          )
          .take(100),
      ),
    ).then((groups) => groups.flat()),
    Promise.all(
      milestoneKeys.map((milestoneKey) =>
        ctx.db
          .query("buildMilestones")
          .withIndex("by_build_key", (query) =>
            query.eq("buildId", authorization.build._id).eq("key", milestoneKey),
          )
          .first(),
      ),
    ).then((rows) => rows.filter((row): row is Doc<"buildMilestones"> => row !== null)),
  ]);
  const locationUnverifiedCount = evidenceAssets.filter(
    (asset) => !asset.locationVerified,
  ).length;
  const evidenceApproved =
    evidenceAssets.length > 0 &&
    milestones.length > 0 &&
    milestones.every((milestone) => milestone.completionReview?.status === "approved");
  const evidenceState =
    evidenceApproved
      ? ("approved" as const)
      : locationUnverifiedCount > 0
        ? ("location_unverified" as const)
        : evidenceAssets.length > 0
          ? ("submitted" as const)
          : ("not_started" as const);
  const reviewState = !request
    ? ("not_started" as const)
    : request.status === "in_review"
      ? ("in_review" as const)
      : request.status === "ready_for_admin"
        ? ("ready_for_admin" as const)
        : request.status === "approved_for_release" || request.status === "approved"
          ? ("approved" as const)
          : request.status === "rejected"
            ? ("final_decline" as const)
            : request.status === "withdrawn"
              ? ("withdrawn" as const)
              : request.status === "cancelled"
                ? ("cancelled" as const)
                : request.status === "released"
                  ? ("released" as const)
                  : ("not_started" as const);
  const approvalState = !request
    ? ("not_started" as const)
    : request.status === "approved_for_release" || request.status === "approved"
      ? ("approved" as const)
      : request.status === "released"
        ? ("released" as const)
        : request.status === "rejected"
          ? ("final_decline" as const)
          : request.status === "withdrawn"
            ? ("withdrawn" as const)
            : request.status === "cancelled"
              ? ("cancelled" as const)
              : ("pending" as const);
  const releaseState = !request
    ? ("not_started" as const)
    : request.status === "released"
      ? ("released" as const)
      : request.status === "approved_for_release" || request.status === "approved"
        ? ("approved_for_release" as const)
        : request.status === "rejected"
          ? ("final_decline" as const)
          : request.status === "withdrawn"
            ? ("withdrawn" as const)
            : request.status === "cancelled"
              ? ("cancelled" as const)
              : ("not_started" as const);
  const disposition = request
    ? request.status === "released"
      ? { at: request.releasedAt, kind: "released" as const, note: request.releaseNote }
      : request.status === "withdrawn"
        ? { at: request.withdrawnAt, kind: "withdrawal" as const, note: request.withdrawalNote }
        : request.status === "cancelled"
          ? { at: request.cancelledAt, kind: "cancellation" as const, note: request.cancellationNote }
          : request.status === "rejected"
            ? { at: request.reviewedAt, kind: "final_decline" as const, note: request.reviewNote }
            : undefined
    : undefined;
  let scheduledDate: string | undefined;
  if (planned && authorization.build.timezone) {
    try {
      scheduledDate = addBuildLocalDays(
        authorization.build.startDate,
        planned.timingDay,
      );
    } catch {
      scheduledDate = undefined;
    }
  }
  return {
    approval: {
      ...(request?.reviewedAt ? { approvedAt: request.reviewedAt } : {}),
      ...(request?.reviewNote ? { note: request.reviewNote } : {}),
      state: approvalState,
    },
    ...(disposition ? { disposition } : {}),
    evidence: {
      assetCount: evidenceAssets.length,
      locationUnverifiedCount,
      state: evidenceState,
    },
    generatedActionItems: 0,
    occurrenceKey: post.systemOccurrenceKey,
    ...(planned
      ? {
          planned: {
            _id: planned._id,
            amountCents: planned.amountCents,
            drawKey: planned.drawKey,
            label: planned.label,
            ...(planned.milestoneKey ? { milestoneKey: planned.milestoneKey } : {}),
            ...(scheduledDate ? { scheduledDate } : {}),
            status: planned.status,
            timingDay: planned.timingDay,
          },
        }
      : {}),
    release: {
      ...(request?.releasedAt ? { releasedAt: request.releasedAt } : {}),
      ...(request?.releaseDate ? { releaseDate: request.releaseDate } : {}),
      ...(request?.releaseNote ? { note: request.releaseNote } : {}),
      state: releaseState,
    },
    ...(request
      ? {
          request: {
            _id: request._id,
            amountCents: request.amountCents,
            displayId: request.displayId,
            ...(request.note ? { note: request.note } : {}),
            requestedAt: request.requestedAt,
            requestKey: request.requestKey,
            status: request.status,
          },
        }
      : {}),
    review: {
      ...(request?.operationsReviewStartedAt
        ? { operationsReviewStartedAt: request.operationsReviewStartedAt }
        : {}),
      ...(request?.operationsRecommendationNote
        ? { recommendationNote: request.operationsRecommendationNote }
        : {}),
      ...(request?.reviewedAt ? { reviewedAt: request.reviewedAt } : {}),
      state: reviewState,
      ...(request?.reviewNote ? { note: request.reviewNote } : {}),
    },
    siteVisit: {
      cancelled: siteVisits.filter((visit) => visit.status === "cancelled").length,
      complete: siteVisits.filter((visit) => visit.status === "complete").length,
      count: siteVisits.length,
      requested: siteVisits.filter((visit) => visit.status === "requested").length,
    },
  };
}

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
        systemRecoveryRequired:
          post.systemPostKind === "milestone" && post.openActionItemCount === 0,
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
  const systemRecoveryRequired =
    post.systemPostKind === "milestone" && canonicalMilestoneId
      ? (
          await ctx.db
            .query("buildSubmilestones")
            .withIndex("by_milestone", (query) =>
              query.eq("buildMilestoneId", canonicalMilestoneId)
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
  const asOf = Date.now();
  const projectedActionItems = await Promise.all(
    readableActionItems.map((item) =>
      projectActionItemSummary(ctx, authorization, item, asOf)
    )
  );
    const planningSummary =
      post.systemPostKind === "milestone"
      ? deriveSystemMilestonePlanningSummary({
          actionItems: projectedActionItems,
          lifecycle:
            post.systemLifecycle ??
            (post.threadState === "resolved" ? "resolved" : "open"),
        })
      : undefined;
  const drawFacts =
    post.systemPostKind === "draw"
      ? await projectSystemDrawFacts(ctx, { authorization, post })
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
      : reactions)
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
      : receipts)
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

async function projectActionItemSummary(
  ctx: QueryCtx,
  authorization: ActiveBuildAuthorization,
  item: Doc<"buildActionItems">,
  asOf: number
) {
  const [labels, incoming, outgoing, unread, systemPresentation] =
    await Promise.all([
      ctx.db
        .query("buildActionItemLabels")
        .withIndex("by_actionItemId_and_normalizedLabel", (query) =>
          query.eq("actionItemId", item._id)
        )
        .take(100),
      ctx.db
        .query("buildActionItemRelations")
        .withIndex("by_targetActionItemId_and_status", (query) =>
          query.eq("targetActionItemId", item._id).eq("status", "active")
        )
        .take(101),
      ctx.db
        .query("buildActionItemRelations")
        .withIndex("by_sourceActionItemId_and_status", (query) =>
          query.eq("sourceActionItemId", item._id).eq("status", "active")
        )
        .take(101),
      ctx.db
        .query("recipientDeliveries")
        .withIndex("by_recipient_actionItem_status", (query) =>
          query
            .eq("organizationId", authorization.organizationId)
            .eq("recipientWorkosUserId", authorization.viewer.subject)
            .eq("collaborationActionItemId", item._id)
            .eq("status", "unread")
        )
        .take(100),
      deriveMilestoneSystemActionItemPresentation(ctx, {
        actionItem: item,
        asOf,
        build: authorization.build,
        viewer: {
          role: authorization.effectiveRole.role,
          workosUserId: authorization.viewer.subject,
        },
      }),
    ]);
  const isScopedBlock = (relation: Doc<"buildActionItemRelations">) =>
    relation.kind === "blocks" &&
    relation.organizationId === authorization.organizationId &&
    relation.brokerageId === authorization.brokerage._id &&
    relation.buildId === authorization.build._id;
  return {
    _creationTime: item._creationTime,
    _id: item._id,
    actionableUnreadCount: unread.filter(
      (delivery) => delivery.inAppVisible !== false
    ).length,
    assigneeWorkosUserId: item.assigneeWorkosUserId,
    assignmentState: item.assignmentState,
    blockedReason: item.blockedReason,
    createdAt: item.createdAt,
    currentRevision: item.currentRevision,
    dependencyCount: incoming.filter(isScopedBlock).length,
    dueAt: item.dueAt,
    labels: labels.map((row) => row.label).sort((a, b) => a.localeCompare(b)),
    priority: item.priority,
    status: item.status,
    title: item.title,
    unblocksCount: outgoing.filter(isScopedBlock).length,
    unreadCommentCount: unread.filter(
      (delivery) =>
        delivery.inAppVisible !== false &&
        delivery.entityType === "buildActionItemComment"
    ).length,
    systemMode: item.systemMode,
    canonicalBuildMilestoneId: item.canonicalBuildMilestoneId,
    canonicalBuildSubmilestoneId: item.canonicalBuildSubmilestoneId,
    canonicalBindingRevision: item.canonicalBindingRevision,
    canonicalPlanningState: item.canonicalPlanningState,
    systemPresentation,
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
  systemRecoveryRequired?: boolean;
  planningSummary?: SystemMilestonePlanningSummary;
  activationPlanningRevision?: number;
  drawFacts?: SystemDrawFacts;
  coordinationRedacted?: boolean;
  drawCoordination?: {
    canJoin: boolean;
    canLeave: boolean;
    eligible: boolean;
    joined: boolean;
    oversight: boolean;
    workingAudienceCount: number;
  };
  commentCountOverride?: number;
}) {
  const {
    authorization,
    moderationCapabilities,
    post,
    redacted,
    resolutionSummary,
    systemRecoveryRequired,
    planningSummary,
    activationPlanningRevision,
    drawFacts,
    coordinationRedacted = false,
    drawCoordination,
    commentCountOverride,
  } = input;
  const viewerIsAuthor =
    post.authorWorkosUserId === authorization.viewer.subject;
  const decisionOwnerDisplayName =
    !redacted && !coordinationRedacted && post.decisionOwnerWorkosUserId
      ? (authorization.participants.find(
          (participant) =>
            participant.workosUserId === post.decisionOwnerWorkosUserId
        )?.displayName ?? "Former Build participant")
      : undefined;
  return {
    _creationTime: post._creationTime,
    _id: post._id,
    acceptedCommentId:
      redacted || coordinationRedacted ? undefined : post.acceptedCommentId,
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
    commentCount:
      redacted ? 0 : (commentCountOverride ?? post.commentCount),
    contentState: post.contentState,
    createdAt: post.createdAt,
    decisionOutcome:
      redacted || coordinationRedacted ? undefined : post.decisionOutcome,
    decisionOwnerDisplayName,
    decisionOwnerWorkosUserId: redacted || coordinationRedacted
      ? undefined
      : post.decisionOwnerWorkosUserId,
    postType: post.postType,
    readRevision: post.readRevision ?? post.revision,
    resolutionSummary:
      redacted || coordinationRedacted ? undefined : resolutionSummary,
    resolvedAt: redacted || coordinationRedacted ? undefined : post.resolvedAt,
    revision: post.revision,
    source: post.source,
    planningSummary,
    systemPost:
      post.systemPostKind && post.systemOccurrenceKey
        ? {
            activationReason: post.activationReason ?? "explicit_start",
            activationPlanningRevision,
            authoredBy: "DrawFlow System" as const,
            canonicalBuildMilestoneId: post.canonicalBuildMilestoneId,
            canonicalBuildDrawOccurrenceKey:
              post.canonicalBuildDrawOccurrenceKey,
            currentPlanningRevision: post.currentPlanningRevision,
            drawCoordination: !redacted ? drawCoordination : undefined,
            drawFacts: !redacted ? drawFacts : undefined,
            kind: post.systemPostKind,
            lifecycle: coordinationRedacted
              ? "open"
              : post.systemLifecycle ??
                (post.threadState === "resolved" ? "resolved" : "open"),
            occurrenceKey: post.systemOccurrenceKey,
            materializedAt: post.materializedAt,
            historicalBackfill: post.historicalBackfill,
            recoveryState: !coordinationRedacted && systemRecoveryRequired
              ? ("recovery_required" as const)
              : undefined,
            triggeredAt: post.triggeredAt,
            triggeredByRole: post.triggeredByRole,
            triggeredByWorkosUserId: post.triggeredByWorkosUserId,
          }
        : undefined,
    threadState: coordinationRedacted ? "open" : post.threadState,
    updatedAt: post.updatedAt,
    viewerCanAppeal: moderationCapabilities.canAppeal,
    viewerCanManageThread:
      !redacted &&
      !coordinationRedacted &&
      (viewerIsAuthor || authorization.effectiveRole.tier >= 3),
    viewerCanModerate: moderationCapabilities.canModerate,
    viewerCanResolveAppeal: moderationCapabilities.canResolveAppeal,
    viewerIsAuthor,
  };
}
