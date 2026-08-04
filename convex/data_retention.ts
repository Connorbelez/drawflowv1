import { ConvexError, v } from "convex/values";

import { internal } from "./_generated/api";
import {
  type ActiveBuildAuthorization,
  authorizeActiveBuildAccess,
} from "./activeBuildAccess";
import {
  administrativeOverrideInputFields,
  appendGovernedAuditEvent,
  authorizeAdministrativeRecovery,
  privacyMinimizedAuditState,
  requiredAdministrativeReason,
} from "./administrative_override_policy";
import { authenticatedMutation, authenticatedQuery } from "./authz";
import { internalAction, internalMutation, internalQuery } from "./fluent";
import type { ActionCtx, Doc, Id, MutationCtx, QueryCtx } from "./types";

export const DAY_MS = 86_400_000;
export const BASELINE_RETENTION_YEARS = 7;
export const QUOTE_DRAFT_RECOVERY_DAYS = 90;
export const COST_UPLOAD_RETENTION_DAYS = 7;
export const ISOLATED_ASSET_RETENTION_DAYS = 30;
export const CREDENTIAL_RETENTION_DAYS = 30;
export const BACKUP_RPO_MS = DAY_MS;
export const RESTORE_START_RTO_MS = 60 * 60 * 1000;
export const RESTORE_COMPLETE_RTO_MS = 8 * 60 * 60 * 1000;
/**
 * Communication telemetry is deliberately never persisted. These controls
 * are carried in backup manifests so operators can prove the minimization
 * contract without introducing a sensitive replay table.
 */
export const NEVER_PERSISTED_RETENTION_CONTROLS = [
  "rendered_provider_body",
  "raw_provider_payload",
  "ip_address",
  "user_agent",
] as const;
const MAX_ROWS_PER_SWEEP = 100;
const MAX_FANOUT_ATTEMPTS = 10;
const MAX_PROVIDER_RESERVATIONS_PER_ORGANIZATION = 100;
const TOMBSTONE_RETENTION_MS = 2 * 365 * DAY_MS;
const PRODUCTION_NAMESPACE_PATTERN =
  /(?:^|[-_])(prod|production|live)(?:$|[-_])/i;
const STORAGE_OBJECT_MISSING_PATTERN = /(non-existent|not found)/i;

const scheduleValidator = v.object({
  _id: v.id("dataRetentionSchedules"),
  baselineRetainUntil: v.optional(v.number()),
  baselineRetentionYears: v.number(),
  buildClosedAt: v.optional(v.number()),
  buildId: v.id("activeBuilds"),
  lastReconciledAt: v.optional(v.number()),
  loanClosedAt: v.optional(v.number()),
  laterClosureAt: v.optional(v.number()),
  organizationId: v.string(),
  policyVersion: v.number(),
  retainUntil: v.optional(v.number()),
  revision: v.number(),
  state: v.union(
    v.literal("active"),
    v.literal("restricted_archive"),
    v.literal("eligible"),
    v.literal("held"),
    v.literal("purged")
  ),
});

const sweepResultValidator = v.object({
  completedOperations: v.number(),
  blockedByLegalHold: v.number(),
  deletedOrRedactedCount: v.number(),
  markedRecoveryCount: v.number(),
  tombstoneCount: v.number(),
});

const backupManifestMetadataValidator = v.object({
  _id: v.id("dataRetentionBackupManifests"),
  backupDate: v.string(),
  buildCount: v.number(),
  capturedAt: v.number(),
  documentsCount: v.number(),
  failureReason: v.optional(v.string()),
  manifestSha256: v.string(),
  neverPersistedControls: v.optional(v.array(v.string())),
  organizationId: v.string(),
  relationshipCount: v.number(),
  revisionLineageCount: v.number(),
  rpoDeadlineAt: v.number(),
  state: v.union(
    v.literal("pending"),
    v.literal("verified"),
    v.literal("failed")
  ),
  storageBytes: v.number(),
  storageObjectsCount: v.number(),
  verifiedAt: v.optional(v.number()),
});

const retentionBuildPageValidator = v.object({
  continueCursor: v.string(),
  isDone: v.boolean(),
  page: v.array(
    v.object({
      buildId: v.id("activeBuilds"),
      organizationId: v.string(),
    })
  ),
});

const fanoutModeValidator = v.union(
  v.literal("archive"),
  v.literal("maintenance"),
  v.literal("reconcile")
);

const fanoutClaimValidator = v.object({
  attemptCount: v.number(),
  completed: v.boolean(),
  cursor: v.optional(v.string()),
  failureCount: v.number(),
});

const fanoutBuildFailureResultValidator = v.object({
  failureCount: v.number(),
  state: v.union(
    v.literal("retry_scheduled"),
    v.literal("resolved"),
    v.literal("failed")
  ),
});

const isoDateKey = (timestamp: number) =>
  new Date(timestamp).toISOString().slice(0, 10);

export function baselineRetentionDeadline(closureAt: number) {
  const deadline = new Date(closureAt);
  deadline.setUTCFullYear(deadline.getUTCFullYear() + BASELINE_RETENTION_YEARS);
  return deadline.getTime();
}

export function backupManifestEligibleAt(input: {
  capturedAt: number;
  restoreRequestedAt: number;
  rpoDeadlineAt: number;
}) {
  return (
    input.capturedAt <= input.restoreRequestedAt &&
    input.restoreRequestedAt - input.capturedAt <= BACKUP_RPO_MS &&
    input.rpoDeadlineAt >= input.restoreRequestedAt &&
    input.rpoDeadlineAt - input.capturedAt <= BACKUP_RPO_MS
  );
}

/**
 * Returns true when the canonical Build-scoped legal hold authority blocks a
 * destructive operation. There is intentionally no organization-level hold
 * table here: callers must resolve a Build and query this table every time.
 */
export async function hasActiveBuildRetentionHold(
  ctx: QueryCtx | MutationCtx,
  input: { buildId: Id<"activeBuilds">; organizationId: string }
) {
  const build = await ctx.db.get(input.buildId);
  if (!build || build.organizationId !== input.organizationId) {
    return true;
  }
  const hold = await ctx.db
    .query("buildCollaborationLegalHolds")
    .withIndex("by_buildId_and_state", (query) =>
      query.eq("buildId", input.buildId).eq("state", "active")
    )
    .unique();
  return Boolean(
    hold &&
      hold.organizationId === build.organizationId &&
      hold.brokerageId === build.brokerageId
  );
}

async function assertRetentionDeletionAllowed(
  ctx: QueryCtx | MutationCtx,
  build: Doc<"activeBuilds">
) {
  if (
    await hasActiveBuildRetentionHold(ctx, {
      buildId: build._id,
      organizationId: build.organizationId,
    })
  ) {
    throw new ConvexError("Active legal hold blocks physical data deletion.");
  }
}

/** Guard used by Cost/Quote write boundaries after service cancellation. */
export async function assertOrganizationRetentionWritable(
  ctx: QueryCtx | MutationCtx,
  organizationId: string
) {
  if (await isOrganizationInRestrictedArchive(ctx, organizationId)) {
    throw new ConvexError(
      "This organization is in restricted archive; canonical records are read-only."
    );
  }
}

export async function isOrganizationInRestrictedArchive(
  ctx: QueryCtx | MutationCtx,
  organizationId: string
) {
  const setting = await ctx.db
    .query("buildCollaborationTenantSettings")
    .withIndex("by_organizationId", (query) =>
      query.eq("organizationId", organizationId)
    )
    .unique();
  return setting?.serviceLifecycle === "restricted_archive";
}

export const getDataRetentionSchedule = authenticatedQuery
  .input({
    buildId: v.id("activeBuilds"),
    organizationId: v.string(),
  })
  .returns(v.union(scheduleValidator, v.null()))
  .handler(async (ctx, args) => {
    const authorization = await authorizeActiveBuildAccess(ctx, args);
    const schedule = await ctx.db
      .query("dataRetentionSchedules")
      .withIndex("by_buildId", (query) =>
        query.eq("buildId", authorization.build._id)
      )
      .unique();
    if (!schedule) {
      return null;
    }
    return projectSchedule(schedule);
  })
  .public();

export const configureDataRetentionPolicy = authenticatedMutation
  .input({
    buildId: v.id("activeBuilds"),
    extensionDays: v.number(),
    organizationId: v.string(),
    reason: v.string(),
  })
  .returns(v.id("dataRetentionTenantPolicies"))
  .handler(async (ctx, args) => {
    const authorization = await authorizeActiveBuildAccess(ctx, args);
    requireRetentionAdmin(authorization);
    const reason = requiredAdministrativeReason(
      args.reason,
      "A retention policy reason"
    );
    assertExtensionDays(args.extensionDays);
    const current = await activeTenantPolicy(
      ctx,
      authorization.organizationId,
      authorization.brokerage._id
    );
    if (current && args.extensionDays < current.extensionDays) {
      throw new ConvexError(
        "Tenant retention may extend the baseline only; it cannot shorten it."
      );
    }
    if (current && args.extensionDays === current.extensionDays) {
      return current._id;
    }
    const now = Date.now();
    if (current) {
      await ctx.db.patch(current._id, {
        state: "superseded",
        supersededAt: now,
      });
    }
    const policyId = await ctx.db.insert("dataRetentionTenantPolicies", {
      baselineYears: BASELINE_RETENTION_YEARS,
      brokerageId: authorization.brokerage._id,
      createdAt: now,
      createdByWorkosUserId: authorization.viewer.subject,
      extensionDays: args.extensionDays,
      organizationId: authorization.organizationId,
      reason,
      state: "active",
      version: (current?.version ?? 0) + 1,
    });
    await recordAudit(ctx, {
      actorKind: authorization.viewer.actorKind ?? "human",
      actorRole: authorization.effectiveRole.role,
      actorRoles: authorization.roles,
      actorWorkosUserId: authorization.viewer.subject,
      brokerageId: authorization.brokerage._id,
      buildId: authorization.build._id,
      command: "configureDataRetentionPolicy",
      entityId: policyId,
      entityType: "dataRetentionTenantPolicy",
      eventType: "data_retention.policy.changed",
      newState: {
        baselineYears: BASELINE_RETENTION_YEARS,
        extensionDays: args.extensionDays,
        version: (current?.version ?? 0) + 1,
      },
      organizationId: authorization.organizationId,
      priorState: current
        ? {
            baselineYears: current.baselineYears,
            extensionDays: current.extensionDays,
            version: current.version,
          }
        : undefined,
      reason,
      now,
    });
    await ctx.scheduler.runAfter(
      0,
      internal.data_retention.fanOutDataRetentionWork,
      {
        mode: "reconcile",
        organizationId: authorization.organizationId,
        runKey: `policy:${authorization.organizationId}:${policyId}:${now}`,
      }
    );
    return policyId;
  })
  .public();

