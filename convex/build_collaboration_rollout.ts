import { v } from "convex/values";

import {
  type ActiveBuildAuthorization,
  authorizeActiveBuildAccess,
} from "./activeBuildAccess";
import { authenticatedMutation, authenticatedQuery } from "./authz";
import { requireHumanCollaborationActor } from "./build_collaboration_human";
import { buildCollaborationImplicitReaderSourceFingerprint } from "./build_collaboration_search_reader_sources";
import { buildCollaborationOrganizationAuthorityFingerprint } from "./build_collaboration_search_readers";
import { buildCollaborationTenantStatusValidator } from "./build_collaboration_validators";
import type { Id, MutationCtx, QueryCtx } from "./types";

export const BUILD_COLLABORATION_UNAVAILABLE_ERROR =
  "Build collaboration is unavailable until this tenant is active.";

const rolloutStateValidator = v.object({
  activatedAt: v.optional(v.number()),
  available: v.boolean(),
  migrationCompletedAt: v.optional(v.number()),
  status: buildCollaborationTenantStatusValidator,
});

type CollaborationTenantStatus = "active" | "disabled" | "migration_ready";

type ActiveBuildAccessContext = Parameters<
  typeof authorizeActiveBuildAccess
>[0];

export const getBuildCollaborationRolloutState = authenticatedQuery
  .input({
    buildId: v.id("activeBuilds"),
    organizationId: v.string(),
  })
  .returns(rolloutStateValidator)
  .handler(async (ctx, args) => {
    const authorization = await authorizeActiveBuildAccess(ctx, args);
    const setting = await getTenantSetting(ctx, authorization);
    return {
      activatedAt: setting?.activatedAt,
      available: setting?.status === "active",
      migrationCompletedAt: setting?.migrationCompletedAt,
      status: setting?.status ?? "disabled",
    };
  })
  .public();

export const recordBuildCollaborationMigrationParityEvidence =
  authenticatedMutation
    .input({
      buildId: v.id("activeBuilds"),
      importedPostCount: v.number(),
      mismatchCount: v.number(),
      organizationId: v.string(),
      reason: v.optional(v.string()),
      reportHash: v.string(),
      sourceRecordCount: v.number(),
    })
    .returns(v.id("buildCollaborationMigrationParityEvidence"))
    .handler(async (ctx, args) => {
      const authorization = await authorizeActiveBuildAccess(ctx, args);
      await requireHumanCollaborationActor(ctx, authorization);
      requireTenantOperator(authorization);
      validateParityEvidence(args);

      const reportHash = args.reportHash.trim();
      const reason = normalizeReason(args.reason);
      const now = Date.now();
      const sourceRecordCount = args.sourceRecordCount;
      const importedPostCount = args.importedPostCount;
      const mismatchCount = args.mismatchCount;
      const parityPassed =
        sourceRecordCount === importedPostCount && mismatchCount === 0;
      const evidenceId = await ctx.db.insert(
        "buildCollaborationMigrationParityEvidence",
        {
          brokerageId: authorization.brokerage._id,
          importedPostCount,
          mismatchCount,
          organizationId: authorization.organizationId,
          parityPassed,
          reason,
          reportHash,
          sourceRecordCount,
          verificationSource: "operator_attested",
          verifiedAt: now,
          verifiedByWorkosUserId: authorization.viewer.subject,
        }
      );
      await recordRolloutAudit(ctx, {
        authorization,
        command: "recordBuildCollaborationMigrationParityEvidence",
        entityId: evidenceId,
        entityType: "buildCollaborationMigrationParityEvidence",
        eventType: "build.collaboration.migration_parity.recorded",
        newState: JSON.stringify({
          importedPostCount,
          mismatchCount,
          parityPassed,
          reportHash,
          sourceRecordCount,
        }),
        now,
        reason,
      });
      return evidenceId;
    })
    .public();

