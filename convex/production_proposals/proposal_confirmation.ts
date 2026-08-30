/**
 * Production proposals proposal confirmation bounded-context implementation.
 * The parent facade re-exports its handlers to preserve production_proposals function references.
 */
import { paginationOptsValidator, paginationResultValidator } from "convex/server";
import { v } from "convex/values";
import { authenticatedMutation, authenticatedQuery, lenderRoleSlugs, resolveActiveLenderOrganizationContext } from "../authz";
import { normalizeOperationalIdempotencyKey } from "../build_operational_idempotency";
import { assertProposalLifecycleTransition, projectProposalLifecycle } from "../production_proposal_lifecycle";
import { backofficeProposalRemediationProjectionValidator, builderProposalConfirmationProjectionValidator, LENDER_PROPOSAL_DECISION_ROLES, lenderProposalConfirmationProjectionValidator, PROPOSAL_CONFIRMATION_CHECKPOINTS } from "../lender_portal_phase4";
import { enqueueProposalApprovalOutcomeNotifications } from "../lender_portal_notifications";
import { type Id } from "../types";
import { authorizeProposal } from "./authorization_core.js";
import { getCurrentProposalLenderConfirmationCycle, getProposalConfirmationDecision, projectProposalConfirmationCycle, paginateProposalConfirmationCycles } from "./confirmation_history_helpers.js";
import { requireAnyRole } from "./contractor_policy_helpers.js";
import { BACKOFFICE_ROLES, BUILDER_ROLES, proposalLenderAssignmentProjectionValidator } from "./contracts_foundation.js";
import { getCurrentProposalLenderAssignment, assertNoArchivingProposalLenderAssignment, authorizeProposalLifecycleActor, authorizeLenderProposalLifecycleActor, getLenderApprovalForCurrentProposalRevision, isActiveEligibleLenderApproval, projectProposalLenderAssignment, projectLenderVisibleProposalAssignment } from "./lender_assignment_auth.js";
import { isBackoffice } from "./proposal_claim.js";
import { upsertKanbanCard, writeProposalEvent } from "./proposal_copy_audit.js";
import { assertProposalLenderApprovalTimestamps, requireReason } from "./proposal_lender_approval.js";
import { getCurrentProposalRevision } from "./review_lifecycle_helpers.js";

