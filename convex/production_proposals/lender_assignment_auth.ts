/**
 * Production proposals lender assignment auth bounded-context implementation.
 * The parent facade re-exports its handlers to preserve production_proposals function references.
 */
import { type AuthorizedViewer, type ActiveLenderOrganizationContext, normalizeRoleSlugs, requireLenderOrganizationPermission, resolveActiveLenderOrganizationContext, type RoleSlug } from "../authz";
import { listActiveApprovalEligibleLenderOrganizationMembers, resolveLenderOrganizationTarget } from "../lenderOrganizationAccess";
import { FAIRLEND_WORKOS_ORGANIZATION_ID } from "../fairLendConfig";
import { LENDER_PROPOSAL_DECISION_ROLES } from "../lender_portal_phase4";
import { type Doc, type Id, type MutationCtx, type QueryCtx } from "../types";
import { authorizeProposal } from "./authorization_core.js";
import { getCurrentProposalLenderConfirmationCycle } from "./confirmation_history_helpers.js";
import { getCurrentProposalRevision } from "./review_lifecycle_helpers.js";

export async function getCurrentProposalLenderAssignment(
  ctx: QueryCtx | MutationCtx,
  proposalId: Id<"buildProposals">,
) {
  const assignments = await ctx.db
    .query("proposalLenderAssignments")
    .withIndex("by_proposal_status", (query) =>
      query.eq("proposalId", proposalId).eq("status", "current"),
    )
    .take(2);
  if (assignments.length > 1) {
    throw new Error("Proposal has multiple current lender assignments.");
  }
  return assignments[0] ?? null;
}

export async function assertNoArchivingProposalLenderAssignment(
  ctx: QueryCtx | MutationCtx,
  proposalId: Id<"buildProposals">,
) {
  const archiving = await ctx.db
    .query("proposalLenderAssignments")
    .withIndex("by_proposal_status", (query) =>
      query.eq("proposalId", proposalId).eq("status", "archiving"),
    )
    .first();
  if (archiving) {
    throw new Error(
      "The lender assignment archive is still sealing; retry this lifecycle command after archival completes.",
    );
  }
}

export async function requireLenderVisibleAssignment(
  ctx: QueryCtx & { activeOrganization: ActiveLenderOrganizationContext },
  proposalId: Id<"buildProposals">,
  assignmentId: Id<"proposalLenderAssignments">,
) {
  const assignment = await ctx.db.get(assignmentId);
  if (
    !assignment ||
    assignment.proposalId !== proposalId ||
    assignment.lenderOrganizationId !== ctx.activeOrganization.lenderOrganizationId ||
    assignment.lenderBrokerageId !== ctx.activeOrganization.brokerageId
  ) {
    throw new Error("Forbidden: lender proposal assignment");
  }
  if (assignment.status === "archiving") {
    throw new Error("Lender assignment archive is still sealing.");
  }
  return assignment;
}

type ProposalLifecycleActorAuth = {
  brokerage: Doc<"brokerages">;
  currentLenderAssignment: Doc<"proposalLenderAssignments"> | null;
  lenderOrganization?: ActiveLenderOrganizationContext;
  isCurrentLenderActor: boolean;
  organizationId: string;
  proposal: Doc<"buildProposals">;
  roles: RoleSlug[];
  subject: string;
};

export async function authorizeProposalLifecycleActor(
  ctx: (QueryCtx | MutationCtx) & { viewer: AuthorizedViewer },
  proposalId: Id<"buildProposals">,
  workosOrganizationId: string,
  lenderPermission?: "proposal_review",
): Promise<ProposalLifecycleActorAuth> {
  const proposal = await ctx.db.get(proposalId);
  if (!proposal) {
    throw new Error("Forbidden: proposal scope");
  }

  if (workosOrganizationId === proposal.organizationId) {
    const auth = await authorizeProposal(
      ctx,
      proposalId,
      workosOrganizationId,
    );
    return {
      ...auth,
      currentLenderAssignment: await getCurrentProposalLenderAssignment(
        ctx,
        proposalId,
      ),
      isCurrentLenderActor: false,
      organizationId: proposal.organizationId,
    };
  }

  return authorizeLenderProposalLifecycleActor(
    ctx,
    proposalId,
    workosOrganizationId,
    lenderPermission,
    proposal,
  );
}

