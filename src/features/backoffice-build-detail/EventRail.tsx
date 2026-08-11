import {
  CircleDot,
  DollarSign,
  FileText,
  Flag,
  MapPinCheck,
  TriangleAlert,
  UserRound,
} from "lucide-react";
import type { ReactNode } from "react";
import { Badge } from "#/components/ui/badge.tsx";
import { Button } from "#/components/ui/button.tsx";
import { Card } from "#/components/ui/card.tsx";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetPanel,
  SheetTitle,
} from "#/components/ui/sheet.tsx";
import type { BuildDetailTarget } from "../build-detail-targets/buildDetailTarget.ts";
import type { BuildDetailTargetContext } from "../build-detail-targets/useBuildDetailTargetController.ts";
import { formatRelative } from "./format";

interface RailEvent {
  _id: string;
  actionLabel: string;
  body: string;
  canonicalTarget?: BuildDetailTarget;
  canonicalTargetContext?: BuildDetailTargetContext;
  createdAt: number;
  entityLabel: string;
  entityType: string;
  href: string;
  resolutionMode: "domain" | "recipient";
  sourceLabel: string;
  title: string;
}

interface AuditChange {
  after: string;
  before: string;
  field: string;
}

interface AuditEvent {
  _id: string;
  actorPersona: string;
  afterSummary?: string;
  beforeSummary?: string;
  changes?: AuditChange[];
  command?: string;
  createdAt: number;
  entityLabel?: string;
  entityType: string;
  eventType: string;
  reason?: string;
  warnings?: string[];
  canonicalTarget?: BuildDetailTarget;
  canonicalTargetContext?: BuildDetailTargetContext;
}

interface EventRailPanelProps {
  auditEvents: AuditEvent[];
  onOpenCanonicalTarget?: (
    target: BuildDetailTarget,
    context?: BuildDetailTargetContext,
  ) => void;
  onResolve?: (event: RailEvent) => void;
  onView?: (event: RailEvent) => void;
  quickActionEvents: RailEvent[];
}

interface EventRailSheetProps extends EventRailPanelProps {
  onOpenChange: (open: boolean) => void;
  open: boolean;
}

const EVENT_TITLES: Record<string, string> = {
  "active_build.budget_revision.requested": "Budget revision requested",
  "active_build.budget_revision.reviewed": "Budget revision reviewed",
  "active_build.contractor.attached": "Contractor attached",
  "active_build.contractor.invited": "Contractor invited",
  "active_build.cost_item.created": "Cost item added",
  "active_build.cost_item.deleted": "Cost item removed",
  "active_build.cost_item.updated": "Cost item updated",
  "active_build.created": "Active Build created",
  "active_build.document.created": "Document added",
  "active_build.draw.approved": "Draw approved",
  "active_build.draw.created": "Draw created",
  "active_build.draw.deleted": "Draw removed",
  "active_build.draw.rejected": "Draw rejected",
  "active_build.draw.released": "Draw funds released",
  "active_build.draw.requested": "Draw requested",
  "active_build.draw.updated": "Draw updated",
  "active_build.draw.withdrawn": "Draw request withdrawn",
  "active_build.evidence.created": "Evidence added",
  "active_build.evidence.deleted": "Evidence removed",
  "active_build.evidence.reviewed": "Evidence reviewed",
  "active_build.evidence.updated": "Evidence updated",
  "active_build.facility_change.requested": "Loan facility change requested",
  "active_build.facility_change.reviewed": "Loan facility change reviewed",
  "active_build.milestone.approved": "Milestone approved",
  "active_build.milestone.created": "Milestone created",
  "active_build.milestone.deleted": "Milestone removed",
  "active_build.milestone.info_requested": "Milestone information requested",
  "active_build.milestone.rejected": "Milestone rejected",
  "active_build.milestone.schedule_revised": "Milestone schedule revised",
  "active_build.milestone.started": "Milestone started",
  "active_build.milestone.updated": "Milestone updated",
  "active_build.milestone_completion.submitted":
    "Milestone completion submitted",
  "active_build.note.created": "Build note added",
  "active_build.site_visit.recorded": "Site visit recorded",
  "active_build.site_visit.requested": "Site visit requested",
  "active_build.site_visit.token_report_submitted":
    "Site visit report submitted",
  "active_build.submilestone.execution_updated":
    "Submilestone progress updated",
  "active_build.timeline_plan.updated": "Construction roadmap updated",
};
const ACTIVE_BUILD_PREFIX_RE = /^active_build[._]/;
const CAMEL_CASE_BOUNDARY_RE = /([a-z0-9])([A-Z])/g;
const EVENT_SEPARATOR_RE = /[._-]+/g;

function humanize(value = ""): string {
  const words = value
    .replace(ACTIVE_BUILD_PREFIX_RE, "")
    .replace(CAMEL_CASE_BOUNDARY_RE, "$1 $2")
    .replace(EVENT_SEPARATOR_RE, " ")
    .trim()
    .toLowerCase();
  return words ? `${words[0]?.toUpperCase() ?? ""}${words.slice(1)}` : "Event";
}

