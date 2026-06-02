"use client";

import { AlertTriangle, CalendarClock, CheckSquare, CircleDollarSign } from "lucide-react";

import { Badge } from "#/components/ui/badge.tsx";
import { Card, CardContent, CardHeader, CardTitle } from "#/components/ui/card.tsx";
import { cn } from "#/lib/utils.ts";
import { CalendarOverflowMenu } from "./CalendarContextMenu";
import {
  bucketLabel,
  eventIsCapitalAffecting,
  eventNeedsAction,
  formatCentsCompact,
  formatDateRange,
  groupedByBucket,
  groupEventsByDate,
} from "./calendarEventProjection";
import type {
  CalendarAction,
  CalendarSourceSummary,
  CalendarSurface,
  CalendarTimeframe,
  DrawFlowCalendarEvent,
} from "./calendarTypes";

export function CalendarAgendaRail({
  actions,
  className,
  events,
  onSelectEvent,
  selectedEventId,
  source,
  surface,
  timeframe,
}: {
  actions: CalendarAction[];
  className?: string;
  events: DrawFlowCalendarEvent[];
  onSelectEvent: (event: DrawFlowCalendarEvent) => void;
  selectedEventId?: string;
  source: CalendarSourceSummary;
  surface: CalendarSurface;
  timeframe: CalendarTimeframe;
}) {
  const byDate = groupEventsByDate(events);
  const sortedDates = [...byDate.keys()].sort();

  return (
    <aside
      className={cn("flex min-h-0 flex-col gap-3", className)}
      data-testid="calendar-agenda-rail"
    >
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="font-medium text-sm">Agenda</p>
          <p className="text-muted-foreground text-xs">
            Today, upcoming, overdue, and unscheduled work.
          </p>
        </div>
        <Badge variant="outline">{events.length} events</Badge>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto pr-1">
        {sortedDates.length === 0 ? (
          <Card>
            <CardContent className="p-4 text-muted-foreground text-sm">
              No calendar events match the current filters.
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-3">
            {sortedDates.map((date) => (
              <Card key={date}>
                <CardHeader className="p-3 pb-2">
                  <CardTitle className="flex items-center justify-between gap-2 text-sm">
                    <span>{date}</span>
                    <Badge variant="outline">{byDate.get(date)?.length ?? 0}</Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent className="grid gap-2 p-3 pt-0">
                  {groupedByBucket(byDate.get(date) ?? []).map((group) => (
                    <div className="grid gap-1.5" key={group.bucket}>
                      <p className="text-muted-foreground text-[0.68rem] uppercase">
                        {bucketLabel(group.bucket)}
                      </p>
                      {group.events.map((event) => {
                        const amount = formatCentsCompact(event.metrics?.amountCents);
                        return (
                          <div
                            className={cn(
                              "grid w-full grid-cols-[auto_1fr_auto] items-start gap-2 rounded-md border bg-background/70 p-2 text-left text-xs transition hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                              selectedEventId === event.id && "border-primary bg-primary/5",
                            )}
                            data-testid={`calendar-agenda-event-${event.id}`}
                            key={`${date}-${event.id}`}
                            onKeyDown={(keyboardEvent) => {
                              if (keyboardEvent.key === "Enter") {
                                onSelectEvent(event);
                              }
                            }}
                            onClick={() => onSelectEvent(event)}
                            role="button"
                            tabIndex={0}
                          >
                            <EventGlyph event={event} />
                            <span className="min-w-0">
                              <span className="flex min-w-0 items-center gap-1.5">
                                <span className="truncate font-medium">
                                  {event.title}
                                </span>
                                <Badge className="shrink-0" variant="outline">
                                  {event.status}
                                </Badge>
                              </span>
                              <span className="mt-1 block truncate text-muted-foreground">
                                {event.subtitle ?? formatDateRange(event)}
                              </span>
                              {amount ? (
                                <span className="mt-1 block text-muted-foreground">
                                  {amount}
                                </span>
                              ) : null}
                            </span>
                            <CalendarOverflowMenu
                              actions={actions}
                              context={{
                                date,
                                event,
                                source,
                                surface,
                                timeframe,
                              }}
                              label={event.title}
                              target="event"
                            />
                          </div>
                        );
                      })}
                    </div>
                  ))}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </aside>
  );
}

function EventGlyph({ event }: { event: DrawFlowCalendarEvent }) {
  const className = cn(
    "mt-0.5 grid size-6 place-items-center rounded-md border text-muted-foreground",
    event.status === "blocked" || event.status === "overdue"
      ? "border-destructive/40 bg-destructive/10 text-destructive"
      : eventIsCapitalAffecting(event)
        ? "border-primary/40 bg-primary/10 text-primary"
        : eventNeedsAction(event)
          ? "border-amber-500/40 bg-amber-500/10 text-amber-700"
          : "bg-muted/60",
  );
  if (event.status === "blocked" || event.status === "overdue") {
    return <AlertTriangle className={className} />;
  }
  if (eventIsCapitalAffecting(event)) {
    return <CircleDollarSign className={className} />;
  }
  if (eventNeedsAction(event)) {
    return <CheckSquare className={className} />;
  }
  return <CalendarClock className={className} />;
}
