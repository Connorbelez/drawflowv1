/**
 * Production proposals proposal assignments bounded-context implementation.
 * The parent facade re-exports its handlers to preserve production_proposals function references.
 */
import { v } from "convex/values";
import { internal } from "../_generated/api";
import { authenticatedMutation, authenticatedQuery } from "../authz";
import { assertProposalLifecycleTransition } from "../production_proposal_lifecycle";
import { enqueueProposalApprovalRequiredNotifications, enqueueProposalWithdrawalNotifications } from "../lender_portal_notifications";
import { type Doc } from "../types";
import { authorizeProposal } from "./authorization_core.js";
import { getCurrentProposalLenderConfirmationCycle, createLenderAssignmentManifest } from "./confirmation_history_helpers.js";
import { requireBackofficeProposalWrite, requireAnyRole } from "./contractor_policy_helpers.js";
import { APPROVER_ROLES, proposalLenderOrganizationOptionValidator } from "./contracts_foundation.js";
import { ELIGIBLE_LENDER_ORGANIZATION_LIMIT } from "./contracts_workflow.js";
import { getCurrentProposalLenderAssignment, resolveAssignableLenderOrganization } from "./lender_assignment_auth.js";
import { upsertKanbanCard, writeProposalEvent } from "./proposal_copy_audit.js";
import { requireReason } from "./proposal_lender_approval.js";
import { requirePhase3BackofficeRole, ensureDefaultProposalReviewPolicyVersion, getCurrentProposalRevision, createImmutableProposalRevision } from "./review_lifecycle_helpers.js";

export const listEligibleExternalLenderOrganizations = authenticatedQuery
  .input({
    proposalId: v.id("buildProposals"),
    workosOrganizationId: v.string(),
  })
  .returns(
    v.object({
      organizations: v.array(proposalLenderOrganizationOptionValidator),
    }),
  )
  .handler(async (ctx, args) => {
    const auth = await authorizeProposal(
      ctx,
      args.proposalId,
      args.workosOrganizationId,
    );
    requireAnyRole(auth.roles, APPROVER_ROLES);
    if (auth.proposal.status !== "approved") {
      return { organizations: [] };
    }

    const activeOrganizations = await ctx.db
      .query("lenderOrganizations")
      .withIndex("by_status", (query) => query.eq("status", "active"))
      .take(ELIGIBLE_LENDER_ORGANIZATION_LIMIT + 1);
    const eligibleOrganizations = [];
    for (const organization of activeOrganizations) {
      const target = await resolveAssignableLenderOrganization(
        ctx,
        organization._id,
      );
      if (!target) {
        continue;
      }
      eligibleOrganizations.push({
        lenderOrganizationId: organization._id,
        lenderOrganizationName: organization.displayName,
      });
      if (eligibleOrganizations.length >= ELIGIBLE_LENDER_ORGANIZATION_LIMIT) {
        break;
      }
    }
    const sortedOrganizations = eligibleOrganizations;
    sortedOrganizations.sort((left, right) =>
      left.lenderOrganizationName.localeCompare(right.lenderOrganizationName),
    );
    return {
      organizations: sortedOrganizations.slice(
        0,
        ELIGIBLE_LENDER_ORGANIZATION_LIMIT,
      ),
    };
  })
  .public();

