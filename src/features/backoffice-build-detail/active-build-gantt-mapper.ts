"use client";

import type {
  AuditEvent,
  BuildWorkspaceAdapter,
  DrawGroup,
  EvidenceStatus,
  Milestone,
  MilestoneDependency,
  OptimizationPlan,
  OptimizationPlanId,
  OutboxEvent,
  WorkspaceIssue,
  WorkspaceRole,
} from "#/features/build-workspace-demo/types.ts";
import type { ActiveBuildGanttWorkspaceProps } from "./ActiveBuildGanttWorkspace.tsx";
import type { ProductionBuildDetail } from "./ProductionBuildDetailSurface";

export function mapActiveBuildWorkspace({
  activePlanId,
  detail,
  dismissedIssueKeys,
  role,
  selectedMilestoneId,
  timelineWorkspace,
}: {
  activePlanId: OptimizationPlanId;
  detail: ProductionBuildDetail;
  dismissedIssueKeys: Set<string>;
  role: WorkspaceRole;
  selectedMilestoneId: string;
  timelineWorkspace?: ActiveBuildGanttWorkspaceProps["timelineWorkspace"];
}): Omit<
  BuildWorkspaceAdapter,
  | "addDependency"
  | "addMilestone"
  | "addSampleEvidence"
  | "applyIssueQuickFix"
  | "applyRecommendedPlan"
  | "approveMilestone"
  | "batchMoveMilestoneDates"
  | "claimSiteVisit"
  | "dismissIssue"
  | "mergeDrawGroups"
  | "moveMilestoneDates"
  | "moveMilestoneToDrawGroup"
  | "recomputeProposalPlan"
  | "rejectMilestone"
  | "removeDependency"
  | "reorderMilestone"
  | "reorderMilestoneAbsolute"
  | "requestMoreInformation"
  | "requestSiteVisit"
  | "resetWorkspace"
  | "reviewEvidence"
  | "selectMilestone"
  | "setActivePlan"
  | "setDependencyHardness"
  | "setMilestoneDragLocked"
  | "setRole"
  | "splitDrawGroup"
  | "submitCompletionClaim"
  | "submitProposal"
  | "submitSiteVisitReport"
  | "updateForecastDates"
  | "updateMilestone"
  | "updateProgress"
  | "uploadEvidence"
