import type { ActiveBuildAuthorization } from "../activeBuildAccess";
import { buildActionItemQueueSortAt } from "../build_action_item_deadline_model";
import { recordBuildActionItemRevision } from "../build_action_item_history";
import {
  linkBuildActionItemToPost,
  syncLinkedActionItemPostCounts,
} from "../build_action_item_post_links";
import {
  type BuildCollaborationRole,
  resolveEffectiveCollaborationRole,
} from "../build_collaboration_model";
import { ensureActiveBuildPlanningActivationRevision } from "../build_collaboration_planning_reconciliation";
import { queueBuildCollaborationSearchOwnerRebuild } from "../build_collaboration_search_maintenance";
import { resolveCanonicalMilestoneExecutionOwnership } from "../build_collaboration_system_event_access";
import type { SystemPostHistoricalBackfill } from "../build_collaboration_system_events";
import {
  activateLatentBuildCollaborationSystemEvent,
  publishCanonicalBuildCollaborationSystemEvent,
  resolveSystemEventScope,
} from "../build_collaboration_system_events";
import { resolveActiveSubmilestoneEvidencePackageReadiness } from "../build_submilestone_evidence";
import { resolveSubmilestoneOperateAuthority } from "../build_submilestone_operate_authority";
import type { Doc, Id, MutationCtx, QueryCtx } from "../types";


import {
  drawSystemOccurrenceKey,
  shouldNotifySystemPost,
  type DrawSystemActivationReason,
  type MilestoneSystemActivationReason,
} from "./presentation";
import {
  ensureGeneratedSubmilestoneActionItem,
  syncPostCounts,
  syncPostCountsSilently,
} from "./action_items";
const SYSTEM_AUTHOR = "system";
const SYSTEM_LABEL = "DrawFlow System";

