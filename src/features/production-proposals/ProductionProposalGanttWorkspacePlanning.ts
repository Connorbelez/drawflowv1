import type {
  AuditEvent,
  BuildWorkspaceState,
  DependencyHardness,
  DrawGroup,
  Milestone,
  MilestoneDependency,
  OptimizationPlan,
  OptimizationPlanId,
  OutboxEvent,
  WorkspaceIssue,
  WorkspaceRole,
} from "#/features/build-workspace-demo/types.ts";
import type { ConvexTimelineWorkspace } from "#/features/timeline-workspace/-timeline-convex-adapter.ts";
import {
  firstSubmilestoneRowId,
  ganttSubmilestoneRowId,
  lastSubmilestoneRowId,
  proposalMilestonesToGanttSubmilestoneRows,
  submilestonesForMilestone,
} from "./ProductionProposalGanttWorkspaceRows.ts";
import type {
  DerivedProposalDrawGroup,
  ProposalGanttDrawDraft,
  ProposalGanttMilestoneDraft,
} from "./ProductionProposalGanttWorkspaceTypes.ts";
import {
  BASE_DATE,
  DEFAULT_INTEREST_RATE_PCT,
  DRAW_FEE_DOLLARS,
} from "./ProductionProposalGanttWorkspaceTypes.ts";
import {
  calculateDrawAvailabilityCents,
  centsToDollars,
  dateFromDay,
  formatCents,
  indexOfSubmilestoneRow,
  normalizeProposalStatus,
  resolveDrawBoundaryIndex,
  sortedMilestones,
  uniqueDrawKey,
} from "./ProductionProposalGanttWorkspaceUtils.ts";

export function proposalTimelineWorkspaceToGanttDraft(
  workspace: ConvexTimelineWorkspace & {
    proposal: {
      borrowerCoPayBps?: number;
      borrowerStartingCashCents?: number;
      buildName: string;
      lenderDrawPolicyLimitCents?: number;
      location: string;
      proposedStartDate?: string;
      selectedPlan?: {
        planKey: OptimizationPlanId;
      };
      status: string;
      totalBudgetCents: number;
    };
  }
) {
  const milestones = workspace.milestones
    .map<ProposalGanttMilestoneDraft>((milestone, index) => {
      const dayStart = Math.round(milestone.x);
      const durationDays = Math.max(1, Math.round(milestone.durationDays));
      return {
        budgetCents: Math.max(0, Math.round(milestone.budgetCents)),
        dayEnd: dayStart + durationDays,
        dayStart,
        dependencyKeys: milestone.dependencyKeys ?? [],
        durationDays,
        icon: milestone.icon,
        key: milestone.milestoneKey,
        name: milestone.name,
        order: milestone.order ?? index + 1,
        submilestones: milestone.submilestoneSnapshot.map(
          (submilestone, subIndex) => ({
            ...(submilestone.budgetCents === undefined
              ? {}
              : { budgetCents: submilestone.budgetCents }),
            ...(submilestone.durationDays === undefined
              ? {}
              : { durationDays: submilestone.durationDays }),
            key:
              submilestone.key ??
              `${milestone.milestoneKey}-sub-${String(subIndex + 1).padStart(2, "0")}`,
            name: submilestone.name,
            order: submilestone.order ?? subIndex + 1,
            ...(submilestone.startDay === undefined
              ? {}
              : { startDay: submilestone.startDay }),
          })
        ),
      };
    })
    .sort(
      (left, right) =>
        left.order - right.order || left.key.localeCompare(right.key)
    );
  const borrowerCoPayBps =
    workspace.plan.borrowerCoPayBps ?? workspace.proposal.borrowerCoPayBps ?? 0;
  const draws = normalizeProposalDrawRows({
    borrowerCoPayBps,
    draws: workspace.draws.map((draw, index) => ({
      amountCents: draw.amountCents,
      customDate: draw.customDate,
      drawKey: draw.drawKey,
      label: draw.label,
      milestoneKey: draw.itemMilestoneKey,
      order: index + 1,
      timingDay: Math.round(draw.x),
    })),
    milestones,
  });
  return {
    borrowerCoPayBps,
    borrowerStartingCashCents:
      workspace.plan.startingCashCents ??
      workspace.proposal.borrowerStartingCashCents ??
      0,
    buildName: workspace.proposal.buildName,
    draws,
    lenderDrawPolicyLimitCents:
      workspace.proposal.lenderDrawPolicyLimitCents ??
      (workspace.draws.reduce((total, draw) => total + draw.amountCents, 0) ||
        workspace.proposal.totalBudgetCents),
    location: workspace.proposal.location,
    milestones,
    proposalStatus: normalizeProposalStatus(workspace.proposal.status),
  };
}

