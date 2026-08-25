import { internal } from "../_generated/api.js";
import type { Doc, Id } from "../_generated/dataModel";
import { operationalRequestFingerprint } from "../build_operational_idempotency.js";
import {
  beginLenderPortalPhase9MigrationApply,
  requireAuthorizedLenderPortalPhase9Migration,
} from "../lender_portal_phase9.js";
import { validateProposalReviewPolicyQuorums } from "../lender_portal_phase3.js";
import type { MutationCtx } from "../types.js";
import { materializeLegacyLenderOrganization } from "./lender_organization";
import {
  type Phase3MigrationSourceTable,
  ensureMigrationPolicyVersion,
  ensureMigrationProposalRevision,
  getMigrationCurrentProposalAssignment,
  linkMigrationPolicyLock,
  recordPhase3MigrationIssue,
  resolvePhase3MigrationIssue,
} from "./phase3";
import { migrations } from "./context";

/** Persist the exact authorized manifest boundary before any Phase 9 write. */
export const validateLenderPortalPhase9ApplyManifest = migrations.define({
  table: "lenderPortalPhase9MigrationRuns",
  batchSize: 1,
  migrateOne: async (ctx, run) => {
    await beginLenderPortalPhase9MigrationApply(ctx, run);
  },
});

/**
 * Candidate-bound Phase 9 policy and assignment reconciliation. Only exact,
 * application-owned records already present in the same tenant are linked.
 */
export const reconcileLenderPortalPhase9PolicyAssignmentFacts =
  migrations.define({
    table: "buildProposals",
    batchSize: 1,
    migrateOne: async (ctx, proposal) => {
      const migrationRun = await requireAuthorizedLenderPortalPhase9Migration(
        ctx,
        proposal
      );
      if (!migrationRun) return;
      const assignments = await ctx.db
        .query("proposalLenderAssignments")
        .withIndex("by_proposal", (query) =>
          query.eq("proposalId", proposal._id)
        )
        .take(501);
      if (assignments.length > 500) {
        throw new Error(
          "Phase 9 assignment reconciliation exceeded its authorized inventory boundary."
        );
      }
      for (const assignment of assignments) {
        let lenderOrganizationId = ctx.db.normalizeId(
          "lenderOrganizations",
          String(assignment.lenderOrganizationId)
        );
        let lenderOrganization = lenderOrganizationId
          ? await ctx.db.get(lenderOrganizationId)
          : null;
        if (
          !lenderOrganization ||
          lenderOrganization.status !== "active" ||
          lenderOrganization.brokerageId !== assignment.lenderBrokerageId
        ) {
          lenderOrganizationId = await materializeLegacyLenderOrganization(ctx, {
            brokerageId: assignment.lenderBrokerageId,
            legacyWorkosOrganizationId: String(assignment.lenderOrganizationId),
            organizationId: assignment.organizationId,
            snapshotName: assignment.lenderOrganizationName,
            sourceRecordId: String(assignment._id),
            sourceTable: "proposalLenderAssignments",
          });
          lenderOrganization = lenderOrganizationId
            ? await ctx.db.get(lenderOrganizationId)
            : null;
        }
        if (
          assignment.organizationId !== proposal.organizationId ||
          assignment.brokerageId !== proposal.brokerageId ||
          !lenderOrganizationId ||
          !lenderOrganization ||
          lenderOrganization.status !== "active" ||
          lenderOrganization.brokerageId !== assignment.lenderBrokerageId
        ) {
          await recordPhase3MigrationIssue(ctx, {
            brokerageId: proposal.brokerageId,
            organizationId: proposal.organizationId,
            proposalId: proposal._id,
            reason:
              "Assignment ownership is not exactly verifiable within proposal, organization, and Brokerage scope.",
            sourceRecordId: String(assignment._id),
            sourceTable: "proposalLenderAssignments",
          });
          return;
        }
        if (assignment.lenderOrganizationId !== lenderOrganizationId) {
          await ctx.db.patch(assignment._id, {
            legacyLenderOrganizationId: String(assignment.lenderOrganizationId),
            lenderOrganizationId,
          });
        }
      }
      if (proposal.status !== "approved" && proposal.status !== "closed") return;
      const policy = await ensureMigrationPolicyVersion(ctx, proposal);
      const revision = policy
        ? await ensureMigrationProposalRevision(ctx, proposal, policy)
        : null;
      if (!policy || !revision) {
        await recordPhase3MigrationIssue(ctx, {
          brokerageId: proposal.brokerageId,
          organizationId: proposal.organizationId,
          proposalId: proposal._id,
          reason:
            "Exact policy and revision facts are unavailable or contradictory; no pointer was changed.",
          sourceRecordId: String(proposal._id),
          sourceTable: "buildProposals",
        });
        return;
      }
      const changed =
        proposal.currentReviewPolicyVersionId !== policy._id ||
        proposal.currentProposalRevisionId !== revision._id ||
        proposal.currentProposalRevisionNumber !== revision.revisionNumber;
      if (!changed) return;
      await ctx.db.patch(proposal._id, {
        currentProposalRevisionId: revision._id,
        currentProposalRevisionNumber: revision.revisionNumber,
        currentReviewPolicyVersionId: policy._id,
      });
      await recordPhase9MigrationAudit(ctx, proposal, {
        candidateSha: migrationRun.candidateSha,
        command: "reconcileLenderPortalPhase9PolicyAssignmentFacts",
        eventType: "lender_portal.migration.policy_assignment_reconciled",
        newState: JSON.stringify({
          policyVersionId: String(policy._id),
          proposalRevisionId: String(revision._id),
        }),
        reconciliationKey: `lender-portal-phase9:${migrationRun.runToken}:policy-assignment:${String(proposal._id)}`,
        runToken: migrationRun.runToken,
      });
    },
  });

