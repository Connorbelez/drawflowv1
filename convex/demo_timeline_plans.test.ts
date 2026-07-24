import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";

import { api, internal } from "./_generated/api";
import {
  createProposalSlugCandidate,
  isProposalSlug,
  normalizeSetupPayload,
} from "./demo_timeline_plans";
import { MOCK_BUILDER_PERSONA, MOCK_STAFF_PERSONA } from "./demo_personas";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

describe("durable timeline plan helpers", () => {
  test("normalizes setup milestones into ordered child rows and derived draws", () => {
    const normalized = normalizeSetupPayload({
      milestones: [
        {
          budgetCents: 250_000,
          durationDays: 12,
          included: true,
          key: "framing",
          name: "Framing",
          submilestones: [
            {
              description: "Field completion target",
              name: "Wall framing",
            },
          ],
          x: 38,
        },
        {
          budgetCents: 125_000,
          durationDays: 8,
          included: true,
          key: "foundation",
          name: "Foundation",
          submilestones: [{ key: "forms", name: "Forms", order: 3 }],
          x: 12,
        },
      ],
    });

    expect(normalized.milestones.map((row) => row.key)).toEqual([
      "foundation",
      "framing",
    ]);
    expect(normalized.milestones[0].dayStart).toBe(12);
    expect(normalized.milestones[0].dayEnd).toBe(20);
    expect(normalized.milestones[0].drawAvailabilityCents).toBe(100_000);
    expect(normalized.milestones[1].submilestoneSnapshot[0]).toMatchObject({
      description: "Field completion target",
      key: "framing-sub-01",
      name: "Wall framing",
      order: 1,
    });
    expect(normalized.draws).toHaveLength(2);
    expect(normalized.draws[0]).toMatchObject({
      amountCents: 100_000,
      requestStatus: "draft",
    });
    expect(normalized.draws[0].itemMilestoneKey).toBeUndefined();
  });

  test("rejects empty generated plans", () => {
    expect(() =>
      normalizeSetupPayload({
        milestones: [
          {
            budgetCents: 1,
            durationDays: 1,
            included: false,
            key: "excluded",
            name: "Excluded",
            x: 1,
          },
        ],
      }),
    ).toThrow("At least one included milestone is required.");
  });

  test("clamps auto-generated draws to cumulative available capacity", () => {
    const normalized = normalizeSetupPayload({
      borrowerCoPayBps: 2_000,
      milestones: [
        {
          budgetCents: 100_000,
          durationDays: 4,
          key: "foundation",
          name: "Foundation",
          x: 10,
        },
        {
          budgetCents: 100_000,
          durationDays: 4,
          key: "framing",
          name: "Framing",
          x: 14,
        },
      ],
    });

    // Both milestones end on the same day, so at that day's draw timing
    // the cumulative available capacity is shared. Each draw should be
    // clamped to its fair share.
    expect(normalized.draws).toHaveLength(2);
    expect(normalized.draws[0].amountCents).toBe(80_000);
    expect(normalized.draws[1].amountCents).toBe(80_000);
  });

  test("clamps draws to lender draw policy limit", () => {
    const normalized = normalizeSetupPayload({
      borrowerCoPayBps: 2_000,
      lenderDrawPolicyLimitCents: 120_000,
      milestones: [
        {
          budgetCents: 100_000,
          durationDays: 4,
          key: "foundation",
          name: "Foundation",
          x: 10,
        },
        {
          budgetCents: 100_000,
          durationDays: 4,
          key: "framing",
          name: "Framing",
          x: 14,
        },
      ],
    });

    // Total milestone capacity = 160_000, but lender limit = 120_000.
    // First draw gets 80_000, second draw clamped to 40_000.
    expect(normalized.draws[0].amountCents).toBe(80_000);
    expect(normalized.draws[1].amountCents).toBe(40_000);
  });

  test("leaves draws at full amount when capacity is unlocked", () => {
    const normalized = normalizeSetupPayload({
      borrowerCoPayBps: 2_000,
      milestones: [
        {
          budgetCents: 100_000,
          durationDays: 4,
          key: "foundation",
          name: "Foundation",
          x: 10,
        },
      ],
    });

    // draw.x = dayEnd + 8 = 14 + 8 = 22, milestone.dayEnd = 14
    // 14 <= 22 so capacity IS unlocked. Draw should be full amount.
    expect(normalized.draws[0].amountCents).toBe(80_000);
  });

  test("schedules auto-generated draws after review lag", () => {
    const normalized = normalizeSetupPayload({
      milestones: [
        {
          budgetCents: 100_000,
          durationDays: 4,
          key: "foundation",
          name: "Foundation",
          x: 10,
        },
      ],
    });

    // Was +7 (bug), now +8 to match DEFAULT_DRAW_REVIEW_LAG_DAYS
    expect(normalized.draws[0].x).toBe(18);
  });

  test("generates proposal short slugs in the required live-link format", () => {
    const slug = createProposalSlugCandidate(123_456);

    expect(isProposalSlug(slug)).toBe(true);
    expect(slug).toMatch(/^[a-z]+-[a-z]+-[a-z0-9]{4}$/);
  });

  test("persists project address on timeline plan and linked demo build", async () => {
    const t = convexTest(schema, modules);
    const created = await t.mutation(
      api.demo_timeline_plans.demo_createTimelinePlanFromSetup,
      {
        address: "Toronto, ON",
        buildName: "Addressed plan",
        currentDay: 0,
        milestones: [
          {
            budgetCents: 100_000,
            dayEnd: 14,
            dayStart: 0,
            durationDays: 14,
            key: "foundation",
            name: "Foundation",
            x: 0,
          },
        ],
        startingCashCents: 100_000,
        templateTitle: "Addressed plan",
        totalBudgetCents: 100_000,
      },
    );

    const workspace = await t.query(
      api.demo_timeline_plans.demo_getTimelinePlanWorkspace,
      { planId: created.timelineId },
    );
    const build = await t.run(async (ctx) => {
      const planId = ctx.db.normalizeId(
        "demo_timelinePlans",
        created.timelineId,
      );
      if (!planId) {
        throw new Error("Missing plan id.");
      }
      const plan = await ctx.db.get(planId);
      if (!plan) {
        throw new Error("Missing plan.");
      }
      return await ctx.db.get(plan.buildId);
    });

    expect(workspace.plan.address).toBe("Toronto, ON");
    expect(build?.address).toBe("Toronto, ON");
    expect(build?.subtitle).toContain("Toronto, ON");
  });

  test("persists draw mutations without regenerating milestone-owned draws", async () => {
    const t = convexTest(schema, modules);
    const created = await t.mutation(
      api.demo_timeline_plans.demo_createTimelinePlanFromSetup,
      {
        address: "Hamilton, ON",
        buildName: "Living plan",
        currentDay: 0,
        draws: [
          {
            amountCents: 100_000,
            customDate: true,
            drawKey: "draw-01",
            label: "Draw 01",
            order: 1,
            x: 16,
          },
          {
            amountCents: 125_000,
            customDate: true,
            drawKey: "draw-02",
            label: "Draw 02",
            order: 2,
            x: 39,
          },
        ],
        milestones: [
          {
            budgetCents: 100_000,
            dayEnd: 14,
            dayStart: 0,
            durationDays: 14,
            key: "foundation",
            name: "Foundation",
            x: 0,
          },
          {
            budgetCents: 125_000,
            dayEnd: 37,
            dayStart: 19,
            durationDays: 18,
            key: "framing",
            name: "Framing",
            x: 19,
          },
        ],
        startingCashCents: 100_000,
        templateTitle: "Living plan",
        totalBudgetCents: 225_000,
      },
    );

    await t.mutation(api.demo_timeline_plans.demo_updateTimelineDraw, {
      amountCents: 90_000,
      customDate: true,
      drawKey: "draw-01",
      planId: created.timelineId,
      x: 17,
    });
    await t.mutation(api.demo_timeline_plans.demo_deleteTimelineDraw, {
      drawKey: "draw-02",
      planId: created.timelineId,
    });

    const workspace = await t.query(
      api.demo_timeline_plans.demo_getTimelinePlanWorkspace,
      { planId: created.timelineId },
    );

    expect(workspace.draws).toHaveLength(1);
    expect(workspace.draws[0]).toMatchObject({
      amountCents: 90_000,
      drawKey: "draw-01",
      x: 17,
    });
    expect(workspace.draws[0].itemMilestoneKey).toBeUndefined();
    expect(workspace.plan).toMatchObject({
      borrowerCoPayBps: 2_000,
      borrowerCoPayCents: 45_000,
    });
    expect(workspace.milestones[0]).toMatchObject({
      drawAvailabilityCents: 80_000,
    });
  });

  test("persists draw request reviews and blocks deleting approved draws", async () => {
    const t = convexTest(schema, modules);
    const created = await t.mutation(
      api.demo_timeline_plans.demo_createTimelinePlanFromSetup,
      {
        address: "Hamilton, ON",
        buildName: "Approved draw plan",
        currentDay: 0,
        draws: [
          {
            amountCents: 100_000,
            customDate: true,
            drawKey: "draw-01",
            label: "Draw 01",
            order: 1,
            x: 16,
          },
        ],
        milestones: [
          {
            budgetCents: 100_000,
            dayEnd: 14,
            dayStart: 0,
            durationDays: 14,
            key: "foundation",
            name: "Foundation",
            x: 0,
          },
        ],
        startingCashCents: 100_000,
        templateTitle: "Approved draw plan",
        totalBudgetCents: 100_000,
      },
    );

    await t.mutation(api.demo_timeline_plans.demo_submitTimelineDrawRequest, {
      amountCents: 85_000,
      drawKey: "draw-01",
      note: "Foundation reimbursement request.",
      planId: created.timelineId,
    });
    await t.mutation(api.demo_timeline_plans.demo_reviewTimelineDrawRequest, {
      drawKey: "draw-01",
      note: "Admin approved.",
      planId: created.timelineId,
      status: "approved",
    });

    const workspace = await t.query(
      api.demo_timeline_plans.demo_getTimelinePlanWorkspace,
      { planId: created.timelineId },
    );

    expect(workspace.draws[0]).toMatchObject({
      amountCents: 85_000,
      drawKey: "draw-01",
      requestNote: "Foundation reimbursement request.",
      requestReviewNote: "Admin approved.",
      requestStatus: "approved",
    });
    expect(workspace.draws[0].requestedAt).toEqual(expect.any(String));
    expect(workspace.draws[0].reviewedAt).toEqual(expect.any(String));

    await expect(
      t.mutation(api.demo_timeline_plans.demo_deleteTimelineDraw, {
        drawKey: "draw-01",
        planId: created.timelineId,
      }),
    ).rejects.toThrow("Approved reimbursement draws cannot be deleted.");
  });

  test("relabels remaining default draw labels after deletion", async () => {
    const t = convexTest(schema, modules);
    const created = await t.mutation(
      api.demo_timeline_plans.demo_createTimelinePlanFromSetup,
      {
        address: "Hamilton, ON",
        buildName: "Relabeled draw plan",
        currentDay: 0,
        draws: [
          {
            amountCents: 80_000,
            customDate: true,
            drawKey: "draw-01",
            label: "Draw 01",
            order: 1,
            x: 16,
          },
          {
            amountCents: 90_000,
            customDate: true,
            drawKey: "draw-02",
            label: "Draw 02",
            order: 2,
            x: 39,
          },
          {
            amountCents: 100_000,
            customDate: true,
            drawKey: "draw-03",
            label: "Draw 03",
            order: 3,
            x: 62,
          },
        ],
        milestones: [
          {
            budgetCents: 80_000,
            dayEnd: 14,
            dayStart: 0,
            durationDays: 14,
            key: "foundation",
            name: "Foundation",
            x: 0,
          },
          {
            budgetCents: 90_000,
            dayEnd: 37,
            dayStart: 19,
            durationDays: 18,
            key: "framing",
            name: "Framing",
            x: 19,
          },
          {
            budgetCents: 100_000,
            dayEnd: 60,
            dayStart: 42,
            durationDays: 18,
            key: "rough-in",
            name: "Rough-in",
            x: 42,
          },
        ],
        startingCashCents: 80_000,
        templateTitle: "Relabeled draw plan",
        totalBudgetCents: 270_000,
      },
    );

    await t.mutation(api.demo_timeline_plans.demo_deleteTimelineDraw, {
      drawKey: "draw-01",
      planId: created.timelineId,
    });

    const workspace = await t.query(
      api.demo_timeline_plans.demo_getTimelinePlanWorkspace,
      { planId: created.timelineId },
    );
    const persistedDraws = workspace.draws as Array<{
      drawKey: string;
      label: string;
      order: number;
    }>;

    expect(persistedDraws.map((draw) => draw.drawKey)).toEqual([
      "draw-02",
      "draw-03",
    ]);
    expect(persistedDraws.map((draw) => draw.label)).toEqual([
      "Draw 01",
      "Draw 02",
    ]);
    expect(persistedDraws.map((draw) => draw.order)).toEqual([1, 2]);
  });

  test("living timeline mutations reject archived plans", async () => {
    const t = convexTest(schema, modules);
    const created = await t.mutation(
      api.demo_timeline_plans.demo_createTimelinePlanFromSetup,
      {
        address: "Hamilton, ON",
        milestones: [
          {
            budgetCents: 100_000,
            durationDays: 14,
            key: "foundation",
            name: "Foundation",
            x: 0,
          },
        ],
        startingCashCents: 100_000,
        templateTitle: "Archived plan",
        totalBudgetCents: 100_000,
      },
    );
    await t.run(async (ctx) => {
      const planId = ctx.db.normalizeId(
        "demo_timelinePlans",
        created.timelineId,
      );
      if (!planId) {
        throw new Error("Missing plan id.");
      }
      await ctx.db.patch(planId, { status: "archived" });
    });

    await expect(
      t.mutation(api.demo_timeline_plans.demo_createTimelineDraw, {
        amountCents: 10_000,
        drawKey: "draw-new",
        label: "Draw",
        planId: created.timelineId,
        x: 20,
      }),
    ).rejects.toThrow("Plan is not editable in status: archived");
  });

  test("submitting a draft freezes a normalized write-once snapshot", async () => {
    const t = convexTest(schema, modules);
    const created = await createBasicTimelinePlan(t);

    const submitted = await t.mutation(
      api.demo_timeline_plans.demo_submitTimelinePlan,
      { planId: created.timelineId },
    );

    const snapshotState = await t.run(async (ctx) => {
      const planId = ctx.db.normalizeId(
        "demo_timelinePlans",
        created.timelineId,
      );
      if (!planId) throw new Error("Missing plan id.");
      const plan = await ctx.db.get(planId);
      if (!plan?.submittedSnapshotId) throw new Error("Missing snapshot id.");
      const snapshot = await ctx.db.get(plan.submittedSnapshotId);
      const sourceMilestones = await ctx.db
        .query("demo_timelineMilestones")
        .withIndex("by_plan", (q) => q.eq("planId", planId))
        .collect();
      const frozenMilestones = await ctx.db
        .query("demo_timelinePlanSnapshotMilestones")
        .withIndex("by_snapshot", (q) =>
          q.eq("snapshotId", plan.submittedSnapshotId!),
        )
        .collect();
      const sourceDraws = await ctx.db
        .query("demo_timelineDraws")
        .withIndex("by_plan", (q) => q.eq("planId", planId))
        .collect();
      const frozenDraws = await ctx.db
        .query("demo_timelinePlanSnapshotDraws")
        .withIndex("by_snapshot", (q) =>
          q.eq("snapshotId", plan.submittedSnapshotId!),
        )
        .collect();
      const frozenCapitals = await ctx.db
        .query("demo_timelinePlanSnapshotCapitalEvents")
        .withIndex("by_snapshot", (q) =>
          q.eq("snapshotId", plan.submittedSnapshotId!),
        )
        .collect();
      return {
        frozenCapitals,
        frozenDraws,
        frozenMilestones,
        plan,
        snapshot,
        sourceDraws,
        sourceMilestones,
      };
    });

    expect(submitted.snapshotId).toBe(snapshotState.snapshot?._id);
    expect(snapshotState.plan).toMatchObject({
      status: "submitted",
      submittedByPersona: MOCK_BUILDER_PERSONA,
    });
    expect(snapshotState.snapshot).toMatchObject({
      planId: snapshotState.plan?._id,
      submittedByPersona: MOCK_BUILDER_PERSONA,
      totalBudgetCents: 325_000,
    });
    expect(snapshotState.frozenMilestones).toHaveLength(
      snapshotState.sourceMilestones.length,
    );
    expect(snapshotState.frozenDraws).toHaveLength(
      snapshotState.sourceDraws.length,
    );
    expect(snapshotState.frozenCapitals).toHaveLength(1);
    expect(snapshotState.frozenMilestones[0]).toMatchObject({
      budgetCents: snapshotState.sourceMilestones[0].budgetCents,
      name: snapshotState.sourceMilestones[0].name,
      sourceTimelineMilestoneId: snapshotState.sourceMilestones[0]._id,
    });
    expect(snapshotState.frozenDraws[0]).toMatchObject({
      amountCents: snapshotState.sourceDraws[0].amountCents,
      sourceTimelineDrawId: snapshotState.sourceDraws[0]._id,
    });
  });

  test("submit rejects plans with no included milestones", async () => {
    const t = convexTest(schema, modules);
    const created = await createBasicTimelinePlan(t);
    await t.run(async (ctx) => {
      const planId = ctx.db.normalizeId(
        "demo_timelinePlans",
        created.timelineId,
      );
      if (!planId) throw new Error("Missing plan id.");
      const milestones = await ctx.db
        .query("demo_timelineMilestones")
        .withIndex("by_plan", (q) => q.eq("planId", planId))
        .collect();
      for (const milestone of milestones) {
        await ctx.db.patch(milestone._id, { included: false });
      }
    });

    await expect(
      t.mutation(api.demo_timeline_plans.demo_submitTimelinePlan, {
        planId: created.timelineId,
      }),
    ).rejects.toThrow("Plan has no included milestones");
  });

  test("builder and admin mutations enforce lifecycle state guards", async () => {
    const t = convexTest(schema, modules);
    const created = await createBasicTimelinePlan(t);

    await expect(
      t.mutation(api.demo_timeline_plans.demo_adminUpdateTimelinePlan, {
        planId: created.timelineId,
        totalBudgetCents: 400_000,
      }),
    ).rejects.toThrow("Plan is not in submitted status");

    await t.mutation(api.demo_timeline_plans.demo_submitTimelinePlan, {
      planId: created.timelineId,
    });

    await expect(
      t.mutation(api.demo_timeline_plans.demo_updateTimelinePlanState, {
        planId: created.timelineId,
        progressValue: 10,
      }),
    ).rejects.toThrow("Plan state is not editable in status: submitted");

    await t.mutation(api.demo_timeline_plans.demo_adminUpdateTimelineDraw, {
      amountCents: 111_000,
      drawKey: "draw-01",
      planId: created.timelineId,
    });
    const workspace = await t.query(
      api.demo_timeline_plans.demo_getTimelinePlanWorkspace,
      { planId: created.timelineId },
    );
    expect(workspace.draws[0].amountCents).toBe(111_000);
  });

  test("backoffice proposal query includes draft and submitted timeline plans", async () => {
    const t = convexTest(schema, modules);
    const draft = await createBasicTimelinePlan(t, { address: "Draft" });
    const submitted = await createBasicTimelinePlan(t, { address: "Submitted" });
    await t.mutation(api.demo_timeline_plans.demo_submitTimelinePlan, {
      planId: submitted.timelineId,
    });

    const rows = await t.query(
      api.demo_timeline_plans.demo_getSubmittedProposalsForBackoffice,
      {},
    );
    const draftRow = rows.find((row: any) => row.planId === draft.timelineId);
    const submittedRow = rows.find(
      (row: any) => row.planId === submitted.timelineId,
    );

    expect(draftRow).toMatchObject({
      href: `/demo/timeline/${draft.timelineId}`,
      status: "draft",
      statusLabel: "Draft",
    });
    expect(submittedRow).toMatchObject({
      builder: MOCK_BUILDER_PERSONA,
      drawCount: 2,
      href: `/backoffice/proposals/${submitted.timelineId}`,
      milestoneCount: 2,
      status: "submitted",
      statusLabel: "Submitted",
    });
  });

  test("approve guards startDate, promotes idempotently, and activates build", async () => {
    const t = convexTest(schema, modules);
    const created = await createBasicTimelinePlan(t);
    await t.mutation(api.demo_timeline_plans.demo_submitTimelinePlan, {
      planId: created.timelineId,
    });
    const pastStartDate = Date.UTC(2020, 0, 1);
    await expect(
      t.mutation(api.demo_timeline_plans.demo_approveTimelinePlan, {
        planId: created.timelineId,
        startDate: pastStartDate,
      }),
    ).rejects.toThrow("startDate must be ≥ today (UTC)");

    const startDate = Date.UTC(2099, 0, 10);
    const approved = await t.mutation(
      api.demo_timeline_plans.demo_approveTimelinePlan,
      {
        adminNote: "Approved with adjusted draw timing.",
        planId: created.timelineId,
        startDate,
      },
    );
    const approvedAgain = await t.mutation(
      api.demo_timeline_plans.demo_approveTimelinePlan,
      {
        adminNote: "Approved with adjusted draw timing.",
        planId: created.timelineId,
        startDate,
      },
    );

    const promoted = await t.run(async (ctx) => {
      const planId = ctx.db.normalizeId(
        "demo_timelinePlans",
        created.timelineId,
      );
      if (!planId) throw new Error("Missing plan id.");
      const plan = await ctx.db.get(planId);
      if (!plan) throw new Error("Missing plan.");
      const build = await ctx.db.get(plan.buildId);
      const milestones = await ctx.db
        .query("demo_milestones")
        .withIndex("by_build_order", (q) => q.eq("buildId", plan.buildId))
        .collect();
      const drawGroups = await ctx.db
        .query("demo_drawGroups")
        .withIndex("by_build_order", (q) => q.eq("buildId", plan.buildId))
        .collect();
      const capitalEvents = await ctx.db
        .query("demo_capitalEvents")
        .withIndex("by_build_order", (q) => q.eq("buildId", plan.buildId))
        .collect();
      return { build, capitalEvents, drawGroups, milestones, plan };
    });

    expect(approvedAgain).toEqual(approved);
    expect(promoted.plan).toMatchObject({
      adminNote: "Approved with adjusted draw timing.",
      approvedByPersona: MOCK_STAFF_PERSONA,
      startDate,
      status: "approved",
    });
    expect(promoted.build).toMatchObject({
      projectStartDate: "2099-01-10",
      status: "active",
    });
    expect(promoted.milestones).toHaveLength(2);
    expect(promoted.drawGroups).toHaveLength(2);
    expect(promoted.capitalEvents).toHaveLength(1);
    expect(promoted.milestones[0]).toMatchObject({
      plannedStartDate: "2099-01-10",
      sourceTimelineMilestoneId: expect.any(String),
    });
    expect(promoted.drawGroups[0].sourceTimelineDrawId).toEqual(
      expect.any(String),
    );
    expect(promoted.capitalEvents[0].sourceTimelineCapitalEventId).toEqual(
      expect.any(String),
    );

    await t.mutation(api.demo_timeline_plans.demo_updateTimelinePlanState, {
      currentDay: 25,
      planId: created.timelineId,
      progressValue: 25,
    });

    await t.mutation(api.demo_timeline_plans.demo_createTimelineDraw, {
      amountCents: 10_000,
      drawKey: "approved-draw-new",
      label: "Draw",
      planId: created.timelineId,
      x: 25,
    });

    const livePlan = await t.run(async (ctx) => {
      const planId = ctx.db.normalizeId(
        "demo_timelinePlans",
        created.timelineId,
      );
      if (!planId) throw new Error("Missing plan id.");
      return await ctx.db.get(planId);
    });
    expect(livePlan).toMatchObject({
      currentDay: 25,
      progressValue: 25,
      status: "approved",
    });
  });

  test("daily cron activates milestones, marks overdue work behind, and auto-requests due draws", async () => {
    const t = convexTest(schema, modules);
    const created = await createCronTimelinePlan(t);
    const startDate = Date.UTC(2099, 0, 10);
    await t.mutation(api.demo_timeline_plans.demo_submitTimelinePlan, {
      planId: created.timelineId,
    });
    await t.mutation(api.demo_timeline_plans.demo_approveTimelinePlan, {
      planId: created.timelineId,
      startDate,
    });

    const summary = await t.mutation(
      internal.demo_timeline_plans.demo_rollForwardApprovedTimelines,
      { nowMs: startDate + 11 * 86_400_000 + 3_600_000 },
    );

    const rolledForward = await t.run(async (ctx) => {
      const planId = ctx.db.normalizeId(
        "demo_timelinePlans",
        created.timelineId,
      );
      if (!planId) throw new Error("Missing plan id.");
      const plan = await ctx.db.get(planId);
      if (!plan) throw new Error("Missing plan.");
      const [build, milestones, timelineMilestones, draws, drawGroups] =
        await Promise.all([
          ctx.db.get(plan.buildId),
          ctx.db
            .query("demo_milestones")
            .withIndex("by_build_order", (q) => q.eq("buildId", plan.buildId))
            .collect(),
          ctx.db
            .query("demo_timelineMilestones")
            .withIndex("by_plan_and_order", (q) => q.eq("planId", planId))
            .collect(),
          ctx.db
            .query("demo_timelineDraws")
            .withIndex("by_plan", (q) => q.eq("planId", planId))
            .collect(),
          ctx.db
            .query("demo_drawGroups")
            .withIndex("by_build_order", (q) => q.eq("buildId", plan.buildId))
            .collect(),
        ]);
      return { build, drawGroups, draws, milestones, plan, timelineMilestones };
    });

    expect(summary).toMatchObject({
      autoRequestedDraws: 1,
      buildsMarkedBehind: 1,
      buildsUpdated: 1,
      drawGroupsUpdated: 1,
      plansUpdated: 1,
    });
    expect(rolledForward.plan).toMatchObject({
      currentDay: 11,
      progressValue: 11,
      routeState: expect.objectContaining({ activeMilestoneKey: "framing" }),
    });
    expect(rolledForward.build).toMatchObject({
      status: "behind_schedule",
      todayDate: "2099-01-21",
    });
    expect(rolledForward.timelineMilestones[0]).toMatchObject({
      milestoneKey: "foundation",
      status: "review",
      tone: "warning",
    });
    expect(rolledForward.timelineMilestones[1]).toMatchObject({
      milestoneKey: "framing",
      status: "ready",
      tone: "active",
    });
    expect(rolledForward.milestones[0]).toMatchObject({
      key: "foundation",
      status: "in_progress_behind_schedule",
    });
    expect(rolledForward.milestones[1]).toMatchObject({
      key: "framing",
      status: "in_progress_on_schedule",
    });
    expect(rolledForward.draws[0]).toMatchObject({
      drawKey: "draw-01",
      requestStatus: "requested",
      requestedAt: expect.any(String),
    });
    expect(rolledForward.drawGroups[0]).toMatchObject({
      key: "draw-01",
      requestedValueCents: 100_000,
      status: "requested",
    });

    const rerun = await t.mutation(
      internal.demo_timeline_plans.demo_rollForwardApprovedTimelines,
      { nowMs: startDate + 11 * 86_400_000 + 7_200_000 },
    );
    expect(rerun).toMatchObject({
      autoRequestedDraws: 0,
      buildsUpdated: 0,
      drawGroupsUpdated: 0,
      milestonesUpdated: 0,
      plansUpdated: 0,
    });
  });

  test("daily cron skips inactive timelines and approved timelines without a start date", async () => {
    const t = convexTest(schema, modules);
    const draft = await createCronTimelinePlan(t, "Draft cron skip");
    const submitted = await createCronTimelinePlan(t, "Submitted cron skip");
    const approvedWithoutStart = await createCronTimelinePlan(
      t,
      "Approved without start",
    );
    await t.mutation(api.demo_timeline_plans.demo_submitTimelinePlan, {
      planId: submitted.timelineId,
    });
    await t.run(async (ctx) => {
      const planId = ctx.db.normalizeId(
        "demo_timelinePlans",
        approvedWithoutStart.timelineId,
      );
      if (!planId) throw new Error("Missing plan id.");
      await ctx.db.patch(planId, { status: "approved" });
    });

    const summary = await t.mutation(
      internal.demo_timeline_plans.demo_rollForwardApprovedTimelines,
      { nowMs: Date.UTC(2099, 0, 21) },
    );
    const rows = await t.run(async (ctx) => {
      const draftId = ctx.db.normalizeId("demo_timelinePlans", draft.timelineId);
      const submittedId = ctx.db.normalizeId(
        "demo_timelinePlans",
        submitted.timelineId,
      );
      const approvedId = ctx.db.normalizeId(
        "demo_timelinePlans",
        approvedWithoutStart.timelineId,
      );
      if (!(draftId && submittedId && approvedId)) {
        throw new Error("Missing plan id.");
      }
      return {
        approved: await ctx.db.get(approvedId),
        draft: await ctx.db.get(draftId),
        submitted: await ctx.db.get(submittedId),
      };
    });

    expect(summary).toMatchObject({
      autoRequestedDraws: 0,
      plansSkipped: 1,
      plansUpdated: 0,
      processedPlans: 0,
    });
    expect(rows.draft).toMatchObject({ currentDay: 0, status: "draft" });
    expect(rows.submitted).toMatchObject({
      currentDay: 0,
      status: "submitted",
    });
    expect(rows.approved).toMatchObject({
      currentDay: 0,
      status: "approved",
    });
  });

  test("manual backoffice sync uses the same roll-forward workflow", async () => {
    const t = convexTest(schema, modules);
    const created = await createCronTimelinePlan(t, "Manual sync build");
    await t.mutation(api.demo_timeline_plans.demo_submitTimelinePlan, {
      planId: created.timelineId,
    });
    await t.mutation(api.demo_timeline_plans.demo_approveTimelinePlan, {
      planId: created.timelineId,
      startDate: Date.UTC(2099, 0, 10),
    });
    await t.run(async (ctx) => {
      const planId = ctx.db.normalizeId(
        "demo_timelinePlans",
        created.timelineId,
      );
      if (!planId) throw new Error("Missing plan id.");
      await ctx.db.patch(planId, { startDate: Date.UTC(2026, 0, 1) });
    });

    const summary = await t.mutation(
      api.demo_timeline_plans.demo_syncApprovedTimelinesNow,
      {},
    );
    const workspace = await t.query(
      api.demo_timeline_plans.demo_getTimelinePlanWorkspace,
      { planId: created.timelineId },
    );

    expect(summary.autoRequestedDraws).toBe(1);
    expect(workspace.draws[0]).toMatchObject({
      drawKey: "draw-01",
      requestStatus: "requested",
      requestedAt: expect.any(String),
    });
  });

  test("live build structural milestone changes require admin-approved modification requests", async () => {
    const t = convexTest(schema, modules);
    const created = await createApprovedTimelinePlan(t);

    await expect(
      t.mutation(api.demo_timeline_plans.demo_createTimelineMilestone, {
        milestone: {
          budgetCents: 90_000,
          dayEnd: 70,
          dayStart: 55,
          durationDays: 15,
          evidenceState: "Requested change",
          icon: "change",
          milestoneKey: "change-order",
          name: "Change order",
          order: 3,
          policyState: "Admin review required",
          status: "ready",
          submilestones: [],
          tone: "warning",
          x: 55,
        },
        planId: created.timelineId,
      }),
    ).rejects.toThrow("Structural milestone changes require admin approval.");

    await expect(
      t.mutation(api.demo_timeline_plans.demo_updateTimelineMilestone, {
        budgetCents: 210_000,
        milestoneKey: "foundation",
        planId: created.timelineId,
      }),
    ).rejects.toThrow("Milestone budget changes require admin approval.");

    const createRequest = await t.mutation(
      api.demo_timeline_plans.demo_requestTimelineModification,
      {
        planId: created.timelineId,
        reason: "Owner requested upgraded entry sequence.",
        requestedPayload: {
          milestone: {
            budgetCents: 90_000,
            dayEnd: 70,
            dayStart: 55,
            durationDays: 15,
            evidenceState: "Requested change",
            icon: "change",
            milestoneKey: "change-order",
            name: "Change order",
            order: 3,
            policyState: "Admin review required",
            status: "ready",
            submilestones: [],
            tone: "warning",
            x: 55,
          },
        },
        requestType: "createMilestone",
      },
    );
    const budgetRequest = await t.mutation(
      api.demo_timeline_plans.demo_requestTimelineModification,
      {
        milestoneKey: "foundation",
        planId: created.timelineId,
        reason: "Concrete overrun.",
        requestedPayload: { budgetCents: 210_000 },
        requestType: "updateMilestoneBudget",
      },
    );
    const deleteRequest = await t.mutation(
      api.demo_timeline_plans.demo_requestTimelineModification,
      {
        milestoneKey: "framing",
        planId: created.timelineId,
        reason: "Scope merged into rough framing.",
        requestedPayload: {},
        requestType: "deleteMilestone",
      },
    );

    let workspace = await t.query(
      api.demo_timeline_plans.demo_getTimelinePlanWorkspace,
      { planId: created.timelineId },
    );
    expect(workspace.modificationRequests).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          requestType: "createMilestone",
          status: "requested",
        }),
        expect.objectContaining({
          milestoneKey: "foundation",
          requestType: "updateMilestoneBudget",
          requestedPayload: { budgetCents: 210_000 },
          status: "requested",
        }),
        expect.objectContaining({
          milestoneKey: "framing",
          requestType: "deleteMilestone",
          status: "requested",
        }),
      ]),
    );

    await t.mutation(
      api.demo_timeline_plans.demo_reviewTimelineModificationRequest,
      {
        note: "Approved change-order milestone.",
        requestId: createRequest.requestId,
        status: "approved",
      },
    );
    await t.mutation(
      api.demo_timeline_plans.demo_reviewTimelineModificationRequest,
      {
        note: "Approved budget change.",
        requestId: budgetRequest.requestId,
        status: "approved",
      },
    );
    await t.mutation(
      api.demo_timeline_plans.demo_reviewTimelineModificationRequest,
      {
        note: "Keep framing milestone for audit.",
        requestId: deleteRequest.requestId,
        status: "rejected",
      },
    );

    workspace = await t.query(
      api.demo_timeline_plans.demo_getTimelinePlanWorkspace,
      { planId: created.timelineId },
    );
    expect(workspace.milestones.map((row: any) => row.milestoneKey)).toContain(
      "change-order",
    );
    expect(
      workspace.milestones.find((row: any) => row.milestoneKey === "foundation")
        ?.budgetCents,
    ).toBe(210_000);
    expect(workspace.milestones.map((row: any) => row.milestoneKey)).toContain(
      "framing",
    );
  });

  test("live build draw requests require admin-approved milestone completion", async () => {
    const t = convexTest(schema, modules);
    const created = await createApprovedTimelinePlan(t);

    await expect(
      t.mutation(api.demo_timeline_plans.demo_submitTimelineDrawRequest, {
        amountCents: 75_000,
        drawKey: "draw-01",
        note: "Foundation reimbursement.",
        planId: created.timelineId,
      }),
    ).rejects.toThrow("Draw request requires approved milestone completion.");

    await t.mutation(
      api.demo_timeline_plans.demo_submitTimelineMilestoneCompletion,
      {
        actualCostCents: 150_000,
        completedDay: 14,
        milestoneKey: "foundation",
        note: "Foundation complete.",
        planId: created.timelineId,
      },
    );
    await t.mutation(
      api.demo_timeline_plans.demo_reviewTimelineMilestoneCompletion,
      {
        milestoneKey: "foundation",
        note: "Evidence accepted.",
        planId: created.timelineId,
        status: "approved",
      },
    );

    await expect(
      t.mutation(api.demo_timeline_plans.demo_submitTimelineDrawRequest, {
        amountCents: 999_999,
        drawKey: "draw-01",
        note: "Over available capacity.",
        planId: created.timelineId,
      }),
    ).rejects.toThrow(/available draw limit/i);
    await t.mutation(api.demo_timeline_plans.demo_submitTimelineDrawRequest, {
      amountCents: 75_000,
      drawKey: "draw-01",
      note: "Foundation reimbursement.",
      planId: created.timelineId,
    });

    await t.mutation(api.demo_timeline_plans.demo_submitTimelineDrawRequest, {
      amountCents: 75_000,
      drawKey: "draw-01",
      note: "Foundation reimbursement.",
      planId: created.timelineId,
    });
    await expect(
      t.mutation(api.demo_timeline_plans.demo_submitTimelineDrawRequest, {
        amountCents: 76_000,
        drawKey: "draw-01",
        note: "Changed amount under the same request.",
        planId: created.timelineId,
      }),
    ).rejects.toThrow(/already requested with a different amount/i);
    const requestEvents = await t.run(async (ctx: any) =>
      await ctx.db
        .query("demo_timelineEvents")
        .withIndex("by_plan_and_entity", (q: any) =>
          q
            .eq("planId", created.timelineId)
            .eq("entityType", "timeline_draw")
            .eq("entityKey", "draw-01"),
        )
        .collect(),
    );
    expect(
      requestEvents.filter(
        (event: any) => event.eventType === "TimelineDrawRequestSubmitted",
      ),
    ).toHaveLength(1);

    const rows = await t.query(
      api.demo_timeline_plans.demo_getSubmittedProposalsForBackoffice,
      {},
    );
    const row = rows.find((candidate: any) => candidate.planId === created.timelineId);
    expect(row).toMatchObject({
      pendingDrawRequestCount: 1,
      status: "approved",
    });
    expect(row.drawRequests[0]).toMatchObject({
      amountCents: 75_000,
      drawKey: "draw-01",
      status: "requested",
    });
  });

  test("cash infusions directly increase live build cash events without admin approval", async () => {
    const t = convexTest(schema, modules);
    const created = await createApprovedTimelinePlan(t);

    await t.mutation(api.demo_timeline_plans.demo_createTimelineCashInfusion, {
      amountCents: 50_000,
      cashInfusionKey: "owner-cash-01",
      label: "Owner cash infusion",
      planId: created.timelineId,
      x: 18,
    });

    const workspace = await t.query(
      api.demo_timeline_plans.demo_getTimelinePlanWorkspace,
      { planId: created.timelineId },
    );
    expect(workspace.capitalEvents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          amountCents: 50_000,
          capitalEventKey: "owner-cash-01",
          eventKind: "cashInfusion",
          label: "Owner cash infusion",
        }),
      ]),
    );
    expect(workspace.modificationRequests).toEqual([]);
  });

  test("builder live build resolver only returns approved owner-scoped plans by build key", async () => {
    const t = convexTest(schema, modules);
    const approved = await createApprovedTimelinePlan(t);
    const draft = await createBasicTimelinePlan(t, { address: "Draft lane" });

    const approvedPlan = await t.run(async (ctx) => {
      const planId = ctx.db.normalizeId(
        "demo_timelinePlans",
        approved.timelineId,
      );
      if (!planId) throw new Error("Missing approved plan id.");
      const plan = await ctx.db.get(planId);
      const build = plan ? await ctx.db.get(plan.buildId) : null;
      return { build, plan };
    });
    const draftPlan = await t.run(async (ctx) => {
      const planId = ctx.db.normalizeId("demo_timelinePlans", draft.timelineId);
      if (!planId) throw new Error("Missing draft plan id.");
      const plan = await ctx.db.get(planId);
      const build = plan ? await ctx.db.get(plan.buildId) : null;
      return { build, plan };
    });
    if (!(approvedPlan.build && draftPlan.build)) {
      throw new Error("Expected seeded builds.");
    }

    const resolved = await t.query(
      api.demo_timeline_plans.demo_getBuilderLiveTimelineWorkspaceByBuildKey,
      {
        buildKey: approvedPlan.build.key,
        persona: MOCK_BUILDER_PERSONA,
      },
    );
    const draftResolved = await t.query(
      api.demo_timeline_plans.demo_getBuilderLiveTimelineWorkspaceByBuildKey,
      {
        buildKey: draftPlan.build.key,
        persona: MOCK_BUILDER_PERSONA,
      },
    );
    const wrongPersonaResolved = await t.query(
      api.demo_timeline_plans.demo_getBuilderLiveTimelineWorkspaceByBuildKey,
      {
        buildKey: approvedPlan.build.key,
        persona: "other_builder",
      },
    );
    const unknownResolved = await t.query(
      api.demo_timeline_plans.demo_getBuilderLiveTimelineWorkspaceByBuildKey,
      {
        buildKey: "missing-build-key",
        persona: MOCK_BUILDER_PERSONA,
      },
    );

    expect(resolved.plan).toMatchObject({
      _id: approved.timelineId,
      ownerPersona: MOCK_BUILDER_PERSONA,
      status: "approved",
    });
    expect(resolved.milestones).toHaveLength(2);
    expect(resolved.draws).toHaveLength(2);
    expect(draftResolved).toBeNull();
    expect(wrongPersonaResolved).toBeNull();
    expect(unknownResolved).toBeNull();
  });

  test("reject archives plan and removes it from submitted proposals", async () => {
    const t = convexTest(schema, modules);
    const created = await createBasicTimelinePlan(t);
    await t.mutation(api.demo_timeline_plans.demo_submitTimelinePlan, {
      planId: created.timelineId,
    });
    await t.mutation(api.demo_timeline_plans.demo_rejectTimelinePlan, {
      adminNote: "Missing permit package.",
      planId: created.timelineId,
      reason: "Permits incomplete",
    });

    const rows = await t.query(
      api.demo_timeline_plans.demo_getSubmittedProposalsForBackoffice,
      {},
    );
    const plan = await t.run(async (ctx) => {
      const planId = ctx.db.normalizeId(
        "demo_timelinePlans",
        created.timelineId,
      );
      if (!planId) throw new Error("Missing plan id.");
      return await ctx.db.get(planId);
    });

    expect(rows.map((row: any) => row.planId)).not.toContain(created.timelineId);
    expect(plan).toMatchObject({
      adminNote: "Missing permit package.",
      approvedByPersona: MOCK_STAFF_PERSONA,
      archivedReason: "Permits incomplete",
      status: "archived",
    });
  });

  test("requests timeline site visits with token links that resolve against the generated build", async () => {
    const t = convexTest(schema, modules);
    const created = await t.mutation(
      api.demo_timeline_plans.demo_createTimelinePlanFromSetup,
      {
        address: "Hamilton, ON",
        milestones: [
          {
            budgetCents: 100_000,
            dayEnd: 14,
            dayStart: 0,
            durationDays: 14,
            key: "foundation",
            name: "Foundation",
            siteVisitGuidance: {
              cameraAngles: ["Wide footing overview", "Close-up of form pins"],
              whatToVerify: ["Forms match approved footing layout"],
            },
            submilestones: [{ name: "Forms" }, { name: "Pour" }],
            x: 0,
          },
        ],
        startingCashCents: 100_000,
        templateTitle: "Tokenized timeline visit",
        totalBudgetCents: 100_000,
      },
    );

    const request = await t.mutation(
      api.demo_timeline_plans.demo_requestTimelineSiteVisit,
      {
        includedMilestoneKeys: ["foundation"],
        milestoneKey: "foundation",
        persona: "lender_admin",
        planId: created.timelineId,
        reason: "Verify foundation before release.",
      },
    );
    const buildId = request.url.split("/")[2];

    expect(request.url).toMatch(
      new RegExp(`^/newsitevisit/${buildId}/${request.token}$`),
    );
    expect(buildId).toMatch(/^demo-timeline-/);
    expect(request).toMatchObject({
      evidencePackageId: `DEMO-EP-${created.timelineId}-foundation`,
      organizationScopeKey: expect.any(String),
      workOrderId: expect.stringMatching(/^DEMO-WO-foundation-/),
    });

    const visit = await t.query(api.demo_drawflow.demo_getSiteVisitByToken, {
      buildId,
      token: request.token,
    });

    expect(visit).toMatchObject({
      available: true,
      build: { key: buildId },
    });
    expect(visit.visit).toMatchObject({
      evidencePackageId: request.evidencePackageId,
      organizationScopeKey: request.organizationScopeKey,
      workOrderId: request.workOrderId,
    });
    expect(visit.targets).toHaveLength(1);
    expect(visit.targets[0]).toMatchObject({
      milestoneKey: "foundation",
      milestoneName: "Foundation",
      submilestones: ["Forms", "Pour"],
    });
    expect(visit.targets[0].guidance).toMatchObject({
      cameraAngles: expect.stringContaining("Wide footing overview"),
      whatToVerify: expect.stringContaining("Forms match approved footing layout"),
    });
    await t.run((ctx: any) =>
      ctx.db.patch(request.visitId, { workOrderId: "DEMO-WO-tampered" }),
    );
    const tampered = await t.query(api.demo_drawflow.demo_getSiteVisitByToken, {
      buildId,
      token: request.token,
    });
    expect(tampered).toMatchObject({
      available: false,
      reason: "not_found",
      status: "invalid",
      visit: null,
    });
  });
});

