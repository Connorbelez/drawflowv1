import { describe, expect, test } from "vitest";
import type { TimelineItem } from "#/components/roadmap/AnimatedCurvedTimeline.tsx";
import {
  buildCashflowChartData,
  buildCashShortfallPoints,
  buildTimelineCashflowData,
} from "./index.tsx";
import type {
  DemoCapitalSpike,
  DemoMilestone,
} from "./-timeline-share-snapshot.ts";
import {
  calculateHomeEquityInterestCost,
  optimizeTimelineDrawSchedule,
} from "./-timeline-draw-optimizer.ts";

describe("optimizeTimelineDrawSchedule", () => {
  test("applies same-day cash infusions before spend constraints", () => {
    const result = optimizeTimelineDrawSchedule({
      capitalSpikes: [
        cashInfusion("borrower-day-zero-capital", 100, 0),
        capitalCost("supplier-deposit", 50, 15),
      ],
      items: [
        milestone("foundation", 0, 5, 100, 100, {
          initialPaymentAmount: 80,
        }),
      ],
      minimumCashReserve: 0,
      range: { max: 40, min: 0, unit: "days" },
      startingCash: 0,
    });

    expect(result.status).toBe("optimized");
    expect(result.draws).toHaveLength(1);
    expect(result.draws[0]).toMatchObject({
      amount: 50,
      label: "Draw 01",
    });
    expect(result.draws[0]?.x).toBeLessThan(15);
  });

  test("combines near-term reserve needs when avoiding another draw fee is cheaper", () => {
    const result = optimizeTimelineDrawSchedule({
      capitalSpikes: [
        capitalCost("framing-overrun", 10, 15),
        capitalCost("permit-overrun", 10, 16),
      ],
      items: [milestone("foundation", 0, 5, 100, 100)],
      minimumCashReserve: 0,
      range: { max: 40, min: 0, unit: "days" },
      startingCash: 100,
    });

    expect(result.status).toBe("optimized");
    expect(result.draws).toHaveLength(1);
    expect(result.draws[0]).toMatchObject({
      amount: 20,
      customDate: true,
      label: "Draw 01",
    });
    expect(result.draws[0]?.x).toBeLessThan(15);
    expect(result.drawFees).toBe(500);
  });

  test("uses configured interest rate for optimization costs", () => {
    const input = {
      capitalSpikes: [capitalCost("late-carry-cost", 90, 20)],
      items: [milestone("foundation", 0, 5, 100, 100)],
      minimumCashReserve: 0,
      range: { max: 40, min: 0, unit: "days" },
      startingCash: 110,
    };

    const zeroRate = optimizeTimelineDrawSchedule({
      ...input,
      interestAnnualBps: 0,
    });
    const higherRate = optimizeTimelineDrawSchedule({
      ...input,
      interestAnnualBps: 1_200,
    });

    expect(zeroRate.status).toBe("optimized");
    expect(higherRate.status).toBe("optimized");
    expect(zeroRate.interestCost).toBe(0);
    expect(higherRate.interestCost).toBeGreaterThan(zeroRate.interestCost);
    expect(higherRate.totalCost).toBeGreaterThan(zeroRate.totalCost);
  });

  test("splits distant reserve needs when late interest savings beat another draw fee", () => {
    const result = optimizeTimelineDrawSchedule({
      capitalSpikes: [
        capitalCost("small-carry-need", 1, 15),
        capitalCost("large-late-need", 1_000_000, 5_000),
      ],
      items: [milestone("sitework", 0, 5, 1, 2_000_000)],
      minimumCashReserve: 0,
      range: { max: 10_000, min: 0, unit: "days" },
      startingCash: 1,
    });

    expect(result.status).toBe("optimized");
    expect(result.draws.map((draw) => draw.amount)).toEqual([1, 1_000_000]);
    expect(result.draws[0]?.x).toBeLessThan(15);
    expect(result.draws[1]?.x).toBeLessThan(5_000);
    expect(result.drawFees).toBe(1_000);
  });

  test("accounts for cash infusions when calculating cumulative draw need", () => {
    const result = optimizeTimelineDrawSchedule({
      capitalSpikes: [
        capitalCost("carry-cost", 35, 15),
        cashInfusion("sponsor-injection", 30, 17),
        capitalCost("late-cost", 40, 20),
      ],
      items: [milestone("foundation", 0, 5, 50, 100)],
      minimumCashReserve: 25,
      range: { max: 40, min: 0, unit: "days" },
      startingCash: 75,
    });

    expect(result.status).toBe("optimized");
    expect(totalDrawn(result.draws)).toBe(45);
    expect(result.draws).toHaveLength(1);
  });

  test("treats a pre-start Home Equity Takeout as cash without adding construction spend", () => {
    const result = optimizeTimelineDrawSchedule({
      capitalSpikes: [
        homeEquityTakeout("home-equity", 75, -30, 1_000),
        capitalCost("site-cost", 125, 10),
      ],
      items: [milestone("availability-unlock", 0, 1, 0, 100)],
      minimumCashReserve: 0,
      range: { max: 40, min: -30, unit: "days" },
      startingCash: 0,
    });

    expect(result.status).toBe("optimized");
    expect(totalDrawn(result.draws)).toBe(50);
    expect(result.homeEquityInterestCost).toBeGreaterThan(0);
    expect(result.interestCost).toBe(
      result.constructionInterestCost + result.homeEquityInterestCost,
    );
  });

  test("compounds Home Equity Takeout interest daily from T−30 through T0", () => {
    const interest = calculateHomeEquityInterestCost(
      [homeEquityTakeout("home-equity", 100_000, -30, 1_000)],
      0,
    );
    const expected = 100_000 * ((1 + 0.1 / 365) ** 30 - 1);

    expect(interest).toBeCloseTo(expected, 8);
  });

  test("aggregates independently compounded interest across multiple takeouts", () => {
    const events = [
      homeEquityTakeout("first", 100_000, -30, 1_000),
      homeEquityTakeout("second", 50_000, -10, 500),
    ];
    const expected =
      100_000 * ((1 + 0.1 / 365) ** 60 - 1) +
      50_000 * ((1 + 0.05 / 365) ** 40 - 1);

    expect(calculateHomeEquityInterestCost(events, 30)).toBeCloseTo(
      expected,
      8,
    );
  });

  test("produces exactly three positive draws on distinct dates", () => {
    const result = optimizeTimelineDrawSchedule({
      capitalSpikes: [
        capitalCost("cost-one", 50, 10),
        capitalCost("cost-two", 50, 20),
        capitalCost("cost-three", 50, 30),
      ],
      exactDrawCount: 3,
      items: [milestone("availability-unlock", 0, 1, 0, 300)],
      minimumCashReserve: 0,
      range: { max: 40, min: -30, unit: "days" },
      startingCash: 0,
    });

    expect(result.status).toBe("optimized");
    expect(result.draws).toHaveLength(3);
    expect(result.draws.every((draw) => draw.amount > 0)).toBe(true);
    expect(new Set(result.draws.map((draw) => draw.x)).size).toBe(3);
    expect(result.draws.map((draw) => draw.x)).toEqual([9, 19, 29]);
  });

  test("returns infeasible when the cash constraints cannot support three distinct positive draws", () => {
    const result = optimizeTimelineDrawSchedule({
      capitalSpikes: [capitalCost("single-cost", 50, 10)],
      exactDrawCount: 3,
      items: [milestone("availability-unlock", 0, 1, 0, 300)],
      minimumCashReserve: 0,
      range: { max: 40, min: -30, unit: "days" },
      startingCash: 0,
    });

    expect(result).toMatchObject({
      draws: [],
      status: "infeasible",
    });
    expect(result.infeasibleReason).toContain("exactly 3");
  });

  test("uses pre-event cash infusions before declaring draw availability infeasible", () => {
    const result = optimizeTimelineDrawSchedule({
      capitalSpikes: [
        cashInfusion("sponsor-injection", 30, 14),
        capitalCost("large-site-cost", 120, 15),
      ],
      items: [milestone("availability-unlock", 0, 5, 100, 100)],
      minimumCashReserve: 0,
      range: { max: 40, min: 0, unit: "days" },
      startingCash: 100,
    });

    expect(result.status).toBe("optimized");
    expect(totalDrawn(result.draws)).toBe(90);
  });

  test("draws before an intra-milestone distributed spend trough", () => {
    const items = [
      milestone("availability-unlock", 0, 1, 0, 120),
      milestone("long-running-work", 10, 10, 100, 100),
    ];
    const range = { max: 30, min: 0, unit: "days" } as const;
    const result = optimizeTimelineDrawSchedule({
      capitalSpikes: [],
      items,
      minimumCashReserve: 0,
      range,
      startingCash: 50,
    });

    expect(result.status).toBe("optimized");
    expect(result.draws).toHaveLength(1);
    expect(result.draws[0]).toMatchObject({ amount: 50, x: 14 });

    const cashflow = buildTimelineCashflowData(
      items,
      result.draws,
      [],
      range,
      50,
    );
    expect(buildCashShortfallPoints(cashflow, 0)).toEqual([]);
    expect(
      Math.min(
        ...buildCashflowChartData(cashflow, items, range, 50).map(
          (point) => point.cashOnHand,
        ),
      ),
    ).toBeGreaterThanOrEqual(0);
  });

  test("does not unlock reimbursement capacity until milestone completion and review", () => {
    const items = [milestone("long-running-work", 10, 10, 100, 100)];
    const range = { max: 30, min: 0, unit: "days" } as const;
    const result = optimizeTimelineDrawSchedule({
      capitalSpikes: [],
      items,
      minimumCashReserve: 0,
      range,
      startingCash: 50,
    });

    expect(result.status).toBe("infeasible");
    expect(result.draws).toEqual([]);
    expect(result.infeasibleReason).toContain("long-running-work");
  });

  test("reports cash infusions and capital spikes in availability infeasible reasons", () => {
    const result = optimizeTimelineDrawSchedule({
      capitalSpikes: [
        cashInfusion("partial-sponsor-injection", 10, 8),
        capitalCost("large-site-cost", 120, 10),
      ],
      items: [milestone("availability-unlock", 0, 5, 0, 100)],
      minimumCashReserve: 0,
      range: { max: 40, min: 0, unit: "days" },
      startingCash: 0,
    });

    expect(result.status).toBe("infeasible");
    expect(result.infeasibleReason).toContain("$10 cash infusions");
    expect(result.infeasibleReason).toContain("$120 capital spikes");
    expect(result.infeasibleReason).toContain("$0 milestone spend");
  });

  test("reports infeasible schedules when reserve is needed before draw availability unlocks", () => {
    const result = optimizeTimelineDrawSchedule({
      capitalSpikes: [capitalCost("early-cost", 10, 4)],
      items: [milestone("future-unlock", 5, 10, 0, 100)],
      minimumCashReserve: 0,
      range: { max: 30, min: 0, unit: "days" },
      startingCash: 0,
    });

    expect(result.status).toBe("infeasible");
    expect(result.draws).toEqual([]);
    expect(result.infeasibleReason).toContain("early-cost");
  });

  test("produces draws that satisfy the existing cash shortfall checker", () => {
    const items = [
      milestone("foundation", 0, 5, 100, 100),
      milestone("framing", 20, 25, 80, 80),
    ];
    const capitalSpikes = [
      capitalCost("permit-overrun", 30, 12),
      cashInfusion("equity-injection", 20, 16),
      capitalCost("supplier-deposit", 40, 30),
    ];
    const result = optimizeTimelineDrawSchedule({
      capitalSpikes,
      items,
      minimumCashReserve: 25,
      range: { max: 50, min: 0, unit: "days" },
      startingCash: 180,
    });

    expect(result.status).toBe("optimized");
    expect(
      buildCashShortfallPoints(
        buildTimelineCashflowData(
          items,
          result.draws,
          capitalSpikes,
          { max: 50, min: 0, unit: "days" },
          180,
        ),
        25,
      ),
    ).toEqual([]);
  });
});

