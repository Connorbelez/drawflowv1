import { WorkOS } from "@workos-inc/node";
import { v } from "convex/values";

import { internal } from "./_generated/api";
import { adminAction, userManagementWriteAction } from "./authz";

const acceptedReturn = v.object({
  adapter: v.union(v.literal("fake"), v.literal("workos")),
  operation: v.string(),
  status: v.literal("accepted"),
  sync: v.literal("waiting-for-webhook"),
  workosId: v.optional(v.string()),
});

const syncReturn = v.object({
  adapter: v.union(v.literal("fake"), v.literal("workos")),
  counts: v.object({
    memberships: v.number(),
    organizationRoles: v.number(),
    organizations: v.number(),
    permissions: v.number(),
    roles: v.number(),
    users: v.number(),
  }),
  operation: v.literal("syncWorkosDirectory"),
  status: v.literal("synced"),
});

interface AcceptedResult {
  adapter: "fake" | "workos";
  operation: string;
  status: "accepted";
  sync: "waiting-for-webhook";
  workosId?: string;
}

interface WorkosEntity {
  id?: string;
  slug?: string;
  [key: string]: unknown;
}

interface SyncSnapshot {
  memberships: WorkosEntity[];
  organizationRoles: WorkosEntity[];
  organizations: WorkosEntity[];
  permissions: WorkosEntity[];
  roles: WorkosEntity[];
  users: WorkosEntity[];
}

interface SyncResult {
  adapter: "fake" | "workos";
  counts: {
    memberships: number;
    organizationRoles: number;
    organizations: number;
    permissions: number;
    roles: number;
    users: number;
  };
  operation: "syncWorkosDirectory";
  status: "synced";
}

export const inviteUser = userManagementWriteAction
  .input({
    email: v.string(),
    organizationId: v.string(),
    roleSlug: v.string(),
  })
  .returns(acceptedReturn)
  .handler((_ctx, args) => {
    const adapter = getWorkosManagementAdapter();
    return adapter.inviteUser(args);
  })
  .public();

export const updateMembershipRole = userManagementWriteAction
  .input({
    membershipId: v.string(),
    roleSlug: v.string(),
  })
  .returns(acceptedReturn)
  .handler((_ctx, args) => {
    const adapter = getWorkosManagementAdapter();
    return adapter.updateMembershipRole(args);
  })
  .public();

export const updateMembershipRoles = userManagementWriteAction
  .input({
    membershipId: v.string(),
    primaryRoleSlug: v.optional(v.string()),
    roleSlugs: v.array(v.string()),
  })
  .returns(acceptedReturn)
  .handler((_ctx, args) => {
    const adapter = getWorkosManagementAdapter();
    return adapter.updateMembershipRoles(args);
  })
  .public();

export const createMembership = userManagementWriteAction
  .input({
    organizationId: v.string(),
    primaryRoleSlug: v.optional(v.string()),
    roleSlugs: v.array(v.string()),
    userId: v.string(),
  })
  .returns(acceptedReturn)
  .handler((_ctx, args) => getWorkosManagementAdapter().createMembership(args))
  .public();

export const removeMembership = userManagementWriteAction
  .input({
    membershipId: v.string(),
  })
  .returns(acceptedReturn)
  .handler((_ctx, args) => getWorkosManagementAdapter().removeMembership(args))
  .public();

export const deactivateMembership = userManagementWriteAction
  .input({
    membershipId: v.string(),
  })
  .returns(acceptedReturn)
  .handler((_ctx, args) =>
    getWorkosManagementAdapter().deactivateMembership(args)
  )
  .public();

export const reactivateMembership = userManagementWriteAction
  .input({
    membershipId: v.string(),
  })
  .returns(acceptedReturn)
  .handler((_ctx, args) =>
    getWorkosManagementAdapter().reactivateMembership(args)
  )
  .public();

