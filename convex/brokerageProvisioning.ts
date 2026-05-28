import { v } from "convex/values";

import {
  normalizeRoleSlugs,
  type RoleSlug,
  userManagementWriteMutation,
  userManagementWriteQuery,
} from "./authz";
import type { Doc, MutationCtx } from "./types";

const FAIRLEND_BROKERAGE_NAME = "FairLendBrokerage";
const FAIRLEND_WORKOS_ORGANIZATION_ID = "org_01KSNW6JHW9P9YS41DZX1YHHGS";
const FAIRLEND_PRINCIPAL_BROKER_WORKOS_USER_ID =
  "user_01KR207FRFHQT46EV9N538XBF3";
const BROKER_ROLES = ["principle-broker", "broker"] as const;

export const listBrokerageProvisioning = userManagementWriteQuery
  .returns(v.any())
  .handler(async (ctx) => {
    const [organizations, memberships, users, brokerages] = await Promise.all([
      ctx.db.query("workosOrganizations").collect(),
      ctx.db.query("workosOrganizationMemberships").collect(),
      ctx.db.query("users").collect(),
      ctx.db.query("brokerages").collect(),
    ]);

    const usersByWorkosId = new Map(
      users
        .filter((user) => user.workosUserId)
        .map((user) => [user.workosUserId as string, user]),
    );
    const brokeragesByWorkosOrg = new Map(
      brokerages.map((brokerage) => [brokerage.workosOrganizationId, brokerage]),
    );

    return {
      fairLendBootstrap: {
        displayName: FAIRLEND_BROKERAGE_NAME,
        principalBrokerWorkosUserId: FAIRLEND_PRINCIPAL_BROKER_WORKOS_USER_ID,
        workosOrganizationId: FAIRLEND_WORKOS_ORGANIZATION_ID,
      },
      organizations: organizations.map((organization) => {
        const brokerage = brokeragesByWorkosOrg.get(
          organization.workosOrganizationId,
        );
        const brokerMemberships = memberships
          .filter(
            (membership) =>
              membership.status === "active" &&
              membership.workosOrganizationId ===
                organization.workosOrganizationId &&
              hasAnyRole(membershipRoleSlugs(membership), BROKER_ROLES),
          )
          .map((membership) => {
            const user = usersByWorkosId.get(membership.workosUserId);
            return {
              email: user?.email,
              name: user?.name,
              roleSlugs: membershipRoleSlugs(membership),
              workosMembershipId: membership.workosMembershipId,
              workosUserId: membership.workosUserId,
            };
          });

        return {
          brokerage: brokerage
            ? {
                _id: brokerage._id,
                displayName: brokerage.displayName,
                legalName: brokerage.legalName,
                principalBrokerWorkosUserId:
                  brokerage.principalBrokerWorkosUserId,
                status: brokerage.status,
              }
            : null,
          brokerMemberships,
          hasBrokerageProfile: Boolean(brokerage),
          name: organization.name,
          needsBrokerageProfile:
            !brokerage &&
            organization.status === "active" &&
            brokerMemberships.length > 0,
          status: organization.status,
          workosOrganizationId: organization.workosOrganizationId,
        };
      }),
    };
  })
  .public();

