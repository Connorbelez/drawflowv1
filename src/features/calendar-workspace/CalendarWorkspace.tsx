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
import { useCallback, useEffect, useMemo, useState } from "react";
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
import {
  EventManager,
  type EventManagerView,
  type Event as ManagedCalendarEvent,
} from "#/components/ui/event-manager.tsx";
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
  CalendarAssignableParticipant,
  CalendarEditRequest,
  CalendarFilters,
  CalendarReminderEventInput,
  CalendarSavedView,
  CalendarSyncSubscriptionResult,
  CalendarTimeframe,
  DrawFlowCalendarEvent,
  DrawFlowCalendarWorkspaceData,
} from "./calendarTypes";

export interface CalendarWorkspaceProps {
  actions?: CalendarAction[];
  assignableParticipants?: CalendarAssignableParticipant[];
  className?: string;
  initialTimeframe?: CalendarTimeframe;
  onCommitEdit?: (request: CalendarEditRequest) => Promise<unknown> | unknown;
  onCreateReminderEvent?: (
    input: CalendarReminderEventInput
  ) => Promise<unknown> | unknown;
  onCreateSyncSubscription?: (input: {
    direction: "bidirectional" | "outbound";
    filters: CalendarFilters;
    provider: "google" | "ics" | "outlook";
    sourceId: string;
    surface: DrawFlowCalendarWorkspaceData["surface"];
  }) =>
    | Promise<CalendarSyncSubscriptionResult>
    | CalendarSyncSubscriptionResult
    | void;
  onDeleteReminderEvent?: (input: {
    eventId: string;
    reason?: string;
  }) => Promise<unknown> | unknown;
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
  onUpdateReminderEvent?: (
    input: CalendarReminderEventInput & { eventId: string }
  ) => Promise<unknown> | unknown;
  workspace?: DrawFlowCalendarWorkspaceData | null;
}

