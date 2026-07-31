import { v } from "convex/values";

import {
  type ActiveBuildAuthorization,
  type ActiveBuildParticipantProjection,
  projectActiveBuildParticipants,
} from "./activeBuildAccess";
import {
  buildActionItemQueueSortAt,
  resetBuildActionItemDeadlineSchedule,
} from "./build_action_item_deadline_model";
import { recordBuildActionItemRevision } from "./build_action_item_history";
import { stableContentHash } from "./build_collaboration";
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
import { BUILD_COLLABORATION_UNAVAILABLE_ERROR } from "./build_collaboration_rollout";
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
  policyKey: v.string(),
  title: v.string(),
  workKind: v.union(v.literal("evidence"), v.literal("site_visit_remediation")),
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
    policyKey: string;
    title: string;
    workKind: "evidence" | "site_visit_remediation";
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
  const submittedReferences = normalizeSystemReferences(input);
  const primaryReferenceKind = submittedReferences.find(
    (reference) => reference.primary
  )?.entityKind;
  const readerParticipants = systemEventReaders(
    participants,
    primaryReferenceKind
  );
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
    primaryReferenceId: references[0]?.entityId,
    primaryReferenceKind: references[0]?.entityKind,
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
  const primaryReference = references[0];
  const primaryReferenceId = referenceRows[0];
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
      referenceId: primaryReferenceId,
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
  if (!tenantSetting || tenantSetting.status !== "active") {
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

function systemEventReaders(
  participants: ActiveBuildParticipantProjection[],
  primaryReferenceKind?: BuildCollaborationSystemEventInput["primaryReferenceKind"]
) {
  if (
    primaryReferenceKind === "evidenceAsset" ||
    primaryReferenceKind === "evidencePackage"
  ) {
    return participants.filter(
      (participant) =>
        participant.role !== "contractor" && participant.role !== "homeowner"
    );
  }
  return participants;
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
  const primaryReference =
    input.references.find((reference) => reference.primary) ??
    input.references[0];
  const deadlineSchedule = resetBuildActionItemDeadlineSchedule(
    undefined,
    "todo"
  );
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
    ...deadlineSchedule,
    originatingPostId: input.postId,
    organizationId: input.authorization.organizationId,
    primaryReferenceId: primaryReference?.entityId,
    primaryReferenceKind: primaryReference?.entityKind,
    priority: "high",
    queueSortAt: buildActionItemQueueSortAt(undefined, "todo"),
    requiresAcceptance: false,
    status: "todo",
    title,
    updatedAt: input.now,
    workKind: input.remediation.workKind,
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
      priority: "high",
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
    ctx.db.patch(input.postId, {
      latestActivityActorWorkosUserId: "system",
      openActionItemCount: 1,
      updatedAt: input.now,
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
