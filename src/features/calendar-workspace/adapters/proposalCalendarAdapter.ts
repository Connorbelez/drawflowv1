import {
  addDaysIso,
  daysBetweenIso,
  normalizeCalendarEvent,
} from "../calendarEventProjection";
import type {
  CalendarAction,
  CalendarEditRequest,
  CalendarSavedView,
  DrawFlowCalendarEvent,
  DrawFlowCalendarWorkspaceData,
} from "../calendarTypes";

const DEFAULT_PROPOSAL_CALENDAR_BASE_DATE = "2026-06-01";

export interface ProposalCalendarAdapterActions {
  addEvidenceDueDate?: CalendarTargetDateHandler;
  addReviewTargetDate?: CalendarTargetDateHandler;
  reviseDrawTiming?: (input: {
    drawKey: string;
    reason?: string;
    timingDay: number;
  }) => Promise<unknown> | unknown;
  reviseMilestoneSchedule?: (input: {
    dayEnd: number;
    dayStart: number;
    milestoneKey: string;
    reason?: string;
  }) => Promise<unknown> | unknown;
}

export type CalendarTargetDateHandler = (input: {
  drawKey?: string;
  milestoneKey?: string;
  reason?: string;
  targetDate: string;
  targetTime?: string;
}) => Promise<unknown> | unknown;

