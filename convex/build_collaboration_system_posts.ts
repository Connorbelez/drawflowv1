import type { ActiveBuildAuthorization } from "./activeBuildAccess";
import { buildActionItemQueueSortAt } from "./build_action_item_deadline_model";
import { recordBuildActionItemRevision } from "./build_action_item_history";
import {
  linkBuildActionItemToPost,
  syncLinkedActionItemPostCounts,
} from "./build_action_item_post_links";
import {
  type BuildCollaborationRole,
  resolveEffectiveCollaborationRole,
} from "./build_collaboration_model";
import { queueBuildCollaborationSearchOwnerRebuild } from "./build_collaboration_search_maintenance";
import {
  canBuilderStartMilestone,
  resolveCanonicalMilestoneExecutionOwnership,
} from "./build_collaboration_system_event_access";
import {
  publishCanonicalBuildCollaborationSystemEvent,
  resolveSystemEventScope,
} from "./build_collaboration_system_events";
import type { SystemPostHistoricalBackfill } from "./build_collaboration_system_events";
import { ensureActiveBuildPlanningActivationRevision } from "./build_collaboration_planning_reconciliation";
import { resolveActiveSubmilestoneEvidencePackageReadiness } from "./build_submilestone_evidence";
import type { Doc, Id, MutationCtx, QueryCtx } from "./types";

const SYSTEM_AUTHOR = "system";
const SYSTEM_LABEL = "DrawFlow System";

export type MilestoneSystemActivationReason =
  | "explicit_start"
  | "recovery"
  | "scheduled"
  | "backfill";

export type DrawSystemActivationReason =
  | "draw_request"
  | "recovery"
  | "scheduled"
  | "backfill";

/** Only explicit human/domain activations create recipient notifications. */
export function shouldNotifySystemPost(
  activationReason:
    | MilestoneSystemActivationReason
    | DrawSystemActivationReason,
) {
  return (
    activationReason === "explicit_start" ||
    activationReason === "draw_request"
  );
}

/**
 * Stable identity for one planned Draw occurrence. The proposal schedule-row
 * ID is preferred because a reasonable plan edit can change its display key;
 * the Build/proposal-scoped draw-key fallback keeps legacy rows addressable
 * without allowing two Builds or proposals to collide.
 */
export function drawSystemOccurrenceKey(
  build: Pick<Doc<"activeBuilds">, "_id" | "proposalId">,
  draw: Pick<Doc<"plannedDrawScheduleRows">, "drawKey" | "proposalDrawScheduleRowId">,
) {
  const stablePart = draw.proposalDrawScheduleRowId
    ? `proposal-row:${String(draw.proposalDrawScheduleRowId)}`
    : `legacy-key:${draw.drawKey}`;
  return `draw-system:${String(build._id)}:${String(build.proposalId)}:${stablePart}`;
}

export type SystemActionItemPresentationColumn =
  | "backlog"
  | "behind_schedule"
  | "in_progress"
  | "in_review"
  | "approved"
  | "superseded";

export type SystemActionItemPresentation = {
  attention?: "overdue_completion";
  canAddEvidence?: boolean;
  canReview?: boolean;
  canRecommendReview?: boolean;
  canRequestChanges?: boolean;
  canApproveSubmilestone?: boolean;
  canWaiveSiteVisit?: boolean;
  canRetractSubmilestoneApproval?: boolean;
  canApproveMilestone?: boolean;
  canRetractMilestoneApproval?: boolean;
  canSubmitForReview?: boolean;
  canUpdateExecution?: boolean;
  column: SystemActionItemPresentationColumn;
  planningState?: "active" | "superseded";
  completionForecastDate?: string;
  evidenceCount?: number;
  evidencePackageRevisionId?: Id<"buildSubmilestoneEvidencePackageRevisions">;
  evidencePackageRevision?: number;
  evidenceReviewRound?: number;
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
  milestoneReviewDecisionState?:
    | "in_review"
    | "ready_for_approval"
    | "approved"
    | "reopened";
  reviewRevision?: number;
  milestoneReviewRevision?: number;
  parentReadyForApproval?: boolean;
  siteVisitRequirement?: {
    required: boolean;
    status: "not_required" | "required" | "satisfied" | "waived";
    policySignals: string[];
    riskSignals: string[];
    manualSignals: string[];
    siteVisitId?: Id<"buildSiteVisits">;
  };
  reviewHistory?: Array<{
    actorRoles: string[];
    actorWorkosUserId: string;
    createdAt: number;
    kind: string;
    note?: string;
    reason?: string;
    reviewRound: number;
    scope: "submilestone" | "milestone";
    warnings: string[];
  }>;
  executionOwnership?: {
    assigneeDisplayName?: string;
    assigneeId?: Id<"contractorProfiles">;
    state: "assigned" | "assignment_required";
    viewerIsAssignee: boolean;
  };
  plannedCompletionDate?: string;
  plannedStartDate?: string;
  progressPercent?: number;
  readyExceptFor?: string[];
  workflowRevision?: number;
  state: "known" | "unknown";
  startCommand?: {
    allowed: boolean;
    buildName: string;
    dependencyBlockers: Array<{
      milestoneKey: string;
      milestoneName: string;
      status: "in_progress" | "planned";
    }>;
    denialReason?:
      | "already_started"
      | "assignment_required"
      | "completed"
      | "permission_denied";
    milestoneKey: string;
    milestoneName: string;
    plannedStartDate: string;
    scope: "submilestone";
    source: "submilestone_detail";
    submilestoneKey: string;
    submilestoneName: string;
  };
  timezone?: string;
  unknownReason?: string;
};

/**
 * Per-request roadmap snapshots reused while projecting generated Action Items.
 * The item-specific evidence/review queries remain in the presentation helper;
 * these maps only cache canonical Build/Milestone planning rows.
 */
export type MilestoneActionItemPlanningCache = {
  milestonesByBuild: ReadonlyMap<string, Doc<"buildMilestones">[]>;
  submilestonesByMilestone: ReadonlyMap<string, Doc<"buildSubmilestones">[]>;
};

/** Validate and normalize the one canonical timezone accepted by Build writes. */
export function validateBuildTimezone(value: string) {
  const timezone = value.trim();
  if (!timezone || timezone.length > 120) {
    throw new Error("Build timezone must be a valid IANA timezone string.");
  }
  try {
    new Intl.DateTimeFormat("en-CA", { timeZone: timezone }).format(
      new Date(0)
    );
  } catch {
    throw new Error(
      `Build timezone ${timezone} is not a valid IANA timezone string.`
    );
  }
  return timezone;
}

export function buildLocalDateAt(epochMs: number, timezone: string) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    month: "2-digit",
    timeZone: validateBuildTimezone(timezone),
    year: "numeric",
  });
  const parts = Object.fromEntries(
    formatter
      .formatToParts(new Date(epochMs))
      .map((part) => [part.type, part.value])
  );
  return `${parts.year}-${parts.month}-${parts.day}`;
}

export function addBuildLocalDays(date: string, days: number) {
  const [year, month, day] = date.split("-").map(Number);
  if (
    !(
      Number.isInteger(year) &&
      Number.isInteger(month) &&
      Number.isInteger(day)
    ) ||
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > 31
  ) {
    throw new Error(`Invalid Build-local calendar date ${date}.`);
  }
  const next = new Date(Date.UTC(year, month - 1, day));
  next.setUTCDate(next.getUTCDate() + Math.round(days));
  return next.toISOString().slice(0, 10);
}

function timeZoneOffsetMs(epochMs: number, timezone: string) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      day: "2-digit",
      hour: "2-digit",
      hourCycle: "h23",
      minute: "2-digit",
      month: "2-digit",
      second: "2-digit",
      timeZone: timezone,
      year: "numeric",
    })
      .formatToParts(new Date(epochMs))
      .map((part) => [part.type, part.value])
  );
  const asUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second)
  );
  return asUtc - Math.floor(epochMs / 1000) * 1000;
}

/** Return the UTC instant corresponding to Build-local midnight, DST-safe. */
export function buildLocalMidnightUtc(date: string, timezone: string) {
  const normalizedTimezone = validateBuildTimezone(timezone);
  const [year, month, day] = date.split("-").map(Number);
  const wallClockUtc = Date.UTC(year, month - 1, day);
  let candidate = wallClockUtc;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    candidate = wallClockUtc - timeZoneOffsetMs(candidate, normalizedTimezone);
  }
  return candidate;
}

