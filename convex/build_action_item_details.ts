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
import { projectCollaborationRevisionForViewer } from "./build_collaboration_content";
import { canonicalizeTiptapReferences } from "./build_collaboration_publication_bundle";
import {
  type CanonicalBuildCollaborationReference,
  resolveCanonicalBuildCollaborationReferences,
  resolveCurrentBuildCollaborationReference,
} from "./build_collaboration_references";
import { authorizeActiveBuildCollaborationAccess } from "./build_collaboration_rollout";
import {
  buildActionAssignmentStateValidator,
  buildActionItemPriorityValidator,
  buildActionItemStatusValidator,
  buildActionItemWorkKindValidator,
  buildCollaborationAssetStateValidator,
  buildCollaborationAudienceModeValidator,
  buildCollaborationReferenceKindValidator,
  buildCollaborationRoleValidator,
} from "./build_collaboration_validators";
import type { Doc, Id, MutationCtx, QueryCtx } from "./types";

const MAX_DETAIL_EVENTS = 500;
const MAX_DETAIL_REVISIONS = 250;
const MAX_DETAIL_COMMENTS = 500;
const MAX_COMMENT_REFERENCES = 50;
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
        url: v.union(v.string(), v.null()),
      })
    ),
    comments: v.array(
      v.object({
        authorDisplayName: v.string(),
        authorRole: buildCollaborationRoleValidator,
        commentId: v.id("buildActionItemComments"),
        createdAt: v.number(),
        plainText: v.string(),
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
          asset.state !== "available" ||
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
          url: await ctx.storage.getUrl(asset.storageId),
        };
      })
    );
    const commentRows = await Promise.all(
      comments.map(async (comment) => {
        const commentReferences = await ctx.db
          .query("buildCollaborationReferences")
          .withIndex("by_ownerKind_and_ownerRecordId", (query) =>
            query
              .eq("ownerKind", "actionItemComment")
              .eq("ownerRecordId", comment._id)
          )
          .take(MAX_COMMENT_REFERENCES);
        const projectedReferences = await projectActionItemReferences(ctx, {
          authorization,
          references: commentReferences,
        });
        const projectedContent = projectCollaborationRevisionForViewer({
          references: projectedReferences.canonical,
          tiptapJson: comment.tiptapJson,
        });
        return {
          authorDisplayName: comment.authorDisplayNameSnapshot,
          authorRole: comment.authorRole,
          commentId: comment._id,
          createdAt: comment.createdAt,
          plainText: projectedContent.plainText,
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
    buildId: v.id("activeBuilds"),
    organizationId: v.string(),
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
    return commentId;
  })
  .public();

export const generateBuildActionItemAttachmentUploadUrl = authenticatedMutation
  .input({
    buildId: v.id("activeBuilds"),
    organizationId: v.string(),
    postId: v.id("buildCollaborationPosts"),
  })
  .returns(v.string())
  .handler(async (ctx, args) => {
    const authorization = await authorizeActiveBuildHumanCollaborationAccess(
      ctx,
      args
    );
    const post = await ctx.db.get(args.postId);
    if (
      !post ||
      post.buildId !== authorization.build._id ||
      !(await canReadCollaborationPost(ctx, authorization, post))
    ) {
      throw new Error("Action Item parent post is unavailable.");
    }
    return await ctx.storage.generateUploadUrl();
  })
  .public();

export const registerBuildActionItemAttachment = authenticatedMutation
  .input({
    buildId: v.id("activeBuilds"),
    fileName: v.string(),
    mimeType: v.optional(v.string()),
    organizationId: v.string(),
    postId: v.id("buildCollaborationPosts"),
    storageId: v.id("_storage"),
  })
  .returns(v.id("buildCollaborationAssets"))
  .handler(async (ctx, args) => {
    const authorization = await authorizeActiveBuildHumanCollaborationAccess(
      ctx,
      args
    );
    const post = await ctx.db.get(args.postId);
    if (
      !post ||
      post.buildId !== authorization.build._id ||
      !(await canReadCollaborationPost(ctx, authorization, post))
    ) {
      throw new Error("Action Item parent post is unavailable.");
    }
    const metadata = await ctx.db.system.get(args.storageId);
    if (!metadata) {
      throw new Error("Uploaded Action Item attachment is unavailable.");
    }
    const fileName = args.fileName.trim();
    if (!(fileName && fileName.length <= 240)) {
      throw new Error("Attachment file names must be 1–240 characters.");
    }
    const now = Date.now();
    const readerWorkosUserIds = await resolveCurrentCollaborationPostReaderIds(
      ctx,
      authorization,
      post
    );
    return await ctx.db.insert("buildCollaborationAssets", {
      brokerageId: authorization.brokerage._id,
      buildId: authorization.build._id,
      createdAt: now,
      fileName,
      maximumAudienceMode: post.audienceMode,
      mimeType:
        metadata.contentType ??
        args.mimeType?.trim() ??
        "application/octet-stream",
      organizationId: authorization.organizationId,
      originatingPostId: post._id,
      readerWorkosUserIds: [...new Set(readerWorkosUserIds)].sort(),
      sizeBytes: metadata.size,
      state: "available",
      storageId: args.storageId,
      updatedAt: now,
      uploadedByWorkosUserId: authorization.viewer.subject,
      version: 1,
    });
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
