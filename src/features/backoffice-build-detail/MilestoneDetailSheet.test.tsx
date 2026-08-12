// @vitest-environment jsdom

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import type { ComponentProps } from "react";
import { afterEach, describe, expect, test, vi } from "vitest";
import {
  MilestoneDetailSheet,
  type MilestoneSheetData,
} from "./MilestoneDetailSheet";

afterEach(cleanup);

const sheetData: MilestoneSheetData = {
  column: "In progress",
  contractors: [],
  currentDay: 14,
  drawGroupKey: "draw-02",
  milestoneKey: "foundation",
  name: "Foundation",
  plannedBudgetCents: 60_000_000,
  plannedEndDate: "2026-08-21",
  plannedStartDate: "2026-08-04",
  recentEvents: [],
  submilestones: [
    {
      assignments: [],
      budgetCents: 20_000_000,
      description: "Set and verify footing forms against the approved plan.",
      endDate: "2026-08-08",
      evidence: [],
      key: "forms",
      submilestoneId: "submilestone-forms",
      materials: [
        {
          id: "material-forms",
          quantity: 24,
          title: "Formwork panels",
          totalCents: 320_000,
          type: "material",
        },
      ],
      name: "Footing forms",
      order: 1,
      siteVisits: [],
      startDate: "2026-08-04",
      scheduleHealth: { health: "on_track", overdueDays: 0 },
      status: "planned",
      workflowRevision: 7,
    },
    {
      assignments: [],
      budgetCents: 40_000_000,
      completedAt: Date.parse("2026-08-11T12:00:00Z"),
      description: "Place and cure the approved foundation concrete.",
      endDate: "2026-08-21",
      evidence: [],
      key: "pour",
      submilestoneId: "submilestone-pour",
      materials: [],
      name: "Concrete pour",
      order: 2,
      siteVisits: [],
      startDate: "2026-08-09",
      status: "complete",
      workflowRevision: 11,
    },
    {
      assignments: [],
      budgetCents: 10_000_000,
      description: "Complete the drainage and electrical rough-in scope.",
      endDate: "2026-08-03",
      evidence: [],
      key: "dc-ed",
      materials: [],
      name: "DC/ED",
      order: 3,
      scheduleHealth: { health: "behind_schedule", overdueDays: 4 },
      siteVisits: [],
      startDate: "2026-07-30",
      status: "in_progress",
      submilestoneId: "submilestone-dc-ed",
      workflowRevision: 12,
    },
  ],
};

function renderSheet(
  props: Partial<ComponentProps<typeof MilestoneDetailSheet>> = {},
) {
  return render(
    <MilestoneDetailSheet data={sheetData} onClose={vi.fn()} {...props} />,
  );
}

