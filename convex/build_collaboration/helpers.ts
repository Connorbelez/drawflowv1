import type { ActiveBuildAuthorization } from "../activeBuildAccess";
import {
  buildActionItemQueueSortAt,
  resetBuildActionItemDeadlineSchedule,
} from "../build_action_item_deadline_model";
import { isCleanCollaborationAsset } from "../build_collaboration_asset_access";
import { persistGovernedCollaborationAssetAttachments } from "../build_collaboration_asset_publication";
import { isCanonicalCollaborationSystemPost } from "../build_collaboration_system_event_access";
import {
  canCreateCustomCollaborationAudience,
  collaborationRoleTier,
  resolveCollaborationAudience,
} from "../build_collaboration_model";
import {
  type ActionItemInput,
  canonicalizeTiptapContent,
  type ReferenceInput,
} from "../build_collaboration_publication_bundle";
import { buildCollaborationValidationError } from "../build_collaboration_validation";
import type { Doc, Id, MutationCtx } from "../types";

const MAX_PLAIN_TEXT_LENGTH = 50_000;
const MAX_RICH_TEXT_LENGTH = 250_000;

export function shouldSkipBuildCollaborationFeedPost(
  post: Doc<"buildCollaborationPosts">,
  filter: "all" | "active_operations" | undefined,
) {
  // Legacy operational automation (Evidence, Site Visit, Document, and
  // transition-event posts) has no canonical occurrence identity. Keep those
  // retired rows out of every feed while preserving ordinary human posts and
  // the one deterministic Milestone/Draw System Post per occurrence.
  const isRetiredAutomatedPost =
    post.source === "system" &&
    !isCanonicalCollaborationSystemPost(post);
  // Approved-plan companions are identity records, not activity. They become
  // feed-visible only when the canonical Milestone activates.
  return (
    isRetiredAutomatedPost ||
    post.systemLifecycle === "latent" ||
    (filter === "active_operations" &&
      !isActiveBuildCollaborationOperation(post))
  );
}

export function isActiveBuildCollaborationOperation(
  post: Doc<"buildCollaborationPosts">,
) {
  if (post.contentState !== "active") return false;
  if (post.systemPostKind) {
    return post.systemLifecycle !== "resolved" && post.threadState !== "resolved";
  }
  return post.threadState !== "resolved" || post.openActionItemCount > 0;
}

export function validateRichTextContent(input: {
  plainText: string;
  tiptapJson: string;
}) {
  const content = canonicalizeTiptapContent(input.tiptapJson);
  const plainText = content.plainText;
  if (plainText.length > MAX_PLAIN_TEXT_LENGTH) {
    throw buildCollaborationValidationError(
      `Post text may not exceed ${MAX_PLAIN_TEXT_LENGTH} characters.`
    );
  }
  if (input.tiptapJson.length > MAX_RICH_TEXT_LENGTH) {
    throw buildCollaborationValidationError(
      `Post rich text may not exceed ${MAX_RICH_TEXT_LENGTH} characters.`
    );
  }
  return content;
}

export function resolveEffectiveActionItems(input: {
  actionItems: ActionItemInput[];
  authorization: ActiveBuildAuthorization;
}) {
  return input.actionItems.map((actionItem) => {
    if (!actionItem.title) {
      throw buildCollaborationValidationError(
        "Every Action Item requires a title."
      );
    }
    const assigneeParticipant = actionItem.assigneeWorkosUserId
      ? input.authorization.participants.find(
          (participant) =>
            participant.workosUserId === actionItem.assigneeWorkosUserId
        )
      : undefined;
    if (actionItem.assigneeWorkosUserId && !assigneeParticipant) {
      throw buildCollaborationValidationError(
        "Action Item assignees must participate in this Build."
      );
    }
    const upwardAssignment =
      assigneeParticipant !== undefined &&
      collaborationRoleTier(assigneeParticipant.role) >
        input.authorization.effectiveRole.tier;
    const requiresAcceptance =
      actionItem.requiresAcceptance ?? upwardAssignment;
    return {
      ...actionItem,
      effectiveAssignmentState: actionItem.assigneeWorkosUserId
        ? requiresAcceptance
          ? ("requested" as const)
          : ("assigned" as const)
        : ("unassigned" as const),
      requiresAcceptance,
    };
  });
}

