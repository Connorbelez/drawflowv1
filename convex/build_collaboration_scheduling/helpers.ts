import { internal } from "../_generated/api";
import {
  addBuildLocalDays,
  buildLocalDateAt,
  buildLocalMidnightUtc,
  ensureDrawSystemPost,
  ensureMilestoneSystemPost,
} from "../build_collaboration_system_posts";
import type { Doc, Id, MutationCtx } from "../types";

const SCHEDULE_BATCH_SIZE = 25;
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

async function clearMilestoneScheduledActivation(
  ctx: MutationCtx,
  milestone: Doc<"buildMilestones">,
  now: number
) {
  if (!milestone.scheduledActivationJobId) {
    return;
  }
  await cancelScheduledActivation(ctx, milestone.scheduledActivationJobId);
  await ctx.db.patch(milestone._id, {
    scheduledActivationJobId: undefined,
    updatedAt: now,
  });
}

async function clearDrawScheduledActivation(
  ctx: MutationCtx,
  plannedDraw: Doc<"plannedDrawScheduleRows">,
  now: number
) {
  if (!plannedDraw.scheduledActivationJobId) {
    return;
  }
  await cancelScheduledActivation(ctx, plannedDraw.scheduledActivationJobId);
  await ctx.db.patch(plannedDraw._id, {
    scheduledActivationJobId: undefined,
    updatedAt: now,
  });
}

export async function scheduleCurrentMilestoneSystemPostActivations(
  ctx: MutationCtx,
  input: {
    build: Doc<"activeBuilds">;
    cursor?: string | null;
    now?: number;
  }
) {
  const { build } = input;
  if (!(build.status === "active" || build.status === "future_start")) {
    return;
  }
  if (!build.timezone) {
    // Historical Builds without an explicit canonical timezone stay unknown
    // until a supported repair supplies one.
    return;
  }
  const now = input.now ?? Date.now();
  const page = await ctx.db
    .query("buildMilestones")
    .withIndex("by_build", (query) => query.eq("buildId", build._id))
    .paginate({ cursor: input.cursor ?? null, numItems: 500 });

  for (const milestone of page.page) {
    if (
      milestone.organizationId !== build.organizationId ||
      milestone.brokerageId !== build.brokerageId
    ) {
      continue;
    }
    if (milestone.planningState === "superseded") {
      await clearMilestoneScheduledActivation(ctx, milestone, now);
      continue;
    }
    let scheduledFor: number;
    try {
      const plannedDate = addBuildLocalDays(
        build.startDate,
        milestone.dayStart
      );
      scheduledFor = buildLocalMidnightUtc(plannedDate, build.timezone);
    } catch {
      // Invalid historical dates/timezones remain visible to reconciliation as
      // unknown rather than blocking a Build mutation transaction.
      await clearMilestoneScheduledActivation(ctx, milestone, now);
      continue;
    }

    // Keep the exact Build-local midnight instant. Plans outside Convex's
    // five-year runAt window remain for bounded recovery reconciliation.
    if (
      scheduledFor < now - MAX_MILESTONE_SCHEDULE_HORIZON_MS ||
      scheduledFor > now + MAX_MILESTONE_SCHEDULE_HORIZON_MS
    ) {
      await clearMilestoneScheduledActivation(ctx, milestone, now);
      continue;
    }
    await cancelScheduledActivation(ctx, milestone.scheduledActivationJobId);
    const scheduledJobId = await ctx.scheduler.runAt(
      scheduledFor,
      internal.build_collaboration_scheduling
        .executeScheduledMilestoneSystemPostActivation,
      {
        buildId: build._id,
        milestoneId: milestone._id,
        scheduledFor,
      }
    );
    await ctx.db.patch(milestone._id, {
      scheduledActivationJobId: String(scheduledJobId),
      updatedAt: now,
    });
  }

  if (!page.isDone) {
    await ctx.scheduler.runAfter(
      0,
      internal.build_collaboration_scheduling
        .scheduleCurrentMilestoneSystemPostActivationsInternal,
      {
        buildId: build._id,
        cursor: page.continueCursor,
        now,
      }
    );
  }
  if (input.cursor === undefined || input.cursor === null) {
    await ctx.scheduler.runAfter(
      0,
      internal.build_collaboration_scheduling
        .scheduleCurrentDrawSystemPostActivationsInternal,
      {
        buildId: build._id,
        cursor: null,
        now,
      }
    );
  }
}

