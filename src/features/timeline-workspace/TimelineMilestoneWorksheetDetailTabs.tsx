import type { MaterialPlanningPayload } from "#/features/material-planning/MaterialPlanningTab.tsx";
import { useCallback } from "react";
import { Tabs, TabsList, TabsPanel, TabsTab } from "#/components/ui/tabs.tsx";
import { SubmilestoneFieldGuidanceEditor } from "../submilestone-guidance/SubmilestoneFieldGuidanceEditor.tsx";
import type { ScopeRevisionSurfaceRoute } from "../submilestone-scope/SubmilestoneScopeRevisionSurface.tsx";
import type { BuildCollaborationRole } from "../../../convex/build_collaboration_model";
import {
  SubMilestoneDetailEditor,
  SubMilestoneEditor,
} from "./TimelineMilestoneWorksheetEditors.tsx";
import { ContractorAssignmentEditor } from "./TimelineMilestoneWorksheetContractors.tsx";
import { FieldGuidanceEditor } from "./TimelineMilestoneWorksheetGuidance.tsx";
import { MaterialCostItemsEditor } from "./TimelineMilestoneWorksheetMaterials.tsx";
import {
  type MilestoneMoveTarget,
  type SubMilestoneBankItem,
  type TimelineDetailTab,
  type TimelineMilestoneWorksheetContractorAssignment,
  type TimelineMilestoneWorksheetContractorOption,
  type TimelineMilestoneWorksheetRow,
  type TimelineMilestoneWorksheetRowsChangeMeta,
  type TimelineMilestoneWorksheetSubMilestone,
  type TimelineScheduleDisplayMode,
  type WorksheetContractorActions,
  type WorksheetMode,
} from "./TimelineMilestoneWorksheetContracts.tsx";
import { sanitizeSubMilestoneName } from "./TimelineMilestoneWorksheetContracts.tsx";
import { cn } from "#/lib/utils.ts";
import type { SiteVisitGuidanceHtml } from "#/lib/site-visit-guidance.ts";

