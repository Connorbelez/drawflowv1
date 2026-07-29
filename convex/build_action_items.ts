import { v } from "convex/values";

import { authenticatedMutation, authenticatedQuery } from "./authz";
import { canReadCollaborationPost } from "./build_collaboration_access";
import { buildActionItemListRowValidator } from "./build_collaboration_contracts";
import { collaborationRoleTier } from "./build_collaboration_model";
import { authorizeActiveBuildCollaborationAccess } from "./build_collaboration_rollout";
import {
  buildActionItemPriorityValidator,
  buildActionItemStatusValidator,
  buildActionRelationKindValidator,
} from "./build_collaboration_validators";
import type { Doc, Id, MutationCtx } from "./types";

const MAX_ACTION_ITEMS_PER_BUILD = 2000;
const MAX_RELATION_WALK = 2000;
const MAX_CHECKLIST_ITEMS = 250;

export const listBuildActionItems = authenticatedQuery
  .input({
    buildId: v.id("activeBuilds"),
    organizationId: v.string(),
    postId: v.optional(v.id("buildCollaborationPosts")),
  })
  .returns(v.array(buildActionItemListRowValidator))
  .handler(async (ctx, args) => {
    const authorization = await authorizeActiveBuildCollaborationAccess(
      ctx,
      args
    );
    const postId = args.postId;
    const items = postId
      ? await ctx.db
          .query("buildActionItems")
          .withIndex("by_originatingPostId_and_status", (query) =>
            query.eq("originatingPostId", postId)
          )
          .take(MAX_ACTION_ITEMS_PER_BUILD)
      : await ctx.db
          .query("buildActionItems")
          .withIndex("by_buildId_and_status_and_updatedAt", (query) =>
            query.eq("buildId", authorization.build._id)
          )
          .take(MAX_ACTION_ITEMS_PER_BUILD);
    const readable: Doc<"buildActionItems">[] = [];
    const postAccess = new Map<string, boolean>();
    for (const item of items) {
      if (item.buildId !== authorization.build._id) {
        continue;
      }
      let canRead = postAccess.get(item.originatingPostId);
      if (canRead === undefined) {
        const post = await ctx.db.get(item.originatingPostId);
        canRead = Boolean(
          post && (await canReadCollaborationPost(ctx, authorization, post))
        );
        postAccess.set(item.originatingPostId, canRead);
      }
      if (canRead) {
        readable.push(item);
      }
    }
    return await Promise.all(
      readable.map(async (item) => ({
        checklist: await ctx.db
          .query("buildActionItemChecklistItems")
          .withIndex("by_actionItemId_and_order", (query) =>
            query.eq("actionItemId", item._id)
          )
          .take(MAX_CHECKLIST_ITEMS),
        item,
        relations: await ctx.db
          .query("buildActionItemRelations")
          .withIndex("by_sourceActionItemId_and_kind", (query) =>
            query.eq("sourceActionItemId", item._id)
          )
          .take(250),
      }))
    );
  })
  .public();