/**
 * Candidate-bound approval reconciliation. A stored link is never replaced
 * when any proposal, tenant, assignment, cycle, revision, or policy boundary
 * conflicts. Missing links are added only from one exact canonical revision.
 */
export const reconcileLenderPortalPhase9ApprovalFacts = migrations.define({
  table: "proposalLenderApprovals",
  batchSize: 1,
  migrateOne: async (ctx, approval) => {
    const proposal = await ctx.db.get(approval.proposalId);
    if (!proposal) return;
    const migrationRun = await requireAuthorizedLenderPortalPhase9Migration(
      ctx,
      proposal
    );
    if (!migrationRun) return;
    const assignment = await ctx.db.get(approval.assignmentId);
    const cycle = approval.confirmationCycleId
      ? await ctx.db.get(approval.confirmationCycleId)
      : null;
    const ownershipMatches = Boolean(
      assignment &&
        (String(approval.lenderOrganizationId) ===
          String(assignment.lenderOrganizationId) ||
          String(approval.lenderOrganizationId) ===
            assignment.legacyLenderOrganizationId ||
          approval.legacyLenderOrganizationId ===
            assignment.legacyLenderOrganizationId)
    );
    if (
      approval.organizationId !== proposal.organizationId ||
      approval.brokerageId !== proposal.brokerageId ||
      !assignment ||
      assignment.proposalId !== proposal._id ||
      assignment.organizationId !== proposal.organizationId ||
      assignment.brokerageId !== proposal.brokerageId ||
      !ownershipMatches ||
      (approval.confirmationCycleId !== undefined &&
        (!cycle ||
          cycle.proposalId !== proposal._id ||
          cycle.organizationId !== proposal.organizationId ||
          cycle.brokerageId !== proposal.brokerageId ||
          cycle.assignmentId !== assignment._id ||
          (cycle.decisionId !== undefined && cycle.decisionId !== approval._id)))
    ) {
      await recordPhase3MigrationIssue(ctx, {
        brokerageId: proposal.brokerageId,
        organizationId: proposal.organizationId,
        proposalId: proposal._id,
        reason:
          "Approval ownership conflicts with proposal, organization, Brokerage, assignment, lender organization, or confirmation-cycle scope; no link was changed.",
        sourceRecordId: String(approval._id),
        sourceTable: "proposalLenderApprovals",
      });
      return;
    }
    if (
      (approval.proposalRevisionId === undefined) !==
      (approval.proposalRevisionNumber === undefined)
    ) {
      await recordPhase3MigrationIssue(ctx, {
        brokerageId: proposal.brokerageId,
        organizationId: proposal.organizationId,
        proposalId: proposal._id,
        reason:
          "Approval contains a contradictory partial revision pointer; no fallback link was applied.",
        sourceRecordId: String(approval._id),
        sourceTable: "proposalLenderApprovals",
      });
      return;
    }

    let revision: Doc<"proposalRevisions"> | null = null;
    if (
      approval.proposalRevisionId &&
      approval.proposalRevisionNumber !== undefined
    ) {
      revision = await ctx.db.get(approval.proposalRevisionId);
    } else if (cycle) {
      revision = await ctx.db.get(cycle.proposalRevisionId);
    } else {
      const decisionAt =
        approval.status === "approved"
          ? approval.approvedAt
          : approval.declinedAt;
      if (decisionAt === undefined) {
        await recordPhase3MigrationIssue(ctx, {
          brokerageId: proposal.brokerageId,
          organizationId: proposal.organizationId,
          proposalId: proposal._id,
          reason:
            "Approval has no explicit decision timestamp or confirmation-cycle revision; no fallback link was applied.",
          sourceRecordId: String(approval._id),
          sourceTable: "proposalLenderApprovals",
        });
        return;
      }
      const candidates = await ctx.db
        .query("proposalRevisions")
        .withIndex("by_assignment_and_created_at", (query) =>
          query.eq("assignmentId", assignment._id).lte("createdAt", decisionAt)
        )
        .order("desc")
        .take(2);
      if (
        candidates.length > 1 &&
        candidates[0]?.createdAt === candidates[1]?.createdAt
      ) {
        await recordPhase3MigrationIssue(ctx, {
          brokerageId: proposal.brokerageId,
          organizationId: proposal.organizationId,
          proposalId: proposal._id,
          reason:
            "Multiple exact assignment revisions share the approval decision boundary; no fallback link was applied.",
          sourceRecordId: String(approval._id),
          sourceTable: "proposalLenderApprovals",
        });
        return;
      }
      revision = candidates[0] ?? null;
    }
    const policy = revision
      ? await ctx.db.get(revision.reviewPolicyVersionId)
      : null;
    const revisionNumber =
      approval.proposalRevisionNumber ?? cycle?.proposalRevisionNumber;
    if (
      !revision ||
      revision.proposalId !== proposal._id ||
      revision.organizationId !== proposal.organizationId ||
      revision.brokerageId !== proposal.brokerageId ||
      revision.assignmentId !== assignment._id ||
      (revisionNumber !== undefined &&
        revision.revisionNumber !== revisionNumber) ||
      (cycle !== null && cycle.proposalRevisionId !== revision._id) ||
      !policy ||
      policy.proposalId !== proposal._id ||
      policy.organizationId !== proposal.organizationId ||
      policy.brokerageId !== proposal.brokerageId
    ) {
      await recordPhase3MigrationIssue(ctx, {
        brokerageId: proposal.brokerageId,
        organizationId: proposal.organizationId,
        proposalId: proposal._id,
        reason:
          "Approval revision or policy is not exact for the proposal, organization, Brokerage, assignment, and confirmation-cycle scope; no link was changed.",
        sourceRecordId: String(approval._id),
        sourceTable: "proposalLenderApprovals",
      });
      return;
    }

    const approvalPatch: {
      legacyLenderOrganizationId?: string;
      lenderOrganizationId?: Id<"lenderOrganizations"> | string;
      proposalRevisionId?: Id<"proposalRevisions">;
      proposalRevisionNumber?: number;
    } = {};
    if (
      String(approval.lenderOrganizationId) !==
      String(assignment.lenderOrganizationId)
    ) {
      approvalPatch.legacyLenderOrganizationId = String(
        approval.lenderOrganizationId
      );
      approvalPatch.lenderOrganizationId = assignment.lenderOrganizationId;
    }
    if (!approval.proposalRevisionId) {
      approvalPatch.proposalRevisionId = revision._id;
      approvalPatch.proposalRevisionNumber = revision.revisionNumber;
    }
    if (Object.keys(approvalPatch).length > 0) {
      await ctx.db.patch(approval._id, approvalPatch);
    }
    if (
      approval.status === "approved" &&
      (proposal.latestLenderReviewedRevisionNumber ?? 0) <=
        revision.revisionNumber
    ) {
      await ctx.db.patch(proposal._id, {
        latestLenderApprovalId: approval._id,
        latestLenderReviewedRevisionId: revision._id,
        latestLenderReviewedRevisionNumber: revision.revisionNumber,
      });
    }
    await resolvePhase3MigrationIssue(
      ctx,
      "proposalLenderApprovals",
      String(approval._id)
    );
    if (Object.keys(approvalPatch).length === 0) return;
    await recordPhase9MigrationAudit(ctx, proposal, {
      candidateSha: migrationRun.candidateSha,
      command: "reconcileLenderPortalPhase9ApprovalFacts",
      eventType: "lender_portal.migration.approval_reconciled",
      newState: JSON.stringify({
        approvalId: String(approval._id),
        proposalRevisionId: String(revision._id),
        proposalRevisionNumber: revision.revisionNumber,
      }),
      reconciliationKey: `lender-portal-phase9:${migrationRun.runToken}:approval:${String(approval._id)}`,
      runToken: migrationRun.runToken,
    });
  },
});

