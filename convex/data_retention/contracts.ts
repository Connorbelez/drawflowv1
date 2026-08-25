import { v } from "convex/values";

export const DAY_MS = 86_400_000;
export const BASELINE_RETENTION_YEARS = 7;
export const QUOTE_DRAFT_RECOVERY_DAYS = 90;
export const COST_UPLOAD_RETENTION_DAYS = 7;
export const ISOLATED_ASSET_RETENTION_DAYS = 30;
export const CREDENTIAL_RETENTION_DAYS = 30;
export const BACKUP_RPO_MS = DAY_MS;
export const RESTORE_START_RTO_MS = 60 * 60 * 1000;
export const RESTORE_COMPLETE_RTO_MS = 8 * 60 * 60 * 1000;
/**
 * Communication telemetry is deliberately never persisted. These controls
 * are carried in backup manifests so operators can prove the minimization
 * contract without introducing a sensitive replay table.
 */
export const NEVER_PERSISTED_RETENTION_CONTROLS = [
  "rendered_provider_body",
  "raw_provider_payload",
  "ip_address",
  "user_agent",
] as const;
export const MAX_ROWS_PER_SWEEP = 100;
export const MAX_FANOUT_ATTEMPTS = 10;
export const MAX_PROVIDER_RESERVATIONS_PER_ORGANIZATION = 100;
export const TOMBSTONE_RETENTION_MS = 2 * 365 * DAY_MS;
export const PRODUCTION_NAMESPACE_PATTERN =
  /(?:^|[-_])(prod|production|live)(?:$|[-_])/i;
export const STORAGE_OBJECT_MISSING_PATTERN = /(non-existent|not found)/i;

export const scheduleValidator = v.object({
  _id: v.id("dataRetentionSchedules"),
  baselineRetainUntil: v.optional(v.number()),
  baselineRetentionYears: v.number(),
  buildClosedAt: v.optional(v.number()),
  buildId: v.id("activeBuilds"),
  lastReconciledAt: v.optional(v.number()),
  loanClosedAt: v.optional(v.number()),
  laterClosureAt: v.optional(v.number()),
  organizationId: v.string(),
  policyVersion: v.number(),
  retainUntil: v.optional(v.number()),
  revision: v.number(),
  state: v.union(
    v.literal("active"),
    v.literal("restricted_archive"),
    v.literal("eligible"),
    v.literal("held"),
    v.literal("purged")
  ),
});

export const sweepResultValidator = v.object({
  completedOperations: v.number(),
  blockedByLegalHold: v.number(),
  deletedOrRedactedCount: v.number(),
  markedRecoveryCount: v.number(),
  tombstoneCount: v.number(),
});

export const backupManifestMetadataValidator = v.object({
  _id: v.id("dataRetentionBackupManifests"),
  backupDate: v.string(),
  buildCount: v.number(),
  capturedAt: v.number(),
  documentsCount: v.number(),
  failureReason: v.optional(v.string()),
  manifestSha256: v.string(),
  neverPersistedControls: v.optional(v.array(v.string())),
  organizationId: v.string(),
  relationshipCount: v.number(),
  revisionLineageCount: v.number(),
  rpoDeadlineAt: v.number(),
  state: v.union(
    v.literal("pending"),
    v.literal("verified"),
    v.literal("failed")
  ),
  storageBytes: v.number(),
  storageObjectsCount: v.number(),
  verifiedAt: v.optional(v.number()),
});

export const retentionBuildPageValidator = v.object({
  continueCursor: v.string(),
  isDone: v.boolean(),
  page: v.array(
    v.object({
      buildId: v.id("activeBuilds"),
      organizationId: v.string(),
    })
  ),
});

export const fanoutModeValidator = v.union(
  v.literal("archive"),
  v.literal("maintenance"),
  v.literal("reconcile")
);

export const fanoutClaimValidator = v.object({
  attemptCount: v.number(),
  completed: v.boolean(),
  cursor: v.optional(v.string()),
  failureCount: v.number(),
});

export const fanoutBuildFailureResultValidator = v.object({
  failureCount: v.number(),
  state: v.union(
    v.literal("retry_scheduled"),
    v.literal("resolved"),
    v.literal("failed")
  ),
});

export const isoDateKey = (timestamp: number) =>
  new Date(timestamp).toISOString().slice(0, 10);

export function baselineRetentionDeadline(closureAt: number) {
  const deadline = new Date(closureAt);
  deadline.setUTCFullYear(deadline.getUTCFullYear() + BASELINE_RETENTION_YEARS);
  return deadline.getTime();
}

export function backupManifestEligibleAt(input: {
  capturedAt: number;
  restoreRequestedAt: number;
  rpoDeadlineAt: number;
}) {
  return (
    input.capturedAt <= input.restoreRequestedAt &&
    input.restoreRequestedAt - input.capturedAt <= BACKUP_RPO_MS &&
    input.rpoDeadlineAt >= input.restoreRequestedAt &&
    input.rpoDeadlineAt - input.capturedAt <= BACKUP_RPO_MS
  );
}