export const transitionOrganizationToRestrictedArchive = authenticatedMutation
  .input({
    buildId: v.id("activeBuilds"),
    confirmed: v.boolean(),
    organizationId: v.string(),
    reason: v.string(),
  })
  .returns(
    v.object({
      archiveRunKey: v.string(),
      settingId: v.id("buildCollaborationTenantSettings"),
    })
  )
  .handler(async (ctx, args) => {
    if (!args.confirmed) {
      throw new ConvexError(
        "Explicit confirmation is required to place an organization in restricted archive."
      );
    }
    const authorization = await authorizeActiveBuildAccess(ctx, args);
    requireRetentionAdmin(authorization);
    const reason = requiredAdministrativeReason(
      args.reason,
      "An organization archive reason"
    );
    const setting = await ctx.db
      .query("buildCollaborationTenantSettings")
      .withIndex("by_organizationId", (query) =>
        query.eq("organizationId", authorization.organizationId)
      )
      .unique();
    const now = Date.now();
    if (setting?.serviceLifecycle === "restricted_archive") {
      return {
        archiveRunKey: `archive:${authorization.organizationId}:${setting.serviceLifecycleChangedAt ?? setting.updatedAt}`,
        settingId: setting._id,
      };
    }
    const reservations = await ctx.db
      .query("communicationProviderReservations")
      .withIndex("by_organizationId_and_state_and_leaseExpiresAt", (query) =>
        query
          .eq("organizationId", authorization.organizationId)
          .eq("state", "active")
      )
      .take(MAX_PROVIDER_RESERVATIONS_PER_ORGANIZATION + 1);
    if (reservations.length > MAX_PROVIDER_RESERVATIONS_PER_ORGANIZATION) {
      throw new ConvexError(
        "Organization archive is blocked by an unbounded provider reservation set."
      );
    }
    for (const reservation of reservations) {
      if (reservation.leaseExpiresAt > now) {
        throw new ConvexError(
          "Organization archive is deferred while a provider submission is active."
        );
      }
      await ctx.db.patch(reservation._id, {
        releasedAt: now,
        state: "expired",
        updatedAt: now,
      });
    }
    const settingId = setting
      ? setting._id
      : await ctx.db.insert("buildCollaborationTenantSettings", {
          brokerageId: authorization.brokerage._id,
          createdAt: now,
          generousRateLimitMultiplier: 1,
          organizationId: authorization.organizationId,
          status: "disabled",
          updatedAt: now,
        });
    await ctx.db.patch(settingId, {
      serviceLifecycle: "restricted_archive",
      serviceLifecycleChangedAt: now,
      serviceLifecycleChangedByWorkosUserId: authorization.viewer.subject,
      serviceLifecycleReason: reason,
      updatedAt: now,
    });
    const archiveRunKey = `archive:${authorization.organizationId}:${now}`;
    await ctx.scheduler.runAfter(
      0,
      internal.data_retention.fanOutDataRetentionWork,
      {
        mode: "archive",
        organizationId: authorization.organizationId,
        runKey: archiveRunKey,
      }
    );
    await recordAudit(ctx, {
      actorKind: authorization.viewer.actorKind ?? "human",
      actorRole: authorization.effectiveRole.role,
      actorRoles: authorization.roles,
      actorWorkosUserId: authorization.viewer.subject,
      brokerageId: authorization.brokerage._id,
      buildId: authorization.build._id,
      command: "transitionOrganizationToRestrictedArchive",
      entityId: settingId,
      entityType: "buildCollaborationTenantSettings",
      eventType: "data_retention.organization.restricted_archive",
      newState: { serviceLifecycle: "restricted_archive" },
      organizationId: authorization.organizationId,
      priorState: {
        serviceLifecycle: setting?.serviceLifecycle ?? "active",
      },
      reason,
      now,
    });
    return { archiveRunKey, settingId };
  })
  .public();

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

export const getLatestDataRetentionBackupManifest = authenticatedQuery
  .input({ organizationId: v.string(), buildId: v.id("activeBuilds") })
  .returns(v.union(backupManifestMetadataValidator, v.null()))
  .handler(async (ctx, args) => {
    const authorization = await authorizeActiveBuildAccess(ctx, args);
    requireRetentionAdmin(authorization);
    const manifest = await latestBackupManifest(
      ctx,
      authorization.organizationId
    );
    if (!manifest) {
      return null;
    }
    return {
      _id: manifest._id,
      backupDate: manifest.backupDate,
      buildCount: manifest.buildCount,
      capturedAt: manifest.capturedAt,
      documentsCount: manifest.documentsCount,
      failureReason: manifest.failureReason,
      manifestSha256: manifest.manifestSha256,
      neverPersistedControls: manifest.neverPersistedControls,
      organizationId: manifest.organizationId,
      relationshipCount: manifest.relationshipCount,
      revisionLineageCount: manifest.revisionLineageCount,
      rpoDeadlineAt: manifest.rpoDeadlineAt,
      state: manifest.state,
      storageBytes: manifest.storageBytes,
      storageObjectsCount: manifest.storageObjectsCount,
      verifiedAt: manifest.verifiedAt,
    };
  })
  .public();

export const recordDataRetentionBackupManifest = internalMutation
  .input({
    backupDate: v.string(),
    brokerageId: v.id("brokerages"),
    buildCount: v.number(),
    capturedAt: v.number(),
    documentsCount: v.number(),
    failureReason: v.optional(v.string()),
    manifestJson: v.string(),
    manifestSha256: v.string(),
    neverPersistedControls: v.optional(v.array(v.string())),
    organizationId: v.string(),
    relationshipCount: v.number(),
    revisionLineageCount: v.number(),
    rpoDeadlineAt: v.number(),
    state: v.union(
      v.literal("pending"),
      v.literal("verified"),
      v.literal("failed")
    ),
    storageBytes: v.number(),
    storageObjectsCount: v.number(),
  })
  .returns(v.id("dataRetentionBackupManifests"))
  .handler(async (ctx, args) => {
    const manifestJson = boundedJson(args.manifestJson, "Backup manifest");
    const manifestSha256 = await sha256Hex(manifestJson);
    if (manifestSha256 !== args.manifestSha256.toLowerCase()) {
      throw new ConvexError(
        "Backup manifest SHA-256 does not match its canonical JSON body."
      );
    }
    const now = Date.now();
    if (
      !backupManifestEligibleAt({
        capturedAt: args.capturedAt,
        restoreRequestedAt: args.capturedAt,
        rpoDeadlineAt: args.rpoDeadlineAt,
      })
    ) {
      throw new ConvexError("Backup manifest RPO may not exceed 24 hours.");
    }
    const build = await ctx.db
      .query("activeBuilds")
      .withIndex("by_organizationId", (query) =>
        query.eq("organizationId", args.organizationId)
      )
      .filter((query) => query.eq(query.field("brokerageId"), args.brokerageId))
      .first();
    if (!build) {
      throw new ConvexError("Backup manifest organization is unavailable.");
    }
    const existing = await ctx.db
      .query("dataRetentionBackupManifests")
      .withIndex("by_organizationId_and_backupDate", (query) =>
        query
          .eq("organizationId", args.organizationId)
          .eq("backupDate", args.backupDate)
      )
      .unique();
    if (existing) {
      if (existing.brokerageId !== args.brokerageId) {
        throw new ConvexError(
          "Backup manifest brokerage does not match the declared tenant scope."
        );
      }
      if (existing.manifestSha256 !== args.manifestSha256) {
        throw new ConvexError("Backup date already has a different manifest.");
      }
      if (
        existing.state !== args.state ||
        existing.failureReason !== args.failureReason ||
        existing.manifestJson !== manifestJson ||
        existing.capturedAt !== args.capturedAt ||
        existing.rpoDeadlineAt !== args.rpoDeadlineAt ||
        existing.buildCount !== args.buildCount ||
        existing.documentsCount !== args.documentsCount ||
        existing.relationshipCount !== args.relationshipCount ||
        existing.revisionLineageCount !== args.revisionLineageCount ||
        existing.storageBytes !== args.storageBytes ||
        existing.storageObjectsCount !== args.storageObjectsCount
      ) {
        await ctx.db.patch(existing._id, {
          buildCount: args.buildCount,
          capturedAt: args.capturedAt,
          documentsCount: args.documentsCount,
          failureReason: args.failureReason,
          manifestJson,
          neverPersistedControls: args.neverPersistedControls ?? [
            ...NEVER_PERSISTED_RETENTION_CONTROLS,
          ],
          relationshipCount: args.relationshipCount,
          revisionLineageCount: args.revisionLineageCount,
          rpoDeadlineAt: args.rpoDeadlineAt,
          state: args.state,
          storageBytes: args.storageBytes,
          storageObjectsCount: args.storageObjectsCount,
          verifiedAt: args.state === "verified" ? now : undefined,
        });
      }
      return existing._id;
    }
    return await ctx.db.insert("dataRetentionBackupManifests", {
      backupDate: args.backupDate,
      brokerageId: args.brokerageId,
      buildCount: args.buildCount,
      capturedAt: args.capturedAt,
      createdByWorkosUserId: "system:backup-manifest",
      documentsCount: args.documentsCount,
      failureReason: args.failureReason,
      manifestJson,
      manifestSha256: args.manifestSha256,
      neverPersistedControls: args.neverPersistedControls ?? [
        ...NEVER_PERSISTED_RETENTION_CONTROLS,
      ],
      organizationId: args.organizationId,
      relationshipCount: args.relationshipCount,
      revisionLineageCount: args.revisionLineageCount,
      rpoDeadlineAt: args.rpoDeadlineAt,
      state: args.state,
      storageBytes: args.storageBytes,
      storageObjectsCount: args.storageObjectsCount,
      verifiedAt: args.state === "verified" ? now : undefined,
    });
  })
  .internal();

