import { v } from "convex/values";
import type { BuildCollaborationSystemEventInput } from "../build_collaboration_system_events";

import {
  type ActiveBuildAuthorization,
  type ActiveBuildParticipantProjection,
  projectActiveBuildParticipants,
} from "../activeBuildAccess";
import { normalizeRoleSlugs } from "../authz";
import {
  BUILD_ACTION_ITEM_DEADLINE_DAY_MS,
  buildActionItemQueueSortAt,
  resetBuildActionItemDeadlineSchedule,
} from "../build_action_item_deadline_model";
import { recordBuildActionItemRevision } from "../build_action_item_history";
import {
  linkBuildActionItemToPost,
  syncLinkedActionItemPostCounts,
} from "../build_action_item_post_links";
import { stableContentHash } from "../build_collaboration_hash";
import { requireBuildCollaborationWritable } from "../build_collaboration_lifecycle_state";
import { buildCollaborationDeepLink } from "../build_collaboration_links";
import { collaborationRoleTier } from "../build_collaboration_model";
import {
  type BuildCollaborationNotificationKind,
  emitCanonicalBuildCollaborationNotification,
} from "../build_collaboration_notifications";
import {
  type CanonicalBuildCollaborationReference,
  resolveCanonicalBuildCollaborationReferences,
} from "../build_collaboration_references";
import {
  BUILD_COLLABORATION_UNAVAILABLE_ERROR,
  isBuildCollaborationCutoverFrozen,
} from "../build_collaboration_rollout";
import { queueBuildCollaborationSearchBuildRebuild } from "../build_collaboration_search_maintenance";
import {
  canReadDrawSystemEvent,
  canReadMilestoneSystemEvent,
} from "../build_collaboration_system_event_access";
import {
  buildCollaborationNotificationKindValidator,
  buildCollaborationPostTypeValidator,
  buildCollaborationReferenceKindValidator,
  buildCollaborationRoleValidator,
} from "../build_collaboration_validators";
import { internalMutation } from "../fluent";
import type { Id, MutationCtx } from "../types";

const systemReferenceValidator = v.object({
  entityId: v.string(),
  entityKind: buildCollaborationReferenceKindValidator,
  primary: v.optional(v.boolean()),
});

const remediationValidator = v.object({
  description: v.string(),
  obligationKey: v.optional(v.string()),
  policyKey: v.string(),
  title: v.string(),
  workKind: v.union(
    v.literal("evidence"),
    v.literal("site_visit_remediation"),
    v.literal("draw_blocker")
  ),
});

const systemPostBackfillValidator = v.object({
  historicalActorRole: v.optional(buildCollaborationRoleValidator),
  historicalActorWorkosUserId: v.optional(v.string()),
  historicalAt: v.optional(v.number()),
  materializedAt: v.number(),
  unknownFacts: v.array(
    v.union(
      v.literal("start"),
      v.literal("actor"),
      v.literal("evidence"),
      v.literal("review"),
      v.literal("approval"),
      v.literal("disposition")
    )
  ),
});

