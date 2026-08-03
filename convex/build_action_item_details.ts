import { v } from "convex/values";

import { authenticatedMutation, authenticatedQuery } from "./authz";
import { actionItemRequiresAcceptance } from "./build_action_item_governance";
import { requireReadableActionItem } from "./build_action_items";
import {
  canReadCollaborationPost,
  resolveCurrentCollaborationPostReaderIds,
} from "./build_collaboration_access";
import { authorizeActiveBuildHumanCollaborationAccess } from "./build_collaboration_actor";
import { canUseCollaborationAssetForPost } from "./build_collaboration_asset_access";
import { persistGovernedCollaborationAssetAttachments } from "./build_collaboration_asset_publication";
import { projectCollaborationRevisionForViewer } from "./build_collaboration_content";
import { systemActionItemPresentationValidator } from "./build_collaboration_contracts";
import { buildCollaborationDeepLink } from "./build_collaboration_links";
import { emitCanonicalBuildCollaborationNotification } from "./build_collaboration_notifications";
import { canonicalizeTiptapReferences } from "./build_collaboration_publication_bundle";
import {
  type CanonicalBuildCollaborationReference,
  resolveCanonicalBuildCollaborationReferences,
  resolveCurrentBuildCollaborationReference,
} from "./build_collaboration_references";
import { authorizeActiveBuildCollaborationAccess } from "./build_collaboration_rollout";
import { deriveMilestoneSystemActionItemPresentation } from "./build_collaboration_system_posts";
import {
  buildActionAssignmentStateValidator,
  buildActionItemPriorityValidator,
  buildActionItemStatusValidator,
  buildActionItemSystemModeValidator,
  buildActionItemWorkKindValidator,
  buildCollaborationAssetStateValidator,
  buildCollaborationAudienceModeValidator,
  buildCollaborationReactionValidator,
  buildCollaborationReferenceKindValidator,
  buildCollaborationRoleValidator,
} from "./build_collaboration_validators";
import type { Doc, Id, MutationCtx, QueryCtx } from "./types";

const MAX_DETAIL_EVENTS = 500;
const MAX_DETAIL_REVISIONS = 250;
const MAX_DETAIL_COMMENTS = 500;
const MAX_COMMENT_REFERENCES = 50;
const MAX_COMMENT_ATTACHMENTS = 20;
const MAX_COMMENT_TEXT_LENGTH = 25_000;

const referenceInputValidator = v.object({
  entityId: v.string(),
  entityKind: buildCollaborationReferenceKindValidator,
  label: v.string(),
  primary: v.optional(v.boolean()),
  summary: v.optional(v.string()),
});

const referenceSummaryValidator = v.object({
  entityId: v.string(),
  entityKind: buildCollaborationReferenceKindValidator,
  label: v.string(),
  primary: v.boolean(),
  summary: v.optional(v.string()),
});

