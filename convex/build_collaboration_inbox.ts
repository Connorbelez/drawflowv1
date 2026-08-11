import {
  paginationOptsValidator,
  paginationResultValidator,
} from "convex/server";
import { v } from "convex/values";
import type { ActiveBuildAuthorization } from "./activeBuildAccess";
import type { AuthorizedViewer } from "./authz";
import { authenticatedMutation, authenticatedQuery } from "./authz";
import { requireReadableActionItem } from "./build_action_items";
import { canReadCollaborationPost } from "./build_collaboration_access";
import { buildCollaborationDeepLink } from "./build_collaboration_links";
import type { BuildCollaborationNotificationKind } from "./build_collaboration_notifications";
import { resolveCurrentBuildCollaborationReference } from "./build_collaboration_references";
import { authorizeActiveBuildCollaborationAccess } from "./build_collaboration_rollout";
import { canReadDrawCoordination } from "./build_draw_coordination";
import type { Doc, Id, QueryCtx } from "./types";

const recipientDeliveryStatusValidator = v.union(
  v.literal("unread"),
  v.literal("read"),
  v.literal("dismissed"),
  v.literal("resolved")
);

const recipientDeliveryProjectionValidator = v.object({
  _id: v.id("recipientDeliveries"),
  actionLabel: v.string(),
  actionRequired: v.boolean(),
  body: v.string(),
  createdAt: v.number(),
  entityId: v.string(),
  entityLabel: v.string(),
  entityType: v.string(),
  href: v.string(),
  resolutionMode: v.union(v.literal("domain"), v.literal("recipient")),
  sourceLabel: v.string(),
  status: recipientDeliveryStatusValidator,
  title: v.string(),
  updatedAt: v.number(),
});

interface CollaborationDeliverySourceRevision {
  commentRevisionId?: Id<"buildCollaborationCommentRevisions">;
  postRevisionId?: Id<"buildCollaborationPostRevisions">;
  requireExact?: boolean;
}

export const listRecipientInbox = authenticatedQuery
  .input({
    includeResolved: v.optional(v.boolean()),
    paginationOpts: paginationOptsValidator,
    workosOrganizationId: v.string(),
  })
  .returns(paginationResultValidator(recipientDeliveryProjectionValidator))
  .handler(async (ctx, args) => {
    const brokerage = await authorizeInboxOrganization(
      ctx,
      args.workosOrganizationId
    );
    const records = await ctx.db
      .query("recipientDeliveries")
      .withIndex("by_recipient", (query) =>
        query
          .eq("organizationId", args.workosOrganizationId)
          .eq("recipientWorkosUserId", ctx.viewer.subject)
      )
      .order("desc")
      .paginate({
        cursor: args.paginationOpts.cursor,
        numItems: Math.min(100, Math.max(1, args.paginationOpts.numItems)),
      });
    const visibleRecords = args.includeResolved
      ? records.page.filter((record) => record.inAppVisible !== false)
      : records.page.filter(
          (record) =>
            record.inAppVisible !== false &&
            record.status !== "dismissed" &&
            record.status !== "resolved"
        );
    const deliveries: ReturnType<typeof projectStoredDelivery>[] = [];
    for (const record of visibleRecords) {
      if (record.brokerageId !== brokerage._id) {
        continue;
      }
      const projected = await projectReadableDelivery(ctx, record);
      if (projected) {
        deliveries.push(projected);
      }
    }
    return { ...records, page: deliveries };
  })
  .public();

export const markBuildActionItemActivityRead = authenticatedMutation
  .input({
    actionItemId: v.id("buildActionItems"),
    buildId: v.id("activeBuilds"),
    organizationId: v.string(),
  })
  .returns(v.number())
  .handler(async (ctx, args) => {
    const authorization = await authorizeActiveBuildCollaborationAccess(
      ctx,
      args
    );
    await requireReadableActionItem(ctx, authorization, args.actionItemId);
    const unread = await ctx.db
      .query("recipientDeliveries")
      .withIndex("by_recipient_actionItem_status", (query) =>
        query
          .eq("organizationId", authorization.organizationId)
          .eq("recipientWorkosUserId", authorization.viewer.subject)
          .eq("collaborationActionItemId", args.actionItemId)
          .eq("status", "unread")
      )
      .take(501);
    if (unread.length > 500) {
      throw new Error("Action Item unread activity exceeds the safe limit.");
    }
    const now = Date.now();
    for (const delivery of unread) {
      if (
        delivery.brokerageId === authorization.brokerage._id &&
        delivery.collaborationBuildId === authorization.build._id &&
        delivery.inAppVisible !== false
      ) {
        await ctx.db.patch(delivery._id, { status: "read", updatedAt: now });
      }
    }
    return unread.length;
  })
  .public();

