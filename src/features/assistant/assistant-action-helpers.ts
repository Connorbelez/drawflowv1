"use client";

import { EventType } from "@ag-ui/core";
import {
  type AssistantCostItemDraft,
  type AssistantGeneratedUiPart,
} from "./AssistantGenerativeUI.tsx";
import type { AssistantSelectionOption } from "./AssistantAutocompleteSelection.tsx";
import {
  normalizeAssistantRoute,
  type AssistantClientAction,
} from "./assistantClientActionBridge.ts";
import {
  assistantRouteSitemapSummary,
  findAssistantRouteMatch,
  reachableAssistantRoutes,
} from "./assistantRouteRegistry.ts";
import type { DrawFlowAssistantRouteContext } from "./assistantRouteContext.ts";
import type { AssistantWorkflowStep } from "./assistantWorkflow.ts";
import { proposalTemplateKeyFromPrompt } from "./assistantWorkflow.ts";
import type {
  AssistantSelectionRequest,
  PlannedAction,
  PreviewItem,
  ReminderIntent,
} from "./drawflow-assistant-contracts.ts";

export function latestUserText(messages: readonly any[]) {
  const message = [...messages].reverse().find((item) => item.role === "user");
  const parts = message?.content ?? message?.parts ?? [];
  if (typeof parts === "string") {
    return parts;
  }
  if (!Array.isArray(parts)) {
    return "";
  }
  return parts
    .map((part) => (part?.type === "text" ? part.text : ""))
    .filter(Boolean)
    .join("\n");
}

export function assistantText(text: string) {
  return {
    content: [{ text, type: "text" as const }],
    status: { reason: "stop" as const, type: "complete" as const },
  };
}