export const startDataRetentionRestore = authenticatedMutation
  .input({
    ...administrativeOverrideInputFields,
    buildId: v.id("activeBuilds"),
    confirmed: v.boolean(),
    correctionHistoryJson: v.string(),
    freshBackupManifestId: v.id("dataRetentionBackupManifests"),
    incidentReference: v.string(),
    organizationId: v.string(),
    reason: v.string(),
  })
  .returns(
    v.object({
      completionDeadlineAt: v.number(),
      incidentId: v.id("dataRetentionRestoreIncidents"),
      startDeadlineAt: v.number(),
      state: v.literal("started"),
    })
  )
  .handler(async (ctx, args) => {
    if (!args.confirmed) {
      throw new ConvexError(
        "Explicit confirmation is required to restore data."
      );
    }
    const reason = requiredAdministrativeReason(
      args.reason,
      "A restore reason"
    );
    const baseAuthorization = await authorizeActiveBuildAccess(ctx, args);
    const { authorization, breakGlass } = await authorizeAdministrativeRecovery(
      ctx,
      baseAuthorization,
      { ...args, reason }
    );
    if (!breakGlass) {
      throw new ConvexError(
        "Destructive restore requires Brokerage Admin break-glass authority."
      );
    }
    const incidentReference = requiredText(
      args.incidentReference,
      "Incident reference",
      200
    );
    const existingIncident = await ctx.db
      .query("dataRetentionRestoreIncidents")
      .withIndex("by_organizationId_and_incidentReference", (query) =>
        query
          .eq("organizationId", authorization.organizationId)
          .eq("incidentReference", incidentReference)
      )
      .unique();
    if (existingIncident?.state === "started") {
      return {
        completionDeadlineAt: existingIncident.targetCompletionDeadlineAt,
        incidentId: existingIncident._id,
        startDeadlineAt: existingIncident.targetStartDeadlineAt,
        state: "started" as const,
      };
    }
    if (existingIncident) {
      throw new ConvexError(
        "Restore incident reference already identifies a terminal restore."
      );
    }
    const manifest = await ctx.db.get(args.freshBackupManifestId);
    const now = Date.now();
    if (
      !manifest ||
      manifest.organizationId !== authorization.organizationId ||
      manifest.brokerageId !== authorization.brokerage._id ||
      manifest.state !== "verified" ||
      !backupManifestEligibleAt({
        capturedAt: manifest.capturedAt,
        restoreRequestedAt: now,
        rpoDeadlineAt: manifest.rpoDeadlineAt,
      })
    ) {
      throw new ConvexError(
        "A fresh verified backup manifest is required before restore."
      );
    }
    const incidentId = await ctx.db.insert("dataRetentionRestoreIncidents", {
      auditEventId: undefined,
      breakGlassConfirmed: true,
      brokerageId: authorization.brokerage._id,
      buildId: authorization.build._id,
      correctionHistoryJson: boundedJson(args.correctionHistoryJson),
      createdByWorkosUserId: authorization.viewer.subject,
      incidentReference,
      organizationId: authorization.organizationId,
      reason,
      freshBackupManifestId: manifest._id,
      startedAt: now,
      state: "started",
      targetCompletionDeadlineAt: now + RESTORE_COMPLETE_RTO_MS,
      targetStartDeadlineAt: now + RESTORE_START_RTO_MS,
    });
    const auditEventId = await appendGovernedAuditEvent(ctx, authorization, {
      breakGlass: true,
      command: "startDataRetentionRestore",
      entityId: incidentId,
      entityType: "dataRetentionRestoreIncident",
      eventType: "data_retention.restore.started",
      newState: { state: "started", freshBackupManifestId: manifest._id },
      now,
      overrideKind: "destructive_restore",
      priorState: { state: "not_started" },
      reason,
      targetRevisions: [
        {
          entityId: String(incidentId),
          entityType: "dataRetentionRestoreIncident",
        },
      ],
      warnings: ["RESTORE_REQUIRES_CORRECTION_HISTORY_REVIEW"],
    });
    await ctx.db.patch(incidentId, { auditEventId });
    return {
      completionDeadlineAt: now + RESTORE_COMPLETE_RTO_MS,
      incidentId,
      startDeadlineAt: now + RESTORE_START_RTO_MS,
      state: "started" as const,
    };
  })
  .public();

export const completeDataRetentionRestore = internalMutation
  .input({
    correctionHistoryJson: v.string(),
    incidentId: v.id("dataRetentionRestoreIncidents"),
    succeeded: v.boolean(),
  })
  .returns(v.null())
  .handler(async (ctx, args) => {
    const incident = await ctx.db.get(args.incidentId);
    if (!incident || incident.state !== "started") {
      return null;
    }
    await ctx.db.patch(incident._id, {
      completedAt: Date.now(),
      correctionHistoryJson: boundedJson(args.correctionHistoryJson),
      state: args.succeeded ? "completed" : "failed",
    });
    return null;
  })
  .internal();

export const runQuarterlyDataRetentionDrill = internalMutation
  .input({
    backupManifestId: v.id("dataRetentionBackupManifests"),
    isolatedAccessBoundaryValidated: v.boolean(),
    isolatedNamespace: v.string(),
    organizationId: v.string(),
    productionStorageCredentialFingerprint: v.string(),
    productionTenantCredentialFingerprint: v.string(),
    quarterKey: v.string(),
    restoredBuildCount: v.number(),
    restoredDocumentsCount: v.number(),
    restoredRelationshipCount: v.number(),
    restoredRevisionLineageCount: v.number(),
    restoredSampleSourceSha256: v.string(),
    restoredStorageBytes: v.number(),
    restoredStorageObjectsCount: v.number(),
    productionAccessDenied: v.boolean(),
    storageCredentialFingerprint: v.string(),
    tenantCredentialFingerprint: v.string(),
  })
  .returns(v.id("dataRetentionDrills"))
  .handler(async (ctx, args) => {
    const quarterKey = requiredText(args.quarterKey, "Quarter key", 32);
    const existing = await ctx.db
      .query("dataRetentionDrills")
      .withIndex("by_organizationId_and_quarterKey", (query) =>
        query
          .eq("organizationId", args.organizationId)
          .eq("quarterKey", quarterKey)
      )
      .unique();
    if (existing) {
      return existing._id;
    }
    const manifest = await ctx.db.get(args.backupManifestId);
    if (
      !manifest ||
      manifest.organizationId !== args.organizationId ||
      manifest.state !== "verified"
    ) {
      throw new ConvexError(
        "Quarterly drill requires a verified tenant backup manifest."
      );
    }
    const isolatedNamespace = requiredText(
      args.isolatedNamespace,
      "Isolated drill namespace",
      200
    );
    if (
      PRODUCTION_NAMESPACE_PATTERN.test(isolatedNamespace) ||
      !isolatedNamespace.toLowerCase().startsWith("retention-drill-")
    ) {
      throw new ConvexError(
        "Quarterly drill namespace must be an explicit non-production retention-drill namespace."
      );
    }
    if (
      !(args.isolatedAccessBoundaryValidated && args.productionAccessDenied)
    ) {
      throw new ConvexError(
        "Quarterly drill requires validated isolated access boundaries and denied production access."
      );
    }
    const tenantCredentialFingerprint = requiredText(
      args.tenantCredentialFingerprint,
      "Drill tenant credential fingerprint",
      200
    );
    const storageCredentialFingerprint = requiredText(
      args.storageCredentialFingerprint,
      "Drill storage credential fingerprint",
      200
    );
    const productionTenantCredentialFingerprint = requiredText(
      args.productionTenantCredentialFingerprint,
      "Production tenant credential fingerprint",
      200
    );
    const productionStorageCredentialFingerprint = requiredText(
      args.productionStorageCredentialFingerprint,
      "Production storage credential fingerprint",
      200
    );
    const isolatedFingerprints = [
      tenantCredentialFingerprint,
      storageCredentialFingerprint,
    ];
    const productionFingerprints = [
      productionTenantCredentialFingerprint,
      productionStorageCredentialFingerprint,
    ];
    if (
      tenantCredentialFingerprint === storageCredentialFingerprint ||
      isolatedFingerprints.some((isolated) =>
        productionFingerprints.includes(isolated)
      )
    ) {
      throw new ConvexError(
        "Quarterly drill requires separate isolated tenant and storage credentials."
      );
    }
    const restoredSampleSourceSha256 = requiredText(
      args.restoredSampleSourceSha256,
      "Restored sample source SHA-256",
      200
    );
    const sampleSha256 = await sha256Hex(
      `${isolatedNamespace}:${restoredSampleSourceSha256}`
    );
    const isolationEvidenceSha256 = await sha256Hex(
      [
        isolatedNamespace,
        tenantCredentialFingerprint,
        storageCredentialFingerprint,
        productionTenantCredentialFingerprint,
        productionStorageCredentialFingerprint,
        String(args.isolatedAccessBoundaryValidated),
        String(args.productionAccessDenied),
      ].join(":")
    );
    const failures = [
      args.restoredBuildCount === 0 ? "No Builds were restored." : undefined,
      args.restoredRelationshipCount === 0
        ? "No relationships were restored."
        : undefined,
      args.restoredRevisionLineageCount === 0
        ? "No Cost Document revision lineage was restored."
        : undefined,
      args.restoredBuildCount === manifest.buildCount
        ? undefined
        : `Build count mismatch: expected ${manifest.buildCount}, observed ${args.restoredBuildCount}.`,
      args.restoredRelationshipCount === manifest.relationshipCount
        ? undefined
        : `Relationship count mismatch: expected ${manifest.relationshipCount}, observed ${args.restoredRelationshipCount}.`,
      args.restoredRevisionLineageCount === manifest.revisionLineageCount
        ? undefined
        : `Revision lineage mismatch: expected ${manifest.revisionLineageCount}, observed ${args.restoredRevisionLineageCount}.`,
      args.restoredDocumentsCount === manifest.documentsCount
        ? undefined
        : `Document count mismatch: expected ${manifest.documentsCount}, observed ${args.restoredDocumentsCount}.`,
      args.restoredStorageBytes === manifest.storageBytes
        ? undefined
        : `Storage byte mismatch: expected ${manifest.storageBytes}, observed ${args.restoredStorageBytes}.`,
      args.restoredStorageObjectsCount === manifest.storageObjectsCount
        ? undefined
        : `Storage object mismatch: expected ${manifest.storageObjectsCount}, observed ${args.restoredStorageObjectsCount}.`,
    ].filter((failure): failure is string => Boolean(failure));
    const now = Date.now();
    return await ctx.db.insert("dataRetentionDrills", {
      backupManifestId: manifest._id,
      buildCount: args.restoredBuildCount,
      brokerageId: manifest.brokerageId,
      completedAt: now,
      createdByWorkosUserId: "system:quarterly-retention-drill",
      failureReason: failures.length > 0 ? failures.join(" ") : undefined,
      isolatedNamespace,
      isolationEvidenceSha256,
      organizationId: args.organizationId,
      passed: failures.length === 0,
      quarterKey,
      relationshipCount: args.restoredRelationshipCount,
      revisionLineageCount: args.restoredRevisionLineageCount,
      sampleSha256,
      startedAt: now,
    });
  })
  .internal();

