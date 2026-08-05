import { v } from "convex/values";
import { internal } from "./_generated/api";
import {
  externalDeliveryPlan,
  nextBuildCollaborationRetryAt,
} from "./build_collaboration_delivery_model";
import { projectAuthorizedCollaborationDelivery } from "./build_collaboration_inbox";
import { ownedActivePushSubscriptions } from "./build_collaboration_push";
import { authorizeBuildCollaborationRecipient } from "./build_collaboration_recipient_access";
import { internalMutation } from "./fluent";
import type { Doc, Id, MutationCtx } from "./types";

const MAX_DELIVERY_ATTEMPTS = 5;
const MAX_DIGEST_ITEMS = 100;
const DISPATCH_LEASE_MS = 10 * 60 * 1000;
interface PreparedDeliveryItem {
  delivery: Doc<"buildCollaborationExternalDeliveries">;
  item: {
    actionHref: string;
    body: string;
    occurredAt: number;
    title: string;
  };
}

interface ImmutableBatchPayload {
  channel: "email" | "push";
  deliveryIds: Id<"buildCollaborationExternalDeliveries">[];
  idempotencyKey: string;
  items: PreparedDeliveryItem["item"][];
  recipientWorkosUserId: string;
}

type DeliveryContact =
  | { email: string }
  | {
      subscriptions: Array<{
        auth: string;
        endpoint: string;
        p256dh: string;
      }>;
    };

interface CompleteExternalDeliveryInput {
  error?: string;
  eventOutboxId: Id<"eventOutbox">;
  providerMessageId?: string;
  responseCode?: number;
  succeeded: boolean;
  timestamp?: number;
}

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

async function prepareExternalDeliveryBatch(
  ctx: MutationCtx,
  input: {
    asOf: number;
    group: Doc<"buildCollaborationExternalDeliveries">[];
    seed: Doc<"buildCollaborationExternalDeliveries">;
  }
) {
  if (input.seed.batchId) {
    return await prepareExistingDeliveryBatch(
      ctx,
      input.seed.batchId,
      input.asOf
    );
  }
  const prepared: PreparedDeliveryItem[] = [];
  for (const delivery of input.group) {
    const currentItem = await revalidateDelivery(ctx, delivery);
    if (!currentItem) {
      await cancelBuildCollaborationExternalDelivery(
        ctx,
        delivery,
        input.asOf,
        "access_revoked"
      );
      continue;
    }
    const item = delivery.renderedItemSnapshot
      ? parseRenderedItemSnapshot(delivery.renderedItemSnapshot)
      : currentItem;
    if (!item) {
      await cancelBuildCollaborationExternalDelivery(
        ctx,
        delivery,
        input.asOf,
        "invalid_payload_snapshot"
      );
      continue;
    }
    prepared.push({ delivery, item });
  }
  if (!prepared.length) {
    return null;
  }
  const firstPrepared = prepared[0];
  if (!firstPrepared) {
    return null;
  }
  const contact = await deliveryContact(ctx, firstPrepared.delivery);
  if (!contact) {
    for (const { delivery } of prepared) {
      await cancelBuildCollaborationExternalDelivery(
        ctx,
        delivery,
        input.asOf,
        "delivery_contact_unavailable"
      );
    }
    return null;
  }
  const deliveryIds = prepared.map(({ delivery }) => delivery._id);
  const providerIdempotencyKey = `build-collaboration-delivery:${crypto.randomUUID()}`;
  const payload: ImmutableBatchPayload = {
    channel: input.seed.channel,
    deliveryIds,
    idempotencyKey: providerIdempotencyKey,
    items: prepared.map(({ item }) => item),
    recipientWorkosUserId: input.seed.recipientWorkosUserId,
  };
  const batchId = await ctx.db.insert("buildCollaborationDeliveryBatches", {
    brokerageId: input.seed.brokerageId,
    buildId: input.seed.buildId,
    cadence: input.seed.cadence,
    channel: input.seed.channel,
    contactSnapshot: JSON.stringify(contact),
    createdAt: input.asOf,
    deliveryIds,
    organizationId: input.seed.organizationId,
    payloadSnapshot: JSON.stringify(payload),
    providerIdempotencyKey,
    recipientWorkosUserId: input.seed.recipientWorkosUserId,
    state: "sending",
    updatedAt: input.asOf,
  });
  const outboxId = await ctx.db.insert("eventOutbox", {
    brokerageId: input.seed.brokerageId,
    createdAt: input.asOf,
    eventType: `build_collaboration.external_delivery.${input.seed.channel}`,
    organizationId: input.seed.organizationId,
    payloadPreview: JSON.stringify(payload),
    relatedEntityId: input.seed.buildId,
    relatedEntityType: "buildCollaborationExternalDelivery",
    status: "pending",
  });
  const attemptNumber =
    Math.max(...prepared.map(({ delivery }) => delivery.attemptCount)) + 1;
  for (const { delivery, item } of prepared) {
    await ctx.db.patch(delivery._id, {
      attemptCount: delivery.attemptCount + 1,
      batchId,
      batchKey: providerIdempotencyKey,
      lastAttemptAt: input.asOf,
      lastError: undefined,
      leaseExpiresAt: input.asOf + DISPATCH_LEASE_MS,
      providerOutboxId: outboxId,
      renderedItemSnapshot:
        delivery.renderedItemSnapshot ?? JSON.stringify(item),
      status: "dispatched",
      updatedAt: input.asOf,
    });
  }
  await ctx.db.insert("buildCollaborationDeliveryAttempts", {
    attemptNumber,
    attemptedAt: input.asOf,
    batchId,
    brokerageId: input.seed.brokerageId,
    channel: input.seed.channel,
    createdAt: input.asOf,
    deliveryIds,
    organizationId: input.seed.organizationId,
    providerIdempotencyKey,
    state: "sending",
    updatedAt: input.asOf,
  });
  return outboxId;
}