export function parsePreviewValue(value: string) {
  if (!value.trim()) {
    return null;
  }
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

export function buildClosedCatalogActions(
  prompt: string,
  routeContext: DrawFlowAssistantRouteContext
):
  | { actions: PlannedAction[]; kind: "actions"; message: string }
  | { actions: []; kind: "none"; message?: never }
  | { kind: "clarify"; message: string }
  | {
      kind: "select";
      message: string;
      selection: AssistantSelectionRequest;
    } {
  const normalized = prompt.toLowerCase();
  const reminderPlan = buildReminderActions(prompt, routeContext);
  if (reminderPlan) {
    return reminderPlan;
  }
  const matchesExample =
    normalized.includes("second milestone") &&
    normalized.includes("t30") &&
    normalized.includes("t45") &&
    normalized.includes("120000") &&
    normalized.includes("80000");
  if (!matchesExample) {
    return { actions: [], kind: "none" };
  }
  const milestoneKey = routeContext.selectedMilestoneKey;
  if (!milestoneKey) {
    return {
      kind: "clarify",
      message:
        "I need the selected second milestone key before preparing a mutation batch. Select the milestone or name its DrawFlow milestone key.",
    };
  }
  if (routeContext.proposalId) {
    return {
      actions: [
        {
          actionKey: "update_proposal_milestone_schedule",
          clientRequestId: "assistant_example_schedule",
          input: {
            dayEnd: 45,
            dayStart: 30,
            milestoneKey,
            proposalId: routeContext.proposalId,
            reason: "Assistant HITL milestone schedule update.",
          },
        },
        {
          actionKey: "update_proposal_milestone_budget",
          clientRequestId: "assistant_example_budget",
          input: {
            budgetCents: 12_000_000,
            milestoneKey,
            proposalId: routeContext.proposalId,
            reason: "Assistant HITL milestone budget update.",
          },
        },
        {
          actionKey: "create_proposal_planned_draw",
          clientRequestId: "assistant_example_draw",
          input: {
            amountCents: 8_000_000,
            drawKey: `assistant-${milestoneKey}-draw`,
            label: "Milestone reimbursement draw",
            milestoneKey,
            proposalId: routeContext.proposalId,
            timingDay: 47,
          },
        },
      ],
      kind: "actions",
      message:
        "I prepared a persisted HITL action batch for the proposal. Review, edit, reject, then confirm the accepted set.",
    };
  }
  if (routeContext.activeBuildId) {
    return {
      actions: [
        {
          actionKey: "request_active_build_milestone_schedule_revision",
          clientRequestId: "assistant_example_active_schedule",
          input: {
            buildId: routeContext.activeBuildId,
            dayEnd: 45,
            dayStart: 30,
            milestoneKey,
            reason: "Assistant HITL active-build schedule revision request.",
          },
        },
        {
          actionKey: "request_active_build_milestone_budget_revision",
          clientRequestId: "assistant_example_active_budget",
          input: {
            budgetCents: 12_000_000,
            buildId: routeContext.activeBuildId,
            milestoneKey,
            reason: "Assistant HITL active-build budget revision request.",
          },
        },
        {
          actionKey: "request_active_build_draw_plan_revision",
          clientRequestId: "assistant_example_active_draw",
          input: {
            amountCents: 8_000_000,
            buildId: routeContext.activeBuildId,
            drawKey: `assistant-${milestoneKey}-draw`,
            label: "Milestone reimbursement draw",
            milestoneKey,
            reason: "Assistant HITL active-build draw-plan revision request.",
            timingDay: 47,
          },
        },
      ],
      kind: "actions",
      message:
        "I prepared active-build revision requests instead of directly mutating live schedule, budget, or draw rows.",
    };
  }
  return {
    kind: "clarify",
    message:
      "Open an eligible proposal or active-build route before preparing that mutation batch.",
  };
}

export function buildReadonlyClientAction(
  prompt: string,
  routeContext: DrawFlowAssistantRouteContext
) {
  const normalized = prompt.toLowerCase();
  const templateAction = buildTemplateSelectionAction(prompt, routeContext);
  if (
    normalized.includes("sitemap") ||
    normalized.includes("what pages") ||
    normalized.includes("where can") ||
    normalized.includes("reachable")
  ) {
    return {
      actionKey: "explain_current_surface",
      message: `Reachable DrawFlow pages for your current role:\n${assistantRouteSitemapSummary(routeContext)}`,
    };
  }
  const routeMatch = findAssistantRouteMatch(prompt, routeContext);
  if (routeMatch) {
    const afterNavigationActions =
      templateAction && isNewProposalRoute(routeMatch.to)
        ? [{ ...templateAction, route: routeMatch.to }]
        : [];
    const workflowSteps =
      afterNavigationActions.length > 0
        ? [
            {
              id: "navigate:new-proposal",
              kind: "navigate",
              status: "pending",
              to: routeMatch.to,
            },
            {
              id: "wait:new-proposal",
              kind: "wait_for_route",
              route: routeMatch.to,
              status: "pending",
            },
            {
              actionKey: "select_proposal_template",
              id: "client-action:select-proposal-template",
              kind: "run_client_action",
              route: routeMatch.to,
              status: "pending",
            },
          ]
        : [];
    return {
      actionKey: "open_route",
      ...(afterNavigationActions.length > 0 ? { afterNavigationActions } : {}),
      ...(workflowSteps.length > 0 ? { workflowSteps } : {}),
      label: routeMatch.entry.label,
      message:
        afterNavigationActions.length > 0
          ? `I can take you to ${routeMatch.entry.label} and select Garden Suite: ${routeMatch.entry.purpose}`
          : `I can take you to ${routeMatch.entry.label}: ${routeMatch.entry.purpose}`,
      purpose: routeMatch.entry.purpose,
      routeId: routeMatch.entry.id,
      to: routeMatch.to,
    };
  }
  if (templateAction && isNewProposalRoute(routeContext.pathname)) {
    return {
      ...templateAction,
      message: "Selected the Garden Suite proposal template.",
    };
  }
  if (normalized.includes("focus") && routeContext.selectedMilestoneKey) {
    return {
      actionKey: "focus_milestone",
      message: `Focused milestone ${routeContext.selectedMilestoneKey}.`,
      milestoneKey: routeContext.selectedMilestoneKey,
    };
  }
  if (normalized.includes("focus") && routeContext.selectedDrawKey) {
    return {
      actionKey: "focus_draw",
      drawKey: routeContext.selectedDrawKey,
      message: `Focused draw ${routeContext.selectedDrawKey}.`,
    };
  }
  if (normalized.includes("calendar")) {
    return {
      actionKey: "open_calendar_surface",
      calendarSurface: routeContext.calendarSurface ?? "proposal",
      message: "Opened the calendar surface as a read-only assistant action.",
    };
  }
  return null;
}

export async function dispatchReadonlyClientAction(
  action: Record<string, unknown> & {
    label?: string;
    message?: string;
    purpose?: string;
    routeId?: string;
    to?: string;
  },
  input: {
    createNavigationTrace: (args: Record<string, unknown>) => Promise<unknown>;
    organizationId: string;
    routeContext: DrawFlowAssistantRouteContext;
    threadId: string | null;
  }
) {
  if (input.threadId) {
    await input.createNavigationTrace({
      aguiEvent: {
        action,
        routeContext: input.routeContext,
        type: EventType.CUSTOM,
      },
      threadId: input.threadId,
      workosOrganizationId: input.organizationId,
    });
  }
  window.dispatchEvent(
    new CustomEvent("drawflow-assistant:readonly-action", {
      detail: action,
    })
  );
}

export function buildAssistantSiteMap(
  routeContext: DrawFlowAssistantRouteContext
) {
  return reachableAssistantRoutes(routeContext)
    .map((entry) => {
      const params: Record<string, string> = {};
      for (const param of entry.requiredParams) {
        const value =
          param === "proposalId"
            ? routeContext.proposalId
            : param === "buildId"
              ? routeContext.activeBuildId
              : undefined;
        if (!value) {
          return null;
        }
        params[param] = value;
      }
      return {
        ...entry,
        to: Object.entries(params).reduce(
          (path, [key, value]) => path.replace(`:${key}`, value),
          entry.pathTemplate
        ),
      };
    })
    .filter((entry) => entry !== null);
}

export function normalizePlannerActions(value: unknown): PlannedAction[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter(isPlannedAction);
}

export function normalizeGeneratedUiParts(
  value: unknown
): AssistantGeneratedUiPart[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter(isGeneratedUiPart);
}

export function normalizePlannerNavigation(value: unknown) {
  if (!isRecord(value) || typeof value.to !== "string") {
    return null;
  }
  return {
    label: typeof value.label === "string" ? value.label : value.to,
    reason: typeof value.reason === "string" ? value.reason : "Open route",
    routeId: typeof value.routeId === "string" ? value.routeId : value.to,
    to: value.to,
  };
}

export function requiresPostNavigationWorkflow(
  prompt: string,
  uiParts: AssistantGeneratedUiPart[]
) {
  if (uiParts.length > 0) {
    return true;
  }
  const normalized = prompt.toLowerCase();
  return [
    "summarize",
    "summary",
    "review",
    "prioritize",
    "priority",
    "which",
    "what",
    "why",
    "first",
    "next action",
    "needs action",
    "highest risk",
    "risk",
    "queue",
    "brief",
    "checklist",
  ].some((term) => normalized.includes(term));
}

export function isValidWorkflowUiEventForStep(
  step: AssistantWorkflowStep | undefined,
  event: {
    payload?: unknown;
    type: "choice" | "navigate" | "select" | "submit";
  }
) {
  if (!step) {
    return false;
  }
  if (step.kind === "render_agui") {
    return event.payload !== undefined;
  }
  if (step.kind !== "wait_for_agui_submit") {
    return false;
  }
  const payload = isRecord(event.payload) ? event.payload : null;
  if (step.input?.selectorKind === "reminderTarget") {
    return (
      event.type === "select" && isAssistantSelectionOption(payload?.option)
    );
  }
  if (step.input?.formKind === "costItem") {
    return (
      event.type === "submit" &&
      payload !== null &&
      typeof payload.title === "string" &&
      payload.title.trim().length > 0 &&
      typeof payload.milestoneKey === "string" &&
      payload.milestoneKey.trim().length > 0 &&
      Number(payload.costCents) > 0 &&
      Number(payload.quantity) > 0
    );
  }
  return event.payload !== undefined;
}

function isAssistantSelectionOption(
  value: unknown
): value is AssistantSelectionOption {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.kind === "string" &&
    (value.kind === "activeBuild" || value.kind === "proposal") &&
    typeof value.label === "string" &&
    (value.kind === "activeBuild"
      ? typeof value.buildId === "string"
      : typeof value.proposalId === "string")
  );
}