export function normalizeSystemReferences(
  input: BuildCollaborationSystemEventInput
) {
  if (
    Boolean(input.primaryReferenceId) !== Boolean(input.primaryReferenceKind)
  ) {
    throw new Error(
      "System event references require both an entity kind and entity ID."
    );
  }
  const references = [...(input.references ?? [])];
  if (input.primaryReferenceId && input.primaryReferenceKind) {
    references.unshift({
      entityId: input.primaryReferenceId,
      entityKind: input.primaryReferenceKind,
      primary: true,
    });
  }
  const seen = new Set<string>();
  const normalized = references.filter((reference) => {
    if (!reference.entityKind) {
      throw new Error("A system event reference kind is required.");
    }
    const key = `${reference.entityKind}:${reference.entityId}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
  const explicitPrimary = normalized.findIndex(
    (reference) => reference.primary
  );
  return normalized.map((reference, index) => ({
    entityId: reference.entityId,
    entityKind: reference.entityKind as NonNullable<
      BuildCollaborationSystemEventInput["primaryReferenceKind"]
    >,
    primary: index === (explicitPrimary >= 0 ? explicitPrimary : 0),
  }));
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Reader policy branches are intentionally centralized with the canonical system-event publisher.
export async function systemEventReaders(
  ctx: MutationCtx,
  input: {
    buildId: Id<"activeBuilds">;
    participants: ActiveBuildParticipantProjection[];
    primaryReferenceId?: string;
    primaryReferenceKind?: BuildCollaborationSystemEventInput["primaryReferenceKind"];
    systemPostKind?: BuildCollaborationSystemEventInput["systemPostKind"];
  }
) {
  if (input.systemPostKind === "milestone") {
    const milestoneId = input.primaryReferenceId
      ? ctx.db.normalizeId("buildMilestones", input.primaryReferenceId)
      : null;
    const readerDecisions = await Promise.all(
      input.participants.map(async (participant) => ({
        allowed: await canReadMilestoneSystemEvent(ctx, {
          buildId: input.buildId,
          milestoneId: milestoneId ?? undefined,
          role: participant.role,
          workosUserId: participant.workosUserId,
        }),
        participant,
      }))
    );
    return readerDecisions
      .filter((decision) => decision.allowed)
      .map((decision) => decision.participant);
  }
  if (input.primaryReferenceKind === "draw") {
    const readerDecisions = await Promise.all(
      input.participants.map(async (participant) => ({
        allowed: await canReadDrawSystemEvent(ctx, {
          buildId: input.buildId,
          role: participant.role,
          workosUserId: participant.workosUserId,
        }),
        participant,
      }))
    );
    return readerDecisions
      .filter((decision) => decision.allowed)
      .map((decision) => decision.participant);
  }
  if (
    input.primaryReferenceKind === "evidenceAsset" ||
    input.primaryReferenceKind === "evidencePackage"
  ) {
    return input.participants.filter(
      (participant) =>
        participant.role !== "contractor" && participant.role !== "homeowner"
    );
  }
  if (input.primaryReferenceKind === "document") {
    const documentId = input.primaryReferenceId
      ? ctx.db.normalizeId("buildDocuments", input.primaryReferenceId)
      : null;
    const document = documentId ? await ctx.db.get(documentId) : null;
    if (!document || document.buildId !== input.buildId) {
      throw new Error("The referenced Document is unavailable.");
    }
    return input.participants.filter(
      (participant) =>
        participant.role !== "homeowner" &&
        (participant.role !== "contractor" ||
          document.documentType === "permit" ||
          document.contractorVisible === true)
    );
  }
  if (input.primaryReferenceKind !== "siteVisit") {
    return input.participants;
  }
  const visitId = input.primaryReferenceId
    ? ctx.db.normalizeId("buildSiteVisits", input.primaryReferenceId)
    : null;
  const visit = visitId ? await ctx.db.get(visitId) : null;
  if (!visit || visit.buildId !== input.buildId) {
    throw new Error("The referenced Site Visit is unavailable.");
  }
  const assignments = await ctx.db
    .query("milestoneContractorAssignments")
    .withIndex("by_build_milestone", (query) =>
      query.eq("buildId", input.buildId).eq("milestoneKey", visit.milestoneKey)
    )
    .take(500);
  const scopedAssignments = assignments.filter(
    (assignment) =>
      assignment.status !== "removed" &&
      (!(visit.submilestoneKeys?.length && assignment.submilestoneKey) ||
        visit.submilestoneKeys.includes(assignment.submilestoneKey))
  );
  const contractorWorkosUserIds = new Set<string>();
  for (const contractorId of new Set(
    scopedAssignments.map((assignment) => assignment.contractorId)
  )) {
    const contractor = await ctx.db.get(contractorId);
    if (contractor?.accountWorkosUserId) {
      contractorWorkosUserIds.add(contractor.accountWorkosUserId);
    }
  }
  return input.participants.filter(
    (participant) =>
      participant.role !== "homeowner" &&
      (participant.role !== "contractor" ||
        contractorWorkosUserIds.has(participant.workosUserId))
  );
}

export async function projectOrganizationAuthorityParticipants(
  ctx: MutationCtx,
  organizationId: string
) {
  const memberships = await ctx.db
    .query("workosOrganizationMemberships")
    .withIndex("by_organization", (query) =>
      query.eq("workosOrganizationId", organizationId)
    )
    .take(500);
  const authorities = new Map<
    string,
    ActiveBuildParticipantProjection["role"]
  >();
  for (const membership of memberships) {
    if (membership.status !== "active") {
      continue;
    }
    const roles = normalizeRoleSlugs([
      ...membership.roleSlugs,
      membership.roleSlug,
    ]);
    const authorityRole = roles.includes("admin")
      ? "admin"
      : roles.includes("principle-broker")
        ? "principle-broker"
        : null;
    if (!authorityRole) {
      continue;
    }
    const existing = authorities.get(membership.workosUserId);
    if (
      !existing ||
      collaborationRoleTier(authorityRole) > collaborationRoleTier(existing)
    ) {
      authorities.set(membership.workosUserId, authorityRole);
    }
  }
  return await Promise.all(
    [...authorities].map(async ([workosUserId, role]) => {
      const user = await ctx.db
        .query("users")
        .withIndex("by_workos_user_id", (query) =>
          query.eq("workosUserId", workosUserId)
        )
        .order("desc")
        .first();
      return {
        displayName: user?.name ?? user?.email ?? workosUserId,
        participationPeriod: 1,
        role,
        source: "derived" as const,
        workosUserId,
      };
    })
  );
}

export function systemEventAudience(
  allParticipants: ActiveBuildParticipantProjection[],
  readers: ActiveBuildParticipantProjection[]
) {
  if (readers.length === allParticipants.length) {
    return {
      explicitReaderIds: [] as string[],
      floorTier: 0,
      mode: "build_wide" as const,
    };
  }
  const floorTier = 3;
  return {
    explicitReaderIds: readers
      .filter((reader) => collaborationRoleTier(reader.role) < floorTier)
      .map((reader) => reader.workosUserId),
    floorTier,
    mode: "custom" as const,
  };
}

export function systemAuthorization(input: {
  brokerage: ActiveBuildAuthorization["brokerage"];
  build: ActiveBuildAuthorization["build"];
  participants: ActiveBuildParticipantProjection[];
  proposal: ActiveBuildAuthorization["proposal"];
}): ActiveBuildAuthorization {
  return {
    brokerage: input.brokerage,
    build: input.build,
    effectiveRole: { role: "admin", tier: 5 },
    organizationId: input.build.organizationId,
    participants: input.participants,
    proposal: input.proposal,
    roles: ["admin"],
    viewer: {
      actorKind: "system",
      capability: "authenticated",
      organizationId: input.build.organizationId,
      roles: ["admin"],
      subject: "system",
      tokenIdentifier: "system:build-collaboration",
    },
  };
}

export async function persistSystemReferences(
  ctx: MutationCtx,
  input: {
    authorization: ActiveBuildAuthorization;
    now: number;
    ownerRecordId: Id<"buildCollaborationPostRevisions">;
    postId: Id<"buildCollaborationPosts">;
    references: CanonicalBuildCollaborationReference[];
  }
) {
  const ids: Id<"buildCollaborationReferences">[] = [];
  for (const reference of input.references) {
    ids.push(
      await ctx.db.insert("buildCollaborationReferences", {
        brokerageId: input.authorization.brokerage._id,
        buildId: input.authorization.build._id,
        createdAt: input.now,
        entityId: reference.entityId,
        entityKind: reference.entityKind,
        labelSnapshot: reference.label,
        organizationId: input.authorization.organizationId,
        ownerKind: "postRevision",
        ownerRecordId: input.ownerRecordId,
        postId: input.postId,
        primary: Boolean(reference.primary),
        summarySnapshot: reference.summary,
      })
    );
  }
  return ids;
}

export async function createDeterministicRemediationActionItem(
  ctx: MutationCtx,
  input: {
    authorization: ActiveBuildAuthorization;
    idempotencyKey: string;
    now: number;
    postId: Id<"buildCollaborationPosts">;
    references: CanonicalBuildCollaborationReference[];
    remediation: NonNullable<BuildCollaborationSystemEventInput["remediation"]>;
  }
) {
  const policyKey = requiredBoundedText(
    input.remediation.policyKey,
    "Remediation policy key",
    240
  );
  const primaryReference =
    input.references.find((reference) => reference.primary) ??
    input.references[0];
  const obligationTarget = requiredBoundedText(
    input.remediation.obligationKey ??
      `${primaryReference?.entityKind ?? "build"}:${primaryReference?.entityId ?? input.authorization.build._id}`,
    "Remediation obligation key",
    500
  );
  const policyObligationKey = `${policyKey}:${obligationTarget}`;
  const priorObligations = await ctx.db
    .query("buildActionItems")
    .withIndex("by_buildId_and_policyObligationKey", (query) =>
      query
        .eq("buildId", input.authorization.build._id)
        .eq("policyObligationKey", policyObligationKey)
    )
    .take(100);
  const existingOpenObligation = priorObligations.find(
    (item) => item.status !== "done" && item.status !== "cancelled"
  );
  if (existingOpenObligation) {
    await linkBuildActionItemToPost(ctx, {
      actionItemId: existingOpenObligation._id,
      brokerageId: input.authorization.brokerage._id,
      buildId: input.authorization.build._id,
      createdAt: input.now,
      linkKind: "policy_obligation",
      organizationId: input.authorization.organizationId,
      postId: input.postId,
    });
    await syncLinkedActionItemPostCounts(ctx, {
      actionItemId: existingOpenObligation._id,
      actorWorkosUserId: "system",
      now: input.now,
    });
    return existingOpenObligation._id;
  }
  const requestId = `system-policy:${policyKey}:${input.idempotencyKey}`;
  const existing = await ctx.db
    .query("buildActionItemCreationRequests")
    .withIndex("by_postId_and_creatorWorkosUserId_and_requestId", (query) =>
      query
        .eq("postId", input.postId)
        .eq("creatorWorkosUserId", "system")
        .eq("requestId", requestId)
    )
    .first();
  if (existing) {
    return existing.actionItemId;
  }
  const title = requiredBoundedText(
    input.remediation.title,
    "Remediation title",
    240
  );
  const description = requiredBoundedText(
    input.remediation.description,
    "Remediation description",
    2000
  );
  const dueAt = input.now + 3 * BUILD_ACTION_ITEM_DEADLINE_DAY_MS;
  const deadlineSchedule = resetBuildActionItemDeadlineSchedule(dueAt, "todo");
  const actionItemId = await ctx.db.insert("buildActionItems", {
    assignmentState: "unassigned",
    brokerageId: input.authorization.brokerage._id,
    buildId: input.authorization.build._id,
    createdAt: input.now,
    creatorRole: "admin",
    creatorWorkosUserId: "system",
    currentRevision: 1,
    descriptionPlainText: description,
    descriptionTiptapJson: plainTextDocument(description),
    dueAt,
    dueDatePolicyKey: policyKey,
    dueDateSource: "policy",
    ...deadlineSchedule,
    originatingPostId: input.postId,
    organizationId: input.authorization.organizationId,
    policyDueAt: dueAt,
    policyObligationKey,
    primaryReferenceId: primaryReference?.entityId,
    primaryReferenceKind: primaryReference?.entityKind,
    priority: "high",
    queueSortAt: buildActionItemQueueSortAt(dueAt, "todo"),
    requiresAcceptance: true,
    status: "todo",
    title,
    updatedAt: input.now,
    workKind: input.remediation.workKind,
  });
  await linkBuildActionItemToPost(ctx, {
    actionItemId,
    brokerageId: input.authorization.brokerage._id,
    buildId: input.authorization.build._id,
    createdAt: input.now,
    linkKind: "originating",
    organizationId: input.authorization.organizationId,
    postId: input.postId,
  });
  await ctx.db.insert("buildActionItemEvents", {
    actionItemId,
    actorRole: "admin",
    actorWorkosUserId: "system",
    brokerageId: input.authorization.brokerage._id,
    buildId: input.authorization.build._id,
    createdAt: input.now,
    eventType: "created_by_policy",
    exercisedAuthority: policyKey,
    newState: JSON.stringify({
      policyKey,
      policyObligationKey,
      priority: "high",
      requiresAcceptance: true,
      status: "todo",
      workKind: input.remediation.workKind,
    }),
    organizationId: input.authorization.organizationId,
    revision: 1,
    warnings: ["deterministic_policy_obligation"],
  });
  const item = await ctx.db.get(actionItemId);
  if (!item) {
    throw new Error("The remediation Action Item became unavailable.");
  }
  await recordBuildActionItemRevision(ctx, {
    authorization: input.authorization,
    item,
    now: input.now,
    reason: policyKey,
  });
  for (const reference of input.references) {
    await ctx.db.insert("buildCollaborationReferences", {
      actionItemQueueSortAt: item.queueSortAt,
      brokerageId: input.authorization.brokerage._id,
      buildId: input.authorization.build._id,
      createdAt: input.now,
      entityId: reference.entityId,
      entityKind: reference.entityKind,
      labelSnapshot: reference.label,
      organizationId: input.authorization.organizationId,
      ownerKind: "actionItem",
      ownerRecordId: actionItemId,
      postId: input.postId,
      primary: Boolean(reference.primary),
      summarySnapshot: reference.summary,
    });
    await ctx.db.insert("buildCollaborationActivityProjections", {
      actionItemId,
      actorWorkosUserId: "system",
      brokerageId: input.authorization.brokerage._id,
      buildId: input.authorization.build._id,
      createdAt: input.now,
      eventType: "created_by_policy",
      organizationId: input.authorization.organizationId,
      postId: input.postId,
      projectionKey: `system-policy:${policyKey}:${input.idempotencyKey}:${reference.entityKind}:${reference.entityId}`,
      targetId: reference.entityId,
      targetKind: reference.entityKind,
    });
  }
  await Promise.all([
    ctx.db.insert("buildActionItemCreationRequests", {
      actionItemId,
      brokerageId: input.authorization.brokerage._id,
      buildId: input.authorization.build._id,
      createdAt: input.now,
      creatorWorkosUserId: "system",
      organizationId: input.authorization.organizationId,
      postId: input.postId,
      requestId,
    }),
    ctx.db.insert("auditEvents", {
      actorRoles: ["system"],
      actorWorkosUserId: "system",
      brokerageId: input.authorization.brokerage._id,
      command: "createPolicyBuildActionItem",
      createdAt: input.now,
      entityId: actionItemId,
      entityType: "buildActionItem",
      eventType: "build.collaboration.action_item.policy_created",
      newState: JSON.stringify({
        actionItemId,
        policyKey,
        postId: input.postId,
      }),
      organizationId: input.authorization.organizationId,
      warnings: [],
    }),
    ctx.db.insert("eventOutbox", {
      brokerageId: input.authorization.brokerage._id,
      createdAt: input.now,
      eventType: "build.collaboration.action_item.policy_created",
      organizationId: input.authorization.organizationId,
      payloadPreview: JSON.stringify({ actionItemId, policyKey }),
      relatedEntityId: actionItemId,
      relatedEntityType: "buildActionItem",
      status: "pending",
    }),
    syncLinkedActionItemPostCounts(ctx, {
      actionItemId,
      actorWorkosUserId: "system",
      now: input.now,
    }),
  ]);
  return actionItemId;
}

export function plainTextDocument(value: string) {
  return JSON.stringify({
    content: [
      {
        content: [{ text: value, type: "text" }],
        type: "paragraph",
      },
    ],
    type: "doc",
  });
}

export function requiredBoundedText(
  value: string,
  label: string,
  maxLength: number
) {
  const normalized = value.trim();
  if (!normalized) {
    throw new Error(`${label} is required.`);
  }
  if (normalized.length > maxLength) {
    throw new Error(`${label} must be ${maxLength} characters or fewer.`);
  }
  return normalized;
}
