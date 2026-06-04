import type {
  CalendarEventKind,
  CalendarEventStatus,
  CalendarEventWarning,
  CalendarFilters,
  CalendarTimeBucket,
  DrawFlowCalendarEvent,
} from "./calendarTypes";

export const calendarTimeBuckets: CalendarTimeBucket[] = [
  "allDay",
  "earlyMorning",
  "morning",
  "midday",
  "afternoon",
  "endOfDay",
  "evening",
  "unscheduled",
];

const bucketLabels: Record<CalendarTimeBucket, string> = {
  allDay: "All day",
  earlyMorning: "Early",
  morning: "Morning",
  midday: "Midday",
  afternoon: "Afternoon",
  endOfDay: "End of day",
  evening: "Evening",
  unscheduled: "Unscheduled",
};

const statusRank: Record<CalendarEventStatus, number> = {
  overdue: 0,
  blocked: 1,
  ready: 2,
  inReview: 3,
  submitted: 4,
  inProgress: 5,
  planned: 6,
  proposed: 7,
  approved: 8,
  released: 9,
  completed: 10,
  rejected: 11,
  cancelled: 12,
  immutable: 13,
};

const kindRank: Record<CalendarEventKind, number> = {
  adminDecision: 0,
  review: 1,
  siteVisit: 2,
  evidence: 3,
  draw: 4,
  drawGroup: 5,
  milestone: 6,
  submilestone: 7,
  contractor: 8,
  reminder: 9,
  loan: 10,
  budgetRevision: 11,
  dependency: 12,
};

export function bucketLabel(bucket: CalendarTimeBucket): string {
  return bucketLabels[bucket];
}

export function normalizeCalendarWarning(
  warning: CalendarEventWarning | string,
): CalendarEventWarning {
  if (typeof warning !== "string") {
    return warning;
  }
  const severity =
    /blocked|expired|overdue|pressure|unverified|policy/i.test(warning)
      ? "warning"
      : "info";
  return { id: warning.toLowerCase().replace(/[^a-z0-9]+/g, "-"), label: warning, severity };
}

export function normalizeCalendarEvent(
  event: DrawFlowCalendarEvent,
): DrawFlowCalendarEvent {
  return {
    ...event,
    warnings: (event.warnings ?? []).map(normalizeCalendarWarning),
  };
}

export function normalizeCalendarEvents(
  events: DrawFlowCalendarEvent[] | undefined,
): DrawFlowCalendarEvent[] {
  return (events ?? [])
    .filter((event) => !isSuppressedCalendarEvent(event))
    .map(normalizeCalendarEvent)
    .sort(compareCalendarEvents);
}

function isSuppressedCalendarEvent(event: DrawFlowCalendarEvent): boolean {
  const legacyKind = (event as { kind?: string }).kind;
  if (legacyKind === "audit" || legacyKind === "workingCapital") {
    return true;
  }
  return /borrower\s+working[-\s]capital\s+exposure/i.test(
    `${event.title} ${event.subtitle ?? ""}`,
  );
}

export function compareCalendarEvents(
  left: DrawFlowCalendarEvent,
  right: DrawFlowCalendarEvent,
): number {
  return (
    left.startsAt.localeCompare(right.startsAt) ||
    (statusRank[left.status] ?? 99) - (statusRank[right.status] ?? 99) ||
    (kindRank[left.kind] ?? 99) - (kindRank[right.kind] ?? 99) ||
    left.title.localeCompare(right.title)
  );
}

export function applyCalendarFilters(
  events: DrawFlowCalendarEvent[],
  filters: CalendarFilters,
): DrawFlowCalendarEvent[] {
  const query = filters.search?.trim().toLowerCase();
  return events.filter((event) => {
    if (filters.eventKinds?.length && !filters.eventKinds.includes(event.kind)) {
      return false;
    }
    if (filters.statuses?.length && !filters.statuses.includes(event.status)) {
      return false;
    }
    if (filters.milestoneKey && event.milestoneKey !== filters.milestoneKey) {
      return false;
    }
    if (filters.drawGroupKey && event.drawGroupKey !== filters.drawGroupKey) {
      return false;
    }
    if (filters.assigneeUserId && event.assigneeUserId !== filters.assigneeUserId) {
      return false;
    }
    if (filters.riskOnly && event.warnings.length === 0 && event.status !== "blocked" && event.status !== "overdue") {
      return false;
    }
    if (filters.overdueOnly && event.status !== "overdue") {
      return false;
    }
    if (filters.needsAction && !eventNeedsAction(event)) {
      return false;
    }
    if (filters.editableOnly && !event.editable.canMove && !event.editable.canResizeEnd && !event.editable.canChangeStatus) {
      return false;
    }
    if (filters.immutableActuals && event.status !== "immutable" && !event.editable.immutableReason) {
      return false;
    }
    if (
      query &&
      !`${event.title} ${event.subtitle ?? ""} ${event.kind} ${event.status} ${event.ownerUserId ?? ""} ${event.assigneeUserId ?? ""}`
        .toLowerCase()
        .includes(query)
    ) {
      return false;
    }
    return true;
  });
}

export function eventNeedsAction(event: DrawFlowCalendarEvent): boolean {
  return (
    event.status === "blocked" ||
    event.status === "overdue" ||
    event.status === "ready" ||
    event.status === "inReview" ||
    event.status === "submitted" ||
    event.kind === "adminDecision" ||
    event.kind === "review" ||
    event.kind === "siteVisit"
  );
}

