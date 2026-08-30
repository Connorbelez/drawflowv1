// @vitest-environment jsdom

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";

const scopeControllerPropsMock = vi.hoisted(() => vi.fn());

vi.mock("#/features/submilestone-scope/ProposalSubmilestoneScopeController.tsx", () => ({
  ProposalSubmilestoneScopeController: (props: Record<string, unknown>) => {
    scopeControllerPropsMock(props);
    return <output data-testid="proposal-scope-revision-controller">revision</output>;
  },
}));

import {
  PRODUCTION_MILESTONE_WORKSHEET_SAVE_DEBOUNCE_MS,
  ProductionProposalMilestoneWorksheet,
} from "./ProductionProposalMilestoneWorksheet.tsx";

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

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const detail = {
  milestones: [
    {
      budgetCents: 94_360_00,
      dayEnd: 27,
      dayStart: 0,
      durationDays: 28,
      icon: "foundation" as const,
      key: "four-plex-draw-01",
      name: "Permits, demo & foundation",
      order: 1,
    },
  ],
  proposal: {
    proposedStartDate: "2026-06-01",
    status: "draft",
    totalBudgetCents: 622_440_00,
  },
  submilestones: [
    {
      budgetCents: 2_400_00,
      durationDays: 1,
      key: "dc-ed",
      milestoneKey: "four-plex-draw-01",
      name: "DC/ED",
      order: 1,
      startDay: 0,
    },
  ],
};