function isPlannedAction(value: unknown): value is PlannedAction {
  return (
    isRecord(value) &&
    typeof value.actionKey === "string" &&
    typeof value.clientRequestId === "string" &&
    isRecord(value.input)
  );
}

function isGeneratedUiPart(value: unknown): value is AssistantGeneratedUiPart {
  return (
    isRecord(value) &&
    typeof value.type === "string" &&
    [
      "briefing",
      "navigation",
      "questionnaire",
      "reviewTable",
      "selector",
      "structuredForm",
    ].includes(value.type)
  );
}

export function buildCostItemActionFromDraft(
  draft: AssistantCostItemDraft
): PlannedAction {
  const description = withUnitDescription(draft.description, draft.unit);
  return {
    actionKey:
      draft.target.kind === "activeBuild"
        ? "create_active_build_cost_item"
        : "create_proposal_cost_item",
    clientRequestId: `assistant_cost_item_${Date.now()}`,
    input: {
      costCents: draft.costCents,
      description,
      itemType: draft.itemType,
      milestoneKey: draft.milestoneKey,
      quantity: draft.quantity,
      relevantSubmilestoneKeys: [],
      supplier: draft.supplier,
      title: draft.title,
      unit: draft.unit,
      ...(draft.target.kind === "activeBuild"
        ? { buildId: draft.target.buildId }
        : { proposalId: draft.target.proposalId }),
    },
  };
}

