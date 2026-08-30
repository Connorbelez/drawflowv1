"use client";

import { Plus } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Badge } from "#/components/ui/badge.tsx";
import { Button } from "#/components/ui/button.tsx";
import { Frame, FramePanel } from "#/components/ui/frame.tsx";
import {
  NativeSelect,
  NativeSelectOption,
} from "#/components/ui/native-select.tsx";
import {
  Sheet,
  SheetDescription,
  SheetHeader,
  SheetPanel,
  SheetPopup,
  SheetTitle,
} from "#/components/ui/sheet.tsx";
import { cn } from "#/lib/utils.ts";
import type { Id } from "../../../convex/_generated/dataModel";
import {
  formatCents,
  summarizeItems,
  totalForItem,
} from "./MaterialPlanningModel.ts";
import {
  MaterialItemCard,
  MaterialItemEditor,
  MaterialSummaryStrip,
  TOUCH_BUTTON_CLASS,
  TOUCH_SELECT_CLASS,
} from "./MaterialPlanningParts.tsx";

export type MaterialPlanningItemType = "equipment" | "material";
export type MaterialPlanningBudgetTreatment = "add" | "logOnly" | "maintain";

export interface MaterialPlanningSubmilestone {
  budgetCents?: number;
  canonicalId?: Id<"buildSubmilestones">;
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
  budgetSubmilestoneKey?: string;
  budgetTreatment?: MaterialPlanningBudgetTreatment;
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
  budgetSubmilestoneKey: null | string;
  budgetTreatment: MaterialPlanningBudgetTreatment;
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

export interface MaterialPlanningBudgetImpact {
  borrowerCoPayBps: number;
  proposalBudgetCents: number;
}

interface MaterialPlanningTabProps {
  actions?: MaterialPlanningActions;
  budgetImpact?: MaterialPlanningBudgetImpact;
  budgetTreatmentEnabled?: boolean;
  currencyCode?: "CAD" | "USD";
  defaultBudgetSubmilestoneKey?: string;
  defaultBudgetTreatment?: MaterialPlanningBudgetTreatment;
  focusedItemId?: string;
  items: MaterialPlanningItem[];
  lockBudgetTreatment?: boolean;
  milestones: MaterialPlanningMilestone[];
  onOpenSubmilestone?: (submilestoneId: Id<"buildSubmilestones">) => void;
  panelLayout?: "auto" | "stacked";
  readOnly?: boolean;
  scopeLabel: string;
  showChangeReason?: boolean;
  variant?: "embedded" | "full";
}

type ActiveMaterialEditor =
  | { mode: "create"; milestoneKey: string }
  | { itemId: string; mode: "edit" };

export function MaterialPlanningTab({
  actions,
  budgetImpact,
  budgetTreatmentEnabled = false,
  currencyCode = "USD",
  defaultBudgetSubmilestoneKey,
  defaultBudgetTreatment = "logOnly",
  focusedItemId,
  items,
  lockBudgetTreatment = false,
  panelLayout = "auto",
  onOpenSubmilestone,
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
  const [activeEditor, setActiveEditor] = useState<ActiveMaterialEditor | null>(
    null
  );
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
  useEffect(() => {
    if (!focusedItemId) {
      return;
    }
    const focusedItem = items.find((item) => item._id === focusedItemId);
    if (focusedItem) {
      setSelectedMilestoneKey(focusedItem.milestoneKey);
    }
  }, [focusedItemId, items]);
  const summary = useMemo(() => summarizeItems(items), [items]);
  const selectedMilestone =
    milestoneByKey.get(selectedMilestoneKey) ?? sortedMilestones[0];
  const selectedMilestoneItems = selectedMilestone
    ? (itemsByMilestone.get(selectedMilestone.key) ?? [])
    : [];
  const selectedMilestonePlannedCents = selectedMilestoneItems.reduce(
    (sum, item) => sum + totalForItem(item),
    0
  );
  const editable = !readOnly && Boolean(actions?.create);
  const editingItem =
    activeEditor?.mode === "edit"
      ? items.find((item) => item._id === activeEditor.itemId)
      : undefined;
  const editorMilestoneKey =
    activeEditor?.mode === "create"
      ? activeEditor.milestoneKey
      : editingItem?.milestoneKey;
  const editorMilestone = editorMilestoneKey
    ? milestoneByKey.get(editorMilestoneKey)
    : undefined;

  async function runCreate(payload: MaterialPlanningPayload) {
    if (!actions?.create) {
      return false;
    }
    setPending(true);
    setError("");
    try {
      await actions.create(payload);
      return true;
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Cost item save failed."
      );
      return false;
    } finally {
      setPending(false);
    }
  }

  async function runUpdate(
    item: MaterialPlanningItem,
    payload: MaterialPlanningPayload
  ) {
    if (!actions?.update) {
      return false;
    }
    setPending(true);
    setError("");
    try {
      await actions.update(item, payload);
      return true;
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Cost item update failed."
      );
      return false;
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
                      setActiveEditor(null);
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

          {selectedMilestone ? (
            <section
              aria-labelledby={`materials-${selectedMilestone.key}-heading`}
              className="grid gap-3"
            >
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                  <h3
                    className="font-semibold text-lg"
                    id={`materials-${selectedMilestone.key}-heading`}
                  >
                    {selectedMilestone.name}
                  </h3>
                  <p className="text-muted-foreground text-sm">
                    {selectedMilestoneItems.length} item
                    {selectedMilestoneItems.length === 1 ? "" : "s"} /{" "}
                    {formatCents(selectedMilestonePlannedCents)} cost-only
                    detail
                  </p>
                </div>
                <div className="flex flex-wrap items-center justify-end gap-2">
                  <Badge variant="outline">
                    {formatCents(selectedMilestone.budgetCents)}
                  </Badge>
                  {editable ? (
                    <Button
                      aria-label={`Add cost item to ${selectedMilestone.name}`}
                      className={TOUCH_BUTTON_CLASS}
                      onClick={() =>
                        setActiveEditor({
                          milestoneKey: selectedMilestone.key,
                          mode: "create",
                        })
                      }
                      size="sm"
                      type="button"
                    >
                      <Plus />
                      Add cost item
                    </Button>
                  ) : null}
                </div>
              </div>
              {selectedMilestoneItems.length === 0 ? (
                <Frame>
                  <FramePanel className="p-4 text-muted-foreground text-sm">
                    No material or equipment entries are attached to{" "}
                    {selectedMilestone.name}.
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
                  {selectedMilestoneItems.map((item) => (
                    <MaterialItemCard
                      canDelete={Boolean(actions?.delete) && !readOnly}
                      canEdit={Boolean(actions?.update) && !readOnly}
                      item={item}
                      key={item._id}
                      milestone={selectedMilestone}
                      onDelete={(reason) =>
                        void runDeleteWithReason(item, reason)
                      }
                      onEdit={() =>
                        setActiveEditor({ itemId: item._id, mode: "edit" })
                      }
                      pending={pending}
                    />
                  ))}
                </div>
              )}
            </section>
          ) : null}
        </div>

        <aside
          className={cn(
            "grid content-start gap-4",
            !embedded && "xl:sticky xl:top-20"
          )}
        >
          {selectedMilestone ? (
            <Frame>
              <FramePanel className="p-4">
                <h3 className="font-semibold text-sm">
                  Attached sub-milestones
                </h3>
                <div className="mt-3 flex flex-wrap gap-2">
                  {(selectedMilestone.submilestones ?? []).length > 0 ? (
                    selectedMilestone.submilestones?.map((submilestone) =>
                      submilestone.canonicalId && onOpenSubmilestone ? (
                        <Button
                          aria-label={`Open Sub-milestone ${submilestone.name}`}
                          key={submilestone.key}
                          onClick={() =>
                            onOpenSubmilestone(submilestone.canonicalId!)
                          }
                          size="sm"
                          type="button"
                          variant="ghost"
                        >
                          <Badge variant="outline">{submilestone.name}</Badge>
                        </Button>
                      ) : (
                        <Badge key={submilestone.key} variant="outline">
                          {submilestone.name}
                        </Badge>
                      )
                    )
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

      <Sheet
        onOpenChange={(open) => {
          if (!(open || pending)) {
            setActiveEditor(null);
          }
        }}
        open={Boolean(activeEditor)}
      >
        <SheetPopup className="sm:max-w-2xl" side="right" variant="inset">
          <SheetHeader>
            <SheetTitle>
              {activeEditor?.mode === "edit"
                ? "Edit cost item"
                : "Add cost item"}
            </SheetTitle>
            <SheetDescription>
              {editorMilestone
                ? `${editorMilestone.name} material and equipment detail. Enter the per-unit dollar amount; quantity controls the total.`
                : "Material and equipment detail. Enter the per-unit dollar amount; quantity controls the total."}
            </SheetDescription>
          </SheetHeader>
          <SheetPanel className="pb-20">
            {activeEditor?.mode === "edit" && editingItem ? (
              <MaterialItemEditor
                budgetImpact={budgetImpact}
                budgetTreatmentEnabled={budgetTreatmentEnabled}
                chrome="plain"
                currencyCode={currencyCode}
                defaultBudgetSubmilestoneKey={defaultBudgetSubmilestoneKey}
                defaultBudgetTreatment={defaultBudgetTreatment}
                item={editingItem}
                items={items}
                key={editingItem._id}
                lockBudgetTreatment={lockBudgetTreatment}
                milestones={sortedMilestones}
                onCancel={() => setActiveEditor(null)}
                onSubmit={async (payload) => {
                  const saved = await runUpdate(editingItem, payload);
                  if (saved) {
                    setActiveEditor(null);
                  }
                }}
                pending={pending}
                showChangeReason={showChangeReason}
                submitLabel="Save item"
              />
            ) : activeEditor?.mode === "create" ? (
              <MaterialItemEditor
                budgetImpact={budgetImpact}
                budgetTreatmentEnabled={budgetTreatmentEnabled}
                chrome="plain"
                currencyCode={currencyCode}
                defaultBudgetSubmilestoneKey={defaultBudgetSubmilestoneKey}
                defaultBudgetTreatment={defaultBudgetTreatment}
                items={items}
                key={activeEditor.milestoneKey}
                lockBudgetTreatment={lockBudgetTreatment}
                milestones={sortedMilestones}
                onCancel={() => setActiveEditor(null)}
                onSubmit={async (payload) => {
                  const saved = await runCreate(payload);
                  if (saved) {
                    setActiveEditor(null);
                  }
                }}
                pending={pending}
                selectedMilestoneKey={activeEditor.milestoneKey}
                showChangeReason={showChangeReason}
                submitLabel="Add item"
              />
            ) : null}
          </SheetPanel>
        </SheetPopup>
      </Sheet>
    </div>
  );
}
