import { usePaginatedQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import {
  ArrowUpRight,
  Banknote,
  Building2,
  Check,
  ChevronRight,
  CircleDot,
  FileCheck2,
  Files,
  History,
  Loader2,
  MapPinCheck,
  RotateCcw,
  ShieldCheck,
  Users,
} from "lucide-react";
import { type ComponentType, useState } from "react";

import { api } from "../../../convex/_generated/api";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Card, CardContent } from "../../components/ui/card";
import { Frame, FramePanel } from "../../components/ui/frame";
import { cn } from "../../lib/utils";

export type LenderDrawQueueRow = FunctionReturnType<
  typeof api.lender_portal.getLenderDrawQueue
>["page"][number];

type QueueScope = "action" | "all";
type DrawQueueState = "needs-action" | "waiting" | "correction" | "approved";
interface ApprovalGroup {
  label: string;
  progress: string;
  state: "approved" | "outstanding" | "reset";
}
interface EvidenceFact {
  kind:
    | "decision-cycle"
    | "evidence-package"
    | "evidence-retained"
    | "location";
  label: string;
  tone?: "success" | "warning";
}
type DrawReviewCycle = NonNullable<LenderDrawQueueRow["reviewCycle"]>;

export interface LenderDrawQueueProps {
  onOpenBuild: (buildId: LenderDrawQueueRow["buildId"]) => void;
  onOpenReview: (row: LenderDrawQueueRow) => void;
}

const currencyFormatter = new Intl.NumberFormat("en-CA", {
  currency: "CAD",
  maximumFractionDigits: 0,
  style: "currency",
});

const submittedAtFormatter = new Intl.DateTimeFormat("en-CA", {
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
  month: "short",
  timeZoneName: "short",
  year: "numeric",
});

export function LenderDrawQueue({
  onOpenBuild,
  onOpenReview,
}: LenderDrawQueueProps) {
  const [scope, setScope] = useState<QueueScope>("action");
  const { loadMore, results, status } = usePaginatedQuery(
    api.lender_portal.getLenderDrawQueue,
    { scope },
    { initialNumItems: 20 }
  );

  if (status === "LoadingFirstPage") {
    return <LenderDrawQueueLoading />;
  }

  const visibleRows = results as LenderDrawQueueRow[];

  return (
    <div className="min-h-[calc(100vh-3.5rem)] bg-muted/30">
      <main className="mx-auto min-w-0 max-w-[1560px] p-4">
        <QueueHeader
          loadedCount={visibleRows.length}
          scope={scope}
          setScope={setScope}
        />
        <p aria-live="polite" className="sr-only">
          {visibleRows.length} Draw request
          {visibleRows.length === 1 ? "" : "s"} loaded in the selected scope.
        </p>
        {visibleRows.length > 0 ? (
          <BuildPackets
            onOpenBuild={onOpenBuild}
            onOpenReview={onOpenReview}
            requests={visibleRows}
          />
        ) : (
          <EmptyQueueState scope={scope} />
        )}
        {status === "CanLoadMore" || status === "LoadingMore" ? (
          <div className="mt-5 flex justify-center">
            <Button
              disabled={status === "LoadingMore"}
              onClick={() => loadMore(20)}
              variant="outline"
            >
              {status === "LoadingMore" ? (
                <Loader2
                  aria-hidden="true"
                  className="animate-spin motion-reduce:animate-none"
                />
              ) : null}
              {status === "LoadingMore" ? "Loading requests…" : "Load more"}
            </Button>
          </div>
        ) : null}
      </main>
    </div>
  );
}

