// @vitest-environment jsdom

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { type ComponentProps, useState } from "react";
import { afterEach, describe, expect, test, vi } from "vitest";

import {
  TimelineMilestoneWorksheetTable,
  type TimelineMilestoneWorksheetRow,
} from "./-TimelineMilestoneWorksheetTable.tsx";

vi.mock("#/components/rich-text/field-rich-text.tsx", () => ({
  FieldRichTextEditor: ({
    onChange,
    testId,
    value,
  }: {
    onChange: (value: string) => void;
    testId?: string;
    value: string;
  }) => (
    <textarea
      data-testid={testId}
      onChange={(event) => onChange(`<p>${event.currentTarget.value}</p>`)}
      value={value.replace(/<[^>]+>/g, "")}
    />
  ),
  FieldRichTextPreview: () => null,
}));

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
  contractorOptions = [],
  initialRows = worksheetRows,
  mode = "setup",
  onComplete = vi.fn(),
  onRowsChange = vi.fn(),
  targetBudgetCents = 200_000_00,
}: {
  cascadeBudgetEdits?: boolean;
  contractorOptions?: ComponentProps<
    typeof TimelineMilestoneWorksheetTable
  >["contractorOptions"];
  initialRows?: TimelineMilestoneWorksheetRow[];
  mode?: "settings" | "setup";
  onComplete?: ComponentProps<
    typeof TimelineMilestoneWorksheetTable
  >["onComplete"];
  onRowsChange?: (rows: TimelineMilestoneWorksheetRow[]) => void;
  targetBudgetCents?: number;
}) {
  const [rows, setRows] = useState(initialRows);
  const [cascadeEnabled, setCascadeEnabled] = useState(cascadeBudgetEdits);

  return (
    <TimelineMilestoneWorksheetTable
      cascadeBudgetEdits={cascadeEnabled}
      cashText="$25,000"
      contractorOptions={contractorOptions}
      mode={mode}
      onCascadeBudgetEditsChange={setCascadeEnabled}
      onComplete={onComplete}
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

  test("hides demo-only durable routing and proposal review reason fields in setup mode", () => {
    const onComplete = vi.fn();
    render(<ControlledWorksheet onComplete={onComplete} />);

    expect(
      screen.queryByTestId("timeline-setup-durable-route-toggle")
    ).toBeNull();
    expect(
      screen.queryByLabelText("Open durable Convex route after generating")
    ).toBeNull();
    expect(screen.queryByLabelText("Change reason")).toBeNull();

    fireEvent.click(screen.getByTestId("timeline-setup-complete"));

    expect(onComplete).toHaveBeenCalledWith({
      redirectToDurableRoute: false,
    });
  });

  test("opens the contractor autocomplete with existing contractors before typing", async () => {
    render(
      <ControlledWorksheet
        contractorOptions={[
          {
            city: "Hamilton",
            contractorId: "contractor-ledger",
            name: "Ledger Frame Co.",
            trades: ["Framing"],
          },
          {
            city: "Toronto",
            contractorId: "contractor-apex",
            name: "Apex Concrete",
            trades: ["Foundation"],
          },
        ]}
      />
    );

    const contractorInput = screen.getByRole("combobox", {
      name: "Contractor",
    });

    fireEvent.click(contractorInput);

    expect(await screen.findByText("Ledger Frame Co.")).toBeTruthy();
    expect(screen.getByText("Apex Concrete")).toBeTruthy();

    fireEvent.click(screen.getByText("Ledger Frame Co."));

    await waitFor(() =>
      expect((contractorInput as HTMLInputElement).value).toBe(
        "Ledger Frame Co."
      )
    );
    expect(
      (
        screen.getByTestId(
          "timeline-setup-contractor-role-site-prep-foundation"
        ) as HTMLInputElement
      ).value
    ).toBe("Framing");
  });

  test("adds optional contractor and material planning to an expanded setup row", () => {
    const onRowsChange = vi.fn();
    render(
      <ControlledWorksheet
        contractorOptions={[
          {
            contractorId: "contractor-ledger",
            name: "Ledger Frame Co.",
            trades: ["Framing"],
          },
        ]}
        onRowsChange={onRowsChange}
      />
    );

    fireEvent.change(
      screen.getByTestId(
        "timeline-setup-contractor-name-site-prep-foundation"
      ),
      { target: { value: "Ledger Frame Co." } }
    );
    fireEvent.change(
      screen.getByTestId(
        "timeline-setup-contractor-role-site-prep-foundation"
      ),
      { target: { value: "Foundation crew" } }
    );
    fireEvent.change(
      screen.getByTestId(
        "timeline-setup-contractor-cost-site-prep-foundation"
      ),
      { target: { value: "$12,500" } }
    );
    fireEvent.change(
      screen.getByTestId(
        "timeline-setup-contractor-hours-site-prep-foundation"
      ),
      { target: { value: "16.5" } }
    );
    fireEvent.click(screen.getAllByLabelText("Foundation scope")[0]);
    fireEvent.click(
      screen.getByTestId("timeline-setup-add-contractor-site-prep-foundation")
    );

    fireEvent.change(screen.getByLabelText("Title"), {
      target: { value: "Foundation material package" },
    });
    fireEvent.change(screen.getByLabelText("Cost per unit (USD)"), {
      target: { value: "80000" },
    });
    fireEvent.change(screen.getByLabelText("Quantity"), {
      target: { value: "2.5" },
    });
    fireEvent.change(screen.getByLabelText("Supplier"), {
      target: { value: "Apex Supply" },
    });
    fireEvent.click(screen.getByText("Add item"));

    expect(onRowsChange).toHaveBeenLastCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          contractorAssignments: [
            expect.objectContaining({
              contractorId: "contractor-ledger",
              contractorName: "Ledger Frame Co.",
              estimatedCostCents: 1_250_000,
              estimatedHours: 16.5,
              role: "Foundation crew",
              subMilestoneIds: ["site-prep-foundation-sub-1"],
            }),
          ],
          costItems: [
            expect.objectContaining({
              costCents: 8_000_000,
              itemType: "material",
              quantity: 2.5,
              relevantSubMilestoneIds: [],
              supplier: "Apex Supply",
              title: "Foundation material package",
            }),
          ],
          key: "site-prep-foundation",
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
      {
        target: {
          value: "Verify footing pins<img src='data:image/png;base64,abc' />",
        },
      }
    );

    expect(onRowsChange).toHaveBeenLastCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          key: "site-prep-foundation",
          siteVisitGuidance: expect.objectContaining({
            whatToVerify: expect.stringContaining("<img"),
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
