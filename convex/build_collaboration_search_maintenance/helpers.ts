import { Workpool } from "@convex-dev/workpool";
import { components, internal } from "../_generated/api";
import type { ActiveBuildAuthorization } from "../activeBuildAccess";
import { authorizeActiveBuildAccessForViewer } from "../activeBuildAccess";
import type { AuthorizedViewer } from "../authz";
import { materializeBuildCollaborationSearchReaderRecords, type BuildCollaborationSearchOwner } from "../build_collaboration_search_index";
import { buildCollaborationImplicitReaderSourceFingerprint } from "../build_collaboration_search_reader_sources";
import {
  buildCollaborationOrganizationAuthorityFingerprint,
  buildCollaborationSearchReaderFingerprint,
} from "../build_collaboration_search_readers";
import { syncBuildCollaborationSearchAuthority } from "../build_collaboration_search_authority_projection";
import type { ActionCtx, Doc, Id, MutationCtx, QueryCtx } from "../types";

const RECORD_BATCH_SIZE = 50;
const ENUMERATION_BATCH_SIZE = 20;
const SEARCH_JOB_RETRY_BASE_MS = 1000;
const SEARCH_JOB_MAX_RETRY_MS = 60_000;
const CUTOVER_BUILD_BATCH_SIZE = 5;
const CUTOVER_REBUILD_POLL_MS = 1000;

const buildCollaborationSearchWorkpool = new Workpool(
  components.buildCollaborationSearchWorkpool,
  {
    logLevel: "WARN",
    maxParallelism: 4,
  }
);

export async function beginSearchGeneration(
  ctx: MutationCtx,
  authorization: ActiveBuildAuthorization
) {
  const now = Date.now();
  const state = await searchStateForBuild(ctx, authorization.build._id);
  const generation = (state?.generation ?? 0) + 1;
  const targetReaderFingerprint =
    await buildCollaborationSearchReaderFingerprint(ctx, authorization);
  if (state) {
    await ctx.db.patch(state._id, {
      drainScheduled: state.drainScheduled ?? false,
      drainToken: state.drainToken ?? 0,
      generation,
      readyAt: undefined,
      readerFingerprint: undefined,
      requestedAt: now,
      status: "building",
      targetReaderFingerprint,
      updatedAt: now,
    });
  } else {
    await ctx.db.insert("buildCollaborationSearchStates", {
      brokerageId: authorization.brokerage._id,
      buildId: authorization.build._id,
      drainScheduled: false,
      drainToken: 0,
      generation,
      organizationId: authorization.organizationId,
      requestedAt: now,
      status: "building",
      targetReaderFingerprint,
      updatedAt: now,
    });
  }
  return generation;
}

export async function queueSearchJob(
  ctx: MutationCtx,
  input: {
    authorization: ActiveBuildAuthorization;
    generation: number;
    ownerId?: string;
    ownerKind?: BuildCollaborationSearchOwner["kind"];
    phase: Doc<"buildCollaborationSearchJobs">["phase"];
    postId?: Id<"buildCollaborationPosts">;
    scope: Doc<"buildCollaborationSearchJobs">["scope"];
  }
) {
  const now = Date.now();
  const reusableJob = await findReusableSearchJob(ctx, input);
  if (reusableJob) {
    await ctx.db.patch(reusableJob._id, {
      attemptVersion: (reusableJob.attemptVersion ?? 0) + 1,
      candidateCursor: undefined,
      candidateOffset: undefined,
      candidatePhase: undefined,
      cursor: undefined,
      failureCount: 0,
      generation: input.generation,
      lastError: undefined,
      lastScheduledAt: undefined,
      leaseExpiresAt: undefined,
      ownerId: input.ownerId,
      ownerKind: input.ownerKind,
      phase: input.phase,
      postId: input.postId,
      readerOffset: undefined,
      retryAt: undefined,
      status: "queued",
      updatedAt: now,
    });
    return reusableJob._id;
  }
  return await ctx.db.insert("buildCollaborationSearchJobs", {
    attemptVersion: 1,
    brokerageId: input.authorization.brokerage._id,
    buildId: input.authorization.build._id,
    createdAt: now,
    failureCount: 0,
    generation: input.generation,
    organizationId: input.authorization.organizationId,
    ownerId: input.ownerId,
    ownerKind: input.ownerKind,
    phase: input.phase,
    postId: input.postId,
    scope: input.scope,
    status: "queued",
    updatedAt: now,
  });
}

