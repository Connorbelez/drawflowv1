// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test } from "vitest";

import { TimelineMilestoneContractorList } from "./TimelineMilestoneContractorList.tsx";

afterEach(() => {
  cleanup();
});

describe("TimelineMilestoneContractorList", () => {
  test("renders assigned contractors for the selected milestone", () => {
    render(
      <TimelineMilestoneContractorList
        milestoneKey="foundation"
        planning={{
          milestoneAssignments: [
            {
              _id: "assign-1",
              contractorId: "contractor-1",
              contractorName: "Northstar Masonry",
              milestoneKey: "foundation",
              milestoneName: "Foundation",
              role: "Concrete lead",
              status: "planned",
              submilestoneKey: "pour",
              submilestoneName: "Forms and pour",
            },
            {
              _id: "assign-2",
              contractorId: "contractor-2",
              contractorName: "Other Trade Co.",
              milestoneKey: "framing",
              milestoneName: "Framing",
              role: "Framing",
              status: "planned",
            },
          ],
          proposalContractors: [
            {
              _id: "proposal-contractor-1",
              contractorId: "contractor-1",
              name: "Northstar Masonry",
              role: "Concrete lead",
              status: "active",
              trades: ["masonry", "concrete"],
            },
          ],
        }}
      />,
    );

    expect(screen.getByText("Northstar Masonry")).toBeTruthy();
    expect(screen.getByText("Concrete lead · Forms and pour")).toBeTruthy();
    expect(screen.getByText("masonry · concrete")).toBeTruthy();
    expect(screen.queryByText("Other Trade Co.")).toBeNull();
  });

  test("renders an empty state when no contractors are assigned", () => {
    render(
      <TimelineMilestoneContractorList
        milestoneKey="foundation"
        planning={{ milestoneAssignments: [] }}
      />,
    );

    expect(
      screen.getByTestId("timeline-milestone-contractor-empty"),
    ).toBeTruthy();
  });
});
