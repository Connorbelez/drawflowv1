import type { ActiveBuildAuthorization } from "./activeBuildAccess";
import {
  canReadCollaborationPost,
  resolveCurrentCollaborationPostReaderIds,
} from "./build_collaboration_access";
import { canReadDrawCoordination } from "./build_draw_coordination";
import { canReadMilestoneSystemActionItem } from "./build_collaboration_system_event_access";
import {
  canReadSubmittedCostDocument,
  resolveCostDocumentDraftAccessForAuthorization,
} from "./cost_document_access";
import type { Doc, QueryCtx } from "./types";

const ASSET_ATTACHMENT_PAGE_SIZE = 100;
const MAX_ASSET_ATTACHMENT_ROWS = 1_000;

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
  const ownerAttachments = await listAssetAttachments(
    ctx,
    input.authorization.build._id,
    input.asset._id
  );
  if (!ownerAttachments) {
    return false;
  }
  for (const attachment of ownerAttachments) {
    const attachmentPostRecord = await attachmentPost(ctx, attachment);
    if (!attachmentPostRecord || attachmentPostRecord._id !== input.post._id) {
      continue;
    }
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
  const session = input.asset.stagingSessionId
    ? await ctx.db.get(input.asset.stagingSessionId)
    : null;
  // Cost Document assets are governed by the live exact-Draft/submitted-document
  // audience, so that decision is evaluated before the uploader reader snapshot
  // or attachment ACLs.
  const costDocumentDecision = await costDocumentAssetReadDecision(
    ctx,
    input,
    session
  );
  if (costDocumentDecision.decision) {
    return costDocumentDecision.decision;
  }
  // A Cost Document source asset must never fall through to a stale uploader
  // reader snapshot or generic session-owner decision once its exact Draft or
  // submitted-document authorization says no.
  if (costDocumentDecision.governed) {
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
  const attachments = await listAssetAttachments(
    ctx,
    input.authorization.build._id,
    input.asset._id
  );
  if (!attachments) {
    return null;
  }
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
  if (
    session &&
    !(await canReadAssetStagingContext(ctx, input.authorization, session))
  ) {
    return null;
  }
  if (
    !session ||
    session.organizationId !== input.authorization.organizationId ||
    session.buildId !== input.authorization.build._id
  ) {
    return null;
  }
  if (session.state !== "finalized" || session.expiresAt <= Date.now()) {
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

export async function canReadAssetStagingContext(
  ctx: QueryCtx,
  authorization: ActiveBuildAuthorization,
  session: Doc<"buildCollaborationAssetStagingSessions">
) {
  if (
    (session.contextKind !== "post" && session.contextKind !== "actionItem") ||
    !session.contextRecordId
  ) {
    return true;
  }
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
    !post ||
    post.organizationId !== authorization.organizationId ||
    post.brokerageId !== authorization.brokerage._id ||
    post.buildId !== authorization.build._id
  ) {
    return false;
  }
  if (
    actionItem &&
    !(await canReadMilestoneSystemActionItem(ctx, {
      actionItem,
      buildId: authorization.build._id,
      role: authorization.effectiveRole.role,
      workosUserId: authorization.viewer.subject,
    }))
  ) {
    return false;
  }
  if (!(await canReadCollaborationPost(ctx, authorization, post))) {
    return false;
  }
  if (post.systemPostKind !== "draw") {
    return true;
  }
  return await canReadDrawCoordination(ctx, { authorization, post });
}

async function listAssetAttachments(
  ctx: QueryCtx,
  buildId: Doc<"activeBuilds">["_id"],
  assetId: Doc<"buildCollaborationAssets">["_id"]
) {
  const queryFactory = () =>
    ctx.db
      .query("buildCollaborationAttachments")
      .withIndex("by_buildId_and_attachmentKind_and_attachmentId", (builder) =>
        builder
          .eq("buildId", buildId)
          .eq("attachmentKind", "collaborationAsset")
          .eq("attachmentId", assetId)
      );
  const attachments: Doc<"buildCollaborationAttachments">[] = [];
  let cursor: string | null = null;
  for (;;) {
    const page = await queryFactory().paginate({
      cursor,
      numItems: ASSET_ATTACHMENT_PAGE_SIZE,
    });
    attachments.push(...page.page);
    if (attachments.length > MAX_ASSET_ATTACHMENT_ROWS) {
      return null;
    }
    if (page.isDone) {
      return attachments;
    }
    cursor = page.continueCursor;
  }
}

async function costDocumentAssetReadDecision(
  ctx: QueryCtx,
  input: {
    asset: Doc<"buildCollaborationAssets">;
    authorization: ActiveBuildAuthorization;
  },
  session: Doc<"buildCollaborationAssetStagingSessions"> | null
) {
  const submittedPages = await ctx.db
    .query("costDocumentPages")
    .withIndex("by_buildId_and_assetId", (query) =>
      query
        .eq("buildId", input.authorization.build._id)
        .eq("assetId", input.asset._id)
    )
    .take(101);
  if (submittedPages.length > 100) {
    return { decision: null, governed: true };
  }
  if (submittedPages.length > 0) {
    for (const page of submittedPages) {
      const document = await ctx.db.get(page.costDocumentId);
      if (
        page.organizationId === input.authorization.organizationId &&
        page.brokerageId === input.authorization.brokerage._id &&
        page.buildId === input.authorization.build._id &&
        document &&
        (await canReadSubmittedCostDocument(ctx, input.authorization, document))
      ) {
        return {
          decision: {
            basis: "cost_document_submitted_page" as const,
            costDocumentId: document._id,
          },
          governed: true,
        };
      }
    }
    return { decision: null, governed: true };
  }
  if (
    !session ||
    session.contextKind !== "costDocumentDraft" ||
    !session.contextRecordId
  ) {
    return { decision: null, governed: false };
  }
  const draftId = ctx.db.normalizeId(
    "costDocumentDrafts",
    session.contextRecordId
  );
  if (!draftId) {
    return { decision: null, governed: true };
  }
  const access = await resolveCostDocumentDraftAccessForAuthorization(ctx, {
    authorization: input.authorization,
    draftId,
  });
  if (
    !access ||
    session.organizationId !== input.authorization.organizationId ||
    session.brokerageId !== input.authorization.brokerage._id ||
    session.buildId !== input.authorization.build._id
  ) {
    return { decision: null, governed: true };
  }
  const pages = await ctx.db
    .query("costDocumentDraftPages")
    .withIndex("by_assetId_and_state", (query) =>
      query.eq("assetId", input.asset._id).eq("state", "active")
    )
    .take(2);
  if (pages.length > 1) {
    return { decision: null, governed: true };
  }
  const page = pages[0];
  if (page) {
    if (
      page.draftId !== access.draft._id ||
      page.batchId !== access.batch._id ||
      page.organizationId !== input.authorization.organizationId ||
      page.brokerageId !== input.authorization.brokerage._id ||
      page.buildId !== input.authorization.build._id
    ) {
      return { decision: null, governed: true };
    }
    return {
      decision: {
        basis: "cost_document_draft_access" as const,
        draftId: access.draft._id,
        stagingSessionId: session._id,
      },
      governed: true,
    };
  }
  if (
    session.ownerWorkosUserId === input.authorization.viewer.subject &&
    session.state === "finalized" &&
    session.expiresAt > Date.now()
  ) {
    return {
      decision: {
        basis: "cost_document_draft_session_owner" as const,
        draftId: access.draft._id,
        stagingSessionId: session._id,
      },
      governed: true,
    };
  }
  return { decision: null, governed: true };
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
