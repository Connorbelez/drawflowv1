import { v } from "convex/values";

import type { ActiveBuildAuthorization } from "./activeBuildAccess";
import { authenticatedMutation, authenticatedQuery } from "./authz";
import {
  buildActionItemQueueSortAt,
  resetBuildActionItemDeadlineSchedule,
} from "./build_action_item_deadline_model";
import { actionItemRequiresAcceptance } from "./build_action_item_governance";
import { recordBuildActionItemRevision } from "./build_action_item_history";
import { syncLinkedActionItemPostCounts } from "./build_action_item_post_links";
import { syncBuildActionItemReferenceQueueSortAt } from "./build_action_item_queue_projection";
import {
  authorizeBuildActionItemOperation,
  type BuildActionItemOperation,
} from "./build_action_item_rbac";
import {
  assertCanonicalMilestoneActionItemMutable,
  requireReadableActionItem,
} from "./build_action_items";
import { resolveCurrentCollaborationNotificationReaderIds } from "./build_collaboration_access";
import { authorizeActiveBuildHumanCollaborationAccess } from "./build_collaboration_actor";
import { collaborationRoleTier } from "./build_collaboration_model";
import {
  emitCanonicalBuildCollaborationNotification,
  notificationKindForActionItemWorkflowEvent,
} from "./build_collaboration_notifications";
import { authorizeActiveBuildCollaborationAccess } from "./build_collaboration_rollout";
import {
  buildActionItemStatusValidator,
  buildCollaborationRoleValidator,
} from "./build_collaboration_validators";
import { emitBuildCollaborationWebhookEvent } from "./build_collaboration_webhooks";
import type { Doc, Id, MutationCtx, QueryCtx } from "./types";

const MAX_WORKFLOW_PARTICIPANTS = 2000;

const workflowContextValidator = v.union(
  v.object({ state: v.literal("revoked") }),
  v.object({
    assignableParticipants: v.array(
      v.object({
        assignmentMode: v.union(v.literal("direct"), v.literal("request")),
        displayName: v.string(),
        role: buildCollaborationRoleValidator,
        workosUserId: v.string(),
      })
    ),
    availableTransitions: v.array(buildActionItemStatusValidator),
    state: v.literal("visible"),
    viewerCanAcceptAssignment: v.boolean(),
    viewerCanEditFields: v.boolean(),
    viewerEditAuthority: v.union(
      v.literal("reader"),
      v.literal("creator"),
      v.literal("assignee"),
      v.literal("assigning_authority"),
      v.literal("coordinator")
    ),
    viewerRequiresEditReason: v.boolean(),
    viewerCanUnassign: v.boolean(),
    viewerWorkosUserId: v.string(),
  })
);

export const getBuildActionItemWorkflowContext = authenticatedQuery
  .input({
    actionItemId: v.id("buildActionItems"),
    buildId: v.id("activeBuilds"),
    organizationId: v.string(),
  })
  .returns(workflowContextValidator)
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
    if (item.systemMode === "generated_milestone_submilestone") {
      return {
        assignableParticipants: [],
        availableTransitions: [],
        state: "visible" as const,
        viewerCanAcceptAssignment: false,
        viewerCanEditFields: false,
        viewerEditAuthority: "reader" as const,
        viewerRequiresEditReason: false,
        viewerCanUnassign: false,
        viewerWorkosUserId: authorization.viewer.subject,
      };
    }
    const readerIds = await activeActionItemReaders(ctx, authorization, item);
    const assignableParticipants = authorization.participants.flatMap(
      (participant) => {
        if (!readerIds.has(participant.workosUserId)) {
          return [];
        }
        const decision = operationDecision(authorization, item, "assign", {
          targetAssignee: participant,
        });
        if (!decision.allowed) {
          return [];
        }
        return [
          {
            assignmentMode:
              collaborationRoleTier(participant.role) >
              authorization.effectiveRole.tier
                ? ("request" as const)
                : ("direct" as const),
            displayName: participant.displayName,
            role: participant.role,
            workosUserId: participant.workosUserId,
          },
        ];
      }
    );
    const editFieldsDecision = operationDecision(
      authorization,
      item,
      "edit_fields"
    );
    return {
      assignableParticipants,
      availableTransitions: availableTransitions(authorization, item),
      state: "visible" as const,
      viewerCanAcceptAssignment: operationDecision(
        authorization,
        item,
        "accept_assignment"
      ).allowed,
      viewerCanEditFields: editFieldsDecision.allowed,
      viewerEditAuthority: editFieldsDecision.authority,
      viewerRequiresEditReason:
        editFieldsDecision.allowed &&
        editFieldsDecision.authority === "coordinator",
      viewerCanUnassign: operationDecision(authorization, item, "assign", {
        targetAssignee: null,
      }).allowed,
      viewerWorkosUserId: authorization.viewer.subject,
    };
  })
  .public();

