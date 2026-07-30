import { v } from "convex/values";

import type { ActiveBuildAuthorization } from "./activeBuildAccess";
import { authenticatedMutation, authenticatedQuery } from "./authz";
import {
  canReadCollaborationPost,
  resolveCurrentCollaborationPostReaderIds,
} from "./build_collaboration_access";
import { authorizeActiveBuildHumanCollaborationAccess } from "./build_collaboration_actor";
import { requireHumanCollaborationActor } from "./build_collaboration_human";
import {
  type BuildCollaborationRole,
  collaborationRoleTier,
  resolveEffectiveCollaborationRole,
} from "./build_collaboration_model";
import { authorizeActiveBuildCollaborationAccess } from "./build_collaboration_rollout";
import { buildCollaborationRoleValidator } from "./build_collaboration_validators";
import type { Doc, Id, MutationCtx, QueryCtx } from "./types";

const MAX_REASON_LENGTH = 2000;
const moderationEntityKindValidator = v.union(
  v.literal("post"),
  v.literal("comment")
);
const moderationStatusValidator = v.union(
  v.literal("moderated"),
  v.literal("appealed"),
  v.literal("restored"),
  v.literal("final_retained")
);
const moderationContextValidator = v.object({
  canAppeal: v.boolean(),
  canModerate: v.boolean(),
  canResolveAppeal: v.boolean(),
  caseId: v.optional(v.id("buildCollaborationModerationCases")),
  currentReason: v.optional(v.string()),
  events: v.array(
    v.object({
      actorRole: buildCollaborationRoleValidator,
      createdAt: v.number(),
      eventType: v.union(
        v.literal("moderated"),
        v.literal("appealed"),
        v.literal("restored"),
        v.literal("retained")
      ),
      reason: v.string(),
    })
  ),
  status: v.optional(moderationStatusValidator),
});

type ModeratedEntity =
  | {
      comment: Doc<"buildCollaborationComments">;
      entityKind: "comment";
      post: Doc<"buildCollaborationPosts">;
    }
  | {
      entityKind: "post";
      post: Doc<"buildCollaborationPosts">;
    };

export function collaborationModerationCapabilities(input: {
  authorRole?: BuildCollaborationRole;
  authorWorkosUserId?: string;
  caseStatus?: "moderated" | "appealed" | "restored" | "final_retained";
  contentState: "active" | "moderated" | "tombstoned";
  minimumReviewerTier?: number;
  viewerRole: BuildCollaborationRole;
  viewerWorkosUserId: string;
}) {
  const viewerTier = collaborationRoleTier(input.viewerRole);
  const isAuthor =
    Boolean(input.authorWorkosUserId) &&
    input.authorWorkosUserId === input.viewerWorkosUserId;
  const canModerate =
    input.contentState === "active" &&
    !isAuthor &&
    Boolean(input.authorRole) &&
    canRoleModerateAuthor(
      input.viewerRole,
      input.authorRole as BuildCollaborationRole
    );
  const canAppeal =
    input.contentState === "moderated" &&
    isAuthor &&
    input.caseStatus === "moderated" &&
    (input.minimumReviewerTier ?? 6) <= 5;
  const canResolveAppeal =
    input.contentState === "moderated" &&
    input.caseStatus === "appealed" &&
    viewerTier >= (input.minimumReviewerTier ?? 6) &&
    !isAuthor;
  return { canAppeal, canModerate, canResolveAppeal };
}

function canRoleModerateAuthor(
  viewerRole: BuildCollaborationRole,
  authorRole: BuildCollaborationRole
) {
  switch (viewerRole) {
    case "admin":
      return true;
    case "principle-broker":
      return collaborationRoleTier(authorRole) < 4;
    case "broker":
    case "builder":
    case "broker-staff":
      return collaborationRoleTier(authorRole) < 3;
    case "builder-staff":
      return authorRole === "contractor";
    case "homeowner":
    case "contractor":
      return false;
  }
}