export function eventIsCapitalAffecting(event: DrawFlowCalendarEvent): boolean {
  return (
    event.kind === "draw" ||
    event.kind === "drawGroup" ||
    event.kind === "loan" ||
    event.metrics?.amountCents !== undefined
  );
}

export function isoToday(): string {
  return new Date().toISOString().slice(0, 10);
}

export function dateFromIso(iso: string): Date {
  const [year, month, day] = iso.slice(0, 10).split("-").map(Number);
  if (!year || !month || !day) {
    return new Date(iso);
  }
  return new Date(year, month - 1, day);
}

export function isoFromDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function addDaysIso(iso: string, days: number): string {
  const date = dateFromIso(iso);
  date.setDate(date.getDate() + days);
  return isoFromDate(date);
}

export function daysBetweenIso(startIso: string, endIso: string): number {
  const start = dateFromIso(startIso);
  const end = dateFromIso(endIso);
  const ms = Date.UTC(end.getFullYear(), end.getMonth(), end.getDate()) -
    Date.UTC(start.getFullYear(), start.getMonth(), start.getDate());
  return Math.round(ms / 86_400_000);
}

export function startOfWeekIso(iso: string): string {
  const date = dateFromIso(iso);
  const day = (date.getDay() + 6) % 7;
  date.setDate(date.getDate() - day);
  return isoFromDate(date);
}

export function monthStartIso(year: number, monthIndex: number): string {
  return isoFromDate(new Date(year, monthIndex, 1));
}

export function monthEndIso(year: number, monthIndex: number): string {
  return isoFromDate(new Date(year, monthIndex + 1, 0));
}

export function eventTouchesDate(
  event: DrawFlowCalendarEvent,
  dateIso: string,
): boolean {
  return event.startsAt <= dateIso && (event.endsAt ?? event.startsAt) >= dateIso;
}

export function groupEventsByDate(
  events: DrawFlowCalendarEvent[],
): Map<string, DrawFlowCalendarEvent[]> {
  const map = new Map<string, DrawFlowCalendarEvent[]>();
  for (const event of events) {
    const start = event.startsAt.slice(0, 10);
    const end = (event.endsAt ?? event.startsAt).slice(0, 10);
    let cursor = start;
    while (cursor <= end) {
      const dayEvents = map.get(cursor) ?? [];
      dayEvents.push(event);
      map.set(cursor, dayEvents);
      cursor = addDaysIso(cursor, 1);
    }
  }
  for (const [date, dayEvents] of map) {
    map.set(date, dayEvents.sort(compareCalendarEvents));
  }
  return map;
}

export function groupedByBucket(
  events: DrawFlowCalendarEvent[],
): Array<{ bucket: CalendarTimeBucket; events: DrawFlowCalendarEvent[] }> {
  return calendarTimeBuckets
    .map((bucket) => ({
      bucket,
      events: events
        .filter((event) => event.timeBucket === bucket)
        .sort(compareCalendarEvents),
    }))
    .filter((group) => group.events.length > 0);
}

export function formatCentsCompact(cents?: number): string | null {
  if (cents === undefined) {
    return null;
  }
  return new Intl.NumberFormat("en-US", {
    compactDisplay: "short",
    currency: "USD",
    maximumFractionDigits: 1,
    notation: "compact",
    style: "currency",
  }).format(cents / 100);
}

export function formatDateRange(event: Pick<DrawFlowCalendarEvent, "startsAt" | "endsAt" | "timeBucket">): string {
  const start = event.startsAt.slice(0, 10);
  const end = event.endsAt?.slice(0, 10);
  if (!end || end === start) {
    return `${start} · ${bucketLabel(event.timeBucket)}`;
  }
  return `${start} to ${end} · ${bucketLabel(event.timeBucket)}`;
}

export function buildIcsForEvents(
  events: DrawFlowCalendarEvent[],
  calendarName: string,
): string {
  const escape = (value: string) =>
    value.replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/,/g, "\\,").replace(/;/g, "\\;");
  const timestamp = `${new Date().toISOString().replace(/[-:]/g, "").split(".")[0]}Z`;
  const dateValue = (value: string) => value.slice(0, 10).replace(/-/g, "");
  const dateTimeValue = (value: string, fallbackHour: string) => {
    if (value.includes("T")) {
      return `${new Date(value).toISOString().replace(/[-:]/g, "").split(".")[0]}Z`;
    }
    return `${dateValue(value)}T${fallbackHour}0000`;
  };
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//FairLend//DrawFlow Calendar//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${escape(calendarName)}`,
  ];
  for (const event of events.sort(compareCalendarEvents)) {
    const start = dateValue(event.startsAt);
    const end = dateValue(addDaysIso(event.endsAt ?? event.startsAt, event.allDay ? 1 : 0));
    lines.push(
      "BEGIN:VEVENT",
      `UID:${escape(event.id)}@drawflow.fairlend.ca`,
      `DTSTAMP:${timestamp}`,
      event.allDay ? `DTSTART;VALUE=DATE:${start}` : `DTSTART:${dateTimeValue(event.startsAt, "09")}`,
      event.allDay ? `DTEND;VALUE=DATE:${end}` : `DTEND:${dateTimeValue(event.endsAt ?? event.startsAt, "10")}`,
      `SUMMARY:${escape(event.title)}`,
      `DESCRIPTION:${escape([event.subtitle, event.kind, event.status, ...event.warnings.map((warning) => warning.label)].filter(Boolean).join(" | "))}`,
      "END:VEVENT",
    );
  }
  lines.push("END:VCALENDAR");
  return `${lines.join("\r\n")}\r\n`;
}

export function downloadTextFile(filename: string, text: string): void {
  const blob = new Blob([text], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
