"use client";

import { EventType } from "@ag-ui/core";
import {
  AssistantRuntimeProvider,
  type ChatModelAdapter,
  ComposerPrimitive,
  ThreadPrimitive,
  useLocalRuntime,
} from "@assistant-ui/react";
import { useAction, useConvex, useMutation, useQuery } from "convex/react";
import { Bot, Send, Sparkles, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AssistantAutocompleteSelection,
  type AssistantSelectionOption,
} from "./AssistantAutocompleteSelection.tsx";
import { AssistantGenerativeUI } from "./AssistantGenerativeUI.tsx";
import { Button } from "#/components/ui/button.tsx";
import { Frame, FramePanel } from "#/components/ui/frame.tsx";
import { cn } from "#/lib/utils.ts";
import { api } from "../../../convex/_generated/api";
import {
  ASSISTANT_CLIENT_ACTION_CAPABILITY_EVENT,
  dispatchAssistantClientActionWithResult,
} from "./assistantClientActionBridge.ts";
import type { DrawFlowAssistantRouteContext } from "./assistantRouteContext.ts";
import {
  planningFocusScopeKey,
  usePlanningFocus,
} from "./assistantPlanningFocus.ts";
import type {
  AssistantCostItemDraft,
  AssistantGeneratedUiPart,
} from "./AssistantGenerativeUI.tsx";
import {
  buildDeterministicWorkflowPlan,
  buildNavigationResumeWorkflowPlan,
  buildReminderTargetWorkflowPlan,
  enrichWorkflowForPlannerNavigation,
  isAssistantWorkflowRun,
  nextRunnableWorkflowStep,
  type AssistantWorkflowRun,
  type AssistantWorkflowStep,
} from "./assistantWorkflow.ts";
import {
  actionsToPreviewItems,
  buildAssistantSiteMap,
  buildClosedCatalogActions,
  buildCostItemActionFromDraft,
  buildReadonlyClientAction,
  buildReminderActionForTarget,
  dispatchReadonlyClientAction,
  isRecord,
  isValidWorkflowUiEventForStep,
  latestUserText,
  normalizeGeneratedUiParts,
  normalizePlannerActions,
  normalizePlannerNavigation,
  parsePreviewValue,
  requiresPostNavigationWorkflow,
  assistantText,
  commitSuccessMessage,
} from "./assistant-action-helpers.ts";
import {
  type AssistantCommitState,
  type AssistantSelectionRequest,
  type DrawFlowAssistantProps,
  type PreviewItem,
} from "./drawflow-assistant-contracts.ts";
import {
  AssistantMessage,
  AssistantPreviewBatch,
  AssistantWorkflowStatus,
  UserMessage,
} from "./assistant-presentation.tsx";
import {
  runWorkflowStep,
  workflowRepairAction,
} from "./assistant-workflow-runner.ts";
import { DrawFlowAssistantLauncher } from "./DrawFlowAssistantLauncher.tsx";

export type { DrawFlowAssistantProps } from "./drawflow-assistant-contracts.ts";
export {
  buildCostItemActionFromDraft,
  buildReminderActions,
  extractReminderDate,
  extractReminderDateTime,
} from "./assistant-action-helpers.ts";

export function DrawFlowAssistant({
  onOpenChange,
  open,
  routeContext,
}: DrawFlowAssistantProps) {
  const [sessionKey, setSessionKey] = useState(0);

  const closeAndReset = useCallback(() => {
    setSessionKey((value) => value + 1);
    onOpenChange(false);
  }, [onOpenChange]);

  if (!open) {
    return <DrawFlowAssistantLauncher onOpen={() => onOpenChange(true)} />;
  }

  return (
    <DrawFlowAssistantSession
      key={sessionKey}
      onClose={closeAndReset}
      routeContext={routeContext}
    />
  );
}

