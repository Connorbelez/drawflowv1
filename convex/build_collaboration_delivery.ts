import { v } from "convex/values";

import { internal } from "./_generated/api";
import { authenticatedMutation, authenticatedQuery } from "./authz";
import {
  externalDeliveryPlan,
  nextBuildCollaborationDigestAt,
  nextBuildCollaborationRetryAt,
} from "./build_collaboration_delivery_model";
import {
  BuildCollaborationDeliveryTransportError,
  sendBuildCollaborationExternalPayload,
} from "./build_collaboration_delivery_transport";
import {
  authorizeInboxOrganization,
  projectAuthorizedCollaborationDelivery,
} from "./build_collaboration_inbox";
import type { BuildCollaborationNotificationKind } from "./build_collaboration_notifications";
import { authorizeBuildCollaborationRecipient } from "./build_collaboration_recipient_access";
import { authorizeActiveBuildCollaborationAccess } from "./build_collaboration_rollout";
import { internalAction, internalMutation } from "./fluent";
import type { ActionCtx, Doc, Id, MutationCtx } from "./types";

const MAX_DELIVERY_ATTEMPTS = 5;
const MAX_DIGEST_ITEMS = 100;
const DISPATCH_LEASE_MS = 10 * 60 * 1000;
const DELIVERY_MAINTENANCE_BATCH_SIZE = 200;
const unsentDeliveryStatuses = ["queued", "failed", "dispatched"] as const;
type UnsentDeliveryStatus = (typeof unsentDeliveryStatuses)[number];

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
const deliveryCadenceValidator = v.union(
  v.literal("immediate"),
  v.literal("daily"),
  v.literal("weekly")
);
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

export async function enqueueBuildCollaborationExternalDeliveries(
  ctx: MutationCtx,
  input: {
    brokerageId: Id<"brokerages">;
    buildId: Id<"activeBuilds">;
    channels?: Array<"in_app" | "email" | "push">;
    digestCadence?: "daily" | "weekly" | "never";
    digestEnabled?: boolean;
    kind: BuildCollaborationNotificationKind;
    now: number;
    ordinaryMuted?: boolean;
    organizationId: string;
    recipientDeliveryId: Id<"recipientDeliveries">;
    recipientWorkosUserId: string;
  }
) {
  const canonical = await ctx.db.get(input.recipientDeliveryId);
  if (!canonical) {
    return;
  }
  const recipientParticipationPeriod =
    await currentRecipientParticipationPeriod(ctx, {
      buildId: input.buildId,
      recipientWorkosUserId: input.recipientWorkosUserId,
    });
  let queuedImmediateDelivery = false;
  const targets = externalDeliveryPlan(input);
  for (const target of targets) {
    const existing = await ctx.db
      .query("buildCollaborationExternalDeliveries")
      .withIndex("by_recipientDeliveryId_and_channel", (query) =>
        query
          .eq("recipientDeliveryId", input.recipientDeliveryId)
          .eq("channel", target.channel)
      )
      .unique();
    if (existing) {
      queuedImmediateDelivery ||= await rescheduleExistingExternalDelivery(
        ctx,
        existing,
        target,
        input.now
      );
      continue;
    }
    await ctx.db.insert("buildCollaborationExternalDeliveries", {
      attemptCount: 0,
      brokerageId: input.brokerageId,
      buildId: input.buildId,
      cadence: target.cadence,
      channel: target.channel,
      collaborationActionItemId: canonical.collaborationActionItemId,
      collaborationAssetId: canonical.collaborationAssetId,
      collaborationCommentId: canonical.collaborationCommentId,
      collaborationPostId: canonical.collaborationPostId,
      collaborationReferenceId: canonical.collaborationReferenceId,
      createdAt: input.now,
      dedupeKey: `build-collaboration-external:${input.recipientDeliveryId}:${target.channel}`,
      deliveryMode: target.cadence === "immediate" ? "immediate" : "digest",
      eventKind: input.kind,
      organizationId: input.organizationId,
      recipientDeliveryId: input.recipientDeliveryId,
      recipientParticipationPeriod,
      recipientWorkosUserId: input.recipientWorkosUserId,
      scheduledFor:
        target.cadence === "immediate"
          ? input.now
          : nextBuildCollaborationDigestAt(input.now, target.cadence),
      status: "queued",
      updatedAt: input.now,
    });
    queuedImmediateDelivery ||= target.cadence === "immediate";
  }
  if (queuedImmediateDelivery) {
    await ctx.scheduler.runAfter(
      0,
      internal.build_collaboration_delivery
        .processBuildCollaborationExternalDeliveries,
      { asOf: input.now, batchSize: 100 }
    );
  }
}

