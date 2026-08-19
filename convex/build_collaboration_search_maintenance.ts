import { Workpool, vResult } from "@convex-dev/workpool";
import { v } from "convex/values";

import { components, internal } from "./_generated/api";
import type { ActiveBuildAuthorization } from "./activeBuildAccess";
import { authorizeActiveBuildAccessForViewer } from "./activeBuildAccess";
import type { AuthorizedViewer } from "./authz";
import { syncBuildCollaborationSearchAuthority } from "./build_collaboration_search_authority_projection";
import {
  type BuildCollaborationSearchOwner,
  materializeBuildCollaborationSearchReaderRecords,
} from "./build_collaboration_search_index";
import { buildCollaborationImplicitReaderSourceFingerprint } from "./build_collaboration_search_reader_sources";
import {
  buildCollaborationOrganizationAuthorityFingerprint,
  buildCollaborationSearchReaderFingerprint,
} from "./build_collaboration_search_readers";
import { internalAction, internalMutation, internalQuery } from "./fluent";
import type { ActionCtx, Doc, Id, MutationCtx, QueryCtx } from "./types";

const RECORD_BATCH_SIZE = 50;
const ENUMERATION_BATCH_SIZE = 20;
const SEARCH_JOB_RETRY_BASE_MS = 1000;
const SEARCH_JOB_MAX_RETRY_MS = 60_000;
const MAX_SEARCH_JOB_ERROR_LENGTH = 500;
const SEARCH_INSPECTION_JOB_LIMIT = 1000;
const SEARCH_INSPECTION_RECORD_LIMIT = 1000;
const CUTOVER_BUILD_BATCH_SIZE = 5;
const CUTOVER_AUTHORITY_BATCH_SIZE = 50;
const CUTOVER_REBUILD_POLL_MS = 1000;

const buildCollaborationSearchWorkpool = new Workpool(
  components.buildCollaborationSearchWorkpool,
  {
    logLevel: "WARN",
    maxParallelism: 4,
  }
);

export async function queueBuildCollaborationSearchOwnerRebuild(
  ctx: MutationCtx,
  input: {
    authorization: ActiveBuildAuthorization;
    owner: BuildCollaborationSearchOwner;
    postId: Id<"buildCollaborationPosts">;
  }
) {
  const generation = await beginSearchGeneration(ctx, input.authorization);
  const jobId = await queueSearchJob(ctx, {
    authorization: input.authorization,
    generation,
    ownerId: input.owner.id,
    ownerKind: input.owner.kind,
    phase: "retire",
    postId: input.postId,
    scope: "owner",
  });
  await ensureSearchDrainScheduled(ctx, input.authorization);
  return jobId;
}

export async function queueBuildCollaborationSearchPostTreeRebuild(
  ctx: MutationCtx,
  input: {
    authorization: ActiveBuildAuthorization;
    postId: Id<"buildCollaborationPosts">;
  }
) {
  const generation = await beginSearchGeneration(ctx, input.authorization);
  await queueSearchJob(ctx, {
    authorization: input.authorization,
    generation,
    ownerId: input.postId,
    ownerKind: "post",
    phase: "retire",
    postId: input.postId,
    scope: "owner",
  });
  const jobId = await queueSearchJob(ctx, {
    authorization: input.authorization,
    generation,
    phase: "enumerate_comments",
    postId: input.postId,
    scope: "post_tree",
  });
  await ensureSearchDrainScheduled(ctx, input.authorization);
  return jobId;
}

export async function queueBuildCollaborationSearchPostRemoval(
  ctx: MutationCtx,
  input: {
    authorization: ActiveBuildAuthorization;
    postId: Id<"buildCollaborationPosts">;
  }
) {
  const generation = await beginSearchGeneration(ctx, input.authorization);
  const jobId = await queueSearchJob(ctx, {
    authorization: input.authorization,
    generation,
    phase: "retire",
    postId: input.postId,
    scope: "post",
  });
  await ensureSearchDrainScheduled(ctx, input.authorization);
  return jobId;
}

