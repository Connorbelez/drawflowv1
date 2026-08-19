import { usePaginatedQuery } from "convex/react";
import {
  ArrowUpRight,
  CalendarRange,
  Check,
  CircleDot,
  FileCheck2,
  Loader2,
  MapPinCheck,
  ReceiptText,
  RotateCcw,
  ShieldCheck,
  Users,
} from "lucide-react";
import { type ComponentType, useState } from "react";

import { Badge } from "#/components/ui/badge.tsx";
import { Button } from "#/components/ui/button.tsx";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "#/components/ui/card.tsx";
import { Frame, FramePanel } from "#/components/ui/frame.tsx";
import { Progress } from "#/components/ui/progress.tsx";
import { Separator } from "#/components/ui/separator.tsx";
import { cn } from "#/lib/utils.ts";
import { api } from "../../../convex/_generated/api";
import type { LenderPortalMilestoneQueueRow } from "../../../convex/lender_portal_phase5_contracts";

export type LenderMilestoneQueueScope = "action" | "all";
type MilestoneQueueLane =
  | "needs-action"
  | "waiting"
  | "correction"
  | "approved";

const laneDefinitions = [
  {
    description: "Your current-cycle lender decision is outstanding",
    icon: CircleDot,
    key: "needs-action",
    title: "Needs my action",
  },
  {
    description: "Your action is complete; another required group remains",
    icon: Users,
    key: "waiting",
    title: "Waiting on others",
  },
  {
    description: "The same request is waiting for corrected resubmission",
    icon: RotateCcw,
    key: "correction",
    title: "Builder correction",
  },
  {
    description: "All locked current-cycle requirements are complete",
    icon: Check,
    key: "approved",
    title: "Approved",
  },
] as const;

export function LenderMilestoneQueue({
  onOpenReview,
}: {
  onOpenReview: (row: LenderPortalMilestoneQueueRow) => void;
}) {
  const [scope, setScope] = useState<LenderMilestoneQueueScope>("action");
  const { loadMore, results, status } = usePaginatedQuery(
    api.lender_portal_phase5.listAllAssignedLenderMilestoneReviewRequests,
    { scope },
    { initialNumItems: 20 }
  );

  if (status === "LoadingFirstPage") {
    return <MilestoneQueueLoading />;
  }

  return (
    <main className="mx-auto min-w-0 max-w-[1440px] p-4">
      <QueueHeader scope={scope} setScope={setScope} />
      <p aria-live="polite" className="sr-only">
        {results.length} loaded Milestone request
        {results.length === 1 ? "" : "s"} in the selected scope.
      </p>
      <MilestoneWorkflowLanes
        onOpenReview={onOpenReview}
        requests={results as LenderPortalMilestoneQueueRow[]}
        scope={scope}
      />
      {status === "CanLoadMore" || status === "LoadingMore" ? (
        <div className="mt-5 flex justify-center">
          <Button
            disabled={status === "LoadingMore"}
            onClick={() => loadMore(20)}
            variant="outline"
          >
            {status === "LoadingMore" ? (
              <Loader2 className="animate-spin motion-reduce:animate-none" />
            ) : null}
            {status === "LoadingMore" ? "Loading requests…" : "Load more"}
          </Button>
        </div>
      ) : null}
    </main>
  );
}

function MilestoneQueueLoading() {
  return (
    <Frame className="mx-auto mt-6 max-w-6xl">
      <FramePanel
        aria-live="polite"
        className="flex items-center gap-3 p-5"
        role="status"
      >
        <Loader2 className="size-4 animate-spin motion-reduce:animate-none" />
        Loading assigned Milestone requests…
      </FramePanel>
    </Frame>
  );
}

