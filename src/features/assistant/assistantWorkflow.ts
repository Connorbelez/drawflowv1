import type { AssistantClientActionKey } from "./assistantActionCatalog.ts";
import {
  normalizeAssistantRoute,
  type AssistantClientAction,
} from "./assistantClientActionBridge.ts";
import {
  findAssistantRouteMatch,
  type AssistantRouteMatch,
} from "./assistantRouteRegistry.ts";
import type { DrawFlowAssistantRouteContext } from "./assistantRouteContext.ts";

export type AssistantWorkflowPlannedAction = {
  actionKey: string;
  clientRequestId: string;
  input: Record<string, unknown>;
};

export type AssistantWorkflowReminderIntent = {
  allDay: boolean;
  startsAt: string;
  timezone: string;
  title: string;
};

export type AssistantWorkflowStepKind =
  | "answer"
  | "navigate"
  | "wait_for_route"
  | "wait_for_client_capability"
  | "run_client_action"
  | "render_agui"
  | "wait_for_agui_submit"
  | "prepare_hitl_action_plan"
  | "self_check"
  | "fail_soft";

export type AssistantWorkflowStepStatus =
  | "pending"
  | "running"
  | "needs_input"
  | "succeeded"
  | "failed"
  | "skipped";

export type AssistantWorkflowStep = {
  error?: string;
  expectedResult?: Record<string, unknown>;
  id: string;
  input?: Record<string, unknown>;
  kind: AssistantWorkflowStepKind;
  label: string;
  repairAction?: Record<string, unknown>;
  result?: unknown;
  status: AssistantWorkflowStepStatus;
};

export type AssistantWorkflowPlan = {
  goal: string;
  message: string;
  steps: AssistantWorkflowStep[];
};

export type AssistantWorkflowNavigationTarget = {
  label: string;
  reason?: string;
  routeId?: string;
  to: string;
};

export type AssistantWorkflowRun = {
  _id: string;
  currentStepId?: string;
  finalSummary?: string;
  goal: string;
  prompt: string;
  routeContext: unknown;
  status: "running" | "needs_input" | "succeeded" | "failed" | "cancelled";
  steps: AssistantWorkflowStep[];
};

export type AssistantWorkflowUiEvent = {
  payload?: unknown;
  stepId: string;
  type: "select" | "submit" | "navigate" | "choice";
  workflowRunId: string;
};

export function buildDeterministicWorkflowPlan(
  prompt: string,
  routeContext: DrawFlowAssistantRouteContext
): AssistantWorkflowPlan | null {
  const templateKey = proposalTemplateKeyFromPrompt(prompt);
  if (!templateKey) {
    return null;
  }
  const routeMatch = findAssistantRouteMatch(prompt, routeContext);
  if (!routeMatch || !isNewProposalRoute(routeMatch.to)) {
    return null;
  }
  return buildProposalTemplateWorkflow({
    label: templateKey === "garden-suite" ? "Garden Suite" : "Laneway Suite",
    routeMatch,
    templateKey,
  });
}

export function enrichWorkflowForPlannerNavigation({
  prompt,
  routeContext,
  to,
}: {
  prompt: string;
  routeContext: DrawFlowAssistantRouteContext;
  to: string;
}) {
  const templateKey = proposalTemplateKeyFromPrompt(prompt);
  if (!templateKey || !isNewProposalRoute(to)) {
    return null;
  }
  const routeMatch =
    findAssistantRouteMatch(prompt, routeContext) ??
    ({
      entry: {
        id: "planner.new-build",
        label: "New Build",
        pathTemplate: to,
        purpose: "Start a Build Proposal workflow.",
        requiredParams: [],
        roles: [],
        synonyms: [],
        workspace: routeContext.workspace,
      },
      params: {},
      to,
    } as AssistantRouteMatch);
  return buildProposalTemplateWorkflow({
    label: templateKey === "garden-suite" ? "Garden Suite" : "Laneway Suite",
    routeMatch,
    templateKey,
  });
}

