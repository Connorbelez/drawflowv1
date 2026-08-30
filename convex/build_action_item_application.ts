import type { ActiveBuildAuthorization } from "./activeBuildAccess";
import {
  buildActionItemQueueSortAt,
  resetBuildActionItemDeadlineSchedule,
} from "./build_action_item_deadline_model";
import { recordBuildActionItemRevision } from "./build_action_item_history";
import { syncBuildActionItemReferenceQueueSortAt } from "./build_action_item_queue_projection";
import type { CanonicalBuildCollaborationReference } from "./build_collaboration_references";
import type { Doc, Id, MutationCtx } from "./types";

type BuildActionItemInsert = Omit<
  Doc<"buildActionItems">,
  "_id" | "_creationTime"
>;

export interface BuildActionItemReference {
  entityId: string;
  entityKind: CanonicalBuildCollaborationReference["entityKind"];
  label: string;
  primary?: boolean;
  summary?: string;
}

type BuildActionItemDeadlineState = Pick<
  Doc<"buildActionItems">,
  | "deadlineScheduleGeneration"
  | "dueAt"
  | "dueDateOverrideReason"
  | "dueDateOverriddenAt"
  | "dueDateOverriddenByWorkosUserId"
  | "dueDatePolicyKey"
  | "dueDateSource"
  | "policyDueAt"
  | "queueSortAt"
  | "status"
>;

export interface CanonicalBuildActionItemFields {
  assignedByWorkosUserId?: string;
  assigneeWorkosUserId?: string;
  assignmentRequestedAt?: number;
  assignmentState: Doc<"buildActionItems">["assignmentState"];
  descriptionPlainText: string;
  descriptionTiptapJson: string;
  dueAt?: number;
  dueDateOverriddenAt?: number;
  dueDateOverriddenByWorkosUserId?: string;
  dueDateOverrideReason?: string;
  dueDatePolicyKey?: string;
  dueDateSource?: Doc<"buildActionItems">["dueDateSource"];
  parentActionItemId?: Id<"buildActionItems">;
  policyDueAt?: number;
  policyObligationKey?: string;
  priority: Doc<"buildActionItems">["priority"];
  references?: BuildActionItemReference[];
  requiresAcceptance: boolean;
  status?: Doc<"buildActionItems">["status"];
  title: string;
  workKind?: Doc<"buildActionItems">["workKind"];
}

export interface CanonicalBuildActionItemCreationInput
  extends CanonicalBuildActionItemFields {
  actorRole: Doc<"buildActionItemEvents">["actorRole"];
  actorWorkosUserId: string;
  brokerageId: Id<"brokerages">;
  buildId: Id<"activeBuilds">;
  createdAt: number;
  event?: {
    eventType?: string;
    exercisedAuthority?: string;
    reason?: string;
    warnings?: string[];
  };
  organizationId: string;
  originatingPostId: Id<"buildCollaborationPosts">;
}

export interface CanonicalBuildActionItemCreationPlan {
  actionItem: BuildActionItemInsert;
  event: Omit<
    Doc<"buildActionItemEvents">,
    "_id" | "_creationTime" | "actionItemId"
  >;
  queueSortAt: number;
}

/**
 * The single construction plan for user-authored Build Action Items.
 * Authorization adapters resolve who may construct the item; this function
 * owns the shared row shape, queue ordering, deadline schedule, and creation
 * event state.
 */
