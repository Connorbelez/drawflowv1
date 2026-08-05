import { v } from "convex/values";

import { authenticatedMutation, authenticatedQuery } from "./authz";
import { authorizeLegacyNoteOperator, normalizePageSize, sha256Hex } from "./build_collaboration_legacy_note_shared";
import { resolveEffectiveCollaborationRole } from "./build_collaboration_model";
import {
  ensureDrawSystemPost,
  ensureMilestoneSystemPost,
  projectHistoricalSystemPostLifecycle,
  drawSystemOccurrenceKey,
} from "./build_collaboration_system_posts";
import type { SystemPostHistoricalBackfill } from "./build_collaboration_system_events";
import type { Doc, Id, MutationCtx, QueryCtx } from "./types";

const SYSTEM_POST_BACKFILL_VERSION = "build-collaboration-system-posts/v1";
const MAX_SOURCE_ROWS = 5000;
const MAX_BATCH_SIZE = 25;
const DEFAULT_BATCH_SIZE = 10;

const backfillModeValidator = v.union(
  v.literal("validate"),
  v.literal("materialize"),
);
const backfillPhaseValidator = v.union(
  v.literal("milestones"),
  v.literal("planned_draws"),
  v.literal("draw_requests"),
  v.literal("complete"),
);
const backfillStatusValidator = v.union(
  v.literal("validating"),
  v.literal("running"),
  v.literal("complete"),
  v.literal("blocked"),
);

const backfillRunValidator = v.object({
  buildId: v.id("activeBuilds"),
  completedAt: v.optional(v.number()),
  lastError: v.optional(v.string()),
  materializedActionItemCount: v.number(),
  materializedPostCount: v.number(),
  mode: backfillModeValidator,
  phase: backfillPhaseValidator,
  planToken: v.string(),
  planVersion: v.string(),
  processedDrawRequestCount: v.number(),
  processedMilestoneCount: v.number(),
  processedPlannedDrawCount: v.number(),
  runId: v.id("buildCollaborationSystemPostBackfillRuns"),
  skippedCount: v.number(),
  startedByWorkosUserId: v.string(),
  status: backfillStatusValidator,
  warningCount: v.number(),
});

const previewValidator = v.object({
  buildId: v.id("activeBuilds"),
  milestoneCount: v.number(),
  plannedDrawCount: v.number(),
  drawRequestCount: v.number(),
  planToken: v.string(),
  planVersion: v.string(),
  truncated: v.boolean(),
  warnings: v.array(v.string()),
});

type BackfillRun = Doc<"buildCollaborationSystemPostBackfillRuns">;

export const previewBuildCollaborationSystemPostBackfill = authenticatedQuery
  .input({
    buildId: v.id("activeBuilds"),
    organizationId: v.string(),
  })
  .returns(previewValidator)
  .handler(async (ctx, args) => {
    const authorization = await authorizeLegacyNoteOperator(ctx, args);
    const sources = await loadSourceSnapshot(ctx, authorization.build._id);
    const planToken = await planTokenForSources(
      authorization.build._id,
      sources,
    );
    return {
      buildId: authorization.build._id,
      drawRequestCount: sources.drawRequests.length,
      milestoneCount: sources.milestones.length,
      planToken,
      planVersion: SYSTEM_POST_BACKFILL_VERSION,
      plannedDrawCount: sources.plannedDraws.length,
      truncated: sources.truncated,
      warnings: sources.warnings,
    };
  })
  .public();

