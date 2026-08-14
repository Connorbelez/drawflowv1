"use client";

import {
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  CircleX,
  ClipboardCheck,
  Ellipsis,
  Eye,
  Link2,
  ListChecks,
  MapPinOff,
  MessageCircle,
  Paperclip,
  Play,
} from "lucide-react";
import { type ReactNode, useEffect, useMemo, useState } from "react";

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
import {
  Collapsible,
  CollapsiblePanel,
  CollapsibleTrigger,
} from "#/components/ui/collapsible.tsx";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "#/components/ui/dropdown-menu.tsx";
import { Frame, FramePanel } from "#/components/ui/frame.tsx";
import { Separator } from "#/components/ui/separator.tsx";
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
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "#/components/ui/tooltip.tsx";
import type { Id } from "../../../convex/_generated/dataModel";
import {
  copySiteVisitLink,
  SiteVisitDetailSheet,
} from "../backoffice-site-visits/SiteVisitDetailPanel.tsx";
import {
  operationalStatusBadgeVariant,
  operationalStatusLabel,
} from "../backoffice-site-visits/site-visit-format.ts";
import type {
  BrokerageSiteVisitRow,
  BrokerageSiteVisitsResult,
} from "../backoffice-site-visits/site-visit-types.ts";
import type { BuildSubmilestoneDetailTab } from "../build-detail-targets/buildDetailTab.ts";
import type { BuildDetailTarget } from "../build-detail-targets/buildDetailTarget.ts";
import type { BuildDetailTargetContext } from "../build-detail-targets/useBuildDetailTargetController.ts";
import { EvidenceAssetCard } from "../build-submilestone-detail/SubmilestoneDetailCanonical.tsx";
import {
  CostDocumentFileList,
  DocumentedCostCoverage,
} from "../cost-documents/SubmilestoneCostDocuments.tsx";
import { formatDate, formatRelative } from "./format";
import type { ScheduleHealthResult } from "./scheduleHealth";

type WorkState = "planned" | "in_progress" | "complete";
type SubmilestoneReviewState = "approved" | "pending_review" | "rejected";

export interface SubmilestoneReviewSummary {
  backOfficeApproved: boolean;
  backOfficeRequired: boolean;
  lenderApprovals: number;
  lenderQuorumRequired: boolean;
  lenderQuorumSize: number;
  state: SubmilestoneReviewState;
}

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
  costDocuments?: Array<{
    _id: string;
    allocationAmountCents: number;
    kind: "invoice" | "receipt";
    pages: Array<{
      assetId: string;
      downloadUrl?: string;
      fileName: string;
      mimeType: string;
    }>;
    subtotalCents?: number;
    taxCents?: number;
    title: string;
  }>;
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
  review?: SubmilestoneReviewSummary;
  scheduleHealth?: ScheduleHealthResult;
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

