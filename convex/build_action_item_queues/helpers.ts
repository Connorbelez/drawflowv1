import type {
  ActiveBuildAuthorization,
  ActiveBuildParticipantProjection,
} from "../activeBuildAccess";
import { projectActiveBuildParticipants } from "../activeBuildAccess";
import {
  advanceBuildActionItemDeadlineSchedule,
  BUILD_ACTION_ITEM_DEADLINE_DAY_MS,
  type BuildActionItemDeadlineStage,
  buildActionItemQueueSortAt,
  dueBuildActionItemDeadlineStages,
  resetBuildActionItemDeadlineSchedule,
} from "../build_action_item_deadline_model";
import { actionItemRequiresAcceptance } from "../build_action_item_governance";
import { recordBuildActionItemRevision } from "../build_action_item_history";
import { syncBuildActionItemReferenceQueueSortAt } from "../build_action_item_queue_projection";
import {
  authorizeBuildActionItemOperation,
  isBuildActionItemCoordinator,
} from "../build_action_item_rbac";
import { requireReadableActionItem } from "../build_action_items";
import {
  resolveCurrentCollaborationNotificationReaderIds,
  resolveCurrentCollaborationPostReaderIds,
} from "../build_collaboration_access";
import { systemActionItemPresentationValidator } from "../build_collaboration_contracts";
import { buildCollaborationDeepLink } from "../build_collaboration_links";
import {
  type BuildCollaborationRole,
  collaborationRoleTier,
} from "../build_collaboration_model";
import {
  emitCanonicalBuildCollaborationNotification,
  notificationKindForDeadlineStage,
} from "../build_collaboration_notifications";
import {
  type CanonicalBuildCollaborationReference,
  resolveCanonicalBuildCollaborationReferences,
} from "../build_collaboration_references";
import { authorizeActiveBuildCollaborationAccess } from "../build_collaboration_rollout";
import { buildLocalMidnightUtc } from "../build_collaboration_system_posts";
import type { Doc, Id, MutationCtx, QueryCtx } from "../types";

const MAX_REFERENCES_PER_ACTION_ITEM = 100;
const MAX_ACTIVE_PARTICIPANTS = 500;
const MAX_GLOBAL_AUTHORITY_MEMBERSHIPS = 2000;
const MAX_QUEUE_PAGE_SIZE = 50;
const DAY_MS = BUILD_ACTION_ITEM_DEADLINE_DAY_MS;

export function overdueByBuildLocalDate(
  date: string,
  timezone: string,
  now: number
) {
  try {
    const dueAt = buildLocalMidnightUtc(date, timezone);
    return now > dueAt ? now - dueAt : 0;
  } catch {
    return 0;
  }
}

export function boundedQueuePagination(input: {
  cursor: string | null;
  numItems: number;
}) {
  if (
    !Number.isInteger(input.numItems) ||
    input.numItems < 1 ||
    input.numItems > MAX_QUEUE_PAGE_SIZE
  ) {
    throw new Error(
      `Action Item queue pages must contain 1 to ${MAX_QUEUE_PAGE_SIZE} items.`
    );
  }
  return input;
}

export function actionItemOverdueState(
  item: Pick<Doc<"buildActionItems">, "dueAt" | "status">,
  now: number
) {
  const overdue =
    !isClosedActionItem(item) && item.dueAt !== undefined && now > item.dueAt;
  return {
    overdue,
    overdueByMs: overdue ? now - (item.dueAt as number) : undefined,
  };
}

export function isClosedActionItem(
  item: Pick<Doc<"buildActionItems">, "status">
) {
  return item.status === "done" || item.status === "cancelled";
}

export async function requireScopedActionItem(
  ctx: QueryCtx,
  input: {
    actionItemId: Id<"buildActionItems">;
    buildId: Id<"activeBuilds">;
    organizationId: string;
  }
) {
  const item = await ctx.db.get(input.actionItemId);
  if (
    !item ||
    item.buildId !== input.buildId ||
    item.organizationId !== input.organizationId
  ) {
    throw new Error("Action Item is unavailable.");
  }
  const build = await ctx.db.get(input.buildId);
  if (
    !build ||
    build.organizationId !== input.organizationId ||
    build.brokerageId !== item.brokerageId
  ) {
    throw new Error("Action Item Build scope is unavailable.");
  }
  return item;
}

