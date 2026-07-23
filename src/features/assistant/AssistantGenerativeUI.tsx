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
import {
  Card,
  CardHeader,
  CardPanel,
  CardTitle,
} from "#/components/ui/card.tsx";
import {
  AssistantAutocompleteSelection,
  type AssistantSelectionOption,
} from "./AssistantAutocompleteSelection.tsx";

type AssistantGeneratedAction = {
  id?: string;
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

export function normalizeAssistantGeneratedUiParts(
  value: unknown
): AssistantGeneratedUiPart[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.flatMap((candidate, partIndex) => {
    const part = normalizeAssistantGeneratedUiPart(candidate, partIndex);
    return part ? [part] : [];
  });
}

function normalizeAssistantGeneratedUiPart(
  candidate: unknown,
  partIndex: number
): AssistantGeneratedUiPart | null {
  if (!isGeneratedUiRecord(candidate)) {
    return null;
  }
  switch (candidate.type) {
    case "briefing":
      return normalizeBriefingPart(candidate, partIndex);
    case "navigation":
      return normalizeNavigationPart(candidate);
    case "questionnaire":
      return normalizeQuestionnairePart(candidate, partIndex);
    case "reviewTable":
      return normalizeReviewTablePart(candidate, partIndex);
    case "selector":
      return normalizeSelectorPart(candidate);
    case "structuredForm":
      return normalizeStructuredFormPart(candidate);
    default:
      return null;
  }
}

function normalizeBriefingPart(
  candidate: Record<string, unknown>,
  partIndex: number
): Extract<AssistantGeneratedUiPart, { type: "briefing" }> {
  const sectionIds = new Map<string, number>();
  const sections = Array.isArray(candidate.sections)
    ? candidate.sections.flatMap((rawSection, sectionIndex) => {
        if (!isGeneratedUiRecord(rawSection)) {
          return [];
        }
        const title =
          generatedUiString(rawSection.title) ?? `Section ${sectionIndex + 1}`;
        const sectionId = uniqueGeneratedUiId(
          generatedUiString(rawSection.id),
          `briefing:${partIndex}:section:${sectionIndex}`,
          sectionIds
        );
        return [
          {
            id: sectionId,
            items: normalizeBriefingItems(rawSection.items, sectionId),
            title,
          },
        ];
      })
    : [];
  return {
    ...generatedUiWorkflowFields(candidate),
    sections,
    summary: isGeneratedUiRecord(candidate.summary)
      ? candidate.summary
      : undefined,
    title: generatedUiString(candidate.title) ?? "Operational briefing",
    type: "briefing",
  };
}

function normalizeBriefingItems(value: unknown, sectionId: string) {
  if (!Array.isArray(value)) {
    return [];
  }
  const itemIds = new Map<string, number>();
  return value.flatMap((rawItem, itemIndex) => {
    if (!isGeneratedUiRecord(rawItem)) {
      return [];
    }
    const title = generatedUiString(rawItem.title) ?? "Task";
    const kind = generatedUiString(rawItem.kind) ?? "task";
    return [
      {
        actions: normalizeGeneratedUiActions(rawItem.actions),
        detail: generatedUiString(rawItem.detail),
        href: generatedUiString(rawItem.href),
        id: uniqueGeneratedUiId(
          generatedUiString(rawItem.id),
          `${sectionId}:item:${itemIndex}:${kind}:${title}`,
          itemIds
        ),
        kind,
        priority: generatedUiPriority(rawItem.priority),
        source: generatedUiString(rawItem.source),
        title,
      },
    ];
  });
}

function normalizeNavigationPart(
  candidate: Record<string, unknown>
): Extract<AssistantGeneratedUiPart, { type: "navigation" }> | null {
  const to = generatedUiString(candidate.to);
  if (!to) {
    return null;
  }
  return {
    ...generatedUiWorkflowFields(candidate),
    label: generatedUiString(candidate.label) ?? to,
    reason: generatedUiString(candidate.reason),
    to,
    type: "navigation",
  };
}

function normalizeQuestionnairePart(
  candidate: Record<string, unknown>,
  partIndex: number
): Extract<AssistantGeneratedUiPart, { type: "questionnaire" }> {
  const questionIds = new Map<string, number>();
  const questions = Array.isArray(candidate.questions)
    ? candidate.questions.flatMap((question, questionIndex) => {
        if (typeof question === "string" && question.trim()) {
          const label = question.trim();
          return [
            {
              id: uniqueGeneratedUiId(
                undefined,
                `questionnaire:${partIndex}:question:${questionIndex}:${label}`,
                questionIds
              ),
              label,
            },
          ];
        }
        if (!isGeneratedUiRecord(question)) {
          return [];
        }
        const label = generatedUiString(question.label);
        if (!label) {
          return [];
        }
        return [
          {
            choices: normalizeGeneratedUiChoices(question.choices),
            id: uniqueGeneratedUiId(
              generatedUiString(question.id),
              `questionnaire:${partIndex}:question:${questionIndex}:${label}`,
              questionIds
            ),
            label,
          },
        ];
      })
    : [];
  return {
    ...generatedUiWorkflowFields(candidate),
    questions,
    title: generatedUiString(candidate.title) ?? "Quick details",
    type: "questionnaire",
  };
}

function normalizeGeneratedUiChoices(value: unknown) {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const seen = new Set<string>();
  return value.flatMap((choice) => {
    if (!isGeneratedUiRecord(choice)) {
      return [];
    }
    const label = generatedUiString(choice.label);
    const choiceValue = generatedUiString(choice.value);
    const key = `${choiceValue}:${label}`;
    if (!(label && choiceValue) || seen.has(key)) {
      return [];
    }
    seen.add(key);
    return [{ label, value: choiceValue }];
  });
}

function normalizeReviewTablePart(
  candidate: Record<string, unknown>,
  partIndex: number
): Extract<AssistantGeneratedUiPart, { type: "reviewTable" }> {
  const rowIds = new Map<string, number>();
  const rows = Array.isArray(candidate.rows)
    ? candidate.rows.flatMap((rawRow, rowIndex) => {
        if (!isGeneratedUiRecord(rawRow)) {
          return [];
        }
        return [
          {
            actions: normalizeGeneratedUiActions(rawRow.actions),
            id: uniqueGeneratedUiId(
              generatedUiString(rawRow.id),
              `review-table:${partIndex}:row:${rowIndex}`,
              rowIds
            ),
            values: Array.isArray(rawRow.values) ? rawRow.values : [],
          },
        ];
      })
    : [];
  return {
    ...generatedUiWorkflowFields(candidate),
    columns: generatedUiStringArray(candidate.columns),
    rows,
    title: generatedUiString(candidate.title) ?? "Review",
    type: "reviewTable",
  };
}

function normalizeSelectorPart(
  candidate: Record<string, unknown>
): Extract<AssistantGeneratedUiPart, { type: "selector" }> | null {
  if (candidate.selectorKind !== "reminderTarget") {
    return null;
  }
  return {
    ...generatedUiWorkflowFields(candidate),
    emptyText: generatedUiString(candidate.emptyText),
    placeholder: generatedUiString(candidate.placeholder),
    selectorKind: "reminderTarget",
    title: generatedUiString(candidate.title) ?? "Choose a target",
    type: "selector",
  };
}

function normalizeStructuredFormPart(
  candidate: Record<string, unknown>
): Extract<AssistantGeneratedUiPart, { type: "structuredForm" }> | null {
  if (
    candidate.formKind !== "costItem" ||
    !isGeneratedUiRecord(candidate.target) ||
    (candidate.target.kind !== "activeBuild" &&
      candidate.target.kind !== "proposal")
  ) {
    return null;
  }
  return {
    ...generatedUiWorkflowFields(candidate),
    defaults: isGeneratedUiRecord(candidate.defaults)
      ? candidate.defaults
      : undefined,
    fields: generatedUiStringArray(candidate.fields),
    formKind: "costItem",
    milestoneOptions: normalizeMilestoneOptions(candidate.milestoneOptions),
    target: {
      buildId: generatedUiString(candidate.target.buildId),
      kind: candidate.target.kind,
      proposalId: generatedUiString(candidate.target.proposalId),
    },
    title: generatedUiString(candidate.title) ?? "Cost item",
    type: "structuredForm",
  };
}

function normalizeMilestoneOptions(value: unknown) {
  if (!Array.isArray(value)) {
    return undefined;
  }
  return value.flatMap((option) => {
    if (!isGeneratedUiRecord(option)) {
      return [];
    }
    const key = generatedUiString(option.key);
    return key
      ? [
          {
            key,
            label: generatedUiString(option.label),
            name: generatedUiString(option.name),
          },
        ]
      : [];
  });
}

function generatedUiWorkflowFields(value: Record<string, unknown>) {
  return {
    stepId: generatedUiString(value.stepId),
    workflowRunId: generatedUiString(value.workflowRunId),
  };
}

function normalizeGeneratedUiActions(
  value: unknown
): AssistantGeneratedAction[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const actionIds = new Map<string, number>();
  return value.flatMap((candidate, actionIndex) => {
    if (!isGeneratedUiRecord(candidate)) {
      return [];
    }
    const label = generatedUiString(candidate.label);
    const kind = generatedUiString(candidate.kind);
    const reason = generatedUiString(candidate.reason);
    const to = generatedUiString(candidate.to);
    if (!label) {
      return [];
    }
    return [
      {
        id: uniqueGeneratedUiId(
          generatedUiString(candidate.id),
          `action:${actionIndex}:${label}:${to ?? kind ?? "action"}`,
          actionIds
        ),
        kind,
        label,
        payload: candidate.payload,
        reason,
        to,
      },
    ];
  });
}

function generatedUiPriority(
  value: unknown
): AssistantBriefingItem["priority"] {
  return value === "critical" ||
    value === "high" ||
    value === "medium" ||
    value === "low"
    ? value
    : "medium";
}

function generatedUiString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function generatedUiStringArray(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.flatMap((candidate) => {
    const normalized = generatedUiString(candidate);
    return normalized ? [normalized] : [];
  });
}

function uniqueGeneratedUiId(
  value: string | undefined,
  fallback: string,
  seen: Map<string, number>
) {
  const candidate = value ?? fallback;
  const occurrence = seen.get(candidate) ?? 0;
  seen.set(candidate, occurrence + 1);
  return occurrence === 0 ? candidate : `${candidate}:${occurrence}`;
}

function isGeneratedUiRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

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
  const normalizedParts = useMemo(
    () => normalizeAssistantGeneratedUiParts(parts),
    [parts]
  );
  if (normalizedParts.length === 0) {
    return null;
  }
  return (
    <div className="space-y-3" data-testid="assistant-generative-ui">
      {normalizedParts.map((part, index) => {
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
                            key={action.id}
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
            <div
              className="rounded-md border bg-background p-3 text-sm"
              key={questionKey}
            >
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
                        key={`${choice.value}:${choice.label}`}
                        onClick={() => {
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
                        }}
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
  const columns = Array.isArray(part.columns) ? part.columns : [];
  const rows = Array.isArray(part.rows) ? part.rows : [];
  const columnIds = new Map<string, number>();
  const keyedColumns = columns.map((column) => ({
    id: uniqueGeneratedUiId(column, column, columnIds),
    label: column,
  }));
  const hasActions = rows.some((row) => (row.actions ?? []).length > 0);
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
                {keyedColumns.map((column) => (
                  <th
                    className="border-b py-2 pr-3 font-medium"
                    key={column.id}
                  >
                    {column.label}
                  </th>
                ))}
                {hasActions ? (
                  <th className="border-b py-2 pr-3 font-medium">Action</th>
                ) : null}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  {(Array.isArray(row.values) ? row.values : []).map(
                    (value, index) => (
                      <td
                        className="border-b py-2 pr-3"
                        key={`${row.id}:${index}`}
                      >
                        {String(value ?? "")}
                      </td>
                    )
                  )}
                  {hasActions ? (
                    <td className="border-b py-2 pr-3">
                      <div className="flex flex-wrap gap-2">
                        {(row.actions ?? []).map((action) => (
                          <AssistantActionButton
                            action={action}
                            key={action.id}
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
