// @vitest-environment jsdom

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, test, vi } from "vitest";

vi.mock("#/components/roadmap/AnimatedCurvedTimeline.tsx", () => ({
  AnimatedCurvedTimeline: ({
    markers,
    renderEndNode,
  }: {
    markers?: unknown[];
    renderEndNode?: () => ReactNode;
  }) => (
    <div data-testid="mocked-timeline">
      <div data-marker-count={markers?.length ?? 0} data-testid="mocked-timeline-markers" />
      {renderEndNode ? (
        <div data-testid="mocked-timeline-end-node">
          {renderEndNode(
            {
              data: { name: "Foundation" },
              id: "foundation",
              label: "Foundation",
              x: 0,
            },
            { active: false, activate: () => {}, complete: false },
          )}
        </div>
      ) : null}
    </div>
  ),
}));

vi.mock("../demo/timeline/-TimelineEndNodeButton.tsx", () => ({
  TimelineEndNodeButton: () => <div data-testid="mocked-end-node" />,
}));

vi.mock("../demo/timeline/-TimelineCashflowCompoundChart.tsx", () => ({
  TimelineCashflowCompoundChart: () => <div data-testid="mocked-cashflow" />,
}));

vi.mock("../demo/timeline/-TimelineDrawAvailabilityChart.tsx", () => ({
  TimelineDrawAvailabilityChart: () => <div data-testid="mocked-draw-chart" />,
}));

import {
  buildProposalMilestoneMutationArgs,
  buildProposalProbeReferenceLines,
  buildProposalTimelineItems,
  buildProposalTimelineMarkers,
  buildReviewChartData,
  getDefaultApprovalStartDateInput,
  ProposalReviewSurface,
  validateApprovalStartDate,
} from "./proposals.$planId";

afterEach(() => cleanup());

const submittedViewModel = {
  build: { key: "demo-timeline-build" },
  plan: {
    buildName: "Elm Street proposal",
    ownerPersona: "mock_builder",
    planId: "plan-01",
    startingCashCents: 250_000_00,
    status: "submitted",
  },
  snapshot: {
    draws: [
      {
        amountCents: 175_000_00,
        sourceTimelineDrawId: "draw-doc-01",
      },
    ],
    milestones: [
      {
        budgetCents: 150_000_00,
        dayStart: 0,
        durationDays: 20,
        sourceTimelineMilestoneId: "milestone-doc-01",
      },
    ],
  },
  workingCopy: {
    capitalEvents: [
      {
        amountCents: 50_000_00,
        capitalEventKey: "capital-01",
        eventKind: "cashInfusion",
        label: "Owner cash infusion",
        x: 10,
      },
    ],
    draws: [
      {
        _id: "draw-doc-01",
        amountCents: 190_000_00,
        drawKey: "draw-01",
        label: "Draw 01",
        order: 1,
        x: 31,
      },
    ],
    milestones: [
      {
        _id: "milestone-doc-01",
        budgetCents: 160_000_00,
        dayEnd: 24,
        dayStart: 0,
        durationDays: 24,
        evidenceState: "Not started",
        icon: "foundation",
        milestoneKey: "foundation",
        name: "Foundation",
        order: 1,
        policyState: "Within policy",
        status: "upcoming",
        submilestoneSnapshot: [{ name: "Excavation" }],
      },
    ],
  },
};

function renderReview(viewModel = submittedViewModel) {
  return {
    approvePlan: vi.fn().mockResolvedValue({ buildKey: "demo-timeline-build" }),
    navigateToBuild: vi.fn(),
    rejectPlan: vi.fn().mockResolvedValue({ ok: true }),
    updateDraw: vi.fn().mockResolvedValue({ ok: true }),
    updateMilestone: vi.fn().mockResolvedValue({ ok: true }),
    ...render(
      <ProposalReviewSurface
        approvePlan={vi.fn().mockResolvedValue({ buildKey: "demo-timeline-build" })}
        navigateToBuild={vi.fn()}
        planId="plan-01"
        rejectPlan={vi.fn().mockResolvedValue({ ok: true })}
        updateDraw={vi.fn().mockResolvedValue({ ok: true })}
        updateMilestone={vi.fn().mockResolvedValue({ ok: true })}
        viewModel={viewModel}
      />,
    ),
  };
}

