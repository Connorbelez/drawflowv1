"use client";

import { EventType } from "@ag-ui/core";
import {
  AssistantRuntimeProvider,
  type ChatModelAdapter,
  ComposerPrimitive,
  MessagePartPrimitive,
  MessagePrimitive,
  ThreadPrimitive,
  useLocalRuntime,
} from "@assistant-ui/react";
import { useAction, useConvex, useMutation, useQuery } from "convex/react";
import {
  Bot,
  Check,
  GitPullRequestArrow,
  Send,
  Sparkles,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "#/components/ui/button.tsx";
import {
  Card,
  CardHeader,
  CardPanel,
  CardTitle,
} from "#/components/ui/card.tsx";
import { Frame, FramePanel } from "#/components/ui/frame.tsx";
import { cn } from "#/lib/utils.ts";
import { api } from "../../../convex/_generated/api";
import {
  AssistantAutocompleteSelection,
  type AssistantSelectionOption,
} from "./AssistantAutocompleteSelection.tsx";
import {
  ASSISTANT_CLIENT_ACTION_CAPABILITY_EVENT,
  dispatchAssistantClientActionWithResult,
  hasAssistantClientActionCapability,
  normalizeAssistantRoute,
  type AssistantClientAction,
} from "./assistantClientActionBridge.ts";
import {
  assistantRouteSitemapSummary,
  findAssistantRouteMatch,
  reachableAssistantRoutes,
} from "./assistantRouteRegistry.ts";
import type { DrawFlowAssistantRouteContext } from "./assistantRouteContext.ts";
import {
  AssistantGenerativeUI,
  type AssistantCostItemDraft,
  type AssistantGeneratedUiPart,
} from "./AssistantGenerativeUI.tsx";
import {
  buildDeterministicWorkflowPlan,
  buildNavigationResumeWorkflowPlan,
  buildReminderTargetWorkflowPlan,
  enrichWorkflowForPlannerNavigation,
  isAssistantWorkflowRun,
  nextRunnableWorkflowStep,
  proposalTemplateKeyFromPrompt,
  type AssistantWorkflowPlannedAction,
  type AssistantWorkflowRun,
  type AssistantWorkflowStep,
  workflowStepClientAction,
  workflowStepClientActionKey,
  workflowStepRoute,
} from "./assistantWorkflow.ts";
import { DrawFlowAssistantLauncher } from "./DrawFlowAssistantLauncher.tsx";

type DrawFlowAssistantProps = {
  onOpenChange: (open: boolean) => void;
  open: boolean;
  routeContext: DrawFlowAssistantRouteContext;
};

type PreviewItem = {
  actionKey: string;
  after?: unknown;
  before?: unknown;
  clientRequestId: string;
  entityLabel: string;
  entityType: string;
  input?: Record<string, unknown>;
  reasonRequired?: boolean;
  status?: "accepted" | "edited" | "preview" | "rejected";
  validation?: {
    errors?: string[];
    warnings?: string[];
  };
};

type AssistantCommitState = "idle" | "committing" | "committed" | "failed";

type ReminderIntent = {
  allDay: boolean;
  startsAt: string;
  timezone: string;
  title: string;
};

type AssistantSelectionRequest = {
  intent: ReminderIntent;
  title: string;
  type: "reminderTarget";
};

const WORKFLOW_WAIT_STEP_TIMEOUT_MS = 15_000;

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
    return (
      <DrawFlowAssistantLauncher onOpen={() => onOpenChange(true)} />
    );
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
  routeContext,
}: {
  onClose: () => void;
  routeContext: DrawFlowAssistantRouteContext;
}) {
  const [threadId, setThreadId] = useState<string | null>(null);
  const [planId, setPlanId] = useState<string | null>(null);
  const [commitState, setCommitState] =
    useState<AssistantCommitState>("idle");
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
    if (!routeContext.organizationId || !routeContext.authDiagnostics.hasToken) {
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
        const plannerActions = normalizePlannerActions(plannerResponse?.actions);
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
          setGeneratedUiParts(normalizeGeneratedUiParts(plannerResponse?.uiParts));
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
            setGeneratedUiParts(normalizeGeneratedUiParts(plannerResponse?.uiParts));
            return assistantText(enrichedWorkflow.message);
          }
          const plannerUiParts = normalizeGeneratedUiParts(plannerResponse?.uiParts);
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
        const plannerUiParts = normalizeGeneratedUiParts(plannerResponse?.uiParts);
        if (plannerUiParts.length > 0) {
          setGeneratedUiParts(plannerUiParts);
          return assistantText(
            plannerResponse?.text ??
              "I put together the next step below."
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
      2_000
    );
    return () => window.clearTimeout(timeout);
  }, [currentWorkflowRun, workflowHeartbeat]);

  useEffect(() => {
    if (!currentWorkflowRun || !routeContext.organizationId) {
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
      if (!selectionRequest || !routeContext.organizationId) {
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
      if (!currentWorkflowRun || !routeContext.organizationId) {
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
        status: result.handled && resultRecord.ok !== false ? "succeeded" : "needs_input",
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
      if (!routeContext.organizationId || event.workflowRunId !== currentWorkflowRun?._id) {
        return;
      }
      const step = currentWorkflowRun.steps.find(
        (candidate) => candidate.id === event.stepId
      );
      if (!isValidWorkflowUiEventForStep(step, event)) {
        await updateWorkflowStep({
          error: "Choose or submit a valid generated UI value before I continue.",
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
        error instanceof Error ? error.message : "Assistant batch commit failed."
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
                  message.role === "user" ? (
                    <UserMessage />
                  ) : (
                    <AssistantMessage />
                  )
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

async function runWorkflowStep({
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
          waitingFor: step.input?.selectorKind ?? step.input?.formKind ?? "agui",
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
        error: "I could not derive a valid HITL action preview from the workflow state.",
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
      const rendered = renderedStepId ? renderedStep?.status === "succeeded" : true;
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
    const resultStep = run.steps.find((candidate) => candidate.id === resultStepId);
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
  const rawParts = Array.isArray(step.input?.uiParts)
    ? step.input.uiParts
    : [];
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
  const sourceStep = run.steps.find((candidate) => candidate.id === sourceStepId);
  const result = isRecord(sourceStep?.result) ? sourceStep.result : {};
  const payload = isRecord(result.payload) ? result.payload : {};
  const option = isRecord(payload.option) ? payload.option : null;
  if (!intent || !isAssistantSelectionOption(option)) {
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

function workflowRepairAction(step: AssistantWorkflowStep) {
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

function UserMessage() {
  return (
    <MessagePrimitive.Root className="flex justify-end">
      <div className="max-w-[82%] rounded-lg bg-primary px-3 py-2 text-primary-foreground text-sm">
        <MessagePrimitive.Content />
      </div>
    </MessagePrimitive.Root>
  );
}

function AssistantMessage() {
  return (
    <MessagePrimitive.Root className="flex justify-start">
      <div className="max-w-[88%] rounded-lg border bg-muted/40 px-3 py-2 text-sm">
        <MessagePrimitive.Content
          components={{
            Text: () => (
              <MessagePartPrimitive.Text
                className="whitespace-pre-wrap leading-6"
                component="p"
              />
            ),
          }}
        />
      </div>
    </MessagePrimitive.Root>
  );
}

function AssistantWorkflowStatus({
  onRepair,
  run,
}: {
  onRepair: (step: AssistantWorkflowStep) => void;
  run: AssistantWorkflowRun | null;
}) {
  if (!run) {
    return null;
  }
  const activeStep =
    run.steps.find((step) => step.status === "needs_input") ??
    run.steps.find((step) => step.status === "running") ??
    run.steps.find((step) => step.status === "pending") ??
    run.steps.at(-1);
  const repairAction = activeStep ? workflowRepairAction(activeStep) : null;
  return (
    <Card data-testid="assistant-workflow-status">
      <CardHeader className="p-4 pb-2">
        <CardTitle className="text-sm">{run.goal}</CardTitle>
      </CardHeader>
      <CardPanel className="space-y-3 p-4 pt-0">
        <div className="space-y-1 text-xs">
          {run.steps.map((step) => (
            <div
              className="grid grid-cols-[auto_1fr] items-center gap-2"
              data-testid={`assistant-workflow-step-${step.id}`}
              key={step.id}
            >
              <span
                className={cn(
                  "size-2 rounded-full",
                  step.status === "succeeded"
                    ? "bg-primary"
                    : step.status === "needs_input" || step.status === "failed"
                      ? "bg-destructive"
                      : "bg-muted-foreground/40"
                )}
              />
              <span className="truncate">
                {step.label}
                <span className="ml-2 text-muted-foreground">
                  {step.status}
                </span>
              </span>
            </div>
          ))}
        </div>
        {run.finalSummary ? (
          <p className="font-medium text-primary text-sm">{run.finalSummary}</p>
        ) : null}
        {activeStep?.error ? (
          <p className="text-destructive text-xs">{activeStep.error}</p>
        ) : null}
        {activeStep && repairAction ? (
          <Button
            onClick={() => onRepair(activeStep)}
            size="sm"
            type="button"
            variant="secondary"
          >
            {typeof activeStep.repairAction?.label === "string"
              ? activeStep.repairAction.label
              : "Retry workflow step"}
          </Button>
        ) : null}
      </CardPanel>
    </Card>
  );
}

function AssistantPreviewBatch({
  commitMessage,
  commitState,
  items,
  onAfterChange,
  onCommitAccepted,
  onStatusChange,
}: {
  commitMessage?: string | null;
  commitState: AssistantCommitState;
  items: PreviewItem[];
  onAfterChange: (clientRequestId: string, value: string) => void;
  onCommitAccepted: () => void;
  onStatusChange: (
    clientRequestId: string,
    status: "accepted" | "rejected"
  ) => void;
}) {
  if (items.length === 0) {
    return null;
  }
  const accepted = items.filter((item) => item.status !== "rejected").length;
  const locked = commitState === "committing" || commitState === "committed";
  return (
    <Card data-testid="assistant-hitl-preview">
      <CardHeader className="p-4">
        <CardTitle className="flex items-center gap-2 text-sm">
          <GitPullRequestArrow className="size-4" />
          HITL action batch
        </CardTitle>
      </CardHeader>
      <CardPanel className="space-y-3 p-4 pt-0">
        {items.map((item, index) => (
          <div
            className="rounded-md border bg-background p-3"
            data-testid="assistant-preview-card"
            key={item.clientRequestId}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-medium text-sm">{item.entityLabel}</p>
                <p className="text-muted-foreground text-xs">
                  {index + 1}. {item.actionKey}
                </p>
              </div>
              <span className="rounded border px-2 py-0.5 text-xs">
                {item.status ?? "preview"}
              </span>
            </div>
            <div className="mt-3 grid gap-2 text-xs">
              <PreviewValue label="Before" value={item.before} />
              <EditablePreviewValue
                clientRequestId={item.clientRequestId}
                label="After"
                onChange={onAfterChange}
                value={item.after}
              />
            </div>
            {(item.validation?.warnings ?? []).length > 0 ? (
              <p className="mt-2 text-muted-foreground text-xs">
                {item.validation?.warnings?.join(" ")}
              </p>
            ) : null}
            {(item.validation?.errors ?? []).length > 0 ? (
              <p className="mt-2 text-destructive text-xs">
                {item.validation?.errors?.join(" ")}
              </p>
            ) : null}
            <div className="mt-3 flex gap-2">
              <Button
                disabled={locked}
                onClick={() => onStatusChange(item.clientRequestId, "accepted")}
                size="sm"
                variant={item.status === "accepted" ? "default" : "outline"}
                type="button"
              >
                <Check className="size-3.5" />
                Accept
              </Button>
              <Button
                disabled={locked}
                onClick={() => onStatusChange(item.clientRequestId, "rejected")}
                size="sm"
                variant={item.status === "rejected" ? "destructive" : "outline"}
                type="button"
              >
                <X className="size-3.5" />
                Reject
              </Button>
            </div>
          </div>
        ))}
        <div className="flex items-center justify-between border-t pt-3 text-xs">
          <span className="text-muted-foreground">
            {accepted} accepted in batch
          </span>
          <Button
            disabled={locked}
            onClick={onCommitAccepted}
            size="sm"
            type="button"
            variant="secondary"
          >
            {commitState === "committing"
              ? "Committing..."
              : commitState === "committed"
                ? "Committed"
                : "Confirm accepted batch"}
          </Button>
        </div>
        <p
          className={cn(
            "text-xs",
            commitState === "failed" ? "text-destructive" : "text-muted-foreground"
          )}
          data-testid="assistant-commit-state"
        >
          {commitState === "idle"
            ? "Preview pending confirmation"
            : commitState === "committing"
              ? "Committing accepted assistant actions..."
              : commitState === "committed"
                ? "Accepted assistant actions committed."
                : "Assistant action commit failed."}
        </p>
        {commitMessage ? (
          <p className="text-xs" data-testid="assistant-commit-message">
            {commitMessage}
          </p>
        ) : null}
      </CardPanel>
    </Card>
  );
}

function PreviewValue({ label, value }: { label: string; value: unknown }) {
  return (
    <div className="grid grid-cols-[4rem_1fr] gap-2">
      <span className="text-muted-foreground">{label}</span>
      <code className="min-w-0 overflow-hidden rounded bg-muted px-2 py-1 text-[11px]">
        {value === null || value === undefined ? "None" : JSON.stringify(value)}
      </code>
    </div>
  );
}

function EditablePreviewValue({
  clientRequestId,
  label,
  onChange,
  value,
}: {
  clientRequestId: string;
  label: string;
  onChange: (clientRequestId: string, value: string) => void;
  value: unknown;
}) {
  return (
    <label className="grid grid-cols-[4rem_1fr] gap-2">
      <span className="text-muted-foreground">{label}</span>
      <textarea
        aria-label={`Edit ${label.toLowerCase()} value for ${clientRequestId}`}
        className="min-h-16 min-w-0 resize-y rounded border bg-background px-2 py-1 font-mono text-[11px]"
        onChange={(event) =>
          onChange(clientRequestId, event.currentTarget.value)
        }
        value={
          value === null || value === undefined ? "" : JSON.stringify(value)
        }
      />
    </label>
  );
}

function latestUserText(messages: readonly any[]) {
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

function assistantText(text: string) {
  return {
    content: [{ text, type: "text" as const }],
    status: { reason: "stop" as const, type: "complete" as const },
  };
}

function parsePreviewValue(value: string) {
  if (!value.trim()) {
    return null;
  }
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

type PlannedAction = AssistantWorkflowPlannedAction;

function buildClosedCatalogActions(
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

function buildReadonlyClientAction(
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

async function dispatchReadonlyClientAction(
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

function buildAssistantSiteMap(routeContext: DrawFlowAssistantRouteContext) {
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

function normalizePlannerActions(value: unknown): PlannedAction[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter(isPlannedAction);
}

function normalizeGeneratedUiParts(value: unknown): AssistantGeneratedUiPart[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter(isGeneratedUiPart);
}

function normalizePlannerNavigation(value: unknown) {
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

function requiresPostNavigationWorkflow(
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

function isValidWorkflowUiEventForStep(
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
    return event.type === "select" && isAssistantSelectionOption(payload?.option);
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

function withUnitDescription(description: string | undefined, unit: string | undefined) {
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
  if (!isReminderRequest || !normalized.includes("remind")) {
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
  if (!routeContext.proposalId && !routeContext.activeBuildId) {
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
    message:
      routeContext.activeBuildId
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

function buildReminderActionForTarget(
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
  const withoutDate = stripReminderDateAndTime(prompt)
    .trim();
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
        period === "pm" ? (hour === 12 ? 12 : hour + 12) : hour === 12 ? 0 : hour;
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

function actionsToPreviewItems(actions: PlannedAction[]): PreviewItem[] {
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

function commitSuccessMessage(items: PreviewItem[], outcome: unknown) {
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