export const acknowledgeProposalConfirmationCheckpoint = authenticatedMutation
  .input({
    checkpoint: v.union(
      v.literal("milestoneCount"),
      v.literal("budget"),
      v.literal("scheduleTimeline"),
      v.literal("builder"),
      v.literal("accessReviewPolicy"),
    ),
    expectedAssignmentId: v.id("proposalLenderAssignments"),
    expectedConfirmationCycleId: v.id("proposalLenderConfirmationCycles"),
    expectedProposalRevisionId: v.id("proposalRevisions"),
    idempotencyKey: v.string(),
    proposalId: v.id("buildProposals"),
    workosOrganizationId: v.string(),
  })
  .returns(
    v.object({
      acknowledgementId: v.id("proposalLenderConfirmationAcknowledgements"),
      sequence: v.number(),
    }),
  )
  .handler(async (ctx, args) => {
    const auth = await authorizeLenderProposalLifecycleActor(
      ctx,
      args.proposalId,
      args.workosOrganizationId,
    );
    await assertNoArchivingProposalLenderAssignment(ctx, args.proposalId);
    if (!auth.isCurrentLenderActor || !auth.currentLenderAssignment) {
      throw new Error("Forbidden: lender proposal confirmation");
    }
    assertProposalLifecycleTransition({
      command: "confirm",
      reviewOutcome: auth.proposal.reviewOutcome,
      state: auth.proposal.status,
    });
    const idempotencyKey = normalizeOperationalIdempotencyKey(
      args.idempotencyKey,
      "Proposal checkpoint acknowledgement idempotency key",
    );
    const currentRevision = await getCurrentProposalRevision(ctx, auth.proposal);
    const confirmationCycle = await getCurrentProposalLenderConfirmationCycle(
      ctx,
      auth.proposal,
      auth.currentLenderAssignment,
    );
    const idempotentAcknowledgement = await ctx.db
      .query("proposalLenderConfirmationAcknowledgements")
      .withIndex("by_cycle_and_idempotency_key", (query) =>
        query
          .eq("confirmationCycleId", args.expectedConfirmationCycleId)
          .eq("idempotencyKey", idempotencyKey),
      )
      .unique();
    if (idempotentAcknowledgement) {
      if (
        idempotentAcknowledgement.assignmentId !== args.expectedAssignmentId ||
        idempotentAcknowledgement.acknowledgedByWorkosUserId !== auth.subject ||
        idempotentAcknowledgement.checkpoint !== args.checkpoint ||
        idempotentAcknowledgement.proposalRevisionId !==
          args.expectedProposalRevisionId ||
        auth.currentLenderAssignment._id !== args.expectedAssignmentId ||
        currentRevision?._id !== args.expectedProposalRevisionId ||
        confirmationCycle?._id !== args.expectedConfirmationCycleId
      ) {
        throw new Error(
          "Proposal checkpoint acknowledgement idempotency key was reused with different values.",
        );
      }
      return {
        acknowledgementId: idempotentAcknowledgement._id,
        sequence: idempotentAcknowledgement.sequence,
      };
    }
    if (
      auth.currentLenderAssignment._id !== args.expectedAssignmentId ||
      !currentRevision ||
      currentRevision._id !== args.expectedProposalRevisionId ||
      !confirmationCycle ||
      confirmationCycle._id !== args.expectedConfirmationCycleId ||
      confirmationCycle.status !== "pending"
    ) {
      throw new Error("Stale or completed proposal confirmation cycle.");
    }
    const existingAcknowledgement = await ctx.db
      .query("proposalLenderConfirmationAcknowledgements")
      .withIndex("by_cycle_actor_checkpoint", (query) =>
        query
          .eq("confirmationCycleId", confirmationCycle._id)
          .eq("acknowledgedByWorkosUserId", auth.subject)
          .eq("checkpoint", args.checkpoint),
      )
      .unique();
    if (existingAcknowledgement) {
      return {
        acknowledgementId: existingAcknowledgement._id,
        sequence: existingAcknowledgement.sequence,
      };
    }
    const priorAcknowledgements = await ctx.db
      .query("proposalLenderConfirmationAcknowledgements")
      .withIndex("by_cycle_and_actor", (query) =>
        query
          .eq("confirmationCycleId", confirmationCycle._id)
          .eq("acknowledgedByWorkosUserId", auth.subject),
      )
      .collect();
    const acknowledgedByRole = auth.roles.find((role) =>
      lenderRoleSlugs.includes(role as (typeof lenderRoleSlugs)[number]),
    );
    if (!acknowledgedByRole) {
      throw new Error("Forbidden: lender proposal confirmation role");
    }
    const now = Date.now();
    const sequence = priorAcknowledgements.length + 1;
    const acknowledgementId = await ctx.db.insert(
      "proposalLenderConfirmationAcknowledgements",
      {
        acknowledgedAt: now,
        acknowledgedByRole,
        acknowledgedByWorkosUserId: auth.subject,
        assignmentId: auth.currentLenderAssignment._id,
        brokerageId: auth.brokerage._id,
        checkpoint: args.checkpoint,
        confirmationCycleId: confirmationCycle._id,
        idempotencyKey,
        organizationId: auth.organizationId,
        proposalId: args.proposalId,
        proposalRevisionId: currentRevision._id,
        sequence,
      },
    );
    await writeProposalEvent(ctx, {
      auth,
      command: "acknowledgeProposalConfirmationCheckpoint",
      eventType: "proposal.lender_confirmation.checkpoint_acknowledged",
      newState: JSON.stringify({
        acknowledgementId,
        checkpoint: args.checkpoint,
        confirmationCycleId: confirmationCycle._id,
        proposalRevisionId: currentRevision._id,
        sequence,
      }),
      proposalId: args.proposalId,
    });
    return { acknowledgementId, sequence };
  })
  .public();

