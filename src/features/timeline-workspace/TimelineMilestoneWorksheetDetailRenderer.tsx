import { Trash2 } from "lucide-react";
import { Button } from "#/components/ui/button.tsx";
import type { MaterialPlanningPayload } from "#/features/material-planning/MaterialPlanningTab.tsx";
import type { BuildCollaborationRole } from "../../../convex/build_collaboration_model";
import type { ScopeRevisionSurfaceRoute } from "../submilestone-scope/SubmilestoneScopeRevisionSurface.tsx";
import { MilestoneExpandedTabs } from "./TimelineMilestoneWorksheetDetailTabs.tsx";
import type {
  SubMilestoneBankItem,
  SubMilestoneEditorResetVersions,
  TimelineDetailTab,
  TimelineMilestoneWorksheetContractorAssignment,
  TimelineMilestoneWorksheetContractorOption,
  TimelineMilestoneWorksheetRow,
  TimelineMilestoneWorksheetRowsChangeMeta,
  TimelineMilestoneWorksheetSubMilestone,
  TimelineScheduleDisplayMode,
  WorksheetContractorActions,
  WorksheetMode,
} from "./TimelineMilestoneWorksheetContracts.tsx";

export interface TimelineMilestoneWorksheetDetailRendererContext {
  addContractorAssignment: (
    rowKey: string,
    assignment: Omit<TimelineMilestoneWorksheetContractorAssignment, "id">
  ) => void;
  addSubMilestone: (rowKey: string, item?: SubMilestoneBankItem) => void;
  canDeleteMilestone: (row: TimelineMilestoneWorksheetRow) => boolean;
  changeActiveSubMilestone: (rowKey: string, subMilestoneId: string) => void;
  commitRows: () => void;
  contractorActions?: WorksheetContractorActions;
  contractorOptions: TimelineMilestoneWorksheetContractorOption[];
  createCostItem: (rowKey: string, payload: MaterialPlanningPayload) => unknown;
  deleteCostItem: (rowKey: string, itemId: string) => unknown;
  detailsSheetActiveTab: TimelineDetailTab;
  handleDetailsSheetTabChange: (tab: TimelineDetailTab) => void;
  mode: WorksheetMode;
  moveSubMilestone: (sourceRowKey: string, subMilestoneId: string, targetRowKey: string) => void;
  proposalSubmittedAt?: number;
  proposedStartDate?: string;
  removeContractorAssignment: (rowKey: string, assignmentId: string) => void;
  removeSubMilestone: (rowKey: string, subMilestoneId: string) => void;
  reportSubMilestoneEditorDirty: (rowKey: string, subMilestoneId: string, group: "fieldGuidance" | "scope", dirty: boolean) => void;
  rows: TimelineMilestoneWorksheetRow[];
  scheduleDisplayMode: TimelineScheduleDisplayMode;
  scopeRoute?: ScopeRevisionSurfaceRoute;
  scopeWorkosOrganizationId?: string;
  setPendingMilestoneDeleteKey: (key: string) => void;
  subMilestoneEditorResetVersions: SubMilestoneEditorResetVersions;
  updateCostItem: (rowKey: string, itemId: string, payload: MaterialPlanningPayload) => unknown;
  updateRow: (rowKey: string, patch: Partial<TimelineMilestoneWorksheetRow>, meta?: TimelineMilestoneWorksheetRowsChangeMeta) => void;
  updateSubMilestone: (rowKey: string, subMilestoneId: string, patch: Partial<TimelineMilestoneWorksheetSubMilestone>, meta?: TimelineMilestoneWorksheetRowsChangeMeta) => void | Promise<void>;
  viewerCapacity?: BuildCollaborationRole;
  resolveActiveSubMilestoneId: (rowKey: string) => string | undefined;
}

