import { v } from "convex/values";

export const BUILD_COLLABORATION_WEBHOOK_PAYLOAD_VERSION = "2026-08-01";

export const BUILD_COLLABORATION_WEBHOOK_EVENT_TYPES = [
  "build.collaboration.post.published",
  "build.collaboration.comment.published",
  "build.collaboration.thread.resolved",
  "build.collaboration.thread.reopened",
  "build.collaboration.action_item.transitioned",
  "build.collaboration.asset.version_published",
  "build.collaboration.moderation.changed",
  "build.collaboration.build.closed",
  "build.collaboration.build.reopened",
] as const;

export type BuildCollaborationWebhookEventType =
  (typeof BUILD_COLLABORATION_WEBHOOK_EVENT_TYPES)[number];

export interface BuildCollaborationWebhookDispatchContext {
  body: string;
  deliveryId: string;
  endpointUrl: string;
  eventType: BuildCollaborationWebhookEventType;
  leaseToken: string;
  secretVersion: number;
  sequence: number;
  signingSecret: string;
}

export const buildCollaborationWebhookEventTypeValidator = v.union(
  ...BUILD_COLLABORATION_WEBHOOK_EVENT_TYPES.map((eventType) =>
    v.literal(eventType)
  )
);

export const buildCollaborationWebhookEndpointStatusValidator = v.union(
  v.literal("active"),
  v.literal("disabled"),
  v.literal("revoked")
);

export const buildCollaborationWebhookDeliveryStatusValidator = v.union(
  v.literal("pending"),
  v.literal("delivering"),
  v.literal("delivered"),
  v.literal("failed"),
  v.literal("cancelled")
);

export const buildCollaborationWebhookAttemptStatusValidator = v.union(
  v.literal("delivered"),
  v.literal("failed"),
  v.literal("cancelled")
);
