import { internal } from "../_generated/api";
import { v } from "convex/values";
import {
  normalizeRoleSlugs,
  type RoleSlug,
  userManagementWriteAction,
  userManagementWriteMutation,
} from "../authz";
import {
  ensureBuilderBrokerAssignmentForWorkflow,
  requireDefaultBrokerMember,
  requireEligibleBrokerMember,
} from "../brokerAssignments";
import {
  FAIRLEND_BROKERAGE_NAME,
  FAIRLEND_DEFAULT_BROKER_EMAIL,
  FAIRLEND_PRINCIPAL_BROKER_WORKOS_USER_ID,
  FAIRLEND_WORKOS_ORGANIZATION_ID,
} from "../fairLendConfig";
import { internalMutation } from "../fluent";
import type { Doc, Id, MutationCtx } from "../types";

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
    const organization = await requireWorkosOrganizationProjection(
      ctx,
      args.workosOrganizationId,
    );
    const existing = await ctx.db
      .query("brokerages")
      .withIndex("by_workos_organization", (q) =>
        q.eq("workosOrganizationId", args.workosOrganizationId),
      )
      .unique();
    const requestedPrincipalBrokerWorkosUserId =
      args.principalBrokerWorkosUserId?.trim() ||
      (hasAnyRole(membershipRoleSlugs(membership), ["principle-broker"])
        ? membership.workosUserId
        : undefined);
    const principal =
      args.workosOrganizationId === FAIRLEND_WORKOS_ORGANIZATION_ID
        ? await requireDefaultBrokerMember(ctx, {
            principalBrokerEmail: FAIRLEND_DEFAULT_BROKER_EMAIL,
            principalBrokerWorkosUserId: requestedPrincipalBrokerWorkosUserId,
            workosOrganizationId: args.workosOrganizationId,
          })
        : requestedPrincipalBrokerWorkosUserId
          ? {
              ...(await requireEligibleBrokerMember(ctx, {
                workosOrganizationId: args.workosOrganizationId,
                workosUserId: requestedPrincipalBrokerWorkosUserId,
              })),
              workosUserId: requestedPrincipalBrokerWorkosUserId,
            }
          : existing
            ? await requireDefaultBrokerMember(ctx, existing)
            : null;
    if (!principal) {
      throw new Error(
        "Configure an active principal broker before provisioning the brokerage.",
      );
    }
    const principalBrokerEmail = normalizeEmail(principal.broker.email);
    if (!principalBrokerEmail) {
      throw new Error("The principal broker must have a valid email address.");
    }
    const displayName =
      args.displayName?.trim() ||
      (args.workosOrganizationId === FAIRLEND_WORKOS_ORGANIZATION_ID
        ? FAIRLEND_BROKERAGE_NAME
        : organization.name);
    const legalName = args.legalName?.trim() || displayName;

    if (existing) {
      const priorState = {
        displayName: existing.displayName,
        legalName: existing.legalName,
        principalBrokerEmail: existing.principalBrokerEmail,
        principalBrokerWorkosUserId: existing.principalBrokerWorkosUserId,
        status: existing.status,
      };
      await ctx.db.patch(existing._id, {
        displayName,
        legalName,
        principalBrokerEmail,
        principalBrokerWorkosUserId: principal.workosUserId,
        status: "active",
        updatedAt: now,
      });
      await recordBrokerageProvisioningAudit(ctx, {
        brokerageId: existing._id,
        newState: {
          displayName,
          legalName,
          principalBrokerEmail,
          principalBrokerWorkosUserId: principal.workosUserId,
          status: "active",
        },
        operation: "updated",
        organizationId: args.workosOrganizationId,
        priorState,
      });
      return { brokerageId: existing._id, operation: "updated" as const };
    }

    const brokerageId = await ctx.db.insert("brokerages", {
      createdAt: now,
      displayName,
      legalName,
      principalBrokerEmail,
      principalBrokerWorkosUserId: principal.workosUserId,
      status: "active",
      updatedAt: now,
      workosOrganizationId: args.workosOrganizationId,
    });
    await recordBrokerageProvisioningAudit(ctx, {
      brokerageId,
      newState: {
        displayName,
        legalName,
        principalBrokerEmail,
        principalBrokerWorkosUserId: principal.workosUserId,
        status: "active",
      },
      operation: "created",
      organizationId: args.workosOrganizationId,
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
    await requireWorkosOrganizationProjection(
      ctx,
      FAIRLEND_WORKOS_ORGANIZATION_ID,
    );
    const principal = await requireDefaultBrokerMember(ctx, {
      principalBrokerEmail: FAIRLEND_DEFAULT_BROKER_EMAIL,
      principalBrokerWorkosUserId: FAIRLEND_PRINCIPAL_BROKER_WORKOS_USER_ID,
      workosOrganizationId: FAIRLEND_WORKOS_ORGANIZATION_ID,
    });

    const existing = await ctx.db
      .query("brokerages")
      .withIndex("by_workos_organization", (q) =>
        q.eq("workosOrganizationId", FAIRLEND_WORKOS_ORGANIZATION_ID),
      )
      .unique();
    if (existing) {
      const priorState = {
        displayName: existing.displayName,
        legalName: existing.legalName,
        principalBrokerEmail: existing.principalBrokerEmail,
        principalBrokerWorkosUserId: existing.principalBrokerWorkosUserId,
        status: existing.status,
      };
      await ctx.db.patch(existing._id, {
        displayName: FAIRLEND_BROKERAGE_NAME,
        legalName: FAIRLEND_BROKERAGE_NAME,
        principalBrokerEmail: FAIRLEND_DEFAULT_BROKER_EMAIL,
        principalBrokerWorkosUserId: principal.workosUserId,
        status: "active",
        updatedAt: now,
      });
      await recordBrokerageProvisioningAudit(ctx, {
        brokerageId: existing._id,
        newState: {
          displayName: FAIRLEND_BROKERAGE_NAME,
          legalName: FAIRLEND_BROKERAGE_NAME,
          principalBrokerEmail: FAIRLEND_DEFAULT_BROKER_EMAIL,
          principalBrokerWorkosUserId: principal.workosUserId,
          status: "active",
        },
        operation: "updated",
        organizationId: FAIRLEND_WORKOS_ORGANIZATION_ID,
        priorState,
      });
      return { brokerageId: existing._id, operation: "updated" as const };
    }

    const brokerageId = await ctx.db.insert("brokerages", {
      createdAt: now,
      displayName: FAIRLEND_BROKERAGE_NAME,
      legalName: FAIRLEND_BROKERAGE_NAME,
      principalBrokerEmail: FAIRLEND_DEFAULT_BROKER_EMAIL,
      principalBrokerWorkosUserId: principal.workosUserId,
      status: "active",
      updatedAt: now,
      workosOrganizationId: FAIRLEND_WORKOS_ORGANIZATION_ID,
    });
    await recordBrokerageProvisioningAudit(ctx, {
      brokerageId,
      newState: {
        displayName: FAIRLEND_BROKERAGE_NAME,
        legalName: FAIRLEND_BROKERAGE_NAME,
        principalBrokerEmail: FAIRLEND_DEFAULT_BROKER_EMAIL,
        principalBrokerWorkosUserId: principal.workosUserId,
        status: "active",
      },
      operation: "created",
      organizationId: FAIRLEND_WORKOS_ORGANIZATION_ID,
    });
    return { brokerageId, operation: "created" as const };
  })
  .public();

