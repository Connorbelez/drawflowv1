import {
  addDaysIso,
  daysBetweenIso,
  normalizeCalendarEvent,
} from "../calendarEventProjection";
import type {
  CalendarAction,
  CalendarActionContext,
  CalendarEditRequest,
  CalendarSavedView,
  DrawFlowCalendarEvent,
  DrawFlowCalendarWorkspaceData,
} from "../calendarTypes";

export interface ActiveBuildCalendarAdapterActions {
  approveDraw?: (drawKey: string) => Promise<unknown> | unknown;
  approveMilestone?: (milestoneKey: string) => Promise<unknown> | unknown;
  assignSiteVisit?: (milestoneKey: string) => Promise<unknown> | unknown;
  cancelSiteVisit?: (input: { reason: string; visitId: string }) => Promise<unknown> | unknown;
  releaseDraw?: (drawKey: string) => Promise<unknown> | unknown;
  requestDraw?: (drawKey: string) => Promise<unknown> | unknown;
  requestLoanFacilityDateChange?: (input: {
    reason: string;
    requestedPaybackDate: string;
  }) => Promise<unknown> | unknown;
  requestMilestoneInfo?: (input: {
    milestoneKey: string;
    note: string;
  }) => Promise<unknown> | unknown;
  rescheduleSiteVisit?: (input: {
    reason: string;
    requestedDay: number;
    requestedTime?: string;
    visitId: string;
  }) => Promise<unknown> | unknown;
  reviseMilestoneSchedule?: (input: {
    dayEnd: number;
    dayStart: number;
    milestoneKey: string;
    reason: string;
  }) => Promise<unknown> | unknown;
  scheduleSiteVisit?: (input: {
    milestoneKey: string;
    note?: string;
    requestedDay: number;
    requestedTime?: string;
  }) => Promise<unknown> | unknown;
  setAdminDecisionTargetDate?: CalendarTargetDateHandler;
  setDrawReleaseTargetDate?: CalendarTargetDateHandler;
  setEvidenceDueDate?: CalendarTargetDateHandler;
  setReviewTargetDate?: CalendarTargetDateHandler;
  startMilestoneWork?: (milestoneKey: string) => Promise<unknown> | unknown;
}

export type CalendarTargetDateHandler = (input: {
  drawKey?: string;
  milestoneKey?: string;
  reason?: string;
  targetDate: string;
  targetTime?: string;
}) => Promise<unknown> | unknown;

