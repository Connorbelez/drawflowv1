import type { ReactNode } from "react";
import { cn } from "#/lib/utils.ts";
import { formatRelative } from "./format";

interface RailEvent {
  _id: string;
  eventType: string;
  payloadPreview: string;
  createdAt: number;
}

interface AuditEvent {
  _id: string;
  eventType: string;
  entityLabel?: string;
  entityType: string;
  createdAt: number;
  beforeSummary?: string;
  afterSummary?: string;
  actorPersona: string;
}

interface EventRailProps {
  quickActionEvents: RailEvent[];
  auditEvents: AuditEvent[];
  onView?: (event: RailEvent) => void;
  onResolve?: (event: RailEvent) => void;
  collapsed?: boolean;
  onToggleCollapsed?: () => void;
}

function eventIcon(eventType: string): string {
  if (eventType.includes("milestone")) return "🚩";
  if (eventType.includes("site")) return "📝";
  if (eventType.includes("draw")) return "💵";
  return "•";
}

function eventTitle(eventType: string): string {
  if (eventType.includes("milestoneCompleted") || eventType.includes("milestone.completion"))
    return "Builder completed milestone";
  if (eventType.includes("siteVisitCompleted") || eventType.includes("site_visit.completed"))
    return "Site visit complete";
  if (eventType.includes("drawRequested") || eventType.includes("draw.requested"))
    return "Draw requested";
  if (eventType.includes("drawApproved")) return "Draw approved";
  return eventType.replace(/[._]/g, " ");
}

export function EventRail({
  quickActionEvents,
  auditEvents,
  onView,
  onResolve,
  collapsed = false,
  onToggleCollapsed,
}: EventRailProps): ReactNode {
  return (
    <aside
      aria-label="Events and audit log"
      className={cn(
        "relative sticky top-0 h-screen shrink-0 border-l border-sidebar-border bg-sidebar",
        "overflow-hidden transition-[width] duration-300 ease-out motion-reduce:transition-none",
        collapsed ? "w-[56px]" : "w-[360px]",
      )}
      data-collapsed={collapsed ? "true" : "false"}
      data-testid={collapsed ? "build-detail-rail-collapsed" : "build-detail-rail"}
    >
      {/* Expand affordance — anchored to the right edge so it does not slide
          while the aside resizes. Fades in/out in lockstep with width. */}
      <button
        aria-hidden={!collapsed}
        aria-label="Expand rail"
        className={cn(
          "absolute right-2 top-2 z-10 rounded-md border border-border bg-card px-2 py-2 text-muted-foreground hover:text-foreground",
          "transition-opacity duration-300 ease-out motion-reduce:transition-none",
          collapsed ? "opacity-100" : "pointer-events-none opacity-0",
        )}
        onClick={onToggleCollapsed}
        tabIndex={collapsed ? 0 : -1}
        type="button"
      >
        {"<<"}
      </button>
      {collapsed ? (
        <span
          aria-hidden={!collapsed}
          className={cn(
            "absolute right-0 left-0 top-14 text-center text-muted-foreground text-xs",
            "transition-opacity duration-300 ease-out motion-reduce:transition-none",
            collapsed ? "opacity-100" : "opacity-0",
          )}
        >
          {quickActionEvents.length}
        </span>
      ) : null}
      {/* Expanded panel — fixed 360px width anchored to the right edge so the
          inner content does not reflow during the width animation. The outer
          aside's overflow-hidden clips the off-canvas portion while the
          content opacity fades in lockstep with the width transition. */}
      <div
        aria-hidden={collapsed}
        className={cn(
          "absolute inset-y-0 right-0 flex h-screen w-[360px] flex-col gap-4 overflow-y-auto p-4",
          "transition-opacity duration-300 ease-out motion-reduce:transition-none",
          collapsed ? "pointer-events-none opacity-0" : "opacity-100",
        )}
      >
        <RailSection
          count={quickActionEvents.length}
          onCollapse={onToggleCollapsed}
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
                <p className="mt-1 text-muted-foreground text-xs">{event.payloadPreview}</p>
                <div className="mt-2 flex gap-2">
                  <button
                    className="rounded-md border border-border bg-card px-2.5 py-1 text-xs hover:bg-accent"
                    data-testid={`rail-quick-event-view-${event._id}`}
                    onClick={() => onView?.(event)}
                    tabIndex={collapsed ? -1 : 0}
                    type="button"
                  >
                    View
                  </button>
                  <button
                    className="rounded-md border border-primary/40 bg-primary/30 px-2.5 py-1 text-xs"
                    data-testid={`rail-quick-event-resolve-${event._id}`}
                    onClick={() => onResolve?.(event)}
                    tabIndex={collapsed ? -1 : 0}
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
          <ol className="relative ml-3 border-border border-l pl-4" data-testid="rail-event-log">
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
    </aside>
  );
}

function RailSection({
  title,
  count,
  children,
  onCollapse,
}: {
  title: string;
  count: number;
  children: ReactNode;
  onCollapse?: () => void;
}) {
  return (
    <section>
      <header className="mb-2 flex items-center justify-between">
        <h4 className="font-semibold text-[11px] text-muted-foreground uppercase tracking-wider">
          {title}
        </h4>
        <div className="flex items-center gap-2">
          <span
            className={cn(
              "rounded-full bg-muted px-2 py-0.5 text-[11px] text-foreground",
            )}
          >
            {count}
          </span>
          {onCollapse ? (
            <button
              aria-label="Collapse rail"
              className="rounded-md border border-border bg-card px-2 py-0.5 text-[11px] text-muted-foreground hover:text-foreground"
              onClick={onCollapse}
              type="button"
            >
              {">>"}
            </button>
          ) : null}
        </div>
      </header>
      {children}
    </section>
  );
}
