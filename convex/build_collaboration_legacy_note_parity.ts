import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";

import type { ActiveBuildAuthorization } from "./activeBuildAccess";
import { authenticatedMutation, authenticatedQuery } from "./authz";
import { canReadCollaborationPost } from "./build_collaboration_access";
import { importedManifestPostMismatches } from "./build_collaboration_legacy_note_import";
import { requireMigrationRun } from "./build_collaboration_legacy_note_plan";
import {
  advanceAccumulator,
  authorizeLegacyNoteOperator,
  emptyRoleMatrix,
  hasMore,
  LEGACY_NOTE_PARITY_VERSION,
  MAX_PARITY_BATCH_SIZE,
  normalizePageSize,
  noteSnapshot,
  recordLegacyNoteCutoverAudit,
  requireLegacyNoteCutoverState,
  sha256Hex,
} from "./build_collaboration_legacy_note_shared";
import {
  type BuildCollaborationRole,
  buildCollaborationRoles,
  collaborationRoleTier,
} from "./build_collaboration_model";
import type { Doc, Id, MutationCtx, QueryCtx } from "./types";

const parityStatusValidator = v.union(
  v.literal("initializing_builds"),
  v.literal("checking_notes"),
  v.literal("checking_orphans"),
  v.literal("finalizing_builds"),
  v.literal("complete"),
  v.literal("blocked")
);

const parityRunResultValidator = v.object({
  blockedReason: v.optional(v.string()),
  evidenceId: v.optional(v.id("buildCollaborationMigrationParityEvidence")),
  importedPostCount: v.number(),
  mismatchCount: v.number(),
  parityRunId: v.id("buildCollaborationLegacyNoteParityRuns"),
  planToken: v.string(),
  sourceRecordCount: v.number(),
  status: parityStatusValidator,
});

export const startBuildCollaborationLegacyNoteParity = authenticatedMutation
  .input({
    buildId: v.id("activeBuilds"),
    migrationRunId: v.id("buildCollaborationLegacyNoteMigrationRuns"),
    organizationId: v.string(),
    planToken: v.string(),
  })
  .returns(parityRunResultValidator)
  .handler(async (ctx, args) => {
    const authorization = await authorizeLegacyNoteOperator(ctx, args, true);
    const cutover = await requireLegacyNoteCutoverState(ctx, authorization);
    const migration = await requireMigrationRun(
      ctx,
      args.migrationRunId,
      authorization
    );
    if (
      migration.status !== "complete" ||
      migration.planToken !== args.planToken ||
      migration.cutoverEpoch !== cutover.cutoverEpoch
    ) {
      throw new Error("Parity requires the completed confirmed migration run.");
    }
    const existing = await ctx.db
      .query("buildCollaborationLegacyNoteParityRuns")
      .withIndex("by_organizationId_and_planToken", (query) =>
        query
          .eq("organizationId", authorization.organizationId)
          .eq("planToken", args.planToken)
      )
      .order("desc")
      .first();
    if (existing) {
      requireParityOwnership(existing, authorization);
      const evidence = existing.evidenceId
        ? await ctx.db.get(existing.evidenceId)
        : null;
      if (
        existing.status !== "blocked" &&
        (existing.status !== "complete" || evidence?.parityPassed)
      ) {
        return presentParityRun(existing);
      }
    }
    const now = Date.now();
    const parityRunId = await ctx.db.insert(
      "buildCollaborationLegacyNoteParityRuns",
      {
        brokerageId: authorization.brokerage._id,
        createdAt: now,
        cutoverEpoch: cutover.cutoverEpoch,
        finalizeBuildOrdinal: 0,
        importedPostCount: 0,
        migrationRunId: migration._id,
        mismatchCount: 0,
        nextBuildOrdinal: 0,
        nextNoteOrdinal: 0,
        organizationId: authorization.organizationId,
        orphanBuildOrdinal: 0,
        planToken: migration.planToken,
        reportHashAccumulator: await sha256Hex(
          JSON.stringify({
            organizationId: authorization.organizationId,
            planToken: migration.planToken,
            reportVersion: LEGACY_NOTE_PARITY_VERSION,
          })
        ),
        sourceRecordCount: migration.sourceRecordCount,
        startedByWorkosUserId: authorization.viewer.subject,
        status: "initializing_builds",
        updatedAt: now,
      }
    );
    await recordLegacyNoteCutoverAudit(ctx, authorization, {
      command: "startBuildCollaborationLegacyNoteParity",
      entityId: parityRunId,
      eventType: "build.collaboration.migration_parity.started",
      newState: JSON.stringify({
        migrationRunId: migration._id,
        planToken: migration.planToken,
      }),
      now,
    });
    const run = await ctx.db.get(parityRunId);
    if (!run) {
      throw new Error("Legacy-note parity run could not be created.");
    }
    return presentParityRun(run);
  })
  .public();