const detailValidator = v.union(
  v.object({ state: v.literal("revoked") }),
  v.object({
    activity: v.array(
      v.object({
        actorDisplayName: v.string(),
        actorRole: buildCollaborationRoleValidator,
        createdAt: v.number(),
        eventId: v.id("buildActionItemEvents"),
        eventType: v.string(),
        reason: v.optional(v.string()),
        revision: v.optional(v.number()),
      })
    ),
    attachments: v.array(
      v.object({
        assetId: v.id("buildCollaborationAssets"),
        fileName: v.string(),
        mimeType: v.string(),
        sizeBytes: v.number(),
        state: buildCollaborationAssetStateValidator,
        version: v.number(),
      })
    ),
    comments: v.array(
      v.object({
        attachments: v.array(
          v.object({
            assetId: v.id("buildCollaborationAssets"),
            fileName: v.string(),
            mimeType: v.string(),
            sizeBytes: v.number(),
            state: buildCollaborationAssetStateValidator,
            version: v.number(),
          })
        ),
        authorDisplayName: v.string(),
        authorRole: buildCollaborationRoleValidator,
        commentId: v.id("buildActionItemComments"),
        createdAt: v.number(),
        plainText: v.string(),
        parentCommentId: v.optional(v.id("buildActionItemComments")),
        reactions: v.array(
          v.object({
            count: v.number(),
            reaction: buildCollaborationReactionValidator,
            viewerHasReacted: v.boolean(),
          })
        ),
        references: v.array(referenceSummaryValidator),
        tiptapJson: v.string(),
      })
    ),
    item: v.object({
      actionItemId: v.id("buildActionItems"),
      assigneeDisplayName: v.optional(v.string()),
      assigneeWorkosUserId: v.optional(v.string()),
      assignmentState: buildActionAssignmentStateValidator,
      audienceMode: buildCollaborationAudienceModeValidator,
      blockedReason: v.optional(v.string()),
      completedAt: v.optional(v.number()),
      completedByWorkosUserId: v.optional(v.string()),
      completionAcceptedByWorkosUserId: v.optional(v.string()),
      completionRequestedAt: v.optional(v.number()),
      completionRequestedByWorkosUserId: v.optional(v.string()),
      createdAt: v.number(),
      creatorDisplayName: v.string(),
      creatorWorkosUserId: v.string(),
      currentRevision: v.number(),
      descriptionPlainText: v.string(),
      descriptionTiptapJson: v.string(),
      dueAt: v.optional(v.number()),
      originatingPostId: v.id("buildCollaborationPosts"),
      parentActionItemId: v.optional(v.id("buildActionItems")),
      priority: buildActionItemPriorityValidator,
      requiresAcceptance: v.boolean(),
      status: buildActionItemStatusValidator,
      systemPresentation: v.optional(systemActionItemPresentationValidator),
      systemMode: v.optional(buildActionItemSystemModeValidator),
      canonicalBuildMilestoneId: v.optional(v.id("buildMilestones")),
      canonicalBuildSubmilestoneId: v.optional(v.id("buildSubmilestones")),
      canonicalBindingRevision: v.optional(v.number()),
      title: v.string(),
      updatedAt: v.number(),
      workKind: buildActionItemWorkKindValidator,
    }),
    labels: v.array(v.string()),
    references: v.array(referenceSummaryValidator),
    revisions: v.array(
      v.object({
        actorDisplayName: v.string(),
        actorRole: buildCollaborationRoleValidator,
        createdAt: v.number(),
        reason: v.optional(v.string()),
        revision: v.number(),
        snapshotJson: v.string(),
      })
    ),
    state: v.literal("visible"),
  })
);

