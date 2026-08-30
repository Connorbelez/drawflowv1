import type { RoleSlug } from "../authz";
import type { Doc, Id, MutationCtx } from "../types";

export async function writeCollaborationAuditEvent(
  ctx: MutationCtx,
  input: {
    auth: {
      brokerage: Doc<"brokerages">;
      roles: RoleSlug[];
      subject: string;
    };
    command: string;
    eventType: string;
    newState?: string;
    priorState?: string;
    proposal: Doc<"buildProposals">;
    reason?: string;
    warnings?: string[];
  }
) {
  const now = Date.now();
  const event = {
    actorRoles: input.auth.roles,
    actorWorkosUserId: input.auth.subject,
    brokerageId: input.auth.brokerage._id,
    command: input.command,
    createdAt: now,
    eventType: input.eventType,
    newState: input.newState,
    organizationId: input.proposal.organizationId,
    priorState: input.priorState,
    proposalId: input.proposal._id,
    reason: input.reason,
    warnings: input.warnings ?? [],
  };
  await ctx.db.insert("proposalEvents", event);
  await ctx.db.insert("auditEvents", {
    actorRoles: event.actorRoles,
    actorWorkosUserId: event.actorWorkosUserId,
    brokerageId: event.brokerageId,
    command: event.command,
    createdAt: event.createdAt,
    entityId: input.proposal._id,
    entityType: "buildProposal",
    eventType: event.eventType,
    newState: event.newState,
    organizationId: event.organizationId,
    priorState: event.priorState,
    reason: event.reason,
    warnings: event.warnings,
  });
  await ctx.db.insert("eventOutbox", {
    brokerageId: input.auth.brokerage._id,
    createdAt: now,
    eventType: input.eventType,
    organizationId: input.proposal.organizationId,
    payloadPreview: JSON.stringify({
      newState: input.newState,
      proposalId: input.proposal._id,
    }),
    relatedEntityId: input.proposal._id,
    relatedEntityType: "buildProposal",
    status: "pending",
  });
}

export async function upsertProposalKanbanCard(
  ctx: MutationCtx,
  proposalId: Id<"buildProposals">,
  now: number
) {
  const proposal = await ctx.db.get(proposalId);
  if (!proposal) {
    throw new Error("Missing proposal.");
  }
  const builder = proposal.builderProfileId
    ? await ctx.db.get(proposal.builderProfileId)
    : null;
  const existing = await ctx.db
    .query("proposalKanbanCards")
    .withIndex("by_proposal", (q) => q.eq("proposalId", proposalId))
    .unique();
  const card = {
    brokerageId: proposal.brokerageId,
    builderName: builder?.displayName ?? "Unassigned builder",
    column: proposal.status,
    href: `/backoffice/proposals/${proposalId}`,
    organizationId: proposal.organizationId,
    proposalId,
    sortAt: now,
    subtitle: proposal.location,
    title: proposal.buildName,
    totalBudgetCents: proposal.totalBudgetCents,
    updatedAt: now,
  };
  if (existing) {
    await ctx.db.patch(existing._id, card);
  } else {
    await ctx.db.insert("proposalKanbanCards", card);
  }
}