export const syncWorkosDirectory = adminAction
  .returns(syncReturn)
  .handler(async (ctx): Promise<SyncResult> => {
    const adapter = getWorkosManagementAdapter();
    const snapshot = await adapter.syncDirectory();

    for (const organization of snapshot.organizations) {
      await ctx.runMutation(internal.workosProjection.ingestWorkosEvent, {
        data: eventForSync(
          "organization.created",
          entityIdentifier(organization),
          organization
        ),
        event: "organization.created",
      });
    }

    for (const user of snapshot.users) {
      await ctx.runMutation(internal.workosProjection.ingestWorkosEvent, {
        data: eventForSync("user.created", entityIdentifier(user), user),
        event: "user.created",
      });
    }

    for (const membership of snapshot.memberships) {
      await ctx.runMutation(internal.workosProjection.ingestWorkosEvent, {
        data: eventForSync(
          "organization_membership.created",
          entityIdentifier(membership),
          membership
        ),
        event: "organization_membership.created",
      });
    }

    for (const role of snapshot.organizationRoles) {
      await ctx.runMutation(internal.workosProjection.ingestWorkosEvent, {
        data: eventForSync(
          "organization_role.created",
          entityIdentifier(role),
          role
        ),
        event: "organization_role.created",
      });
    }

    for (const role of snapshot.roles) {
      await ctx.runMutation(internal.workosProjection.ingestWorkosEvent, {
        data: eventForSync("role.created", entityIdentifier(role), role),
        event: "role.created",
      });
    }

    for (const permission of snapshot.permissions) {
      await ctx.runMutation(internal.workosProjection.ingestWorkosEvent, {
        data: eventForSync(
          "permission.created",
          entityIdentifier(permission),
          permission
        ),
        event: "permission.created",
      });
    }

    return {
      adapter: adapter.adapter,
      counts: {
        memberships: snapshot.memberships.length,
        organizationRoles: snapshot.organizationRoles.length,
        organizations: snapshot.organizations.length,
        permissions: snapshot.permissions.length,
        roles: snapshot.roles.length,
        users: snapshot.users.length,
      },
      operation: "syncWorkosDirectory",
      status: "synced",
    };
  })
  .public();

function getWorkosManagementAdapter() {
  if (
    process.env.VITEST ||
    process.env.NODE_ENV === "test" ||
    process.env.WORKOS_MANAGEMENT_ADAPTER === "fake"
  ) {
    return fakeAdapter;
  }

  const apiKey = process.env.WORKOS_API_KEY;
  if (!apiKey) {
    throw new Error("WORKOS_API_KEY is required for WorkOS management writes");
  }

  return liveAdapter(new WorkOS(apiKey));
}

const fakeAdapter = {
  adapter: "fake" as const,
  inviteUser(args: {
    email: string;
    organizationId: string;
    roleSlug: string;
  }): Promise<AcceptedResult> {
    requireNonEmptyRoleSlug(args.roleSlug);
    return Promise.resolve({
      adapter: "fake",
      operation: "inviteUser",
      status: "accepted",
      sync: "waiting-for-webhook",
      workosId: `fake_invite_${args.email}`,
    });
  },
  updateMembershipRole(args: {
    membershipId: string;
    roleSlug: string;
  }): Promise<AcceptedResult> {
    requireNonEmptyRoleSlug(args.roleSlug);
    return Promise.resolve(
      accepted("fake", "updateMembershipRole", args.membershipId)
    );
  },
  updateMembershipRoles(args: {
    membershipId: string;
    primaryRoleSlug?: string;
    roleSlugs: string[];
  }): Promise<AcceptedResult> {
    requireNonEmptyRoleSlugs(args.roleSlugs);
    requireSelectedPrimaryRole(args.primaryRoleSlug, args.roleSlugs);
    return Promise.resolve(
      accepted("fake", "updateMembershipRoles", args.membershipId)
    );
  },
  createMembership(args: {
    organizationId: string;
    primaryRoleSlug?: string;
    roleSlugs: string[];
    userId: string;
  }): Promise<AcceptedResult> {
    requireNonEmptyRoleSlugs(args.roleSlugs);
    requireSelectedPrimaryRole(args.primaryRoleSlug, args.roleSlugs);
    return Promise.resolve(
      accepted(
        "fake",
        "createMembership",
        `fake_membership_${args.organizationId}_${args.userId}`
      )
    );
  },
  removeMembership(args: { membershipId: string }): Promise<AcceptedResult> {
    return Promise.resolve(
      accepted("fake", "removeMembership", args.membershipId)
    );
  },
  deactivateMembership(args: {
    membershipId: string;
  }): Promise<AcceptedResult> {
    return Promise.resolve(
      accepted("fake", "deactivateMembership", args.membershipId)
    );
  },
  reactivateMembership(args: {
    membershipId: string;
  }): Promise<AcceptedResult> {
    return Promise.resolve(
      accepted("fake", "reactivateMembership", args.membershipId)
    );
  },
  syncDirectory(): Promise<SyncSnapshot> {
    return Promise.resolve({
      memberships: [
        {
          id: "om_fixture",
          organizationId: "org_fixture",
          status: "active",
          userId: "user_admin",
          directoryManaged: false,
          createdAt: "2026-05-01T00:00:00.000Z",
          updatedAt: "2026-05-01T00:00:00.000Z",
          role: { slug: "admin" },
          roles: [{ slug: "admin" }],
        },
      ],
      organizationRoles: [
        {
          id: "role_admin",
          organizationId: "org_fixture",
          slug: "admin",
          name: "Admin",
          description: "Administrator role",
          resourceTypeSlug: "organization",
          permissions: ["widgets:users-table:manage"],
          createdAt: "2026-05-01T00:00:00.000Z",
          updatedAt: "2026-05-01T00:00:00.000Z",
        },
      ],
      organizations: [
        {
          id: "org_fixture",
          name: "FairLend",
          domains: [],
          createdAt: "2026-05-01T00:00:00.000Z",
          updatedAt: "2026-05-01T00:00:00.000Z",
        },
      ],
      permissions: [
        {
          id: "perm_users_table_manage",
          slug: "widgets:users-table:manage",
          name: "Manage users table",
          description: "Allows managing WorkOS user table data",
          system: false,
          createdAt: "2026-05-01T00:00:00.000Z",
          updatedAt: "2026-05-01T00:00:00.000Z",
        },
      ],
      roles: [
        {
          id: "role_environment_admin",
          slug: "admin",
          name: "Admin",
          description: "Environment administrator role",
          resourceTypeSlug: "organization",
          permissions: ["widgets:users-table:manage"],
          createdAt: "2026-05-01T00:00:00.000Z",
          updatedAt: "2026-05-01T00:00:00.000Z",
        },
        {
          id: "role_environment_builder",
          slug: "builder",
          name: "Builder",
          description: "Builder role",
          resourceTypeSlug: "organization",
          permissions: [],
          createdAt: "2026-05-01T00:00:00.000Z",
          updatedAt: "2026-05-01T00:00:00.000Z",
        },
      ],
      users: [
        {
          id: "user_admin",
          email: "admin@example.com",
          firstName: "Admin",
          lastName: "User",
          emailVerified: true,
          createdAt: "2026-05-01T00:00:00.000Z",
          updatedAt: "2026-05-01T00:00:00.000Z",
        },
        {
          id: "user_unassigned",
          email: "unassigned@example.com",
          firstName: "Unassigned",
          lastName: "User",
          emailVerified: true,
          createdAt: "2026-05-01T00:00:00.000Z",
          updatedAt: "2026-05-01T00:00:00.000Z",
        },
      ],
    });
  },
};