export async function ensureMilestoneSystemPost(
  ctx: MutationCtx,
  input: {
    actor: {
      roles: string[];
      workosUserId: string;
    };
    build: Doc<"activeBuilds">;
    milestone: Doc<"buildMilestones">;
    activationReason: MilestoneSystemActivationReason;
    historicalBackfill?: SystemPostHistoricalBackfill;
    now?: number;
  }
) {
  const activationRevision = input.historicalBackfill
    ? null
    : await ensureActiveBuildPlanningActivationRevision(ctx, {
        actor: {
          actorRoles: input.actor.roles,
          actorWorkosUserId: input.actor.workosUserId,
        },
        build: input.build,
        now: input.now,
      });
  const occurrenceKey = `milestone-system:${input.build._id}:${input.milestone._id}`;
  const now = input.now ?? Date.now();
  const plainText = input.historicalBackfill
    ? "Backfilled from existing records. Canonical Milestone and Sub-milestone state remain authoritative."
    : input.activationReason === "plan_activated"
      ? `${input.milestone.name} is part of the approved roadmap. Its collaboration companion is ready and will appear when the Milestone activates.`
      : input.activationReason === "scheduled"
        ? `${input.milestone.name} is scheduled to begin today. Canonical Sub-milestone cards are synchronized from the roadmap; this does not record that work has started.`
        : `${input.milestone.name} started. Canonical Sub-milestone cards are synchronized from the roadmap.`;
  const postId = await publishCanonicalBuildCollaborationSystemEvent(ctx, {
    buildId: input.build._id,
    idempotencyKey: occurrenceKey,
    organizationId: input.build.organizationId,
    plainText,
    postType: "update",
    primaryReferenceId: String(input.milestone._id),
    primaryReferenceKind: "milestone",
    systemPostKind: "milestone",
    systemLabel: SYSTEM_LABEL,
    suppressNotifications: !shouldNotifySystemPost(input.activationReason),
    silentPreactivation: input.activationReason === "plan_activated",
    ...(input.historicalBackfill
      ? { silentBackfill: input.historicalBackfill }
      : { now }),
  });
  if (!postId) {
    return null;
  }

  // The generic publisher owns publication/audience/revision plumbing.  The
  // specialized pass adds immutable domain identity and recovers any children
  // that may be missing after a partial historical write.
  const scope = await resolveSystemEventScope(
    ctx,
    {
      buildId: input.build._id,
      idempotencyKey: `${occurrenceKey}:scope`,
      organizationId: input.build.organizationId,
      plainText: "Milestone System Post authorization scope.",
      postType: "update",
      systemLabel: SYSTEM_LABEL,
    },
    `${occurrenceKey}:scope`
  );
  if (scope.status !== "ready") {
    return null;
  }

  let post = await ctx.db.get(postId);
  if (!post || post.buildId !== input.build._id) {
    throw new Error("Milestone System Post became unavailable.");
  }
  if (
    post.organizationId !== input.build.organizationId ||
    post.brokerageId !== input.build.brokerageId
  ) {
    return null;
  }
  const isPreactivation = input.activationReason === "plan_activated";
  let activatedLatent = false;
  if (
    !(isPreactivation || input.historicalBackfill) &&
    post.systemLifecycle === "latent"
  ) {
    activatedLatent = await activateLatentBuildCollaborationSystemEvent(ctx, {
      buildId: input.build._id,
      idempotencyKey: occurrenceKey,
      now,
      organizationId: input.build.organizationId,
      plainText,
      postId,
      postType: "update",
      primaryReferenceId: String(input.milestone._id),
      primaryReferenceKind: "milestone",
      systemLabel: SYSTEM_LABEL,
      systemPostKind: "milestone",
      suppressNotifications: !shouldNotifySystemPost(input.activationReason),
    });
    post = await ctx.db.get(postId);
    if (!post) {
      throw new Error("Milestone System Post became unavailable.");
    }
  }
  const triggeredByRole = input.historicalBackfill
    ? undefined
    : resolveEffectiveCollaborationRole(input.actor.roles)?.role;
  const submilestones = (
    await ctx.db
      .query("buildSubmilestones")
      .withIndex("by_milestone", (query) =>
        query.eq("buildMilestoneId", input.milestone._id)
      )
      .take(500)
  ).filter(
    (submilestone) =>
      submilestone.buildId === input.build._id &&
      submilestone.organizationId === input.build.organizationId
  );

  const postPatch = {
    activationPlanningRevisionId:
      post.activationPlanningRevisionId ?? activationRevision?._id,
    activationReason: activatedLatent
      ? input.activationReason
      : (post.activationReason ?? input.activationReason),
    authorDisplayNameSnapshot: SYSTEM_LABEL,
    authorRolesSnapshot: ["system"],
    authorWorkosUserId: SYSTEM_AUTHOR,
    canonicalBuildMilestoneId: input.milestone._id,
    systemEventKey: occurrenceKey,
    systemOccurrenceKey: occurrenceKey,
    systemPostKind: "milestone" as const,
    currentPlanningRevision:
      post.currentPlanningRevision ?? activationRevision?.revision,
    systemLifecycle: isPreactivation
      ? (post.systemLifecycle ?? "latent")
      : post.systemLifecycle === "latent"
        ? "open"
        : (post.systemLifecycle ?? "open"),
    ...(input.historicalBackfill || isPreactivation
      ? {}
      : { triggeredAt: post.triggeredAt ?? now }),
    ...(isPreactivation
      ? {}
      : { triggeredByRole: post.triggeredByRole ?? triggeredByRole }),
    ...(input.historicalBackfill || isPreactivation
      ? {}
      : {
          triggeredByWorkosUserId:
            post.triggeredByWorkosUserId ?? input.actor.workosUserId,
        }),
    ...(input.historicalBackfill
      ? {
          historicalBackfill: {
            ...input.historicalBackfill,
            source: "existing_records" as const,
          },
          materializedAt: input.historicalBackfill.materializedAt,
        }
      : {}),
  };
  const postChanged =
    post.activationPlanningRevisionId !==
      postPatch.activationPlanningRevisionId ||
    post.activationReason !== postPatch.activationReason ||
    post.authorDisplayNameSnapshot !== postPatch.authorDisplayNameSnapshot ||
    JSON.stringify(post.authorRolesSnapshot) !==
      JSON.stringify(postPatch.authorRolesSnapshot) ||
    post.authorWorkosUserId !== postPatch.authorWorkosUserId ||
    post.canonicalBuildMilestoneId !== postPatch.canonicalBuildMilestoneId ||
    post.systemEventKey !== postPatch.systemEventKey ||
    post.systemOccurrenceKey !== postPatch.systemOccurrenceKey ||
    post.systemPostKind !== postPatch.systemPostKind ||
    post.currentPlanningRevision !== postPatch.currentPlanningRevision ||
    post.systemLifecycle !== postPatch.systemLifecycle ||
    ("triggeredAt" in postPatch &&
      post.triggeredAt !== postPatch.triggeredAt) ||
    ("triggeredByRole" in postPatch &&
      post.triggeredByRole !== postPatch.triggeredByRole) ||
    ("triggeredByWorkosUserId" in postPatch &&
      post.triggeredByWorkosUserId !== postPatch.triggeredByWorkosUserId) ||
    ("materializedAt" in postPatch &&
      post.materializedAt !== postPatch.materializedAt) ||
    ("historicalBackfill" in postPatch &&
      JSON.stringify(post.historicalBackfill) !==
        JSON.stringify(postPatch.historicalBackfill));
  if (postChanged) {
    await ctx.db.patch(postId, { ...postPatch, updatedAt: now });
  }

  const generatedActionItemIds: Id<"buildActionItems">[] = [];
  let actionItemsChanged = false;
  for (const submilestone of submilestones) {
    if (submilestone.planningState === "superseded") {
      continue;
    }
    const ensured = await ensureGeneratedSubmilestoneActionItem(ctx, {
      authorization: scope.authorization,
      milestone: input.milestone,
      now: input.historicalBackfill?.materializedAt ?? now,
      postId,
      submilestone,
      silentOperationalEffects:
        input.historicalBackfill !== undefined || isPreactivation,
    });
    generatedActionItemIds.push(ensured.actionItemId);
    actionItemsChanged ||= ensured.changed;
  }
  if (actionItemsChanged && !input.historicalBackfill && !isPreactivation) {
    await syncPostCounts(ctx, generatedActionItemIds, now);
  } else if (actionItemsChanged) {
    await syncPostCountsSilently(ctx, postId);
  }

  if (postChanged || actionItemsChanged) {
    await queueBuildCollaborationSearchOwnerRebuild(ctx, {
      authorization: scope.authorization,
      owner: { id: postId, kind: "post" },
      postId,
    });
  }
  return {
    actionItemIds: generatedActionItemIds,
    postId,
    recoveryRequired: submilestones.length === 0,
  };
}

