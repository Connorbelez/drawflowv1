import { Migrations } from "@convex-dev/migrations";

import { components, internal } from "./_generated/api.js";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx } from "./types.js";
import { hasAssignableBrokerRole } from "./brokerAssignments.js";
import { operationalRequestFingerprint } from "./build_operational_idempotency.js";
import { getLenderOrganizationApprovalEligibility } from "./lenderOrganizationAccess.js";
import {
  beginLenderPortalPhase9MigrationApply,
  requireAuthorizedLenderPortalPhase9Migration,
} from "./lender_portal_phase9.js";
import {
  validateProposalReviewPolicyQuorums,
} from "./lender_portal_phase3.js";
import {
  FAIRLEND_DEFAULT_BROKER_EMAIL,
  FAIRLEND_WORKOS_ORGANIZATION_ID,
} from "./fairLendConfig.js";
import schema from "./schema.js";

export const migrations = new Migrations(components.migrations, { schema });

/**
 * Establishes borrowerStartingCashCents as the canonical opening-balance field.
 * timelineStartingCashCents and borrowerWorkingCapitalLimitCents are legacy
 * sources only; neither represents a revolving spend-before-draw limit.
 */
export const backfillProposalBorrowerStartingCash = migrations.define({
  table: "buildProposals",
  migrateOne: (_ctx, proposal) => {
    if (proposal.borrowerStartingCashCents !== undefined) {
      return;
    }
    return {
      borrowerStartingCashCents: Math.max(
        0,
        Math.round(
          proposal.timelineStartingCashCents ??
            proposal.borrowerWorkingCapitalLimitCents
        )
      ),
    };
  },
});

export const backfillActiveBuildBorrowerStartingCash = migrations.define({
  table: "activeBuilds",
  migrateOne: async (ctx, build) => {
    if (build.borrowerStartingCashCents !== undefined) {
      return;
    }
    const proposal = await ctx.db.get(build.proposalId);
    return {
      borrowerStartingCashCents: Math.max(
        0,
        Math.round(
          build.timelineStartingCashCents ??
            proposal?.borrowerStartingCashCents ??
            proposal?.timelineStartingCashCents ??
            proposal?.borrowerWorkingCapitalLimitCents ??
            0
        )
      ),
    };
  },
});

export const backfillCapitalPlanBorrowerStartingCash = migrations.define({
  table: "buildCapitalPlans",
  migrateOne: (_ctx, plan) => {
    if (plan.borrowerStartingCashCents !== undefined) {
      return;
    }
    return {
      borrowerStartingCashCents: Math.max(
        0,
        Math.round(plan.borrowerWorkingCapitalLimitCents)
      ),
    };
  },
});

export const runBorrowerStartingCashCutover = migrations.runner([
  internal.migrations.backfillProposalBorrowerStartingCash,
  internal.migrations.backfillActiveBuildBorrowerStartingCash,
  internal.migrations.backfillCapitalPlanBorrowerStartingCash,
]);

/** Makes principal broker identity resilient to WorkOS account recreation. */
export const backfillBrokeragePrincipalBrokerEmail = migrations.define({
  table: "brokerages",
  migrateOne: async (ctx, brokerage) => {
    if (brokerage.principalBrokerEmail) {
      return;
    }
    if (brokerage.workosOrganizationId === FAIRLEND_WORKOS_ORGANIZATION_ID) {
      return { principalBrokerEmail: FAIRLEND_DEFAULT_BROKER_EMAIL };
    }
    if (!brokerage.principalBrokerWorkosUserId) {
      return;
    }
    const principalBrokerWorkosUserId = brokerage.principalBrokerWorkosUserId;

    const [projectedUsers, memberships] = await Promise.all([
      ctx.db
        .query("users")
        .withIndex("by_workos_user_id", (q) =>
          q.eq("workosUserId", principalBrokerWorkosUserId)
        )
        .collect(),
      ctx.db
        .query("workosOrganizationMemberships")
        .withIndex("by_user", (q) =>
          q.eq("workosUserId", principalBrokerWorkosUserId)
        )
        .collect(),
    ]);
    const broker = projectedUsers.sort(
      (a, b) =>
        (b.updatedAt ?? b._creationTime) - (a.updatedAt ?? a._creationTime)
    )[0];
    const eligibleMembership = memberships.find(
      (membership) =>
        membership.workosOrganizationId === brokerage.workosOrganizationId &&
        membership.status === "active" &&
        hasAssignableBrokerRole(membership)
    );
    const principalBrokerEmail = broker?.email.trim().toLowerCase();
    if (
      broker?.status !== "active" ||
      broker.emailVerified === false ||
      !eligibleMembership ||
      !principalBrokerEmail
    ) {
      return;
    }
    return { principalBrokerEmail };
  },
});

