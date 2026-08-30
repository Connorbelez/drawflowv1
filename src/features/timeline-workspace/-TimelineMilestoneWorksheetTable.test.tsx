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
  rebalanceWorksheetCompletionPercentages,
  type TimelineMilestoneWorksheetRow,
  type TimelineMilestoneWorksheetRowsChangeMeta,
  type TimelineScheduleDisplayMode,
} from "./-TimelineMilestoneWorksheetTable.tsx";

vi.mock("#/components/rich-text/field-rich-text.tsx", () => ({
  FieldRichTextEditor: ({
    editable = true,
    onDocumentChange,
    onChange,
    testId,
    value,
  }: {
    onChange: (value: string) => void;
    onDocumentChange?: (document: unknown, html: string) => void;
    editable?: boolean;
    testId?: string;
    value: string | { content?: Array<{ content?: Array<{ text?: string }> }> };
  }) => (
    <textarea
      data-rich-text-editor="true"
      data-testid={testId}
      disabled={!editable}
      onChange={(event) => {
        const html = `<p>${event.currentTarget.value}</p>`;
        onChange(html);
        onDocumentChange?.(
          {
            content: [
              {
                content: [{ text: event.currentTarget.value, type: "text" }],
                type: "paragraph",
              },
            ],
            type: "doc",
          },
          html
        );
      }}
      value={
        typeof value === "string"
          ? value.replace(/<[^>]+>/g, "")
          : (value.content
              ?.flatMap((node) => node.content ?? [])
              .map((node) => node.text ?? "")
              .join(" ") ?? "")
      }
    />
  ),
  FieldRichTextPreview: () => null,
}));

function tiptap(text: string) {
  return JSON.stringify({
    content: [
      {
        content: [{ text, type: "text" }],
        type: "paragraph",
      },
    ],
    type: "doc",
  });
}

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
        fieldGuidance: {
          cameraAnglesTiptapJson: tiptap("Capture the north and east faces"),
          whatToVerifyTiptapJson: tiptap("Verify footing layout before pour"),
        },
        id: "site-prep-foundation-sub-1",
        name: "Foundation scope",
        percentageBps: 5000,
        percentageText: "50.00%",
        scopeOfWorkTiptapJson: tiptap("Clear the site and pour foundation"),
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
        fieldGuidance: {
          cameraAnglesTiptapJson: tiptap("Capture the roofline"),
          whatToVerifyTiptapJson: tiptap("Verify framing connections"),
        },
        id: "framing-sub-1",
        name: "Frame shell",
        percentageBps: 5000,
        percentageText: "50.00%",
        scopeOfWorkTiptapJson: tiptap("Frame walls and roof"),
      },
    ],
    subMilestones: ["Frame shell"],
  type: "framing",
  },
];

