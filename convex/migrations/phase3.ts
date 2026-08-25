import { internal } from "../_generated/api.js";
import type { Doc, Id } from "../_generated/dataModel";
import { operationalRequestFingerprint } from "../build_operational_idempotency.js";
import { getLenderOrganizationApprovalEligibility } from "../lenderOrganizationAccess.js";
import { validateProposalReviewPolicyQuorums } from "../lender_portal_phase3.js";
import type { MutationCtx } from "../types.js";
import { migrations } from "./context";

export type Phase3MigrationSourceTable =
  | "buildProposals"
  | "proposalLenderAssignments"
  | "proposalLenderApprovals"
  | "proposalClosings"
  | "activeBuilds";

export async function recordPhase3MigrationIssue(
  ctx: MutationCtx,
  input: {
    brokerageId: Id<"brokerages">;
    organizationId: string;
    proposalId: Id<"buildProposals">;
    reason: string;
    sourceRecordId: string;
    sourceTable: Phase3MigrationSourceTable;
  }
) {
  const existing = await ctx.db
    .query("proposalPhase3MigrationIssues")
    .withIndex("by_source_table_and_record", (query) =>
      query
        .eq("sourceTable", input.sourceTable)
        .eq("sourceRecordId", input.sourceRecordId)
    )
    .take(2);
  const now = Date.now();
  if (existing.length > 0) {
    for (const issue of existing) {
      if (
        issue.status === "resolved" &&
        issue.resolutionMode === "operator_activation_override"
      ) {
        continue;
      }
      await ctx.db.patch(issue._id, {
        reason: input.reason,
        status: "open",
        updatedAt: now,
      });
    }
    return;
  }
  await ctx.db.insert("proposalPhase3MigrationIssues", {
    brokerageId: input.brokerageId,
    createdAt: now,
    organizationId: input.organizationId,
    proposalId: input.proposalId,
    reason: input.reason,
    sourceRecordId: input.sourceRecordId,
    sourceTable: input.sourceTable,
    status: "open",
    updatedAt: now,
  });
}

export async function resolvePhase3MigrationIssue(
  ctx: MutationCtx,
  sourceTable: Phase3MigrationSourceTable,
  sourceRecordId: string
) {
  const issues = await ctx.db
    .query("proposalPhase3MigrationIssues")
    .withIndex("by_source_table_and_record", (query) =>
      query.eq("sourceTable", sourceTable).eq("sourceRecordId", sourceRecordId)
    )
    .take(2);
  for (const issue of issues) {
    if (issue.status === "open") {
      await ctx.db.patch(issue._id, {
        status: "resolved",
        updatedAt: Date.now(),
      });
    }
  }
}

export async function getMigrationCurrentProposalAssignment(
  ctx: MutationCtx,
  proposalId: Id<"buildProposals">
) {
  const assignments = await ctx.db
    .query("proposalLenderAssignments")
    .withIndex("by_proposal_status", (query) =>
      query.eq("proposalId", proposalId).eq("status", "current")
    )
    .take(2);
  if (assignments.length > 1) return { kind: "ambiguous" as const, assignments };
  if (assignments[0]) return { kind: "one" as const, assignment: assignments[0] };
  return { kind: "none" as const };
}

export async function ensureMigrationPolicyVersion(ctx: MutationCtx, proposal: Doc<"buildProposals">) {
  if (proposal.currentReviewPolicyVersionId) {
    const pointed = await ctx.db.get(proposal.currentReviewPolicyVersionId);
    if (
      pointed?.proposalId === proposal._id &&
      pointed.organizationId === proposal.organizationId &&
      pointed.brokerageId === proposal.brokerageId
    ) {
      return pointed;
    }
    return null;
  }
  const existing = await ctx.db
    .query("proposalReviewPolicyVersions")
    .withIndex("by_proposal_and_version", (query) =>
      query.eq("proposalId", proposal._id)
    )
    .order("desc")
    .take(2);
  if (
    existing[0] &&
    existing[0].organizationId === proposal.organizationId &&
    existing[0].brokerageId === proposal.brokerageId &&
    existing[0].version !== existing[1]?.version
  ) {
    return existing[0];
  }
  return null;
}

