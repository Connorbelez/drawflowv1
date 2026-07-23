import { Migrations } from "@convex-dev/migrations";

import { components, internal } from "./_generated/api.js";
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