async function rescheduleExistingExternalDelivery(
  ctx: MutationCtx,
  existing: Doc<"buildCollaborationExternalDeliveries">,
  target: ReturnType<typeof externalDeliveryPlan>[number],
  now: number
) {
  if (existing.status === "sent") {
    return false;
  }
  if (existing.status === "dispatched") {
    await cancelDelivery(ctx, existing, now, "notification_preference_changed");
  }
  await ctx.db.patch(existing._id, {
    cadence: target.cadence,
    cancellationReason: undefined,
    cancelledAt: undefined,
    deliveryMode: target.cadence === "immediate" ? "immediate" : "digest",
    lastError: undefined,
    leaseExpiresAt: undefined,
    providerOutboxId: undefined,
    scheduledFor:
      target.cadence === "immediate"
        ? now
        : nextBuildCollaborationDigestAt(now, target.cadence),
    status: "queued",
    updatedAt: now,
  });
  return target.cadence === "immediate";
}

export async function reconcileBuildCollaborationExternalDeliveries(
  ctx: MutationCtx,
  input: {
    brokerageId: Id<"brokerages">;
    buildId: Id<"activeBuilds">;
    channels: Array<"in_app" | "email" | "push">;
    digestCadence: "daily" | "weekly" | "never";
    digestEnabled: boolean;
    now: number;
    ordinaryMuted: boolean;
    organizationId: string;
    recipientWorkosUserId: string;
  }
) {
  for (const status of unsentDeliveryStatuses) {
    await reconcileExternalDeliveryPage(ctx, input, status, null);
  }
}

export async function cancelQueuedBuildCollaborationExternalDeliveries(
  ctx: MutationCtx,
  input: {
    buildId: Id<"activeBuilds">;
    cancellationReason: string;
    createdAtThrough?: number;
    now: number;
    participationPeriod?: number;
    recipientWorkosUserId: string;
  }
) {
  let complete = true;
  for (const status of unsentDeliveryStatuses) {
    const currentPeriodComplete = await cancelExternalDeliveryPage(
      ctx,
      input,
      status,
      null,
      false
    );
    const legacyComplete =
      input.participationPeriod === undefined
        ? true
        : await cancelLegacyExternalDeliveryBatch(ctx, input, status);
    complete = currentPeriodComplete && legacyComplete && complete;
  }
  return { complete };
}

async function cancelLegacyExternalDeliveryBatch(
  ctx: MutationCtx,
  input: {
    buildId: Id<"activeBuilds">;
    cancellationReason: string;
    createdAtThrough?: number;
    now: number;
    recipientWorkosUserId: string;
  },
  status: UnsentDeliveryStatus
) {
  const query = ctx.db
    .query("buildCollaborationExternalDeliveries")
    .withIndex("by_buildId_recipientId_period_status_createdAt", (range) => {
      const scoped = range
        .eq("buildId", input.buildId)
        .eq("recipientWorkosUserId", input.recipientWorkosUserId)
        .eq("recipientParticipationPeriod", undefined)
        .eq("status", status);
      return input.createdAtThrough === undefined
        ? scoped
        : scoped.lte("createdAt", input.createdAtThrough);
    });
  const rows = await query.take(DELIVERY_MAINTENANCE_BATCH_SIZE);
  for (const external of rows) {
    await cancelDelivery(ctx, external, input.now, input.cancellationReason);
  }
  return rows.length < DELIVERY_MAINTENANCE_BATCH_SIZE;
}

