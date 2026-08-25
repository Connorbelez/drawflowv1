import { v } from "convex/values";
import { internalMutation } from "./fluent";
import type { Id } from "./types";
import {
  MAX_DIGEST_ITEMS,
  type ImmutableBatchPayload,
  type PreparedDeliveryItem,
} from "./build_collaboration_delivery_maintenance/contracts";
import {
  prepareExternalDeliveryBatch,
  dueExternalDeliveries,
  deliveryGroup,
  revalidateDelivery,
  deliveryContact,
} from "./build_collaboration_delivery_maintenance/preparation";
import {
  cancelBuildCollaborationExternalDelivery,
  cancelDeliveryBatch,
  completeExternalDeliveryAttempt,
  supersedeBatchForDestinationChange,
} from "./build_collaboration_delivery_maintenance/attempts";
import {
  loadBatchDeliveries,
  parseBatchPayload,
  parseDeliveryContact,
  redactFailedOutbox,
  contactMatchesChannel,
  deliveryContactsEqual,
} from "./build_collaboration_delivery_maintenance/helpers";

const externalChannelValidator = v.union(v.literal("email"), v.literal("push"));
const preparedItemValidator = v.object({
  actionHref: v.string(),
  body: v.string(),
  occurredAt: v.number(),
  title: v.string(),
});
const preparedOutboxValidator = v.union(
  v.null(),
  v.object({
    attemptId: v.id("buildCollaborationDeliveryAttempts"),
    channel: externalChannelValidator,
    contact: v.union(
      v.object({ email: v.string() }),
      v.object({
        subscriptions: v.array(
          v.object({
            auth: v.string(),
            endpoint: v.string(),
            p256dh: v.string(),
          })
        ),
      })
    ),
    idempotencyKey: v.string(),
    items: v.array(preparedItemValidator),
    recipientWorkosUserId: v.string(),
  })
);


export const prepareDueBuildCollaborationExternalDeliveries = internalMutation
  .input({
    asOf: v.optional(v.number()),
    batchSize: v.optional(v.number()),
    now: v.optional(v.number()),
  })
  .returns(v.array(v.id("eventOutbox")))
  .handler(async (ctx, args) => {
    const asOf = args.now ?? args.asOf ?? Date.now();
    const batchSize = Math.min(100, Math.max(1, args.batchSize ?? 50));
    const due = await dueExternalDeliveries(ctx, asOf, batchSize);
    const outboxIds: Id<"eventOutbox">[] = [];
    const consumed = new Set<string>();
    for (const seed of due) {
      if (consumed.has(seed._id)) {
        continue;
      }
      const group = (await deliveryGroup(ctx, due, seed, asOf)).slice(
        0,
        MAX_DIGEST_ITEMS
      );
      for (const row of group) {
        consumed.add(row._id);
      }
      const outboxId = await prepareExternalDeliveryBatch(ctx, {
        asOf,
        group,
        seed,
      });
      if (outboxId) {
        outboxIds.push(outboxId);
      }
    }
    return outboxIds;
  })
  .internal();

const legacyDeliveryStatusValidator = v.union(
  v.literal("queued"),
  v.literal("failed"),
  v.literal("dispatched")
);

export const cancelLegacyDeliveriesMissingSourceRevision = internalMutation
  .input({
    cursor: v.optional(v.union(v.string(), v.null())),
    status: legacyDeliveryStatusValidator,
  })
  .returns(
    v.object({
      cancelled: v.number(),
      continueCursor: v.string(),
      isDone: v.boolean(),
    })
  )
  .handler(async (ctx, args) => {
    const page = await ctx.db
      .query("buildCollaborationExternalDeliveries")
      .withIndex("by_status_and_scheduledFor", (query) =>
        query.eq("status", args.status)
      )
      .paginate({ cursor: args.cursor ?? null, numItems: 100 });
    const now = Date.now();
    let cancelled = 0;
    for (const delivery of page.page) {
      const missingPostRevision =
        Boolean(delivery.collaborationPostId) &&
        !delivery.collaborationPostRevisionId;
      const missingCommentRevision =
        Boolean(delivery.collaborationCommentId) &&
        !delivery.collaborationCommentRevisionId;
      if (!(missingPostRevision || missingCommentRevision)) {
        continue;
      }
      await cancelBuildCollaborationExternalDelivery(
        ctx,
        delivery,
        now,
        "missing_source_revision"
      );
      cancelled += 1;
    }
    return {
      cancelled,
      continueCursor: page.continueCursor,
      isDone: page.isDone,
    };
  })
  .internal();