export const assignBuildActionItem = authenticatedMutation
  .input({
    actionItemId: v.id("buildActionItems"),
    assigneeWorkosUserId: v.union(v.string(), v.null()),
    buildId: v.id("activeBuilds"),
    expectedRevision: v.number(),
    organizationId: v.string(),
    reason: v.optional(v.string()),
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
    assertCanonicalMilestoneActionItemMutable(item);
    assertExpectedRevision(item, args.expectedRevision);
    const assignment = await resolveAssignmentChange(ctx, {
      authorization,
      item,
      submittedAssigneeWorkosUserId: args.assigneeWorkosUserId,
    });
    const now = Date.now();
    await ctx.db.patch(item._id, {
      assignedByWorkosUserId: assignment.assigneeWorkosUserId
        ? authorization.viewer.subject
        : undefined,
      assigneeWorkosUserId: assignment.assigneeWorkosUserId,
      assignmentRequestedAt: assignment.upward ? now : undefined,
      assignmentState: assignment.assignmentState,
      currentRevision: item.currentRevision + 1,
      requiresAcceptance:
        actionItemRequiresAcceptance(item) ||
        assignment.upward ||
        (item.workKind ?? "ordinary") !== "ordinary",
      unassignmentReason: undefined,
      updatedAt: now,
    });
    const updated = await requireUpdatedItem(ctx, item._id);
    await recordWorkflowChange(ctx, {
      activeReaderIds: assignment.activeReaderIds,
      authorization,
      eventType: assignment.eventType,
      exercisedAuthority: assignment.decision.authority,
      item,
      now,
      reason: args.reason,
      recipientWorkosUserId: assignment.assigneeWorkosUserId,
      updated,
      warning: assignment.upward ? "assignment_requested" : undefined,
    });
    return item._id;
  })
  .public();

export const acceptBuildActionItemAssignment = authenticatedMutation
  .input({
    actionItemId: v.id("buildActionItems"),
    buildId: v.id("activeBuilds"),
    expectedRevision: v.number(),
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
    assertCanonicalMilestoneActionItemMutable(item);
    assertExpectedRevision(item, args.expectedRevision);
    const decision = operationDecision(
      authorization,
      item,
      "accept_assignment"
    );
    assertAllowed(decision, "accept_assignment");
    if (item.assignmentState !== "requested") {
      throw new Error("This assignment is not awaiting acceptance.");
    }
    const now = Date.now();
    await ctx.db.patch(item._id, {
      assignmentState: "assigned",
      currentRevision: item.currentRevision + 1,
      updatedAt: now,
    });
    const updated = await requireUpdatedItem(ctx, item._id);
    await recordWorkflowChange(ctx, {
      authorization,
      eventType: "assignment_accepted",
      exercisedAuthority: decision.authority,
      item,
      now,
      recipientWorkosUserId: item.assignedByWorkosUserId,
      updated,
    });
    return item._id;
  })
  .public();