export async function processAuthorizedSearchJob(
  ctx: MutationCtx,
  authorization: ActiveBuildAuthorization,
  job: Doc<"buildCollaborationSearchJobs">
) {
  if (job.scope === "build") {
    await processBuildEnumerationJob(ctx, authorization, job);
    return;
  }
  if (job.scope === "post_tree") {
    await processPostTreeEnumerationJob(ctx, authorization, job);
    return;
  }
  if (job.phase === "retire") {
    const deleted = await deletePriorSearchRecords(ctx, job);
    if (deleted === RECORD_BATCH_SIZE) {
      await markSearchJobQueued(ctx, job);
      return;
    }
    if (job.scope === "post") {
      await markSearchJobComplete(ctx, job);
      return;
    }
    await markSearchJobQueued(ctx, job, { phase: "tier" });
    return;
  }
  const owner = requireOwner(job);
  if (job.phase === "tier") {
    await markSearchJobQueued(ctx, job, {
      candidateCursor: null,
      candidatePhase: "base",
      phase: "readers",
      readerOffset: 0,
    });
    return;
  }
  if (job.phase === "readers") {
    const page = await materializeBuildCollaborationSearchReaderRecords(ctx, {
      authorization,
      candidateCursor: job.candidateCursor ?? null,
      candidatePhase: job.candidatePhase ?? "base",
      jobId: job._id,
      owner,
      postId: requirePostId(job),
      readerOffset: job.readerOffset ?? 0,
    });
    await markSearchJobQueued(ctx, job, {
      candidateCursor: page.nextCandidateCursor,
      candidatePhase: page.nextCandidatePhase,
      phase: page.done ? "activate" : "readers",
      readerOffset: page.nextReaderOffset,
    });
    return;
  }
  if (job.phase === "activate") {
    const staged = await ctx.db
      .query("buildCollaborationSearchRecords")
      .withIndex("by_maintenanceJobId_and_contentState", (query) =>
        query.eq("maintenanceJobId", job._id).eq("contentState", "retired")
      )
      .take(RECORD_BATCH_SIZE);
    for (const record of staged) {
      await ctx.db.patch(record._id, { contentState: "active" });
    }
    if (staged.length === RECORD_BATCH_SIZE) {
      await markSearchJobQueued(ctx, job);
      return;
    }
  }
  await markSearchJobComplete(ctx, job);
}

async function processBuildEnumerationJob(
  ctx: MutationCtx,
  authorization: ActiveBuildAuthorization,
  job: Doc<"buildCollaborationSearchJobs">
) {
  const page = await ctx.db
    .query("buildCollaborationPosts")
    .withIndex("by_buildId_and_createdAt", (query) =>
      query.eq("buildId", job.buildId)
    )
    .paginate({ cursor: job.cursor ?? null, numItems: ENUMERATION_BATCH_SIZE });
  for (const post of page.page) {
    await queueSearchJob(ctx, {
      authorization,
      generation: job.generation,
      ownerId: post._id,
      ownerKind: "post",
      phase: "retire",
      postId: post._id,
      scope: "owner",
    });
    await queueSearchJob(ctx, {
      authorization,
      generation: job.generation,
      phase: "enumerate_comments",
      postId: post._id,
      scope: "post_tree",
    });
  }
  if (page.isDone) {
    await markSearchJobComplete(ctx, job);
    return;
  }
  await markSearchJobQueued(ctx, job, { cursor: page.continueCursor });
}