function QueueHeader({
  loadedCount,
  scope,
  setScope,
}: {
  loadedCount: number;
  scope: QueueScope;
  setScope: (scope: QueueScope) => void;
}) {
  return (
    <header className="mb-5 flex flex-col justify-between gap-4 border-b pb-5 lg:flex-row lg:items-end">
      <div>
        <p className="font-semibold text-muted-foreground text-xs uppercase tracking-wide">
          Assigned Draw requests
        </p>
        <h1 className="mt-1 font-semibold text-2xl tracking-tight sm:text-3xl">
          Draw queue
        </h1>
        <p className="mt-1 max-w-3xl text-muted-foreground text-sm leading-6">
          Scan request status, peer approval progress, current-cycle evidence,
          and pooled funding before opening a Draw review.
        </p>
      </div>
      <fieldset
        aria-label="Draw queue scope"
        className="flex w-fit rounded-lg border bg-background p-1"
      >
        <Button
          aria-pressed={scope === "action"}
          onClick={() => setScope("action")}
          size="sm"
          variant={scope === "action" ? "default" : "ghost"}
        >
          Needs my action
          {scope === "action" ? (
            <Badge className="tabular-nums" variant="secondary">
              {loadedCount} loaded
            </Badge>
          ) : null}
        </Button>
        <Button
          aria-pressed={scope === "all"}
          onClick={() => setScope("all")}
          size="sm"
          variant={scope === "all" ? "default" : "ghost"}
        >
          All assigned
          {scope === "all" ? (
            <Badge className="tabular-nums" variant="secondary">
              {loadedCount} loaded
            </Badge>
          ) : null}
        </Button>
      </fieldset>
    </header>
  );
}

function BuildPackets({
  onOpenBuild,
  onOpenReview,
  requests,
}: {
  onOpenBuild: LenderDrawQueueProps["onOpenBuild"];
  onOpenReview: LenderDrawQueueProps["onOpenReview"];
  requests: readonly LenderDrawQueueRow[];
}) {
  const grouped = requests.reduce<Map<string, LenderDrawQueueRow[]>>(
    (groups, request) => {
      const key = String(request.buildId);
      const buildRequests = groups.get(key) ?? [];
      buildRequests.push(request);
      groups.set(key, buildRequests);
      return groups;
    },
    new Map()
  );

  return (
    <Frame>
      <FramePanel className="flex flex-col justify-between gap-3 py-4 lg:flex-row lg:items-center">
        <div>
          <h2 className="font-semibold text-sm">Build packets</h2>
          <p className="mt-1 text-muted-foreground text-xs">
            Assigned Draw requests grouped by Build.
          </p>
        </div>
        <div className="flex items-center gap-2 text-muted-foreground text-xs">
          <Building2 aria-hidden="true" className="size-4" /> {grouped.size}{" "}
          Build{grouped.size === 1 ? "" : "s"}
        </div>
      </FramePanel>

      {[...grouped.values()].map((buildRequests) => {
        const build = buildRequests[0];
        if (!build) {
          return null;
        }
        return (
          <FramePanel className="p-0" key={String(build.buildId)}>
            <header className="flex flex-col justify-between gap-3 border-b px-5 py-4 md:flex-row md:items-center">
              <div>
                <h3 className="flex min-w-0 items-center gap-2 break-words font-semibold text-sm">
                  <Building2 aria-hidden="true" className="size-4" />
                  {build.buildName}
                </h3>
                <p className="mt-1 text-muted-foreground text-xs">
                  {build.builderName} · {build.location}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="outline">
                  {buildRequests.length} request
                  {buildRequests.length === 1 ? "" : "s"}
                </Badge>
                <Button
                  onClick={() => onOpenBuild(build.buildId)}
                  size="sm"
                  variant="ghost"
                >
                  Build overview{" "}
                  <ChevronRight aria-hidden="true" className="size-4" />
                </Button>
              </div>
            </header>
            <div className="grid gap-3 p-3 xl:grid-cols-2">
              {buildRequests.map((request) => (
                <DrawPacket
                  key={String(request.drawRequestId)}
                  onOpenReview={onOpenReview}
                  request={request}
                />
              ))}
            </div>
          </FramePanel>
        );
      })}
    </Frame>
  );
}

