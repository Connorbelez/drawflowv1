import {
  type BuildCollaborationRole,
  normalizeBuildCollaborationRole,
} from "./build_collaboration_model";
import type {
  CanonicalMilestoneExecutionOwnership,
} from "./build_collaboration_system_event_access";
import type { Doc, MutationCtx, QueryCtx } from "./types";

export type SubmilestoneOperateBasis =
  | "admin"
  | "builder_owner"
  | "builder_staff"
  | "contractor_assignee";

export type SubmilestoneOperateDenial =
  | "already_started"
  | "assignment_required"
  | "completed"
  | "lender_review_only"
  | "permission_denied";

export type SubmilestoneOperateDecision =
  | { allowed: true; basis: SubmilestoneOperateBasis }
  | { allowed: false; denial: SubmilestoneOperateDenial };

export type SubmilestoneOperateIntent = "start" | "update";

/**
 * Canonical Sub-milestone field-operate authority.
 * Admin always operates. Builders operate by permission scope (not Work Allocation).
 * Contractors operate only when they are the exact Work Allocation assignee.
 * Broker / broker-staff / principle-broker without Admin or Builder roles are review-only.
 */
export async function resolveSubmilestoneOperateAuthority(
  ctx: QueryCtx | MutationCtx,
  input: {
    build: Doc<"activeBuilds">;
    intent: SubmilestoneOperateIntent;
    ownership: CanonicalMilestoneExecutionOwnership;
    submilestone: Doc<"buildSubmilestones">;
    viewer: {
      roles: readonly unknown[];
      workosUserId: string;
    };
    /** Parent milestone complete / claim also blocks child start/update. */
    milestoneCompleted?: boolean;
  }
): Promise<SubmilestoneOperateDecision> {
  const roles = await resolveOperateRoles(ctx, input.viewer);
  const completed =
    input.milestoneCompleted === true ||
    input.submilestone.status === "complete";
  const alreadyStarted = input.submilestone.actualStartedAt !== undefined;

  if (completed) {
    return { allowed: false, denial: "completed" };
  }
  if (input.intent === "start" && alreadyStarted) {
    return { allowed: false, denial: "already_started" };
  }

  if (roles.includes("admin")) {
    return { allowed: true, basis: "admin" };
  }

  // Builder permission scope is the account link / grants, not JWT alone.
  // An active owner or staff link for this Build's builder profile can operate
  // even when the session token only exposes a subset of membership roles.
  const ownerAllowed = await canBuilderOperateWithLink(ctx, {
    build: input.build,
    linkRole: "owner",
    requireStaffGrants: false,
    workosUserId: input.viewer.workosUserId,
  });
  if (ownerAllowed) {
    return { allowed: true, basis: "builder_owner" };
  }
  const staffAllowed = await canBuilderOperateWithLink(ctx, {
    build: input.build,
    linkRole: "staff",
    requireStaffGrants: true,
    workosUserId: input.viewer.workosUserId,
  });
  if (staffAllowed) {
    return { allowed: true, basis: "builder_staff" };
  }

  if (roles.includes("contractor")) {
    return resolveContractorOperateAuthority({
      ownership: input.ownership,
      workosUserId: input.viewer.workosUserId,
    });
  }

  if (roles.includes("builder") || roles.includes("builder-staff")) {
    // Membership says builder, but no usable link/grants for this Build.
    return { allowed: false, denial: "permission_denied" };
  }

  if (
    roles.includes("principle-broker") ||
    roles.includes("broker") ||
    roles.includes("broker-staff")
  ) {
    return { allowed: false, denial: "lender_review_only" };
  }

  return { allowed: false, denial: "permission_denied" };
}

export function normalizeOperateRoles(
  roles: readonly unknown[]
): BuildCollaborationRole[] {
  return [
    ...new Set(
      roles
        .map(normalizeBuildCollaborationRole)
        .filter((role): role is BuildCollaborationRole => role !== null)
    ),
  ];
}

/**
 * Merge caller-supplied roles with WorkOS membership roleSlugs so Admin
 * elevation and builder org membership survive org-scoped tokens.
 */
