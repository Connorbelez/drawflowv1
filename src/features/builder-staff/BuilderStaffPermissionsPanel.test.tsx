// @vitest-environment jsdom

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, test, vi } from "vitest";

import { BuilderStaffPermissionsPanel } from "./BuilderStaffPermissionsPanel";

const convexHooks = vi.hoisted(() => ({
  useAction: vi.fn(),
  useMutation: vi.fn(),
  useQuery: vi.fn(),
}));

vi.mock("convex/react", () => convexHooks);

const toast = vi.hoisted(() => ({
  error: vi.fn(),
  success: vi.fn(),
}));

vi.mock("sonner", () => ({ toast }));

beforeAll(() => {
  if (!("ResizeObserver" in globalThis)) {
    (globalThis as { ResizeObserver?: unknown }).ResizeObserver = class {
      disconnect() {
        return undefined;
      }
      observe() {
        return undefined;
      }
      unobserve() {
        return undefined;
      }
    };
  }
  if (!Element.prototype.getAnimations) {
    Element.prototype.getAnimations = () => [];
  }
});

afterEach(() => {
  cleanup();
  document.body.removeAttribute("style");
  vi.clearAllMocks();
});

const resources = [
  "milestone",
  "submilestone",
  "draw",
  "evidence",
  "contractor",
  "material",
  "capitalEvent",
  "reminder",
] as const;

const directory = {
  actions: ["view", "create", "update", "delete"],
  canManage: true,
  resources,
  scope: "proposal",
  staff: [
    {
      builderAccountLinkId: "link_owner",
      email: "owner@example.com",
      identityStatus: "active",
      mode: "full",
      name: "Owner Builder",
      permissions: resources.map((resourceType) => ({
        canCreate: true,
        canDelete: true,
        canUpdate: true,
        canView: true,
        resourceType,
      })),
      role: "owner",
      status: "active",
      workosMembershipId: "om_owner",
      workosUserId: "user_owner",
    },
    {
      builderAccountLinkId: "link_staff",
      email: "staff@example.com",
      identityStatus: "active",
      mode: "limited",
      name: "Staff Builder",
      permissions: resources.map((resourceType) => ({
        canCreate: false,
        canDelete: false,
        canUpdate: false,
        canView: resourceType === "milestone",
        resourceType,
      })),
      role: "staff",
      status: "active",
      workosMembershipId: "om_staff",
      workosUserId: "user_staff",
    },
  ],
};

function renderPanel(directoryOverride: typeof directory = directory) {
  const saveProposal = vi.fn().mockResolvedValue(null);
  const saveActiveBuild = vi.fn().mockResolvedValue(null);
  const removeProposal = vi.fn().mockResolvedValue(null);
  const removeActiveBuild = vi.fn().mockResolvedValue(null);
  const provisionProposal = vi.fn().mockResolvedValue({
    provisioning: {
      adapter: "fake",
      membershipId: "om_new",
      operation: "provisionBuilderStaffUser",
      status: "accepted",
      sync: "waiting-for-webhook",
      userId: "user_new",
    },
    staffWorkosUserId: "user_new",
    workosMembershipId: "om_new",
  });
  const provisionActiveBuild = vi.fn().mockResolvedValue(null);

  const mutations = [
    saveProposal,
    saveActiveBuild,
    removeProposal,
    removeActiveBuild,
  ];
  const actions = [provisionProposal, provisionActiveBuild];
  let mutationIndex = 0;
  let actionIndex = 0;

  convexHooks.useQuery.mockReturnValue(directoryOverride);
  convexHooks.useMutation.mockImplementation(
    () => mutations[mutationIndex++ % mutations.length],
  );
  convexHooks.useAction.mockImplementation(
    () => actions[actionIndex++ % actions.length],
  );

  render(
    <BuilderStaffPermissionsPanel
      proposalId={"proposal_test" as never}
      scope="proposal"
      workosOrganizationId="org_test"
    />,
  );

  return {
    provisionProposal,
    removeProposal,
    saveProposal,
  };
}

describe("BuilderStaffPermissionsPanel", () => {
  test("provisions an email through the builder-staff action", async () => {
    const { provisionProposal } = renderPanel();

    fireEvent.change(screen.getByLabelText("Staff email"), {
      target: { value: "new.staff@example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add staff" }));

    await waitFor(() =>
      expect(provisionProposal).toHaveBeenCalledWith({
        permissions: resources.map((resourceType) => ({
          canCreate: false,
          canDelete: false,
          canUpdate: false,
          canView: true,
          resourceType,
        })),
        proposalId: "proposal_test",
        staffEmail: "new.staff@example.com",
        workosOrganizationId: "org_test",
      }),
    );
    expect(toast.success).toHaveBeenCalledWith("Builder staff member added.");
  });

  test("requires confirmation before removing selected staff", async () => {
    const { removeProposal } = renderPanel();

    fireEvent.click(screen.getByRole("button", { name: "Remove staff" }));
    const dialog = await screen.findByRole("alertdialog");
    expect(
      within(dialog).getByText("Remove builder staff access?"),
    ).toBeTruthy();

    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(removeProposal).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());

    fireEvent.click(screen.getByRole("button", { name: "Remove staff" }));
    const reopenedDialog = await screen.findByRole("alertdialog");
    fireEvent.click(
      within(reopenedDialog).getByRole("button", { name: "Remove staff" }),
    );

    await waitFor(() =>
      expect(removeProposal).toHaveBeenCalledWith({
        proposalId: "proposal_test",
        staffWorkosUserId: "user_staff",
        workosOrganizationId: "org_test",
      }),
    );
    expect(toast.success).toHaveBeenCalledWith("Builder staff member removed.");
  });

  test("resends a pending staff invite with current permissions", async () => {
    const pendingDirectory = {
      ...directory,
      staff: directory.staff.map((member) =>
        member.role === "staff"
          ? { ...member, identityStatus: "pending" as const }
          : member,
      ),
    };
    const { provisionProposal } = renderPanel(pendingDirectory);

    fireEvent.click(screen.getByRole("button", { name: "Resend invite" }));

    await waitFor(() =>
      expect(provisionProposal).toHaveBeenCalledWith({
        permissions: resources.map((resourceType) => ({
          canCreate: false,
          canDelete: false,
          canUpdate: false,
          canView: resourceType === "milestone",
          resourceType,
        })),
        proposalId: "proposal_test",
        staffEmail: "staff@example.com",
        workosOrganizationId: "org_test",
      }),
    );
    expect(toast.success).toHaveBeenCalledWith("Builder staff invite resent.");
  });
});
