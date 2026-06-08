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
  type TimelineMilestoneWorksheetRowsChangeMeta,
  type TimelineScheduleDisplayMode,
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
  includeChangeMeta = false,
  mode = "setup",
  onComplete = vi.fn(),
  onRowsChange = vi.fn(),
  proposedStartDate,
  scheduleDisplayMode,
  targetBudgetCents = 200_000_00,
}: {
  cascadeBudgetEdits?: boolean;
  contractorOptions?: ComponentProps<
    typeof TimelineMilestoneWorksheetTable
  >["contractorOptions"];
  includeChangeMeta?: boolean;
  initialRows?: TimelineMilestoneWorksheetRow[];
  mode?: "settings" | "setup";
  onComplete?: ComponentProps<
    typeof TimelineMilestoneWorksheetTable
  >["onComplete"];
  onRowsChange?: (
    rows: TimelineMilestoneWorksheetRow[],
    meta?: TimelineMilestoneWorksheetRowsChangeMeta
  ) => void;
  proposedStartDate?: string;
  scheduleDisplayMode?: TimelineScheduleDisplayMode;
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
      onRowsChange={(nextRows, meta) => {
        setRows(nextRows);
        if (includeChangeMeta) {
          onRowsChange(nextRows, meta);
          return;
        }
        onRowsChange(nextRows);
      }}
      proposedStartDate={proposedStartDate}
      rows={rows}
      scheduleDisplayMode={scheduleDisplayMode}
      targetBudgetCents={targetBudgetCents}
      templateTitle="Regression fixture"
    />
  );
}

function openExpandedMilestoneTab(name: string) {
  fireEvent.click(screen.getByRole("tab", { name }));
}

function panelIsHidden(element: HTMLElement | null) {
  if (!element) {
    return true;
  }
  return (
    element.hasAttribute("hidden") ||
    element.hasAttribute("data-hidden") ||
    element.getAttribute("aria-hidden") === "true"
  );
}

