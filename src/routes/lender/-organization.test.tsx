// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";

const useQueryMock = vi.hoisted(() => vi.fn());
const usePaginatedQueryMock = vi.hoisted(() => vi.fn());
const useMutationMock = vi.hoisted(() => vi.fn(() => vi.fn()));
const useActionMock = vi.hoisted(() => vi.fn(() => vi.fn()));

vi.mock("convex/react", () => ({
  useAction: useActionMock,
  useMutation: useMutationMock,
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

function mockAssignedOrganization(canManageMembers: boolean) {
  useQueryMock.mockReturnValue({
    currentUser: {
      canManageMembers,
      email: "current@northstar.test",
      name: "Current Lender",
      workosUserId: "workos_current",
      roles: [canManageMembers ? "lender-admin" : "lender-staff"],
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
      sharedWorkosOrganizationId: "org_shared_lender",
    },
  });
  usePaginatedQueryMock.mockReturnValue({
    isLoading: false,
    loadMore: vi.fn(),
    results: [
      {
        assignmentId: "assignment_avery",
        assignmentStatus: "active",
        canMakeFinalDecision: true,
        canDeactivate: false,
        deactivationDisabledReason:
          "The last active Lender Admin cannot be deactivated.",
        decisionPermissions: {
          drawDecisions: true,
          milestoneDecisions: true,
          proposalReview: true,
        },
        decisionPermissionsVersion: 1,
        effectiveDecisionPermissions: {
          drawDecisions: true,
          milestoneDecisions: true,
          proposalReview: true,
        },
        email: "avery@northstar.test",
        membershipStatus: "active",
        membershipId: "membership_avery",
        name: "Avery Admin",
        roleSlugs: ["lender-admin"],
        userId: "user_avery",
        workosUserId: "workos_avery",
      },
    ],
    status: "Exhausted",
  });
}

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
        canManageMembers: false,
        email: "unassigned@lender.test",
        name: "Unassigned Lender",
        workosUserId: "workos_user_unassigned",
        roles: ["lender"],
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
        canManageMembers: true,
        email: "current@northstar.test",
        name: "Current Lender",
        workosUserId: "workos_current",
        roles: ["lender-admin"],
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
        sharedWorkosOrganizationId: "org_shared_lender",
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
          canDeactivate: false,
          deactivationDisabledReason: "The last active Lender Admin cannot be deactivated.",
          decisionPermissions: {
            drawDecisions: true,
            milestoneDecisions: true,
            proposalReview: true,
          },
          decisionPermissionsVersion: 1,
          effectiveDecisionPermissions: {
            drawDecisions: true,
            milestoneDecisions: true,
            proposalReview: true,
          },
          email: "avery@northstar.test",
          membershipStatus: "active",
          membershipId: "membership_avery",
          name: "Avery Admin",
          roleSlugs: ["lender-admin"],
          userId: "user_avery",
          workosUserId: "workos_avery",
        },
      ],
      status: "CanLoadMore",
    });

    render(<LenderOrganization />);

    expect(
      screen.getByRole("heading", { level: 1, name: "Northstar Lending" })
    ).toBeTruthy();
    expect(screen.getByText("Avery Admin")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Load more members" }));
    expect(loadMore).toHaveBeenCalledWith(25);
  });

  test("lets a lender admin review and save member grants while explaining deactivation safeguards", async () => {
    const updatePermissions = vi.fn().mockResolvedValue({});
    useMutationMock.mockReturnValue(updatePermissions);
    mockAssignedOrganization(true);

    render(<LenderOrganization />);
    fireEvent.click(screen.getByRole("button", { name: "View Avery Admin" }));

    const drawPermission = screen.getByRole("checkbox", {
      name: /Draw Request decisions/,
    });
    expect(drawPermission.getAttribute("aria-disabled")).not.toBe("true");
    fireEvent.click(drawPermission);
    fireEvent.change(screen.getByLabelText("Change reason"), {
      target: { value: "Remove Draw authority during coverage rotation." },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Review permission changes" }),
    );
    expect(screen.getByText(/Draw Request decisions: revoke/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Save permissions" }));
    await waitFor(() =>
      expect(updatePermissions).toHaveBeenCalledWith({
        assignmentId: "assignment_avery",
        expectedVersion: 1,
        permissions: {
          drawDecisions: false,
          milestoneDecisions: true,
          proposalReview: true,
        },
        reason: "Remove Draw authority during coverage rotation.",
      }),
    );

    fireEvent.click(screen.getByRole("tab", { name: "Administration" }));
    const deactivate = screen.getByRole("button", {
      name: "Review deactivation",
    });
    expect((deactivate as HTMLButtonElement).disabled).toBe(true);
    expect(
      screen.getByText("The last active Lender Admin cannot be deactivated."),
    ).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Invite member/i })).toBeNull();
  });

  test("keeps member operations read-only for lender staff", () => {
    mockAssignedOrganization(false);

    render(<LenderOrganization />);
    fireEvent.click(screen.getByRole("button", { name: "View Avery Admin" }));

    expect(
      screen
        .getByRole("checkbox", { name: /Proposal decisions/ })
        .getAttribute("aria-disabled"),
    ).toBe("true");
    expect(
      screen.getByText(
        "Your lender role can inspect assigned and effective permissions but cannot change them.",
      ),
    ).toBeTruthy();
    expect(screen.queryByRole("tab", { name: "Administration" })).toBeNull();
    expect(screen.queryByRole("button", { name: /Invite member/i })).toBeNull();
  });
});