async function prepareExistingDeliveryBatch(
  ctx: MutationCtx,
  batchId: Id<"buildCollaborationDeliveryBatches">,
  asOf: number
) {
  const batch = await ctx.db.get(batchId);
  if (!batch || (batch.state !== "failed" && batch.state !== "sending")) {
    return null;
  }
  const payload = parseBatchPayload(batch.payloadSnapshot);
  const snapshotContact = parseDeliveryContact(batch.contactSnapshot);
  const deliveries = await loadBatchDeliveries(ctx, batch);
  if (
    !(
      payload &&
      snapshotContact &&
      contactMatchesChannel(snapshotContact, batch.channel)
    ) ||
    deliveries.length !== batch.deliveryIds.length ||
    payload.deliveryIds.length !== batch.deliveryIds.length ||
    payload.deliveryIds.some((id, index) => id !== batch.deliveryIds[index])
  ) {
    await cancelDeliveryBatch(ctx, batch, asOf, "invalid_batch_snapshot");
    return null;
  }
  for (const delivery of deliveries) {
    if (!(await revalidateDelivery(ctx, delivery))) {
      await cancelDeliveryBatch(ctx, batch, asOf, "access_revoked");
      return null;
    }
  }
  const seed = deliveries[0];
  if (!seed) {
    await cancelDeliveryBatch(ctx, batch, asOf, "invalid_batch_snapshot");
    return null;
  }
  const currentContact = await deliveryContact(ctx, seed);
  if (!currentContact) {
    await cancelDeliveryBatch(ctx, batch, asOf, "delivery_contact_unavailable");
    return null;
  }
  if (!deliveryContactsEqual(snapshotContact, currentContact)) {
    await supersedeBatchForDestinationChange(ctx, batch, deliveries, asOf);
    return null;
  }
  const outboxId = await insertBatchOutbox(ctx, batch, payload, asOf);
  const attemptNumber =
    Math.max(...deliveries.map((delivery) => delivery.attemptCount)) + 1;
  for (const delivery of deliveries) {
    await ctx.db.patch(delivery._id, {
      attemptCount: delivery.attemptCount + 1,
      lastAttemptAt: asOf,
      lastError: undefined,
      leaseExpiresAt: asOf + DISPATCH_LEASE_MS,
      providerOutboxId: outboxId,
      status: "dispatched",
      updatedAt: asOf,
    });
  }
  await ctx.db.patch(batch._id, {
    safeError: undefined,
    state: "sending",
    updatedAt: asOf,
  });
  await ctx.db.insert("buildCollaborationDeliveryAttempts", {
    attemptNumber,
    attemptedAt: asOf,
    batchId: batch._id,
    brokerageId: batch.brokerageId,
    channel: batch.channel,
    createdAt: asOf,
    deliveryIds: batch.deliveryIds,
    organizationId: batch.organizationId,
    providerIdempotencyKey: batch.providerIdempotencyKey,
    state: "sending",
    updatedAt: asOf,
  });
  return outboxId;
}

