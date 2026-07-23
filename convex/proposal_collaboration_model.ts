import { Presence } from "@convex-dev/presence";
import { Timeline } from "convex-timeline";

import { components } from "./_generated/api";
import { normalizeRoleSlugs, type RoleSlug } from "./authz";
import type { Doc, Id, MutationCtx, QueryCtx } from "./types";

export const COLLABORATION_ROLES = [
  "builder",
  "builder-staff",
  "broker",
  "broker-staff",
  "admin",
  "principle-broker",
] as const satisfies readonly RoleSlug[];

export type CollaborationPermission = "edit" | "view";

type CollaborationCtx = (QueryCtx | MutationCtx) & {
  viewer?: {
    email?: string;
    roles: RoleSlug[];
    subject: string;
  };
};

export interface CollaborationAuth {
  brokerage: Doc<"brokerages">;
  membership: Doc<"workosOrganizationMemberships">;
  proposal: Doc<"buildProposals">;
  roles: RoleSlug[];
  subject: string;
}

export interface ProposalPlanningSnapshot {
  capitalEvents: Array<{
    amountCents: number;
    capitalEventKey: string;
    eventKind: "cashInfusion" | "cost";
    label: string;
    order: number;
    x: number;
  }>;
  costItems?: Array<{
    budgetSubmilestoneKey?: string;
    budgetTreatment?: "add" | "logOnly" | "maintain";
    costCents: number;
    description?: string;
    itemKey: string;
    itemType: "equipment" | "material";
    milestoneKey: string;
    quantity: number;
    relevantSubmilestoneKeys: string[];
    supplier?: string;
    title: string;
  }>;
  draws: Array<{
    amountCents: number;
    customDate?: boolean;
    drawKey: string;
    label: string;
    milestoneKey?: string;
    order: number;
    requestNote?: string;
    requestReviewNote?: string;
    requestStatus?: "approved" | "draft" | "rejected" | "requested";
    requestedAt?: string;
    reviewedAt?: string;
    source: "manual" | "milestone";
    timingDay: number;
  }>;
  milestones: Array<{
    budgetCents: number;
    dayEnd: number;
    dayStart: number;
    dependencyKeys: string[];
    drawAvailabilityCents: number;
    durationDays: number;
    evidenceState?: string;
    icon?: string;
    key: string;
    lane?: number;
    markerLabel?: string;
    name: string;
    order: number;
    policyState?: string;
    submilestones: Array<{
      budgetCents?: number;
      durationDays?: number;
      key: string;
      name: string;
      order: number;
    }>;
    timelineStatus?: string;
    tone?: string;
  }>;
  proposal: {
    borrowerStartingCashCents: number;
    lenderDrawPolicyLimitCents: number;
    timelineCurrentDay?: number;
    timelineProgressValue?: number;
    timelineRangeMax?: number;
    timelineRangeMin?: number;
    timelineRouteState?: unknown;
    timelineStartingCashCents?: number;
    totalBudgetCents: number;
  };
  version: 1;
}

const presence = new Presence(components.presence);
const proposalTimeline = new Timeline(components.timeline, {
  maxNodesPerScope: { "proposal:": 200 },
});

export function proposalTimelineScope(proposalId: Id<"buildProposals">) {
  return `proposal:${proposalId}`;
}

export function proposalCollaborationRoomId(input: {
  organizationId: string;
  proposalId: Id<"buildProposals">;
  sessionId: Id<"proposalCollaborationSessions">;
}) {
  return `org:${input.organizationId}:proposal:${input.proposalId}:session:${input.sessionId}`;
}

export function defaultCollaborationPermission(
  roles: readonly RoleSlug[]
): CollaborationPermission {
  if (roles.includes("builder-staff") || roles.includes("broker-staff")) {
    return "view";
  }
  return "edit";
}

export function isCollaborationRole(roles: readonly RoleSlug[]) {
  return roles.some((role) =>
    (COLLABORATION_ROLES as readonly RoleSlug[]).includes(role)
  );
}

export function isBrokerSideRole(roles: readonly RoleSlug[]) {
  return roles.some((role) =>
    (["admin", "principle-broker", "broker", "broker-staff"] as const).includes(
      role as any
    )
  );
}

