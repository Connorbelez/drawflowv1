import type { ActiveBuildAuthorization } from "./activeBuildAccess";
import {
  canReadCollaborationPost,
  resolveCurrentCollaborationPostReaderIds,
} from "./build_collaboration_access";
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
  if (
    input.asset.organizationId !== input.authorization.organizationId ||
    input.asset.brokerageId !== input.authorization.brokerage._id ||
    input.asset.buildId !== input.authorization.build._id ||
    !isCleanCollaborationAsset(input.asset)
  ) {
    return false;
  }
  if (
    input.asset.readerWorkosUserIds &&
    !input.asset.readerWorkosUserIds.includes(
      input.authorization.viewer.subject
    )
  ) {
    return false;
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
    if (
      post &&
      (await canReadCollaborationPost(ctx, input.authorization, post))
    ) {
      return true;
    }
  }
  const session = input.asset.stagingSessionId
    ? await ctx.db.get(input.asset.stagingSessionId)
    : null;
  return Boolean(
    session &&
      session.organizationId === input.authorization.organizationId &&
      session.buildId === input.authorization.build._id &&
      (session.ownerWorkosUserId === input.authorization.viewer.subject ||
        (await isDraftApprovalOwner(ctx, input.authorization, session))) &&
      session.state === "finalized" &&
      session.expiresAt > Date.now()
  );
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