export const getBuildActionItemDetail = authenticatedQuery
  .input({
    actionItemId: v.id("buildActionItems"),
    buildId: v.id("activeBuilds"),
    organizationId: v.string(),
  })
  .returns(detailValidator)
  .handler(async (ctx, args) => {
    const authorization = await authorizeActiveBuildCollaborationAccess(
      ctx,
      args
    );
    let item: Doc<"buildActionItems">;
    try {
      item = await requireReadableActionItem(
        ctx,
        authorization,
        args.actionItemId
      );
    } catch {
      return { state: "revoked" as const };
    }
    const post = await ctx.db.get(item.originatingPostId);
    if (!(post && (await canReadCollaborationPost(ctx, authorization, post)))) {
      return { state: "revoked" as const };
    }
    const [labels, attachments, references, events, revisions, comments] =
      await Promise.all([
        ctx.db
          .query("buildActionItemLabels")
          .withIndex("by_actionItemId_and_normalizedLabel", (query) =>
            query.eq("actionItemId", item._id)
          )
          .take(100),
        ctx.db
          .query("buildCollaborationAttachments")
          .withIndex("by_ownerKind_and_ownerRecordId", (query) =>
            query.eq("ownerKind", "actionItem").eq("ownerRecordId", item._id)
          )
          .take(50),
        ctx.db
          .query("buildCollaborationReferences")
          .withIndex("by_ownerKind_and_ownerRecordId", (query) =>
            query.eq("ownerKind", "actionItem").eq("ownerRecordId", item._id)
          )
          .take(100),
        ctx.db
          .query("buildActionItemEvents")
          .withIndex("by_actionItemId_and_createdAt", (query) =>
            query.eq("actionItemId", item._id)
          )
          .order("desc")
          .take(MAX_DETAIL_EVENTS),
        ctx.db
          .query("buildActionItemRevisions")
          .withIndex("by_actionItemId_and_revision", (query) =>
            query.eq("actionItemId", item._id)
          )
          .order("desc")
          .take(MAX_DETAIL_REVISIONS),
        ctx.db
          .query("buildActionItemComments")
          .withIndex("by_actionItemId_and_createdAt", (query) =>
            query.eq("actionItemId", item._id)
          )
          .take(MAX_DETAIL_COMMENTS),
      ]);
    const participantName = (workosUserId: string) =>
      authorization.participants.find(
        (participant) => participant.workosUserId === workosUserId
      )?.displayName ?? workosUserId;
    const projectedItemReferences = await projectActionItemReferences(ctx, {
      authorization,
      references,
    });
    const projectedItemContent = projectCollaborationRevisionForViewer({
      references: projectedItemReferences.canonical,
      tiptapJson: item.descriptionTiptapJson,
    });
    const systemPresentation =
      await deriveMilestoneSystemActionItemPresentation(ctx, {
        actionItem: item,
        asOf: Date.now(),
        build: authorization.build,
      });
    const attachmentRows = await Promise.all(
      attachments.map(async (attachment) => {
        if (attachment.attachmentKind !== "collaborationAsset") {
          return null;
        }
        const assetId =
          attachment.attachmentId as Id<"buildCollaborationAssets">;
        const asset = await ctx.db.get(assetId);
        if (
          !asset ||
          asset.buildId !== authorization.build._id ||
          asset.organizationId !== authorization.organizationId ||
          (asset.state !== "available" && asset.state !== "superseded") ||
          !(await canUseCollaborationAssetForPost(ctx, {
            asset,
            authorization,
            post,
          }))
        ) {
          return null;
        }
        return {
          assetId: asset._id,
          fileName: asset.fileName,
          mimeType: asset.mimeType,
          sizeBytes: asset.sizeBytes,
          state: asset.state,
          version: asset.version,
        };
      })
    );
    const commentRows = await Promise.all(
      comments.map(async (comment) => {
        const [commentReferences, commentAttachments, commentReactions] =
          await Promise.all([
            ctx.db
              .query("buildCollaborationReferences")
              .withIndex("by_ownerKind_and_ownerRecordId", (query) =>
                query
                  .eq("ownerKind", "actionItemComment")
                  .eq("ownerRecordId", comment._id)
              )
              .take(MAX_COMMENT_REFERENCES),
            ctx.db
              .query("buildCollaborationAttachments")
              .withIndex("by_ownerKind_and_ownerRecordId", (query) =>
                query
                  .eq("ownerKind", "actionItemComment")
                  .eq("ownerRecordId", comment._id)
              )
              .take(MAX_COMMENT_ATTACHMENTS),
            ctx.db
              .query("buildActionItemCommentReactions")
              .withIndex("by_commentId", (query) =>
                query.eq("commentId", comment._id)
              )
              .take(500),
          ]);
        const projectedReferences = await projectActionItemReferences(ctx, {
          authorization,
          references: commentReferences,
        });
        const projectedContent = projectCollaborationRevisionForViewer({
          references: projectedReferences.canonical,
          tiptapJson: comment.tiptapJson,
        });
        const projectedAttachments = await Promise.all(
          commentAttachments.map(async (attachment) => {
            if (attachment.attachmentKind !== "collaborationAsset") {
              return null;
            }
            const asset = await ctx.db.get(
              attachment.attachmentId as Id<"buildCollaborationAssets">
            );
            if (
              !asset ||
              (asset.state !== "available" && asset.state !== "superseded") ||
              !(await canUseCollaborationAssetForPost(ctx, {
                asset,
                authorization,
                post,
              }))
            ) {
              return null;
            }
            return {
              assetId: asset._id,
              fileName: asset.fileName,
              mimeType: asset.mimeType,
              sizeBytes: asset.sizeBytes,
              state: asset.state,
              version: asset.version,
            };
          })
        );
        const reactions = new Map<
          Doc<"buildActionItemCommentReactions">["reaction"],
          { count: number; viewerHasReacted: boolean }
        >();
        for (const reaction of commentReactions) {
          const current = reactions.get(reaction.reaction) ?? {
            count: 0,
            viewerHasReacted: false,
          };
          current.count += 1;
          current.viewerHasReacted ||=
            reaction.workosUserId === authorization.viewer.subject;
          reactions.set(reaction.reaction, current);
        }
        return {
          attachments: projectedAttachments.filter(
            (row): row is NonNullable<typeof row> => Boolean(row)
          ),
          authorDisplayName: comment.authorDisplayNameSnapshot,
          authorRole: comment.authorRole,
          commentId: comment._id,
          createdAt: comment.createdAt,
          plainText: projectedContent.plainText,
          parentCommentId: comment.parentCommentId,
          reactions: [...reactions.entries()].map(([reaction, summary]) => ({
            reaction,
            ...summary,
          })),
          references: projectedReferences.summaries,
          tiptapJson: projectedContent.tiptapJson,
        };
      })
    );
    const projectedRevisions = revisions.map((revision) => ({
      actorDisplayName: participantName(revision.actorWorkosUserId),
      actorRole: revision.actorRole,
      createdAt: revision.createdAt,
      reason: revision.reason,
      revision: revision.revision,
      snapshotJson: projectActionItemSnapshot(
        revision.snapshotJson,
        projectedItemReferences.canonical
      ),
    }));
    return {
      activity: events.map((event) => ({
        actorDisplayName: participantName(event.actorWorkosUserId),
        actorRole: event.actorRole,
        createdAt: event.createdAt,
        eventId: event._id,
        eventType: event.eventType,
        reason: event.reason,
        revision: event.revision,
      })),
      attachments: attachmentRows.filter(
        (row): row is NonNullable<typeof row> => Boolean(row)
      ),
      comments: commentRows,
      item: {
        actionItemId: item._id,
        assigneeDisplayName: item.assigneeWorkosUserId
          ? participantName(item.assigneeWorkosUserId)
          : undefined,
        assigneeWorkosUserId: item.assigneeWorkosUserId,
        assignmentState: item.assignmentState,
        audienceMode: post.audienceMode,
        blockedReason: item.blockedReason,
        completedAt: item.completedAt,
        completedByWorkosUserId: item.completedByWorkosUserId,
        completionAcceptedByWorkosUserId: item.completionAcceptedByWorkosUserId,
        completionRequestedAt: item.completionRequestedAt,
        completionRequestedByWorkosUserId:
          item.completionRequestedByWorkosUserId,
        createdAt: item.createdAt,
        creatorDisplayName: participantName(item.creatorWorkosUserId),
        creatorWorkosUserId: item.creatorWorkosUserId,
        currentRevision: item.currentRevision,
        descriptionPlainText: projectedItemContent.plainText,
        descriptionTiptapJson: projectedItemContent.tiptapJson,
        dueAt: item.dueAt,
        originatingPostId: item.originatingPostId,
        parentActionItemId: item.parentActionItemId,
        priority: item.priority,
        requiresAcceptance: actionItemRequiresAcceptance(item),
        status: item.status,
        systemPresentation,
        systemMode: item.systemMode,
        canonicalBuildMilestoneId: item.canonicalBuildMilestoneId,
        canonicalBuildSubmilestoneId: item.canonicalBuildSubmilestoneId,
        canonicalBindingRevision: item.canonicalBindingRevision,
        title: item.title,
        updatedAt: item.updatedAt,
        workKind: item.workKind ?? "ordinary",
      },
      labels: labels.map((label) => label.label),
      references: projectedItemReferences.summaries,
      revisions: projectedRevisions,
      state: "visible" as const,
    };
  })
  .public();

