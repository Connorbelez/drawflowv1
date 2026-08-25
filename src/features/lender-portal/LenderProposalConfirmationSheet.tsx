import type { FunctionReturnType } from "convex/server";
import {
  Banknote,
  Building2,
  CalendarRange,
  CheckCircle2,
  ChevronDown,
  ClipboardCheck,
  History,
  LockKeyhole,
  Milestone,
  ShieldCheck,
  TriangleAlert,
} from "lucide-react";
import { type ComponentType, useState } from "react";

import { Alert, AlertDescription, AlertTitle } from "#/components/ui/alert.tsx";
import { Badge } from "#/components/ui/badge.tsx";
import { Button } from "#/components/ui/button.tsx";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "#/components/ui/card.tsx";
import { Checkbox } from "#/components/ui/checkbox.tsx";
import {
  Collapsible,
  CollapsiblePanel,
  CollapsibleTrigger,
} from "#/components/ui/collapsible.tsx";
import { Frame, FramePanel } from "#/components/ui/frame.tsx";
import {
  NativeSelect,
  NativeSelectOption,
} from "#/components/ui/native-select.tsx";
import { Progress } from "#/components/ui/progress.tsx";
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
import { Textarea } from "#/components/ui/textarea.tsx";
import {
  ToggleGroup,
  ToggleGroupItem,
} from "#/components/ui/toggle-group.tsx";
import { cn } from "#/lib/utils.ts";
import type { api } from "../../../convex/_generated/api";

export const PROPOSAL_CONFIRMATION_CHECKPOINTS = [
  ["milestoneCount", "Milestone count", Milestone],
  ["budget", "Budget", Banknote],
  ["scheduleTimeline", "Schedule and timeline", CalendarRange],
  ["builder", "Builder", Building2],
  ["accessReviewPolicy", "Access and review policy", ShieldCheck],
] as const;

const CHECKPOINTS = PROPOSAL_CONFIRMATION_CHECKPOINTS;

export type ProposalConfirmationCheckpoint = (typeof CHECKPOINTS)[number][0];

type LenderProposalConfirmation = FunctionReturnType<
  typeof api.production_proposals.getLenderProposalConfirmation
>;
type ConfirmationCycle = NonNullable<
  LenderProposalConfirmation["currentCycle"]
>;
type CheckpointSnapshot = ConfirmationCycle["checkpoints"];

export interface ProposalReviewFact {
  label: string;
  value: string;
}