export async function authorizeInboxOrganization(
  ctx: QueryCtx & { viewer: AuthorizedViewer },
  organizationId: string
) {
  const normalizedOrganizationId = organizationId.trim();
  const tokenMatches =
    ctx.viewer.organizationId?.trim() === normalizedOrganizationId;
  const membership = tokenMatches
    ? null
    : await ctx.db
        .query("workosOrganizationMemberships")
        .withIndex("by_user", (query) =>
          query.eq("workosUserId", ctx.viewer.subject)
        )
        .filter((query) =>
          query.eq(
            query.field("workosOrganizationId"),
            normalizedOrganizationId
          )
        )
        .first();
  if (!(tokenMatches || membership?.status === "active")) {
    throw new Error("Forbidden: WorkOS membership");
  }
  const brokerage = await ctx.db
    .query("brokerages")
    .withIndex("by_workos_organization", (query) =>
      query.eq("workosOrganizationId", normalizedOrganizationId)
    )
    .unique();
  if (!brokerage || brokerage.status !== "active") {
    throw new Error("Forbidden: brokerage");
  }
  return brokerage;
}

async function projectReadableDelivery(
  ctx: QueryCtx & { viewer: AuthorizedViewer },
  record: Doc<"recipientDeliveries">
) {
  if (!record.collaborationBuildId) {
    return projectStoredDelivery(record);
  }
  try {
    const authorization = await authorizeActiveBuildCollaborationAccess(ctx, {
      buildId: record.collaborationBuildId,
      organizationId: record.organizationId,
    });
    return await projectAuthorizedCollaborationDelivery(
      ctx,
      authorization,
      record
    );
  } catch {
    return null;
  }
}

