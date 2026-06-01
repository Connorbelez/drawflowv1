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