function unknownSystemActionItemPresentation(reason: string) {
  return {
    column: "backlog" as const,
    state: "unknown" as const,
    unknownReason: reason,
  } satisfies SystemActionItemPresentation;
}

function evidenceReviewColumn(
  state: SystemActionItemPresentation["evidenceReviewState"]
): SystemActionItemPresentationColumn | undefined {
  if (state === "approved") {
    return "approved";
  }
  if (state === "in_review") {
    return "in_review";
  }
  return undefined;
}

function derivedSubmilestoneReviewDecisionState(
  submilestone: Doc<"buildSubmilestones">
): SystemActionItemPresentation["reviewDecisionState"] {
  if (submilestone.reviewDecisionState) {
    return submilestone.reviewDecisionState;
  }
  if (submilestone.evidenceReviewState === "approved") {
    return "approved";
  }
  if (submilestone.evidenceReviewState === "changes_requested") {
    return "changes_requested";
  }
  if (submilestone.evidenceReviewState === "in_review") {
    return "in_review";
  }
  return undefined;
}

function derivedMilestoneReviewDecisionState(
  milestone: Doc<"buildMilestones">
): NonNullable<SystemActionItemPresentation["milestoneReviewDecisionState"]> {
  if (milestone.reviewDecisionState) {
    return milestone.reviewDecisionState;
  }
  return milestone.completionReview?.status === "approved"
    ? "approved"
    : "in_review";
}

export async function deriveMilestoneSystemActionItemPresentation(
  ctx: QueryCtx,
  input: {
    actionItem: Doc<"buildActionItems">;
    asOf: number;
    build: Doc<"activeBuilds">;
    planningCache?: MilestoneActionItemPlanningCache;
    viewer?: {
      role: BuildCollaborationRole;
      workosUserId: string;
    };
  }
): Promise<SystemActionItemPresentation | undefined> {
  if (input.actionItem.systemMode !== "generated_milestone_submilestone") {
    return;
  }
  if (
    !(
      input.actionItem.canonicalBuildMilestoneId &&
      input.actionItem.canonicalBuildSubmilestoneId
    )
  ) {
    return unknownSystemActionItemPresentation(
      "Generated System Action Item is missing its canonical Milestone binding."
    );
  }
  const [milestone, submilestone] = await Promise.all([
    ctx.db.get(input.actionItem.canonicalBuildMilestoneId),
    ctx.db.get(input.actionItem.canonicalBuildSubmilestoneId),
  ]);
  if (
    !(milestone && submilestone) ||
    milestone.buildId !== input.build._id ||
    milestone.organizationId !== input.build.organizationId ||
    milestone.brokerageId !== input.build.brokerageId ||
    submilestone.buildId !== input.build._id ||
    submilestone.organizationId !== input.build.organizationId ||
    submilestone.brokerageId !== input.build.brokerageId ||
    submilestone.buildMilestoneId !== milestone._id
  ) {
    return unknownSystemActionItemPresentation(
      "Canonical Milestone or Sub-milestone binding is unavailable."
    );
  }
  let plannedStartDate: string;
  let plannedCompletionDate: string;
  try {
    plannedStartDate = addBuildLocalDays(
      input.build.startDate,
      submilestone.startDay ?? milestone.dayStart
    );
    plannedCompletionDate = addBuildLocalDays(
      plannedStartDate,
      Math.max(0, (submilestone.durationDays ?? 1) - 1)
    );
  } catch {
    return unknownSystemActionItemPresentation(
      "Build start date is invalid; schedule state requires a valid Build-local calendar date."
    );
  }
  const execution = input.viewer
    ? await projectMilestoneExecutionPresentation(ctx, {
        build: input.build,
        milestone,
        planningCache: input.planningCache,
        plannedStartDate,
        submilestone,
        viewer: input.viewer,
      })
    : undefined;
  if (!input.build.timezone) {
    return {
      ...unknownSystemActionItemPresentation(
        "Build timezone is unavailable; schedule state requires an explicit IANA timezone."
      ),
      ...execution,
    };
  }
  let localDate: string;
  try {
    localDate = buildLocalDateAt(input.asOf, input.build.timezone);
  } catch {
    return {
      ...unknownSystemActionItemPresentation(
        "Build timezone is invalid; schedule state requires an explicit IANA timezone."
      ),
      ...execution,
    };
  }
  const base = {
    plannedCompletionDate,
    plannedStartDate,
    planningState: (submilestone.planningState ?? "active") as
      | "active"
      | "superseded",
    state: "known" as const,
    timezone: input.build.timezone,
  };
  if (submilestone.planningState === "superseded") {
    return {
      ...base,
      canAddEvidence: false,
      canApproveMilestone: false,
      canApproveSubmilestone: false,
      canRecommendReview: false,
      canRequestChanges: false,
      canSubmitForReview: false,
      canUpdateExecution: false,
      column: "superseded" as const,
      readyExceptFor: [],
    };
  }
  const reviewColumn = evidenceReviewColumn(submilestone.evidenceReviewState);
  if (reviewColumn) {
    return {
      ...base,
      ...execution,
      column: reviewColumn,
    };
  }
  if (
    submilestone.status === "complete" ||
    milestone.completionClaim !== undefined
  ) {
    return {
      ...base,
      ...execution,
      column:
        milestone.completionReview?.status === "approved"
          ? "approved"
          : "in_review",
    };
  }
  if (submilestone.actualStartedAt !== undefined) {
    return {
      ...base,
      ...execution,
      attention:
        localDate > plannedCompletionDate ? "overdue_completion" : undefined,
      column: "in_progress",
    };
  }
  return {
    ...base,
    ...execution,
    column: localDate > plannedStartDate ? "behind_schedule" : "backlog",
  };
}

async function projectMilestoneExecutionPresentation(
  ctx: QueryCtx,
  input: {
    build: Doc<"activeBuilds">;
    milestone: Doc<"buildMilestones">;
    planningCache?: MilestoneActionItemPlanningCache;
    plannedStartDate: string;
    submilestone: Doc<"buildSubmilestones">;
    viewer: {
      role: BuildCollaborationRole;
      workosUserId: string;
    };
  }
): Promise<
  Pick<
    SystemActionItemPresentation,
    | "canAddEvidence"
    | "canReview"
    | "canRecommendReview"
    | "canRequestChanges"
    | "canApproveSubmilestone"
    | "canWaiveSiteVisit"
    | "canRetractSubmilestoneApproval"
    | "canApproveMilestone"
    | "canRetractMilestoneApproval"
    | "canSubmitForReview"
    | "canUpdateExecution"
    | "completionForecastDate"
    | "evidenceCount"
    | "evidencePackageRevision"
    | "evidencePackageRevisionId"
    | "evidenceReviewRound"
    | "evidenceReviewState"
    | "milestoneReviewDecisionState"
    | "reviewRevision"
    | "milestoneReviewRevision"
    | "parentReadyForApproval"
    | "reviewDecisionState"
    | "reviewHistory"
    | "siteVisitRequirement"
    | "executionOwnership"
    | "progressPercent"
    | "readyExceptFor"
    | "startCommand"
    | "workflowRevision"
  >
