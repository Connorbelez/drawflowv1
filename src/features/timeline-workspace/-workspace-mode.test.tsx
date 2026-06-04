// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";

import type { TimelineItem } from "#/components/roadmap/AnimatedCurvedTimeline.tsx";
import {
  buildCashUseSummary,
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

vi.mock("#/components/roadmap/AnimatedCurvedTimeline.tsx", () => ({
  AnimatedCurvedTimeline: ({ insertion, markers = [], renderMarker }: any) => (
    <div data-testid="mock-animated-timeline">
      {insertion?.actions?.map((action: { id: string; label: string }) => (
        <button key={action.id} type="button">
          {action.label}
        </button>
      ))}
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
  TimelineCashflowCompoundChart: () => <div data-testid="mock-cashflow" />,
}));

vi.mock("./-TimelineDrawAvailabilityChart.tsx", () => ({
  TimelineDrawAvailabilityChart: () => <div data-testid="mock-draw-chart" />,
}));

function expectHtmlInput(element: Element | undefined): HTMLInputElement {
  expect(element).toBeInstanceOf(HTMLInputElement);

  return element as HTMLInputElement;
}

afterEach(() => {
  mediaQueryMockState.isMobile = false;
  timelineSearchMockState.share = null;
  timelineSearchMockState.setTimelineSearch.mockReset();
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
  x: 21,
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

describe("TimelineWorkspace mode split", () => {
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
          x: 20,
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
    expect(createDraw.mock.calls[0]?.[0].x).toBeLessThan(20);
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

  test("accepts any positive draw amount in the inline draw editor", () => {
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