export const advanceBuildCollaborationLegacyNoteParity = authenticatedMutation
  .input({
    buildId: v.id("activeBuilds"),
    maxItems: v.optional(v.number()),
    organizationId: v.string(),
    parityRunId: v.id("buildCollaborationLegacyNoteParityRuns"),
    reason: v.optional(v.string()),
  })
  .returns(parityRunResultValidator)
  .handler(async (ctx, args) => {
    const authorization = await authorizeLegacyNoteOperator(ctx, args, true);
    await requireLegacyNoteCutoverState(ctx, authorization);
    const run = await requireParityRun(ctx, args.parityRunId, authorization);
    if (run.status === "complete" || run.status === "blocked") {
      return presentParityRun(run);
    }
    const limit = normalizePageSize(
      args.maxItems ?? MAX_PARITY_BATCH_SIZE,
      MAX_PARITY_BATCH_SIZE
    );
    switch (run.status) {
      case "initializing_builds":
        return await initializeBuildReports(ctx, authorization, run, limit);
      case "checking_notes":
        return await checkNoteParity(ctx, authorization, run, limit);
      case "checking_orphans":
        return await checkOrphanImports(ctx, run, limit);
      case "finalizing_builds":
        return await finalizeBuildReports(
          ctx,
          authorization,
          run,
          limit,
          args.reason
        );
      default:
        return presentParityRun(run);
    }
  })
  .public();

export const getBuildCollaborationLegacyNoteMigrationParityReport =
  authenticatedQuery
    .input({
      buildId: v.id("activeBuilds"),
      evidenceId: v.id("buildCollaborationMigrationParityEvidence"),
      organizationId: v.string(),
      paginationOpts: paginationOptsValidator,
    })
    .returns(v.any())
    .handler(async (ctx, args) => {
      const authorization = await authorizeLegacyNoteOperator(ctx, args);
      normalizePageSize(args.paginationOpts.numItems, MAX_PLAN_REPORT_PAGE);
      const evidence = await ctx.db.get(args.evidenceId);
      if (
        !evidence ||
        evidence.organizationId !== authorization.organizationId ||
        evidence.brokerageId !== authorization.brokerage._id ||
        evidence.verificationSource !== "legacy_note_migration_v1" ||
        !evidence.parityRunId
      ) {
        throw new Error("Migration parity report is unavailable.");
      }
      const parityRunId = evidence.parityRunId;
      const reports = await ctx.db
        .query("buildCollaborationLegacyNoteParityBuildReports")
        .withIndex("by_parityRunId_and_buildOrdinal", (query) =>
          query.eq("parityRunId", parityRunId)
        )
        .paginate(args.paginationOpts);
      return {
        evidence: {
          buildReportCount: evidence.buildReportCount,
          cutoverEpoch: evidence.cutoverEpoch,
          evidenceId: evidence._id,
          importedPostCount: evidence.importedPostCount,
          migrationRunId: evidence.migrationRunId,
          mismatchCount: evidence.mismatchCount,
          parityPassed: evidence.parityPassed,
          parityRunId: evidence.parityRunId,
          planToken: evidence.planToken,
          reportHash: evidence.reportHash,
          reportVersion: evidence.reportVersion,
          sourceRecordCount: evidence.sourceRecordCount,
          verifiedAt: evidence.verifiedAt,
          verifiedByWorkosUserId: evidence.verifiedByWorkosUserId,
        },
        reports,
      };
    })
    .public();

