import { describe, expect, test } from "vitest";
import * as XLSX from "xlsx";

import {
  budgetWorkbookProposalDraftSchema,
  parseBudgetWorkbook,
} from "./budget-workbook-schema";

describe("budget workbook proposal import", () => {
  test("hydrates blank merged-style milestone rows into exact submilestone breakdowns", () => {
    const workbook = XLSX.utils.book_new();
    const worksheet = XLSX.utils.aoa_to_sheet([
      ["DrawFlow Proposal Budget Import v1"],
      [],
      ["Build Name", "25 Luverne"],
      ["Total Drawable Amount", 100_000],
      ["Total Budget", 125_000],
      ["Total Sqft", 2500],
      ["Cost per Total Sqft", 50],
      [],
      [
        "Milestone Order",
        "Milestone Name",
        "Milestone Drawable Amount",
        "Category",
        "Budget",
        "% of Total",
        "$ / Total Sqft",
        "Drawable Amount",
      ],
      [1, "Draw/Milestone 1", 60_000, "DC/ED", 25_000, "20.0%", 10, 20_000],
      ["", "", "", "Permits", 37_500, "30.0%", 15, 30_000],
      ["", "", "", "Foundation", 12_500, "10.0%", 5, 10_000],
      [2, "Draw/Milestone 2", 40_000, "Framing", 50_000, "40.0%", 20, 40_000],
    ]);
    XLSX.utils.book_append_sheet(workbook, worksheet, "Budget Import");

    const draft = parseBudgetWorkbook(workbook, "fixture.xlsx");

    expect(draft).toMatchObject({
      buildName: "25 Luverne",
      importVersion: "drawflow-budget-workbook-v1",
      sourceName: "fixture.xlsx",
      totalBudget: 125_000,
      totalDrawableAmount: 100_000,
      totalSqft: 2500,
      milestones: [
        {
          budgetAmount: 75_000,
          drawableAmount: 60_000,
          milestoneKey: "draw-milestone-1",
          name: "Draw/Milestone 1",
          order: 1,
          submilestones: [
            {
              budgetAmount: 25_000,
              budgetLineKey: "draw-milestone-1:dc-ed",
              drawableAmount: 20_000,
              name: "DC/ED",
              percentageBps: 2000,
            },
            {
              budgetAmount: 37_500,
              budgetLineKey: "draw-milestone-1:permits",
              drawableAmount: 30_000,
              name: "Permits",
              percentageBps: 3000,
            },
            {
              budgetAmount: 12_500,
              budgetLineKey: "draw-milestone-1:foundation",
              drawableAmount: 10_000,
              name: "Foundation",
              percentageBps: 1000,
            },
          ],
        },
        {
          budgetAmount: 50_000,
          drawableAmount: 40_000,
          milestoneKey: "draw-milestone-2",
          name: "Draw/Milestone 2",
          order: 2,
        },
      ],
    });
  });

  test("rejects workbook drafts when milestone drawable totals do not match lines", () => {
    const result = budgetWorkbookProposalDraftSchema.safeParse({
      buildName: "25 Luverne",
      costPerTotalSqft: 50,
      importVersion: "drawflow-budget-workbook-v1",
      totalBudget: 100_000,
      totalDrawableAmount: 80_000,
      totalSqft: 2000,
      milestones: [
        {
          budgetAmount: 100_000,
          drawableAmount: 80_001,
          milestoneKey: "draw-1",
          name: "Draw 1",
          order: 1,
          submilestones: [
            {
              budgetAmount: 100_000,
              budgetLineKey: "draw-1:foundation",
              costPerTotalSqft: 50,
              drawableAmount: 80_000,
              name: "Foundation",
              percentageBps: 10_000,
            },
          ],
        },
      ],
    });

    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toContain(
      "drawable total $80,000.00 does not match milestone drawable amount $80,001.00",
    );
  });
});
