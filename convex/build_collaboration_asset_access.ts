import type { ActiveBuildAuthorization } from "./activeBuildAccess";
import {
  canReadCollaborationPost,
  resolveCurrentCollaborationPostReaderIds,
} from "./build_collaboration_access";
import { canReadDrawCoordination } from "./build_draw_coordination";
import { canReadMilestoneSystemActionItem } from "./build_collaboration_system_event_access";
import type { Doc, QueryCtx } from "./types";

export async function canUseCollaborationAssetForPost(
  ctx: QueryCtx,
  input: {
    asset: Doc<"buildCollaborationAssets">;
    authorization: ActiveBuildAuthorization;
    post: Doc<"buildCollaborationPosts">;
  }
) {
  if (
    input.asset.organizationId !== input.authorization.organizationId ||
    input.asset.brokerageId !== input.authorization.brokerage._id ||
    input.asset.buildId !== input.authorization.build._id ||
    !isCleanCollaborationAsset(input.asset) ||
    input.post.organizationId !== input.authorization.organizationId ||
    input.post.brokerageId !== input.authorization.brokerage._id ||
    input.post.buildId !== input.authorization.build._id
  ) {
    return false;
  }
  if (
    input.post.systemPostKind === "draw" &&
    !(await canReadDrawCoordination(ctx, {
      authorization: input.authorization,
      post: input.post,
    }))
  ) {
    return false;
  }
  const ownerAttachments = await ctx.db
    .query("buildCollaborationAttachments")
    .withIndex("by_buildId_and_attachmentKind_and_attachmentId", (query) =>
      query
        .eq("buildId", input.authorization.build._id)
        .eq("attachmentKind", "collaborationAsset")
        .eq("attachmentId", input.asset._id)
    )
    .take(100);
  for (const attachment of ownerAttachments) {
    const actionItem = await attachmentActionItem(ctx, attachment);
    if (
      actionItem &&
      !(await canReadMilestoneSystemActionItem(ctx, {
        actionItem,
        buildId: input.authorization.build._id,
        role: input.authorization.effectiveRole.role,
        workosUserId: input.authorization.viewer.subject,
      }))
    ) {
      return false;
    }
  }
  if (input.asset.originatingPostId === input.post._id) {
    return true;
  }
  const destinationReaderIds = await resolveCurrentCollaborationPostReaderIds(
    ctx,
    input.authorization,
    input.post
  );
  if (input.asset.readerWorkosUserIds) {
    const assetReaders = new Set(input.asset.readerWorkosUserIds);
    return destinationReaderIds.every((readerId) => assetReaders.has(readerId));
  }
  if (input.asset.maximumAudienceMode === "build_wide") {
    return true;
  }
  return false;
}

export function isCleanCollaborationAsset(
  asset: Doc<"buildCollaborationAssets">
) {
  return (
    asset.scanState === "clean" &&
    Boolean(asset.contentHashSha256) &&
    !asset.storageDeletedAt &&
    (asset.state === "available" || asset.state === "superseded")
  );
}

export async function canReadCollaborationAsset(
  ctx: QueryCtx,
  input: {
    asset: Doc<"buildCollaborationAssets">;
    authorization: ActiveBuildAuthorization;
  }
) {
  return Boolean(await resolveCollaborationAssetReadDecision(ctx, input));
}