export function SubMilestoneFocusedTabs({
  activeTab,
  contractorActions,
  contractorOptions,
  fieldGuidanceEditorResetVersion = 0,
  mode,
  onActiveTabChange,
  onAddContractorAssignment,
  onCommitField,
  onCreateCostItem,
  onDeleteCostItem,
  onRemoveContractorAssignment,
  onRemoveSubMilestone,
  onSubMilestoneEditorDirtyChange,
  onUpdateCostItem,
  onUpdateSubMilestone,
  proposalSubmittedAt,
  proposedStartDate,
  row,
  scheduleDisplayMode,
  subMilestone,
  scopeEditorResetVersion = 0,
  scopeRoute,
  scopeWorkosOrganizationId,
  viewerCapacity,
}: {
  activeTab?: TimelineDetailTab;
  contractorActions?: WorksheetContractorActions;
  contractorOptions: TimelineMilestoneWorksheetContractorOption[];
  fieldGuidanceEditorResetVersion?: number;
  mode: WorksheetMode;
  onActiveTabChange?: (tab: TimelineDetailTab) => void;
  onAddContractorAssignment: (
    assignment: Omit<TimelineMilestoneWorksheetContractorAssignment, "id">
  ) => void;
  onCommitField: () => void;
  onCreateCostItem: (payload: MaterialPlanningPayload) => unknown;
  onDeleteCostItem: (itemId: string) => unknown;
  onRemoveContractorAssignment: (assignmentId: string) => void;
  onRemoveSubMilestone: (subMilestoneId: string) => void;
  onSubMilestoneEditorDirtyChange: (
    rowKey: string,
    subMilestoneId: string,
    group: "fieldGuidance" | "scope",
    dirty: boolean
  ) => void;
  onUpdateCostItem: (
    itemId: string,
    payload: MaterialPlanningPayload
  ) => unknown;
  onUpdateSubMilestone: (
    subMilestoneId: string,
    patch: Partial<TimelineMilestoneWorksheetSubMilestone>,
    meta?: TimelineMilestoneWorksheetRowsChangeMeta
  ) => void | Promise<void>;
  proposalSubmittedAt?: number;
  proposedStartDate?: string;
  row: TimelineMilestoneWorksheetRow;
  scheduleDisplayMode: TimelineScheduleDisplayMode;
  subMilestone: TimelineMilestoneWorksheetSubMilestone;
  scopeEditorResetVersion?: number;
  scopeRoute?: ScopeRevisionSurfaceRoute;
  scopeWorkosOrganizationId?: string;
  viewerCapacity?: BuildCollaborationRole;
}) {
  const subMilestoneName = sanitizeSubMilestoneName(subMilestone.name);
  const reportScopeDirty = useCallback(
    (dirty: boolean) =>
      onSubMilestoneEditorDirtyChange(
        row.key,
        subMilestone.id,
        "scope",
        dirty
      ),
    [onSubMilestoneEditorDirtyChange, row.key, subMilestone.id]
  );
  const reportFieldGuidanceDirty = useCallback(
    (dirty: boolean) =>
      onSubMilestoneEditorDirtyChange(
        row.key,
        subMilestone.id,
        "fieldGuidance",
        dirty
      ),
    [onSubMilestoneEditorDirtyChange, row.key, subMilestone.id]
  );

  return (
    <Tabs
      className="timeline-blueprint-expanded-tabs timeline-submilestone-focused-tabs is-sheet"
      defaultValue={activeTab === undefined ? "scope" : undefined}
      onValueChange={
        onActiveTabChange
          ? (value) => onActiveTabChange(value as TimelineDetailTab)
          : undefined
      }
      value={activeTab}
    >
      <div className="timeline-blueprint-expanded-tabs-header">
        <TabsList
          aria-label={`${subMilestoneName} sub-milestone sections`}
          className="timeline-blueprint-expanded-tabs-list"
          variant="underline"
        >
          <TabsTab value="scope">Scope</TabsTab>
          {mode === "setup" ? (
            <>
              <TabsTab value="contractors">Contractors</TabsTab>
              <TabsTab value="materials">Materials</TabsTab>
            </>
          ) : null}
          <TabsTab value="field-guidance">Field Guidance</TabsTab>
        </TabsList>
      </div>
      <TabsPanel
        className="timeline-blueprint-expanded-tab-panel"
        data-testid={`timeline-focused-submilestone-scope-panel-${subMilestone.id}`}
        keepMounted
        value="scope"
      >
        <section
          aria-label={`${subMilestoneName} scope`}
          className="timeline-submilestone-focused-pane timeline-submilestone-detail-pane"
        >
          <SubMilestoneDetailEditor
            activeSubMilestone={subMilestone}
            key={`focused-scope-${subMilestone.id}-${scopeEditorResetVersion}`}
            mode={mode}
            onCommitField={onCommitField}
            onDirtyChange={reportScopeDirty}
            onRemoveSubMilestone={onRemoveSubMilestone}
            onUpdateSubMilestone={onUpdateSubMilestone}
            proposalSubmittedAt={proposalSubmittedAt}
            proposedStartDate={proposedStartDate}
            row={row}
            scheduleDisplayMode={scheduleDisplayMode}
            scopeRoute={scopeRoute}
            scopeWorkosOrganizationId={scopeWorkosOrganizationId}
            viewerCapacity={viewerCapacity}
          />
        </section>
      </TabsPanel>
      {mode === "setup" ? (
        <>
          <TabsPanel
            className="timeline-blueprint-expanded-tab-panel"
            data-testid={`timeline-focused-submilestone-contractors-panel-${subMilestone.id}`}
            value="contractors"
          >
            <ContractorAssignmentEditor
              contractorActions={contractorActions}
              contractorOptions={contractorOptions}
              onAddAssignment={onAddContractorAssignment}
              onRemoveAssignment={onRemoveContractorAssignment}
              row={row}
              scopeName={subMilestoneName}
              scopeSubMilestoneId={subMilestone.id}
            />
          </TabsPanel>
          <TabsPanel
            className="timeline-blueprint-expanded-tab-panel"
            data-testid={`timeline-focused-submilestone-materials-panel-${subMilestone.id}`}
            value="materials"
          >
            <MaterialCostItemsEditor
              onCreateCostItem={onCreateCostItem}
              onDeleteCostItem={onDeleteCostItem}
              onUpdateCostItem={onUpdateCostItem}
              row={row}
              scopeName={subMilestoneName}
              scopeSubMilestoneId={subMilestone.id}
            />
          </TabsPanel>
        </>
      ) : null}
      <TabsPanel
        className="timeline-blueprint-expanded-tab-panel"
        data-testid={`timeline-focused-submilestone-field-guidance-panel-${subMilestone.id}`}
        keepMounted
        value="field-guidance"
      >
        <SubMilestoneFieldGuidanceEditor
          key={`focused-field-guidance-${subMilestone.id}-${fieldGuidanceEditorResetVersion}`}
          onDirtyChange={reportFieldGuidanceDirty}
          onUpdateSubMilestone={onUpdateSubMilestone}
          row={row}
          subMilestone={subMilestone}
        />
      </TabsPanel>
    </Tabs>
  );
}

