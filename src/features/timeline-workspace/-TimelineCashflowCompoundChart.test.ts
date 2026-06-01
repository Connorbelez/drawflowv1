import { describe, expect, test } from "vitest";
import {
  buildCashflowBarSafeXDomain,
  buildMilestoneEndReferenceLines,
  getCashflowBarHotspotDay,
  isMilestoneEndDatum,
  resolveMilestoneEndDay,
  type TimelineCashflowCompoundDatum,
} from "./-TimelineCashflowCompoundChart.tsx";

describe("TimelineCashflowCompoundChart milestone end markers", () => {
  test("pads the x domain so edge bars render inside the plot area", () => {
    const wideDomain = buildCashflowBarSafeXDomain([0, 160]);
    expect(wideDomain[0]).toBeCloseTo(-5.6);
    expect(wideDomain[1]).toBeCloseTo(165.6);
    expect(buildCashflowBarSafeXDomain([0, 30])).toEqual([-2, 32]);
  });

  test("places settings milestone bars on start day and end markers on milestoneEndDay", () => {
    const row: TimelineCashflowCompoundDatum = {
      budget: 250_000,
      capitalSpikeAmount: 0,
      cashOnHand: 0,
      day: 0,
      event: "milestone",
      id: "milestone:foundation",
      milestoneEndDay: 10,
      name: "Foundation",
    };

    expect(isMilestoneEndDatum(row)).toBe(true);
    expect(resolveMilestoneEndDay(row)).toBe(10);
    expect(buildMilestoneEndReferenceLines([row])).toEqual([
      {
        label: ["Foundation", "Ends Day 10"],
        opacity: 0.58,
        stroke: "oklch(0.67 0.18 275)",
        strokeDasharray: "5 4",
        x: 10,
      },
    ]);
  });

  test("uses completion capacity unlock for timeline demo milestone rows", () => {
    const completionRow: TimelineCashflowCompoundDatum = {
      budget: 120_000,
      capitalSpikeAmount: 0,
      cashOnHand: 80_000,
      day: 52,
      drawCapacityUnlocked: 120_000,
      event: "milestone",
      id: "milestone-one-completion-capacity",
      name: "Milestone one completion capacity",
    };
    const initialRow: TimelineCashflowCompoundDatum = {
      budget: 40_000,
      capitalSpikeAmount: 0,
      cashOnHand: 160_000,
      day: 40,
      drawCapacityUnlocked: 0,
      event: "milestone",
      id: "milestone-one-initial",
      name: "Milestone one initial payment",
    };

    expect(isMilestoneEndDatum(completionRow)).toBe(true);
    expect(isMilestoneEndDatum(initialRow)).toBe(false);
    expect(buildMilestoneEndReferenceLines([initialRow, completionRow])).toEqual([
      {
        label: [
          "Milestone one completion capacity",
          "Ends Day 52",
        ],
        opacity: 0.58,
        stroke: "oklch(0.67 0.18 275)",
        strokeDasharray: "5 4",
        x: 52,
      },
    ]);
  });

  test("only milestone and capital bars are date hotspots", () => {
    const milestoneRow: TimelineCashflowCompoundDatum = {
      budget: 250_000,
      capitalSpikeAmount: 0,
      cashOnHand: 0,
      day: 12,
      event: "milestone",
      id: "milestone-cost-gate-12",
      name: "Milestone cost gate",
    };
    const capitalRow: TimelineCashflowCompoundDatum = {
      budget: 0,
      capitalSpikeAmount: 50_000,
      cashOnHand: 0,
      day: 18,
      event: "capitalSpike",
      id: "permit-overrun",
      name: "Permit overrun",
    };
    const drawRow: TimelineCashflowCompoundDatum = {
      budget: 0,
      capitalSpikeAmount: 0,
      cashOnHand: 0,
      day: 24,
      event: "draw",
      id: "draw-01",
      name: "Foundation draw",
    };

    expect(getCashflowBarHotspotDay("budget", milestoneRow)).toBe(12);
    expect(getCashflowBarHotspotDay("capitalSpikeAmount", capitalRow)).toBe(18);
    expect(getCashflowBarHotspotDay("cashOnHand", milestoneRow)).toBeNull();
    expect(getCashflowBarHotspotDay("budget", drawRow)).toBeNull();
  });
});