export const updateBuildActionItem = authenticatedMutation
  .input({
    actionItemId: v.id("buildActionItems"),
    assigneeWorkosUserId: v.optional(v.union(v.string(), v.null())),
    blockedReason: v.optional(v.union(v.string(), v.null())),
    buildId: v.id("activeBuilds"),
    cancellationReason: v.optional(v.union(v.string(), v.null())),
    descriptionPlainText: v.optional(v.string()),
    descriptionTiptapJson: v.optional(v.string()),
    dueAt: v.optional(v.union(v.number(), v.null())),
    expectedRevision: v.optional(v.number()),
    organizationId: v.string(),
    priority: v.optional(buildActionItemPriorityValidator),
    requiresAcceptance: v.optional(v.boolean()),
    status: v.optional(buildActionItemStatusValidator),
    title: v.optional(v.string()),
  })
  .returns(v.id("buildActionItems"))
  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: One auditable command validates the full Action Item state transition atomically.
  .handler(async (ctx, args) => {
    const authorization = await authorizeActiveBuildCollaborationAccess(
      ctx,
      args
    );
    const item = await requireReadableActionItem(
      ctx,
      authorization,
      args.actionItemId
    );
    if (
      args.expectedRevision !== undefined &&
      args.expectedRevision !== item.currentRevision
    ) {
      throw new Error(
        "This Action Item changed since you opened it. Refresh and try again."
      );
    }
    const now = Date.now();
    const patch: Partial<Doc<"buildActionItems">> = {
      currentRevision: item.currentRevision + 1,
      updatedAt: now,
    };
    if (args.title !== undefined) {
      const title = args.title.trim();
      if (!title) {
        throw new Error("Action Item title is required.");
      }
      patch.title = title;
    }
    if (args.descriptionPlainText !== undefined) {
      patch.descriptionPlainText = args.descriptionPlainText.trim();
    }
    if (args.descriptionTiptapJson !== undefined) {
      validateTiptapJson(args.descriptionTiptapJson);
      patch.descriptionTiptapJson = args.descriptionTiptapJson;
    }
    if (args.priority !== undefined) {
      patch.priority = args.priority;
    }
    if (args.dueAt !== undefined) {
      patch.dueAt = args.dueAt ?? undefined;
    }
    if (args.requiresAcceptance !== undefined) {
      patch.requiresAcceptance = args.requiresAcceptance;
    }
    if (args.assigneeWorkosUserId !== undefined) {
      const assignee = args.assigneeWorkosUserId?.trim() || undefined;
      const assigneeParticipant = assignee
        ? authorization.participants.find(
            (participant) => participant.workosUserId === assignee
          )
        : undefined;
      if (assignee && !assigneeParticipant) {
        throw new Error("Assignee must participate in this Build.");
      }
      const upwardAssignment =
        assigneeParticipant !== undefined &&
        collaborationRoleTier(assigneeParticipant.role) >
          authorization.effectiveRole.tier;
      const requiresAcceptance =
        (args.requiresAcceptance ?? item.requiresAcceptance) ||
        upwardAssignment;
      patch.assigneeWorkosUserId = assignee;
      patch.assignmentState = assignee
        ? requiresAcceptance || upwardAssignment
          ? "requested"
          : "assigned"
        : "unassigned";
      patch.requiresAcceptance = requiresAcceptance || upwardAssignment;
      patch.assignmentRequestedAt =
        patch.assignmentState === "requested" ? now : undefined;
    }
    if (args.status !== undefined && args.status !== item.status) {
      assertStatusTransition(item.status, args.status);
      patch.status = args.status;
      patch.previousActiveStatus =
        args.status === "cancelled" ? item.status : undefined;
      patch.blockedReason =
        args.status === "blocked"
          ? requireReason(args.blockedReason, "A blocked reason is required.")
          : undefined;
      patch.cancellationReason =
        args.status === "cancelled"
          ? requireReason(
              args.cancellationReason,
              "A cancellation reason is required."
            )
          : undefined;
      patch.completedAt = args.status === "done" ? now : undefined;
    }
    await ctx.db.patch(item._id, patch);
    await ctx.db.insert("buildActionItemEvents", {
      actionItemId: item._id,
      actorRole: authorization.effectiveRole.role,
      actorWorkosUserId: authorization.viewer.subject,
      brokerageId: authorization.brokerage._id,
      buildId: authorization.build._id,
      createdAt: now,
      eventType: "updated",
      newState: JSON.stringify(patch),
      organizationId: authorization.organizationId,
      priorState: JSON.stringify({
        assigneeWorkosUserId: item.assigneeWorkosUserId,
        priority: item.priority,
        status: item.status,
      }),
    });
    if (args.status !== undefined && args.status !== item.status) {
      await updateOriginatingPostOpenCount(ctx, item.originatingPostId);
    }
    return item._id;
  })
  .public();

export const acceptBuildActionItemAssignment = authenticatedMutation
  .input({
    actionItemId: v.id("buildActionItems"),
    buildId: v.id("activeBuilds"),
    organizationId: v.string(),
  })
  .returns(v.id("buildActionItems"))
  .handler(async (ctx, args) => {
    const authorization = await authorizeActiveBuildCollaborationAccess(
      ctx,
      args
    );
    const item = await requireReadableActionItem(
      ctx,
      authorization,
      args.actionItemId
    );
    if (
      item.assigneeWorkosUserId !== authorization.viewer.subject ||
      item.assignmentState !== "requested"
    ) {
      throw new Error("This assignment is not awaiting your acceptance.");
    }
    const now = Date.now();
    await ctx.db.patch(item._id, {
      assignmentState: "assigned",
      currentRevision: item.currentRevision + 1,
      updatedAt: now,
    });
    await ctx.db.insert("buildActionItemEvents", {
      actionItemId: item._id,
      actorRole: authorization.effectiveRole.role,
      actorWorkosUserId: authorization.viewer.subject,
      brokerageId: authorization.brokerage._id,
      buildId: authorization.build._id,
      createdAt: now,
      eventType: "assignment_accepted",
      newState: JSON.stringify({ assignmentState: "assigned" }),
      organizationId: authorization.organizationId,
      priorState: JSON.stringify({ assignmentState: "requested" }),
    });
    return item._id;
  })
  .public();

