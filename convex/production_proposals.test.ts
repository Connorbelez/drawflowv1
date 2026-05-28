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

  test("filters proposal access by organization, assigned broker, broker-staff permission, and builder ownership", async () => {
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

    const broker = withIdentity(base, ["broker"], "user_broker");
    await expect(
      broker.query((api as any).production_proposals.getProposalDetail, {
        proposalId,
        workosOrganizationId: ORG,
      }),
    ).rejects.toThrow(/Forbidden/);
    let brokerKanban = await broker.query(
      (api as any).production_proposals.listProposalKanban,
      { workosOrganizationId: ORG },
    );
    expect(brokerKanban.columns.flatMap((column: any) => column.cards)).toHaveLength(
      0,
    );

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
