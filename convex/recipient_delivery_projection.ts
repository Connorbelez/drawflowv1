import type { PaginationOptions } from "convex/server";
import { v } from "convex/values";

import type { Doc, QueryCtx } from "./types";

export const recipientDeliveryStatusValidator = v.union(
  v.literal("unread"),
  v.literal("read"),
  v.literal("dismissed"),
  v.literal("resolved")
);

export const recipientDeliveryProjectionValidator = v.object({
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

export interface RecipientDeliveryCanonicalOverrides {
  actionLabel?: string;
  body?: string;
  entityId?: string;
  entityLabel?: string;
  entityType?: string;
  href?: string;
  title?: string;
}

export function projectRecipientDelivery(
  record: Doc<"recipientDeliveries">,
  canonical?: RecipientDeliveryCanonicalOverrides
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

export function isRecipientDeliveryVisible(
  record: Doc<"recipientDeliveries">,
  input: { includeResolved?: boolean; requireInAppVisible: boolean }
) {
  if (input.requireInAppVisible && record.inAppVisible === false) {
    return false;
  }
  return (
    input.includeResolved ||
    (record.status !== "dismissed" && record.status !== "resolved")
  );
}

export function summarizeRecipientDeliveries(
  records: Doc<"recipientDeliveries">[],
  includeResolved?: boolean
) {
  const visibleRecords = records.filter((record) =>
    isRecipientDeliveryVisible(record, {
      includeResolved,
      requireInAppVisible: false,
    })
  );
  return {
    actionRequiredCount: visibleRecords.filter(
      (record) =>
        record.actionRequired &&
        record.status !== "dismissed" &&
        record.status !== "resolved"
    ).length,
    deliveries: visibleRecords.map((record) =>
      projectRecipientDelivery(record)
    ),
    unreadCount: visibleRecords.filter((record) => record.status === "unread")
      .length,
  };
}

function recipientDeliveryQuery(
  ctx: QueryCtx,
  input: { organizationId: string; recipientWorkosUserId: string }
) {
  return ctx.db
    .query("recipientDeliveries")
    .withIndex("by_recipient", (query) =>
      query
        .eq("organizationId", input.organizationId)
        .eq("recipientWorkosUserId", input.recipientWorkosUserId)
    )
    .order("desc");
}

export async function loadRecipientDeliverySummary(
  ctx: QueryCtx,
  input: {
    includeResolved?: boolean;
    organizationId: string;
    recipientWorkosUserId: string;
  }
) {
  const records = await recipientDeliveryQuery(ctx, input).take(100);
  return summarizeRecipientDeliveries(records, input.includeResolved);
}

export async function paginateRecipientDeliveries(
  ctx: QueryCtx,
  input: {
    organizationId: string;
    paginationOpts: PaginationOptions;
    recipientWorkosUserId: string;
  }
) {
  return await recipientDeliveryQuery(ctx, input).paginate({
    ...input.paginationOpts,
    numItems: Math.min(100, Math.max(1, input.paginationOpts.numItems)),
  });
}
