"use client";

import {
  ArrowRight,
  Check,
  ClipboardList,
  HelpCircle,
  ListChecks,
  Table2,
} from "lucide-react";
import type { Dispatch, SetStateAction } from "react";
import { useMemo, useState } from "react";
import { Badge } from "#/components/ui/badge.tsx";
import { Button } from "#/components/ui/button.tsx";
import { Card, CardHeader, CardPanel, CardTitle } from "#/components/ui/card.tsx";
import {
  AssistantAutocompleteSelection,
  type AssistantSelectionOption,
} from "./AssistantAutocompleteSelection.tsx";

type AssistantGeneratedAction = {
  kind?: string;
  label: string;
  payload?: unknown;
  reason?: string;
  to?: string;
};

type AssistantWorkflowUiEventHandler = (event: {
  payload?: unknown;
  stepId: string;
  type: "choice" | "navigate" | "select" | "submit";
  workflowRunId: string;
}) => void;

export type AssistantGeneratedUiPart =
  | {
      stepId?: string;
      sections?: Array<{
        id?: string;
        items?: AssistantBriefingItem[];
        title: string;
      }>;
      summary?: Record<string, unknown>;
      title: string;
      type: "briefing";
      workflowRunId?: string;
    }
  | {
      questions: AssistantQuestion[];
      stepId?: string;
      title: string;
      type: "questionnaire";
      workflowRunId?: string;
    }
  | {
      columns: string[];
      rows: Array<{
        actions?: AssistantGeneratedAction[];
        id: string;
        values: unknown[];
      }>;
      stepId?: string;
      title: string;
      type: "reviewTable";
      workflowRunId?: string;
    }
  | {
      defaults?: Record<string, unknown>;
      fields: string[];
      formKind: "costItem";
      milestoneOptions?: Array<{ key: string; label?: string; name?: string }>;
      stepId?: string;
      target: {
        buildId?: string;
        kind: "activeBuild" | "proposal";
        proposalId?: string;
      };
      title: string;
      type: "structuredForm";
      workflowRunId?: string;
    }
  | {
      label: string;
      reason?: string;
      stepId?: string;
      to: string;
      type: "navigation";
      workflowRunId?: string;
    }
  | {
      emptyText?: string;
      placeholder?: string;
      selectorKind: "reminderTarget";
      stepId?: string;
      title: string;
      type: "selector";
      workflowRunId?: string;
    };

export type AssistantCostItemDraft = {
  costCents: number;
  description?: string;
  itemType: "equipment" | "material";
  milestoneKey: string;
  quantity: number;
  supplier?: string;
  target: {
    buildId?: string;
    kind: "activeBuild" | "proposal";
    proposalId?: string;
  };
  title: string;
  unit?: string;
};

type AssistantBriefingItem = {
  actions?: AssistantGeneratedAction[];
  detail?: string;
  href?: string;
  id: string;
  kind: string;
  priority: "critical" | "high" | "medium" | "low";
  source?: string;
  title: string;
};

type AssistantQuestion = 
  | string
  | {
      choices?: Array<{ label: string; value: string }>;
      id?: string;
      label: string;
    };

export function AssistantGenerativeUI({
  onNavigate,
  onSubmitCostItem,
  onWorkflowUiEvent,
  parts,
  selectionLoading,
  selectionOptions = [],
}: {
  onNavigate: (target: { label: string; reason?: string; to: string }) => void;
  onSubmitCostItem: (draft: AssistantCostItemDraft) => void;
  onWorkflowUiEvent?: AssistantWorkflowUiEventHandler;
  parts: AssistantGeneratedUiPart[];
  selectionLoading?: boolean;
  selectionOptions?: AssistantSelectionOption[];
}) {
  if (parts.length === 0) {
    return null;
  }
  return (
    <div className="space-y-3" data-testid="assistant-generative-ui">
      {parts.map((part, index) => {
        const key = `${part.type}:${index}`;
        if (part.type === "briefing") {
          return (
            <AssistantBriefing
              key={key}
              onNavigate={onNavigate}
              onWorkflowUiEvent={onWorkflowUiEvent}
              part={part}
            />
          );
        }
        if (part.type === "questionnaire") {
          return (
            <AssistantQuestionnaire
              key={key}
              onWorkflowUiEvent={onWorkflowUiEvent}
              part={part}
            />
          );
        }
        if (part.type === "reviewTable") {
          return (
            <AssistantReviewTable
              key={key}
              onNavigate={onNavigate}
              onWorkflowUiEvent={onWorkflowUiEvent}
              part={part}
            />
          );
        }
        if (part.type === "structuredForm") {
          return (
            <AssistantCostItemForm
              key={key}
              part={part}
              onWorkflowUiEvent={onWorkflowUiEvent}
              onSubmit={onSubmitCostItem}
            />
          );
        }
        if (part.type === "selector") {
          return (
            <AssistantSelector
              key={key}
              loading={selectionLoading}
              onWorkflowUiEvent={onWorkflowUiEvent}
              options={selectionOptions}
              part={part}
            />
          );
        }
        return (
          <AssistantNavigationCard
            key={key}
            onNavigate={onNavigate}
            onWorkflowUiEvent={onWorkflowUiEvent}
            part={part}
          />
        );
      })}
    </div>
  );
}

