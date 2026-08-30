import { ConvexError, v } from "convex/values";

import { internal } from "../_generated/api";
import { internalAction, internalMutation, internalQuery } from "../fluent";
import {
  MAX_FANOUT_ATTEMPTS,
  fanoutBuildFailureResultValidator,
  fanoutClaimValidator,
  fanoutModeValidator,
  isoDateKey,
  retentionBuildPageValidator,
} from "./contracts";
import { boundedError } from "./support";
import type { ActionCtx, Id } from "../types";

export const listDataRetentionBuildPage = internalQuery
  .input({
    cursor: v.optional(v.string()),
    organizationId: v.optional(v.string()),
  })
  .returns(retentionBuildPageValidator)
  .handler(async (ctx, args) => {
    const pagination = { cursor: args.cursor ?? null, numItems: 20 };
    const organizationId = args.organizationId;
    const result = organizationId
      ? await ctx.db
          .query("activeBuilds")
          .withIndex("by_organizationId", (query) =>
            query.eq("organizationId", organizationId)
          )
          .paginate(pagination)
      : await ctx.db.query("activeBuilds").paginate(pagination);
    return {
      continueCursor: result.continueCursor,
      isDone: result.isDone,
      page: result.page.map((build) => ({
        buildId: build._id,
        organizationId: build.organizationId,
      })),
    };
  })
  .internal();

export const markDataRetentionBuildArchived = internalMutation
  .input({ buildId: v.id("activeBuilds"), organizationId: v.string() })
  .returns(v.null())
  .handler(async (ctx, args) => {
    const schedule = await ctx.db
      .query("dataRetentionSchedules")
      .withIndex("by_buildId", (query) => query.eq("buildId", args.buildId))
      .unique();
    if (
      schedule &&
      schedule.organizationId === args.organizationId &&
      schedule.state !== "purged" &&
      schedule.restrictedArchiveAt === undefined
    ) {
      await ctx.db.patch(schedule._id, { restrictedArchiveAt: Date.now() });
    }
    return null;
  })
  .internal();

export const claimDataRetentionFanoutPage = internalMutation
  .input({
    cursor: v.optional(v.string()),
    mode: fanoutModeValidator,
    organizationId: v.optional(v.string()),
    runKey: v.string(),
  })
  .returns(fanoutClaimValidator)
  .handler(async (ctx, args) => {
    const now = Date.now();
    const existing = await ctx.db
      .query("dataRetentionFanoutRuns")
      .withIndex("by_runKey", (query) => query.eq("runKey", args.runKey))
      .unique();
    if (existing) {
      if (
        existing.mode !== args.mode ||
        existing.organizationId !== args.organizationId
      ) {
        throw new ConvexError(
          "Retention fan-out run key is already bound to another scope."
        );
      }
      if (existing.state === "completed" || existing.state === "failed") {
        return {
          attemptCount: existing.attemptCount,
          completed: true,
          cursor: existing.cursor,
          failureCount: existing.failureCount,
        };
      }
      await ctx.db.patch(existing._id, {
        state: "running",
        updatedAt: now,
      });
      return {
        attemptCount: existing.attemptCount,
        completed: false,
        cursor: existing.cursor,
        failureCount: existing.failureCount,
      };
    }
    await ctx.db.insert("dataRetentionFanoutRuns", {
      attemptCount: 1,
      createdAt: now,
      cursor: args.cursor,
      failureCount: 0,
      mode: args.mode,
      organizationId: args.organizationId,
      runKey: args.runKey,
      state: "running",
      updatedAt: now,
    });
    return {
      attemptCount: 1,
      completed: false,
      cursor: args.cursor,
      failureCount: 0,
    };
  })
  .internal();

export const recordDataRetentionFanoutPageResult = internalMutation
  .input({
    completed: v.boolean(),
    cursor: v.optional(v.string()),
    failureReason: v.optional(v.string()),
    runKey: v.string(),
    terminalFailure: v.optional(v.boolean()),
  })
  .returns(v.null())
  .handler(async (ctx, args) => {
    const run = await ctx.db
      .query("dataRetentionFanoutRuns")
      .withIndex("by_runKey", (query) => query.eq("runKey", args.runKey))
      .unique();
    if (!run || run.state === "completed") {
      return null;
    }
    const now = Date.now();
    const failureCount = args.failureReason ? run.failureCount + 1 : 0;
    await ctx.db.patch(run._id, {
      completedAt: args.completed ? now : undefined,
      cursor: args.completed ? undefined : args.cursor,
      failureReason: args.failureReason,
      failureCount,
      state: args.terminalFailure
        ? "failed"
        : args.completed
          ? "completed"
          : args.failureReason
            ? "retry_scheduled"
            : "running",
      updatedAt: now,
    });
    return null;
  })
  .internal();

export const recordDataRetentionFanoutBuildResult = internalMutation
  .input({
    buildId: v.id("activeBuilds"),
    failureReason: v.optional(v.string()),
    mode: fanoutModeValidator,
    organizationId: v.string(),
    resolved: v.boolean(),
    runKey: v.string(),
  })
  .returns(fanoutBuildFailureResultValidator)
  .handler(async (ctx, args) => {
    const existing = await ctx.db
      .query("dataRetentionFanoutBuildFailures")
      .withIndex("by_runKey_and_buildId", (query) =>
        query.eq("runKey", args.runKey).eq("buildId", args.buildId)
      )
      .unique();
    const now = Date.now();
    if (args.resolved) {
      if (existing) {
        await ctx.db.patch(existing._id, {
          failureReason: undefined,
          resolvedAt: now,
          state: "resolved",
          updatedAt: now,
        });
      }
      return {
        failureCount: existing?.failureCount ?? 0,
        state: "resolved" as const,
      };
    }
    const failureCount = (existing?.failureCount ?? 0) + 1;
    const state =
      failureCount >= MAX_FANOUT_ATTEMPTS ? "failed" : "retry_scheduled";
    if (existing) {
      await ctx.db.patch(existing._id, {
        failureCount,
        failureReason: args.failureReason,
        state,
        updatedAt: now,
      });
    } else {
      await ctx.db.insert("dataRetentionFanoutBuildFailures", {
        buildId: args.buildId,
        createdAt: now,
        failureCount,
        failureReason: args.failureReason,
        mode: args.mode,
        organizationId: args.organizationId,
        runKey: args.runKey,
        state,
        updatedAt: now,
      });
    }
    return { failureCount, state };
  })
  .internal();

