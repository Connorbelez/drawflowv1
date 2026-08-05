/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";

import { api } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

const ORG = "org_contractors_v1";

function withIdentity(t: any, roles: string[], subject: string) {
  return t.withIdentity({
    email: `${subject}@example.com`,
    name: subject,
    organizationId: ORG,
    role: roles[0],
    roles,
    subject,
    tokenIdentifier: `https://api.workos.com/|${subject}`,
  } as any);
}

async function seeded(roles: string[] = ["admin"], subject = "user_admin") {
  const base = convexTest(schema, modules);
  const t = withIdentity(base, roles, subject);
  const seed = await t.mutation(
    (api as any).production_proposals.dev_seedProductionFoundation,
    { workosOrganizationId: ORG },
  );
  return { base, seed, t };
}

async function createActiveBuild(t: any, seed: any) {
  const proposalId = await t.mutation(
    (api as any).production_proposals.createDraftProposal,
    {
      brokerageId: seed.brokerageId,
      builderProfileId: seed.builderProfileId,
      buildName: "Contractor history build",
      location: "77 Contractor Trace",
      workosOrganizationId: ORG,
    },
  );

  await t.mutation((api as any).production_proposals.saveDraftProposalPackage, {
    borrowerCoPayBps: 2_000,
    borrowerWorkingCapitalLimitCents: 30_000_000,
    documents: [
      {
        documentType: "permit",
        fileName: "permit.pdf",
        mimeType: "application/pdf",
        sizeBytes: 1024,
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
        submilestones: [
          {
            budgetCents: 18_000_000,
            durationDays: 8,
            key: "forms",
            name: "Forms and pour",
            order: 1,
          },
          {
            budgetCents: 12_000_000,
            durationDays: 5,
            key: "waterproofing",
            name: "Waterproofing",
            order: 2,
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
            budgetCents: 28_000_000,
            durationDays: 9,
            key: "walls",
            name: "Wall framing",
            order: 1,
          },
        ],
      },
    ],
    proposalId,
    workosOrganizationId: ORG,
  });
  await t.run(async (ctx: any) => {
    const now = Date.now();
    await ctx.db.patch(proposalId, {
      selectedPlan: {
        metrics: {
          drawCount: 2,
          drawFeesCents: 100_000,
          interestCostCents: 250_000,
          minimumCashReserveCents: 5_000_000,
          projectedDurationDays: 48,
          startingCashCents: 30_000_000,
          totalCostCents: 350_000,
          totalDrawAmountCents: 100_000_000,
        },
        name: "Cheapest Feasible",
        planKey: "cheapestFeasible",
        recommendationReason: "Selected by contractor history test setup.",
        selectedAt: now,
        selectedByWorkosUserId: "contractor_history_test_setup",
      },
    });
  });
  await t.mutation((api as any).production_proposals.submitProposal, {
    proposalId,
    workosOrganizationId: ORG,
  });
  await t.mutation((api as any).production_proposals.approveProposal, {
    proposalId,
    reason: "Contractor v1 build ready.",
    workosOrganizationId: ORG,
  });
  const closing = await t.mutation(
    (api as any).production_proposals.recordOfflineClosing,
    {
      buildStartDate: "2026-08-01",
      ianaTimezone: "America/Toronto",
      loanFacility: {
        interestAnnualBps: 925,
        principalCents: 100_000_000,
      },
      proposalId,
      reason: "Loan closed for contractor tracking.",
      workosOrganizationId: ORG,
    },
  );

  return { buildId: closing.buildId, proposalId };
}

