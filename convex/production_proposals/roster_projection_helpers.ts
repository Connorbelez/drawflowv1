/**
 * Production proposals roster projection helpers bounded-context implementation.
 * The parent facade re-exports its handlers to preserve production_proposals function references.
 */
import { type Doc, type QueryCtx } from "../types";
import { canReadBackofficeProposal } from "./contractor_policy_helpers.js";
import { productionBuildDisplayId } from "./directory_cards.js";
import { type BackofficeBuildRosterRowWithStorage, type BackofficeBuildRosterAuth } from "./roster_contracts.js";

type ProductionSiteVisitOperationalStatus =
  | "open"
  | "in_field"
  | "expired"
  | "complete"
  | "cancelled";

export function productionSiteVisitOperationalStatus(
  visit: Pick<
    Doc<"buildSiteVisits">,
    "status" | "tokenConsumedAt" | "tokenExpiresAt" | "tokenOpenedAt"
  >,
  now = Date.now(),
): ProductionSiteVisitOperationalStatus {
  if (visit.status === "complete") {
    return "complete";
  }
  if (visit.status === "cancelled") {
    return "cancelled";
  }
  if (visit.tokenExpiresAt <= now) {
    return "expired";
  }
  if (visit.tokenOpenedAt) {
    return "in_field";
  }
  return "open";
}

export async function projectBackofficeBuildRosterRow(
  ctx: QueryCtx,
  {
    auth,
    build,
    staffCanRead,
  }: {
    auth: BackofficeBuildRosterAuth;
    build: Doc<"activeBuilds">;
    staffCanRead: boolean;
  },
): Promise<BackofficeBuildRosterRowWithStorage | null> {
  const proposal = await ctx.db.get(build.proposalId);
  if (!proposal || !(canReadBackofficeProposal(auth, proposal) || staffCanRead)) {
    return null;
  }

  const [
    builder,
    milestones,
    plannedDraws,
    drawRequests,
    loan,
    evidence,
    visits,
  ] = await Promise.all([
      ctx.db.get(build.builderProfileId),
      ctx.db
        .query("buildMilestones")
        .withIndex("by_build_order", (q) => q.eq("buildId", build._id))
        .take(100),
      ctx.db
        .query("plannedDrawScheduleRows")
        .withIndex("by_build_order", (q) => q.eq("buildId", build._id))
        .take(100),
      ctx.db
        .query("activeBuildDrawRequests")
        .withIndex("by_build", (q) => q.eq("buildId", build._id))
        .take(100),
      ctx.db
        .query("loanFacilities")
        .withIndex("by_build", (q) => q.eq("buildId", build._id))
        .unique(),
      ctx.db
        .query("buildEvidenceAssets")
        .withIndex("by_build", (q) => q.eq("buildId", build._id))
        .take(100),
      ctx.db
        .query("buildSiteVisits")
        .withIndex("by_build", (q) => q.eq("buildId", build._id))
        .take(100),
    ]);

  const resolvedVisitCounts = backofficeBuildRosterVisitCounts(
    visits,
    build.organizationId,
  );
  const milestonesComplete = milestones.filter(
    (milestone) => milestone.status === "complete",
  ).length;
  const milestonesInReview = milestones.filter(
    productionMilestoneNeedsBackofficeReview,
  ).length;
  const drawRequestsPending = drawRequests.filter(
    (request) => request.status === "requested",
  ).length;
  const milestonesBehindSchedule = milestones.filter((milestone) =>
    productionMilestoneIsBehindSchedule(
      milestone,
      productionDaysActive(build.startDate),
    ),
  ).length;
  const firstImage = evidence.find(
    (asset) => asset.storageId && asset.mimeType.startsWith("image/"),
  );
  const activeMilestone =
    milestones.find((milestone) => milestone.status !== "complete") ??
    milestones[0];
  const phase = productionBuildRosterPhase({
    build,
    drawRequestsPending,
    expiredSiteVisits: resolvedVisitCounts.expired,
    loan,
    milestones,
    milestonesInReview,
  });

  return {
    activeMilestoneName:
      activeMilestone?.name ?? `${milestones.length} milestones`,
    buildId: build._id,
    buildName: build.buildName,
    buildStatus: build.status,
    buildStatusLabel: productionBuildStatusLabel(build.status),
    builderName: builder?.displayName ?? "Builder",
    ...(proposal.closedAt === undefined ? {} : { closedAt: proposal.closedAt }),
    daysActive: productionDaysActive(build.startDate),
    displayId: productionBuildDisplayId(build),
    drawCount: plannedDraws.length,
    drawRequestsPending,
    href: `/backoffice/builds/${build._id}`,
    imageStorageId: firstImage?.storageId ?? null,
    ...(loan ? { loanStatus: loan.status } : {}),
    location: build.location,
    ...(build.locationLatitude === undefined
      ? {}
      : { locationLatitude: build.locationLatitude }),
    ...(build.locationLongitude === undefined
      ? {}
      : { locationLongitude: build.locationLongitude }),
    milestonesBehindSchedule,
    milestonesComplete,
    milestonesInReview,
    milestonesTotal: milestones.length,
    phase,
    proposalStatus: proposal.status,
    siteVisitsExpired: resolvedVisitCounts.expired,
    siteVisitsOpen: resolvedVisitCounts.open,
    startDate: build.startDate,
    totalBudgetCents: build.totalBudgetCents,
    updatedAt: build.updatedAt,
  };
}