export async function shareTokenHash(token: string) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(token)
  );
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export function generateShareToken() {
  return `${crypto.randomUUID()}-${crypto.randomUUID()}`;
}

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

export async function pushProposalPlanningSnapshot(
  ctx: MutationCtx,
  proposalId: Id<"buildProposals">
) {
  const session = await getActiveSessionForProposal(ctx, proposalId);
  if (!session) {
    return;
  }
  const snapshot = await captureProposalPlanningSnapshot(ctx, proposalId);
  const scope = proposalTimelineScope(proposalId);
  const current = await proposalTimeline.currentDocument(ctx, scope);
  if (JSON.stringify(current) === JSON.stringify(snapshot)) {
    return;
  }
  await proposalTimeline.push(ctx, scope, snapshot);
}

export async function getProposalTimelineStatus(
  ctx: QueryCtx,
  proposalId: Id<"buildProposals">
) {
  return await proposalTimeline.status(ctx, proposalTimelineScope(proposalId));
}

export async function undoProposalPlanningSnapshot(
  ctx: MutationCtx,
  proposalId: Id<"buildProposals">
) {
  return (await proposalTimeline.undo(
    ctx,
    proposalTimelineScope(proposalId)
  )) as ProposalPlanningSnapshot | null;
}

export async function redoProposalPlanningSnapshot(
  ctx: MutationCtx,
  proposalId: Id<"buildProposals">
) {
  return (await proposalTimeline.redo(
    ctx,
    proposalTimelineScope(proposalId)
  )) as ProposalPlanningSnapshot | null;
}

export async function captureProposalPlanningSnapshot(
  ctx: QueryCtx | MutationCtx,
  proposalId: Id<"buildProposals">
): Promise<ProposalPlanningSnapshot> {
  const proposal = await ctx.db.get(proposalId);
  if (!proposal) {
    throw new Error("Missing proposal.");
  }
  const [milestones, submilestones, draws, capitalEvents, costItems] =
    await Promise.all([
      ctx.db
        .query("proposalMilestones")
        .withIndex("by_proposal_order", (q) => q.eq("proposalId", proposalId))
        .collect(),
      ctx.db
        .query("proposalSubmilestones")
        .withIndex("by_proposal", (q) => q.eq("proposalId", proposalId))
        .collect(),
      ctx.db
        .query("proposalDrawScheduleRows")
        .withIndex("by_proposal_order", (q) => q.eq("proposalId", proposalId))
        .collect(),
      ctx.db
        .query("proposalCapitalEvents")
        .withIndex("by_proposal_order", (q) => q.eq("proposalId", proposalId))
        .collect(),
      ctx.db
        .query("proposalCostItems")
        .withIndex("by_proposal", (q) => q.eq("proposalId", proposalId))
        .collect(),
    ]);
  const submilestonesByMilestoneKey = new Map<
    string,
    Doc<"proposalSubmilestones">[]
  >();
  for (const submilestone of submilestones) {
    const rows =
      submilestonesByMilestoneKey.get(submilestone.milestoneKey) ?? [];
    rows.push(submilestone);
    submilestonesByMilestoneKey.set(submilestone.milestoneKey, rows);
  }
  return {
    capitalEvents: capitalEvents.map((event) => ({
      amountCents: event.amountCents,
      capitalEventKey: event.capitalEventKey,
      eventKind: event.eventKind,
      label: event.label,
      order: event.order,
      x: event.x,
    })),
    costItems: costItems.map((item) => ({
      budgetSubmilestoneKey: item.budgetSubmilestoneKey,
      budgetTreatment: item.budgetTreatment,
      costCents: item.costCents,
      description: item.description,
      itemKey: item.itemKey,
      itemType: item.itemType,
      milestoneKey: item.milestoneKey,
      quantity: item.quantity,
      relevantSubmilestoneKeys: item.relevantSubmilestoneKeys,
      supplier: item.supplier,
      title: item.title,
    })),
    draws: draws.map((draw) => ({
      amountCents: draw.amountCents,
      customDate: draw.customDate,
      drawKey: draw.drawKey,
      label: draw.label,
      milestoneKey: draw.milestoneKey,
      order: draw.order,
      requestNote: draw.requestNote,
      requestReviewNote: draw.requestReviewNote,
      requestStatus: draw.requestStatus,
      requestedAt: draw.requestedAt,
      reviewedAt: draw.reviewedAt,
      source: draw.source,
      timingDay: draw.timingDay,
    })),
    milestones: milestones.map((milestone) => ({
      budgetCents: milestone.budgetCents,
      dayEnd: milestone.dayEnd,
      dayStart: milestone.dayStart,
      dependencyKeys: milestone.dependencyKeys,
      drawAvailabilityCents: milestone.drawAvailabilityCents,
      durationDays: milestone.durationDays,
      evidenceState: milestone.evidenceState,
      icon: milestone.icon,
      key: milestone.key,
      lane: milestone.lane,
      markerLabel: milestone.markerLabel,
      name: milestone.name,
      order: milestone.order,
      policyState: milestone.policyState,
      submilestones: (submilestonesByMilestoneKey.get(milestone.key) ?? [])
        .sort((a, b) => a.order - b.order || a.key.localeCompare(b.key))
        .map((submilestone) => ({
          budgetCents: submilestone.budgetCents,
          durationDays: submilestone.durationDays,
          key: submilestone.key,
          name: submilestone.name,
          order: submilestone.order,
        })),
      timelineStatus: milestone.timelineStatus,
      tone: milestone.tone,
    })),
    proposal: {
      borrowerStartingCashCents:
        proposal.borrowerStartingCashCents ??
        proposal.timelineStartingCashCents ??
        proposal.borrowerWorkingCapitalLimitCents,
      lenderDrawPolicyLimitCents: proposal.lenderDrawPolicyLimitCents,
      timelineCurrentDay: proposal.timelineCurrentDay,
      timelineProgressValue: proposal.timelineProgressValue,
      timelineRangeMax: proposal.timelineRangeMax,
      timelineRangeMin: proposal.timelineRangeMin,
      timelineRouteState: proposal.timelineRouteState,
      timelineStartingCashCents: proposal.timelineStartingCashCents,
      totalBudgetCents: proposal.totalBudgetCents,
    },
    version: 1,
  };
}

