// @vitest-environment jsdom

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import type React from "react";
import { afterEach, beforeAll, describe, expect, test, vi } from "vitest";

import { UserDetailSheet } from "./-user-management-detail-sheet";
import type { DirectoryUser } from "./-user-management-detail-sheet";
import { UserManagementSurface } from "./-user-management-surface";
import type {
  OrganizationProvisioning,
  UserManagementHandlers,
  UserManagementProjection,
  WorkosMembershipRow,
  WorkosOrganizationRow,
  WorkosUserRow,
} from "./-user-management-types";

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
    writable: true,
  });
  // Base UI overlays measure their popups; jsdom lacks ResizeObserver.
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
  // Base UI scroll-area schedules getAnimations() on a timer after unmount.
  if (!Element.prototype.getAnimations) {
    Element.prototype.getAnimations = () => [];
  }
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function noopHandlers(): UserManagementHandlers {
  return {
    onCreateMembership: vi.fn().mockResolvedValue(undefined),
    onInviteUser: vi.fn().mockResolvedValue(undefined),
    onLinkBuilderAccount: vi.fn().mockResolvedValue(undefined),
    onProvisionBrokerageProfile: vi.fn().mockResolvedValue(undefined),
    onProvisionBuilderProfile: vi.fn().mockResolvedValue(undefined),
    onProvisionFairLendBrokerage: vi.fn().mockResolvedValue(undefined),
    onReactivateMembership: vi.fn().mockResolvedValue(undefined),
    onRemoveMembership: vi.fn().mockResolvedValue(undefined),
    onRoleUpdate: vi.fn().mockResolvedValue(undefined),
    onSyncDirectory: vi.fn().mockResolvedValue(undefined),
    onUnlinkBuilderAccount: vi.fn().mockResolvedValue(undefined),
  };
}

const ORG_ALPHA: WorkosOrganizationRow = {
  name: "Alpha Lending",
  status: "active",
  workosOrganizationId: "org_alpha",
};
const ORG_BETA: WorkosOrganizationRow = {
  name: "Beta Builds",
  status: "active",
  workosOrganizationId: "org_beta",
};

function membership(
  overrides: Partial<WorkosMembershipRow> &
    Pick<WorkosMembershipRow, "workosMembershipId" | "workosOrganizationId">
): WorkosMembershipRow {
  return {
    roleSlug: "broker",
    roleSlugs: ["broker"],
    status: "active",
    workosUserId: "user_1",
    ...overrides,
  };
}

function directoryUser(memberships: WorkosMembershipRow[]): DirectoryUser {
  return {
    displayName: "River Han",
    initials: "RH",
    memberships,
    user: {
      email: "river@alpha.test",
      name: "River Han",
      status: "active",
      workosUserId: "user_1",
    } as unknown as WorkosUserRow,
  };
}

function orgMap(
  orgs: WorkosOrganizationRow[]
): Map<string, WorkosOrganizationRow> {
  return new Map(orgs.map((org) => [org.workosOrganizationId, org]));
}

function renderSheet(
  user: DirectoryUser,
  handlers: UserManagementHandlers,
  provisioning?: Map<string, OrganizationProvisioning>
) {
  return render(
    <UserDetailSheet
      directoryUser={user}
      handlers={handlers}
      onOpenChange={() => undefined}
      organizationsById={orgMap([ORG_ALPHA, ORG_BETA])}
      provisioningByOrg={provisioning ?? new Map()}
      roleOptions={["broker", "builder", "admin"]}
      workspaceOrganizations={[ORG_ALPHA, ORG_BETA]}
    />
  );
}

