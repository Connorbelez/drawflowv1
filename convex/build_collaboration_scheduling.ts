import { v } from "convex/values";

import { internal } from "./_generated/api";
import { authenticatedMutation, authenticatedQuery } from "./authz";
import type { ScheduleBuildCollaborationPublication } from "./build_collaboration_publication_lifecycle";
import {
  approveAndScheduleBuildCollaborationDraft as approveAndScheduleBuildCollaborationDraftApplication,
  pauseScheduledBuildCollaborationDraft as pauseScheduledBuildCollaborationDraftApplication,
  publishScheduledBuildCollaborationDraft as publishScheduledBuildCollaborationDraftApplication,
  recordRetryableScheduledBuildCollaborationFailure as recordRetryableScheduledBuildCollaborationFailureApplication,
} from "./build_collaboration_publication_lifecycle";
import { authorizeActiveBuildCollaborationAccess } from "./build_collaboration_rollout";
import {
  reconcileDueDrawSystemPostForBuildHandler,
  reconcileDueMilestoneSystemPostForBuildHandler,
  scheduleCurrentDrawSystemPostActivations,
  scheduleCurrentMilestoneSystemPostActivations,
} from "./build_collaboration_scheduling/helpers";
import { classifyScheduledPublicationFailure } from "./build_collaboration_scheduling_errors";
import {
  addBuildLocalDays,
  buildLocalMidnightUtc,
  ensureDrawSystemPost,
  ensureMilestoneSystemPost,
} from "./build_collaboration_system_posts";
import { internalAction, internalMutation } from "./fluent";
import type { Id, MutationCtx } from "./types";

// biome-ignore lint/performance/noBarrelFile: Compatibility exports preserve existing scheduling function references.
export { revalidateMaterialBoundary } from "./build_collaboration_publication_lifecycle";
export {
  scheduleCurrentDrawSystemPostActivations,
  scheduleCurrentMilestoneSystemPostActivations,
} from "./build_collaboration_scheduling/helpers";

const SCHEDULE_BATCH_SIZE = 25;
const MILESTONE_RECONCILIATION_BATCH_SIZE = 25;
// Convex rejects runAt timestamps more than five years in either direction.
// Historical or far-future plans outside that durable horizon remain eligible
// for the bounded recovery reconciliation instead of blocking a Build write.
const MAX_MILESTONE_SCHEDULE_HORIZON_MS = 5 * 365 * 24 * 60 * 60 * 1000;
const TERMINAL_DRAW_STATUSES = new Set([
  "rejected",
  "withdrawn",
  "cancelled",
  "released",
]);
type ReconciliationPhase = "active" | "future_start";

function decodeReconciliationCursor(cursor: string | null | undefined): {
  cursor: string | null;
  phase: ReconciliationPhase;
} {
  if (!cursor) {
    return {
      cursor: null as string | null,
      phase: "active" as ReconciliationPhase,
    };
  }
  try {
    const parsed = JSON.parse(cursor) as {
      cursor?: unknown;
      phase?: unknown;
    };
    if (
      (parsed.phase === "active" || parsed.phase === "future_start") &&
      (parsed.cursor === null || typeof parsed.cursor === "string")
    ) {
      return {
        cursor: parsed.cursor,
        phase: parsed.phase,
      };
    }
  } catch {
    // Cursors from a prior implementation are treated as the first active
    // status page instead of failing the recovery cron.
  }
  return { cursor: null, phase: "active" as ReconciliationPhase };
}

function encodeReconciliationCursor(
  phase: ReconciliationPhase,
  cursor: string | null
) {
  return JSON.stringify({ cursor, phase });
}