export function deriveProposalDrawGroups({
  borrowerCoPayBps,
  draws,
  milestones,
}: {
  borrowerCoPayBps: number;
  draws: ProposalGanttDrawDraft[];
  milestones: ProposalGanttMilestoneDraft[];
}): DerivedProposalDrawGroup[] {
  const orderedMilestones = sortedMilestones(milestones);
  if (orderedMilestones.length === 0) {
    return [];
  }
  const orderedDraws = sortDrawsByBoundary(draws, orderedMilestones);
  const groups: DerivedProposalDrawGroup[] = [];
  let previousBoundaryIndex = -1;

  for (const draw of orderedDraws) {
    const boundaryIndex = Math.max(
      previousBoundaryIndex,
      resolveDrawBoundaryIndex(draw, orderedMilestones)
    );
    const groupMilestones = orderedMilestones.slice(
      previousBoundaryIndex + 1,
      boundaryIndex + 1
    );
    if (groupMilestones.length === 0) {
      continue;
    }
    groups.push(
      buildDerivedDrawGroup({
        borrowerCoPayBps,
        draw,
        groupMilestones,
        order: groups.length + 1,
      })
    );
    previousBoundaryIndex = boundaryIndex;
  }

  if (previousBoundaryIndex < orderedMilestones.length - 1) {
    const groupMilestones = orderedMilestones.slice(previousBoundaryIndex + 1);
    const last = groupMilestones.at(-1) ?? orderedMilestones.at(-1)!;
    groups.push(
      buildDerivedDrawGroup({
        borrowerCoPayBps,
        draw: {
          amountCents: groupMilestones.reduce(
            (total, milestone) =>
              total +
              calculateDrawAvailabilityCents(
                milestone.budgetCents,
                borrowerCoPayBps
              ),
            0
          ),
          drawKey: uniqueDrawKey(last.key, draws),
          label: `${last.name} reimbursement draw`,
          milestoneKey: last.key,
          timingDay: last.dayEnd,
        },
        groupMilestones,
        order: groups.length + 1,
      })
    );
  }

  return groups;
}

export function normalizeProposalDrawRows({
  borrowerCoPayBps,
  draws,
  milestones,
}: {
  borrowerCoPayBps: number;
  draws: ProposalGanttDrawDraft[];
  milestones: ProposalGanttMilestoneDraft[];
}): ProposalGanttDrawDraft[] {
  const groups = deriveProposalDrawGroups({
    borrowerCoPayBps,
    draws: draws.length ? draws : defaultDrawRows(milestones, borrowerCoPayBps),
    milestones,
  });

  return groups.map((group, index) => {
    const boundary = group.groupMilestones.at(-1);
    return {
      ...group.draw,
      amountCents: group.amountCents,
      label:
        group.draw.label ||
        `${boundary?.name ?? "Milestone"} reimbursement draw`,
      milestoneKey: boundary?.key,
      order: index + 1,
      timingDay: group.draw.customDate
        ? group.draw.timingDay
        : (boundary?.dayEnd ?? group.draw.timingDay),
    };
  });
}

