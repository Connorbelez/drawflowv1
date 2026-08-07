// @vitest-environment jsdom

import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";

const observerState = vi.hoisted(() => ({
  callback: null as IntersectionObserverCallback | null,
}));

vi.mock(
  "#/features/build-collaboration/BuildCollaborationWorkspace.tsx",
  () => ({
    BuildCollaborationWorkspace: () => (
      <div data-testid="mock-build-collaboration-workspace" />
    ),
  }),
);

import { DeferredBuildCollaborationWorkspace } from "./lazy-build-detail-tabs";

afterEach(() => {
  cleanup();
  observerState.callback = null;
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("DeferredBuildCollaborationWorkspace", () => {
  test("waits for the collaboration section to enter the viewport", async () => {
    class IntersectionObserverMock {
      constructor(callback: IntersectionObserverCallback) {
        observerState.callback = callback;
      }

      disconnect() {}

      observe() {}
    }
    vi.stubGlobal("IntersectionObserver", IntersectionObserverMock);

    render(
      <DeferredBuildCollaborationWorkspace
        buildId="build-01"
        organizationId="org-01"
      />,
    );

    expect(
      screen.queryByTestId("mock-build-collaboration-workspace"),
    ).toBeNull();
    expect(
      screen.getByText("Collaboration loads when this section enters view."),
    ).toBeTruthy();

    observerState.callback?.(
      [{ isIntersecting: true } as IntersectionObserverEntry],
      {} as IntersectionObserver,
    );

    await waitFor(() =>
      expect(
        screen.getByTestId("mock-build-collaboration-workspace"),
      ).toBeTruthy(),
    );
  });

  test("mounts immediately for a focused collaboration reference", async () => {
    render(
      <DeferredBuildCollaborationWorkspace
        buildId="build-01"
        eager
        focusedReference="post:post-01"
        organizationId="org-01"
      />,
    );

    await waitFor(() =>
      expect(
        screen.getByTestId("mock-build-collaboration-workspace"),
      ).toBeTruthy(),
    );
  });

  test("provides a manual escape hatch when viewport delivery is unavailable", async () => {
    class IntersectionObserverMock {
      constructor() {}

      disconnect() {}

      observe() {}
    }
    vi.stubGlobal("IntersectionObserver", IntersectionObserverMock);

    render(
      <DeferredBuildCollaborationWorkspace
        buildId="build-01"
        organizationId="org-01"
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Load collaboration" }));

    await waitFor(() =>
      expect(
        screen.getByTestId("mock-build-collaboration-workspace"),
      ).toBeTruthy(),
    );
  });

  test("mounts after a bounded fallback when the observer never fires", async () => {
    class IntersectionObserverMock {
      constructor() {}

      disconnect() {}

      observe() {}
    }
    vi.stubGlobal("IntersectionObserver", IntersectionObserverMock);
    vi.useFakeTimers();

    render(
      <DeferredBuildCollaborationWorkspace
        buildId="build-01"
        organizationId="org-01"
      />,
    );

    await act(async () => {
      vi.advanceTimersByTime(1500);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(
      screen.getByTestId("mock-build-collaboration-workspace"),
    ).toBeTruthy();
  });
});