export const approveAndDeleteDataRetentionFile = authenticatedMutation
  .input({
    ...administrativeOverrideInputFields,
    assetId: v.id("buildCollaborationAssets"),
    buildId: v.id("activeBuilds"),
    confirmed: v.boolean(),
    organizationId: v.string(),
    reason: v.string(),
  })
  .returns(
    v.object({
      assetId: v.id("buildCollaborationAssets"),
      tombstoneId: v.id("dataRetentionTombstones"),
    })
  )
  .handler(async (ctx, args) => {
    if (!args.confirmed) {
      throw new ConvexError(
        "Explicit approval is required before physical file deletion."
      );
    }
    const reason = requiredAdministrativeReason(
      args.reason,
      "A physical deletion reason"
    );
    const baseAuthorization = await authorizeActiveBuildAccess(ctx, args);
    const { authorization, breakGlass } = await authorizeAdministrativeRecovery(
      ctx,
      baseAuthorization,
      {
        ...args,
        reason,
      }
    );
    if (authorization.effectiveRole.role !== "admin") {
      throw new ConvexError(
        "Physical file deletion requires Brokerage Admin break-glass authority."
      );
    }
    requireRetentionTombstoneHmacKey();
    const asset = await ctx.db.get(args.assetId);
    if (
      !asset ||
      asset.buildId !== authorization.build._id ||
      asset.organizationId !== authorization.organizationId ||
      asset.brokerageId !== authorization.brokerage._id
    ) {
      throw new ConvexError("Asset is unavailable for physical deletion.");
    }
    if (asset.state === "available" || asset.publishedAt) {
      throw new ConvexError(
        "Published or available assets require a governed record disposition before deletion."
      );
    }
    if (
      await hasActiveBuildRetentionHold(ctx, {
        buildId: authorization.build._id,
        organizationId: authorization.organizationId,
      })
    ) {
      throw new ConvexError("Active legal hold blocks physical file deletion.");
    }
    const operationKey = `physical-file:${asset._id}`;
    const existing = await findOperation(
      ctx,
      authorization.organizationId,
      operationKey
    );
    if (existing?.state === "completed") {
      const tombstone = await findTombstone(
        ctx,
        "buildCollaborationAsset",
        String(asset._id)
      );
      if (!tombstone) {
        throw new ConvexError("Completed deletion is missing its tombstone.");
      }
      return { assetId: asset._id, tombstoneId: tombstone._id };
    }
    const now = Date.now();
    const operation =
      existing ??
      (await ctx.db
        .insert("dataRetentionOperations", {
          brokerageId: authorization.brokerage._id,
          buildId: authorization.build._id,
          operationKey,
          operationKind: "physical_file",
          organizationId: authorization.organizationId,
          reasonCode: "approved_physical_file_delete",
          scopeId: String(asset._id),
          scopeKind: "buildCollaborationAsset",
          startedAt: now,
          state: "started",
          updatedAt: now,
        })
        .then((id) => ctx.db.get(id)));
    if (!operation) {
      throw new ConvexError(
        "Physical deletion operation could not be initialized."
      );
    }
    if (!asset.storageDeletedAt) {
      if (
        await hasActiveBuildRetentionHold(ctx, {
          buildId: authorization.build._id,
          organizationId: authorization.organizationId,
        })
      ) {
        throw new ConvexError(
          "Active legal hold blocks physical file deletion."
        );
      }
      await deleteStorageIfPresent(ctx, asset.storageId);
    }
    await ctx.db.patch(asset._id, {
      scanCompletedAt: now,
      scanMessage:
        "Physical file deleted under approved retention disposition.",
      scanState: "rejected",
      state: "rejected",
      storageDeletedAt: now,
      updatedAt: now,
    });
    const tombstoneId = await addTombstone(ctx, {
      build: authorization.build,
      completedAt: now,
      lifecycleState: asset.state,
      operation,
      physicalStorageDeletedAt: now,
      revisionCount: asset.version,
      scopeId: String(asset._id),
      scopeKind: "buildCollaborationAsset",
      sourceHashSha256: asset.contentHashSha256,
      tombstoneExpiresAt: now + TOMBSTONE_RETENTION_MS,
    });
    const auditEventId = await appendGovernedAuditEvent(ctx, authorization, {
      breakGlass,
      command: "approveAndDeleteDataRetentionFile",
      entityId: asset._id,
      entityType: "buildCollaborationAsset",
      eventType: "data_retention.physical_file.deleted",
      newState: { storageDeleted: true, tombstoneId },
      now,
      overrideKind: "retention_purge",
      priorState: { state: asset.state },
      reason,
      targetRevisions: [
        {
          entityId: String(asset._id),
          entityType: "buildCollaborationAsset",
          revision: asset.version,
        },
      ],
    });
    await ctx.db.patch(tombstoneId, { auditEventId });
    await completeOperation(ctx, operation, 1, now);
    return { assetId: asset._id, tombstoneId };
  })
  .public();

async function tenantSetting(
  ctx: QueryCtx | MutationCtx,
  organizationId: string
) {
  return await ctx.db
    .query("buildCollaborationTenantSettings")
    .withIndex("by_organizationId", (query) =>
      query.eq("organizationId", organizationId)
    )
    .unique();
}

async function activeTenantPolicy(
  ctx: QueryCtx | MutationCtx,
  organizationId: string,
  brokerageId: Id<"brokerages">
) {
  const policy = await ctx.db
    .query("dataRetentionTenantPolicies")
    .withIndex("by_organizationId_and_state", (query) =>
      query.eq("organizationId", organizationId).eq("state", "active")
    )
    .unique();
  if (policy && policy.brokerageId !== brokerageId) {
    throw new ConvexError("Retention policy tenancy is invalid.");
  }
  return policy;
}