export function mapProposalGanttWorkspace({
  activePlanId,
  baseDate = BASE_DATE,
  borrowerStartingCashCents,
  buildName,
  dependencies,
  drawGroups,
  issues,
  lenderDrawPolicyLimitCents,
  location,
  milestones,
  proposalStatus,
  role,
  selectedMilestoneId,
}: {
  activePlanId: OptimizationPlanId;
  baseDate?: Date;
  borrowerStartingCashCents: number;
  buildName: string;
  dependencies: MilestoneDependency[];
  drawGroups: DerivedProposalDrawGroup[];
  issues: WorkspaceIssue[];
  lenderDrawPolicyLimitCents: number;
  location: string;
  milestones: ProposalGanttMilestoneDraft[];
  proposalStatus: "draft" | "submitted" | "approved" | "closed";
  role: WorkspaceRole;
  selectedMilestoneId: string;
}): BuildWorkspaceState {
  const orderedMilestones = sortedMilestones(milestones);
  const submilestoneRows =
    proposalMilestonesToGanttSubmilestoneRows(orderedMilestones);
  const totalBudgetCents = orderedMilestones.reduce(
    (sum, milestone) => sum + milestone.budgetCents,
    0
  );
  const workspaceDrawGroups = drawGroups.map<DrawGroup>((group) => ({
    amount: centsToDollars(group.amountCents),
    eligibleAt: dateFromDay(group.draw.timingDay, baseDate),
    endAt: dateFromDay(group.endDay, baseDate),
    id: group.draw.drawKey,
    issues: issues.filter((issue) =>
      issue.drawGroupIds.includes(group.draw.drawKey)
    ),
    label: group.draw.label,
    order: group.order,
    plannedAt: dateFromDay(group.draw.timingDay, baseDate),
    rowIndex: indexOfSubmilestoneRow(
      submilestoneRows,
      group.submilestones[0]?.milestoneKey,
      group.submilestones[0]?.key
    ),
    rowSpan: Math.max(1, group.submilestones.length),
    startAt: dateFromDay(group.startDay, baseDate),
    status: "planned",
    timingDay: group.draw.timingDay,
    totalExposure: centsToDollars(group.amountCents),
    warningState: warningStateForDrawGroup(issues, group.draw.drawKey),
  }));
  const drawKeyBySubmilestoneRow = new Map<string, string>();
  for (const group of drawGroups) {
    for (const submilestone of group.submilestones) {
      drawKeyBySubmilestoneRow.set(
        ganttSubmilestoneRowId(submilestone.milestoneKey, submilestone.key),
        group.draw.drawKey
      );
    }
  }
  const dependencyFromIdsByRow = new Map<string, string[]>();
  const dependencyToIdsByRow = new Map<string, string[]>();
  for (const dependency of dependencies) {
    dependencyFromIdsByRow.set(dependency.toMilestoneId, [
      ...(dependencyFromIdsByRow.get(dependency.toMilestoneId) ?? []),
      dependency.fromMilestoneId,
    ]);
    dependencyToIdsByRow.set(dependency.fromMilestoneId, [
      ...(dependencyToIdsByRow.get(dependency.fromMilestoneId) ?? []),
      dependency.toMilestoneId,
    ]);
  }
  const workspaceMilestones = submilestoneRows.map<Milestone>((row) => ({
    actualCost: centsToDollars(row.budgetCents),
    blockedByKeys: dependencyFromIdsByRow.get(row.id) ?? [],
    blockingKeys: dependencyToIdsByRow.get(row.id) ?? [],
    blockingReasons: [],
    code: `${row.milestoneKey.toUpperCase()}.${row.order}`,
    completionReport: "",
    drawGroupId:
      drawKeyBySubmilestoneRow.get(row.id) ?? workspaceDrawGroups[0]?.id ?? "",
    endAt: dateFromDay(row.dayEnd, baseDate),
    estimatedCost: centsToDollars(row.budgetCents),
    estimatedDurationDays: row.durationDays,
    evidenceFiles: [],
    evidencePackages: [],
    evidenceStatus: "draft",
    id: row.id,
    isDragLocked: false,
    issues: issues.filter(
      (issue) =>
        issue.milestoneIds.includes(row.milestoneKey) ||
        issue.milestoneIds.includes(row.id)
    ),
    lane: drawKeyBySubmilestoneRow.get(row.id) ?? row.milestoneKey,
    name: row.name,
    notes: `${row.milestoneName} / sub-milestone ${row.order}`,
    progress: 0,
    requestedAmountCents: drawGroups.find((group) =>
      group.submilestones.some(
        (item) =>
          item.milestoneKey === row.milestoneKey &&
          item.key === row.submilestoneKey
      )
    )?.amountCents,
    requiresSiteVisit: false,
    reviewReports: [],
    siteVisitRequested: false,
    siteVisits: [],
    staffRecommendation: "",
    startAt: dateFromDay(row.dayStart, baseDate),
    status: proposalStatus === "draft" ? "proposed" : "notStarted",
    warningCount: issues.filter(
      (issue) =>
        issue.milestoneIds.includes(row.milestoneKey) ||
        issue.milestoneIds.includes(row.id)
    ).length,
  }));
  const optimizationPlans = buildProposalOptimizationPlans({
    activePlanId,
    borrowerStartingCashCents,
    drawGroups: workspaceDrawGroups,
    lenderDrawPolicyLimitCents,
    milestones: orderedMilestones,
  });

  return {
    activePlanId,
    auditEvents: buildDraftAuditEvents(orderedMilestones, workspaceDrawGroups),
    budget: {
      borrowerStartingCash: centsToDollars(borrowerStartingCashCents),
      drawFeeBps: 0,
      interestRatePct: DEFAULT_INTEREST_RATE_PCT,
      lenderDrawPolicyLimit: centsToDollars(lenderDrawPolicyLimitCents),
      requestedLoanAmount: centsToDollars(lenderDrawPolicyLimitCents),
      totalBuildBudget: centsToDollars(totalBudgetCents),
      version: 1,
    },
    build: {
      borrowerName: "Builder borrower",
      buildName,
      lenderName: "FairLend Construction Capital",
      organizationId: "proposal-draft",
      phaseLabel: "Build Proposal planning workspace",
      proposalStatus: proposalStatus === "closed" ? "approved" : proposalStatus,
      siteAddress: location,
    },
    compilationStatus: issues.some((issue) => issue.severity === "blocking")
      ? "blocked"
      : "upToDate",
    dependencies,
    drawGroups: workspaceDrawGroups,
    isLoading: false,
    issues,
    milestones: workspaceMilestones,
    mode: "proposal",
    needsSeed: false,
    optimizationPlans,
    outboxEvents: buildDraftOutboxEvents(
      orderedMilestones,
      workspaceDrawGroups
    ),
    role,
    selectedMilestoneId:
      selectedMilestoneId || workspaceMilestones[0]?.id || "",
    terminalMessage:
      "Draft Gantt edits update the proposal package before save.",
    timelineBaseDate: baseDate,
    validationErrors: issues
      .filter((issue) => issue.severity === "blocking")
      .map((issue) => issue.message),
    validationWarnings: issues
      .filter((issue) => issue.severity === "warning")
      .map((issue) => issue.message),
  };
}

