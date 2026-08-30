"use client";

import { ChevronLeft, ChevronRight, MoreVertical } from "lucide-react";
import {
  type ReactNode,
  type PointerEvent as ReactPointerEvent,
  useCallback,
  useMemo,
  useRef,
  useState,
} from "react";

import type {
  TimelineItem,
  TimelineRange,
} from "#/components/roadmap/AnimatedCurvedTimeline.tsx";
import { Badge } from "#/components/ui/badge.tsx";
import { Button } from "#/components/ui/button.tsx";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "#/components/ui/menu.tsx";
import { cn } from "#/lib/utils.ts";
import { IsometricMilestoneIcon } from "./-MilestoneCard.tsx";
import type { DemoDraw, DemoMilestone } from "./-timeline-share-snapshot.ts";
import type {
  MilestoneFeedRowState,
  MobileTimelineRole,
  PrimaryAction,
} from "./MobileTimelineWorkspaceContracts.ts";
import {
  DRAW_STATE_COPY,
  DRAW_STATE_TONE,
  deriveMilestoneRowState,
  mobileDrawState,
  money,
} from "./MobileTimelineWorkspaceContracts.ts";

// ---------------------------------------------------------------------------
// Level 0 — Sticky minimap (read-only spatial overview)
// ---------------------------------------------------------------------------

export interface TimelineMinimapProps {
  collapsed?: boolean;
  currentDay: number;
  draws: DemoDraw[];
  items: TimelineItem<DemoMilestone>[];
  onJumpToMilestone: (itemId: string) => void;
  onOpenDraw: (drawId: string) => void;
  range: Required<TimelineRange>;
  shortfallDays?: number[];
}

