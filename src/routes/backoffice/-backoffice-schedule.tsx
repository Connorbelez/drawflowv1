import {
  CalendarClock,
  CalendarDays,
  CheckCircle2,
  CircleAlert,
  ClipboardCheck,
  FileText,
  PanelRightClose,
} from "lucide-react";
import { type FormEvent, useMemo, useState } from "react";

import { Badge } from "#/components/ui/badge.tsx";
import { Button } from "#/components/ui/button.tsx";
import { Calendar } from "#/components/ui/calendar.tsx";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "#/components/ui/card.tsx";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPanel,
  DialogTitle,
} from "#/components/ui/dialog.tsx";
import { Textarea } from "#/components/ui/textarea.tsx";
import type {
  ActiveBuild,
  OperationsHandoffReturnDecision,
  QuickAction,
  ScheduleEvent,
} from "#/features/backoffice-dashboard/mock-data.ts";

export interface OperationsEscalationInput {
  decisionPreview: string;
  evidenceSummary: string;
  reason: string;
  recommendation: string;
  requiredAction: string;
  warnings: string[];
}

export interface OperationsReturnDecisionInput {
  decision: OperationsHandoffReturnDecision;
  followUpAssignment: string;
  reason: string;
}

const actionIcon = {
  build: CircleAlert,
  drawRequest: FileText,
  milestone: CheckCircle2,
  proposal: FileText,
  siteVisit: ClipboardCheck,
} satisfies Record<QuickAction["type"], typeof FileText>;

export function ScheduleRail({
  canMakeFinalDecision = false,
  collapsed,
  date,
  events,
  onAcknowledgeHandoff,
  onCollapsedChange,
  onEscalate,
  onReturnDecision,
  quickActions,
}: {
  canMakeFinalDecision?: boolean;
  collapsed: boolean;
  date: Date;
  events: ScheduleEvent[];
  onAcknowledgeHandoff?: (handoffId: string) => Promise<unknown>;
  onCollapsedChange: (collapsed: boolean) => void;
  onEscalate?: (
    action: QuickAction,
    input: OperationsEscalationInput
  ) => Promise<unknown>;
  onReturnDecision?: (
    handoffId: string,
    input: OperationsReturnDecisionInput
  ) => Promise<unknown>;
  quickActions: QuickAction[];
}) {
  const eventDays = useMemo(
    () => events.map((event) => new Date(event.date)),
    [events]
  );

  if (collapsed) {
    return (
      <aside
        className="flex min-w-0 flex-col items-center gap-2"
        data-testid="backoffice-schedule-rail-collapsed"
      >
        <Button
          aria-label="Expand schedule calendar"
          className="relative size-11 shrink-0"
          data-testid="backoffice-schedule-calendar-expand"
          onClick={() => onCollapsedChange(false)}
          size="icon"
          title="Show schedule"
          variant="outline"
        >
          <CalendarDays className="size-5" />
          {quickActions.length > 0 ? (
            <Badge
              className="absolute -top-1 -right-1 min-w-5 px-1 text-[10px]"
              variant="warning"
            >
              {quickActions.length}
            </Badge>
          ) : null}
        </Button>
      </aside>
    );
  }

  return (
    <aside
      className="flex min-w-0 flex-col gap-4"
      data-testid="backoffice-schedule-rail-expanded"
    >
      <Card>
        <CardHeader className="border-b p-4">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <CardTitle className="text-base">Schedule</CardTitle>
              <CardDescription>{formatMonthYear(date)}</CardDescription>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <Button
                aria-label="Collapse schedule calendar"
                data-testid="backoffice-schedule-calendar-collapse"
                onClick={() => onCollapsedChange(true)}
                size="icon-sm"
                title="Collapse schedule"
                variant="ghost"
              >
                <PanelRightClose className="size-4" />
              </Button>
              <CalendarClock className="size-5 text-muted-foreground" />
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4 p-4">
          <Calendar
            className="mx-auto w-full"
            defaultMonth={date}
            modifiers={{ hasEvent: eventDays }}
            modifiersClassNames={{
              hasEvent:
                "after:absolute after:right-1 after:top-1 after:size-1.5 after:rounded-full after:bg-primary",
            }}
            selected={date}
          />
          <div className="space-y-2">
            {events.map((event) => (
              <ScheduleEventRow event={event} key={event.id} />
            ))}
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="border-b p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <CardTitle className="text-base">Events + Quick Action</CardTitle>
              <CardDescription>Admin review queue</CardDescription>
            </div>
            <Badge variant="warning">{quickActions.length} items</Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-3 p-4">
          {quickActions.length === 0 ? (
            <p className="rounded-lg border border-dashed p-4 text-center text-muted-foreground text-sm">
              No operational items need action.
            </p>
          ) : (
            quickActions.map((action) => (
              <QuickActionCard
                action={action}
                canMakeFinalDecision={canMakeFinalDecision}
                key={action.id}
                onAcknowledgeHandoff={onAcknowledgeHandoff}
                onEscalate={canMakeFinalDecision ? undefined : onEscalate}
                onReturnDecision={onReturnDecision}
              />
            ))
          )}
        </CardContent>
      </Card>
    </aside>
  );
}

