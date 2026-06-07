import { describe, expect, test } from "vitest";

import {
  productionProposalDetailToWorksheetRows,
  worksheetRowsToGanttMilestoneDrafts,
} from "./productionMilestoneWorksheetAdapter.ts";
import { productionProposalDetailToDraftMilestones } from "./productionMilestoneWorksheetAdapter.ts";

describe("productionMilestoneWorksheetAdapter", () => {
  test("maps proposal contractor planning into milestone worksheet rows", () => {
    const detail = {
      milestones: [
        {
          budgetCents: 50_000_00,
          dayEnd: 10,
          dayStart: 0,
          dependencyKeys: [],
          durationDays: 10,
          key: "four-plex-draw-01",
          name: "Permits, demo & foundation",
          order: 1,
        },
      ],
      proposal: {
        status: "draft",
        totalBudgetCents: 50_000_00,
      },
      submilestones: [
        {
          key: "dc-ed",
          milestoneKey: "four-plex-draw-01",
          name: "DC/ED",
          order: 1,
        },
        {
          key: "permits",
          milestoneKey: "four-plex-draw-01",
          name: "PERMITS",
          order: 2,
        },
      ],
    };

    const [row] = productionProposalDetailToWorksheetRows(detail, {
      milestoneAssignments: [
        {
          _id: "assignment-1",
          contractorId: "contractor-1",
          contractorName: "Apex Concrete Works",
          estimatedCostCents: 25_000_00,
          estimatedHours: 18,
          milestoneKey: "four-plex-draw-01",
          milestoneName: "Permits, demo & foundation",
          role: "Foundation contractor",
          status: "planned",
          submilestoneKey: "dc-ed",
          submilestoneName: "DC/ED",
        },
        {
          _id: "assignment-2",
          contractorId: "contractor-1",
          contractorName: "Apex Concrete Works",
          estimatedCostCents: 25_000_00,
          estimatedHours: 18,
          milestoneKey: "four-plex-draw-01",
          milestoneName: "Permits, demo & foundation",
          role: "Foundation contractor",
          status: "planned",
          submilestoneKey: "permits",
          submilestoneName: "PERMITS",
        },
      ],
      proposalContractors: [
        {
          _id: "proposal-contractor-1",
          contractorId: "contractor-1",
          name: "Apex Concrete Works",
          role: "Foundation contractor",
          status: "active",
          trades: ["foundation"],
        },
      ],
    });

    expect(row?.contractorAssignments).toEqual([
      {
        contractorId: "contractor-1",
        contractorName: "Apex Concrete Works",
        estimatedCostCents: 25_000_00,
        estimatedHours: 18,
        id: "assignment-1",
        role: "Foundation contractor",
        subMilestoneIds: ["dc-ed", "permits"],
      },
    ]);
  });

  test("maps submilestone worksheet edits into gantt milestone drafts", () => {
    const detail = {
      milestones: [
        {
          budgetCents: 50_000_00,
          dayEnd: 10,
          dayStart: 0,
          dependencyKeys: [],
          durationDays: 10,
          key: "foundation",
          name: "Foundation",
          order: 1,
        },
      ],
      proposal: {
        status: "draft",
        totalBudgetCents: 50_000_00,
      },
      submilestones: [
        {
          budgetCents: 12_500_00,
          durationDays: 2,
          key: "forms",
          milestoneKey: "foundation",
          name: "Forms and pour",
          order: 1,
        },
      ],
    };

    const rows = productionProposalDetailToWorksheetRows(detail);
    const scheduleByKey = new Map(
      productionProposalDetailToDraftMilestones(detail).map((milestone) => [
        milestone.key,
        milestone,
      ])
    );

    const nextRows = rows.map((row) =>
      row.key === "foundation"
        ? {
            ...row,
            subMilestoneDetails: row.subMilestoneDetails.map((submilestone) =>
              submilestone.id === "forms"
                ? {
                    ...submilestone,
                    budgetText: "$15,000",
                    durationText: "4",
                  }
                : submilestone
            ),
          }
        : row
    );

    const [milestone] = worksheetRowsToGanttMilestoneDrafts(
      nextRows,
      scheduleByKey
    );

    expect(milestone?.submilestones).toEqual([
      expect.objectContaining({
        budgetCents: 1_500_000,
        durationDays: 4,
        key: "forms",
        name: "Forms and pour",
      }),
    ]);
  });
});