export const startBuildCollaborationSystemPostBackfill = authenticatedMutation
  .input({
    batchSize: v.optional(v.number()),
    buildId: v.id("activeBuilds"),
    dryRun: v.optional(v.boolean()),
    mode: v.optional(backfillModeValidator),
    organizationId: v.string(),
    planToken: v.string(),
  })
  .returns(backfillRunValidator)
  .handler(async (ctx, args) => {
    const authorization = await authorizeLegacyNoteOperator(ctx, args, true);
    const mode = args.dryRun ? "validate" : (args.mode ?? "materialize");
    const batchSize = normalizePageSize(
      args.batchSize ?? DEFAULT_BATCH_SIZE,
      MAX_BATCH_SIZE,
    );
    if (!args.planToken.startsWith(`${SYSTEM_POST_BACKFILL_VERSION}:`)) {
      throw new Error("A valid System Post backfill preview plan token is required.");
    }
    const currentSources = await loadSourceSnapshot(ctx, authorization.build._id);
    const currentPlanToken = await planTokenForSources(
      authorization.build._id,
      currentSources,
    );
    if (currentPlanToken !== args.planToken) {
      throw new Error(
        "System Post backfill source records changed after preview; generate a new validation plan.",
      );
    }
    const existingRuns = await ctx.db
      .query("buildCollaborationSystemPostBackfillRuns")
      .withIndex("by_buildId_and_planToken", (query) =>
        query.eq("buildId", authorization.build._id).eq("planToken", args.planToken),
      )
      .collect();
    const existing = existingRuns.find((candidate) => candidate.mode === mode);
    if (existing) {
      requireRunOwnership(existing, authorization);
      if (existing.status !== "blocked") {
        return presentRun(existing);
      }
      const resumed = await ctx.db.get(existing._id);
      if (!resumed) throw new Error("System Post backfill run became unavailable.");
      await ctx.db.patch(existing._id, {
        batchSize,
        lastError: undefined,
        status: mode === "validate" ? "validating" : "running",
        updatedAt: Date.now(),
      });
      const resumedRun = await ctx.db.get(existing._id);
      if (!resumedRun) throw new Error("System Post backfill run became unavailable.");
      return presentRun(resumedRun);
    }
    const now = Date.now();
    const runId = await ctx.db.insert("buildCollaborationSystemPostBackfillRuns", {
      batchSize,
      brokerageId: authorization.brokerage._id,
      buildId: authorization.build._id,
      createdAt: now,
      drawRequestCursor: undefined,
      materializedActionItemCount: 0,
      materializedPostCount: 0,
      milestoneCursor: undefined,
      mode,
      organizationId: authorization.organizationId,
      phase: "milestones",
      planToken: args.planToken,
      planVersion: SYSTEM_POST_BACKFILL_VERSION,
      plannedDrawCursor: undefined,
      processedDrawRequestCount: 0,
      processedMilestoneCount: 0,
      processedPlannedDrawCount: 0,
      skippedCount: 0,
      startedByWorkosUserId: authorization.viewer.subject,
      status: mode === "validate" ? "validating" : "running",
      updatedAt: now,
      warningCount: 0,
    });
    const run = await ctx.db.get(runId);
    if (!run) throw new Error("System Post backfill run could not be created.");
    return presentRun(run);
  })
  .public();

