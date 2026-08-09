import { v } from "convex/values";

import { authenticatedMutation, authenticatedQuery } from "./authz";
import {
  authorizeLegacyNoteOperator,
  normalizePageSize,
  sha256Hex,
} from "./build_collaboration_legacy_note_shared";
import { synchronizeMilestoneSystemPostPlanning } from "./build_collaboration_system_posts";
import type { Doc, Id, MutationCtx, QueryCtx } from "./types";

const PLAN_VERSION = "build-submilestone-companion-cutover/v1";
const MAX_SOURCE_ROWS = 500;
const MAX_CANDIDATES = 1000;
const MAX_BATCH_SIZE = 25;
const DEFAULT_BATCH_SIZE = 10;

const classificationValidator = v.union(
  v.literal("healthy"),
  v.literal("missing"),
  v.literal("duplicate"),
  v.literal("malformed"),
  v.literal("cross_scope"),
  v.literal("incorrectly_superseded"),
  v.literal("historical")
);

const outcomeValidator = v.union(
  v.literal("pending"),
  v.literal("unchanged"),
  v.literal("repaired"),
  v.literal("materialized"),
  v.literal("historical"),
  v.literal("exception")
);

const runStatusValidator = v.union(
  v.literal("seeding_reports"),
  v.literal("repairing"),
  v.literal("materializing"),
  v.literal("checking_parity"),
  v.literal("complete"),
  v.literal("blocked")
);

const previewRecordValidator = v.object({
  buildSubmilestoneId: v.optional(v.id("buildSubmilestones")),
  candidateActionItemIds: v.array(v.id("buildActionItems")),
  classification: classificationValidator,
  recordKey: v.string(),
  reportId: v.string(),
  snapshotHash: v.string(),
});

const previewValidator = v.object({
  activeSubmilestoneCount: v.number(),
  buildId: v.id("activeBuilds"),
  counts: v.object({
    crossScope: v.number(),
    duplicate: v.number(),
    healthy: v.number(),
    historical: v.number(),
    incorrectlySuperseded: v.number(),
    malformed: v.number(),
    missing: v.number(),
  }),
  generatedCompanionCount: v.number(),
  manualActionItemCount: v.number(),
  planToken: v.string(),
  planVersion: v.string(),
  records: v.array(previewRecordValidator),
  truncated: v.boolean(),
  warnings: v.array(v.string()),
});

const runValidator = v.object({
  activeSubmilestoneCount: v.number(),
  buildId: v.id("activeBuilds"),
  completedAt: v.optional(v.number()),
  exceptionCount: v.number(),
  generatedCompanionCount: v.number(),
  lastError: v.optional(v.string()),
  manualActionItemCount: v.number(),
  materializedCount: v.number(),
  lastParityRecordKey: v.optional(v.string()),
  nextMilestoneOrdinal: v.number(),
  nextReportOrdinal: v.number(),
  nextSeedOrdinal: v.number(),
  parityCheckedCount: v.number(),
  parityMismatchCount: v.number(),
  planToken: v.string(),
  planVersion: v.string(),
  repairedCount: v.number(),
  reportCount: v.number(),
  reportHash: v.optional(v.string()),
  runId: v.id("buildSubmilestoneCompanionCutoverRuns"),
  startedByWorkosUserId: v.string(),
  status: runStatusValidator,
});

const reportValidator = v.object({
  buildSubmilestoneId: v.optional(v.id("buildSubmilestones")),
  candidateActionItemIds: v.array(v.id("buildActionItems")),
  classification: classificationValidator,
  exceptionReason: v.optional(v.string()),
  historyCountsJson: v.optional(v.string()),
  ordinal: v.number(),
  outcome: outcomeValidator,
  recordKey: v.string(),
  reportId: v.string(),
  survivorActionItemId: v.optional(v.id("buildActionItems")),
});

type Classification =
  | "healthy"
  | "missing"
  | "duplicate"
  | "malformed"
  | "cross_scope"
  | "incorrectly_superseded"
  | "historical";

interface SnapshotRecord {
  buildSubmilestoneId?: Id<"buildSubmilestones">;
  candidateActionItemIds: Id<"buildActionItems">[];
  classification: Classification;
  recordKey: string;
  reportId: string;
  snapshotHash: string;
}

type CutoverRun = Doc<"buildSubmilestoneCompanionCutoverRuns">;
type CutoverReport = Doc<"buildSubmilestoneCompanionCutoverReports">;
type CutoverContext = QueryCtx | MutationCtx;

export const previewBuildSubmilestoneCompanionCutover = authenticatedQuery
  .input({
    buildId: v.id("activeBuilds"),
    organizationId: v.string(),
  })
  .returns(previewValidator)
  .handler(async (ctx, args) => {
    const authorization = await authorizeLegacyNoteOperator(ctx, args);
    return await buildPreview(ctx, authorization);
  })
  .public();

