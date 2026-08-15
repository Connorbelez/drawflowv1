import { Migrations } from "@convex-dev/migrations";

import { components, internal } from "./_generated/api.js";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx } from "./types.js";
import { hasAssignableBrokerRole } from "./brokerAssignments.js";
import { operationalRequestFingerprint } from "./build_operational_idempotency.js";
import { getLenderOrganizationApprovalEligibility } from "./lenderOrganizationAccess.js";
import {
  DEFAULT_PROPOSAL_REVIEW_POLICY,
  type ProposalReviewPolicySnapshot,
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
    return currentOrganization._id;
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
    .take(1);
  if (existing[0]) {
    return existing[0]._id;
  }

  const workosOrganization = await ctx.db
    .query("workosOrganizations")
    .withIndex("by_workos_organization_id", (query) =>
      query.eq("workosOrganizationId", input.legacyWorkosOrganizationId)
    )
    .take(1);
  const displayName =
    workosOrganization[0]?.name?.trim() ||
    input.snapshotName?.trim() ||
    `Legacy lender organization ${input.legacyWorkosOrganizationId}`;
  const now = Date.now();
  return await ctx.db.insert("lenderOrganizations", {
    brokerageId: brokerage._id,
    legalName: displayName,
    displayName,
    legacyWorkosOrganizationId: input.legacyWorkosOrganizationId,
    status: "active",
    permissions: {
      proposalReview: true,
      milestoneDecisions: true,
      drawDecisions: true,
      siteVisitReview: true,
    },
    createdAt: now,
    updatedAt: now,
  });
}

