"use client";

/**
 * Production System Post UI — adapted from Variant A (Inline workboard) of
 * `/prototype/system-posts`. Theme-token styled; mock prototype data is not used.
 */

import {
  CalendarCheck,
  ChevronDown,
  ChevronUp,
  Circle,
  GitCompareArrows,
  Image as ImageIcon,
  LayoutGrid,
  List,
  Users,
} from "lucide-react";
import { useState } from "react";

import { Avatar, AvatarFallback } from "#/components/ui/avatar.tsx";
import { Badge } from "#/components/ui/badge.tsx";
import { Button } from "#/components/ui/button.tsx";
import {
  Card,
  CardFooter,
  CardHeader,
  CardPanel,
  CardTitle,
} from "#/components/ui/card.tsx";
import { Frame, FramePanel } from "#/components/ui/frame.tsx";
import { cn } from "#/lib/utils.ts";
import type { BuildDetailTarget } from "../build-detail-targets/buildDetailTarget.ts";
import {
  type DrawWorkflowCapabilities,
} from "../draw-workflow/drawWorkflow.ts";
import {
  DrawBoardlessExperience,
  StatePulseIcon,
  columnTone,
  formatPlanDate,
  formatPlanDateShort,
  humanizeEnumLabel,
} from "./system-post-draw.tsx";
import {
  type CollaborationActionItem,
  type CollaborationFeedPostEntry,
  type CollaborationSystemPresentation,
  classifyCollaborationActionItem,
  initials,
  isCanonicalMilestoneItem,
  systemPresentationLabels,
} from "./model.ts";

type CollaborationSystemPost = NonNullable<
  CollaborationFeedPostEntry["post"]["systemPost"]
>;
type SystemMilestonePlanningSummary = NonNullable<
  CollaborationFeedPostEntry["post"]["planningSummary"]
>;
type WorkColumn = Exclude<
  CollaborationSystemPresentation["column"],
  "superseded"
>;

const STATE_COLUMNS: { key: WorkColumn; label: string }[] = [
  { key: "backlog", label: "Backlog" },
  { key: "behind_schedule", label: "Behind Schedule" },
  { key: "in_progress", label: "In Progress" },
  { key: "in_review", label: "In Review" },
  { key: "approved", label: "Approved" },
];

export function systemPostTitle(
  entry: CollaborationFeedPostEntry
): string | null {
  const systemPost = entry.post.systemPost;
  if (!systemPost) {
    return null;
  }
  if (systemPost.kind === "draw") {
    const drawLabel =
      systemPost.drawFacts?.planned?.label ??
      entry.references.find((reference) => reference.entityKind === "draw")
        ?.labelSnapshot;
    return drawLabel ?? "Draw System Post";
  }
  const milestoneLabel =
    entry.references.find((reference) => reference.entityKind === "milestone")
      ?.labelSnapshot ?? "Milestone";
  const key = systemPost.milestoneKey;
  return key ? `${key} · ${milestoneLabel}` : milestoneLabel;
}

export function SystemPostExperience({
  drawCapabilities,
  entry,
  onOpenActionItem,
  viewerRole,
  viewerRoles,
}: {
  drawCapabilities?: DrawWorkflowCapabilities;
  entry: CollaborationFeedPostEntry;
  onOpenActionItem: (target: BuildDetailTarget) => void;
  viewerRole?: string;
  viewerRoles?: string[];
}) {
  const systemPost = entry.post.systemPost;
  if (!systemPost) {
    return null;
  }

  const isDraw = systemPost.kind === "draw";
  const generatedItems = entry.actionItems.filter(isCanonicalMilestoneItem);

  return (
    <div
      className="space-y-4"
      data-testid="system-post-experience"
      data-variant="A"
    >
      {systemPost.lifecycle === "resolved" ? (
        <div className="rounded-lg border border-success/30 bg-success/10 px-3 py-2 text-sm">
          Resolved. Workflow commands are locked; Discussion remains available.
        </div>
      ) : systemPost.lifecycle === "reopened" ? (
        <div className="rounded-lg border border-info/30 bg-info/10 px-3 py-2 text-sm">
          Reopened by a canonical reactivation. Prior history is preserved and
          governed commands are active again.
        </div>
      ) : null}
      {isDraw ? (
        <DrawBoardlessExperience
          drawCapabilities={drawCapabilities}
          facts={systemPost.drawFacts}
          onOpenActionItem={onOpenActionItem}
          viewerRole={viewerRole}
          viewerRoles={viewerRoles}
        />
      ) : (
        <MilestoneBoardExperience
          items={generatedItems}
          onOpenActionItem={onOpenActionItem}
          planningSummary={entry.post.planningSummary}
          systemPost={systemPost}
        />
      )}
      {systemPost.recoveryState === "recovery_required" ? (
        <p className="text-amber-700 text-xs dark:text-amber-300">
          Recovery required: add a valid Sub-milestone through the canonical
          roadmap revision before starting work.
        </p>
      ) : null}
    </div>
  );
}