function warningStateForDrawGroup(
  issues: WorkspaceIssue[],
  drawGroupId: string
) {
  const relatedIssues = issues.filter((issue) =>
    issue.drawGroupIds.includes(drawGroupId)
  );
  if (relatedIssues.some((issue) => issue.severity === "blocking")) {
    return "critical" as const;
  }
  return relatedIssues.length > 0 ? ("warning" as const) : ("clear" as const);
}

function buildDerivedDrawGroup({
  borrowerCoPayBps,
  draw,
  groupMilestones,
  order,
}: {
  borrowerCoPayBps: number;
  draw: ProposalGanttDrawDraft;
  groupMilestones: ProposalGanttMilestoneDraft[];
  order: number;
}): DerivedProposalDrawGroup {
  const startDay = Math.min(
    ...groupMilestones.map((milestone) => milestone.dayStart)
  );
  const endDay = Math.max(
    ...groupMilestones.map((milestone) => milestone.dayEnd)
  );
  const derivedAmountCents = groupMilestones.reduce(
    (total, milestone) =>
      total +
      calculateDrawAvailabilityCents(milestone.budgetCents, borrowerCoPayBps),
    0
  );
  const amountCents =
    draw.amountCents > 0 ? Math.round(draw.amountCents) : derivedAmountCents;
  return {
    amountCents,
    draw: {
      ...draw,
      amountCents,
    },
    drawAvailabilityCents: derivedAmountCents,
    endDay,
    groupMilestones,
    order,
    startDay,
    submilestones: groupMilestones.flatMap((milestone) =>
      submilestonesForMilestone(milestone).map((submilestone, index) => ({
        ...submilestone,
        groupOrdinal: index + 1,
        milestoneKey: milestone.key,
        milestoneName: milestone.name,
      }))
    ),
  };
}

