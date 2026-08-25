import { defineTable } from "convex/server";
import { v } from "convex/values";
import * as schemaValidators from "./validators";
import {
  buildCollaborationNotificationChannelValidator,
  buildCollaborationNotificationKindValidator,
} from "../build_collaboration_validators";

export const schemaTables = {
  buildCollaborationNotificationPreferences: defineTable({
    organizationId: v.string(),
    brokerageId: v.id("brokerages"),
    buildId: v.id("activeBuilds"),
    workosUserId: v.string(),
    ordinaryMuted: v.boolean(),
    digestEnabled: v.boolean(),
    digestCadence: v.union(
      v.literal("daily"),
      v.literal("weekly"),
      v.literal("never")
    ),
    channels: v.array(buildCollaborationNotificationChannelValidator),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_buildId_and_workosUserId", ["buildId", "workosUserId"]),
  buildCollaborationExternalDeliveries: defineTable({
    organizationId: v.string(),
    brokerageId: v.id("brokerages"),
    buildId: v.id("activeBuilds"),
    recipientWorkosUserId: v.string(),
    recipientParticipationPeriod: v.optional(v.number()),
    recipientDeliveryId: v.optional(v.id("recipientDeliveries")),
    channel: v.union(v.literal("email"), v.literal("push")),
    deliveryMode: v.union(v.literal("immediate"), v.literal("digest")),
    cadence: v.optional(
      schemaValidators.buildCollaborationDeliveryCadenceValidator
    ),
    eventKind: buildCollaborationNotificationKindValidator,
    dedupeKey: v.string(),
    batchId: v.optional(v.id("buildCollaborationDeliveryBatches")),
    batchKey: v.optional(v.string()),
    batchRevision: v.optional(v.number()),
    renderedItemSnapshot: v.optional(v.string()),
    collaborationPostId: v.optional(v.id("buildCollaborationPosts")),
    collaborationPostRevisionId: v.optional(
      v.id("buildCollaborationPostRevisions")
    ),
    collaborationCommentId: v.optional(v.id("buildCollaborationComments")),
    collaborationCommentRevisionId: v.optional(
      v.id("buildCollaborationCommentRevisions")
    ),
    collaborationActionItemId: v.optional(v.id("buildActionItems")),
    collaborationReferenceId: v.optional(v.id("buildCollaborationReferences")),
    collaborationAssetId: v.optional(v.id("buildCollaborationAssets")),
    status: schemaValidators.buildCollaborationExternalDeliveryStatusValidator,
    scheduledFor: v.number(),
    attemptCount: v.number(),
    providerOutboxId: v.optional(v.id("eventOutbox")),
    lastAttemptAt: v.optional(v.number()),
    leaseExpiresAt: v.optional(v.number()),
    lastError: v.optional(v.string()),
    cancellationReason: v.optional(v.string()),
    cancelledAt: v.optional(v.number()),
    sentAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_buildId", ["buildId"])
    .index("by_buildId_and_collaborationActionItemId", [
      "buildId",
      "collaborationActionItemId",
    ])
    .index("by_status_and_scheduledFor", ["status", "scheduledFor"])
    .index("by_status_and_leaseExpiresAt", ["status", "leaseExpiresAt"])
    .index("by_providerOutboxId", ["providerOutboxId"])
    .index("by_batchKey_and_status", ["batchKey", "status"])
    .index("by_organizationId_and_recipientWorkosUserId_and_dedupeKey", [
      "organizationId",
      "recipientWorkosUserId",
      "dedupeKey",
    ])
    .index("by_recipientDeliveryId_and_channel", [
      "recipientDeliveryId",
      "channel",
    ])
    .index("by_organizationId_and_recipientWorkosUserId_and_createdAt", [
      "organizationId",
      "recipientWorkosUserId",
      "createdAt",
    ])
    .index("by_buildId_and_recipientWorkosUserId_and_status", [
      "buildId",
      "recipientWorkosUserId",
      "status",
    ])
    .index("by_buildId_and_recipientWorkosUserId_and_status_and_createdAt", [
      "buildId",
      "recipientWorkosUserId",
      "status",
      "createdAt",
    ]),
};