function backofficeBuildRosterVisitCounts(
  visits: Doc<"buildSiteVisits">[],
  organizationId: string,
): { expired: number; open: number } {
  const counts = { expired: 0, open: 0 };
  const now = Date.now();
  for (const visit of visits) {
    if (visit.organizationId !== organizationId) {
      continue;
    }
    const operationalStatus = productionSiteVisitOperationalStatus(visit, now);
    if (operationalStatus === "expired") {
      counts.expired += 1;
    }
    if (operationalStatus === "open" || operationalStatus === "in_field") {
      counts.open += 1;
    }
  }
  return counts;
}

export function backofficeBuildRosterSearchText(row: BackofficeBuildRosterRowWithStorage) {
  const phaseLabel =
    row.phase === "attention"
      ? "needs attention"
      : row.phase === "active"
        ? "active"
        : row.phase;
  return [
    row.displayId,
    row.buildName,
    row.builderName,
    row.location,
    row.activeMilestoneName,
    row.buildStatusLabel,
    phaseLabel,
  ]
    .join(" ")
    .toLowerCase();
}

export function productionSiteVisitTokenState(
  visit: Pick<
    Doc<"buildSiteVisits">,
    "status" | "tokenConsumedAt" | "tokenExpiresAt" | "tokenOpenedAt"
  >,
  now = Date.now(),
): "not_sent" | "live" | "opened" | "consumed" | "expired" {
  if (visit.tokenConsumedAt) {
    return "consumed";
  }
  if (visit.status === "complete") {
    return "consumed";
  }
  if (visit.status === "cancelled") {
    return "expired";
  }
  if (visit.tokenExpiresAt <= now) {
    return "expired";
  }
  if (visit.tokenOpenedAt) {
    return "opened";
  }
  return "live";
}

export function productionSiteVisitUrgencyRank(
  status: ProductionSiteVisitOperationalStatus,
) {
  switch (status) {
    case "expired":
      return 0;
    case "open":
      return 1;
    case "in_field":
      return 2;
    case "complete":
      return 3;
    case "cancelled":
      return 4;
    default:
      return 5;
  }
}

export function productionSiteVisitScheduledLabel(
  buildStartDate: string,
  requestedDay: number,
) {
  const startMs = Date.parse(`${buildStartDate}T00:00:00Z`);
  if (!Number.isFinite(startMs)) {
    return `Day ${requestedDay}`;
  }
  const scheduled = new Date(startMs + requestedDay * 86_400_000);
  return scheduled.toLocaleDateString("en-US", {
    day: "numeric",
    month: "short",
    weekday: "short",
  });
}

export function productionDaysActive(startDate: string, asOfDate?: string) {
  const startMs = Date.parse(`${startDate}T00:00:00Z`);
  if (!Number.isFinite(startMs)) {
    return 0;
  }
  const asOfMs = asOfDate ? Date.parse(`${asOfDate}T00:00:00Z`) : Date.now();
  if (!Number.isFinite(asOfMs)) {
    return 0;
  }
  return Math.max(0, Math.floor((asOfMs - startMs) / 86_400_000));
}

export function daysBetweenIso(startIso: string, endIso: string) {
  return Math.max(0, signedDaysBetweenIso(startIso, endIso));
}

