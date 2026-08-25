import type { ActiveBuildAuthorization } from "../activeBuildAccess";
import { backofficeRoleSlugs } from "../authz";
import { canSeeCollaborationReceipt } from "../build_collaboration_access";
import { projectCollaborationAssetAttachments } from "../build_collaboration_asset_projection";
import {
  collaborationModeratedContent,
  collaborationTombstoneContent,
} from "../build_collaboration_content";
import { canEditBuildCollaborationPost } from "../build_collaboration_editing";
import { collaborationModerationCapabilities } from "../build_collaboration_moderation";
import { resolveCurrentBuildCollaborationReference } from "../build_collaboration_references";
import { projectAcceptedBuildCollaborationAnswerForViewer } from "../build_collaboration_resolution";
import { canReadMilestoneSystemActionItem } from "../build_collaboration_system_event_access";
import {
  addBuildLocalDays,
  deriveMilestoneSystemActionItemPresentation,
} from "../build_collaboration_system_posts";
import {
  canReadDrawCoordination,
  projectDrawCoordinationState,
} from "../build_draw_coordination";
import type { Doc, QueryCtx } from "../types";

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

export function deriveSystemMilestonePlanningSummary(input: {
  actionItems: Array<{
    dependencyCount: number;
    status:
      | "todo"
      | "in_progress"
      | "in_review"
      | "blocked"
      | "done"
      | "cancelled";
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
    if (!presentation) {
      continue;
    }
    counts[presentation.column] += 1;
    if (presentation.column !== "superseded") {
      activeCount += 1;
      if (presentation.parentReadyForApproval === true) {
        readyCount += 1;
      }
    }
    if (presentation.executionOwnership?.state === "assignment_required") {
      attention.assignmentGaps += 1;
    }
    if (
      presentation.column !== "superseded" &&
      actionItem.status === "blocked"
    ) {
      attention.dependencyExceptions += 1;
    }
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

export function visibleSystemPostLifecycle(
  post: Doc<"buildCollaborationPosts">
): "open" | "resolved" | "reopened" {
  if (post.systemLifecycle === "latent") {
    throw new Error("Latent System Posts are not visible.");
  }
  if (
    post.systemLifecycle === "resolved" ||
    post.systemLifecycle === "reopened"
  ) {
    return post.systemLifecycle;
  }
  return post.threadState === "resolved" ? "resolved" : "open";
}

export async function projectSystemDrawFacts(
  ctx: QueryCtx,
  input: {
    authorization: ActiveBuildAuthorization;
    post: Doc<"buildCollaborationPosts">;
    generatedActionItems?: number;
  }
): Promise<SystemDrawFacts | undefined> {
  const { authorization, post } = input;
  if (post.systemPostKind !== "draw" || !post.systemOccurrenceKey) {
    return;
  }
  const canViewLenderDrawNotes = backofficeRoleSlugs.includes(
    authorization.effectiveRole.role as (typeof backofficeRoleSlugs)[number]
  );
  const primaryPlannedId =
    post.primaryReferenceKind === "draw"
      ? ctx.db.normalizeId(
          "plannedDrawScheduleRows",
          post.primaryReferenceId ?? ""
        )
      : null;
  const primaryPlanned = primaryPlannedId
    ? await ctx.db.get(primaryPlannedId)
    : null;
  const scopedPrimaryPlanned =
    primaryPlanned?.buildId === authorization.build._id
      ? primaryPlanned
      : undefined;
  const proposalRowId = post.canonicalBuildDrawOccurrenceKey?.match(
    PROPOSAL_ROW_OCCURRENCE_PATTERN
  )?.[1];
  const normalizedProposalRowId = proposalRowId
    ? ctx.db.normalizeId("proposalDrawScheduleRows", proposalRowId)
    : null;
  const occurrencePlanned = normalizedProposalRowId
    ? await ctx.db
        .query("plannedDrawScheduleRows")
        .withIndex("by_build_proposal_draw_schedule_row", (query) =>
          query
            .eq("buildId", authorization.build._id)
            .eq("proposalDrawScheduleRowId", normalizedProposalRowId)
        )
        .first()
    : null;
  const legacyDrawKey = post.canonicalBuildDrawOccurrenceKey?.match(
    LEGACY_DRAW_KEY_OCCURRENCE_PATTERN
  )?.[1];
  const legacyPlanned = legacyDrawKey
    ? await ctx.db
        .query("plannedDrawScheduleRows")
        .withIndex("by_build_draw_key", (query) =>
          query
            .eq("buildId", authorization.build._id)
            .eq("drawKey", legacyDrawKey)
        )
        .first()
    : null;
  const planned = scopedPrimaryPlanned ?? occurrencePlanned ?? legacyPlanned;
  const primaryRequestId =
    post.primaryReferenceKind === "draw"
      ? ctx.db.normalizeId(
          "activeBuildDrawRequests",
          post.primaryReferenceId ?? ""
        )
      : null;
  const primaryRequest = primaryRequestId
    ? await ctx.db.get(primaryRequestId)
    : null;
  const scopedPrimaryRequest =
    primaryRequest?.buildId === authorization.build._id
      ? primaryRequest
      : undefined;
  const requestCandidates = planned?.drawKey
    ? await ctx.db
        .query("activeBuildDrawRequests")
        .withIndex("by_build_planned_draw_key", (query) =>
          query
            .eq("buildId", authorization.build._id)
            .eq("plannedDrawKey", planned.drawKey)
        )
        .take(500)
    : [];
  const request =
    scopedPrimaryRequest ??
    requestCandidates.sort(
      (left, right) => right.createdAt - left.createdAt
    )[0];

  const allocations = request
    ? await ctx.db
        .query("activeBuildDrawRequestAllocations")
        .withIndex("by_request", (query) =>
          query.eq("drawRequestId", request._id)
        )
        .take(500)
    : [];
  const milestoneKeys = [
    ...new Set([
      ...allocations.map((allocation) => allocation.milestoneKey),
      ...(planned?.milestoneKey ? [planned.milestoneKey] : []),
    ]),
  ];
  const [evidenceAssets, siteVisits, milestones, evidenceRequirements] =
    await Promise.all([
      Promise.all(
        milestoneKeys.map((milestoneKey) =>
          ctx.db
            .query("buildEvidenceAssets")
            .withIndex("by_build_milestone", (query) =>
              query
                .eq("buildId", authorization.build._id)
                .eq("milestoneKey", milestoneKey)
            )
            .take(500)
        )
      ).then((groups) => groups.flat()),
      Promise.all(
        milestoneKeys.map((milestoneKey) =>
          ctx.db
            .query("buildSiteVisits")
            .withIndex("by_build_milestone", (query) =>
              query
                .eq("buildId", authorization.build._id)
                .eq("milestoneKey", milestoneKey)
            )
            .take(100)
        )
      ).then((groups) => groups.flat()),
      Promise.all(
        milestoneKeys.map((milestoneKey) =>
          ctx.db
            .query("buildMilestones")
            .withIndex("by_build_key", (query) =>
              query
                .eq("buildId", authorization.build._id)
                .eq("key", milestoneKey)
            )
            .first()
        )
      ).then((rows) =>
        rows.filter((row): row is Doc<"buildMilestones"> => row !== null)
      ),
      Promise.all(
        milestoneKeys.map((milestoneKey) =>
          ctx.db
            .query("buildSubmilestoneEvidenceRequirements")
            .withIndex("by_build_milestone", (query) =>
              query
                .eq("buildId", authorization.build._id)
                .eq("milestoneKey", milestoneKey)
            )
            .take(500)
        )
      ).then((groups) => groups.flat()),
    ]);
  const locationRequiredKeys = new Set(
    evidenceRequirements
      .filter(
        (requirement) =>
          requirement.active &&
          requirement.locationRequired &&
          milestoneKeys.includes(requirement.milestoneKey)
      )
      .map((requirement) =>
        requirement.submilestoneKey
          ? `${requirement.milestoneKey}:${requirement.submilestoneKey}`
          : requirement.milestoneKey
      )
  );
  const locationUnverifiedCount = evidenceAssets.filter(
    (asset) =>
      !asset.locationVerified &&
      (locationRequiredKeys.has(
        `${asset.milestoneKey}:${asset.submilestoneKey}`
      ) ||
        (!asset.submilestoneKey &&
          locationRequiredKeys.has(asset.milestoneKey)))
  ).length;
  const evidenceApproved =
    evidenceAssets.length > 0 &&
    milestones.length > 0 &&
    milestones.every(
      (milestone) => milestone.completionReview?.status === "approved"
    );
  const evidenceState = evidenceApproved
    ? ("approved" as const)
    : locationUnverifiedCount > 0
      ? ("location_unverified" as const)
      : evidenceAssets.length > 0
        ? ("submitted" as const)
        : ("not_started" as const);
  const reviewState = request
    ? request.status === "in_review"
      ? ("in_review" as const)
      : request.status === "ready_for_admin"
        ? ("ready_for_admin" as const)
        : request.status === "approved_for_release" ||
            request.status === "approved"
          ? ("approved" as const)
          : request.status === "rejected"
            ? ("final_decline" as const)
            : request.status === "withdrawn"
              ? ("withdrawn" as const)
              : request.status === "cancelled"
                ? ("cancelled" as const)
                : request.status === "released"
                  ? ("released" as const)
                  : ("not_started" as const)
    : ("not_started" as const);
  const approvalState = request
    ? request.status === "approved_for_release" || request.status === "approved"
      ? ("approved" as const)
      : request.status === "released"
        ? ("released" as const)
        : request.status === "rejected"
          ? ("final_decline" as const)
          : request.status === "withdrawn"
            ? ("withdrawn" as const)
            : request.status === "cancelled"
              ? ("cancelled" as const)
              : ("pending" as const)
    : ("not_started" as const);
  const releaseState = request
    ? request.status === "released"
      ? ("released" as const)
      : request.status === "approved_for_release" ||
          request.status === "approved"
        ? ("approved_for_release" as const)
        : request.status === "rejected"
          ? ("final_decline" as const)
          : request.status === "withdrawn"
            ? ("withdrawn" as const)
            : request.status === "cancelled"
              ? ("cancelled" as const)
              : ("not_started" as const)
    : ("not_started" as const);
  const disposition = request
    ? request.status === "released"
      ? {
          at: request.releasedAt,
          kind: "released" as const,
          ...(canViewLenderDrawNotes && request.releaseNote
            ? { note: request.releaseNote }
            : {}),
        }
      : request.status === "withdrawn"
        ? {
            at: request.withdrawnAt,
            kind: "withdrawal" as const,
            note: request.withdrawalNote,
          }
        : request.status === "cancelled"
          ? {
              at: request.cancelledAt,
              kind: "cancellation" as const,
              note: request.cancellationNote,
            }
          : request.status === "rejected"
            ? {
                at: request.reviewedAt,
                kind: "final_decline" as const,
                ...(canViewLenderDrawNotes && request.reviewNote
                  ? { note: request.reviewNote }
                  : {}),
              }
            : undefined
    : undefined;
  let scheduledDate: string | undefined;
  if (planned && authorization.build.timezone) {
    try {
      scheduledDate = addBuildLocalDays(
        authorization.build.startDate,
        planned.timingDay
      );
    } catch {
      scheduledDate = undefined;
    }
  }
  return {
    approval: {
      ...(request?.reviewedAt ? { approvedAt: request.reviewedAt } : {}),
      ...(canViewLenderDrawNotes && request?.reviewNote
        ? { note: request.reviewNote }
        : {}),
      state: approvalState,
    },
    ...(disposition ? { disposition } : {}),
    evidence: {
      assetCount: evidenceAssets.length,
      locationUnverifiedCount,
      state: evidenceState,
    },
    generatedActionItems: input.generatedActionItems ?? 0,
    occurrenceKey: post.systemOccurrenceKey,
    ...(planned
      ? {
          planned: {
            _id: planned._id,
            amountCents: planned.amountCents,
            drawKey: planned.drawKey,
            label: planned.label,
            ...(planned.milestoneKey
              ? { milestoneKey: planned.milestoneKey }
              : {}),
            ...(scheduledDate ? { scheduledDate } : {}),
            status: planned.status,
            timingDay: planned.timingDay,
          },
        }
      : {}),
    release: {
      ...(request?.releasedAt ? { releasedAt: request.releasedAt } : {}),
      ...(request?.releaseDate ? { releaseDate: request.releaseDate } : {}),
      ...(canViewLenderDrawNotes && request?.releaseNote
        ? { note: request.releaseNote }
        : {}),
      state: releaseState,
    },
    ...(request
      ? {
          request: {
            _id: request._id,
            amountCents: request.amountCents,
            displayId: request.displayId,
            ...(request.note &&
            (canViewLenderDrawNotes ||
              request.requestedByWorkosUserId === authorization.viewer.subject)
              ? { note: request.note }
              : {}),
            requestedAt: request.requestedAt,
            requestKey: request.requestKey,
            status: request.status,
          },
        }
      : {}),
    review: {
      ...(canViewLenderDrawNotes && request?.operationsReviewStartedAt
        ? { operationsReviewStartedAt: request.operationsReviewStartedAt }
        : {}),
      ...(canViewLenderDrawNotes && request?.operationsRecommendationNote
        ? { recommendationNote: request.operationsRecommendationNote }
        : {}),
      ...(request?.reviewedAt ? { reviewedAt: request.reviewedAt } : {}),
      state: reviewState,
      ...(canViewLenderDrawNotes && request?.reviewNote
        ? { note: request.reviewNote }
        : {}),
    },
    siteVisit: {
      cancelled: siteVisits.filter((visit) => visit.status === "cancelled")
        .length,
      complete: siteVisits.filter((visit) => visit.status === "complete")
        .length,
      count: siteVisits.length,
      requested: siteVisits.filter((visit) => visit.status === "requested")
        .length,
    },
  };
}

/**
 * Produces the canonical, viewer-scoped post shape used by both the paginated
 * feed and focused deep-link hydration. Callers must authorize the Build and
 * verify that the viewer can read the post before invoking this projector.
 */
export async function projectActionItemSummary(
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
          roles: authorization.roles,
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
    parentActionItemId: item.parentActionItemId,
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

export function collaborationPostSummary(input: {
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
    workingAudienceTruncated: boolean;
  };
  commentCountOverride?: number;
  milestoneKey?: string;
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
    milestoneKey,
  } = input;
  const viewerIsAuthor =
    post.authorWorkosUserId === authorization.viewer.subject;
  const decisionOwnerDisplayName =
    !(redacted || coordinationRedacted) && post.decisionOwnerWorkosUserId
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
    commentCount: redacted ? 0 : (commentCountOverride ?? post.commentCount),
    contentState: post.contentState,
    createdAt: post.createdAt,
    openActionItemCount:
      redacted || coordinationRedacted ? 0 : post.openActionItemCount,
    decisionOutcome:
      redacted || coordinationRedacted ? undefined : post.decisionOutcome,
    decisionOwnerDisplayName,
    decisionOwnerWorkosUserId:
      redacted || coordinationRedacted
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
            drawCoordination:
              redacted || coordinationRedacted ? undefined : drawCoordination,
            drawFacts: redacted || coordinationRedacted ? undefined : drawFacts,
            kind: post.systemPostKind,
            milestoneKey,
            lifecycle: coordinationRedacted
              ? "open"
              : visibleSystemPostLifecycle(post),
            occurrenceKey: post.systemOccurrenceKey,
            materializedAt: post.materializedAt,
            historicalBackfill: post.historicalBackfill,
            recoveryState:
              !coordinationRedacted && systemRecoveryRequired
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
    viewerCanEdit:
      !(redacted || coordinationRedacted) &&
      post.contentState === "active" &&
      canEditBuildCollaborationPost(post, {
        role: authorization.effectiveRole.role,
        viewerWorkosUserId: authorization.viewer.subject,
      }),
    viewerCanManageThread:
      !(redacted || coordinationRedacted) &&
      (viewerIsAuthor || authorization.effectiveRole.tier >= 3),
    viewerCanModerate: moderationCapabilities.canModerate,
    viewerCanResolveAppeal: moderationCapabilities.canResolveAppeal,
    viewerIsAuthor,
  };
}


