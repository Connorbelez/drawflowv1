"use client";

import { Pencil, Plus, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
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

export type MaterialPlanningItemType = "equipment" | "material";

export interface MaterialPlanningSubmilestone {
  key: string;
  milestoneKey?: string;
  name: string;
  order?: number;
}

export interface MaterialPlanningMilestone {
  budgetCents: number;
  key: string;
  name: string;
  order: number;
  submilestones?: MaterialPlanningSubmilestone[];
}

export interface MaterialPlanningItem {
  _id: string;
  costCents: number;
  description?: string;
  itemKey?: string;
  itemType: MaterialPlanningItemType;
  milestoneKey: string;
  quantity: number;
  relevantSubmilestoneKeys: string[];
  supplier?: string;
  title: string;
  totalCents?: number;
  updatedAt?: number;
}

export interface MaterialPlanningPayload {
  costCents: number;
  description?: string;
  itemType: MaterialPlanningItemType;
  milestoneKey: string;
  quantity: number;
  reason?: string;
  relevantSubmilestoneKeys: string[];
  supplier?: string;
  title: string;
}

export interface MaterialPlanningActions {
  create?: (payload: MaterialPlanningPayload) => Promise<unknown> | unknown;
  delete?: (
    item: MaterialPlanningItem,
    reason?: string
  ) => Promise<unknown> | unknown;
  update?: (
    item: MaterialPlanningItem,
    payload: MaterialPlanningPayload
  ) => Promise<unknown> | unknown;
}

interface MaterialPlanningTabProps {
  actions?: MaterialPlanningActions;
  items: MaterialPlanningItem[];
  milestones: MaterialPlanningMilestone[];
  panelLayout?: "auto" | "stacked";
  readOnly?: boolean;
  scopeLabel: string;
  showChangeReason?: boolean;
  variant?: "embedded" | "full";
}

type ItemFormState = {
  costCents: string;
  description: string;
  itemType: MaterialPlanningItemType;
  milestoneKey: string;
  quantity: string;
  reason: string;
  relevantSubmilestoneKeys: string[];
  supplier: string;
  title: string;
};

const TOUCH_BUTTON_CLASS = "max-sm:h-11";
const TOUCH_INPUT_CLASS =
  "max-sm:h-11 max-sm:[&_[data-slot=input]]:h-11 max-sm:[&_[data-slot=input]]:leading-[2.75rem]";
const TOUCH_SELECT_CLASS =
  "max-sm:h-11 max-sm:[&_[data-slot=native-select]]:h-11";

export function MaterialPlanningTab({
  actions,
  items,
  panelLayout = "auto",
  milestones,
  readOnly = false,
  scopeLabel,
  showChangeReason = true,
  variant = "full",
}: MaterialPlanningTabProps) {
  const embedded = variant === "embedded";
  const sortedMilestones = useMemo(
    () => [...milestones].sort((a, b) => a.order - b.order),
    [milestones]
  );
  const [selectedMilestoneKey, setSelectedMilestoneKey] = useState(
    sortedMilestones[0]?.key ?? ""
  );
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (
      sortedMilestones.length > 0 &&
      !sortedMilestones.some(
        (milestone) => milestone.key === selectedMilestoneKey
      )
    ) {
      setSelectedMilestoneKey(sortedMilestones[0]?.key ?? "");
    }
  }, [selectedMilestoneKey, sortedMilestones]);

  const milestoneByKey = useMemo(
    () =>
      new Map(sortedMilestones.map((milestone) => [milestone.key, milestone])),
    [sortedMilestones]
  );
  const itemsByMilestone = useMemo(() => {
    const grouped = new Map<string, MaterialPlanningItem[]>();
    for (const item of items) {
      const next = grouped.get(item.milestoneKey) ?? [];
      next.push(item);
      grouped.set(item.milestoneKey, next);
    }
    for (const group of grouped.values()) {
      group.sort((a, b) => a.title.localeCompare(b.title));
    }
    return grouped;
  }, [items]);
  const summary = useMemo(() => summarizeItems(items), [items]);
  const selectedMilestone =
    milestoneByKey.get(selectedMilestoneKey) ?? sortedMilestones[0];
  const editable = !readOnly && Boolean(actions?.create);

  async function runCreate(payload: MaterialPlanningPayload) {
    if (!actions?.create) {
      return;
    }
    setPending(true);
    setError("");
    try {
      await actions.create(payload);
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Cost item save failed."
      );
    } finally {
      setPending(false);
    }
  }

  async function runUpdate(
    item: MaterialPlanningItem,
    payload: MaterialPlanningPayload
  ) {
    if (!actions?.update) {
      return;
    }
    setPending(true);
    setError("");
    try {
      await actions.update(item, payload);
      setEditingItemId(null);
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Cost item update failed."
      );
    } finally {
      setPending(false);
    }
  }

  async function runDeleteWithReason(
    item: MaterialPlanningItem,
    reason?: string
  ) {
    if (!actions?.delete) {
      return;
    }
    setPending(true);
    setError("");
    try {
      await actions.delete(item, reason || undefined);
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Cost item delete failed."
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <div
      className="grid grid-flow-dense gap-4 overflow-x-hidden"
      data-testid="material-planning-tab"
    >
      {embedded ? null : (
        <Frame>
          <FramePanel className="overflow-hidden p-0">
            <div className="grid gap-5 p-4 md:p-5">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                <div className="max-w-5xl">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline">{scopeLabel}</Badge>
                    <Badge variant={readOnly ? "secondary" : "success"}>
                      {readOnly ? "View only" : "Planning editable"}
                    </Badge>
                  </div>
                  <h2 className="mt-3 text-balance font-semibold text-2xl tracking-tight md:text-3xl">
                    Material and equipment planning
                  </h2>
                  <p className="mt-2 max-w-3xl text-muted-foreground text-sm">
                    Cost-only entries stay attached to milestones and relevant
                    sub-milestones without becoming construction tasks.
                  </p>
                </div>
                {selectedMilestone ? (
                  <NativeSelect
                    aria-label="Select milestone"
                    className={cn("w-full lg:w-72", TOUCH_SELECT_CLASS)}
                    onChange={(event) => {
                      setSelectedMilestoneKey(event.target.value);
                      setEditingItemId(null);
                    }}
                    value={selectedMilestone.key}
                  >
                    {sortedMilestones.map((milestone) => (
                      <NativeSelectOption
                        key={milestone.key}
                        value={milestone.key}
                      >
                        {milestone.name}
                      </NativeSelectOption>
                    ))}
                  </NativeSelect>
                ) : null}
              </div>

              <MaterialSummaryStrip summary={summary} />
            </div>
          </FramePanel>
        </Frame>
      )}

      {error ? (
        <Frame>
          <FramePanel className="border-destructive/40 p-3 text-destructive text-sm">
            {error}
          </FramePanel>
        </Frame>
      ) : null}

      <div
        className={cn(
          "grid gap-4",
          panelLayout === "auto" &&
            !embedded &&
            "xl:grid-cols-[minmax(0,1fr)_24rem]"
        )}
      >
        <div className="grid gap-4">
          {sortedMilestones.length === 0 ? (
            <Frame>
              <FramePanel className="p-4 text-muted-foreground text-sm">
                Add milestones before planning materials or equipment.
              </FramePanel>
            </Frame>
          ) : null}

          {sortedMilestones.map((milestone) => {
            const milestoneItems = itemsByMilestone.get(milestone.key) ?? [];
            const totalCents = milestoneItems.reduce(
              (sum, item) => sum + totalForItem(item),
              0
            );
            return (
              <section className="grid gap-3" key={milestone.key}>
                <div className="flex flex-wrap items-end justify-between gap-3">
                  <div>
                    <h3 className="font-semibold text-lg">{milestone.name}</h3>
                    <p className="text-muted-foreground text-sm">
                      {milestoneItems.length} item
                      {milestoneItems.length === 1 ? "" : "s"} /{" "}
                      {formatCents(totalCents)} cost-only detail
                    </p>
                  </div>
                  <Badge variant="outline">
                    {formatCents(milestone.budgetCents)}
                  </Badge>
                </div>
                {milestoneItems.length === 0 ? (
                  <Frame>
                    <FramePanel className="p-4 text-muted-foreground text-sm">
                      No material or equipment entries are attached to this
                      milestone.
                    </FramePanel>
                  </Frame>
                ) : (
                  <div
                    className={cn(
                      "grid gap-3",
                      panelLayout === "auto"
                        ? "md:grid-cols-2"
                        : "2xl:grid-cols-2"
                    )}
                  >
                    {milestoneItems.map((item) =>
                      editingItemId === item._id ? (
                        <MaterialItemEditor
                          item={item}
                          key={item._id}
                          milestones={sortedMilestones}
                          onCancel={() => setEditingItemId(null)}
                          onSubmit={(payload) => runUpdate(item, payload)}
                          pending={pending}
                          showChangeReason={showChangeReason}
                          submitLabel="Save item"
                        />
                      ) : (
                        <MaterialItemCard
                          canDelete={Boolean(actions?.delete) && !readOnly}
                          canEdit={Boolean(actions?.update) && !readOnly}
                          item={item}
                          key={item._id}
                          milestone={milestone}
                          onDelete={(reason) =>
                            void runDeleteWithReason(item, reason)
                          }
                          onEdit={() => setEditingItemId(item._id)}
                          pending={pending}
                        />
                      )
                    )}
                  </div>
                )}
              </section>
            );
          })}
        </div>

        <aside
          className={cn(
            "grid content-start gap-4",
            !embedded && "xl:sticky xl:top-20"
          )}
        >
          {editable && selectedMilestone ? (
            <MaterialItemEditor
              key={selectedMilestone.key}
              milestones={sortedMilestones}
              onSubmit={runCreate}
              pending={pending}
              selectedMilestoneKey={selectedMilestone.key}
              showChangeReason={showChangeReason}
              submitLabel="Add item"
            />
          ) : (
            <Frame>
              <FramePanel className="p-4 text-sm">
                <p className="font-medium">Planning entries are locked</p>
                <p className="mt-1 text-muted-foreground">
                  This view shows the material and equipment detail already
                  attached to the build plan.
                </p>
              </FramePanel>
            </Frame>
          )}

          {selectedMilestone ? (
            <Frame>
              <FramePanel className="p-4">
                <h3 className="font-semibold text-sm">
                  Attached sub-milestones
                </h3>
                <div className="mt-3 flex flex-wrap gap-2">
                  {(selectedMilestone.submilestones ?? []).length > 0 ? (
                    selectedMilestone.submilestones?.map((submilestone) => (
                      <Badge key={submilestone.key} variant="outline">
                        {submilestone.name}
                      </Badge>
                    ))
                  ) : (
                    <p className="text-muted-foreground text-sm">
                      No sub-milestones are defined for this milestone.
                    </p>
                  )}
                </div>
              </FramePanel>
            </Frame>
          ) : null}
        </aside>
      </div>
    </div>
  );
}

