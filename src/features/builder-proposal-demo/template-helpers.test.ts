import { describe, expect, test } from "vitest";

import {
  allocateBudgetCents,
  cashAwareDrawGroups,
  currentBudgetCents,
  parseCurrencyToCents,
  projectedPeakExposureCents,
} from "./template-helpers";

describe("builder proposal template helpers", () => {
  test("allocates template percentages to the original budget without losing cents", () => {
    const fullBuildPresets = [
      { percentageBps: 500 },
      { percentageBps: 1000 },
      { percentageBps: 1300 },
      { percentageBps: 2300 },
      { percentageBps: 1500 },
      { percentageBps: 900 },
      { percentageBps: 1400 },
      { percentageBps: 400 },
      { percentageBps: 400 },
      { percentageBps: 300 },
    ];
    const originalBudgetCents = 185_000_001;
    const allocations = allocateBudgetCents(
      originalBudgetCents,
      fullBuildPresets
    );

    expect(allocations).toHaveLength(10);
    expect(allocations.reduce((sum, cents) => sum + cents, 0)).toBe(
      originalBudgetCents
    );
  });

  test("tracks budget drift from included milestone edits", () => {
    const milestones = [
      { budgetCents: 9_500_000, included: true },
      { budgetCents: 18_500_000, included: true },
      { budgetCents: 4_200_000, included: false },
    ];

    expect(currentBudgetCents(milestones)).toBe(28_000_000);
  });

  test("packs draw groups against borrower cash availability", () => {
    const milestones = [
      { budgetCents: parseCurrencyToCents("$92,500"), included: true },
      { budgetCents: parseCurrencyToCents("$185,000"), included: true },
      { budgetCents: parseCurrencyToCents("$240,500"), included: true },
      { budgetCents: parseCurrencyToCents("$425,000"), included: true },
      { budgetCents: parseCurrencyToCents("$74,000"), included: true },
      { budgetCents: parseCurrencyToCents("$55,000"), included: true },
    ];
    const cashAvailabilityCents = parseCurrencyToCents("$260,000");

    const groups = cashAwareDrawGroups(milestones, cashAvailabilityCents);

    expect(groups.map((group) => group.totalBudgetCents)).toEqual([
      9_250_000, 18_500_000, 24_050_000, 42_500_000, 12_900_000,
    ]);
    expect(projectedPeakExposureCents(milestones, cashAvailabilityCents)).toBe(
      42_500_000
    );
    expect(groups.filter((group) => group.isOverCashLimit)).toHaveLength(1);
  });
});