export function actionItemDecision(
  authorization: ActiveBuildAuthorization,
  item: Doc<"buildActionItems">
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
      requiresAcceptance: actionItemRequiresAcceptance(item),
      status: item.status,
    },
    operation: "edit_fields",
  });
}

export function assertExpectedRevision(
  item: Doc<"buildActionItems">,
  expectedRevision: number | undefined
) {
  if (
    expectedRevision !== undefined &&
    item.currentRevision !== expectedRevision
  ) {
    throw new Error(
      "This Action Item changed since you opened it. Refresh and try again."
    );
  }
}

export function assertActionItemReferenceScope(
  rows: readonly Doc<"buildCollaborationReferences">[],
  expected: {
    brokerageId: Id<"brokerages">;
    buildId: Id<"activeBuilds">;
    organizationId: string;
    ownerRecordId: Id<"buildActionItems">;
    postId: Id<"buildCollaborationPosts">;
  }
) {
  const corrupted = rows.some(
    (row) =>
      row.organizationId !== expected.organizationId ||
      row.brokerageId !== expected.brokerageId ||
      row.buildId !== expected.buildId ||
      row.postId !== expected.postId ||
      row.ownerKind !== "actionItem" ||
      row.ownerRecordId !== expected.ownerRecordId
  );
  if (corrupted) {
    throw new Error(
      "Action Item reference scope integrity failure; repair the legacy reference before editing."
    );
  }
}

export function sameReferences(
  existing: Doc<"buildCollaborationReferences">[],
  next: CanonicalBuildCollaborationReference[]
) {
  const existingKeys = existing.map(referenceKey).sort();
  const nextKeys = next
    .map((reference) =>
      [
        reference.entityKind,
        reference.entityId,
        reference.primary ? "primary" : "secondary",
        reference.label,
        reference.summary ?? "",
      ].join(":")
    )
    .sort();
  return JSON.stringify(existingKeys) === JSON.stringify(nextKeys);
}

function referenceKey(reference: Doc<"buildCollaborationReferences">) {
  return [
    reference.entityKind,
    reference.entityId,
    reference.primary ? "primary" : "secondary",
    reference.labelSnapshot,
    reference.summarySnapshot ?? "",
  ].join(":");
}