> {
  const sortedMilestones = [...detail.milestones].sort(
    (a, b) => a.order - b.order || a.key.localeCompare(b.key)
  );
  const sortedDraws = [...detail.draws].sort(
    (a, b) => a.order - b.order || a.drawKey.localeCompare(b.drawKey)
  );
  const evidenceByMilestone = new Map<
    string,
    NonNullable<typeof timelineWorkspace>["evidenceAssets"]
  >();
  for (const asset of timelineWorkspace?.evidenceAssets ?? []) {
    const current = evidenceByMilestone.get(asset.milestoneKey) ?? [];
    current.push(asset);
    evidenceByMilestone.set(asset.milestoneKey, current);
  }
  const drawByMilestone = new Map(
    sortedDraws
      .filter((draw) => draw.milestoneKey)
      .map((draw) => [draw.milestoneKey as string, draw])
  );
  const currentDay =
    typeof timelineWorkspace?.plan?.currentDay === "number"
      ? timelineWorkspace.plan.currentDay
      : dayFromDate(detail.build.startDate, new Date());
  const issues = buildWorkspaceIssues(detail, dismissedIssueKeys);
  const dependencies: MilestoneDependency[] = sortedMilestones.flatMap(
    (milestone) =>
      (milestone.dependencyKeys ?? []).map((dependencyKey) => ({
        fromMilestoneId: dependencyKey,
        hardness: "hard" as const,
        id: `${dependencyKey}->${milestone.key}`,
        isSystem: false,
        toMilestoneId: milestone.key,
        type: "hard_blocker",
      }))
  );
  const milestones: Milestone[] = sortedMilestones.map((milestone) => {
    const draw = drawByMilestone.get(milestone.key) ?? sortedDraws[0];
    const evidenceAssets = evidenceByMilestone.get(milestone.key) ?? [];
    const siteVisits =
      detail.siteVisits?.filter(
        (visit) => visit.milestoneKey === milestone.key
      ) ?? [];
    return {
      actualCost: centsToDollars(
        typeof milestone.completionClaim?.actualCostCents === "number"
          ? milestone.completionClaim.actualCostCents
          : milestone.budgetCents
      ),
      blockedByKeys: milestone.dependencyKeys ?? [],
      blockingKeys: sortedMilestones
        .filter((item) => item.dependencyKeys?.includes(milestone.key))
        .map((item) => item.key),
      blockingReasons: dependencyBlockers(milestone, sortedMilestones),
      code: milestone.key.toUpperCase(),
      completionReport:
        typeof milestone.completionClaim?.note === "string"
          ? milestone.completionClaim.note
          : "",
      drawGroupId: draw?.drawKey ?? `draw-${milestone.order}`,
      endAt: dateFromDay(detail.build.startDate, milestone.dayEnd),
      estimatedCost: centsToDollars(milestone.budgetCents),
      estimatedDurationDays: milestone.durationDays,
      evidenceFiles: evidenceAssets.map((asset) => ({
        fileName: asset.fileName,
        id: asset.evidenceKey,
        isSample: !asset.previewUrl,
        mimeType: asset.mimeType,
        sizeBytes: asset.sizeBytes,
        uploadedAt: new Date().toISOString(),
        uploadedByPersona: "production_user",
      })),
      evidencePackages: evidenceAssets.length
        ? [
            {
              createdAt: new Date().toISOString(),
              id: `pkg-${milestone.key}`,
              reviewStatus: milestone.evidenceState ?? "Submitted package",
              status: "submitted",
              submittedAt: new Date().toISOString(),
            },
          ]
        : [],
      evidenceStatus: mapEvidenceStatus(milestone),
      id: milestone.key,
      isDragLocked: Boolean(milestone.isDragLocked),
      issues: issues.filter((issue) =>
        issue.milestoneIds.includes(milestone.key)
      ),
      lane: draw?.drawKey ?? `draw-${milestone.order}`,
      name: milestone.name,
      notes: milestone.policyState ?? "",
      progress:
        typeof milestone.progressPercent === "number"
          ? milestone.progressPercent
          : milestone.status === "complete"
            ? 100
            : milestone.status === "in_progress"
              ? 50
              : 0,
      requestedAmountCents: draw?.amountCents,
      requiresSiteVisit: Boolean(milestone.completionReview?.siteVisit),
      reviewReports: milestone.completionReview
        ? [
            {
              createdAt:
                milestone.completionReview.reviewedAt ??
                new Date().toISOString(),
              id: `review-${milestone.key}`,
              notes: milestone.completionReview.note ?? "",
              outcome: milestone.completionReview.status ?? "pending",
              reviewerPersona: "lender_admin",
            },
          ]
        : [],
      siteVisitRequested: siteVisits.some(
        (visit) => visit.status === "requested"
      ),
      siteVisits: siteVisits.map((visit) => ({
        assignedPersona: "site_visitor",
        completedAt: visit.completedAt,
        completionObserved: visit.status === "complete",
        createdAt: visit.requestedAt,
        id: visit.visitId,
        notes: visit.recordNote ?? visit.note,
        recommendedOutcome: visit.status,
        requestReason: visit.note,
        riskFlags: [],
        status: visit.status,
        targetMilestoneKeys: [visit.milestoneKey],
        tokenExpiresAt:
          typeof visit.tokenExpiresAt === "number"
            ? new Date(visit.tokenExpiresAt).toISOString()
            : undefined,
      })),
      staffRecommendation: milestone.completionReview?.status ?? "",
      startAt: dateFromDay(detail.build.startDate, milestone.dayStart),
      status: mapMilestoneStatus(milestone, currentDay, sortedMilestones),
      submilestones: detail.submilestones
        .filter((submilestone) => submilestone.milestoneKey === milestone.key)
        .map((submilestone) => ({
          canonicalId: submilestone._id,
          key: submilestone.key,
          name: submilestone.name,
        })),
      warningCount: issues.filter((issue) =>
        issue.milestoneIds.includes(milestone.key)
      ).length,
    };
  });
  const drawGroups: DrawGroup[] = sortedDraws.map((draw, index) => {
    const scopedMilestones = milestones.filter(
      (milestone) => milestone.drawGroupId === draw.drawKey
    );
    const fallbackMilestone = sortedMilestones.find(
      (milestone) => milestone.key === draw.milestoneKey
    );
    const firstOrder =
      scopedMilestones.length > 0
        ? Math.min(
            ...scopedMilestones.map((milestone) =>
              sortedMilestones.findIndex((item) => item.key === milestone.id)
            )
          )
        : fallbackMilestone
          ? fallbackMilestone.order - 1
          : index;
    return {
      amount: centsToDollars(draw.amountCents),
      eligibleAt: dateFromDay(detail.build.startDate, draw.timingDay),
      endAt: dateFromDay(
        detail.build.startDate,
        Math.max(draw.timingDay, fallbackMilestone?.dayEnd ?? draw.timingDay)
      ),
      id: draw.drawKey,
      issues: issues.filter((issue) =>
        issue.drawGroupIds.includes(draw.drawKey)
      ),
      label: draw.label,
      order: draw.order,
      plannedAt: dateFromDay(detail.build.startDate, draw.timingDay),
      rowIndex: Math.max(0, firstOrder),
      rowSpan: Math.max(1, scopedMilestones.length || 1),
      startAt: dateFromDay(
        detail.build.startDate,
        fallbackMilestone?.dayStart ?? draw.timingDay
      ),
      status: mapDrawStatus(draw),
      totalExposure: centsToDollars(draw.amountCents),
      warningState: issues.some(
        (issue) =>
          issue.drawGroupIds.includes(draw.drawKey) &&
          issue.severity === "blocking"
      )
        ? "critical"
        : issues.some((issue) => issue.drawGroupIds.includes(draw.drawKey))
          ? "warning"
          : "clear",
    };
  });
  const auditEvents: AuditEvent[] = (detail.auditEvents ?? []).map((event) => ({
    actor: event.actorPersona,
    command: event.eventType,
    id: event._id,
    message: event.eventType,
    reason: event.afterSummary ?? event.beforeSummary,
    role: event.actorPersona?.includes("site")
      ? "siteVisitor"
      : event.actorPersona?.includes("builder")
        ? "builderLead"
        : "lenderAdmin",
    timestamp: new Date(event.createdAt).toISOString(),
    type: event.eventType.includes("draw")
      ? "drawChanged"
      : event.eventType.includes("evidence")
        ? "evidenceChanged"
        : event.eventType.includes("approval")
          ? "approvalChanged"
          : "milestoneChanged",
  }));
  const outboxEvents: OutboxEvent[] = (detail.quickActionEvents ?? []).map(
    (event) => ({
      eventType: event.entityType,
      id: event._id,
      payloadPreview: event.body,
      relatedEntity: event.entityLabel,
      status: "pending",
      timestamp: new Date(event.createdAt).toISOString(),
    })
  );

  return {
    activePlanId,
    auditEvents,
    budget: {
      borrowerStartingCash: centsToDollars(
        detail.capitalPlan?.borrowerStartingCashCents ?? 0
      ),
      drawFeeBps: 0,
      interestRatePct: (detail.loanFacility?.interestAnnualBps ?? 0) / 100,
      lenderDrawPolicyLimit: centsToDollars(
        detail.capitalPlan?.lenderDrawPolicyLimitCents ?? 0
      ),
      requestedLoanAmount: centsToDollars(
        detail.loanFacility?.principalCents ?? 0
      ),
      totalBuildBudget: centsToDollars(detail.build.totalBudgetCents),
      version: detail.capitalPlan?.version ?? 1,
    },
    build: {
      borrowerName: "Builder borrower",
      buildName: detail.build.buildName,
      lenderName: "FairLend Construction Capital",
      organizationId: "production",
      phaseLabel: "Active reimbursement workspace",
      proposalStatus: "approved",
      siteAddress: detail.build.location,
    },
    compilationStatus: issues.some((issue) => issue.severity === "blocking")
      ? "blocked"
      : "upToDate",
    dependencies,
    drawGroups,
    isLoading: false,
    issues,
    milestones,
    mode: "active",
    needsSeed: false,
    optimizationPlans: buildOptimizationPlans(detail, drawGroups),
    outboxEvents,
    role,
    selectedMilestoneId: selectedMilestoneId || milestones[0]?.id || "",
    terminalMessage: undefined,
    validationErrors: issues
      .filter((issue) => issue.severity === "blocking")
      .map((issue) => issue.message),
    validationWarnings: issues
      .filter((issue) => issue.severity === "warning")
      .map((issue) => issue.message),
  };
}