export const getBuildCollaborationModerationContext = authenticatedQuery
  .input({
    buildId: v.id("activeBuilds"),
    entityId: v.string(),
    entityKind: moderationEntityKindValidator,
    organizationId: v.string(),
  })
  .returns(moderationContextValidator)
  .handler(async (ctx, args) => {
    const authorization = await authorizeActiveBuildCollaborationAccess(
      ctx,
      args
    );
    const entity = await requireReadableModerationEntity(
      ctx,
      authorization,
      args
    );
    const content = entity.entityKind === "post" ? entity.post : entity.comment;
    const moderationCase = content.activeModerationCaseId
      ? await ctx.db.get(content.activeModerationCaseId)
      : null;
    const capabilities = collaborationModerationCapabilities({
      authorRole: content.authorRole,
      authorWorkosUserId: content.authorWorkosUserId,
      caseStatus: moderationCase?.status,
      contentState: content.contentState,
      minimumReviewerTier: moderationCase?.appealReviewerMinimumTier,
      viewerRole: authorization.effectiveRole.role,
      viewerWorkosUserId: authorization.viewer.subject,
    });
    const maySeeCase =
      content.authorWorkosUserId === authorization.viewer.subject ||
      capabilities.canResolveAppeal ||
      moderationCase?.moderatorWorkosUserId === authorization.viewer.subject;
    const events =
      maySeeCase && moderationCase
        ? await ctx.db
            .query("buildCollaborationModerationEvents")
            .withIndex("by_caseId_and_createdAt", (query) =>
              query.eq("caseId", moderationCase._id)
            )
            .take(100)
        : [];
    return {
      ...capabilities,
      caseId: maySeeCase ? moderationCase?._id : undefined,
      currentReason: maySeeCase ? moderationCase?.currentReason : undefined,
      events: events.map((event) => ({
        actorRole: event.actorRole,
        createdAt: event.createdAt,
        eventType: event.eventType,
        reason: event.reason,
      })),
      status: maySeeCase ? moderationCase?.status : undefined,
    };
  })
  .public();

export const moderateBuildCollaborationContent = authenticatedMutation
  .input({
    buildId: v.id("activeBuilds"),
    entityId: v.string(),
    entityKind: moderationEntityKindValidator,
    expectedRevision: v.number(),
    organizationId: v.string(),
    reason: v.string(),
  })
  .returns(v.id("buildCollaborationModerationCases"))
  .handler(async (ctx, args) => {
    const authorization = await authorizeActiveBuildHumanCollaborationAccess(
      ctx,
      args
    );
    await requireHumanCollaborationActor(ctx, authorization);
    const entity = await requireReadableModerationEntity(
      ctx,
      authorization,
      args
    );
    const content = entity.entityKind === "post" ? entity.post : entity.comment;
    const reason = requireReason(args.reason);
    const authorRole = content.authorRole;
    if (content.revision !== args.expectedRevision) {
      throw new Error("Revision conflict: collaboration content changed.");
    }
    const capabilities = collaborationModerationCapabilities({
      authorRole: content.authorRole,
      authorWorkosUserId: content.authorWorkosUserId,
      contentState: content.contentState,
      viewerRole: authorization.effectiveRole.role,
      viewerWorkosUserId: authorization.viewer.subject,
    });
    if (
      !(capabilities.canModerate && content.authorWorkosUserId && authorRole)
    ) {
      throw new Error("Forbidden: collaboration moderation hierarchy");
    }
    const now = Date.now();
    const evidenceSnapshotJson = await moderationEvidenceSnapshot(ctx, entity);
    const moderatorTier = authorization.effectiveRole.tier;
    const caseId = await ctx.db.insert("buildCollaborationModerationCases", {
      appealReviewerMinimumTier: moderatorTier + 1,
      brokerageId: authorization.brokerage._id,
      buildId: authorization.build._id,
      commentId:
        entity.entityKind === "comment" ? entity.comment._id : undefined,
      contentAuthorRole: authorRole,
      contentAuthorWorkosUserId: content.authorWorkosUserId,
      createdAt: now,
      currentReason: reason,
      entityId: content._id,
      entityKind: entity.entityKind,
      evidenceSnapshotJson,
      moderatorRole: authorization.effectiveRole.role,
      moderatorTier,
      moderatorWorkosUserId: authorization.viewer.subject,
      organizationId: authorization.organizationId,
      postId: entity.post._id,
      status: "moderated",
      updatedAt: now,
    });
    await patchModeratedContent(ctx, entity, {
      caseId,
      reason,
      role: authorization.effectiveRole.role,
      timestamp: now,
      workosUserId: authorization.viewer.subject,
    });
    await recordModerationTransition(ctx, {
      authorization,
      caseId,
      entity,
      eventType: "moderated",
      newState: "moderated",
      priorState: "active",
      reason,
      timestamp: now,
    });
    await notifyModerationAuthor(ctx, {
      authorization,
      body: `Your Build collaboration ${entity.entityKind} was moderated. Reason: ${reason}`,
      caseId,
      eventKey: "moderated",
      recipientWorkosUserId: content.authorWorkosUserId,
      title: "Build collaboration content moderated",
    });
    return caseId;
  })
  .public();