function MilestoneBoardExperience({
  items,
  onOpenActionItem,
  planningSummary,
  systemPost,
}: {
  items: CollaborationActionItem[];
  onOpenActionItem: (target: BuildDetailTarget) => void;
  planningSummary?: SystemMilestonePlanningSummary;
  systemPost: CollaborationSystemPost;
}) {
  const [workView, setWorkView] = useState<"board" | "list">("list");
  const [oversightOpen, setOversightOpen] = useState(false);

  return (
    <div className="space-y-4">
      <MilestoneHeadline items={items} planningSummary={planningSummary} />
      <MilestonePulseSummary
        items={items}
        planningRevision={systemPost.currentPlanningRevision}
        planningSummary={planningSummary}
      />
      <MilestoneOversightStrip
        items={items}
        onToggle={() => setOversightOpen((current) => !current)}
        open={oversightOpen}
        planningSummary={planningSummary}
      />
      <Frame className="min-w-0">
        <FramePanel className="min-w-0 overflow-hidden p-3 sm:p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="font-semibold text-sm">Sub-milestones</h3>
              <p className="text-muted-foreground text-xs">
                {workView === "board"
                  ? "Canonical status projection · drag locked"
                  : "Open a Sub-milestone in the shared detail workspace"}
              </p>
            </div>
            <div className="flex items-center gap-1">
              <Button
                aria-label="Show Sub-milestones as a list"
                aria-pressed={workView === "list"}
                onClick={() => setWorkView("list")}
                size="sm"
                type="button"
                variant={workView === "list" ? "secondary" : "ghost"}
              >
                <List className="size-4" /> List
              </Button>
              <Button
                aria-label="Show Sub-milestones as a board"
                aria-pressed={workView === "board"}
                onClick={() => setWorkView("board")}
                size="sm"
                type="button"
                variant={workView === "board" ? "secondary" : "ghost"}
              >
                <LayoutGrid className="size-4" /> Board
              </Button>
            </div>
          </div>
          {workView === "board" ? (
            <div className="-mx-3 overflow-x-auto px-3 sm:mx-0 sm:px-0">
              <div className="grid min-w-[62rem] grid-cols-5 gap-2 rounded-xl border bg-background/30 p-2.5">
                {STATE_COLUMNS.map((column) => {
                  const columnItems = items.filter(
                    (item) => item.systemPresentation?.column === column.key
                  );
                  return (
                    <section className="min-w-0" key={column.key}>
                      <div className="mb-2 flex items-center justify-between px-1">
                        <span className="font-medium text-muted-foreground text-xs uppercase tracking-wide">
                          {column.label}
                        </span>
                        <Badge size="sm" variant="secondary">
                          {columnItems.length}
                        </Badge>
                      </div>
                      <div className="space-y-2">
                        {columnItems.map((item) => (
                          <SubMilestoneBoardCard
                            item={item}
                            key={item._id}
                            onOpen={() =>
                              onOpenActionItem(
                                classifyCollaborationActionItem(item).target
                              )
                            }
                            selected={false}
                          />
                        ))}
                      </div>
                    </section>
                  );
                })}
              </div>
            </div>
          ) : (
            <SubMilestoneList
              items={items}
              onOpenActionItem={onOpenActionItem}
            />
          )}
          {items.length === 0 ? (
            <p className="rounded-lg border border-dashed p-4 text-center text-muted-foreground text-xs">
              No Sub-milestone cards are projected on this System Post yet.
            </p>
          ) : null}
        </FramePanel>
      </Frame>
    </div>
  );
}