async function insertBatchOutbox(
  ctx: MutationCtx,
  batch: Doc<"buildCollaborationDeliveryBatches">,
  payload: ImmutableBatchPayload,
  now: number
) {
  return await ctx.db.insert("eventOutbox", {
    brokerageId: batch.brokerageId,
    createdAt: now,
    eventType: `build_collaboration.external_delivery.${batch.channel}`,
    organizationId: batch.organizationId,
    payloadPreview: JSON.stringify(payload),
    relatedEntityId: batch.buildId,
    relatedEntityType: "buildCollaborationExternalDelivery",
    status: "pending",
  });
}

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

async function completeExternalDeliveryAttempt(
  ctx: MutationCtx,
  args: CompleteExternalDeliveryInput
) {
  const timestamp = args.timestamp ?? Date.now();
  const outbox = await ctx.db.get(args.eventOutboxId);
  if (!outbox) {
    return null;
  }
  const deliveries = await ctx.db
    .query("buildCollaborationExternalDeliveries")
    .withIndex("by_providerOutboxId", (query) =>
      query.eq("providerOutboxId", outbox._id)
    )
    .take(MAX_DIGEST_ITEMS);
  if (!deliveries.some((row) => row.status === "dispatched")) {
    return null;
  }
  const batchId = deliveries[0]?.batchId;
  const batch = batchId ? await ctx.db.get(batchId) : null;
  if (!batch || deliveries.some((delivery) => delivery.batchId !== batch._id)) {
    return null;
  }
  const safeError = args.error?.slice(0, 280);
  const exhausted = deliveries.some(
    (delivery) => delivery.attemptCount >= MAX_DELIVERY_ATTEMPTS
  );
  await patchCompletedDeliveryRows(ctx, deliveries, {
    exhausted,
    safeError,
    succeeded: args.succeeded,
    timestamp,
  });
  await ctx.db.patch(outbox._id, {
    processedAt: timestamp,
    status: args.succeeded ? "processed" : "failed",
  });
  await completeSendingAttempt(ctx, batch._id, args, safeError, timestamp);
  await ctx.db.patch(batch._id, {
    cancelledAt: !args.succeeded && exhausted ? timestamp : undefined,
    completedAt: args.succeeded ? timestamp : undefined,
    safeError: args.succeeded
      ? undefined
      : (safeError ?? "External delivery failed."),
    state: args.succeeded ? "succeeded" : exhausted ? "cancelled" : "failed",
    updatedAt: timestamp,
  });
  return null;
}

async function patchCompletedDeliveryRows(
  ctx: MutationCtx,
  deliveries: Doc<"buildCollaborationExternalDeliveries">[],
  input: {
    exhausted: boolean;
    safeError?: string;
    succeeded: boolean;
    timestamp: number;
  }
) {
  for (const delivery of deliveries) {
    if (delivery.status !== "dispatched") {
      continue;
    }
    if (input.succeeded) {
      await ctx.db.patch(delivery._id, {
        lastError: undefined,
        leaseExpiresAt: undefined,
        sentAt: input.timestamp,
        status: "sent",
        updatedAt: input.timestamp,
      });
      continue;
    }
    await ctx.db.patch(delivery._id, {
      cancellationReason: input.exhausted
        ? "delivery_attempts_exhausted"
        : undefined,
      cancelledAt: input.exhausted ? input.timestamp : undefined,
      lastError: input.safeError ?? "External delivery failed.",
      leaseExpiresAt: undefined,
      providerOutboxId: undefined,
      scheduledFor: nextBuildCollaborationRetryAt(
        input.timestamp,
        delivery.attemptCount
      ),
      status: input.exhausted ? "cancelled" : "queued",
      updatedAt: input.timestamp,
    });
  }
}

