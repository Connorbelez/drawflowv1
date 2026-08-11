"use client";

import {
  CheckCircle2,
  ChevronRight,
  ClipboardCheck,
  ListChecks,
  MapPinOff,
  Package,
  Paperclip,
  Play,
  UserPlus,
} from "lucide-react";
import { useMemo, useState } from "react";

import { Badge } from "#/components/ui/badge.tsx";
import { Button } from "#/components/ui/button.tsx";
import {
  Card,
  CardAction,
  CardDescription,
  CardHeader,
  CardPanel,
  CardTitle,
} from "#/components/ui/card.tsx";
import { Frame, FramePanel } from "#/components/ui/frame.tsx";
import {
  Sheet,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetPanel,
  SheetPopup,
  SheetTitle,
} from "#/components/ui/sheet.tsx";
import { Textarea } from "#/components/ui/textarea.tsx";
import type { Id } from "../../../convex/_generated/dataModel";
import type { BuildSubmilestoneDetailTab } from "../build-detail-targets/buildDetailTab.ts";
import type { BuildDetailTarget } from "../build-detail-targets/buildDetailTarget.ts";
import type { BuildDetailTargetContext } from "../build-detail-targets/useBuildDetailTargetController.ts";
import { formatDate, formatRelative } from "./format";

type WorkState = "planned" | "in_progress" | "complete";

export interface MilestoneSheetSubmilestone {
  actualCostCents?: number;
  actualStartedAt?: number;
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
  description: string;
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
  key: string;
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
  submilestoneId?: Id<"buildSubmilestones">;
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
  status?: WorkState;
  submilestones?: MilestoneSheetSubmilestone[];
  submittedAt?: number;
}

/**
 * Parent Milestone aggregate/detail surface.
 *
 * Child scope is intentionally represented as read-only ledger rows. Every
 * child interaction dispatches to the route-owned canonical
 * SubmilestoneDetailSheet; this component has no child mutation adapter or
 * nested detail/guided view.
 */