function buildWorkspaceIssues(
  detail: ProductionBuildDetail,
  dismissedIssueKeys: Set<string>
): WorkspaceIssue[] {
  const issues: WorkspaceIssue[] = [];
  const knownMilestones = new Set(
    detail.milestones.map((milestone) => milestone.key)
  );
  for (const milestone of detail.milestones) {
    for (const dependencyKey of milestone.dependencyKeys ?? []) {
      if (!knownMilestones.has(dependencyKey)) {
        issues.push(
          issueRow({
            code: "missing_dependency",
            id: `missing-dependency-${milestone.key}-${dependencyKey}`,
            message: `${milestone.name} references missing dependency ${dependencyKey}.`,
            milestoneIds: [milestone.key],
            severity: "blocking",
            title: "Missing dependency",
          })
        );
      }
    }
    if (
      milestone.status === "complete" &&
      !String(milestone.evidenceState ?? "")
        .toLowerCase()
        .includes("accepted")
    ) {
      issues.push(
        issueRow({
          code: "evidence_review_pending",
          id: `evidence-pending-${milestone.key}`,
          message: `${milestone.name} is complete with evidence still awaiting lender acceptance.`,
          milestoneIds: [milestone.key],
          severity: "warning",
          title: "Evidence review pending",
        })
      );
    }
    if (
      String(milestone.evidenceState ?? "")
        .toLowerCase()
        .includes("location")
    ) {
      issues.push(
        issueRow({
          code: "location_unverified",
          id: `location-unverified-${milestone.key}`,
          message: `${milestone.name} has evidence with unverified location.`,
          milestoneIds: [milestone.key],
          severity: "warning",
          title: "Location unverified",
        })
      );
    }
  }
  for (const draw of detail.draws) {
    if (draw.status === "rejected") {
      issues.push(
        issueRow({
          code: "draw_rejected",
          drawGroupIds: [draw.drawKey],
          id: `draw-rejected-${draw.drawKey}`,
          message: `${draw.label} was rejected and needs borrower correction.`,
          severity: "blocking",
          title: "Draw rejected",
        })
      );
    }
  }
  return issues.filter(
    (issue) => !dismissedIssueKeys.has(`${issue.id}:${issue.conditionHash}`)
  );
}

