import {
  activeEvidenceFiles,
  appendAudit,
  getBuild,
  getDependencies,
  getDrawGroups,
  getMilestones,
} from "./access";
import {
  addDays,
  DAY_MS,
  dateValue,
  earliestDate,
  FLAT_DRAW_FEE_CENTS,
  groupAmount,
  issueHash,
  latestDate,
  RECOMMENDED_ORDER,
  type DemoDrawGroup,
  type DemoMilestone,
  type DemoMutationCtx,
  type DemoPlanningRun,
  type DemoReadCtx,
  type DecoratedMilestone,
  type ProjectedDrawGroup,
  type Scenario,
  type WorkspaceIssue,
} from "./data";
import { deriveBlockingReasons, validateProposal } from "./validation";

export function computeInterestCents(
  amountCents: number,
  releaseDate: string,
  payoffDate: string,
  annualBps: number
) {
  if (amountCents <= 0) {
    return 0;
  }
  const days = Math.max(
    0,
    Math.round(
      (Date.parse(`${payoffDate}T00:00:00.000Z`) -
        Date.parse(`${releaseDate}T00:00:00.000Z`)) /
        DAY_MS
    )
  );
  const dailyRate = annualBps / 10_000 / 365;
  return Math.round(amountCents * ((1 + dailyRate) ** days - 1));
}

export function latestPlanningRun(planningRuns: DemoPlanningRun[]) {
  return planningRuns.sort((a, b) => b.createdAt - a.createdAt)[0] ?? null;
}

export async function getDismissedIssueKeys(ctx: DemoReadCtx, scenario: Scenario) {
  const dismissals = await ctx.db
    .query("demo_warningDismissals")
    .withIndex("by_scenario", (q) => q.eq("scenario", scenario))
    .collect();
  return new Set<string>(dismissals.map((dismissal) => dismissal.warningId));
}

export function withDismissalState(
  issues: WorkspaceIssue[],
  dismissedKeys: Set<string>
) {
  return issues.map((issue) => ({
    ...issue,
    dismissed:
      dismissedKeys.has(`${issue.id}:${issue.conditionHash}`) ||
      dismissedKeys.has(issue.id),
  }));
}

export async function clearProposalDismissals(ctx: DemoMutationCtx) {
  const rows = await ctx.db
    .query("demo_warningDismissals")
    .withIndex("by_scenario", (q) => q.eq("scenario", "proposal"))
    .collect();
  for (const row of rows) {
    await ctx.db.delete(row._id);
  }
}

export async function recordJitPlanningRun(ctx: DemoMutationCtx, command: string) {
  const build = await getBuild(ctx, "proposal");
  if (!build) {
    return;
  }
  await clearProposalDismissals(ctx);
  const milestones = await getMilestones(ctx, "proposal");
  const drawGroups = await getDrawGroups(ctx, "proposal");
  const dependencies = await getDependencies(ctx, "proposal");
  const validation = validateProposal(
    milestones,
    drawGroups,
    dependencies,
    build.workingCapitalLimitCents
  );
  await ctx.db.insert("demo_planningRuns", {
    buildId: build._id,
    createdAt: Date.now(),
    errors: validation.errors,
    interestEstimateCents: drawGroups.length * FLAT_DRAW_FEE_CENTS,
    recommendedDrawCount: Math.max(1, drawGroups.length),
    recommendedOrderKeys: RECOMMENDED_ORDER,
    runType: "jit",
    scenario: "proposal",
    status: validation.errors.length > 0 ? "blocked" : "feasible",
    warnings: validation.warnings,
  });
  await appendAudit(ctx, {
    actorPersona: "system",
    buildId: build._id,
    command,
    entityType: "planning_run",
    eventType: "ProposalPlanCompiledJustInTime",
    scenario: "proposal",
  });
}