> {
  const ownership = await resolveCanonicalMilestoneExecutionOwnership(ctx, {
    build: input.build,
    milestone: input.milestone,
    submilestone: input.submilestone,
  });
  const evidenceReadiness =
    await resolveActiveSubmilestoneEvidencePackageReadiness(ctx, {
      build: input.build,
      milestone: input.milestone,
      submilestone: input.submilestone,
    });
  const viewerIsAssignee =
    ownership.state === "assigned" &&
    ownership.contractor?.accountWorkosUserId === input.viewer.workosUserId;
  const milestones =
    input.planningCache?.milestonesByBuild.get(String(input.build._id)) ??
    (await ctx.db
      .query("buildMilestones")
      .withIndex("by_build", (query) => query.eq("buildId", input.build._id))
      .take(500));
  const milestonesByKey = new Map(
    milestones.map((milestone) => [milestone.key, milestone])
  );
  const reviewRound = input.submilestone.evidenceReviewRound ?? 0;
  const childReviewDecisionState = derivedSubmilestoneReviewDecisionState(
    input.submilestone
  );
  const milestoneReviewDecisionState = derivedMilestoneReviewDecisionState(
    input.milestone
  );
  const [
    milestoneSubmilestones,
    requirementById,
    requirementByRound,
    childDecisions,
    milestoneDecisions,
  ] = await Promise.all([
    input.planningCache?.submilestonesByMilestone.get(
      String(input.milestone._id)
    ) ??
      ctx.db
        .query("buildSubmilestones")
        .withIndex("by_milestone", (query) =>
          query.eq("buildMilestoneId", input.milestone._id)
        )
        .take(500),
    input.submilestone.siteVisitRequirementId
      ? ctx.db.get(input.submilestone.siteVisitRequirementId)
      : Promise.resolve(null),
    reviewRound > 0
      ? ctx.db
          .query("buildSubmilestoneSiteVisitRequirements")
          .withIndex("by_submilestone_round", (query) =>
            query
              .eq("buildSubmilestoneId", input.submilestone._id)
              .eq("reviewRound", reviewRound)
          )
          .unique()
      : Promise.resolve(null),
    ctx.db
      .query("buildSubmilestoneReviewDecisions")
      .withIndex("by_submilestone_createdAt", (query) =>
        query.eq("buildSubmilestoneId", input.submilestone._id)
      )
      .order("desc")
      .take(100),
    ctx.db
      .query("buildMilestoneReviewDecisions")
      .withIndex("by_milestone_revision", (query) =>
        query.eq("buildMilestoneId", input.milestone._id)
      )
      .order("desc")
      .take(100),
  ]);
  const siteVisitRequirement = requirementById ?? requirementByRound;
  const activeMilestoneSubmilestones = milestoneSubmilestones.filter(
    (candidate) => candidate.planningState !== "superseded"
  );
  const parentReadyForApproval =
    activeMilestoneSubmilestones.length > 0 &&
    activeMilestoneSubmilestones.every(
      (candidate) =>
        derivedSubmilestoneReviewDecisionState(candidate) === "approved"
    );
  const reviewHistory = [
    ...childDecisions.map((decision) => ({
      actorRoles: decision.actorRoles,
      actorWorkosUserId: decision.actorWorkosUserId,
      createdAt: decision.createdAt,
      kind: decision.kind,
      ...(decision.note ? { note: decision.note } : {}),
      ...(decision.reason ? { reason: decision.reason } : {}),
      reviewRound: decision.reviewRound,
      scope: "submilestone" as const,
      warnings: decision.warnings,
    })),
    ...milestoneDecisions.map((decision) => ({
      actorRoles: decision.actorRoles,
      actorWorkosUserId: decision.actorWorkosUserId,
      createdAt: decision.createdAt,
      kind: decision.kind,
      ...(decision.reason ? { reason: decision.reason } : {}),
      reviewRound: decision.reviewRevision,
      scope: "milestone" as const,
      warnings: decision.warnings,
    })),
  ]
    .sort((left, right) => right.createdAt - left.createdAt)
    .slice(0, 100);
  const canReview = [
    "admin",
    "principle-broker",
    "broker",
    "broker-staff",
  ].includes(input.viewer.role);
  const viewerIsAdmin = input.viewer.role === "admin";
  const canRecommendReview =
    canReview && childReviewDecisionState === "in_review";
  const canRequestChanges =
    canReview && childReviewDecisionState === "in_review";
  const canApproveSubmilestone =
    viewerIsAdmin && childReviewDecisionState === "in_review";
  const canWaiveSiteVisit =
    viewerIsAdmin &&
    childReviewDecisionState === "in_review" &&
    siteVisitRequirement?.required === true &&
    siteVisitRequirement.status === "required";
  const canRetractSubmilestoneApproval =
    viewerIsAdmin && childReviewDecisionState === "approved";
  const canApproveMilestone =
    viewerIsAdmin &&
    parentReadyForApproval &&
    milestoneReviewDecisionState !== "approved";
  const canRetractMilestoneApproval =
    viewerIsAdmin && milestoneReviewDecisionState === "approved";
  const readyExceptFor = [...evidenceReadiness.readyExceptFor];
  if (
    siteVisitRequirement?.required === true &&
    siteVisitRequirement.status === "required" &&
    !readyExceptFor.includes("Required Site Visit")
  ) {
    readyExceptFor.push("Required Site Visit");
  }
  const dependencyBlockers = input.milestone.dependencyKeys.flatMap((key) => {
    const dependency = milestonesByKey.get(key);
    if (!dependency || dependency.status === "complete") {
      return [];
    }
    return [
      {
        milestoneKey: dependency.key,
        milestoneName: dependency.name,
        status:
          dependency.status === "in_progress"
            ? ("in_progress" as const)
            : ("planned" as const),
      },
    ];
  });
  const completed =
    input.milestone.status === "complete" ||
    input.milestone.completionClaim !== undefined ||
    input.submilestone.status === "complete";
  const alreadyStarted = input.submilestone.actualStartedAt !== undefined;
  let allowed = false;
  let denialReason:
    | "already_started"
    | "assignment_required"
    | "completed"
    | "permission_denied"
    | undefined;
  if (input.viewer.role === "contractor" && ownership.state !== "assigned") {
    denialReason = "assignment_required";
  } else if (completed) {
    denialReason = "completed";
  } else if (alreadyStarted) {
    denialReason = "already_started";
  } else if (input.viewer.role === "contractor") {
    allowed = viewerIsAssignee;
    if (!allowed) {
      denialReason = "permission_denied";
    }
  } else if (
    input.viewer.role === "builder" ||
    input.viewer.role === "builder-staff"
  ) {
    allowed = await canBuilderStartMilestone(ctx, {
      build: input.build,
      role: input.viewer.role,
      workosUserId: input.viewer.workosUserId,
    });
    if (!allowed) {
      denialReason = "permission_denied";
    }
  } else {
    denialReason = "permission_denied";
  }
  const viewerIsBuilder =
    input.viewer.role === "builder" || input.viewer.role === "builder-staff";
  const viewerIsContractor = input.viewer.role === "contractor";
  const canUpdateExecution =
    input.submilestone.evidenceReviewState !== "in_review" &&
    input.submilestone.evidenceReviewState !== "approved" &&
    ((viewerIsContractor && viewerIsAssignee) || (viewerIsBuilder && allowed));
  const canAddEvidence =
    canUpdateExecution &&
    input.submilestone.status === "in_progress" &&
    input.submilestone.actualStartedAt !== undefined;
  const canSubmitForReview =
    canAddEvidence &&
    input.submilestone.evidenceReviewState !== "in_review" &&
    input.submilestone.evidenceReviewState !== "approved" &&
    evidenceReadiness.readyExceptFor.length === 0;
  return {
    canAddEvidence,
    canReview,
    canRecommendReview,
    canRequestChanges,
    canApproveSubmilestone,
    canWaiveSiteVisit,
    canRetractSubmilestoneApproval,
    canApproveMilestone,
    canRetractMilestoneApproval,
    canSubmitForReview,
    canUpdateExecution,
    ...(input.submilestone.completionForecastDate
      ? { completionForecastDate: input.submilestone.completionForecastDate }
      : {}),
    evidenceCount: evidenceReadiness.evidenceCount,
    ...(evidenceReadiness.latestRevision
      ? { evidencePackageRevisionId: evidenceReadiness.latestRevision._id }
      : {}),
    ...(evidenceReadiness.latestRevision
      ? { evidencePackageRevision: evidenceReadiness.latestRevision.revision }
      : {}),
    ...(input.submilestone.evidenceReviewRound === undefined
      ? {}
      : { evidenceReviewRound: input.submilestone.evidenceReviewRound }),
    evidenceReviewState: input.submilestone.evidenceReviewState ?? "not_ready",
    reviewDecisionState: childReviewDecisionState,
    milestoneReviewDecisionState:
      parentReadyForApproval && milestoneReviewDecisionState !== "approved"
        ? "ready_for_approval"
        : milestoneReviewDecisionState,
    reviewRevision: input.submilestone.reviewRevision ?? 0,
    milestoneReviewRevision: input.milestone.reviewRevision ?? 0,
    parentReadyForApproval,
    ...(siteVisitRequirement
      ? {
          siteVisitRequirement: {
            manualSignals: siteVisitRequirement.manualSignals,
            policySignals: siteVisitRequirement.policySignals,
            required: siteVisitRequirement.required,
            riskSignals: siteVisitRequirement.riskSignals,
            status: siteVisitRequirement.status,
            ...(siteVisitRequirement.siteVisitId
              ? { siteVisitId: siteVisitRequirement.siteVisitId }
              : {}),
          },
        }
      : {}),
    reviewHistory,
    executionOwnership: {
      ...(input.viewer.role === "contractor"
        ? {}
        : ownership.contractor
          ? {
              assigneeDisplayName: ownership.contractor.name,
              assigneeId: ownership.contractor._id,
            }
          : {}),
      state: ownership.state,
      viewerIsAssignee,
    },
    progressPercent: input.submilestone.progressPercent ?? 0,
    readyExceptFor,
    workflowRevision: input.submilestone.workflowRevision ?? 0,
    startCommand: {
      allowed,
      buildName: input.build.buildName,
      dependencyBlockers,
      ...(denialReason ? { denialReason } : {}),
      milestoneKey: input.milestone.key,
      milestoneName: input.milestone.name,
      plannedStartDate: input.plannedStartDate,
      scope: "submilestone",
      source: "submilestone_detail",
      submilestoneKey: input.submilestone.key,
      submilestoneName: input.submilestone.name,
    },
  };
}

