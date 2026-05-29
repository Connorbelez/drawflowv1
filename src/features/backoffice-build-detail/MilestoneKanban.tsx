"use client";

import { CalendarDays, CheckCircle2, Circle, Loader2, MapPin } from "lucide-react";
import type { ReactNode } from "react";
import { formatCents, formatDate } from "./format";

export type KanbanColumn =
  | "Backlog"
  | "InProgress"
  | "MarkedComplete"
  | "SiteVisit"
  | "NeedsApproval";

export interface KanbanSubmilestone {
  key: string;
  name: string;
  status: "todo" | "in_progress" | "done";
  order: number;
  budgetCents?: number;
  durationDays?: number;
}

export interface KanbanCardData {
  milestoneKey: string;
  milestoneId: string;
  name: string;
  code: string;
  type: string;
  status: string;
  column: KanbanColumn;
  drawGroupKey: string;
  approvedValueCents: number;
  requestedAmountCents?: number;
  progressPercent: number;
  forecastStartDate?: string;
  forecastEndDate?: string;
  submittedAt?: number;
  requiresSiteVisit: boolean;
  evidenceReviewStatus?: string;
  contractors: { name: string; initials: string }[];
  submilestones: KanbanSubmilestone[];
}

const COLUMNS: { key: KanbanColumn; label: string; accent: string }[] = [
  { key: "Backlog", label: "Backlog", accent: "border-l-muted" },
  { key: "InProgress", label: "In Progress", accent: "border-l-sky-500/60" },
  {
    key: "MarkedComplete",
    label: "Marked Complete",
    accent: "border-l-emerald-500/60",
  },
  { key: "SiteVisit", label: "Site Visit", accent: "border-l-violet-500/60" },
  {
    key: "NeedsApproval",
    label: "Needs Approval",
    accent: "border-l-amber-500/60",
  },
];

const STATUS_TONE: Record<
  string,
  { label: string; className: string }
> = {
  completion_approved: {
    label: "Approved",
    className: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  },
  in_progress_on_schedule: {
    label: "On schedule",
    className: "bg-sky-500/15 text-sky-300 border-sky-500/30",
  },
  ready_to_start: {
    label: "Ready",
    className: "bg-sky-500/15 text-sky-300 border-sky-500/30",
  },
  in_progress_behind_schedule: {
    label: "Behind",
    className: "bg-amber-500/15 text-amber-300 border-amber-500/30",
  },
  blocked: {
    label: "Blocked",
    className: "bg-destructive/20 text-destructive border-destructive/40",
  },
  review: {
    label: "Review",
    className: "bg-amber-500/15 text-amber-300 border-amber-500/30",
  },
  planned: {
    label: "Planned",
    className: "bg-muted/40 text-muted-foreground border-border",
  },
};

interface MilestoneKanbanProps {
  cards: KanbanCardData[];
  onCardClick: (card: KanbanCardData) => void;
  showCompleted?: boolean;
  onToggleShowCompleted?: () => void;
}