export async function recordMaterialReferenceChange(
  ctx: MutationCtx,
  input: {
    authorization: ActiveBuildAuthorization;
    decision: ReturnType<typeof actionItemDecision>;
    existing: Doc<"buildCollaborationReferences">[];
    item: Doc<"buildActionItems">;
    now: number;
    reason: string;
    references: CanonicalBuildCollaborationReference[];
  }
) {
  const priorTargets = input.existing.map((row) => ({
    entityId: row.entityId,
    entityKind: row.entityKind,
  }));
  const nextTargets = input.references.map((row) => ({
    entityId: row.entityId,
    entityKind: row.entityKind,
  }));
  const state = JSON.stringify({ nextTargets, priorTargets });
  await ctx.db.insert("buildActionItemEvents", {
    actionItemId: input.item._id,
    actorRole: input.authorization.effectiveRole.role,
    actorWorkosUserId: input.authorization.viewer.subject,
    brokerageId: input.authorization.brokerage._id,
    buildId: input.authorization.build._id,
    createdAt: input.now,
    eventType: "references_changed",
    exercisedAuthority: input.decision.authority,
    newState: state,
    organizationId: input.authorization.organizationId,
    reason: input.reason,
    revision: input.item.currentRevision,
  });
  await recordBuildActionItemRevision(ctx, {
    authorization: input.authorization,
    item: input.item,
    now: input.now,
    reason: input.reason,
  });
  const post = await ctx.db.get(input.item.originatingPostId);
  if (!post) {
    throw new Error("Action Item parent post is unavailable.");
  }
  await ctx.db.patch(post._id, {
    lastMeaningfulActivityAt: input.now,
    latestActivityActorWorkosUserId: input.authorization.viewer.subject,
    updatedAt: input.now,
  });
  const targets = new Map(
    [...priorTargets, ...nextTargets].map((target) => [
      `${target.entityKind}:${target.entityId}`,
      target,
    ])
  );
  for (const target of targets.values()) {
    await ctx.db.insert("buildCollaborationActivityProjections", {
      actionItemId: input.item._id,
      actorWorkosUserId: input.authorization.viewer.subject,
      brokerageId: input.authorization.brokerage._id,
      buildId: input.authorization.build._id,
      createdAt: input.now,
      eventType: "action_item_references_changed",
      organizationId: input.authorization.organizationId,
      postId: post._id,
      projectionKey: [
        "action_item_references_changed",
        input.item._id,
        input.item.currentRevision,
        target.entityKind,
        target.entityId,
      ].join(":"),
      targetId: target.entityId,
      targetKind: target.entityKind,
    });
  }
  await Promise.all([
    ctx.db.insert("auditEvents", {
      actorRoles: input.authorization.roles,
      actorWorkosUserId: input.authorization.viewer.subject,
      brokerageId: input.authorization.brokerage._id,
      command: "replaceBuildActionItemReferences",
      createdAt: input.now,
      entityId: input.item._id,
      entityType: "buildActionItem",
      eventType: "build.collaboration.action_item.references_changed",
      newState: state,
      organizationId: input.authorization.organizationId,
      reason: input.reason,
      warnings: [],
    }),
    ctx.db.insert("eventOutbox", {
      brokerageId: input.authorization.brokerage._id,
      createdAt: input.now,
      eventType: "build.collaboration.action_item.references_changed",
      organizationId: input.authorization.organizationId,
      payloadPreview: state,
      relatedEntityId: input.item._id,
      relatedEntityType: "buildActionItem",
      status: "pending",
    }),
  ]);
}

export async function recordActionItemDeadlineChange(
  ctx: MutationCtx,
  input: {
    authorization: ActiveBuildAuthorization;
    eventType: "policy_due_date_applied" | "policy_due_date_overridden";
    item: Doc<"buildActionItems">;
    now: number;
    prior: Doc<"buildActionItems">;
    reason: string;
  }
) {
  const state = JSON.stringify({
    dueAt: input.item.dueAt,
    dueDatePolicyKey: input.item.dueDatePolicyKey,
    dueDateSource: input.item.dueDateSource,
    policyDueAt: input.item.policyDueAt,
  });
  await ctx.db.insert("buildActionItemEvents", {
    actionItemId: input.item._id,
    actorRole: input.authorization.effectiveRole.role,
    actorWorkosUserId: input.authorization.viewer.subject,
    brokerageId: input.authorization.brokerage._id,
    buildId: input.authorization.build._id,
    createdAt: input.now,
    eventType: input.eventType,
    exercisedAuthority: "coordinator",
    newState: state,
    organizationId: input.authorization.organizationId,
    priorState: JSON.stringify({ dueAt: input.prior.dueAt }),
    reason: input.reason,
    revision: input.item.currentRevision,
  });
  await recordBuildActionItemRevision(ctx, {
    authorization: input.authorization,
    item: input.item,
    now: input.now,
    reason: input.reason,
  });
  await Promise.all([
    ctx.db.insert("auditEvents", {
      actorRoles: input.authorization.roles,
      actorWorkosUserId: input.authorization.viewer.subject,
      brokerageId: input.authorization.brokerage._id,
      command: input.eventType,
      createdAt: input.now,
      entityId: input.item._id,
      entityType: "buildActionItem",
      eventType: `build.collaboration.action_item.${input.eventType}`,
      newState: state,
      organizationId: input.authorization.organizationId,
      priorState: JSON.stringify({ dueAt: input.prior.dueAt }),
      reason: input.reason,
      warnings: [],
    }),
    ctx.db.insert("eventOutbox", {
      brokerageId: input.authorization.brokerage._id,
      createdAt: input.now,
      eventType: `build.collaboration.action_item.${input.eventType}`,
      organizationId: input.authorization.organizationId,
      payloadPreview: state,
      relatedEntityId: input.item._id,
      relatedEntityType: "buildActionItem",
      status: "pending",
    }),
  ]);
}

