import {
  paginationOptsValidator,
  paginationResultValidator,
} from "convex/server";
import { v } from "convex/values";

import type { Doc, Id } from "../_generated/dataModel.js";
import { authenticatedMutation, authenticatedQuery } from "../authz.js";
import { operationalRequestFingerprint } from "../build_operational_idempotency.js";
import {
  type LenderPortalPhase9MigrationCounts,
  lenderPortalPhase9MigrationCountsValidator,
} from "../lender_portal_phase9_contracts.js";
import {
  requireTenantReleaseOperator,
  requireTrustedRuntimeReleaseProvenance,
} from "../lender_portal_release.js";
import type { MutationCtx, QueryCtx } from "../types.js";
import {
  IssueSnapshot,
  MAX_INVENTORY_PAGE_SIZE,
  MAX_MANIFEST_PROPOSALS,
  MAX_MANIFEST_RELATED_ROWS,
  boundedReason,
  exactHex,
  getScopedMigrationRun,
  migrationAuditReadbackValidator,
  migrationIssueSnapshotValidator,
  migrationRunReadbackValidator,
  migrationRunValidator,
  publicMigrationRun,
  recordMigrationRunAudit,
  safeObject,
} from "./shared.js";
import {
  collectMigrationSnapshot,
  snapshotMatchesPreparedRun,
} from "./snapshot.js";
import { collectWorkosProjectionFingerprint } from "./snapshot_support.js";

export const readLenderPortalPhase9MigrationAudit = authenticatedQuery
  .input({
    organizationId: v.string(),
    paginationOpts: paginationOptsValidator,
    runToken: v.string(),
  })
  .returns(paginationResultValidator(migrationAuditReadbackValidator))
  .handler(async (ctx, args) => {
    if (
      !Number.isSafeInteger(args.paginationOpts.numItems) ||
      args.paginationOpts.numItems < 1 ||
      args.paginationOpts.numItems > MAX_INVENTORY_PAGE_SIZE
    ) {
      throw new Error(
        `Phase 9 migration audit page size must be 1 to ${MAX_INVENTORY_PAGE_SIZE}.`
      );
    }
    const scope = await requireTenantReleaseOperator(ctx, args.organizationId);
    const run = await getScopedMigrationRun(
      ctx,
      scope.organizationId,
      scope.brokerageId,
      args.runToken
    );
    const page = await ctx.db
      .query("auditEvents")
      .withIndex(
        "by_organizationId_and_phase9RunToken_and_createdAt",
        (query) =>
          query
            .eq("organizationId", scope.organizationId)
            .eq("phase9RunToken", args.runToken)
      )
      .order("asc")
      .paginate(args.paginationOpts);
    return {
      ...page,
      page: page.page.map((event) => {
        if (
          !event.reconciliationKey ||
          event.phase9RunToken !== args.runToken ||
          event.brokerageId !== scope.brokerageId
        ) {
          throw new Error("Phase 9 migration audit scope is inconsistent.");
        }
        const state = safeObject(event.newState);
        return {
          actorRoles: event.actorRoles,
          actorWorkosUserId: event.actorWorkosUserId,
          candidateSha:
            typeof state?.candidateSha === "string"
              ? state.candidateSha
              : undefined,
          command: event.command,
          correlationId: event.drawFlowCorrelationId,
          createdAt: event.createdAt,
          entityId: event.entityId,
          entityType: event.entityType,
          eventType: event.eventType,
          newState: event.newState,
          priorState: event.priorState,
          reconciliationKey: event.reconciliationKey,
          runToken: args.runToken,
          warnings: event.warnings,
        };
      }),
    };
  })
  .public();

