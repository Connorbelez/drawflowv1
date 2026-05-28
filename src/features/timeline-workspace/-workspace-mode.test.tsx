// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";

import type { TimelineItem } from "#/components/roadmap/AnimatedCurvedTimeline.tsx";
import { TimelineWorkspace, type TimelineWorkspaceProps } from "./index.tsx";
import type {
  DemoDraw,
  DemoMilestone,
  TimelineShareState,
} from "./-timeline-share-snapshot.ts";

const mediaQueryMockState = vi.hoisted(() => ({ isMobile: false }));

vi.mock("convex/react", () => ({
  useMutation: () => vi.fn(),
  useQuery: () => undefined,
}));

vi.mock("nuqs", () => ({
  parseAsString: {},
  useQueryStates: () => [{ share: null }, vi.fn()],
}));

vi.mock("#/hooks/use-media-query.ts", () => ({
  useMediaQuery: () => mediaQueryMockState.isMobile,
}));

vi.mock("#/components/roadmap/AnimatedCurvedTimeline.tsx", () => ({
  AnimatedCurvedTimeline: ({ insertion }: any) => (
    <div data-testid="mock-animated-timeline">
      {insertion?.actions?.map((action: { id: string; label: string }) => (
        <button key={action.id} type="button">
          {action.label}
        </button>
      ))}
      {insertion?.label ? <span>{insertion.label}</span> : null}
    </div>
  ),
}));

vi.mock("./-TimelineCashflowCompoundChart.tsx", () => ({
  TimelineCashflowCompoundChart: () => <div data-testid="mock-cashflow" />,
}));

vi.mock("./-TimelineDrawAvailabilityChart.tsx", () => ({
  TimelineDrawAvailabilityChart: () => <div data-testid="mock-draw-chart" />,
}));

afterEach(() => {
  mediaQueryMockState.isMobile = false;
  cleanup();
});

const milestone: TimelineItem<DemoMilestone> = {
  data: {
    amount: 120_000,
    draw: "Draw 01",
    durationDays: 14,
    evidence: "Planning",
    icon: "foundation",
    name: "Foundation",
    policy: "Within policy",
    status: "ready",
    subMilestones: ["Excavation", "Footings"],
  },
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

function timelineState(): TimelineShareState {
  return {
    activeSelection: { itemId: "foundation", phase: "inProgress" },
    capitalSpikes: [],
    currentDay: 0,
    draws: [draw],
    items: [milestone],
    progressValue: 0,
    range: { max: 60, min: 0, unit: "days" },
    selectedPanelOpen: true,
    startingCash: 400_000,
    straightLine: true,
  };
}

function renderWorkspace({
  collaboration,
  initialRole = "builder",
  status = "approved",
  workspaceMode,
}: {
  collaboration?: TimelineWorkspaceProps["collaboration"];
  initialRole?: "builder" | "lender";
  status?: string;
  workspaceMode: "live" | "proposal";
}) {
  return render(
    <TimelineWorkspace
      allowRoleSwitching={false}
      durableMeta={{
        backofficeHref: "/backoffice/proposals/proposal_123",
        proposalHref: "/builder/proposals/proposal_123",
        proposalSlug: "proposal_123",
        status,
      }}
      durablePlanId="proposal_123"
      initialRole={initialRole}
      initialState={timelineState()}
      planSummary={{
        address: "Toronto, ON",
        includedCount: 1,
        templateTitle: "Single Family Full Build",
        totalBudget: 120_000,
      }}
      timelineSettingsProjection={null}
      collaboration={collaboration}
      workspaceMode={workspaceMode}
    />
  );
}

describe("TimelineWorkspace mode split", () => {
  test("keeps approved production proposals in proposal mode without live execution controls", () => {
    renderWorkspace({ workspaceMode: "proposal" });

    expect(screen.getByText("Proposal mode")).toBeTruthy();
    expect(screen.getByText("Approved proposal")).toBeTruthy();
    expect(screen.getByTestId("selected-milestone-plan-summary")).toBeTruthy();
    expect(screen.queryByText("Mark milestone complete")).toBeNull();
    expect(screen.queryByText("Request site visit")).toBeNull();
    expect(screen.queryByText("Add draw")).toBeNull();
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

  test("opens mobile milestone cards in the existing drawer", async () => {
    mediaQueryMockState.isMobile = true;
    renderWorkspace({ workspaceMode: "live" });

    expect(screen.getByTestId("mobile-timeline-workspace")).toBeTruthy();
    fireEvent.click(screen.getByTestId("mobile-day-event-milestone-foundation"));

    expect(await screen.findByTestId("selected-draw-mobile-drawer")).toBeTruthy();
    expect(screen.queryByTestId("mobile-focus-view")).toBeNull();
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
    expect(screen.getAllByTestId("timeline-remote-cursor-pointer")).toHaveLength(
      1,
    );
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
