import { restrictToVerticalAxis } from "@dnd-kit/modifiers";
import { GripVertical, PanelRightOpen, Plus, Trash2 } from "lucide-react";
import { toggleSubmilestoneSelection, usePlanningFocus } from "#/features/assistant/assistantPlanningFocus.ts";
import {
  Sortable,
  SortableItem,
  SortableItemHandle,
} from "#/components/reui/sortable.tsx";
import { Button } from "#/components/ui/button.tsx";
import { Checkbox } from "#/components/ui/checkbox.tsx";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "#/components/ui/table.tsx";
import { cn } from "#/lib/utils.ts";
import {
  parseDurationDays,
  rowDurationDays,
  rowStartDay,
  sanitizeSubMilestoneName,
  subMilestoneStartDay,
  type TimelineMilestoneWorksheetRow,
  type TimelineMilestoneWorksheetRowsChangeMeta,
  type TimelineMilestoneWorksheetSubMilestone,
  type TimelineScheduleDisplayMode,
  type WorksheetMode,
} from "./TimelineMilestoneWorksheetContracts.tsx";
import {
  summaryGroupItemId,
  summarySubMilestoneItemId,
  timelineSummaryDragItems,
} from "./TimelineMilestoneWorksheetSummaryDrag.ts";
import {
  milestoneSummaryWindow,
  SummaryMilestoneDurationCell,
  SummaryMilestoneEndCell,
  SummaryMilestoneValueCell,
  SummaryStatusSignals,
  SummarySubMilestoneDurationCell,
  SummarySubMilestoneEndCell,
  SummarySubMilestoneValueCell,
  SummaryWindowCell,
  subMilestoneSummaryWindow,
} from "./TimelineMilestoneWorksheetSummaryCells.tsx";

