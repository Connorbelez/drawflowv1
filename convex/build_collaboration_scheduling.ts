import { v } from "convex/values";

import { internal } from "./_generated/api";
import type { ActiveBuildAuthorization } from "./activeBuildAccess";
import { authenticatedMutation, authenticatedQuery } from "./authz";
import {
  prepareBuildCollaborationPublication,
  publishBuildCollaborationBundle,
} from "./build_collaboration";
import { requireHumanCollaborationActor } from "./build_collaboration_human";
import { requireBuildCollaborationWritable } from "./build_collaboration_lifecycle_state";
import {
  type BuildCollaborationPublicationBundle,
  canonicalPublicationBundleJson,
  publicationBundleHash,
} from "./build_collaboration_publication_bundle";
import { authorizeBuildCollaborationRecipient } from "./build_collaboration_recipient_access";
import { authorizeActiveBuildCollaborationAccess } from "./build_collaboration_rollout";
import {
  classifyScheduledPublicationFailure,
  scheduledPublicationMaterialConflict,
  scheduledPublicationOperationalFailure,
} from "./build_collaboration_scheduling_errors";
import {
  addBuildLocalDays,
  buildLocalDateAt,
  buildLocalMidnightUtc,
  ensureDrawSystemPost,
  ensureMilestoneSystemPost,
} from "./build_collaboration_system_posts";
import {
  buildCollaborationValidationError,
  isBuildCollaborationValidationError,
} from "./build_collaboration_validation";
import { internalAction, internalMutation } from "./fluent";
import type { Doc, Id, MutationCtx } from "./types";

import { scheduleCurrentMilestoneSystemPostActivations, scheduleCurrentDrawSystemPostActivations, reconcileDueMilestoneSystemPostForBuildHandler, reconcileDueDrawSystemPostForBuildHandler, requireSchedulableDraft, requireApprovedScheduledDraft, revalidateScheduledPublication, revalidateMaterialBoundary, assertApprovalIntegrity, revalidateExactDraftBundle, invalidateCurrentApprovals, scheduledApprovalHash, assertCoordinatingRole, assertSchedulablePostType, assertApprovalHierarchyUnchanged, assertScheduledFor, normalizedConflictReason } from "./build_collaboration_scheduling/helpers";
export { scheduleCurrentMilestoneSystemPostActivations, scheduleCurrentDrawSystemPostActivations, revalidateMaterialBoundary };

const MAX_CONFLICT_REASON_LENGTH = 500;
const MAX_SCHEDULE_HORIZON_MS = 2 * 365 * 24 * 60 * 60 * 1000;
const MIN_SCHEDULE_DELAY_MS = 60_000;
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
    return { cursor: null as string | null, phase: "active" as ReconciliationPhase };
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
  cursor: string | null,
) {
  return JSON.stringify({ cursor, phase });
}

