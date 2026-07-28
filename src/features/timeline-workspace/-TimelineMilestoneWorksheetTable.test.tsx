// @vitest-environment jsdom

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { type ComponentProps, useState } from "react";
import { afterEach, describe, expect, test, vi } from "vitest";

import {
  TimelineMilestoneWorksheetTable,
  moveSubMilestoneWithinSummaryRows,
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
      data-rich-text-editor="true"
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
  contractorActions,
  contractorOptions = [],
  initialWorksheetView = "editor",
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
  contractorActions?: ComponentProps<
    typeof TimelineMilestoneWorksheetTable
  >["contractorActions"];
  contractorOptions?: ComponentProps<
    typeof TimelineMilestoneWorksheetTable
  >["contractorOptions"];
  includeChangeMeta?: boolean;
  initialWorksheetView?: ComponentProps<
    typeof TimelineMilestoneWorksheetTable
  >["initialWorksheetView"];
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
      contractorActions={contractorActions}
      contractorOptions={contractorOptions}
      initialWorksheetView={initialWorksheetView}
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
  const worksheetTab = screen.getByRole("tab", { name: "Worksheet" });
  if (worksheetTab.getAttribute("aria-selected") !== "true") {
    fireEvent.click(worksheetTab);
  }
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
  test("defaults to table view with milestone and sub-milestone detail actions", () => {
    render(
      <TimelineMilestoneWorksheetTable
        cashText="$25,000"
        mode="setup"
        onComplete={vi.fn()}
        onRowsChange={vi.fn()}
        rows={worksheetRows}
        targetBudgetCents={200_000_00}
        templateTitle="Regression fixture"
      />
    );

    expect(
      screen.getByRole("tab", { name: "Table view" }).getAttribute(
        "aria-selected"
      )
    ).toBe("true");
    expect(
      screen.getByRole("tab", { name: "Worksheet" }).getAttribute(
        "aria-selected"
      )
    ).toBe("false");

    const tablePanel = screen.getByTestId("timeline-setup-table-view-panel");

    expect(
      within(tablePanel).getByTestId(
        "timeline-setup-table-row-site-prep-foundation"
      )
    ).toBeTruthy();
    expect(
      within(tablePanel).getByTestId(
        "timeline-setup-table-subrow-site-prep-foundation-sub-1"
      )
    ).toBeTruthy();
    expect(
      within(tablePanel).getAllByText("Day 0 to 14").length
    ).toBeGreaterThan(0);
    expect(
      within(tablePanel).getByTestId(
        "timeline-setup-table-row-details-site-prep-foundation"
      )
    ).toBeTruthy();
    expect(
      within(tablePanel).getByTestId(
        "timeline-setup-table-subrow-details-site-prep-foundation-sub-1"
      )
    ).toBeTruthy();
  });

  test("omits the year from displayed calendar schedule dates", () => {
    render(
      <ControlledWorksheet
        initialWorksheetView="table"
        proposedStartDate="2026-06-01"
        scheduleDisplayMode="dates"
      />
    );

    const tablePanel = screen.getByTestId("timeline-setup-table-view-panel");

    expect(
      within(tablePanel).getAllByText("06-01 to 06-15").length
    ).toBeGreaterThan(0);
    expect(
      within(tablePanel).queryByText(/2026-06-01 to 2026-06-15/)
    ).toBeNull();
  });

  test("status chips expose scoped contractor guidance and material summaries", () => {
    render(
      <ControlledWorksheet
        initialWorksheetView="table"
        initialRows={[
          {
            ...worksheetRows[0]!,
            contractorAssignments: [
              {
                contractorId: "contractor-ledger",
                contractorName: "Ledger Frame Co.",
                estimatedCostCents: 1_250_000,
                estimatedHours: 16.5,
                id: "assignment-ledger",
                role: "Foundation crew",
                subMilestoneIds: ["site-prep-foundation-sub-1"],
              },
            ],
            costItems: [
              {
                costCents: 8_000_000,
                description: "Concrete and rebar package",
                id: "material-foundation",
                itemType: "material",
                quantity: 2.5,
                relevantSubMilestoneIds: ["site-prep-foundation-sub-1"],
                supplier: "Apex Supply",
                title: "Foundation material package",
              },
            ],
            siteVisitGuidance: {
              cameraAngles: "<p>North elevation and footing closeups</p>",
              whatToVerify: "<p>Verify footing pins before pour</p>",
            },
          },
        ]}
      />
    );

    expect(
      screen
        .getByTestId("timeline-setup-status-site-prep-foundation-contractor")
        .getAttribute("aria-label")
    ).toContain("Ledger Frame Co.");
    expect(
      screen
        .getByTestId("timeline-setup-status-site-prep-foundation-guidance")
        .getAttribute("aria-label")
    ).toContain("Verify footing pins before pour");
    expect(
      screen
        .getByTestId("timeline-setup-status-site-prep-foundation-materials")
        .getAttribute("aria-label")
    ).toContain("Foundation material package");
    expect(
      screen
        .getByTestId(
          "timeline-setup-status-site-prep-foundation-sub-1-contractor"
        )
        .getAttribute("aria-label")
    ).toContain("Foundation crew");
    expect(
      screen
        .getByTestId(
          "timeline-setup-status-site-prep-foundation-sub-1-materials"
        )
        .getAttribute("aria-label")
    ).toContain("2.5 x $80,000");
  });

  test("status chip click opens the detail sheet focused on the matching tab", () => {
    render(
      <ControlledWorksheet
        initialWorksheetView="table"
        initialRows={[
          {
            ...worksheetRows[0]!,
            contractorAssignments: [
              {
                contractorId: "contractor-ledger",
                contractorName: "Ledger Frame Co.",
                estimatedCostCents: 1_250_000,
                estimatedHours: 16.5,
                id: "assignment-ledger",
                role: "Foundation crew",
                subMilestoneIds: ["site-prep-foundation-sub-1"],
              },
            ],
            costItems: [
              {
                costCents: 8_000_000,
                description: "Concrete and rebar package",
                id: "material-foundation",
                itemType: "material",
                quantity: 2.5,
                relevantSubMilestoneIds: ["site-prep-foundation-sub-1"],
                supplier: "Apex Supply",
                title: "Foundation material package",
              },
            ],
            siteVisitGuidance: {
              cameraAngles: "<p>North elevation and footing closeups</p>",
              whatToVerify: "<p>Verify footing pins before pour</p>",
            },
          },
        ]}
      />
    );

    // Clicking the Contractor chip should open the milestone detail sheet with
    // the Contractors tab auto-selected.
    fireEvent.click(
      screen.getByTestId("timeline-setup-status-site-prep-foundation-contractor")
    );

    const contractorSheet = screen.getByTestId(
      "timeline-setup-details-sheet-site-prep-foundation"
    );
    const contractorTab = within(contractorSheet).getByRole("tab", {
      name: "Contractors",
    });
    expect(contractorTab.getAttribute("aria-selected")).toBe("true");

    // The Materials chip should focus the Materials tab.
    fireEvent.click(
      screen.getByTestId("timeline-setup-status-site-prep-foundation-materials")
    );
    const materialsTab = within(contractorSheet).getByRole("tab", {
      name: "Materials",
    });
    expect(materialsTab.getAttribute("aria-selected")).toBe("true");

    // The Guidance chip should focus the Field Guidance tab.
    fireEvent.click(
      screen.getByTestId("timeline-setup-status-site-prep-foundation-guidance")
    );
    const guidanceTab = within(contractorSheet).getByRole("tab", {
      name: "Field Guidance",
    });
    expect(guidanceTab.getAttribute("aria-selected")).toBe("true");
  });

  test("status chip click on a sub-milestone opens the focused sheet tab", () => {
    render(
      <ControlledWorksheet
        initialWorksheetView="table"
        initialRows={[
          {
            ...worksheetRows[0]!,
            contractorAssignments: [
              {
                contractorId: "contractor-ledger",
                contractorName: "Ledger Frame Co.",
                estimatedCostCents: 1_250_000,
                estimatedHours: 16.5,
                id: "assignment-ledger",
                role: "Foundation crew",
                subMilestoneIds: ["site-prep-foundation-sub-1"],
              },
            ],
          },
        ]}
      />
    );

    fireEvent.click(
      screen.getByTestId(
        "timeline-setup-status-site-prep-foundation-sub-1-contractor"
      )
    );

    const subMilestoneSheet = screen.getByTestId(
      "timeline-setup-submilestone-details-sheet-site-prep-foundation-sub-1"
    );
    const contractorTab = within(subMilestoneSheet).getByRole("tab", {
      name: "Contractors",
    });
    expect(contractorTab.getAttribute("aria-selected")).toBe("true");
  });

  test("detail sheet opens on the default tab when launched from the Details button", () => {
    render(
      <ControlledWorksheet
        initialWorksheetView="table"
        initialRows={[{ ...worksheetRows[0]! }]}
      />
    );

    fireEvent.click(
      screen.getByTestId(
        "timeline-setup-table-row-details-site-prep-foundation"
      )
    );

    const sheet = screen.getByTestId(
      "timeline-setup-details-sheet-site-prep-foundation"
    );
    // The Details button carries no tab request, so the sheet lands on its
    // default milestone tab (Sub-milestones), not Contractors/Materials.
    const defaultTab = within(sheet).getByRole("tab", {
      name: "Sub-milestones",
    });
    expect(defaultTab.getAttribute("aria-selected")).toBe("true");
  });

  test("opens table row details in a sheet with the milestone planning tabs", () => {
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

    fireEvent.click(screen.getByRole("tab", { name: "Table view" }));
    fireEvent.click(
      screen.getByTestId(
        "timeline-setup-table-row-details-site-prep-foundation"
      )
    );

    const sheet = screen.getByTestId(
      "timeline-setup-details-sheet-site-prep-foundation"
    );
    const popup = sheet.closest('[data-slot="sheet-popup"]') as HTMLElement;
    const backdrop = document.querySelector(
      '[data-slot="sheet-backdrop"]'
    ) as HTMLElement;

    expect(popup.className).toContain("is-milestone-detail");
    expect(backdrop.className).toContain(
      "timeline-blueprint-details-sheet-backdrop"
    );

    expect(
      within(sheet).getByRole("tab", { name: "Sub-milestones" })
    ).toBeTruthy();
    expect(
      within(sheet).getByRole("tab", { name: "Contractors" })
    ).toBeTruthy();
    expect(
      within(sheet).getByRole("tab", { name: "Materials" })
    ).toBeTruthy();
    expect(
      within(sheet).getByRole("tab", { name: "Field Guidance" })
    ).toBeTruthy();
    expect(
      (
        within(sheet).getByTestId(
          "timeline-setup-submilestone-name-site-prep-foundation-sub-1"
        ) as HTMLInputElement
      ).value
    ).toBe("Foundation scope");

    fireEvent.click(within(sheet).getByRole("tab", { name: "Contractors" }));
    fireEvent.change(
      within(sheet).getByTestId(
        "timeline-setup-contractor-name-site-prep-foundation"
      ),
      { target: { value: "Ledger Frame Co." } }
    );
    fireEvent.change(
      within(sheet).getByTestId(
        "timeline-setup-contractor-role-site-prep-foundation"
      ),
      { target: { value: "Foundation crew" } }
    );
    fireEvent.click(
      within(sheet).getByTestId(
        "timeline-setup-add-contractor-site-prep-foundation"
      )
    );

    expect(onRowsChange).toHaveBeenLastCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          contractorAssignments: [
            expect.objectContaining({
              contractorId: "contractor-ledger",
              contractorName: "Ledger Frame Co.",
              role: "Foundation crew",
              subMilestoneIds: [],
            }),
          ],
          key: "site-prep-foundation",
        }),
      ])
    );
  });

  test("opens sub-milestone details in a focused sheet and scopes work to that sub-milestone", () => {
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

    fireEvent.click(screen.getByRole("tab", { name: "Table view" }));
    fireEvent.click(
      screen.getByTestId(
        "timeline-setup-table-subrow-details-site-prep-foundation-sub-1"
      )
    );

    const sheet = screen.getByTestId(
      "timeline-setup-submilestone-details-sheet-site-prep-foundation-sub-1"
    );
    const popup = sheet.closest('[data-slot="sheet-popup"]') as HTMLElement;
    const backdrop = document.querySelector(
      '[data-slot="sheet-backdrop"]'
    ) as HTMLElement;

    expect(popup.className).toContain("is-submilestone-detail");
    expect(backdrop.className).toContain(
      "timeline-blueprint-details-sheet-backdrop"
    );

    expect(within(sheet).getByRole("tab", { name: "Scope" })).toBeTruthy();
    expect(
      within(sheet).queryByRole("tab", { name: "Sub-milestones" })
    ).toBeNull();
    expect(
      within(sheet).getByRole("tab", { name: "Contractors" })
    ).toBeTruthy();
    expect(
      within(sheet).getByRole("tab", { name: "Materials" })
    ).toBeTruthy();
    expect(
      within(sheet).getByRole("tab", { name: "Field Guidance" })
    ).toBeTruthy();
    expect(
      (
        within(sheet).getByTestId(
          "timeline-setup-submilestone-name-site-prep-foundation-sub-1"
        ) as HTMLInputElement
      ).value
    ).toBe("Foundation scope");

    fireEvent.click(within(sheet).getByRole("tab", { name: "Contractors" }));
    fireEvent.change(
      within(sheet).getByTestId(
        "timeline-setup-contractor-name-site-prep-foundation"
      ),
      { target: { value: "Ledger Frame Co." } }
    );
    fireEvent.change(
      within(sheet).getByTestId(
        "timeline-setup-contractor-role-site-prep-foundation"
      ),
      { target: { value: "Foundation crew" } }
    );
    fireEvent.click(
      within(sheet).getByTestId(
        "timeline-setup-add-contractor-site-prep-foundation"
      )
    );

    expect(onRowsChange).toHaveBeenLastCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          contractorAssignments: [
            expect.objectContaining({
              contractorId: "contractor-ledger",
              contractorName: "Ledger Frame Co.",
              role: "Foundation crew",
              subMilestoneIds: ["site-prep-foundation-sub-1"],
            }),
          ],
          key: "site-prep-foundation",
        }),
      ])
    );

    fireEvent.click(within(sheet).getByRole("tab", { name: "Field Guidance" }));
    const guidanceEditor = within(sheet).getByTestId(
      "timeline-setup-submilestone-guidance-description-site-prep-foundation-sub-1"
    );
    expect(guidanceEditor.getAttribute("data-rich-text-editor")).toBe("true");
    fireEvent.change(guidanceEditor, {
      target: { value: "Verify footing layout before pour." },
    });

    expect(onRowsChange).toHaveBeenLastCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          key: "site-prep-foundation",
          subMilestoneDetails: [
            expect.objectContaining({
              description: "<p>Verify footing layout before pour.</p>",
              id: "site-prep-foundation-sub-1",
            }),
          ],
        }),
      ])
    );
  });

  test("edits table sub-milestone budget and schedule inline and updates milestone rollups", () => {
    const onRowsChange = vi.fn();
    render(
      <ControlledWorksheet
        onRowsChange={onRowsChange}
        proposedStartDate="2026-06-01"
        scheduleDisplayMode="dates"
      />
    );

    fireEvent.click(screen.getByRole("tab", { name: "Table view" }));
    const budgetInput = screen.getByTestId(
      "timeline-setup-table-subrow-budget-site-prep-foundation-sub-1"
    );
    fireEvent.change(budgetInput, { target: { value: "$130,000" } });
    fireEvent.blur(budgetInput);

    expect(onRowsChange).toHaveBeenLastCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          budgetText: "$130,000",
          key: "site-prep-foundation",
          subMilestoneDetails: [
            expect.objectContaining({
              budgetText: "$130,000",
              id: "site-prep-foundation-sub-1",
            }),
          ],
        }),
      ])
    );

    const endInput = screen.getByTestId(
      "timeline-setup-table-subrow-end-date-site-prep-foundation-sub-1"
    );
    fireEvent.change(endInput, { target: { value: "2026-06-25" } });

    expect(onRowsChange).toHaveBeenLastCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          durationDays: 25,
          durationText: "25",
          key: "site-prep-foundation",
          subMilestoneDetails: [
            expect.objectContaining({
              durationText: "25",
              id: "site-prep-foundation-sub-1",
            }),
          ],
        }),
      ])
    );
  });

  test("adds milestones and sub-milestones from table view controls", () => {
    const onRowsChange = vi.fn();
    render(<ControlledWorksheet onRowsChange={onRowsChange} />);

    fireEvent.click(screen.getByRole("tab", { name: "Table view" }));
    fireEvent.change(
      screen.getByTestId("timeline-setup-table-add-milestone-name"),
      { target: { value: "Inspection holdback" } }
    );
    fireEvent.click(screen.getByTestId("timeline-setup-table-add-milestone"));

    expect(onRowsChange).toHaveBeenLastCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          name: "Inspection holdback",
          type: "custom",
        }),
      ])
    );

    fireEvent.click(
      screen.getByTestId("timeline-setup-table-add-submilestone-framing")
    );

    expect(onRowsChange).toHaveBeenLastCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          key: "framing",
          subMilestoneDetails: expect.arrayContaining([
            expect.objectContaining({ id: "framing-sub-1" }),
            expect.objectContaining({ name: "New sub-milestone 2" }),
          ]),
        }),
      ])
    );
  });

  test("moves table sub-milestones across groups and recalculates group rollups", () => {
    const movedRows = moveSubMilestoneWithinSummaryRows(
      [
        {
          ...worksheetRows[0]!,
          startDay: 0,
          subMilestoneDetails: [
            {
              ...worksheetRows[0]!.subMilestoneDetails[0]!,
              startDay: 0,
            },
          ],
        },
        {
          ...worksheetRows[1]!,
          startDay: 20,
          subMilestoneDetails: [
            {
              ...worksheetRows[1]!.subMilestoneDetails[0]!,
              startDay: 20,
            },
          ],
        },
      ],
      1,
      2,
      { includeBudget: true }
    );

    expect(movedRows).toBeTruthy();
    const sitePrep = movedRows?.find(
      (row) => row.key === "site-prep-foundation"
    );
    const framing = movedRows?.find((row) => row.key === "framing");

    expect(sitePrep?.subMilestoneDetails).toEqual([]);
    expect(framing?.subMilestoneDetails.map((detail) => detail.id)).toEqual([
      "framing-sub-1",
      "site-prep-foundation-sub-1",
    ]);
    expect(framing?.budgetText).toBe("$200,000");
    expect(framing?.startDay).toBe(0);
    expect(framing?.durationDays).toBe(30);
    expect(framing?.durationText).toBe("30");
  });

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

  test("opens the create-contractor drawer from milestone crew planning", async () => {
    const onCreate = vi.fn(async () => ({
      contractorId: "contractor-new",
    }));
    render(
      <ControlledWorksheet
        contractorActions={{
          availableContractors: [],
          onCreate,
        }}
        contractorOptions={[]}
      />
    );
    openExpandedMilestoneTab("Contractors");

    fireEvent.click(
      screen.getByTestId("timeline-setup-create-contractor-site-prep-foundation")
    );

    expect(
      await screen.findByRole("heading", { name: "Add contractor to proposal" })
    ).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Create and add" })
    ).toBeTruthy();
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
    fireEvent.click(screen.getAllByRole("button", { name: /Add cost item/i })[0]);
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

describe("summary table window range editing", () => {
  function clickCalendarDay(isoDate: string) {
    const button = document.querySelector(
      `[data-day="${isoDate}"] button`
    );
    if (!button) {
      throw new Error(`No calendar day rendered for ${isoDate}`);
    }
    fireEvent.click(button);
  }

  test("milestone window cell opens a range calendar and edits the start date", () => {
    const onRowsChange = vi.fn();
    render(
      <ControlledWorksheet
        initialRows={cascadeRows}
        initialWorksheetView="table"
        onRowsChange={onRowsChange}
        proposedStartDate="2026-06-01"
        scheduleDisplayMode="dates"
      />
    );

    fireEvent.click(
      screen.getByTestId("timeline-setup-table-row-window-milestone-1")
    );

    expect(
      document
        .querySelector('[data-day="2026-06-01"]')
        ?.classList.contains("range-start")
    ).toBe(true);
    expect(
      screen
        .getByTestId("timeline-setup-table-row-window-milestone-1-start-node")
        .getAttribute("aria-pressed")
    ).toBe("true");

    clickCalendarDay("2026-06-03");

    expect(onRowsChange).toHaveBeenLastCalledWith([
      expect.objectContaining({
        durationDays: 5,
        durationText: "5",
        key: "milestone-1",
        startDay: 2,
      }),
      expect.objectContaining({ key: "milestone-2" }),
      expect.objectContaining({ key: "milestone-3" }),
    ]);
  });

  test("the armed end node moves the milestone end date only", () => {
    const onRowsChange = vi.fn();
    render(
      <ControlledWorksheet
        initialRows={cascadeRows}
        initialWorksheetView="table"
        onRowsChange={onRowsChange}
        proposedStartDate="2026-06-01"
        scheduleDisplayMode="dates"
      />
    );

    fireEvent.click(
      screen.getByTestId("timeline-setup-table-row-window-milestone-1")
    );
    fireEvent.click(
      screen.getByTestId(
        "timeline-setup-table-row-window-milestone-1-end-node"
      )
    );
    clickCalendarDay("2026-06-10");

    expect(onRowsChange).toHaveBeenLastCalledWith([
      expect.objectContaining({
        // Exclusive-end: pointing the end node at 2026-06-10 (day 9) yields
        // a 9-day window (start day 0..9), matching the "Day X to Y" labels.
        durationDays: 9,
        durationText: "9",
        key: "milestone-1",
        startDay: 0,
      }),
      expect.objectContaining({ key: "milestone-2" }),
      expect.objectContaining({ key: "milestone-3" }),
    ]);
  });

  test("milestone rows with sub-milestones keep a read-only window", () => {
    render(
      <ControlledWorksheet
        initialWorksheetView="table"
        proposedStartDate="2026-06-01"
        scheduleDisplayMode="dates"
      />
    );

    expect(
      screen.queryByTestId(
        "timeline-setup-table-row-window-site-prep-foundation"
      )
    ).toBeNull();
  });

  test("sub-milestone window cell edits the sub-milestone start date", () => {
    const onRowsChange = vi.fn();
    render(
      <ControlledWorksheet
        initialWorksheetView="table"
        onRowsChange={onRowsChange}
        proposedStartDate="2026-06-01"
        scheduleDisplayMode="dates"
      />
    );

    fireEvent.click(
      screen.getByTestId(
        "timeline-setup-table-submilestone-window-site-prep-foundation-sub-1"
      )
    );
    clickCalendarDay("2026-06-05");

    const rows = onRowsChange.mock.calls.at(-1)?.[0] as
      | TimelineMilestoneWorksheetRow[]
      | undefined;
    const subMilestone = rows?.[0]?.subMilestoneDetails[0];
    expect(subMilestone).toEqual(
      expect.objectContaining({ durationText: "10", startDay: 4 })
    );
  });

  test("window cells stay read-only without a proposed start date", () => {
    render(<ControlledWorksheet initialWorksheetView="table" />);

    expect(
      screen.queryByTestId(
        "timeline-setup-table-submilestone-window-site-prep-foundation-sub-1"
      )
    ).toBeNull();
  });
});