describe("UserDetailSheet role editor", () => {
  test("does not preselect admin when adding a new organization membership", () => {
    const user = directoryUser([
      membership({
        roleSlug: "broker",
        roleSlugs: ["broker"],
        workosMembershipId: "om_existing",
        workosOrganizationId: "org_alpha",
      }),
    ]);
    render(
      <UserDetailSheet
        directoryUser={user}
        handlers={noopHandlers()}
        onOpenChange={() => undefined}
        organizationsById={orgMap([ORG_ALPHA, ORG_BETA])}
        provisioningByOrg={new Map()}
        roleOptions={["admin", "broker", "builder"]}
        workspaceOrganizations={[ORG_ALPHA, ORG_BETA]}
      />
    );

    const addSection = screen
      .getByText("Add to organization")
      .closest("section");
    if (!addSection) {
      throw new Error("add membership section not found");
    }
    const addMembershipEditor = within(addSection as HTMLElement);

    expect(
      addMembershipEditor
        .getByRole("checkbox", { name: "admin" })
        .getAttribute("aria-checked")
    ).toBe("false");
    expect(
      addMembershipEditor
        .getByRole("checkbox", { name: "broker" })
        .getAttribute("aria-checked")
    ).toBe("false");
    expect(
      addMembershipEditor
        .getByRole("checkbox", { name: "builder" })
        .getAttribute("aria-checked")
    ).toBe("false");
    expect(
      addMembershipEditor
        .getByRole("combobox", { name: "Primary role" })
        .hasAttribute("disabled")
    ).toBe(true);
    expect(
      addMembershipEditor
        .getByRole("button", { name: "Add membership" })
        .hasAttribute("disabled")
    ).toBe(true);
  });

  test("renders a unique Primary-role control id per membership", () => {
    const user = directoryUser([
      membership({
        workosMembershipId: "om_1",
        workosOrganizationId: "org_alpha",
      }),
      membership({
        workosMembershipId: "om_2",
        workosOrganizationId: "org_beta",
      }),
    ]);
    renderSheet(user, noopHandlers());

    const primarySelects = screen.getAllByRole("combobox", {
      name: "Primary role",
    });
    expect(primarySelects).toHaveLength(2);
    const ids = primarySelects.map((node) => node.getAttribute("id"));
    expect(ids[0]).toBeTruthy();
    expect(new Set(ids).size).toBe(ids.length);

    // Each id is backed by exactly one element (no duplicate-id collisions).
    for (const id of ids) {
      expect(
        document.querySelectorAll(`[id="${id ?? ""}"]`)
      ).toHaveLength(1);
      // The matching label points at that same control.
      expect(document.querySelector(`label[for="${id ?? ""}"]`)).toBeTruthy();
    }
  });

  test("resets local role draft when the membership's confirmed roles change", () => {
    const baseMembership = membership({
      roleSlug: "broker",
      roleSlugs: ["broker"],
      workosMembershipId: "om_sync",
      workosOrganizationId: "org_alpha",
    });
    const { rerender } = renderSheet(
      directoryUser([baseMembership]),
      noopHandlers()
    );

    // Scope to the membership card (Alpha Lending), not the "Add to
    // organization" editor which also lists an admin option.
    const card = screen.getByText("Alpha Lending").closest("div.flex-col");
    if (!card) {
      throw new Error("membership card not found");
    }
    const adminCheckbox = () =>
      within(card as HTMLElement).getByRole("checkbox", { name: "admin" });
    expect(adminCheckbox().getAttribute("aria-checked")).toBe("false");

    // Server confirms an update that added the admin role to this membership.
    rerender(
      <UserDetailSheet
        directoryUser={directoryUser([
          {
            ...baseMembership,
            roleSlug: "admin",
            roleSlugs: ["broker", "admin"],
          },
        ])}
        handlers={noopHandlers()}
        onOpenChange={() => undefined}
        organizationsById={orgMap([ORG_ALPHA, ORG_BETA])}
        provisioningByOrg={new Map()}
        roleOptions={["broker", "builder", "admin"]}
        workspaceOrganizations={[ORG_ALPHA, ORG_BETA]}
      />
    );

    expect(adminCheckbox().getAttribute("aria-checked")).toBe("true");
  });
});

describe("UserDetailSheet destructive actions", () => {
  test("Remove membership requires explicit confirmation", async () => {
    const handlers = noopHandlers();
    const user = directoryUser([
      membership({
        workosMembershipId: "om_remove",
        workosOrganizationId: "org_alpha",
      }),
    ]);
    renderSheet(user, handlers);

    fireEvent.click(screen.getByRole("button", { name: "Remove" }));
    expect(handlers.onRemoveMembership).not.toHaveBeenCalled();

    const dialog = await screen.findByRole("alertdialog");
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Remove membership" })
    );

    await waitFor(() => {
      expect(handlers.onRemoveMembership).toHaveBeenCalledWith("om_remove");
    });
  });

  test("cancelling the confirm dialog does not remove the membership", async () => {
    const handlers = noopHandlers();
    const user = directoryUser([
      membership({
        workosMembershipId: "om_keep",
        workosOrganizationId: "org_alpha",
      }),
    ]);
    renderSheet(user, handlers);

    fireEvent.click(screen.getByRole("button", { name: "Remove" }));
    const dialog = await screen.findByRole("alertdialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));

    await waitFor(() => {
      expect(screen.queryByRole("alertdialog")).toBeNull();
    });
    expect(handlers.onRemoveMembership).not.toHaveBeenCalled();
  });
});