async function reconcileExternalDeliveryPage(
  ctx: MutationCtx,
  input: {
    brokerageId: Id<"brokerages">;
    buildId: Id<"activeBuilds">;
    channels: Array<"in_app" | "email" | "push">;
    digestCadence: "daily" | "weekly" | "never";
    digestEnabled: boolean;
    now: number;
    ordinaryMuted: boolean;
    organizationId: string;
    recipientWorkosUserId: string;
  },
  status: UnsentDeliveryStatus,
  cursor: string | null
): Promise<void> {
  const page = await ctx.db
    .query("buildCollaborationExternalDeliveries")
    .withIndex("by_buildId_and_recipientWorkosUserId_and_status", (query) =>
      query
        .eq("buildId", input.buildId)
        .eq("recipientWorkosUserId", input.recipientWorkosUserId)
        .eq("status", status)
    )
    .paginate({ cursor, numItems: DELIVERY_MAINTENANCE_BATCH_SIZE });
  for (const external of page.page) {
    if (
      external.organizationId !== input.organizationId ||
      external.brokerageId !== input.brokerageId
    ) {
      continue;
    }
    const target = externalDeliveryPlan({
      channels: input.channels,
      digestCadence: input.digestCadence,
      digestEnabled: input.digestEnabled,
      kind: external.eventKind,
      ordinaryMuted: input.ordinaryMuted,
    }).find((candidate) => candidate.channel === external.channel);
    if (!target) {
      await cancelDelivery(
        ctx,
        external,
        input.now,
        "notification_preference_changed"
      );
      continue;
    }
    await rescheduleExistingExternalDelivery(ctx, external, target, input.now);
  }
  if (!page.isDone) {
    await ctx.scheduler.runAfter(
      0,
      internal.build_collaboration_delivery
        .continueBuildCollaborationExternalDeliveryReconciliation,
      {
        buildId: input.buildId,
        cursor: page.continueCursor,
        organizationId: input.organizationId,
        recipientWorkosUserId: input.recipientWorkosUserId,
        status,
      }
    );
  }
}

async function cancelExternalDeliveryPage(
  ctx: MutationCtx,
  input: {
    buildId: Id<"activeBuilds">;
    cancellationReason: string;
    createdAtThrough?: number;
    now: number;
    participationPeriod?: number;
    recipientWorkosUserId: string;
  },
  status: UnsentDeliveryStatus,
  cursor: string | null,
  scheduleContinuation = true
): Promise<boolean> {
  const deliveryQuery = ctx.db
    .query("buildCollaborationExternalDeliveries")
    .withIndex("by_buildId_recipientId_period_status_createdAt", (query) => {
      const scoped = query
        .eq("buildId", input.buildId)
        .eq("recipientWorkosUserId", input.recipientWorkosUserId)
        .eq("recipientParticipationPeriod", input.participationPeriod)
        .eq("status", status);
      return input.createdAtThrough === undefined
        ? scoped
        : scoped.lte("createdAt", input.createdAtThrough);
    });
  const page = await deliveryQuery.paginate({
    cursor,
    numItems: DELIVERY_MAINTENANCE_BATCH_SIZE,
  });
  for (const external of page.page) {
    if (
      (external.recipientParticipationPeriod !== undefined &&
        input.participationPeriod !== undefined &&
        external.recipientParticipationPeriod !== input.participationPeriod) ||
      (external.recipientParticipationPeriod === undefined &&
        input.createdAtThrough !== undefined &&
        external.createdAt > input.createdAtThrough)
    ) {
      continue;
    }
    await cancelDelivery(ctx, external, input.now, input.cancellationReason);
  }
  if (!page.isDone && scheduleContinuation) {
    await ctx.scheduler.runAfter(
      0,
      internal.build_collaboration_delivery
        .continueBuildCollaborationExternalDeliveryCancellation,
      {
        buildId: input.buildId,
        cancellationReason: input.cancellationReason,
        createdAtThrough: input.createdAtThrough,
        cursor: page.continueCursor,
        recipientWorkosUserId: input.recipientWorkosUserId,
        participationPeriod: input.participationPeriod,
        status,
      }
    );
  }
  return page.isDone;
}

const unsentDeliveryStatusValidator = v.union(
  v.literal("queued"),
  v.literal("failed"),
  v.literal("dispatched")
);