describe("MilestoneDetailSheet", () => {
  test("renders only the parent aggregate and read-only child ledger", () => {
    renderSheet();

    expect(screen.getByText("Milestone execution")).toBeTruthy();
    expect(screen.getByText("Sub-milestone scope")).toBeTruthy();
    expect(screen.getByText("Footing forms")).toBeTruthy();
    expect(screen.getByText("Concrete pour")).toBeTruthy();
    expect(screen.queryByText("Submilestone detail")).toBeNull();
    expect(screen.queryByText("Guided completion")).toBeNull();
    expect(screen.queryByRole("tab")).toBeNull();
    expect(
      screen.getAllByRole("button", { name: "Open Sub-milestone" })[0],
    ).toHaveProperty("disabled", true);
  });

  test("retains In progress while showing accessible active overdue health", () => {
    const row = () => screen.getByTestId("milestone-scope-row-dc-ed");
    renderSheet();

    expect(within(row()).getByText("In progress")).toBeTruthy();
    expect(
      within(row()).getByText("Behind schedule · 4 days overdue"),
    ).toBeTruthy();
    expect(
      within(row()).getByLabelText(
        "In progress, behind schedule, 4 days overdue; planned end 2026-08-03",
      ),
    ).toBeTruthy();
  });

  test("does not give planned or complete rows the active overdue treatment", () => {
    const firstChild = sheetData.submilestones?.[0];
    const secondChild = sheetData.submilestones?.[1];
    if (!firstChild || !secondChild) {
      throw new Error("Expected child fixtures.");
    }

    renderSheet({
      data: {
        ...sheetData,
        submilestones: [
          {
            ...firstChild,
            scheduleHealth: { health: "behind_schedule", overdueDays: 4 },
          },
          {
            ...secondChild,
            scheduleHealth: { health: "behind_schedule", overdueDays: 4 },
            status: "complete",
          },
        ],
      },
    });

    expect(screen.queryByText("Behind schedule · 4 days overdue")).toBeNull();
  });

  test("routes the child ledger to the canonical Overview exactly once", () => {
    const onOpenCanonicalTarget = vi.fn();
    renderSheet({ onOpenCanonicalTarget });

    fireEvent.click(
      screen.getAllByRole("button", { name: "Open Sub-milestone" })[0],
    );

    expect(onOpenCanonicalTarget).toHaveBeenCalledTimes(1);
    expect(onOpenCanonicalTarget).toHaveBeenCalledWith(
      { kind: "submilestone", submilestoneId: "submilestone-forms" },
      { selectedTab: "overview" },
    );
  });

  test.each([
    ["People", "people"],
    ["Materials", "materials"],
    ["Evidence", "evidence"],
    ["Collaboration", "collaboration"],
    ["Review", "review"],
  ] as const)("routes %s to the canonical tab", (label, selectedTab) => {
    const onOpenCanonicalTarget = vi.fn();
    renderSheet({ onOpenCanonicalTarget });

    fireEvent.click(screen.getAllByRole("button", { name: label })[0]);

    expect(onOpenCanonicalTarget).toHaveBeenCalledWith(
      { kind: "submilestone", submilestoneId: "submilestone-forms" },
      { selectedTab },
    );
  });

  test("Complete remaining scope opens canonical Review instead of guided legacy UI", () => {
    const onOpenCanonicalTarget = vi.fn();
    renderSheet({ onOpenCanonicalTarget });

    fireEvent.click(
      screen.getByTestId("milestone-primary-completion-action"),
    );

    expect(onOpenCanonicalTarget).toHaveBeenCalledWith(
      { kind: "submilestone", submilestoneId: "submilestone-forms" },
      { selectedTab: "review" },
    );
    expect(screen.queryByText("Guided completion")).toBeNull();
  });

  test("fails closed when a child has no canonical id", () => {
    const onOpenCanonicalTarget = vi.fn();
    const firstChild = sheetData.submilestones?.[0];
    if (!firstChild) {
      throw new Error("Expected a child fixture.");
    }
    renderSheet({
      data: {
        ...sheetData,
        submilestones: [{ ...firstChild, submilestoneId: undefined }],
      },
      onOpenCanonicalTarget,
    });

    const openButton = screen.getByRole("button", {
      name: "Open Sub-milestone",
    });
    expect((openButton as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(openButton);
    expect(onOpenCanonicalTarget).not.toHaveBeenCalled();
  });

  test("retains parent start, completion, and approval actions", async () => {
    const onStartWork = vi.fn();
    const onSubmitCompletion = vi.fn().mockResolvedValue(undefined);
    const onApprove = vi.fn();
    renderSheet({
      data: {
        ...sheetData,
        submilestones: sheetData.submilestones?.map((row) => ({
          ...row,
          status: "complete",
        })),
        canStartWork: true,
      },
      onApprove,
      onStartWork,
      onSubmitCompletion,
    });

    fireEvent.click(screen.getByTestId("milestone-detail-sheet-start-work"));
    expect(onStartWork).toHaveBeenCalledWith("foundation", undefined);
    fireEvent.click(
      screen.getByTestId("milestone-primary-completion-action"),
    );
    await waitFor(() => expect(onSubmitCompletion).toHaveBeenCalled());

    fireEvent.click(screen.getByRole("button", { name: "Approve milestone" }));
    expect(onApprove).toHaveBeenCalledWith("foundation", undefined);
  });
});
