"use client";

/**
 * Production System Post UI — adapted from Variant A (Inline workboard) of
 * `/prototype/system-posts`. Theme-token styled; mock prototype data is not used.
 */

import {
  AlertTriangle,
  ArrowRight,
  Banknote,
  CalendarCheck,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Circle,
  Eye,
  FileText,
  GitCompareArrows,
  Image as ImageIcon,
  LayoutGrid,
  List,
  MapPin,
  PlayCircle,
  Users,
} from "lucide-react";
import { type ReactNode, useState } from "react";

import { Avatar, AvatarFallback } from "#/components/ui/avatar.tsx";
import { Badge, type BadgeProps } from "#/components/ui/badge.tsx";
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
  type DrawWorkflowActionMetadata,
  type DrawWorkflowCapabilities,
  type DrawWorkflowStatus,
  drawWorkflowReadCapabilitiesForRoles,
  drawWorkflowRouteContextForRoles,
  resolveDrawWorkflow,
} from "../draw-workflow/drawWorkflow.ts";
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
type SystemDrawFacts = NonNullable<CollaborationSystemPost["drawFacts"]>;
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

type DrawLifecycleStep =
  | "scheduled"
  | "requested"
  | "in_review"
  | "ready_for_admin"
  | "approved"
  | "released"
  | "closed";

