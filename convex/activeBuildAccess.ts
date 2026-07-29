import type { AuthorizedViewer, RoleSlug } from "./authz";
import { normalizeRoleSlugs } from "./authz";
import {
  type BuildCollaborationRole,
  resolveEffectiveCollaborationRole,
} from "./build_collaboration_model";
import type { Doc, Id, MutationCtx, QueryCtx } from "./types";

type ActiveBuildAccessCtx = (QueryCtx | MutationCtx) & {
  viewer: AuthorizedViewer;
};

const ACTIVE_BUILD_COORDINATOR_ROLES = new Set<BuildCollaborationRole>([
  "admin",
  "principle-broker",
  "broker",
  "builder",
  "broker-staff",
  "builder-staff",
]);

export interface ActiveBuildParticipantProjection {
  displayName: string;
  participationPeriod: number;
  role: BuildCollaborationRole;
  source: "derived" | "grant";
  workosUserId: string;
}

export interface ActiveBuildAuthorization {
  brokerage: Doc<"brokerages">;
  build: Doc<"activeBuilds">;
  effectiveRole: {
    role: BuildCollaborationRole;
    tier: number;
  };
  organizationId: string;
  participants: ActiveBuildParticipantProjection[];
  proposal: Doc<"buildProposals">;
  roles: BuildCollaborationRole[];
  viewer: AuthorizedViewer;
}

export async function authorizeActiveBuildAccess(
  ctx: ActiveBuildAccessCtx,
  input: {
    buildId: Id<"activeBuilds">;
    organizationId: string;
  }
): Promise<ActiveBuildAuthorization> {
  const organizationId = input.organizationId.trim();
  if (!organizationId) {
    throw new Error("Organization is required.");
  }

  const viewerRoles = normalizeRoleSlugs(ctx.viewer.roles);

  const brokerage = await ctx.db
    .query("brokerages")
    .withIndex("by_workos_organization", (query) =>
      query.eq("workosOrganizationId", organizationId)
    )
    .unique();
  if (!brokerage || brokerage.status !== "active") {
    throw new Error("Forbidden: brokerage");
  }

  const build = await ctx.db.get(input.buildId);
  if (
    !build ||
    build.organizationId !== organizationId ||
    build.brokerageId !== brokerage._id
  ) {
    throw new Error("Forbidden: active build scope");
  }
  const proposal = await ctx.db.get(build.proposalId);
  if (
    !proposal ||
    proposal.organizationId !== organizationId ||
    proposal.brokerageId !== brokerage._id
  ) {
    throw new Error("Forbidden: active build proposal scope");
  }

  const grantedParticipants = await ctx.db
    .query("buildParticipants")
    .withIndex("by_buildId_and_status", (query) =>
      query.eq("buildId", build._id).eq("status", "active")
    )
    .take(500);
  const latestViewerParticipation = await ctx.db
    .query("buildParticipants")
    .withIndex("by_buildId_and_workosUserId_and_participationPeriod", (query) =>
      query.eq("buildId", build._id).eq("workosUserId", ctx.viewer.subject)
    )
    .order("desc")
    .first();
  if (
    latestViewerParticipation?.status === "removed" &&
    !viewerRoles.includes("admin") &&
    !viewerRoles.includes("principle-broker")
  ) {
    throw new Error("Forbidden: active build participation revoked");
  }
  const viewerGrant =
    latestViewerParticipation?.status === "active"
      ? latestViewerParticipation
      : undefined;
  await requireOrganizationAccess(ctx, {
    hasActiveBuildGrant: Boolean(viewerGrant),
    organizationId,
    viewer: ctx.viewer,
    viewerRoles,
  });
  const derivedRole = await resolveDerivedBuildRole(ctx, {
    build,
    proposal,
    viewer: ctx.viewer,
    viewerRoles,
  });
  const effectiveRole = resolveEffectiveCollaborationRole([
    ...viewerRoles,
    viewerGrant?.role,
    derivedRole,
  ]);
  if (
    !(
      effectiveRole &&
      (await canAccessBuild(ctx, {
        build,
        proposal,
        viewer: ctx.viewer,
        viewerGrant,
        viewerRoles,
      }))
    )
  ) {
    throw new Error("Forbidden: active build participation");
  }

  const participants = await projectActiveBuildParticipants(ctx, {
    build,
    grantedParticipants,
    proposal,
  });
  if (
    !participants.some(
      (participant) => participant.workosUserId === ctx.viewer.subject
    )
  ) {
    participants.push({
      displayName: ctx.viewer.email ?? ctx.viewer.subject,
      participationPeriod: 1,
      role: effectiveRole.role,
      source: "derived",
      workosUserId: ctx.viewer.subject,
    });
  }

  return {
    brokerage,
    build,
    effectiveRole,
    organizationId,
    participants: participants.sort(
      (left, right) =>
        right.participationPeriod - left.participationPeriod ||
        left.displayName.localeCompare(right.displayName)
    ),
    proposal,
    roles: [
      ...new Set(
        [effectiveRole.role, viewerGrant?.role, derivedRole].filter(
          (role): role is BuildCollaborationRole => role !== undefined
        )
      ),
    ],
    viewer: ctx.viewer,
  };
}