export function MilestoneSummaryTable({
  customMilestoneName,
  mode,
  onAddCustomMilestone,
  onAddSubMilestone,
  onCommitBudgetEdit,
  onCommitField,
  onCustomMilestoneNameChange,
  onMoveSubMilestone,
  onDeleteMilestone,
  onOpenDetails,
  onUpdateRow,
  onUpdateSubMilestone,
  proposedStartDate,
  rows,
  scheduleDisplayMode,
  templateTitle,
  planningFocusScopeKey,
}: {
  customMilestoneName: string;
  mode: WorksheetMode;
  onAddCustomMilestone: () => void;
  onAddSubMilestone: (rowKey: string) => void;
  onCommitBudgetEdit: (rowKey: string) => void;
  onCommitField: () => void;
  onCustomMilestoneNameChange: (value: string) => void;
  onMoveSubMilestone: (activeIndex: number, overIndex: number) => void;
  onDeleteMilestone: (rowKey: string) => void;
  onOpenDetails: (rowKey: string, subMilestoneId?: string) => void;
  onUpdateRow: (
    rowKey: string,
    patch: Partial<TimelineMilestoneWorksheetRow>,
    meta?: TimelineMilestoneWorksheetRowsChangeMeta
  ) => void;
  onUpdateSubMilestone: (
    rowKey: string,
    subMilestoneId: string,
    patch: Partial<TimelineMilestoneWorksheetSubMilestone>,
    meta?: TimelineMilestoneWorksheetRowsChangeMeta
  ) => void;
  planningFocusScopeKey?: string;
  proposedStartDate?: string;
  rows: TimelineMilestoneWorksheetRow[];
  scheduleDisplayMode: TimelineScheduleDisplayMode;
  templateTitle: string;
}) {
  const valueHeader = mode === "settings" ? "PoC" : "Budget";
  const dragItems = timelineSummaryDragItems(rows);
  const assistantFocusEnabled = Boolean(planningFocusScopeKey);
  const planningFocus = usePlanningFocus(planningFocusScopeKey ?? "");
  const selectedSubMilestoneKeys = planningFocus.selectedSubmilestoneKeys;

  return (
    <div className="timeline-blueprint-summary-table-wrap">
      <div className="timeline-blueprint-summary-table-heading">
        <div>
          <span>Milestone and submilestone worksheet</span>
          <strong>{templateTitle}</strong>
        </div>
        <div className="timeline-blueprint-summary-add-milestone">
          <input
            aria-label="Table view milestone name"
            data-testid="timeline-setup-table-add-milestone-name"
            onChange={(event) =>
              onCustomMilestoneNameChange(event.currentTarget.value)
            }
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                onAddCustomMilestone();
              }
            }}
            placeholder="Milestone name..."
            value={customMilestoneName}
          />
          <Button
            className="timeline-blueprint-summary-add-button"
            data-testid="timeline-setup-table-add-milestone"
            onClick={onAddCustomMilestone}
            size="sm"
            type="button"
            variant="outline"
          >
            <Plus aria-hidden="true" />
            Add milestone
          </Button>
        </div>
      </div>
      <Table
        aria-label={`${templateTitle} table view`}
        className="timeline-blueprint-summary-table"
      >
        <TableCaption className="sr-only">
          Review milestone and sub-milestone scope, schedule window, budget, and
          details actions.
        </TableCaption>
        <TableHeader>
          <TableRow>
            {assistantFocusEnabled ? (
              <TableHead className="w-9" scope="col">
                <span className="sr-only">Assistant focus</span>
              </TableHead>
            ) : null}
            <TableHead scope="col">Scope</TableHead>
            <TableHead scope="col">Window</TableHead>
            <TableHead scope="col">Duration</TableHead>
            <TableHead scope="col">End</TableHead>
            <TableHead className="text-right" scope="col">
              {valueHeader}
            </TableHead>
            <TableHead scope="col">Status</TableHead>
            <TableHead className="text-right" scope="col">
              Details
            </TableHead>
          </TableRow>
        </TableHeader>
        <Sortable
          aria-label="Sub-milestone table order"
          getItemValue={(item) => item.id}
          modifiers={[restrictToVerticalAxis]}
          onMove={({ activeIndex, overIndex }) =>
            onMoveSubMilestone(activeIndex, overIndex)
          }
          render={<TableBody />}
          strategy="vertical"
          value={dragItems}
        >
          {rows.flatMap((row) => {
            const rowWindow = milestoneSummaryWindow(row, {
              proposedStartDate,
              scheduleDisplayMode,
            });
            const milestoneRow = (
              <SortableItem
                className={cn(
                  "timeline-blueprint-summary-row is-milestone",
                  row.excluded && "is-excluded"
                )}
                data-testid={`timeline-setup-table-row-${row.key}`}
                key={row.key}
                render={<TableRow />}
                value={summaryGroupItemId(row.key)}
              >
                {assistantFocusEnabled ? <TableCell className="w-9" /> : null}
                <TableCell>
                  <div className="timeline-blueprint-summary-scope">
                    <strong>{row.name}</strong>
                    <small>
                      {row.subMilestoneDetails.length} sub-milestone
                      {row.subMilestoneDetails.length === 1 ? "" : "s"}
                    </small>
                  </div>
                </TableCell>
                <TableCell>
                  <SummaryWindowCell
                    edit={
                      proposedStartDate && row.subMilestoneDetails.length === 0
                        ? {
                            durationDays: rowDurationDays(row),
                            label: row.name,
                            onCommit: onCommitField,
                            onWindowChange: (next) =>
                              onUpdateRow(
                                row.key,
                                {
                                  durationDays: next.durationDays,
                                  durationText: String(next.durationDays),
                                  startDay: next.startDay,
                                },
                                { commit: false }
                              ),
                            proposedStartDate,
                            startDay: rowStartDay(row),
                            testId: `timeline-setup-table-row-window-${row.key}`,
                          }
                        : undefined
                    }
                    window={rowWindow}
                  />
                </TableCell>
                <TableCell>
                  <SummaryMilestoneDurationCell
                    mode={mode}
                    onCommitField={onCommitField}
                    onUpdateRow={onUpdateRow}
                    row={row}
                  />
                </TableCell>
                <TableCell>
                  <SummaryMilestoneEndCell
                    onCommitField={onCommitField}
                    onUpdateRow={onUpdateRow}
                    proposedStartDate={proposedStartDate}
                    row={row}
                    scheduleDisplayMode={scheduleDisplayMode}
                  />
                </TableCell>
                <TableCell className="text-right">
                  <SummaryMilestoneValueCell
                    mode={mode}
                    onCommitBudgetEdit={onCommitBudgetEdit}
                    onUpdateRow={onUpdateRow}
                    row={row}
                  />
                </TableCell>
                <TableCell>
                  <SummaryStatusSignals
                    onOpenDetails={onOpenDetails}
                    row={row}
                  />
                </TableCell>
                <TableCell className="text-right">
                  <div className="timeline-blueprint-summary-row-actions">
                    <Button
                      aria-label={`Add sub-milestone to ${row.name}`}
                      className="timeline-blueprint-summary-details-button"
                      data-testid={`timeline-setup-table-add-submilestone-${row.key}`}
                      onClick={() => onAddSubMilestone(row.key)}
                      size="sm"
                      type="button"
                      variant="outline"
                    >
                      <Plus aria-hidden="true" />
                      Sub-milestone
                    </Button>
                    <Button
                      aria-label={`Open details for ${row.name}`}
                      className="timeline-blueprint-summary-details-button"
                      data-testid={`timeline-setup-table-row-details-${row.key}`}
                      onClick={() => onOpenDetails(row.key)}
                      size="sm"
                      variant="outline"
                    >
                      <PanelRightOpen aria-hidden="true" />
                      Details
                    </Button>
                    {mode === "settings" ? (
                      <Button
                        aria-label={`Delete ${row.name}`}
                        className="timeline-blueprint-summary-details-button"
                        data-testid={`timeline-settings-table-delete-${row.key}`}
                        disabled={
                          !row.excluded &&
                          rows.filter((candidate) => !candidate.excluded)
                            .length <= 1
                        }
                        onClick={() => onDeleteMilestone(row.key)}
                        size="sm"
                        title={
                          !row.excluded &&
                          rows.filter((candidate) => !candidate.excluded)
                            .length <= 1
                            ? "At least one milestone must remain included."
                            : undefined
                        }
                        type="button"
                        variant="destructive"
                      >
                        <Trash2 aria-hidden="true" />
                        Delete
                      </Button>
                    ) : null}
                  </div>
                </TableCell>
              </SortableItem>
            );
            const subMilestoneRows = row.subMilestoneDetails.map(
              (subMilestone) => {
                const subMilestoneName = sanitizeSubMilestoneName(
                  subMilestone.name
                );
                return (
                  <SortableItem
                    className={cn(
                      "timeline-blueprint-summary-row is-submilestone",
                      row.excluded && "is-excluded",
                      assistantFocusEnabled &&
                        selectedSubMilestoneKeys.includes(subMilestone.id) &&
                        "is-assistant-focus"
                    )}
                    data-testid={`timeline-setup-table-subrow-${subMilestone.id}`}
                    key={`${row.key}:${subMilestone.id}`}
                    render={<TableRow />}
                    value={summarySubMilestoneItemId(subMilestone.id)}
                  >
                    {assistantFocusEnabled ? (
                      <TableCell className="w-9">
                        <Checkbox
                          aria-label={`Focus ${subMilestoneName} for the DrawFlow assistant`}
                          checked={selectedSubMilestoneKeys.includes(
                            subMilestone.id
                          )}
                          data-testid={`timeline-setup-table-subrow-focus-${subMilestone.id}`}
                          onCheckedChange={() =>
                            toggleSubmilestoneSelection(
                              planningFocusScopeKey ?? "",
                              subMilestone.id
                            )
                          }
                        />
                      </TableCell>
                    ) : null}
                    <TableCell>
                      <div className="timeline-blueprint-summary-scope is-submilestone">
                        <SortableItemHandle
                          aria-label={`Drag ${subMilestoneName}`}
                          className="timeline-blueprint-summary-drag-handle"
                          render={<button type="button" />}
                        >
                          <GripVertical aria-hidden="true" />
                        </SortableItemHandle>
                        <span>
                          <strong>{subMilestoneName}</strong>
                          <small>{subMilestone.description}</small>
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <SummaryWindowCell
                        edit={
                          proposedStartDate
                            ? {
                                durationDays: parseDurationDays(
                                  subMilestone.durationText
                                ),
                                label: `${row.name} ${sanitizeSubMilestoneName(subMilestone.name)}`,
                                onCommit: onCommitField,
                                onWindowChange: (next) =>
                                  onUpdateSubMilestone(
                                    row.key,
                                    subMilestone.id,
                                    {
                                      durationText: String(next.durationDays),
                                      startDay: next.startDay,
                                    },
                                    { commit: false }
                                  ),
                                proposedStartDate,
                                startDay: subMilestoneStartDay(
                                  row,
                                  subMilestone
                                ),
                                testId: `timeline-setup-table-submilestone-window-${subMilestone.id}`,
                              }
                            : undefined
                        }
                        window={subMilestoneSummaryWindow(row, subMilestone, {
                          proposedStartDate,
                          scheduleDisplayMode,
                        })}
                      />
                    </TableCell>
                    <TableCell>
                      <SummarySubMilestoneDurationCell
                        mode={mode}
                        onCommitField={onCommitField}
                        onUpdateSubMilestone={(patch, meta) =>
                          onUpdateSubMilestone(
                            row.key,
                            subMilestone.id,
                            patch,
                            meta
                          )
                        }
                        subMilestone={subMilestone}
                      />
                    </TableCell>
                    <TableCell>
                      <SummarySubMilestoneEndCell
                        onCommitField={onCommitField}
                        onUpdateSubMilestone={(patch, meta) =>
                          onUpdateSubMilestone(
                            row.key,
                            subMilestone.id,
                            patch,
                            meta
                          )
                        }
                        proposedStartDate={proposedStartDate}
                        row={row}
                        scheduleDisplayMode={scheduleDisplayMode}
                        subMilestone={subMilestone}
                      />
                    </TableCell>
                    <TableCell className="text-right">
                      <SummarySubMilestoneValueCell
                        mode={mode}
                        onUpdateSubMilestone={(patch, meta) =>
                          onUpdateSubMilestone(
                            row.key,
                            subMilestone.id,
                            patch,
                            meta
                          )
                        }
                        subMilestone={subMilestone}
                      />
                    </TableCell>
                    <TableCell>
                      <SummaryStatusSignals
                        onOpenDetails={onOpenDetails}
                        row={row}
                        subMilestone={subMilestone}
                      />
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        aria-label={`Open details for ${subMilestoneName}`}
                        className="timeline-blueprint-summary-details-button"
                        data-testid={`timeline-setup-table-subrow-details-${subMilestone.id}`}
                        onClick={() => onOpenDetails(row.key, subMilestone.id)}
                        size="sm"
                        variant="outline"
                      >
                        <PanelRightOpen aria-hidden="true" />
                        Details
                      </Button>
                    </TableCell>
                  </SortableItem>
                );
              }
            );

            return [milestoneRow, ...subMilestoneRows];
          })}
        </Sortable>
      </Table>
    </div>
  );
}
