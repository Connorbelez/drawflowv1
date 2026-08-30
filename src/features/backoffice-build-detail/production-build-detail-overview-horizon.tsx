"use client";
import {
  AlertTriangle,
  Banknote,
  CalendarClock,
  CheckCircle2,
  CircleDot,
} from "lucide-react";
import {
  lazy,
} from "react";
import { Badge } from "#/components/ui/badge.tsx";
import { Button } from "#/components/ui/button.tsx";
import { Frame, FramePanel } from "#/components/ui/frame.tsx";
import {
  type DrawWorkflowCapabilities,
} from "#/features/draw-workflow/drawWorkflow.ts";
import { cn } from "#/lib/utils.ts";

const LazyFieldRichTextPreview = lazy(() =>
  import("#/components/rich-text/field-rich-text.tsx").then((m) => ({
    default: m.FieldRichTextPreview,
  }))
);

import { formatCents, formatDate, initialsFor } from "./format";
import { productionMilestoneScheduleHealth } from "./production-schedule-health.ts";
import type {
  ProductionBuildDetail,
  ProductionBuildDetailActions,
  ProductionBuildProjection,
  ProductionDraw,
  ProductionMilestone,
} from "./production-build-detail-contracts.ts";
import { contractorAssignmentsForMilestone } from "./production-build-detail-evidence-utils.ts";
import {
  DrawSummaryItem,
  OverviewMetric,
} from "./production-build-detail-draw-overview.tsx";
import {
  addDaysSafe,
  isCurrentActiveMilestone,
  milestoneHasPendingCompletionClaim,
  milestoneProgressPercent,
} from "./production-build-detail-projection.ts";

