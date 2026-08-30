/**
 * Production proposals authorization core bounded-context implementation.
 * The parent facade re-exports its handlers to preserve production_proposals function references.
 */
import { authorizeActiveBuildAccess } from "../activeBuildAccess";
import { type AuthorizedViewer, normalizeRoleSlugs, type RoleSlug } from "../authz";
import { hasActiveCollaborationParticipant } from "../proposal_collaboration_model";
import { type Doc, type Id, type MutationCtx, type QueryCtx } from "../types";
import { requireAnyBuilderStaffViewPermission, getWorkosUserForBuilderAccountLink } from "./builder_staff_access.js";
import { assertBackofficeProposalRead, requireBackofficeProposalWrite, requireAnyRole } from "./contractor_policy_helpers.js";
import { BACKOFFICE_ROLES, APPROVER_ROLES } from "./contracts_foundation.js";
import { isBackoffice } from "./proposal_claim.js";
import { collectByIndex } from "./storage_helpers.js";

export async function authorizeBrokerage(
  ctx: QueryCtx | MutationCtx,
  workosOrganizationId: string,
  viewer?: AuthorizedViewer,
) {
  const scope = await resolveBrokerageScope(ctx, workosOrganizationId, viewer);
  if (!scope.brokerage) {
    throw new Error("Forbidden: brokerage");
  }

  return {
    brokerage: scope.brokerage,
    roles: scope.roles,
    subject: scope.subject,
  };
}

export async function resolveBrokerageScope(
  ctx: QueryCtx | MutationCtx,
  workosOrganizationId: string,
  viewer?: AuthorizedViewer,
) {
  const activeViewer =
    viewer ?? (ctx as unknown as { viewer: AuthorizedViewer }).viewer;
  const roles = normalizeRoleSlugs(activeViewer.roles);
  const subject = activeViewer.subject;
  const membership = await ctx.db
    .query("workosOrganizationMemberships")
    .withIndex("by_user", (q) => q.eq("workosUserId", subject))
    .filter((q) => q.eq(q.field("workosOrganizationId"), workosOrganizationId))
    .first();
  const activeTokenOrganizationId = activeViewer.organizationId?.trim();
  if (
    (!membership || membership.status !== "active") &&
    activeTokenOrganizationId !== workosOrganizationId
  ) {
    throw new Error("Forbidden: WorkOS membership");
  }

  const brokerage = await ctx.db
    .query("brokerages")
    .withIndex("by_workos_organization", (q) =>
      q.eq("workosOrganizationId", workosOrganizationId),
    )
    .unique();
  const activeBrokerage = brokerage?.status === "active" ? brokerage : null;

  return { brokerage: activeBrokerage, roles, subject };
}

export async function authorizeActiveBuild(
  ctx: (QueryCtx | MutationCtx) & { viewer: AuthorizedViewer },
  buildId: Id<"activeBuilds">,
  workosOrganizationId: string,
) {
  return await authorizeActiveBuildForViewer(
    ctx,
    ctx.viewer,
    buildId,
    workosOrganizationId,
  );
}

export async function authorizeActiveBuildForViewer(
  ctx: QueryCtx | MutationCtx,
  viewer: AuthorizedViewer,
  buildId: Id<"activeBuilds">,
  workosOrganizationId: string,
) {
  const auth = await authorizeBrokerage(ctx, workosOrganizationId, viewer);
  const build = await ctx.db.get(buildId);
  if (!build || build.brokerageId !== auth.brokerage._id) {
    return null;
  }
  const proposal = await ctx.db.get(build.proposalId);
  if (!proposal || proposal.brokerageId !== auth.brokerage._id) {
    return null;
  }
  if (isBackoffice(auth.roles)) {
    await assertBackofficeProposalRead(ctx, auth, proposal);
  } else {
    const builderProfileId = assignedBuilderProfileIdOrThrow(proposal);
    await requireAnyBuilderStaffViewPermission(ctx, auth, {
      buildId,
      builderProfileId,
      proposalId: proposal._id,
      scope: "activeBuild",
    });
  }
  return { ...auth, build, proposal };
}

export async function authorizeActiveBuildOrThrow(
  ctx: (QueryCtx | MutationCtx) & { viewer: AuthorizedViewer },
  buildId: Id<"activeBuilds">,
  workosOrganizationId: string,
) {
  const auth = await authorizeActiveBuild(ctx, buildId, workosOrganizationId);
  if (!auth) {
    throw new Error("Forbidden: active build scope");
  }
  return auth;
}