export const prepareLenderPortalPhase9MigrationRun = authenticatedMutation
  .input({
    candidateSha: v.string(),
    configurationHash: v.string(),
    organizationId: v.string(),
    reason: v.string(),
  })
  .returns(migrationRunValidator)
  .handler(async (ctx, args) => {
    const scope = await requireTenantReleaseOperator(ctx, args.organizationId);
    const candidateSha = exactHex(args.candidateSha, 40, "candidate SHA");
    const configurationHash = exactHex(
      args.configurationHash,
      64,
      "configuration hash"
    );
    const reason = boundedReason(args.reason);
    requireTrustedRuntimeReleaseProvenance(candidateSha, configurationHash);
    const release = await ctx.db
      .query("lenderPortalTenantReleaseControls")
      .withIndex("by_organizationId", (query) =>
        query.eq("organizationId", scope.organizationId)
      )
      .unique();
    if (
      !release ||
      release.status !== "disabled" ||
      release.brokerageId !== scope.brokerageId ||
      release.candidateSha !== candidateSha ||
      release.configurationHash !== configurationHash
    ) {
      throw new Error(
        "Phase 9 migration preparation requires the exact candidate and configuration in disabled state."
      );
    }
    const snapshot = await collectMigrationSnapshot(
      ctx,
      scope.organizationId,
      scope.brokerageId
    );
    const runToken = await operationalRequestFingerprint({
      brokerageId: String(scope.brokerageId),
      candidateSha,
      configurationHash,
      counts: snapshot.counts,
      inventoryFingerprint: snapshot.inventoryFingerprint,
      organizationId: scope.organizationId,
      workosProjectionFingerprint: snapshot.workosProjectionFingerprint,
    });
    const existingRuns = await ctx.db
      .query("lenderPortalPhase9MigrationRuns")
      .withIndex("by_organizationId_and_runToken", (query) =>
        query
          .eq("organizationId", scope.organizationId)
          .eq("runToken", runToken)
      )
      .take(2);
    if (existingRuns.length > 1) {
      throw new Error(
        "Phase 9 deterministic run token has duplicate manifests."
      );
    }
    if (existingRuns[0]) {
      if (existingRuns[0].brokerageId !== scope.brokerageId) {
        throw new Error("Forbidden: Phase 9 migration run Brokerage scope.");
      }
      return publicMigrationRun(existingRuns[0]);
    }
    const active = await ctx.db
      .query("lenderPortalPhase9MigrationRuns")
      .withIndex("by_organizationId_and_active", (query) =>
        query.eq("organizationId", scope.organizationId).eq("active", true)
      )
      .unique();
    if (active && active.brokerageId !== scope.brokerageId) {
      throw new Error("Forbidden: Phase 9 migration run Brokerage scope.");
    }
    if (
      active &&
      (active.status === "ready" ||
        active.status === "authorized" ||
        active.status === "applying")
    ) {
      throw new Error(
        "An active Phase 9 migration run must be verified or blocked before another inventory is prepared."
      );
    }
    if (active) {
      await ctx.db.patch(active._id, { active: false, updatedAt: Date.now() });
    }
    const now = Date.now();
    const status = snapshot.issues.length === 0 ? "ready" : "blocked";
    const runId = await ctx.db.insert("lenderPortalPhase9MigrationRuns", {
      active: true,
      brokerageId: scope.brokerageId,
      candidateSha,
      configurationHash,
      countsBefore: snapshot.counts,
      createdAt: now,
      inventoryFingerprint: snapshot.inventoryFingerprint,
      issueCount: snapshot.issues.length,
      issueSnapshots: snapshot.issues,
      organizationId: scope.organizationId,
      reason,
      runToken,
      status,
      updatedAt: now,
      updatedByWorkosUserId: scope.workosUserId,
      workosProjectionFingerprintBefore: snapshot.workosProjectionFingerprint,
      workosProjectionRowCount: snapshot.workosProjectionRowCount,
    });
    await recordMigrationRunAudit(ctx, {
      actorRoles: scope.roles,
      actorWorkosUserId: scope.workosUserId,
      brokerageId: scope.brokerageId,
      candidateSha,
      configurationHash,
      eventType: "lender_portal.migration.inventory_recorded",
      issueCount: snapshot.issues.length,
      organizationId: scope.organizationId,
      reason,
      runId,
      runToken,
      status,
    });
    return {
      candidateSha,
      configurationHash,
      issueCount: snapshot.issues.length,
      runToken,
      status,
      workosProjectionWriteCount: undefined,
    };
  })
  .public();