function MilestoneHeadline({
  items,
  planningSummary,
}: {
  items: CollaborationActionItem[];
  planningSummary?: SystemMilestonePlanningSummary;
}) {
  const behind =
    planningSummary?.counts.behind_schedule ??
    items.filter(
      (item) => item.systemPresentation?.column === "behind_schedule"
    ).length;
  const inProgress =
    planningSummary?.counts.in_progress ??
    items.filter((item) => item.systemPresentation?.column === "in_progress")
      .length;
  const statusLabel =
    planningSummary?.lifecycle === "resolved"
      ? "Resolved"
      : planningSummary?.lifecycle === "reopened"
        ? "Reopened"
        : inProgress > 0 || behind > 0
          ? "In progress"
          : "Active";

  const plannedStarts = items
    .map((item) => item.systemPresentation?.plannedStartDate)
    .filter((value): value is string => Boolean(value))
    .sort();
  const plannedEnds = items
    .map((item) => item.systemPresentation?.plannedCompletionDate)
    .filter((value): value is string => Boolean(value))
    .sort();
  const forecasts = items
    .map((item) => item.systemPresentation?.completionForecastDate)
    .filter((value): value is string => Boolean(value))
    .sort();

  const plannedStart = plannedStarts[0];
  const plannedCompletion = plannedEnds.at(-1);
  const forecast = forecasts.at(-1);

  const assignees = [
    ...new Set(
      items
        .map(
          (item) =>
            item.systemPresentation?.executionOwnership?.assigneeDisplayName
        )
        .filter((value): value is string => Boolean(value))
    ),
  ];

  return (
    <Frame>
      <FramePanel className="space-y-3 p-3">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <div className="rounded-lg bg-muted/45 px-3 py-2">
            <p className="text-muted-foreground text-xs">Status</p>
            <div className="mt-1 flex flex-wrap items-center gap-1.5">
              <Badge variant="info">{statusLabel}</Badge>
              {behind > 0 ? (
                <Badge size="sm" variant="warning">
                  {behind} behind
                </Badge>
              ) : null}
            </div>
          </div>
          {plannedStart ? (
            <div className="rounded-lg bg-muted/45 px-3 py-2">
              <p className="text-muted-foreground text-xs">Planned start</p>
              <p className="mt-1 font-semibold text-sm">
                {formatPlanDate(plannedStart)}
              </p>
            </div>
          ) : null}
          {plannedCompletion ? (
            <div className="rounded-lg bg-muted/45 px-3 py-2">
              <p className="text-muted-foreground text-xs">
                Planned completion
              </p>
              <p className="mt-1 font-semibold text-sm">
                {formatPlanDate(plannedCompletion)}
              </p>
            </div>
          ) : null}
          {forecast ? (
            <div className="rounded-lg bg-muted/45 px-3 py-2">
              <p className="text-muted-foreground text-xs">Current forecast</p>
              <p className="mt-1 font-semibold text-sm text-warning">
                {formatPlanDate(forecast)}
              </p>
            </div>
          ) : null}
        </div>
        {assignees.length > 0 ? (
          <div className="flex flex-wrap items-center gap-1.5 border-t pt-3">
            <span className="mr-1 flex items-center gap-1 font-medium text-xs">
              <Users className="size-3.5" /> Assignees
            </span>
            {assignees.map((name) => (
              <Badge key={name} variant="outline">
                {name}
              </Badge>
            ))}
          </div>
        ) : null}
      </FramePanel>
    </Frame>
  );
}

