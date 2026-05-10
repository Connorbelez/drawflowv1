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
      { percentageBps: 1_000 },
      { percentageBps: 1_300 },
      { percentageBps: 2_300 },
      { percentageBps: 1_500 },
      { percentageBps: 900 },
      { percentageBps: 1_400 },
      { percentageBps: 400 },
      { percentageBps: 400 },
      { percentageBps: 300 },
    ];
    const originalBudgetCents = 185_000_001;
    const allocations = allocateBudgetCents(originalBudgetCents, fullBuildPresets);

    expect(allocations).toHaveLength(10);
    expect(allocations.reduce((sum, cents) => sum + cents, 0)).toBe(
      originalBudgetCents
    );
  });

  test("tracks budget drift from included milestone edits", () => {
    const milestones = [
      { budgetCents: 95_000_00, included: true },
      { budgetCents: 185_000_00, included: true },
      { budgetCents: 42_000_00, included: false },
    ];

    expect(currentBudgetCents(milestones)).toBe(280_000_00);
  });

  test("parses currency and projects unreimbursed exposure warnings", () => {
    const milestones = [
      { budgetCents: parseCurrencyToCents("$240,000"), included: true },
      { budgetCents: parseCurrencyToCents("$420,000"), included: true },
      { budgetCents: parseCurrencyToCents("$285,000"), included: true },
    ];

    expect(projectedPeakExposureCents(milestones)).toBe(519_750_00);
  });
});