function issueRow(input: {
  code: string;
  drawGroupIds?: string[];
  id: string;
  message: string;
  milestoneIds?: string[];
  severity: WorkspaceIssue["severity"];
  title: string;
}): WorkspaceIssue {
  return {
    code: input.code,
    conditionHash: input.id,
    dependencyIds: [],
    dismissible: true,
    dismissed: false,
    drawGroupIds: input.drawGroupIds ?? [],
    id: input.id,
    impact: input.message,
    message: input.message,
    milestoneIds: input.milestoneIds ?? [],
    quickFix: {
      action: "openMilestoneEditor",
      label: "Open",
      targetId: input.milestoneIds?.[0],
    },
    scope: input.drawGroupIds?.length ? "drawGroup" : "milestone",
    severity: input.severity,
    title: input.title,
  };
}

function buildOptimizationPlans(
  detail: ProductionBuildDetail,
  drawGroups: DrawGroup[]
): OptimizationPlan[] {
  const totalFees = drawGroups.length * 500;
  const exposure = drawGroups.reduce(
    (max, draw) => Math.max(max, draw.totalExposure),
    0
  );
  const principal = centsToDollars(detail.loanFacility?.principalCents ?? 0);
  return [
    {
      durationDays: Math.max(...detail.milestones.map((m) => m.dayEnd), 0),
      id: "cheapestFeasible",
      label: "Cheapest Feasible",
      peakWorkingCapital: exposure,
      projectedInterest: Math.round(principal * 0.03),
      summary:
        "Current production reimbursement grouping with minimum draw count.",
      totalFees,
      warning: "Uses active build schedule and production draw rows.",
    },
    {
      durationDays: Math.max(
        1,
        Math.round(
          Math.max(...detail.milestones.map((m) => m.dayEnd), 1) * 0.85
        )
      ),
      id: "fastest",
      label: "Fastest",
      peakWorkingCapital: Math.round(exposure * 1.15),
      projectedInterest: Math.round(principal * 0.025),
      summary:
        "Compresses unlocked milestones where dependency policy permits.",
      totalFees,
      warning: "May increase working-capital pressure.",
    },
    {
      durationDays: Math.max(...detail.milestones.map((m) => m.dayEnd), 0),
      id: "capitalConstrained",
      label: "Capital-Constrained",
      peakWorkingCapital: centsToDollars(
        detail.capitalPlan?.borrowerStartingCashCents ?? 0
      ),
      projectedInterest: Math.round(principal * 0.028),
      summary:
        "Keeps reimbursement cadence inside borrower capital constraints.",
      totalFees,
      warning: "Ready for active-build governance.",
    },
  ];
}