/**
 * Ensure the single collaboration System Post for a canonical Draw
 * occurrence. This helper only writes collaboration attribution/projection
 * records; it never creates or mutates a Draw Request, eligibility, evidence,
 * approval, release, funds, fees, or interest state.
 */
export async function ensureDrawSystemPost(
  ctx: MutationCtx,
  input: {
    actor: { roles: string[]; workosUserId: string };
    build: Doc<"activeBuilds">;
    drawRequest?: Doc<"activeBuildDrawRequests">;
    plannedDraw?: Doc<"plannedDrawScheduleRows">;
    activationReason: DrawSystemActivationReason;
    historicalBackfill?: SystemPostHistoricalBackfill;
    now?: number;
  }
) {
  const plannedDrawKey = input.drawRequest?.plannedDrawKey;
  const plannedDraw =
    input.plannedDraw ??
    (plannedDrawKey
      ? await ctx.db
          .query("plannedDrawScheduleRows")
          .withIndex("by_build_draw_key", (query) =>
            query.eq("buildId", input.build._id).eq("drawKey", plannedDrawKey)
          )
          .first()
      : undefined);
  const occurrenceKey = plannedDraw
    ? drawSystemOccurrenceKey(input.build, plannedDraw)
    : `draw-system:${String(input.build._id)}:${String(input.build.proposalId)}:request:${String(input.drawRequest?._id ?? "unknown")}`;
  const now = input.now ?? Date.now();
  const activationRevision = input.historicalBackfill
    ? null
    : await ensureActiveBuildPlanningActivationRevision(ctx, {
        actor: {
          actorRoles: input.actor.roles,
          actorWorkosUserId: input.actor.workosUserId,
        },
        build: input.build,
        now,
      });
  const label = plannedDraw?.label ?? input.drawRequest?.label ?? "Draw";
  const drawDisplay = input.drawRequest?.displayId
    ? ` (${input.drawRequest.displayId})`
    : "";
  const plainText = input.historicalBackfill
    ? "Backfilled from existing records. Canonical Draw Request, evidence, review, approval, and release state remain authoritative."
    : input.activationReason === "scheduled"
      ? `${label} is scheduled for Draw coordination today. Canonical Draw Request, evidence, review, approval, and release state remain authoritative; no request was created.`
      : `${label}${drawDisplay} is tracked in DrawFlow System. Canonical Draw Request, evidence, review, approval, and release state remain authoritative.`;
  const primaryReferenceId = String(
    plannedDraw?._id ?? input.drawRequest?._id ?? ""
  );
  if (!primaryReferenceId) {
    return null;
  }
  const postId = await publishCanonicalBuildCollaborationSystemEvent(ctx, {
    buildId: input.build._id,
    idempotencyKey: occurrenceKey,
    organizationId: input.build.organizationId,
    plainText,
    postType: "update",
    primaryReferenceId,
    primaryReferenceKind: "draw",
    systemLabel: SYSTEM_LABEL,
    systemPostKind: "draw",
    suppressNotifications: !shouldNotifySystemPost(input.activationReason),
    ...(input.historicalBackfill
      ? { silentBackfill: input.historicalBackfill }
      : { now }),
  });
  if (!postId) {
    return null;
  }

  const scope = await resolveSystemEventScope(
    ctx,
    {
      buildId: input.build._id,
      idempotencyKey: `${occurrenceKey}:scope`,
      organizationId: input.build.organizationId,
      plainText: "Draw System Post authorization scope.",
      postType: "update",
      primaryReferenceId,
      primaryReferenceKind: "draw",
      systemLabel: SYSTEM_LABEL,
      systemPostKind: "draw",
    },
    `${occurrenceKey}:scope`
  );
  if (scope.status !== "ready") {
    return null;
  }
  const post = await ctx.db.get(postId);
  if (!post || post.buildId !== input.build._id) {
    throw new Error("Draw System Post became unavailable.");
  }
  if (
    post.organizationId !== input.build.organizationId ||
    post.brokerageId !== input.build.brokerageId
  ) {
    return null;
  }
  const triggeredByRole = input.historicalBackfill
    ? undefined
    : resolveEffectiveCollaborationRole(input.actor.roles)?.role;
  const postPatch = {
    activationPlanningRevisionId:
      post.activationPlanningRevisionId ?? activationRevision?._id,
    activationReason: post.activationReason ?? input.activationReason,
    authorDisplayNameSnapshot: SYSTEM_LABEL,
    authorRolesSnapshot: ["system"],
    authorWorkosUserId: SYSTEM_AUTHOR,
    canonicalBuildDrawOccurrenceKey:
      post.canonicalBuildDrawOccurrenceKey ?? occurrenceKey,
    systemEventKey: occurrenceKey,
    systemOccurrenceKey: occurrenceKey,
    systemPostKind: "draw" as const,
    currentPlanningRevision:
      post.currentPlanningRevision ?? activationRevision?.revision,
    systemLifecycle: post.systemLifecycle ?? "open",
    ...(input.drawRequest
      ? (() => {
          const disposition = drawSystemDispositionForStatus(
            input.drawRequest.status
          );
          return disposition ? { systemDisposition: disposition } : {};
        })()
      : {}),
    ...(input.historicalBackfill
      ? {}
      : { triggeredAt: post.triggeredAt ?? now }),
    ...(input.historicalBackfill
      ? {}
      : { triggeredByRole: post.triggeredByRole ?? triggeredByRole }),
    ...(input.historicalBackfill
      ? {}
      : {
          triggeredByWorkosUserId:
            post.triggeredByWorkosUserId ?? input.actor.workosUserId,
        }),
    ...(input.historicalBackfill
      ? {
          historicalBackfill: {
            ...input.historicalBackfill,
            source: "existing_records" as const,
          },
          materializedAt: input.historicalBackfill.materializedAt,
        }
      : {}),
  };
  const postChanged =
    post.activationPlanningRevisionId !==
      postPatch.activationPlanningRevisionId ||
    post.activationReason !== postPatch.activationReason ||
    post.authorDisplayNameSnapshot !== postPatch.authorDisplayNameSnapshot ||
    JSON.stringify(post.authorRolesSnapshot) !==
      JSON.stringify(postPatch.authorRolesSnapshot) ||
    post.authorWorkosUserId !== postPatch.authorWorkosUserId ||
    post.canonicalBuildDrawOccurrenceKey !==
      postPatch.canonicalBuildDrawOccurrenceKey ||
    post.systemEventKey !== postPatch.systemEventKey ||
    post.systemOccurrenceKey !== postPatch.systemOccurrenceKey ||
    post.systemPostKind !== postPatch.systemPostKind ||
    post.currentPlanningRevision !== postPatch.currentPlanningRevision ||
    post.systemLifecycle !== postPatch.systemLifecycle ||
    ("systemDisposition" in postPatch &&
      post.systemDisposition !== postPatch.systemDisposition) ||
    ("triggeredAt" in postPatch &&
      post.triggeredAt !== postPatch.triggeredAt) ||
    ("triggeredByRole" in postPatch &&
      post.triggeredByRole !== postPatch.triggeredByRole) ||
    ("triggeredByWorkosUserId" in postPatch &&
      post.triggeredByWorkosUserId !== postPatch.triggeredByWorkosUserId) ||
    ("materializedAt" in postPatch &&
      post.materializedAt !== postPatch.materializedAt) ||
    ("historicalBackfill" in postPatch &&
      JSON.stringify(post.historicalBackfill) !==
        JSON.stringify(postPatch.historicalBackfill));
  if (postChanged) {
    await ctx.db.patch(postId, { ...postPatch, updatedAt: now });
    await queueBuildCollaborationSearchOwnerRebuild(ctx, {
      authorization: scope.authorization,
      owner: { id: postId, kind: "post" },
      postId,
    });
  }
  return {
    occurrenceKey,
    plannedDrawId: plannedDraw?._id,
    postId,
  };
}