export async function validatePublicationAssets(
  ctx: MutationCtx,
  input: {
    assetIds: Id<"buildCollaborationAssets">[];
    authorization: ActiveBuildAuthorization;
    readerIds: string[];
  }
) {
  if (new Set(input.assetIds).size > 25) {
    throw buildCollaborationValidationError(
      "A publication may contain at most 25 attachments."
    );
  }
  for (const assetId of new Set(input.assetIds)) {
    const asset = await ctx.db.get(assetId);
    if (
      !asset ||
      asset.buildId !== input.authorization.build._id ||
      asset.organizationId !== input.authorization.organizationId ||
      asset.brokerageId !== input.authorization.brokerage._id ||
      asset.state !== "available" ||
      !isCleanCollaborationAsset(asset)
    ) {
      throw buildCollaborationValidationError(
        "A proposed collaboration asset is unavailable."
      );
    }
    if (asset.readerWorkosUserIds) {
      const allowedReaders = new Set(asset.readerWorkosUserIds);
      if (!input.readerIds.every((readerId) => allowedReaders.has(readerId))) {
        throw buildCollaborationValidationError(
          "A proposed collaboration asset cannot be shared with this audience."
        );
      }
    }
    if (!asset.originatingPostId) {
      const session = asset.stagingSessionId
        ? await ctx.db.get(asset.stagingSessionId)
        : null;
      if (
        !session ||
        session.state !== "finalized" ||
        session.organizationId !== input.authorization.organizationId ||
        session.buildId !== input.authorization.build._id ||
        !(await canPublishStagedAssetSession(ctx, input.authorization, session))
      ) {
        throw buildCollaborationValidationError(
          "A proposed collaboration asset is orphaned."
        );
      }
    }
  }
}

async function canPublishStagedAssetSession(
  ctx: MutationCtx,
  authorization: ActiveBuildAuthorization,
  session: Doc<"buildCollaborationAssetStagingSessions">
) {
  if (session.ownerWorkosUserId === authorization.viewer.subject) {
    return true;
  }
  if (session.contextKind !== "draft" || !session.contextRecordId) {
    return false;
  }
  const draftId = ctx.db.normalizeId(
    "buildCollaborationDrafts",
    session.contextRecordId
  );
  const draft = draftId ? await ctx.db.get(draftId) : null;
  return Boolean(
    draft &&
      draft.buildId === authorization.build._id &&
      draft.organizationId === authorization.organizationId &&
      (draft.approvalOwnerWorkosUserId ?? draft.ownerWorkosUserId) ===
        authorization.viewer.subject &&
      (draft.state === "active" || draft.state === "scheduled")
  );
}

export async function persistAttachments(
  ctx: MutationCtx,
  input: {
    assetIds: Id<"buildCollaborationAssets">[];
    audienceMode: "build_wide" | "author_tier_and_higher" | "custom";
    authorization: ActiveBuildAuthorization;
    now: number;
    postId: Id<"buildCollaborationPosts">;
    postRevisionId: Id<"buildCollaborationPostRevisions">;
    readerWorkosUserIds: string[];
  }
) {
  const post = await ctx.db.get(input.postId);
  if (!post) {
    throw buildCollaborationValidationError(
      "The collaboration post is unavailable."
    );
  }
  await persistGovernedCollaborationAssetAttachments(ctx, {
    assetIds: input.assetIds,
    authorization: input.authorization,
    command: "persistBuildCollaborationAttachment",
    maxAttachments: 25,
    now: input.now,
    ownerKind: "postRevision",
    ownerRecordId: input.postRevisionId,
    post,
    readerWorkosUserIds: input.readerWorkosUserIds,
    unavailableMessage: "A proposed collaboration asset is unavailable.",
  });
}

