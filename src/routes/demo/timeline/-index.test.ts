import { describe, expect, test } from "vitest";
import type { TimelineItem } from "#/components/roadmap/AnimatedCurvedTimeline.tsx";
import {
  buildDemoDraws,
  buildCashflowChartData,
  buildChartProbeDays,
  buildCashShortfallPoints,
  buildDrawAvailabilityData,
  buildTimelineCashflowData,
  type CashflowDatum,
  densifyCashflowData,
  expandTimelineRangeForMilestones,
  getTimelineAlignedTicks,
  interpolateLinearCashOnHand,
  normalizeTimelineShareStateForRoute,
  resolveSelectedDrawDate,
} from "./index.tsx";
import type {
  DemoCapitalSpike,
  DemoDraw,
  DemoMilestone,
  TimelineShareState,
} from "./-timeline-share-snapshot.ts";

describe("timeline cash shortfall logic", () => {
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
        amount: 100_000,
        id: "foundation-draw",
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

    expect(
      buildTimelineCashflowData(
        items,
        draws,
        capitalSpikes,
        { max: 40, min: 0, unit: "days" },
        450_000,
      ),
    ).toMatchObject([
      { cashOnHand: 450_000, day: 0, event: "start" },
      {
        budget: 0,
        cashOnHand: 450_000,
        day: 14,
        id: "site-prep-initial-payment",
      },
      {
        capitalSpikeAmount: 30_000,
        cashOnHand: 420_000,
        day: 18,
        event: "capitalSpike",
      },
      {
        budget: 125_000,
        cashOnHand: 295_000,
        day: 22,
        drawCapacityUnlocked: 125_000,
        id: "site-prep-completion-payment",
      },
      { cashOnHand: 420_000, day: 22, drawAmount: 125_000 },
    ]);
  });

  test("milestone cashflow applies only initial and completion boundary events", () => {
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

    expect(
      buildTimelineCashflowData(
        items,
        [],
        [],
        { max: 30, min: 0, unit: "days" },
        150_000,
      ),
    ).toMatchObject([
      { cashOnHand: 150_000, day: 0, event: "start" },
      {
        budget: 40_000,
        cashOnHand: 110_000,
        day: 10,
        drawCapacityUnlocked: 0,
        id: "foundation-initial-payment",
      },
      {
        budget: 60_000,
        cashOnHand: 50_000,
        day: 14,
        drawCapacityUnlocked: 100_000,
        id: "foundation-completion-payment",
      },
    ]);
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
        budget: 60_000,
        day: 14,
        drawCapacityUnlocked: 100_000,
        id: "foundation-completion-payment",
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

  test("cashflow chart keeps milestone data sparse and interpolates hover cash", () => {
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

    expect(chartData.map((point) => point.day)).toEqual([0, 10, 14, 30]);
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
});

function cashflowPoint(
  point: Partial<CashflowDatum> &
    Pick<CashflowDatum, "day" | "event" | "id" | "name">,
): CashflowDatum {
  return {
    budget: 0,
    capitalSpikeAmount: 0,
    cashOnHand: 0,
    drawCapacityUnlocked: 0,
    drawAmount: 0,
    ...point,
  };
}