export const startBuildSubmilestoneCompanionCutover = authenticatedMutation
  .input({
    batchSize: v.optional(v.number()),
    buildId: v.id("activeBuilds"),
    organizationId: v.string(),
    planToken: v.string(),
  })
  .returns(runValidator)
  .handler(async (ctx, args) => {
    const authorization = await authorizeLegacyNoteOperator(ctx, args, true);
    if (!args.planToken.startsWith(`${PLAN_VERSION}:`)) {
      throw new Error(
        "A valid companion cutover preview plan token is required."
      );
    }
    const existing = await ctx.db
      .query("buildSubmilestoneCompanionCutoverRuns")
      .withIndex("by_buildId_and_planToken", (query) =>
        query.eq("buildId", args.buildId).eq("planToken", args.planToken)
      )
      .first();
    if (existing) {
      requireRunScope(existing, authorization);
      return presentRun(existing);
    }
    const inFlightStatuses = [
      "seeding_reports",
      "repairing",
      "materializing",
      "checking_parity",
    ] as const;
    const inFlightRuns = await Promise.all(
      inFlightStatuses.map((status) =>
        ctx.db
          .query("buildSubmilestoneCompanionCutoverRuns")
          .withIndex("by_buildId_and_status", (query) =>
            query.eq("buildId", args.buildId).eq("status", status)
          )
          .first()
      )
    );
    if (inFlightRuns.some(Boolean)) {
      throw new Error(
        "Another companion cutover run is already in progress for this Build."
      );
    }
    const preview = await buildPreview(ctx, authorization);
    if (preview.truncated) {
      throw new Error(
        "Companion cutover source exceeds the bounded safety limit; split or repair the Build before applying."
      );
    }
    if (preview.planToken !== args.planToken) {
      throw new Error(
        "Companion bindings changed after preview; generate a new cutover plan."
      );
    }
    const milestoneSnapshot = await loadMilestones(
      ctx,
      authorization.build._id
    );
    if (milestoneSnapshot.truncated) {
      throw new Error("Milestone source exceeds the cutover safety limit.");
    }
    const milestoneIds = milestoneSnapshot.items
      .filter((milestone) => milestone.planningState !== "superseded")
      .map((milestone) => milestone._id);
    const batchSize = normalizePageSize(
      args.batchSize ?? DEFAULT_BATCH_SIZE,
      MAX_BATCH_SIZE
    );
    const now = Date.now();
    const runId = await ctx.db.insert("buildSubmilestoneCompanionCutoverRuns", {
      activeSubmilestoneCount: preview.activeSubmilestoneCount,
      batchSize,
      brokerageId: authorization.brokerage._id,
      buildId: authorization.build._id,
      completedAt: undefined,
      crossScopeCount: preview.counts.crossScope,
      createdAt: now,
      duplicateCount: preview.counts.duplicate,
      exceptionCount: 0,
      generatedCompanionCount: preview.generatedCompanionCount,
      healthyCount: preview.counts.healthy,
      historicalCount: preview.counts.historical,
      lastError: undefined,
      malformedCount: preview.counts.malformed,
      manualActionItemCount: preview.manualActionItemCount,
      materializedCount: 0,
      milestoneIds,
      missingCount: preview.counts.missing,
      lastParityRecordKey: undefined,
      nextMilestoneOrdinal: 0,
      nextReportOrdinal: 0,
      nextSeedOrdinal: 0,
      organizationId: authorization.organizationId,
      parityCheckedCount: 0,
      parityMismatchCount: 0,
      planToken: preview.planToken,
      planVersion: PLAN_VERSION,
      repairedCount: 0,
      reportCount: preview.records.length,
      reportHash: undefined,
      startedByWorkosUserId: authorization.viewer.subject,
      status: "seeding_reports",
      updatedAt: now,
    });
    const run = await ctx.db.get(runId);
    if (!run) {
      throw new Error("Companion cutover run could not be created.");
    }
    return presentRun(run);
  })
  .public();

