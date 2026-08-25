import { v } from "convex/values";

import { internal } from "../_generated/api";
import type { ActiveBuildAuthorization } from "../activeBuildAccess";
import { authenticatedMutation, authenticatedQuery } from "../authz";
import {
  prepareBuildCollaborationPublication,
  publishBuildCollaborationBundle,
} from "../build_collaboration";
import { requireHumanCollaborationActor } from "../build_collaboration_human";
import { requireBuildCollaborationWritable } from "../build_collaboration_lifecycle_state";
import {
  type BuildCollaborationPublicationBundle,
  canonicalPublicationBundleJson,
  publicationBundleHash,
} from "../build_collaboration_publication_bundle";
import { authorizeBuildCollaborationRecipient } from "../build_collaboration_recipient_access";
import { authorizeActiveBuildCollaborationAccess } from "../build_collaboration_rollout";
import {
  classifyScheduledPublicationFailure,
  scheduledPublicationMaterialConflict,
  scheduledPublicationOperationalFailure,
} from "../build_collaboration_scheduling_errors";
import {
  addBuildLocalDays,
  buildLocalDateAt,
  buildLocalMidnightUtc,
  ensureDrawSystemPost,
  ensureMilestoneSystemPost,
} from "../build_collaboration_system_posts";
import {
  buildCollaborationValidationError,
  isBuildCollaborationValidationError,
} from "../build_collaboration_validation";
import { internalAction, internalMutation } from "../fluent";
import type { Doc, Id, MutationCtx } from "../types";

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

export async function scheduleCurrentMilestoneSystemPostActivations(
  ctx: MutationCtx,
  input: {
    build: Doc<"activeBuilds">;
    cursor?: string | null;
    now?: number;
  },
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
      const plannedDate = addBuildLocalDays(build.startDate, milestone.dayStart);
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
      },
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
      },
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
      },
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
  },
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
        plannedDraw.timingDay,
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
      },
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
      },
    );
  }
}

export async function reconcileDueMilestoneSystemPostForBuildHandler(
  ctx: MutationCtx,
  args: { asOf: number; buildId: Id<"activeBuilds">; cursor?: string | null }
) {


    const build = await ctx.db.get(args.buildId);
    if (
      !build ||
      !(build.status === "active" || build.status === "future_start") ||
      !build.timezone
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
          milestone.dayStart,
        );
      } catch {
        continue;
      }
      if (localDate < plannedMilestoneStartDate) continue;
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
      if (!ensured) continue;
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
              actionItem.canonicalBuildSubmilestoneId !== undefined,
          )
          .map((actionItem) => [
            actionItem.canonicalBuildSubmilestoneId,
            actionItem._id,
          ]),
      );
      const submilestones = (
        await ctx.db
          .query("buildSubmilestones")
          .withIndex("by_milestone", (query) =>
            query.eq("buildMilestoneId", milestone._id),
          )
          .collect()
      ).filter(
        (submilestone) =>
          submilestone.buildId === build._id &&
          submilestone.organizationId === build.organizationId &&
          submilestone.brokerageId === build.brokerageId,
      );
      for (const submilestone of submilestones) {
        if (submilestone.actualStartedAt !== undefined) continue;
        let plannedStartDate: string;
        try {
          plannedStartDate = addBuildLocalDays(
            build.startDate,
            submilestone.startDay ?? milestone.dayStart,
          );
        } catch {
          continue;
        }
        if (localDate <= plannedStartDate) continue;
        const actionItemId = actionItemBySubmilestone.get(submilestone._id);
        if (!actionItemId) continue;
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
              .eq("reconciliationKey", reconciliationKey),
          )
          .first();
        if (existing) continue;
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
        },
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
      !build ||
      !(build.status === "active" || build.status === "future_start") ||
      !build.timezone
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
        },
      );
    }
    return null;


}