function mapMilestoneStatus(
  milestone: ProductionBuildDetail["milestones"][number],
  _currentDay: number,
  milestones: ProductionBuildDetail["milestones"]
) {
  if (milestone.status === "complete") {
    return "approved";
  }
  if (milestone.completionClaim) {
    return "underReview";
  }
  if (
    String(milestone.evidenceState ?? "")
      .toLowerCase()
      .includes("required")
  ) {
    return "evidenceRequired";
  }
  if (
    String(milestone.evidenceState ?? "")
      .toLowerCase()
      .includes("submitted")
  ) {
    return "evidenceSubmitted";
  }
  if (milestone.status === "in_progress") {
    return "inProgress";
  }
  if (dependencyBlockers(milestone, milestones).length > 0) {
    return "blocked";
  }
  return "notStarted";
}

function mapEvidenceStatus(
  milestone: ProductionBuildDetail["milestones"][number]
): EvidenceStatus {
  const state = String(milestone.evidenceState ?? "").toLowerCase();
  if (state.includes("accepted") || state.includes("approved")) {
    return "accepted";
  }
  if (state.includes("info") || state.includes("rejected")) {
    return "needsInfo";
  }
  if (state.includes("location")) {
    return "locationUnverified";
  }
  if (state.includes("submitted") || state.includes("completion")) {
    return "submitted";
  }
  if (state.includes("draft")) {
    return "draft";
  }
  return "notStarted";
}

function mapDrawStatus(draw: ProductionBuildDetail["draws"][number]) {
  if (draw.status === "released") {
    return "released";
  }
  if ((draw.status as string) === "approved") {
    return "readyForRelease";
  }
  if (draw.status === "requested") {
    return "evidencePending";
  }
  if (draw.status === "rejected") {
    return "blocked";
  }
  return "planned";
}

function dependencyBlockers(
  milestone: ProductionBuildDetail["milestones"][number],
  milestones: ProductionBuildDetail["milestones"]
) {
  const byKey = new Map(milestones.map((item) => [item.key, item]));
  return (milestone.dependencyKeys ?? [])
    .map((key) => byKey.get(key))
    .filter((item) => item && item.status !== "complete")
    .map((item) => `${item?.name} must be complete first.`);
}

export function evidenceStateLabel(status: EvidenceStatus) {
  if (status === "accepted") {
    return "Accepted";
  }
  if (status === "needsInfo") {
    return "Info requested";
  }
  if (status === "locationUnverified") {
    return "Location unverified";
  }
  if (status === "submitted") {
    return "Submitted package";
  }
  if (status === "draft") {
    return "Draft package";
  }
  return "Not started";
}

function dateFromDay(startDate: string, day: number) {
  const startMs = Date.parse(`${startDate.slice(0, 10)}T12:00:00`);
  const safeStartMs = Number.isFinite(startMs) ? startMs : Date.now();
  return new Date(safeStartMs + Math.round(day) * 86_400_000);
}

export function dayFromDate(startDate: string, date: Date) {
  const startMs = Date.parse(`${startDate.slice(0, 10)}T12:00:00`);
  const safeStartMs = Number.isFinite(startMs) ? startMs : Date.now();
  return Math.max(0, Math.round((date.getTime() - safeStartMs) / 86_400_000));
}

export function slugifyMilestone(name: string, order: number) {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
  return slug || `milestone-${order}`;
}

export function cents(value: number) {
  return Math.max(0, Math.round(value * 100));
}

function centsToDollars(value: number) {
  return Math.round(value / 100);
}
