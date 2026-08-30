import { externalDeliveryPlan } from "../build_collaboration_delivery_model";
import { projectAuthorizedCollaborationDelivery } from "../build_collaboration_inbox";
import { ownedActivePushSubscriptions } from "../build_collaboration_push";
import { authorizeBuildCollaborationRecipient } from "../build_collaboration_recipient_access";
import type { Doc, Id, MutationCtx } from "../types";
import {
  DISPATCH_LEASE_MS,
  MAX_DIGEST_ITEMS,
  type ImmutableBatchPayload,
  type PreparedDeliveryItem,
} from "./contracts";
import {
  loadBatchDeliveries,
  parseBatchPayload,
  parseDeliveryContact,
  parseRenderedItemSnapshot,
  contactMatchesChannel,
  deliveryContactsEqual,
} from "./helpers";
import {
  cancelBuildCollaborationExternalDelivery,
  cancelDeliveryBatch,
  reclaimExpiredDispatch,
  supersedeBatchForDestinationChange,
} from "./attempts";

export async function prepareExternalDeliveryBatch(
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

export async function prepareExistingDeliveryBatch(
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

export async function insertBatchOutbox(
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


export async function dueExternalDeliveries(
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

export async function deliveryGroup(
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

export async function revalidateDelivery(
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

export async function deliveryContact(
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

