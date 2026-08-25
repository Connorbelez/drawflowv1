import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";

import {
  authenticatedQuery,
  builderMutation,
  normalizeRoleSlugs,
  type RoleSlug,
  userManagementWriteMutation,
} from "../authz";
import {
  ensureBuilderBrokerAssignment,
  ensureBuilderBrokerAssignmentForWorkflow,
  getBuilderBrokerAssignmentHealth,
  requireDefaultBrokerMember,
  ASSIGNABLE_BROKER_ROLES,
} from "../brokerAssignments";
import type { Doc, Id, MutationCtx, QueryCtx } from "../types";

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