/** Queue one durable activation per canonical planned Draw occurrence. */
export async function scheduleCurrentDrawSystemPostActivations(
  ctx: MutationCtx,
  input: {
    build: Doc<"activeBuilds">;
    cursor?: string | null;
    now?: number;
  }
) {
  const { build } = input;
  if (!(build.status === "active" || build.status === "future_start")) {
    return;
  }
  if (!build.timezone) {
    return;
  }
  const now = input.now ?? Date.now();
  const page = await ctx.db
    .query("plannedDrawScheduleRows")
    .withIndex("by_build_order", (query) => query.eq("buildId", build._id))
    .paginate({ cursor: input.cursor ?? null, numItems: 500 });
  for (const plannedDraw of page.page) {
    if (
      plannedDraw.organizationId !== build.organizationId ||
      plannedDraw.brokerageId !== build.brokerageId
    ) {
      continue;
    }
    if (TERMINAL_DRAW_STATUSES.has(plannedDraw.status)) {
      await clearDrawScheduledActivation(ctx, plannedDraw, now);
      continue;
    }
    let scheduledFor: number;
    try {
      const plannedDate = addBuildLocalDays(
        build.startDate,
        plannedDraw.timingDay
      );
      scheduledFor = buildLocalMidnightUtc(plannedDate, build.timezone);
    } catch {
      await clearDrawScheduledActivation(ctx, plannedDraw, now);
      continue;
    }
    if (
      scheduledFor < now - MAX_MILESTONE_SCHEDULE_HORIZON_MS ||
      scheduledFor > now + MAX_MILESTONE_SCHEDULE_HORIZON_MS
    ) {
      await clearDrawScheduledActivation(ctx, plannedDraw, now);
      continue;
    }
    await cancelScheduledActivation(ctx, plannedDraw.scheduledActivationJobId);
    const scheduledJobId = await ctx.scheduler.runAt(
      scheduledFor,
      internal.build_collaboration_scheduling
        .executeScheduledDrawSystemPostActivation,
      {
        buildId: build._id,
        plannedDrawId: plannedDraw._id,
        scheduledFor,
      }
    );
    await ctx.db.patch(plannedDraw._id, {
      scheduledActivationJobId: String(scheduledJobId),
      updatedAt: now,
    });
  }
  if (!page.isDone) {
    await ctx.scheduler.runAfter(
      0,
      internal.build_collaboration_scheduling
        .scheduleCurrentDrawSystemPostActivationsInternal,
      {
        buildId: build._id,
        cursor: page.continueCursor,
        now,
      }
    );
  }
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: This adapter preserves the bounded milestone reconciliation contract while delegating persistence to Convex.
export async function reconcileDueMilestoneSystemPostForBuildHandler(
  ctx: MutationCtx,
  args: { asOf: number; buildId: Id<"activeBuilds">; cursor?: string | null }
) {
  const build = await ctx.db.get(args.buildId);
  if (
    !(
      build &&
      (build.status === "active" || build.status === "future_start") &&
      build.timezone
    )
  ) {
    return null;
  }
  let localDate: string;
  try {
    localDate = buildLocalDateAt(args.asOf, build.timezone);
  } catch {
    return null;
  }
  const page = await ctx.db
    .query("buildMilestones")
    .withIndex("by_build", (query) => query.eq("buildId", build._id))
    .paginate({ cursor: args.cursor ?? null, numItems: 1 });
  for (const milestone of page.page) {
    if (
      milestone.organizationId !== build.organizationId ||
      milestone.brokerageId !== build.brokerageId ||
      milestone.planningState === "superseded"
    ) {
      continue;
    }
    let plannedMilestoneStartDate: string;
    try {
      plannedMilestoneStartDate = addBuildLocalDays(
        build.startDate,
        milestone.dayStart
      );
    } catch {
      continue;
    }
    if (localDate < plannedMilestoneStartDate) {
      continue;
    }
    const ensured = await ensureMilestoneSystemPost(ctx, {
      actor: {
        roles: ["system"],
        workosUserId: "system:build-collaboration-scheduler",
      },
      build,
      milestone,
      activationReason: "scheduled",
      now: args.asOf,
    });
    if (!ensured) {
      continue;
    }
    const generatedActionItems = await ctx.db
      .query("buildActionItems")
      .withIndex("by_originatingPostId_and_createdAt", (query) =>
        query.eq("originatingPostId", ensured.postId)
      )
      .collect();
    const actionItemBySubmilestone = new Map(
      generatedActionItems
        .filter(
          (actionItem) =>
            actionItem.systemMode === "generated_milestone_submilestone" &&
            actionItem.buildId === build._id &&
            actionItem.organizationId === build.organizationId &&
            actionItem.brokerageId === build.brokerageId &&
            actionItem.canonicalBuildMilestoneId === milestone._id &&
            actionItem.canonicalBuildSubmilestoneId !== undefined
        )
        .map((actionItem) => [
          actionItem.canonicalBuildSubmilestoneId,
          actionItem._id,
        ])
    );
    const submilestones = (
      await ctx.db
        .query("buildSubmilestones")
        .withIndex("by_milestone", (query) =>
          query.eq("buildMilestoneId", milestone._id)
        )
        .collect()
    ).filter(
      (submilestone) =>
        submilestone.buildId === build._id &&
        submilestone.organizationId === build.organizationId &&
        submilestone.brokerageId === build.brokerageId
    );
    for (const submilestone of submilestones) {
      if (submilestone.actualStartedAt !== undefined) {
        continue;
      }
      let plannedStartDate: string;
      try {
        plannedStartDate = addBuildLocalDays(
          build.startDate,
          submilestone.startDay ?? milestone.dayStart
        );
      } catch {
        continue;
      }
      if (localDate <= plannedStartDate) {
        continue;
      }
      const actionItemId = actionItemBySubmilestone.get(submilestone._id);
      if (!actionItemId) {
        continue;
      }
      const reconciliationKey = [
        "milestone-system",
        build._id,
        milestone._id,
        submilestone._id,
        "missed-start",
      ].join(":");
      const existing = await ctx.db
        .query("auditEvents")
        .withIndex("by_organizationId_and_reconciliationKey", (query) =>
          query
            .eq("organizationId", build.organizationId)
            .eq("reconciliationKey", reconciliationKey)
        )
        .first();
      if (existing) {
        continue;
      }
      await Promise.all([
        ctx.db.insert("auditEvents", {
          actorRoles: ["system"],
          actorWorkosUserId: "system:build-collaboration-scheduler",
          brokerageId: build.brokerageId,
          command: "reconcileDueMilestoneSystemPosts",
          createdAt: args.asOf,
          entityId: actionItemId,
          entityType: "buildActionItem",
          eventType: "build.collaboration.system_action_item.missed_start",
          newState: JSON.stringify({
            actionItemId,
            canonicalBuildMilestoneId: milestone._id,
            canonicalBuildSubmilestoneId: submilestone._id,
            column: "behind_schedule",
            plannedStartDate,
          }),
          organizationId: build.organizationId,
          reconciliationKey,
          reason:
            "The canonical Sub-milestone has no actual start after its Build-local planned start date; the projected Action Item column is derived from canonical state and is not persisted.",
          warnings: ["canonical_state_is_authoritative", "passive_projection"],
        }),
        ctx.db.insert("eventOutbox", {
          brokerageId: build.brokerageId,
          createdAt: args.asOf,
          eventType: "build.collaboration.system_action_item.missed_start",
          organizationId: build.organizationId,
          payloadPreview: JSON.stringify({
            actionItemId,
            canonicalBuildMilestoneId: milestone._id,
            canonicalBuildSubmilestoneId: submilestone._id,
            plannedStartDate,
            reconciliationKey,
          }),
          relatedEntityId: actionItemId,
          relatedEntityType: "buildActionItem",
          status: "pending",
        }),
      ]);
    }
  }
  if (!page.isDone) {
    await ctx.scheduler.runAfter(
      0,
      internal.build_collaboration_scheduling
        .reconcileDueMilestoneSystemPostsForBuild,
      {
        asOf: args.asOf,
        buildId: build._id,
        cursor: page.continueCursor,
      }
    );
  }
  return null;
}

export async function reconcileDueDrawSystemPostForBuildHandler(
  ctx: MutationCtx,
  args: { asOf: number; buildId: Id<"activeBuilds">; cursor?: string | null }
) {
  const build = await ctx.db.get(args.buildId);
  if (
    !(
      build &&
      (build.status === "active" || build.status === "future_start") &&
      build.timezone
    )
  ) {
    return null;
  }
  let localDate: string;
  try {
    localDate = buildLocalDateAt(args.asOf, build.timezone);
  } catch {
    return null;
  }
  const page = await ctx.db
    .query("plannedDrawScheduleRows")
    .withIndex("by_build_order", (query) => query.eq("buildId", build._id))
    .paginate({ cursor: args.cursor ?? null, numItems: SCHEDULE_BATCH_SIZE });
  for (const plannedDraw of page.page) {
    if (
      plannedDraw.organizationId !== build.organizationId ||
      plannedDraw.brokerageId !== build.brokerageId ||
      TERMINAL_DRAW_STATUSES.has(plannedDraw.status)
    ) {
      continue;
    }
    let plannedDate: string;
    try {
      plannedDate = addBuildLocalDays(build.startDate, plannedDraw.timingDay);
    } catch {
      continue;
    }
    if (localDate < plannedDate) {
      continue;
    }
    await ensureDrawSystemPost(ctx, {
      actor: {
        roles: ["system"],
        workosUserId: "system:build-collaboration-scheduler",
      },
      activationReason: "scheduled",
      build,
      now: args.asOf,
      plannedDraw,
    });
  }
  if (!page.isDone) {
    await ctx.scheduler.runAfter(
      0,
      internal.build_collaboration_scheduling
        .reconcileDueDrawSystemPostsForBuild,
      {
        asOf: args.asOf,
        buildId: build._id,
        cursor: page.continueCursor,
      }
    );
  }
  return null;
}
