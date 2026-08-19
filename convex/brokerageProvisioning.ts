import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";

import { api, internal } from "./_generated/api";
import {
  authenticatedQuery,
  builderMutation,
  normalizeRoleSlugs,
  type RoleSlug,
  userManagementWriteAction,
  userManagementWriteMutation,
  userManagementWriteQuery,
} from "./authz";
import {
  ASSIGNABLE_BROKER_ROLES,
  ensureBuilderBrokerAssignment,
  ensureBuilderBrokerAssignmentForWorkflow,
  getBuilderBrokerAssignmentHealth,
  requireDefaultBrokerMember,
  requireEligibleBrokerMember,
} from "./brokerAssignments";
import {
  FAIRLEND_BROKERAGE_NAME,
  FAIRLEND_DEFAULT_BROKER_EMAIL,
  FAIRLEND_PRINCIPAL_BROKER_WORKOS_USER_ID,
  FAIRLEND_WORKOS_ORGANIZATION_ID,
} from "./fairLendConfig";
import { internalMutation } from "./fluent";
import type { Doc, Id, MutationCtx, QueryCtx } from "./types";

const BROKER_ROLES = ASSIGNABLE_BROKER_ROLES;
const BUILDER_ROLES = ["builder", "builder-staff"] as const;
const builderBrokerRelationshipStatusValidator = v.union(
  v.literal("active"),
  v.literal("missing-membership"),
  v.literal("missing-builder-profile"),
  v.literal("ambiguous-builder-profile"),
  v.literal("missing-broker-assignment"),
  v.literal("pending"),
  v.literal("transferred"),
  v.literal("failed"),
);
const builderBrokerRelationshipRecoveryKindValidator = v.union(
  v.literal("missing-membership"),
  v.literal("missing-builder-profile"),
  v.literal("ambiguous-builder-profile"),
  v.literal("missing-broker-assignment"),
  v.literal("pending"),
  v.literal("transferred"),
  v.literal("failed"),
);
const tenantActivationStateValidator = v.union(
  v.literal("active"),
  v.literal("deactivated"),
  v.literal("integration-only"),
  v.literal("invitation-missing"),
  v.literal("invitation-pending"),
  v.literal("no-workspace-access"),
  v.literal("projection-failed"),
  v.literal("role-change-pending"),
  v.literal("tenant-activation-pending"),
  v.literal("wrong-organization"),
);

const tenantActivationReturnValidator = v.object({
  actions: v.array(
    v.union(
      v.literal("accept-invitation"),
      v.literal("contact-platform-admin"),
      v.literal("open-integrations"),
      v.literal("request-help"),
      v.literal("retry-projection"),
      v.literal("switch-organization"),
    ),
  ),
  affectedWorkWarning: v.optional(v.string()),
  capabilityDelta: v.object({
    gained: v.array(v.string()),
    lost: v.array(v.string()),
  }),
  currentRoles: v.array(v.string()),
  effectiveAt: v.optional(v.number()),
  intendedDestination: v.string(),
  intendedRoles: v.array(v.string()),
  invitationStatus: v.union(
    v.literal("active"),
    v.literal("deleted"),
    v.literal("inactive"),
    v.literal("missing"),
    v.literal("pending"),
  ),
  invitedEmail: v.optional(v.string()),
  organization: v.object({ id: v.string(), name: v.string() }),
  projectionStatus: v.union(
    v.literal("failed"),
    v.literal("missing"),
    v.literal("pending"),
    v.literal("ready"),
  ),
  requiredRole: v.string(),
  responsibleOwner: v.string(),
  state: tenantActivationStateValidator,
  supportReference: v.string(),
});
const builderBrokerRelationshipSummaryReturn = v.object({
  brokerage: v.union(
    v.object({
      displayName: v.string(),
      workosOrganizationId: v.string(),
    }),
    v.null(),
  ),
  broker: v.union(
    v.object({
      email: v.union(v.string(), v.null()),
      name: v.union(v.string(), v.null()),
      workosUserId: v.string(),
    }),
    v.null(),
  ),
  relationship: v.object({
    effectiveAt: v.union(v.number(), v.null()),
    status: builderBrokerRelationshipStatusValidator,
    updatedAt: v.union(v.number(), v.null()),
  }),
  recovery: v.union(
    v.object({
      actionLabel: v.string(),
      kind: builderBrokerRelationshipRecoveryKindValidator,
      message: v.string(),
    }),
    v.null(),
  ),
});