function milestone(
  id: string,
  x: number,
  durationDays: number,
  amount: number,
  drawAvailabilityAmount: number,
  schedule: {
    completionPaymentAmount?: number;
    initialPaymentAmount?: number;
  } = {},
): TimelineItem<DemoMilestone> {
  return {
    data: {
      amount,
      ...schedule,
      draw: "Draw",
      drawAvailabilityAmount,
      durationDays,
      evidence: "Planning",
      icon: "foundation",
      name: id,
      policy: "Planning",
      status: "ready",
      subMilestones: [],
    },
    id,
    label: id,
    x,
  };
}

function capitalCost(id: string, amount: number, x: number): DemoCapitalSpike {
  return {
    amount,
    id,
    label: id,
    x,
  };
}

function cashInfusion(id: string, amount: number, x: number): DemoCapitalSpike {
  return {
    amount,
    eventKind: "cashInfusion",
    id,
    label: id,
    x,
  };
}

function homeEquityTakeout(
  id: string,
  amount: number,
  x: number,
  interestAnnualBps: number,
): DemoCapitalSpike {
  return {
    amount,
    eventKind: "homeEquityTakeout",
    id,
    interestAnnualBps,
    label: id,
    x,
  };
}

function totalDrawn(draws: Array<{ amount: number }>) {
  return draws.reduce((total, draw) => total + draw.amount, 0);
}