function DrawFlowAssistantSession({
  onClose,
  routeContext: baseRouteContext,
}: {
  onClose: () => void;
  routeContext: DrawFlowAssistantRouteContext;
}) {
  // Merge conversational focus (sub-milestone checkbox selection) into the
  // route context so every planner turn sees the current deictic target.
  const planningFocus = usePlanningFocus(
    planningFocusScopeKey({
      pathname: baseRouteContext.pathname,
      proposalId: baseRouteContext.proposalId,
    })
  );
  const routeContext = useMemo<DrawFlowAssistantRouteContext>(
    () =>
      planningFocus.selectedSubmilestoneKeys.length > 0
        ? {
            ...baseRouteContext,
            selectedSubmilestoneKeys: planningFocus.selectedSubmilestoneKeys,
          }
        : baseRouteContext,
    [baseRouteContext, planningFocus.selectedSubmilestoneKeys]
  );
  const [threadId, setThreadId] = useState<string | null>(null);
  const [planId, setPlanId] = useState<string | null>(null);
  const [commitState, setCommitState] = useState<AssistantCommitState>("idle");
  const [commitMessage, setCommitMessage] = useState<string | null>(null);
  const [previewItems, setPreviewItems] = useState<PreviewItem[]>([]);
  const [selectionRequest, setSelectionRequest] =
    useState<AssistantSelectionRequest | null>(null);
  const [generatedUiParts, setGeneratedUiParts] = useState<
    AssistantGeneratedUiPart[]
  >([]);
  const executingWorkflowStepRef = useRef<string | null>(null);
  const ensureThread = useMutation((api as any).assistant.ensureThread);
  const convex = useConvex();
  const createWorkflowRun = useMutation(
    (api as any).assistant.createWorkflowRun
  );
  const createActionPlan = useMutation((api as any).assistant.createActionPlan);
  const commitActionPlan = useMutation((api as any).assistant.commitActionPlan);
  const createNavigationTrace = useMutation(
    (api as any).assistant.createNavigationTrace
  );
  const recordTrace = useMutation((api as any).assistant.recordTraceEvent);
  const updateWorkflowStep = useMutation(
    (api as any).assistant.updateWorkflowStep
  );
  const providerStatus = useAction((api as any).assistant.getProviderStatus);
  const planAssistantTurn = useAction((api as any).assistant.planAssistantTurn);
  const runAssistantTurn = useAction((api as any).assistant.runAssistantTurn);
  const reminderTargets = useQuery(
    (api as any).assistant.listReminderTargets,
    routeContext.organizationId && routeContext.authDiagnostics.hasToken
      ? { workosOrganizationId: routeContext.organizationId }
      : "skip"
  );
  const activeWorkflowRun = useQuery(
    (api as any).assistant.getActiveWorkflowRun,
    routeContext.organizationId && routeContext.authDiagnostics.hasToken
      ? {
          ...(threadId ? { threadId } : {}),
          workosOrganizationId: routeContext.organizationId,
        }
      : "skip"
  ) as AssistantWorkflowRun | null | undefined;
  const currentWorkflowRun = isAssistantWorkflowRun(activeWorkflowRun)
    ? activeWorkflowRun
    : null;
  const [workflowCapabilityVersion, setWorkflowCapabilityVersion] = useState(0);
  const [workflowHeartbeat, setWorkflowHeartbeat] = useState(0);

  useEffect(() => {
    if (
      !(routeContext.organizationId && routeContext.authDiagnostics.hasToken)
    ) {
      return;
    }
    let cancelled = false;
    ensureThread({
      routeContext,
      threadId: threadId ?? undefined,
      title: "DrawFlow assistant",
      workosOrganizationId: routeContext.organizationId,
    }).then((nextThreadId: string) => {
      if (!cancelled) {
        setThreadId(nextThreadId);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [ensureThread, routeContext, threadId]);

  const modelAdapter = useMemo<ChatModelAdapter>(
    () => ({
      async run({ messages }) {
        const prompt = latestUserText(messages);
        setSelectionRequest(null);
        setGeneratedUiParts([]);
        const organizationId = routeContext.organizationId;
        if (!organizationId) {
          return assistantText(
            "Your WorkOS session is authenticated without an active organization claim. Refresh the session or select an organization before using the DrawFlow assistant."
          );
        }
        if (!routeContext.authDiagnostics.hasToken) {
          return assistantText(
            "Your WorkOS organization is present, but the Convex auth token is not available in this session. Refresh the DrawFlow session before using workflow actions."
          );
        }
        if (threadId) {
          await recordTrace({
            event: {
              aguiType: EventType.RUN_STARTED,
              label: "Assistant turn started",
              metadata: { routeContext },
              status: "running",
            },
            threadId,
            workosOrganizationId: organizationId,
          });
        }
        const deterministicWorkflow = buildDeterministicWorkflowPlan(
          prompt,
          routeContext
        );
        if (deterministicWorkflow) {
          await createWorkflowRun({
            goal: deterministicWorkflow.goal,
            prompt,
            routeContext,
            steps: deterministicWorkflow.steps,
            threadId: threadId ?? undefined,
            workosOrganizationId: organizationId,
          });
          setCommitMessage(null);
          setCommitState("idle");
          setPreviewItems([]);
          setSelectionRequest(null);
          setGeneratedUiParts([]);
          return assistantText(deterministicWorkflow.message);
        }
        const plannedActions = buildClosedCatalogActions(prompt, routeContext);
        if (plannedActions.kind === "select") {
          const workflow = buildReminderTargetWorkflowPlan({
            intent: plannedActions.selection.intent,
            message: plannedActions.message,
            title: plannedActions.selection.title,
          });
          await createWorkflowRun({
            goal: workflow.goal,
            prompt,
            routeContext,
            steps: workflow.steps,
            threadId: threadId ?? undefined,
            workosOrganizationId: organizationId,
          });
          setCommitMessage(null);
          setCommitState("idle");
          setPreviewItems([]);
          setSelectionRequest(null);
          setGeneratedUiParts([]);
          return assistantText(plannedActions.message);
        }
        if (plannedActions.kind === "clarify") {
          return assistantText(
            plannedActions.message ??
              "I prepared a persisted HITL action batch. Review, edit, reject, then confirm the accepted set."
          );
        }
        if (plannedActions.actions.length > 0) {
          const nextPlanId = await createActionPlan({
            actions: plannedActions.actions,
            routeContext,
            threadId: threadId ?? undefined,
            workosOrganizationId: organizationId,
          });
          setPlanId(nextPlanId);
          setCommitMessage(null);
          setCommitState("idle");
          setPreviewItems(actionsToPreviewItems(plannedActions.actions));
          setSelectionRequest(null);
          return assistantText(
            plannedActions.message ??
              "I prepared a persisted HITL action batch. Review, edit, reject, then confirm the accepted set."
          );
        }
        const nextAssistantContext = await convex
          .query((api as any).assistant.getAssistantContext, {
            routeContext,
            workosOrganizationId: organizationId,
          })
          .catch((error: unknown) => ({
            contextUnavailable: true,
            reason: error instanceof Error ? error.message : String(error),
          }));
        const plannerResponse = await planAssistantTurn({
          assistantContext: nextAssistantContext,
          prompt,
          routeContext,
          siteMap: buildAssistantSiteMap(routeContext),
          threadId: threadId ?? undefined,
          workosOrganizationId: organizationId,
        });
        const plannerActions = normalizePlannerActions(
          plannerResponse?.actions
        );
        if (plannerActions.length > 0) {
          const nextPlanId = await createActionPlan({
            actions: plannerActions,
            routeContext,
            threadId: threadId ?? undefined,
            workosOrganizationId: organizationId,
          });
          setPlanId(nextPlanId);
          setCommitMessage(null);
          setCommitState("idle");
          setPreviewItems(actionsToPreviewItems(plannerActions));
          setSelectionRequest(null);
          setGeneratedUiParts(
            normalizeGeneratedUiParts(plannerResponse?.uiParts)
          );
          return assistantText(
            plannerResponse?.text ??
              "I prepared a persisted HITL action batch. Review it, edit it if needed, then confirm the accepted set."
          );
        }
        const plannerNavigation = normalizePlannerNavigation(
          plannerResponse?.navigation
        );
        if (plannerNavigation) {
          const enrichedWorkflow = enrichWorkflowForPlannerNavigation({
            prompt,
            routeContext,
            to: plannerNavigation.to,
          });
          if (enrichedWorkflow) {
            await createWorkflowRun({
              goal: enrichedWorkflow.goal,
              prompt,
              routeContext,
              steps: enrichedWorkflow.steps,
              threadId: threadId ?? undefined,
              workosOrganizationId: organizationId,
            });
            setGeneratedUiParts(
              normalizeGeneratedUiParts(plannerResponse?.uiParts)
            );
            return assistantText(enrichedWorkflow.message);
          }
          const plannerUiParts = normalizeGeneratedUiParts(
            plannerResponse?.uiParts
          );
          if (requiresPostNavigationWorkflow(prompt, plannerUiParts)) {
            const navigationWorkflow = buildNavigationResumeWorkflowPlan({
              finalSummary: plannerResponse?.text,
              message:
                plannerResponse?.text ??
                `I’ll open ${plannerNavigation.label}, verify the route, and complete the requested follow-up.`,
              navigation: plannerNavigation,
              uiParts: plannerUiParts,
            });
            await createWorkflowRun({
              goal: navigationWorkflow.goal,
              prompt,
              routeContext,
              steps: navigationWorkflow.steps,
              threadId: threadId ?? undefined,
              workosOrganizationId: organizationId,
            });
            setCommitMessage(null);
            setCommitState("idle");
            setPreviewItems([]);
            setGeneratedUiParts([]);
            return assistantText(navigationWorkflow.message);
          }
          await dispatchReadonlyClientAction(
            {
              actionKey: "open_route",
              label: plannerNavigation.label,
              message: `I can take you to ${plannerNavigation.label}: ${plannerNavigation.reason}`,
              purpose: plannerNavigation.reason,
              routeId: plannerNavigation.routeId,
              to: plannerNavigation.to,
            },
            {
              createNavigationTrace,
              organizationId,
              routeContext,
              threadId,
            }
          );
          setGeneratedUiParts(plannerUiParts);
          return assistantText(
            plannerResponse?.text ??
              `I can take you to ${plannerNavigation.label}.`
          );
        }
        const plannerUiParts = normalizeGeneratedUiParts(
          plannerResponse?.uiParts
        );
        if (plannerUiParts.length > 0) {
          setGeneratedUiParts(plannerUiParts);
          return assistantText(
            plannerResponse?.text ?? "I put together the next step below."
          );
        }
        const readonlyAction = buildReadonlyClientAction(prompt, routeContext);
        if (readonlyAction) {
          await dispatchReadonlyClientAction(readonlyAction, {
            createNavigationTrace,
            organizationId,
            routeContext,
            threadId,
          });
          return assistantText(readonlyAction.message);
        }
        const status = await providerStatus({});
        if (status.readOnly) {
          return assistantText(
            "Model-backed answers are unavailable because OPENAI_API_KEY or OPENROUTER_API_KEY is missing on the server. I can still use DrawFlow context, briefings, generated forms, navigation, and HITL action previews."
          );
        }
        const response = await runAssistantTurn({
          prompt,
          routeContext,
          threadId: threadId ?? undefined,
          workosOrganizationId: organizationId,
        });
        return assistantText(response.text);
      },
    }),
    [
      convex,
      createActionPlan,
      createNavigationTrace,
      createWorkflowRun,
      planAssistantTurn,
      providerStatus,
      recordTrace,
      routeContext,
      runAssistantTurn,
      threadId,
    ]
  );

  const runtime = useLocalRuntime(modelAdapter);

  useEffect(() => {
    const refreshCapabilities = () =>
      setWorkflowCapabilityVersion((version) => version + 1);
    window.addEventListener(
      ASSISTANT_CLIENT_ACTION_CAPABILITY_EVENT,
      refreshCapabilities
    );
    return () =>
      window.removeEventListener(
        ASSISTANT_CLIENT_ACTION_CAPABILITY_EVENT,
        refreshCapabilities
      );
  }, []);

  useEffect(() => {
    if (!currentWorkflowRun) {
      return;
    }
    const runningWaitStep = currentWorkflowRun.steps.find(
      (step) =>
        step.status === "running" &&
        (step.kind === "wait_for_route" ||
          step.kind === "wait_for_client_capability" ||
          step.kind === "wait_for_agui_submit")
    );
    if (!runningWaitStep) {
      return;
    }
    const timeout = window.setTimeout(
      () => setWorkflowHeartbeat((value) => value + 1),
      2000
    );
    return () => window.clearTimeout(timeout);
  }, [currentWorkflowRun, workflowHeartbeat]);

  useEffect(() => {
    if (!(currentWorkflowRun && routeContext.organizationId)) {
      return;
    }
    const step = nextRunnableWorkflowStep(currentWorkflowRun);
    if (!step) {
      return;
    }
    const executionKey = `${currentWorkflowRun._id}:${step.id}:${step.status}:${routeContext.pathname}:${workflowCapabilityVersion}:${workflowHeartbeat}`;
    if (executingWorkflowStepRef.current === executionKey) {
      return;
    }
    executingWorkflowStepRef.current = executionKey;
    void runWorkflowStep({
      convex,
      createActionPlan,
      createNavigationTrace,
      organizationId: routeContext.organizationId,
      planAssistantTurn,
      routeContext,
      run: currentWorkflowRun,
      setCommitMessage,
      setGeneratedUiParts,
      setPlanId,
      setPreviewItems,
      step,
      threadId,
      updateWorkflowStep,
    }).finally(() => {
      executingWorkflowStepRef.current = null;
    });
  }, [
    convex,
    currentWorkflowRun,
    createActionPlan,
    createNavigationTrace,
    planAssistantTurn,
    routeContext,
    threadId,
    updateWorkflowStep,
    workflowCapabilityVersion,
    workflowHeartbeat,
  ]);

  const handleSelectReminderTarget = useCallback(
    async (target: AssistantSelectionOption) => {
      if (!(selectionRequest && routeContext.organizationId)) {
        return;
      }
      const action = buildReminderActionForTarget(
        selectionRequest.intent,
        target
      );
      const nextPlanId = await createActionPlan({
        actions: [action],
        routeContext,
        threadId: threadId ?? undefined,
        workosOrganizationId: routeContext.organizationId,
      });
      setPlanId(nextPlanId);
      setCommitMessage(
        `Prepared reminder for ${target.kind === "activeBuild" ? "live build" : "proposal"} ${target.label}.`
      );
      setCommitState("idle");
      setPreviewItems(actionsToPreviewItems([action]));
      setSelectionRequest(null);
    },
    [createActionPlan, routeContext, selectionRequest, threadId]
  );

  const handleGeneratedNavigation = useCallback(
    async (target: { label: string; reason?: string; to: string }) => {
      if (!routeContext.organizationId) {
        return;
      }
      await dispatchReadonlyClientAction(
        {
          actionKey: "open_route",
          label: target.label,
          message: `Opened ${target.label}.`,
          purpose: target.reason ?? "Assistant navigation",
          to: target.to,
        },
        {
          createNavigationTrace,
          organizationId: routeContext.organizationId,
          routeContext,
          threadId,
        }
      );
    },
    [createNavigationTrace, routeContext, threadId]
  );

  const handleSubmitCostItemDraft = useCallback(
    async (draft: AssistantCostItemDraft) => {
      if (!routeContext.organizationId) {
        return;
      }
      const action = buildCostItemActionFromDraft(draft);
      const nextPlanId = await createActionPlan({
        actions: [action],
        routeContext,
        threadId: threadId ?? undefined,
        workosOrganizationId: routeContext.organizationId,
      });
      setPlanId(nextPlanId);
      setCommitMessage("Prepared material/content item for review.");
      setCommitState("idle");
      setPreviewItems(actionsToPreviewItems([action]));
    },
    [createActionPlan, routeContext, threadId]
  );

  const handleWorkflowRepair = useCallback(
    async (step: AssistantWorkflowStep) => {
      if (!(currentWorkflowRun && routeContext.organizationId)) {
        return;
      }
      const repairAction = workflowRepairAction(step);
      if (!repairAction) {
        return;
      }
      const result = dispatchAssistantClientActionWithResult({
        ...repairAction,
        route: repairAction.route ?? routeContext.pathname,
        stepId: step.id,
        workflowId: currentWorkflowRun._id,
        workflowLabel: currentWorkflowRun.goal,
      });
      const resultRecord = isRecord(result.result) ? result.result : {};
      await updateWorkflowStep({
        error:
          !result.handled || resultRecord.ok === false
            ? typeof resultRecord.reason === "string"
              ? resultRecord.reason
              : "Repair action could not be completed."
            : undefined,
        result: result.result,
        status:
          result.handled && resultRecord.ok !== false
            ? "succeeded"
            : "needs_input",
        stepId: step.id,
        workflowRunId: currentWorkflowRun._id,
        workosOrganizationId: routeContext.organizationId,
      });
    },
    [currentWorkflowRun, routeContext, updateWorkflowStep]
  );

  const handleWorkflowUiEvent = useCallback(
    async (event: {
      payload?: unknown;
      stepId: string;
      type: "choice" | "navigate" | "select" | "submit";
      workflowRunId: string;
    }) => {
      if (
        !routeContext.organizationId ||
        event.workflowRunId !== currentWorkflowRun?._id
      ) {
        return;
      }
      const step = currentWorkflowRun.steps.find(
        (candidate) => candidate.id === event.stepId
      );
      if (!isValidWorkflowUiEventForStep(step, event)) {
        await updateWorkflowStep({
          error:
            "Choose or submit a valid generated UI value before I continue.",
          result: {
            payload: event.payload,
            type: event.type,
          },
          status: "needs_input",
          stepId: event.stepId,
          workflowRunId: event.workflowRunId,
          workosOrganizationId: routeContext.organizationId,
        });
        return;
      }
      await updateWorkflowStep({
        result: {
          payload: event.payload,
          type: event.type,
        },
        status: "succeeded",
        stepId: event.stepId,
        workflowRunId: event.workflowRunId,
        workosOrganizationId: routeContext.organizationId,
      });
    },
    [currentWorkflowRun, routeContext.organizationId, updateWorkflowStep]
  );

  const handlePreviewStatus = useCallback(
    (clientRequestId: string, status: "accepted" | "rejected") => {
      setPreviewItems((items) =>
        items.map((item) =>
          item.clientRequestId === clientRequestId ? { ...item, status } : item
        )
      );
    },
    []
  );
  const handlePreviewAfterChange = useCallback(
    (clientRequestId: string, value: string) => {
      setPreviewItems((items) =>
        items.map((item) =>
          item.clientRequestId === clientRequestId
            ? { ...item, after: parsePreviewValue(value), status: "edited" }
            : item
        )
      );
    },
    []
  );
  const handleCommitAccepted = useCallback(async () => {
    if (!routeContext.organizationId) {
      setCommitMessage(
        "Join an organization before confirming assistant actions."
      );
      setCommitState("failed");
      return;
    }
    if (!planId) {
      setCommitMessage(
        "Ask the assistant to prepare a persisted action batch first."
      );
      setCommitState("failed");
      return;
    }
    const acceptedItems = previewItems.filter(
      (item) => item.status !== "rejected"
    );
    const rejectedItems = previewItems.filter(
      (item) => item.status === "rejected"
    );
    const editedInputs: Record<string, Record<string, unknown>> = {};
    for (const item of acceptedItems) {
      if (item.status !== "edited") {
        continue;
      }
      if (!isRecord(item.after)) {
        setCommitMessage(
          `Fix ${item.entityLabel}: edited after value must be a JSON object.`
        );
        setCommitState("failed");
        return;
      }
      editedInputs[item.clientRequestId] = item.after;
    }
    setCommitState("committing");
    setCommitMessage("Committing accepted assistant batch...");
    let outcome: any;
    try {
      outcome = await commitActionPlan({
        acceptedClientRequestIds: acceptedItems.map(
          (item) => item.clientRequestId
        ),
        editedInputs,
        planId,
        rejectedClientRequestIds: rejectedItems.map(
          (item) => item.clientRequestId
        ),
        workosOrganizationId: routeContext.organizationId,
      });
    } catch (error) {
      setCommitState("failed");
      setCommitMessage(
        error instanceof Error
          ? error.message
          : "Assistant batch commit failed."
      );
      return;
    }
    if (outcome?.ok) {
      setCommitState("committed");
      setCommitMessage(commitSuccessMessage(acceptedItems, outcome));
      setPreviewItems((items) =>
        items.map((item) =>
          item.status === "rejected" ? item : { ...item, status: "accepted" }
        )
      );
      return;
    }
    setCommitState("failed");
    setCommitMessage(outcome?.reason ?? "Assistant batch validation failed.");
    if (outcome?.failedClientRequestId) {
      setPreviewItems((items) =>
        items.map((item) =>
          item.clientRequestId === outcome.failedClientRequestId
            ? {
                ...item,
                validation: {
                  errors: [outcome.reason ?? "Validation failed."],
                  warnings: item.validation?.warnings ?? [],
                },
              }
            : item
        )
      );
    }
  }, [commitActionPlan, planId, previewItems, routeContext.organizationId]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <section
        aria-label="DrawFlow AI assistant"
        aria-modal="false"
        className={cn(
          "fixed right-0 bottom-0 z-[100000] flex h-[100svh] w-full max-w-full flex-col border-l bg-background text-foreground shadow-2xl outline-none",
          "sm:right-4 sm:bottom-4 sm:h-[min(760px,calc(100svh-2rem))] sm:w-[480px] sm:rounded-xl sm:border"
        )}
        data-testid="drawflow-assistant-surface"
        role="dialog"
      >
        <div className="flex items-center justify-between border-b px-4 py-3">
          <div className="flex min-w-0 items-center gap-2">
            <span className="flex size-8 items-center justify-center rounded-md bg-primary text-primary-foreground">
              <Sparkles className="size-4" />
            </span>
            <div className="min-w-0">
              <h2 className="truncate font-semibold text-sm">DrawFlow AI</h2>
              <p className="truncate text-muted-foreground text-xs">
                Route-aware HITL assistant
              </p>
            </div>
          </div>
          <Button
            aria-label="Close assistant"
            onClick={onClose}
            size="icon"
            variant="ghost"
          >
            <X className="size-4" />
          </Button>
        </div>

        <ThreadPrimitive.Root className="flex min-h-0 flex-1 flex-col">
          <ThreadPrimitive.Viewport className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4 py-4">
            <Frame data-testid="assistant-route-context">
              <FramePanel className="space-y-3 p-4">
                <div className="flex items-center gap-2 font-medium text-sm">
                  <Bot className="size-4" />
                  Current context
                </div>
                <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
                  <dt className="text-muted-foreground">Route</dt>
                  <dd className="truncate">{routeContext.pathname}</dd>
                  <dt className="text-muted-foreground">Proposal</dt>
                  <dd>{routeContext.proposalId ?? "None"}</dd>
                  <dt className="text-muted-foreground">Build</dt>
                  <dd>{routeContext.activeBuildId ?? "None"}</dd>
                  <dt className="text-muted-foreground">Panel</dt>
                  <dd>{routeContext.selectedPanel ?? "Default"}</dd>
                  <dt className="text-muted-foreground">Org</dt>
                  <dd>
                    {routeContext.authDiagnostics.hasOrganization
                      ? routeContext.organizationId
                      : "Missing organization claim"}
                  </dd>
                </dl>
              </FramePanel>
            </Frame>
            <ThreadPrimitive.Messages>
              {({ message }) =>
                message.role === "user" ? <UserMessage /> : <AssistantMessage />
              }
            </ThreadPrimitive.Messages>
            <AssistantPreviewBatch
              commitMessage={commitMessage}
              commitState={commitState}
              items={previewItems}
              onAfterChange={handlePreviewAfterChange}
              onCommitAccepted={handleCommitAccepted}
              onStatusChange={handlePreviewStatus}
            />
            <AssistantWorkflowStatus
              onRepair={handleWorkflowRepair}
              run={currentWorkflowRun}
            />
            <AssistantGenerativeUI
              onNavigate={handleGeneratedNavigation}
              onSubmitCostItem={handleSubmitCostItemDraft}
              onWorkflowUiEvent={handleWorkflowUiEvent}
              parts={generatedUiParts}
              selectionLoading={reminderTargets === undefined}
              selectionOptions={reminderTargets?.targets ?? []}
            />
            {selectionRequest ? (
              <AssistantAutocompleteSelection
                emptyText="No build or proposal matches that search."
                loading={reminderTargets === undefined}
                onSelect={handleSelectReminderTarget}
                options={reminderTargets?.targets ?? []}
                title={selectionRequest.title}
              />
            ) : null}
          </ThreadPrimitive.Viewport>
          <ComposerPrimitive.Root className="border-t p-3">
            <div className="flex items-end gap-2 rounded-lg border bg-background p-2">
              <ComposerPrimitive.Input
                className="max-h-36 min-h-10 flex-1 resize-none bg-transparent px-2 py-2 text-sm outline-none"
                placeholder="Ask about this build, proposal, draw, or calendar..."
                rows={1}
              />
              <ComposerPrimitive.Send asChild>
                <Button aria-label="Send assistant message" size="icon">
                  <Send className="size-4" />
                </Button>
              </ComposerPrimitive.Send>
            </div>
          </ComposerPrimitive.Root>
        </ThreadPrimitive.Root>
      </section>
    </AssistantRuntimeProvider>
  );
}
