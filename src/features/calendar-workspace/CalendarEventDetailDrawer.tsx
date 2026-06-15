"use client";

import {
  AlertTriangle,
  CalendarDays,
  CircleDollarSign,
  Lock,
  MoveRight,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { Badge } from "#/components/ui/badge.tsx";
import { Button } from "#/components/ui/button.tsx";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "#/components/ui/card.tsx";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerPanel,
  DrawerTitle,
} from "#/components/ui/drawer.tsx";
import { Input } from "#/components/ui/input.tsx";
import { Label } from "#/components/ui/label.tsx";
import { Textarea } from "#/components/ui/textarea.tsx";
import { CalendarOverflowMenu } from "./CalendarContextMenu";
import {
  eventIsCapitalAffecting,
  formatCentsCompact,
  formatDateRange,
} from "./calendarEventProjection";
import type {
  CalendarAction,
  CalendarEditRequest,
  CalendarSourceSummary,
  CalendarSurface,
  CalendarTimeframe,
  DrawFlowCalendarEvent,
} from "./calendarTypes";

export function CalendarEventDetailDrawer({
  actions,
  event,
  onClose,
  onRequestEdit,
  source,
  surface,
  timeframe,
}: {
  actions: CalendarAction[];
  event: DrawFlowCalendarEvent | null;
  onClose: () => void;
  onRequestEdit: (request: CalendarEditRequest) => void;
  source: CalendarSourceSummary;
  surface: CalendarSurface;
  timeframe: CalendarTimeframe;
}) {
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [reason, setReason] = useState("");
  useEffect(() => {
    setStartsAt(event?.startsAt.slice(0, 10) ?? "");
    setEndsAt(event?.endsAt?.slice(0, 10) ?? "");
    setReason("");
  }, [event]);

  const reasonRequired = event?.editable.requiredReason
    ? event.editable.requiredReason !== "none"
    : false;
  const canSubmitDateEdit = useMemo(() => {
    if (!(event && startsAt)) {
      return false;
    }
    if (!(event.editable.canMove || event.editable.canResizeEnd)) {
      return false;
    }
    if (reasonRequired && !reason.trim()) {
      return false;
    }
    return (
      startsAt !== event.startsAt || (endsAt || undefined) !== event.endsAt
    );
  }, [endsAt, event, reason, reasonRequired, startsAt]);

  return (
    <Drawer
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
      open={Boolean(event)}
      position="right"
    >
      <DrawerContent showCloseButton>
        {event ? (
          <>
            <DrawerHeader>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <Badge variant="outline">{event.kind}</Badge>
                  <DrawerTitle className="mt-2 truncate">
                    {event.title}
                  </DrawerTitle>
                  <DrawerDescription>
                    {formatDateRange(event)}
                  </DrawerDescription>
                </div>
                <CalendarOverflowMenu
                  actions={actions}
                  context={{ event, source, surface, timeframe }}
                  label={event.title}
                  target="event"
                />
              </div>
            </DrawerHeader>
            <DrawerPanel className="grid gap-3">
              <Card>
                <CardHeader className="p-4 pb-2">
                  <CardTitle className="flex items-center gap-2 text-sm">
                    <CalendarDays className="size-4" />
                    Schedule
                  </CardTitle>
                </CardHeader>
                <CardContent className="grid gap-3 p-4 pt-0">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="grid gap-1.5">
                      <Label htmlFor="calendar-event-start">Start date</Label>
                      <Input
                        disabled={!event.editable.canMove}
                        id="calendar-event-start"
                        onChange={(inputEvent) =>
                          setStartsAt(inputEvent.target.value)
                        }
                        type="date"
                        value={startsAt}
                      />
                    </div>
                    <div className="grid gap-1.5">
                      <Label htmlFor="calendar-event-end">End date</Label>
                      <Input
                        disabled={!event.editable.canResizeEnd}
                        id="calendar-event-end"
                        onChange={(inputEvent) =>
                          setEndsAt(inputEvent.target.value)
                        }
                        type="date"
                        value={endsAt}
                      />
                    </div>
                  </div>
                  {event.editable.immutableReason ? (
                    <p className="flex items-center gap-2 text-muted-foreground text-xs">
                      <Lock className="size-3.5" />
                      {event.editable.immutableReason}
                    </p>
                  ) : null}
                  {reasonRequired ? (
                    <div className="grid gap-1.5">
                      <Label htmlFor="calendar-event-reason">
                        Audit reason
                      </Label>
                      <Textarea
                        id="calendar-event-reason"
                        onChange={(inputEvent) =>
                          setReason(inputEvent.target.value)
                        }
                        placeholder="Record the reason for the schedule change."
                        value={reason}
                      />
                    </div>
                  ) : null}
                  <Button
                    disabled={!canSubmitDateEdit}
                    onClick={() => {
                      if (!(event && startsAt)) {
                        return;
                      }
                      onRequestEdit({
                        changeType:
                          startsAt === event.startsAt ? "resizeEnd" : "move",
                        event,
                        nextEndsAt: endsAt || undefined,
                        nextStartsAt: startsAt,
                        priorEndsAt: event.endsAt,
                        priorStartsAt: event.startsAt,
                        reason: reason.trim() || undefined,
                      });
                    }}
                    size="sm"
                  >
                    <MoveRight />
                    Preview schedule edit
                  </Button>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="p-4 pb-2">
                  <CardTitle className="text-sm">Domain Context</CardTitle>
                </CardHeader>
                <CardContent className="grid gap-2 p-4 pt-0 text-sm">
                  <DetailRow label="Status" value={event.status} />
                  <DetailRow
                    label="Milestone"
                    value={event.milestoneKey ?? "None"}
                  />
                  <DetailRow
                    label="Draw group"
                    value={event.drawGroupKey ?? "None"}
                  />
                  <DetailRow label="Timezone" value={event.timezone} />
                </CardContent>
              </Card>
              {eventIsCapitalAffecting(event) ? (
                <Card>
                  <CardHeader className="p-4 pb-2">
                    <CardTitle className="flex items-center gap-2 text-sm">
                      <CircleDollarSign className="size-4" />
                      Financial Context
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="grid gap-2 p-4 pt-0 text-sm">
                    <DetailRow
                      label="Amount"
                      value={
                        formatCentsCompact(event.metrics?.amountCents) ?? "None"
                      }
                    />
                    <DetailRow
                      label="Budget"
                      value={
                        formatCentsCompact(event.metrics?.budgetCents) ?? "None"
                      }
                    />
                  </CardContent>
                </Card>
              ) : null}
              {event.warnings.length > 0 ? (
                <Card>
                  <CardHeader className="p-4 pb-2">
                    <CardTitle className="flex items-center gap-2 text-sm">
                      <AlertTriangle className="size-4 text-amber-600" />
                      Warnings
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="grid gap-2 p-4 pt-0">
                    {event.warnings.map((warning) => (
                      <Badge
                        className="justify-start"
                        key={warning.id ?? warning.label}
                        variant="outline"
                      >
                        {warning.label}
                      </Badge>
                    ))}
                  </CardContent>
                </Card>
              ) : null}
            </DrawerPanel>
            <DrawerFooter>
              <Button onClick={onClose} variant="outline">
                Close
              </Button>
            </DrawerFooter>
          </>
        ) : null}
      </DrawerContent>
    </Drawer>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[8rem_1fr] gap-2">
      <span className="text-muted-foreground">{label}</span>
      <span className="min-w-0 truncate font-medium">{value}</span>
    </div>
  );
}
