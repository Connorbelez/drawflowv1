// @vitest-environment jsdom

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("convex/react", () => ({
  useMutation: () => vi.fn(),
  useQuery: () => undefined,
}));

vi.mock("nuqs", () => ({
  parseAsString: {},
  useQueryStates: () => [{ share: null }, vi.fn()],
}));

vi.mock("#/components/roadmap/AnimatedCurvedTimeline.tsx", () => ({
  AnimatedCurvedTimeline: () => <div data-testid="mock-animated-timeline" />,
}));

vi.mock(
  "#/features/timeline-workspace/-TimelineCashflowCompoundChart.tsx",
  () => ({
    TimelineCashflowCompoundChart: () => <div data-testid="mock-cashflow" />,
  }),
);

vi.mock(
  "#/features/timeline-workspace/-TimelineDrawAvailabilityChart.tsx",
  () => ({
    TimelineDrawAvailabilityChart: () => <div data-testid="mock-draw-chart" />,
  }),
);

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

vi.mock("./ActiveBuildTimelineWorkspace.tsx", () => ({
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
  ActiveBuildGanttWorkspace: ({
    detail,
  }: {
    detail: ProductionBuildDetail;
  }) => (
    <div data-testid="mock-active-build-gantt">
      {detail.milestones.map((milestone) => (
        <div
          data-testid={`mock-active-build-gantt-${milestone.key}`}
          key={milestone.key}
        >
          {milestone.name}
        </div>
      ))}
    </div>
  ),
}));