function MilestonePulseSummary({
  items,
  planningRevision,
  planningSummary,
}: {
  items: CollaborationActionItem[];
  planningRevision?: number;
  planningSummary?: SystemMilestonePlanningSummary;
}) {
  const superseded = planningSummary?.counts.superseded ?? 0;
  return (
    <fieldset
      aria-label="Sub-milestone state totals"
      className="flex flex-wrap items-center gap-x-3 gap-y-1 border-y py-2 text-xs"
      data-testid="system-post-planning-summary"
    >
      {STATE_COLUMNS.map((column) => {
        const count =
          planningSummary?.counts[column.key] ??
          items.filter((item) => item.systemPresentation?.column === column.key)
            .length;
        return (
          <span
            className="flex items-center gap-1 text-muted-foreground"
            key={column.key}
            title={`${column.label}: ${count}`}
          >
            <StatePulseIcon state={column.key} />
            <span className="sr-only">{column.label}</span>
            <span className="font-semibold text-foreground">{count}</span>
          </span>
        );
      })}
      {superseded > 0 ? (
        <span
          className="flex items-center gap-1 text-muted-foreground"
          title={`Superseded: ${superseded}`}
        >
          <Circle className="size-3.5 opacity-50" />
          <span className="font-semibold text-foreground">{superseded}</span>
          <Badge size="sm" variant="outline">
            Superseded
          </Badge>
        </span>
      ) : null}
      {planningRevision === undefined ? null : (
        <span
          className="flex items-center gap-1 text-warning"
          title={`Planning revision ${planningRevision}`}
        >
          <GitCompareArrows className="size-3.5" />
          <span className="sr-only">Plan revision</span>
          <span className="font-semibold">r{planningRevision}</span>
        </span>
      )}
      {planningSummary ? (
        <span className="ml-auto flex flex-wrap gap-1.5">
          <Badge
            variant={
              planningSummary.lifecycle === "reopened" ? "warning" : "outline"
            }
          >
            {humanizeEnumLabel(planningSummary.lifecycle)}
          </Badge>
          <Badge
            variant={planningSummary.readyForApproval ? "success" : "warning"}
          >
            {planningSummary.readyForApproval
              ? "Ready for approval"
              : "Not ready for approval"}
          </Badge>
        </span>
      ) : null}
    </fieldset>
  );
}

function MilestoneOversightStrip({
  items,
  onToggle,
  open,
  planningSummary,
}: {
  items: CollaborationActionItem[];
  onToggle: () => void;
  open: boolean;
  planningSummary?: SystemMilestonePlanningSummary;
}) {
  const requiredVisits =
    planningSummary?.attention.requiredSiteVisits ??
    items.filter(
      (item) => item.systemPresentation?.siteVisitRequirement?.required
    ).length;
  const evidencePhotos = items.reduce(
    (sum, item) => sum + (item.systemPresentation?.evidenceCount ?? 0),
    0
  );
  const attention = planningSummary
    ? (
        [
          ["assignmentGaps", "Assignment gaps"],
          ["dependencyExceptions", "Dependency exceptions"],
          ["overdueCompletion", "Overdue completion"],
          ["requiredSiteVisits", "Required site visits"],
          ["reviewSla", "Review SLA"],
        ] as const
      ).filter(([key]) => planningSummary.attention[key] > 0)
    : [];

  return (
    <Frame>
      <FramePanel className="p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-1.5">
            {requiredVisits > 0 ? (
              <Badge variant="warning">
                <CalendarCheck className="mr-1 size-3" /> {requiredVisits}{" "}
                required visit{requiredVisits === 1 ? "" : "s"}
              </Badge>
            ) : (
              <Badge variant="outline">
                <CalendarCheck className="mr-1 size-3" /> No required visits
              </Badge>
            )}
            {evidencePhotos > 0 ? (
              <Badge variant="outline">
                <ImageIcon className="mr-1 size-3" /> {evidencePhotos} evidence
                photo{evidencePhotos === 1 ? "" : "s"}
              </Badge>
            ) : null}
            {attention.map(([key, label]) => (
              <Badge key={key} variant="warning">
                {label} · {planningSummary?.attention[key]}
              </Badge>
            ))}
          </div>
          <Button
            aria-expanded={open}
            onClick={onToggle}
            size="sm"
            type="button"
            variant="ghost"
          >
            {open ? "Hide" : "Attention"}
            {open ? (
              <ChevronUp className="size-4" />
            ) : (
              <ChevronDown className="size-4" />
            )}
          </Button>
        </div>
        {open ? (
          <div className="mt-3 border-t pt-3 text-muted-foreground text-xs">
            {attention.length > 0
              ? "Planning exceptions remain live projections from the canonical roadmap."
              : "No planning exceptions are currently reported."}
          </div>
        ) : null}
      </FramePanel>
    </Frame>
  );
}

