"use client";
import {
  lazy,
  useState,
} from "react";
import { Button } from "#/components/ui/button.tsx";
import { DrawRejectionDialog } from "#/features/build-funding/DrawRejectionDialog.tsx";
import {
  type DrawWorkflowCapabilities,
  getDrawWorkflowActions,
} from "#/features/draw-workflow/drawWorkflow.ts";
import type {
  MaterialPlanningItem,
} from "#/features/material-planning/MaterialPlanningTab.tsx";
import { cn } from "#/lib/utils.ts";

const LazyFieldRichTextPreview = lazy(() =>
  import("#/components/rich-text/field-rich-text.tsx").then((m) => ({
    default: m.FieldRichTextPreview,
  }))
);

import { formatCents, formatDate, } from "./format";
import type {
  ProductionBuildDetail,
  ProductionBuildDetailActions,
  ProductionBuildProjection,
  ProductionDraw,
} from "./production-build-detail-contracts.ts";
import {
  addDaysSafe,
  buildPercentComplete,
  compareDrawsMostRecentFirst,
  compareDrawsScheduleFirst,
  isRequestableDrawStatus,
} from "./production-build-detail-projection.ts";
import { DrawActionButton, StatusChip } from "./production-build-detail-draws.tsx";
import {
  Label,
  formatCoordinate,
} from "./production-build-detail-build-sheets.tsx";