export async function authorizeActiveBuildForStart(
  ctx: (QueryCtx | MutationCtx) & { viewer: AuthorizedViewer },
  buildId: Id<"activeBuilds">,
  workosOrganizationId: string
): Promise<Awaited<ReturnType<typeof authorizeActiveBuildOrThrow>>> {
  if (!ctx.viewer.roles.includes("contractor")) {
    return await authorizeActiveBuildOrThrow(
      ctx,
      buildId,
      workosOrganizationId
    );
  }
  const access = await authorizeActiveBuildAccess(ctx, {
    buildId,
    organizationId: workosOrganizationId,
  });
  return {
    brokerage: access.brokerage,
    build: access.build,
    proposal: access.proposal,
    roles: normalizeRoleSlugs(ctx.viewer.roles),
    subject: ctx.viewer.subject,
  };
}

export function requireBackofficeActiveBuildWrite(auth: {
  proposal: Doc<"buildProposals">;
  roles: RoleSlug[];
  subject: string;
}) {
  requireAnyRole(auth.roles, BACKOFFICE_ROLES);
  requireBackofficeProposalWrite(auth, auth.proposal);
}

export function requireApproverActiveBuildWrite(auth: {
  proposal: Doc<"buildProposals">;
  roles: RoleSlug[];
  subject: string;
}) {
  requireAnyRole(auth.roles, APPROVER_ROLES);
  requireBackofficeProposalWrite(auth, auth.proposal);
}

export async function getPrimaryLoanFacility(
  ctx: QueryCtx | MutationCtx,
  buildId: Id<"activeBuilds">,
) {
  const facilities = (await collectByIndex(
    ctx,
    "loanFacilities",
    "by_build",
    buildId,
  )) as Doc<"loanFacilities">[];
  return (
    facilities.find(
      (facility) =>
        facility.facilityKind === undefined ||
        facility.facilityKind === "construction",
    ) ?? null
  );
}

export async function authorizeProposal(
  ctx: (QueryCtx | MutationCtx) & { viewer: AuthorizedViewer },
  proposalId: Id<"buildProposals">,
  workosOrganizationId: string,
) {
  return await authorizeProposalForViewer(
    ctx,
    ctx.viewer,
    proposalId,
    workosOrganizationId,
  );
}

export async function authorizeProposalForViewer(
  ctx: QueryCtx | MutationCtx,
  viewer: AuthorizedViewer,
  proposalId: Id<"buildProposals">,
  workosOrganizationId: string,
) {
  const auth = await authorizeBrokerage(ctx, workosOrganizationId, viewer);
  const proposal = await ctx.db.get(proposalId);
  if (!proposal || proposal.brokerageId !== auth.brokerage._id) {
    throw new Error("Forbidden: proposal scope");
  }
  if (isBackoffice(auth.roles)) {
    try {
      await assertBackofficeProposalRead(ctx, auth, proposal);
    } catch (error) {
      if (
        await hasActiveCollaborationParticipant(ctx, proposal._id, auth.subject)
      ) {
        return { ...auth, proposal };
      }
      throw error;
    }
  } else {
    if (
      !proposal.builderProfileId &&
      (await hasActiveCollaborationParticipant(ctx, proposal._id, auth.subject))
    ) {
      return { ...auth, proposal };
    }
    const builderProfileId = assignedBuilderProfileIdOrThrow(proposal);
    try {
      await requireAnyBuilderStaffViewPermission(ctx, auth, {
        builderProfileId,
        proposalId: proposal._id,
        scope: "proposal",
      });
    } catch (error) {
      if (
        await hasActiveCollaborationParticipant(ctx, proposal._id, auth.subject)
      ) {
        return { ...auth, proposal };
      }
      throw error;
    }
  }
  return { ...auth, proposal };
}

export async function assertBuilderProfileScope(
  ctx: QueryCtx | MutationCtx,
  builderProfileId: Id<"builderProfiles">,
  brokerageId: Id<"brokerages">,
) {
  const builder = await ctx.db.get(builderProfileId);
  if (
    !builder ||
    builder.brokerageId !== brokerageId ||
    builder.status !== "active"
  ) {
    throw new Error("Forbidden: builder scope");
  }
  return builder;
}

export function assignedBuilderProfileIdOrThrow(
  proposal: Pick<Doc<"buildProposals">, "builderProfileId">,
  message = "Proposal is not assigned to a builder.",
) {
  if (!proposal.builderProfileId) {
    throw new Error(message);
  }
  return proposal.builderProfileId;
}

export async function assertBuilderOwnership(
  ctx: QueryCtx | MutationCtx,
  builderProfileId: Id<"builderProfiles">,
  workosUserId: string,
) {
  const link = await getActiveBuilderAccountLink(
    ctx,
    builderProfileId,
    workosUserId,
  );
  if (!link || link.status !== "active") {
    throw new Error("Forbidden: builder ownership");
  }
  await assertBuilderAccountLinkNotDeleted(ctx, link, builderProfileId);
}

