import {
  CalendarClock,
  Check,
  CircleDollarSign,
  ClipboardCheck,
  Clock3,
  Mail,
  Phone,
  RotateCcw,
} from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";

import {
  Accordion,
  AccordionItem,
  AccordionPanel,
  AccordionTrigger,
} from "#/components/ui/accordion.tsx";
import {
  AlertDialog,
  AlertDialogClose,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "#/components/ui/alert-dialog.tsx";
import { Badge } from "#/components/ui/badge.tsx";
import { Button } from "#/components/ui/button.tsx";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "#/components/ui/card.tsx";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPanel,
  DialogTitle,
  DialogTrigger,
} from "#/components/ui/dialog.tsx";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "#/components/ui/field.tsx";
import { Input } from "#/components/ui/input.tsx";
import { Textarea } from "#/components/ui/textarea.tsx";
import { cn } from "#/lib/utils.ts";

const CAD_INPUT_CLEANUP_PATTERN = /[$,\s]/g;
const CAD_INPUT_PATTERN = /^\d+(?:\.\d{0,2})?$/;
const CONVEX_ERROR_PATTERN = /Uncaught Error:\s*([^\n]+)/;
const DRAW_AVAILABILITY_ERROR_PATTERN =
  /available draw limit|available balance/i;
const DRAW_NETWORK_ERROR_PATTERN =
  /network|offline|timed? out|timeout|failed to fetch/i;
const DRAW_PERMISSION_ERROR_PATTERN =
  /permission|not authorized|unauthorized|forbidden/i;
const DRAW_STATUS_ERROR_PATTERN =
  /only a submitted draw|only submitted draw|only draw requests|only draws approved/i;
const CAD_FORMATTER = new Intl.NumberFormat("en-CA", {
  currency: "CAD",
  currencyDisplay: "narrowSymbol",
  minimumFractionDigits: 2,
  style: "currency",
});
const DATE_FORMATTER = new Intl.DateTimeFormat("en-CA", {
  day: "numeric",
  month: "short",
  year: "numeric",
});
const DATE_TIME_FORMATTER = new Intl.DateTimeFormat("en-CA", {
  dateStyle: "medium",
  timeStyle: "short",
});

export type FundingRequestStatus =
  | "requested"
  | "in_review"
  | "ready_for_admin"
  | "approved_for_release"
  | "rejected"
  | "withdrawn"
  | "released";

export interface FundingSourceAllocation {
  amountCents: number;
  drawGroupKey: string;
  milestoneKey: string;
  milestoneName: string;
  sourceOrder: number;
}

export interface FundingRequestRecord {
  amountCents: number;
  displayId?: string;
  drawKey: string;
  label: string;
  operationsRecommendationNote?: string;
  operationsReviewStartedAt?: string;
  readyForAdminAt?: string;
  releaseDate?: string;
  releasedAt?: string;
  requestedAt?: string;
  requestNote?: string;
  reviewedAt?: string;
  sourceAllocations?: FundingSourceAllocation[];
  status: FundingRequestStatus;
  withdrawnAt?: string;
  workOrderKey?: string;
}

export interface FundingMilestoneRecord {
  completionClaim?: Record<string, unknown>;
  completionReview?: Record<string, unknown>;
  dayEnd: number;
  drawAvailabilityCents: number;
  key: string;
  name: string;
  order: number;
  status: "planned" | "in_progress" | "complete";
}

export interface FundingForecastRecord {
  amountCents: number;
  drawKey: string;
  label: string;
  order: number;
  timingDay: number;
}

export interface BuildFundingModel {
  access: "full" | "read-only";
  approvedMilestoneCents: number;
  availableCents: number;
  backlogMilestoneCents: number;
  facilityCents: number;
  forecastDraws: FundingForecastRecord[];
  milestones: FundingMilestoneRecord[];
  pendingMilestoneCents: number;
  requests: FundingRequestRecord[];
  reservedCents: number;
  startDate: string;
}

export interface DrawRequestReceipt {
  amountCents: number;
  availableAfterCents: number;
  displayId: string;
  requestedAt: string;
  requestKey: string;
  sourceAllocations: FundingSourceAllocation[];
  status: "requested";
  workOrderKey: string;
}

type FundingRequestAction = (
  request: FundingRequestRecord
) => Promise<unknown> | unknown;

export function projectBuildFunding(input: {
  availability?: {
    approvedMilestoneCents: number;
    availableCents: number;
    facilityCents: number;
    reservedCents: number;
  };
  canRequest: boolean;
  facilityCents?: number;
  milestones: FundingMilestoneRecord[];
  plannedDraws?: FundingForecastRecord[];
  requests: FundingRequestRecord[];
  startDate: string;
}): BuildFundingModel {
  const today = todayIso();
  const projectedApprovedMilestoneCents = input.milestones.reduce(
    (total, milestone) =>
      completionReviewStatus(milestone) === "approved"
        ? total + positiveCents(milestone.drawAvailabilityCents)
        : total,
    0
  );
  const pendingMilestoneCents = input.milestones.reduce((total, milestone) => {
    const status = completionReviewStatus(milestone);
    return milestone.completionClaim && (!status || status === "pending")
      ? total + positiveCents(milestone.drawAvailabilityCents)
      : total;
  }, 0);
  const backlogMilestoneCents = input.milestones.reduce((total, milestone) => {
    const status = completionReviewStatus(milestone);
    const plannedDate = addDays(input.startDate, milestone.dayEnd);
    const isPending =
      Boolean(milestone.completionClaim) && (!status || status === "pending");
    const isBacklog =
      status !== "approved" && !isPending && plannedDate < today;
    return isBacklog
      ? total + positiveCents(milestone.drawAvailabilityCents)
      : total;
  }, 0);
  const projectedReservedCents = input.requests.reduce(
    (total, request) =>
      request.status === "requested" ||
      request.status === "in_review" ||
      request.status === "ready_for_admin" ||
      request.status === "approved_for_release" ||
      request.status === "released"
        ? total + positiveCents(request.amountCents)
        : total,
    0
  );
  const projectedFacilityCents = positiveCents(input.facilityCents ?? 0);
  const projectedUnlockedCents =
    projectedFacilityCents > 0
      ? Math.min(projectedApprovedMilestoneCents, projectedFacilityCents)
      : projectedApprovedMilestoneCents;
  const approvedMilestoneCents =
    input.availability?.approvedMilestoneCents ??
    projectedApprovedMilestoneCents;
  const facilityCents =
    input.availability?.facilityCents ?? projectedFacilityCents;
  const reservedCents =
    input.availability?.reservedCents ?? projectedReservedCents;
  const availableCents =
    input.availability?.availableCents ??
    Math.max(0, projectedUnlockedCents - projectedReservedCents);
  return {
    access: input.canRequest ? "full" : "read-only",
    approvedMilestoneCents,
    availableCents,
    backlogMilestoneCents,
    facilityCents,
    forecastDraws: (input.plannedDraws ?? [])
      .filter((draw) => addDays(input.startDate, draw.timingDay) >= today)
      .sort(byOrder),
    milestones: input.milestones.slice().sort(byOrder),
    pendingMilestoneCents,
    requests: input.requests.slice().sort(mostRecentRequestFirst),
    reservedCents,
    startDate: input.startDate,
  };
}