export async function queueBuildCollaborationSearchBuildRebuild(
  ctx: MutationCtx,
  input: { authorization: ActiveBuildAuthorization }
) {
  const generation = await beginSearchGeneration(ctx, input.authorization);
  const jobId = await queueSearchJob(ctx, {
    authorization: input.authorization,
    generation,
    phase: "enumerate_posts",
    scope: "build",
  });
  await ensureSearchDrainScheduled(ctx, input.authorization);
  return jobId;
}

export const ensureBuildCollaborationSearchMaintenance = internalMutation
  .input({
    buildId: v.id("activeBuilds"),
    organizationId: v.string(),
  })
  .returns(v.null())
  .handler(async (ctx, args) => {
    const pending = await firstPendingSearchJob(ctx, args.buildId);
    if (pending) {
      const authorization = await authorizeActiveBuildAccessForViewer(
        ctx,
        searchMaintenanceViewer(),
        args
      );
      await ensureSearchDrainScheduled(ctx, authorization);
      return null;
    }
    const authorization = await authorizeActiveBuildAccessForViewer(
      ctx,
      searchMaintenanceViewer(),
      args
    );
    await queueBuildCollaborationSearchBuildRebuild(ctx, { authorization });
    return null;
  })
  .internal();

export const inspectBuildCollaborationSearchMaintenance = internalQuery
  .input({
    buildId: v.id("activeBuilds"),
    organizationId: v.string(),
  })
  .returns(
    v.object({
      generation: v.number(),
      hasPendingJobs: v.boolean(),
      readerFingerprintCurrent: v.boolean(),
      status: v.union(
        v.literal("missing"),
        v.literal("building"),
        v.literal("ready")
      ),
    })
  )
  .handler(async (ctx, args) => {
    const authorization = await authorizeActiveBuildAccessForViewer(
      ctx,
      searchMaintenanceViewer(args.organizationId),
      args
    );
    const state = await ctx.db
      .query("buildCollaborationSearchStates")
      .withIndex("by_buildId", (query) => query.eq("buildId", args.buildId))
      .unique();
    const pending = await firstPendingSearchJob(ctx, args.buildId);
    const readerFingerprint = await buildCollaborationSearchReaderFingerprint(
      ctx,
      authorization
    );
    return {
      generation: state?.generation ?? 0,
      hasPendingJobs: Boolean(pending),
      readerFingerprintCurrent:
        Boolean(state?.readerFingerprint) &&
        state?.readerFingerprint === readerFingerprint,
      status: state?.status ?? "missing",
    };
  })
  .internal();

export const inspectBuildCollaborationSearchProjection = internalQuery
  .input({
    buildId: v.id("activeBuilds"),
    organizationId: v.string(),
  })
  .returns(
    v.object({
      activeRecordCount: v.number(),
      duplicateActiveRecordCount: v.number(),
      generation: v.number(),
      generationJobCount: v.number(),
      generationJobFailureCount: v.number(),
      generationJobsComplete: v.boolean(),
      jobScanComplete: v.boolean(),
      recordScanComplete: v.boolean(),
    })
  )
  .handler(async (ctx, args) => {
    const state = await searchStateForBuild(ctx, args.buildId);
    if (state?.organizationId !== args.organizationId) {
      throw new Error("Build collaboration search state is unavailable.");
    }
    const jobRows = await ctx.db
      .query("buildCollaborationSearchJobs")
      .withIndex("by_buildId_and_status", (query) =>
        query.eq("buildId", args.buildId)
      )
      .order("desc")
      .take(SEARCH_INSPECTION_JOB_LIMIT + 1);
    const jobScanComplete = jobRows.length <= SEARCH_INSPECTION_JOB_LIMIT;
    const jobs = jobRows.slice(0, SEARCH_INSPECTION_JOB_LIMIT);
    const generationJobs = jobs.filter(
      (job) => job.generation === (state?.generation ?? 0)
    );
    const recordRows = await ctx.db
      .query("buildCollaborationSearchRecords")
      .withIndex("by_buildId_and_reader", (query) =>
        query.eq("buildId", args.buildId)
      )
      .take(SEARCH_INSPECTION_RECORD_LIMIT + 1);
    const recordScanComplete =
      recordRows.length <= SEARCH_INSPECTION_RECORD_LIMIT;
    const activeRecords = recordRows
      .slice(0, SEARCH_INSPECTION_RECORD_LIMIT)
      .filter((record) => record.contentState === "active");
    const activeKeys = new Set<string>();
    let duplicateActiveRecordCount = 0;
    for (const record of activeRecords) {
      const key = JSON.stringify([
        record.readerPartitionKey,
        record.candidateKey,
      ]);
      if (activeKeys.has(key)) {
        duplicateActiveRecordCount += 1;
      } else {
        activeKeys.add(key);
      }
    }
    return {
      activeRecordCount: activeRecords.length,
      duplicateActiveRecordCount,
      generation: state?.generation ?? 0,
      generationJobCount: generationJobs.length,
      generationJobFailureCount: generationJobs.reduce(
        (total, job) => total + (job.failureCount ?? 0),
        0
      ),
      generationJobsComplete:
        jobScanComplete &&
        generationJobs.length > 0 &&
        generationJobs.every((job) => job.status === "complete"),
      jobScanComplete,
      recordScanComplete,
    };
  })
  .internal();