export const declineExternalProposalForClosing = authenticatedMutation
  .input({
    declinedCheckpoint: v.union(
      v.literal("milestoneCount"),
      v.literal("budget"),
      v.literal("scheduleTimeline"),
      v.literal("builder"),
      v.literal("accessReviewPolicy"),
    ),
    expectedAssignmentId: v.id("proposalLenderAssignments"),
    expectedConfirmationCycleId: v.id("proposalLenderConfirmationCycles"),
    expectedProposalRevisionId: v.id("proposalRevisions"),
    idempotencyKey: v.string(),
    proposalId: v.id("buildProposals"),
    reason: v.string(),
    workosOrganizationId: v.string(),
  })
  .returns(v.object({ decisionId: v.id("proposalLenderApprovals") }))
  .handler(async (ctx, args) => {
    const auth = await authorizeLenderProposalLifecycleActor(
      ctx,
      args.proposalId,
      args.workosOrganizationId,
      "proposal_review",
    );
    await assertNoArchivingProposalLenderAssignment(ctx, args.proposalId);
    if (!auth.isCurrentLenderActor || !auth.currentLenderAssignment) {
      throw new Error("Forbidden: lender proposal decline");
    }
    assertProposalLifecycleTransition({
      command: "confirm",
      reviewOutcome: auth.proposal.reviewOutcome,
      state: auth.proposal.status,
    });
    requireReason(args.reason);
    const idempotencyKey = normalizeOperationalIdempotencyKey(
      args.idempotencyKey,
      "Proposal confirmation decision idempotency key",
    );
    const idempotentDecision = await ctx.db
      .query("proposalLenderApprovals")
      .withIndex("by_confirmation_cycle_and_idempotency_key", (query) =>
        query
          .eq("confirmationCycleId", args.expectedConfirmationCycleId)
          .eq("idempotencyKey", idempotencyKey),
      )
      .unique();
    if (idempotentDecision) {
      if (
        idempotentDecision.approverWorkosUserId !== auth.subject ||
        idempotentDecision.status !== "declined" ||
        idempotentDecision.declinedCheckpoint !== args.declinedCheckpoint ||
        idempotentDecision.reason !== args.reason.trim()
      ) {
        throw new Error(
          "Proposal confirmation decision idempotency key was reused with different values.",
        );
      }
      return { decisionId: idempotentDecision._id };
    }
    const currentRevision = await getCurrentProposalRevision(ctx, auth.proposal);
    const confirmationCycle = await getCurrentProposalLenderConfirmationCycle(
      ctx,
      auth.proposal,
      auth.currentLenderAssignment,
    );
    if (
      auth.currentLenderAssignment._id !== args.expectedAssignmentId ||
      !currentRevision ||
      currentRevision._id !== args.expectedProposalRevisionId ||
      !confirmationCycle ||
      confirmationCycle._id !== args.expectedConfirmationCycleId ||
      confirmationCycle.status !== "pending"
    ) {
      throw new Error("Stale or completed proposal confirmation cycle.");
    }
    const approverRole = auth.roles.find((role) =>
      LENDER_PROPOSAL_DECISION_ROLES.includes(
        role as (typeof LENDER_PROPOSAL_DECISION_ROLES)[number],
      ),
    );
    if (!approverRole) {
      throw new Error("Forbidden: lender proposal decline role");
    }
    const now = Date.now();
    assertProposalLenderApprovalTimestamps({
      declinedAt: now,
      status: "declined",
    });
    const decisionId = await ctx.db.insert("proposalLenderApprovals", {
      approverRole,
      approverWorkosUserId: auth.subject,
      assignmentId: auth.currentLenderAssignment._id,
      brokerageId: auth.brokerage._id,
      confirmationCycleId: confirmationCycle._id,
      createdAt: now,
      declinedAt: now,
      declinedCheckpoint: args.declinedCheckpoint,
      idempotencyKey,
      lenderOrganizationId:
        auth.currentLenderAssignment.lenderOrganizationId,
      organizationId: auth.organizationId,
      proposalId: args.proposalId,
      proposalRevisionId: currentRevision._id,
      proposalRevisionNumber: currentRevision.revisionNumber,
      reason: args.reason.trim(),
      status: "declined",
    });
    await ctx.db.patch(confirmationCycle._id, {
      closedAt: now,
      decisionId,
      status: "declined",
    });
    await ctx.db.patch(args.proposalId, {
      latestLenderApprovalId: undefined,
      latestLenderReviewedRevisionId: currentRevision._id,
      latestLenderReviewedRevisionNumber: currentRevision.revisionNumber,
      updatedAt: now,
      updatedByWorkosUserId: auth.subject,
    });
    await upsertKanbanCard(ctx, args.proposalId, now);
    await writeProposalEvent(ctx, {
      auth,
      command: "declineExternalProposalForClosing",
      eventType: "proposal.lender_confirmation.declined",
      newState: JSON.stringify({
        confirmationCycleId: confirmationCycle._id,
        decisionId,
        declinedCheckpoint: args.declinedCheckpoint,
        proposalRevisionId: currentRevision._id,
        proposalRevisionNumber: currentRevision.revisionNumber,
        status: "declined",
      }),
      priorState: JSON.stringify({ lenderConfirmation: "pending" }),
      proposalId: args.proposalId,
      reason: args.reason,
    });
    await enqueueProposalApprovalOutcomeNotifications(ctx, {
      assignment: auth.currentLenderAssignment,
      confirmationCycle,
      outcome: "rejected",
      proposal: auth.proposal,
      revision: currentRevision,
    });
    return { decisionId };
  })
  .public();

