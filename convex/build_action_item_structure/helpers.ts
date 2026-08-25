import type { ActiveBuildAuthorization } from "../activeBuildAccess";
import { recordBuildActionItemRevision } from "../build_action_item_history";
import {
  authorizeBuildActionItemOperation,
  authorizeGeneratedMilestoneCompanionStructureOperation,
  type BuildActionItemAuthorizationDecision,
  type BuildActionItemOperation,
  type GeneratedMilestoneCompanionStructureOperation,
} from "../build_action_item_rbac";
import { wouldCreateActionItemDependencyCycle } from "../build_action_item_structure_model";
import {
  assertCanonicalMilestoneActionItemMutable,
  resolveGeneratedMilestoneCompanionBinding,
} from "../build_action_items";
import { resolveCurrentCollaborationPostReaderIds } from "../build_collaboration_access";
import { resolveCanonicalMilestoneExecutionOwnership } from "../build_collaboration_system_event_access";
import type { Doc, Id, MutationCtx, QueryCtx } from "../types";

const MAX_CHILD_ACTION_ITEMS = 250;
const MAX_RELATIONS_PER_ITEM = 500;
const MAX_RELATIONS_PER_BUILD = 2000;
const MAX_RELATION_REPLAY_REPAIRS = 10;

export async function loadReadableActionItems(
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

export function actionItemMatchesAuthorizationScope(
  authorization: ActiveBuildAuthorization,
  item: Doc<"buildActionItems">
) {
  return !(
    item.buildId !== authorization.build._id ||
    item.organizationId !== authorization.organizationId ||
    item.brokerageId !== authorization.brokerage._id
  );
}

export async function suspendMalformedRelationship(
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

export async function assertRelationshipCapacity(
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

export async function loadActiveRelationshipsForActivation(
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

export async function assertActiveRelationshipCapacity(
  ctx: QueryCtx,
  buildId: Id<"activeBuilds">
) {
  await loadActiveRelationshipsForActivation(ctx, buildId);
}

export async function assertDependencyCanActivate(
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

export async function relationshipReadersCompatible(
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

export function resolvePostReaderSet(
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

export async function assertRelationshipReaderCompatibility(
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

export function actionItemRelationshipKey(
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

export async function findExistingRelationship(
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

export async function quarantineRedundantRelationship(
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

export async function operationDecision(
  ctx: QueryCtx | MutationCtx,
  authorization: ActiveBuildAuthorization,
  item: Doc<"buildActionItems">,
  operation: BuildActionItemOperation
): Promise<BuildActionItemAuthorizationDecision> {
  const generatedBinding = await resolveGeneratedMilestoneCompanionBinding(
    ctx,
    authorization,
    item
  );
  if (generatedBinding && isGeneratedStructureOperation(operation)) {
    const exactExecutionOwner =
      operation === "toggle_checklist" &&
      (await isExactCanonicalExecutionOwner(
        ctx,
        authorization,
        generatedBinding
      ));
    const generatedDecision =
      authorizeGeneratedMilestoneCompanionStructureOperation({
        activeCompanion: generatedBinding.active,
        actor: {
          role: authorization.effectiveRole.role,
          workosUserId: authorization.viewer.subject,
        },
        exactExecutionOwner,
        operation,
      });
    return {
      allowed: generatedDecision.allowed,
      authority: generatedDecision.authority,
      warning: generatedDecision.reason,
    };
  }
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

export async function assertOperation(
  ctx: MutationCtx,
  authorization: ActiveBuildAuthorization,
  item: Doc<"buildActionItems">,
  operation: BuildActionItemOperation
) {
  const generatedBinding = await resolveGeneratedMilestoneCompanionBinding(
    ctx,
    authorization,
    item
  );
  if (!generatedBinding) {
    assertCanonicalMilestoneActionItemMutable(item);
  }
  const decision = await operationDecision(ctx, authorization, item, operation);
  if (!decision.allowed) {
    throw new Error(
      generatedBinding
        ? `Forbidden: ${decision.warning ?? "generated companion structure authority"}`
        : `Forbidden: Action Item ${operation.replaceAll("_", " ")} authority`
    );
  }
  return decision;
}

export async function assertRepairOperation(
  ctx: MutationCtx,
  authorization: ActiveBuildAuthorization,
  item: Doc<"buildActionItems">
) {
  const decision = await assertOperation(
    ctx,
    authorization,
    item,
    "repair_relation"
  );
  if (!decision.allowed) {
    throw new Error("Forbidden: Action Item repair relation authority");
  }
  return decision;
}

export async function assertGeneratedEndpointOperation(
  ctx: MutationCtx,
  authorization: ActiveBuildAuthorization,
  item: Doc<"buildActionItems">,
  operation: GeneratedMilestoneCompanionStructureOperation
): Promise<BuildActionItemAuthorizationDecision | undefined> {
  const generatedBinding = await resolveGeneratedMilestoneCompanionBinding(
    ctx,
    authorization,
    item
  );
  if (!generatedBinding) {
    return;
  }
  const exactExecutionOwner =
    operation === "toggle_checklist" &&
    (await isExactCanonicalExecutionOwner(
      ctx,
      authorization,
      generatedBinding
    ));
  const generatedDecision =
    authorizeGeneratedMilestoneCompanionStructureOperation({
      activeCompanion: generatedBinding.active,
      actor: {
        role: authorization.effectiveRole.role,
        workosUserId: authorization.viewer.subject,
      },
      exactExecutionOwner,
      operation,
    });
  if (!generatedDecision.allowed) {
    throw new Error(
      `Forbidden: ${generatedDecision.reason ?? "generated companion structure authority"}`
    );
  }
  return {
    allowed: true,
    authority: generatedDecision.authority,
    warning: generatedDecision.reason,
  };
}

export function isGeneratedStructureOperation(
  operation: BuildActionItemOperation
): operation is Exclude<
  GeneratedMilestoneCompanionStructureOperation,
  "unlink_relation"
> {
  return (
    operation === "add_checklist" ||
    operation === "toggle_checklist" ||
    operation === "create_child" ||
    operation === "link_relation" ||
    operation === "repair_relation"
  );
}

export async function isExactCanonicalExecutionOwner(
  ctx: QueryCtx | MutationCtx,
  authorization: ActiveBuildAuthorization,
  binding: {
    canonicalBuildMilestoneId: Id<"buildMilestones">;
    canonicalBuildSubmilestoneId: Id<"buildSubmilestones">;
  }
) {
  const [milestone, submilestone] = await Promise.all([
    ctx.db.get(binding.canonicalBuildMilestoneId),
    ctx.db.get(binding.canonicalBuildSubmilestoneId),
  ]);
  if (
    !(milestone && submilestone) ||
    milestone.buildId !== authorization.build._id ||
    submilestone.buildId !== authorization.build._id ||
    submilestone.buildMilestoneId !== milestone._id
  ) {
    return false;
  }
  const ownership = await resolveCanonicalMilestoneExecutionOwnership(ctx, {
    build: authorization.build,
    milestone,
    submilestone,
    includeCompleted: true,
  });
  return (
    ownership.state === "assigned" &&
    ownership.contractor?.accountWorkosUserId === authorization.viewer.subject
  );
}

export function assertExpectedRevision(
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

export async function recordStructuralEvent(
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

export async function recordRelationLifecycle(
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
  const [source, target] = await Promise.all([
    ctx.db.get(input.sourceActionItemId),
    ctx.db.get(input.targetActionItemId),
  ]);
  const endpoints = [source, target].filter(
    (item): item is Doc<"buildActionItems"> => item !== null
  );
  const warnings =
    endpoints.length === 2
      ? input.warnings
      : [...(input.warnings ?? []), "missing_relationship_endpoint"];
  for (const item of endpoints) {
    await recordStructuralEvent(ctx, {
      actionItemId: item._id,
      authorization: input.authorization,
      decision: input.decision,
      eventType: input.eventType,
      newState: state,
      now: input.now,
      reason: input.reason,
      warnings,
    });
  }
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
      warnings: warnings ?? [],
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
