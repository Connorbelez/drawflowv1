// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";

import { ContractorPlanningPanel } from "./ContractorPlanningPanel";

afterEach(() => cleanup());

const planning = {
  availableContractors: [
    {
      _id: "contractor_framing",
      city: "Hamilton, ON",
      defaultPayRateCents: 8_900,
      defaultPayRateUnit: "hour" as const,
      name: "Ironline Framing",
      trades: ["framing"],
    },
  ],
  conflicts: [],
  equipmentSchedule: [
    {
      contractorName: "Northstar Masonry",
      dayEnd: 42,
      dayStart: 28,
      equipmentKey: "telehandler",
      name: "Telehandler",
      quantity: 1,
    },
  ],
  materialSignals: [
    { key: "brick", label: "Brick siding" },
    { key: "masonry", label: "Masonry" },
  ],
  milestoneAssignments: [],
  proposalContractors: [
    {
      _id: "proposal_contractor_masonry",
      contractorId: "contractor_masonry",
      name: "Northstar Masonry",
      role: "Masonry lead",
      status: "active",
      trades: ["masonry", "brick"],
    },
  ],
  recommendations: [
    {
      contractorId: "contractor_masonry",
      matchedSignals: [{ key: "brick", label: "Brick siding" }],
      name: "Northstar Masonry",
      score: 45,
      trades: ["masonry"],
    },
  ],
  utilization: [
    {
      assignedDays: 12,
      contractorId: "contractor_masonry",
      name: "Northstar Masonry",
      scheduledHours: 96,
      utilizationPercent: 63,
      weeklyWindowHours: 38,
    },
  ],
};

const milestones = [
  {
    milestoneKey: "exterior",
    name: "Exterior envelope",
    submilestoneSnapshot: [{ key: "brick-siding", name: "Brick siding" }],
  },
  {
    milestoneKey: "framing",
    name: "Framing",
    submilestoneSnapshot: [],
  },
];

describe("ContractorPlanningPanel", () => {
  test("renders proposal contractor controls and permit-fit intelligence", () => {
    render(
      <ContractorPlanningPanel
        milestones={milestones}
        onAssignToMilestone={vi.fn()}
        onAttachExisting={vi.fn()}
        onCreateAndAttach={vi.fn()}
        planning={planning}
      />,
    );

    expect(screen.getByTestId("proposal-contractor-planning")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Add contractor" })).toBeTruthy();
    expect(
      screen.getByTestId("proposal-milestone-assign-contractor-exterior"),
    ).toBeTruthy();
    expect(screen.getAllByText("Brick siding").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Northstar Masonry").length).toBeGreaterThan(0);
    expect(screen.getByText("No contractor allocation conflicts detected.")).toBeTruthy();
  });

  test("submits milestone contractor assignment cost data", async () => {
    const onAssignToMilestone = vi.fn().mockResolvedValue(undefined);
    render(
      <ContractorPlanningPanel
        milestones={milestones}
        onAssignToMilestone={onAssignToMilestone}
        planning={planning}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Select Northstar Masonry" }));
    fireEvent.click(
      screen.getByTestId("proposal-milestone-assign-contractor-exterior"),
    );

    await screen.findByTestId("assign-contractor-dialog");
    const hoursInput = screen.getByLabelText("Estimated hours");
    fireEvent.change(hoursInput, { target: { value: "72" } });
    fireEvent.change(screen.getByLabelText("Estimated cost"), {
      target: { value: "6840" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Confirm assignment" }));

    await waitFor(() =>
      expect(onAssignToMilestone).toHaveBeenCalledWith({
        assignmentCost: {
          estimatedCostCents: 684_000,
          estimatedHours: 72,
        },
        contractorId: "contractor_masonry",
        milestoneKey: "exterior",
        role: "Masonry lead",
        submilestoneKeys: ["brick-siding"],
      }),
    );
  });
});
