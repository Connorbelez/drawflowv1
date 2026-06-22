// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";

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

    const budgetInput = screen.getByTestId(
      "timeline-setup-row-budget-four-plex-draw-01"
    );

    fireEvent.change(budgetInput, { target: { value: "$95,000" } });
    vi.advanceTimersByTime(PRODUCTION_MILESTONE_WORKSHEET_SAVE_DEBOUNCE_MS + 1);

    expect(onPersistRows).not.toHaveBeenCalled();

    fireEvent.blur(budgetInput);
    vi.advanceTimersByTime(PRODUCTION_MILESTONE_WORKSHEET_SAVE_DEBOUNCE_MS - 1);

    expect(onPersistRows).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);

    expect(onPersistRows).toHaveBeenCalledTimes(1);
  });
});