export const approveExternalProposalForClosing = authenticatedMutation
  .input({
    expectedAssignmentId: v.id("proposalLenderAssignments"),
    expectedConfirmationCycleId: v.id("proposalLenderConfirmationCycles"),
    expectedProposalRevisionId: v.id("proposalRevisions"),
    idempotencyKey: v.string(),
    proposalId: v.id("buildProposals"),
    reason: v.string(),
    workosOrganizationId: v.string(),
  })
  .returns(
    v.object({
      approvalId: v.id("proposalLenderApprovals"),
    }),
  )
  .handler(async (ctx, args) => {
    const auth = await authorizeLenderProposalLifecycleActor(
      ctx,
      args.proposalId,
      args.workosOrganizationId,
      "proposal_review",
    );
    await assertNoArchivingProposalLenderAssignment(ctx, args.proposalId);
    if (!auth.isCurrentLenderActor || !auth.currentLenderAssignment) {
      throw new Error("Forbidden: lender proposal approval");
    }
    const idempotencyKey = normalizeOperationalIdempotencyKey(
      args.idempotencyKey,
      "Proposal confirmation decision idempotency key",
    );
    const idempotentDecision = await ctx.db
      .query("proposalLenderApprovals")
      .withIndex("by_confirmation_cycle_and_idempotency_key", (query) =>
        query
          .eq("confirmationCycleId", args.expectedConfirmationCycleId)
          .eq("idempotencyKey", idempotencyKey),
      )
      .unique();
    if (idempotentDecision) {
      if (
        idempotentDecision.approverWorkosUserId !== auth.subject ||
        idempotentDecision.status !== "approved" ||
        idempotentDecision.reason !== args.reason.trim()
      ) {
        throw new Error(
          "Proposal confirmation decision idempotency key was reused with different values.",
        );
      }
      return { approvalId: idempotentDecision._id };
    }
    assertProposalLifecycleTransition({
      command: "confirm",
      reviewOutcome: auth.proposal.reviewOutcome,
      state: auth.proposal.status,
    });
    requireReason(args.reason);
    const currentRevision = await getCurrentProposalRevision(
      ctx,
      auth.proposal,
    );
    if (
      !currentRevision ||
      currentRevision.assignmentId !== auth.currentLenderAssignment._id
    ) {
      throw new Error("A current proposal revision for this assignment is required.");
    }
    if (
      auth.currentLenderAssignment._id !== args.expectedAssignmentId ||
      currentRevision._id !== args.expectedProposalRevisionId
    ) {
      throw new Error("Stale proposal confirmation assignment or revision.");
    }
    const confirmationCycle = await getCurrentProposalLenderConfirmationCycle(
      ctx,
      auth.proposal,
      auth.currentLenderAssignment,
    );
    if (
      !confirmationCycle ||
      confirmationCycle._id !== args.expectedConfirmationCycleId ||
      confirmationCycle.status !== "pending"
    ) {
      throw new Error("Stale or completed proposal confirmation cycle.");
    }
    const acknowledgements = await ctx.db
      .query("proposalLenderConfirmationAcknowledgements")
      .withIndex("by_cycle_and_actor", (query) =>
        query
          .eq("confirmationCycleId", confirmationCycle._id)
          .eq("acknowledgedByWorkosUserId", auth.subject),
      )
      .collect();
    const acknowledgedCheckpoints = new Set(
      acknowledgements.map((acknowledgement) => acknowledgement.checkpoint),
    );
    if (
      PROPOSAL_CONFIRMATION_CHECKPOINTS.some(
        (checkpoint) => !acknowledgedCheckpoints.has(checkpoint),
      )
    ) {
      throw new Error(
        "Every proposal confirmation checkpoint must be acknowledged before approval.",
      );
    }
    const approverRole = auth.roles.find((role) =>
      LENDER_PROPOSAL_DECISION_ROLES.includes(
        role as (typeof LENDER_PROPOSAL_DECISION_ROLES)[number],
      ),
    );
    if (!approverRole) {
      throw new Error("Forbidden: lender proposal approval role");
    }
    const now = Date.now();
    assertProposalLenderApprovalTimestamps({
      approvedAt: now,
      status: "approved",
    });
    const approvalId = await ctx.db.insert("proposalLenderApprovals", {
      approverRole,
      approverWorkosUserId: auth.subject,
      approvedAt: now,
      assignmentId: auth.currentLenderAssignment._id,
      brokerageId: auth.brokerage._id,
      confirmationCycleId: confirmationCycle._id,
      createdAt: now,
      idempotencyKey,
      lenderOrganizationId:
        auth.currentLenderAssignment.lenderOrganizationId,
      organizationId: auth.organizationId,
      proposalId: args.proposalId,
      proposalRevisionId: currentRevision._id,
      proposalRevisionNumber: currentRevision.revisionNumber,
      reason: args.reason.trim(),
      status: "approved",
    });
    await ctx.db.patch(confirmationCycle._id, {
      closedAt: now,
      decisionId: approvalId,
      status: "approved",
    });
    await ctx.db.patch(args.proposalId, {
      latestLenderApprovalId: approvalId,
      latestLenderReviewedRevisionId: currentRevision._id,
      latestLenderReviewedRevisionNumber: currentRevision.revisionNumber,
      updatedAt: now,
      updatedByWorkosUserId: auth.subject,
    });
    await upsertKanbanCard(ctx, args.proposalId, now);
    await writeProposalEvent(ctx, {
      auth,
      command: "approveExternalProposalForClosing",
      eventType: "proposal.lender_confirmation.approved",
      newState: JSON.stringify({
        approvalId,
        assignmentId: auth.currentLenderAssignment._id,
        confirmationCycleId: confirmationCycle._id,
        proposalRevisionId: currentRevision._id,
        proposalRevisionNumber: currentRevision.revisionNumber,
        status: "approved",
      }),
      priorState: JSON.stringify({ lenderConfirmation: "pending" }),
      proposalId: args.proposalId,
      reason: args.reason,
    });
    await enqueueProposalApprovalOutcomeNotifications(ctx, {
      assignment: auth.currentLenderAssignment,
      confirmationCycle,
      outcome: "approved",
      proposal: auth.proposal,
      revision: currentRevision,
    });
    return { approvalId };
  })
  .public();