export const prepareBuildCollaborationExternalOutbox = internalMutation
  .input({ eventOutboxId: v.id("eventOutbox") })
  .returns(preparedOutboxValidator)
  .handler(async (ctx, args) => {
    const outbox = await ctx.db.get(args.eventOutboxId);
    if (
      !outbox ||
      outbox.status !== "pending" ||
      !outbox.eventType.startsWith("build_collaboration.external_delivery.")
    ) {
      return null;
    }
    const deliveries = await ctx.db
      .query("buildCollaborationExternalDeliveries")
      .withIndex("by_providerOutboxId", (query) =>
        query.eq("providerOutboxId", outbox._id)
      )
      .take(MAX_DIGEST_ITEMS);
    const batchId = deliveries[0]?.batchId;
    const batch = batchId ? await ctx.db.get(batchId) : null;
    const payload = batch ? parseBatchPayload(batch.payloadSnapshot) : null;
    const snapshotContact = batch
      ? parseDeliveryContact(batch.contactSnapshot)
      : null;
    const exactDeliveries = batch ? await loadBatchDeliveries(ctx, batch) : [];
    if (
      !(
        batch &&
        payload &&
        snapshotContact &&
        contactMatchesChannel(snapshotContact, batch.channel)
      ) ||
      batch.state !== "sending" ||
      exactDeliveries.length !== batch.deliveryIds.length ||
      exactDeliveries.some(
        (delivery) => delivery.providerOutboxId !== outbox._id
      )
    ) {
      if (batch) {
        await cancelDeliveryBatch(
          ctx,
          batch,
          Date.now(),
          "invalid_batch_snapshot"
        );
      }
      await redactFailedOutbox(
        ctx,
        outbox._id,
        "invalid_batch_snapshot",
        Date.now()
      );
      return null;
    }
    for (const delivery of exactDeliveries) {
      if (!(await revalidateDelivery(ctx, delivery))) {
        await cancelDeliveryBatch(ctx, batch, Date.now(), "access_revoked");
        return null;
      }
    }
    const seed = exactDeliveries[0];
    if (!seed) {
      await cancelDeliveryBatch(
        ctx,
        batch,
        Date.now(),
        "invalid_batch_snapshot"
      );
      return null;
    }
    const currentContact = await deliveryContact(ctx, seed);
    if (!currentContact) {
      await cancelDeliveryBatch(
        ctx,
        batch,
        Date.now(),
        "delivery_contact_unavailable"
      );
      return null;
    }
    if (!deliveryContactsEqual(snapshotContact, currentContact)) {
      await supersedeBatchForDestinationChange(
        ctx,
        batch,
        exactDeliveries,
        Date.now()
      );
      return null;
    }
    const attempt = await ctx.db
      .query("buildCollaborationDeliveryAttempts")
      .withIndex("by_batchId_and_state", (query) =>
        query.eq("batchId", batch._id).eq("state", "sending")
      )
      .order("desc")
      .first();
    if (!attempt) {
      return null;
    }
    await ctx.db.patch(outbox._id, {
      payloadPreview: batch.payloadSnapshot,
    });
    return {
      attemptId: attempt._id,
      channel: batch.channel,
      contact: snapshotContact,
      idempotencyKey: batch.providerIdempotencyKey,
      items: payload.items,
      recipientWorkosUserId: batch.recipientWorkosUserId,
    };
  })
  .internal();

export const completeBuildCollaborationExternalDeliveryAttempt =
  internalMutation
    .input({
      error: v.optional(v.string()),
      eventOutboxId: v.id("eventOutbox"),
      providerMessageId: v.optional(v.string()),
      responseCode: v.optional(v.number()),
      succeeded: v.boolean(),
      timestamp: v.optional(v.number()),
    })
    .returns(v.null())
    .handler((ctx, args) => completeExternalDeliveryAttempt(ctx, args))
    .internal();


export { cancelBuildCollaborationExternalDelivery } from "./build_collaboration_delivery_maintenance/attempts";