describe("ProductionProposalMilestoneWorksheet", () => {
  test("does not render timeline setup actions for an existing proposal worksheet", () => {
    render(
      <ProductionProposalMilestoneWorksheet
        detail={detail}
        templateTitle="4-plex Proposal"
      />
    );

    expect(screen.queryByText("Back to templates")).toBeNull();
    expect(screen.queryByText("Generate timeline")).toBeNull();
  });

  test("debounces persistence only after an input is committed", () => {
    vi.useFakeTimers();
    const onPersistRows = vi.fn();

    render(
      <ProductionProposalMilestoneWorksheet
        detail={detail}
        onPersistRows={onPersistRows}
        templateTitle="4-plex Proposal"
      />
    );

    const budgetInput = screen
      .getAllByTestId("timeline-setup-submilestone-budget-dc-ed")
      .find((element) => element.getAttribute("aria-hidden") !== "true");
    expect(budgetInput).toBeDefined();

    fireEvent.change(budgetInput!, { target: { value: "$95,000" } });
    vi.advanceTimersByTime(PRODUCTION_MILESTONE_WORKSHEET_SAVE_DEBOUNCE_MS + 1);

    expect(onPersistRows).not.toHaveBeenCalled();

    fireEvent.blur(budgetInput!);
    vi.advanceTimersByTime(PRODUCTION_MILESTONE_WORKSHEET_SAVE_DEBOUNCE_MS - 1);

    expect(onPersistRows).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);

    expect(onPersistRows).toHaveBeenCalledTimes(1);
  });

  test("persists an explicit Scope save immediately and disables it while saving", async () => {
    let resolvePersist!: () => void;
    const persistence = new Promise<void>((resolve) => {
      resolvePersist = resolve;
    });
    const onPersistRows = vi.fn(() => persistence);

    render(
      <ProductionProposalMilestoneWorksheet
        detail={detail}
        onPersistRows={onPersistRows}
        templateTitle="4-plex Proposal"
      />
    );

    fireEvent.click(
      screen.getByTestId("timeline-setup-table-row-details-four-plex-draw-01")
    );
    const sheet = screen.getByTestId(
      "timeline-setup-details-sheet-four-plex-draw-01"
    );
    const scopeEditor = within(sheet).getByTestId(
      "timeline-setup-submilestone-description-dc-ed"
    );
    fireEvent.change(scopeEditor, { target: { value: "Issued footing scope" } });
    const saveButton = within(sheet).getByTestId(
      "timeline-setup-submilestone-scope-save-dc-ed"
    );
    fireEvent.click(saveButton);

    await waitFor(() => expect(onPersistRows).toHaveBeenCalledTimes(1));
    expect((saveButton as HTMLButtonElement).disabled).toBe(true);

    resolvePersist();
  });

  test("keeps a failed explicit Scope draft local and retryable", async () => {
    const onPersistRows = vi
      .fn()
      .mockRejectedValue(new Error("Scope save failed."));

    render(
      <ProductionProposalMilestoneWorksheet
        detail={detail}
        onPersistRows={onPersistRows}
        templateTitle="4-plex Proposal"
      />
    );

    fireEvent.click(
      screen.getByTestId("timeline-setup-table-row-details-four-plex-draw-01")
    );
    const sheet = screen.getByTestId(
      "timeline-setup-details-sheet-four-plex-draw-01"
    );
    const scopeEditor = within(sheet).getByTestId(
      "timeline-setup-submilestone-description-dc-ed"
    );
    fireEvent.change(scopeEditor, { target: { value: "Issued footing scope" } });
    const saveButton = within(sheet).getByTestId(
      "timeline-setup-submilestone-scope-save-dc-ed"
    );
    fireEvent.click(saveButton);

    await waitFor(() => expect(onPersistRows).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toContain(
        "Scope save failed."
      )
    );
    expect(
      (
        within(sheet).getByTestId(
          "timeline-setup-submilestone-scope-save-dc-ed"
        ) as HTMLButtonElement
      ).disabled
    ).toBe(false);
    expect((scopeEditor as HTMLTextAreaElement).value).toBe(
      "Issued footing scope"
    );
  });

  test("turns cascade on when the cascade toggle is clicked", () => {
    render(
      <ProductionProposalMilestoneWorksheet
        detail={detail}
        templateTitle="4-plex Proposal"
      />
    );

    const toggle = screen.getByTestId("timeline-setup-budget-cascade-toggle");

    expect(toggle.textContent).toContain("Cascade: Off");
    expect(toggle.getAttribute("aria-pressed")).toBe("false");

    fireEvent.click(toggle);

    expect(toggle.textContent).toContain("Cascade: On");
    expect(toggle.getAttribute("aria-pressed")).toBe("true");
  });

  test("cascades Sub-milestone budgets against the persisted proposal total", () => {
    render(
      <ProductionProposalMilestoneWorksheet
        detail={{
          milestones: [
            {
              budgetCents: 100_000_00,
              dayEnd: 3,
              dayStart: 0,
              durationDays: 4,
              icon: "foundation",
              key: "foundation",
              name: "Foundation",
              order: 1,
            },
          ],
          proposal: {
            proposedStartDate: "2026-06-01",
            status: "draft",
            totalBudgetCents: 100_000_00,
          },
          submilestones: [
            {
              budgetCents: 10_000_00,
              durationDays: 1,
              key: "sub-1",
              milestoneKey: "foundation",
              name: "Sub 1",
              order: 1,
              startDay: 0,
            },
            {
              budgetCents: 30_000_00,
              durationDays: 1,
              key: "sub-2",
              milestoneKey: "foundation",
              name: "Sub 2",
              order: 2,
              startDay: 1,
            },
            {
              budgetCents: 50_000_00,
              durationDays: 1,
              key: "sub-3",
              milestoneKey: "foundation",
              name: "Sub 3",
              order: 3,
              startDay: 2,
            },
            {
              budgetCents: 10_000_00,
              durationDays: 1,
              key: "sub-4",
              milestoneKey: "foundation",
              name: "Sub 4",
              order: 4,
              startDay: 3,
            },
          ],
        }}
        templateTitle="Cascade proposal"
      />
    );

    fireEvent.click(
      screen.getByTestId("timeline-setup-budget-cascade-toggle")
    );
    const editedInput = screen.getByTestId(
      "timeline-setup-table-subrow-budget-sub-2"
    );
    fireEvent.change(editedInput, { target: { value: "20000" } });
    fireEvent.blur(editedInput);

    expect(
      (
        screen.getByTestId(
          "timeline-setup-table-subrow-budget-sub-1"
        ) as HTMLInputElement
      ).value
    ).toBe("$10,000");
    expect((editedInput as HTMLInputElement).value).toBe("$20,000");
    expect(
      (
        screen.getByTestId(
          "timeline-setup-table-subrow-budget-sub-3"
        ) as HTMLInputElement
      ).value
    ).toBe("$58,333.33");
    expect(
      (
        screen.getByTestId(
          "timeline-setup-table-subrow-budget-sub-4"
        ) as HTMLInputElement
      ).value
    ).toBe("$11,666.67");
  });

  test("uses the shared Scope revision controller after first submission", () => {
    render(
      <ProductionProposalMilestoneWorksheet
        detail={{
          ...detail,
          proposal: { ...detail.proposal, status: "submitted", submittedAt: 123 },
          submilestones: detail.submilestones?.map((submilestone) => ({
            ...submilestone,
            _id: "proposal-submilestone-1",
          })),
        }}
        scopeRoute="backoffice-proposal"
        scopeWorkosOrganizationId="org-1"
        templateTitle="4-plex Proposal"
      />
    );

    fireEvent.click(
      screen.getByTestId("timeline-setup-table-row-details-four-plex-draw-01")
    );
    const sheet = screen.getByTestId(
      "timeline-setup-details-sheet-four-plex-draw-01"
    );
    expect(
      within(sheet).getByTestId("proposal-scope-revision-controller")
    ).toBeTruthy();
    expect(scopeControllerPropsMock.mock.calls.some(([props]) =>
      props.proposalSubmilestoneId === "proposal-submilestone-1" &&
      props.scopeRoute === "backoffice-proposal" &&
      props.workosOrganizationId === "org-1"
    )).toBe(true);
  });

  test("keeps the legacy v1 Scope editor before first submission", () => {
    render(
      <ProductionProposalMilestoneWorksheet
        detail={detail}
        scopeRoute="backoffice-proposal"
        scopeWorkosOrganizationId="org-1"
        templateTitle="4-plex Proposal"
      />
    );

    fireEvent.click(
      screen.getByTestId("timeline-setup-table-row-details-four-plex-draw-01")
    );
    const sheet = screen.getByTestId(
      "timeline-setup-details-sheet-four-plex-draw-01"
    );
    expect(
      within(sheet).getByTestId("timeline-setup-submilestone-description-dc-ed")
    ).toBeTruthy();
    expect(
      within(sheet).queryByTestId("proposal-scope-revision-controller")
    ).toBeNull();
  });
});