export const startBuildCollaborationSearchCutoverVerification = internalMutation
  .input({
    buildId: v.id("activeBuilds"),
    organizationId: v.string(),
  })
  .returns(v.id("buildCollaborationSearchCutoverChecks"))
  .handler(async (ctx, args) => {
    const authorization = await authorizeActiveBuildAccessForViewer(
      ctx,
      searchMaintenanceViewer(args.organizationId),
      args
    );
    const existing = await ctx.db
      .query("buildCollaborationSearchCutoverChecks")
      .withIndex("by_organizationId", (query) =>
        query.eq("organizationId", authorization.organizationId)
      )
      .unique();
    const now = Date.now();
    const fields = {
      authorityCursor: null,
      authorityProjectionComplete: false,
      authorityReaderFingerprint: undefined,
      brokerageId: authorization.brokerage._id,
      buildCount: 0,
      completedAt: undefined,
      cursor: null,
      failureReason: undefined,
      implicitReaderSourceFingerprint: undefined,
      latestBuildCreationTime: undefined,
      organizationId: authorization.organizationId,
      rebuildCursor: null,
      readyBuildCount: 0,
      searchRebuildComplete: false,
      startedAt: now,
      status: "building" as const,
      updatedAt: now,
    };
    const checkId =
      existing?._id ??
      (await ctx.db.insert("buildCollaborationSearchCutoverChecks", fields));
    if (existing) {
      await ctx.db.patch(existing._id, fields);
    }
    await ctx.scheduler.runAfter(
      0,
      internal.build_collaboration_search_maintenance
        .processBuildCollaborationSearchCutoverVerification,
      { checkId }
    );
    return checkId;
  })
  .internal();

export const inspectBuildCollaborationSearchCutoverVerification = internalQuery
  .input({
    buildId: v.id("activeBuilds"),
    organizationId: v.string(),
  })
  .returns(
    v.object({
      buildCount: v.number(),
      failureReason: v.optional(v.string()),
      readyBuildCount: v.number(),
      status: v.union(
        v.literal("missing"),
        v.literal("building"),
        v.literal("blocked"),
        v.literal("ready")
      ),
    })
  )
  .handler(async (ctx, args) => {
    const authorization = await authorizeActiveBuildAccessForViewer(
      ctx,
      searchMaintenanceViewer(args.organizationId),
      args
    );
    const check = await ctx.db
      .query("buildCollaborationSearchCutoverChecks")
      .withIndex("by_organizationId", (query) =>
        query.eq("organizationId", authorization.organizationId)
      )
      .unique();
    return {
      buildCount: check?.buildCount ?? 0,
      failureReason: check?.failureReason,
      readyBuildCount: check?.readyBuildCount ?? 0,
      status: check?.status ?? "missing",
    };
  })
  .internal();