const percentageRebalanceRows: TimelineMilestoneWorksheetRow[] = [
  {
    ...worksheetRows[0]!,
    percentageBps: 5000,
    percentageText: "50.00%",
    subMilestoneDetails: [
      {
        ...worksheetRows[0]!.subMilestoneDetails[0]!,
        id: "site-prep-foundation-sub-1",
        name: "Site preparation",
        percentageBps: 3000,
        percentageText: "30.00%",
      },
      {
        ...worksheetRows[0]!.subMilestoneDetails[0]!,
        id: "site-prep-foundation-sub-2",
        name: "Foundation scope",
        percentageBps: 2000,
        percentageText: "20.00%",
      },
    ],
    subMilestones: ["Site preparation", "Foundation scope"],
  },
  worksheetRows[1]!,
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

const fallbackGuardRows: TimelineMilestoneWorksheetRow[] = [
  worksheetRows[0]!,
  {
    ...worksheetRows[1]!,
    subMilestoneDetails: [
      worksheetRows[1]!.subMilestoneDetails[0]!,
      {
        ...worksheetRows[1]!.subMilestoneDetails[0]!,
        id: "framing-sub-2",
        name: "Frame finishes",
      },
    ],
    subMilestones: ["Frame shell", "Frame finishes"],
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
  onBack,
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
  onBack?: ComponentProps<typeof TimelineMilestoneWorksheetTable>["onBack"];
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
      onBack={onBack}
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

  test("summarizes only canonical field guidance", () => {
    render(
      <ControlledWorksheet
        initialWorksheetView="table"
        initialRows={[
          {
            ...worksheetRows[0]!,
            subMilestoneDetails: [
              {
                ...worksheetRows[0]!.subMilestoneDetails[0]!,
                description: "Legacy description should not replace guidance",
              },
            ],
          },
        ]}
      />
    );

    const canonicalGuidance = screen
      .getByTestId(
        "timeline-setup-status-site-prep-foundation-sub-1-guidance"
      )
      .getAttribute("aria-label");
    expect(canonicalGuidance).toContain(
      "What to verify: Verify footing layout before pour"
    );
    expect(canonicalGuidance).toContain(
      "Recommended camera angles: Capture the north and east faces"
    );
    expect(canonicalGuidance).not.toContain("Scope note:");

    cleanup();
    render(
      <ControlledWorksheet
        initialWorksheetView="table"
        initialRows={[
          {
            ...worksheetRows[0]!,
            subMilestoneDetails: [
              {
                ...worksheetRows[0]!.subMilestoneDetails[0]!,
                description: "Legacy verification note",
                fieldGuidance: undefined,
              },
            ],
          },
        ]}
      />
    );

    const missingGuidance = screen
      .getByTestId(
        "timeline-setup-status-site-prep-foundation-sub-1-guidance"
      )
      .getAttribute("aria-label");
    expect(missingGuidance).toContain("No field guidance set.");
    expect(missingGuidance).not.toContain("Legacy verification note");

    cleanup();
    render(
      <ControlledWorksheet
        initialWorksheetView="table"
        initialRows={[
          {
            ...worksheetRows[0]!,
            subMilestoneDetails: [
              {
                ...worksheetRows[0]!.subMilestoneDetails[0]!,
                description: "",
                fieldGuidance: undefined,
              },
            ],
          },
        ]}
      />
    );

    expect(
      screen
        .getByTestId(
          "timeline-setup-status-site-prep-foundation-sub-1-guidance"
        )
        .getAttribute("aria-label")
    ).toContain("No field guidance set.");
  });

  test("only parses TipTap document roots when summarizing guidance", () => {
    const subMilestone = worksheetRows[0]!.subMilestoneDetails[0]!;
    const renderSummary = (whatToVerifyTiptapJson: string) => {
      render(
        <ControlledWorksheet
          initialWorksheetView="table"
          initialRows={[
            {
              ...worksheetRows[0]!,
              subMilestoneDetails: [
                {
                  ...subMilestone,
                  fieldGuidance: {
                    cameraAnglesTiptapJson: "",
                    whatToVerifyTiptapJson,
                  },
                },
              ],
            },
          ]}
        />
      );

      return screen
        .getByTestId(
          "timeline-setup-status-site-prep-foundation-sub-1-guidance"
        )
        .getAttribute("aria-label");
    };

    expect(renderSummary(JSON.stringify("Legacy quoted guidance"))).toContain(
      'What to verify: "Legacy quoted guidance"'
    );
    cleanup();

    expect(
      renderSummary(
        JSON.stringify({
          content: [{ text: "Legacy paragraph-shaped guidance" }],
          type: "paragraph",
        })
      )
    ).toContain('What to verify: {"content":[{"text":"Legacy paragraph-shaped guidance"}],"type":"paragraph"}');
    cleanup();

    expect(renderSummary(tiptap("Parsed document guidance"))).toContain(
      "What to verify: Parsed document guidance"
    );
  });

  test("joins adjacent inline TipTap text and separates block text", () => {
    const subMilestone = worksheetRows[0]!.subMilestoneDetails[0]!;
    const formattedGuidance = JSON.stringify({
      content: [
        {
          content: [
            { text: "Foot", type: "text" },
            {
              marks: [{ type: "bold" }],
              text: "ings",
              type: "text",
            },
            { text: " layout", type: "text" },
          ],
          type: "paragraph",
        },
        {
          content: [{ text: "Second paragraph", type: "text" }],
          type: "paragraph",
        },
      ],
      type: "doc",
    });

    render(
      <ControlledWorksheet
        initialWorksheetView="table"
        initialRows={[
          {
            ...worksheetRows[0]!,
            subMilestoneDetails: [
              {
                ...subMilestone,
                fieldGuidance: {
                  cameraAnglesTiptapJson: "",
                  whatToVerifyTiptapJson: formattedGuidance,
                },
              },
            ],
          },
        ]}
      />
    );

    expect(
      screen
        .getByTestId(
          "timeline-setup-status-site-prep-foundation-sub-1-guidance"
        )
        .getAttribute("aria-label")
    ).toContain("What to verify: Footings layout Second paragraph");
  });

  test("guards a dirty fallback active sub-milestone before card switching", () => {
    render(
      <ControlledWorksheet
        initialRows={fallbackGuardRows}
        initialWorksheetView="table"
      />
    );

    fireEvent.click(screen.getByRole("tab", { name: "Worksheet" }));
    fireEvent.click(screen.getByTestId("timeline-setup-row-expand-framing"));

    const firstScopeEditor = screen.getByTestId(
      "timeline-setup-submilestone-description-framing-sub-1"
    ) as HTMLTextAreaElement;
    fireEvent.change(firstScopeEditor, {
      target: { value: "Keep this fallback scope draft" },
    });
    fireEvent.click(
      within(
        screen.getByTestId("timeline-setup-submilestone-card-framing-sub-2")
      ).getByRole("button", { name: /^Frame finishes/ })
    );

    expect(
      screen.getByTestId("timeline-setup-unsaved-changes-dialog")
    ).toBeTruthy();
  });

  test("guards a dirty fallback active sub-milestone before details switching", () => {
    render(
      <ControlledWorksheet
        initialRows={fallbackGuardRows}
        initialWorksheetView="table"
      />
    );

    fireEvent.click(
      screen.getByTestId(
        "timeline-setup-table-subrow-details-framing-sub-1"
      )
    );
    const firstSheet = screen.getByTestId(
      "timeline-setup-submilestone-details-sheet-framing-sub-1"
    );
    fireEvent.change(
      within(firstSheet).getByTestId(
        "timeline-setup-submilestone-description-framing-sub-1"
      ),
      { target: { value: "Keep this fallback details draft" } }
    );

    fireEvent.click(
      screen.getByTestId(
        "timeline-setup-table-subrow-details-framing-sub-2"
      )
    );

    expect(
      screen.getByTestId("timeline-setup-unsaved-changes-dialog")
    ).toBeTruthy();
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
        includeChangeMeta
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
    const scopeEditor = within(sheet).getByTestId(
      "timeline-setup-submilestone-description-site-prep-foundation-sub-1"
    ) as HTMLTextAreaElement;
    expect(scopeEditor.value).toBe("Clear the site and pour foundation");

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
      ]),
      expect.objectContaining({ commit: true })
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
        includeChangeMeta
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
      ]),
      expect.objectContaining({ commit: true })
    );

    fireEvent.click(within(sheet).getByRole("tab", { name: "Field Guidance" }));
    const guidanceEditor = within(sheet).getByTestId(
      "timeline-setup-submilestone-guidance-description-site-prep-foundation-sub-1"
    ) as HTMLTextAreaElement;
    expect(guidanceEditor.getAttribute("data-rich-text-editor")).toBe("true");
    expect(guidanceEditor.value).toBe("Verify footing layout before pour");
    const cameraEditor = within(sheet).getByTestId(
      "timeline-setup-submilestone-guidance-camera-site-prep-foundation-sub-1"
    ) as HTMLTextAreaElement;
    expect(cameraEditor.value).toBe("Capture the north and east faces");
    fireEvent.change(guidanceEditor, {
      target: { value: "Verify footing layout before pour." },
    });

    expect(onRowsChange).toHaveBeenCalledTimes(1);
    const saveGuidance = within(sheet).getByTestId(
      "timeline-setup-submilestone-field-guidance-save-site-prep-foundation-sub-1"
    );
    expect(saveGuidance.hasAttribute("disabled")).toBe(false);
    fireEvent.click(saveGuidance);

    expect(onRowsChange).toHaveBeenLastCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          key: "site-prep-foundation",
          subMilestoneDetails: [
            expect.objectContaining({
              description: "Clear the site and pour foundation",
              fieldGuidance: expect.objectContaining({
                whatToVerifyTiptapJson: tiptap(
                  "Verify footing layout before pour."
                ),
              }),
              id: "site-prep-foundation-sub-1",
            }),
          ],
        }),
      ]),
      expect.objectContaining({
        commit: true,
        save: {
          group: "fieldGuidance",
          rowKey: "site-prep-foundation",
          subMilestoneId: "site-prep-foundation-sub-1",
        },
      })
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

  test("keeps scope edits local until explicit save and disables editing while saving", async () => {
    let resolveSave: (() => void) | undefined;
    const onRowsChange = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveSave = resolve;
        })
    );
    render(
      <TimelineMilestoneWorksheetTable
        initialWorksheetView="table"
        mode="setup"
        onRowsChange={onRowsChange}
        rows={worksheetRows}
        templateTitle="Scope save fixture"
      />
    );

    fireEvent.click(
      screen.getByTestId(
        "timeline-setup-table-subrow-details-site-prep-foundation-sub-1"
      )
    );
    const sheet = screen.getByTestId(
      "timeline-setup-submilestone-details-sheet-site-prep-foundation-sub-1"
    );
    const scopeEditor = within(sheet).getByTestId(
      "timeline-setup-submilestone-description-site-prep-foundation-sub-1"
    ) as HTMLTextAreaElement;
    fireEvent.change(scopeEditor, { target: { value: "Updated contract scope" } });

    expect(onRowsChange).not.toHaveBeenCalled();
    const saveScope = within(sheet).getByTestId(
      "timeline-setup-submilestone-scope-save-site-prep-foundation-sub-1"
    );
    expect(saveScope.hasAttribute("disabled")).toBe(false);
    fireEvent.click(saveScope);

    expect(saveScope.hasAttribute("disabled")).toBe(true);
    expect(scopeEditor.hasAttribute("disabled")).toBe(true);
    expect(onRowsChange).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          key: "site-prep-foundation",
          subMilestoneDetails: expect.arrayContaining([
            expect.objectContaining({
              id: "site-prep-foundation-sub-1",
              scopeOfWorkTiptapJson: tiptap("Updated contract scope"),
            }),
          ]),
        }),
      ]),
      {
        commit: true,
        save: {
          group: "scope",
          rowKey: "site-prep-foundation",
          subMilestoneId: "site-prep-foundation-sub-1",
        },
      }
    );

    resolveSave?.();
    await waitFor(() => expect(scopeEditor.hasAttribute("disabled")).toBe(false));
    expect(saveScope.hasAttribute("disabled")).toBe(true);
    expect(scopeEditor.value).toBe("Updated contract scope");
  });

  test("preserves local scope content after a failed save", async () => {
    const onRowsChange = vi.fn(() => Promise.reject(new Error("offline")));
    render(
      <TimelineMilestoneWorksheetTable
        initialWorksheetView="table"
        mode="setup"
        onRowsChange={onRowsChange}
        rows={worksheetRows}
        templateTitle="Scope failure fixture"
      />
    );

    fireEvent.click(
      screen.getByTestId(
        "timeline-setup-table-subrow-details-site-prep-foundation-sub-1"
      )
    );
    const sheet = screen.getByTestId(
      "timeline-setup-submilestone-details-sheet-site-prep-foundation-sub-1"
    );
    const scopeEditor = within(sheet).getByTestId(
      "timeline-setup-submilestone-description-site-prep-foundation-sub-1"
    ) as HTMLTextAreaElement;
    fireEvent.change(scopeEditor, { target: { value: "Keep this failed draft" } });
    fireEvent.click(
      within(sheet).getByTestId(
        "timeline-setup-submilestone-scope-save-site-prep-foundation-sub-1"
      )
    );

    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toContain("offline")
    );
    expect(scopeEditor.value).toBe("Keep this failed draft");
  });

  test("syncs clean external scope updates, preserves dirty drafts, and remounts by identity", () => {
    const firstRow = worksheetRows[0]!;
    const firstSubMilestone = firstRow.subMilestoneDetails[0]!;
    const secondSubMilestone = {
      ...firstSubMilestone,
      id: "site-prep-foundation-sub-2",
      name: "Foundation finish",
      scopeOfWorkTiptapJson: tiptap("Second scope"),
    };
    const identityRows: TimelineMilestoneWorksheetRow[] = [
      {
        ...firstRow,
        subMilestoneDetails: [
          {
            ...firstSubMilestone,
            scopeOfWorkTiptapJson: tiptap("Initial scope"),
          },
          secondSubMilestone,
        ],
        subMilestones: ["Foundation scope", "Foundation finish"],
      },
      ...worksheetRows.slice(1),
    ];
    const replaceFirstScope = (
      rows: TimelineMilestoneWorksheetRow[],
      scopeOfWorkTiptapJson: string
    ) =>
      rows.map((row) =>
        row.key === firstRow.key
          ? {
              ...row,
              subMilestoneDetails: row.subMilestoneDetails.map((detail) =>
                detail.id === firstSubMilestone.id
                  ? { ...detail, scopeOfWorkTiptapJson }
                  : detail
              ),
            }
          : row
      );
    const onRowsChange = vi.fn();
    const { rerender } = render(
      <TimelineMilestoneWorksheetTable
        initialWorksheetView="editor"
        mode="setup"
        onRowsChange={onRowsChange}
        rows={identityRows}
        templateTitle="Scope identity fixture"
      />
    );

    const scopeTestId =
      "timeline-setup-submilestone-description-site-prep-foundation-sub-1";
    const scopeEditor = screen.getByTestId(scopeTestId) as HTMLTextAreaElement;
    expect(scopeEditor.value).toBe("Initial scope");

    const canonicalRows = replaceFirstScope(
      identityRows,
      tiptap("Server canonical scope")
    );
    rerender(
      <TimelineMilestoneWorksheetTable
        initialWorksheetView="editor"
        mode="setup"
        onRowsChange={onRowsChange}
        rows={canonicalRows}
        templateTitle="Scope identity fixture"
      />
    );
    expect((screen.getByTestId(scopeTestId) as HTMLTextAreaElement).value).toBe(
      "Server canonical scope"
    );

    const dirtyScopeEditor = screen.getByTestId(scopeTestId) as HTMLTextAreaElement;
    fireEvent.change(dirtyScopeEditor, {
      target: { value: "Local dirty scope" },
    });
    const divergentRows = replaceFirstScope(
      canonicalRows,
      tiptap("Later server canonical scope")
    );
    rerender(
      <TimelineMilestoneWorksheetTable
        initialWorksheetView="editor"
        mode="setup"
        onRowsChange={onRowsChange}
        rows={divergentRows}
        templateTitle="Scope identity fixture"
      />
    );
    expect((screen.getByTestId(scopeTestId) as HTMLTextAreaElement).value).toBe(
      "Local dirty scope"
    );

    fireEvent.click(
      within(
        screen.getByTestId(
          "timeline-setup-submilestone-card-site-prep-foundation-sub-2"
        )
      ).getByRole("button", { name: /^Foundation finish/ })
    );
    fireEvent.click(screen.getByTestId("timeline-setup-unsaved-changes-discard"));

    expect(
      (screen.getByTestId(
        "timeline-setup-submilestone-description-site-prep-foundation-sub-2"
      ) as HTMLTextAreaElement).value
    ).toBe("Second scope");
  });

  test("saves both Field Guidance editors together without changing Scope", async () => {
    let resolveSave: (() => void) | undefined;
    const onRowsChange = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveSave = resolve;
        })
    );
    render(
      <TimelineMilestoneWorksheetTable
        initialWorksheetView="table"
        mode="setup"
        onRowsChange={onRowsChange}
        rows={worksheetRows}
        templateTitle="Field Guidance save fixture"
      />
    );

    fireEvent.click(
      screen.getByTestId(
        "timeline-setup-table-subrow-details-site-prep-foundation-sub-1"
      )
    );
    const sheet = screen.getByTestId(
      "timeline-setup-submilestone-details-sheet-site-prep-foundation-sub-1"
    );
    fireEvent.click(within(sheet).getByRole("tab", { name: "Field Guidance" }));
    const verificationEditor = within(sheet).getByTestId(
      "timeline-setup-submilestone-guidance-description-site-prep-foundation-sub-1"
    ) as HTMLTextAreaElement;
    const cameraEditor = within(sheet).getByTestId(
      "timeline-setup-submilestone-guidance-camera-site-prep-foundation-sub-1"
    ) as HTMLTextAreaElement;
    fireEvent.change(verificationEditor, {
      target: { value: "Verify embeds and flashing" },
    });
    fireEvent.change(cameraEditor, {
      target: { value: "Capture the west and south faces" },
    });

    expect(onRowsChange).not.toHaveBeenCalled();
    const saveGuidance = within(sheet).getByTestId(
      "timeline-setup-submilestone-field-guidance-save-site-prep-foundation-sub-1"
    );
    expect(saveGuidance.hasAttribute("disabled")).toBe(false);
    fireEvent.click(saveGuidance);

    expect(saveGuidance.hasAttribute("disabled")).toBe(true);
    expect(verificationEditor.hasAttribute("disabled")).toBe(true);
    expect(cameraEditor.hasAttribute("disabled")).toBe(true);
    expect(onRowsChange).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          key: "site-prep-foundation",
          subMilestoneDetails: expect.arrayContaining([
            expect.objectContaining({
              fieldGuidance: {
                cameraAnglesTiptapJson: tiptap("Capture the west and south faces"),
                whatToVerifyTiptapJson: tiptap("Verify embeds and flashing"),
              },
              id: "site-prep-foundation-sub-1",
              scopeOfWorkTiptapJson: tiptap("Clear the site and pour foundation"),
            }),
          ]),
        }),
      ]),
      {
        commit: true,
        save: {
          group: "fieldGuidance",
          rowKey: "site-prep-foundation",
          subMilestoneId: "site-prep-foundation-sub-1",
        },
      }
    );

    resolveSave?.();
    await waitFor(() =>
      expect(verificationEditor.hasAttribute("disabled")).toBe(false)
    );
    expect(saveGuidance.hasAttribute("disabled")).toBe(true);
    expect(cameraEditor.hasAttribute("disabled")).toBe(false);
  });

  test("guards switching away from a dirty active sub-milestone", () => {
    const onBack = vi.fn();
    const firstRow = worksheetRows[0]!;
    const firstSubMilestone = firstRow.subMilestoneDetails[0]!;
    const switchRows = [
      {
        ...firstRow,
        subMilestoneDetails: [
          firstSubMilestone,
          {
            ...firstSubMilestone,
            id: "site-prep-foundation-sub-2",
            name: "Foundation finish",
          },
        ],
        subMilestones: ["Foundation scope", "Foundation finish"],
      },
      ...worksheetRows.slice(1),
    ];
    render(
      <ControlledWorksheet
        initialRows={switchRows}
        onBack={onBack}
      />
    );

    const firstScopeEditor = screen.getByTestId(
      "timeline-setup-submilestone-description-site-prep-foundation-sub-1"
    ) as HTMLTextAreaElement;
    fireEvent.change(firstScopeEditor, {
      target: { value: "Keep this first scope draft" },
    });
    fireEvent.click(
      within(
        screen.getByTestId(
          "timeline-setup-submilestone-card-site-prep-foundation-sub-2"
        )
      ).getByRole("button", { name: /^Foundation finish/ })
    );

    expect(
      screen.getByTestId("timeline-setup-unsaved-changes-dialog")
    ).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Keep editing" }));
    expect(
      screen.getByTestId(
        "timeline-setup-submilestone-description-site-prep-foundation-sub-1"
      )
    ).toBe(firstScopeEditor);
    expect(firstScopeEditor.value).toBe("Keep this first scope draft");

    fireEvent.click(
      within(
        screen.getByTestId(
          "timeline-setup-submilestone-card-site-prep-foundation-sub-2"
        )
      ).getByRole("button", { name: /^Foundation finish/ })
    );
    fireEvent.click(screen.getByTestId("timeline-setup-unsaved-changes-discard"));
    expect(
      screen.getByTestId(
        "timeline-setup-submilestone-description-site-prep-foundation-sub-2"
      )
    ).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Back to templates" }));
    expect(onBack).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId("timeline-setup-unsaved-changes-dialog")).toBeNull();
  });

  test("confirms before closing a sheet with unsaved editor content and clears the dirty key on discard", () => {
    render(
      <TimelineMilestoneWorksheetTable
        initialWorksheetView="table"
        mode="setup"
        onRowsChange={vi.fn()}
        rows={worksheetRows}
        templateTitle="Unsaved close fixture"
      />
    );

    const openDetails = () => {
      fireEvent.click(
        screen.getByTestId(
          "timeline-setup-table-subrow-details-site-prep-foundation-sub-1"
        )
      );
      return screen.getByTestId(
        "timeline-setup-submilestone-details-sheet-site-prep-foundation-sub-1"
      );
    };
    const sheet = openDetails();
    const scopeEditor = within(sheet).getByTestId(
      "timeline-setup-submilestone-description-site-prep-foundation-sub-1"
    ) as HTMLTextAreaElement;
    fireEvent.change(scopeEditor, { target: { value: "Unsaved before close" } });
    fireEvent.click(screen.getByRole("button", { name: "Close" }));

    expect(
      screen.getByTestId("timeline-setup-unsaved-changes-dialog")
    ).toBeTruthy();
    fireEvent.click(screen.getByTestId("timeline-setup-unsaved-changes-discard"));
    expect(
      screen.queryByTestId(
        "timeline-setup-submilestone-details-sheet-site-prep-foundation-sub-1"
      )
    ).toBeNull();

    const reopenedSheet = openDetails();
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(screen.queryByTestId("timeline-setup-unsaved-changes-dialog")).toBeNull();
  });

  test("confirms unsaved edits before Back and Generate navigation", () => {
    const onBack = vi.fn();
    const onComplete = vi.fn();
    render(
      <ControlledWorksheet
        initialWorksheetView="table"
        onBack={onBack}
        onComplete={onComplete}
      />
    );

    fireEvent.click(
      screen.getByTestId(
        "timeline-setup-table-subrow-details-site-prep-foundation-sub-1"
      )
    );
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    fireEvent.click(screen.getByRole("tab", { name: "Worksheet" }));
    fireEvent.change(
      screen.getByTestId(
        "timeline-setup-submilestone-description-site-prep-foundation-sub-1"
      ),
      { target: { value: "Unsaved before back" } }
    );
    fireEvent.click(screen.getByRole("button", { name: "Back to templates" }));
    expect(onBack).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId("timeline-setup-unsaved-changes-discard"));
    expect(onBack).toHaveBeenCalledTimes(1);

    cleanup();
    render(
      <ControlledWorksheet
        initialWorksheetView="table"
        onComplete={onComplete}
      />
    );
    fireEvent.click(screen.getByRole("tab", { name: "Worksheet" }));
    fireEvent.change(
      screen.getByTestId(
        "timeline-setup-submilestone-description-site-prep-foundation-sub-1"
      ),
      { target: { value: "Unsaved before generate" } }
    );
    fireEvent.click(screen.getByTestId("timeline-setup-complete"));
    expect(onComplete).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId("timeline-setup-unsaved-changes-discard"));
    expect(onComplete).toHaveBeenCalledWith({ redirectToDurableRoute: false });
  });

  test("confirms worksheet-view changes before discarding an editor draft", () => {
    const onBack = vi.fn();
    render(
      <ControlledWorksheet
        initialWorksheetView="table"
        onBack={onBack}
      />
    );

    fireEvent.click(screen.getByRole("tab", { name: "Worksheet" }));
    fireEvent.click(screen.getByTestId("timeline-setup-row-expand-framing"));
    const dirtyFramingScope = screen.getByTestId(
      "timeline-setup-submilestone-description-framing-sub-1"
    ) as HTMLTextAreaElement;
    fireEvent.change(dirtyFramingScope, {
      target: { value: "Unrelated framing draft" },
    });

    fireEvent.click(screen.getByRole("tab", { name: "Table view" }));
    expect(
      screen.getByTestId("timeline-setup-unsaved-changes-dialog")
    ).toBeTruthy();
    fireEvent.click(screen.getByTestId("timeline-setup-unsaved-changes-discard"));
    expect(onBack).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("tab", { name: "Worksheet" }));
    const restoredFramingScope = screen.getByTestId(
      "timeline-setup-submilestone-description-framing-sub-1"
    ) as HTMLTextAreaElement;
    expect(restoredFramingScope).not.toBe(dirtyFramingScope);
    expect(restoredFramingScope.value).toBe("Frame walls and roof");

    fireEvent.click(screen.getByRole("button", { name: "Back to templates" }));
    expect(onBack).toHaveBeenCalledTimes(1);
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

  test("rebalances surviving sub-milestones across the included worksheet", () => {
    const nextRows = rebalanceWorksheetCompletionPercentages([
      {
        ...percentageRebalanceRows[0]!,
        subMilestoneDetails:
          percentageRebalanceRows[0]!.subMilestoneDetails.slice(1),
        subMilestones: ["Foundation scope"],
      },
      percentageRebalanceRows[1]!,
    ]);

    expect(nextRows[0]).toMatchObject({
      percentageBps: 2857,
      percentageText: "28.57%",
      subMilestoneDetails: [
        expect.objectContaining({
          id: "site-prep-foundation-sub-2",
          percentageBps: 2857,
          percentageText: "28.57%",
        }),
      ],
    });
    expect(nextRows[1]).toMatchObject({
      percentageBps: 7143,
      percentageText: "71.43%",
      subMilestoneDetails: [
        expect.objectContaining({
          id: "framing-sub-1",
          percentageBps: 7143,
          percentageText: "71.43%",
        }),
      ],
    });
    expect(
      nextRows
        .filter((row) => !row.excluded)
        .reduce((sum, row) => sum + row.percentageBps, 0)
    ).toBe(10_000);
  });

  test("removing a sub-milestone rebalances the controlled settings draft", () => {
    const onRowsChange = vi.fn();
    render(
      <ControlledWorksheet
        initialRows={percentageRebalanceRows}
        mode="settings"
        onRowsChange={onRowsChange}
      />
    );

    fireEvent.click(
      screen.getByTestId("timeline-setup-row-expand-site-prep-foundation")
    );
    fireEvent.click(
      screen.getByTestId(
        "timeline-setup-submilestone-remove-site-prep-foundation-sub-1"
      )
    );

    const nextRows = onRowsChange.mock.lastCall?.[0] as
      | TimelineMilestoneWorksheetRow[]
      | undefined;
    expect(nextRows?.[0]).toMatchObject({
      percentageBps: 2857,
      subMilestoneDetails: [
        expect.objectContaining({
          id: "site-prep-foundation-sub-2",
          percentageBps: 2857,
        }),
      ],
    });
    expect(nextRows?.[1]).toMatchObject({
      percentageBps: 7143,
      subMilestoneDetails: [
        expect.objectContaining({
          id: "framing-sub-1",
          percentageBps: 7143,
        }),
      ],
    });
  });

  test("uses an equal deterministic fallback while preserving excluded weights", () => {
    const excludedRow = {
      ...percentageRebalanceRows[0]!,
      excluded: true,
      percentageBps: 4321,
      percentageText: "43.21%",
    };
    const includedRows = percentageRebalanceRows.map((row, rowIndex) => ({
      ...row,
      key: `${row.key}-${rowIndex}`,
      percentageBps: 0,
      percentageText: "0.00%",
      subMilestoneDetails: [
        {
          ...row.subMilestoneDetails[0]!,
          id: `${row.subMilestoneDetails[0]!.id}-${rowIndex}`,
          percentageBps: 0,
          percentageText: "0.00%",
        },
      ],
    }));

    const nextRows = rebalanceWorksheetCompletionPercentages([
      excludedRow,
      ...includedRows,
    ]);

    expect(nextRows[0]).toEqual(excludedRow);
    expect(nextRows.slice(1).map((row) => row.percentageBps)).toEqual([
      5000, 5000,
    ]);
    expect(
      nextRows
        .slice(1)
        .flatMap((row) => row.subMilestoneDetails)
        .map((subMilestone) => subMilestone.percentageText)
    ).toEqual(["50.00%", "50.00%"]);
  });

  test("normalizes milestone exclusion and re-inclusion across active children", () => {
    const onRowsChange = vi.fn();
    const { container } = render(
      <ControlledWorksheet
        initialRows={percentageRebalanceRows}
        mode="settings"
        onRowsChange={onRowsChange}
      />
    );

    fireEvent.click(
      screen.getByRole("switch", { name: "Include Site prep & foundation" })
    );
    let nextRows = onRowsChange.mock.lastCall?.[0] as
      | TimelineMilestoneWorksheetRow[]
      | undefined;
    expect(nextRows?.[0]).toMatchObject({
      excluded: true,
      percentageBps: 5000,
    });
    expect(nextRows?.[1]).toMatchObject({
      excluded: false,
      percentageBps: 10_000,
      subMilestoneDetails: [
        expect.objectContaining({ percentageBps: 10_000 }),
      ],
    });
    expect(
      container.querySelector(".timeline-blueprint-footer")?.textContent
    ).toContain("100.00%");

    fireEvent.click(
      screen.getByRole("switch", { name: "Include Site prep & foundation" })
    );
    nextRows = onRowsChange.mock.lastCall?.[0] as
      | TimelineMilestoneWorksheetRow[]
      | undefined;
    expect(nextRows?.map((row) => row.percentageBps)).toEqual([3333, 6667]);
    expect(
      nextRows
        ?.flatMap((row) => row.subMilestoneDetails)
        .map((subMilestone) => subMilestone.percentageBps)
    ).toEqual([2000, 1333, 6667]);
  });

  test("uses canonical Milestone deletion when removing a final Sub-milestone", () => {
    const onRowsChange = vi.fn();
    const { container } = render(
      <ControlledWorksheet
        initialRows={worksheetRows}
        initialWorksheetView="table"
        mode="settings"
        onRowsChange={onRowsChange}
      />
    );

    fireEvent.click(
      screen.getByTestId(
        "timeline-setup-table-subrow-details-site-prep-foundation-sub-1"
      )
    );
    fireEvent.click(
      screen.getByTestId(
        "timeline-setup-submilestone-detail-remove-site-prep-foundation-sub-1"
      )
    );

    const finalChildDialog = screen.getByRole("alertdialog");
    expect(
      within(finalChildDialog).getByText(
        /Removing the final Sub-milestone also removes the Site prep & foundation Milestone from this proposal plan/i
      )
    ).toBeTruthy();
    fireEvent.click(
      within(finalChildDialog).getByRole("button", {
        name: "Remove Sub-milestone and Milestone",
      })
    );

    expect(onRowsChange).toHaveBeenLastCalledWith([
      expect.objectContaining({
        dependencyKeys: [],
        key: "framing",
        order: 0,
        percentageBps: 10_000,
        percentageText: "100.00%",
        subMilestoneDetails: [
          expect.objectContaining({
            percentageBps: 10_000,
            percentageText: "100.00%",
          }),
        ],
      }),
    ]);
    expect(
      screen.queryByTestId(
        "timeline-setup-table-row-details-site-prep-foundation"
      )
    ).toBeNull();
    expect(
      screen.queryByTestId(
        "timeline-setup-details-sheet-site-prep-foundation-sub-1"
      )
    ).toBeNull();
    expect(
      container.querySelector(".timeline-blueprint-footer")?.textContent
    ).toContain("10 days");

    expect(
      (
        screen.getByTestId(
          "timeline-settings-table-delete-framing"
        ) as HTMLButtonElement
      ).disabled
    ).toBe(true);
  });

  test("does not remove the final Sub-milestone from the only included Milestone", () => {
    const onRowsChange = vi.fn();
    render(
      <ControlledWorksheet
        initialRows={[worksheetRows[0]!]}
        initialWorksheetView="table"
        mode="settings"
        onRowsChange={onRowsChange}
      />
    );

    fireEvent.click(
      screen.getByTestId(
        "timeline-setup-table-subrow-details-site-prep-foundation-sub-1"
      )
    );
    fireEvent.click(
      screen.getByTestId(
        "timeline-setup-submilestone-detail-remove-site-prep-foundation-sub-1"
      )
    );

    const dialog = screen.getByRole("alertdialog");
    expect(within(dialog).getByText(/final included Milestone/i)).toBeTruthy();
    expect(
      (
        within(dialog).getByRole("button", {
        name: "Remove Sub-milestone and Milestone",
        }) as HTMLButtonElement
      ).disabled
    ).toBe(true);
    expect(onRowsChange).not.toHaveBeenCalled();
  });

  test("confirms milestone deletion, cleans dependencies, and rebalances survivors", () => {
    const onRowsChange = vi.fn();
    render(
      <ControlledWorksheet
        initialRows={percentageRebalanceRows}
        initialWorksheetView="table"
        mode="settings"
        onRowsChange={onRowsChange}
      />
    );

    fireEvent.click(
      screen.getByTestId(
        "timeline-settings-table-delete-site-prep-foundation"
      )
    );
    const dialog = screen.getByRole("alertdialog");
    expect(within(dialog).getByText(/Site prep & foundation/)).toBeTruthy();
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(onRowsChange).not.toHaveBeenCalled();

    fireEvent.click(
      screen.getByTestId(
        "timeline-settings-table-delete-site-prep-foundation"
      )
    );
    fireEvent.click(
      within(screen.getByRole("alertdialog")).getByTestId(
        "timeline-settings-delete-milestone-confirm"
      )
    );

    expect(onRowsChange).toHaveBeenLastCalledWith([
      expect.objectContaining({
        dependencyKeys: [],
        key: "framing",
        order: 0,
        percentageBps: 10_000,
        percentageText: "100.00%",
        subMilestoneDetails: [
          expect.objectContaining({
            percentageBps: 10_000,
            percentageText: "100.00%",
          }),
        ],
      }),
    ]);
  });

  test("exposes milestone deletion from the milestone details sheet", () => {
    render(
      <ControlledWorksheet
        initialRows={percentageRebalanceRows}
        initialWorksheetView="table"
        mode="settings"
      />
    );

    fireEvent.click(
      screen.getByTestId(
        "timeline-setup-table-row-details-site-prep-foundation"
      )
    );

    expect(
      within(
        screen.getByTestId(
          "timeline-setup-details-sheet-site-prep-foundation"
        )
      ).getByTestId(
        "timeline-settings-details-delete-site-prep-foundation"
      )
    ).toBeTruthy();
  });

  test("moves table sub-milestones across groups and recalculates group rollups", () => {
    const movedRows = moveSubMilestoneWithinSummaryRows(
      [
        {
          ...percentageRebalanceRows[0]!,
          startDay: 0,
          subMilestoneDetails:
            percentageRebalanceRows[0]!.subMilestoneDetails.map(
              (subMilestone, index) => ({
                ...subMilestone,
                startDay: index * 14,
              })
            ),
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
      3,
      { includeBudget: true }
    );

    expect(movedRows).toBeTruthy();
    const sitePrep = movedRows?.find(
      (row) => row.key === "site-prep-foundation"
    );
    const framing = movedRows?.find((row) => row.key === "framing");

    expect(sitePrep?.subMilestoneDetails.map((detail) => detail.id)).toEqual([
      "site-prep-foundation-sub-2",
    ]);
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

  test("creates and immediately assigns a new canonical contractor", async () => {
    const onRowsChange = vi.fn();
    const onCreate = vi.fn(async () => ({
      contractorId: "contractor-new",
    }));
    render(
      <ControlledWorksheet
        contractorActions={{
          availableContractors: [],
          onCreate,
        }}
        contractorOptions={[
          {
            contractorId: "contractor-stale-same-name",
            name: "Northstar Masonry",
            trades: ["legacy"],
          },
        ]}
        onRowsChange={onRowsChange}
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

    fireEvent.change(screen.getByPlaceholderText("Northstar Masonry"), {
      target: { value: "Northstar Masonry" },
    });
    fireEvent.change(
      screen.getByPlaceholderText("masonry, brick, envelope"),
      { target: { value: "masonry" } }
    );
    fireEvent.change(screen.getByPlaceholderText("Foundation lead"), {
      target: { value: "Masonry lead" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create and add" }));

    await waitFor(() =>
      expect(onCreate).toHaveBeenCalledWith({
        contractor: expect.objectContaining({
          name: "Northstar Masonry",
          trades: ["masonry"],
        }),
        role: "Masonry lead",
      })
    );
    await waitFor(() =>
      expect(
        screen.queryByRole("heading", { name: "Add contractor to proposal" })
      ).toBeNull()
    );

    expect(
      (
        screen.getByTestId(
          "timeline-setup-contractor-name-site-prep-foundation"
        ) as HTMLInputElement
      ).value
    ).toBe("Northstar Masonry");
    expect(
      (
        screen.getByTestId(
          "timeline-setup-contractor-role-site-prep-foundation"
        ) as HTMLInputElement
      ).value
    ).toBe("Masonry lead");

    fireEvent.click(screen.getAllByLabelText("Foundation scope")[0]);
    fireEvent.click(
      screen.getByTestId("timeline-setup-add-contractor-site-prep-foundation")
    );
    expect(onRowsChange).toHaveBeenLastCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          contractorAssignments: [
            expect.objectContaining({
              contractorId: "contractor-new",
              contractorName: "Northstar Masonry",
              role: "Masonry lead",
            }),
          ],
          key: "site-prep-foundation",
        }),
      ])
    );
  });

  test("keeps contractor creation recoverable when the canonical command fails", async () => {
    const onCreate = vi.fn(async () => {
      throw new Error("Forbidden: brokerage scope / internal request=req-secret");
    });
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
    fireEvent.change(screen.getByPlaceholderText("Northstar Masonry"), {
      target: { value: "Northstar Masonry" },
    });
    fireEvent.change(
      screen.getByPlaceholderText("masonry, brick, envelope"),
      { target: { value: "masonry" } }
    );
    fireEvent.change(screen.getByPlaceholderText("Foundation lead"), {
      target: { value: "Masonry lead" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create and add" }));

    expect(
      await screen.findByText(
        "Unable to create this contractor. Review the profile details and try again."
      )
    ).toBeTruthy();
    expect(screen.queryByText(/Forbidden|request=req-secret|internal/i)).toBeNull();
    expect(
      (
        screen.getByPlaceholderText("Northstar Masonry") as HTMLInputElement
      ).value
    ).toBe("Northstar Masonry");
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
        targetBudgetCents={300_000_00}
      />
    );

    const budgetInput = screen.getByTestId(
      "timeline-setup-row-budget-milestone-1"
    );

    fireEvent.change(budgetInput, { target: { value: "$150,000" } });
    fireEvent.blur(budgetInput);

    expect(onRowsChange).toHaveBeenLastCalledWith([
      expect.objectContaining({
        budgetText: "$150,000",
        key: "milestone-1",
      }),
      expect.objectContaining({
        budgetText: "$150,000",
        key: "milestone-2",
      }),
      expect.objectContaining({
        budgetText: "$200,000",
        excluded: true,
        key: "milestone-3",
      }),
    ]);
  });

  test("rejects and rolls back cascade edits that exceed downstream capacity", () => {
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
        budgetText: "$100,000",
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
    expect(screen.getByRole("alert").textContent).toContain(
      "downstream allocations have only"
    );
  });

  test("rejects and rolls back invalid Cascade currency input", () => {
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
        budgetText: "$100,000",
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
    expect(screen.getByRole("alert").textContent).toContain(
      "valid non-negative budget"
    );
  });

  test("rejects and rolls back a changed final Milestone in Cascade mode", () => {
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
      "timeline-setup-row-budget-milestone-3"
    );
    fireEvent.change(budgetInput, { target: { value: "$150,000" } });
    fireEvent.blur(budgetInput);

    expect(onRowsChange).toHaveBeenLastCalledWith(cascadeRows);
    expect(screen.getByRole("alert").textContent).toContain(
      "no downstream allocation"
    );
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
