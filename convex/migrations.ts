import { Migrations } from "@convex-dev/migrations";

import { components, internal } from "./_generated/api.js";
import type { Id } from "./_generated/dataModel";
import { hasAssignableBrokerRole } from "./brokerAssignments.js";
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
    const principalBrokerWorkosUserId =
      brokerage.principalBrokerWorkosUserId;

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
  ctx: any,
  input: {
    brokerageId?: Id<"brokerages">;
    legacyWorkosOrganizationId: string;
    snapshotName?: string;
    sourceTable: LegacyLenderSource;
    sourceRecordId: string;
  }): Promise<Id<"lenderOrganizations"> | null> {
  let currentOrganization = null;
  try {
    currentOrganization = await ctx.db.get(
      input.legacyWorkosOrganizationId as Id<"lenderOrganizations">,
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
    await recordLenderReconciliationCandidate(ctx, input, undefined, "The legacy lender assignment has no resolvable parent Brokerage.");
    return null;
  }

  const existing = await ctx.db
    .query("lenderOrganizations")
    .withIndex("by_brokerage_and_legacy_workos_organization", (query: any) =>
      query
        .eq("brokerageId", brokerage._id)
        .eq("legacyWorkosOrganizationId", input.legacyWorkosOrganizationId),
    )
    .take(1);
  if (existing[0]) {
    return existing[0]._id;
  }

  const workosOrganization = await ctx.db
    .query("workosOrganizations")
    .withIndex("by_workos_organization_id", (query: any) =>
      query.eq("workosOrganizationId", input.legacyWorkosOrganizationId),
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
  ctx: any,
  input: {
    brokerageId?: Id<"brokerages">;
    legacyWorkosOrganizationId: string;
    snapshotName?: string;
    sourceTable: LegacyLenderSource;
    sourceRecordId: string;
  },
  brokerageId: Id<"brokerages"> | undefined,
  reason: string,
) {
  const existing = await ctx.db
    .query("lenderOrganizationReconciliationCandidates")
    .withIndex("by_legacy_workos_organization", (query: any) =>
      query.eq("legacyWorkosOrganizationId", input.legacyWorkosOrganizationId),
    )
    .collect();
  if (
    existing.some(
      (candidate: any) =>
        candidate.sourceTable === input.sourceTable &&
        candidate.sourceRecordId === input.sourceRecordId &&
        candidate.status === "open",
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

export const backfillLegacyProposalLenderAssignmentOrganizations = migrations.define({
  table: "proposalLenderAssignments",
  migrateOne: async (ctx, assignment) => {
    let currentOrganization = null;
    try {
      currentOrganization = await ctx.db.get(
        assignment.lenderOrganizationId as Id<"lenderOrganizations">,
      );
    } catch {
      // Legacy WorkOS IDs are not Convex IDs.
    }
    if (currentOrganization) {
      return;
    }

    const lenderOrganizationId = await materializeLegacyLenderOrganization(ctx, {
      brokerageId: assignment.lenderBrokerageId,
      legacyWorkosOrganizationId: String(assignment.lenderOrganizationId),
      snapshotName: assignment.lenderOrganizationName,
      sourceTable: "proposalLenderAssignments",
      sourceRecordId: String(assignment._id),
    });
    if (!lenderOrganizationId) {
      return;
    }
    return {
      lenderOrganizationId,
      legacyLenderOrganizationId: String(assignment.lenderOrganizationId),
    };
  },
});

export const backfillLegacyProposalLenderApprovalOrganizations = migrations.define({
  table: "proposalLenderApprovals",
  migrateOne: async (ctx, approval) => {
    let currentOrganization = null;
    try {
      currentOrganization = await ctx.db.get(
        approval.lenderOrganizationId as Id<"lenderOrganizations">,
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
        "The lender approval references an assignment that is unavailable.",
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