export const assignExternalLenderOrganization = authenticatedMutation
  .input({
    lenderOrganizationId: v.id("lenderOrganizations"),
    proposalId: v.id("buildProposals"),
    reason: v.string(),
    workosOrganizationId: v.string(),
  })
  .returns(
    v.object({
      assignmentId: v.id("proposalLenderAssignments"),
    }),
  )
  .handler(async (ctx, args) => {
    const auth = await authorizeProposal(
      ctx,
      args.proposalId,
      args.workosOrganizationId,
    );
    requireAnyRole(auth.roles, APPROVER_ROLES);
    if (auth.proposal.lockedReviewPolicyId || auth.proposal.status === "closed") {
      throw new Error("Lender assignment cannot change after policy lock or closing.");
    }
    assertProposalLifecycleTransition({
      command: "assign",
      reviewOutcome: auth.proposal.reviewOutcome,
      state: auth.proposal.status,
    });
    requireReason(args.reason);
    const currentAssignment = await getCurrentProposalLenderAssignment(
      ctx,
      args.proposalId,
    );
    if (currentAssignment) {
      throw new Error("A current lender assignment already exists.");
    }
    const archivingAssignments = await ctx.db
      .query("proposalLenderAssignments")
      .withIndex("by_proposal_status", (query) =>
        query.eq("proposalId", args.proposalId).eq("status", "archiving"),
      )
      .take(1);
    if (archivingAssignments.length > 0) {
      throw new Error("Wait for the prior lender assignment archive to seal before assigning another organization.");
    }
    const lenderOrganization = await resolveAssignableLenderOrganization(
      ctx,
      args.lenderOrganizationId,
    );
    if (!lenderOrganization) {
      throw new Error("Lender organization is unavailable for assignment.");
    }
    const assignedByRole = auth.roles.find((role) =>
      APPROVER_ROLES.includes(role as (typeof APPROVER_ROLES)[number]),
    );
    if (!assignedByRole) {
      throw new Error("Forbidden: proposal assignment authority");
    }
    const now = Date.now();
    const assignmentId = await ctx.db.insert("proposalLenderAssignments", {
      assignedAt: now,
      assignedByRole,
      assignedByWorkosUserId: auth.subject,
      brokerageId: auth.brokerage._id,
      createdAt: now,
      lenderBrokerageId: lenderOrganization.brokerageId,
      lenderOrganizationId: lenderOrganization.lenderOrganizationId,
      lenderOrganizationName: lenderOrganization.name,
      organizationId: args.workosOrganizationId,
      proposalId: args.proposalId,
      status: "current",
    });
    const assignedProposal = await ctx.db.get(args.proposalId);
    if (!assignedProposal) {
      throw new Error("Assigned proposal is unavailable.");
    }
    const policyVersion = await ensureDefaultProposalReviewPolicyVersion(ctx, {
      auth: { ...auth, proposal: assignedProposal },
      now,
    });
    const assignment = await ctx.db.get(assignmentId);
    if (!assignment) {
      throw new Error("Created lender assignment is unavailable.");
    }
    const revision = await createImmutableProposalRevision(ctx, {
      assignment,
      auth: { ...auth, proposal: assignedProposal },
      idempotencyKey: `system:lender-assignment:${assignmentId}`,
      policyVersion,
      reason: "Publish the revision for the assigned lender organization.",
    });
    const confirmationCycle = await ctx.db
      .query("proposalLenderConfirmationCycles")
      .withIndex("by_assignment_and_revision", (query) =>
        query
          .eq("assignmentId", assignment._id)
          .eq("proposalRevisionId", revision._id),
      )
      .unique();
    if (!confirmationCycle) {
      throw new Error("Created lender confirmation cycle is unavailable.");
    }
    await upsertKanbanCard(ctx, args.proposalId, now);
    await writeProposalEvent(ctx, {
      auth,
      command: "assignExternalLenderOrganization",
      eventType: "proposal.lender_assignment.created",
      newState: JSON.stringify({
        assignmentId,
        lenderOrganizationId: lenderOrganization.lenderOrganizationId,
        status: "current",
      }),
      priorState: JSON.stringify({ externalAssignment: "unassigned" }),
      proposalId: args.proposalId,
      reason: args.reason,
    });
    await enqueueProposalApprovalRequiredNotifications(ctx, {
      assignment,
      confirmationCycle,
      proposal: assignedProposal,
      revision,
    });
    return { assignmentId };
  })
  .public();

