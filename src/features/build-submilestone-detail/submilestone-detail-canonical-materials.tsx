"use client";

import { useMutation } from "convex/react";
import { ShieldAlert } from "lucide-react";
import { useRef } from "react";

import { Frame, FramePanel } from "#/components/ui/frame.tsx";
import { MaterialPlanningTab } from "../material-planning/MaterialPlanningTab.tsx";
import type {
  MaterialPlanningActions,
  MaterialPlanningItem,
  MaterialPlanningMilestone,
  MaterialPlanningPayload,
} from "../material-planning/MaterialPlanningTab.tsx";
import { api as apiRef } from "../../../convex/_generated/api";
import type {
  CanonicalWorkspaceBootstrap,
  CanonicalWorkspaceCollection,
  NavigationProps,
} from "./submilestone-detail-canonical-contracts.ts";
import {
  arrayValue,
  canMutate,
  capability,
  collectionRows,
  milestoneKeyFor,
  milestoneNameFor,
  numberValue,
  object,
  optionalNumber,
  revisionFor,
  stableCommandKey,
  stringValue,
  submilestoneKeyFor,
  submilestoneNameFor,
} from "./submilestone-detail-canonical-contracts.ts";

export function CanonicalMaterialsPanel({
  bootstrap,
  buildId,
  buildSubmilestoneId: _buildSubmilestoneId,
  collection,
  companionActionItemId: _companionActionItemId,
  onRetry,
  organizationId,
  readOnly,
  viewerCapacity: _viewerCapacity,
}: NavigationProps & {
  bootstrap: CanonicalWorkspaceBootstrap;
  collection: CanonicalWorkspaceCollection | undefined;
}) {
  const createItem = useMutation(
    apiRef.production_proposals.createActiveBuildCostItem
  );
  const updateItem = useMutation(
    apiRef.production_proposals.updateActiveBuildCostItem
  );
  const deleteItem = useMutation(
    apiRef.production_proposals.deleteActiveBuildCostItem
  );
  const materials = object(bootstrap.materials);
  const rows = collectionRows(collection);
  const projectedMaterials = arrayValue(materials.items);
  const submilestoneKey = submilestoneKeyFor(bootstrap);
  const milestoneKey = milestoneKeyFor(bootstrap);
  const workflowRevision = revisionFor(bootstrap);
  const hasRevision = workflowRevision !== undefined;
  const commandKeysRef = useRef(new Map<string, string>());
  const budgetCents = numberValue(
    object(bootstrap.overview).budgetCents ?? materials.totalBudgetCents,
    0
  );
  const items = [
    ...projectedMaterials.map((value, index) =>
      toMaterialItem(object(value), milestoneKey, submilestoneKey, index)
    ),
    ...rows.map((value, index) =>
      toMaterialItem(
        value,
        milestoneKey,
        submilestoneKey,
        projectedMaterials.length + index
      )
    ),
  ].filter(
    (item, index, all) =>
      all.findIndex((candidate) => candidate._id === item._id) === index
  );
  const materialRead = capability(bootstrap, "readMaterials").allowed;
  const materialCapability = capability(bootstrap, "updateMaterials");
  const materialWrite =
    hasRevision && canMutate(bootstrap, readOnly, "updateMaterials");
  const milestone: MaterialPlanningMilestone = {
    budgetCents,
    key: milestoneKey,
    name: milestoneNameFor(bootstrap),
    order: 0,
    submilestones: [
      {
        budgetCents,
        key: submilestoneKey,
        name: submilestoneNameFor(bootstrap),
        order: 0,
      },
    ],
  };
  const actions: MaterialPlanningActions | undefined = materialWrite
    ? {
        create: async (payload: MaterialPlanningPayload) => {
          const scopedPayload = {
            ...withoutActiveBuildBudgetTarget(payload),
            buildId,
            relevantSubmilestoneKeys: scopedRelevantSubmilestoneKeys(
              payload,
              submilestoneKey
            ),
            submilestoneKey,
            workosOrganizationId: organizationId,
          };
          const fingerprint = JSON.stringify(scopedPayload);
          const idempotencyKey = stableCommandKey(
            commandKeysRef.current,
            "submilestone-material-create",
            fingerprint
          );
          const result = await createItem({
            ...scopedPayload,
            expectedRevision: workflowRevision,
            idempotencyKey,
          });
          commandKeysRef.current.delete(fingerprint);
          onRetry?.();
          return result;
        },
        delete: async (item, reason) => {
          assertCanonicalMaterialId(item._id);
          const scopedPayload = {
            buildId,
            itemId: item._id,
            milestoneKey,
            reason,
            submilestoneKey,
            workosOrganizationId: organizationId,
          };
          const fingerprint = JSON.stringify(scopedPayload);
          const idempotencyKey = stableCommandKey(
            commandKeysRef.current,
            "submilestone-material-delete",
            fingerprint
          );
          const result = await deleteItem({
            ...scopedPayload,
            expectedRevision: workflowRevision,
            idempotencyKey,
          } as Parameters<typeof deleteItem>[0]);
          commandKeysRef.current.delete(fingerprint);
          onRetry?.();
          return result;
        },
        update: async (item, payload) => {
          assertCanonicalMaterialId(item._id);
          const scopedPayload = {
            ...withoutActiveBuildBudgetTarget(payload),
            // Active-build editors do not expose budget-target controls, but
            // the canonical record still owns those values. Carry the
            // existing target/treatment through unchanged so an edit cannot
            // accidentally drop the server's budget semantics.
            budgetSubmilestoneKey: item.budgetSubmilestoneKey ?? null,
            budgetTreatment: item.budgetTreatment ?? "add",
            buildId,
            itemId: item._id,
            relevantSubmilestoneKeys: scopedRelevantSubmilestoneKeys(
              payload,
              submilestoneKey
            ),
            submilestoneKey,
            workosOrganizationId: organizationId,
          };
          const fingerprint = JSON.stringify(scopedPayload);
          const idempotencyKey = stableCommandKey(
            commandKeysRef.current,
            "submilestone-material-update",
            fingerprint
          );
          const result = await updateItem({
            ...scopedPayload,
            expectedRevision: workflowRevision,
            idempotencyKey,
          } as Parameters<typeof updateItem>[0]);
          commandKeysRef.current.delete(fingerprint);
          onRetry?.();
          return result;
        },
      }
    : undefined;

  if (!materialRead) {
    return (
      <Frame data-testid="submilestone-materials-collection">
        <FramePanel className="flex items-center gap-2 p-4 text-muted-foreground text-sm">
          <ShieldAlert aria-hidden="true" className="size-4" />
          Materials are unavailable for this Build viewer.
        </FramePanel>
      </Frame>
    );
  }
  return (
    <div data-testid="submilestone-materials-collection">
      {!(readOnly || hasRevision) && materialCapability.allowed ? (
        <Frame className="mb-3">
          <FramePanel
            className="p-3 text-muted-foreground text-sm"
            role="status"
          >
            Refresh this Sub-milestone before changing Materials; its current
            version is unavailable.
          </FramePanel>
        </Frame>
      ) : null}
      <MaterialPlanningTab
        actions={actions}
        // Active-build cost items inherit additive budget behavior from the
        // server. Proposal-only target/treatment controls stay hidden, while
        // existing projected values remain in update payloads.
        budgetTreatmentEnabled={false}
        currencyCode="CAD"
        items={items}
        milestones={[milestone]}
        panelLayout="stacked"
        readOnly={!materialWrite}
        scopeLabel={`${milestone.name} · ${submilestoneNameFor(bootstrap)}`}
        showChangeReason
        variant="embedded"
      />
    </div>
  );
}