describe("validateApprovalStartDate", () => {
  test("accepts today for submitted proposals", () => {
    const today = getDefaultApprovalStartDateInput({ status: "submitted" });
    const result = validateApprovalStartDate(today, "submitted");

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.parsed).toBe(Date.parse(`${today}T00:00:00.000Z`));
    }
  });

  test("rejects missing start dates with actionable guidance", () => {
    expect(validateApprovalStartDate("", "submitted")).toMatchObject({
      ok: false,
      reason: "missing_date",
    });
  });
});

describe("buildProposalProbeReferenceLines", () => {
  test("adds synchronized probe lines for cashflow and draw availability", () => {
    const chartData = buildReviewChartData(submittedViewModel);
    const lines = buildProposalProbeReferenceLines(
      12,
      chartData.cashflow,
      chartData.drawAvailability,
      250_000,
    );

    expect(lines.cashflow).toHaveLength(1);
    expect(lines.cashflow[0]?.x).toBe(12);
    expect(lines.cashflow[0]?.label).toEqual([
      "Day 12",
      expect.stringMatching(/Cash on hand \$[\d,]+/),
    ]);
    expect(lines.drawAvailability).toHaveLength(1);
    expect(lines.drawAvailability[0]?.x).toBe(12);
    expect(lines.drawAvailability[0]?.label).toMatch(/^Delta \$[\d,]+$/);
  });

  test("returns no probe lines when the cursor is not probing", () => {
    const chartData = buildReviewChartData(submittedViewModel);
    const lines = buildProposalProbeReferenceLines(
      null,
      chartData.cashflow,
      chartData.drawAvailability,
      250_000,
    );

    expect(lines).toEqual({ cashflow: [], drawAvailability: [] });
  });
});

describe("buildProposalMilestoneMutationArgs", () => {
  test("maps milestone card edits into admin mutation payloads", () => {
    const milestone = submittedViewModel.workingCopy.milestones[0];

    expect(
      buildProposalMilestoneMutationArgs(
        milestone,
        "foundation",
        { amount: 175_000, durationDays: 30, x: 4 },
        "plan-01",
      ),
    ).toEqual({
      budgetCents: 17_500_000,
      dayEnd: 34,
      dayStart: 4,
      durationDays: 30,
      milestoneKey: "foundation",
      planId: "plan-01",
    });
  });
});

describe("buildProposalTimelineMarkers", () => {
  test("includes draw and cash infusion markers on the timeline", () => {
    const markers = buildProposalTimelineMarkers(submittedViewModel);

    expect(markers).toHaveLength(2);
    expect(markers[0]).toMatchObject({
      id: "draw-draw-01",
      label: "Draw 01",
      tone: "accent",
      x: 31,
    });
    expect(markers[1]).toMatchObject({
      id: "capital-spike-capital-01",
      label: "Owner cash infusion",
      tone: "today",
      x: 10,
    });
  });
});

describe("buildProposalTimelineItems", () => {
  test("maps working-copy milestones into demo timeline card data", () => {
    const items = buildProposalTimelineItems(submittedViewModel);

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      id: "foundation",
      label: "Foundation",
      x: 0,
      data: {
        amount: 160_000,
        durationDays: 24,
        icon: "foundation",
        name: "Foundation",
        status: "upcoming",
        subMilestones: ["Excavation"],
      },
    });
  });
});

