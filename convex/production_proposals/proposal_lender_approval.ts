/**
 * Production proposals proposal lender approval bounded-context implementation.
 * The parent facade re-exports its handlers to preserve production_proposals function references.
 */
import { type AuthorizedViewer, type RoleSlug } from "../authz";
import { assertProposalCollaborationEditAllowed } from "../proposal_collaboration_model";
import { type Doc, type Id, type MutationCtx, type QueryCtx } from "../types";
import { authorizeProposal, assignedBuilderProfileIdOrThrow, assertBuilderOwnership } from "./authorization_core.js";
import { type BuilderStaffPermissionAction, requireProposalAppPermission } from "./builder_staff_access.js";
import { requireBackofficeProposalWrite, requireAnyRole } from "./contractor_policy_helpers.js";
import { BACKOFFICE_ROLES } from "./contracts_foundation.js";
import { isBackoffice } from "./proposal_claim.js";
import { collectByIndex } from "./storage_helpers.js";

export function assertProposalLenderApprovalTimestamps(input: {
  approvedAt?: number;
  declinedAt?: number;
  status: "approved" | "declined";
}) {
  if (
    input.status === "approved" &&
    (input.approvedAt === undefined || input.declinedAt !== undefined)
  ) {
    throw new Error(
      "Approved lender decisions require approvedAt and cannot include declinedAt.",
    );
  }
  if (
    input.status === "declined" &&
    (input.declinedAt === undefined || input.approvedAt !== undefined)
  ) {
    throw new Error(
      "Declined lender decisions require declinedAt and cannot include approvedAt.",
    );
  }
}

export function requireReason(reason: string) {
  if (!reason.trim()) {
    throw new Error("A reason is required.");
  }
}

export function calculateDrawAvailability(
  budgetCents: number,
  borrowerCoPayBps: number,
) {
  return Math.round((budgetCents * (10_000 - borrowerCoPayBps)) / 10_000);
}

export function normalizeProposalApprovedAmountCents(input: {
  requestedApprovedAmountCents: number;
  totalDrawAmountCents: number;
}) {
  const requestedApprovedAmountCents = Math.max(
    0,
    Math.round(input.requestedApprovedAmountCents),
  );
  return Math.max(
    Math.max(0, Math.round(input.totalDrawAmountCents)),
    requestedApprovedAmountCents,
  );
}

export async function ensureProposalApprovedAmountCoversDrawSchedule(
  ctx: MutationCtx,
  proposal: Doc<"buildProposals">,
  input: { updatedAt: number; updatedByWorkosUserId: string },
) {
  const totalDrawAmountCents = await sumProposalDrawScheduleAmountCents(
    ctx,
    proposal._id,
  );
  const nextApprovedAmountCents = Math.max(
    proposal.lenderDrawPolicyLimitCents,
    totalDrawAmountCents,
  );

  if (nextApprovedAmountCents === proposal.lenderDrawPolicyLimitCents) {
    return;
  }

  await ctx.db.patch(proposal._id, {
    lenderDrawPolicyLimitCents: nextApprovedAmountCents,
    updatedAt: input.updatedAt,
    updatedByWorkosUserId: input.updatedByWorkosUserId,
  });
}

export async function sumProposalDrawScheduleAmountCents(
  ctx: QueryCtx | MutationCtx,
  proposalId: Id<"buildProposals">,
) {
  const draws = await collectByIndex(
    ctx,
    "proposalDrawScheduleRows",
    "by_proposal",
    proposalId,
  );
  return draws.reduce(
    (total: number, draw: Doc<"proposalDrawScheduleRows">) =>
      total + Math.max(0, Math.round(draw.amountCents)),
    0,
  );
}

export function firstActiveMilestoneForWorkspace(
  milestones: Doc<"proposalMilestones">[],
) {
  return milestones[0] ?? null;
}

export function productionTimelineStatusForMilestone(
  index: number,
  proposal: Doc<"buildProposals">,
  milestone?: Doc<"proposalMilestones">,
) {
  if (milestone?.timelineStatus === "complete" || milestone?.completionClaim) {
    return "complete" as const;
  }
  if (proposal.status === "closed") {
    return "complete" as const;
  }
  return index === 0 ? ("ready" as const) : ("upcoming" as const);
}