export function signedDaysBetweenIso(startIso: string, endIso: string) {
  const parseDay = (value: string) => {
    const dayPart = value.includes("T") ? value.slice(0, 10) : value;
    const ms = Date.parse(`${dayPart}T00:00:00Z`);
    return Number.isFinite(ms) ? ms : Date.now();
  };
  return Math.round((parseDay(endIso) - parseDay(startIso)) / 86_400_000);
}

export function normalizeIsoDate(value: unknown, message: string) {
  if (typeof value !== "string") {
    throw new Error(message);
  }
  const day = value.slice(0, 10);
  const parsed = Date.parse(`${day}T00:00:00Z`);
  if (!(/^\d{4}-\d{2}-\d{2}$/.test(day) && Number.isFinite(parsed))) {
    throw new Error(message);
  }
  return day;
}

export function normalizePositiveCents(value: unknown, message: string) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(message);
  }
  const rounded = Math.round(value);
  if (rounded <= 0) {
    throw new Error(message);
  }
  return rounded;
}

function activeBuildTimelineDrawStatus(
  status: Doc<"plannedDrawScheduleRows">["status"],
) {
  if (
    status === "requested" ||
    status === "in_review" ||
    status === "ready_for_admin"
  ) {
    return "requested" as const;
  }
  if (status === "approved_for_release" || status === "released") {
    return "approved" as const;
  }
  if (status === "rejected" || status === "withdrawn" || status === "cancelled") {
    return "rejected" as const;
  }
  return "draft" as const;
}

export function activeBuildTimelineRequestStatus(
  status: Doc<"activeBuildDrawRequests">["status"],
) {
  if (
    status === "requested" ||
    status === "in_review" ||
    status === "ready_for_admin"
  ) {
    return "requested" as const;
  }
  if (
    status === "approved" ||
    status === "approved_for_release" ||
    status === "released"
  ) {
    return "approved" as const;
  }
  return "rejected" as const;
}

export function activeBuildDrawCanonicalStatus(
  status: Doc<"activeBuildDrawRequests">["status"],
): Exclude<Doc<"activeBuildDrawRequests">["status"], "approved"> {
  if (status === "approved") {
    return "approved_for_release";
  }
  return status;
}

export function activeBuildTimelineMilestoneStatus(
  milestone: Doc<"buildMilestones">,
  schedule?: {
    currentDay: number;
    milestones: readonly Doc<"buildMilestones">[];
  },
) {
  if (milestone.status === "complete") {
    return "complete" as const;
  }
  if (milestone.completionClaim) {
    return "review" as const;
  }
  if (milestone.status === "in_progress") {
    return "ready" as const;
  }
  if (
    schedule &&
    schedule.currentDay >= milestone.dayStart &&
    activeBuildMilestoneDependencyBlockers(milestone, schedule.milestones)
      .length === 0
  ) {
    return "ready" as const;
  }
  return "upcoming" as const;
}

export function activeBuildTimelineMilestoneTone(
  milestone: Doc<"buildMilestones">,
  status: ReturnType<typeof activeBuildTimelineMilestoneStatus>,
  currentDay: number,
) {
  if (status === "complete") {
    return "complete" as const;
  }
  if (currentDay > milestone.dayEnd) {
    return "warning" as const;
  }
  if (status === "ready" || status === "review") {
    return "active" as const;
  }
  return "upcoming" as const;
}

function activeBuildMilestoneDependencyBlockers(
  milestone: Doc<"buildMilestones">,
  milestones: readonly Doc<"buildMilestones">[],
) {
  const byKey = new Map(milestones.map((row) => [row.key, row]));
  return (milestone.dependencyKeys ?? []).filter((key) => {
    const dependency = byKey.get(key);
    return !dependency || dependency.status !== "complete";
  });
}

function activeBuildMilestoneLifecycleState(
  milestone: Doc<"buildMilestones">,
  milestones?: readonly Doc<"buildMilestones">[],
) {
  if (
    milestone.status === "complete" ||
    milestone.completionReview?.status === "approved"
  ) {
    return "complete" as const;
  }
  if (milestone.completionReview?.status === "rejected") {
    return "revision_requested" as const;
  }
  if (milestone.completionClaim) {
    return "completion_submitted" as const;
  }
  if (milestone.status === "in_progress") {
    return "in_progress" as const;
  }
  if (
    milestones &&
    activeBuildMilestoneDependencyBlockers(milestone, milestones).length > 0
  ) {
    return "blocked" as const;
  }
  return "scheduled" as const;
}