export async function emitEligibleDeadlineStages(
  ctx: MutationCtx,
  item: Doc<"buildActionItems">,
  stages: readonly BuildActionItemDeadlineStage[]
) {
  const authorization = await loadSystemAuthorization(ctx, item);
  const post = await ctx.db.get(item.originatingPostId);
  if (
    !post ||
    post.buildId !== item.buildId ||
    post.organizationId !== item.organizationId ||
    post.brokerageId !== item.brokerageId
  ) {
    throw new Error("Action Item parent post scope integrity failure.");
  }
  const readers = new Set(
    await resolveCurrentCollaborationNotificationReaderIds(
      ctx,
      authorization,
      post
    )
  );
  const responsibleId = item.assigneeWorkosUserId ?? item.creatorWorkosUserId;
  for (const stage of stages) {
    const recipientWorkosUserId =
      stage === "escalated"
        ? escalationRecipient(authorization, item, readers)
        : readers.has(responsibleId)
          ? responsibleId
          : undefined;
    if (!recipientWorkosUserId) {
      continue;
    }
    await emitDeadlineStage(ctx, {
      authorization,
      item,
      readerIds: readers,
      recipientWorkosUserId,
      stage,
    });
  }
}

export function eligibleDeadlineStages(
  dueAt: number,
  asOf: number
): BuildActionItemDeadlineStage[] {
  const stages: BuildActionItemDeadlineStage[] = [];
  if (asOf >= dueAt - DAY_MS) {
    stages.push("before");
  }
  if (asOf >= dueAt) {
    stages.push("due");
  }
  if (asOf >= dueAt + DAY_MS) {
    stages.push("overdue");
  }
  if (asOf >= dueAt + 2 * DAY_MS) {
    stages.push("escalated");
  }
  return stages;
}

function escalationRecipient(
  authorization: ActiveBuildAuthorization,
  item: Doc<"buildActionItems">,
  readers: Set<string>
) {
  const coordinators = authorization.participants
    .filter(
      (participant) =>
        participant.workosUserId !== item.assigneeWorkosUserId &&
        readers.has(participant.workosUserId) &&
        isBuildActionItemCoordinator(participant.role)
    )
    .sort(
      (left, right) =>
        collaborationRoleTier(right.role) - collaborationRoleTier(left.role) ||
        left.workosUserId.localeCompare(right.workosUserId)
    );
  return (
    coordinators.find(
      (participant) => participant.workosUserId === item.assignedByWorkosUserId
    )?.workosUserId ??
    coordinators.find(
      (participant) => participant.workosUserId === item.creatorWorkosUserId
    )?.workosUserId ??
    coordinators[0]?.workosUserId
  );
}

async function emitDeadlineStage(
  ctx: MutationCtx,
  input: {
    authorization: ActiveBuildAuthorization;
    item: Doc<"buildActionItems">;
    readerIds: Set<string>;
    recipientWorkosUserId: string;
    stage: BuildActionItemDeadlineStage;
  }
) {
  const dueAt = input.item.dueAt as number;
  const dedupeKey = `build-action-item:${input.item._id}:schedule:${input.item.deadlineScheduleGeneration ?? 0}:${input.stage}:${dueAt}`;
  const now = Date.now();
  const title = deadlineTitle(input.stage);
  const recipientRole = input.authorization.participants.find(
    (participant) => participant.workosUserId === input.recipientWorkosUserId
  )?.role;
  const href = buildActionItemDeadlineHref({
    actionItemId: input.item._id,
    buildId: input.item.buildId,
    recipientRole,
  });
  const deliveryId = await emitCanonicalBuildCollaborationNotification(ctx, {
    actionItemId: input.item._id,
    actionLabel: "Open Action Item",
    authorization: input.authorization,
    body: `${input.item.title} · due ${new Date(dueAt).toISOString()}`,
    dedupeKey,
    entityId: input.item._id,
    entityType: "buildActionItem",
    href,
    kind: notificationKindForDeadlineStage(input.stage),
    now,
    postId: input.item.originatingPostId,
    readerIds: input.readerIds,
    recipientWorkosUserId: input.recipientWorkosUserId,
    title,
  });
  if (!deliveryId) {
    return;
  }
  const payload = JSON.stringify({
    actionItemId: input.item._id,
    dueAt,
    recipientWorkosUserId: input.recipientWorkosUserId,
    stage: input.stage,
  });
  await Promise.all([
    ctx.db.insert("auditEvents", {
      actorRoles: ["admin"],
      actorWorkosUserId: "system:action-item-deadlines",
      brokerageId: input.authorization.brokerage._id,
      command: "processBuildActionItemDeadlines",
      createdAt: now,
      entityId: input.item._id,
      entityType: "buildActionItem",
      eventType: `build.collaboration.action_item.deadline.${input.stage}`,
      newState: payload,
      organizationId: input.authorization.organizationId,
      warnings: [],
    }),
    ctx.db.insert("eventOutbox", {
      brokerageId: input.authorization.brokerage._id,
      createdAt: now,
      eventType: `build.collaboration.action_item.deadline.${input.stage}`,
      organizationId: input.authorization.organizationId,
      payloadPreview: payload,
      relatedEntityId: input.item._id,
      relatedEntityType: "buildActionItem",
      status: "pending",
    }),
  ]);
}

