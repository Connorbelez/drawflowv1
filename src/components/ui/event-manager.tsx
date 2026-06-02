"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  Clock,
  Filter,
  Grid3x3,
  List,
  Lock,
  MousePointer2,
  Plus,
  Search,
  X,
} from "lucide-react";

import { CalendarContextMenu, CalendarOverflowMenu } from "#/features/calendar-workspace/CalendarContextMenu.tsx";
import {
  eventIsCapitalAffecting,
  eventNeedsAction,
} from "#/features/calendar-workspace/calendarEventProjection.ts";
import type {
  CalendarAction,
  CalendarSourceSummary,
  CalendarSurface,
  CalendarTimeframe,
  DrawFlowCalendarEvent,
} from "#/features/calendar-workspace/calendarTypes.ts";
import { cn } from "#/lib/utils.ts";
import { Badge } from "./badge.tsx";
import { Button } from "./button.tsx";
import { Card, CardContent, CardHeader, CardTitle } from "./card.tsx";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./dropdown-menu.tsx";
import { Input } from "./input.tsx";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./select.tsx";

export type EventManagerView =
  | "day"
  | "week"
  | "month"
  | "quarter"
  | "agenda"
  | "list";

export interface Event {
  id: string;
  title: string;
  description?: string;
  startTime: Date;
  endTime: Date;
  color: string;
  category?: string;
  attendees?: string[];
  tags?: string[];
  drawFlowEvent?: DrawFlowCalendarEvent;
  dateMarker?: "end" | "start" | "startEnd";
}

export interface EventManagerProps {
  actions?: CalendarAction[];
  allowCreate?: boolean;
  availableTags?: string[];
  availableViews?: EventManagerView[];
  categories?: string[];
  className?: string;
  colors?: EventColor[];
  defaultView?: EventManagerView;
  eventLabel?: string;
  events?: Event[];
  onEventCreate?: (event: Omit<Event, "id">) => void;
  onEventDelete?: (id: string) => void;
  onEventMove?: (
    event: Event,
    next: { endTime: Date; startTime: Date },
  ) => void;
  onEventResize?: (
    event: Event,
    next: { edge: "start" | "end"; endTime: Date; startTime: Date },
  ) => void;
  onEventSelect?: (event: Event) => void;
  onEventUpdate?: (id: string, event: Partial<Event>) => void;
  onSelectDate?: (date: string) => void;
  onToggleEventSelection?: (event: Event) => void;
  onViewChange?: (view: EventManagerView) => void;
  selectedDate?: string;
  selectedEventId?: string;
  selectedEventIds?: string[];
  source?: CalendarSourceSummary;
  surface?: CalendarSurface;
  view?: EventManagerView;
}

interface EventColor {
  accent?: string;
  bg: string;
  border?: string;
  name: string;
  text: string;
  value: string;
}

const defaultColors: EventColor[] = [
  {
    accent: "bg-blue-500",
    bg: "bg-blue-50",
    border: "border-blue-200",
    name: "Blue",
    text: "text-blue-950",
    value: "blue",
  },
  {
    accent: "bg-emerald-500",
    bg: "bg-emerald-50",
    border: "border-emerald-200",
    name: "Emerald",
    text: "text-emerald-950",
    value: "emerald",
  },
  {
    accent: "bg-violet-500",
    bg: "bg-violet-50",
    border: "border-violet-200",
    name: "Violet",
    text: "text-violet-950",
    value: "violet",
  },
  {
    accent: "bg-amber-500",
    bg: "bg-amber-50",
    border: "border-amber-200",
    name: "Amber",
    text: "text-amber-950",
    value: "amber",
  },
  {
    accent: "bg-rose-500",
    bg: "bg-rose-50",
    border: "border-rose-200",
    name: "Rose",
    text: "text-rose-950",
    value: "rose",
  },
  {
    accent: "bg-cyan-500",
    bg: "bg-cyan-50",
    border: "border-cyan-200",
    name: "Cyan",
    text: "text-cyan-950",
    value: "cyan",
  },
  {
    accent: "bg-slate-500",
    bg: "bg-slate-50",
    border: "border-slate-200",
    name: "Slate",
    text: "text-slate-950",
    value: "slate",
  },
  {
    accent: "bg-red-500",
    bg: "bg-red-50",
    border: "border-red-200",
    name: "Red",
    text: "text-red-950",
    value: "red",
  },
];

const defaultViews: EventManagerView[] = [
  "day",
  "week",
  "month",
  "quarter",
  "agenda",
];

const hourMarks = [7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18];

