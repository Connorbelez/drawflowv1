"use client";

/**
 * Production System Post UI — adapted from Variant A (Inline workboard) of
 * `/prototype/system-posts`. Theme-token styled; mock prototype data is not used.
 */

import {
  AlertTriangle,
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
  UserPlus,
  Users,
} from "lucide-react";
import { type ReactNode, useMemo, useState } from "react";
import { toast } from "sonner";

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
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "#/components/ui/collapsible.tsx";
import { Frame, FramePanel } from "#/components/ui/frame.tsx";
import { cn } from "#/lib/utils.ts";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import type { BuildDetailTarget } from "../build-detail-targets/buildDetailTarget.ts";
import { useBuildCollaborationMutation } from "./BuildCollaborationMutationGate.tsx";
import {
  type CollaborationActionItem,
  type CollaborationFeedPostEntry,
  type CollaborationPlanningReconciliation,
  type CollaborationSystemPresentation,
  classifyCollaborationActionItem,
  initials,
  isCanonicalMilestoneItem,
  type ReferenceOption,
  roleLabel,
  systemPresentationLabels,
} from "./model.ts";

type CollaborationSystemPost = NonNullable<
  CollaborationFeedPostEntry["post"]["systemPost"]
>;
type SystemMilestonePlanningSummary = NonNullable<
  CollaborationFeedPostEntry["post"]["planningSummary"]
>;
type SystemDrawFacts = NonNullable<CollaborationSystemPost["drawFacts"]>;
type DrawCoordinationState = NonNullable<
  CollaborationSystemPost["drawCoordination"]
>;
type HistoricalBackfillFacts = NonNullable<
  CollaborationSystemPost["historicalBackfill"]
>;
type PlanningDiff = CollaborationPlanningReconciliation["diffs"][number];
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
  | "released";

