// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, test, vi } from "vitest";
import {
  TimelineMilestoneWorksheetTable,
  type TimelineMilestoneWorksheetRow,
} from "./-TimelineMilestoneWorksheetTable.tsx";

afterEach(() => cleanup());

const cascadeToggleRows: TimelineMilestoneWorksheetRow[] = [
  {
    budgetText: "$100,000",
    dependencyKeys: [],
    durationDays: 7,
    durationText: "7",
    excluded: false,
    icon: "foundation",
    key: "milestone-1",
    name: "Milestone 1",
    order: 0,
    percentageBps: 5000,
    percentageText: "50.00%",
    subMilestoneDetails: [],
    subMilestones: [],
    type: "foundation",
  },
  {
    budgetText: "$100,000",
    dependencyKeys: ["milestone-1"],
    durationDays: 7,
    durationText: "7",
    excluded: false,
    icon: "framing",
    key: "milestone-2",
    name: "Milestone 2",
    order: 1,
    percentageBps: 5000,
    percentageText: "50.00%",
    subMilestoneDetails: [],
    subMilestones: [],
    type: "framing",
  },
];

function ControlledCascadeWorksheet() {
  const [cascadeEnabled, setCascadeEnabled] = useState(false);
  const [rows, setRows] = useState(cascadeToggleRows);
  return (
    <TimelineMilestoneWorksheetTable
      cascadeBudgetEdits={cascadeEnabled}
      cashText="$25,000"
      mode="setup"
      onCascadeBudgetEditsChange={setCascadeEnabled}
      onComplete={vi.fn()}
      onRowsChange={setRows}
      rows={rows}
      targetBudgetCents={200_000_00}
      templateTitle="Cascade toggle state fixture"
    />
  );
}

describe("TimelineMilestoneWorksheetTable cascade toggle state feedback", () => {
  test("displays the current cascade state and updates it on toggle", () => {
    render(<ControlledCascadeWorksheet />);
    const toggle = screen.getByTestId("timeline-setup-budget-cascade-toggle");

    expect(toggle.textContent).toContain("Cascade: Off");
    expect(toggle.getAttribute("aria-pressed")).toBe("false");
    expect(toggle.hasAttribute("data-pressed")).toBe(false);

    fireEvent.click(toggle);

    expect(toggle.textContent).toContain("Cascade: On");
    expect(toggle.getAttribute("aria-pressed")).toBe("true");
    expect(toggle.hasAttribute("data-pressed")).toBe(true);

    fireEvent.click(toggle);

    expect(toggle.textContent).toContain("Cascade: Off");
    expect(toggle.getAttribute("aria-pressed")).toBe("false");
    expect(toggle.hasAttribute("data-pressed")).toBe(false);
  });
});
