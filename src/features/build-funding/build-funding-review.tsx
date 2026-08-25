"use client";

import { CalendarClock, ClipboardCheck, History } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

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
  CardHeader,
  CardTitle,
} from "#/components/ui/card.tsx";
import { DrawRejectionDialog } from "#/features/build-funding/DrawRejectionDialog.tsx";
import type { DrawWorkflowCapabilities } from "#/features/draw-workflow/drawWorkflow.ts";
import { getDrawWorkflowActions } from "#/features/draw-workflow/drawWorkflow.ts";
import type {
  FundingForecastRecord,
  FundingMilestoneRecord,
  FundingRejectAction,
  FundingRequestAction,
  FundingRequestRecord,
} from "./build-funding-contracts.ts";
import {
  addDays,
  drawReviewErrorMessage,
  drawReviewSuccessMessage,
  drawReviewStageCopy,
  formatCad,
  formatDate,
  formatDateTime,
  milestoneDateCopy,
  requestBadgeTone,
  requestStatusLabel,
} from "./build-funding-contracts.ts";
import { WithdrawRequestDialog } from "./build-funding-request.tsx";
import { DrawSourceAttribution } from "./build-funding-timeline.tsx";

const FUNDING_ASIDE_CLASS =
  "order-2 min-w-0 border-t pt-5 xl:sticky xl:top-4 xl:col-start-2 xl:row-span-2 xl:row-start-1 xl:border-t-0 xl:border-l xl:pt-0 xl:pl-6";

export function FundingDrawApprovalActions({
  buildLabel,
  capabilities,
  onApproveDraw,
  onClose,
  onRejectDraw,
  onReleaseDraw,
  onStartDrawReview,
  onSubmitDrawForAdmin,
  onWithdrawDraw,
  request,
  viewerRole,
}: {
  buildLabel: string;
  capabilities: DrawWorkflowCapabilities;
  onApproveDraw?: FundingRequestAction;
  onClose: () => void;
  onRejectDraw?: FundingRejectAction;
  onReleaseDraw?: FundingRequestAction;
  onStartDrawReview?: FundingRequestAction;
  onSubmitDrawForAdmin?: FundingRequestAction;
  onWithdrawDraw?: (requestKey: string) => Promise<unknown>;
  request: FundingRequestRecord;
  viewerRole: "builder" | "lender";
}) {
  const { pendingAction, reviewError, runRejectAction, runReviewAction } =
    useFundingDrawReviewActions(onRejectDraw);
  const workflow = getDrawWorkflowActions({
    canonicalIdAvailable: Boolean(request._id),
    capabilities,
    status: request.status,
  });
  const hasAvailableAction = fundingDrawActionIsAvailable({
    onApproveDraw,
    onRejectDraw,
    onReleaseDraw,
    onStartDrawReview,
    onSubmitDrawForAdmin,
    workflow,
  });
  const canWithdraw =
    viewerRole === "builder" &&
    request.status === "requested" &&
    Boolean(onWithdrawDraw);

  return (
    <>
      {reviewError ? (
        <p className="text-destructive-text text-xs" role="alert">
          {reviewError}
        </p>
      ) : null}
      {hasAvailableAction || canWithdraw ? null : (
        <p className="text-muted-foreground text-xs" role="status">
          Your current role can view this Draw, but it cannot perform the next
          workflow action.
        </p>
      )}
      <div className="flex w-full flex-wrap gap-2">
        <Button className="flex-1" onClick={onClose} variant="outline">
          Close
        </Button>
        {canWithdraw && onWithdrawDraw ? (
          <WithdrawRequestDialog
            onWithdraw={() => onWithdrawDraw(request.drawKey)}
          />
        ) : null}
        {workflow.secondary?.operation === "reject" && onRejectDraw ? (
          <DrawRejectionDialog
            amountCents={request.amountCents}
            buildLabel={buildLabel}
            disabled={Boolean(pendingAction)}
            loading={pendingAction === `reject:${request.drawKey}`}
            onReject={(reason) => runRejectAction(request, reason)}
            requestKey={request.drawKey}
            requestLabel={request.displayId ?? request.drawKey}
            triggerTestId={`draw-approval-reject-${request.drawKey}`}
          />
        ) : null}
        {workflow.primary?.operation === "start_review" && onStartDrawReview ? (
          <Button
            className="flex-1"
            data-testid={`draw-approval-start-${request.drawKey}`}
            disabled={Boolean(pendingAction)}
            loading={pendingAction === `start:${request.drawKey}`}
            onClick={() => runReviewAction("start", request, onStartDrawReview)}
          >
            {workflow.primary.label}
          </Button>
        ) : null}
        {workflow.primary?.operation === "submit_for_admin" &&
        onSubmitDrawForAdmin ? (
          <Button
            className="flex-1"
            data-testid={`draw-approval-submit-${request.drawKey}`}
            disabled={Boolean(pendingAction)}
            loading={pendingAction === `submit:${request.drawKey}`}
            onClick={() =>
              runReviewAction("submit", request, onSubmitDrawForAdmin)
            }
          >
            {workflow.primary.label}
          </Button>
        ) : null}
        {workflow.primary?.operation === "approve" && onApproveDraw ? (
          <Button
            className="flex-1"
            data-testid={`draw-approval-approve-${request.drawKey}`}
            disabled={Boolean(pendingAction)}
            loading={pendingAction === `approve:${request.drawKey}`}
            onClick={() => runReviewAction("approve", request, onApproveDraw)}
          >
            {workflow.primary.label}
          </Button>
        ) : null}
        {workflow.primary?.operation === "release" && onReleaseDraw ? (
          <ReleaseDrawDialog
            disabled={Boolean(pendingAction)}
            loading={pendingAction === `release:${request.drawKey}`}
            onRelease={() => runReviewAction("release", request, onReleaseDraw)}
            request={request}
            triggerTestId={`draw-approval-release-${request.drawKey}`}
          />
        ) : null}
      </div>
    </>
  );
}

