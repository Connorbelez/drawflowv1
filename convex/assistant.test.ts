/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import type OpenAI from "openai";
import { describe, expect, test, vi } from "vitest";

import { api } from "./_generated/api";
import { resolveAssistantModel } from "./assistantProvider";
import schema from "./schema";
import { draftSiteVisitGuidance } from "./siteVisitGuidance";

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
  await t.run(async (ctx: any) => {
    const now = Date.now();
    await ctx.db.patch(proposalId, {
      selectedPlan: {
        metrics: {
          drawCount: 2,
          drawFeesCents: 100_000,
          interestCostCents: 250_000,
          minimumCashReserveCents: 5_000_000,
          projectedDurationDays: 31,
          startingCashCents: 35_000_000,
          totalCostCents: 350_000,
          totalDrawAmountCents: 58_000_000,
        },
        name: "Cheapest Feasible",
        planKey: "cheapestFeasible",
        recommendationReason: "Selected by assistant active-build test setup.",
        selectedAt: now,
        selectedByWorkosUserId: "assistant_test_setup",
      },
    });
  });
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

async function unlockActiveBuildMilestoneForDraw(
  t: any,
  buildId: any,
  milestoneKey = "framing",
) {
  await t.run(async (ctx: any) => {
    const milestone = await ctx.db
      .query("buildMilestones")
      .withIndex("by_build_key", (q: any) =>
        q.eq("buildId", buildId).eq("key", milestoneKey),
      )
      .unique();
    if (!milestone) {
      throw new Error("Assistant test milestone not found.");
    }
    await ctx.db.patch(milestone._id, {
      completionReview: {
        reviewedAt: "2026-07-14T12:00:00.000Z",
        status: "approved",
      },
      status: "complete",
    });
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

async function planWithFallback(t: any, input: Record<string, unknown>) {
  const openai = process.env.OPENAI_API_KEY;
  const openrouter = process.env.OPENROUTER_API_KEY;
  delete process.env.OPENAI_API_KEY;
  delete process.env.OPENROUTER_API_KEY;
  try {
    return await t.action((api as any).assistant.planAssistantTurn, {
      routeContext: {},
      siteMap: [],
      workosOrganizationId: ORG,
      ...input,
    });
  } finally {
    if (openai === undefined) {
      delete process.env.OPENAI_API_KEY;
    } else {
      process.env.OPENAI_API_KEY = openai;
    }
    if (openrouter === undefined) {
      delete process.env.OPENROUTER_API_KEY;
    } else {
      process.env.OPENROUTER_API_KEY = openrouter;
    }
  }
}

function siteVisitGuidanceArgs() {
  return {
    build: {
      location: "44 Actual Cost Lane",
      name: "Actual cost active build",
    },
    currentGuidance: {
      cameraAngles: "<ul><li>Current angle.</li></ul>",
      whatToVerify: "<ul><li>Current check.</li></ul>",
    },
    milestone: { key: "foundation", name: "Foundation" },
    submilestones: [{ key: "forms", name: "Forms and pour" }],
    workosOrganizationId: ORG,
  };
}

describe("DrawFlow assistant HITL backend", () => {
  test("resolves provider-native model identifiers", () => {
    expect(resolveAssistantModel("openai", "gpt-5.4-mini")).toBe(
      "gpt-5.4-mini",
    );
    expect(resolveAssistantModel("openrouter", "gpt-5.4-mini")).toBe(
      "openai/gpt-5.4-mini",
    );
    expect(resolveAssistantModel("openrouter", "anthropic/claude-sonnet-4.5")).toBe(
      "anthropic/claude-sonnet-4.5",
    );
  });

  test("drafts scoped site visit guidance without mutating production state", async () => {
    vi.stubEnv("OPENAI_API_KEY", "");
    vi.stubEnv("OPENROUTER_API_KEY", "");
    try {
      const { t } = await seeded(["admin"], "guidance_admin");
      const result = await t.action(
        (api as any).assistant.generateSiteVisitGuidance,
        siteVisitGuidanceArgs(),
      );

      expect(result.source).toBe("fallback");
      expect(result.whatToVerify).toContain("Foundation");
      expect(result.whatToVerify).toContain("Forms and pour");
      expect(result.cameraAngles).toContain("44 Actual Cost Lane");
      expect(result.whatToVerify).toMatch(/^<ul><li>/);
      expect(result.cameraAngles).toMatch(/^<ul><li>/);
    } finally {
      vi.unstubAllEnvs();
    }
  });

  test("falls back when the configured guidance provider rejects authentication", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const create = vi.fn().mockRejectedValue(
      Object.assign(new Error("User not found"), {
        status: 401,
      }),
    );
    const client = {
      chat: { completions: { create } },
    } as unknown as Pick<OpenAI, "chat">;

    try {
      const result = await draftSiteVisitGuidance({
        client,
        input: siteVisitGuidanceArgs(),
        model: "gpt-5.4-mini",
        provider: "openrouter",
      });

      expect(create).toHaveBeenCalledTimes(1);
      expect(warn).toHaveBeenCalledWith(
        expect.stringMatching(/openrouter.*401.*deterministic fallback/i),
      );
      expect(result).toMatchObject({ source: "fallback" });
      expect(result.whatToVerify).toContain("Foundation");
      expect(result.cameraAngles).toContain("44 Actual Cost Lane");
    } finally {
      warn.mockRestore();
    }
  });

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

  test("persists assistant workflow runs and advances step status durably", async () => {
    const { t } = await seeded(["admin"], "workflow_admin");
    const threadId = await t.mutation((api as any).assistant.ensureThread, {
      routeContext: { pathname: "/builder" },
      title: "Workflow planning",
      workosOrganizationId: ORG,
    });
    const workflowRunId = await t.mutation(
      (api as any).assistant.createWorkflowRun,
      {
        goal: "Start a new Garden Suite build proposal",
        prompt: "Start a new Garden Suite build",
        routeContext: { pathname: "/builder" },
        steps: [
          {
            id: "navigate:new-proposal",
            kind: "navigate",
            label: "Open New Build",
            status: "pending",
          },
          {
            id: "self-check:proposal-template",
            kind: "self_check",
            label: "Confirm Garden Suite is selected",
            status: "pending",
          },
        ],
        threadId,
        workosOrganizationId: ORG,
      },
    );

    let active = await t.query((api as any).assistant.getActiveWorkflowRun, {
      threadId,
      workosOrganizationId: ORG,
    });
    expect(active).toMatchObject({
      currentStepId: "navigate:new-proposal",
      goal: "Start a new Garden Suite build proposal",
      status: "running",
    });

    await t.mutation((api as any).assistant.updateWorkflowStep, {
      result: { to: "/builder/proposals/new" },
      status: "succeeded",
      stepId: "navigate:new-proposal",
      workflowRunId,
      workosOrganizationId: ORG,
    });

    active = await t.query((api as any).assistant.getActiveWorkflowRun, {
      threadId,
      workosOrganizationId: ORG,
    });
    expect(active).toMatchObject({
      currentStepId: "self-check:proposal-template",
      status: "running",
    });
    expect(active.steps).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "navigate:new-proposal",
          status: "succeeded",
        }),
      ]),
    );
  });

  test("keeps AGUI wait steps as hard workflow barriers before HITL preview work", async () => {
    const { t } = await seeded(["admin"], "workflow_gate_admin");
    const workflowRunId = await t.mutation(
      (api as any).assistant.createWorkflowRun,
      {
        goal: "Create reminder from generated UI selector",
        prompt: "remind me to call the framer tomorrow",
        routeContext: { pathname: "/builder" },
        steps: [
          {
            id: "render:selector",
            kind: "render_agui",
            label: "Render selector",
            status: "succeeded",
          },
          {
            id: "wait:selector",
            kind: "wait_for_agui_submit",
            label: "Wait for selector",
            status: "pending",
          },
          {
            id: "hitl:preview",
            kind: "prepare_hitl_action_plan",
            label: "Prepare HITL preview",
            status: "pending",
          },
        ],
        workosOrganizationId: ORG,
      },
    );

    await t.mutation((api as any).assistant.updateWorkflowStep, {
      result: { waitingFor: "reminderTarget" },
      status: "needs_input",
      stepId: "wait:selector",
      workflowRunId,
      workosOrganizationId: ORG,
    });

    const active = await t.query((api as any).assistant.getActiveWorkflowRun, {
      workosOrganizationId: ORG,
    });
    expect(active).toMatchObject({
      currentStepId: "wait:selector",
      status: "needs_input",
    });
    expect(active.steps).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "hitl:preview",
          status: "pending",
        }),
      ]),
    );
  });

  test("rejects tools outside the closed catalog and rejects contractor mutation batches", async () => {
    const { seed, t } = await seeded();
    const proposalId = await createDraftProposal(t, seed);

    await expect(
      t.mutation((api as any).assistant.createActionPlan, {
        actions: [
          {
            actionKey: "wire_money_outside_drawflow",
            clientRequestId: "outside_catalog",
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

  test("routes assistant milestone starts through structured HITL and the canonical domain command", async () => {
    const { base, seed, t: admin } = await seeded(
      ["admin"],
      "assistant_start_admin"
    );
    const { buildId } = await createActiveBuild(admin, seed);
    const builder = withIdentity(base, ["builder"], "user_builder");
    const actualStartedAt = Date.now() - 60_000;
    const planId = await builder.mutation(
      (api as any).assistant.createActionPlan,
      {
        actions: [
          {
            actionKey: "start_active_build_milestone",
            clientRequestId: "assistant_start",
            input: {
              actualStartedAt,
              buildId,
              idempotencyKey: "assistant-start-foundation-01",
              milestoneKey: "foundation",
            },
          },
        ],
        routeContext: { buildId },
        workosOrganizationId: ORG,
      }
    );

    let state = await builder.run(async (ctx: any) => ({
      events: await ctx.db
        .query("milestoneStartEvents")
        .withIndex("by_build", (q: any) => q.eq("buildId", buildId))
        .collect(),
      milestone: await ctx.db
        .query("buildMilestones")
        .withIndex("by_build_key", (q: any) =>
          q.eq("buildId", buildId).eq("key", "foundation")
        )
        .unique(),
    }));
    expect(state.milestone.actualStartedAt).toBeUndefined();
    expect(state.events).toHaveLength(0);

    await builder.mutation((api as any).assistant.commitActionPlan, {
      acceptedClientRequestIds: ["assistant_start"],
      editedInputs: {},
      planId,
      rejectedClientRequestIds: [],
      workosOrganizationId: ORG,
    });

    state = await builder.run(async (ctx: any) => ({
      events: await ctx.db
        .query("milestoneStartEvents")
        .withIndex("by_build", (q: any) => q.eq("buildId", buildId))
        .collect(),
      milestone: await ctx.db
        .query("buildMilestones")
        .withIndex("by_build_key", (q: any) =>
          q.eq("buildId", buildId).eq("key", "foundation")
        )
        .unique(),
    }));
    expect(state.milestone).toMatchObject({
      actualStartedAt,
      startSource: "assistant",
      status: "in_progress",
    });
    expect(state.events).toEqual([
      expect.objectContaining({
        actualStartedAt,
        eventType: "started",
        source: "assistant",
      }),
    ]);
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

    const reminderId = after.reminders.find(
      (event: any) => event.title === "Call framing contractor",
    )?._id;
    expect(reminderId).toBeTruthy();

    const updatePlanId = await t.mutation((api as any).assistant.createActionPlan, {
      actions: [
        {
          actionKey: "update_proposal_reminder",
          clientRequestId: "update_reminder",
          input: {
            eventId: reminderId,
            proposalId,
            startsAt: "2026-06-17",
            timezone: "America/Toronto",
            title: "Call framing contractor and inspector",
          },
        },
        {
          actionKey: "cancel_proposal_reminder",
          clientRequestId: "cancel_reminder",
          input: {
            eventId: reminderId,
            proposalId,
            reason: "Builder reminder no longer needed.",
          },
        },
      ],
      routeContext: { proposalId },
      workosOrganizationId: ORG,
    });

    await t.mutation((api as any).assistant.commitActionPlan, {
      acceptedClientRequestIds: ["update_reminder"],
      editedInputs: {},
      planId: updatePlanId,
      rejectedClientRequestIds: ["cancel_reminder"],
      workosOrganizationId: ORG,
    });

    let reminder = await t.run(async (ctx: any) => ctx.db.get(reminderId));
    expect(reminder).toMatchObject({
      startsAt: "2026-06-17",
      status: "active",
      title: "Call framing contractor and inspector",
    });

    const cancelPlanId = await t.mutation((api as any).assistant.createActionPlan, {
      actions: [
        {
          actionKey: "cancel_proposal_reminder",
          clientRequestId: "cancel_reminder_confirmed",
          input: {
            eventId: reminderId,
            proposalId,
            reason: "Builder reminder no longer needed.",
          },
        },
      ],
      routeContext: { proposalId },
      workosOrganizationId: ORG,
    });

    await t.mutation((api as any).assistant.commitActionPlan, {
      acceptedClientRequestIds: ["cancel_reminder_confirmed"],
      editedInputs: {},
      planId: cancelPlanId,
      rejectedClientRequestIds: [],
      workosOrganizationId: ORG,
    });
    reminder = await t.run(async (ctx: any) => ctx.db.get(reminderId));
    expect(reminder.status).toBe("cancelled");
  });

  test("writes live-build reminders onto active-build calendar projection", async () => {
    const { seed, t } = await seeded(["admin"], "active_calendar_admin");
    const closing = await createActiveBuild(t, seed);
    const buildId = closing.buildId;
    const build = await t.run((ctx: any) => ctx.db.get(buildId));

    const planId = await t.mutation((api as any).assistant.createActionPlan, {
      actions: [
        {
          actionKey: "create_proposal_reminder",
          clientRequestId: "active_build_reminder",
          input: {
            allDay: true,
            buildId,
            startsAt: "2026-06-26",
            timezone: "America/Toronto",
            title: "Purchase stucco supplies",
          },
        },
      ],
      routeContext: { activeBuildId: buildId },
      workosOrganizationId: ORG,
    });

    await t.mutation((api as any).assistant.commitActionPlan, {
      acceptedClientRequestIds: ["active_build_reminder"],
      editedInputs: {},
      planId,
      rejectedClientRequestIds: [],
      workosOrganizationId: ORG,
    });

    const reminders = await t.run((ctx: any) =>
      ctx.db
        .query("calendarReminderEvents")
        .withIndex("by_build", (q: any) => q.eq("buildId", buildId))
        .collect(),
    );
    expect(reminders).toEqual([
      expect.objectContaining({
        buildId,
        proposalId: build.proposalId,
        startsAt: "2026-06-26",
        title: "Purchase stucco supplies",
      }),
    ]);

    const calendar = await t.query(
      (api as any).production_proposals.getActiveBuildCalendarWorkspace,
      { buildId, workosOrganizationId: ORG },
    );
    expect(calendar.events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "reminder",
          relatedEntityIds: expect.arrayContaining([
            String(buildId),
            String(build.proposalId),
          ]),
          startsAt: "2026-06-26",
          surface: "activeBuild",
          title: "Purchase stucco supplies",
        }),
      ]),
    );
  });

  test("creates a draft proposal from reviewed setup payload through HITL", async () => {
    const { t } = await seeded(["admin"], "setup_admin");
    const planId = await t.mutation((api as any).assistant.createActionPlan, {
      actions: [
        {
          actionKey: "create_build_proposal_from_setup",
          clientRequestId: "setup_create",
          input: {
            borrowerWorkingCapitalLimitCents: 25_000_000,
            buildName: "Assistant Garden Suite",
            costItems: [
              {
                costCents: 2_500_000,
                itemType: "material",
                milestoneKey: "foundation",
                quantity: 1,
                relevantSubmilestoneKeys: ["permit-mobilization"],
                supplier: "A1 Lumber",
                title: "Framing lumber package",
              },
            ],
            lenderDrawPolicyLimitCents: 80_000_000,
            location: "12 Garden Lane, Toronto, ON",
            milestones: [
              {
                budgetCents: 50_000_000,
                dayEnd: 14,
                dayStart: 0,
                dependencyKeys: [],
                durationDays: 14,
                key: "foundation",
                name: "Foundation",
                order: 1,
                submilestones: [
                  {
                    budgetCents: 20_000_000,
                    durationDays: 3,
                    key: "permit-mobilization",
                    name: "Permit mobilization",
                    order: 1,
                    startDay: 0,
                  },
                ],
              },
            ],
            loanPercentageBps: 8_000,
            proposedStartDate: "2026-07-01",
          },
        },
      ],
      routeContext: { routeId: "/backoffice/proposals/new" },
      workosOrganizationId: ORG,
    });

    const outcome = await t.mutation((api as any).assistant.commitActionPlan, {
      acceptedClientRequestIds: ["setup_create"],
      editedInputs: {},
      planId,
      rejectedClientRequestIds: [],
      workosOrganizationId: ORG,
    });
    expect(outcome.ok).toBe(true);
    const proposalId = outcome.applied[0].result.proposalId;

    const state = await t.run(async (ctx: any) => ({
      costItems: await ctx.db
        .query("proposalCostItems")
        .withIndex("by_proposal", (q: any) => q.eq("proposalId", proposalId))
        .collect(),
      milestones: await ctx.db
        .query("proposalMilestones")
        .withIndex("by_proposal", (q: any) => q.eq("proposalId", proposalId))
        .collect(),
      proposal: await ctx.db.get(proposalId),
      submilestones: await ctx.db
        .query("proposalSubmilestones")
        .withIndex("by_proposal", (q: any) => q.eq("proposalId", proposalId))
        .collect(),
    }));
    expect(state.proposal).toMatchObject({
      borrowerCoPayBps: 2_000,
      buildName: "Assistant Garden Suite",
      location: "12 Garden Lane, Toronto, ON",
      proposedStartDate: "2026-07-01",
      status: "draft",
    });
    expect(state.milestones).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: "foundation" }),
      ]),
    );
    expect(state.submilestones).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: "permit-mobilization" }),
      ]),
    );
    expect(state.costItems).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          itemType: "material",
          supplier: "A1 Lumber",
          title: "Framing lumber package",
        }),
      ]),
    );
  });

  test("creates, updates, and deletes proposal material cost items through delegated HITL mutations", async () => {
    const { seed, t } = await seeded(["admin"], "cost_item_admin");
    const proposalId = await createDraftProposal(t, seed);
    const createPlanId = await t.mutation((api as any).assistant.createActionPlan, {
      actions: [
        {
          actionKey: "create_proposal_cost_item",
          clientRequestId: "create_material",
          input: {
            costCents: 1_200_000,
            itemType: "material",
            milestoneKey: "foundation",
            proposalId,
            quantity: 2,
            relevantSubmilestoneKeys: [],
            supplier: "Concrete Co",
            title: "Concrete package",
          },
        },
      ],
      routeContext: { proposalId },
      workosOrganizationId: ORG,
    });
    await t.mutation((api as any).assistant.commitActionPlan, {
      acceptedClientRequestIds: ["create_material"],
      editedInputs: {},
      planId: createPlanId,
      rejectedClientRequestIds: [],
      workosOrganizationId: ORG,
    });
    let item = await t.run(async (ctx: any) =>
      ctx.db
        .query("proposalCostItems")
        .withIndex("by_proposal", (q: any) => q.eq("proposalId", proposalId))
        .unique(),
    );
    expect(item).toMatchObject({
      costCents: 1_200_000,
      quantity: 2,
      supplier: "Concrete Co",
    });

    const updatePlanId = await t.mutation((api as any).assistant.createActionPlan, {
      actions: [
        {
          actionKey: "update_proposal_cost_item",
          clientRequestId: "update_material",
          input: {
            costCents: 1_500_000,
            itemId: item._id,
            proposalId,
            quantity: 1,
            relevantSubmilestoneKeys: [],
            title: "Concrete and pump package",
          },
        },
      ],
      routeContext: { proposalId },
      workosOrganizationId: ORG,
    });
    await t.mutation((api as any).assistant.commitActionPlan, {
      acceptedClientRequestIds: ["update_material"],
      editedInputs: {},
      planId: updatePlanId,
      rejectedClientRequestIds: [],
      workosOrganizationId: ORG,
    });
    item = await t.run(async (ctx: any) => ctx.db.get(item._id));
    expect(item).toMatchObject({
      costCents: 1_500_000,
      quantity: 1,
      title: "Concrete and pump package",
    });

    const deletePlanId = await t.mutation((api as any).assistant.createActionPlan, {
      actions: [
        {
          actionKey: "delete_proposal_cost_item",
          clientRequestId: "delete_material",
          input: {
            itemId: item._id,
            proposalId,
            reason: "Remove duplicate package.",
          },
        },
      ],
      routeContext: { proposalId },
      workosOrganizationId: ORG,
    });
    await t.mutation((api as any).assistant.commitActionPlan, {
      acceptedClientRequestIds: ["delete_material"],
      editedInputs: {},
      planId: deletePlanId,
      rejectedClientRequestIds: [],
      workosOrganizationId: ORG,
    });
    expect(await t.run(async (ctx: any) => ctx.db.get(item._id))).toBeNull();
  });

  test("requests, approves, and releases an active-build draw through HITL", async () => {
    const { seed, t } = await seeded(["admin"], "draw_admin");
    const { buildId } = await createActiveBuild(t, seed);
    await unlockActiveBuildMilestoneForDraw(t, buildId);
    const draw = await t.run(async (ctx: any) =>
      (
        await ctx.db
          .query("plannedDrawScheduleRows")
          .withIndex("by_build", (q: any) => q.eq("buildId", buildId))
          .collect()
      )[0],
    );
    expect(draw).toBeTruthy();

    const planId = await t.mutation((api as any).assistant.createActionPlan, {
      actions: [
        {
          actionKey: "request_active_build_draw",
          clientRequestId: "request_draw",
          input: {
            amountCents: Math.max(1, Math.min(draw.amountCents, 1_000_000)),
            buildId,
            drawKey: draw.drawKey,
            note: "Builder requests reimbursement.",
          },
        },
        {
          actionKey: "start_active_build_draw_review",
          clientRequestId: "start_draw_review",
          input: {
            buildId,
            drawKey: draw.drawKey,
            note: "Operations review started.",
          },
        },
        {
          actionKey: "submit_active_build_draw_for_admin",
          clientRequestId: "submit_draw_for_admin",
          input: {
            buildId,
            drawKey: draw.drawKey,
            reason: "Evidence and source attribution reviewed.",
          },
        },
        {
          actionKey: "approve_active_build_draw",
          clientRequestId: "approve_draw",
          input: {
            buildId,
            drawKey: draw.drawKey,
            reason: "Evidence reviewed.",
          },
        },
        {
          actionKey: "release_active_build_draw",
          clientRequestId: "release_draw",
          input: {
            buildId,
            drawKey: draw.drawKey,
            reason: "Release approved reimbursement.",
            releaseDate: "2026-06-30",
          },
        },
      ],
      routeContext: { buildId },
      workosOrganizationId: ORG,
    });
    const outcome = await t.mutation((api as any).assistant.commitActionPlan, {
      acceptedClientRequestIds: [
        "request_draw",
        "start_draw_review",
        "submit_draw_for_admin",
        "approve_draw",
        "release_draw",
      ],
      editedInputs: {},
      planId,
      rejectedClientRequestIds: [],
      workosOrganizationId: ORG,
    });
    expect(outcome.ok).toBe(true);

    const state = await t.run(async (ctx: any) => ({
      actualDraw: await ctx.db
        .query("activeBuildDrawRequests")
        .withIndex("by_build", (q: any) => q.eq("buildId", buildId))
        .unique(),
      capitalEvents: await ctx.db
        .query("capitalEvents")
        .withIndex("by_build", (q: any) => q.eq("buildId", buildId))
        .collect(),
      plannedDraw: await ctx.db.get(draw._id),
    }));
    expect(state.actualDraw).toMatchObject({
      operationsRecommendationNote: "Evidence and source attribution reviewed.",
      releaseDate: "2026-06-30",
      status: "released",
    });
    expect(state.plannedDraw).toMatchObject({ status: "planned" });
    expect(state.capitalEvents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ eventType: "draw_release" }),
      ]),
    );
  });

  test("builds operational briefing from live workflow state, not only notifications", async () => {
    const { seed, t } = await seeded(["admin"], "briefing_admin");
    const { buildId } = await createActiveBuild(t, seed);
    await unlockActiveBuildMilestoneForDraw(t, buildId);
    const draw = await t.run(async (ctx: any) =>
      (
        await ctx.db
          .query("plannedDrawScheduleRows")
          .withIndex("by_build", (q: any) => q.eq("buildId", buildId))
          .collect()
      )[0],
    );

    const planId = await t.mutation((api as any).assistant.createActionPlan, {
      actions: [
        {
          actionKey: "request_active_build_draw",
          clientRequestId: "briefing_draw_request",
          input: {
            amountCents: Math.max(1, Math.min(draw.amountCents, 1_000_000)),
            buildId,
            drawKey: draw.drawKey,
            note: "Builder requests reimbursement.",
          },
        },
      ],
      routeContext: { buildId },
      workosOrganizationId: ORG,
    });
    await t.mutation((api as any).assistant.commitActionPlan, {
      acceptedClientRequestIds: ["briefing_draw_request"],
      editedInputs: {},
      planId,
      rejectedClientRequestIds: [],
      workosOrganizationId: ORG,
    });

    const context = await t.query((api as any).assistant.getAssistantContext, {
      routeContext: {
        activeBuildId: buildId,
        pathname: `/backoffice/builds/${buildId}`,
      },
      workosOrganizationId: ORG,
    });
    const briefingItems = context.operationalBriefing.sections.flatMap(
      (section: any) => section.items,
    );

    expect(briefingItems).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "drawRequest",
          source: "activeBuildDrawRequests.status",
        }),
        expect.objectContaining({
          kind: "behindSchedule",
          source: "buildMilestones.dayEnd",
        }),
      ]),
    );
    expect(context.target).toMatchObject({
      buildId,
      kind: "activeBuild",
    });
  });

  test("plans proposal collaboration and saves calendar integrations through HITL", async () => {
    const { seed, t } = await seeded(["admin"], "collab_admin");
    const proposalId = await createDraftProposal(t, seed);
    const collaborationPlanId = await t.mutation(
      (api as any).assistant.createActionPlan,
      {
        actions: [
          {
            actionKey: "start_proposal_collaboration",
            clientRequestId: "start_collab",
            input: { proposalId },
          },
        ],
        routeContext: { proposalId },
        workosOrganizationId: ORG,
      },
    );
    const collaborationPlan = await t.query((api as any).assistant.getActionPlan, {
      planId: collaborationPlanId,
      workosOrganizationId: ORG,
    });
    expect(collaborationPlan.items[0]).toMatchObject({
      actionKey: "start_proposal_collaboration",
      entityType: "proposalCollaborationSession",
    });

    const planId = await t.mutation((api as any).assistant.createActionPlan, {
      actions: [
        {
          actionKey: "save_calendar_view",
          clientRequestId: "save_view",
          input: {
            filters: { proposalId },
            isDefault: true,
            label: "Proposal agenda",
            surface: "proposal",
            timeframe: "agenda",
            viewKey: "assistant-proposal-agenda",
          },
        },
        {
          actionKey: "create_calendar_sync_subscription",
          clientRequestId: "sync_calendar",
          input: {
            filters: { proposalId },
            provider: "ics",
            proposalId,
            surface: "proposal",
          },
        },
      ],
      routeContext: { proposalId },
      workosOrganizationId: ORG,
    });
    const outcome = await t.mutation((api as any).assistant.commitActionPlan, {
      acceptedClientRequestIds: ["save_view", "sync_calendar"],
      editedInputs: {},
      planId,
      rejectedClientRequestIds: [],
      workosOrganizationId: ORG,
    });
    expect(outcome.ok).toBe(true);

    const state = await t.run(async (ctx: any) => ({
      subscriptions: await ctx.db
        .query("calendarSyncSubscriptions")
        .withIndex("by_user_surface", (q: any) =>
          q
            .eq("organizationId", ORG)
            .eq("workosUserId", "collab_admin")
            .eq("surface", "proposal"),
        )
        .collect(),
      views: await ctx.db
        .query("calendarSavedViews")
        .withIndex("by_user_surface", (q: any) =>
          q
            .eq("organizationId", ORG)
            .eq("workosUserId", "collab_admin")
            .eq("surface", "proposal"),
        )
        .collect(),
    }));
    expect(state.views).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ viewKey: "assistant-proposal-agenda" }),
      ]),
    );
    expect(state.subscriptions).toEqual(
      expect.arrayContaining([expect.objectContaining({ provider: "ics" })]),
    );
  });

  test("keeps trusted-file upload actions in the catalog but blocks prompt-only commits", async () => {
    const { seed, t } = await seeded(["admin"], "file_admin");
    const proposalId = await createDraftProposal(t, seed);
    const planId = await t.mutation((api as any).assistant.createActionPlan, {
      actions: [
        {
          actionKey: "add_proposal_document",
          clientRequestId: "add_doc",
          input: {
            documentType: "permit",
            fileName: "permit.pdf",
            mimeType: "application/pdf",
            proposalId,
            sizeBytes: 10,
          },
        },
      ],
      routeContext: { proposalId },
      workosOrganizationId: ORG,
    });
    const plan = await t.query((api as any).assistant.getActionPlan, {
      planId,
      workosOrganizationId: ORG,
    });
    expect(plan.validationResults[0].errors.join(" ")).toMatch(/trusted file/i);

    const outcome = await t.mutation((api as any).assistant.commitActionPlan, {
      acceptedClientRequestIds: ["add_doc"],
      editedInputs: {},
      planId,
      rejectedClientRequestIds: [],
      workosOrganizationId: ORG,
    });
    expect(outcome).toMatchObject({
      failedClientRequestId: "add_doc",
      ok: false,
    });
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

describe("DrawFlow assistant deterministic planner fallbacks", () => {
  test("drafts material fill-in forms from supplied quantity, unit, price, supplier intent, and milestone", async () => {
    const { t } = await seeded(["admin"], "planner_material_admin");

    const response = await planWithFallback(t, {
      assistantContext: {
        route: { activeBuildId: "build_123", pathname: "/backoffice/builds/build_123" },
        target: {
          buildId: "build_123",
          kind: "activeBuild",
          milestones: [
            { key: "foundation", name: "Foundation" },
            { key: "exterior", name: "Exterior finish" },
          ],
        },
      },
      prompt:
        "Help me add the stucco materials for the exterior finish milestone on this build. I need 60 bags of stucco mix at $18 per bag from my supplier.",
    });

    expect(response).toMatchObject({
      intent: "content_form",
      uiParts: [
        {
          defaults: {
            costCents: 1800,
            itemType: "material",
            milestoneKey: "exterior",
            quantity: 60,
            supplier: "Unspecified supplier",
            title: "Stucco mix",
            unit: "bags",
          },
          formKind: "costItem",
          type: "structuredForm",
        },
      ],
    });
    expect(response.uiParts[0].defaults.description).toMatch(/60 bags stucco mix/i);
  });

  test("renders internal contractor recommendation tables with actionable assignment rows", async () => {
    const { t } = await seeded(["admin"], "planner_contractor_admin");

    const response = await planWithFallback(t, {
      assistantContext: {
        contractors: [
          {
            city: "Toronto",
            contractorId: "contractor_oscar",
            defaultPayRateCents: 9500,
            defaultPayRateUnit: "hour",
            name: "Oscar Masonry",
            onboardingStatus: "account_linked",
            serviceAreaPrimaryCity: "Toronto",
            status: "active",
            trades: ["Concrete", "Foundation"],
          },
        ],
        route: { activeBuildId: "build_123", pathname: "/backoffice/builds/build_123" },
        viewer: { workspace: "backoffice" },
      },
      prompt:
        "Which contractors in my org can handle exterior stucco or envelope work on this build, and who looks best to assign?",
    });

    expect(response).toMatchObject({
      intent: "contractor_lookup",
      navigation: null,
      uiParts: [
        {
          columns: [
            "Candidate",
            "Confidence",
            "Trade match",
            "Location",
            "Availability",
            "Next step",
          ],
          type: "reviewTable",
        },
      ],
    });
    expect(response.uiParts[0].rows[0]).toMatchObject({
      actions: [
        {
          label: "Review assignment",
          to: "/backoffice/builds/build_123",
        },
      ],
      values: expect.arrayContaining(["Oscar Masonry", "Adjacent"]),
    });
  });

  test("keeps backoffice briefings on the current route while rendering clickable briefing rows", async () => {
    const { t } = await seeded(["admin"], "planner_briefing_admin");

    const response = await planWithFallback(t, {
      assistantContext: {
        operationalBriefing: {
          sections: [
            {
              id: "reviews",
              items: [
                {
                  href: "/backoffice/site-visits",
                  id: "site-visit:1",
                  kind: "siteVisit",
                  priority: "high",
                  title: "Outstanding site visit",
                },
              ],
              title: "Review queue",
            },
          ],
          summary: { total: 1 },
        },
      },
      prompt:
        "What are my tasks for today? Give me a backoffice briefing with what needs attention first.",
    });

    expect(response).toMatchObject({
      intent: "briefing",
      navigation: null,
      uiParts: [
        {
          sections: [
            {
              items: [
                expect.objectContaining({
                  href: "/backoffice/site-visits",
                }),
              ],
            },
          ],
          type: "briefing",
        },
      ],
    });
  });

  test("plans draw queue navigation with post-navigation summary table", async () => {
    const { t } = await seeded(["admin"], "planner_draw_queue_admin");

    const response = await planWithFallback(t, {
      assistantContext: {
        queues: {
          drawQueue: {
            rows: [
              {
                actionLabel: "Open draw",
                amountCents: 8000000,
                buildName: "Garden Suite",
                drawKey: "draw-1",
                href: "/backoffice/builds/build_123",
                id: "draw_123",
                label: "Exterior reimbursement",
                status: "planned",
              },
            ],
            summary: { approved: 0, planned: 8, requested: 0, released: 0, total: 8 },
          },
        },
      },
      prompt: "Take me to the draw queue and show me what draw requests need review.",
    });

    expect(response.navigation).toMatchObject({ to: "/backoffice/draws" });
    expect(response.text).toMatch(/0 requested/i);
    expect(response.text).toMatch(/8 planned/i);
    expect(response.uiParts[0]).toMatchObject({
      title: "Draw queue next actions",
      type: "reviewTable",
    });
    expect(response.uiParts[0].rows[0].actions[0]).toMatchObject({
      label: "Open draw",
      to: "/backoffice/builds/build_123",
    });
  });

  test("plans site visit queue navigation with ranked action rows", async () => {
    const { t } = await seeded(["admin"], "planner_site_queue_admin");

    const response = await planWithFallback(t, {
      assistantContext: {
        queues: {
          siteVisitQueue: {
            rows: [
              {
                actionLabel: "Reschedule visit",
                buildName: "Garden Suite",
                expired: true,
                geofenceFlagged: true,
                href: "/backoffice/builds/build_123",
                id: "visit_123",
                milestoneKey: "exterior",
                status: "expired",
              },
            ],
            summary: {
              complete: 0,
              expired: 1,
              geofenceFlagged: 1,
              requested: 0,
              total: 1,
            },
          },
        },
      },
      prompt:
        "Open the site visits that need action and tell me which one I should handle first.",
    });

    expect(response.navigation).toMatchObject({ to: "/backoffice/site-visits" });
    expect(response.text).toMatch(/1 expired/i);
    expect(response.uiParts[0].rows[0].values).toEqual(
      expect.arrayContaining(["Garden Suite", "exterior", "expired"])
    );
  });

  test("plans submitted proposal review navigation with checklist context", async () => {
    const { t } = await seeded(["admin"], "planner_proposal_queue_admin");

    const response = await planWithFallback(t, {
      assistantContext: {
        queues: {
          proposalReviewQueue: {
            rows: [
              {
                actionLabel: "Open review checklist",
                buildName: "Garden Suite",
                href: "/backoffice/proposals/proposal_123",
                id: "proposal_123",
                location: "Toronto",
                proposedBudget: 120000000,
              },
            ],
            summary: { submitted: 1, total: 1 },
          },
        },
      },
      prompt:
        "Open the submitted proposal that needs review first and tell me why it is the right one to handle now.",
    });

    expect(response.navigation).toMatchObject({
      to: "/backoffice/proposals/proposal_123",
    });
    expect(response.text).toMatch(/waiting longest/i);
    expect(response.text).toMatch(/review checklist/i);
    expect(response.uiParts[0].rows[0].actions[0]).toMatchObject({
      label: "Open review checklist",
    });
  });

  test("plans highest-risk build navigation with ranked action card data", async () => {
    const { t } = await seeded(["admin"], "planner_risk_queue_admin");

    const response = await planWithFallback(t, {
      assistantContext: {
        queues: {
          riskBuildQueue: {
            rows: [
              {
                actionLabel: "Open build review",
                buildName: "Garden Suite",
                claimedMilestones: 1,
                expiredVisits: 1,
                href: "/backoffice/builds/build_123",
                id: "build_123",
                overdueMilestones: 2,
                requestedDraws: 1,
                score: 12,
              },
            ],
            summary: { highRisk: 1, total: 1 },
          },
        },
      },
      prompt:
        "Which live build is most behind schedule or highest risk right now? Open it and tell me what action I should take first.",
    });

    expect(response.navigation).toMatchObject({
      to: "/backoffice/builds/build_123",
    });
    expect(response.text).toMatch(/Highest-risk build: Garden Suite/i);
    expect(response.text).toMatch(/first pending milestone completion claim/i);
    expect(response.uiParts[0].rows[0]).toMatchObject({
      actions: [
        {
          label: "Open build review",
          reason: "Review the first pending milestone completion claim",
          to: "/backoffice/builds/build_123",
        },
      ],
    });
    expect(response.uiParts[0].rows[0].values).toEqual(
      expect.arrayContaining([
        "Review the first pending milestone completion claim",
      ])
    );
  });
});
