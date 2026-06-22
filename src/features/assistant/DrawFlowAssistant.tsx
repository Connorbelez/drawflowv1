"use client";

import {
  AssistantRuntimeProvider,
  ComposerPrimitive,
  MessagePartPrimitive,
  MessagePrimitive,
  ThreadPrimitive,
  useLocalRuntime,
  type ChatModelAdapter,
} from "@assistant-ui/react";
import { EventType } from "@ag-ui/core";
import { useAction, useMutation } from "convex/react";
import { Bot, Check, GitPullRequestArrow, Send, Sparkles, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "../../../convex/_generated/api";
import { Button } from "#/components/ui/button.tsx";
import { Card, CardHeader, CardPanel, CardTitle } from "#/components/ui/card.tsx";
import { Frame, FramePanel } from "#/components/ui/frame.tsx";
import { cn } from "#/lib/utils.ts";
import type { DrawFlowAssistantRouteContext } from "./assistantRouteContext.ts";

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

const EXAMPLE_PREVIEW_ITEMS: PreviewItem[] = [
  {
    actionKey: "update_proposal_milestone_schedule",
    after: { dayEnd: 45, dayStart: 30 },
    before: { dayEnd: 30, dayStart: 30 },
    clientRequestId: "example_schedule",
    entityLabel: "Second milestone",
    entityType: "proposalMilestone",
    status: "preview",
    validation: { warnings: ["Revalidates against current route state before commit."] },
  },
  {
    actionKey: "create_proposal_planned_draw",
    after: { amountCents: 8_000_000, timingDay: 47 },
    before: null,
    clientRequestId: "example_draw",
    entityLabel: "Reimbursement draw 2 days after",
    entityType: "proposalDrawScheduleRow",
    status: "preview",
    validation: { warnings: ["Preview only until accepted and confirmed."] },
  },
];

export function DrawFlowAssistant({
  onOpenChange,
  open,
  routeContext,
}: DrawFlowAssistantProps) {
  const [threadId, setThreadId] = useState<string | null>(null);
  const [planId, setPlanId] = useState<string | null>(null);
  const [commitMessage, setCommitMessage] = useState<string | null>(null);
  const [previewItems, setPreviewItems] = useState<PreviewItem[]>(
    EXAMPLE_PREVIEW_ITEMS,
  );
  const ensureThread = useMutation((api as any).assistant.ensureThread);
  const createActionPlan = useMutation((api as any).assistant.createActionPlan);
  const commitActionPlan = useMutation((api as any).assistant.commitActionPlan);
  const createNavigationTrace = useMutation(
    (api as any).assistant.createNavigationTrace,
  );
  const recordTrace = useMutation((api as any).assistant.recordTraceEvent);
  const providerStatus = useAction((api as any).assistant.getProviderStatus);
  const runAssistantTurn = useAction((api as any).assistant.runAssistantTurn);

  useEffect(() => {
    if (!open || !routeContext.organizationId) {
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
  }, [ensureThread, open, routeContext, threadId]);

  const modelAdapter = useMemo<ChatModelAdapter>(
    () => ({
      async run({ messages }) {
        const prompt = latestUserText(messages);
        const organizationId = routeContext.organizationId;
        if (!organizationId) {
          return assistantText(
            "Sign in to a WorkOS organization before using the DrawFlow assistant.",
          );
        }
        const status = await providerStatus({});
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
        if (status.readOnly) {
          return assistantText(
            "Model-backed actions are unavailable because OPENAI_API_KEY or OPENROUTER_API_KEY is missing on the server. I can still help explain this route and show the HITL action preview pattern.",
          );
        }
        const readonlyAction = buildReadonlyClientAction(prompt, routeContext);
        if (readonlyAction) {
          if (threadId) {
            await createNavigationTrace({
              aguiEvent: {
                action: readonlyAction,
                routeContext,
                type: EventType.CUSTOM,
              },
              threadId,
              workosOrganizationId: organizationId,
            });
          }
          window.dispatchEvent(
            new CustomEvent("drawflow-assistant:readonly-action", {
              detail: readonlyAction,
            }),
          );
          return assistantText(readonlyAction.message);
        }
        const plannedActions = buildClosedCatalogActions(prompt, routeContext);
        if (plannedActions.kind === "clarify") {
          return assistantText(plannedActions.message);
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
          setPreviewItems(actionsToPreviewItems(plannedActions.actions));
          return assistantText(plannedActions.message);
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
      createActionPlan,
      createNavigationTrace,
      providerStatus,
      recordTrace,
      routeContext,
      runAssistantTurn,
      threadId,
    ],
  );

  const runtime = useLocalRuntime(modelAdapter);

  const handlePreviewStatus = useCallback(
    (clientRequestId: string, status: "accepted" | "rejected") => {
      setPreviewItems((items) =>
        items.map((item) =>
          item.clientRequestId === clientRequestId ? { ...item, status } : item,
        ),
      );
    },
    [],
  );
  const handlePreviewAfterChange = useCallback(
    (clientRequestId: string, value: string) => {
      setPreviewItems((items) =>
        items.map((item) =>
          item.clientRequestId === clientRequestId
            ? { ...item, after: parsePreviewValue(value), status: "edited" }
            : item,
        ),
      );
    },
    [],
  );
  const handleCommitAccepted = useCallback(async () => {
    if (!routeContext.organizationId) {
      setCommitMessage("Join an organization before confirming assistant actions.");
      return;
    }
    if (!planId) {
      setCommitMessage("Ask the assistant to prepare a persisted action batch first.");
      return;
    }
    const acceptedItems = previewItems.filter((item) => item.status !== "rejected");
    const rejectedItems = previewItems.filter((item) => item.status === "rejected");
    const editedInputs: Record<string, Record<string, unknown>> = {};
    for (const item of acceptedItems) {
      if (item.status !== "edited") {
        continue;
      }
      if (!isRecord(item.after)) {
        setCommitMessage(
          `Fix ${item.entityLabel}: edited after value must be a JSON object.`,
        );
        return;
      }
      editedInputs[item.clientRequestId] = item.after;
    }
    const outcome = await commitActionPlan({
      acceptedClientRequestIds: acceptedItems.map((item) => item.clientRequestId),
      editedInputs,
      planId,
      rejectedClientRequestIds: rejectedItems.map((item) => item.clientRequestId),
      workosOrganizationId: routeContext.organizationId,
    });
    if (outcome?.ok) {
      setCommitMessage("Accepted assistant batch committed.");
      setPreviewItems((items) =>
        items.map((item) =>
          item.status === "rejected" ? item : { ...item, status: "accepted" },
        ),
      );
      return;
    }
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
            : item,
        ),
      );
    }
  }, [commitActionPlan, planId, previewItems, routeContext.organizationId]);

  useEffect(() => {
    if (!open) {
      return;
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onOpenChange(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onOpenChange, open]);

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      {open ? null : (
        <Button
          aria-label="Open DrawFlow AI assistant"
          className="fixed right-5 bottom-20 z-50 size-12 rounded-full shadow-lg"
          onClick={() => onOpenChange(true)}
          size="icon"
        >
          <Sparkles className="size-5" />
        </Button>
      )}
      {open ? (
        <section
          aria-label="DrawFlow AI assistant"
          aria-modal="false"
          className={cn(
            "fixed right-0 bottom-0 z-50 flex h-[100svh] w-full max-w-full flex-col border-l bg-background text-foreground shadow-2xl outline-none",
            "sm:right-4 sm:bottom-4 sm:h-[min(760px,calc(100svh-2rem))] sm:w-[480px] sm:rounded-xl sm:border",
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
              onClick={() => onOpenChange(false)}
              size="icon"
              variant="ghost"
            >
              <X className="size-4" />
            </Button>
          </div>

          <ThreadPrimitive.Root className="flex min-h-0 flex-1 flex-col">
            <ThreadPrimitive.Viewport className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4 py-4">
              <ThreadPrimitive.Empty>
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
                    </dl>
                  </FramePanel>
                </Frame>
              </ThreadPrimitive.Empty>
              <ThreadPrimitive.Messages>
                {({ message }) =>
                  message.role === "user" ? <UserMessage /> : <AssistantMessage />
                }
              </ThreadPrimitive.Messages>
              <AssistantPreviewBatch
                commitMessage={commitMessage}
                items={previewItems}
                onAfterChange={handlePreviewAfterChange}
                onCommitAccepted={handleCommitAccepted}
                onStatusChange={handlePreviewStatus}
              />
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
      ) : null}
    </AssistantRuntimeProvider>
  );
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

function AssistantPreviewBatch({
  commitMessage,
  items,
  onAfterChange,
  onCommitAccepted,
  onStatusChange,
}: {
  commitMessage?: string | null;
  items: PreviewItem[];
  onAfterChange: (clientRequestId: string, value: string) => void;
  onCommitAccepted: () => void;
  onStatusChange: (
    clientRequestId: string,
    status: "accepted" | "rejected",
  ) => void;
}) {
  const accepted = items.filter((item) => item.status !== "rejected").length;
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
                onClick={() => onStatusChange(item.clientRequestId, "accepted")}
                size="sm"
                variant={item.status === "accepted" ? "default" : "outline"}
              >
                <Check className="size-3.5" />
                Accept
              </Button>
              <Button
                onClick={() => onStatusChange(item.clientRequestId, "rejected")}
                size="sm"
                variant={item.status === "rejected" ? "destructive" : "outline"}
              >
                <X className="size-3.5" />
                Reject
              </Button>
            </div>
          </div>
        ))}
        <div className="flex items-center justify-between border-t pt-3 text-xs">
          <span className="text-muted-foreground">{accepted} accepted in batch</span>
          <Button onClick={onCommitAccepted} size="sm" variant="secondary">
            Confirm accepted batch
          </Button>
        </div>
        {commitMessage ? (
          <p data-testid="assistant-commit-message" className="text-xs">
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
        onChange={(event) => onChange(clientRequestId, event.currentTarget.value)}
        value={value === null || value === undefined ? "" : JSON.stringify(value)}
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

type PlannedAction = {
  actionKey: string;
  clientRequestId: string;
  input: Record<string, unknown>;
};

function buildClosedCatalogActions(
  prompt: string,
  routeContext: DrawFlowAssistantRouteContext,
):
  | { actions: PlannedAction[]; kind: "actions"; message: string }
  | { actions: []; kind: "none"; message?: never }
  | { kind: "clarify"; message: string } {
  const normalized = prompt.toLowerCase();
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
  routeContext: DrawFlowAssistantRouteContext,
) {
  const normalized = prompt.toLowerCase();
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
        : action.actionKey.includes("calendar") || action.actionKey.includes("reminder")
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
