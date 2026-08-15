/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";

import { api, internal } from "./_generated/api";
import schema from "./schema";
import {
  buildWorkosMembershipRolesPayload,
  configureFakePrincipalBrokerTransferFailureForTest,
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

function lenderAdminTest() {
  return convexTest(schema, modules).withIdentity({
    email: "lender-admin@example.com",
    name: "Lender Admin",
    organizationId: "org_fixture",
    role: "admin",
    roles: ["admin"],
    subject: "user_lender_admin",
    tokenIdentifier: "https://api.workos.com/|user_lender_admin",
  } as any);
}

const fixtureTime = "2026-05-01T00:00:00.000Z";

async function projectWorkosFixture(
  t: any,
  event: string,
  id: string,
  data: Record<string, unknown>,
) {
  await t.mutation(internal.workosProjection.ingestWorkosEvent, {
    created_at: fixtureTime,
    data,
    event,
    id,
  });
}

async function seedScopedWorkosProjectionState(t: any) {
  for (const user of [
    {
      email: "principal@example.com",
      id: "user_principal",
      name: "Principal Broker",
    },
    {
      email: "lender-admin@example.com",
      id: "user_lender_admin",
      name: "Lender Admin",
    },
    {
      email: "target@example.com",
      id: "user_target",
      name: "Target Broker",
    },
    {
      email: "foreign@example.com",
      id: "user_foreign",
      name: "Foreign User",
    },
    {
      email: "builder@example.com",
      id: "user_builder_fixture",
      name: "Builder Member",
    },
  ]) {
    await projectWorkosFixture(t, "user.created", `seed_${user.id}`, {
      created_at: fixtureTime,
      email: user.email,
      email_verified: true,
      first_name: user.name,
      id: user.id,
      updated_at: fixtureTime,
    });
  }
  await projectWorkosFixture(t, "organization.created", "seed_org_fixture", {
    created_at: fixtureTime,
    domains: [],
    id: "org_fixture",
    name: "FairLend",
    updated_at: fixtureTime,
  });
  await projectWorkosFixture(t, "organization.created", "seed_org_foreign", {
    created_at: fixtureTime,
    domains: [],
    id: "org_foreign",
    name: "Oakline Builds",
    updated_at: fixtureTime,
  });
  for (const membership of [
    {
      id: "om_principal_fixture",
      organizationId: "org_fixture",
      roleSlugs: ["principle-broker"],
      userId: "user_principal",
    },
    {
      id: "om_lender_admin",
      organizationId: "org_fixture",
      roleSlugs: ["admin"],
      userId: "user_lender_admin",
    },
    {
      id: "om_target_fixture",
      organizationId: "org_fixture",
      roleSlugs: ["broker"],
      userId: "user_target",
    },
    {
      id: "om_foreign",
      organizationId: "org_foreign",
      roleSlugs: ["builder"],
      userId: "user_foreign",
    },
    {
      id: "om_builder_fixture",
      organizationId: "org_fixture",
      roleSlugs: ["builder"],
      userId: "user_builder_fixture",
    },
  ]) {
    await projectWorkosFixture(
      t,
      "organization_membership.created",
      `seed_${membership.id}`,
      {
        created_at: fixtureTime,
        directory_managed: false,
        id: membership.id,
        organization_id: membership.organizationId,
        role: { slug: membership.roleSlugs[0] },
        roles: membership.roleSlugs.map((slug) => ({ slug })),
        status: "active",
        updated_at: fixtureTime,
        user_id: membership.userId,
      },
    );
  }
  await t.run(async (ctx: any) => {
    await ctx.db.insert("brokerages", {
      createdAt: 1,
      displayName: "FairLend",
      legalName: "FairLend",
      status: "active",
      updatedAt: 1,
      workosOrganizationId: "org_fixture",
    });
    await ctx.db.insert("brokerages", {
      createdAt: 1,
      displayName: "Oakline Builds",
      legalName: "Oakline Builds",
      status: "active",
      updatedAt: 1,
      workosOrganizationId: "org_foreign",
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

  test("keeps accepted role changes pending until webhook reconciliation", async () => {
    const t = adminTest();
    await seedScopedWorkosProjectionState(t);

    const result = await t.action(api.workosManagement.updateMembershipRoles, {
      membershipId: "om_target_fixture",
      primaryRoleSlug: "admin",
      roleSlugs: ["admin", "broker"],
    });
    expect(result).toMatchObject({
      operation: "updateMembershipRoles",
      status: "accepted",
      sync: "waiting-for-webhook",
    });

    const projections = await t.query(
      api.workosProjection.listUserManagement,
      {},
    );
    expect(projections.memberships).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          roleSlug: "broker",
          roleSlugs: ["broker"],
          sourceEventType: "organization_membership.created",
          workosMembershipId: "om_target_fixture",
        }),
      ]),
    );
    const audits = await t.run(async (ctx: any) =>
      ctx.db
        .query("auditEvents")
        .withIndex("by_entity", (q: any) =>
          q
            .eq("entityType", "workosOrganizationMembership")
            .eq("entityId", "om_target_fixture"),
        )
        .collect(),
    );
    expect(audits).toEqual([
      expect.objectContaining({
        actorRoles: ["admin"],
        command: "updateMembershipRoles",
        eventType: "workos.membership.updateMembershipRoles.accepted",
        organizationId: "org_fixture",
        warnings: ["pending_workos_projection_reconciliation"],
      }),
    ]);
  });

  test("audits accepted lender membership lifecycle commands without projecting them", async () => {
    const t = adminTest();
    await seedScopedWorkosProjectionState(t);

    await t.action(api.workosManagement.inviteUser, {
      email: "invited-broker@example.com",
      organizationId: "org_fixture",
      roleSlug: "broker",
    });
    await t.action(api.workosManagement.createMembership, {
      organizationId: "org_fixture",
      primaryRoleSlug: "broker-staff",
      roleSlugs: ["broker-staff"],
      userId: "user_invited_staff",
    });
    await t.action(api.workosManagement.deactivateMembership, {
      membershipId: "om_target_fixture",
      reason: "Temporary leave.",
    });
    await t.action(api.workosManagement.reactivateMembership, {
      membershipId: "om_target_fixture",
      reason: "Return from leave.",
    });
    await t.action(api.workosManagement.removeMembership, {
      membershipId: "om_target_fixture",
      reason: "Employment ended.",
    });

    const state = await t.run(async (ctx: any) => ({
      audits: await ctx.db
        .query("auditEvents")
        .withIndex("by_organizationId_and_createdAt", (q: any) =>
          q.eq("organizationId", "org_fixture"),
        )
        .collect(),
      target: await ctx.db
        .query("workosOrganizationMemberships")
        .withIndex("by_workos_membership_id", (q: any) =>
          q.eq("workosMembershipId", "om_target_fixture"),
        )
        .unique(),
    }));
    expect(state.target).toMatchObject({
      roleSlugs: ["broker"],
      status: "active",
    });
    expect(state.audits).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          actorRoles: ["admin"],
          actorWorkosUserId: "user_admin",
          eventType: "workos.membership.invitation.accepted",
          warnings: ["pending_workos_projection_reconciliation"],
        }),
        expect.objectContaining({
          eventType: "workos.membership.creation.accepted",
          warnings: ["pending_workos_projection_reconciliation"],
        }),
        expect.objectContaining({
          eventType: "workos.membership.deactivateMembership.accepted",
          priorState: expect.any(String),
          reason: "Temporary leave.",
        }),
        expect.objectContaining({
          eventType: "workos.membership.reactivateMembership.accepted",
          priorState: expect.any(String),
          reason: "Return from leave.",
        }),
        expect.objectContaining({
          eventType: "workos.membership.removeMembership.accepted",
          priorState: expect.any(String),
          reason: "Employment ended.",
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
    await seedScopedWorkosProjectionState(t);

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
        membershipId: "om_target_fixture",
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
        membershipId: "om_target_fixture",
      })
    ).resolves.toMatchObject({
      adapter: "fake",
      operation: "removeMembership",
      status: "accepted",
    });

    const projections = await t.query(
      api.workosProjection.listUserManagement,
      {},
    );
    expect(projections.memberships).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          roleSlugs: ["broker"],
          status: "active",
          workosMembershipId: "om_target_fixture",
        }),
      ]),
    );
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

  test("keeps platform WorkOS management scoped and protects the active Principal Broker", async () => {
    const admin = lenderAdminTest();
    await seedScopedWorkosProjectionState(admin);

    await expect(
      admin.action(api.workosManagement.inviteUser, {
        email: "builder@example.com",
        organizationId: "org_fixture",
        roleSlug: "builder",
      }),
    ).resolves.toMatchObject({ status: "accepted" });

    await expect(
      admin.action(api.workosManagement.updateMembershipRole, {
        membershipId: "om_principal_fixture",
        roleSlug: "broker",
      }),
    ).resolves.toMatchObject({
      membershipId: "om_principal_fixture",
      reason: "principal-broker-transfer-required",
      status: "transfer-required",
      sync: "not-started",
    });
    await expect(
      admin.action(api.workosManagement.deactivateMembership, {
        membershipId: "om_principal_fixture",
        reason: "Owner departed.",
      }),
    ).resolves.toMatchObject({
      membershipId: "om_principal_fixture",
      reason: "principal-broker-transfer-required",
      status: "transfer-required",
    });
    await expect(
      admin.action(api.workosManagement.updateMembershipRole, {
        membershipId: "om_target_fixture",
        roleSlug: "principle-broker",
      }),
    ).resolves.toMatchObject({
      membershipId: "om_target_fixture",
      reason: "principal-broker-transfer-required",
      status: "transfer-required",
    });
    await expect(
      admin.action(api.workosManagement.transferPrincipalBroker, {
        idempotencyKey: "reject-builder-target",
        reason: "This target is not a lender organization member.",
        sourceMembershipId: "om_principal_fixture",
        targetMembershipId: "om_builder_fixture",
      }),
    ).rejects.toThrow(/lender organization member/i);

    const principalProjection = await admin.run(async (ctx: any) =>
      ctx.db
        .query("workosOrganizationMemberships")
        .withIndex("by_workos_membership_id", (q: any) =>
          q.eq("workosMembershipId", "om_principal_fixture"),
        )
        .unique(),
    );
    expect(principalProjection).toMatchObject({
      roleSlugs: ["principle-broker"],
      status: "active",
    });
  });

  test("transfers Principal Broker control idempotently without optimistic projection writes", async () => {
    configureFakePrincipalBrokerTransferFailureForTest(null);
    const t = principalBrokerTest();
    await seedScopedWorkosProjectionState(t);

    const args = {
      idempotencyKey: "transfer-2026-08-14-001",
      reason: "Transfer ownership to the designated successor.",
      sourceMembershipId: "om_principal_fixture",
      targetMembershipId: "om_target_fixture",
    };
    const first = await t.action(
      api.workosManagement.transferPrincipalBroker,
      args,
    );
    expect(first).toMatchObject({
      operation: "transferPrincipalBroker",
      sourceMembershipId: "om_principal_fixture",
      status: "accepted",
      sync: "waiting-for-webhook",
      targetMembershipId: "om_target_fixture",
    });
    const repeated = await t.action(
      api.workosManagement.transferPrincipalBroker,
      args,
    );
    expect(repeated).toMatchObject({
      commandId: first.commandId,
      status: "accepted",
    });
    await expect(
      t.action(api.workosManagement.transferPrincipalBroker, {
        ...args,
        idempotencyKey: "competing-before-reconciliation",
      }),
    ).resolves.toMatchObject({
      commandId: first.commandId,
      idempotencyKey: args.idempotencyKey,
      status: "transfer-in-progress",
      sync: "not-started",
    });

    const state = await t.run(async (ctx: any) => ({
      audits: await ctx.db
        .query("auditEvents")
        .withIndex("by_organizationId_and_reconciliationKey", (q: any) =>
          q
            .eq("organizationId", "org_fixture")
            .eq(
              "reconciliationKey",
              `principal-broker-transfer:${args.idempotencyKey}:accepted`,
            ),
        )
        .collect(),
      commands: await ctx.db
        .query("workosManagementOperations")
        .withIndex("by_organization_idempotency", (q: any) =>
          q
            .eq("organizationId", "org_fixture")
            .eq("idempotencyKey", args.idempotencyKey),
        )
        .collect(),
      memberships: await ctx.db
        .query("workosOrganizationMemberships")
        .withIndex("by_organization", (q: any) =>
          q.eq("workosOrganizationId", "org_fixture"),
        )
        .collect(),
    }));
    expect(state.commands).toEqual([
      expect.objectContaining({
        reason: args.reason,
        sourceMembershipId: "om_principal_fixture",
        status: "accepted",
        targetMembershipId: "om_target_fixture",
      }),
    ]);
    expect(state.audits).toEqual([
      expect.objectContaining({
        actorRole: "principle-broker",
        actorWorkosUserId: "user_principal",
        eventType: "workos.principal-broker-transfer.accepted",
        reason: args.reason,
        warnings: ["pending_workos_projection_reconciliation"],
      }),
    ]);
    expect(
      state.memberships.find(
        (membership: any) =>
          membership.workosMembershipId === "om_principal_fixture",
      ),
    ).toMatchObject({ roleSlugs: ["principle-broker"], status: "active" });
    expect(
      state.memberships.find(
        (membership: any) =>
          membership.workosMembershipId === "om_target_fixture",
      ),
    ).toMatchObject({ roleSlugs: ["broker"], status: "active" });

    await projectWorkosFixture(
      t,
      "organization_membership.updated",
      "reconcile_transfer_target",
      {
        created_at: fixtureTime,
        directory_managed: false,
        id: "om_target_fixture",
        organization_id: "org_fixture",
        role: { slug: "principle-broker" },
        roles: [{ slug: "principle-broker" }, { slug: "broker" }],
        status: "active",
        updated_at: fixtureTime,
        user_id: "user_target",
      },
    );
    await projectWorkosFixture(
      t,
      "organization_membership.updated",
      "reconcile_transfer_source",
      {
        created_at: fixtureTime,
        directory_managed: false,
        id: "om_principal_fixture",
        organization_id: "org_fixture",
        role: { slug: "admin" },
        roles: [{ slug: "admin" }],
        status: "active",
        updated_at: fixtureTime,
        user_id: "user_principal",
      },
    );
    const reconciledPrincipals = await t.run(async (ctx: any) => {
      const memberships = await ctx.db
        .query("workosOrganizationMemberships")
        .withIndex("by_organization", (q: any) =>
          q.eq("workosOrganizationId", "org_fixture"),
        )
        .collect();
      return memberships.filter(
        (membership: any) =>
          membership.status === "active" &&
          membership.roleSlugs.includes("principle-broker"),
      );
    });
    expect(reconciledPrincipals).toEqual([
      expect.objectContaining({
        workosMembershipId: "om_target_fixture",
      }),
    ]);
  });

  test("recovers a partial Principal Broker transfer and blocks competing commands", async () => {
    const t = principalBrokerTest();
    await seedScopedWorkosProjectionState(t);
    const args = {
      idempotencyKey: "transfer-partial-source-failure",
      reason: "Exercise the recoverable external failure path.",
      sourceMembershipId: "om_principal_fixture",
      targetMembershipId: "om_target_fixture",
    };
    configureFakePrincipalBrokerTransferFailureForTest("source-demotion");
    await expect(
      t.action(api.workosManagement.transferPrincipalBroker, args),
    ).resolves.toMatchObject({
      recovery: "retry-same-command",
      stage: "source-demotion",
      status: "recoverable-failure",
      sync: "waiting-for-webhook",
    });
    await expect(
      t.action(api.workosManagement.transferPrincipalBroker, {
        ...args,
        idempotencyKey: "competing-transfer",
      }),
    ).resolves.toMatchObject({
      idempotencyKey: args.idempotencyKey,
      status: "transfer-in-progress",
    });

    configureFakePrincipalBrokerTransferFailureForTest(null);
    await expect(
      t.action(api.workosManagement.transferPrincipalBroker, args),
    ).resolves.toMatchObject({
      status: "accepted",
      sync: "waiting-for-webhook",
    });
    const command = await t.run(async (ctx: any) =>
      ctx.db
        .query("workosManagementOperations")
        .withIndex("by_organization_idempotency", (q: any) =>
          q
            .eq("organizationId", "org_fixture")
            .eq("idempotencyKey", args.idempotencyKey),
        )
        .unique(),
    );
    expect(command).toMatchObject({ status: "accepted" });
    expect(command.failureStage).toBeUndefined();
    expect(command.safeError).toBeUndefined();
  });

  test("retries from a target-promotion rejection without reporting false success", async () => {
    const t = principalBrokerTest();
    await seedScopedWorkosProjectionState(t);
    const args = {
      idempotencyKey: "transfer-target-failure",
      reason: "Exercise the initial WorkOS rejection path.",
      sourceMembershipId: "om_principal_fixture",
      targetMembershipId: "om_target_fixture",
    };
    configureFakePrincipalBrokerTransferFailureForTest("target-promotion");
    await expect(
      t.action(api.workosManagement.transferPrincipalBroker, args),
    ).resolves.toMatchObject({
      recovery: "retry-same-command",
      stage: "target-promotion",
      status: "recoverable-failure",
      sync: "not-started",
    });
    configureFakePrincipalBrokerTransferFailureForTest(null);
    await expect(
      t.action(api.workosManagement.transferPrincipalBroker, args),
    ).resolves.toMatchObject({ status: "accepted" });
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