function DrawPacket({
  onOpenReview,
  request,
}: {
  onOpenReview: LenderDrawQueueProps["onOpenReview"];
  request: LenderDrawQueueRow;
}) {
  const state = queueState(request);
  const canOpenReview =
    request.currentReviewCycleId !== null &&
    request.currentReviewCycleNumber !== null;

  return (
    <Card>
      <CardContent className="grid gap-4 p-4 lg:grid-cols-[minmax(0,0.8fr)_minmax(280px,1.2fr)]">
        <div className="flex min-w-0 flex-col">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-muted-foreground text-xs">{request.displayId}</p>
            <Badge variant="outline">
              {request.currentReviewCycleNumber === null
                ? "Current cycle unavailable"
                : `Cycle ${request.currentReviewCycleNumber}`}
            </Badge>
          </div>
          <h4 className="mt-1 break-words font-semibold text-sm">
            {request.label}
          </h4>
          <p className="mt-2 whitespace-nowrap font-semibold text-lg tabular-nums">
            {formatCents(request.amountCents)}
          </p>
          <p className="mt-2 text-muted-foreground text-xs leading-5">
            {request.note ?? "No Builder request note was submitted."}
          </p>
          <p className="mt-3 break-all font-mono text-muted-foreground text-xs">
            {request.workOrderKey ?? "Work Order unavailable"}
          </p>
          <div className="mt-auto pt-5">
            <DecisionStateSignal label={stateLabel(state)} state={state} />
          </div>
        </div>
        <div className="grid gap-3 border-t pt-4 lg:border-t-0 lg:border-l lg:pt-0 lg:pl-4">
          <div>
            <p className="font-semibold text-muted-foreground text-xs uppercase tracking-wide">
              {approvalPolicyLabel(request)}
            </p>
            <div className="mt-2">
              <ApprovalGroups groups={approvalGroups(request)} />
            </div>
          </div>
          <EvidenceList evidence={evidenceFacts(request)} />
          <FundingPosition request={request} />
          <p className="text-muted-foreground text-xs">
            Submitted {formatSubmittedAt(request.requestedAt)}
          </p>
          <Button
            className="w-full"
            disabled={!canOpenReview}
            onClick={() => onOpenReview(request)}
            size="sm"
            variant="outline"
          >
            {canOpenReview ? "Review Draw" : "Review unavailable"}
            {canOpenReview ? (
              <ArrowUpRight aria-hidden="true" className="size-3.5" />
            ) : null}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function ApprovalGroups({ groups }: { groups: readonly ApprovalGroup[] }) {
  if (groups.length === 0) {
    return (
      <p className="text-muted-foreground text-xs">
        Current approval policy unavailable.
      </p>
    );
  }

  return (
    <div className="grid gap-2">
      {groups.map((group) => (
        <div
          className={cn(
            "flex min-w-0 items-center justify-between gap-2 rounded-lg border px-3 py-2",
            group.state === "approved" &&
              "border-emerald-500/30 bg-emerald-500/10",
            group.state === "outstanding" &&
              "border-amber-500/30 bg-amber-500/10",
            group.state === "reset" && "border-dashed bg-muted/40"
          )}
          key={group.label}
        >
          <span className="flex min-w-0 items-center gap-1.5 font-medium text-xs">
            {group.label === "Back Office" ? (
              <ShieldCheck aria-hidden="true" className="size-3.5 shrink-0" />
            ) : (
              <Users aria-hidden="true" className="size-3.5 shrink-0" />
            )}
            <span className="truncate">{group.label}</span>
          </span>
          <span className="shrink-0 font-semibold text-xs">
            {group.progress}
          </span>
        </div>
      ))}
    </div>
  );
}

function FundingPosition({ request }: { request: LenderDrawQueueRow }) {
  const rows = [
    [
      "Available before",
      formatCents(request.fundingPosition.availableBeforeCents),
    ],
    ["This request", formatCents(request.amountCents)],
    [
      "Remaining after",
      formatCents(request.fundingPosition.remainingAfterCents),
    ],
  ] as const;

  return (
    <div className="grid gap-2">
      <p className="flex items-center gap-1.5 font-semibold text-xs">
        <Banknote aria-hidden="true" className="size-3.5" /> Pooled funding
        position
      </p>
      {rows.map(([label, value]) => (
        <div
          className="flex items-center justify-between gap-3 text-xs"
          key={label}
        >
          <span className="text-muted-foreground">{label}</span>
          <span className="font-semibold tabular-nums">{value}</span>
        </div>
      ))}
      {request.fundingPosition.reconciled ? null : (
        <p className="text-amber-800 text-xs dark:text-amber-200">
          Funding position requires reconciliation.
        </p>
      )}
    </div>
  );
}

function EvidenceList({ evidence }: { evidence: readonly EvidenceFact[] }) {
  const evidenceIcons = {
    "decision-cycle": History,
    "evidence-package": FileCheck2,
    "evidence-retained": Files,
    location: MapPinCheck,
  } satisfies Record<
    EvidenceFact["kind"],
    ComponentType<{ className?: string }>
  >;

  return (
    <section
      aria-label="Current-cycle evidence provenance"
      className="grid gap-1.5"
    >
      {evidence.map((fact) => {
        const Icon = evidenceIcons[fact.kind];
        return (
          <p
            className={cn(
              "flex items-center gap-1.5 text-muted-foreground text-xs",
              fact.tone === "success" &&
                "text-emerald-700 dark:text-emerald-300",
              fact.tone === "warning" && "text-amber-800 dark:text-amber-200"
            )}
            key={`${fact.kind}:${fact.label}`}
          >
            <Icon aria-hidden="true" className="size-3.5 shrink-0" />
            {fact.label}
          </p>
        );
      })}
    </section>
  );
}

const decisionStateSignals = {
  "needs-action": {
    cue: "Your lender decision is required",
    icon: CircleDot,
    iconClassName: "bg-primary text-primary-foreground",
    signalClassName: "border-l-primary bg-primary/10",
  },
  approved: {
    cue: "All required approvals are complete",
    icon: Check,
    iconClassName: "bg-emerald-500 text-emerald-950",
    signalClassName: "border-l-emerald-500 bg-emerald-500/10",
  },
  correction: {
    cue: "Builder correction is in progress",
    icon: RotateCcw,
    iconClassName: "bg-amber-500 text-amber-950",
    signalClassName: "border-l-amber-500 bg-amber-500/10",
  },
  waiting: {
    cue: "Another required group remains",
    icon: Users,
    iconClassName: "bg-sky-500 text-white",
    signalClassName: "border-l-sky-500 bg-sky-500/10",
  },
} satisfies Record<
  DrawQueueState,
  {
    cue: string;
    icon: ComponentType<{ className?: string }>;
    iconClassName: string;
    signalClassName: string;
  }
>;

function DecisionStateSignal({
  label,
  state,
}: {
  label: string;
  state: DrawQueueState;
}) {
  const signal = decisionStateSignals[state];
  const Icon = signal.icon;

  return (
    <div className={cn("border-l-4 px-3 py-3", signal.signalClassName)}>
      <div className="flex items-center gap-3">
        <span
          aria-hidden="true"
          className={cn(
            "grid size-9 shrink-0 place-items-center rounded-lg shadow-sm",
            signal.iconClassName
          )}
        >
          <Icon className="size-5" />
        </span>
        <span className="min-w-0">
          <span className="block font-semibold text-sm">{label}</span>
          <span className="mt-0.5 block text-muted-foreground text-xs leading-4">
            {signal.cue}
          </span>
        </span>
      </div>
    </div>
  );
}

function queueState(request: LenderDrawQueueRow): DrawQueueState {
  if (
    request.status === "rejected" ||
    request.reviewCycle?.state === "correction_required"
  ) {
    return "correction";
  }
  if (
    request.status === "approved" ||
    request.status === "approved_for_release" ||
    request.status === "released" ||
    request.reviewCycle?.state === "completed"
  ) {
    return "approved";
  }
  return request.actionRequired ? "needs-action" : "waiting";
}

function stateLabel(state: DrawQueueState) {
  if (state === "needs-action") {
    return "Needs my action";
  }
  if (state === "correction") {
    return "Correction required";
  }
  if (state === "approved") {
    return "Approved";
  }
  return "Waiting";
}

function approvalPolicyLabel(request: LenderDrawQueueRow) {
  const groups = request.reviewCycle?.requiredGroups ?? [];
  if (groups.includes("backoffice") && groups.includes("lender")) {
    return "Back Office + lender quorum";
  }
  if (groups.includes("backoffice")) {
    return "Back Office approval";
  }
  if (groups.includes("lender")) {
    return "Lender quorum";
  }
  return "Approval policy unavailable";
}

function approvalGroups(request: LenderDrawQueueRow): ApprovalGroup[] {
  const cycle = request.reviewCycle;
  if (!cycle) {
    return [];
  }
  const reset = cycle.state === "correction_required";
  return cycle.requiredGroups.map((group) =>
    group === "backoffice"
      ? backofficeApprovalGroup(cycle, reset)
      : lenderApprovalGroup(cycle, reset)
  );
}

function backofficeApprovalGroup(
  cycle: DrawReviewCycle,
  reset: boolean
): ApprovalGroup {
  const approved = cycle.approvedGroups.includes("backoffice");
  return {
    label: "Back Office",
    progress: reset ? "Reset" : approved ? "Approved" : "Outstanding",
    state: reset ? "reset" : approved ? "approved" : "outstanding",
  };
}

function lenderApprovalGroup(
  cycle: DrawReviewCycle,
  reset: boolean
): ApprovalGroup {
  const quorum = cycle.lenderQuorum;
  const approved =
    cycle.approvedGroups.includes("lender") ||
    (quorum !== null && cycle.lenderApprovalCount >= quorum);
  return {
    label: "Lender",
    progress: reset
      ? "Reset"
      : quorum === null
        ? "Quorum unavailable"
        : `${cycle.lenderApprovalCount} of ${quorum}`,
    state: reset ? "reset" : approved ? "approved" : "outstanding",
  };
}

function evidenceFacts(request: LenderDrawQueueRow): EvidenceFact[] {
  const cycle = request.reviewCycle;
  if (!cycle) {
    return [
      {
        kind: "decision-cycle",
        label: "Current decision cycle unavailable",
        tone: "warning",
      },
    ];
  }
  const facts: EvidenceFact[] = [
    {
      kind: "decision-cycle",
      label: `Cycle ${request.currentReviewCycleNumber} evidence snapshot`,
    },
    {
      kind: "evidence-retained",
      label:
        cycle.evidenceReferenceCount === 0
          ? "No current-cycle evidence linked"
          : `${cycle.evidenceReferenceCount} current-cycle evidence reference${cycle.evidenceReferenceCount === 1 ? "" : "s"}`,
      tone: cycle.evidenceReferenceCount === 0 ? "warning" : undefined,
    },
    {
      kind: "evidence-package",
      label: `${cycle.evidencePackageRevisionCount} retained Evidence Package revision${cycle.evidencePackageRevisionCount === 1 ? "" : "s"}`,
    },
  ];
  if (cycle.locationReferenceCount > 0) {
    facts.push({
      kind: "location",
      label: `${cycle.locationVerifiedCount} of ${cycle.locationReferenceCount} linked assets location-verified`,
      tone:
        cycle.locationVerifiedCount === cycle.locationReferenceCount
          ? "success"
          : "warning",
    });
  }
  return facts;
}

function formatCents(cents: number) {
  return currencyFormatter.format(cents / 100);
}

function formatSubmittedAt(value: string) {
  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp)
    ? value
    : submittedAtFormatter.format(timestamp);
}

function EmptyQueueState({ scope }: { scope: QueueScope }) {
  return (
    <Frame>
      <FramePanel className="p-8 text-center text-muted-foreground text-sm">
        {scope === "action"
          ? "No assigned Draw requests need your action."
          : "No assigned Draw requests are available."}
      </FramePanel>
    </Frame>
  );
}

function LenderDrawQueueLoading() {
  return (
    <main className="mx-auto min-w-0 max-w-[1560px] p-4">
      <Frame>
        <FramePanel
          aria-live="polite"
          className="flex items-center gap-3 p-5"
          role="status"
        >
          <Loader2
            aria-hidden="true"
            className="size-4 animate-spin motion-reduce:animate-none"
          />
          Loading assigned Draw requests…
        </FramePanel>
      </Frame>
    </main>
  );
}
