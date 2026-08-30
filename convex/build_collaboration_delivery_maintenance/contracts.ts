import type { Doc, Id } from "../types";

export const MAX_DELIVERY_ATTEMPTS = 5;
export const MAX_DIGEST_ITEMS = 100;
export const DISPATCH_LEASE_MS = 10 * 60 * 1000;

export interface PreparedDeliveryItem {
  delivery: Doc<"buildCollaborationExternalDeliveries">;
  item: {
    actionHref: string;
    body: string;
    occurredAt: number;
    title: string;
  };
}

export interface ImmutableBatchPayload {
  channel: "email" | "push";
  deliveryIds: Id<"buildCollaborationExternalDeliveries">[];
  idempotencyKey: string;
  items: PreparedDeliveryItem["item"][];
  recipientWorkosUserId: string;
}

export type DeliveryContact =
  | { email: string }
  | {
      subscriptions: Array<{
        auth: string;
        endpoint: string;
        p256dh: string;
      }>;
    };

export interface CompleteExternalDeliveryInput {
  error?: string;
  eventOutboxId: Id<"eventOutbox">;
  providerMessageId?: string;
  responseCode?: number;
  succeeded: boolean;
  timestamp?: number;
}