export function buildCanonicalBuildActionItemCreationPlan(
  input: CanonicalBuildActionItemCreationInput
) {
  const status = input.status ?? "todo";
  const title = input.title.trim();
  if (!title) {
    throw new Error("Action Item title is required.");
  }
  const deadlineSchedule = resetBuildActionItemDeadlineSchedule(
    input.dueAt,
    status
  );
  const queueSortAt = buildActionItemQueueSortAt(input.dueAt, status);
  const primaryReference =
    input.references?.find((reference) => reference.primary) ??
    input.references?.[0];
  const actionItem: BuildActionItemInsert = {
    assigneeWorkosUserId: input.assigneeWorkosUserId,
    assignedByWorkosUserId: input.assignedByWorkosUserId,
    assignmentRequestedAt: input.assignmentRequestedAt,
    assignmentState: input.assignmentState,
    brokerageId: input.brokerageId,
    buildId: input.buildId,
    createdAt: input.createdAt,
    creatorRole: input.actorRole,
    creatorWorkosUserId: input.actorWorkosUserId,
    currentRevision: 1,
    descriptionPlainText: input.descriptionPlainText,
    descriptionTiptapJson: input.descriptionTiptapJson,
    dueAt: input.dueAt,
    dueDateOverrideReason: input.dueDateOverrideReason,
    dueDateOverriddenAt: input.dueDateOverriddenAt,
    dueDateOverriddenByWorkosUserId: input.dueDateOverriddenByWorkosUserId,
    dueDatePolicyKey: input.dueDatePolicyKey,
    dueDateSource:
      input.dueDateSource ?? (input.dueAt === undefined ? undefined : "manual"),
    ...deadlineSchedule,
    originatingPostId: input.originatingPostId,
    organizationId: input.organizationId,
    parentActionItemId: input.parentActionItemId,
    policyDueAt: input.policyDueAt,
    policyObligationKey: input.policyObligationKey,
    primaryReferenceId: primaryReference?.entityId,
    primaryReferenceKind: primaryReference?.entityKind,
    priority: input.priority,
    queueSortAt,
    requiresAcceptance: input.requiresAcceptance,
    status,
    title,
    updatedAt: input.createdAt,
    workKind: input.workKind,
  };
  return {
    actionItem,
    event: {
      actorRole: input.actorRole,
      actorWorkosUserId: input.actorWorkosUserId,
      brokerageId: input.brokerageId,
      buildId: input.buildId,
      createdAt: input.createdAt,
      eventType: input.event?.eventType ?? "created",
      exercisedAuthority: input.event?.exercisedAuthority,
      newState: JSON.stringify(
        buildCanonicalBuildActionItemCreatedState(actionItem)
      ),
      organizationId: input.organizationId,
      reason: input.event?.reason,
      revision: 1,
      warnings: input.event?.warnings,
    },
    queueSortAt,
  };
}

export function buildCanonicalBuildActionItemCreatedState(
  item: Pick<
    Doc<"buildActionItems">,
    | "assigneeWorkosUserId"
    | "assignmentState"
    | "dueAt"
    | "parentActionItemId"
    | "priority"
    | "requiresAcceptance"
    | "status"
    | "title"
    | "workKind"
  >
) {
  return {
    assigneeWorkosUserId: item.assigneeWorkosUserId,
    assignmentState: item.assignmentState,
    dueAt: item.dueAt,
    parentActionItemId: item.parentActionItemId,
    priority: item.priority,
    requiresAcceptance: item.requiresAcceptance,
    status: item.status,
    title: item.title,
    workKind: item.workKind ?? "ordinary",
  };
}

/**
 * Persist the canonical construction atomically inside the caller's
 * mutation. Per-source notifications, labels, attachments, and publication
 * effects remain adapters, but the aggregate row, creation event, immutable
 * revision, and reference projection are written here.
 */
export async function persistCanonicalBuildActionItem(
  ctx: MutationCtx,
  input: {
    actionItem: CanonicalBuildActionItemFields;
    authorization: ActiveBuildAuthorization;
    event?: CanonicalBuildActionItemCreationInput["event"];
    now: number;
    postId: Id<"buildCollaborationPosts">;
  }
) {
  const plan = buildCanonicalBuildActionItemCreationPlan({
    ...input.actionItem,
    actorRole: input.authorization.effectiveRole.role,
    actorWorkosUserId: input.authorization.viewer.subject,
    brokerageId: input.authorization.brokerage._id,
    buildId: input.authorization.build._id,
    createdAt: input.now,
    event: input.event,
    organizationId: input.authorization.organizationId,
    originatingPostId: input.postId,
  });
  const actionItemId = await ctx.db.insert("buildActionItems", plan.actionItem);
  await ctx.db.insert("buildActionItemEvents", {
    ...plan.event,
    actionItemId,
  });
  await persistCanonicalBuildActionItemReferences(ctx, {
    actionItemId,
    authorization: input.authorization,
    now: input.now,
    postId: input.postId,
    queueSortAt: plan.queueSortAt,
    references: input.actionItem.references ?? [],
  });
  const createdItem = await ctx.db.get(actionItemId);
  if (!createdItem) {
    throw new Error("Action Item became unavailable during creation.");
  }
  await recordBuildActionItemRevision(ctx, {
    authorization: input.authorization,
    item: createdItem,
    now: input.now,
  });
  return { actionItemId, createdItem, queueSortAt: plan.queueSortAt };
}