export const processBuildCollaborationSearchCutoverVerification =
  internalMutation
    .input({ checkId: v.id("buildCollaborationSearchCutoverChecks") })
    .returns(v.null())
    .handler(async (ctx, args) => {
      const check = await ctx.db.get(args.checkId);
      if (!check || check.status !== "building") {
        return null;
      }
      if (!check.authorityProjectionComplete) {
        const authorityPage = await ctx.db
          .query("workosOrganizationMemberships")
          .withIndex("by_organization", (query) =>
            query.eq("workosOrganizationId", check.organizationId)
          )
          .paginate({
            cursor: check.authorityCursor ?? null,
            numItems: CUTOVER_AUTHORITY_BATCH_SIZE,
          });
        for (const membership of authorityPage.page) {
          await syncBuildCollaborationSearchAuthority(ctx, membership);
        }
        await ctx.db.patch(check._id, {
          authorityCursor: authorityPage.isDone
            ? null
            : authorityPage.continueCursor,
          authorityProjectionComplete: authorityPage.isDone,
          updatedAt: Date.now(),
        });
        await ctx.scheduler.runAfter(
          0,
          internal.build_collaboration_search_maintenance
            .processBuildCollaborationSearchCutoverVerification,
          { checkId: check._id }
        );
        return null;
      }
      const [authorityReaderFingerprint, implicitReaderSourceFingerprint] =
        await Promise.all([
          buildCollaborationOrganizationAuthorityFingerprint(
            ctx,
            check.organizationId
          ),
          buildCollaborationImplicitReaderSourceFingerprint(ctx, {
            brokerageId: check.brokerageId,
            organizationId: check.organizationId,
          }),
        ]);
      if (
        !(
          check.authorityReaderFingerprint &&
          check.implicitReaderSourceFingerprint
        )
      ) {
        await ctx.db.patch(check._id, {
          authorityReaderFingerprint,
          implicitReaderSourceFingerprint,
          updatedAt: Date.now(),
        });
        await ctx.scheduler.runAfter(
          0,
          internal.build_collaboration_search_maintenance
            .processBuildCollaborationSearchCutoverVerification,
          { checkId: check._id }
        );
        return null;
      }
      if (
        check.authorityReaderFingerprint !== authorityReaderFingerprint ||
        check.implicitReaderSourceFingerprint !==
          implicitReaderSourceFingerprint
      ) {
        await ctx.db.patch(check._id, {
          failureReason:
            "Collaboration reader authority changed during search verification; restart the verification.",
          status: "blocked",
          updatedAt: Date.now(),
        });
        return null;
      }
      if (await processCutoverSearchRebuild(ctx, check)) {
        return null;
      }
      if (await deferCutoverForSearchMaintenance(ctx, check)) {
        return null;
      }
      const page = await ctx.db
        .query("activeBuilds")
        .withIndex("by_organizationId", (query) =>
          query.eq("organizationId", check.organizationId)
        )
        .paginate({
          cursor: check.cursor ?? null,
          numItems: CUTOVER_BUILD_BATCH_SIZE,
        });
      let buildCount = check.buildCount;
      let latestBuildCreationTime = check.latestBuildCreationTime;
      let readyBuildCount = check.readyBuildCount;
      for (const build of page.page) {
        buildCount += 1;
        latestBuildCreationTime = Math.max(
          latestBuildCreationTime ?? 0,
          build._creationTime
        );
        const failure = await searchReadinessFailure(ctx, build);
        if (failure) {
          await ctx.db.patch(check._id, {
            buildCount,
            failureReason: failure,
            latestBuildCreationTime,
            readyBuildCount,
            status: "blocked",
            updatedAt: Date.now(),
          });
          return null;
        }
        readyBuildCount += 1;
      }
      if (!page.isDone) {
        await ctx.db.patch(check._id, {
          buildCount,
          cursor: page.continueCursor,
          latestBuildCreationTime,
          readyBuildCount,
          updatedAt: Date.now(),
        });
        await ctx.scheduler.runAfter(
          0,
          internal.build_collaboration_search_maintenance
            .processBuildCollaborationSearchCutoverVerification,
          { checkId: check._id }
        );
        return null;
      }
      const now = Date.now();
      await ctx.db.patch(check._id, {
        buildCount,
        completedAt: now,
        cursor: null,
        failureReason: undefined,
        latestBuildCreationTime,
        readyBuildCount,
        status: "ready",
        updatedAt: now,
      });
      return null;
    })
    .internal();

