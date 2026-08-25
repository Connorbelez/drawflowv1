/**
 * Production proposals proposal review commands bounded-context implementation.
 * The parent facade re-exports its handlers to preserve production_proposals function references.
 */
import { ConvexError, v } from "convex/values";
import { authenticatedMutation } from "../authz";
import { getLenderOrganizationApprovalEligibility } from "../lenderOrganizationAccess";
import { getBuilderBrokerAssignmentHealth } from "../brokerAssignments";
import { normalizeOperationalIdempotencyKey } from "../build_operational_idempotency";
import { publishSavedV1ScopeDraftsForProposal } from "../submilestone_scope_contracts";
import { assertProposalCollaborationEditAllowed, pushProposalPlanningSnapshot } from "../proposal_collaboration_model";
import { assertProposalLifecycleTransition } from "../production_proposal_lifecycle";
import { normalizeProposalReviewPolicy, proposalReviewPoliciesEqual, validateProposalReviewPolicyQuorums } from "../lender_portal_phase3";
import { enqueueProposalApprovalRequiredNotifications } from "../lender_portal_notifications";
import { type Id } from "../types";
import { authorizeProposal, assertBuilderProfileScope, assignedBuilderProfileIdOrThrow, assertBuilderOwnership } from "./authorization_core.js";
import { requireProposalAppPermission } from "./builder_staff_access.js";
import { requireBackofficeProposalWrite, requireAnyRole } from "./contractor_policy_helpers.js";
import { BACKOFFICE_ROLES, APPROVER_ROLES, BUILDER_ROLES, proposalReviewPolicyInputValidator } from "./contracts_foundation.js";
import { productionSelectedPlanKeyInput, productionSelectedPlanMetricsInput } from "./contracts_workflow.js";
import { getCurrentProposalLenderAssignment, assertNoArchivingProposalLenderAssignment, resolvePolicyLenderOrganization } from "./lender_assignment_auth.js";
import { isBackoffice } from "./proposal_claim.js";
import { upsertKanbanCard, writeProposalEvent } from "./proposal_copy_audit.js";
import { productionSelectedPlanNames, normalizeSelectedPlanMetric } from "./proposal_draft_persistence.js";
import { requireReason } from "./proposal_lender_approval.js";
import { requireState, requirePhase3BackofficeRole, assertExpectedProposalReviewBase, getCurrentProposalReviewPolicyVersion, ensureDefaultProposalReviewPolicyVersion, getCurrentProposalRevision, createImmutableProposalRevision, openProposalLenderConfirmationCycle } from "./review_lifecycle_helpers.js";
import { getActiveWorkflowRule, getWorkflowSnapshot, getPermitDocument, collectByIndex } from "./storage_helpers.js";

export const selectProposalPlan = authenticatedMutation
  .input({
    metrics: productionSelectedPlanMetricsInput,
    planKey: productionSelectedPlanKeyInput,
    proposalId: v.id("buildProposals"),
    recommendationReason: v.string(),
    workosOrganizationId: v.string(),
  })
  .returns(v.null())
  .handler(async (ctx, args) => {
    const auth = await authorizeProposal(
      ctx,
      args.proposalId,
      args.workosOrganizationId,
    );
    requireState(auth.proposal, "draft");
    requireAnyRole(auth.roles, BUILDER_ROLES);
    await requireProposalAppPermission(ctx, auth, "capitalEvent", "update");
    await assertProposalCollaborationEditAllowed(ctx, auth);
    const recommendationReason = args.recommendationReason.trim();
    if (!recommendationReason) {
      throw new Error("A plan recommendation reason is required.");
    }
    const now = Date.now();
    const selectedPlan = {
      metrics: {
        drawCount: normalizeSelectedPlanMetric(
          args.metrics.drawCount,
          "Draw count",
        ),
        drawFeesCents: normalizeSelectedPlanMetric(
          args.metrics.drawFeesCents,
          "Draw fees",
        ),
        interestCostCents: normalizeSelectedPlanMetric(
          args.metrics.interestCostCents,
          "Interest cost",
        ),
        minimumCashReserveCents: normalizeSelectedPlanMetric(
          args.metrics.minimumCashReserveCents,
          "Minimum cash reserve",
        ),
        projectedDurationDays: normalizeSelectedPlanMetric(
          args.metrics.projectedDurationDays,
          "Projected duration",
        ),
        ...(args.metrics.requiredWorkingCapitalCents === undefined
          ? {}
          : {
              requiredWorkingCapitalCents: normalizeSelectedPlanMetric(
                args.metrics.requiredWorkingCapitalCents,
                "Required working capital",
              ),
            }),
        startingCashCents: normalizeSelectedPlanMetric(
          args.metrics.startingCashCents,
          "Starting cash",
        ),
        totalCostCents: normalizeSelectedPlanMetric(
          args.metrics.totalCostCents,
          "Total cost",
        ),
        totalDrawAmountCents: normalizeSelectedPlanMetric(
          args.metrics.totalDrawAmountCents,
          "Total draw amount",
        ),
      },
      name: productionSelectedPlanNames[args.planKey],
      planKey: args.planKey,
      recommendationReason,
      selectedAt: now,
      selectedByWorkosUserId: auth.subject,
    };
    await ctx.db.patch(args.proposalId, {
      selectedPlan,
      updatedAt: now,
      updatedByWorkosUserId: auth.subject,
    });
    await writeProposalEvent(ctx, {
      auth,
      command: "selectProposalPlan",
      eventType: "proposal.plan.selected",
      newState: JSON.stringify(selectedPlan),
      priorState: auth.proposal.selectedPlan
        ? JSON.stringify(auth.proposal.selectedPlan)
        : undefined,
      proposalId: args.proposalId,
      reason: recommendationReason,
    });
    await pushProposalPlanningSnapshot(ctx, args.proposalId);
    return null;
  })
  .public();