function withUnitDescription(
  description: string | undefined,
  unit: string | undefined
) {
  if (!unit) {
    return description;
  }
  if (!description) {
    return `Unit: ${unit}`;
  }
  return description.toLowerCase().includes(unit.toLowerCase())
    ? description
    : `${description} Unit: ${unit}.`;
}

function buildTemplateSelectionAction(
  prompt: string,
  routeContext: DrawFlowAssistantRouteContext
): AssistantClientAction | null {
  const templateKey = proposalTemplateKeyFromPrompt(prompt);
  if (!templateKey) {
    return null;
  }
  return {
    actionKey: "select_proposal_template",
    input: { templateKey },
    route: isNewProposalRoute(routeContext.pathname)
      ? routeContext.pathname
      : undefined,
  };
}

function isNewProposalRoute(pathname: string) {
  const normalized = normalizeAssistantRoute(pathname);
  return (
    normalized === "/backoffice/proposals/new" ||
    normalized === "/builder/proposals/new"
  );
}

export function buildReminderActions(
  prompt: string,
  routeContext: DrawFlowAssistantRouteContext
):
  | { actions: PlannedAction[]; kind: "actions"; message: string }
  | { kind: "clarify"; message: string }
  | {
      kind: "select";
      message: string;
      selection: AssistantSelectionRequest;
    }
  | null {
  const normalized = prompt.toLowerCase();
  const isReminderRequest =
    normalized.includes("reminder") ||
    normalized.includes("remind me") ||
    normalized.includes("calendar");
  if (!(isReminderRequest && normalized.includes("remind"))) {
    return null;
  }
  const reminderDateTime = extractReminderDateTime(prompt);
  if (!reminderDateTime) {
    return {
      kind: "clarify",
      message:
        "I need a reminder date in YYYY-MM-DD format, or a relative date like tomorrow, before preparing the HITL reminder.",
    };
  }
  const title = extractReminderTitle(prompt);
  if (!title) {
    return {
      kind: "clarify",
      message:
        "I need the reminder title, for example: remind me to call the framer on 2026-06-16.",
    };
  }
  const intent: ReminderIntent = {
    allDay: reminderDateTime.allDay,
    startsAt: reminderDateTime.startsAt,
    timezone: "America/Toronto",
    title,
  };
  if (!(routeContext.proposalId || routeContext.activeBuildId)) {
    return {
      kind: "select",
      message:
        "Which live build or Build Proposal should this reminder belong to?",
      selection: {
        intent,
        title: "Choose reminder target",
        type: "reminderTarget",
      },
    };
  }
  return {
    actions: [buildReminderActionForRoute(intent, routeContext)],
    kind: "actions",
    message: routeContext.activeBuildId
      ? "I prepared a HITL reminder for the live Build calendar. Review it, edit it if needed, then confirm the accepted batch."
      : "I prepared a HITL reminder for the Build Proposal calendar. Review it, edit it if needed, then confirm the accepted batch.",
  };
}

