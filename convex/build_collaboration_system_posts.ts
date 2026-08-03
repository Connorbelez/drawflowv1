import type { ActiveBuildAuthorization } from "./activeBuildAccess";
import { buildActionItemQueueSortAt } from "./build_action_item_deadline_model";
import { recordBuildActionItemRevision } from "./build_action_item_history";
import {
  linkBuildActionItemToPost,
  syncLinkedActionItemPostCounts,
} from "./build_action_item_post_links";
import {
  type BuildCollaborationRole,
  resolveEffectiveCollaborationRole,
} from "./build_collaboration_model";
import { queueBuildCollaborationSearchOwnerRebuild } from "./build_collaboration_search_maintenance";
import {
  publishCanonicalBuildCollaborationSystemEvent,
  resolveSystemEventScope,
} from "./build_collaboration_system_events";
import type { Doc, Id, MutationCtx } from "./types";

const SYSTEM_AUTHOR = "system";
const SYSTEM_LABEL = "DrawFlow System";

export type MilestoneSystemActivationReason =
  | "explicit_start"
  | "recovery"
  | "scheduled";

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
  }
) {
  const occurrenceKey = `milestone-system:${input.build._id}:${input.milestone._id}`;
  const postId = await publishCanonicalBuildCollaborationSystemEvent(ctx, {
    buildId: input.build._id,
    idempotencyKey: occurrenceKey,
    organizationId: input.build.organizationId,
    plainText: `${input.milestone.name} started. Canonical Sub-milestone cards are synchronized from the roadmap.`,
    postType: "update",
    primaryReferenceId: String(input.milestone._id),
    primaryReferenceKind: "milestone",
    systemPostKind: "milestone",
    systemLabel: SYSTEM_LABEL,
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

  const post = await ctx.db.get(postId);
  if (!post || post.buildId !== input.build._id) {
    throw new Error("Milestone System Post became unavailable.");
  }
  const now = Date.now();
  const triggeredByRole = resolveEffectiveCollaborationRole(
    input.actor.roles
  )?.role;
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

  await ctx.db.patch(postId, {
    activationReason: post.activationReason ?? input.activationReason,
    authorDisplayNameSnapshot: SYSTEM_LABEL,
    authorRolesSnapshot: ["system"],
    authorWorkosUserId: SYSTEM_AUTHOR,
    canonicalBuildMilestoneId: input.milestone._id,
    systemEventKey: occurrenceKey,
    systemOccurrenceKey: occurrenceKey,
    systemPostKind: "milestone",
    triggeredAt: post.triggeredAt ?? now,
    triggeredByRole: post.triggeredByRole ?? triggeredByRole,
    triggeredByWorkosUserId:
      post.triggeredByWorkosUserId ?? input.actor.workosUserId,
    updatedAt: now,
  });

  const generatedActionItemIds: Id<"buildActionItems">[] = [];
  for (const submilestone of submilestones) {
    generatedActionItemIds.push(
      await ensureGeneratedSubmilestoneActionItem(ctx, {
        authorization: scope.authorization,
        milestone: input.milestone,
        now,
        postId,
        submilestone,
      })
    );
  }
  await syncPostCounts(ctx, generatedActionItemIds, now);

  await queueBuildCollaborationSearchOwnerRebuild(ctx, {
    authorization: scope.authorization,
    owner: { id: postId, kind: "post" },
    postId,
  });
  return {
    actionItemIds: generatedActionItemIds,
    postId,
    recoveryRequired: submilestones.length === 0,
  };
}

async function ensureGeneratedSubmilestoneActionItem(
  ctx: MutationCtx,
  input: {
    authorization: ActiveBuildAuthorization;
    milestone: Doc<"buildMilestones">;
    now: number;
    postId: Id<"buildCollaborationPosts">;
    submilestone: Doc<"buildSubmilestones">;
  }
) {
  const existing = (
    await ctx.db
      .query("buildActionItems")
      .withIndex("by_originatingPostId_and_createdAt", (query) =>
        query.eq("originatingPostId", input.postId)
      )
      .take(500)
  ).find(
    (item) =>
      item.systemMode === "generated_milestone_submilestone" &&
      item.canonicalBuildSubmilestoneId === input.submilestone._id
  );
  if (existing) {
    if (
      existing.canonicalBuildMilestoneId !== input.milestone._id ||
      existing.canonicalBindingRevision !==
        (input.milestone.collaborationEventRevision ?? 1)
    ) {
      await ctx.db.patch(existing._id, {
        canonicalBuildMilestoneId: input.milestone._id,
        canonicalBindingRevision:
          input.milestone.collaborationEventRevision ?? 1,
        title: input.submilestone.name,
        updatedAt: input.now,
      });
    }
    return existing._id;
  }

  const title = input.submilestone.name.trim() || "Unnamed Sub-milestone";
  const description = `Canonical Sub-milestone: ${title}. This card mirrors the roadmap state and cannot be completed independently.`;
  const actionItemId = await ctx.db.insert("buildActionItems", {
    assignmentState: "unassigned",
    brokerageId: input.authorization.brokerage._id,
    buildId: input.authorization.build._id,
    canonicalBindingRevision: input.milestone.collaborationEventRevision ?? 1,
    canonicalBuildMilestoneId: input.milestone._id,
    canonicalBuildSubmilestoneId: input.submilestone._id,
    createdAt: input.now,
    creatorRole: "admin",
    creatorWorkosUserId: SYSTEM_AUTHOR,
    currentRevision: 1,
    descriptionPlainText: description,
    descriptionTiptapJson: plainTextDocument(description),
    originatingPostId: input.postId,
    organizationId: input.authorization.organizationId,
    priority: "none",
    queueSortAt: buildActionItemQueueSortAt(undefined, "todo"),
    requiresAcceptance: false,
    status: "todo",
    systemMode: "generated_milestone_submilestone",
    title,
    updatedAt: input.now,
    workKind: "ordinary",
  });
  const item = await ctx.db.get(actionItemId);
  if (!item) {
    throw new Error("Generated Milestone Action Item became unavailable.");
  }
  await Promise.all([
    linkBuildActionItemToPost(ctx, {
      actionItemId,
      brokerageId: input.authorization.brokerage._id,
      buildId: input.authorization.build._id,
      createdAt: input.now,
      linkKind: "originating",
      organizationId: input.authorization.organizationId,
      postId: input.postId,
    }),
    recordBuildActionItemRevision(ctx, {
      authorization: input.authorization,
      item,
      now: input.now,
      reason: "canonical_milestone_start",
    }),
    ctx.db.insert("buildActionItemEvents", {
      actionItemId,
      actorRole: "admin",
      actorWorkosUserId: SYSTEM_AUTHOR,
      brokerageId: input.authorization.brokerage._id,
      buildId: input.authorization.build._id,
      createdAt: input.now,
      eventType: "created_by_canonical_milestone",
      exercisedAuthority: "canonical_milestone",
      newState: JSON.stringify({
        canonicalBuildMilestoneId: input.milestone._id,
        canonicalBuildSubmilestoneId: input.submilestone._id,
        status: "todo",
        systemMode: "generated_milestone_submilestone",
      }),
      organizationId: input.authorization.organizationId,
      revision: 1,
      warnings: ["canonical_state_is_authoritative"],
    }),
    ctx.db.insert("buildActionItemCreationRequests", {
      actionItemId,
      brokerageId: input.authorization.brokerage._id,
      buildId: input.authorization.build._id,
      createdAt: input.now,
      creatorWorkosUserId: SYSTEM_AUTHOR,
      organizationId: input.authorization.organizationId,
      postId: input.postId,
      requestId: `milestone-system:${input.milestone._id}:${input.submilestone._id}`,
    }),
    ctx.db.insert("buildCollaborationReferences", {
      actionItemQueueSortAt: item.queueSortAt,
      brokerageId: input.authorization.brokerage._id,
      buildId: input.authorization.build._id,
      createdAt: input.now,
      entityId: String(input.submilestone._id),
      entityKind: "submilestone",
      labelSnapshot: input.submilestone.name,
      organizationId: input.authorization.organizationId,
      ownerKind: "actionItem",
      ownerRecordId: actionItemId,
      postId: input.postId,
      primary: true,
      summarySnapshot: description,
    }),
    ctx.db.insert("buildCollaborationReferences", {
      actionItemQueueSortAt: item.queueSortAt,
      brokerageId: input.authorization.brokerage._id,
      buildId: input.authorization.build._id,
      createdAt: input.now,
      entityId: String(input.milestone._id),
      entityKind: "milestone",
      labelSnapshot: input.milestone.name,
      organizationId: input.authorization.organizationId,
      ownerKind: "actionItem",
      ownerRecordId: actionItemId,
      postId: input.postId,
      primary: false,
      summarySnapshot: "Canonical Milestone binding",
    }),
    ctx.db.insert("buildCollaborationActivityProjections", {
      actionItemId,
      actorWorkosUserId: SYSTEM_AUTHOR,
      brokerageId: input.authorization.brokerage._id,
      buildId: input.authorization.build._id,
      createdAt: input.now,
      eventType: "created_by_canonical_milestone",
      organizationId: input.authorization.organizationId,
      postId: input.postId,
      projectionKey: `milestone-system:${input.milestone._id}:${input.submilestone._id}`,
      targetId: String(input.submilestone._id),
      targetKind: "submilestone",
    }),
    ctx.db.insert("auditEvents", {
      actorRoles: ["system"],
      actorWorkosUserId: SYSTEM_AUTHOR,
      brokerageId: input.authorization.brokerage._id,
      command: "ensureMilestoneSystemPost",
      createdAt: input.now,
      entityId: actionItemId,
      entityType: "buildActionItem",
      eventType: "build.collaboration.action_item.canonical_milestone_created",
      newState: JSON.stringify({
        actionItemId,
        canonicalBuildMilestoneId: input.milestone._id,
        canonicalBuildSubmilestoneId: input.submilestone._id,
        postId: input.postId,
      }),
      organizationId: input.authorization.organizationId,
      warnings: ["canonical_state_is_authoritative"],
    }),
    ctx.db.insert("eventOutbox", {
      brokerageId: input.authorization.brokerage._id,
      createdAt: input.now,
      eventType: "build.collaboration.action_item.canonical_milestone_created",
      organizationId: input.authorization.organizationId,
      payloadPreview: JSON.stringify({
        actionItemId,
        canonicalBuildMilestoneId: input.milestone._id,
        canonicalBuildSubmilestoneId: input.submilestone._id,
      }),
      relatedEntityId: actionItemId,
      relatedEntityType: "buildActionItem",
      status: "pending",
    }),
  ]);
  return actionItemId;
}

async function syncPostCounts(
  ctx: MutationCtx,
  actionItemIds: Id<"buildActionItems">[],
  now: number
) {
  for (const actionItemId of actionItemIds) {
    await syncLinkedActionItemPostCounts(ctx, {
      actionItemId,
      actorWorkosUserId: SYSTEM_AUTHOR,
      now,
    });
  }
}

function plainTextDocument(value: string) {
  return JSON.stringify({
    content: [
      {
        content: [{ text: value, type: "text" }],
        type: "paragraph",
      },
    ],
    type: "doc",
  });
}

export function milestoneSystemTriggerRole(
  roles: readonly string[]
): BuildCollaborationRole | undefined {
  return resolveEffectiveCollaborationRole(roles)?.role;
}
