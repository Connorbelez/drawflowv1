import { v } from "convex/values";

import type { ActiveBuildAuthorization } from "../activeBuildAccess";
import { authenticatedMutation, authenticatedQuery } from "../authz";
import {
  canReadCollaborationPost,
  resolveCurrentCollaborationNotificationReaderIds,
  resolveCurrentCollaborationPostReaderIds,
} from "../build_collaboration_access";
import { authorizeActiveBuildHumanCollaborationAccess } from "../build_collaboration_actor";
import {
  canReadDrawCoordination,
  resolveCurrentDrawCoordinationReaderIds,
} from "../build_draw_coordination";
import { projectCollaborationAssetAttachments } from "../build_collaboration_asset_projection";
import { persistGovernedCollaborationAssetAttachments } from "../build_collaboration_asset_publication";
import {
  collaborationModeratedContent,
  collaborationTombstoneContent,
  projectCollaborationRevisionForViewer,
} from "../build_collaboration_content";
import {
  collaborationCommentRowValidator,
  collaborationFocusedCommentContextValidator,
} from "../build_collaboration_contracts";
import { collaborationModerationCapabilities } from "../build_collaboration_moderation";
import { emitCanonicalBuildCollaborationNotification } from "../build_collaboration_notifications";
import { canonicalizeTiptapReferences } from "../build_collaboration_publication_bundle";
import {
  type CanonicalBuildCollaborationReference,
  resolveCanonicalBuildCollaborationReferences,
  resolveCurrentBuildCollaborationReference,
} from "../build_collaboration_references";
import { reopenResolvedThreadForReply } from "../build_collaboration_resolution";
import { authorizeActiveBuildCollaborationAccess } from "../build_collaboration_rollout";
import { queueBuildCollaborationSearchOwnerRebuild } from "../build_collaboration_search_maintenance";
import {
  buildCollaborationPinKindValidator,
  buildCollaborationReactionValidator,
  buildCollaborationReferenceKindValidator,
} from "../build_collaboration_validators";
import { isDrawSystemPost } from "../build_collaboration_system_event_access";
import { emitBuildCollaborationWebhookEvent } from "../build_collaboration_webhooks";
import type { Doc, Id, MutationCtx, QueryCtx } from "../types";

const MAX_THREAD_COMMENTS = 1000;
const MAX_LOGICAL_DEPTH = 50;

export function canPinForBuild(authorization: ActiveBuildAuthorization) {
  return !(
    authorization.effectiveRole.role === "homeowner" ||
    authorization.effectiveRole.role === "contractor"
  );
}

export async function persistCommentAttachments(
  ctx: MutationCtx,
  input: {
    assetIds: Id<"buildCollaborationAssets">[];
    authorization: ActiveBuildAuthorization;
    now: number;
    post: Doc<"buildCollaborationPosts">;
    readerWorkosUserIds: string[];
    revisionId: Id<"buildCollaborationCommentRevisions">;
  }
) {
  await persistGovernedCollaborationAssetAttachments(ctx, {
    assetIds: input.assetIds,
    authorization: input.authorization,
    command: "persistBuildCollaborationCommentAttachment",
    maxAttachments: 25,
    now: input.now,
    ownerKind: "commentRevision",
    ownerRecordId: input.revisionId,
    post: input.post,
    readerWorkosUserIds: input.readerWorkosUserIds,
    unavailableMessage: "A proposed comment attachment is unavailable.",
  });
}

export async function projectThreadComments(
  ctx: QueryCtx,
  authorization: ActiveBuildAuthorization,
  comments: Doc<"buildCollaborationComments">[]
) {
  if (comments.length === 0) {
    return [];
  }
  const scoped = comments.filter(
    (comment) =>
      comment.organizationId === authorization.organizationId &&
      comment.brokerageId === authorization.brokerage._id &&
      comment.buildId === authorization.build._id
  );
  const ordered = flattenThreadComments(scoped);
  const postId = ordered[0]?.postId;
  if (!postId) {
    return [];
  }
  const [reactions, pins] = await Promise.all([
    ctx.db
      .query("buildCollaborationReactions")
      .withIndex("by_postId_and_workosUserId", (query) =>
        query.eq("postId", postId)
      )
      .take(MAX_THREAD_COMMENTS * 10),
    ctx.db
      .query("buildCollaborationPins")
      .withIndex("by_postId_and_workosUserId_and_kind", (query) =>
        query.eq("postId", postId)
      )
      .take(MAX_THREAD_COMMENTS * 2),
  ]);
  const commentById = new Map(scoped.map((comment) => [comment._id, comment]));
  return await Promise.all(
    ordered.map((comment) =>
      projectCollaborationComment(ctx, authorization, comment, {
        parent: comment.parentCommentId
          ? commentById.get(comment.parentCommentId)
          : undefined,
        pins: pins.filter(
          (pin) =>
            pin.kind === "reply" &&
            pin.commentId === comment._id &&
            pin.organizationId === authorization.organizationId &&
            pin.brokerageId === authorization.brokerage._id &&
            pin.buildId === authorization.build._id &&
            pin.postId === postId
        ),
        reactions: reactions.filter(
          (reaction) =>
            reaction.commentId === comment._id &&
            reaction.organizationId === authorization.organizationId &&
            reaction.brokerageId === authorization.brokerage._id &&
            reaction.buildId === authorization.build._id &&
            reaction.postId === postId
        ),
      })
    )
  );
}

