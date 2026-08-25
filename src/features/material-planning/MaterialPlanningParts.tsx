"use client";

import { Pencil, Plus, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import {
  FieldRichTextEditor,
  FieldRichTextPreview,
} from "#/components/rich-text/field-rich-text.tsx";
import { Badge } from "#/components/ui/badge.tsx";
import { Button } from "#/components/ui/button.tsx";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "#/components/ui/card.tsx";
import { Checkbox } from "#/components/ui/checkbox.tsx";
import { Frame, FramePanel } from "#/components/ui/frame.tsx";
import { Input } from "#/components/ui/input.tsx";
import { Label } from "#/components/ui/label.tsx";
import {
  NativeSelect,
  NativeSelectOption,
} from "#/components/ui/native-select.tsx";
import { cn } from "#/lib/utils.ts";
import {
  budgetTreatmentDescription,
  budgetTreatmentLabel,
  calculateDrawAvailability,
  costDollarsValid,
  dollarsInputToCents,
  fieldId,
  formatCents,
  formatQuantity,
  formToPayload,
  itemToFormState,
  materialSubmitGuidance,
  normalizeBudgetTreatment,
  numberFromInput,
  optionalText,
  quantityPositive,
  totalForItem,
} from "./MaterialPlanningModel.ts";
import type {
  MaterialPlanningBudgetImpact,
  MaterialPlanningBudgetTreatment,
  MaterialPlanningItem,
  MaterialPlanningItemType,
  MaterialPlanningMilestone,
  MaterialPlanningPayload,
  MaterialPlanningSubmilestone,
} from "./MaterialPlanningTab.tsx";

export const TOUCH_BUTTON_CLASS = "max-sm:h-11";
export const TOUCH_INPUT_CLASS =
  "max-sm:h-11 max-sm:[&_[data-slot=input]]:h-11 max-sm:[&_[data-slot=input]]:leading-[2.75rem]";
export const TOUCH_SELECT_CLASS =
  "max-sm:h-11 max-sm:[&_[data-slot=native-select]]:h-11";

export function MaterialItemEditor({
  budgetImpact,
  budgetTreatmentEnabled,
  chrome = "frame",
  currencyCode,
  defaultBudgetSubmilestoneKey,
  defaultBudgetTreatment,
  item,
  items,
  lockBudgetTreatment = false,
  milestones,
  onCancel,
  onSubmit,
  pending,
  selectedMilestoneKey,
  showChangeReason,
  submitLabel,
}: {
  budgetImpact?: MaterialPlanningBudgetImpact;
  budgetTreatmentEnabled: boolean;
  chrome?: "frame" | "plain";
  currencyCode: "CAD" | "USD";
  defaultBudgetSubmilestoneKey?: string;
  defaultBudgetTreatment: MaterialPlanningBudgetTreatment;
  item?: MaterialPlanningItem;
  items: MaterialPlanningItem[];
  lockBudgetTreatment?: boolean;
  milestones: MaterialPlanningMilestone[];
  onCancel?: () => void;
  onSubmit: (payload: MaterialPlanningPayload) => Promise<unknown> | unknown;
  pending?: boolean;
  selectedMilestoneKey?: string;
  showChangeReason: boolean;
  submitLabel: string;
}) {
  const [form, setForm] = useState<ItemFormState>(() =>
    itemToFormState(
      item,
      selectedMilestoneKey ?? milestones[0]?.key ?? "",
      defaultBudgetSubmilestoneKey,
      budgetTreatmentEnabled ? defaultBudgetTreatment : "add"
    )
  );
  const selectedMilestone =
    milestones.find((milestone) => milestone.key === form.milestoneKey) ??
    milestones[0];
  const selectedBudgetSubmilestone = selectedMilestone?.submilestones?.find(
    (submilestone) => submilestone.key === form.budgetSubmilestoneKey
  );
  const costEntered = form.costCents.trim().length > 0;
  const quantityEntered = form.quantity.trim().length > 0;
  const costInvalid = costEntered && !costDollarsValid(form.costCents);
  const quantityInvalid = quantityEntered && !quantityPositive(form.quantity);
  const budgetTargetRequired =
    budgetTreatmentEnabled && form.budgetTreatment !== "logOnly";
  const budgetTargetMissing =
    budgetTargetRequired && !selectedBudgetSubmilestone;
  const draftItemTotalCents = Math.round(
    dollarsInputToCents(form.costCents) * numberFromInput(form.quantity, 0)
  );
  const existingItemTotalCents = item ? totalForItem(item) : 0;
  const existingBudgetEffectCents =
    normalizeBudgetTreatment(item?.budgetTreatment) === "add"
      ? existingItemTotalCents
      : 0;
  const draftBudgetEffectCents =
    form.budgetTreatment === "add" ? draftItemTotalCents : 0;
  const sameBudgetTarget =
    item?.milestoneKey === selectedMilestone?.key &&
    (item?.budgetSubmilestoneKey ?? "") === form.budgetSubmilestoneKey;
  const proposalBudgetDeltaCents =
    draftBudgetEffectCents - existingBudgetEffectCents;
  const selectedMilestoneBudgetDeltaCents =
    draftBudgetEffectCents -
    (item?.milestoneKey === selectedMilestone?.key
      ? existingBudgetEffectCents
      : 0);
  const budgetTargetBeforeCents = selectedBudgetSubmilestone
    ? (selectedBudgetSubmilestone.budgetCents ??
      selectedMilestone?.budgetCents ??
      0)
    : (selectedMilestone?.budgetCents ?? 0);
  const budgetTargetAfterCents = Math.max(
    0,
    budgetTargetBeforeCents +
      draftBudgetEffectCents -
      (sameBudgetTarget ? existingBudgetEffectCents : 0)
  );
  const maintainedBeforeCents = items.reduce((total, candidate) => {
    if (
      candidate._id === item?._id ||
      normalizeBudgetTreatment(candidate.budgetTreatment) !== "maintain" ||
      candidate.milestoneKey !== selectedMilestone?.key ||
      candidate.budgetSubmilestoneKey !== form.budgetSubmilestoneKey
    ) {
      return total;
    }
    return total + totalForItem(candidate);
  }, 0);
  const maintainedAfterCents =
    maintainedBeforeCents +
    (form.budgetTreatment === "maintain" ? draftItemTotalCents : 0);
  const maintainedRemainingCents =
    budgetTargetAfterCents - maintainedAfterCents;
  const maintainOverBudget =
    form.budgetTreatment === "maintain" && maintainedRemainingCents < 0;
  const canSubmit = Boolean(
    form.title.trim() &&
      form.milestoneKey &&
      !costInvalid &&
      quantityPositive(form.quantity) &&
      !budgetTargetMissing &&
      !maintainOverBudget &&
      !pending
  );
  const submitGuidance = materialSubmitGuidance({
    costInvalid,
    budgetTargetMissing,
    maintainOverBudget,
    milestoneEntered: form.milestoneKey.length > 0,
    pending: Boolean(pending),
    quantityEntered,
    quantityInvalid,
    submitLabel,
    titleEntered: form.title.trim().length > 0,
  });
  const proposalBudgetAfterCents = budgetImpact
    ? Math.max(0, budgetImpact.proposalBudgetCents + proposalBudgetDeltaCents)
    : 0;

  useEffect(() => {
    setForm(
      itemToFormState(
        item,
        selectedMilestoneKey ?? milestones[0]?.key ?? "",
        defaultBudgetSubmilestoneKey,
        budgetTreatmentEnabled ? defaultBudgetTreatment : "add"
      )
    );
  }, [
    defaultBudgetSubmilestoneKey,
    defaultBudgetTreatment,
    budgetTreatmentEnabled,
    item,
    milestones,
    selectedMilestoneKey,
  ]);

  function setField<Key extends keyof ItemFormState>(
    key: Key,
    value: ItemFormState[Key]
  ) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function toggleSubmilestone(key: string, checked: boolean) {
    setForm((current) => ({
      ...current,
      relevantSubmilestoneKeys: checked
        ? [...new Set([...current.relevantSubmilestoneKeys, key])]
        : current.relevantSubmilestoneKeys.filter((itemKey) => itemKey !== key),
    }));
  }

  const formContent = (
    <>
      {chrome === "frame" ? (
        <div>
          <h3 className="font-semibold text-sm">
            {item ? "Edit cost item" : "Add cost item"}
          </h3>
          <p className="mt-1 text-muted-foreground text-xs">
            Enter the per-unit dollar amount. Quantity controls the total.
          </p>
        </div>
      ) : null}

      <div className="grid gap-3">
        <div className="grid gap-2">
          <Label htmlFor={fieldId(item, "title")}>Title</Label>
          <Input
            className={TOUCH_INPUT_CLASS}
            id={fieldId(item, "title")}
            onChange={(event) => setField("title", event.target.value)}
            value={form.title}
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor={fieldId(item, "description")}>Description</Label>
          <FieldRichTextEditor
            ariaLabel="Description"
            id={fieldId(item, "description")}
            onChange={(value) => setField("description", value)}
            placeholder="Scope notes, supplier terms, or image references..."
            value={form.description}
          />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="grid gap-2">
            <Label htmlFor={fieldId(item, "itemType")}>Type</Label>
            <NativeSelect
              className={cn("w-full", TOUCH_SELECT_CLASS)}
              id={fieldId(item, "itemType")}
              onChange={(event) =>
                setField(
                  "itemType",
                  event.target.value as MaterialPlanningItemType
                )
              }
              value={form.itemType}
            >
              <NativeSelectOption value="material">Material</NativeSelectOption>
              <NativeSelectOption value="equipment">
                Equipment
              </NativeSelectOption>
            </NativeSelect>
          </div>
          <div className="grid gap-2">
            <Label htmlFor={fieldId(item, "milestoneKey")}>Milestone</Label>
            <NativeSelect
              className={cn("w-full", TOUCH_SELECT_CLASS)}
              id={fieldId(item, "milestoneKey")}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  budgetSubmilestoneKey: "",
                  milestoneKey: event.target.value,
                  relevantSubmilestoneKeys: [],
                }))
              }
              value={form.milestoneKey}
            >
              {milestones.map((milestone) => (
                <NativeSelectOption key={milestone.key} value={milestone.key}>
                  {milestone.name}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </div>
        </div>
        {budgetTreatmentEnabled ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor={fieldId(item, "budgetTreatment")}>
                Budget treatment
              </Label>
              <NativeSelect
                className={cn("w-full", TOUCH_SELECT_CLASS)}
                disabled={lockBudgetTreatment}
                id={fieldId(item, "budgetTreatment")}
                onChange={(event) => {
                  const budgetTreatment = event.target
                    .value as MaterialPlanningBudgetTreatment;
                  setForm((current) => ({
                    ...current,
                    budgetSubmilestoneKey:
                      budgetTreatment === "logOnly"
                        ? ""
                        : current.budgetSubmilestoneKey,
                    budgetTreatment,
                  }));
                }}
                value={form.budgetTreatment}
              >
                <NativeSelectOption value="logOnly">
                  Log only
                </NativeSelectOption>
                <NativeSelectOption value="add">
                  Add to sub-milestone
                </NativeSelectOption>
                <NativeSelectOption value="maintain">
                  Maintain sub-milestone total
                </NativeSelectOption>
              </NativeSelect>
              <p className="text-muted-foreground text-xs">
                {lockBudgetTreatment
                  ? "Budget treatment is locked after proposal closing. Cost and quantity remain editable."
                  : budgetTreatmentDescription(form.budgetTreatment)}
              </p>
            </div>
            <div className="grid gap-2">
              <Label htmlFor={fieldId(item, "budgetSubmilestoneKey")}>
                Budget sub-milestone
              </Label>
              <NativeSelect
                aria-invalid={budgetTargetMissing || undefined}
                className={cn("w-full", TOUCH_SELECT_CLASS)}
                disabled={lockBudgetTreatment}
                id={fieldId(item, "budgetSubmilestoneKey")}
                onChange={(event) =>
                  setField("budgetSubmilestoneKey", event.target.value)
                }
                value={form.budgetSubmilestoneKey}
              >
                <NativeSelectOption value="">
                  {form.budgetTreatment === "logOnly"
                    ? "No budget target"
                    : "Select a sub-milestone"}
                </NativeSelectOption>
                {(selectedMilestone?.submilestones ?? []).map(
                  (submilestone) => (
                    <NativeSelectOption
                      key={submilestone.key}
                      value={submilestone.key}
                    >
                      {submilestone.name}
                    </NativeSelectOption>
                  )
                )}
              </NativeSelect>
              {budgetTargetMissing ? (
                <p className="text-destructive text-xs" role="alert">
                  Select one budget sub-milestone for this treatment.
                </p>
              ) : (
                <p className="text-muted-foreground text-xs">
                  Relevance tags below may still include multiple
                  sub-milestones.
                </p>
              )}
            </div>
          </div>
        ) : null}
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="grid gap-2">
            <Label htmlFor={fieldId(item, "costCents")}>
              Cost per unit ({currencyCode})
            </Label>
            <Input
              aria-describedby={cn(
                fieldId(item, "costHelp"),
                costInvalid && fieldId(item, "costError")
              )}
              aria-invalid={costInvalid || undefined}
              className={TOUCH_INPUT_CLASS}
              id={fieldId(item, "costCents")}
              inputMode="decimal"
              onChange={(event) => setField("costCents", event.target.value)}
              placeholder="0.00"
              value={form.costCents}
            />
            <p
              className="text-muted-foreground text-xs"
              id={fieldId(item, "costHelp")}
            >
              Optional. Leave blank to log this item without a cost; negative
              amounts are not allowed.
            </p>
            {costInvalid ? (
              <p
                aria-label="Cost per unit cannot be negative."
                className="text-destructive text-xs"
                id={fieldId(item, "costError")}
                role="alert"
              >
                Cost per unit cannot be negative.
              </p>
            ) : null}
          </div>
          <div className="grid gap-2">
            <Label htmlFor={fieldId(item, "quantity")}>Quantity</Label>
            <Input
              aria-describedby={cn(
                fieldId(item, "quantityHelp"),
                quantityInvalid && fieldId(item, "quantityError")
              )}
              aria-invalid={quantityInvalid || undefined}
              className={TOUCH_INPUT_CLASS}
              id={fieldId(item, "quantity")}
              inputMode="decimal"
              onChange={(event) => setField("quantity", event.target.value)}
              value={form.quantity}
            />
            <p
              className="text-muted-foreground text-xs"
              id={fieldId(item, "quantityHelp")}
            >
              Partial quantities such as 0.5 are allowed.
            </p>
            {quantityInvalid ? (
              <p
                aria-label="Quantity must be greater than 0."
                className="text-destructive text-xs"
                id={fieldId(item, "quantityError")}
                role="alert"
              >
                Quantity must be greater than 0.
              </p>
            ) : null}
          </div>
        </div>
        <div className="grid gap-2">
          <Label htmlFor={fieldId(item, "supplier")}>Supplier</Label>
          <Input
            className={TOUCH_INPUT_CLASS}
            id={fieldId(item, "supplier")}
            onChange={(event) => setField("supplier", event.target.value)}
            value={form.supplier}
          />
        </div>
        {showChangeReason ? (
          <div className="grid gap-2">
            <Label htmlFor={fieldId(item, "reason")}>Change reason</Label>
            <Input
              className={TOUCH_INPUT_CLASS}
              id={fieldId(item, "reason")}
              onChange={(event) => setField("reason", event.target.value)}
              placeholder="Required once a proposal is under review"
              value={form.reason}
            />
          </div>
        ) : null}
        <div className="grid gap-2">
          <Label>Relevant sub-milestones</Label>
          <div className="grid gap-2 rounded-lg border bg-background/70 p-2">
            {(selectedMilestone?.submilestones ?? []).length > 0 ? (
              selectedMilestone?.submilestones?.map((submilestone) => {
                const checked = form.relevantSubmilestoneKeys.includes(
                  submilestone.key
                );
                return (
                  <label
                    className="flex min-h-11 items-center gap-2 text-sm sm:min-h-8"
                    key={submilestone.key}
                  >
                    <Checkbox
                      checked={checked}
                      onCheckedChange={(value) =>
                        toggleSubmilestone(submilestone.key, value === true)
                      }
                    />
                    <span>{submilestone.name}</span>
                  </label>
                );
              })
            ) : (
              <p className="text-muted-foreground text-sm">
                This milestone has no sub-milestones.
              </p>
            )}
          </div>
        </div>
        {selectedMilestone && (budgetImpact || budgetTreatmentEnabled) ? (
          <section
            aria-labelledby={fieldId(item, "budgetImpactTitle")}
            className="grid gap-3 rounded-lg border bg-muted/30 p-3"
          >
            <div>
              <h3
                className="font-semibold text-sm"
                id={fieldId(item, "budgetImpactTitle")}
              >
                Budget impact
              </h3>
              <p className="mt-1 text-muted-foreground text-xs">
                Review the projected proposal and reimbursement draw changes
                before saving.
              </p>
            </div>
            <dl className="grid gap-3 text-sm">
              <ImpactPreviewRow
                label="Item total"
                value={formatCents(draftItemTotalCents)}
              />
              {budgetTreatmentEnabled ? (
                <ImpactPreviewRow
                  label="Treatment"
                  value={budgetTreatmentLabel(form.budgetTreatment)}
                />
              ) : null}
              {selectedBudgetSubmilestone || !budgetTreatmentEnabled ? (
                <ImpactPreviewComparison
                  afterCents={budgetTargetAfterCents}
                  beforeCents={budgetTargetBeforeCents}
                  label={`${selectedBudgetSubmilestone?.name ?? selectedMilestone.name} budget`}
                />
              ) : null}
              {form.budgetTreatment === "maintain" &&
              selectedBudgetSubmilestone ? (
                <>
                  <ImpactPreviewRow
                    label="Maintained cost allocation"
                    value={formatCents(maintainedAfterCents)}
                  />
                  <ImpactPreviewRow
                    label="Unallocated sub-milestone balance"
                    value={formatCents(Math.max(0, maintainedRemainingCents))}
                  />
                  {maintainOverBudget ? (
                    <p className="text-destructive text-xs" role="alert">
                      Maintained items exceed this sub-milestone budget by{" "}
                      {formatCents(Math.abs(maintainedRemainingCents))}.
                    </p>
                  ) : null}
                </>
              ) : null}
              {budgetImpact ? (
                <>
                  <ImpactPreviewComparison
                    afterCents={proposalBudgetAfterCents}
                    beforeCents={budgetImpact.proposalBudgetCents}
                    label="Proposal budget"
                  />
                  <ImpactPreviewComparison
                    afterCents={calculateDrawAvailability(
                      Math.max(
                        0,
                        selectedMilestone.budgetCents +
                          selectedMilestoneBudgetDeltaCents
                      ),
                      budgetImpact.borrowerCoPayBps
                    )}
                    beforeCents={calculateDrawAvailability(
                      selectedMilestone.budgetCents,
                      budgetImpact.borrowerCoPayBps
                    )}
                    label={`${selectedMilestone.name} draw availability`}
                  />
                </>
              ) : null}
            </dl>
          </section>
        ) : null}
      </div>

      <div
        className={cn(
          "flex flex-wrap justify-end gap-2",
          chrome === "plain" &&
            "sticky bottom-0 -mx-6 border-t bg-popover/95 px-6 py-4 sm:pr-24"
        )}
      >
        {onCancel ? (
          <Button
            className={TOUCH_BUTTON_CLASS}
            onClick={onCancel}
            size="sm"
            type="button"
            variant="outline"
          >
            Cancel
          </Button>
        ) : null}
        <Button
          aria-describedby={
            canSubmit ? undefined : fieldId(item, "submitGuidance")
          }
          className={TOUCH_BUTTON_CLASS}
          disabled={!canSubmit}
          onClick={() => void onSubmit(formToPayload(form))}
          size="sm"
          type="button"
        >
          {item ? <Pencil /> : <Plus />}
          {pending ? "Saving..." : submitLabel}
        </Button>
        {canSubmit ? null : (
          <p
            className="basis-full text-right text-muted-foreground text-xs"
            id={fieldId(item, "submitGuidance")}
          >
            {submitGuidance}
          </p>
        )}
      </div>
    </>
  );

  if (chrome === "plain") {
    return <div className="grid gap-4">{formContent}</div>;
  }

  return (
    <Frame>
      <FramePanel className="grid gap-4 p-4">{formContent}</FramePanel>
    </Frame>
  );
}