function eventTitle(eventType = ""): string {
  return EVENT_TITLES[eventType] ?? humanize(eventType);
}

function eventScope(eventType = ""): string {
  const normalized = eventType.replace(ACTIVE_BUILD_PREFIX_RE, "");
  if (normalized.includes("site_visit")) {
    return "Site visit";
  }
  if (normalized.includes("milestone")) {
    return normalized.includes("submilestone") ? "Submilestone" : "Milestone";
  }
  if (normalized.includes("draw")) {
    return "Draw";
  }
  if (normalized.includes("evidence")) {
    return "Evidence";
  }
  if (normalized.includes("material")) {
    return "Materials";
  }
  if (normalized.includes("document")) {
    return "Document";
  }
  if (normalized.includes("budget") || normalized.includes("cost_item")) {
    return "Budget";
  }
  if (normalized.includes("facility")) {
    return "Loan facility";
  }
  if (normalized.includes("contractor")) {
    return "Contractor";
  }
  return "Active Build";
}

function eventIcon(eventType = ""): ReactNode {
  if (eventType.includes("site_visit")) {
    return <MapPinCheck aria-hidden="true" />;
  }
  if (eventType.includes("milestone")) {
    return <Flag aria-hidden="true" />;
  }
  if (eventType.includes("draw") || eventType.includes("facility")) {
    return <DollarSign aria-hidden="true" />;
  }
  if (eventType.includes("evidence") || eventType.includes("document")) {
    return <FileText aria-hidden="true" />;
  }
  return <CircleDot aria-hidden="true" />;
}

