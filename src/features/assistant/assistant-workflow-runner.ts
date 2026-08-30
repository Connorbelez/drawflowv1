"use client";

import { api } from "../../../convex/_generated/api";
import type { AssistantSelectionOption } from "./AssistantAutocompleteSelection.tsx";
import { type AssistantGeneratedUiPart } from "./AssistantGenerativeUI.tsx";
import {
  dispatchAssistantClientActionWithResult,
  hasAssistantClientActionCapability,
  normalizeAssistantRoute,
  type AssistantClientAction,
} from "./assistantClientActionBridge.ts";
import {
  actionsToPreviewItems,
  buildAssistantSiteMap,
  buildReminderActionForTarget,
  dispatchReadonlyClientAction,
  isRecord,
  normalizeGeneratedUiParts,
  normalizePlannerActions,
} from "./assistant-action-helpers.ts";
import type { DrawFlowAssistantRouteContext } from "./assistantRouteContext.ts";
import type {
  AssistantWorkflowRun,
  AssistantWorkflowStep,
} from "./assistantWorkflow.ts";
import {
  workflowStepClientAction,
  workflowStepClientActionKey,
  workflowStepRoute,
} from "./assistantWorkflow.ts";
import type {
  PlannedAction,
  PreviewItem,
  ReminderIntent,
} from "./drawflow-assistant-contracts.ts";

const WORKFLOW_WAIT_STEP_TIMEOUT_MS = 15_000;

