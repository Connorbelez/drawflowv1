"use client";

import { Clock3 } from "lucide-react";
import type { ReactNode } from "react";
import { useState } from "react";

import {
  AccordionItem,
  AccordionPanel,
  AccordionTrigger,
} from "#/components/ui/accordion.tsx";
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
import { Frame, FramePanel } from "#/components/ui/frame.tsx";
import type { DrawWorkflowCapabilities } from "#/features/draw-workflow/drawWorkflow.ts";
import { getDrawWorkflowActions } from "#/features/draw-workflow/drawWorkflow.ts";
import { cn } from "#/lib/utils.ts";
import type {
  FundingMilestoneRecord,
  FundingRequestRecord,
} from "./build-funding-contracts.ts";
import {
  addDays,
  completionReviewNote,
  formatCad,
  formatDate,
  milestoneActualEndDate,
  milestoneActualStartDate,
  milestoneBadgeTone,
  milestoneDateCopy,
  milestoneState,
  milestoneStateLabel,
  milestoneFundingGroup,
  requestBadgeTone,
  requestStatusDate,
  requestStatusLabel,
  reviewedAt,
} from "./build-funding-contracts.ts";

export function FundingGroup({
  amountCents,
  children,
  description,
  id,
  label,
  tone,
}: {
  amountCents: number;
  children: ReactNode;
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

export function RequestCardGrid({
  drawCapabilities,
  onOpenDraw,
  requests,
}: {
  drawCapabilities?: DrawWorkflowCapabilities;
  onOpenDraw?: (request: FundingRequestRecord) => void;
  requests: FundingRequestRecord[];
}) {
  if (requests.length === 0) {
    return <EmptyState copy="No requests in this group." />;
  }
  return (
    <div className="grid gap-2 pb-1 sm:grid-cols-2">
      {requests.map((request) => (
        <Card
          className="rounded-xl shadow-none"
          data-collaboration-focus={
            request._id ? `draw:${request._id}` : undefined
          }
          key={request.drawKey}
        >
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
            <DrawReviewButton
              capabilities={drawCapabilities}
              onOpenDraw={onOpenDraw}
              request={request}
            />
            {request.status === "rejected" && request.requestReviewNote ? (
              <div className="border-t pt-2 text-xs">
                <p className="font-medium">Reason</p>
                <p className="mt-1 text-muted-foreground">
                  {request.requestReviewNote}
                </p>
                <p className="mt-2 font-medium">
                  {request.nextAction ??
                    "Correct the request and submit it again for review."}
                </p>
              </div>
            ) : null}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

export function DrawReviewButton({
  capabilities,
  onOpenDraw,
  request,
}: {
  capabilities?: DrawWorkflowCapabilities;
  onOpenDraw?: (request: FundingRequestRecord) => void;
  request: FundingRequestRecord;
}) {
  if (!(capabilities && onOpenDraw)) {
    return null;
  }
  const workflow = getDrawWorkflowActions({
    canonicalIdAvailable: Boolean(request._id),
    capabilities,
    status: request.status,
  });
  if (!workflow.open) {
    return null;
  }
  return (
    <Button
      aria-label={`${workflow.open.label} ${request.displayId ?? request.drawKey}`}
      data-testid={`draw-review-request-${request.drawKey}`}
      onClick={() => onOpenDraw(request)}
      size="sm"
      variant="outline"
    >
      {workflow.open.label}
    </Button>
  );
}

export function DrawSourceAttribution({
  request,
}: {
  request: FundingRequestRecord;
}) {
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

export function MilestoneSourceCard({
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

export function MilestoneFundingSchedule({
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
  const [selectedMilestoneKey, setSelectedMilestoneKey] = useState<
    string | null
  >(null);
  const visibleMilestones = milestones.filter(
    (milestone) => milestoneState(milestone, startDate) !== "approved"
  );
  const groupedMilestones = milestoneFundingGroups.map((group) => ({
    ...group,
    milestones: visibleMilestones.filter(
      (milestone) =>
        milestoneFundingGroup(milestoneState(milestone, startDate)) ===
        group.key
    ),
  }));

  return (
    <Frame>
      <FramePanel className="p-0">
        <section aria-labelledby="milestone-funding-heading">
          <div className="border-b px-4 py-5 sm:px-5">
            <div className="flex flex-wrap items-start justify-between gap-5">
              <div>
                <p className="font-medium text-muted-foreground text-xs uppercase tracking-[0.14em]">
                  Construction roadmap
                </p>
                <h3
                  className="mt-1 font-semibold text-base"
                  id="milestone-funding-heading"
                >
                  Milestone funding schedule
                </h3>
                {showGuidance ? (
                  <p className="mt-1 max-w-xl text-muted-foreground text-xs">
                    {lenderView
                      ? "Review submitted completions against their evidence. Approved milestones are reconciled in the borrower balance above."
                      : "Track work in progress, verification, upcoming work, and anything behind schedule. Approved milestones move to the available balance above."}
                  </p>
                ) : null}
              </div>
              <dl
                aria-label="Milestone funding summary"
                className="grid min-w-56 grid-cols-2 gap-4"
              >
                <div>
                  <dt className="text-muted-foreground text-xs">
                    Pending verification
                  </dt>
                  <dd className="mt-1 font-heading font-semibold text-lg text-warning-foreground tabular-nums">
                    {formatCad(pendingCents)}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground text-xs">
                    Behind schedule
                  </dt>
                  <dd className="mt-1 font-heading font-semibold text-destructive-text text-lg tabular-nums">
                    {formatCad(backlogCents)}
                  </dd>
                </div>
              </dl>
            </div>
          </div>

          <ol
            aria-label="Milestone funding status"
            className="grid gap-7 px-3 py-5 sm:px-5"
          >
            {groupedMilestones.map((group) =>
              group.milestones.length > 0 ? (
                <li key={group.key}>
                  <section aria-labelledby={`milestone-group-${group.key}`}>
                    <div className="mb-3 flex items-center gap-3 border-b pb-2">
                      <span
                        aria-hidden="true"
                        className={cn("size-2 rounded-full", group.markerClass)}
                      />
                      <div className="min-w-0 flex-1">
                        <h4
                          className="font-semibold text-sm"
                          id={`milestone-group-${group.key}`}
                        >
                          {group.label}
                        </h4>
                        <p className="text-muted-foreground text-xs">
                          {group.description}
                        </p>
                      </div>
                      <Badge size="sm" variant={group.badgeVariant}>
                        {group.milestones.length}
                      </Badge>
                    </div>
                    <ol className="grid gap-3">
                      {group.milestones.map((milestone) => (
                        <MilestoneFundingCard
                          key={milestone.key}
                          lenderView={lenderView}
                          milestone={milestone}
                          onOpen={() => onOpenMilestone(milestone.key)}
                          onSelect={() =>
                            setSelectedMilestoneKey(milestone.key)
                          }
                          selected={selectedMilestoneKey === milestone.key}
                          startDate={startDate}
                        />
                      ))}
                    </ol>
                  </section>
                </li>
              ) : null
            )}
            {visibleMilestones.length === 0 ? (
              <li>
                <EmptyState copy="All milestones are approved. Approved value is reconciled in the borrower balance above." />
              </li>
            ) : null}
          </ol>
        </section>
      </FramePanel>
    </Frame>
  );
}

const milestoneFundingGroups = [
  {
    badgeVariant: "info" as const,
    description: "Work is underway within its scheduled window.",
    key: "active" as const,
    label: "Active",
    markerClass: "bg-info",
  },
  {
    badgeVariant: "warning" as const,
    description: "Completion evidence is submitted or needs revision.",
    key: "pending" as const,
    label: "Pending verification",
    markerClass: "bg-warning",
  },
  {
    badgeVariant: "error" as const,
    description: "The scheduled end date has passed without completion.",
    key: "behind" as const,
    label: "Behind schedule",
    markerClass: "bg-destructive",
  },
  {
    badgeVariant: "outline" as const,
    description: "Scheduled work that has not started yet.",
    key: "upcoming" as const,
    label: "Upcoming",
    markerClass: "bg-muted-foreground/50",
  },
];

export function MilestoneFundingCard({
  lenderView,
  milestone,
  onOpen,
  onSelect,
  selected,
  startDate,
}: {
  lenderView: boolean;
  milestone: FundingMilestoneRecord;
  onOpen: () => void;
  onSelect: () => void;
  selected: boolean;
  startDate: string;
}) {
  const state = milestoneState(milestone, startDate);
  const stateLabel = milestoneStateLabel(state);
  const stateCopy = milestoneCardCopy(state, milestone, lenderView);
  return (
    <li className="grid grid-cols-[6rem_minmax(0,1fr)] items-stretch gap-2 sm:grid-cols-[7.75rem_minmax(0,1fr)] sm:gap-3">
      <MilestoneDateRail
        milestone={milestone}
        selected={selected}
        startDate={startDate}
      />
      <Card
        className={cn(
          "rounded-xl shadow-none transition-[border-color,background-color,box-shadow] duration-200 ease-out",
          selected && "border-primary ring-2 ring-primary/30",
          state === "active" && "border-info/35 bg-info/8",
          state === "pending" && "border-warning/30 bg-warning/8",
          (state === "behind" || state === "revision") &&
            "border-destructive/30 bg-destructive/8",
          state === "planned" && "bg-muted/20"
        )}
        data-selected={selected ? "true" : "false"}
      >
        <button
          aria-label={`Highlight ${milestone.name} dates on the timeline`}
          aria-pressed={selected}
          className="w-full rounded-t-xl text-left outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
          onClick={onSelect}
          type="button"
        >
          <CardHeader className="gap-1 p-3 pb-2">
            <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
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
              <div className="flex shrink-0 flex-col items-start gap-0.5 sm:items-end sm:gap-1 sm:text-right">
                <span className="whitespace-nowrap font-heading font-semibold text-base tabular-nums">
                  {formatCad(milestone.drawAvailabilityCents)}
                </span>
                <span className="text-muted-foreground text-xs">
                  potential unlock
                </span>
              </div>
            </div>
            <CardDescription className="text-xs">
              {milestoneDateCopy(milestone, startDate, state)}
            </CardDescription>
          </CardHeader>
          <CardContent className="px-3 pt-0 pb-2">
            <p
              className={cn(
                "text-xs",
                state === "active" && "text-info-foreground",
                state === "pending" && "text-warning-foreground",
                (state === "behind" || state === "revision") &&
                  "text-destructive-text",
                state === "planned" && "text-muted-foreground"
              )}
            >
              {stateCopy}
            </p>
          </CardContent>
        </button>
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

export function MilestoneDateRail({
  milestone,
  selected,
  startDate,
}: {
  milestone: FundingMilestoneRecord;
  selected: boolean;
  startDate: string;
}) {
  const scheduledStart =
    milestone.dayStart === undefined
      ? undefined
      : addDays(startDate, milestone.dayStart);
  const scheduledEnd = addDays(startDate, milestone.dayEnd);
  const actualStart = milestoneActualStartDate(milestone);
  const actualEnd = milestoneActualEndDate(milestone, startDate);

  return (
    <fieldset
      className={cn(
        "relative m-0 min-h-full min-w-0 border-0 px-0 py-2 text-[0.6875rem] leading-tight",
        selected ? "text-primary" : "text-muted-foreground"
      )}
    >
      <legend className="sr-only">{milestone.name} date interval</legend>
      <span
        aria-hidden="true"
        className={cn(
          "absolute top-5 bottom-5 left-[0.3125rem] w-px",
          selected ? "bg-primary" : "bg-border"
        )}
      />
      <div className="relative flex min-h-full flex-col justify-between gap-8">
        <TimelineDateTick
          actualDate={actualStart}
          boundary="Start"
          scheduledDate={scheduledStart}
          selected={selected}
        />
        <TimelineDateTick
          actualDate={actualEnd}
          boundary="End"
          scheduledDate={scheduledEnd}
          selected={selected}
        />
      </div>
    </fieldset>
  );
}

export function TimelineDateTick({
  actualDate,
  boundary,
  scheduledDate,
  selected,
}: {
  actualDate?: string;
  boundary: "Start" | "End";
  scheduledDate?: string;
  selected: boolean;
}) {
  return (
    <div className="relative pl-4">
      <span
        aria-hidden="true"
        className={cn(
          "absolute top-1 left-0 size-2.5 rounded-full border-2 bg-background",
          selected ? "border-primary" : "border-muted-foreground/50"
        )}
      />
      <p className="font-semibold text-foreground">{boundary}</p>
      <p className="mt-0.5">
        <span className="sr-only">Scheduled: </span>
        <time dateTime={scheduledDate}>{formatDate(scheduledDate)}</time>
      </p>
      {actualDate ? (
        <p className={cn("mt-1", selected ? "text-primary" : "text-info")}>
          <span className="font-medium">Actual </span>
          <time dateTime={actualDate}>{formatDate(actualDate)}</time>
        </p>
      ) : null}
    </div>
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
  if (state === "active") {
    return "Work is underway within the scheduled interval.";
  }
  return lenderView
    ? "No action until the builder submits milestone completion."
    : "Complete this milestone to make its value available.";
}

export function EmptyState({ copy }: { copy: string }) {
  return (
    <p className="rounded-lg border border-dashed p-3 text-muted-foreground text-xs">
      {copy}
    </p>
  );
}
