// @vitest-environment jsdom

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { toast } from "sonner";
import { afterEach, describe, expect, test, vi } from "vitest";

import type { TimelineItem } from "#/components/roadmap/AnimatedCurvedTimeline.tsx";
import {
  buildCashUseSummary,
  formatTimelineDay,
  toDemoTimelinePlanStateMutationInput,
  TimelineWorkspace,
  type TimelineWorkspaceProps,
} from "./index.tsx";
import type {
  DemoCapitalSpike,
  DemoDraw,
  DemoMilestone,
  TimelineShareState,
} from "./-timeline-share-snapshot.ts";

const mediaQueryMockState = vi.hoisted(() => ({ isMobile: false }));
const timelineSearchMockState = vi.hoisted(() => ({
  setTimelineSearch: vi.fn(),
  share: null as string | null,
}));

vi.mock("convex/react", () => ({
  useMutation: () => vi.fn(),
  useQuery: () => undefined,
}));

vi.mock("nuqs", () => ({
  parseAsString: {},
  useQueryStates: () => [
    { share: timelineSearchMockState.share },
    timelineSearchMockState.setTimelineSearch,
  ],
}));

vi.mock("#/hooks/use-media-query.ts", () => ({
  useMediaQuery: () => mediaQueryMockState.isMobile,
}));

vi.mock("sonner", () => ({
  toast: {
    error: vi.fn(),
    info: vi.fn(),
    success: vi.fn(),
  },
}));

vi.mock("#/components/roadmap/AnimatedCurvedTimeline.tsx", () => ({
  AnimatedCurvedTimeline: ({ insertion, markers = [], renderMarker }: any) => (
    <div data-testid="mock-animated-timeline">
      {insertion?.actions?.map(
        (action: {
          id: string;
          label: string;
          onSelect?: (input: { requestedX: number }) => void;
        }) => (
          <button
            key={action.id}
            onClick={() => action.onSelect?.({ requestedX: 10 })}
            type="button"
          >
            {action.label}
          </button>
        ),
      )}
      {insertion?.label ? <span>{insertion.label}</span> : null}
      {markers.map((marker: any) => (
        <div data-testid={`mock-marker-${marker.id}`} key={marker.id}>
          {renderMarker?.(marker, {
            marker,
            range: { max: 60, min: 0, unit: "days" },
            x: marker.x,
          })}
        </div>
      ))}
    </div>
  ),
}));

vi.mock("./-TimelineCashflowCompoundChart.tsx", () => ({
  TimelineCashflowCompoundChart: ({
    hideTooltip = false,
    referenceLines = [],
  }: {
    hideTooltip?: boolean;
    referenceLines?: unknown[];
  }) => (
    <div
      data-hide-tooltip={String(hideTooltip)}
      data-reference-line-count={referenceLines.length}
      data-testid="mock-cashflow"
    />
  ),
}));

vi.mock("./-TimelineDrawAvailabilityChart.tsx", () => ({
  TimelineDrawAvailabilityChart: () => <div data-testid="mock-draw-chart" />,
}));

function expectHtmlInput(element: Element | undefined): HTMLInputElement {
  expect(element).toBeInstanceOf(HTMLInputElement);

  return element as HTMLInputElement;
}

function expectElementBefore(first: Element, second: Element) {
  expect(
    Boolean(
      first.compareDocumentPosition(second) &
        Node.DOCUMENT_POSITION_FOLLOWING
    )
  ).toBe(true);
}

afterEach(() => {
  mediaQueryMockState.isMobile = false;
  timelineSearchMockState.share = null;
  timelineSearchMockState.setTimelineSearch.mockReset();
  vi.mocked(toast.error).mockReset();
  vi.mocked(toast.info).mockReset();
  vi.mocked(toast.success).mockReset();
  window.history.pushState(null, "", "/");
  cleanup();
});

const milestoneData: DemoMilestone = {
  amount: 120_000,
  draw: "Draw 01",
  durationDays: 14,
  evidence: "Planning",
  icon: "foundation",
  name: "Foundation",
  policy: "Within policy",
  status: "ready",
  subMilestones: ["Excavation", "Footings"],
};

const milestone: TimelineItem<DemoMilestone> = {
  data: milestoneData,
  id: "foundation",
  label: "Foundation",
  markerLabel: "01",
  x: 0,
};

const draw: DemoDraw = {
  amount: 96_000,
  id: "draw-01",
  itemId: "foundation",
  label: "Draw 01",
  x: 22,
};

test("cash use summary separates lender draws from builder cash exposure", () => {
  const costSpike: DemoCapitalSpike = {
    amount: 15_000,
    eventKind: "cost",
    id: "cost-spike",
    label: "Unplanned utility cost",
    x: 8,
  };
  const cashInfusion: DemoCapitalSpike = {
    amount: 50_000,
    eventKind: "cashInfusion",
    id: "cash-infusion",
    label: "Builder cash infusion",
    x: 9,
  };

  expect(
    buildCashUseSummary([milestone], [draw], [costSpike, cashInfusion]),
  ).toEqual({
    builderCashUsed: 39_000,
    lenderCashUsed: 96_000,
    totalPlannedSpend: 135_000,
  });
});

