/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";

import { api } from "./_generated/api";
import schema from "./schema";
import {
  buildWorkosMembershipRolesPayload,
  isWorkosConflict,
  provisionBuilderStaffUserWithWorkos,
} from "./workosManagement";

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

function principalBrokerTest() {
  return convexTest(schema, modules).withIdentity({
    email: "principal@example.com",
    name: "Principal Broker",
    organizationId: "org_fixture",
    role: "principle-broker",
    roles: ["principle-broker"],
    subject: "user_principal",
    tokenIdentifier: "https://api.workos.com/|user_principal",
  } as any);
}

async function seedScopedWorkosProjectionState(t: any) {
  await t.run(async (ctx: any) => {
    await ctx.db.insert("workosOrganizations", {
      domains: [],
      name: "FairLend",
      sourceEventId: "seed_org_fixture",
      sourceEventType: "organization.created",
      status: "active",
      workosOrganizationId: "org_fixture",
    });
    await ctx.db.insert("workosOrganizations", {
      domains: [],
      name: "Oakline Builds",
      sourceEventId: "seed_org_foreign",
      sourceEventType: "organization.created",
      status: "active",
      workosOrganizationId: "org_foreign",
    });
    await ctx.db.insert("workosOrganizationMemberships", {
      roleSlug: "principle-broker",
      roleSlugs: ["principle-broker"],
      sourceEventId: "seed_membership_principal",
      sourceEventType: "organization_membership.created",
      status: "active",
      workosMembershipId: "om_principal_fixture",
      workosOrganizationId: "org_fixture",
      workosUserId: "user_principal",
    });
    await ctx.db.insert("workosOrganizationMemberships", {
      roleSlug: "builder",
      roleSlugs: ["builder"],
      sourceEventId: "seed_membership_foreign",
      sourceEventType: "organization_membership.created",
      status: "active",
      workosMembershipId: "om_foreign",
      workosOrganizationId: "org_foreign",
      workosUserId: "user_foreign",
    });
  });
}

