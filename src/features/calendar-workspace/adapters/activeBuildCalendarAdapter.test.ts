import { describe, expect, test, vi } from "vitest";

import {
  buildActiveBuildCalendarActions,
  buildActiveBuildCalendarWorkspaceFromDetail,
} from "./activeBuildCalendarAdapter.ts";

describe("active-build calendar milestone starts", () => {
  test("emits canonical child entity identity for Sub-milestone events", () => {
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
      submilestones: [
        {
          _id: "submilestone-01",
          key: "footings",
          milestoneKey: "foundation",
          name: "Footings",
          order: 1,
          status: "planned",
        },
      ],
    });

    const event = workspace.events.find(
      (candidate) => candidate.kind === "submilestone",
    );

    expect(event?.entity).toEqual({
      id: "submilestone-01",
      type: "submilestone",
    });
  });

  test("does not expose a noncanonical child event without a stable id", () => {
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
      submilestones: [
        {
          key: "footings",
          milestoneKey: "foundation",
          name: "Footings",
          order: 1,
          status: "planned",
        },
      ],
    });

    expect(
      workspace.events.some((candidate) => candidate.kind === "submilestone"),
    ).toBe(false);
  });

  test("keeps canonical child event ids unique when display keys repeat", () => {
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
        {
          _id: "milestone-02",
          dayEnd: 20,
          dayStart: 10,
          key: "addition",
          name: "Addition",
          order: 2,
          status: "planned",
        },
      ],
      submilestones: [
        {
          _id: "submilestone-01",
          key: "footings",
          milestoneKey: "foundation",
          name: "Footings",
          order: 1,
          status: "planned",
        },
        {
          _id: "submilestone-02",
          key: "footings",
          milestoneKey: "addition",
          name: "Footings",
          order: 1,
          status: "planned",
        },
      ],
    });

    const childEvents = workspace.events.filter(
      (candidate) => candidate.kind === "submilestone",
    );

    expect(childEvents.map((event) => event.id)).toEqual([
      "activeBuild:submilestone:submilestone-01",
      "activeBuild:submilestone:submilestone-02",
    ]);
    expect(new Set(childEvents.map((event) => event.id)).size).toBe(2);
  });

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