const DRAW_LIFECYCLE_STEPS: DrawLifecycleStep[] = [
  "scheduled",
  "requested",
  "in_review",
  "ready_for_admin",
  "approved",
  "released",
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
  brief,
  buildId,
  coordinationVisible,
  entry,
  mutationsAllowed,
  onCreateActionItem,
  onLoadMorePlanningDiffs,
  onOpenActionItem,
  organizationId,
  planningDiffsLoadingMore,
  planningReconciliation,
  tagOptions,
}: {
  brief?: ReactNode;
  buildId: Id<"activeBuilds">;
  coordinationVisible: boolean;
  entry: CollaborationFeedPostEntry;
  mutationsAllowed: boolean;
  onCreateActionItem: (postId: Id<"buildCollaborationPosts">) => void;
  onLoadMorePlanningDiffs: () => void;
  onOpenActionItem: (target: BuildDetailTarget) => void;
  organizationId: string;
  planningDiffsLoadingMore: boolean;
  planningReconciliation?: CollaborationPlanningReconciliation;
  tagOptions: ReferenceOption[];
  viewerRole?: string;
  viewerRoles?: string[];
}) {
  const systemPost = entry.post.systemPost;
  if (!systemPost) {
    return null;
  }

  const title = systemPostTitle(entry);
  const isDraw = systemPost.kind === "draw";
  const generatedItems = entry.actionItems.filter(isCanonicalMilestoneItem);
  const coordinationItems = entry.actionItems.filter(
    (item) => !isCanonicalMilestoneItem(item)
  );

  return (
    <div
      className="space-y-4"
      data-testid="system-post-experience"
      data-variant="A"
    >
      {title ? (
        <h2 className="font-semibold text-lg tracking-tight">{title}</h2>
      ) : null}
      {brief}
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
          buildId={buildId}
          coordination={systemPost.drawCoordination}
          coordinationItems={coordinationItems}
          coordinationVisible={coordinationVisible}
          facts={systemPost.drawFacts}
          mutationsAllowed={mutationsAllowed}
          onCreateActionItem={onCreateActionItem}
          onOpenActionItem={onOpenActionItem}
          organizationId={organizationId}
          postId={entry.post._id}
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
      {systemPost.historicalBackfill ? (
        <HistoricalBackfillDisclosure
          backfill={systemPost.historicalBackfill}
        />
      ) : null}
      {isDraw ? (
        <Collapsible className="rounded-lg border" defaultOpen>
          <CollapsibleTrigger className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-xs">
            <span className="font-medium">Domain provenance</span>
            <ChevronDown className="size-4 text-muted-foreground" />
          </CollapsibleTrigger>
          <CollapsibleContent className="border-t px-3 py-3">
            <SystemPostIdentityFacts
              entry={entry}
              systemPost={systemPost}
              tagOptions={tagOptions}
            />
          </CollapsibleContent>
        </Collapsible>
      ) : (
        <Collapsible className="rounded-lg border" defaultOpen>
          <CollapsibleTrigger className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-xs">
            <span className="font-medium">Domain provenance & planning</span>
            <ChevronDown className="size-4 text-muted-foreground" />
          </CollapsibleTrigger>
          <CollapsibleContent className="space-y-3 border-t px-3 py-3">
            <SystemPostIdentityFacts
              entry={entry}
              systemPost={systemPost}
              tagOptions={tagOptions}
            />
            <SystemPostPlanningComparison
              diffsLoadingMore={planningDiffsLoadingMore}
              onLoadMoreDiffs={onLoadMorePlanningDiffs}
              planningReconciliation={planningReconciliation}
              systemPost={systemPost}
            />
          </CollapsibleContent>
        </Collapsible>
      )}
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
  pathname = typeof window === "undefined" ? "" : window.location.pathname,
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
  presentation: CollaborationSystemPresentation | undefined,
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
        highlight && "border-warning/50 bg-warning/5",
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
  buildId,
  coordination,
  coordinationItems,
  coordinationVisible,
  facts,
  mutationsAllowed,
  onCreateActionItem,
  onOpenActionItem,
  organizationId,
  postId,
}: {
  buildId: Id<"activeBuilds">;
  coordination?: DrawCoordinationState;
  coordinationItems: CollaborationActionItem[];
  coordinationVisible: boolean;
  facts?: SystemDrawFacts;
  mutationsAllowed: boolean;
  onCreateActionItem: (postId: Id<"buildCollaborationPosts">) => void;
  onOpenActionItem: (target: BuildDetailTarget) => void;
  organizationId: string;
  postId: Id<"buildCollaborationPosts">;
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
          <DrawCoordinationPanel
            buildId={buildId}
            coordination={coordination}
            coordinationItems={coordinationItems}
            coordinationVisible={coordinationVisible}
            mutationsAllowed={mutationsAllowed}
            onCreateActionItem={onCreateActionItem}
            onOpenActionItem={onOpenActionItem}
            organizationId={organizationId}
            postId={postId}
          />
        </FramePanel>
      </Frame>
    </div>
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
      <div className="mt-4 grid gap-2 sm:grid-cols-6">
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

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Draw coordination keeps join/leave/create Action Item permissions on one boardless panel.
function DrawCoordinationPanel({
  buildId,
  coordination,
  coordinationItems,
  coordinationVisible,
  mutationsAllowed,
  onCreateActionItem,
  onOpenActionItem,
  organizationId,
  postId,
}: {
  buildId: Id<"activeBuilds">;
  coordination?: DrawCoordinationState;
  coordinationItems: CollaborationActionItem[];
  coordinationVisible: boolean;
  mutationsAllowed: boolean;
  onCreateActionItem: (postId: Id<"buildCollaborationPosts">) => void;
  onOpenActionItem: (target: BuildDetailTarget) => void;
  organizationId: string;
  postId: Id<"buildCollaborationPosts">;
}) {
  const join = useBuildCollaborationMutation(
    api.build_draw_coordination.joinDrawCoordination
  );
  const leave = useBuildCollaborationMutation(
    api.build_draw_coordination.leaveDrawCoordination
  );
  const [pending, setPending] = useState(false);
  const canCoordinate = coordinationVisible && coordination?.eligible === true;

  const updateCoordination = async (action: "join" | "leave") => {
    setPending(true);
    try {
      await (action === "join" ? join : leave)({
        buildId,
        organizationId,
        postId,
      });
      toast.success(
        action === "join"
          ? "Joined Draw coordination."
          : "Left Draw coordination."
      );
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Unable to update Draw coordination."
      );
    } finally {
      setPending(false);
    }
  };

  return (
    <section className="border-t pt-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-semibold text-sm">Internal coordination</h2>
            <Badge variant="outline">0 generated</Badge>
          </div>
          <p className="mt-1 text-muted-foreground text-xs">
            Ordinary Action Items only · completion has no Draw workflow effect
          </p>
        </div>
        {canCoordinate && !coordination?.oversight ? (
          <Button
            disabled={!mutationsAllowed || pending}
            onClick={() => onCreateActionItem(postId)}
            size="sm"
            type="button"
            variant="outline"
          >
            <UserPlus className="mr-1 size-3.5" /> Add coordination Action Item
          </Button>
        ) : null}
      </div>
      {canCoordinate ? (
        <Frame className="mt-3 rounded-md border bg-background/60 p-0">
          <FramePanel className="flex flex-wrap items-center justify-between gap-2 rounded-md border-0 bg-transparent p-2 shadow-none">
            <div className="flex items-center gap-2 text-xs">
              <Users aria-hidden="true" className="size-4" />
              <span>
                Working audience · {coordination.workingAudienceCount}
                {coordination.workingAudienceTruncated ? "+" : ""}
              </span>
              {coordination.oversight ? (
                <Badge variant="outline">Oversight only</Badge>
              ) : null}
            </div>
            {coordination.workingAudienceTruncated ? (
              <p
                className="basis-full text-amber-700 text-xs dark:text-amber-300"
                data-testid="draw-coordination-audience-truncated"
                role="status"
              >
                Working audience exceeds the display limit; the count shown is a
                conservative lower bound.
              </p>
            ) : null}
            {coordination.oversight ? null : (
              <div className="flex flex-wrap gap-1.5">
                {coordination.canJoin ? (
                  <Button
                    disabled={!mutationsAllowed || pending}
                    onClick={() => updateCoordination("join")}
                    size="sm"
                    type="button"
                    variant="outline"
                  >
                    Join coordination
                  </Button>
                ) : null}
                {coordination.canLeave ? (
                  <Button
                    disabled={!mutationsAllowed || pending}
                    onClick={() => updateCoordination("leave")}
                    size="sm"
                    type="button"
                    variant="outline"
                  >
                    Leave coordination
                  </Button>
                ) : null}
              </div>
            )}
          </FramePanel>
        </Frame>
      ) : (
        <p className="mt-3 text-muted-foreground text-xs">
          Internal coordination is unavailable for this role.
        </p>
      )}
      <div className="mt-3 space-y-2">
        {coordinationItems.length === 0 ? (
          <Card className="border-dashed shadow-none">
            <CardPanel className="p-4 text-center">
              <p className="font-medium text-sm">No coordination items</p>
              <p className="mt-1 text-muted-foreground text-xs">
                This is intentional. Draw System Posts never pre-generate work.
              </p>
            </CardPanel>
          </Card>
        ) : (
          coordinationItems.map((item) => (
            <Card className="shadow-none" key={item._id}>
              <CardPanel className="flex items-center justify-between gap-3 p-3">
                <div className="min-w-0">
                  <p className="truncate font-medium text-sm">{item.title}</p>
                  <p className="text-muted-foreground text-xs">
                    {humanizeEnumLabel(item.status)}
                  </p>
                </div>
                <Button
                  onClick={() =>
                    onOpenActionItem(
                      classifyCollaborationActionItem(item).target
                    )
                  }
                  size="sm"
                  type="button"
                  variant="ghost"
                >
                  Open
                </Button>
              </CardPanel>
            </Card>
          ))
        )}
      </div>
      <p className="mt-3 text-muted-foreground text-xs">
        {coordination?.eligible
          ? "No generated Action Items or Draw board. Discussion remains available; all workflow commands stay in the canonical Draw surfaces."
          : "Canonical Draw facts remain visible. Internal coordination, discussion, and related work are restricted to eligible Build participants."}
      </p>
    </section>
  );
}

function HistoricalBackfillDisclosure({
  backfill,
}: {
  backfill: HistoricalBackfillFacts;
}) {
  return (
    <section
      aria-label="Historical System Post provenance"
      className="space-y-1 rounded-lg border border-dashed px-3 py-2 text-xs"
      data-testid="system-post-historical-backfill"
    >
      <p className="font-medium">Historical backfill</p>
      <p className="text-muted-foreground">
        Materialized from existing canonical records. Missing history is
        preserved as Unknown; no start, actor, evidence, review, approval, or
        disposition facts are inferred.
      </p>
      {backfill.unknownFacts.length > 0 ? (
        <p>
          <span className="font-medium">Unknown historical facts:</span>{" "}
          {backfill.unknownFacts.map(historicalFactLabel).join(", ")}
        </p>
      ) : null}
    </section>
  );
}

function SystemPostIdentityFacts({
  entry,
  systemPost,
  tagOptions,
}: {
  entry: CollaborationFeedPostEntry;
  systemPost: CollaborationSystemPost;
  tagOptions: ReferenceOption[];
}) {
  const milestoneReference = entry.references.find(
    (reference) => reference.entityKind === "milestone"
  );
  const drawFacts =
    systemPost.kind === "draw" ? systemPost.drawFacts : undefined;
  const triggeredByLabel = systemPost.triggeredByWorkosUserId
    ? (tagOptions.find(
        (option) =>
          option.kind === "participant" &&
          option.id === systemPost.triggeredByWorkosUserId
      )?.label ?? "Former Build participant")
    : systemPost.triggeredByRole
      ? roleLabel(systemPost.triggeredByRole)
      : "DrawFlow System";

  return (
    <dl className="grid gap-x-4 gap-y-1 text-xs sm:grid-cols-3">
      <div>
        <dt className="text-muted-foreground">
          {systemPost.kind === "draw" ? "Draw occurrence" : "Milestone"}
        </dt>
        <dd className="font-medium">
          {systemPost.kind === "draw"
            ? (drawFacts?.planned?.drawKey ?? "Canonical Draw")
            : (milestoneReference?.labelSnapshot ?? "Canonical Milestone")}
        </dd>
      </div>
      <div>
        <dt className="text-muted-foreground">Triggered by</dt>
        <dd className="font-medium">{triggeredByLabel}</dd>
      </div>
      <div>
        <dt className="text-muted-foreground">Activation</dt>
        <dd className="font-medium">
          {systemPost.activationReason.replaceAll("_", " ")}
        </dd>
      </div>
    </dl>
  );
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Planning comparison intentionally renders the full reconciliation matrix in one secondary disclosure.
function SystemPostPlanningComparison({
  diffsLoadingMore,
  onLoadMoreDiffs,
  planningReconciliation,
  systemPost,
}: {
  diffsLoadingMore: boolean;
  onLoadMoreDiffs: () => void;
  planningReconciliation?: CollaborationPlanningReconciliation;
  systemPost: CollaborationSystemPost;
}) {
  const activationRevision =
    planningReconciliation?.activation?.revision ??
    systemPost.activationPlanningRevision;
  const currentRevision =
    planningReconciliation?.current.revision ??
    systemPost.currentPlanningRevision;
  const diffs = useMemo(
    () =>
      planningReconciliation?.diffs.filter((diff) => {
        const milestoneKey = systemPost.milestoneKey;
        if (!milestoneKey) {
          return false;
        }
        return (
          diff.entityKey === milestoneKey ||
          diff.entityKey.startsWith(`${milestoneKey}:`)
        );
      }) ?? [],
    [planningReconciliation?.diffs, systemPost.milestoneKey]
  );
  const hasComparison =
    planningReconciliation !== undefined ||
    activationRevision !== undefined ||
    currentRevision !== undefined;
  if (!hasComparison) {
    return null;
  }
  const changed =
    diffs.length > 0 ||
    (activationRevision !== undefined &&
      currentRevision !== undefined &&
      activationRevision !== currentRevision);
  const categoryCounts = new Map<
    PlanningDiff["category"],
    {
      changeTypes: Map<PlanningDiff["changeType"], number>;
      count: number;
      entityTypes: Set<string>;
    }
  >();
  for (const diff of diffs) {
    const current = categoryCounts.get(diff.category) ?? {
      changeTypes: new Map<PlanningDiff["changeType"], number>(),
      count: 0,
      entityTypes: new Set<string>(),
    };
    current.count += 1;
    current.changeTypes.set(
      diff.changeType,
      (current.changeTypes.get(diff.changeType) ?? 0) + 1
    );
    current.entityTypes.add(diff.entityType);
    categoryCounts.set(diff.category, current);
  }
  return (
    <section
      aria-label="Planning revision comparison"
      className="space-y-3 border-t pt-3"
      data-testid="system-post-planning-comparison"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-medium text-xs">Planning revision comparison</p>
          <p className="text-muted-foreground text-xs">
            Activation snapshot versus the current approved plan
          </p>
        </div>
        <Badge
          variant={
            planningReconciliation === undefined
              ? "outline"
              : changed
                ? "warning"
                : "success"
          }
        >
          {planningReconciliation === undefined
            ? "Loading comparison…"
            : changed
              ? "Changed since activation"
              : "Matches activation"}
        </Badge>
      </div>
      <dl className="grid grid-cols-2 gap-2 text-xs">
        <div>
          <dt className="text-muted-foreground">Activation revision</dt>
          <dd className="font-medium">
            {activationRevision === undefined
              ? "Unavailable"
              : `v${activationRevision}`}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Current revision</dt>
          <dd className="font-medium">
            {currentRevision === undefined
              ? "Unavailable"
              : `v${currentRevision}`}
          </dd>
        </div>
      </dl>
      {planningReconciliation?.revisionsTruncated ? (
        <p
          className="text-muted-foreground text-xs"
          data-testid="planning-revisions-truncated"
          role="status"
        >
          Only the latest 100 planning revisions are shown. Earlier revision
          history is unavailable in this view; the canonical planning record
          remains authoritative.
        </p>
      ) : null}
      {planningReconciliation?.diffsTruncated ? (
        <p
          className="text-muted-foreground text-xs"
          data-testid="planning-diffs-truncated"
          role="status"
        >
          Structured planning diffs are truncated at 10,000 changes. The
          canonical planning record remains authoritative.
        </p>
      ) : null}
      {planningReconciliation?.diffPagesPending || diffsLoadingMore ? (
        <div
          className="flex flex-wrap items-center justify-between gap-2 text-muted-foreground text-xs"
          data-testid="planning-diffs-more-available"
          role="status"
        >
          <span>
            {diffsLoadingMore
              ? "Loading more structured planning changes…"
              : "More structured planning changes are available."}
          </span>
          {!diffsLoadingMore && planningReconciliation?.diffPagesPending ? (
            <Button
              onClick={onLoadMoreDiffs}
              size="sm"
              type="button"
              variant="outline"
            >
              Load more changes
            </Button>
          ) : null}
        </div>
      ) : null}
      {planningReconciliation === undefined ? (
        <p className="text-muted-foreground text-xs" role="status">
          Loading structured planning changes…
        </p>
      ) : diffs.length === 0 ? (
        planningReconciliation.diffPagesPending ? null : planningReconciliation.diffsTruncated ||
          !systemPost.milestoneKey ? (
          <p
            className="text-muted-foreground text-xs"
            data-testid="planning-diffs-indeterminate"
            role="status"
          >
            Structured planning changes cannot be determined because the
            available diff window is truncated. The canonical planning record
            remains authoritative.
          </p>
        ) : (
          <p className="text-muted-foreground text-xs">
            No structured planning changes are recorded after activation.
          </p>
        )
      ) : (
        <div className="space-y-2">
          <p className="font-medium text-xs">
            Structured changes · {diffs.length}
          </p>
          <ul
            aria-label="Structured planning changes"
            className="grid gap-1.5 text-xs sm:grid-cols-2"
          >
            {[...categoryCounts].map(([category, value]) => (
              <li key={category}>
                <Frame className="rounded-md border bg-muted/20 p-0">
                  <FramePanel className="flex items-center justify-between gap-2 rounded-md border-0 bg-transparent px-2 py-1.5 shadow-none">
                    <span>{planningCategoryLabel(category)}</span>
                    <span className="text-muted-foreground">
                      {value.count} change{value.count === 1 ? "" : "s"} ·{" "}
                      {[...value.changeTypes]
                        .map(
                          ([changeType, count]) =>
                            String(count) +
                            " " +
                            planningChangeTypeLabel(changeType)
                        )
                        .join(", ")}
                      {" · "}
                      {[...value.entityTypes]
                        .map(planningEntityTypeLabel)
                        .join(", ")}
                    </span>
                  </FramePanel>
                </Frame>
              </li>
            ))}
          </ul>
          <p className="text-muted-foreground text-xs">
            Change values stay governed by the canonical planning record.
          </p>
        </div>
      )}
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

function drawLifecycleLabel(state: DrawLifecycleStep) {
  const labels: Record<DrawLifecycleStep, string> = {
    approved: "Approved",
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

function historicalFactLabel(
  fact: HistoricalBackfillFacts["unknownFacts"][number]
) {
  switch (fact) {
    case "start":
      return "start time";
    case "actor":
      return "actor";
    case "evidence":
      return "evidence";
    case "review":
      return "review";
    case "approval":
      return "approval";
    case "disposition":
      return "disposition";
    default: {
      const _exhaustive: never = fact;
      return _exhaustive;
    }
  }
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

function planningCategoryLabel(category: PlanningDiff["category"]) {
  switch (category) {
    case "allocations":
      return "Assignments";
    case "dates":
      return "Schedule";
    case "dependencies":
      return "Dependencies";
    case "evidence_requirements":
      return "Evidence requirements";
    case "scope":
      return "Scope";
    default: {
      const _exhaustive: never = category;
      return _exhaustive;
    }
  }
}

function planningChangeTypeLabel(changeType: PlanningDiff["changeType"]) {
  switch (changeType) {
    case "added":
      return "added";
    case "removed":
      return "removed";
    case "changed":
      return "changed";
    default: {
      const _exhaustive: never = changeType;
      return _exhaustive;
    }
  }
}

function planningEntityTypeLabel(entityType: string) {
  switch (entityType) {
    case "milestone":
      return "Milestone";
    case "submilestone":
      return "Sub-milestone";
    case "budget":
      return "Budget";
    case "draw":
      return "Draw";
    case "allocation":
      return "Assignment";
    case "evidenceRequirement":
      return "Evidence requirement";
    default:
      return entityType;
  }
}
