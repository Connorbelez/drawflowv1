// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, test, vi } from "vitest";

import {
  TimelineMilestoneWorksheetTable,
  type TimelineMilestoneWorksheetRow,
} from "./-TimelineMilestoneWorksheetTable.tsx";

afterEach(() => cleanup());

const worksheetRows: TimelineMilestoneWorksheetRow[] = [
  {
    budgetText: "$125,000",
    dependencyKeys: [],
    durationDays: 14,
    durationText: "14",
    excluded: false,
    icon: "foundation",
    key: "site-prep-foundation",
    name: "Site prep & foundation",
    order: 0,
    percentageBps: 5000,
    percentageText: "50.00%",
    subMilestoneDetails: [
      {
        budgetText: "$125,000",
        description: "Clear the site and pour foundation",
        durationText: "14",
        id: "site-prep-foundation-sub-1",
        name: "Foundation scope",
        percentageBps: 5000,
        percentageText: "50.00%",
      },
    ],
    subMilestones: ["Foundation scope"],
    type: "sitework",
  },
  {
    budgetText: "$75,000",
    dependencyKeys: ["site-prep-foundation"],
    durationDays: 10,
    durationText: "10",
    excluded: false,
    icon: "framing",
    key: "framing",
    name: "Framing",
    order: 1,
    percentageBps: 5000,
    percentageText: "50.00%",
    subMilestoneDetails: [
      {
        budgetText: "$75,000",
        description: "Frame walls and roof",
        durationText: "10",
        id: "framing-sub-1",
        name: "Frame shell",
        percentageBps: 5000,
        percentageText: "50.00%",
      },
    ],
    subMilestones: ["Frame shell"],
  type: "framing",
  },
];

test("exposes the expanded milestone icon set in the settings selector", () => {
  render(<ControlledWorksheet mode="settings" />);

  const iconSelect = screen.getByTestId(
    "timeline-setup-row-icon-select-site-prep-foundation",
  );

  expect(
    Array.from(iconSelect.querySelectorAll("option")).map(
      (option) => option.value,
    ),
  ).toEqual(
    expect.arrayContaining(["foundation", "kitchen", "plumbing", "roofing"]),
  );
});

const cascadeRows: TimelineMilestoneWorksheetRow[] = [
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
    percentageBps: 2000,
    percentageText: "20.00%",
    subMilestoneDetails: [],
    subMilestones: [],
    type: "foundation",
  },
  {
    budgetText: "$200,000",
    dependencyKeys: ["milestone-1"],
    durationDays: 7,
    durationText: "7",
    excluded: false,
    icon: "framing",
    key: "milestone-2",
    name: "Milestone 2",
    order: 1,
    percentageBps: 4000,
    percentageText: "40.00%",
    subMilestoneDetails: [],
    subMilestones: [],
    type: "framing",
  },
  {
    budgetText: "$200,000",
    dependencyKeys: ["milestone-2"],
    durationDays: 7,
    durationText: "7",
    excluded: false,
    icon: "drywall",
    key: "milestone-3",
    name: "Milestone 3",
    order: 2,
    percentageBps: 4000,
    percentageText: "40.00%",
    subMilestoneDetails: [],
    subMilestones: [],
    type: "drywall",
  },
];

function ControlledWorksheet({
  cascadeBudgetEdits = false,
  initialRows = worksheetRows,
  mode = "setup",
  onRowsChange = vi.fn(),
  targetBudgetCents = 200_000_00,
}: {
  cascadeBudgetEdits?: boolean;
  initialRows?: TimelineMilestoneWorksheetRow[];
  mode?: "settings" | "setup";
  onRowsChange?: (rows: TimelineMilestoneWorksheetRow[]) => void;
  targetBudgetCents?: number;
}) {
  const [rows, setRows] = useState(initialRows);
  const [cascadeEnabled, setCascadeEnabled] = useState(cascadeBudgetEdits);

  return (
    <TimelineMilestoneWorksheetTable
      cascadeBudgetEdits={cascadeEnabled}
      cashText="$25,000"
      mode={mode}
      onCascadeBudgetEditsChange={setCascadeEnabled}
      onRowsChange={(nextRows) => {
        setRows(nextRows);
        onRowsChange(nextRows);
      }}
      rows={rows}
      targetBudgetCents={targetBudgetCents}
      templateTitle="Regression fixture"
    />
  );
}

