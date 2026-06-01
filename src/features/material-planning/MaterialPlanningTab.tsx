"use client";

import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import {
  Boxes,
  CircleDollarSign,
  Pencil,
  Plus,
  PackageCheck,
  Trash2,
  Wrench,
} from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useMemo, useRef, useState } from "react";

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
import { Textarea } from "#/components/ui/textarea.tsx";
import { cn } from "#/lib/utils.ts";

if (typeof window !== "undefined" && typeof window.matchMedia === "function") {
  gsap.registerPlugin(ScrollTrigger);
}

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
  delete?: (item: MaterialPlanningItem, reason?: string) => Promise<unknown> | unknown;
  update?: (
    item: MaterialPlanningItem,
    payload: MaterialPlanningPayload
  ) => Promise<unknown> | unknown;
}

interface MaterialPlanningTabProps {
  actions?: MaterialPlanningActions;
  items: MaterialPlanningItem[];
  panelLayout?: "auto" | "stacked";
  milestones: MaterialPlanningMilestone[];
  readOnly?: boolean;
  scopeLabel: string;
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

export function MaterialPlanningTab({
  actions,
  items,
  panelLayout = "auto",
  milestones,
  readOnly = false,
  scopeLabel,
}: MaterialPlanningTabProps) {
  const rootRef = useRef<HTMLDivElement>(null);
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
      !sortedMilestones.some((milestone) => milestone.key === selectedMilestoneKey)
    ) {
      setSelectedMilestoneKey(sortedMilestones[0]?.key ?? "");
    }
  }, [selectedMilestoneKey, sortedMilestones]);

  useGSAP(
    () => {
      if (
        !rootRef.current ||
        typeof window === "undefined" ||
        typeof window.matchMedia !== "function" ||
        window.matchMedia("(prefers-reduced-motion: reduce)").matches
      ) {
        return;
      }

      gsap.fromTo(
        ".material-plan-card",
        { scale: 0.98, y: 12 },
        {
          clearProps: "transform",
          duration: 0.65,
          ease: "power3.out",
          scale: 1,
          stagger: 0.055,
          y: 0,
          scrollTrigger: {
            end: "bottom 70%",
            start: "top 82%",
            trigger: rootRef.current,
          },
        }
      );
    },
    { dependencies: [items.length, selectedMilestoneKey], scope: rootRef }
  );

  const milestoneByKey = useMemo(
    () => new Map(sortedMilestones.map((milestone) => [milestone.key, milestone])),
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
    if (!actions?.create) return;
    setPending(true);
    setError("");
    try {
      await actions.create(payload);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Cost item save failed.");
    } finally {
      setPending(false);
    }
  }

  async function runUpdate(item: MaterialPlanningItem, payload: MaterialPlanningPayload) {
    if (!actions?.update) return;
    setPending(true);
    setError("");
    try {
      await actions.update(item, payload);
      setEditingItemId(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Cost item update failed.");
    } finally {
      setPending(false);
    }
  }

  async function runDelete(item: MaterialPlanningItem) {
    if (!actions?.delete) return;
    const reason =
      typeof window === "undefined"
        ? "Removed from material planning."
        : window.prompt("Reason for removing this cost item")?.trim();
    if (reason === undefined) return;
    setPending(true);
    setError("");
    try {
      await actions.delete(item, reason || undefined);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Cost item delete failed.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div
      className="grid-flow-dense grid gap-4 overflow-x-hidden"
      data-testid="material-planning-tab"
      ref={rootRef}
    >
      <Frame>
        <FramePanel className="overflow-hidden p-0">
          <div className="relative grid gap-5 p-4 md:p-5">
            <div className="pointer-events-none absolute inset-x-0 top-0 h-20 bg-[radial-gradient(circle_at_20%_0%,--theme(--color-primary/18%),transparent_42%),radial-gradient(circle_at_88%_18%,--theme(--color-success/12%),transparent_38%)]" />
            <div className="relative flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
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
                  className="w-full lg:w-72"
                  onChange={(event) => {
                    setSelectedMilestoneKey(event.target.value);
                    setEditingItemId(null);
                  }}
                  value={selectedMilestone.key}
                >
                  {sortedMilestones.map((milestone) => (
                    <NativeSelectOption key={milestone.key} value={milestone.key}>
                      {milestone.name}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
              ) : null}
            </div>

            <div className="grid-flow-dense grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <MetricCard
                icon={<CircleDollarSign className="size-4" />}
                label="Cost item total"
                value={formatCents(summary.totalCents)}
              />
              <MetricCard
                icon={<PackageCheck className="size-4" />}
                label="Material lines"
                value={String(summary.materialCount)}
              />
              <MetricCard
                icon={<Wrench className="size-4" />}
                label="Equipment lines"
                value={String(summary.equipmentCount)}
              />
              <MetricCard
                icon={<Boxes className="size-4" />}
                label="Suppliers"
                value={String(summary.supplierCount)}
              />
            </div>
          </div>
        </FramePanel>
      </Frame>

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
          panelLayout === "auto" && "xl:grid-cols-[minmax(0,1fr)_24rem]"
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
                  <Badge variant="outline">{formatCents(milestone.budgetCents)}</Badge>
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
                      panelLayout === "auto" ? "md:grid-cols-2" : "2xl:grid-cols-2"
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
                          submitLabel="Save item"
                        />
                      ) : (
                        <MaterialItemCard
                          canDelete={Boolean(actions?.delete) && !readOnly}
                          canEdit={Boolean(actions?.update) && !readOnly}
                          item={item}
                          key={item._id}
                          milestone={milestone}
                          onDelete={() => void runDelete(item)}
                          onEdit={() => setEditingItemId(item._id)}
                        />
                      )
                    )}
                  </div>
                )}
              </section>
            );
          })}
        </div>

        <aside className="grid content-start gap-4 xl:sticky xl:top-20">
          {editable && selectedMilestone ? (
            <MaterialItemEditor
              key={selectedMilestone.key}
              milestones={sortedMilestones}
              onSubmit={runCreate}
              pending={pending}
              selectedMilestoneKey={selectedMilestone.key}
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
                <h3 className="font-semibold text-sm">Attached sub-milestones</h3>
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
  submitLabel,
}: {
  item?: MaterialPlanningItem;
  milestones: MaterialPlanningMilestone[];
  onCancel?: () => void;
  onSubmit: (payload: MaterialPlanningPayload) => Promise<unknown> | unknown;
  pending?: boolean;
  selectedMilestoneKey?: string;
  submitLabel: string;
}) {
  const [form, setForm] = useState<ItemFormState>(() =>
    itemToFormState(item, selectedMilestoneKey ?? milestones[0]?.key ?? "")
  );
  const selectedMilestone =
    milestones.find((milestone) => milestone.key === form.milestoneKey) ??
    milestones[0];

  useEffect(() => {
    setForm(itemToFormState(item, selectedMilestoneKey ?? milestones[0]?.key ?? ""));
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
    <Frame className="material-plan-card">
      <FramePanel className="grid gap-4 p-4">
        <div>
          <h3 className="font-semibold text-sm">
            {item ? "Edit cost item" : "Add cost item"}
          </h3>
          <p className="mt-1 text-muted-foreground text-xs">
            Cost is stored in cents and multiplied by quantity.
          </p>
        </div>

        <div className="grid gap-3">
          <div className="grid gap-2">
            <Label htmlFor={fieldId(item, "title")}>Title</Label>
            <Input
              id={fieldId(item, "title")}
              onChange={(event) => setField("title", event.target.value)}
              value={form.title}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor={fieldId(item, "description")}>Description</Label>
            <Textarea
              id={fieldId(item, "description")}
              onChange={(event) => setField("description", event.target.value)}
              value={form.description}
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor={fieldId(item, "itemType")}>Type</Label>
              <NativeSelect
                className="w-full"
                id={fieldId(item, "itemType")}
                onChange={(event) =>
                  setField("itemType", event.target.value as MaterialPlanningItemType)
                }
                value={form.itemType}
              >
                <NativeSelectOption value="material">Material</NativeSelectOption>
                <NativeSelectOption value="equipment">Equipment</NativeSelectOption>
              </NativeSelect>
            </div>
            <div className="grid gap-2">
              <Label htmlFor={fieldId(item, "milestoneKey")}>Milestone</Label>
              <NativeSelect
                className="w-full"
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
              <Label htmlFor={fieldId(item, "costCents")}>Cost</Label>
              <Input
                id={fieldId(item, "costCents")}
                inputMode="numeric"
                onChange={(event) => setField("costCents", event.target.value)}
                value={form.costCents}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor={fieldId(item, "quantity")}>Quantity</Label>
              <Input
                id={fieldId(item, "quantity")}
                inputMode="decimal"
                onChange={(event) => setField("quantity", event.target.value)}
                value={form.quantity}
              />
            </div>
          </div>
          <div className="grid gap-2">
            <Label htmlFor={fieldId(item, "supplier")}>Supplier</Label>
            <Input
              id={fieldId(item, "supplier")}
              onChange={(event) => setField("supplier", event.target.value)}
              value={form.supplier}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor={fieldId(item, "reason")}>Change reason</Label>
            <Input
              id={fieldId(item, "reason")}
              onChange={(event) => setField("reason", event.target.value)}
              placeholder="Required once a proposal is under review"
              value={form.reason}
            />
          </div>
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
                      className="flex items-center gap-2 text-sm"
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
            <Button onClick={onCancel} size="sm" type="button" variant="outline">
              Cancel
            </Button>
          ) : null}
          <Button
            disabled={!form.title.trim() || !form.milestoneKey || pending}
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
}: {
  canDelete: boolean;
  canEdit: boolean;
  item: MaterialPlanningItem;
  milestone: MaterialPlanningMilestone;
  onDelete: () => void;
  onEdit: () => void;
}) {
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
    <Card className="material-plan-card group overflow-hidden" data-testid="material-planning-item-card">
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
          <p className="text-muted-foreground text-sm">{item.description}</p>
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
        {canEdit || canDelete ? (
          <div className="flex justify-end gap-2 border-t pt-3">
            {canEdit ? (
              <Button onClick={onEdit} size="sm" type="button" variant="outline">
                <Pencil />
                Edit
              </Button>
            ) : null}
            {canDelete ? (
              <Button onClick={onDelete} size="sm" type="button" variant="destructive">
                <Trash2 />
                Delete
              </Button>
            ) : null}
          </div>
        ) : null}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-1 origin-left scale-x-0 bg-primary/50 transition-transform duration-700 group-hover:scale-x-100" />
      </CardContent>
    </Card>
  );
}

function MetricCard({
  icon,
  label,
  value,
}: {
  icon: ReactNode;
  label: string;
  value: string;
}) {
  return (
    <Card className="material-plan-card overflow-hidden">
      <CardContent className="flex items-center gap-3 p-3">
        <span className="flex size-9 items-center justify-center rounded-md bg-primary/10 text-primary">
          {icon}
        </span>
        <span className="min-w-0">
          <span className="block text-muted-foreground text-xs">{label}</span>
          <strong className="block truncate font-semibold text-base">{value}</strong>
        </span>
      </CardContent>
    </Card>
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
    equipmentCount: items.filter((item) => item.itemType === "equipment").length,
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
    costCents: String(item?.costCents ?? 0),
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
    costCents: numberFromInput(form.costCents),
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
  return cn("material-planning", item?._id ?? "new", field).replace(/\s+/g, "-");
}
