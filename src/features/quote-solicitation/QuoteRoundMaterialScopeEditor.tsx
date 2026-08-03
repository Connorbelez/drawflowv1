"use client";

import {
  AlertTriangle,
  Check,
  PackageCheck,
  Pencil,
  Plus,
  X,
} from "lucide-react";
import { useMemo, useState } from "react";

import { FieldRichTextEditor } from "#/components/rich-text/field-rich-text.tsx";
import { Alert, AlertDescription, AlertTitle } from "#/components/ui/alert.tsx";
import { Badge } from "#/components/ui/badge.tsx";
import { Button } from "#/components/ui/button.tsx";
import { Card, CardPanel } from "#/components/ui/card.tsx";
import {
  Frame,
  FrameDescription,
  FrameHeader,
  FramePanel,
  FrameTitle,
} from "#/components/ui/frame.tsx";
import { Input } from "#/components/ui/input.tsx";
import {
  NativeSelect,
  NativeSelectOption,
} from "#/components/ui/native-select.tsx";
import { cn } from "#/lib/utils.ts";
import type {
  QuoteRoundLabourSubmilestone,
  QuoteRoundMaterialCostItem,
  QuoteRoundMaterialRow,
} from "./QuoteRoundComposer.tsx";
import { parseQuoteRoundTiptapJson } from "./quote-round-tiptap.ts";

const MATERIAL_UNITS = [
  "allowance",
  "each",
  "linear ft",
  "package",
  "sheet",
  "sq ft",
] as const;

const EMPTY_TIPTAP_DOCUMENT = JSON.stringify({
  content: [{ content: [], type: "paragraph" }],
  type: "doc",
});

function formatDayWindow(item: QuoteRoundLabourSubmilestone) {
  if (item.startDay === undefined) {
    return "Schedule pending";
  }
  const endDay = item.startDay + Math.max(0, (item.durationDays ?? 1) - 1);
  return `Construction days ${item.startDay}–${endDay}`;
}

function newAdHocRowKey() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `ad-hoc:${crypto.randomUUID()}`;
  }
  return `ad-hoc:${Date.now()}:${Math.random().toString(36).slice(2, 9)}`;
}

function defaultMaterialRow(
  item: QuoteRoundMaterialCostItem,
  labourItems: QuoteRoundLabourSubmilestone[]
): QuoteRoundMaterialRow {
  return {
    assignedSubmilestoneIds: labourItems
      .filter((labourItem) =>
        item.relevantSubmilestoneKeys?.includes(
          labourItem.submilestoneKey ?? ""
        )
      )
      .map((labourItem) => labourItem._id),
    rowKey: `build-cost:${item._id}`,
    source: "build_cost_item",
    sourceBuildCostItemId: item._id,
  };
}

interface MaterialScopeValues {
  assignedSubmilestoneIds: string[];
  deliveryEndDay: string;
  deliveryInstructions: string;
  deliveryLocation: string;
  deliveryStartDay: string;
  description: string;
  isBuildCostItem: boolean;
  quantity: string;
  specificationTiptapJson: string;
  title: string;
  unit: string;
}

function materialScopeValidationError(input: MaterialScopeValues) {
  if (input.isBuildCostItem) {
    return input.assignedSubmilestoneIds.length
      ? undefined
      : "Assign at least one relevant sub-milestone.";
  }
  const parsedQuantity = Number(input.quantity);
  const start = input.deliveryStartDay.trim()
    ? Number(input.deliveryStartDay)
    : undefined;
  const end = input.deliveryEndDay.trim()
    ? Number(input.deliveryEndDay)
    : undefined;
  if (!input.title.trim()) {
    return "Give this material pricing line a title.";
  }
  if (!Number.isFinite(parsedQuantity) || parsedQuantity <= 0) {
    return "Quantity must be a positive number.";
  }
  if (!input.assignedSubmilestoneIds.length) {
    return "Assign at least one relevant sub-milestone.";
  }
  if (!(input.deliveryStartDay.trim() && input.deliveryEndDay.trim())) {
    return "Delivery start and end days are required.";
  }
  if (
    (start !== undefined && !Number.isInteger(start)) ||
    (end !== undefined && !Number.isInteger(end))
  ) {
    return "Delivery days must be whole construction days.";
  }
  if (start !== undefined && end !== undefined && end < start) {
    return "Delivery end day must be on or after the start day.";
  }
  if (!input.deliveryLocation.trim()) {
    return "Delivery location is required.";
  }
  if (!input.deliveryInstructions.trim()) {
    return "Delivery instructions are required.";
  }
  if (!parseQuoteRoundTiptapJson(input.specificationTiptapJson)) {
    return "Add a valid TipTap material specification.";
  }
  return;
}