export interface MilestoneDetailSheetProps {
  assignmentsSourceLabel?: string;
  data: MilestoneSheetData | null;
  errorMessage?: string;
  eventsSourceLabel?: string;
  focusedSubmilestoneId?: string;
  focusedSubmilestoneKey?: string;
  onAmendStart?: (
    action: "correct" | "retract",
    milestoneKey: string,
    submilestoneKey?: string
  ) => void;
  onApprove?: (milestoneKey: string, note?: string) => Promise<void> | void;
  onAssignVisit?: (milestoneKey: string) => void;
  onClose: () => void;
  onOpenCanonicalTarget?: (
    target: BuildDetailTarget,
    context?: BuildDetailTargetContext
  ) => void;
  onReject?: (milestoneKey: string) => void;
  onRequestInfo?: (milestoneKey: string, note: string) => void;
  onStartWork?: (milestoneKey: string, note?: string) => Promise<void> | void;
  onSubmitCompletion?: (input: {
    actualCostCents?: number;
    actualStartedAt?: number;
    completedDay: number;
    dependencyOverrideReason?: string;
    idempotencyKey: string;
    milestoneKey: string;
    note?: string;
  }) => Promise<unknown> | unknown;
  pending?: boolean;
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: The parent surface coordinates canonical routing, milestone completion, and lender decisions in one sheet.
export function MilestoneDetailSheet({
  assignmentsSourceLabel,
  data,
  errorMessage,
  eventsSourceLabel,
  focusedSubmilestoneId,
  onApprove,
  onAmendStart,
  onAssignVisit,
  onClose,
  onOpenCanonicalTarget,
  onReject,
  onRequestInfo,
  onStartWork,
  onSubmitCompletion,
  pending: externalPending,
}: MilestoneDetailSheetProps) {
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const [milestoneNote, setMilestoneNote] = useState("");

  const rows = useMemo(() => data?.submilestones ?? [], [data?.submilestones]);
  const incomplete = rows.filter((row) => row.status !== "complete");
  const completedCount = rows.length - incomplete.length;
  const eligible = rows.length === 0 || incomplete.length === 0;

  if (!data) {
    return null;
  }

  const openCanonicalForRow = (
    row: MilestoneSheetSubmilestone | undefined,
    selectedTab: BuildSubmilestoneDetailTab
  ) => {
    if (!(row?.submilestoneId && onOpenCanonicalTarget)) {
      setLocalError(
        "This Sub-milestone is not available in the canonical detail surface. Refresh the Build and try again."
      );
      return false;
    }
    onOpenCanonicalTarget(
      { kind: "submilestone", submilestoneId: row.submilestoneId },
      { selectedTab }
    );
    return true;
  };

  const submitCompletion = async () => {
    if (!(eligible && onSubmitCompletion) || data.submittedAt) {
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

  const openRemainingScope = () => {
    const firstIncomplete = incomplete[0];
    if (firstIncomplete) {
      openCanonicalForRow(firstIncomplete, "review");
      return;
    }
    setLocalError(
      "No canonical Sub-milestone is available for the remaining scope."
    );
  };

  return (
    <Sheet onOpenChange={(open) => !open && onClose()} open>
      <SheetPopup
        className="w-full sm:max-w-[720px]"
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
              Milestone execution
            </p>
            <SheetTitle className="mt-1">{data.name}</SheetTitle>
            <SheetDescription className="mt-1">
              {data.column} · Linked draw {data.drawGroupKey.toUpperCase()}
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
                    : "Claim submitted · scope incomplete"}
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
          <Frame>
            <FramePanel className="space-y-4 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="font-semibold text-base">
                    Sub-milestone scope
                  </h2>
                  <p className="text-muted-foreground text-sm">
                    Child execution, evidence, assignments, materials, and
                    review are owned by the unified detail surface.
                  </p>
                </div>
                <Badge variant="outline">
                  {rows.length} item{rows.length === 1 ? "" : "s"}
                </Badge>
              </div>
              {rows.length === 0 ? (
                <p className="text-muted-foreground text-sm">
                  No child scope has been configured.
                </p>
              ) : (
                <div className="grid gap-3">
                  {rows.map((row) => (
                    <ParentScopeRow
                      key={row.key}
                      onOpen={(tab) => openCanonicalForRow(row, tab)}
                      row={row}
                    />
                  ))}
                </div>
              )}
            </FramePanel>
          </Frame>

          {localError || errorMessage ? (
            <Frame>
              <FramePanel className="p-3 text-destructive text-sm" role="alert">
                {localError ?? errorMessage}
              </FramePanel>
            </Frame>
          ) : null}

          {data.recentEvents.length > 0 ? (
            <RecentActivity events={data.recentEvents} />
          ) : null}
        </SheetPanel>

        <SheetFooter className="z-20 items-stretch gap-3 bg-background/95 px-4 pb-[calc(1rem+env(safe-area-inset-bottom))] backdrop-blur sm:flex-row sm:items-center sm:px-6">
          <div className="min-w-0 flex-1 text-left">
            <p className="font-medium text-sm">
              {eligible
                ? data.submittedAt
                  ? "Completion submitted"
                  : "All submilestones are complete"
                : `${incomplete.length} submilestone${incomplete.length === 1 ? "" : "s"} still incomplete`}
            </p>
            <p className="truncate text-muted-foreground text-xs">
              {eligible
                ? data.submittedAt
                  ? `Submitted ${formatDate(data.submittedAt)} for lender review.`
                  : "Ready to submit the builder completion claim."
                : "Open the first incomplete Sub-milestone to continue its canonical review."}
            </p>
          </div>
          {data.canStartWork && onStartWork ? (
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
          {data.actualStartedAt && onAmendStart ? (
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
            data-testid="milestone-primary-completion-action"
            disabled={Boolean(
              (eligible && data.submittedAt) || externalPending || pendingKey
            )}
            loading={pendingKey === "milestone-submit"}
            onClick={eligible ? submitCompletion : openRemainingScope}
          >
            {eligible ? <ClipboardCheck /> : <ListChecks />}
            {eligible
              ? data.submittedAt
                ? "Completion submitted"
                : "Submit milestone completion"
              : "Complete remaining scope"}
          </Button>
          {onApprove || onRequestInfo || onAssignVisit || onReject ? (
            <LegacyReviewActions
              data={data}
              note={milestoneNote}
              onApprove={onApprove}
              onAssignVisit={onAssignVisit}
              onNoteChange={setMilestoneNote}
              onReject={onReject}
              onRequestInfo={onRequestInfo}
            />
          ) : null}
        </SheetFooter>
      </SheetPopup>
    </Sheet>
  );
}

function ParentScopeRow({
  onOpen,
  row,
}: {
  onOpen: (tab: BuildSubmilestoneDetailTab) => boolean;
  row: MilestoneSheetSubmilestone;
}) {
  const hasCanonicalTarget = Boolean(row.submilestoneId);
  const openButton = (label: string, tab: BuildSubmilestoneDetailTab) => (
    <Button
      disabled={!hasCanonicalTarget}
      onClick={() => onOpen(tab)}
      size="xs"
      type="button"
      variant="ghost"
    >
      {label}
    </Button>
  );
  return (
    <Card data-testid={`milestone-scope-row-${row.key}`}>
      <CardHeader className="gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <CardTitle className="truncate text-sm">{row.name}</CardTitle>
          <CardDescription className="line-clamp-2">
            {row.description || "No scope description."}
          </CardDescription>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-muted-foreground text-xs">
            <StatusBadge status={row.status} />
            <span>
              {row.startDate} → {row.endDate}
            </span>
            <span>{formatCents(row.budgetCents)} budget</span>
          </div>
        </div>
        <CardAction>
          <Button
            disabled={!hasCanonicalTarget}
            onClick={() => onOpen("overview")}
            size="sm"
            type="button"
            variant="outline"
          >
            Open Sub-milestone <ChevronRight />
          </Button>
        </CardAction>
      </CardHeader>
      <CardPanel className="space-y-3 pt-0">
        <div className="flex flex-wrap gap-1">
          {openButton("People", "people")}
          {openButton("Materials", "materials")}
          {openButton("Evidence", "evidence")}
          {openButton("Collaboration", "collaboration")}
          {openButton("Review", "review")}
        </div>
        <div className="grid gap-2 text-xs sm:grid-cols-3">
          <Metric label="Contractors" value={String(row.assignments.length)} />
          <Metric label="Materials" value={String(row.materials.length)} />
          <Metric label="Evidence" value={String(row.evidence.length)} />
        </div>
        {row.evidence.some((evidence) => !evidence.locationVerified) ? (
          <button
            className="flex w-full items-center gap-2 rounded-md border border-warning/30 bg-warning/8 px-3 py-2 text-left text-warning-foreground text-xs"
            disabled={!hasCanonicalTarget}
            onClick={() => onOpen("evidence")}
            type="button"
          >
            <MapPinOff className="size-4 shrink-0" />
            Location-unverified evidence requires review.
          </button>
        ) : null}
        <div className="flex flex-wrap items-center gap-2 text-muted-foreground text-xs">
          {row.assignments.length > 0 ? (
            <>
              <UserPlus className="size-3.5" /> Assignment data is in People.
            </>
          ) : null}
          {row.materials.length > 0 ? (
            <>
              <Package className="size-3.5" /> Material data is in Materials.
            </>
          ) : null}
          {row.evidence.length > 0 ? (
            <>
              <Paperclip className="size-3.5" /> Evidence data is in Evidence.
            </>
          ) : null}
        </div>
      </CardPanel>
    </Card>
  );
}

function RecentActivity({
  events,
}: {
  events: MilestoneSheetData["recentEvents"];
}) {
  return (
    <Frame>
      <FramePanel className="space-y-3 p-4">
        <div>
          <h2 className="font-semibold text-sm">Recent activity</h2>
          <p className="text-muted-foreground text-xs">
            Parent milestone activity remains visible without creating a second
            child detail surface.
          </p>
        </div>
        <ol className="grid gap-2">
          {events.map((event) => (
            <li
              className="flex items-start justify-between gap-3 text-xs"
              key={event._id}
            >
              <span>
                <span className="font-medium">{event.title}</span>
                <span className="block text-muted-foreground">
                  {event.actor}
                </span>
              </span>
              <span className="shrink-0 text-muted-foreground">
                {formatRelative(event.createdAt)}
              </span>
            </li>
          ))}
        </ol>
      </FramePanel>
    </Frame>
  );
}

function LegacyReviewActions({
  data,
  note,
  onApprove,
  onAssignVisit,
  onNoteChange,
  onReject,
  onRequestInfo,
}: {
  data: MilestoneSheetData;
  note: string;
  onApprove?: MilestoneDetailSheetProps["onApprove"];
  onAssignVisit?: MilestoneDetailSheetProps["onAssignVisit"];
  onNoteChange: (value: string) => void;
  onReject?: MilestoneDetailSheetProps["onReject"];
  onRequestInfo?: MilestoneDetailSheetProps["onRequestInfo"];
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {onApprove || onRequestInfo ? (
        <Textarea
          aria-label="Milestone decision note"
          className="min-w-56"
          onChange={(event) => onNoteChange(event.target.value)}
          placeholder="Add a decision note"
          value={note}
        />
      ) : null}
      {onAssignVisit ? (
        <Button
          onClick={() => onAssignVisit(data.milestoneKey)}
          size="sm"
          variant="outline"
        >
          Assign Site Visit
        </Button>
      ) : null}
      {onRequestInfo ? (
        <Button
          onClick={() => onRequestInfo(data.milestoneKey, note.trim())}
          size="sm"
          variant="warning"
        >
          Request changes
        </Button>
      ) : null}
      {onReject ? (
        <Button
          onClick={() => onReject(data.milestoneKey)}
          size="sm"
          variant="ghost"
        >
          Reject milestone
        </Button>
      ) : null}
      {onApprove ? (
        <Button
          onClick={() => onApprove(data.milestoneKey, note.trim() || undefined)}
          size="sm"
        >
          Approve milestone
        </Button>
      ) : null}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border bg-muted/20 px-2.5 py-2">
      <p className="text-[10px] text-muted-foreground uppercase tracking-wide">
        {label}
      </p>
      <p className="font-medium">{value}</p>
    </div>
  );
}

function StatusBadge({ status }: { status: WorkState }) {
  return (
    <Badge
      variant={
        status === "complete"
          ? "success"
          : status === "in_progress"
            ? "warning"
            : "outline"
      }
    >
      {status === "in_progress"
        ? "In progress"
        : status === "complete"
          ? "Complete"
          : "Planned"}
    </Badge>
  );
}

function formatCents(value: number) {
  return new Intl.NumberFormat(undefined, {
    currency: "CAD",
    maximumFractionDigits: 0,
    style: "currency",
  }).format(value / 100);
}

function errorMessageFor(error: unknown) {
  return error instanceof Error
    ? error.message
    : "Unable to complete this milestone action.";
}