export const appealBuildCollaborationModeration = authenticatedMutation
  .input({
    buildId: v.id("activeBuilds"),
    caseId: v.id("buildCollaborationModerationCases"),
    organizationId: v.string(),
    reason: v.string(),
  })
  .returns(v.id("buildCollaborationModerationCases"))
  .handler(async (ctx, args) => {
    const authorization = await authorizeActiveBuildHumanCollaborationAccess(
      ctx,
      args
    );
    await requireHumanCollaborationActor(ctx, authorization);
    const moderationCase = await requireModerationCase(
      ctx,
      authorization,
      args.caseId
    );
    const reason = requireReason(args.reason);
    if (
      moderationCase.contentAuthorWorkosUserId !==
        authorization.viewer.subject ||
      moderationCase.status !== "moderated" ||
      moderationCase.appealReviewerMinimumTier > 5
    ) {
      throw new Error("Forbidden: moderation appeal");
    }
    const entity = await requireReadableModerationEntity(ctx, authorization, {
      entityId: moderationCase.entityId,
      entityKind: moderationCase.entityKind,
    });
    const content = entity.entityKind === "post" ? entity.post : entity.comment;
    if (content.activeModerationCaseId !== moderationCase._id) {
      throw new Error("Moderation case is no longer active.");
    }
    const now = Date.now();
    await ctx.db.patch(moderationCase._id, {
      currentReason: reason,
      lastAppealedAt: now,
      lastAppealedByWorkosUserId: authorization.viewer.subject,
      status: "appealed",
      updatedAt: now,
    });
    await recordModerationTransition(ctx, {
      authorization,
      caseId: moderationCase._id,
      entity,
      eventType: "appealed",
      newState: "appealed",
      priorState: "moderated",
      reason,
      timestamp: now,
    });
    await notifyEligibleAppealReviewers(ctx, {
      authorization,
      caseId: moderationCase._id,
      minimumTier: moderationCase.appealReviewerMinimumTier,
      post: entity.post,
      reason,
    });
    return moderationCase._id;
  })
  .public();