export const continueBuildCollaborationExternalDeliveryReconciliation =
  internalMutation
    .input({
      buildId: v.id("activeBuilds"),
      cursor: v.union(v.string(), v.null()),
      organizationId: v.string(),
      recipientWorkosUserId: v.string(),
      status: unsentDeliveryStatusValidator,
    })
    .returns(v.null())
    .handler(async (ctx, args) => {
      const build = await ctx.db.get(args.buildId);
      if (!build || build.organizationId !== args.organizationId) {
        return null;
      }
      const preference = await ctx.db
        .query("buildCollaborationNotificationPreferences")
        .withIndex("by_buildId_and_workosUserId", (query) =>
          query
            .eq("buildId", build._id)
            .eq("workosUserId", args.recipientWorkosUserId)
        )
        .first();
      await reconcileExternalDeliveryPage(
        ctx,
        {
          brokerageId: build.brokerageId,
          buildId: build._id,
          channels: preference?.channels ?? ["in_app", "email"],
          digestCadence: preference?.digestCadence ?? "never",
          digestEnabled: preference?.digestEnabled ?? false,
          now: Date.now(),
          ordinaryMuted: preference?.ordinaryMuted ?? false,
          organizationId: build.organizationId,
          recipientWorkosUserId: args.recipientWorkosUserId,
        },
        args.status,
        args.cursor
      );
      return null;
    })
    .internal();

export const continueBuildCollaborationExternalDeliveryCancellation =
  internalMutation
    .input({
      buildId: v.id("activeBuilds"),
      cancellationReason: v.string(),
      createdAtThrough: v.optional(v.number()),
      cursor: v.union(v.string(), v.null()),
      recipientWorkosUserId: v.string(),
      participationPeriod: v.optional(v.number()),
      status: unsentDeliveryStatusValidator,
    })
    .returns(v.null())
    .handler(async (ctx, args) => {
      await cancelExternalDeliveryPage(
        ctx,
        {
          buildId: args.buildId,
          cancellationReason: args.cancellationReason,
          createdAtThrough: args.createdAtThrough,
          now: Date.now(),
          participationPeriod: args.participationPeriod,
          recipientWorkosUserId: args.recipientWorkosUserId,
        },
        args.status,
        args.cursor,
        true
      );
      return null;
    })
    .internal();

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
      const group = deliveryGroup(due, seed).slice(0, MAX_DIGEST_ITEMS);
      for (const row of group) {
        consumed.add(row._id);
      }
      const prepared: PreparedDeliveryItem[] = [];
      for (const delivery of group) {
        const item = await revalidateDelivery(ctx, delivery);
        if (!item) {
          await cancelDelivery(ctx, delivery, asOf, "access_revoked");
          continue;
        }
        prepared.push({ delivery, item });
      }
      if (!prepared.length) {
        continue;
      }
      const deliveryIds = prepared.map(({ delivery }) => delivery._id);
      const providerIdempotencyKey =
        seed.batchKey ??
        stableBatchKey(prepared.map(({ delivery }) => delivery));
      const payload = {
        channel: seed.channel,
        deliveryIds,
        idempotencyKey: providerIdempotencyKey,
        items: prepared.map(({ item }) => item),
        recipientWorkosUserId: seed.recipientWorkosUserId,
      };
      const outboxId = await ctx.db.insert("eventOutbox", {
        brokerageId: seed.brokerageId,
        createdAt: asOf,
        eventType: `build_collaboration.external_delivery.${seed.channel}`,
        organizationId: seed.organizationId,
        payloadPreview: JSON.stringify(payload),
        relatedEntityId: seed.buildId,
        relatedEntityType: "buildCollaborationExternalDelivery",
        status: "pending",
      });
      const attemptNumber =
        Math.max(...prepared.map(({ delivery }) => delivery.attemptCount)) + 1;
      for (const { delivery } of prepared) {
        await ctx.db.patch(delivery._id, {
          attemptCount: delivery.attemptCount + 1,
          batchKey: providerIdempotencyKey,
          lastAttemptAt: asOf,
          lastError: undefined,
          leaseExpiresAt: asOf + DISPATCH_LEASE_MS,
          providerOutboxId: outboxId,
          status: "dispatched",
          updatedAt: asOf,
        });
      }
      await ctx.db.insert("buildCollaborationDeliveryAttempts", {
        attemptNumber,
        attemptedAt: asOf,
        brokerageId: seed.brokerageId,
        channel: seed.channel,
        createdAt: asOf,
        deliveryIds,
        organizationId: seed.organizationId,
        providerIdempotencyKey,
        state: "sending",
        updatedAt: asOf,
      });
      outboxIds.push(outboxId);
    }
    return outboxIds;
  })
  .internal();

