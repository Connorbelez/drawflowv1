"use client";

import { Check, GitPullRequestArrow, X } from "lucide-react";
import { MessagePartPrimitive, MessagePrimitive } from "@assistant-ui/react";
import { Button } from "#/components/ui/button.tsx";
import {
  Card,
  CardHeader,
  CardPanel,
  CardTitle,
} from "#/components/ui/card.tsx";
import { cn } from "#/lib/utils.ts";
import type {
  AssistantCommitState,
  PreviewItem,
} from "./drawflow-assistant-contracts.ts";
import { workflowRepairAction } from "./assistant-workflow-runner.ts";
import type {
  AssistantWorkflowRun,
  AssistantWorkflowStep,
} from "./assistantWorkflow.ts";

export function UserMessage() {
  return (
    <MessagePrimitive.Root className="flex justify-end">
      <div className="max-w-[82%] rounded-lg bg-primary px-3 py-2 text-primary-foreground text-sm">
        <MessagePrimitive.Content />
      </div>
    </MessagePrimitive.Root>
  );
}

export function AssistantMessage() {
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

export function AssistantWorkflowStatus({
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

export function AssistantPreviewBatch({
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
            commitState === "failed"
              ? "text-destructive"
              : "text-muted-foreground"
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
