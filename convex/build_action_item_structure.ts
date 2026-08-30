import { v } from "convex/values";

import type { ActiveBuildAuthorization } from "./activeBuildAccess";
import { authenticatedMutation, authenticatedQuery } from "./authz";
import { recordBuildActionItemRevision } from "./build_action_item_history";
import {
  authorizeBuildActionItemOperation,
  authorizeGeneratedMilestoneCompanionStructureOperation,
  type BuildActionItemAuthorizationDecision,
  type BuildActionItemOperation,
  type GeneratedMilestoneCompanionStructureOperation,
} from "./build_action_item_rbac";
import { wouldCreateActionItemDependencyCycle } from "./build_action_item_structure_model";
import {
  assertCanonicalMilestoneActionItemMutable,
  requireReadableActionItem,
  resolveGeneratedMilestoneCompanionBinding,
} from "./build_action_items";
import { resolveCurrentCollaborationPostReaderIds } from "./build_collaboration_access";
import { authorizeActiveBuildHumanCollaborationAccess } from "./build_collaboration_actor";
import { authorizeActiveBuildCollaborationAccess } from "./build_collaboration_rollout";
import { resolveCanonicalMilestoneExecutionOwnership } from "./build_collaboration_system_event_access";
import {
  buildActionItemPriorityValidator,
  buildActionItemStatusValidator,
  buildActionRelationKindValidator,
} from "./build_collaboration_validators";
import type { Doc, Id, MutationCtx, QueryCtx } from "./types";
import {
  actionItemMatchesAuthorizationScope,
  actionItemRelationshipKey,
  assertActiveRelationshipCapacity,
  assertDependencyCanActivate,
  assertExpectedRevision,
  assertGeneratedEndpointOperation,
  assertOperation,
  assertRelationshipCapacity,
  assertRelationshipReaderCompatibility,
  assertRepairOperation,
  findExistingRelationship,
  isExactCanonicalExecutionOwner,
  isGeneratedStructureOperation,
  loadActiveRelationshipsForActivation,
  loadReadableActionItems,
  operationDecision,
  quarantineRedundantRelationship,
  recordRelationLifecycle,
  recordStructuralEvent,
  relationshipReadersCompatible,
  resolvePostReaderSet,
  suspendMalformedRelationship,
} from "./build_action_item_structure/helpers";

const MAX_CHECKLIST_ITEMS = 250;
const MAX_CHILD_ACTION_ITEMS = 250;
const MAX_RELATIONS_PER_ITEM = 500;
const MAX_RELATIONS_PER_BUILD = 2000;
const MAX_RELATION_REPLAY_REPAIRS = 10;

type VisibleActionItemRelation = Doc<"buildActionItemRelations"> & {
  status: "active" | "suspended";
};

const checklistRowValidator = v.object({
  checklistItemId: v.id("buildActionItemChecklistItems"),
  completed: v.boolean(),
  label: v.string(),
  order: v.number(),
  required: v.boolean(),
});

const childRowValidator = v.object({
  actionItemId: v.id("buildActionItems"),
  assigneeWorkosUserId: v.optional(v.string()),
  priority: buildActionItemPriorityValidator,
  status: buildActionItemStatusValidator,
  title: v.string(),
});

const relationRowValidator = v.object({
  direction: v.union(v.literal("incoming"), v.literal("outgoing")),
  kind: buildActionRelationKindValidator,
  otherActionItemId: v.optional(v.id("buildActionItems")),
  otherActionItemTitle: v.optional(v.string()),
  relationId: v.id("buildActionItemRelations"),
  sourceRevision: v.optional(v.number()),
  status: v.union(v.literal("active"), v.literal("suspended")),
  suspensionReason: v.optional(v.string()),
});

const structureContextValidator = v.union(
  v.object({ state: v.literal("revoked") }),
  v.object({
    checklist: v.array(checklistRowValidator),
    children: v.array(childRowValidator),
    relations: v.array(relationRowValidator),
    state: v.literal("visible"),
    viewerCanAddChecklist: v.boolean(),
    viewerCanCreateChild: v.boolean(),
    viewerCanLinkRelation: v.boolean(),
    viewerCanRepairRelations: v.boolean(),
  })
);