async function cancelScheduledActivation(
  ctx: MutationCtx,
  jobId: string | undefined
) {
  if (!jobId) {
    return;
  }
  try {
    const scheduledJob = await ctx.db.system.get(
      "_scheduled_functions",
      jobId as Id<"_scheduled_functions">
    );
    // A callback that is already in progress owns its scheduler row and will
    // mark it successful/failed when it completes. Cancelling that row races
    // the callback finalizer and leaves Convex's scheduler state inconsistent.
    // Only pending jobs need cancellation before a replacement is queued.
    if (!scheduledJob || scheduledJob.state.kind !== "pending") {
      return;
    }
    await ctx.scheduler.cancel(jobId as Id<"_scheduled_functions">);
  } catch {
    // A completed/missing scheduler row is already safe to replace.
  }
}

export const getBuildCollaborationSchedulingCapabilities = authenticatedQuery
  .input({
    buildId: v.id("activeBuilds"),
    organizationId: v.string(),
  })
  .returns(
    v.object({
      canSchedule: v.boolean(),
      role: v.string(),
    })
  )
  .handler(async (ctx, args) => {
    const authorization = await authorizeActiveBuildCollaborationAccess(
      ctx,
      args
    );
    return {
      canSchedule:
        authorization.viewer.actorKind === "human" &&
        authorization.effectiveRole.tier >= 3,
      role: authorization.effectiveRole.role,
    };
  })
  .public();

export const approveAndScheduleBuildCollaborationDraft = authenticatedMutation
  .input({
    buildId: v.id("activeBuilds"),
    draftId: v.id("buildCollaborationDrafts"),
    expectedRevision: v.number(),
    organizationId: v.string(),
    scheduledFor: v.number(),
  })
  .returns(v.id("buildCollaborationPublicationApprovals"))
  .handler(
    async (
      ctx,
      args
    ): Promise<Id<"buildCollaborationPublicationApprovals">> => {
      const authorization = await authorizeActiveBuildCollaborationAccess(
        ctx,
        args
      );
      const schedulePublication: ScheduleBuildCollaborationPublication = (
        scheduledFor,
        approvalId
      ) =>
        ctx.scheduler.runAt(
          scheduledFor,
          internal.build_collaboration_scheduling
            .executeScheduledBuildCollaborationPublication,
          { approvalId }
        );
      return await approveAndScheduleBuildCollaborationDraftApplication(ctx, {
        authorization,
        draftId: args.draftId,
        expectedRevision: args.expectedRevision,
        now: Date.now(),
        scheduledFor: args.scheduledFor,
        schedulePublication,
      });
    }
  )
  .public();

export const executeScheduledBuildCollaborationPublication = internalAction
  .input({
    approvalId: v.id("buildCollaborationPublicationApprovals"),
  })
  .returns(v.null())
  .handler(async (ctx, args) => {
    try {
      await ctx.runMutation(
        internal.build_collaboration_scheduling
          .publishScheduledBuildCollaborationDraft,
        args
      );
    } catch (error) {
      const failure = classifyScheduledPublicationFailure(error);
      if (failure.kind === "conflict") {
        await ctx.runMutation(
          internal.build_collaboration_scheduling
            .pauseScheduledBuildCollaborationDraft,
          {
            approvalId: args.approvalId,
            conflictReason: failure.message,
          }
        );
      } else {
        await ctx.runMutation(
          internal.build_collaboration_scheduling
            .recordRetryableScheduledBuildCollaborationFailure,
          {
            approvalId: args.approvalId,
            failureReason: failure.message,
          }
        );
      }
    }
    return null;
  })
  .internal();

export const recordRetryableScheduledBuildCollaborationFailure =
  internalMutation
    .input({
      approvalId: v.id("buildCollaborationPublicationApprovals"),
      failureReason: v.string(),
    })
    .returns(v.null())
    .handler((ctx, args) =>
      recordRetryableScheduledBuildCollaborationFailureApplication(ctx, {
        approvalId: args.approvalId,
        failureReason: args.failureReason,
        now: Date.now(),
      })
    )
    .internal();

