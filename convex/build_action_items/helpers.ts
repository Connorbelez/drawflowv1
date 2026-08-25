import type { ActiveBuildAuthorization } from "../activeBuildAccess";
import {
  buildActionItemQueueSortAt,
  resetBuildActionItemDeadlineSchedule,
} from "../build_action_item_deadline_model";
import { actionItemRequiresAcceptance } from "../build_action_item_governance";
import { recordBuildActionItemRevision } from "../build_action_item_history";
import {
  authorizeBuildActionItemOperation,
  authorizeGeneratedMilestoneCompanionStructureOperation,
  type BuildActionItemAuthorizationDecision,
  type BuildActionItemOperation,
} from "../build_action_item_rbac";
import { canonicalBuildActionItemTags } from "../build_action_item_tags";
import {
  canReadCollaborationPost,
  resolveCurrentCollaborationPostReaderIds,
} from "../build_collaboration_access";
import {
  canReadDrawCoordination,
  resolveCurrentDrawCoordinationReaderIds,
} from "../build_draw_coordination";
import { authorizeActiveBuildCollaborationAccess } from "../build_collaboration_rollout";
import { authorizeActiveBuildHumanCollaborationAccess } from "../build_collaboration_actor";
import { persistGovernedCollaborationAssetAttachments } from "../build_collaboration_asset_publication";
import {
  type CanonicalBuildCollaborationReference,
  resolveCanonicalBuildCollaborationReferences,
} from "../build_collaboration_references";
import { canReadMilestoneSystemActionItem } from "../build_collaboration_system_event_access";
import { collaborationRoleTier } from "../build_collaboration_model";
import type { Doc, Id, MutationCtx, QueryCtx } from "../types";

const MAX_CHILD_ACTION_ITEMS = 250;

export async function permitsStaleDescriptionOverride(
  ctx: MutationCtx,
  input: {
    authorization: ActiveBuildAuthorization;
    currentRevision: number;
    expectedRevision?: number;
    hasDescriptionChange: boolean;
    item: Doc<"buildActionItems">;
  }
) {
  if (
    input.expectedRevision === undefined ||
    input.expectedRevision === input.currentRevision
  ) {
    return false;
  }
  if (!input.hasDescriptionChange) {
    throw new Error(
      "This Action Item changed since you opened it. Refresh and try again."
    );
  }
  const latestRevision = await ctx.db
    .query("buildActionItemRevisions")
    .withIndex("by_actionItemId_and_revision", (query) =>
      query
        .eq("actionItemId", input.item._id)
        .eq("revision", input.currentRevision)
    )
    .unique();
  const currentTier = input.authorization.effectiveRole.tier;
  const latestTier = latestRevision
    ? collaborationRoleTier(latestRevision.actorRole)
    : collaborationRoleTier(input.item.creatorRole ?? "contractor");
  if (currentTier > latestTier) {
    return true;
  }
  throw new Error(
    "Description conflict: another editor saved first. Your text was not overwritten; refresh before retrying."
  );
}

export function applyManualDueDatePatch(
  item: Doc<"buildActionItems">,
  dueAt: number | null | undefined,
  patch: Partial<Doc<"buildActionItems">>
) {
  if (dueAt === undefined) {
    return;
  }
  const normalizedDueAt = dueAt ?? undefined;
  if (normalizedDueAt === item.dueAt) {
    return;
  }
  if (item.dueDateSource === "policy") {
    throw new Error(
      "Policy due dates require a reasoned override through the policy deadline workflow."
    );
  }
  patch.dueAt = normalizedDueAt;
  patch.dueDateSource = dueAt === null ? undefined : "manual";
  Object.assign(
    patch,
    { queueSortAt: buildActionItemQueueSortAt(normalizedDueAt, item.status) },
    resetBuildActionItemDeadlineSchedule(
      normalizedDueAt,
      item.status,
      item.deadlineScheduleGeneration
    )
  );
}

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
    item.organizationId !== authorization.organizationId ||
    item.brokerageId !== authorization.brokerage._id
  ) {
    throw new Error("Action Item is unavailable.");
  }
  const post = await ctx.db.get(item.originatingPostId);
  if (
    !post ||
    post.buildId !== authorization.build._id ||
    post.organizationId !== authorization.organizationId ||
    post.brokerageId !== authorization.brokerage._id ||
    !(await canReadCollaborationPost(ctx, authorization, post))
  ) {
    throw new Error("Action Item is unavailable.");
  }
  if (
    post.systemPostKind === "draw" &&
    !(await canReadDrawCoordination(ctx, { authorization, post }))
  ) {
    throw new Error("Action Item is unavailable.");
  }
  if (
    !(await canReadMilestoneSystemActionItem(ctx, {
      actionItem: item,
      buildId: authorization.build._id,
      role: authorization.effectiveRole.role,
      workosUserId: authorization.viewer.subject,
    }))
  ) {
    throw new Error("Action Item is unavailable.");
  }
  return item;
}