function savedMaterialRow(input: {
  initialRow?: QuoteRoundMaterialRow;
  values: MaterialScopeValues;
}): { error?: string; row?: QuoteRoundMaterialRow } {
  const error = materialScopeValidationError(input.values);
  if (error) {
    return { error };
  }
  const base = {
    assignedSubmilestoneIds: input.values.assignedSubmilestoneIds,
    rowKey: input.initialRow?.rowKey ?? newAdHocRowKey(),
  };
  if (input.values.isBuildCostItem) {
    if (!input.initialRow?.sourceBuildCostItemId) {
      return { error: "This Build Cost Item source is no longer available." };
    }
    return {
      row: {
        ...base,
        source: "build_cost_item",
        sourceBuildCostItemId: input.initialRow.sourceBuildCostItemId,
      },
    };
  }
  return {
    row: {
      ...base,
      deliveryEndDay: Number(input.values.deliveryEndDay),
      deliveryInstructions: input.values.deliveryInstructions.trim(),
      deliveryLocation: input.values.deliveryLocation.trim(),
      deliveryStartDay: Number(input.values.deliveryStartDay),
      description: input.values.description.trim() || undefined,
      quantity: Number(input.values.quantity),
      source: "ad_hoc",
      specificationTiptapJson: input.values.specificationTiptapJson,
      title: input.values.title.trim(),
      unit: input.values.unit,
    },
  };
}

function useMaterialScopeFormState({
  item,
  labourItems,
  onSave,
  row,
}: {
  item?: QuoteRoundMaterialCostItem;
  labourItems: QuoteRoundLabourSubmilestone[];
  onSave: (row: QuoteRoundMaterialRow) => void;
  row?: QuoteRoundMaterialRow;
}) {
  const initialRow =
    row ?? (item ? defaultMaterialRow(item, labourItems) : undefined);
  const isBuildCostItem = initialRow?.source === "build_cost_item";
  const [title, setTitle] = useState(initialRow?.title ?? item?.title ?? "");
  const [description, setDescription] = useState(
    initialRow?.description ?? item?.description ?? ""
  );
  const [quantity, setQuantity] = useState(
    String(initialRow?.quantity ?? item?.quantity ?? 1)
  );
  const [unit, setUnit] = useState(initialRow?.unit ?? item?.unit ?? "package");
  const [specificationTiptapJson, setSpecificationTiptapJson] = useState(
    initialRow?.specificationTiptapJson ??
      item?.specificationTiptapJson ??
      EMPTY_TIPTAP_DOCUMENT
  );
  const [deliveryStartDay, setDeliveryStartDay] = useState(
    (initialRow?.deliveryStartDay ?? item?.deliveryStartDay) === undefined
      ? ""
      : String(initialRow?.deliveryStartDay ?? item?.deliveryStartDay)
  );
  const [deliveryEndDay, setDeliveryEndDay] = useState(
    (initialRow?.deliveryEndDay ?? item?.deliveryEndDay) === undefined
      ? ""
      : String(initialRow?.deliveryEndDay ?? item?.deliveryEndDay)
  );
  const [deliveryLocation, setDeliveryLocation] = useState(
    initialRow?.deliveryLocation ?? item?.deliveryLocation ?? ""
  );
  const [deliveryInstructions, setDeliveryInstructions] = useState(
    initialRow?.deliveryInstructions ?? item?.deliveryInstructions ?? ""
  );
  const [assignedSubmilestoneIds, setAssignedSubmilestoneIds] = useState<
    string[]
  >(initialRow?.assignedSubmilestoneIds ?? []);
  const [error, setError] = useState<string>();
  const milestones = useMemo(
    () =>
      [
        ...new Map(
          labourItems.map((labourItem) => [labourItem.milestoneKey, labourItem])
        ).entries(),
      ].map(([milestoneKey, first]) => ({
        items: labourItems.filter(
          (labourItem) => labourItem.milestoneKey === milestoneKey
        ),
        milestoneKey,
        milestoneName: first.milestoneName,
      })),
    [labourItems]
  );
  const toggleAssignment = (id: string) =>
    setAssignedSubmilestoneIds((current) =>
      current.includes(id)
        ? current.filter((candidate) => candidate !== id)
        : [...current, id]
    );
  const save = () => {
    const result = savedMaterialRow({
      initialRow,
      values: {
        assignedSubmilestoneIds,
        deliveryEndDay,
        deliveryInstructions,
        deliveryLocation,
        deliveryStartDay,
        description,
        isBuildCostItem,
        quantity,
        specificationTiptapJson,
        title,
        unit,
      },
    });
    if (!result.row) {
      setError(result.error ?? "Material scope needs attention.");
      return;
    }
    onSave(result.row);
  };

  return {
    assignedSubmilestoneIds,
    deliveryEndDay,
    deliveryInstructions,
    deliveryLocation,
    deliveryStartDay,
    description,
    error,
    initialRow,
    isBuildCostItem,
    milestones,
    quantity,
    save,
    setDeliveryEndDay,
    setDeliveryInstructions,
    setDeliveryLocation,
    setDeliveryStartDay,
    setDescription,
    setQuantity,
    setSpecificationTiptapJson,
    setTitle,
    setUnit,
    specificationTiptapJson,
    title,
    toggleAssignment,
    unit,
  };
}

