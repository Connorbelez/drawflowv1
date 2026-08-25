import type { Doc, Id } from "../_generated/dataModel.js";
import { v } from "convex/values";
import type { MutationCtx, QueryCtx } from "../types.js";
import { lenderPortalPhase9MigrationCountsValidator } from "../lender_portal_phase9_contracts.js";

export const MAX_INVENTORY_PAGE_SIZE = 25;
export const MAX_MANIFEST_PROPOSALS = 100;
export const MAX_MANIFEST_RELATED_ROWS = 500;

export const proposalInventoryValidator = v.object({
  activeBuildCount: v.number(),
  approvalCount: v.number(),
  ambiguityCodes: v.array(v.string()),
  approvedAtRecorded: v.boolean(),
  candidateSha: v.string(),
  closingCount: v.number(),
  currentAssignmentCount: v.number(),
  currentReviewCycleCount: v.number(),
  kanbanCardCount: v.number(),
  openIssueCount: v.number(),
  policyVersionCount: v.number(),
  policyLockCount: v.number(),
  projectionMatches: v.boolean(),
  proposalId: v.id("buildProposals"),
  reviewQueueCounts: v.object({
    completed: v.number(),
    correctionRequired: v.number(),
    inReview: v.number(),
    partialApproval: v.number(),
  }),
  revisionCount: v.number(),
  status: v.string(),
});

export const migrationAuditReadbackValidator = v.object({
  actorRoles: v.array(v.string()),
  actorWorkosUserId: v.string(),
  candidateSha: v.optional(v.string()),
  command: v.string(),
  correlationId: v.optional(v.string()),
  createdAt: v.number(),
  entityId: v.string(),
  entityType: v.string(),
  eventType: v.string(),
  newState: v.optional(v.string()),
  priorState: v.optional(v.string()),
  reconciliationKey: v.string(),
  runToken: v.string(),
  warnings: v.array(v.string()),
});

export const migrationIssueSnapshotValidator = v.object({
  code: v.string(),
  disposition: v.union(v.literal("open"), v.literal("resolved")),
  field: v.string(),
  provenance: v.string(),
  reason: v.string(),
  sourceRecordId: v.string(),
  sourceTable: v.string(),
});

export const migrationRunValidator = v.object({
  candidateSha: v.string(),
  configurationHash: v.string(),
  issueCount: v.number(),
  runToken: v.string(),
  status: v.union(
    v.literal("blocked"),
    v.literal("ready"),
    v.literal("authorized"),
    v.literal("applying"),
    v.literal("verified")
  ),
  workosProjectionWriteCount: v.optional(v.number()),
});

export const migrationRunReadbackValidator = v.object({
  active: v.boolean(),
  candidateSha: v.string(),
  configurationHash: v.string(),
  countsAfter: v.optional(lenderPortalPhase9MigrationCountsValidator),
  countsBefore: lenderPortalPhase9MigrationCountsValidator,
  createdAt: v.number(),
  inventoryFingerprint: v.string(),
  inventoryFingerprintAfter: v.optional(v.string()),
  issueCount: v.number(),
  reason: v.string(),
  runToken: v.string(),
  status: v.union(
    v.literal("blocked"),
    v.literal("ready"),
    v.literal("authorized"),
    v.literal("applying"),
    v.literal("verified")
  ),
  updatedAt: v.number(),
  updatedByWorkosUserId: v.string(),
  verifiedAt: v.optional(v.number()),
  workosProjectionFingerprintAfter: v.optional(v.string()),
  workosProjectionFingerprintBefore: v.string(),
  workosProjectionRowCount: v.number(),
  workosProjectionWriteCount: v.optional(v.number()),
});

/**
 * Authenticated, paginated Phase 9 dry-run inventory. Operators must drain all
 * pages and sum counts before authorizing the migration runner. Every returned
 * ambiguity is a stop condition; the query never mutates candidate data.
 */

export type SnapshotCtx = Pick<QueryCtx | MutationCtx, "db">;
export interface Phase9DecisionDependencyRow {
  _id: unknown;
}

export function isPresent<T>(row: T | null): row is T {
  return row !== null;
}

export type IssueSnapshot = {
  code: string;
  disposition: "open" | "resolved";
  field: string;
  provenance: string;
  reason: string;
  sourceRecordId: string;
  sourceTable: string;
};

export function sortSnapshotRows<T extends { _id: unknown }>(rows: T[]) {
  return [...rows].sort((left, right) =>
    String(left._id).localeCompare(String(right._id))
  );
}