export async function restoreProposalPlanningSnapshot(
  ctx: MutationCtx,
  auth: {
    brokerage: Doc<"brokerages">;
    proposal: Doc<"buildProposals">;
    subject: string;
  },
  snapshot: ProposalPlanningSnapshot
) {
  const now = Date.now();
  const costItemsToRestore =
    snapshot.costItems ??
    (await ctx.db
      .query("proposalCostItems")
      .withIndex("by_proposal", (q) => q.eq("proposalId", auth.proposal._id))
      .collect());
  await deletePlanningRowsForRestore(ctx, auth.proposal._id);
  const milestoneIdByKey = new Map<string, Id<"proposalMilestones">>();
  for (const milestone of snapshot.milestones) {
    const milestoneId = await ctx.db.insert("proposalMilestones", {
      brokerageId: auth.brokerage._id,
      budgetCents: milestone.budgetCents,
      createdAt: now,
      dayEnd: milestone.dayEnd,
      dayStart: milestone.dayStart,
      dependencyKeys: milestone.dependencyKeys,
      drawAvailabilityCents: milestone.drawAvailabilityCents,
      durationDays: milestone.durationDays,
      evidenceState: milestone.evidenceState,
      icon: milestone.icon,
      key: milestone.key,
      lane: milestone.lane,
      markerLabel: milestone.markerLabel,
      name: milestone.name,
      order: milestone.order,
      organizationId: auth.proposal.organizationId,
      policyState: milestone.policyState,
      proposalId: auth.proposal._id,
      timelineStatus: milestone.timelineStatus,
      tone: milestone.tone,
      updatedAt: now,
    });
    milestoneIdByKey.set(milestone.key, milestoneId);
    for (const submilestone of milestone.submilestones) {
      await ctx.db.insert("proposalSubmilestones", {
        brokerageId: auth.brokerage._id,
        budgetCents: submilestone.budgetCents,
        createdAt: now,
        durationDays: submilestone.durationDays,
        key: submilestone.key,
        milestoneKey: milestone.key,
        name: submilestone.name,
        order: submilestone.order,
        organizationId: auth.proposal.organizationId,
        proposalId: auth.proposal._id,
        proposalMilestoneId: milestoneId,
        updatedAt: now,
      });
    }
  }
  for (const item of costItemsToRestore) {
    const proposalMilestoneId = milestoneIdByKey.get(item.milestoneKey);
    if (!proposalMilestoneId) {
      continue;
    }
    await ctx.db.insert("proposalCostItems", {
      brokerageId: auth.brokerage._id,
      budgetSubmilestoneKey: item.budgetSubmilestoneKey,
      budgetTreatment: item.budgetTreatment ?? "add",
      costCents: item.costCents,
      createdAt: now,
      createdByWorkosUserId: auth.subject,
      description: item.description,
      itemKey: item.itemKey,
      itemType: item.itemType,
      milestoneKey: item.milestoneKey,
      organizationId: auth.proposal.organizationId,
      proposalId: auth.proposal._id,
      proposalMilestoneId,
      quantity: item.quantity,
      relevantSubmilestoneKeys: item.relevantSubmilestoneKeys,
      supplier: item.supplier,
      title: item.title,
      updatedAt: now,
      updatedByWorkosUserId: auth.subject,
    });
  }
  for (const draw of snapshot.draws) {
    await ctx.db.insert("proposalDrawScheduleRows", {
      amountCents: draw.amountCents,
      brokerageId: auth.brokerage._id,
      createdAt: now,
      customDate: draw.customDate,
      drawKey: draw.drawKey,
      label: draw.label,
      milestoneKey: draw.milestoneKey,
      order: draw.order,
      organizationId: auth.proposal.organizationId,
      proposalId: auth.proposal._id,
      proposalMilestoneId: draw.milestoneKey
        ? milestoneIdByKey.get(draw.milestoneKey)
        : undefined,
      requestNote: draw.requestNote,
      requestReviewNote: draw.requestReviewNote,
      requestStatus: draw.requestStatus,
      requestedAt: draw.requestedAt,
      reviewedAt: draw.reviewedAt,
      source: draw.source,
      timingDay: draw.timingDay,
      updatedAt: now,
    });
  }
  for (const event of snapshot.capitalEvents) {
    await ctx.db.insert("proposalCapitalEvents", {
      amountCents: event.amountCents,
      brokerageId: auth.brokerage._id,
      capitalEventKey: event.capitalEventKey,
      createdAt: now,
      eventKind: event.eventKind,
      label: event.label,
      order: event.order,
      organizationId: auth.proposal.organizationId,
      proposalId: auth.proposal._id,
      updatedAt: now,
      x: event.x,
    });
  }
  await ctx.db.patch(auth.proposal._id, {
    borrowerStartingCashCents: snapshot.proposal.borrowerStartingCashCents,
    // Dual-write until the legacy field is narrowed out after backfill.
    borrowerWorkingCapitalLimitCents:
      snapshot.proposal.borrowerStartingCashCents,
    lenderDrawPolicyLimitCents: snapshot.proposal.lenderDrawPolicyLimitCents,
    timelineCurrentDay: snapshot.proposal.timelineCurrentDay,
    timelineProgressValue: snapshot.proposal.timelineProgressValue,
    timelineRangeMax: snapshot.proposal.timelineRangeMax,
    timelineRangeMin: snapshot.proposal.timelineRangeMin,
    timelineRouteState: snapshot.proposal.timelineRouteState,
    timelineStartingCashCents: snapshot.proposal.timelineStartingCashCents,
    totalBudgetCents: snapshot.proposal.totalBudgetCents,
    updatedAt: now,
    updatedByWorkosUserId: auth.subject,
  });
  await upsertProposalKanbanCard(ctx, auth.proposal._id, now);
}

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

