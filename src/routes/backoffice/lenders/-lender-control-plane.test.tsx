// @vitest-environment jsdom

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { getFunctionName } from "convex/server";
import { afterEach, beforeAll, beforeEach, describe, expect, test, vi } from "vitest";

const useActionMock = vi.hoisted(() => vi.fn());
const useMutationMock = vi.hoisted(() => vi.fn());
const usePaginatedQueryMock = vi.hoisted(() => vi.fn());
const useQueryMock = vi.hoisted(() => vi.fn());
const inviteLenderUser = vi.hoisted(() => vi.fn());
const assignLenderUser = vi.hoisted(() => vi.fn());
const updatePermissions = vi.hoisted(() => vi.fn());
const updateMembershipRoles = vi.hoisted(() => vi.fn());
const deactivateMembership = vi.hoisted(() => vi.fn());
const unassignLenderUser = vi.hoisted(() => vi.fn());
const saveDefaultReviewPolicy = vi.hoisted(() => vi.fn());
const toastError = vi.hoisted(() => vi.fn());
const toastSuccess = vi.hoisted(() => vi.fn());

vi.mock("@tanstack/react-router", () => ({
  Link: ({
    children,
    to,
  }: {
    children: React.ReactNode;
    to: string;
  }) => <a href={to}>{children}</a>,
  createFileRoute: () => (config: unknown) => config,
}));

vi.mock("convex/react", () => ({
  useAction: useActionMock,
  useMutation: useMutationMock,
  usePaginatedQuery: usePaginatedQueryMock,
  useQuery: useQueryMock,
}));

vi.mock("sonner", () => ({
  toast: { error: toastError, success: toastSuccess },
}));

import { Route } from "./index.tsx";

const LenderControlPlaneRoute = (
  Route as unknown as { component: () => React.ReactElement }
).component;

const organizationId = "lender_org_northstar";
const sharedWorkosOrganizationId = "org_fairlend_shared";
const membersResult = {
  members: [
    {
      assignmentId: "assignment_avery",
      assignmentStatus: "active",
      canMakeFinalDecision: true,
      email: "avery@northstar.test",
      membershipId: "membership_avery",
      membershipStatus: "active",
      name: "Avery Admin",
      roleSlugs: ["lender-admin"],
      userId: "user_avery",
      workosUserId: "workos_user_avery",
    },
  ],
  pendingInvitations: [
    {
      assignedAt: 1_725_000_000_000,
      assignmentId: "assignment_pending",
      email: "pending@northstar.test",
      status: "pending",
    },
  ],
};
const controlPlaneResult = {
  brokerages: [
    { displayName: "FairLend Brokerage", id: "brokerage_fairlend" },
  ],
  organizations: [
    {
      brokerageId: "brokerage_fairlend",
      brokerageName: "FairLend Brokerage",
      displayName: "Northstar Lending",
      id: organizationId,
      legalName: "Northstar Lending Corporation",
      memberCount: 1,
      pendingCount: 1,
      permissions: {
        drawDecisions: true,
        milestoneDecisions: true,
        proposalReview: true,
        siteVisitReview: true,
      },
      status: "active",
      updatedAt: 1_725_000_000_000,
    },
  ],
  sharedWorkosOrganizationId,
};
const unassignedResult = { users: [] };
const defaultReviewPolicyResult = {
  configuredAt: null,
  configuredByDisplayName: null,
  configuredByRole: null,
  configuredByWorkosUserId: null,
  eligibleCounts: { draw: 1, milestone: 1, proposalReview: 1 },
  lenderOrganizationId: organizationId,
  lenderOrganizationName: "Northstar Lending",
  policy: {
    drawApprovalMode: "backoffice_only" as const,
    drawLenderQuorum: null,
    milestoneApprovalMode: "backoffice_only" as const,
    milestoneLenderQuorum: null,
    milestoneReceiptInvoiceRequired: false,
    milestoneSiteVisitRequired: false,
  },
  policyVersionId: null,
  provenance: "system_baseline" as const,
  reason: null,
  validationIssue: null,
  version: null,
};
const eligibleUnassignedUser = {
  email: "casey@northstar.test",
  membershipId: "membership_casey",
  name: "Casey Reviewer",
  profilePictureUrl: undefined,
  roleSlugs: ["lender"],
  userId: "user_casey",
  workosUserId: "workos_user_casey",
};
let currentMembersResult = membersResult;
let currentDefaultReviewPolicy: typeof defaultReviewPolicyResult | undefined =
  defaultReviewPolicyResult;