export function buildReminderTargetWorkflowPlan({
  intent,
  message,
  title,
}: {
  intent: AssistantWorkflowReminderIntent;
  message: string;
  title: string;
}): AssistantWorkflowPlan {
  return {
    goal: `Create reminder: ${intent.title}`,
    message,
    steps: [
      {
        id: "render:reminder-target-selector",
        input: {
          submitStepId: "wait:reminder-target-selector",
          uiParts: [
            {
              emptyText: "No build or proposal matches that search.",
              selectorKind: "reminderTarget",
              title,
              type: "selector",
            },
          ],
        },
        kind: "render_agui",
        label: "Show reminder target selector",
        status: "pending",
      },
      {
        id: "wait:reminder-target-selector",
        input: { selectorKind: "reminderTarget" },
        kind: "wait_for_agui_submit",
        label: "Wait for reminder target selection",
        status: "pending",
      },
      {
        id: "hitl:reminder-preview",
        input: {
          actionBuilder: "create_reminder_from_target",
          intent,
          sourceStepId: "wait:reminder-target-selector",
        },
        kind: "prepare_hitl_action_plan",
        label: "Prepare reminder preview",
        status: "pending",
      },
    ],
  };
}

export function buildHitlPreviewWorkflowPlan({
  actions,
  goal,
  message,
}: {
  actions: AssistantWorkflowPlannedAction[];
  goal: string;
  message: string;
}): AssistantWorkflowPlan {
  return {
    goal,
    message,
    steps: [
      {
        id: "hitl:action-preview",
        input: { actions },
        kind: "prepare_hitl_action_plan",
        label: "Prepare HITL preview",
        status: "pending",
      },
    ],
  };
}

export function buildNavigationResumeWorkflowPlan({
  finalSummary,
  message,
  navigation,
  uiParts,
}: {
  finalSummary?: string;
  message: string;
  navigation: AssistantWorkflowNavigationTarget;
  uiParts?: unknown[];
}): AssistantWorkflowPlan {
  const renderStepId = "render:post-navigation-response";
  const steps: AssistantWorkflowStep[] = [
    {
      id: "navigate:target-route",
      input: {
        label: navigation.label,
        purpose: navigation.reason ?? "Assistant workflow navigation",
        routeId: navigation.routeId ?? navigation.to,
        to: navigation.to,
      },
      kind: "navigate",
      label: `Open ${navigation.label}`,
      status: "pending",
    },
    {
      expectedResult: { route: navigation.to },
      id: "wait:target-route",
      input: { route: navigation.to },
      kind: "wait_for_route",
      label: `Wait for ${navigation.label}`,
      status: "pending",
    },
  ];

  if ((uiParts ?? []).length > 0) {
    steps.push({
      id: renderStepId,
      input: { refreshPlannerResponse: true, uiParts },
      kind: "render_agui",
      label: "Render post-navigation summary",
      status: "pending",
    });
  }

  steps.push({
    expectedResult: { route: navigation.to },
    id: "self-check:post-navigation-goal",
    input: {
      checkKind: "post_navigation_goal",
      expectedRoute: navigation.to,
      finalSummary:
        finalSummary ??
        `Opened ${navigation.label} and completed the requested follow-up.`,
      renderedStepId: (uiParts ?? []).length > 0 ? renderStepId : undefined,
    },
    kind: "self_check",
    label: "Confirm the full assistant goal is complete",
    status: "pending",
  });

  return {
    goal: `Open ${navigation.label} and complete the requested follow-up`,
    message,
    steps,
  };
}

export function nextRunnableWorkflowStep(run: AssistantWorkflowRun) {
  if (run.status !== "running" && run.status !== "needs_input") {
    return null;
  }
  const nextOpenStep = run.steps.find(
    (step) => !["succeeded", "skipped", "failed"].includes(step.status)
  );
  if (!nextOpenStep || nextOpenStep.status === "needs_input") {
    return null;
  }
  if (nextOpenStep.status === "pending") {
    return nextOpenStep;
  }
  if (
    nextOpenStep.status === "running" &&
    (nextOpenStep.kind === "wait_for_route" ||
      nextOpenStep.kind === "wait_for_client_capability" ||
      nextOpenStep.kind === "wait_for_agui_submit")
  ) {
    return nextOpenStep;
  }
  return null;
}

export function isAssistantWorkflowRun(value: unknown): value is AssistantWorkflowRun {
  return (
    Boolean(value) &&
    typeof value === "object" &&
    typeof (value as Record<string, unknown>)._id === "string" &&
    typeof (value as Record<string, unknown>).goal === "string" &&
    Array.isArray((value as Record<string, unknown>).steps)
  );
}

export function workflowStepClientAction(step: AssistantWorkflowStep) {
  const action = step.input?.action;
  return isAssistantClientActionLike(action) ? (action as AssistantClientAction) : null;
}