export function resolvePublicationAudience(input: {
  audienceMode: "author_tier_and_higher" | "build_wide" | "custom";
  authorization: ActiveBuildAuthorization;
  excludedReaderIds: string[];
  requestedReaderIds: string[];
}) {
  const participants = input.authorization.participants.map((participant) => ({
    id: participant.workosUserId,
    roles: [participant.role],
  }));
  if (
    !participants.some(
      (participant) => participant.id === input.authorization.viewer.subject
    )
  ) {
    participants.push({
      id: input.authorization.viewer.subject,
      roles: [input.authorization.effectiveRole.role],
    });
  }
  let resolved:
    | {
        excludedParticipantIds: string[];
        mandatoryReaderIds: string[];
        readerIds: string[];
        status: "allowed";
      }
    | ReturnType<typeof resolveCollaborationAudience>;
  if (input.audienceMode === "build_wide") {
    const readerIds = participants.map((participant) => participant.id).sort();
    resolved = {
      excludedParticipantIds: [],
      mandatoryReaderIds: participants
        .filter(
          (participant) =>
            collaborationRoleTier(participant.roles[0]) >=
            input.authorization.effectiveRole.tier
        )
        .map((participant) => participant.id)
        .sort(),
      readerIds,
      status: "allowed",
    };
  } else if (input.audienceMode === "author_tier_and_higher") {
    const readerIds = participants
      .filter(
        (participant) =>
          collaborationRoleTier(participant.roles[0]) >=
          input.authorization.effectiveRole.tier
      )
      .map((participant) => participant.id)
      .sort();
    resolved = {
      excludedParticipantIds: participants
        .map((participant) => participant.id)
        .filter((id) => !readerIds.includes(id)),
      mandatoryReaderIds: readerIds,
      readerIds,
      status: "allowed" as const,
    };
  } else {
    if (!canCreateCustomCollaborationAudience(input.authorization.roles)) {
      throw buildCollaborationValidationError(
        "Custom audiences are unavailable for this Build role. Higher-tier participants must remain able to read the post."
      );
    }
    const participantIds = new Set(
      participants.map((participant) => participant.id)
    );
    if (
      input.requestedReaderIds.some(
        (requestedReaderId) => !participantIds.has(requestedReaderId)
      )
    ) {
      throw buildCollaborationValidationError(
        "Custom audience readers must be active Build participants."
      );
    }
    resolved = resolveCollaborationAudience({
      authorId: input.authorization.viewer.subject,
      authorRoles: input.authorization.roles,
      participants,
      requestedReaderIds: input.requestedReaderIds,
    });
  }
  if (resolved.status === "blocked") {
    throw buildCollaborationValidationError(
      "The selected audience conflicts with the referenced entity permissions."
    );
  }
  const participantIds = new Set(
    participants.map((participant) => participant.id)
  );
  const excludedReaderIds = [
    ...new Set(input.excludedReaderIds.map((readerId) => readerId.trim())),
  ].filter(Boolean);
  if (excludedReaderIds.some((readerId) => !participantIds.has(readerId))) {
    throw buildCollaborationValidationError(
      "Excluded readers must be active Build participants."
    );
  }
  if (
    excludedReaderIds.some((readerId) =>
      resolved.mandatoryReaderIds.includes(readerId)
    )
  ) {
    throw buildCollaborationValidationError(
      "Higher-tier and same-tier participants cannot be excluded from a publication."
    );
  }
  return {
    ...resolved,
    excludedParticipantIds: [
      ...new Set([...resolved.excludedParticipantIds, ...excludedReaderIds]),
    ].sort(),
    readerIds: resolved.readerIds
      .filter((readerId) => !excludedReaderIds.includes(readerId))
      .sort(),
  };
}