export function activeBuildMilestoneSummary(input: {
  assignments: readonly Doc<"milestoneContractorAssignments">[];
  includeSubmilestones: boolean;
  milestone: Doc<"buildMilestones">;
  milestones?: readonly Doc<"buildMilestones">[];
  submilestones: readonly Doc<"buildSubmilestones">[];
}) {
  const assignmentCount = input.assignments.filter(
    (assignment) =>
      assignment.buildMilestoneId === input.milestone._id ||
      assignment.milestoneKey === input.milestone.key,
  ).length;
  const lifecycleState = activeBuildMilestoneLifecycleState(
    input.milestone,
    input.milestones,
  );
  const milestoneSubmilestones = input.submilestones
    .filter((submilestone) => submilestone.milestoneKey === input.milestone.key)
    .sort((a, b) => a.order - b.order || a.key.localeCompare(b.key));
  const completedSubmilestoneCount = milestoneSubmilestones.filter(
    (submilestone) => submilestone.status === "complete",
  ).length;
  const totalSubmilestoneCount = milestoneSubmilestones.length;
  const normalizedProgressPercent =
    lifecycleState === "complete"
      ? 100
      : Math.max(0, Math.min(100, input.milestone.progressPercent ?? 0));
  const reconciliationIssues: Array<{
    code: string;
    message: string;
    severity: "warning";
  }> = [];

  if (
    (lifecycleState === "completion_submitted" ||
      lifecycleState === "complete") &&
    completedSubmilestoneCount < totalSubmilestoneCount
  ) {
    reconciliationIssues.push({
      code:
        lifecycleState === "complete"
          ? "complete_with_incomplete_submilestones"
          : "completion_submitted_with_incomplete_submilestones",
      message: `${totalSubmilestoneCount - completedSubmilestoneCount} sub-milestone${
        totalSubmilestoneCount - completedSubmilestoneCount === 1
          ? " is"
          : "s are"
      } not complete.`,
      severity: "warning",
    });
  }
  if (
    lifecycleState === "completion_submitted" &&
    normalizedProgressPercent < 100
  ) {
    reconciliationIssues.push({
      code: "completion_submitted_below_full_progress",
      message: `Completion was submitted while progress is ${normalizedProgressPercent}%.`,
      severity: "warning",
    });
  }
  if (
    lifecycleState !== "complete" &&
    lifecycleState !== "completion_submitted" &&
    normalizedProgressPercent === 100
  ) {
    reconciliationIssues.push({
      code: "full_progress_without_completion",
      message:
        "Progress is 100% but the milestone has not been approved as complete.",
      severity: "warning",
    });
  }
  if (input.milestone.drawAvailabilityCents > input.milestone.budgetCents) {
    reconciliationIssues.push({
      code: "draw_availability_exceeds_budget",
      message: "Available draw value exceeds the milestone budget.",
      severity: "warning",
    });
  }

  return {
    assignmentCount,
    assignmentCoverage:
      assignmentCount > 0 ? ("assigned" as const) : ("unassigned" as const),
    budgetCents: input.milestone.budgetCents,
    completedSubmilestoneCount,
    drawAvailabilityCents: input.milestone.drawAvailabilityCents,
    lifecycleState,
    normalizedProgressPercent,
    reconciliationIssues,
    reconciliationState:
      reconciliationIssues.length > 0
        ? ("needs_review" as const)
        : ("consistent" as const),
    submilestoneCoverage:
      totalSubmilestoneCount === 0
        ? ("not_applicable" as const)
        : completedSubmilestoneCount === totalSubmilestoneCount
          ? ("complete" as const)
          : ("incomplete" as const),
    submilestoneRecovery:
      totalSubmilestoneCount === 0
        ? {
            message:
              "This Milestone has no valid Sub-milestones. Add one through the canonical roadmap revision before starting work.",
            state: "recovery_required" as const,
          }
        : undefined,
    submilestoneSnapshot: input.includeSubmilestones
      ? milestoneSubmilestones.map((submilestone) => ({
          ...(submilestone.budgetCents === undefined
            ? {}
            : { budgetCents: submilestone.budgetCents }),
          canonicalId: submilestone._id,
          ...(submilestone.durationDays === undefined
            ? {}
            : { durationDays: submilestone.durationDays }),
          key: submilestone.key,
          name: submilestone.name,
          order: submilestone.order,
          ...(submilestone.startDay === undefined
            ? {}
            : { startDay: submilestone.startDay }),
          status: submilestone.status,
        }))
      : [],
    totalSubmilestoneCount,
  };
}

