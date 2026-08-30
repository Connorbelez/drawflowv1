import type { Table as ReactTable } from "@tanstack/react-table";
import { flexRender } from "@tanstack/react-table";
import type { Dispatch, ReactNode, SetStateAction } from "react";
import { ChevronRight, Plus } from "lucide-react";
import {
  AlertDialog,
  AlertDialogClose,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "#/components/ui/alert-dialog.tsx";
import { Button } from "#/components/ui/button.tsx";
import { Group, GroupText } from "#/components/ui/group.tsx";
import {
  Sheet,
  SheetDescription,
  SheetHeader,
  SheetPanel,
  SheetPopup,
  SheetTitle,
} from "#/components/ui/sheet.tsx";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "#/components/ui/table.tsx";
import { Tabs, TabsList, TabsPanel, TabsTab } from "#/components/ui/tabs.tsx";
import { Toggle } from "#/components/ui/toggle.tsx";
import { formatCurrency } from "#/features/builder-proposal-demo/template-helpers.ts";
import type { MaterialPlanningPayload } from "#/features/material-planning/MaterialPlanningTab.tsx";
import { cn } from "#/lib/utils.ts";
import { restrictToVerticalAxis } from "@dnd-kit/modifiers";
import { Sortable, SortableItem } from "#/components/reui/sortable.tsx";
import type { BuildCollaborationRole } from "../../../convex/build_collaboration_model";
import {
  formatBps,
  MetricPill,
  type PendingUnsavedNavigation,
  type SubMilestoneEditorResetVersions,
  type TimelineDetailTab,
  type TimelineDetailsSheetTarget,
  type TimelineMilestoneWorksheetContractorAssignment,
  type TimelineMilestoneWorksheetContractorOption,
  type TimelineMilestoneWorksheetRow,
  type TimelineMilestoneWorksheetRowsChangeMeta,
  type TimelineMilestoneWorksheetSubMilestone,
  type TimelineScheduleDisplayMode,
  type WorksheetContractorActions,
  type WorksheetMode,
} from "./TimelineMilestoneWorksheetContracts.tsx";
import { getExpandedRowId } from "./TimelineMilestoneWorksheetColumns.tsx";
import { MilestoneSummaryTable } from "./TimelineMilestoneWorksheetSummaryTable.tsx";
import { SubMilestoneFocusedTabs } from "./TimelineMilestoneWorksheetDetailTabs.tsx";

export interface TimelineMilestoneWorksheetViewProps {
  addContractorAssignment: (
    rowKey: string,
    assignment: Omit<TimelineMilestoneWorksheetContractorAssignment, "id">
  ) => void;
  addCustomMilestone: () => void;
  addSubMilestone: (rowKey: string) => void;
  cascadeBudgetEdits: boolean;
  cashText?: string;
  className?: string;
  closeDetailsSheet: () => void;
  commitBudgetEdit: (rowKey: string) => void;
  commitRows: () => void;
  contractorActions?: WorksheetContractorActions;
  contractorOptions: TimelineMilestoneWorksheetContractorOption[];
  createCostItem: (rowKey: string, payload: MaterialPlanningPayload) => unknown;
  customMilestoneName: string;
  deleteCostItem: (rowKey: string, itemId: string) => unknown;
  deleteMilestone: (rowKey: string) => void;
  detailsSheetActiveTab: TimelineDetailTab;
  detailsSheetDescription: string;
  detailsSheetOpen: boolean;
  detailsSheetRow: TimelineMilestoneWorksheetRow | null;
  detailsSheetSubMilestone: TimelineMilestoneWorksheetSubMilestone | null;
  detailsSheetTarget: TimelineDetailsSheetTarget | null;
  detailsSheetTestId?: string;
  detailsSheetTitle: string;
  error?: string;
  footerExtra?: ReactNode;
  handleDetailsSheetTabChange: (tab: TimelineDetailTab) => void;
  handleWorksheetViewChange: (value: string) => void;
  includedBudgetCents: number;
  includedRows: TimelineMilestoneWorksheetRow[];
  keyboardInstructionsId: string;
  leadingContent?: ReactNode;
  mode: WorksheetMode;
  moveSummarySubMilestone: (activeIndex: number, overIndex: number) => void;
  onBack?: () => void;
  onCascadeBudgetEditsChange?: (enabled: boolean) => void;
  onComplete?: (options: { redirectToDurableRoute: boolean }) => void;
  onReset?: () => void;
  onScheduleDisplayModeChange?: (mode: TimelineScheduleDisplayMode) => void;
  openDetailsSheet: (
    rowKey: string,
    subMilestoneId?: string,
    tab?: TimelineDetailTab
  ) => void;
  planningFocusScopeKey?: string;
  projectAddress?: string;
  proposedStartDate?: string;
  proposalSubmittedAt?: number;
  pendingMilestoneDeleteRow: TimelineMilestoneWorksheetRow | null;
  pendingMilestoneDeleteCanDelete: boolean;
  pendingMilestoneDeleteSource: "finalSubMilestone" | "milestone";
  pendingUnsavedNavigation: PendingUnsavedNavigation | null;
  reportSubMilestoneEditorDirty: (
    rowKey: string,
    subMilestoneId: string,
    group: "fieldGuidance" | "scope",
    dirty: boolean
  ) => void;
  removeContractorAssignment: (rowKey: string, assignmentId: string) => void;
  removeSubMilestone: (rowKey: string, subMilestoneId: string) => void;
  renderMilestoneDetailTabs: (
    row: TimelineMilestoneWorksheetRow,
    placement?: "expanded" | "sheet"
  ) => ReactNode;
  reorderRows: (activeIndex: number, overIndex: number) => void;
  requestMilestoneDelete: (rowKey: string) => void;
  requestUnsavedNavigation: (action: () => void) => void;
  rows: TimelineMilestoneWorksheetRow[];
  scheduleDisplayMode: TimelineScheduleDisplayMode;
  scopeRoute?: import("../submilestone-scope/SubmilestoneScopeRevisionSurface.tsx").ScopeRevisionSurfaceRoute;
  scopeWorkosOrganizationId?: string;
  setCustomMilestoneName: Dispatch<SetStateAction<string>>;
  setDirtySubMilestoneEditorKeys: Dispatch<SetStateAction<Set<string>>>;
  setPendingMilestoneDeleteKey: Dispatch<SetStateAction<string | null>>;
  setPendingUnsavedNavigation: Dispatch<
    SetStateAction<PendingUnsavedNavigation | null>
  >;
  setSubMilestoneEditorResetVersions: Dispatch<
    SetStateAction<SubMilestoneEditorResetVersions>
  >;
  showHeading: boolean;
  showSetupActions: boolean;
  subMilestoneEditorResetVersions: SubMilestoneEditorResetVersions;
  table: ReactTable<TimelineMilestoneWorksheetRow>;
  templateTitle: string;
  totalDuration: number;
  totalPocBps: number;
  updateCostItem: (
    rowKey: string,
    itemId: string,
    payload: MaterialPlanningPayload
  ) => unknown;
  updateRow: (
    rowKey: string,
    patch: Partial<TimelineMilestoneWorksheetRow>,
    meta?: TimelineMilestoneWorksheetRowsChangeMeta
  ) => void;
  updateSubMilestone: (
    rowKey: string,
    subMilestoneId: string,
    patch: Partial<TimelineMilestoneWorksheetSubMilestone>,
    meta?: TimelineMilestoneWorksheetRowsChangeMeta
  ) => void | Promise<void>;
  viewerCapacity?: BuildCollaborationRole;
  worksheetView: "editor" | "table";
}

export function TimelineMilestoneWorksheetView({
  addContractorAssignment,
  addCustomMilestone,
  addSubMilestone,
  cascadeBudgetEdits,
  cashText,
  className,
  closeDetailsSheet,
  commitBudgetEdit,
  commitRows,
  contractorActions,
  contractorOptions,
  createCostItem,
  customMilestoneName,
  deleteCostItem,
  deleteMilestone,
  detailsSheetActiveTab,
  detailsSheetDescription,
  detailsSheetOpen,
  detailsSheetRow,
  detailsSheetSubMilestone,
  detailsSheetTarget,
  detailsSheetTestId,
  detailsSheetTitle,
  error,
  footerExtra,
  handleDetailsSheetTabChange,
  handleWorksheetViewChange,
  includedBudgetCents,
  includedRows,
  keyboardInstructionsId,
  leadingContent,
  mode,
  moveSummarySubMilestone,
  onBack,
  onCascadeBudgetEditsChange,
  onComplete,
  onReset,
  onScheduleDisplayModeChange,
  openDetailsSheet,
  planningFocusScopeKey,
  projectAddress,
  proposedStartDate,
  proposalSubmittedAt,
  pendingMilestoneDeleteRow,
  pendingMilestoneDeleteCanDelete,
  pendingMilestoneDeleteSource,
  pendingUnsavedNavigation,
  reportSubMilestoneEditorDirty,
  removeContractorAssignment,
  removeSubMilestone,
  renderMilestoneDetailTabs,
  reorderRows,
  requestMilestoneDelete,
  requestUnsavedNavigation,
  rows,
  scheduleDisplayMode,
  scopeRoute,
  scopeWorkosOrganizationId,
  setCustomMilestoneName,
  setDirtySubMilestoneEditorKeys,
  setPendingMilestoneDeleteKey,
  setPendingUnsavedNavigation,
  setSubMilestoneEditorResetVersions,
  showHeading,
  showSetupActions,
  subMilestoneEditorResetVersions,
  table,
  templateTitle,
  totalDuration,
  totalPocBps,
  updateCostItem,
  updateRow,
  updateSubMilestone,
  viewerCapacity,
  worksheetView,
}: TimelineMilestoneWorksheetViewProps) {
  return (
    <div
      className={cn(
        mode === "setup" && "timeline-setup-panel timeline-setup-budget-panel",
        className
      )}
      data-testid={
        mode === "setup"
          ? "timeline-setup-budget-screen"
          : "timeline-settings-template-blueprint-table"
      }
    >
      {leadingContent}

      {showHeading ? (
        <div className="timeline-blueprint-heading">
          <div>
            <span>Project milestones</span>
            <h1>{templateTitle}</h1>
            {projectAddress?.trim() ? (
              <p className="timeline-blueprint-heading-address">
                {projectAddress.trim()}
              </p>
            ) : null}
          </div>
          <div className="timeline-blueprint-heading-meta">
            <span>Table variation 03</span>
            <span>{mode === "settings" ? "Units: PoC %" : "Units: USD"}</span>
          </div>
        </div>
      ) : null}

      {mode === "setup" ? (
        <div className="timeline-blueprint-budget-controls">
          <div>
            <span>Budget tools</span>
            <strong>Keep the worksheet aligned to the target budget</strong>
          </div>
          <Group
            aria-label="Budget worksheet controls"
            className="timeline-blueprint-budget-toggle-group"
          >
            <GroupText>Allocation mode</GroupText>
            <Toggle
              aria-label="Cascade downstream budget edits"
              className="timeline-blueprint-cascade-toggle"
              data-testid="timeline-setup-budget-cascade-toggle"
              onPressedChange={(pressed) =>
                onCascadeBudgetEditsChange?.(pressed)
              }
              pressed={cascadeBudgetEdits}
              type="button"
              variant="outline"
            >
              Cascade: {cascadeBudgetEdits ? "On" : "Off"}
            </Toggle>
          </Group>
          {proposedStartDate ? (
            <Group
              aria-label="Schedule display controls"
              className="timeline-blueprint-budget-toggle-group"
            >
              <GroupText>Schedule</GroupText>
              <Toggle
                aria-label="Show calendar dates"
                className="timeline-blueprint-cascade-toggle"
                data-testid="timeline-setup-schedule-mode-dates"
                onPressedChange={(pressed) => {
                  if (pressed) {
                    onScheduleDisplayModeChange?.("dates");
                  }
                }}
                pressed={scheduleDisplayMode === "dates"}
                type="button"
                variant="outline"
              >
                Dates
              </Toggle>
              <Toggle
                aria-label="Show T offset durations"
                className="timeline-blueprint-cascade-toggle"
                data-testid="timeline-setup-schedule-mode-t-offsets"
                onPressedChange={(pressed) => {
                  if (pressed) {
                    onScheduleDisplayModeChange?.("tOffsets");
                  }
                }}
                pressed={scheduleDisplayMode === "tOffsets"}
                type="button"
                variant="outline"
              >
                T#
              </Toggle>
            </Group>
          ) : null}
        </div>
      ) : null}

      <div className="timeline-blueprint-add-milestone">
        <div>
          <span>Custom milestone</span>
          <strong>Add a one-off construction checkpoint</strong>
        </div>
        <div className="timeline-blueprint-add-milestone-form">
          <input
            aria-label="Custom milestone name"
            data-testid="timeline-setup-custom-milestone-name"
            onChange={(event) =>
              setCustomMilestoneName(event.currentTarget.value)
            }
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                addCustomMilestone();
              }
            }}
            placeholder="Milestone name..."
            value={customMilestoneName}
          />
          <Button
            className="timeline-blueprint-add-milestone-button"
            data-testid="timeline-setup-add-custom-milestone"
            onClick={addCustomMilestone}
            type="button"
            variant="outline"
          >
            <Plus aria-hidden="true" />
            Add milestone
          </Button>
          {mode === "settings" && onReset ? (
            <Button onClick={onReset} type="button" variant="ghost">
              Reset
            </Button>
          ) : null}
        </div>
      </div>

      <Tabs
        className="timeline-blueprint-view-tabs"
        data-testid="timeline-setup-worksheet-view-tabs"
        onValueChange={handleWorksheetViewChange}
        value={worksheetView}
      >
        <div className="timeline-blueprint-view-tabs-header">
          <TabsList
            aria-label="Milestone worksheet views"
            className="timeline-blueprint-view-tabs-list"
            variant="underline"
          >
            <TabsTab value="editor">Worksheet</TabsTab>
            <TabsTab value="table">Table view</TabsTab>
          </TabsList>
        </div>
        <TabsPanel
          className="timeline-blueprint-view-panel"
          keepMounted
          value="editor"
        >
          <div
            className="timeline-blueprint-table-wrap"
            data-testid="timeline-setup-budget-table"
          >
            <p className="sr-only" id={keyboardInstructionsId}>
              Use Tab to move through controls. In editable worksheet cells,
              press Enter or Arrow Down to move to the next control, and Shift
              Enter or Arrow Up to move to the previous control. Drag handles
              can be moved with Arrow Up and Arrow Down.
            </p>
            {(
              ["top-left", "top-right", "bottom-left", "bottom-right"] as const
            ).map((position) => (
              <span
                aria-hidden="true"
                className={`timeline-blueprint-table-corner is-${position}`}
                data-testid={`timeline-setup-budget-table-corner-${position}`}
                key={position}
              />
            ))}
            <Table
              aria-describedby={keyboardInstructionsId}
              aria-label={`${templateTitle} milestone worksheet`}
              className="timeline-blueprint-table"
            >
              <TableCaption className="sr-only">
                {mode === "settings"
                  ? "Edit the milestone template names, types, percentages, durations, inclusion state, and sub-milestones."
                  : "Edit milestone budgets, durations, exclusion state, order, and sub-milestones."}
              </TableCaption>
              <TableHeader>
                {table.getHeaderGroups().map((headerGroup) => (
                  <TableRow key={headerGroup.id}>
                    {headerGroup.headers.map((header) => (
                      <TableHead
                        key={header.id}
                        scope="col"
                        style={{ width: header.getSize() }}
                      >
                        {header.isPlaceholder
                          ? null
                          : flexRender(
                              header.column.columnDef.header,
                              header.getContext()
                            )}
                      </TableHead>
                    ))}
                  </TableRow>
                ))}
              </TableHeader>
              <Sortable
                aria-label="Milestone budget order"
                getItemValue={(row) => row.key}
                modifiers={[restrictToVerticalAxis]}
                onMove={({ activeIndex, overIndex }) =>
                  reorderRows(activeIndex, overIndex)
                }
                render={<TableBody />}
                strategy="vertical"
                value={rows}
              >
                {table.getRowModel().rows.flatMap((row) => {
                  const expandedRowId = getExpandedRowId(row.original.key);
                  const budgetRow = (
                    <SortableItem
                      className={cn(row.original.excluded && "is-excluded")}
                      data-testid={`timeline-setup-budget-row-${row.original.key}`}
                      key={row.id}
                      render={<TableRow />}
                      value={row.original.key}
                    >
                      {row.getVisibleCells().map((cell) => (
                        <TableCell key={cell.id}>
                          {flexRender(
                            cell.column.columnDef.cell,
                            cell.getContext()
                          )}
                        </TableCell>
                      ))}
                    </SortableItem>
                  );
                  const expandedRow = row.getIsExpanded() ? (
                    <TableRow
                      className="timeline-blueprint-expanded-row"
                      id={expandedRowId}
                      key={`${row.id}:expanded`}
                    >
                      <TableCell colSpan={row.getVisibleCells().length}>
                        {renderMilestoneDetailTabs(row.original)}
                      </TableCell>
                    </TableRow>
                  ) : null;

                  return expandedRow ? [budgetRow, expandedRow] : [budgetRow];
                })}
              </Sortable>
            </Table>
          </div>
        </TabsPanel>
        <TabsPanel
          className="timeline-blueprint-view-panel"
          data-testid="timeline-setup-table-view-panel"
          value="table"
        >
          <MilestoneSummaryTable
            customMilestoneName={customMilestoneName}
            mode={mode}
            onAddCustomMilestone={addCustomMilestone}
            onAddSubMilestone={(rowKey) => addSubMilestone(rowKey)}
            onCommitBudgetEdit={commitBudgetEdit}
            onCommitField={commitRows}
            onCustomMilestoneNameChange={setCustomMilestoneName}
            onDeleteMilestone={requestMilestoneDelete}
            onMoveSubMilestone={moveSummarySubMilestone}
            onOpenDetails={openDetailsSheet}
            onUpdateRow={updateRow}
            onUpdateSubMilestone={updateSubMilestone}
            planningFocusScopeKey={planningFocusScopeKey}
            proposedStartDate={proposedStartDate}
            rows={rows}
            scheduleDisplayMode={scheduleDisplayMode}
            templateTitle={templateTitle}
          />
        </TabsPanel>
      </Tabs>

      <div className="timeline-blueprint-footer">
        <div className="timeline-blueprint-summary">
          <MetricPill
            label="Milestones"
            value={`${includedRows.length} ${mode === "settings" ? "included" : "active"}`}
          />
          {mode === "settings" ? (
            <MetricPill label="Total PoC" value={formatBps(totalPocBps)} />
          ) : (
            <MetricPill
              label="Budget"
              value={formatCurrency(includedBudgetCents)}
            />
          )}
          <MetricPill label="Duration" value={`${totalDuration} days`} />
          {mode === "setup" ? (
            <MetricPill label="Working capital" value={cashText ?? "$0"} />
          ) : (
            footerExtra
          )}
        </div>
        <div className="timeline-blueprint-actions">
          {error ? (
            <p
              className="timeline-blueprint-error"
              data-testid="timeline-setup-error"
              role="alert"
            >
              {error}
            </p>
          ) : null}
          {showSetupActions ? (
            <>
              {onBack ? (
                <Button
                  className="timeline-setup-secondary"
                  onClick={() => requestUnsavedNavigation(onBack)}
                  variant="outline"
                >
                  Back to templates
                </Button>
              ) : null}
              {onComplete ? (
                <Button
                  className="timeline-setup-primary"
                  data-testid="timeline-setup-complete"
                  onClick={() =>
                    requestUnsavedNavigation(() =>
                      onComplete({ redirectToDurableRoute: false })
                    )
                  }
                >
                  Generate timeline
                  <ChevronRight />
                </Button>
              ) : null}
            </>
          ) : null}
        </div>
      </div>
      <Sheet
        onOpenChange={(open) => {
          if (!open) {
            closeDetailsSheet();
          }
        }}
        open={detailsSheetOpen}
      >
        <SheetPopup
          backdropClassName="timeline-blueprint-details-sheet-backdrop"
          className={`timeline-blueprint-details-sheet ${
            detailsSheetTarget?.kind === "subMilestone"
              ? "is-submilestone-detail"
              : "is-milestone-detail"
          }`}
          side="right"
          variant="inset"
        >
          <SheetHeader className="timeline-blueprint-details-sheet-header">
            <SheetTitle className="pr-8">{detailsSheetTitle}</SheetTitle>
            <SheetDescription>{detailsSheetDescription}</SheetDescription>
          </SheetHeader>
          <SheetPanel
            className="timeline-blueprint-details-sheet-panel"
            data-testid={detailsSheetTestId}
          >
            {detailsSheetTarget?.kind === "subMilestone" &&
            detailsSheetRow &&
            detailsSheetSubMilestone ? (
              <SubMilestoneFocusedTabs
                activeTab={detailsSheetActiveTab}
                contractorActions={contractorActions}
                contractorOptions={contractorOptions}
                fieldGuidanceEditorResetVersion={
                  subMilestoneEditorResetVersions[
                    `${detailsSheetRow.key}:${detailsSheetSubMilestone.id}:fieldGuidance`
                  ] ?? 0
                }
                mode={mode}
                onActiveTabChange={handleDetailsSheetTabChange}
                onAddContractorAssignment={(assignment) =>
                  addContractorAssignment(detailsSheetRow.key, assignment)
                }
                onCommitField={commitRows}
                onCreateCostItem={(payload) =>
                  createCostItem(detailsSheetRow.key, payload)
                }
                onDeleteCostItem={(itemId) =>
                  deleteCostItem(detailsSheetRow.key, itemId)
                }
                onRemoveContractorAssignment={(assignmentId) =>
                  removeContractorAssignment(detailsSheetRow.key, assignmentId)
                }
                onRemoveSubMilestone={(subMilestoneId) =>
                  removeSubMilestone(detailsSheetRow.key, subMilestoneId)
                }
                onSubMilestoneEditorDirtyChange={reportSubMilestoneEditorDirty}
                onUpdateCostItem={(itemId, payload) =>
                  updateCostItem(detailsSheetRow.key, itemId, payload)
                }
                onUpdateSubMilestone={(subMilestoneId, patch, meta) =>
                  updateSubMilestone(
                    detailsSheetRow.key,
                    subMilestoneId,
                    patch,
                    meta
                  )
                }
                proposalSubmittedAt={proposalSubmittedAt}
                proposedStartDate={proposedStartDate}
                row={detailsSheetRow}
                scheduleDisplayMode={scheduleDisplayMode}
                scopeEditorResetVersion={
                  subMilestoneEditorResetVersions[
                    `${detailsSheetRow.key}:${detailsSheetSubMilestone.id}:scope`
                  ] ?? 0
                }
                scopeRoute={scopeRoute}
                scopeWorkosOrganizationId={scopeWorkosOrganizationId}
                subMilestone={detailsSheetSubMilestone}
                viewerCapacity={viewerCapacity}
              />
            ) : detailsSheetRow ? (
              renderMilestoneDetailTabs(detailsSheetRow, "sheet")
            ) : null}
          </SheetPanel>
        </SheetPopup>
      </Sheet>
      <AlertDialog
        onOpenChange={(open) => {
          if (!open) {
            setPendingMilestoneDeleteKey(null);
          }
        }}
        open={pendingMilestoneDeleteRow !== null}
      >
        <AlertDialogContent className="sm:max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>
              {pendingMilestoneDeleteSource === "finalSubMilestone"
                ? "Remove final Sub-milestone and Milestone?"
                : "Delete milestone"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {pendingMilestoneDeleteRow
                ? pendingMilestoneDeleteSource === "finalSubMilestone"
                  ? pendingMilestoneDeleteCanDelete
                    ? `Removing the final Sub-milestone also removes the ${pendingMilestoneDeleteRow.name} Milestone from this proposal plan. Its budget, schedule, assignments, and dependencies will be cleared.`
                    : `The ${pendingMilestoneDeleteRow.name} Milestone is the final included Milestone. Add or include another Milestone before removing its final Sub-milestone.`
                  : `"${pendingMilestoneDeleteRow.name}" and its sub-milestones will be removed from this draft. Completion percentages will be redistributed across the remaining included sub-milestones.`
                : null}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogClose
              render={<Button variant="outline">Cancel</Button>}
            />
            <Button
              data-testid="timeline-settings-delete-milestone-confirm"
              disabled={!pendingMilestoneDeleteCanDelete}
              onClick={() => {
                if (pendingMilestoneDeleteRow) {
                  deleteMilestone(pendingMilestoneDeleteRow.key);
                }
              }}
              variant="destructive"
            >
              {pendingMilestoneDeleteSource === "finalSubMilestone"
                ? "Remove Sub-milestone and Milestone"
                : "Delete milestone"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog
        onOpenChange={(open) => {
          if (!open) {
            setPendingUnsavedNavigation(null);
          }
        }}
        open={pendingUnsavedNavigation !== null}
      >
        <AlertDialogContent
          className="sm:max-w-md"
          data-testid="timeline-setup-unsaved-changes-dialog"
        >
          <AlertDialogHeader>
            <AlertDialogTitle>Discard unsaved editor changes?</AlertDialogTitle>
            <AlertDialogDescription>
              Your Scope or Field Guidance edits have not been saved. Leave this
              worksheet and discard those local changes?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogClose
              render={<Button variant="outline">Keep editing</Button>}
            />
            <Button
              data-testid="timeline-setup-unsaved-changes-discard"
              onClick={() => {
                if (!pendingUnsavedNavigation) {
                  return;
                }
                const { action, dirtyKeys } = pendingUnsavedNavigation;
                setSubMilestoneEditorResetVersions((current) => {
                  const next = { ...current };
                  for (const dirtyKey of dirtyKeys) {
                    next[dirtyKey] = (next[dirtyKey] ?? 0) + 1;
                  }
                  return next;
                });
                setDirtySubMilestoneEditorKeys((current) => {
                  const next = new Set(current);
                  for (const dirtyKey of dirtyKeys) {
                    next.delete(dirtyKey);
                  }
                  return next;
                });
                setPendingUnsavedNavigation(null);
                action();
              }}
              variant="destructive"
            >
              Discard changes
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
