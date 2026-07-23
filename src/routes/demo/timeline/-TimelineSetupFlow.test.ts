import { describe, expect, test } from "vitest";
import {
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

describe("TimelineSetupFlow loan percentage", () => {
  test("parses percentages into basis points", () => {
    expect(parsePercentTextToBps("20%")).toBe(2_000);
    expect(parsePercentTextToBps("10")).toBe(1_000);
  });

  test("uses an 80% loan percentage fallback for draw availability", () => {
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
