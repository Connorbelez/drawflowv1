// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { useMutation } from "convex/react";
import { afterEach, describe, expect, test, vi } from "vitest";

import { ActiveBuildTimelineWorkspace } from "./ActiveBuildTimelineWorkspace";

vi.mock("convex/react", () => ({
  useMutation: vi.fn(),
}));

vi.mock("#/features/timeline-workspace/-timeline-convex-adapter.ts", () => ({
  convexWorkspaceToTimelineState: () => ({
    activeSelection: { itemId: "foundation", phase: "inProgress" },
    capitalSpikes: [],
    currentDay: 0,
    draws: [],
    items: [],
    progressValue: 0,
    range: { max: 60, min: 0, unit: "days" },
    selectedPanelOpen: false,
    startingCash: 400_000,
    straightLine: true,
  }),
}));

vi.mock("#/features/timeline-workspace/index.tsx", () => ({
  TimelineWorkspace: ({ workspaceMode }: any) => (
    <div data-testid="mock-active-build-timeline-mode">{workspaceMode}</div>
  ),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("ActiveBuildTimelineWorkspace", () => {
  test("renders the shared timeline workspace in live mode", () => {
    vi.mocked(useMutation).mockReturnValue(vi.fn().mockResolvedValue({}));

    render(
      <ActiveBuildTimelineWorkspace
        backofficeHref="/backoffice/builds/build_123"
        buildHref="/backoffice/builds/build_123"
        buildId={"build_123" as any}
        onRequestSiteVisit={vi.fn()}
        workspace={{
          capitalEvents: [],
          draws: [],
          evidenceAssets: [],
          milestones: [],
          permissions: [],
          plan: {},
          proposal: {
            buildName: "Active Build",
            location: "Toronto, ON",
            status: "approved",
            totalBudgetCents: 120_000_00,
          },
        } as any}
        workosOrganizationId="org_test"
      />
    );

    expect(screen.getByTestId("mock-active-build-timeline-mode").textContent).toBe(
      "live"
    );
  });
});
