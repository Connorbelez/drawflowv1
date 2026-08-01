// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";

vi.mock("convex/react", () => ({
  useQuery: () => ({ available: true }),
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
            entityId: "comment-22",
            entityKind: "comment",
            href: `${window.location.pathname}?tab=collaboration&focus=comment%3Acomment-22`,
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
        "comment:comment-22",
      );
      expect(window.location.pathname).toBe(pathname);
      expect(window.location.search).toContain(
        "focus=comment%3Acomment-22",
      );
    },
  );
});