export const processDueBuildCollaborationScheduledPublications =
  internalMutation
    .input({
      asOf: v.optional(v.number()),
      cursor: v.optional(v.union(v.string(), v.null())),
    })
    .returns(v.null())
    .handler(async (ctx, args) => {
      const asOf = args.asOf ?? Date.now();
      const page = await ctx.db
        .query("buildCollaborationPublicationApprovals")
        .withIndex("by_state_and_scheduledFor", (query) =>
          query.eq("state", "approved").lte("scheduledFor", asOf)
        )
        .paginate({
          cursor: args.cursor ?? null,
          numItems: SCHEDULE_BATCH_SIZE,
        });
      for (const approval of page.page) {
        await ctx.scheduler.runAfter(
          0,
          internal.build_collaboration_scheduling
            .executeScheduledBuildCollaborationPublication,
          { approvalId: approval._id }
        );
      }
      if (!page.isDone) {
        await ctx.scheduler.runAfter(
          0,
          internal.build_collaboration_scheduling
            .processDueBuildCollaborationScheduledPublications,
          { asOf, cursor: page.continueCursor }
        );
      }
      return null;
    })
    .internal();

/**
 * Queue one durable activation per canonical Milestone using the Build-local
 * midnight instant. This is the normal activation path; the bounded cron
 * below remains a retry/recovery reconciliation for missed scheduler work.
 */

export const scheduleCurrentDrawSystemPostActivationsInternal = internalMutation
  .input({
    buildId: v.id("activeBuilds"),
    cursor: v.optional(v.union(v.string(), v.null())),
    now: v.optional(v.number()),
  })
  .returns(v.null())
  .handler(async (ctx, args) => {
    const build = await ctx.db.get(args.buildId);
    if (build) {
      await scheduleCurrentDrawSystemPostActivations(ctx, {
        build,
        cursor: args.cursor,
        now: args.now,
      });
    }
    return null;
  })
  .internal();

/** Schedule current Milestones for a supported Build after a repair/update. */
export const scheduleCurrentMilestoneSystemPostActivationsInternal =
  internalMutation
    .input({
      buildId: v.id("activeBuilds"),
      cursor: v.optional(v.union(v.string(), v.null())),
      now: v.optional(v.number()),
    })
    .returns(v.null())
    .handler(async (ctx, args) => {
      const build = await ctx.db.get(args.buildId);
      if (build) {
        await scheduleCurrentMilestoneSystemPostActivations(ctx, {
          build,
          cursor: args.cursor,
          now: args.now,
        });
      }
      return null;
    })
    .internal();

/**
 * Execute one exact scheduled activation. The Build and Milestone are
 * reloaded at execution time so date/timezone repairs cannot activate stale
 * projections early; a moved-later due instant gets a fresh durable job.
 */
export const executeScheduledMilestoneSystemPostActivation = internalMutation
  .input({
    buildId: v.id("activeBuilds"),
    milestoneId: v.id("buildMilestones"),
    scheduledFor: v.number(),
  })
  .returns(v.null())
  .handler(async (ctx, args) => {
    const [build, milestone] = await Promise.all([
      ctx.db.get(args.buildId),
      ctx.db.get(args.milestoneId),
    ]);
    if (!build) {
      return null;
    }
    if (!milestone) {
      return null;
    }
    if (
      (build.status !== "active" && build.status !== "future_start") ||
      milestone.buildId !== build._id ||
      milestone.organizationId !== build.organizationId ||
      milestone.brokerageId !== build.brokerageId ||
      milestone.planningState === "superseded" ||
      !build.timezone
    ) {
      return null;
    }

    const now = Date.now();
    let currentDueAt: number;
    try {
      const plannedDate = addBuildLocalDays(
        build.startDate,
        milestone.dayStart
      );
      currentDueAt = buildLocalMidnightUtc(plannedDate, build.timezone);
    } catch {
      return null;
    }
    if (currentDueAt > now) {
      if (currentDueAt <= now + MAX_MILESTONE_SCHEDULE_HORIZON_MS) {
        await cancelScheduledActivation(
          ctx,
          milestone.scheduledActivationJobId
        );
        const scheduledJobId = await ctx.scheduler.runAt(
          currentDueAt,
          internal.build_collaboration_scheduling
            .executeScheduledMilestoneSystemPostActivation,
          {
            buildId: build._id,
            milestoneId: milestone._id,
            scheduledFor: currentDueAt,
          }
        );
        await ctx.db.patch(milestone._id, {
          scheduledActivationJobId: String(scheduledJobId),
          updatedAt: now,
        });
      }
      return null;
    }

    await ensureMilestoneSystemPost(ctx, {
      actor: {
        roles: ["system"],
        workosUserId: "system:build-collaboration-scheduler",
      },
      build,
      milestone,
      activationReason: "scheduled",
      now,
    });
    return null;
  })
  .internal();