function fundingDrawActionIsAvailable({
  onApproveDraw,
  onRejectDraw,
  onReleaseDraw,
  onStartDrawReview,
  onSubmitDrawForAdmin,
  workflow,
}: {
  onApproveDraw?: FundingRequestAction;
  onRejectDraw?: FundingRejectAction;
  onReleaseDraw?: FundingRequestAction;
  onStartDrawReview?: FundingRequestAction;
  onSubmitDrawForAdmin?: FundingRequestAction;
  workflow: ReturnType<typeof getDrawWorkflowActions>;
}) {
  const primary = workflow.primary?.operation;
  return Boolean(
    (primary === "approve" && onApproveDraw) ||
      (primary === "release" && onReleaseDraw) ||
      (primary === "start_review" && onStartDrawReview) ||
      (primary === "submit_for_admin" && onSubmitDrawForAdmin) ||
      (workflow.secondary?.operation === "reject" && onRejectDraw)
  );
}

function useFundingDrawReviewActions(onRejectDraw?: FundingRejectAction) {
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [reviewError, setReviewError] = useState("");
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
  const runRejectAction = async (
    request: FundingRequestRecord,
    reason: string
  ) => {
    if (!(onRejectDraw && !pendingAction)) {
      return false;
    }
    const actionKey = `reject:${request.drawKey}`;
    setPendingAction(actionKey);
    setReviewError("");
    try {
      await onRejectDraw({ reason, request });
      toast.success(drawReviewSuccessMessage("reject", request));
      return true;
    } catch (cause) {
      setReviewError(drawReviewErrorMessage(cause));
      return false;
    } finally {
      setPendingAction(null);
    }
  };

  return { pendingAction, reviewError, runRejectAction, runReviewAction };
}

export function drawApprovalDetails(
  request: FundingRequestRecord
): Array<{ label: string; value: string }> {
  return [
    ...(request.workOrderKey
      ? [{ label: "Work order", value: request.workOrderKey }]
      : []),
    ...(request.requestedAt
      ? [{ label: "Submitted", value: formatDateTime(request.requestedAt) }]
      : []),
    ...(request.operationsReviewStartedAt
      ? [
          {
            label: "Review started",
            value: formatDateTime(request.operationsReviewStartedAt),
          },
        ]
      : []),
    ...(request.readyForAdminAt
      ? [
          {
            label: "Ready for admin",
            value: formatDateTime(request.readyForAdminAt),
          },
        ]
      : []),
    ...(request.reviewedAt
      ? [{ label: "Approved", value: formatDateTime(request.reviewedAt) }]
      : []),
    ...(request.releasedAt
      ? [{ label: "Released", value: formatDateTime(request.releasedAt) }]
      : []),
  ];
}

export function drawDecisionDetails(
  request: FundingRequestRecord
): Array<{ label: string; value: string }> {
  return [
    ...(request.operationsRecommendationNote
      ? [
          {
            label: "Operations recommendation",
            value: request.operationsRecommendationNote,
          },
        ]
      : []),
    ...(request.requestReviewNote
      ? [{ label: "Review note", value: request.requestReviewNote }]
      : []),
  ];
}