export function buildActionItemDeadlineHref(input: {
  actionItemId: string;
  buildId: string;
  recipientRole: BuildCollaborationRole | undefined;
}) {
  return buildCollaborationDeepLink({
    buildId: input.buildId,
    focus: `actionItem:${input.actionItemId}`,
    recipientRole: input.recipientRole,
  });
}

function deadlineTitle(stage: BuildActionItemDeadlineStage) {
  switch (stage) {
    case "before":
      return "Action Item due soon";
    case "due":
      return "Action Item due now";
    case "overdue":
      return "Action Item overdue";
    case "escalated":
      return "Overdue Action Item escalated";
  }
}

export async function quarantineBuildActionItemDeadline(
  ctx: MutationCtx,
  item: Doc<"buildActionItems">,
  error: unknown
) {
  const now = Date.now();
  const failure =
    error instanceof Error
      ? error.message.slice(0, 500)
      : "Unknown deadline processing failure";
  await ctx.db.patch(item._id, {
    deadlineNextAt: undefined,
    deadlineNextStage: undefined,
    deadlineProcessingFailedAt: now,
    deadlineProcessingFailure: failure,
    deadlineProcessingState: "quarantined",
  });
  const trustedScope = await resolveTrustedDeadlineQuarantineScope(ctx, item);
  if (!trustedScope) {
    console.error(
      "Action Item deadline quarantined without tenant attribution",
      {
        actionItemId: item._id,
        buildId: item.buildId,
        failure,
      }
    );
    return;
  }
  const payload = JSON.stringify({
    actionItemId: item._id,
    failure,
    state: "quarantined",
  });
  await Promise.all([
    ctx.db.insert("auditEvents", {
      actorRoles: ["admin"],
      actorWorkosUserId: "system:action-item-deadlines",
      brokerageId: trustedScope.brokerageId,
      command: "quarantineBuildActionItemDeadline",
      createdAt: now,
      entityId: item._id,
      entityType: "buildActionItem",
      eventType: "build.collaboration.action_item.deadline.quarantined",
      newState: payload,
      organizationId: trustedScope.organizationId,
      warnings: [failure],
    }),
    ctx.db.insert("eventOutbox", {
      brokerageId: trustedScope.brokerageId,
      createdAt: now,
      eventType: "build.collaboration.action_item.deadline.quarantined",
      organizationId: trustedScope.organizationId,
      payloadPreview: payload,
      relatedEntityId: item._id,
      relatedEntityType: "buildActionItem",
      status: "pending",
    }),
  ]);
}

