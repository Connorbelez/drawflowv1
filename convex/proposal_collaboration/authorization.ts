import { normalizeRoleSlugs, type RoleSlug } from "../authz";
import type { Doc, Id, MutationCtx, QueryCtx } from "../types";
import {
  CollaborationAuth,
  type CollaborationPermission,
  type CollaborationCtx,
  isBrokerSideRole,
  isCollaborationRole,
  shareTokenHash,
} from "./contracts";

export async function resolveCollaborationAuth(
  ctx: CollaborationCtx,
  proposalId: Id<"buildProposals">,
  workosOrganizationId: string,
  options: { allowActiveParticipant?: boolean } = {}
): Promise<CollaborationAuth> {
  if (!ctx.viewer) {
    throw new Error("Unauthorized");
  }
  const scope = await resolveWorkosScope(ctx, workosOrganizationId);
  const proposal = await ctx.db.get(proposalId);
  if (!proposal || proposal.brokerageId !== scope.brokerage._id) {
    throw new Error("Forbidden: proposal scope");
  }
  if (!isCollaborationRole(scope.roles)) {
    throw new Error("Forbidden: collaboration role");
  }
  const canReadNormally = await canReadProposalForCollaboration(
    ctx,
    scope,
    proposal
  );
  const canReadAsParticipant =
    options.allowActiveParticipant === true &&
    (await hasActiveCollaborationParticipant(ctx, proposal._id, scope.subject));
  if (!(canReadNormally || canReadAsParticipant)) {
    throw new Error("Forbidden: proposal scope");
  }
  return { ...scope, proposal };
}

export async function resolveWorkosScope(
  ctx: CollaborationCtx,
  workosOrganizationId: string
) {
  if (!ctx.viewer) {
    throw new Error("Unauthorized");
  }
  const membership = await getActiveMembership(
    ctx,
    ctx.viewer.subject,
    workosOrganizationId
  );
  const roles = normalizeRoleSlugs(membership.roleSlugs);
  if (!isCollaborationRole(roles)) {
    throw new Error("Forbidden: collaboration role");
  }
  const brokerage = await ctx.db
    .query("brokerages")
    .withIndex("by_workos_organization", (q) =>
      q.eq("workosOrganizationId", workosOrganizationId)
    )
    .unique();
  if (!brokerage || brokerage.status !== "active") {
    throw new Error("Forbidden: brokerage");
  }
  return {
    brokerage,
    membership,
    roles,
    subject: ctx.viewer.subject,
  };
}

export async function getActiveMembership(
  ctx: CollaborationCtx,
  workosUserId: string,
  workosOrganizationId: string
) {
  const memberships = await ctx.db
    .query("workosOrganizationMemberships")
    .withIndex("by_user", (q) => q.eq("workosUserId", workosUserId))
    .collect();
  const membership = memberships.find(
    (row) => row.workosOrganizationId === workosOrganizationId
  );
  if (!membership || membership.status !== "active") {
    throw new Error("Forbidden: WorkOS membership");
  }
  return membership;
}

export async function getActiveSessionForProposal(
  ctx: QueryCtx | MutationCtx,
  proposalId: Id<"buildProposals">
) {
  return await ctx.db
    .query("proposalCollaborationSessions")
    .withIndex("by_proposal_status", (q) =>
      q.eq("proposalId", proposalId).eq("status", "active")
    )
    .first();
}

export async function getSessionOrThrow(
  ctx: QueryCtx | MutationCtx,
  sessionId: Id<"proposalCollaborationSessions">,
  workosOrganizationId: string
) {
  const session = await ctx.db.get(sessionId);
  if (!session || session.organizationId !== workosOrganizationId) {
    throw new Error("Collaboration session not found.");
  }
  return session;
}

export async function getSessionByShareToken(
  ctx: QueryCtx | MutationCtx,
  shareToken: string
) {
  const hashedToken = await shareTokenHash(shareToken);
  return await ctx.db
    .query("proposalCollaborationSessions")
    .withIndex("by_share_token_hash", (q) =>
      q.eq("shareTokenHash", hashedToken)
    )
    .unique();
}

