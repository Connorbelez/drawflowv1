import { describe, expect, test } from "vitest";
import type { TimelineItem } from "#/components/roadmap/AnimatedCurvedTimeline.tsx";
import {
  buildChartProbeDays,
  buildCashShortfallPoints,
  buildTimelineCashflowData,
  type CashflowDatum,
  densifyCashflowData,
  getTimelineAlignedTicks,
} from "./index.tsx";
import type {
  DemoCapitalSpike,
  DemoDraw,
  DemoMilestone,
} from "./-timeline-share-snapshot.ts";

describe("timeline cash shortfall logic", () => {
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

  test("cashflow separates milestone costs, draw reimbursements, capital spikes, and starting cash", () => {
    const items: TimelineItem<DemoMilestone>[] = [
      {
        data: {
          amount: 125_000,
          draw: "Draw 1",
          drawX: 22,
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
        450_000
      )
    ).toMatchObject([
      { cashOnHand: 450_000, day: 0, event: "start" },
      { budget: 125_000, cashOnHand: 325_000, day: 14 },
      {
        capitalSpikeAmount: 30_000,
        cashOnHand: 295_000,
        day: 18,
        event: "capitalSpike",
      },
      { cashOnHand: 420_000, day: 22, drawAmount: 125_000 },
    ]);
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
        (point) => point.day
      )
    ).toEqual([0, 5, 10, 12, 15, 19, 20]);
    expect(
      buildChartProbeDays({ max: 20, min: 0, unit: "days" }, [12, 19])
    ).toEqual([0, 5, 10, 12, 15, 19, 20]);
  });

  test("timeline aligned ticks scale with rendered axis width", () => {
    expect(
      getTimelineAlignedTicks({ max: 230, min: 0, unit: "days" }, 6.4).length
    ).toBeGreaterThanOrEqual(6);
  });
});

function cashflowPoint(
  point: Partial<CashflowDatum> &
    Pick<CashflowDatum, "day" | "event" | "id" | "name">
): CashflowDatum {
  return {
    budget: 0,
    capitalSpikeAmount: 0,
    cashOnHand: 0,
    drawAmount: 0,
    ...point,
  };
}