async function emitDependencyUnblockedNotifications(
  ctx: MutationCtx,
  input: {
    authorization: ActiveBuildAuthorization;
    completed: Doc<"buildActionItems">;
    now: number;
  }
) {
  const outgoing = await ctx.db
    .query("buildActionItemRelations")
    .withIndex("by_sourceActionItemId_and_status", (query) =>
      query.eq("sourceActionItemId", input.completed._id).eq("status", "active")
    )
    .take(500);
  for (const relation of outgoing) {
    if (
      relation.kind !== "blocks" ||
      relation.organizationId !== input.authorization.organizationId ||
      relation.buildId !== input.authorization.build._id
    ) {
      continue;
    }
    let dependent: Doc<"buildActionItems">;
    try {
      dependent = await requireReadableActionItem(
        ctx,
        input.authorization,
        relation.targetActionItemId
      );
    } catch {
      continue;
    }
    const incoming = await ctx.db
      .query("buildActionItemRelations")
      .withIndex("by_targetActionItemId_and_status", (query) =>
        query.eq("targetActionItemId", dependent._id).eq("status", "active")
      )
      .take(500);
    let stillBlocked = false;
    for (const dependency of incoming) {
      if (dependency.kind !== "blocks") {
        continue;
      }
      const source = await ctx.db.get(dependency.sourceActionItemId);
      if (!source || source.status !== "done") {
        stillBlocked = true;
        break;
      }
    }
    if (stillBlocked) {
      continue;
    }
    const readers = await activeActionItemReaders(
      ctx,
      input.authorization,
      dependent
    );
    for (const recipientWorkosUserId of new Set(
      [dependent.creatorWorkosUserId, dependent.assigneeWorkosUserId].filter(
        (value): value is string => Boolean(value)
      )
    )) {
      await emitCanonicalBuildCollaborationNotification(ctx, {
        actionItemId: dependent._id,
        actionLabel: "Open Action Item",
        authorization: input.authorization,
        body: `${dependent.title} is unblocked because ${input.completed.title} is Done.`,
        dedupeKey: `build-action-item:${dependent._id}:dependency-unblocked:${input.completed._id}:${recipientWorkosUserId}`,
        entityId: dependent._id,
        entityLabel: dependent.title,
        entityType: "buildActionItem",
        href: `/backoffice/builds/${input.authorization.build._id}?tab=details&focus=actionItem%3A${dependent._id}`,
        kind: "ordinary_activity",
        now: input.now,
        postId: dependent.originatingPostId,
        readerIds: readers,
        recipientWorkosUserId,
        title: "Action Item dependency unblocked",
      });
    }
  }
}

export const transitionBuildActionItem = authenticatedMutation
  .input({
    actionItemId: v.id("buildActionItems"),
    buildId: v.id("activeBuilds"),
    expectedRevision: v.number(),
    nextStatus: buildActionItemStatusValidator,
    organizationId: v.string(),
    reason: v.optional(v.string()),
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
    assertCanonicalMilestoneActionItemMutable(item);
    assertExpectedRevision(item, args.expectedRevision);
    await assertDependencyCompletionPreconditions(
      ctx,
      authorization,
      item,
      args.nextStatus
    );
    assertWorkflowTransitionPreconditions(authorization, item, args.nextStatus);
    const operation = statusOperation(item, args.nextStatus);
    const decision = operationDecision(authorization, item, operation, {
      nextStatus: args.nextStatus,
    });
    assertAllowed(decision, operation);
    const reason = requiredTransitionReason(item, args.nextStatus, args.reason);
    const now = Date.now();
    const transition = resolveTransitionChange({
      actorWorkosUserId: authorization.viewer.subject,
      item,
      nextStatus: args.nextStatus,
      now,
      reason,
    });
    await ctx.db.patch(item._id, transition.patch);
    await syncBuildActionItemReferenceQueueSortAt(
      ctx,
      item,
      transition.patch.queueSortAt
    );
    const updated = await requireUpdatedItem(ctx, item._id);
    const activeReaderIds = await activeActionItemReaders(
      ctx,
      authorization,
      updated
    );
    const recipientWorkosUserId = resolveTransitionRecipient(
      authorization,
      updated,
      transition.eventType,
      activeReaderIds
    );
    await recordWorkflowChange(ctx, {
      activeReaderIds,
      authorization,
      eventType: transition.eventType,
      exercisedAuthority: decision.authority,
      item,
      now,
      reason,
      recipientWorkosUserId,
      updated,
    });
    if (item.status !== "done" && updated.status === "done") {
      await emitDependencyUnblockedNotifications(ctx, {
        authorization,
        completed: updated,
        now,
      });
    }
    return item._id;
  })
  .public();