function MaterialItemEditor({
  item,
  milestones,
  onCancel,
  onSubmit,
  pending,
  selectedMilestoneKey,
  showChangeReason,
  submitLabel,
}: {
  item?: MaterialPlanningItem;
  milestones: MaterialPlanningMilestone[];
  onCancel?: () => void;
  onSubmit: (payload: MaterialPlanningPayload) => Promise<unknown> | unknown;
  pending?: boolean;
  selectedMilestoneKey?: string;
  showChangeReason: boolean;
  submitLabel: string;
}) {
  const [form, setForm] = useState<ItemFormState>(() =>
    itemToFormState(item, selectedMilestoneKey ?? milestones[0]?.key ?? "")
  );
  const selectedMilestone =
    milestones.find((milestone) => milestone.key === form.milestoneKey) ??
    milestones[0];

  useEffect(() => {
    setForm(
      itemToFormState(item, selectedMilestoneKey ?? milestones[0]?.key ?? "")
    );
  }, [item, milestones, selectedMilestoneKey]);

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

  return (
    <Frame>
      <FramePanel className="grid gap-4 p-4">
        <div>
          <h3 className="font-semibold text-sm">
            {item ? "Edit cost item" : "Add cost item"}
          </h3>
          <p className="mt-1 text-muted-foreground text-xs">
            Enter the per-unit dollar amount. Quantity controls the total.
          </p>
        </div>

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
                <NativeSelectOption value="material">
                  Material
                </NativeSelectOption>
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
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor={fieldId(item, "costCents")}>
                Cost per unit (USD)
              </Label>
              <Input
                aria-describedby={fieldId(item, "costHelp")}
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
                Must be greater than zero.
              </p>
            </div>
            <div className="grid gap-2">
              <Label htmlFor={fieldId(item, "quantity")}>Quantity</Label>
              <Input
                aria-describedby={fieldId(item, "quantityHelp")}
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
                Supports partial quantities.
              </p>
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
        </div>

        <div className="flex flex-wrap justify-end gap-2">
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
            className={TOUCH_BUTTON_CLASS}
            disabled={
              !(
                form.title.trim() &&
                form.milestoneKey &&
                costDollarsPositive(form.costCents) &&
                quantityPositive(form.quantity)
              ) || pending
            }
            onClick={() => void onSubmit(formToPayload(form))}
            size="sm"
            type="button"
          >
            {item ? <Pencil /> : <Plus />}
            {pending ? "Saving..." : submitLabel}
          </Button>
        </div>
      </FramePanel>
    </Frame>
  );
}

