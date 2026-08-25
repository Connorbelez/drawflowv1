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


import {
  beginSearchGeneration,
  deferCutoverForSearchMaintenance,
  ensureSearchDrainScheduled,
  firstPendingSearchJob,
  markSearchJobComplete,
  processAuthorizedSearchJob,
  processCutoverSearchRebuild,
  queueSearchJob,
  recordSearchJobFailure,
  retryDelayForFailure,
  searchDrainError,
  searchJobAuthorization,
  searchMaintenanceViewer,
  searchReadinessFailure,
  searchStateForBuild,
  continueSearchDrainFromState,
  continueOrFinalizeSearchDrain,
} from "./build_collaboration_search_maintenance/helpers";

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
