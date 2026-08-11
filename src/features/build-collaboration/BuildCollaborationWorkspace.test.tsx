// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";

const hostMocks = vi.hoisted(() => ({
  hostRenderCount: 0,
  selectTab: vi.fn(),
  target: undefined as
    | undefined
    | {
        companionId?: string;
        kind: "submilestone";
        submilestoneId: string;
      },
}));

vi.mock("convex/react", () => ({
  useQuery: () => ({ available: true }),
}));

vi.mock("../build-detail-targets/BuildDetailSheetHost.tsx", () => ({
  BuildDetailIntegritySheet: () => null,
  BuildDetailSheetHost: ({
    children,
  }: {
    children: (state: object) => unknown;
  }) => {
    hostMocks.hostRenderCount += 1;
    return children({
      controller: {
        back: vi.fn(),
        canGoBack: false,
        canGoForward: false,
        close: vi.fn(),
        forward: vi.fn(),
        openFocus: (focus: string) => {
          const url = new URL(window.location.href);
          url.searchParams.set("focus", focus);
          window.history.pushState(window.history.state, "", url);
        },
        selectTab: hostMocks.selectTab,
      },
      readOnly: false,
      resolutionState: "idle",
      target: hostMocks.target,
    });
  },
}));

vi.mock(
  "../build-submilestone-detail/SubmilestoneDetailSheet.tsx",
  () => ({
    SubmilestoneDetailSheet: ({
      buildSubmilestoneId,
      companionActionItemId,
      onOpenChange,
      selectedTab,
    }: {
      buildSubmilestoneId: string;
      companionActionItemId?: string;
      onOpenChange: (open: boolean) => void;
      selectedTab?: string;
    }) => (
      <div>
        <output data-testid="submilestone-detail-sheet">
          {buildSubmilestoneId}:{companionActionItemId}:{selectedTab ?? "default"}
        </output>
        <button onClick={() => onOpenChange(false)} type="button">
          Close detail
        </button>
      </div>
    ),
  }),
);

vi.mock("./BuildCollaborationFeed.tsx", () => ({
  BuildCollaborationFeed: ({
    focusedReference,
    onOpenReference,
    resolvedDetailTarget,
  }: {
    focusedReference?: string;
    onOpenReference?: (reference: {
      entityId: string;
      entityKind: string;
      href: string;
    }) => void;
    resolvedDetailTarget?: { kind?: string };
  }) => (
    <div>
      <output data-testid="focused-reference">
        {focusedReference ?? "none"}
      </output>
      {resolvedDetailTarget?.kind === "actionItem" ? (
        <output data-testid="generic-action-item-sheet">
          Generic Action Item sheet
        </output>
      ) : null}
      <button
        onClick={() =>
          onOpenReference?.({
            entityId: "foundation-footings",
            entityKind: "milestone",
            href: `${window.location.pathname}?tab=collaboration&focus=milestone%3Afoundation-footings`,
          })
        }
        type="button"
      >
        Open search result
      </button>
    </div>
  ),
}));

import { BuildCollaborationWorkspace } from "./BuildCollaborationWorkspace.tsx";

afterEach(() => {
  cleanup();
  hostMocks.selectTab.mockReset();
  hostMocks.hostRenderCount = 0;
  hostMocks.target = undefined;
  vi.unstubAllGlobals();
  window.history.replaceState({}, "", "/");
});