describe("UserManagementSurface directory rows", () => {
  function renderSurface(
    handlers: UserManagementHandlers,
    overrides?: {
      brokerageProvisioning?: React.ComponentProps<
        typeof UserManagementSurface
      >["brokerageProvisioning"];
      projections?: UserManagementProjection;
    }
  ) {
    const projections =
      overrides?.projections ??
      ({
        memberships: [
          {
            roleSlug: "broker",
            roleSlugs: ["broker"],
          status: "active",
          workosMembershipId: "om_alpha",
          workosOrganizationId: "org_alpha",
          workosUserId: "user_1",
        },
      ],
      organizationRoles: [],
      organizations: [ORG_ALPHA],
      permissions: [],
      roles: [{ name: "Broker", slug: "broker", status: "active" }],
      users: [
        {
          email: "river@alpha.test",
          name: "River Han",
          status: "active",
          workosUserId: "user_1",
        },
      ],
      } as unknown as UserManagementProjection);
    return render(
      <UserManagementSurface
        accepted={null}
        actionError={null}
        brokerageProvisioning={overrides?.brokerageProvisioning}
        projections={projections}
        setAccepted={() => undefined}
        setActionError={() => undefined}
        syncStatus={{ receipts: [] } as never}
        {...handlers}
      />
    );
  }

  test("exposes each person as an accessible button that opens the detail sheet", async () => {
    const handlers = noopHandlers();
    renderSurface(handlers);

    const trigger = screen.getByRole("button", { name: "Manage River Han" });
    expect(trigger).toBeTruthy();

    fireEvent.click(trigger);

    // The detail sheet mounts with the person's identity.
    await waitFor(() => {
      expect(screen.getByRole("dialog")).toBeTruthy();
    });
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText("River Han")).toBeTruthy();
  });

  test("orders attention rows first and supports profile and organization filters", async () => {
    const handlers = noopHandlers();
    renderSurface(handlers, {
      brokerageProvisioning: {
        fairLendBootstrap: {
          displayName: "FairLendBrokerage",
          principalBrokerWorkosUserId: "user_admin",
          workosOrganizationId: "org_alpha",
        },
        organizations: [
          {
            brokerage: {
              _id: "brokerage_alpha",
              displayName: "Alpha Lending",
              legalName: "Alpha Lending",
              principalBrokerWorkosUserId: "user_1",
              status: "active",
            },
            brokerMemberships: [
              {
                email: "alex@alpha.test",
                name: "Alex Broker",
                roleSlugs: ["broker"],
                workosMembershipId: "om_alpha",
                workosUserId: "user_1",
              },
            ],
            builderAccountLinks: [],
            builderMemberships: [],
            builderProfile: null,
            hasBrokerageProfile: true,
            hasBuilderProfile: false,
            name: "Alpha Lending",
            needsBrokerageProfile: false,
            needsBuilderProfile: false,
            status: "active",
            workosOrganizationId: "org_alpha",
          },
          {
            brokerage: null,
            brokerMemberships: [],
            builderAccountLinks: [],
            builderMemberships: [
              {
                email: "brooke@beta.test",
                name: "Brooke Builder",
                roleSlugs: ["builder"],
                workosMembershipId: "om_beta",
                workosUserId: "user_2",
              },
            ],
            builderProfile: null,
            hasBrokerageProfile: false,
            hasBuilderProfile: false,
            name: "Beta Builds",
            needsBrokerageProfile: false,
            needsBuilderProfile: true,
            status: "active",
            workosOrganizationId: "org_beta",
          },
        ],
      },
      projections: {
        memberships: [
          {
            roleSlug: "broker",
            roleSlugs: ["broker"],
            status: "active",
            workosMembershipId: "om_alpha",
            workosOrganizationId: "org_alpha",
            workosUserId: "user_1",
          },
          {
            roleSlug: "builder",
            roleSlugs: ["builder"],
            status: "active",
            workosMembershipId: "om_beta",
            workosOrganizationId: "org_beta",
            workosUserId: "user_2",
          },
        ],
        organizationRoles: [],
        organizations: [ORG_ALPHA, ORG_BETA],
        permissions: [],
        roles: [
          { name: "Broker", slug: "broker", status: "active" },
          { name: "Builder", slug: "builder", status: "active" },
        ],
        users: [
          {
            email: "alex@alpha.test",
            name: "Alex Broker",
            status: "active",
            workosUserId: "user_1",
          } as unknown as WorkosUserRow,
          {
            email: "brooke@beta.test",
            name: "Brooke Builder",
            status: "active",
            workosUserId: "user_2",
          } as unknown as WorkosUserRow,
        ],
      } as unknown as UserManagementProjection,
    });

    const table = screen.getByRole("table");
    expect(
      within(table)
        .getAllByRole("button", { name: /^Manage / })
        .map((button) => button.textContent)
    ).toEqual(["Brooke Builder", "Alex Broker"]);

    fireEvent.change(screen.getByLabelText("Order filter"), {
      target: { value: "name-asc" },
    });
    expect(
      within(table)
        .getAllByRole("button", { name: /^Manage / })
        .map((button) => button.textContent)
    ).toEqual(["Alex Broker", "Brooke Builder"]);

    fireEvent.change(screen.getByLabelText("Profile filter"), {
      target: { value: "missing" },
    });
    expect(within(table).getByText("Brooke Builder")).toBeTruthy();
    expect(within(table).queryByText("Alex Broker")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Clear filters" }));
    fireEvent.change(screen.getByLabelText("Org filter"), {
      target: { value: "org_alpha" },
    });
    expect(within(table).getByText("Alex Broker")).toBeTruthy();
    expect(within(table).queryByText("Brooke Builder")).toBeNull();
  });
});