async function resolveAssignmentChange(
  ctx: MutationCtx,
  input: {
    authorization: ActiveBuildAuthorization;
    item: Doc<"buildActionItems">;
    submittedAssigneeWorkosUserId: string | null;
  }
) {
  const { authorization, item } = input;
  if (
    item.status === "done" ||
    item.status === "cancelled" ||
    item.status === "in_review"
  ) {
    throw new Error(
      "Reopen or return this Action Item to active work before reassigning it."
    );
  }
  const assigneeWorkosUserId =
    input.submittedAssigneeWorkosUserId?.trim() || undefined;
  if (assigneeWorkosUserId === item.assigneeWorkosUserId) {
    throw new Error("This participant already owns the Action Item.");
  }
  const target = assigneeWorkosUserId
    ? authorization.participants.find(
        (participant) => participant.workosUserId === assigneeWorkosUserId
      )
    : undefined;
  if (assigneeWorkosUserId && !target) {
    throw new Error("Assignee must actively participate in this Build.");
  }
  const activeReaderIds = await activeActionItemReaders(
    ctx,
    authorization,
    item
  );
  if (assigneeWorkosUserId && !activeReaderIds.has(assigneeWorkosUserId)) {
    throw new Error("Assignee must be able to read the originating post.");
  }
  const decision = operationDecision(authorization, item, "assign", {
    targetAssignee: target ?? null,
  });
  assertAllowed(decision, "assign");
  const upward =
    target !== undefined &&
    collaborationRoleTier(target.role) > authorization.effectiveRole.tier;
  const assignmentState = assigneeWorkosUserId
    ? upward
      ? ("requested" as const)
      : ("assigned" as const)
    : ("unassigned" as const);
  return {
    activeReaderIds,
    assigneeWorkosUserId,
    assignmentState,
    decision,
    eventType: assignmentEventType(item, assigneeWorkosUserId, upward),
    upward,
  };
}

function assignmentEventType(
  item: Doc<"buildActionItems">,
  assigneeWorkosUserId: string | undefined,
  upward: boolean
) {
  if (!assigneeWorkosUserId) {
    return "unassigned";
  }
  if (upward) {
    return "assignment_requested";
  }
  return item.assigneeWorkosUserId ? "reassigned" : "assigned";
}

function assertWorkflowTransitionPreconditions(
  authorization: ActiveBuildAuthorization,
  item: Doc<"buildActionItems">,
  nextStatus: Doc<"buildActionItems">["status"]
) {
  if (nextStatus === item.status) {
    throw new Error("The Action Item is already in that state.");
  }
  if (item.assignmentState === "requested") {
    throw new Error(
      "The assignment request must be accepted before work can move."
    );
  }
  if (
    item.assigneeWorkosUserId &&
    !authorization.participants.some(
      (participant) => participant.workosUserId === item.assigneeWorkosUserId
    )
  ) {
    throw new Error(
      "The removed assignee must be cleared before work can move."
    );
  }
  assertTransitionEdge(item, nextStatus);
  if (
    actionItemRequiresAcceptance(item) &&
    nextStatus === "done" &&
    item.status !== "in_review"
  ) {
    throw new Error(
      "Governed work must be submitted for review before Done is accepted."
    );
  }
}

async function assertDependencyCompletionPreconditions(
  ctx: MutationCtx,
  authorization: ActiveBuildAuthorization,
  item: Doc<"buildActionItems">,
  nextStatus: Doc<"buildActionItems">["status"]
) {
  if (nextStatus !== "done") {
    return;
  }
  const incoming = await ctx.db
    .query("buildActionItemRelations")
    .withIndex("by_targetActionItemId_and_status", (query) =>
      query.eq("targetActionItemId", item._id).eq("status", "active")
    )
    .take(501);
  if (incoming.length > 500) {
    throw new Error("Action Item dependencies exceed the supported limit.");
  }
  for (const relation of incoming) {
    if (
      relation.kind !== "blocks" ||
      relation.organizationId !== authorization.organizationId ||
      relation.brokerageId !== authorization.brokerage._id ||
      relation.buildId !== authorization.build._id
    ) {
      continue;
    }
    const dependency = await ctx.db.get(relation.sourceActionItemId);
    if (!dependency || dependency.status !== "done") {
      throw new Error(
        "Every dependency must be Done before this Action Item can move to Done."
      );
    }
  }
}