export const addBuildActionItemComment = authenticatedMutation
  .input({
    actionItemId: v.id("buildActionItems"),
    attachmentAssetIds: v.optional(v.array(v.id("buildCollaborationAssets"))),
    buildId: v.id("activeBuilds"),
    organizationId: v.string(),
    parentCommentId: v.optional(v.id("buildActionItemComments")),
    references: v.array(referenceInputValidator),
    tiptapJson: v.string(),
  })
  .returns(v.id("buildActionItemComments"))
  .handler(async (ctx, args) => {
    const authorization = await authorizeActiveBuildHumanCollaborationAccess(
      ctx,
      args
    );
    const item = await requireReadableActionItem(
      ctx,
      authorization,
      args.actionItemId
    );
    const post = await ctx.db.get(item.originatingPostId);
    if (!post) {
      throw new Error("Action Item parent post is unavailable.");
    }
    const readerIds = await resolveCurrentCollaborationPostReaderIds(
      ctx,
      authorization,
      post
    );
    const parentComment = args.parentCommentId
      ? await ctx.db.get(args.parentCommentId)
      : null;
    if (
      args.parentCommentId &&
      (!parentComment || parentComment.actionItemId !== item._id)
    ) {
      throw new Error("The reply target is unavailable for this Action Item.");
    }
    const references = await resolveCanonicalBuildCollaborationReferences(ctx, {
      authorization,
      readerIds,
      references: args.references,
    });
    const content = canonicalizeTiptapReferences(args.tiptapJson, references);
    if (content.plainText.length > MAX_COMMENT_TEXT_LENGTH) {
      throw new Error(
        `Action Item comments may not exceed ${MAX_COMMENT_TEXT_LENGTH} characters.`
      );
    }
    const now = Date.now();
    const commentId = await ctx.db.insert("buildActionItemComments", {
      actionItemId: item._id,
      authorDisplayNameSnapshot:
        authorization.participants.find(
          (participant) =>
            participant.workosUserId === authorization.viewer.subject
        )?.displayName ??
        authorization.viewer.email ??
        authorization.viewer.subject,
      authorRole: authorization.effectiveRole.role,
      authorWorkosUserId: authorization.viewer.subject,
      brokerageId: authorization.brokerage._id,
      buildId: authorization.build._id,
      createdAt: now,
      organizationId: authorization.organizationId,
      parentCommentId: parentComment?._id,
      plainText: content.plainText,
      tiptapJson: content.tiptapJson,
    });
    await persistCommentReferences(ctx, {
      authorization,
      commentId,
      now,
      postId: post._id,
      references,
    });
    await persistGovernedCollaborationAssetAttachments(ctx, {
      assetIds: args.attachmentAssetIds ?? [],
      authorization,
      command: "add_build_action_item_comment",
      maxAttachments: MAX_COMMENT_ATTACHMENTS,
      now,
      ownerKind: "actionItemComment",
      ownerRecordId: commentId,
      post,
      readerWorkosUserIds: readerIds,
      unavailableMessage:
        "One or more Action Item comment attachments are unavailable.",
    });
    await Promise.all([
      ctx.db.insert("buildActionItemEvents", {
        actionItemId: item._id,
        actorRole: authorization.effectiveRole.role,
        actorWorkosUserId: authorization.viewer.subject,
        brokerageId: authorization.brokerage._id,
        buildId: authorization.build._id,
        createdAt: now,
        eventType: "comment_added",
        exercisedAuthority: "reader",
        newState: JSON.stringify({ commentId }),
        organizationId: authorization.organizationId,
        revision: item.currentRevision,
      }),
      ctx.db.patch(post._id, {
        lastMeaningfulActivityAt: now,
        latestActivityActorWorkosUserId: authorization.viewer.subject,
        updatedAt: now,
      }),
    ]);
    const mentionedIds = new Set(
      references
        .filter((reference) => reference.entityKind === "participant")
        .map((reference) => reference.entityId)
    );
    const recipients = new Set(
      [
        item.creatorWorkosUserId,
        item.assigneeWorkosUserId,
        parentComment?.authorWorkosUserId,
        ...mentionedIds,
      ].filter((value): value is string => Boolean(value))
    );
    for (const recipientWorkosUserId of recipients) {
      const kind = mentionedIds.has(recipientWorkosUserId)
        ? "direct_mention"
        : parentComment?.authorWorkosUserId === recipientWorkosUserId
          ? "followed_reply"
          : "ordinary_activity";
      await emitCanonicalBuildCollaborationNotification(ctx, {
        actionItemId: item._id,
        actionLabel: "Open Action Item",
        authorization,
        body: content.plainText,
        dedupeKey: `action-item-comment:${commentId}:${kind}:${recipientWorkosUserId}`,
        entityId: String(commentId),
        entityLabel: item.title,
        entityType: "buildActionItemComment",
        href: buildCollaborationDeepLink({
          buildId: authorization.build._id,
          focus: `actionItem:${item._id}`,
          recipientRole: authorization.participants.find(
            (participant) => participant.workosUserId === recipientWorkosUserId
          )?.role,
        }),
        kind,
        now,
        postId: post._id,
        readerIds,
        recipientWorkosUserId,
        title: parentComment
          ? "New Action Item reply"
          : "New Action Item comment",
      });
    }
    return commentId;
  })
  .public();

