import { WorkOS } from "@workos-inc/node";
import { v } from "convex/values";

import { internal } from "./_generated/api";
import {
  adminAction,
  normalizeRoleSlug,
  userManagementWriteAction,
} from "./authz";
import {
  pendingBuilderStaffMembershipId,
  pendingBuilderStaffWorkosUserId,
} from "./builderStaffIdentity";
import { publicAction } from "./fluent";

const acceptedReturn = v.object({
  adapter: v.union(v.literal("fake"), v.literal("workos")),
  operation: v.string(),
  status: v.literal("accepted"),
  sync: v.literal("waiting-for-webhook"),
  workosId: v.optional(v.string()),
});

const builderStaffProvisionReturn = v.object({
  adapter: v.union(v.literal("fake"), v.literal("workos")),
  invitationId: v.optional(v.string()),
  membershipId: v.string(),
  operation: v.literal("provisionBuilderStaffUser"),
  status: v.literal("accepted"),
  sync: v.literal("waiting-for-webhook"),
  userId: v.string(),
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

interface BuilderStaffProvisionResult {
  adapter: "fake" | "workos";
  invitationId?: string;
  membershipId: string;
  operation: "provisionBuilderStaffUser";
  status: "accepted";
  sync: "waiting-for-webhook";
  userId: string;
}

interface WorkosProvisionUser {
  email: string;
  id: string;
}

interface WorkosProvisionInvitation {
  createdAt?: string;
  id: string;
  state?: string;
  updatedAt?: string;
}

type WorkosProvisionMembershipStatus = "active" | "inactive" | "pending";

interface WorkosProvisionMembership {
  id: string;
  role?: { slug?: unknown };
  roles?: Array<{ slug?: unknown }>;
  status?: WorkosProvisionMembershipStatus;
}

interface WorkosProvisionClient {
  userManagement: {
    createOrganizationMembership(args: {
      organizationId: string;
      roleSlugs: string[];
      userId: string;
    }): Promise<WorkosProvisionMembership>;
    createUser(args: {
      email: string;
      emailVerified: boolean;
    }): Promise<WorkosProvisionUser>;
    listInvitations(args: {
      email: string;
      organizationId: string;
    }): Promise<{
      autoPagination(): Promise<WorkosProvisionInvitation[]>;
    }>;
    listOrganizationMemberships(args: {
      organizationId: string;
      statuses: WorkosProvisionMembershipStatus[];
      userId: string;
    }): Promise<{
      autoPagination(): Promise<WorkosProvisionMembership[]>;
    }>;
    listUsers(args: {
      email: string;
    }): Promise<{
      autoPagination(): Promise<WorkosProvisionUser[]>;
    }>;
    reactivateOrganizationMembership(
      membershipId: string
    ): Promise<WorkosProvisionMembership>;
    resendInvitation(
      invitationId: string,
      options?: Record<string, never>
    ): Promise<WorkosProvisionInvitation>;
    sendInvitation(args: {
      email: string;
      organizationId: string;
      roleSlug: "builder-staff";
    }): Promise<WorkosProvisionInvitation>;
    updateOrganizationMembership(
      membershipId: string,
      args: { roleSlugs: string[] }
    ): Promise<WorkosProvisionMembership>;
  };
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

export const inviteBuilderStaffUser = publicAction
  .input({
    email: v.string(),
    organizationId: v.string(),
  })
  .returns(acceptedReturn)
  .handler((_ctx, args) =>
    getWorkosManagementAdapter().inviteUser({
      email: args.email,
      organizationId: args.organizationId,
      roleSlug: "builder-staff",
    })
  )
  .internal();

export const provisionBuilderStaffUser = publicAction
  .input({
    email: v.string(),
    organizationId: v.string(),
  })
  .returns(builderStaffProvisionReturn)
  .handler((_ctx, args) =>
    getWorkosManagementAdapter().provisionBuilderStaffUser(args)
  )
  .internal();

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

export const createClaimMembershipForUser = publicAction
  .input({
    organizationId: v.string(),
    primaryRoleSlug: v.optional(v.string()),
    roleSlugs: v.array(v.string()),
    userId: v.string(),
  })
  .returns(acceptedReturn)
  .handler((_ctx, args) => getWorkosManagementAdapter().createMembership(args))
  .internal();

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
        ...eventForSync(
          "organization.created",
          entityIdentifier(organization),
          organization
        ),
      });
    }

    for (const user of snapshot.users) {
      await ctx.runMutation(internal.workosProjection.ingestWorkosEvent, {
        ...eventForSync("user.created", entityIdentifier(user), user),
      });
    }

    for (const membership of snapshot.memberships) {
      await ctx.runMutation(internal.workosProjection.ingestWorkosEvent, {
        ...eventForSync(
          "organization_membership.created",
          entityIdentifier(membership),
          membership
        ),
      });
    }

    for (const role of snapshot.organizationRoles) {
      await ctx.runMutation(internal.workosProjection.ingestWorkosEvent, {
        ...eventForSync(
          "organization_role.created",
          entityIdentifier(role),
          role
        ),
      });
    }

    for (const role of snapshot.roles) {
      await ctx.runMutation(internal.workosProjection.ingestWorkosEvent, {
        ...eventForSync("role.created", entityIdentifier(role), role),
      });
    }

    for (const permission of snapshot.permissions) {
      await ctx.runMutation(internal.workosProjection.ingestWorkosEvent, {
        ...eventForSync(
          "permission.created",
          entityIdentifier(permission),
          permission
        ),
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
  provisionBuilderStaffUser(args: {
    email: string;
    organizationId: string;
  }): Promise<BuilderStaffProvisionResult> {
    const email = normalizeWorkosEmail(args.email);
    const userId = `fake_user_builder_staff_${workosIdSlug(email)}`;
    return Promise.resolve({
      adapter: "fake",
      invitationId: `fake_invite_${email}`,
      membershipId: `fake_membership_${args.organizationId}_${userId}`,
      operation: "provisionBuilderStaffUser",
      status: "accepted",
      sync: "waiting-for-webhook",
      userId,
    });
  },
  inviteUser(args: {
    email: string;
    organizationId: string;
    roleSlug: string;
  }): Promise<AcceptedResult> {
    normalizeWorkosRoleSlug(args.roleSlug);
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
    normalizeWorkosRoleSlug(args.roleSlug);
    return Promise.resolve(
      accepted("fake", "updateMembershipRole", args.membershipId)
    );
  },
  updateMembershipRoles(args: {
    membershipId: string;
    primaryRoleSlug?: string;
    roleSlugs: string[];
  }): Promise<AcceptedResult> {
    buildWorkosMembershipRolesPayload(args);
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
    buildWorkosMembershipRolesPayload(args);
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
    async provisionBuilderStaffUser(args: {
      email: string;
      organizationId: string;
    }): Promise<BuilderStaffProvisionResult> {
      return await provisionBuilderStaffUserWithWorkos(workos, args);
    },
    async inviteUser(args: {
      email: string;
      organizationId: string;
      roleSlug: string;
    }): Promise<AcceptedResult> {
      const roleSlug = normalizeWorkosRoleSlug(args.roleSlug);
      requireNonEmptyRoleSlug(roleSlug);
      const result = await workos.userManagement.sendInvitation({
        email: args.email,
        organizationId: args.organizationId,
        roleSlug,
      });
      return accepted("workos", "inviteUser", result.id);
    },
    async updateMembershipRole(args: {
      membershipId: string;
      roleSlug: string;
    }): Promise<AcceptedResult> {
      const roleSlug = normalizeWorkosRoleSlug(args.roleSlug);
      requireNonEmptyRoleSlug(roleSlug);
      await workos.userManagement.updateOrganizationMembership(
        args.membershipId,
        {
          roleSlug,
        }
      );
      return accepted("workos", "updateMembershipRole", args.membershipId);
    },
    async updateMembershipRoles(args: {
      membershipId: string;
      primaryRoleSlug?: string;
      roleSlugs: string[];
    }): Promise<AcceptedResult> {
      const rolesPayload = buildWorkosMembershipRolesPayload(args);
      await workos.userManagement.updateOrganizationMembership(
        args.membershipId,
        rolesPayload
      );
      return accepted("workos", "updateMembershipRoles", args.membershipId);
    },
    async createMembership(args: {
      organizationId: string;
      primaryRoleSlug?: string;
      roleSlugs: string[];
      userId: string;
    }): Promise<AcceptedResult> {
      const rolesPayload = buildWorkosMembershipRolesPayload(args);
      const existingMemberships = await (
        await workos.userManagement.listOrganizationMemberships({
          organizationId: args.organizationId,
          statuses: ["active", "inactive", "pending"],
          userId: args.userId,
        } as any)
      ).autoPagination();
      const existing = existingMemberships[0];
      if (existing) {
        if (existing.status === "inactive") {
          await workos.userManagement.reactivateOrganizationMembership(
            existing.id
          );
        }
        await workos.userManagement.updateOrganizationMembership(existing.id, {
          ...rolesPayload,
        });
        return accepted("workos", "createMembership", existing.id);
      }
      const membership =
        await workos.userManagement.createOrganizationMembership({
          organizationId: args.organizationId,
          ...rolesPayload,
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

export async function provisionBuilderStaffUserWithWorkos(
  workos: WorkosProvisionClient,
  args: {
    email: string;
    organizationId: string;
  }
): Promise<BuilderStaffProvisionResult> {
  const email = normalizeWorkosEmail(args.email);
  const roleSlug = "builder-staff";
  const invitationId = await sendOrResendBuilderStaffInvitation(workos, {
    email,
    organizationId: args.organizationId,
    roleSlug,
  });
  try {
    const user = await findOrCreateWorkosUser(workos, email);
    const membership = await ensureWorkosMembershipRole(workos, {
      organizationId: args.organizationId,
      roleSlug,
      userId: user.id,
    });

    return {
      adapter: "workos",
      ...(invitationId ? { invitationId } : {}),
      membershipId: membership.id,
      operation: "provisionBuilderStaffUser",
      status: "accepted",
      sync: "waiting-for-webhook",
      userId: user.id,
    };
  } catch (error) {
    if (!invitationId) {
      throw error;
    }
    return {
      adapter: "workos",
      invitationId,
      membershipId: pendingBuilderStaffMembershipId(invitationId),
      operation: "provisionBuilderStaffUser",
      status: "accepted",
      sync: "waiting-for-webhook",
      userId: pendingBuilderStaffWorkosUserId(email),
    };
  }
}

async function findOrCreateWorkosUser(
  workos: WorkosProvisionClient,
  email: string
) {
  const existingUser = await findWorkosUserByEmail(workos, email);
  if (existingUser) {
    return existingUser;
  }
  try {
    return await workos.userManagement.createUser({
      email,
      emailVerified: false,
    });
  } catch (error) {
    if (isWorkosConflict(error)) {
      const racedUser = await findWorkosUserByEmail(workos, email);
      if (racedUser) {
        return racedUser;
      }
    }
    throw error;
  }
}

async function findWorkosUserByEmail(
  workos: WorkosProvisionClient,
  email: string
) {
  const existingUsers = await (
    await workos.userManagement.listUsers({ email })
  ).autoPagination();
  return (
    existingUsers.find(
      (user) => user.email.trim().toLowerCase() === email
    ) ?? null
  );
}

async function ensureWorkosMembershipRole(
  workos: WorkosProvisionClient,
  args: {
    organizationId: string;
    roleSlug: "builder-staff";
    userId: string;
  }
) {
  const existingMemberships = await (
    await workos.userManagement.listOrganizationMemberships({
      organizationId: args.organizationId,
      statuses: ["active", "inactive", "pending"],
      userId: args.userId,
    })
  ).autoPagination();
  const existing = existingMemberships[0];
  if (!existing) {
    return await workos.userManagement.createOrganizationMembership({
      organizationId: args.organizationId,
      roleSlugs: [args.roleSlug],
      userId: args.userId,
    });
  }

  if (existing.status === "inactive") {
    await workos.userManagement.reactivateOrganizationMembership(existing.id);
  }

  const roleSlugs = [
    ...new Set([
      ...workosMembershipRoleSlugs(existing),
      args.roleSlug,
    ]),
  ];
  return await workos.userManagement.updateOrganizationMembership(existing.id, {
    roleSlugs,
  });
}

async function sendOrResendBuilderStaffInvitation(
  workos: WorkosProvisionClient,
  args: {
    email: string;
    organizationId: string;
    roleSlug: "builder-staff";
  }
) {
  try {
    const invitation = await workos.userManagement.sendInvitation(args);
    return invitation.id;
  } catch (error) {
    if (isWorkosConflict(error)) {
      return await resendLatestPendingBuilderStaffInvitation(workos, args);
    }
    throw error;
  }
}

async function resendLatestPendingBuilderStaffInvitation(
  workos: WorkosProvisionClient,
  args: {
    email: string;
    organizationId: string;
  }
) {
  const invitations = await (
    await workos.userManagement.listInvitations({
      email: args.email,
      organizationId: args.organizationId,
    })
  ).autoPagination();
  const pending = invitations
    .filter((invitation) => invitation.state === "pending")
    .sort(
      (left, right) =>
        workosTimestamp(right.updatedAt ?? right.createdAt) -
        workosTimestamp(left.updatedAt ?? left.createdAt)
    );
  const latest = pending[0];
  if (!latest) {
    return undefined;
  }
  const invitation = await workos.userManagement.resendInvitation(latest.id);
  return invitation.id || latest.id;
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

function normalizeWorkosEmail(email: string) {
  const normalized = email.trim().toLowerCase();
  if (!normalized) {
    throw new Error("WorkOS user email is required");
  }
  return normalized;
}

function normalizeWorkosRoleSlug(roleSlug: string) {
  const normalized = normalizeRoleSlug(roleSlug);
  if (!normalized) {
    throw new Error(`Unknown WorkOS role slug: ${roleSlug}`);
  }
  return normalized;
}

function normalizeWorkosRoleSlugs(roleSlugs: string[]) {
  return [...new Set(roleSlugs.map(normalizeWorkosRoleSlug))];
}

function workosMembershipRoleSlugs(membership: {
  role?: { slug?: unknown };
  roles?: Array<{ slug?: unknown }>;
}) {
  return normalizeWorkosRoleSlugs(
    [
      typeof membership.role?.slug === "string"
        ? membership.role.slug
        : undefined,
      ...(membership.roles ?? []).map((role) => role.slug),
    ].filter((role): role is string => typeof role === "string")
  );
}

export function buildWorkosMembershipRolesPayload(args: {
  primaryRoleSlug?: string;
  roleSlugs: string[];
}): { roleSlug: string } | { roleSlugs: string[] } {
  const roleSlugs = normalizeWorkosRoleSlugs(args.roleSlugs);
  const primaryRoleSlug =
    args.primaryRoleSlug === undefined
      ? undefined
      : normalizeWorkosRoleSlug(args.primaryRoleSlug);

  if (roleSlugs.length > 0) {
    requireSelectedPrimaryRole(primaryRoleSlug, roleSlugs);
    return { roleSlugs };
  }
  if (primaryRoleSlug !== undefined) {
    requireNonEmptyRoleSlug(primaryRoleSlug);
    return { roleSlug: primaryRoleSlug };
  }

  throw new Error("At least one WorkOS role slug is required");
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
    created_at: stringOrNow(
      sanitized.updated_at ??
        sanitized.updatedAt ??
        sanitized.created_at ??
        sanitized.createdAt
    ),
    data: sanitized,
    event,
    id: `sync:${event}:${id}`,
  };
}

function stringOrNow(value: unknown): string {
  return typeof value === "string" ? value : new Date().toISOString();
}

function workosIdSlug(value: string) {
  return value.replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

function workosTimestamp(value: string | undefined) {
  if (!value) {
    return 0;
  }
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function isWorkosConflict(error: unknown) {
  if (
    typeof error === "object" &&
    error !== null &&
    "status" in error &&
    (error as { status?: unknown }).status === 409
  ) {
    return true;
  }
  const message = workosErrorMessage(error);
  return (
    /user already a member of (?:the )?organization/i.test(message) ||
    /email already invited to (?:the )?organization/i.test(message)
  );
}

function workosErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }
  if (
    typeof error === "object" &&
    error !== null &&
    "message" in error &&
    typeof (error as { message?: unknown }).message === "string"
  ) {
    return (error as { message: string }).message;
  }
  return String(error);
}