/**
 * Candidate-bound immutable policy-lock reconciliation. Existing canonical
 * history wins. A lock is created only when closing, policy, revision, and the
 * absence of lender quorum history are all exact and independently verifiable.
 */
export const reconcileLenderPortalPhase9PolicyLocks = migrations.define({
  table: "buildProposals",
  batchSize: 1,
  migrateOne: async (ctx, proposal) => {
    const migrationRun = await requireAuthorizedLenderPortalPhase9Migration(
      ctx,
      proposal
    );
    if (!migrationRun) return;
    if (proposal.status !== "closed") return;
    const [closings, locks, policy, revision, assignmentState] =
      await Promise.all([
        ctx.db
          .query("proposalClosings")
          .withIndex("by_proposal", (query) =>
            query.eq("proposalId", proposal._id)
          )
          .take(2),
        ctx.db
          .query("proposalReviewPolicyLocks")
          .withIndex("by_proposal", (query) =>
            query.eq("proposalId", proposal._id)
          )
          .take(2),
        proposal.currentReviewPolicyVersionId
          ? ctx.db.get(proposal.currentReviewPolicyVersionId)
          : null,
        proposal.currentProposalRevisionId
          ? ctx.db.get(proposal.currentProposalRevisionId)
          : null,
        getMigrationCurrentProposalAssignment(ctx, proposal._id),
      ]);
    const closing = closings[0];
    if (
      closings.length !== 1 ||
      !closing ||
      closing.organizationId !== proposal.organizationId ||
      closing.brokerageId !== proposal.brokerageId ||
      locks.length > 1 ||
      (proposal.lockedReviewPolicyId !== undefined &&
        closing.reviewPolicyLockId !== undefined &&
        proposal.lockedReviewPolicyId !== closing.reviewPolicyLockId)
    ) {
      await recordPhase3MigrationIssue(ctx, {
        brokerageId: proposal.brokerageId,
        organizationId: proposal.organizationId,
        proposalId: proposal._id,
        reason:
          "Policy-lock reconciliation has contradictory closing, lock pointer, tenant, or duplicate lock evidence; no link was changed.",
        sourceRecordId: String(proposal._id),
        sourceTable: "proposalClosings",
      });
      return;
    }
    let lock = proposal.lockedReviewPolicyId
      ? await ctx.db.get(proposal.lockedReviewPolicyId)
      : closing.reviewPolicyLockId
        ? await ctx.db.get(closing.reviewPolicyLockId)
        : locks[0] ?? null;
    let created = false;
    if (!lock) {
      if (
        assignmentState.kind !== "none" ||
        !policy ||
        !revision ||
        policy.proposalId !== proposal._id ||
        policy.organizationId !== proposal.organizationId ||
        policy.brokerageId !== proposal.brokerageId ||
        revision.proposalId !== proposal._id ||
        revision.organizationId !== proposal.organizationId ||
        revision.brokerageId !== proposal.brokerageId ||
        revision.reviewPolicyVersionId !== policy._id ||
        revision.assignmentId !== undefined
      ) {
        await recordPhase3MigrationIssue(ctx, {
          brokerageId: proposal.brokerageId,
          organizationId: proposal.organizationId,
          proposalId: proposal._id,
          reason:
            "Historical lender eligibility or exact policy/revision scope cannot be proven; no immutable policy lock was fabricated.",
          sourceRecordId: String(proposal._id),
          sourceTable: "proposalClosings",
        });
        return;
      }
      try {
        validateProposalReviewPolicyQuorums(policy.policy, {
          draw: 0,
          milestone: 0,
        });
      } catch (error) {
        await recordPhase3MigrationIssue(ctx, {
          brokerageId: proposal.brokerageId,
          organizationId: proposal.organizationId,
          proposalId: proposal._id,
          reason: `Stored review policy is invalid for a zero-lender historical denominator: ${
            error instanceof Error ? error.message : "unknown validation error"
          }`,
          sourceRecordId: String(proposal._id),
          sourceTable: "proposalClosings",
        });
        return;
      }
      const lockId = await ctx.db.insert("proposalReviewPolicyLocks", {
        activeLenderMemberCount: 0,
        brokerageId: proposal.brokerageId,
        eligibleLenderApproverCount: 0,
        eligibleLenderApproverCounts: {
          draw: 0,
          milestone: 0,
          proposalReview: 0,
        },
        idempotencyKey: `migration:phase9:${migrationRun.runToken}:policy-lock`,
        lockedAt: closing.closedAt,
        lockedByRole: closing.closedByRole,
        lockedByWorkosUserId: closing.closedByWorkosUserId,
        organizationId: proposal.organizationId,
        policy: policy.policy,
        policyVersionId: policy._id,
        proposalId: proposal._id,
        proposalRevisionId: revision._id,
        proposalRevisionNumber: revision.revisionNumber,
        reason:
          "Phase 9 exact-evidence reconciliation of the immutable closing policy lock.",
      });
      lock = await ctx.db.get(lockId);
      created = true;
    }
    if (!lock) {
      throw new Error("Phase 9 policy lock disappeared during reconciliation.");
    }
    const linked = await linkMigrationPolicyLock(ctx, proposal, closing, lock);
    if (!linked) return;
    await recordPhase9MigrationAudit(ctx, proposal, {
      candidateSha: migrationRun.candidateSha,
      command: "reconcileLenderPortalPhase9PolicyLocks",
      eventType: "lender_portal.migration.policy_lock_reconciled",
      newState: JSON.stringify({
        created,
        policyLockId: String(lock._id),
        proposalRevisionId: String(lock.proposalRevisionId),
      }),
      reconciliationKey: `lender-portal-phase9:${migrationRun.runToken}:policy-lock:${String(proposal._id)}`,
      runToken: migrationRun.runToken,
    });
  },
});