export function SubMilestoneFieldGuidanceEditor({
  onDirtyChange,
  onUpdateSubMilestone,
  row,
  subMilestone,
}: {
  onDirtyChange: (dirty: boolean) => void;
  onUpdateSubMilestone: (
    subMilestoneId: string,
    patch: Partial<TimelineMilestoneWorksheetSubMilestone>,
    meta?: TimelineMilestoneWorksheetRowsChangeMeta
  ) => void | Promise<void>;
  row: TimelineMilestoneWorksheetRow;
  subMilestone: TimelineMilestoneWorksheetSubMilestone;
}) {
  return (
    <SubmilestoneFieldGuidanceEditor
      canEdit
      className="timeline-submilestone-focused-guidance"
      guidance={subMilestone.fieldGuidance}
      id={subMilestone.id}
      onDirtyChange={onDirtyChange}
      onSave={(guidance) =>
        onUpdateSubMilestone(
          subMilestone.id,
          { fieldGuidance: guidance },
          {
            commit: true,
            save: {
              group: "fieldGuidance",
              rowKey: row.key,
              subMilestoneId: subMilestone.id,
            },
          },
        )
      }
      rowName={row.name}
      sectionTestId={`timeline-focused-submilestone-guidance-${subMilestone.id}`}
      subMilestoneName={sanitizeSubMilestoneName(subMilestone.name)}
      testIdPrefix="timeline-setup-submilestone"
    />
  );
}

