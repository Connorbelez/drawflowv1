/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";

import { api } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

const ORG = "org_production_foundation";

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

describe("production proposal foundation", () => {
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

    await t.mutation((api as any).production_proposals.saveDraftProposalPackage, {
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
    });

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

  test("enforces proposal ownership, state, reason, and permit waiver rules", async () => {
    const { base, seed, t } = await seeded(["admin"], "user_admin");
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

    await t.mutation((api as any).production_proposals.saveDraftProposalPackage, {
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
    });
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

    detail = await t.query((api as any).production_proposals.getProposalDetail, {
      proposalId,
      workosOrganizationId: ORG,
    });
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

    await t.mutation((api as any).production_proposals.saveDraftProposalPackage, {
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
    });

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

    await t.mutation((api as any).production_proposals.saveDraftProposalPackage, {
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
    });

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

    await t.mutation((api as any).production_proposals.saveDraftProposalPackage, {
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
    });
    await t.mutation((api as any).production_proposals.submitProposal, {
      proposalId,
      workosOrganizationId: ORG,
    });

    await expect(
      withIdentity(base, ["builder"], "user_builder").mutation(
        (api as any).production_proposals.updateSubmittedProposalDrawScheduleRow,
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
    expect(settings.templates[0].milestones.map((row: any) => row.key)).toEqual([
      "foundation",
      "shell-dry-in",
      "interior-finish",
    ]);
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

    await t.mutation((api as any).production_proposals.saveDraftProposalPackage, {
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
    });

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

    await t.mutation((api as any).production_proposals.saveDraftProposalPackage, {
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
    });
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

    await t.mutation((api as any).production_proposals.saveDraftProposalPackage, {
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
    });

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
    expect(workspace.milestones.map((milestone: any) => milestone.milestoneKey)).toEqual([
      "foundation",
      "framing",
    ]);
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
          label: "Manual framing reimbursement",
          x: 49,
        }),
      ]),
    );

    await t.mutation((api as any).production_proposals.deleteProductionTimelineDraw, {
      drawKey: "manual-draw-framing",
      proposalId,
      workosOrganizationId: ORG,
    });
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
    expect(workspace.milestones.map((milestone: any) => milestone.milestoneKey)).toEqual([
      "foundation",
    ]);
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
            submilestones: [{ key: "porch-scope", name: "Porch scope", order: 1 }],
            x: 30,
          },
        },
        requestType: "createMilestone",
        workosOrganizationId: ORG,
      },
    );
    await t.mutation(
      (api as any).production_proposals.reviewProductionTimelineModificationRequest,
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
    expect(workspace.milestones.map((milestone: any) => milestone.milestoneKey)).toContain(
      "porch",
    );

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
    const { seed, t } = await seeded(["admin"], "user_admin");
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

    await t.mutation((api as any).production_proposals.saveDraftProposalPackage, {
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
    });
    await t.mutation((api as any).production_proposals.createProductionTimelineEvidenceAsset, {
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
    });
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
    expect(workspace.milestones[0]).toMatchObject({
      completionReview: expect.objectContaining({
        note: "Milestone approved from production build detail.",
        siteVisit: expect.objectContaining({
          note: "Verify footing photo location.",
          requestedDay: 23,
          status: "requested",
        }),
        status: "approved",
      }),
      evidenceState: "Approved",
      status: "complete",
    });
    expect(workspace.quickActionEvents.map((event: any) => event.eventType)).toEqual(
      expect.arrayContaining(["active_build.milestone.approved"]),
    );
    expect(workspace.auditEvents.map((event: any) => event.eventType)).toEqual(
      expect.arrayContaining([
        "active_build.created",
        "active_build.note.created",
        "active_build.document.created",
        "active_build.contractor.attached",
        "active_build.draw.requested",
        "active_build.draw.approved",
        "active_build.draw.released",
        "active_build.milestone.info_requested",
        "active_build.site_visit.requested",
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

    await t.mutation((api as any).production_proposals.saveDraftProposalPackage, {
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
    expect(scenarios.byName["Seed Scenario - Approved With Permit"]).toMatchObject({
      reviewOutcome: "approved",
      status: "approved",
    });
    expect(scenarios.byName["Seed Scenario - Approved With Waiver"]).toMatchObject({
      reviewOutcome: "approved",
      status: "approved",
    });
    expect(scenarios.byName["Seed Scenario - Requested Changes"]).toMatchObject({
      reviewOutcome: "requested_changes",
      status: "draft",
    });
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
    expect(
      scenarios.events.map((event: any) => event.eventType),
    ).toEqual(
      expect.arrayContaining([
        "proposal.submitted",
        "proposal.approved",
        "proposal.changes_requested",
        "proposal.rejected",
        "proposal.closed",
      ]),
    );
    expect(
      scenarios.outbox.map((event: any) => event.eventType),
    ).toContain("active_build.created");
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

    expect(dashboard.milestones).toHaveLength(2);
    expect(
      dashboard.milestones.map((milestone: any) => milestone.name),
    ).toEqual(["Foundation", "Shell and Dry-In"]);
    expect(
      dashboard.milestones.every((milestone: any) =>
        milestone.href.startsWith(
          `/backoffice/builds/${dashboard.activeBuilds[0].buildKey}`,
        ),
      ),
    ).toBe(true);

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
    await t.mutation((api as any).production_proposals.saveDraftProposalPackage, {
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
    });
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
        (api as any).production_proposals.updateSubmittedProposalDrawScheduleRow,
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
        (api as any).production_proposals.updateSubmittedProposalDrawScheduleRow,
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