export const runBrokeragePrincipalBrokerEmailBackfill = migrations.runner([
  internal.migrations.backfillBrokeragePrincipalBrokerEmail,
]);

/**
 * Backfills the case-insensitive lookup key owned by the WorkOS user projection.
 * The matching index remains staged until this runner completes and the index is
 * reported ready by Convex; runtime reconciliation does not query the staged index.
 */
export const backfillWorkosUserNormalizedEmail = migrations.define({
  table: "users",
  migrateOne: (_ctx, user) => {
    const normalizedEmail = user.email.trim().toLowerCase();
    if (user.normalizedEmail === normalizedEmail) {
      return;
    }
    return { normalizedEmail };
  },
});

export const runWorkosUserNormalizedEmailBackfill = migrations.runner([
  internal.migrations.backfillWorkosUserNormalizedEmail,
]);

/** Preserves the legacy behavior where every cost item increased its milestone. */
export const backfillProposalCostItemBudgetTreatment = migrations.define({
  table: "proposalCostItems",
  migrateOne: (_ctx, item) => {
    if (item.budgetTreatment !== undefined) {
      return;
    }
    return { budgetTreatment: "add" as const };
  },
});

export const backfillBuildCostItemBudgetTreatment = migrations.define({
  table: "buildCostItems",
  migrateOne: (_ctx, item) => {
    if (item.budgetTreatment !== undefined) {
      return;
    }
    return { budgetTreatment: "add" as const };
  },
});

export const runCostItemBudgetTreatmentBackfill = migrations.runner([
  internal.migrations.backfillProposalCostItemBudgetTreatment,
  internal.migrations.backfillBuildCostItemBudgetTreatment,
]);

type LegacyLenderSource =
  | "proposalLenderAssignments"
  | "proposalLenderApprovals";

/**
 * Resolve one legacy WorkOS-derived lender identifier into the application
 * organization under its existing lender Brokerage. This migration is
 * additive and intentionally leaves unresolved rows as reconciliation
 * candidates instead of guessing across tenants.
 */
async function materializeLegacyLenderOrganization(
  ctx: MutationCtx,
  input: {
    brokerageId?: Id<"brokerages">;
    legacyWorkosOrganizationId: string;
    organizationId: string;
    snapshotName?: string;
    sourceTable: LegacyLenderSource;
    sourceRecordId: string;
  }
): Promise<Id<"lenderOrganizations"> | null> {
  let currentOrganization = null;
  try {
    currentOrganization = await ctx.db.get(
      input.legacyWorkosOrganizationId as Id<"lenderOrganizations">
    );
  } catch {
    // WorkOS organization IDs are not Convex IDs. Treat an invalid Convex ID
    // shape as a legacy value and continue with the grouped cutover.
  }
  if (currentOrganization) {
    if (
      input.brokerageId &&
      currentOrganization.brokerageId === input.brokerageId &&
      currentOrganization.status === "active"
    ) {
      return currentOrganization._id;
    }
    await recordLenderReconciliationCandidate(
      ctx,
      input,
      input.brokerageId,
      currentOrganization.status !== "active"
        ? "The legacy lender identifier resolves to an inactive application-owned Lender Organization."
        : "The legacy lender identifier resolves outside its recorded lender Brokerage."
    );
    return null;
  }

  const brokerage = input.brokerageId
    ? await ctx.db.get(input.brokerageId)
    : null;
  if (!brokerage) {
    await recordLenderReconciliationCandidate(
      ctx,
      input,
      undefined,
      "The legacy lender assignment has no resolvable parent Brokerage."
    );
    return null;
  }

  const existing = await ctx.db
    .query("lenderOrganizations")
    .withIndex("by_brokerage_and_legacy_workos_organization", (query) =>
      query
        .eq("brokerageId", brokerage._id)
        .eq("legacyWorkosOrganizationId", input.legacyWorkosOrganizationId)
    )
    .take(2);
  if (existing.length === 1 && existing[0]?.status === "active") {
    return existing[0]._id;
  }
  await recordLenderReconciliationCandidate(
    ctx,
    input,
    brokerage._id,
    existing.length > 1
      ? "Multiple application-owned Lender Organizations match the legacy identifier."
      : existing[0]
        ? "The matching application-owned Lender Organization is inactive."
        : "No application-owned Lender Organization verifies the legacy identifier; WorkOS projection data is not migration authority."
  );
  return null;
}

