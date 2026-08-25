import { ConvexError, v } from "convex/values";

import { internalMutation } from "../fluent";
import { hasActiveBuildRetentionHold } from "./access";
import { MAX_ROWS_PER_SWEEP, sweepResultValidator } from "./contracts";
import { sweepBuildRetention } from "./sweeps";

export const runDataRetentionMaintenance = internalMutation
  .input({
    asOf: v.optional(v.number()),
    buildId: v.id("activeBuilds"),
    organizationId: v.string(),
  })
  .returns(sweepResultValidator)
  .handler(async (ctx, args) => {
    const asOf = args.asOf ?? Date.now();
    const build = await ctx.db.get(args.buildId);
    if (!build || build.organizationId !== args.organizationId) {
      throw new ConvexError(
        "Retention maintenance requires an exact tenant Build."
      );
    }
    const totals = {
      blockedByLegalHold: 0,
      completedOperations: 0,
      deletedOrRedactedCount: 0,
      markedRecoveryCount: 0,
      tombstoneCount: 0,
    };
    if (
      await hasActiveBuildRetentionHold(ctx, {
        buildId: build._id,
        organizationId: build.organizationId,
      })
    ) {
      totals.blockedByLegalHold += 1;
      return totals;
    }
    const result = await sweepBuildRetention(ctx, build, asOf);
    totals.blockedByLegalHold += result.blockedByLegalHold;
    totals.completedOperations += result.completedOperations;
    totals.deletedOrRedactedCount += result.deletedOrRedactedCount;
    totals.markedRecoveryCount += result.markedRecoveryCount;
    totals.tombstoneCount += result.tombstoneCount;
    return totals;
  })
  .internal();

export const cleanupExpiredDataRetentionTombstones = internalMutation
  .input({ asOf: v.optional(v.number()), limit: v.optional(v.number()) })
  .returns(v.number())
  .handler(async (ctx, args) => {
    const asOf = args.asOf ?? Date.now();
    const limit = Math.max(1, Math.min(MAX_ROWS_PER_SWEEP, args.limit ?? 100));
    const tombstones = await ctx.db
      .query("dataRetentionTombstones")
      .withIndex("by_tombstoneExpiresAt", (query) =>
        query.lte("tombstoneExpiresAt", asOf)
      )
      .take(limit);
    for (const tombstone of tombstones) {
      await ctx.db.delete(tombstone._id);
    }
    return tombstones.length;
  })
  .internal();