let currentReconciliationProjection: null | {
  assignmentId: string;
  membershipId: string;
  membershipStatus: "active" | "deleted" | "inactive" | "pending";
  roleSlugs: string[];
  workosUserId: string;
} = null;
let currentUnassignedResult = unassignedResult;

beforeAll(() => {
  Object.defineProperty(window, "matchMedia", {
    value: (query: string) => ({
      addEventListener: () => undefined,
      addListener: () => undefined,
      dispatchEvent: () => false,
      matches: false,
      media: query,
      onchange: null,
      removeEventListener: () => undefined,
      removeListener: () => undefined,
    }),
  });
  class ResizeObserverStub {
    disconnect() {}
    observe() {}
    unobserve() {}
  }
  vi.stubGlobal("ResizeObserver", ResizeObserverStub);
  Object.defineProperty(Element.prototype, "getAnimations", {
    configurable: true,
    value: () => [],
  });
});

beforeEach(() => {
  assignLenderUser.mockResolvedValue(undefined);
  updatePermissions.mockResolvedValue(undefined);
  inviteLenderUser.mockResolvedValue({
    status: "accepted",
    sync: "waiting-for-webhook",
  });
  updateMembershipRoles.mockResolvedValue({
    status: "accepted",
    sync: "waiting-for-webhook",
  });
  deactivateMembership.mockResolvedValue({
    status: "accepted",
    sync: "waiting-for-webhook",
  });
  unassignLenderUser.mockResolvedValue(undefined);
  saveDefaultReviewPolicy.mockResolvedValue({ version: 1 });
  currentMembersResult = membersResult;
  currentDefaultReviewPolicy = defaultReviewPolicyResult;
  currentReconciliationProjection = null;
  currentUnassignedResult = unassignedResult;

  usePaginatedQueryMock.mockImplementation(
    (reference: Parameters<typeof getFunctionName>[0], args: unknown) => {
      const name = getFunctionName(reference);
      if (args === "skip") {
        return {
          isLoading: false,
          loadMore: vi.fn(),
          results: [],
          status: "LoadingFirstPage",
        };
      }
      if (name === "lenderOrganizations:listLenderOrganizations") {
        return {
          isLoading: false,
          loadMore: vi.fn(),
          results: controlPlaneResult.organizations,
          status: "Exhausted",
        };
      }
      if (
        name ===
        "lenderOrganizations:listLenderOrganizationMembersForAdmin"
      ) {
        return {
          isLoading: false,
          loadMore: vi.fn(),
          results: [
            ...currentMembersResult.members.map((member) => ({
              kind: "member",
              member,
            })),
            ...currentMembersResult.pendingInvitations.map(
              (pendingInvitation) => ({
                kind: "pending_invitation",
                pendingInvitation,
              })
            ),
          ],
          status: "Exhausted",
        };
      }
      throw new Error(`Unexpected paginated query ${name}`);
    }
  );

  useQueryMock.mockImplementation((reference: unknown, args: unknown) => {
    const name = getFunctionName(reference as never);
    if (args === "skip") {
      return undefined;
    }
    if (
      args &&
      typeof args === "object" &&
      "membershipId" in args
    ) {
      return currentReconciliationProjection;
    }
    if (
      name ===
      "lenderOrganizations:getLenderOrganizationDirectoryMetadata"
    ) {
      return {
        brokerages: controlPlaneResult.brokerages,
        sharedWorkosOrganizationId,
      };
    }
    if (
      name ===
      "lenderOrganizationReviewPolicies:getLenderOrganizationDefaultReviewPolicy"
    ) {
      return currentDefaultReviewPolicy;
    }
    return currentUnassignedResult;
  });

  useMutationMock.mockImplementation((reference: unknown) => {
    const name = getFunctionName(reference as never);
    if (name === "lenderOrganizations:assignLenderUser") {
      return assignLenderUser;
    }
    if (name === "lenderOrganizations:unassignLenderUser") {
      return unassignLenderUser;
    }
    if (
      name === "lenderOrganizations:updateLenderOrganizationPermissions"
    ) {
      return updatePermissions;
    }
    if (
      name ===
      "lenderOrganizationReviewPolicies:saveLenderOrganizationDefaultReviewPolicy"
    ) {
      return saveDefaultReviewPolicy;
    }
    return vi.fn().mockResolvedValue(undefined);
  });
  useActionMock.mockImplementation((reference: unknown) => {
    const name = getFunctionName(reference as never);
    if (name === "lenderOrganizations:inviteLenderUser") {
      return inviteLenderUser;
    }
    if (name === "workosManagement:updateSharedLenderMembershipRoles") {
      return updateMembershipRoles;
    }
    if (name === "workosManagement:deactivateSharedLenderMembership") {
      return deactivateMembership;
    }
    return vi.fn().mockRejectedValue(new Error(`Unexpected action ${name}`));
  });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("Back Office lender organization production route", () => {
  test("loads the next canonical organization page from the production directory", () => {
    const loadMore = vi.fn();
    usePaginatedQueryMock.mockReturnValue({
      isLoading: false,
      loadMore,
      results: controlPlaneResult.organizations,
      status: "CanLoadMore",
    });

    render(<LenderControlPlaneRoute />);

    fireEvent.click(
      screen.getByRole("button", { name: "Load more organizations" })
    );
    expect(loadMore).toHaveBeenCalledWith(5);
  });

  test("reaches the promoted Variant E directory with canonical scoped members", async () => {
    render(<LenderControlPlaneRoute />);

    fireEvent.click(
      screen.getByRole("button", { name: "Manage Northstar Lending" })
    );

    expect(
      await screen.findByRole("heading", {
        level: 2,
        name: "Organization members",
      })
    ).toBeTruthy();
    expect(screen.getByText("1 active · 1 pending")).toBeTruthy();
    expect(screen.getByRole("region", { name: "Shared user management directory" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "View Avery Admin" })).toBeTruthy();
    expect(screen.getByText("Lender Admin")).toBeTruthy();
    expect(screen.getByText("pending@northstar.test")).toBeTruthy();
    expect(screen.getByText("Waiting for WorkOS")).toBeTruthy();
    expect(screen.getByRole("button", { name: /Pending1/ })).toBeTruthy();
    expect(screen.queryByText(/Principal Broker/)).toBeNull();
    expect(screen.getByLabelText(/Policy audit reason/)).toBeTruthy();
    const proposalReviewToggle = screen.getByRole("button", {
      name: /Proposal reviewEnabled/,
    });
    expect(proposalReviewToggle.getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(proposalReviewToggle);
    expect(proposalReviewToggle.getAttribute("aria-pressed")).toBe("false");
  });

  test("routes review-requirements administration through the canonical proposal workflow", async () => {
    render(<LenderControlPlaneRoute />);

    fireEvent.click(
      screen.getByRole("button", { name: "Manage Northstar Lending" })
    );
    fireEvent.click(
      await screen.findByRole("button", { name: "View Avery Admin" })
    );
    fireEvent.click(
      await screen.findByRole("tab", { name: "Administration" })
    );

    const reviewRequirementsLink = screen.getByRole("link", {
      name: "Open Build policies",
    });
    expect(reviewRequirementsLink.getAttribute("href")).toBe(
      "/backoffice/proposals"
    );
  });

  test("reaches and saves the organization default editor from the authorized production route", async () => {
    render(<LenderControlPlaneRoute />);

    fireEvent.click(
      screen.getByRole("button", { name: "Manage Northstar Lending" })
    );

    expect(
      await screen.findByRole("heading", {
        level: 3,
        name: "Default review requirements",
      })
    ).toBeTruthy();
    expect(screen.getAllByText("System baseline").length).toBeGreaterThan(0);
    expect(screen.getByText("Milestone review")).toBeTruthy();
    expect(screen.getByText("Draw review")).toBeTruthy();

    fireEvent.click(screen.getAllByRole("radio", { name: /^Both/ })[0]);
    fireEvent.click(
      screen.getByRole("checkbox", { name: "Site visit required" })
    );
    fireEvent.change(screen.getByLabelText("Change reason"), {
      target: { value: "Require lender and site review for future assignments." },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Save new default version" })
    );

    await waitFor(() => expect(saveDefaultReviewPolicy).toHaveBeenCalledTimes(1));
    expect(saveDefaultReviewPolicy).toHaveBeenCalledWith({
      expectedVersion: null,
      idempotencyKey: expect.stringMatching(
        /^backoffice:lender-organization-review-default:/
      ),
      lenderOrganizationId: organizationId,
      policy: {
        drawApprovalMode: "backoffice_only",
        drawLenderQuorum: null,
        milestoneApprovalMode: "both",
        milestoneLenderQuorum: 1,
        milestoneReceiptInvoiceRequired: false,
        milestoneSiteVisitRequired: true,
      },
      reason: "Require lender and site review for future assignments.",
    });
  });

  test("shows the organization default loading state on the supported route", async () => {
    currentDefaultReviewPolicy = undefined;
    render(<LenderControlPlaneRoute />);

    fireEvent.click(
      screen.getByRole("button", { name: "Manage Northstar Lending" })
    );

    expect(
      await screen.findByLabelText("Loading default review requirements")
    ).toBeTruthy();
  });

  test("requires and forwards the operator-entered workflow policy audit reason", async () => {
    render(<LenderControlPlaneRoute />);
    fireEvent.click(
      screen.getByRole("button", { name: "Manage Northstar Lending" })
    );

    const reason = screen.getByLabelText(/Policy audit reason/);
    const save = screen.getByRole("button", { name: "Save policy" });
    expect(reason.getAttribute("required")).not.toBeNull();
    expect(reason.getAttribute("aria-required")).toBe("true");
    expect(reason.getAttribute("aria-describedby")).toBe(
      "lender-policy-audit-reason-hint"
    );
    expect(
      screen.getByText("Required. Explain why this workflow policy is changing.")
    ).toBeTruthy();
    expect((reason as HTMLTextAreaElement).value).toBe("");
    expect(save.hasAttribute("disabled")).toBe(true);
    fireEvent.click(save);
    expect(updatePermissions).not.toHaveBeenCalled();

    fireEvent.change(reason, {
      target: { value: "  Permit the lender team to review proposals.  " },
    });
    expect(save.hasAttribute("disabled")).toBe(false);
    fireEvent.click(save);

    await waitFor(() =>
      expect(updatePermissions).toHaveBeenCalledWith({
        lenderOrganizationId: organizationId,
        permissions: controlPlaneResult.organizations[0]?.permissions,
        reason: "Permit the lender team to review proposals.",
      })
    );
    expect((reason as HTMLTextAreaElement).value).toBe("");
    expect(save.hasAttribute("disabled")).toBe(true);
  });

  test("requires a reviewed audit reason from the unassigned-user queue", async () => {
    currentUnassignedResult = { users: [eligibleUnassignedUser] };
    render(<LenderControlPlaneRoute />);

    fireEvent.click(
      screen.getByRole("combobox", { name: "Assign casey@northstar.test" })
    );
    fireEvent.click(
      await screen.findByRole("option", { name: "Northstar Lending" })
    );
    fireEvent.click(screen.getByRole("button", { name: "Assign" }));

    const dialog = await screen.findByRole("dialog", {
      name: "Assign existing lender user",
    });
    const review = within(dialog).getByRole("button", {
      name: /Review assignment/,
    });
    expect(review.hasAttribute("disabled")).toBe(true);
    expect(assignLenderUser).not.toHaveBeenCalled();
    fireEvent.change(within(dialog).getByLabelText("Assignment audit reason"), {
      target: { value: "Assign Casey to the active external review team." },
    });
    fireEvent.click(review);
    expect(within(dialog).getByText("Ready to assign")).toBeTruthy();
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Confirm assignment" })
    );

    await waitFor(() =>
      expect(assignLenderUser).toHaveBeenCalledWith({
        lenderOrganizationId: organizationId,
        reason: "Assign Casey to the active external review team.",
        workosUserId: "workos_user_casey",
      })
    );
  });

  test("requires a reviewed audit reason from Add to organization", async () => {
    currentUnassignedResult = { users: [eligibleUnassignedUser] };
    render(<LenderControlPlaneRoute />);
    fireEvent.click(
      screen.getByRole("button", { name: "Manage Northstar Lending" })
    );

    const userSearch = screen.getByLabelText("Add an existing lender user");
    fireEvent.focus(userSearch);
    fireEvent.click(
      await screen.findByRole("option", { name: /Casey Reviewer/ })
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Add to organization" })
    );

    const dialog = await screen.findByRole("dialog", {
      name: "Assign existing lender user",
    });
    expect(
      within(dialog).getByRole("button", { name: /Review assignment/ })
        .hasAttribute("disabled")
    ).toBe(true);
    expect(assignLenderUser).not.toHaveBeenCalled();
    fireEvent.change(within(dialog).getByLabelText("Assignment audit reason"), {
      target: { value: "Add Casey for the assigned lender portfolio." },
    });
    fireEvent.click(
      within(dialog).getByRole("button", { name: /Review assignment/ })
    );
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Confirm assignment" })
    );

    await waitFor(() =>
      expect(assignLenderUser).toHaveBeenCalledWith({
        lenderOrganizationId: organizationId,
        reason: "Add Casey for the assigned lender portfolio.",
        workosUserId: "workos_user_casey",
      })
    );
  });

  test("keeps an accepted role change pending until the WorkOS projection reconciles", async () => {
    const { rerender } = render(<LenderControlPlaneRoute />);
    fireEvent.click(
      screen.getByRole("button", { name: "Manage Northstar Lending" })
    );
    fireEvent.click(
      await screen.findByRole("button", { name: "View Avery Admin" })
    );
    fireEvent.click(
      await screen.findByRole("tab", { name: "Administration" })
    );
    expect(screen.queryByRole("button", { name: /Transfer control/ })).toBeNull();
    fireEvent.click(
      screen.getByRole("button", { name: "Stage access change" })
    );
    fireEvent.change(screen.getByLabelText("Proposed lender role"), {
      target: { value: "lender-staff" },
    });
    fireEvent.change(screen.getByLabelText("Operational reason"), {
      target: { value: "Move to acknowledgement-only lender access" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Review draft/ }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm command" }));

    await waitFor(() =>
      expect(updateMembershipRoles).toHaveBeenCalledWith({
        lenderOrganizationId: organizationId,
        membershipId: "membership_avery",
        reason: "Move to acknowledgement-only lender access",
        roleSlug: "lender-staff",
      })
    );
    expect(inviteLenderUser).not.toHaveBeenCalled();
    expect(deactivateMembership).not.toHaveBeenCalled();
    expect(screen.getAllByText("Lender Admin").length).toBeGreaterThan(0);
    expect(
      screen.getAllByText("Waiting for WorkOS reconciliation").length
    ).toBeGreaterThan(0);
    expect(
      screen.getByRole("dialog", { name: "Change member access" })
    ).toBeTruthy();
    const dialogClose = screen.getByRole("button", { name: "Close status" });
    fireEvent.click(dialogClose);
    expect(
      screen.queryByRole("dialog", { name: "Change member access" })
    ).toBeNull();
    expect(screen.getByText("Waiting for WorkOS reconciliation")).toBeTruthy();
    expect(toastSuccess).not.toHaveBeenCalledWith(
      "Avery Admin access reconciled"
    );

    currentReconciliationProjection = {
      assignmentId: "assignment_avery",
      membershipId: "membership_avery",
      membershipStatus: "active",
      roleSlugs: ["lender-staff"],
      workosUserId: "workos_user_avery",
    };
    rerender(<LenderControlPlaneRoute />);
    await waitFor(() =>
      expect(screen.getAllByText("Avery Admin reconciled").length).toBeGreaterThan(0)
    );
    expect(toastSuccess).toHaveBeenCalledWith(
      "Avery Admin access reconciled"
    );
  });

  test("stages an exact-role invitation through the shared WorkOS organization", async () => {
    render(<LenderControlPlaneRoute />);
    fireEvent.click(
      screen.getByRole("button", { name: "Manage Northstar Lending" })
    );
    fireEvent.click(
      await screen.findByRole("button", { name: "Invite member" })
    );
    fireEvent.change(screen.getByLabelText("Member email"), {
      target: { value: "new.reviewer@northstar.test" },
    });
    fireEvent.change(screen.getByLabelText("Starting access"), {
      target: { value: "lender" },
    });
    fireEvent.change(screen.getByLabelText("Operational reason"), {
      target: { value: "Invite assigned proposal reviewer" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Review draft/ }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm command" }));

    await waitFor(() =>
      expect(inviteLenderUser).toHaveBeenCalledWith({
        email: "new.reviewer@northstar.test",
        lenderOrganizationId: organizationId,
        reason: "Invite assigned proposal reviewer",
        roleSlug: "lender",
      })
    );
    expect(updateMembershipRoles).not.toHaveBeenCalled();
  });

  test("waits for deactivation reconciliation before removing the scoped app assignment", async () => {
    const executionOrder: string[] = [];
    deactivateMembership.mockImplementation(async () => {
      executionOrder.push("workos");
      return { status: "accepted", sync: "waiting-for-webhook" };
    });
    unassignLenderUser.mockImplementation(async () => {
      executionOrder.push("assignment");
    });

    const { rerender } = render(<LenderControlPlaneRoute />);
    fireEvent.click(
      screen.getByRole("button", { name: "Manage Northstar Lending" })
    );
    fireEvent.click(
      await screen.findByRole("button", { name: "View Avery Admin" })
    );
    fireEvent.click(
      await screen.findByRole("tab", { name: "Administration" })
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Review deactivation" })
    );
    fireEvent.change(screen.getByLabelText("Operational reason"), {
      target: { value: "Remove access after lender departure" },
    });
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: /Review draft/ }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm command" }));

    await waitFor(() => expect(deactivateMembership).toHaveBeenCalledTimes(1));
    expect(deactivateMembership).toHaveBeenCalledWith({
      assignmentId: "assignment_avery",
      idempotencyKey: "lender-member-deactivate:assignment_avery",
      reason: "Remove access after lender departure",
    });
    expect(unassignLenderUser).not.toHaveBeenCalled();
    expect(executionOrder).toEqual(["workos"]);
    expect(
      screen.getAllByText("Waiting for WorkOS reconciliation").length
    ).toBeGreaterThan(0);

    currentReconciliationProjection = {
      assignmentId: "assignment_avery",
      membershipId: "membership_avery",
      membershipStatus: "inactive",
      roleSlugs: ["lender-admin"],
      workosUserId: "workos_user_avery",
    };
    rerender(<LenderControlPlaneRoute />);

    expect(unassignLenderUser).not.toHaveBeenCalled();
    expect(executionOrder).toEqual(["workos"]);
    await waitFor(() =>
      expect(screen.getAllByText("Avery Admin reconciled").length).toBeGreaterThan(0)
    );
  });

  test("keeps the projected role unchanged and reports a WorkOS command failure", async () => {
    updateMembershipRoles.mockRejectedValueOnce(
      new Error("WorkOS role update failed")
    );

    render(<LenderControlPlaneRoute />);
    fireEvent.click(
      screen.getByRole("button", { name: "Manage Northstar Lending" })
    );
    fireEvent.click(
      await screen.findByRole("button", { name: "View Avery Admin" })
    );
    fireEvent.click(
      await screen.findByRole("tab", { name: "Administration" })
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Stage access change" })
    );
    fireEvent.change(screen.getByLabelText("Proposed lender role"), {
      target: { value: "lender-staff" },
    });
    fireEvent.change(screen.getByLabelText("Operational reason"), {
      target: { value: "Attempt a scoped access update" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Review draft/ }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm command" }));

    await waitFor(() =>
      expect(toastError).toHaveBeenCalledWith("WorkOS role update failed")
    );
    expect(screen.getByRole("button", { name: "Confirm command" })).toBeTruthy();
    expect(screen.getAllByText("Lender Admin").length).toBeGreaterThan(0);
    expect(toastSuccess).not.toHaveBeenCalledWith(
      "Member access updated in WorkOS"
    );
  });
});