export const transitionBuildCollaborationTenantStatus = authenticatedMutation
  .input({
    buildId: v.id("activeBuilds"),
    expectedStatus: buildCollaborationTenantStatusValidator,
    nextStatus: buildCollaborationTenantStatusValidator,
    organizationId: v.string(),
    reason: v.optional(v.string()),
  })
  .returns(v.id("buildCollaborationTenantSettings"))
  .handler(async (ctx, args) => {
    const authorization = await authorizeActiveBuildAccess(ctx, args);
    await requireHumanCollaborationActor(ctx, authorization);
    requireTenantOperator(authorization);

    const currentSetting = await getTenantSetting(ctx, authorization);
    const currentStatus = currentSetting?.status ?? "disabled";
    if (currentStatus !== args.expectedStatus) {
      throw new Error(
        `Collaboration rollout changed concurrently; expected ${args.expectedStatus} but found ${currentStatus}.`
      );
    }
    requireLegalTransition(currentStatus, args.nextStatus);
    const reason = normalizeReason(args.reason);
    if (args.nextStatus === "disabled" && !reason) {
      throw new Error("A rollback reason is required.");
    }

    const parityEvidence =
      args.nextStatus === "migration_ready" || args.nextStatus === "active"
        ? await requirePassingParityEvidence(ctx, authorization)
        : null;
    if (args.nextStatus === "active") {
      await requireReadyCollaborationSearchCutover(ctx, authorization);
    }
    const now = Date.now();
    const patch = {
      accessRevision: (currentSetting?.accessRevision ?? 0) + 1,
      ...(args.nextStatus === "active"
        ? {
            activatedAt: now,
            activatedByWorkosUserId: authorization.viewer.subject,
          }
        : {}),
      ...(parityEvidence
        ? { migrationCompletedAt: parityEvidence.verifiedAt }
        : {}),
      status: args.nextStatus,
      updatedAt: now,
    };

    const settingId = currentSetting
      ? currentSetting._id
      : await ctx.db.insert("buildCollaborationTenantSettings", {
          brokerageId: authorization.brokerage._id,
          createdAt: now,
          generousRateLimitMultiplier: 1,
          organizationId: authorization.organizationId,
          status: "disabled",
          updatedAt: now,
        });
    await ctx.db.patch(settingId, patch);

    const priorState = JSON.stringify({ status: currentStatus });
    const newState = JSON.stringify({
      migrationCompletedAt: parityEvidence?.verifiedAt,
      status: args.nextStatus,
    });
    await recordRolloutAudit(ctx, {
      authorization,
      command: "transitionBuildCollaborationTenantStatus",
      entityId: settingId,
      entityType: "buildCollaborationTenantSettings",
      eventType: "build.collaboration.tenant_status.changed",
      newState,
      now,
      priorState,
      reason,
    });
    await ctx.db.insert("eventOutbox", {
      brokerageId: authorization.brokerage._id,
      createdAt: now,
      eventType: "build.collaboration.tenant_status.changed",
      organizationId: authorization.organizationId,
      payloadPreview: newState,
      relatedEntityId: settingId,
      relatedEntityType: "buildCollaborationTenantSettings",
      status: "pending",
    });
    return settingId;
  })
  .public();

export async function authorizeActiveBuildCollaborationAccess(
  ctx: ActiveBuildAccessContext,
  input: {
    buildId: Id<"activeBuilds">;
    organizationId: string;
  }
) {
  const authorization = await authorizeActiveBuildAccess(ctx, input);
  await requireActiveBuildCollaborationTenant(ctx, authorization);
  return authorization;
}