export interface GeneratedMilestoneCompanionBinding {
  active: boolean;
  canonicalBuildMilestoneId: Id<"buildMilestones">;
  canonicalBuildSubmilestoneId: Id<"buildSubmilestones">;
}

/**
 * Resolve and validate the immutable canonical binding of a generated
 * Milestone/Sub-milestone companion.  Ordinary Action Items return `null`.
 * A malformed binding fails closed even when the Action Item row and its
 * originating post are otherwise readable; this prevents a cross-Build or
 * cross-tenant companion from becoming a structural mutation target.
 */
export async function resolveGeneratedMilestoneCompanionBinding(
  ctx: QueryCtx | MutationCtx,
  authorization: ActiveBuildAuthorization,
  item: Doc<"buildActionItems">
): Promise<GeneratedMilestoneCompanionBinding | null> {
  if (item.systemMode !== "generated_milestone_submilestone") {
    return null;
  }
  const milestoneId = item.canonicalBuildMilestoneId;
  const inactiveDisposition =
    item.canonicalCompanionDisposition !== undefined &&
    item.canonicalCompanionDisposition !== "active";
  const submilestoneId =
    item.canonicalBuildSubmilestoneId ??
    (inactiveDisposition
      ? item.historicalCanonicalBuildSubmilestoneId
      : undefined);
  if (!(milestoneId && submilestoneId)) {
    throw new Error("Generated Action Item companion binding is unavailable.");
  }
  const [milestone, submilestone, post] = await Promise.all([
    ctx.db.get(milestoneId),
    ctx.db.get(submilestoneId),
    ctx.db.get(item.originatingPostId),
  ]);
  if (
    !(milestone && submilestone) ||
    !post ||
    item.parentActionItemId !== undefined ||
    item.buildId !== authorization.build._id ||
    item.organizationId !== authorization.organizationId ||
    item.brokerageId !== authorization.brokerage._id ||
    milestone.buildId !== authorization.build._id ||
    milestone.organizationId !== authorization.organizationId ||
    milestone.brokerageId !== authorization.brokerage._id ||
    submilestone.buildId !== authorization.build._id ||
    submilestone.organizationId !== authorization.organizationId ||
    submilestone.brokerageId !== authorization.brokerage._id ||
    submilestone.buildMilestoneId !== milestone._id ||
    submilestone.milestoneKey !== milestone.key ||
    post.buildId !== authorization.build._id ||
    post.organizationId !== authorization.organizationId ||
    post.brokerageId !== authorization.brokerage._id ||
    post.source !== "system" ||
    post.systemPostKind !== "milestone" ||
    post.canonicalBuildMilestoneId !== milestone._id
  ) {
    throw new Error("Generated Action Item companion binding is unavailable.");
  }
  const active =
    (item.canonicalCompanionDisposition === undefined ||
      item.canonicalCompanionDisposition === "active") &&
    item.canonicalPlanningState !== "superseded" &&
    submilestone.planningState !== "superseded" &&
    milestone.planningState !== "superseded";
  return {
    active,
    canonicalBuildMilestoneId: milestone._id,
    canonicalBuildSubmilestoneId: submilestone._id,
  };
}

export function assertCanonicalMilestoneActionItemMutable(
  item: Doc<"buildActionItems">
) {
  if (item.systemMode === "generated_milestone_submilestone") {
    throw new Error(
      item.canonicalPlanningState === "superseded"
        ? "Superseded System Action Items cannot execute commands. Update the canonical approved plan instead."
        : "System Action Items mirror canonical Sub-milestones and cannot be edited or transitioned directly."
    );
  }
}