export async function upsertSessionParticipant(
  ctx: MutationCtx,
  input: {
    authRoles: RoleSlug[];
    displayName?: string;
    invitedByWorkosUserId?: string;
    permission: CollaborationPermission;
    session: Doc<"proposalCollaborationSessions">;
    source: "creator" | "invite" | "share-link";
    status: "invited" | "joined" | "revoked";
    workosUserId: string;
  }
) {
  const now = Date.now();
  const existing = await ctx.db
    .query("proposalCollaborationParticipants")
    .withIndex("by_session_user", (q) =>
      q
        .eq("sessionId", input.session._id)
        .eq("workosUserId", input.workosUserId)
    )
    .unique();
  const patch = {
    displayName: input.displayName,
    invitedByWorkosUserId: input.invitedByWorkosUserId,
    lastJoinedAt: input.status === "joined" ? now : existing?.lastJoinedAt,
    permission: input.permission,
    roleSlugs: input.authRoles,
    source: input.source,
    status: input.status,
    updatedAt: now,
  };
  if (existing) {
    await ctx.db.patch(existing._id, patch);
    const updated = await ctx.db.get(existing._id);
    if (!updated) {
      throw new Error("Collaboration participant update failed.");
    }
    return updated;
  }
  const participantId = await ctx.db.insert(
    "proposalCollaborationParticipants",
    {
      ...patch,
      brokerageId: input.session.brokerageId,
      createdAt: now,
      organizationId: input.session.organizationId,
      proposalId: input.session.proposalId,
      sessionId: input.session._id,
      workosUserId: input.workosUserId,
    }
  );
  const participant = await ctx.db.get(participantId);
  if (!participant) {
    throw new Error("Collaboration participant insert failed.");
  }
  return participant;
}

export async function getParticipantForUser(
  ctx: QueryCtx | MutationCtx,
  sessionId: Id<"proposalCollaborationSessions">,
  workosUserId: string
) {
  return await ctx.db
    .query("proposalCollaborationParticipants")
    .withIndex("by_session_user", (q) =>
      q.eq("sessionId", sessionId).eq("workosUserId", workosUserId)
    )
    .unique();
}

export async function assertParticipantCanEdit(
  ctx: QueryCtx | MutationCtx,
  session: Doc<"proposalCollaborationSessions">,
  workosUserId: string
) {
  const participant = await getParticipantForUser(
    ctx,
    session._id,
    workosUserId
  );
  if (!participant) {
    throw new Error("Forbidden: collaboration participant");
  }
  if (participant?.status === "revoked") {
    throw new Error("Collaboration participant access was revoked.");
  }
  if (participant?.permission === "view") {
    throw new Error("Collaboration participant is view-only.");
  }
}

export async function assertCanManageSession(
  ctx: QueryCtx | MutationCtx,
  session: Doc<"proposalCollaborationSessions">,
  auth: { roles: RoleSlug[]; subject: string }
) {
  if (
    session.startedByWorkosUserId === auth.subject ||
    auth.roles.includes("admin") ||
    auth.roles.includes("principle-broker")
  ) {
    return;
  }
  throw new Error("Forbidden: collaboration manage permission");
}

export async function assertProposalCollaborationEditAllowed(
  ctx: QueryCtx | MutationCtx,
  auth: { proposal: Doc<"buildProposals">; subject: string }
) {
  const session = await getActiveSessionForProposal(ctx, auth.proposal._id);
  if (!session) {
    return;
  }
  await assertParticipantCanEdit(ctx, session, auth.subject);
}

export async function hasActiveCollaborationParticipant(
  ctx: QueryCtx | MutationCtx,
  proposalId: Id<"buildProposals">,
  workosUserId: string
) {
  const session = await getActiveSessionForProposal(ctx, proposalId);
  if (!session) {
    return false;
  }
  const participant = await getParticipantForUser(
    ctx,
    session._id,
    workosUserId
  );
  return Boolean(
    participant &&
      participant.status !== "revoked" &&
      participant.organizationId === session.organizationId
  );
}


export async function canReadProposalForCollaboration(
  ctx: CollaborationCtx,
  scope: {
    brokerage: Doc<"brokerages">;
    roles: RoleSlug[];
    subject: string;
  },
  proposal: Doc<"buildProposals">
) {
  if (isBrokerSideRole(scope.roles)) {
    return true;
  }
  if (!proposal.builderProfileId) {
    return false;
  }
  const builderProfileId = proposal.builderProfileId;
  const link = await ctx.db
    .query("builderAccountLinks")
    .withIndex("by_builder_user", (q) =>
      q
        .eq("builderProfileId", builderProfileId)
        .eq("workosUserId", scope.subject)
    )
    .unique();
  return Boolean(link && link.status === "active");
}