export async function projectAuthorizedCollaborationDelivery(
  ctx: QueryCtx,
  authorization: ActiveBuildAuthorization,
  record: Doc<"recipientDeliveries">,
  sourceRevision?: CollaborationDeliverySourceRevision
) {
  if (!matchesAuthorizedDelivery(authorization, record)) {
    return null;
  }
  if (
    !(await canReadAttachedNotificationContext(
      ctx,
      authorization,
      record,
      sourceRevision
    ))
  ) {
    return null;
  }
  if (record.collaborationBuildSubmilestoneId) {
    try {
      const reference = await resolveCurrentBuildCollaborationReference(ctx, {
        authorization,
        entityId: record.collaborationBuildSubmilestoneId,
        entityKind: "submilestone",
      });
      return projectStoredDelivery(record, {
        actionLabel: "Open Sub-milestone",
        body: reference.label,
        entityId: reference.entityId,
        entityLabel: reference.label,
        entityType: "buildSubmilestone",
        href: buildCollaborationDeepLink({
          buildId: authorization.build._id,
          detailTab: "collaboration",
          focus: `submilestone:${reference.entityId}`,
          recipientRole: authorization.effectiveRole.role,
        }),
        title: canonicalNotificationTitle(record.collaborationEventKind),
      });
    } catch {
      return null;
    }
  }
  if (record.collaborationActionItemId) {
    const item = await requireReadableActionItem(
      ctx,
      authorization,
      record.collaborationActionItemId
    );
    if (item.systemMode === "generated_milestone_submilestone") {
      if (item.canonicalBuildSubmilestoneId) {
        try {
          const reference = await resolveCurrentBuildCollaborationReference(
            ctx,
            {
              authorization,
              entityId: item.canonicalBuildSubmilestoneId,
              entityKind: "submilestone",
            }
          );
          return projectStoredDelivery(record, {
            actionLabel: "Open Sub-milestone",
            body: reference.label,
            entityId: reference.entityId,
            entityLabel: reference.label,
            entityType: "buildSubmilestone",
            href: buildCollaborationDeepLink({
              buildId: authorization.build._id,
              detailTab: "collaboration",
              focus: `submilestone:${reference.entityId}`,
              recipientRole: authorization.effectiveRole.role,
            }),
            title: canonicalNotificationTitle(record.collaborationEventKind),
          });
        } catch {
          return null;
        }
      }
      return projectStoredDelivery(record, {
        actionLabel: "Open Sub-milestone",
        body: item.title,
        entityId: item._id,
        entityLabel: item.title,
        entityType: "buildSubmilestoneIntegrity",
        href: buildCollaborationDeepLink({
          buildId: authorization.build._id,
          focus: `actionItem:${item._id}`,
          postId: item.originatingPostId,
          recipientRole: authorization.effectiveRole.role,
        }),
        title: canonicalNotificationTitle(record.collaborationEventKind),
      });
    }
    return projectStoredDelivery(record, {
      actionLabel: "Open Action Item",
      body: item.title,
      entityId: item._id,
      entityLabel: authorization.build.buildName,
      entityType: "buildActionItem",
      href: buildCollaborationDeepLink({
        buildId: authorization.build._id,
        focus: `actionItem:${item._id}`,
        postId: item.originatingPostId,
        recipientRole: authorization.effectiveRole.role,
      }),
      title: canonicalNotificationTitle(record.collaborationEventKind),
    });
  }
  const post = record.collaborationPostId
    ? await ctx.db.get(record.collaborationPostId)
    : null;
  if (
    !post ||
    post.contentState !== "active" ||
    !(await canReadCollaborationPost(ctx, authorization, post)) ||
    (post.systemPostKind === "draw" &&
      !(await canReadDrawCoordination(ctx, { authorization, post })))
  ) {
    return null;
  }
  if (record.collaborationCommentId) {
    const comment = await ctx.db.get(record.collaborationCommentId);
    if (
      !comment ||
      comment.contentState !== "active" ||
      comment.postId !== post._id ||
      comment.buildId !== authorization.build._id ||
      comment.organizationId !== authorization.organizationId
    ) {
      return null;
    }
    const revisionId =
      sourceRevision?.commentRevisionId ?? comment.currentRevisionId;
    const revision = revisionId ? await ctx.db.get(revisionId) : null;
    if (!revision || revision.commentId !== comment._id) {
      return null;
    }
    return projectStoredDelivery(record, {
      actionLabel: "Open reply",
      body: boundedNotificationPreview(revision.plainText),
      entityId: comment._id,
      entityLabel: authorization.build.buildName,
      entityType: "buildCollaborationComment",
      href: buildCollaborationDeepLink({
        buildId: authorization.build._id,
        focus: `comment:${comment._id}`,
        postId: post._id,
        recipientRole: authorization.effectiveRole.role,
      }),
      title: canonicalNotificationTitle(record.collaborationEventKind),
    });
  }
  const revisionId = sourceRevision?.postRevisionId ?? post.currentRevisionId;
  const revision = revisionId ? await ctx.db.get(revisionId) : null;
  if (!revision || revision.postId !== post._id) {
    return null;
  }
  return projectStoredDelivery(record, {
    actionLabel: "Open thread",
    body: boundedNotificationPreview(revision.plainText),
    entityId: post._id,
    entityLabel: authorization.build.buildName,
    entityType: "buildCollaborationPost",
    href: buildCollaborationDeepLink({
      buildId: authorization.build._id,
      postId: post._id,
      recipientRole: authorization.effectiveRole.role,
    }),
    title: canonicalNotificationTitle(record.collaborationEventKind),
  });
}

function matchesAuthorizedDelivery(
  authorization: ActiveBuildAuthorization,
  record: Doc<"recipientDeliveries">
) {
  return (
    record.collaborationBuildId === authorization.build._id &&
    record.organizationId === authorization.organizationId &&
    record.brokerageId === authorization.brokerage._id &&
    record.recipientWorkosUserId === authorization.viewer.subject
  );
}

function boundedNotificationPreview(value: string) {
  return value.slice(0, 280);
}

async function canReadAttachedNotificationContext(
  ctx: QueryCtx,
  authorization: ActiveBuildAuthorization,
  record: Doc<"recipientDeliveries">,
  sourceRevision?: CollaborationDeliverySourceRevision
) {
  if (!(await canReadDirectNotificationContext(ctx, authorization, record))) {
    return false;
  }
  const owners = await notificationContextOwners(
    ctx,
    authorization,
    record,
    sourceRevision
  );
  if (!owners) {
    return false;
  }
  for (const owner of owners) {
    if (!(await canReadOwnedNotificationContext(ctx, authorization, owner))) {
      return false;
    }
  }
  return true;
}