export const addBuildActionItemChecklistItem = authenticatedMutation
  .input({
    actionItemId: v.id("buildActionItems"),
    buildId: v.id("activeBuilds"),
    label: v.string(),
    organizationId: v.string(),
    required: v.optional(v.boolean()),
  })
  .returns(v.id("buildActionItemChecklistItems"))
  .handler(async (ctx, args) => {
    const authorization = await authorizeActiveBuildCollaborationAccess(
      ctx,
      args
    );
    const item = await requireReadableActionItem(
      ctx,
      authorization,
      args.actionItemId
    );
    const label = args.label.trim();
    if (!label) {
      throw new Error("Checklist label is required.");
    }
    const existing = await ctx.db
      .query("buildActionItemChecklistItems")
      .withIndex("by_actionItemId_and_order", (query) =>
        query.eq("actionItemId", item._id)
      )
      .take(MAX_CHECKLIST_ITEMS);
    if (existing.length >= MAX_CHECKLIST_ITEMS) {
      throw new Error(
        `Action Items may contain at most ${MAX_CHECKLIST_ITEMS} checklist entries.`
      );
    }
    const now = Date.now();
    return await ctx.db.insert("buildActionItemChecklistItems", {
      actionItemId: item._id,
      brokerageId: authorization.brokerage._id,
      buildId: authorization.build._id,
      completed: false,
      createdAt: now,
      label,
      order: existing.length,
      organizationId: authorization.organizationId,
      required: args.required ?? true,
      updatedAt: now,
    });
  })
  .public();

export const toggleBuildActionItemChecklistItem = authenticatedMutation
  .input({
    buildId: v.id("activeBuilds"),
    checklistItemId: v.id("buildActionItemChecklistItems"),
    organizationId: v.string(),
  })
  .returns(v.boolean())
  .handler(async (ctx, args) => {
    const authorization = await authorizeActiveBuildCollaborationAccess(
      ctx,
      args
    );
    const checklist = await ctx.db.get(args.checklistItemId);
    if (!checklist || checklist.buildId !== authorization.build._id) {
      throw new Error("Checklist entry is unavailable.");
    }
    await requireReadableActionItem(ctx, authorization, checklist.actionItemId);
    const completed = !checklist.completed;
    await ctx.db.patch(checklist._id, {
      completed,
      completedAt: completed ? Date.now() : undefined,
      completedByWorkosUserId: completed
        ? authorization.viewer.subject
        : undefined,
      updatedAt: Date.now(),
    });
    return completed;
  })
  .public();

export const linkBuildActionItems = authenticatedMutation
  .input({
    buildId: v.id("activeBuilds"),
    kind: buildActionRelationKindValidator,
    organizationId: v.string(),
    sourceActionItemId: v.id("buildActionItems"),
    targetActionItemId: v.id("buildActionItems"),
  })
  .returns(v.id("buildActionItemRelations"))
  .handler(async (ctx, args) => {
    const authorization = await authorizeActiveBuildCollaborationAccess(
      ctx,
      args
    );
    const [source, target] = await Promise.all([
      requireReadableActionItem(ctx, authorization, args.sourceActionItemId),
      requireReadableActionItem(ctx, authorization, args.targetActionItemId),
    ]);
    if (source._id === target._id) {
      throw new Error("An Action Item cannot relate to itself.");
    }
    const existing = await ctx.db
      .query("buildActionItemRelations")
      .withIndex("by_sourceActionItemId_and_kind", (query) =>
        query.eq("sourceActionItemId", source._id).eq("kind", args.kind)
      )
      .take(250);
    const duplicate = existing.find(
      (relation) =>
        relation.targetActionItemId === target._id &&
        relation.status === "active"
    );
    if (duplicate) {
      return duplicate._id;
    }
    if (
      args.kind === "blocks" &&
      (await wouldCreateBlockingCycle(ctx, source._id, target._id))
    ) {
      throw new Error("This blocking relationship would create a cycle.");
    }
    const now = Date.now();
    return await ctx.db.insert("buildActionItemRelations", {
      brokerageId: authorization.brokerage._id,
      buildId: authorization.build._id,
      createdAt: now,
      createdByWorkosUserId: authorization.viewer.subject,
      kind: args.kind,
      organizationId: authorization.organizationId,
      sourceActionItemId: source._id,
      status: "active",
      targetActionItemId: target._id,
      updatedAt: now,
    });
  })
  .public();