export function LenderReviewSidebar({
  approvedAwaitingRelease,
  buildLabel,
  density,
  drawCapabilities,
  forecastDraws,
  historicalPlannedDraws,
  milestonesPendingReview,
  onApproveDraw,
  onOpenMilestone,
  onOpenDraw,
  onRejectDraw,
  onReleaseDraw,
  onStartDrawReview,
  onSubmitDrawForAdmin,
  released,
  startDate,
  submitted,
}: {
  approvedAwaitingRelease: FundingRequestRecord[];
  buildLabel: string;
  density: "guided" | "compact";
  drawCapabilities: DrawWorkflowCapabilities;
  forecastDraws: FundingForecastRecord[];
  historicalPlannedDraws: FundingForecastRecord[];
  milestonesPendingReview: FundingMilestoneRecord[];
  onApproveDraw?: FundingRequestAction;
  onOpenMilestone: (milestoneKey: string) => void;
  onOpenDraw?: (request: FundingRequestRecord) => void;
  onRejectDraw?: FundingRejectAction;
  onReleaseDraw?: FundingRequestAction;
  onStartDrawReview?: FundingRequestAction;
  onSubmitDrawForAdmin?: FundingRequestAction;
  released: FundingRequestRecord[];
  startDate: string;
  submitted: FundingRequestRecord[];
}) {
  const { pendingAction, reviewError, runRejectAction, runReviewAction } =
    useFundingDrawReviewActions(onRejectDraw);
  const actionCount =
    milestonesPendingReview.length +
    submitted.length +
    approvedAwaitingRelease.length;

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
          {submitted.map((request) => (
            <LenderDrawDecisionCard
              buildLabel={buildLabel}
              drawCapabilities={drawCapabilities}
              key={request.drawKey}
              onApproveDraw={onApproveDraw}
              onOpenDraw={onOpenDraw}
              onRejectDraw={onRejectDraw}
              onStartDrawReview={onStartDrawReview}
              onSubmitDrawForAdmin={onSubmitDrawForAdmin}
              pendingAction={pendingAction}
              request={request}
              runRejectAction={runRejectAction}
              runReviewAction={runReviewAction}
            />
          ))}
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
                disabled={
                  !(drawCapabilities.canRelease && onReleaseDraw) ||
                  Boolean(pendingAction)
                }
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
      <PastPlannedDraws draws={historicalPlannedDraws} startDate={startDate} />
    </aside>
  );
}

export function LenderDrawDecisionCard({
  buildLabel,
  drawCapabilities,
  onApproveDraw,
  onOpenDraw,
  onRejectDraw,
  onStartDrawReview,
  onSubmitDrawForAdmin,
  pendingAction,
  request,
  runRejectAction,
  runReviewAction,
}: {
  buildLabel: string;
  drawCapabilities: DrawWorkflowCapabilities;
  onApproveDraw?: FundingRequestAction;
  onOpenDraw?: (request: FundingRequestRecord) => void;
  onRejectDraw?: FundingRejectAction;
  onStartDrawReview?: FundingRequestAction;
  onSubmitDrawForAdmin?: FundingRequestAction;
  pendingAction: string | null;
  request: FundingRequestRecord;
  runRejectAction: ReturnType<
    typeof useFundingDrawReviewActions
  >["runRejectAction"];
  runReviewAction: ReturnType<
    typeof useFundingDrawReviewActions
  >["runReviewAction"];
}) {
  const workflow = getDrawWorkflowActions({
    canonicalIdAvailable: Boolean(request._id),
    capabilities: drawCapabilities,
    status: request.status,
  });
  return (
    <article className="py-3">
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
          <Badge className="mt-1" variant={requestBadgeTone(request.status)}>
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
      {workflow.open && onOpenDraw ? (
        <Button
          aria-label={`${workflow.open.label} ${request.displayId ?? request.drawKey}`}
          className="mt-3"
          data-testid={`lender-review-open-${request.drawKey}`}
          disabled={Boolean(pendingAction)}
          onClick={() => onOpenDraw(request)}
          size="sm"
          variant="outline"
        >
          {workflow.open.label}
        </Button>
      ) : null}
      <LenderDrawDecisionActions
        buildLabel={buildLabel}
        onApproveDraw={onApproveDraw}
        onRejectDraw={onRejectDraw}
        onStartDrawReview={onStartDrawReview}
        onSubmitDrawForAdmin={onSubmitDrawForAdmin}
        pendingAction={pendingAction}
        request={request}
        runRejectAction={runRejectAction}
        runReviewAction={runReviewAction}
        workflow={workflow}
      />
    </article>
  );
}

