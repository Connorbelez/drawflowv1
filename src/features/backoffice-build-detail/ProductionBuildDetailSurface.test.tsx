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

vi.mock("./ActiveBuildTimelineWorkspace", () => ({
  ActiveBuildTimelineWorkspace: ({ workspace }: { workspace: any }) => (
    <div data-testid="mock-active-build-timeline">
      <div data-testid="mock-active-build-timeline-milestones">
        {workspace.milestones.length}
      </div>
      <div data-testid="mock-active-build-timeline-draws">
        {workspace.draws.length}
      </div>
    </div>
  ),
}));

vi.mock("./ActiveBuildGanttWorkspace", () => ({
  ActiveBuildGanttWorkspace: ({ detail }: { detail: ProductionBuildDetail }) => (
    <div data-testid="mock-active-build-gantt">
      {detail.milestones.map((milestone) => (
        <div data-testid={`mock-active-build-gantt-${milestone.key}`} key={milestone.key}>
          {milestone.name}
        </div>
      ))}
    </div>
  ),
}));

import {
  ProductionBuildDetailSurface,
  type ProductionBuildDetail,
} from "./ProductionBuildDetailSurface";

afterEach(() => cleanup());

const detail: ProductionBuildDetail = {
  build: {
    _id: "active-build-01",
    buildName: "Approved With Permit Site",
    location: "Toronto, ON",
    startDate: "2026-06-01",
    status: "active",
    totalBudgetCents: 750_000_00,
  },
  capitalPlan: {
    borrowerCoPayBps: 2_000,
    borrowerWorkingCapitalLimitCents: 180_000_00,
    lenderDrawPolicyLimitCents: 550_000_00,
    version: 1,
  },
  draws: [
    {
      _id: "draw-01",
      amountCents: 225_000_00,
      drawKey: "draw-01",
      label: "Foundation reimbursement",
      milestoneKey: "foundation",
      order: 1,
      requestNote: "Foundation reimbursement requested.",
      status: "planned",
      timingDay: 31,
    },
  ],
  loanFacility: {
    interestAnnualBps: 925,
    interestStartsOn: "funds_released",
    paybackDate: "2027-06-01",
    principalCents: 550_000_00,
    status: "active",
  },
  facilityChangeRequests: [
    {
      _id: "facility-request-01",
      createdAt: Date.now(),
      priorState: {
        paybackDate: "2027-06-01",
        principalCents: 550_000_00,
      },
      reason: "Material costs changed after framing bid.",
      requestedByWorkosUserId: "user_builder",
      requestedPayload: {
        requestedPrincipalCents: 600_000_00,
      },
      requestType: "principalIncrease",
      status: "requested",
    },
  ],
  milestones: [
    {
      _id: "milestone-01",
      budgetCents: 225_000_00,
      dayEnd: 30,
      dayStart: 0,
      dependencyKeys: [],
      drawAvailabilityCents: 225_000_00,
      durationDays: 30,
      evidenceState: "Submitted package",
      key: "foundation",
      name: "Foundation",
      order: 1,
      status: "in_progress",
    },
  ],
  submilestones: [
    {
      _id: "sub-01",
      key: "excavation",
      milestoneKey: "foundation",
      name: "Excavation",
      order: 1,
      status: "complete",
    },
  ],
  auditEvents: [
    {
      _id: "audit-01",
      actorPersona: "user_admin",
      createdAt: Date.now(),
      entityType: "activeBuild",
      eventType: "active_build.draw.requested",
      afterSummary: "Foundation reimbursement requested.",
    },
  ],
  availableContractors: [
    {
      _id: "contractor-available-01",
      city: "Toronto",
      name: "Available Concrete",
      trades: ["foundation"],
    },
  ],
  contractors: [
    {
      _id: "assignment-01",
      contractorId: "contractor-01",
      name: "Site Lead Builders",
      role: "Foundation contractor",
      trades: ["foundation"],
    },
  ],
  displayId: "B-ACTIVE01",
  documents: [
    {
      _id: "document-01",
      documentType: "permit",
      fileName: "permit.pdf",
      kind: "permit",
      name: "permit.pdf",
      sizeBytes: 1024,
    },
  ],
  notes: {
    internal: [
      {
        _id: "note-internal-01",
        authorPersona: "user_admin",
        body: "Internal note.",
        createdAt: Date.now(),
        visibility: "internal",
      },
    ],
    public: [
      {
        _id: "note-public-01",
        authorPersona: "user_admin",
        body: "Public note.",
        createdAt: Date.now(),
        visibility: "public",
      },
    ],
  },
  quickActionEvents: [
    {
      _id: "quick-01",
      createdAt: Date.now(),
      eventType: "active_build.draw.requested",
      payloadPreview: "Foundation reimbursement requested.",
    },
  ],
  sitePhotos: [
    {
      caption: "Foundation site photo",
      evidenceKey: "foundation-site-photo",
      locationVerified: true,
      takenAt: "2026-06-15",
      url: "production-evidence://foundation-site-photo",
    },
  ],
  siteVisits: [],
};