export function flattenThreadComments(comments: Doc<"buildCollaborationComments">[]) {
  const byId = new Map(comments.map((comment) => [comment._id, comment]));
  const children = new Map<
    Id<"buildCollaborationComments"> | undefined,
    Doc<"buildCollaborationComments">[]
  >();
  for (const comment of comments) {
    const parentId =
      comment.parentCommentId && byId.has(comment.parentCommentId)
        ? comment.parentCommentId
        : undefined;
    const siblings = children.get(parentId) ?? [];
    siblings.push(comment);
    children.set(parentId, siblings);
  }
  for (const siblings of children.values()) {
    siblings.sort(
      (left, right) =>
        left.createdAt - right.createdAt ||
        left._creationTime - right._creationTime
    );
  }
  const ordered: Doc<"buildCollaborationComments">[] = [];
  const visited = new Set<Id<"buildCollaborationComments">>();
  const visit = (comment: Doc<"buildCollaborationComments">) => {
    if (visited.has(comment._id)) {
      return;
    }
    visited.add(comment._id);
    ordered.push(comment);
    for (const child of children.get(comment._id) ?? []) {
      visit(child);
    }
  };
  for (const root of children.get(undefined) ?? []) {
    visit(root);
  }
  for (const comment of comments) {
    visit(comment);
  }
  return ordered;
}

export async function loadFocusedThreadComments(
  ctx: QueryCtx,
  authorization: ActiveBuildAuthorization,
  focus: Doc<"buildCollaborationComments">
) {
  const selected = new Map<
    Id<"buildCollaborationComments">,
    Doc<"buildCollaborationComments">
  >([[focus._id, focus]]);
  let current = focus;
  let ancestrySteps = 0;
  while (
    current.parentCommentId &&
    ancestrySteps < MAX_LOGICAL_DEPTH &&
    selected.size < MAX_THREAD_COMMENTS
  ) {
    const parent = await ctx.db.get(current.parentCommentId);
    if (
      !(parent && isScopedThreadComment(parent, authorization, focus.postId)) ||
      selected.has(parent._id)
    ) {
      break;
    }
    selected.set(parent._id, parent);
    current = parent;
    ancestrySteps += 1;
  }

  const pendingParentIds = [focus._id];
  while (pendingParentIds.length > 0 && selected.size < MAX_THREAD_COMMENTS) {
    const parentId = pendingParentIds.shift();
    if (!parentId) {
      break;
    }
    const remaining = MAX_THREAD_COMMENTS - selected.size;
    const children = await ctx.db
      .query("buildCollaborationComments")
      .withIndex("by_parentCommentId_and_createdAt", (query) =>
        query.eq("parentCommentId", parentId)
      )
      .take(remaining);
    for (const child of children) {
      if (
        !isScopedThreadComment(child, authorization, focus.postId) ||
        selected.has(child._id)
      ) {
        continue;
      }
      selected.set(child._id, child);
      pendingParentIds.push(child._id);
    }
  }
  return [...selected.values()];
}

export function isScopedThreadComment(
  comment: Doc<"buildCollaborationComments">,
  authorization: ActiveBuildAuthorization,
  postId: Id<"buildCollaborationPosts">
) {
  return (
    comment.organizationId === authorization.organizationId &&
    comment.brokerageId === authorization.brokerage._id &&
    comment.buildId === authorization.build._id &&
    comment.postId === postId
  );
}

