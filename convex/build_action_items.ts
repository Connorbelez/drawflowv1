import { v } from "convex/values";

import { authenticatedMutation, authenticatedQuery } from "./authz";
import { recordBuildActionItemRevision } from "./build_action_item_history";
import {
  authorizeBuildActionItemOperation,
  type BuildActionItemAuthorizationDecision,
  type BuildActionItemOperation,
} from "./build_action_item_rbac";
import {
  canReadCollaborationPost,
  resolveCurrentCollaborationPostReaderIds,
} from "./build_collaboration_access";
import { authorizeActiveBuildHumanCollaborationAccess } from "./build_collaboration_actor";
import { canUseCollaborationAssetForPost } from "./build_collaboration_asset_access";
import { buildActionItemListRowValidator } from "./build_collaboration_contracts";
import { collaborationRoleTier } from "./build_collaboration_model";
import {
  canonicalizeTiptapReferences,
  referenceInputValidator,
} from "./build_collaboration_publication_bundle";
import {
  type CanonicalBuildCollaborationReference,
  resolveCanonicalBuildCollaborationReferences,
} from "./build_collaboration_references";
import { authorizeActiveBuildCollaborationAccess } from "./build_collaboration_rollout";
import {
  buildActionItemPriorityValidator,
  buildActionItemStatusValidator,
  buildActionRelationKindValidator,
} from "./build_collaboration_validators";
import type { Doc, Id, MutationCtx, QueryCtx } from "./types";

const MAX_ACTION_ITEMS_PER_BUILD = 2000;
const MAX_RELATION_WALK = 2000;
const MAX_CHECKLIST_ITEMS = 250;