export const provisionBuilderProfile = userManagementWriteMutation
  .input({
    assignedBrokerWorkosUserId: v.optional(v.string()),
    displayName: v.string(),
    ownerWorkosUserId: v.optional(v.string()),
    workosOrganizationId: v.string(),
  })
  .returns(
    v.object({
      builderProfileId: v.id("builderProfiles"),
      linkId: v.union(v.id("builderAccountLinks"), v.null()),
      operation: v.union(v.literal("created"), v.literal("updated")),
    }),
  )
  .handler(async (ctx, args) => {
    await requireProvisioningScope(ctx, args.workosOrganizationId);
    const brokerage = await ctx.db
      .query("brokerages")
      .withIndex("by_workos_organization", (q) =>
        q.eq("workosOrganizationId", args.workosOrganizationId),
      )
      .unique();
    if (!brokerage) {
      throw new Error(
        "Provision a brokerage profile for this organization before adding a builder profile.",
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
        "A builder profile must use the builder's own company name, not the brokerage name.",
      );
    }
    const now = Date.now();
    await requireWorkosOrganizationProjection(
      ctx,
      args.workosOrganizationId,
    );
    const existing = await ctx.db
      .query("builderProfiles")
      .withIndex("by_organization", (q) =>
        q.eq("organizationId", args.workosOrganizationId),
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
            .eq("workosUserId", args.ownerWorkosUserId as string),
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

    const builderProfile = await ctx.db.get(builderProfileId);
    if (!builderProfile) {
      throw new Error(
        "The builder profile could not be loaded after provisioning.",
      );
    }
    const assignedBrokerWorkosUserId =
      args.assignedBrokerWorkosUserId?.trim() || undefined;
    await ensureBuilderBrokerAssignmentForWorkflow(ctx, {
      actorRoles: ctx.viewer.roles,
      actorWorkosUserId: ctx.viewer.subject,
      ...(assignedBrokerWorkosUserId ? { assignedBrokerWorkosUserId } : {}),
      brokerage,
      builderProfile,
      command: "provisionBuilderProfile",
      now,
      reason: assignedBrokerWorkosUserId
        ? "Assigning the selected eligible broker during builder profile provisioning."
        : "Assigning the brokerage principal broker during builder profile provisioning.",
    });

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
    }),
  )
  .handler(async (ctx, args) => {
    const profile = await ctx.db.get(args.builderProfileId);
    if (!profile) {
      throw new Error("Builder profile not found.");
    }
    await requireProvisioningScope(ctx, profile.organizationId);
    const brokerage = await ctx.db.get(profile.brokerageId);
    if (brokerage?.status !== "active") {
      throw new Error("Builder brokerage is not active.");
    }

    const now = Date.now();
    const existing = await ctx.db
      .query("builderAccountLinks")
      .withIndex("by_builder_user", (q) =>
        q
          .eq("builderProfileId", args.builderProfileId)
          .eq("workosUserId", args.workosUserId),
      )
      .unique();
    let linkId: Id<"builderAccountLinks">;
    let operation: "created" | "updated";
    if (existing) {
      await ctx.db.patch(existing._id, {
        role: args.role,
        status: "active",
        updatedAt: now,
      });
      linkId = existing._id;
      operation = "updated";
    } else {
      linkId = await ctx.db.insert("builderAccountLinks", {
        brokerageId: profile.brokerageId,
        builderProfileId: args.builderProfileId,
        createdAt: now,
        role: args.role,
        status: "active",
        updatedAt: now,
        workosUserId: args.workosUserId,
      });
      operation = "created";
    }

    await ensureBuilderBrokerAssignmentForWorkflow(ctx, {
      actorRoles: ctx.viewer.roles,
      actorWorkosUserId: ctx.viewer.subject,
      brokerage,
      builderProfile: profile,
      command: "linkBuilderAccount",
      now,
      reason:
        "Validating the principal broker assignment while linking a builder account.",
    });

    return { linkId, operation };
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
  .handler(async (ctx, args): Promise<ProvisionNewBuilderResult> => {
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
    const invite = await ctx.runAction(
      internal.workosManagement.inviteBuilderUser,
      {
        email: ownerEmail,
        organizationId: workosOrganizationId,
      },
    );

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
        actorRoles: ctx.viewer.roles,
        actorWorkosUserId: ctx.viewer.subject,
        displayName,
        ownerEmail,
        ownerName,
        ownerWorkosUserId,
        workosOrganizationId,
      },
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
    actorRoles: v.array(v.string()),
    actorWorkosUserId: v.string(),
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
    }),
  )
  .handler(async (ctx, args) => {
    const now = Date.now();
    await requireWorkosOrganizationProjection(
      ctx,
      args.workosOrganizationId,
    );
    const brokerage = await ensureBrokerage(
      ctx,
      args.workosOrganizationId,
      now,
    );

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
          .eq("workosUserId", args.ownerWorkosUserId),
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

    const builderProfile = await ctx.db.get(builderProfileId);
    if (!builderProfile) {
      throw new Error(
        "The builder profile could not be loaded after provisioning.",
      );
    }
    await ensureBuilderBrokerAssignmentForWorkflow(ctx, {
      actorRoles: normalizeRoleSlugs(args.actorRoles),
      actorWorkosUserId: args.actorWorkosUserId,
      brokerage,
      builderProfile,
      command: "provisionNewBuilder",
      now,
      reason: "Assigning an active broker during new builder onboarding.",
    });

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

  if (membership?.status !== "active") {
    throw new Error("Forbidden: WorkOS membership");
  }
  if (!hasAnyRole(membershipRoleSlugs(membership), ["principle-broker"])) {
    throw new Error("Forbidden: brokerage provisioning");
  }
  return membership;
}

async function requireWorkosOrganizationProjection(
  ctx: MutationCtx,
  workosOrganizationId: string,
) {
  const organization = await ctx.db
    .query("workosOrganizations")
    .withIndex("by_workos_organization_id", (q) =>
      q.eq("workosOrganizationId", workosOrganizationId),
    )
    .unique();
  if (!organization || organization.status !== "active") {
    throw new Error(
      "Wait for the authoritative WorkOS organization projection before provisioning.",
    );
  }
  return organization;
}

function membershipRoleSlugs(
  membership: Pick<
    Doc<"workosOrganizationMemberships">,
    "roleSlug" | "roleSlugs"
  >,
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

async function recordBrokerageProvisioningAudit(
  ctx: MutationCtx & { viewer: { roles: string[]; subject: string } },
  input: {
    brokerageId: Id<"brokerages">;
    newState: unknown;
    operation: "created" | "updated";
    organizationId: string;
    priorState?: unknown;
  },
) {
  const now = Date.now();
  await ctx.db.insert("auditEvents", {
    actorRole: ctx.viewer.roles.includes("principle-broker")
      ? "principle-broker"
      : "admin",
    actorRoles: ctx.viewer.roles,
    actorWorkosUserId: ctx.viewer.subject,
    brokerageId: input.brokerageId,
    command: "provisionBrokerageProfile",
    entityId: input.brokerageId,
    entityType: "brokerage",
    eventType: `brokerage.provisioning.${input.operation}`,
    newState: JSON.stringify(input.newState),
    organizationId: input.organizationId,
    ...(input.priorState === undefined
      ? {}
      : { priorState: JSON.stringify(input.priorState) }),
    reason:
      "Provision or reconcile the canonical brokerage and Principal Broker mapping.",
    reconciliationKey: `brokerage-provisioning:${input.organizationId}:${input.operation}:${now}`,
    warnings: [],
    createdAt: now,
  });
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
 * Deterministic provisional WorkOS user id for the product-owned builder link.
 * Authoritative WorkOS user and membership projections still arrive only from
 * WorkOS webhook reconciliation. Stable for a given email.
 */
function provisionedBuilderWorkosUserId(email: string): string {
  const slug = email.replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  return `provisioned_builder_${slug}`;
}

async function ensureBrokerage(
  ctx: MutationCtx,
  workosOrganizationId: string,
  now: number,
): Promise<Doc<"brokerages">> {
  const existing = await ctx.db
    .query("brokerages")
    .withIndex("by_workos_organization", (q) =>
      q.eq("workosOrganizationId", workosOrganizationId),
    )
    .unique();
  if (existing) {
    const fairLendPrincipal =
      workosOrganizationId === FAIRLEND_WORKOS_ORGANIZATION_ID
        ? await requireDefaultBrokerMember(ctx, existing)
        : null;
    const fairLendPrincipalPatch = fairLendPrincipal
      ? {
          principalBrokerEmail: FAIRLEND_DEFAULT_BROKER_EMAIL,
          principalBrokerWorkosUserId: fairLendPrincipal.workosUserId,
        }
      : {};
    if (
      existing.status !== "active" ||
      Object.keys(fairLendPrincipalPatch).length > 0
    ) {
      await ctx.db.patch(existing._id, {
        ...fairLendPrincipalPatch,
        status: "active",
        updatedAt: now,
      });
      return {
        ...existing,
        ...fairLendPrincipalPatch,
        status: "active",
      };
    }
    return existing;
  }
  if (workosOrganizationId !== FAIRLEND_WORKOS_ORGANIZATION_ID) {
    throw new Error(
      "Provision a brokerage profile for this organization before adding a builder.",
    );
  }
  const principal = await requireDefaultBrokerMember(ctx, {
    principalBrokerEmail: FAIRLEND_DEFAULT_BROKER_EMAIL,
    principalBrokerWorkosUserId: FAIRLEND_PRINCIPAL_BROKER_WORKOS_USER_ID,
    workosOrganizationId,
  });
  const brokerageId = await ctx.db.insert("brokerages", {
    createdAt: now,
    displayName: FAIRLEND_BROKERAGE_NAME,
    legalName: FAIRLEND_BROKERAGE_NAME,
    principalBrokerEmail: FAIRLEND_DEFAULT_BROKER_EMAIL,
    principalBrokerWorkosUserId: principal.workosUserId,
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