const timelineWorkspace = {
  capitalEvents: [],
  draws: [
    {
      amountCents: 225_000_00,
      drawKey: "draw-01",
      itemMilestoneKey: "foundation",
      label: "Foundation reimbursement",
      requestStatus: "draft",
      x: 31,
    },
  ],
  evidenceAssets: [],
  milestones: [
    {
      budgetCents: 225_000_00,
      dayEnd: 30,
      dayStart: 0,
      drawAvailabilityCents: 225_000_00,
      durationDays: 30,
      evidenceState: "Submitted package",
      milestoneKey: "foundation",
      name: "Foundation",
      order: 1,
      policyState: "Approved reimbursement policy",
      status: "ready",
      submilestoneSnapshot: [],
      x: 0,
    },
  ],
  permissions: {
    reviewDrawRequests: true,
    reviewMilestones: true,
    submitDrawRequests: false,
    submitMilestoneCompletion: false,
  },
  plan: {
    currentDay: 1,
    progressValue: 1,
    rangeMax: 60,
    rangeMin: 0,
    routeState: {
      selectedPanelOpen: false,
      straightLine: true,
    },
    startingCashCents: 180_000_00,
  },
  proposal: {
    buildName: "Approved With Permit Site",
    location: "Toronto, ON",
    status: "approved",
    totalBudgetCents: 750_000_00,
  },
} as any;