export const authorizeLenderPortalPhase9MigrationRun = authenticatedMutation
  .input({
    organizationId: v.string(),
    reason: v.string(),
    runToken: v.string(),
  })
  .returns(migrationRunValidator)
  .handler(async (ctx, args) => {
    const scope = await requireTenantReleaseOperator(ctx, args.organizationId);
    const run = await getScopedMigrationRun(
      ctx,
      scope.organizationId,
      scope.brokerageId,
      args.runToken
    );
    requireTrustedRuntimeReleaseProvenance(
      run.candidateSha,
      run.configurationHash
    );
    if (run.status !== "ready") {
      throw new Error("Only a ready Phase 9 migration run can be authorized.");
    }
    const reason = boundedReason(args.reason);
    const release = await ctx.db
      .query("lenderPortalTenantReleaseControls")
      .withIndex("by_organizationId", (query) =>
        query.eq("organizationId", scope.organizationId)
      )
      .unique();
    if (
      !release ||
      release.status !== "disabled" ||
      release.brokerageId !== scope.brokerageId ||
      release.candidateSha !== run.candidateSha ||
      release.configurationHash !== run.configurationHash
    ) {
      throw new Error(
        "The migration run no longer matches the disabled release control."
      );
    }
    const snapshot = await collectMigrationSnapshot(
      ctx,
      scope.organizationId,
      scope.brokerageId
    );
    if (!snapshotMatchesPreparedRun(run, snapshot)) {
      await ctx.db.patch(run._id, {
        countsAfter: snapshot.counts,
        inventoryFingerprintAfter: snapshot.inventoryFingerprint,
        issueCount: snapshot.issues.length,
        issueSnapshots: snapshot.issues,
        status: "blocked",
        updatedAt: Date.now(),
        updatedByWorkosUserId: scope.workosUserId,
        workosProjectionFingerprintAfter: snapshot.workosProjectionFingerprint,
      });
      await recordMigrationRunAudit(ctx, {
        actorRoles: scope.roles,
        actorWorkosUserId: scope.workosUserId,
        brokerageId: scope.brokerageId,
        candidateSha: run.candidateSha,
        configurationHash: run.configurationHash,
        eventType: "lender_portal.migration.authorization_blocked",
        inventoryFingerprint: run.inventoryFingerprint,
        issueCount: snapshot.issues.length,
        observedInventoryFingerprint: snapshot.inventoryFingerprint,
        observedWorkosProjectionFingerprint:
          snapshot.workosProjectionFingerprint,
        organizationId: scope.organizationId,
        priorStatus: run.status,
        reason,
        runId: run._id,
        runToken: run.runToken,
        status: "blocked",
        warnings: ["migration_snapshot_drift"],
        workosProjectionFingerprint: run.workosProjectionFingerprintBefore,
      });
      return publicMigrationRun({
        ...run,
        issueCount: snapshot.issues.length,
        status: "blocked",
      });
    }
    const otherAuthorizedRuns = (
      await Promise.all(
        (["authorized", "applying"] as const).map((status) =>
          ctx.db
            .query("lenderPortalPhase9MigrationRuns")
            .withIndex("by_status_and_active", (query) =>
              query.eq("status", status).eq("active", true)
            )
            .take(2)
        )
      )
    ).flat();
    if (otherAuthorizedRuns.some((candidate) => candidate._id !== run._id)) {
      throw new Error(
        "Another tenant has an active authorized Phase 9 migration run; complete or block it before authorizing this run."
      );
    }
    await ctx.db.patch(run._id, {
      reason,
      status: "authorized",
      updatedAt: Date.now(),
      updatedByWorkosUserId: scope.workosUserId,
    });
    await recordMigrationRunAudit(ctx, {
      actorRoles: scope.roles,
      actorWorkosUserId: scope.workosUserId,
      brokerageId: scope.brokerageId,
      candidateSha: run.candidateSha,
      configurationHash: run.configurationHash,
      eventType: "lender_portal.migration.authorized",
      issueCount: 0,
      organizationId: scope.organizationId,
      priorStatus: run.status,
      reason,
      runId: run._id,
      runToken: run.runToken,
      status: "authorized",
    });
    return publicMigrationRun({ ...run, status: "authorized" });
  })
  .public();