/**
 * Phase 9 repairs only lifecycle pointers and timestamps proven by canonical,
 * organization-scoped records. It never changes a proposal status and never
 * infers closing or activation from an approval.
 */
export const reconcileLenderPortalProposalLifecycle = migrations.define({
  table: "buildProposals",
  batchSize: 1,
  migrateOne: async (ctx, proposal) => {
    const migrationRun = await requireAuthorizedLenderPortalPhase9Migration(
      ctx,
      proposal
    );
    if (!migrationRun) return;
    const [closings, builds] = await Promise.all([
      ctx.db
        .query("proposalClosings")
        .withIndex("by_proposal", (query) =>
          query.eq("proposalId", proposal._id)
        )
        .take(2),
      ctx.db
        .query("activeBuilds")
        .withIndex("by_proposal", (query) =>
          query.eq("proposalId", proposal._id)
        )
        .take(2),
    ]);
    const patch: {
      activeBuildId?: Id<"activeBuilds">;
      closedAt?: number;
    } = {};
    const issues: Array<{
      reason: string;
      sourceRecordId: string;
      sourceTable: Phase3MigrationSourceTable;
    }> = [];

    if (proposal.status === "approved" || proposal.status === "closed") {
      if (!proposal.approvedAt) {
        issues.push({
          reason:
            "Approved proposal has no explicit approval timestamp; revision creation time is not approval evidence and no value was inferred.",
          sourceRecordId: String(proposal._id),
          sourceTable: "buildProposals",
        });
      }
    }

    if (proposal.status === "closed") {
      const closing = closings[0];
      if (
        closings.length !== 1 ||
        !closing ||
        closing.brokerageId !== proposal.brokerageId ||
        closing.organizationId !== proposal.organizationId
      ) {
        issues.push({
          reason:
            "Closed proposal closing evidence is missing, duplicated, or outside the proposal tenant scope.",
          sourceRecordId: String(proposal._id),
          sourceTable: "proposalClosings",
        });
      } else if (!proposal.closedAt) {
        patch.closedAt = closing.closedAt;
      } else if (proposal.closedAt !== closing.closedAt) {
        issues.push({
          reason:
            "Proposal and canonical closing timestamps disagree; existing history was not overwritten.",
          sourceRecordId: String(closing._id),
          sourceTable: "proposalClosings",
        });
      }

      if (builds.length > 1) {
        issues.push({
          reason:
            "Multiple active Builds reference one proposal; activation was not inferred.",
          sourceRecordId: String(proposal._id),
          sourceTable: "activeBuilds",
        });
      } else if (proposal.activeBuildId) {
        const pointedBuild = await ctx.db.get(proposal.activeBuildId);
        if (
          !pointedBuild ||
          pointedBuild.proposalId !== proposal._id ||
          pointedBuild.brokerageId !== proposal.brokerageId ||
          pointedBuild.organizationId !== proposal.organizationId ||
          (builds[0] && builds[0]._id !== pointedBuild._id)
        ) {
          issues.push({
            reason:
              "Proposal activation pointer is missing or outside the exact proposal tenant scope.",
            sourceRecordId: String(proposal.activeBuildId),
            sourceTable: "activeBuilds",
          });
        }
      } else if (
        builds[0] &&
        builds[0].brokerageId === proposal.brokerageId &&
        builds[0].organizationId === proposal.organizationId
      ) {
        patch.activeBuildId = builds[0]._id;
      }
    } else if (closings.length > 0 || builds.length > 0) {
      issues.push({
        reason:
          "A non-closed proposal has closing or active-Build evidence; lifecycle state requires operator reconciliation.",
        sourceRecordId: String(proposal._id),
        sourceTable: builds.length > 0 ? "activeBuilds" : "proposalClosings",
      });
    }

    for (const issue of issues) {
      await recordPhase3MigrationIssue(ctx, {
        brokerageId: proposal.brokerageId,
        organizationId: proposal.organizationId,
        proposalId: proposal._id,
        ...issue,
      });
    }
    if (Object.keys(patch).length === 0) return;

    await ctx.db.patch(proposal._id, patch);
    await recordPhase9MigrationAudit(ctx, proposal, {
      command: "reconcileLenderPortalProposalLifecycle",
      candidateSha: migrationRun.candidateSha,
      eventType: "lender_portal.migration.lifecycle_reconciled",
      newState: JSON.stringify({
        patchedFields: Object.keys(patch).sort(),
        proposalId: String(proposal._id),
      }),
      reconciliationKey: `lender-portal-phase9:${migrationRun.runToken}:lifecycle:${String(proposal._id)}`,
      runToken: migrationRun.runToken,
    });
  },
});

