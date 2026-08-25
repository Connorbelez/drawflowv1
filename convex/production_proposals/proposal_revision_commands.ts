/**
 * Production proposals proposal revision commands bounded-context implementation.
 * The parent facade re-exports its handlers to preserve production_proposals function references.
 */
import { v } from "convex/values";
import { authenticatedMutation } from "../authz";
import { getLenderOrganizationApprovalEligibility } from "../lenderOrganizationAccess";
import { normalizeOperationalIdempotencyKey } from "../build_operational_idempotency";
import { proposalReviewPoliciesEqual, validateProposalReviewPolicyQuorums } from "../lender_portal_phase3";
import { enqueueProposalUpdatedAfterDeclineNotifications } from "../lender_portal_notifications";
import { type Id } from "../types";
import { authorizeProposal } from "./authorization_core.js";
import { getCurrentProposalLenderConfirmationCycle } from "./confirmation_history_helpers.js";
import { requireBackofficeProposalWrite, requireAnyRole } from "./contractor_policy_helpers.js";
import { APPROVER_ROLES } from "./contracts_foundation.js";
import { getCurrentProposalLenderAssignment, assertNoArchivingProposalLenderAssignment, getCurrentProposalLenderApproval, isActiveEligibleLenderApproval, resolvePolicyLenderOrganization } from "./lender_assignment_auth.js";
import { writeProposalEvent } from "./proposal_copy_audit.js";
import { requireReason } from "./proposal_lender_approval.js";
import { requireState, requirePhase3BackofficeRole, assertExpectedProposalReviewBase, getCurrentProposalReviewPolicyVersion, getCurrentProposalRevision, createImmutableProposalRevision } from "./review_lifecycle_helpers.js";

export const publishProposalRevision = authenticatedMutation
  .input({
    expectedAssignmentId: v.union(
      v.id("proposalLenderAssignments"),
      v.null(),
    ),
    expectedProposalRevisionNumber: v.union(v.number(), v.null()),
    idempotencyKey: v.string(),
    proposalId: v.id("buildProposals"),
    reason: v.string(),
    workosOrganizationId: v.string(),
  })
  .returns(
    v.object({
      changedCheckpoints: v.array(
        v.union(
          v.literal("milestoneCount"),
          v.literal("budget"),
          v.literal("scheduleTimeline"),
          v.literal("builder"),
          v.literal("accessReviewPolicy"),
        ),
      ),
      revisionId: v.id("proposalRevisions"),
      revisionNumber: v.number(),
    }),
  )
  .handler(async (ctx, args) => {
    const auth = await authorizeProposal(
      ctx,
      args.proposalId,
      args.workosOrganizationId,
    );
    requireAnyRole(auth.roles, APPROVER_ROLES);
    requireBackofficeProposalWrite(auth, auth.proposal);
    await assertNoArchivingProposalLenderAssignment(ctx, args.proposalId);
    const idempotencyKey = normalizeOperationalIdempotencyKey(
      args.idempotencyKey,
      "Proposal revision idempotency key",
    );
    const idempotentRevision = await ctx.db
      .query("proposalRevisions")
      .withIndex("by_proposal_and_idempotency_key", (query) =>
        query
          .eq("proposalId", args.proposalId)
          .eq("idempotencyKey", idempotencyKey),
      )
      .unique();
    if (idempotentRevision) {
      if (
        idempotentRevision.createdByWorkosUserId !== auth.subject ||
        idempotentRevision.reason !== args.reason.trim()
      ) {
        throw new Error("Proposal revision idempotency key was reused with different values.");
      }
      return {
        changedCheckpoints: idempotentRevision.changedCheckpoints,
        revisionId: idempotentRevision._id,
        revisionNumber: idempotentRevision.revisionNumber,
      };
    }
    if (auth.proposal.lockedReviewPolicyId || auth.proposal.status === "closed") {
      throw new Error("Proposal revisions cannot be published after policy lock or closing.");
    }
    const policyVersion = await getCurrentProposalReviewPolicyVersion(
      ctx,
      auth.proposal,
    );
    if (!policyVersion) {
      throw new Error("Configure the proposal review policy before publishing a revision.");
    }
    const assignment = await getCurrentProposalLenderAssignment(
      ctx,
      args.proposalId,
    );
    const priorConfirmationCycle = assignment
      ? await getCurrentProposalLenderConfirmationCycle(
          ctx,
          auth.proposal,
          assignment,
        )
      : null;
    assertExpectedProposalReviewBase({
      assignment,
      expectedAssignmentId: args.expectedAssignmentId,
      expectedProposalRevisionNumber: args.expectedProposalRevisionNumber,
      proposal: auth.proposal,
    });
    const revision = await createImmutableProposalRevision(ctx, {
      assignment,
      auth,
      idempotencyKey,
      policyVersion,
      reason: args.reason,
    });
    await writeProposalEvent(ctx, {
      auth,
      command: "publishProposalRevision",
      eventType: "proposal.revision.published",
      newState: JSON.stringify({
        changedCheckpoints: revision.changedCheckpoints,
        revisionId: revision._id,
        revisionNumber: revision.revisionNumber,
      }),
      proposalId: args.proposalId,
      reason: args.reason,
    });
    if (assignment && priorConfirmationCycle?.status === "declined") {
      const confirmationCycle = await ctx.db
        .query("proposalLenderConfirmationCycles")
        .withIndex("by_assignment_and_revision", (query) =>
          query
            .eq("assignmentId", assignment._id)
            .eq("proposalRevisionId", revision._id),
        )
        .unique();
      if (!confirmationCycle) {
        throw new Error("Published lender confirmation cycle is unavailable.");
      }
      await enqueueProposalUpdatedAfterDeclineNotifications(ctx, {
        assignment,
        confirmationCycle,
        proposal: auth.proposal,
        revision,
      });
    }
    return {
      changedCheckpoints: revision.changedCheckpoints,
      revisionId: revision._id,
      revisionNumber: revision.revisionNumber,
    };
  })
  .public();