export async function authorizeLenderProposalLifecycleActor(
  ctx: (QueryCtx | MutationCtx) & { viewer: AuthorizedViewer },
  proposalId: Id<"buildProposals">,
  workosOrganizationId: string,
  lenderPermission?: "proposal_review",
  knownProposal?: Doc<"buildProposals">,
): Promise<ProposalLifecycleActorAuth> {
  const proposal = knownProposal ?? (await ctx.db.get(proposalId));
  if (!proposal) {
    throw new Error("Forbidden: proposal scope");
  }

  const identity = await ctx.auth.getUserIdentity();
  if (!identity) {
    throw new Error("Unauthorized");
  }
  const authorization = await resolveActiveLenderOrganizationContext(
    ctx,
    identity,
    "lenderOrganization",
  );
  if (lenderPermission) {
    await requireLenderOrganizationPermission(
      ctx,
      authorization.activeOrganization,
      lenderPermission,
    );
  }
  if (workosOrganizationId !== FAIRLEND_WORKOS_ORGANIZATION_ID) {
    throw new Error("Forbidden: active lender organization");
  }
  const currentLenderAssignment = await getCurrentProposalLenderAssignment(
    ctx,
    proposalId,
  );
  if (
    !currentLenderAssignment ||
    currentLenderAssignment.lenderOrganizationId !==
      authorization.activeOrganization.lenderOrganizationId ||
    currentLenderAssignment.lenderBrokerageId !==
      authorization.activeOrganization.brokerageId ||
    currentLenderAssignment.brokerageId !== proposal.brokerageId ||
    currentLenderAssignment.organizationId !== proposal.organizationId
  ) {
    throw new Error("Forbidden: current lender assignment");
  }
  const brokerage = await ctx.db.get(proposal.brokerageId);
  if (!brokerage || brokerage.status !== "active") {
    throw new Error("Forbidden: proposal brokerage");
  }
  return {
    brokerage,
    currentLenderAssignment,
    lenderOrganization: authorization.activeOrganization,
    isCurrentLenderActor: true,
    organizationId: proposal.organizationId,
    proposal,
    roles: normalizeRoleSlugs(authorization.viewer.roles),
    subject: authorization.viewer.subject,
  };
}

export async function getCurrentProposalLenderApproval(
  ctx: QueryCtx | MutationCtx,
  proposalId: Id<"buildProposals">,
  assignmentId: Id<"proposalLenderAssignments">,
  proposalRevisionId: Id<"proposalRevisions">,
) {
  const proposal = await ctx.db.get(proposalId);
  if (proposal?.latestLenderApprovalId) {
    const pointed = await ctx.db.get(proposal.latestLenderApprovalId);
    if (
      pointed?.proposalId === proposalId &&
      pointed.assignmentId === assignmentId &&
      pointed.proposalRevisionId === proposalRevisionId &&
      pointed.status === "approved"
    ) {
      return pointed;
    }
  }
  const approvals = await ctx.db
    .query("proposalLenderApprovals")
    .withIndex("by_proposal_assignment_status", (query) =>
      query
        .eq("proposalId", proposalId)
        .eq("assignmentId", assignmentId)
        .eq("status", "approved"),
    )
    .filter((query) => query.eq(query.field("proposalRevisionId"), proposalRevisionId))
    .take(2);
  if (approvals.length > 1) {
    throw new Error("Proposal has multiple current lender approvals.");
  }
  return approvals[0] ?? null;
}

export async function getLenderApprovalForCurrentProposalRevision(
  ctx: QueryCtx | MutationCtx,
  proposal: Doc<"buildProposals">,
  assignment: Doc<"proposalLenderAssignments">,
) {
  const revision = await getCurrentProposalRevision(ctx, proposal);
  if (!revision || revision.assignmentId !== assignment._id) {
    return null;
  }
  const confirmationCycle = await getCurrentProposalLenderConfirmationCycle(
    ctx,
    proposal,
    assignment,
  );
  if (!confirmationCycle || confirmationCycle.status !== "approved") {
    return null;
  }
  const approval = await getCurrentProposalLenderApproval(
    ctx,
    proposal._id,
    assignment._id,
    revision._id,
  );
  return approval && confirmationCycle.decisionId === approval._id
    ? approval
    : null;
}

