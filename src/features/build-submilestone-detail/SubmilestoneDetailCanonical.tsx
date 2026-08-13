"use client";

import { useMutation, useQuery } from "convex/react";
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  ClipboardCheck,
  FileImage,
  MapPinCheck,
  MapPinOff,
  Play,
  RotateCcw,
  Save,
  ShieldAlert,
  UserPlus,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Badge } from "#/components/ui/badge.tsx";
import { Button } from "#/components/ui/button.tsx";
import {
  Card,
  CardDescription,
  CardHeader,
  CardPanel,
  CardTitle,
} from "#/components/ui/card.tsx";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "#/components/ui/empty.tsx";
import { FileUploader } from "#/components/ui/file-uploader.tsx";
import { Frame, FramePanel } from "#/components/ui/frame.tsx";
import { Input } from "#/components/ui/input.tsx";
import { Label } from "#/components/ui/label.tsx";
import {
  NativeSelect,
  NativeSelectOption,
} from "#/components/ui/native-select.tsx";
import { Progress } from "#/components/ui/progress.tsx";
import { Separator } from "#/components/ui/separator.tsx";
import { Textarea } from "#/components/ui/textarea.tsx";
import { normalizeEvidenceFileForUpload } from "#/lib/evidence-image-normalization.ts";
import { api as apiRef } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import type { BuildCollaborationRole } from "../../../convex/build_collaboration_model";
import {
  type MilestoneStartConfirmation,
  MilestoneStartDialog,
  type MilestoneStartDialogRequest,
  type MilestoneStartSource,
} from "../backoffice-build-detail/MilestoneStartDialog.tsx";
import {
  type SiteVisitOrderConfirmation,
  SiteVisitOrderDialog,
} from "../backoffice-build-detail/SiteVisitOrderDialog.tsx";
import {
  type ContractorAssignmentCostDraft,
  type ContractorDrawerAvailableContractor,
  type ContractorProfileDraft,
  ContractorQuickAddDrawer,
} from "../contractors/ContractorQuickAddDrawer.tsx";
import {
  type MaterialPlanningActions,
  type MaterialPlanningItem,
  type MaterialPlanningMilestone,
  type MaterialPlanningPayload,
  MaterialPlanningTab,
} from "../material-planning/MaterialPlanningTab.tsx";
import { ActiveBuildSubmilestoneGuidanceController } from "../submilestone-guidance/ActiveBuildSubmilestoneGuidanceController.tsx";
import { ProposalSubmilestoneScopeController } from "../submilestone-scope/ProposalSubmilestoneScopeController.tsx";
import { SubmilestoneSiteVisitWorkspace } from "./SubmilestoneSiteVisitWorkspace.tsx";

/**
 * The workspace query is intentionally consumed through this small adapter.
 * ENG-428 adds canonical-first facts while codegen may be one turn behind the
 * UI. Keeping the adapter here avoids weakening generated Convex types in the
 * route or making the collaboration companion authoritative again.
 */
export type CanonicalWorkspaceBootstrap = Record<string, unknown>;
export type CanonicalWorkspaceCollection = Record<string, unknown>;

interface NavigationProps {
  buildId: Id<"activeBuilds">;
  buildSubmilestoneId: Id<"buildSubmilestones">;
  companionActionItemId?: Id<"buildActionItems">;
  onRetry?: () => void;
  organizationId: string;
  readOnly: boolean;
  viewerCapacity?: BuildCollaborationRole;
}

interface CanonicalTabPanelProps extends NavigationProps {
  bootstrap: CanonicalWorkspaceBootstrap;
  collection?: CanonicalWorkspaceCollection | undefined;
  historyCollection?: CanonicalWorkspaceCollection | undefined;
  onDirtyChange?: (section: CanonicalDirtySection, dirty: boolean) => void;
  requirementsCollection?: CanonicalWorkspaceCollection | undefined;
  tab: "evidence" | "materials" | "overview" | "people";
}

export type CanonicalDirtySection = "guidance" | "scope";

type RetryAction = () => Promise<unknown>;

interface PreparedEvidenceUpload {
  fileName: string;
  locationAttempt?: Record<string, unknown>;
  mimeType: string;
  sizeBytes: number;
  storageId: string;
}

const CANONICAL_SOURCE_VALUES = new Set([
  "active_build_submilestone_evidence_upload",
  "canonical_upload",
  "canonical_upload_promotion",
]);
const BACKOFFICE_EVIDENCE_CAPACITIES = new Set<BuildCollaborationRole>([
  "admin",
  "principle-broker",
  "broker",
  "broker-staff",
]);
const EVIDENCE_UPLOAD_MIN_TIMEOUT_MS = 30_000;
const EVIDENCE_UPLOAD_MAX_TIMEOUT_MS = 5 * 60_000;
const EVIDENCE_UPLOAD_THROUGHPUT_BYTES_PER_SECOND = 256 * 1024;

function object(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object"
    ? (value as Record<string, unknown>)
    : {};
}

function stringValue(value: unknown, fallback = "") {
  return typeof value === "string" && value.trim() ? value : fallback;
}

function numberValue(value: unknown, fallback = 0) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function optionalNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
}

function booleanValue(value: unknown, fallback = false) {
  return typeof value === "boolean" ? value : fallback;
}