export function CalendarWorkspace({
  actions = [],
  assignableParticipants = [],
  className,
  initialTimeframe,
  onCommitEdit,
  onCreateReminderEvent,
  onCreateSyncSubscription,
  onDeleteReminderEvent,
  onRecordExternalSyncChange,
  onSaveView,
  onTimeframeChange,
  onUpdateReminderEvent,
  workspace,
}: CalendarWorkspaceProps) {
  const [timeframe, setTimeframe] = useState<CalendarTimeframe>(
    initialTimeframe ?? workspace?.defaultTimeframe ?? "month"
  );
  const [filters, setFilters] = useState<CalendarFilters>({});
  const [selectedDate, setSelectedDate] = useState<string | undefined>();
  const [selectedEventId, setSelectedEventId] = useState<string | undefined>();
  const [selectedEventIds, setSelectedEventIds] = useState<string[]>([]);
  const [pendingEdit, setPendingEdit] = useState<CalendarEditRequest | null>(
    null
  );
  const [pendingBulkMove, setPendingBulkMove] = useState<{
    dayDelta: number;
    events: DrawFlowCalendarEvent[];
  } | null>(null);
  const [reason, setReason] = useState("");
  const [reminderDraft, setReminderDraft] = useState<ReminderDraft | null>(
    null
  );
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
    if (!workspace) {
      return workspace;
    }
    return {
      ...workspace,
      events: normalizeCalendarEvents(workspace.events),
      warnings: (workspace.warnings ?? []).map((warning) =>
        typeof warning === "string" ? { label: warning } : warning
      ),
    };
  }, [workspace]);

  const filteredEvents = useMemo(
    () =>
      normalizedWorkspace
        ? applyCalendarFilters(normalizedWorkspace.events, filters)
        : [],
    [filters, normalizedWorkspace]
  );
  const managedEvents = useMemo(
    () => filteredEvents.map(drawFlowEventToManagedEvent),
    [filteredEvents]
  );
  const selectedEvent = useMemo(
    () =>
      normalizedWorkspace?.events.find(
        (event) => event.id === selectedEventId
      ) ?? null,
    [normalizedWorkspace, selectedEventId]
  );
  const selectedEvents = useMemo(
    () =>
      normalizedWorkspace?.events.filter((event) =>
        selectedEventIds.includes(event.id)
      ) ?? [],
    [normalizedWorkspace, selectedEventIds]
  );
  const canCreateReminderEvents = Boolean(
    normalizedWorkspace?.surface === "proposal" && onCreateReminderEvent
  );
  const canDeleteReminderEvents = Boolean(onDeleteReminderEvent);
  const canUpdateReminderEvents = Boolean(onUpdateReminderEvent);

  const setTimeframeControlled = useCallback(
    (next: CalendarTimeframe) => {
      setTimeframe(next);
      onTimeframeChange?.(next);
    },
    [onTimeframeChange]
  );

  const defaultActions = useMemo(
    () =>
      normalizedWorkspace
        ? buildDefaultCalendarActions({
            canCreateReminderEvents,
            canDeleteReminderEvents,
            canUpdateReminderEvents,
            exportEvents: (events, filename) =>
              downloadTextFile(
                filename,
                buildIcsForEvents(events, normalizedWorkspace.source.title)
              ),
            onBulkMove: (events, dayDelta) =>
              setPendingBulkMove({ dayDelta, events }),
            onDeleteReminder: async (event) => {
              if (event.entity.type !== "calendarReminder") {
                return;
              }
              await onDeleteReminderEvent?.({
                eventId: event.entity.id,
                reason: "Cancelled from calendar workspace.",
              });
              toast.success("Calendar reminder cancelled.");
            },
            onEditReminder: (event) => {
              if (event.entity.type !== "calendarReminder") {
                return;
              }
              setReminderDraft(reminderDraftFromEvent(event));
            },
            onNewReminder: (date) => setReminderDraft(emptyReminderDraft(date)),
            onOpen: (event) => setSelectedEventId(event.id),
            source: normalizedWorkspace.source,
          })
        : [],
    [
      canCreateReminderEvents,
      canDeleteReminderEvents,
      canUpdateReminderEvents,
      normalizedWorkspace,
      onDeleteReminderEvent,
    ]
  );
  const allActions = useMemo(
    () => [...defaultActions, ...actions],
    [actions, defaultActions]
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
    (event) =>
      event.editable.requiredReason && event.editable.requiredReason !== "none"
  );

  return (
    <div className={className} data-testid="calendar-workspace">
      <div className="grid min-h-[calc(100dvh-12rem)] gap-3 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="flex min-w-0 flex-col gap-3">
          <CalendarWorkspaceToolbar
            actions={allActions}
            canCreateReminderEvents={canCreateReminderEvents}
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
                  sourceId: normalizedWorkspace.source.id,
                  surface: normalizedWorkspace.surface,
                });
                if (result?.feedUrl) {
                  setSyncFeedUrl(absoluteCalendarFeedUrl(result.feedUrl));
                  toast.success("Calendar subscription created.");
                }
              } catch (error) {
                toast.error(
                  error instanceof Error
                    ? error.message
                    : "Calendar sync setup failed."
                );
              } finally {
                setSyncBusy(null);
              }
            }}
            onExport={() =>
              downloadTextFile(
                `${normalizedWorkspace.surface}-calendar.ics`,
                buildIcsForEvents(
                  filteredEvents,
                  normalizedWorkspace.source.title
                )
              )
            }
            onNewReminder={() =>
              setReminderDraft(
                emptyReminderDraft(
                  selectedDate ?? new Date().toISOString().slice(0, 10)
                )
              )
            }
            onRecordInbound={async () => {
              if (!onRecordExternalSyncChange) {
                toast.info(
                  "Inbound reconciliation is not configured for this route."
                );
                return;
              }
              await onRecordExternalSyncChange({
                changeKey: `manual_reconcile_${Date.now()}`,
                payload: {
                  reason:
                    "Manual calendar reconciliation check from calendar workspace.",
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
                        nextStartsAt: calendarIsoFromManagedDate(
                          next.startTime
                        ),
                        priorEndsAt: event.drawFlowEvent.endsAt,
                        priorStartsAt: event.drawFlowEvent.startsAt,
                      })
                    : undefined
                }
                onEventResize={(event, next) =>
                  event.drawFlowEvent
                    ? setPendingEdit({
                        changeType:
                          next.edge === "start" ? "resizeStart" : "resizeEnd",
                        event: event.drawFlowEvent,
                        nextEndsAt: calendarIsoFromManagedDate(next.endTime),
                        nextStartsAt: calendarIsoFromManagedDate(
                          next.startTime
                        ),
                        priorEndsAt: event.drawFlowEvent.endsAt,
                        priorStartsAt: event.drawFlowEvent.startsAt,
                      })
                    : undefined
                }
                onEventSelect={(event) => setSelectedEventId(event.id)}
                onSelectDate={setSelectedDate}
                onToggleEventSelection={(event) =>
                  setSelectedEventIds((current) =>
                    current.includes(event.id)
                      ? current.filter((id) => id !== event.id)
                      : [...current, event.id]
                  )
                }
                onViewChange={(view) =>
                  setTimeframeControlled(calendarTimeframeFromManagerView(view))
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
              Calendar edits commit through DrawFlow workflow mutations and
              audit rules.
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
                if (!pendingEdit) {
                  return;
                }
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
                      : "Calendar schedule edit failed."
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
              Each selected event is validated against its edit capability
              before commit.
            </DialogDescription>
          </DialogHeader>
          {pendingBulkMove ? (
            <div className="grid gap-3">
              <div className="max-h-56 overflow-y-auto rounded-md border p-3 text-sm">
                {pendingBulkMove.events.map((event) => (
                  <div
                    className="flex items-center justify-between gap-2 border-b py-2 last:border-b-0"
                    key={event.id}
                  >
                    <span className="min-w-0 truncate">{event.title}</span>
                    <Badge
                      variant={event.editable.canMove ? "outline" : "secondary"}
                    >
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
                if (!pendingBulkMove) {
                  return;
                }
                try {
                  for (const event of pendingBulkMove.events) {
                    if (!event.editable.canMove) {
                      continue;
                    }
                    await onCommitEdit?.({
                      changeType: "bulkMove",
                      event,
                      events: pendingBulkMove.events,
                      nextEndsAt: event.endsAt
                        ? shiftIso(event.endsAt, pendingBulkMove.dayDelta)
                        : undefined,
                      nextStartsAt: shiftIso(
                        event.startsAt,
                        pendingBulkMove.dayDelta
                      ),
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
                      : "Bulk calendar move failed."
                  );
                }
              }}
            >
              Move selected
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ReminderEventDialog
        assignableParticipants={assignableParticipants}
        draft={reminderDraft}
        onClose={() => setReminderDraft(null)}
        onSubmit={async (draft) => {
          const payload = reminderPayloadFromDraft(
            draft,
            assignableParticipants
          );
          try {
            if (draft.mode === "edit" && draft.eventId) {
              await onUpdateReminderEvent?.({
                ...payload,
                eventId: draft.eventId,
              });
              toast.success("Calendar reminder updated.");
            } else {
              await onCreateReminderEvent?.(payload);
              toast.success("Calendar reminder created.");
            }
            setReminderDraft(null);
          } catch (error) {
            toast.error(
              error instanceof Error
                ? error.message
                : "Calendar reminder save failed."
            );
          }
        }}
      />
    </div>
  );
}

function drawFlowEventToManagedEvent(
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

interface ReminderDraft {
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

function emptyReminderDraft(startsAt: string): ReminderDraft {
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

function reminderDraftFromEvent(event: DrawFlowCalendarEvent): ReminderDraft {
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

function reminderPayloadFromDraft(
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

function ReminderEventDialog({
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
              <label className="flex items-center gap-2 rounded-md border bg-background px-3 py-2 text-sm">
                <Checkbox
                  checked={localDraft.allDay}
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
                        key={participant.key}
                      >
                        <Checkbox
                          checked={checked}
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
            onClick={() => (localDraft ? void onSubmit(localDraft) : undefined)}
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

function calendarIsoFromManagedDate(date: Date): string {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function calendarManagerViewFromTimeframe(
  timeframe: CalendarTimeframe
): EventManagerView {
  return timeframe;
}

function calendarTimeframeFromManagerView(
  view: EventManagerView
): CalendarTimeframe {
  return view === "list" ? "agenda" : view;
}

function calendarManagerCategories(events: DrawFlowCalendarEvent[]): string[] {
  return Array.from(
    new Set(events.map((event) => `${event.kind} / ${event.status}`))
  );
}

function calendarManagerTags(events: DrawFlowCalendarEvent[]): string[] {
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

function calendarColorForEvent(event: DrawFlowCalendarEvent): string {
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

function calendarTimeBucketLabel(
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

function CalendarWorkspaceToolbar({
  events,
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
  filters: CalendarFilters;
  onCreateSyncSubscription: (provider: "google" | "ics" | "outlook") => void;
  onExport: () => void;
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

function buildDefaultCalendarActions(input: {
  canCreateReminderEvents: boolean;
  canDeleteReminderEvents: boolean;
  canUpdateReminderEvents: boolean;
  exportEvents: (events: DrawFlowCalendarEvent[], filename: string) => void;
  onBulkMove: (events: DrawFlowCalendarEvent[], dayDelta: number) => void;
  onDeleteReminder: (event: DrawFlowCalendarEvent) => Promise<void>;
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
        input.canUpdateReminderEvents && context.event?.kind === "reminder",
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
        input.canDeleteReminderEvents && context.event?.kind === "reminder",
      label: "Cancel reminder",
      onSelect: async (context) => {
        if (context.event?.kind === "reminder") {
          await input.onDeleteReminder(context.event);
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

function shiftIso(iso: string, days: number) {
  const date = new Date(`${iso.slice(0, 10)}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function absoluteCalendarFeedUrl(feedUrl: string) {
  if (/^https?:\/\//i.test(feedUrl)) {
    return feedUrl;
  }
  const convexUrl = import.meta.env.VITE_CONVEX_URL;
  const base =
    typeof convexUrl === "string" && convexUrl
      ? convexUrl
      : window.location.origin;
  return new URL(feedUrl, base).toString();
}