export const submitProposal = authenticatedMutation
  .input({
    proposalId: v.id("buildProposals"),
    workosOrganizationId: v.string(),
  })
  .returns(v.id("workflowRuleSnapshots"))
  .handler(async (ctx, args) => {
    const auth = await authorizeProposal(
      ctx,
      args.proposalId,
      args.workosOrganizationId,
    );
    assertProposalLifecycleTransition({
      command: "submit",
      reviewOutcome: auth.proposal.reviewOutcome,
      state: auth.proposal.status,
    });
    if (!isBackoffice(auth.roles)) {
      const builderProfileId = assignedBuilderProfileIdOrThrow(auth.proposal);
      await assertBuilderOwnership(ctx, builderProfileId, auth.subject);
      const builderProfile = await assertBuilderProfileScope(
        ctx,
        builderProfileId,
        auth.brokerage._id,
      );
      const assignmentHealth = await getBuilderBrokerAssignmentHealth(ctx, {
        brokerage: auth.brokerage,
        builderProfile,
      });
      if (!assignmentHealth.healthy) {
        throw new ConvexError({
          code: "BUILDER_BROKER_ASSIGNMENT_REQUIRED",
          reason: assignmentHealth.reason,
          recoverable: true,
          safeMessage:
            "An active broker assignment is required before submitting a proposal.",
        });
      }
    }
    const milestones = await collectByIndex(
      ctx,
      "proposalMilestones",
      "by_proposal",
      args.proposalId,
    );
    if (milestones.length === 0) {
      throw new Error("At least one milestone is required before submission.");
    }

    const now = Date.now();
    await publishSavedV1ScopeDraftsForProposal(ctx, {
      actorRoles: auth.roles,
      actorWorkosUserId: auth.subject,
      brokerageId: auth.brokerage._id,
      now,
      organizationId: args.workosOrganizationId,
      proposalId: args.proposalId,
    });
    const workflowRule = await getActiveWorkflowRule(ctx, auth.brokerage._id);
    const snapshotId = await ctx.db.insert("workflowRuleSnapshots", {
      allowPermitWaiverByRoles: workflowRule.allowPermitWaiverByRoles,
      brokerageId: auth.brokerage._id,
      createdAt: now,
      organizationId: args.workosOrganizationId,
      proposalId: args.proposalId,
      proposalStates: workflowRule.proposalStates,
      requirePermitForApproval: workflowRule.requirePermitForApproval,
      ruleKey: workflowRule.ruleKey,
      settings: workflowRule.settings,
      version: workflowRule.version,
      workflowRuleId: workflowRule._id,
    });
    await ctx.db.patch(args.proposalId, {
      backOfficeApprovedByWorkosUserId: undefined,
      reviewOutcome: "none",
      status: "submitted",
      submittedAt: now,
      updatedAt: now,
      updatedByWorkosUserId: auth.subject,
      workflowRuleSnapshotId: snapshotId,
    });
    await upsertKanbanCard(ctx, args.proposalId, now);
    await writeProposalEvent(ctx, {
      auth,
      command: "submitProposal",
      eventType: "proposal.submitted",
      newState: "submitted",
      priorState: "draft",
      proposalId: args.proposalId,
    });
    return snapshotId;
  })
  .public();