export async function persistCanonicalBuildActionItemReferences(
  ctx: MutationCtx,
  input: {
    actionItemId: Id<"buildActionItems">;
    authorization: ActiveBuildAuthorization;
    now: number;
    postId: Id<"buildCollaborationPosts">;
    queueSortAt: number;
    references: BuildActionItemReference[];
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

/**
 * The single persistence seam for Action Item patches. It keeps entity queue
 * references aligned whenever a deadline or status mutation changes the
 * canonical queue sort value.
 */
export async function persistCanonicalBuildActionItemPatch(
  ctx: MutationCtx,
  input: {
    item: Doc<"buildActionItems">;
    patch: Partial<BuildActionItemInsert>;
  }
) {
  await ctx.db.patch(input.item._id, input.patch);
  if (input.patch.queueSortAt !== undefined) {
    await syncBuildActionItemReferenceQueueSortAt(
      ctx,
      input.item,
      input.patch.queueSortAt
    );
  }
  const updatedItem = await ctx.db.get(input.item._id);
  if (!updatedItem) {
    throw new Error("Action Item became unavailable during update.");
  }
  return updatedItem;
}

export function buildManualBuildActionItemDeadlinePatch(
  item: BuildActionItemDeadlineState,
  dueAt: number | null | undefined
) {
  if (dueAt === undefined) {
    return {};
  }
  const normalizedDueAt = dueAt ?? undefined;
  if (normalizedDueAt === item.dueAt) {
    return {};
  }
  if (item.dueDateSource === "policy") {
    throw new Error(
      "Policy due dates require a reasoned override through the policy deadline workflow."
    );
  }
  return {
    dueAt: normalizedDueAt,
    dueDateSource: dueAt === null ? undefined : ("manual" as const),
    queueSortAt: buildActionItemQueueSortAt(normalizedDueAt, item.status),
    ...resetBuildActionItemDeadlineSchedule(
      normalizedDueAt,
      item.status,
      item.deadlineScheduleGeneration
    ),
  };
}

export function buildPolicyBuildActionItemDeadlinePatch(
  item: BuildActionItemDeadlineState,
  input: { dueAt: number; policyKey: string }
) {
  const policyKey = input.policyKey.trim();
  if (!(policyKey && Number.isFinite(input.dueAt) && input.dueAt > 0)) {
    throw new Error("A valid policy key and due date are required.");
  }
  const deadlineSchedule =
    input.dueAt === item.dueAt
      ? {}
      : resetBuildActionItemDeadlineSchedule(
          input.dueAt,
          item.status,
          item.deadlineScheduleGeneration
        );
  return {
    ...deadlineSchedule,
    dueAt: input.dueAt,
    dueDateOverrideReason: undefined,
    dueDateOverriddenAt: undefined,
    dueDateOverriddenByWorkosUserId: undefined,
    dueDatePolicyKey: policyKey,
    dueDateSource: "policy" as const,
    policyDueAt: input.dueAt,
    queueSortAt: buildActionItemQueueSortAt(input.dueAt, item.status),
  };
}

export function buildPolicyOverrideBuildActionItemDeadlinePatch(
  item: BuildActionItemDeadlineState,
  input: { dueAt: number; reason: string; workosUserId: string; now: number }
) {
  if (item.dueDateSource !== "policy") {
    throw new Error(
      "This Action Item does not have a policy-derived due date."
    );
  }
  const reason = input.reason.trim();
  if (!reason) {
    throw new Error("A policy due-date override reason is required.");
  }
  if (!(Number.isFinite(input.dueAt) && input.dueAt > 0)) {
    throw new Error("A valid policy due date is required.");
  }
  const deadlineSchedule =
    input.dueAt === item.dueAt
      ? {}
      : resetBuildActionItemDeadlineSchedule(
          input.dueAt,
          item.status,
          item.deadlineScheduleGeneration
        );
  return {
    ...deadlineSchedule,
    dueAt: input.dueAt,
    dueDateOverrideReason: reason,
    dueDateOverriddenAt: input.now,
    dueDateOverriddenByWorkosUserId: input.workosUserId,
    queueSortAt: buildActionItemQueueSortAt(input.dueAt, item.status),
  };
}