export async function ensureMilestoneSystemPost(
  ctx: MutationCtx,
  input: {
    actor: {
      roles: string[];
      workosUserId: string;
    };
    build: Doc<"activeBuilds">;
    milestone: Doc<"buildMilestones">;
    activationReason: MilestoneSystemActivationReason;
    historicalBackfill?: SystemPostHistoricalBackfill;
    now?: number;
  }
) {
  const activationRevision = input.historicalBackfill
    ? null
    : await ensureActiveBuildPlanningActivationRevision(ctx, {
        actor: {
          actorRoles: input.actor.roles,
          actorWorkosUserId: input.actor.workosUserId,
        },
        build: input.build,
        now: input.now,
      });
  const occurrenceKey = `milestone-system:${input.build._id}:${input.milestone._id}`;
  const now = input.now ?? Date.now();
  const plainText =
    input.historicalBackfill
      ? "Backfilled from existing records. Canonical Milestone and Sub-milestone state remain authoritative."
      : input.activationReason === "scheduled"
      ? `${input.milestone.name} is scheduled to begin today. Canonical Sub-milestone cards are synchronized from the roadmap; this does not record that work has started.`
      : `${input.milestone.name} started. Canonical Sub-milestone cards are synchronized from the roadmap.`;
  const postId = await publishCanonicalBuildCollaborationSystemEvent(ctx, {
    buildId: input.build._id,
    idempotencyKey: occurrenceKey,
    organizationId: input.build.organizationId,
    plainText,
    postType: "update",
    primaryReferenceId: String(input.milestone._id),
    primaryReferenceKind: "milestone",
    systemPostKind: "milestone",
    systemLabel: SYSTEM_LABEL,
    suppressNotifications: !shouldNotifySystemPost(input.activationReason),
    ...(input.historicalBackfill
      ? { silentBackfill: input.historicalBackfill }
      : { now }),
  });
  if (!postId) {
    return null;
  }

  // The generic publisher owns publication/audience/revision plumbing.  The
  // specialized pass adds immutable domain identity and recovers any children
  // that may be missing after a partial historical write.
  const scope = await resolveSystemEventScope(
    ctx,
    {
      buildId: input.build._id,
      idempotencyKey: `${occurrenceKey}:scope`,
      organizationId: input.build.organizationId,
      plainText: "Milestone System Post authorization scope.",
      postType: "update",
      systemLabel: SYSTEM_LABEL,
    },
    `${occurrenceKey}:scope`
  );
  if (scope.status !== "ready") {
    return null;
  }

  const post = await ctx.db.get(postId);
  if (!post || post.buildId !== input.build._id) {
    throw new Error("Milestone System Post became unavailable.");
  }
  if (
    post.organizationId !== input.build.organizationId ||
    post.brokerageId !== input.build.brokerageId
  ) {
    return null;
  }
  const triggeredByRole = input.historicalBackfill
    ? undefined
    : resolveEffectiveCollaborationRole(input.actor.roles)?.role;
  const submilestones = (
    await ctx.db
      .query("buildSubmilestones")
      .withIndex("by_milestone", (query) =>
        query.eq("buildMilestoneId", input.milestone._id)
      )
      .take(500)
  ).filter(
    (submilestone) =>
      submilestone.buildId === input.build._id &&
      submilestone.organizationId === input.build.organizationId
  );

  const postPatch = {
    activationPlanningRevisionId:
      post.activationPlanningRevisionId ?? activationRevision?._id,
    activationReason: post.activationReason ?? input.activationReason,
    authorDisplayNameSnapshot: SYSTEM_LABEL,
    authorRolesSnapshot: ["system"],
    authorWorkosUserId: SYSTEM_AUTHOR,
    canonicalBuildMilestoneId: input.milestone._id,
    systemEventKey: occurrenceKey,
    systemOccurrenceKey: occurrenceKey,
    systemPostKind: "milestone" as const,
    currentPlanningRevision:
      post.currentPlanningRevision ?? activationRevision?.revision,
    systemLifecycle: post.systemLifecycle ?? "open",
    ...(input.historicalBackfill
      ? {}
      : { triggeredAt: post.triggeredAt ?? now }),
    triggeredByRole: post.triggeredByRole ?? triggeredByRole,
    ...(input.historicalBackfill
      ? {}
      : {
          triggeredByWorkosUserId:
            post.triggeredByWorkosUserId ?? input.actor.workosUserId,
        }),
    ...(input.historicalBackfill
      ? {
          historicalBackfill: {
            ...input.historicalBackfill,
            source: "existing_records" as const,
          },
          materializedAt: input.historicalBackfill.materializedAt,
        }
      : {}),
  };
  const postChanged =
    post.activationPlanningRevisionId !==
      postPatch.activationPlanningRevisionId ||
    post.activationReason !== postPatch.activationReason ||
    post.authorDisplayNameSnapshot !== postPatch.authorDisplayNameSnapshot ||
    JSON.stringify(post.authorRolesSnapshot) !==
      JSON.stringify(postPatch.authorRolesSnapshot) ||
    post.authorWorkosUserId !== postPatch.authorWorkosUserId ||
    post.canonicalBuildMilestoneId !== postPatch.canonicalBuildMilestoneId ||
    post.systemEventKey !== postPatch.systemEventKey ||
    post.systemOccurrenceKey !== postPatch.systemOccurrenceKey ||
    post.systemPostKind !== postPatch.systemPostKind ||
    post.currentPlanningRevision !== postPatch.currentPlanningRevision ||
    post.systemLifecycle !== postPatch.systemLifecycle ||
    (("triggeredAt" in postPatch && post.triggeredAt !== postPatch.triggeredAt) ||
      ("triggeredByRole" in postPatch &&
        post.triggeredByRole !== postPatch.triggeredByRole) ||
      ("triggeredByWorkosUserId" in postPatch &&
        post.triggeredByWorkosUserId !== postPatch.triggeredByWorkosUserId) ||
      ("materializedAt" in postPatch &&
        post.materializedAt !== postPatch.materializedAt) ||
      ("historicalBackfill" in postPatch &&
        JSON.stringify(post.historicalBackfill) !==
          JSON.stringify(postPatch.historicalBackfill)));
  if (postChanged) {
    await ctx.db.patch(postId, { ...postPatch, updatedAt: now });
  }

  const generatedActionItemIds: Id<"buildActionItems">[] = [];
  let actionItemsChanged = false;
  for (const submilestone of submilestones) {
    const ensured = await ensureGeneratedSubmilestoneActionItem(ctx, {
      authorization: scope.authorization,
      milestone: input.milestone,
      now: input.historicalBackfill?.materializedAt ?? now,
      postId,
      submilestone,
      silentBackfill: input.historicalBackfill !== undefined,
    });
    generatedActionItemIds.push(ensured.actionItemId);
    actionItemsChanged ||= ensured.changed;
  }
  if (actionItemsChanged && !input.historicalBackfill) {
    await syncPostCounts(ctx, generatedActionItemIds, now);
  } else if (actionItemsChanged && input.historicalBackfill) {
    await syncPostCountsSilently(ctx, postId);
  }

  if (postChanged || actionItemsChanged) {
    await queueBuildCollaborationSearchOwnerRebuild(ctx, {
      authorization: scope.authorization,
      owner: { id: postId, kind: "post" },
      postId,
    });
  }
  return {
    actionItemIds: generatedActionItemIds,
    postId,
    recoveryRequired: submilestones.length === 0,
  };
}

/**
 * Ensure the single collaboration System Post for a canonical Draw
 * occurrence. This helper only writes collaboration attribution/projection
 * records; it never creates or mutates a Draw Request, eligibility, evidence,
 * approval, release, funds, fees, or interest state.
 */