function ScheduleEventRow({ event }: { event: ScheduleEvent }) {
  return (
    <div className="flex items-center gap-3 rounded-lg border bg-background p-3">
      <div className="w-12 shrink-0 text-center">
        <div className="text-[0.625rem] text-muted-foreground uppercase">
          {formatWeekday(event.date)}
        </div>
        <div className="font-semibold">{formatDay(event.date)}</div>
      </div>
      <div className="min-w-0 border-l pl-3">
        <p className="truncate font-medium text-sm">{event.label}</p>
        <p className="text-muted-foreground text-xs">
          {formatTime(event.date)}
        </p>
      </div>
    </div>
  );
}

function QuickActionCard({
  action,
  canMakeFinalDecision,
  onAcknowledgeHandoff,
  onEscalate,
  onReturnDecision,
}: {
  action: QuickAction;
  canMakeFinalDecision: boolean;
  onAcknowledgeHandoff?: (handoffId: string) => Promise<unknown>;
  onEscalate?: (
    action: QuickAction,
    input: OperationsEscalationInput
  ) => Promise<unknown>;
  onReturnDecision?: (
    handoffId: string,
    input: OperationsReturnDecisionInput
  ) => Promise<unknown>;
}) {
  const Icon = actionIcon[action.type];
  const [dialogMode, setDialogMode] = useState<"escalate" | "return" | null>(
    null
  );
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [returnDecision, setReturnDecision] =
    useState<OperationsHandoffReturnDecision>("continue");
  const handoff = action.handoff;

  async function handleEscalationSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!onEscalate) {
      return;
    }
    const formData = new FormData(event.currentTarget);
    setPending(true);
    setError(null);
    try {
      await onEscalate(action, {
        decisionPreview: String(formData.get("decisionPreview") ?? ""),
        evidenceSummary: String(formData.get("evidenceSummary") ?? ""),
        reason: String(formData.get("reason") ?? ""),
        recommendation: String(formData.get("recommendation") ?? ""),
        requiredAction: String(formData.get("requiredAction") ?? ""),
        warnings: String(formData.get("warnings") ?? "")
          .split("\n")
          .map((warning) => warning.trim())
          .filter(Boolean),
      });
      setDialogMode(null);
    } catch {
      setError("Unable to send this escalation. Try again.");
    } finally {
      setPending(false);
    }
  }

  async function handleReturnSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!(handoff && onReturnDecision)) {
      return;
    }
    const formData = new FormData(event.currentTarget);
    setPending(true);
    setError(null);
    try {
      await onReturnDecision(handoff._id, {
        decision: returnDecision,
        followUpAssignment: String(formData.get("followUpAssignment") ?? ""),
        reason: String(formData.get("returnReason") ?? ""),
      });
      setDialogMode(null);
    } catch {
      setError("Unable to return this decision. Try again.");
    } finally {
      setPending(false);
    }
  }

  async function handleAcknowledge() {
    if (!(handoff && onAcknowledgeHandoff)) {
      return;
    }
    setPending(true);
    setError(null);
    try {
      await onAcknowledgeHandoff(handoff._id);
    } catch {
      setError("Unable to acknowledge this return. Try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <article className="space-y-3 rounded-lg border bg-background p-3">
        <div className="flex items-start gap-3">
          <div className="grid size-8 shrink-0 place-items-center rounded-lg bg-secondary text-secondary-foreground">
            <Icon aria-hidden="true" className="size-4" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-2">
              <p className="font-medium text-sm">{action.title}</p>
              <span className="shrink-0 text-muted-foreground text-xs">
                {action.ageLabel}
              </span>
            </div>
            <p className="mt-1 text-muted-foreground text-xs">
              {action.entityLabel}
            </p>
            <p className="text-muted-foreground text-xs">
              {action.buildId} · {action.address}
            </p>
          </div>
        </div>
        <dl className="grid gap-2 text-xs">
          <div className="flex items-start justify-between gap-3">
            <dt className="text-muted-foreground">Owner</dt>
            <dd className="text-right font-medium">{action.ownerLabel}</dd>
          </div>
          <div className="flex items-start justify-between gap-3">
            <dt className="text-muted-foreground">Blocker</dt>
            <dd className="max-w-44 text-right">{action.blocker}</dd>
          </div>
          <div className="flex items-start justify-between gap-3">
            <dt className="text-muted-foreground">Recommendation</dt>
            <dd className="max-w-44 text-right">
              {action.recommendationLabel}
            </dd>
          </div>
        </dl>

        {handoff ? <OperationsHandoffSummary action={action} /> : null}
        {error ? (
          <p className="text-destructive text-xs" role="alert">
            {error}
          </p>
        ) : null}

        <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-3">
          <div>
            <p className="font-medium text-xs">{action.authorityLabel}</p>
            <p className="text-muted-foreground text-xs">{action.dueLabel}</p>
          </div>
          <div className="flex flex-wrap justify-end gap-2">
            <Button
              render={<a href={action.href}>{action.actionLabel}</a>}
              size="sm"
              variant="outline"
            >
              {action.actionLabel}
            </Button>
            {!handoff && onEscalate && !canMakeFinalDecision ? (
              <Button onClick={() => setDialogMode("escalate")} size="sm">
                Prepare escalation
              </Button>
            ) : null}
            {handoff?.acknowledgementState === "pending_decision" &&
            canMakeFinalDecision &&
            onReturnDecision ? (
              <Button onClick={() => setDialogMode("return")} size="sm">
                Record return decision
              </Button>
            ) : null}
            {handoff?.acknowledgementState === "pending_decision" &&
            !canMakeFinalDecision ? (
              <Badge variant="warning">Awaiting Lender Admin</Badge>
            ) : null}
            {handoff?.acknowledgementState === "returned" &&
            action.canAcknowledgeHandoff &&
            onAcknowledgeHandoff ? (
              <Button
                loading={pending}
                onClick={handleAcknowledge}
                size="sm"
                variant="secondary"
              >
                Acknowledge return
              </Button>
            ) : null}
            {handoff?.acknowledgementState === "acknowledged" ? (
              <Badge variant="success">Return acknowledged</Badge>
            ) : null}
          </div>
        </div>
      </article>

      <Dialog
        onOpenChange={(open) => {
          if (!(open || pending)) {
            setDialogMode(null);
            setError(null);
          }
        }}
        open={dialogMode === "escalate"}
      >
        <DialogContent className="sm:max-w-xl">
          <form onSubmit={handleEscalationSubmit}>
            <DialogHeader>
              <DialogTitle>Escalate {action.title.toLowerCase()}</DialogTitle>
              <DialogDescription>
                Package the evidence, recommendation, warnings, required action,
                and decision preview before handing this item to Lender Admin.
              </DialogDescription>
            </DialogHeader>
            <DialogPanel className="grid gap-4">
              <OperationsHandoffTextarea
                label="Evidence summary"
                name="evidenceSummary"
              />
              <OperationsHandoffTextarea
                label="Recommendation"
                name="recommendation"
              />
              <OperationsHandoffTextarea
                description="Enter one warning per line."
                label="Warnings"
                name="warnings"
                required={false}
              />
              <OperationsHandoffTextarea
                label="Required action"
                name="requiredAction"
              />
              <OperationsHandoffTextarea
                label="Decision preview"
                name="decisionPreview"
              />
              <OperationsHandoffTextarea
                label="Escalation reason"
                name="reason"
              />
              {error ? (
                <p className="text-destructive text-sm" role="alert">
                  {error}
                </p>
              ) : null}
            </DialogPanel>
            <DialogFooter>
              <DialogClose render={<Button type="button" variant="outline" />}>
                Cancel
              </DialogClose>
              <Button loading={pending} type="submit">
                Send to Lender Admin
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog
        onOpenChange={(open) => {
          if (!(open || pending)) {
            setDialogMode(null);
            setError(null);
          }
        }}
        open={dialogMode === "return"}
      >
        <DialogContent className="sm:max-w-lg">
          <form onSubmit={handleReturnSubmit}>
            <DialogHeader>
              <DialogTitle>Return operations decision</DialogTitle>
              <DialogDescription>
                Record the decision, reason, and follow-up assignment. This does
                not replace the canonical approval or release action.
              </DialogDescription>
            </DialogHeader>
            <DialogPanel className="grid gap-4">
              <label
                className="grid gap-1.5 text-sm"
                htmlFor={`decision-${action.id}`}
              >
                <span className="font-medium">Return decision</span>
                <select
                  className="h-9 rounded-lg border bg-background px-3 outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  id={`decision-${action.id}`}
                  onChange={(event) =>
                    setReturnDecision(
                      event.target.value as OperationsHandoffReturnDecision
                    )
                  }
                  value={returnDecision}
                >
                  <option value="continue">Continue</option>
                  <option value="reroute">Reroute</option>
                  <option value="close">Close</option>
                </select>
              </label>
              <OperationsHandoffTextarea
                label="Return reason"
                name="returnReason"
              />
              <OperationsHandoffTextarea
                label="Follow-up assignment"
                name="followUpAssignment"
              />
              {error ? (
                <p className="text-destructive text-sm" role="alert">
                  {error}
                </p>
              ) : null}
            </DialogPanel>
            <DialogFooter>
              <DialogClose render={<Button type="button" variant="outline" />}>
                Cancel
              </DialogClose>
              <Button loading={pending} type="submit">
                Return to operations
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

function OperationsHandoffSummary({ action }: { action: QuickAction }) {
  const handoff = action.handoff;
  if (!handoff) {
    return null;
  }
  return (
    <section
      aria-label="Operations handoff"
      className="grid gap-2 rounded-lg bg-muted/60 p-3 text-xs"
    >
      <div className="flex items-center justify-between gap-3">
        <p className="font-medium">Operations handoff</p>
        <Badge variant="outline">
          {formatHandoffState(handoff.acknowledgementState)}
        </Badge>
      </div>
      <p>
        <span className="text-muted-foreground">Evidence: </span>
        {handoff.evidenceSummary}
      </p>
      <p>
        <span className="text-muted-foreground">Recommendation: </span>
        {handoff.recommendation}
      </p>
      <p>
        <span className="text-muted-foreground">Required action: </span>
        {handoff.requiredAction}
      </p>
      <p>
        <span className="text-muted-foreground">Decision preview: </span>
        {handoff.decisionPreview}
      </p>
      {handoff.warnings.length > 0 ? (
        <div>
          <p className="text-muted-foreground">Warnings</p>
          <ul className="list-disc pl-4">
            {handoff.warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        </div>
      ) : null}
      {handoff.returnReason ? (
        <div className="grid gap-1 border-t pt-2">
          <p className="font-medium">
            Returned: {formatReturnDecision(handoff.returnDecision)}
          </p>
          <p>{handoff.returnReason}</p>
          {handoff.followUpAssignment ? (
            <p>
              <span className="text-muted-foreground">Follow-up: </span>
              {handoff.followUpAssignment}
            </p>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

function OperationsHandoffTextarea({
  description,
  label,
  name,
  required = true,
}: {
  description?: string;
  label: string;
  name: string;
  required?: boolean;
}) {
  const id = `operations-handoff-${name}`;
  const descriptionId = description ? `${id}-description` : undefined;
  return (
    <label className="grid gap-1.5 text-sm" htmlFor={id}>
      <span className="font-medium">{label}</span>
      {description ? (
        <span className="text-muted-foreground text-xs" id={descriptionId}>
          {description}
        </span>
      ) : null}
      <Textarea
        aria-describedby={descriptionId}
        aria-label={label}
        id={id}
        minLength={required ? 8 : undefined}
        name={name}
        required={required}
        rows={3}
      />
    </label>
  );
}

export function formatHandoffState(
  state: NonNullable<QuickAction["handoff"]>["acknowledgementState"]
) {
  const labels = {
    acknowledged: "Acknowledged",
    pending_decision: "Awaiting decision",
    returned: "Returned",
  } satisfies Record<
    NonNullable<QuickAction["handoff"]>["acknowledgementState"],
    string
  >;
  return labels[state];
}

export function formatReturnDecision(
  decision: OperationsHandoffReturnDecision | undefined
) {
  if (!decision) {
    return "Decision recorded";
  }
  return {
    close: "Close",
    continue: "Continue",
    reroute: "Reroute",
  }[decision];
}

export function formatMilestoneState(state: ActiveBuild["milestoneState"]) {
  const labels: Record<ActiveBuild["milestoneState"], string> = {
    backlog: "Backlog",
    inProgress: "In progress",
    inReview: "In review",
  };

  return labels[state];
}

export function formatBuildStatusFilter(status: ActiveBuild["status"] | "all") {
  const labels: Record<ActiveBuild["status"] | "all", string> = {
    all: "All",
    behind: "Behind",
    onTrack: "On track",
    overBudget: "Over budget",
  };

  return labels[status];
}

export function centsToCurrency(value: number) {
  return new Intl.NumberFormat("en-US", {
    currency: "USD",
    maximumFractionDigits: 0,
    style: "currency",
  }).format(value / 100);
}

export function formatTimestamp(value: number | undefined) {
  if (!value) {
    return "Not recorded";
  }
  return new Intl.DateTimeFormat("en-US", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}

export function formatMonthYear(date: Date) {
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    year: "numeric",
  }).format(date);
}

export function formatWeekday(value: string) {
  return new Intl.DateTimeFormat("en-US", { weekday: "short" })
    .format(new Date(value))
    .toUpperCase();
}

export function formatDay(value: string) {
  return new Intl.DateTimeFormat("en-US", { day: "numeric" }).format(
    new Date(value)
  );
}

export function formatTime(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}