export function TimelineMinimap({
  collapsed = false,
  currentDay,
  draws,
  items,
  onJumpToMilestone,
  onOpenDraw,
  range,
  shortfallDays = [],
}: TimelineMinimapProps) {
  const span = Math.max(1, range.max - range.min);
  const toPct = useCallback(
    (value: number) =>
      `${Math.min(100, Math.max(0, ((value - range.min) / span) * 100))}%`,
    [range.min, span]
  );

  return (
    <div
      className="border-border border-b bg-background/95 px-3 pt-2 pb-3 backdrop-blur"
      data-testid="timeline-minimap"
    >
      <div className="mb-1 flex items-center justify-between">
        <span className="font-medium text-[10px] text-muted-foreground uppercase tracking-wide">
          Plan overview
        </span>
        <span className="text-[10px] text-muted-foreground tabular-nums">
          Day {Math.round(currentDay)}
        </span>
      </div>
      <div
        className={cn(
          "relative w-full rounded-md bg-muted/50",
          collapsed ? "h-6" : "h-12"
        )}
      >
        {/* current-day marker */}
        <div
          className="absolute top-0 bottom-0 z-10 w-0.5 bg-primary"
          data-testid="timeline-minimap-current-day"
          style={{ left: toPct(currentDay) }}
        />
        {/* milestone ticks (tap-to-jump) */}
        {items
          .filter((item) => item.data)
          .map((item) => {
            const startX = Math.round(item.x);
            return (
              <button
                aria-label={`Jump to ${item.data?.name ?? "milestone"}`}
                className="absolute top-1 bottom-1 z-20 w-3 -translate-x-1/2 rounded-sm bg-foreground/70 active:bg-primary"
                data-testid={`timeline-minimap-milestone-${item.id}`}
                key={item.id}
                onClick={() => onJumpToMilestone(item.id)}
                style={{ left: toPct(startX) }}
                type="button"
              />
            );
          })}
        {/* draw dots (tap-to-open) */}
        {!collapsed &&
          draws.map((draw) => {
            const state = mobileDrawState(draw, currentDay);
            return (
              <button
                aria-label={`Open ${draw.label}`}
                className={cn(
                  "absolute top-1/2 z-30 size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full ring-1 ring-background",
                  state === "happened" && "bg-emerald-500",
                  state === "requested" && "bg-amber-500",
                  state === "rejected" && "bg-destructive",
                  state === "planned" && "bg-sky-500"
                )}
                data-testid={`timeline-minimap-draw-${draw.id}`}
                key={draw.id}
                onClick={() => onOpenDraw(draw.id)}
                style={{ left: toPct(draw.x) }}
                type="button"
              />
            );
          })}
        {/* capital-shortfall sparkline markers */}
        {!collapsed &&
          shortfallDays.map((day) => (
            <div
              className="absolute bottom-0 z-10 h-2 w-0.5 -translate-x-1/2 bg-destructive"
              data-testid="timeline-minimap-shortfall"
              key={`shortfall-${day}`}
              style={{ left: toPct(day) }}
            />
          ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Level 1 — Milestone feed
// ---------------------------------------------------------------------------

const STATUS_TONE_CLASS: Record<MilestoneFeedRowState["statusTone"], string> = {
  active: "border-rose-200 bg-rose-50 text-rose-700",
  complete: "border-emerald-200 bg-emerald-50 text-emerald-700",
  ready: "border-zinc-200 bg-zinc-50 text-zinc-600",
  upcoming: "border-zinc-200 bg-zinc-50 text-zinc-500",
};

export interface MilestoneFeedRowProps {
  onOpenFocus: (itemId: string) => void;
  onPrimaryAction: (action: PrimaryAction, itemId: string) => void;
  onStructuralAction: (action: StructuralAction, itemId: string) => void;
  readOnly: boolean;
  registerRef: (itemId: string, el: HTMLElement | null) => void;
  rowState: MilestoneFeedRowState;
}

export type StructuralAction = "editDates" | "editBudget" | "deleteMilestone";

function MilestoneFeedRow({
  onOpenFocus,
  onPrimaryAction,
  onStructuralAction,
  readOnly,
  registerRef,
  rowState,
}: MilestoneFeedRowProps) {
  const { item } = rowState;
  const name = item.data?.name ?? "Milestone";
  return (
    <article
      className="rounded-lg border border-border bg-card p-4 shadow-sm"
      data-testid={`mobile-milestone-row-${item.id}`}
      ref={(el) => registerRef(item.id, el)}
    >
      <div className="flex items-start justify-between gap-3">
        <button
          className="flex min-w-0 flex-1 items-center gap-3 text-left"
          data-testid={`mobile-milestone-open-${item.id}`}
          onClick={() => onOpenFocus(item.id)}
          type="button"
        >
          {item.data?.icon ? (
            <span
              className="grid size-14 shrink-0 place-items-center overflow-hidden rounded-md bg-muted/55"
              data-testid={`mobile-milestone-icon-${item.id}`}
            >
              <IsometricMilestoneIcon
                className="size-14"
                type={item.data.icon}
              />
            </span>
          ) : null}
          <span className="min-w-0 flex-1">
            <h3 className="truncate font-semibold text-base">{name}</h3>
            <p className="mt-0.5 text-muted-foreground text-xs tabular-nums">
              Day {rowState.startDay}–{rowState.endDay} ·{" "}
              {money(rowState.budget)}
            </p>
          </span>
        </button>
        <div className="flex shrink-0 items-center gap-1">
          <span
            className={cn(
              "rounded-full border px-2 py-0.5 font-medium text-[11px]",
              STATUS_TONE_CLASS[rowState.statusTone]
            )}
            data-testid={`mobile-milestone-status-${item.id}`}
          >
            {rowState.statusLabel}
          </span>
          <DropdownMenu>
            <DropdownMenuTrigger
              aria-label="Milestone actions"
              className="grid size-8 place-items-center rounded-md text-muted-foreground hover:bg-muted"
              data-testid={`mobile-milestone-menu-${item.id}`}
              render={<button type="button" />}
            >
              <MoreVertical className="size-4" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => onOpenFocus(item.id)}>
                Open details
              </DropdownMenuItem>
              {readOnly ? null : (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    data-testid={`mobile-milestone-edit-dates-${item.id}`}
                    onClick={() => onStructuralAction("editDates", item.id)}
                  >
                    Edit dates
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    data-testid={`mobile-milestone-edit-budget-${item.id}`}
                    onClick={() => onStructuralAction("editBudget", item.id)}
                  >
                    Edit budget
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    data-testid={`mobile-milestone-delete-${item.id}`}
                    onClick={() =>
                      onStructuralAction("deleteMilestone", item.id)
                    }
                    variant="destructive"
                  >
                    Delete milestone
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* inline state chips that used to be hover-only */}
      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        <Badge variant="outline">{rowState.evidenceLabel}</Badge>
        {rowState.evidenceCount > 0 ? (
          <Badge variant="secondary">{rowState.evidenceCount} files</Badge>
        ) : null}
        {rowState.draws.map(({ draw, state }) => (
          <Badge key={draw.id} variant={DRAW_STATE_TONE[state]}>
            {money(draw.amount)} · {DRAW_STATE_COPY[state]}
          </Badge>
        ))}
      </div>

      {rowState.blockingMilestoneNames.length > 0 ? (
        <p
          className="mt-2 text-amber-700 text-xs dark:text-amber-300"
          data-testid={`mobile-milestone-blocked-${item.id}`}
        >
          Blocked by {rowState.blockingMilestoneNames.join(", ")}
        </p>
      ) : null}

      {rowState.primaryAction && rowState.primaryAction.intent !== "open" ? (
        <Button
          className="mt-3 w-full"
          data-testid={`mobile-milestone-primary-${item.id}`}
          onClick={() =>
            rowState.primaryAction &&
            onPrimaryAction(rowState.primaryAction, item.id)
          }
          size="sm"
        >
          {rowState.primaryAction.label}
        </Button>
      ) : null}
    </article>
  );
}

export interface MilestoneFeedProps {
  currentDay: number;
  draws: DemoDraw[];
  financialsSlot?: ReactNode;
  items: TimelineItem<DemoMilestone>[];
  onOpenFocus: (itemId: string) => void;
  onPrimaryAction: (action: PrimaryAction, itemId: string) => void;
  onStructuralAction: (action: StructuralAction, itemId: string) => void;
  readOnly: boolean;
  registerRef: (itemId: string, el: HTMLElement | null) => void;
  reviewsSlot?: ReactNode;
  role: MobileTimelineRole;
}

export function MilestoneFeed({
  currentDay,
  draws,
  financialsSlot,
  items,
  onOpenFocus,
  onPrimaryAction,
  onStructuralAction,
  readOnly,
  registerRef,
  reviewsSlot,
  role,
}: MilestoneFeedProps) {
  const rows = useMemo(
    () =>
      items
        .filter((item) => item.data)
        .map((item) =>
          deriveMilestoneRowState({ currentDay, draws, item, items, role })
        ),
    [currentDay, draws, items, role]
  );

  return (
    <div className="grid gap-3 p-3" data-testid="mobile-milestone-feed">
      {financialsSlot ? (
        <CollapsibleSection
          defaultOpen={false}
          testId="mobile-financials-section"
          title="Financials"
        >
          {financialsSlot}
        </CollapsibleSection>
      ) : null}
      {reviewsSlot ? (
        <CollapsibleSection
          defaultOpen={false}
          testId="mobile-reviews-section"
          title="Requests & reviews"
        >
          {reviewsSlot}
        </CollapsibleSection>
      ) : null}
      {rows.map((rowState) => (
        <MilestoneFeedRow
          key={rowState.item.id}
          onOpenFocus={onOpenFocus}
          onPrimaryAction={onPrimaryAction}
          onStructuralAction={onStructuralAction}
          readOnly={readOnly}
          registerRef={registerRef}
          rowState={rowState}
        />
      ))}
    </div>
  );
}

function CollapsibleSection({
  children,
  defaultOpen,
  testId,
  title,
}: {
  children: ReactNode;
  defaultOpen: boolean;
  testId: string;
  title: string;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section
      className="rounded-lg border border-border bg-card shadow-sm"
      data-testid={testId}
    >
      <button
        aria-expanded={open}
        className="flex w-full items-center justify-between px-4 py-3 text-left font-semibold text-sm"
        onClick={() => setOpen((value) => !value)}
        type="button"
      >
        {title}
        <ChevronRight
          className={cn("size-4 transition-transform", open && "rotate-90")}
        />
      </button>
      {open ? <div className="px-4 pb-4">{children}</div> : null}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Level 2 — Focus mode (one milestone, swipe / prev-next to advance)
// ---------------------------------------------------------------------------

const SWIPE_THRESHOLD_PX = 56;

export interface MilestoneFocusViewProps {
  children: ReactNode;
  index: number;
  onClose: () => void;
  onNavigate: (nextIndex: number) => void;
  title: string;
  total: number;
}

export function MilestoneFocusView({
  children,
  index,
  onClose,
  onNavigate,
  title,
  total,
}: MilestoneFocusViewProps) {
  const startX = useRef<number | null>(null);
  const canPrev = index > 0;
  const canNext = index < total - 1;

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    startX.current = event.clientX;
  };
  const onPointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (startX.current === null) {
      return;
    }
    const delta = event.clientX - startX.current;
    startX.current = null;
    if (delta <= -SWIPE_THRESHOLD_PX && canNext) {
      onNavigate(index + 1);
    } else if (delta >= SWIPE_THRESHOLD_PX && canPrev) {
      onNavigate(index - 1);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-background"
      data-testid="mobile-focus-view"
    >
      <header className="flex items-center gap-2 border-border border-b px-3 py-2">
        <Button
          aria-label="Back to feed"
          data-testid="mobile-focus-close"
          onClick={onClose}
          size="sm"
          variant="ghost"
        >
          Done
        </Button>
        <div className="flex flex-1 items-center justify-center gap-2">
          <Button
            aria-label="Previous milestone"
            data-testid="mobile-focus-prev"
            disabled={!canPrev}
            onClick={() => onNavigate(index - 1)}
            size="icon"
            variant="ghost"
          >
            <ChevronLeft className="size-4" />
          </Button>
          <span className="text-muted-foreground text-xs tabular-nums">
            {index + 1} / {total}
          </span>
          <Button
            aria-label="Next milestone"
            data-testid="mobile-focus-next"
            disabled={!canNext}
            onClick={() => onNavigate(index + 1)}
            size="icon"
            variant="ghost"
          >
            <ChevronRight className="size-4" />
          </Button>
        </div>
        <span className="w-12" />
      </header>
      <div
        className="min-h-0 flex-1 overflow-y-auto px-4 py-4"
        data-testid="mobile-focus-scroll"
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
      >
        <h2 className="mb-3 font-semibold text-lg">{title}</h2>
        {children}
      </div>
    </div>
  );
}
