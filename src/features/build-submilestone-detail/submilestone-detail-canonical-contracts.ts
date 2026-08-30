import type { Id } from "../../../convex/_generated/dataModel";
import type { BuildCollaborationRole } from "../../../convex/build_collaboration_model";

export interface CanonicalWorkspaceBootstrap {
  [key: string]: unknown;
  capabilities: {
    [key: string]: unknown;
    canonical: Record<string, unknown>;
  };
  evidence: Record<string, unknown>;
  overview: Record<string, unknown>;
}
export type CanonicalWorkspaceCollection = Record<string, unknown>;

export interface NavigationProps {
  buildId: Id<"activeBuilds">;
  buildSubmilestoneId: Id<"buildSubmilestones">;
  companionActionItemId?: Id<"buildActionItems">;
  onRetry?: () => void;
  organizationId: string;
  readOnly: boolean;
  viewerCapacity?: BuildCollaborationRole;
}

export interface CanonicalTabPanelProps extends NavigationProps {
  bootstrap: CanonicalWorkspaceBootstrap;
  collection?: CanonicalWorkspaceCollection | undefined;
  historyCollection?: CanonicalWorkspaceCollection | undefined;
  onDirtyChange?: (section: CanonicalDirtySection, dirty: boolean) => void;
  requirementsCollection?: CanonicalWorkspaceCollection | undefined;
  tab: "evidence" | "materials" | "overview" | "people";
}

export type CanonicalDirtySection = "guidance" | "scope";
export type RetryAction = () => Promise<unknown>;

export interface PreparedEvidenceUpload {
  fileName: string;
  locationAttempt?: {
    accuracyMeters?: number;
    attempted: boolean;
    attemptedAt?: number;
    distanceMeters?: number;
    failureReason?: string;
    geofenceRadiusMeters?: number;
    latitude?: number;
    longitude?: number;
    permissionOutcome: "denied" | "granted" | "not_requested" | "unavailable";
    verified: boolean;
  };
  mimeType: string;
  sizeBytes: number;
  storageId: Id<"_storage">;
}

export const CANONICAL_SOURCE_VALUES = new Set([
  "active_build_submilestone_evidence_upload",
  "canonical_upload",
  "canonical_upload_promotion",
]);
export const BACKOFFICE_EVIDENCE_CAPACITIES = new Set<BuildCollaborationRole>([
  "admin",
  "principle-broker",
  "broker",
  "broker-staff",
]);
export const EVIDENCE_UPLOAD_MIN_TIMEOUT_MS = 30_000;
export const EVIDENCE_UPLOAD_MAX_TIMEOUT_MS = 5 * 60_000;
export const EVIDENCE_UPLOAD_THROUGHPUT_BYTES_PER_SECOND = 256 * 1024;

export function object(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object"
    ? (value as Record<string, unknown>)
    : {};
}

export function stringValue(value: unknown, fallback = "") {
  return typeof value === "string" && value.trim() ? value : fallback;
}

export function numberValue(value: unknown, fallback = 0) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

export function optionalNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
}

export function booleanValue(value: unknown, fallback = false) {
  return typeof value === "boolean" ? value : fallback;
}

