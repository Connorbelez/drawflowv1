"use client";

import {
  CalendarDays,
  CheckCircle2,
  Circle,
  Loader2,
  MapPin,
} from "lucide-react";
import type { ReactNode } from "react";
import { Badge, type BadgeProps } from "#/components/ui/badge.tsx";
import { Button } from "#/components/ui/button.tsx";
import {
  Card,
  CardAction,
  CardFooter,
  CardHeader,
  CardPanel,
  CardTitle,
} from "#/components/ui/card.tsx";
import { Frame, FramePanel } from "#/components/ui/frame.tsx";
import { cn } from "#/lib/utils.ts";
import { formatCents, formatDate } from "./format";

export type KanbanColumn =
  | "Backlog"
  | "InProgress"
  | "BehindSchedule"
  | "MarkedComplete"
  | "SiteVisit"
  | "NeedsApproval";

export interface KanbanSubmilestone {
  budgetCents?: number;
  durationDays?: number;
  key: string;
  name: string;
  order: number;
  status: "todo" | "in_progress" | "done";
}

export interface KanbanCardData {
  approvedValueCents: number;
  code: string;
  column: KanbanColumn;
  contractors: { name: string; initials: string }[];
  drawGroupKey: string;
  evidenceReviewStatus?: string;
  forecastEndDate?: string;
  forecastStartDate?: string;
  milestoneId: string;
  milestoneKey: string;
  name: string;
  progressPercent: number;
  requestedAmountCents?: number;
  requiresSiteVisit: boolean;
  status: string;
  submilestones: KanbanSubmilestone[];
  submittedAt?: number;
  type: string;
}

const COLUMNS: {
  key: KanbanColumn;
  label: string;
  lenderLabel?: string;
  accent: string;
}[] = [
  { key: "Backlog", label: "Backlog", accent: "bg-muted/20" },
  { key: "InProgress", label: "In Progress", accent: "bg-info/8" },
  {
    key: "BehindSchedule",
    label: "Behind schedule",
    accent: "bg-destructive/8",
  },
  {
    key: "MarkedComplete",
    label: "Marked Complete",
    lenderLabel: "Completion submitted",
    accent: "bg-success/8",
  },
  {
    key: "SiteVisit",
    label: "Site Visit",
    lenderLabel: "Field review",
    accent: "bg-primary/8",
  },
  {
    key: "NeedsApproval",
    label: "Needs Approval",
    lenderLabel: "Lender decision",
    accent: "bg-warning/8",
  },
];

const STATUS_TONE: Record<
  string,
  { label: string; variant: BadgeProps["variant"] }
> = {
  completion_approved: {
    label: "Approved",
    variant: "success",
  },
  completion_requested: {
    label: "Marked complete",
    variant: "success",
  },
  in_progress_on_schedule: {
    label: "On schedule",
    variant: "info",
  },
  ready_to_start: {
    label: "Ready",
    variant: "info",
  },
  in_progress_behind_schedule: {
    label: "Behind schedule",
    variant: "error",
  },
  blocked: {
    label: "Blocked",
    variant: "error",
  },
  review: {
    label: "Review",
    variant: "warning",
  },
  planned: {
    label: "Planned",
    variant: "secondary",
  },
};

interface MilestoneKanbanProps {
  cards: KanbanCardData[];
  onAssignContractor?: (card: KanbanCardData) => void;
  onCardClick: (card: KanbanCardData) => void;
  onStartWork?: (card: KanbanCardData) => void;
  onToggleShowCompleted?: () => void;
  showCompleted?: boolean;
  viewerRole?: "builder" | "lender";
}