export const resolveBuildCollaborationModerationAppeal = authenticatedMutation
  .input({
    buildId: v.id("activeBuilds"),
    caseId: v.id("buildCollaborationModerationCases"),
    organizationId: v.string(),
    outcome: v.union(v.literal("restore"), v.literal("retain")),
    reason: v.string(),
  })
  .returns(v.id("buildCollaborationModerationCases"))
  .handler(async (ctx, args) => {
    const authorization = await authorizeActiveBuildHumanCollaborationAccess(
      ctx,
      args
    );
    await requireHumanCollaborationActor(ctx, authorization);
    const moderationCase = await requireModerationCase(
      ctx,
      authorization,
      args.caseId
    );
    const reason = requireReason(args.reason);
    if (
      moderationCase.status !== "appealed" ||
      authorization.effectiveRole.tier <
        moderationCase.appealReviewerMinimumTier ||
      moderationCase.contentAuthorWorkosUserId === authorization.viewer.subject
    ) {
      throw new Error("Forbidden: moderation appeal resolution");
    }
    const entity = await requireReadableModerationEntity(ctx, authorization, {
      entityId: moderationCase.entityId,
      entityKind: moderationCase.entityKind,
    });
    const content = entity.entityKind === "post" ? entity.post : entity.comment;
    if (content.activeModerationCaseId !== moderationCase._id) {
      throw new Error("Moderation case is no longer active.");
    }
    const now = Date.now();
    const restored = args.outcome === "restore";
    const nextMinimumTier = authorization.effectiveRole.tier + 1;
    const nextStatus = restored
      ? "restored"
      : nextMinimumTier > 5
        ? "final_retained"
        : "moderated";
    await ctx.db.patch(moderationCase._id, {
      appealReviewerMinimumTier: nextMinimumTier,
      currentReason: reason,
      resolutionReason: reason,
      resolvedAt: now,
      resolvedByRole: authorization.effectiveRole.role,
      resolvedByWorkosUserId: authorization.viewer.subject,
      status: nextStatus,
      updatedAt: now,
    });
    await patchResolvedContent(ctx, entity, {
      restored,
      timestamp: now,
    });
    await recordModerationTransition(ctx, {
      authorization,
      caseId: moderationCase._id,
      entity,
      eventType: restored ? "restored" : "retained",
      newState: nextStatus,
      priorState: "appealed",
      reason,
      timestamp: now,
    });
    await notifyModerationAuthor(ctx, {
      authorization,
      body: restored
        ? `Your moderation appeal was accepted. Reason: ${reason}`
        : `Your moderation appeal was retained. Reason: ${reason}`,
      caseId: moderationCase._id,
      eventKey: restored
        ? `restored:${now}`
        : `retained:${nextMinimumTier}:${now}`,
      recipientWorkosUserId: moderationCase.contentAuthorWorkosUserId,
      title: restored
        ? "Build collaboration content restored"
        : "Build collaboration moderation retained",
    });
    return moderationCase._id;
  })
  .public();

async function requireReadableModerationEntity(
  ctx: QueryCtx,
  authorization: ActiveBuildAuthorization,
  input: { entityId: string; entityKind: "comment" | "post" }
): Promise<ModeratedEntity> {
  if (input.entityKind === "post") {
    const postId = ctx.db.normalizeId(
      "buildCollaborationPosts",
      input.entityId
    );
    const post = postId ? await ctx.db.get(postId) : null;
    if (!(post && (await canReadCollaborationPost(ctx, authorization, post)))) {
      throw new Error("Forbidden: collaboration moderation target");
    }
    return { entityKind: "post", post };
  }
  const commentId = ctx.db.normalizeId(
    "buildCollaborationComments",
    input.entityId
  );
  const comment = commentId ? await ctx.db.get(commentId) : null;
  const post = comment ? await ctx.db.get(comment.postId) : null;
  if (
    !(
      comment &&
      post &&
      (await canReadCollaborationPost(ctx, authorization, post))
    )
  ) {
    throw new Error("Forbidden: collaboration moderation target");
  }
  return { comment, entityKind: "comment", post };
}

async function requireModerationCase(
  ctx: QueryCtx,
  authorization: ActiveBuildAuthorization,
  caseId: Id<"buildCollaborationModerationCases">
) {
  const moderationCase = await ctx.db.get(caseId);
  if (
    !moderationCase ||
    moderationCase.buildId !== authorization.build._id ||
    moderationCase.organizationId !== authorization.organizationId
  ) {
    throw new Error("Forbidden: moderation case");
  }
  return moderationCase;
}

function requireReason(reason: string) {
  const normalized = reason.trim();
  if (!normalized) {
    throw new Error("A moderation reason is required.");
  }
  if (normalized.length > MAX_REASON_LENGTH) {
    throw new Error(
      `A moderation reason may not exceed ${MAX_REASON_LENGTH} characters.`
    );
  }
  return normalized;
}