export async function requireSchedulableDraft(
  ctx: MutationCtx,
  input: {
    approvalOwnerWorkosUserId: string;
    buildId: Id<"activeBuilds">;
    draftId: Id<"buildCollaborationDrafts">;
    expectedRevision: number;
  }
) {
  const draft = await ctx.db.get(input.draftId);
  if (
    !draft ||
    draft.buildId !== input.buildId ||
    (draft.approvalOwnerWorkosUserId ?? draft.ownerWorkosUserId) !==
      input.approvalOwnerWorkosUserId
  ) {
    throw new Error("Draft not found.");
  }
  if (draft.state !== "active") {
    throw new Error("Only an active private draft can be scheduled.");
  }
  if (draft.revision !== input.expectedRevision) {
    throw new Error(
      `Draft revision conflict: expected revision ${input.expectedRevision} but found ${draft.revision}. Review the latest private draft before scheduling.`
    );
  }
  return draft;
}

export async function requireApprovedScheduledDraft(
  ctx: MutationCtx,
  approval: Doc<"buildCollaborationPublicationApprovals">
) {
  const draft = await ctx.db.get(approval.draftId);
  if (
    !draft ||
    draft.organizationId !== approval.organizationId ||
    draft.brokerageId !== approval.brokerageId ||
    draft.buildId !== approval.buildId ||
    draft.state !== "scheduled" ||
    draft.scheduledFor !== approval.scheduledFor ||
    draft.revision !== approval.draftRevision ||
    draft.bundleHash !== approval.bundleHash ||
    draft.bundleJson !== approval.bundleJsonSnapshot
  ) {
    throw scheduledPublicationMaterialConflict(
      new Error(
        "The scheduled draft changed after approval. Renew human approval before publishing."
      )
    );
  }
  return draft;
}

export async function revalidateScheduledPublication(
  ctx: MutationCtx,
  approval: Doc<"buildCollaborationPublicationApprovals">
) {
  const draft = await requireApprovedScheduledDraft(ctx, approval);
  await assertApprovalIntegrity(approval, draft);
  const { authorization } = await revalidateMaterialBoundary(() =>
    authorizeBuildCollaborationRecipient(ctx, {
      buildId: approval.buildId,
      organizationId: approval.organizationId,
      workosUserId: approval.approvingWorkosUserId,
    })
  );
  await revalidateMaterialBoundary(() =>
    requireBuildCollaborationWritable(ctx, authorization)
  );
  assertCoordinatingRole(authorization.effectiveRole.tier);
  assertApprovalHierarchyUnchanged(approval, authorization);
  const { audience, bundle } = await revalidateExactDraftBundle(ctx, {
    authorization,
    draft,
  });
  assertSchedulablePostType(bundle.postType);
  return { audience, authorization, bundle, draft };
}

export async function revalidateMaterialBoundary<T>(
  operation: () => Promise<T> | T
) {
  try {
    return await operation();
  } catch (error) {
    if (isBuildCollaborationValidationError(error)) {
      throw scheduledPublicationMaterialConflict(error);
    }
    throw error;
  }
}

export async function assertApprovalIntegrity(
  approval: Doc<"buildCollaborationPublicationApprovals">,
  draft: Doc<"buildCollaborationDrafts">
) {
  if (
    !(approval.approvalHash && approval.draftRevision && approval.scheduledFor)
  ) {
    throw scheduledPublicationMaterialConflict(
      new Error("The scheduled human approval is incomplete.")
    );
  }
  const expected = await scheduledApprovalHash({
    approvingWorkosUserId: approval.approvingWorkosUserId,
    bundleHash: draft.bundleHash,
    draftId: draft._id,
    draftRevision: draft.revision,
    scheduledFor: approval.scheduledFor,
  });
  if (expected !== approval.approvalHash) {
    throw scheduledPublicationMaterialConflict(
      new Error(
        "The scheduled human approval no longer matches its exact publication bundle."
      )
    );
  }
}

