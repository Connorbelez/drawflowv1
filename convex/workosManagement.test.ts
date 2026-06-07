/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";

import { api } from "./_generated/api";
import schema from "./schema";
import { buildWorkosMembershipRolesPayload } from "./workosManagement";

const modules = import.meta.glob("./**/*.ts");

function adminTest() {
  return convexTest(schema, modules).withIdentity({
    email: "admin@example.com",
    name: "Admin",
    role: "admin",
    roles: ["admin"],
    subject: "user_admin",
    tokenIdentifier: "https://api.workos.com/|user_admin",
  } as any);
}

describe("WorkOS management actions", () => {
  test("sends either roleSlugs or roleSlug to WorkOS membership writes, never both", () => {
    expect(
      buildWorkosMembershipRolesPayload({
        primaryRoleSlug: "builder",
        roleSlugs: ["builder"],
      })
    ).toEqual({ roleSlugs: ["builder"] });
    expect(
      buildWorkosMembershipRolesPayload({
        primaryRoleSlug: "broker",
        roleSlugs: ["broker", "builder"],
      })
    ).toEqual({ roleSlugs: ["broker", "builder"] });
    expect(
      buildWorkosMembershipRolesPayload({
        primaryRoleSlug: "builder",
        roleSlugs: [],
      })
    ).toEqual({ roleSlug: "builder" });
  });

  test("uses fake adapters in tests and returns waiting-for-sync accepted results", async () => {
    const t = adminTest();

    await expect(
      t.action(api.workosManagement.inviteUser, {
        email: "new.builder@example.com",
        organizationId: "org_fixture",
        roleSlug: "builder",
      })
    ).resolves.toMatchObject({
      adapter: "fake",
      operation: "inviteUser",
      status: "accepted",
      sync: "waiting-for-webhook",
    });

    await expect(
      t.action(api.workosManagement.updateMembershipRoles, {
        membershipId: "om_fixture",
        primaryRoleSlug: "broker",
        roleSlugs: ["broker", "builder"],
      })
    ).resolves.toMatchObject({
      adapter: "fake",
      operation: "updateMembershipRoles",
      status: "accepted",
    });

    await expect(
      t.action(api.workosManagement.createMembership, {
        organizationId: "org_fixture",
        primaryRoleSlug: "builder",
        roleSlugs: ["builder"],
        userId: "user_unassigned",
      })
    ).resolves.toMatchObject({
      adapter: "fake",
      operation: "createMembership",
      status: "accepted",
    });

    await expect(
      t.action(api.workosManagement.removeMembership, {
        membershipId: "om_fixture",
      })
    ).resolves.toMatchObject({
      adapter: "fake",
      operation: "removeMembership",
      status: "accepted",
    });

    await expect(
      t.query(api.workosProjection.listUserManagement, {})
    ).resolves.toMatchObject({
      memberships: [],
      organizations: [],
      users: [],
    });
  });

  test("admin can backfill WorkOS projections when webhooks missed existing records", async () => {
    const t = adminTest();

    const result = await t.action(api.workosManagement.syncWorkosDirectory, {});

    expect(result).toMatchObject({
      adapter: "fake",
      operation: "syncWorkosDirectory",
      status: "synced",
      counts: {
        memberships: 1,
        organizationRoles: 1,
        organizations: 1,
        permissions: 1,
        roles: 2,
        users: 2,
      },
    });

    const projections = await t.query(api.workosProjection.listUserManagement, {});
    expect(projections.organizations).toEqual([
      expect.objectContaining({
        name: "FairLend",
        status: "active",
        workosOrganizationId: "org_fixture",
      }),
    ]);
    expect(projections.memberships).toEqual([
      expect.objectContaining({
        roleSlug: "admin",
        status: "active",
        workosMembershipId: "om_fixture",
        workosOrganizationId: "org_fixture",
        workosUserId: "user_admin",
      }),
    ]);
    expect(projections.users).toEqual([
      expect.objectContaining({
        roleSlugs: ["admin"],
        roles: "admin",
        workosUserId: "user_admin",
      }),
      expect.objectContaining({
        roleSlugs: [],
        roles: "",
        workosUserId: "user_unassigned",
      }),
    ]);
    expect(projections.roles).toEqual([
      expect.objectContaining({ slug: "admin" }),
      expect.objectContaining({ slug: "builder" }),
    ]);
    expect(projections.organizationRoles).toEqual([
      expect.objectContaining({
        slug: "admin",
        workosOrganizationId: "org_fixture",
      }),
    ]);
    expect(projections.permissions).toEqual([
      expect.objectContaining({
        slug: "widgets:users-table:manage",
      }),
    ]);
  });

  test("requires user-management write capability for WorkOS-owned writes", async () => {
    const t = convexTest(schema, modules).withIdentity({
      email: "builder@example.com",
      name: "Builder",
      role: "builder",
      roles: ["builder"],
      subject: "user_builder",
      tokenIdentifier: "https://api.workos.com/|user_builder",
    } as any);

    await expect(
      t.action(api.workosManagement.deactivateMembership, {
        membershipId: "om_fixture",
      })
    ).rejects.toThrow(/Forbidden: userManagementWrite/);
  });
});