async function processPostTreeEnumerationJob(
  ctx: MutationCtx,
  authorization: ActiveBuildAuthorization,
  job: Doc<"buildCollaborationSearchJobs">
) {
  const postId = requirePostId(job);
  if (job.phase === "enumerate_comments") {
    const page = await ctx.db
      .query("buildCollaborationComments")
      .withIndex("by_postId_and_createdAt", (query) =>
        query.eq("postId", postId)
      )
      .paginate({
        cursor: job.cursor ?? null,
        numItems: ENUMERATION_BATCH_SIZE,
      });
    for (const comment of page.page) {
      await queueSearchJob(ctx, {
        authorization,
        generation: job.generation,
        ownerId: comment._id,
        ownerKind: "comment",
        phase: "retire",
        postId,
        scope: "owner",
      });
    }
    if (!page.isDone) {
      await markSearchJobQueued(ctx, job, { cursor: page.continueCursor });
      return;
    }
    await markSearchJobQueued(ctx, job, {
      cursor: null,
      phase: "enumerate_actions",
    });
    return;
  }
  const page = await ctx.db
    .query("buildActionItems")
    .withIndex("by_originatingPostId_and_status", (query) =>
      query.eq("originatingPostId", postId)
    )
    .paginate({ cursor: job.cursor ?? null, numItems: ENUMERATION_BATCH_SIZE });
  for (const item of page.page) {
    await queueSearchJob(ctx, {
      authorization,
      generation: job.generation,
      ownerId: item._id,
      ownerKind: "actionItem",
      phase: "retire",
      postId,
      scope: "owner",
    });
  }
  if (!page.isDone) {
    await markSearchJobQueued(ctx, job, { cursor: page.continueCursor });
    return;
  }
  await markSearchJobComplete(ctx, job);
}

async function deletePriorSearchRecords(
  ctx: MutationCtx,
  job: Doc<"buildCollaborationSearchJobs">
) {
  const rows =
    job.scope === "post"
      ? await ctx.db
          .query("buildCollaborationSearchRecords")
          .withIndex("by_postId", (query) =>
            query.eq("postId", requirePostId(job))
          )
          .take(RECORD_BATCH_SIZE)
      : await ctx.db
          .query("buildCollaborationSearchRecords")
          .withIndex("by_postId_and_ownerKind_and_ownerId", (query) =>
            query
              .eq("postId", requirePostId(job))
              .eq("ownerKind", requireOwner(job).kind)
              .eq("ownerId", requireOwner(job).id)
          )
          .take(RECORD_BATCH_SIZE);
  for (const row of rows) {
    await ctx.db.delete(row._id);
  }
  return rows.length;
}

async function markSearchJobQueued(
  ctx: MutationCtx,
  job: Doc<"buildCollaborationSearchJobs">,
  fields: Partial<Doc<"buildCollaborationSearchJobs">> = {}
) {
  await ctx.db.patch(job._id, {
    ...fields,
    leaseExpiresAt: undefined,
    retryAt: undefined,
    status: "queued",
    updatedAt: Date.now(),
  });
}

export async function markSearchJobComplete(
  ctx: MutationCtx,
  job: Doc<"buildCollaborationSearchJobs">
) {
  await ctx.db.patch(job._id, {
    leaseExpiresAt: undefined,
    phase: "complete",
    retryAt: undefined,
    status: "complete",
    updatedAt: Date.now(),
  });
}

export async function ensureSearchDrainScheduled(
  ctx: MutationCtx,
  authorization: ActiveBuildAuthorization
) {
  const state = await searchStateForBuild(ctx, authorization.build._id);
  if (!state || state.drainScheduled) {
    return;
  }
  await scheduleNextSearchDrain(ctx, authorization, state);
}

export async function continueSearchDrainFromState(
  ctx: MutationCtx,
  state: Doc<"buildCollaborationSearchStates">
) {
  const authorization = await searchStateAuthorization(ctx, state);
  if (!authorization) {
    await ctx.db.patch(state._id, {
      drainScheduled: false,
      updatedAt: Date.now(),
    });
    return;
  }
  await continueOrFinalizeSearchDrain(ctx, authorization);
}

export async function continueOrFinalizeSearchDrain(
  ctx: MutationCtx,
  authorization: ActiveBuildAuthorization
) {
  const state = await searchStateForBuild(ctx, authorization.build._id);
  if (!state) {
    return;
  }
  await scheduleNextSearchDrain(ctx, authorization, state);
}