export const toggleBuildActionItemCommentReaction = authenticatedMutation
  .input({
    actionItemId: v.id("buildActionItems"),
    buildId: v.id("activeBuilds"),
    commentId: v.id("buildActionItemComments"),
    organizationId: v.string(),
    reaction: buildCollaborationReactionValidator,
  })
  .returns(v.boolean())
  .handler(async (ctx, args) => {
    const authorization = await authorizeActiveBuildHumanCollaborationAccess(
      ctx,
      args
    );
    await requireReadableActionItem(ctx, authorization, args.actionItemId);
    const comment = await ctx.db.get(args.commentId);
    if (!comment || comment.actionItemId !== args.actionItemId) {
      throw new Error("Action Item comment is unavailable.");
    }
    const existing = await ctx.db
      .query("buildActionItemCommentReactions")
      .withIndex("by_commentId_and_workosUserId_and_reaction", (query) =>
        query
          .eq("commentId", comment._id)
          .eq("workosUserId", authorization.viewer.subject)
          .eq("reaction", args.reaction)
      )
      .first();
    if (existing) {
      await ctx.db.delete(existing._id);
      return false;
    }
    await ctx.db.insert("buildActionItemCommentReactions", {
      actionItemId: args.actionItemId,
      brokerageId: authorization.brokerage._id,
      buildId: authorization.build._id,
      commentId: comment._id,
      createdAt: Date.now(),
      organizationId: authorization.organizationId,
      reaction: args.reaction,
      workosUserId: authorization.viewer.subject,
    });
    return true;
  })
  .public();

