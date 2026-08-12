// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

const { useRouterState } = vi.hoisted(() => ({
  useRouterState: vi.fn(),
}));

vi.mock("@tanstack/react-router", () => ({
  Link: ({
    children,
    params,
    to,
  }: {
    children?: ReactNode;
    params?: Record<string, string | undefined>;
    to: string;
  }) => (
    <a
      href={
        to === "/backoffice/builds/$buildId"
          ? `/backoffice/builds/${params?.buildId ?? ""}`
          : to
      }
    >
      {children}
    </a>
  ),
  useRouterState,
}));

import {
  RouteBreadcrumbProjectionProvider,
  RouteBreadcrumbs,
  useRouteBreadcrumbProjection,
} from "./route-breadcrumbs";

const matches = [
  {
    params: {},
    routeId: "/backoffice",
    search: {},
    staticData: {
      breadcrumb: { label: "Backoffice", to: "/backoffice" },
    },
  },
  {
    params: {},
    routeId: "/backoffice/builds",
    search: {},
    staticData: {
      breadcrumb: { label: "Builds", to: "/backoffice/builds" },
    },
  },
  {
    params: { buildId: "active-build-01" },
    routeId: "/backoffice/builds/$buildId",
    search: { focus: "draw:draw-01", tab: "details" },
    staticData: {
      breadcrumb: {
        label: "Loading build…",
        params: ({ params }: { params: Record<string, string | undefined> }) =>
          ({ buildId: params.buildId }),
        to: "/backoffice/builds/$buildId",
      },
    },
  },
];

function BuildBreadcrumbProjection() {
  useRouteBreadcrumbProjection(
    "/backoffice/builds/$buildId",
    "4-plex Proposal",
  );
  return null;
}

describe("RouteBreadcrumbs", () => {
  beforeEach(() => {
    useRouterState.mockImplementation(
      ({ select }: { select: (state: { matches: typeof matches }) => unknown }) =>
        select({ matches }),
    );
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  test("keeps the Build leaf as the accessible current-page indicator", () => {
    render(<RouteBreadcrumbs />);

    expect(
      screen.getByRole("link", { name: "Backoffice" }).getAttribute("href"),
    ).toBe("/backoffice");
    expect(
      screen.getByRole("link", { name: "Builds" }).getAttribute("href"),
    ).toBe("/backoffice/builds");
    expect(screen.getByText("Loading build…").getAttribute("aria-current")).toBe(
      "page",
    );
    expect(screen.queryByRole("link", { name: "Loading build…" })).toBeNull();
    expect(
      document.querySelectorAll('[data-slot="breadcrumb-separator"]'),
    ).toHaveLength(2);
  });

  test("renders the route-owned Build projection without a shell query", async () => {
    render(
      <RouteBreadcrumbProjectionProvider>
        <BuildBreadcrumbProjection />
        <RouteBreadcrumbs />
      </RouteBreadcrumbProjectionProvider>,
    );

    await waitFor(() => {
      expect(
        screen.getByText("4-plex Proposal").getAttribute("aria-current"),
      ).toBe("page");
    });
  });
});
