import { defineTable } from "convex/server";
import { v } from "convex/values";
import * as schemaValidators from "./validators";
import {
  buildCollaborationAudienceModeValidator,
  buildCollaborationRoleValidator,
  buildCollaborationTenantStatusValidator,
} from "../build_collaboration_validators";
import {
  buildCollaborationWebhookAttemptStatusValidator,
  buildCollaborationWebhookDeliveryStatusValidator,
  buildCollaborationWebhookEndpointStatusValidator,
  buildCollaborationWebhookEventTypeValidator,
} from "../build_collaboration_webhook_contracts";

export const schemaTables = {
  buildCollaborationDeliveryBatches: defineTable({
    organizationId: v.string(),
    brokerageId: v.id("brokerages"),
    buildId: v.id("activeBuilds"),
    recipientWorkosUserId: v.string(),
    channel: schemaValidators.buildCollaborationExternalChannelValidator,
    cadence: v.optional(
      schemaValidators.buildCollaborationDeliveryCadenceValidator
    ),
    deliveryIds: v.array(v.id("buildCollaborationExternalDeliveries")),
    providerIdempotencyKey: v.string(),
    payloadSnapshot: v.string(),
    contactSnapshot: v.string(),
    state: schemaValidators.buildCollaborationDeliveryBatchStateValidator,
    completedAt: v.optional(v.number()),
    cancelledAt: v.optional(v.number()),
    safeError: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_buildId", ["buildId"])
    .index("by_providerIdempotencyKey", ["providerIdempotencyKey"])
    .index("by_organizationId_and_recipientWorkosUserId_and_createdAt", [
      "organizationId",
      "recipientWorkosUserId",
      "createdAt",
    ]),
  buildCollaborationDeliveryAttempts: defineTable({
    organizationId: v.string(),
    brokerageId: v.id("brokerages"),
    batchId: v.optional(v.id("buildCollaborationDeliveryBatches")),
    deliveryIds: v.array(v.id("buildCollaborationExternalDeliveries")),
    channel: schemaValidators.buildCollaborationExternalChannelValidator,
    attemptNumber: v.number(),
    providerIdempotencyKey: v.string(),
    state: schemaValidators.buildCollaborationDeliveryAttemptStateValidator,
    attemptedAt: v.number(),
    completedAt: v.optional(v.number()),
    responseCode: v.optional(v.number()),
    providerMessageId: v.optional(v.string()),
    safeError: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_organizationId_and_attemptedAt", [
      "organizationId",
      "attemptedAt",
    ])
    .index("by_batchId_and_state", ["batchId", "state"])
    .index("by_providerIdempotencyKey", ["providerIdempotencyKey"]),
  buildCollaborationPushSubscriptions: defineTable({
    organizationId: v.string(),
    buildId: v.optional(v.id("activeBuilds")),
    workosUserId: v.string(),
    endpoint: v.string(),
    p256dh: v.string(),
    auth: v.string(),
    ownershipRevision: v.optional(v.number()),
    state: v.union(v.literal("active"), v.literal("revoked")),
    createdAt: v.number(),
    updatedAt: v.number(),
    revokedAt: v.optional(v.number()),
  })
    .index("by_buildId", ["buildId"])
    .index("by_organizationId_and_workosUserId_and_state", [
      "organizationId",
      "workosUserId",
      "state",
    ])
    .index("by_organizationId_and_workosUserId_and_endpoint", [
      "organizationId",
      "workosUserId",
      "endpoint",
    ])
    .index("by_organizationId_and_workosUserId_and_buildId_and_endpoint", [
      "organizationId",
      "workosUserId",
      "buildId",
      "endpoint",
    ])
    .index("by_organizationId_and_workosUserId_and_buildId_and_state", [
      "organizationId",
      "workosUserId",
      "buildId",
      "state",
    ])
    .index("by_endpoint_and_state", ["endpoint", "state"])
    .index("by_endpoint_and_workosUserId_and_state", [
      "endpoint",
      "workosUserId",
      "state",
    ]),
  buildCollaborationPushEndpointOwners: defineTable({
    endpoint: v.string(),
    workosUserId: v.string(),
    revision: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_endpoint", ["endpoint"]),
  buildCollaborationPushEndpointBuildBindings: defineTable({
    organizationId: v.string(),
    buildId: v.id("activeBuilds"),
    endpoint: v.string(),
    workosUserId: v.string(),
    subscriptionId: v.id("buildCollaborationPushSubscriptions"),
    ownershipRevision: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_buildId_and_endpoint", ["buildId", "endpoint"])
    .index("by_organizationId_and_workosUserId_and_buildId_and_endpoint", [
      "organizationId",
      "workosUserId",
      "buildId",
      "endpoint",
    ]),
  buildCollaborationWebhookEndpoints: defineTable({
    organizationId: v.string(),
    brokerageId: v.id("brokerages"),
    name: v.string(),
    endpointUrl: v.string(),
    payloadVersion: v.string(),
    signingKeyMaterial: v.string(),
    secretFingerprint: v.string(),
    secretVersion: v.number(),
    authorizedByWorkosUserId: v.string(),
    authorizedByRole: buildCollaborationRoleValidator,
    status: buildCollaborationWebhookEndpointStatusValidator,
    revision: v.number(),
    deliveryGeneration: v.number(),
    nextSequence: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
    disabledAt: v.optional(v.number()),
    revokedAt: v.optional(v.number()),
  })
    .index("by_organizationId_and_createdAt", ["organizationId", "createdAt"])
    .index("by_organizationId_and_status", ["organizationId", "status"]),
  buildCollaborationWebhookEndpointEventTypes: defineTable({
    organizationId: v.string(),
    brokerageId: v.id("brokerages"),
    endpointId: v.id("buildCollaborationWebhookEndpoints"),
    eventType: buildCollaborationWebhookEventTypeValidator,
    createdAt: v.number(),
  })
    .index("by_endpointId_and_eventType", ["endpointId", "eventType"])
    .index("by_endpointId", ["endpointId"]),
  buildCollaborationWebhookBuildSequences: defineTable({
    organizationId: v.string(),
    brokerageId: v.id("brokerages"),
    buildId: v.id("activeBuilds"),
    nextSequence: v.number(),
    updatedAt: v.number(),
  }).index("by_buildId", ["buildId"]),
  buildCollaborationWebhookEvents: defineTable({
    organizationId: v.string(),
    brokerageId: v.id("brokerages"),
    buildId: v.id("activeBuilds"),
    sequence: v.number(),
    eventType: buildCollaborationWebhookEventTypeValidator,
    idempotencyKey: v.string(),
    entityType: v.string(),
    entityId: v.string(),
    actorWorkosUserId: v.optional(v.string()),
    actorRole: v.optional(buildCollaborationRoleValidator),
    metadataJson: v.string(),
    payloadVersion: v.string(),
    occurredAt: v.number(),
    createdAt: v.number(),
  })
    .index("by_idempotencyKey", ["idempotencyKey"])
    .index("by_buildId_and_sequence", ["buildId", "sequence"])
    .index("by_organizationId_and_occurredAt", [
      "organizationId",
      "occurredAt",
    ]),
  buildCollaborationWebhookDeliveries: defineTable({
    organizationId: v.string(),
    brokerageId: v.id("brokerages"),
    buildId: v.id("activeBuilds"),
    endpointId: v.id("buildCollaborationWebhookEndpoints"),
    eventId: v.id("buildCollaborationWebhookEvents"),
    deliveryId: v.string(),
    sequence: v.number(),
    status: buildCollaborationWebhookDeliveryStatusValidator,
    attemptCount: v.number(),
    attemptLimit: v.number(),
    endpointGeneration: v.number(),
    tenantAccessRevision: v.number(),
    nextAttemptAt: v.optional(v.number()),
    leaseToken: v.optional(v.string()),
    leaseExpiresAt: v.optional(v.number()),
    leaseSecretVersion: v.optional(v.number()),
    replayKey: v.optional(v.string()),
    replayOfDeliveryId: v.optional(v.id("buildCollaborationWebhookDeliveries")),
    lastAttemptAt: v.optional(v.number()),
    deliveredAt: v.optional(v.number()),
    cancelledAt: v.optional(v.number()),
    failureReason: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_endpointId_and_sequence", ["endpointId", "sequence"])
    .index("by_eventId_and_endpointId", ["eventId", "endpointId"])
    .index("by_status_and_nextAttemptAt", ["status", "nextAttemptAt"])
    .index("by_status_and_leaseExpiresAt", ["status", "leaseExpiresAt"])
    .index("by_endpointId_and_replayKey", ["endpointId", "replayKey"]),
  buildCollaborationWebhookReplayRequests: defineTable({
    organizationId: v.string(),
    brokerageId: v.id("brokerages"),
    buildId: v.id("activeBuilds"),
    endpointId: v.id("buildCollaborationWebhookEndpoints"),
    originalDeliveryId: v.id("buildCollaborationWebhookDeliveries"),
    resultDeliveryId: v.id("buildCollaborationWebhookDeliveries"),
    replayKey: v.string(),
    reason: v.string(),
    requestedByWorkosUserId: v.string(),
    createdAt: v.number(),
  })
    .index("by_endpointId_and_replayKey", ["endpointId", "replayKey"])
    .index("by_originalDeliveryId_and_createdAt", [
      "originalDeliveryId",
      "createdAt",
    ]),
  buildCollaborationWebhookAttempts: defineTable({
    organizationId: v.string(),
    brokerageId: v.id("brokerages"),
    buildId: v.id("activeBuilds"),
    endpointId: v.id("buildCollaborationWebhookEndpoints"),
    eventId: v.id("buildCollaborationWebhookEvents"),
    deliveryId: v.id("buildCollaborationWebhookDeliveries"),
    attemptNumber: v.number(),
    secretVersion: v.number(),
    status: buildCollaborationWebhookAttemptStatusValidator,
    responseCode: v.optional(v.number()),
    safeError: v.optional(v.string()),
    startedAt: v.number(),
    completedAt: v.number(),
  })
    .index("by_deliveryId_and_attemptNumber", ["deliveryId", "attemptNumber"])
    .index("by_organizationId_and_completedAt", [
      "organizationId",
      "completedAt",
    ]),
  buildCollaborationTenantSettings: defineTable({
    organizationId: v.string(),
    brokerageId: v.id("brokerages"),
    status: buildCollaborationTenantStatusValidator,
    // Retention cancellation is distinct from the collaboration rollout
    // status. A restricted archive keeps canonical Build history readable and
    // prevents new writes without making records purge-eligible early.
    serviceLifecycle: v.optional(
      v.union(v.literal("active"), v.literal("restricted_archive"))
    ),
    serviceLifecycleChangedAt: v.optional(v.number()),
    serviceLifecycleChangedByWorkosUserId: v.optional(v.string()),
    serviceLifecycleReason: v.optional(v.string()),
    retentionPolicyKey: v.optional(v.string()),
    generousRateLimitMultiplier: v.number(),
    accessRevision: v.optional(v.number()),
    cutoverEpoch: v.optional(v.number()),
    migrationCompletedAt: v.optional(v.number()),
    activatedAt: v.optional(v.number()),
    activatedByWorkosUserId: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_organizationId", ["organizationId"]),
  buildCollaborationCutoverRehearsals: defineTable({
    organizationId: v.string(),
    brokerageId: v.id("brokerages"),
    representativeBuildId: v.id("activeBuilds"),
    releaseGitCommit: v.string(),
    releaseApplicationVersion: v.string(),
    releaseApplicationUrl: v.string(),
    releaseConvexDeployment: v.string(),
    releaseConvexUrl: v.string(),
    beforeCutoverEpoch: v.number(),
    disabledCutoverEpoch: v.optional(v.number()),
    beforeSnapshotId: v.optional(v.id("buildCollaborationCutoverSnapshots")),
    afterSnapshotId: v.optional(v.id("buildCollaborationCutoverSnapshots")),
    legacyWriteDeniedAt: v.optional(v.number()),
    legacyWriteDenialError: v.optional(v.string()),
    disabledVerifiedAt: v.optional(v.number()),
    status: v.union(
      v.literal("capturing_before"),
      v.literal("before_ready"),
      v.literal("disabled_verified"),
      v.literal("capturing_after"),
      v.literal("complete"),
      v.literal("failed")
    ),
    failureReason: v.optional(v.string()),
    requestedByWorkosUserId: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
    completedAt: v.optional(v.number()),
  })
    .index("by_organizationId_and_createdAt", ["organizationId", "createdAt"])
    .index("by_organizationId_and_status", ["organizationId", "status"]),
  buildCollaborationCutoverSnapshots: defineTable({
    organizationId: v.string(),
    brokerageId: v.id("brokerages"),
    rehearsalId: v.id("buildCollaborationCutoverRehearsals"),
    kind: v.union(v.literal("before"), v.literal("after")),
    auditCutoffAt: v.number(),
    phase: v.union(
      v.literal("posts"),
      v.literal("revisions"),
      v.literal("assets"),
      v.literal("receipts"),
      v.literal("auditEvents"),
      v.literal("complete")
    ),
    cursor: v.optional(v.string()),
    currentHash: v.string(),
    currentCount: v.number(),
    postsHash: v.optional(v.string()),
    postsCount: v.optional(v.number()),
    revisionsHash: v.optional(v.string()),
    revisionsCount: v.optional(v.number()),
    assetsHash: v.optional(v.string()),
    assetsCount: v.optional(v.number()),
    receiptsHash: v.optional(v.string()),
    receiptsCount: v.optional(v.number()),
    auditEventsHash: v.optional(v.string()),
    auditEventsCount: v.optional(v.number()),
    status: v.union(
      v.literal("capturing"),
      v.literal("complete"),
      v.literal("failed")
    ),
    createdAt: v.number(),
    updatedAt: v.number(),
    completedAt: v.optional(v.number()),
  })
    .index("by_rehearsalId_and_kind", ["rehearsalId", "kind"])
    .index("by_organizationId_and_createdAt", ["organizationId", "createdAt"]),
  buildCollaborationCutoverArtifactAttestations: defineTable({
    organizationId: v.string(),
    brokerageId: v.id("brokerages"),
    representativeBuildId: v.id("activeBuilds"),
    rehearsalId: v.id("buildCollaborationCutoverRehearsals"),
    kind: v.union(
      v.literal("migration_preview"),
      v.literal("migration_application"),
      v.literal("migration_replay"),
      v.literal("migration_parity"),
      v.literal("manual_visual_review"),
      v.literal("manual_keyboard_review")
    ),
    artifactSha256: v.string(),
    attestedByWorkosUserId: v.string(),
    attestedByRoles: v.array(v.string()),
    createdAt: v.number(),
  })
    .index("by_rehearsalId_and_kind_and_createdAt", [
      "rehearsalId",
      "kind",
      "createdAt",
    ])
    .index("by_organizationId_and_createdAt", ["organizationId", "createdAt"]),
  buildCollaborationMigrationParityEvidence: defineTable({
    organizationId: v.string(),
    brokerageId: v.id("brokerages"),
    reportHash: v.string(),
    reportVersion: v.optional(v.string()),
    planToken: v.optional(v.string()),
    buildReportCount: v.optional(v.number()),
    cutoverEpoch: v.optional(v.number()),
    migrationRunId: v.optional(
      v.id("buildCollaborationLegacyNoteMigrationRuns")
    ),
    parityRunId: v.optional(v.id("buildCollaborationLegacyNoteParityRuns")),
    verificationSource: v.optional(
      v.union(
        v.literal("operator_attested"),
        v.literal("legacy_note_migration_v1")
      )
    ),
    sourceRecordCount: v.number(),
    importedPostCount: v.number(),
    mismatchCount: v.number(),
    parityPassed: v.boolean(),
    reason: v.optional(v.string()),
    verifiedAt: v.number(),
    verifiedByWorkosUserId: v.string(),
  }).index("by_organizationId_and_verifiedAt", [
    "organizationId",
    "verifiedAt",
  ]),
  buildCollaborationSystemPostBackfillRuns: defineTable({
    organizationId: v.string(),
    brokerageId: v.id("brokerages"),
    buildId: v.id("activeBuilds"),
    planToken: v.string(),
    planVersion: v.string(),
    mode: v.union(v.literal("validate"), v.literal("materialize")),
    batchSize: v.number(),
    phase: v.union(
      v.literal("milestones"),
      v.literal("planned_draws"),
      v.literal("draw_requests"),
      v.literal("complete")
    ),
    status: v.union(
      v.literal("validating"),
      v.literal("running"),
      v.literal("complete"),
      v.literal("blocked")
    ),
    milestoneCursor: v.optional(v.string()),
    plannedDrawCursor: v.optional(v.string()),
    drawRequestCursor: v.optional(v.string()),
    processedMilestoneCount: v.number(),
    processedPlannedDrawCount: v.number(),
    processedDrawRequestCount: v.number(),
    materializedPostCount: v.number(),
    materializedActionItemCount: v.number(),
    skippedCount: v.number(),
    warningCount: v.number(),
    lastError: v.optional(v.string()),
    startedByWorkosUserId: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
    completedAt: v.optional(v.number()),
  })
    .index("by_buildId_and_planToken", ["buildId", "planToken"])
    .index("by_organizationId_and_updatedAt", ["organizationId", "updatedAt"]),
  buildCollaborationLegacyNoteMigrationRuns: defineTable({
    organizationId: v.string(),
    brokerageId: v.id("brokerages"),
    planToken: v.string(),
    planVersion: v.string(),
    sourceRecordCount: v.number(),
    processedBuildCount: v.number(),
    processedNoteCount: v.number(),
    nextImportOrdinal: v.number(),
    blockingWarningCount: v.number(),
    cutoverEpoch: v.optional(v.number()),
    latestBuildCreationTime: v.optional(v.number()),
    latestBuildId: v.optional(v.id("activeBuilds")),
    tokenAccumulator: v.string(),
    validationPhase: v.union(
      v.literal("builds"),
      v.literal("notes"),
      v.literal("complete")
    ),
    validationBuildCursor: v.optional(v.string()),
    validationNoteCursor: v.optional(v.string()),
    status: v.union(
      v.literal("validating"),
      v.literal("importing"),
      v.literal("complete"),
      v.literal("blocked")
    ),
    blockedReason: v.optional(v.string()),
    startedByWorkosUserId: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
    completedAt: v.optional(v.number()),
  })
    .index("by_organizationId_and_planToken", ["organizationId", "planToken"])
    .index("by_organizationId_and_updatedAt", ["organizationId", "updatedAt"]),
  buildCollaborationLegacyNotePlanBuilds: defineTable({
    organizationId: v.string(),
    brokerageId: v.id("brokerages"),
    runId: v.id("buildCollaborationLegacyNoteMigrationRuns"),
    buildId: v.id("activeBuilds"),
    buildName: v.string(),
    ordinal: v.number(),
    snapshotHash: v.string(),
    createdAt: v.number(),
  })
    .index("by_runId_and_ordinal", ["runId", "ordinal"])
    .index("by_runId_and_buildId", ["runId", "buildId"]),
  buildCollaborationLegacyNotePlanNotes: defineTable({
    organizationId: v.string(),
    brokerageId: v.id("brokerages"),
    runId: v.id("buildCollaborationLegacyNoteMigrationRuns"),
    sourceNoteId: v.id("buildNotes"),
    importedSourceId: v.string(),
    buildId: v.id("activeBuilds"),
    ordinal: v.number(),
    snapshotHash: v.string(),
    visibility: v.union(v.literal("internal"), v.literal("public")),
    body: v.string(),
    authorWorkosUserId: v.string(),
    authorRolesSnapshot: v.array(v.string()),
    authorRole: buildCollaborationRoleValidator,
    audienceMode: buildCollaborationAudienceModeValidator,
    audienceFloorTier: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_runId_and_ordinal", ["runId", "ordinal"])
    .index("by_runId_and_sourceNoteId", ["runId", "sourceNoteId"])
    .index("by_runId_and_importedSourceId", ["runId", "importedSourceId"]),
  buildCollaborationLegacyNoteParityRuns: defineTable({
    organizationId: v.string(),
    brokerageId: v.id("brokerages"),
    cutoverEpoch: v.optional(v.number()),
    migrationRunId: v.id("buildCollaborationLegacyNoteMigrationRuns"),
    planToken: v.string(),
    status: v.union(
      v.literal("initializing_builds"),
      v.literal("checking_notes"),
      v.literal("checking_orphans"),
      v.literal("finalizing_builds"),
      v.literal("complete"),
      v.literal("blocked")
    ),
    nextBuildOrdinal: v.number(),
    nextNoteOrdinal: v.number(),
    orphanBuildOrdinal: v.number(),
    orphanPostCursor: v.optional(v.string()),
    finalizeBuildOrdinal: v.number(),
    sourceRecordCount: v.number(),
    importedPostCount: v.number(),
    mismatchCount: v.number(),
    reportHashAccumulator: v.string(),
    evidenceId: v.optional(v.id("buildCollaborationMigrationParityEvidence")),
    blockedReason: v.optional(v.string()),
    startedByWorkosUserId: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
    completedAt: v.optional(v.number()),
  })
    .index("by_organizationId_and_planToken", ["organizationId", "planToken"])
    .index("by_organizationId_and_updatedAt", ["organizationId", "updatedAt"]),
  buildCollaborationLegacyNoteParityBuildReports: defineTable({
    organizationId: v.string(),
    brokerageId: v.id("brokerages"),
    parityRunId: v.id("buildCollaborationLegacyNoteParityRuns"),
    evidenceId: v.optional(v.id("buildCollaborationMigrationParityEvidence")),
    buildId: v.id("activeBuilds"),
    buildOrdinal: v.number(),
    sourceRecordCount: v.number(),
    importedPostCount: v.number(),
    mismatchCount: v.number(),
    parityPassed: v.boolean(),
    roleMatrixJson: v.string(),
    mismatchDetailsJson: v.string(),
    createdAt: v.number(),
  })
    .index("by_parityRunId_and_buildId", ["parityRunId", "buildId"])
    .index("by_parityRunId_and_buildOrdinal", ["parityRunId", "buildOrdinal"])
    .index("by_organizationId_and_createdAt", ["organizationId", "createdAt"]),
  buildCollaborationRetentionPolicies: defineTable({
    organizationId: v.string(),
    brokerageId: v.id("brokerages"),
    policyKey: v.string(),
    version: v.number(),
    retentionDays: v.number(),
    state: v.union(v.literal("active"), v.literal("superseded")),
    createdByWorkosUserId: v.string(),
    createdByRole: buildCollaborationRoleValidator,
    reason: v.string(),
    createdAt: v.number(),
    supersededAt: v.optional(v.number()),
  })
    .index("by_organizationId_and_state", ["organizationId", "state"])
    .index("by_organizationId_and_version", ["organizationId", "version"]),
  buildCollaborationLegalHolds: defineTable({
    organizationId: v.string(),
    brokerageId: v.id("brokerages"),
    buildId: v.id("activeBuilds"),
    state: v.union(v.literal("active"), v.literal("released")),
    reason: v.string(),
    reference: v.optional(v.string()),
    placedByWorkosUserId: v.string(),
    placedByRole: buildCollaborationRoleValidator,
    placedAt: v.number(),
    releasedByWorkosUserId: v.optional(v.string()),
    releasedByRole: v.optional(buildCollaborationRoleValidator),
    releaseReason: v.optional(v.string()),
    releasedAt: v.optional(v.number()),
  })
    .index("by_buildId_and_state", ["buildId", "state"])
    .index("by_organizationId_and_state", ["organizationId", "state"]),
  buildCollaborationBuildStates: defineTable({
    organizationId: v.string(),
    brokerageId: v.id("brokerages"),
    buildId: v.id("activeBuilds"),
    state: v.union(v.literal("open"), v.literal("closed"), v.literal("purged")),
    revision: v.number(),
    contentRevision: v.optional(v.number()),
    archiveSnapshotExportId: v.optional(v.id("buildCollaborationExports")),
    archiveSnapshotStartedAt: v.optional(v.number()),
    archiveSnapshotLeaseExpiresAt: v.optional(v.number()),
    closedAt: v.optional(v.number()),
    closedByWorkosUserId: v.optional(v.string()),
    closedByRole: v.optional(buildCollaborationRoleValidator),
    closeReason: v.optional(v.string()),
    reopenedAt: v.optional(v.number()),
    reopenedByWorkosUserId: v.optional(v.string()),
    reopenedByRole: v.optional(buildCollaborationRoleValidator),
    reopenReason: v.optional(v.string()),
    retentionEligibleAt: v.optional(v.number()),
    retentionPolicyId: v.optional(v.id("buildCollaborationRetentionPolicies")),
    retentionPolicyVersion: v.optional(v.number()),
    purgedAt: v.optional(v.number()),
    purgedByWorkosUserId: v.optional(v.string()),
    purgeReason: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_buildId", ["buildId"])
    .index("by_organizationId_and_state", ["organizationId", "state"]),
  buildCollaborationBuildLifecycleEvents: defineTable({
    organizationId: v.string(),
    brokerageId: v.id("brokerages"),
    buildId: v.id("activeBuilds"),
    eventType: v.union(
      v.literal("closed"),
      v.literal("reopened"),
      v.literal("purged")
    ),
    revision: v.number(),
    actorWorkosUserId: v.string(),
    actorRole: buildCollaborationRoleValidator,
    priorState: v.string(),
    newState: v.string(),
    reason: v.string(),
    createdAt: v.number(),
  }).index("by_buildId_and_createdAt", ["buildId", "createdAt"]),
  buildCollaborationClosureWaivers: defineTable({
    organizationId: v.string(),
    brokerageId: v.id("brokerages"),
    buildId: v.id("activeBuilds"),
    actionItemId: v.id("buildActionItems"),
    lifecycleRevision: v.number(),
    reason: v.string(),
    waivedByWorkosUserId: v.string(),
    waivedByRole: buildCollaborationRoleValidator,
    createdAt: v.number(),
  })
    .index("by_buildId_and_lifecycleRevision", ["buildId", "lifecycleRevision"])
    .index("by_actionItemId", ["actionItemId"]),
};