function assertCanonicalMaterialId(itemId: string) {
  if (itemId.startsWith("legacy-material:")) {
    throw new Error(
      "This Material record has no canonical identity. Refresh the Sub-milestone before editing or deleting it."
    );
  }
}

function withoutActiveBuildBudgetTarget(payload: MaterialPlanningPayload) {
  const {
    budgetSubmilestoneKey: _budgetSubmilestoneKey,
    budgetTreatment: _budgetTreatment,
    ...activeBuildPayload
  } = payload;
  return activeBuildPayload;
}

function scopedRelevantSubmilestoneKeys(
  payload: MaterialPlanningPayload,
  submilestoneKey: string
) {
  return [submilestoneKey, ...payload.relevantSubmilestoneKeys].filter(
    (key, index, keys) => key && keys.indexOf(key) === index
  );
}

function toMaterialItem(
  value: Record<string, unknown>,
  defaultMilestoneKey = "",
  _defaultSubmilestoneKey = "",
  rowIndex = 0
): MaterialPlanningItem {
  const itemType =
    stringValue(value.itemType ?? value.kind, "material") === "equipment"
      ? "equipment"
      : "material";
  const id = stringValue(
    value._id ?? value.id ?? value.itemId,
    `legacy-material:${defaultMilestoneKey}:${stringValue(
      value.itemKey ?? value.title ?? value.name,
      itemType
    )}:${stringValue(value.createdAt ?? value.updatedAt, "unknown")}:${rowIndex}`
  );
  const budgetTarget = object(value.budgetTarget);
  const submilestoneKey = stringValue(
    value.budgetSubmilestoneKey ??
      value.submilestoneKey ??
      value.budgetTargetKey ??
      budgetTarget.submilestoneKey ??
      budgetTarget.key
  );
  const projectedBudgetTreatment = value.budgetTreatment;
  return {
    _id: id,
    budgetSubmilestoneKey: submilestoneKey || undefined,
    budgetTreatment:
      projectedBudgetTreatment === "maintain" ||
      projectedBudgetTreatment === "logOnly"
        ? projectedBudgetTreatment
        : "add",
    costCents: numberValue(
      value.costCents ?? value.amountCents ?? value.totalCents,
      0
    ),
    description: stringValue(value.description ?? value.detail) || undefined,
    itemKey: stringValue(value.itemKey) || undefined,
    itemType,
    milestoneKey: stringValue(value.milestoneKey, defaultMilestoneKey),
    quantity: numberValue(value.quantity, 1),
    relevantSubmilestoneKeys: arrayValue(value.relevantSubmilestoneKeys).filter(
      (key): key is string => typeof key === "string"
    ),
    supplier: stringValue(value.supplier) || undefined,
    title: stringValue(
      value.title,
      itemType === "equipment" ? "Equipment" : "Material"
    ),
    totalCents: optionalNumber(value.totalCents),
    updatedAt: optionalNumber(value.updatedAt),
  };
}
