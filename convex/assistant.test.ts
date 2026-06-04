/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";

import { api } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

const ORG = "org_assistant_foundation";
const OTHER_ORG = "org_assistant_other";

function withIdentity(t: any, roles: string[], subject: string, org = ORG) {
  return t.withIdentity({
    email: `${subject}@example.com`,
    name: subject,
    organizationId: org,
    role: roles[0],
    roles,
    subject,
    tokenIdentifier: `https://api.workos.com/|${subject}`,
  } as any);
}

async function seeded(roles: string[] = ["admin"], subject = "assistant_admin") {
  const base = convexTest(schema, modules);
  const t = withIdentity(base, roles, subject);
  const seed = await t.mutation(
    (api as any).production_proposals.dev_seedProductionFoundation,
    { workosOrganizationId: ORG },
  );
  return { base, seed, t };
}

async function createDraftProposal(t: any, seed: any) {
  const proposalId = await t.mutation(
    (api as any).production_proposals.createDraftProposal,
    {
      brokerageId: seed.brokerageId,
      builderProfileId: seed.builderProfileId,
      buildName: "Assistant test proposal",
      location: "44 Assistant Lane, Toronto, ON",
      workosOrganizationId: ORG,
    },
  );
  await t.mutation((api as any).production_proposals.saveDraftProposalPackage, {
    borrowerCoPayBps: 2_000,
    borrowerWorkingCapitalLimitCents: 35_000_000,
    documents: [
      {
        documentType: "permit",
        fileName: "assistant-permit.pdf",
        mimeType: "application/pdf",
        sizeBytes: 512,
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
        submilestones: [],
      },
      {
        budgetCents: 80_000_00,
        dayEnd: 30,
        dayStart: 30,
        dependencyKeys: ["foundation"],
        durationDays: 1,
        key: "framing",
        name: "Framing",
        order: 2,
        submilestones: [],
      },
    ],
    proposalId,
    workosOrganizationId: ORG,
  });
  return proposalId;
}

async function createActiveBuild(t: any, seed: any) {
  const proposalId = await createDraftProposal(t, seed);
  await t.mutation((api as any).production_proposals.submitProposal, {
    proposalId,
    workosOrganizationId: ORG,
  });
  await t.mutation((api as any).production_proposals.approveProposal, {
    proposalId,
    reason: "Assistant test approval.",
    workosOrganizationId: ORG,
  });
  return await t.mutation((api as any).production_proposals.recordOfflineClosing, {
    buildStartDate: "2026-05-01",
    loanFacility: {
      interestAnnualBps: 925,
      principalCents: 55_000_000,
    },
    proposalId,
    reason: "Assistant test closing.",
    workosOrganizationId: ORG,
  });
}

function proposalMilestoneScheduleAction(
  proposalId: string,
  milestoneKey = "framing",
) {
  return {
    actionKey: "update_proposal_milestone_schedule",
    clientRequestId: "item_schedule",
    input: {
      dayEnd: 45,
      dayStart: 30,
      milestoneKey,
      proposalId,
      reason: "Assistant HITL schedule update.",
    },
  };
}