function MaterialItemCard({
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

  return (
    <Card className="overflow-hidden" data-testid="material-planning-item-card">
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

function MaterialSummaryStrip({
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

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[7rem_minmax(0,1fr)] gap-2">
      <dt className="text-muted-foreground text-xs uppercase">{label}</dt>
      <dd className="min-w-0 break-words">{value}</dd>
    </div>
  );
}

function summarizeItems(items: MaterialPlanningItem[]) {
  const suppliers = new Set(
    items
      .map((item) => item.supplier?.trim())
      .filter((supplier): supplier is string => Boolean(supplier))
  );
  return {
    equipmentCount: items.filter((item) => item.itemType === "equipment")
      .length,
    materialCount: items.filter((item) => item.itemType === "material").length,
    supplierCount: suppliers.size,
    totalCents: items.reduce((sum, item) => sum + totalForItem(item), 0),
  };
}

function itemToFormState(
  item: MaterialPlanningItem | undefined,
  milestoneKey: string
): ItemFormState {
  return {
    costCents: item ? centsToDollarsInput(item.costCents) : "",
    description: item?.description ?? "",
    itemType: item?.itemType ?? "material",
    milestoneKey: item?.milestoneKey ?? milestoneKey,
    quantity: String(item?.quantity ?? 1),
    reason: "",
    relevantSubmilestoneKeys: item?.relevantSubmilestoneKeys ?? [],
    supplier: item?.supplier ?? "",
    title: item?.title ?? "",
  };
}

function formToPayload(form: ItemFormState): MaterialPlanningPayload {
  return {
    costCents: dollarsInputToCents(form.costCents),
    description: optionalText(form.description),
    itemType: form.itemType,
    milestoneKey: form.milestoneKey,
    quantity: numberFromInput(form.quantity, 1),
    reason: optionalText(form.reason),
    relevantSubmilestoneKeys: form.relevantSubmilestoneKeys,
    supplier: optionalText(form.supplier),
    title: form.title.trim(),
  };
}

function numberFromInput(value: string, fallback = 0) {
  const parsed = Number(value.replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : fallback;
}

function dollarsInputToCents(value: string) {
  return Math.round(numberFromInput(value) * 100);
}

function centsToDollarsInput(cents: number) {
  const dollars = cents / 100;
  return Number.isInteger(dollars) ? String(dollars) : dollars.toFixed(2);
}

function costDollarsPositive(value: string) {
  return numberFromInput(value) > 0;
}

function quantityPositive(value: string) {
  return numberFromInput(value, 0) > 0;
}

function optionalText(value: string) {
  const text = value.trim();
  return text.length > 0 ? text : undefined;
}

function totalForItem(item: MaterialPlanningItem) {
  return item.totalCents ?? Math.round(item.costCents * item.quantity);
}

function formatCents(cents: number) {
  return new Intl.NumberFormat("en-US", {
    currency: "USD",
    maximumFractionDigits: 0,
    style: "currency",
  }).format(cents / 100);
}

function formatQuantity(quantity: number) {
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 3,
  }).format(quantity);
}

function fieldId(item: MaterialPlanningItem | undefined, field: string) {
  return cn("material-planning", item?._id ?? "new", field).replace(
    /\s+/g,
    "-"
  );
}