async function completeSendingAttempt(
  ctx: MutationCtx,
  batchId: Id<"buildCollaborationDeliveryBatches">,
  args: CompleteExternalDeliveryInput,
  safeError: string | undefined,
  timestamp: number
) {
  const attempt = await ctx.db
    .query("buildCollaborationDeliveryAttempts")
    .withIndex("by_batchId_and_state", (query) =>
      query.eq("batchId", batchId).eq("state", "sending")
    )
    .order("desc")
    .first();
  if (!attempt) {
    return;
  }
  await ctx.db.patch(attempt._id, {
    completedAt: timestamp,
    providerMessageId: args.providerMessageId?.slice(0, 280),
    responseCode: args.responseCode,
    safeError,
    state: args.succeeded ? "succeeded" : "failed",
    updatedAt: timestamp,
  });
}

async function dueExternalDeliveries(
  ctx: MutationCtx,
  asOf: number,
  batchSize: number
) {
  const queued = await ctx.db
    .query("buildCollaborationExternalDeliveries")
    .withIndex("by_status_and_scheduledFor", (query) =>
      query.eq("status", "queued").lte("scheduledFor", asOf)
    )
    .take(batchSize);
  if (queued.length >= batchSize) {
    return queued;
  }
  const failed = await ctx.db
    .query("buildCollaborationExternalDeliveries")
    .withIndex("by_status_and_scheduledFor", (query) =>
      query.eq("status", "failed").lte("scheduledFor", asOf)
    )
    .take(batchSize - queued.length);
  if (queued.length + failed.length >= batchSize) {
    return [...queued, ...failed].sort(
      (left, right) => left.scheduledFor - right.scheduledFor
    );
  }
  const expiredDispatched = await ctx.db
    .query("buildCollaborationExternalDeliveries")
    .withIndex("by_status_and_leaseExpiresAt", (query) =>
      query.eq("status", "dispatched").lte("leaseExpiresAt", asOf)
    )
    .take(batchSize - queued.length - failed.length);
  for (const delivery of expiredDispatched) {
    await reclaimExpiredDispatch(ctx, delivery, asOf);
  }
  return [...queued, ...failed, ...expiredDispatched].sort(
    (left, right) => left.scheduledFor - right.scheduledFor
  );
}

async function deliveryGroup(
  ctx: MutationCtx,
  due: Doc<"buildCollaborationExternalDeliveries">[],
  seed: Doc<"buildCollaborationExternalDeliveries">,
  asOf: number
) {
  if (seed.batchId) {
    const batch = await ctx.db.get(seed.batchId);
    if (!batch) {
      return [seed];
    }
    return (await loadBatchDeliveries(ctx, batch))
      .filter(
        (row) =>
          (row.status === "queued" || row.status === "failed") &&
          row.scheduledFor <= asOf
      )
      .sort((left, right) => left.createdAt - right.createdAt);
  }
  if (seed.deliveryMode === "immediate") {
    return [seed];
  }
  return due.filter(
    (row) =>
      row.deliveryMode === "digest" &&
      row.organizationId === seed.organizationId &&
      row.buildId === seed.buildId &&
      row.recipientWorkosUserId === seed.recipientWorkosUserId &&
      row.channel === seed.channel &&
      row.cadence === seed.cadence &&
      row.batchId === undefined
  );
}