export function BuildFundingWorkspace({
  model,
  onApproveDraw,
  onOpenMilestone,
  onRejectDraw,
  onReleaseDraw,
  onRequestDraw,
  onStartDrawReview,
  onSubmitDrawForAdmin,
  onWithdrawDraw,
  viewerRole = "builder",
}: {
  model: BuildFundingModel;
  onApproveDraw?: FundingRequestAction;
  onOpenMilestone: (milestoneKey: string) => void;
  onRejectDraw?: FundingRequestAction;
  onReleaseDraw?: FundingRequestAction;
  onRequestDraw?: (input: {
    amountCents: number;
    clientOperationId: string;
    drawKey: string;
    note?: string;
  }) => Promise<DrawRequestReceipt>;
  onStartDrawReview?: FundingRequestAction;
  onSubmitDrawForAdmin?: FundingRequestAction;
  onWithdrawDraw?: (requestKey: string) => Promise<unknown>;
  viewerRole?: "builder" | "lender";
}) {
  const [density, setDensity] = useState<"guided" | "compact">("guided");
  const submitted = model.requests.filter(
    (row) =>
      row.status === "requested" ||
      row.status === "in_review" ||
      row.status === "ready_for_admin"
  );
  const completed = model.requests.filter(
    (row) => row.status === "approved_for_release" || row.status === "released"
  );
  const closed = model.requests.filter(
    (row) => row.status === "withdrawn" || row.status === "rejected"
  );
  const approvedMilestones = model.milestones.filter(
    (row) => completionReviewStatus(row) === "approved"
  );
  const milestonesPendingReview = model.milestones.filter(
    (row) => milestoneState(row, model.startDate) === "pending"
  );
  const approvedAwaitingRelease = model.requests.filter(
    (row) => row.status === "approved_for_release"
  );
  const released = model.requests.filter((row) => row.status === "released");
  const requestSource = model.forecastDraws[0];
  const lenderView = viewerRole === "lender";

  return (
    <div className="min-w-0" data-testid="build-funding-workspace">
      <div className="flex flex-wrap items-start justify-between gap-4 border-b pb-5">
        <div className="max-w-xl">
          <p className="text-muted-foreground text-xs">
            Details / {lenderView ? "Funding review" : "Draws"}
          </p>
          <h2 className="mt-1 font-heading font-semibold text-xl">
            {lenderView ? "Review funding and release" : "Available to request"}
          </h2>
          <p className="mt-1 text-muted-foreground text-sm">
            {lenderView
              ? "Verify completed work, decide submitted draw requests, and release approved funds from one reconciled view."
              : "Approved milestone money becomes available here. Submitted requests reserve that balance until they are withdrawn, rejected, or released."}
          </p>
        </div>
        <div className="flex items-center gap-1 rounded-lg border p-1">
          <Button
            aria-pressed={density === "guided"}
            onClick={() => setDensity("guided")}
            size="sm"
            variant={density === "guided" ? "secondary" : "ghost"}
          >
            Explained
          </Button>
          <Button
            aria-pressed={density === "compact"}
            onClick={() => setDensity("compact")}
            size="sm"
            variant={density === "compact" ? "secondary" : "ghost"}
          >
            Compact
          </Button>
        </div>
      </div>

      <div className="grid items-start gap-6 pt-5 xl:grid-cols-[minmax(0,1fr)_18rem]">
        <div className="order-1 min-w-0 xl:col-start-1 xl:row-start-1">
          <section aria-labelledby="available-balance-heading">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <h3
                  className="font-semibold text-sm"
                  id="available-balance-heading"
                >
                  {lenderView ? "Available to borrower" : "Available now"}
                </h3>
                {density === "guided" ? (
                  <p className="mt-1 max-w-lg text-muted-foreground text-xs">
                    {lenderView
                      ? "Approved milestone value less submitted, approved, and released draw requests."
                      : "Milestone approvals add money. Submitted and approved draw requests reserve money. Released draws remain in the history."}
                  </p>
                ) : null}
              </div>
              <p
                className="font-heading font-semibold text-3xl tabular-nums tracking-tight"
                data-testid="funding-available-amount"
              >
                {formatCad(model.availableCents)}
              </p>
            </div>

            <Accordion
              className="mt-4 border-y"
              defaultValue={
                lenderView ? ["submitted", "completed"] : ["submitted"]
              }
              multiple
            >
              <FundingGroup
                amountCents={model.approvedMilestoneCents}
                description={`${approvedMilestones.length} approved milestone${approvedMilestones.length === 1 ? "" : "s"}`}
                id="approved"
                label="Approved milestone unlocks"
                tone="positive"
              >
                <div className="grid gap-2 pb-1 sm:grid-cols-2">
                  {approvedMilestones.map((milestone) => (
                    <MilestoneSourceCard
                      key={milestone.key}
                      milestone={milestone}
                      onOpen={() => onOpenMilestone(milestone.key)}
                      startDate={model.startDate}
                    />
                  ))}
                  {approvedMilestones.length === 0 ? (
                    <EmptyState copy="No milestone money has been approved yet." />
                  ) : null}
                </div>
              </FundingGroup>
              <FundingGroup
                amountCents={sumCents(submitted)}
                description={`${submitted.length} submitted request${submitted.length === 1 ? "" : "s"}`}
                id="submitted"
                label="Submitted draw requests"
                tone="pending"
              >
                <RequestCardGrid requests={submitted} />
              </FundingGroup>
              <FundingGroup
                amountCents={sumCents(completed)}
                description={`${completed.length} approved or released request${completed.length === 1 ? "" : "s"}`}
                id="completed"
                label="Approved / released draws"
                tone="outflow"
              >
                <RequestCardGrid requests={completed} />
              </FundingGroup>
              {closed.length > 0 ? (
                <FundingGroup
                  amountCents={sumCents(closed)}
                  description={`${closed.length} closed request${closed.length === 1 ? "" : "s"}`}
                  id="closed"
                  label="Withdrawn / rejected requests"
                  tone="neutral"
                >
                  <RequestCardGrid requests={closed} />
                </FundingGroup>
              ) : null}
            </Accordion>
            <div className="flex items-center justify-between border-b py-3 font-medium text-sm">
              <span>
                {lenderView ? "Available to borrower" : "Available now"}
              </span>
              <span className="font-heading text-base tabular-nums">
                {formatCad(model.availableCents)}
              </span>
            </div>
          </section>
        </div>

        {lenderView ? (
          <LenderReviewSidebar
            approvedAwaitingRelease={approvedAwaitingRelease}
            density={density}
            forecastDraws={model.forecastDraws}
            milestonesPendingReview={milestonesPendingReview}
            onApproveDraw={onApproveDraw}
            onOpenMilestone={onOpenMilestone}
            onRejectDraw={onRejectDraw}
            onReleaseDraw={onReleaseDraw}
            onStartDrawReview={onStartDrawReview}
            onSubmitDrawForAdmin={onSubmitDrawForAdmin}
            released={released}
            startDate={model.startDate}
            submitted={submitted}
          />
        ) : (
          <BuilderRequestSidebar
            availableCents={model.availableCents}
            density={density}
            drawKey={requestSource?.drawKey ?? "unplanned"}
            forecastDraws={model.forecastDraws}
            modelAccess={model.access}
            onRequestDraw={onRequestDraw}
            onWithdrawDraw={onWithdrawDraw}
            startDate={model.startDate}
            submitted={submitted}
          />
        )}

        <div className="order-3 min-w-0 xl:col-start-1 xl:row-start-2">
          <MilestoneFundingSchedule
            backlogCents={model.backlogMilestoneCents}
            milestones={model.milestones}
            onOpenMilestone={onOpenMilestone}
            pendingCents={model.pendingMilestoneCents}
            showGuidance={density === "guided"}
            startDate={model.startDate}
            viewerRole={viewerRole}
          />
        </div>
      </div>
    </div>
  );
}