async function projectActionItemReferences(
  ctx: QueryCtx,
  input: {
    authorization: Awaited<
      ReturnType<typeof authorizeActiveBuildCollaborationAccess>
    >;
    references: Doc<"buildCollaborationReferences">[];
  }
) {
  const canonical: CanonicalBuildCollaborationReference[] = [];
  const summaries: ReturnType<typeof referenceSummary>[] = [];
  for (const reference of input.references) {
    if (
      reference.organizationId !== input.authorization.organizationId ||
      reference.brokerageId !== input.authorization.brokerage._id ||
      reference.buildId !== input.authorization.build._id
    ) {
      continue;
    }
    try {
      const current = await resolveCurrentBuildCollaborationReference(ctx, {
        authorization: input.authorization,
        entityId: reference.entityId,
        entityKind: reference.entityKind,
      });
      canonical.push(current);
      summaries.push({
        entityId: current.entityId,
        entityKind: current.entityKind,
        label: current.label,
        primary: reference.primary,
        summary: current.summary,
      });
    } catch {
      summaries.push({
        entityId: reference.entityId,
        entityKind: reference.entityKind,
        label: "Unavailable reference",
        primary: reference.primary,
        summary: undefined,
      });
    }
  }
  return { canonical, summaries };
}

function projectActionItemSnapshot(
  snapshotJson: string,
  references: CanonicalBuildCollaborationReference[]
) {
  try {
    const snapshot = JSON.parse(snapshotJson) as Record<string, unknown>;
    if (typeof snapshot.descriptionTiptapJson !== "string") {
      return snapshotJson;
    }
    const projected = projectCollaborationRevisionForViewer({
      references,
      tiptapJson: snapshot.descriptionTiptapJson,
    });
    return JSON.stringify({
      ...snapshot,
      descriptionPlainText: projected.plainText,
      descriptionTiptapJson: projected.tiptapJson,
    });
  } catch {
    return JSON.stringify({
      descriptionPlainText: "This revision is unavailable.",
      descriptionTiptapJson: JSON.stringify({
        content: [
          {
            content: [{ text: "This revision is unavailable.", type: "text" }],
            type: "paragraph",
          },
        ],
        type: "doc",
      }),
      title: "Unavailable revision",
    });
  }
}

function referenceSummary(reference: {
  entityId: string;
  entityKind: CanonicalBuildCollaborationReference["entityKind"];
  labelSnapshot: string;
  primary: boolean;
  summarySnapshot?: string;
}) {
  return {
    entityId: reference.entityId,
    entityKind: reference.entityKind,
    label: reference.labelSnapshot,
    primary: reference.primary,
    summary: reference.summarySnapshot,
  };
}

async function persistCommentReferences(
  ctx: MutationCtx,
  input: {
    authorization: Awaited<
      ReturnType<typeof authorizeActiveBuildCollaborationAccess>
    >;
    commentId: Id<"buildActionItemComments">;
    now: number;
    postId: Id<"buildCollaborationPosts">;
    references: CanonicalBuildCollaborationReference[];
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
      ownerKind: "actionItemComment",
      ownerRecordId: input.commentId,
      postId: input.postId,
      primary: reference.primary ?? false,
      summarySnapshot: reference.summary,
    });
  }
}
