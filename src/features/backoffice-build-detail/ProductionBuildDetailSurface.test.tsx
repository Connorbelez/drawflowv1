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
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

const convexMocks = vi.hoisted(() => ({
  collaborationRolloutState: {
    available: true,
    status: "active",
  } as {
    available: boolean;
    status: "active" | "disabled" | "migration_ready";
  },
  paginatedQueryError: null as Error | null,
}));

vi.mock("convex/react", () => ({
  useMutation: () => vi.fn(),
  usePaginatedQuery: () => {
    if (convexMocks.paginatedQueryError) {
      throw convexMocks.paginatedQueryError;
    }
    return {
      loadMore: vi.fn(),
      results: [],
      status: "Exhausted",
    };
  },
  useQuery: (reference: unknown) =>
    getFunctionName(reference as Parameters<typeof getFunctionName>[0]) ===
    "build_collaboration_rollout:getBuildCollaborationRolloutState"
      ? convexMocks.collaborationRolloutState
      : undefined,
}));

vi.mock("#/components/rich-text/field-rich-text.tsx", () => ({
  FieldRichTextEditor: ({
    ariaLabel,
    onChange,
    value,
  }: {
    ariaLabel: string;
    onChange: (value: string) => void;
    value: string;
  }) => (
    <textarea
      aria-label={ariaLabel}
      onChange={(event) => onChange(event.currentTarget.value)}
      value={value}
    />
  ),
  FieldRichTextPreview: () => null,
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
  ActiveBuildTimelineWorkspace: ({
    onRequestSiteVisit,
    workspace,
  }: {
    onRequestSiteVisit: (input: { milestoneKey: string }) => void;
    workspace: any;
  }) => (
    <div data-testid="mock-active-build-timeline">
      <button
        onClick={() => onRequestSiteVisit({ milestoneKey: "foundation" })}
        type="button"
      >
        Timeline order site visit
      </button>
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
  ActiveBuildTimelineWorkspace: ({
    onRequestSiteVisit,
    workspace,
  }: {
    onRequestSiteVisit: (input: { milestoneKey: string }) => void;
    workspace: any;
  }) => (
    <div data-testid="mock-active-build-timeline">
      <button
        onClick={() => onRequestSiteVisit({ milestoneKey: "foundation" })}
        type="button"
      >
        Timeline order site visit
      </button>
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
    onRequestSiteVisit,
    onStartWork,
    viewerRole,
  }: {
    detail: ProductionBuildDetail;
    onRequestSiteVisit: (input: { milestoneKey: string }) => void;
    onStartWork?: (milestoneKey: string) => void;
    viewerRole?: "builder" | "lender";
  }) => (
    <div
      data-testid="mock-active-build-gantt"
      data-viewer-role={viewerRole ?? "lender"}
    >
      <button
        onClick={() => onRequestSiteVisit({ milestoneKey: "foundation" })}
        type="button"
      >
        Gantt order site visit
      </button>
      {onStartWork ? (
        <button
          onClick={() => onStartWork("foundation")}
          type="button"
        >
          Gantt start work
        </button>
      ) : null}
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
    onRequestSiteVisit,
    onStartWork,
    viewerRole,
  }: {
    detail: ProductionBuildDetail;
    onRequestSiteVisit: (input: { milestoneKey: string }) => void;
    onStartWork?: (milestoneKey: string) => void;
    viewerRole?: "builder" | "lender";
  }) => (
    <div
      data-testid="mock-active-build-gantt"
      data-viewer-role={viewerRole ?? "lender"}
    >
      <button
        onClick={() => onRequestSiteVisit({ milestoneKey: "foundation" })}
        type="button"
      >
        Gantt order site visit
      </button>
      {onStartWork ? (
        <button onClick={() => onStartWork("foundation")} type="button">
          Gantt start work
        </button>
      ) : null}
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
  convexMocks.collaborationRolloutState = {
    available: true,
    status: "active",
  };
  convexMocks.paginatedQueryError = null;
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
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
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
    borrowerStartingCashCents: 180_000_00,
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
      actionLabel: "Review draw",
      body: "Review eligibility, evidence, and the requested amount.",
      createdAt: Date.now(),
      entityLabel: "Approved With Permit Site · Foundation reimbursement",
      entityType: "draw",
      href: "/backoffice/draws?buildId=active-build-01&drawId=quick-01",
      resolutionMode: "domain",
      sourceLabel: "Builder workspace",
      title: "Draw request awaiting review",
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
    expect(within(tabbar).getByText("Milestones")).toBeTruthy();
    expect(within(tabbar).getByText("Contractors")).toBeTruthy();
    expect(within(tabbar).getByText("Materials")).toBeTruthy();
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

    fireEvent.click(screen.getByTestId("build-detail-tab-contractors"));
    expect(onChangeTab).toHaveBeenCalledWith("contractors");

    fireEvent.click(screen.getByTestId("build-detail-tab-materials"));
    expect(onChangeTab).toHaveBeenCalledWith("materials");

    fireEvent.click(screen.getByTestId("build-detail-tab-milestones"));
    expect(onChangeTab).toHaveBeenCalledWith("milestones");
  });

  test("exposes only the active build workspace section as one labelled region", () => {
    const { rerender } = render(
      <ProductionBuildDetailSurface
        activeTab="details"
        detail={detail}
        onChangeRail={vi.fn()}
        onChangeTab={vi.fn()}
        rail="closed"
      />,
    );

    expect(screen.getAllByRole("region", { name: "Details workspace" })).toHaveLength(
      1,
    );
    expect(screen.queryByRole("region", { name: "Timeline workspace" })).toBeNull();

    rerender(
      <ProductionBuildDetailSurface
        activeTab="timeline"
        detail={detail}
        onChangeRail={vi.fn()}
        onChangeTab={vi.fn()}
        rail="closed"
        timelineWorkspace={timelineWorkspace}
      />,
    );

    expect(screen.getAllByRole("region", { name: "Timeline workspace" })).toHaveLength(
      1,
    );
    expect(screen.queryByRole("region", { name: "Details workspace" })).toBeNull();
  });

  test("renders first-class milestone, contractor, and materials tabs for live builds", () => {
    const { rerender } = render(
      <ProductionBuildDetailSurface
        activeTab="milestones"
        detail={detail}
        onChangeRail={vi.fn()}
        onChangeTab={vi.fn()}
        rail="closed"
      />,
    );

    expect(screen.getByTestId("production-build-milestones")).toBeTruthy();
    expect(screen.getByTestId("build-detail-kanban")).toBeTruthy();
    expect(screen.getByTestId("kanban-card-foundation")).toBeTruthy();

    rerender(
      <ProductionBuildDetailSurface
        activeTab="contractors"
        contractorDetailHrefFor={(contractorId) =>
          `/backoffice/contractors/${contractorId}`
        }
        detail={detail}
        onChangeRail={vi.fn()}
        onChangeTab={vi.fn()}
        rail="closed"
      />,
    );

    expect(screen.getByTestId("production-build-contractors")).toBeTruthy();
    expect(screen.getByTestId("proposal-contractor-planning")).toBeTruthy();
    expect(screen.getByTestId("contractor-card-contractor-01")).toBeTruthy();
    expect(screen.getByTestId("proposal-milestone-drop-foundation")).toBeTruthy();
    expect(screen.getAllByText("Site Lead Builders").length).toBeGreaterThan(
      1,
    );

    rerender(
      <ProductionBuildDetailSurface
        activeTab="materials"
        detail={{
          ...detail,
          costItems: [
            {
              _id: "cost-item-01",
              costCents: 8_000_00,
              description: "Concrete and rebar package.",
              itemType: "material",
              milestoneKey: "foundation",
              quantity: 1,
              relevantSubmilestoneKeys: ["excavation"],
              supplier: "Apex Supply",
              title: "Foundation material package",
            },
          ],
        }}
        onChangeRail={vi.fn()}
        onChangeTab={vi.fn()}
        rail="closed"
      />,
    );

    expect(screen.getByTestId("material-planning-tab")).toBeTruthy();
    expect(screen.getByText("Foundation material package")).toBeTruthy();
    expect(screen.getByText("Apex Supply")).toBeTruthy();
  });

  test("renders Google Maps satellite imagery for the build site photos", () => {
    vi.stubEnv("VITE_GOOGLE_MAPS_API_KEY", "maps-key");

    render(
      <ProductionBuildDetailSurface
        activeTab="details"
        detail={detail}
        onChangeRail={vi.fn()}
        onChangeTab={vi.fn()}
        rail="closed"
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
        rail="closed"
      />,
    );

    expect(screen.getByText("Approved With Permit Site")).toBeTruthy();
    expect(screen.getByText("Production active Build")).toBeTruthy();
    expect(screen.getByTestId("build-overview-current-panel")).toBeTruthy();
    expect(screen.getByTestId("current-active-draw-requests")).toBeTruthy();
    expect(
      screen.getByTestId("current-active-draw-requests-empty").textContent,
    ).toContain("No active draw requests.");
    expect(screen.getByTestId("current-milestone-foundation")).toBeTruthy();
    expect(screen.getByText("Behind Schedule Milestones")).toBeTruthy();
    expect(screen.getByText("Current Milestones")).toBeTruthy();
    expect(screen.getByText("Next Upcoming Milestone")).toBeTruthy();
    expect(screen.getByTestId("build-overview-layout").className).toContain(
      "xl:grid-cols-[minmax(0,2fr)_minmax(320px,1fr)]",
    );
    expect(
      within(screen.getByTestId("current-milestone-foundation")).getByText(
        "Foundation contractor",
      ),
    ).toBeTruthy();
    expect(screen.getByText("Review milestone completion")).toBeTruthy();
    expect(screen.queryByTestId("build-detail-kanban")).toBeNull();
    expect(screen.queryByTestId("build-detail-contractors")).toBeNull();
    expect(screen.queryByTestId("build-detail-documents")).toBeNull();
    expect(screen.queryByTestId("internal-notes")).toBeNull();
    expect(screen.queryByTestId("public-notes")).toBeNull();
    expect(screen.getByTestId("build-collaboration-unavailable")).toBeTruthy();
    expect(screen.getByTestId("build-permit-viewer-trigger")).toBeTruthy();

    fireEvent.click(screen.getByTestId("build-overview-tab-draws"));
    expect(screen.getByTestId("draw-overview-panel")).toBeTruthy();
    expect(screen.getByTestId("facility-change-requests")).toBeTruthy();
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

  test("keeps the Build Overview operational when collaboration cannot load", () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    convexMocks.paginatedQueryError = new Error(
      "Could not find public function for 'build_collaboration:listBuildCollaborationFeed'.",
    );

    render(
      <ProductionBuildDetailSurface
        activeTab="details"
        detail={detail}
        onChangeRail={vi.fn()}
        onChangeTab={vi.fn()}
        rail="closed"
        workosOrganizationId="org_fairlend"
      />,
    );

    expect(screen.getByTestId("build-overview-current-panel")).toBeTruthy();
    expect(screen.getByTestId("build-collaboration-error")).toBeTruthy();
    expect(screen.getByText("Collaboration is temporarily unavailable")).toBeTruthy();
    expect(consoleError).toHaveBeenCalled();
  });

  test("keeps Build Overview operational while tenant collaboration is disabled", () => {
    convexMocks.collaborationRolloutState = {
      available: false,
      status: "disabled",
    };

    render(
      <ProductionBuildDetailSurface
        activeTab="details"
        detail={detail}
        onChangeRail={vi.fn()}
        onChangeTab={vi.fn()}
        rail="closed"
        workosOrganizationId="org_fairlend"
      />,
    );

    expect(screen.getByTestId("build-overview-current-panel")).toBeTruthy();
    expect(screen.getByTestId("build-collaboration-unavailable")).toBeTruthy();
    expect(screen.getByText("Collaboration is unavailable")).toBeTruthy();
    expect(
      screen.getByText(/has not been activated for this lender organization/i),
    ).toBeTruthy();
  });

  test("delineates behind, current, and next milestones with schedule ownership and budget facts", () => {
    render(
      <ProductionBuildDetailSurface
        activeTab="details"
        detail={{
          ...detail,
          contractors: [
            ...(detail.contractors ?? []),
            {
              _id: "assignment-02",
              contractorId: "contractor-02",
              name: "Northline Framing",
              role: "Framing contractor",
              trades: ["framing"],
            },
            {
              _id: "assignment-03",
              contractorId: "contractor-03",
              name: "Precision Interiors",
              role: "Interior contractor",
              trades: ["interiors"],
            },
          ],
          milestoneContractorAssignments: [
            ...(detail.milestoneContractorAssignments ?? []),
            {
              _id: "milestone-assignment-02",
              contractorId: "contractor-02",
              milestoneKey: "framing",
              role: "Framing contractor",
              status: "active",
            },
            {
              _id: "milestone-assignment-03",
              contractorId: "contractor-03",
              milestoneKey: "interiors",
              role: "Interior contractor",
              status: "active",
            },
          ],
          milestones: [
            {
              ...detail.milestones[0],
              dayEnd: 10,
              durationDays: 10,
            },
            {
              ...detail.milestones[0],
              _id: "milestone-02",
              budgetCents: 145_040_00,
              dayEnd: 40,
              dayStart: 11,
              drawAvailabilityCents: 106_329_00,
              durationDays: 29,
              key: "framing",
              name: "Framing and roof",
              order: 2,
              status: "in_progress",
            },
            {
              ...detail.milestones[0],
              _id: "milestone-03",
              budgetCents: 92_500_00,
              dayEnd: 60,
              dayStart: 41,
              drawAvailabilityCents: 72_500_00,
              durationDays: 19,
              key: "interiors",
              name: "Interior rough-ins",
              order: 3,
              status: "planned",
            },
          ],
        }}
        onChangeRail={vi.fn()}
        onChangeTab={vi.fn()}
        rail="closed"
        timelineWorkspace={{
          ...timelineWorkspace,
          plan: { ...timelineWorkspace.plan, currentDay: 35 },
        }}
      />,
    );

    const behindSchedule = screen.getByTestId("behind-schedule-milestones");
    expect(within(behindSchedule).getByText("Foundation")).toBeTruthy();
    expect(within(behindSchedule).getByText("25 days behind")).toBeTruthy();
    expect(within(behindSchedule).getByText("Foundation contractor")).toBeTruthy();
    expect(within(behindSchedule).getByText("Budget")).toBeTruthy();
    expect(
      within(behindSchedule).getAllByText("$225,000").length,
    ).toBeGreaterThan(0);
    expect(within(behindSchedule).getByText("2026-06-01")).toBeTruthy();
    expect(within(behindSchedule).getByText("2026-06-11")).toBeTruthy();
    expect(
      within(behindSchedule).getByRole("button", {
        name: "Review milestone completion",
      }),
    ).toBeTruthy();

    const current = screen.getByTestId("current-milestones");
    expect(within(current).getByText("Framing and roof")).toBeTruthy();
    expect(within(current).getByText("Northline Framing")).toBeTruthy();
    expect(within(current).getByText("$145,040")).toBeTruthy();
    expect(within(current).getByText("2026-06-12")).toBeTruthy();
    expect(within(current).getByText("2026-07-11")).toBeTruthy();
    expect(within(current).queryByText("Foundation")).toBeNull();

    const next = screen.getByTestId("next-upcoming-milestone");
    expect(within(next).getByText("Interior rough-ins")).toBeTruthy();
    expect(within(next).getByText("Precision Interiors")).toBeTruthy();
    expect(within(next).getByText("$92,500")).toBeTruthy();
    expect(within(next).getByText("2026-07-12")).toBeTruthy();
    expect(within(next).getByText("2026-07-31")).toBeTruthy();
    expect(within(next).queryByText("Framing and roof")).toBeNull();
  });

  test("keeps empty schedule lanes visible when the Build only has an upcoming milestone", () => {
    render(
      <ProductionBuildDetailSurface
        activeTab="details"
        detail={{
          ...detail,
          milestones: [
            {
              ...detail.milestones[0],
              dayEnd: 20,
              dayStart: 10,
              status: "planned",
            },
          ],
        }}
        onChangeRail={vi.fn()}
        onChangeTab={vi.fn()}
        rail="closed"
        timelineWorkspace={{
          ...timelineWorkspace,
          plan: { ...timelineWorkspace.plan, currentDay: 1 },
        }}
      />,
    );

    expect(
      within(screen.getByTestId("behind-schedule-milestones")).getByText(
        "No milestones are behind schedule.",
      ),
    ).toBeTruthy();
    expect(
      within(screen.getByTestId("current-milestones")).getByText(
        "No milestones are currently active.",
      ),
    ).toBeTruthy();
    expect(
      within(screen.getByTestId("next-upcoming-milestone")).getByText(
        "Foundation",
      ),
    ).toBeTruthy();
  });


  test("uses canonical milestone progress and surfaces reconciliation warnings", () => {
    render(
      <ProductionBuildDetailSurface
        activeTab="details"
        detail={{
          ...detail,
          milestones: [
            Object.assign({}, detail.milestones[0], {
              normalizedProgressPercent: 37,
              progressPercent: 99,
              reconciliationIssues: [
                {
                  code: "completed_children_with_incomplete_parent",
                  message:
                    "All submilestones are complete, but the milestone is not complete.",
                  severity: "warning" as const,
                },
              ],
              reconciliationState: "warning" as const,
            }),
          ],
        }}
        onChangeRail={vi.fn()}
        onChangeTab={vi.fn()}
        rail="closed"
      />,
    );

    const milestone = screen.getByTestId("current-milestone-foundation");
    expect(within(milestone).getAllByText("37%").length).toBeGreaterThan(0);
    expect(within(milestone).queryByText("99%")).toBeNull();
    expect(
      screen.getByTestId("milestone-reconciliation-foundation").textContent,
    ).toContain("All submilestones are complete");
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

    expect(
      screen.getByTestId("current-active-draw-requests").textContent,
    ).toContain("Requested foundation holdback");
    expect(
      screen.queryByTestId("current-active-draw-requests-empty"),
    ).toBeNull();
    expect(
      within(screen.getByTestId("current-active-draw-requests")).queryByText(
        "Released permit reimbursement",
      ),
    ).toBeNull();
    expect(
      within(screen.getByTestId("current-active-draw-requests")).queryByText(
        "Upcoming foundation reimbursement",
      ),
    ).toBeNull();

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

  test("restores a collaboration-linked draw in the Draws overview", async () => {
    render(
      <ProductionBuildDetailSurface
        activeTab="details"
        detail={detail}
        focusedReference="draw:draw-01"
        onChangeRail={vi.fn()}
        onChangeTab={vi.fn()}
        rail="closed"
      />,
    );

    await waitFor(() =>
      expect(
        screen
          .getByTestId("build-overview-tab-draws")
          .getAttribute("aria-selected"),
      ).toBe("true"),
    );
    const focusedDraw = screen.getByTestId("draw-overview-draw-draw-01");
    await waitFor(() => expect(document.activeElement).toBe(focusedDraw));
    expect(screen.getByTestId("draw-overview-scheduled-draws")).toBeTruthy();
  });

  test("runs lender draw actions from the current overview active draw requests", async () => {
    const approveDraw = vi.fn().mockResolvedValue(null);
    const releaseDraw = vi.fn().mockResolvedValue(null);

    render(
      <ProductionBuildDetailSurface
        actions={{ approveDraw, releaseDraw }}
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
              status: "ready_for_admin",
            },
            {
              ...detail.draws[0],
              _id: "draw-approved",
              amountCents: 64_000_00,
              drawKey: "draw-approved",
              label: "Approved framing reimbursement",
              order: 2,
              reviewedAt: "2026-06-25T12:00:00.000Z",
              status: "approved_for_release",
            },
          ],
        }}
        onChangeRail={vi.fn()}
        onChangeTab={vi.fn()}
        rail="closed"
        viewerRole="lender"
      />,
    );

    const activeRequests = screen.getByTestId("current-active-draw-requests");
    expect(activeRequests.textContent).toContain(
      "Requested foundation reimbursement",
    );
    expect(activeRequests.textContent).toContain(
      "Approved framing reimbursement",
    );

    fireEvent.click(screen.getByTestId("current-draw-approve-draw-requested"));
    await waitFor(() => expect(approveDraw).toHaveBeenCalledTimes(1));
    expect(approveDraw.mock.calls[0]?.[0]).toMatchObject({
      drawKey: "draw-requested",
    });

    fireEvent.click(screen.getByTestId("current-draw-release-draw-approved"));
    await waitFor(() => expect(releaseDraw).toHaveBeenCalledTimes(1));
    expect(releaseDraw.mock.calls[0]?.[0]).toMatchObject({
      drawKey: "draw-approved",
    });
  });

  test("shows lender approval controls instead of request controls in draw overview", async () => {
    const releaseDraw = vi.fn().mockResolvedValue(null);
    const startDrawReview = vi.fn().mockResolvedValue(null);

    render(
      <ProductionBuildDetailSurface
        actions={{ releaseDraw, startDrawReview }}
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
              status: "approved_for_release",
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

    fireEvent.click(
      within(screen.getByTestId("draw-overview-approval-queue")).getByTestId(
        "draw-overview-start-draw-requested",
      ),
    );
    await waitFor(() => expect(startDrawReview).toHaveBeenCalledTimes(1));
    expect(startDrawReview.mock.calls[0]?.[0]).toMatchObject({
      drawKey: "draw-requested",
    });

    fireEvent.click(screen.getByTestId("draw-overview-release-draw-approved"));
    await waitFor(() => expect(releaseDraw).toHaveBeenCalledTimes(1));
    expect(releaseDraw.mock.calls[0]?.[0]).toMatchObject({
      drawKey: "draw-approved",
    });

    expect(screen.queryByTestId("build-detail-draw-request-draw-requested")).toBeNull();
  });

  test("runs the B4 lender funding review workflow against production draw actions", async () => {
    const releaseDraw = vi.fn().mockResolvedValue(null);
    const startDrawReview = vi.fn().mockResolvedValue(null);
    const requestedDraw = {
      ...detail.draws[0],
      _id: "draw-requested-b4",
      amountCents: 88_000_00,
      drawKey: "draw-requested-b4",
      label: "Requested foundation reimbursement",
      requestedAt: "2026-07-14T12:00:00.000Z",
      status: "requested" as const,
    };
    const approvedDraw = {
      ...detail.draws[0],
      _id: "draw-approved-b4",
      amountCents: 64_000_00,
      drawKey: "draw-approved-b4",
      label: "Approved framing reimbursement",
      order: 2,
      reviewedAt: "2026-07-15T12:00:00.000Z",
      status: "approved_for_release" as const,
    };

    render(
      <ProductionBuildDetailSurface
        actions={{ releaseDraw, startDrawReview }}
        activeTab="details"
        detail={{
          ...detail,
          draws: [requestedDraw, approvedDraw],
          evidenceAssets: [
            {
              _id: "b4-foundation-evidence",
              evidenceKey: "b4-foundation-photo",
              fileName: "foundation-completion.jpg",
              label: "Foundation completion photo",
              locationVerified: true,
              milestoneKey: "foundation",
              mimeType: "image/jpeg",
              previewUrl: "https://example.com/foundation-completion.jpg",
              sizeBytes: 238_000,
              source: "active_build_timeline_upload",
              tag: "Foundation",
            },
          ],
          milestones: [
            {
              ...detail.milestones[0],
              completionClaim: {
                note: "Foundation work is complete and ready for review.",
                submittedAt: "2026-07-14T12:00:00.000Z",
              },
            },
          ],
          plannedDraws: [
            {
              amountCents: 106_328_82,
              drawKey: "future-framing",
              label: "Underground, framing & roof reimbursement",
              order: 1,
              timingDay: 90,
            },
          ],
        }}
        fundingWorkspaceEnabled
        onChangeRail={vi.fn()}
        onChangeTab={vi.fn()}
        rail="closed"
        viewerRole="lender"
      />
    );

    fireEvent.click(screen.getByTestId("build-overview-tab-draws"));

    expect(screen.getByTestId("build-funding-workspace")).toBeTruthy();
    expect(screen.getByTestId("lender-funding-review")).toBeTruthy();
    expect(screen.queryByTestId("production-draws-table")).toBeNull();
    expect(screen.queryByRole("button", { name: /request a draw/i })).toBeNull();

    fireEvent.click(
      screen.getByTestId("lender-review-start-draw-requested-b4")
    );
    await waitFor(() =>
      expect(startDrawReview).toHaveBeenCalledWith(requestedDraw),
    );

    fireEvent.click(
      screen.getByTestId("lender-review-release-draw-approved-b4")
    );
    fireEvent.click(
      await screen.findByRole("button", { name: "Confirm release" })
    );
    await waitFor(() => expect(releaseDraw).toHaveBeenCalledWith(approvedDraw));

    fireEvent.click(
      within(screen.getByTestId("lender-funding-review")).getByRole("button", {
        name: "Review Foundation milestone",
      })
    );
    const milestoneSummary = within(
      screen.getByTestId("milestone-completion-review-summary")
    );
    expect(milestoneSummary.getByText("$225,000.00")).toBeTruthy();
    expect(milestoneSummary.getByText("2026-07-14")).toBeTruthy();
    expect(
      screen.getByText("Foundation completion photo")
    ).toBeTruthy();
    expect(
      screen.getByText("No site visit has been ordered for this milestone.")
    ).toBeTruthy();
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

    fireEvent.click(screen.getByTestId("build-overview-tab-draws"));
    expect(screen.queryByTestId("build-detail-draw-request-draw-01")).toBeNull();
    expect(screen.getAllByText("Planned").length).toBeGreaterThan(0);
  });

  test("opens the milestone completion review sheet from the milestone kanban", async () => {
    const approveMilestone = vi.fn().mockResolvedValue(null);
    render(
      <ProductionBuildDetailSurface
        actions={{ approveMilestone }}
        activeTab="milestones"
        detail={detail}
        onChangeRail={vi.fn()}
        onChangeTab={vi.fn()}
        rail="closed"
      />,
    );

    fireEvent.click(screen.getByTestId("kanban-card-foundation"));
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

  test("requires an override rationale for incomplete or location-unverified completion approval", async () => {
    const approveMilestone = vi.fn().mockResolvedValue(null);
    render(
      <ProductionBuildDetailSurface
        actions={{ approveMilestone }}
        activeTab="milestones"
        detail={{
          ...detail,
          evidenceAssets: [
            {
              _id: "evidence-unverified-01",
              evidenceKey: "foundation-unverified",
              fileName: "foundation-unverified.jpg",
              label: "Foundation unverified photo",
              locationVerified: false,
              milestoneKey: "foundation",
              mimeType: "image/jpeg",
              sizeBytes: 128_000,
              source: "active_build_timeline_upload",
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
          submilestones: [
            {
              ...detail.submilestones[0],
              status: "in_progress",
            },
          ],
        }}
        onChangeRail={vi.fn()}
        onChangeTab={vi.fn()}
        rail="closed"
      />,
    );

    fireEvent.click(screen.getByTestId("kanban-card-foundation"));

    const approve = screen.getByRole("button", {
      name: /Approve completion/i,
    });
    expect(approve.hasAttribute("disabled")).toBe(true);
    const exceptions = screen.getByTestId("milestone-review-exceptions");
    expect(exceptions.textContent).toContain("0/1 scope items");
    expect(exceptions.textContent).toContain("location is unverified");

    fireEvent.change(screen.getByLabelText(/Decision rationale/i), {
      target: {
        value: "Admin override after reviewing the unverified field evidence.",
      },
    });
    expect(approve.hasAttribute("disabled")).toBe(false);
    fireEvent.click(approve);

    await waitFor(() =>
      expect(approveMilestone).toHaveBeenCalledWith({
        milestoneKey: "foundation",
        note: "Admin override after reviewing the unverified field evidence.",
      }),
    );
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(screen.getByRole("status").textContent).toContain(
      "Milestone completion approved",
    );
    fireEvent.click(
      screen
        .getAllByRole("button", { name: "Close" })
        .find((button) => button.textContent === "Close") as HTMLButtonElement,
    );
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  test("shows accepted builder evidence as complete instead of offering duplicate approval", () => {
    render(
      <ProductionBuildDetailSurface
        actions={{ reviewEvidence: vi.fn() }}
        activeTab="details"
        detail={{
          ...detail,
          evidenceAssets: [
            {
              _id: "evidence-accepted-01",
              evidenceKey: "foundation-accepted",
              fileName: "foundation-accepted.jpg",
              label: "Foundation accepted photo",
              locationVerified: true,
              milestoneKey: "foundation",
              mimeType: "image/jpeg",
              sizeBytes: 128_000,
              source: "active_build_timeline_upload",
            },
          ],
          milestones: [
            {
              ...detail.milestones[0],
              completionClaim: {
                completedDay: 30,
                submittedAt: "2026-06-24T12:00:00.000Z",
              },
              completionReview: {
                evidenceReview: {
                  accepted: true,
                  reviewedAt: "2026-06-25T12:00:00.000Z",
                },
                status: "pending",
              },
            },
          ],
        }}
        onChangeRail={vi.fn()}
        onChangeTab={vi.fn()}
        rail="closed"
      />,
    );

    fireEvent.click(screen.getByTestId("current-milestone-review-foundation"));

    expect(screen.getByText("Evidence approved")).toBeTruthy();
    expect(
      screen.queryByRole("button", { name: /Approve evidence/i }),
    ).toBeNull();
    fireEvent.click(
      screen
        .getAllByRole("button", { name: "Close" })
        .find((button) => button.textContent === "Close") as HTMLButtonElement,
    );
  });

  test("consolidates milestone scope, people, materials, evidence, and field review context for lenders", () => {
    render(
      <ProductionBuildDetailSurface
        activeTab="milestones"
        detail={{
          ...detail,
          costItems: [
            {
              _id: "cost-item-review-01",
              costCents: 8_000_00,
              description: "Concrete and rebar package.",
              itemType: "material",
              milestoneKey: "foundation",
              quantity: 1,
              relevantSubmilestoneKeys: ["excavation"],
              supplier: "Apex Supply",
              title: "Foundation material package",
            },
          ],
          evidenceAssets: [
            {
              _id: "evidence-review-01",
              evidenceKey: "foundation-review-photo",
              fileName: "foundation-review.jpg",
              label: "Foundation completion photo",
              locationVerified: true,
              milestoneKey: "foundation",
              mimeType: "image/jpeg",
              sizeBytes: 128_000,
              source: "active_build_timeline_upload",
              submilestoneKey: "excavation",
              tag: "Foundation",
            },
          ],
          milestones: [
            {
              ...detail.milestones[0],
              completionClaim: {
                completedDay: 30,
                note: "Foundation work is ready for review.",
                submittedAt: "2026-06-24T12:00:00.000Z",
              },
              progressPercent: 100,
            },
          ],
        }}
        onChangeRail={vi.fn()}
        onChangeTab={vi.fn()}
        rail="closed"
        viewerRole="lender"
      />,
    );

    fireEvent.click(screen.getByTestId("kanban-card-foundation"));

    const scope = screen.getByTestId("milestone-review-scope");
    expect(within(scope).getByText("Excavation")).toBeTruthy();
    expect(within(scope).getByText("Complete")).toBeTruthy();

    const people = screen.getByTestId("milestone-review-contractors");
    expect(within(people).getByText("Site Lead Builders")).toBeTruthy();
    expect(within(people).getByText("Foundation contractor")).toBeTruthy();

    const materials = screen.getByTestId("milestone-review-materials");
    expect(within(materials).getByText("Foundation material package")).toBeTruthy();
    expect(within(materials).getByText("Apex Supply")).toBeTruthy();
    expect(within(materials).getByText("$8,000.00")).toBeTruthy();

    expect(screen.getByText("Foundation completion photo")).toBeTruthy();
    expect(screen.getByText("No site visit has been ordered for this milestone."))
      .toBeTruthy();
    expect(screen.getByText("Reviewer decision")).toBeTruthy();
  });

  test("keeps milestone review in the canonical milestone kanban", () => {
    render(
      <ProductionBuildDetailSurface
        activeTab="milestones"
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
        timelineWorkspace={{
          ...timelineWorkspace,
          plan: { ...timelineWorkspace.plan, currentDay: 25 },
        }}
      />,
    );

    expect(screen.getByTestId("build-detail-kanban")).toBeTruthy();
    expect(screen.getByTestId("kanban-card-foundation")).toBeTruthy();
    expect(screen.getByTestId("kanban-card-framing")).toBeTruthy();
    expect(screen.queryByTestId("current-milestones")).toBeNull();
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
    expect(assignSiteVisit).not.toHaveBeenCalled();
    const orderDialog = within(
      screen.getByRole("dialog", { name: "Configure site visit" }),
    );
    fireEvent.click(
      orderDialog.getByRole("button", {
        name: "Confirm and order site visit",
      }),
    );
    await waitFor(() =>
      expect(assignSiteVisit).toHaveBeenCalledWith(
        expect.objectContaining({ milestoneKey: "foundation" }),
      ),
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

  test("preflights site visit scope and editable guidance before creating the visit", async () => {
    const assignSiteVisit = vi.fn().mockResolvedValue(null);
    const whatToVerify =
      "<ul><li>Verify excavation and footing work against the approved scope.</li></ul>";
    const cameraAngles =
      "<ul><li>Capture a wide view tying the excavation to the site.</li></ul>";

    render(
      <ProductionBuildDetailSurface
        actions={{ assignSiteVisit }}
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
              siteVisitGuidance: { cameraAngles, whatToVerify },
            } as (typeof detail.milestones)[number],
          ],
        }}
        onChangeRail={vi.fn()}
        onChangeTab={vi.fn()}
        rail="closed"
      />,
    );

    fireEvent.click(screen.getByTestId("current-milestone-review-foundation"));
    fireEvent.click(screen.getByRole("button", { name: "Order site visit" }));

    const dialog = within(
      screen.getByRole("dialog", { name: "Configure site visit" }),
    );
    expect(dialog.getByRole("heading", { name: "Configure site visit" })).toBeTruthy();
    expect(assignSiteVisit).not.toHaveBeenCalled();
    expect(dialog.getByText("Foundation")).toBeTruthy();
    expect(dialog.getByText("Excavation")).toBeTruthy();

    const verifyEditor = dialog.getByLabelText("What to verify");
    const anglesEditor = dialog.getByLabelText("Required photo angles");
    expect((verifyEditor as HTMLTextAreaElement).value).toBe(whatToVerify);
    expect((anglesEditor as HTMLTextAreaElement).value).toBe(cameraAngles);

    const editedVerify =
      "<ul><li>Confirm forms, reinforcing, and concrete dimensions.</li></ul>";
    const editedAngles =
      "<ul><li>Capture one wide view and one reinforcing close-up.</li></ul>";
    fireEvent.change(verifyEditor, { target: { value: editedVerify } });
    fireEvent.change(anglesEditor, { target: { value: editedAngles } });
    fireEvent.click(
      dialog.getByRole("button", { name: "Confirm and order site visit" }),
    );

    await waitFor(() =>
      expect(assignSiteVisit).toHaveBeenCalledWith({
        milestoneKey: "foundation",
        siteVisitGuidance: {
          cameraAngles: editedAngles,
          whatToVerify: editedVerify,
        },
        submilestoneKeys: ["excavation"],
      }),
    );
  });

  test("drafts contextual guidance with DrawFlow AI and keeps the result editable", async () => {
    const assignSiteVisit = vi.fn().mockResolvedValue(null);
    const generatedGuidance = {
      cameraAngles:
        "<ul><li>Photograph the full excavation from the street.</li></ul>",
      source: "openai" as const,
      whatToVerify:
        "<ul><li>Confirm excavation depth and footing preparation.</li></ul>",
    };
    let resolveGeneration:
      | ((value: typeof generatedGuidance) => void)
      | undefined;
    const generateSiteVisitGuidance = vi.fn(
      () =>
        new Promise<typeof generatedGuidance>((resolve) => {
          resolveGeneration = resolve;
        }),
    );

    render(
      <ProductionBuildDetailSurface
        actions={{ assignSiteVisit, generateSiteVisitGuidance }}
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
        }}
        onChangeRail={vi.fn()}
        onChangeTab={vi.fn()}
        rail="closed"
      />,
    );

    fireEvent.click(screen.getByTestId("current-milestone-review-foundation"));
    fireEvent.click(screen.getByRole("button", { name: "Order site visit" }));
    const dialog = within(
      screen.getByRole("dialog", { name: "Configure site visit" }),
    );
    const generationStatus = within(
      dialog.getByTestId("site-visit-ai-generation-status"),
    );
    expect(generationStatus.getByText("AI generation targets")).toBeTruthy();
    expect(generationStatus.getByText("Verification checklist")).toBeTruthy();
    expect(generationStatus.getByText("Required photo angles")).toBeTruthy();
    fireEvent.click(
      dialog.getByRole("button", { name: "Write with DrawFlow AI" }),
    );
    expect(dialog.getByText("Drafting field guidance")).toBeTruthy();
    expect(dialog.getByText("Generating")).toBeTruthy();

    await waitFor(() =>
      expect(generateSiteVisitGuidance).toHaveBeenCalledWith(
        expect.objectContaining({
          build: {
            location: "Toronto, ON",
            name: "Approved With Permit Site",
          },
          milestone: expect.objectContaining({
            key: "foundation",
            name: "Foundation",
          }),
          submilestones: [{ key: "excavation", name: "Excavation" }],
        }),
      ),
    );
    resolveGeneration?.(generatedGuidance);
    await waitFor(() => expect(dialog.getByText("AI draft ready")).toBeTruthy());
    expect(dialog.getByText("Draft ready")).toBeTruthy();
    const verifyEditor = dialog.getByLabelText("What to verify");
    const anglesEditor = dialog.getByLabelText("Required photo angles");
    await waitFor(() =>
      expect((verifyEditor as HTMLTextAreaElement).value).toContain(
        "Confirm excavation depth",
      ),
    );
    expect((anglesEditor as HTMLTextAreaElement).value).toContain(
      "Photograph the full excavation",
    );

    const editedAfterGeneration =
      "<ul><li>Confirm excavation depth, footing preparation, and drainage.</li></ul>";
    fireEvent.change(verifyEditor, {
      target: { value: editedAfterGeneration },
    });
    expect((verifyEditor as HTMLTextAreaElement).value).toBe(
      editedAfterGeneration,
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
    expect(screen.queryByTestId("site-visit-token-panel")).toBeNull();
    expect(
      screen.getByText("No site visit has been ordered for this milestone."),
    ).toBeTruthy();
  });

  test("does not resurrect a cancelled site visit from a stale completion review snapshot", () => {
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
              completionReview: {
                siteVisit: {
                  milestoneKey: "foundation",
                  requestedAt: "2026-06-24T12:00:00.000Z",
                  status: "requested",
                  tokenExpiresAt: 4_102_444_800_000,
                  url: "/newsitevisit/active-build-01/visit-foundation-token",
                  visitId: "visit-foundation-token",
                },
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
              status: "cancelled",
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

    expect(screen.queryByTestId("site-visit-token-panel")).toBeNull();
    expect(
      screen.getByText("No site visit has been ordered for this milestone."),
    ).toBeTruthy();
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
        activeTab="documents"
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

  test("focuses and highlights a collaboration-linked document", async () => {
    const scrollIntoView = vi.fn();
    Object.defineProperty(Element.prototype, "scrollIntoView", {
      configurable: true,
      value: scrollIntoView,
    });
    render(
      <ProductionBuildDetailSurface
        activeTab="documents"
        detail={detail}
        focusedReference="document:document-01"
        onChangeRail={vi.fn()}
        onChangeTab={vi.fn()}
        rail="closed"
      />,
    );

    const documentRow = screen.getByTestId(
      "build-detail-document-document-01",
    );
    await waitFor(() => expect(document.activeElement).toBe(documentRow));
    expect(documentRow.dataset.collaborationFocused).toBe("true");
    expect(scrollIntoView).toHaveBeenCalledWith({
      behavior: "smooth",
      block: "center",
    });
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

    fireEvent.click(screen.getByTestId("build-overview-tab-draws"));
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


  test("submits an exact versioned Budget revision from the builder workspace", async () => {
    const requestBudgetRevision = vi.fn();
    render(
      <ProductionBuildDetailSurface
        actions={{ requestBudgetRevision }}
        activeTab="details"
        detail={{ ...detail, budgetRevisionRequests: [] }}
        onChangeRail={vi.fn()}
        onChangeTab={vi.fn()}
        rail="closed"
        viewerRole="builder"
      />,
    );

    fireEvent.click(screen.getByTestId("build-overview-tab-draws"));
    fireEvent.change(screen.getByTestId("budget-working-capital"), {
      target: { value: "190000" },
    });
    fireEvent.change(screen.getByTestId("budget-policy-limit"), {
      target: { value: "575000" },
    });
    expect(
      (screen.getByTestId("budget-loan-percentage") as HTMLInputElement).value
    ).toBe("80");
    expect(screen.getByText("Loan Percentage (%)")).toBeTruthy();
    fireEvent.change(screen.getByTestId("budget-loan-percentage"), {
      target: { value: "75" },
    });
    fireEvent.change(screen.getByLabelText("Budget revision reason"), {
      target: { value: "Subcontractor buyout changed the governing assumptions." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Request revision" }));

    await waitFor(() =>
      expect(requestBudgetRevision).toHaveBeenCalledWith({
        borrowerCoPayBps: 2_500,
        borrowerStartingCashCents: 19_000_000,
        lenderDrawPolicyLimitCents: 57_500_000,
        reason: "Subcontractor buyout changed the governing assumptions.",
      }),
    );
  });

  test("requires and records a lender admin Budget revision decision note", async () => {
    const reviewBudgetRevision = vi.fn();
    const budgetRequest = {
      _id: "budget-revision-01",
      baseVersion: 1,
      createdAt: Date.now(),
      priorState: {
        borrowerCoPayBps: 2_000,
        borrowerStartingCashCents: 18_000_000,
        lenderDrawPolicyLimitCents: 55_000_000,
        version: 1,
      },
      reason: "Subcontractor buyout changed the governing assumptions.",
      requestedByWorkosUserId: "user_builder",
      requestedPayload: {
        borrowerCoPayBps: 2_500,
        borrowerStartingCashCents: 19_000_000,
        lenderDrawPolicyLimitCents: 57_500_000,
      },
      status: "requested" as const,
      varianceCents: 2_500_000,
    };
    render(
      <ProductionBuildDetailSurface
        actions={{ reviewBudgetRevision }}
        activeTab="details"
        detail={{ ...detail, budgetRevisionRequests: [budgetRequest] }}
        onChangeRail={vi.fn()}
        onChangeTab={vi.fn()}
        rail="closed"
        viewerRole="lender"
      />,
    );

    fireEvent.click(screen.getByTestId("build-overview-tab-draws"));
    const approve = screen.getByRole("button", { name: "Approve revision" });
    expect(approve.hasAttribute("disabled")).toBe(true);
    fireEvent.change(screen.getByLabelText("Budget revision decision note"), {
      target: { value: "Approved after variance and draw-policy review." },
    });
    fireEvent.click(approve);
    await waitFor(() =>
      expect(reviewBudgetRevision).toHaveBeenCalledWith({
        note: "Approved after variance and draw-policy review.",
        requestId: "budget-revision-01",
        status: "approved",
      }),
    );
  });

  test("preserves milestone sheet routing state for production builds", () => {
    const onChangeMilestone = vi.fn();

    render(
      <ProductionBuildDetailSurface
        activeTab="milestones"
        detail={detail}
        milestoneKey="foundation"
        onChangeMilestone={onChangeMilestone}
        onChangeRail={vi.fn()}
        onChangeTab={vi.fn()}
        rail="closed"
      />,
    );

    expect(
      screen.getByRole("heading", { name: "Review milestone completion" })
    ).toBeTruthy();
    expect(screen.getByText("Builder submitted evidence")).toBeTruthy();
    expect(screen.getByText("Site visit")).toBeTruthy();

    fireEvent.click(
      screen
        .getAllByRole("button", { name: "Close" })
        .find((button) => button.textContent === "Close") as HTMLButtonElement
    );
    expect(onChangeMilestone).toHaveBeenCalledWith(undefined);
  });

  test("keeps legacy HEIC conversion off the milestone review critical path", async () => {
    vi.stubEnv(
      "VITE_CONVEX_SITE_URL",
      "https://fortunate-cassowary-439.convex.site",
    );
    let rejectPreviewFetch: ((reason: unknown) => void) | undefined;
    const fetchPreview = vi.fn(
      () =>
        new Promise<Response>((_resolve, reject) => {
          rejectPreviewFetch = reject;
        }),
    );
    vi.stubGlobal("fetch", fetchPreview);
    const sourceUrl =
      "https://fortunate-cassowary-439.convex.cloud/api/storage/legacy-heic";

    render(
      <ProductionBuildDetailSurface
        activeTab="details"
        detail={{
          ...detail,
          evidenceAssets: [
            {
              _id: "legacy-heic-evidence",
              evidenceKey: "legacy-heic-evidence",
              fileName: "IMG_4748.heic",
              label: "Evidence image 1",
              locationVerified: false,
              milestoneKey: "foundation",
              mimeType: "image/heic",
              previewUrl: sourceUrl,
              sizeBytes: 835_196,
              source: "active_build_timeline_upload",
              tag: "Permits, demo & foundation",
            },
          ],
          milestones: [
            {
              ...detail.milestones[0],
              completionClaim: {
                note: "Completion ready for lender review.",
                submittedAt: "2026-07-14T12:00:00.000Z",
              },
            },
          ],
        }}
        milestoneKey="foundation"
        onChangeRail={vi.fn()}
        onChangeTab={vi.fn()}
        rail="closed"
        viewerRole="lender"
      />,
    );

    expect(screen.queryByRole("img", { name: "Evidence image 1" })).toBeNull();
    expect(screen.getByText("Preparing HEIC preview…")).toBeTruthy();
    expect(fetchPreview).toHaveBeenCalledWith(
      `https://fortunate-cassowary-439.convex.site/evidence-image-source?url=${encodeURIComponent(sourceUrl)}`,
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );

    rejectPreviewFetch?.(new TypeError("Cross-origin preview unavailable."));

    await waitFor(() =>
      expect(
        screen
          .getByRole("img", { name: "Evidence image 1" })
          .getAttribute("src"),
      ).toBe(
        `https://fortunate-cassowary-439.convex.site/evidence-image-preview?url=${encodeURIComponent(sourceUrl)}`,
      ),
    );
  });

  test("shows the concrete requested change in the milestone detail sheet", () => {
    render(
      <ProductionBuildDetailSurface
        activeTab="details"
        detail={{
          ...detail,
          milestones: [
            {
              ...detail.milestones[0],
              completionReview: {
                note: "Upload the signed foundation inspection report.",
                reviewedAt: "2026-07-15T12:00:00.000Z",
                status: "revisionRequested",
              },
            },
          ],
        }}
        milestoneKey="foundation"
        onChangeRail={vi.fn()}
        onChangeTab={vi.fn()}
        rail="closed"
        viewerRole="builder"
      />
    );

    const sheet = within(
      screen.getByTestId("milestone-detail-sheet-panel")
    );
    expect(
      sheet.getByRole("heading", { name: "Requested changes" })
    ).toBeTruthy();
    expect(
      sheet.getByText("Upload the signed foundation inspection report.")
    ).toBeTruthy();
    expect(sheet.getByText("Requested 2026-07-15")).toBeTruthy();
  });

  test("does not invent requested changes for a legacy status without a note", () => {
    render(
      <ProductionBuildDetailSurface
        activeTab="details"
        detail={{
          ...detail,
          milestones: [
            {
              ...detail.milestones[0],
              completionReview: {
                reviewedAt: "2026-07-15T12:00:00.000Z",
                status: "revisionRequested",
              },
            },
          ],
        }}
        milestoneKey="foundation"
        onChangeRail={vi.fn()}
        onChangeTab={vi.fn()}
        rail="closed"
        viewerRole="builder"
      />
    );

    expect(
      within(screen.getByTestId("milestone-detail-sheet-panel")).queryByRole(
        "heading",
        { name: "Requested changes" }
      )
    ).toBeNull();
  });

  test("does not expose lender milestone decisions in the builder workspace", () => {
    render(
      <ProductionBuildDetailSurface
        actions={{ approveMilestone: vi.fn() }}
        activeTab="details"
        detail={detail}
        milestoneKey="foundation"
        onChangeRail={vi.fn()}
        onChangeTab={vi.fn()}
        rail="closed"
        viewerRole="builder"
      />,
    );

    expect(screen.getByTestId("milestone-detail-sheet")).toBeTruthy();
    expect(
      screen.queryByTestId("milestone-detail-sheet-approve"),
    ).toBeNull();
    expect(
      screen.queryByTestId("milestone-detail-sheet-request-info"),
    ).toBeNull();
    expect(
      screen.queryByTestId("milestone-detail-sheet-assign-visit"),
    ).toBeNull();
    expect(
      screen.queryByTestId("milestone-detail-sheet-reject"),
    ).toBeNull();
  });

  test("writes clicked milestone cards back to the production route search state", () => {
    const onChangeMilestone = vi.fn();

    render(
      <ProductionBuildDetailSurface
        activeTab="milestones"
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
        activeTab="milestones"
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

  test("routes existing-contractor invites through the atomic active-build action", async () => {
    const attachAndInviteContractor = vi.fn().mockResolvedValue(undefined);
    const attachContractor = vi.fn().mockResolvedValue(undefined);
    const availableContractor = detail.availableContractors?.[0];
    if (!availableContractor) {
      throw new Error("Expected the available contractor fixture.");
    }
    render(
      <ProductionBuildDetailSurface
        actions={{ attachAndInviteContractor, attachContractor }}
        activeTab="contractors"
        detail={{
          ...detail,
          availableContractors: [
            {
              ...availableContractor,
              email: "available@example.com",
              onboardingStatus: "profile_only",
            },
          ],
        }}
        onChangeRail={vi.fn()}
        onChangeTab={vi.fn()}
        rail="closed"
      />,
    );

    fireEvent.click(screen.getByTestId("contractors-open-add"));
    fireEvent.click(screen.getByRole("button", { name: /Available Concrete/i }));
    fireEvent.click(
      screen.getByRole("button", { name: "Invite Available Concrete" }),
    );

    await waitFor(() =>
      expect(attachAndInviteContractor).toHaveBeenCalledWith({
        contractorId: "contractor-available-01",
        role: "Foundation",
      }),
    );
  });

  test("links attached contractors to the provided detail route", () => {
    render(
      <ProductionBuildDetailSurface
        activeTab="contractors"
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

  test("assigns attached build contractors to milestones through the shared planning panel", async () => {
    const assignContractorToMilestone = vi.fn().mockResolvedValue(undefined);

    render(
      <ProductionBuildDetailSurface
        actions={{ assignContractorToMilestone }}
        activeTab="contractors"
        detail={detail}
        onChangeRail={vi.fn()}
        onChangeTab={vi.fn()}
        rail="closed"
      />,
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Select Site Lead Builders" }),
    );
    fireEvent.click(
      screen.getByTestId("proposal-milestone-assign-contractor-foundation"),
    );
    await screen.findByTestId("assign-contractor-dialog");
    fireEvent.change(screen.getByLabelText("Role"), {
      target: { value: "Masonry lead" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Confirm assignment" }),
    );

    await waitFor(() =>
      expect(assignContractorToMilestone).toHaveBeenCalledWith({
        assignmentCost: {
          estimatedCostCents: undefined,
          estimatedHours: undefined,
        },
        contractorId: "contractor-01",
        milestoneKey: "foundation",
        role: "Masonry lead",
        submilestoneKeys: ["excavation"],
      }),
    );
  });

  test("derives scheduled ready milestones out of backlog without marking work started", () => {
    render(
      <ProductionBuildDetailSurface
        activeTab="milestones"
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
        viewerRole="builder"
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

  test("moves overdue incomplete milestones into the behind schedule review column", () => {
    render(
      <ProductionBuildDetailSurface
        activeTab="milestones"
        detail={{
          ...detail,
          milestones: [
            {
              ...detail.milestones[0],
              dayEnd: 10,
              evidenceState: "Draft package",
              progressPercent: 45,
              status: "in_progress",
            },
          ],
        }}
        onChangeRail={vi.fn()}
        onChangeTab={vi.fn()}
        rail="open"
        timelineWorkspace={{
          ...timelineWorkspace,
          plan: { ...timelineWorkspace.plan, currentDay: 18 },
        }}
        viewerRole="lender"
      />,
    );

    const behindSchedule = screen.getByTestId("kanban-col-BehindSchedule");
    expect(
      within(behindSchedule).getByTestId("kanban-card-foundation"),
    ).toBeTruthy();
    expect(
      within(behindSchedule).getAllByText("Behind schedule").length,
    ).toBeGreaterThanOrEqual(2);
    expect(
      within(screen.getByTestId("kanban-col-InProgress")).queryByTestId(
        "kanban-card-foundation",
      ),
    ).toBeNull();
    expect(screen.getByText("Milestone review board")).toBeTruthy();
  });

  test("moves builder completion claims into marked complete instead of in progress", () => {
    render(
      <ProductionBuildDetailSurface
        activeTab="milestones"
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

  test("keeps approved milestones out of field review when an old site visit request remains", () => {
    render(
      <ProductionBuildDetailSurface
        activeTab="milestones"
        detail={{
          ...detail,
          milestones: [
            {
              ...detail.milestones[0],
              completionReview: {
                siteVisit: {
                  status: "requested",
                  visitId: "site-visit-stale",
                },
                status: "approved",
              },
              status: "complete",
            },
          ],
        }}
        onChangeRail={vi.fn()}
        onChangeTab={vi.fn()}
        rail="closed"
      />,
    );

    expect(
      within(screen.getByTestId("kanban-col-SiteVisit")).queryByTestId(
        "kanban-card-foundation",
      ),
    ).toBeNull();
    expect(screen.queryByTestId("kanban-card-foundation")).toBeNull();

    fireEvent.click(screen.getByTestId("kanban-toggle-show-completed"));

    expect(
      within(screen.getByTestId("kanban-col-MarkedComplete")).getByTestId(
        "kanban-card-foundation",
      ),
    ).toBeTruthy();
  });

  test("uses reconciled scope progress instead of a stale claimed percentage", () => {
    render(
      <ProductionBuildDetailSurface
        activeTab="milestones"
        detail={{
          ...detail,
          milestones: [
            {
              ...detail.milestones[0],
              normalizedProgressPercent: 0,
              progressPercent: 100,
            },
          ],
          submilestones: [
            {
              ...detail.submilestones[0],
              status: "planned",
            },
          ],
        }}
        onChangeRail={vi.fn()}
        onChangeTab={vi.fn()}
        rail="closed"
      />,
    );

    expect(
      within(screen.getByTestId("kanban-card-foundation")).getByText("0%"),
    ).toBeTruthy();
  });

  test("keeps future planned milestones in backlog until schedule unlock", () => {
    render(
      <ProductionBuildDetailSurface
        activeTab="milestones"
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
        viewerRole="builder"
      />,
    );

    const backlog = screen.getByTestId("kanban-col-Backlog");
    expect(within(backlog).getByTestId("kanban-card-foundation")).toBeTruthy();
    expect(within(backlog).getByText("Planned")).toBeTruthy();
  });

  test("exposes explicit start-work action for scheduled ready milestones", async () => {
    const startMilestoneWork = vi.fn().mockResolvedValue(undefined);

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
        viewerRole="builder"
      />,
    );

    fireEvent.click(screen.getByTestId("milestone-detail-sheet-start-work"));
    expect(screen.getByTestId("milestone-start-dialog")).toBeTruthy();
    fireEvent.click(
      screen.getByRole("button", { name: "Record start" })
    );
    await waitFor(() =>
      expect(startMilestoneWork).toHaveBeenCalledWith(
        expect.objectContaining({
          actualStartedAt: expect.any(Number),
          idempotencyKey: expect.any(String),
          milestoneKey: "foundation",
          source: "milestone_detail",
        })
      )
    );
  });

  test("routes milestone-card starts through the shared confirmation controller", () => {
    render(
      <ProductionBuildDetailSurface
        actions={{ startMilestoneWork: vi.fn() }}
        activeTab="milestones"
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
        viewerRole="builder"
      />
    );

    fireEvent.click(
      screen.getByTestId("kanban-card-start-work-foundation")
    );
    expect(screen.getByText("Milestone card")).toBeTruthy();
    expect(screen.getByTestId("milestone-start-dialog")).toBeTruthy();
  });

  test("confirms and atomically submits completion catch-up when actual start is missing", async () => {
    const submitMilestoneCompletion = vi.fn().mockResolvedValue(undefined);
    render(
      <ProductionBuildDetailSurface
        actions={{ submitMilestoneCompletion }}
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
        viewerRole="builder"
      />
    );

    fireEvent.click(screen.getByTestId("milestone-primary-completion-action"));
    expect(screen.getByText("Completion confirmation")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Record start" }));

    await waitFor(() =>
      expect(submitMilestoneCompletion).toHaveBeenCalledWith(
        expect.objectContaining({
          actualStartedAt: expect.any(Number),
          idempotencyKey: expect.any(String),
          milestoneKey: "foundation",
        })
      )
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
        viewerRole="builder"
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
        activeTab="milestones"
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

  test("renders the approved production Details composition without duplicated tab content", () => {
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
    expect(screen.getByTestId("production-build-details-card")).toBeTruthy();
    expect(screen.getByTestId("build-collaboration-unavailable")).toBeTruthy();
    expect(screen.queryByTestId("build-detail-draws")).toBeNull();
    expect(screen.queryByTestId("build-detail-kanban")).toBeNull();
    expect(screen.queryByTestId("build-detail-contractors")).toBeNull();
    expect(screen.queryByTestId("build-detail-documents")).toBeNull();
    expect(screen.queryByTestId("internal-notes")).toBeNull();
    expect(screen.queryByTestId("public-notes")).toBeNull();
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

  test("routes timeline site visit orders through the shared preflight", () => {
    const assignSiteVisit = vi.fn().mockResolvedValue(null);
    render(
      <ProductionBuildDetailSurface
        actions={{ assignSiteVisit }}
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

    fireEvent.click(
      screen.getByRole("button", { name: "Timeline order site visit" }),
    );
    expect(
      screen.getByRole("dialog", { name: "Configure site visit" }),
    ).toBeTruthy();
    expect(assignSiteVisit).not.toHaveBeenCalled();
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

  test("routes Gantt site visit orders through the shared preflight", () => {
    const assignSiteVisit = vi.fn().mockResolvedValue(null);
    render(
      <ProductionBuildDetailSurface
        actions={{ assignSiteVisit }}
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

    fireEvent.click(
      screen.getByRole("button", { name: "Gantt order site visit" }),
    );
    expect(
      screen.getByRole("dialog", { name: "Configure site visit" }),
    ).toBeTruthy();
    expect(assignSiteVisit).not.toHaveBeenCalled();
  });

  test("routes Gantt starts through the shared confirmation controller", () => {
    render(
      <ProductionBuildDetailSurface
        actions={{ startMilestoneWork: vi.fn() }}
        activeBuildId="active-build-01"
        activeTab="gantt"
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
        }}
        onChangeRail={vi.fn()}
        onChangeTab={vi.fn()}
        timelineWorkspace={timelineWorkspace}
        viewerRole="builder"
        workosOrganizationId="org_test"
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Gantt start work" }));
    expect(screen.getByText("Gantt roadmap")).toBeTruthy();
    expect(screen.getByTestId("milestone-start-dialog")).toBeTruthy();
  });

  test("passes builder viewer role into the production-backed Gantt workspace", () => {
    render(
      <ProductionBuildDetailSurface
        activeBuildId="active-build-01"
        activeTab="gantt"
        detail={detail}
        onChangeRail={vi.fn()}
        onChangeTab={vi.fn()}
        rail="closed"
        timelineWorkspace={timelineWorkspace}
        viewerRole="builder"
        workosOrganizationId="org_test"
      />,
    );

    expect(
      screen
        .getByTestId("mock-active-build-gantt")
        .getAttribute("data-viewer-role"),
    ).toBe("builder");
  });
});