vi.mock("./ActiveBuildGanttWorkspace.tsx", () => ({
  ActiveBuildGanttWorkspace: ({
    detail,
  }: {
    detail: ProductionBuildDetail;
  }) => (
    <div data-testid="mock-active-build-gantt">
      {detail.milestones.map((milestone) => (
        <div
          data-testid={`mock-active-build-gantt-${milestone.key}`}
          key={milestone.key}
        >
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

beforeEach(() => {
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
  class ResizeObserverMock {
    observe = vi.fn();
    unobserve = vi.fn();
    disconnect = vi.fn();
  }
  Object.defineProperty(window, "ResizeObserver", {
    configurable: true,
    value: ResizeObserverMock,
  });
  Object.defineProperty(globalThis, "ResizeObserver", {
    configurable: true,
    value: ResizeObserverMock,
  });
  if (!Element.prototype.getAnimations) {
    Object.defineProperty(Element.prototype, "getAnimations", {
      configurable: true,
      value: () => [],
    });
  }
});

afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
  document.body.removeAttribute("style");
});

const detail: ProductionBuildDetail = {
  build: {
    _id: "active-build-01",
    buildName: "Approved With Permit Site",
    location: "Toronto, ON",
    locationLatitude: 43.653226,
    locationLongitude: -79.383184,
    locationPlaceId: "place_toronto",
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
  milestoneContractorAssignments: [
    {
      _id: "milestone-assignment-01",
      contractorId: "contractor-01",
      milestoneKey: "foundation",
      role: "Foundation contractor",
      status: "active",
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
      storageUrl: "https://example.com/build-permit.pdf",
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
    expect(within(tabbar).getByText("Evidence")).toBeTruthy();
    expect(within(tabbar).getByText("Calendar")).toBeTruthy();
    expect(within(tabbar).getByText("Gantt")).toBeTruthy();
    expect(
      screen
        .getByTestId("build-detail-tab-details")
        .getAttribute("aria-selected"),
    ).toBe("true");

    fireEvent.click(screen.getByTestId("build-detail-tab-timeline"));
    expect(onChangeTab).toHaveBeenCalledWith("timeline");
  });

  test("renders Google Maps satellite imagery for the build site photos", () => {
    vi.stubEnv("VITE_GOOGLE_MAPS_API_KEY", "maps-key");

    render(
      <ProductionBuildDetailSurface
        activeTab="details"
        detail={detail}
        onChangeRail={vi.fn()}
        onChangeTab={vi.fn()}
        rail="open"
      />,
    );

    const image = screen.getByAltText("Foundation site photo satellite view");
    const src = image.getAttribute("src");

    expect(src).toBeTruthy();
    const url = new URL(src ?? "");
    expect(url.searchParams.get("center")).toBe("43.653226,-79.383184");
    expect(url.searchParams.get("maptype")).toBe("satellite");
    expect(url.searchParams.get("key")).toBe("maps-key");
  });

  test("renders interactive builder evidence and completed site visits in the evidence tab", async () => {
    const onChangeMilestone = vi.fn();
    const reviewEvidence = vi.fn().mockResolvedValue(null);

    render(
      <ProductionBuildDetailSurface
        actions={{ reviewEvidence }}
        activeTab="evidence"
        detail={{
          ...detail,
          evidenceAssets: [
            {
              _id: "evidence-asset-01",
              createdAt: Date.now(),
              evidenceKey: "foundation-photo-01",
              fileName: "foundation-photo.jpg",
              label: "Foundation photo",
              locationVerified: false,
              milestoneKey: "foundation",
              mimeType: "image/jpeg",
              previewUrl: "https://example.com/foundation-photo.jpg",
              sizeBytes: 238_000,
              source: "active_build_timeline_upload",
              tag: "Foundation",
              updatedAt: Date.now(),
            },
            {
              _id: "evidence-asset-02",
              createdAt: Date.now(),
              evidenceKey: "foundation-site-visit-report-01",
              fileName: "site-visit-foundation.pdf",
              label: "Foundation site visit report",
              locationVerified: true,
              milestoneKey: "foundation",
              mimeType: "application/pdf",
              previewUrl: "https://example.com/site-visit-foundation.pdf",
              sizeBytes: 91_000,
              source: "active_build_site_visit:visit-foundation-01",
              tag: "Inspection report",
              updatedAt: Date.now(),
            },
          ],
          milestones: [
            {
              ...detail.milestones[0],
              completionClaim: {
                actualCostCents: 221_000_00,
                completedDay: 28,
                note: "Footings and wall forms complete.",
                submittedAt: "2026-06-28T12:00:00.000Z",
              },
              completionReview: {
                status: "revisionRequested",
              },
              evidenceState: "Submitted package",
            },
          ],
          sitePhotos: [
            {
              caption: "Foundation site photo",
              evidenceKey: "foundation-site-photo",
              locationVerified: false,
              takenAt: "2026-06-28",
              url: "production-evidence://foundation-site-photo",
            },
          ],
          siteVisits: [
            {
              _id: "visit-01",
              completedAt: "2026-06-29T14:00:00.000Z",
              milestoneKey: "foundation",
              note: "Requested after location issue.",
              recordNote: "Inspector verified foundation completion.",
              requestedAt: "2026-06-28T18:00:00.000Z",
              requestedDay: 29,
              status: "complete",
              visitId: "visit-foundation-01",
            },
          ],
        }}
        onChangeMilestone={onChangeMilestone}
        onChangeRail={vi.fn()}
        onChangeTab={vi.fn()}
        rail="closed"
      />,
    );

    expect(screen.getByTestId("production-build-evidence")).toBeTruthy();
    expect(screen.getByText("Builder Submitted Evidence")).toBeTruthy();
    expect(screen.getByText("Completed Site Visits")).toBeTruthy();
    expect(screen.getByText("Builder submitted")).toBeTruthy();
    expect(screen.getByText("Site visit")).toBeTruthy();
    expect(screen.getAllByText("Location unverified").length).toBeGreaterThan(
      0,
    );
    expect(screen.getByText("Footings and wall forms complete.")).toBeTruthy();
    expect(screen.getAllByText("Evidence package").length).toBeGreaterThan(0);
    expect(screen.getByText("Foundation photo")).toBeTruthy();
    expect(screen.getByText("foundation-photo.jpg")).toBeTruthy();
    expect(
      screen
        .getAllByRole("link", { name: /Open file/i })
        .some(
          (link) =>
            link.getAttribute("href") ===
            "https://example.com/foundation-photo.jpg",
        ),
    ).toBe(true);
    expect(
      screen.getByText("Inspector verified foundation completion."),
    ).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /Approve evidence/i }));
    await waitFor(() =>
      expect(reviewEvidence).toHaveBeenCalledWith({
        accepted: true,
        milestoneKey: "foundation",
        note: "Evidence approved from build evidence tab.",
      }),
    );

    fireEvent.click(
      screen.getAllByRole("button", { name: /Open milestone/i })[0],
    );
    expect(onChangeMilestone).toHaveBeenCalledWith("foundation");
  });

  test("renders the current overview as the default build details card tab", () => {
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
    expect(screen.getByTestId("build-overview-current-panel")).toBeTruthy();
    expect(screen.getByTestId("current-milestone-foundation")).toBeTruthy();
    expect(screen.getByText("Current milestone")).toBeTruthy();
    expect(
      within(screen.getByTestId("current-milestone-foundation")).getByText(
        "Foundation contractor",
      ),
    ).toBeTruthy();
    expect(screen.getByText("Review milestone completion")).toBeTruthy();
    expect(screen.getByTestId("build-detail-kanban")).toBeTruthy();
    expect(screen.getByTestId("build-detail-draws")).toBeTruthy();
    expect(screen.getByTestId("facility-change-requests")).toBeTruthy();
    expect(screen.getByTestId("build-permit-viewer-trigger")).toBeTruthy();

    fireEvent.click(screen.getByTestId("build-overview-tab-draws"));
    expect(screen.getByTestId("draw-overview-panel")).toBeTruthy();
    expect(
      screen.getByTestId("draw-overview-availability").textContent,
    ).toContain("$0");
    expect(screen.queryByTestId("draw-overview-upcoming-draw")).toBeNull();
    expect(screen.getByTestId("draw-overview-approval-queue").textContent).toContain(
      "No draw requests are waiting for lender action.",
    );
    expect(screen.getByText("Past draws")).toBeTruthy();
    expect(screen.getByText("Upcoming schedule")).toBeTruthy();

    fireEvent.click(screen.getByTestId("build-overview-tab-loan"));
    expect(screen.getByText("Loan Details")).toBeTruthy();
    expect(screen.getAllByText("$550,000").length).toBeGreaterThan(0);
    expect(screen.getByText("Payback date")).toBeTruthy();

    fireEvent.click(screen.getByTestId("build-overview-tab-build"));
    expect(screen.getByText("43.653226")).toBeTruthy();
    expect(screen.getByText("-79.383184")).toBeTruthy();
  });

  test("displays past, in-flight, and upcoming draws in the draw overview tab", () => {
    render(
      <ProductionBuildDetailSurface
        activeTab="details"
        detail={{
          ...detail,
          draws: [
            {
              ...detail.draws[0],
              _id: "draw-released",
              amountCents: 75_000_00,
              drawKey: "draw-released",
              label: "Released permit reimbursement",
              order: 0,
              releasedAt: "2026-06-12T12:00:00.000Z",
              requestedAt: "2026-06-10T12:00:00.000Z",
              reviewedAt: "2026-06-11T12:00:00.000Z",
              status: "released",
              timingDay: 12,
            },
            {
              ...detail.draws[0],
              _id: "draw-requested",
              amountCents: 40_000_00,
              drawKey: "draw-requested",
              label: "Requested foundation holdback",
              order: 1,
              requestedAt: "2026-06-20T12:00:00.000Z",
              status: "requested",
              timingDay: 20,
            },
            {
              ...detail.draws[0],
              _id: "draw-planned",
              amountCents: 88_000_00,
              drawKey: "draw-planned",
              label: "Upcoming foundation reimbursement",
              order: 2,
              status: "planned",
              timingDay: 31,
            },
          ],
        }}
        onChangeRail={vi.fn()}
        onChangeTab={vi.fn()}
        rail="closed"
      />,
    );

    fireEvent.click(screen.getByTestId("build-overview-tab-draws"));
    expect(screen.getByTestId("draw-overview-past-draws").textContent).toContain(
      "Released permit reimbursement",
    );
    expect(
      screen.getByTestId("draw-overview-in-flight-draws").textContent,
    ).toContain("Requested foundation holdback");
    expect(
      screen.getByTestId("draw-overview-scheduled-draws").textContent,
    ).toContain("Upcoming foundation reimbursement");
  });

  test("shows lender approval controls instead of request controls in draw overview", async () => {
    const approveDraw = vi.fn().mockResolvedValue(null);
    const rejectDraw = vi.fn().mockResolvedValue(null);
    const releaseDraw = vi.fn().mockResolvedValue(null);

    render(
      <ProductionBuildDetailSurface
        actions={{ approveDraw, rejectDraw, releaseDraw }}
        activeTab="details"
        detail={{
          ...detail,
          draws: [
            {
              ...detail.draws[0],
              _id: "draw-requested",
              amountCents: 88_000_00,
              drawKey: "draw-requested",
              label: "Requested foundation reimbursement",
              requestedAt: "2026-06-24T12:00:00.000Z",
              status: "requested",
            },
            {
              ...detail.draws[0],
              _id: "draw-approved",
              amountCents: 64_000_00,
              drawKey: "draw-approved",
              label: "Approved framing reimbursement",
              order: 2,
              reviewedAt: "2026-06-25T12:00:00.000Z",
              status: "approved",
            },
          ],
        }}
        onChangeRail={vi.fn()}
        onChangeTab={vi.fn()}
        rail="closed"
        viewerRole="lender"
      />,
    );

    fireEvent.click(screen.getByTestId("build-overview-tab-draws"));

    expect(screen.queryByTestId("draw-overview-request-now")).toBeNull();
    expect(screen.getByTestId("draw-overview-approval-queue").textContent).toContain(
      "Draw approval queue",
    );

    fireEvent.click(screen.getByTestId("draw-overview-approve-draw-requested"));
    await waitFor(() => expect(approveDraw).toHaveBeenCalledTimes(1));
    expect(approveDraw.mock.calls[0]?.[0]).toMatchObject({
      drawKey: "draw-requested",
    });

    fireEvent.click(screen.getByTestId("draw-overview-release-draw-approved"));
    await waitFor(() => expect(releaseDraw).toHaveBeenCalledTimes(1));
    expect(releaseDraw.mock.calls[0]?.[0]).toMatchObject({
      drawKey: "draw-approved",
    });

    expect(screen.queryByTestId("build-detail-draw-request-draw-requested")).toBeNull();
  });

  test("does not expose lender request buttons for planned draw rows", () => {
    render(
      <ProductionBuildDetailSurface
        actions={{ approveDraw: vi.fn(), rejectDraw: vi.fn() }}
        activeTab="details"
        detail={detail}
        onChangeRail={vi.fn()}
        onChangeTab={vi.fn()}
        rail="closed"
        viewerRole="lender"
      />,
    );

    expect(screen.queryByTestId("build-detail-draw-request-draw-01")).toBeNull();
    expect(screen.getByText("Awaiting request")).toBeTruthy();
  });

  test("opens the milestone completion review sheet from the current overview", async () => {
    const approveMilestone = vi.fn().mockResolvedValue(null);
    render(
      <ProductionBuildDetailSurface
        actions={{ approveMilestone }}
        activeTab="details"
        detail={detail}
        onChangeRail={vi.fn()}
        onChangeTab={vi.fn()}
        rail="closed"
      />,
    );

    fireEvent.click(screen.getByTestId("current-milestone-review-foundation"));
    expect(
      screen.getByTestId("milestone-completion-review-summary")
    ).toBeTruthy();
    expect(screen.getByText("Builder submitted evidence")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /Approve completion/i }));

    await waitFor(() =>
      expect(approveMilestone).toHaveBeenCalledWith({
        milestoneKey: "foundation",
        note: "Approved from milestone completion review.",
      }),
    );
  });

  test("sorts current milestones with the most recent completion request first", () => {
    render(
      <ProductionBuildDetailSurface
        activeTab="details"
        detail={{
          ...detail,
          milestones: [
            {
              ...detail.milestones[0],
              completionClaim: {
                completedDay: 30,
                submittedAt: "2026-06-24T12:00:00.000Z",
              },
              key: "foundation",
              name: "Foundation",
              order: 1,
              progressPercent: 100,
            },
            {
              ...detail.milestones[0],
              _id: "milestone-02",
              budgetCents: 145_040_00,
              completionClaim: {
                completedDay: 55,
                submittedAt: "2026-07-27T12:00:00.000Z",
              },
              dayEnd: 55,
              dayStart: 26,
              drawAvailabilityCents: 106_329_00,
              key: "framing",
              name: "Underground, framing & roof",
              order: 2,
              progressPercent: 100,
            },
          ],
        }}
        onChangeRail={vi.fn()}
        onChangeTab={vi.fn()}
        rail="closed"
      />,
    );

    const currentMilestones = screen.getByTestId("current-milestones");
    const text = currentMilestones.textContent ?? "";
    expect(text.indexOf("Underground, framing & roof")).toBeLessThan(
      text.indexOf("Foundation"),
    );
  });

  test("reviews builder evidence and orders site visits from the completion sheet", async () => {
    const approveMilestone = vi.fn().mockResolvedValue(null);
    const assignSiteVisit = vi.fn().mockResolvedValue(null);
    const reviewEvidence = vi.fn().mockResolvedValue(null);
    render(
      <ProductionBuildDetailSurface
        actions={{ approveMilestone, assignSiteVisit, reviewEvidence }}
        activeTab="details"
        detail={{
          ...detail,
          evidenceAssets: [
            {
              _id: "evidence-asset-01",
              createdAt: Date.now(),
              evidenceKey: "foundation-photo-01",
              fileName: "foundation-photo.jpg",
              label: "Foundation photo",
              locationVerified: true,
              milestoneKey: "foundation",
              mimeType: "image/jpeg",
              previewUrl: "https://example.com/foundation-photo.jpg",
              sizeBytes: 238_000,
              source: "active_build_timeline_upload",
              tag: "Foundation",
              updatedAt: Date.now(),
            },
          ],
          milestones: [
            {
              ...detail.milestones[0],
              completionClaim: {
                completedDay: 30,
                note: "Foundation work is complete.",
                submittedAt: "2026-06-24T12:00:00.000Z",
              },
              progressPercent: 100,
            },
          ],
        }}
        onChangeRail={vi.fn()}
        onChangeTab={vi.fn()}
        rail="closed"
      />,
    );

    fireEvent.click(screen.getByTestId("current-milestone-review-foundation"));
    expect(screen.getByText("Foundation photo")).toBeTruthy();
    expect(screen.getByText("No site visit has been ordered for this milestone."))
      .toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /Order site visit/i }));
    await waitFor(() =>
      expect(assignSiteVisit).toHaveBeenCalledWith({
        milestoneKey: "foundation",
      }),
    );

    fireEvent.click(screen.getByRole("button", { name: /Approve evidence/i }));
    await waitFor(() =>
      expect(reviewEvidence).toHaveBeenCalledWith({
        accepted: true,
        milestoneKey: "foundation",
        note: "Builder evidence approved from milestone completion review.",
      }),
    );
  });

  test("displays ordered site visit token state and regeneration controls", async () => {
    const assignSiteVisit = vi.fn().mockResolvedValue(null);
    const cancelSiteVisit = vi.fn().mockResolvedValue(null);
    render(
      <ProductionBuildDetailSurface
        actions={{ assignSiteVisit, cancelSiteVisit }}
        activeTab="details"
        detail={{
          ...detail,
          milestones: [
            {
              ...detail.milestones[0],
              completionClaim: {
                completedDay: 30,
                submittedAt: "2026-06-24T12:00:00.000Z",
              },
              progressPercent: 100,
            },
          ],
          siteVisits: [
            {
              _id: "site-visit-token-01",
              milestoneKey: "foundation",
              requestedAt: "2026-06-24T12:00:00.000Z",
              requestedDay: 30,
              requestedTime: "14:30",
              status: "requested",
              tokenExpiresAt: 4_102_444_800_000,
              tokenOpenedAt: 1_771_984_800_000,
              url: "/newsitevisit/active-build-01/visit-foundation-token",
              visitId: "visit-foundation-token",
            },
          ],
        }}
        onChangeRail={vi.fn()}
        onChangeTab={vi.fn()}
        rail="closed"
      />,
    );

    fireEvent.click(screen.getByTestId("current-milestone-review-foundation"));
    expect(screen.getByTestId("site-visit-token-panel")).toBeTruthy();
    expect(screen.getAllByText("Site visit in progress").length).toBeGreaterThan(
      0,
    );
    expect(screen.getByText("Ordered")).toBeTruthy();
    expect(screen.getAllByText("Opened").length).toBeGreaterThan(0);
    expect(screen.getByTestId("site-visit-token-value").textContent).toContain(
      "visit-foundation-token",
    );
    expect(screen.getByTestId("site-visit-token-url").textContent).toContain(
      "/newsitevisit/active-build-01/visit-foundation-token",
    );
    expect(screen.getByText("Requested time: 14:30")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /Regenerate token/i }));
    await waitFor(() =>
      expect(assignSiteVisit).toHaveBeenCalledWith({
        milestoneKey: "foundation",
      }),
    );

    fireEvent.click(screen.getByRole("button", { name: /Cancel site visit/i }));
    await waitFor(() =>
      expect(cancelSiteVisit).toHaveBeenCalledWith({
        reason: "Cancelled from milestone completion review.",
        visitId: "visit-foundation-token",
      }),
    );
  });

  test("displays completed site visit reports in the completion review sheet", () => {
    render(
      <ProductionBuildDetailSurface
        activeTab="details"
        detail={{
          ...detail,
          evidenceAssets: [
            {
              _id: "evidence-asset-02",
              createdAt: Date.now(),
              evidenceKey: "foundation-site-visit-report-01",
              fileName: "site-visit-foundation.pdf",
              label: "Foundation site visit report",
              locationVerified: true,
              milestoneKey: "foundation",
              mimeType: "application/pdf",
              previewUrl: "https://example.com/site-visit-foundation.pdf",
              sizeBytes: 91_000,
              source: "active_build_site_visit:visit-foundation-01",
              tag: "Inspection report",
              updatedAt: Date.now(),
            },
          ],
          milestones: [
            {
              ...detail.milestones[0],
              completionClaim: {
                completedDay: 30,
                submittedAt: "2026-06-24T12:00:00.000Z",
              },
              progressPercent: 100,
            },
          ],
          siteVisits: [
            {
              _id: "site-visit-01",
              completedAt: "2026-06-24T16:00:00.000Z",
              milestoneKey: "foundation",
              recordNote: "Inspector verified the completed foundation scope.",
              recordNoteFormat: "plain_text",
              requestedAt: "2026-06-24T12:00:00.000Z",
              requestedDay: 30,
              status: "complete",
              visitId: "visit-foundation-01",
            },
          ],
        }}
        onChangeRail={vi.fn()}
        onChangeTab={vi.fn()}
        rail="closed"
      />,
    );

    fireEvent.click(screen.getByTestId("current-milestone-review-foundation"));
    expect(screen.getAllByText("Site visit completed").length).toBeGreaterThan(0);
    expect(screen.getByTestId("completed-site-visit-review")).toBeTruthy();
    expect(
      screen.getByText("Inspector verified the completed foundation scope."),
    ).toBeTruthy();
    expect(screen.getByText("Foundation site visit report")).toBeTruthy();
  });

  test("requests the upcoming draw with the amount clipped to availability", async () => {
    const requestDraw = vi.fn().mockResolvedValue(null);
    render(
      <ProductionBuildDetailSurface
        actions={{ requestDraw }}
        activeTab="details"
        detail={{
          ...detail,
          milestones: [
            {
              _id: "milestone-00",
              budgetCents: 100_000_00,
              dayEnd: 0,
              dayStart: 0,
              dependencyKeys: [],
              drawAvailabilityCents: 100_000_00,
              durationDays: 1,
              evidenceState: "Approved",
              key: "permit",
              name: "Permit approval",
              order: 0,
              status: "complete",
            },
            ...detail.milestones,
          ],
        }}
        onChangeRail={vi.fn()}
        onChangeTab={vi.fn()}
        rail="closed"
        viewerRole="builder"
      />,
    );

    fireEvent.click(screen.getByTestId("build-overview-tab-draws"));
    expect(
      screen.getByTestId("draw-overview-availability").textContent,
    ).toContain("$100,000");
    fireEvent.click(screen.getByTestId("draw-overview-request-now"));

    await waitFor(() => expect(requestDraw).toHaveBeenCalledTimes(1));
    expect(requestDraw.mock.calls[0]?.[0]).toMatchObject({
      amountCents: 100_000_00,
      drawKey: "draw-01",
    });
  });

  test("opens a sheet to edit active build non-financial details", async () => {
    vi.stubEnv("VITE_GOOGLE_MAPS_API_KEY", "maps-key");
    const updateNonFinancialDetails = vi.fn().mockResolvedValue(null);
    render(
      <ProductionBuildDetailSurface
        actions={{ updateNonFinancialDetails }}
        activeTab="details"
        detail={detail}
        onChangeRail={vi.fn()}
        onChangeTab={vi.fn()}
        rail="closed"
      />,
    );

    fireEvent.click(screen.getByTestId("edit-build-details-trigger"));
    expect(screen.getByText("Edit build details")).toBeTruthy();
    expect(screen.getByText("Location metadata")).toBeTruthy();
    expect(screen.getByText("place_toronto")).toBeTruthy();
    const map = screen.getByTestId("build-details-satellite-map");
    const mapUrl = new URL(map.getAttribute("src") ?? "");
    expect(mapUrl.searchParams.get("center")).toBe("43.653226,-79.383184");

    fireEvent.change(screen.getByTestId("build-details-title-input"), {
      target: { value: "Renamed active build" },
    });
    fireEvent.change(screen.getByTestId("build-details-address-input"), {
      target: { value: "26 Luverne, ON" },
    });
    fireEvent.change(screen.getByTestId("build-details-start-date-input"), {
      target: { value: "2026-06-02" },
    });
    fireEvent.change(screen.getByTestId("build-details-reason-input"), {
      target: { value: "Correct borrower-facing build metadata." },
    });
    fireEvent.click(screen.getByTestId("build-details-save"));

    await waitFor(() =>
      expect(updateNonFinancialDetails).toHaveBeenCalledWith({
        buildName: "Renamed active build",
        location: "26 Luverne, ON",
        locationLatitude: null,
        locationLongitude: null,
        locationPlaceId: null,
        reason: "Correct borrower-facing build metadata.",
        startDate: "2026-06-02",
      }),
    );
  });

  test("exposes the active build permit PDF from the build header", () => {
    render(
      <ProductionBuildDetailSurface
        activeTab="details"
        detail={detail}
        onChangeRail={vi.fn()}
        onChangeTab={vi.fn()}
        rail="open"
      />,
    );

    expect(screen.getByTestId("build-permit-viewer-trigger")).toBeTruthy();
    expect(
      screen
        .getByTestId("build-detail-document-document-01-view")
        .getAttribute("href"),
    ).toBe("https://example.com/build-permit.pdf");
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
    expect(
      screen.getByText("Assignments · buildContractorAssignments"),
    ).toBeTruthy();
    expect(
      screen.getByText("Recent events · activeBuildAuditEvents"),
    ).toBeTruthy();

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

    fireEvent.click(
      screen.getByTestId("kanban-card-assign-contractor-foundation"),
    );
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
      screen.getByPlaceholderText(
        "Crew finished early; no lift rental needed.",
      ),
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
    expect(
      within(inProgress).getByTestId("kanban-card-foundation"),
    ).toBeTruthy();
    expect(within(inProgress).getByText("Ready")).toBeTruthy();
    expect(
      within(screen.getByTestId("kanban-col-Backlog")).queryByTestId(
        "kanban-card-foundation",
      ),
    ).toBeNull();
  });

  test("moves builder completion claims into marked complete instead of in progress", () => {
    render(
      <ProductionBuildDetailSurface
        activeTab="details"
        detail={{
          ...detail,
          milestones: [
            {
              ...detail.milestones[0],
              completionClaim: {
                completedDay: 26,
                note: "Builder marked complete.",
                submittedAt: "2026-06-26T12:00:00.000Z",
              },
              evidenceState: "Submitted package",
              progressPercent: 100,
              status: "in_progress",
            },
          ],
          submilestones: [
            {
              ...detail.submilestones[0],
              status: "complete",
            },
          ],
        }}
        onChangeRail={vi.fn()}
        onChangeTab={vi.fn()}
        rail="open"
        timelineWorkspace={{
          ...timelineWorkspace,
          plan: { ...timelineWorkspace.plan, currentDay: 27 },
        }}
      />,
    );

    const markedComplete = screen.getByTestId("kanban-col-MarkedComplete");
    expect(
      within(markedComplete).getByTestId("kanban-card-foundation"),
    ).toBeTruthy();
    expect(within(markedComplete).getByText("Marked complete")).toBeTruthy();
    expect(
      within(screen.getByTestId("kanban-col-InProgress")).queryByTestId(
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
  });
});
