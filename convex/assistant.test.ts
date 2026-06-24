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

  test("creates a draft proposal from reviewed setup payload through HITL", async () => {
    const { t } = await seeded(["admin"], "setup_admin");
    const planId = await t.mutation((api as any).assistant.createActionPlan, {
      actions: [
        {
          actionKey: "create_build_proposal_from_setup",
          clientRequestId: "setup_create",
          input: {
            borrowerCoPayBps: 2_000,
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
      acceptedClientRequestIds: ["request_draw", "approve_draw", "release_draw"],
      editedInputs: {},
      planId,
      rejectedClientRequestIds: [],
      workosOrganizationId: ORG,
    });
    expect(outcome.ok).toBe(true);

    const state = await t.run(async (ctx: any) => ({
      capitalEvents: await ctx.db
        .query("capitalEvents")
        .withIndex("by_build", (q: any) => q.eq("buildId", buildId))
        .collect(),
      draw: await ctx.db.get(draw._id),
    }));
    expect(state.draw).toMatchObject({
      releaseDate: "2026-06-30",
      status: "released",
    });
    expect(state.capitalEvents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ eventType: "draw_release" }),
      ]),
    );
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