describe("TimelineMilestoneWorksheetTable", () => {
  test("marks row input typing as uncommitted until blur", () => {
    const onRowsChange = vi.fn();

    render(
      <ControlledWorksheet includeChangeMeta onRowsChange={onRowsChange} />
    );

    const budgetInput = screen.getByTestId(
      "timeline-setup-row-budget-site-prep-foundation"
    );

    fireEvent.change(budgetInput, { target: { value: "$126,000" } });

    expect(onRowsChange).toHaveBeenLastCalledWith(
      expect.any(Array),
      expect.objectContaining({ commit: false })
    );

    fireEvent.blur(budgetInput);

    expect(onRowsChange).toHaveBeenLastCalledWith(
      expect.any(Array),
      expect.objectContaining({ commit: true })
    );
  });

  test("marks expanded sub-milestone typing as uncommitted until Enter", () => {
    const onRowsChange = vi.fn();

    render(
      <ControlledWorksheet includeChangeMeta onRowsChange={onRowsChange} />
    );

    const nameInput = screen.getByTestId(
      "timeline-setup-submilestone-name-site-prep-foundation-sub-1"
    );

    fireEvent.change(nameInput, { target: { value: "Foundation revised" } });

    expect(onRowsChange).toHaveBeenCalledWith(
      expect.any(Array),
      expect.objectContaining({ commit: false })
    );

    fireEvent.keyDown(nameInput, { key: "Enter" });

    expect(onRowsChange).toHaveBeenLastCalledWith(
      expect.any(Array),
      expect.objectContaining({ commit: true })
    );
  });

  test("defaults expanded setup rows to the sub-milestones tab", () => {
    render(<ControlledWorksheet />);

    expect(
      screen.getByRole("tab", { name: "Sub-milestones" }).getAttribute(
        "aria-selected"
      )
    ).toBe("true");
    expect(
      panelIsHidden(
        screen.queryByTestId(
          "timeline-expanded-contractors-panel-site-prep-foundation"
        )
      )
    ).toBe(true);
    expect(
      panelIsHidden(
        screen.queryByTestId(
          "timeline-expanded-materials-panel-site-prep-foundation"
        )
      )
    ).toBe(true);
    expect(
      panelIsHidden(
        screen.queryByTestId(
          "timeline-expanded-field-guidance-panel-site-prep-foundation"
        )
      )
    ).toBe(true);
    expect(
      panelIsHidden(
        screen.getByTestId(
          "timeline-expanded-submilestones-panel-site-prep-foundation"
        )
      )
    ).toBe(false);
  });

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
    const startInput = screen.getByTestId(
      "timeline-setup-row-start-offset-site-prep-foundation"
    );
    const durationInput = screen.getByTestId(
      "timeline-setup-row-duration-site-prep-foundation"
    );
    budgetInput.focus();

    fireEvent.keyDown(budgetInput, { key: "Enter" });
    expect(document.activeElement).toBe(startInput);

    fireEvent.keyDown(durationInput, { key: "ArrowUp" });
    expect(document.activeElement).toBe(startInput);
  });

  test("edits inclusive milestone start and end dates in calendar mode", () => {
    const onRowsChange = vi.fn();
    render(
      <ControlledWorksheet
        initialRows={[
          {
            ...worksheetRows[0]!,
            startDay: 0,
            subMilestoneDetails: [],
            subMilestones: [],
          },
        ]}
        onRowsChange={onRowsChange}
        proposedStartDate="2026-06-01"
        scheduleDisplayMode="dates"
      />
    );

    const startDate = screen.getByTestId(
      "timeline-setup-row-start-date-site-prep-foundation"
    );
    const endDate = screen.getByTestId(
      "timeline-setup-row-end-date-site-prep-foundation"
    );

    expect((startDate as HTMLInputElement).value).toBe("2026-06-01");
    expect((endDate as HTMLInputElement).value).toBe("2026-06-14");

    fireEvent.change(startDate, { target: { value: "2026-05-30" } });
    expect(onRowsChange).toHaveBeenLastCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          key: "site-prep-foundation",
          startDay: -2,
        }),
      ])
    );

    fireEvent.change(
      screen.getByTestId("timeline-setup-row-end-date-site-prep-foundation"),
      { target: { value: "2026-06-30" } }
    );
    expect(onRowsChange).toHaveBeenLastCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          durationDays: 32,
          durationText: "32",
          key: "site-prep-foundation",
        }),
      ])
    );
  });

  test("keeps duration cells when schedule mode is switched back to T offsets", () => {
    render(
      <ControlledWorksheet
        proposedStartDate="2026-06-01"
        scheduleDisplayMode="tOffsets"
      />
    );

    expect(
      (
        screen.getByTestId(
          "timeline-setup-row-start-offset-site-prep-foundation"
        ) as HTMLInputElement
      ).value
    ).toBe("T0");
    expect(
      (
        screen.getByTestId(
          "timeline-setup-row-duration-site-prep-foundation"
        ) as HTMLInputElement
      ).value
    ).toBe("T14");
    expect(
      (
        screen.getByTestId(
          "timeline-setup-row-end-offset-site-prep-foundation"
        ) as HTMLInputElement
      ).value
    ).toBe("T+13");
    expect(
      screen.queryByTestId("timeline-setup-row-start-date-site-prep-foundation")
    ).toBeNull();
  });

  test("shows editable T start and duration with computed T end without a proposed start date", () => {
    const onRowsChange = vi.fn();
    render(<ControlledWorksheet onRowsChange={onRowsChange} />);

    expect(
      (
        screen.getByTestId(
          "timeline-setup-row-start-offset-site-prep-foundation"
        ) as HTMLInputElement
      ).value
    ).toBe("T0");
    expect(
      (
        screen.getByTestId(
          "timeline-setup-row-duration-site-prep-foundation"
        ) as HTMLInputElement
      ).value
    ).toBe("T14");
    expect(
      (
        screen.getByTestId(
          "timeline-setup-row-end-offset-site-prep-foundation"
        ) as HTMLInputElement
      ).value
    ).toBe("T+13");

    fireEvent.change(
      screen.getByTestId("timeline-setup-row-start-offset-site-prep-foundation"),
      { target: { value: "T+20" } }
    );
    expect(onRowsChange).toHaveBeenLastCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          key: "site-prep-foundation",
          startDay: 20,
        }),
      ])
    );
  });

  test("derives milestone schedule cells from the sub-milestone date range", () => {
    render(
      <ControlledWorksheet
        initialRows={[
          {
            ...worksheetRows[0]!,
            durationDays: 1,
            durationText: "1",
            startDay: 99,
            subMilestoneDetails: [
              {
                ...worksheetRows[0]!.subMilestoneDetails[0]!,
                durationText: "3",
                id: "site-prep-foundation-sub-a",
                name: "Early work",
                startDay: 5,
              },
              {
                budgetText: "$25,000",
                description: "Later checkpoint",
                durationText: "9",
                id: "site-prep-foundation-sub-b",
                name: "Long lead work",
                startDay: 3,
              },
            ],
          },
        ]}
      />
    );

    expect(
      (
        screen.getByTestId(
          "timeline-setup-row-start-offset-site-prep-foundation"
        ) as HTMLInputElement
      ).value
    ).toBe("T+3");
    expect(
      (
        screen.getByTestId(
          "timeline-setup-row-duration-site-prep-foundation"
        ) as HTMLInputElement
      ).value
    ).toBe("T9");
    expect(
      (
        screen.getByTestId(
          "timeline-setup-row-end-offset-site-prep-foundation"
        ) as HTMLInputElement
      ).value
    ).toBe("T+11");
  });

  test("shows editable submilestone T start and duration with computed T end without a proposed start date", () => {
    const onRowsChange = vi.fn();
    render(
      <ControlledWorksheet
        initialRows={[
          {
            ...worksheetRows[0]!,
            startDay: 20,
            subMilestoneDetails: [
              {
                ...worksheetRows[0]!.subMilestoneDetails[0]!,
                durationText: "4",
                startDay: 21,
              },
            ],
          },
        ]}
        onRowsChange={onRowsChange}
      />
    );

    expect(
      (
        screen.getByTestId(
          "timeline-setup-submilestone-start-offset-site-prep-foundation-sub-1"
        ) as HTMLInputElement
      ).value
    ).toBe("T+21");
    expect(
      (
        screen.getByTestId(
          "timeline-setup-submilestone-duration-site-prep-foundation-sub-1"
        ) as HTMLInputElement
      ).value
    ).toBe("T4");
    expect(
      (
        screen.getByTestId(
          "timeline-setup-submilestone-end-offset-site-prep-foundation-sub-1"
        ) as HTMLInputElement
      ).value
    ).toBe("T+24");

    fireEvent.change(
      screen.getByTestId(
        "timeline-setup-submilestone-start-offset-site-prep-foundation-sub-1"
      ),
      { target: { value: "T+25" } }
    );
    expect(onRowsChange).toHaveBeenLastCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          durationDays: 4,
          durationText: "4",
          key: "site-prep-foundation",
          startDay: 25,
          subMilestoneDetails: expect.arrayContaining([
            expect.objectContaining({
              id: "site-prep-foundation-sub-1",
              startDay: 25,
            }),
          ]),
        }),
      ])
    );
  });

  test("moves a sub-milestone to another milestone and recomputes both row rollups", async () => {
    const onRowsChange = vi.fn();
    render(
      <ControlledWorksheet
        initialRows={[
          {
            ...worksheetRows[0]!,
            budgetText: "$150",
            durationDays: 8,
            durationText: "8",
            startDay: 0,
            subMilestoneDetails: [
              {
                budgetText: "$100",
                description: "Source scope A",
                durationText: "2",
                id: "source-sub-a",
                name: "Source A",
                startDay: 0,
              },
              {
                budgetText: "$50",
                description: "Source scope B",
                durationText: "3",
                id: "source-sub-b",
                name: "Source B",
                startDay: 5,
              },
            ],
            subMilestones: ["Source A", "Source B"],
          },
          {
            ...worksheetRows[1]!,
            budgetText: "$75",
            durationDays: 2,
            durationText: "2",
            startDay: 10,
            subMilestoneDetails: [
              {
                budgetText: "$75",
                description: "Target scope",
                durationText: "2",
                id: "target-sub-a",
                name: "Target A",
                startDay: 10,
              },
            ],
            subMilestones: ["Target A"],
          },
        ]}
        onRowsChange={onRowsChange}
      />
    );

    fireEvent.contextMenu(
      screen.getByTestId("timeline-setup-submilestone-card-source-sub-b")
    );
    fireEvent.click(
      await screen.findByRole("menuitem", { name: "Move to Framing" })
    );

    expect(onRowsChange).toHaveBeenLastCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          budgetText: "$100",
          durationDays: 2,
          durationText: "2",
          key: "site-prep-foundation",
          startDay: 0,
          subMilestoneDetails: [
            expect.objectContaining({
              id: "source-sub-a",
            }),
          ],
          subMilestones: ["Source A"],
        }),
        expect.objectContaining({
          budgetText: "$125",
          durationDays: 7,
          durationText: "7",
          key: "framing",
          startDay: 5,
          subMilestoneDetails: [
            expect.objectContaining({
              id: "target-sub-a",
            }),
            expect.objectContaining({
              id: "source-sub-b",
            }),
          ],
          subMilestones: ["Target A", "Source B"],
        }),
      ])
    );
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
    openExpandedMilestoneTab("Contractors");

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
    openExpandedMilestoneTab("Contractors");

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
    fireEvent.keyDown(
      screen.getByTestId("timeline-setup-contractor-name-site-prep-foundation"),
      { key: "Escape" }
    );

    openExpandedMilestoneTab("Materials");
    fireEvent.click(screen.getAllByRole("button", { name: "Add cost item" })[0]);
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
    openExpandedMilestoneTab("Field Guidance");

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