export async function runWorkflowStep({
  convex,
  createActionPlan,
  createNavigationTrace,
  organizationId,
  planAssistantTurn,
  routeContext,
  run,
  setCommitMessage,
  setGeneratedUiParts,
  setPlanId,
  setPreviewItems,
  step,
  threadId,
  updateWorkflowStep,
}: {
  convex: { query: (query: any, args: any) => Promise<unknown> };
  createActionPlan: (args: Record<string, unknown>) => Promise<string>;
  createNavigationTrace: (args: Record<string, unknown>) => Promise<unknown>;
  organizationId: string;
  planAssistantTurn: (args: Record<string, unknown>) => Promise<unknown>;
  routeContext: DrawFlowAssistantRouteContext;
  run: AssistantWorkflowRun;
  setCommitMessage: (message: string | null) => void;
  setGeneratedUiParts: (parts: AssistantGeneratedUiPart[]) => void;
  setPlanId: (planId: string | null) => void;
  setPreviewItems: (items: PreviewItem[]) => void;
  step: AssistantWorkflowStep;
  threadId: string | null;
  updateWorkflowStep: (args: Record<string, unknown>) => Promise<unknown>;
}) {
  const workflowRunId = run._id;
  if (step.kind === "navigate") {
    const to = workflowStepRoute(step);
    if (!to) {
      await updateWorkflowStep({
        error: "Navigation step is missing a target route.",
        status: "failed",
        stepId: step.id,
        workflowRunId,
        workosOrganizationId: organizationId,
      });
      return;
    }
    await updateWorkflowStep({
      result: { to },
      status: "running",
      stepId: step.id,
      workflowRunId,
      workosOrganizationId: organizationId,
    });
    await dispatchReadonlyClientAction(
      {
        actionKey: "open_route",
        label:
          typeof step.input?.label === "string" ? step.input.label : "Route",
        message: `Opened ${to}.`,
        purpose:
          typeof step.input?.purpose === "string"
            ? step.input.purpose
            : "Assistant workflow navigation",
        routeId:
          typeof step.input?.routeId === "string" ? step.input.routeId : to,
        to,
      },
      {
        createNavigationTrace,
        organizationId,
        routeContext,
        threadId,
      }
    );
    await updateWorkflowStep({
      result: { to },
      routeContext,
      status: "succeeded",
      stepId: step.id,
      workflowRunId,
      workosOrganizationId: organizationId,
    });
    return;
  }

  if (step.kind === "wait_for_route") {
    const expectedRoute = workflowStepRoute(step);
    if (
      expectedRoute &&
      normalizeAssistantRoute(routeContext.pathname) ===
        normalizeAssistantRoute(expectedRoute)
    ) {
      await updateWorkflowStep({
        result: { pathname: routeContext.pathname },
        routeContext,
        status: "succeeded",
        stepId: step.id,
        workflowRunId,
        workosOrganizationId: organizationId,
      });
      return;
    }
    const startedAt = workflowStepStartedAt(step);
    if (
      step.status === "running" &&
      startedAt &&
      Date.now() - startedAt > WORKFLOW_WAIT_STEP_TIMEOUT_MS
    ) {
      await updateWorkflowStep({
        error: `I could not reach ${expectedRoute ?? "the target route"} automatically.`,
        result: {
          current: routeContext.pathname,
          timedOut: true,
          waitingFor: expectedRoute,
        },
        status: "needs_input",
        stepId: step.id,
        workflowRunId,
        workosOrganizationId: organizationId,
      });
      return;
    }
    if (step.status === "pending") {
      await updateWorkflowStep({
        result: {
          current: routeContext.pathname,
          startedAt: Date.now(),
          waitingFor: expectedRoute,
        },
        status: "running",
        stepId: step.id,
        workflowRunId,
        workosOrganizationId: organizationId,
      });
    }
    return;
  }

  if (step.kind === "wait_for_client_capability") {
    const actionKey = workflowStepClientActionKey(step);
    if (actionKey && hasAssistantClientActionCapability(actionKey)) {
      await updateWorkflowStep({
        result: { actionKey },
        status: "succeeded",
        stepId: step.id,
        workflowRunId,
        workosOrganizationId: organizationId,
      });
      return;
    }
    const startedAt = workflowStepStartedAt(step);
    if (
      step.status === "running" &&
      startedAt &&
      Date.now() - startedAt > WORKFLOW_WAIT_STEP_TIMEOUT_MS
    ) {
      await updateWorkflowStep({
        error: `${actionKey ?? "The required client action"} never became available on this screen.`,
        result: {
          timedOut: true,
          waitingFor: actionKey,
        },
        status: "needs_input",
        stepId: step.id,
        workflowRunId,
        workosOrganizationId: organizationId,
      });
      return;
    }
    if (step.status === "pending") {
      await updateWorkflowStep({
        result: { startedAt: Date.now(), waitingFor: actionKey },
        status: "running",
        stepId: step.id,
        workflowRunId,
        workosOrganizationId: organizationId,
      });
    }
    return;
  }

  if (step.kind === "render_agui") {
    const uiParts = await workflowUiPartsForStep({
      convex,
      organizationId,
      planAssistantTurn,
      routeContext,
      run,
      step,
      threadId,
    });
    if (uiParts.length === 0) {
      await updateWorkflowStep({
        error: "AGUI render step is missing UI parts.",
        status: "failed",
        stepId: step.id,
        workflowRunId,
        workosOrganizationId: organizationId,
      });
      return;
    }
    setGeneratedUiParts(uiParts);
    await updateWorkflowStep({
      result: {
        renderedPartCount: uiParts.length,
        route: routeContext.pathname,
        source:
          step.input?.refreshPlannerResponse === true
            ? "post_navigation_planner"
            : "workflow_step",
      },
      status: "succeeded",
      stepId: step.id,
      workflowRunId,
      workosOrganizationId: organizationId,
    });
    return;
  }

  if (step.kind === "wait_for_agui_submit") {
    if (step.status === "pending" || step.status === "running") {
      await updateWorkflowStep({
        error: undefined,
        result: {
          startedAt: workflowStepStartedAt(step) ?? Date.now(),
          waitingFor:
            step.input?.selectorKind ?? step.input?.formKind ?? "agui",
        },
        status: "needs_input",
        stepId: step.id,
        workflowRunId,
        workosOrganizationId: organizationId,
      });
    }
    return;
  }

  if (step.kind === "run_client_action") {
    const action = workflowStepClientAction(step);
    if (!action) {
      await updateWorkflowStep({
        error: "Client action step is missing an action payload.",
        status: "failed",
        stepId: step.id,
        workflowRunId,
        workosOrganizationId: organizationId,
      });
      return;
    }
    const result = dispatchAssistantClientActionWithResult({
      ...action,
      route: action.route ?? routeContext.pathname,
      stepId: step.id,
      workflowId: workflowRunId,
      workflowLabel: run.goal,
    });
    if (!result.handled) {
      await updateWorkflowStep({
        error: `${action.actionKey} is not available on this screen.`,
        result: {
          repairAction: step.repairAction,
        },
        status: "needs_input",
        stepId: step.id,
        workflowRunId,
        workosOrganizationId: organizationId,
      });
      return;
    }
    const resultRecord = isRecord(result.result) ? result.result : {};
    if (resultRecord.retryable === true) {
      await updateWorkflowStep({
        result: result.result,
        status: "running",
        stepId: step.id,
        workflowRunId,
        workosOrganizationId: organizationId,
      });
      return;
    }
    await updateWorkflowStep({
      error:
        resultRecord.ok === false && typeof resultRecord.reason === "string"
          ? resultRecord.reason
          : undefined,
      result: result.result,
      status: resultRecord.ok === false ? "needs_input" : "succeeded",
      stepId: step.id,
      workflowRunId,
      workosOrganizationId: organizationId,
    });
    return;
  }

  if (step.kind === "prepare_hitl_action_plan") {
    const actions = workflowActionsForHitlStep(step, run);
    if (actions.length === 0) {
      await updateWorkflowStep({
        error:
          "I could not derive a valid HITL action preview from the workflow state.",
        status: "needs_input",
        stepId: step.id,
        workflowRunId,
        workosOrganizationId: organizationId,
      });
      return;
    }
    const nextPlanId = await createActionPlan({
      actions,
      routeContext,
      threadId: threadId ?? undefined,
      workosOrganizationId: organizationId,
    });
    setPlanId(nextPlanId);
    setCommitMessage("Prepared HITL action preview from the workflow.");
    setPreviewItems(actionsToPreviewItems(actions));
    setGeneratedUiParts([]);
    await updateWorkflowStep({
      result: { actionCount: actions.length, planId: nextPlanId },
      status: "succeeded",
      stepId: step.id,
      workflowRunId,
      workosOrganizationId: organizationId,
    });
    return;
  }

  if (step.kind === "self_check") {
    if (step.input?.checkKind === "post_navigation_goal") {
      const expectedRoute =
        typeof step.input.expectedRoute === "string"
          ? step.input.expectedRoute
          : undefined;
      const renderedStepId =
        typeof step.input.renderedStepId === "string"
          ? step.input.renderedStepId
          : undefined;
      const finalSummary =
        typeof step.input.finalSummary === "string"
          ? step.input.finalSummary
          : "Assistant workflow complete.";
      const routeMatches =
        expectedRoute &&
        normalizeAssistantRoute(routeContext.pathname) ===
          normalizeAssistantRoute(expectedRoute);
      const renderedStep = renderedStepId
        ? run.steps.find((candidate) => candidate.id === renderedStepId)
        : null;
      const rendered = renderedStepId
        ? renderedStep?.status === "succeeded"
        : true;
      const renderedResult = isRecord(renderedStep?.result)
        ? renderedStep.result
        : {};
      const renderedSummary =
        typeof renderedResult.text === "string"
          ? renderedResult.text
          : finalSummary;
      const complete = Boolean(routeMatches && rendered);
      await updateWorkflowStep({
        error: complete
          ? undefined
          : `Expected ${expectedRoute ?? "the target route"} and rendered follow-up output before marking the workflow complete.`,
        finalSummary: complete ? renderedSummary : undefined,
        result: {
          complete,
          expectedRoute,
          observedRoute: routeContext.pathname,
          rendered,
          renderedSummary,
          renderedStepId,
        },
        status: complete ? "succeeded" : "needs_input",
        stepId: step.id,
        workflowRunId,
        workosOrganizationId: organizationId,
      });
      return;
    }
    const expectedTemplateKey =
      typeof step.input?.templateKey === "string"
        ? step.input.templateKey
        : undefined;
    const resultStepId =
      typeof step.input?.resultStepId === "string"
        ? step.input.resultStepId
        : undefined;
    const resultStep = run.steps.find(
      (candidate) => candidate.id === resultStepId
    );
    const result = isRecord(resultStep?.result) ? resultStep?.result : {};
    const complete =
      expectedTemplateKey &&
      result.ok === true &&
      result.templateKey === expectedTemplateKey;
    await updateWorkflowStep({
      error: complete
        ? undefined
        : `Expected ${expectedTemplateKey ?? "the requested template"} to be selected.`,
      finalSummary: complete ? "Garden Suite selected" : undefined,
      result: {
        complete,
        expectedTemplateKey,
        observed: result,
      },
      status: complete ? "succeeded" : "needs_input",
      stepId: step.id,
      workflowRunId,
      workosOrganizationId: organizationId,
    });
    return;
  }

  if (step.kind === "answer") {
    await updateWorkflowStep({
      result: step.input ?? {},
      status: "succeeded",
      stepId: step.id,
      workflowRunId,
      workosOrganizationId: organizationId,
    });
    return;
  }

  if (step.kind === "fail_soft") {
    await updateWorkflowStep({
      error:
        typeof step.input?.message === "string"
          ? step.input.message
          : "The workflow needs manual follow-up.",
      result: step.input ?? {},
      status: "needs_input",
      stepId: step.id,
      workflowRunId,
      workosOrganizationId: organizationId,
    });
  }
}