function liveAdapter(workos: WorkOS) {
  return {
    adapter: "workos" as const,
    async inviteUser(args: {
      email: string;
      organizationId: string;
      roleSlug: string;
    }): Promise<AcceptedResult> {
      requireNonEmptyRoleSlug(args.roleSlug);
      const result = await workos.userManagement.sendInvitation({
        email: args.email,
        organizationId: args.organizationId,
        roleSlug: args.roleSlug,
      });
      return accepted("workos", "inviteUser", result.id);
    },
    async updateMembershipRole(args: {
      membershipId: string;
      roleSlug: string;
    }): Promise<AcceptedResult> {
      requireNonEmptyRoleSlug(args.roleSlug);
      await workos.userManagement.updateOrganizationMembership(
        args.membershipId,
        {
          roleSlug: args.roleSlug,
        }
      );
      return accepted("workos", "updateMembershipRole", args.membershipId);
    },
    async updateMembershipRoles(args: {
      membershipId: string;
      primaryRoleSlug?: string;
      roleSlugs: string[];
    }): Promise<AcceptedResult> {
      requireNonEmptyRoleSlugs(args.roleSlugs);
      requireSelectedPrimaryRole(args.primaryRoleSlug, args.roleSlugs);
      await workos.userManagement.updateOrganizationMembership(
        args.membershipId,
        {
          roleSlug: args.primaryRoleSlug,
          roleSlugs: args.roleSlugs,
        }
      );
      return accepted("workos", "updateMembershipRoles", args.membershipId);
    },
    async createMembership(args: {
      organizationId: string;
      primaryRoleSlug?: string;
      roleSlugs: string[];
      userId: string;
    }): Promise<AcceptedResult> {
      requireNonEmptyRoleSlugs(args.roleSlugs);
      requireSelectedPrimaryRole(args.primaryRoleSlug, args.roleSlugs);
      const membership =
        await workos.userManagement.createOrganizationMembership({
          organizationId: args.organizationId,
          roleSlug: args.primaryRoleSlug,
          roleSlugs: args.roleSlugs,
          userId: args.userId,
        });
      return accepted("workos", "createMembership", membership.id);
    },
    async removeMembership(args: {
      membershipId: string;
    }): Promise<AcceptedResult> {
      const membership = await workos.userManagement.getOrganizationMembership(
        args.membershipId
      );
      if (membership.status === "pending") {
        await workos.userManagement.deleteOrganizationMembership(
          args.membershipId
        );
      } else if (membership.status === "active") {
        await workos.userManagement.deactivateOrganizationMembership(
          args.membershipId
        );
      }
      return accepted("workos", "removeMembership", args.membershipId);
    },
    async deactivateMembership(args: {
      membershipId: string;
    }): Promise<AcceptedResult> {
      await workos.userManagement.deactivateOrganizationMembership(
        args.membershipId
      );
      return accepted("workos", "deactivateMembership", args.membershipId);
    },
    async reactivateMembership(args: {
      membershipId: string;
    }): Promise<AcceptedResult> {
      await workos.userManagement.reactivateOrganizationMembership(
        args.membershipId
      );
      return accepted("workos", "reactivateMembership", args.membershipId);
    },
    async syncDirectory(): Promise<SyncSnapshot> {
      const organizations = await (
        await workos.organizations.listOrganizations()
      ).autoPagination();
      const permissions = await (
        await workos.authorization.listPermissions()
      ).autoPagination();
      const users = await (
        await workos.userManagement.listUsers()
      ).autoPagination();
      const roles = (
        await workos.authorization.listEnvironmentRoles()
      ).data.map(toWorkosEntity);

      const memberships: WorkosEntity[] = [];
      const organizationRoles: WorkosEntity[] = [];
      const usersById = new Map<string, WorkosEntity>(
        users.map((user) => [user.id, toWorkosEntity(user)])
      );

      for (const organization of organizations) {
        const organizationMemberships = await (
          await workos.userManagement.listOrganizationMemberships({
            organizationId: organization.id,
            statuses: ["active", "inactive", "pending"],
          })
        ).autoPagination();
        memberships.push(...organizationMemberships.map(toWorkosEntity));

        for (const membership of organizationMemberships) {
          if (!usersById.has(membership.userId)) {
            usersById.set(
              membership.userId,
              toWorkosEntity(
                await workos.userManagement.getUser(membership.userId)
              )
            );
          }
        }

        const roles = await workos.authorization.listOrganizationRoles(
          organization.id
        );
        organizationRoles.push(
          ...roles.data.map((role) =>
            toWorkosEntity({
              ...role,
              organizationId: organization.id,
            })
          )
        );
      }

      return {
        memberships,
        organizationRoles,
        organizations: organizations.map(toWorkosEntity),
        permissions: permissions.map(toWorkosEntity),
        roles,
        users: [...usersById.values()],
      };
    },
  };
}

