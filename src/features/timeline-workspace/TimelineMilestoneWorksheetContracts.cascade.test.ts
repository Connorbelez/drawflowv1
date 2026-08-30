import { describe, expect, test } from "vitest";
import {
  cascadeBudgetEdit,
  cascadeSubMilestoneBudgetEdit,
  type TimelineMilestoneWorksheetRow,
} from "./TimelineMilestoneWorksheetContracts.tsx";

function row({
  budgets,
  key,
  percentageBps = 0,
}: {
  budgets: number[];
  key: string;
  percentageBps?: number;
}): TimelineMilestoneWorksheetRow {
  const totalCents = budgets.reduce((sum, budget) => sum + budget, 0);
  return {
    budgetText: `$${(totalCents / 100).toFixed(2)}`,
    dependencyKeys: [],
    durationDays: 4,
    durationText: "4",
    excluded: false,
    icon: "foundation",
    key,
    name: key,
    order: 0,
    percentageBps,
    percentageText: `${(percentageBps / 100).toFixed(2)}%`,
    subMilestoneDetails: budgets.map((budget, index) => ({
      budgetText: `$${(budget / 100).toFixed(2)}`,
      description: `Scope ${index + 1}`,
      durationText: "1",
      id: `${key}-sub-${index + 1}`,
      name: `Sub ${index + 1}`,
      percentageBps: index === 0 ? percentageBps : 0,
    })),
    subMilestones: budgets.map((_, index) => `Sub ${index + 1}`),
    type: "foundation",
  };
}

function appliedRows(
  result:
    | ReturnType<typeof cascadeBudgetEdit>
    | ReturnType<typeof cascadeSubMilestoneBudgetEdit>
) {
  expect(result.status).toBe("applied");
  if (result.status !== "applied") {
    throw new Error(result.message);
  }
  return result.rows;
}

function cents(text: string) {
  return Math.round(Number(text.replace(/[$,]/g, "")) * 100);
}

describe("fixed-total Cascade allocation", () => {
  test("uses pre-edit milestone budgets rather than stale PoC weights", () => {
    const rows = [
      row({ budgets: [10_000], key: "m1", percentageBps: 9000 }),
      row({ budgets: [30_000], key: "m2", percentageBps: 500 }),
      row({ budgets: [60_000], key: "m3", percentageBps: 500 }),
    ];
    const nextRows = appliedRows(
      cascadeBudgetEdit({
        nextBudgetCents: 20_000,
        rowKey: "m1",
        rows,
        targetBudgetCents: 100_000,
      })
    );

    expect(nextRows.map((candidate) => cents(candidate.budgetText))).toEqual([
      20_000, 26_667, 53_333,
    ]);
    expect(nextRows[0]?.subMilestoneDetails[0]?.budgetText).toBe("$200");
    expect(nextRows.reduce((sum, candidate) => sum + candidate.percentageBps, 0)).toBe(
      10_000
    );
  });

  test("keeps upstream positions fixed and assigns currency remainder stably", () => {
    const nextRows = appliedRows(
      cascadeSubMilestoneBudgetEdit({
        nextBudgetCents: 2,
        rowKey: "m1",
        rows: [row({ budgets: [1, 1, 1], key: "m1" })],
        subMilestoneId: "m1-sub-2",
        targetBudgetCents: 3,
      })
    );

    expect(
      nextRows[0]?.subMilestoneDetails.map((subMilestone) =>
        cents(subMilestone.budgetText)
      )
    ).toEqual([1, 2, 0]);
  });

  test("splits an inverse decrease evenly across zero-weight downstream positions", () => {
    const nextRows = appliedRows(
      cascadeSubMilestoneBudgetEdit({
        nextBudgetCents: 800,
        rowKey: "m1",
        rows: [row({ budgets: [1000, 0, 0], key: "m1" })],
        subMilestoneId: "m1-sub-1",
        targetBudgetCents: 1000,
      })
    );

    expect(
      nextRows[0]?.subMilestoneDetails.map((subMilestone) =>
        cents(subMilestone.budgetText)
      )
    ).toEqual([800, 100, 100]);
  });

  test("continues Sub-milestone redistribution into a downstream milestone-only position", () => {
    const downstream = row({ budgets: [], key: "m2" });
    downstream.budgetText = "$30.00";
    const nextRows = appliedRows(
      cascadeSubMilestoneBudgetEdit({
        nextBudgetCents: 1000,
        rowKey: "m1",
        rows: [row({ budgets: [1000, 2000], key: "m1" }), downstream],
        subMilestoneId: "m1-sub-2",
        targetBudgetCents: 6000,
      })
    );

    expect(nextRows[0]?.budgetText).toBe("$20");
    expect(nextRows[1]?.budgetText).toBe("$40");
  });

  test("rejects insufficient capacity, a final position, invalid input, and baseline drift", () => {
    const rows = [row({ budgets: [1000, 200, 300], key: "m1" })];

    expect(
      cascadeSubMilestoneBudgetEdit({
        nextBudgetCents: 1600,
        rowKey: "m1",
        rows,
        subMilestoneId: "m1-sub-1",
        targetBudgetCents: 1500,
      })
    ).toMatchObject({
      reason: "insufficientDownstreamCapacity",
      status: "rejected",
    });
    expect(
      cascadeSubMilestoneBudgetEdit({
        nextBudgetCents: 200,
        rowKey: "m1",
        rows,
        subMilestoneId: "m1-sub-3",
        targetBudgetCents: 1500,
      })
    ).toMatchObject({ reason: "noDownstreamAllocation", status: "rejected" });
    expect(
      cascadeBudgetEdit({
        nextBudgetCents: Number.NaN,
        rowKey: "m1",
        rows,
        targetBudgetCents: 1500,
      })
    ).toMatchObject({ reason: "invalidBudget", status: "rejected" });
    expect(
      cascadeBudgetEdit({
        nextBudgetCents: 900,
        rowKey: "m1",
        rows,
        targetBudgetCents: 1501,
      })
    ).toMatchObject({ reason: "baselineTotalMismatch", status: "rejected" });
  });
});
