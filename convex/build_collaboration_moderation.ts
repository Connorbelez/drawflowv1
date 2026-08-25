import { v } from "convex/values";

import type { ActiveBuildAuthorization } from "./activeBuildAccess";
import { authenticatedMutation, authenticatedQuery } from "./authz";
import {
  canReadCollaborationPost,
  canSeeCollaborationReceipt,
  resolveCurrentCollaborationPostReaderIds,
} from "./build_collaboration_access";
import { authorizeActiveBuildHumanCollaborationAccess } from "./build_collaboration_actor";
import { projectCollaborationRevisionForViewer } from "./build_collaboration_content";
import { canReadDrawCoordination } from "./build_draw_coordination";
import { requireHumanCollaborationActor } from "./build_collaboration_human";
import {
  type BuildCollaborationRole,
  buildCollaborationRoles,
  collaborationRoleTier,
  resolveEffectiveCollaborationRole,
} from "./build_collaboration_model";
import {
  type BuildCollaborationReferenceKind,
  type CanonicalBuildCollaborationReference,
  resolveCurrentBuildCollaborationReference,
} from "./build_collaboration_references";
import { reopenQuestionForUnavailableAcceptedAnswer } from "./build_collaboration_resolution";
import { authorizeActiveBuildCollaborationAccess } from "./build_collaboration_rollout";
import { queueBuildCollaborationSearchOwnerRebuild } from "./build_collaboration_search_maintenance";
import {
  buildCollaborationAttachmentKindValidator,
  buildCollaborationReferenceKindValidator,
  buildCollaborationRoleValidator,
} from "./build_collaboration_validators";
import { emitBuildCollaborationWebhookEvent } from "./build_collaboration_webhooks";
import type { Doc, Id, MutationCtx, QueryCtx } from "./types";

import {
  requireReadableModerationEntity,
  requireModerationCase,
  requireReason,
  moderationEvidenceSnapshot,
  moderationEvidenceForViewer,
  loadModerationReferences,
  loadModerationAttachments,
  loadModerationReceipts,
  parseModerationEvidenceSnapshot,
  isModerationReceiptSnapshot,
  receiptDisplayNameSnapshot,
  loadModeratedRevision,
  moderationCaseMatchesEntity,
  projectModerationAttachment,
  canReadModerationAsset,
  patchModeratedContent,
  patchResolvedContent,
  recordModerationTransition,
  notifyModerationAuthor,
  notifyEligibleAppealReviewers,
} from "./build_collaboration_moderation/helpers";
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
  evidence: v.optional(
    v.object({
      attachments: v.array(
        v.object({
          attachmentKind: buildCollaborationAttachmentKindValidator,
          href: v.optional(v.string()),
          label: v.string(),
          summary: v.optional(v.string()),
        })
      ),
      plainText: v.string(),
      receipts: v.array(
        v.object({
          displayNameSnapshot: v.string(),
          firstViewedAt: v.number(),
          lastViewedAt: v.number(),
          viewerRole: buildCollaborationRoleValidator,
          workosUserId: v.string(),
        })
      ),
      references: v.array(
        v.object({
          entityKind: buildCollaborationReferenceKindValidator,
          href: v.string(),
          label: v.string(),
          summary: v.string(),
        })
      ),
      tiptapJson: v.string(),
    })
  ),
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
  systemAuthored?: boolean;
  viewerRole: BuildCollaborationRole;
  viewerWorkosUserId: string;
}) {
  const viewerTier = collaborationRoleTier(input.viewerRole);
  const isAuthor =
    Boolean(input.authorWorkosUserId) &&
    input.authorWorkosUserId === input.viewerWorkosUserId;
  const canModerate =
    input.contentState === "active" &&
    !input.systemAuthored &&
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
    const candidateModerationCase = content.activeModerationCaseId
      ? await ctx.db.get(content.activeModerationCaseId)
      : null;
    const moderationCase =
      candidateModerationCase &&
      moderationCaseMatchesEntity(
        candidateModerationCase,
        authorization,
        entity
      )
        ? candidateModerationCase
        : null;
    const capabilities = collaborationModerationCapabilities({
      authorRole: content.authorRole,
      authorWorkosUserId: content.authorWorkosUserId,
      caseStatus: moderationCase?.status,
      contentState: content.contentState,
      minimumReviewerTier: moderationCase?.appealReviewerMinimumTier,
      systemAuthored:
        entity.entityKind === "post" &&
        entity.post.systemPostKind !== undefined,
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
            .then((caseEvents) =>
              caseEvents.filter(
                (event) =>
                  event.organizationId === authorization.organizationId &&
                  event.brokerageId === authorization.brokerage._id &&
                  event.buildId === authorization.build._id
              )
            )
        : [];
    const evidence =
      maySeeCase && moderationCase
        ? await moderationEvidenceForViewer(
            ctx,
            authorization,
            entity,
            moderationCase
          )
        : undefined;
    return {
      ...capabilities,
      caseId: maySeeCase ? moderationCase?._id : undefined,
      currentReason: maySeeCase ? moderationCase?.currentReason : undefined,
      evidence,
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
    if (entity.entityKind === "post" && entity.post.systemPostKind) {
      throw new Error("Forbidden: System Post facts cannot be moderated.");
    }
    const reason = requireReason(args.reason);
    const authorRole = content.authorRole;
    if (content.revision !== args.expectedRevision) {
      throw new Error("Revision conflict: collaboration content changed.");
    }
    const capabilities = collaborationModerationCapabilities({
      authorRole: content.authorRole,
      authorWorkosUserId: content.authorWorkosUserId,
      contentState: content.contentState,
      systemAuthored: false,
      viewerRole: authorization.effectiveRole.role,
      viewerWorkosUserId: authorization.viewer.subject,
    });
    if (
      !(capabilities.canModerate && content.authorWorkosUserId && authorRole)
    ) {
      throw new Error("Forbidden: collaboration moderation hierarchy");
    }
    const now = Date.now();
    const evidenceSnapshotJson = await moderationEvidenceSnapshot(
      ctx,
      authorization,
      entity
    );
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
    if (entity.entityKind === "comment") {
      await reopenQuestionForUnavailableAcceptedAnswer(ctx, {
        authorization,
        commentId: entity.comment._id,
        now,
        post: entity.post,
      });
    }
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
    await queueBuildCollaborationSearchOwnerRebuild(ctx, {
      authorization,
      owner: {
        id: entity.entityKind === "post" ? entity.post._id : entity.comment._id,
        kind: entity.entityKind,
      },
      postId: entity.post._id,
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
    await queueBuildCollaborationSearchOwnerRebuild(ctx, {
      authorization,
      owner: {
        id: entity.entityKind === "post" ? entity.post._id : entity.comment._id,
        kind: entity.entityKind,
      },
      postId: entity.post._id,
    });
    return moderationCase._id;
  })
  .public();
