import { internal } from "../_generated/api";
import { nextBuildCollaborationRetryAt } from "../build_collaboration_delivery_model";
import type { Doc, Id, MutationCtx } from "../types";
import {
  DISPATCH_LEASE_MS,
  MAX_DELIVERY_ATTEMPTS,
  MAX_DIGEST_ITEMS,
  type CompleteExternalDeliveryInput,
} from "./contracts";
import { loadBatchDeliveries, redactFailedOutbox } from "./helpers";

export async function completeExternalDeliveryAttempt(
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

export async function patchCompletedDeliveryRows(
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

export async function completeSendingAttempt(
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

export async function cancelDeliveryBatch(
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

export async function supersedeBatchForDestinationChange(
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


export async function reclaimExpiredDispatch(
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


