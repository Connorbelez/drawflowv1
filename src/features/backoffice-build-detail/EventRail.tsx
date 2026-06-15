import type { ReactNode } from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetPanel,
  SheetTitle,
} from "#/components/ui/sheet.tsx";
import { cn } from "#/lib/utils.ts";
import { formatRelative } from "./format";

interface RailEvent {
  _id: string;
  createdAt: number;
  eventType: string;
  payloadPreview: string;
}

interface AuditEvent {
  _id: string;
  actorPersona: string;
  afterSummary?: string;
  beforeSummary?: string;
  createdAt: number;
  entityLabel?: string;
  entityType: string;
  eventType: string;
}

interface EventRailPanelProps {
  auditEvents: AuditEvent[];
  onResolve?: (event: RailEvent) => void;
  onView?: (event: RailEvent) => void;
  quickActionEvents: RailEvent[];
}

interface EventRailSheetProps extends EventRailPanelProps {
  onOpenChange: (open: boolean) => void;
  open: boolean;
}

function eventIcon(eventType: string): string {
  if (eventType.includes("milestone")) {
    return "🚩";
  }
  if (eventType.includes("site")) {
    return "📝";
  }
  if (eventType.includes("draw")) {
    return "💵";
  }
  return "•";
}

function eventTitle(eventType: string): string {
  if (
    eventType.includes("milestoneCompleted") ||
    eventType.includes("milestone.completion")
  ) {
    return "Builder completed milestone";
  }
  if (
    eventType.includes("siteVisitCompleted") ||
    eventType.includes("site_visit.completed")
  ) {
    return "Site visit complete";
  }
  if (
    eventType.includes("drawRequested") ||
    eventType.includes("draw.requested")
  ) {
    return "Draw requested";
  }
  if (eventType.includes("drawApproved")) {
    return "Draw approved";
  }
  return eventType.replace(/[._]/g, " ");
}

export function EventRailPanel({
  quickActionEvents,
  auditEvents,
  onView,
  onResolve,
}: EventRailPanelProps): ReactNode {
  return (
    <div className="flex flex-col gap-4" data-testid="build-detail-rail">
      <RailSection
        count={quickActionEvents.length}
        title="Events + Quick Action"
      >
        {quickActionEvents.length === 0 ? (
          <p className="text-muted-foreground text-xs">No actionable events.</p>
        ) : (
          quickActionEvents.map((event) => (
            <article
              className="mb-2 rounded-xl border border-border bg-card p-3"
              data-event-id={event._id}
              data-event-type={event.eventType}
              data-testid={`rail-quick-event-${event._id}`}
              key={event._id}
            >
              <div className="flex items-center gap-2 font-semibold text-xs">
                <span aria-hidden="true">{eventIcon(event.eventType)}</span>
                <span>{eventTitle(event.eventType)}</span>
              </div>
              <p className="mt-1 text-muted-foreground text-xs">
                {event.payloadPreview}
              </p>
              <div className="mt-2 flex gap-2">
                <button
                  className="rounded-md border border-border bg-card px-2.5 py-1 text-xs hover:bg-accent"
                  data-testid={`rail-quick-event-view-${event._id}`}
                  onClick={() => onView?.(event)}
                  type="button"
                >
                  View
                </button>
                <button
                  className="rounded-md border border-primary/40 bg-primary/30 px-2.5 py-1 text-xs"
                  data-testid={`rail-quick-event-resolve-${event._id}`}
                  onClick={() => onResolve?.(event)}
                  type="button"
                >
                  Resolve
                </button>
              </div>
              <p className="mt-1 text-[10px] text-muted-foreground">
                {formatRelative(event.createdAt)}
              </p>
            </article>
          ))
        )}
      </RailSection>
      <RailSection count={auditEvents.length} title="Event Log">
        <ol
          className="relative ml-3 border-border border-l pl-4"
          data-testid="rail-event-log"
        >
          {auditEvents.length === 0 ? (
            <li className="text-muted-foreground text-xs">No events yet.</li>
          ) : (
            auditEvents.map((event) => (
              <li
                className="relative mb-3 rounded-md border border-border bg-card/90 p-3"
                data-event-type={event.eventType}
                data-testid={`rail-log-${event._id}`}
                key={event._id}
              >
                <p className="font-semibold text-xs">
                  {event.entityLabel ?? eventTitle(event.eventType)}
                </p>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  {event.entityType}
                  {event.beforeSummary
                    ? ` · ${event.beforeSummary} → ${event.afterSummary ?? ""}`
                    : ""}
                </p>
                <p className="mt-1 text-[10px] text-muted-foreground">
                  {event.actorPersona} · {formatRelative(event.createdAt)}
                </p>
              </li>
            ))
          )}
        </ol>
      </RailSection>
    </div>
  );
}

export function EventRailSheet({
  auditEvents,
  onOpenChange,
  onResolve,
  onView,
  open,
  quickActionEvents,
}: EventRailSheetProps): ReactNode {
  return (
    <Sheet onOpenChange={onOpenChange} open={open}>
      <SheetContent
        className="w-full sm:max-w-md"
        data-testid="build-detail-events-sheet"
        side="right"
      >
        <SheetHeader>
          <SheetTitle>Events and audit log</SheetTitle>
        </SheetHeader>
        <SheetPanel>
          <EventRailPanel
            auditEvents={auditEvents}
            onResolve={onResolve}
            onView={onView}
            quickActionEvents={quickActionEvents}
          />
        </SheetPanel>
      </SheetContent>
    </Sheet>
  );
}

/** @deprecated Use EventRailSheet + EventRailPanel instead. */
export function EventRail({
  quickActionEvents,
  auditEvents,
  onView,
  onResolve,
  collapsed = false,
  onToggleCollapsed,
}: EventRailPanelProps & {
  collapsed?: boolean;
  onToggleCollapsed?: () => void;
}): ReactNode {
  return (
    <EventRailSheet
      auditEvents={auditEvents}
      onOpenChange={(open) => {
        if (open !== !collapsed) {
          onToggleCollapsed?.();
        }
      }}
      onResolve={onResolve}
      onView={onView}
      open={!collapsed}
      quickActionEvents={quickActionEvents}
    />
  );
}

function RailSection({
  title,
  count,
  children,
}: {
  title: string;
  count: number;
  children: ReactNode;
}) {
  return (
    <section>
      <header className="mb-2 flex items-center justify-between">
        <h4 className="font-semibold text-[11px] text-muted-foreground uppercase tracking-wider">
          {title}
        </h4>
        <span
          className={cn(
            "rounded-full bg-muted px-2 py-0.5 text-[11px] text-foreground"
          )}
        >
          {count}
        </span>
      </header>
      {children}
    </section>
  );
}