export function CurrentActiveDrawRequestsSection({
  actions,
  activeDrawRequests,
  detail,
  drawActionError,
  drawCapabilities,
  onOpenDraw,
  onRunAction,
  pendingActionKey,
  viewerRole,
}: {
  actions?: ProductionBuildDetailActions;
  activeDrawRequests: ProductionDraw[];
  detail: ProductionBuildDetail;
  drawActionError: string;
  drawCapabilities: DrawWorkflowCapabilities;
  onOpenDraw: (draw: ProductionDraw) => void;
  onRunAction: (
    actionKey: string,
    draw: ProductionDraw,
    fn?: (draw: ProductionDraw) => Promise<unknown> | unknown
  ) => Promise<boolean>;
  pendingActionKey: string | null;
  viewerRole: "builder" | "lender";
}) {
  return (
    <Frame data-testid="current-active-draw-requests">
      <FramePanel
        className={cn(
          "p-3 sm:p-4",
          activeDrawRequests.length > 0 &&
            "border-primary/25 bg-primary/[0.035]"
        )}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-2.5">
            <span
              className={cn(
                "grid size-7 shrink-0 place-items-center rounded-md bg-muted text-muted-foreground",
                activeDrawRequests.length > 0 && "bg-primary/12 text-primary"
              )}
            >
              <Banknote aria-hidden="true" className="size-3.5" />
            </span>
            <div className="min-w-0">
              <h4 className="font-semibold text-sm">Active draw requests</h4>
              <p className="mt-0.5 max-w-[65ch] text-muted-foreground text-xs">
                Reimbursement requests awaiting lender approval or fund release.
              </p>
            </div>
          </div>
          <Badge
            aria-label={`${activeDrawRequests.length} active draw requests`}
            size="sm"
            variant={activeDrawRequests.length > 0 ? "info" : "outline"}
          >
            {activeDrawRequests.length}
          </Badge>
        </div>

        {activeDrawRequests.length > 0 ? (
          <div className="mt-4 grid gap-2">
            {activeDrawRequests.map((draw) => (
              <DrawSummaryItem
                actions={actions}
                actionTestIdPrefix="current-draw"
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
          <p
            className="mt-4 border-border border-t pt-3 text-muted-foreground text-sm"
            data-testid="current-active-draw-requests-empty"
          >
            No active draw requests.
          </p>
        )}

        {drawActionError ? (
          <p className="mt-3 text-destructive text-xs" role="alert">
            {drawActionError}
          </p>
        ) : null}
      </FramePanel>
    </Frame>
  );
}

type CurrentMilestoneHorizonLane =
  | "behind-schedule"
  | "current"
  | "next-upcoming";

export function CurrentMilestoneHorizonSection({
  currentDay,
  description,
  detail,
  emptyMessage,
  lane,
  milestones,
  onReviewMilestone,
  projection,
  title,
  viewerRole,
}: {
  currentDay: number;
  description: string;
  detail: ProductionBuildDetail;
  emptyMessage: string;
  lane: CurrentMilestoneHorizonLane;
  milestones: ProductionMilestone[];
  onReviewMilestone: (milestone: ProductionMilestone) => void;
  projection: ProductionBuildProjection;
  title: string;
  viewerRole: "builder" | "lender";
}) {
  const sectionTestId =
    lane === "behind-schedule"
      ? "behind-schedule-milestones"
      : lane === "current"
        ? "current-milestones"
        : "next-upcoming-milestone";
  return (
    <FramePanel
      className={cn(
        "p-3 sm:p-4",
        lane === "behind-schedule" &&
          "border-destructive/25 bg-destructive/[0.035]",
        lane === "current" && "border-primary/25 bg-primary/[0.035]"
      )}
      data-testid={sectionTestId}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-2.5">
          <span
            className={cn(
              "grid size-7 shrink-0 place-items-center rounded-md bg-muted text-muted-foreground",
              lane === "behind-schedule" &&
                "bg-destructive/10 text-destructive",
              lane === "current" && "bg-primary/12 text-primary"
            )}
          >
            {lane === "behind-schedule" ? (
              <AlertTriangle aria-hidden="true" className="size-3.5" />
            ) : lane === "current" ? (
              <CircleDot aria-hidden="true" className="size-3.5" />
            ) : (
              <CalendarClock aria-hidden="true" className="size-3.5" />
            )}
          </span>
          <div className="min-w-0">
            <h4 className="font-semibold text-sm">{title}</h4>
            <p className="mt-0.5 max-w-[65ch] text-muted-foreground text-xs">
              {description}
            </p>
          </div>
        </div>
        <Badge
          aria-label={`${milestones.length} ${title.toLowerCase()}`}
          size="sm"
          variant={
            lane === "behind-schedule"
              ? "error"
              : lane === "current"
                ? "info"
                : "outline"
          }
        >
          {milestones.length}
        </Badge>
      </div>

      {milestones.length > 0 ? (
        <div className="mt-4 grid gap-4">
          {milestones.map((milestone) => (
            <CurrentMilestoneHorizonItem
              currentDay={currentDay}
              detail={detail}
              key={milestone.key}
              lane={lane}
              milestone={milestone}
              onReviewMilestone={onReviewMilestone}
              projection={projection}
              viewerRole={viewerRole}
            />
          ))}
        </div>
      ) : (
        <p
          className="mt-4 border-border border-t pt-3 text-muted-foreground text-sm"
          data-testid={`${sectionTestId}-empty`}
        >
          {emptyMessage}
        </p>
      )}
    </FramePanel>
  );
}

function CurrentMilestoneHorizonItem({
  currentDay,
  detail,
  lane,
  milestone,
  onReviewMilestone,
  projection,
  viewerRole,
}: {
  currentDay: number;
  detail: ProductionBuildDetail;
  lane: CurrentMilestoneHorizonLane;
  milestone: ProductionMilestone;
  onReviewMilestone: (milestone: ProductionMilestone) => void;
  projection: ProductionBuildProjection;
  viewerRole: "builder" | "lender";
}) {
  const contractors = contractorAssignmentsForMilestone(detail, milestone.key);
  const submilestones =
    projection.submilestonesByMilestone.get(milestone.key) ?? [];
  const progressPercent = milestoneProgressPercent(milestone, submilestones);
  const isOperationallyActive = isCurrentActiveMilestone(milestone);
  const actionLabel =
    viewerRole === "lender"
      ? "Review milestone completion"
      : "Complete Milestone";
  const scheduleHealth = productionMilestoneScheduleHealth(
    milestone,
    submilestones,
    currentDay,
  );
  const daysBehind = scheduleHealth.overdueDays;
  const itemTestId = isOperationallyActive
    ? `current-milestone-${milestone.key}`
    : `${lane}-milestone-${milestone.key}`;

  return (
    <article
      className="grid gap-3 border-border border-t pt-4 first:border-t-0 first:pt-0"
      data-schedule-lane={lane}
      data-testid={itemTestId}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h5 className="break-words font-semibold text-base">
              {milestone.name}
            </h5>
            <MilestoneHorizonStatusBadge
              daysBehind={daysBehind}
              lane={lane}
              milestone={milestone}
            />
          </div>
        </div>
        {isOperationallyActive ? (
          <Button
            className="shrink-0"
            data-testid={`current-milestone-review-${milestone.key}`}
            onClick={() => onReviewMilestone(milestone)}
            size="sm"
            type="button"
          >
            <CheckCircle2 aria-hidden="true" />
            {actionLabel}
          </Button>
        ) : null}
      </div>

      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        <OverviewMetric
          label="Budget"
          value={formatCents(milestone.budgetCents)}
        />
        <OverviewMetric
          label="Planned start"
          truncateValue={false}
          value={formatDate(
            addDaysSafe(detail.build.startDate, milestone.dayStart)
          )}
        />
        <OverviewMetric
          label="Planned end"
          truncateValue={false}
          value={formatDate(
            addDaysSafe(detail.build.startDate, milestone.dayEnd)
          )}
        />
        <OverviewMetric
          label="Draw unlock"
          value={formatCents(milestone.drawAvailabilityCents)}
        />
      </div>

      <MilestoneContractorList
        contractors={contractors}
        milestoneKey={milestone.key}
      />

      {milestone.reconciliationState === "warning" &&
      milestone.reconciliationIssues?.length ? (
        <div
          aria-live="polite"
          className="grid gap-1 text-amber-700 text-xs dark:text-amber-300"
          data-testid={`milestone-reconciliation-${milestone.key}`}
          role="status"
        >
          <span className="font-medium">Milestone data needs review</span>
          {milestone.reconciliationIssues.map((issue) => (
            <span key={issue.code}>{issue.message}</span>
          ))}
        </div>
      ) : null}

      {isOperationallyActive ? (
        <div>
          <div className="flex items-center justify-between gap-3 text-xs">
            <span className="text-muted-foreground">Progress</span>
            <span className="tabular-nums">{progressPercent}%</span>
          </div>
          <span
            aria-hidden="true"
            className="mt-1 block h-1.5 overflow-hidden rounded-full bg-muted"
          >
            <span
              className="block h-full bg-primary"
              style={{ width: `${progressPercent}%` }}
            />
          </span>
        </div>
      ) : null}
    </article>
  );
}

function MilestoneHorizonStatusBadge({
  daysBehind,
  lane,
  milestone,
}: {
  daysBehind: number;
  lane: CurrentMilestoneHorizonLane;
  milestone: ProductionMilestone;
}) {
  if (lane === "behind-schedule") {
    return (
      <>
        <Badge size="sm" variant="error">
          {daysBehind} day{daysBehind === 1 ? "" : "s"} behind
        </Badge>
        <Badge
          size="sm"
          variant={
            milestoneHasPendingCompletionClaim(milestone)
              ? "warning"
              : milestone.status === "in_progress"
                ? "info"
                : "outline"
          }
        >
          {milestoneHasPendingCompletionClaim(milestone)
            ? "Completion submitted"
            : milestone.status === "in_progress"
              ? "In progress"
              : "Not started"}
        </Badge>
      </>
    );
  }
  if (milestoneHasPendingCompletionClaim(milestone)) {
    return (
      <Badge size="sm" variant="warning">
        Completion submitted
      </Badge>
    );
  }
  return (
    <Badge size="sm" variant={lane === "current" ? "info" : "outline"}>
      {lane === "current" ? "In progress" : "Upcoming"}
    </Badge>
  );
}

function MilestoneContractorList({
  contractors,
  milestoneKey,
}: {
  contractors: ReturnType<typeof contractorAssignmentsForMilestone>;
  milestoneKey: string;
}) {
  return (
    <div>
      <p className="mb-2 text-muted-foreground text-xs uppercase">
        Assigned contractors
      </p>
      {contractors.length > 0 ? (
        <ul className="flex flex-wrap gap-x-5 gap-y-2">
          {contractors.map((contractor) => (
            <li
              className="flex min-w-0 items-center gap-2 text-sm"
              data-testid={`current-milestone-contractor-${milestoneKey}`}
              key={`${milestoneKey}-${contractor.name}-${contractor.role ?? ""}`}
            >
              <span className="grid size-7 shrink-0 place-items-center rounded-md bg-primary/15 font-semibold text-primary text-xs">
                {initialsFor(contractor.name)}
              </span>
              <span className="min-w-0">
                <span className="break-words font-medium">
                  {contractor.name}
                </span>
                {contractor.role ? (
                  <span className="ml-2 text-muted-foreground text-xs">
                    {contractor.role}
                  </span>
                ) : null}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-muted-foreground text-sm">
          No contractors assigned.
        </p>
      )}
    </div>
  );
}
