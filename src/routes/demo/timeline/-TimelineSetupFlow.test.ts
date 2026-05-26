import { describe, expect, test } from "vitest";
import {
  buildTimelineItemsFromSetupRows,
  parsePercentTextToBps,
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
