import { describe, expect, test } from "vitest";

import {
  productionProposalDetailToWorksheetRows,
  worksheetRowsToGanttMilestoneDrafts,
} from "./productionMilestoneWorksheetAdapter.ts";
import { productionProposalDetailToDraftMilestones } from "./productionMilestoneWorksheetAdapter.ts";

describe("productionMilestoneWorksheetAdapter", () => {
  test("maps proposal contractor planning into milestone worksheet rows", () => {
    const detail = {
      costItems: [
        {
          _id: "cost-item-1",
          budgetSubmilestoneKey: "dc-ed",
          budgetTreatment: "maintain" as const,
          costCents: 5_000_00,
          itemType: "material" as const,
          milestoneKey: "four-plex-draw-01",
          quantity: 1,
          relevantSubmilestoneKeys: ["dc-ed", "removed"],
          title: "Concrete package",
        },
      ],
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
    expect(row?.costItems).toEqual([
      expect.objectContaining({
        budgetSubmilestoneKey: "dc-ed",
        budgetTreatment: "maintain",
        id: "cost-item-1",
        relevantSubMilestoneIds: ["dc-ed"],
      }),
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

  test("maps worksheet schedule date edits into milestone and submilestone offsets", () => {
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
        proposedStartDate: "2026-06-01",
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
          startDay: 0,
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

    const [milestone] = worksheetRowsToGanttMilestoneDrafts(
      rows.map((row) => ({
        ...row,
        durationDays: 12,
        durationText: "12",
        startDay: -3,
        subMilestoneDetails: row.subMilestoneDetails.map((submilestone) => ({
          ...submilestone,
          durationText: "5",
          startDay: -2,
        })),
      })),
      scheduleByKey
    );

    expect(milestone).toEqual(
      expect.objectContaining({
        dayEnd: 9,
        dayStart: -3,
        durationDays: 12,
        key: "foundation",
      })
    );
    expect(milestone?.submilestones[0]).toEqual(
      expect.objectContaining({
        durationDays: 5,
        key: "forms",
        startDay: -2,
      })
    );
  });

  test("preserves canonical Scope and Field Guidance through worksheet drafts", () => {
    const fieldGuidance = {
      cameraAnglesTiptapJson: '{"type":"doc","content":[{"type":"paragraph"}]}',
      whatToVerifyTiptapJson:
        '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Verify footing depth."}]}]}',
    };
    const scopeOfWorkTiptapJson =
      '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Install the issued footing package."}]}]}';
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
          fieldGuidance,
          key: "forms",
          milestoneKey: "foundation",
          name: "Forms and pour",
          order: 1,
          scopeOfWorkTiptapJson,
        },
      ],
    };

    const [row] = productionProposalDetailToWorksheetRows(detail);
    expect(row?.subMilestoneDetails[0]).toEqual(
      expect.objectContaining({
        description: "",
        fieldGuidance,
        id: "forms",
        scopeOfWorkTiptapJson,
      })
    );

    const scheduleByKey = new Map(
      productionProposalDetailToDraftMilestones(detail).map((milestone) => [
        milestone.key,
        milestone,
      ])
    );
    const [draft] = worksheetRowsToGanttMilestoneDrafts(
      [row!],
      scheduleByKey
    );
    expect(draft?.submilestones[0]).toEqual(
      expect.objectContaining({
        fieldGuidance,
        scopeOfWorkTiptapJson,
      })
    );
    expect(draft?.submilestones[0]).not.toHaveProperty("description");
  });

  test("preserves the raw proposal Sub-milestone identity beside the business key", () => {
    const [row] = productionProposalDetailToWorksheetRows({
      milestones: [
        {
          budgetCents: 10_000,
          dayEnd: 1,
          dayStart: 0,
          key: "foundation",
          name: "Foundation",
          order: 1,
        },
      ],
      proposal: { status: "submitted", totalBudgetCents: 10_000 },
      submilestones: [
        {
          _id: "j97abc123",
          key: "dc-ed",
          milestoneKey: "foundation",
          name: "DC/ED",
          order: 1,
        },
      ],
    });

    expect(row?.subMilestoneDetails[0]).toEqual(
      expect.objectContaining({
        id: "dc-ed",
        proposalSubmilestoneId: "j97abc123",
      })
    );
  });
});
