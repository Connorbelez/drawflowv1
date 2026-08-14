import type { AuthorizedViewer, RoleSlug } from "./authz";
import { normalizeRoleSlugs } from "./authz";
import {
  type BuildCollaborationRole,
  collaborationRoleTier,
  normalizeBuildCollaborationRole,
  resolveEffectiveCollaborationRole,
} from "./build_collaboration_model";
import type { Doc, Id, MutationCtx, QueryCtx } from "./types";
import { hasProjectedWorkosPermission } from "./workos_permission_access";

type ActiveBuildAccessCtx = (QueryCtx | MutationCtx) & {
  viewer: AuthorizedViewer;
};

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

/**
 * Pin an authorization to the participant capacity selected by a role-specific
 * workspace. This prevents a shared identity from silently inheriting its
 * strongest unrelated capacity while operating inside Homeowner or Contractor
 * routes. The requested capacity must still be present in the server-derived
 * current authorization graph.
 */
export function selectActiveBuildAuthorizationCapacity(
  authorization: ActiveBuildAuthorization,
  requestedCapacity?: BuildCollaborationRole
): ActiveBuildAuthorization {
  if (!requestedCapacity) {
    return authorization;
  }
  if (!authorization.roles.includes(requestedCapacity)) {
    throw new Error("Forbidden: active build participant capacity");
  }
  return {
    ...authorization,
    effectiveRole: {
      role: requestedCapacity,
      tier: collaborationRoleTier(requestedCapacity),
    },
    roles: [requestedCapacity],
  };
}

export async function authorizeActiveBuildAccess(
  ctx: ActiveBuildAccessCtx,
  input: {
    backofficePolicy?: "proposal-read";
    buildId: Id<"activeBuilds">;
    organizationId: string;
  }
): Promise<ActiveBuildAuthorization> {
  return await authorizeActiveBuildAccessForViewer(ctx, ctx.viewer, input);
}