async function revalidateDelivery(
  ctx: MutationCtx,
  delivery: Doc<"buildCollaborationExternalDeliveries">
) {
  if (!delivery.recipientDeliveryId) {
    return null;
  }
  const canonical = await ctx.db.get(delivery.recipientDeliveryId);
  if (
    !canonical ||
    canonical.status === "dismissed" ||
    canonical.status === "resolved" ||
    !canonical.collaborationBuildId ||
    !canonical.collaborationEventKind
  ) {
    return null;
  }
  try {
    const { authorization } = await authorizeBuildCollaborationRecipient(ctx, {
      buildId: canonical.collaborationBuildId,
      organizationId: canonical.organizationId,
      workosUserId: canonical.recipientWorkosUserId,
    });
    const preference = await ctx.db
      .query("buildCollaborationNotificationPreferences")
      .withIndex("by_buildId_and_workosUserId", (query) =>
        query
          .eq("buildId", authorization.build._id)
          .eq("workosUserId", canonical.recipientWorkosUserId)
      )
      .first();
    const selected = externalDeliveryPlan({
      channels: preference?.channels,
      digestCadence: preference?.digestCadence,
      digestEnabled: preference?.digestEnabled,
      kind: canonical.collaborationEventKind,
      ordinaryMuted: preference?.ordinaryMuted,
    }).some(
      (target) =>
        target.channel === delivery.channel &&
        (delivery.batchId !== undefined || target.cadence === delivery.cadence)
    );
    if (!selected) {
      return null;
    }
    const projected = await projectAuthorizedCollaborationDelivery(
      ctx,
      authorization,
      canonical,
      {
        commentRevisionId: delivery.collaborationCommentRevisionId,
        postRevisionId: delivery.collaborationPostRevisionId,
        requireExact: true,
      }
    );
    return projected
      ? {
          actionHref: projected.href,
          body: projected.body,
          occurredAt: canonical.createdAt,
          title: projected.title,
        }
      : null;
  } catch {
    return null;
  }
}

async function deliveryContact(
  ctx: MutationCtx,
  delivery: Doc<"buildCollaborationExternalDeliveries">
) {
  const user = await ctx.db
    .query("users")
    .withIndex("by_workos_user_id", (query) =>
      query.eq("workosUserId", delivery.recipientWorkosUserId)
    )
    .unique();
  if (!user || user.status === "deleted") {
    return null;
  }
  if (delivery.channel === "email") {
    return user.email.trim() ? { email: user.email.trim() } : null;
  }
  const subscriptions = await ownedActivePushSubscriptions(ctx, {
    buildId: delivery.buildId,
    organizationId: delivery.organizationId,
    workosUserId: delivery.recipientWorkosUserId,
  });
  return subscriptions.length
    ? {
        subscriptions: subscriptions
          .map((subscription) => ({
            auth: subscription.auth,
            endpoint: subscription.endpoint,
            p256dh: subscription.p256dh,
          }))
          .sort((left, right) => left.endpoint.localeCompare(right.endpoint)),
      }
    : null;
}

export async function cancelBuildCollaborationExternalDelivery(
  ctx: MutationCtx,
  delivery: Doc<"buildCollaborationExternalDeliveries">,
  now: number,
  reason: string
) {
  if (delivery.batchId) {
    const batch = await ctx.db.get(delivery.batchId);
    if (batch) {
      await cancelDeliveryBatch(ctx, batch, now, reason);
      return;
    }
  }
  await ctx.db.patch(delivery._id, {
    cancellationReason: reason,
    cancelledAt: now,
    leaseExpiresAt: undefined,
    status: "cancelled",
    updatedAt: now,
  });
  if (delivery.providerOutboxId) {
    const outbox = await ctx.db.get(delivery.providerOutboxId);
    if (outbox?.status === "pending") {
      await ctx.db.patch(outbox._id, {
        payloadPreview: JSON.stringify({ reason, redacted: true }),
        processedAt: now,
        status: "failed",
      });
    }
    const attempt = await ctx.db
      .query("buildCollaborationDeliveryAttempts")
      .withIndex("by_providerIdempotencyKey", (query) =>
        query.eq("providerIdempotencyKey", delivery.batchKey ?? "")
      )
      .order("desc")
      .first();
    if (attempt?.state === "sending") {
      await ctx.db.patch(attempt._id, {
        completedAt: now,
        safeError: reason,
        state: "failed",
        updatedAt: now,
      });
    }
  }
}