export function MilestoneExpandedTabs({
  activeSubMilestoneId,
  activeTab,
  contractorActions,
  contractorOptions,
  scopeEditorResetVersion = 0,
  moveTargetRows,
  onAddContractorAssignment,
  onActiveSubMilestoneChange,
  onActiveTabChange,
  onAddSubMilestone,
  onCommitField,
  onCreateCostItem,
  onDeleteCostItem,
  onMoveSubMilestone,
  onRemoveContractorAssignment,
  onRemoveSubMilestone,
  onSubMilestoneEditorDirtyChange,
  onUpdateCostItem,
  onUpdateFieldGuidance,
  onUpdateSubMilestone,
  mode,
  placement = "expanded",
  proposalSubmittedAt,
  proposedStartDate,
  row,
  scheduleDisplayMode,
  scopeRoute,
  scopeWorkosOrganizationId,
  viewerCapacity,
}: {
  activeSubMilestoneId?: string;
  activeTab?: TimelineDetailTab;
  contractorActions?: WorksheetContractorActions;
  contractorOptions: TimelineMilestoneWorksheetContractorOption[];
  scopeEditorResetVersion?: number;
  mode: WorksheetMode;
  moveTargetRows: MilestoneMoveTarget[];
  onActiveSubMilestoneChange: (subMilestoneId: string) => void;
  onActiveTabChange?: (tab: TimelineDetailTab) => void;
  onAddContractorAssignment: (
    assignment: Omit<TimelineMilestoneWorksheetContractorAssignment, "id">
  ) => void;
  onAddSubMilestone: (item?: SubMilestoneBankItem) => void;
  onCommitField: () => void;
  onCreateCostItem: (payload: MaterialPlanningPayload) => unknown;
  onDeleteCostItem: (itemId: string) => unknown;
  onMoveSubMilestone: (subMilestoneId: string, targetRowKey: string) => void;
  onRemoveContractorAssignment: (assignmentId: string) => void;
  onRemoveSubMilestone: (subMilestoneId: string) => void;
  onSubMilestoneEditorDirtyChange: (
    rowKey: string,
    subMilestoneId: string,
    group: "fieldGuidance" | "scope",
    dirty: boolean
  ) => void;
  onUpdateCostItem: (
    itemId: string,
    payload: MaterialPlanningPayload
  ) => unknown;
  onUpdateFieldGuidance: (guidance: SiteVisitGuidanceHtml) => void;
  onUpdateSubMilestone: (
    subMilestoneId: string,
    patch: Partial<TimelineMilestoneWorksheetSubMilestone>,
    meta?: TimelineMilestoneWorksheetRowsChangeMeta
  ) => void | Promise<void>;
  placement?: "expanded" | "sheet";
  proposalSubmittedAt?: number;
  proposedStartDate?: string;
  row: TimelineMilestoneWorksheetRow;
  scheduleDisplayMode: TimelineScheduleDisplayMode;
  scopeRoute?: ScopeRevisionSurfaceRoute;
  scopeWorkosOrganizationId?: string;
  viewerCapacity?: BuildCollaborationRole;
}) {
  return (
    <Tabs
      className={cn(
        "timeline-blueprint-expanded-tabs",
        placement === "sheet" && "is-sheet"
      )}
      defaultValue={activeTab === undefined ? "submilestones" : undefined}
      onValueChange={
        onActiveTabChange
          ? (value) => onActiveTabChange(value as TimelineDetailTab)
          : undefined
      }
      value={activeTab}
    >
      <div className="timeline-blueprint-expanded-tabs-header">
        <TabsList
          aria-label={`${row.name} expanded milestone sections`}
          className="timeline-blueprint-expanded-tabs-list"
          variant="underline"
        >
          <TabsTab value="submilestones">Sub-milestones</TabsTab>
          {mode === "setup" ? (
            <>
              <TabsTab value="contractors">Contractors</TabsTab>
              <TabsTab value="materials">Materials</TabsTab>
            </>
          ) : null}
          <TabsTab value="field-guidance">Field Guidance</TabsTab>
        </TabsList>
      </div>
      <TabsPanel
        className="timeline-blueprint-expanded-tab-panel"
        data-testid={`timeline-expanded-submilestones-panel-${row.key}`}
        keepMounted
        value="submilestones"
      >
        <SubMilestoneEditor
          activeSubMilestoneId={activeSubMilestoneId}
          mode={mode}
          moveTargetRows={moveTargetRows}
          onActiveSubMilestoneChange={onActiveSubMilestoneChange}
          onAddSubMilestone={onAddSubMilestone}
          onCommitField={onCommitField}
          onMoveSubMilestone={onMoveSubMilestone}
          onRemoveSubMilestone={onRemoveSubMilestone}
          onSubMilestoneEditorDirtyChange={onSubMilestoneEditorDirtyChange}
          onUpdateSubMilestone={onUpdateSubMilestone}
          proposalSubmittedAt={proposalSubmittedAt}
          proposedStartDate={proposedStartDate}
          row={row}
          scheduleDisplayMode={scheduleDisplayMode}
          scopeEditorResetVersion={scopeEditorResetVersion}
          scopeRoute={scopeRoute}
          scopeWorkosOrganizationId={scopeWorkosOrganizationId}
          viewerCapacity={viewerCapacity}
        />
      </TabsPanel>
      {mode === "setup" ? (
        <>
          <TabsPanel
            className="timeline-blueprint-expanded-tab-panel"
            data-testid={`timeline-expanded-contractors-panel-${row.key}`}
            value="contractors"
          >
            <ContractorAssignmentEditor
              contractorActions={contractorActions}
              contractorOptions={contractorOptions}
              onAddAssignment={onAddContractorAssignment}
              onRemoveAssignment={onRemoveContractorAssignment}
              row={row}
            />
          </TabsPanel>
          <TabsPanel
            className="timeline-blueprint-expanded-tab-panel"
            data-testid={`timeline-expanded-materials-panel-${row.key}`}
            value="materials"
          >
            <MaterialCostItemsEditor
              onCreateCostItem={onCreateCostItem}
              onDeleteCostItem={onDeleteCostItem}
              onUpdateCostItem={onUpdateCostItem}
              row={row}
            />
          </TabsPanel>
        </>
      ) : null}
      <TabsPanel
        className="timeline-blueprint-expanded-tab-panel"
        data-testid={`timeline-expanded-field-guidance-panel-${row.key}`}
        value="field-guidance"
      >
        <FieldGuidanceEditor onUpdate={onUpdateFieldGuidance} row={row} />
      </TabsPanel>
    </Tabs>
  );
}