export function assertActionItemOperation(
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

export function mandatoryCompletionAcceptanceApplies(
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

export function assertCompletionAcceptanceChange(
  authorization: Awaited<
    ReturnType<typeof authorizeActiveBuildCollaborationAccess>
  >,
  item: Doc<"buildActionItems">,
  submittedRequiresAcceptance: boolean | undefined
) {
  if (
    submittedRequiresAcceptance === false &&
    (actionItemRequiresAcceptance(item) ||
      mandatoryCompletionAcceptanceApplies(authorization, item))
  ) {
    throw new Error("Completion acceptance is mandatory for this Action Item.");
  }
}

export async function requirePostReader(
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
  const scopedReaderIds =
    post.systemPostKind === "draw"
      ? await resolveCurrentDrawCoordinationReaderIds(ctx, authorization, post)
      : readerIds;
  if (!scopedReaderIds.includes(workosUserId)) {
    throw new Error(
      "The assignee cannot read the originating post and cannot receive this Action Item."
    );
  }
}

export async function requireActionItemCreationPost(
  ctx: MutationCtx,
  authorization: ActionItemAuthorization,
  postId: Id<"buildCollaborationPosts">
) {
  const post = await ctx.db.get(postId);
  if (
    !post ||
    post.buildId !== authorization.build._id ||
    post.organizationId !== authorization.organizationId ||
    !(await canReadCollaborationPost(ctx, authorization, post))
  ) {
    throw new Error("Action Item parent post is unavailable.");
  }
  if (
    post.systemPostKind === "draw" &&
    !(await canReadDrawCoordination(ctx, { authorization, post }))
  ) {
    throw new Error("Action Item parent post is unavailable.");
  }
  return post;
}

export async function resolveParentActionItemForCreation(
  ctx: MutationCtx,
  input: {
    authorization: ActionItemAuthorization;
    expectedParentRevision?: number;
    parentActionItemId?: Id<"buildActionItems">;
    postId: Id<"buildCollaborationPosts">;
  }
) {
  if (!input.parentActionItemId) {
    if (input.expectedParentRevision !== undefined) {
      throw new Error(
        "A parent Action Item is required with an expected parent revision."
      );
    }
    return {
      parentActionItem: undefined,
      parentDecision: undefined,
    };
  }
  const parentActionItem = await requireReadableActionItem(
    ctx,
    input.authorization,
    input.parentActionItemId
  );
  if (parentActionItem.originatingPostId !== input.postId) {
    throw new Error(
      "A child Action Item must inherit its parent’s originating post."
    );
  }
  if (parentActionItem.parentActionItemId) {
    throw new Error(
      "Action Items support only one level of child Action Items."
    );
  }
  const generatedCompanion = await resolveGeneratedMilestoneCompanionBinding(
    ctx,
    input.authorization,
    parentActionItem
  );
  let parentDecision: BuildActionItemAuthorizationDecision;
  if (generatedCompanion) {
    const generatedDecision =
      authorizeGeneratedMilestoneCompanionStructureOperation({
        activeCompanion: generatedCompanion.active,
        actor: {
          role: input.authorization.effectiveRole.role,
          workosUserId: input.authorization.viewer.subject,
        },
        operation: "create_child",
      });
    if (!generatedDecision.allowed) {
      throw new Error(
        `Forbidden: ${generatedDecision.reason ?? "generated companion structure authority"}`
      );
    }
    parentDecision = {
      allowed: true,
      authority: generatedDecision.authority,
    };
  } else {
    assertCanonicalMilestoneActionItemMutable(parentActionItem);
    parentDecision = assertActionItemOperation(
      input.authorization,
      parentActionItem,
      "create_child"
    );
  }
  const existingChildren = await ctx.db
    .query("buildActionItems")
    .withIndex("by_parentActionItemId_and_status", (query) =>
      query.eq("parentActionItemId", parentActionItem._id)
    )
    .take(MAX_CHILD_ACTION_ITEMS + 1);
  if (existingChildren.length >= MAX_CHILD_ACTION_ITEMS) {
    throw new Error(
      "This Action Item has reached the supported child Action Item limit."
    );
  }
  assertExpectedRevision(parentActionItem, input.expectedParentRevision);
  return {
    parentActionItem,
    parentDecision,
  };
}

export function requiredActionItemTitle(submittedTitle: string) {
  const title = submittedTitle.trim();
  if (!title) {
    throw new Error("Action Item title is required.");
  }
  return title;
}

export function resolveNewActionItemWorkKind(
  submittedWorkKind: Doc<"buildActionItems">["workKind"] | undefined,
  references: CanonicalBuildCollaborationReference[],
  dueAt: number | undefined
) {
  const inferredWorkKind = inferredActionItemWorkKind(references);
  const workKind =
    submittedWorkKind && submittedWorkKind !== "ordinary"
      ? submittedWorkKind
      : inferredWorkKind;
  if (workKind !== "ordinary" && dueAt === undefined) {
    throw new Error("Governed Action Items require a due date.");
  }
  return workKind;
}

export async function resolveNewActionItemAssignment(
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
      ? upwardAssignment
        ? ("requested" as const)
        : ("assigned" as const)
      : ("unassigned" as const),
    requiresAcceptance,
    upwardAssignment,
  };
}

export type ActionItemAuthorization = Awaited<
  ReturnType<typeof authorizeActiveBuildCollaborationAccess>
>;
export type VisibleActionItemRelation = Doc<"buildActionItemRelations"> & {
  status: "active" | "suspended";
};

export async function resolveActionItemCreationReplay(
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

export async function persistBuildActionItemLabels(
  ctx: MutationCtx,
  input: {
    actionItemId: Id<"buildActionItems">;
    authorization: ActionItemAuthorization;
    labels: string[];
    now: number;
  }
) {
  const labels = canonicalBuildActionItemTags(input.labels);
  for (const label of labels) {
    const normalizedLabel = label.toLocaleLowerCase();
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

export async function replaceBuildActionItemLabels(
  ctx: MutationCtx,
  input: Parameters<typeof persistBuildActionItemLabels>[1]
) {
  const existing = await ctx.db
    .query("buildActionItemLabels")
    .withIndex("by_actionItemId_and_normalizedLabel", (query) =>
      query.eq("actionItemId", input.actionItemId)
    )
    .take(101);
  if (existing.length > 100) {
    throw new Error("Action Item tags exceed the supported limit.");
  }
  const canonical = canonicalBuildActionItemTags(input.labels);
  for (const row of existing) {
    await ctx.db.delete(row._id);
  }
  await persistBuildActionItemLabels(ctx, { ...input, labels: canonical });
}

export async function persistBuildActionItemAttachments(
  ctx: MutationCtx,
  input: {
    actionItemId: Id<"buildActionItems">;
    assetIds: Id<"buildCollaborationAssets">[];
    authorization: ActionItemAuthorization;
    now: number;
    post: Doc<"buildCollaborationPosts">;
  }
) {
  const readerWorkosUserIds = await resolveCurrentCollaborationPostReaderIds(
    ctx,
    input.authorization,
    input.post
  );
  const scopedReaderWorkosUserIds =
    input.post.systemPostKind === "draw"
      ? await resolveCurrentDrawCoordinationReaderIds(
          ctx,
          input.authorization,
          input.post
        )
      : readerWorkosUserIds;
  await persistGovernedCollaborationAssetAttachments(ctx, {
    assetIds: input.assetIds,
    authorization: input.authorization,
    command: "persistBuildActionItemAttachment",
    maxAttachments: 20,
    now: input.now,
    ownerKind: "actionItem",
    ownerRecordId: input.actionItemId,
    post: input.post,
    readerWorkosUserIds: scopedReaderWorkosUserIds,
    unavailableMessage: "An Action Item attachment is unavailable.",
  });
}

export async function persistBuildActionItemReferences(
  ctx: MutationCtx,
  input: {
    actionItemId: Id<"buildActionItems">;
    authorization: ActionItemAuthorization;
    now: number;
    postId: Id<"buildCollaborationPosts">;
    queueSortAt: number;
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
      actionItemQueueSortAt: input.queueSortAt,
      summarySnapshot: reference.summary,
    });
  }
}

export async function persistBuildActionItemActivity(
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

export async function recordChildActionItemMutation(
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

export function actionItemAuditState(item: Doc<"buildActionItems">) {
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

export function inferredActionItemWorkKind(
  references: CanonicalBuildCollaborationReference[]
): Doc<"buildActionItems">["workKind"] {
  if (references.some((reference) => reference.entityKind === "draw")) {
    return "draw_blocker";
  }
  if (references.some((reference) => reference.entityKind === "siteVisit")) {
    return "site_visit_remediation";
  }
  if (
    references.some(
      (reference) =>
        reference.entityKind === "evidencePackage" ||
        reference.entityKind === "evidenceAsset"
    )
  ) {
    return "evidence";
  }
  return "ordinary";
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