async function moderationEvidenceSnapshot(
  ctx: QueryCtx,
  entity: ModeratedEntity
) {
  const content = entity.entityKind === "post" ? entity.post : entity.comment;
  const ownerKind =
    entity.entityKind === "post" ? "postRevision" : "commentRevision";
  const revisionId = content.currentRevisionId;
  const [references, attachments, receipts] = await Promise.all([
    revisionId
      ? ctx.db
          .query("buildCollaborationReferences")
          .withIndex("by_ownerKind_and_ownerRecordId", (query) =>
            query.eq("ownerKind", ownerKind).eq("ownerRecordId", revisionId)
          )
          .take(100)
      : [],
    revisionId
      ? ctx.db
          .query("buildCollaborationAttachments")
          .withIndex("by_ownerKind_and_ownerRecordId", (query) =>
            query.eq("ownerKind", ownerKind).eq("ownerRecordId", revisionId)
          )
          .take(100)
      : [],
    ctx.db
      .query("buildCollaborationReceipts")
      .withIndex("by_postId_and_workosUserId", (query) =>
        query.eq("postId", entity.post._id)
      )
      .take(500),
  ]);
  return JSON.stringify({
    attachmentIds: attachments.map((attachment) => attachment._id),
    contentRevisionId: revisionId,
    receiptIds: receipts.map((receipt) => receipt._id),
    referenceIds: references.map((reference) => reference._id),
  });
}

async function patchModeratedContent(
  ctx: MutationCtx,
  entity: ModeratedEntity,
  input: {
    caseId: Id<"buildCollaborationModerationCases">;
    reason: string;
    role: BuildCollaborationRole;
    timestamp: number;
    workosUserId: string;
  }
) {
  const patch = {
    activeModerationCaseId: input.caseId,
    contentState: "moderated" as const,
    moderatedAt: input.timestamp,
    moderatedByRole: input.role,
    moderatedByWorkosUserId: input.workosUserId,
    moderationReason: input.reason,
    updatedAt: input.timestamp,
  };
  if (entity.entityKind === "post") {
    await ctx.db.patch(entity.post._id, {
      ...patch,
      readRevision: (entity.post.readRevision ?? entity.post.revision) + 1,
    });
  } else {
    await ctx.db.patch(entity.comment._id, patch);
    await ctx.db.patch(entity.post._id, {
      readRevision: (entity.post.readRevision ?? entity.post.revision) + 1,
      updatedAt: input.timestamp,
    });
  }
}

async function patchResolvedContent(
  ctx: MutationCtx,
  entity: ModeratedEntity,
  input: { restored: boolean; timestamp: number }
) {
  if (!input.restored) {
    return;
  }
  const patch = {
    activeModerationCaseId: undefined,
    contentState: "active" as const,
    moderatedAt: undefined,
    moderatedByRole: undefined,
    moderatedByWorkosUserId: undefined,
    moderationReason: undefined,
    updatedAt: input.timestamp,
  };
  if (entity.entityKind === "post") {
    await ctx.db.patch(entity.post._id, {
      ...patch,
      readRevision: (entity.post.readRevision ?? entity.post.revision) + 1,
    });
  } else {
    await ctx.db.patch(entity.comment._id, patch);
    await ctx.db.patch(entity.post._id, {
      readRevision: (entity.post.readRevision ?? entity.post.revision) + 1,
      updatedAt: input.timestamp,
    });
  }
}

async function recordModerationTransition(
  ctx: MutationCtx,
  input: {
    authorization: ActiveBuildAuthorization;
    caseId: Id<"buildCollaborationModerationCases">;
    entity: ModeratedEntity;
    eventType: "appealed" | "moderated" | "restored" | "retained";
    newState: string;
    priorState: string;
    reason: string;
    timestamp: number;
  }
) {
  const entityId =
    input.entity.entityKind === "post"
      ? input.entity.post._id
      : input.entity.comment._id;
  await ctx.db.insert("buildCollaborationModerationEvents", {
    actorRole: input.authorization.effectiveRole.role,
    actorWorkosUserId: input.authorization.viewer.subject,
    brokerageId: input.authorization.brokerage._id,
    buildId: input.authorization.build._id,
    caseId: input.caseId,
    createdAt: input.timestamp,
    eventType: input.eventType,
    newState: input.newState,
    organizationId: input.authorization.organizationId,
    priorState: input.priorState,
    reason: input.reason,
  });
  await ctx.db.insert("auditEvents", {
    actorRoles: input.authorization.roles,
    actorWorkosUserId: input.authorization.viewer.subject,
    brokerageId: input.authorization.brokerage._id,
    command: `buildCollaborationModeration.${input.eventType}`,
    createdAt: input.timestamp,
    entityId,
    entityType:
      input.entity.entityKind === "post"
        ? "buildCollaborationPost"
        : "buildCollaborationComment",
    eventType: `build.collaboration.moderation.${input.eventType}`,
    newState: input.newState,
    organizationId: input.authorization.organizationId,
    priorState: input.priorState,
    reason: input.reason,
    warnings: [],
  });
}

