// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";

import { BuildWorkspaceDemo } from "./BuildWorkspaceDemo.tsx";
import type { BuildWorkspaceAdapter } from "./types.ts";
import { BuildWorkspaceProvider } from "./workspace-adapter.tsx";

afterEach(() => cleanup());

describe("BuildWorkspaceDemo Gantt labels and draw editing", () => {
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
});

function renderWorkspace(
  overrides: Partial<BuildWorkspaceAdapter> = {},
) {
  return render(
    <BuildWorkspaceProvider workspace={{ ...workspaceFixture(), ...overrides }}>
      <BuildWorkspaceDemo layout="embedded" />
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
      borrowerWorkingCapitalLimit: 125_000,
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
