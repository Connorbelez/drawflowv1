// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import {
  MilestoneDetailSheet,
  type MilestoneSheetData,
} from "./MilestoneDetailSheet";

const testHooks = vi.hoisted(() => ({
  guidanceDirty: undefined as ((dirty: boolean) => void) | undefined,
}));

vi.mock("../submilestone-scope/ProposalSubmilestoneScopeController.tsx", () => ({
  ProposalSubmilestoneScopeController: ({
    onDirtyChange,
    proposalSubmilestoneId,
    readOnly,
    scopeRoute,
    viewerCapacity,
    workosOrganizationId,
  }: {
    onDirtyChange?: (dirty: boolean) => void;
    proposalSubmilestoneId?: string;
    readOnly?: boolean;
    scopeRoute?: string;
    viewerCapacity?: string;
    workosOrganizationId?: string;
  }) => (
    <>
      <div
        data-proposal-submilestone-id={proposalSubmilestoneId}
        data-read-only={String(readOnly)}
        data-scope-route={scopeRoute}
        data-testid="mock-scope-controller"
        data-viewer-capacity={viewerCapacity}
        data-workos-organization-id={workosOrganizationId}
      />
      <button
        data-testid="legacy-scope-dirty"
        onClick={() => onDirtyChange?.(true)}
        type="button"
      />
    </>
  ),
}));

vi.mock(
  "../submilestone-guidance/ActiveBuildSubmilestoneGuidanceController.tsx",
  () => ({
    ActiveBuildSubmilestoneGuidanceController: ({
      buildSubmilestoneId,
      onDirtyChange,
      proposalSubmilestoneId,
      readOnly,
      viewerCapacity,
      workosOrganizationId,
    }: {
      buildSubmilestoneId?: string;
      onDirtyChange?: (dirty: boolean) => void;
      proposalSubmilestoneId?: string;
      readOnly?: boolean;
      viewerCapacity?: string;
      workosOrganizationId?: string;
    }) => {
      testHooks.guidanceDirty = onDirtyChange;
      return (
        <>
          <div
            data-build-submilestone-id={buildSubmilestoneId}
            data-proposal-submilestone-id={proposalSubmilestoneId}
            data-read-only={String(readOnly)}
            data-testid="mock-guidance-controller"
            data-viewer-capacity={viewerCapacity}
            data-workos-organization-id={workosOrganizationId}
          />
          <button
            data-testid="legacy-guidance-dirty"
            onClick={() => onDirtyChange?.(true)}
            type="button"
          />
        </>
      );
    },
  }),
);