async function ensureTenantPolicy(
  ctx: MutationCtx,
  build: Doc<"activeBuilds">,
  now: number
) {
  const current = await activeTenantPolicy(
    ctx,
    build.organizationId,
    build.brokerageId
  );
  if (current) {
    return current;
  }
  const id = await ctx.db.insert("dataRetentionTenantPolicies", {
    baselineYears: BASELINE_RETENTION_YEARS,
    brokerageId: build.brokerageId,
    createdAt: now,
    createdByWorkosUserId: "system:retention-policy-default",
    extensionDays: 0,
    organizationId: build.organizationId,
    reason: "Platform baseline retention policy.",
    state: "active",
    version: 1,
  });
  const policy = await ctx.db.get(id);
  if (!policy) {
    throw new ConvexError("Default retention policy could not be created.");
  }
  return policy;
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: The schedule derivation deliberately keeps closure, policy, archive, hold, and persisted-projection decisions in one atomic reconciliation path.
async function deriveBuildSchedule(
  ctx: MutationCtx,
  buildId: Id<"activeBuilds">,
  asOf: number
) {
  const build = await ctx.db.get(buildId);
  if (!build) {
    return null;
  }
  const policy = await ensureTenantPolicy(ctx, build, asOf);
  const lifecycle = await ctx.db
    .query("buildCollaborationBuildStates")
    .withIndex("by_buildId", (query) => query.eq("buildId", build._id))
    .unique();
  const facilities = await ctx.db
    .query("loanFacilities")
    .withIndex("by_build", (query) => query.eq("buildId", build._id))
    .take(21);
  if (facilities.length > 20) {
    throw new ConvexError(
      "Retention schedule derivation exceeded the bounded loan facility limit."
    );
  }
  const allFacilitiesClosed = facilities.every(
    (facility) => facility.status === "closed"
  );
  const allFacilityClosuresExplicit = facilities.every(
    (facility) => facility.closedAt !== undefined
  );
  const loanClosedAt =
    facilities.length > 0 && allFacilitiesClosed && allFacilityClosuresExplicit
      ? facilities
          .map((facility) => facility.closedAt)
          .reduce<number | undefined>(
            (latest, value) =>
              value !== undefined && (latest === undefined || value > latest)
                ? value
                : latest,
            undefined
          )
      : undefined;
  const buildClosedAt = lifecycle?.closedAt;
  const laterClosureAt =
    buildClosedAt !== undefined &&
    (facilities.length === 0 || loanClosedAt !== undefined)
      ? Math.max(buildClosedAt, loanClosedAt ?? buildClosedAt)
      : undefined;
  const baselineRetainUntil = laterClosureAt
    ? baselineRetentionDeadline(laterClosureAt)
    : undefined;
  const retainUntil = baselineRetainUntil
    ? baselineRetainUntil + policy.extensionDays * DAY_MS
    : undefined;
  const setting = await tenantSetting(ctx, build.organizationId);
  const held = await hasActiveBuildRetentionHold(ctx, {
    buildId: build._id,
    organizationId: build.organizationId,
  });
  const current = await ctx.db
    .query("dataRetentionSchedules")
    .withIndex("by_buildId", (query) => query.eq("buildId", build._id))
    .unique();
  const state =
    current?.state === "purged"
      ? "purged"
      : setting?.serviceLifecycle === "restricted_archive"
        ? "restricted_archive"
        : held
          ? "held"
          : retainUntil && retainUntil <= asOf
            ? "eligible"
            : "active";
  const changed = Boolean(
    !current ||
      current.policyVersion !== policy.version ||
      current.buildClosedAt !== buildClosedAt ||
      current.loanClosedAt !== loanClosedAt ||
      current.laterClosureAt !== laterClosureAt ||
      current.baselineRetainUntil !== baselineRetainUntil ||
      current.retainUntil !== retainUntil ||
      current.state !== state
  );
  const values = {
    baselineRetainUntil,
    buildClosedAt,
    derivedAt: asOf,
    lastReconciledAt: asOf,
    loanClosedAt,
    laterClosureAt,
    policyId: policy._id,
    policyVersion: policy.version,
    retainUntil,
    revision: (current?.revision ?? 0) + (changed ? 1 : 0),
    state,
  } as const;
  if (!current) {
    const id = await ctx.db.insert("dataRetentionSchedules", {
      brokerageId: build.brokerageId,
      buildId: build._id,
      organizationId: build.organizationId,
      ...values,
    });
    const schedule = await ctx.db.get(id);
    return schedule ? { priorState: undefined, schedule } : null;
  }
  await ctx.db.patch(current._id, values);
  const schedule = await ctx.db.get(current._id);
  return schedule ? { priorState: current.state, schedule } : null;
}

function projectSchedule(schedule: Doc<"dataRetentionSchedules">) {
  return {
    _id: schedule._id,
    baselineRetainUntil: schedule.baselineRetainUntil,
    baselineRetentionYears: BASELINE_RETENTION_YEARS,
    buildClosedAt: schedule.buildClosedAt,
    buildId: schedule.buildId,
    lastReconciledAt: schedule.lastReconciledAt,
    loanClosedAt: schedule.loanClosedAt,
    laterClosureAt: schedule.laterClosureAt,
    organizationId: schedule.organizationId,
    policyVersion: schedule.policyVersion,
    retainUntil: schedule.retainUntil,
    revision: schedule.revision,
    state: schedule.state,
  };
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: The bounded retention pass intentionally coordinates independent disposal windows atomically per Build.
async function sweepBuildRetention(
  ctx: MutationCtx,
  build: Doc<"activeBuilds">,
  asOf: number
) {
  const totals = {
    blockedByLegalHold: 0,
    completedOperations: 0,
    deletedOrRedactedCount: 0,
    markedRecoveryCount: 0,
    tombstoneCount: 0,
  };
  const [legacyDrafts, activeDrafts, recoveryDrafts] = await Promise.all([
    ctx.db
      .query("quoteInvitationResponseDrafts")
      .withIndex(
        "by_buildId_and_retentionState_and_retentionNextCheckAt",
        (query) =>
          query
            .eq("buildId", build._id)
            .eq("retentionState", undefined)
            .eq("retentionNextCheckAt", undefined)
      )
      .take(MAX_ROWS_PER_SWEEP),
    ctx.db
      .query("quoteInvitationResponseDrafts")
      .withIndex(
        "by_buildId_and_retentionState_and_retentionNextCheckAt",
        (query) =>
          query
            .eq("buildId", build._id)
            .eq("retentionState", "active")
            .lte("retentionNextCheckAt", asOf)
      )
      .take(MAX_ROWS_PER_SWEEP),
    ctx.db
      .query("quoteInvitationResponseDrafts")
      .withIndex("by_buildId_and_retentionState_and_purgeEligibleAt", (query) =>
        query
          .eq("buildId", build._id)
          .eq("retentionState", "recovery")
          .lte("purgeEligibleAt", asOf)
      )
      .take(MAX_ROWS_PER_SWEEP),
  ]);
  const drafts = [...legacyDrafts, ...activeDrafts, ...recoveryDrafts].slice(
    0,
    MAX_ROWS_PER_SWEEP
  );
  for (const draft of drafts) {
    if (
      draft.organizationId !== build.organizationId ||
      draft.brokerageId !== build.brokerageId
    ) {
      continue;
    }
    const round = await ctx.db.get(draft.quoteRoundId);
    if (!round || (round.state !== "closed" && round.state !== "cancelled")) {
      await ctx.db.patch(draft._id, {
        retentionNextCheckAt: asOf + DAY_MS,
        retentionState: "active",
      });
      continue;
    }
    const terminalAt = draft.terminalAt ?? round.cancelledAt ?? round.closedAt;
    if (!terminalAt) {
      await ctx.db.patch(draft._id, {
        retentionNextCheckAt: asOf + DAY_MS,
        retentionState: "active",
      });
      continue;
    }
    const purgeEligibleAt =
      draft.purgeEligibleAt ?? terminalAt + QUOTE_DRAFT_RECOVERY_DAYS * DAY_MS;
    if (asOf < purgeEligibleAt) {
      if (
        draft.retentionState !== "recovery" ||
        draft.terminalAt !== terminalAt
      ) {
        await ctx.db.patch(draft._id, {
          purgeEligibleAt,
          retentionNextCheckAt: undefined,
          retentionState: "recovery",
          terminalAt,
        });
        totals.markedRecoveryCount += 1;
      }
      continue;
    }
    const operation = await beginOperation(ctx, {
      build,
      operationKey: `quote-draft:${draft._id}:${terminalAt}`,
      operationKind: "quote_draft",
      reasonCode: "terminal_quote_draft_expired",
      scopeId: String(draft._id),
      scopeKind: "quoteInvitationResponseDraft",
      now: asOf,
    });
    if (!operation || operation.state === "completed") {
      continue;
    }
    if (
      await hasActiveBuildRetentionHold(ctx, {
        buildId: build._id,
        organizationId: build.organizationId,
      })
    ) {
      await blockOperation(
        ctx,
        operation,
        "Active legal hold blocks Quote Draft purge.",
        asOf
      );
      totals.blockedByLegalHold += 1;
      continue;
    }
    const deletion = await deleteQuoteDraftChildren(ctx, build, draft._id);
    totals.deletedOrRedactedCount += deletion.deletedCount;
    const totalDeletedCount =
      (operation.affectedCount ?? 0) + deletion.deletedCount;
    if (!deletion.complete) {
      await ctx.db.patch(operation._id, {
        affectedCount: totalDeletedCount,
        updatedAt: asOf,
      });
      continue;
    }
    await ctx.db.patch(draft._id, {
      attachmentCount: 0,
      commentsHtml: undefined,
      purgedAt: asOf,
      retentionNextCheckAt: undefined,
      retentionState: "purged",
      purgeEligibleAt,
      terminalAt,
      updatedAt: asOf,
      version: draft.version + 1,
    });
    await completeOperation(ctx, operation, totalDeletedCount, asOf);
    const tombstoneId = await addTombstone(ctx, {
      build,
      completedAt: asOf,
      lifecycleState: "terminal_draft",
      operation,
      revisionCount: draft.version,
      scopeId: String(draft._id),
      scopeKind: "quoteInvitationResponseDraft",
      tombstoneExpiresAt: asOf + TOMBSTONE_RETENTION_MS,
    });
    const auditEventId = await recordSystemAudit(ctx, build, {
      command: "runDataRetentionMaintenance",
      entityId: draft._id,
      entityType: "quoteInvitationResponseDraft",
      eventType: "data_retention.quote_draft.purged",
      newState: {
        childRows: totalDeletedCount,
        retentionState: "purged",
        tombstoneId,
      },
      reason: "Terminal Quote Draft recovery window elapsed.",
      now: asOf,
    });
    await ctx.db.patch(tombstoneId, { auditEventId });
    totals.completedOperations += 1;
    totals.tombstoneCount += 1;
  }
  totals.deletedOrRedactedCount += await sweepCostUploadStaging(
    ctx,
    build,
    asOf,
    totals
  );
  totals.deletedOrRedactedCount += await sweepIsolatedAssets(
    ctx,
    build,
    asOf,
    totals
  );
  totals.deletedOrRedactedCount += await sweepCredentialMaterial(
    ctx,
    build,
    asOf,
    totals
  );
  return totals;
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Cost and Quote staging require ownership, hold, storage-bound, and tombstone guards in one bounded pass.
async function sweepCostUploadStaging(
  ctx: MutationCtx,
  build: Doc<"activeBuilds">,
  asOf: number,
  totals: {
    blockedByLegalHold: number;
    completedOperations: number;
    deletedOrRedactedCount: number;
    markedRecoveryCount: number;
    tombstoneCount: number;
  }
) {
  let count = 0;
  const [openSessions, finalizedSessions] = await Promise.all([
    ctx.db
      .query("buildCollaborationAssetStagingSessions")
      .withIndex(
        "by_buildId_and_contextKind_and_state_and_expiresAt",
        (query) =>
          query
            .eq("buildId", build._id)
            .eq("contextKind", "costDocumentDraft")
            .eq("state", "open")
            .lte("expiresAt", asOf)
      )
      .take(MAX_ROWS_PER_SWEEP),
    ctx.db
      .query("buildCollaborationAssetStagingSessions")
      .withIndex(
        "by_buildId_and_contextKind_and_state_and_expiresAt",
        (query) =>
          query
            .eq("buildId", build._id)
            .eq("contextKind", "costDocumentDraft")
            .eq("state", "finalized")
            .lte("expiresAt", asOf)
      )
      .take(MAX_ROWS_PER_SWEEP),
  ]);
  const sessions = [...openSessions, ...finalizedSessions].slice(
    0,
    MAX_ROWS_PER_SWEEP
  );
  for (const session of sessions) {
    if (
      session.organizationId !== build.organizationId ||
      session.brokerageId !== build.brokerageId
    ) {
      continue;
    }
    const operation = await beginOperation(ctx, {
      build,
      operationKey: `cost-upload:${session._id}:${session.expiresAt}`,
      operationKind: "cost_upload",
      reasonCode: "staged_cost_upload_expired",
      scopeId: String(session._id),
      scopeKind: "buildCollaborationAssetStagingSession",
      now: asOf,
    });
    if (!operation || operation.state === "completed") {
      continue;
    }
    if (
      await hasActiveBuildRetentionHold(ctx, {
        buildId: build._id,
        organizationId: build.organizationId,
      })
    ) {
      await blockOperation(
        ctx,
        operation,
        "Active legal hold blocks staged Cost upload purge.",
        asOf
      );
      totals.blockedByLegalHold += 1;
      continue;
    }
    const asset = session.assetId ? await ctx.db.get(session.assetId) : null;
    let deleted = 0;
    if (session.pendingStorageId && !asset) {
      const pendingStorageId = session.pendingStorageId;
      const bound = await ctx.db
        .query("buildCollaborationAssetStagingSessions")
        .withIndex("by_pendingStorageId", (query) =>
          query.eq("pendingStorageId", pendingStorageId)
        )
        .take(2);
      if (bound.length === 1 && bound[0]?._id === session._id) {
        await assertRetentionDeletionAllowed(ctx, build);
        await deleteStorageIfPresent(ctx, pendingStorageId);
        deleted = 1;
      }
    }
    if (
      asset &&
      !asset.storageDeletedAt &&
      !asset.publishedAt &&
      asset.state !== "available"
    ) {
      await assertRetentionDeletionAllowed(ctx, build);
      await deleteStorageIfPresent(ctx, asset.storageId);
      await ctx.db.patch(asset._id, {
        scanCompletedAt: asOf,
        scanMessage: "Cost upload staging retention expired.",
        scanState: "rejected",
        state: "rejected",
        storageDeletedAt: asOf,
        updatedAt: asOf,
      });
      deleted = 1;
    }
    await ctx.db.patch(session._id, { state: "abandoned", updatedAt: asOf });
    await completeOperation(ctx, operation, deleted, asOf);
    await addSystemAuditedTombstone(
      ctx,
      {
        build,
        completedAt: asOf,
        lifecycleState: "staged_cost_upload",
        operation,
        scopeId: String(session._id),
        scopeKind: "buildCollaborationAssetStagingSession",
        tombstoneExpiresAt: asOf + TOMBSTONE_RETENTION_MS,
      },
      {
        command: "runDataRetentionMaintenance",
        entityId: session._id,
        entityType: "buildCollaborationAssetStagingSession",
        eventType: "data_retention.cost_upload_staging.purged",
        newState: { storageDeleted: deleted === 1 },
        now: asOf,
        reason: "Staged Cost upload retention window elapsed.",
      }
    );
    totals.completedOperations += 1;
    totals.tombstoneCount += 1;
    count += deleted;
  }
  const [openQuoteSessions, finalizedQuoteSessions] = await Promise.all([
    ctx.db
      .query("quoteInvitationResponseDraftAttachmentStagingSessions")
      .withIndex("by_buildId_and_state_and_expiresAt", (query) =>
        query
          .eq("buildId", build._id)
          .eq("state", "open")
          .lte("expiresAt", asOf)
      )
      .take(MAX_ROWS_PER_SWEEP),
    ctx.db
      .query("quoteInvitationResponseDraftAttachmentStagingSessions")
      .withIndex("by_buildId_and_state_and_expiresAt", (query) =>
        query
          .eq("buildId", build._id)
          .eq("state", "finalized")
          .lte("expiresAt", asOf)
      )
      .take(MAX_ROWS_PER_SWEEP),
  ]);
  const quoteSessions = [...openQuoteSessions, ...finalizedQuoteSessions].slice(
    0,
    MAX_ROWS_PER_SWEEP
  );
  for (const session of quoteSessions) {
    if (
      session.organizationId !== build.organizationId ||
      session.brokerageId !== build.brokerageId
    ) {
      continue;
    }
    const operation = await beginOperation(ctx, {
      build,
      operationKey: `quote-upload:${session._id}:${session.expiresAt}`,
      operationKind: "cost_upload",
      reasonCode: "staged_quote_upload_expired",
      scopeId: String(session._id),
      scopeKind: "quoteInvitationResponseDraftAttachmentStagingSession",
      now: asOf,
    });
    if (!operation || operation.state === "completed") {
      continue;
    }
    if (
      await hasActiveBuildRetentionHold(ctx, {
        buildId: build._id,
        organizationId: build.organizationId,
      })
    ) {
      await blockOperation(
        ctx,
        operation,
        "Active legal hold blocks staged Quote upload purge.",
        asOf
      );
      totals.blockedByLegalHold += 1;
      continue;
    }
    let deleted = 0;
    const pendingStorageId = session.pendingStorageId;
    if (pendingStorageId) {
      const bound = await ctx.db
        .query("quoteInvitationResponseDraftAttachments")
        .withIndex("by_storageId", (query) =>
          query.eq("storageId", pendingStorageId)
        )
        .take(1);
      if (bound.length === 0) {
        await assertRetentionDeletionAllowed(ctx, build);
        await deleteStorageIfPresent(ctx, pendingStorageId);
        deleted = 1;
      }
    }
    await ctx.db.patch(session._id, { state: "abandoned", updatedAt: asOf });
    await completeOperation(ctx, operation, deleted, asOf);
    await addSystemAuditedTombstone(
      ctx,
      {
        build,
        completedAt: asOf,
        lifecycleState: "staged_quote_upload",
        operation,
        scopeId: String(session._id),
        scopeKind: "quoteInvitationResponseDraftAttachmentStagingSession",
        tombstoneExpiresAt: asOf + TOMBSTONE_RETENTION_MS,
      },
      {
        command: "runDataRetentionMaintenance",
        entityId: session._id,
        entityType: "quoteInvitationResponseDraftAttachmentStagingSession",
        eventType: "data_retention.quote_upload_staging.purged",
        newState: { storageDeleted: deleted === 1 },
        now: asOf,
        reason: "Staged Quote upload retention window elapsed.",
      }
    );
    totals.completedOperations += 1;
    totals.tombstoneCount += 1;
    count += deleted;
  }
  return count;
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: The bounded fair-state sweep keeps age, tenancy, hold, storage, audit, and tombstone guards in one transaction.
async function sweepIsolatedAssets(
  ctx: MutationCtx,
  build: Doc<"activeBuilds">,
  asOf: number,
  totals: {
    blockedByLegalHold: number;
    completedOperations: number;
    deletedOrRedactedCount: number;
    markedRecoveryCount: number;
    tombstoneCount: number;
  }
) {
  requireRetentionTombstoneHmacKey();
  const oldestEligibleCreatedAt = asOf - ISOLATED_ASSET_RETENTION_DAYS * DAY_MS;
  const [rejectedAssets, quarantinedAssets] = await Promise.all([
    ctx.db
      .query("buildCollaborationAssets")
      .withIndex(
        "by_buildId_and_state_and_storageDeletedAt_and_createdAt",
        (query) =>
          query
            .eq("buildId", build._id)
            .eq("state", "rejected")
            .eq("storageDeletedAt", undefined)
            .lte("createdAt", oldestEligibleCreatedAt)
      )
      .take(MAX_ROWS_PER_SWEEP),
    ctx.db
      .query("buildCollaborationAssets")
      .withIndex(
        "by_buildId_and_state_and_storageDeletedAt_and_createdAt",
        (query) =>
          query
            .eq("buildId", build._id)
            .eq("state", "quarantined")
            .eq("storageDeletedAt", undefined)
            .lte("createdAt", oldestEligibleCreatedAt)
      )
      .take(MAX_ROWS_PER_SWEEP),
  ]);
  const assets: Doc<"buildCollaborationAssets">[] = [];
  for (
    let index = 0;
    assets.length < MAX_ROWS_PER_SWEEP &&
    (index < rejectedAssets.length || index < quarantinedAssets.length);
    index += 1
  ) {
    const rejected = rejectedAssets[index];
    if (rejected) {
      assets.push(rejected);
    }
    const quarantined = quarantinedAssets[index];
    if (quarantined && assets.length < MAX_ROWS_PER_SWEEP) {
      assets.push(quarantined);
    }
  }
  let count = 0;
  for (const asset of assets) {
    const terminal =
      asset.state === "rejected" || asset.state === "quarantined";
    const ageAt = asset.scanCompletedAt ?? asset.updatedAt ?? asset.createdAt;
    if (!terminal || ageAt + ISOLATED_ASSET_RETENTION_DAYS * DAY_MS > asOf) {
      continue;
    }
    const operation = await beginOperation(ctx, {
      build,
      operationKey: `isolated-asset:${asset._id}:${ageAt}`,
      operationKind: "isolated_asset",
      reasonCode: "failed_or_quarantined_asset_expired",
      scopeId: String(asset._id),
      scopeKind: "buildCollaborationAsset",
      now: asOf,
    });
    if (!operation || operation.state === "completed") {
      continue;
    }
    if (
      await hasActiveBuildRetentionHold(ctx, {
        buildId: build._id,
        organizationId: build.organizationId,
      })
    ) {
      await blockOperation(
        ctx,
        operation,
        "Active legal hold blocks isolated asset purge.",
        asOf
      );
      totals.blockedByLegalHold += 1;
      continue;
    }
    let deleted = 0;
    if (!asset.storageDeletedAt) {
      await assertRetentionDeletionAllowed(ctx, build);
      await deleteStorageIfPresent(ctx, asset.storageId);
      await ctx.db.patch(asset._id, {
        storageDeletedAt: asOf,
        updatedAt: asOf,
      });
      deleted = 1;
    }
    await completeOperation(ctx, operation, deleted, asOf);
    await addSystemAuditedTombstone(
      ctx,
      {
        build,
        completedAt: asOf,
        lifecycleState: asset.state,
        operation,
        revisionCount: asset.version,
        scopeId: String(asset._id),
        scopeKind: "buildCollaborationAsset",
        sourceHashSha256: asset.contentHashSha256,
        tombstoneExpiresAt: asOf + TOMBSTONE_RETENTION_MS,
      },
      {
        command: "runDataRetentionMaintenance",
        entityId: asset._id,
        entityType: "buildCollaborationAsset",
        eventType: "data_retention.isolated_asset.purged",
        newState: { storageDeleted: deleted === 1 },
        now: asOf,
        reason: "Isolated failed asset retention window elapsed.",
      }
    );
    totals.completedOperations += 1;
    totals.tombstoneCount += 1;
    count += deleted;
  }
  return count;
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Credential/session minimization intentionally handles both terminal verifier types with one Build-scoped hold gate.
async function sweepCredentialMaterial(
  ctx: MutationCtx,
  build: Doc<"activeBuilds">,
  asOf: number,
  totals: {
    blockedByLegalHold: number;
    completedOperations: number;
    deletedOrRedactedCount: number;
    markedRecoveryCount: number;
    tombstoneCount: number;
  }
) {
  let count = 0;
  let remaining = MAX_ROWS_PER_SWEEP;
  const cutoff = asOf - CREDENTIAL_RETENTION_DAYS * DAY_MS;
  for (const state of ["expired", "rotated", "revoked"] as const) {
    if (remaining === 0) {
      break;
    }
    const credentials = await ctx.db
      .query("quoteInvitationAccessCredentials")
      .withIndex(
        "by_buildId_and_state_and_verifierPurgedAt_and_updatedAt",
        (query) =>
          query
            .eq("buildId", build._id)
            .eq("state", state)
            .eq("verifierPurgedAt", undefined)
            .lte("updatedAt", cutoff)
      )
      .take(remaining);
    remaining -= credentials.length;
    for (const credential of credentials) {
      if (
        credential.organizationId !== build.organizationId ||
        credential.brokerageId !== build.brokerageId
      ) {
        continue;
      }
      if (!credential.credentialVerifier) {
        await ctx.db.patch(credential._id, { verifierPurgedAt: asOf });
        continue;
      }
      const operation = await beginOperation(ctx, {
        build,
        operationKey: `credential-verifier:${credential._id}:${credential.updatedAt}`,
        operationKind: "credential_verifier",
        reasonCode: "terminal_credential_verifier_expired",
        scopeId: String(credential._id),
        scopeKind: "quoteInvitationAccessCredential",
        now: asOf,
      });
      if (!operation || operation.state === "completed") {
        continue;
      }
      if (
        await hasActiveBuildRetentionHold(ctx, {
          buildId: build._id,
          organizationId: build.organizationId,
        })
      ) {
        await blockOperation(
          ctx,
          operation,
          "Active legal hold blocks credential verifier purge.",
          asOf
        );
        totals.blockedByLegalHold += 1;
        continue;
      }
      await ctx.db.patch(credential._id, {
        credentialVerifier: undefined,
        updatedAt: asOf,
        verifierPurgedAt: asOf,
      });
      await completeOperation(ctx, operation, 1, asOf);
      await addSystemAuditedTombstone(
        ctx,
        {
          build,
          completedAt: asOf,
          lifecycleState: credential.state,
          operation,
          scopeId: String(credential._id),
          scopeKind: "quoteInvitationAccessCredential",
          tombstoneExpiresAt: asOf + TOMBSTONE_RETENTION_MS,
        },
        {
          command: "runDataRetentionMaintenance",
          entityId: credential._id,
          entityType: "quoteInvitationAccessCredential",
          eventType: "data_retention.credential_verifier.purged",
          newState: { retentionAction: "credential_identifier_minimized" },
          now: asOf,
          reason:
            "Terminal Quote invitation credential recovery window elapsed.",
        }
      );
      totals.completedOperations += 1;
      totals.tombstoneCount += 1;
      count += 1;
    }
  }
  for (const state of ["expired", "revoked"] as const) {
    if (remaining === 0) {
      break;
    }
    const sessions = await ctx.db
      .query("quoteInvitationBrowserSessions")
      .withIndex(
        "by_buildId_and_state_and_verifierPurgedAt_and_updatedAt",
        (query) =>
          query
            .eq("buildId", build._id)
            .eq("state", state)
            .eq("verifierPurgedAt", undefined)
            .lte("updatedAt", cutoff)
      )
      .take(remaining);
    remaining -= sessions.length;
    for (const session of sessions) {
      if (
        session.organizationId !== build.organizationId ||
        session.brokerageId !== build.brokerageId
      ) {
        continue;
      }
      if (!session.sessionVerifier) {
        await ctx.db.patch(session._id, { verifierPurgedAt: asOf });
        continue;
      }
      const operation = await beginOperation(ctx, {
        build,
        operationKey: `session-verifier:${session._id}:${session.updatedAt}`,
        operationKind: "credential_verifier",
        reasonCode: "terminal_session_verifier_expired",
        scopeId: String(session._id),
        scopeKind: "quoteInvitationBrowserSession",
        now: asOf,
      });
      if (!operation || operation.state === "completed") {
        continue;
      }
      if (
        await hasActiveBuildRetentionHold(ctx, {
          buildId: build._id,
          organizationId: build.organizationId,
        })
      ) {
        await blockOperation(
          ctx,
          operation,
          "Active legal hold blocks session verifier purge.",
          asOf
        );
        totals.blockedByLegalHold += 1;
        continue;
      }
      await ctx.db.patch(session._id, {
        sessionVerifier: undefined,
        updatedAt: asOf,
        verifierPurgedAt: asOf,
      });
      await completeOperation(ctx, operation, 1, asOf);
      await addSystemAuditedTombstone(
        ctx,
        {
          build,
          completedAt: asOf,
          lifecycleState: session.state,
          operation,
          scopeId: String(session._id),
          scopeKind: "quoteInvitationBrowserSession",
          tombstoneExpiresAt: asOf + TOMBSTONE_RETENTION_MS,
        },
        {
          command: "runDataRetentionMaintenance",
          entityId: session._id,
          entityType: "quoteInvitationBrowserSession",
          eventType: "data_retention.browser_session_verifier.purged",
          newState: { retentionAction: "session_identifier_minimized" },
          now: asOf,
          reason: "Terminal Quote invitation session recovery window elapsed.",
        }
      );
      totals.completedOperations += 1;
      totals.tombstoneCount += 1;
      count += 1;
    }
  }
  return count;
}

async function deleteQuoteDraftChildren(
  ctx: MutationCtx,
  build: Doc<"activeBuilds">,
  draftId: Id<"quoteInvitationResponseDrafts">
) {
  let deleted = 0;
  const lines = await ctx.db
    .query("quoteInvitationResponseDraftLineItems")
    .withIndex("by_quoteInvitationResponseDraftId_and_lineKey", (query) =>
      query.eq("quoteInvitationResponseDraftId", draftId)
    )
    .take(MAX_ROWS_PER_SWEEP + 1);
  for (const row of lines.slice(0, MAX_ROWS_PER_SWEEP)) {
    await ctx.db.delete(row._id);
    deleted += 1;
  }
  const answers = await ctx.db
    .query("quoteInvitationResponseDraftAnswers")
    .withIndex("by_draft_and_responseFieldId", (query) =>
      query.eq("quoteInvitationResponseDraftId", draftId)
    )
    .take(MAX_ROWS_PER_SWEEP + 1);
  for (const row of answers.slice(0, MAX_ROWS_PER_SWEEP)) {
    await ctx.db.delete(row._id);
    deleted += 1;
  }
  const attachments = await ctx.db
    .query("quoteInvitationResponseDraftAttachments")
    .withIndex("by_quoteInvitationResponseDraftId_and_createdAt", (query) =>
      query.eq("quoteInvitationResponseDraftId", draftId)
    )
    .take(MAX_ROWS_PER_SWEEP + 1);
  for (const row of attachments.slice(0, MAX_ROWS_PER_SWEEP)) {
    await assertRetentionDeletionAllowed(ctx, build);
    await deleteStorageIfPresent(ctx, row.storageId);
    await ctx.db.delete(row._id);
    deleted += 1;
  }
  return {
    complete:
      lines.length <= MAX_ROWS_PER_SWEEP &&
      answers.length <= MAX_ROWS_PER_SWEEP &&
      attachments.length <= MAX_ROWS_PER_SWEEP,
    deletedCount: deleted,
  };
}

async function beginOperation(
  ctx: MutationCtx,
  input: {
    build: Doc<"activeBuilds">;
    operationKey: string;
    operationKind: Doc<"dataRetentionOperations">["operationKind"];
    reasonCode: string;
    scopeId: string;
    scopeKind: string;
    now: number;
  }
) {
  const existing = await findOperation(
    ctx,
    input.build.organizationId,
    input.operationKey
  );
  if (existing?.state === "completed") {
    return existing;
  }
  if (existing) {
    await ctx.db.patch(existing._id, {
      attemptCount: (existing.attemptCount ?? 1) + 1,
      state: "started",
      blockReason: undefined,
      failureReason: undefined,
      updatedAt: input.now,
    });
    return await ctx.db.get(existing._id);
  }
  const id = await ctx.db.insert("dataRetentionOperations", {
    brokerageId: input.build.brokerageId,
    buildId: input.build._id,
    operationKey: input.operationKey,
    operationKind: input.operationKind,
    organizationId: input.build.organizationId,
    reasonCode: input.reasonCode,
    scopeId: input.scopeId,
    scopeKind: input.scopeKind,
    startedAt: input.now,
    attemptCount: 1,
    state: "started",
    updatedAt: input.now,
  });
  return await ctx.db.get(id);
}

async function findOperation(
  ctx: MutationCtx,
  organizationId: string,
  operationKey: string
) {
  return await ctx.db
    .query("dataRetentionOperations")
    .withIndex("by_operationKey", (query) =>
      query
        .eq("organizationId", organizationId)
        .eq("operationKey", operationKey)
    )
    .unique();
}

async function blockOperation(
  ctx: MutationCtx,
  operation: Doc<"dataRetentionOperations">,
  reason: string,
  asOf: number
) {
  await ctx.db.patch(operation._id, {
    blockReason: reason,
    state: "blocked",
    updatedAt: asOf,
  });
}

async function completeOperation(
  ctx: MutationCtx,
  operation: Doc<"dataRetentionOperations">,
  affectedCount: number,
  asOf: number
) {
  await ctx.db.patch(operation._id, {
    affectedCount,
    completedAt: asOf,
    state: "completed",
    updatedAt: asOf,
  });
}

async function addTombstone(
  ctx: MutationCtx,
  input: {
    build: Doc<"activeBuilds">;
    completedAt: number;
    lifecycleState: string;
    operation: Doc<"dataRetentionOperations">;
    physicalStorageDeletedAt?: number;
    revisionCount?: number;
    scopeId: string;
    scopeKind: string;
    sourceHashSha256?: string;
    tombstoneExpiresAt: number;
  }
) {
  const existing = await findTombstone(ctx, input.scopeKind, input.scopeId);
  if (existing) {
    return existing._id;
  }
  const sourceProofHmacSha256 = input.sourceHashSha256
    ? await retentionSourceProofHmac(
        input.build.organizationId,
        input.sourceHashSha256
      )
    : undefined;
  return await ctx.db.insert("dataRetentionTombstones", {
    brokerageId: input.build.brokerageId,
    buildId: input.build._id,
    completedAt: input.completedAt,
    lifecycleState: input.lifecycleState,
    operationId: input.operation._id,
    organizationId: input.build.organizationId,
    physicalStorageDeletedAt: input.physicalStorageDeletedAt,
    revisionCount: input.revisionCount,
    scopeId: input.scopeId,
    scopeKind: input.scopeKind,
    sourceProofHmacSha256,
    tombstoneExpiresAt: input.tombstoneExpiresAt,
  });
}

async function addSystemAuditedTombstone(
  ctx: MutationCtx,
  input: Parameters<typeof addTombstone>[1],
  audit: {
    command: string;
    entityId: string;
    entityType: string;
    eventType: string;
    newState: object;
    now: number;
    reason: string;
  }
) {
  const tombstoneId = await addTombstone(ctx, input);
  const tombstone = await ctx.db.get(tombstoneId);
  if (tombstone?.auditEventId) {
    return tombstoneId;
  }
  const auditEventId = await recordSystemAudit(ctx, input.build, audit);
  await ctx.db.patch(tombstoneId, { auditEventId });
  return tombstoneId;
}

async function findTombstone(
  ctx: MutationCtx,
  scopeKind: string,
  scopeId: string
) {
  return await ctx.db
    .query("dataRetentionTombstones")
    .withIndex("by_scopeKind_and_scopeId", (query) =>
      query.eq("scopeKind", scopeKind).eq("scopeId", scopeId)
    )
    .unique();
}

async function latestBackupManifest(
  ctx: QueryCtx | MutationCtx,
  organizationId: string
) {
  const rows = await ctx.db
    .query("dataRetentionBackupManifests")
    .withIndex("by_organizationId_and_state_and_capturedAt", (query) =>
      query.eq("organizationId", organizationId).eq("state", "verified")
    )
    .order("desc")
    .take(1);
  return rows[0] ?? null;
}

async function recordSystemAudit(
  ctx: MutationCtx,
  build: Doc<"activeBuilds">,
  input: {
    command: string;
    entityId: string;
    entityType: string;
    eventType: string;
    newState: object;
    now: number;
    reason: string;
  }
) {
  return await recordAudit(ctx, {
    actorKind: "system",
    actorRoles: ["system"],
    actorWorkosUserId: "system:data-retention",
    brokerageId: build.brokerageId,
    buildId: build._id,
    command: input.command,
    entityId: input.entityId,
    entityType: input.entityType,
    eventType: input.eventType,
    newState: input.newState,
    organizationId: build.organizationId,
    reason: input.reason,
    now: input.now,
  });
}

async function recordAudit(
  ctx: MutationCtx,
  input: {
    actorKind: "agent" | "automation" | "human" | "service" | "system";
    actorRole?: ActiveBuildAuthorization["effectiveRole"]["role"];
    actorRoles: string[];
    actorWorkosUserId: string;
    brokerageId: Id<"brokerages">;
    buildId?: Id<"activeBuilds">;
    command: string;
    entityId: string;
    entityType: string;
    eventType: string;
    newState: object;
    organizationId: string;
    priorState?: object;
    reason: string;
    now: number;
  }
) {
  const priorState = input.priorState
    ? privacyMinimizedAuditState(input.priorState)
    : undefined;
  const newState = privacyMinimizedAuditState(input.newState);
  const actorRoles = input.actorRoles.slice(0, 100);
  const auditEventId = await ctx.db.insert("auditEvents", {
    actorKind: input.actorKind,
    actorRole: input.actorRole,
    actorRoles,
    actorWorkosUserId: input.actorWorkosUserId,
    effectiveCapacity: input.actorRole,
    brokerageId: input.brokerageId,
    buildId: input.buildId,
    command: input.command,
    createdAt: input.now,
    entityId: input.entityId,
    entityType: input.entityType,
    eventType: input.eventType,
    newState: JSON.stringify(newState),
    organizationId: input.organizationId,
    priorState: priorState ? JSON.stringify(priorState) : undefined,
    reason: input.reason,
    warnings: [],
  });
  await ctx.db.insert("eventOutbox", {
    brokerageId: input.brokerageId,
    createdAt: input.now,
    eventType: input.eventType,
    organizationId: input.organizationId,
    payloadPreview: JSON.stringify(newState),
    relatedEntityId: input.entityId,
    relatedEntityType: input.entityType,
    status: "pending",
  });
  return auditEventId;
}

function requireRetentionAdmin(authorization: ActiveBuildAuthorization) {
  if (
    authorization.effectiveRole.role !== "admin" &&
    authorization.effectiveRole.role !== "principle-broker"
  ) {
    throw new ConvexError(
      "Only an Admin or Principal Broker may change retention state."
    );
  }
}

function assertExtensionDays(value: number) {
  if (!Number.isInteger(value) || value < 0 || value > 3650) {
    throw new ConvexError(
      "Tenant retention extension must be an integer from 0 to 3,650 days."
    );
  }
}

function requiredText(value: string, label: string, maximum: number) {
  const normalized = value.trim();
  if (!normalized || normalized.length > maximum) {
    throw new ConvexError(
      `${label} is required and must be ${maximum} characters or fewer.`
    );
  }
  return normalized;
}

function boundedJson(value: string, label = "Retention correction history") {
  const normalized = value.trim();
  if (normalized.length > 100_000) {
    throw new ConvexError(`${label} is too large.`);
  }
  if (!normalized) {
    return "{}";
  }
  try {
    JSON.parse(normalized);
  } catch {
    throw new ConvexError(`${label} must be valid JSON.`);
  }
  return normalized;
}

function boundedError(error: unknown) {
  const message =
    error instanceof Error ? error.message : "Unknown retention fan-out error.";
  return message.slice(0, 1000);
}

async function deleteStorageIfPresent(
  ctx: MutationCtx,
  storageId: Id<"_storage">
) {
  try {
    await ctx.storage.delete(storageId);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!STORAGE_OBJECT_MISSING_PATTERN.test(message)) {
      throw error;
    }
  }
}

async function sha256Hex(value: string) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value)
  );
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function retentionSourceProofHmac(
  organizationId: string,
  sourceHashSha256: string
) {
  const secret = requireRetentionTombstoneHmacKey();
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { hash: "SHA-256", name: "HMAC" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(`${organizationId}:${sourceHashSha256}`)
  );
  return [...new Uint8Array(signature)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function requireRetentionTombstoneHmacKey() {
  const secret = process.env.DATA_RETENTION_TOMBSTONE_HMAC_KEY?.trim();
  if (!secret) {
    throw new ConvexError(
      "DATA_RETENTION_TOMBSTONE_HMAC_KEY is required for disposal proofs."
    );
  }
  return secret;
}