function drawSystemLifecycleForStatus(
  status:
    | Doc<"plannedDrawScheduleRows">["status"]
    | Doc<"activeBuildDrawRequests">["status"]
): "open" | "resolved" {
  return status === "released" ||
    status === "withdrawn" ||
    status === "cancelled" ||
    status === "rejected"
    ? "resolved"
    : "open";
}

function drawSystemDispositionForStatus(
  status: Doc<"activeBuildDrawRequests">["status"]
) {
  if (status === "released") {
    return "released" as const;
  }
  if (status === "withdrawn") {
    return "withdrawal" as const;
  }
  if (status === "cancelled") {
    return "cancellation" as const;
  }
  if (status === "rejected") {
    return "final_decline" as const;
  }
  return;
}

/**
 * Project a historical canonical lifecycle without emitting collaboration
 * activity. Backfill callers use this after the idempotent ensure path so the
 * post remains a durable, read-safe projection of the source records.
 */
export async function projectHistoricalSystemPostLifecycle(
  ctx: MutationCtx,
  input: {
    buildId: Id<"activeBuilds">;
    lifecycle: "open" | "resolved";
    materializedAt: number;
    organizationId: string;
    postId: Id<"buildCollaborationPosts">;
    historicalBackfill: SystemPostHistoricalBackfill;
  }
) {
  const post = await ctx.db.get(input.postId);
  if (
    !post ||
    post.buildId !== input.buildId ||
    post.organizationId !== input.organizationId ||
    !post.systemPostKind ||
    post.contentState !== "active"
  ) {
    return null;
  }
  const nextState = input.lifecycle === "resolved" ? "resolved" : "open";
  const nextLifecycle = input.lifecycle === "resolved" ? "resolved" : "open";
  const nextSummary =
    input.lifecycle === "resolved"
      ? "Backfilled from existing records."
      : undefined;
  const nextHistoricalBackfill = {
    ...input.historicalBackfill,
    source: "existing_records" as const,
  };
  const nextActivityAt = input.historicalBackfill.historicalAt ?? 0;
  const unchanged =
    post.threadState === nextState &&
    post.systemLifecycle === nextLifecycle &&
    post.resolutionSummary === nextSummary &&
    post.resolvedAt ===
      (input.lifecycle === "resolved"
        ? input.historicalBackfill.historicalAt
        : undefined) &&
    post.resolvedByWorkosUserId ===
      (input.lifecycle === "resolved"
        ? input.historicalBackfill.historicalActorWorkosUserId
        : undefined) &&
    post.lastMeaningfulActivityAt === nextActivityAt &&
    post.latestActivityActorWorkosUserId ===
      input.historicalBackfill.historicalActorWorkosUserId &&
    post.materializedAt === input.materializedAt &&
    JSON.stringify(post.historicalBackfill) ===
      JSON.stringify(nextHistoricalBackfill);
  if (unchanged) {
    return post._id;
  }
  await ctx.db.patch(post._id, {
    historicalBackfill: nextHistoricalBackfill,
    lastMeaningfulActivityAt: nextActivityAt,
    latestActivityActorWorkosUserId:
      input.historicalBackfill.historicalActorWorkosUserId,
    materializedAt: input.materializedAt,
    resolutionSummary: nextSummary,
    resolvedAt:
      input.lifecycle === "resolved"
        ? input.historicalBackfill.historicalAt
        : undefined,
    resolvedByWorkosUserId:
      input.lifecycle === "resolved"
        ? input.historicalBackfill.historicalActorWorkosUserId
        : undefined,
    systemLifecycle: nextLifecycle,
    threadState: nextState,
    updatedAt: input.materializedAt,
  });
  return post._id;
}