export function LenderDrawDecisionActions({
  buildLabel,
  onApproveDraw,
  onRejectDraw,
  onStartDrawReview,
  onSubmitDrawForAdmin,
  pendingAction,
  request,
  runRejectAction,
  runReviewAction,
  workflow,
}: {
  buildLabel: string;
  onApproveDraw?: FundingRequestAction;
  onRejectDraw?: FundingRejectAction;
  onStartDrawReview?: FundingRequestAction;
  onSubmitDrawForAdmin?: FundingRequestAction;
  pendingAction: string | null;
  request: FundingRequestRecord;
  runRejectAction: ReturnType<
    typeof useFundingDrawReviewActions
  >["runRejectAction"];
  runReviewAction: ReturnType<
    typeof useFundingDrawReviewActions
  >["runReviewAction"];
  workflow: ReturnType<typeof getDrawWorkflowActions>;
}) {
  return (
    <>
      {workflow.primary?.operation === "start_review" && onStartDrawReview ? (
        <Button
          className="mt-3"
          data-testid={`lender-review-start-${request.drawKey}`}
          disabled={Boolean(pendingAction)}
          loading={pendingAction === `start:${request.drawKey}`}
          onClick={() => runReviewAction("start", request, onStartDrawReview)}
          size="sm"
          variant="outline"
        >
          {workflow.primary.label}
        </Button>
      ) : null}
      {workflow.primary?.operation === "submit_for_admin" &&
      onSubmitDrawForAdmin ? (
        <Button
          className="mt-3"
          data-testid={`lender-review-submit-${request.drawKey}`}
          disabled={Boolean(pendingAction)}
          loading={pendingAction === `submit:${request.drawKey}`}
          onClick={() =>
            runReviewAction("submit", request, onSubmitDrawForAdmin)
          }
          size="sm"
          variant="outline"
        >
          {workflow.primary.label}
        </Button>
      ) : null}
      {workflow.primary?.operation === "approve" ||
      workflow.secondary?.operation === "reject" ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {workflow.primary?.operation === "approve" && onApproveDraw ? (
            <Button
              data-testid={`lender-review-approve-${request.drawKey}`}
              disabled={Boolean(pendingAction)}
              loading={pendingAction === `approve:${request.drawKey}`}
              onClick={() => runReviewAction("approve", request, onApproveDraw)}
              size="sm"
              variant="outline"
            >
              {workflow.primary.label}
            </Button>
          ) : null}
          {workflow.secondary?.operation === "reject" && onRejectDraw ? (
            <DrawRejectionDialog
              amountCents={request.amountCents}
              buildLabel={buildLabel}
              disabled={Boolean(pendingAction)}
              loading={pendingAction === `reject:${request.drawKey}`}
              onReject={(reason) => runRejectAction(request, reason)}
              requestKey={request.drawKey}
              requestLabel={request.displayId ?? request.drawKey}
              triggerTestId={`lender-review-reject-${request.drawKey}`}
            />
          ) : null}
        </div>
      ) : null}
    </>
  );
}

export function ReleaseDrawDialog({
  disabled,
  loading,
  onRelease,
  request,
  triggerTestId,
}: {
  disabled: boolean;
  loading: boolean;
  onRelease: () => Promise<boolean>;
  request: FundingRequestRecord;
  triggerTestId?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <AlertDialog onOpenChange={setOpen} open={open}>
      <AlertDialogTrigger
        disabled={disabled}
        render={
          <Button
            className="mt-3"
            data-testid={
              triggerTestId ?? `lender-review-release-${request.drawKey}`
            }
            size="sm"
            variant="outline"
          />
        }
      >
        Record release
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            Record release of {formatCad(request.amountCents)}?
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

export function FuturePlannedDraws({
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
          <article
            className="py-3"
            data-collaboration-focus={draw._id ? `draw:${draw._id}` : undefined}
            key={draw.drawKey}
          >
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

export function PastPlannedDraws({
  draws,
  startDate,
}: {
  draws: FundingForecastRecord[];
  startDate: string;
}) {
  if (draws.length === 0) {
    return null;
  }
  return (
    <section aria-labelledby="past-planned-draws-heading" className="mt-6">
      <div className="flex items-center justify-between gap-3">
        <h3
          className="flex items-center gap-2 font-semibold text-sm"
          id="past-planned-draws-heading"
        >
          <History aria-hidden="true" className="size-4" /> Planning history
        </h3>
        <Badge variant="secondary">{draws.length} past</Badge>
      </div>
      <div className="mt-3 divide-y border-y">
        {draws.map((draw) => (
          <article
            className="py-3"
            data-collaboration-focus={draw._id ? `draw:${draw._id}` : undefined}
            key={draw.drawKey}
          >
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
      </div>
    </section>
  );
}