/** Execute one exact scheduled Draw activation without touching Draw state. */
export const executeScheduledDrawSystemPostActivation = internalMutation
  .input({
    buildId: v.id("activeBuilds"),
    plannedDrawId: v.id("plannedDrawScheduleRows"),
    scheduledFor: v.number(),
  })
  .returns(v.null())
  .handler(async (ctx, args) => {
    const [build, plannedDraw] = await Promise.all([
      ctx.db.get(args.buildId),
      ctx.db.get(args.plannedDrawId),
    ]);
    if (!build) {
      return null;
    }
    if (!plannedDraw) {
      return null;
    }
    if (
      (build.status !== "active" && build.status !== "future_start") ||
      plannedDraw.buildId !== build._id ||
      plannedDraw.organizationId !== build.organizationId ||
      plannedDraw.brokerageId !== build.brokerageId ||
      TERMINAL_DRAW_STATUSES.has(plannedDraw.status) ||
      !build.timezone
    ) {
      return null;
    }
    const now = Date.now();
    let currentDueAt: number;
    try {
      const plannedDate = addBuildLocalDays(
        build.startDate,
        plannedDraw.timingDay
      );
      currentDueAt = buildLocalMidnightUtc(plannedDate, build.timezone);
    } catch {
      return null;
    }
    if (currentDueAt > now) {
      if (currentDueAt <= now + MAX_MILESTONE_SCHEDULE_HORIZON_MS) {
        await cancelScheduledActivation(
          ctx,
          plannedDraw.scheduledActivationJobId
        );
        const scheduledJobId = await ctx.scheduler.runAt(
          currentDueAt,
          internal.build_collaboration_scheduling
            .executeScheduledDrawSystemPostActivation,
          {
            buildId: build._id,
            plannedDrawId: plannedDraw._id,
            scheduledFor: currentDueAt,
          }
        );
        await ctx.db.patch(plannedDraw._id, {
          scheduledActivationJobId: String(scheduledJobId),
          updatedAt: now,
        });
      }
      return null;
    }
    await ensureDrawSystemPost(ctx, {
      actor: {
        roles: ["system"],
        workosUserId: "system:build-collaboration-scheduler",
      },
      activationReason: "scheduled",
      build,
      now,
      plannedDraw,
    });
    return null;
  })
  .internal();

/**
 * Reconcile the canonical Milestone System Post projection at least once per
 * Build-local calendar day. This is deliberately a bounded, retry-safe pass:
 * it only materializes projections and audit/outbox markers and never writes
 * canonical Milestone or Sub-milestone start state.
 */