async function cancelDeliveryBatch(
  ctx: MutationCtx,
  batch: Doc<"buildCollaborationDeliveryBatches">,
  now: number,
  reason: string
) {
  const deliveries = await loadBatchDeliveries(ctx, batch);
  const outboxIds = new Set(
    deliveries.flatMap((delivery) =>
      delivery.providerOutboxId ? [delivery.providerOutboxId] : []
    )
  );
  for (const delivery of deliveries) {
    if (delivery.status === "sent") {
      continue;
    }
    await ctx.db.patch(delivery._id, {
      cancellationReason: reason,
      cancelledAt: now,
      leaseExpiresAt: undefined,
      providerOutboxId: undefined,
      status: "cancelled",
      updatedAt: now,
    });
  }
  for (const outboxId of outboxIds) {
    await redactFailedOutbox(ctx, outboxId, reason, now);
  }
  const attempts = ctx.db
    .query("buildCollaborationDeliveryAttempts")
    .withIndex("by_batchId_and_state", (query) =>
      query.eq("batchId", batch._id).eq("state", "sending")
    );
  for await (const attempt of attempts) {
    await ctx.db.patch(attempt._id, {
      completedAt: now,
      safeError: reason,
      state: "failed",
      updatedAt: now,
    });
  }
  await ctx.db.patch(batch._id, {
    cancelledAt: now,
    safeError: reason,
    state: "cancelled",
    updatedAt: now,
  });
}

async function supersedeBatchForDestinationChange(
  ctx: MutationCtx,
  batch: Doc<"buildCollaborationDeliveryBatches">,
  deliveries: Doc<"buildCollaborationExternalDeliveries">[],
  now: number
) {
  await cancelDeliveryBatch(ctx, batch, now, "delivery_destination_changed");
  for (const delivery of deliveries) {
    if (delivery.status === "sent") {
      continue;
    }
    await ctx.db.patch(delivery._id, {
      batchId: undefined,
      batchKey: undefined,
      batchRevision: undefined,
      cancellationReason: undefined,
      cancelledAt: undefined,
      lastError: undefined,
      leaseExpiresAt: undefined,
      providerOutboxId: undefined,
      renderedItemSnapshot: undefined,
      scheduledFor: now,
      status: "queued",
      updatedAt: now,
    });
  }
  await ctx.scheduler.runAfter(
    0,
    internal.build_collaboration_delivery_transport
      .processBuildCollaborationExternalDeliveries,
    { asOf: now, batchSize: MAX_DIGEST_ITEMS }
  );
}

async function redactFailedOutbox(
  ctx: MutationCtx,
  outboxId: Id<"eventOutbox">,
  reason: string,
  now: number
) {
  const outbox = await ctx.db.get(outboxId);
  if (outbox?.status === "pending") {
    await ctx.db.patch(outbox._id, {
      payloadPreview: JSON.stringify({ reason, redacted: true }),
      processedAt: now,
      status: "failed",
    });
  }
}

async function loadBatchDeliveries(
  ctx: MutationCtx,
  batch: Doc<"buildCollaborationDeliveryBatches">
) {
  const deliveries: Doc<"buildCollaborationExternalDeliveries">[] = [];
  for (const deliveryId of batch.deliveryIds) {
    const delivery = await ctx.db.get(deliveryId);
    if (delivery?.batchId === batch._id) {
      deliveries.push(delivery);
    }
  }
  return deliveries;
}

async function reclaimExpiredDispatch(
  ctx: MutationCtx,
  delivery: Doc<"buildCollaborationExternalDeliveries">,
  now: number
) {
  if (delivery.batchId) {
    const batch = await ctx.db.get(delivery.batchId);
    if (!batch || batch.state !== "sending") {
      return;
    }
    const deliveries = await loadBatchDeliveries(ctx, batch);
    for (const member of deliveries) {
      if (member.providerOutboxId) {
        await redactFailedOutbox(
          ctx,
          member.providerOutboxId,
          "dispatch_lease_expired",
          now
        );
      }
      if (member.status === "dispatched") {
        await ctx.db.patch(member._id, {
          lastError: "Dispatch lease expired before provider completion.",
          leaseExpiresAt: undefined,
          providerOutboxId: undefined,
          scheduledFor: now,
          status: "failed",
          updatedAt: now,
        });
      }
    }
    const attempt = await ctx.db
      .query("buildCollaborationDeliveryAttempts")
      .withIndex("by_batchId_and_state", (query) =>
        query.eq("batchId", batch._id).eq("state", "sending")
      )
      .order("desc")
      .first();
    if (attempt) {
      await ctx.db.patch(attempt._id, {
        completedAt: now,
        safeError: "dispatch_lease_expired",
        state: "failed",
        updatedAt: now,
      });
    }
    await ctx.db.patch(batch._id, {
      safeError: "dispatch_lease_expired",
      state: "failed",
      updatedAt: now,
    });
    return;
  }
  if (delivery.providerOutboxId) {
    const outbox = await ctx.db.get(delivery.providerOutboxId);
    if (outbox?.status === "pending") {
      await ctx.db.patch(outbox._id, {
        payloadPreview: JSON.stringify({
          reason: "dispatch_lease_expired",
          redacted: true,
        }),
        processedAt: now,
        status: "failed",
      });
    }
  }
  const attempt = await ctx.db
    .query("buildCollaborationDeliveryAttempts")
    .withIndex("by_providerIdempotencyKey", (query) =>
      query.eq("providerIdempotencyKey", delivery.batchKey ?? "")
    )
    .order("desc")
    .first();
  if (attempt?.state === "sending") {
    await ctx.db.patch(attempt._id, {
      completedAt: now,
      safeError: "dispatch_lease_expired",
      state: "failed",
      updatedAt: now,
    });
  }
  await ctx.db.patch(delivery._id, {
    lastError: "Dispatch lease expired before provider completion.",
    leaseExpiresAt: undefined,
    providerOutboxId: undefined,
    status: "failed",
    updatedAt: now,
  });
}