describe("contractors v1", () => {
  test("manages queryable brokerage-scoped contractor profiles with account linking and operating data", async () => {
    const { seed, t } = await seeded();

    const contractorId = await t.mutation(
      (api as any).production_proposals.createContractorProfile,
      {
        availabilityWindows: [
          {
            dayOfWeek: 1,
            endMinute: 960,
            startMinute: 420,
            timezone: "America/Toronto",
          },
        ],
        brokerageId: seed.brokerageId,
        capabilities: [
          {
            capabilityKey: "brick-siding",
            label: "Brick siding",
            milestoneArchetypeKey: "exterior",
            trade: "masonry",
          },
        ],
        city: "Toronto, ON",
        defaultPayRateCents: 8_500,
        defaultPayRateUnit: "hour",
        email: "masonry@example.com",
        equipment: [
          {
            equipmentKey: "telehandler",
            name: "Telehandler",
            quantity: 1,
          },
        ],
        kind: "company",
        name: "Northstar Masonry",
        phone: "416-555-0101",
        trades: ["masonry", "brick"],
        workosOrganizationId: ORG,
      },
    );

    await t.mutation(
      (api as any).production_proposals.linkContractorProfileToWorkosUser,
      {
        contractorId,
        workosOrganizationId: ORG,
        workosUserId: "user_contractor",
      },
    );

    const list = await t.query(
      (api as any).production_proposals.listContractors,
      {
        capabilityKey: "brick-siding",
        workosOrganizationId: ORG,
      },
    );
    expect(list.contractors).toHaveLength(1);
    expect(list.contractors[0]).toMatchObject({
      accountWorkosUserId: "user_contractor",
      city: "Toronto, ON",
      defaultPayRateCents: 8_500,
      defaultPayRateUnit: "hour",
      name: "Northstar Masonry",
      onboardingStatus: "account_linked",
    });
    expect(list.contractors[0].capabilities).toEqual([
      expect.objectContaining({
        capabilityKey: "brick-siding",
        milestoneArchetypeKey: "exterior",
      }),
    ]);
    expect(list.contractors[0].equipment).toEqual([
      expect.objectContaining({ equipmentKey: "telehandler", quantity: 1 }),
    ]);
    expect(list.contractors[0].availabilityWindows).toEqual([
      expect.objectContaining({ dayOfWeek: 1, startMinute: 420 }),
    ]);
  });

  test("plans proposal contractors, projects scheduling intelligence, and copies assignments forward at closing", async () => {
    const { seed, t } = await seeded();
    const proposalId = await t.mutation(
      (api as any).production_proposals.createDraftProposal,
      {
        brokerageId: seed.brokerageId,
        builderProfileId: seed.builderProfileId,
        buildName: "Brick contractor planning build",
        location: "42 Masonry Plan Ave",
        workosOrganizationId: ORG,
      },
    );

    await t.mutation((api as any).production_proposals.saveDraftProposalPackage, {
      borrowerCoPayBps: 2_000,
      borrowerWorkingCapitalLimitCents: 35_000_000,
      documents: [
        {
          documentType: "permit",
          fileName: "brick-siding-masonry-building-permit.pdf",
          mimeType: "application/pdf",
          sizeBytes: 2048,
        },
      ],
      lenderDrawPolicyLimitCents: 90_000_000,
      milestones: [
        {
          budgetCents: 58_000_000,
          dayEnd: 24,
          dayStart: 0,
          dependencyKeys: [],
          durationDays: 24,
          key: "exterior",
          name: "Exterior masonry and brick siding",
          order: 1,
          submilestones: [
            {
              budgetCents: 24_000_000,
              durationDays: 12,
              key: "brick-siding",
              name: "Brick siding",
              order: 1,
            },
          ],
        },
      ],
      proposalId,
      workosOrganizationId: ORG,
    });

    const contractorId = await t.mutation(
      (api as any).production_proposals.createContractorProfile,
      {
        availabilityWindows: [
          {
            dayOfWeek: 1,
            endMinute: 960,
            startMinute: 420,
            timezone: "America/Toronto",
          },
          {
            dayOfWeek: 2,
            endMinute: 960,
            startMinute: 420,
            timezone: "America/Toronto",
          },
        ],
        brokerageId: seed.brokerageId,
        capabilities: [
          {
            capabilityKey: "brick-siding",
            label: "Brick siding",
            milestoneArchetypeKey: "exterior",
            trade: "masonry",
          },
        ],
        city: "Toronto, ON",
        defaultPayRateCents: 9_500,
        defaultPayRateUnit: "hour",
        equipment: [
          {
            equipmentKey: "telehandler",
            name: "Telehandler",
            quantity: 1,
          },
        ],
        kind: "company",
        name: "Northstar Planning Masonry",
        trades: ["masonry", "brick"],
        workosOrganizationId: ORG,
      },
    );
    const linkedContractorId = await t.mutation(
      (api as any).production_proposals.createContractorProfile,
      {
        brokerageId: seed.brokerageId,
        name: "Northstar Masonry Partner Profile",
        trades: ["masonry"],
        workosOrganizationId: ORG,
      },
    );

    const proposalAssignmentId = await t.mutation(
      (api as any).production_proposals.attachProposalContractor,
      {
        contractorId,
        proposalId,
        role: "Masonry lead",
        workosOrganizationId: ORG,
      },
    );
    expect(proposalAssignmentId).toBeTruthy();

    const assignmentIds = await t.mutation(
      (api as any).production_proposals.assignProposalContractorToMilestone,
      {
        contractorId,
        estimatedHours: 120,
        milestoneKey: "exterior",
        proposalId,
        role: "Brick siding lead",
        submilestoneKeys: ["brick-siding"],
        workosOrganizationId: ORG,
      },
    );
    expect(assignmentIds).toHaveLength(1);

    const contractorPlanning = await t.query(
      (api as any).production_proposals.getProposalContractorPlanning,
      { proposalId, workosOrganizationId: ORG },
    );
    expect(contractorPlanning.proposalContractors[0]).toMatchObject({
      contractorId,
      name: "Northstar Planning Masonry",
      role: "Masonry lead",
    });
    expect(contractorPlanning.materialSignals).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: "brick" }),
        expect.objectContaining({ key: "masonry" }),
      ]),
    );
    expect(contractorPlanning.recommendations[0]).toMatchObject({
      contractorId,
      name: "Northstar Planning Masonry",
    });
    expect(contractorPlanning.utilization[0]).toMatchObject({
      contractorId,
      scheduledHours: 120,
    });

    await t.mutation((api as any).production_proposals.updateContractorProfile, {
      availabilityWindows: [
        {
          dayOfWeek: 3,
          endMinute: 1020,
          startMinute: 420,
          timezone: "America/Toronto",
        },
      ],
      capabilities: [
        {
          capabilityKey: "masonry-envelope",
          label: "Masonry envelope",
          milestoneArchetypeKey: "exterior",
          trade: "masonry",
        },
      ],
      city: "Hamilton, ON",
      contractorId,
      defaultPayRateCents: 10_100,
      defaultPayRateUnit: "hour",
      equipment: [
        {
          equipmentKey: "scaffold",
          name: "Scaffold",
          quantity: 2,
        },
      ],
      kind: "company",
      name: "Northstar Planning Masonry Updated",
      trades: ["masonry", "envelope"],
      workosOrganizationId: ORG,
    });
    await t.mutation((api as any).production_proposals.linkContractorIdentity, {
      confidence: 0.88,
      linkedContractorId,
      primaryContractorId: contractorId,
      reason: "Same company with a linked external brokerage profile.",
      status: "verified",
      workosOrganizationId: ORG,
    });

    await t.run(async (ctx: any) => {
      const now = Date.now();
      await ctx.db.patch(proposalId, {
        selectedPlan: {
          metrics: {
            drawCount: 1,
            drawFeesCents: 50_000,
            interestCostCents: 100_000,
            minimumCashReserveCents: 5_000_000,
            projectedDurationDays: 24,
            startingCashCents: 35_000_000,
            totalCostCents: 150_000,
            totalDrawAmountCents: 58_000_000,
          },
          name: "Cheapest Feasible",
          planKey: "cheapestFeasible",
          recommendationReason: "Selected by contractor planning test setup.",
          selectedAt: now,
          selectedByWorkosUserId: "contractor_planning_test_setup",
        },
      });
    });

    await t.mutation((api as any).production_proposals.submitProposal, {
      proposalId,
      workosOrganizationId: ORG,
    });
    await t.mutation((api as any).production_proposals.approveProposal, {
      proposalId,
      reason: "Proposal contractor plan is ready.",
      workosOrganizationId: ORG,
    });
    const closing = await t.mutation(
      (api as any).production_proposals.recordOfflineClosing,
      {
        buildStartDate: "2026-09-01",
        ianaTimezone: "America/Toronto",
        loanFacility: {
          interestAnnualBps: 925,
          principalCents: 90_000_000,
        },
        proposalId,
        reason: "Closing copies proposal contractor plan.",
        workosOrganizationId: ORG,
      },
    );

    const buildDetail = await t.query(
      (api as any).production_proposals.getActiveBuildDetailByString,
      { buildId: String(closing.buildId), workosOrganizationId: ORG },
    );
    expect(buildDetail.contractors[0]).toMatchObject({
      contractorId,
      name: "Northstar Planning Masonry Updated",
      role: "Masonry lead",
    });
    expect(buildDetail.milestoneContractorAssignments[0]).toMatchObject({
      contractorId,
      estimatedCostCents: 1_140_000,
      estimatedHours: 120,
      milestoneKey: "exterior",
      role: "Brick siding lead",
      submilestoneKey: "brick-siding",
    });

    const detail = await t.query(
      (api as any).production_proposals.getContractorDetail,
      { contractorId, workosOrganizationId: ORG },
    );
    expect(detail.identityLinks[0]).toMatchObject({
      peerContractorId: linkedContractorId,
      status: "verified",
    });
    expect(detail.profile).toMatchObject({
      city: "Hamilton, ON",
      defaultPayRateCents: 10_100,
      name: "Northstar Planning Masonry Updated",
    });
    expect(detail.intelligence).toMatchObject({
      activeBuildAssignmentCount: 1,
      scheduledHours: 120,
    });

    await t.mutation((api as any).production_proposals.setContractorProfileStatus, {
      contractorId,
      reason: "Testing inactive profile management.",
      status: "inactive",
      workosOrganizationId: ORG,
    });
    const inactiveList = await t.query(
      (api as any).production_proposals.listContractors,
      { includeInactive: true, workosOrganizationId: ORG },
    );
    expect(
      inactiveList.contractors.find((contractor: any) => contractor._id === contractorId),
    ).toMatchObject({ status: "inactive" });
  });

  test("assigns build contractors to milestone and submilestone work, records quality ratings, and filters work-history photos to tagged work", async () => {
    const { seed, t } = await seeded();
    const { buildId } = await createActiveBuild(t, seed);
    const contractorId = await t.mutation(
      (api as any).production_proposals.createContractorProfile,
      {
        brokerageId: seed.brokerageId,
        capabilities: [
          {
            capabilityKey: "foundation-forms",
            label: "Foundation forms",
            milestoneArchetypeKey: "foundation",
            trade: "concrete",
          },
        ],
        city: "Hamilton, ON",
        defaultPayRateCents: 9_000,
        defaultPayRateUnit: "hour",
        equipment: [],
        kind: "company",
        name: "Northpeak Concrete",
        trades: ["concrete", "forms"],
        workosOrganizationId: ORG,
      },
    );

    await t.mutation(
      (api as any).production_proposals.assignActiveBuildContractorToMilestone,
      {
        actualCostCents: 418_500,
        actualHours: 46.5,
        buildId,
        costNotes: "Finished under expected crew hours.",
        contractorId,
        estimatedHours: 48,
        milestoneKey: "foundation",
        note: "Backfilled from superintendent logs.",
        postHoc: true,
        role: "Foundation lead",
        status: "completed",
        submilestoneKeys: ["forms"],
        workosOrganizationId: ORG,
      },
    );

    await t.mutation(
      (api as any).production_proposals.createActiveBuildTimelineEvidenceAsset,
      {
        asset: {
          evidenceKey: "forms-photo-01",
          fileName: "forms-photo-01.jpg",
          label: "Forms completed",
          locationVerified: true,
          milestoneKey: "foundation",
          mimeType: "image/jpeg",
          sizeBytes: 12_000,
          storageId: await t.run(async (ctx: any) =>
            ctx.storage.store(
              new Blob(["forms-photo-01"], { type: "image/jpeg" }),
            ),
          ),
          source: "builder_evidence",
          submilestoneKey: "forms",
          tag: "Forms and pour",
        },
        buildId,
        workosOrganizationId: ORG,
      },
    );
    await t.mutation(
      (api as any).production_proposals.createActiveBuildTimelineEvidenceAsset,
      {
        asset: {
          evidenceKey: "waterproofing-photo-01",
          fileName: "waterproofing-photo-01.jpg",
          label: "Waterproofing completed",
          locationVerified: true,
          milestoneKey: "foundation",
          mimeType: "image/jpeg",
          sizeBytes: 12_000,
          storageId: await t.run(async (ctx: any) =>
            ctx.storage.store(
              new Blob(["waterproofing-photo-01"], { type: "image/jpeg" }),
            ),
          ),
          source: "builder_evidence",
          submilestoneKey: "waterproofing",
          tag: "Waterproofing",
        },
        buildId,
        workosOrganizationId: ORG,
      },
    );
    await t.mutation(
      (api as any).production_proposals.recordContractorQualityRating,
      {
        buildId,
        contractorId,
        milestoneKey: "foundation",
        note: "Clean forms, accurate anchor placement.",
        rating: 5,
        source: "site_visit",
        submilestoneKey: "forms",
        workosOrganizationId: ORG,
      },
    );

    const detail = await t.query(
      (api as any).production_proposals.getContractorDetail,
      { contractorId, workosOrganizationId: ORG },
    );

    expect(detail.profile.name).toBe("Northpeak Concrete");
    expect(detail.performance.averageQualityRating).toBe(5);
    expect(detail.performance.totalEstimatedCostCents).toBe(432_000);
    expect(detail.performance.totalActualCostCents).toBe(418_500);
    expect(detail.performance.totalVarianceCents).toBe(-13_500);
    expect(detail.workHistory).toHaveLength(1);
    expect(detail.workHistory[0]).toMatchObject({
      actualCostCents: 418_500,
      actualHours: 46.5,
      buildName: "Contractor history build",
      costNotes: "Finished under expected crew hours.",
      estimatedCostCents: 432_000,
      estimatedHours: 48,
      milestoneKey: "foundation",
      postHoc: true,
      role: "Foundation lead",
      status: "completed",
      submilestones: [
        expect.objectContaining({
          key: "forms",
          name: "Forms and pour",
        }),
      ],
    });
    expect(detail.workHistory[0].evidencePhotos).toEqual([
      expect.objectContaining({
        evidenceKey: "forms-photo-01",
        fileName: "forms-photo-01.jpg",
        submilestoneKey: "forms",
      }),
    ]);
  });
});