export const advanceBuildCollaborationSystemPostBackfill = authenticatedMutation
  .input({
    buildId: v.id("activeBuilds"),
    maxItems: v.optional(v.number()),
    organizationId: v.string(),
    runId: v.id("buildCollaborationSystemPostBackfillRuns"),
  })
  .returns(backfillRunValidator)
  .handler(async (ctx, args) => {
    const authorization = await authorizeLegacyNoteOperator(ctx, args, true);
    let run = await requireRun(ctx, args.runId, authorization);
    if (run.status === "complete" || run.status === "blocked") {
      return presentRun(run);
    }
    const limit = normalizePageSize(
      args.maxItems ?? run.batchSize,
      MAX_BATCH_SIZE,
    );
    try {
      await assertBackfillPlanCurrent(ctx, run);
      if (run.phase === "milestones") {
        run = await advanceMilestones(ctx, authorization, run, limit);
      } else if (run.phase === "planned_draws") {
        run = await advancePlannedDraws(ctx, authorization, run, limit);
      } else if (run.phase === "draw_requests") {
        run = await advanceDrawRequests(ctx, authorization, run, limit);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await ctx.db.patch(run._id, {
        lastError: message.slice(0, 500),
        status: "blocked",
        updatedAt: Date.now(),
        warningCount: run.warningCount + 1,
      });
      const blocked = await ctx.db.get(run._id);
      if (!blocked) throw error;
      run = blocked;
    }
    return presentRun(run);
  })
  .public();

async function assertBackfillPlanCurrent(
  ctx: MutationCtx,
  run: BackfillRun,
) {
  const sources = await loadSourceSnapshot(ctx, run.buildId);
  const currentPlanToken = await planTokenForSources(run.buildId, sources);
  if (currentPlanToken !== run.planToken) {
    throw new Error(
      "System Post backfill source records changed after preview; generate a new validation plan.",
    );
  }
}

async function advanceMilestones(
  ctx: MutationCtx,
  authorization: Awaited<ReturnType<typeof authorizeLegacyNoteOperator>>,
  run: BackfillRun,
  limit: number,
) {
  const page = await ctx.db
    .query("buildMilestones")
    .withIndex("by_build_order", (query) => query.eq("buildId", authorization.build._id))
    .paginate({ cursor: run.milestoneCursor ?? null, numItems: limit });
  let processed = run.processedMilestoneCount;
  let posts = run.materializedPostCount;
  let actionItems = run.materializedActionItemCount;
  for (const milestone of page.page) {
    assertSourceOwnership(milestone, authorization);
    if (run.mode === "materialize") {
      const result = await materializeMilestone(ctx, authorization, milestone);
      posts += result.post ? 1 : 0;
      actionItems += result.actionItemCount;
    }
    processed += 1;
  }
  const now = Date.now();
  const nextPhase = page.isDone ? "planned_draws" : "milestones";
  const updated = await patchRun(ctx, run, {
    materializedActionItemCount: actionItems,
    materializedPostCount: posts,
    milestoneCursor: page.isDone ? undefined : page.continueCursor,
    phase: nextPhase,
    processedMilestoneCount: processed,
    status: run.mode === "validate" ? "validating" : "running",
    updatedAt: now,
  });
  return updated;
}

async function advancePlannedDraws(
  ctx: MutationCtx,
  authorization: Awaited<ReturnType<typeof authorizeLegacyNoteOperator>>,
  run: BackfillRun,
  limit: number,
) {
  const page = await ctx.db
    .query("plannedDrawScheduleRows")
    .withIndex("by_build_order", (query) => query.eq("buildId", authorization.build._id))
    .paginate({ cursor: run.plannedDrawCursor ?? null, numItems: limit });
  let processed = run.processedPlannedDrawCount;
  let posts = run.materializedPostCount;
  const requests =
    run.mode === "materialize"
      ? await ctx.db
          .query("activeBuildDrawRequests")
          .withIndex("by_build", (query) => query.eq("buildId", authorization.build._id))
          .take(MAX_SOURCE_ROWS)
      : [];
  const requestByDrawKey = new Map(
    requests
      .filter((request) => request.plannedDrawKey)
      .map((request) => [request.plannedDrawKey as string, request]),
  );
  for (const plannedDraw of page.page) {
    assertSourceOwnership(plannedDraw, authorization);
    if (run.mode === "materialize") {
      const request = requestByDrawKey.get(plannedDraw.drawKey);
      const result = await materializeDraw(ctx, authorization, plannedDraw, request);
      posts += result.post ? 1 : 0;
    }
    processed += 1;
  }
  const updated = await patchRun(ctx, run, {
    materializedPostCount: posts,
    phase: page.isDone ? "draw_requests" : "planned_draws",
    plannedDrawCursor: page.isDone ? undefined : page.continueCursor,
    processedPlannedDrawCount: processed,
    status: run.mode === "validate" ? "validating" : "running",
    updatedAt: Date.now(),
  });
  return updated;
}

async function advanceDrawRequests(
  ctx: MutationCtx,
  authorization: Awaited<ReturnType<typeof authorizeLegacyNoteOperator>>,
  run: BackfillRun,
  limit: number,
) {
  const page = await ctx.db
    .query("activeBuildDrawRequests")
    .withIndex("by_build", (query) => query.eq("buildId", authorization.build._id))
    .paginate({ cursor: run.drawRequestCursor ?? null, numItems: limit });
  let processed = run.processedDrawRequestCount;
  let posts = run.materializedPostCount;
  const plannedDraws =
    run.mode === "materialize"
      ? await ctx.db
          .query("plannedDrawScheduleRows")
          .withIndex("by_build_order", (query) => query.eq("buildId", authorization.build._id))
          .take(MAX_SOURCE_ROWS)
      : [];
  const plannedDrawByKey = new Map(
    plannedDraws.map((plannedDraw) => [plannedDraw.drawKey, plannedDraw]),
  );
  for (const request of page.page) {
    assertSourceOwnership(request, authorization);
    if (run.mode === "materialize") {
      const plannedDraw = request.plannedDrawKey
        ? plannedDrawByKey.get(request.plannedDrawKey)
        : undefined;
      const result = await materializeDraw(ctx, authorization, plannedDraw, request);
      posts += result.post ? 1 : 0;
    }
    processed += 1;
  }
  const complete = page.isDone;
  const updated = await patchRun(ctx, run, {
    drawRequestCursor: complete ? undefined : page.continueCursor,
    materializedPostCount: posts,
    phase: complete ? "complete" : "draw_requests",
    processedDrawRequestCount: processed,
    status: complete ? "complete" : run.mode === "validate" ? "validating" : "running",
    ...(complete ? { completedAt: Date.now() } : {}),
    updatedAt: Date.now(),
  });
  return updated;
}

async function materializeMilestone(
  ctx: MutationCtx,
  authorization: Awaited<ReturnType<typeof authorizeLegacyNoteOperator>>,
  milestone: Doc<"buildMilestones">,
) {
  const event = milestone.startEventId
    ? await ctx.db.get(milestone.startEventId)
    : null;
  const historicalAt = validEpoch(milestone.actualStartedAt ?? milestone.startReportedAt);
  const historicalActorWorkosUserId =
    milestone.startedByWorkosUserId ?? event?.actorWorkosUserId;
  const historicalActorRole = event
    ? resolveEffectiveCollaborationRole(event.actorRoles)?.role
    : undefined;
  const unknownFacts: SystemPostHistoricalBackfill["unknownFacts"] = [];
  if (historicalAt === undefined) unknownFacts.push("start");
  if (!historicalActorWorkosUserId || !historicalActorRole) unknownFacts.push("actor");
  if (!milestone.evidenceState) unknownFacts.push("evidence");
  if (!milestone.completionReview && !milestone.reviewDecisionState) unknownFacts.push("review");
  if (milestone.reviewDecisionState !== "approved") unknownFacts.push("approval");
  unknownFacts.push("disposition");
  const historicalBackfill = backfillFacts({
    historicalActorRole,
    historicalActorWorkosUserId,
    historicalAt,
    materializedAt: Date.now(),
    unknownFacts,
  });
  const existingPost = await ctx.db
    .query("buildCollaborationPosts")
    .withIndex(
      "by_buildId_and_systemPostKind_and_canonicalBuildMilestoneId",
      (query) =>
        query
          .eq("buildId", authorization.build._id)
          .eq("systemPostKind", "milestone")
          .eq("canonicalBuildMilestoneId", milestone._id),
    )
    .first();
  const ensured = await ensureMilestoneSystemPost(ctx, {
    actor: {
      roles: authorization.roles,
      workosUserId: authorization.viewer.subject,
    },
    build: authorization.build,
    historicalBackfill,
    milestone,
    activationReason: "backfill",
  });
  if (!ensured) return { actionItemCount: 0, post: false };
  const lifecycle = milestone.status === "complete" ? "resolved" : "open";
  await projectHistoricalSystemPostLifecycle(ctx, {
    buildId: authorization.build._id,
    historicalBackfill,
    lifecycle,
    materializedAt: historicalBackfill.materializedAt,
    organizationId: authorization.organizationId,
    postId: ensured.postId,
  });
  return {
    actionItemCount: ensured.actionItemIds.length,
    post: existingPost === null,
  };
}

async function materializeDraw(
  ctx: MutationCtx,
  authorization: Awaited<ReturnType<typeof authorizeLegacyNoteOperator>>,
  plannedDraw: Doc<"plannedDrawScheduleRows"> | undefined,
  request: Doc<"activeBuildDrawRequests"> | undefined,
) {
  const sourceStatus = request?.status ?? plannedDraw?.status ?? "planned";
  const historicalAt = terminalDrawAt(sourceStatus, request, plannedDraw);
  const actor = terminalDrawActor(sourceStatus, request);
  const unknownFacts: SystemPostHistoricalBackfill["unknownFacts"] = [];
  if (historicalAt === undefined) unknownFacts.push("start");
  if (!actor.workosUserId || !actor.role) unknownFacts.push("actor");
  unknownFacts.push("evidence");
  if (!request?.reviewedAt && !plannedDraw?.reviewedAt) unknownFacts.push("review");
  if (sourceStatus !== "approved" && sourceStatus !== "approved_for_release" && sourceStatus !== "released") unknownFacts.push("approval");
  if (!["released", "withdrawn", "cancelled", "rejected"].includes(sourceStatus)) unknownFacts.push("disposition");
  const historicalBackfill = backfillFacts({
    historicalActorRole: actor.role,
    historicalActorWorkosUserId: actor.workosUserId,
    historicalAt,
    materializedAt: Date.now(),
    unknownFacts,
  });
  const occurrenceKey = plannedDraw
    ? drawSystemOccurrenceKey(authorization.build, plannedDraw)
    : `draw-system:${String(authorization.build._id)}:${String(authorization.build.proposalId)}:request:${String(request?._id ?? "unknown")}`;
  const existingPost = await ctx.db
    .query("buildCollaborationPosts")
    .withIndex("by_buildId_and_systemEventKey", (query) =>
      query.eq("buildId", authorization.build._id).eq("systemEventKey", occurrenceKey),
    )
    .first();
  const ensured = await ensureDrawSystemPost(ctx, {
    actor: {
      roles: authorization.roles,
      workosUserId: authorization.viewer.subject,
    },
    build: authorization.build,
    drawRequest: request,
    historicalBackfill,
    plannedDraw,
    activationReason: "backfill",
  });
  if (!ensured) return { post: false };
  const lifecycle = ["released", "withdrawn", "cancelled", "rejected"].includes(sourceStatus)
    ? "resolved"
    : "open";
  await projectHistoricalSystemPostLifecycle(ctx, {
    buildId: authorization.build._id,
    historicalBackfill,
    lifecycle,
    materializedAt: historicalBackfill.materializedAt,
    organizationId: authorization.organizationId,
    postId: ensured.postId,
  });
  return { post: existingPost === null };
}

function backfillFacts(input: SystemPostHistoricalBackfill) {
  return {
    ...input,
    source: "existing_records" as const,
    unknownFacts: [...new Set(input.unknownFacts)],
  };
}

function terminalDrawAt(
  status: string,
  request?: Doc<"activeBuildDrawRequests">,
  plannedDraw?: Doc<"plannedDrawScheduleRows">,
) {
  const values =
    status === "released"
      ? [request?.releasedAt, plannedDraw?.releasedAt]
      : status === "withdrawn"
        ? [request?.withdrawnAt]
        : status === "cancelled"
          ? [request?.cancelledAt]
          : status === "rejected"
            ? [request?.reviewedAt, plannedDraw?.reviewedAt]
            : [request?.requestedAt, plannedDraw?.requestedAt];
  for (const value of values) {
    const parsed = parseDate(value);
    if (parsed !== undefined) return parsed;
  }
  return undefined;
}

function terminalDrawActor(
  status: string,
  request?: Doc<"activeBuildDrawRequests">,
) {
  const workosUserId =
    status === "released"
      ? undefined
      : status === "withdrawn"
        ? request?.withdrawnByWorkosUserId
        : status === "cancelled"
          ? request?.cancelledByWorkosUserId
          : status === "rejected" || status === "approved_for_release"
            ? request?.reviewedByWorkosUserId
            : request?.requestedByWorkosUserId;
  // Historical draw rows do not retain actor role snapshots. Keep that fact
  // Unknown rather than deriving role from the current viewer.
  return { role: undefined, workosUserId };
}

function parseDate(value: string | undefined) {
  if (!value) return undefined;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function validEpoch(value: number | undefined) {
  return value !== undefined && Number.isFinite(value) ? value : undefined;
}

async function findRequestForPlannedDraw(
  ctx: QueryCtx,
  buildId: Id<"activeBuilds">,
  drawKey: string,
) {
  const requests = await ctx.db
    .query("activeBuildDrawRequests")
    .withIndex("by_build", (query) => query.eq("buildId", buildId))
    .take(MAX_SOURCE_ROWS);
  return requests.find((request) => request.plannedDrawKey === drawKey);
}

async function findPlannedDraw(
  ctx: QueryCtx,
  buildId: Id<"activeBuilds">,
  drawKey: string,
) {
  const rows = await ctx.db
    .query("plannedDrawScheduleRows")
    .withIndex("by_build_order", (query) => query.eq("buildId", buildId))
    .take(MAX_SOURCE_ROWS);
  return rows.find((row) => row.drawKey === drawKey);
}

async function loadSourceSnapshot(ctx: QueryCtx, buildId: Id<"activeBuilds">) {
  const [milestones, plannedDraws, drawRequests] = await Promise.all([
    ctx.db.query("buildMilestones").withIndex("by_build_order", (q) => q.eq("buildId", buildId)).take(MAX_SOURCE_ROWS + 1),
    ctx.db.query("plannedDrawScheduleRows").withIndex("by_build_order", (q) => q.eq("buildId", buildId)).take(MAX_SOURCE_ROWS + 1),
    ctx.db.query("activeBuildDrawRequests").withIndex("by_build", (q) => q.eq("buildId", buildId)).take(MAX_SOURCE_ROWS + 1),
  ]);
  const truncated = milestones.length > MAX_SOURCE_ROWS || plannedDraws.length > MAX_SOURCE_ROWS || drawRequests.length > MAX_SOURCE_ROWS;
  return {
    drawRequests: drawRequests.slice(0, MAX_SOURCE_ROWS),
    milestones: milestones.slice(0, MAX_SOURCE_ROWS),
    plannedDraws: plannedDraws.slice(0, MAX_SOURCE_ROWS),
    truncated,
    warnings: truncated ? ["Source record preview reached the bounded 5,000-row limit."] : [],
  };
}

async function planTokenForSources(
  buildId: Id<"activeBuilds">,
  sources: Awaited<ReturnType<typeof loadSourceSnapshot>>,
) {
  return `${SYSTEM_POST_BACKFILL_VERSION}:${await sha256Hex(JSON.stringify({
    buildId,
    drawRequests: sources.drawRequests.map((row) => [row._id, row.status, row.updatedAt]),
    milestones: sources.milestones.map((row) => [row._id, row.status, row.updatedAt]),
    plannedDraws: sources.plannedDraws.map((row) => [row._id, row.status, row.updatedAt]),
  }))}`;
}

function assertSourceOwnership(
  source: { buildId: Id<"activeBuilds">; organizationId: string; brokerageId: Id<"brokerages"> },
  authorization: Awaited<ReturnType<typeof authorizeLegacyNoteOperator>>,
) {
  if (
    source.buildId !== authorization.build._id ||
    source.organizationId !== authorization.organizationId ||
    source.brokerageId !== authorization.brokerage._id
  ) {
    throw new Error("System Post backfill source ownership is inconsistent.");
  }
}

async function patchRun(
  ctx: MutationCtx,
  run: BackfillRun,
  patch: Partial<BackfillRun>,
) {
  await ctx.db.patch(run._id, patch);
  const updated = await ctx.db.get(run._id);
  if (!updated) throw new Error("System Post backfill run became unavailable.");
  return updated;
}

async function requireRun(
  ctx: MutationCtx,
  runId: Id<"buildCollaborationSystemPostBackfillRuns">,
  authorization: Awaited<ReturnType<typeof authorizeLegacyNoteOperator>>,
) {
  const run = await ctx.db.get(runId);
  if (!run) throw new Error("System Post backfill run is unavailable.");
  requireRunOwnership(run, authorization);
  return run;
}

function requireRunOwnership(
  run: BackfillRun,
  authorization: Awaited<ReturnType<typeof authorizeLegacyNoteOperator>>,
) {
  if (
    run.buildId !== authorization.build._id ||
    run.organizationId !== authorization.organizationId ||
    run.brokerageId !== authorization.brokerage._id
  ) {
    throw new Error("System Post backfill run is unavailable.");
  }
}

function presentRun(run: BackfillRun) {
  return {
    buildId: run.buildId,
    completedAt: run.completedAt,
    lastError: run.lastError,
    materializedActionItemCount: run.materializedActionItemCount,
    materializedPostCount: run.materializedPostCount,
    mode: run.mode,
    phase: run.phase,
    planToken: run.planToken,
    planVersion: run.planVersion,
    processedDrawRequestCount: run.processedDrawRequestCount,
    processedMilestoneCount: run.processedMilestoneCount,
    processedPlannedDrawCount: run.processedPlannedDrawCount,
    runId: run._id,
    skippedCount: run.skippedCount,
    startedByWorkosUserId: run.startedByWorkosUserId,
    status: run.status,
    warningCount: run.warningCount,
  };
}