export async function listPresenceForRoom(ctx: QueryCtx, roomToken: string) {
  const rows = await presence.list(ctx, roomToken);
  const enriched = [];
  for (const row of rows) {
    enriched.push({
      ...row,
      name: await displayNameForWorkosUser(ctx, row.userId),
    });
  }
  return enriched;
}

export async function heartbeatPresence(
  ctx: MutationCtx,
  input: {
    interval: number;
    roomId: string;
    sessionId: string;
    userId: string;
    workosUserId: string;
  }
) {
  const sessionId = parseRoomSessionId(ctx, input.roomId);
  const session = await ctx.db.get(sessionId);
  if (!session || session.status !== "active") {
    throw new Error("Collaboration session is not active.");
  }
  await assertParticipantCanEditOrView(ctx, session, input.workosUserId);
  return await presence.heartbeat(
    ctx,
    input.roomId,
    input.workosUserId,
    input.sessionId,
    input.interval
  );
}

export async function updatePresenceData(
  ctx: MutationCtx,
  input: {
    cursor?: { x: number; y: number };
    roomId: string;
    workosUserId: string;
  }
) {
  const sessionId = parseRoomSessionId(ctx, input.roomId);
  const session = await ctx.db.get(sessionId);
  if (!session || session.status !== "active") {
    throw new Error("Collaboration session is not active.");
  }
  await assertParticipantCanEditOrView(ctx, session, input.workosUserId);
  await presence.updateRoomUser(ctx, input.roomId, input.workosUserId, {
    cursor: input.cursor,
    updatedAt: Date.now(),
  });
}