async function canReadDirectNotificationContext(
  ctx: QueryCtx,
  authorization: ActiveBuildAuthorization,
  record: Doc<"recipientDeliveries">
) {
  if (record.collaborationReferenceId) {
    const reference = await ctx.db.get(record.collaborationReferenceId);
    if (
      !reference ||
      reference.organizationId !== authorization.organizationId ||
      reference.buildId !== authorization.build._id ||
      !(
        record.collaborationPostId ||
        record.collaborationCommentId ||
        record.collaborationActionItemId
      )
    ) {
      return false;
    }
    try {
      await resolveCurrentBuildCollaborationReference(ctx, {
        authorization,
        entityId: reference.entityId,
        entityKind: reference.entityKind,
      });
    } catch {
      return false;
    }
  }
  if (record.collaborationAssetId) {
    const asset = await ctx.db.get(record.collaborationAssetId);
    if (
      !asset ||
      asset.state !== "available" ||
      asset.organizationId !== authorization.organizationId ||
      asset.brokerageId !== authorization.brokerage._id ||
      asset.buildId !== authorization.build._id ||
      !(record.collaborationPostId || record.collaborationActionItemId)
    ) {
      return false;
    }
    if (
      asset.maximumAudienceMode !== "build_wide" &&
      !asset.readerWorkosUserIds?.includes(authorization.viewer.subject)
    ) {
      return false;
    }
  }
  if (record.collaborationPostId) {
    const post = await ctx.db.get(record.collaborationPostId);
    if (
      post?.systemPostKind === "draw" &&
      !(await canReadDrawCoordination(ctx, { authorization, post }))
    ) {
      return false;
    }
  }
  return true;
}

interface NotificationContextOwner {
  ownerKind:
    | "postRevision"
    | "commentRevision"
    | "actionItem"
    | "actionItemComment";
  ownerRecordId: string;
}

async function notificationContextOwners(
  ctx: QueryCtx,
  authorization: ActiveBuildAuthorization,
  record: Doc<"recipientDeliveries">,
  sourceRevision?: CollaborationDeliverySourceRevision
) {
  const owners: NotificationContextOwner[] = [];
  if (record.collaborationPostId) {
    const owner = await postRevisionNotificationOwner(
      ctx,
      authorization,
      record,
      sourceRevision
    );
    if (owner === null) {
      return null;
    }
    if (owner) {
      owners.push(owner);
    }
  }
  if (record.collaborationCommentId) {
    const owner = await commentRevisionNotificationOwner(
      ctx,
      authorization,
      record,
      sourceRevision
    );
    if (owner === null) {
      return null;
    }
    if (owner) {
      owners.push(owner);
    }
  }
  if (record.collaborationActionItemId) {
    owners.push({
      ownerKind: "actionItem",
      ownerRecordId: record.collaborationActionItemId,
    });
  }
  return owners;
}

async function postRevisionNotificationOwner(
  ctx: QueryCtx,
  authorization: ActiveBuildAuthorization,
  record: Doc<"recipientDeliveries">,
  sourceRevision?: CollaborationDeliverySourceRevision
): Promise<NotificationContextOwner | null | undefined> {
  if (!record.collaborationPostId) {
    return;
  }
  if (sourceRevision?.requireExact && !sourceRevision.postRevisionId) {
    return null;
  }
  const post = await ctx.db.get(record.collaborationPostId);
  const revisionId = sourceRevision?.postRevisionId ?? post?.currentRevisionId;
  if (!revisionId) {
    return;
  }
  const revision = await ctx.db.get(revisionId);
  if (
    !revision ||
    revision.postId !== record.collaborationPostId ||
    revision.organizationId !== authorization.organizationId ||
    revision.buildId !== authorization.build._id
  ) {
    return null;
  }
  return { ownerKind: "postRevision", ownerRecordId: revisionId };
}

async function commentRevisionNotificationOwner(
  ctx: QueryCtx,
  authorization: ActiveBuildAuthorization,
  record: Doc<"recipientDeliveries">,
  sourceRevision?: CollaborationDeliverySourceRevision
): Promise<NotificationContextOwner | null | undefined> {
  if (!record.collaborationCommentId) {
    return;
  }
  if (sourceRevision?.requireExact && !sourceRevision.commentRevisionId) {
    return null;
  }
  const comment = await ctx.db.get(record.collaborationCommentId);
  const revisionId =
    sourceRevision?.commentRevisionId ?? comment?.currentRevisionId;
  if (!revisionId) {
    return;
  }
  const revision = await ctx.db.get(revisionId);
  if (
    !revision ||
    revision.commentId !== record.collaborationCommentId ||
    revision.postId !== record.collaborationPostId ||
    revision.organizationId !== authorization.organizationId ||
    revision.buildId !== authorization.build._id
  ) {
    return null;
  }
  return { ownerKind: "commentRevision", ownerRecordId: revisionId };
}

