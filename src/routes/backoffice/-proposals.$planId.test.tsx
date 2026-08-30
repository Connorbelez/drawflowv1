// @vitest-environment jsdom

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { getFunctionName } from "convex/server";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

const lifecycleMocks = vi.hoisted(() => ({
  activateClosedProposal: vi.fn(),
  recordProposalClosing: vi.fn(),
  toast: { error: vi.fn(), success: vi.fn() },
  useAction: vi.fn(),
  useMutation: vi.fn(),
  useQuery: vi.fn(),
}));

vi.mock("convex/react", () => ({
  useAction: lifecycleMocks.useAction,
  useMutation: lifecycleMocks.useMutation,
  useQuery: lifecycleMocks.useQuery,
}));
vi.mock("sonner", () => ({ toast: lifecycleMocks.toast }));

import { ProductionProposalReviewSurface } from "#/features/production-proposals/ProductionProposalSurfaces.tsx";
import {
  VISUAL_PARITY_APPROVED_PROPOSAL_ID,
  getVisualParityProposalDetail,
  getVisualParityTimelineWorkspace,
} from "#/features/production-proposals/visualParityFixtures.ts";
import { ProposalReviewRouteContent } from "./-proposal-review-route-content.tsx";

vi.mock("#/components/roadmap/AnimatedCurvedTimeline.tsx", () => ({
  AnimatedCurvedTimeline: ({
    markers,
    renderEndNode,
  }: {
    markers?: unknown[];
    renderEndNode?: () => ReactNode;
  }) => (
    <div data-testid="mocked-timeline">
      <div
        data-marker-count={markers?.length ?? 0}
        data-testid="mocked-timeline-markers"
      />
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

vi.mock("#/features/timeline-workspace/-TimelineEndNodeButton.tsx", () => ({
  TimelineEndNodeButton: () => <div data-testid="mocked-end-node" />,
}));

vi.mock(
  "#/features/timeline-workspace/-TimelineCashflowCompoundChart.tsx",
  () => ({
    TimelineCashflowCompoundChart: () => <div data-testid="mocked-cashflow" />,
  }),
);

vi.mock(
  "#/features/timeline-workspace/-TimelineDrawAvailabilityChart.tsx",
  () => ({
    TimelineDrawAvailabilityChart: () => (
      <div data-testid="mocked-draw-chart" />
    ),
  }),
);

import {
  buildProposalMilestoneMutationArgs,
  buildProposalProbeReferenceLines,
  buildProposalTimelineItems,
  buildProposalTimelineMarkers,
  buildReviewChartData,
  BackofficeProposalLifecycleActions,
  getDefaultApprovalStartDateInput,
  ProposalReviewSurface,
  resolveProposalReviewRouteTab,
  shouldLoadProposalCalendarWorkspace,
  shouldLoadProposalContractorPlanning,
  shouldLoadProposalReviewBuilders,
  shouldMountProposalStaffPanel,
  validateApprovalStartDate,
  validateProposalReviewSearch,
} from "./proposals.$planId";

Object.defineProperty(window, "matchMedia", {
  configurable: true,
  value: vi.fn().mockImplementation((query: string) => ({
    addEventListener: vi.fn(),
    addListener: vi.fn(),
    dispatchEvent: vi.fn(),
    matches: false,
    media: query,
    onchange: null,
    removeEventListener: vi.fn(),
    removeListener: vi.fn(),
  })),
});

Object.defineProperty(Element.prototype, "scrollIntoView", {
  configurable: true,
  value: vi.fn(),
});

afterEach(() => cleanup());

beforeEach(() => {
  lifecycleMocks.useAction.mockReset().mockReturnValue(vi.fn());
  lifecycleMocks.useQuery.mockReset();
  lifecycleMocks.useMutation.mockReset().mockImplementation(() =>
    lifecycleMocks.useMutation.mock.calls.length % 2 === 1
      ? lifecycleMocks.recordProposalClosing
      : lifecycleMocks.activateClosedProposal
  );
});

afterEach(() => {
  vi.clearAllMocks();
});

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
        drawAvailabilityCents: 120_000_00,
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

function productionProposalDetail(status: "draft" | "submitted" = "submitted") {
  return {
    documents: [],
    draws: [
      {
        amountCents: 600_000_00,
        drawKey: "draw-01",
        label: "Foundation reimbursement",
        milestoneKey: "foundation",
        order: 1,
        timingDay: 28,
      },
    ],
    milestones: [
      {
        budgetCents: 600_000_00,
        dayEnd: 28,
        dayStart: 0,
        drawAvailabilityCents: 600_000_00,
        durationDays: 28,
        evidenceState: "Draft package",
        key: "foundation",
        name: "Foundation",
        order: 1,
        policyState: "Within policy",
      },
    ],
    permitWaiver: { reason: "Municipal permit waiver accepted." },
    proposal: {
      borrowerCoPayBps: 0,
      borrowerStartingCashCents: 250_000_00,
      buildName: "Elm Street proposal",
      interestAnnualBps: 925,
      lenderDrawPolicyLimitCents: 600_000_00,
      location: "Hamilton, ON",
      proposedStartDate: "2026-07-01",
      status,
      totalBudgetCents: 600_000_00,
    },
    submilestones: [
      {
        budgetCents: 600_000_00,
        dayEnd: 28,
        dayStart: 0,
        durationDays: 28,
        key: "excavation",
        milestoneKey: "foundation",
        name: "Excavation",
        order: 1,
      },
    ],
  };
}

function renderReview(viewModel = submittedViewModel) {
  return {
    approvePlan: vi.fn().mockResolvedValue({ buildKey: "demo-timeline-build" }),
    navigateToBuild: vi.fn(),
    rejectPlan: vi.fn().mockResolvedValue({ ok: true }),
    updateDraw: vi.fn().mockResolvedValue({ ok: true }),
    updateMilestone: vi.fn().mockResolvedValue({ ok: true }),
    ...render(
      <ProposalReviewSurface
        approvePlan={vi
          .fn()
          .mockResolvedValue({ buildKey: "demo-timeline-build" })}
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
  test("splits proposal milestone cashflow bars into reimbursable and out-of-pocket amounts", () => {
    const chartData = buildReviewChartData(submittedViewModel);

    expect(
      chartData.cashflow.find((point) => point.id === "foundation"),
    ).toMatchObject({
      budget: 160_000,
      outOfPocketBudget: 40_000,
      reimbursableBudget: 120_000,
    });
  });

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
    expect(lines.drawAvailability[0]?.label).toEqual([
      expect.stringMatching(/^Delta \$[\d,]+$/),
      expect.stringMatching(/^Interest-bearing \$[\d,]+$/),
      expect.stringMatching(/^Total interest \$[\d,]+$/),
    ]);
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
      screen
        .getByTestId("mocked-timeline-markers")
        .getAttribute("data-marker-count"),
    ).toBe("2");
    expect(screen.getByTestId("mocked-end-node")).toBeTruthy();
    expect(screen.getByTestId("mocked-draw-chart")).toBeTruthy();
  });

  test("renders milestone schedule fields in adjustments and posts edits", () => {
    const updateMilestone = vi.fn().mockResolvedValue({ ok: true });

    render(
      <ProposalReviewSurface
        approvePlan={vi
          .fn()
          .mockResolvedValue({ buildKey: "demo-timeline-build" })}
        navigateToBuild={vi.fn()}
        planId="plan-01"
        rejectPlan={vi.fn().mockResolvedValue({ ok: true })}
        updateDraw={vi.fn().mockResolvedValue({ ok: true })}
        updateMilestone={updateMilestone}
        viewModel={submittedViewModel}
      />,
    );

    fireEvent.click(screen.getByRole("tab", { name: "Adjustments" }));
    const foundationRow = screen.getByTestId(
      "proposal-milestone-adjustment-foundation",
    );
    expect(within(foundationRow).getAllByText("diff").length).toBeGreaterThan(
      0,
    );

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

    const durationInput = screen.getByTestId(
      "proposal-adjust-duration-foundation",
    );
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
    const approvePlan = vi
      .fn()
      .mockResolvedValue({ buildKey: "demo-timeline-build" });

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
        approvePlan={vi
          .fn()
          .mockResolvedValue({ buildKey: "demo-timeline-build" })}
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
      within(screen.getByRole("tablist"))
        .getAllByRole("tab")
        .map((tab) => tab.textContent),
    ).toEqual(["Timeline"]);
    expect(screen.queryByRole("tab", { name: "Adjustments" })).toBeNull();
  });
});

describe("ProductionProposalReviewSurface packet CTAs", () => {
  test("reaches canonical lender assignment through the supported Back Office proposal route", () => {
    const detail = getVisualParityProposalDetail(
      VISUAL_PARITY_APPROVED_PROPOSAL_ID,
    );
    lifecycleMocks.useQuery.mockImplementation((query, args) => {
      if (args === "skip") {
        return undefined;
      }
      const functionName = getFunctionName(query);
      if (functionName === "production_proposals:getProposalDetailByString") {
        return detail;
      }
      if (
        functionName === "production_proposals:getProductionTimelineWorkspace"
      ) {
        return getVisualParityTimelineWorkspace(
          VISUAL_PARITY_APPROVED_PROPOSAL_ID,
        );
      }
      if (functionName === "production_proposals:listBrokerageBuilders") {
        return [];
      }
      if (functionName === "builderRoster:listAssignableBrokers") {
        return { brokerages: [] };
      }
      return undefined;
    });

    render(
      <ProposalReviewRouteContent
        context={{
          organizationId: "org_backoffice",
          role: "admin",
          roles: ["admin"],
          userId: "user_backoffice",
        }}
        navigate={vi.fn() as never}
        planId={VISUAL_PARITY_APPROVED_PROPOSAL_ID}
        search={{ tab: "packet" }}
      />,
    );

    const partiesCard = screen
      .getByText("Parties & assignment")
      .closest('[data-slot="card"]');
    expect(partiesCard).toBeTruthy();
    const parties = within(partiesCard as HTMLElement);
    expect(parties.getByText("Broker")).toBeTruthy();
    expect(parties.getByText("Brokerage")).toBeTruthy();
    expect(parties.getByText("Lender assignment")).toBeTruthy();
  });

  test("moves unassigned Staff to the existing Builder link flow on the supported route", async () => {
    const detail = getVisualParityProposalDetail(
      VISUAL_PARITY_APPROVED_PROPOSAL_ID,
    );
    lifecycleMocks.useQuery.mockImplementation((query, args) => {
      if (args === "skip") {
        return undefined;
      }
      const functionName = getFunctionName(query);
      if (functionName === "production_proposals:getProposalDetailByString") {
        return detail;
      }
      if (
        functionName === "production_proposals:getProductionTimelineWorkspace"
      ) {
        return getVisualParityTimelineWorkspace(
          VISUAL_PARITY_APPROVED_PROPOSAL_ID,
        );
      }
      if (functionName === "production_proposals:listBrokerageBuilders") {
        return [];
      }
      if (functionName === "builderRoster:listAssignableBrokers") {
        return { brokerages: [] };
      }
      return undefined;
    });

    let finishNavigation: (() => void) | undefined;
    const navigate = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finishNavigation = resolve;
        }),
    );
    const routeProps = {
      context: {
        organizationId: "org_backoffice",
        role: "admin",
        roles: ["admin"],
        userId: "user_backoffice",
      },
      navigate: navigate as never,
      planId: VISUAL_PARITY_APPROVED_PROPOSAL_ID,
    };
    const { rerender } = render(
      <ProposalReviewRouteContent {...routeProps} search={{ tab: "staff" }} />,
    );

    expect(
      lifecycleMocks.useQuery.mock.calls.some(
        ([query, args]) =>
          getFunctionName(query) ===
            "production_proposals:listProposalBuilderStaffPermissions" &&
          args === "skip",
      ),
    ).toBe(true);
    fireEvent.click(
      screen.getByRole("button", { name: "Assign or link Builder" }),
    );
    expect(navigate).toHaveBeenCalledWith(
      expect.objectContaining({
        params: { planId: VISUAL_PARITY_APPROVED_PROPOSAL_ID },
        search: { tab: "packet" },
        to: "/backoffice/proposals/$planId",
      }),
    );

    rerender(
      <ProposalReviewRouteContent {...routeProps} search={{ tab: "packet" }} />,
    );
    finishNavigation?.();

    await waitFor(() =>
      expect(document.activeElement?.id).toBe("production-builder-assignee"),
    );
  });

  test("wires the supported Back Office detail route to explicit closing terms and separate activation", async () => {
    lifecycleMocks.recordProposalClosing.mockResolvedValue({
      closingId: "closing_1",
    });
    lifecycleMocks.activateClosedProposal.mockResolvedValue({
      buildId: "build_1",
    });
    const onActivated = vi.fn();
    const approvedDetail = {
      ...productionProposalDetail("submitted"),
      activeBuild: null,
      proposal: {
        ...productionProposalDetail("submitted").proposal,
        status: "approved",
      },
    };
    const { rerender } = render(
      <ProductionProposalReviewSurface
        detail={approvedDetail as any}
        initialActiveTab="closing"
        lifecycleActions={
          <BackofficeProposalLifecycleActions
            activeBuildId={null}
            closingPolicyReady
            onActivated={onActivated}
            proposal={{
              _id: "proposal_1",
              buildName: "Elm Street proposal",
              interestAnnualBps: 925,
              status: "approved",
            }}
            workosOrganizationId="org_backoffice"
          />
        }
      />
    );

    expect(
      screen.getByTestId("backoffice-proposal-lifecycle-actions")
    ).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Record closing/ }));
    expect(
      (screen.getByLabelText("Loan principal (USD)") as HTMLInputElement).value
    ).toBe("");
    expect(
      (screen.getByLabelText("Build start date") as HTMLInputElement).value
    ).toBe("");
    fireEvent.change(screen.getByLabelText("Loan principal (USD)"), {
      target: { value: "575000.25" },
    });
    fireEvent.change(screen.getByLabelText("Annual interest rate (%)"), {
      target: { value: "8.75" },
    });
    fireEvent.change(screen.getByLabelText("Build start date"), {
      target: { value: "2026-10-01" },
    });
    fireEvent.change(screen.getByLabelText("Build timezone (IANA)"), {
      target: { value: "America/Toronto" },
    });
    fireEvent.change(screen.getByLabelText("Audit reason"), {
      target: { value: "Signed closing documents verified by Back Office." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Confirm closing" }));

    await waitFor(() =>
      expect(lifecycleMocks.recordProposalClosing).toHaveBeenCalledWith({
        buildStartDate: "2026-10-01",
        ianaTimezone: "America/Toronto",
        loanFacility: {
          interestAnnualBps: 875,
          principalCents: 57_500_025,
        },
        proposalId: "proposal_1",
        reason: "Signed closing documents verified by Back Office.",
        workosOrganizationId: "org_backoffice",
      })
    );
    expect(lifecycleMocks.activateClosedProposal).not.toHaveBeenCalled();

    rerender(
      <ProductionProposalReviewSurface
        detail={{
          ...approvedDetail,
          proposal: { ...approvedDetail.proposal, status: "closed" },
        } as any}
        initialActiveTab="closing"
        lifecycleActions={
          <BackofficeProposalLifecycleActions
            activeBuildId={null}
            closingPolicyReady
            onActivated={onActivated}
            proposal={{
              _id: "proposal_1",
              buildName: "Elm Street proposal",
              interestAnnualBps: 875,
              status: "closed",
            }}
            workosOrganizationId="org_backoffice"
          />
        }
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /Activate Build/ }));
    fireEvent.change(screen.getByLabelText("Audit reason"), {
      target: { value: "Closed loan cleared for live Build activation." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Activate Build" }));

    await waitFor(() =>
      expect(lifecycleMocks.activateClosedProposal).toHaveBeenCalledWith({
        proposalId: "proposal_1",
        reason: "Closed loan cleared for live Build activation.",
        workosOrganizationId: "org_backoffice",
      })
    );
    expect(onActivated).toHaveBeenCalledWith("build_1");
  });

  test("renders lender decision controls on the submitted packet tab", async () => {
    const approveProposal = vi.fn().mockResolvedValue({ ok: true });

    render(
      <ProductionProposalReviewSurface
        detail={productionProposalDetail("submitted") as any}
        onApprove={approveProposal}
        onReject={vi.fn().mockResolvedValue({ ok: true })}
        onRequestChanges={vi.fn().mockResolvedValue({ ok: true })}
      />,
    );

    const packet = screen.getByTestId("production-proposal-packet-tab");
    expect(within(packet).getByText("Review decision")).toBeTruthy();
    expect(
      within(packet).getByRole("button", { name: "Approve Proposal" }),
    ).toBeTruthy();
    expect(
      within(packet).getByRole("button", { name: "Request Changes" }),
    ).toBeTruthy();
    expect(within(packet).getByRole("button", { name: "Reject" })).toBeTruthy();

    fireEvent.click(
      within(packet).getByRole("button", { name: "Approve Proposal" }),
    );
    expect(approveProposal).not.toHaveBeenCalled();

    fireEvent.change(within(packet).getByLabelText("Decision reason"), {
      target: { value: "Packet is complete and ready for closing." },
    });
    fireEvent.click(
      within(packet).getByRole("button", { name: "Approve Proposal" }),
    );

    await waitFor(() => expect(approveProposal).toHaveBeenCalledTimes(1));
    expect(approveProposal).toHaveBeenCalledWith(
      "Packet is complete and ready for closing.",
      undefined,
    );
  });

  test("submits a custom proposal plan without an optimizer preset", async () => {
    const submitProposal = vi.fn().mockResolvedValue({ ok: true });

    render(
      <ProductionProposalReviewSurface
        detail={productionProposalDetail("draft") as any}
        onSubmit={submitProposal}
      />,
    );

    const packet = screen.getByTestId("production-proposal-packet-tab");
    const submitButton = within(packet).getByRole("button", {
      name: "Submit proposal",
    }) as HTMLButtonElement;
    expect(submitButton.disabled).toBe(false);
    expect(
      within(packet).getByText(
        /submit the custom reimbursement plan for lender review/i,
      ),
    ).toBeTruthy();
    fireEvent.click(submitButton);
    await waitFor(() => expect(submitProposal).toHaveBeenCalledTimes(1));
  });

  test("renders builder submit proposal CTA on draft packet tab", async () => {
    const submitProposal = vi.fn().mockResolvedValue({ ok: true });
    const detail = productionProposalDetail("draft");

    render(
      <ProductionProposalReviewSurface
        detail={{
          ...detail,
          proposal: {
            ...detail.proposal,
            selectedPlan: {
              name: "Capital-Constrained",
              planKey: "capitalConstrained",
            },
          },
        } as any}
        onSubmit={submitProposal}
      />,
    );

    const packet = screen.getByTestId("production-proposal-packet-tab");
    const submitButton = within(packet).getByRole("button", {
      name: "Submit proposal",
    });
    expect(submitButton).toBeTruthy();
    expect(within(packet).getByText("Capital-Constrained")).toBeTruthy();
    expect(within(packet).getByText("Builder-selected proposal plan")).toBeTruthy();

    fireEvent.click(submitButton);

    await waitFor(() => expect(submitProposal).toHaveBeenCalledTimes(1));
  });

  test("keeps lender decision and draw edit controls available for authorized reviewers", () => {
    render(
      <ProductionProposalReviewSurface
        detail={{
          ...productionProposalDetail("submitted"),
          documents: [],
          permitWaiver: null,
        } as any}
        initialActiveTab="review"
        onApprove={vi.fn()}
        onReject={vi.fn()}
        onRequestChanges={vi.fn()}
        onUpdateDraw={vi.fn()}
      />,
    );

    expect(
      screen.getByRole("button", { name: "Request Changes" }),
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: "Reject" })).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Approve Proposal" }),
    ).toBeTruthy();
    expect(screen.getByLabelText("Decision reason")).toBeTruthy();
    expect(screen.getByLabelText("Audited permit waiver")).toBeTruthy();

    fireEvent.click(screen.getByRole("tab", { name: "Draw schedule" }));

    expect(screen.getByLabelText("draw-01 label")).toBeTruthy();
    expect(screen.getByLabelText("Amount dollars")).toBeTruthy();
    expect(screen.getByLabelText("Change reason")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Save draw row" })).toBeTruthy();
  });
});