const DRAW_LIFECYCLE_STEPS: DrawLifecycleStep[] = [
  "scheduled",
  "requested",
  "in_review",
  "ready_for_admin",
  "approved",
  "released",
  "closed",
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

function collaborationRouteSurface(
  pathname = typeof window === "undefined" ? "" : window.location.pathname
): "builder" | "backoffice" | "other" {
  if (pathname.includes("/backoffice")) {
    return "backoffice";
  }
  if (
    pathname.includes("/builder") ||
    pathname.includes("/contractor") ||
    pathname.includes("/builder-staff")
  ) {
    return "builder";
  }
  return "other";
}

function isBuilderExecutionRole(role: string | undefined) {
  return (
    role === "builder" || role === "builder-staff" || role === "contractor"
  );
}

function isBackofficeReviewRole(role: string | undefined) {
  return (
    role === "admin" ||
    role === "principle-broker" ||
    role === "broker" ||
    role === "broker-staff"
  );
}

function collaborationActionSurface({
  pathname,
  roles,
}: {
  pathname?: string;
  roles: readonly string[];
}): "builder" | "backoffice" | null {
  const route = collaborationRouteSurface(pathname);
  const hasBuilder = roles.some((role) => isBuilderExecutionRole(role));
  const hasBackoffice = roles.some((role) => isBackofficeReviewRole(role));

  if (route === "builder") {
    return "builder";
  }
  if (route === "backoffice") {
    return "backoffice";
  }
  // Ambiguous surfaces: favor Builder when the account holds that capability.
  if (hasBuilder) {
    return "builder";
  }
  if (hasBackoffice) {
    return "backoffice";
  }
  return null;
}

function startDenialReason({
  denialReason,
  readOnly,
  startEnabled,
}: {
  denialReason?:
    | "already_started"
    | "assignment_required"
    | "completed"
    | "lender_review_only"
    | "permission_denied";
  readOnly: boolean;
  startEnabled: boolean;
}) {
  if (startEnabled) {
    return "Record the canonical actual start. Behind schedule clears only after start succeeds.";
  }
  if (readOnly) {
    return "Collaboration is read-only right now.";
  }
  switch (denialReason) {
    case "assignment_required":
      return "Assign a tradesperson before a Contractor can start.";
    case "already_started":
      return "Work has already started on this Sub-milestone.";
    case "completed":
      return "This Sub-milestone is already complete.";
    case "lender_review_only":
      return "Review-only on this surface; field operate requires Builder or Admin authority.";
    case "permission_denied":
      return "You do not have Sub-milestone update permission.";
    default:
      return "Start is unavailable until the governed prerequisites are met.";
  }
}

function builderActionStatus({
  completeEnabled,
  completeReason,
  denialReason,
  startEnabled,
  startReason,
}: {
  completeEnabled: boolean;
  completeReason: string;
  denialReason?:
    | "already_started"
    | "assignment_required"
    | "completed"
    | "lender_review_only"
    | "permission_denied";
  startEnabled: boolean;
  startReason: string;
}) {
  if (startEnabled) {
    return startReason;
  }
  if (completeEnabled) {
    return completeReason;
  }
  if (denialReason === "already_started" || denialReason === "completed") {
    return completeReason;
  }
  return startReason;
}

function completeDenialReason({
  completeEnabled,
  presentation,
  readOnly,
}: {
  completeEnabled: boolean;
  presentation: CollaborationSystemPresentation | undefined;
  readOnly: boolean;
}) {
  if (completeEnabled) {
    return "Freeze the Evidence Package if needed and enter lender review.";
  }
  if (readOnly) {
    return "Collaboration is read-only right now.";
  }
  if (!presentation?.canSubmitForReview) {
    if (presentation?.readyExceptFor?.length) {
      return `Not ready: ${presentation.readyExceptFor.join(", ")}.`;
    }
    if (presentation?.startCommand && !presentation.startCommand.allowed) {
      return "Start work before completion can be submitted.";
    }
    return "Upload and freeze required evidence before completion can be submitted.";
  }
  return "Completion is unavailable until the Evidence Package is ready.";
}

function approveDenialReason(
  presentation: CollaborationSystemPresentation | undefined
) {
  if (presentation?.canApproveSubmilestone) {
    return "Lender Admin final child approval. Required Site Visits and evidence gates must already be satisfied.";
  }
  if (presentation?.reviewDecisionState === "approved") {
    return "This Sub-milestone is already approved.";
  }
  if (presentation?.column === "in_review") {
    return "Only Lender Admin can approve while the child is In Review.";
  }
  return "Approval unlocks after the builder submits completion for review.";
}

function SubMilestonePrimaryActions({
  approveEnabled,
  approveReason,
  busy,
  completeEnabled,
  completeReason,
  denialReason,
  onApprove,
  onComplete,
  onStart,
  showBackofficeActions,
  showBuilderActions,
  startEnabled,
  startReason,
}: {
  approveEnabled: boolean;
  approveReason: string;
  busy: "start" | "complete" | "approve" | "evidence" | "site_visit" | null;
  completeEnabled: boolean;
  completeReason: string;
  denialReason?:
    | "already_started"
    | "assignment_required"
    | "completed"
    | "lender_review_only"
    | "permission_denied";
  onApprove: () => void;
  onComplete: () => void;
  onStart: () => void;
  showBackofficeActions: boolean;
  showBuilderActions: boolean;
  startEnabled: boolean;
  startReason: string;
}) {
  if (!(showBuilderActions || showBackofficeActions)) {
    return null;
  }

  const status = showBuilderActions
    ? builderActionStatus({
        completeEnabled,
        completeReason,
        denialReason,
        startEnabled,
        startReason,
      })
    : approveReason;

  return (
    <div
      className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between"
      data-testid="submilestone-primary-actions"
    >
      <p className="min-w-0 text-muted-foreground text-xs leading-5">
        {status}
      </p>
      <div className="flex shrink-0 flex-wrap gap-2">
        {showBuilderActions ? (
          <>
            <Button
              disabled={busy !== null || !startEnabled}
              onClick={onStart}
              size="sm"
              title={startReason}
              type="button"
              variant={startEnabled ? "default" : "outline"}
            >
              {busy === "start" ? "Starting…" : "Start Sub-milestone"}
            </Button>
            <Button
              disabled={busy !== null || !completeEnabled}
              onClick={onComplete}
              size="sm"
              title={completeReason}
              type="button"
              variant={completeEnabled ? "default" : "outline"}
            >
              {busy === "complete" ? "Submitting…" : "Complete Sub-milestone"}
            </Button>
          </>
        ) : null}
        {showBackofficeActions ? (
          <Button
            disabled={busy !== null || !approveEnabled}
            onClick={onApprove}
            size="sm"
            title={approveReason}
            type="button"
            variant={approveEnabled ? "default" : "outline"}
          >
            {busy === "approve" ? "Approving…" : "Approve Sub-milestone"}
          </Button>
        ) : null}
      </div>
    </div>
  );
}

function AllocationEmptyState({
  ctaLabel,
  description,
  disabled,
  filledLabel,
  highlight,
  icon,
  onAdd,
  title,
}: {
  ctaLabel: string;
  description: string;
  disabled?: boolean;
  filledLabel?: string | null;
  highlight?: boolean;
  icon: ReactNode;
  onAdd: () => void;
  title: string;
}) {
  return (
    <div
      className={cn(
        "flex h-full flex-col rounded-xl border border-dashed bg-muted/15 p-3",
        highlight && "border-warning/50 bg-warning/5"
      )}
    >
      <div className="flex items-center gap-2">
        <span className="grid size-8 place-items-center rounded-lg border bg-background text-muted-foreground">
          {icon}
        </span>
        <p className="font-medium text-sm">{title}</p>
      </div>
      {filledLabel ? (
        <div className="mt-3 flex flex-wrap gap-1.5">
          <Badge variant="outline">{filledLabel}</Badge>
        </div>
      ) : null}
      <p className="mt-3 flex-1 text-muted-foreground text-xs leading-5">
        {description}
      </p>
      <Button
        className="mt-3 w-full"
        disabled={disabled}
        onClick={onAdd}
        size="sm"
        type="button"
        variant={filledLabel ? "outline" : highlight ? "default" : "secondary"}
      >
        <Plus className="size-3.5" /> {ctaLabel}
      </Button>
    </div>
  );
}

function SubMilestoneSiteVisitsSection({
  busy,
  canOrder,
  onOpenRecord,
  onOrder,
  siteVisit,
}: {
  busy: boolean;
  canOrder: boolean;
  onOpenRecord: () => void;
  onOrder: () => void;
  siteVisit: CollaborationSystemPresentation["siteVisitRequirement"];
}) {
  return (
    <section className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-1 font-medium text-sm">
          <CalendarCheck className="size-4" /> Site visits
        </p>
        {canOrder ? (
          <Button disabled={busy} onClick={onOrder} size="sm" type="button">
            Order site visit
          </Button>
        ) : null}
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <CompactFact
          label="Requirement"
          value={
            siteVisit
              ? siteVisit.required
                ? humanizeEnumLabel(siteVisit.status)
                : "Not required"
              : "—"
          }
        />
        <CompactFact
          label="Ordered"
          value={siteVisit?.siteVisitId ? "Linked visit" : "None"}
        />
      </div>
      {siteVisit?.siteVisitId ? (
        <Button
          onClick={onOpenRecord}
          size="sm"
          type="button"
          variant="outline"
        >
          View report and evidence
        </Button>
      ) : canOrder ? (
        <div className="rounded-xl border border-dashed bg-muted/15 px-3 py-4">
          <p className="font-medium text-sm">Order a Site Visit</p>
          <p className="mt-1 text-muted-foreground text-xs leading-5">
            Configure inspection scope and field instructions, then create the
            visit link for the field team.
          </p>
        </div>
      ) : (
        <p className="rounded-lg border border-dashed px-3 py-2 text-muted-foreground text-xs">
          {siteVisit?.required
            ? "A required Site Visit has not been ordered yet."
            : "No Site Visit is required for this Sub-milestone."}
        </p>
      )}
    </section>
  );
}

function SubMilestoneBuilderEvidenceSection({
  canUpload,
  evidenceCount,
  milestoneKey,
  onOpenRecord,
  onUpload,
  packageRevision,
  submilestoneKey,
  uploadUnavailableReason,
}: {
  canUpload: boolean;
  evidenceCount: number;
  milestoneKey?: string;
  onOpenRecord: () => void;
  onUpload: (input: EvidenceUploaderUploadInput) => Promise<void>;
  packageRevision?: number;
  submilestoneKey?: string;
  uploadUnavailableReason?: string;
}) {
  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="flex items-center gap-1 font-medium text-sm">
            <ImageIcon className="size-4" /> Builder evidence
          </p>
          <p className="text-muted-foreground text-xs">
            Every uploaded photo remains attached to its Evidence Package
            revision.
          </p>
        </div>
        <Badge variant="outline">
          {evidenceCount} photo{evidenceCount === 1 ? "" : "s"}
        </Badge>
      </div>
      {evidenceCount > 0 ? (
        <Card className="shadow-none">
          <CardPanel className="flex flex-wrap items-center justify-between gap-3 p-3">
            <div>
              <p className="font-medium text-sm">
                {evidenceCount} photo{evidenceCount === 1 ? "" : "s"} in package
                {packageRevision ? ` · r${packageRevision}` : ""}
              </p>
              <p className="mt-1 text-muted-foreground text-xs">
                Open the execution record to review individual files and
                location verification.
              </p>
            </div>
            <Button
              onClick={onOpenRecord}
              size="sm"
              type="button"
              variant="outline"
            >
              Open evidence package
            </Button>
          </CardPanel>
        </Card>
      ) : canUpload ? null : (
        <div className="rounded-xl border border-dashed bg-muted/20 px-4 py-6 text-center">
          <ImageIcon className="mx-auto size-6 text-muted-foreground" />
          <p className="mt-2 font-medium text-sm">No Builder evidence yet</p>
          <p className="mt-1 text-muted-foreground text-xs">
            Upload completion photos from the field. Geofence failures stay
            attached and route for lender review.
          </p>
        </div>
      )}
      {canUpload && milestoneKey && submilestoneKey ? (
        <EvidenceUploader
          data={{ milestoneKey }}
          item={{ evidence: [], key: submilestoneKey }}
          onUpload={onUpload}
        />
      ) : evidenceCount > 0 ? null : (
        <Button
          onClick={onOpenRecord}
          size="sm"
          type="button"
          variant="outline"
        >
          Open evidence package
        </Button>
      )}
      {uploadUnavailableReason ? (
        <p className="text-muted-foreground text-xs" role="status">
          {uploadUnavailableReason}
        </p>
      ) : null}
    </section>
  );
}