export async function ensureDrawSystemPost(
  ctx: MutationCtx,
  input: {
    actor: { roles: string[]; workosUserId: string };
    build: Doc<"activeBuilds">;
    drawRequest?: Doc<"activeBuildDrawRequests">;
    plannedDraw?: Doc<"plannedDrawScheduleRows">;
    activationReason: DrawSystemActivationReason;
    historicalBackfill?: SystemPostHistoricalBackfill;
    now?: number;
  },
) {
  const plannedDrawKey = input.drawRequest?.plannedDrawKey;
  const plannedDraw =
    input.plannedDraw ??
    (plannedDrawKey
      ? await ctx.db
          .query("plannedDrawScheduleRows")
          .withIndex("by_build_draw_key", (query) =>
            query
              .eq("buildId", input.build._id)
              .eq("drawKey", plannedDrawKey),
          )
          .first()
      : undefined);
  const occurrenceKey = plannedDraw
    ? drawSystemOccurrenceKey(input.build, plannedDraw)
    : `draw-system:${String(input.build._id)}:${String(input.build.proposalId)}:request:${String(input.drawRequest?._id ?? "unknown")}`;
  const now = input.now ?? Date.now();
  const activationRevision = input.historicalBackfill
    ? null
    : await ensureActiveBuildPlanningActivationRevision(ctx, {
        actor: {
          actorRoles: input.actor.roles,
          actorWorkosUserId: input.actor.workosUserId,
        },
        build: input.build,
        now,
      });
  const label = plannedDraw?.label ?? input.drawRequest?.label ?? "Draw";
  const drawDisplay = input.drawRequest?.displayId
    ? ` (${input.drawRequest.displayId})`
    : "";
  const plainText =
    input.historicalBackfill
      ? "Backfilled from existing records. Canonical Draw Request, evidence, review, approval, and release state remain authoritative."
      : input.activationReason === "scheduled"
      ? `${label} is scheduled for Draw coordination today. Canonical Draw Request, evidence, review, approval, and release state remain authoritative; no request was created.`
      : `${label}${drawDisplay} is tracked in DrawFlow System. Canonical Draw Request, evidence, review, approval, and release state remain authoritative.`;
  const primaryReferenceId = String(plannedDraw?._id ?? input.drawRequest?._id ?? "");
  if (!primaryReferenceId) {
    return null;
  }
  const postId = await publishCanonicalBuildCollaborationSystemEvent(ctx, {
    buildId: input.build._id,
    idempotencyKey: occurrenceKey,
    organizationId: input.build.organizationId,
    plainText,
    postType: "update",
    primaryReferenceId,
    primaryReferenceKind: "draw",
    systemLabel: SYSTEM_LABEL,
    systemPostKind: "draw",
    suppressNotifications: !shouldNotifySystemPost(input.activationReason),
    ...(input.historicalBackfill
      ? { silentBackfill: input.historicalBackfill }
      : { now }),
  });
  if (!postId) {
    return null;
  }

  const scope = await resolveSystemEventScope(
    ctx,
    {
      buildId: input.build._id,
      idempotencyKey: `${occurrenceKey}:scope`,
      organizationId: input.build.organizationId,
      plainText: "Draw System Post authorization scope.",
      postType: "update",
      primaryReferenceId,
      primaryReferenceKind: "draw",
      systemLabel: SYSTEM_LABEL,
      systemPostKind: "draw",
    },
    `${occurrenceKey}:scope`,
  );
  if (scope.status !== "ready") {
    return null;
  }
  const post = await ctx.db.get(postId);
  if (!post || post.buildId !== input.build._id) {
    throw new Error("Draw System Post became unavailable.");
  }
  if (
    post.organizationId !== input.build.organizationId ||
    post.brokerageId !== input.build.brokerageId
  ) {
    return null;
  }
  const triggeredByRole = input.historicalBackfill
    ? undefined
    : resolveEffectiveCollaborationRole(input.actor.roles)?.role;
  const postPatch = {
    activationPlanningRevisionId:
      post.activationPlanningRevisionId ?? activationRevision?._id,
    activationReason: post.activationReason ?? input.activationReason,
    authorDisplayNameSnapshot: SYSTEM_LABEL,
    authorRolesSnapshot: ["system"],
    authorWorkosUserId: SYSTEM_AUTHOR,
    canonicalBuildDrawOccurrenceKey:
      post.canonicalBuildDrawOccurrenceKey ?? occurrenceKey,
    systemEventKey: occurrenceKey,
    systemOccurrenceKey: occurrenceKey,
    systemPostKind: "draw" as const,
    currentPlanningRevision:
      post.currentPlanningRevision ?? activationRevision?.revision,
    systemLifecycle: post.systemLifecycle ?? "open",
    ...(input.drawRequest
      ? (() => {
          const disposition = drawSystemDispositionForStatus(input.drawRequest.status);
          return disposition ? { systemDisposition: disposition } : {};
        })()
      : {}),
    ...(input.historicalBackfill
      ? {}
      : { triggeredAt: post.triggeredAt ?? now }),
    ...(input.historicalBackfill
      ? {}
      : { triggeredByRole: post.triggeredByRole ?? triggeredByRole }),
    ...(input.historicalBackfill
      ? {}
      : {
          triggeredByWorkosUserId:
            post.triggeredByWorkosUserId ?? input.actor.workosUserId,
        }),
    ...(input.historicalBackfill
      ? {
          historicalBackfill: {
            ...input.historicalBackfill,
            source: "existing_records" as const,
          },
          materializedAt: input.historicalBackfill.materializedAt,
        }
      : {}),
  };
  const postChanged =
    post.activationPlanningRevisionId !== postPatch.activationPlanningRevisionId ||
    post.activationReason !== postPatch.activationReason ||
    post.authorDisplayNameSnapshot !== postPatch.authorDisplayNameSnapshot ||
    JSON.stringify(post.authorRolesSnapshot) !==
      JSON.stringify(postPatch.authorRolesSnapshot) ||
    post.authorWorkosUserId !== postPatch.authorWorkosUserId ||
    post.canonicalBuildDrawOccurrenceKey !==
      postPatch.canonicalBuildDrawOccurrenceKey ||
    post.systemEventKey !== postPatch.systemEventKey ||
    post.systemOccurrenceKey !== postPatch.systemOccurrenceKey ||
    post.systemPostKind !== postPatch.systemPostKind ||
    post.currentPlanningRevision !== postPatch.currentPlanningRevision ||
    post.systemLifecycle !== postPatch.systemLifecycle ||
    (("systemDisposition" in postPatch &&
      post.systemDisposition !== postPatch.systemDisposition) ||
      ("triggeredAt" in postPatch && post.triggeredAt !== postPatch.triggeredAt) ||
      ("triggeredByRole" in postPatch &&
        post.triggeredByRole !== postPatch.triggeredByRole) ||
      ("triggeredByWorkosUserId" in postPatch &&
        post.triggeredByWorkosUserId !== postPatch.triggeredByWorkosUserId) ||
      ("materializedAt" in postPatch &&
        post.materializedAt !== postPatch.materializedAt) ||
      ("historicalBackfill" in postPatch &&
        JSON.stringify(post.historicalBackfill) !==
          JSON.stringify(postPatch.historicalBackfill)));
  if (postChanged) {
    await ctx.db.patch(postId, { ...postPatch, updatedAt: now });
    await queueBuildCollaborationSearchOwnerRebuild(ctx, {
      authorization: scope.authorization,
      owner: { id: postId, kind: "post" },
      postId,
    });
  }
  return {
    occurrenceKey,
    plannedDrawId: plannedDraw?._id,
    postId,
  };
}

function drawSystemLifecycleForStatus(
  status:
    | Doc<"plannedDrawScheduleRows">["status"]
    | Doc<"activeBuildDrawRequests">["status"],
): "open" | "resolved" {
  return status === "released" ||
    status === "withdrawn" ||
    status === "cancelled" ||
    status === "rejected"
    ? "resolved"
    : "open";
}

function drawSystemDispositionForStatus(
  status: Doc<"activeBuildDrawRequests">["status"],
) {
  if (status === "released") return "released" as const;
  if (status === "withdrawn") return "withdrawal" as const;
  if (status === "cancelled") return "cancellation" as const;
  if (status === "rejected") return "final_decline" as const;
  return undefined;
}

/**
 * Project a historical canonical lifecycle without emitting collaboration
 * activity. Backfill callers use this after the idempotent ensure path so the
 * post remains a durable, read-safe projection of the source records.
 */