describe("BuildCollaborationWorkspace search hydration", () => {
  test("uses an injected detail sheet host without creating a second host or sheet", () => {
    const externalHost = {
      controller: {
        back: vi.fn(),
        canGoBack: false,
        canGoForward: false,
        close: vi.fn(),
        currentFrame: undefined,
        forward: vi.fn(),
        history: { frames: [], index: -1, interactive: false },
        openFocus: vi.fn(),
        openTarget: vi.fn(),
        selectTab: vi.fn(),
      },
      readOnly: false,
      resolutionState: "visible" as const,
      target: {
        kind: "submilestone" as const,
        submilestoneId: "submilestone-external",
      },
    } as any;

    render(
      <BuildCollaborationWorkspace
        buildId="build-1"
        detailSheetHost={externalHost}
        organizationId="org-1"
      />,
    );

    expect(hostMocks.hostRenderCount).toBe(0);
    expect(screen.queryByTestId("submilestone-detail-sheet")).toBeNull();
    expect(screen.getByTestId("focused-reference").textContent).toBe("none");
  });

  test("keeps the generic Action Item sheet reachable through an injected host", () => {
    const externalHost = {
      controller: {
        back: vi.fn(),
        canGoBack: false,
        canGoForward: false,
        close: vi.fn(),
        currentFrame: undefined,
        forward: vi.fn(),
        history: { frames: [], index: -1, interactive: false },
        openFocus: vi.fn(),
        openTarget: vi.fn(),
        selectTab: vi.fn(),
      },
      readOnly: false,
      resolutionState: "visible" as const,
      target: {
        actionItemId: "action-item-manual",
        kind: "actionItem" as const,
      },
    } as any;

    render(
      <BuildCollaborationWorkspace
        buildId="build-1"
        detailSheetHost={externalHost}
        focusedReference="actionItem:action-item-manual"
        organizationId="org-1"
      />,
    );

    expect(screen.getByTestId("generic-action-item-sheet").textContent).toBe(
      "Generic Action Item sheet",
    );
    expect(hostMocks.hostRenderCount).toBe(0);
  });

  test("mounts the unified shell for a canonical Sub-milestone target", () => {
    hostMocks.target = {
      companionId: "action-1",
      kind: "submilestone",
      submilestoneId: "submilestone-1",
    };

    render(
      <BuildCollaborationWorkspace
        buildId="build-1"
        detailTab="review"
        organizationId="org-1"
      />,
    );

    expect(screen.getByTestId("submilestone-detail-sheet").textContent).toBe(
      "submilestone-1:action-1:review",
    );
  });

  test("mounts the unified shell when canonical collaboration has no companion", () => {
    hostMocks.target = {
      kind: "submilestone",
      submilestoneId: "submilestone-1",
    };

    render(
      <BuildCollaborationWorkspace
        buildId="build-1"
        detailTab="overview"
        organizationId="org-1"
      />,
    );

    expect(screen.getByTestId("submilestone-detail-sheet").textContent).toBe(
      "submilestone-1::overview",
    );
  });

  test.each([
    ["Contractor", "/contractor/builds/build-1"],
    ["Homeowner", "/homeowner/builds/build-1"],
  ])(
    "hydrates a focused search result in place on the %s Build route",
    (_role, pathname) => {
      window.history.replaceState({}, "", pathname);
      render(
        <BuildCollaborationWorkspace
          buildId="build-1"
          organizationId="org-1"
        />,
      );

      fireEvent.click(
        screen.getByRole("button", { name: "Open search result" }),
      );

      expect(screen.getByTestId("focused-reference").textContent).toBe(
        "milestone:foundation-footings",
      );
      expect(window.location.pathname).toBe(pathname);
      expect(window.location.search).toContain(
        "focus=milestone%3Afoundation-footings",
      );
    },
  );

  test("restores focus to the launcher after an explicit detail close", () => {
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    });
    hostMocks.target = {
      companionId: "action-1",
      kind: "submilestone",
      submilestoneId: "submilestone-1",
    };
    render(
      <BuildCollaborationWorkspace buildId="build-1" organizationId="org-1" />,
    );
    const launcher = screen.getByRole("button", { name: "Open search result" });
    launcher.focus();
    fireEvent.click(launcher);
    fireEvent.click(screen.getByRole("button", { name: "Close detail" }));
    expect(document.activeElement).toBe(launcher);
  });
});