function QueueHeader({
  scope,
  setScope,
}: {
  scope: LenderMilestoneQueueScope;
  setScope: (scope: LenderMilestoneQueueScope) => void;
}) {
  return (
    <header className="mb-5 flex flex-col justify-between gap-4 border-b pb-5 lg:flex-row lg:items-end">
      <div>
        <p className="font-semibold text-muted-foreground text-xs uppercase tracking-[0.18em]">
          Assigned Milestone requests
        </p>
        <h1 className="mt-1 font-semibold text-2xl tracking-tight sm:text-3xl">
          Milestone queue
        </h1>
        <p className="mt-1 max-w-2xl text-muted-foreground text-sm leading-6">
          Review current-cycle requirements, evidence, and approval-group
          progress across your organization&apos;s assigned Builds.
        </p>
      </div>
      <fieldset className="flex w-fit rounded-lg border bg-background p-1">
        <legend className="sr-only">Milestone queue scope</legend>
        <Button
          aria-pressed={scope === "action"}
          className="min-h-11 sm:min-h-8"
          onClick={() => setScope("action")}
          size="sm"
          variant={scope === "action" ? "default" : "ghost"}
        >
          Needs my action
        </Button>
        <Button
          aria-pressed={scope === "all"}
          className="min-h-11 sm:min-h-8"
          onClick={() => setScope("all")}
          size="sm"
          variant={scope === "all" ? "default" : "ghost"}
        >
          All assigned
        </Button>
      </fieldset>
    </header>
  );
}

function MilestoneWorkflowLanes({
  onOpenReview,
  requests,
  scope,
}: {
  onOpenReview: (row: LenderPortalMilestoneQueueRow) => void;
  requests: readonly LenderPortalMilestoneQueueRow[];
  scope: LenderMilestoneQueueScope;
}) {
  const lanes =
    scope === "action"
      ? laneDefinitions.filter((lane) => lane.key === "needs-action")
      : laneDefinitions;

  return (
    <div className="grid gap-4">
      <Frame>
        <FramePanel className="flex flex-col justify-between gap-3 px-4 py-3 lg:flex-row lg:items-center">
          <div>
            <p className="font-semibold text-sm">
              Evidence-rich workflow lanes
            </p>
            <p className="mt-1 text-muted-foreground text-xs">
              Cost, schedule, evidence coverage, and Sub-milestone signals from
              each current review cycle.
            </p>
          </div>
          <SubmilestoneLegend />
        </FramePanel>
      </Frame>

      <div className={cn("grid gap-4", scope === "all" && "2xl:grid-cols-4")}>
        {lanes.map((lane) => {
          const LaneIcon = lane.icon;
          const laneRequests = requests.filter(
            (request) => queueLane(request) === lane.key
          );
          return (
            <Frame className="min-w-0" key={lane.key}>
              <FramePanel className="border-b px-4 py-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <LaneIcon className="size-4" />
                    <h2 className="font-semibold text-sm">{lane.title}</h2>
                  </div>
                  <Badge className="tabular-nums" variant="outline">
                    {laneRequests.length}
                  </Badge>
                </div>
                <p className="mt-1 text-muted-foreground text-xs leading-5">
                  {lane.description}
                </p>
              </FramePanel>
              <FramePanel
                className={cn(
                  "grid gap-3 p-3",
                  scope === "action" && "xl:grid-cols-2"
                )}
              >
                {laneRequests.map((request) => (
                  <MilestoneWorkflowCard
                    key={String(request.reviewCycleId)}
                    onOpenReview={onOpenReview}
                    request={request}
                  />
                ))}
                {laneRequests.length === 0 ? (
                  <p className="p-4 text-center text-muted-foreground text-xs">
                    {scope === "action"
                      ? "No assigned requests need your action. Choose All assigned to see every request."
                      : "No assigned requests are in this state."}
                  </p>
                ) : null}
              </FramePanel>
            </Frame>
          );
        })}
      </div>
    </div>
  );
}

