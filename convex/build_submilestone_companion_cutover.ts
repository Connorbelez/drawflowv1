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

import {
  activeCompanionCountForMilestone,
  advanceMaterialization,
  advanceParity,
  advanceRepair,
  advanceReportSeeding,
  assertMilestoneMaterializationSafe,
  buildPreview,
  buildSnapshot,
  deterministicSurvivor,
  finishSnapshotRecord,
  getUpdatedRun,
  isActiveCompanion,
  isInactiveCompanion,
  itemBindingSnapshot,
  loadActionItems,
  loadMilestones,
  loadSubmilestones,
  markException,
  metricDimensions,
  ownedHistoryCounts,
  presentReport,
  presentRun,
  rebuildRecord,
  recordRepairAudit,
  repairRecord,
  requireRun,
  requireRunScope,
  snapshotCanonicalRecord,
  validateCandidateScope,
} from "./build_submilestone_companion_cutover/helpers";