export function arrayValue(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

export function errorMessage(error: unknown) {
  if (typeof error === "string" && error.trim()) {
    return error;
  }
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return "The canonical Sub-milestone command could not be completed.";
}

export const CANONICAL_STALE_CONFLICT_CODES = new Set([
  "STALE_EVIDENCE_PACKAGE_REVISION",
  "STALE_MILESTONE_REVISION",
  "STALE_MILESTONE_REVIEW_REVISION",
  "STALE_SUBMILESTONE_REVISION",
  "STALE_SUBMILESTONE_REVIEW_REVISION",
  "STALE_WORKFLOW_REVISION",
]);
// Review commands in build_submilestone_review.ts guard only the child and
// parent review revisions below. Keep this set separate from the broader
// canonical command conflicts so the Review tab does not show review-specific
// guidance for workflow, evidence, or unrelated validation conflicts.
export const CANONICAL_REVIEW_STALE_CONFLICT_CODES = new Set([
  "STALE_MILESTONE_REVIEW_REVISION",
  "STALE_SUBMILESTONE_REVIEW_REVISION",
]);

export function structuredConvexErrorCode(
  value: unknown,
  depth = 0,
  acceptedCodes: ReadonlySet<string> = CANONICAL_STALE_CONFLICT_CODES
): string | undefined {
  if (depth > 4 || value === null || value === undefined) {
    return;
  }
  if (typeof value === "string") {
    const normalized = value.trim();
    if (!(normalized.startsWith("{") && normalized.endsWith("}"))) {
      return;
    }
    try {
      return structuredConvexErrorCode(
        JSON.parse(normalized),
        depth + 1,
        acceptedCodes
      );
    } catch {
      return;
    }
  }
  if (typeof value !== "object") {
    return;
  }

  const record = value as Record<string, unknown>;
  const code = record.code;
  if (typeof code === "string" && acceptedCodes.has(code)) {
    return code;
  }

  for (const key of ["cause", "data", "error", "errorData"] as const) {
    const nestedCode = structuredConvexErrorCode(
      record[key],
      depth + 1,
      acceptedCodes
    );
    if (nestedCode) {
      return nestedCode;
    }
  }

  // A few wrappers serialize ConvexError.data into the Error message. Parse
  // only a complete JSON object; prose such as local revision guidance must
  // never become a stale-command signal.
  return structuredConvexErrorCode(record.message, depth + 1, acceptedCodes);
}

export function isStaleConflict(error: unknown) {
  return structuredConvexErrorCode(error) !== undefined;
}

export function isReviewStaleConflict(error: unknown) {
  return (
    structuredConvexErrorCode(
      error,
      0,
      CANONICAL_REVIEW_STALE_CONFLICT_CODES
    ) !== undefined
  );
}

export function commandKey(prefix: string) {
  const cryptoApi = globalThis.crypto;
  const randomUuid = cryptoApi?.randomUUID?.();
  return randomUuid
    ? `${prefix}-${randomUuid}`
    : `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export {
  commandKey as createCanonicalCommandKey,
  errorMessage as canonicalCommandErrorMessage,
  isReviewStaleConflict as isCanonicalReviewStaleConflict,
  isStaleConflict as isCanonicalStaleConflict,
};

export function evidenceUploadTimeoutMs(sizeBytes: number) {
  const payloadDurationMs =
    Number.isFinite(sizeBytes) && sizeBytes > 0
      ? Math.ceil(
          (sizeBytes / EVIDENCE_UPLOAD_THROUGHPUT_BYTES_PER_SECOND) * 1000
        )
      : 0;
  return Math.min(
    EVIDENCE_UPLOAD_MAX_TIMEOUT_MS,
    Math.max(
      EVIDENCE_UPLOAD_MIN_TIMEOUT_MS,
      EVIDENCE_UPLOAD_MIN_TIMEOUT_MS + payloadDurationMs
    )
  );
}

export function stableCommandKey(
  store: Map<string, string>,
  prefix: string,
  fingerprint: string
) {
  const existing = store.get(fingerprint);
  if (existing) {
    return existing;
  }
  const next = commandKey(prefix);
  store.set(fingerprint, next);
  return next;
}

export function capability(
  bootstrap: CanonicalWorkspaceBootstrap,
  key: string
): { allowed: boolean; reason?: string } {
  const capabilities = object(bootstrap.capabilities);
  const canonical = object(capabilities.canonical);
  const value = object(canonical[key]);
  return {
    allowed: value.allowed === true,
    reason: stringValue(value.reason, "Not permitted for this Sub-milestone."),
  };
}

export function isCanonicalSubmilestoneSuperseded(
  bootstrap: CanonicalWorkspaceBootstrap
) {
  const submilestone = object(bootstrap.submilestone);
  const companion = object(bootstrap.companion);
  return (
    bootstrap.state === "superseded" ||
    submilestone.planningState === "superseded" ||
    companion.canonicalState === "superseded" ||
    companion.canonicalPlanningState === "superseded" ||
    companion.canonicalCompanionDisposition === "historical"
  );
}

export function canMutate(
  bootstrap: CanonicalWorkspaceBootstrap,
  readOnly: boolean,
  key: string
) {
  return (
    !(readOnly || isCanonicalSubmilestoneSuperseded(bootstrap)) &&
    capability(bootstrap, key).allowed
  );
}

export function revisionFor(bootstrap: CanonicalWorkspaceBootstrap) {
  const revisions = object(bootstrap.revisions);
  return optionalNumber(
    revisions.canonicalWorkflowRevision ??
      revisions.workflowRevision ??
      bootstrap.workflowRevision
  );
}

export function resultRevision(value: unknown) {
  const result = object(value);
  return optionalNumber(result.revision ?? result.workflowRevision);
}

export function milestoneKeyFor(bootstrap: CanonicalWorkspaceBootstrap) {
  return stringValue(object(bootstrap.milestone).key);
}

export function submilestoneKeyFor(bootstrap: CanonicalWorkspaceBootstrap) {
  return stringValue(object(bootstrap.submilestone).key);
}

export function submilestoneNameFor(bootstrap: CanonicalWorkspaceBootstrap) {
  return stringValue(object(bootstrap.submilestone).name, "Sub-milestone");
}

export function milestoneNameFor(bootstrap: CanonicalWorkspaceBootstrap) {
  return stringValue(object(bootstrap.milestone).name, "Milestone");
}

export function overviewFor(bootstrap: CanonicalWorkspaceBootstrap) {
  const overview = object(bootstrap.overview);
  const execution = object(bootstrap.execution);
  const submilestone = object(bootstrap.submilestone);
  const schedule = object(bootstrap.schedule);
  return {
    actualCostCents: optionalNumber(
      overview.actualCostCents ?? execution.actualCostCents
    ),
    actualStartedAt: optionalNumber(
      overview.actualStartedAt ?? execution.actualStartedAt
    ),
    budgetCents: numberValue(
      overview.budgetCents ?? submilestone.budgetCents,
      numberValue(bootstrap.budgetCents, 0)
    ),
    completionForecastDate: stringValue(
      overview.forecastDate ??
        overview.completionForecastDate ??
        execution.completionForecastDate
    ),
    fieldNote: stringValue(overview.fieldNote ?? execution.fieldNote),
    plannedDurationDays: optionalNumber(
      overview.plannedDurationDays ?? schedule.durationDays
    ),
    plannedStartDay: optionalNumber(
      overview.plannedStartDay ?? schedule.startDay
    ),
    progressPercent: numberValue(
      overview.progressPercent ?? execution.progressPercent,
      0
    ),
    status: stringValue(overview.status ?? submilestone.status, "planned"),
  };
}

export function proposalSubmilestoneIdFor(
  bootstrap: CanonicalWorkspaceBootstrap
): string | undefined {
  const submilestone = object(bootstrap.submilestone);
  return (
    stringValue(
      submilestone.proposalSubmilestoneId ?? bootstrap.proposalSubmilestoneId
    ) || undefined
  );
}

export function formatCents(value: unknown, fractionDigits = 0) {
  const cents = numberValue(value, 0);
  return new Intl.NumberFormat("en-CA", {
    currency: "CAD",
    maximumFractionDigits: fractionDigits,
    minimumFractionDigits: fractionDigits,
    style: "currency",
  }).format(cents / 100);
}

export function currencyInputValue(cents: number | undefined) {
  return cents === undefined ? "" : (cents / 100).toFixed(2);
}

export function parseCadAmount(value: string): number | null | undefined {
  const normalized = value.trim();
  if (!normalized) {
    return;
  }
  if (!/^\d+(?:\.\d{1,2})?$/.test(normalized)) {
    return null;
  }
  const amount = Number(normalized);
  return Number.isFinite(amount) ? Math.round(amount * 100) : null;
}

export function formatDate(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return new Intl.DateTimeFormat("en-CA", {
      dateStyle: "medium",
      timeZone: "UTC",
    }).format(new Date(value));
  }
  if (typeof value === "string" && value.trim()) {
    const timestamp = Date.parse(value);
    if (Number.isFinite(timestamp)) {
      return new Intl.DateTimeFormat("en-CA", {
        dateStyle: "medium",
        timeZone: "UTC",
      }).format(new Date(timestamp));
    }
    return value;
  }
  return "Not recorded";
}

export function statusLabel(value: unknown) {
  const normalized = stringValue(value, "unknown").replaceAll("_", " ");
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

export function statusVariant(
  value: unknown
): "outline" | "success" | "warning" {
  const normalized = stringValue(value).toLowerCase();
  if (normalized === "complete" || normalized === "approved") {
    return "success";
  }
  if (
    normalized === "blocked" ||
    normalized === "changes_requested" ||
    normalized === "reopened"
  ) {
    return "warning";
  }
  return "outline";
}

export function plannedDate(bootstrap: CanonicalWorkspaceBootstrap) {
  const build = object(bootstrap.build);
  const schedule = object(bootstrap.schedule);
  const direct = stringValue(
    object(bootstrap.overview).plannedStartDate ?? schedule.plannedStartDate
  );
  if (direct) {
    return direct;
  }
  const startDate = stringValue(build.startDate);
  const day = optionalNumber(
    object(bootstrap.overview).plannedStartDay ?? schedule.startDay
  );
  if (!startDate || day === undefined) {
    return "Not scheduled";
  }
  const parsed = Date.parse(startDate);
  if (!Number.isFinite(parsed)) {
    return startDate;
  }
  const date = new Date(parsed);
  // The canonical schedule stores startDay as a zero-based offset from the
  // Build start date. Keep Day 0 on the Build start date and only round the
  // received value at this display boundary.
  date.setUTCDate(date.getUTCDate() + Math.max(0, Math.round(day)));
  return date.toISOString().slice(0, 10);
}

export function collectionRows(
  collection: CanonicalWorkspaceCollection | undefined
) {
  return arrayValue(collection?.page).map(object);
}