describe("TimelineMilestoneWorksheetTable", () => {
  test("keeps focus in blueprint inputs while controlled values update", () => {
    const onRowsChange = vi.fn();
    render(<ControlledWorksheet onRowsChange={onRowsChange} />);

    const budgetInput = screen.getByTestId(
      "timeline-setup-row-budget-site-prep-foundation"
    );
    budgetInput.focus();

    fireEvent.change(budgetInput, { target: { value: "$125,0001" } });

    expect(document.activeElement).toBe(budgetInput);
    expect(onRowsChange).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          budgetText: "$125,0001",
          key: "site-prep-foundation",
        }),
      ])
    );
  });

  test("moves between editable cells with keyboard shortcuts", () => {
    render(<ControlledWorksheet />);

    const budgetInput = screen.getByTestId(
      "timeline-setup-row-budget-site-prep-foundation"
    );
    const durationInput = screen.getByTestId(
      "timeline-setup-row-duration-site-prep-foundation"
    );
    budgetInput.focus();

    fireEvent.keyDown(budgetInput, { key: "Enter" });
    expect(document.activeElement).toBe(durationInput);

    fireEvent.keyDown(durationInput, { key: "ArrowUp" });
    expect(document.activeElement).toBe(budgetInput);
  });

  test("adds a typed custom sub-milestone from the bank controls", () => {
    const onRowsChange = vi.fn();
    render(<ControlledWorksheet onRowsChange={onRowsChange} />);

    fireEvent.change(
      screen.getByTestId(
        "timeline-setup-submilestone-bank-input-site-prep-foundation"
      ),
      { target: { value: "Electrical rough-in" } }
    );
    fireEvent.click(
      screen.getByRole("button", {
        name: /add custom sub-milestone electrical rough-in/i,
      })
    );

    expect(onRowsChange).toHaveBeenLastCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          key: "site-prep-foundation",
          subMilestoneDetails: expect.arrayContaining([
            expect.objectContaining({
              name: "Electrical rough-in",
            }),
          ]),
        }),
      ])
    );
  });

  test("edits milestone field guidance from expanded worksheet rows", () => {
    const onRowsChange = vi.fn();
    render(<ControlledWorksheet onRowsChange={onRowsChange} />);

    fireEvent.change(
      screen.getByTestId(
        "timeline-settings-guidance-verify-site-prep-foundation"
      ),
      { target: { value: "Verify footing pins\nConfirm anchor bolts" } }
    );

    expect(onRowsChange).toHaveBeenLastCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          key: "site-prep-foundation",
          siteVisitGuidance: expect.objectContaining({
            whatToVerify: ["Verify footing pins", "Confirm anchor bolts"],
          }),
        }),
      ])
    );
  });

  test("leaves downstream budgets unchanged when cascade is off", () => {
    const onRowsChange = vi.fn();
    render(
      <ControlledWorksheet
        initialRows={cascadeRows}
        onRowsChange={onRowsChange}
        targetBudgetCents={500_000_00}
      />
    );

    const budgetInput = screen.getByTestId(
      "timeline-setup-row-budget-milestone-1"
    );

    fireEvent.change(budgetInput, { target: { value: "$200,000" } });
    fireEvent.blur(budgetInput);

    expect(onRowsChange).toHaveBeenLastCalledWith([
      expect.objectContaining({
        budgetText: "$200,000",
        key: "milestone-1",
      }),
      expect.objectContaining({
        budgetText: "$200,000",
        key: "milestone-2",
      }),
      expect.objectContaining({
        budgetText: "$200,000",
        key: "milestone-3",
      }),
    ]);
  });

  test("cascades a first milestone budget increase across downstream milestones", () => {
    const onRowsChange = vi.fn();
    render(
      <ControlledWorksheet
        cascadeBudgetEdits
        initialRows={cascadeRows}
        onRowsChange={onRowsChange}
        targetBudgetCents={500_000_00}
      />
    );

    const budgetInput = screen.getByTestId(
      "timeline-setup-row-budget-milestone-1"
    );

    fireEvent.change(budgetInput, { target: { value: "$200,000" } });
    fireEvent.blur(budgetInput);

    expect(onRowsChange).toHaveBeenLastCalledWith([
      expect.objectContaining({
        budgetText: "$200,000",
        key: "milestone-1",
        percentageBps: 4000,
        percentageText: "40.00%",
      }),
      expect.objectContaining({
        budgetText: "$150,000",
        key: "milestone-2",
        percentageBps: 3000,
        percentageText: "30.00%",
      }),
      expect.objectContaining({
        budgetText: "$150,000",
        key: "milestone-3",
        percentageBps: 3000,
        percentageText: "30.00%",
      }),
    ]);
  });

  test("only cascades budget changes to later milestones", () => {
    const onRowsChange = vi.fn();
    render(
      <ControlledWorksheet
        cascadeBudgetEdits
        initialRows={cascadeRows}
        onRowsChange={onRowsChange}
        targetBudgetCents={500_000_00}
      />
    );

    const budgetInput = screen.getByTestId(
      "timeline-setup-row-budget-milestone-2"
    );

    fireEvent.change(budgetInput, { target: { value: "$250,000" } });
    fireEvent.blur(budgetInput);

    expect(onRowsChange).toHaveBeenLastCalledWith([
      expect.objectContaining({
        budgetText: "$100,000",
        key: "milestone-1",
        percentageBps: 2000,
      }),
      expect.objectContaining({
        budgetText: "$250,000",
        key: "milestone-2",
        percentageBps: 5000,
      }),
      expect.objectContaining({
        budgetText: "$150,000",
        key: "milestone-3",
        percentageBps: 3000,
      }),
    ]);
  });

  test("skips excluded downstream milestones during cascade", () => {
    const onRowsChange = vi.fn();
    render(
      <ControlledWorksheet
        cascadeBudgetEdits
        initialRows={cascadeRows.map((row) =>
          row.key === "milestone-3" ? { ...row, excluded: true } : row
        )}
        onRowsChange={onRowsChange}
        targetBudgetCents={500_000_00}
      />
    );

    const budgetInput = screen.getByTestId(
      "timeline-setup-row-budget-milestone-1"
    );

    fireEvent.change(budgetInput, { target: { value: "$200,000" } });
    fireEvent.blur(budgetInput);

    expect(onRowsChange).toHaveBeenLastCalledWith([
      expect.objectContaining({
        budgetText: "$200,000",
        key: "milestone-1",
      }),
      expect.objectContaining({
        budgetText: "$300,000",
        key: "milestone-2",
      }),
      expect.objectContaining({
        budgetText: "$200,000",
        excluded: true,
        key: "milestone-3",
      }),
    ]);
  });

  test("clamps cascade edits before downstream budgets go negative", () => {
    const onRowsChange = vi.fn();
    render(
      <ControlledWorksheet
        cascadeBudgetEdits
        initialRows={cascadeRows}
        onRowsChange={onRowsChange}
        targetBudgetCents={500_000_00}
      />
    );

    const budgetInput = screen.getByTestId(
      "timeline-setup-row-budget-milestone-1"
    );

    fireEvent.change(budgetInput, { target: { value: "$600,000" } });
    fireEvent.blur(budgetInput);

    expect(onRowsChange).toHaveBeenLastCalledWith([
      expect.objectContaining({
        budgetText: "$500,000",
        key: "milestone-1",
      }),
      expect.objectContaining({
        budgetText: "$0",
        key: "milestone-2",
      }),
      expect.objectContaining({
        budgetText: "$0",
        key: "milestone-3",
      }),
    ]);
  });

  test("does not cascade invalid transient currency input", () => {
    const onRowsChange = vi.fn();
    render(
      <ControlledWorksheet
        cascadeBudgetEdits
        initialRows={cascadeRows}
        onRowsChange={onRowsChange}
        targetBudgetCents={500_000_00}
      />
    );

    const budgetInput = screen.getByTestId(
      "timeline-setup-row-budget-milestone-1"
    );

    fireEvent.change(budgetInput, { target: { value: "abc" } });
    fireEvent.blur(budgetInput);

    expect(onRowsChange).toHaveBeenLastCalledWith([
      expect.objectContaining({
        budgetText: "abc",
        key: "milestone-1",
      }),
      expect.objectContaining({
        budgetText: "$200,000",
        key: "milestone-2",
      }),
      expect.objectContaining({
        budgetText: "$200,000",
        key: "milestone-3",
      }),
    ]);
  });
});