export function buildProposalCalendarWorkspaceFromDetail(
  detail: any,
  options: { baseDate?: string; organizationId?: string } = {}
): DrawFlowCalendarWorkspaceData {
  const proposal = detail.proposal ?? {};
  const organizationId =
    options.organizationId ?? proposal.organizationId ?? "visual-fixture";
  const baseDate = resolveProposalCalendarBaseDate(
    options.baseDate,
    detail.activeBuild?.startDate,
    proposal.proposedStartDate
  );
  const events: DrawFlowCalendarEvent[] = [];
  const milestones = (detail.milestones ?? [])
    .slice()
    .sort((a: any, b: any) => (a.order ?? 0) - (b.order ?? 0));
  const draws = detail.draws ?? detail.plannedDraws ?? [];

  for (const milestone of milestones) {
    events.push(
      normalizeCalendarEvent({
        allDay: true,
        auditRequired: proposal.status !== "draft",
        editable: {
          canChangeAssignee: false,
          canChangeStatus: false,
          canMove: proposal.status !== "closed",
          canResizeEnd: proposal.status !== "closed",
          canResizeStart: proposal.status !== "closed",
          requiredReason:
            proposal.status === "draft" ? "none" : "scheduleChange",
        },
        endsAt: addDaysIso(baseDate, milestone.dayEnd ?? 0),
        entity: {
          id: String(milestone._id ?? milestone.key),
          key: milestone.key,
          type: "milestone",
        },
        id: `proposal:milestone:${milestone.key}`,
        kind: "milestone",
        metrics: {
          amountCents: milestone.drawAvailabilityCents,
          budgetCents: milestone.budgetCents,
        },
        milestoneKey: milestone.key,
        organizationId,
        relatedEntityIds: [String(proposal._id ?? "")],
        startsAt: addDaysIso(baseDate, milestone.dayStart ?? 0),
        status: proposal.status === "draft" ? "proposed" : "planned",
        subtitle: `Day ${milestone.dayStart ?? 0} to ${milestone.dayEnd ?? 0}`,
        surface: "proposal",
        timeBucket: "allDay",
        timezone: "America/Toronto",
        title: milestone.name,
        warnings: (milestone.dependencyKeys ?? []).map((key: string) => ({
          label: `Depends on ${key}`,
        })),
      })
    );
  }

  for (const submilestone of detail.submilestones ?? []) {
    const parent = milestones.find(
      (milestone: any) => milestone.key === submilestone.milestoneKey
    );
    const startsAt = addDaysIso(
      baseDate,
      submilestone.startDay ?? parent?.dayStart ?? 0
    );
    events.push(
      normalizeCalendarEvent({
        allDay: true,
        auditRequired: proposal.status !== "draft",
        editable: {
          canChangeAssignee: false,
          canChangeStatus: false,
          canMove: proposal.status !== "closed",
          canResizeEnd: proposal.status !== "closed",
          canResizeStart: false,
          requiredReason:
            proposal.status === "draft" ? "none" : "scheduleChange",
        },
        endsAt: addDaysIso(
          startsAt,
          Math.max(1, submilestone.durationDays ?? 1)
        ),
        entity: {
          id: String(submilestone._id ?? submilestone.key),
          key: submilestone.key,
          type: "milestone",
        },
        id: `proposal:submilestone:${submilestone.key}`,
        kind: "submilestone",
        metrics: { budgetCents: submilestone.budgetCents },
        milestoneKey: submilestone.milestoneKey,
        organizationId,
        relatedEntityIds: [String(proposal._id ?? "")],
        startsAt,
        status: "proposed",
        subtitle: submilestone.milestoneKey,
        surface: "proposal",
        timeBucket: "allDay",
        timezone: "America/Toronto",
        title: submilestone.name,
        warnings: [],
      })
    );
  }

  for (const draw of draws) {
    events.push(
      normalizeCalendarEvent({
        allDay: false,
        auditRequired: proposal.status !== "draft",
        drawGroupKey: draw.drawKey,
        editable: {
          canChangeAssignee: false,
          canChangeStatus: false,
          canMove: proposal.status !== "closed",
          canResizeEnd: false,
          canResizeStart: false,
          requiredReason:
            proposal.status === "draft" ? "none" : "scheduleChange",
        },
        entity: {
          id: String(draw._id ?? draw.drawKey),
          key: draw.drawKey,
          type: "draw",
        },
        id: `proposal:draw:${draw.drawKey}`,
        kind: "draw",
        metrics: { amountCents: draw.amountCents },
        milestoneKey: draw.milestoneKey,
        organizationId,
        relatedEntityIds: [String(proposal._id ?? "")],
        startsAt: addDaysIso(baseDate, draw.timingDay ?? 0),
        status: "proposed",
        subtitle: `Draw availability, day ${draw.timingDay ?? 0}`,
        surface: "proposal",
        timeBucket: "endOfDay",
        timezone: "America/Toronto",
        title: draw.label,
        warnings: [],
      })
    );
  }

  for (const document of detail.documents ?? []) {
    events.push(
      normalizeCalendarEvent({
        allDay: false,
        auditRequired: false,
        editable: {
          canChangeAssignee: false,
          canChangeStatus: false,
          canMove: false,
          canResizeEnd: false,
          canResizeStart: false,
          requiredReason: "none",
        },
        entity: { id: String(proposal._id ?? ""), type: "proposal" },
        id: `proposal:evidence:${document.fileName}`,
        kind: "evidence",
        organizationId,
        relatedEntityIds: [String(proposal._id ?? "")],
        startsAt: baseDate,
        status: document.status === "missing" ? "blocked" : "submitted",
        subtitle: document.documentType,
        surface: "proposal",
        timeBucket: "midday",
        timezone: "America/Toronto",
        title: document.fileName,
        warnings:
          document.documentType === "permit" && document.status === "missing"
            ? [{ label: "Permit missing" }]
            : [],
      })
    );
  }

  return {
    defaultTimeframe: "month",
    events,
    savedViews: defaultCalendarSavedViews(),
    source: {
      id: String(proposal._id ?? ""),
      location: proposal.location,
      status: proposal.status,
      title: proposal.buildName ?? "Build Proposal",
    },
    surface: "proposal",
    timeframes: ["day", "week", "month", "quarter", "agenda"],
    warnings: events.flatMap((event) => event.warnings),
  };
}

export function buildProposalCalendarActions(
  actions: ProposalCalendarAdapterActions
): CalendarAction[] {
  return [
    eventAction(
      "open-proposal-event",
      "Open detail",
      "Review this calendar event.",
      async () => {}
    ),
    eventAction(
      "revise-proposal-milestone",
      "Move proposal dates",
      "Adjust planned milestone dates.",
      async () => {},
      Boolean(actions.reviseMilestoneSchedule)
    ),
    eventAction(
      "revise-proposal-draw",
      "Edit draw timing",
      "Adjust planned reimbursement timing.",
      async () => {},
      Boolean(actions.reviseDrawTiming)
    ),
    dateAction(
      "add-proposal-evidence-due",
      "Add evidence due date",
      "Create an explicit evidence date assumption.",
      async (context) => {
        if (context.date) {
          await actions.addEvidenceDueDate?.({ targetDate: context.date });
        }
      },
      Boolean(actions.addEvidenceDueDate)
    ),
    dateAction(
      "add-proposal-review-target",
      "Add review lag target",
      "Create a proposal review/site-visit lag assumption.",
      async (context) => {
        if (context.date) {
          await actions.addReviewTargetDate?.({ targetDate: context.date });
        }
      },
      Boolean(actions.addReviewTargetDate)
    ),
  ];
}