async function scheduleNextSearchDrain(
  ctx: MutationCtx,
  authorization: ActiveBuildAuthorization,
  state: Doc<"buildCollaborationSearchStates">
) {
  const next = await nextSearchDrainCandidate(
    ctx,
    authorization.build._id,
    Date.now()
  );
  if (!next) {
    await finalizeSearchDrain(ctx, authorization, state);
    return;
  }
  const drainToken = (state.drainToken ?? 0) + 1;
  const input = {
    buildId: authorization.build._id,
    drainToken,
    jobAttemptVersion: next.job.attemptVersion ?? 0,
    jobId: next.job._id,
  };
  await ctx.db.patch(state._id, {
    drainScheduled: true,
    drainToken,
    updatedAt: Date.now(),
  });
  await buildCollaborationSearchWorkpool.enqueueMutation(
    ctx,
    internal.build_collaboration_search_maintenance
      .processBuildCollaborationSearchDrain,
    input,
    {
      context: input,
      onComplete:
        internal.build_collaboration_search_maintenance
          .completeBuildCollaborationSearchDrain,
      runAfter: next.runAfter,
    }
  );
}

async function finalizeSearchDrain(
  ctx: MutationCtx,
  authorization: ActiveBuildAuthorization,
  state: Doc<"buildCollaborationSearchStates">
) {
  const now = Date.now();
  const readerFingerprint = await buildCollaborationSearchReaderFingerprint(
    ctx,
    authorization
  );
  if (state.targetReaderFingerprint !== readerFingerprint) {
    const generation = await beginSearchGeneration(ctx, authorization);
    await queueSearchJob(ctx, {
      authorization,
      generation,
      phase: "enumerate_posts",
      scope: "build",
    });
    const refreshedState = await searchStateForBuild(
      ctx,
      authorization.build._id
    );
    if (refreshedState) {
      await scheduleNextSearchDrain(ctx, authorization, refreshedState);
    }
    return;
  }
  await ctx.db.patch(state._id, {
    drainScheduled: false,
    readyAt: now,
    readerFingerprint,
    status: "ready",
    targetReaderFingerprint: undefined,
    updatedAt: now,
  });
}

async function nextSearchDrainCandidate(
  ctx: MutationCtx,
  buildId: Id<"activeBuilds">,
  now: number
) {
  for (const status of ["queued", "running"] as const) {
    const job = await ctx.db
      .query("buildCollaborationSearchJobs")
      .withIndex("by_buildId_and_status", (query) =>
        query.eq("buildId", buildId).eq("status", status)
      )
      .first();
    if (job) {
      return { job, runAfter: 0 };
    }
  }
  const failed = await ctx.db
    .query("buildCollaborationSearchJobs")
    .withIndex("by_buildId_and_status_and_retryAt", (query) =>
      query.eq("buildId", buildId).eq("status", "failed")
    )
    .order("asc")
    .first();
  if (!failed) {
    return null;
  }
  const retryAt = failed.retryAt ?? failed.leaseExpiresAt ?? now;
  return { job: failed, runAfter: Math.max(0, retryAt - now) };
}

export async function searchStateForBuild(
  ctx: QueryCtx | MutationCtx,
  buildId: Id<"activeBuilds">
) {
  return await ctx.db
    .query("buildCollaborationSearchStates")
    .withIndex("by_buildId", (query) => query.eq("buildId", buildId))
    .unique();
}

async function searchStateAuthorization(
  ctx: MutationCtx,
  state: Doc<"buildCollaborationSearchStates">
) {
  try {
    return await authorizeActiveBuildAccessForViewer(
      ctx,
      searchMaintenanceViewer(state.organizationId),
      { buildId: state.buildId, organizationId: state.organizationId }
    );
  } catch {
    return null;
  }
}