export async function persistAudience(
  ctx: MutationCtx,
  input: {
    audience: {
      excludedParticipantIds: string[];
      mandatoryReaderIds: string[];
      readerIds: string[];
    };
    authorization: ActiveBuildAuthorization;
    now: number;
    postId: Id<"buildCollaborationPosts">;
    postRevisionId: Id<"buildCollaborationPostRevisions">;
  }
) {
  const common = {
    brokerageId: input.authorization.brokerage._id,
    buildId: input.authorization.build._id,
    organizationId: input.authorization.organizationId,
    postId: input.postId,
  };
  for (const workosUserId of input.audience.readerIds) {
    await ctx.db.insert("buildCollaborationAudienceMembers", {
      ...common,
      addedByWorkosUserId: input.authorization.viewer.subject,
      createdAt: input.now,
      workosUserId,
    });
    await ctx.db.insert("buildCollaborationAudienceSnapshots", {
      ...common,
      createdAt: input.now,
      postRevisionId: input.postRevisionId,
      reason: input.audience.mandatoryReaderIds.includes(workosUserId)
        ? "role hierarchy"
        : "explicit audience",
      resolution: input.audience.mandatoryReaderIds.includes(workosUserId)
        ? "mandatory"
        : "reader",
      workosUserId,
    });
  }
  for (const workosUserId of input.audience.excludedParticipantIds) {
    await ctx.db.insert("buildCollaborationAudienceSnapshots", {
      ...common,
      createdAt: input.now,
      postRevisionId: input.postRevisionId,
      reason: "excluded by author within role hierarchy",
      resolution: "excluded",
      workosUserId,
    });
  }
}

export async function persistReferences(
  ctx: MutationCtx,
  input: {
    authorization: ActiveBuildAuthorization;
    now: number;
    ownerRecordId: Id<"buildCollaborationPostRevisions">;
    postId: Id<"buildCollaborationPosts">;
    references: ReferenceInput[];
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
      ownerKind: "postRevision",
      ownerRecordId: input.ownerRecordId,
      postId: input.postId,
      primary: reference.primary ?? false,
      summarySnapshot: reference.summary,
    });
  }
}

export async function createActionItems(
  ctx: MutationCtx,
  input: {
    actionItems: ActionItemInput[];
    authorization: ActiveBuildAuthorization;
    now: number;
    postId: Id<"buildCollaborationPosts">;
  }
) {
  for (const actionItem of input.actionItems) {
    const { assignee, assignmentState, requiresAcceptance } =
      resolveApprovedActionItemAssignment(actionItem, input.authorization);
    const descriptionPlainText = actionItem.descriptionPlainText ?? "";
    const descriptionTiptapJson =
      actionItem.descriptionTiptapJson ??
      JSON.stringify({ content: [], type: "doc" });
    validateOptionalTiptapJson(descriptionTiptapJson);
    const primaryReference = actionItem.references?.find(
      (reference) => reference.primary
    );
    const deadlineSchedule = resetBuildActionItemDeadlineSchedule(
      actionItem.dueAt,
      "todo"
    );
    const actionItemId = await ctx.db.insert("buildActionItems", {
      assigneeWorkosUserId: assignee,
      assignedByWorkosUserId: assignee
        ? input.authorization.viewer.subject
        : undefined,
      assignmentRequestedAt:
        assignmentState === "requested" ? input.now : undefined,
      assignmentState,
      brokerageId: input.authorization.brokerage._id,
      buildId: input.authorization.build._id,
      createdAt: input.now,
      creatorWorkosUserId: input.authorization.viewer.subject,
      creatorRole: input.authorization.effectiveRole.role,
      currentRevision: 1,
      descriptionPlainText,
      descriptionTiptapJson,
      dueAt: actionItem.dueAt,
      dueDateSource: actionItem.dueAt === undefined ? undefined : "manual",
      ...deadlineSchedule,
      originatingPostId: input.postId,
      organizationId: input.authorization.organizationId,
      priority: actionItem.priority ?? "none",
      primaryReferenceId: primaryReference?.entityId,
      primaryReferenceKind: primaryReference?.entityKind,
      queueSortAt: buildActionItemQueueSortAt(actionItem.dueAt, "todo"),
      requiresAcceptance,
      status: "todo",
      title: actionItem.title,
      updatedAt: input.now,
    });
    await ctx.db.insert("buildActionItemEvents", {
      actionItemId,
      actorRole: input.authorization.effectiveRole.role,
      actorWorkosUserId: input.authorization.viewer.subject,
      brokerageId: input.authorization.brokerage._id,
      buildId: input.authorization.build._id,
      createdAt: input.now,
      eventType: "created",
      exercisedAuthority: "creator",
      newState: JSON.stringify({
        assigneeWorkosUserId: assignee,
        assignmentState,
        priority: actionItem.priority ?? "none",
        status: "todo",
      }),
      organizationId: input.authorization.organizationId,
      revision: 1,
      warnings:
        assignmentState === "requested" ? ["assignment_requested"] : undefined,
    });
    await persistActionItemReferences(ctx, {
      actionItemId,
      authorization: input.authorization,
      now: input.now,
      postId: input.postId,
      queueSortAt: buildActionItemQueueSortAt(actionItem.dueAt, "todo"),
      references: actionItem.references ?? [],
    });
  }
}