export async function ensureMigrationProposalRevision(
  ctx: MutationCtx,
  proposal: Doc<"buildProposals">,
  policyVersion: Doc<"proposalReviewPolicyVersions">,
) {
  const assignmentState = await getMigrationCurrentProposalAssignment(ctx, proposal._id);
  if (assignmentState.kind === "ambiguous") return null;
  const assignment = assignmentState.kind === "one" ? assignmentState.assignment : null;
  if (proposal.currentProposalRevisionId) {
    const pointed = await ctx.db.get(proposal.currentProposalRevisionId);
    if (
      pointed?.proposalId === proposal._id &&
      pointed.organizationId === proposal.organizationId &&
      pointed.brokerageId === proposal.brokerageId &&
      pointed.revisionNumber === proposal.currentProposalRevisionNumber &&
      pointed.reviewPolicyVersionId === policyVersion._id &&
      pointed.assignmentId === assignment?._id
    ) {
      return pointed;
    }
    return null;
  }
  const existing = await ctx.db
    .query("proposalRevisions")
    .withIndex("by_proposal_and_revision_number", (query) =>
      query.eq("proposalId", proposal._id)
    )
    .order("desc")
    .take(2);
  if (
    existing[0]?.reviewPolicyVersionId === policyVersion._id &&
    existing[0].assignmentId === assignment?._id &&
    existing[0].organizationId === proposal.organizationId &&
    existing[0].brokerageId === proposal.brokerageId &&
    existing[0].revisionNumber !== existing[1]?.revisionNumber
  ) {
    return existing[0];
  }
  return null;
}

export const backfillProposalPhase3PolicyAndRevision = migrations.define({
  table: "buildProposals",
  batchSize: 1,
  migrateOne: async (ctx, proposal) => {
    if (proposal.status !== "approved" && proposal.status !== "closed") {
      return;
    }
    const policyVersion = await ensureMigrationPolicyVersion(ctx, proposal);
    const revision = policyVersion
      ? await ensureMigrationProposalRevision(ctx, proposal, policyVersion)
      : null;
    if (!policyVersion || !revision) {
      await recordPhase3MigrationIssue(ctx, {
        brokerageId: proposal.brokerageId,
        organizationId: proposal.organizationId,
        proposalId: proposal._id,
        reason:
          "A default policy or initial revision could not be derived from verifiable proposal fields.",
        sourceRecordId: String(proposal._id),
        sourceTable: "buildProposals",
      });
      return;
    }
    await ctx.db.patch(proposal._id, {
      currentProposalRevisionId: revision._id,
      currentProposalRevisionNumber: revision.revisionNumber,
      currentReviewPolicyVersionId: policyVersion._id,
    });
    await resolvePhase3MigrationIssue(
      ctx,
      "buildProposals",
      String(proposal._id)
    );
  },
});

