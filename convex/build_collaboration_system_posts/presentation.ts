import type { ActiveBuildAuthorization } from "../activeBuildAccess";
import { buildActionItemQueueSortAt } from "../build_action_item_deadline_model";
import { recordBuildActionItemRevision } from "../build_action_item_history";
import {
  linkBuildActionItemToPost,
  syncLinkedActionItemPostCounts,
} from "../build_action_item_post_links";
import {
  type BuildCollaborationRole,
  resolveEffectiveCollaborationRole,
} from "../build_collaboration_model";
import { ensureActiveBuildPlanningActivationRevision } from "../build_collaboration_planning_reconciliation";
import { queueBuildCollaborationSearchOwnerRebuild } from "../build_collaboration_search_maintenance";
import { resolveCanonicalMilestoneExecutionOwnership } from "../build_collaboration_system_event_access";
import type { SystemPostHistoricalBackfill } from "../build_collaboration_system_events";
import {
  activateLatentBuildCollaborationSystemEvent,
  publishCanonicalBuildCollaborationSystemEvent,
  resolveSystemEventScope,
} from "../build_collaboration_system_events";
import { resolveActiveSubmilestoneEvidencePackageReadiness } from "../build_submilestone_evidence";
import { resolveSubmilestoneOperateAuthority } from "../build_submilestone_operate_authority";
import type { Doc, Id, MutationCtx, QueryCtx } from "../types";

const SYSTEM_AUTHOR = "system";
const SYSTEM_LABEL = "DrawFlow System";

export type MilestoneSystemActivationReason =
  | "explicit_start"
  | "plan_activated"
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
  activationReason: MilestoneSystemActivationReason | DrawSystemActivationReason
) {
  return (
    activationReason === "explicit_start" || activationReason === "draw_request"
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
  draw: Pick<
    Doc<"plannedDrawScheduleRows">,
    "drawKey" | "proposalDrawScheduleRowId"
  >
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
  bindingState: "valid" | "invalid";
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
    assigneeWorkosUserId?: string;
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
      | "lender_review_only"
      | "permission_denied";
    buildSubmilestoneId: Id<"buildSubmilestones">;
    milestoneKey: string;
    milestoneName: string;
    plannedStartDate: string;
    proposalSubmilestoneId: Id<"proposalSubmilestones">;
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
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new Error(`Invalid Build-local calendar date ${date}.`);
  }
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
  if (
    next.getUTCFullYear() !== year ||
    next.getUTCMonth() !== month - 1 ||
    next.getUTCDate() !== day
  ) {
    throw new Error(`Invalid Build-local calendar date ${date}.`);
  }
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
  if (buildLocalDateAt(candidate, normalizedTimezone) === date) {
    return candidate;
  }

  // Some timezones skip local midnight when daylight saving time begins. The
  // fixed-point conversion above can then settle on the previous local date;
  // advance through a bounded window until the requested Build-local date is
  // valid and return its first representable instant.
  const minuteMs = 60 * 1000;
  const maxSearchMinutes = 48 * 60;
  for (let minute = 1; minute <= maxSearchMinutes; minute += 1) {
    const next = candidate + minute * minuteMs;
    if (buildLocalDateAt(next, normalizedTimezone) === date) {
      return next;
    }
  }
  throw new Error(
    `Unable to resolve Build-local midnight for ${date} in timezone ${normalizedTimezone}.`
  );
}

function unknownSystemActionItemPresentation(
  reason: string,
  bindingState: SystemActionItemPresentation["bindingState"]
) {
  return {
    bindingState,
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
  return;
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
  return;
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
  ctx: QueryCtx | MutationCtx,
  input: {
    actionItem: Doc<"buildActionItems">;
    asOf: number;
    build: Doc<"activeBuilds">;
    planningCache?: MilestoneActionItemPlanningCache;
    viewer?: {
      role: BuildCollaborationRole;
      roles?: readonly BuildCollaborationRole[];
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
      "Generated System Action Item is missing its canonical Milestone binding.",
      "invalid"
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
      "Canonical Milestone or Sub-milestone binding is unavailable.",
      "invalid"
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
      "Build start date is invalid; schedule state requires a valid Build-local calendar date.",
      "valid"
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
        "Build timezone is unavailable; schedule state requires an explicit IANA timezone.",
        "valid"
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
        "Build timezone is invalid; schedule state requires an explicit IANA timezone.",
        "valid"
      ),
      ...execution,
    };
  }
  const base = {
    bindingState: "valid" as const,
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
      roles?: readonly BuildCollaborationRole[];
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
  const viewerRoles = input.viewer.roles ?? [input.viewer.role];
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
  ].some((role) => viewerRoles.includes(role as BuildCollaborationRole));
  const viewerIsAdmin = viewerRoles.includes("admin");
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
  const [startAuthority, updateAuthority] = await Promise.all([
    resolveSubmilestoneOperateAuthority(ctx, {
      build: input.build,
      intent: "start",
      milestoneCompleted:
        input.milestone.status === "complete" ||
        input.milestone.completionClaim !== undefined,
      ownership,
      submilestone: input.submilestone,
      viewer: {
        roles: viewerRoles,
        workosUserId: input.viewer.workosUserId,
      },
    }),
    resolveSubmilestoneOperateAuthority(ctx, {
      build: input.build,
      intent: "update",
      milestoneCompleted:
        input.milestone.status === "complete" ||
        input.milestone.completionClaim !== undefined,
      ownership,
      submilestone: input.submilestone,
      viewer: {
        roles: viewerRoles,
        workosUserId: input.viewer.workosUserId,
      },
    }),
  ]);
  const allowed = startAuthority.allowed;
  const denialReason = startAuthority.allowed
    ? undefined
    : startAuthority.denial;
  const canUpdateExecution =
    updateAuthority.allowed &&
    input.submilestone.evidenceReviewState !== "in_review" &&
    input.submilestone.evidenceReviewState !== "approved";
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
      ...(viewerRoles.includes("contractor") ||
      viewerRoles.includes("homeowner")
        ? {}
        : ownership.contractor
          ? {
              assigneeDisplayName: ownership.contractor.name,
              assigneeId: ownership.contractor._id,
              ...(ownership.contractor.accountWorkosUserId
                ? {
                    assigneeWorkosUserId:
                      ownership.contractor.accountWorkosUserId,
                  }
                : {}),
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
      buildSubmilestoneId: input.submilestone._id,
      dependencyBlockers,
      ...(denialReason ? { denialReason } : {}),
      milestoneKey: input.milestone.key,
      milestoneName: input.milestone.name,
      plannedStartDate: input.plannedStartDate,
      proposalSubmilestoneId: input.submilestone.proposalSubmilestoneId,
      scope: "submilestone",
      source: "submilestone_detail",
      submilestoneKey: input.submilestone.key,
      submilestoneName: input.submilestone.name,
    },
  };
}