export const getLenderProposalConfirmation = authenticatedQuery
  .input({
    historyPaginationOpts: paginationOptsValidator,
    proposalId: v.id("buildProposals"),
    workosOrganizationId: v.string(),
  })
  .returns(lenderProposalConfirmationProjectionValidator)
  .handler(async (ctx, args) => {
    const auth = await authorizeLenderProposalLifecycleActor(
      ctx,
      args.proposalId,
      args.workosOrganizationId,
    );
    if (!auth.isCurrentLenderActor || !auth.currentLenderAssignment) {
      throw new Error("Forbidden: lender proposal confirmation");
    }
    const cycles = await paginateProposalConfirmationCycles(
      ctx,
      args.proposalId,
      args.historyPaginationOpts,
      auth.currentLenderAssignment._id,
    );
    const history = await Promise.all(
      cycles.page.map((cycle) =>
        projectProposalConfirmationCycle(ctx, cycle, {
          includePrivateActors: true,
          includePrivateReason: true,
        }),
      ),
    );
    const currentCycle = await getCurrentProposalLenderConfirmationCycle(
      ctx,
      auth.proposal,
      auth.currentLenderAssignment,
    );
    const currentProjection = currentCycle
      ? await projectProposalConfirmationCycle(ctx, currentCycle, {
          includePrivateActors: true,
          includePrivateReason: true,
        })
      : null;
    const actorAcknowledgements = currentProjection?.acknowledgements.filter(
      (acknowledgement) =>
        acknowledgement.acknowledgedByWorkosUserId === auth.subject,
    ) ?? [];
    const acknowledgedCheckpoints = new Set(
      actorAcknowledgements.map((acknowledgement) => acknowledgement.checkpoint),
    );
    const canAcknowledge = currentCycle?.status === "pending";
    const decisionAuthorized = Boolean(
      auth.roles.includes("admin") ||
        (auth.lenderOrganization?.permissions.proposalReview &&
          auth.roles.some((role) =>
            LENDER_PROPOSAL_DECISION_ROLES.includes(
              role as (typeof LENDER_PROPOSAL_DECISION_ROLES)[number],
            ),
          )),
    );
    const canDecide = Boolean(
      canAcknowledge &&
        decisionAuthorized &&
        PROPOSAL_CONFIRMATION_CHECKPOINTS.every((checkpoint) =>
          acknowledgedCheckpoints.has(checkpoint),
        ),
    );
    const currentApproval = await getLenderApprovalForCurrentProposalRevision(
      ctx,
      auth.proposal,
      auth.currentLenderAssignment,
    );
    const closingGateSatisfied = Boolean(
      currentCycle?.status === "approved" &&
        currentApproval &&
        (await isActiveEligibleLenderApproval(
          ctx,
          currentApproval,
          auth.currentLenderAssignment,
        )),
    );
    return {
      canAcknowledge,
      canDecide,
      closingGateSatisfied,
      currentCycle: currentProjection,
      decisionAuthorized,
      history: { ...cycles, page: history },
      lenderNeedsAction: currentCycle?.status === "pending",
    };
  })
  .public();