export const verifyLenderPortalPhase9MigrationRun = authenticatedMutation
  .input({
    organizationId: v.string(),
    reason: v.string(),
    runToken: v.string(),
  })
  .returns(migrationRunValidator)
  .handler(async (ctx, args) => {
    const scope = await requireTenantReleaseOperator(ctx, args.organizationId);
    const run = await getScopedMigrationRun(
      ctx,
      scope.organizationId,
      scope.brokerageId,
      args.runToken
    );
    requireTrustedRuntimeReleaseProvenance(
      run.candidateSha,
      run.configurationHash
    );
    if (run.status !== "applying") {
      throw new Error(
        "Only an applying Phase 9 migration run can be verified."
      );
    }
    const release = await ctx.db
      .query("lenderPortalTenantReleaseControls")
      .withIndex("by_organizationId", (query) =>
        query.eq("organizationId", scope.organizationId)
      )
      .unique();
    if (
      !release ||
      release.status !== "disabled" ||
      release.brokerageId !== scope.brokerageId ||
      release.candidateSha !== run.candidateSha ||
      release.configurationHash !== run.configurationHash
    ) {
      throw new Error(
        "Phase 9 migration verification requires the exact disabled release control."
      );
    }
    const snapshot = await collectMigrationSnapshot(
      ctx,
      scope.organizationId,
      scope.brokerageId
    );
    const workosUnchanged =
      snapshot.workosProjectionFingerprint ===
        run.workosProjectionFingerprintBefore &&
      snapshot.workosProjectionRowCount === run.workosProjectionRowCount;
    const countsBefore = run.countsBefore;
    const countsAfter = snapshot.counts;
    const canonicalCountsMatch =
      countsBefore.proposalCount === countsAfter.proposalCount &&
      countsBefore.closingCount === countsAfter.closingCount &&
      countsBefore.activeBuildCount === countsAfter.activeBuildCount &&
      countsBefore.assignmentCount === countsAfter.assignmentCount &&
      countsBefore.policyVersionCount === countsAfter.policyVersionCount &&
      countsBefore.revisionCount === countsAfter.revisionCount &&
      countsBefore.reviewCycleCount === countsAfter.reviewCycleCount;
    const projectionsReconciled =
      countsAfter.kanbanCardCount === countsAfter.proposalCount &&
      countsAfter.projectionMismatchCount === 0;
    const reconciliationComplete = countsAfter.reconciliationPendingCount === 0;
    const verified =
      workosUnchanged &&
      canonicalCountsMatch &&
      projectionsReconciled &&
      reconciliationComplete &&
      snapshot.issues.length === 0;
    const now = Date.now();
    const reason = boundedReason(args.reason);
    await ctx.db.patch(run._id, {
      countsAfter: snapshot.counts,
      inventoryFingerprintAfter: snapshot.inventoryFingerprint,
      issueCount: snapshot.issues.length,
      issueSnapshots: snapshot.issues,
      status: verified ? "verified" : "blocked",
      updatedAt: now,
      verifiedAt: verified ? now : undefined,
      workosProjectionFingerprintAfter: snapshot.workosProjectionFingerprint,
      workosProjectionWriteCount: workosUnchanged ? 0 : undefined,
    });
    await recordMigrationRunAudit(ctx, {
      actorRoles: scope.roles,
      actorWorkosUserId: scope.workosUserId,
      brokerageId: scope.brokerageId,
      candidateSha: run.candidateSha,
      configurationHash: run.configurationHash,
      eventType: verified
        ? "lender_portal.migration.verified"
        : "lender_portal.migration.verification_blocked",
      issueCount: snapshot.issues.length,
      organizationId: scope.organizationId,
      priorStatus: run.status,
      reason,
      runId: run._id,
      runToken: run.runToken,
      status: verified ? "verified" : "blocked",
    });
    return {
      ...publicMigrationRun(run),
      issueCount: snapshot.issues.length,
      status: verified ? "verified" : "blocked",
      workosProjectionWriteCount: workosUnchanged ? 0 : undefined,
    };
  })
  .public();

