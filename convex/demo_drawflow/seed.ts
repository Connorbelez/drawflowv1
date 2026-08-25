import { seedBuildDetailExtras } from "../demo_drawflow_backoffice";
import { MOCK_BUILDER_PERSONA } from "../demo_personas";
import {
  appendAudit,
  getMilestones,
} from "./access";
import {
  ACTIVE_MILESTONES,
  DAY_MS,
  DEMO_NOW,
  DEMO_TODAY,
  FLAT_DRAW_FEE_CENTS,
  HARD_DEPENDENCIES,
  INTEREST_ANNUAL_BPS,
  MILESTONE_CATALOG,
  PROPOSAL_GROUPS,
  SEED_VERSION,
  WORKING_CAPITAL_CENTS,
  type DemoMutationCtx,
  type DemoBuildId,
  type Scenario,
  addDays,
  dateDiffDays,
  earliestDate,
  groupAmount,
  latestDate,
} from "./data";

export async function seedCommonDependencies(
  ctx: DemoMutationCtx,
  buildId: DemoBuildId
) {
  for (const scenario of ["active", "proposal"] as Scenario[]) {
    for (const [blockerKey, blockedKey, type] of HARD_DEPENDENCIES) {
      await ctx.db.insert("demo_milestoneDependencies", {
        blockedKey,
        blockerKey,
        buildId,
        isSystem: true,
        scenario,
        severity: type === "soft_dependency" ? "warning" : "blocking",
        type,
      });
    }
  }
}

export async function seedActive(ctx: DemoMutationCtx) {
  const buildId = await ctx.db.insert("demo_builds", {
    address: "1420 Maple Ridge Dr, Hamilton, ON L8P 2X4",
    flatDrawFeeCents: FLAT_DRAW_FEE_CENTS,
    interestAnnualBps: INTEREST_ANNUAL_BPS,
    key: "active-maple-ridge",
    lenderDrawPolicyLimitCents: WORKING_CAPITAL_CENTS,
    locationLatitude: 43.2557,
    locationLongitude: -79.8711,
    name: "Maple Ridge Townhomes",
    ownerPersona: MOCK_BUILDER_PERSONA,
    payoffDate: "2027-01-05",
    projectStartDate: "2026-01-05",
    scenario: "active",
    seedVersion: SEED_VERSION,
    status: "active",
    subtitle:
      "Phase 1 reimbursement proposal · Hamilton, ON · reimbursement only",
    todayDate: DEMO_TODAY,
    updatedAt: DEMO_NOW,
    workingCapitalLimitCents: WORKING_CAPITAL_CENTS,
  });

  for (const [index, milestone] of ACTIVE_MILESTONES.entries()) {
    await ctx.db.insert("demo_milestones", {
      actualCompletedDate:
        milestone.status === "completion_approved"
          ? milestone.forecastEndDate
          : undefined,
      approvedAt:
        milestone.status === "completion_approved"
          ? DEMO_NOW - DAY_MS
          : undefined,
      approvedByPersona:
        milestone.status === "completion_approved" ? "lender_admin" : undefined,
      approvedValueCents: milestone.valueCents,
      baselineEndDate: milestone.baselineEndDate,
      baselineStartDate: milestone.baselineStartDate,
      buildId,
      code: milestone.code,
      drawGroupKey: milestone.drawGroupKey,
      durationDays: dateDiffDays(
        milestone.forecastStartDate,
        milestone.forecastEndDate
      ),
      evidenceReviewStatus:
        milestone.status === "completion_approved" ? "accepted" : "not_started",
      forecastEndDate: milestone.forecastEndDate,
      forecastStartDate: milestone.forecastStartDate,
      key: milestone.key,
      name: milestone.name,
      order: index + 1,
      progressPercent: milestone.progressPercent,
      requestedAmountCents:
        milestone.status === "completion_approved"
          ? milestone.valueCents
          : undefined,
      requiresSiteVisit: Boolean(milestone.requiresSiteVisit),
      scenario: "active",
      status: milestone.status,
      type: milestone.type,
      updatedAt: DEMO_NOW,
    });
  }

  const activeGroups = ["d1", "d2", "d3"].map((key, index) => {
    const milestones = ACTIVE_MILESTONES.filter(
      (milestone) => milestone.drawGroupKey === key
    );
    return {
      approvedValueCents: milestones.reduce(
        (sum, milestone) => sum + milestone.valueCents,
        0
      ),
      forecastEndDate: latestDate(
        milestones.map((item) => item.forecastEndDate)
      ),
      forecastStartDate: earliestDate(
        milestones.map((item) => item.forecastStartDate)
      ),
      key,
      label: `Draw ${index + 1}`,
      order: index + 1,
      releaseApprovedAt: key === "d1" ? DEMO_NOW - DAY_MS * 30 : undefined,
      status:
        key === "d1"
          ? "release_approved"
          : key === "d2"
            ? "partially_eligible"
            : "not_yet_eligible",
    };
  });

  for (const group of activeGroups) {
    await ctx.db.insert("demo_drawGroups", {
      approvedValueCents: group.approvedValueCents,
      baselineEndDate: group.forecastEndDate,
      baselineStartDate: group.forecastStartDate,
      buildId,
      forecastEndDate: group.forecastEndDate,
      forecastStartDate: group.forecastStartDate,
      key: group.key,
      label: group.label,
      order: group.order,
      releaseApprovedAt: group.releaseApprovedAt,
      requestedValueCents: group.approvedValueCents,
      scenario: "active",
      status: group.status,
      updatedAt: DEMO_NOW,
    });
  }

  await ctx.db.insert("demo_policySnapshots", {
    buildId,
    createdAt: DEMO_NOW,
    flatDrawFeeCents: FLAT_DRAW_FEE_CENTS,
    interestAnnualBps: INTEREST_ANNUAL_BPS,
    scenario: "active",
    workingCapitalLimitCents: WORKING_CAPITAL_CENTS,
  });

  await seedBuildDetailExtras(ctx, {
    buildId,
    scenario: "active",
    orgKey: "demo",
  });

  return buildId;
}

