import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";

import { api } from "./_generated/api";
import {
  createProposalSlugCandidate,
  isProposalSlug,
  normalizeSetupPayload,
} from "./demo_timeline_plans";
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
          submilestones: [{ name: "Wall framing" }],
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
    expect(normalized.milestones[1].submilestoneSnapshot[0]).toMatchObject({
      key: "framing-sub-01",
      name: "Wall framing",
      order: 1,
    });
    expect(normalized.draws).toHaveLength(2);
    expect(normalized.draws[0]).toMatchObject({
      amountCents: 125_000,
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

  test("generates proposal short slugs in the required live-link format", () => {
    const slug = createProposalSlugCandidate(123_456);

    expect(isProposalSlug(slug)).toBe(true);
    expect(slug).toMatch(/^[a-z]+-[a-z]+-[a-z0-9]{4}$/);
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
    ).rejects.toThrow(/Archived plans/);
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

    const visit = await t.query(api.demo_drawflow.demo_getSiteVisitByToken, {
      buildId,
      token: request.token,
    });

    expect(visit).toMatchObject({
      available: true,
      build: { key: buildId },
    });
    expect(visit.targets).toHaveLength(1);
    expect(visit.targets[0]).toMatchObject({
      milestoneKey: "foundation",
      milestoneName: "Foundation",
      submilestones: ["Forms", "Pour"],
    });
  });
});
