import { v } from "convex/values";

import { internal } from "./_generated/api";
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
const SEARCH_JOB_LEASE_MS = 60_000;
const SEARCH_JOB_RETRY_BASE_MS = 1000;
const SEARCH_JOB_MAX_RETRY_MS = 60_000;
const MAX_SEARCH_JOB_ERROR_LENGTH = 500;
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
  return await queueSearchJob(ctx, {
    authorization: input.authorization,
    ownerId: input.owner.id,
    ownerKind: input.owner.kind,
    phase: "retire",
    postId: input.postId,
    scope: "owner",
  });
}

export async function queueBuildCollaborationSearchPostTreeRebuild(
  ctx: MutationCtx,
  input: {
    authorization: ActiveBuildAuthorization;
    postId: Id<"buildCollaborationPosts">;
  }
) {
  await queueBuildCollaborationSearchOwnerRebuild(ctx, {
    authorization: input.authorization,
    owner: { id: input.postId, kind: "post" },
    postId: input.postId,
  });
  return await queueSearchJob(ctx, {
    authorization: input.authorization,
    phase: "enumerate_comments",
    postId: input.postId,
    scope: "post_tree",
  });
}

export async function queueBuildCollaborationSearchPostRemoval(
  ctx: MutationCtx,
  input: {
    authorization: ActiveBuildAuthorization;
    postId: Id<"buildCollaborationPosts">;
  }
) {
  return await queueSearchJob(ctx, {
    authorization: input.authorization,
    phase: "retire",
    postId: input.postId,
    scope: "post",
  });
}

