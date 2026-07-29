// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (config: Record<string, unknown>) => ({
    ...config,
    useParams: () => ({ buildId: "active_build_01" }),
    useRouteContext: () => ({ organizationId: "org_01" }),
    useSearch: () => ({ focus: "actionItem:action_01" }),
  }),
}));

vi.mock(
  "#/features/build-collaboration/BuildCollaborationWorkspace.tsx",
  () => ({
    BuildCollaborationWorkspace: ({
      buildId,
      focusedReference,
      organizationId,
    }: {
      buildId: string;
      focusedReference?: string;
      organizationId?: string;
    }) => (
      <div data-testid="build-collaboration-workspace">
        {buildId}:{organizationId}:{focusedReference}
      </div>
    ),
  })
);

import { HomeownerBuildCollaboration } from "./$buildId";

describe("HomeownerBuildCollaboration", () => {
  afterEach(cleanup);

  test("renders the shared production collaboration module with deep-link focus", () => {
    render(<HomeownerBuildCollaboration />);

    expect(
      screen.getByRole("heading", { name: "Build collaboration" })
    ).toBeTruthy();
    expect(
      screen.getByTestId("build-collaboration-workspace").textContent
    ).toBe("active_build_01:org_01:actionItem:action_01");
  });
});
