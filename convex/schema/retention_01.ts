import { defineTable } from "convex/server";
import { v } from "convex/values";

export const schemaTables = {
  dataRetentionTenantPolicies: defineTable({
    organizationId: v.string(),
    brokerageId: v.id("brokerages"),
    baselineYears: v.number(),
    extensionDays: v.number(),
    version: v.number(),
    state: v.union(v.literal("active"), v.literal("superseded")),
    reason: v.string(),
    createdByWorkosUserId: v.string(),
    createdAt: v.number(),
    supersededAt: v.optional(v.number()),
  })
    .index("by_organizationId_and_state", ["organizationId", "state"])
    .index("by_organizationId_and_version", ["organizationId", "version"]),
  dataRetentionSchedules: defineTable({
    organizationId: v.string(),
    brokerageId: v.id("brokerages"),
    buildId: v.id("activeBuilds"),
    policyId: v.id("dataRetentionTenantPolicies"),
    policyVersion: v.number(),
    state: v.union(
      v.literal("active"),
      v.literal("restricted_archive"),
      v.literal("eligible"),
      v.literal("held"),
      v.literal("purged")
    ),
    revision: v.number(),
    buildClosedAt: v.optional(v.number()),
    loanClosedAt: v.optional(v.number()),
    laterClosureAt: v.optional(v.number()),
    baselineRetainUntil: v.optional(v.number()),
    retainUntil: v.optional(v.number()),
    derivedAt: v.number(),
    lastReconciledAt: v.optional(v.number()),
    restrictedArchiveAt: v.optional(v.number()),
    purgedAt: v.optional(v.number()),
  })
    .index("by_buildId", ["buildId"])
    .index("by_organizationId_and_state", ["organizationId", "state"])
    .index("by_state_and_retainUntil", ["state", "retainUntil"]),
  dataRetentionFanoutRuns: defineTable({
    runKey: v.string(),
    mode: v.union(
      v.literal("archive"),
      v.literal("maintenance"),
      v.literal("reconcile")
    ),
    organizationId: v.optional(v.string()),
    cursor: v.optional(v.string()),
    state: v.union(
      v.literal("running"),
      v.literal("retry_scheduled"),
      v.literal("completed"),
      v.literal("failed")
    ),
    attemptCount: v.number(),
    failureCount: v.number(),
    failureReason: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
    completedAt: v.optional(v.number()),
  }).index("by_runKey", ["runKey"]),
  dataRetentionFanoutBuildFailures: defineTable({
    runKey: v.string(),
    organizationId: v.string(),
    buildId: v.id("activeBuilds"),
    mode: v.union(
      v.literal("archive"),
      v.literal("maintenance"),
      v.literal("reconcile")
    ),
    state: v.union(
      v.literal("retry_scheduled"),
      v.literal("resolved"),
      v.literal("failed")
    ),
    failureCount: v.number(),
    failureReason: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
    resolvedAt: v.optional(v.number()),
  }).index("by_runKey_and_buildId", ["runKey", "buildId"]),
  dataRetentionOperations: defineTable({
    organizationId: v.string(),
    brokerageId: v.id("brokerages"),
    buildId: v.optional(v.id("activeBuilds")),
    scopeKind: v.string(),
    scopeId: v.string(),
    operationKey: v.string(),
    operationKind: v.union(
      v.literal("quote_draft"),
      v.literal("cost_upload"),
      v.literal("isolated_asset"),
      v.literal("credential_verifier"),
      v.literal("communication_payload"),
      v.literal("physical_file"),
      v.literal("build_purge"),
      v.literal("retention_reminder"),
      v.literal("restore")
    ),
    state: v.union(
      v.literal("started"),
      v.literal("blocked"),
      v.literal("completed"),
      v.literal("failed")
    ),
    reasonCode: v.string(),
    startedAt: v.number(),
    updatedAt: v.number(),
    completedAt: v.optional(v.number()),
    attemptCount: v.optional(v.number()),
    failureReason: v.optional(v.string()),
    affectedCount: v.optional(v.number()),
    blockReason: v.optional(v.string()),
  })
    .index("by_operationKey", ["organizationId", "operationKey"])
    .index("by_organizationId_and_startedAt", ["organizationId", "startedAt"])
    .index("by_buildId_and_operationKind", ["buildId", "operationKind"]),
  dataRetentionTombstones: defineTable({
    organizationId: v.string(),
    brokerageId: v.id("brokerages"),
    buildId: v.optional(v.id("activeBuilds")),
    scopeKind: v.string(),
    scopeId: v.string(),
    operationId: v.id("dataRetentionOperations"),
    lifecycleState: v.string(),
    revisionCount: v.optional(v.number()),
    sourceProofHmacSha256: v.optional(v.string()),
    physicalStorageDeletedAt: v.optional(v.number()),
    completedAt: v.number(),
    tombstoneExpiresAt: v.number(),
    auditEventId: v.optional(v.id("auditEvents")),
  })
    .index("by_scopeKind_and_scopeId", ["scopeKind", "scopeId"])
    .index("by_organizationId_and_completedAt", [
      "organizationId",
      "completedAt",
    ])
    .index("by_tombstoneExpiresAt", ["tombstoneExpiresAt"]),
  dataRetentionBackupManifests: defineTable({
    organizationId: v.string(),
    brokerageId: v.id("brokerages"),
    backupDate: v.string(),
    capturedAt: v.number(),
    rpoDeadlineAt: v.number(),
    documentsCount: v.number(),
    buildCount: v.number(),
    relationshipCount: v.number(),
    revisionLineageCount: v.number(),
    storageObjectsCount: v.number(),
    storageBytes: v.number(),
    manifestSha256: v.string(),
    manifestJson: v.string(),
    // A manifest records controls that are intentionally never persisted in
    // canonical communication tables (for example rendered provider bodies,
    // raw provider payloads, IP addresses, and user agents).
    neverPersistedControls: v.optional(v.array(v.string())),
    state: v.union(
      v.literal("pending"),
      v.literal("verified"),
      v.literal("failed")
    ),
    verifiedAt: v.optional(v.number()),
    failureReason: v.optional(v.string()),
    createdByWorkosUserId: v.optional(v.string()),
  })
    .index("by_organizationId_and_backupDate", ["organizationId", "backupDate"])
    .index("by_organizationId_and_capturedAt", ["organizationId", "capturedAt"])
    .index("by_organizationId_and_state_and_capturedAt", [
      "organizationId",
      "state",
      "capturedAt",
    ]),
  dataRetentionRestoreIncidents: defineTable({
    organizationId: v.string(),
    brokerageId: v.id("brokerages"),
    buildId: v.optional(v.id("activeBuilds")),
    incidentReference: v.string(),
    reason: v.string(),
    breakGlassConfirmed: v.boolean(),
    freshBackupManifestId: v.id("dataRetentionBackupManifests"),
    state: v.union(
      v.literal("started"),
      v.literal("completed"),
      v.literal("failed")
    ),
    startedAt: v.number(),
    targetStartDeadlineAt: v.number(),
    targetCompletionDeadlineAt: v.number(),
    completedAt: v.optional(v.number()),
    correctionHistoryJson: v.string(),
    createdByWorkosUserId: v.string(),
    auditEventId: v.optional(v.id("auditEvents")),
  })
    .index("by_organizationId_and_startedAt", ["organizationId", "startedAt"])
    .index("by_organizationId_and_incidentReference", [
      "organizationId",
      "incidentReference",
    ])
    .index("by_incidentReference", ["incidentReference"]),
  dataRetentionDrills: defineTable({
    organizationId: v.string(),
    brokerageId: v.id("brokerages"),
    quarterKey: v.string(),
    isolatedNamespace: v.string(),
    backupManifestId: v.id("dataRetentionBackupManifests"),
    buildCount: v.number(),
    relationshipCount: v.number(),
    revisionLineageCount: v.number(),
    sampleSha256: v.string(),
    isolationEvidenceSha256: v.string(),
    passed: v.boolean(),
    startedAt: v.number(),
    completedAt: v.optional(v.number()),
    failureReason: v.optional(v.string()),
    createdByWorkosUserId: v.optional(v.string()),
  })
    .index("by_organizationId_and_quarterKey", ["organizationId", "quarterKey"])
    .index("by_isolatedNamespace", ["isolatedNamespace"]),
  dataRetentionReconciliationRuns: defineTable({
    organizationId: v.string(),
    brokerageId: v.id("brokerages"),
    runKey: v.string(),
    asOf: v.number(),
    state: v.union(
      v.literal("started"),
      v.literal("completed"),
      v.literal("failed")
    ),
    scheduleCount: v.number(),
    reminderCount: v.number(),
    outboxCount: v.number(),
    retentionMismatchCount: v.number(),
    backupRpoBreaches: v.number(),
    startedAt: v.number(),
    completedAt: v.optional(v.number()),
    failureReason: v.optional(v.string()),
  })
    .index("by_organizationId_and_runKey", ["organizationId", "runKey"])
    .index("by_organizationId_and_startedAt", ["organizationId", "startedAt"]),
};
