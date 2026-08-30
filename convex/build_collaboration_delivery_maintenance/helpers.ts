import type { Doc, Id, MutationCtx } from "../types";
import type {
  DeliveryContact,
  ImmutableBatchPayload,
  PreparedDeliveryItem,
} from "./contracts";

export async function loadBatchDeliveries(
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

export async function redactFailedOutbox(
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

export function parseRenderedItemSnapshot(value: string) {
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

export function parseBatchPayload(value: string): ImmutableBatchPayload | null {
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

export function parseDeliveryContact(value: string): DeliveryContact | null {
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

export function contactMatchesChannel(
  contact: DeliveryContact,
  channel: "email" | "push"
) {
  return channel === "email" ? "email" in contact : "subscriptions" in contact;
}

export function deliveryContactsEqual(left: DeliveryContact, right: DeliveryContact) {
  return JSON.stringify(left) === JSON.stringify(right);
}