describe("proposal review subscription gates", () => {
  test("loads builder assignment data for the default merged packet", () => {
    const activeTab = resolveProposalReviewRouteTab({});

    expect(activeTab).toBe("packet");
    expect(shouldLoadProposalCalendarWorkspace(activeTab)).toBe(false);
    expect(shouldLoadProposalContractorPlanning(activeTab)).toBe(false);
    expect(shouldLoadProposalReviewBuilders(activeTab)).toBe(true);
    expect(shouldMountProposalStaffPanel(activeTab)).toBe(false);
  });

  test("round-trips valid backoffice tab and timeframe search", () => {
    expect(
      validateProposalReviewSearch({ tab: "calendar", timeframe: "week" }),
    ).toEqual({ tab: "calendar", timeframe: "week" });
    expect(
      validateProposalReviewSearch({ tab: "review", timeframe: "agenda" }),
    ).toEqual({ tab: "review", timeframe: "agenda" });
  });

  test("loads heavyweight subscriptions only for the tabs that need them", () => {
    expect(shouldLoadProposalCalendarWorkspace("calendar")).toBe(true);
    expect(shouldLoadProposalCalendarWorkspace("timeline")).toBe(false);

    expect(shouldLoadProposalContractorPlanning("contractors")).toBe(true);
    expect(shouldLoadProposalContractorPlanning("gantt")).toBe(true);
    expect(shouldLoadProposalContractorPlanning("milestones")).toBe(true);
    expect(shouldLoadProposalContractorPlanning("timeline")).toBe(false);

    expect(shouldLoadProposalReviewBuilders("review")).toBe(true);
    expect(shouldLoadProposalReviewBuilders("packet")).toBe(true);
    expect(shouldLoadProposalReviewBuilders("timeline")).toBe(false);

    expect(shouldMountProposalStaffPanel("staff")).toBe(true);
    expect(shouldMountProposalStaffPanel("timeline")).toBe(false);
  });
});
