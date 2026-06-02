import type React from "react";

export type CalendarSurface = "proposal" | "activeBuild";

export type CalendarTimeframe =
  | "day"
  | "week"
  | "month"
  | "quarter"
  | "agenda";

export type CalendarTimeBucket =
  | "allDay"
  | "earlyMorning"
  | "morning"
  | "midday"
  | "afternoon"
  | "endOfDay"
  | "evening"
  | "unscheduled";

export type CalendarEventKind =
  | "milestone"
  | "submilestone"
  | "dependency"
  | "draw"
  | "drawGroup"
  | "evidence"
  | "siteVisit"
  | "review"
  | "adminDecision"
  | "workingCapital"
  | "loan"
  | "budgetRevision"
  | "contractor";

export type CalendarEventStatus =
  | "planned"
  | "proposed"
  | "inProgress"
  | "blocked"
  | "overdue"
  | "submitted"
  | "inReview"
  | "ready"
  | "approved"
  | "rejected"
  | "released"
  | "completed"
  | "cancelled"
  | "immutable";

export interface CalendarEventWarning {
  id?: string;
  label: string;
  severity?: "info" | "warning" | "critical";
}

export interface CalendarEditCapability {
  canMove: boolean;
  canResizeStart: boolean;
  canResizeEnd: boolean;
  canChangeAssignee: boolean;
  canChangeStatus: boolean;
  immutableReason?: string;
  requiredReason?: "none" | "scheduleChange" | "materialDecision" | "override";
}

export interface DrawFlowCalendarEvent {
  id: string;
  organizationId: string;
  surface: CalendarSurface;
  kind: CalendarEventKind;
  status: CalendarEventStatus;
  title: string;
  subtitle?: string;
  startsAt: string;
  endsAt?: string;
  allDay: boolean;
  timeBucket: CalendarTimeBucket;
  timezone: string;
  entity:
    | { type: "proposal"; id: string }
    | { type: "activeBuild"; id: string }
    | { type: "milestone"; key: string; id?: string }
    | { type: "draw"; key: string; id?: string }
    | { type: "siteVisit"; id: string }
    | { type: "evidencePackage"; id: string }
    | { type: "loanFacility"; id: string };
  relatedEntityIds: string[];
  ownerUserId?: string;
  assigneeUserId?: string;
  drawGroupKey?: string;
  milestoneKey?: string;
  warnings: CalendarEventWarning[];
  metrics?: {
    amountCents?: number;
    exposureCents?: number;
    budgetCents?: number;
    progressPercent?: number;
  };
  editable: CalendarEditCapability;
  auditRequired: boolean;
}

export interface CalendarSavedView {
  filters: CalendarFilters;
  id: string;
  isDefault: boolean;
  label: string;
  timeframe: CalendarTimeframe;
}

export interface CalendarFilters {
  assigneeUserId?: string;
  contractorId?: string;
  drawGroupKey?: string;
  editableOnly?: boolean;
  eventKinds?: CalendarEventKind[];
  immutableActuals?: boolean;
  milestoneKey?: string;
  needsAction?: boolean;
  overdueOnly?: boolean;
  riskOnly?: boolean;
  search?: string;
  statuses?: CalendarEventStatus[];
}

export interface CalendarSourceSummary {
  id: string;
  location?: string;
  status?: string;
  title: string;
}

export interface DrawFlowCalendarWorkspaceData {
  auditEvents?: Array<{
    command?: string;
    createdAt: number;
    eventType: string;
    reason?: string;
  }>;
  defaultTimeframe: CalendarTimeframe;
  events: DrawFlowCalendarEvent[];
  savedViews: CalendarSavedView[];
  source: CalendarSourceSummary;
  surface: CalendarSurface;
  timeframes: CalendarTimeframe[];
  warnings: CalendarEventWarning[];
}

export interface CalendarActionContext {
  date?: string;
  dateRange?: { startsAt: string; endsAt?: string };
  event?: DrawFlowCalendarEvent;
  events?: DrawFlowCalendarEvent[];
  source: CalendarSourceSummary;
  surface: CalendarSurface;
  timeframe: CalendarTimeframe;
}

export interface CalendarAction {
  id: string;
  label: string;
  description?: string;
  icon?: React.ReactNode;
  tone?: "default" | "warning" | "destructive";
  availability:
    | { state: "enabled" }
    | { state: "disabled"; reason: string }
    | { state: "hidden"; reason: string };
  requiresReason: boolean;
  requiresConfirmation: boolean;
  appliesTo: "event" | "date" | "dateRange" | "selection";
  onSelect: (context: CalendarActionContext) => Promise<unknown> | unknown;
}

export interface CalendarEditRequest {
  changeType:
    | "move"
    | "resizeStart"
    | "resizeEnd"
    | "setDate"
    | "setDateTime"
    | "bulkMove";
  event: DrawFlowCalendarEvent;
  events?: DrawFlowCalendarEvent[];
  nextEndsAt?: string;
  nextStartsAt: string;
  priorEndsAt?: string;
  priorStartsAt: string;
  reason?: string;
}

export interface CalendarSyncSubscriptionResult {
  feedUrl: string;
  subscriptionId?: string;
  subscriptionKey: string;
}