export async function getActiveBuilderAccountLink(
  ctx: QueryCtx | MutationCtx,
  builderProfileId: Id<"builderProfiles">,
  workosUserId: string,
) {
  const link = await ctx.db
    .query("builderAccountLinks")
    .withIndex("by_builder_user", (q) =>
      q
        .eq("builderProfileId", builderProfileId)
        .eq("workosUserId", workosUserId),
    )
    .unique();
  return link?.status === "active" ? link : null;
}

export async function assertBuilderAccountLinkNotDeleted(
  ctx: QueryCtx | MutationCtx,
  link: Doc<"builderAccountLinks">,
  builderProfileId: Id<"builderProfiles">,
) {
  const workosOrganizationId =
    await builderProfileBrokerageWorkosOrganizationId(ctx, builderProfileId);
  const workosState = await builderAccountLinkWorkosState(ctx, {
    link,
    workosOrganizationId,
  });
  if (workosState.hidden) {
    throw new Error("Forbidden: builder account is not active in WorkOS");
  }
}

export async function builderProfileBrokerageWorkosOrganizationId(
  ctx: QueryCtx | MutationCtx,
  builderProfileId: Id<"builderProfiles">,
) {
  const builderProfile = await ctx.db.get(builderProfileId);
  if (!builderProfile) {
    throw new Error("Forbidden: builder scope");
  }
  const brokerage = await ctx.db.get(builderProfile.brokerageId);
  if (!brokerage || brokerage.status !== "active") {
    throw new Error("Forbidden: brokerage");
  }
  return brokerage.workosOrganizationId;
}

export async function builderAccountLinkWorkosState(
  ctx: QueryCtx | MutationCtx,
  input: {
    link: Doc<"builderAccountLinks">;
    workosOrganizationId: string;
  },
) {
  const user = await getWorkosUserForBuilderAccountLink(ctx, input.link);
  if (user?.status === "deleted") {
    return { hidden: true as const, membership: null, user };
  }

  const membership = await getBuilderAccountLinkWorkosMembership(ctx, {
    ...input,
    user,
  });
  if (input.link.role === "staff" && membership?.status === "pending") {
    if (
      workosMembershipRoleSlugs(membership).includes("builder-staff") ||
      isBuilderStaffRoleSyncPending(input.link, membership)
    ) {
      return {
        hidden: false as const,
        identityStatus: "pending" as const,
        membership,
        user,
      };
    }
    return { hidden: true as const, membership, user };
  }

  if (membership && membership.status !== "active") {
    return { hidden: true as const, membership, user };
  }

  if (
    input.link.role === "staff" &&
    membership?.status === "active" &&
    !workosMembershipRoleSlugs(membership).includes("builder-staff")
  ) {
    if (isBuilderStaffRoleSyncPending(input.link, membership)) {
      return {
        hidden: false as const,
        identityStatus: "pending" as const,
        membership,
        user,
      };
    }
    return { hidden: true as const, membership, user };
  }

  const projected = Boolean(user && membership);
  return {
    hidden: false as const,
    identityStatus: projected ? ("active" as const) : ("pending" as const),
    membership,
    user,
  };
}

function isBuilderStaffRoleSyncPending(
  link: Doc<"builderAccountLinks">,
  membership: Doc<"workosOrganizationMemberships">,
) {
  return (
    Boolean(link.workosMembershipId) &&
    link.workosMembershipId === membership.workosMembershipId &&
    link.updatedAt >= (membership.updatedAt ?? 0)
  );
}

async function getBuilderAccountLinkWorkosMembership(
  ctx: QueryCtx | MutationCtx,
  input: {
    link: Doc<"builderAccountLinks">;
    user?: Doc<"users"> | null;
    workosOrganizationId: string;
  },
) {
  if (input.link.workosMembershipId) {
    const workosMembershipId = input.link.workosMembershipId;
    const membership = await ctx.db
      .query("workosOrganizationMemberships")
      .withIndex("by_workos_membership_id", (q) =>
        q.eq("workosMembershipId", workosMembershipId),
      )
      .unique();
    if (membership) {
      return membership;
    }
  }

  const workosUserId = input.user?.workosUserId ?? input.link.workosUserId;
  return await ctx.db
    .query("workosOrganizationMemberships")
    .withIndex("by_user", (q) => q.eq("workosUserId", workosUserId))
    .filter((q) =>
      q.eq(q.field("workosOrganizationId"), input.workosOrganizationId),
    )
    .first();
}

function workosMembershipRoleSlugs(
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
