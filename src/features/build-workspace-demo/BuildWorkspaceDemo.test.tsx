// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";

import { BuildWorkspaceDemo } from "./BuildWorkspaceDemo.tsx";
import type { BuildWorkspaceAdapter } from "./types.ts";
import { BuildWorkspaceProvider } from "./workspace-adapter.tsx";

afterEach(() => cleanup());

describe("BuildWorkspaceDemo Gantt labels and draw editing", () => {
  test("hides lender approval controls and proposal labels in builder active workspace", () => {
    renderWorkspace(
      {
        build: {
          ...workspaceFixture().build,
          buildName: "4-plex Proposal",
          phaseLabel: "Active reimbursement workspace",
        },
        mode: "active",
        role: "lenderAdmin",
        terminalMessage: "",
      },
      { viewer: "builder" },
    );

    const shell = screen.getByTestId("build-workspace-shell");
    expect(within(shell).getByText("Live Build")).toBeTruthy();
    expect(within(shell).getByText("4-plex Build")).toBeTruthy();
    expect(within(shell).queryByText("4-plex Proposal")).toBeNull();
    expect(within(shell).getByText("active")).toBeTruthy();
    expect(within(shell).queryByText("Proposal")).toBeNull();
    expect(screen.queryByTestId("workspace-role-select")).toBeNull();
    expect(screen.queryByText("Lender Admin")).toBeNull();
    expect(screen.queryByText("Approve milestone")).toBeNull();
    expect(screen.queryByTestId("active-primary-approve-dc-ed")).toBeNull();
    expect(screen.getByTestId("active-primary-mark-complete-dc-ed")).toBeTruthy();

    fireEvent.click(screen.getByTestId("timeline-milestone-dc-ed"));

    const sheet = screen.getByTestId("milestone-detail-sheet");
    expect(within(sheet).queryByText("Lender Review, Site Visit, and Admin Approval")).toBeNull();
    expect(within(sheet).queryByTestId("approve-milestone")).toBeNull();
    expect(within(sheet).queryByText("Approve milestone")).toBeNull();
  });

  test("keeps optimizer preset selection optional before submission", () => {
    const setActivePlan = vi.fn();
    const optimizationPlans = [
      {
        durationDays: 42,
        id: "cheapestFeasible" as const,
        label: "Cheapest Feasible",
        peakWorkingCapital: 150_000,
        projectedInterest: 8_000,
        summary: "Minimizes financing cost.",
        totalFees: 1_000,
        warning: "May extend the schedule.",
      },
      {
        durationDays: 32,
        id: "fastest" as const,
        infeasibleReason: "Exceeds the available borrower working-capital limit.",
        label: "Fastest",
        peakWorkingCapital: 200_000,
        projectedInterest: 7_000,
        summary: "Minimizes project duration.",
        totalFees: 1_500,
        warning: "Requires more working capital.",
      },
      {
        durationDays: 40,
        id: "capitalConstrained" as const,
        label: "Capital-Constrained",
        peakWorkingCapital: 125_000,
        recommended: true,
        projectedInterest: 7_500,
        summary: "Stays within available working capital.",
        totalFees: 1_000,
        warning: "May delay reimbursements.",
      },
    ];

    const unselected = renderWorkspace(
      {
        optimizationPlans,
        selectedPlanId: undefined,
        setActivePlan,
      },
      { showPrimaryAction: true, viewer: "builder" },
    );

    expect(
      (screen.getByTestId("proposal-submit") as HTMLButtonElement).disabled,
    ).toBe(false);
    fireEvent.click(screen.getByTestId("workspace-draw-plans-open"));

    expect(screen.getByText("Cheapest Feasible")).toBeTruthy();
    expect(screen.getByText("Fastest")).toBeTruthy();
    expect(screen.getByText("Capital-Constrained")).toBeTruthy();
    expect(screen.getByText("Recommended")).toBeTruthy();
    expect(
      screen.getByText("Exceeds the available borrower working-capital limit."),
    ).toBeTruthy();
    expect(
      (screen.getByTestId("draw-plan-option-fastest") as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    const capitalConstrained = screen.getByTestId(
      "draw-plan-option-capitalConstrained",
    );
    expect(capitalConstrained.getAttribute("aria-pressed")).toBe("false");
    expect(capitalConstrained.textContent).toContain(
      "Select Capital-Constrained",
    );
    fireEvent.click(capitalConstrained);
    expect(setActivePlan).toHaveBeenCalledWith("capitalConstrained");

    unselected.unmount();
    renderWorkspace(
      {
        optimizationPlans,
        selectedPlanId: "capitalConstrained",
        setActivePlan,
      },
      { showPrimaryAction: true, viewer: "builder" },
    );
    expect(
      (screen.getByTestId("proposal-submit") as HTMLButtonElement).disabled,
    ).toBe(false);
  });

  test("keeps lender approval controls available for lender active workspace", () => {
    renderWorkspace({
      mode: "active",
      role: "lenderAdmin",
      terminalMessage: "",
    });

    expect(screen.getByTestId("workspace-role-select")).toBeTruthy();
    expect(screen.getByTestId("active-primary-approve-dc-ed")).toBeTruthy();
    expect(screen.getByText("Approve milestone")).toBeTruthy();
  });

  test("can hide role selector on lender production embeds without hiding lender actions", () => {
    renderWorkspace(
      {
        mode: "active",
        role: "lenderAdmin",
        terminalMessage: "",
      },
      { showRoleSelector: false, viewer: "lender" },
    );

    expect(screen.queryByTestId("workspace-role-select")).toBeNull();
    expect(screen.getByTestId("active-primary-approve-dc-ed")).toBeTruthy();
    expect(screen.getByText("Approve milestone")).toBeTruthy();
  });

  test("keeps staff review controls while withholding final milestone decisions", () => {
    renderWorkspace(
      {
        mode: "active",
        role: "lenderAdmin",
        terminalMessage: "",
      },
      {
        canFinalizeMilestones: false,
        showRoleSelector: false,
        viewer: "lender",
      },
    );

    expect(screen.queryByTestId("active-primary-approve-dc-ed")).toBeNull();
    expect(screen.queryByText("Approve milestone")).toBeNull();

    fireEvent.click(screen.getByTestId("timeline-milestone-dc-ed"));

    const sheet = screen.getByTestId("milestone-detail-sheet");
    expect(within(sheet).getByTestId("accept-evidence")).toBeTruthy();
    expect(within(sheet).getByTestId("request-more-info")).toBeTruthy();
    expect(within(sheet).queryByTestId("reject-milestone")).toBeNull();
    expect(within(sheet).queryByTestId("approve-milestone")).toBeNull();
  });

  test("can hide topbar primary actions for production embeds", () => {
    renderWorkspace(
      {
        mode: "active",
        role: "builderLead",
        terminalMessage: "",
      },
      { showPrimaryAction: false, showRoleSelector: false, viewer: "builder" },
    );

    expect(screen.queryByTestId("workspace-role-select")).toBeNull();
    expect(screen.queryByTestId("active-primary-mark-complete-dc-ed")).toBeNull();
    expect(screen.queryByText("Mark complete")).toBeNull();
    expect(screen.queryByText("Approve milestone")).toBeNull();
  });

  test("renders submilestone names without draw-label pills and opens draw editor from draw indicator", () => {
    const updateDrawGroup = vi.fn().mockResolvedValue(undefined);
    renderWorkspace({ updateDrawGroup });

    const railRow = screen.getByTestId("milestone-rail-row-dc-ed");
    expect(railRow.textContent).toContain("DC/ED");
    expect(railRow.textContent).not.toContain(
      "Permits, demo & foundation reimbursement draw",
    );

    const timelineCard = screen.getByTestId("timeline-milestone-demo-ex");
    expect(timelineCard.textContent).toContain("DEMO & EX");
    expect(timelineCard.textContent).not.toContain("FOUR-PLEX-DRAW-01.4");

    fireEvent.click(screen.getByTestId("draw-drag-handle-draw-01"));
    expect(screen.queryByTestId("draw-detail-sheet")).toBeNull();

    const drawIndicator = screen.getByTestId("draw-planned-draw-01");
    const drawIndicatorContainer = document.querySelector(
      '[data-gantt-marker-container="draw-planned-draw-01"]',
    );
    expect(drawIndicatorContainer?.className).toContain("hover:z-[70]");
    expect(drawIndicatorContainer?.className).toContain("focus-within:z-[70]");

    fireEvent.click(drawIndicator);

    const sheet = screen.getByTestId("draw-detail-sheet");
    expect(within(sheet).getByText("Edit draw")).toBeTruthy();
    fireEvent.change(within(sheet).getByLabelText("draw-01 label"), {
      target: { value: "Foundation closeout reimbursement draw" },
    });
    fireEvent.change(within(sheet).getByLabelText("Amount dollars"), {
      target: { value: "77500" },
    });
    fireEvent.change(within(sheet).getByLabelText("Timing day"), {
      target: { value: "61" },
    });
    fireEvent.click(within(sheet).getByText("Save draw row"));

    expect(updateDrawGroup).toHaveBeenCalledWith("draw-01", {
      amount: 77_500,
      label: "Foundation closeout reimbursement draw",
      timingDay: 61,
    });
  });

  test("switches roadmap display labels between calendar dates and T offsets locally", () => {
    renderWorkspace({
      timelineBaseDate: new Date(2026, 5, 1),
    });

    expect(
      screen
        .getByTestId("timeline-schedule-display-dates")
        .getAttribute("aria-pressed")
    ).toBe("true");
    fireEvent.click(screen.getByTestId("timeline-schedule-display-tOffsets"));

    expect(
      screen.getByTestId("timeline-schedule-display-tOffsets")
        .getAttribute("aria-pressed")
    ).toBe("true");

    fireEvent.mouseEnter(screen.getByTestId("timeline-milestone-dc-ed"));
    expect(screen.getByText(/T0 - T3/)).toBeTruthy();
  });

  test("opens the submilestone sidebar from the rail row context menu", () => {
    renderWorkspace();

    fireEvent.contextMenu(screen.getByTestId("milestone-rail-row-dc-ed"));
    fireEvent.click(
      screen.getByTestId("milestone-rail-context-open-submilestones-dc-ed"),
    );

    const sheet = screen.getByTestId("milestone-detail-sheet");
    expect(within(sheet).getByText("FOUR-PLEX-DRAW-01.1 / DC/ED")).toBeTruthy();
  });

  test("opens a canonical submilestone from the Gantt detail sheet", () => {
    const onOpenSubmilestone = vi.fn();
    const fixture = workspaceFixture();
    renderWorkspace(
      {
        milestones: [
          {
            ...fixture.milestones[0],
            submilestones: [
              {
                canonicalId: "sub-01",
                key: "excavation",
                name: "Excavation",
              },
            ],
          },
          ...fixture.milestones.slice(1),
        ],
      },
      { onOpenSubmilestone },
    );

    fireEvent.click(screen.getByTestId("timeline-milestone-dc-ed"));
    fireEvent.click(
      screen.getByRole("button", { name: "Open Sub-milestone Excavation" }),
    );

    expect(onOpenSubmilestone).toHaveBeenCalledWith("sub-01");
  });

  test("moves a proposal submilestone to another parent from the detail sheet", () => {
    const moveSubmilestoneToParent = vi.fn().mockResolvedValue(undefined);
    renderWorkspace({
      listSubmilestoneParentTargets: (milestoneId) =>
        milestoneId === "dc-ed"
          ? [
              {
                id: "draw-02",
                label: "Draw 02 - Underground and framing",
              },
            ]
          : [],
      moveSubmilestoneToParent,
    });

    fireEvent.click(screen.getByTestId("timeline-milestone-dc-ed"));
    const sheet = screen.getByTestId("milestone-detail-sheet");
    fireEvent.change(
      within(sheet).getByTestId("move-to-parent-milestone-select"),
      {
        target: { value: "draw-02" },
      },
    );
    fireEvent.click(within(sheet).getByTestId("move-to-parent-milestone"));

    expect(moveSubmilestoneToParent).toHaveBeenCalledWith("dc-ed", "draw-02");
  });
});

function renderWorkspace(
  overrides: Partial<BuildWorkspaceAdapter> = {},
  options: {
    canFinalizeMilestones?: boolean;
    onOpenSubmilestone?: (submilestoneId: string) => void;
    showPrimaryAction?: boolean;
    showRoleSelector?: boolean;
    viewer?: "builder" | "lender";
  } = {},
) {
  return render(
    <BuildWorkspaceProvider workspace={{ ...workspaceFixture(), ...overrides }}>
      <BuildWorkspaceDemo
        canFinalizeMilestones={options.canFinalizeMilestones}
        layout="embedded"
        onOpenSubmilestone={options.onOpenSubmilestone}
        showPrimaryAction={options.showPrimaryAction}
        showRoleSelector={options.showRoleSelector}
        viewer={options.viewer}
      />
    </BuildWorkspaceProvider>,
  );
}

function workspaceFixture(): BuildWorkspaceAdapter {
  const drawLabel = "Permits, demo & foundation reimbursement draw";
  return {
    activePlanId: "capitalConstrained",
    addDependency: vi.fn().mockResolvedValue(undefined),
    addMilestone: vi.fn().mockResolvedValue(undefined),
    addSampleEvidence: vi.fn().mockResolvedValue(undefined),
    applyIssueQuickFix: vi.fn().mockResolvedValue(undefined),
    applyRecommendedPlan: vi.fn().mockResolvedValue(undefined),
    approveMilestone: vi.fn().mockResolvedValue(undefined),
    auditEvents: [],
    batchMoveMilestoneDates: vi.fn().mockResolvedValue(undefined),
    budget: {
      borrowerStartingCash: 125_000,
      drawFeeBps: 0,
      interestRatePct: 11,
      lenderDrawPolicyLimit: 575_000,
      requestedLoanAmount: 575_000,
      totalBuildBudget: 650_000,
      version: 1,
    },
    build: {
      borrowerName: "Builder borrower",
      buildName: "4-plex Proposal",
      lenderName: "FairLend",
      organizationId: "org_test",
      phaseLabel: "Build Proposal planning workspace",
      proposalStatus: "draft",
      siteAddress: "25 Luverne Avenue, North York, ON",
    },
    claimSiteVisit: vi.fn().mockResolvedValue(undefined),
    compilationStatus: "upToDate",
    dependencies: [],
    dismissIssue: vi.fn().mockResolvedValue(undefined),
    drawGroups: [
      {
        amount: 72_000,
        eligibleAt: new Date(2026, 6, 24),
        endAt: new Date(2026, 6, 23),
        id: "draw-01",
        issues: [],
        label: drawLabel,
        order: 1,
        plannedAt: new Date(2026, 6, 30),
        rowIndex: 0,
        rowSpan: 2,
        startAt: new Date(2026, 5, 1),
        status: "planned",
        timingDay: 59,
        totalExposure: 72_000,
        warningState: "clear",
      },
    ],
    isLoading: false,
    issues: [],
    mergeDrawGroups: vi.fn().mockResolvedValue(undefined),
    milestones: [
      milestone({
        code: "FOUR-PLEX-DRAW-01.1",
        id: "dc-ed",
        name: "DC/ED",
        startAt: new Date(2026, 5, 1),
      }),
      milestone({
        code: "FOUR-PLEX-DRAW-01.4",
        id: "demo-ex",
        name: "DEMO & EX",
        startAt: new Date(2026, 5, 8),
      }),
    ],
    mode: "proposal",
    moveMilestoneDates: vi.fn().mockResolvedValue(undefined),
    moveMilestoneToDrawGroup: vi.fn().mockResolvedValue(undefined),
    needsSeed: false,
    optimizationPlans: [],
    outboxEvents: [],
    recomputeProposalPlan: vi.fn().mockResolvedValue(undefined),
    rejectMilestone: vi.fn().mockResolvedValue(undefined),
    removeDependency: vi.fn().mockResolvedValue(undefined),
    reorderMilestone: vi.fn().mockResolvedValue(undefined),
    reorderMilestoneAbsolute: vi.fn().mockResolvedValue(undefined),
    requestMoreInformation: vi.fn().mockResolvedValue(undefined),
    requestSiteVisit: vi.fn().mockResolvedValue(undefined),
    resetWorkspace: vi.fn().mockResolvedValue(undefined),
    reviewEvidence: vi.fn().mockResolvedValue(undefined),
    role: "lenderAdmin",
    selectMilestone: vi.fn(),
    selectedMilestoneId: "dc-ed",
    setActivePlan: vi.fn(),
    setDependencyHardness: vi.fn().mockResolvedValue(undefined),
    setMilestoneDragLocked: vi.fn().mockResolvedValue(undefined),
    setRole: vi.fn(),
    splitDrawGroup: vi.fn().mockResolvedValue(undefined),
    submitCompletionClaim: vi.fn().mockResolvedValue(undefined),
    submitProposal: vi.fn().mockResolvedValue(undefined),
    submitSiteVisitReport: vi.fn().mockResolvedValue(undefined),
    terminalMessage: "Draft Gantt edits update the proposal package before save.",
    updateForecastDates: vi.fn().mockResolvedValue(undefined),
    updateMilestone: vi.fn().mockResolvedValue(undefined),
    updateProgress: vi.fn().mockResolvedValue(undefined),
    uploadEvidence: vi.fn().mockResolvedValue(undefined),
    validationErrors: [],
    validationWarnings: [],
  };
}

function milestone({
  code,
  id,
  name,
  startAt,
}: {
  code: string;
  id: string;
  name: string;
  startAt: Date;
}) {
  return {
    actualCost: 30_000,
    blockedByKeys: [],
    blockingKeys: [],
    blockingReasons: [],
    code,
    completionReport: "",
    drawGroupId: "draw-01",
    endAt: new Date(startAt.getFullYear(), startAt.getMonth(), startAt.getDate() + 3),
    estimatedCost: 30_000,
    estimatedDurationDays: 3,
    evidenceFiles: [],
    evidencePackages: [],
    evidenceStatus: "draft" as const,
    id,
    isDragLocked: false,
    issues: [],
    lane: "draw-01",
    name,
    notes: "",
    progress: 0,
    requiresSiteVisit: false,
    reviewReports: [],
    siteVisitRequested: false,
    siteVisits: [],
    staffRecommendation: "",
    startAt,
    status: "proposed" as const,
    warningCount: 0,
  };
}