async function requireOrganizationAccess(
  ctx: QueryCtx | MutationCtx,
  input: {
    hasActiveBuildGrant: boolean;
    organizationId: string;
    viewer: AuthorizedViewer;
    viewerRoles: RoleSlug[];
  }
) {
  if (input.viewerRoles.includes("admin")) {
    return;
  }
  if (input.hasActiveBuildGrant) {
    return;
  }
  if (input.viewer.organizationId?.trim() === input.organizationId) {
    return;
  }
  const memberships = await ctx.db
    .query("workosOrganizationMemberships")
    .withIndex("by_user", (query) =>
      query.eq("workosUserId", input.viewer.subject)
    )
    .take(100);
  if (
    !memberships.some(
      (membership) =>
        membership.workosOrganizationId === input.organizationId &&
        membership.status === "active"
    )
  ) {
    throw new Error("Forbidden: WorkOS membership");
  }
}

async function canAccessBuild(
  ctx: QueryCtx | MutationCtx,
  input: {
    build: Doc<"activeBuilds">;
    proposal: Doc<"buildProposals">;
    viewer: AuthorizedViewer;
    viewerGrant?: Doc<"buildParticipants">;
    viewerRoles: RoleSlug[];
  }
) {
  if (
    input.viewerRoles.includes("admin") ||
    input.viewerRoles.includes("principle-broker") ||
    input.viewerGrant
  ) {
    return true;
  }
  if (input.viewerRoles.includes("broker")) {
    if (input.proposal.assignedBrokerWorkosUserId === input.viewer.subject) {
      return true;
    }
    const assignments = await ctx.db
      .query("buildBrokerAssignments")
      .withIndex("by_build", (query) => query.eq("buildId", input.build._id))
      .take(50);
    return assignments.some(
      (assignment) =>
        assignment.assignedBrokerWorkosUserId === input.viewer.subject
    );
  }
  if (
    input.viewerRoles.includes("builder") ||
    input.viewerRoles.includes("builder-staff")
  ) {
    const links = await ctx.db
      .query("builderAccountLinks")
      .withIndex("by_builder_user", (query) =>
        query
          .eq("builderProfileId", input.build.builderProfileId)
          .eq("workosUserId", input.viewer.subject)
      )
      .take(20);
    const activeLink = links.find((link) => link.status === "active");
    if (!activeLink) {
      return false;
    }
    if (activeLink.role === "owner") {
      return true;
    }
    const grants = await ctx.db
      .query("builderStaffPermissionGrants")
      .withIndex("by_build_link_resource", (query) =>
        query
          .eq("buildId", input.build._id)
          .eq("builderAccountLinkId", activeLink._id)
      )
      .take(100);
    return grants.some(
      (grant) =>
        grant.canView || grant.canCreate || grant.canUpdate || grant.canDelete
    );
  }
  if (input.viewerRoles.includes("contractor")) {
    const contractorProfiles = await ctx.db
      .query("contractorProfiles")
      .withIndex("by_account_user", (query) =>
        query.eq("accountWorkosUserId", input.viewer.subject)
      )
      .take(20);
    for (const contractor of contractorProfiles) {
      const assignment = await ctx.db
        .query("buildContractorAssignments")
        .withIndex("by_build_contractor", (query) =>
          query
            .eq("buildId", input.build._id)
            .eq("contractorId", contractor._id)
        )
        .first();
      if (assignment?.status !== "inactive") {
        return Boolean(assignment);
      }
    }
  }
  return false;
}

async function resolveDerivedBuildRole(
  ctx: QueryCtx | MutationCtx,
  input: {
    build: Doc<"activeBuilds">;
    proposal: Doc<"buildProposals">;
    viewer: AuthorizedViewer;
    viewerRoles: RoleSlug[];
  }
): Promise<BuildCollaborationRole | undefined> {
  if (input.viewerRoles.includes("admin")) {
    return "admin";
  }
  if (input.viewerRoles.includes("principle-broker")) {
    return "principle-broker";
  }
  if (input.viewerRoles.includes("broker")) {
    return "broker";
  }
  if (
    input.viewerRoles.includes("builder") ||
    input.viewerRoles.includes("builder-staff")
  ) {
    const links = await ctx.db
      .query("builderAccountLinks")
      .withIndex("by_builder_user", (query) =>
        query
          .eq("builderProfileId", input.build.builderProfileId)
          .eq("workosUserId", input.viewer.subject)
      )
      .take(20);
    const activeLink = links.find((link) => link.status === "active");
    if (activeLink?.role === "owner") {
      return "builder";
    }
    if (activeLink?.role === "staff") {
      return "builder-staff";
    }
  }
  if (input.viewerRoles.includes("contractor")) {
    return "contractor";
  }
  return;
}