test("cash use summary uses actual milestone spend when completion cost is filed", () => {
  expect(
    buildCashUseSummary(
      [
        {
          ...milestone,
          data: {
            ...milestoneData,
            completionClaim: {
              actualCost: 90_000,
              completedDay: 14,
              submittedAt: "2026-06-02T00:00:00.000Z",
            },
            status: "complete",
          } satisfies DemoMilestone,
        },
      ],
      [draw],
      [],
    ),
  ).toEqual({
    builderCashUsed: 0,
    lenderCashUsed: 96_000,
    totalPlannedSpend: 90_000,
  });
});

test("formats proposal days relative to T0", () => {
  expect(formatTimelineDay(-30)).toBe("T−30");
  expect(formatTimelineDay(0)).toBe("T0");
  expect(formatTimelineDay(12)).toBe("T+12");
});

test("clusters cash risk and hover-probe metrics before static plan totals", () => {
  renderWorkspace({
    status: "draft",
    workspaceMode: "proposal",
  });

  const orderedMetricIds = [
    "timeline-cashflow-risk-summary",
    "timeline-cashflow-probe-day",
    "timeline-cashflow-probe-cash",
    "timeline-cashflow-probe-interest-paid",
    "timeline-cashflow-ending-cash",
    "timeline-cashflow-lender-cash-used",
    "timeline-cashflow-builder-cash-used",
    "timeline-cashflow-total-interest-paid",
  ];
  const orderedMetrics = orderedMetricIds.map((id) => screen.getByTestId(id));

  for (const [index, metric] of orderedMetrics.entries()) {
    const nextMetric = orderedMetrics[index + 1];
    if (nextMetric) {
      expectElementBefore(metric, nextMetric);
    }
  }
});

function timelineState({
  milestoneAmount = 120_000,
  withSubmilestoneBudgets = false,
}: {
  milestoneAmount?: number;
  withSubmilestoneBudgets?: boolean;
} = {}): TimelineShareState {
  return {
    activeSelection: { itemId: "foundation", phase: "inProgress" },
    capitalSpikes: [],
    currentDay: 0,
    draws: [draw],
    items: [
      {
        ...milestone,
        data: {
          ...milestoneData,
          amount: milestoneAmount,
          ...(withSubmilestoneBudgets
            ? {
                submilestoneDetails: [
                  {
                    budgetCents: 37_000_00,
                    durationDays: 1,
                    key: "dc-ed",
                    name: "DC/ED",
                    order: 1,
                  },
                  {
                    budgetCents: 91_000_00,
                    durationDays: 2,
                    key: "permits",
                    name: "Permits",
                    order: 2,
                  },
                ],
              }
            : {}),
        } satisfies DemoMilestone,
      },
    ],
    minimumCashReserve: 0,
    progressValue: 0,
    range: { max: 60, min: 0, unit: "days" },
    selectedPanelOpen: true,
    startingCash: 400_000,
    straightLine: true,
  };
}

function renderWorkspace({
  collaboration,
  contractorPlanning,
  initialRole = "builder",
  initialState = timelineState(),
  persistence,
  shareUrlPath,
  status = "approved",
  workspaceMode,
}: {
  collaboration?: TimelineWorkspaceProps["collaboration"];
  contractorPlanning?: TimelineWorkspaceProps["contractorPlanning"];
  initialRole?: "builder" | "lender";
  initialState?: TimelineShareState;
  persistence?: TimelineWorkspaceProps["persistence"];
  shareUrlPath?: string;
  status?: string;
  workspaceMode: "live" | "proposal";
}) {
  return render(
    <TimelineWorkspace
      {...workspaceProps({
        collaboration,
        contractorPlanning,
        initialRole,
        initialState,
        persistence,
        shareUrlPath,
        status,
        workspaceMode,
      })}
    />,
  );
}

function workspaceProps({
  collaboration,
  contractorPlanning,
  initialRole = "builder",
  initialState = timelineState(),
  persistence,
  shareUrlPath,
  status = "approved",
  workspaceMode,
}: {
  collaboration?: TimelineWorkspaceProps["collaboration"];
  contractorPlanning?: TimelineWorkspaceProps["contractorPlanning"];
  initialRole?: "builder" | "lender";
  initialState?: TimelineShareState;
  persistence?: TimelineWorkspaceProps["persistence"];
  shareUrlPath?: string;
  status?: string;
  workspaceMode: "live" | "proposal";
}): TimelineWorkspaceProps {
  return {
    allowRoleSwitching: false,
    collaboration,
    contractorPlanning,
    durableMeta: {
      backofficeHref: "/backoffice/proposals/proposal_123",
      proposalHref: "/builder/proposals/proposal_123",
      proposalSlug: "proposal_123",
      status,
    },
    durablePlanId: "proposal_123",
    initialRole,
    initialState,
    persistence,
    shareUrlPath,
    timelineSettingsProjection: null,
    workspaceMode,
  };
}