const FUNDING_ASIDE_CLASS =
  "order-2 min-w-0 border-t pt-5 xl:sticky xl:top-4 xl:col-start-2 xl:row-span-2 xl:row-start-1 xl:border-t-0 xl:border-l xl:pt-0 xl:pl-6";

function BuilderRequestSidebar({
  availableCents,
  density,
  drawKey,
  forecastDraws,
  modelAccess,
  onRequestDraw,
  onWithdrawDraw,
  startDate,
  submitted,
}: {
  availableCents: number;
  density: "guided" | "compact";
  drawKey: string;
  forecastDraws: FundingForecastRecord[];
  modelAccess: BuildFundingModel["access"];
  onRequestDraw?: (input: {
    amountCents: number;
    clientOperationId: string;
    drawKey: string;
    note?: string;
  }) => Promise<DrawRequestReceipt>;
  onWithdrawDraw?: (requestKey: string) => Promise<unknown>;
  startDate: string;
  submitted: FundingRequestRecord[];
}) {
  return (
    <aside className={FUNDING_ASIDE_CLASS}>
      <div className="flex items-center justify-between gap-3">
        <h3 className="font-semibold text-sm">Requests</h3>
        <Badge variant="secondary">{submitted.length} active</Badge>
      </div>
      {density === "guided" ? (
        <p className="mt-1 text-muted-foreground text-xs">
          Fairlend reviews and releases each request separately.
        </p>
      ) : null}

      <DrawRequestComposer
        availableCents={availableCents}
        disabled={modelAccess !== "full" || !onRequestDraw}
        drawKey={drawKey}
        onRequestDraw={onRequestDraw}
      />
      {modelAccess === "read-only" ? (
        <p className="mt-2 text-muted-foreground text-xs">
          You have view-only access. Ask an account administrator to submit a
          request.
        </p>
      ) : availableCents <= 0 ? (
        <div className="mt-2">
          <p className="text-muted-foreground text-xs">
            No approved milestone money is available to request yet.
          </p>
          <div className="mt-2">
            <ContactAdminDialog />
          </div>
        </div>
      ) : null}

      <div className="mt-4 divide-y border-y">
        {submitted.map((request) => (
          <article className="py-3" key={request.drawKey}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-medium text-sm tabular-nums">
                  {formatCad(request.amountCents)}
                </p>
                <p className="mt-0.5 text-muted-foreground text-xs">
                  {request.displayId ?? request.drawKey} · submitted{" "}
                  {relativeDate(request.requestedAt)}
                </p>
              </div>
              <Badge variant="info">Submitted</Badge>
            </div>
            <p className="mt-2 text-muted-foreground text-xs">
              Waiting for Fairlend review. You can withdraw this request until
              it is approved.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <ContactAdminDialog />
              {onWithdrawDraw ? (
                <WithdrawRequestDialog
                  onWithdraw={() => onWithdrawDraw(request.drawKey)}
                />
              ) : null}
            </div>
          </article>
        ))}
        {submitted.length === 0 ? (
          <p className="py-4 text-muted-foreground text-xs">
            No requests are awaiting approval.
          </p>
        ) : null}
      </div>

      <FuturePlannedDraws
        density={density}
        draws={forecastDraws}
        startDate={startDate}
      />
    </aside>
  );
}