function SubMilestoneList({
  items,
  onOpenActionItem,
}: {
  items: CollaborationActionItem[];
  onOpenActionItem: (target: BuildDetailTarget) => void;
}) {
  return (
    <div className="space-y-2">
      {items.map((item) => {
        const presentation = item.systemPresentation;
        const column = presentation?.column ?? "backlog";
        const code =
          presentation?.startCommand?.submilestoneKey ??
          item.canonicalBuildSubmilestoneId ??
          "—";
        const assignee =
          presentation?.executionOwnership?.state === "assignment_required"
            ? "Assignment required"
            : (presentation?.executionOwnership?.assigneeDisplayName ??
              "Unassigned");
        const dateRange =
          presentation?.plannedStartDate && presentation.plannedCompletionDate
            ? `${formatPlanDateShort(presentation.plannedStartDate)} → ${formatPlanDateShort(presentation.plannedCompletionDate)}`
            : presentation?.plannedStartDate
              ? formatPlanDateShort(presentation.plannedStartDate)
              : "Schedule TBD";
        return (
          <Card className="shadow-none" key={item._id}>
            <button
              aria-label={`Open Sub-milestone: ${item.title}`}
              className="grid w-full gap-3 p-3 text-left sm:grid-cols-[minmax(0,1fr)_8rem_9rem_auto] sm:items-center"
              onClick={() =>
                onOpenActionItem(classifyCollaborationActionItem(item).target)
              }
              type="button"
            >
              <span className="min-w-0">
                <span className="block truncate font-medium text-sm">
                  {item.title}
                </span>
                <span className="mt-1 block text-muted-foreground text-xs">
                  {code} · {assignee}
                </span>
              </span>
              <Badge className="w-fit" variant={columnTone(column)}>
                {systemPresentationLabels[column] ?? humanizeEnumLabel(column)}
              </Badge>
              <span className="text-muted-foreground text-xs">{dateRange}</span>
              <ChevronDown className="size-4 -rotate-90 justify-self-end" />
            </button>
          </Card>
        );
      })}
    </div>
  );
}


function SubMilestoneBoardCard({
  item,
  onOpen,
  selected,
}: {
  item: CollaborationActionItem;
  onOpen: () => void;
  selected: boolean;
}) {
  const presentation = item.systemPresentation;
  const column = presentation?.column ?? "backlog";
  const code =
    presentation?.startCommand?.submilestoneKey ??
    item.canonicalBuildSubmilestoneId ??
    "—";
  const assignee =
    presentation?.executionOwnership?.state === "assignment_required"
      ? "Assignment required"
      : (presentation?.executionOwnership?.assigneeDisplayName ?? "Unassigned");
  return (
    <Card
      className={cn(
        "w-full shadow-none transition hover:border-foreground/30",
        selected && "ring-2 ring-primary/35"
      )}
      onClick={onOpen}
      render={<button type="button" />}
    >
      <CardHeader className="gap-2 p-3 pb-2 text-left">
        <div>
          <p className="font-mono text-muted-foreground text-xs">{code}</p>
          <CardTitle className="mt-1 text-sm leading-5">{item.title}</CardTitle>
        </div>
        <Badge size="sm" variant={columnTone(column)}>
          {systemPresentationLabels[column] ?? humanizeEnumLabel(column)}
        </Badge>
      </CardHeader>
      <CardPanel className="space-y-2 px-3 pt-0 pb-2 text-left text-xs">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Avatar className="size-5">
            <AvatarFallback>{initials(assignee)}</AvatarFallback>
          </Avatar>
          <span className="truncate">{assignee}</span>
        </div>
        {presentation?.plannedStartDate ? (
          <p className="text-muted-foreground">
            {formatPlanDate(presentation.plannedStartDate)}
            {presentation.plannedCompletionDate
              ? ` → ${formatPlanDate(presentation.plannedCompletionDate)}`
              : ""}
          </p>
        ) : null}
      </CardPanel>
      <CardFooter className="justify-between px-3 pt-1 pb-3 text-muted-foreground text-xs">
        <span>
          {presentation?.evidenceCount === undefined
            ? "Open record"
            : `${presentation.evidenceCount} evidence`}
        </span>
      </CardFooter>
    </Card>
  );
}