function AssistantBriefing({
  onNavigate,
  onWorkflowUiEvent,
  part,
}: {
  onNavigate: (target: { label: string; reason?: string; to: string }) => void;
  onWorkflowUiEvent?: AssistantWorkflowUiEventHandler;
  part: Extract<AssistantGeneratedUiPart, { type: "briefing" }>;
}) {
  const total =
    typeof part.summary?.total === "number"
      ? part.summary.total
      : (part.sections ?? []).reduce(
          (sum, section) => sum + (section.items?.length ?? 0),
          0
        );
  return (
    <Card data-testid="assistant-briefing">
      <CardHeader className="p-4 pb-3">
        <CardTitle className="flex items-center gap-2 text-sm">
          <ListChecks className="size-4" />
          {part.title}
          <Badge variant="outline">{total} items</Badge>
        </CardTitle>
      </CardHeader>
      <CardPanel className="space-y-4 p-4 pt-0">
        {(part.sections ?? []).length === 0 ? (
          <p className="text-muted-foreground text-sm">
            No urgent workflow items found.
          </p>
        ) : (
          (part.sections ?? []).map((section) => (
            <section className="space-y-2" key={section.id ?? section.title}>
              <h3 className="font-medium text-xs uppercase tracking-wide text-muted-foreground">
                {section.title}
              </h3>
              <div className="space-y-2">
                {(section.items ?? []).map((item) => (
                  <article
                    className="rounded-md border bg-background p-3"
                    key={item.id}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <p className="font-medium text-sm">{item.title}</p>
                      <PriorityBadge priority={item.priority} />
                    </div>
                    {item.detail ? (
                      <p className="mt-1 text-muted-foreground text-xs">
                        {item.detail}
                      </p>
                    ) : null}
                    {item.href ? (
                      <AssistantActionButton
                        action={{
                          label: "Open",
                          reason: item.detail,
                          to: item.href,
                        }}
                        className="mt-2"
                        onNavigate={onNavigate}
                        onWorkflowUiEvent={onWorkflowUiEvent}
                        partStepId={part.stepId}
                        workflowRunId={part.workflowRunId}
                      />
                    ) : null}
                    {(item.actions ?? []).length > 0 ? (
                      <div className="mt-2 flex flex-wrap gap-2">
                        {item.actions?.map((action) => (
                          <AssistantActionButton
                            action={action}
                            key={`${item.id}:${action.label}:${action.to ?? action.kind ?? "action"}`}
                            onNavigate={onNavigate}
                            onWorkflowUiEvent={onWorkflowUiEvent}
                            partStepId={part.stepId}
                            workflowRunId={part.workflowRunId}
                          />
                        ))}
                      </div>
                    ) : null}
                  </article>
                ))}
              </div>
            </section>
          ))
        )}
      </CardPanel>
    </Card>
  );
}

