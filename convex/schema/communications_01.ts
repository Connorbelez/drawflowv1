import { defineTable } from "convex/server";
import { v } from "convex/values";
import * as schemaValidators from "./validators";
import { buildCollaborationNotificationKindValidator } from "../build_collaboration_validators";

export const schemaTables = {
  emailMessages: defineTable({
    brokerageId: v.id("brokerages"),
    buildId: v.optional(v.id("activeBuilds")),
    organizationId: v.string(),
    idempotencyKey: v.string(),
    relatedEntityType: v.string(),
    relatedEntityId: v.string(),
    recipientEmail: v.string(),
    sender: v.string(),
    subject: v.string(),
    resendEmailId: v.string(),
    status: schemaValidators.emailMessageStatusValidator,
    lastError: v.optional(v.string()),
    providerCreatedAt: v.optional(v.number()),
    finalizedAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
    communicationIntentId: v.optional(v.id("communicationIntents")),
    communicationAttemptId: v.optional(v.id("communicationAttempts")),
    providerEventType: v.optional(
      schemaValidators.resendEmailEventTypeValidator
    ),
  })
    .index("by_organization_and_idempotencyKey", [
      "organizationId",
      "idempotencyKey",
    ])
    .index("by_resendEmailId", ["resendEmailId"])
    .index("by_entity_and_createdAt", [
      "relatedEntityType",
      "relatedEntityId",
      "createdAt",
    ])
    .index("by_organization_status_updatedAt", [
      "organizationId",
      "status",
      "updatedAt",
    ])
    .index("by_communicationIntentId_and_createdAt", [
      "communicationIntentId",
      "createdAt",
    ]),
  emailDeliveryEvents: defineTable({
    brokerageId: v.id("brokerages"),
    organizationId: v.string(),
    emailMessageId: v.id("emailMessages"),
    resendEmailId: v.string(),
    eventFingerprint: v.string(),
    eventType: schemaValidators.resendEmailEventTypeValidator,
    providerCreatedAt: v.number(),
    receivedAt: v.number(),
    safeDetail: v.optional(v.string()),
  })
    .index("by_eventFingerprint", ["eventFingerprint"])
    .index("by_emailMessageId_and_providerCreatedAt", [
      "emailMessageId",
      "providerCreatedAt",
    ])
    .index("by_organization_and_receivedAt", ["organizationId", "receivedAt"]),
  communicationIntents: defineTable({
    brokerageId: v.id("brokerages"),
    organizationId: v.string(),
    buildId: v.optional(v.id("activeBuilds")),
    channel: v.literal("email"),
    kind: schemaValidators.communicationIntentKindValidator,
    status: schemaValidators.communicationIntentStatusValidator,
    idempotencyKey: v.string(),
    templateKey: v.string(),
    payloadSnapshot: v.string(),
    recipientEmailSnapshot: v.string(),
    recipientNameSnapshot: v.optional(v.string()),
    relatedEntityType: v.string(),
    relatedEntityId: v.string(),
    quoteRoundId: v.optional(v.id("quoteRounds")),
    quoteRoundInvitationId: v.optional(v.id("quoteRoundInvitations")),
    quotePackageRevisionId: v.optional(v.id("quotePackageRevisions")),
    quoteInvitationAccessCredentialId: v.optional(
      v.id("quoteInvitationAccessCredentials")
    ),
    attemptCount: v.number(),
    nextAttemptAt: v.number(),
    lastAttemptAt: v.optional(v.number()),
    lastOutcomeAt: v.optional(v.number()),
    lastError: v.optional(v.string()),
    suppressionReason: v.optional(v.string()),
    actionRequiredReason: v.optional(v.string()),
    supersededByCommunicationIntentId: v.optional(v.id("communicationIntents")),
    providerEmailMessageId: v.optional(v.id("emailMessages")),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_organizationId_and_idempotencyKey", [
      "organizationId",
      "idempotencyKey",
    ])
    .index("by_status_and_nextAttemptAt", ["status", "nextAttemptAt"])
    .index("by_quoteRoundInvitationId_and_createdAt", [
      "quoteRoundInvitationId",
      "createdAt",
    ])
    .index("by_relatedEntityType_and_relatedEntityId_and_createdAt", [
      "relatedEntityType",
      "relatedEntityId",
      "createdAt",
    ])
    .index("by_organizationId_and_createdAt", ["organizationId", "createdAt"])
    .index("by_organizationId_and_kind_and_createdAt", [
      "organizationId",
      "kind",
      "createdAt",
    ]),
  communicationProviderReservations: defineTable({
    organizationId: v.string(),
    communicationIntentId: v.id("communicationIntents"),
    communicationAttemptId: v.id("communicationAttempts"),
    communicationKind: v.optional(
      schemaValidators.communicationIntentKindValidator
    ),
    lenderPortalReleaseAccessRevision: v.optional(v.number()),
    state: v.union(
      v.literal("active"),
      v.literal("released"),
      v.literal("expired")
    ),
    leaseExpiresAt: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
    releasedAt: v.optional(v.number()),
  })
    .index("by_organizationId_and_state_and_leaseExpiresAt", [
      "organizationId",
      "state",
      "leaseExpiresAt",
    ])
    .index("by_org_kind_state_lease", [
      "organizationId",
      "communicationKind",
      "state",
      "leaseExpiresAt",
    ])
    .index("by_state_and_leaseExpiresAt", ["state", "leaseExpiresAt"])
    .index("by_communicationAttemptId", ["communicationAttemptId"]),
  communicationAttempts: defineTable({
    brokerageId: v.id("brokerages"),
    organizationId: v.string(),
    buildId: v.optional(v.id("activeBuilds")),
    communicationIntentId: v.id("communicationIntents"),
    // Required for new claims and optional for historical attempts. Release
    // draining can restore the exact queued/retryable state after abandoning a
    // claim without fabricating another intent or consuming its retry budget.
    claimedFromStatus: v.optional(
      v.union(v.literal("pending"), v.literal("retry_scheduled"))
    ),
    attemptNumber: v.number(),
    state: schemaValidators.communicationAttemptStateValidator,
    startedAt: v.number(),
    finishedAt: v.optional(v.number()),
    providerEmailMessageId: v.optional(v.id("emailMessages")),
    providerResendEmailId: v.optional(v.string()),
    retryAt: v.optional(v.number()),
    safeError: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_communicationIntentId_and_attemptNumber", [
      "communicationIntentId",
      "attemptNumber",
    ])
    .index("by_communicationIntentId_and_createdAt", [
      "communicationIntentId",
      "createdAt",
    ])
    .index("by_organizationId_and_createdAt", ["organizationId", "createdAt"]),
  communicationOutcomes: defineTable({
    brokerageId: v.id("brokerages"),
    organizationId: v.string(),
    buildId: v.optional(v.id("activeBuilds")),
    communicationIntentId: v.id("communicationIntents"),
    communicationAttemptId: v.optional(v.id("communicationAttempts")),
    eventFingerprint: v.string(),
    outcomeType: schemaValidators.communicationOutcomeTypeValidator,
    providerResendEmailId: v.optional(v.string()),
    providerCreatedAt: v.number(),
    receivedAt: v.number(),
    precedence: v.number(),
    safeDetail: v.optional(v.string()),
  })
    .index("by_eventFingerprint", ["eventFingerprint"])
    .index("by_communicationIntentId_and_providerCreatedAt", [
      "communicationIntentId",
      "providerCreatedAt",
    ])
    .index("by_organizationId_and_receivedAt", [
      "organizationId",
      "receivedAt",
    ]),
  communicationSweepStates: defineTable({
    createdAt: v.number(),
    cursor: v.optional(v.string()),
    kind: v.literal("quote_invitation_reminders"),
    lastRoundUpdatedAt: v.optional(v.number()),
    sweepStartedAt: v.optional(v.number()),
    updatedAt: v.number(),
  }).index("by_kind", ["kind"]),
  recipientDeliveries: defineTable({
    actionLabel: v.string(),
    actionRequired: v.boolean(),
    body: v.string(),
    brokerageId: v.id("brokerages"),
    collaborationActionItemId: v.optional(v.id("buildActionItems")),
    collaborationAssetId: v.optional(v.id("buildCollaborationAssets")),
    collaborationBuildId: v.optional(v.id("activeBuilds")),
    collaborationBuildSubmilestoneId: v.optional(v.id("buildSubmilestones")),
    collaborationCommentId: v.optional(v.id("buildCollaborationComments")),
    collaborationEventKind: v.optional(
      buildCollaborationNotificationKindValidator
    ),
    collaborationPostId: v.optional(v.id("buildCollaborationPosts")),
    collaborationReferenceId: v.optional(v.id("buildCollaborationReferences")),
    createdAt: v.number(),
    dedupeKey: v.string(),
    entityId: v.string(),
    entityLabel: v.string(),
    entityType: v.string(),
    href: v.string(),
    inAppVisible: v.optional(v.boolean()),
    organizationId: v.string(),
    recipientWorkosUserId: v.string(),
    resolutionMode: schemaValidators.recipientDeliveryResolutionModeValidator,
    sourceLabel: v.string(),
    status: schemaValidators.recipientDeliveryStatusValidator,
    title: v.string(),
    updatedAt: v.number(),
  })
    .index("by_collaborationBuildId", ["collaborationBuildId"])
    .index("by_collaborationBuildId_and_collaborationActionItemId", [
      "collaborationBuildId",
      "collaborationActionItemId",
    ])
    .index("by_recipient", [
      "organizationId",
      "recipientWorkosUserId",
      "createdAt",
    ])
    .index("by_recipient_dedupe", [
      "organizationId",
      "recipientWorkosUserId",
      "dedupeKey",
    ])
    .index("by_recipient_actionItem_status", [
      "organizationId",
      "recipientWorkosUserId",
      "collaborationActionItemId",
      "status",
    ]),
  operationsQueueHandoffs: defineTable({
    acknowledgementState:
      schemaValidators.operationsHandoffAcknowledgementStateValidator,
    acknowledgedAt: v.optional(v.number()),
    acknowledgedByWorkosUserId: v.optional(v.string()),
    brokerageId: v.id("brokerages"),
    createdAt: v.number(),
    decisionPreview: v.string(),
    escalatedByWorkosUserId: v.string(),
    escalationReason: v.string(),
    evidenceSummary: v.string(),
    followUpAssignment: v.optional(v.string()),
    organizationId: v.string(),
    queueItemId: v.string(),
    recommendation: v.string(),
    requiredAction: v.string(),
    returnDecision: v.optional(
      schemaValidators.operationsHandoffReturnDecisionValidator
    ),
    returnedAt: v.optional(v.number()),
    returnedByWorkosUserId: v.optional(v.string()),
    returnReason: v.optional(v.string()),
    targetHref: v.string(),
    targetLabel: v.string(),
    targetRecordId: v.string(),
    targetType: v.string(),
    updatedAt: v.number(),
    warnings: v.array(v.string()),
  })
    .index("by_brokerage_queue_item", [
      "brokerageId",
      "queueItemId",
      "createdAt",
    ])
    .index("by_organization_updated", ["organizationId", "updatedAt"]),
  integrationEndpoints: defineTable({
    activatedAt: v.optional(v.number()),
    brokerageId: v.id("brokerages"),
    createdAt: v.number(),
    createdByWorkosUserId: v.string(),
    disabledAt: v.optional(v.number()),
    endpointUrl: v.string(),
    eventTypes: v.array(v.string()),
    name: v.string(),
    organizationId: v.string(),
    payloadVersion: v.string(),
    revokedAt: v.optional(v.number()),
    secretFingerprint: v.string(),
    secretHash: v.string(),
    secretVersion: v.number(),
    status: schemaValidators.integrationEndpointStatusValidator,
    updatedAt: v.number(),
    validatedAt: v.optional(v.number()),
  })
    .index("by_organization", ["organizationId", "createdAt"])
    .index("by_brokerage_status", ["brokerageId", "status"]),
  integrationDeliveryAttempts: defineTable({
    attemptNumber: v.number(),
    attemptedAt: v.number(),
    brokerageId: v.id("brokerages"),
    completedAt: v.optional(v.number()),
    createdAt: v.number(),
    deliveryId: v.string(),
    endpointId: v.id("integrationEndpoints"),
    eventId: v.string(),
    eventType: v.string(),
    nextRetryAt: v.optional(v.number()),
    organizationId: v.string(),
    payloadVersion: v.string(),
    responseCode: v.optional(v.number()),
    retryOfAttemptId: v.optional(v.id("integrationDeliveryAttempts")),
    safeError: v.optional(v.string()),
    status: schemaValidators.integrationDeliveryStatusValidator,
    updatedAt: v.number(),
  })
    .index("by_organization_attempted", ["organizationId", "attemptedAt"])
    .index("by_endpoint_attempted", ["endpointId", "attemptedAt"])
    .index("by_event", ["organizationId", "eventId"]),
};
