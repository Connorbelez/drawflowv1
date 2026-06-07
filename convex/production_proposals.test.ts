/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";

import { api } from "./_generated/api";
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

function asIdentity(roles: string[], subject = "user_builder") {
  return convexTest(schema, modules).withIdentity({
    email: `${subject}@example.com`,
    name: subject,
    organizationId: ORG,
    role: roles[0],
    roles,
    subject,
    tokenIdentifier: `https://api.workos.com/|${subject}`,
  } as any);
}

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

async function seeded(roles: string[], subject?: string) {
  const base = convexTest(schema, modules);
  const t = withIdentity(base, roles, subject ?? "user_builder");
  const seed = await t.mutation(
    (api as any).production_proposals.dev_seedProductionFoundation,
    { workosOrganizationId: ORG },
  );
  return { base, seed, t };
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

async function createClosedSingleMilestoneBuild(t: any, seed: any) {
  const proposalId = await t.mutation(
    (api as any).production_proposals.createDraftProposal,
    {
      brokerageId: seed.brokerageId,
      builderProfileId: seed.builderProfileId,
      buildName: "Actual cost active build",
      location: "44 Actual Cost Lane",
      workosOrganizationId: ORG,
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
  });
  await t.mutation((api as any).production_proposals.submitProposal, {
    proposalId,
    workosOrganizationId: ORG,
  });
  await t.mutation((api as any).production_proposals.approveProposal, {
    proposalId,
    reason: "Ready to close.",
    workosOrganizationId: ORG,
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
      workosOrganizationId: ORG,
    },
  );
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

describe("production proposal foundation", () => {
  test("creates, saves, submits, approves, and closes a production Build Proposal without mutating demo tables", async () => {
    const { seed, t } = await seeded(["admin"], "user_admin");

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

    await t.mutation((api as any).production_proposals.submitProposal, {
      proposalId,
      workosOrganizationId: ORG,
    });
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
    expect(closed.buildSubmilestones).toHaveLength(1);
    expect(closed.plannedDraws[0]).toMatchObject({
      amountCents: 40_000_000,
      status: "planned",
    });
    expect(closed.auditEvents.map((event: any) => event.eventType)).toEqual(
      expect.arrayContaining([
        "proposal.submitted",
        "proposal.approved",
        "proposal.closed",
      ]),
    );

    const demoCounts = await t.run(async (ctx: any) => ({
      demoBuilds: await ctx.db.query("demo_builds").collect(),
      demoProposalDrafts: await ctx.db
        .query("demo_builderProposalDrafts")
        .collect(),
    }));
    expect(demoCounts.demoBuilds).toHaveLength(0);
    expect(demoCounts.demoProposalDrafts).toHaveLength(0);
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
    expect(detail.proposal.totalBudgetCents).toBe(70_000_000);
    expect(detail.milestones[0]).toMatchObject({
      budgetCents: 70_000_000,
      drawAvailabilityCents: 56_000_000,
    });
    expect(detail.draws[0]).toMatchObject({ amountCents: 56_000_000 });

    await t.mutation((api as any).production_proposals.submitProposal, {
      proposalId,
      workosOrganizationId: ORG,
    });
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
    expect(buildDetail.build.totalBudgetCents).toBe(70_000_000);
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
    expect(buildDetailAfterUpdate.build.totalBudgetCents).toBe(71_750_000);

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
    expect(buildDetailAfterDelete.build.totalBudgetCents).toBe(70_000_000);
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

    await staff.mutation((api as any).production_proposals.createProposalCostItem, {
      costCents: 1_500_000,
      itemType: "material",
      milestoneKey: "foundation",
      proposalId,
      quantity: 1,
      relevantSubmilestoneKeys: [],
      title: "Concrete package",
      workosOrganizationId: ORG,
    });
    const detail = await staff.query(
      (api as any).production_proposals.getProposalDetail,
      { proposalId, workosOrganizationId: ORG },
    );
    expect(detail.costItems).toHaveLength(1);
    expect(detail.milestones).toHaveLength(0);
    expect(detail.appPermissions.role).toBe("staff");
  });

  test("provisions unknown proposal builder staff emails before assigning app permissions", async () => {
    const { seed, t: admin } = await seeded(["admin"], "user_admin");
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
      (api as any).production_proposals.provisionProposalBuilderStaffPermissions,
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
      invite: {
        adapter: "fake",
        status: "accepted",
        sync: "waiting-for-webhook",
      },
      staffWorkosUserId: "provisioned_builder_staff_frame_team_example_com",
    });

    const directory = await admin.query(
      (api as any).production_proposals.listProposalBuilderStaffPermissions,
      { proposalId, workosOrganizationId: ORG },
    );
    const invited = directory.staff.find(
      (member: any) =>
        member.workosUserId ===
        "provisioned_builder_staff_frame_team_example_com",
    );
    expect(invited).toMatchObject({
      email: "frame.team@example.com",
      role: "staff",
    });
    expect(
      invited.permissions.find(
        (permission: any) => permission.resourceType === "milestone",
      ),
    ).toMatchObject({ canView: true });

    await admin.run(async (ctx: any) => {
      const user = await ctx.db
        .query("users")
        .withIndex("by_workos_user_id", (q: any) =>
          q.eq("workosUserId", result.staffWorkosUserId),
        )
        .unique();
      expect(user).toMatchObject({
        email: "frame.team@example.com",
        status: "active",
      });
      const membership = await ctx.db
        .query("workosOrganizationMemberships")
        .withIndex("by_user", (q: any) =>
          q.eq("workosUserId", result.staffWorkosUserId),
        )
        .filter((q: any) => q.eq(q.field("workosOrganizationId"), ORG))
        .first();
      expect(membership).toMatchObject({
        roleSlug: "builder-staff",
        status: "active",
      });
      const link = await ctx.db
        .query("builderAccountLinks")
        .withIndex("by_builder_user", (q: any) =>
          q
            .eq("builderProfileId", seed.builderProfileId)
            .eq("workosUserId", result.staffWorkosUserId),
        )
        .unique();
      expect(link).toMatchObject({
        role: "staff",
        status: "active",
      });
    });
  });

  test("enforces active-build scoped builder staff draw permissions", async () => {
    const { base, seed, t: admin } = await seeded(["admin"], "user_admin");
    await grantOrgMembership(admin, {
      roleSlugs: ["builder-staff"],
      subject: "user_staff_draw",
    });
    const { buildId } = await createClosedSingleMilestoneBuild(admin, seed);
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
      staff.mutation((api as any).production_proposals.createActiveBuildCostItem, {
        buildId,
        costCents: 250_000,
        itemType: "material",
        milestoneKey: "foundation",
        quantity: 1,
        relevantSubmilestoneKeys: [],
        title: "Blocked material",
        workosOrganizationId: ORG,
      }),
    ).rejects.toThrow("Forbidden: builder staff material.create");

    await staff.mutation((api as any).production_proposals.requestActiveBuildDraw, {
      amountCents: 1_000_000,
      buildId,
      drawKey: "draw-01",
      note: "Ready for reimbursement.",
      workosOrganizationId: ORG,
    });
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
      invite: {
        adapter: "fake",
        status: "accepted",
        sync: "waiting-for-webhook",
      },
      staffWorkosUserId: "provisioned_builder_staff_draw_team_example_com",
    });

    const directory = await admin.query(
      (api as any).production_proposals.listActiveBuildBuilderStaffPermissions,
      { buildId, workosOrganizationId: ORG },
    );
    const invited = directory.staff.find(
      (member: any) =>
        member.workosUserId ===
        "provisioned_builder_staff_draw_team_example_com",
    );
    expect(invited).toMatchObject({
      email: "draw.team@example.com",
      role: "staff",
    });
    expect(
      invited.permissions.find(
        (permission: any) => permission.resourceType === "draw",
      ),
    ).toMatchObject({ canUpdate: true, canView: true });
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
      dayEnd: 13,
      dayStart: 3,
      durationDays: 10,
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
    expect(detail.proposal.totalBudgetCents).toBe(65_000_000);
    expect(detail.milestones[0]).toMatchObject({
      budgetCents: 65_000_000,
      drawAvailabilityCents: 52_000_000,
    });
    expect(detail.draws[0]).toMatchObject({ amountCents: 52_000_000 });

    const workspace = await t.query(
      (api as any).production_proposals.getProductionTimelineWorkspace,
      { proposalId, workosOrganizationId: ORG },
    );
    expect(workspace.contractorPlanning.proposalContractors).toEqual([
      expect.objectContaining({
        name: "Apex Concrete Works",
        role: "Foundation contractor",
        status: "active",
      }),
    ]);
    expect(workspace.contractorPlanning.milestoneAssignments).toEqual([
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
    await t.mutation((api as any).production_proposals.submitProposal, {
      proposalId,
      workosOrganizationId: ORG,
    });

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

    await t.mutation((api as any).production_proposals.submitProposal, {
      proposalId,
      workosOrganizationId: ORG,
    });
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

    await t.mutation((api as any).production_proposals.submitProposal, {
      proposalId,
      workosOrganizationId: ORG,
    });
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
    expect(closed.proposal.proposedStartDate).toBe("2025-04-15");
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

    const detail = await t.query(
      (api as any).production_proposals.getProposalDetail,
      { proposalId, workosOrganizationId: ORG },
    );
    expect(detail.documents[0]).toMatchObject({
      fileName: "scope.pdf",
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
    await t.mutation((api as any).production_proposals.submitProposal, {
      proposalId,
      workosOrganizationId: ORG,
    });

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
    });
    expect(context.templates[0]).toMatchObject({
      templateKey: "single-family-full-build",
      title: "Single Family Full Build",
    });
    expect(context.templates[0].milestones).toHaveLength(3);

    const proposalId = await builder.mutation(
      (api as any).production_proposals.createDraftProposal,
      {
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
      buildName: "Builder-created production proposal",
      createdByWorkosUserId: "user_builder",
    });
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
    });
    expect(context.builderProfile).toBeUndefined();
    expect(context.templates[0]).toMatchObject({
      templateKey: "single-family-full-build",
      title: "Single Family Full Build",
    });
    expect(context.templates[0].milestones).toHaveLength(3);
  });

  test("seeds production defaults including the 4-plex template", async () => {
    const { t } = await seeded(["admin"], "user_admin");

    const result = await t.mutation(
      (api as any).production_proposals.seedProductionDefaultsToProd,
      { workosOrganizationId: ORG },
    );

    expect(result).toMatchObject({
      milestones: 29,
      scenarios: 5,
      submilestones: 86,
      templates: 4,
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

    const secondResult = await t.mutation(
      (api as any).production_proposals.seedProductionDefaultsToProd,
      { workosOrganizationId: ORG },
    );
    expect(secondResult).toMatchObject({
      milestones: 29,
      templates: 4,
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

  test("reports production draw timing conflicts with milestones and nearest valid days", async () => {
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
      /Draw 01, day 10: conflicts with Site prep & foundation \(ends day 14\) and Framing & structure \(starts day 19\)\. Valid window: days 15-18\. Nearest valid day: 15\./,
    );
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
      budgetCents: 50_000_000,
      drawAvailabilityCents: 40_000_000,
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
        amountCents: 40_000_000,
        drawKey: "draw-01",
        itemMilestoneKey: "foundation",
        x: 20,
      }),
      expect.objectContaining({
        amountCents: 60_000_000,
        drawKey: "draw-02",
        itemMilestoneKey: "framing",
        x: 48,
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
    await t.mutation((api as any).production_proposals.submitProposal, {
      proposalId,
      workosOrganizationId: ORG,
    });
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
          submilestones: [{ key: "walls", name: "Wall framing", order: 1 }],
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
      budgetCents: 42_000_000,
      name: "Foundation revised",
      x: 1,
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

    await t.mutation((api as any).production_proposals.submitProposal, {
      proposalId,
      workosOrganizationId: ORG,
    });
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
    await t.mutation((api as any).production_proposals.submitProposal, {
      proposalId,
      workosOrganizationId: ORG,
    });
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
    await t.mutation((api as any).production_proposals.requestActiveBuildDraw, {
      amountCents: 40_000_000,
      buildId: closing.buildId,
      drawKey: "draw-01",
      note: "Foundation reimbursement requested.",
      workosOrganizationId: ORG,
    });
    await t.mutation((api as any).production_proposals.approveActiveBuildDraw, {
      buildId: closing.buildId,
      drawKey: "draw-01",
      note: "Evidence and policy review complete.",
      workosOrganizationId: ORG,
    });
    await t.mutation((api as any).production_proposals.releaseActiveBuildDraw, {
      buildId: closing.buildId,
      drawKey: "draw-01",
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
    await t.mutation(
      (api as any).production_proposals
        .submitActiveBuildTokenizedSiteVisitReport,
      {
        buildId: String(closing.buildId),
        completionObserved: true,
        recommendedOutcome: "approve",
        reportNotes:
          "<p><strong>Inspector verified</strong> footing photo location.</p>",
        token: siteVisit.visitId,
      },
    );
    const completedSiteVisitRoster = await t.query(
      (api as any).production_proposals.listBrokerageSiteVisits,
      { workosOrganizationId: ORG },
    );
    expect(completedSiteVisitRoster.visits).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          milestoneKey: "foundation",
          operationalStatus: "complete",
          recordNote:
            "<p><strong>Inspector verified</strong> footing photo location.</p>",
          recordNoteFormat: "html",
          visitId: siteVisit.visitId,
        }),
      ]),
    );
    const drawRoster = await t.query(
      (api as any).production_proposals.listBrokerageDraws,
      { workosOrganizationId: ORG },
    );
    expect(drawRoster.summary.total).toBeGreaterThanOrEqual(1);
    expect(drawRoster.draws).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          buildId: closing.buildId,
          drawKey: "draw-01",
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

    expect(workspace.sitePhotos).toEqual([
      expect.objectContaining({
        caption: "Foundation site photo",
        evidenceKey: "foundation-site-photo",
        locationVerified: true,
      }),
    ]);
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
      amountCents: 40_000_000,
      requestNote: "Foundation reimbursement requested.",
      requestReviewNote: "Evidence and policy review complete.",
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
    expect(
      workspace.quickActionEvents.map((event: any) => event.eventType),
    ).toEqual(expect.arrayContaining(["active_build.milestone.approved"]));
    expect(workspace.auditEvents.map((event: any) => event.eventType)).toEqual(
      expect.arrayContaining([
        "active_build.created",
        "active_build.facility_change.requested",
        "active_build.facility_change.reviewed",
        "active_build.note.created",
        "active_build.document.created",
        "active_build.contractor.attached",
        "active_build.draw.requested",
        "active_build.draw.approved",
        "active_build.draw.released",
        "active_build.milestone.info_requested",
        "active_build.site_visit.requested",
        "active_build.site_visit.token_report_submitted",
        "active_build.milestone.approved",
      ]),
    );
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
    await t.mutation((api as any).production_proposals.submitProposal, {
      proposalId,
      workosOrganizationId: ORG,
    });
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
    await builder.mutation(
      (api as any).production_proposals.startActiveBuildMilestone,
      {
        buildId: closing.buildId,
        milestoneKey: "foundation",
        note: "Crew mobilized and site work started.",
        workosOrganizationId: ORG,
      },
    );

    const detail = await t.query(
      (api as any).production_proposals.getActiveBuildDetailByString,
      { buildId: String(closing.buildId), workosOrganizationId: ORG },
    );
    expect(detail.milestones[0]).toMatchObject({
      evidenceState: "Work started",
      progressPercent: 5,
      startedAt: expect.any(Number),
      status: "in_progress",
    });
    expect(detail.auditEvents.map((event: any) => event.eventType)).toContain(
      "active_build.milestone.started",
    );

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

  test("dashboard milestone review queue only includes builder completion claims", async () => {
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

    const buildId = initialDashboard.activeBuilds[0].buildKey;
    await withIdentity(base, ["builder"], "user_builder").mutation(
      (api as any).production_proposals.submitActiveBuildMilestoneCompletion,
      {
        actualCostCents: 50_000_000,
        buildId,
        completedDay: 30,
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
      { workosOrganizationId: ORG },
    );
    expect(dashboardAfterSiteVisit.milestones).toEqual([
      expect.objectContaining({
        column: "needsSiteVisit",
        milestoneKey: "foundation",
        name: "Foundation",
      }),
    ]);
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
        buildId: closing.buildId,
        completedDay: 20,
        milestoneKey: "foundation",
        note: "Foundation complete below approved budget.",
        workosOrganizationId: ORG,
      },
    );
    await builder.mutation(
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
    expect(workspace.draws[0]).toMatchObject({
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
      (api as any).production_proposals.requestActiveBuildDraw,
      {
        amountCents: 40_000_000,
        buildId: closing.buildId,
        drawKey,
        note: "Requested against original budget.",
        workosOrganizationId: ORG,
      },
    );
    await builder.mutation(
      (api as any).production_proposals.submitActiveBuildMilestoneCompletion,
      {
        actualCostCents: 30_000_000,
        buildId: closing.buildId,
        completedDay: 20,
        milestoneKey: "foundation",
        note: "Foundation complete below approved budget.",
        workosOrganizationId: ORG,
      },
    );

    await expect(
      t.mutation((api as any).production_proposals.approveActiveBuildDraw, {
        buildId: closing.buildId,
        drawKey,
        note: "Approve release.",
        workosOrganizationId: ORG,
      }),
    ).resolves.toBeNull();

    const workspace = await t.query(
      (api as any).production_proposals.getActiveBuildTimelineWorkspace,
      { buildId: closing.buildId, workosOrganizationId: ORG },
    );
    expect(workspace.draws[0]).toMatchObject({
      amountCents: 40_000_000,
      requestStatus: "approved",
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
    await t.mutation((api as any).production_proposals.submitProposal, {
      proposalId,
      workosOrganizationId: ORG,
    });

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

describe("draft builder assignment and deletion", () => {
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
    expect(claimantDetail.assignment.builder.displayName).toBe(
      "user_claimant",
    );

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
    await admin.mutation((api as any).production_proposals.submitProposal, {
      proposalId,
      workosOrganizationId: ORG,
    });
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
