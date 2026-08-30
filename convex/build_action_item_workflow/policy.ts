import { actionItemRequiresAcceptance } from "../build_action_item_governance";
import {
  authorizeBuildActionItemOperation,
  type BuildActionItemOperation,
} from "../build_action_item_rbac";
import {
  buildActionItemQueueSortAt,
  resetBuildActionItemDeadlineSchedule,
} from "../build_action_item_deadline_model";
import { collaborationRoleTier } from "../build_collaboration_model";
import type { ActiveBuildAuthorization } from "../activeBuildAccess";
import type { Doc } from "../types";

export function assignmentEventType(
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

export function assertWorkflowTransitionPreconditions(
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

export function resolveTransitionChange(input: {
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

export function operationDecision(
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

export function availableTransitions(
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

export function statusOperation(
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

export function requiredTransitionReason(
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

export function resolveTransitionRecipient(
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

export function workflowNotificationTitle(eventType: string) {
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

export function workflowState(item: Doc<"buildActionItems">) {
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

export function assertAllowed(
  decision: ReturnType<typeof operationDecision>,
  operation: BuildActionItemOperation
) {
  if (!decision.allowed) {
    throw new Error(
      `Forbidden: Action Item ${operation.replaceAll("_", " ")} authority`
    );
  }
}

export function assertExpectedRevision(
  item: Doc<"buildActionItems">,
  expectedRevision: number
) {
  if (item.currentRevision !== expectedRevision) {
    throw new Error(
      "This Action Item changed since you opened it. Refresh and try again."
    );
  }
}