export function MilestoneKanban({
  cards,
  onAssignContractor,
  onCardClick,
  onStartWork,
  showCompleted = false,
  onToggleShowCompleted,
  viewerRole = "lender",
}: MilestoneKanbanProps): ReactNode {
  const visibleCards = showCompleted
    ? cards
    : cards.filter((c) => c.status !== "completion_approved");
  const byColumn = new Map<KanbanColumn, KanbanCardData[]>();
  for (const card of visibleCards) {
    const arr = byColumn.get(card.column) ?? [];
    arr.push(card);
    byColumn.set(card.column, arr);
  }
  return (
    <Frame
      className="min-w-0 max-w-full"
      data-ixc-ref="UI-KANBAN"
      data-testid="build-detail-kanban"
      id="kanban"
    >
      <FramePanel className="min-w-0 overflow-hidden p-3 sm:p-4">
        <header className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="font-semibold text-sm">
              {viewerRole === "lender"
                ? "Milestone review board"
                : "Milestone Kanban"}
            </h3>
            <p className="text-[11px] text-muted-foreground">
              {viewerRole === "lender"
                ? "Review exceptions first, then completion claims and field checks."
                : "Read-only projection · drag locked · open a card for full detail"}
            </p>
          </div>
          <label className="flex items-center justify-between gap-2 text-muted-foreground text-xs sm:justify-start">
            <span>Show completed</span>
            <button
              aria-pressed={showCompleted}
              className="min-h-8 rounded-md border border-border bg-card px-2 py-1 text-xs"
              data-testid="kanban-toggle-show-completed"
              onClick={onToggleShowCompleted}
              type="button"
            >
              {showCompleted ? "On" : "Off"}
            </button>
          </label>
        </header>
        <div
          className="-mx-3 min-w-0 overflow-x-auto px-3 sm:mx-0 sm:px-0"
          data-testid="kanban-horizontal-scroll"
        >
          <div className="grid min-w-[72rem] grid-cols-6 gap-2 rounded-xl border border-border bg-background/30 p-2.5">
            {COLUMNS.map((col) => {
              const list = byColumn.get(col.key) ?? [];
              return (
                <div
                  className="flex min-w-0 flex-col gap-2"
                  data-column={col.key}
                  data-testid={`kanban-col-${col.key}`}
                  key={col.key}
                >
                  <h4 className="flex items-center justify-between px-1 text-[11px] text-muted-foreground uppercase tracking-wider">
                    <span className="truncate">
                      {viewerRole === "lender" && col.lenderLabel
                        ? col.lenderLabel
                        : col.label}
                    </span>
                    <Badge size="sm" variant="secondary">
                      {list.length}
                    </Badge>
                  </h4>
                  <div className="flex flex-col gap-2">
                    {list.length === 0 ? (
                      <p className="rounded-md border border-border border-dashed p-3 text-[11px] text-muted-foreground">
                        No milestones in this column.
                      </p>
                    ) : null}
                    {list.map((card) => (
                      <MilestoneCard
                        card={card}
                        columnAccent={col.accent}
                        key={card.milestoneId}
                        onAssign={
                          onAssignContractor
                            ? () => onAssignContractor(card)
                            : undefined
                        }
                        onClick={() => onCardClick(card)}
                        onStart={
                          onStartWork &&
                          ["blocked", "planned", "ready_to_start"].includes(
                            card.status
                          )
                            ? () => onStartWork(card)
                            : undefined
                        }
                        viewerRole={viewerRole}
                      />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </FramePanel>
    </Frame>
  );
}

function MilestoneCard({
  card,
  columnAccent,
  onAssign,
  onClick,
  onStart,
  viewerRole,
}: {
  card: KanbanCardData;
  columnAccent: string;
  onAssign?: () => void;
  onClick: () => void;
  onStart?: () => void;
  viewerRole: "builder" | "lender";
}) {
  const tone = STATUS_TONE[card.status];
  const submilestoneDone = card.submilestones.filter(
    (s) => s.status === "done"
  ).length;
  const submilestoneInProg = card.submilestones.filter(
    (s) => s.status === "in_progress"
  ).length;
  const submilestoneTotal = card.submilestones.length;
  const previewSubmilestones = card.submilestones.slice(0, 3);
  return (
    <Card
      className={cn(
        "group relative w-full overflow-hidden rounded-xl shadow-none transition hover:border-foreground/30",
        columnAccent
      )}
      data-milestone-key={card.milestoneKey}
      data-testid={`kanban-card-${card.milestoneKey}`}
      onClick={onClick}
      render={<article />}
    >
      <CardHeader className="gap-1 p-3 pb-2">
        <div className="min-w-0">
          <p className="truncate font-mono text-[10px] text-muted-foreground uppercase tracking-wider">
            {card.code}
            {card.drawGroupKey.toUpperCase() === card.code
              ? null
              : ` · ${card.drawGroupKey.toUpperCase()}`}
          </p>
          <CardTitle
            aria-controls="milestone-detail-sheet"
            aria-haspopup="dialog"
            className="text-left text-xs after:absolute after:inset-0 after:z-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            render={<button type="button" />}
          >
            {card.name}
          </CardTitle>
        </div>
        {tone ? (
          <CardAction>
            <Badge size="sm" variant={tone.variant}>
              {tone.label}
            </Badge>
          </CardAction>
        ) : null}
      </CardHeader>

      <CardPanel className="px-3 pt-0 pb-2">
        <div className="flex items-center gap-2">
          <div
            aria-hidden
            className="relative h-1 flex-1 overflow-hidden rounded-full bg-muted"
          >
            <span
              className="absolute inset-y-0 left-0 bg-primary"
              style={{ width: `${Math.min(100, card.progressPercent)}%` }}
            />
          </div>
          <span className="text-[10px] text-muted-foreground tabular-nums">
            {card.progressPercent}%
          </span>
        </div>

        <dl className="mt-2 grid grid-cols-3 gap-2 border-y py-2 text-[10px]">
          <CompactFact
            label="Budget"
            value={formatCents(card.approvedValueCents, { compact: true })}
          />
          <CompactFact
            label="Start"
            value={
              card.forecastStartDate ? formatDate(card.forecastStartDate) : "—"
            }
          />
          <CompactFact
            label="Due"
            value={
              card.forecastEndDate ? formatDate(card.forecastEndDate) : "—"
            }
          />
          {card.requestedAmountCents ? (
            <CompactFact
              label="Requested"
              value={formatCents(card.requestedAmountCents, { compact: true })}
            />
          ) : null}
        </dl>

        {submilestoneTotal > 0 ? (
          <div className="mt-2">
            <div className="flex items-center justify-between text-[10px] text-muted-foreground">
              <span>Scope</span>
              <span className="tabular-nums">
                {submilestoneDone}/{submilestoneTotal} done
                {submilestoneInProg > 0
                  ? ` · ${submilestoneInProg} active`
                  : ""}
              </span>
            </div>
            <ul className="mt-1 grid gap-0.5">
              {previewSubmilestones.map((s) => (
                <li
                  className="flex items-center gap-1.5 text-[10px]"
                  key={s.key}
                >
                  <SubmilestoneIcon status={s.status} />
                  <span
                    className={
                      s.status === "done"
                        ? "truncate text-muted-foreground line-through"
                        : s.status === "in_progress"
                          ? "truncate font-medium text-foreground"
                          : "truncate text-foreground/80"
                    }
                  >
                    {s.name}
                  </span>
                </li>
              ))}
              {submilestoneTotal > previewSubmilestones.length ? (
                <li className="text-[10px] text-muted-foreground">
                  + {submilestoneTotal - previewSubmilestones.length} more…
                </li>
              ) : null}
            </ul>
          </div>
        ) : null}
      </CardPanel>

      <CardFooter className="relative z-10 flex min-h-11 items-center justify-between gap-1.5 border-t px-3 py-2">
        {card.contractors.length > 0 ? (
          <fieldset
            aria-label="Assigned contractors"
            className="m-0 flex min-w-0 items-center -space-x-1.5 border-0 p-0"
          >
            {card.contractors.slice(0, 3).map((c) => (
              <span
                aria-label={c.name}
                className="grid size-5 place-items-center rounded-full border border-card bg-primary/30 font-semibold text-[9px]"
                key={`${card.milestoneKey}-${c.name}`}
                role="img"
                title={c.name}
              >
                {c.initials}
              </span>
            ))}
            {card.contractors.length > 3 ? (
              <span className="grid size-5 place-items-center rounded-full border border-card bg-muted text-[9px] text-muted-foreground">
                +{card.contractors.length - 3}
              </span>
            ) : null}
          </fieldset>
        ) : onAssign ? null : (
          <span className="text-[10px] text-muted-foreground">Unassigned</span>
        )}
        <div className="ml-auto flex min-w-0 items-center justify-end gap-1.5 text-[10px] text-muted-foreground">
          {onAssign ? (
            <Button
              aria-label={`Assign contractor to ${card.name}`}
              data-testid={`kanban-card-assign-contractor-${card.milestoneKey}`}
              onClick={(event) => {
                event.stopPropagation();
                onAssign();
              }}
              size="xs"
              type="button"
              variant="outline"
            >
              Assign
            </Button>
          ) : null}
          {onStart ? (
            <Button
              data-testid={`kanban-card-start-work-${card.milestoneKey}`}
              onClick={(event) => {
                event.stopPropagation();
                onStart();
              }}
              size="xs"
              type="button"
              variant="outline"
            >
              Start
            </Button>
          ) : null}
          {card.requiresSiteVisit ? (
            <Badge
              className="px-1"
              size="sm"
              title="Field review required"
              variant="info"
            >
              <MapPin className="size-2.5" />
              <span className="sr-only">
                {viewerRole === "lender" ? "Field review" : "Visit"}
              </span>
            </Badge>
          ) : null}
          {card.forecastEndDate ? (
            <span className="inline-flex shrink-0 items-center gap-0.5 whitespace-nowrap">
              <CalendarDays className="size-2.5" />
              {daysUntil(card.forecastEndDate)}
            </span>
          ) : null}
        </div>
      </CardFooter>
    </Card>
  );
}

function CompactFact({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="truncate font-medium text-foreground tabular-nums">
        {value}
      </dd>
    </div>
  );
}

function SubmilestoneIcon({
  status,
}: {
  status: KanbanSubmilestone["status"];
}) {
  if (status === "done") {
    return (
      <CheckCircle2
        aria-label="Done"
        className="size-3 shrink-0 text-emerald-400"
      />
    );
  }
  if (status === "in_progress") {
    return (
      <Loader2
        aria-label="In progress"
        className="size-3 shrink-0 animate-spin text-sky-400"
      />
    );
  }
  return (
    <Circle
      aria-label="Todo"
      className="size-3 shrink-0 text-muted-foreground"
    />
  );
}

function daysUntil(iso: string): string {
  const target = Date.parse(iso);
  if (Number.isNaN(target)) {
    return "";
  }
  const diffDays = Math.round((target - Date.now()) / 86_400_000);
  if (diffDays === 0) {
    return "today";
  }
  if (diffDays > 0) {
    return `${diffDays}d left`;
  }
  return `${Math.abs(diffDays)}d late`;
}