export async function projectCollaborationComment(
  ctx: QueryCtx,
  authorization: ActiveBuildAuthorization,
  comment: Doc<"buildCollaborationComments">,
  context: {
    parent?: Doc<"buildCollaborationComments">;
    pins: Doc<"buildCollaborationPins">[];
    reactions: Doc<"buildCollaborationReactions">[];
  }
) {
  const currentRevisionId = comment.currentRevisionId;
  const unavailable = comment.contentState !== "active";
  const moderationCase = comment.activeModerationCaseId
    ? await ctx.db.get(comment.activeModerationCaseId)
    : null;
  const moderationCapabilities = collaborationModerationCapabilities({
    authorRole: comment.authorRole,
    authorWorkosUserId: comment.authorWorkosUserId,
    caseStatus: moderationCase?.status,
    contentState: comment.contentState,
    minimumReviewerTier: moderationCase?.appealReviewerMinimumTier,
    viewerRole: authorization.effectiveRole.role,
    viewerWorkosUserId: authorization.viewer.subject,
  });
  const references = currentRevisionId
    ? await ctx.db
        .query("buildCollaborationReferences")
        .withIndex("by_ownerKind_and_ownerRecordId", (query) =>
          query
            .eq("ownerKind", "commentRevision")
            .eq("ownerRecordId", currentRevisionId)
        )
        .take(100)
    : [];
  const revision = currentRevisionId
    ? await ctx.db.get(currentRevisionId)
    : null;
  const replacement = unavailable
    ? comment.contentState === "tombstoned"
      ? collaborationTombstoneContent("comment")
      : collaborationModeratedContent("comment")
    : null;
  const { canonicalReferences, referenceSummaries } =
    await projectCommentReferences(ctx, {
      authorization,
      comment,
      currentRevisionId,
      references,
      unavailable,
    });
  const revisionIsOwned =
    revision &&
    revision.organizationId === authorization.organizationId &&
    revision.brokerageId === authorization.brokerage._id &&
    revision.buildId === authorization.build._id &&
    revision.postId === comment.postId &&
    revision.commentId === comment._id;
  const projectedRevision =
    revisionIsOwned && !unavailable
      ? projectCollaborationRevisionForViewer({
          references: canonicalReferences,
          tiptapJson: revision.tiptapJson,
        })
      : replacement;
  const viewerCanPin =
    comment.contentState === "active" &&
    (comment.authorWorkosUserId === authorization.viewer.subject ||
      canPinForBuild(authorization));
  return {
    attachments:
      revisionIsOwned && !unavailable
        ? await projectCollaborationAssetAttachments(ctx, {
            buildId: authorization.build._id,
            organizationId: authorization.organizationId,
            ownerKind: "commentRevision",
            ownerRecordId: revision._id,
          })
        : [],
    comment: {
      _creationTime: comment._creationTime,
      _id: comment._id,
      authorDisplayNameSnapshot: comment.authorDisplayNameSnapshot,
      authorRole: comment.authorRole,
      contentState: comment.contentState,
      createdAt: comment.createdAt,
      logicalDepth: comment.logicalDepth,
      parentAuthorDisplayNameSnapshot:
        context.parent?.authorDisplayNameSnapshot,
      parentCommentId: comment.parentCommentId,
      pinCount: context.pins.length,
      revision: comment.revision,
      updatedAt: comment.updatedAt,
      viewerCanPin,
      viewerCanAppeal: moderationCapabilities.canAppeal,
      viewerCanModerate: moderationCapabilities.canModerate,
      viewerCanResolveAppeal: moderationCapabilities.canResolveAppeal,
      viewerIsAuthor:
        comment.authorWorkosUserId === authorization.viewer.subject,
      viewerPinned: context.pins.some(
        (pin) => pin.workosUserId === authorization.viewer.subject
      ),
    },
    reactions: context.reactions.map((reaction) => ({
      _creationTime: reaction._creationTime,
      _id: reaction._id,
      reaction: reaction.reaction,
      workosUserId: reaction.workosUserId,
    })),
    references: unavailable ? [] : referenceSummaries,
    revision:
      revisionIsOwned && projectedRevision
        ? {
            _creationTime: revision._creationTime,
            _id: revision._id,
            createdAt: unavailable ? comment.updatedAt : revision.createdAt,
            editReason: unavailable ? undefined : revision.editReason,
            plainText: projectedRevision.plainText,
            revision: comment.revision,
            tiptapJson: projectedRevision.tiptapJson,
          }
        : null,
  };
}

export async function projectCommentReferences(
  ctx: QueryCtx,
  input: {
    authorization: ActiveBuildAuthorization;
    comment: Doc<"buildCollaborationComments">;
    currentRevisionId?: Id<"buildCollaborationCommentRevisions">;
    references: Doc<"buildCollaborationReferences">[];
    unavailable: boolean;
  }
) {
  const canonicalReferences: CanonicalBuildCollaborationReference[] = [];
  const referenceSummaries: Array<{
    _creationTime: number;
    _id: Id<"buildCollaborationReferences">;
    entityId: string;
    entityKind: Doc<"buildCollaborationReferences">["entityKind"];
    labelSnapshot: string;
    summarySnapshot?: string;
  }> = [];
  if (input.unavailable) {
    return { canonicalReferences, referenceSummaries };
  }
  for (const reference of input.references) {
    if (
      reference.organizationId !== input.authorization.organizationId ||
      reference.brokerageId !== input.authorization.brokerage._id ||
      reference.buildId !== input.authorization.build._id ||
      reference.postId !== input.comment.postId ||
      reference.ownerRecordId !== input.currentRevisionId
    ) {
      continue;
    }
    try {
      const current = await resolveCurrentBuildCollaborationReference(ctx, {
        authorization: input.authorization,
        entityId: reference.entityId,
        entityKind: reference.entityKind,
      });
      canonicalReferences.push(current);
      referenceSummaries.push({
        _creationTime: reference._creationTime,
        _id: reference._id,
        entityId: reference.entityId,
        entityKind: reference.entityKind,
        labelSnapshot: current.label,
        summarySnapshot: current.summary,
      });
    } catch {
      referenceSummaries.push({
        _creationTime: reference._creationTime,
        _id: reference._id,
        entityId: reference.entityId,
        entityKind: reference.entityKind,
        labelSnapshot: "Unavailable reference",
      });
    }
  }
  return { canonicalReferences, referenceSummaries };
}