/** Rebuilds the existing proposal Kanban projection from canonical proposals. */
export const rebuildLenderPortalProposalKanbanProjection = migrations.define({
  table: "buildProposals",
  batchSize: 1,
  migrateOne: async (ctx, proposal) => {
    const migrationRun = await requireAuthorizedLenderPortalPhase9Migration(
      ctx,
      proposal
    );
    if (!migrationRun) return;
    const [builder, cards] = await Promise.all([
      proposal.builderProfileId ? ctx.db.get(proposal.builderProfileId) : null,
      ctx.db
        .query("proposalKanbanCards")
        .withIndex("by_proposal", (query) =>
          query.eq("proposalId", proposal._id)
        )
        .take(2),
    ]);
    if (
      builder &&
      (builder.brokerageId !== proposal.brokerageId ||
        builder.organizationId !== proposal.organizationId)
    ) {
      await recordPhase3MigrationIssue(ctx, {
        brokerageId: proposal.brokerageId,
        organizationId: proposal.organizationId,
        proposalId: proposal._id,
        reason:
          "Proposal Builder projection source is outside the proposal tenant scope; no card was rebuilt.",
        sourceRecordId: String(proposal._id),
        sourceTable: "buildProposals",
      });
      return;
    }
    if (cards.length > 1) {
      await recordPhase3MigrationIssue(ctx, {
        brokerageId: proposal.brokerageId,
        organizationId: proposal.organizationId,
        proposalId: proposal._id,
        reason:
          "Multiple proposal Kanban projections exist; migration stopped without deleting history.",
        sourceRecordId: String(proposal._id),
        sourceTable: "buildProposals",
      });
      return;
    }
    const projection = {
      brokerageId: proposal.brokerageId,
      builderName: builder?.displayName ?? "Unassigned builder",
      column: proposal.status,
      href: `/backoffice/proposals/${String(proposal._id)}`,
      organizationId: proposal.organizationId,
      proposalId: proposal._id,
      sortAt: proposal.updatedAt,
      subtitle: proposal.location,
      title: proposal.buildName,
      totalBudgetCents: proposal.totalBudgetCents,
      updatedAt: proposal.updatedAt,
    };
    const card = cards[0];
    const unchanged =
      card &&
      card.brokerageId === projection.brokerageId &&
      card.builderName === projection.builderName &&
      card.column === projection.column &&
      card.href === projection.href &&
      card.organizationId === projection.organizationId &&
      card.proposalId === projection.proposalId &&
      card.sortAt === projection.sortAt &&
      card.subtitle === projection.subtitle &&
      card.title === projection.title &&
      card.totalBudgetCents === projection.totalBudgetCents &&
      card.updatedAt === projection.updatedAt;
    if (unchanged) return;
    if (card) {
      await recordPhase3MigrationIssue(ctx, {
        brokerageId: proposal.brokerageId,
        organizationId: proposal.organizationId,
        proposalId: proposal._id,
        reason:
          "Existing Kanban projection contradicts the exact proposal, tenant, or canonical field snapshot; migration did not rewrite it.",
        sourceRecordId: String(card._id),
        sourceTable: "buildProposals",
      });
      return;
    } else {
      await ctx.db.insert("proposalKanbanCards", projection);
    }
    await recordPhase9MigrationAudit(ctx, proposal, {
      command: "rebuildLenderPortalProposalKanbanProjection",
      candidateSha: migrationRun.candidateSha,
      eventType: "lender_portal.migration.projection_rebuilt",
      newState: JSON.stringify({
        column: projection.column,
        created: !card,
        proposalId: String(proposal._id),
      }),
      reconciliationKey: `lender-portal-phase9:${migrationRun.runToken}:kanban:${String(proposal._id)}`,
      runToken: migrationRun.runToken,
    });
  },
});