export function buildActiveBuildCalendarWorkspaceFromDetail(
  detail: any,
  options: { organizationId?: string } = {},
): DrawFlowCalendarWorkspaceData {
  const organizationId = options.organizationId ?? detail.build?.organizationId ?? "visual-fixture";
  const baseDate = detail.build?.startDate ?? "2026-06-01";
  const events: DrawFlowCalendarEvent[] = [];
  const milestones = (detail.milestones ?? []).slice().sort((a: any, b: any) => (a.order ?? 0) - (b.order ?? 0));

  for (const milestone of milestones) {
    events.push(
      normalizeCalendarEvent({
        allDay: true,
        auditRequired: true,
        editable: {
          canChangeAssignee: false,
          canChangeStatus: true,
          canMove: !["complete", "approved"].includes(milestone.status),
          canResizeEnd: !["complete", "approved"].includes(milestone.status),
          canResizeStart: !["complete", "approved"].includes(milestone.status),
          immutableReason:
            milestone.status === "complete"
              ? "Completed milestone actuals are immutable."
              : undefined,
          requiredReason: "scheduleChange",
        },
        endsAt: addDaysIso(baseDate, milestone.dayEnd ?? 0),
        entity: { id: String(milestone._id ?? milestone.key), key: milestone.key, type: "milestone" },
        id: `activeBuild:milestone:${milestone.key}`,
        kind: "milestone",
        metrics: {
          amountCents: milestone.drawAvailabilityCents,
          budgetCents: milestone.budgetCents,
          progressPercent: milestone.progressPercent,
        },
        milestoneKey: milestone.key,
        organizationId,
        relatedEntityIds: [String(detail.build?._id ?? "")],
        startsAt: addDaysIso(baseDate, milestone.dayStart ?? 0),
        status: activeMilestoneStatus(milestone.status),
        subtitle: `Day ${milestone.dayStart ?? 0} to ${milestone.dayEnd ?? 0}`,
        surface: "activeBuild",
        timeBucket: "allDay",
        timezone: "America/Toronto",
        title: milestone.name,
        warnings: (milestone.dependencyKeys ?? []).map((key: string) => ({
          label: `Depends on ${key}`,
        })),
      }),
    );
  }

  for (const submilestone of detail.submilestones ?? []) {
    const parent = milestones.find((milestone: any) => milestone.key === submilestone.milestoneKey);
    const startsAt = addDaysIso(baseDate, parent?.dayStart ?? 0);
    events.push(
      normalizeCalendarEvent({
        allDay: true,
        auditRequired: true,
        editable: {
          canChangeAssignee: false,
          canChangeStatus: true,
          canMove: submilestone.status !== "complete",
          canResizeEnd: submilestone.status !== "complete",
          canResizeStart: false,
          requiredReason: "scheduleChange",
        },
        endsAt: addDaysIso(startsAt, Math.max(1, submilestone.durationDays ?? 1)),
        entity: { id: String(submilestone._id ?? submilestone.key), key: submilestone.key, type: "milestone" },
        id: `activeBuild:submilestone:${submilestone.key}`,
        kind: "submilestone",
        metrics: { budgetCents: submilestone.budgetCents },
        milestoneKey: submilestone.milestoneKey,
        organizationId,
        relatedEntityIds: [String(detail.build?._id ?? "")],
        startsAt,
        status: activeMilestoneStatus(submilestone.status),
        subtitle: submilestone.milestoneKey,
        surface: "activeBuild",
        timeBucket: "allDay",
        timezone: "America/Toronto",
        title: submilestone.name,
        warnings: [],
      }),
    );
  }

  for (const draw of detail.draws ?? []) {
    const startsAt = draw.releaseDate ?? draw.releasedAt?.slice(0, 10) ?? addDaysIso(baseDate, draw.timingDay ?? 0);
    events.push(
      normalizeCalendarEvent({
        allDay: false,
        auditRequired: draw.status !== "planned",
        drawGroupKey: draw.drawKey,
        editable: {
          canChangeAssignee: false,
          canChangeStatus: true,
          canMove: draw.status !== "released",
          canResizeEnd: false,
          canResizeStart: false,
          immutableReason:
            draw.status === "released"
              ? "Released draw timestamps are immutable."
              : undefined,
          requiredReason: draw.status === "released" ? "none" : "materialDecision",
        },
        entity: { id: String(draw._id ?? draw.drawKey), key: draw.drawKey, type: "draw" },
        id: `activeBuild:draw:${draw.drawKey}`,
        kind: "draw",
        metrics: { amountCents: draw.amountCents },
        milestoneKey: draw.milestoneKey,
        organizationId,
        relatedEntityIds: [String(detail.build?._id ?? "")],
        startsAt,
        status: drawStatus(draw.status),
        subtitle: `Reimbursement draw, day ${draw.timingDay ?? 0}`,
        surface: "activeBuild",
        timeBucket: "endOfDay",
        timezone: "America/Toronto",
        title: draw.label,
        warnings: [],
      }),
    );
  }

  for (const visit of detail.siteVisits ?? []) {
    events.push(
      normalizeCalendarEvent({
        allDay: false,
        auditRequired: visit.status !== "requested",
        editable: {
          canChangeAssignee: true,
          canChangeStatus: true,
          canMove: visit.status !== "complete" && visit.status !== "cancelled",
          canResizeEnd: false,
          canResizeStart: false,
          requiredReason: visit.status === "requested" ? "scheduleChange" : "override",
        },
        entity: { id: String(visit.visitId), type: "siteVisit" },
        id: `activeBuild:siteVisit:${visit.visitId}`,
        kind: "siteVisit",
        milestoneKey: visit.milestoneKey,
        organizationId,
        relatedEntityIds: [String(detail.build?._id ?? "")],
        startsAt: addDaysIso(baseDate, visit.requestedDay ?? 0),
        status: visit.status === "complete" ? "completed" : visit.status === "cancelled" ? "cancelled" : "planned",
        subtitle: visit.note ?? "Site visit",
        surface: "activeBuild",
        timeBucket: "morning",
        timezone: "America/Toronto",
        title: `Site visit: ${visit.milestoneKey}`,
        warnings:
          visit.tokenExpiresAt && visit.tokenExpiresAt < Date.now()
            ? [{ label: "Token expired" }]
            : [],
      }),
    );
  }

  if (detail.loanFacility?.paybackDate) {
    events.push(
      normalizeCalendarEvent({
        allDay: true,
        auditRequired: true,
        editable: {
          canChangeAssignee: false,
          canChangeStatus: false,
          canMove: false,
          canResizeEnd: false,
          canResizeStart: false,
          immutableReason: "Payback changes require a facility change request.",
          requiredReason: "materialDecision",
        },
        entity: { id: "primary-loan-facility", type: "loanFacility" },
        id: "activeBuild:loan:primary",
        kind: "loan",
        metrics: { amountCents: detail.loanFacility.principalCents },
        organizationId,
        relatedEntityIds: [String(detail.build?._id ?? "")],
        startsAt: detail.loanFacility.paybackDate,
        status: detail.loanFacility.status === "closed" ? "completed" : "planned",
        subtitle: "Loan payback date",
        surface: "activeBuild",
        timeBucket: "endOfDay",
        timezone: "America/Toronto",
        title: "Loan payback",
        warnings: [],
      }),
    );
  }

  return {
    auditEvents: detail.auditEvents ?? [],
    defaultTimeframe: "week",
    events,
    savedViews: defaultCalendarSavedViews("activeBuild"),
    source: {
      id: String(detail.build?._id ?? ""),
      location: detail.build?.location,
      status: detail.build?.status,
      title: detail.build?.buildName ?? "Active Build",
    },
    surface: "activeBuild",
    timeframes: ["day", "week", "month", "quarter", "agenda"],
    warnings: events.flatMap((event) => event.warnings),
  };
}