function resolveTransitionChange(input: {
  actorWorkosUserId: string;
  item: Doc<"buildActionItems">;
  nextStatus: Doc<"buildActionItems">["status"];
  now: number;
  reason?: string;
}) {
  const governed = actionItemRequiresAcceptance(input.item);
  const enteringExceptional =
    input.nextStatus === "blocked" || input.nextStatus === "cancelled";
  const completionRequested = input.nextStatus === "in_review" && governed;
  const completed = input.nextStatus === "done";
  const deadlineSchedule =
    input.nextStatus === "done" ||
    input.nextStatus === "cancelled" ||
    input.item.status === "done" ||
    input.item.status === "cancelled"
      ? resetBuildActionItemDeadlineSchedule(
          input.item.dueAt,
          input.nextStatus,
          input.item.deadlineScheduleGeneration
        )
      : {};
  return {
    eventType: workflowTransitionEventType(
      input.item,
      input.nextStatus,
      governed
    ),
    patch: {
      blockedReason: input.nextStatus === "blocked" ? input.reason : undefined,
      cancellationReason:
        input.nextStatus === "cancelled" ? input.reason : undefined,
      completedAt: completed ? input.now : undefined,
      completedByWorkosUserId: resolvedCompletedByWorkosUserId(
        input,
        completed,
        governed
      ),
      completionAcceptedByWorkosUserId:
        completed && governed ? input.actorWorkosUserId : undefined,
      completionRequestedAt: completionRequested
        ? input.now
        : completed && governed
          ? input.item.completionRequestedAt
          : undefined,
      completionRequestedByWorkosUserId: completionRequested
        ? input.actorWorkosUserId
        : completed && governed
          ? input.item.completionRequestedByWorkosUserId
          : undefined,
      currentRevision: input.item.currentRevision + 1,
      ...deadlineSchedule,
      previousActiveStatus: enteringExceptional
        ? (input.item.previousActiveStatus ?? input.item.status)
        : undefined,
      queueSortAt: buildActionItemQueueSortAt(
        input.item.dueAt,
        input.nextStatus
      ),
      status: input.nextStatus,
      updatedAt: input.now,
    },
  };
}

function resolvedCompletedByWorkosUserId(
  input: {
    actorWorkosUserId: string;
    item: Doc<"buildActionItems">;
  },
  completed: boolean,
  governed: boolean
) {
  if (!completed) {
    return;
  }
  if (!governed) {
    return input.actorWorkosUserId;
  }
  return (
    input.item.completionRequestedByWorkosUserId ??
    input.item.assigneeWorkosUserId
  );
}

function operationDecision(
  authorization: ActiveBuildAuthorization,
  item: Doc<"buildActionItems">,
  operation: BuildActionItemOperation,
  options?: {
    nextStatus?: Doc<"buildActionItems">["status"];
    targetAssignee?: {
      role: ActiveBuildAuthorization["participants"][number]["role"];
      workosUserId: string;
    } | null;
  }
) {
  return operationDecisionForActor(
    authorization,
    item,
    operation,
    {
      role: authorization.effectiveRole.role,
      workosUserId: authorization.viewer.subject,
    },
    options
  );
}

function operationDecisionForActor(
  authorization: ActiveBuildAuthorization,
  item: Doc<"buildActionItems">,
  operation: BuildActionItemOperation,
  actor: {
    role: ActiveBuildAuthorization["participants"][number]["role"];
    workosUserId: string;
  },
  options?: {
    nextStatus?: Doc<"buildActionItems">["status"];
    targetAssignee?: {
      role: ActiveBuildAuthorization["participants"][number]["role"];
      workosUserId: string;
    } | null;
  }
) {
  const creatorRole =
    item.creatorRole ??
    authorization.participants.find(
      (participant) => participant.workosUserId === item.creatorWorkosUserId
    )?.role;
  return authorizeBuildActionItemOperation({
    actor,
    item: {
      assignedByWorkosUserId: item.assignedByWorkosUserId,
      assigneeWorkosUserId: item.assigneeWorkosUserId,
      assignmentState: item.assignmentState,
      creatorRole,
      creatorWorkosUserId: item.creatorWorkosUserId,
      requiresAcceptance: actionItemRequiresAcceptance(item),
      status: item.status,
    },
    nextStatus: options?.nextStatus,
    operation,
    targetAssignee: options?.targetAssignee,
  });
}

function availableTransitions(
  authorization: ActiveBuildAuthorization,
  item: Doc<"buildActionItems">
) {
  const candidates: Doc<"buildActionItems">["status"][] = [
    "todo",
    "in_progress",
    "in_review",
    "blocked",
    "done",
    "cancelled",
  ];
  return candidates.filter((nextStatus) => {
    if (nextStatus === item.status || item.assignmentState === "requested") {
      return false;
    }
    try {
      assertTransitionEdge(item, nextStatus);
      const operation = statusOperation(item, nextStatus);
      if (
        !operationDecision(authorization, item, operation, { nextStatus })
          .allowed
      ) {
        return false;
      }
      return !(
        actionItemRequiresAcceptance(item) &&
        nextStatus === "done" &&
        item.status !== "in_review"
      );
    } catch {
      return false;
    }
  });
}

