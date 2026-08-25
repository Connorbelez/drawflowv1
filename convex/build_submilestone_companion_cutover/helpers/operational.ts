import { authorizeLegacyNoteOperator, sha256Hex } from "../../build_collaboration_legacy_note_shared";
import { synchronizeMilestoneSystemPostPlanning } from "../../build_collaboration_system_posts";
import type { Doc, Id, MutationCtx } from "../../types";
import {
  activeCompanionCountForMilestone,
  assertMilestoneMaterializationSafe,
  buildPreview,
  buildSnapshot,
  deterministicSurvivor,
  getUpdatedRun,
  markException,
  metricDimensions,
  ownedHistoryCounts,
  recordRepairAudit,
  rebuildRecord,
  type CutoverReport,
  type CutoverRun,
  type SnapshotRecord,
} from "./projection";

export async function advanceReportSeeding(
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

export async function advanceRepair(
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

export async function advanceMaterialization(
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

export async function advanceParity(
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
export async function repairRecord(
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
