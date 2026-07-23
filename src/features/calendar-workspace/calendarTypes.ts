import type React from "react";

export type CalendarSurface = "proposal" | "activeBuild";

export type CalendarTimeframe = "day" | "week" | "month" | "quarter" | "agenda";

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
  | "loan"
  | "budgetRevision"
  | "contractor"
  | "reminder";

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
  canChangeAssignee: boolean;
  canChangeStatus: boolean;
  canMove: boolean;
  canResizeEnd: boolean;
  canResizeStart: boolean;
  immutableReason?: string;
  requiredReason?: "none" | "scheduleChange" | "materialDecision" | "override";
}

export interface CalendarAssignableParticipant {
  builderProfileId?: string;
  contractorId?: string;
  displayName: string;
  email?: string;
  key: string;
  participantType:
    | "builderProfile"
    | "contractorProfile"
    | "externalEmail"
    | "workosUser";
  role?: string;
  workosUserId?: string;
}

export interface DrawFlowCalendarEvent {
  allDay: boolean;
  assigneeUserId?: string;
  auditRequired: boolean;
  drawGroupKey?: string;
  editable: CalendarEditCapability;
  endsAt?: string;
  entity:
    | { type: "proposal"; id: string }
    | { type: "activeBuild"; id: string }
    | { type: "milestone"; key: string; id?: string }
    | { type: "draw"; key: string; id?: string }
    | { type: "siteVisit"; id: string }
    | { type: "evidencePackage"; id: string }
    | { type: "loanFacility"; id: string }
    | { type: "calendarReminder"; id: string };
  id: string;
  kind: CalendarEventKind;
  location?: string;
  metrics?: {
    amountCents?: number;
    budgetCents?: number;
    progressPercent?: number;
  };
  milestoneKey?: string;
  organizationId: string;
  ownerUserId?: string;
  participants?: CalendarAssignableParticipant[];
  relatedEntityIds: string[];
  startsAt: string;
  status: CalendarEventStatus;
  subtitle?: string;
  surface: CalendarSurface;
  timeBucket: CalendarTimeBucket;
  timezone: string;
  title: string;
  warnings: CalendarEventWarning[];
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
  appliesTo: "event" | "date" | "dateRange" | "selection";
  availability:
    | { state: "enabled" }
    | { state: "disabled"; reason: string }
    | { state: "hidden"; reason: string };
  description?: string;
  icon?: React.ReactNode;
  id: string;
  isVisible?: (context: CalendarActionContext) => boolean;
  label: string;
  onSelect: (context: CalendarActionContext) => Promise<unknown> | unknown;
  requiresConfirmation: boolean;
  requiresReason: boolean;
  tone?: "default" | "warning" | "destructive";
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

export interface CalendarReminderEventInput {
  allDay: boolean;
  assignedParticipants: Array<Omit<CalendarAssignableParticipant, "key">>;
  description?: string;
  endsAt?: string;
  eventId?: string;
  location?: string;
  startsAt: string;
  timezone: string;
  title: string;
}
