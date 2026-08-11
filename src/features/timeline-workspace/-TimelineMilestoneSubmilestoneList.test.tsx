// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";

import { TimelineMilestoneSubmilestoneList } from "./-TimelineMilestoneSubmilestoneList";

afterEach(() => cleanup());

describe("TimelineMilestoneSubmilestoneList", () => {
  test("opens a canonical child target from a child row when an id is available", () => {
    const onOpenSubmilestone = vi.fn();

    render(
      <TimelineMilestoneSubmilestoneList
        milestoneKey="foundation"
        onOpenSubmilestone={onOpenSubmilestone}
        submilestones={[
          {
            canonicalId: "sub-01",
            key: "excavation",
            name: "Excavation",
            order: 1,
          },
        ]}
      />,
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Open Sub-milestone Excavation" }),
    );

    expect(onOpenSubmilestone).toHaveBeenCalledWith("sub-01");
  });
});