const MAX_PLAN_REPORT_PAGE = 50;

async function initializeBuildReports(
  ctx: MutationCtx,
  authorization: ActiveBuildAuthorization,
  run: Doc<"buildCollaborationLegacyNoteParityRuns">,
  limit: number
) {
  const rows = await ctx.db
    .query("buildCollaborationLegacyNotePlanBuilds")
    .withIndex("by_runId_and_ordinal", (query) =>
      query.eq("runId", run.migrationRunId).gte("ordinal", run.nextBuildOrdinal)
    )
    .take(limit + 1);
  const { items, more } = hasMore(rows, limit);
  for (const build of items) {
    await ctx.db.insert("buildCollaborationLegacyNoteParityBuildReports", {
      brokerageId: authorization.brokerage._id,
      buildId: build.buildId,
      buildOrdinal: build.ordinal,
      createdAt: Date.now(),
      importedPostCount: 0,
      mismatchCount: 0,
      mismatchDetailsJson: "[]",
      organizationId: authorization.organizationId,
      parityPassed: false,
      parityRunId: run._id,
      roleMatrixJson: JSON.stringify(emptyRoleMatrix()),
      sourceRecordCount: 0,
    });
  }
  await ctx.db.patch(run._id, {
    nextBuildOrdinal: run.nextBuildOrdinal + items.length,
    ...(more ? {} : { status: "checking_notes" as const }),
    updatedAt: Date.now(),
  });
  return await refreshedParityRun(ctx, run._id);
}

async function checkNoteParity(
  ctx: MutationCtx,
  authorization: ActiveBuildAuthorization,
  run: Doc<"buildCollaborationLegacyNoteParityRuns">,
  limit: number
) {
  const rows = await ctx.db
    .query("buildCollaborationLegacyNotePlanNotes")
    .withIndex("by_runId_and_ordinal", (query) =>
      query.eq("runId", run.migrationRunId).gte("ordinal", run.nextNoteOrdinal)
    )
    .take(Math.min(limit, 5) + 1);
  const { items, more } = hasMore(rows, Math.min(limit, 5));
  let importedPostCount = run.importedPostCount;
  let mismatchCount = run.mismatchCount;
  for (const manifest of items) {
    const result = await verifyManifestNote(ctx, authorization, manifest);
    importedPostCount += result.importedPostCount;
    mismatchCount += result.mismatches.length + result.roleMismatchCount;
    const report = await requireBuildReport(ctx, run._id, manifest.buildId);
    const details = boundedMismatchDetails(
      report.mismatchDetailsJson,
      result.mismatches.map((code) => ({
        code,
        sourceNoteId: manifest.sourceNoteId,
      }))
    );
    await ctx.db.patch(report._id, {
      importedPostCount: report.importedPostCount + result.importedPostCount,
      mismatchCount:
        report.mismatchCount +
        result.mismatches.length +
        result.roleMismatchCount,
      mismatchDetailsJson: JSON.stringify(details),
      roleMatrixJson: JSON.stringify(
        mergeRoleMatrix(report.roleMatrixJson, result.roleObservations)
      ),
      sourceRecordCount: report.sourceRecordCount + 1,
    });
  }
  await ctx.db.patch(run._id, {
    importedPostCount,
    mismatchCount,
    nextNoteOrdinal: run.nextNoteOrdinal + items.length,
    ...(more ? {} : { status: "checking_orphans" as const }),
    updatedAt: Date.now(),
  });
  return await refreshedParityRun(ctx, run._id);
}