async function requireReadableActionItem(
  ctx: MutationCtx,
  authorization: Awaited<
    ReturnType<typeof authorizeActiveBuildCollaborationAccess>
  >,
  actionItemId: Id<"buildActionItems">
) {
  const item = await ctx.db.get(actionItemId);
  if (
    !item ||
    item.buildId !== authorization.build._id ||
    item.organizationId !== authorization.organizationId
  ) {
    throw new Error("Action Item is unavailable.");
  }
  const post = await ctx.db.get(item.originatingPostId);
  if (!(post && (await canReadCollaborationPost(ctx, authorization, post)))) {
    throw new Error("Action Item is unavailable.");
  }
  return item;
}

function assertStatusTransition(
  current: Doc<"buildActionItems">["status"],
  next: Doc<"buildActionItems">["status"]
) {
  const allowed: Record<
    Doc<"buildActionItems">["status"],
    Doc<"buildActionItems">["status"][]
  > = {
    blocked: ["todo", "in_progress", "cancelled"],
    cancelled: ["todo", "in_progress"],
    done: ["in_progress", "cancelled"],
    in_progress: ["in_review", "blocked", "done", "cancelled"],
    in_review: ["in_progress", "blocked", "done", "cancelled"],
    todo: ["in_progress", "blocked", "done", "cancelled"],
  };
  if (!allowed[current].includes(next)) {
    throw new Error(`Action Item cannot move from ${current} to ${next}.`);
  }
}

function requireReason(value: string | null | undefined, errorMessage: string) {
  const reason = value?.trim();
  if (!reason) {
    throw new Error(errorMessage);
  }
  return reason;
}

function validateTiptapJson(value: string) {
  try {
    const parsed = JSON.parse(value) as { type?: unknown };
    if (parsed.type !== "doc") {
      throw new Error("TipTap document root must have type doc.");
    }
  } catch {
    throw new Error("Action Item description must be valid TipTap JSON.");
  }
}

async function updateOriginatingPostOpenCount(
  ctx: MutationCtx,
  postId: Id<"buildCollaborationPosts">
) {
  const openItems = await ctx.db
    .query("buildActionItems")
    .withIndex("by_originatingPostId_and_status", (query) =>
      query.eq("originatingPostId", postId)
    )
    .take(MAX_ACTION_ITEMS_PER_BUILD);
  const openActionItemCount = openItems.filter(
    (item) => item.status !== "done" && item.status !== "cancelled"
  ).length;
  await ctx.db.patch(postId, {
    openActionItemCount,
    updatedAt: Date.now(),
  });
}

async function wouldCreateBlockingCycle(
  ctx: MutationCtx,
  sourceActionItemId: Id<"buildActionItems">,
  targetActionItemId: Id<"buildActionItems">
) {
  const pending = [targetActionItemId];
  const visited = new Set<string>();
  while (pending.length > 0) {
    const current = pending.shift();
    if (!current) {
      continue;
    }
    if (current === sourceActionItemId) {
      return true;
    }
    if (visited.has(current)) {
      continue;
    }
    visited.add(current);
    if (visited.size > MAX_RELATION_WALK) {
      throw new Error("Action Item relation graph is too large to validate.");
    }
    const relations = await ctx.db
      .query("buildActionItemRelations")
      .withIndex("by_sourceActionItemId_and_kind", (query) =>
        query.eq("sourceActionItemId", current).eq("kind", "blocks")
      )
      .take(250);
    for (const relation of relations) {
      if (relation.status === "active") {
        pending.push(relation.targetActionItemId);
      }
    }
  }
  return false;
}
