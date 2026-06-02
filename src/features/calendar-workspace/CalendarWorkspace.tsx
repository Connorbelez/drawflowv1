"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CalendarClock,
  Download,
  ExternalLink,
  Filter,
  Loader2,
  Search,
  Wifi,
} from "lucide-react";
import { toast } from "sonner";

import {
  EventManager,
  type Event as ManagedCalendarEvent,
  type EventManagerView,
} from "#/components/ui/event-manager.tsx";
import { Badge } from "#/components/ui/badge.tsx";
import { Button } from "#/components/ui/button.tsx";
import { Card, CardContent, CardHeader, CardTitle } from "#/components/ui/card.tsx";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "#/components/ui/dialog.tsx";
import { Frame, FramePanel } from "#/components/ui/frame.tsx";
import { Input } from "#/components/ui/input.tsx";
import { Label } from "#/components/ui/label.tsx";
import { Textarea } from "#/components/ui/textarea.tsx";
import { CalendarAgendaRail } from "./CalendarAgendaRail";
import { CalendarOverflowMenu } from "./CalendarContextMenu";
import { CalendarEventDetailDrawer } from "./CalendarEventDetailDrawer";
import {
  applyCalendarFilters,
  buildIcsForEvents,
  downloadTextFile,
  eventNeedsAction,
  normalizeCalendarEvents,
} from "./calendarEventProjection";
import type {
  CalendarAction,
  CalendarActionContext,
  CalendarEditRequest,
  CalendarFilters,
  CalendarSavedView,
  CalendarSyncSubscriptionResult,
  CalendarTimeframe,
  DrawFlowCalendarEvent,
  DrawFlowCalendarWorkspaceData,
} from "./calendarTypes";

export interface CalendarWorkspaceProps {
  actions?: CalendarAction[];
  className?: string;
  initialTimeframe?: CalendarTimeframe;
  onCommitEdit?: (request: CalendarEditRequest) => Promise<unknown> | unknown;
  onCreateSyncSubscription?: (input: {
    direction: "bidirectional" | "outbound";
    filters: CalendarFilters;
    provider: "google" | "ics" | "outlook";
    surface: DrawFlowCalendarWorkspaceData["surface"];
  }) => Promise<CalendarSyncSubscriptionResult> | CalendarSyncSubscriptionResult | void;
  onRecordExternalSyncChange?: (input: {
    changeKey: string;
    externalEventId?: string;
    payload: unknown;
    provider: "google" | "ics" | "outlook";
    subscriptionKey?: string;
  }) => Promise<unknown> | unknown;
  onSaveView?: (input: {
    filters: CalendarFilters;
    isDefault?: boolean;
    label: string;
    timeframe: CalendarTimeframe;
    viewKey: string;
  }) => Promise<unknown> | unknown;
  onTimeframeChange?: (timeframe: CalendarTimeframe) => void;
  workspace?: DrawFlowCalendarWorkspaceData | null;
}

