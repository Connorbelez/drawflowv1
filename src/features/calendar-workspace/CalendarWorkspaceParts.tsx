"use client";

import {
  CalendarClock,
  CalendarPlus,
  Download,
  ExternalLink,
  Filter,
  Loader2,
  Search,
  Wifi,
} from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Badge } from "#/components/ui/badge.tsx";
import { Button } from "#/components/ui/button.tsx";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "#/components/ui/card.tsx";
import { Checkbox } from "#/components/ui/checkbox.tsx";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "#/components/ui/dialog.tsx";
import type {
  EventManagerView,
  Event as ManagedCalendarEvent,
} from "#/components/ui/event-manager.tsx";
import { Frame, FramePanel } from "#/components/ui/frame.tsx";
import { Input } from "#/components/ui/input.tsx";
import { Label } from "#/components/ui/label.tsx";
import { Textarea } from "#/components/ui/textarea.tsx";
import { cn } from "#/lib/utils.ts";
import { CalendarOverflowMenu } from "./CalendarContextMenu";
import { eventNeedsAction } from "./calendarEventProjection";
import type {
  CalendarAction,
  CalendarActionContext,
  CalendarAssignableParticipant,
  CalendarEditRequest,
  CalendarFilters,
  CalendarReminderEventInput,
  CalendarSavedView,
  CalendarTimeframe,
  DrawFlowCalendarEvent,
  DrawFlowCalendarWorkspaceData,
} from "./calendarTypes";

const HTTP_URL_PATTERN = /^https?:\/\//i;