function assertTransitionEdge(
  item: Doc<"buildActionItems">,
  next: Doc<"buildActionItems">["status"]
) {
  if (item.status === "blocked") {
    const restore = item.previousActiveStatus;
    if (next !== "cancelled" && next !== restore) {
      throw new Error(
        `Reopening must restore the preceding ${restore ?? "active"} state.`
      );
    }
    return;
  }
  if (item.status === "cancelled") {
    const restore = item.previousActiveStatus ?? "todo";
    if (next !== restore) {
      throw new Error(`Reopening must restore the preceding ${restore} state.`);
    }
    return;
  }
  const allowed: Record<
    Doc<"buildActionItems">["status"],
    Doc<"buildActionItems">["status"][]
  > = {
    blocked: [],
    cancelled: [],
    done: ["in_progress"],
    in_progress: ["in_review", "blocked", "done", "cancelled"],
    in_review: ["in_progress", "blocked", "done", "cancelled"],
    todo: ["in_progress", "blocked", "cancelled"],
  };
  if (!allowed[item.status].includes(next)) {
    throw new Error(`Action Item cannot move from ${item.status} to ${next}.`);
  }
}

function statusOperation(
  item: Doc<"buildActionItems">,
  nextStatus: Doc<"buildActionItems">["status"]
): BuildActionItemOperation {
  if (item.status === "done" || item.status === "cancelled") {
    return "reopen";
  }
  if (nextStatus === "cancelled") {
    return "cancel";
  }
  if (nextStatus === "done") {
    return "complete";
  }
  return "transition";
}

function requiredTransitionReason(
  item: Doc<"buildActionItems">,
  nextStatus: Doc<"buildActionItems">["status"],
  submittedReason: string | undefined
) {
  const reason = submittedReason?.trim();
  if ((nextStatus === "blocked" || item.status === "done") && !reason) {
    throw new Error("This Action Item transition requires a reason.");
  }
  return reason;
}

function workflowTransitionEventType(
  item: Doc<"buildActionItems">,
  nextStatus: Doc<"buildActionItems">["status"],
  governed: boolean
) {
  if (nextStatus === "in_review" && governed) {
    return "completion_requested";
  }
  if (nextStatus === "done") {
    return governed ? "completion_accepted" : "completed";
  }
  if (nextStatus === "blocked") {
    return "blocked";
  }
  if (nextStatus === "cancelled") {
    return "cancelled";
  }
  if (
    item.status === "blocked" ||
    item.status === "cancelled" ||
    item.status === "done"
  ) {
    return "reopened";
  }
  return "status_changed";
}

function resolveTransitionRecipient(
  authorization: ActiveBuildAuthorization,
  item: Doc<"buildActionItems">,
  eventType: string,
  activeReaders: Set<string>
) {
  if (eventType !== "completion_requested") {
    return activeReaders.has(item.assigneeWorkosUserId ?? "")
      ? item.assigneeWorkosUserId
      : undefined;
  }
  const orderedCandidates = [
    item.assignedByWorkosUserId,
    item.creatorWorkosUserId,
    ...[...authorization.participants]
      .sort(
        (left, right) =>
          collaborationRoleTier(right.role) - collaborationRoleTier(left.role)
      )
      .map((participant) => participant.workosUserId),
  ];
  for (const workosUserId of new Set(orderedCandidates)) {
    if (!(workosUserId && activeReaders.has(workosUserId))) {
      continue;
    }
    const participant = authorization.participants.find(
      (candidate) => candidate.workosUserId === workosUserId
    );
    if (
      participant &&
      operationDecisionForActor(authorization, item, "complete", participant)
        .allowed
    ) {
      return workosUserId;
    }
  }
  return;
}

