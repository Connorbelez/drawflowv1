import { Check } from "lucide-react";
import {
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import type { DateRange, Modifiers } from "react-day-picker";

import { Button } from "#/components/ui/button.tsx";
import { Calendar } from "#/components/ui/calendar.tsx";
import {
  Popover,
  PopoverClose,
  PopoverPopup,
  PopoverTrigger,
} from "#/components/ui/popover.tsx";
import {
  dateFromProposalDayOffset,
  dayOffsetFromProposalDate,
  isoDateFromLocalDate,
  localDateFromIsoDate,
} from "#/features/production-proposals/proposalScheduleDates.ts";
import { cn } from "#/lib/utils.ts";

export type ScheduleWindowNode = "end" | "start";

export interface ScheduleWindowValue {
  durationDays: number;
  startDay: number;
}

const DAY_CELL_SELECTOR = "[data-day]";

/**
 * Pure window-move primitive shared by click and drag interactions. Window end
 * dates use exclusive-end semantics (`end = startDay + durationDays`), matching
 * the "Day X to Y" window labels across the worksheet and packet tables. Moving
 * a node keeps the opposite node pinned: the window stretches or shrinks rather
 * than shifting. The moved node is clamped so it can never cross the pinned
 * node, preserving a minimum one-day window, and `minDayOffset` (when given)
 * clamps how far either node can travel before the schedule origin.
 */
export function moveScheduleWindowNode(
  value: ScheduleWindowValue,
  node: ScheduleWindowNode,
  targetIsoDate: string,
  proposedStartDate: string,
  { minDayOffset }: { minDayOffset?: number } = {}
): ScheduleWindowValue {
  const startDay = Math.round(value.startDay);
  const durationDays = Math.max(1, Math.round(value.durationDays));
  const exclusiveEndDay = startDay + durationDays;
  const clampedTargetDay = Math.max(
    minDayOffset ?? Number.NEGATIVE_INFINITY,
    dayOffsetFromProposalDate(proposedStartDate, targetIsoDate)
  );

  if (node === "start") {
    const nextStartDay = Math.min(clampedTargetDay, exclusiveEndDay - 1);
    return {
      durationDays: exclusiveEndDay - nextStartDay,
      startDay: nextStartDay,
    };
  }

  const nextExclusiveEndDay = Math.max(clampedTargetDay, startDay + 1);
  return {
    durationDays: nextExclusiveEndDay - startDay,
    startDay,
  };
}

function dayCellFromEventTarget(target: EventTarget | null) {
  return target instanceof Element ? target.closest(DAY_CELL_SELECTOR) : null;
}

function nodeForDayCell(
  cell: Element,
  fallback: ScheduleWindowNode
): ScheduleWindowNode | null {
  const isStart = cell.classList.contains("range-start");
  const isEnd = cell.classList.contains("range-end");
  if (isStart && isEnd) {
    return fallback;
  }
  if (isStart) {
    return "start";
  }
  if (isEnd) {
    return "end";
  }
  return null;
}

function formatNodeDate(isoDate: string) {
  return localDateFromIsoDate(isoDate).toLocaleDateString("default", {
    day: "numeric",
    month: "short",
  });
}

/**
 * Click-to-open range editor for a milestone/sub-milestone schedule window.
 * Exactly one range node (start or end) is armed at a time; clicking or
 * dragging to another date moves only the armed node, so it is always clear
 * which edge of the window is being edited.
 */
export function ScheduleWindowPicker({
  durationDays,
  label,
  minDayOffset,
  onCommit,
  onWindowChange,
  proposedStartDate,
  startDay,
  testId,
  trigger,
  triggerClassName,
}: {
  durationDays: number;
  label: string;
  minDayOffset?: number;
  onCommit: () => void;
  onWindowChange: (next: ScheduleWindowValue) => void;
  proposedStartDate: string;
  startDay: number;
  testId?: string;
  trigger: ReactNode;
  triggerClassName?: string;
}) {
  const [open, setOpen] = useState(false);
  const [armedNode, setArmedNode] = useState<ScheduleWindowNode>("start");
  const dragNodeRef = useRef<ScheduleWindowNode | null>(null);
  const calendarRef = useRef<HTMLDivElement | null>(null);

  const value: ScheduleWindowValue = { durationDays, startDay };
  const startIsoDate = dateFromProposalDayOffset(proposedStartDate, startDay);
  const endIsoDate = dateFromProposalDayOffset(
    proposedStartDate,
    Math.round(startDay) + Math.max(1, Math.round(durationDays))
  );
  const selectedRange: DateRange = {
    from: localDateFromIsoDate(startIsoDate),
    to: localDateFromIsoDate(endIsoDate),
  };

  const moveNode = (node: ScheduleWindowNode, isoDate: string) => {
    const next = moveScheduleWindowNode(
      value,
      node,
      isoDate,
      proposedStartDate,
      { minDayOffset }
    );
    if (
      next.startDay !== Math.round(value.startDay) ||
      next.durationDays !== Math.max(1, Math.round(value.durationDays))
    ) {
      onWindowChange(next);
    }
  };
  const moveNodeRef = useRef(moveNode);
  moveNodeRef.current = moveNode;

  const endDrag = useCallback(() => {
    dragNodeRef.current = null;
  }, []);

  const handleDragMove = useCallback((event: PointerEvent) => {
    const node = dragNodeRef.current;
    if (!node) {
      return;
    }
    const element =
      typeof document.elementFromPoint === "function"
        ? document.elementFromPoint(event.clientX, event.clientY)
        : null;
    const cell = dayCellFromEventTarget(element);
    const isoDate = cell?.getAttribute("data-day");
    if (isoDate) {
      moveNodeRef.current(node, isoDate);
    }
  }, []);

  useEffect(() => {
    window.addEventListener("pointermove", handleDragMove);
    window.addEventListener("pointerup", endDrag);
    window.addEventListener("pointercancel", endDrag);
    return () => {
      window.removeEventListener("pointermove", handleDragMove);
      window.removeEventListener("pointerup", endDrag);
      window.removeEventListener("pointercancel", endDrag);
    };
  }, [endDrag, handleDragMove]);

  const handleCalendarPointerDown = (event: ReactPointerEvent) => {
    const cell = dayCellFromEventTarget(event.target);
    if (!cell) {
      return;
    }
    const node = nodeForDayCell(cell, armedNode);
    if (!node) {
      return;
    }
    setArmedNode(node);
    dragNodeRef.current = node;
    // Keep focus/text-selection stable while the node is being dragged.
    event.preventDefault();
  };

  const handleDayClick = (day: Date, modifiers: Modifiers) => {
    const isoDate = isoDateFromLocalDate(day);
    if (modifiers.range_start && !modifiers.range_end) {
      setArmedNode("start");
      return;
    }
    if (modifiers.range_end && !modifiers.range_start) {
      setArmedNode("end");
      return;
    }
    moveNode(armedNode, isoDate);
  };

  const handleOpenChange = (nextOpen: boolean) => {
    setOpen(nextOpen);
    if (nextOpen) {
      setArmedNode("start");
    } else {
      dragNodeRef.current = null;
      onCommit();
    }
  };

  return (
    <Popover onOpenChange={handleOpenChange} open={open}>
      <PopoverTrigger
        aria-haspopup="dialog"
        aria-label={`${label} schedule window, edit start and end dates`}
        className={triggerClassName}
        data-testid={testId}
        type="button"
      >
        {trigger}
      </PopoverTrigger>
      <PopoverPopup align="start" className="w-fit" sideOffset={8}>
        <div className="flex w-fit flex-col gap-2 p-1">
          <fieldset className="m-0 flex min-w-0 items-center gap-1.5 border-0 p-0">
            <legend className="sr-only">
              Choose which window edge to edit
            </legend>
            {(["start", "end"] as const).map((node) => {
              const isoDate = node === "start" ? startIsoDate : endIsoDate;
              const isArmed = armedNode === node;
              return (
                <button
                  aria-pressed={isArmed}
                  className={cn(
                    "flex flex-1 flex-col items-start gap-0.5 rounded-lg border px-2.5 py-1.5 text-left transition-colors",
                    isArmed
                      ? "border-primary bg-primary/10 text-foreground"
                      : "border-border bg-background text-muted-foreground hover:bg-accent"
                  )}
                  data-armed={isArmed || undefined}
                  data-testid={testId ? `${testId}-${node}-node` : undefined}
                  key={node}
                  onClick={() => setArmedNode(node)}
                  type="button"
                >
                  <span className="font-medium text-[11px] uppercase tracking-wide">
                    {node}
                  </span>
                  <span className="font-semibold text-sm tabular-nums">
                    {formatNodeDate(isoDate)}
                  </span>
                </button>
              );
            })}
          </fieldset>
          <p className="px-1 text-muted-foreground text-xs">
            {armedNode === "start" ? "Start" : "End"} node selected — click or
            drag to a new date to move only that edge.
          </p>
          <div
            className="touch-none select-none"
            data-armed-node={armedNode}
            onPointerDown={handleCalendarPointerDown}
            ref={calendarRef}
          >
            <Calendar
              defaultMonth={selectedRange.from}
              mode="range"
              onDayClick={handleDayClick}
              onSelect={() => undefined}
              selected={selectedRange}
            />
          </div>
          <div className="flex items-center justify-between gap-2 px-1 pb-1">
            <span className="text-muted-foreground text-xs tabular-nums">
              {Math.max(1, Math.round(durationDays))}d window
            </span>
            <PopoverClose
              render={
                <Button size="sm" type="button" variant="outline">
                  <Check aria-hidden="true" />
                  Done
                </Button>
              }
            />
          </div>
        </div>
      </PopoverPopup>
    </Popover>
  );
}