function DetailBlock({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="font-medium text-xs">{label}</p>
      <p className="mt-1 text-muted-foreground text-sm leading-5">{value}</p>
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

function DrawBoardlessExperience({
  drawCapabilities,
  facts,
  onOpenActionItem,
  viewerRole,
  viewerRoles,
}: {
  drawCapabilities?: DrawWorkflowCapabilities;
  facts?: SystemDrawFacts;
  onOpenActionItem: (target: BuildDetailTarget) => void;
  viewerRole?: string;
  viewerRoles?: string[];
}) {
  if (!facts) {
    return (
      <section
        aria-label="Draw lifecycle facts"
        className="space-y-2"
        data-testid="system-post-draw-facts-unavailable"
      >
        <p className="font-medium text-xs">Draw lifecycle facts</p>
        <p className="text-muted-foreground text-xs" role="status">
          Draw facts are unavailable in this view. Open the canonical Draw
          surface for authoritative lifecycle details.
        </p>
      </section>
    );
  }

  const step = drawLifecycleStep(facts);
  const amount = facts.request?.amountCents ?? facts.planned?.amountCents;
  const roles = viewerRoles ?? (viewerRole ? [viewerRole] : []);
  const workflow = resolveDrawWorkflow({
    capabilities:
      drawCapabilities ?? drawWorkflowReadCapabilitiesForRoles(roles),
    drawId: facts.request?._id ?? facts.planned?._id,
    routeContext: drawWorkflowRouteContextForRoles(roles),
    status: drawWorkflowStatus(facts),
    viewerRoles: roles,
  });
  const drawTarget = workflow.target;

  return (
    <div className="space-y-4" data-testid="system-post-draw-facts">
      <Frame>
        <FramePanel className="grid gap-3 p-3 sm:grid-cols-4">
          <SummaryMetric
            label="Canonical state"
            value={drawLifecycleLabel(step)}
          />
          <SummaryMetric
            label="Requested"
            value={amount === undefined ? "—" : drawFactMoney(amount)}
          />
          <SummaryMetric
            label="Generated items"
            value={String(facts.generatedActionItems)}
          />
          <SummaryMetric label="Workflow authority" value="Canonical Draw" />
        </FramePanel>
      </Frame>
      <Frame>
        <FramePanel className="space-y-5 p-4 sm:p-5">
          <DrawLifecycleStepper active={step} />
          {workflow.actions.open && drawTarget ? (
            <DrawWorkflowEntrypoint
              action={workflow.actions.open}
              drawLabel={
                facts.request?.displayId ?? facts.planned?.label ?? "Draw"
              }
              onOpenActionItem={onOpenActionItem}
              target={drawTarget}
            />
          ) : null}
          <div className="grid gap-3 sm:grid-cols-3">
            <FactCard
              icon={<Banknote />}
              label="Requested amount"
              value={
                amount === undefined ? "Not requested" : drawFactMoney(amount)
              }
            />
            <FactCard
              icon={<FileText />}
              label="Evidence Package"
              value={`${humanizeEnumLabel(facts.evidence.state)}${
                facts.evidence.assetCount > 0
                  ? ` · ${facts.evidence.assetCount} assets`
                  : ""
              }`}
            />
            <FactCard
              icon={<MapPin />}
              label="Site Visit"
              value={
                facts.siteVisit.count > 0
                  ? `${facts.siteVisit.count} visit${facts.siteVisit.count === 1 ? "" : "s"} · ${facts.siteVisit.complete} complete`
                  : "None ordered"
              }
            />
          </div>
          <div className="flex flex-wrap gap-1.5">
            <Badge variant="secondary">
              Evidence · {humanizeEnumLabel(facts.evidence.state)}
            </Badge>
            <Badge variant="secondary">
              Site Visits · {facts.siteVisit.count}
            </Badge>
            <Badge variant="secondary">
              Approval · {humanizeEnumLabel(facts.approval.state)}
            </Badge>
            {facts.disposition ? (
              <Badge variant="warning">
                Disposition · {humanizeEnumLabel(facts.disposition.kind)}
              </Badge>
            ) : null}
          </div>
        </FramePanel>
      </Frame>
    </div>
  );
}

function DrawWorkflowEntrypoint({
  action,
  drawLabel,
  onOpenActionItem,
  target,
}: {
  action: DrawWorkflowActionMetadata;
  drawLabel: string;
  onOpenActionItem: (target: BuildDetailTarget) => void;
  target: BuildDetailTarget;
}) {
  return (
    <Frame>
      <FramePanel className="flex flex-col gap-3 p-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="font-medium text-sm">Canonical Draw workflow</p>
          <p className="text-muted-foreground text-xs">
            {action.context === "decision"
              ? "Open the lender admin decision context for this Draw."
              : action.context === "review"
                ? "Open the canonical evidence and review context for this Draw."
                : "Open the canonical Draw record and its read-only history when applicable."}
          </p>
        </div>
        <Button
          aria-label={`${action.label} ${drawLabel}`}
          data-testid="system-post-draw-open"
          onClick={() => onOpenActionItem(target)}
          size="sm"
          type="button"
        >
          <ArrowRight aria-hidden="true" className="size-4" />
          {action.label}
        </Button>
      </FramePanel>
    </Frame>
  );
}

function DrawLifecycleStepper({ active }: { active: DrawLifecycleStep }) {
  const activeIndex = DRAW_LIFECYCLE_STEPS.indexOf(active);
  return (
    <section>
      <div>
        <h2 className="font-semibold text-sm">Canonical Draw lifecycle</h2>
        <p className="text-muted-foreground text-xs">
          Projection only · the System Post never requests or releases funds by
          itself
        </p>
      </div>
      <div className="mt-4 grid gap-2 sm:grid-cols-7">
        {DRAW_LIFECYCLE_STEPS.map((state, index) => (
          <div
            className="flex items-center gap-2 sm:flex-col sm:items-start"
            key={state}
          >
            <span
              className={cn(
                "grid size-6 shrink-0 place-items-center rounded-full border",
                index <= activeIndex &&
                  "border-primary bg-primary text-primary-foreground"
              )}
            >
              {index < activeIndex ? (
                <CheckCircle2 className="size-3.5" />
              ) : (
                <Circle className="size-3" />
              )}
            </span>
            <p
              className={cn(
                "text-xs",
                index === activeIndex
                  ? "font-semibold"
                  : "text-muted-foreground"
              )}
            >
              {drawLifecycleLabel(state)}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}

function SummaryMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-lg bg-muted/40 px-3 py-2">
      <p className="truncate text-muted-foreground text-xs">{label}</p>
      <p className="mt-1 font-semibold text-base">{value}</p>
    </div>
  );
}

function FactCard({
  icon,
  label,
  value,
}: {
  icon: ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-xl border bg-muted/25 p-3">
      <div className="flex items-center gap-2 text-muted-foreground text-xs">
        <span className="[&_svg]:size-3.5">{icon}</span>
        {label}
      </div>
      <p className="mt-2 font-medium text-sm">{value}</p>
    </div>
  );
}

function StatePulseIcon({ state }: { state: WorkColumn }) {
  if (state === "behind_schedule") {
    return <AlertTriangle className="size-3.5 text-destructive" />;
  }
  if (state === "in_progress") {
    return <PlayCircle className="size-3.5 text-info" />;
  }
  if (state === "in_review") {
    return <Eye className="size-3.5 text-warning" />;
  }
  if (state === "approved") {
    return <CheckCircle2 className="size-3.5 text-success" />;
  }
  return <Circle className="size-3.5 text-muted-foreground" />;
}

function columnTone(
  column: CollaborationSystemPresentation["column"]
): BadgeProps["variant"] {
  if (column === "behind_schedule") {
    return "error";
  }
  if (column === "in_progress") {
    return "info";
  }
  if (column === "in_review") {
    return "warning";
  }
  if (column === "approved") {
    return "success";
  }
  return "secondary";
}

function drawLifecycleStep(facts: SystemDrawFacts): DrawLifecycleStep {
  const workflowStatus = drawWorkflowStatus(facts);
  if (
    workflowStatus === "rejected" ||
    workflowStatus === "withdrawn" ||
    workflowStatus === "cancelled"
  ) {
    return "closed";
  }
  if (facts.release.state === "released") {
    return "released";
  }
  if (
    facts.approval.state === "approved" ||
    facts.release.state === "approved_for_release"
  ) {
    return "approved";
  }
  if (facts.review.state === "ready_for_admin") {
    return "ready_for_admin";
  }
  if (facts.review.state === "in_review") {
    return "in_review";
  }
  if (facts.request) {
    return "requested";
  }
  return "scheduled";
}

function drawWorkflowStatus(facts: SystemDrawFacts): DrawWorkflowStatus {
  const status = facts.request?.status ?? facts.planned?.status;
  if (status) {
    return status === "approved" ? "approved_for_release" : status;
  }
  if (facts.release.state === "released") {
    return "released";
  }
  if (
    facts.approval.state === "approved" ||
    facts.release.state === "approved_for_release"
  ) {
    return "approved_for_release";
  }
  if (facts.review.state === "ready_for_admin") {
    return "ready_for_admin";
  }
  if (facts.review.state === "in_review") {
    return "in_review";
  }
  if (facts.request) {
    return "requested";
  }
  return "planned";
}

function drawLifecycleLabel(state: DrawLifecycleStep) {
  const labels: Record<DrawLifecycleStep, string> = {
    approved: "Approved",
    closed: "Closed",
    in_review: "In review",
    ready_for_admin: "Ready for admin",
    released: "Released",
    requested: "Requested",
    scheduled: "Scheduled",
  };
  return labels[state];
}

function drawFactMoney(amountCents: number) {
  return new Intl.NumberFormat("en-CA", {
    currency: "CAD",
    maximumFractionDigits: 0,
    style: "currency",
  }).format(amountCents / 100);
}

function humanizeEnumLabel(value: string) {
  const normalized = value.replaceAll("_", " ").trim();
  return normalized
    ? normalized.charAt(0).toUpperCase() + normalized.slice(1)
    : value;
}

function formatPlanDate(value: string) {
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) {
    return value;
  }
  return new Intl.DateTimeFormat("en-US", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(parsed);
}

function formatPlanDateShort(value: string) {
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) {
    return value;
  }
  return new Intl.DateTimeFormat("en-US", {
    day: "numeric",
    month: "short",
  }).format(parsed);
}