export async function resolveCollaborationAssetReadDecision(
  ctx: QueryCtx,
  input: {
    asset: Doc<"buildCollaborationAssets">;
    authorization: ActiveBuildAuthorization;
  }
) {
  if (
    input.asset.organizationId !== input.authorization.organizationId ||
    input.asset.brokerageId !== input.authorization.brokerage._id ||
    input.asset.buildId !== input.authorization.build._id ||
    !isCleanCollaborationAsset(input.asset)
  ) {
    return null;
  }
  if (
    input.asset.readerWorkosUserIds &&
    !input.asset.readerWorkosUserIds.includes(
      input.authorization.viewer.subject
    )
  ) {
    return null;
  }
  const attachments = await ctx.db
    .query("buildCollaborationAttachments")
    .withIndex("by_buildId_and_attachmentKind_and_attachmentId", (query) =>
      query
        .eq("buildId", input.authorization.build._id)
        .eq("attachmentKind", "collaborationAsset")
        .eq("attachmentId", input.asset._id)
    )
    .take(100);
  for (const attachment of attachments) {
    const post = await attachmentPost(ctx, attachment);
    const actionItem = await attachmentActionItem(ctx, attachment);
    if (
      actionItem &&
      !(await canReadMilestoneSystemActionItem(ctx, {
        actionItem,
        buildId: input.authorization.build._id,
        role: input.authorization.effectiveRole.role,
        workosUserId: input.authorization.viewer.subject,
      }))
    ) {
      continue;
    }
    if (
      post &&
      (await canReadCollaborationPost(ctx, input.authorization, post)) &&
      (post.systemPostKind !== "draw" ||
        (await canReadDrawCoordination(ctx, {
          authorization: input.authorization,
          post,
        })))
    ) {
      return {
        attachmentId: attachment._id,
        basis: input.asset.readerWorkosUserIds
          ? ("published_reader_snapshot_and_attachment_acl" as const)
          : ("attachment_acl" as const),
        postId: post._id,
      };
    }
  }
  const session = input.asset.stagingSessionId
    ? await ctx.db.get(input.asset.stagingSessionId)
    : null;
  if (
    session &&
    (session.contextKind === "post" || session.contextKind === "actionItem") &&
    session.contextRecordId
  ) {
    const postId =
      session.contextKind === "post"
        ? ctx.db.normalizeId("buildCollaborationPosts", session.contextRecordId)
        : null;
    const actionItemId =
      session.contextKind === "actionItem"
        ? ctx.db.normalizeId("buildActionItems", session.contextRecordId)
        : null;
    const actionItem = actionItemId ? await ctx.db.get(actionItemId) : null;
    const post = postId
      ? await ctx.db.get(postId)
      : actionItem
        ? await ctx.db.get(actionItem.originatingPostId)
        : null;
    if (
      post?.systemPostKind === "draw" &&
      !(await canReadDrawCoordination(ctx, {
        authorization: input.authorization,
        post,
      }))
    ) {
      return null;
    }
  }
  if (
    !session ||
    session.organizationId !== input.authorization.organizationId ||
    session.buildId !== input.authorization.build._id ||
    session.state !== "finalized" ||
    session.expiresAt <= Date.now()
  ) {
    return null;
  }
  if (session.ownerWorkosUserId === input.authorization.viewer.subject) {
    return {
      basis: "staging_session_owner" as const,
      stagingSessionId: session._id,
    };
  }
  if (await isDraftApprovalOwner(ctx, input.authorization, session)) {
    return {
      basis: "draft_approval_owner" as const,
      draftId: session.contextRecordId,
      stagingSessionId: session._id,
    };
  }
  return null;
}

async function isDraftApprovalOwner(
  ctx: QueryCtx,
  authorization: ActiveBuildAuthorization,
  session: Doc<"buildCollaborationAssetStagingSessions">
) {
  if (
    authorization.viewer.actorKind !== "human" ||
    session.contextKind !== "draft" ||
    !session.contextRecordId
  ) {
    return false;
  }
  const draftId = ctx.db.normalizeId(
    "buildCollaborationDrafts",
    session.contextRecordId
  );
  const draft = draftId ? await ctx.db.get(draftId) : null;
  return Boolean(
    draft &&
      draft.organizationId === authorization.organizationId &&
      draft.buildId === authorization.build._id &&
      draft.approvalOwnerWorkosUserId === authorization.viewer.subject
  );
}

async function attachmentPost(
  ctx: QueryCtx,
  attachment: Doc<"buildCollaborationAttachments">
): Promise<Doc<"buildCollaborationPosts"> | null> {
  if (attachment.ownerKind === "postRevision") {
    const revisionId = ctx.db.normalizeId(
      "buildCollaborationPostRevisions",
      attachment.ownerRecordId
    );
    const revision = revisionId ? await ctx.db.get(revisionId) : null;
    return revision ? await ctx.db.get(revision.postId) : null;
  }
  if (attachment.ownerKind === "commentRevision") {
    const revisionId = ctx.db.normalizeId(
      "buildCollaborationCommentRevisions",
      attachment.ownerRecordId
    );
    const revision = revisionId ? await ctx.db.get(revisionId) : null;
    return revision ? await ctx.db.get(revision.postId) : null;
  }
  if (attachment.ownerKind === "actionItem") {
    const actionItemId = ctx.db.normalizeId(
      "buildActionItems",
      attachment.ownerRecordId
    );
    const actionItem = actionItemId ? await ctx.db.get(actionItemId) : null;
    return actionItem ? await ctx.db.get(actionItem.originatingPostId) : null;
  }
  const commentId = ctx.db.normalizeId(
    "buildActionItemComments",
    attachment.ownerRecordId
  );
  const comment = commentId ? await ctx.db.get(commentId) : null;
  const actionItem = comment ? await ctx.db.get(comment.actionItemId) : null;
  return actionItem ? await ctx.db.get(actionItem.originatingPostId) : null;
}

async function attachmentActionItem(
  ctx: QueryCtx,
  attachment: Doc<"buildCollaborationAttachments">
) {
  if (attachment.ownerKind === "actionItem") {
    const actionItemId = ctx.db.normalizeId(
      "buildActionItems",
      attachment.ownerRecordId
    );
    return actionItemId ? await ctx.db.get(actionItemId) : null;
  }
  if (attachment.ownerKind !== "actionItemComment") {
    return null;
  }
  const commentId = ctx.db.normalizeId(
    "buildActionItemComments",
    attachment.ownerRecordId
  );
  const comment = commentId ? await ctx.db.get(commentId) : null;
  return comment ? await ctx.db.get(comment.actionItemId) : null;
}