function workflowStepStartedAt(step: AssistantWorkflowStep) {
  const result = isRecord(step.result) ? step.result : {};
  return typeof result.startedAt === "number" ? result.startedAt : null;
}

async function workflowUiPartsForStep({
  convex,
  organizationId,
  planAssistantTurn,
  routeContext,
  run,
  step,
  threadId,
}: {
  convex: { query: (query: any, args: any) => Promise<unknown> };
  organizationId: string;
  planAssistantTurn: (args: Record<string, unknown>) => Promise<unknown>;
  routeContext: DrawFlowAssistantRouteContext;
  run: AssistantWorkflowRun;
  step: AssistantWorkflowStep;
  threadId: string | null;
}) {
  const rawParts = Array.isArray(step.input?.uiParts) ? step.input.uiParts : [];
  const submitStepId =
    typeof step.input?.submitStepId === "string"
      ? step.input.submitStepId
      : run.steps.find(
          (candidate) =>
            candidate.kind === "wait_for_agui_submit" &&
            (candidate.status === "pending" || candidate.status === "running")
        )?.id;
  if (step.input?.refreshPlannerResponse === true) {
    const refreshedParts = await freshPlannerUiPartsForStep({
      convex,
      organizationId,
      planAssistantTurn,
      routeContext,
      run,
      threadId,
    });
    if (refreshedParts.length > 0) {
      return refreshedParts.map((part) => ({
        ...part,
        stepId: submitStepId ?? step.id,
        workflowRunId: run._id,
      }));
    }
  }
  if (rawParts.length === 0) {
    return [];
  }
  return normalizeGeneratedUiParts(rawParts).map((part) => ({
    ...part,
    stepId: submitStepId ?? step.id,
    workflowRunId: run._id,
  }));
}