export function MilestoneKanban({
  cards,
  onCardClick,
  showCompleted = false,
  onToggleShowCompleted,
}: MilestoneKanbanProps): ReactNode {
  const visibleCards = showCompleted
    ? cards
    : cards.filter(
        (c) => c.column !== "MarkedComplete" && c.status !== "completion_approved",
      );
  const byColumn = new Map<KanbanColumn, KanbanCardData[]>();
  for (const card of visibleCards) {
    const arr = byColumn.get(card.column) ?? [];
    arr.push(card);
    byColumn.set(card.column, arr);
  }
  return (
    <section
      className="rounded-xl border border-border bg-card p-4"
      data-ixc-ref="UI-KANBAN"
      data-testid="build-detail-kanban"
      id="kanban"
    >
      <header className="mb-3 flex items-center justify-between">
        <div>
          <h3 className="font-semibold text-sm">Milestone Kanban</h3>
          <p className="text-[11px] text-muted-foreground">
            Read-only projection · drag locked · click a card for full detail
          </p>
        </div>
        <label className="flex items-center gap-2 text-muted-foreground text-xs">
          <span>Show completed</span>
          <button
            aria-pressed={showCompleted}
            className="rounded-md border border-border bg-card px-2 py-1 text-xs"
            data-testid="kanban-toggle-show-completed"
            onClick={onToggleShowCompleted}
            type="button"
          >
            {showCompleted ? "On" : "Off"}
          </button>
        </label>
      </header>
      <div className="grid grid-cols-5 gap-3 rounded-lg border border-border bg-background/30 p-3">
        {COLUMNS.map((col) => {
          const list = byColumn.get(col.key) ?? [];
          return (
            <div
              className="flex flex-col gap-2"
              data-column={col.key}
              data-testid={`kanban-col-${col.key}`}
              key={col.key}
            >
              <h4 className="flex items-center justify-between px-1 text-[11px] text-muted-foreground uppercase tracking-wider">
                <span>{col.label}</span>
                <span className="rounded-full bg-card px-1.5 py-0.5 text-[10px] text-foreground">
                  {list.length}
                </span>
              </h4>
              <div className="flex flex-col gap-2">
                {list.length === 0 ? (
                  <p className="rounded-md border border-dashed border-border p-3 text-[11px] text-muted-foreground">
                    No milestones in this column.
                  </p>
                ) : null}
                {list.map((card) => (
                  <MilestoneCard
                    card={card}
                    columnAccent={col.accent}
                    key={card.milestoneId}
                    onClick={() => onCardClick(card)}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function MilestoneCard({
  card,
  columnAccent,
  onClick,
}: {
  card: KanbanCardData;
  columnAccent: string;
  onClick: () => void;
}) {
  const tone = STATUS_TONE[card.status];
  const submilestoneDone = card.submilestones.filter((s) => s.status === "done").length;
  const submilestoneInProg = card.submilestones.filter((s) => s.status === "in_progress").length;
  const submilestoneTotal = card.submilestones.length;
  const previewSubmilestones = card.submilestones.slice(0, 3);
  return (
    <button
      aria-controls="milestone-detail-sheet"
      aria-haspopup="dialog"
      className={`group relative w-full overflow-hidden rounded-lg border border-border ${columnAccent} border-l-4 bg-card p-3 text-left shadow-sm transition hover:border-foreground/30 hover:bg-accent focus-visible:outline-2 focus-visible:outline-primary`}
      data-milestone-key={card.milestoneKey}
      data-testid={`kanban-card-${card.milestoneKey}`}
      onClick={onClick}
      type="button"
    >
      <header className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
            {card.code} · {card.drawGroupKey.toUpperCase()}
          </p>
          <p className="truncate font-semibold text-xs text-foreground">
            {card.name}
          </p>
        </div>
        {tone ? (
          <span
            className={`shrink-0 rounded-full border px-1.5 py-0.5 text-[9px] uppercase tracking-wide ${tone.className}`}
          >
            {tone.label}
          </span>
        ) : null}
      </header>

      <div className="mt-2 flex items-center gap-2">
        <div
          aria-hidden
          className="relative h-1 flex-1 overflow-hidden rounded-full bg-muted"
        >
          <span
            className="absolute inset-y-0 left-0 bg-primary"
            style={{ width: `${Math.min(100, card.progressPercent)}%` }}
          />
        </div>
        <span className="tabular-nums text-[10px] text-muted-foreground">
          {card.progressPercent}%
        </span>
      </div>

      <dl className="mt-2 grid grid-cols-2 gap-x-2 gap-y-1 text-[10px]">
        <dt className="text-muted-foreground">Budget</dt>
        <dd className="text-right font-medium tabular-nums text-foreground">
          {formatCents(card.approvedValueCents, { compact: true })}
        </dd>
        <dt className="text-muted-foreground">Start</dt>
        <dd className="text-right tabular-nums">
          {card.forecastStartDate ? formatDate(card.forecastStartDate) : "—"}
        </dd>
        <dt className="text-muted-foreground">End</dt>
        <dd className="text-right tabular-nums">
          {card.forecastEndDate ? formatDate(card.forecastEndDate) : "—"}
        </dd>
        {card.requestedAmountCents ? (
          <>
            <dt className="text-muted-foreground">Requested</dt>
            <dd className="text-right font-medium tabular-nums">
              {formatCents(card.requestedAmountCents, { compact: true })}
            </dd>
          </>
        ) : null}
      </dl>

      {submilestoneTotal > 0 ? (
        <div className="mt-2 rounded-md border border-border bg-background/40 p-2">
          <div className="flex items-center justify-between text-[10px] text-muted-foreground">
            <span>Sub-milestones</span>
            <span className="tabular-nums">
              {submilestoneDone}/{submilestoneTotal} done
              {submilestoneInProg > 0 ? ` · ${submilestoneInProg} active` : ""}
            </span>
          </div>
          <ul className="mt-1 space-y-0.5">
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

      <footer className="mt-2 flex items-center justify-between gap-2">
        {card.contractors.length > 0 ? (
          <div
            aria-label="Assigned contractors"
            className="flex items-center -space-x-1.5"
          >
            {card.contractors.slice(0, 3).map((c) => (
              <span
                aria-label={c.name}
                className="grid size-5 place-items-center rounded-full border border-card bg-primary/30 text-[9px] font-semibold"
                key={`${card.milestoneKey}-${c.name}`}
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
          </div>
        ) : (
          <span className="text-[10px] text-muted-foreground">
            Unassigned
          </span>
        )}
        <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
          {card.requiresSiteVisit ? (
            <span
              className="inline-flex items-center gap-0.5 rounded-full bg-violet-500/15 px-1.5 py-0.5 text-violet-300"
              title="Site visit required"
            >
              <MapPin className="size-2.5" />
              Visit
            </span>
          ) : null}
          {card.forecastEndDate ? (
            <span className="inline-flex items-center gap-0.5">
              <CalendarDays className="size-2.5" />
              {daysUntil(card.forecastEndDate)}
            </span>
          ) : null}
        </div>
      </footer>
    </button>
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
  if (Number.isNaN(target)) return "";
  const diffDays = Math.round((target - Date.now()) / 86_400_000);
  if (diffDays === 0) return "today";
  if (diffDays > 0) return `in ${diffDays}d`;
  return `${Math.abs(diffDays)}d ago`;
}