export function DrawOverviewPanel({
  actions,
  currentOverview,
  detail,
  drawCapabilities,
  onOpenDraw,
  projection,
  viewerRole,
}: {
  actions?: ProductionBuildDetailActions;
  currentOverview: CurrentBuildOverview;
  detail: ProductionBuildDetail;
  drawCapabilities: DrawWorkflowCapabilities;
  onOpenDraw: (draw: ProductionDraw) => void;
  projection: ProductionBuildProjection;
  viewerRole: "builder" | "lender";
}) {
  const [pendingDrawAction, setPendingDrawAction] = useState<string | null>(
    null
  );
  const [drawActionError, setDrawActionError] = useState("");
  const canRequestDraw =
    Boolean(actions?.requestDraw) &&
    Boolean(currentOverview.upcomingDraw) &&
    isRequestableDrawStatus(currentOverview.upcomingDraw?.status) &&
    currentOverview.requestableAmountCents > 0 &&
    !pendingDrawAction;
  const inFlightDraws = projection.draws
    .filter(
      (draw) =>
        draw.status === "requested" ||
        draw.status === "in_review" ||
        draw.status === "ready_for_admin" ||
        draw.status === "approved_for_release"
    )
    .slice()
    .sort(compareDrawsMostRecentFirst);
  const approvalQueueDraws = inFlightDraws.filter(
    (draw) =>
      draw.status === "requested" ||
      draw.status === "in_review" ||
      draw.status === "ready_for_admin" ||
      draw.status === "approved_for_release"
  );
  const pastDraws = projection.draws
    .filter((draw) => draw.status === "released")
    .slice()
    .sort(compareDrawsMostRecentFirst);
  const scheduledDraws = projection.draws
    .filter((draw) => isRequestableDrawStatus(draw.status))
    .slice()
    .sort(compareDrawsScheduleFirst);
  const remainingFacilityCents = Math.max(
    0,
    currentOverview.totalApprovedCents - currentOverview.committedDrawCents
  );
  const runDrawAction = async (
    actionKey: string,
    draw: ProductionDraw,
    fn?: (draw: ProductionDraw) => Promise<unknown> | unknown
  ) => {
    if (!fn || pendingDrawAction) {
      return false;
    }
    setPendingDrawAction(`${actionKey}:${draw.drawKey}`);
    setDrawActionError("");
    try {
      await fn(draw);
      return true;
    } catch (cause) {
      setDrawActionError(
        cause instanceof Error ? cause.message : "Unable to update draw."
      );
      return false;
    } finally {
      setPendingDrawAction(null);
    }
  };
  const requestDrawNow = async () => {
    const requestDraw = actions?.requestDraw;
    const upcomingDraw = currentOverview.upcomingDraw;
    if (
      !(requestDraw && upcomingDraw) ||
      currentOverview.requestableAmountCents <= 0 ||
      pendingDrawAction
    ) {
      return;
    }
    await runDrawAction(
      "request",
      {
        ...upcomingDraw,
        amountCents: currentOverview.requestableAmountCents,
      },
      requestDraw
    );
  };

  return (
    <div className="grid gap-4" data-testid="draw-overview-panel">
      <section className="grid gap-3">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h3 className="font-semibold text-sm">Draw overview</h3>
            <p className="text-muted-foreground text-xs">
              Availability, requests, approvals, releases, and scheduled draws.
            </p>
          </div>
          {currentOverview.upcomingDraw ? (
            <StatusChip status={currentOverview.upcomingDraw.status} />
          ) : null}
        </div>

        <div className="grid gap-2 sm:grid-cols-3">
          <OverviewMetric
            label="Available now"
            testId="draw-overview-availability"
            value={formatCents(currentOverview.currentAvailabilityCents)}
          />
          <OverviewMetric
            label="Total approved"
            testId="draw-overview-total-approved"
            value={formatCents(currentOverview.totalApprovedCents)}
          />
          <OverviewMetric
            label="Committed draws"
            testId="draw-overview-committed-draws"
            value={formatCents(currentOverview.committedDrawCents)}
          />
          <OverviewMetric
            label="Drawn to date"
            testId="draw-overview-drawn-to-date"
            value={formatCents(currentOverview.drawnCents)}
          />
          <OverviewMetric
            label="Remaining facility"
            testId="draw-overview-remaining-facility"
            value={formatCents(remainingFacilityCents)}
          />
          <OverviewMetric
            label="Requestable now"
            testId="draw-overview-requestable-now"
            value={formatCents(currentOverview.requestableAmountCents)}
          />
        </div>
      </section>

      {viewerRole === "builder" ? (
        <section className="grid gap-3 border-border border-t pt-4">
          {currentOverview.upcomingDraw ? (
            <div
              className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto]"
              data-testid="draw-overview-upcoming-draw"
            >
              <div className="min-w-0">
                <p className="text-muted-foreground text-xs uppercase">
                  Upcoming draw
                </p>
                <p className="break-words font-medium text-sm">
                  {currentOverview.upcomingDraw.label}
                </p>
                <p className="mt-1 text-muted-foreground text-xs">
                  Planned{" "}
                  {formatDate(
                    addDaysSafe(
                      detail.build.startDate,
                      currentOverview.upcomingDraw.timingDay
                    )
                  )}{" "}
                  · planned amount{" "}
                  {formatCents(currentOverview.upcomingDraw.amountCents)}
                </p>
                <p className="mt-1 text-muted-foreground text-xs">
                  Requestable now:{" "}
                  {formatCents(currentOverview.requestableAmountCents)}
                </p>
              </div>
              <Button
                className="self-start"
                data-testid="draw-overview-request-now"
                disabled={!canRequestDraw}
                loading={pendingDrawAction?.startsWith("request:") ?? false}
                onClick={requestDrawNow}
                size="sm"
                type="button"
              >
                Request draw now
              </Button>
            </div>
          ) : (
            <p className="text-muted-foreground text-sm">
              No upcoming draw remains.
            </p>
          )}
        </section>
      ) : (
        <section
          className="grid gap-3 border-border border-t pt-4"
          data-testid="draw-overview-approval-queue"
        >
          <div>
            <h3 className="font-semibold text-sm">Draw approval queue</h3>
            <p className="text-muted-foreground text-xs">
              Review requested reimbursements, reject missing support, and
              release approved funds.
            </p>
          </div>
          {approvalQueueDraws.length > 0 ? (
            <div className="grid gap-2">
              {approvalQueueDraws.map((draw) => (
                <DrawSummaryItem
                  actions={actions}
                  detail={detail}
                  draw={draw}
                  drawCapabilities={drawCapabilities}
                  key={draw.drawKey}
                  onOpenDraw={onOpenDraw}
                  onRunAction={runDrawAction}
                  pendingActionKey={pendingDrawAction}
                  viewerRole={viewerRole}
                />
              ))}
            </div>
          ) : (
            <p className="rounded-md border border-dashed p-3 text-muted-foreground text-sm">
              No draw requests are waiting for lender action.
            </p>
          )}
        </section>
      )}

      {drawActionError ? (
        <p className="text-destructive text-xs" role="alert">
          {drawActionError}
        </p>
      ) : null}

      <DrawSummaryList
        detail={detail}
        drawCapabilities={drawCapabilities}
        draws={inFlightDraws}
        emptyLabel="No draw requests are currently awaiting approval or release."
        onOpenDraw={onOpenDraw}
        testId="draw-overview-in-flight-draws"
        title="In-flight draws"
      />
      <DrawSummaryList
        detail={detail}
        drawCapabilities={drawCapabilities}
        draws={pastDraws}
        emptyLabel="No released draws yet."
        onOpenDraw={onOpenDraw}
        testId="draw-overview-past-draws"
        title="Past draws"
      />
      <DrawSummaryList
        detail={detail}
        drawCapabilities={drawCapabilities}
        draws={scheduledDraws}
        emptyLabel="No scheduled draws remain."
        onOpenDraw={onOpenDraw}
        testId="draw-overview-scheduled-draws"
        title="Upcoming schedule"
      />
    </div>
  );
}

