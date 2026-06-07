import { describe, expect, test } from "vitest";
import type { TimelineItem } from "#/components/roadmap/AnimatedCurvedTimeline.tsx";
import {
  buildCashShortfallPoints,
  buildTimelineCashflowData,
} from "./index.tsx";
import type {
  DemoCapitalSpike,
  DemoMilestone,
} from "./-timeline-share-snapshot.ts";
import { optimizeTimelineDrawSchedule } from "./-timeline-draw-optimizer.ts";

describe("optimizeTimelineDrawSchedule", () => {
  test("combines near-term reserve needs when avoiding another draw fee is cheaper", () => {
    const result = optimizeTimelineDrawSchedule({
      capitalSpikes: [
        capitalCost("framing-overrun", 10, 10),
        capitalCost("permit-overrun", 10, 11),
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
    expect(result.draws[0]?.x).toBeLessThan(10);
    expect(result.drawFees).toBe(500);
  });

  test("splits distant reserve needs when late interest savings beat another draw fee", () => {
    const result = optimizeTimelineDrawSchedule({
      capitalSpikes: [
        capitalCost("small-carry-need", 1, 10),
        capitalCost("large-late-need", 1_000_000, 5_000),
      ],
      items: [milestone("sitework", 0, 5, 1, 2_000_000)],
      minimumCashReserve: 0,
      range: { max: 10_000, min: 0, unit: "days" },
      startingCash: 1,
    });

    expect(result.status).toBe("optimized");
    expect(result.draws.map((draw) => draw.amount)).toEqual([1, 1_000_000]);
    expect(result.draws[0]?.x).toBeLessThan(10);
    expect(result.draws[1]?.x).toBeLessThan(5_000);
    expect(result.drawFees).toBe(1_000);
  });

  test("accounts for cash infusions when calculating cumulative draw need", () => {
    const result = optimizeTimelineDrawSchedule({
      capitalSpikes: [
        capitalCost("carry-cost", 35, 10),
        cashInfusion("sponsor-injection", 30, 12),
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
): TimelineItem<DemoMilestone> {
  return {
    data: {
      amount,
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

function totalDrawn(draws: Array<{ amount: number }>) {
  return draws.reduce((total, draw) => total + draw.amount, 0);
}