function MilestoneWorkflowCard({
  onOpenReview,
  request,
}: {
  onOpenReview: (row: LenderPortalMilestoneQueueRow) => void;
  request: LenderPortalMilestoneQueueRow;
}) {
  const unavailable = request.targetAvailability === "unavailable";
  return (
    <Card className="min-w-0 overflow-hidden">
      <CardHeader className="border-b px-4 py-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="break-words text-muted-foreground text-xs">
              {request.buildName}
            </p>
            <CardTitle className="mt-1 break-words text-sm">
              {request.milestoneName}
            </CardTitle>
          </div>
          <StateBadge request={request} />
        </div>
        <p className="text-muted-foreground text-xs leading-5">
          {queueSummary(request)}
        </p>
      </CardHeader>
      <CardContent className="grid gap-4 px-4 py-4">
        <div className="grid grid-cols-2 gap-x-4 gap-y-3">
          <ReviewFact
            label="Planned Budget"
            value={formatCad(request.plannedBudgetCents)}
          />
          <ReviewFact
            label="Actual entered cost"
            value={formatCad(request.actualCostCents)}
          />
          <ReviewFact
            icon={CalendarRange}
            label="Planned start / end"
            value={formatDateRange(
              request.plannedStartDate,
              request.plannedEndDate
            )}
          />
          <ReviewFact
            icon={CalendarRange}
            label="Actual start / end"
            value={formatDateRange(
              request.actualStartDate,
              request.actualEndDate
            )}
          />
        </div>

        <Separator />
        <ReceiptCoverageSummary request={request} />
        <Separator />

        <dl className="grid gap-3 text-xs">
          <div>
            <dt className="font-semibold text-muted-foreground text-xs uppercase tracking-wide">
              Locked policy
            </dt>
            <dd className="mt-1 font-semibold">{formatPolicy(request)}</dd>
          </div>
          <div>
            <dt className="font-semibold text-muted-foreground text-xs uppercase tracking-wide">
              Approval progress
            </dt>
            <dd className="mt-1 font-semibold">{formatApproval(request)}</dd>
          </div>
        </dl>

        <Separator />
        <div>
          <div className="mb-2 flex items-center justify-between gap-3">
            <p className="font-semibold text-muted-foreground text-xs uppercase tracking-wide">
              Sub-milestones
            </p>
            <Badge className="tabular-nums" variant="outline">
              {request.submilestones.length}
            </Badge>
          </div>
          {request.submilestones.length ? (
            <div className="divide-y">
              {request.submilestones.map((submilestone) => (
                <SubmilestoneRow
                  key={submilestone.name}
                  submilestone={submilestone}
                />
              ))}
            </div>
          ) : (
            <p className="text-muted-foreground text-xs">
              {unavailable
                ? "Current request details are stale. Refresh or open the latest request."
                : "No Sub-milestones are recorded for this request."}
            </p>
          )}
        </div>

        <Separator />
        <EvidenceList evidence={request.evidence} />
        <Button
          className="w-full"
          disabled={unavailable}
          onClick={() => onOpenReview(request)}
          size="sm"
          title={
            unavailable
              ? "This review cycle is no longer current"
              : "Open the current Milestone review"
          }
          variant="outline"
        >
          {unavailable ? "Request no longer current" : "Review request"}
          <ArrowUpRight className="size-3.5" />
        </Button>
      </CardContent>
    </Card>
  );
}

function ReviewFact({
  icon: Icon,
  label,
  value,
}: {
  icon?: ComponentType<{ className?: string }>;
  label: string;
  value: string;
}) {
  return (
    <div className="min-w-0">
      <p className="flex items-center gap-1 font-semibold text-muted-foreground text-xs uppercase tracking-wide">
        {Icon ? <Icon className="size-3" /> : null} {label}
      </p>
      <p className="mt-1 break-words font-semibold text-xs tabular-nums">
        {value}
      </p>
    </div>
  );
}

function ReceiptCoverageSummary({
  request,
}: {
  request: LenderPortalMilestoneQueueRow;
}) {
  const percent = receiptCoveragePercent(request);
  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <p className="flex items-center gap-1.5 font-semibold text-xs">
          <ReceiptText className="size-3.5" /> Receipt/invoice coverage
        </p>
        <Badge variant="secondary">
          {percent === null ? "Not recorded" : `${percent}%`}
        </Badge>
      </div>
      <p className="mt-2 text-muted-foreground text-xs">
        {request.receiptCoverageCents === null
          ? request.receiptInvoiceRequired
            ? "No receipt or invoice amount is recorded in this review cycle."
            : "Receipt or invoice coverage is not required by the locked policy."
          : `${formatCad(request.receiptCoverageCents)} of ${formatCad(request.actualCostCents)}`}
      </p>
      {percent === null ? null : (
        <Progress
          aria-label="Receipt and invoice coverage"
          className="mt-2 h-1.5"
          value={percent}
        />
      )}
    </div>
  );
}