export function productionTimelineToneForMilestone(
  index: number,
  proposal: Doc<"buildProposals">,
  milestone?: Doc<"proposalMilestones">,
) {
  if (milestone?.tone) {
    return milestone.tone;
  }
  if (milestone?.timelineStatus === "complete" || milestone?.completionClaim) {
    return "complete" as const;
  }
  if (proposal.status === "closed") {
    return "complete" as const;
  }
  if (proposal.status === "submitted") {
    return index === 0 ? ("warning" as const) : ("upcoming" as const);
  }
  if (proposal.status === "approved") {
    return index === 0 ? ("active" as const) : ("upcoming" as const);
  }
  return index === 0 ? ("active" as const) : ("upcoming" as const);
}

export function productionCompletionClaimView(claim: any) {
  if (!claim) {
    return;
  }
  return {
    ...(typeof claim.actualCostCents === "number"
      ? { actualCost: centsToDollars(claim.actualCostCents) }
      : typeof claim.actualCost === "number"
        ? { actualCost: claim.actualCost }
        : {}),
    completedDay: claim.completedDay,
    ...(claim.note ? { note: claim.note } : {}),
    submittedAt: claim.submittedAt,
  };
}

export function productionCompletionReviewView(review: any) {
  if (!review) {
    return;
  }
  return {
    ...(review.note ? { note: review.note } : {}),
    reviewedAt: review.reviewedAt,
    ...(review.siteVisit ? { siteVisit: review.siteVisit } : {}),
    status: review.status,
  };
}

function centsToDollars(cents: number) {
  return Math.round(cents / 100);
}

export function productionPolicyState(
  proposal: Doc<"buildProposals">,
  permitWaiver: Doc<"documentWaivers"> | null,
) {
  if (proposal.reviewOutcome === "rejected") {
    return "Rejected by lender review";
  }
  if (proposal.reviewOutcome === "requested_changes") {
    return "Changes requested by lender review";
  }
  if (permitWaiver) {
    return "Permit waiver recorded";
  }
  if (proposal.status === "submitted") {
    return "Locked for lender review";
  }
  if (proposal.status === "approved" || proposal.status === "closed") {
    return "Approved reimbursement policy";
  }
  return "Draft proposal policy";
}

export function productionTimelinePermissions(auth: {
  proposal: Doc<"buildProposals">;
  roles: RoleSlug[];
  subject: string;
}) {
  const backoffice = isBackoffice(auth.roles);
  const draft = auth.proposal.status === "draft";
  const liveBuild = auth.proposal.status === "approved";
  const submitted = auth.proposal.status === "submitted";
  return {
    approveProposal: submitted && backoffice,
    closeProposal: auth.proposal.status === "approved" && backoffice,
    editDraftStructure: draft,
    editSubmittedDraws: submitted && backoffice,
    requestLiveModification: liveBuild && !backoffice,
    reviewDraws: liveBuild && backoffice,
    reviewMilestones: liveBuild && backoffice,
    submitDrawRequests: liveBuild && !backoffice,
    submitMilestoneCompletion: liveBuild && !backoffice,
    submitProposal: draft,
  };
}

export function iconForProductionMilestone(key: string, name?: string) {
  const normalized = `${key} ${name ?? ""}`.toLowerCase();
  if (normalized.includes("foundation") || normalized.includes("site")) {
    return "foundation";
  }
  if (normalized.includes("kitchen") || normalized.includes("cabinet")) {
    return "kitchen";
  }
  if (
    normalized.includes("plumb") ||
    normalized.includes("mechanical") ||
    normalized.includes("mep")
  ) {
    return "plumbing";
  }
  if (normalized.includes("roof") || normalized.includes("dry-in")) {
    return "roofing";
  }
  if (normalized.includes("shell") || normalized.includes("fram")) {
    return "framing";
  }
  if (normalized.includes("rough")) {
    return "roughIn";
  }
  if (normalized.includes("exterior")) {
    return "exterior";
  }
  if (normalized.includes("dry")) {
    return "drywall";
  }
  if (normalized.includes("finish") || normalized.includes("interior")) {
    return "finishes";
  }
  if (normalized.includes("close")) {
    return "closeout";
  }
  return "change";
}

