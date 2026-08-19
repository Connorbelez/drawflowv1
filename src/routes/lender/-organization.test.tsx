// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";

const useQueryMock = vi.hoisted(() => vi.fn());
const usePaginatedQueryMock = vi.hoisted(() => vi.fn());

vi.mock("convex/react", () => ({
  usePaginatedQuery: usePaginatedQueryMock,
  useQuery: useQueryMock,
}));

vi.mock("#/components/lender-shell.tsx", () => ({
  LenderShell: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="lender-shell">{children}</div>
  ),
}));

vi.mock("@tanstack/react-router", async () => {
  const actual = await vi.importActual<typeof import("@tanstack/react-router")>(
    "@tanstack/react-router"
  );
  return {
    ...actual,
    createFileRoute: () => (config: unknown) => config,
    redirect: (options: unknown) => {
      throw options;
    },
  };
});

import { Route } from "./organization.tsx";

const LenderOrganization = (
  Route as unknown as { component: () => React.ReactElement }
).component;

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("lender organization route authorization", () => {
  test.each(["admin", "lender", "lender-admin", "lender-staff"])(
    "allows an active-organization %s administrator",
    (role) => {
      expect(
        Route.beforeLoad?.({
          context: {
            organizationId: "org_lender",
            role,
            roles: [role],
            userId: "user_lender",
          },
          location: { pathname: "/lender/organization" },
        } as never)
      ).toEqual({ status: "allowed" });
    }
  );

  test.each([
    { organizationId: "org_lender", role: "principle-broker", userId: "user_broker" },
    { organizationId: undefined, role: "admin", userId: "user_admin" },
    { organizationId: undefined, role: undefined, userId: undefined },
  ])("fails closed for non-administration context %#", (context) => {
    expect(() =>
      Route.beforeLoad?.({
        context: { ...context, roles: context.role ? [context.role] : [] },
        location: { pathname: "/lender/organization" },
      } as never)
    ).toThrow();
  });

  test("renders the app-level contact-admin state without foreign directory data", () => {
    useQueryMock.mockReturnValue({
      currentUser: {
        email: "unassigned@lender.test",
        name: "Unassigned Lender",
        workosUserId: "workos_user_unassigned",
      },
      organization: null,
    });
    usePaginatedQueryMock.mockReturnValue({
      isLoading: false,
      loadMore: vi.fn(),
      results: [],
      status: "LoadingFirstPage",
    });

    render(<LenderOrganization />);

    expect(
      screen
        .getByRole("link", { name: "Contact DrawFlow admin" })
        .getAttribute("href")
    ).toBe(
      "mailto:support@fairlend.ca?subject=DrawFlow%20lender%20organization%20access"
    );
    expect(
      screen.getByText(
        "No organization directory or membership details are available until the assignment is active."
      )
    ).toBeTruthy();
    expect(screen.queryByText("Northstar Lending")).toBeNull();
    expect(screen.queryByText("Avery Admin")).toBeNull();
  });

  test("renders the authorized paginated member projection and exposes its continuation", () => {
    const loadMore = vi.fn();
    useQueryMock.mockReturnValue({
      currentUser: {
        email: "current@northstar.test",
        name: "Current Lender",
        workosUserId: "workos_current",
      },
      organization: {
        brokerageId: "brokerage_northstar",
        brokerageName: "Northstar Brokerage",
        displayName: "Northstar Lending",
        id: "lender_org_northstar",
        legalName: "Northstar Lending Inc.",
        permissions: {
          drawDecisions: true,
          milestoneDecisions: true,
          proposalReview: true,
          siteVisitReview: true,
        },
        status: "active",
      },
    });
    usePaginatedQueryMock.mockReturnValue({
      isLoading: false,
      loadMore,
      results: [
        {
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
      ],
      status: "CanLoadMore",
    });

    render(<LenderOrganization />);

    expect(screen.getByText("Northstar Lending")).toBeTruthy();
    expect(screen.getByText("Avery Admin")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Load more members" }));
    expect(loadMore).toHaveBeenCalledWith(25);
  });
});