export async function projectHistoricalSystemPostLifecycle(
  ctx: MutationCtx,
  input: {
    buildId: Id<"activeBuilds">;
    lifecycle: "open" | "resolved";
    materializedAt: number;
    organizationId: string;
    postId: Id<"buildCollaborationPosts">;
    historicalBackfill: SystemPostHistoricalBackfill;
  },
) {
  const post = await ctx.db.get(input.postId);
  if (
    !post ||
    post.buildId !== input.buildId ||
    post.organizationId !== input.organizationId ||
    !post.systemPostKind ||
    post.contentState !== "active"
  ) {
    return null;
  }
  const nextState = input.lifecycle === "resolved" ? "resolved" : "open";
  const nextLifecycle = input.lifecycle === "resolved" ? "resolved" : "open";
  const nextSummary =
    input.lifecycle === "resolved"
      ? "Backfilled from existing records."
      : undefined;
  const nextHistoricalBackfill = {
    ...input.historicalBackfill,
    source: "existing_records" as const,
  };
  const nextActivityAt = input.historicalBackfill.historicalAt ?? 0;
  const unchanged =
    post.threadState === nextState &&
    post.systemLifecycle === nextLifecycle &&
    post.resolutionSummary === nextSummary &&
    post.resolvedAt ===
      (input.lifecycle === "resolved"
        ? input.historicalBackfill.historicalAt
        : undefined) &&
    post.resolvedByWorkosUserId ===
      (input.lifecycle === "resolved"
        ? input.historicalBackfill.historicalActorWorkosUserId
        : undefined) &&
    post.lastMeaningfulActivityAt === nextActivityAt &&
    post.latestActivityActorWorkosUserId ===
      input.historicalBackfill.historicalActorWorkosUserId &&
    post.materializedAt === input.materializedAt &&
    JSON.stringify(post.historicalBackfill) ===
      JSON.stringify(nextHistoricalBackfill);
  if (unchanged) return post._id;
  await ctx.db.patch(post._id, {
    historicalBackfill: nextHistoricalBackfill,
    lastMeaningfulActivityAt: nextActivityAt,
    latestActivityActorWorkosUserId:
      input.historicalBackfill.historicalActorWorkosUserId,
    materializedAt: input.materializedAt,
    resolutionSummary: nextSummary,
    resolvedAt:
      input.lifecycle === "resolved"
        ? input.historicalBackfill.historicalAt
        : undefined,
    resolvedByWorkosUserId:
      input.lifecycle === "resolved"
        ? input.historicalBackfill.historicalActorWorkosUserId
        : undefined,
    systemLifecycle: nextLifecycle,
    threadState: nextState,
    updatedAt: input.materializedAt,
  });
  return post._id;
}

/** Synchronize only the existing Draw System Post with canonical lifecycle. */
export async function synchronizeDrawSystemPostLifecycle(
  ctx: MutationCtx,
  input: {
    actorRole: BuildCollaborationRole;
    actorWorkosUserId: string;
    buildId: Id<"activeBuilds">;
    drawRequest?: Doc<"activeBuildDrawRequests">;
    lifecycle: "open" | "resolved";
    occurrenceKey?: string;
    organizationId: string;
    postId?: Id<"buildCollaborationPosts">;
    reason?: string;
  },
) {
  const post =
    (input.postId ? await ctx.db.get(input.postId) : null) ??
    (input.occurrenceKey
      ? await ctx.db
          .query("buildCollaborationPosts")
          .withIndex(
            "by_buildId_and_systemPostKind_and_drawOccurrenceKey",
            (query) =>
              query
                .eq("buildId", input.buildId)
                .eq("systemPostKind", "draw")
                .eq("canonicalBuildDrawOccurrenceKey", input.occurrenceKey!),
          )
          .first()
      : null);
  if (
    !post ||
    post.buildId !== input.buildId ||
    post.organizationId !== input.organizationId ||
    post.systemPostKind !== "draw" ||
    post.contentState !== "active"
  ) {
    return null;
  }
  // A released Draw is immutable from the collaboration surface. A late
  // retry/replay must not reopen it, even if an upstream command is stale.
  if (
    input.lifecycle === "open" &&
    (input.drawRequest?.status === "released" ||
      post.systemDisposition === "released")
  ) {
    return post._id;
  }
  const nextState = input.lifecycle === "resolved" ? "resolved" : "open";
  const nextSystemLifecycle =
    input.lifecycle === "resolved"
      ? "resolved"
      : post.systemLifecycle === "resolved"
        ? "reopened"
        : "open";
  if (
    post.threadState === nextState &&
    post.systemLifecycle === nextSystemLifecycle
  ) {
    return post._id;
  }
  const now = Date.now();
  const priorState = JSON.stringify({
    resolutionSummary: post.resolutionSummary,
    resolvedAt: post.resolvedAt,
    systemLifecycle: post.systemLifecycle,
    threadRevision: post.threadRevision ?? 0,
    threadState: post.threadState,
  });
  const disposition = input.drawRequest
    ? drawSystemDispositionForStatus(input.drawRequest.status)
    : undefined;
  const resolutionSummary =
    input.lifecycle === "resolved"
      ? input.reason?.trim() ||
        (disposition === "released"
          ? "Draw released."
          : disposition === "withdrawal"
            ? "Draw request withdrawn."
            : disposition === "cancellation"
              ? "Draw request cancelled."
              : disposition === "final_decline"
                ? "Draw request finally declined."
                : "Draw disposition recorded.")
      : undefined;
  await ctx.db.patch(post._id, {
    acceptedCommentId: undefined,
    decisionOutcome: undefined,
    decisionOwnerWorkosUserId: undefined,
    lastMeaningfulActivityAt: now,
    latestActivityActorWorkosUserId: input.actorWorkosUserId,
    resolutionSummary,
    ...(disposition ? { systemDisposition: disposition } : {}),
    resolvedAt: input.lifecycle === "resolved" ? now : undefined,
    resolvedByWorkosUserId:
      input.lifecycle === "resolved" ? input.actorWorkosUserId : undefined,
    systemLifecycle: nextSystemLifecycle,
    threadRevision: (post.threadRevision ?? 0) + 1,
    threadState: nextState,
    updatedAt: now,
  });
  await ctx.db.insert("buildCollaborationThreadEvents", {
    actorRole: input.actorRole,
    actorWorkosUserId: input.actorWorkosUserId,
    brokerageId: post.brokerageId,
    buildId: post.buildId,
    createdAt: now,
    eventType: input.lifecycle === "resolved" ? "resolved" : "reopened",
    newState: JSON.stringify({
      resolutionSummary,
      systemLifecycle: nextSystemLifecycle,
      threadState: nextState,
    }),
    organizationId: post.organizationId,
    postId: post._id,
    priorState,
    reason: input.reason,
  });
  await ctx.db.insert("auditEvents", {
    actorRoles: [input.actorRole],
    actorWorkosUserId: input.actorWorkosUserId,
    brokerageId: post.brokerageId,
    command: "synchronizeDrawSystemPostLifecycle",
    createdAt: now,
    entityId: String(post._id),
    entityType: "buildCollaborationPost",
    eventType:
      input.lifecycle === "resolved"
        ? "build.collaboration.thread.resolved"
        : "build.collaboration.thread.reopened",
    newState: JSON.stringify({
      disposition,
      systemLifecycle: nextSystemLifecycle,
      threadState: nextState,
    }),
    organizationId: post.organizationId,
    priorState,
    reason: input.reason,
    warnings: ["canonical_draw_state_is_authoritative"],
  });
  return post._id;
}

/** Ensure and then project the canonical Draw lifecycle into one post. */
export async function synchronizeDrawSystemPostForCanonicalDraw(
  ctx: MutationCtx,
  input: {
    actor: { roles: string[]; workosUserId: string };
    build: Doc<"activeBuilds">;
    drawRequest?: Doc<"activeBuildDrawRequests">;
    plannedDraw?: Doc<"plannedDrawScheduleRows">;
    activationReason: DrawSystemActivationReason;
    reason?: string;
    now?: number;
  },
) {
  const ensured = await ensureDrawSystemPost(ctx, input);
  if (!ensured) {
    return null;
  }
  const status = input.drawRequest?.status ?? input.plannedDraw?.status ?? "planned";
  const lifecycle = drawSystemLifecycleForStatus(status);
  const actorRole = resolveEffectiveCollaborationRole(input.actor.roles)?.role;
  await synchronizeDrawSystemPostLifecycle(ctx, {
    actorRole: actorRole ?? "admin",
    actorWorkosUserId: input.actor.workosUserId,
    buildId: input.build._id,
    drawRequest: input.drawRequest,
    lifecycle,
    occurrenceKey: ensured.occurrenceKey,
    organizationId: input.build.organizationId,
    postId: ensured.postId,
    reason: input.reason,
  });
  return ensured;
}