async function resolveTrustedDeadlineQuarantineScope(
  ctx: MutationCtx,
  item: Doc<"buildActionItems">
) {
  const build = await ctx.db.get(item.buildId);
  if (!build) {
    return null;
  }
  const [brokerage, proposal] = await Promise.all([
    ctx.db.get(build.brokerageId),
    ctx.db.get(build.proposalId),
  ]);
  if (
    !(brokerage && proposal) ||
    brokerage.workosOrganizationId !== build.organizationId ||
    proposal.organizationId !== build.organizationId ||
    proposal.brokerageId !== build.brokerageId
  ) {
    return null;
  }
  return {
    brokerageId: build.brokerageId,
    organizationId: build.organizationId,
  };
}

export async function loadSystemAuthorization(
  ctx: QueryCtx,
  item: Doc<"buildActionItems">
): Promise<ActiveBuildAuthorization> {
  const build = await ctx.db.get(item.buildId);
  if (
    !build ||
    build.organizationId !== item.organizationId ||
    build.brokerageId !== item.brokerageId
  ) {
    throw new Error("Action Item Build scope is unavailable.");
  }
  const [brokerage, proposal, activeParticipants, organizationMemberships] =
    await Promise.all([
      ctx.db.get(build.brokerageId),
      ctx.db.get(build.proposalId),
      ctx.db
        .query("buildParticipants")
        .withIndex("by_buildId_and_status", (query) =>
          query.eq("buildId", build._id).eq("status", "active")
        )
        .take(MAX_ACTIVE_PARTICIPANTS + 1),
      ctx.db
        .query("workosOrganizationMemberships")
        .withIndex("by_organization", (query) =>
          query.eq("workosOrganizationId", item.organizationId)
        )
        .take(MAX_GLOBAL_AUTHORITY_MEMBERSHIPS + 1),
    ]);
  if (
    !(brokerage && proposal) ||
    brokerage.workosOrganizationId !== item.organizationId ||
    proposal.organizationId !== item.organizationId ||
    proposal.brokerageId !== brokerage._id
  ) {
    throw new Error("Action Item tenant scope is unavailable.");
  }
  if (activeParticipants.length > MAX_ACTIVE_PARTICIPANTS) {
    throw new Error(
      "Action Item participant projection exceeds the safe limit."
    );
  }
  if (organizationMemberships.length > MAX_GLOBAL_AUTHORITY_MEMBERSHIPS) {
    throw new Error(
      "Organization authority projection exceeds the safe limit."
    );
  }
  const participants = await projectActiveBuildParticipants(ctx, {
    build,
    grantedParticipants: activeParticipants,
    proposal,
  });
  mergeGlobalAuthorityParticipants(participants, organizationMemberships);
  return {
    brokerage,
    build,
    effectiveRole: { role: "admin", tier: collaborationRoleTier("admin") },
    organizationId: item.organizationId,
    participants,
    proposal,
    roles: ["admin"],
    viewer: {
      actorKind: "system",
      capability: "authenticated",
      organizationId: item.organizationId,
      roles: ["admin"],
      subject: "system:action-item-deadlines",
      tokenIdentifier: `system:action-item-deadlines:${build._id}`,
    },
  };
}

function mergeGlobalAuthorityParticipants(
  participants: ActiveBuildParticipantProjection[],
  organizationMemberships: Doc<"workosOrganizationMemberships">[]
) {
  for (const membership of organizationMemberships) {
    if (membership.status !== "active") {
      continue;
    }
    const currentRoles = new Set([
      ...membership.roleSlugs,
      ...(membership.roleSlug ? [membership.roleSlug] : []),
    ]);
    const role = currentRoles.has("admin")
      ? "admin"
      : currentRoles.has("principle-broker") ||
          currentRoles.has("principal-broker")
        ? "principle-broker"
        : undefined;
    if (!role) {
      continue;
    }
    const existingIndex = participants.findIndex(
      (participant) => participant.workosUserId === membership.workosUserId
    );
    if (existingIndex >= 0) {
      const existing = participants[existingIndex];
      if (collaborationRoleTier(role) > collaborationRoleTier(existing.role)) {
        participants[existingIndex] = {
          ...existing,
          role,
          source: "derived",
        };
      }
      continue;
    }
    participants.push({
      displayName: membership.workosUserId,
      participationPeriod: 1,
      role,
      source: "derived",
      workosUserId: membership.workosUserId,
    });
  }
}