export const createBuildActionItem = authenticatedMutation
  .input({
    assigneeWorkosUserId: v.optional(v.string()),
    buildId: v.id("activeBuilds"),
    descriptionPlainText: v.optional(v.string()),
    descriptionTiptapJson: v.optional(v.string()),
    dueAt: v.optional(v.number()),
    attachmentAssetIds: v.optional(v.array(v.id("buildCollaborationAssets"))),
    labels: v.optional(v.array(v.string())),
    organizationId: v.string(),
    postId: v.id("buildCollaborationPosts"),
    priority: v.optional(buildActionItemPriorityValidator),
    references: v.optional(v.array(referenceInputValidator)),
    requestId: v.optional(v.string()),
    requiresAcceptance: v.optional(v.boolean()),
    title: v.string(),
  })
  .returns(v.id("buildActionItems"))
  .handler(async (ctx, args) => {
    const authorization = await authorizeActiveBuildHumanCollaborationAccess(
      ctx,
      args
    );
    const post = await ctx.db.get(args.postId);
    if (
      !post ||
      post.buildId !== authorization.build._id ||
      post.organizationId !== authorization.organizationId ||
      !(await canReadCollaborationPost(ctx, authorization, post))
    ) {
      throw new Error("Action Item parent post is unavailable.");
    }
    const { replayActionItemId, requestId } =
      await resolveActionItemCreationReplay(ctx, {
        authorization,
        postId: post._id,
        requestId: args.requestId,
      });
    if (replayActionItemId) {
      return replayActionItemId;
    }
    const title = args.title.trim();
    if (!title) {
      throw new Error("Action Item title is required.");
    }
    const submittedDescriptionTiptapJson =
      args.descriptionTiptapJson ??
      JSON.stringify({ content: [], type: "doc" });
    validateTiptapJson(submittedDescriptionTiptapJson);
    const readerIds = await resolveCurrentCollaborationPostReaderIds(
      ctx,
      authorization,
      post
    );
    const references = await resolveCanonicalBuildCollaborationReferences(ctx, {
      authorization,
      readerIds,
      references: args.references ?? [],
    });
    const description = canonicalizeTiptapReferences(
      submittedDescriptionTiptapJson,
      references,
      { allowEmpty: true }
    );
    const primaryReference =
      references.find((reference) => reference.primary) ?? references[0];
    const { assignee, assignmentState, requiresAcceptance, upwardAssignment } =
      await resolveNewActionItemAssignment(ctx, authorization, post._id, {
        assigneeWorkosUserId: args.assigneeWorkosUserId,
        requiresAcceptance: args.requiresAcceptance,
      });
    const now = Date.now();
    const actionItemId = await ctx.db.insert("buildActionItems", {
      assigneeWorkosUserId: assignee,
      assignedByWorkosUserId: assignee
        ? authorization.viewer.subject
        : undefined,
      assignmentRequestedAt: assignmentState === "requested" ? now : undefined,
      assignmentState,
      brokerageId: authorization.brokerage._id,
      buildId: authorization.build._id,
      createdAt: now,
      creatorRole: authorization.effectiveRole.role,
      creatorWorkosUserId: authorization.viewer.subject,
      currentRevision: 1,
      descriptionPlainText:
        description.plainText || args.descriptionPlainText?.trim() || "",
      descriptionTiptapJson: description.tiptapJson,
      dueAt: args.dueAt,
      originatingPostId: post._id,
      organizationId: authorization.organizationId,
      priority: args.priority ?? "none",
      primaryReferenceId: primaryReference?.entityId,
      primaryReferenceKind: primaryReference?.entityKind,
      requiresAcceptance,
      status: "todo",
      title,
      updatedAt: now,
    });
    await ctx.db.insert("buildActionItemEvents", {
      actionItemId,
      actorRole: authorization.effectiveRole.role,
      actorWorkosUserId: authorization.viewer.subject,
      brokerageId: authorization.brokerage._id,
      buildId: authorization.build._id,
      createdAt: now,
      eventType: "created",
      exercisedAuthority: "reader",
      newState: JSON.stringify({
        assigneeWorkosUserId: assignee,
        assignmentState,
        priority: args.priority ?? "none",
        requiresAcceptance,
        status: "todo",
        title,
      }),
      organizationId: authorization.organizationId,
      revision: 1,
      warnings: upwardAssignment ? ["assignment_requested"] : undefined,
    });
    const createdItem = await ctx.db.get(actionItemId);
    if (!createdItem) {
      throw new Error("Action Item became unavailable during creation.");
    }
    await Promise.all([
      recordBuildActionItemRevision(ctx, {
        authorization,
        item: createdItem,
        now,
      }),
      persistBuildActionItemLabels(ctx, {
        actionItemId,
        authorization,
        labels: args.labels ?? [],
        now,
      }),
      persistBuildActionItemAttachments(ctx, {
        actionItemId,
        assetIds: args.attachmentAssetIds ?? [],
        authorization,
        now,
        post,
      }),
      persistBuildActionItemReferences(ctx, {
        actionItemId,
        authorization,
        now,
        postId: post._id,
        references,
      }),
      persistBuildActionItemActivity(ctx, {
        actionItemId,
        authorization,
        now,
        postId: post._id,
        references,
      }),
      ctx.db.insert("auditEvents", {
        actorRoles: authorization.roles,
        actorWorkosUserId: authorization.viewer.subject,
        brokerageId: authorization.brokerage._id,
        command: "createBuildActionItem",
        createdAt: now,
        entityId: actionItemId,
        entityType: "buildActionItem",
        eventType: "build.collaboration.action_item.created",
        newState: JSON.stringify({
          actionItemId,
          postId: post._id,
          revision: 1,
        }),
        organizationId: authorization.organizationId,
        warnings: upwardAssignment ? ["assignment_requested"] : [],
      }),
      ctx.db.insert("eventOutbox", {
        brokerageId: authorization.brokerage._id,
        createdAt: now,
        eventType: "build.collaboration.action_item.created",
        organizationId: authorization.organizationId,
        payloadPreview: JSON.stringify({
          actionItemId,
          buildId: authorization.build._id,
          postId: post._id,
        }),
        relatedEntityId: actionItemId,
        relatedEntityType: "buildActionItem",
        status: "pending",
      }),
    ]);
    if (requestId) {
      await ctx.db.insert("buildActionItemCreationRequests", {
        actionItemId,
        brokerageId: authorization.brokerage._id,
        buildId: authorization.build._id,
        createdAt: now,
        creatorWorkosUserId: authorization.viewer.subject,
        organizationId: authorization.organizationId,
        postId: post._id,
        requestId,
      });
    }
    await ctx.db.patch(post._id, {
      lastMeaningfulActivityAt: now,
      latestActivityActorWorkosUserId: authorization.viewer.subject,
      openActionItemCount: post.openActionItemCount + 1,
      updatedAt: now,
    });
    return actionItemId;
  })
  .public();

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
    reason: v.optional(v.string()),
    requiresAcceptance: v.optional(v.boolean()),
    status: v.optional(buildActionItemStatusValidator),
    title: v.optional(v.string()),
  })
  .returns(v.id("buildActionItems"))
  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: One auditable command validates the full Action Item state transition atomically.
  .handler(async (ctx, args) => {
    const authorization = await authorizeActiveBuildHumanCollaborationAccess(
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
    if (
      args.requiresAcceptance === false &&
      mandatoryCompletionAcceptanceApplies(authorization, item) &&
      retainsCurrentAssignee(item, args.assigneeWorkosUserId)
    ) {
      throw new Error(
        "Completion acceptance is mandatory for this upward assignment."
      );
    }
    const decisions: BuildActionItemAuthorizationDecision[] = [];
    if (
      args.title !== undefined ||
      args.descriptionPlainText !== undefined ||
      args.descriptionTiptapJson !== undefined ||
      args.priority !== undefined ||
      args.dueAt !== undefined ||
      args.requiresAcceptance !== undefined
    ) {
      decisions.push(
        assertActionItemOperation(authorization, item, "edit_fields")
      );
    }
    const requestedAssignee =
      args.assigneeWorkosUserId === undefined
        ? undefined
        : args.assigneeWorkosUserId?.trim() || null;
    const assigneeParticipant = requestedAssignee
      ? authorization.participants.find(
          (participant) => participant.workosUserId === requestedAssignee
        )
      : undefined;
    if (requestedAssignee !== undefined) {
      if (requestedAssignee && !assigneeParticipant) {
        throw new Error("Assignee must actively participate in this Build.");
      }
      if (requestedAssignee) {
        await requirePostReader(
          ctx,
          authorization,
          item.originatingPostId,
          requestedAssignee
        );
      }
      decisions.push(
        assertActionItemOperation(authorization, item, "assign", {
          targetAssignee: assigneeParticipant
            ? {
                role: assigneeParticipant.role,
                workosUserId: assigneeParticipant.workosUserId,
              }
            : null,
        })
      );
    }
    if (args.status !== undefined && args.status !== item.status) {
      const operation = statusOperation(item, args.status);
      decisions.push(
        assertActionItemOperation(authorization, item, operation, {
          nextStatus: args.status,
        })
      );
      if (
        (operation === "reopen" || operation === "cancel") &&
        !args.reason?.trim() &&
        !(operation === "cancel" && args.cancellationReason?.trim())
      ) {
        throw new Error(
          operation === "reopen"
            ? "A reason is required to reopen an Action Item."
            : "A reason is required to cancel an Action Item."
        );
      }
    }
    if (decisions.length === 0) {
      throw new Error("No Action Item changes were submitted.");
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
      const assignee = requestedAssignee ?? undefined;
      const upwardAssignment =
        assigneeParticipant !== undefined &&
        collaborationRoleTier(assigneeParticipant.role) >
          authorization.effectiveRole.tier;
      const requiresAcceptance =
        (args.requiresAcceptance ?? item.requiresAcceptance) ||
        upwardAssignment;
      patch.assigneeWorkosUserId = assignee;
      patch.assignedByWorkosUserId = assignee
        ? authorization.viewer.subject
        : undefined;
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
      assertStatusTransition(item, args.status);
      patch.status = args.status;
      patch.previousActiveStatus =
        args.status === "blocked" || args.status === "cancelled"
          ? item.status
          : undefined;
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
    const updatedItem = await ctx.db.get(item._id);
    if (!updatedItem) {
      throw new Error("Action Item became unavailable during update.");
    }
    await ctx.db.insert("buildActionItemEvents", {
      actionItemId: item._id,
      actorRole: authorization.effectiveRole.role,
      actorWorkosUserId: authorization.viewer.subject,
      brokerageId: authorization.brokerage._id,
      buildId: authorization.build._id,
      createdAt: now,
      eventType: "updated",
      exercisedAuthority: decisions[0]?.authority,
      newState: JSON.stringify(actionItemAuditState(updatedItem)),
      organizationId: authorization.organizationId,
      reason:
        args.reason?.trim() ??
        args.cancellationReason?.trim() ??
        args.blockedReason?.trim(),
      revision: item.currentRevision + 1,
      warnings: [
        ...new Set(
          decisions
            .map((decision) => decision.warning)
            .filter((warning): warning is string => Boolean(warning))
        ),
      ],
      priorState: JSON.stringify(actionItemAuditState(item)),
    });
    await recordBuildActionItemRevision(ctx, {
      authorization,
      item: updatedItem,
      now,
      reason:
        args.reason?.trim() ??
        args.cancellationReason?.trim() ??
        args.blockedReason?.trim(),
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
    expectedRevision: v.optional(v.number()),
    organizationId: v.string(),
  })
  .returns(v.id("buildActionItems"))
  .handler(async (ctx, args) => {
    const authorization = await authorizeActiveBuildHumanCollaborationAccess(
      ctx,
      args
    );
    const item = await requireReadableActionItem(
      ctx,
      authorization,
      args.actionItemId
    );
    assertExpectedRevision(item, args.expectedRevision);
    const decision = assertActionItemOperation(
      authorization,
      item,
      "accept_assignment"
    );
    if (item.assignmentState !== "requested") {
      throw new Error("This assignment is not awaiting acceptance.");
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
      exercisedAuthority: decision.authority,
      newState: JSON.stringify({ assignmentState: "assigned" }),
      organizationId: authorization.organizationId,
      priorState: JSON.stringify({ assignmentState: "requested" }),
      revision: item.currentRevision + 1,
    });
    const updatedItem = await ctx.db.get(item._id);
    if (!updatedItem) {
      throw new Error("Action Item became unavailable during update.");
    }
    await recordBuildActionItemRevision(ctx, {
      authorization,
      item: updatedItem,
      now,
      reason: "Assignment accepted",
    });
    return item._id;
  })
  .public();

export const addBuildActionItemChecklistItem = authenticatedMutation
  .input({
    actionItemId: v.id("buildActionItems"),
    buildId: v.id("activeBuilds"),
    expectedRevision: v.optional(v.number()),
    label: v.string(),
    organizationId: v.string(),
    required: v.optional(v.boolean()),
  })
  .returns(v.id("buildActionItemChecklistItems"))
  .handler(async (ctx, args) => {
    const authorization = await authorizeActiveBuildHumanCollaborationAccess(
      ctx,
      args
    );
    const item = await requireReadableActionItem(
      ctx,
      authorization,
      args.actionItemId
    );
    assertExpectedRevision(item, args.expectedRevision);
    const decision = assertActionItemOperation(
      authorization,
      item,
      "add_checklist"
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
    const checklistItemId = await ctx.db.insert(
      "buildActionItemChecklistItems",
      {
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
      }
    );
    await recordChildActionItemMutation(ctx, {
      authorization,
      decision,
      eventType: "checklist_item_added",
      item,
      newState: JSON.stringify({
        checklistItemId,
        label,
        required: args.required ?? true,
      }),
      now,
    });
    return checklistItemId;
  })
  .public();

export const toggleBuildActionItemChecklistItem = authenticatedMutation
  .input({
    buildId: v.id("activeBuilds"),
    checklistItemId: v.id("buildActionItemChecklistItems"),
    expectedRevision: v.optional(v.number()),
    organizationId: v.string(),
  })
  .returns(v.boolean())
  .handler(async (ctx, args) => {
    const authorization = await authorizeActiveBuildHumanCollaborationAccess(
      ctx,
      args
    );
    const checklist = await ctx.db.get(args.checklistItemId);
    if (!checklist || checklist.buildId !== authorization.build._id) {
      throw new Error("Checklist entry is unavailable.");
    }
    const item = await requireReadableActionItem(
      ctx,
      authorization,
      checklist.actionItemId
    );
    assertExpectedRevision(item, args.expectedRevision);
    const decision = assertActionItemOperation(
      authorization,
      item,
      "toggle_checklist"
    );
    const completed = !checklist.completed;
    const now = Date.now();
    await ctx.db.patch(checklist._id, {
      completed,
      completedAt: completed ? now : undefined,
      completedByWorkosUserId: completed
        ? authorization.viewer.subject
        : undefined,
      updatedAt: now,
    });
    await recordChildActionItemMutation(ctx, {
      authorization,
      decision,
      eventType: "checklist_item_toggled",
      item,
      newState: JSON.stringify({
        checklistItemId: checklist._id,
        completed,
      }),
      now,
      priorState: JSON.stringify({
        checklistItemId: checklist._id,
        completed: checklist.completed,
      }),
    });
    return completed;
  })
  .public();

export const linkBuildActionItems = authenticatedMutation
  .input({
    buildId: v.id("activeBuilds"),
    expectedSourceRevision: v.optional(v.number()),
    kind: buildActionRelationKindValidator,
    organizationId: v.string(),
    sourceActionItemId: v.id("buildActionItems"),
    targetActionItemId: v.id("buildActionItems"),
  })
  .returns(v.id("buildActionItemRelations"))
  .handler(async (ctx, args) => {
    const authorization = await authorizeActiveBuildHumanCollaborationAccess(
      ctx,
      args
    );
    const [source, target] = await Promise.all([
      requireReadableActionItem(ctx, authorization, args.sourceActionItemId),
      requireReadableActionItem(ctx, authorization, args.targetActionItemId),
    ]);
    await requireRelationshipReaderParity(
      ctx,
      authorization,
      source,
      target,
      args.kind
    );
    assertExpectedRevision(source, args.expectedSourceRevision);
    const decision = assertActionItemOperation(
      authorization,
      source,
      "link_relation"
    );
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
    const relationId = await ctx.db.insert("buildActionItemRelations", {
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
    await recordChildActionItemMutation(ctx, {
      authorization,
      decision,
      eventType: "relation_linked",
      item: source,
      newState: JSON.stringify({
        kind: args.kind,
        relationId,
        targetActionItemId: target._id,
      }),
      now,
    });
    return relationId;
  })
  .public();

export async function requireReadableActionItem(
  ctx: QueryCtx,
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

function assertActionItemOperation(
  authorization: Awaited<
    ReturnType<typeof authorizeActiveBuildCollaborationAccess>
  >,
  item: Doc<"buildActionItems">,
  operation: BuildActionItemOperation,
  options?: {
    nextStatus?: Doc<"buildActionItems">["status"];
    targetAssignee?: {
      role: (typeof authorization.participants)[number]["role"];
      workosUserId: string;
    } | null;
  }
) {
  const creatorRole =
    item.creatorRole ??
    authorization.participants.find(
      (participant) => participant.workosUserId === item.creatorWorkosUserId
    )?.role;
  const decision = authorizeBuildActionItemOperation({
    actor: {
      role: authorization.effectiveRole.role,
      workosUserId: authorization.viewer.subject,
    },
    item: {
      assignedByWorkosUserId: item.assignedByWorkosUserId,
      assigneeWorkosUserId: item.assigneeWorkosUserId,
      assignmentState: item.assignmentState,
      creatorRole,
      creatorWorkosUserId: item.creatorWorkosUserId,
      requiresAcceptance: item.requiresAcceptance,
      status: item.status,
    },
    nextStatus: options?.nextStatus,
    operation,
    targetAssignee: options?.targetAssignee,
  });
  if (!decision.allowed) {
    throw new Error(
      `Forbidden: Action Item ${operation.replaceAll("_", " ")} authority`
    );
  }
  return decision;
}

function assertExpectedRevision(
  item: Doc<"buildActionItems">,
  expectedRevision: number | undefined
) {
  if (
    expectedRevision !== undefined &&
    expectedRevision !== item.currentRevision
  ) {
    throw new Error(
      "This Action Item changed since you opened it. Refresh and try again."
    );
  }
}

function mandatoryCompletionAcceptanceApplies(
  authorization: Awaited<
    ReturnType<typeof authorizeActiveBuildCollaborationAccess>
  >,
  item: Doc<"buildActionItems">
) {
  if (
    !(
      item.requiresAcceptance &&
      item.assigneeWorkosUserId &&
      item.assignedByWorkosUserId
    )
  ) {
    return false;
  }
  const assignee = authorization.participants.find(
    (participant) => participant.workosUserId === item.assigneeWorkosUserId
  );
  const assigner = authorization.participants.find(
    (participant) => participant.workosUserId === item.assignedByWorkosUserId
  );
  if (!(assignee && assigner)) {
    return true;
  }
  return (
    collaborationRoleTier(assignee.role) > collaborationRoleTier(assigner.role)
  );
}

function retainsCurrentAssignee(
  item: Doc<"buildActionItems">,
  submittedAssignee: string | null | undefined
) {
  return (
    submittedAssignee === undefined ||
    (submittedAssignee?.trim() || undefined) === item.assigneeWorkosUserId
  );
}

function statusOperation(
  item: Doc<"buildActionItems">,
  nextStatus: Doc<"buildActionItems">["status"]
): BuildActionItemOperation {
  if (nextStatus === "done") {
    return "complete";
  }
  if (item.status === "done" || item.status === "cancelled") {
    return "reopen";
  }
  if (nextStatus === "cancelled") {
    return "cancel";
  }
  return "transition";
}

async function requirePostReader(
  ctx: MutationCtx,
  authorization: Awaited<
    ReturnType<typeof authorizeActiveBuildCollaborationAccess>
  >,
  postId: Id<"buildCollaborationPosts">,
  workosUserId: string
) {
  const post = await ctx.db.get(postId);
  if (!post) {
    throw new Error("Action Item parent post is unavailable.");
  }
  const readerIds = await resolveCurrentCollaborationPostReaderIds(
    ctx,
    authorization,
    post
  );
  if (!readerIds.includes(workosUserId)) {
    throw new Error(
      "The assignee cannot read the originating post and cannot receive this Action Item."
    );
  }
}

async function requireRelationshipReaderParity(
  ctx: MutationCtx,
  authorization: Awaited<
    ReturnType<typeof authorizeActiveBuildCollaborationAccess>
  >,
  source: Doc<"buildActionItems">,
  target: Doc<"buildActionItems">,
  kind: Doc<"buildActionItemRelations">["kind"]
) {
  const [sourcePost, targetPost] = await Promise.all([
    ctx.db.get(source.originatingPostId),
    ctx.db.get(target.originatingPostId),
  ]);
  if (!(sourcePost && targetPost)) {
    throw new Error("Action Item relationship posts are unavailable.");
  }
  const [sourceReaderIds, targetReaderIds] = await Promise.all([
    resolveCurrentCollaborationPostReaderIds(ctx, authorization, sourcePost),
    resolveCurrentCollaborationPostReaderIds(ctx, authorization, targetPost),
  ]);
  const requiredReaderIds =
    kind === "blocks" ? targetReaderIds : sourceReaderIds;
  const readableEntityIds = new Set(
    kind === "blocks" ? sourceReaderIds : targetReaderIds
  );
  if (requiredReaderIds.some((readerId) => !readableEntityIds.has(readerId))) {
    throw new Error(
      "Every reader of the dependent Action Item must be able to read the related Action Item."
    );
  }
}

async function resolveNewActionItemAssignment(
  ctx: MutationCtx,
  authorization: Awaited<
    ReturnType<typeof authorizeActiveBuildCollaborationAccess>
  >,
  postId: Id<"buildCollaborationPosts">,
  input: {
    assigneeWorkosUserId?: string;
    requiresAcceptance?: boolean;
  }
) {
  const assignee = input.assigneeWorkosUserId?.trim() || undefined;
  const assigneeParticipant = assignee
    ? authorization.participants.find(
        (participant) => participant.workosUserId === assignee
      )
    : undefined;
  if (assignee && !assigneeParticipant) {
    throw new Error("Assignee must actively participate in this Build.");
  }
  if (assignee) {
    await requirePostReader(ctx, authorization, postId, assignee);
  }
  const upwardAssignment =
    assigneeParticipant !== undefined &&
    collaborationRoleTier(assigneeParticipant.role) >
      authorization.effectiveRole.tier;
  const requiresAcceptance =
    (input.requiresAcceptance ?? false) || upwardAssignment;
  return {
    assignee,
    assignmentState: assignee
      ? requiresAcceptance
        ? ("requested" as const)
        : ("assigned" as const)
      : ("unassigned" as const),
    requiresAcceptance,
    upwardAssignment,
  };
}

type ActionItemAuthorization = Awaited<
  ReturnType<typeof authorizeActiveBuildCollaborationAccess>
>;

async function resolveActionItemCreationReplay(
  ctx: MutationCtx,
  input: {
    authorization: ActionItemAuthorization;
    postId: Id<"buildCollaborationPosts">;
    requestId?: string;
  }
) {
  const requestId = input.requestId?.trim();
  if (!requestId) {
    return { replayActionItemId: undefined, requestId: undefined };
  }
  if (requestId.length > 200) {
    throw new Error("Action Item request IDs may not exceed 200 characters.");
  }
  const replay = await ctx.db
    .query("buildActionItemCreationRequests")
    .withIndex("by_postId_and_creatorWorkosUserId_and_requestId", (query) =>
      query
        .eq("postId", input.postId)
        .eq("creatorWorkosUserId", input.authorization.viewer.subject)
        .eq("requestId", requestId)
    )
    .unique();
  return {
    replayActionItemId: replay?.actionItemId,
    requestId,
  };
}

async function persistBuildActionItemLabels(
  ctx: MutationCtx,
  input: {
    actionItemId: Id<"buildActionItems">;
    authorization: ActionItemAuthorization;
    labels: string[];
    now: number;
  }
) {
  const labelByNormalizedValue = new Map<string, string>();
  for (const submittedLabel of input.labels) {
    const label = submittedLabel.trim();
    const normalizedLabel = label.toLocaleLowerCase();
    if (label && !labelByNormalizedValue.has(normalizedLabel)) {
      labelByNormalizedValue.set(normalizedLabel, label);
    }
  }
  const labels = [...labelByNormalizedValue.entries()].slice(0, 20);
  for (const [normalizedLabel, label] of labels) {
    if (label.length > 80) {
      throw new Error("Action Item labels may not exceed 80 characters.");
    }
    await ctx.db.insert("buildActionItemLabels", {
      actionItemId: input.actionItemId,
      brokerageId: input.authorization.brokerage._id,
      buildId: input.authorization.build._id,
      createdAt: input.now,
      createdByWorkosUserId: input.authorization.viewer.subject,
      label,
      normalizedLabel,
      organizationId: input.authorization.organizationId,
    });
  }
}

async function persistBuildActionItemAttachments(
  ctx: MutationCtx,
  input: {
    actionItemId: Id<"buildActionItems">;
    assetIds: Id<"buildCollaborationAssets">[];
    authorization: ActionItemAuthorization;
    now: number;
    post: Doc<"buildCollaborationPosts">;
  }
) {
  const assetIds = [...new Set(input.assetIds)];
  if (assetIds.length > 20) {
    throw new Error("Action Items may contain at most 20 attachments.");
  }
  for (const assetId of assetIds) {
    const asset = await ctx.db.get(assetId);
    if (
      !asset ||
      asset.organizationId !== input.authorization.organizationId ||
      asset.brokerageId !== input.authorization.brokerage._id ||
      asset.buildId !== input.authorization.build._id ||
      asset.state !== "available" ||
      !(await canUseCollaborationAssetForPost(ctx, {
        asset,
        authorization: input.authorization,
        post: input.post,
      }))
    ) {
      throw new Error("An Action Item attachment is unavailable.");
    }
    await ctx.db.insert("buildCollaborationAttachments", {
      attachmentId: asset._id,
      attachmentKind: "collaborationAsset",
      brokerageId: input.authorization.brokerage._id,
      buildId: input.authorization.build._id,
      createdAt: input.now,
      createdByWorkosUserId: input.authorization.viewer.subject,
      organizationId: input.authorization.organizationId,
      ownerKind: "actionItem",
      ownerRecordId: input.actionItemId,
    });
  }
}

async function persistBuildActionItemReferences(
  ctx: MutationCtx,
  input: {
    actionItemId: Id<"buildActionItems">;
    authorization: ActionItemAuthorization;
    now: number;
    postId: Id<"buildCollaborationPosts">;
    references: CanonicalBuildCollaborationReference[];
  }
) {
  for (const reference of input.references) {
    await ctx.db.insert("buildCollaborationReferences", {
      brokerageId: input.authorization.brokerage._id,
      buildId: input.authorization.build._id,
      createdAt: input.now,
      entityId: reference.entityId,
      entityKind: reference.entityKind,
      labelSnapshot: reference.label,
      organizationId: input.authorization.organizationId,
      ownerKind: "actionItem",
      ownerRecordId: input.actionItemId,
      postId: input.postId,
      primary: reference.primary ?? false,
      summarySnapshot: reference.summary,
    });
  }
}

async function persistBuildActionItemActivity(
  ctx: MutationCtx,
  input: {
    actionItemId: Id<"buildActionItems">;
    authorization: ActionItemAuthorization;
    now: number;
    postId: Id<"buildCollaborationPosts">;
    references: CanonicalBuildCollaborationReference[];
  }
) {
  const targets: Array<{
    kind: "post" | CanonicalBuildCollaborationReference["entityKind"];
    targetId: string;
  }> = [
    { kind: "post", targetId: input.postId },
    ...input.references.map((reference) => ({
      kind: reference.entityKind,
      targetId: reference.entityId,
    })),
  ];
  for (const target of targets) {
    const projectionKey = [
      "action_item_created",
      input.actionItemId,
      target.kind,
      target.targetId,
    ].join(":");
    const existing = await ctx.db
      .query("buildCollaborationActivityProjections")
      .withIndex("by_buildId_and_projectionKey", (query) =>
        query
          .eq("buildId", input.authorization.build._id)
          .eq("projectionKey", projectionKey)
      )
      .unique();
    if (existing) {
      continue;
    }
    await ctx.db.insert("buildCollaborationActivityProjections", {
      actionItemId: input.actionItemId,
      actorWorkosUserId: input.authorization.viewer.subject,
      brokerageId: input.authorization.brokerage._id,
      buildId: input.authorization.build._id,
      createdAt: input.now,
      eventType: "action_item_created",
      organizationId: input.authorization.organizationId,
      postId: input.postId,
      projectionKey,
      targetId: target.targetId,
      targetKind: target.kind,
    });
  }
}

async function recordChildActionItemMutation(
  ctx: MutationCtx,
  input: {
    authorization: Awaited<
      ReturnType<typeof authorizeActiveBuildCollaborationAccess>
    >;
    decision: BuildActionItemAuthorizationDecision;
    eventType: string;
    item: Doc<"buildActionItems">;
    newState: string;
    now: number;
    priorState?: string;
    reason?: string;
    warnings?: string[];
  }
) {
  const revision = input.item.currentRevision + 1;
  await ctx.db.patch(input.item._id, {
    currentRevision: revision,
    updatedAt: input.now,
  });
  await ctx.db.insert("buildActionItemEvents", {
    actionItemId: input.item._id,
    actorRole: input.authorization.effectiveRole.role,
    actorWorkosUserId: input.authorization.viewer.subject,
    brokerageId: input.authorization.brokerage._id,
    buildId: input.authorization.build._id,
    createdAt: input.now,
    eventType: input.eventType,
    exercisedAuthority: input.decision.authority,
    newState: input.newState,
    organizationId: input.authorization.organizationId,
    priorState: input.priorState,
    reason: input.reason,
    revision,
    warnings: input.warnings,
  });
  const updatedItem = await ctx.db.get(input.item._id);
  if (!updatedItem) {
    throw new Error("Action Item became unavailable during update.");
  }
  await recordBuildActionItemRevision(ctx, {
    authorization: input.authorization,
    item: updatedItem,
    now: input.now,
    reason: input.reason ?? input.eventType,
  });
}

function assertStatusTransition(
  item: Doc<"buildActionItems">,
  next: Doc<"buildActionItems">["status"]
) {
  if (item.status === "blocked") {
    if (
      next !== "cancelled" &&
      (!item.previousActiveStatus || next !== item.previousActiveStatus)
    ) {
      throw new Error(
        "Unblocking must restore the Action Item's preceding active state."
      );
    }
    return;
  }
  const allowed: Record<
    Doc<"buildActionItems">["status"],
    Doc<"buildActionItems">["status"][]
  > = {
    blocked: [],
    cancelled: ["todo", "in_progress"],
    done: ["in_progress", "cancelled"],
    in_progress: ["in_review", "blocked", "done", "cancelled"],
    in_review: ["in_progress", "blocked", "done", "cancelled"],
    todo: ["in_progress", "blocked", "cancelled"],
  };
  if (!allowed[item.status].includes(next)) {
    throw new Error(`Action Item cannot move from ${item.status} to ${next}.`);
  }
}

function actionItemAuditState(item: Doc<"buildActionItems">) {
  return {
    assigneeWorkosUserId: item.assigneeWorkosUserId ?? null,
    assignedByWorkosUserId: item.assignedByWorkosUserId ?? null,
    assignmentRequestedAt: item.assignmentRequestedAt ?? null,
    assignmentState: item.assignmentState,
    blockedReason: item.blockedReason ?? null,
    cancellationReason: item.cancellationReason ?? null,
    completedAt: item.completedAt ?? null,
    currentRevision: item.currentRevision,
    descriptionPlainText: item.descriptionPlainText,
    descriptionTiptapJson: item.descriptionTiptapJson,
    dueAt: item.dueAt ?? null,
    previousActiveStatus: item.previousActiveStatus ?? null,
    priority: item.priority,
    requiresAcceptance: item.requiresAcceptance,
    status: item.status,
    title: item.title,
  };
}

function requireReason(value: string | null | undefined, errorMessage: string) {
  const reason = value?.trim();
  if (!reason) {
    throw new Error(errorMessage);
  }
  return reason;
}

export function validateTiptapJson(value: string) {
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