/** Synchronize only the existing Draw System Post with canonical lifecycle. */
export async function synchronizeDrawSystemPostLifecycle(
  ctx: MutationCtx,
  input: {
    actorRole: BuildCollaborationRole;
    actorWorkosUserId: string;
    buildId: Id<"activeBuilds">;
    drawRequest?: Doc<"activeBuildDrawRequests">;
    lifecycle: "open" | "resolved";
    occurrenceKey?: string;
    organizationId: string;
    postId?: Id<"buildCollaborationPosts">;
    reason?: string;
  }
) {
  const post =
    (input.postId ? await ctx.db.get(input.postId) : null) ??
    (input.occurrenceKey
      ? await ctx.db
          .query("buildCollaborationPosts")
          .withIndex(
            "by_buildId_and_systemPostKind_and_drawOccurrenceKey",
            (query) =>
              query
                .eq("buildId", input.buildId)
                .eq("systemPostKind", "draw")
                .eq("canonicalBuildDrawOccurrenceKey", input.occurrenceKey!)
          )
          .first()
      : null);
  if (
    !post ||
    post.buildId !== input.buildId ||
    post.organizationId !== input.organizationId ||
    post.systemPostKind !== "draw" ||
    post.contentState !== "active"
  ) {
    return null;
  }
  // A released Draw is immutable from the collaboration surface. A late
  // retry/replay must not reopen it, even if an upstream command is stale.
  if (
    input.lifecycle === "open" &&
    (input.drawRequest?.status === "released" ||
      post.systemDisposition === "released")
  ) {
    return post._id;
  }
  const nextState = input.lifecycle === "resolved" ? "resolved" : "open";
  const nextSystemLifecycle =
    input.lifecycle === "resolved"
      ? "resolved"
      : post.systemLifecycle === "resolved"
        ? "reopened"
        : "open";
  if (
    post.threadState === nextState &&
    post.systemLifecycle === nextSystemLifecycle
  ) {
    return post._id;
  }
  const now = Date.now();
  const priorState = JSON.stringify({
    resolutionSummary: post.resolutionSummary,
    resolvedAt: post.resolvedAt,
    systemLifecycle: post.systemLifecycle,
    threadRevision: post.threadRevision ?? 0,
    threadState: post.threadState,
  });
  const disposition = input.drawRequest
    ? drawSystemDispositionForStatus(input.drawRequest.status)
    : undefined;
  const resolutionSummary =
    input.lifecycle === "resolved"
      ? input.reason?.trim() ||
        (disposition === "released"
          ? "Draw released."
          : disposition === "withdrawal"
            ? "Draw request withdrawn."
            : disposition === "cancellation"
              ? "Draw request cancelled."
              : disposition === "final_decline"
                ? "Draw request finally declined."
                : "Draw disposition recorded.")
      : undefined;
  await ctx.db.patch(post._id, {
    acceptedCommentId: undefined,
    decisionOutcome: undefined,
    decisionOwnerWorkosUserId: undefined,
    lastMeaningfulActivityAt: now,
    latestActivityActorWorkosUserId: input.actorWorkosUserId,
    resolutionSummary,
    ...(disposition ? { systemDisposition: disposition } : {}),
    resolvedAt: input.lifecycle === "resolved" ? now : undefined,
    resolvedByWorkosUserId:
      input.lifecycle === "resolved" ? input.actorWorkosUserId : undefined,
    systemLifecycle: nextSystemLifecycle,
    threadRevision: (post.threadRevision ?? 0) + 1,
    threadState: nextState,
    updatedAt: now,
  });
  await ctx.db.insert("buildCollaborationThreadEvents", {
    actorRole: input.actorRole,
    actorWorkosUserId: input.actorWorkosUserId,
    brokerageId: post.brokerageId,
    buildId: post.buildId,
    createdAt: now,
    eventType: input.lifecycle === "resolved" ? "resolved" : "reopened",
    newState: JSON.stringify({
      resolutionSummary,
      systemLifecycle: nextSystemLifecycle,
      threadState: nextState,
    }),
    organizationId: post.organizationId,
    postId: post._id,
    priorState,
    reason: input.reason,
  });
  await ctx.db.insert("auditEvents", {
    actorRoles: [input.actorRole],
    actorWorkosUserId: input.actorWorkosUserId,
    brokerageId: post.brokerageId,
    command: "synchronizeDrawSystemPostLifecycle",
    createdAt: now,
    entityId: String(post._id),
    entityType: "buildCollaborationPost",
    eventType:
      input.lifecycle === "resolved"
        ? "build.collaboration.thread.resolved"
        : "build.collaboration.thread.reopened",
    newState: JSON.stringify({
      disposition,
      systemLifecycle: nextSystemLifecycle,
      threadState: nextState,
    }),
    organizationId: post.organizationId,
    priorState,
    reason: input.reason,
    warnings: ["canonical_draw_state_is_authoritative"],
  });
  return post._id;
}

