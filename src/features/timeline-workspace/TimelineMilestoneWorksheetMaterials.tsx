import { Badge } from "#/components/ui/badge.tsx";
import {
  MaterialPlanningTab,
  type MaterialPlanningPayload,
} from "#/features/material-planning/MaterialPlanningTab.tsx";
import {
  worksheetCostItemsToMaterialItems,
  worksheetRowToMaterialMilestone,
  worksheetRowToScopedMaterialMilestone,
  type TimelineMilestoneWorksheetRow,
} from "./TimelineMilestoneWorksheetContracts.tsx";

export function MaterialCostItemsEditor({
  onCreateCostItem,
  onDeleteCostItem,
  onUpdateCostItem,
  row,
  scopeName,
  scopeSubMilestoneId,
}: {
  onCreateCostItem: (payload: MaterialPlanningPayload) => unknown;
  onDeleteCostItem: (itemId: string) => unknown;
  onUpdateCostItem: (
    itemId: string,
    payload: MaterialPlanningPayload
  ) => unknown;
  row: TimelineMilestoneWorksheetRow;
  scopeName?: string;
  scopeSubMilestoneId?: string;
}) {
  const scopedSubMilestone = scopeSubMilestoneId
    ? row.subMilestoneDetails.find(
        (subMilestone) => subMilestone.id === scopeSubMilestoneId
      )
    : undefined;
  const materialItems = worksheetCostItemsToMaterialItems(row).filter((item) =>
    scopeSubMilestoneId
      ? item.relevantSubmilestoneKeys.includes(scopeSubMilestoneId)
      : true
  );
  const materialMilestone = scopedSubMilestone
    ? worksheetRowToScopedMaterialMilestone(row, scopedSubMilestone)
    : worksheetRowToMaterialMilestone(row);
  const costItemCount = materialItems.length;
  const applyMaterialScope = (
    payload: MaterialPlanningPayload,
    existingSubMilestoneIds: string[] = []
  ): MaterialPlanningPayload =>
    scopeSubMilestoneId
      ? {
          ...payload,
          budgetSubmilestoneKey:
            payload.budgetTreatment === "logOnly" ? null : scopeSubMilestoneId,
          milestoneKey: row.key,
          relevantSubmilestoneKeys: [
            ...new Set([scopeSubMilestoneId, ...existingSubMilestoneIds]),
          ],
        }
      : payload;

  return (
    <section
      aria-label={`${scopeName ?? row.name} materials and equipment`}
      className="timeline-blueprint-planning-pane timeline-blueprint-planning-pane-materials"
    >
      <div className="timeline-blueprint-planning-pane-heading">
        <div>
          <Badge className="timeline-blueprint-mini-badge" variant="outline">
            Materials
          </Badge>
          <strong>
            {scopeName
              ? `${scopeName} materials`
              : "Build materials and equipment"}
          </strong>
          <p>
            {scopeName
              ? "Cost-only entries stay attached to this sub-milestone."
              : "Cost-only entries stay attached to this milestone and its sub-milestones."}
          </p>
        </div>
        <span className="timeline-blueprint-planning-count">
          {costItemCount} item{costItemCount === 1 ? "" : "s"}
        </span>
      </div>
      <div className="timeline-blueprint-material-planning">
        <MaterialPlanningTab
          actions={{
            create: (payload) => onCreateCostItem(applyMaterialScope(payload)),
            delete: (item) => onDeleteCostItem(item._id),
            update: (item, payload) =>
              onUpdateCostItem(
                item._id,
                applyMaterialScope(payload, item.relevantSubmilestoneKeys)
              ),
          }}
          items={materialItems}
          milestones={[materialMilestone]}
          budgetTreatmentEnabled
          defaultBudgetSubmilestoneKey={scopeSubMilestoneId}
          defaultBudgetTreatment="logOnly"
          panelLayout="stacked"
          scopeLabel={scopeName ? "Sub-milestone" : "Milestone"}
          showChangeReason={false}
          variant="embedded"
        />
      </div>
    </section>
  );
}
