import { v } from "convex/values";

import { api, internal } from "./_generated/api";
import {
  normalizeRoleSlugs,
  type RoleSlug,
  userManagementWriteAction,
  userManagementWriteMutation,
  userManagementWriteQuery,
} from "./authz";
import { internalMutation } from "./fluent";
import type { ActionCtx, Doc, Id, MutationCtx } from "./types";

const FAIRLEND_BROKERAGE_NAME = "FairLendBrokerage";
const FAIRLEND_WORKOS_ORGANIZATION_ID = "org_01KSNW6JHW9P9YS41DZX1YHHGS";
const FAIRLEND_PRINCIPAL_BROKER_WORKOS_USER_ID =
  "user_01KR207FRFHQT46EV9N538XBF3";
const BROKER_ROLES = ["principle-broker", "broker"] as const;
const BUILDER_ROLES = ["builder", "builder-staff"] as const;

export const listBrokerageProvisioning = userManagementWriteQuery
  .returns(v.any())
  .handler(async (ctx) => {
    const [
      organizations,
      memberships,
      users,
      brokerages,
      builderProfiles,
      builderAccountLinks,
    ] = await Promise.all([
      ctx.db.query("workosOrganizations").collect(),
      ctx.db.query("workosOrganizationMemberships").collect(),
      ctx.db.query("users").collect(),
      ctx.db.query("brokerages").collect(),
      ctx.db.query("builderProfiles").collect(),
      ctx.db.query("builderAccountLinks").collect(),
    ]);

    const usersByWorkosId = new Map(
      users
        .filter((user) => user.workosUserId)
        .map((user) => [user.workosUserId as string, user])
    );
    const brokeragesByWorkosOrg = new Map(
      brokerages.map((brokerage) => [brokerage.workosOrganizationId, brokerage])
    );
    const builderProfilesByOrg = new Map(
      builderProfiles.map((profile) => [profile.organizationId, profile])
    );
    const linksByProfile = new Map<string, typeof builderAccountLinks>();
    for (const link of builderAccountLinks) {
      if (link.status !== "active") {
        continue;
      }
      const list = linksByProfile.get(link.builderProfileId as string) ?? [];
      list.push(link);
      linksByProfile.set(link.builderProfileId as string, list);
    }

    return {
      fairLendBootstrap: {
        displayName: FAIRLEND_BROKERAGE_NAME,
        principalBrokerWorkosUserId: FAIRLEND_PRINCIPAL_BROKER_WORKOS_USER_ID,
        workosOrganizationId: FAIRLEND_WORKOS_ORGANIZATION_ID,
      },
      organizations: organizations.map((organization) => {
        const brokerage = brokeragesByWorkosOrg.get(
          organization.workosOrganizationId
        );
        const orgMemberships = memberships.filter(
          (membership) =>
            membership.status === "active" &&
            membership.workosOrganizationId ===
              organization.workosOrganizationId
        );
        const projectMembership = (
          membership: (typeof orgMemberships)[number]
        ) => {
          const user = usersByWorkosId.get(membership.workosUserId);
          return {
            email: user?.email,
            name: user?.name,
            roleSlugs: membershipRoleSlugs(membership),
            workosMembershipId: membership.workosMembershipId,
            workosUserId: membership.workosUserId,
          };
        };
        const brokerMemberships = orgMemberships
          .filter((membership) =>
            hasAnyRole(membershipRoleSlugs(membership), BROKER_ROLES)
          )
          .map(projectMembership);
        const builderMemberships = orgMemberships
          .filter((membership) =>
            hasAnyRole(membershipRoleSlugs(membership), BUILDER_ROLES)
          )
          .map(projectMembership);

        const builderProfile = builderProfilesByOrg.get(
          organization.workosOrganizationId
        );
        const builderAccountLinkRows = builderProfile
          ? (linksByProfile.get(builderProfile._id as string) ?? []).map(
              (link) => ({
                _id: link._id as string,
                role: link.role,
                workosUserId: link.workosUserId,
              })
            )
          : [];

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
          builderAccountLinks: builderAccountLinkRows,
          builderMemberships,
          builderProfile: builderProfile
            ? {
                _id: builderProfile._id,
                displayName: builderProfile.displayName,
                status: builderProfile.status,
              }
            : null,
          hasBrokerageProfile: Boolean(brokerage),
          hasBuilderProfile: Boolean(builderProfile),
          name: organization.name,
          needsBrokerageProfile:
            !brokerage &&
            organization.status === "active" &&
            brokerMemberships.length > 0,
          needsBuilderProfile:
            !builderProfile &&
            organization.status === "active" &&
            builderMemberships.length > 0 &&
            Boolean(brokerage),
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
    })
  )
  .handler(async (ctx, args) => {
    const membership = await requireProvisioningScope(
      ctx,
      args.workosOrganizationId
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
        q.eq("workosOrganizationId", args.workosOrganizationId)
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
    })
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
        q.eq("workosOrganizationId", FAIRLEND_WORKOS_ORGANIZATION_ID)
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

export const provisionBuilderProfile = userManagementWriteMutation
  .input({
    displayName: v.string(),
    ownerWorkosUserId: v.optional(v.string()),
    workosOrganizationId: v.string(),
  })
  .returns(
    v.object({
      builderProfileId: v.id("builderProfiles"),
      linkId: v.union(v.id("builderAccountLinks"), v.null()),
      operation: v.union(v.literal("created"), v.literal("updated")),
    })
  )
  .handler(async (ctx, args) => {
    await requireProvisioningScope(ctx, args.workosOrganizationId);
    const brokerage = await ctx.db
      .query("brokerages")
      .withIndex("by_workos_organization", (q) =>
        q.eq("workosOrganizationId", args.workosOrganizationId)
      )
      .unique();
    if (!brokerage) {
      throw new Error(
        "Provision a brokerage profile for this organization before adding a builder profile."
      );
    }
    // A builder's display name is the borrower company, supplied explicitly. It
    // must never fall back to the brokerage or its (shared) WorkOS organization
    // name, or the lender's name leaks onto builder rows. Builders are
    // provisioned into the lender's org, so the org name is the lender's, not
    // the builder's.
    const displayName = args.displayName.trim();
    if (!displayName) {
      throw new Error("A builder company name is required.");
    }
    if (
      brokerage.workosOrganizationId === args.workosOrganizationId &&
      displayName.toLowerCase() === brokerage.displayName.toLowerCase()
    ) {
      throw new Error(
        "A builder profile must use the builder's own company name, not the brokerage name."
      );
    }
    const now = Date.now();
    // Ensure the org projection exists without renaming it: a builder shares the
    // lender's organization, so its name must remain the lender's.
    const existingOrg = await ctx.db
      .query("workosOrganizations")
      .withIndex("by_workos_organization_id", (q) =>
        q.eq("workosOrganizationId", args.workosOrganizationId)
      )
      .unique();
    await getOrCreateWorkosOrganization(ctx, {
      name: existingOrg?.name ?? brokerage.displayName,
      now,
      workosOrganizationId: args.workosOrganizationId,
    });
    const existing = await ctx.db
      .query("builderProfiles")
      .withIndex("by_organization", (q) =>
        q.eq("organizationId", args.workosOrganizationId)
      )
      .filter((q) => q.eq(q.field("displayName"), displayName))
      .first();
    let builderProfileId: Id<"builderProfiles">;
    let operation: "created" | "updated";
    if (existing) {
      await ctx.db.patch(existing._id, {
        brokerageId: brokerage._id,
        displayName,
        status: "active",
        updatedAt: now,
      });
      builderProfileId = existing._id;
      operation = "updated";
    } else {
      builderProfileId = await ctx.db.insert("builderProfiles", {
        brokerageId: brokerage._id,
        createdAt: now,
        displayName,
        organizationId: args.workosOrganizationId,
        status: "active",
        updatedAt: now,
      });
      operation = "created";
    }

    let linkId: Id<"builderAccountLinks"> | null = null;
    if (args.ownerWorkosUserId) {
      const link = await ctx.db
        .query("builderAccountLinks")
        .withIndex("by_builder_user", (q) =>
          q
            .eq("builderProfileId", builderProfileId)
            .eq("workosUserId", args.ownerWorkosUserId as string)
        )
        .unique();
      if (link) {
        await ctx.db.patch(link._id, {
          role: "owner",
          status: "active",
          updatedAt: now,
        });
        linkId = link._id;
      } else {
        linkId = await ctx.db.insert("builderAccountLinks", {
          brokerageId: brokerage._id,
          builderProfileId,
          createdAt: now,
          role: "owner",
          status: "active",
          updatedAt: now,
          workosUserId: args.ownerWorkosUserId,
        });
      }
    }

    return { builderProfileId, linkId, operation };
  })
  .public();

export const linkBuilderAccount = userManagementWriteMutation
  .input({
    builderProfileId: v.id("builderProfiles"),
    role: v.union(v.literal("owner"), v.literal("staff")),
    workosUserId: v.string(),
  })
  .returns(
    v.object({
      linkId: v.id("builderAccountLinks"),
      operation: v.union(v.literal("created"), v.literal("updated")),
    })
  )
  .handler(async (ctx, args) => {
    const profile = await ctx.db.get(args.builderProfileId);
    if (!profile) {
      throw new Error("Builder profile not found.");
    }
    await requireProvisioningScope(ctx, profile.organizationId);
    const now = Date.now();
    const existing = await ctx.db
      .query("builderAccountLinks")
      .withIndex("by_builder_user", (q) =>
        q
          .eq("builderProfileId", args.builderProfileId)
          .eq("workosUserId", args.workosUserId)
      )
      .unique();
    if (existing) {
      await ctx.db.patch(existing._id, {
        role: args.role,
        status: "active",
        updatedAt: now,
      });
      return { linkId: existing._id, operation: "updated" as const };
    }
    const linkId = await ctx.db.insert("builderAccountLinks", {
      brokerageId: profile.brokerageId,
      builderProfileId: args.builderProfileId,
      createdAt: now,
      role: args.role,
      status: "active",
      updatedAt: now,
      workosUserId: args.workosUserId,
    });
    return { linkId, operation: "created" as const };
  })
  .public();

export const unlinkBuilderAccount = userManagementWriteMutation
  .input({
    linkId: v.id("builderAccountLinks"),
  })
  .returns(v.object({ operation: v.literal("removed") }))
  .handler(async (ctx, args) => {
    const link = await ctx.db.get(args.linkId);
    if (!link) {
      throw new Error("Builder account link not found.");
    }
    const profile = await ctx.db.get(link.builderProfileId);
    if (!profile) {
      throw new Error("Builder profile not found.");
    }
    await requireProvisioningScope(ctx, profile.organizationId);
    await ctx.db.patch(args.linkId, {
      status: "inactive",
      updatedAt: Date.now(),
    });
    return { operation: "removed" as const };
  })
  .public();

type ProvisionNewBuilderResult = {
  brokerageId: Id<"brokerages">;
  builderProfileId: Id<"builderProfiles">;
  displayName: string;
  invite: {
    adapter: string;
    status: string;
    sync: string;
    workosInviteId: string;
  };
  linkId: Id<"builderAccountLinks">;
  operation: "created" | "reactivated";
  ownerEmail: string;
  ownerWorkosUserId: string;
  workosOrganizationId: string;
};

const provisionNewBuilderReturn = v.object({
  brokerageId: v.id("brokerages"),
  builderProfileId: v.id("builderProfiles"),
  displayName: v.string(),
  invite: v.object({
    adapter: v.string(),
    status: v.string(),
    sync: v.string(),
    workosInviteId: v.string(),
  }),
  linkId: v.id("builderAccountLinks"),
  operation: v.union(v.literal("created"), v.literal("reactivated")),
  ownerEmail: v.string(),
  ownerWorkosUserId: v.string(),
  workosOrganizationId: v.string(),
});

/**
 * Orchestrates new-builder onboarding from the brokerage backoffice:
 *   1. create a WorkOS account for the builder owner (invitation),
 *   2. provision the builder profile + owner account link under the brokerage.
 *
 * Account creation is a WorkOS-owned write, so this is an action that calls the
 * WorkOS adapter first, then commits the local projection + domain rows through
 * an internal mutation. Idempotent: re-running for the same email reactivates
 * the existing profile/link instead of duplicating rows.
 */
export const provisionNewBuilder = userManagementWriteAction
  .input({
    displayName: v.string(),
    ownerEmail: v.string(),
    ownerName: v.optional(v.string()),
    ownerWorkosUserId: v.optional(v.string()),
    workosOrganizationId: v.optional(v.string()),
  })
  .returns(provisionNewBuilderReturn)
  .handler(async (ctx: ActionCtx, args): Promise<ProvisionNewBuilderResult> => {
    const workosOrganizationId =
      args.workosOrganizationId?.trim() || FAIRLEND_WORKOS_ORGANIZATION_ID;
    const displayName = args.displayName.trim();
    if (!displayName) {
      throw new Error("Builder company name is required.");
    }
    const ownerEmail = normalizeEmail(args.ownerEmail);
    if (!ownerEmail) {
      throw new Error("A valid owner email is required.");
    }
    const ownerName = args.ownerName?.trim() || displayName;
    const ownerWorkosUserId =
      args.ownerWorkosUserId?.trim() ||
      provisionedBuilderWorkosUserId(ownerEmail);

    // Step 1: create the WorkOS account (invitation) for the builder owner.
    const invite: {
      adapter: string;
      status: string;
      sync: string;
      workosId?: string;
    } = await ctx.runAction(api.workosManagement.inviteUser, {
      email: ownerEmail,
      organizationId: workosOrganizationId,
      roleSlug: "builder",
    });

    // Step 2: commit the brokerage-scoped builder profile + owner link locally.
    const committed: {
      brokerageId: Id<"brokerages">;
      builderProfileId: Id<"builderProfiles">;
      displayName: string;
      linkId: Id<"builderAccountLinks">;
      operation: "created" | "reactivated";
    } = await ctx.runMutation(
      internal.brokerageProvisioning.finalizeNewBuilderProvisioning,
      {
        displayName,
        ownerEmail,
        ownerName,
        ownerWorkosUserId,
        workosOrganizationId,
      }
    );

    return {
      ...committed,
      invite: {
        adapter: invite.adapter,
        status: invite.status,
        sync: invite.sync,
        workosInviteId: invite.workosId ?? "",
      },
      ownerEmail,
      ownerWorkosUserId,
      workosOrganizationId,
    };
  })
  .public();

export const finalizeNewBuilderProvisioning = internalMutation
  .input({
    displayName: v.string(),
    ownerEmail: v.string(),
    ownerName: v.string(),
    ownerWorkosUserId: v.string(),
    workosOrganizationId: v.string(),
  })
  .returns(
    v.object({
      brokerageId: v.id("brokerages"),
      builderProfileId: v.id("builderProfiles"),
      displayName: v.string(),
      linkId: v.id("builderAccountLinks"),
      operation: v.union(v.literal("created"), v.literal("reactivated")),
    })
  )
  .handler(async (ctx, args) => {
    const now = Date.now();
    await getOrCreateWorkosOrganization(ctx, {
      name:
        args.workosOrganizationId === FAIRLEND_WORKOS_ORGANIZATION_ID
          ? FAIRLEND_BROKERAGE_NAME
          : args.displayName,
      now,
      workosOrganizationId: args.workosOrganizationId,
    });
    const brokerage = await ensureBrokerage(
      ctx,
      args.workosOrganizationId,
      now
    );

    await ensureWorkosUserAndMembership(ctx, {
      email: args.ownerEmail,
      name: args.ownerName,
      now,
      roleSlugs: ["builder"],
      workosOrganizationId: args.workosOrganizationId,
      workosUserId: args.ownerWorkosUserId,
    });

    const existingProfile = await ctx.db
      .query("builderProfiles")
      .withIndex("by_brokerage", (q) => q.eq("brokerageId", brokerage._id))
      .filter((q) => q.eq(q.field("displayName"), args.displayName))
      .first();
    let builderProfileId: Id<"builderProfiles">;
    if (existingProfile) {
      await ctx.db.patch(existingProfile._id, {
        status: "active",
        updatedAt: now,
      });
      builderProfileId = existingProfile._id;
    } else {
      builderProfileId = await ctx.db.insert("builderProfiles", {
        brokerageId: brokerage._id,
        createdAt: now,
        displayName: args.displayName,
        organizationId: args.workosOrganizationId,
        status: "active",
        updatedAt: now,
      });
    }

    const existingLink = await ctx.db
      .query("builderAccountLinks")
      .withIndex("by_builder_user", (q) =>
        q
          .eq("builderProfileId", builderProfileId)
          .eq("workosUserId", args.ownerWorkosUserId)
      )
      .unique();
    let linkId: Id<"builderAccountLinks">;
    let operation: "created" | "reactivated";
    if (existingLink) {
      await ctx.db.patch(existingLink._id, {
        role: "owner",
        status: "active",
        updatedAt: now,
      });
      linkId = existingLink._id;
      operation = "reactivated";
    } else {
      linkId = await ctx.db.insert("builderAccountLinks", {
        brokerageId: brokerage._id,
        builderProfileId,
        createdAt: now,
        role: "owner",
        status: "active",
        updatedAt: now,
        workosUserId: args.ownerWorkosUserId,
      });
      operation = "created";
    }

    return {
      brokerageId: brokerage._id,
      builderProfileId,
      displayName: args.displayName,
      linkId,
      operation,
    };
  })
  .internal();

async function requireProvisioningScope(
  ctx: MutationCtx & {
    viewer: { roles: RoleSlug[]; subject: string };
  },
  workosOrganizationId: string
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
  input: { name: string; now: number; workosOrganizationId: string }
) {
  const existing = await ctx.db
    .query("workosOrganizations")
    .withIndex("by_workos_organization_id", (q) =>
      q.eq("workosOrganizationId", input.workosOrganizationId)
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
  }
) {
  const user = await ctx.db
    .query("users")
    .withIndex("by_workos_user_id", (q) =>
      q.eq("workosUserId", input.workosUserId)
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
      q.eq(q.field("workosOrganizationId"), input.workosOrganizationId)
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
  membership: Pick<
    Doc<"workosOrganizationMemberships">,
    "roleSlug" | "roleSlugs"
  >
) {
  return normalizeRoleSlugs([
    membership.roleSlug,
    ...(membership.roleSlugs ?? []),
  ]);
}

function hasAnyRole(
  actual: readonly RoleSlug[],
  expected: readonly RoleSlug[]
) {
  return actual.some((role) => expected.includes(role));
}

function normalizeEmail(value: string): string {
  const trimmed = value.trim().toLowerCase();
  // Minimal structural check: exactly one @ with non-empty local and domain parts.
  const at = trimmed.indexOf("@");
  if (at <= 0 || at !== trimmed.lastIndexOf("@") || at === trimmed.length - 1) {
    return "";
  }
  if (!trimmed.slice(at + 1).includes(".")) {
    return "";
  }
  return trimmed;
}

/**
 * Deterministic provisional WorkOS user id for an invited builder owner, so the
 * owner account link and projection resolve immediately and idempotently before
 * the real WorkOS user id arrives by webhook. Stable for a given email.
 */
function provisionedBuilderWorkosUserId(email: string): string {
  const slug = email.replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  return `provisioned_builder_${slug}`;
}

async function ensureBrokerage(
  ctx: MutationCtx,
  workosOrganizationId: string,
  now: number
): Promise<Doc<"brokerages">> {
  const existing = await ctx.db
    .query("brokerages")
    .withIndex("by_workos_organization", (q) =>
      q.eq("workosOrganizationId", workosOrganizationId)
    )
    .unique();
  if (existing) {
    if (existing.status !== "active") {
      await ctx.db.patch(existing._id, { status: "active", updatedAt: now });
      return { ...existing, status: "active" };
    }
    return existing;
  }
  if (workosOrganizationId !== FAIRLEND_WORKOS_ORGANIZATION_ID) {
    throw new Error(
      "Provision a brokerage profile for this organization before adding a builder."
    );
  }
  const brokerageId = await ctx.db.insert("brokerages", {
    createdAt: now,
    displayName: FAIRLEND_BROKERAGE_NAME,
    legalName: FAIRLEND_BROKERAGE_NAME,
    principalBrokerWorkosUserId: FAIRLEND_PRINCIPAL_BROKER_WORKOS_USER_ID,
    status: "active",
    updatedAt: now,
    workosOrganizationId,
  });
  const brokerage = await ctx.db.get(brokerageId);
  if (!brokerage) {
    throw new Error("Unable to provision FairLend brokerage.");
  }
  return brokerage;
}