export async function queueBuildCollaborationSearchBuildRebuild(
  ctx: MutationCtx,
  input: { authorization: ActiveBuildAuthorization }
) {
  return await queueSearchJob(ctx, {
    authorization: input.authorization,
    phase: "enumerate_posts",
    scope: "build",
  });
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
      if (!pending.leaseExpiresAt || pending.leaseExpiresAt <= Date.now()) {
        await scheduleSearchJob(ctx, pending._id);
      }
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

async function queueSearchJob(
  ctx: MutationCtx,
  input: {
    authorization: ActiveBuildAuthorization;
    ownerId?: string;
    ownerKind?: BuildCollaborationSearchOwner["kind"];
    phase: Doc<"buildCollaborationSearchJobs">["phase"];
    postId?: Id<"buildCollaborationPosts">;
    scope: Doc<"buildCollaborationSearchJobs">["scope"];
  }
) {
  const now = Date.now();
  const state = await ctx.db
    .query("buildCollaborationSearchStates")
    .withIndex("by_buildId", (query) =>
      query.eq("buildId", input.authorization.build._id)
    )
    .unique();
  const generation = (state?.generation ?? 0) + 1;
  if (state) {
    await ctx.db.patch(state._id, {
      generation,
      readyAt: undefined,
      readerFingerprint: undefined,
      requestedAt: now,
      status: "building",
      targetReaderFingerprint:
        state.status === "building" ? state.targetReaderFingerprint : undefined,
      updatedAt: now,
    });
  } else {
    await ctx.db.insert("buildCollaborationSearchStates", {
      brokerageId: input.authorization.brokerage._id,
      buildId: input.authorization.build._id,
      generation,
      organizationId: input.authorization.organizationId,
      requestedAt: now,
      status: "building",
      updatedAt: now,
    });
  }
  const reusableJob = await findReusableSearchJob(ctx, input);
  if (reusableJob) {
    await ctx.db.patch(reusableJob._id, {
      candidateCursor: undefined,
      cursor: undefined,
      candidateOffset: undefined,
      candidatePhase: undefined,
      failureCount: 0,
      generation,
      lastError: undefined,
      lastScheduledAt: undefined,
      leaseExpiresAt: undefined,
      ownerId: input.ownerId,
      ownerKind: input.ownerKind,
      phase: input.phase,
      postId: input.postId,
      readerOffset: undefined,
      status: "queued",
      updatedAt: now,
    });
    await scheduleSearchJob(ctx, reusableJob._id);
    return reusableJob._id;
  }
  const jobId = await ctx.db.insert("buildCollaborationSearchJobs", {
    brokerageId: input.authorization.brokerage._id,
    buildId: input.authorization.build._id,
    createdAt: now,
    failureCount: 0,
    generation,
    organizationId: input.authorization.organizationId,
    ownerId: input.ownerId,
    ownerKind: input.ownerKind,
    phase: input.phase,
    postId: input.postId,
    scope: input.scope,
    status: "queued",
    updatedAt: now,
  });
  await scheduleSearchJob(ctx, jobId);
  return jobId;
}

export const executeBuildCollaborationSearchJob = internalAction
  .input({ jobId: v.id("buildCollaborationSearchJobs") })
  .returns(v.null())
  .handler(async (ctx, args) => {
    try {
      await ctx.runMutation(
        internal.build_collaboration_search_maintenance
          .processBuildCollaborationSearchJob,
        args
      );
    } catch (error) {
      await recordSearchJobFailure(ctx, args.jobId, error);
    }
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
    const retryDelay = Math.min(
      SEARCH_JOB_RETRY_BASE_MS * 2 ** Math.min(failureCount - 1, 10),
      SEARCH_JOB_MAX_RETRY_MS
    );
    const leaseExpiresAt = now + retryDelay;
    await ctx.db.patch(job._id, {
      failureCount,
      lastError: args.error.slice(0, MAX_SEARCH_JOB_ERROR_LENGTH),
      leaseExpiresAt,
      status: "failed",
      updatedAt: now,
    });
    await ctx.scheduler.runAfter(
      retryDelay,
      internal.build_collaboration_search_maintenance
        .recoverBuildCollaborationSearchJob,
      { expectedLeaseExpiresAt: leaseExpiresAt, jobId: job._id }
    );
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
    await scheduleSearchJob(ctx, job._id);
    return null;
  })
  .internal();

export const processBuildCollaborationSearchJob = internalMutation
  .input({ jobId: v.id("buildCollaborationSearchJobs") })
  .returns(v.null())
  .handler(async (ctx, args) => {
    const job = await ctx.db.get(args.jobId);
    if (!job || job.status === "complete") {
      return null;
    }
    await ctx.db.patch(job._id, { status: "running", updatedAt: Date.now() });
    const authorization = await searchJobAuthorization(ctx, job);
    if (!authorization) {
      await markSearchJobComplete(ctx, job);
      return null;
    }
    await captureSearchTargetFingerprint(ctx, authorization);
    await processAuthorizedSearchJob(ctx, authorization, job);
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
      await scheduleSearchJob(ctx, job._id);
      return;
    }
    if (job.scope === "post") {
      await completeSearchJob(ctx, authorization, job);
      return;
    }
    await advanceSearchJob(ctx, job, "tier");
    return;
  }
  const owner = requireOwner(job);
  if (job.phase === "tier") {
    await ctx.db.patch(job._id, {
      candidateCursor: null,
      candidatePhase: "base",
      phase: "readers",
      readerOffset: 0,
      updatedAt: Date.now(),
    });
    await scheduleSearchJob(ctx, job._id);
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
    await ctx.db.patch(job._id, {
      candidateCursor: page.nextCandidateCursor,
      candidatePhase: page.nextCandidatePhase,
      phase: page.done ? "activate" : "readers",
      readerOffset: page.nextReaderOffset,
      updatedAt: Date.now(),
    });
    await scheduleSearchJob(ctx, job._id);
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
      await scheduleSearchJob(ctx, job._id);
      return;
    }
    await completeSearchJob(ctx, authorization, job);
    return;
  }
  await completeSearchJob(ctx, authorization, job);
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
      ownerId: post._id,
      ownerKind: "post",
      phase: "retire",
      postId: post._id,
      scope: "owner",
    });
    await queueSearchJob(ctx, {
      authorization,
      phase: "enumerate_comments",
      postId: post._id,
      scope: "post_tree",
    });
  }
  if (page.isDone) {
    await completeSearchJob(ctx, authorization, job);
    return;
  }
  await ctx.db.patch(job._id, {
    cursor: page.continueCursor,
    updatedAt: Date.now(),
  });
  await scheduleSearchJob(ctx, job._id);
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
        ownerId: comment._id,
        ownerKind: "comment",
        phase: "retire",
        postId,
        scope: "owner",
      });
    }
    if (!page.isDone) {
      await ctx.db.patch(job._id, {
        cursor: page.continueCursor,
        updatedAt: Date.now(),
      });
      await scheduleSearchJob(ctx, job._id);
      return;
    }
    await ctx.db.patch(job._id, {
      cursor: null,
      phase: "enumerate_actions",
      updatedAt: Date.now(),
    });
    await scheduleSearchJob(ctx, job._id);
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
      ownerId: item._id,
      ownerKind: "actionItem",
      phase: "retire",
      postId,
      scope: "owner",
    });
  }
  if (!page.isDone) {
    await ctx.db.patch(job._id, {
      cursor: page.continueCursor,
      updatedAt: Date.now(),
    });
    await scheduleSearchJob(ctx, job._id);
    return;
  }
  await completeSearchJob(ctx, authorization, job);
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