export function buildActiveBuildCalendarActions(
  actions: ActiveBuildCalendarAdapterActions,
  options: { baseDate?: string; onOpenEvent?: (event: DrawFlowCalendarEvent) => void } = {},
): CalendarAction[] {
  const baseDate = options.baseDate ?? "2026-06-01";
  return [
    eventAction("open-active-build-event", "Open detail", "Review this calendar event.", async (context) => {
      if (context.event) options.onOpenEvent?.(context.event);
    }),
    eventAction("start-milestone-work", "Start milestone work", "Record the milestone start.", async (context) => {
      if (context.event?.milestoneKey) await actions.startMilestoneWork?.(context.event.milestoneKey);
    }, Boolean(actions.startMilestoneWork)),
    eventAction("request-milestone-info", "Request missing information", "Send a milestone information request.", async (context) => {
      if (context.event?.milestoneKey) {
        await actions.requestMilestoneInfo?.({
          milestoneKey: context.event.milestoneKey,
          note: "Requested from calendar context menu.",
        });
      }
    }, Boolean(actions.requestMilestoneInfo)),
    eventAction("schedule-site-visit", "Schedule site visit", "Create or assign a site visit window.", async (context) => {
      const milestoneKey = context.event?.milestoneKey ?? firstMilestoneOnDate(context);
      if (milestoneKey && context.date) {
        if (actions.scheduleSiteVisit) {
          await actions.scheduleSiteVisit({
            milestoneKey,
            note: "Scheduled from calendar.",
            requestedDay: daysBetweenIso(baseDate, context.date),
          });
        } else {
          await actions.assignSiteVisit?.(milestoneKey);
        }
      }
    }, Boolean(actions.scheduleSiteVisit || actions.assignSiteVisit)),
    eventAction("reschedule-site-visit", "Reschedule site visit", "Move this site visit to the selected date.", async (context) => {
      if (context.event?.entity.type === "siteVisit" && context.date) {
        await actions.rescheduleSiteVisit?.({
          reason: "Rescheduled from calendar context menu.",
          requestedDay: daysBetweenIso(baseDate, context.date),
          visitId: context.event.entity.id,
        });
      }
    }, Boolean(actions.rescheduleSiteVisit)),
    eventAction("cancel-site-visit", "Cancel site visit", "Cancel the site visit with audit reason.", async (context) => {
      if (context.event?.entity.type === "siteVisit") {
        await actions.cancelSiteVisit?.({
          reason: "Cancelled from calendar context menu.",
          visitId: context.event.entity.id,
        });
      }
    }, Boolean(actions.cancelSiteVisit)),
    eventAction("request-draw", "Request draw", "Request reimbursement draw.", async (context) => {
      if (context.event?.drawGroupKey) await actions.requestDraw?.(context.event.drawGroupKey);
    }, Boolean(actions.requestDraw)),
    eventAction("approve-draw", "Approve draw", "Backoffice draw approval.", async (context) => {
      if (context.event?.drawGroupKey) await actions.approveDraw?.(context.event.drawGroupKey);
    }, Boolean(actions.approveDraw)),
    eventAction("release-draw", "Release draw", "Final reimbursement release.", async (context) => {
      if (context.event?.drawGroupKey) await actions.releaseDraw?.(context.event.drawGroupKey);
    }, Boolean(actions.releaseDraw), "Requires Principal Broker/Admin draw-release authority."),
    dateAction("add-evidence-due-date", "Add evidence due date", "Create an explicit evidence target.", async (context) => {
      if (context.date) await actions.setEvidenceDueDate?.({ targetDate: context.date });
    }, Boolean(actions.setEvidenceDueDate)),
    dateAction("add-review-target", "Add internal review target", "Create a staff review target date.", async (context) => {
      if (context.date) await actions.setReviewTargetDate?.({ targetDate: context.date });
    }, Boolean(actions.setReviewTargetDate)),
    dateAction("add-admin-decision-target", "Add admin decision target", "Create an admin decision target date.", async (context) => {
      if (context.date) await actions.setAdminDecisionTargetDate?.({ targetDate: context.date });
    }, Boolean(actions.setAdminDecisionTargetDate)),
    dateAction("schedule-site-visit-date", "Schedule site visit", "Schedule a site visit for a milestone on this day.", async (context) => {
      const milestoneKey = firstMilestoneOnDate(context);
      if (milestoneKey && context.date) {
        await actions.scheduleSiteVisit?.({
          milestoneKey,
          note: "Scheduled from calendar day menu.",
          requestedDay: daysBetweenIso(baseDate, context.date),
        });
      }
    }, Boolean(actions.scheduleSiteVisit)),
  ];
}