export async function isActiveEligibleLenderApproval(
  ctx: QueryCtx | MutationCtx,
  approval: Doc<"proposalLenderApprovals">,
  assignment: Doc<"proposalLenderAssignments">,
) {
  if (
    !LENDER_PROPOSAL_DECISION_ROLES.includes(
      approval.approverRole as (typeof LENDER_PROPOSAL_DECISION_ROLES)[number],
    )
  ) {
    return false;
  }
  const lenderOrganization = await resolvePolicyLenderOrganization(
    ctx,
    assignment,
    "policy lock",
  );
  const approvalOrganizationId = ctx.db.normalizeId(
    "lenderOrganizations",
    String(approval.lenderOrganizationId),
  );
  if (
    approvalOrganizationId
      ? approvalOrganizationId !== lenderOrganization._id
      : approval.lenderOrganizationId !== assignment.lenderOrganizationId &&
        approval.legacyLenderOrganizationId !==
          String(assignment.lenderOrganizationId)
  ) {
    return false;
  }
  const eligibleMembers =
    await listActiveApprovalEligibleLenderOrganizationMembers(
      ctx,
      lenderOrganization._id,
      "proposal_review",
    );
  return eligibleMembers.some(
    (member) => member.workosUserId === approval.approverWorkosUserId,
  );
}

export async function evaluateProposalClosingEligibility(
  ctx: QueryCtx | MutationCtx,
  proposal: Doc<"buildProposals">,
  currentLenderAssignment: Doc<"proposalLenderAssignments"> | null,
) {
  const reasons: string[] = [];
  if (proposal.status !== "approved") {
    reasons.push("Proposal must be approved before closing.");
  }
  if (proposal.reviewOutcome !== "approved") {
    reasons.push("Current Back Office approval is required before closing.");
  }
  if (!proposal.workflowRuleSnapshotId) {
    reasons.push("Approved proposal is missing workflow rule snapshot.");
  }
  if (!proposal.builderProfileId) {
    reasons.push("Closing requires an assigned builder.");
  }
  const currentRevision = await getCurrentProposalRevision(ctx, proposal);
  if (!currentRevision) {
    reasons.push("A current immutable proposal revision is required before closing.");
  }
  const policyLock = proposal.lockedReviewPolicyId
    ? await ctx.db.get(proposal.lockedReviewPolicyId)
    : null;
  if (
    !policyLock ||
    policyLock.proposalId !== proposal._id ||
    policyLock.organizationId !== proposal.organizationId ||
    policyLock.brokerageId !== proposal.brokerageId
  ) {
    reasons.push("An immutable review policy lock is required before closing.");
  } else if (
    !currentRevision ||
    policyLock.proposalRevisionId !== currentRevision._id ||
    policyLock.policyVersionId !== proposal.currentReviewPolicyVersionId
  ) {
    reasons.push("Review policy lock does not match the current proposal revision.");
  }

  const withdrawnAssignments = currentLenderAssignment
    ? []
    : await ctx.db
        .query("proposalLenderAssignments")
        .withIndex("by_proposal_status", (query) =>
          query.eq("proposalId", proposal._id).eq("status", "withdrawn"),
        )
        .take(1);
  const requiresLenderAssignment =
    (proposal.capitalSource ?? "internal") === "external" &&
    !currentLenderAssignment &&
    withdrawnAssignments.length === 0;
  if (requiresLenderAssignment) {
    reasons.push(
      "External-capital proposals require a current lender assignment before closing.",
    );
  }

  let lenderApproval: Doc<"proposalLenderApprovals"> | null = null;
  if (currentLenderAssignment) {
    if (
      !currentRevision ||
      currentRevision.assignmentId !== currentLenderAssignment._id
    ) {
      reasons.push("Current proposal revision does not match the lender assignment.");
    } else {
      lenderApproval = await getLenderApprovalForCurrentProposalRevision(
        ctx,
        proposal,
        currentLenderAssignment,
      );
    }
    if (
      !lenderApproval ||
      !(await isActiveEligibleLenderApproval(
        ctx,
        lenderApproval,
        currentLenderAssignment,
      ))
    ) {
      reasons.push("One eligible active lender approval is required before closing.");
    }
  }

  return {
    currentRevision,
    eligible: reasons.length === 0,
    lenderApproval,
    policyLock,
    reasons,
  };
}