export const provisionBrokerageProfile = userManagementWriteMutation
  .input({
    displayName: v.optional(v.string()),
    legalName: v.optional(v.string()),
    principalBrokerWorkosUserId: v.optional(v.string()),
    workosOrganizationId: v.string(),
  })
  .returns(
    v.object({
      brokerageId: v.id("brokerages"),
      operation: v.union(v.literal("created"), v.literal("updated")),
    }),
  )
  .handler(async (ctx, args) => {
    const membership = await requireProvisioningScope(
      ctx,
      args.workosOrganizationId,
    );
    const now = Date.now();
    const organization = await getOrCreateWorkosOrganization(ctx, {
      name:
        args.workosOrganizationId === FAIRLEND_WORKOS_ORGANIZATION_ID
          ? FAIRLEND_BROKERAGE_NAME
          : (args.displayName?.trim() ?? "DrawFlow Brokerage"),
      now,
      workosOrganizationId: args.workosOrganizationId,
    });
    const principalBrokerWorkosUserId =
      args.principalBrokerWorkosUserId?.trim() ||
      (args.workosOrganizationId === FAIRLEND_WORKOS_ORGANIZATION_ID
        ? FAIRLEND_PRINCIPAL_BROKER_WORKOS_USER_ID
        : undefined) ||
      (hasAnyRole(membershipRoleSlugs(membership), ["principle-broker"])
        ? membership.workosUserId
        : undefined);
    const existing = await ctx.db
      .query("brokerages")
      .withIndex("by_workos_organization", (q) =>
        q.eq("workosOrganizationId", args.workosOrganizationId),
      )
      .unique();
    const displayName =
      args.displayName?.trim() ||
      (args.workosOrganizationId === FAIRLEND_WORKOS_ORGANIZATION_ID
        ? FAIRLEND_BROKERAGE_NAME
        : organization.name);
    const legalName = args.legalName?.trim() || displayName;

    if (existing) {
      await ctx.db.patch(existing._id, {
        displayName,
        legalName,
        principalBrokerWorkosUserId:
          principalBrokerWorkosUserId ?? existing.principalBrokerWorkosUserId,
        status: "active",
        updatedAt: now,
      });
      return { brokerageId: existing._id, operation: "updated" as const };
    }

    const brokerageId = await ctx.db.insert("brokerages", {
      createdAt: now,
      displayName,
      legalName,
      principalBrokerWorkosUserId,
      status: "active",
      updatedAt: now,
      workosOrganizationId: args.workosOrganizationId,
    });
    return { brokerageId, operation: "created" as const };
  })
  .public();

export const provisionFairLendBrokerage = userManagementWriteMutation
  .returns(
    v.object({
      brokerageId: v.id("brokerages"),
      operation: v.union(v.literal("created"), v.literal("updated")),
    }),
  )
  .handler(async (ctx) => {
    const now = Date.now();
    await getOrCreateWorkosOrganization(ctx, {
      name: FAIRLEND_BROKERAGE_NAME,
      now,
      workosOrganizationId: FAIRLEND_WORKOS_ORGANIZATION_ID,
    });
    await ensureWorkosUserAndMembership(ctx, {
      email: "principal@fairlend.local",
      name: "FairLend Principal Broker",
      now,
      roleSlugs: ["principle-broker"],
      workosOrganizationId: FAIRLEND_WORKOS_ORGANIZATION_ID,
      workosUserId: FAIRLEND_PRINCIPAL_BROKER_WORKOS_USER_ID,
    });

    const existing = await ctx.db
      .query("brokerages")
      .withIndex("by_workos_organization", (q) =>
        q.eq("workosOrganizationId", FAIRLEND_WORKOS_ORGANIZATION_ID),
      )
      .unique();
    if (existing) {
      await ctx.db.patch(existing._id, {
        displayName: FAIRLEND_BROKERAGE_NAME,
        legalName: FAIRLEND_BROKERAGE_NAME,
        principalBrokerWorkosUserId: FAIRLEND_PRINCIPAL_BROKER_WORKOS_USER_ID,
        status: "active",
        updatedAt: now,
      });
      return { brokerageId: existing._id, operation: "updated" as const };
    }

    const brokerageId = await ctx.db.insert("brokerages", {
      createdAt: now,
      displayName: FAIRLEND_BROKERAGE_NAME,
      legalName: FAIRLEND_BROKERAGE_NAME,
      principalBrokerWorkosUserId: FAIRLEND_PRINCIPAL_BROKER_WORKOS_USER_ID,
      status: "active",
      updatedAt: now,
      workosOrganizationId: FAIRLEND_WORKOS_ORGANIZATION_ID,
    });
    return { brokerageId, operation: "created" as const };
  })
  .public();

async function requireProvisioningScope(
  ctx: MutationCtx & {
    viewer: { roles: RoleSlug[]; subject: string };
  },
  workosOrganizationId: string,
) {
  const membership = await ctx.db
    .query("workosOrganizationMemberships")
    .withIndex("by_user", (q) => q.eq("workosUserId", ctx.viewer.subject))
    .filter((q) => q.eq(q.field("workosOrganizationId"), workosOrganizationId))
    .first();

  if (ctx.viewer.roles.includes("admin")) {
    return (
      membership ?? {
        roleSlug: "admin",
        roleSlugs: ["admin"],
        status: "active",
        workosMembershipId: `platform_admin:${ctx.viewer.subject}`,
        workosOrganizationId,
        workosUserId: ctx.viewer.subject,
      }
    );
  }

  if (!membership || membership.status !== "active") {
    throw new Error("Forbidden: WorkOS membership");
  }
  if (!hasAnyRole(membershipRoleSlugs(membership), ["principle-broker"])) {
    throw new Error("Forbidden: brokerage provisioning");
  }
  return membership;
}