export const getLenderPortalPhase9MigrationRun = authenticatedQuery
  .input({ organizationId: v.string(), runToken: v.string() })
  .returns(migrationRunReadbackValidator)
  .handler(async (ctx, args) => {
    const scope = await requireTenantReleaseOperator(ctx, args.organizationId);
    const run = await getScopedMigrationRun(
      ctx,
      scope.organizationId,
      scope.brokerageId,
      args.runToken
    );
    return {
      active: run.active,
      candidateSha: run.candidateSha,
      configurationHash: run.configurationHash,
      countsAfter: run.countsAfter,
      countsBefore: run.countsBefore,
      createdAt: run.createdAt,
      inventoryFingerprint: run.inventoryFingerprint,
      inventoryFingerprintAfter: run.inventoryFingerprintAfter,
      issueCount: run.issueCount,
      reason: run.reason,
      runToken: run.runToken,
      status: run.status,
      updatedAt: run.updatedAt,
      updatedByWorkosUserId: run.updatedByWorkosUserId,
      verifiedAt: run.verifiedAt,
      workosProjectionFingerprintAfter: run.workosProjectionFingerprintAfter,
      workosProjectionFingerprintBefore: run.workosProjectionFingerprintBefore,
      workosProjectionRowCount: run.workosProjectionRowCount,
      workosProjectionWriteCount: run.workosProjectionWriteCount,
    };
  })
  .public();

export const listLenderPortalPhase9MigrationIssues = authenticatedQuery
  .input({
    cursor: v.optional(v.string()),
    limit: v.number(),
    organizationId: v.string(),
    runToken: v.string(),
  })
  .returns(
    v.object({
      continueCursor: v.union(v.string(), v.null()),
      isDone: v.boolean(),
      page: v.array(migrationIssueSnapshotValidator),
      total: v.number(),
    })
  )
  .handler(async (ctx, args) => {
    const scope = await requireTenantReleaseOperator(ctx, args.organizationId);
    const run = await getScopedMigrationRun(
      ctx,
      scope.organizationId,
      scope.brokerageId,
      args.runToken
    );
    if (
      !Number.isSafeInteger(args.limit) ||
      args.limit < 1 ||
      args.limit > 25
    ) {
      throw new Error("Phase 9 migration issue page size must be 1 to 25.");
    }
    const offset = args.cursor ? Number(args.cursor) : 0;
    if (!Number.isSafeInteger(offset) || offset < 0) {
      throw new Error("Phase 9 migration issue cursor is invalid.");
    }
    const end = Math.min(run.issueSnapshots.length, offset + args.limit);
    return {
      continueCursor: end < run.issueSnapshots.length ? String(end) : null,
      isDone: end >= run.issueSnapshots.length,
      page: run.issueSnapshots.slice(offset, end),
      total: run.issueCount,
    };
  })
  .public();

export async function requireAuthorizedLenderPortalPhase9Migration(
  ctx: MutationCtx,
  proposal: Doc<"buildProposals">
) {
  const run = await ctx.db
    .query("lenderPortalPhase9MigrationRuns")
    .withIndex("by_organizationId_and_active", (query) =>
      query.eq("organizationId", proposal.organizationId).eq("active", true)
    )
    .unique();
  const release = await ctx.db
    .query("lenderPortalTenantReleaseControls")
    .withIndex("by_organizationId", (query) =>
      query.eq("organizationId", proposal.organizationId)
    )
    .unique();
  if (!run) {
    // The registered migration scans the global table. Tenants without an
    // active run are outside this operator-authorized execution and are a
    // deliberate no-op, not an apply failure.
    return null;
  }
  requireTrustedRuntimeReleaseProvenance(
    run.candidateSha,
    run.configurationHash
  );
  const globallyRunning = (
    await Promise.all(
      (["authorized", "applying"] as const).map((status) =>
        ctx.db
          .query("lenderPortalPhase9MigrationRuns")
          .withIndex("by_status_and_active", (query) =>
            query.eq("status", status).eq("active", true)
          )
          .take(2)
      )
    )
  ).flat();
  if (
    (run.status !== "authorized" && run.status !== "applying") ||
    globallyRunning.length !== 1 ||
    globallyRunning[0]?._id !== run._id ||
    run.brokerageId !== proposal.brokerageId ||
    !release ||
    release.status !== "disabled" ||
    release.candidateSha !== run.candidateSha ||
    release.configurationHash !== run.configurationHash
  ) {
    throw new Error(
      "Phase 9 migration apply requires an authorized exact-candidate inventory run in disabled state."
    );
  }
  if (run.status === "authorized") {
    const snapshot = await collectMigrationSnapshot(
      ctx,
      run.organizationId,
      run.brokerageId
    );
    if (!snapshotMatchesPreparedRun(run, snapshot)) {
      throw new Error(
        "Phase 9 migration apply snapshot drifted from its persisted manifest."
      );
    }
  }
  return run;
}