export async function requireProductionTimelineEditable(
  ctx: QueryCtx | MutationCtx,
  auth: {
    proposal: Doc<"buildProposals">;
    roles: RoleSlug[];
    subject: string;
  },
) {
  if (auth.proposal.status === "draft") {
    await assertProposalCollaborationEditAllowed(ctx, auth);
    return;
  }
  if (auth.proposal.status === "approved") {
    await assertProposalCollaborationEditAllowed(ctx, auth);
    return;
  }
  if (auth.proposal.status === "submitted" && isBackoffice(auth.roles)) {
    requireBackofficeProposalWrite(auth, auth.proposal);
    await assertProposalCollaborationEditAllowed(ctx, auth);
    return;
  }
  throw new Error("Timeline is locked in this proposal state.");
}

export async function requireProductionProposalPreLiveCapitalWrite(
  ctx: QueryCtx | MutationCtx,
  auth: {
    proposal: Doc<"buildProposals">;
    roles: RoleSlug[];
    subject: string;
  },
) {
  if (auth.proposal.activeBuildId) {
    throw new Error(
      "Proposal capital terms are locked after the build goes live.",
    );
  }
  if (auth.proposal.status === "draft") {
    if (isBackoffice(auth.roles)) {
      requireBackofficeProposalWrite(auth, auth.proposal);
    } else {
      await assertBuilderOwnership(
        ctx,
        assignedBuilderProfileIdOrThrow(auth.proposal),
        auth.subject,
      );
    }
    await assertProposalCollaborationEditAllowed(ctx, auth);
    return;
  }
  if (
    (auth.proposal.status === "submitted" ||
      auth.proposal.status === "approved") &&
    isBackoffice(auth.roles)
  ) {
    requireBackofficeProposalWrite(auth, auth.proposal);
    await assertProposalCollaborationEditAllowed(ctx, auth);
    return;
  }
  throw new Error("Proposal capital terms are locked in this proposal state.");
}

export async function requireProductionTimelineDraftStructureWrite(
  ctx: QueryCtx | MutationCtx,
  auth: {
    proposal: Doc<"buildProposals">;
    roles: RoleSlug[];
    subject: string;
  },
) {
  if (auth.proposal.status === "closed") {
    throw new Error("Closed proposals cannot be edited.");
  }
  if (auth.proposal.status !== "draft") {
    if (!isBackoffice(auth.roles)) {
      throw new Error("Proposal structure is locked after submission.");
    }
    requireBackofficeProposalWrite(auth, auth.proposal);
    await assertProposalCollaborationEditAllowed(ctx, auth);
    return;
  }
  if (isBackoffice(auth.roles)) {
    requireBackofficeProposalWrite(auth, auth.proposal);
  }
  await assertProposalCollaborationEditAllowed(ctx, auth);
}

export async function authorizeProposalCostItemWrite(
  ctx: (QueryCtx | MutationCtx) & { viewer: AuthorizedViewer },
  proposalId: Id<"buildProposals">,
  workosOrganizationId: string,
  action: BuilderStaffPermissionAction,
  reason?: string,
) {
  const auth = await authorizeProposal(ctx, proposalId, workosOrganizationId);
  await requireProposalAppPermission(ctx, auth, "material", action);
  if (auth.proposal.status === "closed") {
    throw new Error("Closed proposals cannot be edited.");
  }
  if (auth.proposal.status === "draft") {
    if (isBackoffice(auth.roles)) {
      requireBackofficeProposalWrite(auth, auth.proposal);
    }
    await assertProposalCollaborationEditAllowed(ctx, auth);
    return auth;
  }
  requireAnyRole(auth.roles, BACKOFFICE_ROLES);
  requireBackofficeProposalWrite(auth, auth.proposal);
  requireReason(reason ?? "");
  await assertProposalCollaborationEditAllowed(ctx, auth);
  return auth;
}