export const advanceBuildSubmilestoneCompanionCutover = authenticatedMutation
  .input({
    buildId: v.id("activeBuilds"),
    maxItems: v.optional(v.number()),
    organizationId: v.string(),
    runId: v.id("buildSubmilestoneCompanionCutoverRuns"),
  })
  .returns(runValidator)
  .handler(async (ctx, args) => {
    const authorization = await authorizeLegacyNoteOperator(ctx, args, true);
    let run = await requireRun(ctx, args.runId, authorization);
    if (run.status === "complete" || run.status === "blocked") {
      return presentRun(run);
    }
    const limit = normalizePageSize(
      args.maxItems ?? run.batchSize,
      MAX_BATCH_SIZE
    );
    try {
      if (run.status === "seeding_reports") {
        run = await advanceReportSeeding(ctx, authorization, run, limit);
      } else if (run.status === "repairing") {
        run = await advanceRepair(ctx, authorization, run, limit);
      } else if (run.status === "materializing") {
        run = await advanceMaterialization(ctx, authorization, run, limit);
      } else if (run.status === "checking_parity") {
        run = await advanceParity(ctx, authorization, run, limit);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await ctx.db.patch(run._id, {
        exceptionCount: run.exceptionCount + 1,
        lastError: message.slice(0, 500),
        status: "blocked",
        updatedAt: Date.now(),
      });
      const blocked = await ctx.db.get(run._id);
      if (!blocked) {
        throw error;
      }
      run = blocked;
    }
    return presentRun(run);
  })
  .public();

export const getBuildSubmilestoneCompanionCutoverReports = authenticatedQuery
  .input({
    buildId: v.id("activeBuilds"),
    cursor: v.optional(v.number()),
    limit: v.optional(v.number()),
    organizationId: v.string(),
    runId: v.id("buildSubmilestoneCompanionCutoverRuns"),
  })
  .returns(
    v.object({
      hasMore: v.boolean(),
      nextCursor: v.optional(v.number()),
      reports: v.array(reportValidator),
      run: runValidator,
    })
  )
  .handler(async (ctx, args) => {
    const authorization = await authorizeLegacyNoteOperator(ctx, args);
    const run = await requireRun(ctx, args.runId, authorization);
    const limit = normalizePageSize(args.limit ?? 25, 50);
    const cursor = args.cursor ?? 0;
    const rows = await ctx.db
      .query("buildSubmilestoneCompanionCutoverReports")
      .withIndex("by_runId_and_ordinal", (query) =>
        query.eq("runId", run._id).gte("ordinal", cursor)
      )
      .take(limit + 1);
    const lastReturned = rows[limit - 1];
    return {
      hasMore: rows.length > limit,
      nextCursor:
        rows.length > limit && lastReturned
          ? lastReturned.ordinal + 1
          : undefined,
      reports: rows.slice(0, limit).map(presentReport),
      run: presentRun(run),
    };
  })
  .public();

export const getBuildActionItemMetricDimensions = authenticatedQuery
  .input({
    buildId: v.id("activeBuilds"),
    organizationId: v.string(),
  })
  .returns(
    v.object({
      activeSubmilestoneCompanionCount: v.number(),
      historicalSubmilestoneCompanionCount: v.number(),
      manualActionItemCount: v.number(),
    })
  )
  .handler(async (ctx, args) => {
    const authorization = await authorizeLegacyNoteOperator(ctx, args);
    const snapshot = await loadActionItems(ctx, authorization.build._id);
    if (snapshot.truncated) {
      throw new Error(
        "Action Item metric source exceeds the bounded safety limit."
      );
    }
    return metricDimensions(snapshot.items);
  })
  .public();

async function advanceReportSeeding(
  ctx: MutationCtx,
  authorization: Awaited<ReturnType<typeof authorizeLegacyNoteOperator>>,
  run: CutoverRun,
  limit: number
) {
  const preview = await buildPreview(ctx, authorization);
  if (preview.truncated) {
    throw new Error(
      "Companion cutover source exceeds the bounded safety limit while seeding reports."
    );
  }
  if (
    preview.planToken !== run.planToken ||
    preview.records.length !== run.reportCount
  ) {
    throw new Error(
      "Companion bindings changed while seeding the cutover manifest."
    );
  }
  const batch = preview.records.slice(
    run.nextSeedOrdinal,
    run.nextSeedOrdinal + limit
  );
  const now = Date.now();
  let nextSeedOrdinal = run.nextSeedOrdinal;
  for (const [offset, record] of batch.entries()) {
    const ordinal = run.nextSeedOrdinal + offset;
    const existing = await ctx.db
      .query("buildSubmilestoneCompanionCutoverReports")
      .withIndex("by_runId_and_ordinal", (query) =>
        query.eq("runId", run._id).eq("ordinal", ordinal)
      )
      .first();
    if (existing) {
      if (
        existing.reportId !== record.reportId ||
        existing.snapshotHash !== record.snapshotHash
      ) {
        throw new Error(
          `Cutover report receipt ${ordinal} does not match the preview manifest.`
        );
      }
    } else {
      await ctx.db.insert("buildSubmilestoneCompanionCutoverReports", {
        brokerageId: authorization.brokerage._id,
        buildId: authorization.build._id,
        buildSubmilestoneId: record.buildSubmilestoneId,
        candidateActionItemIds: record.candidateActionItemIds,
        classification: record.classification,
        createdAt: now,
        exceptionReason: undefined,
        historyCountsJson: undefined,
        ordinal,
        organizationId: authorization.organizationId,
        outcome: "pending",
        recordKey: record.recordKey,
        reportId: record.reportId,
        runId: run._id,
        snapshotHash: record.snapshotHash,
        survivorActionItemId: undefined,
        updatedAt: now,
      });
    }
    nextSeedOrdinal = ordinal + 1;
    await ctx.db.patch(run._id, { nextSeedOrdinal, updatedAt: now });
  }
  const complete = nextSeedOrdinal >= run.reportCount;
  await ctx.db.patch(run._id, {
    nextSeedOrdinal,
    status: complete ? "repairing" : "seeding_reports",
    updatedAt: now,
  });
  return await getUpdatedRun(ctx, run._id);
}

async function advanceRepair(
  ctx: MutationCtx,
  authorization: Awaited<ReturnType<typeof authorizeLegacyNoteOperator>>,
  run: CutoverRun,
  limit: number
) {
  const reports = await ctx.db
    .query("buildSubmilestoneCompanionCutoverReports")
    .withIndex("by_runId_and_ordinal", (query) =>
      query.eq("runId", run._id).gte("ordinal", run.nextReportOrdinal)
    )
    .take(limit);
  if (reports.length === 0 && run.nextReportOrdinal < run.reportCount) {
    throw new Error(
      "Companion cutover report rows are missing for the recorded report count."
    );
  }
  let repairedCount = run.repairedCount;
  let nextReportOrdinal = run.nextReportOrdinal;
  for (const report of reports) {
    if (report.outcome !== "pending") {
      nextReportOrdinal = report.ordinal + 1;
      await ctx.db.patch(run._id, {
        nextReportOrdinal,
        repairedCount,
        updatedAt: Date.now(),
      });
      continue;
    }
    const current = await rebuildRecord(ctx, authorization, report);
    if (!current || current.snapshotHash !== report.snapshotHash) {
      await markException(ctx, report, "source_changed_after_preview");
      throw new Error(
        `Companion cutover source changed after preview for ${report.recordKey}.`
      );
    }
    const result = await repairRecord(ctx, authorization, report, current);
    if (result.repaired) {
      repairedCount += 1;
    }
    nextReportOrdinal = report.ordinal + 1;
    await ctx.db.patch(run._id, {
      nextReportOrdinal,
      repairedCount,
      updatedAt: Date.now(),
    });
  }
  const complete = nextReportOrdinal >= run.reportCount;
  await ctx.db.patch(run._id, {
    nextReportOrdinal,
    repairedCount,
    status: complete ? "materializing" : "repairing",
    updatedAt: Date.now(),
  });
  return await getUpdatedRun(ctx, run._id);
}

async function advanceMaterialization(
  ctx: MutationCtx,
  authorization: Awaited<ReturnType<typeof authorizeLegacyNoteOperator>>,
  run: CutoverRun,
  limit: number
) {
  const batchIds = run.milestoneIds.slice(
    run.nextMilestoneOrdinal,
    run.nextMilestoneOrdinal + Math.min(limit, 1)
  );
  const batch: Doc<"buildMilestones">[] = [];
  for (const milestoneId of batchIds) {
    const milestone = await ctx.db.get(milestoneId);
    if (
      !milestone ||
      milestone.buildId !== authorization.build._id ||
      milestone.organizationId !== authorization.organizationId ||
      milestone.brokerageId !== authorization.brokerage._id ||
      milestone.planningState === "superseded"
    ) {
      throw new Error(
        `Captured cutover Milestone ${milestoneId} changed after the run started.`
      );
    }
    batch.push(milestone);
  }
  const beforeCounts = await assertMilestoneMaterializationSafe(
    ctx,
    authorization,
    batch
  );
  let materializedCount = run.materializedCount;
  let nextMilestoneOrdinal = run.nextMilestoneOrdinal;
  for (const milestone of batch) {
    const before = beforeCounts.get(String(milestone._id)) ?? 0;
    await synchronizeMilestoneSystemPostPlanning(ctx, {
      actor: {
        roles: authorization.roles,
        workosUserId: authorization.viewer.subject,
      },
      build: authorization.build,
      milestone,
    });
    const after = await activeCompanionCountForMilestone(ctx, milestone._id);
    materializedCount += Math.max(0, after - before);
    nextMilestoneOrdinal += 1;
    await ctx.db.patch(run._id, {
      materializedCount,
      nextMilestoneOrdinal,
      updatedAt: Date.now(),
    });
  }
  const complete = nextMilestoneOrdinal >= run.milestoneIds.length;
  await ctx.db.patch(run._id, {
    materializedCount,
    nextMilestoneOrdinal,
    status: complete ? "checking_parity" : "materializing",
    updatedAt: Date.now(),
  });
  return await getUpdatedRun(ctx, run._id);
}

async function advanceParity(
  ctx: MutationCtx,
  authorization: Awaited<ReturnType<typeof authorizeLegacyNoteOperator>>,
  run: CutoverRun,
  limit: number
) {
  const snapshot = await buildSnapshot(ctx, authorization);
  if (snapshot.truncated) {
    throw new Error(
      "Companion parity source exceeds the cutover safety limit."
    );
  }
  const canonicalRecords = snapshot.records
    .filter((record) => record.buildSubmilestoneId)
    .sort((left, right) => left.recordKey.localeCompare(right.recordKey));
  const eligibleRecords = canonicalRecords.filter(
    (record) =>
      !run.lastParityRecordKey || record.recordKey > run.lastParityRecordKey
  );
  const batch = eligibleRecords.slice(0, limit);
  let parityMismatchCount = run.parityMismatchCount;
  for (const record of batch) {
    const passes =
      record.classification === "healthy" ||
      record.classification === "historical";
    if (!passes) {
      parityMismatchCount += 1;
    }
    const report = await ctx.db
      .query("buildSubmilestoneCompanionCutoverReports")
      .withIndex("by_runId_and_recordKey", (query) =>
        query.eq("runId", run._id).eq("recordKey", record.recordKey)
      )
      .first();
    if (report && passes && report.classification === "missing") {
      await ctx.db.patch(report._id, {
        outcome: "materialized",
        updatedAt: Date.now(),
      });
    }
  }
  const lastParityRecordKey =
    batch.at(-1)?.recordKey ?? run.lastParityRecordKey;
  const parityCheckedCount = run.parityCheckedCount + batch.length;
  const complete = eligibleRecords.length <= batch.length;
  if (complete && parityCheckedCount !== canonicalRecords.length) {
    parityMismatchCount += Math.abs(
      canonicalRecords.length - parityCheckedCount
    );
  }
  if (complete && parityMismatchCount > 0) {
    await ctx.db.patch(run._id, {
      lastParityRecordKey,
      parityCheckedCount,
      parityMismatchCount,
      updatedAt: Date.now(),
    });
    throw new Error(
      `Companion parity found ${parityMismatchCount} unresolved binding mismatches.`
    );
  }
  const dimensions = metricDimensions(snapshot.actionItems);
  const now = Date.now();
  let reportHash: string | undefined;
  if (complete) {
    const reports = await ctx.db
      .query("buildSubmilestoneCompanionCutoverReports")
      .withIndex("by_runId_and_ordinal", (query) => query.eq("runId", run._id))
      .collect();
    reportHash = await sha256Hex(
      JSON.stringify({
        planToken: run.planToken,
        records: reports.map((report) => ({
          exceptionReason: report.exceptionReason,
          outcome: report.outcome,
          recordKey: report.recordKey,
          reportId: report.reportId,
          survivorActionItemId: report.survivorActionItemId,
        })),
      })
    );
  }
  await ctx.db.patch(run._id, {
    completedAt: complete ? now : undefined,
    generatedCompanionCount:
      dimensions.activeSubmilestoneCompanionCount +
      dimensions.historicalSubmilestoneCompanionCount,
    manualActionItemCount: dimensions.manualActionItemCount,
    lastParityRecordKey,
    parityCheckedCount,
    parityMismatchCount,
    reportHash,
    status: complete ? "complete" : "checking_parity",
    updatedAt: now,
  });
  return await getUpdatedRun(ctx, run._id);
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: each branch is an explicit fail-closed anomaly policy from the cutover contract
async function repairRecord(
  ctx: MutationCtx,
  authorization: Awaited<ReturnType<typeof authorizeLegacyNoteOperator>>,
  report: CutoverReport,
  record: SnapshotRecord
) {
  if (record.classification === "healthy") {
    await ctx.db.patch(report._id, {
      outcome: "unchanged",
      survivorActionItemId: record.candidateActionItemIds[0],
      updatedAt: Date.now(),
    });
    return { repaired: false };
  }
  if (record.classification === "missing") {
    await ctx.db.patch(report._id, {
      outcome: "unchanged",
      updatedAt: Date.now(),
    });
    return { repaired: false };
  }
  const history = await Promise.all(
    record.candidateActionItemIds.map(async (actionItemId) => ({
      actionItemId,
      counts: await ownedHistoryCounts(
        ctx,
        authorization.build._id,
        actionItemId
      ),
    }))
  );
  const historyCountsJson = JSON.stringify(history);
  const historyBearing = history.filter(({ counts }) => counts.humanOwned > 0);
  if (
    record.classification === "cross_scope" ||
    historyBearing.length > 1 ||
    (record.classification === "malformed" && historyBearing.length > 0)
  ) {
    const reason =
      record.classification === "cross_scope"
        ? "cross_scope_binding"
        : record.classification === "malformed"
          ? "malformed_binding_with_history"
          : "conflicting_history";
    await markException(ctx, report, reason, historyCountsJson);
    throw new Error(
      `Companion cutover requires manual resolution for ${report.recordKey}: ${reason}.`
    );
  }
  if (record.classification === "duplicate") {
    const items = await Promise.all(
      record.candidateActionItemIds.map((id) => ctx.db.get(id))
    );
    const candidates = items.filter(
      (item): item is Doc<"buildActionItems"> => item !== null
    );
    const historyOwner = historyBearing[0];
    const survivor =
      (historyOwner
        ? candidates.find((item) => item._id === historyOwner.actionItemId)
        : undefined) ?? deterministicSurvivor(candidates);
    if (!survivor) {
      await markException(
        ctx,
        report,
        "missing_duplicate_survivor",
        historyCountsJson
      );
      throw new Error(
        `Duplicate companion survivor is unavailable for ${report.recordKey}.`
      );
    }
    const now = Date.now();
    await ctx.db.patch(survivor._id, {
      canonicalCompanionDisposition: "active",
      canonicalCompanionSupersededAt: undefined,
      canonicalCompanionSurvivorId: undefined,
      canonicalPlanningState: "active",
      currentRevision: survivor.currentRevision + 1,
      updatedAt: now,
    });
    for (const loser of candidates) {
      if (loser._id === survivor._id) {
        continue;
      }
      await ctx.db.patch(loser._id, {
        canonicalBuildSubmilestoneId: undefined,
        canonicalCompanionDisposition: "historical_duplicate",
        canonicalCompanionSupersededAt: now,
        canonicalCompanionSurvivorId: survivor._id,
        canonicalPlanningState: "superseded",
        currentRevision: loser.currentRevision + 1,
        historicalCanonicalBuildSubmilestoneId:
          report.buildSubmilestoneId ?? loser.canonicalBuildSubmilestoneId,
        updatedAt: now,
      });
    }
    await ctx.db.patch(report._id, {
      historyCountsJson,
      outcome: "repaired",
      survivorActionItemId: survivor._id,
      updatedAt: now,
    });
    await recordRepairAudit(ctx, authorization, report, {
      candidateActionItemIds: record.candidateActionItemIds,
      classification: record.classification,
      survivorActionItemId: survivor._id,
    });
    return { repaired: true };
  }
  if (record.classification === "incorrectly_superseded") {
    const candidateId = record.candidateActionItemIds[0];
    const item = candidateId ? await ctx.db.get(candidateId) : null;
    if (!item) {
      await markException(
        ctx,
        report,
        "missing_reactivation_candidate",
        historyCountsJson
      );
      throw new Error(
        `Companion reactivation candidate is unavailable for ${report.recordKey}.`
      );
    }
    const now = Date.now();
    await ctx.db.patch(item._id, {
      canonicalCompanionDisposition: "active",
      canonicalCompanionSupersededAt: undefined,
      canonicalCompanionSurvivorId: undefined,
      canonicalPlanningState: "active",
      currentRevision: item.currentRevision + 1,
      updatedAt: now,
    });
    await ctx.db.patch(report._id, {
      historyCountsJson,
      outcome: "repaired",
      survivorActionItemId: item._id,
      updatedAt: now,
    });
    await recordRepairAudit(ctx, authorization, report, {
      candidateActionItemIds: record.candidateActionItemIds,
      classification: record.classification,
      survivorActionItemId: item._id,
    });
    return { repaired: true };
  }
  const now = Date.now();
  const items: Doc<"buildActionItems">[] = [];
  for (const entry of history) {
    const item = await ctx.db.get(entry.actionItemId);
    if (!item) {
      continue;
    }
    if (
      item.buildId !== authorization.build._id ||
      item.organizationId !== authorization.organizationId ||
      item.brokerageId !== authorization.brokerage._id
    ) {
      await markException(
        ctx,
        report,
        "cross_scope_binding",
        historyCountsJson
      );
      throw new Error(
        `Companion ${item._id} is outside the authorized Build scope.`
      );
    }
    items.push(item);
  }
  const historical = record.classification === "historical";
  for (const item of items) {
    await ctx.db.patch(item._id, {
      canonicalCompanionDisposition: historical ? "historical" : "quarantined",
      canonicalCompanionSupersededAt: now,
      canonicalPlanningState: "superseded",
      currentRevision: item.currentRevision + 1,
      ...(historical
        ? {}
        : {
            canonicalBuildSubmilestoneId: undefined,
            historicalCanonicalBuildSubmilestoneId:
              item.canonicalBuildSubmilestoneId,
          }),
      updatedAt: now,
    });
  }
  await ctx.db.patch(report._id, {
    historyCountsJson,
    outcome: historical ? "historical" : "repaired",
    updatedAt: now,
  });
  if (record.candidateActionItemIds.length > 0) {
    await recordRepairAudit(ctx, authorization, report, {
      candidateActionItemIds: record.candidateActionItemIds,
      classification: record.classification,
    });
  }
  return {
    repaired: !historical && record.candidateActionItemIds.length > 0,
  };
}

async function buildPreview(
  ctx: CutoverContext,
  authorization: Awaited<ReturnType<typeof authorizeLegacyNoteOperator>>
) {
  const snapshot = await buildSnapshot(ctx, authorization);
  const counts = {
    crossScope: 0,
    duplicate: 0,
    healthy: 0,
    historical: 0,
    incorrectlySuperseded: 0,
    malformed: 0,
    missing: 0,
  };
  for (const record of snapshot.records) {
    if (record.classification === "cross_scope") {
      counts.crossScope += 1;
    } else if (record.classification === "incorrectly_superseded") {
      counts.incorrectlySuperseded += 1;
    } else {
      counts[record.classification] += 1;
    }
  }
  const dimensions = metricDimensions(snapshot.actionItems);
  const digest = await sha256Hex(
    JSON.stringify(
      snapshot.records.map((record) => ({
        recordKey: record.recordKey,
        snapshotHash: record.snapshotHash,
      }))
    )
  );
  return {
    activeSubmilestoneCount: snapshot.submilestones.filter(
      (submilestone) => submilestone.planningState !== "superseded"
    ).length,
    buildId: authorization.build._id,
    counts,
    generatedCompanionCount:
      dimensions.activeSubmilestoneCompanionCount +
      dimensions.historicalSubmilestoneCompanionCount,
    manualActionItemCount: dimensions.manualActionItemCount,
    planToken: `${PLAN_VERSION}:${digest}`,
    planVersion: PLAN_VERSION,
    records: snapshot.records,
    truncated: snapshot.truncated,
    warnings: snapshot.warnings,
  };
}

async function buildSnapshot(
  ctx: CutoverContext,
  authorization: Awaited<ReturnType<typeof authorizeLegacyNoteOperator>>
) {
  const [submilestones, actionItems] = await Promise.all([
    loadSubmilestones(ctx, authorization.build._id),
    loadActionItems(ctx, authorization.build._id),
  ]);
  const canonicalIds = new Set(
    submilestones.items.map((item) => String(item._id))
  );
  const records: SnapshotRecord[] = [];
  const claimed = new Set<string>();
  for (const submilestone of submilestones.items) {
    const candidates = await ctx.db
      .query("buildActionItems")
      .withIndex("by_canonicalBuildSubmilestoneId_and_systemMode", (query) =>
        query
          .eq("canonicalBuildSubmilestoneId", submilestone._id)
          .eq("systemMode", "generated_milestone_submilestone")
      )
      .take(MAX_CANDIDATES + 1);
    for (const candidate of candidates) {
      claimed.add(String(candidate._id));
    }
    records.push(
      await snapshotCanonicalRecord(
        ctx,
        authorization,
        submilestone,
        candidates
      )
    );
  }
  for (const item of actionItems.items) {
    if (item.systemMode !== "generated_milestone_submilestone") {
      continue;
    }
    if (claimed.has(String(item._id))) {
      continue;
    }
    const classification: Classification = item.canonicalBuildSubmilestoneId
      ? canonicalIds.has(String(item.canonicalBuildSubmilestoneId))
        ? "malformed"
        : "cross_scope"
      : "malformed";
    records.push(
      await finishSnapshotRecord({
        buildSubmilestoneId: undefined,
        candidateActionItemIds: [item._id],
        classification,
        recordKey: `orphan:${item._id}`,
        snapshot: itemBindingSnapshot(item),
      })
    );
  }
  records.sort((left, right) => left.recordKey.localeCompare(right.recordKey));
  return {
    actionItems: actionItems.items,
    records,
    submilestones: submilestones.items,
    truncated:
      submilestones.truncated ||
      actionItems.truncated ||
      records.some(
        (record) => record.candidateActionItemIds.length > MAX_CANDIDATES
      ),
    warnings: [
      ...(submilestones.truncated
        ? ["Sub-milestone source exceeded the bounded safety limit."]
        : []),
      ...(actionItems.truncated
        ? ["Action Item source exceeded the bounded safety limit."]
        : []),
    ],
  };
}

async function snapshotCanonicalRecord(
  ctx: CutoverContext,
  authorization: Awaited<ReturnType<typeof authorizeLegacyNoteOperator>>,
  submilestone: Doc<"buildSubmilestones">,
  candidates: Doc<"buildActionItems">[]
) {
  let classification: Classification;
  const scopeStates = await Promise.all(
    candidates.map(async (candidate) =>
      validateCandidateScope(ctx, authorization, submilestone, candidate)
    )
  );
  if (submilestone.planningState === "superseded") {
    classification = "historical";
  } else if (candidates.length === 0) {
    classification = "missing";
  } else if (scopeStates.some((state) => state === "cross_scope")) {
    classification = "cross_scope";
  } else if (scopeStates.some((state) => state === "malformed")) {
    classification = "malformed";
  } else if (candidates.length > 1) {
    classification = "duplicate";
  } else if (isInactiveCompanion(candidates[0])) {
    classification = "incorrectly_superseded";
  } else {
    classification = "healthy";
  }
  return await finishSnapshotRecord({
    buildSubmilestoneId: submilestone._id,
    candidateActionItemIds: candidates.map((candidate) => candidate._id),
    classification,
    recordKey: `submilestone:${submilestone._id}`,
    snapshot: {
      candidates: candidates.map(itemBindingSnapshot),
      submilestone: {
        buildId: submilestone.buildId,
        buildMilestoneId: submilestone.buildMilestoneId,
        id: submilestone._id,
        organizationId: submilestone.organizationId,
        planningState: submilestone.planningState ?? "active",
      },
    },
  });
}

async function finishSnapshotRecord(input: {
  buildSubmilestoneId?: Id<"buildSubmilestones">;
  candidateActionItemIds: Id<"buildActionItems">[];
  classification: Classification;
  recordKey: string;
  snapshot: unknown;
}) {
  const snapshotHash = await sha256Hex(
    JSON.stringify({
      classification: input.classification,
      snapshot: input.snapshot,
    })
  );
  const reportId = await sha256Hex(
    `${PLAN_VERSION}:${input.recordKey}:${snapshotHash}`
  );
  return {
    buildSubmilestoneId: input.buildSubmilestoneId,
    candidateActionItemIds: input.candidateActionItemIds,
    classification: input.classification,
    recordKey: input.recordKey,
    reportId,
    snapshotHash,
  } satisfies SnapshotRecord;
}

async function rebuildRecord(
  ctx: MutationCtx,
  authorization: Awaited<ReturnType<typeof authorizeLegacyNoteOperator>>,
  report: CutoverReport
) {
  if (report.buildSubmilestoneId) {
    const submilestone = await ctx.db.get(report.buildSubmilestoneId);
    if (!submilestone) {
      return null;
    }
    const candidates = await ctx.db
      .query("buildActionItems")
      .withIndex("by_canonicalBuildSubmilestoneId_and_systemMode", (query) =>
        query
          .eq("canonicalBuildSubmilestoneId", submilestone._id)
          .eq("systemMode", "generated_milestone_submilestone")
      )
      .take(MAX_CANDIDATES + 1);
    return await snapshotCanonicalRecord(
      ctx,
      authorization,
      submilestone,
      candidates
    );
  }
  if (report.candidateActionItemIds.length !== 1) {
    return null;
  }
  const candidateId = report.candidateActionItemIds[0];
  const item = candidateId ? await ctx.db.get(candidateId) : null;
  if (!item) {
    return null;
  }
  const canonicalSubmilestone = item.canonicalBuildSubmilestoneId
    ? await ctx.db.get(item.canonicalBuildSubmilestoneId)
    : null;
  const classification: Classification = item.canonicalBuildSubmilestoneId
    ? canonicalSubmilestone?.buildId === authorization.build._id
      ? "malformed"
      : "cross_scope"
    : "malformed";
  return await finishSnapshotRecord({
    buildSubmilestoneId: undefined,
    candidateActionItemIds: [item._id],
    classification,
    recordKey: report.recordKey,
    snapshot: itemBindingSnapshot(item),
  });
}

async function validateCandidateScope(
  ctx: CutoverContext,
  authorization: Awaited<ReturnType<typeof authorizeLegacyNoteOperator>>,
  submilestone: Doc<"buildSubmilestones">,
  item: Doc<"buildActionItems">
) {
  if (
    item.buildId !== authorization.build._id ||
    item.organizationId !== authorization.organizationId ||
    item.brokerageId !== authorization.brokerage._id
  ) {
    return "cross_scope" as const;
  }
  const post = await ctx.db.get(item.originatingPostId);
  if (
    !post ||
    post.buildId !== authorization.build._id ||
    post.organizationId !== authorization.organizationId ||
    post.brokerageId !== authorization.brokerage._id
  ) {
    return "cross_scope" as const;
  }
  if (
    post.systemPostKind !== "milestone" ||
    post.canonicalBuildMilestoneId !== submilestone.buildMilestoneId ||
    item.canonicalBuildMilestoneId !== submilestone.buildMilestoneId
  ) {
    return "malformed" as const;
  }
  return "valid" as const;
}

function itemBindingSnapshot(item: Doc<"buildActionItems">) {
  return {
    brokerageId: item.brokerageId,
    buildId: item.buildId,
    canonicalBuildMilestoneId: item.canonicalBuildMilestoneId,
    canonicalBuildSubmilestoneId: item.canonicalBuildSubmilestoneId,
    canonicalCompanionDisposition:
      item.canonicalCompanionDisposition ?? "active",
    canonicalPlanningState: item.canonicalPlanningState ?? "active",
    id: item._id,
    organizationId: item.organizationId,
    originatingPostId: item.originatingPostId,
    systemMode: item.systemMode,
  };
}

async function ownedHistoryCounts(
  ctx: MutationCtx,
  buildId: Id<"activeBuilds">,
  actionItemId: Id<"buildActionItems">
) {
  const id = String(actionItemId);
  const [
    comments,
    checklist,
    children,
    sourceRelations,
    targetRelations,
    attachments,
    labels,
    revisions,
    activity,
    recipientDeliveries,
    externalDeliveries,
  ] = await Promise.all([
    ctx.db
      .query("buildActionItemComments")
      .withIndex("by_actionItemId_and_createdAt", (query) =>
        query.eq("actionItemId", actionItemId)
      )
      .take(MAX_SOURCE_ROWS + 1),
    ctx.db
      .query("buildActionItemChecklistItems")
      .withIndex("by_actionItemId_and_order", (query) =>
        query.eq("actionItemId", actionItemId)
      )
      .take(MAX_SOURCE_ROWS + 1),
    ctx.db
      .query("buildActionItems")
      .withIndex("by_parentActionItemId_and_status", (query) =>
        query.eq("parentActionItemId", actionItemId)
      )
      .take(MAX_SOURCE_ROWS + 1),
    ctx.db
      .query("buildActionItemRelations")
      .withIndex("by_sourceActionItemId_and_status", (query) =>
        query.eq("sourceActionItemId", actionItemId)
      )
      .take(MAX_SOURCE_ROWS + 1),
    ctx.db
      .query("buildActionItemRelations")
      .withIndex("by_targetActionItemId_and_status", (query) =>
        query.eq("targetActionItemId", actionItemId)
      )
      .take(MAX_SOURCE_ROWS + 1),
    ctx.db
      .query("buildCollaborationAttachments")
      .withIndex("by_ownerKind_and_ownerRecordId", (query) =>
        query.eq("ownerKind", "actionItem").eq("ownerRecordId", id)
      )
      .take(MAX_SOURCE_ROWS + 1),
    ctx.db
      .query("buildActionItemLabels")
      .withIndex("by_actionItemId_and_normalizedLabel", (query) =>
        query.eq("actionItemId", actionItemId)
      )
      .take(MAX_SOURCE_ROWS + 1),
    ctx.db
      .query("buildActionItemRevisions")
      .withIndex("by_actionItemId_and_revision", (query) =>
        query.eq("actionItemId", actionItemId)
      )
      .take(MAX_SOURCE_ROWS + 1),
    ctx.db
      .query("buildCollaborationActivityProjections")
      .withIndex("by_buildId_and_actionItemId", (query) =>
        query.eq("buildId", buildId).eq("actionItemId", actionItemId)
      )
      .take(MAX_SOURCE_ROWS + 1),
    ctx.db
      .query("recipientDeliveries")
      .withIndex(
        "by_collaborationBuildId_and_collaborationActionItemId",
        (query) =>
          query
            .eq("collaborationBuildId", buildId)
            .eq("collaborationActionItemId", actionItemId)
      )
      .take(MAX_SOURCE_ROWS + 1),
    ctx.db
      .query("buildCollaborationExternalDeliveries")
      .withIndex("by_buildId_and_collaborationActionItemId", (query) =>
        query
          .eq("buildId", buildId)
          .eq("collaborationActionItemId", actionItemId)
      )
      .take(MAX_SOURCE_ROWS + 1),
  ]);
  const counts = {
    activity: activity.filter((entry) => entry.actorWorkosUserId !== "system")
      .length,
    attachments: attachments.length,
    checklist: checklist.length,
    children: children.length,
    comments: comments.length,
    externalDeliveries: externalDeliveries.length,
    labels: labels.length,
    recipientDeliveries: recipientDeliveries.length,
    relations: new Set(
      [...sourceRelations, ...targetRelations].map((relation) => relation._id)
    ).size,
    revisions: revisions.filter(
      (revision) => revision.actorWorkosUserId !== "system"
    ).length,
  };
  return {
    ...counts,
    humanOwned: Object.values(counts).reduce((sum, value) => sum + value, 0),
  };
}

function deterministicSurvivor(items: Doc<"buildActionItems">[]) {
  return [...items].sort((left, right) => {
    const revisionDelta =
      (right.canonicalBindingRevision ?? 0) -
      (left.canonicalBindingRevision ?? 0);
    if (revisionDelta !== 0) {
      return revisionDelta;
    }
    if (left._creationTime !== right._creationTime) {
      return left._creationTime - right._creationTime;
    }
    return String(left._id).localeCompare(String(right._id));
  })[0];
}

function isActiveCompanion(item: Doc<"buildActionItems"> | undefined) {
  return Boolean(
    item &&
      item.canonicalPlanningState !== "superseded" &&
      (item.canonicalCompanionDisposition === undefined ||
        item.canonicalCompanionDisposition === "active")
  );
}

function isInactiveCompanion(item: Doc<"buildActionItems"> | undefined) {
  return Boolean(item) && !isActiveCompanion(item);
}

async function markException(
  ctx: MutationCtx,
  report: CutoverReport,
  reason: string,
  historyCountsJson?: string
) {
  await ctx.db.patch(report._id, {
    exceptionReason: reason,
    historyCountsJson,
    outcome: "exception",
    updatedAt: Date.now(),
  });
}

async function recordRepairAudit(
  ctx: MutationCtx,
  authorization: Awaited<ReturnType<typeof authorizeLegacyNoteOperator>>,
  report: CutoverReport,
  newState: {
    candidateActionItemIds: Id<"buildActionItems">[];
    classification: Classification;
    survivorActionItemId?: Id<"buildActionItems">;
  }
) {
  await ctx.db.insert("auditEvents", {
    actorRoles: authorization.roles,
    actorWorkosUserId: authorization.viewer.subject,
    brokerageId: authorization.brokerage._id,
    command: "repairBuildSubmilestoneCompanionCutoverRecord",
    createdAt: Date.now(),
    entityId: String(report._id),
    entityType: "buildSubmilestoneCompanionCutoverReport",
    eventType: "build.submilestone.companion_cutover.repaired",
    newState: JSON.stringify(newState),
    organizationId: authorization.organizationId,
    priorState: JSON.stringify({
      candidateActionItemIds: report.candidateActionItemIds,
      classification: report.classification,
      outcome: report.outcome,
    }),
    warnings: ["canonical_submilestone_state_remains_authoritative"],
  });
}

async function activeCompanionCountForMilestone(
  ctx: MutationCtx,
  milestoneId: Id<"buildMilestones">
) {
  const submilestones = await ctx.db
    .query("buildSubmilestones")
    .withIndex("by_milestone", (query) =>
      query.eq("buildMilestoneId", milestoneId)
    )
    .take(MAX_SOURCE_ROWS + 1);
  let count = 0;
  for (const submilestone of submilestones) {
    if (submilestone.planningState === "superseded") {
      continue;
    }
    const companions = await ctx.db
      .query("buildActionItems")
      .withIndex("by_canonicalBuildSubmilestoneId_and_systemMode", (query) =>
        query
          .eq("canonicalBuildSubmilestoneId", submilestone._id)
          .eq("systemMode", "generated_milestone_submilestone")
      )
      .take(MAX_CANDIDATES + 1);
    count += companions.filter(isActiveCompanion).length;
  }
  return count;
}

async function assertMilestoneMaterializationSafe(
  ctx: MutationCtx,
  authorization: Awaited<ReturnType<typeof authorizeLegacyNoteOperator>>,
  milestones: Doc<"buildMilestones">[]
) {
  const activeCounts = new Map<string, number>();
  for (const milestone of milestones) {
    let activeCount = 0;
    const posts = await ctx.db
      .query("buildCollaborationPosts")
      .withIndex(
        "by_buildId_and_systemPostKind_and_canonicalBuildMilestoneId",
        (query) =>
          query
            .eq("buildId", authorization.build._id)
            .eq("systemPostKind", "milestone")
            .eq("canonicalBuildMilestoneId", milestone._id)
      )
      .take(2);
    if (posts.length > 1) {
      throw new Error(
        `Captured cutover Milestone ${milestone._id} has duplicate System Posts.`
      );
    }
    const submilestones = await ctx.db
      .query("buildSubmilestones")
      .withIndex("by_milestone", (query) =>
        query.eq("buildMilestoneId", milestone._id)
      )
      .take(MAX_SOURCE_ROWS + 1);
    if (submilestones.length > MAX_SOURCE_ROWS) {
      throw new Error(
        `Captured cutover Milestone ${milestone._id} exceeds the Sub-milestone safety limit.`
      );
    }
    for (const submilestone of submilestones) {
      if (submilestone.planningState === "superseded") {
        continue;
      }
      const candidates = await ctx.db
        .query("buildActionItems")
        .withIndex("by_canonicalBuildSubmilestoneId_and_systemMode", (query) =>
          query
            .eq("canonicalBuildSubmilestoneId", submilestone._id)
            .eq("systemMode", "generated_milestone_submilestone")
        )
        .take(MAX_CANDIDATES + 1);
      const record = await snapshotCanonicalRecord(
        ctx,
        authorization,
        submilestone,
        candidates
      );
      if (
        record.classification === "duplicate" ||
        record.classification === "malformed" ||
        record.classification === "cross_scope"
      ) {
        throw new Error(
          `Captured cutover Sub-milestone ${submilestone._id} is not safe to materialize: ${record.classification}.`
        );
      }
      activeCount += candidates.filter(isActiveCompanion).length;
    }
    activeCounts.set(String(milestone._id), activeCount);
  }
  return activeCounts;
}

function metricDimensions(items: Doc<"buildActionItems">[]) {
  let activeSubmilestoneCompanionCount = 0;
  let historicalSubmilestoneCompanionCount = 0;
  let manualActionItemCount = 0;
  for (const item of items) {
    if (item.systemMode !== "generated_milestone_submilestone") {
      manualActionItemCount += 1;
    } else if (isActiveCompanion(item)) {
      activeSubmilestoneCompanionCount += 1;
    } else {
      historicalSubmilestoneCompanionCount += 1;
    }
  }
  return {
    activeSubmilestoneCompanionCount,
    historicalSubmilestoneCompanionCount,
    manualActionItemCount,
  };
}

async function loadSubmilestones(
  ctx: CutoverContext,
  buildId: Id<"activeBuilds">
) {
  const rows = await ctx.db
    .query("buildSubmilestones")
    .withIndex("by_build", (query) => query.eq("buildId", buildId))
    .take(MAX_SOURCE_ROWS + 1);
  return {
    items: rows.slice(0, MAX_SOURCE_ROWS),
    truncated: rows.length > MAX_SOURCE_ROWS,
  };
}

async function loadMilestones(
  ctx: CutoverContext,
  buildId: Id<"activeBuilds">
) {
  const rows = await ctx.db
    .query("buildMilestones")
    .withIndex("by_build", (query) => query.eq("buildId", buildId))
    .take(MAX_SOURCE_ROWS + 1);
  return {
    items: rows.slice(0, MAX_SOURCE_ROWS),
    truncated: rows.length > MAX_SOURCE_ROWS,
  };
}

async function loadActionItems(
  ctx: CutoverContext,
  buildId: Id<"activeBuilds">
) {
  const rows = await ctx.db
    .query("buildActionItems")
    .withIndex("by_buildId_and_queueSortAt", (query) =>
      query.eq("buildId", buildId)
    )
    .take(MAX_CANDIDATES + 1);
  return {
    items: rows.slice(0, MAX_CANDIDATES),
    truncated: rows.length > MAX_CANDIDATES,
  };
}

async function requireRun(
  ctx: CutoverContext,
  runId: Id<"buildSubmilestoneCompanionCutoverRuns">,
  authorization: Awaited<ReturnType<typeof authorizeLegacyNoteOperator>>
) {
  const run = await ctx.db.get(runId);
  if (!run) {
    throw new Error("Companion cutover run is unavailable.");
  }
  requireRunScope(run, authorization);
  return run;
}

async function getUpdatedRun(
  ctx: MutationCtx,
  runId: Id<"buildSubmilestoneCompanionCutoverRuns">
) {
  const run = await ctx.db.get(runId);
  if (!run) {
    throw new Error("Companion cutover run became unavailable.");
  }
  return run;
}

function requireRunScope(
  run: CutoverRun,
  authorization: Awaited<ReturnType<typeof authorizeLegacyNoteOperator>>
) {
  if (
    run.buildId !== authorization.build._id ||
    run.organizationId !== authorization.organizationId ||
    run.brokerageId !== authorization.brokerage._id
  ) {
    throw new Error(
      "Companion cutover run is outside the authorized Build scope."
    );
  }
}

function presentRun(run: CutoverRun) {
  return {
    activeSubmilestoneCount: run.activeSubmilestoneCount,
    buildId: run.buildId,
    completedAt: run.completedAt,
    exceptionCount: run.exceptionCount,
    generatedCompanionCount: run.generatedCompanionCount,
    lastError: run.lastError,
    manualActionItemCount: run.manualActionItemCount,
    materializedCount: run.materializedCount,
    lastParityRecordKey: run.lastParityRecordKey,
    nextMilestoneOrdinal: run.nextMilestoneOrdinal,
    nextReportOrdinal: run.nextReportOrdinal,
    nextSeedOrdinal: run.nextSeedOrdinal,
    parityCheckedCount: run.parityCheckedCount,
    parityMismatchCount: run.parityMismatchCount,
    planToken: run.planToken,
    planVersion: run.planVersion,
    repairedCount: run.repairedCount,
    reportCount: run.reportCount,
    reportHash: run.reportHash,
    runId: run._id,
    startedByWorkosUserId: run.startedByWorkosUserId,
    status: run.status,
  };
}

function presentReport(report: CutoverReport) {
  return {
    buildSubmilestoneId: report.buildSubmilestoneId,
    candidateActionItemIds: report.candidateActionItemIds,
    classification: report.classification,
    exceptionReason: report.exceptionReason,
    historyCountsJson: report.historyCountsJson,
    ordinal: report.ordinal,
    outcome: report.outcome,
    recordKey: report.recordKey,
    reportId: report.reportId,
    survivorActionItemId: report.survivorActionItemId,
  };
}