export const backfillProposalPhase3ApprovalRevision = migrations.define({
  table: "proposalLenderApprovals",
  batchSize: 25,
  migrateOne: async (ctx, approval) => {
    const [proposal, assignment] = await Promise.all([
      ctx.db.get(approval.proposalId),
      ctx.db.get(approval.assignmentId),
    ]);
    if (!proposal) return;
    if (
      approval.organizationId !== proposal.organizationId ||
      approval.brokerageId !== proposal.brokerageId ||
      !assignment ||
      assignment.proposalId !== proposal._id ||
      assignment.organizationId !== proposal.organizationId ||
      assignment.brokerageId !== proposal.brokerageId
    ) {
      await recordPhase3MigrationIssue(ctx, {
        brokerageId: proposal.brokerageId,
        organizationId: proposal.organizationId,
        proposalId: proposal._id,
        reason:
          "Approval, assignment, proposal, organization, and Brokerage scope do not match; no revision link was changed.",
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
    if (
      approval.proposalRevisionId &&
      approval.proposalRevisionNumber !== undefined
    ) {
      const linked = await ctx.db.get(approval.proposalRevisionId);
      const linkedPolicy = linked
        ? await ctx.db.get(linked.reviewPolicyVersionId)
        : null;
      if (
        linked?.proposalId === approval.proposalId &&
        linked.organizationId === proposal.organizationId &&
        linked.brokerageId === proposal.brokerageId &&
        linked.assignmentId === approval.assignmentId &&
        linked.revisionNumber === approval.proposalRevisionNumber &&
        linkedPolicy?.proposalId === proposal._id &&
        linkedPolicy.organizationId === proposal.organizationId &&
        linkedPolicy.brokerageId === proposal.brokerageId
      ) {
        if (approval.status === "approved") {
          if (
            (proposal.latestLenderReviewedRevisionNumber ?? 0) <= linked.revisionNumber
          ) {
            await ctx.db.patch(proposal._id, {
              latestLenderApprovalId: approval._id,
              latestLenderReviewedRevisionId: linked._id,
              latestLenderReviewedRevisionNumber: linked.revisionNumber,
            });
          }
        }
        await resolvePhase3MigrationIssue(
          ctx,
          "proposalLenderApprovals",
          String(approval._id)
        );
        return;
      }
      await recordPhase3MigrationIssue(ctx, {
        brokerageId: proposal.brokerageId,
        organizationId: proposal.organizationId,
        proposalId: proposal._id,
        reason:
          "Stored approval revision pointer conflicts with proposal, assignment, policy, organization, or Brokerage scope; it was not overwritten.",
        sourceRecordId: String(approval._id),
        sourceTable: "proposalLenderApprovals",
      });
      return;
    }
    const decisionAt =
      approval.approvedAt ?? approval.declinedAt ?? approval.createdAt;
    const revisionCandidates = await ctx.db
      .query("proposalRevisions")
      .withIndex("by_assignment_and_created_at", (query) =>
        query.eq("assignmentId", approval.assignmentId).lte("createdAt", decisionAt),
      )
      .order("desc")
      .take(2);
    const revision = revisionCandidates[0];
    const revisionPolicy = revision
      ? await ctx.db.get(revision.reviewPolicyVersionId)
      : null;
    if (
      !revision ||
      revision.proposalId !== proposal._id ||
      revision.organizationId !== proposal.organizationId ||
      revision.brokerageId !== proposal.brokerageId ||
      revision.assignmentId !== assignment._id ||
      !revisionPolicy ||
      revisionPolicy.proposalId !== proposal._id ||
      revisionPolicy.organizationId !== proposal.organizationId ||
      revisionPolicy.brokerageId !== proposal.brokerageId
    ) {
      await recordPhase3MigrationIssue(ctx, {
        brokerageId: proposal.brokerageId,
        organizationId: proposal.organizationId,
        proposalId: proposal._id,
        reason:
          "No exact assignment-, policy-, proposal-, organization-, and Brokerage-scoped revision existed at the recorded decision time.",
        sourceRecordId: String(approval._id),
        sourceTable: "proposalLenderApprovals",
      });
      return;
    }
    if (
      revisionCandidates.length > 1 &&
      revisionCandidates[1]?.createdAt === revision.createdAt
    ) {
      await recordPhase3MigrationIssue(ctx, {
        brokerageId: proposal.brokerageId,
        organizationId: proposal.organizationId,
        proposalId: proposal._id,
        reason:
          "Multiple assignment-scoped proposal revisions share the same creation time at the recorded decision boundary; approval linkage requires operator reconciliation.",
        sourceRecordId: String(approval._id),
        sourceTable: "proposalLenderApprovals",
      });
      return;
    }
    await ctx.db.patch(approval._id, {
      proposalRevisionId: revision._id,
      proposalRevisionNumber: revision.revisionNumber,
    });
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
  },
});

export async function linkMigrationPolicyLock(
  ctx: MutationCtx,
  proposal: Doc<"buildProposals">,
  closing: Doc<"proposalClosings">,
  lock: Doc<"proposalReviewPolicyLocks">,
) {
  const [policy, revision, assignment, build] = await Promise.all([
    ctx.db.get(lock.policyVersionId),
    ctx.db.get(lock.proposalRevisionId),
    lock.assignmentId ? ctx.db.get(lock.assignmentId) : null,
    proposal.activeBuildId ? ctx.db.get(proposal.activeBuildId) : null,
  ]);
  const policySnapshotMatches = policy
    ? (await operationalRequestFingerprint(lock.policy)) ===
      (await operationalRequestFingerprint(policy.policy))
    : false;
  if (
    closing.proposalId !== proposal._id ||
    closing.organizationId !== proposal.organizationId ||
    closing.brokerageId !== proposal.brokerageId ||
    lock.proposalId !== proposal._id ||
    lock.organizationId !== proposal.organizationId ||
    lock.brokerageId !== proposal.brokerageId ||
    proposal.currentReviewPolicyVersionId !== lock.policyVersionId ||
    proposal.currentProposalRevisionId !== lock.proposalRevisionId ||
    proposal.currentProposalRevisionNumber !== lock.proposalRevisionNumber ||
    !policy ||
    policy.proposalId !== proposal._id ||
    policy.organizationId !== proposal.organizationId ||
    policy.brokerageId !== proposal.brokerageId ||
    !revision ||
    revision.proposalId !== proposal._id ||
    revision.organizationId !== proposal.organizationId ||
    revision.brokerageId !== proposal.brokerageId ||
    revision.reviewPolicyVersionId !== policy._id ||
    revision.revisionNumber !== lock.proposalRevisionNumber ||
    !policySnapshotMatches ||
    (proposal.lockedReviewPolicyId !== undefined &&
      proposal.lockedReviewPolicyId !== lock._id) ||
    (closing.reviewPolicyLockId !== undefined &&
      closing.reviewPolicyLockId !== lock._id) ||
    (lock.assignmentId !== undefined &&
      (!assignment ||
        assignment.proposalId !== proposal._id ||
        assignment.organizationId !== proposal.organizationId ||
        assignment.brokerageId !== proposal.brokerageId ||
        revision.assignmentId !== assignment._id ||
        String(lock.lenderOrganizationId) !==
          String(assignment.lenderOrganizationId))) ||
    (lock.assignmentId === undefined && revision.assignmentId !== undefined) ||
    (proposal.activeBuildId !== undefined &&
      (!build ||
        build.proposalId !== proposal._id ||
        build.organizationId !== proposal.organizationId ||
        build.brokerageId !== proposal.brokerageId ||
        (build.reviewPolicyLockId !== undefined &&
          build.reviewPolicyLockId !== lock._id)))
  ) {
    await recordPhase3MigrationIssue(ctx, {
      brokerageId: proposal.brokerageId,
      organizationId: proposal.organizationId,
      proposalId: proposal._id,
      reason:
        "Policy lock, closing, policy, revision, assignment, organization, and Brokerage scope do not match; no linkage was changed.",
      sourceRecordId: String(proposal._id),
      sourceTable: "proposalClosings",
    });
    return false;
  }
  await ctx.db.patch(proposal._id, { lockedReviewPolicyId: lock._id });
  await ctx.db.patch(closing._id, { reviewPolicyLockId: lock._id });
  if (build) {
      await ctx.db.patch(build._id, {
        reviewPolicyLockEvidence: {
          activeLenderMemberCount: lock.activeLenderMemberCount,
          assignmentId: lock.assignmentId ?? null,
          eligibleLenderApproverCount:
            lock.eligibleLenderApproverCount ?? lock.activeLenderMemberCount,
          eligibleLenderApproverCounts: lock.eligibleLenderApproverCounts,
          lenderOrganizationId: lock.lenderOrganizationId ?? null,
          lockedAt: lock.lockedAt,
          lockedByWorkosUserId: lock.lockedByWorkosUserId,
          policyVersionId: lock.policyVersionId,
          proposalRevisionId: lock.proposalRevisionId,
          proposalRevisionNumber: lock.proposalRevisionNumber,
        },
        reviewPolicyLockId: lock._id,
        reviewPolicySnapshot: lock.policy,
      });
      await resolvePhase3MigrationIssue(
        ctx,
        "activeBuilds",
        String(build._id)
      );
  }
  await resolvePhase3MigrationIssue(
    ctx,
    "proposalClosings",
    String(proposal._id)
  );
  return true;
}

export const backfillProposalPhase3PolicyLock = migrations.define({
  table: "buildProposals",
  batchSize: 1,
  migrateOne: async (ctx, proposal) => {
    if (proposal.status !== "closed") {
      return;
    }
    const closings = await ctx.db
      .query("proposalClosings")
      .withIndex("by_proposal", (query) =>
        query.eq("proposalId", proposal._id)
      )
      .take(2);
    if (closings.length !== 1) {
      await recordPhase3MigrationIssue(ctx, {
        brokerageId: proposal.brokerageId,
        organizationId: proposal.organizationId,
        proposalId: proposal._id,
        reason: "Closed proposal closing evidence is missing or ambiguous.",
        sourceRecordId: String(proposal._id),
        sourceTable: "proposalClosings",
      });
      return;
    }
    if (proposal.lockedReviewPolicyId) {
      const storedLock = await ctx.db.get(proposal.lockedReviewPolicyId);
      if (storedLock?.proposalId === proposal._id) {
        await linkMigrationPolicyLock(ctx, proposal, closings[0], storedLock);
        return;
      }
    }
    const policyVersion = proposal.currentReviewPolicyVersionId
      ? await ctx.db.get(proposal.currentReviewPolicyVersionId)
      : null;
    const revision = proposal.currentProposalRevisionId
      ? await ctx.db.get(proposal.currentProposalRevisionId)
      : null;
    if (
      !policyVersion ||
      !revision ||
      policyVersion.proposalId !== proposal._id ||
      policyVersion.organizationId !== proposal.organizationId ||
      policyVersion.brokerageId !== proposal.brokerageId ||
      revision.proposalId !== proposal._id ||
      revision.organizationId !== proposal.organizationId ||
      revision.brokerageId !== proposal.brokerageId ||
      revision.reviewPolicyVersionId !== policyVersion._id
    ) {
      await recordPhase3MigrationIssue(ctx, {
        brokerageId: proposal.brokerageId,
        organizationId: proposal.organizationId,
        proposalId: proposal._id,
        reason: "Closed proposal lock prerequisites are missing or ambiguous.",
        sourceRecordId: String(proposal._id),
        sourceTable: "proposalClosings",
      });
      return;
    }
    const assignmentState = await getMigrationCurrentProposalAssignment(
      ctx,
      proposal._id
    );
    if (assignmentState.kind === "ambiguous") {
      await recordPhase3MigrationIssue(ctx, {
        brokerageId: proposal.brokerageId,
        organizationId: proposal.organizationId,
        proposalId: proposal._id,
        reason: "Closed proposal has multiple current lender assignments; no policy lock was fabricated.",
        sourceRecordId: String(proposal._id),
        sourceTable: "proposalClosings",
      });
      return;
    }
    const assignment = assignmentState.kind === "one" ? assignmentState.assignment : null;
    if (assignment) {
      const lenderOrganizationId = ctx.db.normalizeId(
        "lenderOrganizations",
        String(assignment.lenderOrganizationId),
      );
      if (lenderOrganizationId) {
        try {
          await getLenderOrganizationApprovalEligibility(ctx, lenderOrganizationId);
        } catch (error) {
          await recordPhase3MigrationIssue(ctx, {
            brokerageId: proposal.brokerageId,
            organizationId: proposal.organizationId,
            proposalId: proposal._id,
            reason: `Current eligibility inspection exceeded its safe operational boundary; no historical policy lock was fabricated: ${
              error instanceof Error ? error.message : "unknown eligibility error"
            }`,
            sourceRecordId: String(proposal._id),
            sourceTable: "proposalClosings",
          });
          return;
        }
      }
      await recordPhase3MigrationIssue(ctx, {
        brokerageId: proposal.brokerageId,
        organizationId: proposal.organizationId,
        proposalId: proposal._id,
        reason: "Historical lender quorum membership at closing cannot be proven from current projections; no policy lock was fabricated.",
        sourceRecordId: String(proposal._id),
        sourceTable: "proposalClosings",
      });
      return;
    }
    try {
      validateProposalReviewPolicyQuorums(
        policyVersion.policy,
        { draw: 0, milestone: 0 },
      );
    } catch (error) {
      await recordPhase3MigrationIssue(ctx, {
        brokerageId: proposal.brokerageId,
        organizationId: proposal.organizationId,
        proposalId: proposal._id,
        reason: `Stored review policy is not valid for the approval-eligible lender denominator: ${
          error instanceof Error ? error.message : "unknown validation error"
        }`,
        sourceRecordId: String(proposal._id),
        sourceTable: "proposalClosings",
      });
      return;
    }
    const closing = closings[0];
    const existing = await ctx.db
      .query("proposalReviewPolicyLocks")
      .withIndex("by_proposal_and_idempotency_key", (query) =>
        query
          .eq("proposalId", proposal._id)
          .eq("idempotencyKey", "migration:phase3:policy-lock")
      )
      .unique();
    const policyLockId =
      existing?._id ??
      (await ctx.db.insert("proposalReviewPolicyLocks", {
        activeLenderMemberCount: 0,
        brokerageId: proposal.brokerageId,
        eligibleLenderApproverCount: 0,
        eligibleLenderApproverCounts: { draw: 0, milestone: 0, proposalReview: 0 },
        idempotencyKey: "migration:phase3:policy-lock",
        lockedAt: closing.closedAt,
        lockedByRole: closing.closedByRole,
        lockedByWorkosUserId: closing.closedByWorkosUserId,
        organizationId: proposal.organizationId,
        policy: policyVersion.policy,
        policyVersionId: policyVersion._id,
        proposalId: proposal._id,
        proposalRevisionId: revision._id,
        proposalRevisionNumber: revision.revisionNumber,
        reason:
          "Backfill the immutable Phase 3 policy lock from closing evidence.",
      }));
    const policyLock = await ctx.db.get(policyLockId);
    if (!policyLock) {
      throw new Error("Phase 3 migration policy lock is unavailable.");
    }
    await linkMigrationPolicyLock(ctx, proposal, closing, policyLock);
  },
});

export const runProposalPhase3LifecycleBackfill = migrations.runner([
  internal.migrations.backfillProposalPhase3PolicyAndRevision,
  internal.migrations.backfillProposalPhase3ApprovalRevision,
  internal.migrations.backfillProposalPhase3PolicyLock,
]);

/** Persist the exact authorized manifest boundary before any Phase 9 write. */