function resolveApprovedActionItemAssignment(
  actionItem: ActionItemInput,
  authorization: ActiveBuildAuthorization
) {
  const assignee = actionItem.assigneeWorkosUserId;
  const assigneeParticipant = assignee
    ? authorization.participants.find(
        (participant) => participant.workosUserId === assignee
      )
    : undefined;
  const upwardAssignment =
    assigneeParticipant !== undefined &&
    collaborationRoleTier(assigneeParticipant.role) >
      authorization.effectiveRole.tier;
  const requiresAcceptance = actionItem.requiresAcceptance ?? false;
  const expectedAssignmentState = assignee
    ? requiresAcceptance
      ? ("requested" as const)
      : ("assigned" as const)
    : ("unassigned" as const);
  if (
    actionItem.effectiveAssignmentState !== expectedAssignmentState ||
    requiresAcceptance !== (actionItem.requiresAcceptance ?? upwardAssignment)
  ) {
    throw buildCollaborationValidationError(
      "The approved Action Item assignment state is no longer effective."
    );
  }
  return {
    assignee,
    assignmentState: actionItem.effectiveAssignmentState,
    requiresAcceptance,
  };
}

async function persistActionItemReferences(
  ctx: MutationCtx,
  input: {
    actionItemId: Id<"buildActionItems">;
    authorization: ActiveBuildAuthorization;
    now: number;
    postId: Id<"buildCollaborationPosts">;
    queueSortAt: number;
    references: ReferenceInput[];
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

export async function recordPublicationAudit(
  ctx: MutationCtx,
  input: {
    actionItemCount: number;
    authorization: ActiveBuildAuthorization;
    now: number;
    postId: Id<"buildCollaborationPosts">;
    referenceCount: number;
  }
) {
  const newState = JSON.stringify({
    actionItemCount: input.actionItemCount,
    referenceCount: input.referenceCount,
    status: "published",
  });
  await ctx.db.insert("auditEvents", {
    actorRoles: input.authorization.roles,
    actorWorkosUserId: input.authorization.viewer.subject,
    brokerageId: input.authorization.brokerage._id,
    command: "approveAndPublishBuildCollaborationBundle",
    createdAt: input.now,
    entityId: input.postId,
    entityType: "buildCollaborationPost",
    eventType: "build.collaboration.post.published",
    newState,
    organizationId: input.authorization.organizationId,
    warnings: [],
  });
  await ctx.db.insert("eventOutbox", {
    brokerageId: input.authorization.brokerage._id,
    createdAt: input.now,
    eventType: "build.collaboration.post.published",
    organizationId: input.authorization.organizationId,
    payloadPreview: newState,
    relatedEntityId: input.postId,
    relatedEntityType: "buildCollaborationPost",
    status: "pending",
  });
}

function validateOptionalTiptapJson(value: string) {
  if (value.length > MAX_RICH_TEXT_LENGTH) {
    throw buildCollaborationValidationError(
      "Action Item rich text is too long."
    );
  }
  try {
    const parsed = JSON.parse(value) as { type?: unknown };
    if (parsed.type !== "doc") {
      throw buildCollaborationValidationError(
        "TipTap document root must have type doc."
      );
    }
  } catch {
    throw buildCollaborationValidationError(
      "Action Item description must be valid TipTap JSON."
    );
  }
}