test("removes production-only reserve data from demo timeline plan persistence", () => {
  expect(
    toDemoTimelinePlanStateMutationInput({
      currentDay: 12,
      minimumCashReserveCents: 5_000_000,
      progressValue: 12,
      rangeMax: 90,
      rangeMin: 0,
      routeState: {
        activeMilestoneKey: "foundation",
        selectedPanelOpen: true,
        straightLine: true,
      },
      startingCashCents: 40_000_000,
    }),
  ).toEqual({
    currentDay: 12,
    progressValue: 12,
    rangeMax: 90,
    rangeMin: 0,
    routeState: {
      activeMilestoneKey: "foundation",
      selectedPanelOpen: true,
      straightLine: true,
    },
    startingCashCents: 40_000_000,
  });
});
describe("TimelineWorkspace mode split", () => {
  test("lets operators independently hide cash warnings and hover details", () => {
    renderWorkspace({
      initialState: { ...timelineState(), startingCash: 0 },
      status: "draft",
      workspaceMode: "proposal",
    });

    const chart = screen.getByTestId("mock-cashflow");
    const warningToggle = screen.getByRole("switch", {
      name: "Cash warnings",
    });
    const hoverToggle = screen.getByRole("switch", {
      name: "Hover details",
    });

    expect(warningToggle.getAttribute("aria-checked")).toBe("true");
    expect(hoverToggle.getAttribute("aria-checked")).toBe("true");
    expect(Number(chart.getAttribute("data-reference-line-count"))).toBeGreaterThan(
      0
    );
    expect(chart.getAttribute("data-hide-tooltip")).toBe("false");

    fireEvent.click(warningToggle);
    expect(warningToggle.getAttribute("aria-checked")).toBe("false");
    expect(chart.getAttribute("data-reference-line-count")).toBe("0");

    fireEvent.click(hoverToggle);
    expect(hoverToggle.getAttribute("aria-checked")).toBe("false");
    expect(chart.getAttribute("data-hide-tooltip")).toBe("true");
  });

  test("submits a custom timeline plan without an optimizer preset", async () => {
    const submitPlan = vi.fn().mockResolvedValue(undefined);

    renderWorkspace({
      persistence: { submitPlan },
      status: "draft",
      workspaceMode: "proposal",
    });

    fireEvent.click(screen.getByTestId("timeline-submit-proposal"));
    fireEvent.click(screen.getByTestId("timeline-submit-confirm"));
    await waitFor(() => expect(submitPlan).toHaveBeenCalledTimes(1));
  });

  test("keeps approved production proposals in proposal mode without live execution controls", () => {
    renderWorkspace({ workspaceMode: "proposal" });

    expect(screen.getByText("Proposal mode")).toBeTruthy();
    expect(screen.getByText("Approved proposal")).toBeTruthy();
    expect(
      (screen.getByTestId("timeline-optimize-scenario") as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    expect(screen.getByTestId("selected-milestone-plan-summary")).toBeTruthy();
    expect(screen.queryByText("Mark milestone complete")).toBeNull();
    expect(screen.queryByText("Request site visit")).toBeNull();
    expect(screen.queryByText("Add draw")).toBeNull();
  });

  test("optimizes draft proposal draws and persists the replacement schedule", () => {
    const createDraw = vi.fn().mockResolvedValue(undefined);
    const deleteDraw = vi.fn().mockResolvedValue(undefined);
    const initialState: TimelineShareState = {
      ...timelineState({ milestoneAmount: 100 }),
      capitalSpikes: [
        {
          amount: 100,
          id: "supplier-deposit",
          label: "supplier-deposit",
          x: 25,
        },
      ],
      startingCash: 120,
    };

    renderWorkspace({
      initialState,
      persistence: { createDraw, deleteDraw },
      status: "draft",
      workspaceMode: "proposal",
    });

    const optimizeButton = screen.getByTestId(
      "timeline-optimize-scenario",
    ) as HTMLButtonElement;

    expect(optimizeButton.disabled).toBe(false);
    fireEvent.click(optimizeButton);
    expect(deleteDraw).toHaveBeenCalledWith({ drawKey: "draw-01" });
    expect(createDraw).toHaveBeenCalledWith(
      expect.objectContaining({
        amountCents: 8_000,
        customDate: true,
        label: "Draw 01",
        order: 1,
      }),
    );
    expect(createDraw.mock.calls[0]?.[0].x).toBeLessThan(25);
  });

  test("persists an exact three-draw replacement atomically", async () => {
    const replaceDrawSchedule = vi.fn().mockResolvedValue(undefined);
    const baseline = timelineState({ milestoneAmount: 0 });
    const initialState: TimelineShareState = {
      ...baseline,
      capitalSpikes: [
        { amount: 50, id: "cost-one", label: "Cost one", x: 10 },
        { amount: 50, id: "cost-two", label: "Cost two", x: 20 },
        { amount: 50, id: "cost-three", label: "Cost three", x: 30 },
      ],
      draws: [],
      items: baseline.items.map((item) => ({
        ...item,
        data: {
          ...item.data,
          amount: 0,
          drawAvailabilityAmount: 300,
          durationDays: 1,
        } satisfies DemoMilestone,
      })),
      range: { max: 40, min: -30, unit: "days" },
      startingCash: 0,
    };

    renderWorkspace({
      initialState,
      persistence: { replaceDrawSchedule },
      status: "draft",
      workspaceMode: "proposal",
    });

    fireEvent.click(screen.getByTestId("timeline-optimize-three-draw"));

    await waitFor(() => expect(replaceDrawSchedule).toHaveBeenCalledTimes(1));
    const replacement = replaceDrawSchedule.mock.calls[0]?.[0];
    expect(replacement.draws).toHaveLength(3);
    expect(replacement.draws.every((entry: any) => entry.amountCents > 0)).toBe(
      true,
    );
    expect(new Set(replacement.draws.map((entry: any) => entry.x)).size).toBe(3);
    expect(replacement.metrics).toMatchObject({
      drawCount: 3,
      totalDrawAmountCents: 15_000,
    });
  });

  test("leaves the current schedule untouched when exact three draws are infeasible", () => {
    const replaceDrawSchedule = vi.fn().mockResolvedValue(undefined);
    const baseline = timelineState({ milestoneAmount: 0 });
    const initialState: TimelineShareState = {
      ...baseline,
      capitalSpikes: [
        { amount: 50, id: "single-cost", label: "Single cost", x: 10 },
      ],
      items: baseline.items.map((item) => ({
        ...item,
        data: {
          ...item.data,
          amount: 0,
          drawAvailabilityAmount: 300,
          durationDays: 1,
        } satisfies DemoMilestone,
      })),
      range: { max: 40, min: -30, unit: "days" },
      startingCash: 0,
    };

    renderWorkspace({
      initialState,
      persistence: { replaceDrawSchedule },
      status: "draft",
      workspaceMode: "proposal",
    });

    fireEvent.click(screen.getByTestId("timeline-optimize-three-draw"));

    expect(replaceDrawSchedule).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalledWith(
      expect.stringContaining("exactly 3"),
    );
  });

  test("creates a Home Equity Takeout from the proposal insertion menu with explicit terms", async () => {
    const createCapitalEvent = vi.fn().mockResolvedValue(undefined);

    renderWorkspace({
      persistence: { createCapitalEvent },
      status: "draft",
      workspaceMode: "proposal",
    });

    fireEvent.click(
      screen.getByRole("button", { name: "Add Home Equity Takeout" }),
    );
    fireEvent.change(screen.getByLabelText("Takeout amount"), {
      target: { value: "125000" },
    });
    fireEvent.change(screen.getByLabelText("Annual interest rate"), {
      target: { value: "8.75" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Apply" }));

    await waitFor(() => expect(createCapitalEvent).toHaveBeenCalledTimes(1));
    expect(createCapitalEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        amountCents: 12_500_000,
        eventKind: "homeEquityTakeout",
        interestAnnualBps: 875,
        x: 10,
      }),
    );
  });

  test("optimizes when same-day borrower cash funds milestone deposits", () => {
    const createDraw = vi.fn().mockResolvedValue(undefined);
    const deleteDraw = vi.fn().mockResolvedValue(undefined);
    const baseline = timelineState({ milestoneAmount: 100 });
    const initialState: TimelineShareState = {
      ...baseline,
      capitalSpikes: [
        {
          amount: 100,
          eventKind: "cashInfusion",
          id: "borrower-day-zero-capital",
          label: "Borrower day-zero capital",
          x: 0,
        },
        {
          amount: 50,
          id: "supplier-deposit",
          label: "supplier-deposit",
          x: 15,
        },
      ],
      items: baseline.items.map((item) => ({
        ...item,
        data: {
          ...item.data,
          completionPaymentAmount: 20,
          drawAvailabilityAmount: 100,
          durationDays: 5,
          initialPaymentAmount: 80,
        } satisfies DemoMilestone,
      })),
      startingCash: 0,
    };

    renderWorkspace({
      initialState,
      persistence: { createDraw, deleteDraw },
      status: "draft",
      workspaceMode: "proposal",
    });

    fireEvent.click(screen.getByTestId("timeline-optimize-scenario"));

    expect(deleteDraw).toHaveBeenCalledWith({ drawKey: "draw-01" });
    expect(createDraw).toHaveBeenCalledWith(
      expect.objectContaining({
        amountCents: 5_000,
        customDate: true,
        label: "Draw 01",
        order: 1,
      }),
    );
    expect(createDraw.mock.calls[0]?.[0].x).toBe(14);
  });

  test("rejects a draft proposal that would require an in-milestone advance", () => {
    const createCashInfusion = vi.fn().mockResolvedValue(undefined);
    const createDraw = vi.fn().mockResolvedValue(undefined);
    const deleteDraw = vi.fn().mockResolvedValue(undefined);
    const baseline = timelineState({ milestoneAmount: 100 });
    const initialState: TimelineShareState = {
      ...baseline,
      draws: [],
      items: baseline.items.map((item) => ({
        ...item,
        data: {
          ...item.data,
          drawAvailabilityAmount: 100,
          durationDays: 10,
        } satisfies DemoMilestone,
      })),
      startingCash: 50,
    };

    renderWorkspace({
      initialState,
      persistence: { createCashInfusion, createDraw, deleteDraw },
      status: "draft",
      workspaceMode: "proposal",
    });

    fireEvent.click(screen.getByTestId("timeline-optimize-scenario"));

    expect(createCashInfusion).not.toHaveBeenCalled();
    expect(createDraw).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalledWith(
      expect.stringContaining("only $0 is unlocked"),
    );
  });

  test("reports when draft proposal draws are already optimized", () => {
    const createDraw = vi.fn().mockResolvedValue(undefined);
    const deleteDraw = vi.fn().mockResolvedValue(undefined);
    const baseline = timelineState({ milestoneAmount: 100 });
    const initialState: TimelineShareState = {
      ...baseline,
      capitalSpikes: [
        {
          amount: 100,
          eventKind: "cashInfusion",
          id: "borrower-day-zero-capital",
          label: "Borrower day-zero capital",
          x: 0,
        },
        {
          amount: 50,
          id: "supplier-deposit",
          label: "supplier-deposit",
          x: 15,
        },
      ],
      draws: [
        {
          amount: 50,
          customDate: true,
          id: "existing-optimized-draw",
          itemId: "foundation",
          label: "Draw 01",
          x: 14,
        },
      ],
      items: baseline.items.map((item) => ({
        ...item,
        data: {
          ...item.data,
          completionPaymentAmount: 20,
          drawAvailabilityAmount: 100,
          durationDays: 5,
          initialPaymentAmount: 80,
        } satisfies DemoMilestone,
      })),
      startingCash: 0,
    };

    renderWorkspace({
      initialState,
      persistence: { createDraw, deleteDraw },
      status: "draft",
      workspaceMode: "proposal",
    });

    fireEvent.click(screen.getByTestId("timeline-optimize-scenario"));

    expect(createDraw).not.toHaveBeenCalled();
    expect(deleteDraw).not.toHaveBeenCalled();
    expect(toast.success).toHaveBeenCalledWith(
      expect.stringContaining("already optimized"),
    );
  });

  test("shows milestone contractor assignments in the proposal sidebar", () => {
    renderWorkspace({
      contractorPlanning: {
        milestoneAssignments: [
          {
            _id: "assign-foundation",
            contractorId: "contractor-1",
            contractorName: "Northstar Masonry",
            milestoneKey: "foundation",
            milestoneName: "Foundation",
            role: "Concrete lead",
            status: "planned",
          },
        ],
      },
      workspaceMode: "proposal",
    });

    expect(screen.getByText("Northstar Masonry")).toBeTruthy();
    expect(screen.getByText("Concrete lead")).toBeTruthy();
    expect(
      screen.getByTestId("timeline-selected-milestone-contractor-section"),
    ).toBeTruthy();
  });

  test("shows sub-milestone budget chips in the proposal sidebar when available", () => {
    renderWorkspace({
      initialState: timelineState({ withSubmilestoneBudgets: true }),
      workspaceMode: "proposal",
    });

    expect(
      screen
        .getByTestId("timeline-selected-milestone-submilestone-chip-dc-ed")
        .textContent?.includes("DC/ED"),
    ).toBe(true);
    expect(
      screen
        .getByTestId("timeline-selected-milestone-submilestone-budget-dc-ed")
        .textContent?.includes("$37,000"),
    ).toBe(true);
    expect(
      screen
        .getByTestId("timeline-selected-milestone-submilestone-budget-permits")
        .textContent?.includes("$91,000"),
    ).toBe(true);
  });

  test("rolls editable sub-milestone budget changes into the parent milestone", () => {
    const updateMilestone = vi.fn().mockResolvedValue(undefined);
    renderWorkspace({
      initialState: timelineState({ withSubmilestoneBudgets: true }),
      persistence: { updateMilestone },
      status: "draft",
      workspaceMode: "proposal",
    });

    const budgetChip = screen.getByRole("button", { name: "DC/ED budget" });
    fireEvent.click(budgetChip);
    const budgetInput = screen
      .getAllByLabelText("DC/ED budget")
      .find((element) => element instanceof HTMLInputElement);
    const editableBudgetInput = expectHtmlInput(budgetInput);
    fireEvent.change(editableBudgetInput, { target: { value: "42000" } });
    fireEvent.keyDown(editableBudgetInput, { key: "Enter" });

    expect(
      screen.getByTestId("selected-milestone-plan-summary").textContent,
    ).toContain("$133,000");
    expect(updateMilestone).toHaveBeenCalledWith(
      expect.objectContaining({
        budgetCents: 13_300_000,
        milestoneKey: "foundation",
        submilestones: expect.arrayContaining([
          expect.objectContaining({
            budgetCents: 4_200_000,
            key: "dc-ed",
          }),
        ]),
      }),
    );
  });

  test("rolls editable sub-milestone duration changes into the parent milestone", () => {
    const updateMilestone = vi.fn().mockResolvedValue(undefined);
    renderWorkspace({
      initialState: timelineState({ withSubmilestoneBudgets: true }),
      persistence: { updateMilestone },
      status: "draft",
      workspaceMode: "proposal",
    });

    const durationChip = screen.getByRole("button", {
      name: "DC/ED duration",
    });
    fireEvent.click(durationChip);
    const durationInput = screen
      .getAllByLabelText("DC/ED duration")
      .find((element) => element instanceof HTMLInputElement);
    const editableDurationInput = expectHtmlInput(durationInput);
    fireEvent.change(editableDurationInput, { target: { value: "4" } });
    fireEvent.keyDown(editableDurationInput, { key: "Enter" });

    expect(
      screen.getByTestId("selected-milestone-plan-summary").textContent,
    ).toContain("6 days");
    expect(updateMilestone).toHaveBeenCalledWith(
      expect.objectContaining({
        durationDays: 6,
        milestoneKey: "foundation",
        submilestones: expect.arrayContaining([
          expect.objectContaining({
            durationDays: 4,
            key: "dc-ed",
          }),
        ]),
      }),
    );
  });

  test("edits milestone draw availability from the proposal sidebar", () => {
    const updateMilestone = vi.fn().mockResolvedValue(undefined);
    renderWorkspace({
      persistence: { updateMilestone },
      status: "draft",
      workspaceMode: "proposal",
    });

    expect(
      screen.getByTestId("selected-milestone-plan-summary").textContent,
    ).toContain("Draw availability unlocked");
    expect(
      screen.getByTestId("selected-milestone-cumulative-draw-position")
        .textContent,
    ).toContain("Cumulative through unlock");
    expect(
      screen.getByTestId("selected-milestone-total-unlocked").textContent,
    ).toBeTruthy();
    expect(
      screen.getByTestId("selected-milestone-total-drawn").textContent,
    ).toBeTruthy();
    expect(
      screen.getByTestId("selected-milestone-available-to-draw").textContent,
    ).toBeTruthy();
    expect(
      screen.getByTestId("timeline-cashflow-total-unlocked").textContent,
    ).toBeTruthy();
    expect(
      screen.getByTestId("timeline-cashflow-total-drawn").textContent,
    ).toBeTruthy();
    expect(
      screen.getByTestId("timeline-cashflow-available-to-draw").textContent,
    ).toBeTruthy();
    expect(
      screen.getByTestId("timeline-cashflow-lender-cash-used").textContent,
    ).toContain("$96,000");

    fireEvent.click(
      screen.getByRole("button", { name: "Draw availability unlocked" }),
    );
    const availabilityInput = screen
      .getAllByLabelText("Draw availability unlocked")
      .find((element) => element instanceof HTMLInputElement);
    const editableAvailabilityInput = expectHtmlInput(availabilityInput);
    fireEvent.change(editableAvailabilityInput, {
      target: { value: "105000" },
    });
    fireEvent.keyDown(editableAvailabilityInput, { key: "Enter" });

    expect(
      screen.getByTestId("timeline-cashflow-lender-cash-used").textContent,
    ).toContain("$96,000");
    expect(updateMilestone).toHaveBeenCalledWith(
      expect.objectContaining({
        drawAvailabilityCents: 10_500_000,
        milestoneKey: "foundation",
      }),
    );
  });

  test("ignores preview share query params on production proposal routes", () => {
    timelineSearchMockState.share = "snapshot_123";
    window.history.pushState(
      null,
      "",
      "/backoffice/proposals/proposal_123?share=snapshot_123",
    );

    renderWorkspace({
      shareUrlPath: "/proposal-preview",
      status: "draft",
      workspaceMode: "proposal",
    });

    expect(screen.queryByText("Loading shared snapshot")).toBeNull();
    expect(screen.queryByText("Shared fork")).toBeNull();
    expect(screen.getByText("Proposal mode")).toBeTruthy();
  });

  test("renders embedded proposal previews as read-only timeline sections", () => {
    render(
      <TimelineWorkspace
        allowRoleSwitching={false}
        embedded
        initialRole="builder"
        initialState={timelineState({ withSubmilestoneBudgets: true })}
        readOnly
        showWorkspaceHeader={false}
        timelineSettingsProjection={null}
        workspaceMode="proposal"
      />,
    );

    expect(screen.getByText("Cash requirement vs draw recovery")).toBeTruthy();
    expect(
      screen.getByTestId("timeline-workspace-root").parentElement?.tagName,
    ).toBe("SECTION");
    expect(screen.queryByText("Proposal mode")).toBeNull();
    expect(screen.queryByRole("button", { name: "Share" })).toBeNull();
    expect(screen.queryByText("Reset")).toBeNull();
    expect(screen.queryByText("Add draw")).toBeNull();
    expect(
      (
        screen.getByRole("button", {
          name: "DC/ED budget",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
  });

  test("enables builder execution controls only in live mode", () => {
    renderWorkspace({ workspaceMode: "live" });

    expect(screen.getByText("Live build")).toBeTruthy();
    expect(screen.getByText("Add draw")).toBeTruthy();
    expect(screen.getAllByText("Request milestone").length).toBeGreaterThan(0);
    expect(screen.getByText("Mark milestone complete")).toBeTruthy();
  });

  test("enables lender site visit controls only in live mode", () => {
    renderWorkspace({ initialRole: "lender", workspaceMode: "live" });

    expect(screen.getByText("Live build")).toBeTruthy();
    expect(screen.getByText("Request site visit")).toBeTruthy();
  });

  test("accepts draw amounts within unlocked capacity and blocks overages", () => {
    const updateDraw = vi.fn().mockResolvedValue(undefined);
    renderWorkspace({
      persistence: { updateDraw },
      status: "draft",
      workspaceMode: "proposal",
    });

    fireEvent.click(
      screen.getByRole("button", {
        name: "Edit Draw 01 date and amount",
      }),
    );

    const amountInput = screen.getByLabelText(
      "Draw amount",
    ) as HTMLInputElement;
    expect(amountInput.step).toBe("any");
    fireEvent.change(amountInput, { target: { value: "87965" } });
    expect(amountInput.validity.valid).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Apply" }));

    expect(updateDraw).toHaveBeenCalledWith(
      expect.objectContaining({
        amountCents: 8_796_500,
        drawKey: "draw-01",
      }),
    );

    fireEvent.click(
      screen.getByRole("button", {
        name: "Edit Draw 01 date and amount",
      }),
    );
    fireEvent.change(screen.getByLabelText("Draw amount"), {
      target: { value: "100000" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Apply" }));

    expect(toast.error).toHaveBeenCalledWith(
      "Only $96,000 is unlocked and available to draw by day 22.",
    );
    expect(updateDraw).toHaveBeenCalledTimes(1);
  });

  test("allows reducing an existing draw when the current schedule exceeds unlocked capacity", () => {
    const updateDraw = vi.fn().mockResolvedValue(undefined);
    renderWorkspace({
      initialState: timelineState({ milestoneAmount: 0 }),
      persistence: { updateDraw },
      status: "draft",
      workspaceMode: "proposal",
    });

    fireEvent.click(
      screen.getByRole("button", {
        name: "Edit Draw 01 date and amount",
      }),
    );
    fireEvent.change(screen.getByLabelText("Draw amount"), {
      target: { value: "90000" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Apply" }));

    expect(toast.error).not.toHaveBeenCalledWith(
      "Cannot schedule a draw that exceeds unlocked draw availability at this point in the timeline.",
    );
    expect(updateDraw).toHaveBeenCalledWith(
      expect.objectContaining({
        amountCents: 9_000_000,
        drawKey: "draw-01",
      }),
    );
  });

  test("allows deferring an existing draw when the current schedule exceeds unlocked capacity", () => {
    const updateDraw = vi.fn().mockResolvedValue(undefined);
    renderWorkspace({
      initialState: timelineState({ milestoneAmount: 0 }),
      persistence: { updateDraw },
      status: "draft",
      workspaceMode: "proposal",
    });

    fireEvent.click(
      screen.getByRole("button", {
        name: "Edit Draw 01 date and amount",
      }),
    );
    fireEvent.change(screen.getByLabelText("Draw date"), {
      target: { value: "30" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Apply" }));

    expect(toast.error).not.toHaveBeenCalledWith(
      "Cannot schedule a draw that exceeds unlocked draw availability at this point in the timeline.",
    );
    expect(updateDraw).toHaveBeenCalledWith(
      expect.objectContaining({
        amountCents: 9_600_000,
        drawKey: "draw-01",
        x: 30,
      }),
    );
  });

  test("still blocks edits that worsen an existing unlocked-capacity violation", () => {
    const updateDraw = vi.fn().mockResolvedValue(undefined);
    renderWorkspace({
      initialState: timelineState({ milestoneAmount: 0 }),
      persistence: { updateDraw },
      status: "draft",
      workspaceMode: "proposal",
    });

    fireEvent.click(
      screen.getByRole("button", {
        name: "Edit Draw 01 date and amount",
      }),
    );
    fireEvent.change(screen.getByLabelText("Draw date"), {
      target: { value: "30" },
    });
    fireEvent.change(screen.getByLabelText("Draw amount"), {
      target: { value: "100000" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Apply" }));

    expect(toast.error).toHaveBeenCalledWith(
      "Cannot schedule a draw that exceeds unlocked draw availability at this point in the timeline.",
    );
    expect(updateDraw).not.toHaveBeenCalled();
  });

  test("calls out a generated schedule that exceeds maximum draw availability", () => {
    renderWorkspace({
      initialState: timelineState({ milestoneAmount: 0 }),
      status: "draft",
      workspaceMode: "proposal",
    });

    const warning = screen.getByTestId(
      "timeline-draw-availability-warning",
    );
    expect(warning.textContent).toContain(
      "Generated draw schedule exceeds maximum availability",
    );
    expect(warning.textContent).toContain(
      "Draw 01 schedules $96,000 on day 22, but only $0 is unlocked",
    );
    expect(warning.textContent).toContain("5-day review lag");
    expect(warning.textContent).toContain("Reduce or move this draw by $96,000");
  });

  test("blocks adding a draw before reimbursement capacity unlocks", () => {
    renderWorkspace({
      status: "draft",
      workspaceMode: "proposal",
    });

    fireEvent.click(screen.getByRole("button", { name: "Add draw" }));

    expect(toast.error).toHaveBeenCalledWith(
      "Cannot schedule a draw that exceeds unlocked draw availability at this point in the timeline.",
    );
    expect(
      screen.queryByRole("button", { name: "Edit Draw 02 date and amount" }),
    ).toBeNull();
  });

  test("contains raw timeline persistence failures in a safe status message", async () => {
    const updateDraw = vi
      .fn()
      .mockRejectedValueOnce(
        new Error(
          "ConvexError demo_timeline_plans.updateDraw requestId=req-secret payload={drawKey:draw-01} /srv/convex/demo_timeline_plans.ts",
        ),
      )
      .mockResolvedValueOnce(undefined);
    renderWorkspace({
      persistence: { updateDraw },
      status: "draft",
      workspaceMode: "proposal",
    });

    fireEvent.click(
      screen.getByRole("button", {
        name: "Edit Draw 01 date and amount",
      }),
    );
    fireEvent.change(screen.getByLabelText("Draw amount"), {
      target: { value: "87965" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Apply" }));

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        expect.stringMatching(
          /^Unable to save draw update\. Changes are still local\. Reference TL-[A-Z0-9-]+\.$/,
        ),
      ),
    );
    expect(screen.getByTestId("timeline-durable-save-status").textContent).toBe(
      "Unsaved changes",
    );
    expect(
      vi.mocked(toast.error).mock.calls.some(([message]) =>
        /ConvexError|requestId=req-secret|payload=|\/srv\//i.test(String(message)),
      ),
    ).toBe(false);

    fireEvent.click(screen.getByRole("button", { name: "Retry save" }));
    await waitFor(() => expect(updateDraw).toHaveBeenCalledTimes(2));
    await waitFor(() =>
      expect(screen.getByTestId("timeline-durable-save-status").textContent).toBe(
        "Saved",
      ),
    );
  });

  test("collapses secondary financial charts behind compact disclosures", () => {
    mediaQueryMockState.isMobile = true;
    renderWorkspace({ initialRole: "lender", workspaceMode: "live" });

    const cashflowDisclosure = screen.getByRole("button", {
      name: "Cash flow analytics",
    });
    const availabilityDisclosure = screen.getByRole("button", {
      name: "Draw availability analytics",
    });
    expect(cashflowDisclosure.getAttribute("aria-expanded")).toBe("false");
    expect(availabilityDisclosure.getAttribute("aria-expanded")).toBe("false");
    expect(
      screen.queryByRole("region", { name: "Cash flow analytics detail" }),
    ).toBeNull();
    expect(
      screen.queryByRole("region", {
        name: "Draw availability analytics detail",
      }),
    ).toBeNull();
  });

  test("opens mobile milestone cards in the existing drawer", async () => {
    mediaQueryMockState.isMobile = true;
    renderWorkspace({ workspaceMode: "live" });

    expect(screen.getByTestId("mobile-timeline-workspace")).toBeTruthy();
    fireEvent.click(
      screen.getByTestId("mobile-day-event-milestone-foundation"),
    );

    expect(
      await screen.findByTestId("selected-draw-mobile-drawer"),
    ).toBeTruthy();
    expect(screen.queryByTestId("mobile-focus-view")).toBeNull();
  });

  test("hydrates fresh durable timeline state after another collaborator edits a milestone", () => {
    const view = renderWorkspace({
      initialState: timelineState({ milestoneAmount: 120_000 }),
      status: "draft",
      workspaceMode: "proposal",
    });

    expect(
      screen.getByTestId("selected-milestone-plan-summary").textContent,
    ).toContain("$120,000");

    view.rerender(
      <TimelineWorkspace
        {...workspaceProps({
          initialState: timelineState({ milestoneAmount: 250_000 }),
          status: "draft",
          workspaceMode: "proposal",
        })}
      />,
    );

    expect(
      screen.getByTestId("selected-milestone-plan-summary").textContent,
    ).toContain("$250,000");
  });

  test("renders remote collaborator cursors with the shared pointer shape", () => {
    renderWorkspace({
      collaboration: {
        cursors: [
          {
            color: "oklch(0.54 0.14 240)",
            cursor: { x: 0.42, y: 0.64 },
            name: "Alex Builder",
            userId: "user_builder",
          },
          {
            cursor: null,
            name: "Offline Member",
            userId: "user_offline",
          },
        ],
        permission: "edit",
      },
      workspaceMode: "proposal",
    });

    expect(screen.getByTestId("timeline-remote-cursors")).toBeTruthy();
    expect(
      screen.getAllByTestId("timeline-remote-cursor-pointer"),
    ).toHaveLength(1);
    expect(screen.getByTestId("timeline-remote-cursor-label").textContent).toBe(
      "Alex Builder",
    );
    expect(
      screen
        .getByTestId("timeline-remote-cursor-pointer")
        .querySelector("path")
        ?.getAttribute("d"),
    ).toBe(
      "M1.8 4.4 7 36.2c.3 1.8 2.6 2.3 3.6.8l3.9-5.7c1.7-2.5 4.5-4.1 7.5-4.3l6.9-.5c1.8-.1 2.5-2.4 1.1-3.5L5 2.5c-1.4-1.1-3.5 0-3.3 1.9Z",
    );
  });

  test("reports collaborator cursor positions from the full viewport", () => {
    const onCursorChange = vi.fn();
    renderWorkspace({
      collaboration: {
        cursors: [],
        onCursorChange,
        permission: "edit",
      },
      workspaceMode: "proposal",
    });

    fireEvent.pointerMove(window, {
      clientX: window.innerWidth / 2,
      clientY: window.innerHeight / 2,
    });
    expect(onCursorChange).toHaveBeenLastCalledWith({ x: 0.5, y: 0.5 });

    fireEvent.blur(window);
    expect(onCursorChange).toHaveBeenLastCalledWith(null);
  });
});