function defaultDrawRows(
  milestones: ProposalGanttMilestoneDraft[],
  borrowerCoPayBps: number
): ProposalGanttDrawDraft[] {
  return sortedMilestones(milestones).map((milestone, index) => ({
    amountCents: calculateDrawAvailabilityCents(
      milestone.budgetCents,
      borrowerCoPayBps
    ),
    drawKey: `draw-${String(index + 1).padStart(2, "0")}`,
    label: `${milestone.name} reimbursement draw`,
    milestoneKey: milestone.key,
    order: index + 1,
    timingDay: milestone.dayEnd,
  }));
}

export function buildSubmilestoneDependencies(
  milestones: ProposalGanttMilestoneDraft[]
): MilestoneDependency[] {
  return sortedMilestones(milestones).flatMap((milestone) =>
    milestone.dependencyKeys.flatMap((dependencyKey) => {
      const fromMilestoneId = lastSubmilestoneRowId(dependencyKey, milestones);
      const toMilestoneId = firstSubmilestoneRowId(milestone.key, milestones);
      if (!(fromMilestoneId && toMilestoneId)) {
        return [];
      }
      return [
        {
          fromMilestoneId,
          hardness: "hard" as DependencyHardness,
          id: `${dependencyKey}->${milestone.key}`,
          isSystem: false,
          toMilestoneId,
          type: "hard_blocker",
        },
      ];
    })
  );
}