/**
 * Refresh an existing Milestone System Post after an approved planning write.
 * Unlike activation, this function never creates a second post or mutates
 * canonical execution state. It is intentionally idempotent for retries.
 */
export async function synchronizeMilestoneSystemPostPlanning(
  ctx: MutationCtx,
  input: {
    actor: { roles: string[]; workosUserId: string };
    build: Doc<"activeBuilds">;
    milestone: Doc<"buildMilestones">;
  }
) {
  const post = await ctx.db
    .query("buildCollaborationPosts")
    .withIndex(
      "by_buildId_and_systemPostKind_and_canonicalBuildMilestoneId",
      (query) =>
        query
          .eq("buildId", input.build._id)
          .eq("systemPostKind", "milestone")
          .eq("canonicalBuildMilestoneId", input.milestone._id)
    )
    .take(1)
    .then((rows) => rows[0]);
  if (!post) return null;
  const scope = await resolveSystemEventScope(
    ctx,
    {
      buildId: input.build._id,
      idempotencyKey: `${post.systemOccurrenceKey ?? post._id}:scope`,
      organizationId: input.build.organizationId,
      plainText: "Milestone System Post authorization scope.",
      postType: "update",
      systemLabel: SYSTEM_LABEL,
    },
    `${post.systemOccurrenceKey ?? post._id}:scope`
  );
  if (scope.status !== "ready") return null;
  const revision = await ctx.db
    .query("activeBuildPlanningRevisions")
    .withIndex("by_build_revision", (query) =>
      query.eq("buildId", input.build._id)
    )
    .order("desc")
    .take(1)
    .then((rows) => rows[0]);
  const submilestones = await ctx.db
    .query("buildSubmilestones")
    .withIndex("by_milestone", (query) =>
      query.eq("buildMilestoneId", input.milestone._id)
    )
    .take(500);
  const actionItemIds: Id<"buildActionItems">[] = [];
  let changed = false;
  for (const submilestone of submilestones) {
    const ensured = await ensureGeneratedSubmilestoneActionItem(ctx, {
      authorization: scope.authorization,
      milestone: input.milestone,
      now: Date.now(),
      postId: post._id,
      submilestone,
    });
    actionItemIds.push(ensured.actionItemId);
    changed ||= ensured.changed;
  }
  const patch = {
    ...(revision ? { currentPlanningRevision: revision.revision } : {}),
    updatedAt: Date.now(),
  };
  if (revision && post.currentPlanningRevision !== revision.revision) {
    await ctx.db.patch(post._id, patch);
    changed = true;
  }
  if (changed && actionItemIds.length > 0) {
    await syncPostCounts(ctx, actionItemIds, Date.now());
  }
  return post._id;
}

/**
 * Synchronize the collaboration projection after a canonical Milestone review
 * command.  The review module owns approval state; this helper only updates
 * the existing System Post lifecycle and appends its collaboration history.
 */
export async function synchronizeMilestoneSystemPostLifecycle(
  ctx: MutationCtx,
  input: {
    actorRole: BuildCollaborationRole;
    actorWorkosUserId: string;
    buildId: Id<"activeBuilds">;
    lifecycle: "open" | "resolved";
    organizationId: string;
    postId: Id<"buildCollaborationPosts">;
    reason?: string;
  }
) {
  const post = await ctx.db.get(input.postId);
  if (
    !post ||
    post.buildId !== input.buildId ||
    post.organizationId !== input.organizationId ||
    post.systemPostKind !== "milestone" ||
    post.contentState !== "active"
  ) {
    return null;
  }
  const nextState = input.lifecycle === "resolved" ? "resolved" : "open";
  if (post.threadState === nextState) {
    return post._id;
  }
  const now = Date.now();
  const priorState = JSON.stringify({
    resolutionSummary: post.resolutionSummary,
    resolvedAt: post.resolvedAt,
    threadRevision: post.threadRevision ?? 0,
    threadState: post.threadState,
  });
  await ctx.db.patch(post._id, {
    acceptedCommentId: undefined,
    decisionOutcome: undefined,
    decisionOwnerWorkosUserId: undefined,
    lastMeaningfulActivityAt: now,
    latestActivityActorWorkosUserId: input.actorWorkosUserId,
    resolutionSummary:
      input.lifecycle === "resolved"
        ? input.reason?.trim() || "Milestone approved."
        : undefined,
    resolvedAt: input.lifecycle === "resolved" ? now : undefined,
    resolvedByWorkosUserId:
      input.lifecycle === "resolved" ? input.actorWorkosUserId : undefined,
    threadRevision: (post.threadRevision ?? 0) + 1,
    threadState: nextState,
    systemLifecycle:
      input.lifecycle === "resolved"
        ? "resolved"
        : post.systemLifecycle === "resolved"
          ? "reopened"
          : "open",
    updatedAt: now,
  });
  await ctx.db.insert("buildCollaborationThreadEvents", {
    actorRole: input.actorRole,
    actorWorkosUserId: input.actorWorkosUserId,
    brokerageId: post.brokerageId,
    buildId: post.buildId,
    createdAt: now,
    eventType: input.lifecycle === "resolved" ? "resolved" : "reopened",
    newState: JSON.stringify({
      resolutionSummary:
        input.lifecycle === "resolved"
          ? input.reason?.trim() || "Milestone approved."
          : undefined,
      threadState: nextState,
    }),
    organizationId: post.organizationId,
    postId: post._id,
    priorState,
    reason: input.reason,
  });
  await ctx.db.insert("auditEvents", {
    actorRoles: [input.actorRole],
    actorWorkosUserId: input.actorWorkosUserId,
    brokerageId: post.brokerageId,
    command:
      input.lifecycle === "resolved"
        ? "approveActiveBuildMilestoneReview"
        : "retractActiveBuildMilestoneApproval",
    createdAt: now,
    entityId: String(post._id),
    entityType: "buildCollaborationPost",
    eventType:
      input.lifecycle === "resolved"
        ? "build.collaboration.thread.resolved"
        : "build.collaboration.thread.reopened",
    newState: JSON.stringify({ threadState: nextState }),
    organizationId: post.organizationId,
    priorState,
    reason: input.reason,
    warnings: [],
  });
  return post._id;
}