export const getBackofficeProposalRemediation = authenticatedQuery
  .input({
    historyPaginationOpts: paginationOptsValidator,
    proposalId: v.id("buildProposals"),
    workosOrganizationId: v.string(),
  })
  .returns(backofficeProposalRemediationProjectionValidator)
  .handler(async (ctx, args) => {
    const auth = await authorizeProposalLifecycleActor(
      ctx,
      args.proposalId,
      args.workosOrganizationId,
    );
    if (auth.isCurrentLenderActor || !isBackoffice(auth.roles)) {
      throw new Error("Forbidden: Back Office proposal remediation");
    }
    const cycles = await paginateProposalConfirmationCycles(
      ctx,
      args.proposalId,
      args.historyPaginationOpts,
    );
    const history = await Promise.all(
      cycles.page.map((cycle) =>
        projectProposalConfirmationCycle(ctx, cycle, {
          includePrivateActors: true,
          includePrivateReason: true,
        }),
      ),
    );
    const currentCycle = auth.currentLenderAssignment
      ? await getCurrentProposalLenderConfirmationCycle(
          ctx,
          auth.proposal,
          auth.currentLenderAssignment,
        )
      : null;
    const currentProjection = currentCycle
      ? await projectProposalConfirmationCycle(ctx, currentCycle, {
          includePrivateActors: true,
          includePrivateReason: true,
        })
      : null;
    const currentDecision = currentCycle
      ? await getProposalConfirmationDecision(ctx, currentCycle)
      : null;
    const remediation =
      currentCycle?.status === "declined" &&
      currentDecision?.status === "declined" &&
      currentDecision.declinedCheckpoint &&
      currentDecision.reason &&
      auth.currentLenderAssignment
        ? {
            confirmationCycleId: currentCycle._id,
            declinedCheckpoint: currentDecision.declinedCheckpoint,
            declinedProposalRevisionId: currentCycle.proposalRevisionId,
            declinedProposalRevisionNumber:
              currentCycle.proposalRevisionNumber,
            editableProposalId: args.proposalId,
            privateReason: currentDecision.reason,
            publishBase: {
              expectedAssignmentId: auth.currentLenderAssignment._id,
              expectedProposalRevisionNumber:
                currentCycle.proposalRevisionNumber,
            },
            updateRequired: true as const,
          }
        : null;
    return {
      currentCycle: currentProjection,
      history: { ...cycles, page: history },
      lenderNeedsAction: currentCycle?.status === "pending",
      remediation,
    };
  })
  .public();