export interface MilestoneCostDocumentPage {
  assetId: string;
  downloadUrl?: string;
  fileName: string;
  mimeType: string;
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
  /** Canonical comment threads aggregated by the route from existing child companions. */
  collaboration?: ReactNode;
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
  onOpenCostDocument?: (costDocumentId: string) => void;
  onOpenCostDocumentPage?: (page: MilestoneCostDocumentPage) => void;
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
  /** Optional route-specific review facts composed into the shared Overview. */
  reviewLayer?: ReactNode;
  /** Canonical route adapter for capability-aware child decision menu items. */
  renderSubmilestoneReviewItems?: (
    row: MilestoneSheetSubmilestone
  ) => ReactNode;
  siteVisits?: BrokerageSiteVisitsResult;
  /** Governed reviewer entrypoints. Omit for Builder and read-only routes. */
  submilestoneReviewActions?: {
    onApprove?: (submilestoneKey: string) => void;
    onReject?: (submilestoneKey: string) => void;
  };
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
  onOpenCostDocument,
  onOpenCostDocumentPage,
  onReject,
  onRequestInfo,
  onStartWork,
  onSubmitCompletion,
  pending: externalPending,
  collaboration,
  reviewLayer,
  renderSubmilestoneReviewItems,
  submilestoneReviewActions,
  siteVisits,
}: MilestoneDetailSheetProps) {
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const [milestoneNote, setMilestoneNote] = useState("");
  const [activeSection, setActiveSection] = useState("overview");

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
    setLocalError(null);
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
        closeProps={
          { "data-testid": "milestone-detail-sheet-close" } as Record<
            string,
            string
          >
        }
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
            <p className="text-muted-foreground text-xs uppercase tracking-[0.16em]">
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

        <Tabs
          className="min-h-0 flex-1 gap-0"
          onValueChange={(value) => setActiveSection(String(value))}
          value={activeSection}
        >
          <div className="shrink-0 border-b px-4 pt-1 sm:px-6">
            <TabsList
              aria-label="Milestone detail sections"
              className="w-full max-w-full justify-start overflow-x-auto"
              variant="underline"
            >
              <TabsTab value="overview">Overview</TabsTab>
              <TabsTab value="evidence">Evidence</TabsTab>
              <TabsTab value="receipts-invoices">Receipts / invoices</TabsTab>
              <TabsTab value="collaboration">Collaboration</TabsTab>
            </TabsList>
          </div>
          <SheetPanel className="min-h-0 px-3 sm:px-5">
            <TabsPanel className="grid gap-4 pt-4" value="overview">
              <MilestoneOverviewContent
                data={data}
                errorMessage={errorMessage}
                localError={localError}
                onOpenCanonicalTarget={onOpenCanonicalTarget}
                onOpenCostDocument={onOpenCostDocument}
                openCanonicalForRow={openCanonicalForRow}
                reviewLayer={reviewLayer}
                renderSubmilestoneReviewItems={renderSubmilestoneReviewItems}
                rows={rows}
                siteVisits={siteVisits}
                submilestoneReviewActions={submilestoneReviewActions}
              />
            </TabsPanel>
            <TabsPanel className="pt-4" value="evidence">
              <MilestoneEvidenceAggregate
                onOpen={openCanonicalForRow}
                rows={rows}
              />
            </TabsPanel>
            <TabsPanel className="pt-4" value="receipts-invoices">
              <MilestoneCostDocumentAggregate
                onOpen={openCanonicalForRow}
                onOpenCostDocument={onOpenCostDocument}
                onOpenCostDocumentPage={onOpenCostDocumentPage}
                rows={rows}
              />
            </TabsPanel>
            <TabsPanel className="pt-4" value="collaboration">
              {collaboration ?? (
                <MilestoneCollaborationLinks
                  onOpen={openCanonicalForRow}
                  rows={rows}
                />
              )}
            </TabsPanel>
          </SheetPanel>
        </Tabs>

        <SheetFooter className="z-20 flex-col items-stretch gap-3 bg-background/95 px-4 pb-[calc(1rem+env(safe-area-inset-bottom))] backdrop-blur sm:flex-col sm:items-stretch sm:px-6">
          <div
            className="flex w-full min-w-0 flex-col items-stretch gap-3 sm:flex-row sm:items-center"
            data-testid="milestone-footer-summary"
          >
            <div className="min-w-0 flex-1 text-left">
              <p className="font-medium text-sm">
                {eligible
                  ? data.submittedAt
                    ? "Completion submitted"
                    : "All submilestones are complete"
                  : `${incomplete.length} submilestone${incomplete.length === 1 ? "" : "s"} still incomplete`}
              </p>
              <p className="text-muted-foreground text-xs sm:truncate">
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
              className="shrink-0"
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
          </div>
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

function MilestoneOverviewContent({
  data,
  errorMessage,
  localError,
  onOpenCanonicalTarget,
  onOpenCostDocument,
  openCanonicalForRow,
  reviewLayer,
  renderSubmilestoneReviewItems,
  rows,
  siteVisits,
  submilestoneReviewActions,
}: {
  data: MilestoneSheetData;
  errorMessage?: string;
  localError: string | null;
  onOpenCanonicalTarget?: MilestoneDetailSheetProps["onOpenCanonicalTarget"];
  onOpenCostDocument?: MilestoneDetailSheetProps["onOpenCostDocument"];
  openCanonicalForRow: (
    row: MilestoneSheetSubmilestone | undefined,
    selectedTab: BuildSubmilestoneDetailTab
  ) => boolean;
  reviewLayer?: ReactNode;
  renderSubmilestoneReviewItems?: MilestoneDetailSheetProps["renderSubmilestoneReviewItems"];
  rows: MilestoneSheetSubmilestone[];
  siteVisits?: BrokerageSiteVisitsResult;
  submilestoneReviewActions?: MilestoneDetailSheetProps["submilestoneReviewActions"];
}) {
  return (
    <>
      <Frame>
        <FramePanel className="space-y-4 p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="font-semibold text-base">Sub-milestone scope</h2>
              <p className="text-muted-foreground text-sm">
                Child execution, evidence, assignments, materials, and review
                are owned by the unified detail surface.
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
                  canOpenCanonicalTarget={Boolean(onOpenCanonicalTarget)}
                  key={row.key}
                  onOpen={(tab) => openCanonicalForRow(row, tab)}
                  onOpenCostDocument={onOpenCostDocument}
                  row={row}
                  reviewItems={renderSubmilestoneReviewItems?.(row)}
                  submilestoneReviewActions={submilestoneReviewActions}
                />
              ))}
            </div>
          )}
        </FramePanel>
      </Frame>

      {siteVisits ? (
        <MilestoneSiteVisits rows={rows} siteVisits={siteVisits.visits} />
      ) : null}

      {localError || errorMessage ? (
        <Frame>
          <FramePanel className="p-3 text-destructive text-sm" role="alert">
            {localError ?? errorMessage}
          </FramePanel>
        </Frame>
      ) : null}

      {reviewLayer}

      {data.recentEvents.length > 0 ? (
        <RecentActivity events={data.recentEvents} />
      ) : null}
    </>
  );
}