async function recordPhase9MigrationAudit(
  ctx: MutationCtx,
  proposal: Doc<"buildProposals">,
  input: {
    candidateSha: string;
    command: string;
    eventType: string;
    newState: string;
    reconciliationKey: string;
    runToken: string;
  }
) {
  const fingerprint = await operationalRequestFingerprint({
    command: input.command,
    evidence: input.newState,
    proposalId: String(proposal._id),
  });
  const reconciliationKey = `${input.reconciliationKey}:${fingerprint}`;
  const existing = await ctx.db
    .query("auditEvents")
    .withIndex("by_organizationId_and_reconciliationKey", (query) =>
      query
        .eq("organizationId", proposal.organizationId)
        .eq("reconciliationKey", reconciliationKey)
    )
    .unique();
  if (existing) return;
  await ctx.db.insert("auditEvents", {
    actorRoles: ["system"],
    actorWorkosUserId: "system:lender-portal-phase9-migration",
    brokerageId: proposal.brokerageId,
    command: input.command,
    createdAt: Date.now(),
    drawFlowCorrelationId: fingerprint,
    entityId: String(proposal._id),
    entityType: "buildProposals",
    eventType: input.eventType,
    newState: JSON.stringify({
      candidateSha: input.candidateSha,
      evidence: JSON.parse(input.newState),
    }),
    organizationId: proposal.organizationId,
    phase9RunToken: input.runToken,
    reconciliationKey,
    warnings: [],
  });
}

export const runLenderPortalPhase9Migration = migrations.runner([
  internal.migrations.validateLenderPortalPhase9ApplyManifest,
  internal.migrations.reconcileLenderPortalPhase9PolicyAssignmentFacts,
  internal.migrations.reconcileLenderPortalPhase9ApprovalFacts,
  internal.migrations.reconcileLenderPortalPhase9PolicyLocks,
  internal.migrations.reconcileLenderPortalProposalLifecycle,
  internal.migrations.rebuildLenderPortalProposalKanbanProjection,
]);