export async function resolveAssignableLenderOrganization(
  ctx: QueryCtx | MutationCtx,
  lenderOrganizationId: Id<"lenderOrganizations">,
) {
  const { brokerage: lenderBrokerage, organization } =
    await resolveLenderOrganizationTarget(ctx, lenderOrganizationId);
  if (organization.status !== "active") {
    return null;
  }
  return {
    brokerageId: lenderBrokerage._id,
    lenderOrganizationId,
    name: organization.displayName,
  };
}

export async function resolvePolicyLenderOrganization(
  ctx: QueryCtx | MutationCtx,
  assignment: Doc<"proposalLenderAssignments">,
  operation: "policy configuration" | "policy lock",
) {
  const normalizedId = ctx.db.normalizeId(
    "lenderOrganizations",
    String(assignment.lenderOrganizationId),
  );
  let candidates: Doc<"lenderOrganizations">[] = [];
  if (normalizedId) {
    const organization = await ctx.db.get(normalizedId);
    if (organization) candidates = [organization];
  } else {
    candidates = await ctx.db
      .query("lenderOrganizations")
      .withIndex("by_brokerage_and_legacy_workos_organization", (query) =>
        query
          .eq("brokerageId", assignment.lenderBrokerageId)
          .eq(
            "legacyWorkosOrganizationId",
            String(assignment.lenderOrganizationId),
          ),
      )
      .take(2);
  }
  if (
    candidates.length !== 1 ||
    candidates[0]?.status !== "active" ||
    candidates[0].brokerageId !== assignment.lenderBrokerageId
  ) {
    throw new Error(
      `Assigned lender organization requires the legacy organization cutover before ${operation}.`,
    );
  }
  return candidates[0];
}

export function projectProposalLenderAssignment(
  assignment: Doc<"proposalLenderAssignments">,
) {
  return {
    assignmentId: assignment._id,
    assignedAt: assignment.assignedAt,
    assignedByRole: assignment.assignedByRole,
    assignedByWorkosUserId: assignment.assignedByWorkosUserId,
    lenderBrokerageId: assignment.lenderBrokerageId,
    lenderOrganizationId: assignment.lenderOrganizationId,
    lenderOrganizationName: assignment.lenderOrganizationName,
    status: assignment.status,
    ...(assignment.withdrawalReason === undefined
      ? {}
      : { withdrawalReason: assignment.withdrawalReason }),
    ...(assignment.withdrawnAt === undefined
      ? {}
      : { withdrawnAt: assignment.withdrawnAt }),
    ...(assignment.withdrawnByWorkosUserId === undefined
      ? {}
      : { withdrawnByWorkosUserId: assignment.withdrawnByWorkosUserId }),
  };
}

export function projectLenderVisibleProposalAssignment(
  assignment: Doc<"proposalLenderAssignments">,
) {
  const projection = projectProposalLenderAssignment(assignment);
  const {
    withdrawalReason: _withdrawalReason,
    withdrawnByWorkosUserId: _withdrawnByWorkosUserId,
    ...visibleProjection
  } = projection;
  return visibleProjection;
}

export function projectProposalLenderApproval(
  approval: Doc<"proposalLenderApprovals">,
) {
  return {
    approvalId: approval._id,
    ...(approval.status === "approved"
      ? { approvedAt: approval.approvedAt }
      : { declinedAt: approval.declinedAt }),
    ...(approval.proposalRevisionId
      ? { proposalRevisionId: approval.proposalRevisionId }
      : {}),
    ...(approval.proposalRevisionNumber === undefined
      ? {}
      : { proposalRevisionNumber: approval.proposalRevisionNumber }),
    status: approval.status,
  };
}