async function cancelScheduledActivation(
  ctx: MutationCtx,
  jobId: string | undefined,
) {
  if (!jobId) {
    return;
  }
  try {
    const scheduledJob = await ctx.db.system.get(
      "_scheduled_functions",
      jobId as Id<"_scheduled_functions">,
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
  now: number,
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
  now: number,
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
  .handler(async (ctx, args) => {
    const authorization = await authorizeActiveBuildCollaborationAccess(
      ctx,
      args
    );
    await requireHumanCollaborationActor(ctx, authorization);
    assertCoordinatingRole(authorization.effectiveRole.tier);
    const now = Date.now();
    assertScheduledFor(args.scheduledFor, now);
    const draft = await requireSchedulableDraft(ctx, {
      approvalOwnerWorkosUserId: authorization.viewer.subject,
      buildId: authorization.build._id,
      draftId: args.draftId,
      expectedRevision: args.expectedRevision,
    });
    const { bundle, bundleJson } = await revalidateExactDraftBundle(ctx, {
      authorization,
      draft,
    });
    assertSchedulablePostType(bundle.postType);
    await invalidateCurrentApprovals(ctx, draft._id, now);
    const approvalHash = await scheduledApprovalHash({
      approvingWorkosUserId: authorization.viewer.subject,
      bundleHash: draft.bundleHash,
      draftId: draft._id,
      draftRevision: draft.revision,
      scheduledFor: args.scheduledFor,
    });
    const approvalId = await ctx.db.insert(
      "buildCollaborationPublicationApprovals",
      {
        approvalHash,
        approvedAt: now,
        approvingActorKind: "human",
        approvingRole: authorization.effectiveRole.role,
        approvingRoles: authorization.roles,
        approvingWorkosUserId: authorization.viewer.subject,
        brokerageId: authorization.brokerage._id,
        buildId: authorization.build._id,
        bundleHash: draft.bundleHash,
        bundleJsonSnapshot: bundleJson,
        draftId: draft._id,
        draftRevision: draft.revision,
        executionAttemptCount: 0,
        mutationSummaryJson: JSON.stringify({
          actionItemCount: bundle.actionItems.length,
          attachmentAssetCount: bundle.attachmentAssetIds.length,
          notificationEffectCount: bundle.effectiveNotificationEffects.length,
          referenceCount: bundle.references.length,
          sharedMutationCount: bundle.sharedMutations.length,
        }),
        organizationId: authorization.organizationId,
        readerSummaryJson: JSON.stringify({
          audienceMode: bundle.audienceMode,
          effectiveReaderIds: bundle.effectiveReaderIds,
          excludedReaderIds: bundle.excludedReaderIds,
          mandatoryReaderIds: bundle.mandatoryReaderIds,
          requestedReaderIds: bundle.requestedReaderIds,
        }),
        scheduledFor: args.scheduledFor,
        state: "approved",
      }
    );
    await ctx.db.patch(draft._id, {
      scheduleConflictReason: undefined,
      schedulePausedAt: undefined,
      scheduledFor: args.scheduledFor,
      state: "scheduled",
      updatedAt: now,
    });
    await ctx.db.insert("auditEvents", {
      actorRoles: authorization.roles,
      actorWorkosUserId: authorization.viewer.subject,
      brokerageId: authorization.brokerage._id,
      command: "approveAndScheduleBuildCollaborationDraft",
      createdAt: now,
      entityId: approvalId,
      entityType: "buildCollaborationPublicationApproval",
      eventType: "build.collaboration.publication.scheduled",
      newState: JSON.stringify({
        bundleHash: draft.bundleHash,
        draftId: draft._id,
        draftRevision: draft.revision,
        scheduledFor: args.scheduledFor,
      }),
      organizationId: authorization.organizationId,
      warnings: [],
    });
    await ctx.db.insert("eventOutbox", {
      brokerageId: authorization.brokerage._id,
      createdAt: now,
      eventType: "build.collaboration.publication.scheduled",
      organizationId: authorization.organizationId,
      payloadPreview: JSON.stringify({
        approvalId,
        draftId: draft._id,
        draftRevision: draft.revision,
        scheduledFor: args.scheduledFor,
      }),
      relatedEntityId: approvalId,
      relatedEntityType: "buildCollaborationPublicationApproval",
      status: "pending",
    });
    await ctx.scheduler.runAt(
      args.scheduledFor,
      internal.build_collaboration_scheduling
        .executeScheduledBuildCollaborationPublication,
      { approvalId }
    );
    return approvalId;
  })
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
    .handler(async (ctx, args) => {
      const approval = await ctx.db.get(args.approvalId);
      if (!approval || approval.state !== "approved") {
        return null;
      }
      const now = Date.now();
      const failureReason = normalizedConflictReason(args.failureReason);
      await ctx.db.patch(approval._id, {
        executionAttemptCount: (approval.executionAttemptCount ?? 0) + 1,
        lastExecutionAt: now,
        lastExecutionError: failureReason,
      });
      await ctx.db.insert("auditEvents", {
        actorRoles: ["system"],
        actorWorkosUserId: "system:build-collaboration-scheduler",
        brokerageId: approval.brokerageId,
        command: "recordRetryableScheduledBuildCollaborationFailure",
        createdAt: now,
        entityId: approval._id,
        entityType: "buildCollaborationPublicationApproval",
        eventType: "build.collaboration.publication.schedule_retryable_failure",
        newState: JSON.stringify({
          executionAttemptCount: (approval.executionAttemptCount ?? 0) + 1,
          lastExecutionAt: now,
          state: "approved",
        }),
        organizationId: approval.organizationId,
        priorState: JSON.stringify({ state: approval.state }),
        reason: failureReason,
        warnings: [failureReason],
      });
      await ctx.db.insert("eventOutbox", {
        brokerageId: approval.brokerageId,
        createdAt: now,
        eventType: "build.collaboration.publication.schedule_retryable_failure",
        organizationId: approval.organizationId,
        payloadPreview: JSON.stringify({
          approvalId: approval._id,
          executionAttemptCount: (approval.executionAttemptCount ?? 0) + 1,
          failureReason,
          lastExecutionAt: now,
        }),
        relatedEntityId: approval._id,
        relatedEntityType: "buildCollaborationPublicationApproval",
        status: "pending",
      });
      return null;
    })
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
    if (!build || !milestone) {
      return null;
    }
    if (
      !(build.status === "active" || build.status === "future_start") ||
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
      const plannedDate = addBuildLocalDays(build.startDate, milestone.dayStart);
      currentDueAt = buildLocalMidnightUtc(plannedDate, build.timezone);
    } catch {
      return null;
    }
    if (currentDueAt > now) {
      if (currentDueAt <= now + MAX_MILESTONE_SCHEDULE_HORIZON_MS) {
        await cancelScheduledActivation(ctx, milestone.scheduledActivationJobId);
        const scheduledJobId = await ctx.scheduler.runAt(
          currentDueAt,
          internal.build_collaboration_scheduling
            .executeScheduledMilestoneSystemPostActivation,
          {
            buildId: build._id,
            milestoneId: milestone._id,
            scheduledFor: currentDueAt,
          },
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
    if (!build || !plannedDraw) {
      return null;
    }
    if (
      !(build.status === "active" || build.status === "future_start") ||
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
        plannedDraw.timingDay,
      );
      currentDueAt = buildLocalMidnightUtc(plannedDate, build.timezone);
    } catch {
      return null;
    }
    if (currentDueAt > now) {
      if (currentDueAt <= now + MAX_MILESTONE_SCHEDULE_HORIZON_MS) {
        await cancelScheduledActivation(ctx, plannedDraw.scheduledActivationJobId);
        const scheduledJobId = await ctx.scheduler.runAt(
          currentDueAt,
          internal.build_collaboration_scheduling
            .executeScheduledDrawSystemPostActivation,
          {
            buildId: build._id,
            plannedDrawId: plannedDraw._id,
            scheduledFor: currentDueAt,
          },
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
        { asOf, buildId: build._id },
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
        !(build.status === "active" || build.status === "future_start") ||
        !build.timezone
      ) {
        continue;
      }
      await ctx.scheduler.runAfter(
        0,
        internal.build_collaboration_scheduling
          .reconcileDueDrawSystemPostsForBuild,
        { asOf, buildId: build._id },
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
        { asOf, cursor: continuation },
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
  .handler(async (ctx, args) => {
    const approval = await ctx.db.get(args.approvalId);
    if (!approval) {
      return null;
    }
    if (approval.state === "published") {
      return approval.postId ?? null;
    }
    if (approval.state !== "approved") {
      return null;
    }
    const now = Date.now();
    if (
      !(approval.scheduledFor && Number.isFinite(approval.scheduledFor)) ||
      approval.scheduledFor <= 0
    ) {
      throw scheduledPublicationMaterialConflict(
        new Error("The approved publication target is missing or invalid.")
      );
    }
    if (approval.scheduledFor > now) {
      throw scheduledPublicationOperationalFailure(
        "The approved publication is not due yet."
      );
    }
    const { audience, authorization, bundle, draft } =
      await revalidateScheduledPublication(ctx, approval);
    const postId = await revalidateMaterialBoundary(() =>
      publishBuildCollaborationBundle(ctx, {
        agentDrafted: draft.preparedByAgent ?? false,
        audience,
        authorization,
        bundle,
      })
    );
    await ctx.db.patch(approval._id, {
      executionAttemptCount: (approval.executionAttemptCount ?? 0) + 1,
      lastExecutionAt: now,
      lastExecutionError: undefined,
      postId,
      publishedAt: now,
      state: "published",
    });
    await ctx.db.patch(draft._id, {
      scheduleConflictReason: undefined,
      schedulePausedAt: undefined,
      state: "published",
      updatedAt: now,
    });
    await ctx.db.insert("auditEvents", {
      actorRoles: authorization.roles,
      actorWorkosUserId: authorization.viewer.subject,
      brokerageId: authorization.brokerage._id,
      command: "publishScheduledBuildCollaborationDraft",
      createdAt: now,
      entityId: approval._id,
      entityType: "buildCollaborationPublicationApproval",
      eventType: "build.collaboration.publication.schedule_executed",
      newState: JSON.stringify({ postId, publishedAt: now }),
      organizationId: authorization.organizationId,
      priorState: JSON.stringify({
        scheduledFor: approval.scheduledFor,
        state: approval.state,
      }),
      warnings: [],
    });
    await ctx.db.insert("eventOutbox", {
      brokerageId: authorization.brokerage._id,
      createdAt: now,
      eventType: "build.collaboration.publication.schedule_executed",
      organizationId: authorization.organizationId,
      payloadPreview: JSON.stringify({
        approvalId: approval._id,
        postId,
        publishedAt: now,
      }),
      relatedEntityId: approval._id,
      relatedEntityType: "buildCollaborationPublicationApproval",
      status: "pending",
    });
    return postId;
  })
  .internal();

export const pauseScheduledBuildCollaborationDraft = internalMutation
  .input({
    approvalId: v.id("buildCollaborationPublicationApprovals"),
    conflictReason: v.string(),
  })
  .returns(v.null())
  .handler(async (ctx, args) => {
    const approval = await ctx.db.get(args.approvalId);
    if (!approval || approval.state !== "approved") {
      return null;
    }
    const now = Date.now();
    const conflictReason = normalizedConflictReason(args.conflictReason);
    await ctx.db.patch(approval._id, {
      conflictReason,
      executionAttemptCount: (approval.executionAttemptCount ?? 0) + 1,
      lastExecutionAt: now,
      pausedAt: now,
      state: "paused",
    });
    const draft = await ctx.db.get(approval.draftId);
    if (draft && draft.state === "scheduled") {
      await ctx.db.patch(draft._id, {
        scheduleConflictReason: conflictReason,
        schedulePausedAt: now,
        state: "active",
        updatedAt: now,
      });
    }
    await ctx.db.insert("auditEvents", {
      actorRoles: approval.approvingRoles ?? [],
      actorWorkosUserId: approval.approvingWorkosUserId,
      brokerageId: approval.brokerageId,
      command: "pauseScheduledBuildCollaborationDraft",
      createdAt: now,
      entityId: approval._id,
      entityType: "buildCollaborationPublicationApproval",
      eventType: "build.collaboration.publication.schedule_paused",
      newState: JSON.stringify({ conflictReason, state: "paused" }),
      organizationId: approval.organizationId,
      priorState: JSON.stringify({ state: approval.state }),
      reason: conflictReason,
      warnings: [conflictReason],
    });
    await ctx.db.insert("eventOutbox", {
      brokerageId: approval.brokerageId,
      createdAt: now,
      eventType: "build.collaboration.publication.schedule_paused",
      organizationId: approval.organizationId,
      payloadPreview: JSON.stringify({
        approvalId: approval._id,
        conflictReason,
        draftId: approval.draftId,
      }),
      relatedEntityId: approval._id,
      relatedEntityType: "buildCollaborationPublicationApproval",
      status: "pending",
    });
    return null;
  })
  .internal();