export const lockProposalReviewPolicy = authenticatedMutation
  .input({
    expectedAssignmentId: v.union(
      v.id("proposalLenderAssignments"),
      v.null(),
    ),
    expectedProposalRevisionNumber: v.union(v.number(), v.null()),
    idempotencyKey: v.string(),
    proposalId: v.id("buildProposals"),
    reason: v.string(),
    workosOrganizationId: v.string(),
  })
  .returns(
    v.object({
      activeLenderMemberCount: v.number(),
      policyLockId: v.id("proposalReviewPolicyLocks"),
    }),
  )
  .handler(async (ctx, args) => {
    const auth = await authorizeProposal(
      ctx,
      args.proposalId,
      args.workosOrganizationId,
    );
    requireAnyRole(auth.roles, APPROVER_ROLES);
    requireBackofficeProposalWrite(auth, auth.proposal);
    requireReason(args.reason);
    await assertNoArchivingProposalLenderAssignment(ctx, args.proposalId);
    const idempotencyKey = normalizeOperationalIdempotencyKey(
      args.idempotencyKey,
      "Review policy lock idempotency key",
    );
    const idempotentLock = await ctx.db
      .query("proposalReviewPolicyLocks")
      .withIndex("by_proposal_and_idempotency_key", (query) =>
        query
          .eq("proposalId", args.proposalId)
          .eq("idempotencyKey", idempotencyKey),
      )
      .unique();
    if (idempotentLock) {
      if (
        idempotentLock.lockedByWorkosUserId !== auth.subject ||
        idempotentLock.reason !== args.reason.trim()
      ) {
        throw new Error("Review policy lock idempotency key was reused with different values.");
      }
      return {
        activeLenderMemberCount: idempotentLock.activeLenderMemberCount,
        policyLockId: idempotentLock._id,
      };
    }
    const existingLocks = await ctx.db
      .query("proposalReviewPolicyLocks")
      .withIndex("by_proposal", (query) => query.eq("proposalId", args.proposalId))
      .take(2);
    if (existingLocks.length > 0 || auth.proposal.lockedReviewPolicyId) {
      throw new Error("Proposal review policy is already locked.");
    }
    requireState(auth.proposal, "approved");
    const [policyVersion, revision, assignment] = await Promise.all([
      getCurrentProposalReviewPolicyVersion(ctx, auth.proposal),
      getCurrentProposalRevision(ctx, auth.proposal),
      getCurrentProposalLenderAssignment(ctx, args.proposalId),
    ]);
    assertExpectedProposalReviewBase({
      assignment,
      expectedAssignmentId: args.expectedAssignmentId,
      expectedProposalRevisionNumber: args.expectedProposalRevisionNumber,
      proposal: auth.proposal,
    });
    if (!policyVersion || !revision) {
      throw new Error("A current policy and proposal revision are required before lock.");
    }
    if (
      revision.reviewPolicyVersionId !== policyVersion._id ||
      !proposalReviewPoliciesEqual(
        revision.checkpoints.accessReviewPolicy,
        policyVersion.policy,
      )
    ) {
      throw new Error("Current proposal revision does not match the policy being locked.");
    }
    if (revision.assignmentId !== assignment?._id) {
      throw new Error("Current proposal revision does not match the lender assignment.");
    }
    let lenderOrganizationId: Id<"lenderOrganizations"> | undefined;
    let activeLenderMemberCount = 0;
    let eligibleLenderApproverCounts = { draw: 0, milestone: 0, proposalReview: 0 };
    if (assignment) {
      const lenderOrganization = await resolvePolicyLenderOrganization(
        ctx,
        assignment,
        "policy lock",
      );
      lenderOrganizationId = lenderOrganization._id;
      eligibleLenderApproverCounts =
        (await getLenderOrganizationApprovalEligibility(ctx, lenderOrganization._id)).counts;
      activeLenderMemberCount = eligibleLenderApproverCounts.proposalReview;
      const lenderApproval = await getCurrentProposalLenderApproval(
        ctx,
        args.proposalId,
        assignment._id,
        revision._id,
      );
      if (
        !lenderApproval ||
        !(await isActiveEligibleLenderApproval(ctx, lenderApproval, assignment))
      ) {
        throw new Error("Current lender-reviewed proposal revision is required before policy lock.");
      }
    }
    validateProposalReviewPolicyQuorums(
      policyVersion.policy,
      eligibleLenderApproverCounts,
    );
    const lockedByRole = requirePhase3BackofficeRole(auth);
    const now = Date.now();
    const policyLockId = await ctx.db.insert("proposalReviewPolicyLocks", {
      activeLenderMemberCount,
      eligibleLenderApproverCount: activeLenderMemberCount,
      eligibleLenderApproverCounts,
      ...(assignment ? { assignmentId: assignment._id } : {}),
      brokerageId: auth.brokerage._id,
      idempotencyKey,
      ...(lenderOrganizationId ? { lenderOrganizationId } : {}),
      lockedAt: now,
      lockedByRole,
      lockedByWorkosUserId: auth.subject,
      organizationId: auth.proposal.organizationId,
      policy: policyVersion.policy,
      policyVersionId: policyVersion._id,
      proposalId: args.proposalId,
      proposalRevisionId: revision._id,
      proposalRevisionNumber: revision.revisionNumber,
      reason: args.reason.trim(),
    });
    await ctx.db.patch(args.proposalId, {
      lockedReviewPolicyId: policyLockId,
      updatedAt: now,
      updatedByWorkosUserId: auth.subject,
    });
    await writeProposalEvent(ctx, {
      auth,
      command: "lockProposalReviewPolicy",
      eventType: "proposal.review_policy.locked",
      newState: JSON.stringify({
        activeLenderMemberCount,
        policyLockId,
        policyVersionId: policyVersion._id,
        proposalRevisionId: revision._id,
      }),
      proposalId: args.proposalId,
      reason: args.reason,
    });
    return { activeLenderMemberCount, policyLockId };
  })
  .public();