describe("ProductionBuildDetailSurface", () => {
  test("restores the build detail tab bar for production active builds", () => {
    const onChangeTab = vi.fn();

    render(
      <ProductionBuildDetailSurface
        activeTab="details"
        detail={detail}
        onChangeRail={vi.fn()}
        onChangeTab={onChangeTab}
        rail="open"
      />,
    );

    const tabbar = screen.getByTestId("build-detail-tabbar");
    expect(within(tabbar).getByText("Details")).toBeTruthy();
    expect(within(tabbar).getByText("Timeline")).toBeTruthy();
    expect(within(tabbar).getByText("Calendar")).toBeTruthy();
    expect(within(tabbar).getByText("Gantt")).toBeTruthy();
    expect(
      screen.getByTestId("build-detail-tab-details").getAttribute("aria-selected"),
    ).toBe("true");

    fireEvent.click(screen.getByTestId("build-detail-tab-timeline"));
    expect(onChangeTab).toHaveBeenCalledWith("timeline");
  });

  test("renders production detail data instead of the old summary-only page", () => {
    render(
      <ProductionBuildDetailSurface
        activeTab="details"
        detail={detail}
        onChangeRail={vi.fn()}
        onChangeTab={vi.fn()}
        rail="open"
      />,
    );

    expect(screen.getByText("Approved With Permit Site")).toBeTruthy();
    expect(screen.getByText("Production active Build")).toBeTruthy();
    expect(screen.getByText("Loan Details")).toBeTruthy();
    expect(screen.getAllByText("$550,000").length).toBeGreaterThan(0);
    expect(screen.getByTestId("build-detail-kanban")).toBeTruthy();
    expect(screen.getByTestId("build-detail-draws")).toBeTruthy();
    expect(screen.getByTestId("facility-change-requests")).toBeTruthy();
    expect(screen.getByText("Payback date")).toBeTruthy();
  });

  test("submits and reviews active build facility change requests", async () => {
    const requestFacilityChange = vi.fn();
    const reviewFacilityChangeRequest = vi.fn();

    render(
      <ProductionBuildDetailSurface
        actions={{ requestFacilityChange, reviewFacilityChangeRequest }}
        activeTab="details"
        detail={detail}
        onChangeRail={vi.fn()}
        onChangeTab={vi.fn()}
        rail="open"
      />,
    );

    fireEvent.change(screen.getByTestId("facility-principal-input"), {
      target: { value: "625000" },
    });
    fireEvent.change(screen.getByTestId("facility-change-reason"), {
      target: { value: "New material quote." },
    });
    fireEvent.click(screen.getByTestId("facility-request-principal"));
    await waitFor(() =>
      expect(requestFacilityChange).toHaveBeenCalledWith({
      reason: "New material quote.",
      requestedPrincipalCents: 625_000_00,
      requestType: "principalIncrease",
      }),
    );

    fireEvent.change(screen.getByTestId("facility-review-note"), {
      target: { value: "Approved after budget review." },
    });
    fireEvent.click(screen.getByTestId("facility-approve-facility-request-01"));
    await waitFor(() =>
      expect(reviewFacilityChangeRequest).toHaveBeenCalledWith({
        note: "Approved after budget review.",
        requestId: "facility-request-01",
        status: "approved",
      }),
    );
  });

  test("preserves milestone sheet routing state for production builds", () => {
    const onChangeMilestone = vi.fn();

    render(
      <ProductionBuildDetailSurface
        activeTab="details"
        detail={detail}
        milestoneKey="foundation"
        onChangeMilestone={onChangeMilestone}
        onChangeRail={vi.fn()}
        onChangeTab={vi.fn()}
        rail="open"
      />,
    );

    expect(screen.getByTestId("milestone-detail-sheet")).toBeTruthy();
    expect(screen.getByText("Assignments · buildContractorAssignments")).toBeTruthy();
    expect(screen.getByText("Recent events · activeBuildAuditEvents")).toBeTruthy();

    fireEvent.click(screen.getByTestId("milestone-detail-sheet-close"));
    expect(onChangeMilestone).toHaveBeenCalledWith(undefined);
  });

  test("writes clicked milestone cards back to the production route search state", () => {
    const onChangeMilestone = vi.fn();

    render(
      <ProductionBuildDetailSurface
        activeTab="details"
        detail={detail}
        onChangeMilestone={onChangeMilestone}
        onChangeRail={vi.fn()}
        onChangeTab={vi.fn()}
        rail="open"
      />,
    );

    fireEvent.click(screen.getByTestId("kanban-card-foundation"));
    expect(onChangeMilestone).toHaveBeenCalledWith("foundation");
  });

  test("captures assignment cost data from the milestone contractor drawer", async () => {
    const assignContractorToMilestone = vi.fn();

    render(
      <ProductionBuildDetailSurface
        actions={{ assignContractorToMilestone }}
        activeTab="details"
        detail={detail}
        onChangeRail={vi.fn()}
        onChangeTab={vi.fn()}
        rail="open"
      />,
    );

    fireEvent.click(screen.getByTestId("kanban-card-assign-contractor-foundation"));
    expect(screen.getByText("Cost tracking")).toBeTruthy();

    fireEvent.click(screen.getByText("Available Concrete"));
    fireEvent.change(screen.getByPlaceholderText("Foundation lead"), {
      target: { value: "Concrete lead" },
    });
    fireEvent.change(screen.getByPlaceholderText("90.00"), {
      target: { value: "95" },
    });
    fireEvent.change(screen.getByPlaceholderText("48"), {
      target: { value: "42.5" },
    });
    fireEvent.change(screen.getByPlaceholderText("4185.00"), {
      target: { value: "4010" },
    });
    fireEvent.change(
      screen.getByPlaceholderText("Crew finished early; no lift rental needed."),
      {
        target: { value: "Crew finished under estimate." },
      },
    );
    fireEvent.click(screen.getByRole("button", { name: /Attach contractor/i }));

    await waitFor(() =>
      expect(assignContractorToMilestone).toHaveBeenCalledWith({
        assignmentCost: {
          actualCostCents: 401_000,
          actualHours: undefined,
          agreedRateCents: 9_500,
          agreedRateUnit: "hour",
          costNotes: "Crew finished under estimate.",
          estimatedCostCents: undefined,
          estimatedHours: 42.5,
        },
        contractorId: "contractor-available-01",
        milestoneKey: "foundation",
        role: "Concrete lead",
      }),
    );
  });

  test("links attached contractors to the provided detail route", () => {
    render(
      <ProductionBuildDetailSurface
        activeTab="details"
        contractorDetailHrefFor={(contractorId) =>
          `/builder/contractors/${contractorId}`
        }
        detail={detail}
        onChangeRail={vi.fn()}
        onChangeTab={vi.fn()}
        rail="open"
      />,
    );

    expect(
      screen
        .getByTestId("build-detail-contractor-link-contractor-01")
        .getAttribute("href"),
    ).toBe("/builder/contractors/contractor-01");
  });

  test("derives scheduled ready milestones out of backlog without marking work started", () => {
    render(
      <ProductionBuildDetailSurface
        activeTab="details"
        detail={{
          ...detail,
          milestones: [
            {
              ...detail.milestones[0],
              evidenceState: "Draft package",
              progressPercent: undefined,
              status: "planned",
            },
          ],
          submilestones: [],
        }}
        onChangeRail={vi.fn()}
        onChangeTab={vi.fn()}
        rail="open"
        timelineWorkspace={{
          ...timelineWorkspace,
          plan: { ...timelineWorkspace.plan, currentDay: 5 },
        }}
      />,
    );

    const inProgress = screen.getByTestId("kanban-col-InProgress");
    expect(within(inProgress).getByTestId("kanban-card-foundation")).toBeTruthy();
    expect(within(inProgress).getByText("Ready")).toBeTruthy();
    expect(
      within(screen.getByTestId("kanban-col-Backlog")).queryByTestId(
        "kanban-card-foundation",
      ),
    ).toBeNull();
  });

  test("keeps future planned milestones in backlog until schedule unlock", () => {
    render(
      <ProductionBuildDetailSurface
        activeTab="details"
        detail={{
          ...detail,
          milestones: [
            {
              ...detail.milestones[0],
              dayEnd: 25,
              dayStart: 15,
              evidenceState: "Draft package",
              progressPercent: undefined,
              status: "planned",
            },
          ],
          submilestones: [],
        }}
        onChangeRail={vi.fn()}
        onChangeTab={vi.fn()}
        rail="open"
        timelineWorkspace={{
          ...timelineWorkspace,
          plan: { ...timelineWorkspace.plan, currentDay: 5 },
        }}
      />,
    );

    const backlog = screen.getByTestId("kanban-col-Backlog");
    expect(within(backlog).getByTestId("kanban-card-foundation")).toBeTruthy();
    expect(within(backlog).getByText("Planned")).toBeTruthy();
  });

  test("exposes explicit start-work action for scheduled ready milestones", () => {
    const startMilestoneWork = vi.fn();

    render(
      <ProductionBuildDetailSurface
        actions={{ startMilestoneWork }}
        activeTab="details"
        detail={{
          ...detail,
          milestones: [
            {
              ...detail.milestones[0],
              evidenceState: "Draft package",
              progressPercent: undefined,
              status: "planned",
            },
          ],
          submilestones: [],
        }}
        milestoneKey="foundation"
        onChangeRail={vi.fn()}
        onChangeTab={vi.fn()}
        rail="open"
        timelineWorkspace={{
          ...timelineWorkspace,
          plan: { ...timelineWorkspace.plan, currentDay: 5 },
        }}
      />,
    );

    fireEvent.click(screen.getByTestId("milestone-detail-sheet-start-work"));
    expect(startMilestoneWork).toHaveBeenCalledWith({
      milestoneKey: "foundation",
      note: undefined,
    });
  });

  test("renders the migrated production details workspace with demo-route parity regions", () => {
    render(
      <ProductionBuildDetailSurface
        activeTab="details"
        detail={detail}
        onChangeRail={vi.fn()}
        onChangeTab={vi.fn()}
        rail="open"
      />,
    );

    expect(screen.getByTestId("build-detail-site-photos")).toBeTruthy();
    expect(screen.getByTestId("build-detail-draws")).toBeTruthy();
    expect(screen.getByTestId("build-detail-kanban")).toBeTruthy();
    expect(screen.getByTestId("build-detail-contractors")).toBeTruthy();
    expect(screen.getByTestId("build-detail-documents")).toBeTruthy();
    expect(screen.getByTestId("internal-notes")).toBeTruthy();
    expect(screen.getByTestId("public-notes")).toBeTruthy();
    expect(screen.getByTestId("build-detail-events-trigger")).toBeTruthy();
    expect(screen.getByTestId("build-detail-rail")).toBeTruthy();
    expect(screen.queryByTestId("production-build-milestones")).toBeNull();
  });

  test("renders the rich production-backed timeline workspace", () => {
    render(
      <ProductionBuildDetailSurface
        activeBuildId="active-build-01"
        activeTab="timeline"
        detail={detail}
        onChangeRail={vi.fn()}
        onChangeTab={vi.fn()}
        rail="closed"
        timelineWorkspace={timelineWorkspace}
        workosOrganizationId="org_test"
      />,
    );

    expect(screen.getByTestId("production-build-timeline")).toBeTruthy();
    expect(screen.getByTestId("mock-active-build-timeline-milestones").textContent).toBe(
      "1",
    );
    expect(screen.getByTestId("mock-active-build-timeline-draws").textContent).toBe(
      "1",
    );
  });

  test("renders the rich production-backed Gantt workspace", () => {
    render(
      <ProductionBuildDetailSurface
        activeBuildId="active-build-01"
        activeTab="gantt"
        detail={detail}
        onChangeRail={vi.fn()}
        onChangeTab={vi.fn()}
        rail="closed"
        timelineWorkspace={timelineWorkspace}
        workosOrganizationId="org_test"
      />,
    );

    expect(screen.getByTestId("production-build-gantt")).toBeTruthy();
    expect(screen.getByTestId("mock-active-build-gantt-foundation")).toBeTruthy();
  });
});