export async function revalidateExactDraftBundle(
  ctx: MutationCtx,
  input: {
    authorization: Awaited<
      ReturnType<typeof authorizeActiveBuildCollaborationAccess>
    >;
    draft: Doc<"buildCollaborationDrafts">;
  }
) {
  if (
    (await publicationBundleHash(input.draft.bundleJson)) !==
    input.draft.bundleHash
  ) {
    throw scheduledPublicationMaterialConflict(
      new Error("The private draft bundle failed its integrity check.")
    );
  }
  const storedBundle = (await revalidateMaterialBoundary(() => {
    try {
      return JSON.parse(input.draft.bundleJson);
    } catch {
      throw buildCollaborationValidationError(
        "The approved private draft bundle is not valid JSON."
      );
    }
  })) as BuildCollaborationPublicationBundle;
  const { audience, bundle } = await revalidateMaterialBoundary(() =>
    prepareBuildCollaborationPublication(ctx, {
      authorization: input.authorization,
      bundle: storedBundle,
    })
  );
  const bundleJson = canonicalPublicationBundleJson(bundle);
  if (
    bundleJson !== input.draft.bundleJson ||
    (await publicationBundleHash(bundleJson)) !== input.draft.bundleHash
  ) {
    throw scheduledPublicationMaterialConflict(
      new Error(
        "The approved publication audience, references, assets, assignments, notifications, or revisions changed. Renew human approval."
      )
    );
  }
  return { audience, bundle, bundleJson };
}

export async function invalidateCurrentApprovals(
  ctx: MutationCtx,
  draftId: Id<"buildCollaborationDrafts">,
  now: number
) {
  const approvals = await ctx.db
    .query("buildCollaborationPublicationApprovals")
    .withIndex("by_draftId_and_state", (query) => query.eq("draftId", draftId))
    .take(100);
  for (const approval of approvals) {
    if (approval.state === "approved" || approval.state === "paused") {
      await ctx.db.patch(approval._id, {
        invalidatedAt: now,
        state: "invalidated",
      });
    }
  }
}

export async function scheduledApprovalHash(input: {
  approvingWorkosUserId: string;
  bundleHash: string;
  draftId: Id<"buildCollaborationDrafts">;
  draftRevision: number;
  scheduledFor: number;
}) {
  return await publicationBundleHash(
    JSON.stringify({
      approvingWorkosUserId: input.approvingWorkosUserId,
      bundleHash: input.bundleHash,
      draftId: input.draftId,
      draftRevision: input.draftRevision,
      scheduledFor: input.scheduledFor,
    })
  );
}

export function assertCoordinatingRole(tier: number) {
  if (tier < 3) {
    throw scheduledPublicationMaterialConflict(
      new Error(
        "Only the Builder or lender coordination team may schedule Build collaboration publications."
      )
    );
  }
}

export function assertSchedulablePostType(postType: string) {
  if (postType !== "update" && postType !== "announcement") {
    throw scheduledPublicationMaterialConflict(
      new Error("Only Updates and Announcements can be scheduled.")
    );
  }
}

export function assertApprovalHierarchyUnchanged(
  approval: Doc<"buildCollaborationPublicationApprovals">,
  authorization: ActiveBuildAuthorization
) {
  const approvedRoles = [...(approval.approvingRoles ?? [])].sort();
  const currentRoles = [...authorization.roles].sort();
  if (
    approval.approvingActorKind !== "human" ||
    approval.approvingRole !== authorization.effectiveRole.role ||
    JSON.stringify(approvedRoles) !== JSON.stringify(currentRoles)
  ) {
    throw scheduledPublicationMaterialConflict(
      new Error(
        "The approving human's Build collaboration hierarchy changed. Renew human approval."
      )
    );
  }
}

export function assertScheduledFor(scheduledFor: number, now: number) {
  if (
    !Number.isFinite(scheduledFor) ||
    scheduledFor < now + MIN_SCHEDULE_DELAY_MS ||
    scheduledFor > now + MAX_SCHEDULE_HORIZON_MS
  ) {
    throw new Error(
      "Scheduled publication time must be at least one minute in the future and within two years."
    );
  }
}

export function normalizedConflictReason(value: string) {
  return (
    value.trim().slice(0, MAX_CONFLICT_REASON_LENGTH) ||
    "Scheduled publication revalidation failed."
  );
}