export function CalendarWorkspace({
  actions = [],
  className,
  initialTimeframe,
  onCommitEdit,
  onCreateSyncSubscription,
  onRecordExternalSyncChange,
  onSaveView,
  onTimeframeChange,
  workspace,
}: CalendarWorkspaceProps) {
  const [timeframe, setTimeframe] = useState<CalendarTimeframe>(
    initialTimeframe ?? workspace?.defaultTimeframe ?? "month",
  );
  const [filters, setFilters] = useState<CalendarFilters>({});
  const [selectedDate, setSelectedDate] = useState<string | undefined>();
  const [selectedEventId, setSelectedEventId] = useState<string | undefined>();
  const [selectedEventIds, setSelectedEventIds] = useState<string[]>([]);
  const [pendingEdit, setPendingEdit] = useState<CalendarEditRequest | null>(null);
  const [pendingBulkMove, setPendingBulkMove] = useState<{
    dayDelta: number;
    events: DrawFlowCalendarEvent[];
  } | null>(null);
  const [reason, setReason] = useState("");
  const [syncFeedUrl, setSyncFeedUrl] = useState<string | null>(null);
  const [syncBusy, setSyncBusy] = useState<string | null>(null);

  useEffect(() => {
    if (initialTimeframe) {
      setTimeframe(initialTimeframe);
    }
  }, [initialTimeframe]);

  useEffect(() => {
    if (
      !initialTimeframe &&
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function"
    ) {
      const mobile = window.matchMedia("(max-width: 640px)").matches;
      if (mobile) {
        setTimeframe("agenda");
      }
    }
  }, [initialTimeframe]);

  const normalizedWorkspace = useMemo(() => {
    if (!workspace) return workspace;
    return {
      ...workspace,
      events: normalizeCalendarEvents(workspace.events),
      warnings: (workspace.warnings ?? []).map((warning) =>
        typeof warning === "string" ? { label: warning } : warning,
      ),
    };
  }, [workspace]);

  const filteredEvents = useMemo(
    () =>
      normalizedWorkspace
        ? applyCalendarFilters(normalizedWorkspace.events, filters)
        : [],
    [filters, normalizedWorkspace],
  );
  const managedEvents = useMemo(
    () => filteredEvents.map(drawFlowEventToManagedEvent),
    [filteredEvents],
  );
  const selectedEvent = useMemo(
    () =>
      normalizedWorkspace?.events.find((event) => event.id === selectedEventId) ??
      null,
    [normalizedWorkspace, selectedEventId],
  );
  const selectedEvents = useMemo(
    () =>
      normalizedWorkspace?.events.filter((event) =>
        selectedEventIds.includes(event.id),
      ) ?? [],
    [normalizedWorkspace, selectedEventIds],
  );

  const setTimeframeControlled = useCallback(
    (next: CalendarTimeframe) => {
      setTimeframe(next);
      onTimeframeChange?.(next);
    },
    [onTimeframeChange],
  );

  const defaultActions = useMemo(
    () =>
      normalizedWorkspace
        ? buildDefaultCalendarActions({
            exportEvents: (events, filename) =>
              downloadTextFile(
                filename,
                buildIcsForEvents(events, normalizedWorkspace.source.title),
              ),
            onBulkMove: (events, dayDelta) =>
              setPendingBulkMove({ dayDelta, events }),
            onOpen: (event) => setSelectedEventId(event.id),
            source: normalizedWorkspace.source,
          })
        : [],
    [normalizedWorkspace],
  );
  const allActions = useMemo(
    () => [...defaultActions, ...actions],
    [actions, defaultActions],
  );

  if (normalizedWorkspace === undefined) {
    return (
      <Frame className={className} data-testid="calendar-workspace-loading">
        <FramePanel className="grid min-h-[32rem] place-items-center p-6 text-muted-foreground text-sm">
          <span className="inline-flex items-center gap-2">
            <Loader2 className="size-4 animate-spin" />
            Loading DrawFlow calendar workspace...
          </span>
        </FramePanel>
      </Frame>
    );
  }

  if (!normalizedWorkspace) {
    return (
      <Frame className={className} data-testid="calendar-workspace-empty">
        <FramePanel className="p-6">
          <p className="font-medium">Calendar unavailable</p>
          <p className="mt-1 text-muted-foreground text-sm">
            No scoped calendar workspace was returned for this route.
          </p>
        </FramePanel>
      </Frame>
    );
  }

  const needsReason =
    pendingEdit?.event.editable.requiredReason &&
    pendingEdit.event.editable.requiredReason !== "none";
  const needsBulkReason = pendingBulkMove?.events.some(
    (event) => event.editable.requiredReason && event.editable.requiredReason !== "none",
  );

  return (
    <div className={className} data-testid="calendar-workspace">
      <div className="grid min-h-[calc(100dvh-12rem)] gap-3 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="flex min-w-0 flex-col gap-3">
          <CalendarWorkspaceToolbar
            actions={allActions}
            events={filteredEvents}
            filters={filters}
            onCreateSyncSubscription={async (provider) => {
              if (!onCreateSyncSubscription) {
                toast.info("Calendar sync is not configured for this route.");
                return;
              }
              setSyncBusy(provider);
              try {
                const result = await onCreateSyncSubscription({
                  direction: provider === "ics" ? "outbound" : "bidirectional",
                  filters,
                  provider,
                  surface: normalizedWorkspace.surface,
                });
                if (result?.feedUrl) {
                  setSyncFeedUrl(result.feedUrl);
                  toast.success("Calendar subscription created.");
                }
              } catch (error) {
                toast.error(
                  error instanceof Error
                    ? error.message
                    : "Calendar sync setup failed.",
                );
              } finally {
                setSyncBusy(null);
              }
            }}
            onExport={() =>
              downloadTextFile(
                `${normalizedWorkspace.surface}-calendar.ics`,
                buildIcsForEvents(filteredEvents, normalizedWorkspace.source.title),
              )
            }
            onRecordInbound={async () => {
              if (!onRecordExternalSyncChange) {
                toast.info("Inbound reconciliation is not configured for this route.");
                return;
              }
              await onRecordExternalSyncChange({
                changeKey: `manual_reconcile_${Date.now()}`,
                payload: {
                  reason: "Manual calendar reconciliation check from calendar workspace.",
                },
                provider: "google",
                subscriptionKey: undefined,
              });
              toast.success("Inbound sync change queued for review.");
            }}
            onSaveView={async () => {
              const label = `Saved ${timeframe} view`;
              await onSaveView?.({
                filters,
                label,
                timeframe,
                viewKey: `${normalizedWorkspace.surface}-${timeframe}-${Date.now()}`,
              });
              toast.success("Calendar view saved.");
            }}
            onSetFilters={setFilters}
            savedViews={normalizedWorkspace.savedViews}
            selectedCount={selectedEvents.length}
            selectedEvents={selectedEvents}
            source={normalizedWorkspace.source}
            surface={normalizedWorkspace.surface}
            syncBusy={syncBusy}
            syncFeedUrl={syncFeedUrl}
            timeframe={timeframe}
            warnings={normalizedWorkspace.warnings.length}
          />

          <Frame className="min-h-0 flex-1">
            <FramePanel className="min-h-0 flex-1 overflow-hidden p-0">
              <EventManager
                actions={allActions}
                allowCreate={false}
                availableTags={calendarManagerTags(filteredEvents)}
                availableViews={normalizedWorkspace.timeframes}
                categories={calendarManagerCategories(filteredEvents)}
                className="min-h-[calc(100dvh-17rem)]"
                eventLabel="calendar event"
                events={managedEvents}
                onEventMove={(event, next) =>
                  event.drawFlowEvent
                    ? setPendingEdit({
                        changeType: "move",
                        event: event.drawFlowEvent,
                        nextEndsAt: calendarIsoFromManagedDate(next.endTime),
                        nextStartsAt: calendarIsoFromManagedDate(next.startTime),
                        priorEndsAt: event.drawFlowEvent.endsAt,
                        priorStartsAt: event.drawFlowEvent.startsAt,
                      })
                    : undefined
                }
                onEventResize={(event, next) =>
                  event.drawFlowEvent
                    ? setPendingEdit({
                        changeType: next.edge === "start" ? "resizeStart" : "resizeEnd",
                        event: event.drawFlowEvent,
                        nextEndsAt: calendarIsoFromManagedDate(next.endTime),
                        nextStartsAt: calendarIsoFromManagedDate(next.startTime),
                        priorEndsAt: event.drawFlowEvent.endsAt,
                        priorStartsAt: event.drawFlowEvent.startsAt,
                      })
                    : undefined
                }
                onSelectDate={setSelectedDate}
                onEventSelect={(event) => setSelectedEventId(event.id)}
                onViewChange={(view) =>
                  setTimeframeControlled(calendarTimeframeFromManagerView(view))
                }
                onToggleEventSelection={(event) =>
                  setSelectedEventIds((current) =>
                    current.includes(event.id)
                      ? current.filter((id) => id !== event.id)
                      : [...current, event.id],
                  )
                }
                selectedDate={selectedDate}
                selectedEventId={selectedEventId}
                selectedEventIds={selectedEventIds}
                source={normalizedWorkspace.source}
                surface={normalizedWorkspace.surface}
                view={calendarManagerViewFromTimeframe(timeframe)}
              />
            </FramePanel>
          </Frame>
        </div>

        <CalendarAgendaRail
          actions={allActions}
          className="min-h-[24rem] xl:min-h-0"
          events={filteredEvents}
          onSelectEvent={(event) => setSelectedEventId(event.id)}
          selectedEventId={selectedEventId}
          source={normalizedWorkspace.source}
          surface={normalizedWorkspace.surface}
          timeframe={timeframe}
        />
      </div>

      <CalendarEventDetailDrawer
        actions={allActions}
        event={selectedEvent}
        onClose={() => setSelectedEventId(undefined)}
        onRequestEdit={(request) => {
          setPendingEdit(request);
          setReason(request.reason ?? "");
        }}
        source={normalizedWorkspace.source}
        surface={normalizedWorkspace.surface}
        timeframe={timeframe}
      />

      <Dialog
        onOpenChange={(open) => {
          if (!open) {
            setPendingEdit(null);
            setReason("");
          }
        }}
        open={Boolean(pendingEdit)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Preview schedule impact</DialogTitle>
            <DialogDescription>
              Calendar edits commit through DrawFlow workflow mutations and audit
              rules.
            </DialogDescription>
          </DialogHeader>
          {pendingEdit ? (
            <div className="grid gap-3 text-sm">
              <ImpactCard request={pendingEdit} />
              {needsReason ? (
                <div className="grid gap-1.5">
                  <Label htmlFor="calendar-impact-reason">Audit reason</Label>
                  <Textarea
                    id="calendar-impact-reason"
                    onChange={(event) => setReason(event.target.value)}
                    placeholder="Record the reason before committing this calendar change."
                    value={reason}
                  />
                </div>
              ) : null}
            </div>
          ) : null}
          <DialogFooter>
            <Button
              onClick={() => {
                setPendingEdit(null);
                setReason("");
              }}
              variant="outline"
            >
              Cancel
            </Button>
            <Button
              disabled={Boolean(needsReason && !reason.trim())}
              onClick={async () => {
                if (!pendingEdit) return;
                try {
                  await onCommitEdit?.({
                    ...pendingEdit,
                    reason: reason.trim() || pendingEdit.reason,
                  });
                  toast.success("Calendar schedule updated.");
                  setPendingEdit(null);
                  setReason("");
                } catch (error) {
                  toast.error(
                    error instanceof Error
                      ? error.message
                      : "Calendar schedule edit failed.",
                  );
                }
              }}
            >
              Commit edit
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        onOpenChange={(open) => {
          if (!open) {
            setPendingBulkMove(null);
            setReason("");
          }
        }}
        open={Boolean(pendingBulkMove)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Preview bulk move</DialogTitle>
            <DialogDescription>
              Each selected event is validated against its edit capability before
              commit.
            </DialogDescription>
          </DialogHeader>
          {pendingBulkMove ? (
            <div className="grid gap-3">
              <div className="max-h-56 overflow-y-auto rounded-md border p-3 text-sm">
                {pendingBulkMove.events.map((event) => (
                  <div className="flex items-center justify-between gap-2 border-b py-2 last:border-b-0" key={event.id}>
                    <span className="min-w-0 truncate">{event.title}</span>
                    <Badge variant={event.editable.canMove ? "outline" : "secondary"}>
                      {event.editable.canMove ? "Included" : "Excluded"}
                    </Badge>
                  </div>
                ))}
              </div>
              {needsBulkReason ? (
                <div className="grid gap-1.5">
                  <Label htmlFor="calendar-bulk-reason">Audit reason</Label>
                  <Textarea
                    id="calendar-bulk-reason"
                    onChange={(event) => setReason(event.target.value)}
                    value={reason}
                  />
                </div>
              ) : null}
            </div>
          ) : null}
          <DialogFooter>
            <Button
              onClick={() => {
                setPendingBulkMove(null);
                setReason("");
              }}
              variant="outline"
            >
              Cancel
            </Button>
            <Button
              disabled={Boolean(needsBulkReason && !reason.trim())}
              onClick={async () => {
                if (!pendingBulkMove) return;
                try {
                  for (const event of pendingBulkMove.events) {
                    if (!event.editable.canMove) continue;
                    await onCommitEdit?.({
                      changeType: "bulkMove",
                      event,
                      events: pendingBulkMove.events,
                      nextEndsAt: event.endsAt
                        ? shiftIso(event.endsAt, pendingBulkMove.dayDelta)
                        : undefined,
                      nextStartsAt: shiftIso(event.startsAt, pendingBulkMove.dayDelta),
                      priorEndsAt: event.endsAt,
                      priorStartsAt: event.startsAt,
                      reason: reason.trim() || undefined,
                    });
                  }
                  toast.success("Bulk calendar move committed.");
                  setPendingBulkMove(null);
                  setSelectedEventIds([]);
                  setReason("");
                } catch (error) {
                  toast.error(
                    error instanceof Error
                      ? error.message
                      : "Bulk calendar move failed.",
                  );
                }
              }}
            >
              Move selected
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function drawFlowEventToManagedEvent(
  event: DrawFlowCalendarEvent,
): ManagedCalendarEvent {
  const { endTime, startTime } = managedDateRangeFromCalendarEvent(event);
  return {
    category: `${event.kind} / ${event.status}`,
    color: calendarColorForEvent(event),
    description: event.subtitle,
    drawFlowEvent: event,
    endTime,
    id: event.id,
    startTime,
    tags: [
      calendarTimeBucketLabel(event.timeBucket),
      event.status,
      ...event.warnings.map((warning) => warning.label),
    ],
    title: event.title,
  };
}

function managedDateRangeFromCalendarEvent(event: DrawFlowCalendarEvent): {
  endTime: Date;
  startTime: Date;
} {
  const startTime = managedDateFromCalendarValue(
    event.startsAt,
    event.timeBucket,
    "start",
  );
  let endTime = managedDateFromCalendarValue(
    event.endsAt ?? event.startsAt,
    event.timeBucket,
    "end",
  );
  if (!event.endsAt && !event.allDay) {
    endTime = new Date(startTime);
    endTime.setHours(startTime.getHours() + 1, 0, 0, 0);
  }
  if (endTime <= startTime) {
    endTime = new Date(startTime.getTime() + 60 * 60 * 1000);
  }
  return { endTime, startTime };
}

function managedDateFromCalendarValue(
  value: string,
  bucket: DrawFlowCalendarEvent["timeBucket"],
  edge: "end" | "start",
): Date {
  if (value.includes("T")) {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed;
    }
  }
  const [year, month, day] = value.slice(0, 10).split("-").map(Number);
  const date = new Date(year, (month ?? 1) - 1, day ?? 1);
  date.setHours(calendarBucketHour(bucket, edge), 0, 0, 0);
  return date;
}

function calendarBucketHour(
  bucket: DrawFlowCalendarEvent["timeBucket"],
  edge: "end" | "start",
): number {
  const startHours: Record<DrawFlowCalendarEvent["timeBucket"], number> = {
    afternoon: 14,
    allDay: 8,
    earlyMorning: 7,
    endOfDay: 17,
    evening: 19,
    midday: 12,
    morning: 9,
    unscheduled: 8,
  };
  const endHours: Record<DrawFlowCalendarEvent["timeBucket"], number> = {
    afternoon: 17,
    allDay: 17,
    earlyMorning: 9,
    endOfDay: 18,
    evening: 20,
    midday: 14,
    morning: 11,
    unscheduled: 17,
  };
  return edge === "start" ? startHours[bucket] : endHours[bucket];
}

function calendarIsoFromManagedDate(date: Date): string {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function calendarManagerViewFromTimeframe(
  timeframe: CalendarTimeframe,
): EventManagerView {
  return timeframe;
}

function calendarTimeframeFromManagerView(
  view: EventManagerView,
): CalendarTimeframe {
  return view === "list" ? "agenda" : view;
}

function calendarManagerCategories(
  events: DrawFlowCalendarEvent[],
): string[] {
  return Array.from(new Set(events.map((event) => `${event.kind} / ${event.status}`)));
}

function calendarManagerTags(events: DrawFlowCalendarEvent[]): string[] {
  return Array.from(
    new Set(
      events.flatMap((event) => [
        calendarTimeBucketLabel(event.timeBucket),
        event.status,
        event.kind,
        ...event.warnings.map((warning) => warning.label),
      ]),
    ),
  );
}

function calendarColorForEvent(event: DrawFlowCalendarEvent): string {
  if (event.status === "blocked" || event.status === "overdue") return "red";
  if (event.kind === "draw" || event.kind === "drawGroup") return "emerald";
  if (event.kind === "workingCapital" || event.kind === "loan") return "emerald";
  if (event.kind === "siteVisit") return "cyan";
  if (event.kind === "review" || event.kind === "adminDecision") return "violet";
  if (event.kind === "evidence" || event.warnings.length > 0) return "amber";
  if (event.kind === "budgetRevision") return "slate";
  if (event.kind === "contractor") return "rose";
  return "blue";
}

function calendarTimeBucketLabel(
  bucket: DrawFlowCalendarEvent["timeBucket"],
): string {
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

function CalendarWorkspaceToolbar({
  events,
  filters,
  actions,
  onCreateSyncSubscription,
  onExport,
  onRecordInbound,
  onSaveView,
  onSetFilters,
  savedViews,
  selectedCount,
  selectedEvents,
  source,
  surface,
  syncBusy,
  syncFeedUrl,
  timeframe,
  warnings,
}: {
  actions: CalendarAction[];
  events: DrawFlowCalendarEvent[];
  filters: CalendarFilters;
  onCreateSyncSubscription: (provider: "google" | "ics" | "outlook") => void;
  onExport: () => void;
  onRecordInbound: () => void;
  onSaveView: () => void;
  onSetFilters: (filters: CalendarFilters) => void;
  savedViews: CalendarSavedView[];
  selectedCount: number;
  selectedEvents: DrawFlowCalendarEvent[];
  source: DrawFlowCalendarWorkspaceData["source"];
  surface: DrawFlowCalendarWorkspaceData["surface"];
  syncBusy: string | null;
  syncFeedUrl: string | null;
  timeframe: CalendarTimeframe;
  warnings: number;
}) {
  return (
    <Frame>
      <FramePanel className="grid gap-3 p-3">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <Badge variant="outline">{timeframe}</Badge>
            <Badge variant={warnings > 0 ? "secondary" : "outline"}>
              {warnings} warnings
            </Badge>
            <Badge variant="outline">{events.filter(eventNeedsAction).length} needs action</Badge>
            {selectedCount > 0 ? (
              <span className="inline-flex items-center gap-1">
                <Badge>{selectedCount} selected</Badge>
                <CalendarOverflowMenu
                  actions={actions}
                  context={{
                    events: selectedEvents,
                    source,
                    surface,
                    timeframe,
                  }}
                  label="Selected events"
                  target="selection"
                />
              </span>
            ) : null}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={onExport} size="sm" variant="outline">
              <Download />
              Export ICS
            </Button>
            {(["ics", "google", "outlook"] as const).map((provider) => (
              <Button
                disabled={syncBusy !== null}
                key={provider}
                onClick={() => onCreateSyncSubscription(provider)}
                size="sm"
                variant="outline"
              >
                {syncBusy === provider ? (
                  <Loader2 className="animate-spin" />
                ) : (
                  <Wifi />
                )}
                {provider.toUpperCase()}
              </Button>
            ))}
            <Button onClick={onRecordInbound} size="sm" variant="outline">
              <CalendarClock />
              Reconcile inbound
            </Button>
            <Button onClick={onSaveView} size="sm" variant="outline">
              <Filter />
              Save view
            </Button>
          </div>
        </div>
        <div className="grid gap-2 lg:grid-cols-[minmax(14rem,22rem)_1fr] lg:items-center">
          <div className="relative">
            <Search className="-translate-y-1/2 pointer-events-none absolute top-1/2 left-2.5 size-4 text-muted-foreground" />
            <Input
              className="pl-8"
              onChange={(event) =>
                onSetFilters({ ...filters, search: event.target.value })
              }
              placeholder="Search calendar"
              value={filters.search ?? ""}
            />
          </div>
          <div className="flex min-w-0 gap-2 overflow-x-auto">
            {savedViews.map((view) => (
              <Button
                className="shrink-0"
                key={view.id}
                onClick={() => onSetFilters(view.filters)}
                size="sm"
                variant={view.isDefault ? "secondary" : "outline"}
              >
                {view.label}
              </Button>
            ))}
            <Button
              className="shrink-0"
              onClick={() => onSetFilters({ ...filters, riskOnly: !filters.riskOnly })}
              size="sm"
              variant={filters.riskOnly ? "secondary" : "outline"}
            >
              Risk only
            </Button>
            <Button
              className="shrink-0"
              onClick={() => onSetFilters({ ...filters, editableOnly: !filters.editableOnly })}
              size="sm"
              variant={filters.editableOnly ? "secondary" : "outline"}
            >
              Editable
            </Button>
          </div>
        </div>
        {syncFeedUrl ? (
          <div className="flex items-center gap-2 rounded-md border bg-muted/40 p-2 text-xs">
            <ExternalLink className="size-3.5" />
            <span className="min-w-0 flex-1 truncate">{syncFeedUrl}</span>
          </div>
        ) : null}
      </FramePanel>
    </Frame>
  );
}

function ImpactCard({ request }: { request: CalendarEditRequest }) {
  const event = request.event;
  return (
    <Card>
      <CardHeader className="p-4 pb-2">
        <CardTitle className="text-sm">{event.title}</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-2 p-4 pt-0 text-sm">
        <div className="grid grid-cols-[8rem_1fr] gap-2">
          <span className="text-muted-foreground">Prior</span>
          <span>
            {request.priorStartsAt}
            {request.priorEndsAt ? ` to ${request.priorEndsAt}` : ""}
          </span>
        </div>
        <div className="grid grid-cols-[8rem_1fr] gap-2">
          <span className="text-muted-foreground">Next</span>
          <span>
            {request.nextStartsAt}
            {request.nextEndsAt ? ` to ${request.nextEndsAt}` : ""}
          </span>
        </div>
        <div className="grid grid-cols-[8rem_1fr] gap-2">
          <span className="text-muted-foreground">Affected</span>
          <span>
            Milestone dates, draw timing, site visit/review/admin targets, and
            working-capital exposure are re-projected after commit.
          </span>
        </div>
        {event.warnings.length > 0 ? (
          <div className="grid grid-cols-[8rem_1fr] gap-2">
            <span className="text-muted-foreground">Warnings</span>
            <span>{event.warnings.map((warning) => warning.label).join(", ")}</span>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function buildDefaultCalendarActions(input: {
  exportEvents: (events: DrawFlowCalendarEvent[], filename: string) => void;
  onBulkMove: (events: DrawFlowCalendarEvent[], dayDelta: number) => void;
  onOpen: (event: DrawFlowCalendarEvent) => void;
  source: DrawFlowCalendarWorkspaceData["source"];
}): CalendarAction[] {
  return [
    {
      appliesTo: "event",
      availability: { state: "enabled" },
      description: "Open the shared detail drawer.",
      id: "open-event-detail",
      label: "Open detail",
      onSelect: (context: CalendarActionContext) => {
        if (context.event) input.onOpen(context.event);
      },
      requiresConfirmation: false,
      requiresReason: false,
    },
    {
      appliesTo: "event",
      availability: { state: "enabled" },
      description: "Copy an event deep link.",
      id: "copy-event-link",
      label: "Copy link",
      onSelect: async (context) => {
        const link = `${window.location.origin}${window.location.pathname}?calendarEvent=${context.event?.id ?? ""}`;
        await navigator.clipboard?.writeText(link);
        toast.success("Calendar event link copied.");
      },
      requiresConfirmation: false,
      requiresReason: false,
    },
    {
      appliesTo: "event",
      availability: { state: "enabled" },
      description: "Export this event as ICS.",
      id: "export-event-ics",
      label: "Export event",
      onSelect: (context) => {
        if (context.event) {
          input.exportEvents([context.event], `${context.event.id}.ics`);
        }
      },
      requiresConfirmation: false,
      requiresReason: false,
    },
    {
      appliesTo: "selection",
      availability: { state: "enabled" },
      description: "Export selected calendar events.",
      id: "export-selected-events",
      label: "Export selected",
      onSelect: (context) => {
        input.exportEvents(context.events ?? [], `${input.source.id}-selected.ics`);
      },
      requiresConfirmation: false,
      requiresReason: false,
    },
    {
      appliesTo: "selection",
      availability: { state: "enabled" },
      description: "Move selected editable events forward one day.",
      id: "bulk-move-selected-plus-one",
      label: "Move selected +1 day",
      onSelect: (context) => {
        input.onBulkMove(context.events ?? [], 1);
      },
      requiresConfirmation: true,
      requiresReason: true,
    },
  ];
}

function shiftIso(iso: string, days: number) {
  const date = new Date(`${iso.slice(0, 10)}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}
