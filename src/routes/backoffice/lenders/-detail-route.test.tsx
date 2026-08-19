// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

const loadMore = vi.hoisted(() => vi.fn());
const usePaginatedQuery = vi.hoisted(() => vi.fn());
const useQuery = vi.hoisted(() => vi.fn());

vi.mock("convex/react", () => ({ usePaginatedQuery, useQuery }));

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children }: { children: React.ReactNode }) => <a>{children}</a>,
  createFileRoute: () => (config: Record<string, unknown>) => ({
    ...config,
    useParams: () => ({ lenderId: "lender_org_northstar" }),
  }),
}));

vi.mock("#/components/route-breadcrumbs.tsx", () => ({
  useRouteBreadcrumbProjection: vi.fn(),
}));

import { Route } from "./$lenderId/route.tsx";

const LenderOrganizationDetailRoute = (
  Route as unknown as { component: () => React.ReactElement }
).component;

beforeEach(() => {
  loadMore.mockReset();
  useQuery.mockReturnValue({
    builds: [],
    organization: {
      brokerageName: "Northstar Brokerage",
      displayName: "Northstar Lending",
      legalName: "Northstar Lending Inc.",
      status: "active",
    },
    proposals: [],
  });
  usePaginatedQuery.mockReturnValue({
    isLoading: false,
    loadMore,
    results: [
      {
        kind: "member",
        member: {
          assignmentId: "assignment_avery",
          assignmentStatus: "active",
          canMakeFinalDecision: true,
          email: "avery@northstar.test",
          membershipStatus: "active",
          name: "Avery Admin",
          roleSlugs: ["lender-admin"],
          userId: "user_avery",
          workosUserId: "workos_avery",
        },
      },
    ],
    status: "CanLoadMore",
  });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

test("the supported Back Office organization detail route consumes the paginated member projection", () => {
  render(<LenderOrganizationDetailRoute />);

  expect(screen.getByText("Northstar Lending")).toBeTruthy();
  expect(screen.getByText("Avery Admin")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Load more members" }));
  expect(loadMore).toHaveBeenCalledWith(25);
});
