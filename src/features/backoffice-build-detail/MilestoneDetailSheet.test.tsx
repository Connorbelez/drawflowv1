// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
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
      siteVisits: [
        {
          completedAt: "2026-08-08T16:00:00.000Z",
          recordNote: "Inspector verified footing dimensions.",
          recordNoteFormat: "plain_text",
          requestedAt: "2026-08-07T12:00:00.000Z",
          status: "complete",
          visitId: "visit-forms",
        },
      ],
      startDate: "2026-08-04",
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
      materials: [],
      name: "Concrete pour",
      order: 2,
      siteVisits: [],
      startDate: "2026-08-09",
      status: "complete",
      workflowRevision: 11,
    },
  ],
};

describe("MilestoneDetailSheet", () => {
  test("opens the exact collaboration-linked submilestone detail", async () => {
    render(
      <MilestoneDetailSheet
        data={sheetData}
        focusedSubmilestoneId="submilestone-pour"
        focusedSubmilestoneKey="pour"
        onClose={vi.fn()}
      />,
    );

    expect(await screen.findByText("Submilestone detail")).toBeTruthy();
    expect(
      screen.getByRole("heading", { name: "Concrete pour" }),
    ).toBeTruthy();
  });

  test("keeps the guided escape hatch active for a legacy claim with incomplete scope", () => {
    render(
      <MilestoneDetailSheet
        data={{
          ...sheetData,
          submittedAt: Date.parse("2026-07-22T12:00:00Z"),
        }}
        onClose={vi.fn()}
        onUpdateSubmilestone={vi.fn().mockResolvedValue(undefined)}
      />,
    );

    const primaryAction = screen.getByTestId("milestone-primary-completion-action");
    expect((primaryAction as HTMLButtonElement).disabled).toBe(false);
    expect(primaryAction.textContent).toContain("Complete remaining scope");
    expect(screen.getByText("Claim submitted · scope incomplete")).toBeTruthy();

    fireEvent.click(primaryAction);
    expect(screen.getByText("Guided completion")).toBeTruthy();
    expect(screen.getByText("Current work item").parentElement?.textContent).toContain(
      "Footing forms",
    );
  });

  test("uses the active guided escape hatch until every submilestone is complete", async () => {
    const onUpdateSubmilestone = vi.fn().mockResolvedValue(undefined);
    const onSubmitCompletion = vi.fn().mockResolvedValue(undefined);

    render(
      <MilestoneDetailSheet
        data={sheetData}
        onClose={vi.fn()}
        onSubmitCompletion={onSubmitCompletion}
        onUpdateSubmilestone={onUpdateSubmilestone}
      />,
    );

    const primaryAction = screen.getByTestId("milestone-primary-completion-action");
    expect((primaryAction as HTMLButtonElement).disabled).toBe(false);
    expect(primaryAction.textContent).toContain("Complete remaining scope");

    fireEvent.click(primaryAction);
    expect(screen.getByText("Guided completion")).toBeTruthy();
    expect(screen.getByText("Current work item").parentElement?.textContent).toContain(
      "Footing forms",
    );

    fireEvent.click(screen.getByRole("button", { name: "5. Review" }));
    fireEvent.click(screen.getByRole("button", { name: "Mark complete & next" }));

    await waitFor(() =>
      expect(onUpdateSubmilestone).toHaveBeenCalledWith({
        expectedRevision: 7,
        idempotencyKey: expect.any(String),
        milestoneKey: "foundation",
        status: "complete",
        submilestoneKey: "forms",
      }),
    );
    await waitFor(() =>
      expect(
        screen.getByTestId("milestone-primary-completion-action").textContent,
      ).toContain("Submit milestone completion"),
    );

    fireEvent.click(screen.getByTestId("milestone-primary-completion-action"));
    await waitFor(() =>
      expect(onSubmitCompletion).toHaveBeenCalledWith({
        completedDay: 14,
        idempotencyKey: expect.any(String),
        milestoneKey: "foundation",
      }),
    );
  });

  test("opens a submilestone detail surface with system-backed tabs", () => {
    render(
      <MilestoneDetailSheet
        data={sheetData}
        onClose={vi.fn()}
        onUpdateSubmilestone={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /Footing forms/ }));
    expect(screen.getByText("Submilestone detail")).toBeTruthy();
    expect(screen.getByRole("tab", { name: "Evidence" })).toBeTruthy();
    expect(screen.getByRole("tab", { name: "People" })).toBeTruthy();
    expect(screen.getByRole("tab", { name: "Materials" })).toBeTruthy();
    expect(screen.getByRole("tab", { name: "Notes & history" })).toBeTruthy();
    expect(
      screen.getByText("Set and verify footing forms against the approved plan."),
    ).toBeTruthy();

    fireEvent.click(screen.getByRole("tab", { name: "Notes & history" }));
    expect(screen.getByText("Execution history")).toBeTruthy();
    expect(screen.getByText("Inspector verified footing dimensions.")).toBeTruthy();
  });

  test("attributes submilestone starts to ledger, detail, and guided entry sources", () => {
    const onStartSubmilestone = vi.fn();
    render(
      <MilestoneDetailSheet
        data={sheetData}
        onClose={vi.fn()}
        onStartSubmilestone={onStartSubmilestone}
        onUpdateSubmilestone={vi.fn()}
      />
    );

    fireEvent.click(screen.getByTestId("submilestone-start-work-forms"));
    expect(onStartSubmilestone).toHaveBeenLastCalledWith(
      "foundation",
      "forms",
      "submilestone_ledger"
    );

    fireEvent.click(screen.getByRole("button", { name: /Footing forms/ }));
    fireEvent.click(
      screen.getByTestId("submilestone-detail-start-work-forms")
    );
    expect(onStartSubmilestone).toHaveBeenLastCalledWith(
      "foundation",
      "forms",
      "submilestone_detail"
    );

    fireEvent.click(screen.getByRole("button", { name: "Back to milestone" }));
    fireEvent.click(screen.getByTestId("milestone-primary-completion-action"));
    fireEvent.click(
      screen.getByTestId("submilestone-guided-start-work-forms")
    );
    expect(onStartSubmilestone).toHaveBeenLastCalledWith(
      "foundation",
      "forms",
      "guided_field_workflow"
    );
  });

  test("uses the exact workflow revision and reuses the lifecycle key after a completion retry", async () => {
    let attempts = 0;
    const onUpdateSubmilestone = vi.fn().mockImplementation(() => {
      attempts += 1;
      return attempts === 1
        ? Promise.reject(new Error("temporary network failure"))
        : Promise.resolve(undefined);
    });

    render(
      <MilestoneDetailSheet
        data={sheetData}
        onClose={vi.fn()}
        onUpdateSubmilestone={onUpdateSubmilestone}
      />,
    );

    const markComplete = screen.getByRole("button", { name: "Mark complete" });
    fireEvent.click(markComplete);
    await waitFor(() => expect(onUpdateSubmilestone).toHaveBeenCalledTimes(1));

    fireEvent.click(markComplete);
    await waitFor(() => expect(onUpdateSubmilestone).toHaveBeenCalledTimes(2));

    const firstInput = onUpdateSubmilestone.mock.calls[0][0];
    const retryInput = onUpdateSubmilestone.mock.calls[1][0];
    expect(firstInput).toMatchObject({
      expectedRevision: 7,
      milestoneKey: "foundation",
      status: "complete",
      submilestoneKey: "forms",
    });
    expect(retryInput).toMatchObject({
      expectedRevision: 7,
      milestoneKey: "foundation",
      status: "complete",
      submilestoneKey: "forms",
    });
    expect(firstInput.idempotencyKey).toEqual(retryInput.idempotencyKey);
    expect(firstInput.idempotencyKey).toEqual(expect.any(String));
  });

  test("completes an in-progress submilestone directly with its revision and lifecycle key", async () => {
    const onUpdateSubmilestone = vi.fn().mockResolvedValue(undefined);
    render(
      <MilestoneDetailSheet
        data={{
          ...sheetData,
          submilestones: [
            {
              ...sheetData.submilestones![0],
              actualStartedAt: Date.parse("2026-08-05T12:00:00Z"),
              status: "in_progress",
              workflowRevision: 23,
            },
          ],
        }}
        onClose={vi.fn()}
        onUpdateSubmilestone={onUpdateSubmilestone}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Mark complete" }));
    await waitFor(() =>
      expect(onUpdateSubmilestone).toHaveBeenCalledWith({
        expectedRevision: 23,
        idempotencyKey: expect.any(String),
        milestoneKey: "foundation",
        status: "complete",
        submilestoneKey: "forms",
      }),
    );
  });

  test("fails closed when the canonical workflow revision is unavailable", async () => {
    const onUpdateSubmilestone = vi.fn().mockResolvedValue(undefined);
    const withoutRevision = sheetData.submilestones!.map(
      ({ workflowRevision: _workflowRevision, ...row }) => row,
    );

    render(
      <MilestoneDetailSheet
        data={{ ...sheetData, submilestones: withoutRevision }}
        onClose={vi.fn()}
        onUpdateSubmilestone={onUpdateSubmilestone}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Mark complete" }));
    expect(onUpdateSubmilestone).not.toHaveBeenCalled();
    expect((await screen.findByRole("alert")).textContent).toContain(
      "canonical workflow revision is unavailable",
    );
  });
});
