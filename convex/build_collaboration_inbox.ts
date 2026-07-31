import {
  paginationOptsValidator,
  paginationResultValidator,
} from "convex/server";
import { v } from "convex/values";

import type { AuthorizedViewer } from "./authz";
import { authenticatedQuery } from "./authz";
import { requireReadableActionItem } from "./build_action_items";
import { canReadCollaborationPost } from "./build_collaboration_access";
import type { BuildCollaborationNotificationKind } from "./build_collaboration_notifications";
import { authorizeActiveBuildCollaborationAccess } from "./build_collaboration_rollout";
import type { Doc, QueryCtx } from "./types";

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
      ? records.page
      : records.page.filter(
          (record) =>
            record.status !== "dismissed" && record.status !== "resolved"
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

async function authorizeInboxOrganization(
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
    if (record.collaborationActionItemId) {
      const item = await requireReadableActionItem(
        ctx,
        authorization,
        record.collaborationActionItemId
      );
      return projectStoredDelivery(record, {
        actionLabel: "Open Action Item",
        body: item.title,
        entityId: item._id,
        entityLabel: authorization.build.buildName,
        entityType: "buildActionItem",
        href: `/backoffice/builds/${authorization.build._id}?tab=details&focus=actionItem%3A${item._id}`,
        title: canonicalNotificationTitle(record.collaborationEventKind),
      });
    }
    const post = record.collaborationPostId
      ? await ctx.db.get(record.collaborationPostId)
      : null;
    if (
      !post ||
      post.contentState !== "active" ||
      !(await canReadCollaborationPost(ctx, authorization, post))
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
      const revision = comment.currentRevisionId
        ? await ctx.db.get(comment.currentRevisionId)
        : null;
      if (!revision || revision.commentId !== comment._id) {
        return null;
      }
      return projectStoredDelivery(record, {
        actionLabel: "Open reply",
        body: revision.plainText,
        entityId: comment._id,
        entityLabel: authorization.build.buildName,
        entityType: "buildCollaborationComment",
        href: `/backoffice/builds/${authorization.build._id}?tab=details&collaborationPost=${post._id}&focus=comment%3A${comment._id}`,
        title: canonicalNotificationTitle(record.collaborationEventKind),
      });
    }
    const revision = post.currentRevisionId
      ? await ctx.db.get(post.currentRevisionId)
      : null;
    if (!revision || revision.postId !== post._id) {
      return null;
    }
    return projectStoredDelivery(record, {
      actionLabel: "Open thread",
      body: revision.plainText,
      entityId: post._id,
      entityLabel: authorization.build.buildName,
      entityType: "buildCollaborationPost",
      href: `/backoffice/builds/${authorization.build._id}?tab=details&collaborationPost=${post._id}`,
      title: canonicalNotificationTitle(record.collaborationEventKind),
    });
  } catch {
    return null;
  }
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