async function requireReadyCollaborationSearchCutover(
  ctx: MutationCtx,
  authorization: ActiveBuildAuthorization
) {
  const check = await ctx.db
    .query("buildCollaborationSearchCutoverChecks")
    .withIndex("by_organizationId", (query) =>
      query.eq("organizationId", authorization.organizationId)
    )
    .unique();
  if (
    !check ||
    check.brokerageId !== authorization.brokerage._id ||
    check.status !== "ready" ||
    check.buildCount !== check.readyBuildCount
  ) {
    throw new Error(
      "Collaboration activation requires a completed search readiness verification for every Build."
    );
  }
  const latestBuild = await ctx.db
    .query("activeBuilds")
    .withIndex("by_organizationId", (query) =>
      query.eq("organizationId", authorization.organizationId)
    )
    .order("desc")
    .first();
  const [authorityReaderFingerprint, implicitReaderSourceFingerprint] =
    await Promise.all([
      buildCollaborationOrganizationAuthorityFingerprint(
        ctx,
        authorization.organizationId
      ),
      buildCollaborationImplicitReaderSourceFingerprint(ctx, {
        brokerageId: authorization.brokerage._id,
        organizationId: authorization.organizationId,
      }),
    ]);
  if (
    latestBuild?._creationTime !== check.latestBuildCreationTime ||
    check.authorityReaderFingerprint !== authorityReaderFingerprint ||
    check.implicitReaderSourceFingerprint !== implicitReaderSourceFingerprint
  ) {
    throw new Error(
      "Collaboration search readiness changed after verification; run verification again."
    );
  }
  const [buildingState, queuedJob, runningJob, failedJob] = await Promise.all([
    ctx.db
      .query("buildCollaborationSearchStates")
      .withIndex("by_organizationId_and_status", (query) =>
        query
          .eq("organizationId", authorization.organizationId)
          .eq("status", "building")
      )
      .first(),
    ...(["queued", "running", "failed"] as const).map((status) =>
      ctx.db
        .query("buildCollaborationSearchJobs")
        .withIndex("by_organizationId_and_status", (query) =>
          query
            .eq("organizationId", authorization.organizationId)
            .eq("status", status)
        )
        .first()
    ),
  ]);
  if (buildingState || queuedJob || runningJob || failedJob) {
    throw new Error(
      "Collaboration activation is blocked while search maintenance is pending."
    );
  }
}

export async function requireActiveBuildCollaborationTenant(
  ctx: QueryCtx | MutationCtx,
  authorization: ActiveBuildAuthorization
) {
  const setting = await getTenantSetting(ctx, authorization);
  if (setting?.status !== "active") {
    throw new Error(BUILD_COLLABORATION_UNAVAILABLE_ERROR);
  }
  return setting;
}

export async function requireActiveBuildCollaborationTenantByScope(
  ctx: QueryCtx | MutationCtx,
  input: {
    brokerageId: Id<"brokerages">;
    organizationId: string;
  }
) {
  const setting = await ctx.db
    .query("buildCollaborationTenantSettings")
    .withIndex("by_organizationId", (query) =>
      query.eq("organizationId", input.organizationId)
    )
    .unique();
  if (
    setting?.status !== "active" ||
    setting.brokerageId !== input.brokerageId
  ) {
    throw new Error(BUILD_COLLABORATION_UNAVAILABLE_ERROR);
  }
  return setting;
}

async function getTenantSetting(
  ctx: QueryCtx | MutationCtx,
  authorization: ActiveBuildAuthorization
) {
  const setting = await ctx.db
    .query("buildCollaborationTenantSettings")
    .withIndex("by_organizationId", (query) =>
      query.eq("organizationId", authorization.organizationId)
    )
    .unique();
  if (setting && setting.brokerageId !== authorization.brokerage._id) {
    throw new Error("Forbidden: collaboration tenant scope");
  }
  return setting;
}

function requireTenantOperator(authorization: ActiveBuildAuthorization) {
  if (
    authorization.effectiveRole.role !== "admin" &&
    authorization.effectiveRole.role !== "principle-broker"
  ) {
    throw new Error(
      "Only an administrator or principal broker can change collaboration rollout state."
    );
  }
}