async function recordLenderReconciliationCandidate(
  ctx: MutationCtx,
  input: {
    brokerageId?: Id<"brokerages">;
    legacyWorkosOrganizationId: string;
    organizationId: string;
    snapshotName?: string;
    sourceTable: LegacyLenderSource;
    sourceRecordId: string;
  },
  brokerageId: Id<"brokerages"> | undefined,
  reason: string
) {
  const existing = await ctx.db
    .query("lenderOrganizationReconciliationCandidates")
    .withIndex("by_scope_source", (query) =>
      query
        .eq("brokerageId", brokerageId ?? input.brokerageId)
        .eq("organizationId", input.organizationId)
        .eq("sourceTable", input.sourceTable)
        .eq("sourceRecordId", input.sourceRecordId)
    )
    .take(2);
  if (existing.length > 1) {
    throw new Error(
      "Lender reconciliation candidate scope contains contradictory duplicates."
    );
  }
  if (existing[0]?.status === "open") {
    return;
  }
  const now = Date.now();
  await ctx.db.insert("lenderOrganizationReconciliationCandidates", {
    brokerageId: brokerageId ?? input.brokerageId,
    legacyWorkosOrganizationId: input.legacyWorkosOrganizationId,
    organizationId: input.organizationId,
    sourceTable: input.sourceTable,
    sourceRecordId: input.sourceRecordId,
    snapshotName: input.snapshotName,
    status: "open",
    reason,
    createdAt: now,
    updatedAt: now,
  });
}

export const backfillLegacyProposalLenderAssignmentOrganizations =
  migrations.define({
    table: "proposalLenderAssignments",
    migrateOne: async (ctx, assignment) => {
      let currentOrganization = null;
      try {
        currentOrganization = await ctx.db.get(
          assignment.lenderOrganizationId as Id<"lenderOrganizations">
        );
      } catch {
        // Legacy WorkOS IDs are not Convex IDs.
      }
      if (currentOrganization) {
        return;
      }

      const lenderOrganizationId = await materializeLegacyLenderOrganization(
        ctx,
        {
          brokerageId: assignment.lenderBrokerageId,
          legacyWorkosOrganizationId: String(assignment.lenderOrganizationId),
          organizationId: assignment.organizationId,
          snapshotName: assignment.lenderOrganizationName,
          sourceTable: "proposalLenderAssignments",
          sourceRecordId: String(assignment._id),
        }
      );
      if (!lenderOrganizationId) {
        return;
      }
      return {
        lenderOrganizationId,
        legacyLenderOrganizationId: String(assignment.lenderOrganizationId),
      };
    },
  });

export const backfillLegacyProposalLenderApprovalOrganizations =
  migrations.define({
    table: "proposalLenderApprovals",
    migrateOne: async (ctx, approval) => {
      let currentOrganization = null;
      try {
        currentOrganization = await ctx.db.get(
          approval.lenderOrganizationId as Id<"lenderOrganizations">
        );
      } catch {
        // Legacy WorkOS IDs are not Convex IDs.
      }
      if (currentOrganization) {
        return;
      }

      const assignment = await ctx.db.get(approval.assignmentId);
      const lenderOrganizationId = assignment
        ? await materializeLegacyLenderOrganization(ctx, {
            brokerageId: assignment.lenderBrokerageId,
            legacyWorkosOrganizationId: String(approval.lenderOrganizationId),
            organizationId: approval.organizationId,
            snapshotName: assignment.lenderOrganizationName,
            sourceTable: "proposalLenderApprovals",
            sourceRecordId: String(approval._id),
          })
        : null;
      if (!lenderOrganizationId) {
        await recordLenderReconciliationCandidate(
          ctx,
          {
            brokerageId: approval.brokerageId,
            legacyWorkosOrganizationId: String(approval.lenderOrganizationId),
            organizationId: approval.organizationId,
            sourceTable: "proposalLenderApprovals",
            sourceRecordId: String(approval._id),
          },
          undefined,
          "The lender approval references an assignment that is unavailable."
        );
        return;
      }
      return {
        lenderOrganizationId,
        legacyLenderOrganizationId: String(approval.lenderOrganizationId),
      };
    },
  });

export const runLegacyLenderOrganizationCutover = migrations.runner([
  internal.migrations.backfillLegacyProposalLenderAssignmentOrganizations,
  internal.migrations.backfillLegacyProposalLenderApprovalOrganizations,
]);

type Phase3MigrationSourceTable =
  | "buildProposals"
  | "proposalLenderAssignments"
  | "proposalLenderApprovals"
  | "proposalClosings"
  | "activeBuilds";

async function recordPhase3MigrationIssue(
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

async function resolvePhase3MigrationIssue(
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

async function getMigrationCurrentProposalAssignment(
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

async function ensureMigrationPolicyVersion(ctx: MutationCtx, proposal: Doc<"buildProposals">) {
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

async function ensureMigrationProposalRevision(
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

async function linkMigrationPolicyLock(
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