export async function projectActiveBuildParticipants(
  ctx: QueryCtx | MutationCtx,
  input: {
    build: Doc<"activeBuilds">;
    grantedParticipants: Doc<"buildParticipants">[];
    proposal: Doc<"buildProposals">;
  }
) {
  const projections: ActiveBuildParticipantProjection[] =
    input.grantedParticipants.map((participant) => ({
      displayName: participant.displayNameSnapshot,
      participationPeriod: participant.participationPeriod,
      role: participant.role,
      source: "grant",
      workosUserId: participant.workosUserId,
    }));
  const implicit = new Map<string, BuildCollaborationRole>();
  if (input.proposal.assignedBrokerWorkosUserId) {
    implicit.set(input.proposal.assignedBrokerWorkosUserId, "broker");
  }
  const builderLinks = await ctx.db
    .query("builderAccountLinks")
    .withIndex("by_builder", (query) =>
      query.eq("builderProfileId", input.build.builderProfileId)
    )
    .take(200);
  for (const link of builderLinks) {
    if (link.status === "active") {
      implicit.set(
        link.workosUserId,
        link.role === "owner" ? "builder" : "builder-staff"
      );
    }
  }
  const brokerAssignments = await ctx.db
    .query("buildBrokerAssignments")
    .withIndex("by_build", (query) => query.eq("buildId", input.build._id))
    .take(100);
  for (const assignment of brokerAssignments) {
    implicit.set(assignment.assignedBrokerWorkosUserId, "broker");
  }
  const contractorAssignments = await ctx.db
    .query("buildContractorAssignments")
    .withIndex("by_build", (query) => query.eq("buildId", input.build._id))
    .take(500);
  for (const assignment of contractorAssignments) {
    if (assignment.status === "inactive") {
      continue;
    }
    const profile = await ctx.db.get(assignment.contractorId);
    if (profile?.accountWorkosUserId) {
      implicit.set(profile.accountWorkosUserId, "contractor");
    }
  }
  for (const [workosUserId, role] of implicit) {
    if (
      projections.some(
        (participant) => participant.workosUserId === workosUserId
      )
    ) {
      continue;
    }
    const users = await ctx.db
      .query("users")
      .withIndex("by_workos_user_id", (query) =>
        query.eq("workosUserId", workosUserId)
      )
      .take(10);
    const user = users.sort(
      (left, right) =>
        (right.updatedAt ?? right._creationTime) -
        (left.updatedAt ?? left._creationTime)
    )[0];
    projections.push({
      displayName: user?.name ?? user?.email ?? workosUserId,
      participationPeriod: 1,
      role,
      source: "derived",
      workosUserId,
    });
  }
  return projections;
}

/**
 * Resolve every coordinator who has canonical authority on a Build. This
 * deliberately combines Build-local grants/assignments with tenant-wide
 * Admin and Principle Broker membership instead of treating the explicit
 * participant rows as the complete access-control projection.
 */
export async function resolveActiveBuildCoordinatorIds(
  ctx: QueryCtx | MutationCtx,
  input: {
    build: Doc<"activeBuilds">;
    grantedParticipants: Doc<"buildParticipants">[];
    proposal: Doc<"buildProposals">;
  }
) {
  const participants = await projectActiveBuildParticipants(ctx, input);
  const recipients = new Set(
    participants
      .filter((participant) =>
        ACTIVE_BUILD_COORDINATOR_ROLES.has(participant.role)
      )
      .map((participant) => participant.workosUserId)
  );
  const memberships = await ctx.db
    .query("workosOrganizationMemberships")
    .withIndex("by_organization", (query) =>
      query.eq("workosOrganizationId", input.build.organizationId)
    )
    .collect();
  for (const membership of memberships) {
    if (membership.status !== "active") {
      continue;
    }
    const roles = normalizeRoleSlugs([
      membership.roleSlug,
      ...membership.roleSlugs,
    ]);
    if (roles.includes("admin") || roles.includes("principle-broker")) {
      recipients.add(membership.workosUserId);
    }
  }
  return [...recipients];
}