function LenderReviewSidebar({
  approvedAwaitingRelease,
  density,
  forecastDraws,
  milestonesPendingReview,
  onApproveDraw,
  onOpenMilestone,
  onRejectDraw,
  onReleaseDraw,
  onStartDrawReview,
  onSubmitDrawForAdmin,
  released,
  startDate,
  submitted,
}: {
  approvedAwaitingRelease: FundingRequestRecord[];
  density: "guided" | "compact";
  forecastDraws: FundingForecastRecord[];
  milestonesPendingReview: FundingMilestoneRecord[];
  onApproveDraw?: FundingRequestAction;
  onOpenMilestone: (milestoneKey: string) => void;
  onRejectDraw?: FundingRequestAction;
  onReleaseDraw?: FundingRequestAction;
  onStartDrawReview?: FundingRequestAction;
  onSubmitDrawForAdmin?: FundingRequestAction;
  released: FundingRequestRecord[];
  startDate: string;
  submitted: FundingRequestRecord[];
}) {
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [reviewError, setReviewError] = useState("");
  const actionCount =
    milestonesPendingReview.length +
    submitted.length +
    approvedAwaitingRelease.length;
  const runReviewAction = async (
    action: "approve" | "reject" | "release" | "start" | "submit",
    request: FundingRequestRecord,
    handler: FundingRequestAction | undefined
  ) => {
    if (!(handler && !pendingAction)) {
      return false;
    }
    const actionKey = `${action}:${request.drawKey}`;
    setPendingAction(actionKey);
    setReviewError("");
    try {
      await handler(request);
      toast.success(drawReviewSuccessMessage(action, request));
      return true;
    } catch (cause) {
      setReviewError(drawReviewErrorMessage(cause));
      return false;
    } finally {
      setPendingAction(null);
    }
  };

  return (
    <aside className={FUNDING_ASIDE_CLASS} data-testid="lender-funding-review">
      <div className="flex items-center justify-between gap-3">
        <h3 className="flex items-center gap-2 font-semibold text-sm">
          <ClipboardCheck aria-hidden="true" className="size-4" /> Lender review
        </h3>
        <Badge variant={actionCount > 0 ? "warning" : "secondary"}>
          {actionCount} {actionCount === 1 ? "action" : "actions"}
        </Badge>
      </div>
      {density === "guided" ? (
        <p className="mt-1 text-muted-foreground text-xs">
          Review completed work before approving capital, then decide and
          release each draw independently.
        </p>
      ) : null}
      {reviewError ? (
        <p className="mt-3 text-destructive-text text-xs" role="alert">
          {reviewError}
        </p>
      ) : null}

      <section
        aria-labelledby="milestone-review-queue-heading"
        className="mt-5"
      >
        <div className="flex items-center justify-between gap-3">
          <h4
            className="font-semibold text-xs"
            id="milestone-review-queue-heading"
          >
            Milestone completions
          </h4>
          <span className="text-muted-foreground text-xs tabular-nums">
            {milestonesPendingReview.length} pending
          </span>
        </div>
        <div className="mt-2 divide-y border-y">
          {milestonesPendingReview.map((milestone) => (
            <article className="py-3" key={milestone.key}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-medium text-xs">{milestone.name}</p>
                  <p className="mt-1 text-muted-foreground text-xs">
                    {milestoneDateCopy(milestone, startDate, "pending")}
                  </p>
                </div>
                <p className="shrink-0 font-medium text-xs tabular-nums">
                  {formatCad(milestone.drawAvailabilityCents)}
                </p>
              </div>
              <Button
                aria-label={`Review ${milestone.name} milestone`}
                className="mt-2 min-h-9 px-0"
                onClick={() => onOpenMilestone(milestone.key)}
                size="xs"
                variant="link"
              >
                Review milestone
              </Button>
            </article>
          ))}
          {milestonesPendingReview.length === 0 ? (
            <p className="py-3 text-muted-foreground text-xs">
              No completion claims are waiting for review.
            </p>
          ) : null}
        </div>
      </section>

      <section aria-labelledby="draw-decision-queue-heading" className="mt-5">
        <div className="flex items-center justify-between gap-3">
          <h4
            className="font-semibold text-xs"
            id="draw-decision-queue-heading"
          >
            Draw decisions
          </h4>
          <span className="text-muted-foreground text-xs tabular-nums">
            {submitted.length + approvedAwaitingRelease.length} pending
          </span>
        </div>
        <div className="mt-2 divide-y border-y">
          {submitted.map((request) => {
            const approveKey = `approve:${request.drawKey}`;
            const rejectKey = `reject:${request.drawKey}`;
            const startKey = `start:${request.drawKey}`;
            const submitKey = `submit:${request.drawKey}`;
            return (
              <article className="py-3" key={request.drawKey}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium text-xs">
                      {request.displayId ?? request.drawKey}
                    </p>
                    <p className="mt-1 text-muted-foreground text-xs">
                      {drawReviewStageCopy(request)}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-medium text-xs tabular-nums">
                      {formatCad(request.amountCents)}
                    </p>
                    <Badge
                      className="mt-1"
                      variant={requestBadgeTone(request.status)}
                    >
                      {requestStatusLabel(request.status)}
                    </Badge>
                  </div>
                </div>
                {request.requestNote ? (
                  <p className="mt-2 text-muted-foreground text-xs">
                    {request.requestNote}
                  </p>
                ) : null}
                <DrawSourceAttribution request={request} />
                {request.status === "requested" ? (
                  <Button
                    className="mt-3"
                    data-testid={`lender-review-start-${request.drawKey}`}
                    disabled={!onStartDrawReview || Boolean(pendingAction)}
                    loading={pendingAction === startKey}
                    onClick={() =>
                      runReviewAction("start", request, onStartDrawReview)
                    }
                    size="sm"
                    variant="outline"
                  >
                    Start review
                  </Button>
                ) : null}
                {request.status === "in_review" ? (
                  <Button
                    className="mt-3"
                    data-testid={`lender-review-submit-${request.drawKey}`}
                    disabled={!onSubmitDrawForAdmin || Boolean(pendingAction)}
                    loading={pendingAction === submitKey}
                    onClick={() =>
                      runReviewAction("submit", request, onSubmitDrawForAdmin)
                    }
                    size="sm"
                    variant="outline"
                  >
                    Send to admin
                  </Button>
                ) : null}
                {request.status === "ready_for_admin" ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button
                      data-testid={`lender-review-approve-${request.drawKey}`}
                      disabled={!onApproveDraw || Boolean(pendingAction)}
                      loading={pendingAction === approveKey}
                      onClick={() =>
                        runReviewAction("approve", request, onApproveDraw)
                      }
                      size="sm"
                      variant="outline"
                    >
                      Approve for release
                    </Button>
                    <Button
                      className="text-destructive-text"
                      data-testid={`lender-review-reject-${request.drawKey}`}
                      disabled={!onRejectDraw || Boolean(pendingAction)}
                      loading={pendingAction === rejectKey}
                      onClick={() =>
                        runReviewAction("reject", request, onRejectDraw)
                      }
                      size="sm"
                      variant="outline"
                    >
                      Reject
                    </Button>
                  </div>
                ) : null}
              </article>
            );
          })}
          {approvedAwaitingRelease.map((request) => (
            <article className="py-3" key={request.drawKey}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-medium text-xs">
                    {request.displayId ?? request.drawKey}
                  </p>
                  <p className="mt-1 text-muted-foreground text-xs">
                    Approved {formatDate(request.reviewedAt)}
                  </p>
                </div>
                <div className="text-right">
                  <p className="font-medium text-xs tabular-nums">
                    {formatCad(request.amountCents)}
                  </p>
                  <Badge className="mt-1" variant="warning">
                    Ready to release
                  </Badge>
                </div>
              </div>
              <DrawSourceAttribution request={request} />
              <ReleaseDrawDialog
                disabled={!onReleaseDraw || Boolean(pendingAction)}
                loading={pendingAction === `release:${request.drawKey}`}
                onRelease={() =>
                  runReviewAction("release", request, onReleaseDraw)
                }
                request={request}
              />
            </article>
          ))}
          {submitted.length + approvedAwaitingRelease.length === 0 ? (
            <p className="py-3 text-muted-foreground text-xs">
              No draw requests require a decision or release.
            </p>
          ) : null}
        </div>
      </section>

      <section aria-labelledby="released-draws-heading" className="mt-5">
        <div className="flex items-center justify-between gap-3">
          <h4 className="font-semibold text-xs" id="released-draws-heading">
            Released draws
          </h4>
          <span className="text-muted-foreground text-xs tabular-nums">
            {released.length} released
          </span>
        </div>
        <div className="mt-2 grid gap-2">
          {released.map((request) => (
            <Card
              className="rounded-xl shadow-none"
              data-testid={`lender-released-draw-${request.drawKey}`}
              key={request.drawKey}
            >
              <CardHeader className="gap-1 p-3 pb-2">
                <CardTitle className="text-xs">
                  {request.displayId ?? request.drawKey}
                </CardTitle>
                <CardDescription className="text-xs">
                  {request.label}
                </CardDescription>
                <CardAction className="flex flex-col items-end gap-1">
                  <span className="font-heading font-semibold text-sm tabular-nums">
                    {formatCad(request.amountCents)}
                  </span>
                  <Badge variant="success">Released</Badge>
                </CardAction>
              </CardHeader>
              <CardContent className="grid gap-2 px-3 pb-3 text-xs">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <p className="text-muted-foreground">Approved</p>
                    <p className="mt-0.5 font-medium">
                      {formatDate(request.reviewedAt)}
                    </p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Released</p>
                    <p className="mt-0.5 font-medium">
                      {formatDate(request.releaseDate ?? request.releasedAt)}
                    </p>
                  </div>
                </div>
                <DrawSourceAttribution request={request} />
              </CardContent>
            </Card>
          ))}
          {released.length === 0 ? (
            <div className="rounded-lg border border-dashed p-3">
              <p className="font-medium text-xs">
                No draws have been released for this build.
              </p>
              {density === "guided" ? (
                <p className="mt-1 text-muted-foreground text-xs">
                  Previously approved draws will appear here after funds are
                  released.
                </p>
              ) : null}
            </div>
          ) : null}
        </div>
      </section>

      <FuturePlannedDraws
        density={density}
        draws={forecastDraws}
        startDate={startDate}
      />
    </aside>
  );
}