export function drawFlowEventToManagedEvent(
  event: DrawFlowCalendarEvent
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

export interface ReminderDraft {
  allDay: boolean;
  assignedParticipantKeys: string[];
  description: string;
  endsAt: string;
  eventId?: string;
  location: string;
  mode: "create" | "edit";
  startsAt: string;
  timezone: string;
  title: string;
}

export function emptyReminderDraft(startsAt: string): ReminderDraft {
  return {
    allDay: true,
    assignedParticipantKeys: [],
    description: "",
    endsAt: "",
    location: "",
    mode: "create",
    startsAt,
    timezone: "America/Toronto",
    title: "",
  };
}

export function reminderDraftFromEvent(
  event: DrawFlowCalendarEvent
): ReminderDraft {
  return {
    allDay: event.allDay,
    assignedParticipantKeys: (event.participants ?? []).map(
      (participant) => participant.key
    ),
    description: event.subtitle ?? "",
    endsAt: event.endsAt?.slice(0, 10) ?? "",
    eventId:
      event.entity.type === "calendarReminder" ? event.entity.id : undefined,
    location: event.location ?? "",
    mode: "edit",
    startsAt: event.startsAt.slice(0, 10),
    timezone: event.timezone,
    title: event.title,
  };
}

export function reminderPayloadFromDraft(
  draft: ReminderDraft,
  assignableParticipants: CalendarAssignableParticipant[]
): CalendarReminderEventInput {
  return {
    allDay: draft.allDay,
    assignedParticipants: assignableParticipants
      .filter((participant) =>
        draft.assignedParticipantKeys.includes(participant.key)
      )
      .map(({ key: _key, ...participant }) => participant),
    description: draft.description.trim() || undefined,
    endsAt: draft.endsAt || undefined,
    location: draft.location.trim() || undefined,
    startsAt: draft.startsAt,
    timezone: draft.timezone.trim() || "America/Toronto",
    title: draft.title.trim(),
  };
}

export function ReminderEventDialog({
  assignableParticipants,
  draft,
  onClose,
  onSubmit,
}: {
  assignableParticipants: CalendarAssignableParticipant[];
  draft: ReminderDraft | null;
  onClose: () => void;
  onSubmit: (draft: ReminderDraft) => Promise<void>;
}) {
  const [localDraft, setLocalDraft] = useState<ReminderDraft | null>(draft);
  useEffect(() => {
    setLocalDraft(draft);
  }, [draft]);
  const canSubmit = Boolean(localDraft?.title.trim() && localDraft.startsAt);
  const update = (patch: Partial<ReminderDraft>) =>
    setLocalDraft((current) => (current ? { ...current, ...patch } : current));
  return (
    <Dialog
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
      open={Boolean(draft)}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {localDraft?.mode === "edit"
              ? "Edit calendar event"
              : "New calendar event"}
          </DialogTitle>
          <DialogDescription>
            Reminder-only events stay on the calendar and do not change the
            build timeline, draw plan, or approval workflow.
          </DialogDescription>
        </DialogHeader>
        {localDraft ? (
          <div className="grid gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="reminder-title">Title</Label>
              <Input
                id="reminder-title"
                onChange={(event) => update({ title: event.target.value })}
                placeholder="Follow up with broker"
                value={localDraft.title}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="reminder-description">Notes</Label>
              <Textarea
                id="reminder-description"
                onChange={(event) =>
                  update({ description: event.target.value })
                }
                placeholder="Optional context for the event."
                value={localDraft.description}
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="grid gap-1.5">
                <Label htmlFor="reminder-start">Start date</Label>
                <Input
                  id="reminder-start"
                  onChange={(event) => update({ startsAt: event.target.value })}
                  type="date"
                  value={localDraft.startsAt}
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="reminder-end">End date</Label>
                <Input
                  id="reminder-end"
                  onChange={(event) => update({ endsAt: event.target.value })}
                  type="date"
                  value={localDraft.endsAt}
                />
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-[1fr_10rem] sm:items-end">
              <div className="grid gap-1.5">
                <Label htmlFor="reminder-location">Location</Label>
                <Input
                  id="reminder-location"
                  onChange={(event) => update({ location: event.target.value })}
                  placeholder="Optional location"
                  value={localDraft.location}
                />
              </div>
              <label
                className="flex items-center gap-2 rounded-md border bg-background px-3 py-2 text-sm"
                htmlFor="reminder-all-day"
              >
                <Checkbox
                  checked={localDraft.allDay}
                  id="reminder-all-day"
                  onCheckedChange={(checked) =>
                    update({ allDay: checked === true })
                  }
                />
                All day
              </label>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="reminder-timezone">Timezone</Label>
              <Input
                id="reminder-timezone"
                onChange={(event) => update({ timezone: event.target.value })}
                value={localDraft.timezone}
              />
            </div>
            <div className="grid gap-2">
              <Label>Invitees</Label>
              <div className="grid max-h-44 gap-1 overflow-y-auto rounded-md border p-2">
                {assignableParticipants.length > 0 ? (
                  assignableParticipants.map((participant) => {
                    const checked = localDraft.assignedParticipantKeys.includes(
                      participant.key
                    );
                    return (
                      <label
                        className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted"
                        htmlFor={`reminder-invitee-${participant.key}`}
                        key={participant.key}
                      >
                        <Checkbox
                          checked={checked}
                          id={`reminder-invitee-${participant.key}`}
                          onCheckedChange={(nextChecked) => {
                            update({
                              assignedParticipantKeys: nextChecked
                                ? [
                                    ...localDraft.assignedParticipantKeys,
                                    participant.key,
                                  ]
                                : localDraft.assignedParticipantKeys.filter(
                                    (key) => key !== participant.key
                                  ),
                            });
                          }}
                        />
                        <span className="min-w-0 flex-1 truncate">
                          {participant.displayName}
                        </span>
                        {participant.role ? (
                          <Badge variant="outline">{participant.role}</Badge>
                        ) : null}
                      </label>
                    );
                  })
                ) : (
                  <p className="p-2 text-muted-foreground text-sm">
                    No workspace invitees are available yet.
                  </p>
                )}
              </div>
            </div>
          </div>
        ) : null}
        <DialogFooter>
          <Button onClick={onClose} variant="outline">
            Cancel
          </Button>
          <Button
            disabled={!canSubmit}
            onClick={() => {
              if (localDraft) {
                onSubmit(localDraft);
              }
            }}
          >
            {localDraft?.mode === "edit" ? "Save event" : "Create event"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function managedDateRangeFromCalendarEvent(event: DrawFlowCalendarEvent): {
  endTime: Date;
  startTime: Date;
} {
  const startTime = managedDateFromCalendarValue(
    event.startsAt,
    event.timeBucket,
    "start"
  );
  let endTime = managedDateFromCalendarValue(
    event.endsAt ?? event.startsAt,
    event.timeBucket,
    "end"
  );
  if (!(event.endsAt || event.allDay)) {
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
  edge: "end" | "start"
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
  edge: "end" | "start"
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

export function calendarIsoFromManagedDate(date: Date): string {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function calendarManagerViewFromTimeframe(
  timeframe: CalendarTimeframe
): EventManagerView {
  return timeframe;
}

export function calendarTimeframeFromManagerView(
  view: EventManagerView
): CalendarTimeframe {
  return view === "list" ? "agenda" : view;
}

export function calendarManagerCategories(
  events: DrawFlowCalendarEvent[]
): string[] {
  return Array.from(
    new Set(events.map((event) => `${event.kind} / ${event.status}`))
  );
}

export function calendarManagerTags(events: DrawFlowCalendarEvent[]): string[] {
  return Array.from(
    new Set(
      events.flatMap((event) => [
        calendarTimeBucketLabel(event.timeBucket),
        event.status,
        event.kind,
        ...event.warnings.map((warning) => warning.label),
      ])
    )
  );
}

export function calendarColorForEvent(event: DrawFlowCalendarEvent): string {
  if (event.status === "blocked" || event.status === "overdue") {
    return "red";
  }
  if (event.kind === "draw" || event.kind === "drawGroup") {
    return "emerald";
  }
  if (event.kind === "loan") {
    return "emerald";
  }
  if (event.kind === "siteVisit") {
    return "cyan";
  }
  if (event.kind === "review" || event.kind === "adminDecision") {
    return "violet";
  }
  if (event.kind === "evidence" || event.warnings.length > 0) {
    return "amber";
  }
  if (event.kind === "budgetRevision") {
    return "slate";
  }
  if (event.kind === "contractor") {
    return "rose";
  }
  if (event.kind === "reminder") {
    return "cyan";
  }
  return "blue";
}

export function calendarTimeBucketLabel(
  bucket: DrawFlowCalendarEvent["timeBucket"]
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

export function summarizeCalendarExport(events: DrawFlowCalendarEvent[]) {
  const dates = events
    .flatMap((event) => [event.startsAt, event.endsAt])
    .filter((value): value is string => Boolean(value))
    .map((value) => value.slice(0, 10))
    .sort();
  const firstDate = dates[0];
  const lastDate = dates.at(-1);
  const timezones = Array.from(new Set(events.map((event) => event.timezone)));

  return {
    eventCount: events.length,
    rangeLabel:
      firstDate && lastDate
        ? firstDate === lastDate
          ? formatCalendarExportDate(firstDate)
          : `${formatCalendarExportDate(firstDate)} to ${formatCalendarExportDate(lastDate)}`
        : "No dated events",
    timezoneLabel:
      timezones.length === 1
        ? (timezones[0] ?? "Timezone unavailable")
        : `${timezones.length} timezones`,
  };
}

export function formatCalendarExportDate(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    day: "numeric",
    month: "long",
    timeZone: "UTC",
    year: "numeric",
  }).format(new Date(`${value}T00:00:00Z`));
}

export function formatEventCount(count: number) {
  return `${count} event${count === 1 ? "" : "s"}`;
}

export function CalendarWorkspaceToolbar({
  events,
  exportState,
  filters,
  actions,
  canCreateReminderEvents,
  onCreateSyncSubscription,
  onExport,
  onNewReminder,
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
  canCreateReminderEvents: boolean;
  events: DrawFlowCalendarEvent[];
  exportState: {
    message: string;
    status: "error" | "idle" | "pending" | "success";
  };
  filters: CalendarFilters;
  onCreateSyncSubscription: (provider: "google" | "ics" | "outlook") => void;
  onExport: () => Promise<void> | void;
  onNewReminder: () => void;
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
            <Badge variant="outline">
              {events.filter(eventNeedsAction).length} needs action
            </Badge>
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
            {canCreateReminderEvents ? (
              <Button onClick={onNewReminder} size="sm">
                <CalendarPlus />
                New event
              </Button>
            ) : null}
            <Button
              disabled={exportState.status === "pending"}
              onClick={onExport}
              size="sm"
              variant="outline"
            >
              {exportState.status === "pending" ? (
                <Loader2 className="animate-spin" />
              ) : (
                <Download />
              )}
              {exportState.status === "pending"
                ? "Exporting ICS"
                : "Export ICS"}
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
        {exportState.message ? (
          <p
            aria-live={exportState.status === "error" ? "assertive" : "polite"}
            className={cn(
              "text-sm",
              exportState.status === "error"
                ? "text-destructive"
                : "text-muted-foreground"
            )}
            role={exportState.status === "error" ? "alert" : "status"}
          >
            {exportState.message}
          </p>
        ) : null}
        <div className="grid gap-2 lg:grid-cols-[minmax(14rem,22rem)_1fr] lg:items-center">
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
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
              onClick={() =>
                onSetFilters({ ...filters, riskOnly: !filters.riskOnly })
              }
              size="sm"
              variant={filters.riskOnly ? "secondary" : "outline"}
            >
              Risk only
            </Button>
            <Button
              className="shrink-0"
              onClick={() =>
                onSetFilters({
                  ...filters,
                  editableOnly: !filters.editableOnly,
                })
              }
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
export function ImpactCard({ request }: { request: CalendarEditRequest }) {
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
            capital-release timing are re-projected after commit.
          </span>
        </div>
        {event.warnings.length > 0 ? (
          <div className="grid grid-cols-[8rem_1fr] gap-2">
            <span className="text-muted-foreground">Warnings</span>
            <span>
              {event.warnings.map((warning) => warning.label).join(", ")}
            </span>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

export function shiftIso(iso: string, days: number) {
  const date = new Date(`${iso.slice(0, 10)}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function absoluteCalendarFeedUrl(feedUrl: string) {
  if (HTTP_URL_PATTERN.test(feedUrl)) {
    return feedUrl;
  }
  const convexUrl = import.meta.env.VITE_CONVEX_URL;
  const base =
    typeof convexUrl === "string" && convexUrl
      ? convexUrl
      : window.location.origin;
  return new URL(feedUrl, base).toString();
}

export function buildDefaultCalendarActions(input: {
  canCreateReminderEvents: boolean;
  canDeleteReminderEvents: boolean;
  canUpdateReminderEvents: boolean;
  exportEvents: (events: DrawFlowCalendarEvent[], filename: string) => void;
  onBulkMove: (events: DrawFlowCalendarEvent[], dayDelta: number) => void;
  onDeleteReminder: (event: DrawFlowCalendarEvent) => void;
  onEditReminder: (event: DrawFlowCalendarEvent) => void;
  onNewReminder: (date: string) => void;
  onOpen: (event: DrawFlowCalendarEvent) => void;
  source: DrawFlowCalendarWorkspaceData["source"];
}): CalendarAction[] {
  const actions: CalendarAction[] = [
    ...(input.canCreateReminderEvents
      ? [
          {
            appliesTo: "date",
            availability: { state: "enabled" },
            description: "Create a reminder-only event for this calendar date.",
            icon: <CalendarPlus className="size-4" />,
            id: "new-reminder-event",
            label: "New reminder event",
            onSelect: (context) => {
              input.onNewReminder(
                context.date ??
                  context.dateRange?.startsAt ??
                  new Date().toISOString().slice(0, 10)
              );
            },
            requiresConfirmation: false,
            requiresReason: false,
          } satisfies CalendarAction,
        ]
      : []),
    {
      appliesTo: "event",
      availability: { state: "enabled" },
      description: "Open the shared detail drawer.",
      id: "open-event-detail",
      label: "Open detail",
      onSelect: (context: CalendarActionContext) => {
        if (context.event) {
          input.onOpen(context.event);
        }
      },
      requiresConfirmation: false,
      requiresReason: false,
    },
    ...(input.canCreateReminderEvents
      ? [
          {
            appliesTo: "event",
            availability: { state: "enabled" },
            description: "Create a reminder-only event on this calendar date.",
            icon: <CalendarPlus className="size-4" />,
            id: "new-reminder-event-from-event",
            isVisible: (context) => context.event?.kind !== "reminder",
            label: "New reminder event",
            onSelect: (context) => {
              input.onNewReminder(
                context.date ??
                  context.event?.startsAt.slice(0, 10) ??
                  new Date().toISOString().slice(0, 10)
              );
            },
            requiresConfirmation: false,
            requiresReason: false,
          } satisfies CalendarAction,
        ]
      : []),
    {
      appliesTo: "event",
      availability: { state: "enabled" },
      description: "Copy an event deep link.",
      id: "copy-event-link",
      isVisible: (context) => context.event?.kind !== "reminder",
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
      appliesTo: "event",
      availability: { state: "enabled" },
      description: "Edit this reminder-only calendar event.",
      id: "edit-reminder-event",
      isVisible: (context) =>
        input.canUpdateReminderEvents &&
        context.event?.kind === "reminder" &&
        context.event.status !== "cancelled",
      label: "Edit reminder",
      onSelect: (context) => {
        if (context.event?.kind === "reminder") {
          input.onEditReminder(context.event);
        }
      },
      requiresConfirmation: false,
      requiresReason: false,
    },
    {
      appliesTo: "event",
      availability: { state: "enabled" },
      description: "Cancel this reminder-only calendar event.",
      id: "cancel-reminder-event",
      isVisible: (context) =>
        input.canDeleteReminderEvents &&
        context.event?.kind === "reminder" &&
        context.event.status !== "cancelled",
      label: "Cancel reminder",
      onSelect: (context) => {
        if (context.event?.kind === "reminder") {
          input.onDeleteReminder(context.event);
        }
      },
      requiresConfirmation: true,
      requiresReason: false,
      tone: "destructive",
    },
    {
      appliesTo: "selection",
      availability: { state: "enabled" },
      description: "Export selected calendar events.",
      id: "export-selected-events",
      label: "Export selected",
      onSelect: (context) => {
        input.exportEvents(
          context.events ?? [],
          `${input.source.id}-selected.ics`
        );
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
  return actions;
}