export function MaterialItemCard({
  canDelete,
  canEdit,
  item,
  milestone,
  onDelete,
  onEdit,
  pending,
}: {
  canDelete: boolean;
  canEdit: boolean;
  item: MaterialPlanningItem;
  milestone: MaterialPlanningMilestone;
  onDelete: (reason?: string) => void;
  onEdit: () => void;
  pending?: boolean;
}) {
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleteReason, setDeleteReason] = useState("");
  const submilestoneByKey = new Map(
    (milestone.submilestones ?? []).map((submilestone) => [
      submilestone.key,
      submilestone,
    ])
  );
  const attachedSubmilestones = item.relevantSubmilestoneKeys
    .map((key) => submilestoneByKey.get(key))
    .filter((row): row is MaterialPlanningSubmilestone => Boolean(row));
  const budgetSubmilestone = item.budgetSubmilestoneKey
    ? submilestoneByKey.get(item.budgetSubmilestoneKey)
    : undefined;

  return (
    <Card
      className="overflow-hidden"
      data-collaboration-focus={`material:${item._id}`}
      data-testid="material-planning-item-card"
    >
      <CardHeader className="gap-3 p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <Badge variant={item.itemType === "material" ? "success" : "info"}>
              {item.itemType === "material" ? "Material" : "Equipment"}
            </Badge>
            <CardTitle className="mt-3 text-base leading-snug">
              {item.title}
            </CardTitle>
          </div>
          <div className="text-right">
            <p className="font-semibold text-sm tabular-nums">
              {formatCents(totalForItem(item))}
            </p>
            <p className="text-muted-foreground text-xs">
              {formatCents(item.costCents)} x {formatQuantity(item.quantity)}
            </p>
          </div>
        </div>
      </CardHeader>
      <CardContent className="grid gap-4 p-4 pt-0">
        {item.description ? (
          <FieldRichTextPreview
            ariaLabel="Cost item description"
            value={item.description}
          />
        ) : null}
        <dl className="grid gap-2 text-sm">
          <DetailRow label="Supplier" value={item.supplier || "Unspecified"} />
          <DetailRow label="Milestone" value={milestone.name} />
          <DetailRow
            label="Budget treatment"
            value={budgetTreatmentLabel(
              normalizeBudgetTreatment(item.budgetTreatment)
            )}
          />
          {budgetSubmilestone ? (
            <DetailRow label="Budget target" value={budgetSubmilestone.name} />
          ) : null}
          <div className="grid gap-1">
            <dt className="text-muted-foreground text-xs uppercase">
              Relevant sub-milestones
            </dt>
            <dd className="flex flex-wrap gap-1.5">
              {attachedSubmilestones.length > 0 ? (
                attachedSubmilestones.map((submilestone) => (
                  <Badge key={submilestone.key} variant="outline">
                    {submilestone.name}
                  </Badge>
                ))
              ) : (
                <span className="text-muted-foreground">None selected</span>
              )}
            </dd>
          </div>
        </dl>
        {confirmingDelete ? (
          <div className="grid gap-3 border-t pt-3">
            <div className="grid gap-2">
              <Label htmlFor={fieldId(item, "deleteReason")}>
                Removal reason
              </Label>
              <Input
                className={TOUCH_INPUT_CLASS}
                id={fieldId(item, "deleteReason")}
                onChange={(event) => setDeleteReason(event.target.value)}
                placeholder="Required once a proposal is under review"
                value={deleteReason}
              />
            </div>
            <div className="flex flex-wrap justify-end gap-2">
              <Button
                className={TOUCH_BUTTON_CLASS}
                disabled={pending}
                onClick={() => {
                  setConfirmingDelete(false);
                  setDeleteReason("");
                }}
                size="sm"
                type="button"
                variant="outline"
              >
                Cancel
              </Button>
              <Button
                className={TOUCH_BUTTON_CLASS}
                disabled={pending}
                onClick={() => onDelete(optionalText(deleteReason))}
                size="sm"
                type="button"
                variant="destructive"
              >
                <Trash2 />
                {pending ? "Removing..." : "Remove item"}
              </Button>
            </div>
          </div>
        ) : canEdit || canDelete ? (
          <div className="flex flex-wrap justify-end gap-2 border-t pt-3">
            {canEdit ? (
              <Button
                className={TOUCH_BUTTON_CLASS}
                onClick={onEdit}
                size="sm"
                type="button"
                variant="outline"
              >
                <Pencil />
                Edit
              </Button>
            ) : null}
            {canDelete ? (
              <Button
                className={TOUCH_BUTTON_CLASS}
                onClick={() => setConfirmingDelete(true)}
                size="sm"
                type="button"
                variant="destructive"
              >
                <Trash2 />
                Delete
              </Button>
            ) : null}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

export function MaterialSummaryStrip({
  summary,
}: {
  summary: ReturnType<typeof summarizeItems>;
}) {
  const stats = [
    ["Cost item total", formatCents(summary.totalCents)],
    ["Material lines", String(summary.materialCount)],
    ["Equipment lines", String(summary.equipmentCount)],
    ["Suppliers", String(summary.supplierCount)],
  ] as const;
  return (
    <dl className="grid gap-px overflow-hidden rounded-lg border bg-border sm:grid-cols-2 xl:grid-cols-4">
      {stats.map(([label, value]) => (
        <div className="min-w-0 bg-background px-3 py-3" key={label}>
          <dt className="text-muted-foreground text-xs">{label}</dt>
          <dd className="mt-1 truncate font-semibold text-base tabular-nums">
            {value}
          </dd>
        </div>
      ))}
    </dl>
  );
}

export function ImpactPreviewRow({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-semibold tabular-nums">{value}</dd>
    </div>
  );
}

export function ImpactPreviewComparison({
  afterCents,
  beforeCents,
  label,
}: {
  afterCents: number;
  beforeCents: number;
  label: string;
}) {
  return (
    <div className="grid gap-1 border-t pt-3">
      <dt className="font-medium">{label}</dt>
      <dd className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-xs tabular-nums">
        <span className="text-muted-foreground">
          Before {formatCents(beforeCents)}
        </span>
        <span className="font-semibold">After {formatCents(afterCents)}</span>
      </dd>
    </div>
  );
}

export function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[7rem_minmax(0,1fr)] gap-2">
      <dt className="text-muted-foreground text-xs uppercase">{label}</dt>
      <dd className="min-w-0 break-words">{value}</dd>
    </div>
  );
}