describe("DrawFlow assistant HITL backend", () => {
  test("persists organization-scoped assistant threads/action plans and denies cross-organization access", async () => {
    const { base, seed, t } = await seeded();
    const proposalId = await createDraftProposal(t, seed);

    const threadId = await t.mutation((api as any).assistant.ensureThread, {
      routeContext: { proposalId, routeId: "/builder/proposals/$proposalId" },
      title: "Proposal planning",
      workosOrganizationId: ORG,
    });
    const planId = await t.mutation((api as any).assistant.createActionPlan, {
      actions: [proposalMilestoneScheduleAction(proposalId)],
      routeContext: { proposalId, routeId: "/builder/proposals/$proposalId" },
      threadId,
      workosOrganizationId: ORG,
    });

    const sameOrgPlan = await t.query((api as any).assistant.getActionPlan, {
      planId,
      workosOrganizationId: ORG,
    });
    expect(sameOrgPlan.organizationId).toBe(ORG);
    expect(sameOrgPlan.items).toHaveLength(1);

    const otherOrg = withIdentity(base, ["admin"], "other_admin", OTHER_ORG);
    await expect(
      otherOrg.query((api as any).assistant.getActionPlan, {
        planId,
        workosOrganizationId: OTHER_ORG,
      }),
    ).rejects.toThrow(/not found|forbidden|organization/i);
  });

  test("rejects tools outside the closed catalog and rejects contractor mutation batches", async () => {
    const { seed, t } = await seeded();
    const proposalId = await createDraftProposal(t, seed);

    await expect(
      t.mutation((api as any).assistant.createActionPlan, {
        actions: [
          {
            actionKey: "approve_active_build_draw",
            clientRequestId: "forbidden_draw_approval",
            input: { proposalId },
          },
        ],
        routeContext: { proposalId },
        workosOrganizationId: ORG,
      }),
    ).rejects.toThrow(/closed catalog|not allowed|unsupported/i);

    const contractor = withIdentity(
      convexTest(schema, modules),
      ["contractor"],
      "assistant_contractor",
    );
    await expect(
      contractor.mutation((api as any).assistant.createActionPlan, {
        actions: [proposalMilestoneScheduleAction(proposalId)],
        routeContext: { proposalId },
        workosOrganizationId: ORG,
      }),
    ).rejects.toThrow(/contractor|read-only|forbidden/i);
  });

  test("applies accepted proposal milestone and draw actions only after confirmation", async () => {
    const { seed, t } = await seeded(["admin"], "proposal_admin");
    const proposalId = await createDraftProposal(t, seed);

    const planId = await t.mutation((api as any).assistant.createActionPlan, {
      actions: [
        proposalMilestoneScheduleAction(proposalId),
        {
          actionKey: "update_proposal_milestone_budget",
          clientRequestId: "item_budget",
          input: {
            budgetCents: 12_000_000,
            milestoneKey: "framing",
            proposalId,
            reason: "Assistant HITL budget update.",
          },
        },
        {
          actionKey: "create_proposal_planned_draw",
          clientRequestId: "item_draw",
          input: {
            amountCents: 8_000_000,
            drawKey: "assistant-framing-draw",
            label: "Framing reimbursement draw",
            milestoneKey: "framing",
            proposalId,
            timingDay: 47,
          },
        },
      ],
      routeContext: { proposalId },
      workosOrganizationId: ORG,
    });

    let rows = await t.run(async (ctx: any) => ({
      draws: await ctx.db
        .query("proposalDrawScheduleRows")
        .withIndex("by_proposal", (q: any) => q.eq("proposalId", proposalId))
        .collect(),
      milestone: await ctx.db
        .query("proposalMilestones")
        .withIndex("by_proposal_key", (q: any) =>
          q.eq("proposalId", proposalId).eq("key", "framing"),
        )
        .unique(),
    }));
    expect(rows.milestone.dayEnd).toBe(31);
    expect(rows.draws.some((row: any) => row.drawKey === "assistant-framing-draw")).toBe(false);

    await t.mutation((api as any).assistant.commitActionPlan, {
      acceptedClientRequestIds: ["item_schedule", "item_budget", "item_draw"],
      editedInputs: {},
      planId,
      rejectedClientRequestIds: [],
      workosOrganizationId: ORG,
    });

    rows = await t.run(async (ctx: any) => ({
      draws: await ctx.db
        .query("proposalDrawScheduleRows")
        .withIndex("by_proposal", (q: any) => q.eq("proposalId", proposalId))
        .collect(),
      milestone: await ctx.db
        .query("proposalMilestones")
        .withIndex("by_proposal_key", (q: any) =>
          q.eq("proposalId", proposalId).eq("key", "framing"),
        )
        .unique(),
    }));
    expect(rows.milestone.dayEnd).toBe(45);
    expect(rows.milestone.budgetCents).toBe(12_000_000);
    expect(
      rows.draws.find((row: any) => row.drawKey === "assistant-framing-draw"),
    ).toMatchObject({ amountCents: 8_000_000, timingDay: 47 });
  });

  test("commits accepted batches atomically when one accepted item is invalid", async () => {
    const { seed, t } = await seeded(["admin"], "atomic_admin");
    const proposalId = await createDraftProposal(t, seed);
    const planId = await t.mutation((api as any).assistant.createActionPlan, {
      actions: [
        proposalMilestoneScheduleAction(proposalId),
        {
          actionKey: "create_proposal_planned_draw",
          clientRequestId: "invalid_draw",
          input: {
            amountCents: 8_000_000,
            drawKey: "invalid-draw",
            label: "Invalid draw",
            proposalId,
            timingDay: 47,
          },
        },
      ],
      routeContext: { proposalId },
      workosOrganizationId: ORG,
    });

    const outcome = await t.mutation((api as any).assistant.commitActionPlan, {
      acceptedClientRequestIds: ["item_schedule", "invalid_draw"],
      editedInputs: { invalid_draw: { amountCents: -1 } },
      planId,
      rejectedClientRequestIds: [],
      workosOrganizationId: ORG,
    });
    expect(outcome).toMatchObject({
      ok: false,
      failedClientRequestId: "invalid_draw",
    });

    const milestone = await t.run(async (ctx: any) =>
      ctx.db
        .query("proposalMilestones")
        .withIndex("by_proposal_key", (q: any) =>
          q.eq("proposalId", proposalId).eq("key", "framing"),
        )
        .unique(),
    );
    expect(milestone.dayEnd).toBe(31);
  });

  test("creates active-build revision request records without directly mutating live schedule or draw rows", async () => {
    const { seed, t } = await seeded(["admin"], "active_admin");
    const { buildId } = await createActiveBuild(t, seed);
    const planId = await t.mutation((api as any).assistant.createActionPlan, {
      actions: [
        {
          actionKey: "request_active_build_milestone_schedule_revision",
          clientRequestId: "active_schedule",
          input: {
            buildId,
            dayEnd: 45,
            dayStart: 30,
            milestoneKey: "framing",
            reason: "Assistant HITL active-build schedule request.",
          },
        },
        {
          actionKey: "request_active_build_draw_plan_revision",
          clientRequestId: "active_draw",
          input: {
            amountCents: 8_000_000,
            buildId,
            drawKey: "assistant-live-draw",
            label: "Framing reimbursement draw",
            milestoneKey: "framing",
            reason: "Assistant HITL active-build draw request.",
            timingDay: 47,
          },
        },
      ],
      routeContext: { buildId },
      workosOrganizationId: ORG,
    });

    await t.mutation((api as any).assistant.commitActionPlan, {
      acceptedClientRequestIds: ["active_schedule", "active_draw"],
      editedInputs: {},
      planId,
      rejectedClientRequestIds: [],
      workosOrganizationId: ORG,
    });

    const state = await t.run(async (ctx: any) => ({
      draw: (
        await ctx.db
          .query("plannedDrawScheduleRows")
          .withIndex("by_build", (q: any) => q.eq("buildId", buildId))
          .collect()
      ).find((row: any) => row.drawKey === "assistant-live-draw"),
      milestone: await ctx.db
        .query("buildMilestones")
        .withIndex("by_build_key", (q: any) =>
          q.eq("buildId", buildId).eq("key", "framing"),
        )
        .unique(),
      revisions: await ctx.db
        .query("scheduleRevisionRecords")
        .withIndex("by_build", (q: any) => q.eq("buildId", buildId))
        .collect(),
    }));
    expect(state.draw).toBeUndefined();
    expect(state.milestone.dayEnd).toBe(31);
    expect(state.revisions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          entityType: "buildMilestone",
          revisionType: "assistant.active_build.milestone.schedule_request",
        }),
        expect.objectContaining({
          entityType: "plannedDrawScheduleRow",
          revisionType: "assistant.active_build.draw_plan_request",
        }),
      ]),
    );
  });

  test("writes calendar target dates and reminder-only events without mutating schedule rows", async () => {
    const { seed, t } = await seeded(["admin"], "calendar_admin");
    const proposalId = await createDraftProposal(t, seed);
    const planId = await t.mutation((api as any).assistant.createActionPlan, {
      actions: [
        {
          actionKey: "set_calendar_target_date",
          clientRequestId: "target_date",
          input: {
            dateKind: "reviewTarget",
            milestoneKey: "framing",
            proposalId,
            reason: "Assistant review target.",
            targetDate: "2026-06-15",
          },
        },
        {
          actionKey: "create_proposal_reminder",
          clientRequestId: "reminder",
          input: {
            allDay: true,
            proposalId,
            startsAt: "2026-06-16",
            timezone: "America/Toronto",
            title: "Call framing contractor",
          },
        },
      ],
      routeContext: { proposalId },
      workosOrganizationId: ORG,
    });
    const before = await t.run(async (ctx: any) =>
      ctx.db
        .query("proposalMilestones")
        .withIndex("by_proposal_key", (q: any) =>
          q.eq("proposalId", proposalId).eq("key", "framing"),
        )
        .unique(),
    );

    await t.mutation((api as any).assistant.commitActionPlan, {
      acceptedClientRequestIds: ["target_date", "reminder"],
      editedInputs: {},
      planId,
      rejectedClientRequestIds: [],
      workosOrganizationId: ORG,
    });

    const after = await t.run(async (ctx: any) => ({
      milestone: await ctx.db
        .query("proposalMilestones")
        .withIndex("by_proposal_key", (q: any) =>
          q.eq("proposalId", proposalId).eq("key", "framing"),
        )
        .unique(),
      reminders: await ctx.db
        .query("calendarReminderEvents")
        .withIndex("by_proposal", (q: any) => q.eq("proposalId", proposalId))
        .collect(),
      targets: await ctx.db
        .query("calendarTargetDates")
        .withIndex("by_proposal", (q: any) => q.eq("proposalId", proposalId))
        .collect(),
    }));
    expect(after.milestone.dayEnd).toBe(before.dayEnd);
    expect(after.targets).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          dateKind: "reviewTarget",
          targetDate: "2026-06-15",
        }),
      ]),
    );
    expect(after.reminders).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          startsAt: "2026-06-16",
          title: "Call framing contractor",
        }),
      ]),
    );
  });

  test("persists product traces without raw chain-of-thought fields", async () => {
    const { seed, t } = await seeded(["admin"], "trace_admin");
    const proposalId = await createDraftProposal(t, seed);
    const threadId = await t.mutation((api as any).assistant.ensureThread, {
      routeContext: { proposalId },
      title: "Trace test",
      workosOrganizationId: ORG,
    });

    await t.mutation((api as any).assistant.recordTraceEvent, {
      event: {
        aguiType: "TOOL_CALL_START",
        label: "Validating action plan",
        metadata: {
          reasoning: "this must be stripped",
          toolName: "validate_action_plan",
        },
        status: "running",
      },
      threadId,
      workosOrganizationId: ORG,
    });

    const traces = await t.query((api as any).assistant.listTraceEvents, {
      threadId,
      workosOrganizationId: ORG,
    });
    expect(traces).toHaveLength(1);
    expect(JSON.stringify(traces[0])).not.toMatch(/reasoning|chainOfThought|rawThought/i);
    expect(traces[0]).toMatchObject({
      aguiType: "TOOL_CALL_START",
      label: "Validating action plan",
      status: "running",
    });
  });
});