export function LenderProposalConfirmationSheet({
  buildName,
  confirmation,
  error,
  onAcknowledge,
  onApprove,
  onDecline,
  onLoadMoreHistory,
  onOpenChange,
  open,
  pending,
  viewerWorkosUserId,
}: {
  buildName: string;
  confirmation: LenderProposalConfirmation;
  error?: string;
  onAcknowledge: (checkpoint: ProposalConfirmationCheckpoint) => Promise<void>;
  onApprove: (reason: string) => Promise<void>;
  onDecline: (
    checkpoint: ProposalConfirmationCheckpoint,
    reason: string
  ) => Promise<void>;
  onLoadMoreHistory?: () => void;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  pending: boolean;
  viewerWorkosUserId: string;
}) {
  const cycle = confirmation.currentCycle;
  const [decisionMode, setDecisionMode] = useState<"confirm" | "decline">(
    "confirm"
  );
  const [expandedCheckpoint, setExpandedCheckpoint] =
    useState<ProposalConfirmationCheckpoint | null>(null);
  const [reason, setReason] = useState("");
  const [declinedCheckpoint, setDeclinedCheckpoint] =
    useState<ProposalConfirmationCheckpoint>("milestoneCount");

  if (!cycle) {
    return null;
  }

  const actorAcknowledgements = cycle.acknowledgements.filter(
    (item) => item.acknowledgedByWorkosUserId === viewerWorkosUserId
  );
  const acknowledged = new Set(
    actorAcknowledgements.map((item) => item.checkpoint)
  );
  const priorCycle = confirmation.history.page.find(
    (item) => item.proposalRevisionNumber < cycle.proposalRevisionNumber
  );
  const isPendingCycle = cycle.status === "pending";
  const remaining = CHECKPOINTS.length - acknowledged.size;

  return (
    <Sheet onOpenChange={onOpenChange} open={open}>
      <SheetPopup className="sm:max-w-[760px]">
        <SheetHeader className="border-b">
          <div className="flex flex-wrap items-center gap-2 pr-10">
            <Badge variant={isPendingCycle ? "default" : "secondary"}>
              {isPendingCycle ? "Confirmation required" : cycle.status}
            </Badge>
            <Badge variant="outline">
              Revision {cycle.proposalRevisionNumber}
            </Badge>
            <Badge variant="secondary">Review cycle {cycle.cycleNumber}</Badge>
          </div>
          <SheetTitle>Lender proposal confirmation</SheetTitle>
          <SheetDescription>
            {buildName} · acknowledgement and decisions are saved to the current
            immutable revision.
          </SheetDescription>
          <div className="flex items-center gap-3 pt-2">
            <Progress
              aria-label="Lender acknowledgement progress"
              className="flex-1"
              value={(acknowledged.size / CHECKPOINTS.length) * 100}
            />
            <p className="shrink-0 font-semibold text-xs">
              {acknowledged.size} of {CHECKPOINTS.length} acknowledged
            </p>
          </div>
        </SheetHeader>

        <SheetPanel className="space-y-4">
          <Alert>
            <ClipboardCheck aria-hidden />
            <AlertTitle>Review the complete current revision</AlertTitle>
            <AlertDescription>
              Review each checkpoint. Acknowledgements are recorded on the
              current revision. Changed badges come from the immutable server
              revision diff, not from browser comparison.
            </AlertDescription>
          </Alert>

          {error ? (
            <Alert variant="destructive">
              <TriangleAlert aria-hidden />
              <AlertTitle>Unable to save lender confirmation</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}

          <ConfirmationCheckpointList
            acknowledged={acknowledged}
            actorAcknowledgements={actorAcknowledgements}
            canAcknowledge={confirmation.canAcknowledge}
            cycle={cycle}
            expandedCheckpoint={expandedCheckpoint}
            onAcknowledge={onAcknowledge}
            onExpandedCheckpointChange={setExpandedCheckpoint}
            pending={pending}
            priorCycle={priorCycle}
          />

          <ConfirmationHistory
            canLoadMore={!confirmation.history.isDone}
            history={confirmation.history.page}
            onLoadMore={onLoadMoreHistory}
          />

          <LenderDecisionCard
            canDecide={confirmation.canDecide}
            cycle={cycle}
            decisionAuthorized={confirmation.decisionAuthorized}
            decisionMode={decisionMode}
            declinedCheckpoint={declinedCheckpoint}
            onApprove={onApprove}
            onDecisionModeChange={setDecisionMode}
            onDecline={onDecline}
            onDeclinedCheckpointChange={setDeclinedCheckpoint}
            onReasonChange={setReason}
            pending={pending}
            reason={reason}
            remaining={remaining}
          />
        </SheetPanel>

        <SheetFooter>
          <p className="mr-auto text-muted-foreground text-xs">
            Exact cycle {cycle.cycleNumber} · Revision{" "}
            {cycle.proposalRevisionNumber}
          </p>
          <Button onClick={() => onOpenChange(false)} variant="outline">
            Return to proposal packet
          </Button>
        </SheetFooter>
      </SheetPopup>
    </Sheet>
  );
}

function ConfirmationCheckpointList({
  acknowledged,
  actorAcknowledgements,
  canAcknowledge,
  cycle,
  expandedCheckpoint,
  onAcknowledge,
  onExpandedCheckpointChange,
  pending,
  priorCycle,
}: {
  acknowledged: Set<ProposalConfirmationCheckpoint>;
  actorAcknowledgements: ConfirmationCycle["acknowledgements"];
  canAcknowledge: boolean;
  cycle: ConfirmationCycle;
  expandedCheckpoint: ProposalConfirmationCheckpoint | null;
  onAcknowledge: (checkpoint: ProposalConfirmationCheckpoint) => Promise<void>;
  onExpandedCheckpointChange: (
    checkpoint: ProposalConfirmationCheckpoint | null
  ) => void;
  pending: boolean;
  priorCycle?: ConfirmationCycle;
}) {
  return CHECKPOINTS.map(([checkpoint, label, Icon], index) => (
    <CheckpointReviewCard
      acknowledged={acknowledged.has(checkpoint)}
      changed={cycle.changedCheckpoints.includes(checkpoint)}
      checkpoint={checkpoint}
      currentFacts={proposalCheckpointFacts(cycle.checkpoints, checkpoint)}
      expanded={expandedCheckpoint === checkpoint}
      icon={Icon}
      index={index}
      key={checkpoint}
      label={label}
      latestAcknowledgement={actorAcknowledgements.find(
        (item) => item.checkpoint === checkpoint
      )}
      onAcknowledge={() => onAcknowledge(checkpoint)}
      onToggle={() =>
        onExpandedCheckpointChange(
          expandedCheckpoint === checkpoint ? null : checkpoint
        )
      }
      pending={pending}
      previousFacts={
        priorCycle
          ? proposalCheckpointFacts(priorCycle.checkpoints, checkpoint)
          : undefined
      }
      readOnly={!(cycle.status === "pending" && canAcknowledge)}
    />
  ));
}

function ConfirmationHistory({
  canLoadMore,
  history,
  onLoadMore,
}: {
  canLoadMore: boolean;
  history: LenderProposalConfirmation["history"]["page"];
  onLoadMore?: () => void;
}) {
  return (
    <Card>
      <CardHeader className="border-b py-4">
        <CardTitle className="flex items-center gap-2 text-sm">
          <History aria-hidden className="size-4" /> Confirmation history
        </CardTitle>
        <p className="text-muted-foreground text-xs">
          Immutable revision cycles and their final state.
        </p>
      </CardHeader>
      <CardContent className="py-4">
        <ol className="grid gap-3">
          {history.map((item) => (
            <li
              className="grid gap-1 border-b pb-3 last:border-0 last:pb-0 sm:grid-cols-[1fr_auto] sm:items-center"
              key={item.confirmationCycleId}
            >
              <div>
                <p className="font-semibold text-xs">
                  Cycle {item.cycleNumber} · Revision{" "}
                  {item.proposalRevisionNumber}
                </p>
                <p className="mt-1 text-muted-foreground text-xs">
                  Opened {formatDateTime(item.openedAt)}
                </p>
              </div>
              <Badge
                variant={item.status === "pending" ? "default" : "outline"}
              >
                {item.status}
              </Badge>
            </li>
          ))}
        </ol>
        {canLoadMore && onLoadMore ? (
          <Button className="mt-4" onClick={onLoadMore} variant="outline">
            Load older cycles
          </Button>
        ) : null}
      </CardContent>
    </Card>
  );
}

function LenderDecisionCard({
  canDecide,
  cycle,
  decisionAuthorized,
  decisionMode,
  declinedCheckpoint,
  onApprove,
  onDecisionModeChange,
  onDecline,
  onDeclinedCheckpointChange,
  onReasonChange,
  pending,
  reason,
  remaining,
}: {
  canDecide: boolean;
  cycle: ConfirmationCycle;
  decisionAuthorized: boolean;
  decisionMode: "confirm" | "decline";
  declinedCheckpoint: ProposalConfirmationCheckpoint;
  onApprove: (reason: string) => Promise<void>;
  onDecisionModeChange: (mode: "confirm" | "decline") => void;
  onDecline: (
    checkpoint: ProposalConfirmationCheckpoint,
    reason: string
  ) => Promise<void>;
  onDeclinedCheckpointChange: (
    checkpoint: ProposalConfirmationCheckpoint
  ) => void;
  onReasonChange: (reason: string) => void;
  pending: boolean;
  reason: string;
  remaining: number;
}) {
  return (
    <Card>
      <CardHeader className="border-b py-4">
        <CardTitle className="text-sm">Lender decision</CardTitle>
        <p className="text-muted-foreground text-xs">
          {decisionAuthorized
            ? "Approval unlocks only after your five acknowledgements. A revision request requires a private reason and checkpoint."
            : "Review and acknowledge each checkpoint. Final decisions require a lender or lender administrator."}
        </p>
      </CardHeader>
      <CardContent className="space-y-4 py-4">
        {cycle.status === "pending" ? (
          decisionAuthorized ? (
            <PendingLenderDecision
              canDecide={canDecide}
              decisionMode={decisionMode}
              declinedCheckpoint={declinedCheckpoint}
              onApprove={onApprove}
              onDecisionModeChange={onDecisionModeChange}
              onDecline={onDecline}
              onDeclinedCheckpointChange={onDeclinedCheckpointChange}
              onReasonChange={onReasonChange}
              pending={pending}
              reason={reason}
              remaining={remaining}
              revisionNumber={cycle.proposalRevisionNumber}
            />
          ) : (
            <Alert>
              <LockKeyhole aria-hidden />
              <AlertTitle>Acknowledgement access only</AlertTitle>
              <AlertDescription>
                Lender staff can review and acknowledge every checkpoint. A
                lender or lender administrator must approve or request a
                revision.
              </AlertDescription>
            </Alert>
          )
        ) : (
          <Alert>
            <LockKeyhole aria-hidden />
            <AlertTitle>This cycle is read-only</AlertTitle>
            <AlertDescription>
              The recorded {cycle.status} decision cannot be changed.
            </AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  );
}

function PendingLenderDecision({
  canDecide,
  decisionMode,
  declinedCheckpoint,
  onApprove,
  onDecisionModeChange,
  onDecline,
  onDeclinedCheckpointChange,
  onReasonChange,
  pending,
  reason,
  remaining,
  revisionNumber,
}: {
  canDecide: boolean;
  decisionMode: "confirm" | "decline";
  declinedCheckpoint: ProposalConfirmationCheckpoint;
  onApprove: (reason: string) => Promise<void>;
  onDecisionModeChange: (mode: "confirm" | "decline") => void;
  onDecline: (
    checkpoint: ProposalConfirmationCheckpoint,
    reason: string
  ) => Promise<void>;
  onDeclinedCheckpointChange: (
    checkpoint: ProposalConfirmationCheckpoint
  ) => void;
  onReasonChange: (reason: string) => void;
  pending: boolean;
  reason: string;
  remaining: number;
  revisionNumber: number;
}) {
  const followThroughId = "lender-decision-follow-through";
  const confirmMode = decisionMode === "confirm";

  const submitDecision = () => {
    const action =
      decisionMode === "confirm"
        ? onApprove(reason.trim())
        : onDecline(declinedCheckpoint, reason.trim());
    action.catch(() => undefined);
  };
  return (
    <>
      <div className="grid gap-2">
        <p className="font-medium text-sm" id="lender-decision-type-label">
          Decision type
        </p>
        <ToggleGroup
          aria-controls={followThroughId}
          aria-labelledby="lender-decision-type-label"
          className="grid w-full grid-cols-2"
          onValueChange={(value) => {
            const next = value.at(-1);
            if (next === "confirm" || next === "decline") {
              onDecisionModeChange(next);
            }
          }}
          value={[decisionMode]}
          variant="outline"
        >
          <ToggleGroupItem aria-controls={followThroughId} value="confirm">
            Confirm
          </ToggleGroupItem>
          <ToggleGroupItem aria-controls={followThroughId} value="decline">
            Request revision
          </ToggleGroupItem>
        </ToggleGroup>
      </div>
      <Frame>
        <FramePanel
          aria-live="polite"
          className="space-y-4 p-4"
          id={followThroughId}
        >
          {confirmMode ? (
            <ApprovalReadinessAlert
              canDecide={canDecide}
              remaining={remaining}
            />
          ) : (
            <NativeSelect
              aria-label="Checkpoint that requires revision"
              onChange={(event) =>
                onDeclinedCheckpointChange(
                  event.target.value as ProposalConfirmationCheckpoint
                )
              }
              value={declinedCheckpoint}
            >
              {CHECKPOINTS.map(([checkpoint, label]) => (
                <NativeSelectOption key={checkpoint} value={checkpoint}>
                  {label}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          )}
          <div className="grid gap-2">
            <label
              className="font-medium text-sm"
              htmlFor="lender-confirmation-decision-reason"
            >
              {confirmMode
                ? "Lender approval reason"
                : "Private revision request reason"}
            </label>
            <Textarea
              id="lender-confirmation-decision-reason"
              onChange={(event) => onReasonChange(event.target.value)}
              placeholder={
                confirmMode
                  ? "Required approval reason"
                  : "State what Back Office must correct"
              }
              value={reason}
            />
          </div>
          <Button
            className="w-full"
            disabled={pending || !reason.trim() || (confirmMode && !canDecide)}
            onClick={submitDecision}
            variant={confirmMode ? "default" : "destructive"}
          >
            {confirmMode
              ? `Approve Revision ${revisionNumber}`
              : `Request Revision ${revisionNumber + 1}`}
          </Button>
        </FramePanel>
      </Frame>
    </>
  );
}

function ApprovalReadinessAlert({
  canDecide,
  remaining,
}: {
  canDecide: boolean;
  remaining: number;
}) {
  return (
    <Alert>
      {canDecide ? <CheckCircle2 aria-hidden /> : <LockKeyhole aria-hidden />}
      <AlertTitle>
        {canDecide ? "Ready to approve" : "Acknowledgements incomplete"}
      </AlertTitle>
      <AlertDescription>
        {canDecide
          ? "All five acknowledgement records are present for this revision."
          : `${remaining} required checkpoint${remaining === 1 ? " remains" : "s remain"}.`}
      </AlertDescription>
    </Alert>
  );
}

function CheckpointReviewCard({
  acknowledged,
  changed,
  checkpoint,
  currentFacts,
  expanded,
  icon: Icon,
  index,
  label,
  latestAcknowledgement,
  onAcknowledge,
  onToggle,
  pending,
  previousFacts,
  readOnly,
}: {
  acknowledged: boolean;
  changed: boolean;
  checkpoint: ProposalConfirmationCheckpoint;
  currentFacts: ProposalReviewFact[];
  expanded: boolean;
  icon: ComponentType<{ className?: string }>;
  index: number;
  label: string;
  latestAcknowledgement?: ConfirmationCycle["acknowledgements"][number];
  onAcknowledge: () => Promise<void>;
  onToggle: () => void;
  pending: boolean;
  previousFacts?: ProposalReviewFact[];
  readOnly: boolean;
}) {
  const detailsId = `proposal-confirmation-${checkpoint}`;
  const acknowledgementId = `proposal-confirmation-ack-${checkpoint}`;
  const acknowledgementLocked = pending || readOnly || acknowledged;
  const changedLabels = checkpointChangedFactLabels(
    currentFacts,
    previousFacts
  );
  return (
    <Card className="overflow-hidden">
      <Collapsible
        onOpenChange={(open) => {
          if (open !== expanded) {
            onToggle();
          }
        }}
        open={expanded}
      >
        <h3 className="m-0 min-w-0 font-normal text-base leading-normal">
          <CollapsibleTrigger
            aria-controls={detailsId}
            aria-label={`${expanded ? "Collapse" : "Expand"} ${label} checkpoint`}
            render={
              <Button
                className="grid h-auto min-w-0 w-full shrink grid-cols-[auto_minmax(0,1fr)] items-start gap-x-3 gap-y-2 whitespace-normal rounded-none px-5 py-4 text-left hover:bg-muted/40 focus-visible:ring-inset focus-visible:ring-offset-0 sm:h-auto sm:grid-cols-[auto_minmax(0,1fr)_auto] [&_svg]:mx-0"
                variant="ghost"
              />
            }
          >
            <span className="flex size-8 shrink-0 items-center justify-center rounded-full border text-xs">
              {index + 1}
            </span>
            <span className="min-w-0">
              <span className="block text-pretty font-semibold text-sm">
                {label}
              </span>
              <span className="mt-1 flex items-center gap-1 text-muted-foreground text-xs">
                <Icon aria-hidden className="size-3 shrink-0" /> Required
                checkpoint
              </span>
            </span>
            <span className="col-start-2 flex min-w-0 flex-wrap items-center justify-end gap-2 sm:col-start-3">
              {acknowledged ? (
                <Badge variant="success">Acknowledged</Badge>
              ) : null}
              <Badge variant={changed ? "warning" : "outline"}>
                {changed ? "Changed" : "Unchanged"}
              </Badge>
              {checkpoint === "accessReviewPolicy" ? (
                <Badge variant="secondary">Read-only</Badge>
              ) : null}
              <ChevronDown
                aria-hidden
                className={cn(
                  "ml-0.5 size-4 shrink-0 text-muted-foreground transition-transform motion-reduce:transition-none",
                  expanded && "rotate-180"
                )}
              />
            </span>
          </CollapsibleTrigger>
        </h3>
        <CollapsiblePanel
          className="motion-reduce:transition-none"
          id={detailsId}
        >
          <CardContent className="border-t bg-muted/20 px-5 py-5">
            <div
              className={cn(
                "grid min-w-0 gap-3",
                previousFacts && "lg:grid-cols-2"
              )}
            >
              {previousFacts ? (
                <Frame className="min-w-0">
                  <FramePanel className="min-w-0 overflow-hidden p-3">
                    <ProposalCheckpointFacts
                      changedLabels={changedLabels}
                      facts={previousFacts}
                      label="Prior reviewed revision"
                      muted
                    />
                  </FramePanel>
                </Frame>
              ) : null}
              <Frame className="min-w-0">
                <FramePanel className="min-w-0 overflow-hidden p-3">
                  <ProposalCheckpointFacts
                    changedLabels={changedLabels}
                    facts={currentFacts}
                    label="Current revision"
                  />
                </FramePanel>
              </Frame>
            </div>
          </CardContent>
        </CollapsiblePanel>
      </Collapsible>

      <Separator />
      <CardContent className="px-5 py-4">
        <label
          className={cn(
            "flex min-h-10 items-start gap-3",
            acknowledgementLocked ? "cursor-not-allowed" : "cursor-pointer"
          )}
          htmlFor={acknowledgementId}
        >
          <Checkbox
            checked={acknowledged}
            disabled={acknowledgementLocked}
            id={acknowledgementId}
            onCheckedChange={(checked) => {
              if (checked === true) {
                onAcknowledge().catch(() => undefined);
              }
            }}
          />
          <span className="min-w-0 flex-1">
            <span className="font-semibold text-xs">
              I acknowledge the current {label.toLowerCase()} facts
            </span>
            <span className="mt-1 block text-muted-foreground text-xs">
              Acknowledgements are immutable audit records for this cycle.
            </span>
            {latestAcknowledgement ? (
              <span className="mt-2 block text-muted-foreground text-xs">
                Audit #{latestAcknowledgement.sequence} ·{" "}
                {formatDateTime(latestAcknowledgement.acknowledgedAt)}
              </span>
            ) : null}
          </span>
        </label>
      </CardContent>
    </Card>
  );
}

export function ProposalCheckpointFacts({
  changedLabels,
  facts,
  label,
  muted = false,
}: {
  changedLabels?: ReadonlySet<string>;
  facts: ProposalReviewFact[];
  label: string;
  muted?: boolean;
}) {
  return (
    <section
      aria-label={label}
      className={cn("min-w-0", muted && "text-muted-foreground")}
    >
      <p className="mb-2 font-semibold text-xs uppercase tracking-wide">
        {label}
      </p>
      <dl className="grid min-w-0 gap-3">
        {facts.map((fact) => {
          const isChanged = changedLabels?.has(fact.label) ?? false;
          return (
            <div className="min-w-0" key={fact.label}>
              <dt className="text-pretty text-muted-foreground text-xs">
                {fact.label}
              </dt>
              <dd
                className={cn(
                  "mt-1 min-w-0 font-medium text-xs tabular-nums [overflow-wrap:anywhere]",
                  isChanged && "text-warning-foreground"
                )}
              >
                {fact.value}
              </dd>
            </div>
          );
        })}
      </dl>
    </section>
  );
}

function checkpointChangedFactLabels(
  currentFacts: readonly ProposalReviewFact[],
  previousFacts?: readonly ProposalReviewFact[]
) {
  if (!previousFacts) {
    return undefined;
  }
  const previousByLabel = new Map(
    previousFacts.map((fact) => [fact.label, fact.value])
  );
  return new Set(
    currentFacts
      .filter((fact) => previousByLabel.get(fact.label) !== fact.value)
      .map((fact) => fact.label)
  );
}

export function proposalCheckpointFacts(
  snapshot: CheckpointSnapshot,
  checkpoint: ProposalConfirmationCheckpoint
): ProposalReviewFact[] {
  switch (checkpoint) {
    case "milestoneCount":
      return [
        { label: "Milestones", value: String(snapshot.milestoneCount.count) },
      ];
    case "budget":
      return [
        {
          label: "Total Budget",
          value: new Intl.NumberFormat("en-CA", {
            currency: "CAD",
            maximumFractionDigits: 0,
            style: "currency",
          }).format(snapshot.budget.totalBudgetCents / 100),
        },
      ];
    case "scheduleTimeline":
      return [
        {
          label: "Proposed start",
          value: snapshot.scheduleTimeline.proposedStartDate ?? "Not set",
        },
        {
          label: "Timeline range",
          value:
            snapshot.scheduleTimeline.timelineRangeMin === null ||
            snapshot.scheduleTimeline.timelineRangeMax === null
              ? "Not set"
              : `${snapshot.scheduleTimeline.timelineRangeMin}–${snapshot.scheduleTimeline.timelineRangeMax} days`,
        },
        {
          label: "Milestone schedule",
          value: snapshot.scheduleTimeline.milestonesFingerprint,
        },
      ];
    case "builder":
      return [{ label: "Builder", value: snapshot.builder.displayName }];
    case "accessReviewPolicy":
      return [
        {
          label: "Milestone approval",
          value: formatApprovalMode(
            snapshot.accessReviewPolicy.milestoneApprovalMode
          ),
        },
        {
          label: "Draw approval",
          value: formatApprovalMode(
            snapshot.accessReviewPolicy.drawApprovalMode
          ),
        },
        {
          label: "Site visit",
          value: snapshot.accessReviewPolicy.milestoneSiteVisitRequired
            ? "Required"
            : "Not required",
        },
        {
          label: "Receipt / invoice",
          value: snapshot.accessReviewPolicy.milestoneReceiptInvoiceRequired
            ? "Required"
            : "Not required",
        },
      ];
  }
}

function formatApprovalMode(
  value: "backoffice_only" | "both" | "lender_quorum"
) {
  if (value === "backoffice_only") {
    return "Back Office only";
  }
  if (value === "lender_quorum") {
    return "Lender quorum";
  }
  return "Back Office and lender";
}

function formatDateTime(value: number) {
  return new Intl.DateTimeFormat("en-CA", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}
