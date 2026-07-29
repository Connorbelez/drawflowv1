/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { describe, expect, test, vi } from "vitest";

import { api, internal } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

const ORG = "org_production_foundation";
const APP_PERMISSION_RESOURCES = [
  "milestone",
  "submilestone",
  "draw",
  "evidence",
  "contractor",
  "material",
  "capitalEvent",
  "reminder",
] as const;

function asIdentity(
  roles: string[],
  subject = "user_builder",
  organizationId = ORG,
) {
  return convexTest(schema, modules).withIdentity({
    email: `${subject}@example.com`,
    name: subject,
    organizationId,
    role: roles[0],
    roles,
    subject,
    tokenIdentifier: `https://api.workos.com/|${subject}`,
  } as any);
}

function withIdentity(
  t: any,
  roles: string[],
  subject: string,
  organizationId = ORG,
) {
  return t.withIdentity({
    email: `${subject}@example.com`,
    name: subject,
    organizationId,
    role: roles[0],
    roles,
    subject,
    tokenIdentifier: `https://api.workos.com/|${subject}`,
  } as any);
}

function withIdentityEmail(
  t: any,
  roles: string[],
  subject: string,
  email: string,
  organizationId = ORG,
) {
  return t.withIdentity({
    email,
    name: subject,
    organizationId,
    role: roles[0],
    roles,
    subject,
    tokenIdentifier: `https://api.workos.com/|${subject}`,
  } as any);
}

async function seeded(roles: string[], subject?: string, organizationId = ORG) {
  const base = convexTest(schema, modules);
  const t = withIdentity(
    base,
    roles,
    subject ?? "user_builder",
    organizationId,
  );
  const seed = await t.mutation(
    (api as any).production_proposals.dev_seedProductionFoundation,
    { workosOrganizationId: organizationId },
  );
  return { base, seed, t };
}

async function seedTokenizedSiteVisitEvidence(
  t: any,
  {
    buildId,
    locationFailureReason,
    token,
  }: {
    buildId: string;
    locationFailureReason?: string;
    token: string;
  },
) {
  await t.run(async (ctx: any) => {
    const normalizedBuildId = ctx.db.normalizeId("activeBuilds", buildId);
    const build = await ctx.db.get(normalizedBuildId);
    const visit = await ctx.db
      .query("buildSiteVisits")
      .withIndex("by_visit", (q: any) => q.eq("visitId", token))
      .unique();
    if (!(build && visit)) {
      throw new Error("Site visit test fixture is unavailable.");
    }
    const now = Date.now();
    await ctx.db.insert("buildEvidenceAssets", {
      brokerageId: build.brokerageId,
      buildId: normalizedBuildId,
      createdAt: now,
      evidenceKey: `site-visit-test-${token}`,
      fileName: "site-visit-evidence.webp",
      label: "Site visit evidence",
      locationFailureReason,
      locationVerified: false,
      milestoneKey: visit.milestoneKey,
      mimeType: "image/webp",
      organizationId: build.organizationId,
      proposalId: build.proposalId,
      siteVisitId: visit._id,
      sizeBytes: 128_000,
      source: `active_build_site_visit:${token}:`,
      tag: "Site visit evidence",
      updatedAt: now,
    });
  });
}

async function grantOrgMembership(
  t: any,
  {
    roleSlugs,
    subject,
  }: {
    roleSlugs: string[];
    subject: string;
  },
) {
  await t.run(async (ctx: any) => {
    const now = Date.now();
    await ctx.db.insert("workosOrganizationMemberships", {
      createdAt: now,
      directoryManaged: false,
      roleSlug: roleSlugs[0],
      roleSlugs,
      sourceEventId: `test_membership_${subject}`,
      sourceEventType: "test.production_proposals",
      status: "active",
      updatedAt: now,
      workosMembershipId: `test_membership_${subject}`,
      workosOrganizationId: ORG,
      workosUserId: subject,
    });
  });
}

function productionTemplateSettingsArgs(
  template: any,
  scenarios = template.scenarios,
) {
  return {
    milestones: template.milestones.map((milestone: any, index: number) => ({
      dependencyKeys: milestone.dependencyKeys,
      durationDays: milestone.durationDays,
      icon: milestone.icon,
      included: true,
      milestoneKey: milestone.key,
      name: milestone.name,
      order: index,
      percentageBps: milestone.percentageBps,
      siteVisitGuidance: milestone.siteVisitGuidance,
      submilestones: milestone.submilestones.map(
        (submilestone: any, subIndex: number) => ({
          description: submilestone.description,
          durationDays: submilestone.durationDays,
          name: submilestone.name,
          order: subIndex,
          percentageBps: submilestone.percentageBps,
          submilestoneKey: submilestone.key,
        }),
      ),
      type: milestone.archetypeKey,
    })),
    scenarios: scenarios.map((scenario: any) => ({
      description: scenario.description,
      draws: scenario.draws.map((draw: any, order: number) => ({
        amountBps: draw.amountBps,
        drawKey: draw.drawKey,
        label: draw.label,
        order: draw.order ?? order,
        reviewNote: draw.reviewNote,
        timingDay: draw.timingDay,
      })),
      isActive: scenario.isActive,
      isDefault: scenario.isDefault,
      name: scenario.name,
      scenarioKey: scenario.scenarioKey,
      sortOrder: scenario.sortOrder,
    })),
    template: {
      description: template.description,
      isDefault: template.isDefault,
      summary: template.summary,
      templateKey: template.templateKey,
      title: template.title,
    },
    workosOrganizationId: ORG,
  };
}

async function submitProposalForTest(
  t: any,
  proposalId: any,
  workosOrganizationId = ORG,
) {
  return await t.mutation((api as any).production_proposals.submitProposal, {
    proposalId,
    workosOrganizationId,
  });
}

async function createClosedSingleMilestoneBuild(
  t: any,
  seed: any,
  options: {
    buildName?: string;
    location?: string;
    milestones?: Array<{
      budgetCents: number;
      dayEnd: number;
      dayStart: number;
      dependencyKeys: string[];
      durationDays: number;
      key: string;
      name: string;
      order: number;
      submilestones: never[];
    }>;
    submilestones?: Array<{
      budgetCents?: number;
      durationDays?: number;
      key?: string;
      name: string;
      order: number;
    }>;
    workosOrganizationId?: string;
  } = {},
) {
  const workosOrganizationId = options.workosOrganizationId ?? ORG;
  const proposalId = await t.mutation(
    (api as any).production_proposals.createDraftProposal,
    {
      brokerageId: seed.brokerageId,
      builderProfileId: seed.builderProfileId,
      buildName: options.buildName ?? "Actual cost active build",
      location: options.location ?? "44 Actual Cost Lane",
      workosOrganizationId,
    },
  );

  await t.mutation((api as any).production_proposals.saveDraftProposalPackage, {
    borrowerCoPayBps: 2_000,
    borrowerWorkingCapitalLimitCents: 35_000_000,
    documents: [
      {
        documentType: "permit",
        fileName: "actual-cost-permit.pdf",
        mimeType: "application/pdf",
        sizeBytes: 512,
      },
    ],
    lenderDrawPolicyLimitCents: 55_000_000,
    milestones: options?.milestones ?? [
      {
        budgetCents: 50_000_000,
        dayEnd: 20,
        dayStart: 0,
        dependencyKeys: [],
        durationDays: 20,
        key: "foundation",
        name: "Foundation",
        order: 1,
        submilestones: options.submilestones ?? [],
      },
    ],
    proposalId,
    workosOrganizationId,
  });
  await submitProposalForTest(t, proposalId, workosOrganizationId);
  await t.mutation((api as any).production_proposals.approveProposal, {
    proposalId,
    reason: "Ready to close.",
    workosOrganizationId,
  });

  return await t.mutation(
    (api as any).production_proposals.recordOfflineClosing,
    {
      buildStartDate: "2026-05-01",
      loanFacility: {
        interestAnnualBps: 925,
        principalCents: 55_000_000,
      },
      proposalId,
      reason: "Loan closed offline.",
      workosOrganizationId,
    },
  );
}

async function unlockActiveBuildMilestoneForDraw(
  t: any,
  buildId: any,
  milestoneKey = "foundation",
) {
  await t.run(async (ctx: any) => {
    const milestone = await ctx.db
      .query("buildMilestones")
      .withIndex("by_build_key", (q: any) =>
        q.eq("buildId", buildId).eq("key", milestoneKey),
      )
      .unique();
    if (!milestone) throw new Error("Test milestone not found.");
    await ctx.db.patch(milestone._id, {
      completionReview: {
        reviewedAt: "2026-07-14T12:00:00.000Z",
        status: "approved",
      },
      status: "complete",
    });
  });
}

function appPermissionGrants(
  allowed: Partial<
    Record<
      (typeof APP_PERMISSION_RESOURCES)[number],
      Partial<{
        canCreate: boolean;
        canDelete: boolean;
        canUpdate: boolean;
        canView: boolean;
      }>
    >
  >,
) {
  return APP_PERMISSION_RESOURCES.map((resourceType) => ({
    canCreate: allowed[resourceType]?.canCreate ?? false,
    canDelete: allowed[resourceType]?.canDelete ?? false,
    canUpdate: allowed[resourceType]?.canUpdate ?? false,
    canView: allowed[resourceType]?.canView ?? false,
    resourceType,
  }));
}

function oldWeakDrawOperationHash(seed: string) {
  let hash = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function findLegacyDrawOperationCollision(input: {
  buildId: string;
  requestedByWorkosUserId: string;
}) {
  const seen = new Map<string, { amountCents: number; drawKey: string }>();
  for (let index = 0; index < 250_000; index += 1) {
    const candidate = {
      amountCents: 1_000_000 + index,
      drawKey: `collision-draw-${index}`,
    };
    const operationId = `legacy:${oldWeakDrawOperationHash(
      [
        input.buildId,
        input.requestedByWorkosUserId,
        candidate.drawKey,
        String(candidate.amountCents),
      ].join("|"),
    )}`;
    const previous = seen.get(operationId);
    if (
      previous &&
      (previous.amountCents !== candidate.amountCents ||
        previous.drawKey !== candidate.drawKey)
    ) {
      return {
        first: previous,
        legacyOperationId: operationId,
        second: candidate,
      };
    }
    seen.set(operationId, candidate);
  }
  throw new Error("Failed to find a legacy draw operation collision.");
}

describe("production proposal foundation", () => {
  test("submits a custom timeline plan without an optimizer preset", async () => {
    const { base, seed, t } = await seeded(["admin"], "user_admin");
    const builder = withIdentity(base, ["builder"], "user_builder");
    const proposalId = await t.mutation(
      (api as any).production_proposals.createDraftProposal,
      {
        brokerageId: seed.brokerageId,
        builderProfileId: seed.builderProfileId,
        buildName: "Custom timeline proposal",
        location: "12 Custom Plan Lane",
        workosOrganizationId: ORG,
      },
    );

    await t.mutation(
      (api as any).production_proposals.saveDraftProposalPackage,
      {
        borrowerCoPayBps: 2_000,
        borrowerStartingCashCents: 40_000_000,
        lenderDrawPolicyLimitCents: 55_000_000,
        milestones: [
          {
            budgetCents: 50_000_000,
            dayEnd: 30,
            dayStart: 0,
            dependencyKeys: [],
            durationDays: 30,
            key: "foundation",
            name: "Foundation",
            order: 1,
            submilestones: [],
          },
        ],
        proposalId,
        workosOrganizationId: ORG,
      },
    );

    await builder.mutation((api as any).production_proposals.submitProposal, {
      proposalId,
      workosOrganizationId: ORG,
    });

    const submitted = await t.query(
      (api as any).production_proposals.getProposalDetail,
      { proposalId, workosOrganizationId: ORG },
    );
    expect(submitted.proposal.selectedPlan).toBeUndefined();
    expect(submitted.proposal.status).toBe("submitted");
  });

  test("preserves optional optimizer preset metrics through submission handoff", async () => {
    const { base, seed, t } = await seeded(["admin"], "user_admin");
    const builder = withIdentity(base, ["builder"], "user_builder");
    const proposalId = await t.mutation(
      (api as any).production_proposals.createDraftProposal,
      {
        brokerageId: seed.brokerageId,
        builderProfileId: seed.builderProfileId,
        buildName: "Selected plan proposal",
        location: "12 Comparison Lane",
        workosOrganizationId: ORG,
      },
    );

    await t.mutation(
      (api as any).production_proposals.saveDraftProposalPackage,
      {
        borrowerCoPayBps: 2_000,
        borrowerStartingCashCents: 40_000_000,
        lenderDrawPolicyLimitCents: 55_000_000,
        milestones: [
          {
            budgetCents: 50_000_000,
            dayEnd: 30,
            dayStart: 0,
            dependencyKeys: [],
            durationDays: 30,
            key: "foundation",
            name: "Foundation",
            order: 1,
            submilestones: [],
          },
        ],
        proposalId,
        workosOrganizationId: ORG,
      },
    );

    const storedProposal = await t.run((ctx: any) => ctx.db.get(proposalId));
    expect(storedProposal.borrowerStartingCashCents).toBe(40_000_000);

    await builder.mutation(
      (api as any).production_proposals.selectProposalPlan,
      {
        metrics: {
          drawCount: 2,
          drawFeesCents: 100_000,
          interestCostCents: 250_000,
          minimumCashReserveCents: 5_000_000,
          projectedDurationDays: 30,
          requiredWorkingCapitalCents: 32_000_000,
          startingCashCents: 40_000_000,
          totalCostCents: 350_000,
          totalDrawAmountCents: 40_000_000,
        },
        planKey: "cheapestFeasible",
        proposalId,
        recommendationReason:
          "Lowest financing cost while maintaining the required reserve.",
        workosOrganizationId: ORG,
      },
    );

    const selectedWorkspace = await t.query(
      (api as any).production_proposals.getProductionTimelineWorkspace,
      { proposalId, workosOrganizationId: ORG },
    );
    expect(selectedWorkspace.proposal.selectedPlan).toMatchObject({
      metrics: {
        drawCount: 2,
        projectedDurationDays: 30,
        requiredWorkingCapitalCents: 32_000_000,
        totalCostCents: 350_000,
      },
      name: "Cheapest Feasible",
      planKey: "cheapestFeasible",
    });

    await builder.mutation((api as any).production_proposals.submitProposal, {
      proposalId,
      workosOrganizationId: ORG,
    });

    const submitted = await t.query(
      (api as any).production_proposals.getProposalDetail,
      { proposalId, workosOrganizationId: ORG },
    );
    expect(submitted.proposal.selectedPlan).toEqual(
      selectedWorkspace.proposal.selectedPlan,
    );
    expect(submitted.proposal.status).toBe("submitted");
  });

  test("creates, saves, submits, approves, and closes a production Build Proposal without mutating demo tables", async () => {
    const { base, seed, t } = await seeded(["admin"], "user_admin");

    const proposalId = await t.mutation(
      (api as any).production_proposals.createDraftProposal,
      {
        brokerageId: seed.brokerageId,
        builderProfileId: seed.builderProfileId,
        buildName: "Production proposal",
        location: "123 Production Ave, Toronto, ON",
        workosOrganizationId: ORG,
      },
    );

    await t.mutation(
      (api as any).production_proposals.saveDraftProposalPackage,
      {
        borrowerCoPayBps: 2_000,
        borrowerWorkingCapitalLimitCents: 40_000_000,
        documents: [
          {
            documentType: "permit",
            fileName: "permit.pdf",
            mimeType: "application/pdf",
            sizeBytes: 1024,
          },
        ],
        lenderDrawPolicyLimitCents: 55_000_000,
        milestones: [
          {
            budgetCents: 50_000_000,
            dayEnd: 30,
            dayStart: 0,
            dependencyKeys: [],
            durationDays: 30,
            key: "foundation",
            name: "Foundation",
            order: 1,
            submilestones: [
              {
                budgetCents: 20_000_000,
                durationDays: 12,
                key: "forms",
                name: "Forms and pour",
                order: 1,
              },
            ],
          },
        ],
        proposalId,
        workosOrganizationId: ORG,
      },
    );

    await submitProposalForTest(t, proposalId);
    await expect(
      t.mutation((api as any).production_proposals.saveDraftProposalPackage, {
        borrowerCoPayBps: 2_000,
        borrowerWorkingCapitalLimitCents: 40_000_000,
        lenderDrawPolicyLimitCents: 55_000_000,
        milestones: [],
        proposalId,
        workosOrganizationId: ORG,
      }),
    ).rejects.toThrow(/draft/);

    await t.mutation((api as any).production_proposals.approveProposal, {
      proposalId,
      reason: "Permit and draw plan reviewed.",
      workosOrganizationId: ORG,
    });

    const approved = await t.query(
      (api as any).production_proposals.getProposalDetail,
      { proposalId, workosOrganizationId: ORG },
    );
    expect(approved.proposal.status).toBe("approved");
    expect(approved.activeBuild).toBeNull();

    const closing = await t.mutation(
      (api as any).production_proposals.recordOfflineClosing,
      {
        buildStartDate: "2026-08-01",
        loanFacility: {
          interestAnnualBps: 925,
          principalCents: 55_000_000,
        },
        proposalId,
        reason: "Loan closed offline.",
        workosOrganizationId: ORG,
      },
    );

    const closed = await t.query(
      (api as any).production_proposals.getProposalDetail,
      { proposalId, workosOrganizationId: ORG },
    );
    expect(closed.proposal.status).toBe("closed");
    expect(closed.activeBuild?._id).toBe(closing.buildId);
    expect(closed.activeBuild?.startDate).toBe("2026-08-01");
    expect(closed.buildMilestones).toHaveLength(1);
    expect(closed.buildMilestones[0]).toMatchObject({
      budgetCents: approved.milestones[0].budgetCents,
      drawAvailabilityCents: approved.milestones[0].drawAvailabilityCents,
      proposalMilestoneId: approved.milestones[0]._id,
    });
    expect(closed.buildSubmilestones).toHaveLength(1);
    expect(closed.plannedDraws[0]).toMatchObject({
      amountCents: 16_000_000,
      status: "planned",
    });
    expect(closed.auditEvents.map((event: any) => event.eventType)).toEqual(
      expect.arrayContaining([
        "proposal.submitted",
        "proposal.approved",
        "proposal.closed",
      ]),
    );

    const persistedState = await t.run(async (ctx: any) => ({
      activeBuildsForProposal: await ctx.db
        .query("activeBuilds")
        .withIndex("by_proposal", (q: any) => q.eq("proposalId", proposalId))
        .collect(),
      demoBuilds: await ctx.db.query("demo_builds").collect(),
      demoProposalDrafts: await ctx.db
        .query("demo_builderProposalDrafts")
        .collect(),
    }));
    expect(persistedState.activeBuildsForProposal).toHaveLength(1);
    expect(persistedState.activeBuildsForProposal[0]).toMatchObject({
      _id: closing.buildId,
      proposalId,
    });
    expect(persistedState.demoBuilds).toHaveLength(0);
    expect(persistedState.demoProposalDrafts).toHaveLength(0);
  });

  test("publishes active build navigation only after closing and passing record, scope, and authorization checks", async () => {
    const otherOrg = "org_production_other_scope";
    const { base, seed, t: admin } = await seeded(["admin"], "user_admin");
    const proposalId = await admin.mutation(
      (api as any).production_proposals.createDraftProposal,
      {
        brokerageId: seed.brokerageId,
        builderProfileId: seed.builderProfileId,
        buildName: "Scoped activation proposal",
        location: "210 Activation Way",
        workosOrganizationId: ORG,
      },
    );
    await admin.mutation(
      (api as any).production_proposals.saveDraftProposalPackage,
      {
        borrowerCoPayBps: 2_000,
        borrowerWorkingCapitalLimitCents: 35_000_000,
        documents: [
          {
            documentType: "permit",
            fileName: "activation-scope-permit.pdf",
            mimeType: "application/pdf",
            sizeBytes: 512,
          },
        ],
        lenderDrawPolicyLimitCents: 55_000_000,
        milestones: [
          {
            budgetCents: 50_000_000,
            dayEnd: 20,
            dayStart: 0,
            dependencyKeys: [],
            durationDays: 20,
            key: "foundation",
            name: "Foundation",
            order: 1,
            submilestones: [],
          },
        ],
        proposalId,
        workosOrganizationId: ORG,
      },
    );
    await submitProposalForTest(admin, proposalId);
    await admin.mutation((api as any).production_proposals.approveProposal, {
      proposalId,
      reason: "Ready to activate.",
      workosOrganizationId: ORG,
    });

    const beforeClosing = await admin.query(
      (api as any).production_proposals.getProposalDetail,
      { proposalId, workosOrganizationId: ORG },
    );
    expect(beforeClosing.activeBuild).toBeNull();

    const workspaceBeforeClosing = await admin.query(
      (api as any).production_proposals.listBuilderStaffWorkspace,
      { workosOrganizationId: ORG },
    );
    const proposalRowBeforeClosing = workspaceBeforeClosing.proposalRows.find(
      (row: any) => row.proposalId === String(proposalId),
    );
    expect(proposalRowBeforeClosing).toMatchObject({
      kind: "proposal",
      proposalId: String(proposalId),
    });
    expect(proposalRowBeforeClosing).not.toHaveProperty("buildKey");
    expect(
      workspaceBeforeClosing.activeBuildRows.some(
        (row: any) => row.proposalId === String(proposalId),
      ),
    ).toBe(false);

    const closing = await admin.mutation(
      (api as any).production_proposals.recordOfflineClosing,
      {
        buildStartDate: "2026-08-02",
        loanFacility: {
          interestAnnualBps: 925,
          principalCents: 55_000_000,
        },
        proposalId,
        reason: "Closed for activation scope test.",
        workosOrganizationId: ORG,
      },
    );

    const blocked = withIdentity(base, ["builder"], "user_other_builder");
    const otherOrgAdmin = (
      await seeded(["admin"], "user_admin_other_scope", otherOrg)
    ).t;

    const authorizedDetail = await admin.query(
      (api as any).production_proposals.getActiveBuildDetailByString,
      { buildId: String(closing.buildId), workosOrganizationId: ORG },
    );
    const wrongScopeDetail = await otherOrgAdmin.query(
      (api as any).production_proposals.getActiveBuildDetailByString,
      { buildId: String(closing.buildId), workosOrganizationId: otherOrg },
    );

    await expect(
      blocked.query(
        (api as any).production_proposals.getActiveBuildDetailByString,
        {
          buildId: String(closing.buildId),
          workosOrganizationId: ORG,
        },
      ),
    ).rejects.toThrow(/forbidden/i);

    expect(authorizedDetail.build).toMatchObject({ _id: closing.buildId });
    expect(wrongScopeDetail).toBeNull();
    await expect(
      admin.query(
        (api as any).production_proposals
          .getActiveBuildRouteAvailabilityByString,
        { buildId: String(closing.buildId), workosOrganizationId: ORG },
      ),
    ).resolves.toMatchObject({
      buildName: "Scoped activation proposal",
      category: "available",
      requestedBuildId: String(closing.buildId),
    });
    await expect(
      blocked.query(
        (api as any).production_proposals
          .getActiveBuildRouteAvailabilityByString,
        { buildId: String(closing.buildId), workosOrganizationId: ORG },
      ),
    ).resolves.toMatchObject({
      category: "accessDenied",
      requestedBuildId: String(closing.buildId),
    });
    await expect(
      admin.query(
        (api as any).production_proposals
          .getActiveBuildRouteAvailabilityByString,
        { buildId: "not-an-active-build-id", workosOrganizationId: ORG },
      ),
    ).resolves.toEqual({
      category: "invalidLink",
      requestedBuildId: "not-an-active-build-id",
    });

    const workspaceAfterClosing = await admin.query(
      (api as any).production_proposals.listBuilderStaffWorkspace,
      { workosOrganizationId: ORG },
    );
    expect(
      workspaceAfterClosing.proposalRows.find(
        (row: any) => row.proposalId === String(proposalId),
      ),
    ).toMatchObject({
      buildKey: String(closing.buildId),
      kind: "proposal",
      proposalId: String(proposalId),
    });
    expect(workspaceAfterClosing.activeBuildRows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          buildKey: String(closing.buildId),
          kind: "activeBuild",
          proposalId: String(proposalId),
        }),
      ]),
    );
  });

  test("adds material and equipment cost items without turning them into submilestones", async () => {
    const { seed, t } = await seeded(["admin"], "user_admin");

    const proposalId = await t.mutation(
      (api as any).production_proposals.createDraftProposal,
      {
        brokerageId: seed.brokerageId,
        builderProfileId: seed.builderProfileId,
        buildName: "Material planning proposal",
        location: "900 Supply Road",
        workosOrganizationId: ORG,
      },
    );
    await t.mutation(
      (api as any).production_proposals.saveDraftProposalPackage,
      {
        borrowerCoPayBps: 2_000,
        borrowerWorkingCapitalLimitCents: 40_000_000,
        lenderDrawPolicyLimitCents: 80_000_000,
        milestones: [
          {
            budgetCents: 50_000_000,
            dayEnd: 30,
            dayStart: 0,
            dependencyKeys: [],
            durationDays: 30,
            key: "foundation",
            name: "Foundation",
            order: 1,
            submilestones: [
              {
                budgetCents: 20_000_000,
                durationDays: 12,
                key: "forms",
                name: "Forms and pour",
                order: 1,
              },
            ],
          },
        ],
        proposalId,
        workosOrganizationId: ORG,
      },
    );

    const materialItemId = await t.mutation(
      (api as any).production_proposals.createProposalCostItem,
      {
        costCents: 7_500_000,
        description: "Concrete and rebar package.",
        itemType: "material",
        milestoneKey: "foundation",
        proposalId,
        quantity: 2,
        relevantSubmilestoneKeys: ["forms"],
        supplier: "Apex Supply",
        title: "Foundation material package",
        workosOrganizationId: ORG,
      },
    );
    const equipmentItemId = await t.mutation(
      (api as any).production_proposals.createProposalCostItem,
      {
        costCents: 2_000_000,
        itemType: "equipment",
        milestoneKey: "foundation",
        proposalId,
        quantity: 1,
        relevantSubmilestoneKeys: [],
        supplier: "Rental Desk",
        title: "Pump rental",
        workosOrganizationId: ORG,
      },
    );
    await t.mutation((api as any).production_proposals.deleteProposalCostItem, {
      itemId: equipmentItemId,
      proposalId,
      reason: "Rental moved into contractor scope.",
      workosOrganizationId: ORG,
    });
    await t.mutation((api as any).production_proposals.updateProposalCostItem, {
      costCents: 8_000_000,
      itemId: materialItemId,
      proposalId,
      quantity: 2.5,
      reason: "Supplier quote revised.",
      workosOrganizationId: ORG,
    });

    const detail = await t.query(
      (api as any).production_proposals.getProposalDetail,
      { proposalId, workosOrganizationId: ORG },
    );
    expect(detail.costItems).toHaveLength(1);
    expect(detail.costItems[0]).toMatchObject({
      itemType: "material",
      milestoneKey: "foundation",
      quantity: 2.5,
      relevantSubmilestoneKeys: ["forms"],
      supplier: "Apex Supply",
      title: "Foundation material package",
    });
    expect(detail.submilestones).toHaveLength(1);
    expect(detail.proposal.totalBudgetCents).toBe(40_000_000);
    expect(detail.milestones[0]).toMatchObject({
      budgetCents: 40_000_000,
      drawAvailabilityCents: 32_000_000,
    });
    expect(detail.draws[0]).toMatchObject({ amountCents: 32_000_000 });

    await submitProposalForTest(t, proposalId);
    await t.mutation((api as any).production_proposals.approveProposal, {
      permitWaiverReason: "Permit packet pending municipality upload.",
      proposalId,
      reason: "Material planning detail reviewed.",
      workosOrganizationId: ORG,
    });
    const closing = await t.mutation(
      (api as any).production_proposals.recordOfflineClosing,
      {
        buildStartDate: "2026-08-15",
        loanFacility: {
          interestAnnualBps: 925,
          principalCents: 80_000_000,
        },
        proposalId,
        reason: "Loan closed offline.",
        workosOrganizationId: ORG,
      },
    );
    const buildDetail = await t.query(
      (api as any).production_proposals.getActiveBuildDetailByString,
      { buildId: String(closing.buildId), workosOrganizationId: ORG },
    );
    expect(buildDetail.costItems).toHaveLength(1);
    expect(buildDetail.costItems[0]).toMatchObject({
      costCents: 8_000_000,
      itemType: "material",
      quantity: 2.5,
      relevantSubmilestoneKeys: ["forms"],
    });
    expect(buildDetail.build.totalBudgetCents).toBe(40_000_000);
    expect(buildDetail.submilestones).toHaveLength(1);

    const addedItemId = await t.mutation(
      (api as any).production_proposals.createActiveBuildCostItem,
      {
        buildId: closing.buildId,
        costCents: 1_500_000,
        itemType: "equipment",
        milestoneKey: "foundation",
        quantity: 1,
        relevantSubmilestoneKeys: [],
        supplier: "Rental Desk",
        title: "Pump rental",
        workosOrganizationId: ORG,
      },
    );
    await expect(
      t.mutation(
        (api as any).production_proposals.updateActiveBuildCostItem,
        {
          budgetTreatment: "logOnly",
          buildId: closing.buildId,
          itemId: addedItemId,
          reason: "Attempting to change planning treatment after closing.",
          workosOrganizationId: ORG,
        },
      ),
    ).rejects.toThrow(
      "Budget treatment can only be changed during proposal planning",
    );
    await t.mutation(
      (api as any).production_proposals.updateActiveBuildCostItem,
      {
        buildId: closing.buildId,
        costCents: 1_750_000,
        itemId: addedItemId,
        reason: "Rental quote revised.",
        workosOrganizationId: ORG,
      },
    );
    const buildDetailAfterUpdate = await t.query(
      (api as any).production_proposals.getActiveBuildDetailByString,
      { buildId: String(closing.buildId), workosOrganizationId: ORG },
    );
    expect(buildDetailAfterUpdate.costItems).toHaveLength(2);
    expect(buildDetailAfterUpdate.costItems).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          costCents: 8_000_000,
          title: "Foundation material package",
        }),
        expect.objectContaining({
          costCents: 1_750_000,
          title: "Pump rental",
        }),
      ]),
    );
    expect(buildDetailAfterUpdate.build.totalBudgetCents).toBe(41_750_000);

    await t.mutation(
      (api as any).production_proposals.deleteActiveBuildCostItem,
      {
        buildId: closing.buildId,
        itemId: addedItemId,
        reason: "Rental moved into contractor scope.",
        workosOrganizationId: ORG,
      },
    );
    const buildDetailAfterDelete = await t.query(
      (api as any).production_proposals.getActiveBuildDetailByString,
      { buildId: String(closing.buildId), workosOrganizationId: ORG },
    );
    expect(buildDetailAfterDelete.costItems).toHaveLength(1);
    expect(buildDetailAfterDelete.build.totalBudgetCents).toBe(40_000_000);
  });

  test("applies log-only, additive, and maintained sub-milestone cost treatments", async () => {
    const { seed, t } = await seeded(["admin"], "user_admin");
    const proposalId = await t.mutation(
      (api as any).production_proposals.createDraftProposal,
      {
        brokerageId: seed.brokerageId,
        builderProfileId: seed.builderProfileId,
        buildName: "Cost treatment proposal",
        location: "18 Allocation Road",
        workosOrganizationId: ORG,
      },
    );
    await t.mutation(
      (api as any).production_proposals.saveDraftProposalPackage,
      {
        borrowerCoPayBps: 2_000,
        borrowerWorkingCapitalLimitCents: 20_000_000,
        lenderDrawPolicyLimitCents: 40_000_000,
        milestones: [
          {
            budgetCents: 20_000_000,
            dayEnd: 10,
            dayStart: 0,
            dependencyKeys: [],
            durationDays: 10,
            key: "foundation",
            name: "Foundation",
            order: 1,
            submilestones: [
              {
                budgetCents: 20_000_000,
                durationDays: 10,
                key: "forms",
                name: "Forms and pour",
                order: 1,
              },
            ],
          },
        ],
        proposalId,
        workosOrganizationId: ORG,
      },
    );

    await expect(
      t.mutation(
        (api as any).production_proposals.createProposalCostItem,
        {
          budgetTreatment: "add",
          costCents: 1_000_000,
          itemType: "material",
          milestoneKey: "foundation",
          proposalId,
          quantity: 1,
          relevantSubmilestoneKeys: ["forms"],
          title: "Untargeted added package",
          workosOrganizationId: ORG,
        },
      ),
    ).rejects.toThrow("Add requires one budget sub-milestone target");
    await expect(
      t.mutation(
        (api as any).production_proposals.createProposalCostItem,
        {
          budgetTreatment: "maintain",
          costCents: 1_000_000,
          itemType: "material",
          milestoneKey: "foundation",
          proposalId,
          quantity: 1,
          relevantSubmilestoneKeys: ["forms"],
          title: "Untargeted maintained package",
          workosOrganizationId: ORG,
        },
      ),
    ).rejects.toThrow("Maintain requires one budget sub-milestone target");

    await t.mutation(
      (api as any).production_proposals.createProposalCostItem,
      {
        budgetSubmilestoneKey: "forms",
        budgetTreatment: "logOnly",
        costCents: 2_000_000,
        itemType: "material",
        milestoneKey: "foundation",
        proposalId,
        quantity: 1,
        relevantSubmilestoneKeys: ["forms"],
        title: "Logged quote",
        workosOrganizationId: ORG,
      },
    );
    const maintainedItemId = await t.mutation(
      (api as any).production_proposals.createProposalCostItem,
      {
        budgetSubmilestoneKey: "forms",
        budgetTreatment: "maintain",
        costCents: 5_000_000,
        itemType: "material",
        milestoneKey: "foundation",
        proposalId,
        quantity: 1,
        relevantSubmilestoneKeys: ["forms"],
        title: "Maintained package",
        workosOrganizationId: ORG,
      },
    );
    const additiveItemId = await t.mutation(
      (api as any).production_proposals.createProposalCostItem,
      {
        budgetSubmilestoneKey: "forms",
        budgetTreatment: "add",
        costCents: 3_000_000,
        itemType: "equipment",
        milestoneKey: "foundation",
        proposalId,
        quantity: 1,
        relevantSubmilestoneKeys: ["forms"],
        title: "Added pump",
        workosOrganizationId: ORG,
      },
    );

    let detail = await t.query(
      (api as any).production_proposals.getProposalDetail,
      { proposalId, workosOrganizationId: ORG },
    );
    expect(detail.proposal.totalBudgetCents).toBe(23_000_000);
    expect(detail.proposal.borrowerCoPayCents).toBe(4_600_000);
    expect(detail.milestones[0].budgetCents).toBe(23_000_000);
    expect(detail.submilestones[0].budgetCents).toBe(23_000_000);
    expect(detail.costItems).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          budgetTreatment: "logOnly",
          title: "Logged quote",
        }),
        expect.objectContaining({
          budgetSubmilestoneKey: "forms",
          budgetTreatment: "maintain",
          title: "Maintained package",
        }),
      ]),
    );
    expect(
      detail.costItems.find((item: any) => item.title === "Logged quote")
        ?.budgetSubmilestoneKey,
    ).toBeUndefined();

    await t.mutation(
      (api as any).production_proposals.updateProposalCostItem,
      {
        budgetSubmilestoneKey: "forms",
        budgetTreatment: "maintain",
        itemId: additiveItemId,
        proposalId,
        workosOrganizationId: ORG,
      },
    );
    detail = await t.query(
      (api as any).production_proposals.getProposalDetail,
      { proposalId, workosOrganizationId: ORG },
    );
    expect(detail.proposal.totalBudgetCents).toBe(20_000_000);
    expect(detail.submilestones[0].budgetCents).toBe(20_000_000);

    await expect(
      t.mutation(
        (api as any).production_proposals.updateProductionTimelineMilestone,
        {
          milestoneKey: "foundation",
          proposalId,
          submilestones: [],
          workosOrganizationId: ORG,
        },
      ),
    ).rejects.toThrow(
      "Cannot remove budget sub-milestone forms while cost items target it",
    );
    await expect(
      t.mutation(
        (api as any).production_proposals.updateProductionTimelineMilestone,
        {
          milestoneKey: "foundation",
          proposalId,
          submilestones: [
            {
              budgetCents: 7_999_999,
              durationDays: 10,
              key: "forms",
              name: "Forms and pour",
              order: 1,
            },
          ],
          workosOrganizationId: ORG,
        },
      ),
    ).rejects.toThrow("Maintained cost items exceed the forms budget");

    await expect(
      t.mutation(
        (api as any).production_proposals.createProposalCostItem,
        {
          budgetSubmilestoneKey: "forms",
          budgetTreatment: "maintain",
          costCents: 13_000_001,
          itemType: "material",
          milestoneKey: "foundation",
          proposalId,
          quantity: 1,
          relevantSubmilestoneKeys: ["forms"],
          title: "Over-allocated package",
          workosOrganizationId: ORG,
        },
      ),
    ).rejects.toThrow("Maintained cost items exceed");

    await t.mutation(
      (api as any).production_proposals.deleteProposalCostItem,
      {
        itemId: maintainedItemId,
        proposalId,
        workosOrganizationId: ORG,
      },
    );
    detail = await t.query(
      (api as any).production_proposals.getProposalDetail,
      { proposalId, workosOrganizationId: ORG },
    );
    expect(detail.proposal.totalBudgetCents).toBe(20_000_000);
    expect(detail.costItems).toHaveLength(2);
  });

  test("enforces proposal-scoped builder staff material permissions", async () => {
    const { base, seed, t: admin } = await seeded(["admin"], "user_admin");
    await grantOrgMembership(admin, {
      roleSlugs: ["builder-staff"],
      subject: "user_staff_material",
    });
    const proposalId = await admin.mutation(
      (api as any).production_proposals.createDraftProposal,
      {
        brokerageId: seed.brokerageId,
        builderProfileId: seed.builderProfileId,
        buildName: "Staff permission proposal",
        location: "12 Staff Lane",
        workosOrganizationId: ORG,
      },
    );
    await admin.mutation(
      (api as any).production_proposals.saveDraftProposalPackage,
      {
        borrowerCoPayBps: 2_000,
        borrowerWorkingCapitalLimitCents: 20_000_000,
        lenderDrawPolicyLimitCents: 40_000_000,
        milestones: [
          {
            budgetCents: 10_000_000,
            dayEnd: 10,
            dayStart: 0,
            dependencyKeys: [],
            durationDays: 10,
            key: "foundation",
            name: "Foundation",
            order: 1,
            submilestones: [],
          },
        ],
        proposalId,
        workosOrganizationId: ORG,
      },
    );
    await admin.mutation(
      (api as any).production_proposals.saveProposalBuilderStaffPermissions,
      {
        permissions: appPermissionGrants({
          material: { canCreate: true, canView: true },
        }),
        proposalId,
        staffWorkosUserId: "user_staff_material",
        workosOrganizationId: ORG,
      },
    );

    const staff = withIdentity(base, ["builder-staff"], "user_staff_material");
    await expect(
      staff.mutation(
        (api as any).production_proposals.updateProductionTimelineMilestone,
        {
          milestoneKey: "foundation",
          name: "Blocked rename",
          proposalId,
          workosOrganizationId: ORG,
        },
      ),
    ).rejects.toThrow("Forbidden: builder staff milestone.update");

    await staff.mutation(
      (api as any).production_proposals.createProposalCostItem,
      {
        costCents: 1_500_000,
        itemType: "material",
        milestoneKey: "foundation",
        proposalId,
        quantity: 1,
        relevantSubmilestoneKeys: [],
        title: "Concrete package",
        workosOrganizationId: ORG,
      },
    );
    const detail = await staff.query(
      (api as any).production_proposals.getProposalDetail,
      { proposalId, workosOrganizationId: ORG },
    );
    expect(detail.costItems).toHaveLength(1);
    expect(detail.milestones).toHaveLength(0);
    expect(detail.appPermissions.role).toBe("staff");
  });

  test("provisions unknown proposal builder staff emails before assigning app permissions", async () => {
    const { base, seed, t: admin } = await seeded(["admin"], "user_admin");
    const proposalId = await admin.mutation(
      (api as any).production_proposals.createDraftProposal,
      {
        brokerageId: seed.brokerageId,
        builderProfileId: seed.builderProfileId,
        buildName: "Staff invite proposal",
        location: "14 Staff Lane",
        workosOrganizationId: ORG,
      },
    );

    const result = await admin.action(
      (api as any).production_proposals
        .provisionProposalBuilderStaffPermissions,
      {
        permissions: appPermissionGrants({
          milestone: { canView: true },
        }),
        proposalId,
        staffEmail: "Frame.Team@Example.com",
        workosOrganizationId: ORG,
      },
    );

    expect(result).toMatchObject({
      provisioning: {
        adapter: "fake",
        membershipId:
          "fake_membership_org_production_foundation_fake_user_builder_staff_frame_team_example_com",
        operation: "provisionBuilderStaffUser",
        status: "accepted",
        sync: "waiting-for-webhook",
        userId: "fake_user_builder_staff_frame_team_example_com",
      },
      staffWorkosUserId: "fake_user_builder_staff_frame_team_example_com",
      workosMembershipId:
        "fake_membership_org_production_foundation_fake_user_builder_staff_frame_team_example_com",
    });

    const directory = await admin.query(
      (api as any).production_proposals.listProposalBuilderStaffPermissions,
      { proposalId, workosOrganizationId: ORG },
    );
    const invited = directory.staff.find(
      (member: any) =>
        member.workosUserId ===
        "fake_user_builder_staff_frame_team_example_com",
    );
    expect(invited).toMatchObject({
      email: "frame.team@example.com",
      identityStatus: "pending",
      role: "staff",
      workosMembershipId:
        "fake_membership_org_production_foundation_fake_user_builder_staff_frame_team_example_com",
    });
    expect(
      invited.permissions.find(
        (permission: any) => permission.resourceType === "milestone",
      ),
    ).toMatchObject({ canView: true });

    const staff = withIdentity(
      base,
      ["builder-staff"],
      "fake_user_builder_staff_frame_team_example_com",
    );
    const workspace = await staff.query(
      (api as any).production_proposals.listBuilderStaffWorkspace,
      { workosOrganizationId: ORG },
    );
    expect(workspace.proposalRows).toEqual([
      expect.objectContaining({
        buildName: "Staff invite proposal",
        kind: "proposal",
        proposalId: String(proposalId),
      }),
    ]);

    await admin.run(async (ctx: any) => {
      const user = await ctx.db
        .query("users")
        .withIndex("by_workos_user_id", (q: any) =>
          q.eq("workosUserId", result.staffWorkosUserId),
        )
        .unique();
      expect(user).toBeNull();
      const membership = await ctx.db
        .query("workosOrganizationMemberships")
        .withIndex("by_user", (q: any) =>
          q.eq("workosUserId", result.staffWorkosUserId),
        )
        .filter((q: any) => q.eq(q.field("workosOrganizationId"), ORG))
        .first();
      expect(membership).toBeNull();
      const link = await ctx.db
        .query("builderAccountLinks")
        .withIndex("by_builder_user", (q: any) =>
          q
            .eq("builderProfileId", seed.builderProfileId)
            .eq("workosUserId", result.staffWorkosUserId),
        )
        .unique();
      expect(link).toMatchObject({
        assignedEmail: "frame.team@example.com",
        role: "staff",
        status: "active",
        workosMembershipId:
          "fake_membership_org_production_foundation_fake_user_builder_staff_frame_team_example_com",
      });
    });
  });

  test("keeps provisioned existing org members visible while WorkOS role sync is pending", async () => {
    const { base, seed, t: admin } = await seeded(["admin"], "user_admin");
    const now = Date.now();
    const proposalId = await admin.mutation(
      (api as any).production_proposals.createDraftProposal,
      {
        brokerageId: seed.brokerageId,
        builderProfileId: seed.builderProfileId,
        buildName: "Existing member staff proposal",
        location: "16 Staff Lane",
        workosOrganizationId: ORG,
      },
    );

    await admin.run(async (ctx: any) => {
      await ctx.db.insert("users", {
        authId: "user_existing_org_staff",
        createdAt: now - 1_000,
        email: "existing.staff@example.com",
        name: "Existing Staff",
        sourceEventId: "test_existing_staff_user",
        sourceEventType: "user.created",
        status: "active",
        updatedAt: now - 1_000,
        workosUserId: "user_existing_org_staff",
      });
      await ctx.db.insert("workosOrganizationMemberships", {
        createdAt: now - 1_000,
        directoryManaged: false,
        roleSlug: "member",
        roleSlugs: ["member"],
        sourceEventId: "test_existing_staff_membership",
        sourceEventType: "organization_membership.updated",
        status: "active",
        updatedAt: now - 1_000,
        workosMembershipId: "om_existing_org_staff",
        workosOrganizationId: ORG,
        workosUserId: "user_existing_org_staff",
      });
    });

    await admin.mutation(
      internal.production_proposals.finalizeProposalBuilderStaffProvisioning,
      {
        actor: {
          organizationId: ORG,
          roles: ["admin"],
          subject: "user_admin",
        },
        permissions: appPermissionGrants({
          milestone: { canView: true },
        }),
        proposalId,
        staffEmail: "existing.staff@example.com",
        staffWorkosUserId: "user_existing_org_staff",
        workosMembershipId: "om_existing_org_staff",
        workosOrganizationId: ORG,
      },
    );

    const directory = await admin.query(
      (api as any).production_proposals.listProposalBuilderStaffPermissions,
      { proposalId, workosOrganizationId: ORG },
    );
    expect(directory.staff).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          email: "existing.staff@example.com",
          identityStatus: "pending",
          role: "staff",
          workosMembershipId: "om_existing_org_staff",
          workosUserId: "user_existing_org_staff",
        }),
      ]),
    );

    const staff = withIdentity(
      base,
      ["builder-staff"],
      "user_existing_org_staff",
    );
    const workspace = await staff.query(
      (api as any).production_proposals.listBuilderStaffWorkspace,
      { workosOrganizationId: ORG },
    );
    expect(workspace.proposalRows).toEqual([
      expect.objectContaining({
        buildName: "Existing member staff proposal",
        kind: "proposal",
        proposalId: String(proposalId),
      }),
    ]);

    const detail = await staff.query(
      (api as any).production_proposals.getProposalDetail,
      { proposalId, workosOrganizationId: ORG },
    );
    expect(detail.appPermissions.role).toBe("staff");
    expect(detail.milestones).toHaveLength(0);
  });

  test("keeps invited builder staff visible while their WorkOS membership is pending", async () => {
    const { seed, t: admin } = await seeded(["admin"], "user_admin");
    const now = Date.now();
    const proposalId = await admin.mutation(
      (api as any).production_proposals.createDraftProposal,
      {
        brokerageId: seed.brokerageId,
        builderProfileId: seed.builderProfileId,
        buildName: "Pending invited staff proposal",
        location: "17 Staff Lane",
        workosOrganizationId: ORG,
      },
    );

    await admin.run(async (ctx: any) => {
      await ctx.db.insert("users", {
        authId: "user_pending_invited_staff",
        createdAt: now - 1_000,
        email: "pending.invited@example.com",
        name: "Pending Invited",
        sourceEventId: "test_pending_invited_staff_user",
        sourceEventType: "user.created",
        status: "active",
        updatedAt: now - 1_000,
        workosUserId: "user_pending_invited_staff",
      });
      await ctx.db.insert("workosOrganizationMemberships", {
        createdAt: now - 1_000,
        directoryManaged: false,
        roleSlug: "builder-staff",
        roleSlugs: ["builder-staff"],
        sourceEventId: "test_pending_invited_staff_membership",
        sourceEventType: "organization_membership.created",
        status: "pending",
        updatedAt: now - 1_000,
        workosMembershipId: "om_pending_invited_staff",
        workosOrganizationId: ORG,
        workosUserId: "user_pending_invited_staff",
      });
    });

    await admin.mutation(
      internal.production_proposals.finalizeProposalBuilderStaffProvisioning,
      {
        actor: {
          organizationId: ORG,
          roles: ["admin"],
          subject: "user_admin",
        },
        permissions: appPermissionGrants({
          milestone: { canView: true },
        }),
        proposalId,
        staffEmail: "pending.invited@example.com",
        staffWorkosUserId: "user_pending_invited_staff",
        workosMembershipId: "om_pending_invited_staff",
        workosOrganizationId: ORG,
      },
    );

    const directory = await admin.query(
      (api as any).production_proposals.listProposalBuilderStaffPermissions,
      { proposalId, workosOrganizationId: ORG },
    );

    expect(directory.staff).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          email: "pending.invited@example.com",
          identityStatus: "pending",
          role: "staff",
          workosMembershipId: "om_pending_invited_staff",
          workosUserId: "user_pending_invited_staff",
        }),
      ]),
    );
  });

  test("resolves pending email-only builder staff assignments after onboarding without duplicates", async () => {
    const { base, seed, t: admin } = await seeded(["admin"], "user_admin");
    const staffEmail = "pending.invited@example.com";
    const proposalId = await admin.mutation(
      (api as any).production_proposals.createDraftProposal,
      {
        brokerageId: seed.brokerageId,
        builderProfileId: seed.builderProfileId,
        buildName: "Email pending staff proposal",
        location: "20 Pending Staff Lane",
        workosOrganizationId: ORG,
      },
    );
    const { buildId } = await createClosedSingleMilestoneBuild(admin, seed);
    await admin.mutation(
      internal.production_proposals.finalizeProposalBuilderStaffProvisioning,
      {
        actor: {
          organizationId: ORG,
          roles: ["admin"],
          subject: "user_admin",
        },
        permissions: appPermissionGrants({
          milestone: { canView: true },
        }),
        proposalId,
        staffEmail,
        staffWorkosUserId: "pending_builder_staff_pending_invited_example_com",
        workosMembershipId: "pending_invitation_inv_pending_first",
        workosOrganizationId: ORG,
      },
    );
    await admin.mutation(
      internal.production_proposals.finalizeProposalBuilderStaffProvisioning,
      {
        actor: {
          organizationId: ORG,
          roles: ["admin"],
          subject: "user_admin",
        },
        permissions: appPermissionGrants({
          milestone: { canView: true },
        }),
        proposalId,
        staffEmail,
        staffWorkosUserId:
          "pending_builder_staff_pending_invited_example_com_second",
        workosMembershipId: "pending_invitation_inv_pending_second",
        workosOrganizationId: ORG,
      },
    );
    await admin.mutation(
      internal.production_proposals.finalizeActiveBuildBuilderStaffProvisioning,
      {
        actor: {
          organizationId: ORG,
          roles: ["admin"],
          subject: "user_admin",
        },
        buildId,
        permissions: appPermissionGrants({
          draw: { canView: true },
        }),
        staffEmail,
        staffWorkosUserId:
          "pending_builder_staff_pending_invited_example_com_third",
        workosMembershipId: "pending_invitation_inv_pending_third",
        workosOrganizationId: ORG,
      },
    );

    const directoryBeforeOnboarding = await admin.query(
      (api as any).production_proposals.listProposalBuilderStaffPermissions,
      { proposalId, workosOrganizationId: ORG },
    );
    const pendingStaffRows = directoryBeforeOnboarding.staff.filter(
      (member: any) => member.email === staffEmail && member.role === "staff",
    );
    expect(pendingStaffRows).toHaveLength(1);
    expect(pendingStaffRows[0]).toMatchObject({
      email: staffEmail,
      identityStatus: "pending",
      role: "staff",
      workosUserId: "pending_builder_staff_pending_invited_example_com",
    });

    await admin.run(async (ctx: any) => {
      const links = await ctx.db
        .query("builderAccountLinks")
        .withIndex("by_builder", (q: any) =>
          q.eq("builderProfileId", seed.builderProfileId),
        )
        .collect();
      expect(
        links.filter(
          (link: any) =>
            link.role === "staff" &&
            link.status === "active" &&
            link.assignedEmail === staffEmail,
        ),
      ).toHaveLength(1);

      const now = Date.now();
      await ctx.db.insert("users", {
        authId: "user_onboarded_pending_staff",
        createdAt: now,
        email: staffEmail,
        name: "Pending Invited",
        sourceEventId: "test_onboarded_pending_staff",
        sourceEventType: "user.created",
        status: "active",
        updatedAt: now,
        workosUserId: "user_onboarded_pending_staff",
      });
      await ctx.db.insert("workosOrganizationMemberships", {
        createdAt: now,
        directoryManaged: false,
        roleSlug: "builder-staff",
        roleSlugs: ["builder-staff"],
        sourceEventId: "test_onboarded_pending_staff_membership",
        sourceEventType: "organization_membership.created",
        status: "active",
        updatedAt: now,
        workosMembershipId: "om_onboarded_pending_staff",
        workosOrganizationId: ORG,
        workosUserId: "user_onboarded_pending_staff",
      });
    });

    const staff = withIdentityEmail(
      base,
      ["builder-staff"],
      "user_onboarded_pending_staff",
      staffEmail,
    );
    const workspace = await staff.query(
      (api as any).production_proposals.listBuilderStaffWorkspace,
      { workosOrganizationId: ORG },
    );
    expect(workspace.proposalRows).toEqual([
      expect.objectContaining({
        buildName: "Email pending staff proposal",
        kind: "proposal",
        proposalId: String(proposalId),
      }),
    ]);
    expect(workspace.activeBuildRows).toEqual([
      expect.objectContaining({
        buildKey: String(buildId),
        kind: "activeBuild",
      }),
    ]);

    const proposalDetail = await staff.query(
      (api as any).production_proposals.getProposalDetail,
      { proposalId, workosOrganizationId: ORG },
    );
    expect(proposalDetail.appPermissions.role).toBe("staff");

    const buildDetail = await staff.query(
      (api as any).production_proposals.getActiveBuildDetailByString,
      { buildId: String(buildId), workosOrganizationId: ORG },
    );
    expect(buildDetail.appPermissions.role).toBe("staff");

    const directoryAfterOnboarding = await admin.query(
      (api as any).production_proposals.listProposalBuilderStaffPermissions,
      { proposalId, workosOrganizationId: ORG },
    );
    expect(
      directoryAfterOnboarding.staff.filter(
        (member: any) => member.email === staffEmail && member.role === "staff",
      ),
    ).toHaveLength(1);
  });

  test("re-provisioning an existing staff email preserves current app permissions", async () => {
    const { base, seed, t: admin } = await seeded(["admin"], "user_admin");
    await grantOrgMembership(admin, {
      roleSlugs: ["builder-staff"],
      subject: "user_resend_staff",
    });
    const proposalId = await admin.mutation(
      (api as any).production_proposals.createDraftProposal,
      {
        brokerageId: seed.brokerageId,
        builderProfileId: seed.builderProfileId,
        buildName: "Resend staff proposal",
        location: "18 Staff Lane",
        workosOrganizationId: ORG,
      },
    );
    await admin.mutation(
      (api as any).production_proposals.saveProposalBuilderStaffPermissions,
      {
        permissions: appPermissionGrants({
          milestone: { canView: true },
        }),
        proposalId,
        staffWorkosUserId: "user_resend_staff",
        workosOrganizationId: ORG,
      },
    );

    await admin.mutation(
      internal.production_proposals.finalizeProposalBuilderStaffProvisioning,
      {
        actor: {
          organizationId: ORG,
          roles: ["admin"],
          subject: "user_admin",
        },
        permissions: appPermissionGrants({}),
        proposalId,
        staffEmail: "user_resend_staff@example.com",
        staffWorkosUserId: "user_resend_staff",
        workosMembershipId: "test_membership_user_resend_staff",
        workosOrganizationId: ORG,
      },
    );

    const staff = withIdentity(base, ["builder-staff"], "user_resend_staff");
    const workspace = await staff.query(
      (api as any).production_proposals.listBuilderStaffWorkspace,
      { workosOrganizationId: ORG },
    );
    expect(workspace.proposalRows).toEqual([
      expect.objectContaining({
        buildName: "Resend staff proposal",
        kind: "proposal",
        proposalId: String(proposalId),
      }),
    ]);

    const directory = await admin.query(
      (api as any).production_proposals.listProposalBuilderStaffPermissions,
      { proposalId, workosOrganizationId: ORG },
    );
    const resendStaff = directory.staff.find(
      (member: any) => member.workosUserId === "user_resend_staff",
    );
    expect(
      resendStaff.permissions.find(
        (permission: any) => permission.resourceType === "milestone",
      ),
    ).toMatchObject({ canView: true });
  });

  test("hides WorkOS-deleted proposal builder staff links and denies access", async () => {
    const { base, seed, t: admin } = await seeded(["admin"], "user_admin");
    const proposalId = await admin.mutation(
      (api as any).production_proposals.createDraftProposal,
      {
        brokerageId: seed.brokerageId,
        builderProfileId: seed.builderProfileId,
        buildName: "Deleted staff proposal",
        location: "19 Archive Street",
        workosOrganizationId: ORG,
      },
    );

    await admin.run(async (ctx: any) => {
      const now = Date.now();
      await ctx.db.insert("users", {
        authId: "user_deleted_staff",
        createdAt: now,
        deletedAt: now,
        email: "deleted.staff@example.com",
        name: "Deleted Staff",
        sourceEventId: "test_deleted_staff",
        sourceEventType: "user.deleted",
        status: "deleted",
        updatedAt: now,
        workosUserId: "user_deleted_staff",
      });
      await ctx.db.insert("workosOrganizationMemberships", {
        createdAt: now,
        directoryManaged: false,
        roleSlug: "builder-staff",
        roleSlugs: ["builder-staff"],
        sourceEventId: "test_deleted_staff_membership",
        sourceEventType: "organization_membership.created",
        status: "active",
        updatedAt: now,
        workosMembershipId: "om_deleted_staff",
        workosOrganizationId: ORG,
        workosUserId: "user_deleted_staff",
      });
    });

    await admin.mutation(
      (api as any).production_proposals.saveProposalBuilderStaffPermissions,
      {
        permissions: appPermissionGrants({
          milestone: { canView: true },
        }),
        proposalId,
        staffWorkosUserId: "user_deleted_staff",
        workosOrganizationId: ORG,
      },
    );

    const directory = await admin.query(
      (api as any).production_proposals.listProposalBuilderStaffPermissions,
      { proposalId, workosOrganizationId: ORG },
    );
    expect(
      directory.staff.some(
        (member: any) => member.workosUserId === "user_deleted_staff",
      ),
    ).toBe(false);

    const deletedStaff = withIdentity(
      base,
      ["builder-staff"],
      "user_deleted_staff",
    );
    await expect(
      deletedStaff.query((api as any).production_proposals.getProposalDetail, {
        proposalId,
        workosOrganizationId: ORG,
      }),
    ).rejects.toThrow("Forbidden: builder account is not active in WorkOS");
  });

  test("re-provisioning a deleted staff email rebinds the link to the active WorkOS user", async () => {
    const { base, seed, t: admin } = await seeded(["admin"], "user_admin");
    const staffEmail = "rebound.staff@example.com";
    const proposalId = await admin.mutation(
      (api as any).production_proposals.createDraftProposal,
      {
        brokerageId: seed.brokerageId,
        builderProfileId: seed.builderProfileId,
        buildName: "Rebound staff proposal",
        location: "21 Staff Rebind Road",
        workosOrganizationId: ORG,
      },
    );

    await admin.run(async (ctx: any) => {
      const now = Date.now();
      await ctx.db.insert("users", {
        authId: "user_deleted_rebound_staff",
        createdAt: now - 5_000,
        deletedAt: now - 4_000,
        email: staffEmail,
        name: "Deleted Rebound",
        sourceEventId: "test_deleted_rebound_staff",
        sourceEventType: "user.deleted",
        status: "deleted",
        updatedAt: now - 4_000,
        workosUserId: "user_deleted_rebound_staff",
      });
    });

    await admin.mutation(
      internal.production_proposals.finalizeProposalBuilderStaffProvisioning,
      {
        actor: {
          organizationId: ORG,
          roles: ["admin"],
          subject: "user_admin",
        },
        permissions: appPermissionGrants({
          milestone: { canView: true },
        }),
        proposalId,
        staffEmail,
        staffWorkosUserId: "user_deleted_rebound_staff",
        workosMembershipId: "om_deleted_rebound_staff",
        workosOrganizationId: ORG,
      },
    );

    await admin.run(async (ctx: any) => {
      const now = Date.now();
      await ctx.db.insert("users", {
        authId: "user_active_rebound_staff",
        createdAt: now,
        email: staffEmail,
        name: "Active Rebound",
        sourceEventId: "test_active_rebound_staff",
        sourceEventType: "user.created",
        status: "active",
        updatedAt: now,
        workosUserId: "user_active_rebound_staff",
      });
      await ctx.db.insert("workosOrganizationMemberships", {
        createdAt: now,
        directoryManaged: false,
        roleSlug: "builder-staff",
        roleSlugs: ["builder-staff"],
        sourceEventId: "test_active_rebound_staff_membership",
        sourceEventType: "organization_membership.created",
        status: "pending",
        updatedAt: now,
        workosMembershipId: "om_active_rebound_staff",
        workosOrganizationId: ORG,
        workosUserId: "user_active_rebound_staff",
      });
    });

    await admin.mutation(
      internal.production_proposals.finalizeProposalBuilderStaffProvisioning,
      {
        actor: {
          organizationId: ORG,
          roles: ["admin"],
          subject: "user_admin",
        },
        permissions: appPermissionGrants({}),
        proposalId,
        staffEmail,
        staffWorkosUserId: "user_active_rebound_staff",
        workosMembershipId: "om_active_rebound_staff",
        workosOrganizationId: ORG,
      },
    );

    const directory = await admin.query(
      (api as any).production_proposals.listProposalBuilderStaffPermissions,
      { proposalId, workosOrganizationId: ORG },
    );
    const reboundStaff = directory.staff.find(
      (member: any) => member.email === staffEmail,
    );
    expect(reboundStaff).toMatchObject({
      identityStatus: "pending",
      role: "staff",
      workosMembershipId: "om_active_rebound_staff",
      workosUserId: "user_active_rebound_staff",
    });

    const staff = withIdentityEmail(
      base,
      ["builder-staff"],
      "user_active_rebound_staff",
      staffEmail,
    );
    const workspace = await staff.query(
      (api as any).production_proposals.listBuilderStaffWorkspace,
      { workosOrganizationId: ORG },
    );
    expect(workspace.proposalRows).toEqual([
      expect.objectContaining({
        buildName: "Rebound staff proposal",
        kind: "proposal",
        proposalId: String(proposalId),
      }),
    ]);
  });

  test("hides builder staff links when their WorkOS membership is deleted", async () => {
    const { seed, t: admin } = await seeded(["admin"], "user_admin");
    const proposalId = await admin.mutation(
      (api as any).production_proposals.createDraftProposal,
      {
        brokerageId: seed.brokerageId,
        builderProfileId: seed.builderProfileId,
        buildName: "Deleted membership proposal",
        location: "21 Archive Street",
        workosOrganizationId: ORG,
      },
    );

    await admin.run(async (ctx: any) => {
      const now = Date.now();
      await ctx.db.insert("users", {
        authId: "user_membership_deleted_staff",
        createdAt: now,
        email: "membership.deleted@example.com",
        name: "Membership Deleted",
        sourceEventId: "test_membership_deleted_staff",
        sourceEventType: "user.created",
        status: "active",
        updatedAt: now,
        workosUserId: "user_membership_deleted_staff",
      });
      await ctx.db.insert("workosOrganizationMemberships", {
        createdAt: now,
        deletedAt: now,
        directoryManaged: false,
        roleSlug: "builder-staff",
        roleSlugs: ["builder-staff"],
        sourceEventId: "test_membership_deleted",
        sourceEventType: "organization_membership.deleted",
        status: "deleted",
        updatedAt: now,
        workosMembershipId: "om_membership_deleted_staff",
        workosOrganizationId: ORG,
        workosUserId: "user_membership_deleted_staff",
      });
    });

    await admin.mutation(
      (api as any).production_proposals.saveProposalBuilderStaffPermissions,
      {
        permissions: appPermissionGrants({
          milestone: { canView: true },
        }),
        proposalId,
        staffWorkosUserId: "user_membership_deleted_staff",
        workosOrganizationId: ORG,
      },
    );

    const directory = await admin.query(
      (api as any).production_proposals.listProposalBuilderStaffPermissions,
      { proposalId, workosOrganizationId: ORG },
    );
    expect(
      directory.staff.some(
        (member: any) =>
          member.workosUserId === "user_membership_deleted_staff",
      ),
    ).toBe(false);
  });

  test("enforces active-build scoped builder staff draw permissions", async () => {
    const { base, seed, t: admin } = await seeded(["admin"], "user_admin");
    await grantOrgMembership(admin, {
      roleSlugs: ["builder-staff"],
      subject: "user_staff_draw",
    });
    const { buildId } = await createClosedSingleMilestoneBuild(admin, seed);
    await unlockActiveBuildMilestoneForDraw(admin, buildId);
    await admin.mutation(
      (api as any).production_proposals.saveActiveBuildBuilderStaffPermissions,
      {
        buildId,
        permissions: appPermissionGrants({
          draw: { canUpdate: true, canView: true },
        }),
        staffWorkosUserId: "user_staff_draw",
        workosOrganizationId: ORG,
      },
    );

    const staff = withIdentity(base, ["builder-staff"], "user_staff_draw");
    await expect(
      staff.mutation(
        (api as any).production_proposals.createActiveBuildCostItem,
        {
          buildId,
          costCents: 250_000,
          itemType: "material",
          milestoneKey: "foundation",
          quantity: 1,
          relevantSubmilestoneKeys: [],
          title: "Blocked material",
          workosOrganizationId: ORG,
        },
      ),
    ).rejects.toThrow("Forbidden: builder staff material.create");

    await staff.mutation(
      (api as any).production_proposals.requestActiveBuildDraw,
      {
        amountCents: 1_000_000,
        buildId,
        drawKey: "draw-01",
        note: "Ready for reimbursement.",
        workosOrganizationId: ORG,
      },
    );
    const detail = await staff.query(
      (api as any).production_proposals.getActiveBuildDetailByString,
      { buildId: String(buildId), workosOrganizationId: ORG },
    );
    expect(detail.draws[0]).toMatchObject({
      requestNote: "Ready for reimbursement.",
      status: "requested",
    });
    expect(detail.costItems).toHaveLength(0);
    expect(detail.appPermissions.role).toBe("staff");
  });

  test("provisions unknown active-build builder staff emails before assigning app permissions", async () => {
    const { seed, t: admin } = await seeded(["admin"], "user_admin");
    const { buildId } = await createClosedSingleMilestoneBuild(admin, seed);

    const result = await admin.action(
      (api as any).production_proposals
        .provisionActiveBuildBuilderStaffPermissions,
      {
        buildId,
        permissions: appPermissionGrants({
          draw: { canUpdate: true, canView: true },
        }),
        staffEmail: "Draw.Team@Example.com",
        workosOrganizationId: ORG,
      },
    );

    expect(result).toMatchObject({
      provisioning: {
        adapter: "fake",
        membershipId:
          "fake_membership_org_production_foundation_fake_user_builder_staff_draw_team_example_com",
        operation: "provisionBuilderStaffUser",
        status: "accepted",
        sync: "waiting-for-webhook",
        userId: "fake_user_builder_staff_draw_team_example_com",
      },
      staffWorkosUserId: "fake_user_builder_staff_draw_team_example_com",
      workosMembershipId:
        "fake_membership_org_production_foundation_fake_user_builder_staff_draw_team_example_com",
    });

    const directory = await admin.query(
      (api as any).production_proposals.listActiveBuildBuilderStaffPermissions,
      { buildId, workosOrganizationId: ORG },
    );
    const invited = directory.staff.find(
      (member: any) =>
        member.workosUserId === "fake_user_builder_staff_draw_team_example_com",
    );
    expect(invited).toMatchObject({
      email: "draw.team@example.com",
      identityStatus: "pending",
      role: "staff",
    });
    expect(
      invited.permissions.find(
        (permission: any) => permission.resourceType === "draw",
      ),
    ).toMatchObject({ canUpdate: true, canView: true });
  });

  test("lists only explicitly assigned builder-staff proposal and active-build rows", async () => {
    const { base, seed, t: admin } = await seeded(["admin"], "user_admin");
    await grantOrgMembership(admin, {
      roleSlugs: ["builder-staff"],
      subject: "user_staff_workspace",
    });
    const assignedProposalId = await admin.mutation(
      (api as any).production_proposals.createDraftProposal,
      {
        brokerageId: seed.brokerageId,
        builderProfileId: seed.builderProfileId,
        buildName: "Assigned staff proposal",
        location: "31 Staff Route",
        workosOrganizationId: ORG,
      },
    );
    const blockedProposalId = await admin.mutation(
      (api as any).production_proposals.createDraftProposal,
      {
        brokerageId: seed.brokerageId,
        builderProfileId: seed.builderProfileId,
        buildName: "Blocked staff proposal",
        location: "33 Staff Route",
        workosOrganizationId: ORG,
      },
    );
    const { buildId } = await createClosedSingleMilestoneBuild(admin, seed);

    await admin.mutation(
      (api as any).production_proposals.saveProposalBuilderStaffPermissions,
      {
        permissions: appPermissionGrants({
          milestone: { canView: true },
        }),
        proposalId: assignedProposalId,
        staffWorkosUserId: "user_staff_workspace",
        workosOrganizationId: ORG,
      },
    );
    await admin.mutation(
      (api as any).production_proposals.saveActiveBuildBuilderStaffPermissions,
      {
        buildId,
        permissions: appPermissionGrants({
          draw: { canView: true },
        }),
        staffWorkosUserId: "user_staff_workspace",
        workosOrganizationId: ORG,
      },
    );

    const staff = withIdentity(base, ["builder-staff"], "user_staff_workspace");
    const workspace = await staff.query(
      (api as any).production_proposals.listBuilderStaffWorkspace,
      { workosOrganizationId: ORG },
    );

    expect(workspace.proposalRows).toEqual([
      expect.objectContaining({
        buildName: "Assigned staff proposal",
        kind: "proposal",
        proposalId: String(assignedProposalId),
      }),
    ]);
    expect(workspace.activeBuildRows).toEqual([
      expect.objectContaining({
        buildKey: String(buildId),
        kind: "activeBuild",
      }),
    ]);

    await expect(
      staff.query((api as any).production_proposals.getProposalDetail, {
        proposalId: blockedProposalId,
        workosOrganizationId: ORG,
      }),
    ).rejects.toThrow("Forbidden: builder staff view");

    const ownerWithStaffRole = withIdentity(
      base,
      ["builder-staff"],
      "user_builder",
    );
    const ownerWorkspace = await ownerWithStaffRole.query(
      (api as any).production_proposals.listBuilderStaffWorkspace,
      { workosOrganizationId: ORG },
    );
    expect(ownerWorkspace.proposalRows).toHaveLength(0);
    expect(ownerWorkspace.activeBuildRows).toHaveLength(0);
  });

  test("admin can inspect the builder-staff workspace without explicit staff grants", async () => {
    const { seed, t: admin } = await seeded(["admin"], "user_admin");
    const proposalId = await admin.mutation(
      (api as any).production_proposals.createDraftProposal,
      {
        brokerageId: seed.brokerageId,
        builderProfileId: seed.builderProfileId,
        buildName: "Admin visible staff proposal",
        location: "37 Staff Admin Route",
        workosOrganizationId: ORG,
      },
    );
    const { buildId } = await createClosedSingleMilestoneBuild(admin, seed);

    const workspace = await admin.query(
      (api as any).production_proposals.listBuilderStaffWorkspace,
      { workosOrganizationId: ORG },
    );

    expect(workspace.proposalRows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          buildName: "Admin visible staff proposal",
          kind: "proposal",
          proposalId: String(proposalId),
        }),
      ]),
    );
    expect(workspace.activeBuildRows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          buildKey: String(buildId),
          kind: "activeBuild",
        }),
      ]),
    );
  });

  test("excludes WorkOS-invalid builder staff workspace rows", async () => {
    const { base, seed, t: admin } = await seeded(["admin"], "user_admin");
    const deletedProposalId = await admin.mutation(
      (api as any).production_proposals.createDraftProposal,
      {
        brokerageId: seed.brokerageId,
        builderProfileId: seed.builderProfileId,
        buildName: "Deleted workspace staff proposal",
        location: "41 Staff Route",
        workosOrganizationId: ORG,
      },
    );
    const wrongRoleProposalId = await admin.mutation(
      (api as any).production_proposals.createDraftProposal,
      {
        brokerageId: seed.brokerageId,
        builderProfileId: seed.builderProfileId,
        buildName: "Wrong role workspace staff proposal",
        location: "43 Staff Route",
        workosOrganizationId: ORG,
      },
    );

    await admin.run(async (ctx: any) => {
      const now = Date.now();
      await ctx.db.insert("users", {
        authId: "user_workspace_deleted",
        createdAt: now,
        deletedAt: now,
        email: "workspace.deleted@example.com",
        name: "Workspace Deleted",
        sourceEventId: "test_workspace_deleted",
        sourceEventType: "user.deleted",
        status: "deleted",
        updatedAt: now,
        workosUserId: "user_workspace_deleted",
      });
      await ctx.db.insert("workosOrganizationMemberships", {
        createdAt: now,
        directoryManaged: false,
        roleSlug: "builder-staff",
        roleSlugs: ["builder-staff"],
        sourceEventId: "test_workspace_deleted_membership",
        sourceEventType: "organization_membership.created",
        status: "active",
        updatedAt: now,
        workosMembershipId: "om_workspace_deleted",
        workosOrganizationId: ORG,
        workosUserId: "user_workspace_deleted",
      });
      await ctx.db.insert("users", {
        authId: "user_workspace_wrong_role",
        createdAt: now,
        email: "workspace.wrong-role@example.com",
        name: "Workspace Wrong Role",
        sourceEventId: "test_workspace_wrong_role",
        sourceEventType: "user.created",
        status: "active",
        updatedAt: now,
        workosUserId: "user_workspace_wrong_role",
      });
      await ctx.db.insert("workosOrganizationMemberships", {
        createdAt: now,
        directoryManaged: false,
        roleSlug: "member",
        roleSlugs: ["member"],
        sourceEventId: "test_workspace_wrong_role_membership",
        sourceEventType: "organization_membership.created",
        status: "active",
        updatedAt: now,
        workosMembershipId: "om_workspace_wrong_role",
        workosOrganizationId: ORG,
        workosUserId: "user_workspace_wrong_role",
      });
    });

    await admin.mutation(
      (api as any).production_proposals.saveProposalBuilderStaffPermissions,
      {
        permissions: appPermissionGrants({
          milestone: { canView: true },
        }),
        proposalId: deletedProposalId,
        staffWorkosUserId: "user_workspace_deleted",
        workosOrganizationId: ORG,
      },
    );
    await admin.mutation(
      (api as any).production_proposals.saveProposalBuilderStaffPermissions,
      {
        permissions: appPermissionGrants({
          milestone: { canView: true },
        }),
        proposalId: wrongRoleProposalId,
        staffWorkosUserId: "user_workspace_wrong_role",
        workosOrganizationId: ORG,
      },
    );

    const deletedStaff = withIdentity(
      base,
      ["builder-staff"],
      "user_workspace_deleted",
    );
    const deletedWorkspace = await deletedStaff.query(
      (api as any).production_proposals.listBuilderStaffWorkspace,
      { workosOrganizationId: ORG },
    );
    expect(deletedWorkspace.proposalRows).toHaveLength(0);
    expect(deletedWorkspace.activeBuildRows).toHaveLength(0);

    const wrongRoleStaff = withIdentity(
      base,
      ["builder-staff"],
      "user_workspace_wrong_role",
    );
    const wrongRoleWorkspace = await wrongRoleStaff.query(
      (api as any).production_proposals.listBuilderStaffWorkspace,
      { workosOrganizationId: ORG },
    );
    expect(wrongRoleWorkspace.proposalRows).toHaveLength(0);
    expect(wrongRoleWorkspace.activeBuildRows).toHaveLength(0);
  });

  test("persists sub-milestone starts and expands milestone duration to cover them", async () => {
    const { seed, t } = await seeded(["admin"], "user_admin");

    const proposalId = await t.mutation(
      (api as any).production_proposals.createDraftProposal,
      {
        brokerageId: seed.brokerageId,
        builderProfileId: seed.builderProfileId,
        buildName: "Submilestone schedule proposal",
        location: "88 Schedule Road",
        workosOrganizationId: ORG,
      },
    );

    await t.mutation(
      (api as any).production_proposals.saveDraftProposalPackage,
      {
        borrowerCoPayBps: 2_000,
        borrowerWorkingCapitalLimitCents: 40_000_000,
        lenderDrawPolicyLimitCents: 80_000_000,
        milestones: [
          {
            budgetCents: 50_000_000,
            dayEnd: 10,
            dayStart: 3,
            dependencyKeys: [],
            durationDays: 7,
            key: "foundation",
            name: "Foundation",
            order: 1,
            submilestones: [
              {
                budgetCents: 20_000_000,
                durationDays: 5,
                key: "forms",
                name: "Forms and pour",
                order: 1,
                startDay: 8,
              },
            ],
          },
        ],
        proposalId,
        workosOrganizationId: ORG,
      },
    );

    const detail = await t.query(
      (api as any).production_proposals.getProposalDetail,
      { proposalId, workosOrganizationId: ORG },
    );

    expect(detail.milestones[0]).toMatchObject({
      budgetCents: 20_000_000,
      dayEnd: 13,
      dayStart: 8,
      durationDays: 5,
      key: "foundation",
    });
    expect(detail.submilestones[0]).toMatchObject({
      durationDays: 5,
      key: "forms",
      startDay: 8,
    });
  });

  test("saves draft package contractor assignments and material planning rows", async () => {
    const { seed, t } = await seeded(["admin"], "user_admin");

    const proposalId = await t.mutation(
      (api as any).production_proposals.createDraftProposal,
      {
        brokerageId: seed.brokerageId,
        builderProfileId: seed.builderProfileId,
        buildName: "Step 2 planning proposal",
        location: "44 Milestone Budget Road",
        workosOrganizationId: ORG,
      },
    );

    await t.mutation(
      (api as any).production_proposals.saveDraftProposalPackage,
      {
        borrowerCoPayBps: 2_000,
        borrowerWorkingCapitalLimitCents: 40_000_000,
        contractorAssignments: [
          {
            contractorName: "Apex Concrete Works",
            estimatedCostCents: 3_000_000,
            estimatedHours: 24,
            milestoneKey: "foundation",
            role: "Foundation contractor",
            submilestoneKeys: ["forms"],
          },
        ],
        costItems: [
          {
            budgetSubmilestoneKey: "forms",
            budgetTreatment: "add",
            costCents: 7_500_000,
            description:
              '<p>Concrete and rebar package.</p><img src="data:image/png;base64,abc" alt="site detail" />',
            itemType: "material",
            milestoneKey: "foundation",
            quantity: 2,
            relevantSubmilestoneKeys: ["forms"],
            supplier: "Apex Supply",
            title: "Foundation material package",
          },
        ],
        lenderDrawPolicyLimitCents: 80_000_000,
        milestones: [
          {
            budgetCents: 50_000_000,
            dayEnd: 30,
            dayStart: 0,
            dependencyKeys: [],
            durationDays: 30,
            key: "foundation",
            name: "Foundation",
            order: 1,
            submilestones: [
              {
                budgetCents: 20_000_000,
                durationDays: 12,
                key: "forms",
                name: "Forms and pour",
                order: 1,
              },
            ],
          },
        ],
        proposalId,
        workosOrganizationId: ORG,
      },
    );

    const detail = await t.query(
      (api as any).production_proposals.getProposalDetail,
      { proposalId, workosOrganizationId: ORG },
    );
    expect(detail.costItems).toEqual([
      expect.objectContaining({
        costCents: 7_500_000,
        description: expect.stringContaining("<img"),
        itemType: "material",
        milestoneKey: "foundation",
        quantity: 2,
        relevantSubmilestoneKeys: ["forms"],
        supplier: "Apex Supply",
        title: "Foundation material package",
      }),
    ]);
    expect(detail.proposal.totalBudgetCents).toBe(35_000_000);
    expect(detail.milestones[0]).toMatchObject({
      budgetCents: 35_000_000,
      drawAvailabilityCents: 28_000_000,
    });
    expect(detail.submilestones[0]).toMatchObject({
      budgetCents: 35_000_000,
      key: "forms",
    });
    expect(detail.draws[0]).toMatchObject({ amountCents: 28_000_000 });

    const workspace = await t.query(
      (api as any).production_proposals.getProductionTimelineWorkspace,
      { proposalId, workosOrganizationId: ORG },
    );
    expect(workspace.contractorPlanning).toBeUndefined();

    await t.mutation(
      (api as any).production_proposals.createContractorProfile,
      {
        brokerageId: seed.brokerageId,
        email: "scenario.contractor@example.com",
        kind: "company",
        name: "Seed Scenario Contractor LLC",
        trades: ["foundation", "framing"],
        workosOrganizationId: ORG,
      },
    );

    const contractorPlanning = await t.query(
      (api as any).production_proposals.getProposalContractorPlanning,
      { proposalId, workosOrganizationId: ORG },
    );
    expect(contractorPlanning.availableContractors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          email: "scenario.contractor@example.com",
          name: "Seed Scenario Contractor LLC",
          onboardingStatus: "profile_only",
        }),
      ]),
    );
    expect(contractorPlanning.proposalContractors).toEqual([
      expect.objectContaining({
        name: "Apex Concrete Works",
        role: "Foundation contractor",
        status: "active",
      }),
    ]);
    expect(contractorPlanning.milestoneAssignments).toEqual([
      expect.objectContaining({
        contractorName: "Apex Concrete Works",
        estimatedCostCents: 3_000_000,
        estimatedHours: 24,
        milestoneKey: "foundation",
        role: "Foundation contractor",
        status: "planned",
        submilestoneKey: "forms",
        submilestoneName: "Forms and pour",
      }),
    ]);
    expect(detail.auditEvents.map((event: any) => event.eventType)).toEqual(
      expect.arrayContaining([
        "proposal.cost_items.saved",
        "proposal.contractor.milestone_assignments_saved",
      ]),
    );
  });

  test("does not attach an existing contractor when the atomic proposal invite cannot be created", async () => {
    const { base, seed, t: admin } = await seeded(["admin"], "user_admin");
    const proposalId = await admin.mutation(
      (api as any).production_proposals.createDraftProposal,
      {
        brokerageId: seed.brokerageId,
        builderProfileId: seed.builderProfileId,
        buildName: "Atomic contractor invite proposal",
        location: "12 Lifecycle Lane",
        workosOrganizationId: ORG,
      },
    );
    const contractorId = await admin.mutation(
      (api as any).production_proposals.createContractorProfile,
      {
        brokerageId: seed.brokerageId,
        name: "No Email Foundation Crew",
        trades: ["foundation"],
        workosOrganizationId: ORG,
      },
    );
    const builder = withIdentity(base, ["builder"], "user_builder");

    await expect(
      builder.mutation(
        (api as any).production_proposals.attachAndInviteProposalContractor,
        {
          contractorId,
          proposalId,
          role: "Foundation",
          workosOrganizationId: ORG,
        },
      ),
    ).rejects.toThrow(/no email/i);

    const persisted = await admin.run(async (ctx: any) => ({
      assignment: await ctx.db
        .query("proposalContractorAssignments")
        .withIndex("by_proposal_contractor", (q: any) =>
          q.eq("proposalId", proposalId).eq("contractorId", contractorId),
        )
        .unique(),
      claims: await ctx.db
        .query("contractorInviteClaims")
        .withIndex("by_contractor_state", (q: any) =>
          q.eq("contractorId", contractorId).eq("state", "invited"),
        )
        .collect(),
    }));
    expect(persisted).toEqual({ assignment: null, claims: [] });
  });

  test("persists an unassigned broker draft after the setup workflow", async () => {
    const { base, seed, t: admin } = await seeded(["admin"], "user_admin");
    const broker = withIdentity(base, ["broker"], "user_broker");

    const proposalId = await broker.mutation(
      (api as any).production_proposals.createBrokerDraftProposal,
      {
        buildName: "Broker setup workflow proposal",
        location: "77 Workflow Way",
        workosOrganizationId: ORG,
      },
    );
    const assignedDraftId = await admin.mutation(
      (api as any).production_proposals.createDraftProposal,
      {
        brokerageId: seed.brokerageId,
        builderProfileId: seed.builderProfileId,
        buildName: "Assigned builder draft",
        location: "88 Assigned Lane",
        workosOrganizationId: ORG,
      },
    );

    const detail = await broker.query(
      (api as any).production_proposals.getProposalDetail,
      { proposalId, workosOrganizationId: ORG },
    );
    expect(detail.proposal).toMatchObject({
      buildName: "Broker setup workflow proposal",
      location: "77 Workflow Way",
      status: "draft",
    });
    expect(detail.proposal.builderProfileId).toBeUndefined();
    expect(detail.auditEvents.map((event: any) => event.eventType)).toContain(
      "proposal.created",
    );

    const unassignedDrafts = await broker.query(
      (api as any).production_proposals.listUnassignedDraftProposals,
      { workosOrganizationId: ORG },
    );
    expect(
      unassignedDrafts.drafts.map((proposal: any) => proposal.proposalId),
    ).toContain(proposalId);
    expect(
      unassignedDrafts.drafts.map((proposal: any) => proposal.proposalId),
    ).not.toContain(assignedDraftId);
    expect(unassignedDrafts.drafts[0]).toMatchObject({
      builder: "Unassigned builder",
      column: "draft",
      name: "Broker setup workflow proposal",
    });

    const dashboard = await admin.query(
      (api as any).production_proposals.getBackofficeDashboard,
      { workosOrganizationId: ORG },
    );
    expect(
      dashboard.proposals.find(
        (proposal: any) => proposal.proposalId === proposalId,
      ),
    ).toMatchObject({
      builder: "Unassigned builder",
      column: "draft",
      name: "Broker setup workflow proposal",
    });
  });

  test("enforces proposal ownership, state, reason, and permit waiver rules", async () => {
    const { seed, t } = await seeded(["admin"], "user_admin");
    const proposalId = await t.mutation(
      (api as any).production_proposals.createDraftProposal,
      {
        brokerageId: seed.brokerageId,
        builderProfileId: seed.builderProfileId,
        buildName: "Waiver proposal",
        location: "456 Waiver Road",
        workosOrganizationId: ORG,
      },
    );

    await t.mutation(
      (api as any).production_proposals.saveDraftProposalPackage,
      {
        borrowerCoPayBps: 1_500,
        borrowerWorkingCapitalLimitCents: 25_000_000,
        lenderDrawPolicyLimitCents: 30_000_000,
        milestones: [
          {
            budgetCents: 20_000_000,
            dayEnd: 15,
            dayStart: 0,
            dependencyKeys: [],
            durationDays: 15,
            key: "mobilization",
            name: "Mobilization",
            order: 1,
            submilestones: [],
          },
        ],
        proposalId,
        workosOrganizationId: ORG,
      },
    );
    await submitProposalForTest(t, proposalId);

    await expect(
      t.mutation((api as any).production_proposals.approveProposal, {
        proposalId,
        reason: "No waiver.",
        workosOrganizationId: ORG,
      }),
    ).rejects.toThrow(/permit waiver/);

    await t.mutation((api as any).production_proposals.requestChanges, {
      proposalId,
      reason: "Add permit or waiver.",
      workosOrganizationId: ORG,
    });
    let detail = await t.query(
      (api as any).production_proposals.getProposalDetail,
      { proposalId, workosOrganizationId: ORG },
    );
    expect(detail.proposal.status).toBe("draft");

    await submitProposalForTest(t, proposalId);
    await t.mutation((api as any).production_proposals.approveProposal, {
      permitWaiverReason: "Permit issued after closing by municipal process.",
      proposalId,
      reason: "Policy exception approved.",
      workosOrganizationId: ORG,
    });

    detail = await t.query(
      (api as any).production_proposals.getProposalDetail,
      {
        proposalId,
        workosOrganizationId: ORG,
      },
    );
    expect(detail.permitWaiver).toMatchObject({
      reason: "Permit issued after closing by municipal process.",
    });

    await expect(
      asIdentity(["builder"], "user_other_builder").query(
        (api as any).production_proposals.getProposalDetail,
        { proposalId, workosOrganizationId: ORG },
      ),
    ).rejects.toThrow(/Forbidden/);
  });

  test("saves draft proposal identity and package fields explicitly", async () => {
    const { seed, t } = await seeded(["admin"], "user_admin");
    const proposalId = await t.mutation(
      (api as any).production_proposals.createDraftProposal,
      {
        brokerageId: seed.brokerageId,
        builderProfileId: seed.builderProfileId,
        buildName: "Original proposal",
        location: "Original location",
        workosOrganizationId: ORG,
      },
    );

    await t.mutation(
      (api as any).production_proposals.saveDraftProposalPackage,
      {
        borrowerCoPayBps: 2_500,
        borrowerWorkingCapitalLimitCents: 45_000_000,
        buildName: "Updated proposal",
        lenderDrawPolicyLimitCents: 60_000_000,
        location: "Updated location",
        milestones: [
          {
            budgetCents: 40_000_000,
            dayEnd: 20,
            dayStart: 0,
            dependencyKeys: [],
            durationDays: 20,
            key: "sitework",
            name: "Sitework",
            order: 1,
            submilestones: [],
          },
        ],
        proposalId,
        workosOrganizationId: ORG,
      },
    );

    const detail = await t.query(
      (api as any).production_proposals.getProposalDetail,
      { proposalId, workosOrganizationId: ORG },
    );
    expect(detail.proposal).toMatchObject({
      borrowerCoPayBps: 2_500,
      borrowerWorkingCapitalLimitCents: 45_000_000,
      buildName: "Updated proposal",
      lenderDrawPolicyLimitCents: 60_000_000,
      location: "Updated location",
      totalBudgetCents: 40_000_000,
    });
  });

  test("persists a backdated proposed start date without creating implicit dependencies", async () => {
    const { seed, t } = await seeded(["admin"], "user_admin");
    const proposalId = await t.mutation(
      (api as any).production_proposals.createDraftProposal,
      {
        brokerageId: seed.brokerageId,
        builderProfileId: seed.builderProfileId,
        buildName: "Backdated proposal",
        location: "11 Parallel Road",
        workosOrganizationId: ORG,
      },
    );

    await t.mutation(
      (api as any).production_proposals.saveDraftProposalPackage,
      {
        borrowerCoPayBps: 2_000,
        borrowerWorkingCapitalLimitCents: 40_000_000,
        lenderDrawPolicyLimitCents: 90_000_000,
        milestones: [
          {
            budgetCents: 40_000_000,
            dayEnd: 30,
            dayStart: 0,
            dependencyKeys: [],
            durationDays: 30,
            key: "foundation",
            name: "Foundation",
            order: 1,
            submilestones: [],
          },
          {
            budgetCents: 35_000_000,
            dayEnd: 35,
            dayStart: 5,
            dependencyKeys: [],
            durationDays: 30,
            key: "framing",
            name: "Framing",
            order: 2,
            submilestones: [],
          },
        ],
        proposalId,
        proposedStartDate: "2025-04-15",
        workosOrganizationId: ORG,
      },
    );

    const detail = await t.query(
      (api as any).production_proposals.getProposalDetail,
      { proposalId, workosOrganizationId: ORG },
    );
    expect(detail.proposal.proposedStartDate).toBe("2025-04-15");
    expect(
      detail.milestones
        .sort((left: any, right: any) => left.order - right.order)
        .map((milestone: any) => ({
          dependencyKeys: milestone.dependencyKeys,
          key: milestone.key,
        })),
    ).toEqual([
      { dependencyKeys: [], key: "foundation" },
      { dependencyKeys: [], key: "framing" },
    ]);

    const byString = await t.query(
      (api as any).production_proposals.getProposalDetailByString,
      { proposalId: String(proposalId), workosOrganizationId: ORG },
    );
    expect(byString.proposal.proposedStartDate).toBe("2025-04-15");
    expect(byString.auditEvents).toBeUndefined();
    expect(byString.buildMilestones).toBeUndefined();
    expect(byString.buildSubmilestones).toBeUndefined();
    expect(byString.events).toBeUndefined();

    await submitProposalForTest(t, proposalId);
    await t.mutation(
      (api as any).production_proposals
        .updateProductionProposalProposedStartDate,
      {
        proposalId,
        proposedStartDate: "2025-03-10",
        workosOrganizationId: ORG,
      },
    );
    const updatedSubmitted = await t.query(
      (api as any).production_proposals.getProposalDetail,
      { proposalId, workosOrganizationId: ORG },
    );
    expect(updatedSubmitted.proposal.proposedStartDate).toBe("2025-03-10");

    await t.mutation((api as any).production_proposals.approveProposal, {
      permitWaiverReason: "Permit packet approved offline.",
      proposalId,
      reason: "Schedule reviewed.",
      workosOrganizationId: ORG,
    });
    const closing = await t.mutation(
      (api as any).production_proposals.recordOfflineClosing,
      {
        buildStartDate: "2025-05-01",
        loanFacility: {
          interestAnnualBps: 925,
          principalCents: 90_000_000,
        },
        proposalId,
        reason: "Loan closed with updated start date.",
        workosOrganizationId: ORG,
      },
    );
    const closed = await t.query(
      (api as any).production_proposals.getProposalDetail,
      { proposalId, workosOrganizationId: ORG },
    );
    expect(closed.proposal.proposedStartDate).toBe("2025-03-10");
    expect(closed.activeBuild?._id).toBe(closing.buildId);
    expect(closed.activeBuild?.startDate).toBe("2025-05-01");
  });

  test("generates Convex storage upload URLs and returns document storage URLs in proposal detail", async () => {
    const { seed, t } = await seeded(["admin"], "user_admin");
    const proposalId = await t.mutation(
      (api as any).production_proposals.createDraftProposal,
      {
        brokerageId: seed.brokerageId,
        builderProfileId: seed.builderProfileId,
        buildName: "Storage proposal",
        location: "222 Storage Street",
        workosOrganizationId: ORG,
      },
    );

    const uploadUrl = await t.mutation(
      (api as any).production_proposals.generateProposalDocumentUploadUrl,
      { proposalId, workosOrganizationId: ORG },
    );
    expect(uploadUrl).toContain("http");

    await t.mutation(
      (api as any).production_proposals.saveDraftProposalPackage,
      {
        borrowerCoPayBps: 1_000,
        borrowerWorkingCapitalLimitCents: 12_000_000,
        documents: [
          {
            documentType: "supporting",
            fileName: "scope.pdf",
            mimeType: "application/pdf",
            sizeBytes: 512,
          },
        ],
        lenderDrawPolicyLimitCents: 20_000_000,
        milestones: [
          {
            budgetCents: 10_000_000,
            dayEnd: 10,
            dayStart: 0,
            dependencyKeys: [],
            durationDays: 10,
            key: "scope",
            name: "Scope",
            order: 1,
            submilestones: [],
          },
        ],
        proposalId,
        workosOrganizationId: ORG,
      },
    );
    await submitProposalForTest(t, proposalId);

    const submittedUploadUrl = await t.mutation(
      (api as any).production_proposals.generateProposalDocumentUploadUrl,
      { proposalId, workosOrganizationId: ORG },
    );
    expect(submittedUploadUrl).toContain("http");
    await t.mutation((api as any).production_proposals.addProposalDocument, {
      documentType: "permit",
      fileName: "issued-permit.pdf",
      mimeType: "application/pdf",
      proposalId,
      sizeBytes: 1024,
      workosOrganizationId: ORG,
    });

    const detail = await t.query(
      (api as any).production_proposals.getProposalDetail,
      { proposalId, workosOrganizationId: ORG },
    );
    expect(
      detail.documents.find(
        (document: any) => document.fileName === "scope.pdf",
      ),
    ).toMatchObject({
      fileName: "scope.pdf",
      storageUrl: null,
    });
    expect(
      detail.documents.find(
        (document: any) => document.fileName === "issued-permit.pdf",
      ),
    ).toMatchObject({
      documentType: "permit",
      fileName: "issued-permit.pdf",
      storageUrl: null,
    });
  });

  test("allows audited backoffice draw schedule edits after submission without returning to draft", async () => {
    const { base, seed, t } = await seeded(["admin"], "user_admin");
    const proposalId = await t.mutation(
      (api as any).production_proposals.createDraftProposal,
      {
        brokerageId: seed.brokerageId,
        builderProfileId: seed.builderProfileId,
        buildName: "Draw schedule proposal",
        location: "321 Draw Lane",
        workosOrganizationId: ORG,
      },
    );

    await t.mutation(
      (api as any).production_proposals.saveDraftProposalPackage,
      {
        borrowerCoPayBps: 2_000,
        borrowerWorkingCapitalLimitCents: 30_000_000,
        documents: [
          {
            documentType: "permit",
            fileName: "permit.pdf",
            mimeType: "application/pdf",
            sizeBytes: 2048,
          },
        ],
        lenderDrawPolicyLimitCents: 40_000_000,
        milestones: [
          {
            budgetCents: 50_000_000,
            dayEnd: 30,
            dayStart: 0,
            dependencyKeys: [],
            durationDays: 30,
            key: "foundation",
            name: "Foundation",
            order: 1,
            submilestones: [],
          },
        ],
        proposalId,
        workosOrganizationId: ORG,
      },
    );
    await submitProposalForTest(t, proposalId);

    await expect(
      withIdentity(base, ["builder"], "user_builder").mutation(
        (api as any).production_proposals
          .updateSubmittedProposalDrawScheduleRow,
        {
          amountCents: 35_000_000,
          drawKey: "draw-01",
          proposalId,
          reason: "Builder tries to edit after submission.",
          timingDay: 28,
          workosOrganizationId: ORG,
        },
      ),
    ).rejects.toThrow(/Forbidden/);

    await t.mutation(
      (api as any).production_proposals.updateSubmittedProposalDrawScheduleRow,
      {
        amountCents: 35_000_000,
        drawKey: "draw-01",
        label: "Foundation verified reimbursement",
        proposalId,
        reason: "Adjusted after lender review.",
        timingDay: 28,
        workosOrganizationId: ORG,
      },
    );

    const detail = await t.query(
      (api as any).production_proposals.getProposalDetail,
      { proposalId, workosOrganizationId: ORG },
    );
    expect(detail.proposal.status).toBe("submitted");
    expect(detail.draws[0]).toMatchObject({
      amountCents: 35_000_000,
      label: "Foundation verified reimbursement",
      timingDay: 28,
    });
    expect(detail.auditEvents.map((event: any) => event.eventType)).toContain(
      "proposal.draw_schedule.updated",
    );

    await t.mutation((api as any).production_proposals.approveProposal, {
      proposalId,
      reason: "Adjusted draw schedule approved.",
      workosOrganizationId: ORG,
    });
    const closing = await t.mutation(
      (api as any).production_proposals.recordOfflineClosing,
      {
        buildStartDate: "2026-08-15",
        loanFacility: {
          interestAnnualBps: 925,
          principalCents: 40_000_000,
        },
        proposalId,
        reason: "Loan closed offline.",
        workosOrganizationId: ORG,
      },
    );
    const closed = await t.query(
      (api as any).production_proposals.getProposalDetail,
      { proposalId, workosOrganizationId: ORG },
    );
    expect(closed.activeBuild?._id).toBe(closing.buildId);
    expect(closed.plannedDraws[0]).toMatchObject({
      amountCents: 35_000_000,
      timingDay: 28,
    });
  });

  test("materializes exactly four kanban columns and supports contractor profiles without account links", async () => {
    const { seed, t } = await seeded(["admin"], "user_admin");

    const contractorId = await t.mutation(
      (api as any).production_proposals.createContractorProfile,
      {
        brokerageId: seed.brokerageId,
        email: "contractor@example.com",
        name: "Unlinked Contractor LLC",
        trades: ["framing"],
        workosOrganizationId: ORG,
      },
    );
    const contractor = await t.run(async (ctx: any) =>
      ctx.db.get(ctx.db.normalizeId("contractorProfiles", contractorId)!),
    );
    expect(contractor?.accountWorkosUserId).toBeUndefined();
    expect(contractor).toMatchObject({ name: "Unlinked Contractor LLC" });

    const kanban = await t.query(
      (api as any).production_proposals.listProposalKanban,
      { workosOrganizationId: ORG },
    );
    expect(kanban.columns.map((column: any) => column.id)).toEqual([
      "draft",
      "submitted",
      "approved",
      "closed",
    ]);
  });

  test("seeds production proposal settings for templates, archetypes, scenarios, and workflow rules", async () => {
    const { t } = await seeded(["admin"], "user_admin");

    const settings = await t.query(
      (api as any).production_proposals.getProductionProposalSettings,
      { workosOrganizationId: ORG },
    );

    expect(settings.archetypes.map((row: any) => row.key).sort()).toEqual([
      "foundation",
      "interior-finish",
      "shell",
    ]);
    expect(settings.templates).toHaveLength(1);
    expect(settings.templates[0].milestones.map((row: any) => row.key)).toEqual(
      ["foundation", "shell-dry-in", "interior-finish"],
    );
    expect(settings.templates[0].milestones[0].submilestones).toHaveLength(2);
    expect(
      settings.templates[0].scenarios.map((row: any) => row.scenarioKey).sort(),
    ).toEqual(["capital-constrained", "cheapest-feasible", "fastest"]);
    expect(settings.workflowRules[0]).toMatchObject({
      proposalStates: ["draft", "submitted", "approved", "closed"],
      requirePermitForApproval: true,
      settings: {
        interestStartsOn: "funds_released",
        reimbursementOnly: true,
      },
    });
  });

  test("returns provisioning state for backoffice orgs before brokerage profile creation", async () => {
    const t = asIdentity(["admin"], "user_admin");
    const now = Date.now();
    await t.run(async (ctx: any) => {
      await ctx.db.insert("workosOrganizations", {
        createdAt: now,
        domains: [],
        name: "Unprovisioned Brokerage",
        sourceEventId: "seed_unprovisioned_org",
        sourceEventType: "test.production_foundation",
        status: "active",
        updatedAt: now,
        workosOrganizationId: ORG,
      });
      await ctx.db.insert("workosOrganizationMemberships", {
        createdAt: now,
        roleSlug: "admin",
        roleSlugs: ["admin"],
        sourceEventId: "seed_unprovisioned_membership",
        sourceEventType: "test.production_foundation",
        status: "active",
        updatedAt: now,
        workosMembershipId: "seed_unprovisioned_membership",
        workosOrganizationId: ORG,
        workosUserId: "user_admin",
      });
    });

    const settings = await t.query(
      (api as any).production_proposals.getProductionProposalSettings,
      { workosOrganizationId: ORG },
    );
    expect(settings).toMatchObject({
      archetypes: [],
      brokerage: null,
      provisioningRequired: true,
      templates: [],
      workflowRules: [],
    });

    const kanban = await t.query(
      (api as any).production_proposals.listProposalKanban,
      { workosOrganizationId: ORG },
    );
    expect(kanban.provisioningRequired).toBe(true);
    expect(kanban.columns.map((column: any) => column.id)).toEqual([
      "draft",
      "submitted",
      "approved",
      "closed",
    ]);
    expect(kanban.columns.flatMap((column: any) => column.cards)).toEqual([]);
  });

  test("builder resolves proposal creation context without admin-only seed writes", async () => {
    const { base, seed } = await seeded(["admin"], "user_admin");
    const builder = withIdentity(base, ["builder"], "user_builder");

    const context = await builder.query(
      (api as any).production_proposals.getBuilderProposalCreateContext,
      { workosOrganizationId: ORG },
    );

    expect(context).toMatchObject({
      brokerage: { _id: seed.brokerageId },
      builderProfile: { _id: seed.builderProfileId },
      defaultAssignedBrokerWorkosUserId: "user_admin",
    });
    expect(context.brokers).toEqual([
      expect.objectContaining({
        isPrincipal: true,
        workosUserId: "user_admin",
      }),
      expect.objectContaining({
        isPrincipal: false,
        workosUserId: "user_broker",
      }),
    ]);
    expect(context.templates[0]).toMatchObject({
      templateKey: "single-family-full-build",
      title: "Single Family Full Build",
    });
    expect(context.templates[0].milestones).toHaveLength(3);

    const proposalId = await builder.mutation(
      (api as any).production_proposals.createDraftProposal,
      {
        assignedBrokerWorkosUserId: "user_broker",
        brokerageId: context.brokerage._id,
        builderProfileId: context.builderProfile._id,
        buildName: "Builder-created production proposal",
        location: "44 Builder Lane",
        workosOrganizationId: ORG,
      },
    );

    const detail = await builder.query(
      (api as any).production_proposals.getProposalDetail,
      { proposalId, workosOrganizationId: ORG },
    );
    expect(detail.proposal).toMatchObject({
      assignedBrokerWorkosUserId: "user_broker",
      buildName: "Builder-created production proposal",
      createdByWorkosUserId: "user_builder",
    });
  });

  test("builder proposal creation context includes seeded Garden Suite template", async () => {
    const { base } = await seeded(["admin"], "user_admin");
    const admin = withIdentity(base, ["admin"], "user_admin");
    await admin.mutation(
      (api as any).production_proposals.seedProductionDefaultsToProd,
      { workosOrganizationId: ORG },
    );
    const builder = withIdentity(base, ["builder"], "user_builder");

    const context = await builder.query(
      (api as any).production_proposals.getBuilderProposalCreateContext,
      { workosOrganizationId: ORG },
    );
    const gardenSuite = context.templates.find(
      (template: any) => template.templateKey === "garden-suite",
    );

    expect(gardenSuite).toMatchObject({
      summary:
        "16 milestones, 65 budget line items, 100.00% PoC, 141 field days",
      title: "Garden Suite",
    });
    expect(gardenSuite.milestones).toHaveLength(16);
    expect(gardenSuite.milestones[0].submilestones).toHaveLength(8);
    expect(gardenSuite.milestones.at(-1).submilestones).toEqual([
      expect.objectContaining({
        name: "Supervision, PM, temp services, dumpsters, scaffold, final clean",
      }),
    ]);
  });

  test("broker resolves proposal setup context without selecting a builder", async () => {
    const { base, seed } = await seeded(["admin"], "user_admin");
    const broker = withIdentity(base, ["broker"], "user_broker");

    const context = await broker.query(
      (api as any).production_proposals.getBrokerProposalCreateContext,
      { workosOrganizationId: ORG },
    );

    expect(context).toMatchObject({
      brokerage: { _id: seed.brokerageId },
      defaultAssignedBrokerWorkosUserId: "user_admin",
    });
    expect(context.brokers[0]).toMatchObject({
      isPrincipal: true,
      workosUserId: "user_admin",
    });
    expect(context.builderProfile).toBeUndefined();
    expect(context.templates[0]).toMatchObject({
      templateKey: "single-family-full-build",
      title: "Single Family Full Build",
    });
    expect(context.templates[0].milestones).toHaveLength(3);
  });

  test("broker proposal setup falls back when the configured principal membership is inactive", async () => {
    const { base } = await seeded(["admin"], "user_admin");
    await base.run(async (ctx: any) => {
      const memberships = await ctx.db
        .query("workosOrganizationMemberships")
        .withIndex("by_user", (q: any) => q.eq("workosUserId", "user_admin"))
        .collect();
      const principalMembership = memberships.find(
        (membership: any) => membership.workosOrganizationId === ORG,
      );
      if (!principalMembership) {
        throw new Error("Missing seeded principal broker membership.");
      }
      await ctx.db.patch(principalMembership._id, {
        status: "inactive",
        updatedAt: Date.now(),
      });
    });
    const broker = withIdentity(base, ["broker"], "user_broker");

    const context = await broker.query(
      (api as any).production_proposals.getBrokerProposalCreateContext,
      { workosOrganizationId: ORG },
    );

    expect(context.defaultAssignedBrokerWorkosUserId).toBe("user_broker");
    expect(context.brokers).toEqual([
      expect.objectContaining({
        isPrincipal: false,
        workosUserId: "user_broker",
      }),
    ]);

    await expect(
      broker.mutation(
        (api as any).production_proposals.createBrokerDraftProposal,
        {
          assignedBrokerWorkosUserId: "user_admin",
          workosOrganizationId: ORG,
        },
      ),
    ).rejects.toThrow(/active broker member/i);

    const proposalId = await broker.mutation(
      (api as any).production_proposals.createBrokerDraftProposal,
      {
        assignedBrokerWorkosUserId:
          context.defaultAssignedBrokerWorkosUserId,
        buildName: "Fallback broker build",
        location: "22 Membership Recovery Road",
        workosOrganizationId: ORG,
      },
    );
    const proposal = await broker.run((ctx: any) => ctx.db.get(proposalId));
    expect(proposal).toMatchObject({
      assignedBrokerWorkosUserId: "user_broker",
      buildName: "Fallback broker build",
    });
  });

  test("preserves the WorkOS organization name when seeding production defaults", async () => {
    const t = asIdentity(["admin"], "user_admin");
    const sourceEventId = "evt_test_organization";
    await t.run(async (ctx: any) => {
      await ctx.db.insert("workosOrganizations", {
        domains: [],
        name: "TestOrganization",
        sourceEventId,
        sourceEventType: "organization.created",
        status: "active",
        workosOrganizationId: ORG,
      });
    });

    await t.mutation(
      (api as any).production_proposals.seedProductionDefaultsToProd,
      { workosOrganizationId: ORG },
    );

    const organization = await t.run(async (ctx: any) =>
      ctx.db
        .query("workosOrganizations")
        .withIndex("by_workos_organization_id", (q: any) =>
          q.eq("workosOrganizationId", ORG),
        )
        .unique(),
    );
    expect(organization).toMatchObject({
      name: "TestOrganization",
      sourceEventId,
      sourceEventType: "organization.created",
      status: "active",
    });
  });

  test("backfills the complete template catalogue for a legacy brokerage create context", async () => {
    const { base, t: admin } = await seeded(["admin"], "user_admin");

    const legacyContext = await admin.query(
      (api as any).production_proposals.getBrokerProposalCreateContext,
      { workosOrganizationId: ORG },
    );
    expect(
      legacyContext.templates.map((template: any) => template.templateKey),
    ).toEqual(["single-family-full-build"]);

    const result = await admin.mutation(
      (api as any).production_proposals.backfillProductionDefaultTemplates,
      { workosOrganizationId: ORG },
    );
    expect(result).toMatchObject({ templates: 5 });

    const broker = withIdentity(base, ["broker"], "user_broker");
    const context = await broker.query(
      (api as any).production_proposals.getBrokerProposalCreateContext,
      { workosOrganizationId: ORG },
    );
    expect(
      context.templates.map((template: any) => template.templateKey),
    ).toEqual([
      "single-family-full-build",
      "single-family-renovation",
      "multiplex-build",
      "4-plex",
      "garden-suite",
    ]);
  });

  test("seeds production defaults including the 4-plex template", async () => {
    const { t } = await seeded(["admin"], "user_admin");

    const result = await t.mutation(
      (api as any).production_proposals.seedProductionDefaultsToProd,
      { workosOrganizationId: ORG },
    );

    expect(result).toMatchObject({
      milestones: 45,
      scenarios: 6,
      submilestones: 151,
      templates: 5,
    });

    const settings = await t.query(
      (api as any).production_proposals.getProductionProposalSettings,
      { workosOrganizationId: ORG },
    );
    expect(
      settings.templates.map((template: any) => template.templateKey),
    ).toEqual([
      "single-family-full-build",
      "single-family-renovation",
      "multiplex-build",
      "4-plex",
      "garden-suite",
    ]);

    const fullBuild = settings.templates.find(
      (template: any) => template.templateKey === "single-family-full-build",
    );
    expect(fullBuild.scenarios[0]).toMatchObject({
      description:
        "Standard reimbursement draw timing and reimbursement amount assumptions.",
      draws: expect.arrayContaining([
        expect.objectContaining({
          amountBps: 2000,
          drawKey: "draw-01",
          label: "Draw 01",
          reviewNote: "Foundation complete",
          timingDay: 16,
        }),
      ]),
      isActive: true,
      name: "Standard reimbursement",
      scenarioKey: "standard-reimbursement",
    });
    expect(fullBuild.milestones.map((milestone: any) => milestone.key)).toEqual(
      [
        "site-prep",
        "framing",
        "rough-in",
        "exterior",
        "drywall",
        "finishes",
        "closeout",
      ],
    );
    expect(fullBuild.milestones[0]).toMatchObject({
      durationDays: 14,
      name: "Site prep & foundation",
      percentageBps: 1000,
      submilestones: [
        expect.objectContaining({ name: "Permit mobilization" }),
        expect.objectContaining({ name: "Excavation" }),
        expect.objectContaining({ name: "Concrete forms" }),
        expect.objectContaining({ name: "Foundation pour" }),
      ],
    });
    expect(
      fullBuild.milestones.every(
        (milestone: any) =>
          milestone.siteVisitGuidance?.whatToVerify?.trim().length > 0 &&
          milestone.siteVisitGuidance?.cameraAngles?.trim().length > 0,
      ),
    ).toBe(true);
    expect(
      fullBuild.milestones.map((milestone: any) => milestone.key),
    ).not.toContain("shell-dry-in");

    const fourPlex = settings.templates.find(
      (template: any) => template.templateKey === "4-plex",
    );
    expect(fourPlex).toMatchObject({
      summary:
        "8 milestones, 36 budget line items, 100.00% PoC, 160 field days",
      title: "4-plex",
    });
    expect(fourPlex.milestones.map((milestone: any) => milestone.name)).toEqual(
      [
        "Draw/Milestone 1 - Permits, demo & foundation",
        "Draw/Milestone 2 - Underground, framing & roof",
        "Draw/Milestone 3 - Service upgrade & envelope",
        "Draw/Milestone 4 - MEP rough-ins",
        "Draw/Milestone 5 - Insulation, drywall & stairs",
        "Draw/Milestone 6 - Tile, flooring & trim",
        "Draw/Milestone 7 - Kitchen, appliances, paint & labour",
        "Draw/Milestone 8 - Landscaping, misc, insurance & management",
      ],
    );
    expect(
      fourPlex.milestones.reduce(
        (total: number, milestone: any) => total + milestone.percentageBps,
        0,
      ),
    ).toBe(10_000);
    expect(
      fourPlex.milestones.every((milestone: any) => {
        const subTotal = milestone.submilestones.reduce(
          (total: number, submilestone: any) =>
            total + submilestone.percentageBps,
          0,
        );
        return subTotal === milestone.percentageBps;
      }),
    ).toBe(true);
    expect(
      fourPlex.milestones[0].submilestones.map((row: any) => row.name),
    ).toEqual([
      "DC/ED",
      "PERMITS",
      "DRAWINGS",
      "DEMO EX",
      "TEMP FENCE",
      "TREE PROTECTION",
      "FOUNDATION",
    ]);
    expect(
      fourPlex.milestones[1].submilestones.map((row: any) => row.name),
    ).toEqual([
      "UNDERGROUND PIB",
      "FRAMING",
      "LUMBER",
      "CONCRETE",
      "WATER/SEWER",
      "ROOF FLAT/SHINGLES",
    ]);
    expect(fourPlex.milestones[3].submilestones).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "PLUMBING SUPPLIES",
          percentageBps: 0,
        }),
      ]),
    );
    expect(
      fourPlex.milestones.every(
        (milestone: any) =>
          milestone.siteVisitGuidance?.whatToVerify?.includes("<li>") &&
          milestone.siteVisitGuidance?.cameraAngles?.includes(
            "Required wide angle",
          ),
      ),
    ).toBe(true);
    expect(fourPlex.scenarios[0]).toMatchObject({
      draws: [
        expect.objectContaining({
          amountBps: 1100,
          label: "Draw/Milestone 1",
          timingDay: 23,
        }),
        expect.objectContaining({
          amountBps: 1329,
          label: "Draw/Milestone 2",
          timingDay: 56,
        }),
        expect.objectContaining({
          amountBps: 1118,
          label: "Draw/Milestone 3",
          timingDay: 82,
        }),
        expect.objectContaining({
          amountBps: 1283,
          label: "Draw/Milestone 4",
          timingDay: 111,
        }),
        expect.objectContaining({
          amountBps: 1099,
          label: "Draw/Milestone 5",
          timingDay: 130,
        }),
        expect.objectContaining({
          amountBps: 815,
          label: "Draw/Milestone 6",
          timingDay: 153,
        }),
        expect.objectContaining({
          amountBps: 1283,
          label: "Draw/Milestone 7",
          timingDay: 178,
        }),
        expect.objectContaining({
          amountBps: 1973,
          label: "Draw/Milestone 8",
          timingDay: 197,
        }),
      ],
      isActive: true,
      name: "4-plex",
      scenarioKey: "four-plex-standard",
    });
    expect(
      fourPlex.scenarios[0].draws.reduce(
        (total: number, draw: any) => total + draw.amountBps,
        0,
      ),
    ).toBe(10_000);

    const gardenSuite = settings.templates.find(
      (template: any) => template.templateKey === "garden-suite",
    );
    expect(gardenSuite).toMatchObject({
      summary:
        "16 milestones, 65 budget line items, 100.00% PoC, 141 field days",
      title: "Garden Suite",
    });
    expect(
      gardenSuite.milestones.map((milestone: any) => milestone.name),
    ).toEqual([
      "Soft Costs & Pre-Construction",
      "Site Work & Servicing",
      "Concrete & Foundation",
      "Framing & Structure",
      "Roofing & Exterior Envelope",
      "Windows & Exterior Doors",
      "Mechanical - HVAC & Plumbing",
      "Electrical",
      "Insulation & Drywall",
      "Flooring & Stairs",
      "Interior Doors, Trim & Paint",
      "Kitchen",
      "Bathrooms & Powder Room",
      "Exterior Site Finishes",
      "Laundry & Misc. Equipment",
      "General Conditions",
    ]);
    expect(
      gardenSuite.milestones.reduce(
        (total: number, milestone: any) => total + milestone.percentageBps,
        0,
      ),
    ).toBe(10_000);
    expect(
      gardenSuite.milestones.every((milestone: any) => {
        const subTotal = milestone.submilestones.reduce(
          (total: number, submilestone: any) =>
            total + submilestone.percentageBps,
          0,
        );
        return subTotal === milestone.percentageBps;
      }),
    ).toBe(true);
    expect(
      gardenSuite.milestones[0].submilestones.map((row: any) => row.name),
    ).toEqual([
      "Legal / topographic survey",
      "Architectural & permit drawings",
      "Structural engineering",
      "Arborist report & tree protection plan",
      "Geotechnical / soils investigation",
      "City of Toronto building permit",
      "Builder's risk insurance",
      "Legal & disbursements",
    ]);
    expect(gardenSuite.milestones.at(-1).submilestones).toEqual([
      expect.objectContaining({
        name: "Supervision, PM, temp services, dumpsters, scaffold, final clean",
        percentageBps: 357,
      }),
    ]);
    expect(
      gardenSuite.milestones.flatMap((milestone: any) =>
        milestone.submilestones.map((row: any) => row.name),
      ),
    ).not.toEqual(
      expect.arrayContaining([
        "Project subtotal (pre-contingency)",
        "HST  (D10)",
        "TOTAL INCL. HST",
        "NET ALL-IN (if rebate eligible)",
      ]),
    );
    expect(gardenSuite.scenarios[0]).toMatchObject({
      draws: [
        expect.objectContaining({ amountBps: 2603, timingDay: 48 }),
        expect.objectContaining({ amountBps: 2449, timingDay: 95 }),
        expect.objectContaining({ amountBps: 1955, timingDay: 142 }),
        expect.objectContaining({ amountBps: 2306, timingDay: 192 }),
        expect.objectContaining({ amountBps: 687, timingDay: 218 }),
      ],
      isActive: true,
      scenarioKey: "garden-suite-standard-reimbursement",
    });
    expect(
      gardenSuite.scenarios[0].draws.reduce(
        (total: number, draw: any) => total + draw.amountBps,
        0,
      ),
    ).toBe(10_000);

    const secondResult = await t.mutation(
      (api as any).production_proposals.seedProductionDefaultsToProd,
      { workosOrganizationId: ORG },
    );
    expect(secondResult).toMatchObject({
      milestones: 45,
      templates: 5,
    });
    const secondSettings = await t.query(
      (api as any).production_proposals.getProductionProposalSettings,
      { workosOrganizationId: ORG },
    );
    expect(
      secondSettings.templates.find(
        (template: any) => template.templateKey === "single-family-full-build",
      ).milestones,
    ).toHaveLength(7);
  });

  test("saves production template settings through the timeline settings workspace shape", async () => {
    const { t } = await seeded(["admin"], "user_admin");
    await t.mutation(
      (api as any).production_proposals.seedProductionDefaultsToProd,
      { workosOrganizationId: ORG },
    );
    const settings = await t.query(
      (api as any).production_proposals.getProductionProposalSettings,
      { workosOrganizationId: ORG },
    );
    const fullBuild = settings.templates.find(
      (template: any) => template.templateKey === "single-family-full-build",
    );
    const [standardScenario, ...otherScenarios] = fullBuild.scenarios;

    await t.mutation(
      (api as any).production_proposals
        .saveProductionProposalTemplateConfiguration,
      {
        milestones: fullBuild.milestones.map(
          (milestone: any, index: number) => ({
            dependencyKeys: milestone.dependencyKeys,
            durationDays:
              milestone.key === "site-prep" ? 15 : milestone.durationDays,
            icon: milestone.icon,
            included: true,
            milestoneKey: milestone.key,
            name:
              milestone.key === "site-prep"
                ? "Site prep, utilities & foundation"
                : milestone.name,
            order: index,
            percentageBps: milestone.percentageBps,
            siteVisitGuidance: milestone.siteVisitGuidance,
            submilestones: milestone.submilestones.map(
              (submilestone: any, subIndex: number) => ({
                description: submilestone.description,
                durationDays: submilestone.durationDays,
                name: submilestone.name,
                order: subIndex,
                percentageBps: submilestone.percentageBps,
                submilestoneKey: submilestone.key,
              }),
            ),
            type: milestone.archetypeKey,
          }),
        ),
        scenarios: [
          {
            description: "Backoffice-reviewed reimbursement cadence.",
            draws: standardScenario.draws.map((draw: any) => ({
              amountBps: draw.amountBps,
              drawKey: draw.drawKey,
              label: draw.label,
              order: draw.order,
              reviewNote:
                draw.drawKey === "draw-01"
                  ? "Foundation completion and utility tie-in verified."
                  : draw.reviewNote,
              timingDay: draw.timingDay,
            })),
            isActive: true,
            isDefault: standardScenario.isDefault,
            name: "Standard reimbursement updated",
            scenarioKey: standardScenario.scenarioKey,
            sortOrder: standardScenario.sortOrder,
          },
          ...otherScenarios.map((scenario: any) => ({
            description: scenario.description,
            draws: scenario.draws.map((draw: any) => ({
              amountBps: draw.amountBps,
              drawKey: draw.drawKey,
              label: draw.label,
              order: draw.order,
              reviewNote: draw.reviewNote,
              timingDay: draw.timingDay,
            })),
            isActive: false,
            isDefault: scenario.isDefault,
            name: scenario.name,
            scenarioKey: scenario.scenarioKey,
            sortOrder: scenario.sortOrder,
          })),
        ],
        template: {
          description: fullBuild.description,
          isDefault: fullBuild.isDefault,
          summary: fullBuild.summary,
          templateKey: fullBuild.templateKey,
          title: fullBuild.title,
        },
        workosOrganizationId: ORG,
      },
    );

    const updated = await t.query(
      (api as any).production_proposals.getProductionProposalSettings,
      { workosOrganizationId: ORG },
    );
    const updatedFullBuild = updated.templates.find(
      (template: any) => template.templateKey === "single-family-full-build",
    );
    expect(updatedFullBuild.milestones[0]).toMatchObject({
      durationDays: 15,
      key: "site-prep",
      name: "Site prep, utilities & foundation",
    });
    expect(updatedFullBuild.scenarios[0]).toMatchObject({
      description: "Backoffice-reviewed reimbursement cadence.",
      isActive: true,
      name: "Standard reimbursement updated",
    });
    expect(updatedFullBuild.scenarios[0].draws[0]).toMatchObject({
      reviewNote: "Foundation completion and utility tie-in verified.",
    });

    const audits = await t.run(async (ctx: any) =>
      ctx.db
        .query("auditEvents")
        .withIndex("by_entity", (q: any) =>
          q
            .eq("entityType", "productionProposalSettings")
            .eq("entityId", "single-family-full-build"),
        )
        .collect(),
    );
    expect(audits.map((event: any) => event.eventType)).toContain(
      "production_settings.template_configuration_saved",
    );
  });

  test("allows principal brokers to create entirely new production proposal templates", async () => {
    const { base, t: admin } = await seeded(["admin"], "user_admin");
    await admin.mutation(
      (api as any).production_proposals.seedProductionDefaultsToProd,
      { workosOrganizationId: ORG },
    );
    await grantOrgMembership(admin, {
      roleSlugs: ["principle-broker"],
      subject: "user_principal",
    });
    const principalBroker = withIdentity(
      base,
      ["principal-broker"],
      "user_principal",
    );
    const settings = await principalBroker.query(
      (api as any).production_proposals.getProductionProposalSettings,
      { workosOrganizationId: ORG },
    );
    const source = settings.templates.find(
      (template: any) => template.templateKey === "single-family-full-build",
    );

    await principalBroker.mutation(
      (api as any).production_proposals.createProductionProposalTemplate,
      {
        ...productionTemplateSettingsArgs(source),
        template: {
          description:
            "Ground-up infill rowhouse template created from backoffice settings.",
          isDefault: false,
          summary: "Custom rowhouse template for urban infill projects.",
          templateKey: "urban-infill-rowhouse",
          title: "Urban Infill Rowhouse",
        },
      },
    );

    const updated = await principalBroker.query(
      (api as any).production_proposals.getProductionProposalSettings,
      { workosOrganizationId: ORG },
    );
    const created = updated.templates.find(
      (template: any) => template.templateKey === "urban-infill-rowhouse",
    );
    expect(created).toMatchObject({
      isDefault: false,
      summary: "Custom rowhouse template for urban infill projects.",
      templateKey: "urban-infill-rowhouse",
      title: "Urban Infill Rowhouse",
    });
    expect(created.milestones).toHaveLength(source.milestones.length);
    expect(created.scenarios).toHaveLength(source.scenarios.length);

    const audits = await admin.run(async (ctx: any) =>
      ctx.db
        .query("auditEvents")
        .withIndex("by_entity", (q: any) =>
          q
            .eq("entityType", "productionProposalSettings")
            .eq("entityId", "urban-infill-rowhouse"),
        )
        .collect(),
    );
    expect(audits.map((event: any) => event.eventType)).toContain(
      "production_settings.template_created",
    );
  });

  test("rejects ordinary brokers creating production proposal templates", async () => {
    const { base, t: admin } = await seeded(["admin"], "user_admin");
    await admin.mutation(
      (api as any).production_proposals.seedProductionDefaultsToProd,
      { workosOrganizationId: ORG },
    );
    const broker = withIdentity(base, ["broker"], "user_broker");
    const settings = await broker.query(
      (api as any).production_proposals.getProductionProposalSettings,
      { workosOrganizationId: ORG },
    );
    const source = settings.templates.find(
      (template: any) => template.templateKey === "single-family-full-build",
    );

    await expect(
      broker.mutation(
        (api as any).production_proposals.createProductionProposalTemplate,
        {
          ...productionTemplateSettingsArgs(source),
          template: {
            description:
              "Broker-created template should not pass approval-role gates.",
            isDefault: false,
            summary: "Unauthorized broker template.",
            templateKey: "unauthorized-broker-template",
            title: "Unauthorized Broker Template",
          },
        },
      ),
    ).rejects.toThrow(/Forbidden: role/);
  });

  test("rejects production draw timing inside unfinished milestone windows", async () => {
    const { t } = await seeded(["admin"], "user_admin");
    await t.mutation(
      (api as any).production_proposals.seedProductionDefaultsToProd,
      { workosOrganizationId: ORG },
    );
    const settings = await t.query(
      (api as any).production_proposals.getProductionProposalSettings,
      { workosOrganizationId: ORG },
    );
    const fullBuild = settings.templates.find(
      (template: any) => template.templateKey === "single-family-full-build",
    );
    const invalidScenarios = fullBuild.scenarios.map(
      (scenario: any, scenarioIndex: number) => ({
        ...scenario,
        draws: scenario.draws.map((draw: any, drawIndex: number) =>
          scenarioIndex === 0 && drawIndex === 0
            ? { ...draw, timingDay: 10 }
            : draw,
        ),
      }),
    );

    await expect(
      t.mutation(
        (api as any).production_proposals
          .saveProductionProposalTemplateConfiguration,
        productionTemplateSettingsArgs(fullBuild, invalidScenarios),
      ),
    ).rejects.toThrow(
      "Reimbursement draws must be scheduled after completed work",
    );
  });

  test("warns when a planned draw schedule is above the lender facility", async () => {
    const { seed, t } = await seeded(["admin"], "user_admin");
    const proposalId = await t.mutation(
      (api as any).production_proposals.createDraftProposal,
      {
        brokerageId: seed.brokerageId,
        builderProfileId: seed.builderProfileId,
        buildName: "Over-facility proposal",
        location: "42 Constraint Road",
        workosOrganizationId: ORG,
      },
    );

    const result = await t.mutation(
      (api as any).production_proposals.saveDraftProposalPackage,
      {
        borrowerCoPayBps: 2_000,
        borrowerWorkingCapitalLimitCents: 25_000_000,
        draws: [
          {
            amountCents: 90_000_000,
            drawKey: "over-facility-draw",
            label: "Over-facility draw",
            milestoneKey: "foundation",
            order: 1,
            timingDay: 20,
          },
        ],
        lenderDrawPolicyLimitCents: 80_000_000,
        milestones: [
          {
            budgetCents: 100_000_000,
            dayEnd: 20,
            dayStart: 0,
            dependencyKeys: [],
            durationDays: 20,
            key: "foundation",
            name: "Foundation",
            order: 1,
            submilestones: [],
          },
        ],
        proposalId,
        workosOrganizationId: ORG,
      },
    );
    expect(result.warnings).toContain(
      "Planned draws exceed the lender facility. Revise the draw schedule or obtain an approved facility change.",
    );
  });

  test("warns when a planned reimbursement is before its milestone is complete", async () => {
    const { seed, t } = await seeded(["admin"], "user_admin");
    const proposalId = await t.mutation(
      (api as any).production_proposals.createDraftProposal,
      {
        brokerageId: seed.brokerageId,
        builderProfileId: seed.builderProfileId,
        buildName: "Premature reimbursement proposal",
        location: "44 Completion Road",
        workosOrganizationId: ORG,
      },
    );

    const result = await t.mutation(
      (api as any).production_proposals.saveDraftProposalPackage,
      {
        borrowerCoPayBps: 2_000,
        borrowerWorkingCapitalLimitCents: 25_000_000,
        draws: [
          {
            amountCents: 80_000_000,
            drawKey: "premature-draw",
            label: "Premature draw",
            milestoneKey: "foundation",
            order: 1,
            timingDay: 19,
          },
        ],
        lenderDrawPolicyLimitCents: 80_000_000,
        milestones: [
          {
            budgetCents: 100_000_000,
            dayEnd: 20,
            dayStart: 0,
            dependencyKeys: [],
            durationDays: 20,
            key: "foundation",
            name: "Foundation",
            order: 1,
            submilestones: [],
          },
        ],
        proposalId,
        workosOrganizationId: ORG,
      },
    );
    expect(result.warnings).toContain(
      "Planned reimbursements are scheduled before their milestone is complete.",
    );
  });

  test("warns when planned draws are above cumulative completed-work eligibility", async () => {
    const { seed, t } = await seeded(["admin"], "user_admin");
    const proposalId = await t.mutation(
      (api as any).production_proposals.createDraftProposal,
      {
        brokerageId: seed.brokerageId,
        builderProfileId: seed.builderProfileId,
        buildName: "Unearned reimbursement proposal",
        location: "46 Eligibility Road",
        workosOrganizationId: ORG,
      },
    );

    const result = await t.mutation(
      (api as any).production_proposals.saveDraftProposalPackage,
      {
        borrowerCoPayBps: 2_000,
        borrowerWorkingCapitalLimitCents: 25_000_000,
        draws: [
          {
            amountCents: 50_000_000,
            drawKey: "unearned-draw",
            label: "Unearned draw",
            milestoneKey: "foundation",
            order: 1,
            timingDay: 20,
          },
        ],
        lenderDrawPolicyLimitCents: 80_000_000,
        milestones: [
          {
            budgetCents: 50_000_000,
            dayEnd: 20,
            dayStart: 0,
            dependencyKeys: [],
            durationDays: 20,
            key: "foundation",
            name: "Foundation",
            order: 1,
            submilestones: [],
          },
          {
            budgetCents: 50_000_000,
            dayEnd: 48,
            dayStart: 24,
            dependencyKeys: ["foundation"],
            durationDays: 24,
            key: "framing",
            name: "Framing",
            order: 2,
            submilestones: [],
          },
        ],
        proposalId,
        workosOrganizationId: ORG,
      },
    );
    expect(result.warnings).toContain(
      "Planned draws exceed cumulative completed-work eligibility.",
    );
  });

  test("includes additive package cost items in completed-work draw eligibility", async () => {
    const { seed, t } = await seeded(["admin"], "user_admin");
    const proposalId = await t.mutation(
      (api as any).production_proposals.createDraftProposal,
      {
        brokerageId: seed.brokerageId,
        builderProfileId: seed.builderProfileId,
        buildName: "Additive eligibility proposal",
        location: "48 Eligibility Road",
        workosOrganizationId: ORG,
      },
    );

    await expect(
      t.mutation(
        (api as any).production_proposals.saveDraftProposalPackage,
        {
          borrowerCoPayBps: 2_000,
          borrowerWorkingCapitalLimitCents: 25_000_000,
          costItems: [
            {
              budgetSubmilestoneKey: "forms",
              budgetTreatment: "add",
              costCents: 12_500_000,
              itemType: "material",
              milestoneKey: "foundation",
              quantity: 1,
              relevantSubmilestoneKeys: ["forms"],
              title: "Added concrete package",
            },
          ],
          draws: [
            {
              amountCents: 50_000_000,
              drawKey: "foundation-draw",
              label: "Foundation reimbursement",
              milestoneKey: "foundation",
              order: 1,
              timingDay: 20,
            },
          ],
          lenderDrawPolicyLimitCents: 80_000_000,
          milestones: [
            {
              budgetCents: 50_000_000,
              dayEnd: 20,
              dayStart: 0,
              dependencyKeys: [],
              durationDays: 20,
              key: "foundation",
              name: "Foundation",
              order: 1,
              submilestones: [
                {
                  budgetCents: 50_000_000,
                  durationDays: 20,
                  key: "forms",
                  name: "Forms and pour",
                  order: 1,
                },
              ],
            },
          ],
          proposalId,
          workosOrganizationId: ORG,
        },
      ),
    ).resolves.toEqual({ warnings: [] });

    const detail = await t.query(
      (api as any).production_proposals.getProposalDetail,
      { proposalId, workosOrganizationId: ORG },
    );
    expect(detail.proposal.totalBudgetCents).toBe(62_500_000);
    expect(detail.draws[0].amountCents).toBe(50_000_000);
  });

  test("persists provided template scenario draws instead of milestone fallback draws", async () => {
    const { seed, t } = await seeded(["admin"], "user_admin");
    const proposalId = await t.mutation(
      (api as any).production_proposals.createDraftProposal,
      {
        brokerageId: seed.brokerageId,
        builderProfileId: seed.builderProfileId,
        buildName: "Scenario draw proposal",
        location: "44 Scenario Road",
        workosOrganizationId: ORG,
      },
    );

    await t.mutation(
      (api as any).production_proposals.saveDraftProposalPackage,
      {
        borrowerCoPayBps: 2_000,
        borrowerWorkingCapitalLimitCents: 25_000_000,
        draws: [
          {
            amountCents: 30_000_000,
            drawKey: "scenario-draw-01",
            label: "Scenario draw 01",
            milestoneKey: "foundation",
            order: 1,
            timingDay: 20,
          },
          {
            amountCents: 50_000_000,
            drawKey: "scenario-draw-02",
            label: "Scenario draw 02",
            milestoneKey: "framing",
            order: 2,
            timingDay: 48,
          },
        ],
        lenderDrawPolicyLimitCents: 80_000_000,
        milestones: [
          {
            budgetCents: 50_000_000,
            dayEnd: 20,
            dayStart: 0,
            dependencyKeys: [],
            durationDays: 20,
            key: "foundation",
            name: "Foundation",
            order: 1,
            submilestones: [],
          },
          {
            budgetCents: 75_000_000,
            dayEnd: 48,
            dayStart: 24,
            dependencyKeys: ["foundation"],
            durationDays: 24,
            key: "framing",
            name: "Framing",
            order: 2,
            submilestones: [],
          },
        ],
        proposalId,
        workosOrganizationId: ORG,
      },
    );

    const detail = await t.query(
      (api as any).production_proposals.getProposalDetail,
      { proposalId, workosOrganizationId: ORG },
    );

    expect(detail.draws.map((draw: any) => draw.drawKey)).toEqual([
      "scenario-draw-01",
      "scenario-draw-02",
    ]);
  });

  test("hydrates a production proposal timeline workspace from production rows", async () => {
    const { seed, t } = await seeded(["admin"], "user_admin");
    const proposalId = await t.mutation(
      (api as any).production_proposals.createDraftProposal,
      {
        brokerageId: seed.brokerageId,
        builderProfileId: seed.builderProfileId,
        buildName: "Production timeline workspace",
        location: "88 Timeline Road",
        workosOrganizationId: ORG,
      },
    );

    await t.mutation(
      (api as any).production_proposals.saveDraftProposalPackage,
      {
        borrowerCoPayBps: 2_000,
        borrowerWorkingCapitalLimitCents: 25_000_000,
        lenderDrawPolicyLimitCents: 90_000_000,
        milestones: [
          {
            budgetCents: 50_000_000,
            dayEnd: 20,
            dayStart: 0,
            dependencyKeys: [],
            durationDays: 20,
            key: "foundation",
            name: "Foundation",
            order: 1,
            submilestones: [
              {
                budgetCents: 20_000_000,
                durationDays: 8,
                key: "forms",
                name: "Forms and pour",
                order: 1,
              },
            ],
          },
          {
            budgetCents: 75_000_000,
            dayEnd: 48,
            dayStart: 24,
            dependencyKeys: ["foundation"],
            durationDays: 24,
            key: "framing",
            name: "Framing",
            order: 2,
            submilestones: [
              {
                budgetCents: 30_000_000,
                durationDays: 10,
                key: "walls",
                name: "Wall framing",
                order: 1,
              },
            ],
          },
        ],
        proposalId,
        workosOrganizationId: ORG,
      },
    );

    const workspace = await t.query(
      (api as any).production_proposals.getProductionTimelineWorkspace,
      { proposalId, workosOrganizationId: ORG },
    );

    expect(workspace.plan).toMatchObject({
      borrowerCoPayBps: 2_000,
      currentDay: 0,
      rangeMin: 0,
      startingCashCents: 25_000_000,
    });
    expect(workspace.plan.rangeMax).toBeGreaterThanOrEqual(58);
    expect(workspace.proposal).toMatchObject({
      buildName: "Production timeline workspace",
      status: "draft",
    });
    expect(workspace.milestones).toHaveLength(2);
    expect(workspace.milestones[0]).toMatchObject({
      budgetCents: 20_000_000,
      drawAvailabilityCents: 16_000_000,
      icon: "foundation",
      milestoneKey: "foundation",
      status: "ready",
      submilestoneSnapshot: [
        {
          budgetCents: 20_000_000,
          durationDays: 8,
          key: "forms",
          name: "Forms and pour",
          order: 1,
        },
      ],
      x: 0,
    });
    expect(workspace.draws).toEqual([
      expect.objectContaining({
        amountCents: 16_000_000,
        drawKey: "draw-01",
        itemMilestoneKey: "foundation",
        x: 8,
      }),
      expect.objectContaining({
        amountCents: 24_000_000,
        drawKey: "draw-02",
        itemMilestoneKey: "framing",
        x: 34,
      }),
    ]);
    expect(workspace.capitalEvents).toEqual([
      expect.objectContaining({
        amountCents: 25_000_000,
        capitalEventKey: "borrower-reserve",
        eventKind: "cashInfusion",
        x: 0,
      }),
    ]);
  });

  test("persists production timeline evidence, completion, draw review, capital events, and audit events", async () => {
    const { seed, t } = await seeded(["admin"], "user_admin");
    const proposalId = await t.mutation(
      (api as any).production_proposals.createDraftProposal,
      {
        brokerageId: seed.brokerageId,
        builderProfileId: seed.builderProfileId,
        buildName: "Live production timeline",
        location: "101 Live Build Way",
        workosOrganizationId: ORG,
      },
    );

    await t.mutation(
      (api as any).production_proposals.saveDraftProposalPackage,
      {
        borrowerCoPayBps: 2_000,
        borrowerWorkingCapitalLimitCents: 30_000_000,
        documents: [
          {
            documentType: "permit",
            fileName: "permit.pdf",
            mimeType: "application/pdf",
            sizeBytes: 512,
          },
        ],
        lenderDrawPolicyLimitCents: 100_000_000,
        milestones: [
          {
            budgetCents: 50_000_000,
            dayEnd: 20,
            dayStart: 0,
            dependencyKeys: [],
            durationDays: 20,
            key: "foundation",
            name: "Foundation",
            order: 1,
            submilestones: [],
          },
        ],
        proposalId,
        workosOrganizationId: ORG,
      },
    );
    await submitProposalForTest(t, proposalId);
    await t.mutation((api as any).production_proposals.approveProposal, {
      proposalId,
      reason: "Ready for live draw controls.",
      workosOrganizationId: ORG,
    });

    await t.mutation(
      (api as any).production_proposals.createProductionTimelineCapitalEvent,
      {
        amountCents: 7_500_000,
        capitalEventKey: "weather-delay-cost",
        eventKind: "cost",
        label: "Weather delay capital spike",
        proposalId,
        workosOrganizationId: ORG,
        x: 12,
      },
    );
    await t.mutation(
      (api as any).production_proposals.createProductionTimelineCashInfusion,
      {
        amountCents: 8_000_000,
        cashInfusionKey: "owner-infusion-01",
        label: "Owner cash infusion",
        proposalId,
        workosOrganizationId: ORG,
        x: 13,
      },
    );
    await t.mutation(
      (api as any).production_proposals.createProductionTimelineEvidenceAsset,
      {
        asset: {
          evidenceKey: "foundation-photo-1",
          fileName: "foundation.jpg",
          label: "Foundation photo",
          milestoneKey: "foundation",
          mimeType: "image/jpeg",
          sizeBytes: 2048,
          tag: "Foundation",
        },
        proposalId,
        workosOrganizationId: ORG,
      },
    );
    await t.mutation(
      (api as any).production_proposals.submitProductionMilestoneCompletion,
      {
        actualCostCents: 52_500_000,
        completedDay: 21,
        milestoneKey: "foundation",
        note: "Foundation complete with signed inspection.",
        proposalId,
        workosOrganizationId: ORG,
      },
    );
    await t.mutation(
      (api as any).production_proposals.reviewProductionMilestoneCompletion,
      {
        milestoneKey: "foundation",
        note: "Inspection package accepted.",
        proposalId,
        status: "approved",
        workosOrganizationId: ORG,
      },
    );
    const siteVisit = await t.mutation(
      (api as any).production_proposals.requestProductionMilestoneSiteVisit,
      {
        includedMilestoneKeys: ["foundation"],
        milestoneKey: "foundation",
        note: "Verify footing photos against the permit package.",
        proposalId,
        requestedDay: 22,
        workosOrganizationId: ORG,
      },
    );
    await t.mutation(
      (api as any).production_proposals.recordProductionMilestoneSiteVisit,
      {
        milestoneKey: "foundation",
        note: "Inspector verified the poured footing scope.",
        proposalId,
        status: "complete",
        visitId: siteVisit.visitId,
        workosOrganizationId: ORG,
      },
    );
    await t.mutation(
      (api as any).production_proposals.submitProductionDrawRequest,
      {
        amountCents: 40_000_000,
        drawKey: "draw-01",
        note: "Requesting foundation reimbursement.",
        proposalId,
        workosOrganizationId: ORG,
        x: 22,
      },
    );
    await t.mutation(
      (api as any).production_proposals.reviewProductionDrawRequest,
      {
        drawKey: "draw-01",
        note: "Released after completion approval.",
        proposalId,
        status: "approved",
        workosOrganizationId: ORG,
      },
    );

    const workspace = await t.query(
      (api as any).production_proposals.getProductionTimelineWorkspace,
      { proposalId, workosOrganizationId: ORG },
    );
    expect(workspace.capitalEvents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          amountCents: 7_500_000,
          capitalEventKey: "weather-delay-cost",
          eventKind: "cost",
          x: 12,
        }),
        expect.objectContaining({
          amountCents: 8_000_000,
          capitalEventKey: "owner-infusion-01",
          eventKind: "cashInfusion",
          x: 13,
        }),
      ]),
    );
    expect(workspace.evidenceAssets).toEqual([
      expect.objectContaining({
        evidenceKey: "foundation-photo-1",
        fileName: "foundation.jpg",
        milestoneKey: "foundation",
        tag: "Foundation",
      }),
    ]);
    expect(workspace.milestones[0]).toMatchObject({
      completionClaim: {
        actualCost: 525_000,
        completedDay: 21,
        note: "Foundation complete with signed inspection.",
      },
      completionReview: {
        note: "Inspection package accepted.",
        siteVisit: expect.objectContaining({
          completedAt: expect.any(String),
          includedItemIds: ["foundation"],
          note: "Verify footing photos against the permit package.",
          recordNote: "Inspector verified the poured footing scope.",
          requestedDay: 22,
          status: "complete",
        }),
        status: "approved",
      },
      evidenceState: "Submitted package",
      status: "complete",
    });
    expect(workspace.draws[0]).toMatchObject({
      amountCents: 40_000_000,
      requestNote: "Requesting foundation reimbursement.",
      requestReviewNote: "Released after completion approval.",
      requestStatus: "approved",
      x: 22,
    });

    const detail = await t.query(
      (api as any).production_proposals.getProposalDetail,
      { proposalId, workosOrganizationId: ORG },
    );
    expect(detail.auditEvents.map((event: any) => event.eventType)).toEqual(
      expect.arrayContaining([
        "proposal.capital_event.created",
        "proposal.evidence.created",
        "proposal.milestone_completion.submitted",
        "proposal.milestone_completion.reviewed",
        "proposal.site_visit.requested",
        "proposal.site_visit.recorded",
        "proposal.draw_request.submitted",
        "proposal.draw_request.reviewed",
      ]),
    );
  });

  test("keeps proposal budget and approved amount aligned during pre-live planning edits", async () => {
    const { seed, t } = await seeded(["admin"], "user_admin");
    const proposalId = await t.mutation(
      (api as any).production_proposals.createDraftProposal,
      {
        brokerageId: seed.brokerageId,
        builderProfileId: seed.builderProfileId,
        buildName: "Pre-live budget planning",
        location: "22 Budget Lane",
        workosOrganizationId: ORG,
      },
    );

    await t.mutation(
      (api as any).production_proposals.saveDraftProposalPackage,
      {
        borrowerCoPayBps: 2_000,
        borrowerWorkingCapitalLimitCents: 30_000_000,
        documents: [
          {
            documentType: "permit",
            fileName: "permit.pdf",
            mimeType: "application/pdf",
            sizeBytes: 512,
          },
        ],
        lenderDrawPolicyLimitCents: 32_000_000,
        milestones: [
          {
            budgetCents: 40_000_000,
            dayEnd: 20,
            dayStart: 0,
            dependencyKeys: [],
            durationDays: 20,
            key: "foundation",
            name: "Foundation",
            order: 1,
            submilestones: [],
          },
        ],
        proposalId,
        workosOrganizationId: ORG,
      },
    );

    await t.mutation(
      (api as any).production_proposals.updateProductionTimelineMilestone,
      {
        budgetCents: 45_000_000,
        milestoneKey: "foundation",
        proposalId,
        workosOrganizationId: ORG,
      },
    );
    await t.mutation(
      (api as any).production_proposals.createProductionTimelineMilestone,
      {
        milestone: {
          budgetCents: 10_000_000,
          dayEnd: 36,
          dayStart: 22,
          durationDays: 14,
          evidenceState: "Draft package",
          milestoneKey: "framing",
          name: "Framing",
          order: 2,
          policyState: "Draft proposal policy",
          status: "ready",
          submilestones: [],
          x: 22,
        },
        proposalId,
        workosOrganizationId: ORG,
      },
    );
    await t.mutation(
      (api as any).production_proposals.createProductionTimelineCapitalEvent,
      {
        amountCents: 5_000_000,
        capitalEventKey: "utility-overrun",
        eventKind: "cost",
        label: "Utility overrun",
        proposalId,
        workosOrganizationId: ORG,
        x: 18,
      },
    );
    await t.mutation(
      (api as any).production_proposals.createProductionTimelineCashInfusion,
      {
        amountCents: 6_000_000,
        cashInfusionKey: "owner-cash",
        label: "Owner cash infusion",
        proposalId,
        workosOrganizationId: ORG,
        x: 19,
      },
    );

    let detail = await t.query(
      (api as any).production_proposals.getProposalDetail,
      { proposalId, workosOrganizationId: ORG },
    );
    expect(detail.proposal.totalBudgetCents).toBe(60_000_000);
    expect(detail.proposal.lenderDrawPolicyLimitCents).toBe(40_000_000);
    const drawAmountBeforeCoPayEdit = detail.draws[0].amountCents;
    expect(drawAmountBeforeCoPayEdit).toBe(32_000_000);

    await t.mutation(
      (api as any).production_proposals.updateProductionProposalCoPayAmount,
      {
        borrowerCoPayCents: 15_000_000,
        proposalId,
        workosOrganizationId: ORG,
      },
    );
    detail = await t.query(
      (api as any).production_proposals.getProposalDetail,
      {
        proposalId,
        workosOrganizationId: ORG,
      },
    );
    expect(detail.proposal.borrowerCoPayBps).toBe(2_500);
    expect(detail.proposal.borrowerCoPayCents).toBe(15_000_000);
    expect(detail.proposal.lenderDrawPolicyLimitCents).toBe(45_000_000);
    expect(detail.milestones[0].drawAvailabilityCents).toBe(33_750_000);
    expect(detail.draws[0].amountCents).toBe(drawAmountBeforeCoPayEdit);

    await t.mutation(
      (api as any).production_proposals.updateProductionProposalCoPayAmount,
      {
        borrowerCoPayCents: 12_345_678,
        proposalId,
        workosOrganizationId: ORG,
      },
    );
    detail = await t.query(
      (api as any).production_proposals.getProposalDetail,
      {
        proposalId,
        workosOrganizationId: ORG,
      },
    );
    expect(detail.proposal.borrowerCoPayBps).toBe(2_058);
    expect(detail.proposal.borrowerCoPayCents).toBe(12_345_678);
    expect(detail.proposal.lenderDrawPolicyLimitCents).toBe(47_652_000);

    await t.mutation(
      (api as any).production_proposals.updateProductionProposalCoPayAmount,
      {
        borrowerCoPayCents: 15_000_000,
        proposalId,
        workosOrganizationId: ORG,
      },
    );

    await t.mutation(
      (api as any).production_proposals.updateProductionProposalInterestRate,
      {
        interestAnnualBps: 1_050,
        proposalId,
        workosOrganizationId: ORG,
      },
    );
    detail = await t.query(
      (api as any).production_proposals.getProposalDetail,
      {
        proposalId,
        workosOrganizationId: ORG,
      },
    );
    expect(detail.proposal.interestAnnualBps).toBe(1_050);

    const drawAmountBeforeApprovedEdit = detail.draws[0].amountCents;
    const totalDrawAmountBeforeApprovedEdit = detail.draws.reduce(
      (total: number, draw: any) => total + draw.amountCents,
      0,
    );
    await t.mutation(
      (api as any).production_proposals.updateProductionProposalApprovedAmount,
      {
        approvedAmountCents: 30_000_000,
        proposalId,
        workosOrganizationId: ORG,
      },
    );
    detail = await t.query(
      (api as any).production_proposals.getProposalDetail,
      {
        proposalId,
        workosOrganizationId: ORG,
      },
    );
    expect(detail.proposal.lenderDrawPolicyLimitCents).toBe(
      totalDrawAmountBeforeApprovedEdit,
    );
    expect(detail.draws[0].amountCents).toBe(drawAmountBeforeApprovedEdit);

    await t.mutation(
      (api as any).production_proposals.updateProductionProposalApprovedAmount,
      {
        approvedAmountCents: 50_000_000,
        proposalId,
        workosOrganizationId: ORG,
      },
    );
    detail = await t.query(
      (api as any).production_proposals.getProposalDetail,
      {
        proposalId,
        workosOrganizationId: ORG,
      },
    );
    expect(detail.proposal.lenderDrawPolicyLimitCents).toBe(50_000_000);
    expect(detail.draws[0].amountCents).toBe(drawAmountBeforeApprovedEdit);

    await t.mutation(
      (api as any).production_proposals.updateProductionTimelineMilestone,
      {
        drawAvailabilityCents: 55_000_000,
        milestoneKey: "foundation",
        proposalId,
        workosOrganizationId: ORG,
      },
    );
    detail = await t.query(
      (api as any).production_proposals.getProposalDetail,
      {
        proposalId,
        workosOrganizationId: ORG,
      },
    );
    expect(detail.milestones[0].drawAvailabilityCents).toBe(55_000_000);
    expect(detail.draws[0].amountCents).toBe(drawAmountBeforeApprovedEdit);
    expect(detail.proposal.lenderDrawPolicyLimitCents).toBe(50_000_000);

    await t.mutation(
      (api as any).production_proposals.updateProductionTimelineDraw,
      {
        amountCents: 48_000_000,
        drawKey: detail.draws[0].drawKey,
        proposalId,
        workosOrganizationId: ORG,
      },
    );
    const workspace = await t.query(
      (api as any).production_proposals.getProductionTimelineWorkspace,
      {
        proposalId,
        workosOrganizationId: ORG,
      },
    );
    expect(workspace.milestones[0].drawAvailabilityCents).toBe(55_000_000);
    expect(workspace.draws[0].amountCents).toBe(48_000_000);

    await t.mutation(
      (api as any).production_proposals.updateProductionProposalCoPayAmount,
      {
        borrowerCoPayCents: 15_000_000,
        proposalId,
        workosOrganizationId: ORG,
      },
    );

    await t.mutation(
      (api as any).production_proposals.updateProductionTimelineCapitalEvent,
      {
        amountCents: 7_000_000,
        capitalEventKey: "utility-overrun",
        proposalId,
        workosOrganizationId: ORG,
      },
    );
    detail = await t.query(
      (api as any).production_proposals.getProposalDetail,
      {
        proposalId,
        workosOrganizationId: ORG,
      },
    );
    expect(detail.proposal.totalBudgetCents).toBe(62_000_000);
    expect(detail.proposal.lenderDrawPolicyLimitCents).toBe(56_000_000);

    await t.mutation(
      (api as any).production_proposals.updateProductionProposalApprovedAmount,
      {
        approvedAmountCents: 50_000_000,
        proposalId,
        workosOrganizationId: ORG,
      },
    );
    await t.mutation(
      (api as any).production_proposals.updateProductionTimelineCapitalEvent,
      {
        amountCents: 8_000_000,
        capitalEventKey: "utility-overrun",
        proposalId,
        workosOrganizationId: ORG,
      },
    );
    detail = await t.query(
      (api as any).production_proposals.getProposalDetail,
      {
        proposalId,
        workosOrganizationId: ORG,
      },
    );
    expect(detail.proposal.totalBudgetCents).toBe(63_000_000);
    expect(detail.proposal.lenderDrawPolicyLimitCents).toBe(56_000_000);

    await t.mutation(
      (api as any).production_proposals.updateProductionTimelineCapitalEvent,
      {
        capitalEventKey: "utility-overrun",
        eventKind: "cashInfusion",
        proposalId,
        workosOrganizationId: ORG,
      },
    );
    detail = await t.query(
      (api as any).production_proposals.getProposalDetail,
      {
        proposalId,
        workosOrganizationId: ORG,
      },
    );
    expect(detail.proposal.totalBudgetCents).toBe(55_000_000);
    expect(detail.proposal.lenderDrawPolicyLimitCents).toBe(56_000_000);
  });

  test("supports audited draft timeline edits and approved live-build modification requests", async () => {
    const { base, seed, t } = await seeded(["admin"], "user_admin");
    const proposalId = await t.mutation(
      (api as any).production_proposals.createDraftProposal,
      {
        brokerageId: seed.brokerageId,
        builderProfileId: seed.builderProfileId,
        buildName: "Editable production timeline",
        location: "44 Edit Lane",
        workosOrganizationId: ORG,
      },
    );

    await t.mutation(
      (api as any).production_proposals.saveDraftProposalPackage,
      {
        borrowerCoPayBps: 2_000,
        borrowerWorkingCapitalLimitCents: 35_000_000,
        documents: [
          {
            documentType: "permit",
            fileName: "permit.pdf",
            mimeType: "application/pdf",
            sizeBytes: 512,
          },
        ],
        lenderDrawPolicyLimitCents: 110_000_000,
        milestones: [
          {
            budgetCents: 40_000_000,
            dayEnd: 20,
            dayStart: 0,
            dependencyKeys: [],
            durationDays: 20,
            key: "foundation",
            name: "Foundation",
            order: 1,
            submilestones: [],
          },
        ],
        proposalId,
        workosOrganizationId: ORG,
      },
    );

    await t.mutation(
      (api as any).production_proposals.updateProductionTimelineMilestone,
      {
        budgetCents: 42_000_000,
        dayEnd: 22,
        dayStart: 1,
        durationDays: 21,
        milestoneKey: "foundation",
        name: "Foundation revised",
        proposalId,
        submilestones: [
          {
            budgetCents: 18_000_000,
            durationDays: 9,
            key: "forms",
            name: "Forms revised",
            order: 1,
            startDay: 3,
          },
        ],
        workosOrganizationId: ORG,
      },
    );
    await t.mutation(
      (api as any).production_proposals.createProductionTimelineMilestone,
      {
        milestone: {
          budgetCents: 30_000_000,
          dayEnd: 46,
          dayStart: 24,
          durationDays: 22,
          evidenceState: "Draft package",
          milestoneKey: "framing",
          name: "Framing",
          order: 2,
          policyState: "Draft proposal policy",
          status: "ready",
          submilestones: [
            {
              budgetCents: 30_000_000,
              durationDays: 22,
              key: "walls",
              name: "Wall framing",
              order: 1,
              startDay: 24,
            },
          ],
          x: 24,
        },
        proposalId,
        workosOrganizationId: ORG,
      },
    );
    await t.mutation(
      (api as any).production_proposals.createProductionTimelineDraw,
      {
        amountCents: 24_000_000,
        customDate: true,
        drawKey: "manual-draw-framing",
        itemMilestoneKey: "framing",
        label: "Manual framing draw",
        order: 2,
        proposalId,
        workosOrganizationId: ORG,
        x: 47,
      },
    );
    await t.mutation(
      (api as any).production_proposals.updateProductionTimelineDraw,
      {
        amountCents: 25_000_000,
        drawKey: "manual-draw-framing",
        label: "Manual framing reimbursement",
        proposalId,
        workosOrganizationId: ORG,
        x: 49,
      },
    );

    let workspace = await t.query(
      (api as any).production_proposals.getProductionTimelineWorkspace,
      { proposalId, workosOrganizationId: ORG },
    );
    expect(
      workspace.milestones.map((milestone: any) => milestone.milestoneKey),
    ).toEqual(["foundation", "framing"]);
    expect(workspace.milestones[0]).toMatchObject({
      budgetCents: 18_000_000,
      durationDays: 9,
      name: "Foundation revised",
      x: 3,
    });
    expect(workspace.draws).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          amountCents: 25_000_000,
          drawKey: "manual-draw-framing",
          itemMilestoneKey: "framing",
          label: "Manual framing reimbursement",
          x: 49,
        }),
      ]),
    );

    await t.mutation(
      (api as any).production_proposals.deleteProductionTimelineDraw,
      {
        drawKey: "manual-draw-framing",
        proposalId,
        workosOrganizationId: ORG,
      },
    );
    await t.mutation(
      (api as any).production_proposals.deleteProductionTimelineMilestone,
      {
        milestoneKey: "framing",
        proposalId,
        workosOrganizationId: ORG,
      },
    );
    workspace = await t.query(
      (api as any).production_proposals.getProductionTimelineWorkspace,
      { proposalId, workosOrganizationId: ORG },
    );
    expect(
      workspace.milestones.map((milestone: any) => milestone.milestoneKey),
    ).toEqual(["foundation"]);
    expect(workspace.draws.map((draw: any) => draw.drawKey)).not.toContain(
      "manual-draw-framing",
    );

    await submitProposalForTest(t, proposalId);
    const builder = withIdentity(base, ["builder"], "user_builder");
    await expect(
      builder.mutation(
        (api as any).production_proposals.updateProductionTimelineMilestone,
        {
          budgetCents: 43_000_000,
          milestoneKey: "foundation",
          proposalId,
          workosOrganizationId: ORG,
        },
      ),
    ).rejects.toThrow(/locked/);

    await t.mutation((api as any).production_proposals.approveProposal, {
      proposalId,
      reason: "Approve revised timeline.",
      workosOrganizationId: ORG,
    });
    const request = await builder.mutation(
      (api as any).production_proposals.requestProductionTimelineModification,
      {
        proposalId,
        reason: "Add porch scope after buyer selection.",
        requestedPayload: {
          milestone: {
            budgetCents: 12_000_000,
            dayEnd: 38,
            dayStart: 30,
            durationDays: 8,
            evidenceState: "Requested change",
            milestoneKey: "porch",
            name: "Porch allowance",
            order: 2,
            policyState: "Admin approval required",
            status: "ready",
            submilestones: [
              { key: "porch-scope", name: "Porch scope", order: 1 },
            ],
            x: 30,
          },
        },
        requestType: "createMilestone",
        workosOrganizationId: ORG,
      },
    );
    await t.mutation(
      (api as any).production_proposals
        .reviewProductionTimelineModificationRequest,
      {
        note: "Approved as buyer-paid change order.",
        requestId: request.requestId,
        status: "approved",
        workosOrganizationId: ORG,
      },
    );
    workspace = await t.query(
      (api as any).production_proposals.getProductionTimelineWorkspace,
      { proposalId, workosOrganizationId: ORG },
    );
    expect(workspace.modificationRequests[0]).toMatchObject({
      reviewNote: "Approved as buyer-paid change order.",
      status: "approved",
    });
    expect(
      workspace.milestones.map((milestone: any) => milestone.milestoneKey),
    ).toContain("porch");

    const detail = await t.query(
      (api as any).production_proposals.getProposalDetail,
      { proposalId, workosOrganizationId: ORG },
    );
    expect(detail.auditEvents.map((event: any) => event.eventType)).toEqual(
      expect.arrayContaining([
        "proposal.milestone.updated",
        "proposal.milestone.created",
        "proposal.draw.created",
        "proposal.draw.updated",
        "proposal.draw.deleted",
        "proposal.milestone.deleted",
        "proposal.modification.requested",
        "proposal.modification.reviewed",
      ]),
    );
  });

  test("materializes a full production active-build workspace with audited draw and milestone actions", async () => {
    const { base, seed, t } = await seeded(["admin"], "user_admin");
    const builder = withIdentity(base, ["builder"], "user_builder");
    const proposalId = await t.mutation(
      (api as any).production_proposals.createDraftProposal,
      {
        brokerageId: seed.brokerageId,
        builderProfileId: seed.builderProfileId,
        buildName: "Full active build workspace",
        location: "909 Workspace Court",
        locationLatitude: 43.2557,
        locationLongitude: -79.8711,
        locationPlaceId: "workspace-court-place",
        workosOrganizationId: ORG,
      },
    );

    await t.mutation(
      (api as any).production_proposals.saveDraftProposalPackage,
      {
        borrowerCoPayBps: 2_000,
        borrowerWorkingCapitalLimitCents: 35_000_000,
        documents: [
          {
            documentType: "permit",
            fileName: "workspace-permit.pdf",
            mimeType: "application/pdf",
            sizeBytes: 512,
          },
        ],
        lenderDrawPolicyLimitCents: 55_000_000,
        milestones: [
          {
            budgetCents: 50_000_000,
            dayEnd: 20,
            dayStart: 0,
            dependencyKeys: [],
            durationDays: 20,
            key: "foundation",
            name: "Foundation",
            order: 1,
            submilestones: [
              {
                budgetCents: 25_000_000,
                durationDays: 10,
                key: "excavation",
                name: "Excavation",
                order: 1,
              },
            ],
          },
        ],
        proposalId,
        workosOrganizationId: ORG,
      },
    );
    await t.mutation(
      (api as any).production_proposals.createProductionTimelineEvidenceAsset,
      {
        asset: {
          evidenceKey: "foundation-site-photo",
          fileName: "foundation-site-photo.jpg",
          label: "Foundation site photo",
          locationVerified: true,
          milestoneKey: "foundation",
          mimeType: "image/jpeg",
          sizeBytes: 2048,
          tag: "site-photo",
        },
        proposalId,
        workosOrganizationId: ORG,
      },
    );
    await submitProposalForTest(t, proposalId);
    await t.mutation((api as any).production_proposals.approveProposal, {
      proposalId,
      reason: "Ready for active build workspace.",
      workosOrganizationId: ORG,
    });
    const closing = await t.mutation(
      (api as any).production_proposals.recordOfflineClosing,
      {
        buildStartDate: "2026-08-01",
        loanFacility: {
          interestAnnualBps: 925,
          principalCents: 55_000_000,
        },
        proposalId,
        reason: "Loan closed offline.",
        workosOrganizationId: ORG,
      },
    );

    const principalRequestId = await builder.mutation(
      (api as any).production_proposals.requestActiveBuildFacilityChange,
      {
        buildId: closing.buildId,
        reason: "Framing quote increased after lender approval.",
        requestedPrincipalCents: 60_000_000,
        requestType: "principalIncrease",
        workosOrganizationId: ORG,
      },
    );
    await expect(
      builder.mutation(
        (api as any).production_proposals
          .reviewActiveBuildFacilityChangeRequest,
        {
          requestId: principalRequestId,
          status: "approved",
          workosOrganizationId: ORG,
        },
      ),
    ).rejects.toThrow(/role|permission|Forbidden/i);
    await t.mutation(
      (api as any).production_proposals.reviewActiveBuildFacilityChangeRequest,
      {
        note: "Approved within revised loan authority.",
        requestId: principalRequestId,
        status: "approved",
        workosOrganizationId: ORG,
      },
    );
    const extensionRequestId = await builder.mutation(
      (api as any).production_proposals.requestActiveBuildFacilityChange,
      {
        buildId: closing.buildId,
        reason: "Winter sequencing pushed exterior work.",
        requestedPaybackDate: "2027-10-01",
        requestType: "paybackExtension",
        workosOrganizationId: ORG,
      },
    );
    await t.mutation(
      (api as any).production_proposals.reviewActiveBuildFacilityChangeRequest,
      {
        note: "Extension accepted after broker review.",
        requestId: extensionRequestId,
        status: "approved",
        workosOrganizationId: ORG,
      },
    );

    await t.mutation((api as any).production_proposals.addActiveBuildNote, {
      body: "Internal lender note for the production workspace.",
      buildId: closing.buildId,
      visibility: "internal",
      workosOrganizationId: ORG,
    });
    await t.mutation((api as any).production_proposals.addActiveBuildDocument, {
      buildId: closing.buildId,
      documentType: "supporting",
      fileName: "inspection-scope.pdf",
      mimeType: "application/pdf",
      sizeBytes: 1024,
      workosOrganizationId: ORG,
    });
    const contractorId = await t.mutation(
      (api as any).production_proposals.createContractorProfile,
      {
        brokerageId: seed.brokerageId,
        email: "site-lead@example.com",
        name: "Site Lead Builders",
        trades: ["foundation"],
        workosOrganizationId: ORG,
      },
    );
    await t.mutation(
      (api as any).production_proposals.attachActiveBuildContractor,
      {
        buildId: closing.buildId,
        contractorId,
        role: "Foundation contractor",
        workosOrganizationId: ORG,
      },
    );
    await unlockActiveBuildMilestoneForDraw(t, closing.buildId);
    const drawReceipt = await t.mutation((api as any).production_proposals.requestActiveBuildDraw, {
      amountCents: 20_000_000,
      buildId: closing.buildId,
      drawKey: "draw-01",
      note: "Foundation reimbursement requested.",
      workosOrganizationId: ORG,
    });
    await t.mutation((api as any).production_proposals.startActiveBuildDrawReview, {
      buildId: closing.buildId,
      drawKey: drawReceipt.requestKey,
      workosOrganizationId: ORG,
    });
    await t.mutation(
      (api as any).production_proposals.submitActiveBuildDrawForAdmin,
      {
        buildId: closing.buildId,
        drawKey: drawReceipt.requestKey,
        note: "Evidence and policy review complete.",
        workosOrganizationId: ORG,
      },
    );
    await t.mutation((api as any).production_proposals.approveActiveBuildDraw, {
      buildId: closing.buildId,
      drawKey: drawReceipt.requestKey,
      note: "Approved for release after operations review.",
      workosOrganizationId: ORG,
    });
    await t.mutation((api as any).production_proposals.releaseActiveBuildDraw, {
      buildId: closing.buildId,
      drawKey: drawReceipt.requestKey,
      note: "Released after admin approval.",
      releaseDate: "2026-08-24",
      workosOrganizationId: ORG,
    });
    await t.mutation(
      (api as any).production_proposals.requestActiveBuildMilestoneInfo,
      {
        buildId: closing.buildId,
        milestoneKey: "foundation",
        note: "Add final inspection card.",
        workosOrganizationId: ORG,
      },
    );
    const siteVisit = await t.mutation(
      (api as any).production_proposals.assignActiveBuildSiteVisit,
      {
        buildId: closing.buildId,
        milestoneKey: "foundation",
        note: "Verify footing photo location.",
        requestedDay: 23,
        siteVisitGuidance: {
          cameraAngles:
            "<ul><li>Capture the complete formwork from the street.</li></ul>",
          whatToVerify:
            "<ul><li>Verify forms are complete and ready for the pour.</li></ul>",
        },
        submilestoneKeys: ["excavation"],
        workosOrganizationId: ORG,
      },
    );
    expect(siteVisit.url).toContain("/newsitevisit/");
    const tokenizedVisit = await t.query(
      (api as any).production_proposals.getActiveBuildSiteVisitByToken,
      {
        buildId: String(closing.buildId),
        token: siteVisit.visitId,
      },
    );
    expect(tokenizedVisit.permit).toMatchObject({
      fileName: "workspace-permit.pdf",
      kind: "permit",
      mimeType: "application/pdf",
    });
    expect(tokenizedVisit.build).toMatchObject({
      address: "909 Workspace Court",
      locationLatitude: 43.2557,
      locationLongitude: -79.8711,
    });
    expect(tokenizedVisit.targets).toEqual([
      expect.objectContaining({
        guidance: {
          cameraAngles:
            "<ul><li>Capture the complete formwork from the street.</li></ul>",
          whatToVerify:
            "<ul><li>Verify forms are complete and ready for the pour.</li></ul>",
        },
        milestoneKey: "foundation",
        submilestones: [{ key: "excavation", name: "Excavation" }],
      }),
    ]);
    const siteVisitRoster = await t.query(
      (api as any).production_proposals.listBrokerageSiteVisits,
      { workosOrganizationId: ORG },
    );
    expect(siteVisitRoster.summary.total).toBeGreaterThanOrEqual(1);
    expect(siteVisitRoster.visits).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          buildId: closing.buildId,
          milestoneKey: "foundation",
          operationalStatus: "open",
          visitId: siteVisit.visitId,
        }),
      ]),
    );
    expect(
      siteVisitRoster.builds.some(
        (group: { buildId: string }) => group.buildId === closing.buildId,
      ),
    ).toBe(true);
    await seedTokenizedSiteVisitEvidence(t, {
      buildId: String(closing.buildId),
      locationFailureReason: "Previously outside the site geofence.",
      token: siteVisit.visitId,
    });
    await t.mutation(
      (api as any).production_proposals
        .submitActiveBuildTokenizedSiteVisitReport,
      {
        buildId: String(closing.buildId),
        completionObserved: true,
        locationAttempt: {
          accuracyMeters: 12,
          attempted: true,
          attemptedAt: 1_721_234_567_890,
          latitude: 43.25571,
          longitude: -79.87109,
          permissionOutcome: "granted",
          verified: true,
        },
        missingPrerequisites: [],
        recommendedOutcome: "approve",
        reportNotes:
          "<p><strong>Inspector verified</strong> footing photo location.</p>",
        token: siteVisit.visitId,
      },
    );
    const adminInbox = await t.query(
      (api as any).production_proposals.listRecipientInbox,
      { workosOrganizationId: ORG },
    );
    expect(adminInbox.deliveries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          actionLabel: "Review site visit",
          actionRequired: true,
          href: `/backoffice/builds/${closing.buildId}?milestone=foundation&rail=open`,
          sourceLabel: "Site Visit Staff",
          title: "Foundation site visit submitted",
        }),
      ]),
    );
    const completedSiteVisitRoster = await t.query(
      (api as any).production_proposals.listBrokerageSiteVisits,
      { workosOrganizationId: ORG },
    );
    expect(completedSiteVisitRoster.visits).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          locationAttempt: {
            accuracyMeters: 12,
            attempted: true,
            attemptedAt: 1_721_234_567_890,
            distanceMeters: 1,
            geofenceRadiusMeters: 250,
            latitude: 43.25571,
            longitude: -79.87109,
            permissionOutcome: "granted",
            verified: true,
          },
          milestoneKey: "foundation",
          missingPrerequisites: [],
          operationalStatus: "complete",
          recordNote:
            "<p><strong>Inspector verified</strong> footing photo location.</p>",
          recordNoteFormat: "html",
          visitId: siteVisit.visitId,
        }),
      ]),
    );
    const persistedVisitEvidence = await t.run(async (ctx: any) => {
      const visit = await ctx.db
        .query("buildSiteVisits")
        .withIndex("by_visit", (q: any) => q.eq("visitId", siteVisit.visitId))
        .unique();
      return await ctx.db
        .query("buildEvidenceAssets")
        .withIndex("by_site_visit", (q: any) =>
          q.eq("siteVisitId", visit._id),
        )
        .unique();
    });
    expect(persistedVisitEvidence).toMatchObject({
      locationAccuracyMeters: 12,
      locationDistanceMeters: 1,
      locationGeofenceRadiusMeters: 250,
      locationVerified: true,
    });
    expect(persistedVisitEvidence).not.toHaveProperty(
      "locationFailureReason",
    );
    const replacementRequest = await t.mutation(
      (api as any).production_proposals
        .requestActiveBuildSiteVisitReplacementLink,
      {
        buildId: String(closing.buildId),
        reason: "Corrective work requires another site inspection.",
        token: siteVisit.visitId,
      },
    );
    expect(replacementRequest).toMatchObject({
      requested: true,
      reference: expect.stringMatching(/^SVR-[A-Z0-9]{8}$/),
    });
    const persistedReplacementRequest = await t.run(async (ctx: any) =>
      ctx.db
        .query("siteVisitLinkRecoveryRequests")
        .withIndex("by_reference", (q: any) =>
          q.eq("reference", replacementRequest.reference),
        )
        .unique(),
    );
    expect(persistedReplacementRequest).toMatchObject({
      buildId: String(closing.buildId),
      originalVisitId: siteVisit.visitId,
      reason: "Corrective work requires another site inspection.",
      source: "production",
      status: "pending",
      tokenState: "consumed",
    });
    const drawRoster = await t.query(
      (api as any).production_proposals.listBrokerageDraws,
      { workosOrganizationId: ORG },
    );
    expect(drawRoster.summary.total).toBeGreaterThanOrEqual(1);
    expect(drawRoster.draws).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          buildId: closing.buildId,
          drawKey: drawReceipt.requestKey,
          status: "released",
        }),
      ]),
    );
    expect(drawRoster.chartSeries.length).toBeGreaterThanOrEqual(1);
    expect(
      drawRoster.builds.some(
        (group: { buildId: string }) => group.buildId === closing.buildId,
      ),
    ).toBe(true);
    await t.mutation(
      (api as any).production_proposals.approveActiveBuildMilestone,
      {
        buildId: closing.buildId,
        milestoneKey: "foundation",
        note: "Milestone approved from production build detail.",
        workosOrganizationId: ORG,
      },
    );

    const workspace = await t.query(
      (api as any).production_proposals.getActiveBuildDetailByString,
      { buildId: String(closing.buildId), workosOrganizationId: ORG },
    );

    expect(workspace.sitePhotos).toEqual(
      expect.arrayContaining([
      expect.objectContaining({
        caption: "Foundation site photo",
        evidenceKey: "foundation-site-photo",
        locationVerified: true,
      }),
      ])
    );
    expect(workspace.documents.map((doc: any) => doc.fileName)).toEqual(
      expect.arrayContaining(["workspace-permit.pdf", "inspection-scope.pdf"]),
    );
    expect(workspace.notes.internal[0]).toMatchObject({
      body: "Internal lender note for the production workspace.",
      visibility: "internal",
    });
    expect(workspace.contractors[0]).toMatchObject({
      name: "Site Lead Builders",
      role: "Foundation contractor",
    });
    expect(workspace.draws[0]).toMatchObject({
      amountCents: 20_000_000,
      requestNote: "Foundation reimbursement requested.",
      requestReviewNote: "Approved for release after operations review.",
      releaseNote: "Released after admin approval.",
      status: "released",
    });
    expect(workspace.loanFacility).toMatchObject({
      paybackDate: "2027-10-01",
      principalCents: 60_000_000,
    });
    expect(workspace.facilityChangeRequests).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          requestType: "principalIncrease",
          status: "approved",
        }),
        expect.objectContaining({
          requestType: "paybackExtension",
          status: "approved",
        }),
      ]),
    );
    expect(workspace.milestones[0]).toMatchObject({
      completionReview: expect.objectContaining({
        note: "Milestone approved from production build detail.",
        siteVisit: expect.objectContaining({
          note: "Verify footing photo location.",
          recordNote:
            "<p><strong>Inspector verified</strong> footing photo location.</p>",
          recordNoteFormat: "html",
          requestedDay: 23,
          status: "complete",
        }),
        status: "approved",
      }),
      evidenceState: "Approved",
      status: "complete",
    });
    expect(workspace.quickActionEvents).toEqual([]);
    expect(JSON.stringify(workspace.auditEvents)).not.toMatch(
      /payloadPreview|requestId|stack|validator/i,
    );
    expect(
      workspace.auditEvents.every(
        (event: any) =>
          !event.beforeSummary?.startsWith("{") &&
          !event.afterSummary?.startsWith("{"),
      ),
    ).toBe(true);
    expect(JSON.stringify(workspace.auditEvents)).not.toMatch(
      /Previous state|Updated state/,
    );
    expect(
      workspace.auditEvents.some(
        (event: any) =>
          Array.isArray(event.changes) && event.changes.length > 0,
      ),
    ).toBe(true);
    expect(
      workspace.auditEvents.find(
        (event: any) => event.eventType === "active_build.draw.requested",
      ),
    ).toEqual(
      expect.objectContaining({
        changes: expect.arrayContaining([
          expect.objectContaining({ field: "Status" }),
        ]),
        reason: expect.any(String),
        warnings: expect.any(Array),
      }),
    );
    expect(workspace.auditEvents.map((event: any) => event.eventType)).toEqual(
      expect.arrayContaining([
        "active_build.created",
        "active_build.facility_change.requested",
        "active_build.facility_change.reviewed",
        "active_build.note.created",
        "active_build.document.created",
        "active_build.contractor.attached",
        "active_build.draw.requested",
        "active_build.draw.review_started",
        "active_build.draw.ready_for_admin",
        "active_build.draw.approved_for_release",
        "active_build.draw.released",
        "active_build.milestone.info_requested",
        "active_build.site_visit.requested",
        "active_build.site_visit.token_report_submitted",
        "active_build.milestone.approved",
      ]),
    );
  });

  test("projects build quick actions from unresolved domain state instead of audit payloads", async () => {
    const { base, seed, t: admin } = await seeded(["admin"], "user_admin");
    const closing = await createClosedSingleMilestoneBuild(admin, seed);
    const builder = withIdentity(base, ["builder"], "user_builder");

    await builder.mutation(
      (api as any).production_proposals.submitActiveBuildMilestoneCompletion,
      {
        actualCostCents: 50_000_000,
        actualStartedAt: Date.parse("2026-05-02T12:00:00.000Z"),
        buildId: closing.buildId,
        completedDay: 30,
        idempotencyKey: "quick-action-completion-001",
        milestoneKey: "foundation",
        note: "Foundation ready for review.",
        workosOrganizationId: ORG,
      },
    );

    const detail = await admin.query(
      (api as any).production_proposals.getActiveBuildDetailByString,
      { buildId: String(closing.buildId), workosOrganizationId: ORG },
    );

    expect(detail.quickActionEvents).toEqual([
      expect.objectContaining({
        actionLabel: "Review milestone",
        entityLabel: expect.stringContaining("Foundation"),
        entityType: "milestone",
        href: expect.stringMatching(/^\/backoffice\/builds\//),
        resolutionMode: "domain",
        sourceLabel: "Builder workspace",
        title: "Milestone completion awaiting review",
      }),
    ]);
    expect(JSON.stringify(detail.quickActionEvents)).not.toMatch(
      /payloadPreview|eventType|requestId|stack|validator|mutation/i,
    );
  });

  test("active build detail and timeline queries share one milestone summary contract for lifecycle, submilestones, assignments, and financial labels", async () => {
    const { base, seed, t } = await seeded(["admin"], "user_admin");
    const closing = await createClosedSingleMilestoneBuild(t, seed, {
      buildName: "Canonical milestone summary build",
      location: "18 Canonical Summary Lane",
      submilestones: [{ key: "forms", name: "Forms", order: 1 }],
    });
    const contractorId = await t.mutation(
      (api as any).production_proposals.createContractorProfile,
      {
        brokerageId: seed.brokerageId,
        email: "canonical-summary-contractor@example.com",
        name: "Canonical Summary Concrete",
        trades: ["foundation"],
        workosOrganizationId: ORG,
      },
    );
    await t.mutation(
      (api as any).production_proposals.attachActiveBuildContractor,
      {
        buildId: closing.buildId,
        contractorId,
        role: "Foundation crew",
        workosOrganizationId: ORG,
      },
    );
    await t.mutation(
      (api as any).production_proposals.assignActiveBuildContractorToMilestone,
      {
        buildId: closing.buildId,
        contractorId,
        milestoneKey: "foundation",
        role: "Foundation crew",
        workosOrganizationId: ORG,
      },
    );

    const builder = withIdentity(base, ["builder"], "user_builder");
    await builder.mutation(
      (api as any).production_proposals.updateActiveBuildSubmilestoneExecution,
      {
        actualCostCents: 47_500_000,
        actualStartedAt: Date.parse("2026-05-02T12:00:00.000Z"),
        buildId: closing.buildId,
        fieldNote: "Forms stripped and dimensions verified.",
        idempotencyKey: "summary-forms-completion-001",
        milestoneKey: "foundation",
        status: "complete",
        submilestoneKey: "forms",
        workosOrganizationId: ORG,
      },
    );
    await builder.mutation(
      (api as any).production_proposals.submitActiveBuildMilestoneCompletion,
      {
        actualCostCents: 48_000_000,
        actualStartedAt: Date.parse("2026-05-02T12:00:00.000Z"),
        buildId: closing.buildId,
        completedDay: 20,
        idempotencyKey: "summary-milestone-completion-001",
        milestoneKey: "foundation",
        note: "Builder submitted the foundation package.",
        workosOrganizationId: ORG,
      },
    );

    const detail = await t.query(
      (api as any).production_proposals.getActiveBuildDetailByString,
      { buildId: String(closing.buildId), workosOrganizationId: ORG },
    );
    const timeline = await t.query(
      (api as any).production_proposals.getActiveBuildTimelineWorkspace,
      { buildId: closing.buildId, workosOrganizationId: ORG },
    );
    const detailMilestone = detail.milestones.find(
      (milestone: any) => milestone.key === "foundation",
    );
    const timelineMilestone = timeline.milestones.find(
      (milestone: any) => milestone.milestoneKey === "foundation",
    );
    const assignmentCount = detail.milestoneContractorAssignments.filter(
      (assignment: any) => assignment.milestoneKey === "foundation",
    ).length;

    expect(detailMilestone).toBeTruthy();
    expect(detailMilestone.budgetCents).not.toBeUndefined();
    expect(detailMilestone.drawAvailabilityCents).not.toBeUndefined();
    expect(timelineMilestone).toMatchObject({
      budgetCents: detailMilestone.budgetCents,
      drawAvailabilityCents: detailMilestone.drawAvailabilityCents,
      submilestoneSnapshot: [
        expect.objectContaining({ key: "forms", name: "Forms" }),
      ],
    });
    expect(assignmentCount).toBe(1);
    expect(timelineMilestone).toMatchObject({
      assignmentCount,
      assignmentCoverage: "assigned",
      completedSubmilestoneCount: 1,
      lifecycleState: "completion_submitted",
      reconciliationIssues: [],
      reconciliationState: "consistent",
      submilestoneSnapshot: [
        expect.objectContaining({ key: "forms", status: "complete" }),
      ],
      totalSubmilestoneCount: 1,
    });
  });

  test("milestone completion is gated by persisted submilestone execution state", async () => {
    const { base, seed, t: admin } = await seeded(["admin"], "user_admin");
    const closing = await createClosedSingleMilestoneBuild(admin, seed, {
      buildName: "Strict submilestone completion build",
      location: "22 Completion Gate Road",
      submilestones: [{ key: "forms", name: "Forms", order: 1 }],
    });
    const builder = withIdentity(base, ["builder"], "user_builder");
    const completionArgs = {
      actualCostCents: 48_000_000,
      actualStartedAt: Date.parse("2026-05-02T12:00:00.000Z"),
      buildId: closing.buildId,
      completedDay: 20,
      idempotencyKey: "strict-milestone-completion-001",
      milestoneKey: "foundation",
      note: "Foundation ready for review.",
      workosOrganizationId: ORG,
    };

    await expect(
      builder.mutation(
        (api as any).production_proposals.submitActiveBuildMilestoneCompletion,
        completionArgs,
      ),
    ).rejects.toThrow(/complete every submilestone/i);

    await builder.mutation(
      (api as any).production_proposals.updateActiveBuildSubmilestoneExecution,
      {
        actualCostCents: 47_750_000,
        actualStartedAt: Date.parse("2026-05-02T12:00:00.000Z"),
        buildId: closing.buildId,
        fieldNote: "Forms removed; footing measurements match plan.",
        idempotencyKey: "strict-forms-completion-001",
        milestoneKey: "foundation",
        status: "complete",
        submilestoneKey: "forms",
        workosOrganizationId: ORG,
      },
    );
    await builder.mutation(
      (api as any).production_proposals.submitActiveBuildMilestoneCompletion,
      completionArgs,
    );

    const detail = await admin.query(
      (api as any).production_proposals.getActiveBuildDetailByString,
      { buildId: String(closing.buildId), workosOrganizationId: ORG },
    );
    expect(detail.submilestones[0]).toMatchObject({
      actualCostCents: 47_750_000,
      completedAt: expect.any(Number),
      completedByWorkosUserId: "user_builder",
      fieldNote: "Forms removed; footing measurements match plan.",
      status: "complete",
    });
    expect(detail.milestones[0]).toMatchObject({
      completionClaim: expect.objectContaining({
        note: "Foundation ready for review.",
        submittedAt: expect.any(String),
      }),
      progressPercent: 100,
    });
    expect(detail.auditEvents.map((event: any) => event.eventType)).toContain(
      "active_build.submilestone.execution_updated",
    );
  });

  test("site visit token mutations reject cross-build and cross-org mismatches before mutation while keeping visit identity bound", async () => {
    const otherOrg = "org_production_site_visit_other";
    const { seed, t } = await seeded(["admin"], "user_admin");
    const otherSeeded = await seeded(
      ["admin"],
      "user_admin_site_visit_other",
      otherOrg,
    );
    const primary = await createClosedSingleMilestoneBuild(t, seed, {
      buildName: "Primary token build",
      location: "27 Primary Token Way",
    });
    const secondary = await createClosedSingleMilestoneBuild(t, seed, {
      buildName: "Secondary token build",
      location: "29 Secondary Token Way",
    });
    const foreign = await createClosedSingleMilestoneBuild(
      otherSeeded.t,
      otherSeeded.seed,
      {
        buildName: "Foreign token build",
        location: "31 Foreign Token Way",
        workosOrganizationId: otherOrg,
      },
    );
    const primaryVisit = await t.mutation(
      (api as any).production_proposals.assignActiveBuildSiteVisit,
      {
        buildId: primary.buildId,
        milestoneKey: "foundation",
        note: "Inspect the primary build only.",
        requestedDay: 21,
        workosOrganizationId: ORG,
      },
    );

    const primaryTokenState = await t.query(
      (api as any).production_proposals.getActiveBuildSiteVisitByToken,
      {
        buildId: String(primary.buildId),
        token: primaryVisit.visitId,
      },
    );
    const crossBuildState = await t.query(
      (api as any).production_proposals.getActiveBuildSiteVisitByToken,
      {
        buildId: String(secondary.buildId),
        token: primaryVisit.visitId,
      },
    );
    const crossOrgState = await otherSeeded.t.query(
      (api as any).production_proposals.getActiveBuildSiteVisitByToken,
      {
        buildId: String(foreign.buildId),
        token: primaryVisit.visitId,
      },
    );

    expect(primaryTokenState).toMatchObject({
      available: true,
      build: {
        key: String(primary.buildId),
        name: "Primary token build",
        subtitle: "27 Primary Token Way",
      },
    });
    expect(primaryTokenState.targets).toEqual([
      expect.objectContaining({ milestoneKey: "foundation" }),
    ]);
    expect(primaryTokenState.visit).toMatchObject({
      evidencePackageId: primaryVisit.evidencePackageId,
      organizationId: ORG,
      workOrderId: primaryVisit.workOrderId,
    });
    expect(primaryVisit).toMatchObject({
      evidencePackageId: `EP-${String(primary.buildId)}-foundation`,
      workOrderId: `WO-${primaryVisit.visitId}`,
    });
    const visitDocumentId = await t.run(async (ctx: any) => {
      const visit = await ctx.db
        .query("buildSiteVisits")
        .withIndex("by_visit", (q: any) =>
          q.eq("visitId", primaryVisit.visitId),
        )
        .unique();
      await ctx.db.patch(visit._id, { workOrderId: "WO-tampered" });
      return visit._id;
    });
    const tamperedScopeState = await t.query(
      (api as any).production_proposals.getActiveBuildSiteVisitByToken,
      { buildId: String(primary.buildId), token: primaryVisit.visitId },
    );
    expect(tamperedScopeState).toMatchObject({
      available: false,
      reason: "not_found",
      status: "invalid",
    });
    await t.run((ctx: any) =>
      ctx.db.patch(visitDocumentId, { workOrderId: primaryVisit.workOrderId }),
    );
    expect(crossBuildState.available).toBe(false);
    expect(crossOrgState.available).toBe(false);

    await expect(
      t.mutation(
        (api as any).production_proposals
          .submitActiveBuildTokenizedSiteVisitReport,
        {
          buildId: String(primary.buildId),
          completionObserved: true,
          locationAttempt: {
            attempted: false,
            failureReason: "Location permission was unavailable.",
            permissionOutcome: "denied",
            verified: false,
          },
          missingPrerequisites: [],
          recommendedOutcome: "needs_information",
          reportNotes: "<p>Valid visit without uploaded evidence.</p>",
          token: primaryVisit.visitId,
        },
      ),
    ).rejects.toThrow(/uploaded evidence file is required/i);
    expect(
      await t.query(
        (api as any).production_proposals.getActiveBuildSiteVisitByToken,
        {
          buildId: String(primary.buildId),
          token: primaryVisit.visitId,
        },
      ),
    ).toMatchObject({ available: true });

    const before = await t.run(async (ctx: any) => {
      const visit = await ctx.db
        .query("buildSiteVisits")
        .withIndex("by_visit", (q: any) =>
          q.eq("visitId", primaryVisit.visitId),
        )
        .unique();
      const auditEvents = await ctx.db
        .query("auditEvents")
        .withIndex("by_entity", (q: any) =>
          q
            .eq("entityType", "activeBuild")
            .eq("entityId", String(primary.buildId)),
        )
        .collect();
      const outbox = await ctx.db.query("eventOutbox").collect();
      return {
        auditCount: auditEvents.filter(
          (event: any) =>
            event.eventType ===
            "active_build.site_visit.token_report_submitted",
        ).length,
        outboxCount: outbox.filter(
          (event: any) =>
            event.eventType ===
              "active_build.site_visit.token_report_submitted" &&
            String(event.relatedEntityId) === String(primary.buildId),
        ).length,
        visit,
      };
    });

    await expect(
      t.mutation(
        (api as any).production_proposals
          .submitActiveBuildTokenizedSiteVisitReport,
        {
          buildId: String(secondary.buildId),
          completionObserved: true,
          locationAttempt: {
            attempted: false,
            failureReason:
              "Location was not attempted for this invalid request.",
            permissionOutcome: "not_requested",
            verified: false,
          },
          missingPrerequisites: [],
          recommendedOutcome: "approve",
          reportNotes: "<p>Wrong build tamper attempt.</p>",
          token: primaryVisit.visitId,
        },
      ),
    ).rejects.toThrow(/site visit token/i);
    await expect(
      otherSeeded.t.mutation(
        (api as any).production_proposals
          .submitActiveBuildTokenizedSiteVisitReport,
        {
          buildId: String(foreign.buildId),
          completionObserved: true,
          locationAttempt: {
            attempted: false,
            failureReason:
              "Location was not attempted for this invalid request.",
            permissionOutcome: "not_requested",
            verified: false,
          },
          missingPrerequisites: [],
          recommendedOutcome: "approve",
          reportNotes: "<p>Wrong org tamper attempt.</p>",
          token: primaryVisit.visitId,
        },
      ),
    ).rejects.toThrow(/site visit token/i);

    const after = await t.run(async (ctx: any) => {
      const visit = await ctx.db
        .query("buildSiteVisits")
        .withIndex("by_visit", (q: any) =>
          q.eq("visitId", primaryVisit.visitId),
        )
        .unique();
      const auditEvents = await ctx.db
        .query("auditEvents")
        .withIndex("by_entity", (q: any) =>
          q
            .eq("entityType", "activeBuild")
            .eq("entityId", String(primary.buildId)),
        )
        .collect();
      const outbox = await ctx.db.query("eventOutbox").collect();
      return {
        auditCount: auditEvents.filter(
          (event: any) =>
            event.eventType ===
            "active_build.site_visit.token_report_submitted",
        ).length,
        outboxCount: outbox.filter(
          (event: any) =>
            event.eventType ===
              "active_build.site_visit.token_report_submitted" &&
            String(event.relatedEntityId) === String(primary.buildId),
        ).length,
        visit,
      };
    });

    expect(after.auditCount).toBe(before.auditCount);
    expect(after.outboxCount).toBe(before.outboxCount);
    expect(after.visit).toMatchObject({
      _id: before.visit?._id,
      buildId: primary.buildId,
      milestoneKey: "foundation",
      status: before.visit?.status,
      url: before.visit?.url,
      visitId: primaryVisit.visitId,
    });
  });

  test("starts active-build milestone work explicitly with audit history", async () => {
    const { base, seed, t } = await seeded(["admin"], "user_admin");
    const proposalId = await t.mutation(
      (api as any).production_proposals.createDraftProposal,
      {
        brokerageId: seed.brokerageId,
        builderProfileId: seed.builderProfileId,
        buildName: "Explicit work start active build",
        location: "12 Start Work Lane",
        workosOrganizationId: ORG,
      },
    );

    await t.mutation(
      (api as any).production_proposals.saveDraftProposalPackage,
      {
        borrowerCoPayBps: 2_000,
        borrowerWorkingCapitalLimitCents: 35_000_000,
        documents: [
          {
            documentType: "permit",
            fileName: "start-work-permit.pdf",
            mimeType: "application/pdf",
            sizeBytes: 512,
          },
        ],
        lenderDrawPolicyLimitCents: 55_000_000,
        milestones: [
          {
            budgetCents: 50_000_000,
            dayEnd: 20,
            dayStart: 0,
            dependencyKeys: [],
            durationDays: 20,
            key: "foundation",
            name: "Foundation",
            order: 1,
            submilestones: [],
          },
        ],
        proposalId,
        workosOrganizationId: ORG,
      },
    );
    await submitProposalForTest(t, proposalId);
    await t.mutation((api as any).production_proposals.approveProposal, {
      proposalId,
      reason: "Ready to close.",
      workosOrganizationId: ORG,
    });
    const closing = await t.mutation(
      (api as any).production_proposals.recordOfflineClosing,
      {
        buildStartDate: "2026-05-01",
        loanFacility: {
          interestAnnualBps: 925,
          principalCents: 55_000_000,
        },
        proposalId,
        reason: "Loan closed offline.",
        workosOrganizationId: ORG,
      },
    );

    const builder = withIdentity(base, ["builder"], "user_builder");
    const actualStartedAt = Date.parse("2026-05-03T14:30:00.000Z");
    const startArgs = {
      actualStartedAt,
      buildId: closing.buildId,
      idempotencyKey: "test-foundation-start-001",
      milestoneKey: "foundation",
      source: "milestone_detail" as const,
      workosOrganizationId: ORG,
    };
    const firstResult = await builder.mutation(
      (api as any).production_proposals.startActiveBuildMilestone,
      startArgs,
    );
    const replayResult = await builder.mutation(
      (api as any).production_proposals.startActiveBuildMilestone,
      startArgs,
    );

    const detail = await t.query(
      (api as any).production_proposals.getActiveBuildDetailByString,
      { buildId: String(closing.buildId), workosOrganizationId: ORG },
    );
    expect(firstResult).toMatchObject({ replayed: false });
    expect(replayResult).toEqual({ ...firstResult, replayed: true });
    expect(detail.milestones[0]).toMatchObject({
      actualStartedAt,
      startReportedAt: expect.any(Number),
      startedByWorkosUserId: "user_builder",
      startSource: "milestone_detail",
      status: "in_progress",
    });
    expect(detail.milestones[0].progressPercent).toBeUndefined();
    expect(detail.milestones[0].evidenceState).toBeUndefined();
    expect(detail.auditEvents.map((event: any) => event.eventType)).toContain(
      "milestone.started",
    );
    await t.run(async (ctx: any) => {
      const startEvents = await ctx.db
        .query("milestoneStartEvents")
        .withIndex("by_organization_idempotency", (q: any) =>
          q
            .eq("organizationId", ORG)
            .eq("idempotencyKey", "test-foundation-start-001"),
        )
        .collect();
      const outboxEvents = await ctx.db
        .query("eventOutbox")
        .withIndex("by_entity", (q: any) =>
          q
            .eq("relatedEntityType", "activeBuild")
            .eq("relatedEntityId", String(closing.buildId)),
        )
        .collect();
      expect(startEvents).toHaveLength(1);
      expect(startEvents[0]).toMatchObject({
        actualStartedAt,
        actorWorkosUserId: "user_builder",
        eventType: "started",
        milestoneKey: "foundation",
        source: "milestone_detail",
      });
      expect(
        outboxEvents.filter((event: any) => event.eventType === "milestone.started"),
      ).toHaveLength(1);
    });

    const workspace = await t.query(
      (api as any).production_proposals.getActiveBuildTimelineWorkspace,
      { buildId: closing.buildId, workosOrganizationId: ORG },
    );
    expect(workspace.milestones[0]).toMatchObject({
      milestoneKey: "foundation",
      status: "ready",
      tone: "warning",
    });
  });

  test("records backdated dependency exceptions without rewriting the roadmap and routes lender attention", async () => {
    const { base, seed, t: admin } = await seeded(["admin"], "user_admin");
    const closing = await createClosedSingleMilestoneBuild(admin, seed, {
      buildName: "Dependency exception build",
      milestones: [
        {
          budgetCents: 20_000_000,
          dayEnd: 10,
          dayStart: 0,
          dependencyKeys: [],
          durationDays: 10,
          key: "foundation",
          name: "Foundation",
          order: 1,
          submilestones: [],
        },
        {
          budgetCents: 30_000_000,
          dayEnd: 20,
          dayStart: 11,
          dependencyKeys: ["foundation"],
          durationDays: 10,
          key: "framing",
          name: "Framing",
          order: 2,
          submilestones: [],
        },
        {
          budgetCents: 15_000_000,
          dayEnd: 30,
          dayStart: 21,
          dependencyKeys: ["foundation"],
          durationDays: 10,
          key: "roofing",
          name: "Roofing",
          order: 3,
          submilestones: [],
        },
      ],
    });
    await grantOrgMembership(admin, {
      roleSlugs: ["broker-staff"],
      subject: "user_broker_staff",
    });
    await grantOrgMembership(admin, {
      roleSlugs: ["agent"],
      subject: "user_agent",
    });
    await admin.run(async (ctx: any) => {
      const build = await ctx.db.get(closing.buildId);
      await ctx.db.patch(build.proposalId, {
        assignedBrokerWorkosUserId: undefined,
      });
      await ctx.db.patch(build.brokerageId, {
        principalBrokerWorkosUserId: undefined,
      });
      const assignments = await ctx.db
        .query("buildBrokerAssignments")
        .withIndex("by_build", (query: any) =>
          query.eq("buildId", closing.buildId),
        )
        .collect();
      for (const assignment of assignments) {
        await ctx.db.delete(assignment._id);
      }
    });
    const builder = withIdentity(base, ["builder"], "user_builder");
    const actualStartedAt = Date.parse("2026-05-04T09:00:00.000Z");
    const input = {
      actualStartedAt,
      buildId: closing.buildId,
      idempotencyKey: "framing-dependency-start-001",
      milestoneKey: "framing",
      source: "gantt" as const,
      workosOrganizationId: ORG,
    };

    await expect(
      builder.mutation(
        (api as any).production_proposals.startActiveBuildMilestone,
        input,
      ),
    ).rejects.toThrow(/explain why work began/i);
    const serverNow = Date.now();
    const dateNow = vi.spyOn(Date, "now").mockReturnValue(serverNow);
    try {
      await expect(
        builder.mutation(
          (api as any).production_proposals.startActiveBuildMilestone,
          {
            ...input,
            actualStartedAt: serverNow + 1,
            dependencyOverrideReason: "Crew mobilized out of sequence.",
            idempotencyKey: "framing-future-start-001",
          },
        ),
      ).rejects.toThrow(/now or earlier/i);
    } finally {
      dateNow.mockRestore();
    }

    await builder.mutation(
      (api as any).production_proposals.startActiveBuildMilestone,
      {
        ...input,
        dependencyOverrideReason:
          "Crew mobilized while foundation inspection paperwork was closing.",
      },
    );
    await expect(
      builder.mutation(
        (api as any).production_proposals.startActiveBuildMilestone,
        {
          ...input,
          dependencyOverrideReason:
            "A different explanation must not reuse the original command key.",
        },
      ),
    ).rejects.toThrow(/idempotency key belongs to a different/i);

    const detail = await admin.query(
      (api as any).production_proposals.getActiveBuildDetailByString,
      { buildId: String(closing.buildId), workosOrganizationId: ORG },
    );
    expect(detail.milestones.find((row: any) => row.key === "framing")).toMatchObject({
      actualStartedAt,
      dayStart: 11,
      status: "in_progress",
    });
    expect(
      detail.milestones.find((row: any) => row.key === "framing")
        .progressPercent,
    ).toBeUndefined();
    expect(detail.milestones.find((row: any) => row.key === "foundation")).toMatchObject({
      dayStart: 0,
      status: "planned",
    });
    const brokerStaff = withIdentity(
      base,
      ["broker-staff"],
      "user_broker_staff",
    );
    const inbox = await brokerStaff.query(
      (api as any).production_proposals.listRecipientInbox,
      { workosOrganizationId: ORG },
    );
    expect(inbox.deliveries).toEqual([
      expect.objectContaining({
        actionRequired: true,
        entityId: String(closing.buildId),
        title: "Framing started out of sequence",
      }),
    ]);
    const agent = withIdentity(base, ["agent"], "user_agent");
    const agentInbox = await agent.query(
      (api as any).production_proposals.listRecipientInbox,
      { workosOrganizationId: ORG },
    );
    expect(agentInbox.deliveries).toHaveLength(0);

    await admin.run(async (ctx: any) => {
      const memberships = await ctx.db
        .query("workosOrganizationMemberships")
        .withIndex("by_organization", (query: any) =>
          query.eq("workosOrganizationId", ORG),
        )
        .collect();
      for (const membership of memberships) {
        await ctx.db.delete(membership._id);
      }
      const build = await ctx.db.get(closing.buildId);
      await ctx.db.patch(build.proposalId, {
        assignedBrokerWorkosUserId: "user_departed_broker",
      });
      await ctx.db.patch(build.brokerageId, {
        principalBrokerWorkosUserId: undefined,
      });
      const now = Date.now();
      await ctx.db.insert("workosOrganizationMemberships", {
        createdAt: now,
        directoryManaged: false,
        roleSlug: "broker",
        roleSlugs: ["broker"],
        sourceEventId: "test_membership_user_departed_broker",
        sourceEventType: "test.production_proposals",
        status: "inactive",
        updatedAt: now,
        workosMembershipId: "test_membership_user_departed_broker",
        workosOrganizationId: ORG,
        workosUserId: "user_departed_broker",
      });
    });
    await builder.mutation(
      (api as any).production_proposals.startActiveBuildMilestone,
      {
        actualStartedAt,
        buildId: closing.buildId,
        dependencyOverrideReason:
          "Roof crew mobilized while foundation closeout was pending.",
        idempotencyKey: "roofing-dependency-fallback-001",
        milestoneKey: "roofing",
        source: "gantt",
        workosOrganizationId: ORG,
      },
    );
    const fallback = await admin.run(async (ctx: any) =>
      ctx.db
        .query("operationsQueueHandoffs")
        .filter((query: any) =>
          query.eq(query.field("organizationId"), ORG),
        )
        .first(),
    );
    expect(fallback).toMatchObject({
      acknowledgementState: "pending_decision",
      requiredAction: "Review dependency exception",
      targetLabel: "Dependency exception build · Roofing",
    });
  });

  test("starts a builder submilestone with its planned parent atomically and preserves correction lineage", async () => {
    const { base, seed, t: admin } = await seeded(["admin"], "user_admin");
    const closing = await createClosedSingleMilestoneBuild(admin, seed, {
      submilestones: [{ key: "forms", name: "Forms", order: 1 }],
    });
    const builder = withIdentity(base, ["builder"], "user_builder");
    const initialStart = Date.parse("2026-05-03T08:00:00.000Z");
    const started = await builder.mutation(
      (api as any).production_proposals.startActiveBuildMilestone,
      {
        actualStartedAt: initialStart,
        buildId: closing.buildId,
        idempotencyKey: "forms-parent-child-start-001",
        milestoneKey: "foundation",
        source: "submilestone_ledger",
        startParent: true,
        submilestoneKey: "forms",
        workosOrganizationId: ORG,
      },
    );
    expect(started).toMatchObject({
      parentStarted: true,
      submilestoneKey: "forms",
    });
    expect(started.eventIds).toHaveLength(2);
    await expect(
      builder.mutation(
        (api as any).production_proposals.startActiveBuildMilestone,
        {
          actualStartedAt: initialStart,
          buildId: closing.buildId,
          idempotencyKey: "forms-parent-child-start-001",
          milestoneKey: "foundation",
          source: "submilestone_ledger",
          startParent: false,
          submilestoneKey: "forms",
          workosOrganizationId: ORG,
        },
      ),
    ).rejects.toThrow(/idempotency key belongs to a different/i);

    const correctedStart = Date.parse("2026-05-02T15:00:00.000Z");
    const firstCorrection = await builder.mutation(
      (api as any).production_proposals.correctActiveBuildMilestoneStart,
      {
        actualStartedAt: correctedStart,
        buildId: closing.buildId,
        idempotencyKey: "forms-start-correction-001",
        milestoneKey: "foundation",
        reason: "Crew log confirmed an earlier mobilization time.",
        source: "submilestone_detail",
        submilestoneKey: "forms",
        workosOrganizationId: ORG,
      },
    );
    const correctionReplay = await builder.mutation(
      (api as any).production_proposals.correctActiveBuildMilestoneStart,
      {
        actualStartedAt: correctedStart,
        buildId: closing.buildId,
        idempotencyKey: "forms-start-correction-001",
        milestoneKey: "foundation",
        reason: "Crew log confirmed an earlier mobilization time.",
        source: "submilestone_detail",
        submilestoneKey: "forms",
        workosOrganizationId: ORG,
      },
    );
    expect(firstCorrection).toMatchObject({ replayed: false });
    expect(correctionReplay).toEqual({
      ...firstCorrection,
      replayed: true,
    });
    await builder.mutation(
      (api as any).production_proposals.retractActiveBuildMilestoneStart,
      {
        buildId: closing.buildId,
        idempotencyKey: "forms-start-retraction-001",
        milestoneKey: "foundation",
        reason: "The crew log was attached to the wrong work scope.",
        source: "submilestone_detail",
        submilestoneKey: "forms",
        workosOrganizationId: ORG,
      },
    );

    await admin.run(async (ctx: any) => {
      const milestone = await ctx.db
        .query("buildMilestones")
        .withIndex("by_build_key", (query: any) =>
          query
            .eq("buildId", closing.buildId)
            .eq("key", "foundation"),
        )
        .unique();
      const submilestones = await ctx.db
        .query("buildSubmilestones")
        .withIndex("by_milestone", (query: any) =>
          query.eq("buildMilestoneId", milestone._id),
        )
        .collect();
      const events = await ctx.db
        .query("milestoneStartEvents")
        .withIndex("by_target", (query: any) =>
          query
            .eq("buildId", closing.buildId)
            .eq("milestoneKey", "foundation")
            .eq("submilestoneKey", "forms"),
        )
        .collect();
      expect(milestone).toMatchObject({
        actualStartedAt: initialStart,
        status: "in_progress",
      });
      expect(submilestones[0]).toMatchObject({ status: "planned" });
      expect(submilestones[0].actualStartedAt).toBeUndefined();
      expect(events.map((event: any) => event.eventType)).toEqual([
        "started",
        "start_corrected",
        "start_retracted",
      ]);
      expect(events[1].originalEventId).toBe(events[0]._id);
      expect(events[2].originalEventId).toBe(events[1]._id);
    });
  });

  test("reserves post-completion start amendments for Lender Admin", async () => {
    const { base, seed, t: admin } = await seeded(["admin"], "user_admin");
    const closing = await createClosedSingleMilestoneBuild(admin, seed);
    const builder = withIdentity(base, ["builder"], "user_builder");
    const actualStartedAt = Date.parse("2026-05-03T08:00:00.000Z");
    await builder.mutation(
      (api as any).production_proposals.startActiveBuildMilestone,
      {
        actualStartedAt,
        buildId: closing.buildId,
        idempotencyKey: "foundation-start-before-completion-001",
        milestoneKey: "foundation",
        source: "milestone_detail",
        workosOrganizationId: ORG,
      }
    );
    await admin.run(async (ctx: any) => {
      const milestone = await ctx.db
        .query("buildMilestones")
        .withIndex("by_build_key", (query: any) =>
          query.eq("buildId", closing.buildId).eq("key", "foundation")
        )
        .unique();
      await ctx.db.patch(milestone._id, { status: "complete" });
    });

    const correction = {
      actualStartedAt: actualStartedAt - 60 * 60 * 1000,
      buildId: closing.buildId,
      idempotencyKey: "foundation-post-completion-correction-001",
      milestoneKey: "foundation",
      reason: "Daily log confirmed an earlier mobilization time.",
      source: "milestone_detail" as const,
      workosOrganizationId: ORG,
    };
    await expect(
      builder.mutation(
        (api as any).production_proposals.correctActiveBuildMilestoneStart,
        correction
      )
    ).rejects.toThrow(/only Lender Admin/i);
    await admin.mutation(
      (api as any).production_proposals.correctActiveBuildMilestoneStart,
      correction
    );

    const milestone = await admin.run(async (ctx: any) =>
      ctx.db
        .query("buildMilestones")
        .withIndex("by_build_key", (query: any) =>
          query.eq("buildId", closing.buildId).eq("key", "foundation")
        )
        .unique()
    );
    expect(milestone).toMatchObject({
      actualStartedAt: correction.actualStartedAt,
      status: "complete",
    });
  });

  test("rejects correction commands for milestone and submilestone work that has never started", async () => {
    const { base, seed, t: admin } = await seeded(["admin"], "user_admin");
    const closing = await createClosedSingleMilestoneBuild(admin, seed, {
      submilestones: [{ key: "forms", name: "Forms", order: 1 }],
    });
    const builder = withIdentity(base, ["builder"], "user_builder");
    const common = {
      actualStartedAt: Date.parse("2026-05-02T15:00:00.000Z"),
      buildId: closing.buildId,
      milestoneKey: "foundation",
      reason: "Daily log correction.",
      source: "milestone_detail" as const,
      workosOrganizationId: ORG,
    };

    await expect(
      builder.mutation(
        (api as any).production_proposals.correctActiveBuildMilestoneStart,
        {
          ...common,
          idempotencyKey: "never-started-milestone-correction-001",
        },
      ),
    ).rejects.toThrow(/no recorded start to correct/i);
    await expect(
      builder.mutation(
        (api as any).production_proposals.correctActiveBuildMilestoneStart,
        {
          ...common,
          idempotencyKey: "never-started-submilestone-correction-001",
          submilestoneKey: "forms",
        },
      ),
    ).rejects.toThrow(/no recorded start to correct/i);
  });

  test("atomically catches up a missing actual start when completion is confirmed", async () => {
    const { base, seed, t: admin } = await seeded(["admin"], "user_admin");
    const closing = await createClosedSingleMilestoneBuild(admin, seed);
    const builder = withIdentity(base, ["builder"], "user_builder");
    const actualStartedAt = Date.parse("2026-05-03T08:00:00.000Z");
    const input = {
      actualCostCents: 42_000_000,
      actualStartedAt,
      buildId: closing.buildId,
      completedDay: 12,
      idempotencyKey: "foundation-completion-catch-up-001",
      milestoneKey: "foundation",
      note: "Completion and missing actual start confirmed together.",
      workosOrganizationId: ORG,
    };

    await builder.mutation(
      (api as any).production_proposals.submitActiveBuildMilestoneCompletion,
      input
    );
    await builder.mutation(
      (api as any).production_proposals.submitActiveBuildMilestoneCompletion,
      input
    );

    const state = await admin.run(async (ctx: any) => {
      const milestone = await ctx.db
        .query("buildMilestones")
        .withIndex("by_build_key", (query: any) =>
          query.eq("buildId", closing.buildId).eq("key", "foundation")
        )
        .unique();
      const starts = await ctx.db
        .query("milestoneStartEvents")
        .withIndex("by_build", (query: any) =>
          query.eq("buildId", closing.buildId)
        )
        .collect();
      const outbox = await ctx.db
        .query("eventOutbox")
        .filter((query: any) =>
          query.eq(query.field("organizationId"), ORG)
        )
        .collect();
      return { milestone, outbox, starts };
    });
    expect(state.milestone).toMatchObject({
      actualStartedAt,
      completionClaim: {
        completedDay: 12,
        idempotencyKey: "foundation-completion-catch-up-001",
      },
      startSource: "completion_catch_up",
    });
    expect(state.starts).toHaveLength(1);
    expect(
      state.outbox.filter(
        (event: any) => event.eventType === "milestone.started"
      )
    ).toHaveLength(1);
  });

  test("builder can create and attach a contractor to an owned active build", async () => {
    const { base, seed, t: admin } = await seeded(["admin"], "user_admin");
    const closing = await createClosedSingleMilestoneBuild(admin, seed);
    const builder = withIdentity(base, ["builder"], "user_builder");

    const result = await builder.mutation(
      (api as any).production_proposals.createAndAttachActiveBuildContractor,
      {
        buildId: closing.buildId,
        contractor: {
          capabilities: [
            {
              capabilityKey: "brick-siding",
              label: "Brick siding",
              trade: "masonry",
            },
          ],
          city: "Toronto",
          defaultPayRateCents: 0,
          defaultPayRateUnit: "hour",
          email: "zepplinf13@gmail.com",
          equipment: [
            { equipmentKey: "telehandler", name: "Telehandler", quantity: 1 },
          ],
          kind: "company",
          name: "TestContractor",
          phone: "416-555-0101",
          trades: ["Masonry"],
        },
        role: "masonry lead.",
        workosOrganizationId: ORG,
      },
    );

    const detail = await builder.query(
      (api as any).production_proposals.getActiveBuildDetailByString,
      { buildId: String(closing.buildId), workosOrganizationId: ORG },
    );
    expect(detail.contractors).toEqual([
      expect.objectContaining({
        contractorId: result.contractorId,
        email: "zepplinf13@gmail.com",
        name: "TestContractor",
        role: "masonry lead.",
        trades: ["Masonry"],
      }),
    ]);

    const profile = await admin.run((ctx: any) =>
      ctx.db.get(result.contractorId),
    );
    expect(profile).toMatchObject({
      city: "Toronto",
      normalizedEmail: "zepplinf13@gmail.com",
      source: "builder_created",
      status: "active",
    });
    const activeBuildEvents = await admin.run((ctx: any) =>
      ctx.db
        .query("auditEvents")
        .withIndex("by_entity", (q: any) =>
          q
            .eq("entityType", "activeBuild")
            .eq("entityId", String(closing.buildId)),
        )
        .collect(),
    );
    expect(activeBuildEvents.map((event: any) => event.command)).toContain(
      "createAndAttachActiveBuildContractor",
    );
  });

  test("builder can attach an existing production contractor to an owned active build", async () => {
    const { base, seed, t: admin } = await seeded(["admin"], "user_admin");
    const closing = await createClosedSingleMilestoneBuild(admin, seed);
    const contractorId = await admin.mutation(
      (api as any).production_proposals.createContractorProfile,
      {
        brokerageId: seed.brokerageId,
        city: "Toronto",
        email: "existing-masonry@example.com",
        kind: "company",
        name: "Existing Masonry Co",
        trades: ["masonry"],
        workosOrganizationId: ORG,
      },
    );
    const builder = withIdentity(base, ["builder"], "user_builder");

    await builder.mutation(
      (api as any).production_proposals.attachActiveBuildContractor,
      {
        buildId: closing.buildId,
        contractorId,
        role: "Masonry crew",
        workosOrganizationId: ORG,
      },
    );

    const detail = await builder.query(
      (api as any).production_proposals.getActiveBuildDetailByString,
      { buildId: String(closing.buildId), workosOrganizationId: ORG },
    );
    expect(detail.contractors).toEqual([
      expect.objectContaining({
        contractorId,
        lifecycleState: "attached",
        name: "Existing Masonry Co",
        role: "Masonry crew",
      }),
    ]);
  });

  test("authorized builder milestone assignment creates one pending acknowledgement and projects the linked contractor lifecycle", async () => {
    const { base, seed, t: admin } = await seeded(["admin"], "user_admin");
    const closing = await createClosedSingleMilestoneBuild(admin, seed);
    const contractorId = await admin.mutation(
      (api as any).production_proposals.createContractorProfile,
      {
        brokerageId: seed.brokerageId,
        email: "linked-assignment@example.com",
        kind: "company",
        name: "Linked Assignment Co",
        trades: ["foundation"],
        workosOrganizationId: ORG,
      },
    );
    await admin.run(async (ctx: any) => {
      await ctx.db.patch(contractorId, {
        accountWorkosUserId: "user_linked_assignment_contractor",
        onboardingStatus: "account_linked",
      });
      await ctx.db.insert("workosOrganizationMemberships", {
        roleSlug: "contractor",
        roleSlugs: ["contractor"],
        sourceEventId: "evt_linked_assignment_contractor",
        sourceEventType: "organization_membership.created",
        status: "active",
        workosMembershipId: "om_linked_assignment_contractor",
        workosOrganizationId: ORG,
        workosUserId: "user_linked_assignment_contractor",
      });
    });
    const builder = withIdentity(base, ["builder"], "user_builder");
    await builder.mutation(
      (api as any).production_proposals.attachActiveBuildContractor,
      {
        buildId: closing.buildId,
        contractorId,
        role: "Foundation crew",
        workosOrganizationId: ORG,
      },
    );

    const assignmentIds = await builder.mutation(
      (api as any).production_proposals.assignActiveBuildContractorToMilestone,
      {
        buildId: closing.buildId,
        contractorId,
        milestoneKey: "foundation",
        role: "Foundation crew",
        workosOrganizationId: ORG,
      },
    );

    const detail = await builder.query(
      (api as any).production_proposals.getActiveBuildDetailByString,
      { buildId: String(closing.buildId), workosOrganizationId: ORG },
    );
    const acknowledgements = await admin.run(async (ctx: any) =>
      ctx.db
        .query("contractorAcknowledgements")
        .withIndex("by_build_assignment", (q: any) =>
          q.eq("buildAssignmentId", assignmentIds[0]),
        )
        .collect(),
    );

    expect(detail.contractors).toEqual([
      expect.objectContaining({
        contractorId,
        lifecycleState: "acknowledgement_pending",
      }),
    ]);
    expect(acknowledgements).toHaveLength(1);
    expect(acknowledgements[0]).toMatchObject({
      assignmentType: "build",
      buildAssignmentId: assignmentIds[0],
      contractorId,
      kind: "assignment",
      state: "pending_acknowledgement",
    });
    const initialDeliveries = await admin.run(async (ctx: any) =>
      ctx.db
        .query("recipientDeliveries")
        .withIndex("by_recipient", (q: any) =>
          q
            .eq("organizationId", ORG)
            .eq("recipientWorkosUserId", "user_linked_assignment_contractor"),
        )
        .collect(),
    );
    expect(initialDeliveries).toEqual([
      expect.objectContaining({
        actionRequired: true,
        entityId: String(assignmentIds[0]),
        entityType: "contractorAssignment",
        status: "unread",
      }),
    ]);

    await builder.mutation(
      (api as any).production_proposals
        .removeActiveBuildContractorFromMilestone,
      {
        buildId: closing.buildId,
        contractorId,
        milestoneKey: "foundation",
        reason: "Scope reassigned after Builder review.",
        workosOrganizationId: ORG,
      },
    );

    const removedState = await admin.run(async (ctx: any) => {
      const assignment = await ctx.db.get(assignmentIds[0]);
      const acknowledgement = await ctx.db
        .query("contractorAcknowledgements")
        .withIndex("by_build_assignment", (q: any) =>
          q.eq("buildAssignmentId", assignmentIds[0]),
        )
        .first();
      const rootAssignment = await ctx.db
        .query("buildContractorAssignments")
        .withIndex("by_build_contractor", (q: any) =>
          q.eq("buildId", closing.buildId).eq("contractorId", contractorId),
        )
        .unique();
      const deliveries = await ctx.db
        .query("recipientDeliveries")
        .withIndex("by_recipient", (q: any) =>
          q
            .eq("organizationId", ORG)
            .eq("recipientWorkosUserId", "user_linked_assignment_contractor"),
        )
        .collect();
      return { acknowledgement, assignment, deliveries, rootAssignment };
    });
    expect(removedState.assignment.status).toBe("removed");
    expect(removedState.acknowledgement.state).toBe("resolved");
    expect(removedState.rootAssignment.status).toBe("inactive");
    expect(removedState.deliveries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          actionRequired: false,
          entityId: String(assignmentIds[0]),
          status: "unread",
          title: "Foundation assignment removed",
        }),
        expect.objectContaining({
          entityId: String(assignmentIds[0]),
          status: "resolved",
        }),
      ]),
    );
    const removedDetail = await builder.query(
      (api as any).production_proposals.getActiveBuildDetailByString,
      { buildId: String(closing.buildId), workosOrganizationId: ORG },
    );
    expect(removedDetail.milestoneContractorAssignments).toEqual([]);
    expect(removedDetail.milestones[0].assignmentCount).toBe(0);
  });

  test("atomic active-build attach and invite projects an invited lifecycle state", async () => {
    const { base, seed, t: admin } = await seeded(["admin"], "user_admin");
    const closing = await createClosedSingleMilestoneBuild(admin, seed);
    const contractorId = await admin.mutation(
      (api as any).production_proposals.createContractorProfile,
      {
        brokerageId: seed.brokerageId,
        email: "atomic-invite@example.com",
        kind: "company",
        name: "Atomic Invite Co",
        trades: ["electrical"],
        workosOrganizationId: ORG,
      },
    );
    const builder = withIdentity(base, ["builder"], "user_builder");

    await builder.mutation(
      (api as any).production_proposals.attachAndInviteActiveBuildContractor,
      {
        buildId: closing.buildId,
        contractorId,
        role: "Electrical crew",
        workosOrganizationId: ORG,
      },
    );

    const detail = await builder.query(
      (api as any).production_proposals.getActiveBuildDetailByString,
      { buildId: String(closing.buildId), workosOrganizationId: ORG },
    );
    expect(detail.contractors).toEqual([
      expect.objectContaining({
        contractorId,
        lifecycleState: "invited",
        onboardingStatus: "invited",
      }),
    ]);
  });

  test("builder can open a newly attached contractor relationship before milestone assignment", async () => {
    const { base, seed, t: admin } = await seeded(["admin"], "user_admin");
    const closing = await createClosedSingleMilestoneBuild(admin, seed);
    const contractorId = await admin.mutation(
      (api as any).production_proposals.createContractorProfile,
      {
        brokerageId: seed.brokerageId,
        city: "Toronto",
        email: "relationship-status@example.com",
        kind: "company",
        name: "Relationship Status Co",
        trades: ["masonry"],
        workosOrganizationId: ORG,
      },
    );
    const builder = withIdentity(base, ["builder"], "user_builder");

    await builder.mutation(
      (api as any).production_proposals.attachActiveBuildContractor,
      {
        buildId: closing.buildId,
        contractorId,
        role: "Masonry crew",
        workosOrganizationId: ORG,
      },
    );

    const result = await builder.query(
      (api as any).production_proposals
        .getBuilderContractorRelationshipByString,
      {
        contractorId: String(contractorId),
        workosOrganizationId: ORG,
      },
    );

    expect(result).toMatchObject({
      availability: {
        category: "available",
        reference: "CTR-DETAIL-AVAILABLE",
      },
      detail: {
        profile: {
          email: "relationship-status@example.com",
          name: "Relationship Status Co",
        },
        relationship: {
          assignmentStatus: "not_assigned",
          brokerage: {
            displayName: expect.any(String),
          },
          lifecycleState: "attached",
          nextAction: "invite",
          scopes: [
            expect.objectContaining({
              buildId: closing.buildId,
              name: expect.any(String),
              role: "Masonry crew",
              type: "build",
            }),
          ],
        },
        workHistory: [],
      },
    });
  });

  test("builder contractor detail returns typed redacted unavailable states", async () => {
    const { base, seed, t: admin } = await seeded(["admin"], "user_admin");
    const contractorId = await admin.mutation(
      (api as any).production_proposals.createContractorProfile,
      {
        brokerageId: seed.brokerageId,
        email: "directory-only@example.com",
        kind: "company",
        name: "Directory Only Co",
        trades: ["electrical"],
        workosOrganizationId: ORG,
      },
    );
    const builder = withIdentity(base, ["builder"], "user_builder");

    await expect(
      builder.query(
        (api as any).production_proposals
          .getBuilderContractorRelationshipByString,
        {
          contractorId: String(contractorId),
          workosOrganizationId: ORG,
        },
      ),
    ).resolves.toEqual({
      availability: {
        category: "accessDenied",
        reference: "CTR-DETAIL-ACCESS",
      },
      detail: null,
    });
    await expect(
      builder.query(
        (api as any).production_proposals
          .getBuilderContractorRelationshipByString,
        {
          contractorId: "not-a-convex-id",
          workosOrganizationId: ORG,
        },
      ),
    ).resolves.toEqual({
      availability: {
        category: "invalidLink",
        reference: "CTR-DETAIL-INVALID",
      },
      detail: null,
    });
  });

  test("does not attach an existing contractor when the atomic active-build invite cannot be created", async () => {
    const { base, seed, t: admin } = await seeded(["admin"], "user_admin");
    const closing = await createClosedSingleMilestoneBuild(admin, seed);
    const contractorId = await admin.mutation(
      (api as any).production_proposals.createContractorProfile,
      {
        brokerageId: seed.brokerageId,
        name: "No Email Build Crew",
        trades: ["foundation"],
        workosOrganizationId: ORG,
      },
    );
    const builder = withIdentity(base, ["builder"], "user_builder");

    await expect(
      builder.mutation(
        (api as any).production_proposals.attachAndInviteActiveBuildContractor,
        {
          buildId: closing.buildId,
          contractorId,
          role: "Foundation",
          workosOrganizationId: ORG,
        },
      ),
    ).rejects.toThrow(/no email/i);

    const persisted = await admin.run(async (ctx: any) => ({
      assignment: await ctx.db
        .query("buildContractorAssignments")
        .withIndex("by_build_contractor", (q: any) =>
          q.eq("buildId", closing.buildId).eq("contractorId", contractorId),
        )
        .unique(),
      claims: await ctx.db
        .query("contractorInviteClaims")
        .withIndex("by_contractor_state", (q: any) =>
          q.eq("contractorId", contractorId).eq("state", "invited"),
        )
        .collect(),
    }));
    expect(persisted).toEqual({ assignment: null, claims: [] });
  });

  test("repeated no-op active build timeline state updates do not drift durable audit or outbox records", async () => {
    const { seed, t } = await seeded(["admin"], "user_admin");
    const closing = await createClosedSingleMilestoneBuild(t, seed, {
      buildName: "No-op timeline state build",
      location: "55 No-op Timeline Way",
    });
    const workspace = await t.query(
      (api as any).production_proposals.getActiveBuildTimelineWorkspace,
      { buildId: closing.buildId, workosOrganizationId: ORG },
    );
    const input = {
      buildId: closing.buildId,
      currentDay: workspace.plan.currentDay,
      minimumCashReserveCents: workspace.plan.minimumCashReserveCents,
      progressValue: workspace.plan.progressValue,
      rangeMax: workspace.plan.rangeMax,
      rangeMin: workspace.plan.rangeMin,
      routeState: workspace.plan.routeState,
      startingCashCents: workspace.plan.startingCashCents,
      workosOrganizationId: ORG,
    };

    await t.mutation(
      (api as any).production_proposals.updateActiveBuildTimelinePlanState,
      input,
    );
    const beforeRetry = await t.run(async (ctx: any) => {
      const auditEvents = await ctx.db
        .query("auditEvents")
        .withIndex("by_entity", (q: any) =>
          q
            .eq("entityType", "activeBuild")
            .eq("entityId", String(closing.buildId)),
        )
        .collect();
      const outbox = await ctx.db.query("eventOutbox").collect();
      const build = await ctx.db.get(closing.buildId);
      return {
        auditCount: auditEvents.filter(
          (event: any) =>
            event.eventType === "active_build.timeline_plan.updated",
        ).length,
        build,
        outboxCount: outbox.filter(
          (event: any) =>
            event.eventType === "active_build.timeline_plan.updated" &&
            String(event.relatedEntityId) === String(closing.buildId),
        ).length,
      };
    });

    expect(beforeRetry.auditCount).toBe(0);
    expect(beforeRetry.outboxCount).toBe(0);

    await t.mutation(
      (api as any).production_proposals.updateActiveBuildTimelinePlanState,
      input,
    );
    const afterRetry = await t.run(async (ctx: any) => {
      const auditEvents = await ctx.db
        .query("auditEvents")
        .withIndex("by_entity", (q: any) =>
          q
            .eq("entityType", "activeBuild")
            .eq("entityId", String(closing.buildId)),
        )
        .collect();
      const outbox = await ctx.db.query("eventOutbox").collect();
      const build = await ctx.db.get(closing.buildId);
      return {
        auditCount: auditEvents.filter(
          (event: any) =>
            event.eventType === "active_build.timeline_plan.updated",
        ).length,
        build,
        outboxCount: outbox.filter(
          (event: any) =>
            event.eventType === "active_build.timeline_plan.updated" &&
            String(event.relatedEntityId) === String(closing.buildId),
        ).length,
      };
    });

    expect(afterRetry.build?.timelineRouteState).toEqual(
      beforeRetry.build?.timelineRouteState,
    );
    expect(afterRetry.build?.timelineCurrentDay).toBe(
      beforeRetry.build?.timelineCurrentDay,
    );
    expect(afterRetry.build?.timelineProgressValue).toBe(
      beforeRetry.build?.timelineProgressValue,
    );
    expect(afterRetry.auditCount).toBe(beforeRetry.auditCount);
    expect(afterRetry.outboxCount).toBe(beforeRetry.outboxCount);

    await t.mutation(
      (api as any).production_proposals.updateActiveBuildTimelinePlanState,
      { ...input, currentDay: input.currentDay + 1 },
    );
    const materialEvents = await t.run(
      async (ctx: any) =>
        await ctx.db
          .query("auditEvents")
          .withIndex("by_entity", (q: any) =>
            q
              .eq("entityType", "activeBuild")
              .eq("entityId", String(closing.buildId)),
          )
          .filter((q: any) =>
            q.eq(q.field("eventType"), "active_build.timeline_plan.updated"),
          )
          .collect(),
    );
    expect(materialEvents).toHaveLength(1);
    expect(materialEvents[0]).toMatchObject({
      newState: expect.stringContaining("Current day:"),
      priorState: expect.stringContaining("Current day:"),
      reason: expect.stringMatching(/updated current day/i),
    });
    expect(materialEvents[0]?.newState).not.toMatch(/^\s*\{/);
  });

  test("seeds deterministic production proposal lifecycle scenarios without demo data", async () => {
    const { t } = await seeded(["admin"], "user_admin");

    const first = await t.mutation(
      (api as any).production_proposals.dev_seedProductionProposalScenarios,
      { workosOrganizationId: ORG },
    );
    const second = await t.mutation(
      (api as any).production_proposals.dev_seedProductionProposalScenarios,
      { workosOrganizationId: ORG },
    );

    expect(Object.keys(first.proposals).sort()).toEqual([
      "approvedWithPermit",
      "approvedWithWaiver",
      "closed",
      "draft",
      "rejected",
      "requestedChanges",
      "submitted",
    ]);
    expect(second.proposals).toEqual(first.proposals);

    const scenarios = await t.run(async (ctx: any) => {
      const proposals = await ctx.db.query("buildProposals").collect();
      const byName = Object.fromEntries(
        proposals.map((proposal: any) => [proposal.buildName, proposal]),
      );
      const activeBuilds = await ctx.db.query("activeBuilds").collect();
      const contractors = await ctx.db.query("contractorProfiles").collect();
      const demoBuilds = await ctx.db.query("demo_builds").collect();
      const demoProposalDrafts = await ctx.db
        .query("demo_builderProposalDrafts")
        .collect();
      const events = await ctx.db.query("proposalEvents").collect();
      const outbox = await ctx.db.query("eventOutbox").collect();
      return {
        activeBuilds,
        byName,
        contractors,
        demoBuilds,
        demoProposalDrafts,
        events,
        outbox,
        proposalCount: proposals.length,
      };
    });

    expect(scenarios.proposalCount).toBe(7);
    expect(scenarios.byName["Seed Scenario - Draft"]).toMatchObject({
      reviewOutcome: "none",
      status: "draft",
    });
    expect(scenarios.byName["Seed Scenario - Submitted"]).toMatchObject({
      reviewOutcome: "none",
      status: "submitted",
    });
    expect(
      scenarios.byName["Seed Scenario - Approved With Permit"],
    ).toMatchObject({
      reviewOutcome: "approved",
      status: "approved",
    });
    expect(
      scenarios.byName["Seed Scenario - Approved With Waiver"],
    ).toMatchObject({
      reviewOutcome: "approved",
      status: "approved",
    });
    expect(scenarios.byName["Seed Scenario - Requested Changes"]).toMatchObject(
      {
        reviewOutcome: "requested_changes",
        status: "draft",
      },
    );
    expect(scenarios.byName["Seed Scenario - Rejected"]).toMatchObject({
      reviewOutcome: "rejected",
      status: "submitted",
    });
    expect(scenarios.byName["Seed Scenario - Closed"]).toMatchObject({
      reviewOutcome: "approved",
      status: "closed",
    });
    expect(scenarios.activeBuilds).toHaveLength(1);
    expect(scenarios.activeBuilds[0]).toMatchObject({
      proposalId: first.proposals.closed,
      status: "future_start",
    });
    expect(scenarios.contractors).toHaveLength(1);
    expect(scenarios.contractors[0].accountWorkosUserId).toBeUndefined();
    expect(scenarios.contractors[0]).toMatchObject({
      name: "Seed Scenario Contractor LLC",
    });
    expect(scenarios.events.map((event: any) => event.eventType)).toEqual(
      expect.arrayContaining([
        "proposal.submitted",
        "proposal.approved",
        "proposal.changes_requested",
        "proposal.rejected",
        "proposal.closed",
      ]),
    );
    expect(scenarios.outbox.map((event: any) => event.eventType)).toContain(
      "active_build.created",
    );
    expect(scenarios.demoBuilds).toHaveLength(0);
    expect(scenarios.demoProposalDrafts).toHaveLength(0);
  });

  test("projects the backoffice dashboard from production proposals and active builds only", async () => {
    const { t } = await seeded(["admin"], "user_admin");

    await t.mutation(
      (api as any).production_proposals.dev_seedProductionProposalScenarios,
      { workosOrganizationId: ORG },
    );

    const dashboard = await t.query(
      (api as any).production_proposals.getBackofficeDashboard,
      { workosOrganizationId: ORG },
    );
    const serialized = JSON.stringify(dashboard);

    expect(serialized).not.toMatch(/demo_|demo-timeline|mock_|Mock/);
    expect(dashboard.activeBuilds).toHaveLength(1);
    expect(dashboard.activeBuilds[0]).toMatchObject({
      address: "Closed Site, Toronto, ON",
      builder: "Production Builder",
      statusLabel: "Future start",
    });
    expect(dashboard.activeBuilds[0].id).not.toContain("Approved");
    expect(dashboard.activeBuilds[0].href).toMatch(/^\/backoffice\/builds\//);

    expect(dashboard.milestones).toEqual([]);

    expect(dashboard.proposalColumns.map((column: any) => column.id)).toEqual([
      "draft",
      "submitted",
      "approved",
      "closed",
    ]);
    expect(dashboard.proposals.map((proposal: any) => proposal.name)).toEqual(
      expect.arrayContaining([
        "Seed Scenario - Approved With Permit",
        "Seed Scenario - Approved With Waiver",
        "Seed Scenario - Closed",
      ]),
    );

    expect(
      dashboard.submittedProposals.map((proposal: any) => proposal.name),
    ).toEqual(["Seed Scenario - Submitted"]);
    expect(
      dashboard.approvedPendingClosing.map((proposal: any) => proposal.name),
    ).toEqual([
      "Seed Scenario - Approved With Permit",
      "Seed Scenario - Approved With Waiver",
    ]);
    expect(dashboard.approvedPendingClosing[0]).toMatchObject({
      lenderDrawPolicyLimitCents: 55_000_000,
      statusLabel: "Approved - pending closing",
    });
    expect(
      dashboard.activeBuilds.some((build: any) =>
        build.id.includes("Approved With Permit"),
      ),
    ).toBe(false);
  });

  test("searches and filters the complete proposal directory with attached builder identity", async () => {
    const { t } = await seeded(["admin"], "user_admin");

    await t.mutation(
      (api as any).production_proposals.dev_seedProductionProposalScenarios,
      { workosOrganizationId: ORG },
    );

    const byEmail = await t.query(
      (api as any).production_proposals.listBackofficeProposalDirectory,
      {
        paginationOpts: { cursor: null, numItems: 100 },
        search: "builder@example.com",
        workosOrganizationId: ORG,
      },
    );

    expect(byEmail.isDone).toBe(true);
    expect(byEmail.page.length).toBeGreaterThan(0);
    expect(byEmail.page).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          builderEmail: "builder@example.com",
          builderName: "Production Builder",
          builderProfileId: expect.any(String),
        }),
      ]),
    );

    const byName = await t.query(
      (api as any).production_proposals.listBackofficeProposalDirectory,
      {
        paginationOpts: { cursor: null, numItems: 100 },
        search: "Production Builder",
        workosOrganizationId: ORG,
      },
    );
    expect(byName.page.length).toBeGreaterThan(0);
    expect(
      byName.page.every(
        (proposal: any) => proposal.builderName === "Production Builder",
      ),
    ).toBe(true);

    const builderProfileId = byEmail.page.find(
      (proposal: any) => proposal.builderProfileId,
    )?.builderProfileId as string;
    expect(builderProfileId).toBeTruthy();

    await t.run(async (ctx: any) => {
      const builderProfile = await ctx.db.get(builderProfileId);
      expect(builderProfile).toBeTruthy();
      const now = Date.now();
      await ctx.db.insert("users", {
        authId: "user_builder_staff_search",
        createdAt: now,
        email: "builder.staff@example.com",
        emailVerified: true,
        firstName: "Casey",
        lastName: "Crew",
        name: "Casey Crew",
        sourceEventId: "test_builder_staff_search_user",
        sourceEventType: "user.created",
        status: "active",
        updatedAt: now,
        workosUserId: "user_builder_staff_search",
      });
      await ctx.db.insert("workosOrganizationMemberships", {
        createdAt: now,
        directoryManaged: false,
        roleSlug: "builder-staff",
        roleSlugs: ["builder-staff"],
        sourceEventId: "test_builder_staff_search_membership",
        sourceEventType: "organization_membership.created",
        status: "active",
        updatedAt: now,
        workosMembershipId: "om_builder_staff_search",
        workosOrganizationId: ORG,
        workosUserId: "user_builder_staff_search",
      });
      await ctx.db.insert("builderAccountLinks", {
        assignedEmail: "builder.staff@example.com",
        brokerageId: builderProfile.brokerageId,
        builderProfileId,
        createdAt: now,
        role: "staff",
        status: "active",
        updatedAt: now,
        workosMembershipId: "om_builder_staff_search",
        workosUserId: "user_builder_staff_search",
      });
    });

    const byAttachedStaff = await t.query(
      (api as any).production_proposals.listBackofficeProposalDirectory,
      {
        paginationOpts: { cursor: null, numItems: 100 },
        search: "builder.staff@example.com Casey",
        workosOrganizationId: ORG,
      },
    );
    expect(byAttachedStaff.page.length).toBeGreaterThan(0);
    expect(
      byAttachedStaff.page.every(
        (proposal: any) => proposal.builderProfileId === builderProfileId,
      ),
    ).toBe(true);

    const approvedPendingClosing = await t.query(
      (api as any).production_proposals.listBackofficeProposalDirectory,
      {
        filters: {
          assignment: "assigned",
          closingState: "pending_closing",
          reviewOutcome: "approved",
          stage: "approved",
        },
        paginationOpts: { cursor: null, numItems: 100 },
        search: "approved Toronto 55000000",
        workosOrganizationId: ORG,
      },
    );

    expect(approvedPendingClosing.page).toHaveLength(2);
    expect(
      approvedPendingClosing.page.every(
        (proposal: any) =>
          proposal.column === "approved" &&
          proposal.reviewOutcome === "approved" &&
          proposal.activeBuildId === undefined,
      ),
    ).toBe(true);
  });

  test("keeps the proposal directory restricted to backoffice roles", async () => {
    const { base } = await seeded(["admin"], "user_admin");
    const builder = withIdentity(base, ["builder"], "user_builder");

    await expect(
      builder.query(
        (api as any).production_proposals.listBackofficeProposalDirectory,
        {
          paginationOpts: { cursor: null, numItems: 25 },
          workosOrganizationId: ORG,
        },
      ),
    ).rejects.toThrow(/forbidden/i);
  });

  test("projects an accountable operations queue from canonical proposal records", async () => {
    const { t } = await seeded(["admin"], "user_admin");

    await t.mutation(
      (api as any).production_proposals.dev_seedProductionProposalScenarios,
      { workosOrganizationId: ORG },
    );

    const dashboard = await t.query(
      (api as any).production_proposals.getBackofficeDashboard,
      { asOfDate: "2100-09-02", workosOrganizationId: ORG },
    );

    expect(dashboard.quickActions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          actionLabel: "Review proposal",
          authorityLabel: "Lender Admin decision",
          blocker: "Awaiting underwriting decision",
          entityLabel: "Seed Scenario - Submitted",
          href: expect.stringMatching(/^\/backoffice\/proposals\//),
          ownerLabel: "Assigned broker",
          recommendationLabel: "Review submission and record a decision",
          type: "proposal",
        }),
        expect.objectContaining({
          actionLabel: "Record closing",
          authorityLabel: "Lender Admin authority",
          blocker: "Approved loan has not been recorded as closed",
          entityLabel: "Seed Scenario - Approved With Permit",
          ownerLabel: "Assigned broker",
          type: "proposal",
        }),
      ]),
    );
    expect(JSON.stringify(dashboard.quickActions)).not.toMatch(
      /payloadPreview|requestId|stack|validator|mutation/i,
    );
  });

  test("records an explicit operations escalation, admin return decision, and acknowledgement", async () => {
    const { base, t: admin } = await seeded(["admin"], "user_admin");
    const broker = withIdentity(base, ["broker"], "user_broker");

    await admin.mutation(
      (api as any).production_proposals.dev_seedProductionProposalScenarios,
      { workosOrganizationId: ORG },
    );

    const dashboard = await broker.query(
      (api as any).production_proposals.getBackofficeDashboard,
      { asOfDate: "2100-09-02", workosOrganizationId: ORG },
    );
    const queueItem = dashboard.quickActions.find((action: any) =>
      action.id.startsWith("proposal-review:"),
    );

    const escalation = await broker.mutation(
      (api as any).production_proposals.escalateOperationsQueueItem,
      {
        decisionPreview:
          "Approve the submitted proposal or return it for changes.",
        evidenceSummary:
          "Underwriting package and selected plan are ready for review.",
        queueItemId: queueItem.id,
        reason: "Lender Admin authority is required for the final decision.",
        recommendation: "Approve subject to the recorded closing conditions.",
        requiredAction: "Record the proposal decision.",
        warnings: [
          "Closing remains blocked until a final decision is recorded.",
        ],
        workosOrganizationId: ORG,
      },
    );

    expect(escalation).toMatchObject({
      acknowledgementState: "pending_decision",
      queueItemId: queueItem.id,
      escalatedByWorkosUserId: "user_broker",
      recommendation: "Approve subject to the recorded closing conditions.",
    });

    await expect(
      broker.mutation(
        (api as any).production_proposals.returnOperationsEscalationDecision,
        {
          decision: "continue",
          followUpAssignment: "Broker must confirm closing conditions.",
          handoffId: escalation._id,
          reason: "Proceed after the closing conditions are confirmed.",
          workosOrganizationId: ORG,
        },
      ),
    ).rejects.toThrow(/Forbidden/);

    const returned = await admin.mutation(
      (api as any).production_proposals.returnOperationsEscalationDecision,
      {
        decision: "continue",
        followUpAssignment: "Broker must confirm closing conditions.",
        handoffId: escalation._id,
        reason: "Proceed after the closing conditions are confirmed.",
        workosOrganizationId: ORG,
      },
    );

    expect(returned).toMatchObject({
      acknowledgementState: "returned",
      returnDecision: "continue",
      returnReason: "Proceed after the closing conditions are confirmed.",
      returnedByWorkosUserId: "user_admin",
    });

    const acknowledged = await broker.mutation(
      (api as any).production_proposals.acknowledgeOperationsEscalationReturn,
      {
        handoffId: escalation._id,
        workosOrganizationId: ORG,
      },
    );

    expect(acknowledged).toMatchObject({
      acknowledgedByWorkosUserId: "user_broker",
      acknowledgementState: "acknowledged",
    });

    const projected = await broker.query(
      (api as any).production_proposals.getBackofficeDashboard,
      { asOfDate: "2100-09-02", workosOrganizationId: ORG },
    );
    expect(
      projected.quickActions.find((action: any) => action.id === queueItem.id),
    ).toMatchObject({
      handoff: expect.objectContaining({
        acknowledgementState: "acknowledged",
        returnDecision: "continue",
        returnReason: "Proceed after the closing conditions are confirmed.",
      }),
    });
  });

  test("projects deterministic backoffice dashboard dates from an explicit as-of date", async () => {
    const { t } = await seeded(["admin"], "user_admin");

    await t.mutation(
      (api as any).production_proposals.dev_seedProductionProposalScenarios,
      { workosOrganizationId: ORG },
    );

    const asOfDate = "2100-09-02";
    const dashboard = await t.query(
      (api as any).production_proposals.getBackofficeDashboard,
      { asOfDate, workosOrganizationId: ORG },
    );
    const expectedDaysActive = Math.floor(
      (Date.parse(`${asOfDate}T00:00:00Z`) -
        Date.parse("2099-09-01T00:00:00Z")) /
        86_400_000,
    );

    expect(dashboard.scheduleDate).toBe("2100-09-02T00:00:00.000Z");
    expect(dashboard.activeBuilds[0].daysActive).toBe(expectedDaysActive);
    expect(dashboard.activeBuilds[0]).toMatchObject({
      buildName: expect.any(String),
      builder: expect.any(String),
      drawCount: expect.any(Number),
      milestoneCount: expect.any(Number),
      milestonesBehindSchedule: expect.any(Number),
      pendingDrawRequestCount: expect.any(Number),
    });
  });

  test("lists the backoffice build roster with phase rollups and operational signals", async () => {
    const { t } = await seeded(["admin"], "user_admin");

    await t.mutation(
      (api as any).production_proposals.dev_seedProductionProposalScenarios,
      { workosOrganizationId: ORG },
    );

    const roster = await t.query(
      (api as any).production_proposals.listBackofficeBuildRoster,
      { workosOrganizationId: ORG },
    );

    expect(roster.summary.total).toBeGreaterThanOrEqual(1);
    expect(roster.builds.length).toBe(roster.summary.total);
    expect(roster.builds[0]).toMatchObject({
      buildName: expect.any(String),
      displayId: expect.stringMatching(/^B-/),
      href: expect.stringMatching(/^\/backoffice\/builds\//),
      phase: expect.stringMatching(/scheduled|active|attention|completed/),
    });
    expect(
      roster.summary.scheduled +
        roster.summary.active +
        roster.summary.attention +
        roster.summary.completed,
    ).toBe(roster.summary.total);
  });

  test("admin sees every brokerage build regardless of their own builder assignment", async () => {
    const { seed, t } = await seeded(["admin"], "user_admin");
    const secondBuilderProfileId = await t.run(async (ctx: any) => {
      const now = Date.now();
      await ctx.db.insert("builderAccountLinks", {
        brokerageId: seed.brokerageId,
        builderProfileId: seed.builderProfileId,
        createdAt: now,
        role: "owner",
        status: "active",
        updatedAt: now,
        workosUserId: "user_admin",
      });
      return await ctx.db.insert("builderProfiles", {
        brokerageId: seed.brokerageId,
        createdAt: now,
        displayName: "Other Builder Co.",
        organizationId: ORG,
        status: "active",
        updatedAt: now,
      });
    });

    const assignedBuild = await createClosedSingleMilestoneBuild(t, seed, {
      buildName: "Admin-assigned build",
    });
    const otherBuilderBuild = await createClosedSingleMilestoneBuild(
      t,
      { ...seed, builderProfileId: secondBuilderProfileId },
      { buildName: "Other builder build" },
    );
    const expectedBuildIds = [
      String(assignedBuild.buildId),
      String(otherBuilderBuild.buildId),
    ].sort();

    const dashboard = await t.query(
      (api as any).production_proposals.getBackofficeDashboard,
      { workosOrganizationId: ORG },
    );
    const roster = await t.query(
      (api as any).production_proposals.listBackofficeBuildRoster,
      { workosOrganizationId: ORG },
    );

    expect(
      dashboard.activeBuilds
        .map((build: any) => build.buildKey)
        .filter((buildId: string) => expectedBuildIds.includes(buildId))
        .sort(),
    ).toEqual(expectedBuildIds);
    expect(
      roster.builds
        .map((build: any) => String(build.buildId))
        .filter((buildId: string) => expectedBuildIds.includes(buildId))
        .sort(),
    ).toEqual(expectedBuildIds);
  });

  test("repairs a legacy closed proposal so every admin can see its active build", async () => {
    const { base, seed, t } = await seeded(["admin"], "user_admin");
    const secondBuilderProfileId = await t.run(async (ctx: any) => {
      const now = Date.now();
      return await ctx.db.insert("builderProfiles", {
        brokerageId: seed.brokerageId,
        createdAt: now,
        displayName: "Legacy Builder Co.",
        organizationId: ORG,
        status: "active",
        updatedAt: now,
      });
    });
    const proposalId = await t.mutation(
      (api as any).production_proposals.createDraftProposal,
      {
        brokerageId: seed.brokerageId,
        builderProfileId: secondBuilderProfileId,
        buildName: "Legacy hidden build",
        location: "91 Legacy Build Road",
        workosOrganizationId: ORG,
      },
    );
    await t.mutation(
      (api as any).production_proposals.saveDraftProposalPackage,
      {
        borrowerCoPayBps: 2_000,
        borrowerWorkingCapitalLimitCents: 35_000_000,
        documents: [
          {
            documentType: "permit",
            fileName: "legacy-permit.pdf",
            mimeType: "application/pdf",
            sizeBytes: 512,
          },
        ],
        lenderDrawPolicyLimitCents: 55_000_000,
        milestones: [
          {
            budgetCents: 50_000_000,
            dayEnd: 20,
            dayStart: 0,
            dependencyKeys: [],
            durationDays: 20,
            key: "foundation",
            name: "Foundation",
            order: 1,
            submilestones: [],
          },
        ],
        proposalId,
        workosOrganizationId: ORG,
      },
    );
    await submitProposalForTest(t, proposalId);
    await t.mutation((api as any).production_proposals.approveProposal, {
      proposalId,
      reason: "Legacy build was approved before active-build materialization.",
      workosOrganizationId: ORG,
    });
    await t.run(async (ctx: any) => {
      const closedAt = Date.parse("2026-04-30T12:00:00.000Z");
      await ctx.db.patch(proposalId, {
        closedAt,
        status: "closed",
        updatedAt: closedAt,
        updatedByWorkosUserId: "legacy_system",
      });
    });

    const before = await t.query(
      (api as any).production_proposals.getBackofficeDashboard,
      { workosOrganizationId: ORG },
    );
    expect(
      before.activeBuilds.some(
        (build: any) => build.buildName === "Legacy hidden build",
      ),
    ).toBe(false);

    await expect(
      withIdentity(base, ["builder"], "user_builder").mutation(
        (api as any).production_proposals.repairLegacyClosedProposalActiveBuild,
        {
          buildStartDate: "2026-05-01",
          proposalId,
          reason: "A builder must not run a backoffice data repair.",
          workosOrganizationId: ORG,
        },
      ),
    ).rejects.toThrow();

    const repaired = await t.mutation(
      (api as any).production_proposals.repairLegacyClosedProposalActiveBuild,
      {
        buildStartDate: "2026-05-01",
        proposalId,
        reason:
          "Restore the missing Active Build aggregate for a legacy closing.",
        workosOrganizationId: ORG,
      },
    );

    expect(repaired).toMatchObject({
      operation: "created",
      warnings: ["loan_facility_not_reconstructed_missing_authoritative_terms"],
    });
    const dashboard = await t.query(
      (api as any).production_proposals.getBackofficeDashboard,
      { workosOrganizationId: ORG },
    );
    const roster = await t.query(
      (api as any).production_proposals.listBackofficeBuildRoster,
      { workosOrganizationId: ORG },
    );
    expect(
      dashboard.activeBuilds.some(
        (build: any) => build.buildKey === String(repaired.buildId),
      ),
    ).toBe(true);
    expect(
      roster.builds.some((build: any) => build.buildId === repaired.buildId),
    ).toBe(true);
    expect(
      await t.run(async (ctx: any) =>
        ctx.db
          .query("loanFacilities")
          .withIndex("by_build", (q: any) => q.eq("buildId", repaired.buildId))
          .first(),
      ),
    ).toBeNull();

    const firstRepairState = await t.run(async (ctx: any) => ({
      audits: (
        await ctx.db
          .query("auditEvents")
          .filter((q: any) =>
            q.eq(q.field("command"), "repairLegacyClosedProposalActiveBuild"),
          )
          .collect()
      ).map((event: any) => ({
        actorRoles: event.actorRoles,
        actorWorkosUserId: event.actorWorkosUserId,
        reason: event.reason,
        warnings: event.warnings,
      })),
      buildCount: (
        await ctx.db
          .query("activeBuilds")
          .withIndex("by_proposal", (q: any) => q.eq("proposalId", proposalId))
          .collect()
      ).length,
      capitalPlanCount: (
        await ctx.db
          .query("buildCapitalPlans")
          .withIndex("by_build", (q: any) => q.eq("buildId", repaired.buildId))
          .collect()
      ).length,
      documentCount: (
        await ctx.db
          .query("buildDocuments")
          .withIndex("by_build", (q: any) => q.eq("buildId", repaired.buildId))
          .collect()
      ).length,
      milestoneCount: (
        await ctx.db
          .query("buildMilestones")
          .withIndex("by_build", (q: any) => q.eq("buildId", repaired.buildId))
          .collect()
      ).length,
    }));
    expect(firstRepairState).toMatchObject({
      audits: [
        {
          actorRoles: ["admin"],
          actorWorkosUserId: "user_admin",
          reason:
            "Restore the missing Active Build aggregate for a legacy closing.",
          warnings: [
            "loan_facility_not_reconstructed_missing_authoritative_terms",
          ],
        },
        {
          actorRoles: ["admin"],
          actorWorkosUserId: "user_admin",
          reason:
            "Restore the missing Active Build aggregate for a legacy closing.",
          warnings: [
            "loan_facility_not_reconstructed_missing_authoritative_terms",
          ],
        },
      ],
      buildCount: 1,
      capitalPlanCount: 1,
      documentCount: 1,
      milestoneCount: 1,
    });

    await expect(
      t.mutation(
        (api as any).production_proposals.repairLegacyClosedProposalActiveBuild,
        {
          buildStartDate: "2026-05-01",
          proposalId,
          reason: "Verify the repair is idempotent.",
          workosOrganizationId: ORG,
        },
      ),
    ).resolves.toMatchObject({
      buildId: repaired.buildId,
      operation: "already_repaired",
    });
    const secondRepairState = await t.run(async (ctx: any) => ({
      auditCount: (
        await ctx.db
          .query("auditEvents")
          .filter((q: any) =>
            q.eq(q.field("command"), "repairLegacyClosedProposalActiveBuild"),
          )
          .collect()
      ).length,
      buildCount: (
        await ctx.db
          .query("activeBuilds")
          .withIndex("by_proposal", (q: any) => q.eq("proposalId", proposalId))
          .collect()
      ).length,
    }));
    expect(secondRepairState).toEqual({ auditCount: 2, buildCount: 1 });
  });

  test("dashboard milestone queue includes completion claims and overdue work", async () => {
    const { base, t } = await seeded(["admin"], "user_admin");

    await t.mutation(
      (api as any).production_proposals.dev_seedProductionProposalScenarios,
      { workosOrganizationId: ORG },
    );

    const initialDashboard = await t.query(
      (api as any).production_proposals.getBackofficeDashboard,
      { workosOrganizationId: ORG },
    );
    expect(initialDashboard.milestones).toEqual([]);
    expect(
      initialDashboard.milestoneColumns.map((column: any) => column.id),
    ).toEqual([
      "backlog",
      "needsSiteVisit",
      "inProgress",
      "behindSchedule",
      "inReview",
    ]);

    const buildId = initialDashboard.activeBuilds[0].buildKey;
    const overdueDashboard = await t.query(
      (api as any).production_proposals.getBackofficeDashboard,
      { asOfDate: "2100-09-02", workosOrganizationId: ORG },
    );
    expect(
      overdueDashboard.milestones.find(
        (milestone: any) => milestone.milestoneKey === "foundation",
      ),
    ).toMatchObject({
      column: "behindSchedule",
      dueLabel: expect.stringMatching(/^\d+d overdue$/),
      milestoneKey: "foundation",
      name: "Foundation",
      priority: "high",
    });

    const builder = withIdentity(base, ["builder"], "user_builder");
    for (const submilestoneKey of ["forms-and-pour", "waterproofing"]) {
      await builder.mutation(
        (api as any).production_proposals
          .updateActiveBuildSubmilestoneExecution,
        {
          actualStartedAt: Date.parse("2026-05-02T12:00:00.000Z"),
          buildId,
          idempotencyKey: `dashboard-submilestone-${submilestoneKey}`,
          milestoneKey: "foundation",
          status: "complete",
          submilestoneKey,
          workosOrganizationId: ORG,
        },
      );
    }
    await builder.mutation(
      (api as any).production_proposals.submitActiveBuildMilestoneCompletion,
      {
        actualCostCents: 50_000_000,
        actualStartedAt: Date.parse("2026-05-02T12:00:00.000Z"),
        buildId,
        completedDay: 30,
        idempotencyKey: "dashboard-milestone-completion-001",
        milestoneKey: "foundation",
        note: "Foundation ready for review.",
        workosOrganizationId: ORG,
      },
    );

    const dashboardAfterClaim = await t.query(
      (api as any).production_proposals.getBackofficeDashboard,
      { workosOrganizationId: ORG },
    );
    expect(dashboardAfterClaim.milestones).toEqual([
      expect.objectContaining({
        column: "backlog",
        milestoneKey: "foundation",
        name: "Foundation",
      }),
    ]);

    await t.mutation(
      (api as any).production_proposals.assignActiveBuildSiteVisit,
      {
        buildId,
        milestoneKey: "foundation",
        note: "Verify completion claim.",
        requestedDay: 31,
        workosOrganizationId: ORG,
      },
    );

    const dashboardAfterSiteVisit = await t.query(
      (api as any).production_proposals.getBackofficeDashboard,
      { asOfDate: "2100-09-02", workosOrganizationId: ORG },
    );
    expect(
      dashboardAfterSiteVisit.milestones.find(
        (milestone: any) => milestone.milestoneKey === "foundation",
      ),
    ).toEqual(
      expect.objectContaining({
        column: "needsSiteVisit",
        milestoneKey: "foundation",
        name: "Foundation",
      }),
    );
  });

  test("active build draw requests keep approved availability when actual cost is lower", async () => {
    const { base, seed, t } = await seeded(["admin"], "user_admin");
    const closing = await createClosedSingleMilestoneBuild(t, seed);
    const initialWorkspace = await t.query(
      (api as any).production_proposals.getActiveBuildTimelineWorkspace,
      { buildId: closing.buildId, workosOrganizationId: ORG },
    );
    const drawKey = initialWorkspace.draws[0].drawKey;
    const builder = withIdentity(base, ["builder"], "user_builder");

    await builder.mutation(
      (api as any).production_proposals.submitActiveBuildMilestoneCompletion,
      {
        actualCostCents: 30_000_000,
        actualStartedAt: Date.parse("2026-05-02T12:00:00.000Z"),
        buildId: closing.buildId,
        completedDay: 20,
        idempotencyKey: "draw-availability-completion-001",
        milestoneKey: "foundation",
        note: "Foundation complete below approved budget.",
        workosOrganizationId: ORG,
      },
    );
    await t.mutation(
      (api as any).production_proposals.approveActiveBuildMilestone,
      {
        buildId: closing.buildId,
        milestoneKey: "foundation",
        note: "Completion evidence approved.",
        workosOrganizationId: ORG,
      },
    );
    const receipt = await builder.mutation(
      (api as any).production_proposals.requestActiveBuildDraw,
      {
        amountCents: 40_000_000,
        buildId: closing.buildId,
        drawKey,
        note: "Requesting approved reimbursement.",
        workosOrganizationId: ORG,
      },
    );

    const workspace = await t.query(
      (api as any).production_proposals.getActiveBuildTimelineWorkspace,
      { buildId: closing.buildId, workosOrganizationId: ORG },
    );
    expect(
      workspace.draws.find((draw: any) => draw.drawKey === receipt.requestKey),
    ).toMatchObject({
      amountCents: 40_000_000,
      requestNote: "Requesting approved reimbursement.",
      requestStatus: "requested",
    });
  });

  test("active build draw approval allows approved availability after lower actual cost", async () => {
    const { base, seed, t } = await seeded(["admin"], "user_admin");
    const closing = await createClosedSingleMilestoneBuild(t, seed);
    const initialWorkspace = await t.query(
      (api as any).production_proposals.getActiveBuildTimelineWorkspace,
      { buildId: closing.buildId, workosOrganizationId: ORG },
    );
    const drawKey = initialWorkspace.draws[0].drawKey;
    const builder = withIdentity(base, ["builder"], "user_builder");

    await builder.mutation(
      (api as any).production_proposals.submitActiveBuildMilestoneCompletion,
      {
        actualCostCents: 30_000_000,
        actualStartedAt: Date.parse("2026-05-02T12:00:00.000Z"),
        buildId: closing.buildId,
        completedDay: 20,
        idempotencyKey: "draw-approval-completion-001",
        milestoneKey: "foundation",
        note: "Foundation complete below approved budget.",
        workosOrganizationId: ORG,
      },
    );
    await t.mutation(
      (api as any).production_proposals.approveActiveBuildMilestone,
      {
        buildId: closing.buildId,
        milestoneKey: "foundation",
        note: "Completion evidence approved.",
        workosOrganizationId: ORG,
      },
    );
    const receipt = await builder.mutation(
      (api as any).production_proposals.requestActiveBuildDraw,
      {
        amountCents: 40_000_000,
        buildId: closing.buildId,
        drawKey,
        note: "Requested against original budget.",
        workosOrganizationId: ORG,
      },
    );

    await t.mutation(
      (api as any).production_proposals.startActiveBuildDrawReview,
      {
        buildId: closing.buildId,
        drawKey: receipt.requestKey,
        workosOrganizationId: ORG,
      },
    );
    await t.mutation(
      (api as any).production_proposals.submitActiveBuildDrawForAdmin,
      {
        buildId: closing.buildId,
        drawKey: receipt.requestKey,
        note: "Evidence and policy review complete.",
        workosOrganizationId: ORG,
      },
    );
    await expect(
      t.mutation((api as any).production_proposals.approveActiveBuildDraw, {
        buildId: closing.buildId,
        drawKey: receipt.requestKey,
        note: "Approve release.",
        workosOrganizationId: ORG,
      }),
    ).resolves.toBeNull();

    const workspace = await t.query(
      (api as any).production_proposals.getActiveBuildTimelineWorkspace,
      { buildId: closing.buildId, workosOrganizationId: ORG },
    );
    expect(
      workspace.draws.find((draw: any) => draw.drawKey === receipt.requestKey),
    ).toMatchObject({
      amountCents: 40_000_000,
      requestStatus: "approved",
    });
  });

  test("reserves final milestone decisions and draw release for lender admins", async () => {
    const { base, seed, t: admin } = await seeded(["admin"], "user_admin");
    const closing = await createClosedSingleMilestoneBuild(admin, seed);
    await admin.run(async (ctx: any) => {
      const build = await ctx.db.get(closing.buildId);
      await ctx.db.patch(build.proposalId, {
        assignedBrokerWorkosUserId: "user_broker",
      });
    });
    const staff = withIdentity(base, ["broker"], "user_broker");

    await expect(
      staff.mutation(
        (api as any).production_proposals.approveActiveBuildMilestone,
        {
          buildId: closing.buildId,
          milestoneKey: "foundation",
          note: "Staff recommendation must not be a final approval.",
          workosOrganizationId: ORG,
        },
      ),
    ).rejects.toThrow("Forbidden: role");
    await expect(
      staff.mutation(
        (api as any).production_proposals.rejectActiveBuildMilestone,
        {
          buildId: closing.buildId,
          milestoneKey: "foundation",
          note: "Staff recommendation must not be a final rejection.",
          workosOrganizationId: ORG,
        },
      ),
    ).rejects.toThrow("Forbidden: role");
    await expect(
      staff.mutation((api as any).production_proposals.releaseActiveBuildDraw, {
        buildId: closing.buildId,
        drawKey: "draw-request-awaiting-admin",
        note: "Staff cannot release funds.",
        releaseDate: "2026-07-16",
        workosOrganizationId: ORG,
      }),
    ).rejects.toThrow("Forbidden: role");
  });

  test("keeps staff evidence acceptance and site-visit recommendations pending admin approval", async () => {
    const { base, seed, t: admin } = await seeded(["admin"], "user_admin");
    const closing = await createClosedSingleMilestoneBuild(admin, seed);
    const builder = withIdentity(base, ["builder"], "user_builder");
    await admin.run(async (ctx: any) => {
      const build = await ctx.db.get(closing.buildId);
      await ctx.db.patch(build.proposalId, {
        assignedBrokerWorkosUserId: "user_broker",
      });
    });
    const staff = withIdentity(base, ["broker"], "user_broker");

    await builder.mutation(
      (api as any).production_proposals.submitActiveBuildMilestoneCompletion,
      {
        actualStartedAt: Date.parse("2026-05-02T12:00:00.000Z"),
        buildId: closing.buildId,
        completedDay: 20,
        idempotencyKey: "staff-review-completion-001",
        milestoneKey: "foundation",
        note: "Foundation ready for lender review.",
        workosOrganizationId: ORG,
      },
    );
    await staff.mutation(
      (api as any).production_proposals.reviewActiveBuildEvidence,
      {
        accepted: true,
        buildId: closing.buildId,
        milestoneKey: "foundation",
        note: "Evidence accepted; recommend admin approval.",
        workosOrganizationId: ORG,
      },
    );

    let milestone = await admin.run(async (ctx: any) =>
      ctx.db
        .query("buildMilestones")
        .withIndex("by_build_key", (q: any) =>
          q.eq("buildId", closing.buildId).eq("key", "foundation"),
        )
        .unique(),
    );
    expect(milestone).toMatchObject({
      evidenceState: "Accepted",
      status: "in_progress",
    });
    expect(milestone.completionReview).toMatchObject({
      evidenceReview: {
        accepted: true,
        note: "Evidence accepted; recommend admin approval.",
      },
      status: "pending",
    });
    expect(milestone.completionReview?.note).toBeUndefined();

    const visit = await staff.mutation(
      (api as any).production_proposals.assignActiveBuildSiteVisit,
      {
        buildId: closing.buildId,
        milestoneKey: "foundation",
        note: "Verify the accepted package on site.",
        requestedDay: 21,
        workosOrganizationId: ORG,
      },
    );
    await seedTokenizedSiteVisitEvidence(admin, {
      buildId: String(closing.buildId),
      token: visit.visitId,
    });
    await admin.mutation(
      (api as any).production_proposals
        .submitActiveBuildTokenizedSiteVisitReport,
      {
        buildId: String(closing.buildId),
        completionObserved: true,
        locationAttempt: {
          attempted: true,
          attemptedAt: 1_721_234_567_890,
          permissionOutcome: "granted",
          verified: true,
        },
        missingPrerequisites: [],
        recommendedOutcome: "approve",
        reportNotes: "<p>Observed completed foundation work.</p>",
        token: visit.visitId,
      },
    );

    milestone = await admin.run(async (ctx: any) =>
      ctx.db
        .query("buildMilestones")
        .withIndex("by_build_key", (q: any) =>
          q.eq("buildId", closing.buildId).eq("key", "foundation"),
        )
        .unique(),
    );
    expect(milestone.status).toBe("in_progress");
    expect(milestone.completionReview?.status).toBe("pending");
    expect(milestone.completionReview?.siteVisit).toMatchObject({
      recommendedOutcome: "approve",
      status: "complete",
    });
  });

  test("requires a concrete change request and clears it when the builder resubmits", async () => {
    const { base, seed, t: admin } = await seeded(["admin"], "user_admin");
    const closing = await createClosedSingleMilestoneBuild(admin, seed);
    const builder = withIdentity(base, ["builder"], "user_builder");

    await expect(
      admin.mutation(
        (api as any).production_proposals.requestActiveBuildMilestoneInfo,
        {
          buildId: closing.buildId,
          milestoneKey: "foundation",
          note: "   ",
          workosOrganizationId: ORG,
        },
      ),
    ).rejects.toThrow("A requested change note is required.");

    await admin.mutation(
      (api as any).production_proposals.requestActiveBuildMilestoneInfo,
      {
        buildId: closing.buildId,
        milestoneKey: "foundation",
        note: " Upload the signed inspection report. ",
        workosOrganizationId: ORG,
      },
    );
    let milestone = await admin.run(async (ctx: any) =>
      ctx.db
        .query("buildMilestones")
        .withIndex("by_build_key", (q: any) =>
          q.eq("buildId", closing.buildId).eq("key", "foundation"),
        )
        .unique(),
    );
    expect(milestone.completionReview).toMatchObject({
      note: "Upload the signed inspection report.",
      status: "revisionRequested",
    });

    await builder.mutation(
      (api as any).production_proposals.submitActiveBuildMilestoneCompletion,
      {
        actualStartedAt: Date.parse("2026-05-02T12:00:00.000Z"),
        buildId: closing.buildId,
        completedDay: 20,
        idempotencyKey: "change-request-completion-001",
        milestoneKey: "foundation",
        note: "Signed report attached.",
        workosOrganizationId: ORG,
      },
    );
    milestone = await admin.run(async (ctx: any) =>
      ctx.db
        .query("buildMilestones")
        .withIndex("by_build_key", (q: any) =>
          q.eq("buildId", closing.buildId).eq("key", "foundation"),
        )
        .unique(),
    );
    expect(milestone.completionReview?.status).toBe("pending");
    expect(milestone.completionReview?.note).toBeUndefined();
  });

  test("repairs only malformed revision states without requested-change notes", async () => {
    const { seed, t: admin } = await seeded(["admin"], "user_admin");
    const closing = await createClosedSingleMilestoneBuild(admin, seed);
    const milestoneId = await admin.run(async (ctx: any) => {
      const milestone = await ctx.db
        .query("buildMilestones")
        .withIndex("by_build_key", (q: any) =>
          q.eq("buildId", closing.buildId).eq("key", "foundation"),
        )
        .unique();
      await ctx.db.patch(milestone._id, {
        completionReview: {
          reviewedAt: "2026-07-15T12:00:00.000Z",
          status: "revisionRequested",
        },
      });
      return milestone._id;
    });

    const repaired = await admin.mutation(
      (api as any).production_proposals.repairActiveBuildMilestoneReviewStates,
      {
        buildId: closing.buildId,
        workosOrganizationId: ORG,
      },
    );
    expect(repaired).toEqual({
      milestoneKeys: ["foundation"],
      repaired: 1,
    });
    let milestone = await admin.run(async (ctx: any) =>
      ctx.db.get(milestoneId),
    );
    expect(milestone.completionReview?.status).toBe("pending");

    await admin.run(async (ctx: any) => {
      await ctx.db.patch(milestoneId, {
        completionReview: {
          note: "Upload a clearer inspection photo.",
          reviewedAt: "2026-07-15T13:00:00.000Z",
          status: "revisionRequested",
        },
      });
    });
    expect(
      await admin.mutation(
        (api as any).production_proposals
          .repairActiveBuildMilestoneReviewStates,
        {
          buildId: closing.buildId,
          workosOrganizationId: ORG,
        },
      ),
    ).toEqual({ milestoneKeys: [], repaired: 0 });
    milestone = await admin.run(async (ctx: any) => ctx.db.get(milestoneId));
    expect(milestone.completionReview).toMatchObject({
      note: "Upload a clearer inspection photo.",
      status: "revisionRequested",
    });
  });

  test("deduplicates legacy draw requests without client operation IDs before reducing capacity again", async () => {
    const { base, seed, t } = await seeded(["admin"], "user_admin");
    const closing = await createClosedSingleMilestoneBuild(t, seed);
    await unlockActiveBuildMilestoneForDraw(t, closing.buildId);
    const builder = withIdentity(base, ["builder"], "user_builder");
    const input = {
      amountCents: 20_000_000,
      buildId: closing.buildId,
      drawKey: "draw-01",
      note: "Legacy builder draw request without explicit operation ID.",
      workosOrganizationId: ORG,
    };

    const receipt = await builder.mutation(
      (api as any).production_proposals.requestActiveBuildDraw,
      input,
    );
    const retry = await builder.mutation(
      (api as any).production_proposals.requestActiveBuildDraw,
      input,
    );

    expect(receipt.availableAfterCents).toBe(20_000_000);
    expect(retry).toEqual(receipt);

    const detailAfterRetry = await builder.query(
      (api as any).production_proposals.getActiveBuildDetailByString,
      { buildId: String(closing.buildId), workosOrganizationId: ORG },
    );
    expect(detailAfterRetry.draws).toHaveLength(1);
    expect(detailAfterRetry.draws[0]).toMatchObject({
      amountCents: 20_000_000,
      drawKey: receipt.requestKey,
      status: "requested",
    });

    const secondReceipt = await builder.mutation(
      (api as any).production_proposals.requestActiveBuildDraw,
      {
        ...input,
        clientOperationId: "draw-operation-explicit-after-legacy",
      },
    );

    expect(secondReceipt.displayId).not.toBe(receipt.displayId);
    expect(secondReceipt.requestKey).not.toBe(receipt.requestKey);
    expect(secondReceipt.availableAfterCents).toBe(0);

    const detail = await builder.query(
      (api as any).production_proposals.getActiveBuildDetailByString,
      { buildId: String(closing.buildId), workosOrganizationId: ORG },
    );
    expect(detail.plannedDraws).toHaveLength(1);
    expect(detail.draws).toHaveLength(2);
    expect(detail.draws).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          amountCents: 20_000_000,
          drawKey: receipt.requestKey,
          status: "requested",
        }),
        expect.objectContaining({
          amountCents: 20_000_000,
          drawKey: secondReceipt.requestKey,
          status: "requested",
        }),
      ]),
    );
  });

  test("keeps legacy fallback draw operation IDs independent even when the old weak hash would collide", async () => {
    const { base, seed, t } = await seeded(["admin"], "user_admin");
    const closing = await createClosedSingleMilestoneBuild(t, seed);
    await unlockActiveBuildMilestoneForDraw(t, closing.buildId);
    const builder = withIdentity(base, ["builder"], "user_builder");
    const collision = findLegacyDrawOperationCollision({
      buildId: String(closing.buildId),
      requestedByWorkosUserId: "user_builder",
    });

    const firstReceipt = await builder.mutation(
      (api as any).production_proposals.requestActiveBuildDraw,
      {
        amountCents: collision.first.amountCents,
        buildId: closing.buildId,
        drawKey: collision.first.drawKey,
        note: `Legacy fallback collision probe ${collision.legacyOperationId}.`,
        workosOrganizationId: ORG,
      },
    );
    const secondReceipt = await builder.mutation(
      (api as any).production_proposals.requestActiveBuildDraw,
      {
        amountCents: collision.second.amountCents,
        buildId: closing.buildId,
        drawKey: collision.second.drawKey,
        note: `Legacy fallback collision probe ${collision.legacyOperationId}.`,
        workosOrganizationId: ORG,
      },
    );

    expect(secondReceipt.displayId).not.toBe(firstReceipt.displayId);
    expect(secondReceipt.requestKey).not.toBe(firstReceipt.requestKey);
    expect(firstReceipt.availableAfterCents).toBe(
      40_000_000 - collision.first.amountCents,
    );
    expect(secondReceipt.availableAfterCents).toBe(
      40_000_000 - collision.first.amountCents - collision.second.amountCents,
    );

    const detail = await builder.query(
      (api as any).production_proposals.getActiveBuildDetailByString,
      { buildId: String(closing.buildId), workosOrganizationId: ORG },
    );
    expect(detail.draws).toHaveLength(2);
    expect(detail.draws).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          amountCents: collision.first.amountCents,
          drawKey: firstReceipt.requestKey,
          status: "requested",
        }),
        expect.objectContaining({
          amountCents: collision.second.amountCents,
          drawKey: secondReceipt.requestKey,
          status: "requested",
        }),
      ]),
    );
  });

  test("keeps draw requests independent, idempotent, exact, and withdrawable before approval", async () => {
    const { base, seed, t } = await seeded(["admin"], "user_admin");
    const closing = await createClosedSingleMilestoneBuild(t, seed);
    await unlockActiveBuildMilestoneForDraw(t, closing.buildId);
    const builder = withIdentity(base, ["builder"], "user_builder");
    const input = {
      amountCents: 12_345_67,
      buildId: closing.buildId,
      clientOperationId: "draw-operation-exact-01",
      drawKey: "draw-01",
      note: "Exact partial reimbursement.",
      workosOrganizationId: ORG,
    };

    const receipt = await builder.mutation(
      (api as any).production_proposals.requestActiveBuildDraw,
      input,
    );
    const retry = await builder.mutation(
      (api as any).production_proposals.requestActiveBuildDraw,
      input,
    );
    const secondReceipt = await builder.mutation(
      (api as any).production_proposals.requestActiveBuildDraw,
      {
        ...input,
        amountCents: 2_000_000,
        clientOperationId: "draw-operation-exact-02",
        note: "Second exact partial reimbursement.",
      },
    );
    expect(retry).toEqual(receipt);
    expect(secondReceipt.displayId).not.toBe(receipt.displayId);
    expect(secondReceipt.requestKey).not.toBe(receipt.requestKey);
    expect(receipt).toMatchObject({
      amountCents: 1_234_567,
      availableAfterCents: 38_765_433,
      sourceAllocations: [
        {
          amountCents: 1_234_567,
          drawGroupKey: "draw-01",
          milestoneKey: "foundation",
          milestoneName: "Foundation",
          sourceOrder: 0,
        },
      ],
      status: "requested",
    });
    expect(receipt.workOrderKey).toMatch(/^DRWO-\d{4}$/);

    let detail = await builder.query(
      (api as any).production_proposals.getActiveBuildDetailByString,
      { buildId: String(closing.buildId), workosOrganizationId: ORG },
    );
    expect(detail.plannedDraws).toHaveLength(1);
    expect(detail.draws).toHaveLength(2);
    expect(detail.draws).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          amountCents: 1_234_567,
          drawKey: receipt.requestKey,
          sourceAllocations: receipt.sourceAllocations,
          status: "requested",
          workOrderKey: receipt.workOrderKey,
        }),
        expect.objectContaining({
          amountCents: 2_000_000,
          drawKey: secondReceipt.requestKey,
          status: "requested",
        }),
      ]),
    );
    expect(detail.drawFunding).toMatchObject({
      approvedMilestoneCents: 40_000_000,
      availableCents: 36_765_433,
      reservedCents: 3_234_567,
      unlockedCents: 40_000_000,
    });
    const persistedAttribution = await t.run(async (ctx: any) => {
      const persistedRequest = detail.draws.find(
        (draw: any) => draw.drawKey === receipt.requestKey,
      );
      return await ctx.db
        .query("activeBuildDrawRequestAllocations")
        .withIndex("by_request", (q: any) =>
          q.eq("drawRequestId", persistedRequest._id),
        )
        .collect();
    });
    expect(persistedAttribution).toEqual([
      expect.objectContaining({
        amountCents: 1_234_567,
        brokerageId: seed.brokerageId,
        drawGroupKey: "draw-01",
        milestoneKey: "foundation",
        organizationId: ORG,
        sourceOrder: 0,
      }),
    ]);

    const brokerageDraws = await t.query(
      (api as any).production_proposals.listBrokerageDraws,
      { workosOrganizationId: ORG },
    );
    expect(brokerageDraws.summary.requested).toBe(2);
    expect(
      brokerageDraws.draws
        .filter((draw: any) => draw.status === "requested")
        .map((draw: any) => draw.drawKey)
        .sort(),
    ).toEqual([receipt.requestKey, secondReceipt.requestKey].sort());

    await expect(
      builder.mutation(
        (api as any).production_proposals.requestActiveBuildDraw,
        { ...input, amountCents: 99_000_000, clientOperationId: "too-large" },
      ),
    ).rejects.toThrow("exceeds the available draw limit");
    await expect(
      builder.mutation(
        (api as any).production_proposals.requestActiveBuildDraw,
        { ...input, amountCents: 100.5, clientOperationId: "fractional-cents" },
      ),
    ).rejects.toThrow("positive whole number of cents");
    await expect(
      builder.mutation(
        (api as any).production_proposals.requestActiveBuildDraw,
        {
          ...input,
          clientOperationId: "note-too-long",
          note: "x".repeat(501),
        },
      ),
    ).rejects.toThrow("500 characters or fewer");

    await builder.mutation(
      (api as any).production_proposals.withdrawActiveBuildDraw,
      {
        buildId: closing.buildId,
        drawKey: receipt.requestKey,
        note: "Correcting the request amount.",
        workosOrganizationId: ORG,
      },
    );
    detail = await builder.query(
      (api as any).production_proposals.getActiveBuildDetailByString,
      { buildId: String(closing.buildId), workosOrganizationId: ORG },
    );
    expect(
      detail.draws.find((draw: any) => draw.drawKey === receipt.requestKey),
    ).toMatchObject({ status: "withdrawn" });
    expect(
      detail.draws.find(
        (draw: any) => draw.drawKey === secondReceipt.requestKey,
      ),
    ).toMatchObject({ status: "requested" });

    const terminalRetry = await builder
      .mutation((api as any).production_proposals.requestActiveBuildDraw, input)
      .then(
        () => null,
        (error: any) => error,
      );

    expect(terminalRetry).toMatchObject({
      data: expect.objectContaining({
        code: "ACTIVE_BUILD_DRAW_REQUEST_TERMINAL_OPERATION_CONFLICT",
        currentStatus: "withdrawn",
        recoverable: true,
        request: expect.objectContaining({
          amountCents: receipt.amountCents,
          displayId: receipt.displayId,
          requestKey: receipt.requestKey,
          requestedAt: receipt.requestedAt,
        }),
        safeMessage: expect.stringContaining("withdrawn"),
      }),
    });

    detail = await builder.query(
      (api as any).production_proposals.getActiveBuildDetailByString,
      { buildId: String(closing.buildId), workosOrganizationId: ORG },
    );
    expect(detail.draws).toHaveLength(2);
    expect(
      detail.draws.find((draw: any) => draw.drawKey === receipt.requestKey),
    ).toMatchObject({ status: "withdrawn" });
    expect(
      detail.draws.find(
        (draw: any) => draw.drawKey === secondReceipt.requestKey,
      ),
    ).toMatchObject({ status: "requested" });
    expect(detail.plannedDraws[0]).toMatchObject({
      amountCents: 40_000_000,
      status: "planned",
    });
    expect(detail.drawFunding).toMatchObject({
      availableCents: 38_000_000,
      reservedCents: 2_000_000,
    });
    const drawAuditEvents = await t.run(async (ctx: any) =>
      ctx.db
        .query("auditEvents")
        .withIndex("by_entity", (q: any) =>
          q
            .eq("entityType", "activeBuild")
            .eq("entityId", String(closing.buildId)),
        )
        .collect(),
    );
    expect(
      drawAuditEvents
        .filter((event: any) =>
          ["requestActiveBuildDraw", "withdrawActiveBuildDraw"].includes(
            event.command,
          ),
        )
        .map((event: any) => ({
          actorRoles: event.actorRoles,
          actorWorkosUserId: event.actorWorkosUserId,
          command: event.command,
          organizationId: event.organizationId,
          reason: event.reason,
        })),
    ).toEqual([
      {
        actorRoles: ["builder"],
        actorWorkosUserId: "user_builder",
        command: "requestActiveBuildDraw",
        organizationId: ORG,
        reason: "Exact partial reimbursement.",
      },
      {
        actorRoles: ["builder"],
        actorWorkosUserId: "user_builder",
        command: "requestActiveBuildDraw",
        organizationId: ORG,
        reason: "Second exact partial reimbursement.",
      },
      {
        actorRoles: ["builder"],
        actorWorkosUserId: "user_builder",
        command: "withdrawActiveBuildDraw",
        organizationId: ORG,
        reason: "Correcting the request amount.",
      },
    ]);
  });

  test("deterministically allocates pooled availability and audits the complete draw work-order lifecycle", async () => {
    const { base, seed, t: admin } = await seeded(["admin"], "user_admin");
    const closing = await createClosedSingleMilestoneBuild(admin, seed, {
      buildName: "Pooled draw attribution build",
      milestones: [
        {
          budgetCents: 25_000_000,
          dayEnd: 20,
          dayStart: 0,
          dependencyKeys: [],
          durationDays: 20,
          key: "foundation",
          name: "Foundation",
          order: 1,
          submilestones: [],
        },
        {
          budgetCents: 25_000_000,
          dayEnd: 40,
          dayStart: 20,
          dependencyKeys: ["foundation"],
          durationDays: 20,
          key: "framing",
          name: "Framing",
          order: 2,
          submilestones: [],
        },
      ],
    });
    await unlockActiveBuildMilestoneForDraw(
      admin,
      closing.buildId,
      "foundation",
    );
    await unlockActiveBuildMilestoneForDraw(admin, closing.buildId, "framing");
    await admin.run(async (ctx: any) => {
      const build = await ctx.db.get(closing.buildId);
      await ctx.db.patch(build.proposalId, {
        assignedBrokerWorkosUserId: "user_broker",
      });
    });
    const builder = withIdentity(base, ["builder"], "user_builder");
    const staff = withIdentity(base, ["broker"], "user_broker");
    const initialWorkspace = await builder.query(
      (api as any).production_proposals.getActiveBuildTimelineWorkspace,
      { buildId: closing.buildId, workosOrganizationId: ORG },
    );

    const receipt = await builder.mutation(
      (api as any).production_proposals.requestActiveBuildDraw,
      {
        amountCents: 30_000_000,
        buildId: closing.buildId,
        clientOperationId: "pooled-attribution-01",
        drawKey: initialWorkspace.draws[0].drawKey,
        note: "Reimburse completed foundation and framing work.",
        workosOrganizationId: ORG,
      },
    );
    expect(receipt.sourceAllocations).toEqual([
      expect.objectContaining({
        amountCents: 20_000_000,
        milestoneKey: "foundation",
        milestoneName: "Foundation",
        sourceOrder: 0,
      }),
      expect.objectContaining({
        amountCents: 10_000_000,
        milestoneKey: "framing",
        milestoneName: "Framing",
        sourceOrder: 1,
      }),
    ]);
    expect(
      receipt.sourceAllocations.reduce(
        (sum: number, allocation: any) => sum + allocation.amountCents,
        0,
      ),
    ).toBe(receipt.amountCents);

    let detail = await admin.query(
      (api as any).production_proposals.getActiveBuildDetailByString,
      { buildId: String(closing.buildId), workosOrganizationId: ORG },
    );
    expect(detail.drawFunding).toMatchObject({
      approvedMilestoneCents: 40_000_000,
      availableCents: 10_000_000,
      reservedCents: 30_000_000,
      unlockedCents: 40_000_000,
    });
    expect(detail.draws[0]).toMatchObject({
      sourceAllocations: receipt.sourceAllocations,
      status: "requested",
      workOrderKey: receipt.workOrderKey,
    });
    await admin.run(async (ctx: any) => {
      const facility = await ctx.db
        .query("loanFacilities")
        .withIndex("by_build", (q: any) => q.eq("buildId", closing.buildId))
        .unique();
      await ctx.db.patch(facility._id, { principalCents: 35_000_000 });
    });
    detail = await admin.query(
      (api as any).production_proposals.getActiveBuildDetailByString,
      { buildId: String(closing.buildId), workosOrganizationId: ORG },
    );
    expect(detail.drawFunding).toMatchObject({
      availableCents: 5_000_000,
      reservedCents: 30_000_000,
      unlockedCents: 35_000_000,
    });
    expect(
      detail.drawFunding.sources.reduce(
        (sum: number, source: any) => sum + source.availableCents,
        0,
      ),
    ).toBe(5_000_000);

    await staff.mutation(
      (api as any).production_proposals.startActiveBuildDrawReview,
      {
        buildId: closing.buildId,
        drawKey: receipt.requestKey,
        note: "Operations review started.",
        workosOrganizationId: ORG,
      },
    );
    detail = await admin.query(
      (api as any).production_proposals.getActiveBuildDetailByString,
      { buildId: String(closing.buildId), workosOrganizationId: ORG },
    );
    expect(detail.draws[0].status).toBe("in_review");

    await staff.mutation(
      (api as any).production_proposals.submitActiveBuildDrawForAdmin,
      {
        buildId: closing.buildId,
        drawKey: receipt.requestKey,
        note: "Evidence, allocation, and lender policy checks passed.",
        workosOrganizationId: ORG,
      },
    );
    await expect(
      staff.mutation(
        (api as any).production_proposals.approveActiveBuildDraw,
        {
          buildId: closing.buildId,
          drawKey: receipt.requestKey,
          note: "Staff cannot make the final release decision.",
          workosOrganizationId: ORG,
        },
      ),
    ).rejects.toThrow("Forbidden: role");
    await admin.mutation(
      (api as any).production_proposals.approveActiveBuildDraw,
      {
        buildId: closing.buildId,
        drawKey: receipt.requestKey,
        note: "Admin approved the attributed reimbursement.",
        workosOrganizationId: ORG,
      },
    );
    detail = await admin.query(
      (api as any).production_proposals.getActiveBuildDetailByString,
      { buildId: String(closing.buildId), workosOrganizationId: ORG },
    );
    expect(detail.draws[0].status).toBe("approved_for_release");

    await admin.mutation(
      (api as any).production_proposals.releaseActiveBuildDraw,
      {
        buildId: closing.buildId,
        drawKey: receipt.requestKey,
        note: "Funds released against the approved source allocation.",
        releaseDate: "2026-07-27",
        workosOrganizationId: ORG,
      },
    );
    detail = await admin.query(
      (api as any).production_proposals.getActiveBuildDetailByString,
      { buildId: String(closing.buildId), workosOrganizationId: ORG },
    );
    expect(detail.draws[0]).toMatchObject({
      sourceAllocations: receipt.sourceAllocations,
      status: "released",
    });

    const lifecycleEvents = await admin.run(async (ctx: any) =>
      (
        await ctx.db
          .query("auditEvents")
          .withIndex("by_entity", (q: any) =>
            q
              .eq("entityType", "activeBuild")
              .eq("entityId", String(closing.buildId)),
          )
          .collect()
      ).filter((event: any) =>
        [
          "requestActiveBuildDraw",
          "startActiveBuildDrawReview",
          "submitActiveBuildDrawForAdmin",
          "approveActiveBuildDraw",
          "releaseActiveBuildDraw",
        ].includes(event.command),
      ),
    );
    expect(lifecycleEvents.map((event: any) => event.command)).toEqual([
      "requestActiveBuildDraw",
      "startActiveBuildDrawReview",
      "submitActiveBuildDrawForAdmin",
      "approveActiveBuildDraw",
      "releaseActiveBuildDraw",
    ]);
    expect(
      lifecycleEvents.every(
        (event: any) =>
          event.organizationId === ORG &&
          event.actorWorkosUserId &&
          event.actorRoles.length > 0 &&
          event.newState,
      ),
    ).toBe(true);
    expect(
      lifecycleEvents
        .slice(1)
        .every((event: any) => event.priorState && event.reason),
    ).toBe(true);
  });

  test("backfills legacy request attribution and normalizes approved work orders", async () => {
    const { seed, t: admin } = await seeded(["admin"], "user_admin");
    const closing = await createClosedSingleMilestoneBuild(admin, seed);
    await unlockActiveBuildMilestoneForDraw(admin, closing.buildId);
    const legacyRequestId = await admin.run(async (ctx: any) =>
      ctx.db.insert("activeBuildDrawRequests", {
        amountCents: 10_000_000,
        brokerageId: seed.brokerageId,
        buildId: closing.buildId,
        clientOperationId: "legacy-request-0042",
        createdAt: 42,
        displayId: "DR-0042",
        label: "Legacy approved reimbursement",
        organizationId: ORG,
        requestedAt: "2026-07-01T12:00:00.000Z",
        requestedByWorkosUserId: "user_builder",
        requestKey: "dr-0042-legacy",
        status: "approved",
        updatedAt: 42,
      }),
    );

    const legacyDetail = await admin.query(
      (api as any).production_proposals.getActiveBuildDetailByString,
      { buildId: String(closing.buildId), workosOrganizationId: ORG },
    );
    expect(legacyDetail.drawFunding).toMatchObject({
      attributionShortfallCents: 0,
      availableCents: 30_000_000,
      legacyUnattributedRequestCount: 1,
      requiresAttributionMigration: true,
      reservedCents: 10_000_000,
      unlockedCents: 40_000_000,
    });
    expect(legacyDetail.draws[0]).toMatchObject({
      sourceAllocations: [],
      status: "approved_for_release",
      workOrderKey: "DRWO-0042",
    });
    await expect(
      admin.mutation(
        (api as any).production_proposals.requestActiveBuildDraw,
        {
          amountCents: 1_000_000,
          buildId: closing.buildId,
          clientOperationId: "blocked-until-attributed",
          drawKey: "draw-01",
          workosOrganizationId: ORG,
        },
      ),
    ).rejects.toThrow("run the active-build draw attribution migration");

    const migrationReason =
      "Normalize legacy draw attribution and work orders.";
    const migrationPlan = await admin.mutation(
      (api as any).production_proposals.migrateActiveBuildDrawRequests,
      {
        buildId: closing.buildId,
        dryRun: true,
        reason: migrationReason,
        workosOrganizationId: ORG,
      },
    );
    expect(migrationPlan).toMatchObject({
      applied: false,
      attributed: 1,
      availableCents: 30_000_000,
      dryRun: true,
      migrated: 0,
      normalized: 1,
      replayed: false,
      reservedCents: 10_000_000,
      restoredForecasts: 0,
      skipped: 0,
      unlockedCents: 40_000_000,
    });
    expect(migrationPlan.planToken).toMatch(
      /^draw-release-work-order-attribution-v1:[a-f0-9]{64}$/,
    );
    const afterDryRun = await admin.run(async (ctx: any) => ({
      allocations: await ctx.db
        .query("activeBuildDrawRequestAllocations")
        .withIndex("by_request", (q: any) =>
          q.eq("drawRequestId", legacyRequestId),
        )
        .collect(),
      migrationAudits: (
        await ctx.db
          .query("auditEvents")
          .withIndex("by_entity", (q: any) =>
            q
              .eq("entityType", "activeBuild")
              .eq("entityId", String(closing.buildId)),
          )
          .collect()
      ).filter(
        (event: any) =>
          event.command === "migrateActiveBuildDrawRequests",
      ),
      request: await ctx.db.get(legacyRequestId),
    }));
    expect(afterDryRun.request.workOrderKey).toBeUndefined();
    expect(afterDryRun.allocations).toHaveLength(0);
    expect(afterDryRun.migrationAudits).toHaveLength(0);

    await expect(
      admin.mutation(
        (api as any).production_proposals.migrateActiveBuildDrawRequests,
        {
          buildId: closing.buildId,
          dryRun: false,
          reason: "Execute legacy Draw Release Work Order attribution.",
          workosOrganizationId: ORG,
        },
      ),
    ).rejects.toThrow("Run dryRun=true again");

    const applied = await admin.mutation(
      (api as any).production_proposals.migrateActiveBuildDrawRequests,
        {
          buildId: closing.buildId,
          dryRun: false,
          expectedPlanToken: migrationPlan.planToken,
          reason: "Execute legacy Draw Release Work Order attribution.",
        workosOrganizationId: ORG,
      },
    );
    expect(applied).toMatchObject({
      applied: true,
      attributed: 1,
      availableCents: 30_000_000,
      dryRun: false,
      migrated: 0,
      normalized: 1,
      replayed: false,
      reservedCents: 10_000_000,
      restoredForecasts: 0,
      skipped: 0,
      unlockedCents: 40_000_000,
    });

    const migrated = await admin.run(async (ctx: any) => ({
      allocations: await ctx.db
        .query("activeBuildDrawRequestAllocations")
        .withIndex("by_request", (q: any) =>
          q.eq("drawRequestId", legacyRequestId),
        )
        .collect(),
      request: await ctx.db.get(legacyRequestId),
    }));
    expect(migrated.request).toMatchObject({
      status: "approved_for_release",
      workOrderKey: "DRWO-0042",
    });
    expect(migrated.allocations).toEqual([
      expect.objectContaining({
        amountCents: 10_000_000,
        drawGroupKey: "draw-01",
        milestoneKey: "foundation",
        organizationId: ORG,
      }),
    ]);

    const detail = await admin.query(
      (api as any).production_proposals.getActiveBuildDetailByString,
      { buildId: String(closing.buildId), workosOrganizationId: ORG },
    );
    expect(detail.drawFunding).toMatchObject({
      availableCents: 30_000_000,
      reservedCents: 10_000_000,
    });
    expect(detail.draws[0]).toMatchObject({
      sourceAllocations: [
        expect.objectContaining({
          amountCents: 10_000_000,
          milestoneKey: "foundation",
        }),
      ],
      status: "approved_for_release",
      workOrderKey: "DRWO-0042",
    });

    const replay = await admin.mutation(
      (api as any).production_proposals.migrateActiveBuildDrawRequests,
      {
        buildId: closing.buildId,
        dryRun: false,
        expectedPlanToken: migrationPlan.planToken,
        reason: "Replay the confirmed migration command safely.",
        workosOrganizationId: ORG,
      },
    );
    expect(replay).toMatchObject({
      applied: false,
      attributed: 0,
      availableCents: 30_000_000,
      dryRun: false,
      migrated: 0,
      normalized: 0,
      replayed: true,
      reservedCents: 10_000_000,
      restoredForecasts: 0,
      skipped: 0,
      unlockedCents: 40_000_000,
    });
    const afterReplay = await admin.run(async (ctx: any) => ({
      allocations: await ctx.db
        .query("activeBuildDrawRequestAllocations")
        .withIndex("by_request", (q: any) =>
          q.eq("drawRequestId", legacyRequestId),
        )
        .collect(),
      migrationAudits: (
        await ctx.db
          .query("auditEvents")
          .withIndex("by_entity", (q: any) =>
            q
              .eq("entityType", "activeBuild")
              .eq("entityId", String(closing.buildId)),
          )
          .collect()
      ).filter(
        (event: any) =>
          event.command === "migrateActiveBuildDrawRequests",
      ),
    }));
    expect(afterReplay.allocations).toHaveLength(1);
    expect(afterReplay.migrationAudits).toHaveLength(1);
    expect(afterReplay.migrationAudits[0]).toMatchObject({
      actorWorkosUserId: "user_admin",
      organizationId: ORG,
      reason: "Execute legacy Draw Release Work Order attribution.",
    });
    expect(afterReplay.migrationAudits[0].actorRoles).toContain("admin");
    expect(afterReplay.migrationAudits[0].newState).toContain(
      migrationPlan.planToken,
    );
  });

  test("dry-runs, applies, and idempotently replays legacy lifecycle-row migration", async () => {
    const { seed, t: admin } = await seeded(["admin"], "user_admin");
    const closing = await createClosedSingleMilestoneBuild(admin, seed);
    await unlockActiveBuildMilestoneForDraw(admin, closing.buildId);
    const legacy = await admin.run(async (ctx: any) => {
      const row = await ctx.db
        .query("plannedDrawScheduleRows")
        .withIndex("by_build", (q: any) =>
          q.eq("buildId", closing.buildId),
        )
        .unique();
      if (!row) throw new Error("Test planned draw row not found.");
      const proposalRow = await ctx.db.get(row.proposalDrawScheduleRowId);
      if (!proposalRow) throw new Error("Test proposal draw row not found.");
      await ctx.db.patch(row._id, {
        amountCents: 12_000_000,
        requestNote: "Legacy foundation reimbursement.",
        requestedAt: "2026-07-01T12:00:00.000Z",
        status: "requested",
        updatedAt: 100,
      });
      return {
        originalProposalAmountCents: proposalRow.amountCents,
        rowId: row._id,
      };
    });
    const args = {
      buildId: closing.buildId,
      dryRun: true,
      reason: "Preview legacy lifecycle-row work order migration.",
      workosOrganizationId: ORG,
    };
    const preview = await admin.mutation(
      (api as any).production_proposals.migrateActiveBuildDrawRequests,
      args,
    );
    expect(preview).toMatchObject({
      applied: false,
      attributed: 0,
      availableCents: 28_000_000,
      dryRun: true,
      migrated: 1,
      normalized: 0,
      replayed: false,
      reservedCents: 12_000_000,
      restoredForecasts: 1,
      skipped: 0,
      unlockedCents: 40_000_000,
    });
    expect(preview.warnings).toEqual([
      expect.stringContaining("original requester identity"),
    ]);
    const dryRunState = await admin.run(async (ctx: any) => ({
      requests: await ctx.db
        .query("activeBuildDrawRequests")
        .withIndex("by_build", (q: any) =>
          q.eq("buildId", closing.buildId),
        )
        .collect(),
      row: await ctx.db.get(legacy.rowId),
    }));
    expect(dryRunState.requests).toHaveLength(0);
    expect(dryRunState.row).toMatchObject({
      amountCents: 12_000_000,
      status: "requested",
    });

    await expect(
      admin.mutation(
        (api as any).production_proposals.migrateActiveBuildDrawRequests,
        {
          ...args,
          dryRun: false,
          expectedPlanToken: `${preview.planToken}-stale`,
        },
      ),
    ).rejects.toThrow("plan changed or was not confirmed");

    const applyArgs = {
      ...args,
      dryRun: false,
      expectedPlanToken: preview.planToken,
      reason: "Execute approved legacy lifecycle-row work order migration.",
    };
    const applied = await admin.mutation(
      (api as any).production_proposals.migrateActiveBuildDrawRequests,
      applyArgs,
    );
    expect(applied).toMatchObject({
      applied: true,
      migrated: 1,
      replayed: false,
      restoredForecasts: 1,
    });
    const migratedState = await admin.run(async (ctx: any) => ({
      allocations: await ctx.db
        .query("activeBuildDrawRequestAllocations")
        .withIndex("by_build", (q: any) =>
          q.eq("buildId", closing.buildId),
        )
        .collect(),
      capitalEvents: (
        await ctx.db
          .query("capitalEvents")
          .withIndex("by_build", (q: any) =>
            q.eq("buildId", closing.buildId),
          )
          .collect()
      ).filter((event: any) => event.eventType === "draw_release"),
      requests: await ctx.db
        .query("activeBuildDrawRequests")
        .withIndex("by_build", (q: any) =>
          q.eq("buildId", closing.buildId),
        )
        .collect(),
      row: await ctx.db.get(legacy.rowId),
    }));
    expect(migratedState.requests).toHaveLength(1);
    expect(migratedState.requests[0]).toMatchObject({
      amountCents: 12_000_000,
      clientOperationId: `migration:${String(legacy.rowId)}`,
      organizationId: ORG,
      requestedByWorkosUserId: "user_admin",
      status: "requested",
      workOrderKey: "DRWO-0001",
    });
    expect(migratedState.allocations).toEqual([
      expect.objectContaining({
        amountCents: 12_000_000,
        milestoneKey: "foundation",
        organizationId: ORG,
      }),
    ]);
    expect(migratedState.row).toMatchObject({
      amountCents: legacy.originalProposalAmountCents,
      status: "planned",
    });
    expect(migratedState.capitalEvents).toHaveLength(0);

    const replay = await admin.mutation(
      (api as any).production_proposals.migrateActiveBuildDrawRequests,
      applyArgs,
    );
    expect(replay).toMatchObject({
      applied: false,
      attributed: 0,
      availableCents: 28_000_000,
      migrated: 0,
      normalized: 0,
      replayed: true,
      reservedCents: 12_000_000,
      restoredForecasts: 0,
      skipped: 1,
      unlockedCents: 40_000_000,
    });
    const replayCounts = await admin.run(async (ctx: any) => ({
      allocations: await ctx.db
        .query("activeBuildDrawRequestAllocations")
        .withIndex("by_build", (q: any) =>
          q.eq("buildId", closing.buildId),
        )
        .collect(),
      migrationAudits: (
        await ctx.db
          .query("auditEvents")
          .withIndex("by_entity", (q: any) =>
            q
              .eq("entityType", "activeBuild")
              .eq("entityId", String(closing.buildId)),
          )
          .collect()
      ).filter(
        (event: any) =>
          event.command === "migrateActiveBuildDrawRequests",
      ),
      requests: await ctx.db
        .query("activeBuildDrawRequests")
        .withIndex("by_build", (q: any) =>
          q.eq("buildId", closing.buildId),
        )
        .collect(),
    }));
    expect(replayCounts.requests).toHaveLength(1);
    expect(replayCounts.allocations).toHaveLength(1);
    expect(replayCounts.migrationAudits).toHaveLength(1);
  });

  test("rejects non-reimbursement and cross-organization legacy draw migration", async () => {
    const { seed, t: admin } = await seeded(["admin"], "user_admin");
    const closing = await createClosedSingleMilestoneBuild(admin, seed);
    const legacyRowId = await admin.run(async (ctx: any) => {
      const row = await ctx.db
        .query("plannedDrawScheduleRows")
        .withIndex("by_build", (q: any) =>
          q.eq("buildId", closing.buildId),
        )
        .unique();
      if (!row) throw new Error("Test planned draw row not found.");
      await ctx.db.patch(row._id, {
        amountCents: 1_000_000,
        requestedAt: "2026-07-01T12:00:00.000Z",
        status: "requested",
      });
      return row._id;
    });
    await expect(
      admin.mutation(
        (api as any).production_proposals.migrateActiveBuildDrawRequests,
        {
          buildId: closing.buildId,
          dryRun: true,
          reason: "Verify reimbursement eligibility enforcement.",
          workosOrganizationId: ORG,
        },
      ),
    ).rejects.toThrow("available source buckets");
    await unlockActiveBuildMilestoneForDraw(admin, closing.buildId);
    await admin.run(async (ctx: any) => {
      await ctx.db.patch(legacyRowId, { organizationId: "org_other" });
    });
    await expect(
      admin.mutation(
        (api as any).production_proposals.migrateActiveBuildDrawRequests,
        {
          buildId: closing.buildId,
          dryRun: true,
          reason: "Verify organization attribution enforcement.",
          workosOrganizationId: ORG,
        },
      ),
    ).rejects.toThrow("organization, brokerage, or build attribution");
    const state = await admin.run(async (ctx: any) => ({
      allocations: await ctx.db
        .query("activeBuildDrawRequestAllocations")
        .withIndex("by_build", (q: any) =>
          q.eq("buildId", closing.buildId),
        )
        .collect(),
      requests: await ctx.db
        .query("activeBuildDrawRequests")
        .withIndex("by_build", (q: any) =>
          q.eq("buildId", closing.buildId),
        )
        .collect(),
    }));
    expect(state.requests).toHaveLength(0);
    expect(state.allocations).toHaveLength(0);
  });

  test("serializes competing draw reservations without over-allocating capacity", async () => {
    const { base, seed, t } = await seeded(["admin"], "user_admin");
    const closing = await createClosedSingleMilestoneBuild(t, seed);
    await unlockActiveBuildMilestoneForDraw(t, closing.buildId);
    const builder = withIdentity(base, ["builder"], "user_builder");

    const results = await Promise.allSettled([
      builder.mutation(
        (api as any).production_proposals.requestActiveBuildDraw,
        {
          amountCents: 30_000_000,
          buildId: closing.buildId,
          clientOperationId: "competing-reservation-a",
          drawKey: "draw-01",
          note: "Competing reservation A.",
          workosOrganizationId: ORG,
        },
      ),
      builder.mutation(
        (api as any).production_proposals.requestActiveBuildDraw,
        {
          amountCents: 30_000_000,
          buildId: closing.buildId,
          clientOperationId: "competing-reservation-b",
          drawKey: "draw-01",
          note: "Competing reservation B.",
          workosOrganizationId: ORG,
        },
      ),
    ]);

    expect(
      results.filter((result) => result.status === "fulfilled"),
    ).toHaveLength(1);
    expect(
      results.filter((result) => result.status === "rejected"),
    ).toHaveLength(1);
    const detail = await builder.query(
      (api as any).production_proposals.getActiveBuildDetailByString,
      { buildId: String(closing.buildId), workosOrganizationId: ORG },
    );
    const reservedCents = detail.draws
      .filter((draw: any) => draw.status === "requested")
      .reduce((total: number, draw: any) => total + draw.amountCents, 0);
    expect(reservedCents).toBe(30_000_000);
    expect(reservedCents).toBeLessThanOrEqual(40_000_000);
  });

  test("keeps impossible or stale auto-requested draws out of backoffice review queues", async () => {
    const { base, seed, t } = await seeded(["admin"], "user_admin");
    const closing = await createClosedSingleMilestoneBuild(t, seed);
    const builder = withIdentity(base, ["builder"], "user_builder");

    await expect(
      builder.mutation(
        (api as any).production_proposals.requestActiveBuildDraw,
        {
          amountCents: 1_000_000,
          buildId: closing.buildId,
          clientOperationId: "blocked-before-admin-gates",
          drawKey: "draw-01",
          note: "Attempting to request before milestone approval.",
          workosOrganizationId: ORG,
        },
      ),
    ).rejects.toThrow("exceeds the available draw limit");

    const beforeCorruption = await t.query(
      (api as any).production_proposals.getBackofficeDashboard,
      { workosOrganizationId: ORG },
    );
    expect(beforeCorruption.drawRequests).toHaveLength(0);

    await t.run(async (ctx: any) => {
      const plannedRows = await ctx.db
        .query("plannedDrawScheduleRows")
        .withIndex("by_build_order", (q: any) =>
          q.eq("buildId", closing.buildId),
        )
        .collect();
      expect(plannedRows).toHaveLength(1);
      await ctx.db.patch(plannedRows[0]._id, {
        requestNote: "Stale auto-request should not surface for review.",
        requestedAt: "2026-07-15T12:00:00.000Z",
        status: "requested",
        updatedAt: Date.now(),
      });
    });

    const dashboard = await t.query(
      (api as any).production_proposals.getBackofficeDashboard,
      { workosOrganizationId: ORG },
    );
    expect(dashboard.drawRequests).toHaveLength(0);

    const roster = await t.query(
      (api as any).production_proposals.listBackofficeBuildRoster,
      { workosOrganizationId: ORG },
    );
    expect(
      roster.builds.find((build: any) => build.buildId === closing.buildId),
    ).toMatchObject({ drawRequestsPending: 0 });
  });

  test("invalid active build draw requests leave no partial mutation and surface typed recovery context", async () => {
    const { base, seed, t } = await seeded(["admin"], "user_admin");
    const closing = await createClosedSingleMilestoneBuild(t, seed, {
      buildName: "Typed draw error build",
      location: "73 Typed Error Way",
    });
    const builder = withIdentity(base, ["builder"], "user_builder");

    const before = await t.run(async (ctx: any) => {
      const plannedRows = await ctx.db
        .query("plannedDrawScheduleRows")
        .withIndex("by_build_order", (q: any) =>
          q.eq("buildId", closing.buildId),
        )
        .collect();
      const drawRequests = await ctx.db
        .query("activeBuildDrawRequests")
        .withIndex("by_build", (q: any) => q.eq("buildId", closing.buildId))
        .collect();
      const auditEvents = await ctx.db
        .query("auditEvents")
        .withIndex("by_entity", (q: any) =>
          q
            .eq("entityType", "activeBuild")
            .eq("entityId", String(closing.buildId)),
        )
        .collect();
      const outbox = await ctx.db.query("eventOutbox").collect();
      return {
        auditCount: auditEvents.filter(
          (event: any) => event.eventType === "active_build.draw.requested",
        ).length,
        drawRequestCount: drawRequests.length,
        outboxCount: outbox.filter(
          (event: any) =>
            event.eventType === "active_build.draw.requested" &&
            String(event.relatedEntityId) === String(closing.buildId),
        ).length,
        plannedRows: plannedRows.map((row: any) => ({
          drawKey: row.drawKey,
          requestNote: row.requestNote,
          requestedAt: row.requestedAt,
          status: row.status,
        })),
      };
    });

    const rejection = await builder
      .mutation((api as any).production_proposals.requestActiveBuildDraw, {
        amountCents: 1_000_000,
        buildId: closing.buildId,
        clientOperationId: "typed-recovery-error",
        drawKey: "draw-01",
        note: "Attempting a draw before milestone approval.",
        workosOrganizationId: ORG,
      })
      .then(
        () => null,
        (error: any) => error,
      );

    expect(rejection).toBeTruthy();

    const after = await t.run(async (ctx: any) => {
      const plannedRows = await ctx.db
        .query("plannedDrawScheduleRows")
        .withIndex("by_build_order", (q: any) =>
          q.eq("buildId", closing.buildId),
        )
        .collect();
      const drawRequests = await ctx.db
        .query("activeBuildDrawRequests")
        .withIndex("by_build", (q: any) => q.eq("buildId", closing.buildId))
        .collect();
      const auditEvents = await ctx.db
        .query("auditEvents")
        .withIndex("by_entity", (q: any) =>
          q
            .eq("entityType", "activeBuild")
            .eq("entityId", String(closing.buildId)),
        )
        .collect();
      const outbox = await ctx.db.query("eventOutbox").collect();
      return {
        auditCount: auditEvents.filter(
          (event: any) => event.eventType === "active_build.draw.requested",
        ).length,
        drawRequestCount: drawRequests.length,
        outboxCount: outbox.filter(
          (event: any) =>
            event.eventType === "active_build.draw.requested" &&
            String(event.relatedEntityId) === String(closing.buildId),
        ).length,
        plannedRows: plannedRows.map((row: any) => ({
          drawKey: row.drawKey,
          requestNote: row.requestNote,
          requestedAt: row.requestedAt,
          status: row.status,
        })),
      };
    });
    const dashboard = await t.query(
      (api as any).production_proposals.getBackofficeDashboard,
      { workosOrganizationId: ORG },
    );

    expect(after).toEqual(before);
    expect(dashboard.drawRequests).toHaveLength(0);
    expect(rejection).toMatchObject({
      data: expect.objectContaining({
        code: "ACTIVE_BUILD_DRAW_REQUEST_INVALID",
        recoverable: true,
        safeMessage: expect.any(String),
      }),
    });
  });

  test("requires a nonblank rejection reason for active build draws", async () => {
    const { base, seed, t } = await seeded(["admin"], "user_admin");
    const closing = await createClosedSingleMilestoneBuild(t, seed);
    await unlockActiveBuildMilestoneForDraw(t, closing.buildId);
    const builder = withIdentity(base, ["builder"], "user_builder");
    const receipt = await builder.mutation(
      (api as any).production_proposals.requestActiveBuildDraw,
      {
        amountCents: 5_000_000,
        buildId: closing.buildId,
        clientOperationId: "reject-reason-required",
        drawKey: "draw-01",
        note: "Ready for review.",
        workosOrganizationId: ORG,
      },
    );
    await t.mutation(
      (api as any).production_proposals.startActiveBuildDrawReview,
      {
        buildId: closing.buildId,
        drawKey: receipt.requestKey,
        workosOrganizationId: ORG,
      },
    );
    await t.mutation(
      (api as any).production_proposals.submitActiveBuildDrawForAdmin,
      {
        buildId: closing.buildId,
        drawKey: receipt.requestKey,
        note: "Operations review complete.",
        workosOrganizationId: ORG,
      },
    );

    await expect(
      t.mutation((api as any).production_proposals.rejectActiveBuildDraw, {
        buildId: closing.buildId,
        drawKey: receipt.requestKey,
        note: "   ",
        workosOrganizationId: ORG,
      }),
    ).rejects.toThrow(/reason/i);

    await expect(
      t.mutation((api as any).production_proposals.rejectActiveBuildDraw, {
        buildId: closing.buildId,
        drawKey: receipt.requestKey,
        workosOrganizationId: ORG,
      }),
    ).rejects.toThrow(/note/i);
    await expect(
      t.mutation((api as any).production_proposals.rejectActiveBuildDraw, {
        buildId: closing.buildId,
        drawKey: receipt.requestKey,
        note: "",
        workosOrganizationId: ORG,
      }),
    ).rejects.toThrow(/reason/i);

    const reason = "Invoice total does not match verified work.";
    await t.mutation((api as any).production_proposals.rejectActiveBuildDraw, {
      buildId: closing.buildId,
      drawKey: receipt.requestKey,
      note: reason,
      workosOrganizationId: ORG,
    });
    const detail = await t.query(
      (api as any).production_proposals.getActiveBuildDetailByString,
      { buildId: String(closing.buildId), workosOrganizationId: ORG },
    );
    expect(detail.draws[0]).toMatchObject({
      nextAction: "Correct the request and submit it again for review.",
      requestReviewNote: reason,
      reviewedByWorkosUserId: "user_admin",
      status: "rejected",
    });
    const rejectionAudit = await t.run(
      async (ctx: any) =>
        await ctx.db
          .query("auditEvents")
          .withIndex("by_entity", (q: any) =>
            q
              .eq("entityType", "activeBuild")
              .eq("entityId", String(closing.buildId)),
          )
          .filter((q: any) =>
            q.eq(q.field("eventType"), "active_build.draw.rejected"),
          )
          .unique(),
    );
    expect(rejectionAudit).toMatchObject({
      actorRoles: expect.arrayContaining(["admin"]),
      actorWorkosUserId: "user_admin",
      command: "rejectActiveBuildDraw",
      newState: expect.any(String),
      priorState: expect.any(String),
      reason,
      warnings: [],
    });
  });

  test("requires backoffice authorization for the production backoffice dashboard", async () => {
    const { base, t } = await seeded(["admin"], "user_admin");

    await t.mutation(
      (api as any).production_proposals.dev_seedProductionProposalScenarios,
      { workosOrganizationId: ORG },
    );

    await expect(
      withIdentity(base, ["builder"], "user_builder").query(
        (api as any).production_proposals.getBackofficeDashboard,
        { workosOrganizationId: ORG },
      ),
    ).rejects.toThrow(/Forbidden: backoffice/);
    await expect(
      t.query((api as any).production_proposals.getBackofficeDashboard, {
        workosOrganizationId: "org_other",
      }),
    ).rejects.toThrow(/Forbidden/);
  });

  test("allows brokerage proposal reads while limiting broker writes by assignment", async () => {
    const { base, seed, t } = await seeded(["admin"], "user_admin");
    const proposalId = await t.mutation(
      (api as any).production_proposals.createDraftProposal,
      {
        brokerageId: seed.brokerageId,
        builderProfileId: seed.builderProfileId,
        buildName: "Scoped proposal",
        location: "789 Scope Street",
        workosOrganizationId: ORG,
      },
    );
    await t.mutation(
      (api as any).production_proposals.saveDraftProposalPackage,
      {
        borrowerCoPayBps: 2_000,
        borrowerWorkingCapitalLimitCents: 40_000_000,
        lenderDrawPolicyLimitCents: 55_000_000,
        milestones: [
          {
            budgetCents: 50_000_000,
            dayEnd: 30,
            dayStart: 0,
            dependencyKeys: [],
            durationDays: 30,
            key: "foundation",
            name: "Foundation",
            order: 1,
            submilestones: [],
          },
        ],
        proposalId,
        workosOrganizationId: ORG,
      },
    );
    await submitProposalForTest(t, proposalId);

    const broker = withIdentity(base, ["broker"], "user_broker");
    await expect(
      broker.query((api as any).production_proposals.getProposalDetail, {
        proposalId,
        workosOrganizationId: ORG,
      }),
    ).resolves.toMatchObject({
      proposal: { buildName: "Scoped proposal", status: "submitted" },
    });
    let brokerKanban = await broker.query(
      (api as any).production_proposals.listProposalKanban,
      { workosOrganizationId: ORG },
    );
    expect(
      brokerKanban.columns.flatMap((column: any) =>
        column.cards.map((card: any) => card.proposalId),
      ),
    ).toEqual([proposalId]);
    const brokerDashboard = await broker.query(
      (api as any).production_proposals.getBackofficeDashboard,
      { workosOrganizationId: ORG },
    );
    expect(
      brokerDashboard.submittedProposals.map(
        (proposal: any) => proposal.proposalId,
      ),
    ).toEqual([proposalId]);
    await expect(
      broker.mutation(
        (api as any).production_proposals
          .updateSubmittedProposalDrawScheduleRow,
        {
          drawKey: "draw-01",
          label: "Broker unassigned edit",
          proposalId,
          reason: "Unassigned broker should not edit submitted draw schedule.",
          workosOrganizationId: ORG,
        },
      ),
    ).rejects.toThrow(/Forbidden: proposal write/);

    await t.run(async (ctx: any) => {
      await ctx.db.patch(ctx.db.normalizeId("buildProposals", proposalId)!, {
        assignedBrokerWorkosUserId: "user_broker",
      });
    });
    await expect(
      broker.query((api as any).production_proposals.getProposalDetail, {
        proposalId,
        workosOrganizationId: ORG,
      }),
    ).resolves.toMatchObject({
      proposal: { assignedBrokerWorkosUserId: "user_broker" },
    });
    await expect(
      broker.mutation(
        (api as any).production_proposals
          .updateSubmittedProposalDrawScheduleRow,
        {
          drawKey: "draw-01",
          label: "Assigned broker edit",
          proposalId,
          reason: "Assigned broker edits submitted draw schedule.",
          workosOrganizationId: ORG,
        },
      ),
    ).resolves.toBeNull();

    brokerKanban = await broker.query(
      (api as any).production_proposals.listProposalKanban,
      { workosOrganizationId: ORG },
    );
    expect(
      brokerKanban.columns.flatMap((column: any) =>
        column.cards.map((card: any) => card.proposalId),
      ),
    ).toEqual([proposalId]);

    const wrongOrg = "org_other";
    await t.run(async (ctx: any) => {
      await ctx.db.insert("workosOrganizations", {
        createdAt: Date.now(),
        domains: [],
        name: "Other Org",
        sourceEventId: "seed_other_org",
        sourceEventType: "seed.production_foundation",
        status: "active",
        updatedAt: Date.now(),
        workosOrganizationId: wrongOrg,
      });
      await ctx.db.insert("workosOrganizationMemberships", {
        createdAt: Date.now(),
        roleSlug: "broker",
        roleSlugs: ["broker"],
        sourceEventId: "seed_other_membership",
        sourceEventType: "seed.production_foundation",
        status: "active",
        updatedAt: Date.now(),
        workosMembershipId: "seed_other_membership",
        workosOrganizationId: wrongOrg,
        workosUserId: "user_broker",
      });
    });
    await expect(
      broker.query((api as any).production_proposals.getProposalDetail, {
        proposalId,
        workosOrganizationId: wrongOrg,
      }),
    ).rejects.toThrow(/Forbidden/);

    await t.run(async (ctx: any) => {
      await ctx.db.insert("users", {
        authId: "user_staff",
        email: "user_staff@example.com",
        name: "Staff",
        sourceEventId: "seed_staff",
        sourceEventType: "seed.production_foundation",
        status: "active",
        workosUserId: "user_staff",
      });
      await ctx.db.insert("workosOrganizationMemberships", {
        roleSlug: "broker-staff",
        roleSlugs: ["broker-staff"],
        sourceEventId: "seed_staff_membership",
        sourceEventType: "seed.production_foundation",
        status: "active",
        workosMembershipId: "seed_staff_membership",
        workosOrganizationId: ORG,
        workosUserId: "user_staff",
      });
    });
    const staffWithoutPermission = withIdentity(
      base,
      ["broker-staff"],
      "user_staff",
    );
    await expect(
      staffWithoutPermission.query(
        (api as any).production_proposals.getProposalDetail,
        {
          proposalId,
          workosOrganizationId: ORG,
        },
      ),
    ).rejects.toThrow(/Forbidden/);

    await t.run(async (ctx: any) => {
      await ctx.db.insert("workosOrganizationRoles", {
        name: "Broker Staff",
        permissionSlugs: ["proposals:read"],
        resourceTypeSlug: "organization",
        slug: "broker-staff",
        sourceEventId: "seed_staff_role",
        sourceEventType: "seed.production_foundation",
        status: "active",
        workosOrganizationId: ORG,
      });
    });
    await expect(
      staffWithoutPermission.query(
        (api as any).production_proposals.getProposalDetail,
        {
          proposalId,
          workosOrganizationId: ORG,
        },
      ),
    ).resolves.toMatchObject({ proposal: { buildName: "Scoped proposal" } });
  });
});

describe("recipient delivery inbox", () => {
  test("serves only recipient-scoped deliveries and supports legal read, dismiss, and resolve actions", async () => {
    const { base, seed, t: admin } = await seeded(["admin"], "user_admin");
    const now = Date.now();
    const builderDeliveryId = await admin.run(async (ctx: any) =>
      ctx.db.insert("recipientDeliveries", {
        actionLabel: "Open build",
        actionRequired: true,
        body: "Review the returned milestone decision and continue the build.",
        brokerageId: seed.brokerageId,
        createdAt: now,
        dedupeKey: "milestone-return:build-01:foundation",
        entityId: "build-01",
        entityLabel: "Builder Active Build · Foundation",
        entityType: "activeBuild",
        href: "/builder/builds/build-01?milestone=foundation",
        organizationId: ORG,
        recipientWorkosUserId: "user_builder",
        resolutionMode: "recipient",
        sourceLabel: "Lender Operations",
        status: "unread",
        title: "Milestone decision returned",
        updatedAt: now,
      }),
    );
    await admin.run(async (ctx: any) =>
      ctx.db.insert("recipientDeliveries", {
        actionLabel: "Open proposal",
        actionRequired: true,
        body: "This delivery belongs to another recipient.",
        brokerageId: seed.brokerageId,
        createdAt: now,
        dedupeKey: "proposal-review:other",
        entityId: "proposal-other",
        entityLabel: "Other proposal",
        entityType: "proposal",
        href: "/builder/proposals/proposal-other",
        organizationId: ORG,
        recipientWorkosUserId: "user_other",
        resolutionMode: "domain",
        sourceLabel: "DrawFlow",
        status: "unread",
        title: "Other recipient delivery",
        updatedAt: now,
      }),
    );
    await grantOrgMembership(admin, {
      roleSlugs: ["builder"],
      subject: "user_other",
    });
    const builder = withIdentity(base, ["builder"], "user_builder");
    const other = withIdentity(base, ["builder"], "user_other");

    const inbox = await builder.query(
      (api as any).production_proposals.listRecipientInbox,
      { workosOrganizationId: ORG },
    );
    expect(inbox).toMatchObject({
      actionRequiredCount: 1,
      unreadCount: 1,
    });
    expect(inbox.deliveries).toEqual([
      expect.objectContaining({
        _id: builderDeliveryId,
        actionLabel: "Open build",
        entityLabel: "Builder Active Build · Foundation",
        resolutionMode: "recipient",
        sourceLabel: "Lender Operations",
        status: "unread",
        title: "Milestone decision returned",
      }),
    ]);
    expect(JSON.stringify(inbox)).not.toMatch(
      /recipientWorkosUserId|payloadPreview|requestId|stack/i,
    );

    await builder.mutation(
      (api as any).production_proposals.markRecipientDeliveryRead,
      { deliveryId: builderDeliveryId, workosOrganizationId: ORG },
    );
    await expect(
      other.mutation(
        (api as any).production_proposals.dismissRecipientDelivery,
        { deliveryId: builderDeliveryId, workosOrganizationId: ORG },
      ),
    ).rejects.toThrow(/Delivery unavailable/);
    await builder.mutation(
      (api as any).production_proposals.resolveRecipientDelivery,
      { deliveryId: builderDeliveryId, workosOrganizationId: ORG },
    );

    await expect(
      builder.query((api as any).production_proposals.listRecipientInbox, {
        includeResolved: true,
        workosOrganizationId: ORG,
      }),
    ).resolves.toMatchObject({
      actionRequiredCount: 0,
      deliveries: [expect.objectContaining({ status: "resolved" })],
      unreadCount: 0,
    });
  });

  test("deduplicates repeated milestone decision deliveries while preserving workflow audit", async () => {
    const { base, seed, t: admin } = await seeded(["admin"], "user_admin");
    const closing = await createClosedSingleMilestoneBuild(admin, seed);
    const builder = withIdentity(base, ["builder"], "user_builder");

    await builder.mutation(
      (api as any).production_proposals.submitActiveBuildMilestoneCompletion,
      {
        actualCostCents: 30_000_000,
        actualStartedAt: Date.parse("2026-05-02T12:00:00.000Z"),
        buildId: closing.buildId,
        completedDay: 20,
        idempotencyKey: "delivery-completion-001",
        milestoneKey: "foundation",
        note: "Foundation ready for review.",
        workosOrganizationId: ORG,
      },
    );
    for (const note of [
      "Add the missing footing photos.",
      "Add the missing footing photos before resubmitting.",
    ]) {
      await admin.mutation(
        (api as any).production_proposals.rejectActiveBuildMilestone,
        {
          buildId: closing.buildId,
          milestoneKey: "foundation",
          note,
          workosOrganizationId: ORG,
        },
      );
    }

    const inbox = await builder.query(
      (api as any).production_proposals.listRecipientInbox,
      { workosOrganizationId: ORG },
    );
    expect(inbox.deliveries).toEqual([
      expect.objectContaining({
        actionLabel: "Review milestone",
        entityId: String(closing.buildId),
        resolutionMode: "domain",
        status: "unread",
        title: "Foundation changes requested",
      }),
    ]);
    expect(inbox.deliveries[0].body).toContain(
      "Add the missing footing photos before resubmitting.",
    );

    await builder.mutation(
      (api as any).production_proposals.submitActiveBuildMilestoneCompletion,
      {
        actualCostCents: 30_000_000,
        buildId: closing.buildId,
        completedDay: 21,
        idempotencyKey: "delivery-completion-resubmit-002",
        milestoneKey: "foundation",
        note: "Footing photos added for review.",
        workosOrganizationId: ORG,
      },
    );
    await expect(
      builder.query((api as any).production_proposals.listRecipientInbox, {
        includeResolved: true,
        workosOrganizationId: ORG,
      }),
    ).resolves.toMatchObject({
      actionRequiredCount: 0,
      deliveries: [expect.objectContaining({ status: "resolved" })],
      unreadCount: 0,
    });

    const records = await admin.run(async (ctx: any) => ({
      audits: await ctx.db
        .query("auditEvents")
        .withIndex("by_entity", (q: any) =>
          q.eq("entityType", "activeBuild").eq("entityId", closing.buildId),
        )
        .collect(),
      deliveries: await ctx.db
        .query("recipientDeliveries")
        .withIndex("by_recipient_dedupe", (q: any) =>
          q
            .eq("organizationId", ORG)
            .eq("recipientWorkosUserId", "user_builder")
            .eq(
              "dedupeKey",
              `milestone-decision:${closing.buildId}:foundation:rejected`,
            ),
        )
        .collect(),
    }));
    expect(records.deliveries).toHaveLength(1);
    expect(
      records.audits.filter(
        (event: any) => event.eventType === "active_build.milestone.rejected",
      ),
    ).toHaveLength(2);
  });

  test("delivers draw approval and release handoffs with canonical links and borrower acknowledgement", async () => {
    const { base, seed, t: admin } = await seeded(["admin"], "user_admin");
    const closing = await createClosedSingleMilestoneBuild(admin, seed);
    await unlockActiveBuildMilestoneForDraw(admin, closing.buildId);
    const builder = withIdentity(base, ["builder"], "user_builder");
    const receipt = await builder.mutation(
      (api as any).production_proposals.requestActiveBuildDraw,
      {
        amountCents: 12_000_000,
        buildId: closing.buildId,
        clientOperationId: "draw-handoff-001",
        drawKey: "draw-01",
        note: "Foundation reimbursement handoff.",
        workosOrganizationId: ORG,
      },
    );
    await admin.mutation(
      (api as any).production_proposals.startActiveBuildDrawReview,
      {
        buildId: closing.buildId,
        drawKey: receipt.requestKey,
        workosOrganizationId: ORG,
      },
    );
    await admin.mutation(
      (api as any).production_proposals.submitActiveBuildDrawForAdmin,
      {
        buildId: closing.buildId,
        drawKey: receipt.requestKey,
        note: "Operations recommends release.",
        workosOrganizationId: ORG,
      },
    );
    await admin.mutation(
      (api as any).production_proposals.approveActiveBuildDraw,
      {
        buildId: closing.buildId,
        drawKey: receipt.requestKey,
        note: "Evidence approved.",
        workosOrganizationId: ORG,
      },
    );
    await admin.mutation(
      (api as any).production_proposals.releaseActiveBuildDraw,
      {
        buildId: closing.buildId,
        drawKey: receipt.requestKey,
        note: "Reimbursement released.",
        releaseDate: "2026-06-15",
        workosOrganizationId: ORG,
      },
    );

    const inbox = await builder.query(
      (api as any).production_proposals.listRecipientInbox,
      { workosOrganizationId: ORG },
    );
    expect(inbox.deliveries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          actionLabel: "View draw",
          href: `/builder/builds/${closing.buildId}?tab=details&rail=open`,
          resolutionMode: "domain",
          title: `${receipt.displayId} approved`,
        }),
        expect.objectContaining({
          actionLabel: "Acknowledge release",
          actionRequired: true,
          href: `/builder/builds/${closing.buildId}?tab=details&rail=open`,
          resolutionMode: "recipient",
          title: `${receipt.displayId} funds released`,
        }),
      ]),
    );
    const releaseDelivery = inbox.deliveries.find(
      (delivery: any) => delivery.actionLabel === "Acknowledge release",
    );
    await builder.mutation(
      (api as any).production_proposals.resolveRecipientDelivery,
      { deliveryId: releaseDelivery._id, workosOrganizationId: ORG },
    );
    const acknowledged = await builder.query(
      (api as any).production_proposals.listRecipientInbox,
      { includeResolved: true, workosOrganizationId: ORG },
    );
    expect(
      acknowledged.deliveries.find(
        (delivery: any) => delivery._id === releaseDelivery._id,
      ),
    ).toMatchObject({ status: "resolved" });
  });
});

describe("draft builder assignment and deletion", () => {
  test("lists bounded active brokerage builder options without account projection data", async () => {
    const { seed, t: admin } = await seeded(["admin"], "user_admin");

    await admin.run(async (ctx: any) => {
      await ctx.db.insert("builderProfiles", {
        brokerageId: seed.brokerageId,
        createdAt: Date.now(),
        displayName: "Acme Builders",
        organizationId: ORG,
        status: "active",
        updatedAt: Date.now(),
      });
      await ctx.db.insert("builderProfiles", {
        brokerageId: seed.brokerageId,
        createdAt: Date.now(),
        displayName: "Retired Builders",
        organizationId: ORG,
        status: "inactive",
        updatedAt: Date.now(),
      });
    });

    const builders = await admin.query(
      (api as any).production_proposals.listActiveBrokerageBuilderOptions,
      { workosOrganizationId: ORG },
    );

    expect(builders.map((builder: any) => builder.displayName)).toEqual([
      "Acme Builders",
      "Production Builder",
    ]);
    expect(builders[0]).toEqual({
      _id: expect.any(String),
      displayName: "Acme Builders",
    });
    expect(builders[0]).not.toHaveProperty("email");
    expect(builders[0]).not.toHaveProperty("workosUserIds");
  });

  test("lists active brokerage builders sorted by name", async () => {
    const { base, seed, t: admin } = await seeded(["admin"], "user_admin");
    const broker = withIdentity(base, ["broker"], "user_broker");

    await admin.run(async (ctx: any) => {
      await ctx.db.insert("builderProfiles", {
        brokerageId: seed.brokerageId,
        createdAt: Date.now(),
        displayName: "Acme Builders",
        organizationId: ORG,
        status: "active",
        updatedAt: Date.now(),
      });
      await ctx.db.insert("builderProfiles", {
        brokerageId: seed.brokerageId,
        createdAt: Date.now(),
        displayName: "Retired Builders",
        organizationId: ORG,
        status: "inactive",
        updatedAt: Date.now(),
      });
    });

    const builders = await broker.query(
      (api as any).production_proposals.listBrokerageBuilders,
      { workosOrganizationId: ORG },
    );
    const names = builders.map((builder: any) => builder.displayName);
    expect(names).toContain("Acme Builders");
    expect(names).not.toContain("Retired Builders");
    expect([...names]).toEqual([...names].sort((a, b) => a.localeCompare(b)));
  });

  test("uses a verified builder account email in assignment options", async () => {
    const { base, seed, t: admin } = await seeded(["admin"], "user_admin");
    const broker = withIdentity(base, ["broker"], "user_broker");

    await admin.run(async (ctx: any) => {
      const now = Date.now();
      const builderProfileId = await ctx.db.insert("builderProfiles", {
        brokerageId: seed.brokerageId,
        createdAt: now,
        displayName: "Connor Beleznay",
        organizationId: ORG,
        status: "active",
        updatedAt: now,
      });
      await ctx.db.insert("users", {
        authId: "user_builder_unverified",
        email: "builder@example.com",
        emailVerified: false,
        name: "builder",
        status: "active",
        workosUserId: "user_builder_unverified",
      });
      await ctx.db.insert("users", {
        authId: "user_builder_verified",
        email: "c.beleznay@humanfeedback.com",
        emailVerified: true,
        name: "Connor Beleznay",
        status: "active",
        workosUserId: "user_builder_verified",
      });
      await ctx.db.insert("builderAccountLinks", {
        brokerageId: seed.brokerageId,
        builderProfileId,
        createdAt: now,
        role: "owner",
        status: "active",
        updatedAt: now,
        workosUserId: "user_builder_unverified",
      });
      await ctx.db.insert("builderAccountLinks", {
        brokerageId: seed.brokerageId,
        builderProfileId,
        createdAt: now + 1,
        role: "owner",
        status: "active",
        updatedAt: now + 1,
        workosUserId: "user_builder_verified",
      });
    });

    const builders = await broker.query(
      (api as any).production_proposals.listBrokerageBuilders,
      { workosOrganizationId: ORG },
    );
    expect(
      builders.find((builder: any) => builder.displayName === "Connor Beleznay"),
    ).toMatchObject({ email: "c.beleznay@humanfeedback.com" });
  });

  test("assigns a builder to an unassigned draft and reflects it on the kanban", async () => {
    const { base, seed, t: admin } = await seeded(["admin"], "user_admin");
    const broker = withIdentity(base, ["broker"], "user_broker");

    const proposalId = await broker.mutation(
      (api as any).production_proposals.createBrokerDraftProposal,
      { buildName: "Unassigned draft", workosOrganizationId: ORG },
    );

    const before = await admin.query(
      (api as any).production_proposals.listProposalKanban,
      { workosOrganizationId: ORG },
    );
    const draftBefore = before.columns
      .find((column: any) => column.id === "draft")
      .cards.find((card: any) => card.proposalId === proposalId);
    expect(draftBefore).toMatchObject({
      builderAssigned: false,
      builderName: "Unassigned builder",
    });
    await admin.run(async (ctx: any) => {
      const assignment = await ctx.db
        .query("builderBrokerAssignments")
        .withIndex("by_builderProfileId_and_status_and_effectiveAt", (q: any) =>
          q
            .eq("builderProfileId", seed.builderProfileId)
            .eq("status", "active"),
        )
        .first();
      await ctx.db.delete(assignment._id);
    });

    await admin.mutation((api as any).production_proposals.assignDraftBuilder, {
      builderProfileId: seed.builderProfileId,
      proposalId,
      workosOrganizationId: ORG,
    });

    const after = await admin.query(
      (api as any).production_proposals.listProposalKanban,
      { workosOrganizationId: ORG },
    );
    const draftAfter = after.columns
      .find((column: any) => column.id === "draft")
      .cards.find((card: any) => card.proposalId === proposalId);
    expect(draftAfter.builderAssigned).toBe(true);
    expect(draftAfter.builderName).not.toBe("Unassigned builder");

    const detail = await admin.query(
      (api as any).production_proposals.getProposalDetail,
      { proposalId, workosOrganizationId: ORG },
    );
    expect(detail.proposal.builderProfileId).toBe(seed.builderProfileId);
    expect(detail.auditEvents.map((event: any) => event.eventType)).toContain(
      "proposal.builder_assigned",
    );
    const brokerAssignment = await admin.run(async (ctx: any) =>
      ctx.db
        .query("builderBrokerAssignments")
        .withIndex("by_builderProfileId_and_status_and_effectiveAt", (q: any) =>
          q
            .eq("builderProfileId", seed.builderProfileId)
            .eq("status", "active"),
        )
        .first(),
    );
    expect(brokerAssignment).toMatchObject({
      assignedBrokerWorkosUserId: "user_admin",
      builderProfileId: seed.builderProfileId,
      status: "active",
    });
  });

  test("assigns a broker from the proposal packet and transfers the attached Builder relationship", async () => {
    const { base, seed, t: admin } = await seeded(["admin"], "user_admin");
    const proposalId = await admin.mutation(
      (api as any).production_proposals.createDraftProposal,
      {
        brokerageId: seed.brokerageId,
        builderProfileId: seed.builderProfileId,
        buildName: "Broker assignment packet",
        location: "11 Assignment Way",
        workosOrganizationId: ORG,
      },
    );
    await admin.run(async (ctx: any) => {
      const now = Date.now();
      await ctx.db.patch(proposalId, {
        assignedBrokerWorkosUserId: undefined,
      });
      await ctx.db.insert("builderBrokerAssignments", {
        assignedBrokerWorkosUserId: "user_admin",
        brokerageId: seed.brokerageId,
        builderProfileId: seed.builderProfileId,
        createdAt: now,
        effectiveAt: now,
        organizationId: ORG,
        status: "active",
        updatedAt: now,
      });
    });

    const result = await admin.mutation(
      (api as any).production_proposals.assignProposalBroker,
      {
        assignedBrokerWorkosUserId: "user_broker",
        proposalId,
        reason: "Assign River to own underwriting and proposal review.",
        workosOrganizationId: ORG,
      },
    );

    expect(result.operation).toBe("assigned");
    const detail = await admin.query(
      (api as any).production_proposals.getProposalDetail,
      { proposalId, workosOrganizationId: ORG },
    );
    expect(detail.assignment.broker.workosUserId).toBe("user_broker");
    expect(detail.auditEvents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          eventType: "proposal.broker_assigned",
          reason: "Assign River to own underwriting and proposal review.",
        }),
      ]),
    );

    const assignments = await admin.run((ctx: any) =>
      ctx.db
        .query("builderBrokerAssignments")
        .withIndex(
          "by_builderProfileId_and_status_and_effectiveAt",
          (q: any) => q.eq("builderProfileId", seed.builderProfileId),
        )
        .collect(),
    );
    expect(assignments).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          assignedBrokerWorkosUserId: "user_admin",
          status: "transferred",
        }),
        expect.objectContaining({
          assignedBrokerWorkosUserId: "user_broker",
          status: "active",
        }),
      ]),
    );

    const broker = withIdentity(base, ["broker"], "user_broker");
    await expect(
      broker.mutation(
        (api as any).production_proposals.assignProposalBroker,
        {
          assignedBrokerWorkosUserId: "user_admin",
          proposalId,
          reason: "Attempt a broker reassignment without principal authority.",
          workosOrganizationId: ORG,
        },
      ),
    ).rejects.toThrow(/Forbidden: role/);
  });

  test("assigns a builder to an unassigned submitted proposal", async () => {
    const { base, seed, t: admin } = await seeded(["admin"], "user_admin");
    const broker = withIdentity(base, ["broker"], "user_broker");
    const proposalId = await broker.mutation(
      (api as any).production_proposals.createBrokerDraftProposal,
      { buildName: "Submitted builder intake", workosOrganizationId: ORG },
    );
    await admin.run((ctx: any) =>
      ctx.db.patch(proposalId, { status: "submitted" }),
    );
    await admin.mutation(
      (api as any).production_proposals.assignProposalBuilder,
      {
        builderProfileId: seed.builderProfileId,
        proposalId,
        workosOrganizationId: ORG,
      },
    );

    const detail = await admin.query(
      (api as any).production_proposals.getProposalDetail,
      { proposalId, workosOrganizationId: ORG },
    );
    expect(detail.proposal.builderProfileId).toBe(seed.builderProfileId);
    expect(detail.assignment.builderAssigned).toBe(true);
    expect(detail.auditEvents.map((event: any) => event.eventType)).toContain(
      "proposal.builder_assigned",
    );
  });

  test("assigns a builder after proposal approval", async () => {
    const { base, seed, t: admin } = await seeded(["admin"], "user_admin");
    const broker = withIdentity(base, ["broker"], "user_broker");
    const proposalId = await broker.mutation(
      (api as any).production_proposals.createBrokerDraftProposal,
      { buildName: "Approved builder intake", workosOrganizationId: ORG },
    );
    await admin.run((ctx: any) =>
      ctx.db.patch(proposalId, { status: "approved" }),
    );

    await admin.mutation(
      (api as any).production_proposals.assignProposalBuilder,
      {
        builderProfileId: seed.builderProfileId,
        proposalId,
        workosOrganizationId: ORG,
      },
    );

    const detail = await admin.query(
      (api as any).production_proposals.getProposalDetail,
      { proposalId, workosOrganizationId: ORG },
    );
    expect(detail.proposal.status).toBe("approved");
    expect(detail.proposal.builderProfileId).toBe(seed.builderProfileId);
    expect(detail.assignment.builderAssigned).toBe(true);
    expect(detail.auditEvents.map((event: any) => event.eventType)).toContain(
      "proposal.builder_assigned",
    );
  });

  test("unassigns a builder from a draft and reflects it on the kanban", async () => {
    const { seed, t: admin } = await seeded(["admin"], "user_admin");
    const proposalId = await admin.mutation(
      (api as any).production_proposals.createDraftProposal,
      {
        brokerageId: seed.brokerageId,
        builderProfileId: seed.builderProfileId,
        buildName: "Assigned draft",
        location: "1 Assigned Rd",
        workosOrganizationId: ORG,
      },
    );

    await admin.mutation(
      (api as any).production_proposals.unassignDraftBuilder,
      { proposalId, workosOrganizationId: ORG },
    );

    const detail = await admin.query(
      (api as any).production_proposals.getProposalDetail,
      { proposalId, workosOrganizationId: ORG },
    );
    expect(detail.proposal.builderProfileId).toBeUndefined();
    expect(detail.assignment.builder).toBeNull();
    expect(detail.auditEvents.map((event: any) => event.eventType)).toContain(
      "proposal.builder_unassigned",
    );

    const kanban = await admin.query(
      (api as any).production_proposals.listProposalKanban,
      { workosOrganizationId: ORG },
    );
    const draftCard = kanban.columns
      .find((column: any) => column.id === "draft")
      .cards.find((card: any) => card.proposalId === proposalId);
    expect(draftCard).toMatchObject({
      builderAssigned: false,
      builderName: "Unassigned builder",
    });
  });

  test("creates a builder claim link and claims an unassigned draft into a builder profile", async () => {
    const { base, t: admin } = await seeded(["admin"], "user_admin");
    const broker = withIdentity(base, ["broker"], "user_broker");
    const claimant = withIdentity(base, ["member"], "user_claimant");

    const proposalId = await broker.mutation(
      (api as any).production_proposals.createBrokerDraftProposal,
      { buildName: "Unclaimed proposal", workosOrganizationId: ORG },
    );
    const link = await admin.mutation(
      (api as any).production_proposals.createDraftProposalClaimLink,
      { proposalId, workosOrganizationId: ORG },
    );

    expect(link.claimPath).toContain("/proposal-claim/");
    const preview = await base.query(
      (api as any).production_proposals.getProposalClaimPreview,
      { claimToken: link.claimToken },
    );
    expect(preview).toMatchObject({
      claimStatus: "active",
      milestoneCount: 0,
      proposal: { buildName: "Unclaimed proposal" },
      workosOrganizationId: ORG,
    });

    const claimed = await claimant.action(
      (api as any).production_proposals.claimDraftProposalLink,
      { claimToken: link.claimToken, workosOrganizationId: ORG },
    );
    expect(claimed.proposalId).toBe(proposalId);
    expect(claimed.workosMembershipId).toBe(
      `fake_membership_${ORG}_user_claimant`,
    );

    const claimantDetail = await claimant.query(
      (api as any).production_proposals.getProposalDetail,
      { proposalId, workosOrganizationId: ORG },
    );
    expect(claimantDetail.proposal.builderProfileId).toBe(
      claimed.builderProfileId,
    );
    expect(claimantDetail.assignment.builder.displayName).toBe("user_claimant");
    const brokerAssignment = await admin.run(async (ctx: any) =>
      ctx.db
        .query("builderBrokerAssignments")
        .withIndex("by_builderProfileId_and_status_and_effectiveAt", (q: any) =>
          q
            .eq("builderProfileId", claimed.builderProfileId)
            .eq("status", "active"),
        )
        .first(),
    );
    expect(brokerAssignment).toMatchObject({
      assignedBrokerWorkosUserId: "user_admin",
      builderProfileId: claimed.builderProfileId,
      organizationId: ORG,
      status: "active",
    });

    const claimedPreview = await base.query(
      (api as any).production_proposals.getProposalClaimPreview,
      { claimToken: link.claimToken },
    );
    expect(claimedPreview.claimStatus).toBe("claimed");
  });

  test("claim link onboards a fresh signed-in builder into the link brokerage", async () => {
    const { base, t: admin } = await seeded(["admin"], "user_admin");
    const broker = withIdentity(base, ["broker"], "user_broker");
    const claimant = withIdentity(base, [], "user_fresh_claimant");

    const proposalId = await broker.mutation(
      (api as any).production_proposals.createBrokerDraftProposal,
      { buildName: "Fresh claimant proposal", workosOrganizationId: ORG },
    );
    const link = await admin.mutation(
      (api as any).production_proposals.createDraftProposalClaimLink,
      { proposalId, workosOrganizationId: ORG },
    );

    const claimed = await claimant.action(
      (api as any).production_proposals.claimDraftProposalLink,
      { claimToken: link.claimToken, workosOrganizationId: ORG },
    );
    expect(claimed.workosMembershipId).toBe(
      `fake_membership_${ORG}_user_fresh_claimant`,
    );

    const claimantDetail = await claimant.query(
      (api as any).production_proposals.getProposalDetail,
      { proposalId, workosOrganizationId: ORG },
    );
    expect(claimantDetail.proposal.builderProfileId).toBe(
      claimed.builderProfileId,
    );
    expect(claimantDetail.assignment.builder.displayName).toBe(
      "user_fresh_claimant",
    );
  });

  test("rejects assigning a builder to an already-assigned draft", async () => {
    const { seed, t: admin } = await seeded(["admin"], "user_admin");
    const proposalId = await admin.mutation(
      (api as any).production_proposals.createDraftProposal,
      {
        brokerageId: seed.brokerageId,
        builderProfileId: seed.builderProfileId,
        buildName: "Already assigned",
        location: "1 Assigned Rd",
        workosOrganizationId: ORG,
      },
    );
    await expect(
      admin.mutation((api as any).production_proposals.assignDraftBuilder, {
        builderProfileId: seed.builderProfileId,
        proposalId,
        workosOrganizationId: ORG,
      }),
    ).rejects.toThrow(/already assigned/);
  });

  test("rejects assigning a builder once the proposal leaves draft", async () => {
    const { base, seed, t: admin } = await seeded(["admin"], "user_admin");
    const broker = withIdentity(base, ["broker"], "user_broker");
    const proposalId = await broker.mutation(
      (api as any).production_proposals.createBrokerDraftProposal,
      { buildName: "Will be submitted", workosOrganizationId: ORG },
    );
    await admin.run(async (ctx: any) => {
      await ctx.db.patch(proposalId, { status: "submitted" });
    });
    await expect(
      admin.mutation((api as any).production_proposals.assignDraftBuilder, {
        builderProfileId: seed.builderProfileId,
        proposalId,
        workosOrganizationId: ORG,
      }),
    ).rejects.toThrow(/Only draft proposals/);
  });

  test("deletes a draft along with its kanban card and plan children", async () => {
    const { base, t: admin } = await seeded(["admin"], "user_admin");
    const broker = withIdentity(base, ["broker"], "user_broker");
    const proposalId = await broker.mutation(
      (api as any).production_proposals.createBrokerDraftProposal,
      { buildName: "Deletable draft", workosOrganizationId: ORG },
    );

    await admin.mutation(
      (api as any).production_proposals.deleteDraftProposal,
      { proposalId, workosOrganizationId: ORG },
    );

    const kanban = await admin.query(
      (api as any).production_proposals.listProposalKanban,
      { workosOrganizationId: ORG },
    );
    const ids = kanban.columns.flatMap((column: any) =>
      column.cards.map((card: any) => card.proposalId),
    );
    expect(ids).not.toContain(proposalId);

    const leftovers = await admin.run(async (ctx: any) => ({
      card: await ctx.db
        .query("proposalKanbanCards")
        .withIndex("by_proposal", (q: any) => q.eq("proposalId", proposalId))
        .unique(),
      proposal: await ctx.db.get(proposalId),
    }));
    expect(leftovers.card).toBeNull();
    expect(leftovers.proposal).toBeNull();
  });

  test("rejects deleting a non-draft proposal", async () => {
    const { base, t: admin } = await seeded(["admin"], "user_admin");
    const broker = withIdentity(base, ["broker"], "user_broker");
    const proposalId = await broker.mutation(
      (api as any).production_proposals.createBrokerDraftProposal,
      { buildName: "Non-draft", workosOrganizationId: ORG },
    );
    await admin.run(async (ctx: any) => {
      await ctx.db.patch(proposalId, { status: "submitted" });
    });
    await expect(
      admin.mutation((api as any).production_proposals.deleteDraftProposal, {
        proposalId,
        workosOrganizationId: ORG,
      }),
    ).rejects.toThrow(/Only draft proposals/);
  });

  test("projects pending budget governance into access-valid builder live-build rows", async () => {
    const { base, seed, t: admin } = await seeded(["admin"], "user_admin");
    const closing = await createClosedSingleMilestoneBuild(admin, seed, {
      buildName: "Budget revision build",
    });
    const builder = withIdentity(base, ["builder"], "user_builder");

    await builder.mutation(
      (api as any).production_proposals.requestActiveBuildBudgetRevision,
      {
        borrowerCoPayBps: 2_000,
        borrowerWorkingCapitalLimitCents: 35_000_000,
        buildId: closing.buildId,
        lenderDrawPolicyLimitCents: 60_000_000,
        reason: "Approved framing costs increased.",
        workosOrganizationId: ORG,
      },
    );

    const kanban = await builder.query(
      (api as any).production_proposals.listProposalKanban,
      { workosOrganizationId: ORG },
    );
    const liveBuildCard = kanban.columns
      .flatMap((column: any) => column.cards)
      .find((card: any) => card.activeBuildId === String(closing.buildId));

    expect(liveBuildCard).toMatchObject({
      activeBuildId: String(closing.buildId),
      buildName: "Budget revision build",
      builderName: expect.any(String),
      drawCount: 1,
      milestoneCount: 1,
      milestonesBehindSchedule: 1,
      pendingDrawRequestCount: 0,
      budgetGovernance: {
        activeVersion: 1,
        affectedDrawRequestCount: 0,
        affectedMilestoneCount: 1,
        currentOwner: "Lender Admin",
        decisionStatus: "pending",
        proposedVersion: 2,
        revisionDeadline: null,
        revisionPriority: "required",
        varianceBps: 909,
        varianceCents: 5_000_000,
      },
    });
  });

  test("deletes an active build and clears the proposal link", async () => {
    const { seed, t: admin } = await seeded(["admin"], "user_admin");
    const proposalId = await admin.mutation(
      (api as any).production_proposals.createDraftProposal,
      {
        brokerageId: seed.brokerageId,
        builderProfileId: seed.builderProfileId,
        buildName: "Closable build",
        location: "12 Delete Lane",
        workosOrganizationId: ORG,
      },
    );
    await admin.mutation(
      (api as any).production_proposals.saveDraftProposalPackage,
      {
        borrowerCoPayBps: 2_000,
        borrowerWorkingCapitalLimitCents: 35_000_000,
        documents: [
          {
            documentType: "permit",
            fileName: "delete-build-permit.pdf",
            mimeType: "application/pdf",
            sizeBytes: 512,
          },
        ],
        lenderDrawPolicyLimitCents: 55_000_000,
        milestones: [
          {
            budgetCents: 50_000_000,
            dayEnd: 20,
            dayStart: 0,
            dependencyKeys: [],
            durationDays: 20,
            key: "foundation",
            name: "Foundation",
            order: 1,
            submilestones: [],
          },
        ],
        proposalId,
        workosOrganizationId: ORG,
      },
    );
    await submitProposalForTest(admin, proposalId);
    await admin.mutation((api as any).production_proposals.approveProposal, {
      proposalId,
      reason: "Ready to close.",
      workosOrganizationId: ORG,
    });
    const closing = await admin.mutation(
      (api as any).production_proposals.recordOfflineClosing,
      {
        buildStartDate: "2026-08-01",
        loanFacility: {
          interestAnnualBps: 925,
          principalCents: 50_000_000,
        },
        proposalId,
        reason: "Closed for delete test.",
        workosOrganizationId: ORG,
      },
    );

    await admin.mutation((api as any).production_proposals.deleteActiveBuild, {
      buildId: closing.buildId,
      reason: "QA cleanup.",
      workosOrganizationId: ORG,
    });

    const leftovers = await admin.run(async (ctx: any) => ({
      build: await ctx.db.get(closing.buildId),
      proposal: await ctx.db.get(proposalId),
    }));
    expect(leftovers.build).toBeNull();
    expect(leftovers.proposal?.activeBuildId).toBeUndefined();

    const dashboard = await admin.query(
      (api as any).production_proposals.getBackofficeDashboard,
      { workosOrganizationId: ORG },
    );
    expect(
      dashboard.activeBuilds.some(
        (build: { buildKey: string }) =>
          build.buildKey === String(closing.buildId),
      ),
    ).toBe(false);
  });
});

describe("integration operations", () => {
  test("keeps tenant endpoint secrets one-time, validated, and admin scoped", async () => {
    const { base, t: admin } = await seeded(["admin"], "user_admin");
    const broker = withIdentity(base, ["broker"], "user_broker");

    const created = await admin.mutation(
      (api as any).production_proposals.createIntegrationEndpoint,
      {
        endpointUrl: "https://hooks.example.test/drawflow",
        eventTypes: ["draw.released", "milestone.approved"],
        name: "Accounting webhook",
        payloadVersion: "2026-07-01",
        reason: "Connect the accounting workflow.",
        workosOrganizationId: ORG,
      },
    );

    expect(created.signingSecret).toMatch(/^dfwhsec_/);
    expect(created.endpoint).toMatchObject({
      endpointUrl: "https://hooks.example.test/drawflow",
      eventTypes: ["draw.released", "milestone.approved"],
      name: "Accounting webhook",
      secretVersion: 1,
      status: "draft",
    });
    expect(created.endpoint).not.toHaveProperty("validatedAt");
    expect(JSON.stringify(created.endpoint)).not.toContain(
      created.signingSecret,
    );
    expect(JSON.stringify(created.endpoint)).not.toMatch(
      /secretHash|signingSecret/i,
    );

    await expect(
      admin.mutation(
        (api as any).production_proposals.activateIntegrationEndpoint,
        {
          endpointId: created.endpoint._id,
          reason: "Activate the accounting connection.",
          workosOrganizationId: ORG,
        },
      ),
    ).rejects.toThrow(/validate/i);

    await admin.mutation(
      (api as any).production_proposals.validateIntegrationEndpoint,
      {
        endpointId: created.endpoint._id,
        reason: "Endpoint ownership confirmed.",
        workosOrganizationId: ORG,
      },
    );
    await admin.mutation(
      (api as any).production_proposals.activateIntegrationEndpoint,
      {
        endpointId: created.endpoint._id,
        reason: "Activate the accounting connection.",
        workosOrganizationId: ORG,
      },
    );

    const operations = await admin.query(
      (api as any).production_proposals.getIntegrationOperations,
      { workosOrganizationId: ORG },
    );
    expect(operations.endpoints).toEqual([
      expect.objectContaining({
        _id: created.endpoint._id,
        secretVersion: 1,
        status: "active",
        validatedAt: expect.any(Number),
      }),
    ]);
    expect(JSON.stringify(operations)).not.toMatch(
      /dfwhsec_|secretHash|signingSecret|requestId|stack/i,
    );

    await expect(
      broker.query((api as any).production_proposals.getIntegrationOperations, {
        workosOrganizationId: ORG,
      }),
    ).rejects.toThrow(/Forbidden/);
  });

  test("retries failed deliveries without mutating the original attempt or exposing secrets", async () => {
    const { seed, t: admin } = await seeded(["admin"], "user_admin");
    const now = Date.now();
    const endpointId = await admin.run(async (ctx: any) =>
      ctx.db.insert("integrationEndpoints", {
        brokerageId: seed.brokerageId,
        createdAt: now,
        createdByWorkosUserId: "user_admin",
        endpointUrl: "https://hooks.example.test/drawflow",
        eventTypes: ["draw.released"],
        name: "Accounting webhook",
        organizationId: ORG,
        payloadVersion: "2026-07-01",
        secretFingerprint: "…4f2a9c",
        secretHash: "ab".repeat(32),
        secretVersion: 1,
        status: "active",
        updatedAt: now,
        validatedAt: now,
      }),
    );
    const failedAttemptId = await admin.run(async (ctx: any) =>
      ctx.db.insert("integrationDeliveryAttempts", {
        attemptNumber: 1,
        attemptedAt: now,
        brokerageId: seed.brokerageId,
        createdAt: now,
        deliveryId: "delivery_draw_001",
        endpointId,
        eventId: "event_draw_001",
        eventType: "draw.released",
        organizationId: ORG,
        payloadVersion: "2026-07-01",
        responseCode: 503,
        safeError:
          "Endpoint unavailable. No secret or payload data was stored.",
        status: "failed",
        updatedAt: now,
      }),
    );

    const retried = await admin.mutation(
      (api as any).production_proposals.retryIntegrationDeliveryAttempt,
      {
        attemptId: failedAttemptId,
        reason: "Endpoint recovered after maintenance.",
        workosOrganizationId: ORG,
      },
    );
    expect(retried).toMatchObject({
      attemptNumber: 2,
      eventId: "event_draw_001",
      eventType: "draw.released",
      payloadVersion: "2026-07-01",
      retryOfAttemptId: failedAttemptId,
      status: "retry_pending",
    });
    expect(retried.deliveryId).not.toBe("delivery_draw_001");

    const deliveryFetch = vi.fn(async (request: Request) => {
      expect(request.method).toBe("POST");
      expect(request.headers.get("X-DrawFlow-Delivery")).toBe(
        retried.deliveryId,
      );
      expect(request.headers.get("X-DrawFlow-Signature")).toMatch(
        /^v1=[a-f0-9]{64}$/,
      );
      expect(request.headers.get("X-DrawFlow-Timestamp")).toMatch(/^\d+$/);
      const payload = await request.json();
      expect(payload).toMatchObject({
        deliveryId: retried.deliveryId,
        eventId: "event_draw_001",
        eventType: "draw.released",
        payloadVersion: "2026-07-01",
      });
      return new Response(null, { status: 204 });
    });
    const originalFetch = globalThis.fetch;
    globalThis.fetch = deliveryFetch as typeof fetch;
    let delivered;
    try {
      delivered = await admin.action(
        (api as any).production_proposals.dispatchIntegrationDeliveryAttempt,
        { attemptId: retried._id, workosOrganizationId: ORG },
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
    expect(delivered).toMatchObject({
      completedAt: expect.any(Number),
      responseCode: 204,
      status: "delivered",
    });
    expect(deliveryFetch).toHaveBeenCalledOnce();

    const pendingAttemptId = await admin.run((ctx: any) =>
      ctx.db.insert("integrationDeliveryAttempts", {
        attemptNumber: 1,
        attemptedAt: now + 1,
        brokerageId: seed.brokerageId,
        createdAt: now + 1,
        deliveryId: "delivery_draw_002",
        endpointId,
        eventId: "event_draw_002",
        eventType: "draw.released",
        organizationId: ORG,
        payloadVersion: "2026-07-01",
        status: "pending",
        updatedAt: now + 1,
      }),
    );
    const failingFetch = vi.fn(
      async () => new Response("sensitive upstream response", { status: 503 }),
    );
    globalThis.fetch = failingFetch as typeof fetch;
    let failedDispatch;
    try {
      failedDispatch = await admin.action(
        (api as any).production_proposals.dispatchIntegrationDeliveryAttempt,
        { attemptId: pendingAttemptId, workosOrganizationId: ORG },
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
    expect(failedDispatch).toMatchObject({
      completedAt: expect.any(Number),
      nextRetryAt: expect.any(Number),
      responseCode: 503,
      safeError: "Endpoint returned HTTP 503. Response content was not stored.",
      status: "failed",
    });
    expect(JSON.stringify(failedDispatch)).not.toContain(
      "sensitive upstream response",
    );

    const records = await admin.run(async (ctx: any) => ({
      failed: await ctx.db.get(failedAttemptId),
      retry: await ctx.db.get(retried._id),
    }));
    expect(records.failed).toMatchObject({
      deliveryId: "delivery_draw_001",
      safeError: "Endpoint unavailable. No secret or payload data was stored.",
      status: "failed",
    });
    expect(records.retry).toMatchObject({
      responseCode: 204,
      status: "delivered",
    });
    expect(JSON.stringify(retried)).not.toMatch(
      /secretHash|signingSecret|payloadPreview|stack/i,
    );
  });

  test("versions active Build budgets through audited builder requests and admin decisions", async () => {
    const { base, seed, t } = await seeded(["admin"], "user_admin");
    const builder = withIdentity(base, ["builder"], "user_builder");
    const closing = await createClosedSingleMilestoneBuild(t, seed, {
      buildName: "Versioned budget Build",
    });

    const requestId = await builder.mutation(
      (api as any).production_proposals.requestActiveBuildBudgetRevision,
      {
        borrowerCoPayBps: 2_500,
        borrowerWorkingCapitalLimitCents: 37_000_000,
        buildId: closing.buildId,
        lenderDrawPolicyLimitCents: 58_000_000,
        reason: "Updated subcontractor pricing requires a governed revision.",
        workosOrganizationId: ORG,
      },
    );
    await expect(
      builder.mutation(
        (api as any).production_proposals.requestActiveBuildBudgetRevision,
        {
          borrowerCoPayBps: 2_600,
          borrowerWorkingCapitalLimitCents: 38_000_000,
          buildId: closing.buildId,
          lenderDrawPolicyLimitCents: 59_000_000,
          reason: "Duplicate pending request.",
          workosOrganizationId: ORG,
        },
      ),
    ).rejects.toThrow(/already awaiting review/i);
    await expect(
      builder.mutation(
        (api as any).production_proposals.reviewActiveBuildBudgetRevision,
        {
          note: "Builder cannot self-approve.",
          requestId,
          status: "approved",
          workosOrganizationId: ORG,
        },
      ),
    ).rejects.toThrow(/role|permission|forbidden/i);
    await expect(
      t.mutation(
        (api as any).production_proposals.reviewActiveBuildBudgetRevision,
        {
          note: "   ",
          requestId,
          status: "approved",
          workosOrganizationId: ORG,
        },
      ),
    ).rejects.toThrow(/reason is required/i);

    await t.mutation(
      (api as any).production_proposals.reviewActiveBuildBudgetRevision,
      {
        note: "Approved after variance and policy review.",
        requestId,
        status: "approved",
        workosOrganizationId: ORG,
      },
    );
    await expect(
      t.mutation(
        (api as any).production_proposals.reviewActiveBuildBudgetRevision,
        {
          note: "Duplicate decision.",
          requestId,
          status: "approved",
          workosOrganizationId: ORG,
        },
      ),
    ).rejects.toThrow(/already been reviewed/i);

    const state = await t.run(async (ctx: any) => ({
      events: await ctx.db
        .query("auditEvents")
        .withIndex("by_entity", (q: any) =>
          q
            .eq("entityType", "activeBuild")
            .eq("entityId", String(closing.buildId)),
        )
        .collect(),
      plans: await ctx.db
        .query("buildCapitalPlans")
        .withIndex("by_build", (q: any) => q.eq("buildId", closing.buildId))
        .collect(),
      request: await ctx.db.get(requestId),
    }));
    expect(state.plans.map((plan: any) => plan.version).sort()).toEqual([1, 2]);
    expect(state.plans.find((plan: any) => plan.version === 1)).toMatchObject({
      lenderDrawPolicyLimitCents: 55_000_000,
      source: "proposal_closing_copy",
    });
    expect(state.plans.find((plan: any) => plan.version === 2)).toMatchObject({
      borrowerCoPayBps: 2_500,
      borrowerWorkingCapitalLimitCents: 37_000_000,
      lenderDrawPolicyLimitCents: 58_000_000,
      revisionRequestId: requestId,
      source: "approved_budget_revision",
    });
    expect(state.request).toMatchObject({
      approvedCapitalPlanId: expect.anything(),
      baseVersion: 1,
      reason: "Updated subcontractor pricing requires a governed revision.",
      requestedByWorkosUserId: "user_builder",
      reviewerWorkosUserId: "user_admin",
      status: "approved",
      varianceCents: 3_000_000,
    });
    expect(state.events.map((event: any) => event.eventType)).toEqual(
      expect.arrayContaining([
        "active_build.budget_revision.requested",
        "active_build.budget_revision.reviewed",
      ]),
    );

    const detail = await t.query(
      (api as any).production_proposals.getActiveBuildDetailByString,
      { buildId: String(closing.buildId), workosOrganizationId: ORG },
    );
    expect(detail.capitalPlan).toMatchObject({
      lenderDrawPolicyLimitCents: 58_000_000,
      version: 2,
    });
  });
});