async function findReusableSearchJob(
  ctx: MutationCtx,
  input: {
    authorization: ActiveBuildAuthorization;
    ownerId?: string;
    ownerKind?: BuildCollaborationSearchOwner["kind"];
    postId?: Id<"buildCollaborationPosts">;
    scope: Doc<"buildCollaborationSearchJobs">["scope"];
  }
) {
  const buildId = input.authorization.build._id;
  if (input.ownerId && input.ownerKind) {
    const jobs = await ctx.db
      .query("buildCollaborationSearchJobs")
      .withIndex("by_buildId_and_ownerKind_and_ownerId", (query) =>
        query
          .eq("buildId", buildId)
          .eq("ownerKind", input.ownerKind)
          .eq("ownerId", input.ownerId)
      )
      .order("desc")
      .take(10);
    return jobs.find((job) => job.status !== "complete");
  }
  if (input.postId) {
    for (const status of ["queued", "running", "failed"] as const) {
      const job = await ctx.db
        .query("buildCollaborationSearchJobs")
        .withIndex("by_buildId_and_postId_and_scope_and_status", (query) =>
          query
            .eq("buildId", buildId)
            .eq("postId", input.postId)
            .eq("scope", input.scope)
            .eq("status", status)
        )
        .first();
      if (job) {
        return job;
      }
    }
    return null;
  }
  for (const status of ["queued", "running", "failed"] as const) {
    const job = await ctx.db
      .query("buildCollaborationSearchJobs")
      .withIndex("by_buildId_and_scope_and_status", (query) =>
        query
          .eq("buildId", buildId)
          .eq("scope", input.scope)
          .eq("status", status)
      )
      .first();
    if (job) {
      return job;
    }
  }
  return null;
}

export async function firstPendingSearchJob(
  ctx: QueryCtx | MutationCtx,
  buildId: Id<"activeBuilds">
) {
  const pending = await Promise.all(
    (["failed", "running", "queued"] as const).map((status) =>
      ctx.db
        .query("buildCollaborationSearchJobs")
        .withIndex("by_buildId_and_status", (query) =>
          query.eq("buildId", buildId).eq("status", status)
        )
        .first()
    )
  );
  return pending.find(Boolean) ?? null;
}

export function retryDelayForFailure(failureCount: number) {
  return Math.min(
    SEARCH_JOB_RETRY_BASE_MS * 2 ** Math.min(failureCount - 1, 10),
    SEARCH_JOB_MAX_RETRY_MS
  );
}

export function searchDrainError(result: {
  error?: string;
  kind: "canceled" | "failed" | "success";
}) {
  if (result.kind === "failed") {
    return result.error ?? "Search maintenance failed unexpectedly.";
  }
  return "Search maintenance Workpool execution was canceled.";
}

async function organizationSearchMaintenanceState(
  ctx: QueryCtx | MutationCtx,
  organizationId: string
) {
  const [failed, running, queued] = await Promise.all(
    (["failed", "running", "queued"] as const).map((status) =>
      ctx.db
        .query("buildCollaborationSearchJobs")
        .withIndex("by_organizationId_and_status", (query) =>
          query.eq("organizationId", organizationId).eq("status", status)
        )
        .first()
    )
  );
  if (failed) {
    return {
      kind: "failed" as const,
      reason: `Build ${failed.buildId} collaboration search maintenance failed${failed.lastError ? `: ${failed.lastError}` : "."}`,
    };
  }
  return running || queued
    ? { kind: "pending" as const }
    : { kind: "idle" as const };
}

export async function processCutoverSearchRebuild(
  ctx: MutationCtx,
  check: Doc<"buildCollaborationSearchCutoverChecks">
) {
  if (check.searchRebuildComplete) {
    return false;
  }
  const rebuildPage = await ctx.db
    .query("activeBuilds")
    .withIndex("by_organizationId", (query) =>
      query.eq("organizationId", check.organizationId)
    )
    .paginate({
      cursor: check.rebuildCursor ?? null,
      numItems: CUTOVER_BUILD_BATCH_SIZE,
    });
  for (const build of rebuildPage.page) {
    const authorization = await authorizeActiveBuildAccessForViewer(
      ctx,
      searchMaintenanceViewer(build.organizationId),
      { buildId: build._id, organizationId: build.organizationId }
    );
    const generation = await beginSearchGeneration(ctx, authorization);
    await queueSearchJob(ctx, {
      authorization,
      generation,
      phase: "enumerate_posts",
      scope: "build",
    });
    await ensureSearchDrainScheduled(ctx, authorization);
  }
  await ctx.db.patch(check._id, {
    rebuildCursor: rebuildPage.isDone ? null : rebuildPage.continueCursor,
    searchRebuildComplete: rebuildPage.isDone,
    updatedAt: Date.now(),
  });
  await ctx.scheduler.runAfter(
    0,
    internal.build_collaboration_search_maintenance
      .processBuildCollaborationSearchCutoverVerification,
    { checkId: check._id }
  );
  return true;
}