function AssistantQuestionnaire({
  onWorkflowUiEvent,
  part,
}: {
  onWorkflowUiEvent?: AssistantWorkflowUiEventHandler;
  part: Extract<AssistantGeneratedUiPart, { type: "questionnaire" }>;
}) {
  const [answers, setAnswers] = useState<Record<string, string>>({});
  return (
    <Card data-testid="assistant-questionnaire">
      <CardHeader className="p-4 pb-3">
        <CardTitle className="flex items-center gap-2 text-sm">
          <HelpCircle className="size-4" />
          {part.title}
        </CardTitle>
      </CardHeader>
      <CardPanel className="space-y-2 p-4 pt-0">
        {part.questions.map((question, index) => {
          const normalizedQuestion =
            typeof question === "string" ? { label: question } : question;
          const questionKey = normalizedQuestion.id ?? normalizedQuestion.label;
          return (
            <div className="rounded-md border bg-background p-3 text-sm" key={questionKey}>
              <div>
                <span className="mr-2 text-muted-foreground text-xs">
                  {index + 1}.
                </span>
                {normalizedQuestion.label}
              </div>
              {normalizedQuestion.choices?.length ? (
                <div className="mt-2 flex flex-wrap gap-2">
                  {normalizedQuestion.choices.map((choice) => {
                    const selected = answers[questionKey] === choice.value;
                    return (
                      <Button
                        aria-pressed={selected}
                        key={choice.value}
                        onClick={() =>
                          {
                            setAnswers((current) => ({
                              ...current,
                              [questionKey]: choice.value,
                            }));
                            if (part.workflowRunId && part.stepId) {
                              onWorkflowUiEvent?.({
                                payload: {
                                  choice,
                                  question: normalizedQuestion,
                                },
                                stepId: part.stepId,
                                type: "choice",
                                workflowRunId: part.workflowRunId,
                              });
                            }
                          }
                        }
                        size="sm"
                        type="button"
                        variant={selected ? "default" : "outline"}
                      >
                        {selected ? <Check className="size-3.5" /> : null}
                        {choice.label}
                      </Button>
                    );
                  })}
                </div>
              ) : null}
            </div>
          );
        })}
      </CardPanel>
    </Card>
  );
}

