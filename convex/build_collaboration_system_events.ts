import { v } from "convex/values";

import {
  type ActiveBuildAuthorization,
  type ActiveBuildParticipantProjection,
  projectActiveBuildParticipants,
} from "./activeBuildAccess";
import { normalizeRoleSlugs } from "./authz";
import {
  BUILD_ACTION_ITEM_DEADLINE_DAY_MS,
  buildActionItemQueueSortAt,
  resetBuildActionItemDeadlineSchedule,
} from "./build_action_item_deadline_model";
import { recordBuildActionItemRevision } from "./build_action_item_history";
import {
  linkBuildActionItemToPost,
  syncLinkedActionItemPostCounts,
} from "./build_action_item_post_links";
import { stableContentHash } from "./build_collaboration_hash";
import { requireBuildCollaborationWritable } from "./build_collaboration_lifecycle_state";
import { buildCollaborationDeepLink } from "./build_collaboration_links";
import { collaborationRoleTier } from "./build_collaboration_model";
import {
  type BuildCollaborationNotificationKind,
  emitCanonicalBuildCollaborationNotification,
} from "./build_collaboration_notifications";
import {
  type CanonicalBuildCollaborationReference,
  resolveCanonicalBuildCollaborationReferences,
} from "./build_collaboration_references";
import {
  BUILD_COLLABORATION_UNAVAILABLE_ERROR,
  isBuildCollaborationCutoverFrozen,
} from "./build_collaboration_rollout";
import { queueBuildCollaborationSearchBuildRebuild } from "./build_collaboration_search_maintenance";
import { canReadDrawSystemEvent } from "./build_collaboration_system_event_access";
import {
  buildCollaborationNotificationKindValidator,
  buildCollaborationPostTypeValidator,
  buildCollaborationReferenceKindValidator,
} from "./build_collaboration_validators";
import { internalMutation } from "./fluent";
import type { Id, MutationCtx } from "./types";

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

export interface BuildCollaborationSystemEventInput {
  buildId: Id<"activeBuilds">;
  idempotencyKey: string;
  notificationKind?: BuildCollaborationNotificationKind;
  notificationTitle?: string;
  organizationId: string;
  plainText: string;
  postType: "update" | "question" | "decision" | "issue" | "announcement";
  primaryReferenceId?: string;
  primaryReferenceKind?:
    | "milestone"
    | "submilestone"
    | "draw"
    | "evidencePackage"
    | "evidenceAsset"
    | "siteVisit"
    | "document"
    | "material"
    | "participant"
    | "actionItem";
  references?: Array<{
    entityId: string;
    entityKind: BuildCollaborationSystemEventInput["primaryReferenceKind"];
    primary?: boolean;
  }>;
  remediation?: {
    description: string;
    obligationKey?: string;
    policyKey: string;
    title: string;
    workKind: "evidence" | "site_visit_remediation" | "draw_blocker";
  };
  systemLabel: string;
}

export const publishBuildCollaborationSystemEvent = internalMutation
  .input({
    buildId: v.id("activeBuilds"),
    idempotencyKey: v.string(),
    notificationKind: v.optional(buildCollaborationNotificationKindValidator),
    notificationTitle: v.optional(v.string()),
    organizationId: v.string(),
    plainText: v.string(),
    postType: buildCollaborationPostTypeValidator,
    primaryReferenceId: v.optional(v.string()),
    primaryReferenceKind: v.optional(buildCollaborationReferenceKindValidator),
    references: v.optional(v.array(systemReferenceValidator)),
    remediation: v.optional(remediationValidator),
    systemLabel: v.string(),
  })
  .returns(v.id("buildCollaborationPosts"))
  .handler(async (ctx, args) => {
    const postId = await publishCanonicalBuildCollaborationSystemEvent(
      ctx,
      args
    );
    if (!postId) {
      throw new Error(BUILD_COLLABORATION_UNAVAILABLE_ERROR);
    }
    return postId;
  })
  .internal();