async function activeActionItemReaders(
  ctx: QueryCtx,
  authorization: ActiveBuildAuthorization,
  item: Doc<"buildActionItems">
) {
  const post = await ctx.db.get(item.originatingPostId);
  if (!post) {
    return new Set<string>();
  }
  const readerIds = new Set(
    await resolveCurrentCollaborationNotificationReaderIds(
      ctx,
      authorization,
      post
    )
  );
  const [activePeriods, removedPeriods] = await Promise.all([
    ctx.db
      .query("buildParticipants")
      .withIndex("by_buildId_and_status", (query) =>
        query.eq("buildId", authorization.build._id).eq("status", "active")
      )
      .take(MAX_WORKFLOW_PARTICIPANTS + 1),
    ctx.db
      .query("buildParticipants")
      .withIndex("by_buildId_and_status", (query) =>
        query.eq("buildId", authorization.build._id).eq("status", "removed")
      )
      .take(MAX_WORKFLOW_PARTICIPANTS + 1),
  ]);
  if (
    activePeriods.length > MAX_WORKFLOW_PARTICIPANTS ||
    removedPeriods.length > MAX_WORKFLOW_PARTICIPANTS
  ) {
    throw new Error(
      "Build participant history exceeds the Action Item workflow safety limit."
    );
  }
  const latestParticipationByUser = new Map<string, Doc<"buildParticipants">>();
  for (const period of [...activePeriods, ...removedPeriods]) {
    const existing = latestParticipationByUser.get(period.workosUserId);
    if (
      !existing ||
      period.participationPeriod > existing.participationPeriod ||
      (period.participationPeriod === existing.participationPeriod &&
        period.updatedAt > existing.updatedAt)
    ) {
      latestParticipationByUser.set(period.workosUserId, period);
    }
  }
  return new Set(
    authorization.participants
      .filter(
        (participant) =>
          readerIds.has(participant.workosUserId) &&
          latestParticipationByUser.get(participant.workosUserId)?.status !==
            "removed"
      )
      .map((participant) => participant.workosUserId)
  );
}

async function recordWorkflowChange(
  ctx: MutationCtx,
  input: {
    activeReaderIds?: Set<string>;
    authorization: ActiveBuildAuthorization;
    eventType: string;
    exercisedAuthority: string;
    item: Doc<"buildActionItems">;
    now: number;
    reason?: string;
    recipientWorkosUserId?: string;
    updated: Doc<"buildActionItems">;
    warning?: string;
  }
) {
  const eventName = `build.collaboration.action_item.${input.eventType}`;
  const priorState = JSON.stringify(workflowState(input.item));
  const newState = JSON.stringify(workflowState(input.updated));
  await Promise.all([
    ctx.db.insert("buildActionItemEvents", {
      actionItemId: input.item._id,
      actorRole: input.authorization.effectiveRole.role,
      actorWorkosUserId: input.authorization.viewer.subject,
      brokerageId: input.authorization.brokerage._id,
      buildId: input.authorization.build._id,
      createdAt: input.now,
      eventType: input.eventType,
      exercisedAuthority: input.exercisedAuthority,
      newState,
      organizationId: input.authorization.organizationId,
      priorState,
      reason: input.reason,
      revision: input.updated.currentRevision,
      warnings: input.warning ? [input.warning] : undefined,
    }),
    recordBuildActionItemRevision(ctx, {
      authorization: input.authorization,
      item: input.updated,
      now: input.now,
      reason: input.reason ?? input.eventType,
    }),
    ctx.db.insert("auditEvents", {
      actorRoles: input.authorization.roles,
      actorWorkosUserId: input.authorization.viewer.subject,
      brokerageId: input.authorization.brokerage._id,
      command: input.eventType,
      createdAt: input.now,
      entityId: input.item._id,
      entityType: "buildActionItem",
      eventType: eventName,
      newState,
      organizationId: input.authorization.organizationId,
      priorState,
      reason: input.reason,
      warnings: input.warning ? [input.warning] : [],
    }),
    ctx.db.insert("eventOutbox", {
      brokerageId: input.authorization.brokerage._id,
      createdAt: input.now,
      eventType: eventName,
      organizationId: input.authorization.organizationId,
      payloadPreview: JSON.stringify({
        actionItemId: input.item._id,
        buildId: input.authorization.build._id,
        revision: input.updated.currentRevision,
      }),
      relatedEntityId: input.item._id,
      relatedEntityType: "buildActionItem",
      status: "pending",
    }),
    insertWorkflowDelivery(ctx, input),
    syncLinkedActionItemPostCounts(ctx, {
      actionItemId: input.item._id,
      actorWorkosUserId: input.authorization.viewer.subject,
      now: input.now,
    }),
  ]);
  await emitBuildCollaborationWebhookEvent(ctx, {
    actorRole: input.authorization.effectiveRole.role,
    actorWorkosUserId: input.authorization.viewer.subject,
    brokerageId: input.authorization.brokerage._id,
    buildId: input.authorization.build._id,
    entityId: input.item._id,
    entityType: "action_item",
    eventType: "build.collaboration.action_item.transitioned",
    idempotencyKey: `action-item:${input.item._id}:${input.eventType}:${input.updated.currentRevision}`,
    metadata: {
      currentRevision: input.updated.currentRevision,
      priorStatus: input.item.status,
      status: input.updated.status,
      transitionType: input.eventType,
    },
    occurredAt: input.now,
    organizationId: input.authorization.organizationId,
  });
}