async function getOrCreateWorkosOrganization(
  ctx: MutationCtx,
  input: { name: string; now: number; workosOrganizationId: string },
) {
  const existing = await ctx.db
    .query("workosOrganizations")
    .withIndex("by_workos_organization_id", (q) =>
      q.eq("workosOrganizationId", input.workosOrganizationId),
    )
    .unique();
  if (existing) {
    if (existing.status !== "active" || existing.name !== input.name) {
      await ctx.db.patch(existing._id, {
        name: input.name,
        status: "active",
        updatedAt: input.now,
      });
    }
    return { ...existing, name: input.name, status: "active" as const };
  }

  const id = await ctx.db.insert("workosOrganizations", {
    createdAt: input.now,
    domains: [],
    name: input.name,
    sourceEventId: `brokerage_provisioning:${input.workosOrganizationId}`,
    sourceEventType: "brokerage.provisioning",
    status: "active",
    updatedAt: input.now,
    workosOrganizationId: input.workosOrganizationId,
  });
  const organization = await ctx.db.get(id);
  if (!organization) {
    throw new Error("Unable to provision WorkOS organization projection");
  }
  return organization;
}

async function ensureWorkosUserAndMembership(
  ctx: MutationCtx,
  input: {
    email: string;
    name: string;
    now: number;
    roleSlugs: RoleSlug[];
    workosOrganizationId: string;
    workosUserId: string;
  },
) {
  const user = await ctx.db
    .query("users")
    .withIndex("by_workos_user_id", (q) =>
      q.eq("workosUserId", input.workosUserId),
    )
    .unique();
  if (user) {
    await ctx.db.patch(user._id, {
      email: user.email || input.email,
      name: user.name || input.name,
      status: "active",
      updatedAt: input.now,
    });
  } else {
    await ctx.db.insert("users", {
      authId: input.workosUserId,
      createdAt: input.now,
      email: input.email,
      emailVerified: true,
      name: input.name,
      sourceEventId: `brokerage_provisioning:${input.workosUserId}`,
      sourceEventType: "brokerage.provisioning",
      status: "active",
      updatedAt: input.now,
      workosUserId: input.workosUserId,
    });
  }

  const membership = await ctx.db
    .query("workosOrganizationMemberships")
    .withIndex("by_user", (q) => q.eq("workosUserId", input.workosUserId))
    .filter((q) =>
      q.eq(q.field("workosOrganizationId"), input.workosOrganizationId),
    )
    .first();
  if (membership) {
    await ctx.db.patch(membership._id, {
      roleSlug: input.roleSlugs[0],
      roleSlugs: input.roleSlugs,
      status: "active",
      updatedAt: input.now,
    });
    return;
  }

  await ctx.db.insert("workosOrganizationMemberships", {
    createdAt: input.now,
    roleSlug: input.roleSlugs[0],
    roleSlugs: input.roleSlugs,
    sourceEventId: `brokerage_provisioning:${input.workosOrganizationId}:${input.workosUserId}`,
    sourceEventType: "brokerage.provisioning",
    status: "active",
    updatedAt: input.now,
    workosMembershipId: `brokerage_provisioning_${input.workosOrganizationId}_${input.workosUserId}`,
    workosOrganizationId: input.workosOrganizationId,
    workosUserId: input.workosUserId,
  });
}

function membershipRoleSlugs(
  membership: Pick<Doc<"workosOrganizationMemberships">, "roleSlug" | "roleSlugs">,
) {
  return normalizeRoleSlugs([
    membership.roleSlug,
    ...(membership.roleSlugs ?? []),
  ]);
}

function hasAnyRole(
  actual: readonly RoleSlug[],
  expected: readonly RoleSlug[],
) {
  return actual.some((role) => expected.includes(role));
}