export function createProposalCalendarEditHandler(input: {
  actions: ProposalCalendarAdapterActions;
  baseDate: string;
}) {
  const baseDate = resolveProposalCalendarBaseDate(input.baseDate);
  return async (request: CalendarEditRequest) => {
    const event = request.event;
    if (
      (event.kind === "milestone" || event.kind === "submilestone") &&
      event.milestoneKey
    ) {
      await input.actions.reviseMilestoneSchedule?.({
        dayEnd: daysBetweenIso(
          baseDate,
          request.nextEndsAt ?? request.nextStartsAt
        ),
        dayStart: daysBetweenIso(baseDate, request.nextStartsAt),
        milestoneKey: event.milestoneKey,
        reason: request.reason,
      });
      return;
    }
    if (event.kind === "draw" && event.drawGroupKey) {
      await input.actions.reviseDrawTiming?.({
        drawKey: event.drawGroupKey,
        reason: request.reason,
        timingDay: daysBetweenIso(baseDate, request.nextStartsAt),
      });
      return;
    }
    if (event.kind === "evidence") {
      await input.actions.addEvidenceDueDate?.({
        milestoneKey: event.milestoneKey,
        reason: request.reason,
        targetDate: request.nextStartsAt,
      });
      return;
    }
    if (event.kind === "review") {
      await input.actions.addReviewTargetDate?.({
        milestoneKey: event.milestoneKey,
        reason: request.reason,
        targetDate: request.nextStartsAt,
      });
    }
  };
}

function eventAction(
  id: string,
  label: string,
  description: string,
  onSelect: CalendarAction["onSelect"],
  enabled = true
): CalendarAction {
  return {
    appliesTo: "event",
    availability: enabled
      ? { state: "enabled" }
      : {
          reason:
            "This proposal state or viewer role cannot perform that calendar action.",
          state: "disabled",
        },
    description,
    id,
    label,
    onSelect,
    requiresConfirmation: false,
    requiresReason: false,
  };
}

function dateAction(
  id: string,
  label: string,
  description: string,
  onSelect: CalendarAction["onSelect"],
  enabled = true
): CalendarAction {
  return {
    appliesTo: "date",
    availability: enabled
      ? { state: "enabled" }
      : { reason: "Requires proposal planning authority.", state: "disabled" },
    description,
    id,
    label,
    onSelect,
    requiresConfirmation: false,
    requiresReason: false,
  };
}

function defaultCalendarSavedViews(): CalendarSavedView[] {
  return [
    {
      filters: { surface: "proposal" } as any,
      id: "proposal-feasibility",
      isDefault: true,
      label: "Proposal feasibility",
      timeframe: "month",
    },
    {
      filters: { needsAction: true },
      id: "my-week",
      isDefault: false,
      label: "My week",
      timeframe: "week",
    },
    {
      filters: { eventKinds: ["draw", "drawGroup", "loan"] },
      id: "capital-release",
      isDefault: false,
      label: "Capital release",
      timeframe: "month",
    },
    {
      filters: { eventKinds: ["evidence", "review", "adminDecision"] },
      id: "evidence-review",
      isDefault: false,
      label: "Evidence and review",
      timeframe: "agenda",
    },
    {
      filters: { statuses: ["overdue", "blocked"] },
      id: "overdue-blocked",
      isDefault: false,
      label: "Overdue and blocked",
      timeframe: "agenda",
    },
  ];
}

function resolveProposalCalendarBaseDate(...candidates: unknown[]): string {
  for (const candidate of candidates) {
    const normalized = normalizeIsoDateOnly(candidate);
    if (normalized) {
      return normalized;
    }
  }
  return DEFAULT_PROPOSAL_CALENDAR_BASE_DATE;
}

function normalizeIsoDateOnly(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const candidate = value.trim().slice(0, 10);
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(candidate);
  if (!match) {
    return null;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day);

  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null;
  }

  return candidate;
}