function ReleaseDrawDialog({
  disabled,
  loading,
  onRelease,
  request,
}: {
  disabled: boolean;
  loading: boolean;
  onRelease: () => Promise<boolean>;
  request: FundingRequestRecord;
}) {
  const [open, setOpen] = useState(false);
  return (
    <AlertDialog onOpenChange={setOpen} open={open}>
      <AlertDialogTrigger
        disabled={disabled}
        render={
          <Button
            className="mt-3"
            data-testid={`lender-review-release-${request.drawKey}`}
            size="sm"
            variant="outline"
          />
        }
      >
        Release funds
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            Release {formatCad(request.amountCents)}?
          </AlertDialogTitle>
          <AlertDialogDescription>
            This records the draw as released and removes the funds from the
            remaining approved balance. Confirm the approval and payment details
            before continuing.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogClose render={<Button variant="outline" />}>
            Cancel
          </AlertDialogClose>
          <Button
            loading={loading}
            onClick={async () => {
              if (await onRelease()) {
                setOpen(false);
              }
            }}
          >
            Confirm release
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function FuturePlannedDraws({
  density,
  draws,
  startDate,
}: {
  density: "guided" | "compact";
  draws: FundingForecastRecord[];
  startDate: string;
}) {
  return (
    <section aria-labelledby="future-draws-heading" className="mt-6">
      <div className="flex items-center justify-between gap-3">
        <h3
          className="flex items-center gap-2 font-semibold text-sm"
          id="future-draws-heading"
        >
          <CalendarClock aria-hidden="true" className="size-4" /> Future planned
          draws
        </h3>
        <Badge variant="secondary">{draws.length} planned</Badge>
      </div>
      {density === "guided" ? (
        <p className="mt-1 text-muted-foreground text-xs">
          Planning only. These dates and amounts do not reserve availability.
        </p>
      ) : null}
      <div className="mt-3 divide-y border-y">
        {draws.map((draw) => (
          <article className="py-3" key={draw.drawKey}>
            <div className="flex items-start justify-between gap-3">
              <p className="font-medium text-xs">{draw.label}</p>
              <p className="shrink-0 font-medium text-xs tabular-nums">
                {formatCad(draw.amountCents)}
              </p>
            </div>
            <p className="mt-1 text-muted-foreground text-xs">
              Planned {formatDate(addDays(startDate, draw.timingDay))}
            </p>
          </article>
        ))}
        {draws.length === 0 ? (
          <p className="py-4 text-muted-foreground text-xs">
            No future draw dates are currently planned.
          </p>
        ) : null}
      </div>
    </section>
  );
}

function FundingGroup({
  amountCents,
  children,
  description,
  id,
  label,
  tone,
}: {
  amountCents: number;
  children: React.ReactNode;
  description: string;
  id: string;
  label: string;
  tone: "positive" | "pending" | "outflow" | "neutral";
}) {
  return (
    <AccordionItem value={id}>
      <AccordionTrigger className="py-3">
        <span className="min-w-0">
          <span className="block text-sm">{label}</span>
          <span className="mt-0.5 block font-normal text-muted-foreground text-xs">
            {description}
          </span>
        </span>
        <span
          className={cn(
            "ml-auto shrink-0 font-heading font-medium text-sm tabular-nums",
            tone === "positive" && "text-success-foreground",
            tone === "pending" && "text-info-foreground"
          )}
        >
          {tone === "positive"
            ? "+"
            : tone === "pending" || tone === "outflow"
              ? "−"
              : ""}
          {formatCad(amountCents)}
        </span>
      </AccordionTrigger>
      <AccordionPanel>{children}</AccordionPanel>
    </AccordionItem>
  );
}

function RequestCardGrid({ requests }: { requests: FundingRequestRecord[] }) {
  if (requests.length === 0) {
    return <EmptyState copy="No requests in this group." />;
  }
  return (
    <div className="grid gap-2 pb-1 sm:grid-cols-2">
      {requests.map((request) => (
        <Card className="rounded-xl shadow-none" key={request.drawKey}>
          <CardHeader className="gap-1 p-3 pb-2">
            <CardTitle className="text-sm">
              {request.displayId ?? request.drawKey}
            </CardTitle>
            <CardDescription className="text-xs">
              {requestStatusDate(request)}
            </CardDescription>
            <CardAction>
              <Badge size="sm" variant={requestBadgeTone(request.status)}>
                {requestStatusLabel(request.status)}
              </Badge>
            </CardAction>
          </CardHeader>
          <CardContent className="grid gap-2 px-3 pt-0 pb-3">
            <div className="flex items-end justify-between gap-3">
              <p className="min-w-0 text-muted-foreground text-xs">
                {request.label}
              </p>
              <p className="shrink-0 font-heading font-semibold text-base tabular-nums">
                {formatCad(request.amountCents)}
              </p>
            </div>
            <DrawSourceAttribution request={request} />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function DrawSourceAttribution({ request }: { request: FundingRequestRecord }) {
  const allocations = request.sourceAllocations ?? [];
  if (allocations.length === 0) {
    return null;
  }
  return (
    <div
      className="border-t pt-2 text-xs"
      data-testid={`draw-source-attribution-${request.drawKey}`}
    >
      <p className="font-medium">
        {request.workOrderKey
          ? `Work order ${request.workOrderKey}`
          : "Reimbursement sources"}
      </p>
      <ul className="mt-1 grid gap-1 text-muted-foreground">
        {allocations.map((allocation) => (
          <li
            className="flex items-start justify-between gap-3"
            key={`${allocation.drawGroupKey}:${allocation.milestoneKey}`}
          >
            <span className="min-w-0">
              {allocation.milestoneName} · {allocation.drawGroupKey}
            </span>
            <span className="shrink-0 tabular-nums">
              {formatCad(allocation.amountCents)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function MilestoneSourceCard({
  milestone,
  onOpen,
  startDate,
}: {
  milestone: FundingMilestoneRecord;
  onOpen: () => void;
  startDate: string;
}) {
  return (
    <Card className="rounded-xl shadow-none">
      <CardHeader className="gap-1 p-3 pb-2">
        <CardTitle className="text-sm">{milestone.name}</CardTitle>
        <CardDescription className="text-xs">
          Approved{" "}
          {formatDate(
            reviewedAt(milestone) ?? addDays(startDate, milestone.dayEnd)
          )}
        </CardDescription>
        <CardAction>
          <Badge size="sm" variant="success">
            Approved
          </Badge>
        </CardAction>
      </CardHeader>
      <CardContent className="px-3 pt-0 pb-2">
        <p className="font-heading font-semibold text-base tabular-nums">
          +{formatCad(milestone.drawAvailabilityCents)}
        </p>
      </CardContent>
      <CardFooter className="border-t px-3 py-2">
        <Button
          aria-label={`Open ${milestone.name} milestone`}
          className="min-h-9 px-0"
          onClick={onOpen}
          size="xs"
          variant="link"
        >
          Open milestone
        </Button>
      </CardFooter>
    </Card>
  );
}

function MilestoneFundingSchedule({
  backlogCents,
  milestones,
  onOpenMilestone,
  pendingCents,
  showGuidance,
  startDate,
  viewerRole,
}: {
  backlogCents: number;
  milestones: FundingMilestoneRecord[];
  onOpenMilestone: (key: string) => void;
  pendingCents: number;
  showGuidance: boolean;
  startDate: string;
  viewerRole: "builder" | "lender";
}) {
  const lenderView = viewerRole === "lender";
  return (
    <section aria-labelledby="milestone-funding-heading">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h3 className="font-semibold text-sm" id="milestone-funding-heading">
            Milestone funding schedule
          </h3>
          {showGuidance ? (
            <p className="mt-1 max-w-xl text-muted-foreground text-xs">
              {lenderView
                ? "Review submitted completions against their evidence before approving each milestone unlock."
                : "Every planned milestone is visible, including its relevant date and whether the amount is available, pending verification, behind, or planned."}
            </p>
          ) : null}
        </div>
        <dl
          aria-label="Milestone funding summary"
          className="flex flex-wrap gap-x-8 gap-y-3 text-right"
        >
          <div>
            <dt className="text-muted-foreground text-xs">Pending review</dt>
            <dd className="font-heading font-semibold text-3xl text-warning-foreground tabular-nums tracking-tight">
              {formatCad(pendingCents)}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground text-xs">Behind plan</dt>
            <dd className="font-heading font-semibold text-3xl text-destructive-text tabular-nums tracking-tight">
              {formatCad(backlogCents)}
            </dd>
          </div>
        </dl>
      </div>
      <ol aria-label="Milestone funding status" className="mt-4 grid gap-2">
        {milestones.map((milestone) => (
          <MilestoneFundingCard
            key={milestone.key}
            lenderView={lenderView}
            milestone={milestone}
            onOpen={() => onOpenMilestone(milestone.key)}
            startDate={startDate}
          />
        ))}
      </ol>
    </section>
  );
}

function MilestoneFundingCard({
  lenderView,
  milestone,
  onOpen,
  startDate,
}: {
  lenderView: boolean;
  milestone: FundingMilestoneRecord;
  onOpen: () => void;
  startDate: string;
}) {
  const state = milestoneState(milestone, startDate);
  const stateLabel = milestoneStateLabel(state);
  const stateCopy = milestoneCardCopy(state, milestone, lenderView);
  return (
    <li>
      <Card
        className={cn(
          "rounded-xl shadow-none",
          state === "approved" && "border-success/30 bg-success/8",
          state === "pending" && "border-warning/30 bg-warning/8",
          (state === "behind" || state === "revision") &&
            "border-destructive/30 bg-destructive/8"
        )}
      >
        <CardHeader className="gap-1 p-3 pb-2">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <Clock3 aria-hidden="true" className="size-4 shrink-0" />
            <CardTitle className="text-sm">{milestone.name}</CardTitle>
            <Badge
              aria-label={`Status: ${stateLabel}`}
              variant={milestoneBadgeTone(state)}
            >
              {stateLabel}
            </Badge>
          </div>
          <CardDescription className="text-xs">
            {milestoneDateCopy(milestone, startDate, state)}
          </CardDescription>
          <CardAction className="flex flex-col items-end gap-1 pl-3 text-right">
            <span className="font-heading font-semibold text-base tabular-nums">
              {formatCad(milestone.drawAvailabilityCents)}
            </span>
            <span className="text-muted-foreground text-xs">
              {state === "approved" ? "unlocked" : "potential unlock"}
            </span>
          </CardAction>
        </CardHeader>
        <CardContent className="px-3 pt-0 pb-2">
          <p
            className={cn(
              "text-xs",
              state === "pending" && "text-warning-foreground",
              (state === "behind" || state === "revision") &&
                "text-destructive-text",
              (state === "approved" || state === "planned") &&
                "text-muted-foreground"
            )}
          >
            {stateCopy}
          </p>
        </CardContent>
        <CardFooter className="border-t px-3 py-2">
          <Button
            aria-label={`${lenderView ? "Review" : "Open"} ${milestone.name} milestone`}
            className="min-h-9 px-0"
            onClick={onOpen}
            size="xs"
            variant="link"
          >
            {lenderView ? "Review milestone" : "Open milestone"}
          </Button>
        </CardFooter>
      </Card>
    </li>
  );
}

function milestoneCardCopy(
  state: ReturnType<typeof milestoneState>,
  milestone: FundingMilestoneRecord,
  lenderView: boolean
) {
  if (state === "pending") {
    return lenderView
      ? "Completion evidence is ready for lender review."
      : "Completion is awaiting Fairlend verification.";
  }
  if (state === "behind") {
    return "Completion has not been submitted.";
  }
  if (state === "revision") {
    return `Requested change: ${completionReviewNote(milestone)}`;
  }
  if (state === "approved") {
    return lenderView
      ? "No action — this milestone unlock is already approved."
      : "This milestone value is available for draw requests.";
  }
  return lenderView
    ? "No action until the builder submits milestone completion."
    : "Complete this milestone to make its value available.";
}

function DrawRequestComposer({
  availableCents,
  disabled,
  drawKey,
  onRequestDraw,
}: {
  availableCents: number;
  disabled: boolean;
  drawKey: string;
  onRequestDraw?: (input: {
    amountCents: number;
    clientOperationId: string;
    drawKey: string;
    note?: string;
  }) => Promise<DrawRequestReceipt>;
}) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<"amount" | "review" | "receipt">("amount");
  const [amount, setAmount] = useState(centsToInput(availableCents));
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [receipt, setReceipt] = useState<DrawRequestReceipt | null>(null);
  const operationId = useRef(createOperationId());
  const amountCents = parseCadToCents(amount);
  const valid = amountCents > 0 && amountCents <= availableCents;

  const reset = () => {
    setAmount(centsToInput(availableCents));
    setNote("");
    setError("");
    setReceipt(null);
    setStep("amount");
    operationId.current = createOperationId();
  };
  const submit = async () => {
    if (!(onRequestDraw && valid) || pending) {
      return;
    }
    setPending(true);
    setError("");
    try {
      const result = await onRequestDraw({
        amountCents,
        clientOperationId: operationId.current,
        drawKey,
        note: note.trim() || undefined,
      });
      setReceipt(result);
      setStep("receipt");
    } catch (cause) {
      setError(drawRequestErrorMessage(cause, "submit"));
    } finally {
      setPending(false);
    }
  };

  return (
    <Dialog
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (!nextOpen) {
          reset();
        }
      }}
      open={open}
    >
      <DialogTrigger
        disabled={disabled || availableCents <= 0}
        render={<Button className="mt-3 w-full" size="lg" />}
      >
        <CircleDollarSign /> Request a draw
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {step === "receipt" ? "Draw request submitted" : "Request a draw"}
          </DialogTitle>
          <DialogDescription>
            {step === "amount"
              ? `Choose any amount up to ${formatCad(availableCents)}.`
              : step === "review"
                ? "Review the amount before it is sent to Fairlend."
                : "Your available balance has been updated."}
          </DialogDescription>
        </DialogHeader>
        <DialogPanel>
          {step === "amount" ? (
            <div className="grid gap-4">
              <Field invalid={amount.length > 0 && !valid}>
                <FieldLabel>Amount (CAD)</FieldLabel>
                <Input
                  aria-label="Draw request amount in Canadian dollars"
                  inputMode="decimal"
                  onChange={(event) => setAmount(event.target.value)}
                  value={amount}
                />
                <FieldDescription>
                  Available now: {formatCad(availableCents)}
                </FieldDescription>
                <FieldError>
                  Enter an amount between $0.01 and {formatCad(availableCents)}.
                </FieldError>
              </Field>
              <div className="flex flex-wrap gap-2">
                <Button
                  className="min-h-11"
                  onClick={() => setAmount(centsToInput(availableCents))}
                  size="sm"
                  variant="outline"
                >
                  Request all
                </Button>
                <Button
                  className="min-h-11"
                  onClick={() =>
                    setAmount(centsToInput(Math.floor(availableCents / 2)))
                  }
                  size="sm"
                  variant="outline"
                >
                  Request half
                </Button>
              </div>
              <Field>
                <FieldLabel>Note (optional)</FieldLabel>
                <Textarea
                  maxLength={500}
                  onChange={(event) => setNote(event.target.value)}
                  placeholder="What work or cost is this request for?"
                  value={note}
                />
              </Field>
            </div>
          ) : null}
          {step === "review" ? (
            <div className="border-y py-5">
              <p className="text-muted-foreground text-xs">Amount requested</p>
              <p className="mt-1 font-heading font-semibold text-3xl tabular-nums">
                {formatCad(amountCents)}
              </p>
              <p className="mt-4 text-muted-foreground text-xs">
                Available after submission
              </p>
              <p className="mt-1 font-medium text-sm tabular-nums">
                {formatCad(availableCents - amountCents)}
              </p>
              {note ? <p className="mt-4 text-sm">{note}</p> : null}
            </div>
          ) : null}
          {step === "receipt" && receipt ? (
            <div aria-live="polite" className="border-y py-5" role="status">
              <div className="flex size-10 items-center justify-center rounded-full bg-success/12 text-success-foreground">
                <Check className="size-5" />
              </div>
              <p className="mt-4 font-medium">{receipt.displayId}</p>
              <p className="mt-1 font-heading font-semibold text-3xl tabular-nums">
                {formatCad(receipt.amountCents)}
              </p>
              <p className="mt-2 text-muted-foreground text-sm">
                Submitted {formatDateTime(receipt.requestedAt)}. Fairlend will
                review this request.
              </p>
              <p className="mt-3 font-medium text-xs">
                Work order {receipt.workOrderKey}
              </p>
              <ul className="mt-1 grid gap-1 text-muted-foreground text-xs">
                {receipt.sourceAllocations.map((allocation) => (
                  <li
                    aria-label={`${allocation.milestoneName}, Draw Group ${allocation.drawGroupKey}, ${formatCad(allocation.amountCents)}`}
                    className="flex items-start justify-between gap-3"
                    key={`${allocation.drawGroupKey}:${allocation.milestoneKey}`}
                  >
                    <span>
                      {allocation.milestoneName} · Draw Group{" "}
                      {allocation.drawGroupKey}
                    </span>
                    <span className="shrink-0 tabular-nums">
                      {formatCad(allocation.amountCents)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {error ? (
            <p
              className="mt-3 text-destructive-foreground text-sm"
              role="alert"
            >
              {error}
            </p>
          ) : null}
        </DialogPanel>
        <DialogFooter>
          {step === "amount" ? (
            <>
              <DialogClose render={<Button variant="outline" />}>
                Cancel
              </DialogClose>
              <Button disabled={!valid} onClick={() => setStep("review")}>
                Review request
              </Button>
            </>
          ) : null}
          {step === "review" ? (
            <>
              <Button onClick={() => setStep("amount")} variant="outline">
                Back
              </Button>
              <Button loading={pending} onClick={submit}>
                Submit request
              </Button>
            </>
          ) : null}
          {step === "receipt" ? (
            <DialogClose render={<Button />}>Done</DialogClose>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ContactAdminDialog() {
  return (
    <Dialog>
      <DialogTrigger render={<Button size="sm" variant="outline" />}>
        <Mail /> Contact admin
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Contact Fairlend</DialogTitle>
          <DialogDescription>
            Ask for an update on a submitted draw request.
          </DialogDescription>
        </DialogHeader>
        <DialogPanel className="grid gap-3">
          <Button
            render={
              <a
                aria-label="Email Fairlend about a draw request"
                href="mailto:elie@fairlend.ca?subject=Draw%20request%20update"
              >
                <Mail /> elie@fairlend.ca
              </a>
            }
            variant="outline"
          />
          <Button
            render={
              <a
                aria-label="Call Fairlend about a draw request"
                href="tel:+16478317605"
              >
                <Phone /> 647-831-7605
              </a>
            }
            variant="outline"
          />
        </DialogPanel>
        <DialogFooter>
          <DialogClose render={<Button variant="outline" />}>Close</DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function WithdrawRequestDialog({
  onWithdraw,
}: {
  onWithdraw: () => Promise<unknown>;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [open, setOpen] = useState(false);
  return (
    <AlertDialog
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (!nextOpen) {
          setError("");
        }
      }}
      open={open}
    >
      <AlertDialogTrigger render={<Button size="sm" variant="outline" />}>
        <RotateCcw /> Withdraw
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Withdraw this draw request?</AlertDialogTitle>
          <AlertDialogDescription>
            The reserved amount returns to Available now. You can submit a new
            request later.
          </AlertDialogDescription>
        </AlertDialogHeader>
        {error ? (
          <p className="px-6 text-destructive-foreground text-sm" role="alert">
            {error}
          </p>
        ) : null}
        <AlertDialogFooter>
          <AlertDialogClose render={<Button variant="outline" />}>
            Keep request
          </AlertDialogClose>
          <Button
            loading={pending}
            onClick={async () => {
              setPending(true);
              setError("");
              try {
                await onWithdraw();
                setOpen(false);
                toast.success(
                  "Draw request withdrawn. The amount is available again."
                );
              } catch (cause) {
                setError(drawRequestErrorMessage(cause, "withdraw"));
              } finally {
                setPending(false);
              }
            }}
            variant="destructive"
          >
            Withdraw request
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function EmptyState({ copy }: { copy: string }) {
  return (
    <p className="rounded-lg border border-dashed p-3 text-muted-foreground text-xs">
      {copy}
    </p>
  );
}

function completionReviewStatus(milestone: FundingMilestoneRecord) {
  const status = (milestone.completionReview as { status?: string } | undefined)
    ?.status;
  return status === "revisionRequested" && !completionReviewNote(milestone)
    ? "pending"
    : status;
}

function completionReviewNote(milestone: FundingMilestoneRecord) {
  const note = (milestone.completionReview as { note?: unknown } | undefined)
    ?.note;
  return typeof note === "string" && note.trim() ? note.trim() : undefined;
}

function reviewedAt(milestone: FundingMilestoneRecord) {
  return (milestone.completionReview as { reviewedAt?: string } | undefined)
    ?.reviewedAt;
}

function milestoneState(milestone: FundingMilestoneRecord, startDate: string) {
  if (completionReviewStatus(milestone) === "approved") {
    return "approved" as const;
  }
  if (completionReviewStatus(milestone) === "revisionRequested") {
    return "revision" as const;
  }
  if (milestone.completionClaim) {
    return "pending" as const;
  }
  if (addDays(startDate, milestone.dayEnd) < todayIso()) {
    return "behind" as const;
  }
  return "planned" as const;
}

function milestoneDateCopy(
  milestone: FundingMilestoneRecord,
  startDate: string,
  state: ReturnType<typeof milestoneState>
) {
  const date =
    state === "approved" || state === "revision"
      ? (reviewedAt(milestone) ?? addDays(startDate, milestone.dayEnd))
      : ((milestone.completionClaim as { submittedAt?: string } | undefined)
          ?.submittedAt ?? addDays(startDate, milestone.dayEnd));
  if (state === "approved") {
    return `Approved ${formatDate(date)}`;
  }
  if (state === "pending") {
    return `Completion submitted ${formatDate(date)}`;
  }
  if (state === "revision") {
    return `Changes requested ${formatDate(date)}`;
  }
  return `Planned completion ${formatDate(date)}`;
}

function milestoneStateLabel(state: ReturnType<typeof milestoneState>) {
  if (state === "approved") {
    return "Approved";
  }
  if (state === "pending") {
    return "Pending verification";
  }
  if (state === "behind") {
    return "Behind plan";
  }
  if (state === "revision") {
    return "Needs revision";
  }
  return "Planned";
}

function milestoneBadgeTone(state: ReturnType<typeof milestoneState>) {
  if (state === "approved") {
    return "success" as const;
  }
  if (state === "pending") {
    return "warning" as const;
  }
  if (state === "behind") {
    return "error" as const;
  }
  if (state === "revision") {
    return "error" as const;
  }
  return "outline" as const;
}

function requestBadgeTone(status: FundingRequestStatus) {
  if (status === "released") {
    return "success" as const;
  }
  if (status === "requested" || status === "in_review") {
    return "info" as const;
  }
  if (status === "ready_for_admin" || status === "approved_for_release") {
    return "warning" as const;
  }
  if (status === "rejected") {
    return "error" as const;
  }
  return "outline" as const;
}

function requestStatusLabel(status: FundingRequestStatus) {
  if (status === "requested") {
    return "Submitted";
  }
  if (status === "in_review") {
    return "In review";
  }
  if (status === "ready_for_admin") {
    return "Ready for admin";
  }
  if (status === "approved_for_release") {
    return "Approved for release";
  }
  if (status === "released") {
    return "Released";
  }
  if (status === "withdrawn") {
    return "Withdrawn";
  }
  return "Rejected";
}

function requestStatusDate(request: FundingRequestRecord) {
  if (request.status === "released") {
    return `Released ${formatDate(request.releaseDate ?? request.releasedAt)}`;
  }
  if (request.status === "approved_for_release") {
    return `Approved for release ${formatDate(request.reviewedAt)}`;
  }
  if (request.status === "ready_for_admin") {
    return `Ready for admin ${formatDate(request.readyForAdminAt)}`;
  }
  if (request.status === "in_review") {
    return `Review started ${formatDate(request.operationsReviewStartedAt)}`;
  }
  if (request.status === "withdrawn") {
    return `Withdrawn ${formatDate(request.withdrawnAt)}`;
  }
  if (request.status === "rejected") {
    return `Rejected ${formatDate(request.reviewedAt)}`;
  }
  return `Submitted ${formatDate(request.requestedAt)}`;
}

function drawReviewStageCopy(request: FundingRequestRecord) {
  if (request.status === "in_review") {
    return `Review started ${relativeDate(request.operationsReviewStartedAt)}`;
  }
  if (request.status === "ready_for_admin") {
    return `Prepared for admin ${relativeDate(request.readyForAdminAt)}`;
  }
  return `Submitted ${relativeDate(request.requestedAt)}`;
}

function sumCents(rows: FundingRequestRecord[]) {
  return rows.reduce((total, row) => total + positiveCents(row.amountCents), 0);
}

function positiveCents(value: number) {
  return Math.max(0, Math.round(value));
}

function byOrder(a: { order: number }, b: { order: number }) {
  return a.order - b.order;
}

function mostRecentRequestFirst(
  a: FundingRequestRecord,
  b: FundingRequestRecord
) {
  return (b.requestedAt ?? "").localeCompare(a.requestedAt ?? "");
}

function addDays(iso: string, days: number) {
  const date = new Date(`${iso.slice(0, 10)}T12:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + Math.round(days));
  return date.toISOString().slice(0, 10);
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function formatCad(cents: number) {
  return CAD_FORMATTER.format(cents / 100);
}

function formatDate(value?: string) {
  if (!value) {
    return "Date unavailable";
  }
  const date = new Date(value.length === 10 ? `${value}T12:00:00.000Z` : value);
  if (Number.isNaN(date.valueOf())) {
    return "Date unavailable";
  }
  return DATE_FORMATTER.format(date);
}

function formatDateTime(value: string) {
  const date = new Date(value);
  return DATE_TIME_FORMATTER.format(date);
}

function relativeDate(value?: string) {
  if (!value) {
    return "recently";
  }
  const days = Math.max(
    0,
    Math.floor((Date.now() - new Date(value).valueOf()) / 86_400_000)
  );
  if (days === 0) {
    return "today";
  }
  if (days === 1) {
    return "1 day ago";
  }
  return `${days} days ago`;
}

function centsToInput(cents: number) {
  return (Math.max(0, cents) / 100).toFixed(2);
}

function drawRequestErrorMessage(
  cause: unknown,
  action: "submit" | "withdraw"
) {
  const raw = cause instanceof Error ? cause.message.trim() : "";
  const message = raw.match(CONVEX_ERROR_PATTERN)?.[1]?.trim() ?? raw;
  if (DRAW_AVAILABILITY_ERROR_PATTERN.test(message)) {
    return "Your available balance changed. Close this window, review the updated amount, and try again.";
  }
  if (DRAW_PERMISSION_ERROR_PATTERN.test(message)) {
    return "You no longer have permission to change draw requests. Ask an account administrator for help.";
  }
  if (DRAW_STATUS_ERROR_PATTERN.test(message)) {
    return "This request is no longer awaiting approval. Refresh the page to see its latest status.";
  }
  if (DRAW_NETWORK_ERROR_PATTERN.test(message)) {
    return "We could not reach Fairlend. Check your connection and try again; your request details are still here.";
  }
  return action === "submit"
    ? "We could not submit this draw request. Try again, or contact Fairlend if the problem continues."
    : "We could not withdraw this draw request. Refresh its status or contact Fairlend for help.";
}

function drawReviewSuccessMessage(
  action: "approve" | "reject" | "release" | "start" | "submit",
  request: FundingRequestRecord
) {
  const requestId = request.displayId ?? request.drawKey;
  if (action === "start") {
    return `${requestId} review started.`;
  }
  if (action === "submit") {
    return `${requestId} sent to admin.`;
  }
  if (action === "approve") {
    return `${requestId} approved for release.`;
  }
  if (action === "reject") {
    return `${requestId} rejected.`;
  }
  return `${requestId} released.`;
}

function drawReviewErrorMessage(cause: unknown) {
  const raw = cause instanceof Error ? cause.message.trim() : "";
  const message = raw.match(CONVEX_ERROR_PATTERN)?.[1]?.trim() ?? raw;
  if (DRAW_PERMISSION_ERROR_PATTERN.test(message)) {
    return "You no longer have permission to review draw requests. Ask a Fairlend administrator for access.";
  }
  if (DRAW_STATUS_ERROR_PATTERN.test(message)) {
    return "This draw request changed status. Refresh the page to review its latest state.";
  }
  if (DRAW_NETWORK_ERROR_PATTERN.test(message)) {
    return "We could not reach Fairlend. Check your connection and try again.";
  }
  return message || "We could not update this draw request. Try again.";
}

export function parseCadToCents(value: string) {
  const normalized = value.trim().replace(CAD_INPUT_CLEANUP_PATTERN, "");
  if (!CAD_INPUT_PATTERN.test(normalized)) {
    return 0;
  }
  const [dollars, cents = ""] = normalized.split(".");
  const result = Number(dollars) * 100 + Number(cents.padEnd(2, "0"));
  return Number.isSafeInteger(result) ? result : 0;
}

function createOperationId() {
  return (
    globalThis.crypto?.randomUUID?.() ??
    `draw-${Date.now()}-${Math.random().toString(16).slice(2)}`
  );
}