function toWorkosEntity(value: unknown): WorkosEntity {
  return JSON.parse(JSON.stringify(value)) as WorkosEntity;
}

function accepted(
  adapter: "fake" | "workos",
  operation: string,
  workosId: string
): AcceptedResult {
  return {
    adapter,
    operation,
    status: "accepted",
    sync: "waiting-for-webhook",
    workosId,
  };
}

function requireNonEmptyRoleSlugs(roleSlugs: string[]) {
  if (roleSlugs.length === 0) {
    throw new Error("At least one WorkOS role slug is required");
  }
  for (const roleSlug of roleSlugs) {
    requireNonEmptyRoleSlug(roleSlug);
  }
}

function requireNonEmptyRoleSlug(roleSlug: string) {
  if (roleSlug.trim().length === 0) {
    throw new Error("WorkOS role slug is required");
  }
}

function requireSelectedPrimaryRole(
  primaryRoleSlug: string | undefined,
  roleSlugs: string[]
) {
  if (primaryRoleSlug === undefined) {
    return;
  }
  requireNonEmptyRoleSlug(primaryRoleSlug);
  if (!roleSlugs.includes(primaryRoleSlug)) {
    throw new Error("Primary WorkOS role slug must be selected");
  }
}

function entityIdentifier(entity: WorkosEntity) {
  if (typeof entity.id === "string") {
    return entity.id;
  }
  if (typeof entity.slug === "string") {
    return entity.slug;
  }
  return "unknown";
}

function eventForSync(event: string, id: string, data: WorkosEntity) {
  const sanitized = JSON.parse(JSON.stringify(data)) as WorkosEntity;
  return {
    created_at:
      sanitized.updated_at ??
      sanitized.updatedAt ??
      sanitized.created_at ??
      sanitized.createdAt ??
      new Date().toISOString(),
    data: sanitized,
    event,
    id: `sync:${event}:${id}`,
  };
}