export const withdrawExternalLenderAssignment = authenticatedMutation
  .input({
    assignmentId: v.id("proposalLenderAssignments"),
    proposalId: v.id("buildProposals"),
    reason: v.string(),
    workosOrganizationId: v.string(),
  })
  .returns(v.null())
  .handler(async (ctx, args) => {
    const auth = await authorizeProposal(
      ctx,
      args.proposalId,
      args.workosOrganizationId,
    );
    requireAnyRole(auth.roles, APPROVER_ROLES);
    if (auth.proposal.lockedReviewPolicyId || auth.proposal.status === "closed") {
      throw new Error("Lender assignment cannot change after policy lock or closing.");
    }
    assertProposalLifecycleTransition({
      command: "withdraw",
      reviewOutcome: auth.proposal.reviewOutcome,
      state: auth.proposal.status,
    });
    requireReason(args.reason);
    const assignment = await ctx.db.get(args.assignmentId);
    if (
      !assignment ||
      assignment.proposalId !== args.proposalId ||
      assignment.brokerageId !== auth.brokerage._id ||
      assignment.organizationId !== args.workosOrganizationId
    ) {
      throw new Error("Forbidden: assignment scope");
    }
    if (assignment.status !== "current") {
      throw new Error("External lender assignment is already withdrawn.");
    }
    const [currentRevision, currentConfirmationCycle] = await Promise.all([
      getCurrentProposalRevision(ctx, auth.proposal),
      getCurrentProposalLenderConfirmationCycle(
        ctx,
        auth.proposal,
        assignment,
      ),
    ]);
    const now = Date.now();
    const withdrawnByRole = requirePhase3BackofficeRole(auth);
    const policyVersion = await ensureDefaultProposalReviewPolicyVersion(ctx, {
      auth,
      now,
    });
    const manifest = await createLenderAssignmentManifest(
      ctx,
      auth.proposal,
      assignment,
      now,
      policyVersion._id,
    );
    await ctx.db.patch(args.assignmentId, {
      archiveManifestId: manifest._id,
      status: "archiving",
      withdrawalReason: args.reason.trim(),
      withdrawnAt: now,
      withdrawnByRole,
      withdrawnByWorkosUserId: auth.subject,
    });
    await writeProposalEvent(ctx, {
      auth,
      command: "withdrawExternalLenderAssignment",
      eventType: "proposal.lender_assignment.withdrawn",
      newState: JSON.stringify({
        assignmentId: args.assignmentId,
        lenderOrganizationId: assignment.lenderOrganizationId,
        status: "archiving",
      }),
      priorState: JSON.stringify({
        assignmentId: args.assignmentId,
        status: "current",
      }),
      proposalId: args.proposalId,
      reason: args.reason,
    });
    await enqueueProposalWithdrawalNotifications(ctx, {
      assignment,
      confirmationCycle: currentConfirmationCycle,
      proposal: auth.proposal,
      revision: currentRevision,
    });
    await ctx.scheduler.runAfter(
      0,
      internal.production_proposals.sealLenderAssignmentManifestBatch,
      { manifestId: manifest._id },
    );
    await upsertKanbanCard(ctx, args.proposalId, now);
    return null;
  })
  .public();

const proposalLenderArchiveStatusValidator = v.object({
  assignmentId: v.id("proposalLenderAssignments"),
  attemptCount: v.number(),
  failedAt: v.union(v.number(), v.null()),
  failureReason: v.union(v.string(), v.null()),
  lastAttemptAt: v.union(v.number(), v.null()),
  manifestId: v.id("proposalLenderAssignmentManifests"),
  phase: v.union(
    v.literal("documents"),
    v.literal("revisions"),
    v.literal("decisions"),
    v.literal("complete"),
  ),
  status: v.union(
    v.literal("building"),
    v.literal("failed"),
    v.literal("sealed"),
  ),
});

function projectProposalLenderArchiveStatus(
  manifest: Doc<"proposalLenderAssignmentManifests">,
) {
  return {
    assignmentId: manifest.assignmentId,
    attemptCount: manifest.attemptCount ?? 0,
    failedAt: manifest.failedAt ?? null,
    failureReason: manifest.failureReason ?? null,
    lastAttemptAt: manifest.lastAttemptAt ?? null,
    manifestId: manifest._id,
    phase: manifest.phase,
    status: manifest.status,
  };
}