function AssistantReviewTable({
  onNavigate,
  onWorkflowUiEvent,
  part,
}: {
  onNavigate: (target: { label: string; reason?: string; to: string }) => void;
  onWorkflowUiEvent?: AssistantWorkflowUiEventHandler;
  part: Extract<AssistantGeneratedUiPart, { type: "reviewTable" }>;
}) {
  const hasActions = part.rows.some((row) => (row.actions ?? []).length > 0);
  return (
    <Card data-testid="assistant-review-table">
      <CardHeader className="p-4 pb-3">
        <CardTitle className="flex items-center gap-2 text-sm">
          <Table2 className="size-4" />
          {part.title}
        </CardTitle>
      </CardHeader>
      <CardPanel className="p-4 pt-0">
        <div className="overflow-x-auto">
          <table className="w-full min-w-96 text-left text-xs">
            <thead className="text-muted-foreground">
              <tr>
                {part.columns.map((column) => (
                  <th className="border-b py-2 pr-3 font-medium" key={column}>
                    {column}
                  </th>
                ))}
                {hasActions ? (
                  <th className="border-b py-2 pr-3 font-medium">Action</th>
                ) : null}
              </tr>
            </thead>
            <tbody>
              {part.rows.map((row) => (
                <tr key={row.id}>
                  {row.values.map((value, index) => (
                    <td className="border-b py-2 pr-3" key={`${row.id}:${index}`}>
                      {String(value ?? "")}
                    </td>
                  ))}
                  {hasActions ? (
                    <td className="border-b py-2 pr-3">
                      <div className="flex flex-wrap gap-2">
                        {(row.actions ?? []).map((action) => (
                          <AssistantActionButton
                            action={action}
                            key={`${row.id}:${action.label}:${action.to ?? action.kind ?? "action"}`}
                            onNavigate={onNavigate}
                            onWorkflowUiEvent={onWorkflowUiEvent}
                            partStepId={part.stepId}
                            workflowRunId={part.workflowRunId}
                          />
                        ))}
                      </div>
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardPanel>
    </Card>
  );
}

function AssistantCostItemForm({
  onWorkflowUiEvent,
  onSubmit,
  part,
}: {
  onWorkflowUiEvent?: AssistantWorkflowUiEventHandler;
  onSubmit: (draft: AssistantCostItemDraft) => void;
  part: Extract<AssistantGeneratedUiPart, { type: "structuredForm" }>;
}) {
  const defaults = part.defaults ?? {};
  const milestoneOptions = part.milestoneOptions ?? [];
  const [values, setValues] = useState<Record<string, string>>(() => ({
    costCents: stringValue(defaults.costCents),
    description: stringValue(defaults.description),
    itemType: stringValue(defaults.itemType) || "material",
    milestoneKey:
      stringValue(defaults.milestoneKey) || milestoneOptions[0]?.key || "",
    quantity: stringValue(defaults.quantity) || "1",
    supplier: stringValue(defaults.supplier),
    title: stringValue(defaults.title),
    unit: stringValue(defaults.unit),
  }));
  const valid = useMemo(
    () =>
      values.milestoneKey.trim().length > 0 &&
      values.title.trim().length > 0 &&
      Number(values.costCents) > 0 &&
      Number(values.quantity) > 0,
    [values]
  );
  return (
    <Card data-testid="assistant-structured-form">
      <CardHeader className="p-4 pb-3">
        <CardTitle className="flex items-center gap-2 text-sm">
          <ClipboardList className="size-4" />
          {part.title}
        </CardTitle>
      </CardHeader>
      <CardPanel className="space-y-3 p-4 pt-0">
        <div className="grid gap-3">
          {milestoneOptions.length > 0 ? (
            <label className="grid gap-1 text-xs">
              <span className="text-muted-foreground">Milestone</span>
              <select
                className="rounded-md border bg-background px-2 py-2 text-sm"
                data-testid="assistant-cost-item-milestone-select"
                onChange={(event) =>
                  setValues((current) => ({
                    ...current,
                    milestoneKey: event.currentTarget.value,
                  }))
                }
                value={values.milestoneKey}
              >
                {milestoneOptions.map((option) => (
                  <option key={option.key} value={option.key}>
                    {option.label ?? option.name ?? option.key}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <AssistantTextInput
              label="Milestone key"
              name="milestoneKey"
              onChange={setValues}
              value={values.milestoneKey}
            />
          )}
          <AssistantTextInput
            label="Title"
            name="title"
            onChange={setValues}
            value={values.title}
          />
          <label className="grid gap-1 text-xs">
            <span className="text-muted-foreground">Type</span>
            <select
              className="rounded-md border bg-background px-2 py-2 text-sm"
              onChange={(event) =>
                setValues((current) => ({
                  ...current,
                  itemType: event.currentTarget.value,
                }))
              }
              value={values.itemType}
            >
              <option value="material">Material</option>
              <option value="equipment">Equipment</option>
            </select>
          </label>
          <div className="grid grid-cols-2 gap-3">
            <AssistantTextInput
              label="Quantity"
              name="quantity"
              onChange={setValues}
              type="number"
              value={values.quantity}
            />
            <AssistantTextInput
              label="Unit"
              name="unit"
              onChange={setValues}
              value={values.unit}
            />
          </div>
          <div className="grid grid-cols-1 gap-3">
            <AssistantTextInput
              label="Unit cost, cents"
              name="costCents"
              onChange={setValues}
              type="number"
              value={values.costCents}
            />
          </div>
          <AssistantTextInput
            label="Supplier"
            name="supplier"
            onChange={setValues}
            value={values.supplier}
          />
          <label className="grid gap-1 text-xs">
            <span className="text-muted-foreground">Description</span>
            <textarea
              className="min-h-20 rounded-md border bg-background px-2 py-2 text-sm"
              onChange={(event) =>
                setValues((current) => ({
                  ...current,
                  description: event.currentTarget.value,
                }))
              }
              value={values.description}
            />
          </label>
        </div>
        <Button
          disabled={!valid}
          onClick={() => {
            const draft = {
              costCents: Math.round(Number(values.costCents)),
              description: values.description.trim() || undefined,
              itemType:
                values.itemType === "equipment" ? "equipment" : "material",
              milestoneKey: values.milestoneKey.trim(),
              quantity: Math.max(1, Math.round(Number(values.quantity))),
              supplier: values.supplier.trim() || undefined,
              target: part.target,
              title: values.title.trim(),
              unit: values.unit.trim() || undefined,
            } satisfies AssistantCostItemDraft;
            if (part.workflowRunId && part.stepId) {
              onWorkflowUiEvent?.({
                payload: draft,
                stepId: part.stepId,
                type: "submit",
                workflowRunId: part.workflowRunId,
              });
              return;
            }
            onSubmit(draft);
          }}
          size="sm"
        >
          Prepare HITL batch
        </Button>
      </CardPanel>
    </Card>
  );
}

function AssistantNavigationCard({
  onNavigate,
  onWorkflowUiEvent,
  part,
}: {
  onNavigate: (target: { label: string; reason?: string; to: string }) => void;
  onWorkflowUiEvent?: AssistantWorkflowUiEventHandler;
  part: Extract<AssistantGeneratedUiPart, { type: "navigation" }>;
}) {
  return (
    <Card data-testid="assistant-navigation-card">
      <CardPanel className="flex items-start justify-between gap-3 p-4">
        <div className="min-w-0">
          <p className="font-medium text-sm">{part.label}</p>
          {part.reason ? (
            <p className="mt-1 text-muted-foreground text-xs">{part.reason}</p>
          ) : null}
        </div>
        <Button
          onClick={() => {
            if (part.workflowRunId && part.stepId) {
              onWorkflowUiEvent?.({
                payload: part,
                stepId: part.stepId,
                type: "navigate",
                workflowRunId: part.workflowRunId,
              });
            }
            onNavigate(part);
          }}
          size="sm"
          type="button"
          variant="secondary"
        >
          Open
          <ArrowRight className="size-3.5" />
        </Button>
      </CardPanel>
    </Card>
  );
}

function AssistantSelector({
  loading,
  onWorkflowUiEvent,
  options,
  part,
}: {
  loading?: boolean;
  onWorkflowUiEvent?: AssistantWorkflowUiEventHandler;
  options: AssistantSelectionOption[];
  part: Extract<AssistantGeneratedUiPart, { type: "selector" }>;
}) {
  return (
    <AssistantAutocompleteSelection
      emptyText={part.emptyText}
      loading={loading}
      onSelect={(option) => {
        if (!part.workflowRunId || !part.stepId) {
          return;
        }
        onWorkflowUiEvent?.({
          payload: {
            option,
            selectorKind: part.selectorKind,
          },
          stepId: part.stepId,
          type: "select",
          workflowRunId: part.workflowRunId,
        });
      }}
      options={options}
      placeholder={part.placeholder}
      title={part.title}
    />
  );
}

function AssistantActionButton({
  action,
  className,
  onNavigate,
  onWorkflowUiEvent,
  partStepId,
  workflowRunId,
}: {
  action: AssistantGeneratedAction;
  className?: string;
  onNavigate: (target: { label: string; reason?: string; to: string }) => void;
  onWorkflowUiEvent?: AssistantWorkflowUiEventHandler;
  partStepId?: string;
  workflowRunId?: string;
}) {
  return (
    <Button
      className={className}
      onClick={() => {
        if (workflowRunId && partStepId) {
          onWorkflowUiEvent?.({
            payload: action,
            stepId: partStepId,
            type: action.to ? "navigate" : "choice",
            workflowRunId,
          });
        }
        if (action.to) {
          onNavigate({
            label: action.label,
            reason: action.reason,
            to: action.to,
          });
        }
      }}
      size="sm"
      type="button"
      variant="secondary"
    >
      {action.label}
      {action.to ? <ArrowRight className="size-3.5" /> : null}
    </Button>
  );
}

function AssistantTextInput({
  label,
  name,
  onChange,
  type = "text",
  value,
}: {
  label: string;
  name: string;
  onChange: Dispatch<SetStateAction<Record<string, string>>>;
  type?: "number" | "text";
  value: string;
}) {
  return (
    <label className="grid gap-1 text-xs">
      <span className="text-muted-foreground">{label}</span>
      <input
        className="rounded-md border bg-background px-2 py-2 text-sm"
        onChange={(event) =>
          onChange((current) => ({
            ...current,
            [name]: event.currentTarget.value,
          }))
        }
        type={type}
        value={value}
      />
    </label>
  );
}

function PriorityBadge({
  priority,
}: {
  priority: AssistantBriefingItem["priority"];
}) {
  const variant = priority === "critical" ? "destructive" : "outline";
  return <Badge variant={variant}>{priority}</Badge>;
}

function stringValue(value: unknown) {
  return value === null || value === undefined ? "" : String(value);
}