export const requestChanges = authenticatedMutation
  .input({
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
    requireAnyRole(auth.roles, BACKOFFICE_ROLES);
    assertProposalLifecycleTransition({
      command: "request_changes",
      reviewOutcome: auth.proposal.reviewOutcome,
      state: auth.proposal.status,
    });
    requireReason(args.reason);
    const now = Date.now();
    await ctx.db.patch(args.proposalId, {
      reviewOutcome: "requested_changes",
      status: "draft",
      updatedAt: now,
      updatedByWorkosUserId: auth.subject,
    });
    await upsertKanbanCard(ctx, args.proposalId, now);
    await writeProposalEvent(ctx, {
      auth,
      command: "requestChanges",
      eventType: "proposal.changes_requested",
      newState: "draft",
      priorState: "submitted",
      proposalId: args.proposalId,
      reason: args.reason,
    });
    return null;
  })
  .public();

export const rejectProposal = authenticatedMutation
  .input({
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
    requireAnyRole(auth.roles, BACKOFFICE_ROLES);
    assertProposalLifecycleTransition({
      command: "reject",
      reviewOutcome: auth.proposal.reviewOutcome,
      state: auth.proposal.status,
    });
    requireReason(args.reason);
    const now = Date.now();
    await ctx.db.patch(args.proposalId, {
      reviewOutcome: "rejected",
      updatedAt: now,
      updatedByWorkosUserId: auth.subject,
    });
    await writeProposalEvent(ctx, {
      auth,
      command: "rejectProposal",
      eventType: "proposal.rejected",
      newState: "submitted",
      priorState: "submitted",
      proposalId: args.proposalId,
      reason: args.reason,
    });
    return null;
  })
  .public();

export const approveProposal = authenticatedMutation
  .input({
    permitWaiverReason: v.optional(v.string()),
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
    assertProposalLifecycleTransition({
      command: "approve",
      reviewOutcome: auth.proposal.reviewOutcome,
      state: auth.proposal.status,
    });
    requireReason(args.reason);
    const builderProfileId = assignedBuilderProfileIdOrThrow(
      auth.proposal,
      "Assign an active builder before approving the proposal.",
    );
    await assertBuilderProfileScope(ctx, builderProfileId, auth.brokerage._id);
    const snapshot = await getWorkflowSnapshot(ctx, auth.proposal);
    const permit = await getPermitDocument(ctx, args.proposalId);
    let waiverId: Id<"documentWaivers"> | undefined;
    if (!permit && snapshot.requirePermitForApproval) {
      if (!args.permitWaiverReason?.trim()) {
        throw new Error(
          "A permit waiver reason is required when no permit waiver exists.",
        );
      }
      const actorRole = auth.roles.find((role) =>
        snapshot.allowPermitWaiverByRoles.includes(role),
      );
      if (!actorRole) {
        throw new Error("Forbidden: permit waiver");
      }
      waiverId = await ctx.db.insert("documentWaivers", {
        brokerageId: auth.brokerage._id,
        createdAt: Date.now(),
        documentType: "permit",
        grantedByRole: actorRole,
        grantedByWorkosUserId: auth.subject,
        organizationId: args.workosOrganizationId,
        proposalId: args.proposalId,
        reason: args.permitWaiverReason.trim(),
      });
    }

    const now = Date.now();
    await ctx.db.patch(args.proposalId, {
      approvedAt: now,
      backOfficeApprovedByWorkosUserId: auth.subject,
      reviewOutcome: "approved",
      status: "approved",
      updatedAt: now,
      updatedByWorkosUserId: auth.subject,
    });
    const approvedProposal = await ctx.db.get(args.proposalId);
    if (!approvedProposal) {
      throw new Error("Approved proposal is unavailable.");
    }
    const policyVersion = await ensureDefaultProposalReviewPolicyVersion(ctx, {
      auth: { ...auth, proposal: approvedProposal },
      now,
    });
    await createImmutableProposalRevision(ctx, {
      assignment: await getCurrentProposalLenderAssignment(ctx, args.proposalId),
      auth: { ...auth, proposal: approvedProposal },
      idempotencyKey: `system:backoffice-approval:${now}`,
      policyVersion,
      reason: "Publish the Back Office-approved proposal revision.",
    });
    await upsertKanbanCard(ctx, args.proposalId, now);
    await writeProposalEvent(ctx, {
      auth,
      command: "approveProposal",
      eventType: "proposal.approved",
      newState: "approved",
      priorState: "submitted",
      proposalId: args.proposalId,
      reason: args.reason,
      warnings: waiverId ? ["permit-waived"] : [],
    });
    return null;
  })
  .public();