export async function deferCutoverForSearchMaintenance(
  ctx: MutationCtx,
  check: Doc<"buildCollaborationSearchCutoverChecks">
) {
  const maintenance = await organizationSearchMaintenanceState(
    ctx,
    check.organizationId
  );
  if (maintenance.kind === "idle") {
    return false;
  }
  if (maintenance.kind === "failed") {
    await ctx.db.patch(check._id, {
      failureReason: maintenance.reason,
      status: "blocked",
      updatedAt: Date.now(),
    });
    return true;
  }
  await ctx.scheduler.runAfter(
    CUTOVER_REBUILD_POLL_MS,
    internal.build_collaboration_search_maintenance
      .processBuildCollaborationSearchCutoverVerification,
    { checkId: check._id }
  );
  return true;
}

export async function recordSearchJobFailure(
  ctx: ActionCtx,
  jobId: Id<"buildCollaborationSearchJobs">,
  error: unknown
) {
  await ctx.runMutation(
    internal.build_collaboration_search_maintenance
      .recordBuildCollaborationSearchJobFailure,
    {
      error:
        error instanceof Error
          ? error.message
          : "Search maintenance failed unexpectedly.",
      jobId,
    }
  );
}

export async function searchJobAuthorization(
  ctx: MutationCtx,
  job: Doc<"buildCollaborationSearchJobs">
) {
  try {
    return await authorizeActiveBuildAccessForViewer(
      ctx,
      searchMaintenanceViewer(job.organizationId),
      { buildId: job.buildId, organizationId: job.organizationId }
    );
  } catch {
    return null;
  }
}

export async function searchReadinessFailure(
  ctx: MutationCtx,
  build: Doc<"activeBuilds">
) {
  const authorization = await authorizeActiveBuildAccessForViewer(
    ctx,
    searchMaintenanceViewer(build.organizationId),
    { buildId: build._id, organizationId: build.organizationId }
  );
  const [pending, state] = await Promise.all([
    firstPendingSearchJob(ctx, build._id),
    ctx.db
      .query("buildCollaborationSearchStates")
      .withIndex("by_buildId", (query) => query.eq("buildId", build._id))
      .unique(),
  ]);
  if (!state) {
    return `Build ${build._id} has no collaboration search generation.`;
  }
  if (state.status !== "ready") {
    return `Build ${build._id} collaboration search is ${state.status}.`;
  }
  if (pending) {
    return `Build ${build._id} still has pending collaboration search maintenance.`;
  }
  const currentFingerprint = await buildCollaborationSearchReaderFingerprint(
    ctx,
    authorization
  );
  if (state.readerFingerprint !== currentFingerprint) {
    return `Build ${build._id} collaboration search readers changed after indexing.`;
  }
  return null;
}

export function searchMaintenanceViewer(organizationId?: string): AuthorizedViewer {
  return {
    actorKind: "system" as const,
    capability: "authenticated" as const,
    organizationId,
    roles: ["admin"],
    subject: "build-collaboration-search-maintenance",
    tokenIdentifier: "build-collaboration-search-maintenance",
  };
}

function requireOwner(job: Doc<"buildCollaborationSearchJobs">) {
  if (!(job.ownerId && job.ownerKind)) {
    throw new Error("Search maintenance owner is unavailable.");
  }
  return { id: job.ownerId, kind: job.ownerKind };
}

function requirePostId(job: Doc<"buildCollaborationSearchJobs">) {
  if (!job.postId) {
    throw new Error("Search maintenance post is unavailable.");
  }
  return job.postId;
}
