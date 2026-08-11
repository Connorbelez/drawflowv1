"use client";

import {
  ArrowLeft,
  Check,
  CheckCircle2,
  ChevronRight,
  Circle,
  ClipboardCheck,
  FileImage,
  ListChecks,
  MapPinOff,
  Package,
  Paperclip,
  Play,
  UserPlus,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertDialog,
  AlertDialogClose,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "#/components/ui/alert-dialog.tsx";
import { FieldRichTextPreview } from "#/components/rich-text/field-rich-text.tsx";
import { Badge } from "#/components/ui/badge.tsx";
import { Button, buttonVariants } from "#/components/ui/button.tsx";
import {
  Card,
  CardAction,
  CardDescription,
  CardHeader,
  CardPanel,
  CardTitle,
} from "#/components/ui/card.tsx";
import { Frame, FramePanel } from "#/components/ui/frame.tsx";
import { Input } from "#/components/ui/input.tsx";
import { Progress } from "#/components/ui/progress.tsx";
import {
  Sheet,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetPanel,
  SheetPopup,
  SheetTitle,
} from "#/components/ui/sheet.tsx";
import { Tabs, TabsList, TabsPanel, TabsTab } from "#/components/ui/tabs.tsx";
import { Textarea } from "#/components/ui/textarea.tsx";
import { cn } from "#/lib/utils.ts";
import type { BuildCollaborationRole } from "../../../convex/build_collaboration_model";
import type { Id } from "../../../convex/_generated/dataModel";
import type { BuildDetailTarget } from "../build-detail-targets/buildDetailTarget.ts";
import type { BuildSubmilestoneDetailTab } from "../build-detail-targets/buildDetailTab.ts";
import type { BuildDetailTargetContext } from "../build-detail-targets/useBuildDetailTargetController.ts";
import { ActiveBuildSubmilestoneGuidanceController } from "../submilestone-guidance/ActiveBuildSubmilestoneGuidanceController.tsx";
import { ProposalSubmilestoneScopeController } from "../submilestone-scope/ProposalSubmilestoneScopeController.tsx";
import {
  formatCentsExact,
  formatDate,
  formatRelative,
  initialsFor,
} from "./format";

type WorkState = "planned" | "in_progress" | "complete";
type SheetView = "detail" | "guided" | "ledger";
type DetailTab = "evidence" | "materials" | "notes" | "overview" | "people";
type CanonicalDirtySection = "guidance" | "scope";

interface PendingCanonicalNavigation {
  action: () => void;
  label: string;
}

function canonicalSubmilestoneTab(
  tab: DetailTab,
): BuildSubmilestoneDetailTab {
  return tab === "notes" ? "collaboration" : tab;
}

export interface MilestoneSheetSubmilestone {
  actualStartedAt?: number;
  actualCostCents?: number;
  assignments: Array<{
    actualCostCents?: number;
    actualHours?: number;
    agreedRateCents?: number;
    agreedRateUnit?: "day" | "fixed" | "hour";
    contractorId: string;
    costNotes?: string;
    estimatedCostCents?: number;
    estimatedHours?: number;
    name: string;
    role: string;
    status: string;
  }>;
  budgetCents: number;
  completedAt?: number;
  completedByWorkosUserId?: string;
  endDate: string;
  evidence: Array<{
    createdAt?: number;
    evidenceKey: string;
    fileName: string;
    label: string;
    locationVerified: boolean;
    mimeType: string;
    previewUrl?: string | null;
    sizeBytes: number;
    source?: string;
    tag: string;
  }>;
  fieldNote?: string;
  /** Optional execution-only context; never treated as contractual Scope. */
  executionSummary?: string;
  buildSubmilestoneId?: string;
  proposalSubmilestoneId?: string;
  key: string;
  submilestoneId?: Id<"buildSubmilestones">;
  materials: Array<{
    description?: string;
    id: string;
    quantity: number;
    supplier?: string;
    title: string;
    totalCents: number;
    type: "equipment" | "material";
  }>;
  name: string;
  order: number;
  siteVisits: Array<{
    completedAt?: string;
    note?: string;
    recordNote?: string;
    recordNoteFormat?: "html" | "plain_text";
    requestedAt: string;
    status: string;
    visitId: string;
  }>;
  startDate: string;
  status: WorkState;
  workflowRevision?: number;
}

export interface MilestoneSheetData {
  actualStartedAt?: number;
  canStartWork?: boolean;
  column: string;
  contractors: { name: string; initials: string; role?: string }[];
  currentDay?: number;
  drawGroupKey: string;
  milestoneKey: string;
  name: string;
  status?: WorkState;
  plannedBudgetCents?: number;
  plannedEndDate?: string;
  plannedStartDate?: string;
  recentEvents: {
    _id: string;
    title: string;
    actor: string;
    createdAt: number;
  }[];
  requestedAmountCents?: number;
  reviewRequest?: {
    note: string;
    requestedAt?: number;
  };
  submilestones?: MilestoneSheetSubmilestone[];
  submittedAt?: number;
}

interface SubmilestoneUpdateInput {
  actualCostCents?: number | null;
  actualStartedAt?: number;
  dependencyOverrideReason?: string;
  expectedRevision: number;
  fieldNote?: string | null;
  idempotencyKey?: string;
  milestoneKey: string;
  reason?: string;
  status?: WorkState;
  submilestoneKey: string;
}

interface MilestoneDetailSheetProps {
  assignmentsSourceLabel?: string;
  data: MilestoneSheetData | null;
  errorMessage?: string;
  eventsSourceLabel?: string;
  focusedSubmilestoneId?: string;
  focusedSubmilestoneKey?: string;
  /** Identity fallbacks for single-row or focused legacy sheet callers. */
  buildSubmilestoneId?: string;
  proposalSubmilestoneId?: string;
  readOnly?: boolean;
  viewerCapacity?: BuildCollaborationRole;
  workosOrganizationId?: string;
  onApprove?: (milestoneKey: string, note?: string) => Promise<void> | void;
  onAmendStart?: (
    action: "correct" | "retract",
    milestoneKey: string,
    submilestoneKey?: string
  ) => void;
  onAssignContractor?: (milestoneKey: string, submilestoneKey?: string) => void;
  onAssignVisit?: (milestoneKey: string) => void;
  onClose: () => void;
  onOpenCanonicalTarget?: (
    target: BuildDetailTarget,
    context?: BuildDetailTargetContext,
  ) => void;
  onReject?: (milestoneKey: string) => void;
  onRequestInfo?: (milestoneKey: string, note: string) => void;
  onStartWork?: (milestoneKey: string, note?: string) => Promise<void> | void;
  onStartSubmilestone?: (
    milestoneKey: string,
    submilestoneKey: string,
    source:
      | "guided_field_workflow"
      | "submilestone_detail"
      | "submilestone_ledger"
  ) => void;
  onSubmitCompletion?: (input: {
    actualCostCents?: number;
    actualStartedAt?: number;
    completedDay: number;
    dependencyOverrideReason?: string;
    idempotencyKey: string;
    milestoneKey: string;
    note?: string;
  }) => Promise<unknown> | unknown;
  onUpdateSubmilestone?: (
    input: SubmilestoneUpdateInput
  ) => Promise<unknown> | unknown;
  onUploadEvidence?: (
    input: EvidenceUploaderUploadInput
  ) => Promise<unknown> | unknown;
  pending?: boolean;
  prototypeSubmilestoneStartTrigger?: boolean;
}

interface CanonicalSubmilestoneIdentity {
  buildSubmilestoneId?: string;
  proposalSubmilestoneId?: string;
}

function CanonicalWorkItemContext({
  identity,
  item,
  onDirtyChange,
  readOnly,
  viewerCapacity,
  workosOrganizationId,
}: {
  identity: CanonicalSubmilestoneIdentity;
  item: MilestoneSheetSubmilestone;
  onDirtyChange?: (section: CanonicalDirtySection, dirty: boolean) => void;
  readOnly: boolean;
  viewerCapacity?: BuildCollaborationRole;
  workosOrganizationId?: string;
}) {
  useEffect(
    () => () => {
      onDirtyChange?.("scope", false);
      onDirtyChange?.("guidance", false);
    },
    [onDirtyChange],
  );

  if (
    !(
      identity.buildSubmilestoneId &&
      identity.proposalSubmilestoneId &&
      workosOrganizationId
    )
  ) {
    return null;
  }
  return (
    <div className="grid gap-4" data-testid="canonical-work-item-context">
      <ProposalSubmilestoneScopeController
        onDirtyChange={(dirty) => onDirtyChange?.("scope", dirty)}
        proposalSubmilestoneId={identity.proposalSubmilestoneId}
        readOnly={readOnly}
        scopeRoute="active-build"
        viewerCapacity={viewerCapacity}
        workosOrganizationId={workosOrganizationId}
      />
      <ActiveBuildSubmilestoneGuidanceController
        buildSubmilestoneId={identity.buildSubmilestoneId}
        onDirtyChange={(dirty) => onDirtyChange?.("guidance", dirty)}
        proposalSubmilestoneId={identity.proposalSubmilestoneId}
        readOnly={readOnly}
        rowName={item.name}
        subMilestoneName={item.name}
        viewerCapacity={viewerCapacity}
        workosOrganizationId={workosOrganizationId}
      />
    </div>
  );
}

function ExecutionSummary({ item }: { item: MilestoneSheetSubmilestone }) {
  if (!item.executionSummary?.trim()) {
    return null;
  }
  return (
    <Frame data-testid="execution-summary">
      <FramePanel className="grid gap-1 p-3">
        <p className="text-muted-foreground text-xs uppercase tracking-wider">
          Execution summary
        </p>
        <p className="text-sm leading-relaxed">{item.executionSummary}</p>
      </FramePanel>
    </Frame>
  );
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: This controller intentionally coordinates the ledger, nested detail, and guided escape hatch as one transactional sheet.
export function MilestoneDetailSheet({
  assignmentsSourceLabel,
  data,
  errorMessage,
  eventsSourceLabel,
  focusedSubmilestoneId,
  focusedSubmilestoneKey,
  buildSubmilestoneId,
  proposalSubmilestoneId,
  readOnly = false,
  viewerCapacity,
  workosOrganizationId,
  onApprove,
  onAmendStart,
  onAssignContractor,
  onAssignVisit,
  onClose,
  onOpenCanonicalTarget,
  onReject,
  onRequestInfo,
  onStartWork,
  onStartSubmilestone,
  onSubmitCompletion,
  onUpdateSubmilestone,
  onUploadEvidence,
  pending: externalPending,
}: MilestoneDetailSheetProps) {
  const [view, setView] = useState<SheetView>("ledger");
  const [selectedKey, setSelectedKey] = useState(
    data?.submilestones?.[0]?.key ?? ""
  );
  const [detailTab, setDetailTab] = useState<DetailTab>("overview");
  const [guidedStep, setGuidedStep] = useState(0);
  const milestoneNote = "";
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const [overrides, setOverrides] = useState<
    Record<string, Partial<MilestoneSheetSubmilestone>>
  >({});
  const [dirtySections, setDirtySections] = useState<
    Record<CanonicalDirtySection, boolean>
  >({
    guidance: false,
    scope: false,
  });
  const [pendingNavigation, setPendingNavigation] =
    useState<PendingCanonicalNavigation | null>(null);
  const hasUnsavedCanonicalChanges =
    dirtySections.scope || dirtySections.guidance;
  const onCanonicalDirtyChange = useCallback(
    (section: CanonicalDirtySection, dirty: boolean) => {
      setDirtySections((current) =>
        current[section] === dirty ? current : { ...current, [section]: dirty },
      );
    },
    [],
  );
  const requestNavigation = (action: () => void, label: string) => {
    if (!hasUnsavedCanonicalChanges) {
      action();
      return;
    }
    setPendingNavigation({ action, label });
  };
  const discardCanonicalChangesAndContinue = () => {
    const action = pendingNavigation?.action;
    setPendingNavigation(null);
    setDirtySections({ guidance: false, scope: false });
    action?.();
  };
  const handleClose = () =>
    requestNavigation(onClose, "close this milestone detail");
  const handleDetailTabChange = (nextTab: DetailTab) => {
    if (nextTab === detailTab) {
      return;
    }
    requestNavigation(() => setDetailTab(nextTab), "leave the Overview draft");
  };
  const handleBackToLedger = () =>
    requestNavigation(() => setView("ledger"), "return to the milestone ledger");
  const handleGuidedSelect = (key: string) => {
    if (key === selectedKey) {
      return;
    }
    requestNavigation(() => {
      setSelectedKey(key);
      setGuidedStep(0);
    }, "open another guided work item");
  };
  const handleGuidedStepChange = (step: number) => {
    if (step === guidedStep) {
      return;
    }
    requestNavigation(() => setGuidedStep(step), "move to another guided step");
  };

  const rows = useMemo(
    () =>
      (data?.submilestones ?? []).map((row) => ({
        ...row,
        ...overrides[row.key],
      })),
    [data?.submilestones, overrides]
  );
  const selected =
    rows.find((row) => row.key === selectedKey) ?? rows[0] ?? null;
  const canonicalIdentityFor = (item: MilestoneSheetSubmilestone) => {
    // Treat the two canonical IDs as one lineage pair.  A row that carries
    // either side is authoritative, even when the other side is absent; do
    // not silently combine it with a sheet-level fallback from another
    // source.  The sheet fallback is only eligible when the row carries no
    // canonical identity at all.
    const rowSuppliesCanonicalIdentity =
      item.buildSubmilestoneId !== undefined ||
      item.proposalSubmilestoneId !== undefined;
    const canUseSheetIdentity =
      !rowSuppliesCanonicalIdentity &&
      ((focusedSubmilestoneKey !== undefined &&
        focusedSubmilestoneKey === item.key) ||
        rows.length === 1);
    const sheetIdentity = canUseSheetIdentity
      ? { buildSubmilestoneId, proposalSubmilestoneId }
      : { buildSubmilestoneId: undefined, proposalSubmilestoneId: undefined };
    return {
      buildSubmilestoneId: rowSuppliesCanonicalIdentity
        ? item.buildSubmilestoneId
        : sheetIdentity.buildSubmilestoneId,
      proposalSubmilestoneId: rowSuppliesCanonicalIdentity
        ? item.proposalSubmilestoneId
        : sheetIdentity.proposalSubmilestoneId,
    };
  };
  const openCanonicalForRow = (
    row: MilestoneSheetSubmilestone | undefined,
    tab: BuildSubmilestoneDetailTab,
  ) => {
    if (!(onOpenCanonicalTarget && row?.submilestoneId)) {
      return false;
    }
    requestNavigation(
      () => {
        // Leave the parent sheet on its ledger before handing control to the
        // route-owned canonical child sheet. This prevents the legacy inline
        // detail/guided workflow from remaining visible behind the shared sheet.
        setView("ledger");
        onOpenCanonicalTarget(
          {
            kind: "submilestone",
            submilestoneId: row.submilestoneId,
          },
          { selectedTab: tab },
        );
      },
      "open the canonical Sub-milestone detail",
    );
    return true;
  };
  const openSubmilestoneDetail = (key: string, tab: DetailTab = "overview") => {
    const row = rows.find((candidate) => candidate.key === key);
    if (openCanonicalForRow(row, canonicalSubmilestoneTab(tab))) {
      return;
    }
    setSelectedKey(key);
    setDetailTab(tab);
    setView("detail");
  };
  const assignSubmilestoneContractor = (
    milestoneKey: string,
    submilestoneKey?: string,
  ) => {
    const row = rows.find((candidate) => candidate.key === submilestoneKey);
    if (openCanonicalForRow(row, "people")) {
      return;
    }
    onAssignContractor?.(milestoneKey, submilestoneKey);
  };
  const startSubmilestone = (
    milestoneKey: string,
    submilestoneKey: string,
    source:
      | "guided_field_workflow"
      | "submilestone_detail"
      | "submilestone_ledger",
  ) => {
    const row = rows.find((candidate) => candidate.key === submilestoneKey);
    if (openCanonicalForRow(row, "overview")) {
      return;
    }
    onStartSubmilestone?.(milestoneKey, submilestoneKey, source);
  };
  const amendSubmilestoneStart = (
    action: "correct" | "retract",
    milestoneKey: string,
    submilestoneKey?: string,
  ) => {
    const row = rows.find((candidate) => candidate.key === submilestoneKey);
    if (openCanonicalForRow(row, "review")) {
      return;
    }
    onAmendStart?.(action, milestoneKey, submilestoneKey);
  };
  useEffect(() => {
    if (
      focusedSubmilestoneKey &&
      rows.some((row) => row.key === focusedSubmilestoneKey)
    ) {
      setSelectedKey(focusedSubmilestoneKey);
      setDetailTab("overview");
      setView("detail");
    }
  }, [focusedSubmilestoneKey, rows]);
  const incomplete = rows.filter((row) => row.status !== "complete");
  const completedCount = rows.length - incomplete.length;
  const eligible = rows.length === 0 || incomplete.length === 0;
  const lifecycleCommandKeys = useRef(new Map<string, string>());

  if (!data) {
    return null;
  }

  const updateSubmilestone = async (
    input: Omit<SubmilestoneUpdateInput, "expectedRevision" | "milestoneKey">,
    optimistic: Partial<MilestoneSheetSubmilestone>
  ) => {
    const target = rows.find((row) => row.key === input.submilestoneKey);
    const canonicalTab = Object.hasOwn(input, "actualCostCents")
      ? "materials"
      : Object.hasOwn(input, "fieldNote")
        ? "collaboration"
        : Object.hasOwn(input, "status")
          ? "review"
          : "overview";
    if (openCanonicalForRow(target, canonicalTab)) {
      return;
    }
    if (readOnly || !onUpdateSubmilestone) {
      return;
    }
    setPendingKey(input.submilestoneKey);
    setLocalError(null);
    const expectedRevision = target?.workflowRevision;
    if (expectedRevision === undefined) {
      const error = new Error(
        "Refresh this Build detail before changing Sub-milestone work; the canonical workflow revision is unavailable."
      );
      setLocalError(error.message);
      setPendingKey(null);
      throw error;
    }
    const lifecycleIntent =
      input.status === "complete" ||
      (target.status === "complete" &&
        input.status !== undefined &&
        input.status !== "complete")
        ? `${input.submilestoneKey}:${input.status ?? "reopen"}`
        : undefined;
    const idempotencyKey = lifecycleIntent
      ? (input.idempotencyKey ??
        lifecycleCommandKeys.current.get(lifecycleIntent) ??
        crypto.randomUUID())
      : input.idempotencyKey;
    if (lifecycleIntent && idempotencyKey) {
      lifecycleCommandKeys.current.set(lifecycleIntent, idempotencyKey);
    }
    try {
      await onUpdateSubmilestone({
        ...input,
        expectedRevision,
        ...(idempotencyKey ? { idempotencyKey } : {}),
        milestoneKey: data.milestoneKey,
      });
      if (lifecycleIntent) {
        lifecycleCommandKeys.current.delete(lifecycleIntent);
      }
      setOverrides((current) => ({
        ...current,
        [input.submilestoneKey]: {
          ...current[input.submilestoneKey],
          ...optimistic,
        },
      }));
    } catch (error) {
      setLocalError(errorMessageFor(error));
      throw error;
    } finally {
      setPendingKey(null);
    }
  };

  const uploadSubmilestoneEvidence = async (
    input: EvidenceUploaderUploadInput,
  ) => {
    const row = rows.find((candidate) => candidate.key === input.submilestoneKey);
    if (openCanonicalForRow(row, "evidence")) {
      return;
    }
    await onUploadEvidence?.(input);
  };

  const openGuidedCompletion = () => {
    const firstIncomplete = incomplete[0];
    if (firstIncomplete && openCanonicalForRow(firstIncomplete, "review")) {
      return;
    }
    requestNavigation(() => {
      if (firstIncomplete) {
        setSelectedKey(firstIncomplete.key);
      }
      setGuidedStep(0);
      setView("guided");
    }, "open Guided completion");
  };

  const completeAndAdvanceInternal = async (
    navigationAlreadyConfirmed = false,
  ) => {
    if (readOnly || !selected || !onUpdateSubmilestone) {
      return;
    }
    await updateSubmilestone(
      { status: "complete", submilestoneKey: selected.key },
      { completedAt: Date.now(), status: "complete" }
    );
    const next = rows.find(
      (row) => row.key !== selected.key && row.status !== "complete"
    );
    const continueAction = () => {
      if (next) {
        setSelectedKey(next.key);
        setGuidedStep(0);
      } else {
        setView("ledger");
      }
    };
    if (navigationAlreadyConfirmed) {
      continueAction();
    } else {
      requestNavigation(
        continueAction,
        next ? "open the next guided work item" : "return to the milestone ledger",
      );
    }
  };

  const completeAndAdvance = () => {
    if (!hasUnsavedCanonicalChanges) {
      return completeAndAdvanceInternal();
    }
    requestNavigation(
      () => {
        completeAndAdvanceInternal(true).catch(ignoreHandledMutationError);
      },
      "complete this work item",
    );
    return Promise.resolve();
  };

  const submitCompletion = async () => {
    if (readOnly || !(eligible && onSubmitCompletion) || data.submittedAt) {
      return;
    }
    setPendingKey("milestone-submit");
    setLocalError(null);
    try {
      const actualCosts = rows
        .map((row) => row.actualCostCents)
        .filter((value): value is number => typeof value === "number");
      await onSubmitCompletion({
        ...(actualCosts.length > 0
          ? {
              actualCostCents: actualCosts.reduce(
                (sum, value) => sum + value,
                0
              ),
            }
          : {}),
        completedDay: data.currentDay ?? 0,
        idempotencyKey: crypto.randomUUID(),
        milestoneKey: data.milestoneKey,
        ...(milestoneNote.trim() ? { note: milestoneNote.trim() } : {}),
      });
    } catch (error) {
      setLocalError(errorMessageFor(error));
    } finally {
      setPendingKey(null);
    }
  };

  return (
    <>
      <Sheet
        onOpenChange={(open) => {
          if (!open) {
            handleClose();
          }
        }}
        open
      >
        <SheetPopup
          className={cn(
            "w-full sm:max-w-[720px]",
            view === "guided" && "sm:max-w-[900px]"
          )}
          closeProps={{ "data-testid": "milestone-detail-sheet-close" }}
          data-collaboration-focus={
            focusedSubmilestoneId
              ? `submilestone:${focusedSubmilestoneId}`
              : undefined
          }
          data-testid="milestone-detail-sheet-panel"
          side="right"
        >
        <SheetHeader
          className="border-b px-4 py-4 sm:px-6"
          data-testid="milestone-detail-sheet"
        >
          <div className="pr-8">
            <p className="text-[10px] text-muted-foreground uppercase tracking-[0.16em]">
              {view === "guided"
                ? "Guided completion"
                : view === "detail"
                  ? "Submilestone detail"
                  : "Milestone execution"}
            </p>
            <SheetTitle className="mt-1">{data.name}</SheetTitle>
            <SheetDescription className="mt-1">
              {view === "guided"
                ? "Resolve each remaining work item in context, then return to the milestone ledger."
                : `${data.column} · Linked draw ${data.drawGroupKey.toUpperCase()}`}
            </SheetDescription>
            <div className="mt-3 flex flex-wrap gap-2">
              <Badge variant="outline">{data.milestoneKey.toUpperCase()}</Badge>
              <Badge variant={eligible ? "success" : "secondary"}>
                <ListChecks />
                {completedCount}/{rows.length} complete
              </Badge>
              {data.submittedAt ? (
                <Badge variant={eligible ? "success" : "warning"}>
                  <CheckCircle2 />
                  {eligible
                    ? "Submitted for lender review"
                    : "Claim submitted · work incomplete"}
                </Badge>
              ) : null}
              {data.actualStartedAt ? (
                <Badge variant="info">
                  Actual start {formatDate(data.actualStartedAt)}
                </Badge>
              ) : data.status && data.status !== "planned" ? (
                <Badge variant="warning">Actual start unknown</Badge>
              ) : null}
            </div>
            {assignmentsSourceLabel ? (
              <p className="sr-only">Assignments · {assignmentsSourceLabel}</p>
            ) : null}
            {eventsSourceLabel ? (
              <p className="sr-only">Recent events · {eventsSourceLabel}</p>
            ) : null}
          </div>
        </SheetHeader>

        <SheetPanel className="grid gap-4 px-3 sm:px-5">
          {view === "ledger" ? (
            <LedgerView
              data={data}
              onAssignContractor={assignSubmilestoneContractor}
              onOpenDetail={openSubmilestoneDetail}
              onUpdate={updateSubmilestone}
              onStartSubmilestone={startSubmilestone}
              onUploadEvidence={uploadSubmilestoneEvidence}
              pendingKey={pendingKey}
              readOnly={readOnly}
              rows={rows}
            />
          ) : null}
          {view === "detail" && selected ? (
            <div
              data-collaboration-focus={
                focusedSubmilestoneId
                  ? `submilestone:${focusedSubmilestoneId}`
                  : undefined
              }
            >
              <DetailView
                activeTab={detailTab}
                data={data}
                item={selected}
                onAssignContractor={assignSubmilestoneContractor}
                onAmendStart={amendSubmilestoneStart}
                onBack={handleBackToLedger}
                onDirtyChange={onCanonicalDirtyChange}
                onTabChange={handleDetailTabChange}
                onStartSubmilestone={startSubmilestone}
                onUpdate={updateSubmilestone}
                onUploadEvidence={uploadSubmilestoneEvidence}
                pendingKey={pendingKey}
                canonicalIdentity={canonicalIdentityFor(selected)}
                readOnly={readOnly}
                viewerCapacity={viewerCapacity}
                workosOrganizationId={workosOrganizationId}
              />
            </div>
          ) : null}
          {view === "guided" && selected ? (
            <GuidedView
              data={data}
              item={selected}
              onAssignContractor={assignSubmilestoneContractor}
              onCompleteAndAdvance={completeAndAdvance}
              onDirtyChange={onCanonicalDirtyChange}
              onBackToLedger={handleBackToLedger}
              onSelect={(key) => {
                const row = rows.find((candidate) => candidate.key === key);
                if (openCanonicalForRow(row, "overview")) {
                  return;
                }
                handleGuidedSelect(key);
              }}
              onStepChange={handleGuidedStepChange}
              onUpdate={updateSubmilestone}
              onStartSubmilestone={startSubmilestone}
              onUploadEvidence={uploadSubmilestoneEvidence}
              pendingKey={pendingKey}
              rows={rows}
              step={guidedStep}
              canonicalIdentity={canonicalIdentityFor(selected)}
              readOnly={readOnly}
              viewerCapacity={viewerCapacity}
              workosOrganizationId={workosOrganizationId}
            />
          ) : null}
          {localError || errorMessage ? (
            <Frame>
              <FramePanel className="p-3 text-destructive text-sm" role="alert">
                {localError ?? errorMessage}
              </FramePanel>
            </Frame>
          ) : null}
          {view === "ledger" && data.recentEvents.length > 0 ? (
            <RecentActivity events={data.recentEvents} />
          ) : null}
        </SheetPanel>

        <SheetFooter className="z-20 items-stretch gap-3 bg-background/95 px-4 pb-[calc(1rem+env(safe-area-inset-bottom))] backdrop-blur sm:flex-row sm:items-center sm:px-6">
          <div className="min-w-0 flex-1 text-left">
            <p className="font-medium text-sm">
              {eligible
                ? data.submittedAt
                  ? "Completion submitted"
                  : eligible
                    ? "All submilestones are complete"
                    : null
                : `${incomplete.length} submilestone${incomplete.length === 1 ? "" : "s"} still incomplete`}
            </p>
            <p
              className="truncate text-muted-foreground text-xs"
              id="milestone-completion-blockers"
            >
              {eligible
                ? data.submittedAt
                  ? `Submitted ${formatDate(data.submittedAt)} for lender review.`
                  : eligible
                    ? "Ready to submit the builder completion claim."
                    : null
                : `Guided completion will walk through: ${incomplete.map((row) => row.name).join(" · ")}`}
            </p>
          </div>
          {!readOnly && data.canStartWork && onStartWork ? (
            <Button
              data-testid="milestone-detail-sheet-start-work"
              disabled={Boolean(externalPending || pendingKey)}
              onClick={() =>
                onStartWork(
                  data.milestoneKey,
                  milestoneNote.trim() || undefined
                )
              }
              variant="outline"
            >
              <Play /> Start work
            </Button>
          ) : null}
          {!readOnly && data.actualStartedAt && onAmendStart ? (
            <>
              <Button
                onClick={() => onAmendStart("correct", data.milestoneKey)}
                size="sm"
                variant="outline"
              >
                Correct start
              </Button>
              <Button
                onClick={() => onAmendStart("retract", data.milestoneKey)}
                size="sm"
                variant="ghost"
              >
                Retract start
              </Button>
            </>
          ) : null}
          <Button
            aria-describedby="milestone-completion-blockers"
            data-testid="milestone-primary-completion-action"
            disabled={Boolean(
              readOnly ||
                (eligible && data.submittedAt) ||
                externalPending ||
                pendingKey
            )}
            loading={pendingKey === "milestone-submit"}
            onClick={eligible ? submitCompletion : openGuidedCompletion}
          >
            {eligible ? <ClipboardCheck /> : <ListChecks />}
            {eligible
              ? data.submittedAt
                ? "Completion submitted"
                : eligible
                  ? "Submit milestone completion"
                  : null
              : "Complete remaining work"}
          </Button>
          {!readOnly &&
          (onApprove || onRequestInfo || onAssignVisit || onReject) ? (
            <LegacyReviewActions
              data={data}
              note={milestoneNote}
              onApprove={onApprove}
              onAssignVisit={onAssignVisit}
              onReject={onReject}
              onRequestInfo={onRequestInfo}
            />
          ) : null}
        </SheetFooter>
        </SheetPopup>
      </Sheet>
      <AlertDialog
        onOpenChange={(dialogOpen) => {
          if (!dialogOpen) {
            setPendingNavigation(null);
          }
        }}
        open={pendingNavigation !== null}
      >
        <AlertDialogContent data-testid="milestone-detail-unsaved-dialog">
          <AlertDialogHeader>
            <AlertDialogTitle>
              Discard unsaved Scope and Field Guidance changes?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Your Scope or Field Guidance edits have not been saved. Continue
              to {pendingNavigation?.label} and discard them?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogClose
              render={<Button variant="outline">Keep editing</Button>}
            />
            <Button
              data-testid="milestone-detail-unsaved-discard"
              onClick={discardCanonicalChangesAndContinue}
              variant="destructive"
            >
              Discard changes
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function LedgerView({
  data,
  onAssignContractor,
  onOpenDetail,
  onStartSubmilestone,
  onUpdate,
  onUploadEvidence,
  pendingKey,
  readOnly,
  rows,
}: {
  data: MilestoneSheetData;
  onAssignContractor?: MilestoneDetailSheetProps["onAssignContractor"];
  onOpenDetail: (key: string, tab?: DetailTab) => void;
  onStartSubmilestone?: MilestoneDetailSheetProps["onStartSubmilestone"];
  onUpdate: (
    input: Omit<SubmilestoneUpdateInput, "milestoneKey">,
    optimistic: Partial<MilestoneSheetSubmilestone>
  ) => Promise<void>;
  onUploadEvidence?: MilestoneDetailSheetProps["onUploadEvidence"];
  pendingKey: string | null;
  readOnly: boolean;
  rows: MilestoneSheetSubmilestone[];
}) {
  const completed = rows.filter((row) => row.status === "complete").length;
  return (
    <>
      <Frame>
        <FramePanel className="grid gap-3 p-3 sm:grid-cols-4">
          <Metric label="Progress" value={`${completed} of ${rows.length}`} />
          <Metric
            label="Planned"
            value={formatCentsExact(data.plannedBudgetCents ?? 0)}
          />
          <Metric
            label={data.actualStartedAt ? "Actual start" : "Planned start"}
            value={
              data.actualStartedAt
                ? formatDate(data.actualStartedAt)
                : formatShortDate(data.plannedStartDate)
            }
          />
          <Metric label="End" value={formatShortDate(data.plannedEndDate)} />
        </FramePanel>
        <FramePanel className="px-3 pb-3">
          <Progress
            value={rows.length ? (completed / rows.length) * 100 : 100}
          />
        </FramePanel>
      </Frame>
      {data.reviewRequest ? (
        <Frame>
          <FramePanel className="p-3 text-sm">
            <h3 className="font-medium text-destructive">Requested changes</h3>
            <p className="mt-1 text-muted-foreground text-xs">
              {data.reviewRequest.note}
            </p>
            {data.reviewRequest.requestedAt ? (
              <p className="mt-1 text-muted-foreground text-xs">
                Requested {formatDate(data.reviewRequest.requestedAt)}
              </p>
            ) : null}
          </FramePanel>
        </Frame>
      ) : null}
      <ol className="grid gap-3">
        {rows.map((item, index) => (
          <Card
            className={cn(
              "overflow-hidden rounded-xl shadow-none",
              item.status === "complete" && "border-emerald-500/30"
            )}
            key={item.key}
            render={<li />}
          >
            <CardHeader className="p-3 pb-2 sm:p-4 sm:pb-2">
              <div className="flex min-w-0 items-center gap-2">
                <WorkStateIcon status={item.status} />
                <Button
                  className="h-auto min-w-0 justify-start border-transparent p-0 text-left text-foreground hover:bg-transparent"
                  onClick={() => onOpenDetail(item.key)}
                  variant="ghost"
                >
                  <span className="min-w-0">
                    <span className="block text-[10px] text-muted-foreground uppercase tracking-wider">
                      Work item {index + 1}
                    </span>
                    <span className="block truncate font-semibold text-sm">
                      {item.name}
                    </span>
                  </span>
                  <ChevronRight className="ml-1 size-4" />
                </Button>
              </div>
              <CardAction>
                <StatusBadge status={item.status} />
              </CardAction>
            </CardHeader>
            <CardPanel className="grid gap-3 p-3 pt-1 sm:p-4 sm:pt-1">
              <div className="grid gap-2 bg-muted/40 p-3 sm:grid-cols-3">
                <Metric
                  label="Planned"
                  value={formatCentsExact(item.budgetCents)}
                />
                <Metric
                  label={
                    item.actualStartedAt ? "Actual start" : "Planned start"
                  }
                  value={
                    item.actualStartedAt
                      ? formatDate(item.actualStartedAt)
                      : formatShortDate(item.startDate)
                  }
                />
                <Metric label="End" value={formatShortDate(item.endDate)} />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <ContractorSummary
                  item={item}
                  onAssign={
                    readOnly
                      ? undefined
                      : () => onAssignContractor?.(data.milestoneKey, item.key)
                  }
                  onOpen={() => onOpenDetail(item.key, "people")}
                />
                <MaterialSummary
                  item={item}
                  onOpen={() => onOpenDetail(item.key, "materials")}
                />
              </div>
              <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
                <ActualCostEditor
                  disabled={readOnly}
                  item={item}
                  onSave={(actualCostCents) =>
                    onUpdate(
                      { actualCostCents, submilestoneKey: item.key },
                      { actualCostCents: actualCostCents ?? undefined }
                    )
                  }
                />
                <div className="flex flex-wrap gap-2">
                  {!readOnly && onStartSubmilestone && item.status === "planned" ? (
                    <Button
                      data-testid={`submilestone-start-work-${item.key}`}
                      disabled={pendingKey === item.key || !onUpdate}
                      loading={pendingKey === item.key}
                      onClick={() => {
                        onStartSubmilestone(
                          data.milestoneKey,
                          item.key,
                          "submilestone_ledger"
                        );
                      }}
                      size="sm"
                      variant="outline"
                    >
                      <Play /> Start work
                    </Button>
                  ) : null}
                  <EvidenceUploader
                    compact
                    data={data}
                    disabled={readOnly}
                    item={item}
                    onUpload={readOnly ? undefined : onUploadEvidence}
                  />
                  {readOnly ? null : <Button
                    disabled={pendingKey === item.key || !onUpdate}
                    loading={pendingKey === item.key}
                    onClick={() => {
                      onUpdate(
                        {
                          ...(item.status === "complete"
                            ? {
                                reason:
                                  "Reopened from milestone execution sheet.",
                              }
                            : {}),
                          status:
                            item.status === "complete"
                              ? "in_progress"
                              : "complete",
                          submilestoneKey: item.key,
                        },
                        {
                          status:
                            item.status === "complete"
                              ? "in_progress"
                              : "complete",
                        }
                      ).catch(ignoreHandledMutationError);
                    }}
                    size="sm"
                    variant={item.status === "complete" ? "outline" : "default"}
                  >
                    <Check />
                    {item.status === "complete" ? "Reopen" : "Mark complete"}
                  </Button>}
                </div>
              </div>
              {item.evidence.some((asset) => !asset.locationVerified) ? (
                <button
                  className="flex items-center gap-2 text-left text-amber-700 text-xs dark:text-amber-300"
                  onClick={() => onOpenDetail(item.key, "evidence")}
                  type="button"
                >
                  <MapPinOff className="size-3.5" />
                  Location-unverified evidence is retained for lender review.
                </button>
              ) : null}
            </CardPanel>
          </Card>
        ))}
      </ol>
    </>
  );
}

function DetailView({
  activeTab,
  canonicalIdentity,
  data,
  item,
  onAssignContractor,
  onAmendStart,
  onBack,
  onDirtyChange,
  onTabChange,
  onStartSubmilestone,
  onUpdate,
  onUploadEvidence,
  pendingKey,
  readOnly,
  viewerCapacity,
  workosOrganizationId,
}: {
  activeTab: DetailTab;
  canonicalIdentity: CanonicalSubmilestoneIdentity;
  data: MilestoneSheetData;
  item: MilestoneSheetSubmilestone;
  onAssignContractor?: MilestoneDetailSheetProps["onAssignContractor"];
  onAmendStart?: MilestoneDetailSheetProps["onAmendStart"];
  onBack: () => void;
  onDirtyChange?: (section: CanonicalDirtySection, dirty: boolean) => void;
  onTabChange: (tab: DetailTab) => void;
  onStartSubmilestone?: MilestoneDetailSheetProps["onStartSubmilestone"];
  onUpdate: (
    input: Omit<SubmilestoneUpdateInput, "milestoneKey">,
    optimistic: Partial<MilestoneSheetSubmilestone>
  ) => Promise<void>;
  onUploadEvidence?: MilestoneDetailSheetProps["onUploadEvidence"];
  pendingKey: string | null;
  readOnly: boolean;
  viewerCapacity?: BuildCollaborationRole;
  workosOrganizationId?: string;
}) {
  return (
    <div className="grid gap-3">
      <Button className="w-fit" onClick={onBack} size="sm" variant="ghost">
        <ArrowLeft /> Back to milestone
      </Button>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider">
            Submilestone
          </p>
          <h3 className="font-semibold text-xl">{item.name}</h3>
          <StatusBadge status={item.status} />
        </div>
        {!readOnly && onStartSubmilestone && item.status === "planned" ? (
          <Button
            data-testid={`submilestone-detail-start-work-${item.key}`}
            disabled={pendingKey === item.key}
            loading={pendingKey === item.key}
            onClick={() => {
              onStartSubmilestone(
                data.milestoneKey,
                item.key,
                "submilestone_detail"
              );
            }}
            size="sm"
            variant="outline"
          >
            <Play /> Start work
          </Button>
        ) : !readOnly && item.actualStartedAt && onAmendStart ? (
          <div className="flex flex-wrap gap-2">
            <Button
              onClick={() =>
                onAmendStart("correct", data.milestoneKey, item.key)
              }
              size="sm"
              variant="outline"
            >
              Correct start
            </Button>
            <Button
              onClick={() =>
                onAmendStart("retract", data.milestoneKey, item.key)
              }
              size="sm"
              variant="ghost"
            >
              Retract start
            </Button>
          </div>
        ) : null}
      </div>
      <Tabs
        onValueChange={(value) => onTabChange(value as DetailTab)}
        value={activeTab}
      >
        <TabsList className="w-full overflow-x-auto" variant="underline">
          <TabsTab value="overview">Overview</TabsTab>
          <TabsTab value="evidence">Evidence</TabsTab>
          <TabsTab value="people">People</TabsTab>
          <TabsTab value="materials">Materials</TabsTab>
          <TabsTab value="notes">Notes & history</TabsTab>
        </TabsList>
        <TabsPanel className="grid gap-3 pt-3" value="overview">
          <CanonicalWorkItemContext
            identity={canonicalIdentity}
            item={item}
            onDirtyChange={onDirtyChange}
            readOnly={readOnly}
            viewerCapacity={viewerCapacity}
            workosOrganizationId={workosOrganizationId}
          />
          <ExecutionSummary item={item} />
          <Frame>
            <FramePanel className="grid gap-3 p-3 sm:grid-cols-3">
              <Metric
                label="Planned"
                value={formatCentsExact(item.budgetCents)}
              />
              <Metric
                label={item.actualStartedAt ? "Actual start" : "Planned start"}
                value={
                  item.actualStartedAt
                    ? formatDate(item.actualStartedAt)
                    : formatShortDate(item.startDate)
                }
              />
              <Metric label="End" value={formatShortDate(item.endDate)} />
            </FramePanel>
          </Frame>
          <ActualCostEditor
            disabled={readOnly}
            item={item}
            onSave={(actualCostCents) =>
              onUpdate(
                { actualCostCents, submilestoneKey: item.key },
                { actualCostCents: actualCostCents ?? undefined }
              )
            }
          />
        </TabsPanel>
        <TabsPanel className="grid gap-3 pt-3" value="evidence">
          <EvidenceUploader
            data={data}
            disabled={readOnly}
            item={item}
            onUpload={readOnly ? undefined : onUploadEvidence}
          />
          <EvidenceList item={item} />
        </TabsPanel>
        <TabsPanel className="grid gap-3 pt-3" value="people">
          <ContractorDetail
            item={item}
            onAssign={
              readOnly
                ? undefined
                : () => onAssignContractor?.(data.milestoneKey, item.key)
            }
          />
        </TabsPanel>
        <TabsPanel className="grid gap-3 pt-3" value="materials">
          <MaterialsList item={item} />
        </TabsPanel>
        <TabsPanel className="grid gap-3 pt-3" value="notes">
          <FieldNoteEditor
            disabled={readOnly}
            item={item}
            onSave={(fieldNote) =>
              onUpdate(
                { fieldNote, submilestoneKey: item.key },
                { fieldNote: fieldNote ?? undefined }
              )
            }
            pending={pendingKey === item.key}
          />
          <SubmilestoneHistory item={item} />
          <RecentActivity events={data.recentEvents} />
        </TabsPanel>
      </Tabs>
    </div>
  );
}

function GuidedView({
  canonicalIdentity,
  data,
  item,
  onAssignContractor,
  onBackToLedger,
  onCompleteAndAdvance,
  onDirtyChange,
  onSelect,
  onStepChange,
  onStartSubmilestone,
  onUpdate,
  onUploadEvidence,
  pendingKey,
  rows,
  step,
  readOnly,
  viewerCapacity,
  workosOrganizationId,
}: {
  canonicalIdentity: CanonicalSubmilestoneIdentity;
  data: MilestoneSheetData;
  item: MilestoneSheetSubmilestone;
  onAssignContractor?: MilestoneDetailSheetProps["onAssignContractor"];
  onBackToLedger: () => void;
  onCompleteAndAdvance: () => Promise<void>;
  onDirtyChange?: (section: CanonicalDirtySection, dirty: boolean) => void;
  onSelect: (key: string) => void;
  onStepChange: (step: number) => void;
  onStartSubmilestone?: MilestoneDetailSheetProps["onStartSubmilestone"];
  onUpdate: (
    input: Omit<SubmilestoneUpdateInput, "milestoneKey">,
    optimistic: Partial<MilestoneSheetSubmilestone>
  ) => Promise<void>;
  onUploadEvidence?: MilestoneDetailSheetProps["onUploadEvidence"];
  pendingKey: string | null;
  rows: MilestoneSheetSubmilestone[];
  step: number;
  readOnly: boolean;
  viewerCapacity?: BuildCollaborationRole;
  workosOrganizationId?: string;
}) {
  const steps = ["Work item", "People", "Capture", "Cost", "Review"];
  return (
    <div className="grid gap-3 lg:grid-cols-[16rem_minmax(0,1fr)]">
      <Frame className="hidden lg:block">
        <FramePanel className="grid gap-1 p-2">
          <p className="px-2 py-1 text-[10px] text-muted-foreground uppercase tracking-wider">
            Work items
          </p>
          {rows.map((row) => (
            <Button
              className="h-auto justify-between text-left"
              key={row.key}
              onClick={() => onSelect(row.key)}
              variant={row.key === item.key ? "secondary" : "ghost"}
            >
              <span className="truncate">{row.name}</span>
              <WorkStateIcon status={row.status} />
            </Button>
          ))}
        </FramePanel>
      </Frame>
      <Frame>
        <FramePanel className="grid content-start gap-4 p-3 sm:p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">
                Current work item
              </p>
              <h3 className="font-semibold text-lg">{item.name}</h3>
              <p className="text-muted-foreground text-xs">
                {formatShortDate(item.startDate)}–
                {formatShortDate(item.endDate)} ·{" "}
                {formatCentsExact(item.budgetCents)} planned
              </p>
            </div>
            <div className="flex flex-wrap items-center justify-end gap-2">
              {!readOnly && onStartSubmilestone && item.status === "planned" ? (
                <Button
                  data-testid={`submilestone-guided-start-work-${item.key}`}
                  disabled={pendingKey === item.key}
                  loading={pendingKey === item.key}
                  onClick={() => {
                    onStartSubmilestone(
                      data.milestoneKey,
                      item.key,
                      "guided_field_workflow"
                    );
                  }}
                  size="sm"
                  variant="outline"
                >
                  <Play /> Start work
                </Button>
              ) : null}
              <select
                aria-label="Choose guided work item"
                className="h-9 rounded-lg border bg-background px-3 text-sm lg:hidden"
                onChange={(event) => onSelect(event.currentTarget.value)}
                value={item.key}
              >
                {rows.map((row) => (
                  <option key={row.key} value={row.key}>
                    {row.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <Progress value={((step + 1) / steps.length) * 100} />
          <div className="flex gap-1 overflow-x-auto pb-1">
            {steps.map((label, index) => (
              <Button
                className="min-w-fit flex-1"
                key={label}
                onClick={() => onStepChange(index)}
                size="xs"
                variant={index === step ? "default" : "outline"}
              >
                {index + 1}. {label}
              </Button>
            ))}
          </div>
          {step === 0 ? (
            <div className="grid gap-3">
              <StepHeading
                copy="Confirm the approved work item and plan before recording field work."
                title="Work item and plan"
              />
              <CanonicalWorkItemContext
                identity={canonicalIdentity}
                item={item}
                onDirtyChange={onDirtyChange}
                readOnly={readOnly}
                viewerCapacity={viewerCapacity}
                workosOrganizationId={workosOrganizationId}
              />
              <Frame>
                <FramePanel className="grid gap-3 p-3 sm:grid-cols-3">
                  <Metric
                    label="Planned"
                    value={formatCentsExact(item.budgetCents)}
                  />
                  <Metric
                    label={
                      item.actualStartedAt ? "Actual start" : "Planned start"
                    }
                    value={
                      item.actualStartedAt
                        ? formatDate(item.actualStartedAt)
                        : formatShortDate(item.startDate)
                    }
                  />
                  <Metric label="End" value={formatShortDate(item.endDate)} />
                </FramePanel>
              </Frame>
              <ExecutionSummary item={item} />
              <MaterialSummary item={item} />
            </div>
          ) : null}
          {step === 1 ? (
            <ContractorDetail
              item={item}
              onAssign={() => onAssignContractor?.(data.milestoneKey, item.key)}
            />
          ) : null}
          {step === 2 ? (
            <div className="grid gap-3">
              <StepHeading
                copy="Attach photos or files. Failed location verification keeps the evidence and flags it for review."
                title="Capture evidence"
              />
              <EvidenceUploader
                data={data}
                disabled={readOnly}
                item={item}
                onUpload={readOnly ? undefined : onUploadEvidence}
              />
              <EvidenceList item={item} />
              <FieldNoteEditor
                disabled={readOnly}
                item={item}
                onSave={(fieldNote) =>
                  onUpdate(
                    { fieldNote, submilestoneKey: item.key },
                    { fieldNote: fieldNote ?? undefined }
                  )
                }
                pending={pendingKey === item.key}
              />
            </div>
          ) : null}
          {step === 3 ? (
            <div className="grid gap-3">
              <StepHeading
                copy="Record the realized cost if known. Empty remains distinct from zero."
                title="Actual realized cost"
              />
              <ActualCostEditor
                disabled={readOnly}
                item={item}
                onSave={(actualCostCents) =>
                  onUpdate(
                    { actualCostCents, submilestoneKey: item.key },
                    { actualCostCents: actualCostCents ?? undefined }
                  )
                }
              />
            </div>
          ) : null}
          {step === 4 ? (
            <div className="grid gap-3">
              <StepHeading
                copy="Review what will be recorded, then explicitly complete this work item."
                title="Review completion"
              />
              <Frame>
                <FramePanel className="grid gap-2 p-3 text-sm sm:grid-cols-2">
                  <ReviewLine
                    label="Contractor"
                    value={item.assignments[0]?.name ?? "Unassigned"}
                  />
                  <ReviewLine
                    label="Evidence"
                    value={`${item.evidence.length} attached`}
                  />
                  <ReviewLine
                    label="Actual cost"
                    value={
                      item.actualCostCents === undefined
                        ? "Not reported"
                        : formatCentsExact(item.actualCostCents)
                    }
                  />
                  <ReviewLine
                    label="Field note"
                    value={item.fieldNote?.trim() ? "Recorded" : "Not recorded"}
                  />
                </FramePanel>
              </Frame>
            </div>
          ) : null}
          <div className="flex items-center justify-between gap-2 border-t pt-4">
            <Button
              onClick={() => {
                if (step === 0) {
                  onBackToLedger();
                } else {
                  onStepChange(step - 1);
                }
              }}
              variant="outline"
            >
              <ArrowLeft /> {step === 0 ? "Back to ledger" : "Back"}
            </Button>
            {step < steps.length - 1 ? (
              <Button onClick={() => onStepChange(step + 1)}>
                Continue <ChevronRight />
              </Button>
            ) : (
              <Button
                disabled={
                  readOnly || pendingKey === item.key || !onUpdate
                }
                loading={pendingKey === item.key}
                onClick={() => {
                  onCompleteAndAdvance().catch(ignoreHandledMutationError);
                }}
              >
                <Check /> Mark complete & next
              </Button>
            )}
          </div>
        </FramePanel>
      </Frame>
    </div>
  );
}

function ContractorSummary({
  item,
  onAssign,
  onOpen,
}: {
  item: MilestoneSheetSubmilestone;
  onAssign?: () => void;
  onOpen?: () => void;
}) {
  const assignment = item.assignments[0];
  return (
    <div className="grid gap-1.5">
      <span className="text-[10px] text-muted-foreground uppercase tracking-wider">
        Contractor
      </span>
      {assignment ? (
        <Button
          className="justify-start"
          onClick={onOpen}
          size="sm"
          variant="outline"
        >
          <span className="grid size-6 place-items-center rounded-full bg-primary/15 text-[10px]">
            {initialsFor(assignment.name)}
          </span>
          <span className="truncate">{assignment.name}</span>
        </Button>
      ) : (
        <Button
          className="justify-start"
          disabled={!onAssign}
          onClick={onAssign}
          size="sm"
          variant="outline"
        >
          <UserPlus /> Assign contractor
        </Button>
      )}
    </div>
  );
}

function ContractorDetail({
  item,
  onAssign,
}: {
  item: MilestoneSheetSubmilestone;
  onAssign?: () => void;
}) {
  return (
    <div className="grid gap-3">
      <div className="flex items-center justify-between gap-3">
        <StepHeading
          copy="Every contractor assignment scoped to this work item."
          title="Assigned contractors"
        />
        <Button
          disabled={!onAssign}
          onClick={onAssign}
          size="sm"
          variant="outline"
        >
          <UserPlus /> Assign
        </Button>
      </div>
      {item.assignments.length > 0 ? (
        item.assignments.map((assignment) => (
          <Card
            className="rounded-xl shadow-none"
            key={`${assignment.contractorId}-${assignment.role}`}
          >
            <CardHeader className="p-3">
              <CardTitle className="text-sm">{assignment.name}</CardTitle>
              <CardDescription>
                {assignment.role} · {assignment.status}
              </CardDescription>
            </CardHeader>
            <CardPanel className="grid gap-2 p-3 pt-0 text-xs sm:grid-cols-2">
              <ReviewLine
                label="Agreed rate"
                value={
                  assignment.agreedRateCents === undefined
                    ? "—"
                    : `${formatCentsExact(assignment.agreedRateCents)} / ${assignment.agreedRateUnit ?? "hour"}`
                }
              />
              <ReviewLine
                label="Estimated"
                value={moneyOrDash(assignment.estimatedCostCents)}
              />
              <ReviewLine
                label="Actual"
                value={moneyOrDash(assignment.actualCostCents)}
              />
              <ReviewLine
                label="Estimated hours"
                value={numberOrDash(assignment.estimatedHours)}
              />
              <ReviewLine
                label="Actual hours"
                value={numberOrDash(assignment.actualHours)}
              />
              {assignment.costNotes ? (
                <p className="text-muted-foreground sm:col-span-2">
                  {assignment.costNotes}
                </p>
              ) : null}
            </CardPanel>
          </Card>
        ))
      ) : (
        <Frame>
          <FramePanel className="p-4 text-center text-muted-foreground text-sm">
            No contractor assigned to this submilestone.
          </FramePanel>
        </Frame>
      )}
    </div>
  );
}

function MaterialSummary({
  item,
  onOpen,
}: {
  item: MilestoneSheetSubmilestone;
  onOpen?: () => void;
}) {
  return (
    <div className="grid gap-1.5">
      <span className="text-[10px] text-muted-foreground uppercase tracking-wider">
        Materials
      </span>
      <Button
        className="justify-start"
        onClick={onOpen}
        size="sm"
        variant="outline"
      >
        <Package />
        {item.materials.length > 0
          ? `${item.materials.length} attached`
          : "No materials attached"}
      </Button>
    </div>
  );
}

function MaterialsList({ item }: { item: MilestoneSheetSubmilestone }) {
  if (item.materials.length === 0) {
    return (
      <Frame>
        <FramePanel className="p-4 text-center text-muted-foreground text-sm">
          No materials or equipment are attached to this submilestone.
        </FramePanel>
      </Frame>
    );
  }
  return (
    <div className="grid gap-2">
      {item.materials.map((material) => (
        <Card className="rounded-xl shadow-none" key={material.id}>
          <CardHeader className="p-3">
            <CardTitle className="text-sm">{material.title}</CardTitle>
            <CardDescription>
              {material.supplier ?? "Supplier not recorded"} · Qty{" "}
              {material.quantity}
            </CardDescription>
            <CardAction>
              <Badge variant="outline">{material.type}</Badge>
            </CardAction>
          </CardHeader>
          <CardPanel className="flex items-start justify-between gap-3 p-3 pt-0 text-xs">
            <p className="text-muted-foreground">
              {material.description ?? "No description recorded."}
            </p>
            <p className="shrink-0 font-medium tabular-nums">
              {formatCentsExact(material.totalCents)}
            </p>
          </CardPanel>
        </Card>
      ))}
    </div>
  );
}

function SubmilestoneHistory({ item }: { item: MilestoneSheetSubmilestone }) {
  return (
    <div className="grid gap-2">
      <h4 className="font-medium text-sm">Execution history</h4>
      {item.completedAt ? (
        <Frame>
          <FramePanel className="p-3 text-sm">
            <p className="font-medium">Submilestone completed</p>
            <p className="text-muted-foreground text-xs">
              {formatDate(item.completedAt)}
              {item.completedByWorkosUserId
                ? ` · ${item.completedByWorkosUserId}`
                : ""}
            </p>
          </FramePanel>
        </Frame>
      ) : null}
      {item.siteVisits.map((visit) => (
        <Card className="rounded-xl shadow-none" key={visit.visitId}>
          <CardHeader className="p-3">
            <CardTitle className="text-sm">Site visit</CardTitle>
            <CardDescription>
              {formatDate(visit.completedAt ?? visit.requestedAt)} ·{" "}
              {visit.status}
            </CardDescription>
          </CardHeader>
          <CardPanel className="grid gap-2 p-3 pt-0 text-sm">
            {visit.note ? <p>{visit.note}</p> : null}
            {visit.recordNote ? (
              visit.recordNoteFormat === "html" ? (
                <FieldRichTextPreview
                  ariaLabel="Submilestone site visit report"
                  value={visit.recordNote}
                />
              ) : (
                <p>{visit.recordNote}</p>
              )
            ) : null}
          </CardPanel>
        </Card>
      ))}
      {!item.completedAt && item.siteVisits.length === 0 ? (
        <Frame>
          <FramePanel className="p-3 text-muted-foreground text-sm">
            No completion or scoped site-visit history yet.
          </FramePanel>
        </Frame>
      ) : null}
    </div>
  );
}

export interface EvidenceUploaderUploadInput {
  file: File;
  locationVerified: boolean;
  milestoneKey: string;
  submilestoneKey: string;
}

export function EvidenceUploader({
  compact = false,
  data,
  disabled = false,
  item,
  onUpload,
}: {
  compact?: boolean;
  data: Pick<MilestoneSheetData, "milestoneKey">;
  disabled?: boolean;
  item: Pick<MilestoneSheetSubmilestone, "evidence" | "key">;
  onUpload?: (input: EvidenceUploaderUploadInput) => Promise<unknown> | unknown;
}) {
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const id = `milestone-evidence-${item.key}-${compact ? "compact" : "detail"}`;
  const hasCanonicalKeys = Boolean(data.milestoneKey.trim() && item.key.trim());
  const canUpload = Boolean(!disabled && onUpload && hasCanonicalKeys);
  return (
    <div className={cn(!compact && "grid gap-2 text-center")}>
      {compact ? null : (
        <Frame>
          <FramePanel className="grid gap-2 p-4">
            <FileImage className="mx-auto size-7 text-muted-foreground" />
            <p className="font-medium text-sm">Attach completion evidence</p>
            <p className="text-muted-foreground text-xs">
              If location cannot be verified, the file is retained and flagged
              for lender review.
            </p>
          </FramePanel>
        </Frame>
      )}
      <label
        className={cn(
          buttonVariants({ size: "sm", variant: "outline" }),
          (!canUpload || uploading) && "pointer-events-none opacity-60"
        )}
        htmlFor={id}
      >
        <Paperclip />{" "}
        {uploading
          ? "Uploading…"
          : compact
            ? `Evidence ${item.evidence.length}`
            : "Choose file"}
        <input
          className="sr-only"
          disabled={!canUpload || uploading}
          id={id}
          onChange={async (event) => {
            const file = event.currentTarget.files?.[0];
            event.currentTarget.value = "";
            if (!(file && canUpload && onUpload)) {
              return;
            }
            setUploading(true);
            setUploadError(null);
            try {
              await onUpload({
                file,
                locationVerified: false,
                milestoneKey: data.milestoneKey,
                submilestoneKey: item.key,
              });
            } catch (error) {
              setUploadError(errorMessageFor(error));
            } finally {
              setUploading(false);
            }
          }}
          type="file"
        />
      </label>
      {uploadError ? (
        <p className="text-destructive text-xs" role="alert">
          {uploadError}
        </p>
      ) : null}
    </div>
  );
}

function EvidenceList({ item }: { item: MilestoneSheetSubmilestone }) {
  if (item.evidence.length === 0) {
    return (
      <Frame>
        <FramePanel className="p-4 text-center text-muted-foreground text-sm">
          No evidence attached yet.
        </FramePanel>
      </Frame>
    );
  }
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {item.evidence.map((asset) => (
        <Card className="rounded-xl shadow-none" key={asset.evidenceKey}>
          <CardHeader className="p-3">
            <CardTitle className="truncate text-sm">
              {asset.label || asset.fileName}
            </CardTitle>
            <CardDescription>
              {asset.source ?? "Builder upload"}
              {asset.createdAt ? ` · ${formatDate(asset.createdAt)}` : ""}
            </CardDescription>
            <CardAction>
              <Badge variant={asset.locationVerified ? "success" : "warning"}>
                {asset.locationVerified
                  ? "Location verified"
                  : "Location unverified"}
              </Badge>
            </CardAction>
          </CardHeader>
          <CardPanel className="p-3 pt-0 text-xs">
            <p className="truncate text-muted-foreground">
              {asset.fileName} · {formatBytes(asset.sizeBytes)}
            </p>
            {asset.previewUrl ? (
              <a
                className="mt-2 inline-flex text-primary underline underline-offset-4"
                href={asset.previewUrl}
                rel="noreferrer"
                target="_blank"
              >
                Open evidence
              </a>
            ) : null}
          </CardPanel>
        </Card>
      ))}
    </div>
  );
}

function ActualCostEditor({
  disabled = false,
  item,
  onSave,
}: {
  disabled?: boolean;
  item: MilestoneSheetSubmilestone;
  onSave: (actualCostCents: number | null) => Promise<void>;
}) {
  const [draft, setDraft] = useState(
    item.actualCostCents === undefined ? "" : String(item.actualCostCents / 100)
  );
  // biome-ignore lint/correctness/useExhaustiveDependencies: Item identity must reset an unsaved draft even when two items have the same stored cost.
  useEffect(
    () =>
      setDraft(
        item.actualCostCents === undefined
          ? ""
          : String(item.actualCostCents / 100)
      ),
    [item.actualCostCents, item.key]
  );
  return (
    <label className="grid gap-1.5 text-xs" htmlFor={`actual-cost-${item.key}`}>
      <span className="text-[10px] text-muted-foreground uppercase tracking-wider">
        Actual realized cost · optional
      </span>
      <div className="relative">
        <span className="absolute top-1/2 left-3 -translate-y-1/2 text-muted-foreground">
          $
        </span>
        <Input
          className="pl-7 tabular-nums"
          disabled={disabled}
          id={`actual-cost-${item.key}`}
          inputMode="decimal"
          onBlur={() => {
            if (!disabled) {
              onSave(parseMoneyCents(draft)).catch(ignoreHandledMutationError);
            }
          }}
          onChange={(event) => {
            if (!disabled) {
              setDraft(event.currentTarget.value);
            }
          }}
          placeholder="Not reported"
          value={draft}
        />
      </div>
    </label>
  );
}

function FieldNoteEditor({
  disabled = false,
  item,
  onSave,
  pending,
}: {
  disabled?: boolean;
  item: MilestoneSheetSubmilestone;
  onSave: (fieldNote: string | null) => Promise<void>;
  pending: boolean;
}) {
  const [draft, setDraft] = useState(item.fieldNote ?? "");
  // biome-ignore lint/correctness/useExhaustiveDependencies: Item identity must reset an unsaved draft even when two items have the same stored note.
  useEffect(() => setDraft(item.fieldNote ?? ""), [item.fieldNote, item.key]);
  return (
    <div className="grid gap-2">
      <label
        className="grid gap-2 font-medium text-sm"
        htmlFor={`field-note-${item.key}`}
      >
        Field note
        <Textarea
          disabled={disabled}
          id={`field-note-${item.key}`}
          onChange={(event) => {
            if (!disabled) {
              setDraft(event.currentTarget.value);
            }
          }}
          placeholder="What was completed, observed, or blocked?"
          value={draft}
        />
      </label>
      <Button
        className="w-fit"
        disabled={disabled || pending}
        loading={pending}
        onClick={() => {
          if (!disabled) {
            onSave(draft.trim() || null).catch(ignoreHandledMutationError);
          }
        }}
        size="sm"
        variant="outline"
      >
        Save field note
      </Button>
    </div>
  );
}

function RecentActivity({
  events,
}: {
  events: MilestoneSheetData["recentEvents"];
}) {
  return (
    <Frame>
      <FramePanel className="grid gap-2 p-3">
        <p className="font-medium text-sm">Recent milestone activity</p>
        {events.length > 0 ? (
          events.map((event) => (
            <div
              className="border-t pt-2 text-xs first:border-t-0 first:pt-0"
              key={event._id}
            >
              <p>{event.title}</p>
              <p className="text-muted-foreground">
                {event.actor} · {formatRelative(event.createdAt)}
              </p>
            </div>
          ))
        ) : (
          <p className="text-muted-foreground text-xs">No recent activity.</p>
        )}
      </FramePanel>
    </Frame>
  );
}

function LegacyReviewActions({
  data,
  note,
  onApprove,
  onAssignVisit,
  onReject,
  onRequestInfo,
}: {
  data: MilestoneSheetData;
  note: string;
  onApprove?: MilestoneDetailSheetProps["onApprove"];
  onAssignVisit?: MilestoneDetailSheetProps["onAssignVisit"];
  onReject?: MilestoneDetailSheetProps["onReject"];
  onRequestInfo?: MilestoneDetailSheetProps["onRequestInfo"];
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {onApprove ? (
        <Button
          onClick={() => onApprove(data.milestoneKey, note)}
          size="sm"
          variant="outline"
        >
          Approve
        </Button>
      ) : null}
      {onRequestInfo ? (
        <Button
          onClick={() => onRequestInfo(data.milestoneKey, note)}
          size="sm"
          variant="outline"
        >
          Request info
        </Button>
      ) : null}
      {onAssignVisit ? (
        <Button
          onClick={() => onAssignVisit(data.milestoneKey)}
          size="sm"
          variant="outline"
        >
          Assign visit
        </Button>
      ) : null}
      {onReject ? (
        <Button
          onClick={() => onReject(data.milestoneKey)}
          size="sm"
          variant="destructive"
        >
          Reject
        </Button>
      ) : null}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="text-[10px] text-muted-foreground uppercase tracking-wider">
        {label}
      </p>
      <p className="truncate font-medium text-sm tabular-nums">{value}</p>
    </div>
  );
}
function ReviewLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b pb-2 last:border-0 last:pb-0">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}
function StepHeading({ copy, title }: { copy: string; title: string }) {
  return (
    <div>
      <p className="font-semibold">{title}</p>
      <p className="mt-1 text-muted-foreground text-sm">{copy}</p>
    </div>
  );
}

function WorkStateIcon({ status }: { status: WorkState }) {
  if (status === "complete") {
    return <CheckCircle2 className="size-4 text-emerald-600" />;
  }
  if (status === "in_progress") {
    return <Circle className="size-4 fill-amber-400/30 text-amber-600" />;
  }
  return <Circle className="size-4 text-muted-foreground" />;
}

function StatusBadge({ status }: { status: WorkState }) {
  return (
    <Badge
      variant={
        status === "complete"
          ? "success"
          : status === "in_progress"
            ? "warning"
            : "secondary"
      }
    >
      {status === "complete"
        ? "Complete"
        : status === "in_progress"
          ? "In progress"
          : "Not started"}
    </Badge>
  );
}

function formatShortDate(value?: string) {
  return value
    ? new Intl.DateTimeFormat("en-CA", {
        day: "numeric",
        month: "short",
      }).format(new Date(`${value.slice(0, 10)}T12:00:00`))
    : "—";
}
function parseMoneyCents(value: string) {
  if (!value.trim()) {
    return null;
  }
  const dollars = Number(value.replace(/[^0-9.]/g, ""));
  return Number.isFinite(dollars)
    ? Math.max(0, Math.round(dollars * 100))
    : null;
}
function moneyOrDash(value?: number) {
  return typeof value === "number" ? formatCentsExact(value) : "—";
}
function numberOrDash(value?: number) {
  return typeof value === "number" ? String(value) : "—";
}
function formatBytes(bytes: number) {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${Math.round(bytes / 1024)} KB`;
  }
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
function errorMessageFor(error: unknown) {
  return error instanceof Error
    ? error.message
    : "Unable to save milestone execution changes.";
}

function ignoreHandledMutationError() {
  // The owning sheet already renders the mutation error in its alert region.
}