export function createActiveBuildCalendarEditHandler(input: {
  actions: ActiveBuildCalendarAdapterActions;
  baseDate: string;
}) {
  return async (request: CalendarEditRequest) => {
    const event = request.event;
    if (event.kind === "milestone" && event.milestoneKey) {
      await input.actions.reviseMilestoneSchedule?.({
        dayEnd: daysBetweenIso(input.baseDate, request.nextEndsAt ?? request.nextStartsAt),
        dayStart: daysBetweenIso(input.baseDate, request.nextStartsAt),
        milestoneKey: event.milestoneKey,
        reason: request.reason ?? "Calendar schedule revision.",
      });
      return;
    }
    if (event.kind === "siteVisit" && event.entity.type === "siteVisit") {
      await input.actions.rescheduleSiteVisit?.({
        reason: request.reason ?? "Calendar site visit reschedule.",
        requestedDay: daysBetweenIso(input.baseDate, request.nextStartsAt),
        visitId: event.entity.id,
      });
      return;
    }
    if (event.kind === "draw") {
      await input.actions.setDrawReleaseTargetDate?.({
        drawKey: event.drawGroupKey,
        reason: request.reason,
        targetDate: request.nextStartsAt,
      });
      return;
    }
    if (event.kind === "evidence") {
      await input.actions.setEvidenceDueDate?.({
        milestoneKey: event.milestoneKey,
        reason: request.reason,
        targetDate: request.nextStartsAt,
      });
      return;
    }
    if (event.kind === "review") {
      await input.actions.setReviewTargetDate?.({
        milestoneKey: event.milestoneKey,
        reason: request.reason,
        targetDate: request.nextStartsAt,
      });
      return;
    }
    if (event.kind === "adminDecision") {
      await input.actions.setAdminDecisionTargetDate?.({
        milestoneKey: event.milestoneKey,
        reason: request.reason,
        targetDate: request.nextStartsAt,
      });
      return;
    }
    if (event.kind === "loan") {
      await input.actions.requestLoanFacilityDateChange?.({
        reason: request.reason ?? "Calendar loan payback date change request.",
        requestedPaybackDate: request.nextStartsAt,
      });
    }
  };
}