export const getBuildActionItemStructureContext = authenticatedQuery
  .input({
    actionItemId: v.id("buildActionItems"),
    buildId: v.id("activeBuilds"),
    organizationId: v.string(),
  })
  .returns(structureContextValidator)
  .handler(async (ctx, args) => {
    const authorization = await authorizeActiveBuildCollaborationAccess(
      ctx,
      args
    );
    let item: Doc<"buildActionItems">;
    try {
      item = await requireReadableActionItem(
        ctx,
        authorization,
        args.actionItemId
      );
      await resolveGeneratedMilestoneCompanionBinding(ctx, authorization, item);
    } catch {
      return { state: "revoked" as const };
    }
    const [
      checklist,
      children,
      outgoingActive,
      outgoingSuspended,
      incomingActive,
      incomingSuspended,
    ] = await Promise.all([
      ctx.db
        .query("buildActionItemChecklistItems")
        .withIndex("by_actionItemId_and_order", (query) =>
          query.eq("actionItemId", item._id)
        )
        .take(MAX_CHECKLIST_ITEMS + 1),
      ctx.db
        .query("buildActionItems")
        .withIndex("by_parentActionItemId_and_status", (query) =>
          query.eq("parentActionItemId", item._id)
        )
        .take(MAX_CHILD_ACTION_ITEMS + 1),
      ctx.db
        .query("buildActionItemRelations")
        .withIndex("by_sourceActionItemId_and_status", (query) =>
          query.eq("sourceActionItemId", item._id).eq("status", "active")
        )
        .take(MAX_RELATIONS_PER_ITEM + 1),
      ctx.db
        .query("buildActionItemRelations")
        .withIndex("by_sourceActionItemId_and_status", (query) =>
          query.eq("sourceActionItemId", item._id).eq("status", "suspended")
        )
        .take(MAX_RELATIONS_PER_ITEM + 1),
      ctx.db
        .query("buildActionItemRelations")
        .withIndex("by_targetActionItemId_and_status", (query) =>
          query.eq("targetActionItemId", item._id).eq("status", "active")
        )
        .take(MAX_RELATIONS_PER_ITEM + 1),
      ctx.db
        .query("buildActionItemRelations")
        .withIndex("by_targetActionItemId_and_status", (query) =>
          query.eq("targetActionItemId", item._id).eq("status", "suspended")
        )
        .take(MAX_RELATIONS_PER_ITEM + 1),
    ]);
    const outgoing = [...outgoingActive, ...outgoingSuspended];
    const incoming = [...incomingActive, ...incomingSuspended];
    if (
      checklist.length > MAX_CHECKLIST_ITEMS ||
      children.length > MAX_CHILD_ACTION_ITEMS ||
      outgoing.length > MAX_RELATIONS_PER_ITEM ||
      incoming.length > MAX_RELATIONS_PER_ITEM ||
      new Set([...outgoing, ...incoming].map((relation) => relation._id)).size >
        MAX_RELATIONS_PER_ITEM
    ) {
      throw new Error(
        "Action Item structure exceeds the supported safety limit."
      );
    }
    const scopedRelations = [...outgoing, ...incoming].filter(
      (relation): relation is VisibleActionItemRelation =>
        relation.status !== "superseded" &&
        relation.buildId === authorization.build._id &&
        relation.organizationId === authorization.organizationId &&
        relation.brokerageId === authorization.brokerage._id
    );
    const scopedChecklist = checklist.filter(
      (row) =>
        row.actionItemId === item._id &&
        row.buildId === authorization.build._id &&
        row.organizationId === authorization.organizationId &&
        row.brokerageId === authorization.brokerage._id
    );
    const readableItems = await loadReadableActionItems(ctx, authorization, [
      ...children.map((child) => child._id),
      ...scopedRelations.flatMap((relation) => [
        relation.sourceActionItemId,
        relation.targetActionItemId,
      ]),
    ]);
    const readableChildren = children.filter(
      (child) =>
        child.buildId === authorization.build._id &&
        child.organizationId === authorization.organizationId &&
        child.brokerageId === authorization.brokerage._id &&
        child.originatingPostId === item.originatingPostId &&
        child.parentActionItemId === item._id &&
        readableItems.has(child._id)
    );
    const relations = scopedRelations.map((relation) => {
      const direction =
        relation.sourceActionItemId === item._id
          ? ("outgoing" as const)
          : ("incoming" as const);
      const relatedActionItemId =
        direction === "outgoing"
          ? relation.targetActionItemId
          : relation.sourceActionItemId;
      const related = readableItems.get(relatedActionItemId);
      const source = readableItems.get(relation.sourceActionItemId);
      return {
        direction,
        kind: relation.kind,
        otherActionItemId: related?._id,
        otherActionItemTitle: related?.title,
        relationId: relation._id,
        sourceRevision: source?.currentRevision,
        status: relation.status,
        suspensionReason: relation.suspensionReason,
      };
    });
    const [
      addChecklistDecision,
      createChildDecision,
      linkRelationDecision,
      repairRelationDecision,
    ] = await Promise.all([
      operationDecision(ctx, authorization, item, "add_checklist"),
      operationDecision(ctx, authorization, item, "create_child"),
      operationDecision(ctx, authorization, item, "link_relation"),
      operationDecision(ctx, authorization, item, "repair_relation"),
    ]);
    return {
      checklist: scopedChecklist.map((row) => ({
        checklistItemId: row._id,
        completed: row.completed,
        label: row.label,
        order: row.order,
        required: row.required,
      })),
      children: readableChildren.map((child) => ({
        actionItemId: child._id,
        assigneeWorkosUserId: child.assigneeWorkosUserId,
        priority: child.priority,
        status: child.status,
        title: child.title,
      })),
      relations,
      state: "visible" as const,
      viewerCanAddChecklist: addChecklistDecision.allowed,
      viewerCanCreateChild: createChildDecision.allowed,
      viewerCanLinkRelation: linkRelationDecision.allowed,
      viewerCanRepairRelations: repairRelationDecision.allowed,
    };
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
    const decision = await assertOperation(
      ctx,
      authorization,
      item,
      "add_checklist"
    );
    const label = args.label.trim();
    if (!label) {
      throw new Error("Checklist label is required.");
    }
    const existing = (
      await ctx.db
        .query("buildActionItemChecklistItems")
        .withIndex("by_actionItemId_and_order", (query) =>
          query.eq("actionItemId", item._id)
        )
        .take(MAX_CHECKLIST_ITEMS + 1)
    ).filter(
      (row) =>
        row.buildId === authorization.build._id &&
        row.organizationId === authorization.organizationId &&
        row.brokerageId === authorization.brokerage._id
    );
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
    await recordStructuralEvent(ctx, {
      actionItemId: item._id,
      authorization,
      decision,
      eventType: "checklist_item_added",
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
    if (
      !checklist ||
      checklist.buildId !== authorization.build._id ||
      checklist.organizationId !== authorization.organizationId ||
      checklist.brokerageId !== authorization.brokerage._id
    ) {
      throw new Error("Checklist entry is unavailable.");
    }
    const item = await requireReadableActionItem(
      ctx,
      authorization,
      checklist.actionItemId
    );
    assertExpectedRevision(item, args.expectedRevision);
    const decision = await assertOperation(
      ctx,
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
    await recordStructuralEvent(ctx, {
      actionItemId: item._id,
      authorization,
      decision,
      eventType: "checklist_item_toggled",
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
    expectedGoverningRevision: v.optional(v.number()),
    expectedSourceRevision: v.optional(v.number()),
    governingActionItemId: v.optional(v.id("buildActionItems")),
    kind: buildActionRelationKindValidator,
    organizationId: v.string(),
    reason: v.optional(v.string()),
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
    const [sourceGeneratedDecision, targetGeneratedDecision] =
      await Promise.all([
        assertGeneratedEndpointOperation(
          ctx,
          authorization,
          source,
          "link_relation"
        ),
        assertGeneratedEndpointOperation(
          ctx,
          authorization,
          target,
          "link_relation"
        ),
      ]);
    if (source._id === target._id) {
      throw new Error("An Action Item cannot relate to itself.");
    }
    const governing = args.governingActionItemId
      ? args.governingActionItemId === source._id
        ? source
        : args.governingActionItemId === target._id
          ? target
          : null
      : source;
    if (!governing) {
      throw new Error(
        "The governing Action Item must be one endpoint of the relationship."
      );
    }
    const decision =
      governing._id === source._id
        ? (sourceGeneratedDecision ??
          (await assertOperation(
            ctx,
            authorization,
            governing,
            "link_relation"
          )))
        : (targetGeneratedDecision ??
          (await assertOperation(
            ctx,
            authorization,
            governing,
            "link_relation"
          )));
    if (decision.authority === "coordinator" && !args.reason?.trim()) {
      throw new Error(
        "Manager dependency overrides require an override reason."
      );
    }
    const expectedGoverningRevision =
      args.expectedGoverningRevision ?? args.expectedSourceRevision;
    const relationshipKey = actionItemRelationshipKey(
      args.kind,
      source._id,
      target._id
    );
    const existing = await findExistingRelationship(ctx, {
      authorization,
      brokerageId: authorization.brokerage._id,
      buildId: authorization.build._id,
      decision,
      kind: args.kind,
      organizationId: authorization.organizationId,
      relationshipKey,
      sourceActionItemId: source._id,
      targetActionItemId: target._id,
    });
    if (existing) {
      if (existing.relationshipKey !== relationshipKey) {
        assertExpectedRevision(governing, expectedGoverningRevision);
        await ctx.db.patch(existing._id, { relationshipKey });
      }
      return existing._id;
    }
    assertExpectedRevision(governing, expectedGoverningRevision);
    await assertRelationshipReaderCompatibility(ctx, {
      authorization,
      kind: args.kind,
      source,
      target,
    });
    await assertRelationshipCapacity(ctx, authorization.build._id, [
      source._id,
      target._id,
    ]);
    if (args.kind === "blocks") {
      await assertDependencyCanActivate(
        ctx,
        authorization.build._id,
        source._id,
        target._id
      );
    }
    const now = Date.now();
    const relationId = await ctx.db.insert("buildActionItemRelations", {
      brokerageId: authorization.brokerage._id,
      buildId: authorization.build._id,
      createdAt: now,
      createdByWorkosUserId: authorization.viewer.subject,
      kind: args.kind,
      organizationId: authorization.organizationId,
      relationshipKey,
      sourceActionItemId: source._id,
      status: "active",
      targetActionItemId: target._id,
      updatedAt: now,
    });
    await recordRelationLifecycle(ctx, {
      authorization,
      decision,
      eventType: "relation_linked",
      now,
      reason: args.reason?.trim(),
      relationId,
      sourceActionItemId: source._id,
      targetActionItemId: target._id,
    });
    return relationId;
  })
  .public();

export const unlinkBuildActionItemRelation = authenticatedMutation
  .input({
    buildId: v.id("activeBuilds"),
    expectedGoverningRevision: v.optional(v.number()),
    governingActionItemId: v.id("buildActionItems"),
    organizationId: v.string(),
    reason: v.optional(v.string()),
    relationId: v.id("buildActionItemRelations"),
  })
  .returns(v.id("buildActionItemRelations"))
  .handler(async (ctx, args) => {
    const authorization = await authorizeActiveBuildHumanCollaborationAccess(
      ctx,
      args
    );
    const relation = await ctx.db.get(args.relationId);
    if (
      !relation ||
      relation.status !== "active" ||
      relation.buildId !== authorization.build._id ||
      relation.organizationId !== authorization.organizationId ||
      relation.brokerageId !== authorization.brokerage._id
    ) {
      throw new Error("The Action Item relationship is unavailable.");
    }
    if (
      relation.sourceActionItemId !== args.governingActionItemId &&
      relation.targetActionItemId !== args.governingActionItemId
    ) {
      throw new Error(
        "The governing Action Item must be one endpoint of the relationship."
      );
    }
    const [source, target] = await Promise.all([
      requireReadableActionItem(
        ctx,
        authorization,
        relation.sourceActionItemId
      ),
      requireReadableActionItem(
        ctx,
        authorization,
        relation.targetActionItemId
      ),
    ]);
    const [sourceGeneratedDecision, targetGeneratedDecision] =
      await Promise.all([
        assertGeneratedEndpointOperation(
          ctx,
          authorization,
          source,
          "unlink_relation"
        ),
        assertGeneratedEndpointOperation(
          ctx,
          authorization,
          target,
          "unlink_relation"
        ),
      ]);
    const governing =
      source._id === args.governingActionItemId ? source : target;
    assertExpectedRevision(governing, args.expectedGoverningRevision);
    const decision =
      governing._id === source._id
        ? (sourceGeneratedDecision ??
          (await assertOperation(
            ctx,
            authorization,
            governing,
            "link_relation"
          )))
        : (targetGeneratedDecision ??
          (await assertOperation(
            ctx,
            authorization,
            governing,
            "link_relation"
          )));
    if (decision.authority === "coordinator" && !args.reason?.trim()) {
      throw new Error(
        "Manager dependency overrides require an override reason."
      );
    }
    const now = Date.now();
    await ctx.db.patch(relation._id, {
      status: "superseded",
      supersededAt: now,
      updatedAt: now,
    });
    await recordRelationLifecycle(ctx, {
      authorization,
      decision,
      eventType: "relation_unlinked",
      now,
      reason: args.reason?.trim(),
      relationId: relation._id,
      sourceActionItemId: relation.sourceActionItemId,
      targetActionItemId: relation.targetActionItemId,
    });
    return relation._id;
  })
  .public();

export const repairBuildActionItemRelation = authenticatedMutation
  .input({
    buildId: v.id("activeBuilds"),
    expectedSourceRevision: v.number(),
    organizationId: v.string(),
    reason: v.string(),
    relationId: v.id("buildActionItemRelations"),
  })
  .returns(v.id("buildActionItemRelations"))
  .handler(async (ctx, args) => {
    const authorization = await authorizeActiveBuildHumanCollaborationAccess(
      ctx,
      args
    );
    const relation = await ctx.db.get(args.relationId);
    if (
      !relation ||
      relation.buildId !== authorization.build._id ||
      relation.organizationId !== authorization.organizationId ||
      relation.brokerageId !== authorization.brokerage._id
    ) {
      throw new Error("Action Item relationship is unavailable.");
    }
    const [source, target] = await Promise.all([
      requireReadableActionItem(
        ctx,
        authorization,
        relation.sourceActionItemId
      ),
      requireReadableActionItem(
        ctx,
        authorization,
        relation.targetActionItemId
      ),
    ]);
    const [sourceGeneratedDecision] = await Promise.all([
      assertGeneratedEndpointOperation(
        ctx,
        authorization,
        source,
        "repair_relation"
      ),
      assertGeneratedEndpointOperation(
        ctx,
        authorization,
        target,
        "repair_relation"
      ),
    ]);
    const decision =
      sourceGeneratedDecision ??
      (await assertRepairOperation(ctx, authorization, source));
    if (relation.status === "active") {
      return relation._id;
    }
    if (relation.status !== "suspended") {
      throw new Error(
        "Superseded Action Item relationships cannot be repaired."
      );
    }
    assertExpectedRevision(source, args.expectedSourceRevision);
    const reason = args.reason.trim();
    if (!reason) {
      throw new Error("A relationship repair reason is required.");
    }
    const compatible = await relationshipReadersCompatible(ctx, {
      authorization,
      kind: relation.kind,
      source,
      target,
    });
    if (!compatible) {
      throw new Error(
        "The Action Item relationship permission conflict remains."
      );
    }
    if (relation.kind === "blocks") {
      await assertDependencyCanActivate(
        ctx,
        authorization.build._id,
        source._id,
        target._id
      );
    } else {
      await assertActiveRelationshipCapacity(ctx, authorization.build._id);
    }
    const now = Date.now();
    await ctx.db.patch(relation._id, {
      restoredAt: now,
      restoredByWorkosUserId: authorization.viewer.subject,
      status: "active",
      suspendedAt: undefined,
      suspendedByWorkosUserId: undefined,
      suspensionReason: undefined,
      updatedAt: now,
    });
    await recordRelationLifecycle(ctx, {
      authorization,
      decision,
      eventType: "relation_restored",
      now,
      reason,
      relationId: relation._id,
      sourceActionItemId: source._id,
      targetActionItemId: target._id,
    });
    return relation._id;
  })
  .public();

export async function suspendPermissionConflictedActionItemRelations(
  ctx: MutationCtx,
  authorization: ActiveBuildAuthorization
) {
  const activeRelations = await ctx.db
    .query("buildActionItemRelations")
    .withIndex("by_buildId_and_status", (query) =>
      query.eq("buildId", authorization.build._id).eq("status", "active")
    )
    .take(MAX_RELATIONS_PER_BUILD + 1);
  if (activeRelations.length > MAX_RELATIONS_PER_BUILD) {
    throw new Error(
      "Build relationships exceed the permission reconciliation safety limit."
    );
  }
  return await reconcilePermissionConflictedActionItemRelations(
    ctx,
    authorization,
    activeRelations
  );
}

export async function reconcilePermissionConflictedActionItemRelations(
  ctx: MutationCtx,
  authorization: ActiveBuildAuthorization,
  activeRelations: Doc<"buildActionItemRelations">[]
) {
  const itemCache = new Map<
    Id<"buildActionItems">,
    Promise<Doc<"buildActionItems"> | null>
  >();
  const getItem = (actionItemId: Id<"buildActionItems">) => {
    const cached = itemCache.get(actionItemId) ?? ctx.db.get(actionItemId);
    itemCache.set(actionItemId, cached);
    return cached;
  };
  const readerCache = new Map<
    Id<"buildCollaborationPosts">,
    Promise<Set<string> | null>
  >();
  let suspendedCount = 0;
  for (const relation of activeRelations) {
    if (relation.status !== "active") {
      continue;
    }
    if (
      relation.organizationId !== authorization.organizationId ||
      relation.brokerageId !== authorization.brokerage._id
    ) {
      continue;
    }
    const [source, target] = await Promise.all([
      getItem(relation.sourceActionItemId),
      getItem(relation.targetActionItemId),
    ]);
    if (
      !(
        source &&
        target &&
        actionItemMatchesAuthorizationScope(authorization, source) &&
        actionItemMatchesAuthorizationScope(authorization, target) &&
        (await resolvePostReaderSet(
          ctx,
          authorization,
          source.originatingPostId,
          readerCache
        )) &&
        (await resolvePostReaderSet(
          ctx,
          authorization,
          target.originatingPostId,
          readerCache
        ))
      )
    ) {
      await suspendMalformedRelationship(ctx, authorization, relation);
      continue;
    }
    const compatible = await relationshipReadersCompatible(ctx, {
      authorization,
      kind: relation.kind,
      readerCache,
      source,
      target,
    });
    if (compatible) {
      continue;
    }
    const now = Date.now();
    await ctx.db.patch(relation._id, {
      status: "suspended",
      suspendedAt: now,
      suspendedByWorkosUserId: authorization.viewer.subject,
      suspensionReason: "permission_conflict",
      updatedAt: now,
    });
    await recordRelationLifecycle(ctx, {
      authorization,
      decision: { allowed: true, authority: "reader" },
      eventType: "relation_suspended",
      now,
      reason: "permission_conflict",
      relationId: relation._id,
      sourceActionItemId: source._id,
      targetActionItemId: target._id,
      warnings: ["permission_conflict"],
    });
    suspendedCount += 1;
  }
  return suspendedCount;
}
