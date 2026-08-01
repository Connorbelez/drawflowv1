import { v } from "convex/values";

import { internal } from "./_generated/api";
import type { ActiveBuildAuthorization } from "./activeBuildAccess";
import { authorizeActiveBuildAccessForViewer } from "./activeBuildAccess";
import type { AuthorizedViewer } from "./authz";
import {
  type BuildCollaborationSearchOwner,
  materializeBuildCollaborationSearchReaderRecords,
  materializeBuildCollaborationSearchTierRecords,
} from "./build_collaboration_search_index";
import { buildCollaborationSearchReaderFingerprint } from "./build_collaboration_search_readers";
import { internalMutation, internalQuery } from "./fluent";
import type { Doc, Id, MutationCtx } from "./types";

const RECORD_BATCH_SIZE = 50;
const ENUMERATION_BATCH_SIZE = 20;

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
    const [queued, running] = await Promise.all([
      ctx.db
        .query("buildCollaborationSearchJobs")
        .withIndex("by_buildId_and_status", (query) =>
          query.eq("buildId", args.buildId).eq("status", "queued")
        )
        .first(),
      ctx.db
        .query("buildCollaborationSearchJobs")
        .withIndex("by_buildId_and_status", (query) =>
          query.eq("buildId", args.buildId).eq("status", "running")
        )
        .first(),
    ]);
    if (queued || running) {
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
    const [queued, running] = await Promise.all([
      ctx.db
        .query("buildCollaborationSearchJobs")
        .withIndex("by_buildId_and_status", (query) =>
          query.eq("buildId", args.buildId).eq("status", "queued")
        )
        .first(),
      ctx.db
        .query("buildCollaborationSearchJobs")
        .withIndex("by_buildId_and_status", (query) =>
          query.eq("buildId", args.buildId).eq("status", "running")
        )
        .first(),
    ]);
    const readerFingerprint = await buildCollaborationSearchReaderFingerprint(
      ctx,
      authorization
    );
    return {
      generation: state?.generation ?? 0,
      hasPendingJobs: Boolean(queued || running),
      readerFingerprintCurrent:
        Boolean(state?.readerFingerprint) &&
        state?.readerFingerprint === readerFingerprint,
      status: state?.status ?? "missing",
    };
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
      cursor: undefined,
      candidateOffset: undefined,
      generation,
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

export const processBuildCollaborationSearchJob = internalMutation
  .input({ jobId: v.id("buildCollaborationSearchJobs") })
  .returns(v.null())
  .handler(async (ctx, args) => {
    const job = await ctx.db.get(args.jobId);
    if (!job || job.status === "complete") {
      return null;
    }
    if (job.status === "queued") {
      await ctx.db.patch(job._id, { status: "running", updatedAt: Date.now() });
    }
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
    await materializeBuildCollaborationSearchTierRecords(ctx, {
      authorization,
      jobId: job._id,
      owner,
      postId: requirePostId(job),
    });
    await ctx.db.patch(job._id, {
      phase: "readers",
      candidateOffset: 0,
      readerOffset: 0,
      updatedAt: Date.now(),
    });
    await scheduleSearchJob(ctx, job._id);
    return;
  }
  if (job.phase === "readers") {
    const page = await materializeBuildCollaborationSearchReaderRecords(ctx, {
      authorization,
      candidateOffset: job.candidateOffset ?? 0,
      jobId: job._id,
      owner,
      postId: requirePostId(job),
      readerOffset: job.readerOffset ?? 0,
    });
    await ctx.db.patch(job._id, {
      candidateOffset: page.nextCandidateOffset,
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
  const [queued, running] = await Promise.all([
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
  ]);
  if (queued || (running && running._id !== job._id)) {
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
    for (const status of ["queued", "running"] as const) {
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
  for (const status of ["queued", "running"] as const) {
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
  await ctx.scheduler.runAfter(
    0,
    internal.build_collaboration_search_maintenance
      .processBuildCollaborationSearchJob,
    { jobId }
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