const searchDrainInput = {
  buildId: v.id("activeBuilds"),
  drainToken: v.number(),
  jobAttemptVersion: v.number(),
  jobId: v.id("buildCollaborationSearchJobs"),
};

async function beginSearchGeneration(
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

async function queueSearchJob(
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

export const processBuildCollaborationSearchDrain = internalMutation
  .input(searchDrainInput)
  .returns(v.null())
  .handler(async (ctx, args) => {
    const state = await searchStateForBuild(ctx, args.buildId);
    if (!state?.drainScheduled || state.drainToken !== args.drainToken) {
      return null;
    }
    const job = await ctx.db.get(args.jobId);
    if (
      !job ||
      job.buildId !== args.buildId ||
      job.status === "complete" ||
      (job.attemptVersion ?? 0) !== args.jobAttemptVersion
    ) {
      await continueSearchDrainFromState(ctx, state);
      return null;
    }
    await ctx.db.patch(job._id, {
      lastScheduledAt: Date.now(),
      retryAt: undefined,
      status: "running",
      updatedAt: Date.now(),
    });
    const authorization = await searchJobAuthorization(ctx, job);
    if (!authorization) {
      await markSearchJobComplete(ctx, job);
      await continueSearchDrainFromState(ctx, state);
      return null;
    }
    await processAuthorizedSearchJob(ctx, authorization, job);
    await continueOrFinalizeSearchDrain(ctx, authorization);
    return null;
  })
  .internal();

export const completeBuildCollaborationSearchDrain = internalMutation
  .input({
    context: v.object(searchDrainInput),
    result: vResult,
    workId: v.string(),
  })
  .returns(v.null())
  .handler(async (ctx, args) => {
    if (args.result.kind === "success") {
      return null;
    }
    const state = await searchStateForBuild(ctx, args.context.buildId);
    if (
      !state?.drainScheduled ||
      state.drainToken !== args.context.drainToken
    ) {
      return null;
    }
    const job = await ctx.db.get(args.context.jobId);
    if (
      !job ||
      job.status === "complete" ||
      (job.attemptVersion ?? 0) !== args.context.jobAttemptVersion
    ) {
      await continueSearchDrainFromState(ctx, state);
      return null;
    }
    const now = Date.now();
    const failureCount = (job.failureCount ?? 0) + 1;
    const retryAt = now + retryDelayForFailure(failureCount);
    await ctx.db.patch(job._id, {
      failureCount,
      lastError: searchDrainError(args.result).slice(
        0,
        MAX_SEARCH_JOB_ERROR_LENGTH
      ),
      leaseExpiresAt: undefined,
      retryAt,
      status: "failed",
      updatedAt: now,
    });
    await continueSearchDrainFromState(ctx, state);
    return null;
  })
  .internal();

// Compatibility adapter for scheduler work created before the Workpool cutover.
export const executeBuildCollaborationSearchJob = internalAction
  .input({ jobId: v.id("buildCollaborationSearchJobs") })
  .returns(v.null())
  .handler(async (ctx, args) => {
    try {
      await ctx.runMutation(
        internal.build_collaboration_search_maintenance
          .resumeBuildCollaborationSearchJob,
        args
      );
    } catch (error) {
      await recordSearchJobFailure(ctx, args.jobId, error);
    }
    return null;
  })
  .internal();

export const resumeBuildCollaborationSearchJob = internalMutation
  .input({ jobId: v.id("buildCollaborationSearchJobs") })
  .returns(v.null())
  .handler(async (ctx, args) => {
    const job = await ctx.db.get(args.jobId);
    if (!job || job.status === "complete") {
      return null;
    }
    const authorization = await searchJobAuthorization(ctx, job);
    if (!authorization) {
      await markSearchJobComplete(ctx, job);
      return null;
    }
    await ctx.db.patch(job._id, {
      leaseExpiresAt: undefined,
      retryAt: undefined,
      status: "queued",
      updatedAt: Date.now(),
    });
    await ensureSearchDrainScheduled(ctx, authorization);
    return null;
  })
  .internal();

// Kept for callers and queued actions from the previous scheduler generation.
export const processBuildCollaborationSearchJob = internalMutation
  .input({ jobId: v.id("buildCollaborationSearchJobs") })
  .returns(v.null())
  .handler(async (ctx, args) => {
    const job = await ctx.db.get(args.jobId);
    if (!job || job.status === "complete") {
      return null;
    }
    const authorization = await searchJobAuthorization(ctx, job);
    if (!authorization) {
      await markSearchJobComplete(ctx, job);
      return null;
    }
    await ensureSearchDrainScheduled(ctx, authorization);
    return null;
  })
  .internal();

export const recordBuildCollaborationSearchJobFailure = internalMutation
  .input({
    error: v.string(),
    jobId: v.id("buildCollaborationSearchJobs"),
  })
  .returns(v.null())
  .handler(async (ctx, args) => {
    const job = await ctx.db.get(args.jobId);
    if (!job || job.status === "complete") {
      return null;
    }
    const now = Date.now();
    const failureCount = (job.failureCount ?? 0) + 1;
    await ctx.db.patch(job._id, {
      failureCount,
      lastError: args.error.slice(0, MAX_SEARCH_JOB_ERROR_LENGTH),
      leaseExpiresAt: undefined,
      retryAt: now + retryDelayForFailure(failureCount),
      status: "failed",
      updatedAt: now,
    });
    const authorization = await searchJobAuthorization(ctx, job);
    if (authorization) {
      await ensureSearchDrainScheduled(ctx, authorization);
    }
    return null;
  })
  .internal();

export const recoverBuildCollaborationSearchJob = internalMutation
  .input({
    expectedLeaseExpiresAt: v.number(),
    jobId: v.id("buildCollaborationSearchJobs"),
  })
  .returns(v.null())
  .handler(async (ctx, args) => {
    const job = await ctx.db.get(args.jobId);
    if (
      !job ||
      job.status === "complete" ||
      job.leaseExpiresAt !== args.expectedLeaseExpiresAt ||
      job.leaseExpiresAt > Date.now()
    ) {
      return null;
    }
    const authorization = await searchJobAuthorization(ctx, job);
    if (!authorization) {
      await markSearchJobComplete(ctx, job);
      return null;
    }
    await ctx.db.patch(job._id, {
      leaseExpiresAt: undefined,
      retryAt: undefined,
      status: "queued",
      updatedAt: Date.now(),
    });
    await ensureSearchDrainScheduled(ctx, authorization);
    return null;
  })
  .internal();

async function processAuthorizedSearchJob(
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

async function markSearchJobComplete(
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

async function ensureSearchDrainScheduled(
  ctx: MutationCtx,
  authorization: ActiveBuildAuthorization
) {
  const state = await searchStateForBuild(ctx, authorization.build._id);
  if (!state || state.drainScheduled) {
    return;
  }
  await scheduleNextSearchDrain(ctx, authorization, state);
}

async function continueSearchDrainFromState(
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

async function continueOrFinalizeSearchDrain(
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

async function searchStateForBuild(
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

async function firstPendingSearchJob(
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

function retryDelayForFailure(failureCount: number) {
  return Math.min(
    SEARCH_JOB_RETRY_BASE_MS * 2 ** Math.min(failureCount - 1, 10),
    SEARCH_JOB_MAX_RETRY_MS
  );
}

function searchDrainError(result: {
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

async function processCutoverSearchRebuild(
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
    await queueBuildCollaborationSearchBuildRebuild(ctx, { authorization });
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

async function deferCutoverForSearchMaintenance(
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

async function recordSearchJobFailure(
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

async function searchJobAuthorization(
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

async function searchReadinessFailure(
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

function searchMaintenanceViewer(organizationId?: string): AuthorizedViewer {
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