export const listBrokerageProvisioning = userManagementWriteQuery
  .returns(v.any())
  .handler(async (ctx) => {
    const organizationScope = ctx.viewer.roles.includes("admin")
      ? null
      : ctx.viewer.organizationId;
    if (!(ctx.viewer.roles.includes("admin") || organizationScope)) {
      throw new Error("Active organization context is required.");
    }
    const [
      organizations,
      memberships,
      users,
      brokerages,
      builderProfiles,
      builderAccountLinks,
    ] = await Promise.all([
      organizationScope
        ? ctx.db
            .query("workosOrganizations")
            .withIndex("by_workos_organization_id", (q) =>
              q.eq("workosOrganizationId", organizationScope),
            )
            .collect()
        : ctx.db.query("workosOrganizations").collect(),
      organizationScope
        ? ctx.db
            .query("workosOrganizationMemberships")
            .withIndex("by_organization", (q) =>
              q.eq("workosOrganizationId", organizationScope),
            )
            .collect()
        : ctx.db.query("workosOrganizationMemberships").collect(),
      ctx.db.query("users").collect(),
      organizationScope
        ? ctx.db
            .query("brokerages")
            .withIndex("by_workos_organization", (q) =>
              q.eq("workosOrganizationId", organizationScope),
            )
            .collect()
        : ctx.db.query("brokerages").collect(),
      organizationScope
        ? ctx.db
            .query("builderProfiles")
            .withIndex("by_organization", (q) =>
              q.eq("organizationId", organizationScope),
            )
            .collect()
        : ctx.db.query("builderProfiles").collect(),
      ctx.db.query("builderAccountLinks").collect(),
    ]);

    const usersByWorkosId = new Map(
      users
        .filter((user) => user.workosUserId)
        .map((user) => [user.workosUserId as string, user]),
    );
    const fairLendPrincipalMembership = memberships.find((membership) => {
      const user = usersByWorkosId.get(membership.workosUserId);
      return (
        membership.status === "active" &&
        membership.workosOrganizationId === FAIRLEND_WORKOS_ORGANIZATION_ID &&
        hasAnyRole(membershipRoleSlugs(membership), BROKER_ROLES) &&
        user?.status === "active" &&
        normalizeEmail(user.email) === FAIRLEND_DEFAULT_BROKER_EMAIL
      );
    });
    const brokeragesByWorkosOrg = new Map(
      brokerages.map((brokerage) => [
        brokerage.workosOrganizationId,
        brokerage,
      ]),
    );
    const builderProfilesByOrg = new Map(
      builderProfiles.map((profile) => [profile.organizationId, profile]),
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
        principalBrokerEmail: FAIRLEND_DEFAULT_BROKER_EMAIL,
        principalBrokerWorkosUserId:
          fairLendPrincipalMembership?.workosUserId ??
          FAIRLEND_PRINCIPAL_BROKER_WORKOS_USER_ID,
        workosOrganizationId: FAIRLEND_WORKOS_ORGANIZATION_ID,
      },
      organizations: organizations.map((organization) => {
        const brokerage = brokeragesByWorkosOrg.get(
          organization.workosOrganizationId,
        );
        const orgMemberships = memberships.filter(
          (membership) =>
            membership.status === "active" &&
            membership.workosOrganizationId ===
              organization.workosOrganizationId,
        );
        const projectMembership = (
          membership: (typeof orgMemberships)[number],
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
            hasAnyRole(membershipRoleSlugs(membership), BROKER_ROLES),
          )
          .map(projectMembership);
        const builderMemberships = orgMemberships
          .filter((membership) =>
            hasAnyRole(membershipRoleSlugs(membership), BUILDER_ROLES),
          )
          .map(projectMembership);

        const builderProfile = builderProfilesByOrg.get(
          organization.workosOrganizationId,
        );
        const builderAccountLinkRows = builderProfile
          ? (linksByProfile.get(builderProfile._id as string) ?? []).map(
              (link) => ({
                _id: link._id as string,
                role: link.role,
                workosUserId: link.workosUserId,
              }),
            )
          : [];

        return {
          brokerage: brokerage
            ? {
                _id: brokerage._id,
                displayName: brokerage.displayName,
                legalName: brokerage.legalName,
                principalBrokerEmail: brokerage.principalBrokerEmail,
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

export const getTenantActivationState = authenticatedQuery
  .input({ workosOrganizationId: v.string() })
  .returns(tenantActivationReturnValidator)
  .handler(async (ctx, args) => {
    const currentRoles = [...new Set(ctx.viewer.roles.map(String))];
    const tokenOrganizationId = ctx.viewer.organizationId?.trim();
    const wrongOrganization =
      Boolean(tokenOrganizationId) &&
      tokenOrganizationId !== args.workosOrganizationId;
    const [membership, organization, brokerage] = wrongOrganization
      ? [null, null, null]
      : await Promise.all([
          ctx.db
            .query("workosOrganizationMemberships")
            .withIndex("by_user", (q) =>
              q.eq("workosUserId", ctx.viewer.subject),
            )
            .filter((q) =>
              q.eq(q.field("workosOrganizationId"), args.workosOrganizationId),
            )
            .first(),
          ctx.db
            .query("workosOrganizations")
            .withIndex("by_workos_organization_id", (q) =>
              q.eq("workosOrganizationId", args.workosOrganizationId),
            )
            .unique(),
          ctx.db
            .query("brokerages")
            .withIndex("by_workos_organization", (q) =>
              q.eq("workosOrganizationId", args.workosOrganizationId),
            )
            .unique(),
        ]);
    const intendedRoles = membership?.roleSlugs ?? [];
    const rolesDiffer =
      currentRoles.length !== intendedRoles.length ||
      currentRoles.some((role) => !intendedRoles.includes(role));
    const supportedWorkspaceRole = currentRoles.some((role) =>
      [
        "admin",
        "broker",
        "broker-staff",
        "builder",
        "builder-staff",
        "contractor",
        "principle-broker",
        "principal-broker",
      ].includes(role),
    );
    const technicalAdminOnly =
      (currentRoles.includes("technical-admin") ||
        intendedRoles.includes("technical-admin")) &&
      !supportedWorkspaceRole;
    let state:
      | "active"
      | "deactivated"
      | "integration-only"
      | "invitation-missing"
      | "invitation-pending"
      | "no-workspace-access"
      | "projection-failed"
      | "role-change-pending"
      | "tenant-activation-pending"
      | "wrong-organization";
    if (wrongOrganization) {
      state = "wrong-organization";
    } else if (!organization || organization.status !== "active") {
      state = "projection-failed";
    } else if (!membership) {
      state = "invitation-missing";
    } else if (membership.status === "pending") {
      state = "invitation-pending";
    } else if (
      membership.status === "inactive" ||
      membership.status === "deleted"
    ) {
      state = "deactivated";
    } else if (!brokerage) {
      state = "tenant-activation-pending";
    } else if (brokerage.status !== "active") {
      state = "deactivated";
    } else if (technicalAdminOnly) {
      state = "integration-only";
    } else if (rolesDiffer) {
      state = "role-change-pending";
    } else if (supportedWorkspaceRole) {
      state = "active";
    } else {
      state = "no-workspace-access";
    }

    const projectionStatus =
      state === "active" || state === "integration-only"
        ? ("ready" as const)
        : state === "invitation-pending" ||
            state === "role-change-pending" ||
            state === "tenant-activation-pending"
          ? ("pending" as const)
          : state === "invitation-missing"
            ? ("missing" as const)
            : ("failed" as const);
    const actions: Array<
      | "accept-invitation"
      | "contact-platform-admin"
      | "open-integrations"
      | "request-help"
      | "retry-projection"
      | "switch-organization"
    > =
      state === "invitation-pending"
        ? ["accept-invitation", "retry-projection", "switch-organization"]
        : state === "integration-only"
          ? ["open-integrations", "switch-organization"]
          : state === "active"
            ? ["switch-organization"]
            : [
                "retry-projection",
                "switch-organization",
                "contact-platform-admin",
                "request-help",
              ];
    let hash = 0;
    for (const character of `${state}|${args.workosOrganizationId}|${ctx.viewer.subject}`) {
      hash = (hash * 31 + character.charCodeAt(0)) % 2_147_483_647;
    }
    const roleLabel = (role: string) =>
      role
        .split("-")
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(" ");
    return {
      actions,
      affectedWorkWarning:
        state === "deactivated" || state === "role-change-pending"
          ? "Workspace capabilities and assigned work may change when this access update takes effect."
          : undefined,
      capabilityDelta: {
        gained: intendedRoles
          .filter((role) => !currentRoles.includes(role))
          .map(roleLabel),
        lost: currentRoles
          .filter((role) => !intendedRoles.includes(role))
          .map(roleLabel),
      },
      currentRoles: currentRoles.map(roleLabel),
      effectiveAt: membership?.updatedAt ?? membership?.createdAt,
      intendedDestination:
        state === "integration-only"
          ? "/backoffice/integrations"
          : "/backoffice",
      intendedRoles: intendedRoles.map(roleLabel),
      invitationStatus: membership?.status ?? "missing",
      invitedEmail: ctx.viewer.email,
      organization: {
        id: args.workosOrganizationId,
        name:
          organization?.name ??
          brokerage?.displayName ??
          "Current organization",
      },
      projectionStatus,
      requiredRole:
        intendedRoles.map(roleLabel).join(", ") ||
        currentRoles.map(roleLabel).join(", ") ||
        "Authorized organization member",
      responsibleOwner:
        state === "tenant-activation-pending" || state === "projection-failed"
          ? "Platform Admin"
          : state === "role-change-pending" || state === "deactivated"
            ? "Organization Admin"
            : state === "invitation-pending" || state === "invitation-missing"
              ? "Invitation sender or Organization Admin"
              : "Current organization",
      state,
      supportReference: `TEN-${hash.toString(36).toUpperCase().padStart(7, "0")}`,
    };
  })
  .public();
export const getBuilderBrokerRelationshipSummary = authenticatedQuery
  .input({ workosOrganizationId: v.string() })
  .returns(builderBrokerRelationshipSummaryReturn)
  .handler(async (ctx, args) => {
    if (ctx.viewer.organizationId !== args.workosOrganizationId) {
      return buildBuilderBrokerRelationshipSummary({
        recovery: {
          actionLabel: "Switch organization",
          kind: "missing-membership",
          message:
            "Switch to your builder organization, then retry the broker relationship check.",
        },
        relationship: {
          effectiveAt: null,
          status: "missing-membership",
          updatedAt: null,
        },
      });
    }

    const activeMembership = await getActiveOrganizationMembership(
      ctx,
      ctx.viewer.subject,
      args.workosOrganizationId,
    );
    if (
      !(
        activeMembership &&
        hasAnyRole(membershipRoleSlugs(activeMembership), BUILDER_ROLES)
      )
    ) {
      return buildBuilderBrokerRelationshipSummary({
        recovery: {
          actionLabel: "Switch organization",
          kind: "missing-membership",
          message:
            "Switch to your builder organization, then retry the broker relationship check.",
        },
        relationship: {
          effectiveAt: null,
          status: "missing-membership",
          updatedAt: null,
        },
      });
    }

    const brokerage = await ctx.db
      .query("brokerages")
      .withIndex("by_workos_organization", (q) =>
        q.eq("workosOrganizationId", args.workosOrganizationId),
      )
      .unique();
    const ownedBuilderProfiles = brokerage
      ? await getOwnedBuilderProfiles(ctx, brokerage._id, ctx.viewer.subject)
      : [];

    if (brokerage?.status !== "active") {
      return buildBuilderBrokerRelationshipSummary({
        recovery: {
          actionLabel: "Retry status check",
          kind: "failed",
          message:
            "Your brokerage relationship could not be confirmed yet. Retry the status check or contact your brokerage.",
        },
        relationship: {
          effectiveAt: null,
          status: "failed",
          updatedAt: null,
        },
      });
    }

    if (ownedBuilderProfiles.length === 0) {
      return buildBuilderBrokerRelationshipSummary({
        brokerage,
        recovery: {
          actionLabel: "Contact your brokerage",
          kind: "missing-builder-profile",
          message:
            "Your brokerage is still linking your builder profile. Ask them to finish setup before you start a proposal.",
        },
        relationship: {
          effectiveAt: null,
          status: "missing-builder-profile",
          updatedAt: null,
        },
      });
    }

    if (ownedBuilderProfiles.length > 1) {
      return buildBuilderBrokerRelationshipSummary({
        brokerage,
        recovery: {
          actionLabel: "Contact your brokerage",
          kind: "ambiguous-builder-profile",
          message:
            "Your builder profile needs repair before DrawFlow can confirm your broker relationship.",
        },
        relationship: {
          effectiveAt: null,
          status: "ambiguous-builder-profile",
          updatedAt: null,
        },
      });
    }

    return resolveBuilderBrokerRelationshipSummary(ctx, {
      brokerage,
      builderProfile: ownedBuilderProfiles[0],
    });
  })
  .public();

export const repairOwnBuilderBrokerAssignment = builderMutation
  .input({ workosOrganizationId: v.string() })
  .returns(
    v.object({
      assignmentId: v.id("builderBrokerAssignments"),
      operation: v.union(
        v.literal("assigned"),
        v.literal("reassigned"),
        v.literal("repaired"),
        v.literal("unchanged"),
      ),
    }),
  )
  .handler(async (ctx, args) => {
    if (ctx.viewer.organizationId !== args.workosOrganizationId) {
      throw new Error(
        "Switch to your builder organization before repairing broker access.",
      );
    }

    const builderMembership = await getActiveOrganizationMembership(
      ctx,
      ctx.viewer.subject,
      args.workosOrganizationId,
    );
    if (
      !(
        builderMembership &&
        hasAnyRole(membershipRoleSlugs(builderMembership), BUILDER_ROLES)
      )
    ) {
      throw new Error("An active builder membership is required.");
    }

    const brokerage = await ctx.db
      .query("brokerages")
      .withIndex("by_workos_organization", (q) =>
        q.eq("workosOrganizationId", args.workosOrganizationId),
      )
      .unique();
    if (brokerage?.status !== "active") {
      throw new Error("The builder brokerage is not active.");
    }

    const ownedBuilderProfiles = await getOwnedBuilderProfiles(
      ctx,
      brokerage._id,
      ctx.viewer.subject,
    );
    if (ownedBuilderProfiles.length !== 1) {
      throw new Error("Exactly one active builder profile is required.");
    }

    const { workosUserId: assignedBrokerWorkosUserId } =
      await requireDefaultBrokerMember(ctx, brokerage);
    return ensureBuilderBrokerAssignment(ctx, {
      actorRoles: ctx.viewer.roles,
      actorWorkosUserId: ctx.viewer.subject,
      assignedBrokerWorkosUserId,
      brokerage,
      builderProfile: ownedBuilderProfiles[0],
      command: "repairOwnBuilderBrokerAssignment",
      now: Date.now(),
      reason:
        "Repairing a missing, stale, or duplicate broker assignment for the active builder profile.",
    });
  })
  .public();

export const reconcileBrokerageBuilderAssignments = userManagementWriteMutation
  .input({
    paginationOpts: paginationOptsValidator,
    workosOrganizationId: v.string(),
  })
  .returns(
    v.object({
      assigned: v.number(),
      continueCursor: v.string(),
      isDone: v.boolean(),
      processed: v.number(),
      reassigned: v.number(),
      repaired: v.number(),
      unchanged: v.number(),
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
    if (brokerage?.status !== "active") {
      throw new Error("The brokerage is not active.");
    }
    const page = await ctx.db
      .query("builderProfiles")
      .withIndex("by_brokerage_and_status", (q) =>
        q.eq("brokerageId", brokerage._id).eq("status", "active"),
      )
      .paginate(args.paginationOpts);
    const counts = {
      assigned: 0,
      reassigned: 0,
      repaired: 0,
      unchanged: 0,
    };
    const now = Date.now();

    for (const builderProfile of page.page) {
      const result = await ensureBuilderBrokerAssignmentForWorkflow(ctx, {
        actorRoles: ctx.viewer.roles,
        actorWorkosUserId: ctx.viewer.subject,
        brokerage,
        builderProfile,
        command: "reconcileBrokerageBuilderAssignments",
        now,
        reason:
          "Reconciling active builder profiles to one eligible principal broker assignment.",
      });
      counts[result.operation] += 1;
    }

    return {
      ...counts,
      continueCursor: page.continueCursor,
      isDone: page.isDone,
      processed: page.page.length,
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

async function resolveBuilderBrokerRelationshipSummary(
  ctx: QueryCtx,
  input: {
    brokerage: Doc<"brokerages">;
    builderProfile: Doc<"builderProfiles">;
  },
) {
  const assignmentHealth = await getBuilderBrokerAssignmentHealth(ctx, input);

  if (assignmentHealth.healthy && assignmentHealth.assignment) {
    return buildBuilderBrokerRelationshipSummary({
      brokerage: input.brokerage,
      broker: assignmentHealth.broker
        ? {
            email: assignmentHealth.broker.email ?? null,
            name: assignmentHealth.broker.name ?? null,
            workosUserId:
              assignmentHealth.assignment.assignedBrokerWorkosUserId,
          }
        : null,
      relationship: {
        effectiveAt: assignmentHealth.assignment.effectiveAt,
        status: "active",
        updatedAt: assignmentHealth.assignment.updatedAt,
      },
    });
  }

  if (assignmentHealth.reason !== "assignment_missing") {
    const invalidAssignment = assignmentHealth.assignment;
    return buildBuilderBrokerRelationshipSummary({
      brokerage: input.brokerage,
      broker: invalidAssignment
        ? {
            email: assignmentHealth.broker?.email ?? null,
            name: assignmentHealth.broker?.name ?? null,
            workosUserId: invalidAssignment.assignedBrokerWorkosUserId,
          }
        : null,
      recovery: {
        actionLabel: "Contact your brokerage",
        kind: "failed",
        message:
          "The assigned broker is no longer an active, eligible member of this brokerage. Ask your brokerage to repair the assignment.",
      },
      relationship: {
        effectiveAt: invalidAssignment?.effectiveAt ?? null,
        status: "failed",
        updatedAt: invalidAssignment?.updatedAt ?? null,
      },
    });
  }

  const latestAssignment = await ctx.db
    .query("builderBrokerAssignments")
    .withIndex("by_builderProfileId_and_createdAt", (q) =>
      q.eq("builderProfileId", input.builderProfile._id),
    )
    .order("desc")
    .first();
  if (!latestAssignment) {
    return buildBuilderBrokerRelationshipSummary({
      brokerage: input.brokerage,
      recovery: {
        actionLabel: "Contact your brokerage",
        kind: "missing-broker-assignment",
        message:
          "Your brokerage has not assigned an active broker to this builder profile yet.",
      },
      relationship: {
        effectiveAt: null,
        status: "missing-broker-assignment",
        updatedAt: null,
      },
    });
  }

  const brokerUser = await getWorkosUserById(
    ctx,
    latestAssignment.assignedBrokerWorkosUserId,
  );
  return buildBuilderBrokerRelationshipSummary({
    brokerage: input.brokerage,
    broker: brokerUser
      ? {
          email: brokerUser.email ?? null,
          name: brokerUser.name ?? null,
          workosUserId: latestAssignment.assignedBrokerWorkosUserId,
        }
      : {
          email: null,
          name: null,
          workosUserId: latestAssignment.assignedBrokerWorkosUserId,
        },
    recovery: relationshipRecoveryForStatus(latestAssignment.status),
    relationship: {
      effectiveAt: latestAssignment.effectiveAt,
      status: latestAssignment.status,
      updatedAt: latestAssignment.updatedAt,
    },
  });
}

function buildBuilderBrokerRelationshipSummary(input: {
  brokerage?: Pick<
    Doc<"brokerages">,
    "displayName" | "workosOrganizationId"
  > | null;
  broker?: {
    email: string | null;
    name: string | null;
    workosUserId: string;
  } | null;
  recovery?: {
    actionLabel: string;
    kind:
      | "missing-membership"
      | "missing-builder-profile"
      | "ambiguous-builder-profile"
      | "missing-broker-assignment"
      | "pending"
      | "transferred"
      | "failed";
    message: string;
  } | null;
  relationship: {
    effectiveAt: number | null;
    status:
      | "active"
      | "missing-membership"
      | "missing-builder-profile"
      | "ambiguous-builder-profile"
      | "missing-broker-assignment"
      | "pending"
      | "transferred"
      | "failed";
    updatedAt: number | null;
  };
}) {
  return {
    brokerage: input.brokerage
      ? {
          displayName: input.brokerage.displayName,
          workosOrganizationId: input.brokerage.workosOrganizationId,
        }
      : null,
    broker: input.broker ?? null,
    recovery: input.recovery ?? null,
    relationship: input.relationship,
  };
}

function relationshipRecoveryForStatus(
  status: "active" | "pending" | "transferred" | "failed",
) {
  switch (status) {
    case "active":
      return null;
    case "pending":
      return {
        actionLabel: "Retry status check",
        kind: "pending" as const,
        message:
          "Your brokerage is still confirming your broker assignment. Retry the status check in a moment.",
      };
    case "transferred":
      return {
        actionLabel: "Contact your brokerage",
        kind: "transferred" as const,
        message:
          "Your brokerage transferred this broker relationship and must confirm the new assignment before you can continue.",
      };
    case "failed":
      return {
        actionLabel: "Contact your brokerage",
        kind: "failed" as const,
        message:
          "Your brokerage needs to repair the broker assignment before you can continue.",
      };
    default:
      throw new Error(
        `Unsupported broker relationship status: ${status satisfies never}`,
      );
  }
}

async function getActiveOrganizationMembership(
  ctx: QueryCtx,
  workosUserId: string,
  workosOrganizationId: string,
) {
  for await (const membership of ctx.db
    .query("workosOrganizationMemberships")
    .withIndex("by_user", (q) => q.eq("workosUserId", workosUserId))) {
    if (membership.workosOrganizationId !== workosOrganizationId) {
      continue;
    }
    if (membership.status !== "active") {
      continue;
    }
    return membership;
  }
  return null;
}

async function getOwnedBuilderProfiles(
  ctx: QueryCtx,
  brokerageId: Id<"brokerages">,
  workosUserId: string,
) {
  const profiles: Doc<"builderProfiles">[] = [];

  for await (const link of ctx.db
    .query("builderAccountLinks")
    .withIndex("by_user", (q) => q.eq("workosUserId", workosUserId))) {
    if (link.status !== "active") {
      continue;
    }
    const profile = await ctx.db.get(link.builderProfileId);
    if (profile?.status !== "active") {
      continue;
    }
    if (profile.brokerageId !== brokerageId) {
      continue;
    }
    profiles.push(profile);
  }

  return profiles;
}

function getWorkosUserById(ctx: QueryCtx, workosUserId: string) {
  return ctx.db
    .query("users")
    .withIndex("by_workos_user_id", (q) => q.eq("workosUserId", workosUserId))
    .unique();
}

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
