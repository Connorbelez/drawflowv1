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
import type { Doc, Id, MutationCtx } from "../types";

const SYSTEM_AUTHOR = "system";

export async function ensureGeneratedSubmilestoneActionItem(
  ctx: MutationCtx,
  input: {
    authorization: ActiveBuildAuthorization;
    milestone: Doc<"buildMilestones">;
    now: number;
    postId: Id<"buildCollaborationPosts">;
    submilestone: Doc<"buildSubmilestones">;
    silentOperationalEffects?: boolean;
  }
): Promise<{ actionItemId: Id<"buildActionItems">; changed: boolean }> {
  const title = input.submilestone.name.trim() || "Unnamed Sub-milestone";
  const matches = await ctx.db
    .query("buildActionItems")
    .withIndex("by_canonicalBuildSubmilestoneId_and_systemMode", (query) =>
      query
        .eq("canonicalBuildSubmilestoneId", input.submilestone._id)
        .eq("systemMode", "generated_milestone_submilestone")
    )
    .take(2);
  if (matches.length > 1) {
    throw new Error(
      "Canonical Sub-milestone has duplicate collaboration companions."
    );
  }
  const existing = matches[0];
  if (existing) {
    if (
      existing.buildId !== input.authorization.build._id ||
      existing.organizationId !== input.authorization.organizationId ||
      existing.brokerageId !== input.authorization.brokerage._id ||
      existing.originatingPostId !== input.postId
    ) {
      throw new Error(
        "Canonical Sub-milestone companion binding has invalid tenant or parent scope."
      );
    }
    const canonicalPlanningState = input.submilestone.planningState ?? "active";
    const nextCanonicalBindingRevision =
      input.milestone.collaborationEventRevision ?? 1;
    const changed =
      existing.canonicalCompanionDisposition !== "active" ||
      existing.canonicalBuildMilestoneId !== input.milestone._id ||
      existing.canonicalBindingRevision !== nextCanonicalBindingRevision ||
      existing.canonicalPlanningState !== canonicalPlanningState ||
      existing.title !== title;
    if (changed) {
      await ctx.db.patch(existing._id, {
        canonicalCompanionDisposition: "active",
        canonicalCompanionSupersededAt: undefined,
        canonicalCompanionSurvivorId: undefined,
        canonicalBuildMilestoneId: input.milestone._id,
        canonicalBindingRevision: nextCanonicalBindingRevision,
        canonicalPlanningState,
        currentRevision: existing.currentRevision + 1,
        title,
        updatedAt: input.now,
      });
      const updated = await ctx.db.get(existing._id);
      if (!updated) {
        throw new Error("Generated Milestone Action Item became unavailable.");
      }
      if (!input.silentOperationalEffects) {
        await Promise.all([
          recordBuildActionItemRevision(ctx, {
            authorization: input.authorization,
            item: updated,
            now: input.now,
            reason: "canonical_planning_revision",
          }),
          ctx.db.insert("buildActionItemEvents", {
            actionItemId: existing._id,
            actorRole: input.authorization.effectiveRole.role,
            actorWorkosUserId: input.authorization.viewer.subject,
            brokerageId: input.authorization.brokerage._id,
            buildId: input.authorization.build._id,
            createdAt: input.now,
            eventType: "canonical_planning_revision",
            exercisedAuthority: "canonical_milestone",
            newState: JSON.stringify({
              canonicalBuildMilestoneId: input.milestone._id,
              canonicalBuildSubmilestoneId: input.submilestone._id,
              canonicalPlanningState,
              revision: updated.currentRevision,
            }),
            organizationId: input.authorization.organizationId,
            priorState: JSON.stringify({
              canonicalBuildMilestoneId: existing.canonicalBuildMilestoneId,
              canonicalPlanningState:
                existing.canonicalPlanningState ?? "active",
              revision: existing.currentRevision,
            }),
            revision: updated.currentRevision,
            warnings: ["canonical_state_is_authoritative"],
          }),
        ]);
      }
      return { actionItemId: existing._id, changed: true };
    }
    return { actionItemId: existing._id, changed: false };
  }

  const description = `Canonical Sub-milestone: ${title}. This card mirrors the roadmap state and cannot be completed independently.`;
  const actionItemId = await ctx.db.insert("buildActionItems", {
    assignmentState: "unassigned",
    brokerageId: input.authorization.brokerage._id,
    buildId: input.authorization.build._id,
    canonicalBindingRevision: input.milestone.collaborationEventRevision ?? 1,
    canonicalBuildMilestoneId: input.milestone._id,
    canonicalBuildSubmilestoneId: input.submilestone._id,
    canonicalCompanionDisposition: "active",
    canonicalPlanningState: input.submilestone.planningState ?? "active",
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
  await linkBuildActionItemToPost(ctx, {
    actionItemId,
    brokerageId: input.authorization.brokerage._id,
    buildId: input.authorization.build._id,
    createdAt: input.now,
    linkKind: "originating",
    organizationId: input.authorization.organizationId,
    postId: input.postId,
  });
  if (!input.silentOperationalEffects) {
    await Promise.all([
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
    ]);
  }
  await Promise.all([
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
    ...(input.silentOperationalEffects
      ? []
      : [
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
            eventType:
              "build.collaboration.action_item.canonical_milestone_created",
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
            eventType:
              "build.collaboration.action_item.canonical_milestone_created",
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
        ]),
  ]);
  return { actionItemId, changed: true };
}

export async function syncPostCounts(
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

/** Update the canonical open-item count without creating activity records. */
export async function syncPostCountsSilently(
  ctx: MutationCtx,
  postId: Id<"buildCollaborationPosts">
) {
  const post = await ctx.db.get(postId);
  if (!post) {
    return;
  }
  const linkedItems = await ctx.db
    .query("buildActionItems")
    .withIndex("by_originatingPostId_and_createdAt", (query) =>
      query.eq("originatingPostId", postId)
    )
    .take(1001);
  if (linkedItems.length > 1000) {
    throw new Error(
      "System Post Action Item count exceeds the supported safety limit."
    );
  }
  const openActionItemCount = linkedItems.filter(
    (item) => item.status !== "done" && item.status !== "cancelled"
  ).length;
  await ctx.db.patch(postId, { openActionItemCount });
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