export function activeBuildSiteVisitCompletionReviewView(
  visit?: Doc<"buildSiteVisits">,
) {
  if (!visit) {
    return;
  }
  const siteVisit = {
    ...(visit.completedAt ? { completedAt: visit.completedAt } : {}),
    ...(visit.note ? { note: visit.note } : {}),
    ...(visit.recordNote ? { recordNote: visit.recordNote } : {}),
    ...(visit.recordNoteFormat
      ? { recordNoteFormat: visit.recordNoteFormat }
      : {}),
    requestedAt: visit.requestedAt,
    requestedDay: visit.requestedDay,
    status: visit.status,
    tokenExpiresAt: visit.tokenExpiresAt,
    url: visit.url,
    visitId: visit.visitId,
  };
  return {
    reviewedAt: visit.completedAt ?? visit.requestedAt,
    siteVisit,
    status: "pending" as const,
  };
}

export function productionBuildDashboardStatus(
  _status: Doc<"activeBuilds">["status"],
): "behind" | "onTrack" | "overBudget" {
  return "onTrack";
}

export function productionBuildStatusLabel(status: Doc<"activeBuilds">["status"]) {
  return status === "future_start" ? "Future start" : "On track";
}

export function productionBuildRosterPhase({
  build,
  drawRequestsPending,
  expiredSiteVisits,
  loan,
  milestones,
  milestonesInReview,
}: {
  build: Doc<"activeBuilds">;
  drawRequestsPending: number;
  expiredSiteVisits: number;
  loan: Doc<"loanFacilities"> | null;
  milestones: Doc<"buildMilestones">[];
  milestonesInReview: number;
}): "scheduled" | "active" | "attention" | "completed" {
  if (build.status === "future_start") {
    return "scheduled";
  }
  const allMilestonesComplete =
    milestones.length > 0 &&
    milestones.every((milestone) => milestone.status === "complete");
  if (loan?.status === "closed" || allMilestonesComplete) {
    return "completed";
  }
  if (
    expiredSiteVisits > 0 ||
    drawRequestsPending > 0 ||
    milestonesInReview > 0
  ) {
    return "attention";
  }
  return "active";
}

export function productionMilestoneState(
  status: Doc<"buildMilestones">["status"],
): "backlog" | "inProgress" | "inReview" {
  if (status === "in_progress") {
    return "inProgress";
  }
  if (status === "complete") {
    return "inReview";
  }
  return "backlog";
}

export function productionMilestoneNeedsBackofficeReview(
  milestone: Doc<"buildMilestones">,
) {
  if (!milestone.completionClaim) {
    return false;
  }
  if (
    milestone.status === "complete" ||
    milestone.completionReview?.status === "approved"
  ) {
    return false;
  }
  return true;
}

export function productionMilestoneColumn(
  milestone: Doc<"buildMilestones">,
  currentDay: number,
) {
  const siteVisitStatus = milestone.completionReview?.siteVisit?.status;
  if (siteVisitStatus === "requested") {
    return "needsSiteVisit";
  }
  if (siteVisitStatus === "complete") {
    return "inReview";
  }
  if (siteVisitStatus) {
    return "inProgress";
  }
  if (productionMilestoneIsBehindSchedule(milestone, currentDay)) {
    return "behindSchedule";
  }
  return "backlog";
}

export function productionMilestoneIsBehindSchedule(
  milestone: Doc<"buildMilestones">,
  currentDay: number,
) {
  if (
    milestone.status === "complete" ||
    milestone.completionClaim ||
    milestone.completionReview?.status === "approved"
  ) {
    return false;
  }
  return currentDay > milestone.dayEnd;
}

export function productionMilestoneDueLabel(
  milestone: Doc<"buildMilestones">,
  currentDay: number,
) {
  const overdueDays = currentDay - milestone.dayEnd;
  return overdueDays > 0
    ? `${overdueDays}d overdue`
    : `Day ${milestone.dayEnd}`;
}

export function productionMilestonePriority(
  milestone: Doc<"buildMilestones">,
  currentDay: number,
) {
  if (
    milestone.status === "in_progress" ||
    productionMilestoneIsBehindSchedule(milestone, currentDay)
  ) {
    return "high";
  }
  return "medium";
}

export function centsToCurrency(cents: number) {
  return new Intl.NumberFormat("en-US", {
    currency: "USD",
    maximumFractionDigits: 0,
    style: "currency",
  }).format(cents / 100);
}