export function workflowStepClientActionKey(step: AssistantWorkflowStep) {
  if (typeof step.input?.actionKey === "string") {
    return step.input.actionKey as AssistantClientActionKey;
  }
  const action = workflowStepClientAction(step);
  return action?.actionKey as AssistantClientActionKey | undefined;
}

export function workflowStepRoute(step: AssistantWorkflowStep) {
  return typeof step.input?.to === "string"
    ? step.input.to
    : typeof step.input?.route === "string"
      ? step.input.route
      : undefined;
}

function buildProposalTemplateWorkflow({
  label,
  routeMatch,
  templateKey,
}: {
  label: string;
  routeMatch: AssistantRouteMatch;
  templateKey: string;
}): AssistantWorkflowPlan {
  const action: AssistantClientAction = {
    actionKey: "select_proposal_template",
    input: { templateKey },
    route: routeMatch.to,
  };
  return {
    goal: `Start a new ${label} build proposal`,
    message: `I’ll open the new Build Proposal flow and select ${label}.`,
    steps: [
      {
        id: "navigate:new-proposal",
        input: {
          label: routeMatch.entry.label,
          purpose: routeMatch.entry.purpose,
          routeId: routeMatch.entry.id,
          to: routeMatch.to,
        },
        kind: "navigate",
        label: `Open ${routeMatch.entry.label}`,
        status: "pending",
      },
      {
        expectedResult: { route: routeMatch.to },
        id: "wait:new-proposal-route",
        input: { route: routeMatch.to },
        kind: "wait_for_route",
        label: "Wait for the new proposal route",
        status: "pending",
      },
      {
        expectedResult: { actionKey: "select_proposal_template" },
        id: "wait:proposal-template-capability",
        input: { actionKey: "select_proposal_template" },
        kind: "wait_for_client_capability",
        label: "Wait for proposal template controls",
        status: "pending",
      },
      {
        expectedResult: { ok: true, templateKey },
        id: "client-action:select-proposal-template",
        input: { action },
        kind: "run_client_action",
        label: `Select ${label}`,
        repairAction: {
          action,
          label: `Select ${label}`,
          type: "client_action",
        },
        status: "pending",
      },
      {
        expectedResult: { templateKey },
        id: "self-check:proposal-template",
        input: {
          resultStepId: "client-action:select-proposal-template",
          templateKey,
        },
        kind: "self_check",
        label: `Confirm ${label} is selected`,
        status: "pending",
      },
    ],
  };
}

export function proposalTemplateKeyFromPrompt(prompt: string) {
  const normalized = prompt
    .toLowerCase()
    .replace(/\bgarden\s*suites?\b/g, "garden suite")
    .replace(/\blaneway\s*suites?\b/g, "laneway suite")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (hasGardenSuiteTemplateIntent(normalized)) {
    return "garden-suite";
  }
  if (hasLanewaySuiteTemplateIntent(normalized)) {
    return "garden-suite";
  }
  return null;
}

function isNewProposalRoute(pathname: string) {
  const normalized = normalizeAssistantRoute(pathname);
  return (
    normalized === "/backoffice/proposals/new" ||
    normalized === "/builder/proposals/new"
  );
}

function hasGardenSuiteTemplateIntent(normalized: string) {
  if (/\bgarden\s+suite(s)?\b/.test(normalized)) {
    return true;
  }
  if (/\bgardensuite(s)?\b/.test(normalized)) {
    return true;
  }
  if (
    /\bgarden\s+(build|proposal|project|template|home|unit|dwelling|adu)\b/.test(
      normalized
    )
  ) {
    return true;
  }
  return (
    /\b(backyard|secondary|accessory)\s+(suite|unit|dwelling)\b/.test(
      normalized
    ) ||
    /\baccessory\s+dwelling\s+unit\b/.test(normalized) ||
    /\badu\s+(build|proposal|project|template|home|unit)\b/.test(normalized)
  );
}

function hasLanewaySuiteTemplateIntent(normalized: string) {
  return (
    /\blaneway\s+(suite|build|proposal|project|template|home|unit|dwelling)\b/.test(
      normalized
    ) || /\blanewaysuite(s)?\b/.test(normalized)
  );
}

function isAssistantClientActionLike(value: unknown) {
  return (
    Boolean(value) &&
    typeof value === "object" &&
    typeof (value as Record<string, unknown>).actionKey === "string"
  );
}