export async function publishCanonicalBuildCollaborationSystemEvent(
  ctx: MutationCtx,
  input: BuildCollaborationSystemEventInput
): Promise<Id<"buildCollaborationPosts"> | null> {
  const idempotencyKey = requiredBoundedText(
    input.idempotencyKey,
    "System event idempotency key",
    500
  );
  const scope = await resolveSystemEventScope(ctx, input, idempotencyKey);
  if (scope.status === "existing") {
    return scope.postId;
  }
  if (scope.status === "inactive") {
    return null;
  }
  const { authorization, build, participants } = scope;
  await requireBuildCollaborationWritable(ctx, authorization);
  const submittedReferences = normalizeSystemReferences(input);
  const primaryReferenceKind = submittedReferences.find(
    (reference) => reference.primary
  )?.entityKind;
  const primaryReferenceId = submittedReferences.find(
    (reference) => reference.primary
  )?.entityId;
  const readerParticipants = await systemEventReaders(ctx, {
    buildId: build._id,
    participants,
    primaryReferenceId,
    primaryReferenceKind,
  });
  if (readerParticipants.length === 0) {
    throw new Error("A system event requires at least one authorized reader.");
  }
  const readerIds = readerParticipants.map(
    (participant) => participant.workosUserId
  );
  const references = await resolveCanonicalBuildCollaborationReferences(ctx, {
    authorization,
    readerIds,
    references: submittedReferences,
  });
  const plainText = requiredBoundedText(
    input.plainText,
    "System event content",
    20_000
  );
  const systemLabel = requiredBoundedText(
    input.systemLabel || "DrawFlow",
    "System label",
    120
  );
  const now = Date.now();
  const tiptapJson = plainTextDocument(plainText);
  const audience = systemEventAudience(participants, readerParticipants);
  const postId = await ctx.db.insert("buildCollaborationPosts", {
    acknowledgementRequired: false,
    agentDrafted: false,
    announcementProminent: input.postType === "announcement",
    audienceFloorTier: audience.floorTier,
    audienceMode: audience.mode,
    authorDisplayNameSnapshot: systemLabel,
    authorRolesSnapshot: ["system"],
    brokerageId: build.brokerageId,
    buildId: build._id,
    commentCount: 0,
    contentState: "active",
    createdAt: now,
    lastMeaningfulActivityAt: now,
    openActionItemCount: 0,
    organizationId: input.organizationId,
    postType: input.postType,
    primaryReferenceId: references.find((reference) => reference.primary)
      ?.entityId,
    primaryReferenceKind: references.find((reference) => reference.primary)
      ?.entityKind,
    readRevision: 1,
    revision: 1,
    source: "system",
    systemEventKey: idempotencyKey,
    threadState: "open",
    threadRevision: 0,
    updatedAt: now,
  });
  const revisionId = await ctx.db.insert("buildCollaborationPostRevisions", {
    authorRole: "admin",
    authorWorkosUserId: "system",
    brokerageId: build.brokerageId,
    buildId: build._id,
    contentHash: stableContentHash(tiptapJson),
    createdAt: now,
    organizationId: input.organizationId,
    plainText,
    postId,
    revision: 1,
    tiptapJson,
  });
  await ctx.db.patch(postId, { currentRevisionId: revisionId });
  for (const workosUserId of audience.explicitReaderIds) {
    const participant = readerParticipants.find(
      (candidate) => candidate.workosUserId === workosUserId
    );
    if (!participant) {
      throw new Error("A system audience member is outside the reader set.");
    }
    await ctx.db.insert("buildCollaborationAudienceMembers", {
      brokerageId: build.brokerageId,
      buildId: build._id,
      addedByWorkosUserId: "system",
      createdAt: now,
      organizationId: build.organizationId,
      postId,
      workosUserId,
    });
  }
  const referenceRows = await persistSystemReferences(ctx, {
    authorization,
    now,
    ownerRecordId: revisionId,
    postId,
    references,
  });
  const actionItemId = input.remediation
    ? await createDeterministicRemediationActionItem(ctx, {
        authorization,
        idempotencyKey,
        now,
        postId,
        references,
        remediation: input.remediation,
      })
    : null;

  const notificationKind =
    input.notificationKind ??
    (input.remediation ? "blocker" : "ordinary_activity");
  const primaryReferenceIndex = Math.max(
    0,
    references.findIndex((reference) => reference.primary)
  );
  const primaryReference = references[primaryReferenceIndex];
  const primaryReferenceRowId = referenceRows[primaryReferenceIndex];
  for (const recipient of readerParticipants) {
    await emitCanonicalBuildCollaborationNotification(ctx, {
      actionItemId: actionItemId ?? undefined,
      actionLabel: primaryReference ? "Open related work" : "Open discussion",
      authorization,
      body: plainText,
      dedupeKey: `build-system-event:${idempotencyKey}:${notificationKind}:${recipient.workosUserId}`,
      entityId: primaryReference?.entityId ?? postId,
      entityLabel: primaryReference?.label,
      entityType: primaryReference?.entityKind ?? "buildCollaborationPost",
      href: buildCollaborationDeepLink({
        buildId: build._id,
        focus: primaryReference
          ? `${primaryReference.entityKind}:${primaryReference.entityId}`
          : `post:${postId}`,
        recipientRole: recipient.role,
      }),
      kind: notificationKind,
      now,
      postId,
      readerIds,
      recipientWorkosUserId: recipient.workosUserId,
      referenceId: primaryReferenceRowId,
      sourceLabel: systemLabel,
      title: input.notificationTitle?.trim() || plainText.slice(0, 120),
    });
  }
  await Promise.all([
    ctx.db.insert("auditEvents", {
      actorRoles: ["system"],
      actorWorkosUserId: "system",
      brokerageId: build.brokerageId,
      command: "publishBuildCollaborationSystemEvent",
      createdAt: now,
      entityId: postId,
      entityType: "buildCollaborationPost",
      eventType: "build.collaboration.system_event.published",
      newState: JSON.stringify({
        actionItemId,
        idempotencyKey,
        postId,
        readerIds,
        referenceCount: references.length,
      }),
      organizationId: input.organizationId,
      warnings: [],
    }),
    ctx.db.insert("eventOutbox", {
      brokerageId: build.brokerageId,
      createdAt: now,
      eventType: "build.collaboration.system_event.published",
      organizationId: input.organizationId,
      payloadPreview: JSON.stringify({
        actionItemId,
        idempotencyKey,
        postType: input.postType,
        referenceCount: references.length,
      }),
      relatedEntityId: postId,
      relatedEntityType: "buildCollaborationPost",
      status: "pending",
    }),
  ]);
  await queueBuildCollaborationSearchBuildRebuild(ctx, { authorization });
  return postId;
}