async function freshPlannerUiPartsForStep({
  convex,
  organizationId,
  planAssistantTurn,
  routeContext,
  run,
  threadId,
}: {
  convex: { query: (query: any, args: any) => Promise<unknown> };
  organizationId: string;
  planAssistantTurn: (args: Record<string, unknown>) => Promise<unknown>;
  routeContext: DrawFlowAssistantRouteContext;
  run: AssistantWorkflowRun;
  threadId: string | null;
}) {
  const assistantContext = await convex
    .query((api as any).assistant.getAssistantContext, {
      routeContext,
      workosOrganizationId: organizationId,
    })
    .catch((error: unknown) => ({
      contextUnavailable: true,
      reason: error instanceof Error ? error.message : String(error),
    }));
  const plannerResponse = await planAssistantTurn({
    assistantContext,
    prompt: run.prompt,
    routeContext,
    siteMap: buildAssistantSiteMap(routeContext),
    threadId: threadId ?? undefined,
    workosOrganizationId: organizationId,
  }).catch(() => null);
  return normalizeGeneratedUiParts(
    isRecord(plannerResponse) ? plannerResponse.uiParts : null
  );
}

function workflowActionsForHitlStep(
  step: AssistantWorkflowStep,
  run: AssistantWorkflowRun
): PlannedAction[] {
  const directActions = normalizePlannerActions(step.input?.actions);
  if (directActions.length > 0) {
    return directActions;
  }
  if (step.input?.actionBuilder !== "create_reminder_from_target") {
    return [];
  }
  const intent = isReminderIntent(step.input.intent) ? step.input.intent : null;
  const sourceStepId =
    typeof step.input.sourceStepId === "string"
      ? step.input.sourceStepId
      : undefined;
  const sourceStep = run.steps.find(
    (candidate) => candidate.id === sourceStepId
  );
  const result = isRecord(sourceStep?.result) ? sourceStep.result : {};
  const payload = isRecord(result.payload) ? result.payload : {};
  const option = isRecord(payload.option) ? payload.option : null;
  if (!(intent && isAssistantSelectionOption(option))) {
    return [];
  }
  return [buildReminderActionForTarget(intent, option)];
}

function isReminderIntent(value: unknown): value is ReminderIntent {
  return (
    isRecord(value) &&
    typeof value.allDay === "boolean" &&
    typeof value.startsAt === "string" &&
    typeof value.timezone === "string" &&
    typeof value.title === "string"
  );
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

export function workflowRepairAction(step: AssistantWorkflowStep) {
  const directAction = step.repairAction?.action;
  if (isRecord(directAction) && typeof directAction.actionKey === "string") {
    return directAction as AssistantClientAction;
  }
  const result = isRecord(step.result) ? step.result : {};
  const resultRepair = isRecord(result.repairAction)
    ? result.repairAction
    : null;
  const resultAction = isRecord(resultRepair?.action)
    ? resultRepair.action
    : null;
  return resultAction && typeof resultAction.actionKey === "string"
    ? (resultAction as AssistantClientAction)
    : null;
}