/** Ensure and then project the canonical Draw lifecycle into one post. */
export async function synchronizeDrawSystemPostForCanonicalDraw(
  ctx: MutationCtx,
  input: {
    actor: { roles: string[]; workosUserId: string };
    build: Doc<"activeBuilds">;
    drawRequest?: Doc<"activeBuildDrawRequests">;
    plannedDraw?: Doc<"plannedDrawScheduleRows">;
    activationReason: DrawSystemActivationReason;
    reason?: string;
    now?: number;
  }
) {
  const ensured = await ensureDrawSystemPost(ctx, input);
  if (!ensured) {
    return null;
  }
  const status =
    input.drawRequest?.status ?? input.plannedDraw?.status ?? "planned";
  const lifecycle = drawSystemLifecycleForStatus(status);
  const actorRole = resolveEffectiveCollaborationRole(input.actor.roles)?.role;
  await synchronizeDrawSystemPostLifecycle(ctx, {
    actorRole: actorRole ?? "admin",
    actorWorkosUserId: input.actor.workosUserId,
    buildId: input.build._id,
    drawRequest: input.drawRequest,
    lifecycle,
    occurrenceKey: ensured.occurrenceKey,
    organizationId: input.build.organizationId,
    postId: ensured.postId,
    reason: input.reason,
  });
  return ensured;
}