export function issueFor(
  proposal: Doc<"buildProposals">,
  code: string,
  field: string,
  sourceTable: string,
  reason: string,
  sourceRecordId = String(proposal._id)
): IssueSnapshot {
  return {
    code,
    disposition: "open",
    field,
    provenance: `${sourceTable}.${field}`,
    reason,
    sourceRecordId,
    sourceTable,
  };
}

export function deduplicateIssues(issues: IssueSnapshot[]) {
  const deduplicated = [
    ...new Map(
      issues.map((issue) => [
        `${issue.code}:${issue.sourceTable}:${issue.sourceRecordId}:${issue.field}`,
        issue,
      ])
    ).values(),
  ];
  if (deduplicated.length > 200) {
    throw new Error(
      "Phase 9 actionable issue inventory exceeds its exact manifest boundary."
    );
  }
  return deduplicated;
}

export async function getScopedMigrationRun(
  ctx: SnapshotCtx,
  organizationId: string,
  brokerageId: Id<"brokerages">,
  runToken: string
) {
  const run = await ctx.db
    .query("lenderPortalPhase9MigrationRuns")
    .withIndex("by_organizationId_and_runToken", (query) =>
      query.eq("organizationId", organizationId).eq("runToken", runToken)
    )
    .unique();
  if (!run) throw new Error("Phase 9 migration run is unavailable.");
  if (run.brokerageId !== brokerageId) {
    throw new Error("Forbidden: Phase 9 migration run Brokerage scope.");
  }
  return run;
}

export function publicMigrationRun(run: {
  candidateSha: string;
  configurationHash: string;
  issueCount: number;
  runToken: string;
  status: "blocked" | "ready" | "authorized" | "applying" | "verified";
  workosProjectionWriteCount?: number;
}) {
  return {
    candidateSha: run.candidateSha,
    configurationHash: run.configurationHash,
    issueCount: run.issueCount,
    runToken: run.runToken,
    status: run.status,
    workosProjectionWriteCount: run.workosProjectionWriteCount,
  };
}

export async function recordMigrationRunAudit(
  ctx: MutationCtx,
  input: {
    actorRoles: string[];
    actorWorkosUserId: string;
    brokerageId: Id<"brokerages">;
    candidateSha: string;
    configurationHash: string;
    eventType: string;
    inventoryFingerprint?: string;
    issueCount: number;
    observedInventoryFingerprint?: string;
    observedWorkosProjectionFingerprint?: string;
    organizationId: string;
    priorStatus?: string;
    reason: string;
    runId: Id<"lenderPortalPhase9MigrationRuns">;
    runToken: string;
    status: string;
    warnings?: string[];
    workosProjectionFingerprint?: string;
  }
) {
  await ctx.db.insert("auditEvents", {
    actorRoles: input.actorRoles,
    actorWorkosUserId: input.actorWorkosUserId,
    brokerageId: input.brokerageId,
    command: input.eventType,
    createdAt: Date.now(),
    drawFlowCorrelationId: input.runToken,
    entityId: String(input.runId),
    entityType: "lenderPortalPhase9MigrationRuns",
    eventType: input.eventType,
    newState: JSON.stringify({
      candidateSha: input.candidateSha,
      configurationHash: input.configurationHash,
      inventoryFingerprint: input.inventoryFingerprint,
      issueCount: input.issueCount,
      observedInventoryFingerprint: input.observedInventoryFingerprint,
      observedWorkosProjectionFingerprint:
        input.observedWorkosProjectionFingerprint,
      runToken: input.runToken,
      status: input.status,
      workosProjectionFingerprint: input.workosProjectionFingerprint,
    }),
    priorState: input.priorStatus
      ? JSON.stringify({
          candidateSha: input.candidateSha,
          configurationHash: input.configurationHash,
          runToken: input.runToken,
          status: input.priorStatus,
        })
      : undefined,
    organizationId: input.organizationId,
    phase9RunToken: input.runToken,
    reason: input.reason,
    reconciliationKey: `lender-portal-phase9-run:${input.runToken}:${input.eventType}`,
    warnings:
      input.warnings ??
      (input.issueCount > 0 ? ["migration_ambiguity_present"] : []),
  });
}

export function exactHex(value: string, length: number, label: string) {
  const normalized = value.trim().toLowerCase();
  if (!new RegExp(`^[0-9a-f]{${length}}$`).test(normalized)) {
    throw new Error(`Phase 9 ${label} is invalid.`);
  }
  return normalized;
}

export function boundedReason(value: string) {
  const normalized = value.trim();
  if (!normalized || normalized.length > 1_000) {
    throw new Error("Phase 9 migration reason must be 1 to 1000 characters.");
  }
  return normalized;
}

export function safeObject(value: string | undefined): Record<string, unknown> | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}