export const configureProposalReviewPolicy = authenticatedMutation
  .input({
    expectedAssignmentId: v.union(
      v.id("proposalLenderAssignments"),
      v.null(),
    ),
    expectedProposalRevisionNumber: v.union(v.number(), v.null()),
    idempotencyKey: v.string(),
    policy: proposalReviewPolicyInputValidator,
    proposalId: v.id("buildProposals"),
    reason: v.string(),
    workosOrganizationId: v.string(),
  })
  .returns(
    v.object({
      policyVersionId: v.id("proposalReviewPolicyVersions"),
      revisionId: v.union(v.id("proposalRevisions"), v.null()),
      revisionNumber: v.union(v.number(), v.null()),
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
    if (auth.proposal.status === "closed" || auth.proposal.lockedReviewPolicyId) {
      throw new Error("Review policy cannot change after policy lock or closing.");
    }
    await assertNoArchivingProposalLenderAssignment(ctx, args.proposalId);
    const policy = normalizeProposalReviewPolicy(args.policy);
    const idempotencyKey = normalizeOperationalIdempotencyKey(
      args.idempotencyKey,
      "Review policy idempotency key",
    );
    const existing = await ctx.db
      .query("proposalReviewPolicyVersions")
      .withIndex("by_proposal_and_idempotency_key", (query) =>
        query
          .eq("proposalId", args.proposalId)
          .eq("idempotencyKey", idempotencyKey),
      )
      .unique();
    if (existing) {
      if (
        existing.configuredByWorkosUserId !== auth.subject ||
        existing.reason !== args.reason.trim() ||
        !proposalReviewPoliciesEqual(existing.policy, policy)
      ) {
        throw new Error("Review policy idempotency key was reused with different values.");
      }
      const revision = await ctx.db
        .query("proposalRevisions")
        .withIndex("by_proposal_and_idempotency_key", (query) =>
          query
            .eq("proposalId", args.proposalId)
            .eq("idempotencyKey", `policy:${idempotencyKey}`),
        )
        .unique();
      return {
        policyVersionId: existing._id,
        revisionId: revision?._id ?? null,
        revisionNumber: revision?.revisionNumber ?? null,
      };
    }
    const assignment = await getCurrentProposalLenderAssignment(
      ctx,
      args.proposalId,
    );
    assertExpectedProposalReviewBase({
      assignment,
      expectedAssignmentId: args.expectedAssignmentId,
      expectedProposalRevisionNumber: args.expectedProposalRevisionNumber,
      proposal: auth.proposal,
    });
    if (
      !assignment &&
      (policy.drawLenderQuorum !== null ||
        policy.milestoneLenderQuorum !== null)
    ) {
      throw new Error(
        "Lender-quorum policy configuration requires a current lender assignment.",
      );
    }
    if (assignment) {
      const lenderOrganization = await resolvePolicyLenderOrganization(
        ctx,
        assignment,
        "policy configuration",
      );
      validateProposalReviewPolicyQuorums(
        policy,
        (await getLenderOrganizationApprovalEligibility(ctx, lenderOrganization._id)).counts,
      );
    }
    const currentPolicy = await getCurrentProposalReviewPolicyVersion(
      ctx,
      auth.proposal,
    );
    const configuredByRole = requirePhase3BackofficeRole(auth);
    const now = Date.now();
    const policyVersionId = await ctx.db.insert(
      "proposalReviewPolicyVersions",
      {
        brokerageId: auth.brokerage._id,
        configuredAt: now,
        configuredByRole,
        configuredByWorkosUserId: auth.subject,
        idempotencyKey,
        organizationId: auth.proposal.organizationId,
        policy,
        proposalId: args.proposalId,
        reason: args.reason.trim(),
        version: (currentPolicy?.version ?? 0) + 1,
      },
    );
    await ctx.db.patch(args.proposalId, {
      currentReviewPolicyVersionId: policyVersionId,
      updatedAt: now,
      updatedByWorkosUserId: auth.subject,
    });
    const policyVersion = await ctx.db.get(policyVersionId);
    const proposal = await ctx.db.get(args.proposalId);
    if (!policyVersion || !proposal) {
      throw new Error("Configured proposal review policy is unavailable.");
    }
    const revision =
      proposal.status === "approved"
        ? await createImmutableProposalRevision(ctx, {
            assignment,
            auth: { ...auth, proposal },
            idempotencyKey: `policy:${idempotencyKey}`,
            policyVersion,
            reason: args.reason,
          })
        : null;
    await writeProposalEvent(ctx, {
      auth,
      command: "configureProposalReviewPolicy",
      eventType: "proposal.review_policy.configured",
      newState: JSON.stringify({
        policy,
        policyVersionId,
        revisionId: revision?._id ?? null,
      }),
      priorState: currentPolicy
        ? JSON.stringify({
            policy: currentPolicy.policy,
            policyVersionId: currentPolicy._id,
          })
        : undefined,
      proposalId: args.proposalId,
      reason: args.reason,
    });
    return {
      policyVersionId,
      revisionId: revision?._id ?? null,
      revisionNumber: revision?.revisionNumber ?? null,
    };
  })
  .public();

export const repairMissingLenderProposalConfirmation = authenticatedMutation
  .input({
    expectedAssignmentId: v.id("proposalLenderAssignments"),
    expectedProposalRevisionNumber: v.union(v.number(), v.null()),
    idempotencyKey: v.string(),
    proposalId: v.id("buildProposals"),
    reason: v.string(),
    workosOrganizationId: v.string(),
  })
  .returns(
    v.object({
      assignmentId: v.id("proposalLenderAssignments"),
      confirmationCycleId: v.id("proposalLenderConfirmationCycles"),
      policyVersionId: v.id("proposalReviewPolicyVersions"),
      proposalRevisionId: v.id("proposalRevisions"),
      proposalRevisionNumber: v.number(),
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
    if (auth.proposal.status !== "approved") {
      throw new Error("Only an approved proposal can restore lender confirmation.");
    }
    if (auth.proposal.lockedReviewPolicyId) {
      throw new Error("Lender confirmation cannot be restored after policy lock.");
    }
    await assertNoArchivingProposalLenderAssignment(ctx, args.proposalId);

    const idempotencyKey = normalizeOperationalIdempotencyKey(
      args.idempotencyKey,
      "Lender confirmation repair idempotency key",
    );
    const assignment = await getCurrentProposalLenderAssignment(
      ctx,
      args.proposalId,
    );
    if (!assignment || assignment._id !== args.expectedAssignmentId) {
      throw new Error("Stale lender assignment.");
    }

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
        idempotentRevision.assignmentId !== assignment._id ||
        idempotentRevision.createdByWorkosUserId !== auth.subject ||
        idempotentRevision.reason !== args.reason.trim()
      ) {
        throw new Error(
          "Lender confirmation repair idempotency key was reused with different values.",
        );
      }
      const policyVersion = await ctx.db.get(
        idempotentRevision.reviewPolicyVersionId,
      );
      if (
        !policyVersion ||
        policyVersion.proposalId !== args.proposalId ||
        policyVersion.organizationId !== auth.proposal.organizationId ||
        policyVersion.brokerageId !== auth.proposal.brokerageId
      ) {
        throw new Error("Repaired lender confirmation policy is unavailable.");
      }
      const existingCycle = await ctx.db
        .query("proposalLenderConfirmationCycles")
        .withIndex("by_assignment_and_revision", (query) =>
          query
            .eq("assignmentId", assignment._id)
            .eq("proposalRevisionId", idempotentRevision._id),
        )
        .unique();
      const confirmationCycle =
        existingCycle ??
        (await openProposalLenderConfirmationCycle(ctx, {
          assignment,
          proposal: auth.proposal,
          proposalRevisionId: idempotentRevision._id,
          proposalRevisionNumber: idempotentRevision.revisionNumber,
        }));
      return {
        assignmentId: assignment._id,
        confirmationCycleId: confirmationCycle._id,
        policyVersionId: policyVersion._id,
        proposalRevisionId: idempotentRevision._id,
        proposalRevisionNumber: idempotentRevision.revisionNumber,
      };
    }

    const currentRevision = await getCurrentProposalRevision(ctx, auth.proposal);
    if (
      (currentRevision?.revisionNumber ?? null) !==
      args.expectedProposalRevisionNumber
    ) {
      throw new Error("Stale proposal revision.");
    }
    if (currentRevision?.assignmentId !== undefined) {
      if (currentRevision.assignmentId !== assignment._id) {
        throw new Error("Current proposal revision does not match the lender assignment.");
      }
      const currentCycle = await ctx.db
        .query("proposalLenderConfirmationCycles")
        .withIndex("by_assignment_and_revision", (query) =>
          query
            .eq("assignmentId", assignment._id)
            .eq("proposalRevisionId", currentRevision._id),
        )
        .unique();
      if (currentCycle) {
        throw new Error("The current lender confirmation cycle already exists.");
      }
      const policyVersion = await getCurrentProposalReviewPolicyVersion(
        ctx,
        auth.proposal,
      );
      if (
        !policyVersion ||
        policyVersion._id !== currentRevision.reviewPolicyVersionId
      ) {
        throw new Error("Current proposal revision policy is unavailable.");
      }
      const confirmationCycle = await openProposalLenderConfirmationCycle(ctx, {
        assignment,
        proposal: auth.proposal,
        proposalRevisionId: currentRevision._id,
        proposalRevisionNumber: currentRevision.revisionNumber,
      });
      await writeProposalEvent(ctx, {
        auth,
        command: "repairMissingLenderProposalConfirmation",
        eventType: "proposal.lender_confirmation.repaired",
        newState: JSON.stringify({
          assignmentId: assignment._id,
          confirmationCycleId: confirmationCycle._id,
          proposalRevisionId: currentRevision._id,
          proposalRevisionNumber: currentRevision.revisionNumber,
        }),
        priorState: JSON.stringify({
          confirmationCycle: null,
          proposalRevisionId: currentRevision._id,
        }),
        proposalId: args.proposalId,
        reason: args.reason,
      });
      await enqueueProposalApprovalRequiredNotifications(ctx, {
        assignment,
        confirmationCycle,
        proposal: auth.proposal,
        revision: currentRevision,
      });
      return {
        assignmentId: assignment._id,
        confirmationCycleId: confirmationCycle._id,
        policyVersionId: policyVersion._id,
        proposalRevisionId: currentRevision._id,
        proposalRevisionNumber: currentRevision.revisionNumber,
      };
    }

    const now = Date.now();
    const policyVersion = await ensureDefaultProposalReviewPolicyVersion(ctx, {
      auth,
      now,
    });
    const revision = await createImmutableProposalRevision(ctx, {
      assignment,
      auth,
      idempotencyKey,
      policyVersion,
      reason: args.reason,
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
      throw new Error("Repaired lender confirmation cycle is unavailable.");
    }
    await writeProposalEvent(ctx, {
      auth,
      command: "repairMissingLenderProposalConfirmation",
      eventType: "proposal.lender_confirmation.repaired",
      newState: JSON.stringify({
        assignmentId: assignment._id,
        confirmationCycleId: confirmationCycle._id,
        policyVersionId: policyVersion._id,
        proposalRevisionId: revision._id,
        proposalRevisionNumber: revision.revisionNumber,
      }),
      priorState: JSON.stringify({
        confirmationCycle: null,
        proposalRevisionId: null,
      }),
      proposalId: args.proposalId,
      reason: args.reason,
    });
    await enqueueProposalApprovalRequiredNotifications(ctx, {
      assignment,
      confirmationCycle,
      proposal: auth.proposal,
      revision,
    });
    return {
      assignmentId: assignment._id,
      confirmationCycleId: confirmationCycle._id,
      policyVersionId: policyVersion._id,
      proposalRevisionId: revision._id,
      proposalRevisionNumber: revision.revisionNumber,
    };
  })
  .public();
