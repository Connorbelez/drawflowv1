import { describe, expect, test } from "vitest";
import {
  buildCashShortfallPoints,
  type CashflowDatum,
} from "./index.tsx";

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
});

function cashflowPoint(
  point: Partial<CashflowDatum> &
    Pick<CashflowDatum, "day" | "event" | "id" | "name">
): CashflowDatum {
  return {
    budget: 0,
    cashOnHand: 0,
    drawAmount: 0,
    ...point,
  };
}