function buildReminderActionForRoute(
  intent: ReminderIntent,
  routeContext: DrawFlowAssistantRouteContext
): PlannedAction {
  return {
    actionKey: "create_proposal_reminder",
    clientRequestId: `assistant_reminder_${Date.now()}`,
    input: {
      allDay: intent.allDay,
      ...(routeContext.activeBuildId
        ? { buildId: routeContext.activeBuildId }
        : { proposalId: routeContext.proposalId }),
      startsAt: intent.startsAt,
      timezone: intent.timezone,
      title: intent.title.trim(),
    },
  };
}

export function buildReminderActionForTarget(
  intent: ReminderIntent,
  target: AssistantSelectionOption
): PlannedAction {
  return {
    actionKey: "create_proposal_reminder",
    clientRequestId: `assistant_reminder_${Date.now()}`,
    input: {
      allDay: intent.allDay,
      ...(target.kind === "activeBuild"
        ? { buildId: target.buildId }
        : { proposalId: target.proposalId }),
      startsAt: intent.startsAt,
      timezone: intent.timezone,
      title: intent.title.trim(),
    },
  };
}

export function extractReminderDate(prompt: string) {
  const isoDate = /\b\d{4}-\d{2}-\d{2}\b/.exec(prompt)?.[0];
  if (isoDate) {
    return isoDate;
  }
  const monthDate = monthDatePattern().exec(prompt);
  if (monthDate?.groups?.month && monthDate.groups.day) {
    const month = monthIndex(monthDate.groups.month);
    const day = Number(monthDate.groups.day);
    if (month !== null && day >= 1 && day <= 31) {
      const base = new Date();
      const explicitYear = monthDate.groups.year
        ? Number(monthDate.groups.year)
        : undefined;
      let year = explicitYear ?? base.getFullYear();
      const candidate = new Date(year, month, day);
      if (!explicitYear && candidate < startOfToday(base)) {
        year += 1;
      }
      return toIsoDate(new Date(year, month, day));
    }
  }
  const normalized = prompt.toLowerCase();
  const base = new Date();
  if (normalized.includes("tomorrow")) {
    base.setDate(base.getDate() + 1);
    return toIsoDate(base);
  }
  if (normalized.includes("today")) {
    return toIsoDate(base);
  }
  return null;
}

export function extractReminderDateTime(prompt: string) {
  const date = extractReminderDate(prompt);
  if (!date) {
    return null;
  }
  const time = extractReminderTime(prompt);
  if (!time) {
    return { allDay: true, startsAt: date };
  }
  return { allDay: false, startsAt: `${date}T${time}:00` };
}

function extractReminderTitle(prompt: string) {
  const withoutDate = stripReminderDateAndTime(prompt).trim();
  const match =
    /\bremind(?:er)?(?:\s+me)?\s+to\s+(.+)$/i.exec(withoutDate) ??
    /\badd\s+(?:a\s+)?(?:builder\s+)?reminder\s+(?:for\s+me\s+)?to\s+(.+)$/i.exec(
      withoutDate
    ) ??
    /\badd\s+(?:a\s+)?(?:builder\s+)?reminder\s+for\s+me\s+to\s+(.+)$/i.exec(
      withoutDate
    ) ??
    /\breminder\s+(?:for\s+me\s+)?to\s+(.+)$/i.exec(withoutDate);
  const title = match?.[1]?.trim().replace(/[.?!]+$/, "");
  return title || null;
}

function stripReminderDateAndTime(prompt: string) {
  return prompt
    .replace(/\b(on|for)\s+\d{4}-\d{2}-\d{2}\b/i, "")
    .replace(new RegExp(`\\b(on|for)\\s+${monthDatePattern().source}`, "i"), "")
    .replace(monthDatePattern(), "")
    .replace(/\b(today|tomorrow)\b/i, "")
    .replace(
      /\b(?:at\s+)?(?<hour>\d{1,2})(?::(?<minute>\d{2}))?\s*(?<period>a\.?m\.?|p\.?m\.?)\b/i,
      ""
    )
    .replace(/\b(?:at\s+)(?<hour>[01]?\d|2[0-3]):(?<minute>\d{2})\b/i, "")
    .replace(/\s{2,}/g, " ");
}

