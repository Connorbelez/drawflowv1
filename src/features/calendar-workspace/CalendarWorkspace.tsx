"use client";

import { Loader2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Badge } from "#/components/ui/badge.tsx";
import { Button } from "#/components/ui/button.tsx";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "#/components/ui/dialog.tsx";
import { EventManager } from "#/components/ui/event-manager.tsx";
import { Frame, FramePanel } from "#/components/ui/frame.tsx";
import { Label } from "#/components/ui/label.tsx";
import { Textarea } from "#/components/ui/textarea.tsx";
import { CalendarAgendaRail } from "./CalendarAgendaRail";
import { CalendarEventDetailDrawer } from "./CalendarEventDetailDrawer";
import type { ReminderDraft } from "./CalendarWorkspaceParts";
import {
  absoluteCalendarFeedUrl,
  buildDefaultCalendarActions,
  CalendarWorkspaceToolbar,
  calendarIsoFromManagedDate,
  calendarManagerCategories,
  calendarManagerTags,
  calendarManagerViewFromTimeframe,
  calendarTimeframeFromManagerView,
  drawFlowEventToManagedEvent,
  emptyReminderDraft,
  formatEventCount,
  ImpactCard,
  ReminderEventDialog,
  reminderDraftFromEvent,
  reminderPayloadFromDraft,
  shiftIso,
  summarizeCalendarExport,
} from "./CalendarWorkspaceParts";
import {
  applyCalendarFilters,
  buildIcsForEvents,
  downloadTextFile,
  normalizeCalendarEvents,
} from "./calendarEventProjection";
import type {
  CalendarAction,
  CalendarAssignableParticipant,
  CalendarEditRequest,
  CalendarFilters,
  CalendarReminderEventInput,
  CalendarSyncSubscriptionResult,
  CalendarTimeframe,
  DrawFlowCalendarEvent,
  DrawFlowCalendarWorkspaceData,
} from "./calendarTypes";
export type CalendarOpenDetailResult = "handled" | "fallback";

export interface CalendarWorkspaceProps {
  actions?: CalendarAction[];
  assignableParticipants?: CalendarAssignableParticipant[];
  className?: string;
  initialSelectedEventId?: string;
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
  onExportIcs?: (input: {
    events: DrawFlowCalendarEvent[];
    filename: string;
    icsText: string;
    sourceTitle: string;
  }) => Promise<unknown> | unknown;
  onOpenDetail?: (
    event: DrawFlowCalendarEvent
  ) => CalendarOpenDetailResult | void;
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
  initialSelectedEventId,
  initialTimeframe,
  onCommitEdit,
  onCreateReminderEvent,
  onCreateSyncSubscription,
  onDeleteReminderEvent,
  onExportIcs,
  onOpenDetail,
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
  const [selectedEventId, setSelectedEventId] = useState<string | undefined>(
    initialSelectedEventId
  );
  const [selectedEventIds, setSelectedEventIds] = useState<string[]>([]);
  const suppressNextSelectionRef = useRef<string | undefined>();
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
  const [pendingReminderCancellation, setPendingReminderCancellation] =
    useState<DrawFlowCalendarEvent | null>(null);
  const [reminderCancellationReason, setReminderCancellationReason] =
    useState("");
  const [reminderCancellationBusy, setReminderCancellationBusy] =
    useState(false);
  const [syncFeedUrl, setSyncFeedUrl] = useState<string | null>(null);
  const [syncBusy, setSyncBusy] = useState<string | null>(null);
  const [exportState, setExportState] = useState<{
    message: string;
    status: "error" | "idle" | "pending" | "success";
  }>({ message: "", status: "idle" });
  const exportInFlight = useRef(false);

  useEffect(() => {
    if (initialTimeframe) {
      setTimeframe(initialTimeframe);
    }
  }, [initialTimeframe]);

  useEffect(() => {
    if (
      initialSelectedEventId &&
      workspace?.events.some((event) => event.id === initialSelectedEventId)
    ) {
      setSelectedEventId(initialSelectedEventId);
    }
  }, [initialSelectedEventId, workspace?.events]);

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

