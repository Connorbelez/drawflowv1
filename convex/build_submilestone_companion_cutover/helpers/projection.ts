import { v } from "convex/values";

import { authenticatedMutation, authenticatedQuery } from "../../authz";
import {
  authorizeLegacyNoteOperator,
  normalizePageSize,
  sha256Hex,
} from "../../build_collaboration_legacy_note_shared";
import { synchronizeMilestoneSystemPostPlanning } from "../../build_collaboration_system_posts";
import type { Doc, Id, MutationCtx, QueryCtx } from "../../types";



const PLAN_VERSION = "build-submilestone-companion-cutover/v1";
const MAX_SOURCE_ROWS = 500;
const MAX_CANDIDATES = 1000;

export type Classification =
  | "healthy"
  | "missing"
  | "duplicate"
  | "malformed"
  | "cross_scope"
  | "incorrectly_superseded"
  | "historical";
export interface SnapshotRecord {
  buildSubmilestoneId?: Id<"buildSubmilestones">;
  candidateActionItemIds: Id<"buildActionItems">[];
  classification: Classification;
  recordKey: string;
  reportId: string;
  snapshotHash: string;
}
export type CutoverRun = Doc<"buildSubmilestoneCompanionCutoverRuns">;
export type CutoverReport = Doc<"buildSubmilestoneCompanionCutoverReports">;
export type CutoverContext = QueryCtx | MutationCtx;

export async function buildPreview(
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

export async function buildSnapshot(
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

export async function snapshotCanonicalRecord(
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

export async function finishSnapshotRecord(input: {
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

export async function rebuildRecord(
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

export async function validateCandidateScope(
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

export function itemBindingSnapshot(item: Doc<"buildActionItems">) {
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

export async function ownedHistoryCounts(
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

export function deterministicSurvivor(items: Doc<"buildActionItems">[]) {
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

export function isActiveCompanion(item: Doc<"buildActionItems"> | undefined) {
  return Boolean(
    item &&
      item.canonicalPlanningState !== "superseded" &&
      (item.canonicalCompanionDisposition === undefined ||
        item.canonicalCompanionDisposition === "active")
  );
}

export function isInactiveCompanion(item: Doc<"buildActionItems"> | undefined) {
  return Boolean(item) && !isActiveCompanion(item);
}

export async function markException(
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

export async function recordRepairAudit(
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

export async function activeCompanionCountForMilestone(
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

export async function assertMilestoneMaterializationSafe(
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

export function metricDimensions(items: Doc<"buildActionItems">[]) {
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

export async function loadSubmilestones(
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

export async function loadMilestones(
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

export async function loadActionItems(
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

export async function requireRun(
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

export async function getUpdatedRun(
  ctx: MutationCtx,
  runId: Id<"buildSubmilestoneCompanionCutoverRuns">
) {
  const run = await ctx.db.get(runId);
  if (!run) {
    throw new Error("Companion cutover run became unavailable.");
  }
  return run;
}

export function requireRunScope(
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

export function presentRun(run: CutoverRun) {
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

export function presentReport(report: CutoverReport) {
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