function activeMilestoneStatus(status?: string) {
  if (status === "complete") return "completed";
  if (status === "in_progress") return "inProgress";
  return "planned";
}

function drawStatus(status?: string) {
  if (status === "released") return "released";
  if (status === "approved") return "approved";
  if (status === "requested") return "submitted";
  if (status === "rejected") return "rejected";
  return "planned";
}

function defaultCalendarSavedViews(surface: "activeBuild" | "proposal"): CalendarSavedView[] {
  const base: CalendarSavedView[] = [
    { filters: { needsAction: true }, id: "my-week", isDefault: false, label: "My week", timeframe: "week" },
    { filters: { eventKinds: ["draw", "drawGroup", "loan"] }, id: "capital-release", isDefault: false, label: "Capital release", timeframe: "month" },
    { filters: { eventKinds: ["evidence", "review", "adminDecision"] }, id: "evidence-review", isDefault: false, label: "Evidence and review", timeframe: "agenda" },
    { filters: { statuses: ["overdue", "blocked"] }, id: "overdue-blocked", isDefault: false, label: "Overdue and blocked", timeframe: "agenda" },
  ];
  return [
    { filters: { eventKinds: ["siteVisit"] }, id: "site-visits", isDefault: surface === "activeBuild", label: "Site visits", timeframe: "week" },
    ...base,
  ];
}

function eventAction(
  id: string,
  label: string,
  description: string,
  onSelect: CalendarAction["onSelect"],
  enabled = true,
  disabledReason = "This action is unavailable for your role or this event state.",
): CalendarAction {
  return {
    appliesTo: "event",
    availability: enabled ? { state: "enabled" } : { reason: disabledReason, state: "disabled" },
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
  enabled = true,
): CalendarAction {
  return {
    appliesTo: "date",
    availability: enabled ? { state: "enabled" } : { reason: "Requires calendar scheduling authority.", state: "disabled" },
    description,
    id,
    label,
    onSelect,
    requiresConfirmation: false,
    requiresReason: false,
  };
}

function firstMilestoneOnDate(context: CalendarActionContext): string | undefined {
  return context.events?.find((event) => event.milestoneKey)?.milestoneKey;
}