export async function seedProposal(ctx: DemoMutationCtx) {
  const buildId = await ctx.db.insert("demo_builds", {
    address: "1420 Maple Ridge Dr, Hamilton, ON L8P 2X4",
    flatDrawFeeCents: FLAT_DRAW_FEE_CENTS,
    interestAnnualBps: INTEREST_ANNUAL_BPS,
    key: "proposal-maple-ridge",
    lenderDrawPolicyLimitCents: WORKING_CAPITAL_CENTS,
    locationLatitude: 43.2557,
    locationLongitude: -79.8711,
    name: "Maple Ridge Townhomes",
    ownerPersona: MOCK_BUILDER_PERSONA,
    payoffDate: "2027-01-05",
    projectStartDate: "2026-01-05",
    scenario: "proposal",
    seedVersion: SEED_VERSION,
    status: "draft",
    subtitle:
      "Phase 1 reimbursement proposal · Hamilton, ON · reimbursement only",
    todayDate: DEMO_TODAY,
    updatedAt: DEMO_NOW,
    workingCapitalLimitCents: WORKING_CAPITAL_CENTS,
  });

  const drawGroupByKey = new Map<string, string>();
  for (const group of PROPOSAL_GROUPS) {
    for (const milestoneKey of group.milestoneKeys) {
      drawGroupByKey.set(milestoneKey, group.key);
    }
  }

  for (const [index, milestone] of MILESTONE_CATALOG.entries()) {
    const groupKey = drawGroupByKey.get(milestone.key) ?? "d9";
    const start = addDays("2026-01-05", Math.floor(index * 7.5));
    const duration = 7 + (index % 5) * 4;
    const end = addDays(start, duration);
    await ctx.db.insert("demo_milestones", {
      approvedValueCents: milestone.valueCents,
      buildId,
      code: `M-${String((index + 1) * 10).padStart(3, "0")}`,
      drawGroupKey: groupKey,
      durationDays: dateDiffDays(start, end),
      evidenceReviewStatus: "not_started",
      key: milestone.key,
      name: milestone.name,
      order: index + 1,
      plannedEndDate: end,
      plannedStartDate: start,
      progressPercent: 0,
      requiresSiteVisit: milestone.key === "foundation",
      scenario: "proposal",
      status: "draft",
      type: milestone.type,
      updatedAt: DEMO_NOW,
    });
  }

  const proposalMilestones = await getMilestones(ctx, "proposal");
  for (const [index, group] of PROPOSAL_GROUPS.entries()) {
    const groupMilestones = proposalMilestones.filter((milestone) =>
      group.milestoneKeys.includes(milestone.key)
    );
    await ctx.db.insert("demo_drawGroups", {
      approvedValueCents: groupAmount(groupMilestones),
      buildId,
      key: group.key,
      label: `Draw ${index + 1}`,
      order: index + 1,
      plannedEndDate: latestDate(
        groupMilestones.map((item) => item.plannedEndDate)
      ),
      plannedStartDate: earliestDate(
        groupMilestones.map((item) => item.plannedStartDate)
      ),
      requestedValueCents: groupAmount(groupMilestones),
      scenario: "proposal",
      status: "planned",
      updatedAt: DEMO_NOW,
    });
  }

  await ctx.db.insert("demo_policySnapshots", {
    buildId,
    createdAt: DEMO_NOW,
    flatDrawFeeCents: FLAT_DRAW_FEE_CENTS,
    interestAnnualBps: INTEREST_ANNUAL_BPS,
    scenario: "proposal",
    workingCapitalLimitCents: WORKING_CAPITAL_CENTS,
  });

  return buildId;
}

export async function seedAll(ctx: DemoMutationCtx) {
  const activeBuildId = await seedActive(ctx);
  await seedProposal(ctx);
  await seedCommonDependencies(ctx, activeBuildId);
  await appendAudit(ctx, {
    actorPersona: "system",
    command: "demo_seedDrawFlowDemo",
    entityType: "demo",
    eventType: "DemoSeeded",
    scenario: "active",
  });
  await appendAudit(ctx, {
    actorPersona: "system",
    command: "demo_seedDrawFlowDemo",
    entityType: "demo",
    eventType: "DemoSeeded",
    scenario: "proposal",
  });
}