function formatAuditTimestamp(createdAt: number): string {
  const date = new Date(createdAt);
  if (Number.isNaN(date.valueOf())) {
    return "Time unavailable";
  }
  return new Intl.DateTimeFormat("en-CA", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function auditChanges(event: AuditEvent): AuditChange[] {
  if (event.changes?.length) {
    return event.changes;
  }
  if (!(event.beforeSummary || event.afterSummary)) {
    return [];
  }
  return [
    {
      after: event.afterSummary ?? "Not set",
      before: event.beforeSummary ?? "Not set",
      field: "State",
    },
  ];
}

function mostCommonEntityLabel(events: AuditEvent[]): string | undefined {
  const counts = new Map<string, number>();
  let selected: string | undefined;
  let selectedCount = 0;
  for (const event of events) {
    const label = event.entityLabel?.trim();
    if (!label) {
      continue;
    }
    const count = (counts.get(label) ?? 0) + 1;
    counts.set(label, count);
    if (count > selectedCount) {
      selected = label;
      selectedCount = count;
    }
  }
  return selected;
}

export function EventRailPanel({
  quickActionEvents,
  auditEvents,
  onOpenCanonicalTarget,
  onView,
  onResolve,
}: EventRailPanelProps): ReactNode {
  return (
    <div className="flex flex-col gap-7" data-testid="build-detail-rail">
      <RailSection count={quickActionEvents.length} title="Open work">
        {quickActionEvents.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            No decisions or reviews need attention.
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {quickActionEvents.map((event) => (
              <Card
                className="gap-3 rounded-xl p-4 shadow-none"
                data-event-id={event._id}
                data-event-type={event.entityType}
                data-testid={`rail-quick-event-${event._id}`}
                key={event._id}
                render={<article />}
              >
                <div className="flex items-start gap-3">
                  <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-foreground [&_svg]:size-4">
                    {eventIcon(event.entityType)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-sm">{event.title}</p>
                    <p className="mt-0.5 text-muted-foreground text-xs">
                      {event.entityLabel}
                    </p>
                  </div>
                </div>
                <p className="text-sm leading-relaxed">{event.body}</p>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="text-muted-foreground text-xs">
                    {event.sourceLabel} · {formatRelative(event.createdAt)}
                  </p>
                  <div className="flex gap-2">
                    <Button
                      data-testid={`rail-quick-event-view-${event._id}`}
                      onClick={(clickEvent) => {
                        if (event.canonicalTarget && onOpenCanonicalTarget) {
                          clickEvent.preventDefault();
                          onOpenCanonicalTarget(
                            event.canonicalTarget,
                            event.canonicalTargetContext,
                          );
                          return;
                        }
                        onView?.(event);
                      }}
                      render={
                        // biome-ignore lint/a11y/useAnchorContent: Button merges its children into the rendered anchor.
                        <a aria-label={event.actionLabel} href={event.href} />
                      }
                      size="xs"
                      variant="outline"
                    >
                      {event.actionLabel}
                    </Button>
                    {event.resolutionMode === "recipient" && onResolve ? (
                      <Button
                        data-testid={`rail-quick-event-resolve-${event._id}`}
                        onClick={() => onResolve(event)}
                        size="xs"
                      >
                        Resolve
                      </Button>
                    ) : null}
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </RailSection>

      <RailSection count={auditEvents.length} title="Audit history">
        <ol className="divide-y divide-border" data-testid="rail-event-log">
          {auditEvents.length === 0 ? (
            <li className="py-2 text-muted-foreground text-sm">
              No audit events have been recorded.
            </li>
          ) : (
            auditEvents.map((event) => {
              const changes = auditChanges(event);
              return (
                <li
                  className="grid grid-cols-[2rem_minmax(0,1fr)] gap-3 py-5 first:pt-2"
                  data-event-type={event.eventType}
                  data-testid={`rail-log-${event._id}`}
                  key={event._id}
                >
                  <span className="flex size-8 items-center justify-center rounded-lg border bg-background text-muted-foreground shadow-xs/5 [&_svg]:size-4">
                    {eventIcon(event.eventType)}
                  </span>
                  <article className="min-w-0">
                    <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
                      <div className="min-w-0">
                        <h5 className="font-semibold text-sm leading-5">
                          {eventTitle(event.eventType)}
                        </h5>
                        <Badge className="mt-1" size="sm" variant="outline">
                          {eventScope(event.eventType)}
                        </Badge>
                      </div>
                      <time
                        className="shrink-0 text-muted-foreground text-xs"
                        dateTime={new Date(event.createdAt).toISOString()}
                        title={formatAuditTimestamp(event.createdAt)}
                      >
                        {formatRelative(event.createdAt)}
                      </time>
                    </div>

                    {changes.length ? (
                      <dl className="mt-3 overflow-hidden rounded-lg border bg-muted/35">
                        {changes.map((change) => (
                          <div
                            className="grid grid-cols-[minmax(5.5rem,0.7fr)_minmax(0,1fr)] gap-x-3 border-b px-3 py-2 last:border-b-0"
                            key={`${event._id}-${change.field}`}
                          >
                            <dt className="text-muted-foreground text-xs">
                              {change.field}
                            </dt>
                            <dd className="min-w-0 text-xs">
                              <span className="text-muted-foreground line-through decoration-border">
                                {change.before}
                              </span>
                              <span
                                aria-hidden="true"
                                className="px-1.5 text-muted-foreground"
                              >
                                →
                              </span>
                              <span className="font-medium">
                                {change.after}
                              </span>
                            </dd>
                          </div>
                        ))}
                      </dl>
                    ) : null}

                    {event.reason ? (
                      <p className="mt-3 text-sm leading-relaxed">
                        <span className="font-medium">Reason:</span>{" "}
                        {event.reason}
                      </p>
                    ) : null}

                    {event.warnings?.length ? (
                      <div className="mt-3 rounded-lg bg-warning/8 px-3 py-2 text-warning-foreground">
                        {event.warnings.map((warning) => (
                          <p
                            className="flex items-start gap-2 text-xs leading-relaxed"
                            key={warning}
                          >
                            <TriangleAlert
                              aria-hidden="true"
                              className="mt-0.5 size-3.5 shrink-0"
                            />
                            {humanize(warning)}
                          </p>
                        ))}
                      </div>
                    ) : null}

                    {event.canonicalTarget && onOpenCanonicalTarget ? (
                      <Button
                        className="mt-3"
                        onClick={() =>
                          onOpenCanonicalTarget(
                            event.canonicalTarget as BuildDetailTarget,
                            event.canonicalTargetContext,
                          )
                        }
                        size="xs"
                        type="button"
                        variant="outline"
                      >
                        Open detail
                      </Button>
                    ) : null}

                    <p className="mt-3 flex items-center gap-1.5 text-muted-foreground text-xs">
                      <UserRound aria-hidden="true" className="size-3.5" />
                      {event.actorPersona}
                      <span aria-hidden="true">·</span>
                      <span>{formatAuditTimestamp(event.createdAt)}</span>
                    </p>
                  </article>
                </li>
              );
            })
          )}
        </ol>
      </RailSection>
    </div>
  );
}

export function EventRailSheet({
  auditEvents,
  onOpenCanonicalTarget,
  onOpenChange,
  onResolve,
  onView,
  open,
  quickActionEvents,
}: EventRailSheetProps): ReactNode {
  const buildLabel = mostCommonEntityLabel(auditEvents);
  return (
    <Sheet onOpenChange={onOpenChange} open={open}>
      <SheetContent
        className="w-full sm:max-w-xl"
        data-testid="build-detail-events-sheet"
        side="right"
      >
        <SheetHeader>
          <SheetTitle>Events and audit log</SheetTitle>
          <SheetDescription>
            {buildLabel
              ? `Decisions, state changes, and open work for ${buildLabel}.`
              : "Decisions, state changes, and open work for this Active Build."}
          </SheetDescription>
        </SheetHeader>
        <SheetPanel className="px-6 pt-2 pb-6">
          <EventRailPanel
            auditEvents={auditEvents}
            onOpenCanonicalTarget={onOpenCanonicalTarget}
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
  onOpenCanonicalTarget,
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
      onOpenCanonicalTarget={onOpenCanonicalTarget}
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
      <header className="mb-3 flex items-center justify-between gap-3">
        <h4 className="font-semibold text-muted-foreground text-xs uppercase tracking-wider">
          {title}
        </h4>
        <Badge
          aria-label={`${count} ${title.toLowerCase()}`}
          variant="secondary"
        >
          {count}
        </Badge>
      </header>
      {children}
    </section>
  );
}