function DrawSummaryList({
  actions,
  detail,
  draws,
  drawCapabilities,
  emptyLabel,
  onOpenDraw,
  onRunAction,
  pendingActionKey,
  testId,
  title,
  viewerRole,
}: {
  actions?: ProductionBuildDetailActions;
  detail: ProductionBuildDetail;
  draws: ProductionDraw[];
  drawCapabilities: DrawWorkflowCapabilities;
  emptyLabel: string;
  onOpenDraw: (draw: ProductionDraw) => void;
  onRunAction?: (
    actionKey: string,
    draw: ProductionDraw,
    fn?: (draw: ProductionDraw) => Promise<unknown> | unknown
  ) => Promise<boolean>;
  pendingActionKey?: string | null;
  testId: string;
  title: string;
  viewerRole?: "builder" | "lender";
}) {
  return (
    <section
      className="grid gap-3 border-border border-t pt-4"
      data-testid={testId}
    >
      <div>
        <h3 className="font-semibold text-sm">{title}</h3>
        <p className="text-muted-foreground text-xs">
          {draws.length} draw{draws.length === 1 ? "" : "s"}
        </p>
      </div>
      {draws.length > 0 ? (
        <div className="grid gap-2">
          {draws.map((draw) => (
            <DrawSummaryItem
              actions={actions}
              detail={detail}
              draw={draw}
              drawCapabilities={drawCapabilities}
              key={draw.drawKey}
              onOpenDraw={onOpenDraw}
              onRunAction={onRunAction}
              pendingActionKey={pendingActionKey}
              viewerRole={viewerRole}
            />
          ))}
        </div>
      ) : (
        <p className="rounded-md border border-dashed p-3 text-muted-foreground text-sm">
          {emptyLabel}
        </p>
      )}
    </section>
  );
}