async function checkOrphanImports(
  ctx: MutationCtx,
  run: Doc<"buildCollaborationLegacyNoteParityRuns">,
  limit: number
) {
  const build = await ctx.db
    .query("buildCollaborationLegacyNotePlanBuilds")
    .withIndex("by_runId_and_ordinal", (query) =>
      query
        .eq("runId", run.migrationRunId)
        .eq("ordinal", run.orphanBuildOrdinal)
    )
    .unique();
  if (!build) {
    await ctx.db.patch(run._id, {
      status: "finalizing_builds",
      updatedAt: Date.now(),
    });
    return await refreshedParityRun(ctx, run._id);
  }
  const page = await ctx.db
    .query("buildCollaborationPosts")
    .withIndex("by_buildId_and_createdAt", (query) =>
      query.eq("buildId", build.buildId)
    )
    .paginate({ cursor: run.orphanPostCursor ?? null, numItems: limit });
  let importedPostCount = run.importedPostCount;
  let mismatchCount = run.mismatchCount;
  for (const post of page.page) {
    if (
      post.source !== "imported" ||
      !post.importedSourceId?.startsWith("buildNote:")
    ) {
      continue;
    }
    const manifest = await ctx.db
      .query("buildCollaborationLegacyNotePlanNotes")
      .withIndex("by_runId_and_importedSourceId", (query) =>
        query
          .eq("runId", run.migrationRunId)
          .eq("importedSourceId", post.importedSourceId as string)
      )
      .unique();
    if (!manifest) {
      importedPostCount += 1;
      mismatchCount += 1;
      const report = await requireBuildReport(ctx, run._id, build.buildId);
      const details = boundedMismatchDetails(report.mismatchDetailsJson, [
        { code: "orphan_import", postId: post._id },
      ]);
      await ctx.db.patch(report._id, {
        importedPostCount: report.importedPostCount + 1,
        mismatchCount: report.mismatchCount + 1,
        mismatchDetailsJson: JSON.stringify(details),
      });
    }
  }
  await ctx.db.patch(run._id, {
    importedPostCount,
    mismatchCount,
    orphanBuildOrdinal: page.isDone
      ? run.orphanBuildOrdinal + 1
      : run.orphanBuildOrdinal,
    orphanPostCursor: page.isDone ? undefined : page.continueCursor,
    updatedAt: Date.now(),
  });
  return await refreshedParityRun(ctx, run._id);
}

async function finalizeBuildReports(
  ctx: MutationCtx,
  authorization: ActiveBuildAuthorization,
  run: Doc<"buildCollaborationLegacyNoteParityRuns">,
  limit: number,
  reason?: string
) {
  const rows = await ctx.db
    .query("buildCollaborationLegacyNoteParityBuildReports")
    .withIndex("by_parityRunId_and_buildOrdinal", (query) =>
      query
        .eq("parityRunId", run._id)
        .gte("buildOrdinal", run.finalizeBuildOrdinal)
    )
    .take(limit + 1);
  const { items, more } = hasMore(rows, limit);
  let mismatchCount = run.mismatchCount;
  let accumulator = run.reportHashAccumulator;
  for (const report of items) {
    const countMismatch =
      report.sourceRecordCount === report.importedPostCount ? 0 : 1;
    mismatchCount += countMismatch;
    const finalized = {
      buildId: report.buildId,
      importedPostCount: report.importedPostCount,
      mismatchCount: report.mismatchCount + countMismatch,
      roleMatrix: JSON.parse(report.roleMatrixJson),
      sourceRecordCount: report.sourceRecordCount,
    };
    accumulator = await advanceAccumulator(accumulator, "report", finalized);
    await ctx.db.patch(report._id, {
      mismatchCount: finalized.mismatchCount,
      mismatchDetailsJson: JSON.stringify(
        countMismatch
          ? boundedMismatchDetails(report.mismatchDetailsJson, [
              { code: "source_import_count_mismatch" },
            ])
          : JSON.parse(report.mismatchDetailsJson)
      ),
      parityPassed: finalized.mismatchCount === 0,
    });
  }
  const nextOrdinal = run.finalizeBuildOrdinal + items.length;
  if (more) {
    await ctx.db.patch(run._id, {
      finalizeBuildOrdinal: nextOrdinal,
      mismatchCount,
      reportHashAccumulator: accumulator,
      updatedAt: Date.now(),
    });
    return await refreshedParityRun(ctx, run._id);
  }
  const now = Date.now();
  const migration = await ctx.db.get(run.migrationRunId);
  if (!migration || migration.status !== "complete") {
    return await blockParityRun(
      ctx,
      run,
      "Migration run is no longer complete."
    );
  }
  const parityPassed =
    mismatchCount === 0 && run.sourceRecordCount === run.importedPostCount;
  const evidenceId = await ctx.db.insert(
    "buildCollaborationMigrationParityEvidence",
    {
      brokerageId: authorization.brokerage._id,
      buildReportCount: migration.processedBuildCount,
      importedPostCount: run.importedPostCount,
      cutoverEpoch: run.cutoverEpoch ?? 0,
      migrationRunId: migration._id,
      mismatchCount,
      organizationId: authorization.organizationId,
      parityPassed,
      parityRunId: run._id,
      planToken: run.planToken,
      reason: reason?.trim() || undefined,
      reportHash: `${LEGACY_NOTE_PARITY_VERSION}:${accumulator}`,
      reportVersion: LEGACY_NOTE_PARITY_VERSION,
      sourceRecordCount: run.sourceRecordCount,
      verificationSource: "legacy_note_migration_v1",
      verifiedAt: now,
      verifiedByWorkosUserId: authorization.viewer.subject,
    }
  );
  await ctx.db.patch(run._id, {
    completedAt: now,
    evidenceId,
    finalizeBuildOrdinal: nextOrdinal,
    mismatchCount,
    reportHashAccumulator: accumulator,
    status: "complete",
    updatedAt: now,
  });
  await recordLegacyNoteCutoverAudit(ctx, authorization, {
    command: "completeBuildCollaborationLegacyNoteParity",
    entityId: evidenceId,
    eventType: "build.collaboration.migration_parity.recorded",
    newState: JSON.stringify({
      importedPostCount: run.importedPostCount,
      mismatchCount,
      parityPassed,
      planToken: run.planToken,
      sourceRecordCount: run.sourceRecordCount,
    }),
    now,
    reason: reason?.trim() || undefined,
  });
  return await refreshedParityRun(ctx, run._id);
}