async function createBasicTimelinePlan(
  t: ReturnType<typeof convexTest>,
  overrides: { address?: string } = {},
) {
  return await t.mutation(
    api.demo_timeline_plans.demo_createTimelinePlanFromSetup,
    {
      address: overrides.address ?? "1234 Linden Loop",
      buildName: "Linden Loop Build",
      capitalEvents: [
        {
          amountCents: -25_000,
          capitalEventKey: "permit-fee",
          label: "Permit fee",
          order: 1,
          x: 3,
        },
      ],
      currentDay: 0,
      draws: [
        {
          amountCents: 150_000,
          customDate: true,
          drawKey: "draw-01",
          label: "Foundation draw",
          order: 1,
          x: 16,
        },
        {
          amountCents: 175_000,
          customDate: true,
          drawKey: "draw-02",
          label: "Framing draw",
          order: 2,
          x: 42,
        },
      ],
      milestones: [
        {
          budgetCents: 150_000,
          dayEnd: 14,
          dayStart: 0,
          durationDays: 14,
          key: "foundation",
          name: "Foundation",
          x: 0,
        },
        {
          budgetCents: 175_000,
          dayEnd: 38,
          dayStart: 20,
          durationDays: 18,
          key: "framing",
          name: "Framing",
          x: 20,
        },
      ],
      startingCashCents: 100_000,
      templateTitle: "Linden Loop Build",
      totalBudgetCents: 325_000,
    },
  );
}