export async function authorizeActiveBuildAccessForViewer(
  ctx: QueryCtx | MutationCtx,
  viewer: AuthorizedViewer,
  input: {
    backofficePolicy?: "proposal-read";
    buildId: Id<"activeBuilds">;
    organizationId: string;
  }
): Promise<ActiveBuildAuthorization> {
  const organizationId = input.organizationId.trim();
  if (!organizationId) {
    throw new Error("Organization is required.");
  }

  const memberships = await ctx.db
    .query("workosOrganizationMemberships")
    .withIndex("by_user", (query) => query.eq("workosUserId", viewer.subject))
    .take(100);
  const activeMemberships = memberships.filter(
    (membership) => membership.status === "active"
  );
  const viewerRolesFromToken = currentMembershipBackedTokenRoles(
    viewer.roles,
    activeMemberships.length
  );
  const currentOrgMembership = activeMemberships.find(
    (membership) => membership.workosOrganizationId === organizationId
  );
  // Token roles alone miss org membership roleSlugs (and Admin elevation that
  // lives on another org while the session is scoped to a builder org).
  const elevatedFromAnyOrg = normalizeRoleSlugs(
    activeMemberships.flatMap((membership) => [
      ...(membership.roleSlugs ?? []),
      membership.roleSlug,
    ])
  ).filter((role) => role === "admin" || role === "principle-broker");
  const currentOrgRoles = normalizeRoleSlugs([
    ...(currentOrgMembership?.roleSlugs ?? []),
    currentOrgMembership?.roleSlug,
  ]);
  const viewerRoles = normalizeRoleSlugs([
    ...viewerRolesFromToken,
    ...currentOrgRoles,
    ...elevatedFromAnyOrg,
  ]);

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
      query.eq("buildId", build._id).eq("workosUserId", viewer.subject)
    )
    .order("desc")
    .first();
  const latestRemovedParticipantRole =
    latestViewerParticipation?.status === "removed"
      ? latestViewerParticipation.role
      : undefined;
  // Admin and Principal Broker authority is organization-derived, never
  // granted or revoked by a Build-local participant row.
  const revokedGrantRole = revocableBuildGrantRole(
    latestRemovedParticipantRole
  );
  const hasUnrelatedPotentialCapacity = viewerRoles.some(
    (role) =>
      role !== revokedGrantRole &&
      (role === "admin" ||
        role === "principle-broker" ||
        role === "broker" ||
        role === "broker-staff" ||
        role === "builder" ||
        role === "builder-staff" ||
        role === "contractor")
  );
  if (revokedGrantRole && !hasUnrelatedPotentialCapacity) {
    throw new Error("Forbidden: active build participation revoked");
  }
  const viewerGrant =
    latestViewerParticipation?.status === "active"
      ? latestViewerParticipation
      : undefined;
  await requireOrganizationAccess(ctx, {
    hasActiveBuildGrant: Boolean(viewerGrant),
    organizationId,
    viewer,
    viewerRoles,
  });
  const derivedRoles = await resolveDerivedBuildRoles(ctx, {
    backofficePolicy: input.backofficePolicy,
    build,
    proposal,
    viewer,
    viewerRoles,
  });
  const currentRoles = [viewerGrant?.role, ...derivedRoles].filter(
    (role): role is BuildCollaborationRole =>
      role !== undefined && role !== revokedGrantRole
  );
  const effectiveRole = resolveEffectiveCollaborationRole(currentRoles);
  if (
    !(
      effectiveRole &&
      (viewerGrant || derivedRoles.some((role) => role !== revokedGrantRole))
    )
  ) {
    throw new Error(
      latestRemovedParticipantRole
        ? "Forbidden: active build participation revoked"
        : "Forbidden: active build participation"
    );
  }

  const participants = await projectActiveBuildParticipants(ctx, {
    build,
    grantedParticipants,
    proposal,
  });
  if (
    !participants.some(
      (participant) => participant.workosUserId === viewer.subject
    )
  ) {
    participants.push({
      displayName: viewer.email ?? viewer.subject,
      participationPeriod: 1,
      role: effectiveRole.role,
      source: "derived",
      workosUserId: viewer.subject,
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
    // Preserve every collaboration role the viewer holds (membership + grant +
    // derived). Effective role alone collapses admin+builder to admin and
    // hides Builder execution capability on dual-role accounts.
    roles: [
      ...new Set(
        [
          ...viewerRoles
            .map((role) => normalizeBuildCollaborationRole(role))
            .filter((role): role is BuildCollaborationRole => role !== null),
          effectiveRole.role,
          ...currentRoles,
        ].filter((role): role is BuildCollaborationRole => role !== undefined)
      ),
    ],
    viewer,
  };
}

/** Stale token claims cannot preserve role authority after deactivation. */
export function currentMembershipBackedTokenRoles(
  tokenRoles: RoleSlug[],
  activeMembershipCount: number
) {
  return activeMembershipCount > 0 ? normalizeRoleSlugs(tokenRoles) : [];
}

function revocableBuildGrantRole(role?: BuildCollaborationRole) {
  return role !== "admin" && role !== "principle-broker" ? role : undefined;
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

async function resolveBrokerBuildAccess(
  ctx: QueryCtx | MutationCtx,
  input: {
    backofficePolicy?: "proposal-read";
    build: Doc<"activeBuilds">;
    proposal: Doc<"buildProposals">;
    viewer: AuthorizedViewer;
    viewerRoles: RoleSlug[];
  }
): Promise<boolean | undefined> {
  if (!input.viewerRoles.includes("broker")) {
    return;
  }
  if (input.proposal.assignedBrokerWorkosUserId === input.viewer.subject) {
    return true;
  }
  const assignment = await ctx.db
    .query("buildBrokerAssignments")
    .withIndex("by_build_and_assignedBrokerWorkosUserId", (query) =>
      query
        .eq("buildId", input.build._id)
        .eq("assignedBrokerWorkosUserId", input.viewer.subject)
    )
    .first();
  if (assignment) {
    return true;
  }
  return (
    input.backofficePolicy === "proposal-read" &&
    (await hasProjectedWorkosPermission(
      ctx,
      input.build.organizationId,
      input.viewerRoles,
      "proposals:read"
    ))
  );
}

async function resolveDerivedBuildRoles(
  ctx: QueryCtx | MutationCtx,
  input: {
    backofficePolicy?: "proposal-read";
    build: Doc<"activeBuilds">;
    proposal: Doc<"buildProposals">;
    viewer: AuthorizedViewer;
    viewerRoles: RoleSlug[];
  }
): Promise<BuildCollaborationRole[]> {
  const roles: BuildCollaborationRole[] = [];
  if (input.viewerRoles.includes("admin")) {
    roles.push("admin");
  }
  if (input.viewerRoles.includes("principle-broker")) {
    roles.push("principle-broker");
  }
  if ((await resolveBrokerBuildAccess(ctx, input)) === true) {
    roles.push("broker");
  }
  if (
    input.backofficePolicy === "proposal-read" &&
    input.viewerRoles.includes("broker-staff") &&
    (await hasProjectedWorkosPermission(
      ctx,
      input.build.organizationId,
      input.viewerRoles,
      "proposals:read"
    ))
  ) {
    roles.push("broker-staff");
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
    const activeOwnerLink = links.find(
      (link) => link.status === "active" && link.role === "owner"
    );
    const activeStaffLink = links.find(
      (link) => link.status === "active" && link.role === "staff"
    );
    if (activeOwnerLink) {
      roles.push("builder");
    } else if (activeStaffLink) {
      const grants = await ctx.db
        .query("builderStaffPermissionGrants")
        .withIndex("by_build_link_resource", (query) =>
          query
            .eq("buildId", input.build._id)
            .eq("builderAccountLinkId", activeStaffLink._id)
        )
        .take(100);
      if (
        grants.some(
          (grant) =>
            grant.canView ||
            grant.canCreate ||
            grant.canUpdate ||
            grant.canDelete
        )
      ) {
        roles.push("builder-staff");
      }
    }
  }
  if (
    input.viewerRoles.includes("contractor") &&
    (await hasCurrentContractorBuildAccess(ctx, input))
  ) {
    roles.push("contractor");
  }
  return roles;
}

async function hasCurrentContractorBuildAccess(
  ctx: QueryCtx | MutationCtx,
  input: {
    build: Doc<"activeBuilds">;
    viewer: AuthorizedViewer;
  }
) {
  const contractorProfiles = await ctx.db
    .query("contractorProfiles")
    .withIndex("by_account_user", (query) =>
      query.eq("accountWorkosUserId", input.viewer.subject)
    )
    .take(20);
  for (const contractor of contractorProfiles) {
    if (contractor.status !== "active") {
      continue;
    }
    const assignment = await ctx.db
      .query("buildContractorAssignments")
      .withIndex("by_build_contractor", (query) =>
        query.eq("buildId", input.build._id).eq("contractorId", contractor._id)
      )
      .first();
    if (assignment && assignment.status !== "inactive") {
      return true;
    }
  }
  return false;
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
  const latestImplicitParticipation = new Map(
    await Promise.all(
      [...implicit.keys()].map(
        async (workosUserId) =>
          [
            workosUserId,
            await ctx.db
              .query("buildParticipants")
              .withIndex(
                "by_buildId_and_workosUserId_and_participationPeriod",
                (query) =>
                  query
                    .eq("buildId", input.build._id)
                    .eq("workosUserId", workosUserId)
              )
              .order("desc")
              .first(),
          ] as const
      )
    )
  );
  for (const [workosUserId, role] of implicit) {
    if (
      latestImplicitParticipation.get(workosUserId)?.status === "removed" ||
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