function SubmilestoneLegend() {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-muted-foreground text-xs">
      <LegendItem icon={MapPinCheck} label="Site Visit addressed" />
      <LegendItem icon={ShieldCheck} label="Site Visit required" />
      <LegendItem icon={ReceiptText} label="Receipt/invoice coverage" />
      <LegendItem icon={FileCheck2} label="Builder evidence" />
    </div>
  );
}

function LegendItem({
  icon: Icon,
  label,
}: {
  icon: ComponentType<{ className?: string }>;
  label: string;
}) {
  return (
    <span className="flex items-center gap-1">
      <Icon className="size-3.5" /> {label}
    </span>
  );
}

function SubmilestoneRow({
  submilestone,
}: {
  submilestone: LenderPortalMilestoneQueueRow["submilestones"][number];
}) {
  return (
    <div className="flex min-w-0 items-center justify-between gap-3 py-2.5">
      <p className="min-w-0 break-words font-semibold text-xs">
        {submilestone.name}
      </p>
      <div className="flex shrink-0 items-center gap-1.5">
        <SubmilestoneSignal
          active={submilestone.siteVisitAddressed}
          icon={MapPinCheck}
          label="Site Visit addressed for this Sub-milestone"
          tone="success"
        />
        <SubmilestoneSignal
          active={submilestone.siteVisitRequired}
          icon={ShieldCheck}
          label="Site Visit is required"
          tone="warning"
        />
        <SubmilestoneSignal
          active={submilestone.receiptCoverageCents !== null}
          icon={ReceiptText}
          label="Receipt or invoice coverage recorded"
          tone="evidence"
        />
        <SubmilestoneSignal
          active={submilestone.builderEvidence}
          icon={FileCheck2}
          label="Builder evidence submitted"
          tone="evidence"
        />
      </div>
    </div>
  );
}

function SubmilestoneSignal({
  active,
  icon: Icon,
  label,
  tone,
}: {
  active: boolean;
  icon: ComponentType<{ className?: string }>;
  label: string;
  tone: "evidence" | "success" | "warning";
}) {
  return (
    <span
      aria-label={active ? label : `${label}: no`}
      className={cn(
        "inline-flex h-6 items-center gap-1 rounded-md border px-1.5 font-semibold text-xs",
        !active && "border-transparent bg-muted text-muted-foreground/45",
        active &&
          tone === "success" &&
          "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
        active &&
          tone === "warning" &&
          "border-amber-500/30 bg-amber-500/10 text-amber-800 dark:text-amber-200",
        active &&
          tone === "evidence" &&
          "border-violet-500/30 bg-violet-500/10 text-violet-700 dark:text-violet-300"
      )}
      role="img"
      title={active ? label : `${label}: no`}
    >
      <Icon className="size-3" />
    </span>
  );
}

function StateBadge({ request }: { request: LenderPortalMilestoneQueueRow }) {
  const lane = queueLane(request);
  return (
    <Badge
      className={cn(
        lane === "needs-action" &&
          "border-amber-500/40 bg-amber-500/10 text-amber-950 dark:text-amber-100",
        lane === "correction" &&
          "border-amber-500/40 bg-amber-500/10 text-amber-950 dark:text-amber-100"
      )}
      variant={lane === "approved" ? "secondary" : "outline"}
    >
      {laneDefinitions.find((definition) => definition.key === lane)?.title}
    </Badge>
  );
}