async function canReadOwnedNotificationContext(
  ctx: QueryCtx,
  authorization: ActiveBuildAuthorization,
  owner: NotificationContextOwner
) {
  const references = ctx.db
    .query("buildCollaborationReferences")
    .withIndex("by_ownerKind_and_ownerRecordId", (query) =>
      query
        .eq("ownerKind", owner.ownerKind)
        .eq("ownerRecordId", owner.ownerRecordId)
    );
  for await (const reference of references) {
    if (
      reference.organizationId !== authorization.organizationId ||
      reference.brokerageId !== authorization.brokerage._id ||
      reference.buildId !== authorization.build._id
    ) {
      return false;
    }
    try {
      await resolveCurrentBuildCollaborationReference(ctx, {
        authorization,
        entityId: reference.entityId,
        entityKind: reference.entityKind,
      });
    } catch {
      return false;
    }
  }
  const attachments = ctx.db
    .query("buildCollaborationAttachments")
    .withIndex("by_ownerKind_and_ownerRecordId", (query) =>
      query
        .eq("ownerKind", owner.ownerKind)
        .eq("ownerRecordId", owner.ownerRecordId)
    );
  for await (const attachment of attachments) {
    if (
      !(await canReadCollaborationNotificationAttachment(
        ctx,
        authorization,
        attachment
      ))
    ) {
      return false;
    }
  }
  return true;
}

async function canReadCollaborationNotificationAttachment(
  ctx: QueryCtx,
  authorization: ActiveBuildAuthorization,
  attachment: Doc<"buildCollaborationAttachments">
) {
  if (
    attachment.organizationId !== authorization.organizationId ||
    attachment.brokerageId !== authorization.brokerage._id ||
    attachment.buildId !== authorization.build._id
  ) {
    return false;
  }
  if (
    attachment.attachmentKind === "document" ||
    attachment.attachmentKind === "evidenceAsset"
  ) {
    try {
      await resolveCurrentBuildCollaborationReference(ctx, {
        authorization,
        entityId: attachment.attachmentId,
        entityKind: attachment.attachmentKind,
      });
      return true;
    } catch {
      return false;
    }
  }
  const assetId = ctx.db.normalizeId(
    "buildCollaborationAssets",
    attachment.attachmentId
  );
  const asset = assetId ? await ctx.db.get(assetId) : null;
  return Boolean(
    asset &&
      asset.state === "available" &&
      asset.organizationId === authorization.organizationId &&
      asset.brokerageId === authorization.brokerage._id &&
      asset.buildId === authorization.build._id &&
      (asset.maximumAudienceMode === "build_wide" ||
        asset.readerWorkosUserIds?.includes(authorization.viewer.subject))
  );
}

function projectStoredDelivery(
  record: Doc<"recipientDeliveries">,
  canonical?: Partial<{
    actionLabel: string;
    body: string;
    entityId: string;
    entityLabel: string;
    entityType: string;
    href: string;
    title: string;
  }>
) {
  return {
    _id: record._id,
    actionLabel: canonical?.actionLabel ?? record.actionLabel,
    actionRequired: record.actionRequired,
    body: canonical?.body ?? record.body,
    createdAt: record.createdAt,
    entityId: canonical?.entityId ?? record.entityId,
    entityLabel: canonical?.entityLabel ?? record.entityLabel,
    entityType: canonical?.entityType ?? record.entityType,
    href: canonical?.href ?? record.href,
    resolutionMode: record.resolutionMode,
    sourceLabel: record.sourceLabel,
    status: record.status,
    title: canonical?.title ?? record.title,
    updatedAt: record.updatedAt,
  };
}

function canonicalNotificationTitle(kind?: BuildCollaborationNotificationKind) {
  switch (kind) {
    case "direct_mention":
      return "You were mentioned";
    case "assignment":
      return "Action Item assigned";
    case "assignment_request":
      return "Action Item assignment requested";
    case "followed_reply":
      return "New reply in a followed thread";
    case "required_approval":
      return "Approval required";
    case "blocker":
      return "Build blocker";
    case "build_wide_pin":
      return "Thread pinned for the Build";
    case "acknowledgement_required":
      return "Acknowledgement required";
    case "acknowledgement_received":
      return "Thread acknowledged";
    case "reminder":
      return "Action Item reminder";
    case "escalation":
      return "Action Item escalated";
    default:
      return "Build collaboration update";
  }
}