export function buildProposalGanttIssues({
  dismissedIssueKeys,
  drawGroups,
  milestones,
}: {
  dismissedIssueKeys: Set<string>;
  drawGroups: DerivedProposalDrawGroup[];
  milestones: ProposalGanttMilestoneDraft[];
}): WorkspaceIssue[] {
  const issues: WorkspaceIssue[] = [];
  const milestoneKeys = new Set(milestones.map((milestone) => milestone.key));
  for (const milestone of milestones) {
    if (milestone.dayEnd <= milestone.dayStart) {
      issues.push(
        issueRow({
          code: "invalid_milestone_window",
          id: `invalid-window-${milestone.key}`,
          message: `${milestone.name} must end after it starts.`,
          milestoneIds: [milestone.key],
          severity: "blocking",
          title: "Invalid milestone window",
        })
      );
    }
    for (const dependencyKey of milestone.dependencyKeys) {
      if (!milestoneKeys.has(dependencyKey)) {
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
  }
  for (const drawGroup of drawGroups) {
    if (drawGroup.amountCents > drawGroup.drawAvailabilityCents) {
      const overageCents =
        drawGroup.amountCents - drawGroup.drawAvailabilityCents;
      issues.push(
        issueRow({
          code: "draw_amount_exceeds_availability",
          drawGroupIds: [drawGroup.draw.drawKey],
          id: `draw-over-availability-${drawGroup.draw.drawKey}`,
          message: `${drawGroup.draw.label} exceeds current draw availability by ${formatCents(overageCents)} to keep cash on hand non-negative.`,
          severity: "warning",
          title: "Draw exceeds availability",
        })
      );
    }
    if (drawGroup.submilestones.length === 0) {
      issues.push(
        issueRow({
          code: "draw_group_without_submilestones",
          drawGroupIds: [drawGroup.draw.drawKey],
          id: `draw-group-empty-${drawGroup.draw.drawKey}`,
          message: `${drawGroup.draw.label} has no sub-milestones in its derived group.`,
          severity: "warning",
          title: "No sub-milestones",
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

function buildProposalOptimizationPlans({
  borrowerStartingCashCents,
  drawGroups,
  lenderDrawPolicyLimitCents,
  milestones,
}: {
  activePlanId: OptimizationPlanId;
  borrowerStartingCashCents: number;
  drawGroups: DrawGroup[];
  lenderDrawPolicyLimitCents: number;
  milestones: ProposalGanttMilestoneDraft[];
}): OptimizationPlan[] {
  const durationDays = Math.max(
    1,
    ...milestones.map((milestone) => milestone.dayEnd)
  );
  const totalFees = drawGroups.length * DRAW_FEE_DOLLARS;
  const borrowerStartingCash = centsToDollars(borrowerStartingCashCents);
  const requiredWorkingCapital = Math.max(
    0,
    ...drawGroups.map((drawGroup) => drawGroup.totalExposure)
  );
  const capitalShortfall = Math.max(
    0,
    requiredWorkingCapital - borrowerStartingCash
  );
  const principalDollars = centsToDollars(lenderDrawPolicyLimitCents);
  return [
    {
      durationDays,
      id: "cheapestFeasible",
      label: "Cheapest Feasible",
      peakWorkingCapital: requiredWorkingCapital,
      projectedInterest: Math.round(principalDollars * 0.025),
      summary:
        "Uses the fewest derived reimbursement draw boundaries currently staged.",
      totalFees,
      warning: "Lowest fee count may increase borrower carrying pressure.",
    },
    {
      durationDays: Math.max(1, Math.round(durationDays * 0.85)),
      id: "fastest",
      label: "Fastest",
      peakWorkingCapital: Math.round(requiredWorkingCapital * 1.15),
      projectedInterest: Math.round(principalDollars * 0.02),
      summary:
        "Compresses feasible milestone windows while preserving dependencies.",
      totalFees,
      warning:
        "May require more borrower working capital before reimbursement.",
    },
    {
      durationDays,
      id: "capitalConstrained",
      label: "Capital-Constrained",
      ...(capitalShortfall > 0
        ? {
            infeasibleReason: `Borrower starting cash is $${Math.round(
              borrowerStartingCash
            ).toLocaleString()} but this grouping requires $${Math.round(
              requiredWorkingCapital
            ).toLocaleString()} of peak unreimbursed working capital.`,
          }
        : {}),
      peakWorkingCapital: requiredWorkingCapital,
      projectedInterest: Math.round(principalDollars * 0.022),
      recommended: capitalShortfall === 0,
      summary:
        "Compares borrower starting cash with the plan's derived peak unreimbursed exposure.",
      totalFees,
      warning:
        capitalShortfall > 0
          ? `Starting-cash shortfall: $${Math.round(capitalShortfall).toLocaleString()}.`
          : "Borrower starting cash covers the derived peak unreimbursed exposure.",
    },
  ];
}

function buildDraftAuditEvents(
  milestones: ProposalGanttMilestoneDraft[],
  drawGroups: DrawGroup[]
): AuditEvent[] {
  return [
    {
      actor: "proposal_editor",
      command: "draft.gantt.loaded",
      id: "draft-gantt-loaded",
      message: `${milestones.length} milestones and ${drawGroups.length} derived draw groups loaded.`,
      role: "builderLead",
      timestamp: new Date().toISOString(),
      type: "milestoneChanged",
    },
  ];
}

function buildDraftOutboxEvents(
  milestones: ProposalGanttMilestoneDraft[],
  drawGroups: DrawGroup[]
): OutboxEvent[] {
  return [
    {
      eventType: "proposal.draft.gantt_ready",
      id: "draft-gantt-outbox",
      payloadPreview: JSON.stringify({
        drawGroups: drawGroups.length,
        milestones: milestones.length,
      }),
      relatedEntity: "buildProposal",
      status: "draft",
      timestamp: new Date().toISOString(),
    },
  ];
}

function sortDrawsByBoundary(
  draws: ProposalGanttDrawDraft[],
  milestones: ProposalGanttMilestoneDraft[]
) {
  return [...draws]
    .filter((draw) => draw.drawKey.trim().length > 0)
    .sort((left, right) => {
      const leftBoundary = resolveDrawBoundaryIndex(left, milestones);
      const rightBoundary = resolveDrawBoundaryIndex(right, milestones);
      return (
        leftBoundary - rightBoundary ||
        (left.order ?? 0) - (right.order ?? 0) ||
        left.drawKey.localeCompare(right.drawKey)
      );
    });
}