export async function buildProjection(ctx: DemoReadCtx, scenario: Scenario) {
  const build = await getBuild(ctx, scenario);
  if (!build) {
    return { needsSeed: true, scenario };
  }

  const milestones = await getMilestones(ctx, scenario);
  const drawGroups = await getDrawGroups(ctx, scenario);
  const dependencies = await getDependencies(ctx, scenario);
  const rolloverBuffers = await ctx.db
    .query("demo_rolloverBuffers")
    .withIndex("by_scenario", (q) => q.eq("scenario", scenario))
    .collect();
  const planningRuns = await ctx.db
    .query("demo_planningRuns")
    .withIndex("by_scenario", (q) => q.eq("scenario", scenario))
    .collect();
  const auditEvents = await ctx.db
    .query("demo_auditEvents")
    .withIndex("by_scenario", (q) => q.eq("scenario", scenario))
    .collect();
  const outboxEvents = await ctx.db
    .query("demo_eventOutbox")
    .withIndex("by_scenario", (q) => q.eq("scenario", scenario))
    .collect();
  const siteVisits = await ctx.db
    .query("demo_siteVisits")
    .withIndex("by_scenario", (q) => q.eq("scenario", scenario))
    .collect();
  const siteVisitTargets = await ctx.db
    .query("demo_siteVisitTargets")
    .withIndex("by_scenario", (q) => q.eq("scenario", scenario))
    .collect();
  const siteVisitFiles = await ctx.db
    .query("demo_siteVisitFiles")
    .withIndex("by_scenario", (q) => q.eq("scenario", scenario))
    .collect();
  const reviewReports = await ctx.db
    .query("demo_reviewReports")
    .withIndex("by_milestone", (q) => q.eq("scenario", scenario))
    .collect()
    .catch(async () => []);
  const evidencePackages = await ctx.db
    .query("demo_evidencePackages")
    .withIndex("by_scenario", (q) => q.eq("scenario", scenario))
    .collect();

  const milestoneByKey = new Map<string, DemoMilestone>();
  for (const milestone of milestones) {
    milestoneByKey.set(milestone.key, milestone);
  }

  const groupByKey = new Map<string, DemoDrawGroup>();
  for (const group of drawGroups) {
    groupByKey.set(group.key, group);
  }

  const proposalValidation = validateProposal(
    milestones,
    drawGroups,
    dependencies,
    build.workingCapitalLimitCents
  );
  const dismissedIssueKeys = await getDismissedIssueKeys(ctx, scenario);
  const typedIssues = withDismissalState(
    scenario === "proposal" ? proposalValidation.issues : [],
    dismissedIssueKeys
  );

  const decoratedMilestones: DecoratedMilestone[] = [];
  for (const milestone of milestones) {
    const evidenceFiles = await activeEvidenceFiles(
      ctx,
      scenario,
      milestone.key
    );
    const milestoneEvidencePackages = evidencePackages
      .filter((item) => item.milestoneKey === milestone.key)
      .sort((a, b) => b.createdAt - a.createdAt);
    const milestoneSiteVisits = siteVisits
      .filter((visit) => {
        if (visit.milestoneKey === milestone.key) {
          return true;
        }
        return siteVisitTargets.some(
          (target) =>
            target.siteVisitId === visit._id &&
            target.milestoneKey === milestone.key
        );
      })
      .sort((a, b) => b.createdAt - a.createdAt)
      .map((visit) => {
        const targets = siteVisitTargets
          .filter((target) => target.siteVisitId === visit._id)
          .sort((a, b) => a.milestoneOrder - b.milestoneOrder);
        return {
          ...visit,
          files: siteVisitFiles.filter(
            (file) => file.siteVisitId === visit._id
          ),
          targetMilestoneKeys: targets.map((target) => target.milestoneKey),
          targets,
        };
      });
    const milestoneReviewReports = reviewReports
      .filter((report) => report.milestoneKey === milestone.key)
      .sort((a, b) => b.createdAt - a.createdAt);
    const evidencePackage = milestoneEvidencePackages[0];
    const siteVisit = milestoneSiteVisits[0];
    const blockers = deriveBlockingReasons({
      dependencies,
      drawGroups,
      evidenceFiles,
      groupByKey,
      milestone,
      milestoneByKey,
      proposalValidation,
      scenario,
      siteVisit,
    });
    const milestoneIssues = typedIssues.filter((issue) =>
      issue.milestoneIds.includes(milestone.key)
    );
    const blocks = dependencies
      .filter((edge) => edge.blockerKey === milestone.key)
      .map((edge) => edge.blockedKey);
    const blockedBy = dependencies
      .filter((edge) => edge.blockedKey === milestone.key)
      .map((edge) => edge.blockerKey);
    const displayStatus =
      scenario === "active" &&
      milestone.status === "planned" &&
      blockers.length === 0
        ? "ready"
        : milestone.status;

    decoratedMilestones.push({
      ...milestone,
      blockedByKeys: blockedBy,
      blockingKeys: blocks,
      blockingReasons: blockers,
      issues: milestoneIssues,
      displayStatus,
      evidenceCount: evidenceFiles.length,
      evidenceFiles: evidenceFiles
        .sort((a, b) => b.uploadedAt - a.uploadedAt)
        .map((file) => ({
          fileName: file.fileName,
          id: file._id,
          isSample: file.isSample,
          mimeType: file.mimeType,
          sizeBytes: file.sizeBytes,
          uploadedAt: file.uploadedAt,
          uploadedByPersona: file.uploadedByPersona,
        })),
      latestEvidencePackage: evidencePackage,
      evidencePackages: milestoneEvidencePackages,
      latestReview: milestoneReviewReports[0],
      reviewReports: milestoneReviewReports,
      latestSiteVisit: siteVisit,
      siteVisits: milestoneSiteVisits,
    });
  }

  const projectedGroups: ProjectedDrawGroup[] = drawGroups.map((group) => {
    const groupMilestones = decoratedMilestones.filter(
      (milestone) => milestone.drawGroupKey === group.key
    );
    const startField =
      scenario === "active" ? "forecastStartDate" : "plannedStartDate";
    const endField =
      scenario === "active" ? "forecastEndDate" : "plannedEndDate";
    const fallbackStartDate =
      group[startField] ??
      group.plannedStartDate ??
      group.forecastStartDate ??
      build.projectStartDate;
    const fallbackEndDate =
      group[endField] ??
      group.plannedEndDate ??
      group.forecastEndDate ??
      fallbackStartDate;
    const fallbackRow = Math.min(
      Math.max(1, group.order),
      Math.max(1, decoratedMilestones.length)
    );
    return {
      ...group,
      approvedValueCents: groupAmount(groupMilestones),
      eligibleDate:
        groupMilestones.length > 0
          ? addDays(
              latestDate(groupMilestones.map((item) => item[endField])),
              1
            )
          : addDays(fallbackEndDate, 1),
      endDate:
        groupMilestones.length > 0
          ? latestDate(groupMilestones.map((item) => item[endField]))
          : fallbackEndDate,
      firstRow:
        groupMilestones.length > 0
          ? Math.min(...groupMilestones.map((item) => item.order))
          : fallbackRow,
      lastRow:
        groupMilestones.length > 0
          ? Math.max(...groupMilestones.map((item) => item.order))
          : fallbackRow,
      requestedValueCents: groupMilestones.reduce(
        (sum, item) =>
          sum + (item.requestedAmountCents ?? item.approvedValueCents),
        0
      ),
      issues: typedIssues.filter((issue) =>
        issue.drawGroupIds.includes(group.key)
      ),
      startDate:
        groupMilestones.length > 0
          ? earliestDate(groupMilestones.map((item) => item[startField]))
          : fallbackStartDate,
    };
  });

  const approvedProjectValueCents = milestones.reduce(
    (sum, milestone) => sum + milestone.approvedValueCents,
    0
  );
  const projectedCapitalDrawnCents = milestones.reduce(
    (sum, milestone) =>
      sum + (milestone.requestedAmountCents ?? milestone.approvedValueCents),
    0
  );
  const drawFeesCents =
    projectedGroups.filter((group) => group.requestedValueCents > 0).length *
    build.flatDrawFeeCents;
  const interestEstimateCents = projectedGroups.reduce(
    (sum, group) =>
      sum +
      computeInterestCents(
        group.requestedValueCents,
        addDays(group.endDate, 1),
        build.payoffDate,
        build.interestAnnualBps
      ),
    0
  );
  const rolloverBufferCents = rolloverBuffers.reduce(
    (sum, buffer) =>
      buffer.status === "available" ? sum + buffer.unusedAmountCents : sum,
    0
  );

  return {
    auditEvents: auditEvents.sort((a, b) => b.createdAt - a.createdAt),
    build,
    dependencies,
    drawGroups: projectedGroups,
    latestPlanningRun: latestPlanningRun(planningRuns),
    issues: typedIssues,
    milestones: decoratedMilestones,
    needsSeed: false,
    outboxEvents: outboxEvents.sort((a, b) => b.createdAt - a.createdAt),
    rolloverBuffers,
    scenario,
    siteVisits,
    summary: {
      approvedProjectValueCents,
      drawFeesCents,
      interestEstimateCents,
      projectedBorrowerCostCents:
        approvedProjectValueCents + drawFeesCents + interestEstimateCents,
      projectedCapitalDrawnCents,
      remainingApprovedBudgetCents:
        approvedProjectValueCents - projectedCapitalDrawnCents,
      rolloverBufferCents,
      statusCounts: decoratedMilestones.reduce(
        (counts: Record<string, number>, milestone) => {
          counts[milestone.displayStatus] =
            (counts[milestone.displayStatus] ?? 0) + 1;
          return counts;
        },
        {}
      ),
      validationErrors: proposalValidation.errors,
      validationWarnings: proposalValidation.warnings,
      workingCapitalLimitCents: build.workingCapitalLimitCents,
    },
  };
}
