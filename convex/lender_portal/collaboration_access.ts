import type {
  ActiveBuildAuthorization,
  ActiveBuildParticipantProjection,
} from "../activeBuildAccess";
import { projectActiveBuildParticipants } from "../activeBuildAccess";
import type {
  ActiveLenderOrganizationContext,
  AuthorizedViewer,
  LenderRoleSlug,
} from "../authz";
import {
  type BuildCollaborationRole,
  collaborationRoleTier,
} from "../build_collaboration_model";
import { listAccessibleLenderBuilds } from "../lender_portal_access";
import { listActiveLenderOrganizationMembers } from "../lenderOrganizationAccess";
import type { Id, MutationCtx, QueryCtx } from "../types";

type LenderCollaborationCtx = (QueryCtx | MutationCtx) & {
  activeOrganization: ActiveLenderOrganizationContext;
  viewer: AuthorizedViewer;
};

function lenderCollaborationRole(
  roles: readonly LenderRoleSlug[]
): Extract<BuildCollaborationRole, "lender" | "lender-admin" | "lender-staff"> {
  if (roles.includes("lender-admin") || roles.includes("admin")) {
    return "lender-admin";
  }
  if (roles.includes("lender")) {
    return "lender";
  }
  if (roles.includes("lender-staff")) {
    return "lender-staff";
  }
  throw new Error("Forbidden: lender collaboration role");
}

function mergeParticipant(
  participants: Map<string, ActiveBuildParticipantProjection>,
  participant: ActiveBuildParticipantProjection
) {
  participants.set(participant.workosUserId, participant);
}

/**
 * Adapt the existing assigned-lender boundary to the canonical Build
 * Collaboration authorization shape. The active lender route determines the
 * actor capacity, while persisted collaboration records remain scoped to the
 * Build's canonical organization and brokerage.
 */
export async function authorizeAssignedLenderBuildCollaboration(
  ctx: LenderCollaborationCtx,
  buildId: Id<"activeBuilds">
): Promise<ActiveBuildAuthorization> {
  const accessible = (await listAccessibleLenderBuilds(ctx)).find(
    (row) => row.build._id === buildId
  );
  if (!accessible) {
    throw new Error("Forbidden: lender Build collaboration access");
  }
  const { build, proposal } = accessible;
  const brokerage = await ctx.db.get(build.brokerageId);
  if (!brokerage || brokerage.status !== "active") {
    throw new Error("Forbidden: lender Build brokerage");
  }

  const grantedParticipants = await ctx.db
    .query("buildParticipants")
    .withIndex("by_buildId_and_status", (query) =>
      query.eq("buildId", build._id).eq("status", "active")
    )
    .take(500);
  const canonicalParticipants = await projectActiveBuildParticipants(ctx, {
    build,
    grantedParticipants,
    proposal,
  });
  const lenderMembers = await listActiveLenderOrganizationMembers(
    ctx,
    ctx.activeOrganization.lenderOrganizationId
  );
  const participants = new Map(
    canonicalParticipants.map((participant) => [
      participant.workosUserId,
      participant,
    ])
  );
  for (const member of lenderMembers) {
    mergeParticipant(participants, {
      displayName: member.name || member.email,
      participationPeriod: 1,
      role: lenderCollaborationRole(member.roles),
      source: "derived",
      workosUserId: member.workosUserId,
    });
  }

  const role = lenderCollaborationRole(ctx.activeOrganization.roles);
  if (!participants.has(ctx.viewer.subject)) {
    throw new Error("Forbidden: active lender collaboration participant");
  }
  return {
    brokerage,
    build,
    effectiveRole: { role, tier: collaborationRoleTier(role) },
    organizationId: build.organizationId,
    participants: [...participants.values()].sort(
      (left, right) =>
        right.participationPeriod - left.participationPeriod ||
        left.displayName.localeCompare(right.displayName)
    ),
    proposal,
    roles: [role],
    viewer: ctx.viewer,
  };
}

export function isLenderCollaborationRole(
  role: BuildCollaborationRole
): role is Extract<
  BuildCollaborationRole,
  "lender" | "lender-admin" | "lender-staff"
> {
  return (
    role === "lender" || role === "lender-admin" || role === "lender-staff"
  );
}