export async function beginLenderPortalPhase9MigrationApply(
  ctx: MutationCtx,
  run: Doc<"lenderPortalPhase9MigrationRuns">
) {
  if (!run.active || run.status !== "authorized") return false;
  requireTrustedRuntimeReleaseProvenance(
    run.candidateSha,
    run.configurationHash
  );
  const release = await ctx.db
    .query("lenderPortalTenantReleaseControls")
    .withIndex("by_organizationId", (query) =>
      query.eq("organizationId", run.organizationId)
    )
    .unique();
  const globallyAuthorized = await ctx.db
    .query("lenderPortalPhase9MigrationRuns")
    .withIndex("by_status_and_active", (query) =>
      query.eq("status", "authorized").eq("active", true)
    )
    .take(2);
  const snapshot = await collectMigrationSnapshot(
    ctx,
    run.organizationId,
    run.brokerageId
  );
  const releaseMatches = Boolean(
    release &&
      release.status === "disabled" &&
      release.brokerageId === run.brokerageId &&
      release.candidateSha === run.candidateSha &&
      release.configurationHash === run.configurationHash
  );
  const exact =
    releaseMatches &&
    globallyAuthorized.length === 1 &&
    globallyAuthorized[0]?._id === run._id &&
    snapshotMatchesPreparedRun(run, snapshot);
  const now = Date.now();
  if (!exact) {
    await ctx.db.patch(run._id, {
      countsAfter: snapshot.counts,
      inventoryFingerprintAfter: snapshot.inventoryFingerprint,
      issueCount: snapshot.issues.length,
      issueSnapshots: snapshot.issues,
      status: "blocked",
      updatedAt: now,
      workosProjectionFingerprintAfter: snapshot.workosProjectionFingerprint,
    });
    await recordMigrationRunAudit(ctx, {
      actorRoles: ["system"],
      actorWorkosUserId: "system:lender-portal-phase9-migration",
      brokerageId: run.brokerageId,
      candidateSha: run.candidateSha,
      configurationHash: run.configurationHash,
      eventType: "lender_portal.migration.apply_blocked",
      inventoryFingerprint: run.inventoryFingerprint,
      issueCount: snapshot.issues.length,
      observedInventoryFingerprint: snapshot.inventoryFingerprint,
      observedWorkosProjectionFingerprint: snapshot.workosProjectionFingerprint,
      organizationId: run.organizationId,
      priorStatus: run.status,
      reason:
        "Apply preflight no longer matches the persisted exact-scope manifest.",
      runId: run._id,
      runToken: run.runToken,
      status: "blocked",
      warnings: [
        ...(releaseMatches ? [] : ["release_control_drift"]),
        ...(!snapshotMatchesPreparedRun(run, snapshot)
          ? ["migration_snapshot_drift"]
          : []),
      ],
      workosProjectionFingerprint: run.workosProjectionFingerprintBefore,
    });
    return false;
  }
  await ctx.db.patch(run._id, { status: "applying", updatedAt: now });
  await recordMigrationRunAudit(ctx, {
    actorRoles: ["system"],
    actorWorkosUserId: "system:lender-portal-phase9-migration",
    brokerageId: run.brokerageId,
    candidateSha: run.candidateSha,
    configurationHash: run.configurationHash,
    eventType: "lender_portal.migration.apply_started",
    inventoryFingerprint: run.inventoryFingerprint,
    issueCount: 0,
    organizationId: run.organizationId,
    priorStatus: run.status,
    reason: run.reason,
    runId: run._id,
    runToken: run.runToken,
    status: "applying",
    workosProjectionFingerprint: run.workosProjectionFingerprintBefore,
  });
  return true;
}