async function verifyManifestNote(
  ctx: MutationCtx,
  authorization: ActiveBuildAuthorization,
  manifest: Doc<"buildCollaborationLegacyNotePlanNotes">
) {
  const mismatches: string[] = [];
  const source = await ctx.db.get(manifest.sourceNoteId);
  let sourceMatchesManifest = false;
  if (source) {
    try {
      sourceMatchesManifest =
        (await sha256Hex(JSON.stringify(noteSnapshot(source)))) ===
        manifest.snapshotHash;
    } catch (error) {
      if (!(error instanceof Error)) {
        throw error;
      }
    }
  }
  if (!sourceMatchesManifest) {
    mismatches.push("source_drift");
  }
  const posts = await ctx.db
    .query("buildCollaborationPosts")
    .withIndex("by_buildId_and_importedSourceId", (query) =>
      query
        .eq("buildId", manifest.buildId)
        .eq("importedSourceId", manifest.importedSourceId)
    )
    .take(2);
  if (posts.length === 1) {
    mismatches.push(
      ...(await importedManifestPostMismatches(ctx, manifest, posts[0]))
    );
  } else {
    mismatches.push(posts.length === 0 ? "missing_import" : "duplicate_import");
  }
  const roleObservations: Array<{
    expected: boolean;
    observed: boolean;
    role: BuildCollaborationRole;
  }> = [];
  let roleMismatchCount = 0;
  for (const role of buildCollaborationRoles) {
    const expected =
      manifest.audienceMode === "build_wide" ||
      collaborationRoleTier(role) >= manifest.audienceFloorTier;
    const observed = posts[0]
      ? await canReadCollaborationPost(
          ctx as unknown as QueryCtx,
          syntheticAuthorization(authorization, role, manifest.buildId),
          posts[0]
        )
      : false;
    if (expected !== observed) {
      roleMismatchCount += 1;
    }
    roleObservations.push({ expected, observed, role });
  }
  return {
    importedPostCount: posts.length,
    mismatches,
    roleMismatchCount,
    roleObservations,
  };
}