function MilestoneSiteVisits({
  rows,
  siteVisits,
}: {
  rows: MilestoneSheetSubmilestone[];
  siteVisits: BrokerageSiteVisitRow[];
}) {
  const [selectedVisit, setSelectedVisit] =
    useState<BrokerageSiteVisitRow | null>(null);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!selectedVisit) {
      return;
    }
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [selectedVisit]);
  const submilestonesByVisit = useMemo(() => {
    const result = new Map<string, string[]>();
    for (const row of rows) {
      for (const visit of row.siteVisits) {
        const names = result.get(visit.visitId) ?? [];
        if (!names.includes(row.name)) {
          names.push(row.name);
        }
        result.set(visit.visitId, names);
      }
    }
    return result;
  }, [rows]);

  return (
    <>
      <Frame>
        <FramePanel className="space-y-4 p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="font-semibold text-base">Site Visits</h2>
              <p className="text-muted-foreground text-sm">
                Every Visit attached to this Milestone, including its field
                report and Sub-milestone scope.
              </p>
            </div>
            <Badge variant="outline">
              {siteVisits.length} Visit{siteVisits.length === 1 ? "" : "s"}
            </Badge>
          </div>

          {siteVisits.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              No Site Visits are attached to this Milestone.
            </p>
          ) : (
            <div
              className="grid gap-3 sm:grid-cols-2"
              data-testid="milestone-site-visit-grid"
            >
              {siteVisits.map((visit) => {
                const submilestoneNames =
                  submilestonesByVisit.get(visit.visitId) ?? [];
                return (
                  <Card
                    aria-label={`Open Site Visit ${visit.visitId}`}
                    className="text-left transition-colors hover:border-primary/35 hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    key={visit.visitId}
                    onClick={() => setSelectedVisit(visit)}
                    render={<button type="button" />}
                  >
                    <CardHeader className="gap-3 p-4">
                      <div className="min-w-0">
                        <CardTitle className="truncate text-base">
                          Site Visit {visit.visitId}
                        </CardTitle>
                        <CardDescription className="mt-1 flex items-center gap-1.5">
                          <CalendarDays
                            aria-hidden="true"
                            className="size-3.5"
                          />
                          {visit.scheduledDateLabel}
                        </CardDescription>
                      </div>
                      <CardAction>
                        <Badge
                          variant={operationalStatusBadgeVariant(
                            visit.operationalStatus
                          )}
                        >
                          {operationalStatusLabel(visit.operationalStatus)}
                        </Badge>
                      </CardAction>
                    </CardHeader>
                    <CardPanel className="space-y-3 px-4 pb-4">
                      <div>
                        <p className="text-muted-foreground text-xs">
                          Included Sub-milestones
                        </p>
                        <div className="mt-1.5 flex flex-wrap gap-1.5">
                          {submilestoneNames.length > 0 ? (
                            submilestoneNames.map((name) => (
                              <Badge key={name} size="sm" variant="secondary">
                                {name}
                              </Badge>
                            ))
                          ) : (
                            <Badge size="sm" variant="secondary">
                              Whole Milestone
                            </Badge>
                          )}
                        </div>
                      </div>
                      <span className="flex items-center justify-end gap-1 font-medium text-primary text-xs">
                        View full Visit and report
                        <ChevronRight aria-hidden="true" className="size-3.5" />
                      </span>
                    </CardPanel>
                  </Card>
                );
              })}
            </div>
          )}
        </FramePanel>
      </Frame>

      <SiteVisitDetailSheet
        now={now}
        onClose={() => setSelectedVisit(null)}
        onCopyLink={copySiteVisitLink}
        open={selectedVisit !== null}
        showBuildLink={false}
        visit={selectedVisit}
      />
    </>
  );
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: This canonical card composes schedule, evidence, site-visit, cost, and optional prototype review state.
function ParentScopeRow({
  canOpenCanonicalTarget,
  onOpen,
  onOpenCostDocument,
  row,
  reviewItems,
  submilestoneReviewActions,
}: {
  canOpenCanonicalTarget: boolean;
  onOpen: (tab: BuildSubmilestoneDetailTab) => boolean;
  onOpenCostDocument?: (costDocumentId: string) => void;
  row: MilestoneSheetSubmilestone;
  reviewItems?: ReactNode;
  submilestoneReviewActions?: MilestoneDetailSheetProps["submilestoneReviewActions"];
}) {
  const [expanded, setExpanded] = useState(false);
  const hasCanonicalTarget =
    canOpenCanonicalTarget && Boolean(row.submilestoneId);
  const isActiveOverdue =
    row.status === "in_progress" &&
    row.scheduleHealth?.health === "behind_schedule" &&
    row.scheduleHealth.overdueDays > 0;
  const overdueDays = isActiveOverdue
    ? (row.scheduleHealth?.overdueDays ?? 0)
    : 0;
  const conductedVisits = row.siteVisits.filter(
    (visit) => visit.completedAt || visit.status === "complete"
  );
  const latestVisit = conductedVisits.at(-1);
  const siteVisitLabel = latestVisit
    ? `Site visit conducted. Decision: ${humanizeStatus(latestVisit.status)}`
    : "No site visit has been conducted.";
  const builderEvidence = row.evidence.filter(
    (item) => item.source !== "site_visit"
  );
  return (
    <Collapsible onOpenChange={setExpanded} open={expanded}>
      <Card data-testid={`milestone-scope-row-${row.key}`}>
        <CardHeader className="gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <CardTitle className="text-base">{row.name}</CardTitle>
              <StatusBadge status={row.status} />
              {isActiveOverdue ? (
                <Badge
                  aria-label={`In progress, behind schedule, ${formatOverdueDays(
                    overdueDays
                  )}; planned end ${row.endDate}`}
                  size="sm"
                  variant="error"
                >
                  <AlertTriangle aria-hidden="true" />
                  Behind schedule · {formatOverdueDays(overdueDays)}
                </Badge>
              ) : null}
              <Tooltip>
                <TooltipTrigger
                  render={
                    <span
                      aria-label={siteVisitLabel}
                      className="inline-flex size-7 items-center justify-center rounded-md border text-muted-foreground"
                      role="img"
                      tabIndex={0}
                    />
                  }
                >
                  {latestVisit ? (
                    <ClipboardCheck className="size-4 text-success" />
                  ) : (
                    <MapPinOff className="size-4" />
                  )}
                </TooltipTrigger>
                <TooltipContent>{siteVisitLabel}</TooltipContent>
              </Tooltip>
            </div>
            <CardDescription>
              {row.key} · {row.evidence.length} evidence item
              {row.evidence.length === 1 ? "" : "s"} ·{" "}
              {(row.costDocuments ?? []).length} cost document
              {(row.costDocuments ?? []).length === 1 ? "" : "s"}
            </CardDescription>
          </div>
          <CardAction>
            <SubmilestoneActionsMenu
              hasCanonicalTarget={hasCanonicalTarget}
              onApprove={
                submilestoneReviewActions?.onApprove
                  ? () => submilestoneReviewActions.onApprove?.(row.key)
                  : undefined
              }
              onOpen={onOpen}
              onReject={
                submilestoneReviewActions?.onReject
                  ? () => submilestoneReviewActions.onReject?.(row.key)
                  : undefined
              }
              reviewState={row.review?.state}
              reviewItems={reviewItems}
              submilestoneName={row.name}
            />
          </CardAction>
        </CardHeader>
        {row.review ? <SubmilestoneReviewStrip review={row.review} /> : null}
        <CardPanel className="space-y-4 pt-0">
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm sm:grid-cols-3">
            <OperationalFact
              label="Planned start"
              value={formatPlanDate(row.startDate)}
            />
            <OperationalFact
              label="Planned end"
              value={formatPlanDate(row.endDate)}
            />
            <OperationalFact
              label="Actual start"
              value={
                row.actualStartedAt
                  ? formatDate(row.actualStartedAt)
                  : "Not started"
              }
            />
            <OperationalFact
              label="Actual end"
              value={
                row.completedAt ? formatDate(row.completedAt) : "Not complete"
              }
            />
            <OperationalFact
              label="Budgeted Cost"
              value={formatCents(row.budgetCents)}
            />
            <OperationalFact
              label="Actual Cost"
              value={
                row.actualCostCents === undefined
                  ? "Not reported"
                  : formatCents(row.actualCostCents)
              }
            />
          </dl>

          <DocumentedCostCoverage
            budgetCents={row.budgetCents}
            documents={row.costDocuments ?? []}
            submilestoneName={row.name}
          />

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

          <CollapsibleTrigger
            aria-label={`${expanded ? "Collapse" : "Expand"} ${row.name} details`}
            className="group flex min-h-9 w-full items-center justify-between rounded-md px-2 text-left font-medium text-sm hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            Supporting detail
            <ChevronDown
              aria-hidden="true"
              className="size-4 transition-transform group-data-[panel-open]:rotate-180"
            />
          </CollapsibleTrigger>

          <CollapsiblePanel>
            <Separator />
            <div
              className="py-1"
              data-testid="milestone-supporting-detail-rows"
            >
              <SupportingSection className="py-4" title="Scope">
                <p>{row.description || "No scope has been recorded."}</p>
              </SupportingSection>
              <Separator />
              <SupportingSection className="py-4" title="Field Guidance">
                <p>{row.fieldNote || "No Field Guidance has been recorded."}</p>
              </SupportingSection>
              <Separator />
              <SupportingSection
                className="py-4"
                title="Builder Submitted Evidence"
              >
                {builderEvidence.length > 0 ? (
                  <ul className="space-y-2">
                    {builderEvidence.map((evidence) => (
                      <li
                        className="flex min-w-0 items-center gap-2"
                        key={evidence.evidenceKey}
                      >
                        <Paperclip className="size-4 shrink-0" />
                        {evidence.previewUrl ? (
                          <a
                            className="truncate underline-offset-4 hover:underline"
                            href={evidence.previewUrl}
                            rel="noreferrer"
                            target="_blank"
                          >
                            {evidence.fileName}
                          </a>
                        ) : (
                          <span className="truncate">{evidence.fileName}</span>
                        )}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p>No Builder evidence has been submitted.</p>
                )}
              </SupportingSection>
              <Separator />
              <SupportingSection className="py-4" title="Site Visit Packages">
                {row.siteVisits.length > 0 ? (
                  <ul className="space-y-2">
                    {row.siteVisits.map((visit) => (
                      <li
                        className="flex items-center gap-2"
                        key={visit.visitId}
                      >
                        <ClipboardCheck className="size-4 shrink-0" />
                        Visit {visit.visitId} · {humanizeStatus(visit.status)}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p>No Site Visit Package is attached.</p>
                )}
              </SupportingSection>
              <Separator />
              <SupportingSection className="py-4" title="Receipts / invoices">
                <CostDocumentFileList
                  documents={row.costDocuments ?? []}
                  onOpenCostDocument={onOpenCostDocument}
                />
              </SupportingSection>
            </div>
            <div className="flex flex-wrap gap-1 border-t pt-3">
              {(
                [
                  ["People", "people"],
                  ["Materials", "materials"],
                  ["Evidence", "evidence"],
                  ["Collaboration", "collaboration"],
                  ["Review", "review"],
                ] as const
              ).map(([label, tab]) => (
                <Button
                  disabled={!hasCanonicalTarget}
                  key={tab}
                  onClick={() => onOpen(tab)}
                  size="xs"
                  type="button"
                  variant="ghost"
                >
                  {label}
                </Button>
              ))}
            </div>
          </CollapsiblePanel>
        </CardPanel>
      </Card>
    </Collapsible>
  );
}

function SubmilestoneActionsMenu({
  hasCanonicalTarget,
  onApprove,
  onOpen,
  onReject,
  reviewState,
  reviewItems,
  submilestoneName,
}: {
  hasCanonicalTarget: boolean;
  onApprove?: () => void;
  onOpen: (tab: BuildSubmilestoneDetailTab) => boolean;
  onReject?: () => void;
  reviewState?: SubmilestoneReviewState;
  reviewItems?: ReactNode;
  submilestoneName: string;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            aria-label={`${submilestoneName} actions`}
            size="icon-sm"
            type="button"
            variant="outline"
          />
        }
      >
        <Ellipsis aria-hidden="true" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-56">
        <DropdownMenuGroup>
          <DropdownMenuLabel>Sub-milestone</DropdownMenuLabel>
          <DropdownMenuItem
            disabled={!hasCanonicalTarget}
            onClick={() => onOpen("overview")}
          >
            <Eye aria-hidden="true" />
            Open full detail
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={!hasCanonicalTarget}
            onClick={() => onOpen("evidence")}
          >
            <Paperclip aria-hidden="true" />
            Review evidence
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={!hasCanonicalTarget}
            onClick={() => onOpen("collaboration")}
          >
            <MessageCircle aria-hidden="true" />
            Open collaboration thread
          </DropdownMenuItem>
          {onApprove || onReject ? <DropdownMenuSeparator /> : null}
          {onApprove || onReject ? (
            <DropdownMenuLabel>Reviewer actions</DropdownMenuLabel>
          ) : null}
          {onApprove ? (
            <DropdownMenuItem
              disabled={reviewState === "approved"}
              onClick={onApprove}
            >
              <CheckCircle2 aria-hidden="true" />
              Approve Sub-milestone
            </DropdownMenuItem>
          ) : null}
          {onReject ? (
            <DropdownMenuItem
              disabled={reviewState === "rejected"}
              onClick={onReject}
              variant="destructive"
            >
              <CircleX aria-hidden="true" />
              <span>
                Reject Sub-milestone
                <span className="block text-muted-foreground text-xs">
                  Return for correction and reset approvals
                </span>
              </span>
            </DropdownMenuItem>
          ) : null}
          {reviewItems}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function SubmilestoneReviewStrip({
  review,
}: {
  review: SubmilestoneReviewSummary;
}) {
  const label =
    review.state === "approved"
      ? "Approved"
      : review.state === "rejected"
        ? "Rejected"
        : "Pending Review";
  const badgeVariant =
    review.state === "approved"
      ? "success"
      : review.state === "rejected"
        ? "error"
        : "warning";
  const lenderQuorumMet = review.lenderApprovals >= review.lenderQuorumSize;

  return (
    <section
      className="flex flex-wrap items-center justify-between gap-3 border-y bg-muted/24 px-6 py-3"
      data-review-state={review.state}
    >
      <div className="flex items-center gap-2">
        <span className="text-muted-foreground text-xs">Review state</span>
        <Badge size="sm" variant={badgeVariant}>
          {review.state === "approved" ? (
            <CheckCircle2 aria-hidden="true" />
          ) : review.state === "rejected" ? (
            <CircleX aria-hidden="true" />
          ) : null}
          {label}
        </Badge>
      </div>
      <div className="flex flex-wrap gap-2">
        {review.backOfficeRequired ? (
          <Badge
            size="sm"
            variant={review.backOfficeApproved ? "success" : "warning"}
          >
            Back Office · {review.backOfficeApproved ? "Approved" : "Pending"}
          </Badge>
        ) : null}
        {review.lenderQuorumRequired ? (
          <Badge size="sm" variant={lenderQuorumMet ? "success" : "warning"}>
            Lender quorum · {review.lenderApprovals}/{review.lenderQuorumSize}
          </Badge>
        ) : null}
      </div>
    </section>
  );
}

function OperationalFact({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-muted-foreground text-xs">{label}</dt>
      <dd className="truncate font-medium tabular-nums">{value}</dd>
    </div>
  );
}

function SupportingSection({
  children,
  className,
  title,
}: {
  children: ReactNode;
  className?: string;
  title: string;
}) {
  return (
    <section className={className}>
      <h3 className="mb-2 font-semibold text-sm">{title}</h3>
      <div className="text-muted-foreground text-sm">{children}</div>
    </section>
  );
}

function MilestoneEvidenceAggregate({
  onOpen,
  rows,
}: {
  onOpen: (
    row: MilestoneSheetSubmilestone | undefined,
    tab: BuildSubmilestoneDetailTab
  ) => boolean;
  rows: MilestoneSheetSubmilestone[];
}) {
  const evidence = rows.flatMap((row) =>
    row.evidence.map((asset) => ({ asset, row }))
  );

  return (
    <Frame>
      <FramePanel className="space-y-4 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="font-semibold text-base">Builder evidence</h2>
            <p className="text-muted-foreground text-sm">
              Evidence aggregated from this Milestone&apos;s canonical
              Sub-milestones.
            </p>
          </div>
          <Badge variant="outline">{evidence.length} assets</Badge>
        </div>
        {evidence.length > 0 ? (
          <div className="grid gap-3 sm:grid-cols-2">
            {evidence.map(({ asset, row }) => (
              <EvidenceAssetCard
                asset={asset}
                footer={
                  <Button
                    aria-label={row.name}
                    className="h-auto min-w-0 justify-start p-0 text-left"
                    disabled={!row.submilestoneId}
                    onClick={() => onOpen(row, "evidence")}
                    size="sm"
                    type="button"
                    variant="link"
                  >
                    <Link2 aria-hidden="true" />
                    <span className="truncate">{row.name}</span>
                  </Button>
                }
                key={`${row.key}:${asset.evidenceKey}`}
              />
            ))}
          </div>
        ) : (
          <p className="text-muted-foreground text-sm">
            No Builder evidence is attached to this Milestone.
          </p>
        )}
      </FramePanel>
    </Frame>
  );
}

function MilestoneCostDocumentAggregate({
  onOpen,
  onOpenCostDocument,
  onOpenCostDocumentPage,
  rows,
}: {
  onOpen: (
    row: MilestoneSheetSubmilestone | undefined,
    tab: BuildSubmilestoneDetailTab
  ) => boolean;
  onOpenCostDocument?: (costDocumentId: string) => void;
  onOpenCostDocumentPage?: (page: MilestoneCostDocumentPage) => void;
  rows: MilestoneSheetSubmilestone[];
}) {
  const documentedCents = rows.reduce(
    (total, row) =>
      total +
      (row.costDocuments ?? []).reduce(
        (rowTotal, document) => rowTotal + document.allocationAmountCents,
        0
      ),
    0
  );

  return (
    <Frame>
      <FramePanel className="space-y-5 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="font-semibold text-base">Receipts / invoices</h2>
            <p className="text-muted-foreground text-sm">
              Cost documents aggregated across every canonical Sub-milestone.
            </p>
          </div>
          <Badge variant="success">
            {formatCents(documentedCents)} documented
          </Badge>
        </div>
        <div className="space-y-5">
          {rows.map((row, index) => (
            <section className="space-y-3" key={row.key}>
              {index > 0 ? <Separator /> : null}
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="font-medium text-sm">{row.name}</h3>
                  <p className="text-muted-foreground text-xs">
                    {row.costDocuments?.length ?? 0} linked cost document
                    {(row.costDocuments?.length ?? 0) === 1 ? "" : "s"}
                  </p>
                </div>
                <Button
                  className="h-auto p-0"
                  disabled={!row.submilestoneId}
                  onClick={() => onOpen(row, "overview")}
                  size="sm"
                  type="button"
                  variant="link"
                >
                  <Link2 aria-hidden="true" /> Open Sub-milestone
                </Button>
              </div>
              <CostDocumentFileList
                documents={row.costDocuments ?? []}
                onOpenCostDocument={
                  onOpenCostDocumentPage ? undefined : onOpenCostDocument
                }
                onOpenPage={onOpenCostDocumentPage}
              />
            </section>
          ))}
        </div>
      </FramePanel>
    </Frame>
  );
}

function MilestoneCollaborationLinks({
  onOpen,
  rows,
}: {
  onOpen: (
    row: MilestoneSheetSubmilestone | undefined,
    tab: BuildSubmilestoneDetailTab
  ) => boolean;
  rows: MilestoneSheetSubmilestone[];
}) {
  return (
    <Frame>
      <FramePanel className="space-y-4 p-4">
        <div>
          <h2 className="font-semibold text-base">Collaboration</h2>
          <p className="text-muted-foreground text-sm">
            Open the canonical comment thread for each Sub-milestone.
          </p>
        </div>
        <div className="grid gap-2">
          {rows.map((row) => (
            <Button
              className="justify-between"
              disabled={!row.submilestoneId}
              key={row.key}
              onClick={() => onOpen(row, "collaboration")}
              type="button"
              variant="outline"
            >
              {row.name}
              <MessageCircle aria-hidden="true" />
            </Button>
          ))}
        </div>
      </FramePanel>
    </Frame>
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
    <div
      className="flex w-full flex-col items-stretch gap-2"
      data-testid="milestone-review-actions"
    >
      {onApprove || onRequestInfo ? (
        <Textarea
          aria-label="Milestone decision note"
          className="min-w-0"
          onChange={(event) => onNoteChange(event.target.value)}
          placeholder="Add a decision note"
          value={note}
        />
      ) : null}
      <div className="flex flex-wrap items-center justify-end gap-2">
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
            variant="outline"
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
            onClick={() =>
              onApprove(data.milestoneKey, note.trim() || undefined)
            }
            size="sm"
          >
            Approve milestone
          </Button>
        ) : null}
      </div>
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

function formatOverdueDays(overdueDays: number) {
  return `${overdueDays} day${overdueDays === 1 ? "" : "s"} overdue`;
}

function formatPlanDate(value: string) {
  const date = new Date(`${value}T12:00:00Z`);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat(undefined, {
        day: "numeric",
        month: "short",
        year: "numeric",
      }).format(date);
}

function humanizeStatus(value: string) {
  const words = value.replaceAll("_", " ").trim();
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : "Unknown";
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