export const processBuildCollaborationExternalDeliveries = internalAction
  .input({
    asOf: v.optional(v.number()),
    batchSize: v.optional(v.number()),
    now: v.optional(v.number()),
  })
  .returns(v.number())
  .handler(async (ctx, args): Promise<number> => {
    const outboxIds = await ctx.runMutation(
      internal.build_collaboration_delivery
        .prepareDueBuildCollaborationExternalDeliveries,
      args
    );
    for (const eventOutboxId of outboxIds) {
      await dispatchExternalOutbox(ctx, eventOutboxId);
    }
    return outboxIds.length;
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
    const prepared: PreparedDeliveryItem[] = [];
    let invalidated = false;
    for (const delivery of deliveries) {
      const item = await revalidateDelivery(ctx, delivery);
      if (!item) {
        await cancelDelivery(ctx, delivery, Date.now(), "access_revoked");
        invalidated = true;
        continue;
      }
      prepared.push({ delivery, item });
    }
    if (invalidated || !prepared.length) {
      const retryAt = Date.now();
      for (const { delivery } of prepared) {
        await ctx.db.patch(delivery._id, {
          lastError: "Delivery batch was invalidated by an access change.",
          providerOutboxId: undefined,
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
        await cancelDelivery(
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

export const dispatchBuildCollaborationExternalOutbox = internalAction
  .input({ eventOutboxId: v.id("eventOutbox") })
  .returns(v.null())
  .handler(async (ctx, args) => {
    await dispatchExternalOutbox(ctx, args.eventOutboxId);
    return null;
  })
  .internal();

async function dispatchExternalOutbox(
  ctx: ActionCtx,
  eventOutboxId: Id<"eventOutbox">
) {
  const prepared = await ctx.runMutation(
    internal.build_collaboration_delivery
      .prepareBuildCollaborationExternalOutbox,
    { eventOutboxId }
  );
  if (!prepared) {
    return;
  }
  try {
    const response = await sendBuildCollaborationExternalPayload({
      channel: prepared.channel,
      contact: prepared.contact,
      idempotencyKey: prepared.idempotencyKey,
      items: prepared.items,
      recipientWorkosUserId: prepared.recipientWorkosUserId,
    });
    await ctx.runMutation(
      internal.build_collaboration_delivery
        .completeBuildCollaborationExternalDeliveryAttempt,
      {
        eventOutboxId,
        providerMessageId: response.providerMessageId,
        responseCode: response.responseCode,
        succeeded: true,
      }
    );
  } catch (error) {
    await ctx.runMutation(
      internal.build_collaboration_delivery
        .completeBuildCollaborationExternalDeliveryAttempt,
      {
        error: safeDeliveryError(error),
        eventOutboxId,
        responseCode:
          error instanceof BuildCollaborationDeliveryTransportError
            ? error.responseCode
            : undefined,
        succeeded: false,
      }
    );
  }
}

export const registerMyBuildCollaborationPushSubscription =
  authenticatedMutation
    .input({
      auth: v.string(),
      buildId: v.id("activeBuilds"),
      endpoint: v.string(),
      organizationId: v.string(),
      p256dh: v.string(),
    })
    .returns(v.id("buildCollaborationPushSubscriptions"))
    .handler(async (ctx, args) => {
      const authorization = await authorizeActiveBuildCollaborationAccess(
        ctx,
        args
      );
      const endpoint = bounded(args.endpoint, "Push endpoint", 2048);
      const auth = bounded(args.auth, "Push auth key", 512);
      const p256dh = bounded(args.p256dh, "Push public key", 512);
      const now = Date.now();
      const existing = await ctx.db
        .query("buildCollaborationPushSubscriptions")
        .withIndex(
          "by_organizationId_and_workosUserId_and_endpoint",
          (query) =>
          query
            .eq("organizationId", authorization.organizationId)
            .eq("workosUserId", authorization.viewer.subject)
            .eq("endpoint", endpoint)
        )
        .unique();
      if (existing) {
        await ctx.db.patch(existing._id, {
          auth,
          p256dh,
          revokedAt: undefined,
          state: "active",
          updatedAt: now,
        });
        return existing._id;
      }
      return await ctx.db.insert("buildCollaborationPushSubscriptions", {
        auth,
        createdAt: now,
        endpoint,
        organizationId: authorization.organizationId,
        p256dh,
        state: "active",
        updatedAt: now,
        workosUserId: authorization.viewer.subject,
      });
    })
    .public();

export const revokeMyBuildCollaborationPushSubscription = authenticatedMutation
  .input({
    buildId: v.id("activeBuilds"),
    organizationId: v.string(),
    subscriptionId: v.id("buildCollaborationPushSubscriptions"),
  })
  .returns(v.null())
  .handler(async (ctx, args) => {
    const authorization = await authorizeActiveBuildCollaborationAccess(
      ctx,
      args
    );
    const subscription = await ctx.db.get(args.subscriptionId);
    if (
      !subscription ||
      subscription.organizationId !== authorization.organizationId ||
      subscription.workosUserId !== authorization.viewer.subject
    ) {
      throw new Error("Push subscription is unavailable.");
    }
    const now = Date.now();
    await ctx.db.patch(subscription._id, {
      revokedAt: now,
      state: "revoked",
      updatedAt: now,
    });
    return null;
  })
  .public();

export const listMyBuildCollaborationExternalDeliveryActivity =
  authenticatedQuery
    .input({ organizationId: v.string() })
    .returns(
      v.array(
        v.object({
          _id: v.id("buildCollaborationExternalDeliveries"),
          attemptCount: v.number(),
          cadence: v.optional(deliveryCadenceValidator),
          channel: externalChannelValidator,
          createdAt: v.number(),
          safeError: v.optional(v.string()),
          scheduledFor: v.number(),
          status: v.union(
            v.literal("queued"),
            v.literal("dispatched"),
            v.literal("failed"),
            v.literal("sent"),
            v.literal("cancelled")
          ),
          updatedAt: v.number(),
        })
      )
    )
    .handler(async (ctx, args) => {
      const organizationId = args.organizationId.trim();
      const brokerage = await authorizeInboxOrganization(ctx, organizationId);
      const rows = await ctx.db
        .query("buildCollaborationExternalDeliveries")
        .withIndex(
          "by_organizationId_and_recipientWorkosUserId_and_createdAt",
          (query) =>
          query
            .eq("organizationId", organizationId)
            .eq("recipientWorkosUserId", ctx.viewer.subject)
        )
        .order("desc")
        .take(100);
      return rows
        .filter((row) => row.brokerageId === brokerage._id)
        .map((row) => ({
          _id: row._id,
          attemptCount: row.attemptCount,
          cadence: row.cadence,
          channel: row.channel,
          createdAt: row.createdAt,
          safeError: row.lastError,
          scheduledFor: row.scheduledFor,
          status: row.status,
          updatedAt: row.updatedAt,
        }));
    })
    .public();

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

function deliveryGroup(
  due: Doc<"buildCollaborationExternalDeliveries">[],
  seed: Doc<"buildCollaborationExternalDeliveries">
) {
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
      row.batchKey === seed.batchKey
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
    .withIndex(
      "by_organizationId_and_workosUserId_and_state",
      (query) =>
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

async function currentRecipientParticipationPeriod(
  ctx: MutationCtx,
  input: {
    buildId: Id<"activeBuilds">;
    recipientWorkosUserId: string;
  }
) {
  const participant = await ctx.db
    .query("buildParticipants")
    .withIndex("by_buildId_and_workosUserId", (query) =>
      query
        .eq("buildId", input.buildId)
        .eq("workosUserId", input.recipientWorkosUserId)
    )
    .order("desc")
    .filter((query) => query.neq(query.field("status"), "removed"))
    .first();
  return participant?.participationPeriod;
}

async function cancelDelivery(
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
    .map((delivery) => delivery.dedupeKey)
    .sort()
    .join(":");
  let hash = 7;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) % 2_147_483_647;
  }
  return `build-collaboration-delivery:${hash.toString(36)}`;
}

function bounded(value: string, label: string, maximum: number) {
  const normalized = value.trim();
  if (!normalized || normalized.length > maximum) {
    throw new Error(`${label} must contain 1 to ${maximum} characters.`);
  }
  return normalized;
}

function safeDeliveryError(error: unknown) {
  if (error instanceof BuildCollaborationDeliveryTransportError) {
    return error.message;
  }
  if (error instanceof Error && error.message.includes("not configured")) {
    return error.message;
  }
  return "External delivery failed.";
}