type SystemEventScope =
  | { postId: Id<"buildCollaborationPosts">; status: "existing" }
  | { status: "inactive" }
  | {
      authorization: ActiveBuildAuthorization;
      build: ActiveBuildAuthorization["build"];
      participants: ActiveBuildParticipantProjection[];
      status: "ready";
    };

async function resolveSystemEventScope(
  ctx: MutationCtx,
  input: BuildCollaborationSystemEventInput,
  idempotencyKey: string
): Promise<SystemEventScope> {
  const existing = await ctx.db
    .query("buildCollaborationPosts")
    .withIndex("by_buildId_and_systemEventKey", (query) =>
      query.eq("buildId", input.buildId).eq("systemEventKey", idempotencyKey)
    )
    .first();
  if (existing) {
    if (existing.organizationId !== input.organizationId) {
      throw new Error("Forbidden: collaboration tenant scope");
    }
    return { postId: existing._id, status: "existing" };
  }
  const build = await ctx.db.get(input.buildId);
  if (!build || build.organizationId !== input.organizationId) {
    throw new Error("Build not found.");
  }
  const tenantSetting = await ctx.db
    .query("buildCollaborationTenantSettings")
    .withIndex("by_organizationId", (query) =>
      query.eq("organizationId", build.organizationId)
    )
    .unique();
  if (
    !tenantSetting ||
    tenantSetting.status !== "active" ||
    (await isBuildCollaborationCutoverFrozen(ctx, build.organizationId))
  ) {
    return { status: "inactive" };
  }
  if (tenantSetting.brokerageId !== build.brokerageId) {
    throw new Error("Forbidden: collaboration tenant scope");
  }
  const brokerage = await ctx.db.get(build.brokerageId);
  const proposal = await ctx.db.get(build.proposalId);
  if (!(brokerage && proposal)) {
    throw new Error("Build scope is unavailable.");
  }
  const participantRows = await ctx.db
    .query("buildParticipants")
    .withIndex("by_buildId_and_status", (query) =>
      query.eq("buildId", build._id).eq("status", "active")
    )
    .take(500);
  const participants = await projectActiveBuildParticipants(ctx, {
    build,
    grantedParticipants: participantRows,
    proposal,
  });
  const authorityParticipants = await projectOrganizationAuthorityParticipants(
    ctx,
    build.organizationId
  );
  for (const authority of authorityParticipants) {
    const existingParticipant = participants.find(
      (participant) => participant.workosUserId === authority.workosUserId
    );
    if (!existingParticipant) {
      participants.push(authority);
      continue;
    }
    if (
      collaborationRoleTier(authority.role) >
      collaborationRoleTier(existingParticipant.role)
    ) {
      existingParticipant.role = authority.role;
      existingParticipant.displayName = authority.displayName;
      existingParticipant.source = "derived";
    }
  }
  return {
    authorization: systemAuthorization({
      brokerage,
      build,
      participants,
      proposal,
    }),
    build,
    participants,
    status: "ready",
  };
}

function normalizeSystemReferences(input: BuildCollaborationSystemEventInput) {
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

async function systemEventReaders(
  ctx: MutationCtx,
  input: {
    buildId: Id<"activeBuilds">;
    participants: ActiveBuildParticipantProjection[];
    primaryReferenceId?: string;
    primaryReferenceKind?: BuildCollaborationSystemEventInput["primaryReferenceKind"];
  }
) {
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

async function projectOrganizationAuthorityParticipants(
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

function systemEventAudience(
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

function systemAuthorization(input: {
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

async function persistSystemReferences(
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

async function createDeterministicRemediationActionItem(
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

function plainTextDocument(value: string) {
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

function requiredBoundedText(value: string, label: string, maxLength: number) {
  const normalized = value.trim();
  if (!normalized) {
    throw new Error(`${label} is required.`);
  }
  if (normalized.length > maxLength) {
    throw new Error(`${label} must be ${maxLength} characters or fewer.`);
  }
  return normalized;
}