describe("ProposalReviewSurface", () => {
  test("renders cashflow, timeline, and draw availability in the timeline tab", () => {
    renderReview();

    const tablist = screen.getByRole("tablist", {
      name: /proposal review sections/i,
    });
    expect(within(tablist).getAllByRole("tab")).toHaveLength(2);
    expect(screen.getByTestId("proposal-review-timeline-stack")).toBeTruthy();
    expect(screen.getByTestId("mocked-cashflow")).toBeTruthy();
    expect(screen.getByTestId("mocked-timeline")).toBeTruthy();
    expect(
      screen.getByTestId("mocked-timeline-markers").getAttribute("data-marker-count"),
    ).toBe("2");
    expect(screen.getByTestId("mocked-end-node")).toBeTruthy();
    expect(screen.getByTestId("mocked-draw-chart")).toBeTruthy();
  });

  test("renders milestone schedule fields in adjustments and posts edits", () => {
    const updateMilestone = vi.fn().mockResolvedValue({ ok: true });

    render(
      <ProposalReviewSurface
        approvePlan={vi.fn().mockResolvedValue({ buildKey: "demo-timeline-build" })}
        navigateToBuild={vi.fn()}
        planId="plan-01"
        rejectPlan={vi.fn().mockResolvedValue({ ok: true })}
        updateDraw={vi.fn().mockResolvedValue({ ok: true })}
        updateMilestone={updateMilestone}
        viewModel={submittedViewModel}
      />,
    );

    fireEvent.click(screen.getByRole("tab", { name: "Adjustments" }));
    const foundationRow = screen.getByTestId("proposal-milestone-adjustment-foundation");
    expect(within(foundationRow).getAllByText("diff").length).toBeGreaterThan(0);

    const costInput = screen.getByTestId("proposal-adjust-cost-foundation");
    fireEvent.change(costInput, { target: { value: "170000" } });
    fireEvent.blur(costInput);

    expect(updateMilestone).toHaveBeenCalledWith({
      budgetCents: 17_000_000,
      milestoneKey: "foundation",
      planId: "plan-01",
    });

    const startInput = screen.getByTestId("proposal-adjust-start-foundation");
    fireEvent.change(startInput, { target: { value: "3" } });
    fireEvent.blur(startInput);

    expect(updateMilestone).toHaveBeenCalledWith({
      dayStart: 3,
      milestoneKey: "foundation",
      planId: "plan-01",
    });

    const durationInput = screen.getByTestId("proposal-adjust-duration-foundation");
    fireEvent.change(durationInput, { target: { value: "30" } });
    fireEvent.blur(durationInput);

    expect(updateMilestone).toHaveBeenCalledWith({
      dayEnd: 30,
      durationDays: 30,
      milestoneKey: "foundation",
      planId: "plan-01",
    });
  });

  test("opens approve modal and calls approvePlan with default start date", async () => {
    const approvePlan = vi.fn().mockResolvedValue({ buildKey: "demo-timeline-build" });

    render(
      <ProposalReviewSurface
        approvePlan={approvePlan}
        navigateToBuild={vi.fn()}
        planId="plan-01"
        rejectPlan={vi.fn().mockResolvedValue({ ok: true })}
        updateDraw={vi.fn().mockResolvedValue({ ok: true })}
        updateMilestone={vi.fn().mockResolvedValue({ ok: true })}
        viewModel={submittedViewModel}
      />,
    );

    const approveButton = screen.getByRole("button", { name: /^approve$/i });
    expect(approveButton.hasAttribute("disabled")).toBe(false);

    fireEvent.click(approveButton);
    expect(screen.getByTestId("proposal-approve-dialog")).toBeTruthy();

    fireEvent.click(screen.getByTestId("proposal-approve-confirm"));

    await waitFor(() => {
      expect(approvePlan).toHaveBeenCalledTimes(1);
    });

    const expectedStartDate = Date.parse(
      `${getDefaultApprovalStartDateInput(submittedViewModel.plan)}T00:00:00.000Z`,
    );
    expect(approvePlan).toHaveBeenCalledWith({
      adminNote: undefined,
      planId: "plan-01",
      startDate: expectedStartDate,
    });
  });

  test("opens reject modal and archives the proposal", async () => {
    const rejectPlan = vi.fn().mockResolvedValue({ ok: true });

    render(
      <ProposalReviewSurface
        approvePlan={vi.fn().mockResolvedValue({ buildKey: "demo-timeline-build" })}
        navigateToBuild={vi.fn()}
        planId="plan-01"
        rejectPlan={rejectPlan}
        updateDraw={vi.fn().mockResolvedValue({ ok: true })}
        updateMilestone={vi.fn().mockResolvedValue({ ok: true })}
        viewModel={submittedViewModel}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /reject \/ archive/i }));
    expect(screen.getByTestId("proposal-reject-dialog")).toBeTruthy();

    fireEvent.change(screen.getByLabelText(/archive reason/i), {
      target: { value: "Budget misaligned with policy" },
    });
    fireEvent.click(screen.getByTestId("proposal-reject-confirm"));

    await waitFor(() => {
      expect(rejectPlan).toHaveBeenCalledWith({
        adminNote: undefined,
        planId: "plan-01",
        reason: "Budget misaligned with policy",
      });
    });
  });

  test("hides the Adjustments tab when the review is no longer submitted", () => {
    renderReview({
      ...submittedViewModel,
      plan: { ...submittedViewModel.plan, status: "approved" },
    });

    expect(
      within(screen.getByRole("tablist")).getAllByRole("tab").map((tab) => tab.textContent),
    ).toEqual(["Timeline"]);
    expect(screen.queryByRole("tab", { name: "Adjustments" })).toBeNull();
  });
});