function parseRenderedItemSnapshot(value: string) {
  try {
    const parsed = JSON.parse(value) as Partial<PreparedDeliveryItem["item"]>;
    if (
      typeof parsed.actionHref !== "string" ||
      typeof parsed.body !== "string" ||
      typeof parsed.occurredAt !== "number" ||
      typeof parsed.title !== "string"
    ) {
      return null;
    }
    return {
      actionHref: parsed.actionHref,
      body: parsed.body,
      occurredAt: parsed.occurredAt,
      title: parsed.title,
    };
  } catch {
    return null;
  }
}

function parseBatchPayload(value: string): ImmutableBatchPayload | null {
  try {
    const parsed = JSON.parse(value) as Partial<ImmutableBatchPayload>;
    if (
      (parsed.channel !== "email" && parsed.channel !== "push") ||
      !Array.isArray(parsed.deliveryIds) ||
      typeof parsed.idempotencyKey !== "string" ||
      !Array.isArray(parsed.items) ||
      typeof parsed.recipientWorkosUserId !== "string"
    ) {
      return null;
    }
    const items = parsed.items.map((item) =>
      parseRenderedItemSnapshot(JSON.stringify(item))
    );
    if (items.some((item) => !item)) {
      return null;
    }
    return {
      channel: parsed.channel,
      deliveryIds: parsed.deliveryIds,
      idempotencyKey: parsed.idempotencyKey,
      items: items as PreparedDeliveryItem["item"][],
      recipientWorkosUserId: parsed.recipientWorkosUserId,
    };
  } catch {
    return null;
  }
}

function parseDeliveryContact(value: string): DeliveryContact | null {
  try {
    const parsed = JSON.parse(value) as Partial<DeliveryContact>;
    if ("email" in parsed && typeof parsed.email === "string") {
      return { email: parsed.email };
    }
    if (!("subscriptions" in parsed && Array.isArray(parsed.subscriptions))) {
      return null;
    }
    const subscriptions = parsed.subscriptions.filter(
      (
        subscription
      ): subscription is {
        auth: string;
        endpoint: string;
        p256dh: string;
      } =>
        typeof subscription === "object" &&
        subscription !== null &&
        typeof subscription.auth === "string" &&
        typeof subscription.endpoint === "string" &&
        typeof subscription.p256dh === "string"
    );
    if (
      subscriptions.length !== parsed.subscriptions.length ||
      subscriptions.length < 1 ||
      subscriptions.length > 20
    ) {
      return null;
    }
    return {
      subscriptions: subscriptions.sort((left, right) =>
        left.endpoint.localeCompare(right.endpoint)
      ),
    };
  } catch {
    return null;
  }
}

function contactMatchesChannel(
  contact: DeliveryContact,
  channel: "email" | "push"
) {
  return channel === "email" ? "email" in contact : "subscriptions" in contact;
}

function deliveryContactsEqual(left: DeliveryContact, right: DeliveryContact) {
  return JSON.stringify(left) === JSON.stringify(right);
}