export function DrawSummaryItem({
  actions,
  actionTestIdPrefix = "draw-overview",
  detail,
  draw,
  drawCapabilities,
  onOpenDraw,
  onRunAction,
  pendingActionKey,
  viewerRole,
}: {
  actions?: ProductionBuildDetailActions;
  actionTestIdPrefix?: string;
  detail: ProductionBuildDetail;
  draw: ProductionDraw;
  drawCapabilities: DrawWorkflowCapabilities;
  onOpenDraw: (draw: ProductionDraw) => void;
  onRunAction?: (
    actionKey: string,
    draw: ProductionDraw,
    fn?: (draw: ProductionDraw) => Promise<unknown> | unknown
  ) => Promise<boolean>;
  pendingActionKey?: string | null;
  viewerRole?: "builder" | "lender";
}) {
  const milestoneName =
    draw.milestoneKey === undefined
      ? null
      : (detail.milestones.find(
          (milestone) => milestone.key === draw.milestoneKey
        )?.name ?? null);
  const plannedDate = addDaysSafe(detail.build.startDate, draw.timingDay);
  const releasedAt = draw.releasedAt ?? draw.releaseDate;

  return (
    <div
      className="grid gap-2 rounded-md border bg-background/60 p-3 sm:grid-cols-[minmax(0,1fr)_auto]"
      data-collaboration-focus={`draw:${draw._id}`}
      data-testid={`${actionTestIdPrefix}-draw-${draw.drawKey}`}
    >
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <p className="break-words font-medium text-sm">{draw.label}</p>
          <StatusChip status={draw.status} />
        </div>
        <p className="mt-1 text-muted-foreground text-xs">
          {milestoneName ? `${milestoneName} · ` : ""}
          Planned {formatDate(plannedDate)}
        </p>
        <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-muted-foreground text-xs">
          {draw.requestedAt ? (
            <span>Requested {formatDate(draw.requestedAt)}</span>
          ) : null}
          {draw.reviewedAt ? (
            <span>Reviewed {formatDate(draw.reviewedAt)}</span>
          ) : null}
          {releasedAt ? <span>Released {formatDate(releasedAt)}</span> : null}
        </div>
        {draw.requestNote ? (
          <p className="mt-2 text-muted-foreground text-xs">
            {draw.requestNote}
          </p>
        ) : null}
      </div>
      <div className="grid gap-2 text-left sm:justify-items-end sm:text-right">
        <p className="text-muted-foreground text-xs uppercase">Amount</p>
        <p className="font-semibold text-sm tabular-nums">
          {formatCents(draw.amountCents)}
        </p>
        {viewerRole === "lender" && onRunAction ? (
          <DrawActionGroup
            actions={actions}
            actionTestIdPrefix={actionTestIdPrefix}
            buildLabel={detail.build.buildName}
            draw={draw}
            drawCapabilities={drawCapabilities}
            onOpenDraw={onOpenDraw}
            onRunAction={onRunAction}
            pendingActionKey={pendingActionKey}
          />
        ) : null}
      </div>
    </div>
  );
}