function MaterialScopeForm({
  item,
  labourItems,
  onCancel,
  onSave,
  row,
}: {
  item?: QuoteRoundMaterialCostItem;
  labourItems: QuoteRoundLabourSubmilestone[];
  onCancel: () => void;
  onSave: (row: QuoteRoundMaterialRow) => void;
  row?: QuoteRoundMaterialRow;
}) {
  const {
    assignedSubmilestoneIds,
    deliveryEndDay,
    deliveryInstructions,
    deliveryLocation,
    deliveryStartDay,
    description,
    error,
    initialRow,
    isBuildCostItem,
    milestones,
    quantity,
    save,
    setDeliveryEndDay,
    setDeliveryInstructions,
    setDeliveryLocation,
    setDeliveryStartDay,
    setDescription,
    setQuantity,
    setSpecificationTiptapJson,
    setTitle,
    setUnit,
    specificationTiptapJson,
    title,
    toggleAssignment,
    unit,
  } = useMaterialScopeFormState({ item, labourItems, onSave, row });

  return (
    <Frame data-testid="quote-material-editor">
      <FrameHeader className="gap-1">
        <div className="flex items-center justify-between gap-3">
          <FrameTitle>
            {initialRow
              ? "Configure material scope"
              : "Add a material to quote"}
          </FrameTitle>
          <Button
            aria-label="Close material editor"
            onClick={onCancel}
            size="icon-sm"
            variant="ghost"
          >
            <X />
          </Button>
        </div>
        <FrameDescription>
          {isBuildCostItem
            ? "Canonical Build Cost Item values stay server-derived; only its relevant sub-milestones are reassigned here."
            : "Define a typed pricing line and reassign every relevant sub-milestone before it reaches a supplier."}
        </FrameDescription>
      </FrameHeader>
      <FramePanel className="space-y-5 p-4">
        {error ? (
          <Alert variant="error">
            <AlertTriangle />
            <AlertTitle>Material scope needs attention</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}
        {isBuildCostItem ? (
          <Alert variant="info">
            <PackageCheck />
            <AlertTitle>Canonical material source</AlertTitle>
            <AlertDescription>
              Title, quantity, specification, and delivery fields come from the
              Build Cost Item at publication and cannot be overridden in this
              Quote Draft.
            </AlertDescription>
          </Alert>
        ) : null}
        <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_8rem_9rem]">
          <label
            className="grid gap-1.5 text-sm"
            htmlFor="quote-material-title"
          >
            <span className="font-medium">Material title</span>
            <Input
              aria-label="Material title"
              disabled={isBuildCostItem}
              id="quote-material-title"
              inputClassName="min-h-11 sm:min-h-7.5"
              onChange={(event) => setTitle(event.target.value)}
              placeholder="e.g. 5/8 in fire-rated drywall"
              value={title}
            />
          </label>
          <label
            className="grid gap-1.5 text-sm"
            htmlFor="quote-material-quantity"
          >
            <span className="font-medium">Quantity</span>
            <Input
              aria-label="Material quantity"
              disabled={isBuildCostItem}
              id="quote-material-quantity"
              inputClassName="min-h-11 sm:min-h-7.5"
              min="0"
              onChange={(event) => setQuantity(event.target.value)}
              step="any"
              type="number"
              value={quantity}
            />
          </label>
          <label className="grid gap-1.5 text-sm" htmlFor="quote-material-unit">
            <span className="font-medium">Unit</span>
            <NativeSelect
              aria-label="Material unit"
              className="w-full [&_select]:min-h-11 sm:[&_select]:min-h-7"
              disabled={isBuildCostItem}
              id="quote-material-unit"
              onChange={(event) => setUnit(event.target.value)}
              value={unit}
            >
              {MATERIAL_UNITS.map((materialUnit) => (
                <NativeSelectOption key={materialUnit} value={materialUnit}>
                  {materialUnit}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </label>
        </div>
        <label
          className="grid gap-1.5 text-sm"
          htmlFor="quote-material-description"
        >
          <span className="font-medium">Description</span>
          <Input
            aria-label="Material description"
            disabled={isBuildCostItem}
            id="quote-material-description"
            inputClassName="min-h-11 sm:min-h-7.5"
            onChange={(event) => setDescription(event.target.value)}
            placeholder="Supplier-facing product or installation context"
            value={description}
          />
        </label>
        <div className="grid gap-3 sm:grid-cols-2">
          <label
            className="grid gap-1.5 text-sm"
            htmlFor="quote-material-delivery-start"
          >
            <span className="font-medium">Delivery start day</span>
            <Input
              aria-label="Delivery start day"
              disabled={isBuildCostItem}
              id="quote-material-delivery-start"
              inputClassName="min-h-11 sm:min-h-7.5"
              min="0"
              onChange={(event) => setDeliveryStartDay(event.target.value)}
              placeholder="e.g. 42"
              type="number"
              value={deliveryStartDay}
            />
          </label>
          <label
            className="grid gap-1.5 text-sm"
            htmlFor="quote-material-delivery-end"
          >
            <span className="font-medium">Delivery end day</span>
            <Input
              aria-label="Delivery end day"
              disabled={isBuildCostItem}
              id="quote-material-delivery-end"
              inputClassName="min-h-11 sm:min-h-7.5"
              min="0"
              onChange={(event) => setDeliveryEndDay(event.target.value)}
              placeholder="e.g. 49"
              type="number"
              value={deliveryEndDay}
            />
          </label>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <label
            className="grid gap-1.5 text-sm"
            htmlFor="quote-material-delivery-location"
          >
            <span className="font-medium">Delivery location</span>
            <Input
              aria-label="Delivery location"
              disabled={isBuildCostItem}
              id="quote-material-delivery-location"
              inputClassName="min-h-11 sm:min-h-7.5"
              onChange={(event) => setDeliveryLocation(event.target.value)}
              placeholder="e.g. North staging area"
              value={deliveryLocation}
            />
          </label>
          <label
            className="grid gap-1.5 text-sm"
            htmlFor="quote-material-delivery-instructions"
          >
            <span className="font-medium">Delivery instructions</span>
            <Input
              aria-label="Delivery instructions"
              disabled={isBuildCostItem}
              id="quote-material-delivery-instructions"
              inputClassName="min-h-11 sm:min-h-7.5"
              onChange={(event) => setDeliveryInstructions(event.target.value)}
              placeholder="e.g. Call site lead before unloading"
              value={deliveryInstructions}
            />
          </label>
        </div>
        {isBuildCostItem ? null : (
          <div className="space-y-1.5">
            <p className="font-medium text-sm">Supplier specification</p>
            <p className="text-muted-foreground text-xs">
              Use the existing rich-text field when this material needs typed
              specification, alternates, or delivery handling.
            </p>
            <FieldRichTextEditor
              ariaLabel="Supplier specification"
              editorMinHeightClass="[&_.ProseMirror]:min-h-24"
              onChange={() => undefined}
              onDocumentChange={(document) =>
                setSpecificationTiptapJson(JSON.stringify(document))
              }
              placeholder="Include product, finish, alternate, or delivery requirements."
              value={
                parseQuoteRoundTiptapJson(specificationTiptapJson) ??
                EMPTY_TIPTAP_DOCUMENT
              }
            />
          </div>
        )}
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="font-semibold text-sm">Relevant sub-milestones</p>
              <p className="text-muted-foreground text-xs">
                Select one or more. This assignment is preserved as individual
                construction context.
              </p>
            </div>
            <Badge
              variant={assignedSubmilestoneIds.length ? "success" : "outline"}
            >
              {assignedSubmilestoneIds.length} selected
            </Badge>
          </div>
          <Frame className="max-h-80 overflow-y-auto">
            <FramePanel className="space-y-4 p-3">
              {milestones.map((milestone) => (
                <section className="space-y-2" key={milestone.milestoneKey}>
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-semibold text-xs">
                      {milestone.milestoneName}
                    </p>
                    <span className="text-muted-foreground text-xs">
                      {
                        milestone.items.filter((candidate) =>
                          assignedSubmilestoneIds.includes(candidate._id)
                        ).length
                      }
                      /{milestone.items.length}
                    </span>
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {milestone.items.map((submilestone) => {
                      const selected = assignedSubmilestoneIds.includes(
                        submilestone._id
                      );
                      return (
                        <Card key={submilestone._id}>
                          <CardPanel className="p-1.5">
                            <Button
                              aria-label={`${selected ? "Unassign" : "Assign"} ${submilestone.name}`}
                              aria-pressed={selected}
                              className="h-auto min-h-11 w-full justify-start whitespace-normal px-2 text-left"
                              onClick={() => toggleAssignment(submilestone._id)}
                              variant="ghost"
                            >
                              <span
                                aria-hidden="true"
                                className={cn(
                                  "grid size-5 shrink-0 place-items-center rounded-md border",
                                  selected &&
                                    "border-primary bg-primary text-primary-foreground"
                                )}
                              >
                                {selected ? (
                                  <Check className="size-3.5" />
                                ) : null}
                              </span>
                              <span className="min-w-0">
                                <span className="block font-medium text-xs">
                                  {submilestone.name}
                                </span>
                                <span className="block text-muted-foreground text-xs">
                                  {formatDayWindow(submilestone)}
                                </span>
                              </span>
                            </Button>
                          </CardPanel>
                        </Card>
                      );
                    })}
                  </div>
                </section>
              ))}
            </FramePanel>
          </Frame>
        </div>
        <div className="flex flex-col-reverse gap-2 border-t pt-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-muted-foreground text-xs">
            Save applies this typed row and its reassignments to the draft
            package.
          </p>
          <div className="flex gap-2">
            <Button onClick={onCancel} variant="outline">
              Cancel
            </Button>
            <Button onClick={save}>
              <Check />
              Save material scope
            </Button>
          </div>
        </div>
      </FramePanel>
    </Frame>
  );
}

function MaterialRowCard({
  labourItems,
  onConfigure,
  onRemove,
  row,
}: {
  labourItems: QuoteRoundLabourSubmilestone[];
  onConfigure: () => void;
  onRemove: () => void;
  row: QuoteRoundMaterialRow;
}) {
  const assigned = labourItems.filter((item) =>
    row.assignedSubmilestoneIds.includes(item._id)
  );
  return (
    <Card>
      <CardPanel className="flex items-start gap-3 p-3">
        <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-warning/10 text-warning-foreground">
          <PackageCheck className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium text-sm">{row.title}</p>
          <p className="text-muted-foreground text-xs">
            {row.quantity ?? 1} {row.unit ?? "package"} · {assigned.length}{" "}
            assigned sub-milestone{assigned.length === 1 ? "" : "s"}
          </p>
          {assigned.length ? (
            <p className="mt-1 truncate text-muted-foreground text-xs">
              {assigned.map((item) => item.name).join(" · ")}
            </p>
          ) : null}
        </div>
        <div className="flex gap-1">
          <Button
            aria-label={`Configure ${row.title}`}
            onClick={onConfigure}
            size="icon-sm"
            variant="ghost"
          >
            <Pencil />
          </Button>
          <Button
            aria-label={`Remove ${row.title}`}
            onClick={onRemove}
            size="icon-sm"
            variant="ghost"
          >
            <X />
          </Button>
        </div>
      </CardPanel>
    </Card>
  );
}

export function QuoteRoundMaterialScopeEditor({
  labourItems,
  materialItems,
  onRowsChange,
  rows,
}: {
  labourItems: QuoteRoundLabourSubmilestone[];
  materialItems: QuoteRoundMaterialCostItem[];
  onRowsChange: (next: QuoteRoundMaterialRow[]) => void;
  rows: QuoteRoundMaterialRow[];
}) {
  const [editingKey, setEditingKey] = useState<string | "new" | null>(null);
  const materialById = useMemo(
    () => new Map(materialItems.map((item) => [item._id, item])),
    [materialItems]
  );
  const editingRow =
    editingKey && editingKey !== "new"
      ? rows.find((row) => row.rowKey === editingKey)
      : undefined;
  const editingItem = editingRow?.sourceBuildCostItemId
    ? materialById.get(editingRow.sourceBuildCostItemId)
    : undefined;

  const togglePlanned = (item: QuoteRoundMaterialCostItem) => {
    const existing = rows.find((row) => row.sourceBuildCostItemId === item._id);
    onRowsChange(
      existing
        ? rows.filter((row) => row.rowKey !== existing.rowKey)
        : [...rows, defaultMaterialRow(item, labourItems)]
    );
  };

  const saveRow = (next: QuoteRoundMaterialRow) => {
    onRowsChange(
      rows.some((row) => row.rowKey === next.rowKey)
        ? rows.map((row) => (row.rowKey === next.rowKey ? next : row))
        : [...rows, next]
    );
    setEditingKey(null);
  };

  return (
    <div className="space-y-5" data-testid="quote-material-scope">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b pb-3">
        <div className="flex min-w-0 items-start gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-warning/10 text-warning-foreground">
            <PackageCheck className="size-5" />
          </span>
          <div>
            <p className="font-semibold">Material scope</p>
            <p className="text-muted-foreground text-xs">
              Select planned materials or add a typed ad-hoc line, then reassign
              its relevant sub-milestones.
            </p>
          </div>
        </div>
        <Button onClick={() => setEditingKey("new")} size="sm">
          <Plus />
          Add material
        </Button>
      </div>
      {editingKey ? (
        <MaterialScopeForm
          item={editingItem}
          labourItems={labourItems}
          onCancel={() => setEditingKey(null)}
          onSave={saveRow}
          row={editingRow}
        />
      ) : null}
      {rows.filter((row) => row.source === "ad_hoc").length ? (
        <section className="space-y-2">
          <div>
            <h3 className="font-semibold text-sm">
              Added for this Quote Round
            </h3>
            <p className="text-muted-foreground text-xs">
              Typed rows are scoped only to this draft until it is published.
            </p>
          </div>
          <div className="grid gap-2">
            {rows
              .filter((row) => row.source === "ad_hoc")
              .map((row) => (
                <MaterialRowCard
                  key={row.rowKey}
                  labourItems={labourItems}
                  onConfigure={() => setEditingKey(row.rowKey)}
                  onRemove={() =>
                    onRowsChange(
                      rows.filter(
                        (candidate) => candidate.rowKey !== row.rowKey
                      )
                    )
                  }
                  row={row}
                />
              ))}
          </div>
        </section>
      ) : null}
      <section className="space-y-2">
        <div>
          <h3 className="font-semibold text-sm">Planned build materials</h3>
          <p className="text-muted-foreground text-xs">
            Existing cost lines from the active Build remain independent
            supplier pricing lines.
          </p>
        </div>
        <div className="grid gap-2">
          {materialItems.map((item) => {
            const row = rows.find(
              (candidate) => candidate.sourceBuildCostItemId === item._id
            );
            return (
              <Card key={item._id}>
                <CardPanel className="flex items-start gap-2 p-2.5 sm:p-3">
                  <Button
                    aria-label={`${row ? "Deselect" : "Select"} ${item.title}`}
                    aria-pressed={Boolean(row)}
                    className="h-auto min-h-12 min-w-0 flex-1 justify-start whitespace-normal px-1.5 text-left hover:bg-transparent"
                    onClick={() => togglePlanned(item)}
                    variant="ghost"
                  >
                    <span
                      aria-hidden="true"
                      className={cn(
                        "grid size-5 shrink-0 place-items-center rounded-md border",
                        row &&
                          "border-primary bg-primary text-primary-foreground"
                      )}
                    >
                      {row ? <Check className="size-3.5" /> : null}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium text-sm">
                        {item.title}
                      </span>
                      <span className="block text-muted-foreground text-xs">
                        {item.quantity} {item.unit ?? "package"} ·{" "}
                        {item.deliveryStartDay === undefined
                          ? "Delivery pending"
                          : `Delivery day ${item.deliveryStartDay}–${item.deliveryEndDay ?? item.deliveryStartDay}`}{" "}
                        · {item.relevantSubmilestoneKeys?.length ?? 0} assigned
                        contexts
                      </span>
                    </span>
                  </Button>
                  {row ? (
                    <Button
                      aria-label={`Configure ${item.title}`}
                      onClick={() => setEditingKey(row.rowKey)}
                      size="icon-sm"
                      variant="ghost"
                    >
                      <Pencil />
                    </Button>
                  ) : null}
                </CardPanel>
              </Card>
            );
          })}
        </div>
      </section>
    </div>
  );
}
