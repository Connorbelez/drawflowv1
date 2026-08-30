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


import { ensureMilestoneSystemPost } from "./activation";
import {
  ensureGeneratedSubmilestoneActionItem,
  syncPostCounts,
} from "./action_items";
const SYSTEM_AUTHOR = "system";
const SYSTEM_LABEL = "DrawFlow System";

/**
 * Materialize stable, silent collaboration identity for every active
 * Milestone in an approved Build plan. This is used at Build activation so a
 * Sub-milestone has one companion before any execution command can run.
 */
export async function ensureApprovedBuildSubmilestoneCompanions(
  ctx: MutationCtx,
  input: {
    actor: { roles: string[]; workosUserId: string };
    build: Doc<"activeBuilds">;
  }
) {
  const milestones = await ctx.db
    .query("buildMilestones")
    .withIndex("by_build", (query) => query.eq("buildId", input.build._id))
    .take(501);
  if (milestones.length > 500) {
    throw new Error(
      "Approved Build plan exceeds the 500 Milestone companion safety limit."
    );
  }
  const postIds: Id<"buildCollaborationPosts">[] = [];
  for (const milestone of milestones) {
    if (milestone.planningState === "superseded") {
      continue;
    }
    const postId = await synchronizeMilestoneSystemPostPlanning(ctx, {
      actor: input.actor,
      build: input.build,
      milestone,
    });
    if (postId) {
      postIds.push(postId);
    }
  }
  return postIds;
}

/**
 * Refresh an existing Milestone System Post after an approved planning write.
 * Unlike activation, this function never creates a second post or mutates
 * canonical execution state. It is intentionally idempotent for retries.
 */
export async function synchronizeMilestoneSystemPostPlanning(
  ctx: MutationCtx,
  input: {
    actor: { roles: string[]; workosUserId: string };
    build: Doc<"activeBuilds">;
    milestone: Doc<"buildMilestones">;
  }
) {
  const posts = await ctx.db
    .query("buildCollaborationPosts")
    .withIndex(
      "by_buildId_and_systemPostKind_and_canonicalBuildMilestoneId",
      (query) =>
        query
          .eq("buildId", input.build._id)
          .eq("systemPostKind", "milestone")
          .eq("canonicalBuildMilestoneId", input.milestone._id)
    )
    .take(2);
  if (posts.length > 1) {
    throw new Error(
      "Canonical Milestone has duplicate collaboration System Posts."
    );
  }
  const post = posts[0];
  if (!post) {
    if (input.milestone.planningState === "superseded") {
      return null;
    }
    const ensured = await ensureMilestoneSystemPost(ctx, {
      actor: input.actor,
      activationReason: "plan_activated",
      build: input.build,
      milestone: input.milestone,
    });
    return ensured?.postId ?? null;
  }
  const scope = await resolveSystemEventScope(
    ctx,
    {
      buildId: input.build._id,
      idempotencyKey: `${post.systemOccurrenceKey ?? post._id}:scope`,
      organizationId: input.build.organizationId,
      plainText: "Milestone System Post authorization scope.",
      postType: "update",
      systemLabel: SYSTEM_LABEL,
    },
    `${post.systemOccurrenceKey ?? post._id}:scope`
  );
  if (scope.status !== "ready") {
    return null;
  }
  const revision = await ctx.db
    .query("activeBuildPlanningRevisions")
    .withIndex("by_build_revision", (query) =>
      query.eq("buildId", input.build._id)
    )
    .order("desc")
    .take(1)
    .then((rows) => rows[0]);
  const submilestones = await ctx.db
    .query("buildSubmilestones")
    .withIndex("by_milestone", (query) =>
      query.eq("buildMilestoneId", input.milestone._id)
    )
    .take(500);
  const actionItemIds: Id<"buildActionItems">[] = [];
  let changed = false;
  for (const submilestone of submilestones) {
    const ensured = await ensureGeneratedSubmilestoneActionItem(ctx, {
      authorization: scope.authorization,
      milestone: input.milestone,
      now: Date.now(),
      postId: post._id,
      submilestone,
      silentOperationalEffects: post.systemLifecycle === "latent",
    });
    actionItemIds.push(ensured.actionItemId);
    changed ||= ensured.changed;
  }
  const patch = {
    ...(revision ? { currentPlanningRevision: revision.revision } : {}),
    updatedAt: Date.now(),
  };
  if (revision && post.currentPlanningRevision !== revision.revision) {
    await ctx.db.patch(post._id, patch);
    changed = true;
  }
  if (changed && actionItemIds.length > 0) {
    await syncPostCounts(ctx, actionItemIds, Date.now());
  }
  return post._id;
}

/**
 * Synchronize the collaboration projection after a canonical Milestone review
 * command.  The review module owns approval state; this helper only updates
 * the existing System Post lifecycle and appends its collaboration history.
 */
export async function synchronizeMilestoneSystemPostLifecycle(
  ctx: MutationCtx,
  input: {
    actorRole: BuildCollaborationRole;
    actorWorkosUserId: string;
    buildId: Id<"activeBuilds">;
    lifecycle: "open" | "resolved";
    organizationId: string;
    postId: Id<"buildCollaborationPosts">;
    reason?: string;
  }
) {
  const post = await ctx.db.get(input.postId);
  if (
    !post ||
    post.buildId !== input.buildId ||
    post.organizationId !== input.organizationId ||
    post.systemPostKind !== "milestone" ||
    post.contentState !== "active"
  ) {
    return null;
  }
  const nextState = input.lifecycle === "resolved" ? "resolved" : "open";
  if (post.threadState === nextState) {
    return post._id;
  }
  const now = Date.now();
  const priorState = JSON.stringify({
    resolutionSummary: post.resolutionSummary,
    resolvedAt: post.resolvedAt,
    threadRevision: post.threadRevision ?? 0,
    threadState: post.threadState,
  });
  await ctx.db.patch(post._id, {
    acceptedCommentId: undefined,
    decisionOutcome: undefined,
    decisionOwnerWorkosUserId: undefined,
    lastMeaningfulActivityAt: now,
    latestActivityActorWorkosUserId: input.actorWorkosUserId,
    resolutionSummary:
      input.lifecycle === "resolved"
        ? input.reason?.trim() || "Milestone approved."
        : undefined,
    resolvedAt: input.lifecycle === "resolved" ? now : undefined,
    resolvedByWorkosUserId:
      input.lifecycle === "resolved" ? input.actorWorkosUserId : undefined,
    threadRevision: (post.threadRevision ?? 0) + 1,
    threadState: nextState,
    systemLifecycle:
      input.lifecycle === "resolved"
        ? "resolved"
        : post.systemLifecycle === "resolved"
          ? "reopened"
          : "open",
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
      resolutionSummary:
        input.lifecycle === "resolved"
          ? input.reason?.trim() || "Milestone approved."
          : undefined,
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
    command:
      input.lifecycle === "resolved"
        ? "approveActiveBuildMilestoneReview"
        : "retractActiveBuildMilestoneApproval",
    createdAt: now,
    entityId: String(post._id),
    entityType: "buildCollaborationPost",
    eventType:
      input.lifecycle === "resolved"
        ? "build.collaboration.thread.resolved"
        : "build.collaboration.thread.reopened",
    newState: JSON.stringify({ threadState: nextState }),
    organizationId: post.organizationId,
    priorState,
    reason: input.reason,
    warnings: [],
  });
  return post._id;
}