export function DrawActionGroup({
  actions,
  actionTestIdPrefix = "draw-overview",
  buildLabel,
  draw,
  drawCapabilities,
  onOpenDraw,
  onRunAction,
  pendingActionKey,
}: {
  actions?: ProductionBuildDetailActions;
  actionTestIdPrefix?: string;
  buildLabel: string;
  draw: ProductionDraw;
  drawCapabilities: DrawWorkflowCapabilities;
  onOpenDraw?: (draw: ProductionDraw) => void;
  onRunAction: (
    actionKey: string,
    draw: ProductionDraw,
    fn?: (draw: ProductionDraw) => Promise<unknown> | unknown
  ) => Promise<boolean>;
  pendingActionKey?: string | null;
}) {
  const isPending = (actionKey: string) =>
    pendingActionKey === `${actionKey}:${draw.drawKey}`;
  const workflow = getDrawWorkflowActions({
    canonicalIdAvailable: Boolean(draw._id),
    capabilities: drawCapabilities,
    status: draw.status,
  });
  const primaryAction = workflow.primary;

  if (
    !(
      (workflow.open && onOpenDraw) ||
      primaryAction ||
      workflow.secondary?.operation === "reject"
    )
  ) {
    return null;
  }

  return (
    <div className="flex flex-wrap gap-1 sm:justify-end">
      {workflow.open && onOpenDraw ? (
        <DrawActionButton
          disabled={Boolean(pendingActionKey)}
          label={workflow.open.label}
          onClick={() => onOpenDraw(draw)}
          testId={`${actionTestIdPrefix}-open-${draw.drawKey}`}
        />
      ) : null}
      {primaryAction?.operation === "start_review" ? (
        <DrawActionButton
          disabled={!actions?.startDrawReview || Boolean(pendingActionKey)}
          label={isPending("start") ? "Starting..." : primaryAction.label}
          onClick={() => onRunAction("start", draw, actions?.startDrawReview)}
          testId={`${actionTestIdPrefix}-start-${draw.drawKey}`}
        />
      ) : null}
      {primaryAction?.operation === "submit_for_admin" ? (
        <DrawActionButton
          disabled={!actions?.submitDrawForAdmin || Boolean(pendingActionKey)}
          label={isPending("submit") ? "Sending..." : primaryAction.label}
          onClick={() =>
            onRunAction("submit", draw, actions?.submitDrawForAdmin)
          }
          testId={`${actionTestIdPrefix}-submit-${draw.drawKey}`}
        />
      ) : null}
      {primaryAction?.operation === "approve" ? (
        <DrawActionButton
          disabled={!actions?.approveDraw || Boolean(pendingActionKey)}
          label={isPending("approve") ? "Approving..." : primaryAction.label}
          onClick={() => onRunAction("approve", draw, actions?.approveDraw)}
          testId={`${actionTestIdPrefix}-approve-${draw.drawKey}`}
        />
      ) : null}
      {primaryAction?.operation === "release" ? (
        <DrawActionButton
          disabled={!actions?.releaseDraw || Boolean(pendingActionKey)}
          label={isPending("release") ? "Releasing..." : primaryAction.label}
          onClick={() => onRunAction("release", draw, actions?.releaseDraw)}
          testId={`${actionTestIdPrefix}-release-${draw.drawKey}`}
        />
      ) : null}
      {workflow.secondary?.operation === "reject" ? (
        <DrawRejectionDialog
          amountCents={draw.amountCents}
          buildLabel={buildLabel}
          disabled={!actions?.rejectDraw || Boolean(pendingActionKey)}
          loading={isPending("reject")}
          onReject={(reason) =>
            onRunAction("reject", draw, (targetDraw) =>
              actions?.rejectDraw?.({ draw: targetDraw, reason })
            )
          }
          requestKey={draw.drawKey}
          requestLabel={draw.label}
          triggerTestId={`${actionTestIdPrefix}-reject-${draw.drawKey}`}
        />
      ) : null}
    </div>
  );
}

export function BuildMetadataPanel({
  detail,
  openWarnings,
  projection,
  siteVisitsOpen,
}: {
  detail: ProductionBuildDetail;
  openWarnings: number;
  projection: ProductionBuildProjection;
  siteVisitsOpen: number;
}) {
  const percentComplete = buildPercentComplete(projection.milestones);
  return (
    <div data-testid="build-overview-build-panel">
      <h3 className="mb-3 font-semibold text-sm">Build Details</h3>
      <dl className="grid grid-cols-[minmax(0,1fr)] gap-y-1.5 text-sm sm:grid-cols-[120px_minmax(0,1fr)]">
        <Label>Loan number</Label>
        <dd className="min-w-0 break-words tabular-nums">
          FL-{detail.displayId ?? detail.build._id}
        </dd>
        <Label>Address</Label>
        <dd className="min-w-0 break-words">{detail.build.location}</dd>
        <Label>Latitude</Label>
        <dd className="min-w-0 break-words tabular-nums">
          {formatCoordinate(detail.build.locationLatitude)}
        </dd>
        <Label>Longitude</Label>
        <dd className="min-w-0 break-words tabular-nums">
          {formatCoordinate(detail.build.locationLongitude)}
        </dd>
        <Label>Project start</Label>
        <dd className="min-w-0 break-words">
          {formatDate(detail.build.startDate)}
        </dd>
        <Label>Roadmap end</Label>
        <dd className="min-w-0 break-words">
          {formatDate(addDaysSafe(detail.build.startDate, projection.maxDay))}
        </dd>
        <Label>% complete</Label>
        <dd className="flex min-w-0 items-center gap-2">
          <span className="tabular-nums">{percentComplete}%</span>
          <span
            aria-hidden="true"
            className="h-1.5 min-w-16 flex-1 overflow-hidden rounded-full bg-muted sm:w-24 sm:flex-none"
          >
            <span
              className="block h-full bg-primary"
              style={{ width: `${Math.min(100, percentComplete)}%` }}
            />
          </span>
        </dd>
        <Label>Open warnings</Label>
        <dd className={openWarnings > 0 ? "text-amber-400" : undefined}>
          {openWarnings}
        </dd>
        <Label>Site visits open</Label>
        <dd>{siteVisitsOpen}</dd>
      </dl>
    </div>
  );
}

