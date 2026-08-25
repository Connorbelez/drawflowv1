import { internal } from "../_generated/api.js";
import { hasAssignableBrokerRole } from "../brokerAssignments.js";
import {
  FAIRLEND_DEFAULT_BROKER_EMAIL,
  FAIRLEND_WORKOS_ORGANIZATION_ID,
} from "../fairLendConfig.js";
import { migrations } from "./context";

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
