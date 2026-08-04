import { v } from "convex/values";

import type { ActiveBuildAuthorization } from "./activeBuildAccess";
import { authenticatedMutation, authenticatedQuery } from "./authz";
import { recordBuildActionItemRevision } from "./build_action_item_history";
import {
  authorizeBuildActionItemOperation,
  type BuildActionItemAuthorizationDecision,
  type BuildActionItemOperation,
} from "./build_action_item_rbac";
import { wouldCreateActionItemDependencyCycle } from "./build_action_item_structure_model";
import {
  assertCanonicalMilestoneActionItemMutable,
  requireReadableActionItem,
} from "./build_action_items";
import { resolveCurrentCollaborationPostReaderIds } from "./build_collaboration_access";
import { authorizeActiveBuildHumanCollaborationAccess } from "./build_collaboration_actor";
import { authorizeActiveBuildCollaborationAccess } from "./build_collaboration_rollout";
import {
  buildActionItemPriorityValidator,
  buildActionItemStatusValidator,
  buildActionRelationKindValidator,
} from "./build_collaboration_validators";
import type { Doc, Id, MutationCtx, QueryCtx } from "./types";

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
      viewerCanAddChecklist: operationDecision(
        authorization,
        item,
        "add_checklist"
      ).allowed,
      viewerCanCreateChild: operationDecision(
        authorization,
        item,
        "create_child"
      ).allowed,
      viewerCanLinkRelation: operationDecision(
        authorization,
        item,
        "link_relation"
      ).allowed,
      viewerCanRepairRelations: operationDecision(
        authorization,
        item,
        "repair_relation"
      ).allowed,
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
    const decision = assertOperation(authorization, item, "add_checklist");
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
    const decision = assertOperation(authorization, item, "toggle_checklist");
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
    assertCanonicalMilestoneActionItemMutable(source);
    assertCanonicalMilestoneActionItemMutable(target);
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
    const decision = assertOperation(authorization, governing, "link_relation");
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
    const governing = await requireReadableActionItem(
      ctx,
      authorization,
      args.governingActionItemId
    );
    await Promise.all([
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
    assertExpectedRevision(governing, args.expectedGoverningRevision);
    const decision = assertOperation(authorization, governing, "link_relation");
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
    const decision = assertOperation(authorization, source, "repair_relation");
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

async function loadReadableActionItems(
  ctx: QueryCtx,
  authorization: ActiveBuildAuthorization,
  actionItemIds: Id<"buildActionItems">[]
) {
  const uniqueIds = [...new Set(actionItemIds)];
  const items = await Promise.all(
    uniqueIds.map((actionItemId) => ctx.db.get(actionItemId))
  );
  const readerCache = new Map<
    Id<"buildCollaborationPosts">,
    Promise<Set<string> | null>
  >();
  const readable = new Map<Id<"buildActionItems">, Doc<"buildActionItems">>();
  await Promise.all(
    items.map(async (item) => {
      if (!(item && actionItemMatchesAuthorizationScope(authorization, item))) {
        return;
      }
      const readers = await resolvePostReaderSet(
        ctx,
        authorization,
        item.originatingPostId,
        readerCache
      );
      if (readers?.has(authorization.viewer.subject)) {
        readable.set(item._id, item);
      }
    })
  );
  return readable;
}

function actionItemMatchesAuthorizationScope(
  authorization: ActiveBuildAuthorization,
  item: Doc<"buildActionItems">
) {
  return !(
    item.buildId !== authorization.build._id ||
    item.organizationId !== authorization.organizationId ||
    item.brokerageId !== authorization.brokerage._id
  );
}

async function suspendMalformedRelationship(
  ctx: MutationCtx,
  authorization: ActiveBuildAuthorization,
  relation: Doc<"buildActionItemRelations">
) {
  const now = Date.now();
  const reason = "integrity_conflict";
  await ctx.db.patch(relation._id, {
    status: "suspended",
    suspendedAt: now,
    suspendedByWorkosUserId: authorization.viewer.subject,
    suspensionReason: reason,
    updatedAt: now,
  });
  const state = JSON.stringify({
    relationId: relation._id,
    sourceActionItemId: relation.sourceActionItemId,
    targetActionItemId: relation.targetActionItemId,
  });
  await Promise.all([
    ctx.db.insert("auditEvents", {
      actorRoles: authorization.roles,
      actorWorkosUserId: authorization.viewer.subject,
      brokerageId: authorization.brokerage._id,
      command: "relation_suspended",
      createdAt: now,
      entityId: relation._id,
      entityType: "buildActionItemRelation",
      eventType: "build.collaboration.action_item.relation_suspended",
      newState: state,
      organizationId: authorization.organizationId,
      reason,
      warnings: [reason],
    }),
    ctx.db.insert("eventOutbox", {
      brokerageId: authorization.brokerage._id,
      createdAt: now,
      eventType: "build.collaboration.action_item.relation_suspended",
      organizationId: authorization.organizationId,
      payloadPreview: state,
      relatedEntityId: relation._id,
      relatedEntityType: "buildActionItemRelation",
      status: "pending",
    }),
  ]);
}

async function assertRelationshipCapacity(
  ctx: QueryCtx,
  buildId: Id<"activeBuilds">,
  actionItemIds: Id<"buildActionItems">[]
) {
  const [active, suspended] = await Promise.all([
    ctx.db
      .query("buildActionItemRelations")
      .withIndex("by_buildId_and_status", (query) =>
        query.eq("buildId", buildId).eq("status", "active")
      )
      .take(MAX_RELATIONS_PER_BUILD + 1),
    ctx.db
      .query("buildActionItemRelations")
      .withIndex("by_buildId_and_status", (query) =>
        query.eq("buildId", buildId).eq("status", "suspended")
      )
      .take(MAX_RELATIONS_PER_BUILD + 1),
  ]);
  if (active.length + suspended.length >= MAX_RELATIONS_PER_BUILD) {
    throw new Error("Build has reached the Action Item relationship limit.");
  }
  for (const actionItemId of new Set(actionItemIds)) {
    const [
      outgoingActive,
      outgoingSuspended,
      incomingActive,
      incomingSuspended,
    ] = await Promise.all([
      ctx.db
        .query("buildActionItemRelations")
        .withIndex("by_sourceActionItemId_and_status", (query) =>
          query.eq("sourceActionItemId", actionItemId).eq("status", "active")
        )
        .take(MAX_RELATIONS_PER_ITEM + 1),
      ctx.db
        .query("buildActionItemRelations")
        .withIndex("by_sourceActionItemId_and_status", (query) =>
          query.eq("sourceActionItemId", actionItemId).eq("status", "suspended")
        )
        .take(MAX_RELATIONS_PER_ITEM + 1),
      ctx.db
        .query("buildActionItemRelations")
        .withIndex("by_targetActionItemId_and_status", (query) =>
          query.eq("targetActionItemId", actionItemId).eq("status", "active")
        )
        .take(MAX_RELATIONS_PER_ITEM + 1),
      ctx.db
        .query("buildActionItemRelations")
        .withIndex("by_targetActionItemId_and_status", (query) =>
          query.eq("targetActionItemId", actionItemId).eq("status", "suspended")
        )
        .take(MAX_RELATIONS_PER_ITEM + 1),
    ]);
    const relationCount = new Set(
      [
        ...outgoingActive,
        ...outgoingSuspended,
        ...incomingActive,
        ...incomingSuspended,
      ].map((relation) => relation._id)
    ).size;
    if (relationCount >= MAX_RELATIONS_PER_ITEM) {
      throw new Error(
        "Action Item has reached the supported relationship limit."
      );
    }
  }
}

async function loadActiveRelationshipsForActivation(
  ctx: QueryCtx,
  buildId: Id<"activeBuilds">
) {
  const active = await ctx.db
    .query("buildActionItemRelations")
    .withIndex("by_buildId_and_status", (query) =>
      query.eq("buildId", buildId).eq("status", "active")
    )
    .take(MAX_RELATIONS_PER_BUILD + 1);
  if (active.length >= MAX_RELATIONS_PER_BUILD) {
    throw new Error(
      "Build has reached the active Action Item relationship limit."
    );
  }
  return active;
}

async function assertActiveRelationshipCapacity(
  ctx: QueryCtx,
  buildId: Id<"activeBuilds">
) {
  await loadActiveRelationshipsForActivation(ctx, buildId);
}

async function assertDependencyCanActivate(
  ctx: QueryCtx,
  buildId: Id<"activeBuilds">,
  sourceActionItemId: Id<"buildActionItems">,
  targetActionItemId: Id<"buildActionItems">
) {
  const activeRelationships = await loadActiveRelationshipsForActivation(
    ctx,
    buildId
  );
  if (
    wouldCreateActionItemDependencyCycle(
      activeRelationships
        .filter((relation) => relation.kind === "blocks")
        .map((relation) => ({
          source: relation.sourceActionItemId,
          target: relation.targetActionItemId,
        })),
      sourceActionItemId,
      targetActionItemId
    )
  ) {
    throw new Error("This blocking relationship would create a cycle.");
  }
}

async function relationshipReadersCompatible(
  ctx: QueryCtx,
  input: {
    authorization: ActiveBuildAuthorization;
    kind: Doc<"buildActionItemRelations">["kind"];
    readerCache?: Map<
      Id<"buildCollaborationPosts">,
      Promise<Set<string> | null>
    >;
    source: Doc<"buildActionItems">;
    target: Doc<"buildActionItems">;
  }
) {
  const [sourceReaders, targetReaders] = await Promise.all([
    resolvePostReaderSet(
      ctx,
      input.authorization,
      input.source.originatingPostId,
      input.readerCache
    ),
    resolvePostReaderSet(
      ctx,
      input.authorization,
      input.target.originatingPostId,
      input.readerCache
    ),
  ]);
  if (!(sourceReaders && targetReaders)) {
    return false;
  }
  if (input.kind === "blocks") {
    return [...targetReaders].every((readerId) => sourceReaders.has(readerId));
  }
  return (
    [...sourceReaders].every((readerId) => targetReaders.has(readerId)) &&
    [...targetReaders].every((readerId) => sourceReaders.has(readerId))
  );
}

function resolvePostReaderSet(
  ctx: QueryCtx,
  authorization: ActiveBuildAuthorization,
  postId: Id<"buildCollaborationPosts">,
  cache:
    | Map<Id<"buildCollaborationPosts">, Promise<Set<string> | null>>
    | undefined
) {
  const load = async () => {
    const post = await ctx.db.get(postId);
    if (
      !post ||
      post.buildId !== authorization.build._id ||
      post.organizationId !== authorization.organizationId ||
      post.brokerageId !== authorization.brokerage._id
    ) {
      return null;
    }
    return new Set(
      await resolveCurrentCollaborationPostReaderIds(ctx, authorization, post)
    );
  };
  if (!cache) {
    return load();
  }
  const cached = cache.get(postId) ?? load();
  cache.set(postId, cached);
  return cached;
}

async function assertRelationshipReaderCompatibility(
  ctx: QueryCtx,
  input: {
    authorization: ActiveBuildAuthorization;
    kind: Doc<"buildActionItemRelations">["kind"];
    source: Doc<"buildActionItems">;
    target: Doc<"buildActionItems">;
  }
) {
  if (!(await relationshipReadersCompatible(ctx, input))) {
    throw new Error(
      "Every reader of the dependent Action Item must be able to read the related Action Item."
    );
  }
}

function actionItemRelationshipKey(
  kind: Doc<"buildActionItemRelations">["kind"],
  sourceActionItemId: Id<"buildActionItems">,
  targetActionItemId: Id<"buildActionItems">
) {
  if (kind === "blocks") {
    return `${kind}:${sourceActionItemId}:${targetActionItemId}`;
  }
  const [first, second] = [
    String(sourceActionItemId),
    String(targetActionItemId),
  ].sort();
  return `${kind}:${first}:${second}`;
}

async function findExistingRelationship(
  ctx: MutationCtx,
  input: {
    authorization: ActiveBuildAuthorization;
    brokerageId: Id<"brokerages">;
    buildId: Id<"activeBuilds">;
    decision: BuildActionItemAuthorizationDecision;
    kind: Doc<"buildActionItemRelations">["kind"];
    organizationId: string;
    relationshipKey: string;
    sourceActionItemId: Id<"buildActionItems">;
    targetActionItemId: Id<"buildActionItems">;
  }
) {
  const keyedRows = await ctx.db
    .query("buildActionItemRelations")
    .withIndex("by_buildId_and_relationshipKey", (query) =>
      query
        .eq("buildId", input.buildId)
        .eq("relationshipKey", input.relationshipKey)
    )
    .take(MAX_RELATIONS_PER_ITEM + 1);
  if (
    keyedRows.some(
      (row) =>
        row.organizationId !== input.organizationId ||
        row.brokerageId !== input.brokerageId
    )
  ) {
    throw new Error("Action Item relationship integrity failure.");
  }
  const outgoing = await ctx.db
    .query("buildActionItemRelations")
    .withIndex("by_sourceActionItemId_and_kind", (query) =>
      query
        .eq("sourceActionItemId", input.sourceActionItemId)
        .eq("kind", input.kind)
    )
    .take(MAX_RELATIONS_PER_ITEM + 1);
  if (outgoing.length > MAX_RELATIONS_PER_ITEM) {
    throw new Error("Action Item has too many relationships to link safely.");
  }
  const direct = outgoing.filter(
    (relation) =>
      relation.status !== "superseded" &&
      relation.buildId === input.buildId &&
      relation.organizationId === input.organizationId &&
      relation.brokerageId === input.brokerageId &&
      relation.targetActionItemId === input.targetActionItemId
  );
  const reverse =
    input.kind === "blocks"
      ? []
      : await ctx.db
          .query("buildActionItemRelations")
          .withIndex("by_sourceActionItemId_and_kind", (query) =>
            query
              .eq("sourceActionItemId", input.targetActionItemId)
              .eq("kind", input.kind)
          )
          .take(MAX_RELATIONS_PER_ITEM + 1);
  if (reverse.length > MAX_RELATIONS_PER_ITEM) {
    throw new Error("Action Item has too many relationships to link safely.");
  }
  const reverseMatches = reverse.filter(
    (relation) =>
      relation.status !== "superseded" &&
      relation.buildId === input.buildId &&
      relation.organizationId === input.organizationId &&
      relation.brokerageId === input.brokerageId &&
      relation.targetActionItemId === input.sourceActionItemId
  );
  const matches = [
    ...new Map(
      [
        ...keyedRows.filter((relation) => relation.status !== "superseded"),
        ...direct,
        ...reverseMatches,
      ].map((relation) => [relation._id, relation])
    ).values(),
  ].sort(
    (left, right) =>
      left._creationTime - right._creationTime ||
      String(left._id).localeCompare(String(right._id))
  );
  const canonical =
    matches.find(
      (relation) => relation.relationshipKey === input.relationshipKey
    ) ?? matches[0];
  if (!canonical) {
    return;
  }
  if (matches.length - 1 > MAX_RELATION_REPLAY_REPAIRS) {
    throw new Error(
      "Action Item relationship duplicates exceed the inline repair limit."
    );
  }
  for (const redundant of matches) {
    if (redundant._id === canonical._id) {
      continue;
    }
    await quarantineRedundantRelationship(ctx, {
      authorization: input.authorization,
      canonicalRelationId: canonical._id,
      decision: input.decision,
      redundant,
    });
  }
  return canonical;
}

async function quarantineRedundantRelationship(
  ctx: MutationCtx,
  input: {
    authorization: ActiveBuildAuthorization;
    canonicalRelationId: Id<"buildActionItemRelations">;
    decision: BuildActionItemAuthorizationDecision;
    redundant: Doc<"buildActionItemRelations">;
  }
) {
  const now = Date.now();
  const reason = "duplicate_relationship";
  await ctx.db.patch(input.redundant._id, {
    status: "superseded",
    supersededAt: now,
    supersededByRelationId: input.canonicalRelationId,
    suspensionReason: reason,
    updatedAt: now,
  });
  await recordRelationLifecycle(ctx, {
    authorization: input.authorization,
    decision: input.decision,
    details: {
      canonicalRelationId: input.canonicalRelationId,
      status: "superseded",
    },
    eventType: "relation_superseded",
    now,
    reason,
    relationId: input.redundant._id,
    sourceActionItemId: input.redundant.sourceActionItemId,
    targetActionItemId: input.redundant.targetActionItemId,
    warnings: [reason],
  });
}

function operationDecision(
  authorization: ActiveBuildAuthorization,
  item: Doc<"buildActionItems">,
  operation: BuildActionItemOperation
) {
  const creatorRole =
    item.creatorRole ??
    authorization.participants.find(
      (participant) => participant.workosUserId === item.creatorWorkosUserId
    )?.role;
  return authorizeBuildActionItemOperation({
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
    operation,
  });
}

function assertOperation(
  authorization: ActiveBuildAuthorization,
  item: Doc<"buildActionItems">,
  operation: BuildActionItemOperation
) {
  assertCanonicalMilestoneActionItemMutable(item);
  const decision = operationDecision(authorization, item, operation);
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

async function recordStructuralEvent(
  ctx: MutationCtx,
  input: {
    actionItemId: Id<"buildActionItems">;
    authorization: ActiveBuildAuthorization;
    decision: BuildActionItemAuthorizationDecision;
    eventType: string;
    newState: string;
    now: number;
    priorState?: string;
    reason?: string;
    warnings?: string[];
  }
) {
  const item = await ctx.db.get(input.actionItemId);
  if (!item) {
    throw new Error("Action Item became unavailable during update.");
  }
  const revision = item.currentRevision + 1;
  await ctx.db.patch(item._id, {
    currentRevision: revision,
    updatedAt: input.now,
  });
  await ctx.db.insert("buildActionItemEvents", {
    actionItemId: item._id,
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
  const updated = await ctx.db.get(item._id);
  if (!updated) {
    throw new Error("Action Item became unavailable during update.");
  }
  await recordBuildActionItemRevision(ctx, {
    authorization: input.authorization,
    item: updated,
    now: input.now,
    reason: input.reason ?? input.eventType,
  });
  const post = await ctx.db.get(item.originatingPostId);
  if (post) {
    await ctx.db.patch(post._id, {
      lastMeaningfulActivityAt: input.now,
      latestActivityActorWorkosUserId: input.authorization.viewer.subject,
      updatedAt: input.now,
    });
  }
}

async function recordRelationLifecycle(
  ctx: MutationCtx,
  input: {
    authorization: ActiveBuildAuthorization;
    decision: BuildActionItemAuthorizationDecision;
    details?: Record<string, string>;
    eventType: string;
    now: number;
    reason?: string;
    relationId: Id<"buildActionItemRelations">;
    sourceActionItemId: Id<"buildActionItems">;
    targetActionItemId: Id<"buildActionItems">;
    warnings?: string[];
  }
) {
  const state = JSON.stringify({
    ...input.details,
    relationId: input.relationId,
    sourceActionItemId: input.sourceActionItemId,
    targetActionItemId: input.targetActionItemId,
  });
  await recordStructuralEvent(ctx, {
    actionItemId: input.sourceActionItemId,
    authorization: input.authorization,
    decision: input.decision,
    eventType: input.eventType,
    newState: state,
    now: input.now,
    reason: input.reason,
    warnings: input.warnings,
  });
  await recordStructuralEvent(ctx, {
    actionItemId: input.targetActionItemId,
    authorization: input.authorization,
    decision: input.decision,
    eventType: input.eventType,
    newState: state,
    now: input.now,
    reason: input.reason,
    warnings: input.warnings,
  });
  await Promise.all([
    ctx.db.insert("auditEvents", {
      actorRoles: input.authorization.roles,
      actorWorkosUserId: input.authorization.viewer.subject,
      brokerageId: input.authorization.brokerage._id,
      command: input.eventType,
      createdAt: input.now,
      entityId: input.relationId,
      entityType: "buildActionItemRelation",
      eventType: `build.collaboration.action_item.${input.eventType}`,
      newState: state,
      organizationId: input.authorization.organizationId,
      reason: input.reason,
      warnings: input.warnings ?? [],
    }),
    ctx.db.insert("eventOutbox", {
      brokerageId: input.authorization.brokerage._id,
      createdAt: input.now,
      eventType: `build.collaboration.action_item.${input.eventType}`,
      organizationId: input.authorization.organizationId,
      payloadPreview: state,
      relatedEntityId: input.relationId,
      relatedEntityType: "buildActionItemRelation",
      status: "pending",
    }),
  ]);
}