describe("WorkOS management actions", () => {
  test("orders multi-role membership writes by selected primary role", () => {
    expect(
      buildWorkosMembershipRolesPayload({
        primaryRoleSlug: "builder",
        roleSlugs: ["builder"],
      })
    ).toEqual({ roleSlugs: ["builder"] });
    expect(
      buildWorkosMembershipRolesPayload({
        primaryRoleSlug: "broker",
        roleSlugs: ["builder", "broker"],
      })
    ).toEqual({ roleSlugs: ["broker", "builder"] });
    expect(
      buildWorkosMembershipRolesPayload({
        primaryRoleSlug: "builder",
        roleSlugs: [],
      })
    ).toEqual({ roleSlug: "builder" });
  });

  test("projects accepted WorkOS role changes immediately", async () => {
    const t = adminTest();
    await seedScopedWorkosProjectionState(t);

    await t.action(api.workosManagement.updateMembershipRoles, {
      membershipId: "om_principal_fixture",
      primaryRoleSlug: "broker",
      roleSlugs: ["admin", "broker"],
    });

    const projections = await t.query(
      api.workosProjection.listUserManagement,
      {},
    );
    expect(projections.memberships).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          roleSlug: "broker",
          roleSlugs: ["broker", "admin"],
          sourceEventType: "organization_membership.updated",
          workosMembershipId: "om_principal_fixture",
        }),
      ]),
    );
  });

  test("treats existing organization-member invitation failures as idempotent conflicts", () => {
    expect(isWorkosConflict({ status: 409 })).toBe(true);
    expect(
      isWorkosConflict(
        new Error("Uncaught GenericServerException: User already a member of organization."),
      ),
    ).toBe(true);
    expect(
      isWorkosConflict(
        new Error("Uncaught GenericServerException: Email already invited to organization."),
      ),
    ).toBe(true);
    expect(isWorkosConflict(new Error("WorkOS invitation failed."))).toBe(false);
  });

  test("sends builder-staff invitation before direct membership provisioning", async () => {
    const calls: string[] = [];
    const workos = {
      userManagement: {
        sendInvitation: async (payload: any) => {
          calls.push(`sendInvitation:${payload.email}:${payload.roleSlug}`);
          return { id: "inv_builder_staff" };
        },
        listUsers: async (payload: any) => {
          calls.push(`listUsers:${payload.email}`);
          return { autoPagination: async () => [] };
        },
        createUser: async (payload: any) => {
          calls.push(`createUser:${payload.email}`);
          return { email: payload.email, id: "user_builder_staff" };
        },
        listOrganizationMemberships: async (payload: any) => {
          calls.push(
            `listOrganizationMemberships:${payload.organizationId}:${payload.userId}`,
          );
          return { autoPagination: async () => [] };
        },
        createOrganizationMembership: async (payload: any) => {
          calls.push(
            `createOrganizationMembership:${payload.organizationId}:${payload.userId}:${payload.roleSlugs.join(",")}`,
          );
          return { id: "om_builder_staff" };
        },
      },
    };

    const result = await provisionBuilderStaffUserWithWorkos(workos as any, {
      email: "Builder.Staff@Example.com",
      organizationId: "org_builder",
    });

    expect(calls).toEqual([
      "sendInvitation:builder.staff@example.com:builder-staff",
      "listUsers:builder.staff@example.com",
      "createUser:builder.staff@example.com",
      "listOrganizationMemberships:org_builder:user_builder_staff",
      "createOrganizationMembership:org_builder:user_builder_staff:builder-staff",
    ]);
    expect(result).toMatchObject({
      adapter: "workos",
      invitationId: "inv_builder_staff",
      membershipId: "om_builder_staff",
      operation: "provisionBuilderStaffUser",
      status: "accepted",
      sync: "waiting-for-webhook",
      userId: "user_builder_staff",
    });
  });

  test("resends a pending builder-staff invitation when WorkOS reports an existing member", async () => {
    const calls: string[] = [];
    const workos = {
      userManagement: {
        sendInvitation: async (payload: any) => {
          calls.push(`sendInvitation:${payload.email}:${payload.roleSlug}`);
          throw new Error("User already a member of organization.");
        },
        listInvitations: async (payload: any) => {
          calls.push(`listInvitations:${payload.email}:${payload.organizationId}`);
          return {
            autoPagination: async () => [
              {
                createdAt: "2026-06-07T10:00:00.000Z",
                id: "inv_pending_old",
                state: "pending",
              },
              {
                createdAt: "2026-06-07T12:00:00.000Z",
                id: "inv_pending_new",
                state: "pending",
              },
            ],
          };
        },
        resendInvitation: async (invitationId: string) => {
          calls.push(`resendInvitation:${invitationId}`);
          return { id: invitationId };
        },
        listUsers: async (payload: any) => {
          calls.push(`listUsers:${payload.email}`);
          return {
            autoPagination: async () => [
              { email: "existing.staff@example.com", id: "user_existing_staff" },
            ],
          };
        },
        listOrganizationMemberships: async (payload: any) => {
          calls.push(
            `listOrganizationMemberships:${payload.organizationId}:${payload.userId}`,
          );
          return {
            autoPagination: async () => [
              {
                id: "om_existing_staff",
                role: { slug: "member" },
                roles: [{ slug: "member" }],
                status: "active",
              },
            ],
          };
        },
        updateOrganizationMembership: async (membershipId: string, payload: any) => {
          calls.push(
            `updateOrganizationMembership:${membershipId}:${payload.roleSlugs.join(",")}`,
          );
          return { id: membershipId };
        },
      },
    };

    const result = await provisionBuilderStaffUserWithWorkos(workos as any, {
      email: "existing.staff@example.com",
      organizationId: "org_builder",
    });

    expect(calls).toEqual([
      "sendInvitation:existing.staff@example.com:builder-staff",
      "listInvitations:existing.staff@example.com:org_builder",
      "resendInvitation:inv_pending_new",
      "listUsers:existing.staff@example.com",
      "listOrganizationMemberships:org_builder:user_existing_staff",
      "updateOrganizationMembership:om_existing_staff:member,builder-staff",
    ]);
    expect(result).toMatchObject({
      invitationId: "inv_pending_new",
      membershipId: "om_existing_staff",
      userId: "user_existing_staff",
    });
  });

  test("resends an existing pending builder-staff invite when WorkOS reports the email is already invited", async () => {
    const calls: string[] = [];
    const workos = {
      userManagement: {
        sendInvitation: async (payload: any) => {
          calls.push(`sendInvitation:${payload.email}:${payload.roleSlug}`);
          throw new Error("Email already invited to organization.");
        },
        listInvitations: async (payload: any) => {
          calls.push(`listInvitations:${payload.email}:${payload.organizationId}`);
          return {
            autoPagination: async () => [
              {
                createdAt: "2026-06-07T12:00:00.000Z",
                id: "inv_existing_pending",
                state: "pending",
              },
            ],
          };
        },
        resendInvitation: async (invitationId: string) => {
          calls.push(`resendInvitation:${invitationId}`);
          return { id: invitationId };
        },
        listUsers: async (payload: any) => {
          calls.push(`listUsers:${payload.email}`);
          return { autoPagination: async () => [] };
        },
        createUser: async (payload: any) => {
          calls.push(`createUser:${payload.email}`);
          throw new Error("Invitation recipient has not accepted yet.");
        },
      },
    };

    const result = await provisionBuilderStaffUserWithWorkos(workos as any, {
      email: "Already.Invited@Example.com",
      organizationId: "org_builder",
    });

    expect(calls).toEqual([
      "sendInvitation:already.invited@example.com:builder-staff",
      "listInvitations:already.invited@example.com:org_builder",
      "resendInvitation:inv_existing_pending",
      "listUsers:already.invited@example.com",
      "createUser:already.invited@example.com",
    ]);
    expect(result).toMatchObject({
      adapter: "workos",
      invitationId: "inv_existing_pending",
      membershipId: "pending_invitation_inv_existing_pending",
      operation: "provisionBuilderStaffUser",
      status: "accepted",
      sync: "waiting-for-webhook",
      userId: "pending_builder_staff_already_invited_example_com",
    });
  });

  test("keeps a pending builder-staff invitation app-visible when WorkOS user creation is not available yet", async () => {
    const calls: string[] = [];
    const workos = {
      userManagement: {
        sendInvitation: async (payload: any) => {
          calls.push(`sendInvitation:${payload.email}:${payload.roleSlug}`);
          return { id: "inv_pending_builder_staff" };
        },
        listUsers: async (payload: any) => {
          calls.push(`listUsers:${payload.email}`);
          return { autoPagination: async () => [] };
        },
        createUser: async (payload: any) => {
          calls.push(`createUser:${payload.email}`);
          throw new Error("Invitation recipient has not accepted yet.");
        },
      },
    };

    const result = await provisionBuilderStaffUserWithWorkos(workos as any, {
      email: "Pending.Invited@Example.com",
      organizationId: "org_builder",
    });

    expect(calls).toEqual([
      "sendInvitation:pending.invited@example.com:builder-staff",
      "listUsers:pending.invited@example.com",
      "createUser:pending.invited@example.com",
    ]);
    expect(result).toMatchObject({
      adapter: "workos",
      invitationId: "inv_pending_builder_staff",
      membershipId: "pending_invitation_inv_pending_builder_staff",
      operation: "provisionBuilderStaffUser",
      status: "accepted",
      sync: "waiting-for-webhook",
      userId: "pending_builder_staff_pending_invited_example_com",
    });
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

  test("repeated directory sync restores the authoritative WorkOS organization name", async () => {
    const t = adminTest();

    await t.action(api.workosManagement.syncWorkosDirectory, {});
    await t.run(async (ctx: any) => {
      const organization = await ctx.db
        .query("workosOrganizations")
        .withIndex("by_workos_organization_id", (q: any) =>
          q.eq("workosOrganizationId", "org_fixture"),
        )
        .unique();
      if (!organization) {
        throw new Error("organization projection not found");
      }
      await ctx.db.patch(organization._id, {
        name: "FairLendBrokerage",
      });
    });

    await t.action(api.workosManagement.syncWorkosDirectory, {});

    const projections = await t.query(
      api.workosProjection.listUserManagement,
      {},
    );
    expect(projections.organizations).toEqual([
      expect.objectContaining({
        name: "FairLend",
        workosOrganizationId: "org_fixture",
      }),
    ]);
  });

  test.each([
    {
      args: {
        email: "foreign.builder@example.com",
        organizationId: "org_foreign",
        roleSlug: "builder",
      },
      invoke: (t: any) => t.action(api.workosManagement.inviteUser, {
        email: "foreign.builder@example.com",
        organizationId: "org_foreign",
        roleSlug: "builder",
      }),
      label: "inviteUser",
    },
    {
      args: {
        membershipId: "om_foreign",
        roleSlug: "builder",
      },
      invoke: (t: any) => t.action(api.workosManagement.updateMembershipRole, {
        membershipId: "om_foreign",
        roleSlug: "builder",
      }),
      label: "updateMembershipRole",
    },
    {
      args: {
        membershipId: "om_foreign",
        primaryRoleSlug: "builder",
        roleSlugs: ["builder"],
      },
      invoke: (t: any) => t.action(api.workosManagement.updateMembershipRoles, {
        membershipId: "om_foreign",
        primaryRoleSlug: "builder",
        roleSlugs: ["builder"],
      }),
      label: "updateMembershipRoles",
    },
    {
      args: {
        organizationId: "org_foreign",
        primaryRoleSlug: "builder",
        roleSlugs: ["builder"],
        userId: "user_foreign",
      },
      invoke: (t: any) => t.action(api.workosManagement.createMembership, {
        organizationId: "org_foreign",
        primaryRoleSlug: "builder",
        roleSlugs: ["builder"],
        userId: "user_foreign",
      }),
      label: "createMembership",
    },
    {
      args: {
        membershipId: "om_foreign",
      },
      invoke: (t: any) => t.action(api.workosManagement.removeMembership, {
        membershipId: "om_foreign",
      }),
      label: "removeMembership",
    },
    {
      args: {
        membershipId: "om_foreign",
      },
      invoke: (t: any) => t.action(api.workosManagement.deactivateMembership, {
        membershipId: "om_foreign",
      }),
      label: "deactivateMembership",
    },
    {
      args: {
        membershipId: "om_foreign",
      },
      invoke: (t: any) => t.action(api.workosManagement.reactivateMembership, {
        membershipId: "om_foreign",
      }),
      label: "reactivateMembership",
    },
  ])(
    "rejects $label when a tenant-scoped operator targets a foreign organization or membership",
    async ({ invoke }) => {
      const t = principalBrokerTest();
      await seedScopedWorkosProjectionState(t);

      await expect(invoke(t)).rejects.toThrow(/Forbidden/);
    },
  );

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
