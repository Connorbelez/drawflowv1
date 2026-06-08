import { describe, expect, test } from "vitest";
import type { TimelineItem } from "#/components/roadmap/AnimatedCurvedTimeline.tsx";
import {
  buildDemoDraws,
  buildCashflowChartData,
  buildChartProbeDays,
  buildCashShortfallPoints,
  calculateApprovedDrawRequestLimit,
  calculateDrawRequestLimit,
  buildDrawAvailabilityData,
  buildFinancialOverview,
  buildTimelineCashflowData,
  type CashflowDatum,
  densifyCashflowData,
  expandTimelineRangeForMilestones,
  getDemoApprovalStartDate,
  getTimelineAlignedTicks,
  getDrawTimelineMarkerState,
  interpolateLinearCashOnHand,
  interpolateDrawAvailability,
  normalizeTimelineShareStateForRoute,
  relabelTimelineDraws,
  resolveDemoLiveBuildHref,
  resolveSelectedDrawDate,
} from "./index.tsx";
import type {
  DemoCapitalSpike,
  DemoDraw,
  DemoMilestone,
  TimelineShareState,
} from "./-timeline-share-snapshot.ts";
import { getMilestoneDrawAvailabilityAmount } from "./-timeline-share-snapshot.ts";

describe("timeline cash shortfall logic", () => {
  test("builds lender approval start dates at UTC midnight", () => {
    expect(getDemoApprovalStartDate(Date.UTC(2026, 4, 28, 17, 30))).toBe(
      Date.UTC(2026, 4, 28),
    );
  });

  test("resolves the durable live build link for approved demo proposals", () => {
    expect(resolveDemoLiveBuildHref({ buildKey: "demo-timeline-abc" })).toBe(
      "/builder/demo/dashboard/builds/demo-timeline-abc",
    );
    expect(
      resolveDemoLiveBuildHref({
        buildKey: "demo-timeline-abc",
        liveBuildHref: "/custom/live-build",
      }),
    ).toBe("/custom/live-build");
  });

  test("defaults item-backed draw dates from milestone completion plus review lag", () => {
    const items: TimelineItem<DemoMilestone>[] = [
      {
        data: {
          amount: 100_000,
          draw: "Draw 1",
          durationDays: 10,
          evidence: "Planning",
          icon: "foundation",
          name: "Foundation",
          policy: "Planning",
          status: "ready",
          subMilestones: ["Excavation"],
        },
        id: "foundation",
        x: 20,
      },
    ];

    expect(buildDemoDraws(items, { max: 60, min: 0, unit: "days" })).toEqual([
      {
        amount: 80_000,
        id: "foundation-draw",
        itemId: "foundation",
        label: "Draw 1",
        x: 38,
      },
    ]);
  });

  test("fits range to five days after the last milestone completion", () => {
    const items: TimelineItem<DemoMilestone>[] = [
      {
        data: {
          amount: 100_000,
          draw: "Draw 1",
          durationDays: 14,
          evidence: "Planning",
          icon: "foundation",
          name: "Late change",
          policy: "Planning",
          status: "ready",
          subMilestones: ["Estimate"],
        },
        id: "late-change",
        x: 225,
      },
    ];

    expect(
      expandTimelineRangeForMilestones(items, {
        max: 230,
        min: 0,
        unit: "days",
      }),
    ).toEqual({ max: 244, min: 0, unit: "days" });
    expect(
      buildDemoDraws(items, { max: 244, min: 0, unit: "days" })[0]?.x,
    ).toBe(244);
  });

  test("selected draw date follows the linked draw or computed completion reimbursement date", () => {
    const item: TimelineItem<DemoMilestone> = {
      data: {
        amount: 100_000,
        draw: "Draw 1",
        durationDays: 10,
        evidence: "Planning",
        icon: "foundation",
        name: "Foundation",
        policy: "Planning",
        status: "ready",
        subMilestones: ["Excavation"],
      },
      id: "foundation",
      x: 20,
    };

    expect(
      resolveSelectedDrawDate(item, null, { max: 60, min: 0, unit: "days" }),
    ).toBe(35);
    expect(
      resolveSelectedDrawDate(
        item,
        {
          amount: 100_000,
          id: "foundation-draw",
          itemId: "foundation",
          label: "Draw 1",
          x: 42,
        },
        { max: 60, min: 0, unit: "days" },
      ),
    ).toBe(42);
  });

  test("share hydration preserves independent draw rows instead of regenerating milestone draws", () => {
    const items: TimelineItem<DemoMilestone>[] = [
      {
        data: {
          amount: 100_000,
          draw: "Draw 1",
          durationDays: 14,
          evidence: "Planning",
          icon: "foundation",
          name: "Late change",
          policy: "Planning",
          status: "ready",
          subMilestones: ["Estimate"],
        },
        id: "late-change",
        x: 225,
      },
    ];
    const state: TimelineShareState = {
      activeSelection: { itemId: "late-change", phase: "inProgress" },
      capitalSpikes: [],
      currentDay: 86,
      draws: [
        {
          amount: 120_000,
          id: "late-change-draw",
          itemId: "late-change",
          label: "Draw 1",
          x: 230,
        },
        {
          amount: 20_000,
          id: "manual-draw-1",
          label: "Manual draw",
          x: 231,
        },
      ],
      items,
      progressValue: 225,
      range: { max: 230, min: 0, unit: "days" },
      selectedPanelOpen: true,
      startingCash: 400_000,
      straightLine: false,
    };

    const hydrated = normalizeTimelineShareStateForRoute(state);

    expect(hydrated.range.max).toBe(244);
    expect(hydrated.draws).toEqual([
      {
        amount: 120_000,
        id: "late-change-draw",
        itemId: "late-change",
        label: "Draw 1",
        x: 230,
      },
      {
        amount: 20_000,
        id: "manual-draw-1",
        label: "Manual draw",
        x: 231,
      },
    ]);
  });

  test("does not compare post-milestone cash against a later milestone cost", () => {
    const cashflow: CashflowDatum[] = [
      cashflowPoint({
        cashOnHand: 400_000,
        day: 0,
        event: "start",
        id: "start",
        name: "Starting cash",
      }),
      cashflowPoint({
        budget: 160_000,
        cashOnHand: 240_000,
        day: 58,
        event: "milestone",
        id: "framing-milestone",
        name: "Framing & structure",
      }),
      cashflowPoint({
        cashOnHand: 400_000,
        day: 66,
        drawAmount: 160_000,
        event: "draw",
        id: "framing-draw",
        name: "Draw 2",
      }),
      cashflowPoint({
        budget: 245_000,
        cashOnHand: 155_000,
        day: 92,
        event: "milestone",
        id: "rough-in-milestone",
        name: "Rough-in mechanical",
      }),
    ];

    expect(buildCashShortfallPoints(cashflow)).toEqual([]);
  });

  test("flags the milestone that would overdraw cash after payment", () => {
    const cashflow: CashflowDatum[] = [
      cashflowPoint({
        cashOnHand: 400_000,
        day: 0,
        event: "start",
        id: "start",
        name: "Starting cash",
      }),
      cashflowPoint({
        budget: 410_000,
        cashOnHand: -10_000,
        day: 92,
        event: "milestone",
        id: "rough-in-milestone",
        name: "Rough-in mechanical",
      }),
    ];

    expect(buildCashShortfallPoints(cashflow)).toEqual([
      {
        cashBeforeMilestone: 400_000,
        cashOnHand: -10_000,
        day: 92,
        milestone: "Rough-in mechanical",
        milestoneCost: 410_000,
        shortfall: 10_000,
      },
    ]);
  });

  test("uses the configured minimum cash reserve for warnings", () => {
    const cashflow: CashflowDatum[] = [
      cashflowPoint({
        cashOnHand: 400_000,
        day: 0,
        event: "start",
        id: "start",
        name: "Starting cash",
      }),
      cashflowPoint({
        budget: 360_000,
        cashOnHand: 40_000,
        day: 45,
        event: "milestone",
        id: "foundation-milestone",
        name: "Foundation",
      }),
    ];

    expect(buildCashShortfallPoints(cashflow)).toEqual([]);
    expect(buildCashShortfallPoints(cashflow, 75_000)).toEqual([
      {
        cashBeforeMilestone: 400_000,
        cashOnHand: 40_000,
        day: 45,
        milestone: "Foundation",
        milestoneCost: 360_000,
        shortfall: 35_000,
      },
    ]);
  });

  test("cashflow separates interval milestone costs, draw reimbursements, capital spikes, and starting cash", () => {
    const items: TimelineItem<DemoMilestone>[] = [
      {
        data: {
          amount: 125_000,
          draw: "Draw 1",
          drawX: 22,
          durationDays: 8,
          evidence: "Planning",
          icon: "foundation",
          name: "Site prep",
          policy: "Planning",
          status: "complete",
          subMilestones: ["Excavation"],
        },
        id: "site-prep",
        x: 14,
      },
    ];
    const draws: DemoDraw[] = [
      {
        amount: 125_000,
        id: "site-prep-draw",
        itemId: "site-prep",
        label: "Draw 1",
        x: 22,
      },
    ];
    const capitalSpikes: DemoCapitalSpike[] = [
      {
        amount: 30_000,
        id: "spike-1",
        label: "Unexpected permit cost",
        x: 18,
      },
    ];

    const cashflow = buildTimelineCashflowData(
      items,
      draws,
      capitalSpikes,
      { max: 40, min: 0, unit: "days" },
      450_000,
    );

    expect(cashflow[0]).toMatchObject({
      cashOnHand: 450_000,
      day: 0,
      event: "start",
    });
    expect(
      cashflow
        .filter((point) => point.id.startsWith("site-prep-distributed-"))
        .reduce((total, point) => total + point.budget, 0),
    ).toBe(125_000);
    expect(cashflow.find((point) => point.id === "spike-1")).toMatchObject({
      capitalSpikeAmount: 30_000,
      cashOnHand: 341_875,
      day: 18,
      event: "capitalSpike",
    });
    expect(
      cashflow.find((point) => point.id === "site-prep-completion-capacity"),
    ).toMatchObject({
      budget: 0,
      cashOnHand: 295_000,
      day: 22,
      drawCapacityUnlocked: 100_000,
    });
    expect(cashflow.find((point) => point.id === "site-prep-draw")).toMatchObject(
      { cashOnHand: 420_000, day: 22, drawAmount: 125_000 },
    );
  });

  test("cashflow chart stacks reimbursable and out-of-pocket milestone cost", () => {
    const items: TimelineItem<DemoMilestone>[] = [
      {
        data: {
          amount: 120_000,
          draw: "Draw 1",
          drawAvailabilityAmount: 90_000,
          durationDays: 8,
          evidence: "Planning",
          icon: "foundation",
          name: "Foundation",
          policy: "Planning",
          status: "complete",
          subMilestones: ["Forms"],
        },
        id: "foundation",
        x: 12,
      },
    ];
    const accountingData = buildTimelineCashflowData(
      items,
      [],
      [],
      { max: 40, min: 0, unit: "days" },
      300_000,
    );

    const chartData = buildCashflowChartData(
      accountingData,
      items,
      { max: 40, min: 0, unit: "days" },
      300_000,
    );
    const milestoneRows = chartData.filter((point) => point.budget > 0);

    expect(milestoneRows.reduce((total, point) => total + point.budget, 0)).toBe(
      120_000,
    );
    expect(
      milestoneRows.reduce(
        (total, point) => total + (point.reimbursableBudget ?? 0),
        0,
      ),
    ).toBe(90_000);
    expect(chartData.find((point) => point.day === 12)).toMatchObject({
      budget: 15_000,
      outOfPocketBudget: 3_750,
      reimbursableBudget: 11_250,
    });
  });

  test("cash infusion increases cash on hand without counting as a capital cost", () => {
    const cashflow = buildTimelineCashflowData(
      [],
      [],
      [
        {
          amount: 75_000,
          eventKind: "cashInfusion",
          id: "infusion-1",
          label: "Owner cash infusion",
          x: 18,
        },
      ],
      { max: 40, min: 0, unit: "days" },
      100_000,
    );

    expect(cashflow).toMatchObject([
      { cashOnHand: 100_000, event: "start" },
      {
        capitalSpikeAmount: 0,
        cashInfusionAmount: 75_000,
        cashOnHand: 175_000,
        day: 18,
        event: "cashInfusion",
      },
    ]);
    expect(
      buildCashflowChartData(
        cashflow,
        [],
        { max: 40, min: 0, unit: "days" },
        100_000,
      ).find((point) => point.day === 18),
    ).toMatchObject({
      cashInfusionAmount: 75_000,
      cashOnHand: 175_000,
      event: "cashInfusion",
    });
  });

  test("same-day cash infusion is available before milestone spend", () => {
    const items: TimelineItem<DemoMilestone>[] = [
      {
        data: {
          amount: 100_000,
          completionPaymentAmount: 20_000,
          draw: "Draw 1",
          durationDays: 5,
          evidence: "Planning",
          icon: "foundation",
          initialPaymentAmount: 80_000,
          name: "Foundation",
          policy: "Planning",
          status: "ready",
          subMilestones: [],
        },
        id: "foundation",
        x: 0,
      },
    ];
    const cashflow = buildTimelineCashflowData(
      items,
      [],
      [
        {
          amount: 100_000,
          eventKind: "cashInfusion",
          id: "infusion-1",
          label: "Owner cash infusion",
          x: 0,
        },
      ],
      { max: 40, min: 0, unit: "days" },
      0,
    );

    expect(cashflow.slice(1, 3)).toMatchObject([
      { cashOnHand: 100_000, event: "cashInfusion" },
      {
        budget: 80_000,
        cashOnHand: 20_000,
        event: "milestone",
        id: "foundation-initial-payment",
      },
    ]);
    expect(buildCashShortfallPoints(cashflow, 0)).toEqual([]);
  });

  test("milestone cashflow applies initial, distributed, completion, and capacity events", () => {
    const items: TimelineItem<DemoMilestone>[] = [
      {
        data: {
          amount: 100_000,
          completionPaymentAmount: 20_000,
          draw: "Draw 1",
          durationDays: 4,
          evidence: "Planning",
          icon: "foundation",
          initialPaymentAmount: 40_000,
          name: "Foundation",
          policy: "Planning",
          status: "ready",
          subMilestones: ["Excavation"],
        },
        id: "foundation",
        x: 10,
      },
    ];

    const cashflow = buildTimelineCashflowData(
      items,
      [],
      [],
      { max: 30, min: 0, unit: "days" },
      150_000,
    );

    expect(
      cashflow
        .filter((point) => point.event === "milestone")
        .map((point) => ({
          budget: point.budget,
          cashOnHand: point.cashOnHand,
          day: point.day,
          drawCapacityUnlocked: point.drawCapacityUnlocked,
          id: point.id,
        })),
    ).toEqual([
      {
        budget: 40_000,
        cashOnHand: 110_000,
        day: 10,
        drawCapacityUnlocked: 0,
        id: "foundation-initial-payment",
      },
      {
        budget: 10_000,
        cashOnHand: 100_000,
        day: 10,
        drawCapacityUnlocked: 0,
        id: "foundation-distributed-10",
      },
      {
        budget: 10_000,
        cashOnHand: 90_000,
        day: 11,
        drawCapacityUnlocked: 0,
        id: "foundation-distributed-11",
      },
      {
        budget: 10_000,
        cashOnHand: 80_000,
        day: 12,
        drawCapacityUnlocked: 0,
        id: "foundation-distributed-12",
      },
      {
        budget: 10_000,
        cashOnHand: 70_000,
        day: 13,
        drawCapacityUnlocked: 0,
        id: "foundation-distributed-13",
      },
      {
        budget: 20_000,
        cashOnHand: 50_000,
        day: 14,
        drawCapacityUnlocked: 0,
        id: "foundation-completion-payment",
      },
      {
        budget: 0,
        cashOnHand: 50_000,
        day: 14,
        drawCapacityUnlocked: 80_000,
        id: "foundation-completion-capacity",
      },
    ]);
  });

  test("actual cost lowers milestone spend without changing unlocked draw capacity", () => {
    const items: TimelineItem<DemoMilestone>[] = [
      {
        data: {
          amount: 300_000,
          completionClaim: {
            actualCost: 280_000,
            completedDay: 30,
            submittedAt: "2026-06-02T00:00:00.000Z",
          },
          draw: "Draw 1",
          durationDays: 30,
          evidence: "Submitted",
          icon: "foundation",
          name: "Foundation",
          policy: "Review",
          status: "complete",
          subMilestones: ["Forms and pour"],
        },
        id: "foundation",
        x: 0,
      },
    ];

    const cashflow = buildTimelineCashflowData(
      items,
      [],
      [],
      { max: 40, min: 0, unit: "days" },
      400_000,
    );

    expect(
      cashflow
        .filter((point) => point.id.startsWith("foundation-distributed-"))
        .reduce((total, point) => total + point.budget, 0),
    ).toBe(280_000);
    expect(
      cashflow.find((point) => point.id === "foundation-completion-capacity"),
    ).toMatchObject({
      budget: 0,
      cashOnHand: 120_000,
      day: 30,
      drawCapacityUnlocked: 240_000,
    });
    expect(getMilestoneDrawAvailabilityAmount(items[0]?.data)).toBe(240_000);

    const chartData = buildCashflowChartData(
      cashflow,
      items,
      { max: 40, min: 0, unit: "days" },
      400_000,
    );
    expect(
      chartData.reduce((total, point) => total + point.budget, 0),
    ).toBe(280_000);
    expect(chartData.find((point) => point.day === 0)).toMatchObject({
      budget: 9_333,
      cashOnHand: 390_667,
      event: "milestone",
    });
    expect(chartData.find((point) => point.day === 30)).toMatchObject({
      cashOnHand: 120_000,
    });
  });

  test("over-budget actual cost lowers cash without increasing draw capacity", () => {
    const items: TimelineItem<DemoMilestone>[] = [
      {
        data: {
          amount: 300_000,
          completionClaim: {
            actualCost: 320_000,
            completedDay: 30,
            submittedAt: "2026-06-02T00:00:00.000Z",
          },
          draw: "Draw 1",
          durationDays: 30,
          evidence: "Submitted",
          icon: "foundation",
          name: "Foundation",
          policy: "Review",
          status: "complete",
          subMilestones: ["Forms and pour"],
        },
        id: "foundation",
        x: 0,
      },
    ];

    const cashflow = buildTimelineCashflowData(
      items,
      [],
      [],
      { max: 40, min: 0, unit: "days" },
      400_000,
    );

    expect(
      cashflow
        .filter((point) => point.id.startsWith("foundation-distributed-"))
        .reduce((total, point) => total + point.budget, 0),
    ).toBe(320_000);
    expect(
      cashflow.find((point) => point.id === "foundation-completion-capacity"),
    ).toMatchObject({
      budget: 0,
      cashOnHand: 80_000,
      day: 30,
      drawCapacityUnlocked: 240_000,
    });
    expect(getMilestoneDrawAvailabilityAmount(items[0]?.data)).toBe(240_000);
  });

  test("early completion claim unlocks draw capacity before planned end", () => {
    const cashflow = buildTimelineCashflowData(
      [
        {
          data: {
            amount: 100_000,
            completionClaim: {
              completedDay: 8,
              submittedAt: "2026-05-01T00:00:00.000Z",
            },
            completionPaymentAmount: 20_000,
            draw: "Draw 1",
            durationDays: 14,
            evidence: "Submitted",
            icon: "foundation",
            initialPaymentAmount: 40_000,
            name: "Foundation",
            policy: "Planning",
            status: "complete",
            subMilestones: ["Excavation"],
          },
          id: "foundation",
          x: 0,
        },
      ],
      [],
      [],
      { max: 30, min: 0, unit: "days" },
      150_000,
    );

    expect(
      cashflow
        .filter((point) => point.event === "milestone")
        .filter((point) => point.drawCapacityUnlocked > 0),
    ).toEqual([
      expect.objectContaining({
        day: 8,
        drawCapacityUnlocked: 80_000,
        id: "foundation-completion-capacity",
      }),
    ]);
    expect(
      cashflow
        .filter((point) => point.event === "milestone" && point.budget > 0)
        .every((point) => point.drawCapacityUnlocked === 0),
    ).toBe(true);
    expect(
      calculateDrawRequestLimit(
        { amount: 80_000, id: "draw-1", label: "Draw 1", x: 10 },
        [
          {
            data: {
              amount: 100_000,
              completionClaim: {
                completedDay: 8,
                submittedAt: "2026-05-01T00:00:00.000Z",
              },
              draw: "Draw 1",
              durationDays: 14,
              evidence: "Submitted",
              icon: "foundation",
              name: "Foundation",
              policy: "Planning",
              status: "complete",
              subMilestones: ["Excavation"],
            },
            id: "foundation",
            x: 0,
          },
        ],
        [],
      ),
    ).toMatchObject({
      availableLimit: 80_000,
      totalUnlocked: 80_000,
    });
  });

  test("draw capacity unlocks only on completion day", () => {
    const cashflow = buildTimelineCashflowData(
      [
        {
          data: {
            amount: 100_000,
            completionPaymentAmount: 20_000,
            draw: "Draw 1",
            durationDays: 4,
            evidence: "Planning",
            icon: "foundation",
            initialPaymentAmount: 40_000,
            name: "Foundation",
            policy: "Planning",
            status: "ready",
            subMilestones: ["Excavation"],
          },
          id: "foundation",
          x: 10,
        },
      ],
      [],
      [],
      { max: 30, min: 0, unit: "days" },
      150_000,
    );

    expect(
      cashflow
        .filter((point) => point.event === "milestone")
        .map((point) => ({
          budget: point.budget,
          day: point.day,
          drawCapacityUnlocked: point.drawCapacityUnlocked,
          id: point.id,
        })),
    ).toEqual([
      {
        budget: 40_000,
        day: 10,
        drawCapacityUnlocked: 0,
        id: "foundation-initial-payment",
      },
      {
        budget: 10_000,
        day: 10,
        drawCapacityUnlocked: 0,
        id: "foundation-distributed-10",
      },
      {
        budget: 10_000,
        day: 11,
        drawCapacityUnlocked: 0,
        id: "foundation-distributed-11",
      },
      {
        budget: 10_000,
        day: 12,
        drawCapacityUnlocked: 0,
        id: "foundation-distributed-12",
      },
      {
        budget: 10_000,
        day: 13,
        drawCapacityUnlocked: 0,
        id: "foundation-distributed-13",
      },
      {
        budget: 20_000,
        day: 14,
        drawCapacityUnlocked: 0,
        id: "foundation-completion-payment",
      },
      {
        budget: 0,
        day: 14,
        drawCapacityUnlocked: 80_000,
        id: "foundation-completion-capacity",
      },
    ]);
  });

  test("draw availability accumulates completion capacity instead of spend budget", () => {
    const availability = buildDrawAvailabilityData([
      cashflowPoint({
        cashOnHand: 150_000,
        day: 0,
        event: "start",
        id: "start",
        name: "Starting cash",
      }),
      cashflowPoint({
        budget: 40_000,
        cashOnHand: 110_000,
        day: 10,
        event: "milestone",
        id: "foundation-initial-payment",
        name: "Foundation initial payment",
      }),
      cashflowPoint({
        budget: 20_000,
        cashOnHand: 50_000,
        day: 14,
        drawCapacityUnlocked: 100_000,
        event: "milestone",
        id: "foundation-completion-payment",
        name: "Foundation completion payment",
      }),
      cashflowPoint({
        cashOnHand: 150_000,
        day: 18,
        drawAmount: 60_000,
        event: "draw",
        id: "foundation-draw",
        name: "Draw 1",
      }),
    ]);

    expect(availability).toMatchObject([
      { additionalAvailableDraw: 0, day: 0, totalAvailableDraw: 0 },
      { additionalAvailableDraw: 0, day: 10, totalAvailableDraw: 0 },
      {
        additionalAvailableDraw: 100_000,
        day: 14,
        totalAvailableDraw: 100_000,
      },
      {
        additionalAvailableDraw: 40_000,
        day: 18,
        interestBearingDraw: 60_000,
        totalAvailableDraw: 100_000,
      },
    ]);
  });

  test("draw availability shows approved headroom above scheduled draws", () => {
    const availability = buildDrawAvailabilityData(
      [
        cashflowPoint({
          cashOnHand: 100_000,
          day: 0,
          event: "start",
          id: "start",
          name: "Starting cash",
        }),
        cashflowPoint({
          cashOnHand: 100_000,
          day: 10,
          drawCapacityUnlocked: 60_000,
          event: "milestone",
          id: "foundation-complete",
          name: "Foundation complete",
        }),
        cashflowPoint({
          cashOnHand: 160_000,
          day: 14,
          drawAmount: 60_000,
          event: "draw",
          id: "foundation-draw",
          name: "Draw 1",
        }),
      ],
      70_000,
    );

    expect(availability.at(-1)).toMatchObject({
      additionalAvailableDraw: 10_000,
      interestBearingDraw: 60_000,
      totalAvailableDraw: 70_000,
    });
  });

  test("draw availability accrues released principal interest with daily compounding", () => {
    const availability = buildDrawAvailabilityData([
      cashflowPoint({
        cashOnHand: 100_000,
        day: 0,
        event: "start",
        id: "start",
        name: "Starting cash",
      }),
      cashflowPoint({
        cashOnHand: 160_000,
        day: 10,
        drawAmount: 60_000,
        event: "draw",
        id: "foundation-draw",
        name: "Draw 1",
      }),
      cashflowPoint({
        cashOnHand: 160_000,
        day: 40,
        event: "milestone",
        id: "inspection-checkpoint",
        name: "Inspection checkpoint",
      }),
    ]);

    expect(availability[1]?.totalInterestAccrued).toBe(0);
    expect(availability[2]?.totalInterestAccrued).toBeCloseTo(
      60_000 * ((1 + 0.0925 / 365) ** 30 - 1),
      2,
    );
  });

  test("draw availability probe interest accrues to the hovered day", () => {
    const availability = buildDrawAvailabilityData([
      cashflowPoint({
        cashOnHand: 100_000,
        day: 0,
        event: "start",
        id: "start",
        name: "Starting cash",
      }),
      cashflowPoint({
        cashOnHand: 160_000,
        day: 10,
        drawAmount: 60_000,
        event: "draw",
        id: "foundation-draw",
        name: "Draw 1",
      }),
      cashflowPoint({
        cashOnHand: 160_000,
        day: 40,
        event: "milestone",
        id: "inspection-checkpoint",
        name: "Inspection checkpoint",
      }),
    ]);

    const probe = interpolateDrawAvailability(availability, 25);

    expect(probe.day).toBe(25);
    expect(probe.totalInterestAccrued).toBeCloseTo(
      60_000 * ((1 + 0.0925 / 365) ** 15 - 1),
      2,
    );
  });

  test("draw availability interest is stable across non-draw event boundaries", () => {
    const availability = buildDrawAvailabilityData([
      cashflowPoint({
        cashOnHand: 100_000,
        day: 0,
        event: "start",
        id: "start",
        name: "Starting cash",
      }),
      cashflowPoint({
        cashOnHand: 160_000,
        day: 10,
        drawAmount: 60_000,
        event: "draw",
        id: "foundation-draw",
        name: "Draw 1",
      }),
      cashflowPoint({
        cashOnHand: 160_000,
        day: 20,
        event: "milestone",
        id: "inspection-checkpoint",
        name: "Inspection checkpoint",
      }),
    ]);

    const probe = interpolateDrawAvailability(availability, 25);

    expect(probe.totalInterestAccrued).toBeCloseTo(
      60_000 * ((1 + 0.0925 / 365) ** 15 - 1),
      2,
    );
  });

  test("financial overview interest matches range-end compounded draw availability", () => {
    const cashflow = [
      cashflowPoint({
        cashOnHand: 100_000,
        day: 0,
        event: "start",
        id: "start",
        name: "Starting cash",
      }),
      cashflowPoint({
        cashOnHand: 160_000,
        day: 10,
        drawAmount: 60_000,
        event: "draw",
        id: "foundation-draw",
        name: "Draw 1",
      }),
    ];
    const availability = buildDrawAvailabilityData(cashflow);
    const rangeEndAvailability = interpolateDrawAvailability(availability, 25);
    const overview = buildFinancialOverview(
      cashflow,
      [{ amount: 60_000, id: "foundation-draw", label: "Draw 1", x: 10 }],
      { max: 25, min: 0, unit: "days" },
    );

    expect(overview.interestPaid).toBeCloseTo(
      rangeEndAvailability.totalInterestAccrued,
      2,
    );
  });

  test("cashflow chart aggregates daily milestone spend from accounting rows", () => {
    const items: TimelineItem<DemoMilestone>[] = [
      {
        data: {
          amount: 100_000,
          completionPaymentAmount: 20_000,
          draw: "Draw 1",
          durationDays: 4,
          evidence: "Planning",
          icon: "foundation",
          initialPaymentAmount: 40_000,
          name: "Foundation",
          policy: "Planning",
          status: "ready",
          subMilestones: ["Excavation"],
        },
        id: "foundation",
        x: 10,
      },
    ];
    const range = { max: 30, min: 0, unit: "days" } as const;
    const accountingData = buildTimelineCashflowData(
      items,
      [],
      [],
      range,
      150_000,
    );
    const chartData = buildCashflowChartData(
      accountingData,
      items,
      range,
      150_000,
    );

    expect(chartData.map((point) => point.day)).toEqual([
      0, 10, 11, 12, 13, 14, 30,
    ]);
    expect(
      chartData.find((point) => point.id === "milestone-cost-gate-10"),
    ).toMatchObject({
      budget: 50_000,
      day: 10,
      milestoneEndDay: 14,
    });
    expect(chartData.some((point) => point.id.includes("distributed"))).toBe(
      false,
    );
    expect(interpolateLinearCashOnHand(chartData, 12)).toBe(80_000);
  });

  test("densifies chart-only probe points no more frequently than every five days", () => {
    const sparse: CashflowDatum[] = [
      cashflowPoint({
        cashOnHand: 400_000,
        day: 0,
        event: "start",
        id: "start",
        name: "Starting cash",
      }),
      cashflowPoint({
        budget: 100_000,
        cashOnHand: 300_000,
        day: 12,
        event: "milestone",
        id: "m1",
        name: "Milestone 1",
      }),
      cashflowPoint({
        cashOnHand: 400_000,
        day: 19,
        drawAmount: 100_000,
        event: "draw",
        id: "d1",
        name: "Draw 1",
      }),
    ];

    expect(
      densifyCashflowData(sparse, { max: 20, min: 0, unit: "days" }).map(
        (point) => point.day,
      ),
    ).toEqual([0, 5, 10, 12, 15, 19, 20]);
    expect(
      buildChartProbeDays({ max: 20, min: 0, unit: "days" }, [12, 19]),
    ).toEqual([0, 5, 10, 12, 15, 19, 20]);
  });

  test("timeline aligned ticks scale with rendered axis width", () => {
    expect(
      getTimelineAlignedTicks({ max: 230, min: 0, unit: "days" }, 6.4).length,
    ).toBeGreaterThanOrEqual(6);
  });

  test("live draw request limit only counts admin-approved completed milestones", () => {
    const items: TimelineItem<DemoMilestone>[] = [
      {
        data: {
          amount: 120_000,
          completionClaim: {
            completedDay: 10,
            submittedAt: "2026-05-01T00:00:00.000Z",
          },
          completionReview: {
            reviewedAt: "2026-05-02T00:00:00.000Z",
            status: "approved",
          },
          draw: "Draw 1",
          durationDays: 10,
          evidence: "Approved",
          icon: "foundation",
          name: "Foundation",
          policy: "Approved",
          status: "complete",
          subMilestones: ["Excavation"],
        },
        id: "foundation",
        x: 0,
      },
      {
        data: {
          amount: 90_000,
          completionClaim: {
            completedDay: 12,
            submittedAt: "2026-05-03T00:00:00.000Z",
          },
          draw: "Draw 2",
          durationDays: 12,
          evidence: "Submitted",
          icon: "framing",
          name: "Framing",
          policy: "Pending",
          status: "complete",
          subMilestones: ["Walls"],
        },
        id: "framing",
        x: 0,
      },
    ];
    const targetDraw: DemoDraw = {
      amount: 80_000,
      id: "draw-1",
      label: "Draw 1",
      x: 16,
    };

    expect(calculateApprovedDrawRequestLimit(targetDraw, items, [])).toEqual({
      alreadyDrawn: 0,
      availableLimit: 96_000,
      blockingMilestones: ["Framing"],
      remainingAfterRequest: 16_000,
      totalUnlocked: 96_000,
    });
    expect(calculateDrawRequestLimit(targetDraw, items, [])).toEqual({
      alreadyDrawn: 0,
      availableLimit: 168_000,
      remainingAfterRequest: 88_000,
      totalUnlocked: 168_000,
    });
  });

  test("draw marker state distinguishes planned requested happened and rejected", () => {
    expect(
      getDrawTimelineMarkerState(
        { amount: 1, id: "planned", label: "Draw", x: 20 },
        10,
      ),
    ).toBe("planned");
    expect(
      getDrawTimelineMarkerState(
        {
          amount: 1,
          id: "requested",
          label: "Draw",
          requestStatus: "requested",
          x: 20,
        },
        10,
      ),
    ).toBe("requested");
    expect(
      getDrawTimelineMarkerState(
        {
          amount: 1,
          id: "rejected",
          label: "Draw",
          requestStatus: "rejected",
          x: 20,
        },
        10,
      ),
    ).toBe("rejected");
    expect(
      getDrawTimelineMarkerState(
        {
          amount: 1,
          id: "approved",
          label: "Draw",
          requestStatus: "approved",
          x: 20,
        },
        10,
      ),
    ).toBe("happened");
  });

  test("relabels default draw names by chronological insertion order", () => {
    expect(
      relabelTimelineDraws([
        { amount: 100_000, id: "draw-existing", label: "Draw 09", x: 30 },
        { amount: 100_000, id: "draw-inserted", label: "Draw 10", x: 0 },
        { amount: 50_000, id: "custom", label: "Admin release", x: 15 },
      ]),
    ).toEqual([
      expect.objectContaining({ id: "draw-inserted", label: "Draw 01" }),
      expect.objectContaining({ id: "custom", label: "Admin release" }),
      expect.objectContaining({ id: "draw-existing", label: "Draw 03" }),
    ]);
  });
});

function cashflowPoint(
  point: Partial<CashflowDatum> &
    Pick<CashflowDatum, "day" | "event" | "id" | "name">,
): CashflowDatum {
  return {
    budget: 0,
    capitalSpikeAmount: 0,
    cashInfusionAmount: 0,
    cashOnHand: 0,
    drawCapacityUnlocked: 0,
    drawAmount: 0,
    ...point,
  };
}