async function completeSearchJob(
  ctx: MutationCtx,
  authorization: ActiveBuildAuthorization,
  job: Doc<"buildCollaborationSearchJobs">
) {
  const now = Date.now();
  await markSearchJobComplete(ctx, job);
  const [queued, running, failed] = await Promise.all([
    ctx.db
      .query("buildCollaborationSearchJobs")
      .withIndex("by_buildId_and_status", (query) =>
        query.eq("buildId", job.buildId).eq("status", "queued")
      )
      .first(),
    ctx.db
      .query("buildCollaborationSearchJobs")
      .withIndex("by_buildId_and_status", (query) =>
        query.eq("buildId", job.buildId).eq("status", "running")
      )
      .first(),
    ctx.db
      .query("buildCollaborationSearchJobs")
      .withIndex("by_buildId_and_status", (query) =>
        query.eq("buildId", job.buildId).eq("status", "failed")
      )
      .first(),
  ]);
  if (queued || failed || (running && running._id !== job._id)) {
    return;
  }
  const state = await ctx.db
    .query("buildCollaborationSearchStates")
    .withIndex("by_buildId", (query) => query.eq("buildId", job.buildId))
    .unique();
  if (state) {
    const readerFingerprint = await buildCollaborationSearchReaderFingerprint(
      ctx,
      authorization
    );
    if (state.targetReaderFingerprint !== readerFingerprint) {
      // A reader can join while older owner jobs are still draining. Advance
      // the target before queuing the replacement generation; retaining the
      // stale target makes every completed replacement enqueue another build
      // rebuild forever.
      await ctx.db.patch(state._id, {
        targetReaderFingerprint: readerFingerprint,
        updatedAt: now,
      });
      await queueBuildCollaborationSearchBuildRebuild(ctx, { authorization });
      return;
    }
    await ctx.db.patch(state._id, {
      readyAt: now,
      readerFingerprint,
      status: "ready",
      targetReaderFingerprint: undefined,
      updatedAt: now,
    });
  }
}

async function markSearchJobComplete(
  ctx: MutationCtx,
  job: Doc<"buildCollaborationSearchJobs">
) {
  await ctx.db.patch(job._id, {
    leaseExpiresAt: undefined,
    phase: "complete",
    status: "complete",
    updatedAt: Date.now(),
  });
}

async function captureSearchTargetFingerprint(
  ctx: MutationCtx,
  authorization: ActiveBuildAuthorization
) {
  const state = await ctx.db
    .query("buildCollaborationSearchStates")
    .withIndex("by_buildId", (query) =>
      query.eq("buildId", authorization.build._id)
    )
    .unique();
  if (state && !state.targetReaderFingerprint) {
    await ctx.db.patch(state._id, {
      targetReaderFingerprint: await buildCollaborationSearchReaderFingerprint(
        ctx,
        authorization
      ),
      updatedAt: Date.now(),
    });
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

async function advanceSearchJob(
  ctx: MutationCtx,
  job: Doc<"buildCollaborationSearchJobs">,
  phase: Doc<"buildCollaborationSearchJobs">["phase"]
) {
  await ctx.db.patch(job._id, { phase, updatedAt: Date.now() });
  await scheduleSearchJob(ctx, job._id);
}

async function scheduleSearchJob(
  ctx: MutationCtx,
  jobId: Id<"buildCollaborationSearchJobs">
) {
  const now = Date.now();
  const leaseExpiresAt = now + SEARCH_JOB_LEASE_MS;
  await ctx.db.patch(jobId, {
    lastScheduledAt: now,
    leaseExpiresAt,
    status: "queued",
    updatedAt: now,
  });
  await ctx.scheduler.runAfter(
    0,
    internal.build_collaboration_search_maintenance
      .executeBuildCollaborationSearchJob,
    { jobId }
  );
  await ctx.scheduler.runAfter(
    SEARCH_JOB_LEASE_MS,
    internal.build_collaboration_search_maintenance
      .recoverBuildCollaborationSearchJob,
    { expectedLeaseExpiresAt: leaseExpiresAt, jobId }
  );
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
