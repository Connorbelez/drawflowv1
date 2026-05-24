import { describe, expect, test } from "vitest";

import { generatedProposalCardToKanbanCard } from "./index";

describe("backoffice generated proposal cards", () => {
  test("formats generated timeline proposal budgets in the same dollar units used by the demo timeline", () => {
    expect(
      generatedProposalCardToKanbanCard({
        _id: "card-1",
        column: "draft",
        href: "/demo/timeline/plan-1",
        subtitle: "Hamilton, ON · 7 milestones",
        title: "Single Family Full Build",
        totalBudgetCents: 1_250_000,
      }).loanAmount,
    ).toBe("$1,250,000");
  });
});
