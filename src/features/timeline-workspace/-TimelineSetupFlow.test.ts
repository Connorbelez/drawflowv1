import { describe, expect, test } from "vitest";
import {
  buildPlanningPayloadFromSetupRows,
  buildTimelineItemsFromSetupRows,
  DEFAULT_SETUP_ADDRESS,
  parsePercentTextToBps,
  resolveTimelineSetupAddress,
  type TimelineSetupMilestoneRow,
} from "./-TimelineSetupFlow";

const row = {
  budgetText: "$100,000",
  dependencyKeys: [],
  durationDays: 10,
  durationText: "10",
  excluded: false,
  icon: "foundation",
  key: "foundation",
  name: "Foundation",
  order: 1,
  percentageBps: 10_000,
  subMilestoneDetails: [],
  subMilestones: ["Excavation"],
  type: "foundation",
} satisfies TimelineSetupMilestoneRow;

describe("resolveTimelineSetupAddress", () => {
  test("trims whitespace and falls back to the default when blank", () => {
    expect(resolveTimelineSetupAddress("  Toronto, ON  ")).toBe("Toronto, ON");
    expect(resolveTimelineSetupAddress("   ")).toBe(DEFAULT_SETUP_ADDRESS);
    expect(resolveTimelineSetupAddress("")).toBe(DEFAULT_SETUP_ADDRESS);
  });
});

describe("buildPlanningPayloadFromSetupRows", () => {
  test("maps optional contractor and cost item planning to milestone keys", () => {
    const planningRow = {
      ...row,
      contractorAssignments: [
        {
          contractorId: "contractor-1",
          contractorName: "Apex Concrete Works",
          estimatedCostCents: 25_000_00,
          estimatedHours: 18,
          id: "assignment-1",
          role: "Foundation",
          subMilestoneIds: ["forms", "stale-submilestone"],
        },
        {
          contractorName: "   ",
          id: "assignment-empty",
          role: "Foundation",
          subMilestoneIds: [],
        },
      ],
      costItems: [
        {
          costCents: 8_000_00,
          description: "<p>Concrete mix</p>",
          id: "cost-item-1",
          itemType: "material",
          quantity: 2.5,
          relevantSubMilestoneIds: ["forms", "removed-sub"],
          supplier: "Apex Supply",
          title: "Foundation material package",
        },
        {
          costCents: 0,
          id: "cost-item-invalid",
          itemType: "equipment",
          quantity: 1,
          relevantSubMilestoneIds: [],
          title: "Skipped zero cost",
        },
      ],
      subMilestoneDetails: [
        {
          budgetText: "$20,000",
          description: "Forms and pour",
          durationText: "2",
          id: "forms",
          name: "Forms and pour",
        },
      ],
      subMilestones: ["Forms and pour"],
    } satisfies TimelineSetupMilestoneRow;

    expect(buildPlanningPayloadFromSetupRows([planningRow])).toEqual({
      contractorAssignments: [
        {
          contractorId: "contractor-1",
          contractorName: "Apex Concrete Works",
          estimatedCostCents: 25_000_00,
          estimatedHours: 18,
          milestoneKey: "foundation",
          role: "Foundation",
          submilestoneKeys: ["forms"],
        },
      ],
      costItems: [
        {
          costCents: 8_000_00,
          description: "<p>Concrete mix</p>",
          itemType: "material",
          milestoneKey: "foundation",
          quantity: 2.5,
          relevantSubmilestoneKeys: ["forms"],
          supplier: "Apex Supply",
          title: "Foundation material package",
        },
      ],
    });
  });
});

describe("TimelineSetupFlow reimbursement percentage", () => {
  test("parses co-pay percentages into basis points", () => {
    expect(parsePercentTextToBps("20%")).toBe(2_000);
    expect(parsePercentTextToBps("10")).toBe(1_000);
  });

  test("uses 20% co-pay fallback and custom percentages for draw availability", () => {
    expect(buildTimelineItemsFromSetupRows([row])[0]?.data).toMatchObject({
      amount: 100_000,
      drawAvailabilityAmount: 80_000,
    });
    expect(buildTimelineItemsFromSetupRows([row], 1_000)[0]?.data).toMatchObject(
      {
        amount: 100_000,
        drawAvailabilityAmount: 90_000,
      },
    );
  });
});