async function ensureGeneratedSubmilestoneActionItem(
  ctx: MutationCtx,
  input: {
    authorization: ActiveBuildAuthorization;
    milestone: Doc<"buildMilestones">;
    now: number;
    postId: Id<"buildCollaborationPosts">;
    submilestone: Doc<"buildSubmilestones">;
    silentBackfill?: boolean;
  }
): Promise<{ actionItemId: Id<"buildActionItems">; changed: boolean }> {
  const title = input.submilestone.name.trim() || "Unnamed Sub-milestone";
  const existing = (
    await ctx.db
      .query("buildActionItems")
      .withIndex("by_originatingPostId_and_createdAt", (query) =>
        query.eq("originatingPostId", input.postId)
      )
      .take(500)
  ).find(
    (item) =>
      item.systemMode === "generated_milestone_submilestone" &&
      item.canonicalBuildSubmilestoneId === input.submilestone._id
  );
  if (existing) {
    const canonicalPlanningState = input.submilestone.planningState ?? "active";
    const nextCanonicalBindingRevision =
      input.milestone.collaborationEventRevision ?? 1;
    const changed =
      existing.canonicalBuildMilestoneId !== input.milestone._id ||
      existing.canonicalBindingRevision !== nextCanonicalBindingRevision ||
      existing.canonicalPlanningState !== canonicalPlanningState ||
      existing.title !== title;
    if (changed) {
      await ctx.db.patch(existing._id, {
        canonicalBuildMilestoneId: input.milestone._id,
        canonicalBindingRevision: nextCanonicalBindingRevision,
        canonicalPlanningState,
        currentRevision: existing.currentRevision + 1,
        title,
        updatedAt: input.now,
      });
      const updated = await ctx.db.get(existing._id);
      if (!updated) {
        throw new Error("Generated Milestone Action Item became unavailable.");
      }
      if (!input.silentBackfill) {
        await Promise.all([
          recordBuildActionItemRevision(ctx, {
            authorization: input.authorization,
            item: updated,
            now: input.now,
            reason: "canonical_planning_revision",
          }),
          ctx.db.insert("buildActionItemEvents", {
          actionItemId: existing._id,
          actorRole: input.authorization.effectiveRole.role,
          actorWorkosUserId: input.authorization.viewer.subject,
          brokerageId: input.authorization.brokerage._id,
          buildId: input.authorization.build._id,
          createdAt: input.now,
          eventType: "canonical_planning_revision",
          exercisedAuthority: "canonical_milestone",
          newState: JSON.stringify({
            canonicalBuildMilestoneId: input.milestone._id,
            canonicalBuildSubmilestoneId: input.submilestone._id,
            canonicalPlanningState,
            revision: updated.currentRevision,
          }),
          organizationId: input.authorization.organizationId,
          priorState: JSON.stringify({
            canonicalBuildMilestoneId: existing.canonicalBuildMilestoneId,
            canonicalPlanningState: existing.canonicalPlanningState ?? "active",
            revision: existing.currentRevision,
          }),
          revision: updated.currentRevision,
          warnings: ["canonical_state_is_authoritative"],
          }),
        ]);
      }
      return { actionItemId: existing._id, changed: true };
    }
    return { actionItemId: existing._id, changed: false };
  }

  const description = `Canonical Sub-milestone: ${title}. This card mirrors the roadmap state and cannot be completed independently.`;
  const actionItemId = await ctx.db.insert("buildActionItems", {
    assignmentState: "unassigned",
    brokerageId: input.authorization.brokerage._id,
    buildId: input.authorization.build._id,
    canonicalBindingRevision: input.milestone.collaborationEventRevision ?? 1,
    canonicalBuildMilestoneId: input.milestone._id,
    canonicalBuildSubmilestoneId: input.submilestone._id,
    canonicalPlanningState: input.submilestone.planningState ?? "active",
    createdAt: input.now,
    creatorRole: "admin",
    creatorWorkosUserId: SYSTEM_AUTHOR,
    currentRevision: 1,
    descriptionPlainText: description,
    descriptionTiptapJson: plainTextDocument(description),
    originatingPostId: input.postId,
    organizationId: input.authorization.organizationId,
    priority: "none",
    queueSortAt: buildActionItemQueueSortAt(undefined, "todo"),
    requiresAcceptance: false,
    status: "todo",
    systemMode: "generated_milestone_submilestone",
    title,
    updatedAt: input.now,
    workKind: "ordinary",
  });
  const item = await ctx.db.get(actionItemId);
  if (!item) {
    throw new Error("Generated Milestone Action Item became unavailable.");
  }
  await linkBuildActionItemToPost(ctx, {
    actionItemId,
    brokerageId: input.authorization.brokerage._id,
    buildId: input.authorization.build._id,
    createdAt: input.now,
    linkKind: "originating",
    organizationId: input.authorization.organizationId,
    postId: input.postId,
  });
  if (!input.silentBackfill) {
    await Promise.all([
      recordBuildActionItemRevision(ctx, {
        authorization: input.authorization,
        item,
        now: input.now,
        reason: "canonical_milestone_start",
      }),
      ctx.db.insert("buildActionItemEvents", {
      actionItemId,
      actorRole: "admin",
      actorWorkosUserId: SYSTEM_AUTHOR,
      brokerageId: input.authorization.brokerage._id,
      buildId: input.authorization.build._id,
      createdAt: input.now,
      eventType: "created_by_canonical_milestone",
      exercisedAuthority: "canonical_milestone",
      newState: JSON.stringify({
        canonicalBuildMilestoneId: input.milestone._id,
        canonicalBuildSubmilestoneId: input.submilestone._id,
        status: "todo",
        systemMode: "generated_milestone_submilestone",
      }),
      organizationId: input.authorization.organizationId,
      revision: 1,
      warnings: ["canonical_state_is_authoritative"],
      }),
      ctx.db.insert("buildActionItemCreationRequests", {
      actionItemId,
      brokerageId: input.authorization.brokerage._id,
      buildId: input.authorization.build._id,
      createdAt: input.now,
      creatorWorkosUserId: SYSTEM_AUTHOR,
      organizationId: input.authorization.organizationId,
      postId: input.postId,
      requestId: `milestone-system:${input.milestone._id}:${input.submilestone._id}`,
      }),
    ]);
  }
  await Promise.all([
    ctx.db.insert("buildCollaborationReferences", {
      actionItemQueueSortAt: item.queueSortAt,
      brokerageId: input.authorization.brokerage._id,
      buildId: input.authorization.build._id,
      createdAt: input.now,
      entityId: String(input.submilestone._id),
      entityKind: "submilestone",
      labelSnapshot: input.submilestone.name,
      organizationId: input.authorization.organizationId,
      ownerKind: "actionItem",
      ownerRecordId: actionItemId,
      postId: input.postId,
      primary: true,
      summarySnapshot: description,
    }),
    ctx.db.insert("buildCollaborationReferences", {
      actionItemQueueSortAt: item.queueSortAt,
      brokerageId: input.authorization.brokerage._id,
      buildId: input.authorization.build._id,
      createdAt: input.now,
      entityId: String(input.milestone._id),
      entityKind: "milestone",
      labelSnapshot: input.milestone.name,
      organizationId: input.authorization.organizationId,
      ownerKind: "actionItem",
      ownerRecordId: actionItemId,
      postId: input.postId,
      primary: false,
      summarySnapshot: "Canonical Milestone binding",
    }),
    ...(input.silentBackfill
      ? []
      : [
          ctx.db.insert("buildCollaborationActivityProjections", {
            actionItemId,
            actorWorkosUserId: SYSTEM_AUTHOR,
            brokerageId: input.authorization.brokerage._id,
            buildId: input.authorization.build._id,
            createdAt: input.now,
            eventType: "created_by_canonical_milestone",
            organizationId: input.authorization.organizationId,
            postId: input.postId,
            projectionKey: `milestone-system:${input.milestone._id}:${input.submilestone._id}`,
            targetId: String(input.submilestone._id),
            targetKind: "submilestone",
          }),
          ctx.db.insert("auditEvents", {
            actorRoles: ["system"],
            actorWorkosUserId: SYSTEM_AUTHOR,
            brokerageId: input.authorization.brokerage._id,
            command: "ensureMilestoneSystemPost",
            createdAt: input.now,
            entityId: actionItemId,
            entityType: "buildActionItem",
            eventType: "build.collaboration.action_item.canonical_milestone_created",
            newState: JSON.stringify({
              actionItemId,
              canonicalBuildMilestoneId: input.milestone._id,
              canonicalBuildSubmilestoneId: input.submilestone._id,
              postId: input.postId,
            }),
            organizationId: input.authorization.organizationId,
            warnings: ["canonical_state_is_authoritative"],
          }),
          ctx.db.insert("eventOutbox", {
            brokerageId: input.authorization.brokerage._id,
            createdAt: input.now,
            eventType: "build.collaboration.action_item.canonical_milestone_created",
            organizationId: input.authorization.organizationId,
            payloadPreview: JSON.stringify({
              actionItemId,
              canonicalBuildMilestoneId: input.milestone._id,
              canonicalBuildSubmilestoneId: input.submilestone._id,
            }),
            relatedEntityId: actionItemId,
            relatedEntityType: "buildActionItem",
            status: "pending",
          }),
        ]),
  ]);
  return { actionItemId, changed: true };
}

async function syncPostCounts(
  ctx: MutationCtx,
  actionItemIds: Id<"buildActionItems">[],
  now: number
) {
  for (const actionItemId of actionItemIds) {
    await syncLinkedActionItemPostCounts(ctx, {
      actionItemId,
      actorWorkosUserId: SYSTEM_AUTHOR,
      now,
    });
  }
}

/** Update the canonical open-item count without creating activity records. */
async function syncPostCountsSilently(
  ctx: MutationCtx,
  postId: Id<"buildCollaborationPosts">,
) {
  const post = await ctx.db.get(postId);
  if (!post) return;
  const linkedItems = await ctx.db
    .query("buildActionItems")
    .withIndex("by_originatingPostId_and_createdAt", (query) =>
      query.eq("originatingPostId", postId),
    )
    .take(1001);
  if (linkedItems.length > 1000) {
    throw new Error("System Post Action Item count exceeds the supported safety limit.");
  }
  const openActionItemCount = linkedItems.filter(
    (item) => item.status !== "done" && item.status !== "cancelled",
  ).length;
  await ctx.db.patch(postId, { openActionItemCount });
}

function plainTextDocument(value: string) {
  return JSON.stringify({
    content: [
      {
        content: [{ text: value, type: "text" }],
        type: "paragraph",
      },
    ],
    type: "doc",
  });
}

export function milestoneSystemTriggerRole(
  roles: readonly string[]
): BuildCollaborationRole | undefined {
  return resolveEffectiveCollaborationRole(roles)?.role;
}