  async function exportFilteredEvents() {
    if (!normalizedWorkspace || exportInFlight.current) {
      return;
    }

    const filename = `${normalizedWorkspace.surface}-calendar.ics`;
    const exportSummary = summarizeCalendarExport(filteredEvents);
    const icsText = buildIcsForEvents(
      filteredEvents,
      normalizedWorkspace.source.title
    );
    exportInFlight.current = true;
    setExportState({
      message: `Preparing ${filename} for ${formatEventCount(exportSummary.eventCount)}.`,
      status: "pending",
    });

    try {
      if (onExportIcs) {
        await onExportIcs({
          events: filteredEvents,
          filename,
          icsText,
          sourceTitle: normalizedWorkspace.source.title,
        });
      } else {
        downloadTextFile(filename, icsText);
      }
      setExportState({
        message: `Exported ${filename}: ${formatEventCount(exportSummary.eventCount)}, ${exportSummary.rangeLabel}, ${exportSummary.timezoneLabel}.`,
        status: "success",
      });
    } catch {
      setExportState({
        message:
          "Calendar export failed. Try again or create an ICS subscription instead.",
        status: "error",
      });
    } finally {
      exportInFlight.current = false;
    }
  }

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
  const selectEventById = useCallback((eventId: string) => {
    if (suppressNextSelectionRef.current === eventId) {
      return;
    }
    suppressNextSelectionRef.current = undefined;
    setSelectedEventId(eventId);
  }, []);
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
            onDeleteReminder: (event) => {
              if (event.entity.type !== "calendarReminder") {
                return;
              }
              setReminderCancellationReason("");
              setPendingReminderCancellation(event);
            },
            onEditReminder: (event) => {
              if (event.entity.type !== "calendarReminder") {
                return;
              }
              setReminderDraft(reminderDraftFromEvent(event));
            },
            onNewReminder: (date) => setReminderDraft(emptyReminderDraft(date)),
            onOpen: (event) => {
              if (onOpenDetail && onOpenDetail(event) === "handled") {
                suppressNextSelectionRef.current = event.id;
                setSelectedEventId(undefined);
                setTimeout(() => {
                  if (suppressNextSelectionRef.current === event.id) {
                    suppressNextSelectionRef.current = undefined;
                  }
                }, 0);
                return;
              }
              setSelectedEventId(event.id);
            },
            source: normalizedWorkspace.source,
          })
        : [],
    [
      canCreateReminderEvents,
      canDeleteReminderEvents,
      canUpdateReminderEvents,
      normalizedWorkspace,
      onDeleteReminderEvent,
      onOpenDetail,
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
            exportState={exportState}
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
            onExport={exportFilteredEvents}
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
                onEventSelect={(event) => selectEventById(event.id)}
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

        {timeframe === "agenda" ? null : (
          <CalendarAgendaRail
            actions={allActions}
            className="min-h-[24rem] xl:min-h-0"
            events={filteredEvents}
            onSelectEvent={(event) => selectEventById(event.id)}
            selectedEventId={selectedEventId}
            source={normalizedWorkspace.source}
            surface={normalizedWorkspace.surface}
            timeframe={timeframe}
          />
        )}
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

      <Dialog
        onOpenChange={(open) => {
          if (!(open || reminderCancellationBusy)) {
            setPendingReminderCancellation(null);
            setReminderCancellationReason("");
          }
        }}
        open={Boolean(pendingReminderCancellation)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Cancel {pendingReminderCancellation?.title ?? "reminder"}?
            </DialogTitle>
            <DialogDescription>
              The reminder stays in calendar history as cancelled. Assigned
              participants may receive cancellation notifications, so confirm
              that this coordination event is no longer needed.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-2">
            <Label htmlFor="reminder-cancellation-reason">
              Cancellation reason (optional)
            </Label>
            <Textarea
              id="reminder-cancellation-reason"
              onChange={(event) =>
                setReminderCancellationReason(event.target.value)
              }
              placeholder="Explain why this reminder is being cancelled."
              value={reminderCancellationReason}
            />
          </div>
          <DialogFooter>
            <Button
              disabled={reminderCancellationBusy}
              onClick={() => {
                setPendingReminderCancellation(null);
                setReminderCancellationReason("");
              }}
              variant="outline"
            >
              Keep reminder
            </Button>
            <Button
              disabled={reminderCancellationBusy}
              onClick={async () => {
                const event = pendingReminderCancellation;
                if (event?.entity.type !== "calendarReminder") {
                  return;
                }
                setReminderCancellationBusy(true);
                try {
                  await onDeleteReminderEvent?.({
                    eventId: event.entity.id,
                    reason:
                      reminderCancellationReason.trim() ||
                      "Cancelled from calendar workspace.",
                  });
                  toast.success(
                    "Calendar reminder cancelled and retained in history."
                  );
                  setPendingReminderCancellation(null);
                  setReminderCancellationReason("");
                } catch {
                  toast.error(
                    "Calendar reminder cancellation failed. Try again."
                  );
                } finally {
                  setReminderCancellationBusy(false);
                }
              }}
              variant="destructive"
            >
              {reminderCancellationBusy ? (
                <Loader2 className="animate-spin" />
              ) : null}
              Cancel reminder
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