export function EventManager({
  actions = [],
  allowCreate,
  availableTags = ["Important", "Urgent", "Work", "Personal", "Team", "Client"],
  availableViews = defaultViews,
  categories = ["Meeting", "Task", "Reminder", "Personal"],
  className,
  colors = defaultColors,
  defaultView = "month",
  eventLabel = "event",
  events: initialEvents = [],
  onEventCreate,
  onEventMove,
  onEventResize,
  onEventSelect,
  onEventUpdate,
  onSelectDate,
  onToggleEventSelection,
  onViewChange,
  selectedDate,
  selectedEventId,
  selectedEventIds = [],
  source,
  surface,
  view: controlledView,
}: EventManagerProps) {
  const [events, setEvents] = useState<Event[]>(initialEvents);
  const [currentDate, setCurrentDate] = useState<Date>(
    () => initialEvents[0]?.startTime ?? new Date(),
  );
  const [internalView, setInternalView] =
    useState<EventManagerView>(defaultView);
  const [draggedEvent, setDraggedEvent] = useState<Event | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedColors, setSelectedColors] = useState<string[]>([]);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);

  useEffect(() => {
    setEvents(initialEvents);
  }, [initialEvents]);

  useEffect(() => {
    if (controlledView) {
      setInternalView(controlledView);
    }
  }, [controlledView]);

  const view = normalizeView(controlledView ?? internalView);
  const timeframe = timeframeFromView(view);
  const hasActiveFilters =
    selectedColors.length > 0 ||
    selectedTags.length > 0 ||
    selectedCategories.length > 0 ||
    searchQuery.trim().length > 0;

  const categoryOptions = useMemo(
    () =>
      Array.from(
        new Set([
          ...categories,
          ...events.flatMap((event) => (event.category ? [event.category] : [])),
        ]),
      ),
    [categories, events],
  );

  const tagOptions = useMemo(
    () =>
      Array.from(
        new Set([
          ...availableTags,
          ...events.flatMap((event) => event.tags ?? []),
        ]),
      ),
    [availableTags, events],
  );

  const filteredEvents = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return events.filter((event) => {
      if (query) {
        const text = [
          event.title,
          event.description,
          event.category,
          event.drawFlowEvent?.kind,
          event.drawFlowEvent?.status,
          ...(event.tags ?? []),
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!text.includes(query)) return false;
      }
      if (selectedColors.length > 0 && !selectedColors.includes(event.color)) {
        return false;
      }
      if (
        selectedCategories.length > 0 &&
        (!event.category || !selectedCategories.includes(event.category))
      ) {
        return false;
      }
      if (
        selectedTags.length > 0 &&
        !(event.tags ?? []).some((tag) => selectedTags.includes(tag))
      ) {
        return false;
      }
      return true;
    });
  }, [events, searchQuery, selectedCategories, selectedColors, selectedTags]);

  const eventsByDate = useMemo(
    () => groupManagedEventsByDate(filteredEvents),
    [filteredEvents],
  );

  const selectView = useCallback(
    (next: EventManagerView) => {
      const normalized = normalizeView(next);
      if (!controlledView) {
        setInternalView(normalized);
      }
      onViewChange?.(normalized);
    },
    [controlledView, onViewChange],
  );

  const navigateDate = useCallback(
    (direction: "next" | "prev") => {
      setCurrentDate((previous) => {
        const next = new Date(previous);
        const amount = direction === "next" ? 1 : -1;
        if (view === "month") {
          next.setMonth(previous.getMonth() + amount);
        } else if (view === "quarter") {
          next.setMonth(previous.getMonth() + amount * 3);
        } else if (view === "week") {
          next.setDate(previous.getDate() + amount * 7);
        } else if (view === "day") {
          next.setDate(previous.getDate() + amount);
        }
        return next;
      });
    },
    [view],
  );

  const clearFilters = useCallback(() => {
    setSearchQuery("");
    setSelectedCategories([]);
    setSelectedColors([]);
    setSelectedTags([]);
  }, []);

  const getColorClasses = useCallback(
    (colorValue: string) =>
      colors.find((color) => color.value === colorValue) ?? colors[0],
    [colors],
  );

  const handleSelectDate = useCallback(
    (date: Date) => {
      const key = dateKey(date);
      setCurrentDate(date);
      onSelectDate?.(key);
    },
    [onSelectDate],
  );

  const handleCreateEvent = useCallback(() => {
    const startTime = new Date(currentDate);
    startTime.setHours(9, 0, 0, 0);
    const endTime = new Date(startTime);
    endTime.setHours(10, 0, 0, 0);
    onEventCreate?.({
      category: categories[0],
      color: colors[0].value,
      description: "",
      endTime,
      startTime,
      tags: [],
      title: `New ${eventLabel}`,
    });
  }, [categories, colors, currentDate, eventLabel, onEventCreate]);

  const handleDrop = useCallback(
    (date: Date, hour?: number) => {
      if (!draggedEvent) return;
      if (draggedEvent.drawFlowEvent?.editable.canMove === false) return;

      const duration = Math.max(
        draggedEvent.endTime.getTime() - draggedEvent.startTime.getTime(),
        60 * 60 * 1000,
      );
      const nextStart = new Date(date);
      const priorHour = draggedEvent.startTime.getHours();
      nextStart.setHours(hour ?? priorHour, 0, 0, 0);
      const nextEnd = new Date(nextStart.getTime() + duration);
      const nextEvent = {
        ...draggedEvent,
        endTime: nextEnd,
        startTime: nextStart,
      };

      if (onEventMove) {
        onEventMove(draggedEvent, { endTime: nextEnd, startTime: nextStart });
      } else {
        setEvents((current) =>
          current.map((event) => (event.id === draggedEvent.id ? nextEvent : event)),
        );
        onEventUpdate?.(draggedEvent.id, nextEvent);
      }
      setDraggedEvent(null);
    },
    [draggedEvent, onEventMove, onEventUpdate],
  );

  const handleResize = useCallback(
    (event: Event, edge: "start" | "end", dayDelta: number) => {
      const nextStart = new Date(event.startTime);
      const nextEnd = new Date(event.endTime);
      if (edge === "start") {
        nextStart.setDate(nextStart.getDate() + dayDelta);
      } else {
        nextEnd.setDate(nextEnd.getDate() + dayDelta);
      }
      if (nextEnd <= nextStart) {
        nextEnd.setTime(nextStart.getTime() + 60 * 60 * 1000);
      }
      if (onEventResize) {
        onEventResize(event, { edge, endTime: nextEnd, startTime: nextStart });
      } else {
        const nextEvent = { ...event, endTime: nextEnd, startTime: nextStart };
        setEvents((current) =>
          current.map((candidate) =>
            candidate.id === event.id ? nextEvent : candidate,
          ),
        );
        onEventUpdate?.(event.id, nextEvent);
      }
    },
    [onEventResize, onEventUpdate],
  );

  return (
    <div
      className={cn("flex min-h-0 flex-col gap-3", className)}
      data-testid="drawflow-event-manager"
    >
      <div className="flex flex-col gap-3 p-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center">
          <div className="min-w-0">
            <h2 className="truncate font-semibold text-lg">
              {viewTitle(view, currentDate)}
            </h2>
            <p className="text-muted-foreground text-xs">
              {filteredEvents.length} scheduled {filteredEvents.length === 1 ? eventLabel : `${eventLabel}s`}
            </p>
          </div>
          <div className="flex items-center gap-1">
            <Button
              aria-label="Previous calendar range"
              className="size-8"
              onClick={() => navigateDate("prev")}
              size="icon"
              variant="outline"
            >
              <ChevronLeft className="size-4" />
            </Button>
            <Button
              onClick={() => {
                const today = new Date();
                setCurrentDate(today);
                onSelectDate?.(dateKey(today));
              }}
              size="sm"
              variant="outline"
            >
              Today
            </Button>
            <Button
              aria-label="Next calendar range"
              className="size-8"
              onClick={() => navigateDate("next")}
              size="icon"
              variant="outline"
            >
              <ChevronRight className="size-4" />
            </Button>
          </div>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="sm:hidden">
            <Select
              onValueChange={(value) => selectView(value as EventManagerView)}
              value={view}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {availableViews.map((candidate) => (
                  <SelectItem key={candidate} value={candidate}>
                    {viewLabel(candidate)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div
            aria-label="Calendar timeframe"
            className="hidden items-center gap-1 rounded-md border bg-background p-1 sm:flex"
            role="tablist"
          >
            {availableViews.map((candidate) => (
              <Button
                aria-selected={view === normalizeView(candidate)}
                className="h-8"
                key={candidate}
                onClick={() => selectView(candidate)}
                role="tab"
                size="sm"
                variant={view === normalizeView(candidate) ? "secondary" : "ghost"}
              >
                {viewIcon(candidate)}
                {viewLabel(candidate)}
              </Button>
            ))}
          </div>

          {allowCreate ?? Boolean(onEventCreate) ? (
            <Button onClick={handleCreateEvent} size="sm">
              <Plus className="size-4" />
              New {eventLabel}
            </Button>
          ) : null}
        </div>
      </div>

      <div className="flex flex-col gap-2 px-3 sm:flex-row sm:items-center">
        <div className="relative min-w-0 flex-1">
          <Search className="-translate-y-1/2 pointer-events-none absolute top-1/2 left-2.5 size-4 text-muted-foreground" />
          <Input
            className="pl-8"
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="Search visible events"
            value={searchQuery}
          />
          {searchQuery ? (
            <Button
              aria-label="Clear event search"
              className="-translate-y-1/2 absolute top-1/2 right-1 size-7"
              onClick={() => setSearchQuery("")}
              size="icon"
              variant="ghost"
            >
              <X className="size-4" />
            </Button>
          ) : null}
        </div>

        <EventManagerFilters
          categoryOptions={categoryOptions}
          colors={colors}
          hasActiveFilters={hasActiveFilters}
          onClear={clearFilters}
          selectedCategories={selectedCategories}
          selectedColors={selectedColors}
          selectedTags={selectedTags}
          setSelectedCategories={setSelectedCategories}
          setSelectedColors={setSelectedColors}
          setSelectedTags={setSelectedTags}
          tagOptions={tagOptions}
        />
      </div>

      <div className="min-h-0 flex-1 overflow-hidden px-3 pb-3">
        {view === "month" ? (
          <MonthView
            actions={actions}
            colors={colors}
            currentDate={currentDate}
            eventsByDate={eventsByDate}
            getColorClasses={getColorClasses}
            onDrop={handleDrop}
            onEventResize={handleResize}
            onEventSelect={onEventSelect}
            onSelectDate={handleSelectDate}
            onToggleEventSelection={onToggleEventSelection}
            selectedDate={selectedDate}
            selectedEventId={selectedEventId}
            selectedEventIds={selectedEventIds}
            setDraggedEvent={setDraggedEvent}
            source={source}
            surface={surface}
            timeframe={timeframe}
          />
        ) : view === "week" ? (
          <WeekView
            actions={actions}
            currentDate={currentDate}
            events={filteredEvents}
            getColorClasses={getColorClasses}
            onDrop={handleDrop}
            onEventResize={handleResize}
            onEventSelect={onEventSelect}
            onSelectDate={handleSelectDate}
            onToggleEventSelection={onToggleEventSelection}
            selectedDate={selectedDate}
            selectedEventId={selectedEventId}
            selectedEventIds={selectedEventIds}
            setDraggedEvent={setDraggedEvent}
            source={source}
            surface={surface}
            timeframe={timeframe}
          />
        ) : view === "day" ? (
          <DayView
            actions={actions}
            currentDate={currentDate}
            events={filteredEvents}
            getColorClasses={getColorClasses}
            onDrop={handleDrop}
            onEventResize={handleResize}
            onEventSelect={onEventSelect}
            onSelectDate={handleSelectDate}
            onToggleEventSelection={onToggleEventSelection}
            selectedEventId={selectedEventId}
            selectedEventIds={selectedEventIds}
            setDraggedEvent={setDraggedEvent}
            source={source}
            surface={surface}
            timeframe={timeframe}
          />
        ) : view === "quarter" ? (
          <QuarterView
            actions={actions}
            colors={colors}
            currentDate={currentDate}
            eventsByDate={eventsByDate}
            getColorClasses={getColorClasses}
            onDrop={handleDrop}
            onEventResize={handleResize}
            onEventSelect={onEventSelect}
            onSelectDate={handleSelectDate}
            onToggleEventSelection={onToggleEventSelection}
            selectedDate={selectedDate}
            selectedEventId={selectedEventId}
            selectedEventIds={selectedEventIds}
            setDraggedEvent={setDraggedEvent}
            source={source}
            surface={surface}
            timeframe={timeframe}
          />
        ) : (
          <AgendaView
            actions={actions}
            eventsByDate={eventsByDate}
            getColorClasses={getColorClasses}
            onDrop={handleDrop}
            onEventResize={handleResize}
            onEventSelect={onEventSelect}
            onSelectDate={handleSelectDate}
            onToggleEventSelection={onToggleEventSelection}
            selectedEventId={selectedEventId}
            selectedEventIds={selectedEventIds}
            setDraggedEvent={setDraggedEvent}
            source={source}
            surface={surface}
            timeframe={timeframe}
          />
        )}
      </div>
    </div>
  );
}

function EventManagerFilters({
  categoryOptions,
  colors,
  hasActiveFilters,
  onClear,
  selectedCategories,
  selectedColors,
  selectedTags,
  setSelectedCategories,
  setSelectedColors,
  setSelectedTags,
  tagOptions,
}: {
  categoryOptions: string[];
  colors: EventColor[];
  hasActiveFilters: boolean;
  onClear: () => void;
  selectedCategories: string[];
  selectedColors: string[];
  selectedTags: string[];
  setSelectedCategories: (value: string[]) => void;
  setSelectedColors: (value: string[]) => void;
  setSelectedTags: (value: string[]) => void;
  tagOptions: string[];
}) {
  return (
    <div className="flex min-w-0 gap-2 overflow-x-auto">
      <FilterMenu
        count={selectedColors.length}
        label="Colors"
        options={colors.map((color) => ({
          indicator: <span className={cn("size-3 rounded-sm", color.accent ?? color.bg)} />,
          label: color.name,
          value: color.value,
        }))}
        selected={selectedColors}
        setSelected={setSelectedColors}
      />
      <FilterMenu
        count={selectedCategories.length}
        label="Categories"
        options={categoryOptions.map((category) => ({
          label: category,
          value: category,
        }))}
        selected={selectedCategories}
        setSelected={setSelectedCategories}
      />
      <FilterMenu
        count={selectedTags.length}
        label="Tags"
        options={tagOptions.map((tag) => ({
          label: tag,
          value: tag,
        }))}
        selected={selectedTags}
        setSelected={setSelectedTags}
      />
      {hasActiveFilters ? (
        <Button className="shrink-0" onClick={onClear} size="sm" variant="ghost">
          <X className="size-4" />
          Clear
        </Button>
      ) : null}
    </div>
  );
}

function FilterMenu({
  count,
  label,
  options,
  selected,
  setSelected,
}: {
  count: number;
  label: string;
  options: Array<{ indicator?: React.ReactNode; label: string; value: string }>;
  selected: string[];
  setSelected: (value: string[]) => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button className="shrink-0 gap-2" size="sm" variant="outline" />
        }
      >
        <Filter className="size-4" />
        {label}
        {count > 0 ? <Badge variant="secondary">{count}</Badge> : null}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-48">
        <DropdownMenuGroup>
          <DropdownMenuLabel>Filter by {label.toLowerCase()}</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {options.map((option) => (
            <DropdownMenuCheckboxItem
              checked={selected.includes(option.value)}
              key={option.value}
              onCheckedChange={(checked) =>
                setSelected(
                  checked
                    ? [...selected, option.value]
                    : selected.filter((value) => value !== option.value),
                )
              }
            >
              <span className="inline-flex min-w-0 items-center gap-2">
                {option.indicator}
                <span className="truncate">{option.label}</span>
              </span>
            </DropdownMenuCheckboxItem>
          ))}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function MonthView({
  actions,
  currentDate,
  eventsByDate,
  getColorClasses,
  onDrop,
  onEventResize,
  onEventSelect,
  onSelectDate,
  onToggleEventSelection,
  selectedDate,
  selectedEventId,
  selectedEventIds,
  setDraggedEvent,
  source,
  surface,
  timeframe,
}: CalendarBoardProps & {
  colors: EventColor[];
  currentDate: Date;
  eventsByDate: Map<string, Event[]>;
}) {
  const days = monthGridDays(currentDate);
  return (
    <Card className="h-full overflow-hidden">
      <CardContent className="h-full overflow-auto p-0">
        <div className="grid min-w-[56rem] grid-cols-7 border-b bg-muted/40 text-muted-foreground text-xs">
          {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((day) => (
            <div className="border-r p-2 last:border-r-0" key={day}>
              {day}
            </div>
          ))}
        </div>
        <div className="grid min-w-[56rem] grid-cols-7">
          {days.map((day) => {
            const key = dateKey(day);
            const dayEvents = eventsByDate.get(key) ?? [];
            return (
              <DateCell
                actions={actions}
                className={cn(
                  "min-h-[9rem] border-r border-b p-2 last:border-r-0",
                  day.getMonth() !== currentDate.getMonth() && "bg-muted/30 text-muted-foreground",
                  isToday(day) && "bg-blue-50/70",
                  selectedDate === key && "ring-2 ring-primary ring-inset",
                )}
                date={day}
                events={dayEvents}
                key={key}
                onDrop={onDrop}
                onSelectDate={onSelectDate}
                source={source}
                surface={surface}
                timeframe={timeframe}
              >
                <div className="mb-1 flex items-center justify-between gap-2">
                  <span className="font-medium text-xs">{day.getDate()}</span>
                  {dayEvents.length > 0 ? (
                    <Badge className="h-5 px-1.5 text-[0.65rem]" variant="outline">
                      {dayEvents.length}
                    </Badge>
                  ) : null}
                </div>
                <div className="grid gap-1">
                  {dayEvents.slice(0, 5).map((event) => (
                    <EventTile
                      actions={actions}
                      compact
                      event={event}
                      getColorClasses={getColorClasses}
                      key={event.id}
                      onEventResize={onEventResize}
                      onEventSelect={onEventSelect}
                      onToggleEventSelection={onToggleEventSelection}
                      selected={selectedEventId === event.id}
                      selectedForBulk={selectedEventIds.includes(event.id)}
                      setDraggedEvent={setDraggedEvent}
                      source={source}
                      surface={surface}
                      timeframe={timeframe}
                    />
                  ))}
                  {dayEvents.length > 5 ? (
                    <button
                      className="rounded px-1 text-left text-muted-foreground text-xs hover:bg-muted"
                      onClick={() => onSelectDate(day)}
                      type="button"
                    >
                      +{dayEvents.length - 5} more
                    </button>
                  ) : null}
                </div>
              </DateCell>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

function WeekView({
  actions,
  currentDate,
  events,
  getColorClasses,
  onDrop,
  onEventResize,
  onEventSelect,
  onSelectDate,
  onToggleEventSelection,
  selectedDate,
  selectedEventId,
  selectedEventIds,
  setDraggedEvent,
  source,
  surface,
  timeframe,
}: CalendarBoardProps & { currentDate: Date; events: Event[] }) {
  const days = weekDays(currentDate);
  return (
    <Card className="h-full overflow-hidden">
      <CardContent className="h-full overflow-auto p-0">
        <div className="grid min-w-[64rem] grid-cols-[4.5rem_repeat(7,minmax(0,1fr))] border-b bg-muted/40 text-xs">
          <div className="border-r p-2 text-muted-foreground">Time</div>
          {days.map((day) => {
            const key = dateKey(day);
            return (
              <button
                className={cn(
                  "border-r p-2 text-left last:border-r-0",
                  selectedDate === key && "bg-primary/10",
                  isToday(day) && "bg-blue-50",
                )}
                key={key}
                onClick={() => onSelectDate(day)}
                type="button"
              >
                <span className="block font-medium">
                  {day.toLocaleDateString(undefined, { weekday: "short" })}
                </span>
                <span className="text-muted-foreground">{day.getDate()}</span>
              </button>
            );
          })}
        </div>

        <div className="grid min-w-[64rem] grid-cols-[4.5rem_repeat(7,minmax(0,1fr))] border-b">
          <div className="border-r p-2 text-muted-foreground text-xs">All day</div>
          {days.map((day) => {
            const dayEvents = displayEventsForDay(events, day);
            const allDayEvents = dayEvents.filter((event) =>
              event.drawFlowEvent?.allDay || spansMultipleDays(event),
            );
            return (
              <DateCell
                actions={actions}
                className="min-h-24 border-r p-2 last:border-r-0"
                date={day}
                events={allDayEvents}
                key={dateKey(day)}
                onDrop={onDrop}
                onSelectDate={onSelectDate}
                source={source}
                surface={surface}
                timeframe={timeframe}
              >
                <div className="grid gap-1">
                  {allDayEvents.slice(0, 3).map((event) => (
                    <EventTile
                      actions={actions}
                      compact
                      event={event}
                      getColorClasses={getColorClasses}
                      key={event.id}
                      onEventResize={onEventResize}
                      onEventSelect={onEventSelect}
                      onToggleEventSelection={onToggleEventSelection}
                      selected={selectedEventId === event.id}
                      selectedForBulk={selectedEventIds.includes(event.id)}
                      setDraggedEvent={setDraggedEvent}
                      source={source}
                      surface={surface}
                      timeframe={timeframe}
                    />
                  ))}
                </div>
              </DateCell>
            );
          })}
        </div>

        {hourMarks.map((hour) => (
          <div
            className="grid min-w-[64rem] grid-cols-[4.5rem_repeat(7,minmax(0,1fr))] border-b last:border-b-0"
            key={hour}
          >
            <div className="border-r p-2 text-muted-foreground text-xs">
              {formatHour(hour)}
            </div>
            {days.map((day) => {
              const hourEvents = displayEventsForDay(events, day).filter(
                (event) =>
                  !event.drawFlowEvent?.allDay &&
                  event.startTime.getHours() === hour,
              );
              return (
                <DateCell
                  actions={actions}
                  className="min-h-20 border-r p-1.5 last:border-r-0"
                  date={day}
                  events={hourEvents}
                  hour={hour}
                  key={`${dateKey(day)}-${hour}`}
                  onDrop={onDrop}
                  onSelectDate={onSelectDate}
                  source={source}
                  surface={surface}
                  timeframe={timeframe}
                >
                  <div className="grid gap-1">
                    {hourEvents.map((event) => (
                      <EventTile
                        actions={actions}
                        compact
                        event={event}
                        getColorClasses={getColorClasses}
                        key={event.id}
                        onEventResize={onEventResize}
                        onEventSelect={onEventSelect}
                        onToggleEventSelection={onToggleEventSelection}
                        selected={selectedEventId === event.id}
                        selectedForBulk={selectedEventIds.includes(event.id)}
                        setDraggedEvent={setDraggedEvent}
                        source={source}
                        surface={surface}
                        timeframe={timeframe}
                      />
                    ))}
                  </div>
                </DateCell>
              );
            })}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function DayView({
  actions,
  currentDate,
  events,
  getColorClasses,
  onDrop,
  onEventResize,
  onEventSelect,
  onToggleEventSelection,
  selectedEventId,
  selectedEventIds,
  setDraggedEvent,
  source,
  surface,
  timeframe,
}: CalendarBoardProps & { currentDate: Date; events: Event[] }) {
  const dayEvents = displayEventsForDay(events, currentDate);
  const lanes = [
    {
      description: "Approvals, reviews, missing information, releases, and site visit dispatch.",
      events: dayEvents.filter((event) =>
        event.drawFlowEvent ? eventNeedsAction(event.drawFlowEvent) : false,
      ),
      title: "Needs action",
    },
    {
      description: "Draw readiness, release targets, receipt timing, and interest-relevant dates.",
      events: dayEvents.filter((event) =>
        event.drawFlowEvent ? eventIsCapitalAffecting(event.drawFlowEvent) : false,
      ),
      title: "Capital movement",
    },
    {
      description: "Milestones, field evidence, contractor windows, and site visits.",
      events: dayEvents.filter((event) =>
        ["milestone", "submilestone", "evidence", "siteVisit", "contractor"].includes(
          event.drawFlowEvent?.kind ?? "",
        ),
      ),
      title: "Field work",
    },
  ];
  const laneEventIds = new Set(lanes.flatMap((lane) => lane.events.map((event) => event.id)));
  const otherEvents = dayEvents.filter((event) => !laneEventIds.has(event.id));

  return (
    <Card className="h-full overflow-hidden">
      <CardContent className="grid h-full gap-3 overflow-auto p-3 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
        <div className="grid content-start gap-3">
          {lanes.map((lane) => (
            <Card key={lane.title}>
              <CardHeader className="p-3 pb-1">
                <CardTitle className="flex items-center justify-between gap-2 text-sm">
                  {lane.title}
                  <Badge variant="outline">{lane.events.length}</Badge>
                </CardTitle>
                <p className="text-muted-foreground text-xs">{lane.description}</p>
              </CardHeader>
              <CardContent className="grid gap-1.5 p-3 pt-1">
                {lane.events.length > 0 ? (
                  lane.events.map((event) => (
                    <EventTile
                      actions={actions}
                      event={event}
                      getColorClasses={getColorClasses}
                      key={event.id}
                      onEventResize={onEventResize}
                      onEventSelect={onEventSelect}
                      onToggleEventSelection={onToggleEventSelection}
                      selected={selectedEventId === event.id}
                      selectedForBulk={selectedEventIds.includes(event.id)}
                      setDraggedEvent={setDraggedEvent}
                      source={source}
                      surface={surface}
                      timeframe={timeframe}
                    />
                  ))
                ) : (
                  <EmptyLane />
                )}
              </CardContent>
            </Card>
          ))}
          {otherEvents.length > 0 ? (
            <Card>
              <CardHeader className="p-3 pb-1">
                <CardTitle className="text-sm">Other scheduled events</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-1.5 p-3 pt-1">
                {otherEvents.map((event) => (
                  <EventTile
                    actions={actions}
                    event={event}
                    getColorClasses={getColorClasses}
                    key={event.id}
                    onEventResize={onEventResize}
                    onEventSelect={onEventSelect}
                    onToggleEventSelection={onToggleEventSelection}
                    selected={selectedEventId === event.id}
                    selectedForBulk={selectedEventIds.includes(event.id)}
                    setDraggedEvent={setDraggedEvent}
                    source={source}
                    surface={surface}
                    timeframe={timeframe}
                  />
                ))}
              </CardContent>
            </Card>
          ) : null}
        </div>

        <div className="min-h-[32rem] overflow-hidden rounded-md border">
          {hourMarks.map((hour) => {
            const hourEvents = dayEvents.filter(
              (event) =>
                !event.drawFlowEvent?.allDay && event.startTime.getHours() === hour,
            );
            return (
              <DateCell
                actions={actions}
                className="grid min-h-20 grid-cols-[4rem_1fr] border-b last:border-b-0"
                date={currentDate}
                events={hourEvents}
                hour={hour}
                key={hour}
                onDrop={onDrop}
                source={source}
                surface={surface}
                timeframe={timeframe}
              >
                <div className="border-r p-2 text-muted-foreground text-xs">
                  {formatHour(hour)}
                </div>
                <div className="grid content-start gap-1 p-2">
                  {hourEvents.map((event) => (
                    <EventTile
                      actions={actions}
                      compact
                      event={event}
                      getColorClasses={getColorClasses}
                      key={event.id}
                      onEventResize={onEventResize}
                      onEventSelect={onEventSelect}
                      onToggleEventSelection={onToggleEventSelection}
                      selected={selectedEventId === event.id}
                      selectedForBulk={selectedEventIds.includes(event.id)}
                      setDraggedEvent={setDraggedEvent}
                      source={source}
                      surface={surface}
                      timeframe={timeframe}
                    />
                  ))}
                </div>
              </DateCell>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

function QuarterView({
  actions,
  currentDate,
  eventsByDate,
  getColorClasses,
  onDrop,
  onEventResize,
  onEventSelect,
  onSelectDate,
  onToggleEventSelection,
  selectedDate,
  selectedEventId,
  selectedEventIds,
  setDraggedEvent,
  source,
  surface,
  timeframe,
}: CalendarBoardProps & {
  colors: EventColor[];
  currentDate: Date;
  eventsByDate: Map<string, Event[]>;
}) {
  const startMonth = Math.floor(currentDate.getMonth() / 3) * 3;
  const months = [0, 1, 2].map(
    (offset) => new Date(currentDate.getFullYear(), startMonth + offset, 1),
  );
  return (
    <div className="grid h-full min-h-0 gap-3 overflow-auto xl:grid-cols-3">
      {months.map((month) => (
        <Card className="min-h-[34rem] overflow-hidden" key={month.getMonth()}>
          <CardHeader className="p-3 pb-2">
            <CardTitle className="text-sm">
              {month.toLocaleDateString(undefined, {
                month: "long",
                year: "numeric",
              })}
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-1 overflow-auto p-3 pt-0">
            {monthDays(month).map((day) => {
              const key = dateKey(day);
              const events = eventsByDate.get(key) ?? [];
              return (
                <DateCell
                  actions={actions}
                  className={cn(
                    "grid min-h-12 grid-cols-[2.25rem_1fr] gap-2 rounded-md border p-1.5",
                    selectedDate === key && "ring-2 ring-primary",
                    isToday(day) && "bg-blue-50",
                  )}
                  date={day}
                  events={events}
                  key={key}
                  onDrop={onDrop}
                  onSelectDate={onSelectDate}
                  source={source}
                  surface={surface}
                  timeframe={timeframe}
                >
                  <div className="text-muted-foreground text-xs">{day.getDate()}</div>
                  <div className="grid gap-1">
                    {events.slice(0, 2).map((event) => (
                      <EventTile
                        actions={actions}
                        compact
                        event={event}
                        getColorClasses={getColorClasses}
                        key={event.id}
                        onEventResize={onEventResize}
                        onEventSelect={onEventSelect}
                        onToggleEventSelection={onToggleEventSelection}
                        selected={selectedEventId === event.id}
                        selectedForBulk={selectedEventIds.includes(event.id)}
                        setDraggedEvent={setDraggedEvent}
                        source={source}
                        surface={surface}
                        timeframe={timeframe}
                      />
                    ))}
                    {events.length > 2 ? (
                      <span className="text-muted-foreground text-xs">
                        +{events.length - 2} more
                      </span>
                    ) : null}
                  </div>
                </DateCell>
              );
            })}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function AgendaView({
  actions,
  eventsByDate,
  getColorClasses,
  onDrop,
  onEventResize,
  onEventSelect,
  onSelectDate,
  onToggleEventSelection,
  selectedEventId,
  selectedEventIds,
  setDraggedEvent,
  source,
  surface,
  timeframe,
}: CalendarBoardProps & { eventsByDate: Map<string, Event[]> }) {
  const groups = Array.from(eventsByDate.entries()).sort(([left], [right]) =>
    left.localeCompare(right),
  );
  return (
    <Card className="h-full overflow-hidden">
      <CardContent className="h-full overflow-auto p-0">
        {groups.length > 0 ? (
          groups.map(([dayKey, events]) => {
            const date = dateFromKey(dayKey);
            return (
              <DateCell
                actions={actions}
                className="grid gap-2 border-b p-3 last:border-b-0"
                date={date}
                events={events}
                key={dayKey}
                onDrop={onDrop}
                onSelectDate={onSelectDate}
                source={source}
                surface={surface}
                timeframe={timeframe}
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h3 className="font-semibold text-sm">
                    {date.toLocaleDateString(undefined, {
                      day: "numeric",
                      month: "long",
                      weekday: "long",
                    })}
                  </h3>
                  <Badge variant="outline">{events.length} events</Badge>
                </div>
                <div className="grid gap-1.5">
                  {events.map((event) => (
                    <EventTile
                      actions={actions}
                      event={event}
                      getColorClasses={getColorClasses}
                      key={`${dayKey}-${event.id}`}
                      onEventResize={onEventResize}
                      onEventSelect={onEventSelect}
                      onToggleEventSelection={onToggleEventSelection}
                      selected={selectedEventId === event.id}
                      selectedForBulk={selectedEventIds.includes(event.id)}
                      setDraggedEvent={setDraggedEvent}
                      source={source}
                      surface={surface}
                      timeframe={timeframe}
                    />
                  ))}
                </div>
              </DateCell>
            );
          })
        ) : (
          <div className="grid min-h-96 place-items-center p-6 text-center text-muted-foreground text-sm">
            <span className="inline-flex items-center gap-2">
              <MousePointer2 className="size-4" />
              No events match this view.
            </span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function DateCell({
  actions,
  children,
  className,
  date,
  events,
  hour,
  onDrop,
  onSelectDate,
  source,
  surface,
  timeframe,
}: {
  actions: CalendarAction[];
  children: React.ReactNode;
  className?: string;
  date: Date;
  events: Event[];
  hour?: number;
  onDrop: (date: Date, hour?: number) => void;
  onSelectDate?: (date: Date) => void;
  source?: CalendarSourceSummary;
  surface?: CalendarSurface;
  timeframe: CalendarTimeframe;
}) {
  const domainEvents = events.flatMap((event) =>
    event.drawFlowEvent ? [event.drawFlowEvent] : [],
  );
  const cell = (
    <div
      className={cn("min-w-0", className)}
      data-calendar-date={dateKey(date)}
      onClick={() => onSelectDate?.(date)}
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => {
        event.preventDefault();
        onDrop(date, hour);
      }}
    >
      {children}
    </div>
  );
  if (!source || !surface) return cell;
  const dayKey = dateKey(date);
  return (
    <CalendarContextMenu
      actions={actions}
      context={{
        date: dayKey,
        dateRange: { startsAt: dayKey },
        events: domainEvents,
        source,
        surface,
        timeframe,
      }}
      label={`${dayKey} actions`}
      target="date"
    >
      {cell}
    </CalendarContextMenu>
  );
}

function EventTile({
  actions,
  compact = false,
  event,
  getColorClasses,
  onEventResize,
  onEventSelect,
  onToggleEventSelection,
  selected,
  selectedForBulk,
  setDraggedEvent,
  source,
  surface,
  timeframe,
}: {
  actions: CalendarAction[];
  compact?: boolean;
  event: Event;
  getColorClasses: (color: string) => EventColor;
  onEventResize: (event: Event, edge: "start" | "end", dayDelta: number) => void;
  onEventSelect?: (event: Event) => void;
  onToggleEventSelection?: (event: Event) => void;
  selected: boolean;
  selectedForBulk: boolean;
  setDraggedEvent: (event: Event | null) => void;
  source?: CalendarSourceSummary;
  surface?: CalendarSurface;
  timeframe: CalendarTimeframe;
}) {
  const color = getColorClasses(event.color);
  const domain = event.drawFlowEvent;
  const canMove = domain?.editable.canMove ?? true;
  const canResizeStart = domain?.editable.canResizeStart ?? false;
  const canResizeEnd = domain?.editable.canResizeEnd ?? false;
  const immutableReason = domain?.editable.immutableReason;
  const content = (
    <div
      aria-label={`${event.title} ${formatEventTime(event)}`}
      className={cn(
        "group relative flex min-w-0 cursor-pointer gap-2 rounded-md border px-2 py-1.5 text-left text-xs transition hover:brightness-95 focus:outline-none focus:ring-2 focus:ring-primary",
        color.bg,
        color.text,
        color.border,
        selected && "ring-2 ring-primary",
        selectedForBulk && "outline outline-2 outline-primary/60",
        !canMove && "cursor-default opacity-90",
      )}
      draggable={canMove}
      onClick={(clickEvent) => {
        clickEvent.stopPropagation();
        onEventSelect?.(event);
      }}
      onDragEnd={() => setDraggedEvent(null)}
      onDragStart={() => {
        if (canMove) setDraggedEvent(event);
      }}
      onKeyDown={(keyEvent) => {
        if (keyEvent.key === "Enter" || keyEvent.key === " ") {
          keyEvent.preventDefault();
          onEventSelect?.(event);
        }
      }}
      role="button"
      tabIndex={0}
    >
      <span className={cn("mt-1 size-2 shrink-0 rounded-full", color.accent ?? color.bg)} />
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-1">
          <span className="truncate font-medium">{event.title}</span>
          {domain?.warnings.length ? (
            <AlertTriangle className="size-3 shrink-0 text-amber-600" />
          ) : null}
          {immutableReason ? <Lock className="size-3 shrink-0" /> : null}
        </div>
        <div className="mt-0.5 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 text-[0.68rem] opacity-80">
          <span className="inline-flex items-center gap-1">
            <Clock className="size-3" />
            {formatEventTime(event)}
          </span>
          {event.dateMarker ? <span>{dateMarkerLabel(event.dateMarker)}</span> : null}
          {domain ? <span>{domain.kind}</span> : null}
          {domain ? <span>{domain.status}</span> : null}
        </div>
        {!compact && event.description ? (
          <p className="mt-1 line-clamp-2 opacity-80">{event.description}</p>
        ) : null}
        {!compact && event.tags?.length ? (
          <div className="mt-1 flex flex-wrap gap-1">
            {event.tags.slice(0, 3).map((tag) => (
              <span
                className="rounded-sm bg-background/60 px-1 py-0.5 text-[0.65rem]"
                key={tag}
              >
                {tag}
              </span>
            ))}
          </div>
        ) : null}
        {!compact && (canResizeStart || canResizeEnd || onToggleEventSelection) ? (
          <div className="mt-1 flex flex-wrap items-center gap-1">
            {onToggleEventSelection ? (
              <Button
                aria-label={`${selectedForBulk ? "Remove" : "Add"} ${event.title} from selected events`}
                className="h-6 px-2 text-[0.68rem]"
                onClick={(buttonEvent) => {
                  buttonEvent.stopPropagation();
                  onToggleEventSelection(event);
                }}
                size="sm"
                variant={selectedForBulk ? "secondary" : "outline"}
              >
                {selectedForBulk ? "Selected" : "Select"}
              </Button>
            ) : null}
            {canResizeStart ? (
              <Button
                aria-label={`Move ${event.title} start earlier one day`}
                className="h-6 px-2 text-[0.68rem]"
                onClick={(buttonEvent) => {
                  buttonEvent.stopPropagation();
                  onEventResize(event, "start", -1);
                }}
                size="sm"
                variant="outline"
              >
                Start -1d
              </Button>
            ) : null}
            {canResizeEnd ? (
              <Button
                aria-label={`Move ${event.title} end later one day`}
                className="h-6 px-2 text-[0.68rem]"
                onClick={(buttonEvent) => {
                  buttonEvent.stopPropagation();
                  onEventResize(event, "end", 1);
                }}
                size="sm"
                variant="outline"
              >
                End +1d
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>
      {domain && source && surface ? (
        <div
          onClick={(clickEvent) => {
            clickEvent.stopPropagation();
          }}
        >
          <CalendarOverflowMenu
            actions={actions}
            context={{ event: domain, source, surface, timeframe }}
            label={event.title}
            target="event"
          />
        </div>
      ) : null}
    </div>
  );
  if (!domain || !source || !surface) return content;
  return (
    <CalendarContextMenu
      actions={actions}
      context={{ event: domain, source, surface, timeframe }}
      label={event.title}
      target="event"
    >
      {content}
    </CalendarContextMenu>
  );
}

interface CalendarBoardProps {
  actions: CalendarAction[];
  getColorClasses: (color: string) => EventColor;
  onDrop: (date: Date, hour?: number) => void;
  onEventResize: (event: Event, edge: "start" | "end", dayDelta: number) => void;
  onEventSelect?: (event: Event) => void;
  onSelectDate: (date: Date) => void;
  onToggleEventSelection?: (event: Event) => void;
  selectedDate?: string;
  selectedEventId?: string;
  selectedEventIds: string[];
  setDraggedEvent: (event: Event | null) => void;
  source?: CalendarSourceSummary;
  surface?: CalendarSurface;
  timeframe: CalendarTimeframe;
}

function EmptyLane() {
  return (
    <div className="rounded-md border border-dashed p-3 text-muted-foreground text-xs">
      Nothing scheduled in this lane.
    </div>
  );
}

function normalizeView(view: EventManagerView): EventManagerView {
  return view === "list" ? "agenda" : view;
}

function timeframeFromView(view: EventManagerView): CalendarTimeframe {
  return view === "list" ? "agenda" : view;
}

function viewLabel(view: EventManagerView): string {
  if (view === "list") return "Agenda";
  return view.charAt(0).toUpperCase() + view.slice(1);
}

function viewIcon(view: EventManagerView) {
  if (view === "day") return <Clock className="size-4" />;
  if (view === "week") return <Grid3x3 className="size-4" />;
  if (view === "agenda" || view === "list") return <List className="size-4" />;
  return <CalendarIcon className="size-4" />;
}

function viewTitle(view: EventManagerView, date: Date): string {
  if (view === "day") {
    return date.toLocaleDateString(undefined, {
      day: "numeric",
      month: "long",
      weekday: "long",
      year: "numeric",
    });
  }
  if (view === "week") {
    return `Week of ${startOfWeek(date).toLocaleDateString(undefined, {
      day: "numeric",
      month: "long",
    })}`;
  }
  if (view === "quarter") {
    const quarter = Math.floor(date.getMonth() / 3) + 1;
    return `Q${quarter} ${date.getFullYear()}`;
  }
  if (view === "agenda" || view === "list") {
    return "Calendar agenda";
  }
  return date.toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
  });
}

function dateKey(date: Date): string {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function dateFromKey(key: string): Date {
  const [year, month, day] = key.split("-").map(Number);
  return new Date(year, (month ?? 1) - 1, day ?? 1);
}

function startOfWeek(date: Date): Date {
  const start = new Date(date);
  const day = (start.getDay() + 6) % 7;
  start.setDate(start.getDate() - day);
  start.setHours(0, 0, 0, 0);
  return start;
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function weekDays(date: Date): Date[] {
  const start = startOfWeek(date);
  return Array.from({ length: 7 }, (_, index) => addDays(start, index));
}

function monthGridDays(date: Date): Date[] {
  const first = new Date(date.getFullYear(), date.getMonth(), 1);
  const start = startOfWeek(first);
  return Array.from({ length: 42 }, (_, index) => addDays(start, index));
}

function monthDays(date: Date): Date[] {
  const count = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  return Array.from(
    { length: count },
    (_, index) => new Date(date.getFullYear(), date.getMonth(), index + 1),
  );
}

function isToday(date: Date): boolean {
  return dateKey(date) === dateKey(new Date());
}

function eventTouchesDay(event: Event, date: Date): boolean {
  const key = dateKey(date);
  if (isBoundaryOnlyEvent(event)) {
    return key === dateKey(event.startTime) || key === dateKey(event.endTime);
  }
  return dateKey(event.startTime) <= key && dateKey(event.endTime) >= key;
}

function spansMultipleDays(event: Event): boolean {
  return dateKey(event.startTime) !== dateKey(event.endTime);
}

function groupManagedEventsByDate(events: Event[]): Map<string, Event[]> {
  const map = new Map<string, Event[]>();
  for (const event of events) {
    for (const key of displayDateKeysForEvent(event)) {
      const current = map.get(key) ?? [];
      current.push(markEventForDate(event, key));
      map.set(key, current);
    }
  }
  for (const [key, dayEvents] of map) {
    map.set(
      key,
      dayEvents.sort(
        (left, right) =>
          left.startTime.getTime() - right.startTime.getTime() ||
          left.title.localeCompare(right.title),
      ),
    );
  }
  return map;
}

function displayEventsForDay(events: Event[], date: Date): Event[] {
  const key = dateKey(date);
  return events
    .filter((event) => eventTouchesDay(event, date))
    .map((event) => markEventForDate(event, key))
    .sort(
      (left, right) =>
        left.startTime.getTime() - right.startTime.getTime() ||
        left.title.localeCompare(right.title),
    );
}

function displayDateKeysForEvent(event: Event): string[] {
  const startKey = dateKey(event.startTime);
  const endKey = dateKey(event.endTime);
  if (isBoundaryOnlyEvent(event)) {
    return startKey === endKey ? [startKey] : [startKey, endKey];
  }
  const keys: string[] = [];
  let cursor = dateFromKey(startKey);
  while (dateKey(cursor) <= endKey) {
    keys.push(dateKey(cursor));
    cursor = addDays(cursor, 1);
  }
  return keys;
}

function isBoundaryOnlyEvent(event: Event): boolean {
  return (
    event.drawFlowEvent?.kind === "milestone" ||
    event.drawFlowEvent?.kind === "submilestone"
  );
}

function markEventForDate(event: Event, key: string): Event {
  if (!isBoundaryOnlyEvent(event)) return event;
  const startKey = dateKey(event.startTime);
  const endKey = dateKey(event.endTime);
  if (startKey === endKey && key === startKey) {
    return { ...event, dateMarker: "startEnd" };
  }
  if (key === startKey) {
    return { ...event, dateMarker: "start" };
  }
  if (key === endKey) {
    return { ...event, dateMarker: "end" };
  }
  return event;
}

function formatHour(hour: number): string {
  return new Date(2026, 0, 1, hour).toLocaleTimeString(undefined, {
    hour: "numeric",
  });
}

function formatEventTime(event: Event): string {
  const domain = event.drawFlowEvent;
  if (domain?.allDay) {
    return timeBucketLabel(domain.timeBucket);
  }
  const start = event.startTime.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: event.startTime.getMinutes() ? "2-digit" : undefined,
  });
  const end = event.endTime.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: event.endTime.getMinutes() ? "2-digit" : undefined,
  });
  return `${start} - ${end}`;
}

function dateMarkerLabel(marker: NonNullable<Event["dateMarker"]>): string {
  if (marker === "startEnd") return "Start/end";
  return marker === "start" ? "Start" : "End";
}

function timeBucketLabel(bucket: DrawFlowCalendarEvent["timeBucket"]): string {
  const labels: Record<DrawFlowCalendarEvent["timeBucket"], string> = {
    afternoon: "Afternoon",
    allDay: "All day",
    earlyMorning: "Early",
    endOfDay: "End of day",
    evening: "Evening",
    midday: "Midday",
    morning: "Morning",
    unscheduled: "Unscheduled",
  };
  return labels[bucket];
}
