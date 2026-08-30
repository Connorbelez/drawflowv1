import { ConvexError, v } from "convex/values";

import { internalMutation } from "../fluent";
import {
  BACKUP_RPO_MS,
  DAY_MS,
  isoDateKey,
} from "./contracts";
import {
  deriveBuildSchedule,
  latestBackupManifest,
} from "./schedule";

export const reconcileDataRetention = internalMutation
  .input({
    asOf: v.optional(v.number()),
    buildId: v.id("activeBuilds"),
    organizationId: v.string(),
    runKey: v.optional(v.string()),
  })
  .returns(
    v.object({
      backupRpoBreaches: v.number(),
      outboxCount: v.number(),
      reminderCount: v.number(),
      retentionMismatchCount: v.number(),
      runId: v.id("dataRetentionReconciliationRuns"),
      scheduleCount: v.number(),
    })
  )
  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Reconciliation keeps bounded schedule, reminder, outbox, and backup-RPO accounting in one transaction.
  .handler(async (ctx, args) => {
    const asOf = args.asOf ?? Date.now();
    const build = await ctx.db.get(args.buildId);
    if (!build || build.organizationId !== args.organizationId) {
      throw new ConvexError(
        "Retention reconciliation requires an exact tenant Build."
      );
    }
    const organizationId = build.organizationId;
    const brokerageId = build.brokerageId;
    const builds = [build];
    const runKey =
      args.runKey ?? `daily:${organizationId}:${build._id}:${isoDateKey(asOf)}`;
    const existing = await ctx.db
      .query("dataRetentionReconciliationRuns")
      .withIndex("by_organizationId_and_runKey", (query) =>
        query.eq("organizationId", organizationId).eq("runKey", runKey)
      )
      .unique();
    if (existing?.state === "completed") {
      return {
        backupRpoBreaches: existing.backupRpoBreaches,
        outboxCount: existing.outboxCount,
        reminderCount: existing.reminderCount,
        retentionMismatchCount: existing.retentionMismatchCount,
        runId: existing._id,
        scheduleCount: existing.scheduleCount,
      };
    }
    const startedAt = Date.now();
    const runId =
      existing?._id ??
      (await ctx.db.insert("dataRetentionReconciliationRuns", {
        backupRpoBreaches: 0,
        brokerageId,
        completedAt: undefined,
        organizationId,
        outboxCount: 0,
        reminderCount: 0,
        retentionMismatchCount: 0,
        runKey,
        scheduleCount: 0,
        startedAt,
        state: "started",
        asOf,
      }));
    let scheduleCount = 0;
    let reminderCount = 0;
    let outboxCount = 0;
    let retentionMismatchCount = 0;
    for (const build of builds) {
      const derived = await deriveBuildSchedule(ctx, build._id, asOf);
      if (!derived) {
        continue;
      }
      const { priorState, schedule } = derived;
      scheduleCount += 1;
      if (priorState !== undefined && priorState !== schedule.state) {
        retentionMismatchCount += 1;
      }
      if (
        schedule.retainUntil &&
        schedule.retainUntil <= asOf + 30 * DAY_MS &&
        schedule.state !== "purged" &&
        schedule.state !== "restricted_archive"
      ) {
        const reminderKey = `retention-reminder:${schedule._id}:${schedule.revision}`;
        const reminder = await ctx.db
          .query("dataRetentionOperations")
          .withIndex("by_operationKey", (query) =>
            query
              .eq("organizationId", build.organizationId)
              .eq("operationKey", reminderKey)
          )
          .unique();
        if (!reminder) {
          await ctx.db.insert("dataRetentionOperations", {
            affectedCount: 0,
            brokerageId: build.brokerageId,
            buildId: build._id,
            operationKey: reminderKey,
            operationKind: "retention_reminder",
            organizationId: build.organizationId,
            reasonCode: "retention_reminder",
            scopeId: String(schedule._id),
            scopeKind: "build_retention_schedule",
            startedAt,
            state: "completed",
            updatedAt: startedAt,
            completedAt: startedAt,
          });
          await ctx.db.insert("eventOutbox", {
            brokerageId: build.brokerageId,
            createdAt: startedAt,
            eventType: "data_retention.reminder_due",
            organizationId: build.organizationId,
            payloadPreview: JSON.stringify({
              buildId: build._id,
              retainUntil: schedule.retainUntil,
              scheduleRevision: schedule.revision,
            }),
            relatedEntityId: String(build._id),
            relatedEntityType: "dataRetentionSchedule",
            status: "pending",
          });
          reminderCount += 1;
          outboxCount += 1;
        }
      }
    }
    const latestBackup = await latestBackupManifest(ctx, organizationId);
    const backupRpoBreaches = latestBackup
      ? latestBackup.capturedAt + BACKUP_RPO_MS < asOf
        ? 1
        : 0
      : 1;
    await ctx.db.patch(runId, {
      backupRpoBreaches,
      completedAt: Date.now(),
      outboxCount,
      reminderCount,
      retentionMismatchCount,
      scheduleCount,
      state: "completed",
    });
    return {
      backupRpoBreaches,
      outboxCount,
      reminderCount,
      retentionMismatchCount,
      runId,
      scheduleCount,
    };
  })
  .internal();