async function notifyModerationAuthor(
  ctx: MutationCtx,
  input: {
    authorization: ActiveBuildAuthorization;
    body: string;
    caseId: Id<"buildCollaborationModerationCases">;
    eventKey: string;
    recipientWorkosUserId: string;
    title: string;
  }
) {
  const dedupeKey = `build-collaboration:moderation:${input.caseId}:${input.eventKey}`;
  const existing = await ctx.db
    .query("recipientDeliveries")
    .withIndex("by_recipient_dedupe", (query) =>
      query
        .eq("organizationId", input.authorization.organizationId)
        .eq("recipientWorkosUserId", input.recipientWorkosUserId)
        .eq("dedupeKey", dedupeKey)
    )
    .first();
  if (existing) {
    return;
  }
  const now = Date.now();
  await ctx.db.insert("recipientDeliveries", {
    actionLabel: "Review moderation",
    actionRequired: true,
    body: input.body,
    brokerageId: input.authorization.brokerage._id,
    createdAt: now,
    dedupeKey,
    entityId: input.caseId,
    entityLabel: input.authorization.build.buildName,
    entityType: "buildCollaborationModerationCase",
    href: `/backoffice/builds/${input.authorization.build._id}?tab=details&moderationCase=${input.caseId}`,
    organizationId: input.authorization.organizationId,
    recipientWorkosUserId: input.recipientWorkosUserId,
    resolutionMode: "recipient",
    sourceLabel: "Build collaboration",
    status: "unread",
    title: input.title,
    updatedAt: now,
  });
}

async function notifyEligibleAppealReviewers(
  ctx: MutationCtx,
  input: {
    authorization: ActiveBuildAuthorization;
    caseId: Id<"buildCollaborationModerationCases">;
    minimumTier: number;
    post: Doc<"buildCollaborationPosts">;
    reason: string;
  }
) {
  const readerIds = new Set(
    await resolveCurrentCollaborationPostReaderIds(
      ctx,
      input.authorization,
      input.post
    )
  );
  const recipients = new Set(
    input.authorization.participants
      .filter(
        (participant) =>
          readerIds.has(participant.workosUserId) &&
          collaborationRoleTier(participant.role) >= input.minimumTier
      )
      .map((participant) => participant.workosUserId)
  );
  const memberships = await ctx.db
    .query("workosOrganizationMemberships")
    .withIndex("by_organization", (query) =>
      query.eq("workosOrganizationId", input.authorization.organizationId)
    )
    .take(500);
  for (const membership of memberships) {
    if (membership.status !== "active") {
      continue;
    }
    const role = resolveEffectiveCollaborationRole([
      membership.roleSlug,
      ...membership.roleSlugs,
    ]);
    if (
      role &&
      (role.role === "admin" || role.role === "principle-broker") &&
      role.tier >= input.minimumTier
    ) {
      recipients.add(membership.workosUserId);
    }
  }
  for (const recipientWorkosUserId of recipients) {
    await notifyModerationAuthor(ctx, {
      authorization: input.authorization,
      body: `A Build collaboration moderation appeal requires review. Reason: ${input.reason}`,
      caseId: input.caseId,
      eventKey: `appeal:${input.minimumTier}`,
      recipientWorkosUserId,
      title: "Build collaboration moderation appeal",
    });
  }
}
