import { describe, expect, test } from "vitest";

import {
  allocateBudgetCents,
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

  test("parses currency and projects unreimbursed exposure warnings", () => {
    const milestones = [
      { budgetCents: parseCurrencyToCents("$240,000"), included: true },
      { budgetCents: parseCurrencyToCents("$420,000"), included: true },
      { budgetCents: parseCurrencyToCents("$285,000"), included: true },
    ];

    expect(projectedPeakExposureCents(milestones)).toBe(51_975_000);
  });
});
