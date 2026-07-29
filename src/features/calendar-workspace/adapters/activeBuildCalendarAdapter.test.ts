import { describe, expect, test, vi } from "vitest";

import {
  buildActiveBuildCalendarActions,
  buildActiveBuildCalendarWorkspaceFromDetail,
} from "./activeBuildCalendarAdapter.ts";

describe("active-build calendar milestone starts", () => {
  test("delegates the exact milestone to the shared start confirmation controller", async () => {
    const startMilestoneWork = vi.fn().mockResolvedValue(undefined);
    const workspace = buildActiveBuildCalendarWorkspaceFromDetail({
      build: {
        _id: "build-01",
        buildName: "Hamilton Build",
        startDate: "2026-05-01",
      },
      draws: [],
      milestones: [
        {
          _id: "milestone-01",
          dayEnd: 10,
          dayStart: 0,
          key: "foundation",
          name: "Foundation",
          order: 1,
          status: "planned",
        },
      ],
      submilestones: [],
    });
    const event = workspace.events.find(
      (candidate) => candidate.milestoneKey === "foundation"
    );
    const action = buildActiveBuildCalendarActions({
      startMilestoneWork,
    }).find((candidate) => candidate.id === "start-milestone-work");

    expect(event).toBeTruthy();
    expect(action?.availability).toEqual({ state: "enabled" });
    await action?.onSelect({
      event,
      source: workspace.source,
      surface: "activeBuild",
      timeframe: "week",
    });
    expect(startMilestoneWork).toHaveBeenCalledWith("foundation");
  });
});
