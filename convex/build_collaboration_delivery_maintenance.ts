import { v } from "convex/values";
import {
  externalDeliveryPlan,
  nextBuildCollaborationRetryAt,
} from "./build_collaboration_delivery_model";
import { projectAuthorizedCollaborationDelivery } from "./build_collaboration_inbox";
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
      v.object({ auth: v.string(), endpoint: v.string(), p256dh: v.string() })
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

async function prepareExternalDeliveryBatch(
  ctx: MutationCtx,
  input: {
    asOf: number;
    group: Doc<"buildCollaborationExternalDeliveries">[];
    seed: Doc<"buildCollaborationExternalDeliveries">;
  }
) {
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
  const deliveryIds = prepared.map(({ delivery }) => delivery._id);
  const providerIdempotencyKey =
    input.seed.batchKey ??
    stableBatchKey(prepared.map(({ delivery }) => delivery));
  const payload = {
    channel: input.seed.channel,
    deliveryIds,
    idempotencyKey: providerIdempotencyKey,
    items: prepared.map(({ item }) => item),
    recipientWorkosUserId: input.seed.recipientWorkosUserId,
  };
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
    const prepared: PreparedDeliveryItem[] = [];
    let invalidated = false;
    for (const delivery of deliveries) {
      const currentItem = await revalidateDelivery(ctx, delivery);
      if (!currentItem) {
        await cancelBuildCollaborationExternalDelivery(
          ctx,
          delivery,
          Date.now(),
          "access_revoked"
        );
        invalidated = true;
        continue;
      }
      const item = delivery.renderedItemSnapshot
        ? parseRenderedItemSnapshot(delivery.renderedItemSnapshot)
        : currentItem;
      if (!item) {
        await cancelBuildCollaborationExternalDelivery(
          ctx,
          delivery,
          Date.now(),
          "invalid_payload_snapshot"
        );
        invalidated = true;
        continue;
      }
      prepared.push({ delivery, item });
    }
    if (invalidated || !prepared.length) {
      const retryAt = Date.now();
      for (const { delivery } of prepared) {
        await ctx.db.patch(delivery._id, {
          batchKey: undefined,
          batchRevision: (delivery.batchRevision ?? 0) + 1,
          lastError: "Delivery batch was invalidated by an access change.",
          providerOutboxId: undefined,
          renderedItemSnapshot: undefined,
          scheduledFor: retryAt,
          status: "queued",
          updatedAt: retryAt,
        });
      }
      await ctx.db.patch(outbox._id, {
        payloadPreview: JSON.stringify({
          reason: "access_revoked",
          redacted: true,
        }),
        processedAt: Date.now(),
        status: "failed",
      });
      return null;
    }
    const seed = prepared[0].delivery;
    const contact = await deliveryContact(ctx, seed);
    if (!contact) {
      for (const { delivery } of prepared) {
        await cancelBuildCollaborationExternalDelivery(
          ctx,
          delivery,
          Date.now(),
          "delivery_contact_unavailable"
        );
      }
      await ctx.db.patch(outbox._id, {
        payloadPreview: JSON.stringify({
          reason: "delivery_contact_unavailable",
          redacted: true,
        }),
        processedAt: Date.now(),
        status: "failed",
      });
      return null;
    }
    const attempt = await ctx.db
      .query("buildCollaborationDeliveryAttempts")
      .withIndex("by_providerIdempotencyKey", (query) =>
        query.eq("providerIdempotencyKey", seed.batchKey ?? "")
      )
      .order("desc")
      .first();
    if (!attempt || attempt.state !== "sending") {
      return null;
    }
    const safePayload = {
      channel: seed.channel,
      deliveryIds: prepared.map(({ delivery }) => delivery._id),
      idempotencyKey: attempt.providerIdempotencyKey,
      items: prepared.map(({ item }) => item),
      recipientWorkosUserId: seed.recipientWorkosUserId,
    };
    await ctx.db.patch(outbox._id, {
      payloadPreview: JSON.stringify(safePayload),
    });
    return {
      attemptId: attempt._id,
      channel: seed.channel,
      contact,
      idempotencyKey: attempt.providerIdempotencyKey,
      items: prepared.map(({ item }) => item),
      recipientWorkosUserId: seed.recipientWorkosUserId,
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
    .handler(async (ctx, args) => {
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
      const safeError = args.error?.slice(0, 280);
      for (const delivery of deliveries) {
        if (delivery.status !== "dispatched") {
          continue;
        }
        if (args.succeeded) {
          await ctx.db.patch(delivery._id, {
            lastError: undefined,
            leaseExpiresAt: undefined,
            sentAt: timestamp,
            status: "sent",
            updatedAt: timestamp,
          });
        } else {
          await ctx.db.patch(delivery._id, {
            lastError: safeError ?? "External delivery failed.",
            leaseExpiresAt: undefined,
            providerOutboxId: undefined,
            scheduledFor: nextBuildCollaborationRetryAt(
              timestamp,
              delivery.attemptCount
            ),
            status:
              delivery.attemptCount >= MAX_DELIVERY_ATTEMPTS
                ? "cancelled"
                : "queued",
            updatedAt: timestamp,
          });
        }
      }
      await ctx.db.patch(outbox._id, {
        processedAt: timestamp,
        status: args.succeeded ? "processed" : "failed",
      });
      const attempt = await ctx.db
        .query("buildCollaborationDeliveryAttempts")
        .withIndex("by_providerIdempotencyKey", (query) =>
          query.eq("providerIdempotencyKey", deliveries[0]?.batchKey ?? "")
        )
        .order("desc")
        .first();
      if (attempt?.state === "sending") {
        await ctx.db.patch(attempt._id, {
          completedAt: timestamp,
          providerMessageId: args.providerMessageId?.slice(0, 280),
          responseCode: args.responseCode,
          safeError,
          state: args.succeeded ? "succeeded" : "failed",
          updatedAt: timestamp,
        });
      }
      return null;
    })
    .internal();

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
  if (seed.deliveryMode === "immediate") {
    return [seed];
  }
  if (seed.batchKey) {
    const queued = await ctx.db
      .query("buildCollaborationExternalDeliveries")
      .withIndex("by_batchKey_and_status", (query) =>
        query.eq("batchKey", seed.batchKey).eq("status", "queued")
      )
      .take(MAX_DIGEST_ITEMS);
    const failed = await ctx.db
      .query("buildCollaborationExternalDeliveries")
      .withIndex("by_batchKey_and_status", (query) =>
        query.eq("batchKey", seed.batchKey).eq("status", "failed")
      )
      .take(MAX_DIGEST_ITEMS);
    return [...queued, ...failed]
      .filter((row) => row.scheduledFor <= asOf)
      .sort((left, right) => left.createdAt - right.createdAt);
  }
  return due.filter(
    (row) =>
      row.deliveryMode === "digest" &&
      row.organizationId === seed.organizationId &&
      row.buildId === seed.buildId &&
      row.recipientWorkosUserId === seed.recipientWorkosUserId &&
      row.channel === seed.channel &&
      row.cadence === seed.cadence &&
      row.batchKey === undefined
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
        target.cadence === delivery.cadence
    );
    if (!selected) {
      return null;
    }
    const projected = await projectAuthorizedCollaborationDelivery(
      ctx,
      authorization,
      canonical
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
  const subscription = await ctx.db
    .query("buildCollaborationPushSubscriptions")
    .withIndex("by_organizationId_and_workosUserId_and_state", (query) =>
      query
        .eq("organizationId", delivery.organizationId)
        .eq("workosUserId", delivery.recipientWorkosUserId)
        .eq("state", "active")
    )
    .first();
  return subscription
    ? {
        auth: subscription.auth,
        endpoint: subscription.endpoint,
        p256dh: subscription.p256dh,
      }
    : null;
}

export async function cancelBuildCollaborationExternalDelivery(
  ctx: MutationCtx,
  delivery: Doc<"buildCollaborationExternalDeliveries">,
  now: number,
  reason: string
) {
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

async function reclaimExpiredDispatch(
  ctx: MutationCtx,
  delivery: Doc<"buildCollaborationExternalDeliveries">,
  now: number
) {
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

function stableBatchKey(
  deliveries: Doc<"buildCollaborationExternalDeliveries">[]
) {
  const value = deliveries
    .map((delivery) => `${delivery.dedupeKey}@${delivery.batchRevision ?? 0}`)
    .sort()
    .join(":");
  let hash = 7;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) % 2_147_483_647;
  }
  return `build-collaboration-delivery:${hash.toString(36)}`;
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