async function createCronTimelinePlan(
  t: ReturnType<typeof convexTest>,
  address = "1234 Cron Loop",
) {
  return await t.mutation(
    api.demo_timeline_plans.demo_createTimelinePlanFromSetup,
    {
      address,
      buildName: "Cron Loop Build",
      currentDay: 0,
      draws: [
        {
          amountCents: 100_000,
          customDate: true,
          drawKey: "draw-01",
          label: "Foundation draw",
          order: 1,
          x: 11,
        },
      ],
      milestones: [
        {
          budgetCents: 100_000,
          dayEnd: 10,
          dayStart: 0,
          durationDays: 10,
          key: "foundation",
          name: "Foundation",
          x: 0,
        },
        {
          budgetCents: 120_000,
          dayEnd: 20,
          dayStart: 11,
          durationDays: 9,
          key: "framing",
          name: "Framing",
          x: 11,
        },
      ],
      startingCashCents: 80_000,
      templateTitle: "Cron Loop Build",
      totalBudgetCents: 220_000,
    },
  );
}

async function createApprovedTimelinePlan(t: ReturnType<typeof convexTest>) {
  const created = await createBasicTimelinePlan(t);
  await t.mutation(api.demo_timeline_plans.demo_submitTimelinePlan, {
    planId: created.timelineId,
  });
  await t.mutation(api.demo_timeline_plans.demo_approveTimelinePlan, {
    planId: created.timelineId,
    startDate: Date.UTC(2099, 0, 10),
  });
  return created;
}