export const getProposalLenderArchiveStatus = authenticatedQuery
  .input({
    assignmentId: v.id("proposalLenderAssignments"),
    proposalId: v.id("buildProposals"),
    workosOrganizationId: v.string(),
  })
  .returns(proposalLenderArchiveStatusValidator)
  .handler(async (ctx, args) => {
    const auth = await authorizeProposal(
      ctx,
      args.proposalId,
      args.workosOrganizationId,
    );
    requireAnyRole(auth.roles, APPROVER_ROLES);
    const assignment = await ctx.db.get(args.assignmentId);
    if (
      !assignment ||
      assignment.proposalId !== auth.proposal._id ||
      assignment.brokerageId !== auth.brokerage._id ||
      assignment.organizationId !== args.workosOrganizationId
    ) {
      throw new Error("Forbidden: lender assignment archive scope");
    }
    const manifest = await ctx.db
      .query("proposalLenderAssignmentManifests")
      .withIndex("by_assignment", (query) =>
        query.eq("assignmentId", assignment._id),
      )
      .unique();
    if (!manifest) {
      throw new Error("Lender assignment archive is unavailable.");
    }
    return projectProposalLenderArchiveStatus(manifest);
  })
  .public();

export const retryProposalLenderArchive = authenticatedMutation
  .input({
    assignmentId: v.id("proposalLenderAssignments"),
    proposalId: v.id("buildProposals"),
    reason: v.string(),
    workosOrganizationId: v.string(),
  })
  .returns(proposalLenderArchiveStatusValidator)
  .handler(async (ctx, args) => {
    const auth = await authorizeProposal(
      ctx,
      args.proposalId,
      args.workosOrganizationId,
    );
    requireAnyRole(auth.roles, APPROVER_ROLES);
    requireBackofficeProposalWrite(auth, auth.proposal);
    requireReason(args.reason);
    const assignment = await ctx.db.get(args.assignmentId);
    if (
      !assignment ||
      assignment.proposalId !== auth.proposal._id ||
      assignment.brokerageId !== auth.brokerage._id ||
      assignment.organizationId !== args.workosOrganizationId
    ) {
      throw new Error("Forbidden: lender assignment archive scope");
    }
    const manifest = await ctx.db
      .query("proposalLenderAssignmentManifests")
      .withIndex("by_assignment", (query) =>
        query.eq("assignmentId", assignment._id),
      )
      .unique();
    if (!manifest) {
      throw new Error("Lender assignment archive is unavailable.");
    }
    if (manifest.status === "sealed") {
      return projectProposalLenderArchiveStatus(manifest);
    }
    if (assignment.status !== "archiving") {
      throw new Error("Lender assignment is not awaiting archive recovery.");
    }
    if (auth.proposal.lockedReviewPolicyId || auth.proposal.status === "closed") {
      throw new Error("Lender assignment archive cannot resume after lock or closing.");
    }
    const now = Date.now();
    const policyVersion = await ensureDefaultProposalReviewPolicyVersion(ctx, {
      auth,
      now,
    });
    await ctx.db.patch(manifest._id, {
      cursor: null,
      failedAt: undefined,
      failureReason: undefined,
      lastAttemptAt: now,
      lastRetryReason: args.reason.trim(),
      lastRetryRequestedAt: now,
      lastRetryRequestedByWorkosUserId: auth.subject,
      reviewPolicyVersionId: policyVersion._id,
      status: "building",
    });
    await ctx.scheduler.runAfter(
      0,
      internal.production_proposals.sealLenderAssignmentManifestBatch,
      { manifestId: manifest._id },
    );
    await writeProposalEvent(ctx, {
      auth,
      command: "retryProposalLenderArchive",
      eventType: "proposal.lender_assignment.archive_retry_requested",
      newState: JSON.stringify({
        assignmentId: assignment._id,
        manifestId: manifest._id,
        status: "building",
      }),
      priorState: JSON.stringify({
        attemptCount: manifest.attemptCount ?? 0,
        status: manifest.status,
      }),
      proposalId: args.proposalId,
      reason: args.reason,
    });
    const updated = await ctx.db.get(manifest._id);
    if (!updated) {
      throw new Error("Retried lender assignment archive is unavailable.");
    }
    return projectProposalLenderArchiveStatus(updated);
  })
  .public();