function syntheticAuthorization(
  authorization: ActiveBuildAuthorization,
  role: BuildCollaborationRole,
  buildId: Id<"activeBuilds">
): ActiveBuildAuthorization {
  return {
    ...authorization,
    build: { ...authorization.build, _id: buildId },
    effectiveRole: { role, tier: collaborationRoleTier(role) },
    roles: [role],
    viewer: {
      ...authorization.viewer,
      roles: role === "homeowner" ? ["member"] : [role],
      subject: `parity-observer:${role}`,
    },
  };
}

function mergeRoleMatrix(
  currentJson: string,
  observations: Array<{
    expected: boolean;
    observed: boolean;
    role: BuildCollaborationRole;
  }>
) {
  const matrix = JSON.parse(currentJson) as ReturnType<typeof emptyRoleMatrix>;
  for (const observation of observations) {
    const cell = matrix[observation.role];
    if (observation.expected) {
      cell.expectedReadable += 1;
    } else {
      cell.expectedRestricted += 1;
    }
    if (observation.observed) {
      cell.observedReadable += 1;
    } else {
      cell.observedRestricted += 1;
    }
    if (observation.expected !== observation.observed) {
      cell.mismatchCount += 1;
    }
  }
  return matrix;
}

function boundedMismatchDetails(currentJson: string, additions: unknown[]) {
  const current = JSON.parse(currentJson) as unknown[];
  return [...current, ...additions].slice(0, 50);
}

async function requireBuildReport(
  ctx: MutationCtx,
  parityRunId: Id<"buildCollaborationLegacyNoteParityRuns">,
  buildId: Id<"activeBuilds">
) {
  const report = await ctx.db
    .query("buildCollaborationLegacyNoteParityBuildReports")
    .withIndex("by_parityRunId_and_buildId", (query) =>
      query.eq("parityRunId", parityRunId).eq("buildId", buildId)
    )
    .unique();
  if (!report) {
    throw new Error("Build parity report has not been initialized.");
  }
  return report;
}

async function requireParityRun(
  ctx: MutationCtx,
  parityRunId: Id<"buildCollaborationLegacyNoteParityRuns">,
  authorization: ActiveBuildAuthorization
) {
  const run = await ctx.db.get(parityRunId);
  if (!run) {
    throw new Error("Legacy-note parity run is unavailable.");
  }
  const cutover = await requireLegacyNoteCutoverState(ctx, authorization);
  if (run.cutoverEpoch !== cutover.cutoverEpoch) {
    throw new Error(
      "Legacy-note parity belongs to a superseded cutover epoch."
    );
  }
  requireParityOwnership(run, authorization);
  return run;
}

function requireParityOwnership(
  run: Doc<"buildCollaborationLegacyNoteParityRuns">,
  authorization: ActiveBuildAuthorization
) {
  if (
    run.organizationId !== authorization.organizationId ||
    run.brokerageId !== authorization.brokerage._id
  ) {
    throw new Error("Legacy-note parity run is unavailable.");
  }
}

async function refreshedParityRun(
  ctx: MutationCtx,
  parityRunId: Id<"buildCollaborationLegacyNoteParityRuns">
) {
  const run = await ctx.db.get(parityRunId);
  if (!run) {
    throw new Error("Legacy-note parity run became unavailable.");
  }
  return presentParityRun(run);
}

async function blockParityRun(
  ctx: MutationCtx,
  run: Doc<"buildCollaborationLegacyNoteParityRuns">,
  reason: string
) {
  await ctx.db.patch(run._id, {
    blockedReason: reason,
    status: "blocked",
    updatedAt: Date.now(),
  });
  return await refreshedParityRun(ctx, run._id);
}

function presentParityRun(run: Doc<"buildCollaborationLegacyNoteParityRuns">) {
  return {
    blockedReason: run.blockedReason,
    evidenceId: run.evidenceId,
    importedPostCount: run.importedPostCount,
    mismatchCount: run.mismatchCount,
    parityRunId: run._id,
    planToken: run.planToken,
    sourceRecordCount: run.sourceRecordCount,
    status: run.status,
  };
}