export function LoanMetadataPanel({
  currentOverview,
  detail,
  projection,
}: {
  currentOverview: CurrentBuildOverview;
  detail: ProductionBuildDetail;
  projection: ProductionBuildProjection;
}) {
  return (
    <div data-testid="build-overview-loan-panel">
      <h3 className="mb-3 font-semibold text-sm">Loan Details</h3>
      <dl className="grid grid-cols-[minmax(0,1fr)] gap-y-1.5 text-sm sm:grid-cols-[120px_1fr]">
        <Label>Borrower starting cash</Label>
        <span className="min-w-0 break-words">
          {formatCents(detail.capitalPlan?.borrowerStartingCashCents ?? 0)}
        </span>
        <Label>Lender policy limit</Label>
        <span className="min-w-0 break-words">
          {formatCents(detail.capitalPlan?.lenderDrawPolicyLimitCents ?? 0)}
        </span>
        <Label>Approved principal</Label>
        <span className="min-w-0 break-words">
          {formatCents(detail.loanFacility?.principalCents ?? 0)}
        </span>
        <Label>Payback date</Label>
        <span className="min-w-0 break-words">
          {detail.loanFacility?.paybackDate
            ? formatDate(detail.loanFacility.paybackDate)
            : formatDate(
                addDaysSafe(detail.build.startDate, projection.maxDay)
              )}
        </span>
        <Label>Draw availability</Label>
        <span className="min-w-0 break-words">
          {formatCents(currentOverview.currentAvailabilityCents)} of{" "}
          {formatCents(currentOverview.totalApprovedCents)}
        </span>
        <Label>Drawn to date</Label>
        <span className="min-w-0 break-words">
          {formatCents(currentOverview.drawnCents)}
        </span>
        <Label>Interest (annual)</Label>
        <span className="tabular-nums">
          {((detail.loanFacility?.interestAnnualBps ?? 0) / 100).toFixed(2)}%
        </span>
        <Label>Interest starts</Label>
        <span>Funds released</span>
      </dl>
    </div>
  );
}

export function OverviewMetric({
  label,
  testId,
  truncateValue = true,
  value,
}: {
  label: string;
  testId?: string;
  truncateValue?: boolean;
  value: string;
}) {
  return (
    <div
      className="min-w-0 rounded-md bg-muted/50 px-3 py-2"
      data-testid={testId}
    >
      <p className="text-muted-foreground text-xs uppercase">{label}</p>
      <p
        className={cn(
          "break-words font-semibold text-sm tabular-nums",
          truncateValue && "truncate"
        )}
      >
        {value}
      </p>
    </div>
  );
}

export function materialPlanningItemTotal(item: MaterialPlanningItem) {
  return item.totalCents ?? item.costCents * item.quantity;
}