export const getBuilderProposalConfirmationState = authenticatedQuery
  .input({
    historyPaginationOpts: paginationOptsValidator,
    proposalId: v.id("buildProposals"),
    workosOrganizationId: v.string(),
  })
  .returns(builderProposalConfirmationProjectionValidator)
  .handler(async (ctx, args) => {
    const auth = await authorizeProposal(
      ctx,
      args.proposalId,
      args.workosOrganizationId,
    );
    requireAnyRole(auth.roles, BUILDER_ROLES);
    const assignment = await getCurrentProposalLenderAssignment(
      ctx,
      args.proposalId,
    );
    const cycles = await paginateProposalConfirmationCycles(
      ctx,
      args.proposalId,
      args.historyPaginationOpts,
    );
    const currentCycle = assignment
      ? await getCurrentProposalLenderConfirmationCycle(
          ctx,
          auth.proposal,
          assignment,
        )
      : null;
    const lenderConfirmation = currentCycle
      ? currentCycle.status === "approved"
        ? ("approved" as const)
        : currentCycle.status === "declined"
          ? ("declined" as const)
          : ("pending" as const)
      : ("pending" as const);
    return {
      currentProposalRevisionNumber:
        auth.proposal.currentProposalRevisionNumber ?? null,
      history: {
        ...cycles,
        page: cycles.page.map((cycle) => ({
          closedAt: cycle.closedAt ?? null,
          cycleNumber: cycle.cycleNumber,
          openedAt: cycle.openedAt,
          proposalRevisionNumber: cycle.proposalRevisionNumber,
          status: cycle.status,
        })),
      },
      lifecycle: projectProposalLifecycle(auth.proposal, assignment
        ? { lenderConfirmation, state: "assigned" }
        : { lenderConfirmation: "pending", state: "unassigned" }),
      updateRequired: currentCycle?.status === "declined",
    };
  })
  .public();

export const listProposalLenderAssignmentHistory = authenticatedQuery
  .input({
    paginationOpts: v.optional(paginationOptsValidator),
    proposalId: v.id("buildProposals"),
    workosOrganizationId: v.optional(v.string()),
  })
  .returns(
    paginationResultValidator(proposalLenderAssignmentProjectionValidator),
  )
  .handler(async (ctx, args) => {
    let lenderOrganizationId: Id<"lenderOrganizations"> | undefined;
    if (args.workosOrganizationId) {
      const auth = await authorizeProposal(
        ctx,
        args.proposalId,
        args.workosOrganizationId,
      );
      requireAnyRole(auth.roles, BACKOFFICE_ROLES);
    } else {
      const identity = await ctx.auth.getUserIdentity();
      if (!identity) {
        throw new Error("Unauthorized");
      }
      const authorization = await resolveActiveLenderOrganizationContext(
        ctx,
        identity,
        "lenderOrganization",
      );
      lenderOrganizationId = authorization.activeOrganization.lenderOrganizationId;
    }

    const paginationOpts = args.paginationOpts ?? { cursor: null, numItems: 50 };
    let page;
    if (lenderOrganizationId) {
      const scopedLenderOrganizationId = lenderOrganizationId;
      page = await ctx.db
        .query("proposalLenderAssignments")
        .withIndex("by_proposal_lender_organization", (query) =>
          query
            .eq("proposalId", args.proposalId)
            .eq("lenderOrganizationId", scopedLenderOrganizationId),
        )
        .order("desc")
        .paginate(paginationOpts);
    } else {
      page = await ctx.db
        .query("proposalLenderAssignments")
        .withIndex("by_proposal", (query) =>
          query.eq("proposalId", args.proposalId),
        )
        .order("desc")
        .paginate(paginationOpts);
    }
    if (lenderOrganizationId && page.page.length === 0 && paginationOpts.cursor === null) {
      throw new Error("Forbidden: lender assignment history");
    }
    return {
      ...page,
      page: page.page.map(
        lenderOrganizationId
          ? projectLenderVisibleProposalAssignment
          : projectProposalLenderAssignment,
      ),
    };
  })
  .public();