async function resolveOperateRoles(
  ctx: QueryCtx | MutationCtx,
  viewer: {
    roles: readonly unknown[];
    workosUserId: string;
  }
): Promise<BuildCollaborationRole[]> {
  const memberships = await ctx.db
    .query("workosOrganizationMemberships")
    .withIndex("by_user", (query) =>
      query.eq("workosUserId", viewer.workosUserId)
    )
    .take(100);
  const membershipRoles = memberships
    .filter((membership) => membership.status === "active")
    .flatMap((membership) => [
      ...(membership.roleSlugs ?? []),
      membership.roleSlug,
    ]);
  return normalizeOperateRoles([...viewer.roles, ...membershipRoles]);
}

function resolveContractorOperateAuthority(input: {
  ownership: CanonicalMilestoneExecutionOwnership;
  workosUserId: string;
}): SubmilestoneOperateDecision {
  if (input.ownership.state !== "assigned") {
    return { allowed: false, denial: "assignment_required" };
  }
  if (
    input.ownership.contractor?.accountWorkosUserId !== input.workosUserId
  ) {
    return { allowed: false, denial: "permission_denied" };
  }
  return { allowed: true, basis: "contractor_assignee" };
}

/**
 * Builder owner link = full operate. Builder staff needs canUpdate on both
 * milestone and submilestone resources (matches mutation ACL).
 */
async function canBuilderOperateWithLink(
  ctx: QueryCtx | MutationCtx,
  input: {
    build: Doc<"activeBuilds">;
    linkRole: "owner" | "staff";
    requireStaffGrants: boolean;
    workosUserId: string;
  }
) {
  const links = await ctx.db
    .query("builderAccountLinks")
    .withIndex("by_builder_user", (query) =>
      query
        .eq("builderProfileId", input.build.builderProfileId)
        .eq("workosUserId", input.workosUserId)
    )
    .take(21);
  if (links.length > 20) {
    return false;
  }
  const activeLink = links
    .filter((link) => link.role === input.linkRole)
    .find(
      (link) =>
        link.status === "active" &&
        link.brokerageId === input.build.brokerageId
    );
  if (!activeLink) {
    return false;
  }
  if (!input.requireStaffGrants) {
    return true;
  }
  const [milestoneGrants, submilestoneGrants] = await Promise.all([
    ctx.db
      .query("builderStaffPermissionGrants")
      .withIndex("by_build_link_resource", (query) =>
        query
          .eq("buildId", input.build._id)
          .eq("builderAccountLinkId", activeLink._id)
          .eq("resourceType", "milestone")
      )
      .take(101),
    ctx.db
      .query("builderStaffPermissionGrants")
      .withIndex("by_build_link_resource", (query) =>
        query
          .eq("buildId", input.build._id)
          .eq("builderAccountLinkId", activeLink._id)
          .eq("resourceType", "submilestone")
      )
      .take(101),
  ]);
  if (milestoneGrants.length > 100 || submilestoneGrants.length > 100) {
    return false;
  }
  const grantAllowsUpdate = (
    grant: Doc<"builderStaffPermissionGrants">
  ) =>
    grant.scope === "activeBuild" &&
    grant.organizationId === input.build.organizationId &&
    grant.brokerageId === input.build.brokerageId &&
    grant.builderProfileId === input.build.builderProfileId &&
    grant.workosUserId === input.workosUserId &&
    grant.canUpdate;
  return (
    milestoneGrants.some(grantAllowsUpdate) &&
    submilestoneGrants.some(grantAllowsUpdate)
  );
}

export function operateDenialMessage(
  denial: SubmilestoneOperateDenial
): string {
  switch (denial) {
    case "already_started":
      return "Work has already started on this Sub-milestone.";
    case "assignment_required":
      return "Assign a tradesperson before a Contractor can start.";
    case "completed":
      return "This Sub-milestone is already complete.";
    case "lender_review_only":
      return "Review-only on this surface; field operate requires Builder or Admin authority.";
    case "permission_denied":
      return "You do not have Sub-milestone update permission.";
    default: {
      const _exhaustive: never = denial;
      return _exhaustive;
    }
  }
}