function extractReminderTime(prompt: string) {
  const twelveHour =
    /\b(?:at\s+)?(?<hour>\d{1,2})(?::(?<minute>\d{2}))?\s*(?<period>a\.?m\.?|p\.?m\.?)\b/i.exec(
      prompt
    );
  if (twelveHour?.groups?.hour && twelveHour.groups.period) {
    const hour = Number(twelveHour.groups.hour);
    const minute = Number(twelveHour.groups.minute ?? "0");
    if (hour >= 1 && hour <= 12 && minute >= 0 && minute <= 59) {
      const period = twelveHour.groups.period.toLowerCase().startsWith("p")
        ? "pm"
        : "am";
      const normalizedHour =
        period === "pm"
          ? hour === 12
            ? 12
            : hour + 12
          : hour === 12
            ? 0
            : hour;
      return `${String(normalizedHour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
    }
  }
  const twentyFourHour =
    /\b(?:at\s+)(?<hour>[01]?\d|2[0-3]):(?<minute>\d{2})\b/i.exec(prompt);
  if (twentyFourHour?.groups?.hour && twentyFourHour.groups.minute) {
    const minute = Number(twentyFourHour.groups.minute);
    if (minute >= 0 && minute <= 59) {
      return `${String(Number(twentyFourHour.groups.hour)).padStart(2, "0")}:${twentyFourHour.groups.minute}`;
    }
  }
  return null;
}

function monthDatePattern() {
  return /\b(?<month>jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+(?<day>\d{1,2})(?:st|nd|rd|th)?(?:,?\s+(?<year>\d{4}))?\b/i;
}

function monthIndex(month: string) {
  const normalized = month.toLowerCase().slice(0, 3);
  const index = [
    "jan",
    "feb",
    "mar",
    "apr",
    "may",
    "jun",
    "jul",
    "aug",
    "sep",
    "oct",
    "nov",
    "dec",
  ].indexOf(normalized);
  return index === -1 ? null : index;
}

function startOfToday(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function toIsoDate(date: Date) {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function actionsToPreviewItems(actions: PlannedAction[]): PreviewItem[] {
  return actions.map((action, index) => {
    const after = previewAfterForAction(action);
    return {
      actionKey: action.actionKey,
      after,
      before: null,
      clientRequestId: action.clientRequestId,
      entityLabel:
        typeof action.input.label === "string"
          ? action.input.label
          : typeof action.input.milestoneKey === "string"
            ? action.input.milestoneKey
            : action.actionKey,
      entityType: action.actionKey.includes("draw")
        ? "draw"
        : action.actionKey.includes("calendar") ||
            action.actionKey.includes("reminder")
          ? "calendar"
          : "milestone",
      input: action.input,
      status: "preview",
      validation: {
        warnings:
          index === 0
            ? ["The backend re-reads current state before atomic commit."]
            : [],
      },
    };
  });
}

function previewAfterForAction(action: PlannedAction) {
  const {
    buildId: _buildId,
    proposalId: _proposalId,
    reason: _reason,
    ...after
  } = action.input;
  return after;
}

export function commitSuccessMessage(items: PreviewItem[], outcome: unknown) {
  const result = isRecord(outcome) ? outcome : {};
  const committedCount =
    typeof result.committedCount === "number"
      ? result.committedCount
      : items.filter((item) => item.status !== "rejected").length;
  const acceptedItems = items.filter((item) => item.status !== "rejected");
  if (acceptedItems.length === 1) {
    const item = acceptedItems[0];
    const title =
      typeof item.after === "object" &&
      item.after !== null &&
      "title" in item.after &&
      typeof (item.after as Record<string, unknown>).title === "string"
        ? ((item.after as Record<string, unknown>).title as string)
        : item.entityLabel;
    return `Committed ${item.entityType} action: ${title}.`;
  }
  return `Committed ${committedCount} accepted assistant actions.`;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
