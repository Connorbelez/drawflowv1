import { describe, expect, test } from "vitest";

import type { ProductionProposalDetail } from "./ProductionProposalSurfaces";
import { buildProductionRoadmapProjection } from "./productionRoadmapAdapter";

const detail = {
  draws: [
    {
      amountCents: 24_000_000,
      drawKey: "draw-01",
      label: "Foundation reimbursement draw",
      milestoneKey: "foundation",
      timingDay: 32,
    },
    {
      amountCents: 36_000_000,
      drawKey: "draw-02",
      label: "Shell reimbursement draw",
      milestoneKey: "shell",
      timingDay: 75,
    },
  ],
  milestones: [
    {
      budgetCents: 30_000_000,
      dayEnd: 30,
      dayStart: 0,
      dependencyKeys: [],
      durationDays: 30,
      key: "foundation",
      name: "Foundation",
      order: 1,
    },
    {
      budgetCents: 45_000_000,
      dayEnd: 73,
      dayStart: 35,
      dependencyKeys: ["foundation"],
      durationDays: 38,
      key: "shell",
      name: "Shell",
      order: 2,
    },
  ],
  proposal: {
    borrowerCoPayBps: 2_000,
    borrowerWorkingCapitalLimitCents: 40_000_000,
    buildName: "Roadmap proposal",
    lenderDrawPolicyLimitCents: 60_000_000,
    location: "Hamilton, ON",
    status: "submitted",
    totalBudgetCents: 75_000_000,
  },
  submilestones: [
    {
      key: "forms",
      milestoneKey: "foundation",
      name: "Forms and pour",
    },
  ],
} satisfies ProductionProposalDetail;

describe("buildProductionRoadmapProjection", () => {
  test("uses milestone draw availability instead of scheduled draw amount", () => {
    const projection = buildProductionRoadmapProjection({
      ...detail,
      draws: [
        {
          ...detail.draws[0],
          amountCents: 18_000_000,
        },
      ],
      milestones: [
        {
          ...detail.milestones[0],
          drawAvailabilityCents: 27_000_000,
        },
        detail.milestones[1],
      ],
    });

    expect(projection.items[0]?.data.drawAvailabilityAmount).toBe(270_000);
    expect(
      projection.drawAvailability.data.find((row) => row.day === 30),
    ).toMatchObject({
      additionalAvailableDraw: 270_000,
      totalAvailableDraw: 270_000,
    });
  });

  test("adapts proposal milestones to curved timeline items", () => {
    const projection = buildProductionRoadmapProjection(detail);

    expect(projection.items).toEqual([
      expect.objectContaining({
        id: "foundation",
        tone: "active",
        x: 0,
        data: expect.objectContaining({
          amount: 300_000,
          drawAvailabilityAmount: 240_000,
          drawX: 32,
          subMilestones: ["Forms and pour"],
        }),
      }),
      expect.objectContaining({
        id: "shell",
        tone: "upcoming",
        x: 35,
        data: expect.objectContaining({
          amount: 450_000,
          drawAvailabilityAmount: 360_000,
          drawX: 75,
        }),
      }),
    ]);
  });

  test("builds cashflow and draw availability chart data from production rows", () => {
    const projection = buildProductionRoadmapProjection(detail);

    expect(projection.cashflow.data.map((row) => row.event)).toEqual([
      "start",
      "milestone",
      "draw",
      "cashInfusion",
      "milestone",
      "draw",
    ]);
    expect(projection.cashflow.data[1]).toMatchObject({
      budget: 300_000,
      cashOnHand: 100_000,
      day: 0,
      milestoneEndDay: 30,
    });
    expect(projection.cashflow.data[3]).toMatchObject({
      cashInfusionAmount: 110_000,
      cashOnHand: 450_000,
      day: 35,
      event: "cashInfusion",
      name: "Shell cash infusion",
    });
    expect(projection.drawAvailability.data).toEqual([
      expect.objectContaining({
        day: 0,
        totalAvailableDraw: 0,
      }),
      expect.objectContaining({
        additionalAvailableDraw: 240_000,
        day: 30,
        totalAvailableDraw: 240_000,
      }),
      expect.objectContaining({
        additionalAvailableDraw: 0,
        day: 32,
        interestBearingDraw: 240_000,
        totalAvailableDraw: 240_000,
      }),
      expect.objectContaining({
        additionalAvailableDraw: 360_000,
        day: 73,
        interestBearingDraw: 240_000,
        totalAvailableDraw: 600_000,
      }),
      expect.objectContaining({
        additionalAvailableDraw: 0,
        day: 75,
        interestBearingDraw: 600_000,
        totalAvailableDraw: 600_000,
      }),
    ]);
    expect(projection.drawAvailability.data[3]?.totalInterestAccrued).toBeCloseTo(
      240_000 * ((1 + 0.0925 / 365) ** 41 - 1),
      2,
    );
    expect(projection.drawAvailability.referenceLines.map((line) => line.x)).toEqual([
      30,
      73,
      32,
      75,
    ]);
  });

  test("emits timeline markers for working capital, planned draws, and capital support", () => {
    const projection = buildProductionRoadmapProjection(detail);

    expect(projection.markers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "working-capital",
          label: "Cash infusion",
          sublabel: "$400K · Day 0",
          tone: "today",
          x: 0,
        }),
        expect.objectContaining({
          id: "draw:draw-01",
          label: "Foundation reimbursement draw",
          sublabel: "$240K · Day 32",
          tone: "accent",
          x: 32,
        }),
        expect.objectContaining({
          id: "cash-infusion:milestone:shell",
          label: "Cash infusion needed",
          sublabel: "$110K · Day 35",
          tone: "warning",
          x: 35,
        }),
        expect.objectContaining({
          id: "capital-spike:shell",
          label: "Capital spike",
          sublabel: "$450K · Day 35",
          tone: "warning",
          x: 35,
        }),
      ]),
    );
  });
});