function EvidenceList({
  evidence,
}: {
  evidence: LenderPortalMilestoneQueueRow["evidence"];
}) {
  if (evidence.length === 0) {
    return (
      <p className="flex items-center gap-1.5 text-muted-foreground text-xs">
        <FileCheck2 className="size-3.5 shrink-0" /> No review evidence is
        recorded.
      </p>
    );
  }
  return (
    <div className="grid gap-1.5">
      {evidence.map((fact) => {
        const Icon = evidenceIcon(fact.kind);
        return (
          <p
            className="flex items-center gap-1.5 text-muted-foreground text-xs"
            key={`${fact.kind}-${fact.label}`}
          >
            <Icon className="size-3.5 shrink-0" /> {fact.label}
          </p>
        );
      })}
    </div>
  );
}

function queueLane(request: LenderPortalMilestoneQueueRow): MilestoneQueueLane {
  if (request.actionRequired) {
    return "needs-action";
  }
  if (request.state === "correction_required") {
    return "correction";
  }
  if (request.state === "completed") {
    return "approved";
  }
  return "waiting";
}

function queueSummary(request: LenderPortalMilestoneQueueRow) {
  if (request.targetAvailability === "unavailable") {
    return "This queue entry no longer matches the current Milestone review cycle.";
  }
  if (request.state === "correction_required") {
    return "Builder correction is required before this request can return to review.";
  }
  if (request.state === "completed") {
    return "The locked approval requirements are complete for this cycle.";
  }
  if (request.viewerActionState === "acted") {
    return "Your decision is recorded; another required approval is outstanding.";
  }
  if (request.viewerActionState === "ineligible") {
    return "This request is assigned, but your current role cannot decide it.";
  }
  return "Current-cycle evidence is ready for lender review.";
}

function formatPolicy(request: LenderPortalMilestoneQueueRow) {
  const groups = request.requiredGroups
    .map((group) => (group === "backoffice" ? "Back Office" : "lender"))
    .join(" + ");
  const requirements = [
    request.siteVisitRequired ? "Site Visit required" : null,
    request.receiptInvoiceRequired ? "receipts/invoices required" : null,
  ].filter(Boolean);
  if (!groups) {
    return "No reviewer group is required";
  }
  return requirements.length
    ? `${groups} · ${requirements.join(" · ")}`
    : groups;
}

function formatApproval(request: LenderPortalMilestoneQueueRow) {
  const groupProgress = `${request.approvedGroups.length} of ${request.requiredGroups.length} groups approved`;
  return request.lenderQuorum === null
    ? groupProgress
    : `${groupProgress} · lender ${request.lenderApprovalCount} of ${request.lenderQuorum}`;
}

function receiptCoveragePercent(request: LenderPortalMilestoneQueueRow) {
  if (
    request.receiptCoverageCents === null ||
    request.actualCostCents === null ||
    request.actualCostCents <= 0
  ) {
    return null;
  }
  return Math.min(
    100,
    Math.round((request.receiptCoverageCents / request.actualCostCents) * 100)
  );
}

function formatCad(value: number | null) {
  if (value === null) {
    return "Not recorded";
  }
  return new Intl.NumberFormat("en-CA", {
    currency: "CAD",
    maximumFractionDigits: 0,
    style: "currency",
  }).format(value / 100);
}

function formatDateRange(start: string | null, end: string | null) {
  if (!(start || end)) {
    return "Not recorded";
  }
  if (!(start && end)) {
    const availableDate = start ?? end;
    return availableDate ? formatDate(availableDate) : "Not recorded";
  }
  return `${formatDate(start)} – ${formatDate(end)}`;
}

function formatDate(value: string) {
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.getTime())
    ? "Not recorded"
    : new Intl.DateTimeFormat("en-CA", {
        day: "numeric",
        month: "short",
        timeZone: "UTC",
      }).format(date);
}

function evidenceIcon(
  kind: LenderPortalMilestoneQueueRow["evidence"][number]["kind"]
) {
  if (kind === "site_visit") {
    return MapPinCheck;
  }
  if (kind === "cost_document" || kind === "cost_document_page") {
    return ReceiptText;
  }
  return FileCheck2;
}