export function renderMilestoneDetailTabs({
  addContractorAssignment,
  addSubMilestone,
  canDeleteMilestone,
  changeActiveSubMilestone,
  commitRows,
  contractorActions,
  contractorOptions,
  createCostItem,
  deleteCostItem,
  detailsSheetActiveTab,
  handleDetailsSheetTabChange,
  mode,
  moveSubMilestone,
  proposalSubmittedAt,
  proposedStartDate,
  removeContractorAssignment,
  removeSubMilestone,
  reportSubMilestoneEditorDirty,
  row,
  rows,
  scheduleDisplayMode,
  scopeRoute,
  scopeWorkosOrganizationId,
  setPendingMilestoneDeleteKey,
  subMilestoneEditorResetVersions,
  updateCostItem,
  updateRow,
  updateSubMilestone,
  viewerCapacity,
  resolveActiveSubMilestoneId,
  placement = "expanded",
}: TimelineMilestoneWorksheetDetailRendererContext & {
  row: TimelineMilestoneWorksheetRow;
  placement?: "expanded" | "sheet";
}) {
    const activeSubMilestoneId = resolveActiveSubMilestoneId(row.key);
    const scopeEditorResetVersion = activeSubMilestoneId
      ? (subMilestoneEditorResetVersions[
          `${row.key}:${activeSubMilestoneId}:scope`
        ] ?? 0)
      : 0;

    return (
      <>
        <MilestoneExpandedTabs
          activeSubMilestoneId={activeSubMilestoneId}
          activeTab={placement === "sheet" ? detailsSheetActiveTab : undefined}
          contractorActions={contractorActions}
          contractorOptions={contractorOptions}
          mode={mode}
          moveTargetRows={rows.map(({ key, name }) => ({
            key,
            name,
          }))}
          onActiveSubMilestoneChange={(subMilestoneId) =>
            changeActiveSubMilestone(row.key, subMilestoneId)
          }
          onActiveTabChange={
            placement === "sheet" ? handleDetailsSheetTabChange : undefined
          }
          onAddContractorAssignment={(assignment) =>
            addContractorAssignment(row.key, assignment)
          }
          onAddSubMilestone={(item) => addSubMilestone(row.key, item)}
          onCommitField={commitRows}
          onCreateCostItem={(payload) => createCostItem(row.key, payload)}
          onDeleteCostItem={(itemId) => deleteCostItem(row.key, itemId)}
          onMoveSubMilestone={(subMilestoneId, targetRowKey) =>
            moveSubMilestone(row.key, subMilestoneId, targetRowKey)
          }
          onRemoveContractorAssignment={(assignmentId) =>
            removeContractorAssignment(row.key, assignmentId)
          }
          onRemoveSubMilestone={(subMilestoneId) =>
            removeSubMilestone(row.key, subMilestoneId)
          }
          onSubMilestoneEditorDirtyChange={reportSubMilestoneEditorDirty}
          onUpdateCostItem={(itemId, payload) =>
            updateCostItem(row.key, itemId, payload)
          }
          onUpdateFieldGuidance={(siteVisitGuidance) =>
            updateRow(row.key, { siteVisitGuidance })
          }
          onUpdateSubMilestone={(subMilestoneId, patch, meta) =>
            updateSubMilestone(row.key, subMilestoneId, patch, meta)
          }
          placement={placement}
          proposalSubmittedAt={proposalSubmittedAt}
          proposedStartDate={proposedStartDate}
          row={row}
          scheduleDisplayMode={scheduleDisplayMode}
          scopeEditorResetVersion={scopeEditorResetVersion}
          scopeRoute={scopeRoute}
          scopeWorkosOrganizationId={scopeWorkosOrganizationId}
          viewerCapacity={viewerCapacity}
        />
        {mode === "settings" && placement === "sheet" ? (
          <Button
            className="mt-4"
            data-testid={`timeline-settings-details-delete-${row.key}`}
            disabled={!canDeleteMilestone(row)}
            onClick={() => setPendingMilestoneDeleteKey(row.key)}
            title={
              canDeleteMilestone(row)
                ? undefined
                : "At least one milestone must remain included."
            }
            type="button"
            variant="destructive"
          >
            <Trash2 aria-hidden="true" />
            Delete milestone
          </Button>
        ) : null}
      </>
    );
  };