export const retryDataRetentionFanoutBuild = internalAction
  .input({
    buildId: v.id("activeBuilds"),
    mode: fanoutModeValidator,
    organizationId: v.string(),
    runKey: v.string(),
  })
  .returns(v.null())
  .handler(async (ctx, args) => {
    try {
      await executeDataRetentionFanoutBuild(ctx, args, Date.now());
      await ctx.runMutation(
        internal.data_retention.recordDataRetentionFanoutBuildResult,
        { ...args, resolved: true }
      );
    } catch (error) {
      const result = await ctx.runMutation(
        internal.data_retention.recordDataRetentionFanoutBuildResult,
        {
          ...args,
          failureReason: boundedError(error),
          resolved: false,
        }
      );
      if (result.state === "retry_scheduled") {
        await ctx.scheduler.runAfter(
          Math.min(60_000, 2 ** Math.min(result.failureCount, 6) * 1000),
          internal.data_retention.retryDataRetentionFanoutBuild,
          args
        );
      }
    }
    return null;
  })
  .internal();

export const fanOutDataRetentionWork = internalAction
  .input({
    cursor: v.optional(v.string()),
    mode: fanoutModeValidator,
    organizationId: v.optional(v.string()),
    runKey: v.optional(v.string()),
  })
  .returns(v.null())
  .handler(async (ctx, args) => {
    const runKey =
      args.runKey ??
      `fanout:${args.mode}:${args.organizationId ?? "global"}:${isoDateKey(Date.now())}`;
    const claim = await ctx.runMutation(
      internal.data_retention.claimDataRetentionFanoutPage,
      {
        cursor: args.cursor,
        mode: args.mode,
        organizationId: args.organizationId,
        runKey,
      }
    );
    if (claim.completed) {
      return null;
    }
    try {
      const page = await ctx.runQuery(
        internal.data_retention.listDataRetentionBuildPage,
        {
          cursor: claim.cursor,
          organizationId: args.organizationId,
        }
      );
      const asOf = Date.now();
      for (const build of page.page) {
        const buildWork = { ...build, mode: args.mode, runKey };
        try {
          await executeDataRetentionFanoutBuild(ctx, buildWork, asOf);
        } catch (error) {
          const result = await ctx.runMutation(
            internal.data_retention.recordDataRetentionFanoutBuildResult,
            {
              ...buildWork,
              failureReason: boundedError(error),
              resolved: false,
            }
          );
          if (result.state === "retry_scheduled") {
            await ctx.scheduler.runAfter(
              Math.min(60_000, 2 ** Math.min(result.failureCount, 6) * 1000),
              internal.data_retention.retryDataRetentionFanoutBuild,
              buildWork
            );
          }
        }
      }
      await ctx.runMutation(
        internal.data_retention.recordDataRetentionFanoutPageResult,
        {
          completed: page.isDone,
          cursor: page.isDone ? undefined : page.continueCursor,
          runKey,
        }
      );
      if (!page.isDone) {
        await ctx.scheduler.runAfter(
          0,
          internal.data_retention.fanOutDataRetentionWork,
          {
            mode: args.mode,
            organizationId: args.organizationId,
            runKey,
          }
        );
      }
    } catch (error) {
      const failureReason = boundedError(error);
      const nextFailureCount = claim.failureCount + 1;
      const terminalFailure = nextFailureCount >= MAX_FANOUT_ATTEMPTS;
      await ctx.runMutation(
        internal.data_retention.recordDataRetentionFanoutPageResult,
        {
          completed: false,
          cursor: claim.cursor,
          failureReason,
          runKey,
          terminalFailure,
        }
      );
      if (terminalFailure) {
        return null;
      }
      await ctx.scheduler.runAfter(
        Math.min(60_000, 2 ** Math.min(nextFailureCount, 6) * 1000),
        internal.data_retention.fanOutDataRetentionWork,
        {
          mode: args.mode,
          organizationId: args.organizationId,
          runKey,
        }
      );
    }
    return null;
  })
  .internal();

async function executeDataRetentionFanoutBuild(
  ctx: ActionCtx,
  input: {
    buildId: Id<"activeBuilds">;
    mode: "archive" | "maintenance" | "reconcile";
    organizationId: string;
    runKey: string;
  },
  asOf: number
) {
  if (input.mode === "maintenance") {
    await ctx.runMutation(internal.data_retention.runDataRetentionMaintenance, {
      asOf,
      buildId: input.buildId,
      organizationId: input.organizationId,
    });
    return;
  }
  await ctx.runMutation(internal.data_retention.reconcileDataRetention, {
    asOf,
    buildId: input.buildId,
    organizationId: input.organizationId,
    runKey: `${input.runKey}:${input.buildId}`,
  });
  if (input.mode === "archive") {
    await ctx.runMutation(
      internal.data_retention.markDataRetentionBuildArchived,
      {
        buildId: input.buildId,
        organizationId: input.organizationId,
      }
    );
  }
}