export const reconcileDueMilestoneSystemPosts = internalMutation
  .input({
    asOf: v.optional(v.number()),
    cursor: v.optional(v.union(v.string(), v.null())),
  })
  .returns(v.null())
  .handler(async (ctx, args) => {
    const asOf = args.asOf ?? Date.now();
    const state = decodeReconciliationCursor(args.cursor);
    const page = await ctx.db
      .query("activeBuilds")
      .withIndex("by_status_and_timezone", (query) =>
        query.eq("status", state.phase)
      )
      .paginate({
        cursor: state.cursor,
        numItems: MILESTONE_RECONCILIATION_BATCH_SIZE,
      });

    for (const build of page.page) {
      if (!(build.status === "active" || build.status === "future_start")) {
        continue;
      }
      await ctx.scheduler.runAfter(
        0,
        internal.build_collaboration_scheduling
          .reconcileDueMilestoneSystemPostsForBuild,
        { asOf, buildId: build._id }
      );
    }

    const continuation = page.isDone
      ? state.phase === "active"
        ? encodeReconciliationCursor("future_start", null)
        : null
      : encodeReconciliationCursor(state.phase, page.continueCursor);
    if (continuation) {
      await ctx.scheduler.runAfter(
        0,
        internal.build_collaboration_scheduling
          .reconcileDueMilestoneSystemPosts,
        { asOf, cursor: continuation }
      );
    }
    return null;
  })
  .internal();

export const reconcileDueMilestoneSystemPostsForBuild = internalMutation
  .input({
    asOf: v.number(),
    buildId: v.id("activeBuilds"),
    cursor: v.optional(v.union(v.string(), v.null())),
  })
  .returns(v.null())
  .handler(async (ctx, args) => {
    await reconcileDueMilestoneSystemPostForBuildHandler(ctx, args);
    return null;
  })
  .internal();
export const reconcileDueDrawSystemPosts = internalMutation
  .input({
    asOf: v.optional(v.number()),
    cursor: v.optional(v.union(v.string(), v.null())),
  })
  .returns(v.null())
  .handler(async (ctx, args) => {
    const asOf = args.asOf ?? Date.now();
    const state = decodeReconciliationCursor(args.cursor);
    const page = await ctx.db
      .query("activeBuilds")
      .withIndex("by_status_and_timezone", (query) =>
        query.eq("status", state.phase)
      )
      .paginate({
        cursor: state.cursor,
        numItems: MILESTONE_RECONCILIATION_BATCH_SIZE,
      });
    for (const build of page.page) {
      if (
        (build.status !== "active" && build.status !== "future_start") ||
        !build.timezone
      ) {
        continue;
      }
      await ctx.scheduler.runAfter(
        0,
        internal.build_collaboration_scheduling
          .reconcileDueDrawSystemPostsForBuild,
        { asOf, buildId: build._id }
      );
    }
    const continuation = page.isDone
      ? state.phase === "active"
        ? encodeReconciliationCursor("future_start", null)
        : null
      : encodeReconciliationCursor(state.phase, page.continueCursor);
    if (continuation) {
      await ctx.scheduler.runAfter(
        0,
        internal.build_collaboration_scheduling.reconcileDueDrawSystemPosts,
        { asOf, cursor: continuation }
      );
    }
    return null;
  })
  .internal();

export const reconcileDueDrawSystemPostsForBuild = internalMutation
  .input({
    asOf: v.number(),
    buildId: v.id("activeBuilds"),
    cursor: v.optional(v.union(v.string(), v.null())),
  })
  .returns(v.null())
  .handler(async (ctx, args) => {
    await reconcileDueDrawSystemPostForBuildHandler(ctx, args);
    return null;
  })
  .internal();
export const publishScheduledBuildCollaborationDraft = internalMutation
  .input({
    approvalId: v.id("buildCollaborationPublicationApprovals"),
  })
  .returns(v.union(v.id("buildCollaborationPosts"), v.null()))
  .handler((ctx, args) =>
    publishScheduledBuildCollaborationDraftApplication(ctx, {
      approvalId: args.approvalId,
      now: Date.now(),
    })
  )
  .internal();

export const pauseScheduledBuildCollaborationDraft = internalMutation
  .input({
    approvalId: v.id("buildCollaborationPublicationApprovals"),
    conflictReason: v.string(),
  })
  .returns(v.null())
  .handler((ctx, args) =>
    pauseScheduledBuildCollaborationDraftApplication(ctx, {
      approvalId: args.approvalId,
      conflictReason: args.conflictReason,
      now: Date.now(),
    })
  )
  .internal();