afterEach(() => {
  cleanup();
  testHooks.guidanceDirty = undefined;
});

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
      executionSummary: "Set and verify footing forms in the field.",
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
      executionSummary: "Place and cure the foundation concrete.",
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

  test("keeps the guided escape hatch active for a legacy claim with incomplete work", () => {
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
    expect(primaryAction.textContent).toContain("Complete remaining work");
    expect(screen.getByText("Claim submitted · work incomplete")).toBeTruthy();

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
    expect(primaryAction.textContent).toContain("Complete remaining work");

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
      screen.getByText("Set and verify footing forms in the field."),
    ).toBeTruthy();

    fireEvent.click(screen.getByRole("tab", { name: "Notes & history" }));
    expect(screen.getByText("Execution history")).toBeTruthy();
    expect(screen.getByText("Inspector verified footing dimensions.")).toBeTruthy();
  });

  test("does not render a legacy description as contractual Scope", () => {
    const legacyDescription =
      "Legacy scope text must not appear in the execution surface.";
    const dataWithLegacyDescription = {
      ...sheetData,
      submilestones: [
        {
          ...sheetData.submilestones![0],
          description: legacyDescription,
        },
      ],
    } as unknown as MilestoneSheetData;

    render(
      <MilestoneDetailSheet
        data={dataWithLegacyDescription}
        onClose={vi.fn()}
        onUpdateSubmilestone={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /Footing forms/ }));

    expect(screen.queryByText(legacyDescription)).toBeNull();
    expect(screen.getByText("Set and verify footing forms in the field.")).toBeTruthy();
  });

  test("passes canonical identity and capacity to one active work-item context", () => {
    render(
      <MilestoneDetailSheet
        data={{
          ...sheetData,
          submilestones: [
            {
              ...sheetData.submilestones![0],
              buildSubmilestoneId: "build-forms",
              proposalSubmilestoneId: "proposal-forms",
            },
          ],
        }}
        onClose={vi.fn()}
        readOnly
        viewerCapacity="admin"
        workosOrganizationId="org-test"
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /Footing forms/ }));

    expect(screen.getAllByTestId("canonical-work-item-context")).toHaveLength(1);
    expect(
      screen.getByTestId("mock-scope-controller").getAttribute(
        "data-proposal-submilestone-id",
      ),
    ).toBe("proposal-forms");
    expect(
      screen.getByTestId("mock-scope-controller").getAttribute(
        "data-scope-route",
      ),
    ).toBe("active-build");
    expect(
      screen.getByTestId("mock-scope-controller").getAttribute(
        "data-viewer-capacity",
      ),
    ).toBe("admin");
    expect(
      screen.getByTestId("mock-scope-controller").getAttribute(
        "data-read-only",
      ),
    ).toBe("true");
    expect(
      screen.getByTestId("mock-guidance-controller").getAttribute(
        "data-build-submilestone-id",
      ),
    ).toBe("build-forms");

    fireEvent.click(screen.getByRole("button", { name: "Back to milestone" }));
    expect(
      (screen.getByTestId(
        "milestone-primary-completion-action",
      ) as HTMLButtonElement).disabled,
    ).toBe(true);
  });

  test.each([
    ["build", { buildSubmilestoneId: "row-build" }],
    ["proposal", { proposalSubmilestoneId: "row-proposal" }],
  ])(
    "does not mix a partial row %s ID with sheet lineage fallbacks",
    (_source, rowIdentity) => {
      render(
        <MilestoneDetailSheet
          buildSubmilestoneId="sheet-build"
          data={{
            ...sheetData,
            submilestones: [
              {
                ...sheetData.submilestones![0],
                ...rowIdentity,
              },
            ],
          }}
          onClose={vi.fn()}
          proposalSubmilestoneId="sheet-proposal"
          workosOrganizationId="org-test"
        />,
      );

      fireEvent.click(screen.getByRole("button", { name: /Footing forms/ }));

      // An incomplete row pair cannot resolve either canonical controller;
      // most importantly, it must not render a mixed row/sheet lineage.
      expect(screen.queryByTestId("canonical-work-item-context")).toBeNull();
    },
  );

  test("uses the sheet identity pair only when the row has no IDs", () => {
    render(
      <MilestoneDetailSheet
        buildSubmilestoneId="sheet-build"
        data={{
          ...sheetData,
          submilestones: [sheetData.submilestones![0]],
        }}
        onClose={vi.fn()}
        proposalSubmilestoneId="sheet-proposal"
        readOnly
        workosOrganizationId="org-test"
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /Footing forms/ }));

    expect(screen.getByTestId("canonical-work-item-context")).toBeTruthy();
    expect(
      screen.getByTestId("mock-guidance-controller").getAttribute(
        "data-build-submilestone-id",
      ),
    ).toBe("sheet-build");
    expect(
      screen.getByTestId("mock-guidance-controller").getAttribute(
        "data-proposal-submilestone-id",
      ),
    ).toBe("sheet-proposal");
  });

  test("guards legacy sheet close once canonical Scope or Guidance is dirty", () => {
    const onClose = vi.fn();
    render(
      <MilestoneDetailSheet
        data={{
          ...sheetData,
          submilestones: [
            {
              ...sheetData.submilestones![0],
              buildSubmilestoneId: "build-forms",
              proposalSubmilestoneId: "proposal-forms",
            },
          ],
        }}
        onClose={onClose}
        workosOrganizationId="org-test"
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /Footing forms/ }));
    fireEvent.click(screen.getByTestId("legacy-scope-dirty"));
    fireEvent.click(screen.getByTestId("legacy-guidance-dirty"));
    fireEvent.click(screen.getByTestId("milestone-detail-sheet-close"));

    expect(screen.getByTestId("milestone-detail-unsaved-dialog")).toBeTruthy();
    expect(onClose).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Keep editing" }));
    expect(screen.queryByTestId("milestone-detail-unsaved-dialog")).toBeNull();
    expect(onClose).not.toHaveBeenCalled();

    fireEvent.click(screen.getByTestId("milestone-detail-sheet-close"));
    fireEvent.click(screen.getByTestId("milestone-detail-unsaved-discard"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  test("guards legacy detail navigation and discards canonical draft state", () => {
    render(
      <MilestoneDetailSheet
        data={{
          ...sheetData,
          submilestones: [
            {
              ...sheetData.submilestones![0],
              buildSubmilestoneId: "build-forms",
              proposalSubmilestoneId: "proposal-forms",
            },
          ],
        }}
        onClose={vi.fn()}
        workosOrganizationId="org-test"
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /Footing forms/ }));
    fireEvent.click(screen.getByTestId("legacy-guidance-dirty"));
    fireEvent.click(screen.getByRole("button", { name: "Back to milestone" }));

    expect(screen.getByTestId("milestone-detail-unsaved-dialog")).toBeTruthy();
    fireEvent.click(screen.getByTestId("milestone-detail-unsaved-discard"));
    expect(screen.getByText("Milestone execution")).toBeTruthy();
  });

  test("guards the footer Guided completion transition with Keep editing and Discard", () => {
    render(
      <MilestoneDetailSheet
        data={{
          ...sheetData,
          submilestones: [
            {
              ...sheetData.submilestones![0],
              buildSubmilestoneId: "build-forms",
              proposalSubmilestoneId: "proposal-forms",
            },
          ],
        }}
        onClose={vi.fn()}
        workosOrganizationId="org-test"
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /Footing forms/ }));
    fireEvent.click(screen.getByTestId("legacy-scope-dirty"));
    const primaryAction = screen.getByTestId(
      "milestone-primary-completion-action",
    );
    fireEvent.click(primaryAction);

    expect(screen.getByTestId("milestone-detail-unsaved-dialog")).toBeTruthy();
    expect(screen.getByText(/open Guided completion/)).toBeTruthy();
    expect(screen.queryByText("Guided completion")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Keep editing" }));
    expect(screen.queryByTestId("milestone-detail-unsaved-dialog")).toBeNull();
    expect(screen.queryByText("Guided completion")).toBeNull();

    fireEvent.click(primaryAction);
    fireEvent.click(screen.getByTestId("milestone-detail-unsaved-discard"));
    expect(screen.getByText("Guided completion")).toBeTruthy();
  });

  test("readOnly disables every mutating legacy control even when callbacks exist", () => {
    const callbacks = {
      onApprove: vi.fn(),
      onAssignContractor: vi.fn(),
      onAssignVisit: vi.fn(),
      onAmendStart: vi.fn(),
      onReject: vi.fn(),
      onRequestInfo: vi.fn(),
      onStartSubmilestone: vi.fn(),
      onStartWork: vi.fn(),
      onSubmitCompletion: vi.fn(),
      onUpdateSubmilestone: vi.fn().mockResolvedValue(undefined),
      onUploadEvidence: vi.fn(),
    };
    render(
      <MilestoneDetailSheet
        {...callbacks}
        data={{
          ...sheetData,
          actualStartedAt: Date.parse("2026-08-05T12:00:00Z"),
          submilestones: [
            {
              ...sheetData.submilestones![0],
              buildSubmilestoneId: "build-forms",
              proposalSubmilestoneId: "proposal-forms",
            },
          ],
        }}
        onClose={vi.fn()}
        readOnly
        workosOrganizationId="org-test"
      />,
    );

    const primaryAction = screen.getByTestId(
      "milestone-primary-completion-action",
    );
    expect((primaryAction as HTMLButtonElement).disabled).toBe(true);
    expect(screen.queryByTestId("submilestone-start-work-forms")).toBeNull();
    expect(screen.queryByRole("button", { name: "Mark complete" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Reopen" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Approve" })).toBeNull();
    expect(
      (screen.getByLabelText(/Actual realized cost/) as HTMLInputElement)
        .disabled,
    ).toBe(true);
    expect(
      (screen.getByLabelText(/Evidence 0/) as HTMLInputElement).disabled,
    ).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: /Footing forms/ }));
    expect(screen.queryByTestId("submilestone-detail-start-work-forms")).toBeNull();
    expect(
      (screen.getByLabelText(/Actual realized cost/) as HTMLInputElement)
        .disabled,
    ).toBe(true);
    fireEvent.click(screen.getByRole("tab", { name: "Notes & history" }));
    expect((screen.getByLabelText("Field note") as HTMLTextAreaElement).disabled).toBe(
      true,
    );
    expect(screen.getByRole("button", { name: "Save field note" })).toHaveProperty(
      "disabled",
      true,
    );
    fireEvent.click(screen.getByRole("tab", { name: "Evidence" }));
    expect(
      (screen.getByLabelText("Choose file") as HTMLInputElement).disabled,
    ).toBe(true);
  });

  test("guards guided row completion and advance with Keep editing and Discard", async () => {
    const onUpdateSubmilestone = vi.fn().mockResolvedValue(undefined);
    render(
      <MilestoneDetailSheet
        data={{
          ...sheetData,
          submilestones: [
            {
              ...sheetData.submilestones![0],
              buildSubmilestoneId: "build-forms",
              proposalSubmilestoneId: "proposal-forms",
            },
          ],
        }}
        onClose={vi.fn()}
        onUpdateSubmilestone={onUpdateSubmilestone}
        workosOrganizationId="org-test"
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /Footing forms/ }));
    fireEvent.click(screen.getByTestId("milestone-primary-completion-action"));
    expect(testHooks.guidanceDirty).toEqual(expect.any(Function));
    fireEvent.click(screen.getByRole("button", { name: "5. Review" }));
    act(() => {
      testHooks.guidanceDirty?.(true);
    });

    const completeButton = screen.getByRole("button", {
      name: "Mark complete & next",
    });
    fireEvent.click(completeButton);

    expect(screen.getByTestId("milestone-detail-unsaved-dialog")).toBeTruthy();
    expect(onUpdateSubmilestone).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Keep editing" }));
    expect(screen.queryByTestId("milestone-detail-unsaved-dialog")).toBeNull();
    expect(screen.getByText("Review completion")).toBeTruthy();
    expect(onUpdateSubmilestone).not.toHaveBeenCalled();

    fireEvent.click(completeButton);
    fireEvent.click(screen.getByTestId("milestone-detail-unsaved-discard"));

    await waitFor(() => expect(onUpdateSubmilestone).toHaveBeenCalledTimes(1));
    expect(screen.getByText("Milestone execution")).toBeTruthy();
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
