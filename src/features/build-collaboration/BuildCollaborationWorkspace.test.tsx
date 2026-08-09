// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";

vi.mock("convex/react", () => ({
  useQuery: () => ({ available: true }),
}));

vi.mock("../build-detail-targets/BuildDetailSheetHost.tsx", () => ({
  BuildDetailIntegritySheet: () => null,
  BuildDetailSheetHost: ({
    children,
  }: {
    children: (state: object) => unknown;
  }) =>
    children({
      controller: {
        close: vi.fn(),
        openFocus: (focus: string) => {
          const url = new URL(window.location.href);
          url.searchParams.set("focus", focus);
          window.history.pushState(window.history.state, "", url);
        },
      },
      readOnly: false,
      resolutionState: "idle",
    }),
}));

vi.mock("./BuildCollaborationFeed.tsx", () => ({
  BuildCollaborationFeed: ({
    focusedReference,
    onOpenReference,
  }: {
    focusedReference?: string;
    onOpenReference?: (reference: {
      entityId: string;
      entityKind: string;
      href: string;
    }) => void;
  }) => (
    <div>
      <output data-testid="focused-reference">
        {focusedReference ?? "none"}
      </output>
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
  window.history.replaceState({}, "", "/");
});

describe("BuildCollaborationWorkspace search hydration", () => {
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
});