async function recordLenderReconciliationCandidate(
  ctx: MutationCtx,
  input: {
    brokerageId?: Id<"brokerages">;
    legacyWorkosOrganizationId: string;
    snapshotName?: string;
    sourceTable: LegacyLenderSource;
    sourceRecordId: string;
  },
  brokerageId: Id<"brokerages"> | undefined,
  reason: string
) {
  const existing = await ctx.db
    .query("lenderOrganizationReconciliationCandidates")
    .withIndex("by_legacy_workos_organization", (query) =>
      query.eq("legacyWorkosOrganizationId", input.legacyWorkosOrganizationId)
    )
    .collect();
  if (
    existing.some(
      (candidate) =>
        candidate.sourceTable === input.sourceTable &&
        candidate.sourceRecordId === input.sourceRecordId &&
        candidate.status === "open"
    )
  ) {
    return;
  }
  const now = Date.now();
  await ctx.db.insert("lenderOrganizationReconciliationCandidates", {
    brokerageId: brokerageId ?? input.brokerageId,
    legacyWorkosOrganizationId: input.legacyWorkosOrganizationId,
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
            snapshotName: assignment.lenderOrganizationName,
            sourceTable: "proposalLenderApprovals",
            sourceRecordId: String(approval._id),
          })
        : null;
      if (!lenderOrganizationId) {
        await recordLenderReconciliationCandidate(
          ctx,
          {
            legacyWorkosOrganizationId: String(approval.lenderOrganizationId),
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
    if (pointed?.proposalId === proposal._id) {
      return pointed;
    }
  }
  const existing = await ctx.db
    .query("proposalReviewPolicyVersions")
    .withIndex("by_proposal_and_version", (query) =>
      query.eq("proposalId", proposal._id)
    )
    .order("desc")
    .take(1);
  if (existing[0]) {
    return existing[0];
  }
  const configuredAt =
    proposal.approvedAt ?? proposal.closedAt ?? proposal.updatedAt;
  const policyVersionId = await ctx.db.insert("proposalReviewPolicyVersions", {
    brokerageId: proposal.brokerageId,
    configuredAt,
    configuredByRole: "migration",
    configuredByWorkosUserId:
      proposal.backOfficeApprovedByWorkosUserId ??
      proposal.updatedByWorkosUserId,
    idempotencyKey: "migration:phase3:default-policy",
    organizationId: proposal.organizationId,
    policy: DEFAULT_PROPOSAL_REVIEW_POLICY,
    proposalId: proposal._id,
    reason:
      "Backfill the default review policy for pre-Phase 3 lifecycle data.",
    version: 1,
  });
  return await ctx.db.get(policyVersionId);
}

async function buildMigrationProposalCheckpoints(
  ctx: MutationCtx,
  proposal: Doc<"buildProposals">,
  policy: ProposalReviewPolicySnapshot
) {
  if (!proposal.builderProfileId) {
    return null;
  }
  const [builder, milestones] = await Promise.all([
    ctx.db.get(proposal.builderProfileId),
    ctx.db
      .query("proposalMilestones")
      .withIndex("by_proposal", (query) =>
        query.eq("proposalId", proposal._id)
      )
      .take(501),
  ]);
  if (
    !builder ||
    milestones.length > 500 ||
    milestones.some((milestone) => milestone.dependencyKeys.length > 500)
  ) {
    return null;
  }
  const orderedMilestones = milestones
    .map((milestone) => ({
      dayEnd: milestone.dayEnd,
      dayStart: milestone.dayStart,
      dependencyKeys: [...milestone.dependencyKeys].sort(),
      durationDays: milestone.durationDays,
      key: milestone.key,
      order: milestone.order,
    }))
    .sort(
      (left, right) =>
        left.order - right.order || left.key.localeCompare(right.key)
    );
  const milestonesFingerprint = await operationalRequestFingerprint(orderedMilestones);
  return { milestones: orderedMilestones, checkpoints: {
    accessReviewPolicy: policy,
    budget: { totalBudgetCents: proposal.totalBudgetCents },
    builder: {
      builderProfileId: builder._id,
      displayName: builder.displayName,
    },
    milestoneCount: { count: orderedMilestones.length },
    scheduleTimeline: {
      milestonesFingerprint,
      proposedStartDate: proposal.proposedStartDate ?? null,
      timelineRangeMax: proposal.timelineRangeMax ?? null,
      timelineRangeMin: proposal.timelineRangeMin ?? null,
    },
  }};
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
      pointed.revisionNumber === proposal.currentProposalRevisionNumber &&
      pointed.reviewPolicyVersionId === policyVersion._id &&
      pointed.assignmentId === assignment?._id
    ) {
      return pointed;
    }
  }
  const existing = await ctx.db
    .query("proposalRevisions")
    .withIndex("by_proposal_and_revision_number", (query) =>
      query.eq("proposalId", proposal._id)
    )
    .order("desc")
    .take(1);
  if (
    existing[0]?.reviewPolicyVersionId === policyVersion._id &&
    existing[0].assignmentId === assignment?._id
  ) {
    return existing[0];
  }
  if (existing[0]) return null;
  const snapshot = await buildMigrationProposalCheckpoints(
    ctx,
    proposal,
    policyVersion.policy
  );
  if (!snapshot) {
    return null;
  }
  const createdAt = proposal.approvedAt ?? proposal.updatedAt;
  const revisionId = await ctx.db.insert("proposalRevisions", {
    ...(assignment ? { assignmentId: assignment._id } : {}),
    backOfficeApprovedByWorkosUserId:
      proposal.backOfficeApprovedByWorkosUserId ??
      proposal.updatedByWorkosUserId,
    brokerageId: proposal.brokerageId,
    changedCheckpoints: [],
    checkpoints: snapshot.checkpoints,
    createdAt,
    createdByRole: "migration",
    createdByWorkosUserId: proposal.updatedByWorkosUserId,
    idempotencyKey: "migration:phase3:initial-revision",
    organizationId: proposal.organizationId,
    proposalId: proposal._id,
    reason: "Backfill the initial immutable proposal revision.",
    revisionNumber: 1,
    reviewPolicyVersionId: policyVersion._id,
  });
  for (const milestone of snapshot.milestones) {
    await ctx.db.insert("proposalRevisionMilestones", {
      brokerageId: proposal.brokerageId,
      organizationId: proposal.organizationId,
      proposalId: proposal._id,
      revisionId,
      ...milestone,
    });
  }
  return await ctx.db.get(revisionId);
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
    if (
      approval.proposalRevisionId &&
      approval.proposalRevisionNumber !== undefined
    ) {
      const linked = await ctx.db.get(approval.proposalRevisionId);
      if (
        linked?.proposalId === approval.proposalId &&
        linked.assignmentId === approval.assignmentId &&
        linked.revisionNumber === approval.proposalRevisionNumber
      ) {
        if (approval.status === "approved") {
          const proposal = await ctx.db.get(approval.proposalId);
          if (
            proposal &&
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
    }
    const proposal = await ctx.db.get(approval.proposalId);
    if (!proposal) return;
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
    if (!revision) {
      await recordPhase3MigrationIssue(ctx, {
        brokerageId: proposal.brokerageId,
        organizationId: proposal.organizationId,
        proposalId: proposal._id,
        reason:
          "No assignment-scoped proposal revision existed at the recorded decision time.",
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
  await ctx.db.patch(proposal._id, { lockedReviewPolicyId: lock._id });
  await ctx.db.patch(closing._id, { reviewPolicyLockId: lock._id });
  if (proposal.activeBuildId) {
    const build = await ctx.db.get(proposal.activeBuildId);
    if (build?.proposalId === proposal._id) {
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
        String(proposal.activeBuildId)
      );
    } else {
      await recordPhase3MigrationIssue(ctx, {
        brokerageId: proposal.brokerageId,
        organizationId: proposal.organizationId,
        proposalId: proposal._id,
        reason:
          "The active Build pointer cannot be reconciled to the closed proposal.",
        sourceRecordId: String(proposal.activeBuildId),
        sourceTable: "activeBuilds",
      });
    }
  }
  await resolvePhase3MigrationIssue(
    ctx,
    "proposalClosings",
    String(proposal._id)
  );
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
