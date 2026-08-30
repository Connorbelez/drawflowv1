import { describe, expect, test } from "vitest";
import {
  productionMilestoneIsBehindSchedule,
  productionSubmilestoneIsBehindSchedule,
} from "./roster_projection_helpers";

describe("production schedule health projection", () => {
  const milestone = {
    dayEnd: 10,
    dayStart: 3,
    key: "foundation",
    status: "planned",
  } as any;

  const missedStartSubmilestone = {
    actualStartedAt: undefined,
    durationDays: 4,
    key: "demo-ex",
    milestoneKey: "foundation",
    order: 1,
    startDay: 3,
    status: "planned",
  } as any;

  test("marks a Sub-milestone behind when its planned start passed without work starting", () => {
    expect(
      productionSubmilestoneIsBehindSchedule(
        missedStartSubmilestone,
        milestone,
        4,
      ),
    ).toBe(true);
  });

  test("rolls one behind-schedule Sub-milestone into its Milestone", () => {
    expect(
      productionMilestoneIsBehindSchedule(milestone, 4, [
        missedStartSubmilestone,
      ]),
    ).toBe(true);
  });
});