async function insertWorkflowDelivery(
  ctx: MutationCtx,
  input: {
    activeReaderIds?: Set<string>;
    authorization: ActiveBuildAuthorization;
    eventType: string;
    item: Doc<"buildActionItems">;
    now: number;
    recipientWorkosUserId?: string;
    updated: Doc<"buildActionItems">;
  }
) {
  const recipientWorkosUserId = input.recipientWorkosUserId;
  if (
    !recipientWorkosUserId ||
    recipientWorkosUserId === input.authorization.viewer.subject
  ) {
    return null;
  }
  const activeReaders =
    input.activeReaderIds ??
    (await activeActionItemReaders(ctx, input.authorization, input.updated));
  if (!activeReaders.has(recipientWorkosUserId)) {
    return null;
  }
  return await emitCanonicalBuildCollaborationNotification(ctx, {
    actionItemId: input.item._id,
    actionLabel: "Open Action Item",
    authorization: input.authorization,
    body: input.updated.title,
    dedupeKey: `build-action-item:${input.item._id}:${input.eventType}:${input.updated.currentRevision}:${recipientWorkosUserId}`,
    entityId: input.item._id,
    entityType: "buildActionItem",
    href: `/backoffice/builds/${input.authorization.build._id}?tab=details&focus=actionItem%3A${input.item._id}`,
    kind: notificationKindForActionItemWorkflowEvent(input.eventType),
    now: input.now,
    postId: input.item.originatingPostId,
    readerIds: activeReaders,
    recipientWorkosUserId,
    title: workflowNotificationTitle(input.eventType),
  });
}

function workflowNotificationTitle(eventType: string) {
  switch (eventType) {
    case "assignment_requested":
      return "Action Item assignment requested";
    case "assignment_accepted":
      return "Action Item assignment accepted";
    case "completion_requested":
      return "Action Item completion review required";
    case "completion_accepted":
      return "Action Item completion accepted";
    default:
      return "Action Item updated";
  }
}

function workflowState(item: Doc<"buildActionItems">) {
  return {
    assignedByWorkosUserId: item.assignedByWorkosUserId ?? null,
    assigneeWorkosUserId: item.assigneeWorkosUserId ?? null,
    assignmentState: item.assignmentState,
    completedAt: item.completedAt ?? null,
    completionAcceptedByWorkosUserId:
      item.completionAcceptedByWorkosUserId ?? null,
    completionRequestedAt: item.completionRequestedAt ?? null,
    currentRevision: item.currentRevision,
    previousActiveStatus: item.previousActiveStatus ?? null,
    requiresAcceptance: actionItemRequiresAcceptance(item),
    status: item.status,
    workKind: item.workKind ?? "ordinary",
  };
}

function assertAllowed(
  decision: ReturnType<typeof operationDecision>,
  operation: BuildActionItemOperation
) {
  if (!decision.allowed) {
    throw new Error(
      `Forbidden: Action Item ${operation.replaceAll("_", " ")} authority`
    );
  }
}

function assertExpectedRevision(
  item: Doc<"buildActionItems">,
  expectedRevision: number
) {
  if (item.currentRevision !== expectedRevision) {
    throw new Error(
      "This Action Item changed since you opened it. Refresh and try again."
    );
  }
}

async function requireUpdatedItem(
  ctx: MutationCtx,
  actionItemId: Id<"buildActionItems">
) {
  const item = await ctx.db.get(actionItemId);
  if (!item) {
    throw new Error("Action Item became unavailable during update.");
  }
  return item;
}