function arrayValue(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function errorMessage(error: unknown) {
  if (typeof error === "string" && error.trim()) {
    return error;
  }
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return "The canonical Sub-milestone command could not be completed.";
}

const CANONICAL_STALE_CONFLICT_CODES = new Set([
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
const CANONICAL_REVIEW_STALE_CONFLICT_CODES = new Set([
  "STALE_MILESTONE_REVIEW_REVISION",
  "STALE_SUBMILESTONE_REVIEW_REVISION",
]);

function structuredConvexErrorCode(
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

function isStaleConflict(error: unknown) {
  return structuredConvexErrorCode(error) !== undefined;
}

function isReviewStaleConflict(error: unknown) {
  return (
    structuredConvexErrorCode(
      error,
      0,
      CANONICAL_REVIEW_STALE_CONFLICT_CODES
    ) !== undefined
  );
}

function commandKey(prefix: string) {
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

function evidenceUploadTimeoutMs(sizeBytes: number) {
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

function stableCommandKey(
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

function capability(
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

function canMutate(
  bootstrap: CanonicalWorkspaceBootstrap,
  readOnly: boolean,
  key: string
) {
  return (
    !(readOnly || isCanonicalSubmilestoneSuperseded(bootstrap)) &&
    capability(bootstrap, key).allowed
  );
}

function revisionFor(bootstrap: CanonicalWorkspaceBootstrap) {
  const revisions = object(bootstrap.revisions);
  return optionalNumber(
    revisions.canonicalWorkflowRevision ??
      revisions.workflowRevision ??
      bootstrap.workflowRevision
  );
}

function resultRevision(value: unknown) {
  const result = object(value);
  return optionalNumber(result.revision ?? result.workflowRevision);
}

function milestoneKeyFor(bootstrap: CanonicalWorkspaceBootstrap) {
  return stringValue(object(bootstrap.milestone).key);
}

function submilestoneKeyFor(bootstrap: CanonicalWorkspaceBootstrap) {
  return stringValue(object(bootstrap.submilestone).key);
}

function submilestoneNameFor(bootstrap: CanonicalWorkspaceBootstrap) {
  return stringValue(object(bootstrap.submilestone).name, "Sub-milestone");
}

function milestoneNameFor(bootstrap: CanonicalWorkspaceBootstrap) {
  return stringValue(object(bootstrap.milestone).name, "Milestone");
}

function overviewFor(bootstrap: CanonicalWorkspaceBootstrap) {
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

function proposalSubmilestoneIdFor(
  bootstrap: CanonicalWorkspaceBootstrap
): string | undefined {
  const submilestone = object(bootstrap.submilestone);
  return (
    stringValue(
      submilestone.proposalSubmilestoneId ?? bootstrap.proposalSubmilestoneId
    ) || undefined
  );
}

function formatCents(value: unknown, fractionDigits = 0) {
  const cents = numberValue(value, 0);
  return new Intl.NumberFormat("en-CA", {
    currency: "CAD",
    maximumFractionDigits: fractionDigits,
    minimumFractionDigits: fractionDigits,
    style: "currency",
  }).format(cents / 100);
}

function currencyInputValue(cents: number | undefined) {
  return cents === undefined ? "" : (cents / 100).toFixed(2);
}

function parseCadAmount(value: string): number | null | undefined {
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

function formatDate(value: unknown) {
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

function statusLabel(value: unknown) {
  const normalized = stringValue(value, "unknown").replaceAll("_", " ");
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

function statusVariant(value: unknown): "outline" | "success" | "warning" {
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

function plannedDate(bootstrap: CanonicalWorkspaceBootstrap) {
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

function collectionRows(collection: CanonicalWorkspaceCollection | undefined) {
  return arrayValue(collection?.page).map(object);
}

function retryButton(retry: RetryAction | null, label = "Retry") {
  return retry ? (
    <Button
      onClick={() => {
        void retry().catch(() => undefined);
      }}
      size="sm"
      type="button"
      variant="outline"
    >
      <RotateCcw aria-hidden="true" />
      {label}
    </Button>
  ) : null;
}

function CommandError({
  error,
  retry,
}: {
  error: string;
  retry: RetryAction | null;
}) {
  return (
    <Frame aria-live="assertive">
      <FramePanel
        className="space-y-2 border-destructive/35 p-3 text-sm"
        role="alert"
      >
        <div className="flex items-center gap-2 text-destructive-text">
          <AlertTriangle aria-hidden="true" className="size-4" />
          <p className="font-medium">Sub-milestone update failed</p>
        </div>
        <p>{error}</p>
        {isStaleConflict(error) ? (
          <p className="text-muted-foreground text-xs">
            The canonical record changed while this draft was open. Your draft
            is retained; retry after confirming the latest values.
          </p>
        ) : null}
        <div className="flex flex-wrap gap-2">{retryButton(retry)}</div>
      </FramePanel>
    </Frame>
  );
}

export function CanonicalSubmilestoneTabPanel({
  bootstrap,
  buildId,
  buildSubmilestoneId,
  collection,
  requirementsCollection,
  historyCollection,
  companionActionItemId,
  onDirtyChange,
  onRetry,
  organizationId,
  readOnly,
  tab,
  viewerCapacity,
}: CanonicalTabPanelProps) {
  if (tab === "overview") {
    return (
      <CanonicalOverviewPanel
        bootstrap={bootstrap}
        buildId={buildId}
        buildSubmilestoneId={buildSubmilestoneId}
        companionActionItemId={companionActionItemId}
        onDirtyChange={onDirtyChange}
        onRetry={onRetry}
        organizationId={organizationId}
        readOnly={readOnly}
        viewerCapacity={viewerCapacity}
      />
    );
  }
  if (tab === "evidence") {
    return (
      <CanonicalEvidencePanel
        bootstrap={bootstrap}
        buildId={buildId}
        buildSubmilestoneId={buildSubmilestoneId}
        collection={collection}
        companionActionItemId={companionActionItemId}
        onRetry={onRetry}
        organizationId={organizationId}
        readOnly={readOnly}
        requirementsCollection={requirementsCollection}
        viewerCapacity={viewerCapacity}
      />
    );
  }
  if (tab === "people") {
    return (
      <CanonicalPeoplePanel
        bootstrap={bootstrap}
        buildId={buildId}
        buildSubmilestoneId={buildSubmilestoneId}
        collection={collection}
        companionActionItemId={companionActionItemId}
        historyCollection={historyCollection}
        onRetry={onRetry}
        organizationId={organizationId}
        readOnly={readOnly}
        viewerCapacity={viewerCapacity}
      />
    );
  }
  return (
    <CanonicalMaterialsPanel
      bootstrap={bootstrap}
      buildId={buildId}
      buildSubmilestoneId={buildSubmilestoneId}
      collection={collection}
      companionActionItemId={companionActionItemId}
      onRetry={onRetry}
      organizationId={organizationId}
      readOnly={readOnly}
      viewerCapacity={viewerCapacity}
    />
  );
}

function CanonicalOverviewPanel({
  bootstrap,
  buildId,
  buildSubmilestoneId,
  companionActionItemId: _companionActionItemId,
  onDirtyChange,
  onRetry,
  organizationId,
  readOnly,
  viewerCapacity,
}: NavigationProps & {
  bootstrap: CanonicalWorkspaceBootstrap;
  onDirtyChange?: (section: CanonicalDirtySection, dirty: boolean) => void;
}) {
  const updateProgress = useMutation(
    apiRef.production_proposals.updateActiveBuildSubmilestoneProgress
  );
  const updateExecution = useMutation(
    apiRef.production_proposals.updateActiveBuildSubmilestoneExecution
  );
  const startWork = useMutation(
    apiRef.production_proposals.startActiveBuildMilestone
  );
  const correctStart = useMutation(
    apiRef.production_proposals.correctActiveBuildMilestoneStart
  );
  const retractStart = useMutation(
    apiRef.production_proposals.retractActiveBuildMilestoneStart
  );
  const details = overviewFor(bootstrap);
  const proposalSubmilestoneId = proposalSubmilestoneIdFor(bootstrap);
  const [progress, setProgress] = useState(String(details.progressPercent));
  const [actualCost, setActualCost] = useState(
    currencyInputValue(details.actualCostCents)
  );
  const [forecast, setForecast] = useState(details.completionForecastDate);
  const [fieldNote, setFieldNote] = useState(details.fieldNote);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [retry, setRetry] = useState<RetryAction | null>(null);
  const retryRef = useRef<RetryAction | null>(null);
  const [startDialog, setStartDialog] =
    useState<MilestoneStartDialogRequest | null>(null);
  const [completeAfterStart, setCompleteAfterStart] = useState(false);

  useEffect(() => {
    // This sheet stays mounted while history navigation swaps its target.
    // Reset drafts and command state at that boundary so a submit cannot use
    // values captured for the previous canonical Sub-milestone.
    setProgress(String(details.progressPercent));
    setActualCost(currencyInputValue(details.actualCostCents));
    setForecast(details.completionForecastDate);
    setFieldNote(details.fieldNote);
    setBusy(false);
    setError("");
    setSuccess("");
    setRetry(null);
    retryRef.current = null;
    setStartDialog(null);
    setCompleteAfterStart(false);
  }, [buildSubmilestoneId]);

  const workflowRevision = revisionFor(bootstrap);
  const milestoneKey = milestoneKeyFor(bootstrap);
  const submilestoneKey = submilestoneKeyFor(bootstrap);
  const status = details.status;
  const actualStartedAt = details.actualStartedAt;
  const hasRevision = workflowRevision !== undefined;
  const startAllowed = hasRevision && canMutate(bootstrap, readOnly, "start");
  const correctAllowed =
    hasRevision && canMutate(bootstrap, readOnly, "correctStart");
  const retractAllowed =
    hasRevision && canMutate(bootstrap, readOnly, "retractStart");
  const updateAllowed =
    hasRevision && canMutate(bootstrap, readOnly, "updateExecution");
  const completeAllowed =
    hasRevision && canMutate(bootstrap, readOnly, "complete");
  const reopenAllowed = hasRevision && canMutate(bootstrap, readOnly, "reopen");

  const runCommand = async (action: RetryAction, successMessage?: string) => {
    const retryAction: RetryAction = () => runCommand(action, successMessage);
    retryRef.current = retryAction;
    setRetry(() => retryAction);
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      await action();
      setError("");
      setRetry(null);
      retryRef.current = null;
      if (successMessage) {
        // Keep successful command feedback separate from errors so a saved
        // draft never renders inside the failure alert.
        setSuccess(successMessage);
      }
    } catch (caught) {
      const message = errorMessage(caught);
      setError(message);
      if (isStaleConflict(caught)) {
        const refreshAction: RetryAction | null = onRetry
          ? async () => {
              onRetry();
            }
          : null;
        retryRef.current = refreshAction;
        setRetry(() => refreshAction);
      }
    } finally {
      setBusy(false);
    }
  };

  const saveProgress = () => {
    if (!updateAllowed || busy) {
      if (
        !(hasRevision || readOnly) &&
        capability(bootstrap, "updateExecution").allowed
      ) {
        setError(
          "The canonical workflow revision is unavailable. Refresh before saving this draft."
        );
      }
      return;
    }
    if (!progress.trim()) {
      setError("Progress must be a whole number between 0 and 100.");
      return;
    }
    const progressValue = Number(progress);
    const actualCostValue = parseCadAmount(actualCost);
    if (
      !Number.isInteger(progressValue) ||
      progressValue < 0 ||
      progressValue > 100
    ) {
      setError("Progress must be a whole number between 0 and 100.");
      return;
    }
    if (actualCostValue === null) {
      setError(
        "Actual cost must be a non-negative CAD amount with no more than two decimal places."
      );
      return;
    }
    const idempotencyKey = commandKey("submilestone-progress");
    const action = async () => {
      await updateProgress({
        actualCostCents: actualCostValue ?? null,
        buildId,
        completionForecastDate: forecast.trim() || null,
        expectedRevision: workflowRevision,
        fieldNote: fieldNote.trim() || null,
        idempotencyKey,
        milestoneKey,
        progressPercent: progressValue,
        submilestoneKey,
        workosOrganizationId: organizationId,
      });
    };
    void runCommand(
      action,
      "Progress draft saved. Refreshing canonical facts…"
    );
  };

  const startRequest = (action: "correct" | "retract" | "start") => {
    if (workflowRevision === undefined) {
      setError(
        "The canonical workflow revision is unavailable. Refresh before recording this start."
      );
      return;
    }
    const source: MilestoneStartSource = "submilestone_detail";
    setCompleteAfterStart(false);
    setStartDialog({
      action,
      actualStartedAt,
      buildName: stringValue(object(bootstrap.build).buildName, "Build"),
      dependencyBlockers: dependencyBlockers(bootstrap),
      expectedRevision: workflowRevision,
      milestoneKey,
      milestoneName: milestoneNameFor(bootstrap),
      plannedStartDate: plannedDate(bootstrap),
      scope: "submilestone",
      source,
      submilestoneKey,
      submilestoneName: submilestoneNameFor(bootstrap),
    });
  };

  const complete = () => {
    if (!completeAllowed || busy) {
      if (
        !(hasRevision || readOnly) &&
        capability(bootstrap, "complete").allowed
      ) {
        setError(
          "The canonical workflow revision is unavailable. Refresh before completing this Sub-milestone."
        );
      }
      return;
    }
    if (workflowRevision === undefined) {
      setError(
        "The canonical workflow revision is unavailable. Refresh before completing this Sub-milestone."
      );
      return;
    }
    if (actualStartedAt === undefined) {
      setCompleteAfterStart(true);
      setStartDialog({
        action: "start",
        buildName: stringValue(object(bootstrap.build).buildName, "Build"),
        dependencyBlockers: dependencyBlockers(bootstrap),
        expectedRevision: workflowRevision,
        milestoneKey,
        milestoneName: milestoneNameFor(bootstrap),
        plannedStartDate: plannedDate(bootstrap),
        scope: "submilestone",
        source: "completion_catch_up",
        startParent: false,
        submilestoneKey,
        submilestoneName: submilestoneNameFor(bootstrap),
      });
      return;
    }
    const idempotencyKey = commandKey("submilestone-complete");
    const action = async () => {
      await updateExecution({
        buildId,
        expectedRevision: workflowRevision,
        idempotencyKey,
        milestoneKey,
        reason: "Completed from canonical Sub-milestone detail.",
        status: "complete",
        submilestoneKey,
        workosOrganizationId: organizationId,
      });
    };
    void runCommand(action, "Completion recorded. Refreshing canonical facts…");
  };

  const reopen = () => {
    if (!reopenAllowed || busy) {
      if (
        !(hasRevision || readOnly) &&
        capability(bootstrap, "reopen").allowed
      ) {
        setError(
          "The canonical workflow revision is unavailable. Refresh before reopening this Sub-milestone."
        );
      }
      return;
    }
    const idempotencyKey = commandKey("submilestone-reopen");
    const action = async () => {
      await updateExecution({
        buildId,
        expectedRevision: workflowRevision,
        idempotencyKey,
        milestoneKey,
        reason: "Reopened from canonical Sub-milestone detail.",
        status: "in_progress",
        submilestoneKey,
        workosOrganizationId: organizationId,
      });
    };
    void runCommand(
      action,
      "Sub-milestone reopened. Refreshing canonical facts…"
    );
  };

  const confirmStart = async (input: MilestoneStartConfirmation) => {
    const expectedRevision = input.expectedRevision;
    if (input.action === "correct") {
      if (input.actualStartedAt === undefined || !input.reason) {
        throw new Error("A corrected actual start and reason are required.");
      }
      await correctStart({
        actualStartedAt: input.actualStartedAt,
        buildId,
        expectedRevision,
        idempotencyKey: input.idempotencyKey,
        milestoneKey: input.milestoneKey,
        reason: input.reason,
        source: input.source,
        submilestoneKey: input.submilestoneKey,
        workosOrganizationId: organizationId,
      });
      return;
    }
    if (input.action === "retract") {
      if (!input.reason) {
        throw new Error("A retraction reason is required.");
      }
      await retractStart({
        buildId,
        expectedRevision,
        idempotencyKey: input.idempotencyKey,
        milestoneKey: input.milestoneKey,
        reason: input.reason,
        source: input.source,
        submilestoneKey: input.submilestoneKey,
        workosOrganizationId: organizationId,
      });
      return;
    }
    if (input.actualStartedAt === undefined) {
      throw new Error("An actual start is required.");
    }
    const started = await startWork({
      actualStartedAt: input.actualStartedAt,
      buildId,
      dependencyOverrideReason: input.dependencyOverrideReason,
      expectedRevision,
      idempotencyKey: input.idempotencyKey,
      milestoneKey: input.milestoneKey,
      source: input.source,
      startParent: input.startParent,
      submilestoneKey: input.submilestoneKey,
      workosOrganizationId: organizationId,
    });
    if (completeAfterStart) {
      try {
        const nextRevision = resultRevision(started);
        if (nextRevision === undefined) {
          throw new Error(
            "The canonical start did not return a workflow revision. Refresh before completing this Sub-milestone."
          );
        }
        await updateExecution({
          actualStartedAt: input.actualStartedAt,
          buildId,
          expectedRevision: nextRevision,
          idempotencyKey: `${input.idempotencyKey}:complete`,
          milestoneKey: input.milestoneKey,
          reason: "Completion catch-up confirmed from canonical detail.",
          status: "complete",
          submilestoneKey: input.submilestoneKey,
          workosOrganizationId: organizationId,
        });
      } catch (caught) {
        setStartDialog(null);
        throw new Error(
          `Start was recorded, but completion failed. Refresh and retry completion. ${errorMessage(caught)}`
        );
      } finally {
        setCompleteAfterStart(false);
      }
    }
  };

  const ownership = object(
    object(bootstrap.overview).executionOwnership ?? bootstrap.ownership
  );
  const parent = object(bootstrap.milestone);
  return (
    <div className="space-y-4" data-testid="submilestone-detail-overview">
      {proposalSubmilestoneId ? (
        <ProposalSubmilestoneScopeController
          onDirtyChange={(dirty) => onDirtyChange?.("scope", dirty)}
          proposalSubmilestoneId={proposalSubmilestoneId}
          readOnly={readOnly}
          scopeRoute="active-build"
          viewerCapacity={viewerCapacity}
          workosOrganizationId={organizationId}
        />
      ) : null}
      {proposalSubmilestoneId ? (
        <ActiveBuildSubmilestoneGuidanceController
          buildSubmilestoneId={String(buildSubmilestoneId)}
          onDirtyChange={(dirty) => onDirtyChange?.("guidance", dirty)}
          proposalSubmilestoneId={proposalSubmilestoneId}
          readOnly={readOnly}
          rowName={milestoneNameFor(bootstrap)}
          subMilestoneName={submilestoneNameFor(bootstrap)}
          viewerCapacity={viewerCapacity}
          workosOrganizationId={organizationId}
        />
      ) : null}

      <Frame>
        <FramePanel className="space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-muted-foreground text-xs">Parent milestone</p>
              <p className="font-medium text-sm">
                {stringValue(parent.name, "Not available")}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Badge variant={statusVariant(details.status)}>
                {statusLabel(details.status)}
              </Badge>
              {isCanonicalSubmilestoneSuperseded(bootstrap) ? (
                <Badge variant="warning">Superseded · read-only</Badge>
              ) : null}
              {readOnly && !isCanonicalSubmilestoneSuperseded(bootstrap) ? (
                <Badge variant="outline">Read-only</Badge>
              ) : null}
            </div>
          </div>
          <Separator />
          <dl className="grid gap-x-4 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
            <Metric label="Budget" value={formatCents(details.budgetCents)} />
            <Metric
              label="Schedule"
              value={`${plannedDate(bootstrap)}${details.plannedDurationDays === undefined ? "" : ` · ${details.plannedDurationDays} day${details.plannedDurationDays === 1 ? "" : "s"}`}`}
            />
            <Metric
              label="Actual start"
              value={formatDate(details.actualStartedAt)}
            />
            <Metric
              label="Progress"
              value={`${Math.round(details.progressPercent)}%`}
            />
            <Metric
              label="Forecast"
              value={formatDate(details.completionForecastDate)}
            />
            <Metric
              label="Actual cost"
              value={
                details.actualCostCents === undefined
                  ? "Not recorded"
                  : formatCents(details.actualCostCents, 2)
              }
            />
          </dl>
          <Progress
            aria-label="Sub-milestone progress"
            value={details.progressPercent}
          />
        </FramePanel>
      </Frame>

      <Frame>
        <FramePanel className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <p className="font-medium text-sm">Execution ownership</p>
            <Badge
              variant={ownership.state === "assigned" ? "success" : "warning"}
            >
              {statusLabel(ownership.state)}
            </Badge>
          </div>
          <p className="text-muted-foreground text-sm">
            {stringValue(
              ownership.contractorName ?? ownership.reason,
              "No active Work Allocation is recorded."
            )}
          </p>
          {details.fieldNote ? (
            <div className="border-t pt-3">
              <p className="text-muted-foreground text-xs">Field note</p>
              <p className="mt-1 whitespace-pre-wrap text-sm">
                {details.fieldNote}
              </p>
            </div>
          ) : null}
        </FramePanel>
      </Frame>

      {updateAllowed ? (
        <Frame>
          <FramePanel className="space-y-3">
            <div className="flex items-center gap-2 font-medium text-sm">
              <Save aria-hidden="true" className="size-4" />
              Update field execution
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <Label className="space-y-1 text-xs">
                <span>Progress percent</span>
                <Input
                  aria-label="Progress percent"
                  max={100}
                  min={0}
                  onChange={(event) => setProgress(event.target.value)}
                  type="number"
                  value={progress}
                />
              </Label>
              <Label className="space-y-1 text-xs">
                <span>Actual cost (CAD)</span>
                <Input
                  aria-label="Actual cost in CAD"
                  inputMode="decimal"
                  min={0}
                  onChange={(event) => setActualCost(event.target.value)}
                  step="0.01"
                  type="number"
                  value={actualCost}
                />
              </Label>
              <Label className="space-y-1 text-xs">
                <span>Completion forecast</span>
                <Input
                  aria-label="Completion forecast"
                  onChange={(event) => setForecast(event.target.value)}
                  type="date"
                  value={forecast}
                />
              </Label>
            </div>
            <Label className="space-y-1 text-xs">
              <span>Field note</span>
              <Textarea
                aria-label="Field note"
                onChange={(event) => setFieldNote(event.target.value)}
                value={fieldNote}
              />
            </Label>
            <div className="flex flex-wrap justify-end gap-2">
              <Button
                disabled={busy}
                onClick={saveProgress}
                size="sm"
                type="button"
              >
                {busy ? "Saving…" : "Save update"}
              </Button>
            </div>
          </FramePanel>
        </Frame>
      ) : null}

      {error ? (
        <CommandError error={error} retry={retryRef.current ?? retry} />
      ) : null}
      {success ? (
        <div
          aria-live="polite"
          className="flex items-center gap-2 text-sm text-success"
          role="status"
        >
          <CheckCircle2 aria-hidden="true" className="size-4 shrink-0" />
          <p>{success}</p>
        </div>
      ) : null}

      {isCanonicalSubmilestoneSuperseded(bootstrap) ? null : (
        <Frame>
          <FramePanel className="space-y-3">
            <div className="flex items-center gap-2 font-medium text-sm">
              Sub-milestone actions
            </div>
            <p className="text-muted-foreground text-xs">
              These actions update this Sub-milestone only. Draw release and
              lender review actions remain on their own surfaces.
            </p>
            <fieldset className="flex flex-wrap gap-2">
              <legend className="sr-only">Sub-milestone actions</legend>
              {startAllowed && !actualStartedAt ? (
                <Button
                  disabled={busy}
                  onClick={() => startRequest("start")}
                  size="sm"
                  type="button"
                >
                  <Play aria-hidden="true" />
                  Start work
                </Button>
              ) : null}
              {correctAllowed && actualStartedAt ? (
                <Button
                  disabled={busy}
                  onClick={() => startRequest("correct")}
                  size="sm"
                  type="button"
                  variant="outline"
                >
                  Correct start
                </Button>
              ) : null}
              {retractAllowed && actualStartedAt ? (
                <Button
                  disabled={busy}
                  onClick={() => startRequest("retract")}
                  size="sm"
                  type="button"
                  variant="ghost"
                >
                  Retract start
                </Button>
              ) : null}
              {completeAllowed && status !== "complete" ? (
                <Button
                  disabled={busy}
                  onClick={complete}
                  size="sm"
                  type="button"
                  variant="outline"
                >
                  <Check aria-hidden="true" />
                  Complete work
                </Button>
              ) : null}
              {reopenAllowed && status === "complete" ? (
                <Button
                  disabled={busy}
                  onClick={reopen}
                  size="sm"
                  type="button"
                  variant="outline"
                >
                  <RotateCcw aria-hidden="true" />
                  Reopen work
                </Button>
              ) : null}
              {startAllowed ||
              correctAllowed ||
              retractAllowed ||
              completeAllowed ||
              reopenAllowed ||
              updateAllowed ? null : (
                <p className="text-muted-foreground text-sm">
                  You can view this Sub-milestone, but you cannot change its
                  field execution.
                </p>
              )}
            </fieldset>
            {actualStartedAt === undefined && completeAllowed ? (
              <p className="text-muted-foreground text-xs">
                If work has not been started, completing it asks you to confirm
                the actual start first. Both events are recorded in the audit
                trail.
              </p>
            ) : null}
          </FramePanel>
        </Frame>
      )}
      {isCanonicalSubmilestoneSuperseded(bootstrap) ||
      readOnly ||
      hasRevision ? null : (
        <Frame aria-live="polite">
          <FramePanel
            className="border-warning/35 bg-warning/8 p-3 text-sm"
            role="alert"
          >
            <p className="font-medium">Refresh required before field changes</p>
            <p className="mt-1 text-muted-foreground text-xs">
              The canonical workflow revision is unavailable. Refresh this
              Sub-milestone before recording a start, completion, or execution
              update.
            </p>
          </FramePanel>
        </Frame>
      )}

      {startDialog ? (
        <MilestoneStartDialog
          onClose={() => {
            setStartDialog(null);
            setCompleteAfterStart(false);
          }}
          onConfirm={async (input) => {
            setBusy(true);
            setError("");
            try {
              await confirmStart(input);
              setStartDialog(null);
            } catch (caught) {
              setError(errorMessage(caught));
              throw caught;
            } finally {
              setBusy(false);
            }
          }}
          request={startDialog}
        />
      ) : null}
    </div>
  );
}

function dependencyBlockers(bootstrap: CanonicalWorkspaceBootstrap) {
  return arrayValue(
    object(bootstrap.overview).dependencyBlockers ??
      bootstrap.dependencyBlockers
  ).map((value) => {
    const blocker = object(value);
    return {
      milestoneKey: stringValue(blocker.milestoneKey ?? blocker.key),
      milestoneName: stringValue(
        blocker.milestoneName ?? blocker.name,
        "Predecessor milestone"
      ),
      status:
        stringValue(blocker.status, "planned") === "in_progress"
          ? ("in_progress" as const)
          : ("planned" as const),
    };
  });
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-1">
      <dt className="text-muted-foreground text-xs">{label}</dt>
      <dd className="break-words font-medium text-sm tabular-nums">{value}</dd>
    </div>
  );
}

function CanonicalEvidencePanel({
  bootstrap,
  buildId,
  buildSubmilestoneId,
  collection,
  requirementsCollection,
  historyCollection: _historyCollection,
  companionActionItemId: _companionActionItemId,
  onRetry,
  organizationId,
  readOnly,
  viewerCapacity,
}: NavigationProps & {
  bootstrap: CanonicalWorkspaceBootstrap;
  collection: CanonicalWorkspaceCollection | undefined;
  requirementsCollection?: CanonicalWorkspaceCollection | undefined;
  historyCollection?: CanonicalWorkspaceCollection | undefined;
}) {
  const generateUploadUrl = useMutation(
    apiRef.production_proposals.generateActiveBuildEvidenceUploadUrl
  );
  const addEvidence = useMutation(
    apiRef.production_proposals.addActiveBuildSubmilestoneEvidence
  );
  const scheduleSiteVisit = useMutation(
    apiRef.production_proposals.scheduleActiveBuildSiteVisit
  );
  const details = overviewFor(bootstrap);
  const proposalSubmilestoneId = proposalSubmilestoneIdFor(bootstrap);
  const canReadSiteVisits = Boolean(
    viewerCapacity && BACKOFFICE_EVIDENCE_CAPACITIES.has(viewerCapacity)
  );
  const fieldGuidance = useQuery(
    apiRef.submilestone_field_guidance.getSubmilestoneFieldGuidance,
    proposalSubmilestoneId
      ? {
          proposalSubmilestoneId:
            proposalSubmilestoneId as Id<"proposalSubmilestones">,
          workosOrganizationId: organizationId,
        }
      : "skip"
  );
  const siteVisits = useQuery(
    apiRef.production_proposals.listBrokerageSiteVisits,
    canReadSiteVisits
      ? {
          buildId,
          milestoneKey: milestoneKeyFor(bootstrap),
          submilestoneId: buildSubmilestoneId,
          workosOrganizationId: organizationId,
        }
      : "skip"
  );
  const evidence = object(bootstrap.evidence);
  const requirements = [
    ...arrayValue(evidence.requirements).map(object),
    ...collectionRows(requirementsCollection),
  ]
    .filter((requirement) => evidenceRequirementKey(requirement).length > 0)
    .filter(
      (requirement, index, all) =>
        all.findIndex(
          (candidate) =>
            stringValue(
              candidate.requirementKey ?? candidate.key ?? candidate.id
            ) ===
            stringValue(
              requirement.requirementKey ?? requirement.key ?? requirement.id
            )
        ) === index
    );
  const assets = arrayValue(evidence.assets).map(object);
  const rows = collectionRows(collection);
  const canonicalAssets = [...assets, ...rows]
    .filter((asset) => isCanonicalEvidenceAsset(asset))
    .filter(
      (asset) =>
        stringValue(asset.sourceKind ?? asset.source).toLowerCase() !==
        "site_visit"
    )
    .filter((asset, index, all) => {
      const id = evidenceAssetIdentity(asset);
      if (!id) {
        return true;
      }
      return (
        all.findIndex(
          (candidate) => evidenceAssetIdentity(candidate) === id
        ) === index
      );
    });
  const [requirementKey, setRequirementKey] = useState(
    evidenceRequirementKey(requirements[0])
  );
  const requirementCount =
    optionalNumber(evidence.requirementCount) ?? requirements.length;
  const requirementsAvailable = requirements.length > 0;
  const requirementsReady =
    requirementsAvailable &&
    (requirementCount <= 1 || requirements.length >= requirementCount);
  const selectedRequirementKey = requirementKey.trim();
  const availableRequirementKeys = new Set(
    requirements.map((requirement) => evidenceRequirementKey(requirement))
  );
  const requirementSelectionRequired = requirementCount > 1;
  const requirementSelectionMissing =
    requirementSelectionRequired &&
    !(
      selectedRequirementKey &&
      availableRequirementKeys.has(selectedRequirementKey)
    );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [siteVisitBusy, setSiteVisitBusy] = useState(false);
  const [siteVisitOpen, setSiteVisitOpen] = useState(false);
  const retryRef = useRef<RetryAction | null>(null);
  const uploadKeyRef = useRef<string | null>(null);
  const uploadFileRef = useRef<File | null>(null);
  const preparedUploadRef = useRef<PreparedEvidenceUpload | null>(null);
  useEffect(() => {
    setRequirementKey("");
    setBusy(false);
    setError("");
    setPendingFile(null);
    setSiteVisitBusy(false);
    setSiteVisitOpen(false);
    retryRef.current = null;
    uploadKeyRef.current = null;
    uploadFileRef.current = null;
    preparedUploadRef.current = null;
  }, [buildId, buildSubmilestoneId]);
  const workflowRevision = revisionFor(bootstrap);
  const hasRevision = workflowRevision !== undefined;
  const uploadCapability = capability(bootstrap, "uploadEvidence");
  const siteVisitOrderCapability = object(
    object(object(bootstrap.capabilities).siteVisit).order
  );
  const backofficeUpload = Boolean(
    viewerCapacity && BACKOFFICE_EVIDENCE_CAPACITIES.has(viewerCapacity)
  );
  const builderUploadAllowed =
    hasRevision &&
    details.actualStartedAt !== undefined &&
    canMutate(bootstrap, readOnly, "uploadEvidence") &&
    requirementsReady &&
    !requirementSelectionMissing;
  const backofficeUploadAllowed =
    hasRevision &&
    !readOnly &&
    backofficeUpload &&
    uploadCapability.allowed &&
    (requirementCount === 0 || requirementsReady) &&
    !requirementSelectionMissing;
  const uploadAllowed = builderUploadAllowed || backofficeUploadAllowed;
  const milestoneKey = milestoneKeyFor(bootstrap);
  const submilestoneKey = submilestoneKeyFor(bootstrap);
  const packageStatus = stringValue(
    evidence.packageState ?? evidence.evidencePackageStatus,
    "draft"
  );
  const locationAttempt = () => captureLocationAttempt();
  const uploadUnavailableReason =
    readOnly || !uploadCapability.allowed
      ? (uploadCapability.reason ?? "Evidence is read-only for this viewer.")
      : hasRevision
        ? details.actualStartedAt === undefined && !backofficeUpload
          ? "Start this Sub-milestone before adding evidence to the canonical package."
          : requirementsAvailable
            ? requirementsReady
              ? "Select an evidence requirement before adding evidence."
              : "Evidence requirements are still loading; refresh before adding evidence."
            : backofficeUpload
              ? "Evidence upload is unavailable for this Sub-milestone."
              : "No keyed evidence requirement is available. Refresh or ask the Builder to configure the Evidence Package."
        : "Refresh this Sub-milestone before adding evidence to the package; its current version is unavailable.";
  const canOrderSiteVisit =
    !readOnly && booleanValue(siteVisitOrderCapability.allowed);
  const visibleSiteVisits = siteVisits
    ? {
        ...siteVisits,
        visits: siteVisits.visits.filter(
          (visit) => visit.operationalStatus !== "cancelled"
        ),
      }
    : undefined;

  useEffect(() => {
    if (!requirementKey && requirements.length > 0) {
      setRequirementKey(evidenceRequirementKey(requirements[0]));
    }
  }, [requirementKey, requirements]);

  const upload = async (file: File) => {
    if (!uploadAllowed) {
      if (!readOnly && uploadCapability.allowed && !hasRevision) {
        setError(
          "The canonical workflow revision is unavailable. Refresh before adding evidence."
        );
      }
      return;
    }
    if (
      requirementSelectionMissing ||
      !(backofficeUploadAllowed || requirementsReady)
    ) {
      setError(
        requirementSelectionRequired
          ? "Select an evidence requirement before adding this asset."
          : "Evidence requirements are still loading. Refresh before retrying."
      );
      return;
    }
    if (uploadFileRef.current !== file) {
      uploadFileRef.current = file;
      uploadKeyRef.current = null;
      preparedUploadRef.current = null;
    }
    const idempotencyKey =
      uploadKeyRef.current ?? commandKey("submilestone-evidence");
    uploadKeyRef.current = idempotencyKey;
    setPendingFile(file);
    setBusy(true);
    setError("");
    const action = async () => {
      let preparedUpload = preparedUploadRef.current;
      if (!preparedUpload) {
        const normalized = await normalizeEvidenceFileForUpload(file);
        const location = backofficeUploadAllowed
          ? undefined
          : await locationAttempt();
        const uploadUrl = await generateUploadUrl({
          buildId,
          workosOrganizationId: organizationId,
        });
        const response = await fetch(uploadUrl, {
          body: normalized,
          headers: {
            "Content-Type": normalized.type || "application/octet-stream",
          },
          method: "POST",
          signal: AbortSignal.timeout(evidenceUploadTimeoutMs(normalized.size)),
        });
        if (!response.ok) {
          throw new Error(
            "Evidence upload failed. The file remains available to retry."
          );
        }
        const result = object(await response.json());
        const storageId = result.storageId;
        if (typeof storageId !== "string" || !storageId) {
          throw new Error("Evidence upload did not return a storage id.");
        }
        preparedUpload = {
          fileName: normalized.name,
          locationAttempt: location,
          mimeType: normalized.type || "application/octet-stream",
          sizeBytes: normalized.size,
          storageId,
        };
        preparedUploadRef.current = preparedUpload;
      }
      await addEvidence({
        buildId,
        evidence: {
          fileName: preparedUpload.fileName,
          label: preparedUpload.fileName,
          locationAttempt: preparedUpload.locationAttempt,
          mimeType: preparedUpload.mimeType,
          requirementKey: selectedRequirementKey || undefined,
          sizeBytes: preparedUpload.sizeBytes,
          storageId: preparedUpload.storageId,
        },
        expectedRevision: workflowRevision,
        idempotencyKey,
        milestoneKey,
        submilestoneKey,
        uploadedOnBehalfOfBuilder: backofficeUploadAllowed || undefined,
        workosOrganizationId: organizationId,
      });
    };
    const retryAction: RetryAction = async () => {
      setBusy(true);
      setError("");
      try {
        await action();
        setPendingFile(null);
        uploadKeyRef.current = null;
        uploadFileRef.current = null;
        preparedUploadRef.current = null;
        retryRef.current = null;
      } catch (caught) {
        const message = errorMessage(caught);
        if (isStaleConflict(caught) && !onRetry) {
          // The prepared command carries the stale workflow revision. Without
          // a refresh callback, do not expose a retry that would submit it
          // again; require a fresh canonical read first.
          setError(
            `${message} Refresh this Sub-milestone before retrying this evidence upload.`
          );
          retryRef.current = null;
          uploadKeyRef.current = null;
          uploadFileRef.current = null;
          preparedUploadRef.current = null;
        } else {
          setError(message);
          if (isStaleConflict(caught) && onRetry) {
            retryRef.current = async () => {
              onRetry();
            };
          }
        }
      } finally {
        setBusy(false);
      }
    };
    retryRef.current = retryAction;
    await retryAction();
  };

  const orderSiteVisit = async (input: SiteVisitOrderConfirmation) => {
    setSiteVisitBusy(true);
    setError("");
    try {
      await scheduleSiteVisit({
        buildId,
        idempotencyKey: commandKey("site-visit-order"),
        milestoneKey: input.milestoneKey,
        ...(input.note ? { note: input.note } : {}),
        requestedDay: input.requestedDay ?? 0,
        ...(input.requestedTime ? { requestedTime: input.requestedTime } : {}),
        siteVisitGuidance: input.siteVisitGuidance,
        submilestoneGuidanceSections: input.submilestoneGuidanceSections.map(
          (section) => ({
            ...section,
            buildSubmilestoneId:
              section.buildSubmilestoneId as Id<"buildSubmilestones">,
            proposalSubmilestoneId:
              section.proposalSubmilestoneId as Id<"proposalSubmilestones">,
          })
        ),
        submilestoneKeys: input.submilestoneKeys,
        workosOrganizationId: organizationId,
      });
      setSiteVisitOpen(false);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setSiteVisitBusy(false);
    }
  };

  return (
    <div className="space-y-5" data-testid="submilestone-evidence-collection">
      <Frame>
        <FramePanel className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <FileImage
                aria-hidden="true"
                className="size-4 text-muted-foreground"
              />
              <p className="font-medium text-sm">Canonical Evidence Package</p>
            </div>
            <Badge variant={packageStatus === "frozen" ? "success" : "outline"}>
              {statusLabel(packageStatus)}
            </Badge>
          </div>
          <p className="text-muted-foreground text-sm">
            Only assets in the canonical Evidence Package are shown here.
            Collaboration attachments are not completion evidence.
          </p>
          <div className="grid gap-3 text-sm sm:grid-cols-3">
            <Metric
              label="Package revision"
              value={String(
                optionalNumber(evidence.evidencePackageRevision) ??
                  "Not created"
              )}
            />
            <Metric label="Requirements" value={String(requirementCount)} />
            <Metric
              label="Assets"
              value={String(
                numberValue(evidence.assetCount, canonicalAssets.length)
              )}
            />
          </div>
          {requirementSelectionRequired ? (
            <Label className="space-y-1 text-xs">
              <span>Evidence requirement</span>
              <NativeSelect
                aria-label="Evidence requirement"
                onChange={(event) => setRequirementKey(event.target.value)}
                value={requirementKey}
              >
                {requirements.map((requirement) => {
                  const key = evidenceRequirementKey(requirement);
                  if (!key) {
                    return null;
                  }
                  return (
                    <NativeSelectOption key={key} value={key}>
                      {stringValue(requirement.label ?? requirement.title, key)}
                    </NativeSelectOption>
                  );
                })}
              </NativeSelect>
            </Label>
          ) : null}
        </FramePanel>
      </Frame>
      <section aria-labelledby="builder-evidence-heading" className="space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3
              className="flex items-center gap-2 font-semibold text-sm"
              id="builder-evidence-heading"
            >
              <ClipboardCheck aria-hidden="true" className="size-4" />
              Builder Evidence
            </h3>
            <p className="mt-1 text-muted-foreground text-xs">
              Photos and documents submitted for this Sub-milestone.
            </p>
          </div>
          <Badge variant="outline">
            {canonicalAssets.length} asset
            {canonicalAssets.length === 1 ? "" : "s"}
          </Badge>
        </div>
        {canonicalAssets.length === 0 ? (
          <Empty className="rounded-xl border border-dashed py-10 md:py-12">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <FileImage aria-hidden="true" />
              </EmptyMedia>
              <EmptyTitle>No Builder evidence yet</EmptyTitle>
              <EmptyDescription>
                Builder photos and supporting documents tagged to this
                Sub-milestone will appear here for review.
              </EmptyDescription>
            </EmptyHeader>
            <EmptyContent className="w-full max-w-lg">
              {uploadAllowed ? (
                <CanonicalEvidenceUploader
                  backofficeUpload={backofficeUploadAllowed}
                  busy={busy}
                  onUpload={upload}
                  submilestoneName={stringValue(
                    object(bootstrap.submilestone).name,
                    submilestoneKey
                  )}
                />
              ) : (
                <p className="text-muted-foreground text-sm">
                  {uploadUnavailableReason}
                </p>
              )}
            </EmptyContent>
          </Empty>
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-2">
              {canonicalAssets.map((asset, index) => (
                <EvidenceAssetCard
                  asset={asset}
                  key={evidenceAssetIdentity(asset) || `evidence-${index}`}
                />
              ))}
            </div>
            {uploadAllowed ? (
              <CanonicalEvidenceUploader
                backofficeUpload={backofficeUploadAllowed}
                busy={busy}
                compact
                onUpload={upload}
                submilestoneName={stringValue(
                  object(bootstrap.submilestone).name,
                  submilestoneKey
                )}
              />
            ) : (
              <p className="text-muted-foreground text-sm">
                {uploadUnavailableReason}
              </p>
            )}
          </>
        )}
        {pendingFile && error ? (
          <p className="text-muted-foreground text-xs">
            Draft file retained: {pendingFile.name}
          </p>
        ) : null}
        {error ? <CommandError error={error} retry={retryRef.current} /> : null}
      </section>
      <Separator />
      <section
        aria-labelledby="evidence-site-visits-heading"
        className="space-y-3"
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3
              className="flex items-center gap-2 font-semibold text-sm"
              id="evidence-site-visits-heading"
            >
              <MapPinCheck aria-hidden="true" className="size-4" />
              Site Visits
            </h3>
            <p className="mt-1 text-muted-foreground text-xs">
              Field requests, reports, and canonical Visit history for this
              Sub-milestone.
            </p>
          </div>
          {visibleSiteVisits ? (
            <Badge variant="outline">
              {visibleSiteVisits.visits.length} Visit
              {visibleSiteVisits.visits.length === 1 ? "" : "s"}
            </Badge>
          ) : null}
        </div>
        {canReadSiteVisits ? (
          <SubmilestoneSiteVisitWorkspace
            canCancel={false}
            canOrder={canOrderSiteVisit}
            guidanceReady={fieldGuidance !== undefined}
            onCancelVisit={() => Promise.resolve()}
            onOrder={() => setSiteVisitOpen(true)}
            pending={siteVisitBusy}
            siteVisits={visibleSiteVisits}
          />
        ) : (
          <p className="py-6 text-center text-muted-foreground text-sm">
            Site Visit history is available to the authorized lender team.
          </p>
        )}
      </section>
      <SiteVisitOrderDialog
        build={{
          location: stringValue(object(bootstrap.build).location),
          name: stringValue(object(bootstrap.build).buildName, "Build"),
        }}
        milestone={{ key: milestoneKey, name: milestoneNameFor(bootstrap) }}
        onConfirm={orderSiteVisit}
        onOpenChange={setSiteVisitOpen}
        open={siteVisitOpen}
        request={siteVisitOpen ? { milestoneKey } : null}
        submilestones={
          proposalSubmilestoneId
            ? [
                {
                  _id: String(buildSubmilestoneId),
                  fieldGuidance: fieldGuidance?.guidance ?? null,
                  key: submilestoneKey,
                  name: submilestoneNameFor(bootstrap),
                  proposalSubmilestoneId,
                },
              ]
            : []
        }
      />
    </div>
  );
}

function CanonicalEvidenceUploader({
  backofficeUpload,
  busy,
  compact = false,
  onUpload,
  submilestoneName,
}: {
  backofficeUpload: boolean;
  busy: boolean;
  compact?: boolean;
  onUpload: (file: File) => Promise<void>;
  submilestoneName: string;
}) {
  return (
    <FileUploader
      actionLabel="Upload to Evidence Package"
      className="w-full"
      description={
        backofficeUpload
          ? `Add a photo or document to ${submilestoneName} on the Builder's behalf.`
          : `Add a photo or document to ${submilestoneName}.`
      }
      disabled={busy}
      helperText={
        backofficeUpload
          ? "The audit trail records you as the uploader and keeps the evidence location unverified."
          : "The file remains tagged to this canonical Sub-milestone."
      }
      inputLabel="Choose evidence file"
      inputTestId="canonical-evidence-input"
      multiple={false}
      onUpload={async (files) => {
        const file = files[0];
        if (file) {
          await onUpload(file);
        }
      }}
      title={
        backofficeUpload
          ? "Upload evidence for the Builder"
          : "Add evidence to the package"
      }
      variant={compact ? "compact" : "default"}
    />
  );
}

export function isCanonicalEvidenceAsset(asset: Record<string, unknown>) {
  const source = stringValue(asset.sourceKind ?? asset.source).toLowerCase();
  if (!source) {
    return true;
  }
  if (CANONICAL_SOURCE_VALUES.has(source)) {
    return true;
  }
  return !(
    source.includes("collaboration") ||
    source.includes("comment") ||
    source.includes("attachment")
  );
}

function evidenceRequirementKey(
  requirement: Record<string, unknown> | undefined
) {
  return stringValue(requirement?.requirementKey ?? requirement?.key);
}

export function evidenceAssetIdentity(asset: Record<string, unknown>) {
  return (
    stringValue(asset.id) ||
    stringValue(asset._id) ||
    stringValue(asset.evidenceAssetId)
  );
}

export function EvidenceAssetCard({
  asset,
}: {
  asset: Record<string, unknown>;
}) {
  const locationVerified = booleanValue(
    asset.locationVerified ?? asset.verified,
    false
  );
  return (
    <Card className="overflow-hidden shadow-none">
      <CardHeader className="p-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <CardTitle className="break-words text-sm">
              {stringValue(
                asset.title ?? asset.label ?? asset.fileName,
                "Evidence asset"
              )}
            </CardTitle>
            <CardDescription className="break-words">
              {stringValue(
                asset.fileName ?? asset.detail,
                "Canonical package asset"
              )}
            </CardDescription>
          </div>
          <Badge
            className="shrink-0"
            variant={locationVerified ? "success" : "warning"}
          >
            {locationVerified ? "Location verified" : "Location unverified"}
          </Badge>
        </div>
      </CardHeader>
      <CardPanel className="space-y-2 p-3 pt-0 text-xs">
        {asset.locationVerified === false || asset.verified === false ? (
          <p className="flex items-center gap-1 text-warning">
            <MapPinOff aria-hidden="true" className="size-3.5" />
            Retained for lender review; location was not verified.
          </p>
        ) : null}
        {stringValue(asset.kind ?? asset.tag) ? (
          <p className="text-muted-foreground">
            {statusLabel(asset.kind ?? asset.tag)}
          </p>
        ) : null}
      </CardPanel>
    </Card>
  );
}

function CanonicalPeoplePanel({
  bootstrap,
  buildId,
  buildSubmilestoneId,
  collection,
  historyCollection,
  companionActionItemId: _companionActionItemId,
  onRetry,
  organizationId,
  readOnly,
  viewerCapacity: _viewerCapacity,
}: NavigationProps & {
  bootstrap: CanonicalWorkspaceBootstrap;
  collection: CanonicalWorkspaceCollection | undefined;
  historyCollection?: CanonicalWorkspaceCollection;
}) {
  const assignContractor = useMutation(
    apiRef.production_proposals.assignActiveBuildContractorToMilestone
  );
  const createAndAttach = useMutation(
    apiRef.production_proposals.createAndAttachActiveBuildContractor
  );
  const removeContractor = useMutation(
    apiRef.production_proposals.removeActiveBuildContractorFromMilestone
  );
  const people = object(bootstrap.people);
  const rows = collectionRows(collection);
  const assignedCount = numberValue(people.assigned, 0);
  const assignedProjection =
    people.assignedPerson ?? people.assignedContractor ?? people.assigned;
  const assigned =
    normalizeAssignedPerson(assignedProjection) ??
    normalizeAssignedPerson(
      rows.find((row) => stringValue(row.status).toLowerCase() !== "removed")
    ) ??
    (assignedCount > 0
      ? {
          contractorId: "redacted",
          displayName: "Participant redacted",
          redacted: true,
          role: "Contractor",
          status: "active",
        }
      : null);
  const history = [
    ...arrayValue(people.history).map(object),
    ...collectionRows(historyCollection),
  ];
  const historyRows =
    history.length > 0
      ? history
      : rows.filter(
          (row) =>
            !assigned ||
            stringValue(row.contractorId ?? row.id) !== assigned.contractorId
        );
  const participants = projectedPeopleParticipants(
    people.participants ??
      people.authorizedParticipants ??
      people.buildParticipants ??
      bootstrap.participants
  );
  const participantsPartial = booleanValue(people.participantsPartial, false);
  const available = projectedContractorCandidates(
    people.contractorCandidates,
    people.authorizedContractorCandidates,
    people.availableContractors,
    people.contractors,
    bootstrap.contractorCandidates
  );
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [removeOpen, setRemoveOpen] = useState(false);
  const [removeReason, setRemoveReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const commandKeysRef = useRef(new Map<string, string>());
  const createdContractorsRef = useRef(new Map<string, string>());
  const workflowRevision = revisionFor(bootstrap);
  const hasRevision = workflowRevision !== undefined;
  const assignmentCapability = capability(bootstrap, "addAssignment");
  const removeCapability = capability(bootstrap, "removeAssignment");
  const assignmentAllowed =
    hasRevision && canMutate(bootstrap, readOnly, "addAssignment");
  const removeAllowed =
    Boolean(assigned) &&
    !assigned?.redacted &&
    assigned?.contractorId !== "redacted" &&
    hasRevision &&
    canMutate(bootstrap, readOnly, "removeAssignment");
  const milestoneKey = milestoneKeyFor(bootstrap);
  const submilestoneKey = submilestoneKeyFor(bootstrap);
  const targetScope = {
    buildId,
    buildSubmilestoneId,
    milestoneKey,
    submilestoneKey,
  };

  useEffect(() => {
    setDrawerOpen(false);
    setRemoveOpen(false);
    setRemoveReason("");
    setBusy(false);
    setError("");
    commandKeysRef.current.clear();
    createdContractorsRef.current.clear();
  }, [buildId, buildSubmilestoneId, milestoneKey, submilestoneKey]);

  const run = async (action: () => Promise<unknown>) => {
    setBusy(true);
    setError("");
    try {
      await action();
      setDrawerOpen(false);
      setRemoveOpen(false);
      setRemoveReason("");
    } catch (caught) {
      setError(errorMessage(caught));
      if (isStaleConflict(caught)) {
        onRetry?.();
      }
      throw caught;
    } finally {
      setBusy(false);
    }
  };

  const assignmentInput = async ({
    assignmentCost,
    contractorId,
    role,
  }: {
    assignmentCost?: ContractorAssignmentCostDraft;
    contractorId: string;
    role: string;
  }) => {
    if (workflowRevision === undefined) {
      throw new Error(
        "Refresh this Sub-milestone before changing its Work Allocation; its current version is unavailable."
      );
    }
    const fingerprint = JSON.stringify({
      ...targetScope,
      assignmentCost,
      contractorId,
      role,
    });
    const idempotencyKey = stableCommandKey(
      commandKeysRef.current,
      "submilestone-assignment",
      fingerprint
    );
    await assignContractor({
      ...(assignmentCost ?? {}),
      buildId,
      contractorId,
      expectedRevisions: { [submilestoneKey]: workflowRevision },
      idempotencyKey,
      milestoneKey,
      role,
      submilestoneKeys: [submilestoneKey],
      workosOrganizationId: organizationId,
    });
    commandKeysRef.current.delete(fingerprint);
    onRetry?.();
  };

  const removeAssignment = async () => {
    if (assigned?.redacted || assigned?.contractorId === "redacted") {
      throw new Error(
        "The assigned Contractor is redacted and cannot be removed."
      );
    }
    if (!(assigned && workflowRevision !== undefined)) {
      throw new Error(
        "Refresh this Sub-milestone before changing its Work Allocation; its current version is unavailable."
      );
    }
    const fingerprint = JSON.stringify({
      ...targetScope,
      contractorId: assigned.contractorId,
      reason: removeReason.trim(),
    });
    const idempotencyKey = stableCommandKey(
      commandKeysRef.current,
      "submilestone-assignment-removal",
      fingerprint
    );
    await removeContractor({
      buildId,
      contractorId: assigned.contractorId,
      expectedRevision: workflowRevision,
      idempotencyKey,
      milestoneKey,
      reason: removeReason.trim(),
      submilestoneKey,
      workosOrganizationId: organizationId,
    });
    commandKeysRef.current.delete(fingerprint);
    onRetry?.();
  };

  const createInput = async ({
    assignmentCost,
    contractor,
    role,
  }: {
    assignmentCost?: ContractorAssignmentCostDraft;
    contractor: ContractorProfileDraft;
    role?: string;
  }) => {
    const resolvedRole = role ?? contractor.trades[0] ?? "Contractor";
    const intentKey = JSON.stringify({
      ...targetScope,
      assignmentCost,
      contractor,
      role: resolvedRole,
    });
    const retainedContractorId = createdContractorsRef.current.get(intentKey);
    const contractorId =
      retainedContractorId ??
      stringValue(
        object(
          await createAndAttach({
            buildId,
            contractor,
            role: resolvedRole,
            workosOrganizationId: organizationId,
          })
        ).contractorId
      );
    if (!contractorId) {
      throw new Error(
        "The contractor profile was created without an id; the assignment was not changed."
      );
    }
    if (!retainedContractorId) {
      createdContractorsRef.current.set(intentKey, contractorId);
    }
    await assignmentInput({ assignmentCost, contractorId, role: resolvedRole });
    createdContractorsRef.current.delete(intentKey);
    return { contractorId };
  };

  return (
    <div className="space-y-4" data-testid="submilestone-people-collection">
      <Frame>
        <FramePanel className="space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="font-medium text-sm">People and Work Allocation</p>
              <p className="mt-1 text-muted-foreground text-xs">
                Names and contact details are redacted when your role cannot
                identify participants.
              </p>
            </div>
            {assignmentAllowed ? (
              <Button
                disabled={busy}
                onClick={() => setDrawerOpen(true)}
                size="sm"
                type="button"
              >
                <UserPlus aria-hidden="true" />
                Add assignment
              </Button>
            ) : null}
          </div>
          <Separator />
          <dl className="grid gap-4 sm:grid-cols-3">
            <Metric
              label="Participants"
              value={String(
                numberValue(people.participantCount, assigned ? 1 : 0)
              )}
            />
            <Metric
              label="Allocation history"
              value={String(
                numberValue(people.historyCount, historyRows.length)
              )}
            />
            <Metric
              label="Current state"
              value={
                assigned ? statusLabel(assigned.status) : "Assignment required"
              }
            />
          </dl>
          {assigned ? (
            <Card className="shadow-none">
              <CardHeader className="p-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <CardTitle className="text-sm">
                      {assigned.redacted
                        ? "Participant redacted"
                        : assigned.displayName}
                    </CardTitle>
                    <CardDescription>
                      {assigned.role || "Contractor"}
                    </CardDescription>
                  </div>
                  <Badge
                    variant={
                      assigned.status === "removed" ? "warning" : "success"
                    }
                  >
                    {statusLabel(assigned.status)}
                  </Badge>
                </div>
              </CardHeader>
              {removeAllowed ? (
                <CardPanel className="space-y-2 p-3 pt-0">
                  {removeOpen ? (
                    <div className="space-y-2">
                      <Label className="space-y-1 text-xs">
                        <span>Removal reason</span>
                        <Input
                          aria-label="Removal reason"
                          onChange={(event) =>
                            setRemoveReason(event.target.value)
                          }
                          value={removeReason}
                        />
                      </Label>
                      <div className="flex flex-wrap gap-2">
                        <Button
                          disabled={busy || removeReason.trim().length < 3}
                          onClick={() =>
                            void run(removeAssignment).catch(() => undefined)
                          }
                          size="sm"
                          type="button"
                          variant="destructive"
                        >
                          Remove assignment
                        </Button>
                        <Button
                          onClick={() => setRemoveOpen(false)}
                          size="sm"
                          type="button"
                          variant="ghost"
                        >
                          Cancel
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <Button
                      onClick={() => setRemoveOpen(true)}
                      size="sm"
                      type="button"
                      variant="outline"
                    >
                      <X aria-hidden="true" />
                      Remove assignment
                    </Button>
                  )}
                </CardPanel>
              ) : null}
            </Card>
          ) : (
            <Frame>
              <FramePanel className="flex items-center gap-2 p-3 text-muted-foreground text-sm">
                <ShieldAlert
                  aria-hidden="true"
                  className="size-4 text-warning"
                />
                Assignment required before a Contractor can operate this
                Sub-milestone.
              </FramePanel>
            </Frame>
          )}
          {participants.length > 0 ? (
            <section
              aria-labelledby="build-participants-heading"
              className="space-y-2"
              data-testid="submilestone-build-participants"
            >
              <h3
                className="font-medium text-sm"
                id="build-participants-heading"
              >
                Build participants
              </h3>
              {participantsPartial ? (
                <p className="text-muted-foreground text-xs">
                  Showing the first page of authorized build participants.
                </p>
              ) : null}
              <div className="divide-y">
                {participants.map((participant, index) => (
                  <div
                    className="flex items-center justify-between gap-3 p-3 text-sm"
                    data-participant-id={participant.id}
                    key={participant.id || `participant-${index}`}
                  >
                    <div className="min-w-0">
                      <p className="break-words font-medium">
                        {participant.redacted
                          ? "Participant redacted"
                          : participant.displayName}
                      </p>
                      <p className="break-words text-muted-foreground text-xs">
                        {participant.role}
                        {!participant.redacted && participant.email
                          ? ` · ${participant.email}`
                          : ""}
                      </p>
                    </div>
                    <Badge
                      variant={
                        participant.status === "removed" ? "warning" : "outline"
                      }
                    >
                      {statusLabel(participant.status)}
                    </Badge>
                  </div>
                ))}
              </div>
            </section>
          ) : null}
          {!(readOnly || hasRevision) &&
          (assignmentCapability.allowed || removeCapability.allowed) ? (
            <p className="text-muted-foreground text-sm" role="status">
              Refresh this Sub-milestone before changing its Work Allocation;
              its current version is unavailable.
            </p>
          ) : null}
          {historyRows.length > 0 ? (
            <section
              aria-labelledby="allocation-history-heading"
              className="space-y-2"
            >
              <h3
                className="font-medium text-sm"
                id="allocation-history-heading"
              >
                Allocation history
              </h3>
              <div className="space-y-2">
                {historyRows.map((row, index) => {
                  const normalized = normalizeAssignedPerson(row);
                  return (
                    <div
                      className="flex flex-col items-start gap-1 border-b pb-2 text-sm last:border-b-0 sm:flex-row sm:items-center sm:justify-between sm:gap-3"
                      key={stringValue(
                        row.id ?? row.assignmentId,
                        `history-${index}`
                      )}
                    >
                      <span className="break-words">
                        {normalized?.redacted
                          ? "Participant redacted"
                          : (normalized?.displayName ?? "Allocation event")}
                      </span>
                      <span className="text-muted-foreground text-xs">
                        {statusLabel(
                          row.historyType ?? row.status ?? "updated"
                        )}
                      </span>
                    </div>
                  );
                })}
              </div>
            </section>
          ) : null}
          {error ? <CommandError error={error} retry={null} /> : null}
        </FramePanel>
      </Frame>
      {assignmentAllowed ? (
        <ContractorQuickAddDrawer
          availableContractors={available}
          createLabel="Create and assign"
          description="Attach an existing contractor or create a contractor profile, then assign it only to this Sub-milestone."
          onAttachExisting={async ({ assignmentCost, contractorId, role }) => {
            await run(() =>
              assignmentInput({ assignmentCost, contractorId, role })
            );
          }}
          onCreate={async ({ assignmentCost, contractor, role }) => {
            let result: unknown;
            await run(async () => {
              result = await createInput({ assignmentCost, contractor, role });
            });
            return result as { contractorId?: string } | undefined;
          }}
          onOpenChange={setDrawerOpen}
          open={drawerOpen}
          requireRole
          showAssignmentCost
          title={`Assign contractor to ${submilestoneNameFor(bootstrap)}`}
        />
      ) : null}
    </div>
  );
}

function normalizeAssignedPerson(value: unknown) {
  const row = object(value);
  const contractorId = stringValue(row.contractorId ?? row.id);
  if (!contractorId) {
    return null;
  }
  const redacted =
    booleanValue(row.redacted, false) || !stringValue(row.displayName);
  return {
    contractorId,
    displayName: redacted
      ? "Participant redacted"
      : stringValue(row.displayName),
    redacted,
    role: stringValue(row.role),
    status: stringValue(row.status, "active"),
  };
}

function projectedPeopleParticipants(value: unknown) {
  return arrayValue(value)
    .map((entry) => normalizeBuildParticipant(object(entry)))
    .filter((entry): entry is BuildParticipantProjection => entry !== null);
}

function normalizeBuildParticipant(value: Record<string, unknown>) {
  const displayName = stringValue(value.displayName ?? value.name);
  const role = stringValue(value.role ?? value.participantRole, "Participant");
  const redacted = booleanValue(value.redacted, false) || !displayName;
  const id = stringValue(
    value.id ?? value.participantId ?? value.workosUserId ?? value.userId
  );
  return {
    displayName: redacted ? "Participant redacted" : displayName,
    email: redacted ? undefined : stringValue(value.email) || undefined,
    id,
    redacted,
    role,
    status: stringValue(value.status, "active"),
  } satisfies BuildParticipantProjection;
}

interface BuildParticipantProjection {
  displayName: string;
  email?: string;
  id: string;
  redacted: boolean;
  role: string;
  status: string;
}

function projectedContractorCandidates(...values: unknown[]) {
  const candidates = values.flatMap((value) => arrayValue(value));
  const byId = new Map<string, ContractorDrawerAvailableContractor>();
  for (const value of candidates) {
    const candidate = toAvailableContractor(object(value));
    if (candidate._id && !byId.has(candidate._id)) {
      byId.set(candidate._id, candidate);
    }
  }
  return [...byId.values()];
}

function toAvailableContractor(
  value: Record<string, unknown>
): ContractorDrawerAvailableContractor {
  const redacted = booleanValue(value.redacted, false);
  return {
    _id: stringValue(
      value._id ?? value.id ?? value.contractorId ?? value.profileId
    ),
    city: redacted ? undefined : stringValue(value.city) || undefined,
    defaultPayRateCents: redacted
      ? undefined
      : optionalNumber(value.defaultPayRateCents),
    defaultPayRateUnit:
      value.defaultPayRateUnit === "hour" ||
      value.defaultPayRateUnit === "day" ||
      value.defaultPayRateUnit === "fixed"
        ? value.defaultPayRateUnit
        : undefined,
    email: redacted ? undefined : stringValue(value.email) || undefined,
    name: redacted
      ? "Contractor redacted"
      : stringValue(value.name ?? value.displayName, "Contractor"),
    onboardingStatus:
      value.onboardingStatus === "invited" ||
      value.onboardingStatus === "account_linked"
        ? value.onboardingStatus
        : "profile_only",
    trades: redacted
      ? []
      : arrayValue(value.trades ?? value.specialties).filter(
          (trade): trade is string => typeof trade === "string"
        ),
  };
}

function CanonicalMaterialsPanel({
  bootstrap,
  buildId,
  buildSubmilestoneId: _buildSubmilestoneId,
  collection,
  companionActionItemId: _companionActionItemId,
  onRetry,
  organizationId,
  readOnly,
  viewerCapacity: _viewerCapacity,
}: NavigationProps & {
  bootstrap: CanonicalWorkspaceBootstrap;
  collection: CanonicalWorkspaceCollection | undefined;
}) {
  const createItem = useMutation(
    apiRef.production_proposals.createActiveBuildCostItem
  );
  const updateItem = useMutation(
    apiRef.production_proposals.updateActiveBuildCostItem
  );
  const deleteItem = useMutation(
    apiRef.production_proposals.deleteActiveBuildCostItem
  );
  const materials = object(bootstrap.materials);
  const rows = collectionRows(collection);
  const projectedMaterials = arrayValue(materials.items);
  const submilestoneKey = submilestoneKeyFor(bootstrap);
  const milestoneKey = milestoneKeyFor(bootstrap);
  const workflowRevision = revisionFor(bootstrap);
  const hasRevision = workflowRevision !== undefined;
  const commandKeysRef = useRef(new Map<string, string>());
  const budgetCents = numberValue(
    object(bootstrap.overview).budgetCents ?? materials.totalBudgetCents,
    0
  );
  const items = [
    ...projectedMaterials.map((value, index) =>
      toMaterialItem(object(value), milestoneKey, submilestoneKey, index)
    ),
    ...rows.map((value, index) =>
      toMaterialItem(
        value,
        milestoneKey,
        submilestoneKey,
        projectedMaterials.length + index
      )
    ),
  ].filter(
    (item, index, all) =>
      all.findIndex((candidate) => candidate._id === item._id) === index
  );
  const materialRead = capability(bootstrap, "readMaterials").allowed;
  const materialCapability = capability(bootstrap, "updateMaterials");
  const materialWrite =
    hasRevision && canMutate(bootstrap, readOnly, "updateMaterials");
  const milestone: MaterialPlanningMilestone = {
    budgetCents,
    key: milestoneKey,
    name: milestoneNameFor(bootstrap),
    order: 0,
    submilestones: [
      {
        budgetCents,
        key: submilestoneKey,
        name: submilestoneNameFor(bootstrap),
        order: 0,
      },
    ],
  };
  const actions: MaterialPlanningActions | undefined = materialWrite
    ? {
        create: async (payload: MaterialPlanningPayload) => {
          const scopedPayload = {
            ...withoutActiveBuildBudgetTarget(payload),
            buildId,
            relevantSubmilestoneKeys: scopedRelevantSubmilestoneKeys(
              payload,
              submilestoneKey
            ),
            submilestoneKey,
            workosOrganizationId: organizationId,
          };
          const fingerprint = JSON.stringify(scopedPayload);
          const idempotencyKey = stableCommandKey(
            commandKeysRef.current,
            "submilestone-material-create",
            fingerprint
          );
          const result = await createItem({
            ...scopedPayload,
            expectedRevision: workflowRevision,
            idempotencyKey,
          });
          commandKeysRef.current.delete(fingerprint);
          onRetry?.();
          return result;
        },
        delete: async (item, reason) => {
          assertCanonicalMaterialId(item._id);
          const scopedPayload = {
            buildId,
            itemId: item._id,
            milestoneKey,
            reason,
            submilestoneKey,
            workosOrganizationId: organizationId,
          };
          const fingerprint = JSON.stringify(scopedPayload);
          const idempotencyKey = stableCommandKey(
            commandKeysRef.current,
            "submilestone-material-delete",
            fingerprint
          );
          const result = await deleteItem({
            ...scopedPayload,
            expectedRevision: workflowRevision,
            idempotencyKey,
          });
          commandKeysRef.current.delete(fingerprint);
          onRetry?.();
          return result;
        },
        update: async (item, payload) => {
          assertCanonicalMaterialId(item._id);
          const scopedPayload = {
            ...withoutActiveBuildBudgetTarget(payload),
            // Active-build editors do not expose budget-target controls, but
            // the canonical record still owns those values. Carry the
            // existing target/treatment through unchanged so an edit cannot
            // accidentally drop the server's budget semantics.
            budgetSubmilestoneKey: item.budgetSubmilestoneKey ?? null,
            budgetTreatment: item.budgetTreatment ?? "add",
            buildId,
            itemId: item._id,
            relevantSubmilestoneKeys: scopedRelevantSubmilestoneKeys(
              payload,
              submilestoneKey
            ),
            submilestoneKey,
            workosOrganizationId: organizationId,
          };
          const fingerprint = JSON.stringify(scopedPayload);
          const idempotencyKey = stableCommandKey(
            commandKeysRef.current,
            "submilestone-material-update",
            fingerprint
          );
          const result = await updateItem({
            ...scopedPayload,
            expectedRevision: workflowRevision,
            idempotencyKey,
          });
          commandKeysRef.current.delete(fingerprint);
          onRetry?.();
          return result;
        },
      }
    : undefined;

  if (!materialRead) {
    return (
      <Frame data-testid="submilestone-materials-collection">
        <FramePanel className="flex items-center gap-2 p-4 text-muted-foreground text-sm">
          <ShieldAlert aria-hidden="true" className="size-4" />
          Materials are unavailable for this Build viewer.
        </FramePanel>
      </Frame>
    );
  }
  return (
    <div data-testid="submilestone-materials-collection">
      {!(readOnly || hasRevision) && materialCapability.allowed ? (
        <Frame className="mb-3">
          <FramePanel
            className="p-3 text-muted-foreground text-sm"
            role="status"
          >
            Refresh this Sub-milestone before changing Materials; its current
            version is unavailable.
          </FramePanel>
        </Frame>
      ) : null}
      <MaterialPlanningTab
        actions={actions}
        // Active-build cost items inherit additive budget behavior from the
        // server. Proposal-only target/treatment controls stay hidden, while
        // existing projected values remain in update payloads.
        budgetTreatmentEnabled={false}
        currencyCode="CAD"
        items={items}
        milestones={[milestone]}
        panelLayout="stacked"
        readOnly={!materialWrite}
        scopeLabel={`${milestone.name} · ${submilestoneNameFor(bootstrap)}`}
        showChangeReason
        variant="embedded"
      />
    </div>
  );
}

function assertCanonicalMaterialId(itemId: string) {
  if (itemId.startsWith("legacy-material:")) {
    throw new Error(
      "This Material record has no canonical identity. Refresh the Sub-milestone before editing or deleting it."
    );
  }
}

function withoutActiveBuildBudgetTarget(payload: MaterialPlanningPayload) {
  const {
    budgetSubmilestoneKey: _budgetSubmilestoneKey,
    budgetTreatment: _budgetTreatment,
    ...activeBuildPayload
  } = payload;
  return activeBuildPayload;
}

function scopedRelevantSubmilestoneKeys(
  payload: MaterialPlanningPayload,
  submilestoneKey: string
) {
  return [submilestoneKey, ...payload.relevantSubmilestoneKeys].filter(
    (key, index, keys) => key && keys.indexOf(key) === index
  );
}

function toMaterialItem(
  value: Record<string, unknown>,
  defaultMilestoneKey = "",
  _defaultSubmilestoneKey = "",
  rowIndex = 0
): MaterialPlanningItem {
  const itemType =
    stringValue(value.itemType ?? value.kind, "material") === "equipment"
      ? "equipment"
      : "material";
  const id = stringValue(
    value._id ?? value.id ?? value.itemId,
    `legacy-material:${defaultMilestoneKey}:${stringValue(
      value.itemKey ?? value.title ?? value.name,
      itemType
    )}:${stringValue(value.createdAt ?? value.updatedAt, "unknown")}:${rowIndex}`
  );
  const budgetTarget = object(value.budgetTarget);
  const submilestoneKey = stringValue(
    value.budgetSubmilestoneKey ??
      value.submilestoneKey ??
      value.budgetTargetKey ??
      budgetTarget.submilestoneKey ??
      budgetTarget.key
  );
  const projectedBudgetTreatment = value.budgetTreatment;
  return {
    _id: id,
    budgetSubmilestoneKey: submilestoneKey || undefined,
    budgetTreatment:
      projectedBudgetTreatment === "maintain" ||
      projectedBudgetTreatment === "logOnly"
        ? projectedBudgetTreatment
        : "add",
    costCents: numberValue(
      value.costCents ?? value.amountCents ?? value.totalCents,
      0
    ),
    description: stringValue(value.description ?? value.detail) || undefined,
    itemKey: stringValue(value.itemKey) || undefined,
    itemType,
    milestoneKey: stringValue(value.milestoneKey, defaultMilestoneKey),
    quantity: numberValue(value.quantity, 1),
    relevantSubmilestoneKeys: arrayValue(value.relevantSubmilestoneKeys).filter(
      (key): key is string => typeof key === "string"
    ),
    supplier: stringValue(value.supplier) || undefined,
    title: stringValue(
      value.title,
      itemType === "equipment" ? "Equipment" : "Material"
    ),
    totalCents: optionalNumber(value.totalCents),
    updatedAt: optionalNumber(value.updatedAt),
  };
}

function captureLocationAttempt() {
  const attemptedAt = Date.now();
  if (typeof navigator === "undefined" || !navigator.geolocation) {
    return Promise.resolve({
      attempted: true,
      attemptedAt,
      failureReason:
        "Browser location is unavailable; evidence is retained for lender review.",
      permissionOutcome: "unavailable" as const,
      verified: false,
    });
  }
  return new Promise<{
    accuracyMeters?: number;
    attempted: boolean;
    attemptedAt?: number;
    failureReason?: string;
    latitude?: number;
    longitude?: number;
    permissionOutcome: "denied" | "granted" | "unavailable";
    verified: boolean;
  }>((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (position) =>
        resolve({
          accuracyMeters: Math.max(0, Math.round(position.coords.accuracy)),
          attempted: true,
          attemptedAt,
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          permissionOutcome: "granted",
          verified: false,
        }),
      (error) =>
        resolve({
          attempted: true,
          attemptedAt,
          failureReason:
            error.code === 1
              ? "Browser location permission was denied."
              : "Browser location could not be verified.",
          permissionOutcome: error.code === 1 ? "denied" : "unavailable",
          verified: false,
        }),
      { enableHighAccuracy: true, maximumAge: 0, timeout: 5000 }
    );
  });
}
