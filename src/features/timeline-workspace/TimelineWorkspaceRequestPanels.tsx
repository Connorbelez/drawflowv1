import { Banknote, CalendarDays, Check, ShieldCheck, X } from "lucide-react";
import { type FormEvent, useEffect, useState } from "react";

import { Badge } from "#/components/ui/badge.tsx";
import { Button } from "#/components/ui/button.tsx";
import { Input } from "#/components/ui/input.tsx";
import { Textarea } from "#/components/ui/textarea.tsx";
import {
  calculateApprovedDrawRequestLimit,
  calculateDrawRequestLimit,
  formatTimelineDay,
  getDrawDomId,
  getDrawRequestStatusLabel,
} from "./TimelineWorkspaceDrawUtils.ts";
import { money } from "./TimelineWorkspaceDefaults.ts";
import type {
  DemoDraw,
  DemoMilestone,
} from "./-timeline-share-snapshot.ts";
import type { TimelineItem } from "#/components/roadmap/AnimatedCurvedTimeline.tsx";

export function DrawRequestPanel({
  draw,
  drawItem,
  draws,
  items,
  onSubmitDrawRequest,
  onUpdatePlannedDraw,
  requiresApprovedMilestones,
  approvedDrawLimit,
}: {
  draw: DemoDraw;
  drawItem: TimelineItem<DemoMilestone> | null;
  draws: DemoDraw[];
  items: TimelineItem<DemoMilestone>[];
  onSubmitDrawRequest: (
    drawId: string,
    request: { amount: number; note?: string; x?: number }
  ) => void;
  onUpdatePlannedDraw: (
    drawId: string,
    patch: { amount?: number; x?: number }
  ) => void;
  requiresApprovedMilestones: boolean;
  approvedDrawLimit?: number;
}) {
  const [requestedDay, setRequestedDay] = useState(() => Math.round(draw.x));
  const [requestedAmount, setRequestedAmount] = useState(() =>
    Math.round(draw.amount)
  );
  useEffect(() => {
    setRequestedDay(Math.round(draw.x));
    setRequestedAmount(Math.round(draw.amount));
  }, [draw.amount, draw.x]);
  const requestedDraw = { ...draw, x: requestedDay };
  const predictedLimit = calculateDrawRequestLimit(
    requestedDraw,
    items,
    draws,
    approvedDrawLimit
  );
  const requestableLimit = requiresApprovedMilestones
    ? calculateApprovedDrawRequestLimit(
        requestedDraw,
        items,
        draws,
        approvedDrawLimit
      )
    : predictedLimit;
  const blockingMilestones: string[] =
    "blockingMilestones" in requestableLimit
      ? (requestableLimit.blockingMilestones as string[])
      : [];
  const overLimit = requestedAmount > requestableLimit.availableLimit;
  const blockedByMilestoneApproval =
    requiresApprovedMilestones && blockingMilestones.length > 0;
  const requestSubmitted =
    draw.requestStatus === "requested" ||
    draw.requestStatus === "approved" ||
    draw.requestStatus === "rejected";
  const requestAmountId = `draw-request-amount-${draw.id}`;
  const requestNoteId = `draw-request-note-${draw.id}`;
  const plannedDrawEditable = !requestSubmitted;

  const savePlannedDraw = () => {
    if (!plannedDrawEditable) {
      return;
    }
    onUpdatePlannedDraw(draw.id, {
      amount: requestedAmount,
      x: requestedDay,
    });
  };

  const submitRequest = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const requestedAmount = Math.round(
      Number(formData.get("drawRequestAmount") ?? draw.amount)
    );
    const requestedX = Math.round(
      Number(formData.get("drawRequestDate") ?? draw.x)
    );
    const note = String(formData.get("drawRequestNote") ?? "").trim();

    if (!(Number.isFinite(requestedAmount) && Number.isFinite(requestedX))) {
      return;
    }

    const requestedDraw = { ...draw, x: requestedX };
    const requestLimit = requiresApprovedMilestones
      ? calculateApprovedDrawRequestLimit(
          requestedDraw,
          items,
          draws,
          approvedDrawLimit
        )
      : calculateDrawRequestLimit(
          requestedDraw,
          items,
          draws,
          approvedDrawLimit
        );

    onSubmitDrawRequest(draw.id, {
      amount: Math.min(
        Math.max(0, requestedAmount),
        requestLimit.availableLimit
      ),
      ...(note ? { note } : {}),
      x: requestedX,
    });
  };

  return (
    <div className="grid gap-4" data-testid="selected-draw-details">
      <div>
        <div className="mb-3 grid size-10 place-items-center rounded-md bg-sky-500/10 text-sky-600">
          <Banknote className="size-5" />
        </div>
        <p className="font-semibold text-[10px] text-muted-foreground uppercase">
          Draw request
        </p>
        <h2 className="mt-1 font-semibold text-lg">{draw.label}</h2>
        <p className="mt-1 text-muted-foreground text-sm">
          {drawItem?.data?.name ?? "Reimbursement draw event"} ·{" "}
          {formatTimelineDay(draw.x)}
        </p>
        <Badge
          className="mt-3"
          variant={draw.requestStatus === "approved" ? "success" : "outline"}
        >
          {requestSubmitted
            ? getDrawRequestStatusLabel(draw.requestStatus)
            : "Builder request"}
        </Badge>
      </div>

      <dl className="grid gap-2 border-border border-t pt-3 text-sm">
        <div className="flex items-center justify-between gap-3">
          <dt className="text-muted-foreground">Unlocked by day</dt>
          <dd
            className="font-semibold tabular-nums"
            data-testid={`selected-draw-total-unlocked-${getDrawDomId(draw)}`}
          >
            {money(predictedLimit.totalUnlocked)}
          </dd>
        </div>
        <div className="flex items-center justify-between gap-3">
          <dt className="text-muted-foreground">Already drawn</dt>
          <dd
            className="font-medium tabular-nums"
            data-testid={`selected-draw-already-drawn-${getDrawDomId(draw)}`}
          >
            {money(requestableLimit.alreadyDrawn)}
          </dd>
        </div>
        <div className="flex items-center justify-between gap-3">
          <dt className="text-muted-foreground">Available draw limit</dt>
          <dd
            className="font-semibold text-sky-700 tabular-nums dark:text-sky-100"
            data-testid={`selected-draw-available-limit-${getDrawDomId(draw)}`}
          >
            {money(requestableLimit.availableLimit)}
          </dd>
        </div>
        <div className="flex items-center justify-between gap-3">
          <dt className="text-muted-foreground">Remaining after request</dt>
          <dd
            className="font-medium tabular-nums"
            data-testid={`selected-draw-remaining-limit-${getDrawDomId(draw)}`}
          >
            {money(
              Math.max(0, requestableLimit.availableLimit - requestedAmount)
            )}
          </dd>
        </div>
      </dl>

      {overLimit ? (
        <div
          className="rounded-md border border-amber-500/25 bg-amber-500/10 px-3 py-2 text-amber-800 text-xs dark:text-amber-100"
          data-testid={`selected-draw-request-limit-warning-${getDrawDomId(draw)}`}
        >
          The current requested amount is above the available request limit.
          Submitting will clamp the request to{" "}
          {money(requestableLimit.availableLimit)}.
        </div>
      ) : null}

      {blockedByMilestoneApproval ? (
        <div
          className="rounded-md border border-amber-500/25 bg-amber-500/10 px-3 py-2 text-amber-800 text-xs dark:text-amber-100"
          data-testid={`selected-draw-approval-blockers-${getDrawDomId(draw)}`}
        >
          Complete and admin-approve these milestones before requesting this
          draw: {blockingMilestones.join(", ")}.
        </div>
      ) : null}

      <form
        className="grid gap-3 rounded-lg border border-border bg-muted/20 p-3"
        data-testid={`selected-draw-request-form-${getDrawDomId(draw)}`}
        key={`${draw.id}-${draw.requestedAt ?? "draft"}-${draw.amount}-${draw.x}`}
        onSubmit={submitRequest}
      >
        <div>
          <p className="font-medium text-[10px] text-muted-foreground uppercase">
            Builder draw request
          </p>
          <p className="mt-1 text-muted-foreground text-xs">
            Request reimbursement up to the unlocked capacity available on this
            draw date.
          </p>
        </div>

        <label
          className="grid gap-1.5"
          htmlFor={`draw-request-date-${draw.id}`}
        >
          <span className="font-medium text-[10px] text-muted-foreground uppercase">
            Draw date
          </span>
          <Input
            data-testid={`selected-draw-request-date-input-${getDrawDomId(draw)}`}
            id={`draw-request-date-${draw.id}`}
            min={0}
            name="drawRequestDate"
            nativeInput
            onChange={(event) =>
              setRequestedDay(Math.round(Number(event.currentTarget.value)))
            }
            size="sm"
            step={1}
            type="number"
            value={requestedDay}
          />
        </label>

        <label className="grid gap-1.5" htmlFor={requestAmountId}>
          <span className="font-medium text-[10px] text-muted-foreground uppercase">
            Requested amount
          </span>
          <Input
            data-testid={`selected-draw-request-amount-input-${getDrawDomId(draw)}`}
            id={requestAmountId}
            max={requestableLimit.availableLimit}
            min={0}
            name="drawRequestAmount"
            nativeInput
            onChange={(event) =>
              setRequestedAmount(Math.round(Number(event.currentTarget.value)))
            }
            size="sm"
            step={1000}
            type="number"
            value={requestedAmount}
          />
        </label>

        <label className="grid gap-1.5" htmlFor={requestNoteId}>
          <span className="font-medium text-[10px] text-muted-foreground uppercase">
            Builder note
          </span>
          <Textarea
            className="min-h-20 resize-none text-sm"
            data-testid={`selected-draw-request-note-${getDrawDomId(draw)}`}
            defaultValue={draw.requestNote ?? ""}
            id={requestNoteId}
            name="drawRequestNote"
            placeholder="Scope covered, evidence reference, or lender context"
          />
        </label>

        <Button
          className="w-full"
          data-testid={`selected-draw-save-planned-${getDrawDomId(draw)}`}
          disabled={!plannedDrawEditable}
          onClick={savePlannedDraw}
          size="sm"
          type="button"
          variant="outline"
        >
          <CalendarDays />
          Save planned draw
        </Button>

        <Button
          className="w-full"
          data-testid={`selected-draw-submit-request-${getDrawDomId(draw)}`}
          disabled={
            blockedByMilestoneApproval || requestableLimit.availableLimit <= 0
          }
          size="sm"
          type="submit"
        >
          <Banknote />
          {requestSubmitted ? "Update draw request" : "Request draw"}
        </Button>
      </form>

      <div className="rounded-lg border border-border bg-muted/20 p-3">
        <p className="font-medium text-[10px] text-muted-foreground uppercase">
          Request basis
        </p>
        <p className="mt-2 text-muted-foreground text-xs leading-5">
          Unlocked by day shows scheduled milestone capacity. Request limit ={" "}
          {requiresApprovedMilestones
            ? "admin-approved completed milestone budget"
            : "total completed milestone budget"}{" "}
          unlocked by {formatTimelineDay(requestedDay)} minus prior released
          draws. Completion and evidence are handled from the milestone panel.
        </p>
      </div>
    </div>
  );
}
export function LenderDrawReviewPanel({
  draw,
  drawItem,
  draws,
  items,
  onReviewDrawRequest,
  approvedDrawLimit,
}: {
  draw: DemoDraw;
  drawItem: TimelineItem<DemoMilestone> | null;
  draws: DemoDraw[];
  items: TimelineItem<DemoMilestone>[];
  onReviewDrawRequest: (
    drawId: string,
    review: { note?: string; status: "approved" | "rejected" }
  ) => void;
  approvedDrawLimit?: number;
}) {
  const limit = calculateDrawRequestLimit(
    draw,
    items,
    draws,
    approvedDrawLimit
  );
  const hasBuilderRequest =
    draw.requestStatus === "requested" ||
    draw.requestStatus === "approved" ||
    draw.requestStatus === "rejected";
  const requestedAmountOverLimit = draw.amount > limit.availableLimit;
  const drawDomId = getDrawDomId(draw);
  const reviewTitleId = `lender-draw-review-title-${drawDomId}`;
  const decisionTitleId = `lender-draw-decision-title-${drawDomId}`;
  const reviewNoteId = `lender-draw-review-note-${drawDomId}`;
  const approvalGuidanceId = `lender-draw-approval-guidance-${drawDomId}`;
  const approvalGuidance = hasBuilderRequest
    ? requestedAmountOverLimit
      ? "Approve is unavailable because the requested amount exceeds the available draw limit."
      : ""
    : "Approve is unavailable until the builder files a draw request.";
  const submitReview = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const submitter = (event.nativeEvent as SubmitEvent)
      .submitter as HTMLButtonElement | null;
    const status = submitter?.value === "approved" ? "approved" : "rejected";
    const note = String(formData.get("drawReviewNote") ?? "").trim();

    onReviewDrawRequest(draw.id, {
      ...(note ? { note } : {}),
      status,
    });
  };

  return (
    <section
      aria-labelledby={reviewTitleId}
      className="grid gap-4"
      data-testid={`lender-draw-review-panel-${drawDomId}`}
    >
      <div>
        <div className="mb-3 grid size-10 place-items-center rounded-md bg-emerald-500/10 text-emerald-700 dark:text-emerald-200">
          <ShieldCheck className="size-5" />
        </div>
        <p className="font-semibold text-[10px] text-muted-foreground uppercase">
          Lender draw review
        </p>
        <h2 className="mt-1 font-semibold text-lg" id={reviewTitleId}>
          {draw.label} lender draw review
        </h2>
        <p className="mt-1 text-muted-foreground text-sm">
          {drawItem?.data?.name ?? "Reimbursement draw event"} ·{" "}
          {formatTimelineDay(draw.x)}
        </p>
        <Badge
          className="mt-3"
          variant={draw.requestStatus === "approved" ? "success" : "outline"}
        >
          {getDrawRequestStatusLabel(draw.requestStatus)}
        </Badge>
      </div>

      <dl
        aria-label={`${draw.label} review financial summary`}
        className="grid gap-2 border-border border-t pt-3 text-sm"
      >
        <div className="flex items-center justify-between gap-3">
          <dt className="text-muted-foreground">Requested amount</dt>
          <dd
            className="font-semibold tabular-nums"
            data-testid={`lender-draw-requested-amount-${getDrawDomId(draw)}`}
          >
            {money(draw.amount)}
          </dd>
        </div>
        <div className="flex items-center justify-between gap-3">
          <dt className="text-muted-foreground">Available limit</dt>
          <dd
            className="font-semibold text-sky-700 tabular-nums dark:text-sky-100"
            data-testid={`lender-draw-available-limit-${getDrawDomId(draw)}`}
          >
            {money(limit.availableLimit)}
          </dd>
        </div>
        <div className="flex items-center justify-between gap-3">
          <dt className="text-muted-foreground">Prior releases</dt>
          <dd className="font-medium tabular-nums">
            {money(limit.alreadyDrawn)}
          </dd>
        </div>
        <div className="flex items-center justify-between gap-3">
          <dt className="text-muted-foreground">Post-approval capacity</dt>
          <dd className="font-medium tabular-nums">
            {money(Math.max(0, limit.availableLimit - draw.amount))}
          </dd>
        </div>
      </dl>

      {requestedAmountOverLimit ? (
        <div
          aria-label="Requested amount exceeds the available draw limit."
          className="rounded-md border border-amber-500/25 bg-amber-500/10 px-3 py-2 text-amber-800 text-xs dark:text-amber-100"
          role="alert"
        >
          Requested amount exceeds the available draw limit at this point in the
          schedule.
        </div>
      ) : null}

      <form
        aria-labelledby={decisionTitleId}
        className="grid gap-3 rounded-lg border border-border bg-muted/20 p-3"
        data-testid={`lender-draw-review-form-${drawDomId}`}
        onSubmit={submitReview}
      >
        <div>
          <p
            className="font-medium text-[10px] text-muted-foreground uppercase"
            id={decisionTitleId}
          >
            Draw approval decision
          </p>
          <p className="mt-1 text-muted-foreground text-xs">
            Review the builder request against unlocked capacity and release
            policy.
          </p>
        </div>
        {draw.requestNote ? (
          <div className="rounded-md border border-border bg-background/60 px-3 py-2 text-xs">
            <span className="text-muted-foreground">Builder note: </span>
            {draw.requestNote}
          </div>
        ) : null}
        {hasBuilderRequest ? null : (
          <div className="rounded-md border border-border bg-background/60 px-3 py-2 text-muted-foreground text-xs">
            No builder request has been filed for this draw. The review actions
            stay disabled until a request exists.
          </div>
        )}
        <label className="grid gap-1.5" htmlFor={reviewNoteId}>
          <span className="font-medium text-xs">
            Review reason or condition
          </span>
          <Textarea
            className="min-h-20 resize-none text-sm"
            data-testid={`lender-draw-review-note-${drawDomId}`}
            defaultValue={draw.requestReviewNote ?? ""}
            id={reviewNoteId}
            name="drawReviewNote"
            placeholder="Approval condition, holdback reason, or audit note"
          />
        </label>
        <div className="grid grid-cols-2 gap-2">
          <Button
            className="max-sm:min-h-11"
            data-testid={`lender-draw-reject-${drawDomId}`}
            disabled={!hasBuilderRequest}
            name="drawReviewStatus"
            size="sm"
            type="submit"
            value="rejected"
            variant="outline"
          >
            <X />
            Reject
          </Button>
          <Button
            aria-describedby={approvalGuidance ? approvalGuidanceId : undefined}
            className="max-sm:min-h-11"
            data-testid={`lender-draw-approve-${drawDomId}`}
            disabled={!hasBuilderRequest || requestedAmountOverLimit}
            name="drawReviewStatus"
            size="sm"
            type="submit"
            value="approved"
          >
            <Check />
            Approve
          </Button>
        </div>
        {approvalGuidance ? (
          <p className="text-muted-foreground text-xs" id={approvalGuidanceId}>
            {approvalGuidance}
          </p>
        ) : null}
      </form>

      <div className="rounded-lg border border-border bg-muted/20 p-3">
        <p className="font-medium text-[10px] text-muted-foreground uppercase">
          Review basis
        </p>
        <p className="mt-2 text-muted-foreground text-xs leading-5">
          Approval is capped by work completed before{" "}
          {formatTimelineDay(draw.x)}, less any prior releases. Site visits and
          completion evidence are reviewed from the milestone panel.
        </p>
      </div>
    </section>
  );
}