export async function disconnectPresence(
  ctx: MutationCtx,
  sessionToken: string
) {
  return await presence.disconnect(ctx, sessionToken);
}

export async function eligibleBuilderProfileForUser(
  ctx: QueryCtx | MutationCtx,
  input: {
    brokerageId: Id<"brokerages">;
    targetWorkosUserId: string;
    workosOrganizationId: string;
  }
) {
  const membership = await getActiveMembership(
    ctx,
    input.targetWorkosUserId,
    input.workosOrganizationId
  );
  const roles = normalizeRoleSlugs(membership.roleSlugs);
  if (!roles.includes("builder")) {
    throw new Error("Participant is not eligible for assign-to-builder.");
  }
  const links = await ctx.db
    .query("builderAccountLinks")
    .withIndex("by_user", (q) => q.eq("workosUserId", input.targetWorkosUserId))
    .collect();
  for (const link of links.filter((row) => row.status === "active")) {
    const profile = await ctx.db.get(link.builderProfileId);
    if (
      profile &&
      profile.status === "active" &&
      profile.brokerageId === input.brokerageId
    ) {
      return profile;
    }
  }
  throw new Error("Participant is not eligible for assign-to-builder.");
}

export async function displayNameForWorkosUser(
  ctx: QueryCtx | MutationCtx,
  workosUserId: string
) {
  const user = await ctx.db
    .query("users")
    .withIndex("by_workos_user_id", (q) => q.eq("workosUserId", workosUserId))
    .first();
  if (user?.name) {
    return titleCaseName(user.name.replace(/^user[_ ]/i, ""));
  }
  if (user?.email) {
    return titleCaseName(user.email.split("@")[0] ?? workosUserId);
  }
  return titleCaseName(workosUserId.replace(/^user_/, ""));
}

function titleCaseName(value: string) {
  return value
    .replaceAll("_", " ")
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join(" ");
}

async function canReadProposalForCollaboration(
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

async function assertParticipantCanEditOrView(
  ctx: QueryCtx | MutationCtx,
  session: Doc<"proposalCollaborationSessions">,
  workosUserId: string
) {
  const participant = await getParticipantForUser(
    ctx,
    session._id,
    workosUserId
  );
  if (!participant || participant.status === "revoked") {
    throw new Error("Forbidden: collaboration participant");
  }
}

function parseRoomSessionId(
  ctx: QueryCtx | MutationCtx,
  roomId: string
): Id<"proposalCollaborationSessions"> {
  const marker = ":session:";
  const rawSessionId = roomId.includes(marker)
    ? roomId.slice(roomId.lastIndexOf(marker) + marker.length)
    : "";
  const sessionId = ctx.db.normalizeId(
    "proposalCollaborationSessions",
    rawSessionId
  );
  if (!sessionId) {
    throw new Error("Invalid collaboration room.");
  }
  return sessionId;
}

async function deletePlanningRowsForRestore(
  ctx: MutationCtx,
  proposalId: Id<"buildProposals">
) {
  for (const table of [
    "proposalCapitalEvents",
    "proposalDrawScheduleRows",
    "proposalCostItems",
    "proposalSubmilestones",
    "proposalMilestones",
  ] as const) {
    const rows = await ctx.db
      .query(table)
      .withIndex("by_proposal", (q) => q.eq("proposalId", proposalId))
      .collect();
    for (const row of rows) {
      await ctx.db.delete(row._id);
    }
  }
}
