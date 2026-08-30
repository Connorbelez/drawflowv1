"use client";

import {
  AlertTriangle,
  Banknote,
  ChevronLeft,
  ChevronRight,
  CircleDollarSign,
  Hammer,
  Landmark,
  Plus,
} from "lucide-react";
import {
  type CSSProperties,
  useCallback,
  useEffect,
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
import { Card } from "#/components/ui/card.tsx";
import { Frame, FramePanel } from "#/components/ui/frame.tsx";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "#/components/ui/menu.tsx";
import {
  WheelPicker,
  type WheelPickerOption,
  WheelPickerWrapper,
} from "#/components/wheel-picker.tsx";
import { cn } from "#/lib/utils.ts";
import { IsometricMilestoneIcon } from "./-MilestoneCard.tsx";
import type {
  DemoCapitalSpike,
  DemoDraw,
  DemoMilestone,
  IsometricIconKey,
} from "./-timeline-share-snapshot.ts";
import type {
  MobileDayTimelineEvent,
  MobileDayTimelineEventKind,
  MobileStickyTimelineRail,
} from "./MobileTimelineWorkspaceContracts.ts";
import {
  deriveMobileStickyTimelineRail,
  inferIsometricIconKeyFromText,
  MOBILE_DAY_WHEEL_ACTIVE_INSET,
  MOBILE_DAY_WHEEL_HEIGHT_PX,
  MOBILE_DAY_WHEEL_OPTION_ITEM_HEIGHT,
  MOBILE_DAY_WHEEL_VISIBLE_COUNT,
  MOBILE_EVENT_ID_PREFIX_RE,
  money,
  resolveIsometricIconKey,
  WHEEL_MATRIX_3D_RE,
  WHEEL_MATRIX_RE,
  WHEEL_TRANSLATE_Y_RE,
} from "./MobileTimelineWorkspaceContracts.ts";

// ---------------------------------------------------------------------------
// Phone day dial — touch-native day selection + active event rail
// ---------------------------------------------------------------------------

export interface MobileTimelineDayDialWorkspaceProps {
  capitalSpikes: DemoCapitalSpike[];
  currentDay: number;
  draws: DemoDraw[];
  insertMenu?: MobileTimelineInsertMenuConfig;
  items: TimelineItem<DemoMilestone>[];
  onDayChange: (day: number) => void;
  onOpenCapitalEvent: (capitalSpikeId: string) => void;
  onOpenDraw: (drawId: string) => void;
  onOpenMilestone: (itemId: string) => void;
  range: Required<TimelineRange>;
  selectedDay?: number;
}

export interface MobileTimelineInsertMenuConfig {
  milestoneLabel?: string;
  onAddCapitalSpike?: (day: number) => void;
  onAddCashInfusion?: (day: number) => void;
  onAddDraw?: (day: number) => void;
  onAddMilestone?: (day: number) => void;
}

export function MobileTimelineDayDialWorkspace({
  capitalSpikes,
  currentDay,
  draws,
  insertMenu,
  items,
  onDayChange,
  onOpenCapitalEvent,
  onOpenDraw,
  onOpenMilestone,
  range,
  selectedDay: selectedDayInput,
}: MobileTimelineDayDialWorkspaceProps) {
  const selectedDay = selectedDayInput ?? currentDay;
  const [dialSide, setDialSide] = useState<"left" | "right">("right");
  const dialOnRight = dialSide === "right";
  const hasInsertActions = Boolean(
    insertMenu?.onAddMilestone ||
      insertMenu?.onAddDraw ||
      insertMenu?.onAddCapitalSpike ||
      insertMenu?.onAddCashInfusion
  );
  const rail = useMemo(
    () =>
      deriveMobileStickyTimelineRail({
        capitalSpikes,
        currentDay,
        draws,
        items,
        selectedDay,
      }),
    [capitalSpikes, currentDay, draws, items, selectedDay]
  );

  return (
    <Frame className="mx-0" data-testid="mobile-timeline-workspace">
      <FramePanel className="overflow-hidden p-0">
        <div className="border-b px-2 py-3 sm:px-4">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <h2 className="font-semibold text-sm">Draw status</h2>
              <p className="text-muted-foreground text-xs">
                Actual day D{Math.round(currentDay)} stays fixed while you
                inspect the plan.
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <MobileDialSideToggle onChange={setDialSide} side={dialSide} />
              <div
                className="min-w-[5rem] rounded-lg border bg-muted/45 px-2.5 py-1 text-right"
                data-testid="mobile-selected-day"
              >
                <span className="block whitespace-nowrap text-[9px] text-muted-foreground uppercase">
                  Viewing
                </span>
                <strong className="font-semibold text-sm tabular-nums">
                  D{Math.round(selectedDay)}
                </strong>
              </div>
              {hasInsertActions ? (
                <MobileTimelineInsertMenu
                  day={Math.round(selectedDay)}
                  menu={insertMenu}
                />
              ) : null}
            </div>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground">
            <MobileLegendDot className="bg-success" label="Happened" />
            <MobileLegendDot className="bg-warning" label="Requested" />
            <MobileLegendDot className="bg-info" label="Planned" />
            <MobileLegendDot className="bg-destructive" label="Rejected" />
          </div>
        </div>
        <div
          className={cn(
            "grid min-h-[22rem] gap-0 px-0 py-4",
            dialOnRight
              ? "grid-cols-[minmax(0,1fr)_3.5rem] sm:grid-cols-[minmax(0,1fr)_3.75rem]"
              : "grid-cols-[3.5rem_minmax(0,1fr)] sm:grid-cols-[3.75rem_minmax(0,1fr)]"
          )}
          data-dial-side={dialSide}
          data-testid="mobile-day-layout"
        >
          {dialOnRight ? (
            <>
              <MobileDayEventRail
                onOpenCapitalEvent={onOpenCapitalEvent}
                onOpenDraw={onOpenDraw}
                onOpenMilestone={onOpenMilestone}
                rail={rail}
                side="left"
              />
              <MobileDayDial
                currentDay={selectedDay}
                onDayChange={onDayChange}
                range={range}
                side="right"
              />
            </>
          ) : (
            <>
              <MobileDayDial
                currentDay={selectedDay}
                onDayChange={onDayChange}
                range={range}
                side="left"
              />
              <MobileDayEventRail
                onOpenCapitalEvent={onOpenCapitalEvent}
                onOpenDraw={onOpenDraw}
                onOpenMilestone={onOpenMilestone}
                rail={rail}
                side="right"
              />
            </>
          )}
        </div>
      </FramePanel>
    </Frame>
  );
}

function MobileDialSideToggle({
  onChange,
  side,
}: {
  onChange: (side: "left" | "right") => void;
  side: "left" | "right";
}) {
  return (
    <fieldset
      aria-label="Day dial side"
      className="m-0 grid grid-cols-2 rounded-lg border bg-muted/35 p-0.5"
      data-testid="mobile-dial-side-toggle"
    >
      <button
        aria-label="Show day dial on left"
        aria-pressed={side === "left"}
        className={cn(
          "grid h-9 w-9 place-items-center rounded-md text-muted-foreground transition-colors",
          side === "left" && "bg-background text-foreground shadow-sm"
        )}
        data-testid="mobile-dial-side-left"
        onClick={() => onChange("left")}
        type="button"
      >
        <ChevronLeft className="size-4" />
      </button>
      <button
        aria-label="Show day dial on right"
        aria-pressed={side === "right"}
        className={cn(
          "grid h-9 w-9 place-items-center rounded-md text-muted-foreground transition-colors",
          side === "right" && "bg-background text-foreground shadow-sm"
        )}
        data-testid="mobile-dial-side-right"
        onClick={() => onChange("right")}
        type="button"
      >
        <ChevronRight className="size-4" />
      </button>
    </fieldset>
  );
}

function MobileDayEventRail({
  onOpenCapitalEvent,
  onOpenDraw,
  onOpenMilestone,
  rail,
  side,
}: {
  onOpenCapitalEvent: (capitalSpikeId: string) => void;
  onOpenDraw: (drawId: string) => void;
  onOpenMilestone: (itemId: string) => void;
  rail: MobileStickyTimelineRail;
  side: "left" | "right";
}) {
  return (
    <div
      className={cn(
        "relative min-h-[20rem] overflow-hidden",
        side === "left" ? "pl-2" : "pr-2"
      )}
      data-testid="mobile-day-event-rail"
    >
      {rail.events.length > 0 ? (
        <div
          className={cn(
            "absolute grid gap-2 transition-transform duration-300 ease-out will-change-transform",
            side === "left" ? "right-0 left-2 mr-[7px]" : "right-2 left-0"
          )}
          data-active-index={rail.activeIndex}
          data-testid="mobile-day-event-stack"
          style={
            {
              "--mobile-event-rail-y": `${rail.translateY}px`,
              transform:
                "translateY(calc(10rem - 2.125rem + var(--mobile-event-rail-y)))",
            } as CSSProperties
          }
        >
          {rail.events.map((event, index) => (
            <MobileDayEventCard
              active={index === rail.activeIndex}
              event={event}
              key={event.id}
              onOpenCapitalEvent={onOpenCapitalEvent}
              onOpenDraw={onOpenDraw}
              onOpenMilestone={onOpenMilestone}
            />
          ))}
        </div>
      ) : (
        <Card className="p-4 text-sm">
          <p className="font-medium">No scheduled event on this day</p>
          <p className="mt-1 text-muted-foreground text-xs">
            Continue scrolling the dial to the next milestone or draw.
          </p>
        </Card>
      )}
    </div>
  );
}

function MobileTimelineInsertMenu({
  day,
  menu,
}: {
  day: number;
  menu: MobileTimelineInsertMenuConfig | undefined;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={`Insert timeline item at day ${day}`}
        data-testid="mobile-timeline-insert-menu"
        render={
          <Button
            className="h-11 w-11 shrink-0"
            size="icon"
            type="button"
            variant="outline"
          />
        }
      >
        <Plus className="size-4" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72">
        <div className="px-2 py-1.5">
          <p className="font-medium text-[10px] text-muted-foreground uppercase">
            Insert on roadmap
          </p>
          <p className="font-semibold text-sm">Day {day}</p>
        </div>
        {menu?.onAddMilestone ? (
          <DropdownMenuItem
            className="min-h-11 gap-3"
            data-testid="mobile-insert-milestone"
            onClick={() => menu.onAddMilestone?.(day)}
          >
            <Hammer className="size-4 text-amber-500" />
            {menu.milestoneLabel ?? "Add milestone"}
          </DropdownMenuItem>
        ) : null}
        {menu?.onAddMilestone &&
        (menu?.onAddDraw ||
          menu?.onAddCapitalSpike ||
          menu?.onAddCashInfusion) ? (
          <DropdownMenuSeparator />
        ) : null}
        {menu?.onAddDraw ? (
          <DropdownMenuItem
            className="min-h-11 gap-3"
            data-testid="mobile-insert-draw"
            onClick={() => menu.onAddDraw?.(day)}
          >
            <CircleDollarSign className="size-4 text-rose-500" />
            Add planned draw
          </DropdownMenuItem>
        ) : null}
        {menu?.onAddCapitalSpike ? (
          <DropdownMenuItem
            className="min-h-11 gap-3"
            data-testid="mobile-insert-capital-spike"
            onClick={() => menu.onAddCapitalSpike?.(day)}
          >
            <AlertTriangle className="size-4 text-amber-500" />
            Add capital event
          </DropdownMenuItem>
        ) : null}
        {menu?.onAddCashInfusion ? (
          <DropdownMenuItem
            className="min-h-11 gap-3"
            data-testid="mobile-insert-cash-infusion"
            onClick={() => menu.onAddCashInfusion?.(day)}
          >
            <Banknote className="size-4 text-emerald-600" />
            Add cash infusion
          </DropdownMenuItem>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function MobileLegendDot({
  className,
  label,
}: {
  className: string;
  label: string;
}) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={cn("size-2 rounded-full", className)} />
      {label}
    </span>
  );
}

function MobileDayDial({
  currentDay,
  onDayChange,
  range,
  side,
}: {
  currentDay: number;
  onDayChange: (day: number) => void;
  range: Required<TimelineRange>;
  side: "left" | "right";
}) {
  const clampDay = useCallback(
    (day: number) => Math.round(Math.min(range.max, Math.max(range.min, day))),
    [range.max, range.min]
  );
  const minDay = Math.round(range.min);
  const maxDay = Math.round(range.max);
  const selectedDay = clampDay(Math.round(currentDay));
  const wheelRootRef = useRef<HTMLDivElement | null>(null);
  const lastLiveDayRef = useRef(selectedDay);
  const dayOptions = useMemo<WheelPickerOption<number>[]>(() => {
    const dayCount = Math.max(0, maxDay - minDay + 1);
    return Array.from({ length: dayCount }, (_, index) => {
      const day = minDay + index;
      return {
        label: (
          <span
            className={cn(
              "inline-flex w-full items-center gap-1 tabular-nums",
              side === "right" ? "justify-start" : "justify-end"
            )}
          >
            {side === "right" ? <>D{day}</> : null}
            <span
              aria-hidden="true"
              className="h-px w-2.5 shrink-0 rounded-full bg-current opacity-35"
            />
            {side === "left" ? <>D{day}</> : null}
          </span>
        ),
        textValue: `Day ${day}`,
        value: day,
      };
    });
  }, [maxDay, minDay, side]);
  const publishLiveWheelDay = useCallback(() => {
    const highlightList =
      wheelRootRef.current?.querySelector<HTMLElement>(
        "[data-rwp-highlight-list]"
      ) ?? null;
    const translateY = parseWheelPickerTranslateY(
      highlightList?.style.transform ?? ""
    );
    if (translateY === null) {
      return;
    }
    const optionIndex = Math.round(
      -translateY / MOBILE_DAY_WHEEL_OPTION_ITEM_HEIGHT
    );
    const nextDay = clampDay(minDay + optionIndex);
    if (nextDay === lastLiveDayRef.current) {
      return;
    }
    lastLiveDayRef.current = nextDay;
    onDayChange(nextDay);
  }, [clampDay, minDay, onDayChange]);

  useEffect(() => {
    lastLiveDayRef.current = selectedDay;
  }, [selectedDay]);

  useEffect(() => {
    const highlightList =
      wheelRootRef.current?.querySelector<HTMLElement>(
        "[data-rwp-highlight-list]"
      ) ?? null;
    if (!highlightList || typeof MutationObserver === "undefined") {
      return;
    }

    let frame = 0;
    const schedulePublish = () => {
      if (frame !== 0) {
        return;
      }
      frame = requestAnimationFrame(() => {
        frame = 0;
        publishLiveWheelDay();
      });
    };
    const observer = new MutationObserver(schedulePublish);
    observer.observe(highlightList, {
      attributeFilter: ["style"],
      attributes: true,
    });

    return () => {
      observer.disconnect();
      if (frame !== 0) {
        cancelAnimationFrame(frame);
      }
    };
  }, [publishLiveWheelDay]);

  return (
    <fieldset
      aria-label="Timeline day dial"
      className="relative m-0 min-h-[20rem] min-w-0 touch-pan-y select-none border-0 p-0"
      data-side={side}
      data-testid="mobile-day-dial"
    >
      <label className="sr-only" htmlFor="mobile-day-dial-range">
        Timeline day dial
      </label>
      <input
        aria-label="Selected timeline day"
        className="sr-only"
        id="mobile-day-dial-range"
        max={range.max}
        min={range.min}
        onChange={(event) => onDayChange(clampDay(Number(event.target.value)))}
        type="range"
        value={selectedDay}
      />
      <div
        className={cn(
          "pointer-events-none absolute top-3 bottom-3 w-[7rem] border bg-muted/45",
          side === "right"
            ? "right-[-3.25rem] rounded-l-full"
            : "left-[-3.25rem] rounded-r-full"
        )}
      />
      <div className="pointer-events-none absolute top-1/2 right-0 left-0 h-px -translate-y-1/2 bg-primary/75" />
      <div
        className={cn(
          "relative z-10 flex min-h-[20rem] items-center",
          side === "right" ? "justify-start" : "justify-end"
        )}
      >
        <div
          className="relative w-[3.5rem] **:data-rwp:h-(--mobile-day-wheel-height)! sm:w-[3.75rem]"
          data-testid="mobile-day-wheel"
          ref={wheelRootRef}
          style={
            {
              "--mobile-day-wheel-active-inset": MOBILE_DAY_WHEEL_ACTIVE_INSET,
              "--mobile-day-wheel-height": `${MOBILE_DAY_WHEEL_HEIGHT_PX}px`,
            } as CSSProperties
          }
        >
          <WheelPickerWrapper
            className={cn(
              "w-full border bg-background/70 px-0 py-1 shadow-none backdrop-blur",
              side === "right"
                ? "rounded-r-none rounded-l-full border-r-0"
                : "rounded-r-full rounded-l-none border-l-0"
            )}
          >
            <WheelPicker<number>
              classNames={{
                highlightItem:
                  side === "right"
                    ? "justify-start pl-[calc(0.375rem+var(--mobile-day-wheel-active-inset))] pr-0.5 font-semibold text-foreground text"
                    : "justify-end pr-[calc(0.375rem+var(--mobile-day-wheel-active-inset))] pl-0.5 font-semibold text-foreground text-sm",
                highlightWrapper:
                  side === "right"
                    ? "ml-[var(--mobile-day-wheel-active-inset)] rounded-l-full border border-primary/45 bg-background/95 shadow-xs"
                    : "mr-[var(--mobile-day-wheel-active-inset)] rounded-r-full border border-primary/45 bg-background/95 shadow-xs",
                optionItem:
                  side === "right"
                    ? "justify-start pl-1.5 pr-0.5 font-medium text-muted-foreground/70 text-[16px] leading-none"
                    : "justify-end pr-1.5 pl-0.5 font-medium text-muted-foreground/70 text-[16px] leading-none",
              }}
              dragSensitivity={3}
              infinite={false}
              onValueChange={(day) => onDayChange(clampDay(day))}
              optionItemHeight={MOBILE_DAY_WHEEL_OPTION_ITEM_HEIGHT}
              options={dayOptions}
              scrollSensitivity={4}
              value={selectedDay}
              visibleCount={MOBILE_DAY_WHEEL_VISIBLE_COUNT}
            />
          </WheelPickerWrapper>
          <div
            className={cn(
              "pointer-events-none absolute top-1/2 -translate-y-1/2 rounded-full border bg-background p-1 shadow-xs",
              side === "right"
                ? "left-[calc(0.125rem+var(--mobile-day-wheel-active-inset))]"
                : "right-[calc(0.125rem+var(--mobile-day-wheel-active-inset))]"
            )}
          >
            <div className="grid size-6 place-items-center rounded-full bg-primary text-[10px] text-primary-foreground tabular-nums">
              D{selectedDay}
            </div>
          </div>
        </div>
      </div>
    </fieldset>
  );
}

function parseWheelPickerTranslateY(transform: string): number | null {
  if (!transform || transform === "none") {
    return null;
  }
  const translateMatch = WHEEL_TRANSLATE_Y_RE.exec(transform);
  if (translateMatch?.[1]) {
    return Number(translateMatch[1]);
  }
  const matrixMatch = WHEEL_MATRIX_RE.exec(transform);
  if (matrixMatch?.[1]) {
    const values = matrixMatch[1].split(",").map((value) => Number(value));
    return Number.isFinite(values[5]) ? values[5] : null;
  }
  const matrix3dMatch = WHEEL_MATRIX_3D_RE.exec(transform);
  if (matrix3dMatch?.[1]) {
    const values = matrix3dMatch[1].split(",").map((value) => Number(value));
    return Number.isFinite(values[13]) ? values[13] : null;
  }
  return null;
}

function MobileDayEventCard({
  active,
  event,
  onOpenCapitalEvent,
  onOpenDraw,
  onOpenMilestone,
}: {
  active?: boolean;
  event: MobileDayTimelineEvent;
  onOpenCapitalEvent: (capitalSpikeId: string) => void;
  onOpenDraw: (drawId: string) => void;
  onOpenMilestone: (itemId: string) => void;
}) {
  const Icon = mobileEventIcon(event.kind);
  const eventId = event.id.replace(MOBILE_EVENT_ID_PREFIX_RE, "");
  const artworkIcon = mobileDayEventArtworkIcon(event);
  const showMilestoneArtwork = Boolean(artworkIcon);
  return (
    <Card
      className={cn(
        "min-h-[4.25rem] p-0 outline-none transition focus-visible:ring-2 focus-visible:ring-primary/70",
        active && "shadow-sm",
        event.selected && "ring-1 ring-success/60"
      )}
      data-testid={`mobile-day-event-${event.id}`}
      onClick={() => {
        if (event.kind === "draw") {
          onOpenDraw(eventId);
        } else if (event.kind === "capital") {
          onOpenCapitalEvent(eventId);
        } else if (event.itemId) {
          onOpenMilestone(event.itemId);
        }
      }}
      render={<button type="button" />}
    >
      <div className="grid grid-cols-[2.85rem_3.35rem_minmax(0,1fr)_0.75rem] items-center gap-1.5 p-2.5 text-left sm:grid-cols-[3.75rem_3.65rem_minmax(0,1fr)_1rem] sm:gap-2 sm:p-3">
        <div className="text-center">
          <div
            className={cn(
              "font-semibold text-base tabular-nums sm:text-lg",
              event.selected && "text-success"
            )}
          >
            D{event.day}
          </div>
          {event.kind === "milestone" && event.endDay !== event.day ? (
            <div className="whitespace-nowrap text-[10px] text-muted-foreground tabular-nums">
              to D{event.endDay}
            </div>
          ) : null}
        </div>
        <div
          className={cn(
            "grid place-items-center overflow-hidden",
            showMilestoneArtwork
              ? "size-12 rounded-lg bg-muted/35 sm:size-13"
              : "size-9 rounded-full border bg-muted/50 sm:size-10",
            event.selected &&
              showMilestoneArtwork &&
              "bg-primary/10 ring-1 ring-primary/35",
            event.kind === "capital" && "text-success",
            event.kind === "draw" && !showMilestoneArtwork && "text-info",
            event.kind === "milestone" && !event.icon && "text-primary"
          )}
          data-testid={`mobile-day-event-icon-${event.id}`}
        >
          {showMilestoneArtwork && artworkIcon ? (
            <IsometricMilestoneIcon
              className="size-14 -translate-y-0.5 sm:size-16"
              type={artworkIcon}
            />
          ) : (
            <Icon className="size-5" />
          )}
        </div>
        <div className="min-w-0">
          <div className="mb-1 flex items-center gap-1.5">
            <Badge size="sm" variant={mobileEventBadgeVariant(event)}>
              {event.status}
            </Badge>
            <span className="truncate text-[10px] text-muted-foreground uppercase">
              {event.meta}
            </span>
          </div>
          <p className="truncate font-semibold text-sm">{event.title}</p>
          {event.amount === null ? null : (
            <p className="whitespace-nowrap text-xs tabular-nums">
              {money(event.amount)}
            </p>
          )}
        </div>
        <ChevronRight className="size-4 text-muted-foreground" />
      </div>
    </Card>
  );
}

function mobileDayEventArtworkIcon(
  event: MobileDayTimelineEvent
): IsometricIconKey | undefined {
  if (event.kind === "capital") {
    return;
  }
  return (
    resolveIsometricIconKey(event.icon) ??
    inferIsometricIconKeyFromText(
      event.itemId,
      event.id,
      event.title,
      event.meta
    ) ??
    "change"
  );
}

function mobileEventIcon(kind: MobileDayTimelineEventKind) {
  if (kind === "capital") {
    return Landmark;
  }
  if (kind === "draw") {
    return CircleDollarSign;
  }
  return Hammer;
}

function mobileEventBadgeVariant(
  event: MobileDayTimelineEvent
): "default" | "destructive" | "outline" | "secondary" | "success" | "warning" {
  if (event.status === "Rejected") {
    return "destructive";
  }
  if (event.status === "Requested" || event.status === "Review") {
    return "warning";
  }
  if (
    event.status === "Approved" ||
    event.status === "Released" ||
    event.status === "Opened"
  ) {
    return "success";
  }
  if (event.selected) {
    return "default";
  }
  return "outline";
}