function validateParityEvidence(input: {
  importedPostCount: number;
  mismatchCount: number;
  reportHash: string;
  sourceRecordCount: number;
}) {
  if (
    !Number.isSafeInteger(input.sourceRecordCount) ||
    input.sourceRecordCount < 0 ||
    !Number.isSafeInteger(input.importedPostCount) ||
    input.importedPostCount < 0 ||
    !Number.isSafeInteger(input.mismatchCount) ||
    input.mismatchCount < 0
  ) {
    throw new Error("Migration parity counts must be non-negative integers.");
  }
  if (!input.reportHash.trim()) {
    throw new Error("A durable migration parity report hash is required.");
  }
}

function requireLegalTransition(
  currentStatus: CollaborationTenantStatus,
  nextStatus: CollaborationTenantStatus
) {
  const legal =
    (currentStatus === "disabled" && nextStatus === "migration_ready") ||
    (currentStatus === "migration_ready" && nextStatus === "active") ||
    ((currentStatus === "migration_ready" || currentStatus === "active") &&
      nextStatus === "disabled");
  if (!legal) {
    throw new Error(
      `Illegal collaboration rollout transition: ${currentStatus} → ${nextStatus}.`
    );
  }
}

async function requirePassingParityEvidence(
  ctx: MutationCtx,
  authorization: ActiveBuildAuthorization
) {
  const evidence = await ctx.db
    .query("buildCollaborationMigrationParityEvidence")
    .withIndex("by_organizationId_and_verifiedAt", (query) =>
      query.eq("organizationId", authorization.organizationId)
    )
    .order("desc")
    .first();
  if (
    !evidence ||
    evidence.brokerageId !== authorization.brokerage._id ||
    !evidence.parityPassed ||
    evidence.verificationSource !== "legacy_note_migration_v1" ||
    evidence.reportVersion !== "build-collaboration-legacy-note-parity/v2" ||
    !evidence.planToken ||
    !evidence.migrationRunId ||
    !evidence.parityRunId
  ) {
    throw new Error(
      "Collaboration activation requires durable passing migration parity evidence."
    );
  }
  const migration = await ctx.db.get(evidence.migrationRunId);
  const parity = await ctx.db.get(evidence.parityRunId);
  if (
    !(migration && parity) ||
    migration.organizationId !== authorization.organizationId ||
    migration.brokerageId !== authorization.brokerage._id ||
    migration.status !== "complete" ||
    migration.planToken !== evidence.planToken ||
    parity.organizationId !== authorization.organizationId ||
    parity.brokerageId !== authorization.brokerage._id ||
    parity.migrationRunId !== migration._id ||
    parity.status !== "complete" ||
    parity.evidenceId !== evidence._id ||
    parity.mismatchCount !== 0 ||
    parity.sourceRecordCount !== parity.importedPostCount
  ) {
    throw new Error(
      "Collaboration activation requires the completed bounded migration and parity runs referenced by the evidence."
    );
  }
  return evidence;
}

function normalizeReason(reason?: string) {
  const normalized = reason?.trim();
  return normalized || undefined;
}

async function recordRolloutAudit(
  ctx: MutationCtx,
  input: {
    authorization: ActiveBuildAuthorization;
    command: string;
    entityId: string;
    entityType: string;
    eventType: string;
    newState: string;
    now: number;
    priorState?: string;
    reason?: string;
  }
) {
  await ctx.db.insert("auditEvents", {
    actorRoles: input.authorization.roles,
    actorWorkosUserId: input.authorization.viewer.subject,
    brokerageId: input.authorization.brokerage._id,
    command: input.command,
    createdAt: input.now,
    entityId: input.entityId,
    entityType: input.entityType,
    eventType: input.eventType,
    newState: input.newState,
    organizationId: input.authorization.organizationId,
    priorState: input.priorState,
    reason: input.reason,
    warnings: [],
  });
}
