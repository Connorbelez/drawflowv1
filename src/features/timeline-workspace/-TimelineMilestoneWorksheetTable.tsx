import { restrictToVerticalAxis } from "@dnd-kit/modifiers";
import { arrayMove } from "@dnd-kit/sortable";
import {
  type ColumnDef,
  type ExpandedState,
  flexRender,
  getCoreRowModel,
  getExpandedRowModel,
  useReactTable,
} from "@tanstack/react-table";
import {
  ChevronDown,
  ChevronRight,
  GripVertical,
  Plus,
  Trash2,
} from "lucide-react";
import {
  type KeyboardEvent,
  type ReactNode,
  useCallback,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  FieldRichTextEditor,
} from "#/components/rich-text/field-rich-text.tsx";
import {
  Sortable,
  SortableItem,
  SortableItemHandle,
} from "#/components/reui/sortable.tsx";
import {
  Autocomplete,
  AutocompleteEmpty,
  AutocompleteGroup,
  AutocompleteGroupLabel,
  AutocompleteInput,
  AutocompleteItem,
  AutocompleteList,
  AutocompletePopup,
} from "#/components/ui/autocomplete.tsx";
import { Badge } from "#/components/ui/badge.tsx";
import { Button } from "#/components/ui/button.tsx";
import { Group, GroupText } from "#/components/ui/group.tsx";
import { Switch } from "#/components/ui/switch.tsx";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "#/components/ui/table.tsx";
import { Toggle } from "#/components/ui/toggle.tsx";
import {
  formatCurrency,
  parseCurrencyToCents,
} from "#/features/builder-proposal-demo/template-helpers.ts";
import {
  type MaterialPlanningItem,
  type MaterialPlanningMilestone,
  type MaterialPlanningPayload,
  MaterialPlanningTab,
} from "#/features/material-planning/MaterialPlanningTab.tsx";
import {
  coerceSiteVisitGuidance,
  guidanceLinesToHtml,
  type SiteVisitGuidanceHtml,
} from "#/lib/site-visit-guidance.ts";
import { cn } from "#/lib/utils.ts";
import {
  ISOMETRIC_ICON_KEYS,
  type IsometricIconKey,
} from "./-timeline-share-snapshot.ts";
import "./-timeline-setup-flow.css";

const DEFAULT_NEW_MILESTONE_BUDGET_TEXT = "$0";
const DEFAULT_NEW_MILESTONE_DURATION_TEXT = "7";
const DEFAULT_NEW_SUB_MILESTONE_BUDGET_TEXT = "$0";
const DEFAULT_NEW_SUB_MILESTONE_DURATION_TEXT = "1";
const FOCUSABLE_TABLE_CONTROL_SELECTOR = [
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(",");
const DURATION_PREFIX_REGEX = /^T/i;
const NON_DIGIT_REGEX = /\D/g;

const iconOptions = ISOMETRIC_ICON_KEYS;

interface SubMilestoneBankItem {
  budgetText?: string;
  category: string;
  description: string;
  durationText: string;
  name: string;
}

const SUB_MILESTONE_BANK: SubMilestoneBankItem[] = [
  {
    category: "Sitework",
    description: "Complete finish grading and landscape readiness checks",
    durationText: "3",
    name: "Final grading and landscaping",
  },
  {
    category: "Preconstruction",
    description: "Stake limits, benchmark elevations, and construction layout",
    durationText: "2",
    name: "Survey staking",
  },
  {
    category: "Preconstruction",
    description: "Temporary power pole, water source, and service setup",
    durationText: "3",
    name: "Temporary utilities",
  },
  {
    category: "Sitework",
    description: "Strip topsoil, rough grade pad, and stockpile material",
    durationText: "3",
    name: "Topsoil stripping",
  },
  {
    category: "Foundation",
    description: "Place and finish concrete footings with test records",
    durationText: "1",
    name: "Footing pour",
  },
  {
    category: "Framing",
    description: "Complete clips, hold-downs, straps, and connectors",
    durationText: "2",
    name: "Hardware and connectors",
  },
];

export interface TimelineMilestoneWorksheetSubMilestone {
  budgetText: string;
  description: string;
  durationText: string;
  id: string;
  name: string;
  percentageBps?: number;
  percentageText?: string;
}

export interface TimelineMilestoneWorksheetContractorOption {
  city?: string;
  contractorId: string;
  defaultPayRateCents?: number;
  defaultPayRateUnit?: "day" | "fixed" | "hour";
  name: string;
  trades?: string[];
}

export interface TimelineMilestoneWorksheetContractorAssignment {
  contractorId?: string;
  contractorName: string;
  estimatedCostCents?: number;
  estimatedHours?: number;
  id: string;
  role: string;
  subMilestoneIds: string[];
}

export interface TimelineMilestoneWorksheetCostItem {
  costCents: number;
  description?: string;
  id: string;
  itemType: "equipment" | "material";
  quantity: number;
  relevantSubMilestoneIds: string[];
  supplier?: string;
  title: string;
}

export interface TimelineMilestoneWorksheetRow {
  baseItemId?: string;
  budgetText: string;
  contractorAssignments?: TimelineMilestoneWorksheetContractorAssignment[];
  costItems?: TimelineMilestoneWorksheetCostItem[];
  dependencyKeys: string[];
  durationDays: number;
  durationText: string;
  excluded: boolean;
  icon: IsometricIconKey;
  key: string;
  name: string;
  order: number;
  percentageBps: number;
  percentageText?: string;
  siteVisitGuidance?: SiteVisitGuidanceHtml;
  subMilestoneDetails: TimelineMilestoneWorksheetSubMilestone[];
  subMilestones: string[];
  type: string;
}

type WorksheetMode = "settings" | "setup";

export function TimelineMilestoneWorksheetTable({
  cascadeBudgetEdits = false,
  cashText,
  className,
  contractorOptions = [],
  error,
  footerExtra,
  leadingContent,
  mode,
  onBack,
  onCascadeBudgetEditsChange,
  onComplete,
  onReset,
  onRowsChange,
  projectAddress,
  rows,
  showHeading = false,
  targetBudgetCents,
  templateTitle,
}: {
  cascadeBudgetEdits?: boolean;
  cashText?: string;
  className?: string;
  contractorOptions?: TimelineMilestoneWorksheetContractorOption[];
  error?: string;
  footerExtra?: ReactNode;
  leadingContent?: ReactNode;
  mode: WorksheetMode;
  onBack?: () => void;
  onCascadeBudgetEditsChange?: (enabled: boolean) => void;
  onComplete?: (options: { redirectToDurableRoute: boolean }) => void;
  onReset?: () => void;
  onRowsChange: (rows: TimelineMilestoneWorksheetRow[]) => void;
  projectAddress?: string;
  rows: TimelineMilestoneWorksheetRow[];
  showHeading?: boolean;
  targetBudgetCents?: number;
  templateTitle: string;
}) {
  const [expanded, setExpanded] = useState<ExpandedState>(() =>
    rows[0]?.key ? { [rows[0].key]: mode === "setup" } : {}
  );
  const [activeSubMilestoneByRow, setActiveSubMilestoneByRow] = useState<
    Record<string, string>
  >(() =>
    rows[0]?.key && rows[0].subMilestoneDetails[0]?.id
      ? { [rows[0].key]: rows[0].subMilestoneDetails[0].id }
      : {}
  );
  const [customMilestoneName, setCustomMilestoneName] = useState("");
  const keyboardInstructionsId = useId();
  const rowsRef = useRef(rows);
  const onRowsChangeRef = useRef(onRowsChange);
  rowsRef.current = rows;
  onRowsChangeRef.current = onRowsChange;

  const updateRows = useCallback(
    (nextRows: TimelineMilestoneWorksheetRow[]) =>
      onRowsChangeRef.current(
        nextRows.map((row, order) => ({
          ...row,
          order,
        }))
      ),
    []
  );

  const updateRow = useCallback(
    (rowKey: string, patch: Partial<TimelineMilestoneWorksheetRow>) => {
      updateRows(
        rowsRef.current.map((row) =>
          row.key === rowKey ? { ...row, ...patch } : row
        )
      );
    },
    [updateRows]
  );

  const updateSubMilestone = (
    rowKey: string,
    subMilestoneId: string,
    patch: Partial<TimelineMilestoneWorksheetSubMilestone>
  ) => {
    updateRows(
      rows.map((row) => {
        if (row.key !== rowKey) {
          return row;
        }

        return withSubMilestoneDetails(
          row,
          row.subMilestoneDetails.map((detail) =>
            detail.id === subMilestoneId ? { ...detail, ...patch } : detail
          )
        );
      })
    );
    setActiveSubMilestoneByRow((current) => ({
      ...current,
      [rowKey]: subMilestoneId,
    }));
  };

  const addSubMilestone = (rowKey: string, item?: SubMilestoneBankItem) => {
    const row = rows.find((candidate) => candidate.key === rowKey);
    if (!row) {
      return;
    }

    const nextSubMilestone: TimelineMilestoneWorksheetSubMilestone = {
      budgetText: item?.budgetText ?? DEFAULT_NEW_SUB_MILESTONE_BUDGET_TEXT,
      description: item?.description ?? "Define scope checkpoint",
      durationText:
        item?.durationText ?? DEFAULT_NEW_SUB_MILESTONE_DURATION_TEXT,
      id: `${rowKey}-custom-${Date.now()}`,
      name:
        item?.name ?? `New sub-milestone ${row.subMilestoneDetails.length + 1}`,
      percentageBps: 0,
      percentageText: "0.00%",
    };

    updateRows(
      rows.map((candidate) =>
        candidate.key === rowKey
          ? withSubMilestoneDetails(candidate, [
              ...candidate.subMilestoneDetails,
              nextSubMilestone,
            ])
          : candidate
      )
    );
    setActiveSubMilestoneByRow((current) => ({
      ...current,
      [rowKey]: nextSubMilestone.id,
    }));
  };

  const removeSubMilestone = (rowKey: string, subMilestoneId: string) => {
    let nextActiveSubMilestoneId = "";

    updateRows(
      rows.map((row) => {
        if (row.key !== rowKey) {
          return row;
        }

        const currentIndex = row.subMilestoneDetails.findIndex(
          (detail) => detail.id === subMilestoneId
        );
        const subMilestoneDetails = row.subMilestoneDetails.filter(
          (detail) => detail.id !== subMilestoneId
        );
        nextActiveSubMilestoneId =
          subMilestoneDetails[Math.max(0, currentIndex - 1)]?.id ??
          subMilestoneDetails[0]?.id ??
          "";

        return withSubMilestoneDetails(row, subMilestoneDetails);
      })
    );
    setActiveSubMilestoneByRow((current) => ({
      ...current,
      [rowKey]: nextActiveSubMilestoneId,
    }));
  };

  const addContractorAssignment = (
    rowKey: string,
    assignment: Omit<TimelineMilestoneWorksheetContractorAssignment, "id">
  ) => {
    updateRows(
      rows.map((row) =>
        row.key === rowKey
          ? {
              ...row,
              contractorAssignments: [
                ...(row.contractorAssignments ?? []),
                {
                  ...assignment,
                  id: makeWorksheetId(`${rowKey}-contractor`),
                },
              ],
            }
          : row
      )
    );
  };

  const removeContractorAssignment = (rowKey: string, assignmentId: string) => {
    updateRow(rowKey, {
      contractorAssignments: (
        rows.find((row) => row.key === rowKey)?.contractorAssignments ?? []
      ).filter((assignment) => assignment.id !== assignmentId),
    });
  };

  const createCostItem = (rowKey: string, payload: MaterialPlanningPayload) => {
    const row = rows.find((candidate) => candidate.key === rowKey);
    if (!row) {
      return;
    }
    updateRow(rowKey, {
      costItems: [
        ...(row.costItems ?? []),
        materialPayloadToWorksheetCostItem(rowKey, payload),
      ],
    });
  };

  const updateCostItem = (
    rowKey: string,
    itemId: string,
    payload: MaterialPlanningPayload
  ) => {
    const row = rows.find((candidate) => candidate.key === rowKey);
    if (!row) {
      return;
    }
    updateRow(rowKey, {
      costItems: (row.costItems ?? []).map((item) =>
        item.id === itemId
          ? {
              ...materialPayloadToWorksheetCostItem(rowKey, payload, item.id),
            }
          : item
      ),
    });
  };

  const deleteCostItem = (rowKey: string, itemId: string) => {
    const row = rows.find((candidate) => candidate.key === rowKey);
    if (!row) {
      return;
    }
    updateRow(rowKey, {
      costItems: (row.costItems ?? []).filter((item) => item.id !== itemId),
    });
  };

  const addCustomMilestone = () => {
    const fallbackCount =
      rows.filter((row) => row.type === "custom").length + 1;
    const name =
      customMilestoneName.trim() || `Custom milestone ${fallbackCount}`;
    const nextRow = createCustomMilestoneRow({
      name,
      order: rows.length,
      rows,
    });

    updateRows([...rows, nextRow]);
    setExpanded((current) =>
      current === true ? true : { ...current, [nextRow.key]: true }
    );
    setActiveSubMilestoneByRow((current) => ({
      ...current,
      [nextRow.key]: nextRow.subMilestoneDetails[0]?.id ?? "",
    }));
    setCustomMilestoneName("");
  };

  const reorderRows = useCallback(
    (activeIndex: number, overIndex: number) => {
      const currentRows = rowsRef.current;
      if (
        activeIndex < 0 ||
        overIndex < 0 ||
        activeIndex >= currentRows.length ||
        overIndex >= currentRows.length ||
        activeIndex === overIndex
      ) {
        return;
      }

      updateRows(arrayMove(currentRows, activeIndex, overIndex));
    },
    [updateRows]
  );

  const moveRowByKey = useCallback(
    (rowKey: string, direction: "down" | "up") => {
      const currentIndex = rowsRef.current.findIndex(
        (row) => row.key === rowKey
      );
      const nextIndex =
        direction === "up" ? currentIndex - 1 : currentIndex + 1;
      reorderRows(currentIndex, nextIndex);
    },
    [reorderRows]
  );

  const commitBudgetEdit = useCallback(
    (rowKey: string) => {
      const currentRows = rowsRef.current;
      const row = currentRows.find((candidate) => candidate.key === rowKey);
      if (!row) {
        return;
      }

      const nextBudgetCents = rowBudgetCents(row);
      if (
        cascadeBudgetEdits &&
        !row.excluded &&
        Number.isFinite(nextBudgetCents) &&
        Number.isFinite(targetBudgetCents) &&
        (targetBudgetCents ?? 0) > 0
      ) {
        updateRows(
          cascadeBudgetEdit({
            nextBudgetCents,
            rowKey,
            rows: currentRows,
            targetBudgetCents: targetBudgetCents ?? 0,
          })
        );
        return;
      }

      updateRow(rowKey, {
        budgetText: normalizeCurrencyText(row.budgetText),
      });
    },
    [cascadeBudgetEdits, targetBudgetCents, updateRow, updateRows]
  );

  const columns = useMemo<ColumnDef<TimelineMilestoneWorksheetRow>[]>(
    () =>
      mode === "settings"
        ? settingsColumns({ updateRow, moveRowByKey })
        : setupColumns({ commitBudgetEdit, updateRow, moveRowByKey }),
    [commitBudgetEdit, mode, moveRowByKey, updateRow]
  );
  const table = useReactTable({
    columns,
    data: rows,
    getCoreRowModel: getCoreRowModel(),
    getExpandedRowModel: getExpandedRowModel(),
    getRowCanExpand: () => true,
    getRowId: (row) => row.key,
    onExpandedChange: setExpanded,
    state: { expanded },
  });
  const includedRows = rows.filter((row) => !row.excluded);
  const includedBudgetCents = includedRows.reduce((sum, row) => {
    const budget = rowBudgetCents(row);
    return sum + (Number.isFinite(budget) ? budget : 0);
  }, 0);
  const totalDuration = includedRows.reduce((sum, row) => {
    const duration = rowDurationDays(row);
    return sum + (Number.isFinite(duration) ? duration : 0);
  }, 0);
  const totalPocBps = includedRows.reduce(
    (sum, row) => sum + row.percentageBps,
    0
  );

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
              Cascade
            </Toggle>
          </Group>
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

      <div
        className="timeline-blueprint-table-wrap"
        data-testid="timeline-setup-budget-table"
      >
        <p className="sr-only" id={keyboardInstructionsId}>
          Use Tab to move through controls. In editable worksheet cells, press
          Enter or Arrow Down to move to the next control, and Shift Enter or
          Arrow Up to move to the previous control. Drag handles can be moved
          with Arrow Up and Arrow Down.
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
                    <div className="grid gap-4">
                      <SubMilestoneEditor
                        activeSubMilestoneId={
                          activeSubMilestoneByRow[row.original.key]
                        }
                        mode={mode}
                        onActiveSubMilestoneChange={(subMilestoneId) =>
                          setActiveSubMilestoneByRow((current) => ({
                            ...current,
                            [row.original.key]: subMilestoneId,
                          }))
                        }
                        onAddSubMilestone={(item) =>
                          addSubMilestone(row.original.key, item)
                        }
                        onRemoveSubMilestone={(subMilestoneId) =>
                          removeSubMilestone(row.original.key, subMilestoneId)
                        }
                        onUpdateSubMilestone={(subMilestoneId, patch) =>
                          updateSubMilestone(
                            row.original.key,
                            subMilestoneId,
                            patch
                          )
                        }
                        row={row.original}
                      />
                      {mode === "setup" ? (
                        <MilestonePlanningExtrasEditor
                          contractorOptions={contractorOptions}
                          onAddContractorAssignment={(assignment) =>
                            addContractorAssignment(
                              row.original.key,
                              assignment
                            )
                          }
                          onCreateCostItem={(payload) =>
                            createCostItem(row.original.key, payload)
                          }
                          onDeleteCostItem={(itemId) =>
                            deleteCostItem(row.original.key, itemId)
                          }
                          onRemoveContractorAssignment={(assignmentId) =>
                            removeContractorAssignment(
                              row.original.key,
                              assignmentId
                            )
                          }
                          onUpdateCostItem={(itemId, payload) =>
                            updateCostItem(row.original.key, itemId, payload)
                          }
                          row={row.original}
                        />
                      ) : null}
                      <FieldGuidanceEditor
                        onUpdate={(siteVisitGuidance) =>
                          updateRow(row.original.key, { siteVisitGuidance })
                        }
                        row={row.original}
                      />
                    </div>
                  </TableCell>
                </TableRow>
              ) : null;

              return expandedRow ? [budgetRow, expandedRow] : [budgetRow];
            })}
          </Sortable>
        </Table>
      </div>

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
            >
              {error}
            </p>
          ) : null}
          {mode === "setup" ? (
            <>
              <Button
                className="timeline-setup-secondary"
                onClick={onBack}
                variant="outline"
              >
                Back to templates
              </Button>
              <Button
                className="timeline-setup-primary"
                data-testid="timeline-setup-complete"
                onClick={() =>
                  onComplete?.({ redirectToDurableRoute: false })
                }
              >
                Generate timeline
                <ChevronRight />
              </Button>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function setupColumns({
  commitBudgetEdit,
  moveRowByKey,
  updateRow,
}: {
  commitBudgetEdit: (rowKey: string) => void;
  moveRowByKey: (rowKey: string, direction: "down" | "up") => void;
  updateRow: (
    rowKey: string,
    patch: Partial<TimelineMilestoneWorksheetRow>
  ) => void;
}): ColumnDef<TimelineMilestoneWorksheetRow>[] {
  return [
    nameColumn(moveRowByKey),
    subMilestoneColumn(),
    {
      cell: ({ row }) => (
        <BlueprintInput
          align="right"
          className="timeline-blueprint-money"
          label={`${row.original.name} budget`}
          onBlur={() => commitBudgetEdit(row.original.key)}
          onChange={(budgetText) => updateRow(row.original.key, { budgetText })}
          testId={`timeline-setup-row-budget-${row.original.key}`}
          value={row.original.budgetText}
        />
      ),
      header: "Budget",
      id: "budget",
      size: 150,
    },
    durationColumn(updateRow),
    excludeColumn(updateRow),
    expandColumn(),
  ];
}

function settingsColumns({
  moveRowByKey,
  updateRow,
}: {
  moveRowByKey: (rowKey: string, direction: "down" | "up") => void;
  updateRow: (
    rowKey: string,
    patch: Partial<TimelineMilestoneWorksheetRow>
  ) => void;
}): ColumnDef<TimelineMilestoneWorksheetRow>[] {
  return [
    nameColumn(moveRowByKey, updateRow),
    {
      cell: ({ row }) => (
        <div className="timeline-blueprint-type-cell">
          <BlueprintInput
            label={`${row.original.name} type`}
            onBlur={() => undefined}
            onChange={(type) => updateRow(row.original.key, { type })}
            testId={`timeline-setup-row-type-${row.original.key}`}
            value={row.original.type}
          />
          <select
            aria-label={`${row.original.name} icon`}
            className="timeline-blueprint-select"
            data-testid={`timeline-setup-row-icon-select-${row.original.key}`}
            onChange={(event) =>
              updateRow(row.original.key, {
                icon: event.currentTarget.value as IsometricIconKey,
              })
            }
            value={row.original.icon}
          >
            {iconOptions.map((icon) => (
              <option key={icon} value={icon}>
                {icon}
              </option>
            ))}
          </select>
        </div>
      ),
      header: "Type / icon",
      id: "type",
      size: 230,
    },
    subMilestoneColumn(),
    {
      cell: ({ row }) => (
        <BlueprintInput
          align="right"
          className="timeline-blueprint-percent"
          label={`${row.original.name} PoC`}
          onBlur={() =>
            updateRow(row.original.key, {
              percentageBps: parsePercentToBps(
                row.original.percentageText ?? ""
              ),
              percentageText: normalizePercentText(
                row.original.percentageText ?? ""
              ),
            })
          }
          onChange={(percentageText) =>
            updateRow(row.original.key, {
              percentageBps: parsePercentToBps(percentageText),
              percentageText,
            })
          }
          testId={`timeline-setup-row-poc-${row.original.key}`}
          value={
            row.original.percentageText ?? formatBps(row.original.percentageBps)
          }
        />
      ),
      header: "PoC %",
      id: "poc",
      size: 126,
    },
    durationColumn(updateRow),
    {
      cell: ({ row }) => (
        <Switch
          aria-label={`Include ${row.original.name}`}
          checked={!row.original.excluded}
          className="timeline-blueprint-switch"
          data-testid={`timeline-setup-row-include-${row.original.key}`}
          onCheckedChange={(included) =>
            updateRow(row.original.key, { excluded: !included })
          }
        />
      ),
      header: "Include",
      id: "include",
      size: 110,
    },
    expandColumn(),
  ];
}

function nameColumn(
  moveRowByKey: (rowKey: string, direction: "down" | "up") => void,
  updateRow?: (
    rowKey: string,
    patch: Partial<TimelineMilestoneWorksheetRow>
  ) => void
): ColumnDef<TimelineMilestoneWorksheetRow> {
  return {
    cell: ({ row }) => (
      <div
        className="timeline-blueprint-name-cell"
        data-testid={`timeline-setup-row-name-${row.original.key}`}
      >
        <DragHandle
          id={row.original.key}
          name={row.original.name}
          onMove={(direction) => moveRowByKey(row.original.key, direction)}
        />
        <BlueprintMilestoneIcon
          icon={row.original.icon}
          name={row.original.name}
          testId={`timeline-setup-row-icon-${row.original.key}`}
        />
        <span className="timeline-blueprint-name-copy">
          {updateRow ? (
            <BlueprintInput
              label={`${row.original.name} name`}
              onBlur={() => undefined}
              onChange={(name) => updateRow(row.original.key, { name })}
              testId={`timeline-setup-row-title-${row.original.key}`}
              value={row.original.name}
            />
          ) : (
            <strong>{row.original.name}</strong>
          )}
          <small>{formatRowType(row.original.type)}</small>
        </span>
      </div>
    ),
    header: "Name",
    id: "name",
    size: 380,
  };
}

function subMilestoneColumn(): ColumnDef<TimelineMilestoneWorksheetRow> {
  return {
    cell: ({ row }) => (
      <div className="timeline-blueprint-sub-cell">
        <Badge className="timeline-blueprint-mini-badge" variant="outline">
          {row.original.subMilestoneDetails.length} sub-milestones
        </Badge>
        <span>{row.original.subMilestones.slice(0, 3).join(", ")}</span>
      </div>
    ),
    header: "Submilestones",
    id: "subMilestones",
    size: 330,
  };
}

function durationColumn(
  updateRow: (
    rowKey: string,
    patch: Partial<TimelineMilestoneWorksheetRow>
  ) => void
): ColumnDef<TimelineMilestoneWorksheetRow> {
  return {
    cell: ({ row }) => (
      <BlueprintInput
        align="center"
        className="timeline-blueprint-duration"
        label={`${row.original.name} duration`}
        onBlur={() =>
          updateRow(row.original.key, {
            durationDays: parseDurationDays(row.original.durationText),
            durationText: normalizeDurationText(row.original.durationText),
          })
        }
        onChange={(durationText) =>
          updateRow(row.original.key, {
            durationDays: parseDurationDays(durationText),
            durationText: durationText
              .replace(DURATION_PREFIX_REGEX, "")
              .replace(NON_DIGIT_REGEX, ""),
          })
        }
        testId={`timeline-setup-row-duration-${row.original.key}`}
        value={`T${row.original.durationText}`}
      />
    ),
    header: "Duration",
    id: "duration",
    size: 126,
  };
}

function excludeColumn(
  updateRow: (
    rowKey: string,
    patch: Partial<TimelineMilestoneWorksheetRow>
  ) => void
): ColumnDef<TimelineMilestoneWorksheetRow> {
  return {
    cell: ({ row }) => (
      <Switch
        aria-label={`Exclude ${row.original.name}`}
        checked={row.original.excluded}
        className="timeline-blueprint-switch"
        data-testid={`timeline-setup-row-exclude-${row.original.key}`}
        onCheckedChange={(excluded) =>
          updateRow(row.original.key, { excluded })
        }
      />
    ),
    header: "Exclude",
    id: "exclude",
    size: 110,
  };
}

function expandColumn(): ColumnDef<TimelineMilestoneWorksheetRow> {
  return {
    cell: ({ row }) => (
      <button
        aria-controls={getExpandedRowId(row.original.key)}
        aria-expanded={row.getIsExpanded()}
        aria-label={`${row.getIsExpanded() ? "Collapse" : "Expand"} ${row.original.name}`}
        className="timeline-blueprint-expand"
        data-testid={`timeline-setup-row-expand-${row.original.key}`}
        onClick={row.getToggleExpandedHandler()}
        type="button"
      >
        {row.getIsExpanded() ? <ChevronDown /> : <ChevronRight />}
      </button>
    ),
    header: () => <span className="sr-only">Sub-milestone details</span>,
    id: "expand",
    size: 64,
  };
}

function BlueprintMilestoneIcon({
  icon,
  name,
  testId,
}: {
  icon: IsometricIconKey;
  name: string;
  testId?: string;
}) {
  const sources: Record<IsometricIconKey, string> = {
    change: "/drawflow-milestone-blueprint-icons/change.png",
    closeout: "/drawflow-milestone-blueprint-icons/closeout.png",
    drywall: "/drawflow-milestone-blueprint-icons/drywall.png",
    exterior: "/drawflow-milestone-blueprint-icons/exterior.png",
    finishes: "/drawflow-milestone-blueprint-icons/finishes.png",
    foundation: "/drawflow-milestone-blueprint-icons/foundation.png",
    framing: "/drawflow-milestone-blueprint-icons/framing.png",
    kitchen: "/milestone-icons/kitchen.png",
    plumbing: "/milestone-icons/plumbing.png",
    roofing: "/milestone-icons/roofing.png",
    roughIn: "/drawflow-milestone-blueprint-icons/rough-in.png",
  };

  return (
    <span className="timeline-blueprint-icon-shell">
      <img
        alt={`${name} blueprint milestone icon`}
        className="timeline-blueprint-icon"
        data-icon={icon}
        data-testid={testId}
        draggable={false}
        height={58}
        loading="lazy"
        src={sources[icon]}
        width={58}
      />
    </span>
  );
}

function BlueprintInput({
  align = "left",
  className,
  id,
  label,
  labelledBy,
  onBlur,
  onChange,
  testId,
  value,
}: {
  align?: "left" | "center" | "right";
  className?: string;
  id?: string;
  label: string;
  labelledBy?: string;
  onBlur: () => void;
  onChange: (value: string) => void;
  testId: string;
  value: string;
}) {
  return (
    <input
      aria-keyshortcuts="Enter Shift+Enter ArrowDown ArrowUp"
      aria-label={labelledBy ? undefined : label}
      aria-labelledby={labelledBy}
      className={cn("timeline-blueprint-input", className)}
      data-align={align}
      data-testid={testId}
      id={id}
      onBlur={onBlur}
      onChange={(event) => onChange(event.currentTarget.value)}
      onKeyDown={handleBlueprintInputKeyDown}
      value={value}
    />
  );
}

function handleBlueprintInputKeyDown(event: KeyboardEvent<HTMLInputElement>) {
  if (event.altKey || event.ctrlKey || event.metaKey) {
    return;
  }

  if (event.key === "Enter") {
    event.preventDefault();
    focusAdjacentTableControl(event.currentTarget, event.shiftKey ? -1 : 1);
    return;
  }

  if (event.key === "ArrowDown") {
    event.preventDefault();
    focusAdjacentTableControl(event.currentTarget, 1);
    return;
  }

  if (event.key === "ArrowUp") {
    event.preventDefault();
    focusAdjacentTableControl(event.currentTarget, -1);
  }
}

function focusAdjacentTableControl(
  currentControl: HTMLElement,
  direction: 1 | -1
) {
  const table = currentControl.closest("table");
  if (!table) {
    return;
  }

  const controls = Array.from(
    table.querySelectorAll<HTMLElement>(FOCUSABLE_TABLE_CONTROL_SELECTOR)
  ).filter(
    (control) =>
      control.tabIndex >= 0 &&
      control.getAttribute("aria-hidden") !== "true" &&
      !control.closest('[aria-hidden="true"]')
  );
  const currentIndex = controls.indexOf(currentControl);
  const nextControl = controls[currentIndex + direction];
  nextControl?.focus();
}

function getExpandedRowId(rowKey: string) {
  return `timeline-blueprint-expanded-${rowKey}`;
}

function SubMilestoneEditor({
  activeSubMilestoneId,
  mode,
  onActiveSubMilestoneChange,
  onAddSubMilestone,
  onRemoveSubMilestone,
  onUpdateSubMilestone,
  row,
}: {
  activeSubMilestoneId?: string;
  mode: WorksheetMode;
  onActiveSubMilestoneChange: (subMilestoneId: string) => void;
  onAddSubMilestone: (item?: SubMilestoneBankItem) => void;
  onRemoveSubMilestone: (subMilestoneId: string) => void;
  onUpdateSubMilestone: (
    subMilestoneId: string,
    patch: Partial<TimelineMilestoneWorksheetSubMilestone>
  ) => void;
  row: TimelineMilestoneWorksheetRow;
}) {
  const subMilestones = row.subMilestoneDetails;
  const activeSubMilestone =
    subMilestones.find((detail) => detail.id === activeSubMilestoneId) ??
    subMilestones[0];
  const valueLabel = mode === "settings" ? "PoC" : "Budget";
  const valueFieldLabelId = activeSubMilestone
    ? `timeline-submilestone-value-label-${activeSubMilestone.id}`
    : undefined;
  const durationFieldLabelId = activeSubMilestone
    ? `timeline-submilestone-duration-label-${activeSubMilestone.id}`
    : undefined;

  return (
    <div className="timeline-submilestone-editor">
      <section
        aria-label={`${row.name} sub-milestones`}
        className="timeline-submilestone-list-pane"
      >
        <div className="timeline-submilestone-editor-heading">
          <div>
            <Badge className="timeline-blueprint-mini-badge" variant="outline">
              {subMilestones.length} sub-milestones
            </Badge>
            <p>{row.name}</p>
          </div>
          <SubMilestoneBankPicker
            existingNames={subMilestones.map((subMilestone) =>
              sanitizeSubMilestoneName(subMilestone.name)
            )}
            onAdd={onAddSubMilestone}
            rowKey={row.key}
          />
        </div>
        <div className="timeline-submilestone-card-list">
          {subMilestones.map((subMilestone) => {
            const selected = subMilestone.id === activeSubMilestone?.id;
            return (
              <article
                className="timeline-submilestone-card"
                data-selected={selected ? "true" : undefined}
                data-testid={`timeline-setup-submilestone-card-${subMilestone.id}`}
                key={subMilestone.id}
              >
                <button
                  aria-pressed={selected}
                  className="timeline-submilestone-card-main"
                  onClick={() => onActiveSubMilestoneChange(subMilestone.id)}
                  type="button"
                >
                  <span className="timeline-submilestone-card-title">
                    <strong>
                      {sanitizeSubMilestoneName(subMilestone.name)}
                    </strong>
                    <small>{subMilestone.description}</small>
                  </span>
                  <span className="timeline-submilestone-card-metrics">
                    <span>
                      <small>{valueLabel}</small>
                      <strong>
                        {mode === "settings"
                          ? (subMilestone.percentageText ??
                            formatBps(subMilestone.percentageBps ?? 0))
                          : subMilestone.budgetText}
                      </strong>
                    </span>
                    <span>
                      <small>Duration</small>
                      <strong>T{subMilestone.durationText}</strong>
                    </span>
                  </span>
                </button>
                <button
                  aria-label={`Remove ${sanitizeSubMilestoneName(subMilestone.name)}`}
                  className="timeline-submilestone-remove"
                  data-testid={`timeline-setup-submilestone-remove-${subMilestone.id}`}
                  onClick={() => onRemoveSubMilestone(subMilestone.id)}
                  type="button"
                >
                  <Trash2 aria-hidden="true" />
                </button>
              </article>
            );
          })}
        </div>
      </section>

      <section
        aria-label="Selected sub-milestone details"
        className="timeline-submilestone-detail-pane"
      >
        {activeSubMilestone ? (
          <div
            className="timeline-submilestone-detail-body"
            key={activeSubMilestone.id}
          >
            <div className="timeline-submilestone-detail-header">
              <span>Selected sub-milestone</span>
              <strong>
                {sanitizeSubMilestoneName(activeSubMilestone.name)}
              </strong>
            </div>
            <label className="timeline-submilestone-detail-field is-wide">
              <span>Name</span>
              <input
                aria-label="Sub-milestone name"
                data-testid={`timeline-setup-submilestone-name-${activeSubMilestone.id}`}
                onChange={(event) =>
                  onUpdateSubMilestone(activeSubMilestone.id, {
                    name: event.currentTarget.value,
                  })
                }
                value={activeSubMilestone.name}
              />
            </label>
            <label className="timeline-submilestone-detail-field is-wide">
              <span>Scope note</span>
              <textarea
                aria-label="Sub-milestone scope note"
                data-testid={`timeline-setup-submilestone-description-${activeSubMilestone.id}`}
                onChange={(event) =>
                  onUpdateSubMilestone(activeSubMilestone.id, {
                    description: event.currentTarget.value,
                  })
                }
                value={activeSubMilestone.description}
              />
            </label>
            <div className="timeline-submilestone-detail-grid">
              <div className="timeline-submilestone-detail-field">
                <span id={valueFieldLabelId}>{valueLabel}</span>
                <BlueprintInput
                  align="right"
                  className="timeline-submilestone-detail-input"
                  label={`Sub-milestone ${valueLabel.toLowerCase()}`}
                  labelledBy={valueFieldLabelId}
                  onBlur={() =>
                    onUpdateSubMilestone(
                      activeSubMilestone.id,
                      mode === "settings"
                        ? {
                            percentageBps: parsePercentToBps(
                              activeSubMilestone.percentageText ?? ""
                            ),
                            percentageText: normalizePercentText(
                              activeSubMilestone.percentageText ?? ""
                            ),
                          }
                        : {
                            budgetText: normalizeCurrencyText(
                              activeSubMilestone.budgetText
                            ),
                          }
                    )
                  }
                  onChange={(value) =>
                    onUpdateSubMilestone(
                      activeSubMilestone.id,
                      mode === "settings"
                        ? {
                            percentageBps: parsePercentToBps(value),
                            percentageText: value,
                          }
                        : { budgetText: value }
                    )
                  }
                  testId={`timeline-setup-submilestone-budget-${activeSubMilestone.id}`}
                  value={
                    mode === "settings"
                      ? (activeSubMilestone.percentageText ??
                        formatBps(activeSubMilestone.percentageBps ?? 0))
                      : activeSubMilestone.budgetText
                  }
                />
              </div>
              <div className="timeline-submilestone-detail-field">
                <span id={durationFieldLabelId}>Duration</span>
                <BlueprintInput
                  align="center"
                  className="timeline-submilestone-detail-input"
                  label="Sub-milestone duration"
                  labelledBy={durationFieldLabelId}
                  onBlur={() =>
                    onUpdateSubMilestone(activeSubMilestone.id, {
                      durationText: normalizeDurationText(
                        activeSubMilestone.durationText
                      ),
                    })
                  }
                  onChange={(durationText) =>
                    onUpdateSubMilestone(activeSubMilestone.id, {
                      durationText: durationText
                        .replace(DURATION_PREFIX_REGEX, "")
                        .replace(NON_DIGIT_REGEX, ""),
                    })
                  }
                  testId={`timeline-setup-submilestone-duration-${activeSubMilestone.id}`}
                  value={`T${activeSubMilestone.durationText}`}
                />
              </div>
            </div>
            <button
              aria-label={`Remove ${sanitizeSubMilestoneName(activeSubMilestone.name)}`}
              className="timeline-submilestone-detail-remove"
              data-testid={`timeline-setup-submilestone-detail-remove-${activeSubMilestone.id}`}
              onClick={() => onRemoveSubMilestone(activeSubMilestone.id)}
              type="button"
            >
              <Trash2 aria-hidden="true" />
              Remove sub-milestone
            </button>
          </div>
        ) : (
          <div className="timeline-submilestone-empty">
            <strong>No sub-milestones</strong>
            <button
              onClick={() =>
                onAddSubMilestone({
                  category: "Custom",
                  description: "Custom scope checkpoint",
                  durationText: DEFAULT_NEW_SUB_MILESTONE_DURATION_TEXT,
                  name: "New sub-milestone",
                })
              }
              type="button"
            >
              <Plus aria-hidden="true" />
              Add sub-milestone
            </button>
          </div>
        )}
      </section>
    </div>
  );
}

function MilestonePlanningExtrasEditor({
  contractorOptions,
  onAddContractorAssignment,
  onCreateCostItem,
  onDeleteCostItem,
  onRemoveContractorAssignment,
  onUpdateCostItem,
  row,
}: {
  contractorOptions: TimelineMilestoneWorksheetContractorOption[];
  onAddContractorAssignment: (
    assignment: Omit<TimelineMilestoneWorksheetContractorAssignment, "id">
  ) => void;
  onCreateCostItem: (payload: MaterialPlanningPayload) => void;
  onDeleteCostItem: (itemId: string) => void;
  onRemoveContractorAssignment: (assignmentId: string) => void;
  onUpdateCostItem: (itemId: string, payload: MaterialPlanningPayload) => void;
  row: TimelineMilestoneWorksheetRow;
}) {
  const costItemCount = (row.costItems ?? []).length;

  return (
    <div className="timeline-blueprint-planning-extras">
      <ContractorAssignmentEditor
        contractorOptions={contractorOptions}
        onAddAssignment={onAddContractorAssignment}
        onRemoveAssignment={onRemoveContractorAssignment}
        row={row}
      />
      <section
        aria-label={`${row.name} materials and equipment`}
        className="timeline-blueprint-planning-pane timeline-blueprint-planning-pane-materials"
      >
        <div className="timeline-blueprint-planning-pane-heading">
          <div>
            <Badge className="timeline-blueprint-mini-badge" variant="outline">
              Materials
            </Badge>
            <strong>Build materials and equipment</strong>
            <p>
              Cost-only entries stay attached to this milestone and its
              sub-milestones.
            </p>
          </div>
          <span className="timeline-blueprint-planning-count">
            {costItemCount} item{costItemCount === 1 ? "" : "s"}
          </span>
        </div>
        <div className="timeline-blueprint-material-planning">
          <MaterialPlanningTab
            actions={{
              create: onCreateCostItem,
              delete: (item) => onDeleteCostItem(item._id),
              update: (item, payload) => onUpdateCostItem(item._id, payload),
            }}
            items={worksheetCostItemsToMaterialItems(row)}
            milestones={[worksheetRowToMaterialMilestone(row)]}
            panelLayout="stacked"
            scopeLabel="Milestone"
            showChangeReason={false}
            variant="embedded"
          />
        </div>
      </section>
    </div>
  );
}

function ContractorAssignmentEditor({
  contractorOptions,
  onAddAssignment,
  onRemoveAssignment,
  row,
}: {
  contractorOptions: TimelineMilestoneWorksheetContractorOption[];
  onAddAssignment: (
    assignment: Omit<TimelineMilestoneWorksheetContractorAssignment, "id">
  ) => void;
  onRemoveAssignment: (assignmentId: string) => void;
  row: TimelineMilestoneWorksheetRow;
}) {
  const [contractorName, setContractorName] = useState("");
  const [contractorPickerOpen, setContractorPickerOpen] = useState(false);
  const [estimatedCostText, setEstimatedCostText] = useState("");
  const [estimatedHoursText, setEstimatedHoursText] = useState("");
  const [role, setRole] = useState("");
  const [subMilestoneIds, setSubMilestoneIds] = useState<string[]>([]);
  const assignments = row.contractorAssignments ?? [];
  const normalizedContractorQuery = contractorName.trim().toLowerCase();
  const visibleContractorOptions = useMemo(
    () =>
      contractorOptions.filter((option) => {
        if (!normalizedContractorQuery) {
          return true;
        }
        return [
          option.name,
          option.city ?? "",
          ...(option.trades ?? []),
        ].some((value) =>
          value.trim().toLowerCase().includes(normalizedContractorQuery)
        );
      }),
    [contractorOptions, normalizedContractorQuery]
  );
  const selectedContractor = contractorOptions.find(
    (option) =>
      option.name.trim().toLowerCase() === contractorName.trim().toLowerCase()
  );
  const hasContractorOptions = contractorOptions.length > 0;

  const toggleSubMilestone = (subMilestoneId: string, checked: boolean) => {
    setSubMilestoneIds((current) =>
      checked
        ? [...new Set([...current, subMilestoneId])]
        : current.filter((id) => id !== subMilestoneId)
    );
  };

  const addAssignment = () => {
    const normalizedName = contractorName.trim();
    if (!normalizedName) {
      return;
    }
    const normalizedRole =
      role.trim() || selectedContractor?.trades?.[0]?.trim() || "Contractor";
    onAddAssignment({
      contractorId: selectedContractor?.contractorId,
      contractorName: selectedContractor?.name ?? normalizedName,
      estimatedCostCents: parseOptionalCurrencyCents(estimatedCostText),
      estimatedHours: parseOptionalHours(estimatedHoursText),
      role: normalizedRole,
      subMilestoneIds,
    });
    setContractorName("");
    setEstimatedCostText("");
    setEstimatedHoursText("");
    setRole("");
    setSubMilestoneIds([]);
  };

  const selectContractorOption = (
    option: TimelineMilestoneWorksheetContractorOption
  ) => {
    setContractorName(option.name);
    if (!role.trim()) {
      setRole(option.trades?.[0]?.trim() ?? "Contractor");
    }
    setContractorPickerOpen(false);
  };

  return (
    <section
      aria-label={`${row.name} contractor assignments`}
      className="timeline-blueprint-planning-pane timeline-blueprint-planning-pane-contractors"
    >
      <div className="timeline-blueprint-planning-pane-heading">
        <div>
          <Badge className="timeline-blueprint-mini-badge" variant="outline">
            Contractors
          </Badge>
          <strong>Milestone crew planning</strong>
          <p>
            Assign an existing contractor or type a guest contractor name.
          </p>
        </div>
        <span className="timeline-blueprint-planning-count">
          {assignments.length} assignment
          {assignments.length === 1 ? "" : "s"}
        </span>
      </div>

      <div className="grid gap-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="grid gap-1.5 text-sm">
            <span className="font-medium">Contractor</span>
            <div className="timeline-contractor-autocomplete">
              <Autocomplete
                autoHighlight="always"
                filter={null}
                itemToStringValue={(
                  option: TimelineMilestoneWorksheetContractorOption
                ) => option.name}
                items={visibleContractorOptions}
                keepHighlight
                modal={false}
                onOpenChange={(nextOpen) =>
                  setContractorPickerOpen(nextOpen && hasContractorOptions)
                }
                onValueChange={(nextQuery) => {
                  setContractorName(nextQuery);
                  setContractorPickerOpen(hasContractorOptions);
                }}
                open={contractorPickerOpen && hasContractorOptions}
                openOnInputClick
                value={contractorName}
              >
                <AutocompleteInput
                  aria-label="Contractor"
                  className="timeline-blueprint-input timeline-contractor-autocomplete-input"
                  data-testid={`timeline-setup-contractor-name-${row.key}`}
                  onClick={() =>
                    setContractorPickerOpen(hasContractorOptions)
                  }
                  onFocus={() =>
                    setContractorPickerOpen(hasContractorOptions)
                  }
                  placeholder="Company or crew name"
                  showClear={Boolean(contractorName.trim())}
                  showTrigger={hasContractorOptions}
                  size="sm"
                />
                <AutocompletePopup className="timeline-contractor-autocomplete-popup">
                  <AutocompleteEmpty className="timeline-contractor-autocomplete-empty">
                    No contractors match this search.
                  </AutocompleteEmpty>
                  <AutocompleteList className="timeline-contractor-autocomplete-list">
                    {(
                      option: TimelineMilestoneWorksheetContractorOption
                    ) => (
                      <AutocompleteItem
                        className="timeline-contractor-autocomplete-item"
                        key={option.contractorId}
                        onClick={() => selectContractorOption(option)}
                        value={option}
                      >
                        <span>
                          <strong>{option.name}</strong>
                          <small>
                            {option.trades?.length
                              ? option.trades.join(", ")
                              : "Contractor"}
                            {option.city ? ` / ${option.city}` : ""}
                          </small>
                        </span>
                        <em>{option.trades?.[0] ?? "Crew"}</em>
                      </AutocompleteItem>
                    )}
                  </AutocompleteList>
                </AutocompletePopup>
              </Autocomplete>
            </div>
          </label>
          <label className="grid gap-1.5 text-sm">
            <span className="font-medium">Role / trade</span>
            <input
              className="timeline-blueprint-input"
              data-testid={`timeline-setup-contractor-role-${row.key}`}
              onChange={(event) => setRole(event.currentTarget.value)}
              placeholder={selectedContractor?.trades?.[0] ?? "Contractor"}
              value={role}
            />
          </label>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="grid gap-1.5 text-sm">
            <span className="font-medium">Estimated cost</span>
            <input
              className="timeline-blueprint-input"
              data-testid={`timeline-setup-contractor-cost-${row.key}`}
              inputMode="decimal"
              onChange={(event) =>
                setEstimatedCostText(event.currentTarget.value)
              }
              placeholder="$0"
              value={estimatedCostText}
            />
          </label>
          <label className="grid gap-1.5 text-sm">
            <span className="font-medium">Estimated hours</span>
            <input
              className="timeline-blueprint-input"
              data-testid={`timeline-setup-contractor-hours-${row.key}`}
              inputMode="decimal"
              onChange={(event) =>
                setEstimatedHoursText(event.currentTarget.value)
              }
              placeholder="0"
              value={estimatedHoursText}
            />
          </label>
        </div>
        <div className="grid gap-2">
          <p className="font-medium text-sm">Sub-milestone scope</p>
          <div className="flex flex-wrap gap-2">
            {row.subMilestoneDetails.length > 0 ? (
              row.subMilestoneDetails.map((subMilestone) => {
                const checked = subMilestoneIds.includes(subMilestone.id);
                return (
                  <label
                    className="timeline-blueprint-planning-scope-chip"
                    key={subMilestone.id}
                  >
                    <input
                      checked={checked}
                      onChange={(event) =>
                        toggleSubMilestone(
                          subMilestone.id,
                          event.currentTarget.checked
                        )
                      }
                      type="checkbox"
                    />
                    <span>{sanitizeSubMilestoneName(subMilestone.name)}</span>
                  </label>
                );
              })
            ) : (
              <p className="text-muted-foreground text-sm">
                No sub-milestones are defined for this milestone.
              </p>
            )}
          </div>
        </div>
        <div className="flex justify-end">
          <button
            className="timeline-blueprint-planning-action"
            data-testid={`timeline-setup-add-contractor-${row.key}`}
            disabled={!contractorName.trim()}
            onClick={addAssignment}
            type="button"
          >
            <Plus aria-hidden="true" />
            Add contractor
          </button>
        </div>
      </div>

      <div className="grid gap-2">
        {assignments.length > 0 ? (
          assignments.map((assignment) => (
            <article
              className="timeline-blueprint-planning-card"
              data-testid={`timeline-setup-contractor-assignment-${assignment.id}`}
              key={assignment.id}
            >
              <div className="timeline-blueprint-planning-card-header">
                <div>
                  <strong>{assignment.contractorName}</strong>
                  <small>{assignment.role}</small>
                </div>
                <button
                  aria-label={`Remove ${assignment.contractorName}`}
                  className="timeline-submilestone-remove"
                  onClick={() => onRemoveAssignment(assignment.id)}
                  type="button"
                >
                  <Trash2 aria-hidden="true" />
                </button>
              </div>
              <div className="timeline-blueprint-planning-card-meta">
                <span>
                  {assignment.subMilestoneIds.length > 0
                    ? assignment.subMilestoneIds
                        .map((id) => subMilestoneNameById(row, id))
                        .join(", ")
                    : "Milestone-level"}
                </span>
                {assignment.estimatedCostCents ? (
                  <span>{formatCurrency(assignment.estimatedCostCents)}</span>
                ) : null}
                {assignment.estimatedHours ? (
                  <span>
                    {assignment.estimatedHours} hr
                    {assignment.estimatedHours === 1 ? "" : "s"}
                  </span>
                ) : null}
              </div>
            </article>
          ))
        ) : (
          <p className="timeline-blueprint-planning-empty">
            No contractors assigned yet.
          </p>
        )}
      </div>
    </section>
  );
}

function FieldGuidanceEditor({
  onUpdate,
  row,
}: {
  onUpdate: (guidance: SiteVisitGuidanceHtml) => void;
  row: TimelineMilestoneWorksheetRow;
}) {
  const guidance = coerceSiteVisitGuidance(
    row.siteVisitGuidance,
    defaultGuidanceForRow(row)
  );
  return (
    <section
      aria-label={`${row.name} field guidance`}
      className="timeline-blueprint-field-guidance"
      data-testid={`timeline-settings-field-guidance-${row.key}`}
    >
      <div className="timeline-blueprint-planning-pane-heading">
        <div>
          <Badge className="timeline-blueprint-mini-badge" variant="outline">
            Field Guidance
          </Badge>
          <strong>Site visitor checklist</strong>
          <p>Configure what the lender team should verify on site.</p>
        </div>
      </div>
      <div className="timeline-blueprint-field-guidance-grid">
        <label className="timeline-submilestone-detail-field is-wide timeline-field-rich-text-field">
          <span>What to verify</span>
          <FieldRichTextEditor
            ariaLabel={`${row.name} what to verify`}
            editorMinHeightClass="[&_.ProseMirror]:min-h-[4.5rem]"
            imageMaxHeightClass="[&_.ProseMirror_img]:max-h-40"
            onChange={(whatToVerify) =>
              onUpdate({
                ...guidance,
                whatToVerify,
              })
            }
            placeholder="Verification checklist, notes, and reference photos..."
            testId={`timeline-settings-guidance-verify-${row.key}`}
            value={guidance.whatToVerify}
          />
        </label>
        <label className="timeline-submilestone-detail-field is-wide timeline-field-rich-text-field">
          <span>Required photo angles</span>
          <FieldRichTextEditor
            ariaLabel={`${row.name} required photo angles`}
            editorMinHeightClass="[&_.ProseMirror]:min-h-[4.5rem]"
            imageMaxHeightClass="[&_.ProseMirror_img]:max-h-40"
            onChange={(cameraAngles) =>
              onUpdate({
                ...guidance,
                cameraAngles,
              })
            }
            placeholder="Required angles, framing notes, and example photos..."
            testId={`timeline-settings-guidance-camera-${row.key}`}
            value={guidance.cameraAngles}
          />
        </label>
      </div>
    </section>
  );
}

function SubMilestoneBankPicker({
  existingNames,
  onAdd,
  rowKey,
}: {
  existingNames: string[];
  onAdd: (item: SubMilestoneBankItem) => void;
  rowKey: string;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const existingNameSet = useMemo(
    () => new Set(existingNames.map((name) => name.trim().toLowerCase())),
    [existingNames]
  );
  const filteredItems = useMemo(
    () =>
      SUB_MILESTONE_BANK.filter(
        (item) =>
          !existingNameSet.has(item.name.toLowerCase()) &&
          matchesSubMilestoneBankQuery(item, query)
      ),
    [existingNameSet, query]
  );
  const groupedItems = useMemo(() => {
    const groups = new Map<string, SubMilestoneBankItem[]>();
    for (const item of filteredItems) {
      groups.set(item.category, [...(groups.get(item.category) ?? []), item]);
    }
    return [...groups.entries()];
  }, [filteredItems]);
  const customName = sanitizeSubMilestoneName(query);
  const normalizedCustomName = customName.toLowerCase();
  const canCreate =
    query.trim().length > 1 &&
    !existingNameSet.has(normalizedCustomName) &&
    !SUB_MILESTONE_BANK.some(
      (item) => item.name.toLowerCase() === normalizedCustomName
    );
  const addItem = (item: SubMilestoneBankItem) => {
    onAdd(item);
    setQuery("");
    setOpen(false);
  };
  const addCustomSubMilestone = () => {
    addItem({
      budgetText: DEFAULT_NEW_SUB_MILESTONE_BUDGET_TEXT,
      category: "Custom",
      description: "Custom scope checkpoint",
      durationText: DEFAULT_NEW_SUB_MILESTONE_DURATION_TEXT,
      name: canCreate
        ? customName
        : makeUniqueSubMilestoneName("New sub-milestone", existingNameSet),
    });
  };

  return (
    <div className="timeline-submilestone-bank">
      <Autocomplete
        autoHighlight="always"
        keepHighlight
        modal={false}
        onOpenChange={(nextOpen) =>
          setOpen(nextOpen && filteredItems.length > 0)
        }
        onValueChange={(nextQuery) => {
          setQuery(nextQuery);
          setOpen(
            hasAvailableSubMilestoneBankMatches(existingNameSet, nextQuery)
          );
        }}
        open={open}
        openOnInputClick
        value={query}
      >
        <div className="timeline-submilestone-bank-controls">
          <AutocompleteInput
            aria-label="Add sub-milestone from bank"
            className="timeline-submilestone-bank-input"
            data-testid={`timeline-setup-submilestone-bank-input-${rowKey}`}
            onFocus={() => setOpen(filteredItems.length > 0)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && canCreate) {
                event.preventDefault();
                addCustomSubMilestone();
              }
            }}
            placeholder="Add from sub-milestone bank..."
            showClear
            showTrigger
            size="sm"
          />
          <Button
            aria-label={
              canCreate
                ? `Add custom sub-milestone ${customName}`
                : "Add custom sub-milestone"
            }
            className="timeline-submilestone-bank-custom-button"
            data-testid={`timeline-setup-submilestone-bank-custom-${rowKey}`}
            onClick={addCustomSubMilestone}
            onMouseDown={(event) => event.preventDefault()}
            type="button"
            variant="outline"
          >
            <Plus aria-hidden="true" />
            Add custom
          </Button>
        </div>
        <AutocompletePopup className="timeline-submilestone-bank-popup">
          <AutocompleteList className="timeline-submilestone-bank-list">
            {groupedItems.map(([category, items]) => (
              <AutocompleteGroup key={category}>
                <AutocompleteGroupLabel className="timeline-submilestone-bank-label">
                  {category}
                </AutocompleteGroupLabel>
                {items.map((item) => (
                  <button
                    className="timeline-submilestone-bank-item"
                    data-testid={`timeline-setup-submilestone-bank-item-${slugifySubMilestone(item.name)}`}
                    key={item.name}
                    onClick={() => addItem(item)}
                    onMouseDown={(event) => event.preventDefault()}
                    type="button"
                  >
                    <span>
                      <strong>{item.name}</strong>
                      <small>{item.description}</small>
                    </span>
                    <em>T{item.durationText}</em>
                  </button>
                ))}
              </AutocompleteGroup>
            ))}
            {canCreate ? (
              <button
                className="timeline-submilestone-bank-item is-create"
                data-testid={`timeline-setup-submilestone-bank-create-${rowKey}`}
                onClick={() =>
                  addItem({
                    budgetText: DEFAULT_NEW_SUB_MILESTONE_BUDGET_TEXT,
                    category: "Custom",
                    description: "Custom scope checkpoint",
                    durationText: DEFAULT_NEW_SUB_MILESTONE_DURATION_TEXT,
                    name: customName,
                  })
                }
                onMouseDown={(event) => event.preventDefault()}
                type="button"
              >
                <span>
                  <strong>Create "{customName}"</strong>
                  <small>Add a custom reimbursement checkpoint</small>
                </span>
                <Plus aria-hidden="true" />
              </button>
            ) : null}
            {filteredItems.length === 0 && !canCreate ? (
              <div className="timeline-submilestone-bank-empty">
                No available bank item matches this search.
              </div>
            ) : null}
          </AutocompleteList>
        </AutocompletePopup>
      </Autocomplete>
    </div>
  );
}

function DragHandle({
  id,
  name,
  onMove,
}: {
  id: string;
  name: string;
  onMove: (direction: "down" | "up") => void;
}) {
  return (
    <SortableItemHandle
      aria-label={`Drag ${name}`}
      className="timeline-blueprint-drag-handle"
      data-testid={`timeline-setup-row-drag-${id}`}
      onKeyDown={(event) => {
        if (event.key === "ArrowUp") {
          event.preventDefault();
          onMove("up");
        }
        if (event.key === "ArrowDown") {
          event.preventDefault();
          onMove("down");
        }
      }}
      render={<button type="button" />}
    >
      <GripVertical aria-hidden="true" />
    </SortableItemHandle>
  );
}

function MetricPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="timeline-blueprint-metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function createCustomMilestoneRow({
  name,
  order,
  rows,
}: {
  name: string;
  order: number;
  rows: TimelineMilestoneWorksheetRow[];
}): TimelineMilestoneWorksheetRow {
  const key = makeUniqueRowKey(name, rows);
  const subMilestoneDetails: TimelineMilestoneWorksheetSubMilestone[] = [
    {
      budgetText: DEFAULT_NEW_SUB_MILESTONE_BUDGET_TEXT,
      description:
        "Define reimbursable scope, evidence, and acceptance criteria",
      durationText: DEFAULT_NEW_SUB_MILESTONE_DURATION_TEXT,
      id: `${key}-scope-definition-0`,
      name: "Scope definition",
      percentageBps: 0,
      percentageText: "0.00%",
    },
  ];

  return withSubMilestoneDetails(
    {
      budgetText: DEFAULT_NEW_MILESTONE_BUDGET_TEXT,
      contractorAssignments: [],
      costItems: [],
      dependencyKeys: [],
      durationDays: Number(DEFAULT_NEW_MILESTONE_DURATION_TEXT),
      durationText: DEFAULT_NEW_MILESTONE_DURATION_TEXT,
      excluded: false,
      icon: "change",
      key,
      name,
      order,
      percentageBps: 0,
      percentageText: "0.00%",
      siteVisitGuidance: {
        cameraAngles: guidanceLinesToHtml([
          "Wide shot showing the full custom milestone work area.",
          "Close-up of the primary completion detail.",
        ]),
        whatToVerify: guidanceLinesToHtml([
          "Custom milestone scope is complete and consistent with the approved draw plan.",
        ]),
      },
      subMilestoneDetails,
      subMilestones: [],
      type: "custom",
    },
    subMilestoneDetails
  );
}

function withSubMilestoneDetails(
  row: TimelineMilestoneWorksheetRow,
  subMilestoneDetails: TimelineMilestoneWorksheetSubMilestone[]
): TimelineMilestoneWorksheetRow {
  const availableSubMilestoneIds = new Set(
    subMilestoneDetails.map((detail) => detail.id)
  );
  return {
    ...row,
    contractorAssignments: (row.contractorAssignments ?? []).map(
      (assignment) => ({
        ...assignment,
        subMilestoneIds: assignment.subMilestoneIds.filter((id) =>
          availableSubMilestoneIds.has(id)
        ),
      })
    ),
    costItems: (row.costItems ?? []).map((item) => ({
      ...item,
      relevantSubMilestoneIds: item.relevantSubMilestoneIds.filter((id) =>
        availableSubMilestoneIds.has(id)
      ),
    })),
    subMilestoneDetails,
    subMilestones: subMilestoneDetails.map((detail) =>
      sanitizeSubMilestoneName(detail.name)
    ),
  };
}

function worksheetRowToMaterialMilestone(
  row: TimelineMilestoneWorksheetRow
): MaterialPlanningMilestone {
  const budgetCents = rowBudgetCents(row);
  return {
    budgetCents: Number.isFinite(budgetCents) ? Math.max(0, budgetCents) : 0,
    key: row.key,
    name: row.name,
    order: row.order,
    submilestones: row.subMilestoneDetails.map((subMilestone, index) => ({
      key: subMilestone.id,
      milestoneKey: row.key,
      name: sanitizeSubMilestoneName(subMilestone.name),
      order: index + 1,
    })),
  };
}

function worksheetCostItemsToMaterialItems(
  row: TimelineMilestoneWorksheetRow
): MaterialPlanningItem[] {
  return (row.costItems ?? []).map((item) => ({
    _id: item.id,
    costCents: item.costCents,
    description: item.description,
    itemType: item.itemType,
    milestoneKey: row.key,
    quantity: item.quantity,
    relevantSubmilestoneKeys: item.relevantSubMilestoneIds,
    supplier: item.supplier,
    title: item.title,
    totalCents: Math.round(item.costCents * item.quantity),
  }));
}

function materialPayloadToWorksheetCostItem(
  rowKey: string,
  payload: MaterialPlanningPayload,
  existingId?: string
): TimelineMilestoneWorksheetCostItem {
  return {
    costCents: payload.costCents,
    description: payload.description,
    id: existingId ?? makeWorksheetId(`${rowKey}-cost-item`),
    itemType: payload.itemType,
    quantity: payload.quantity,
    relevantSubMilestoneIds: payload.relevantSubmilestoneKeys,
    supplier: payload.supplier,
    title: payload.title,
  };
}

function parseOptionalCurrencyCents(value: string) {
  if (!value.trim()) {
    return;
  }
  const cents = parseCurrencyToCents(value);
  return Number.isFinite(cents) && cents > 0 ? Math.round(cents) : undefined;
}

function parseOptionalHours(value: string) {
  if (!value.trim()) {
    return;
  }
  const parsed = Number(value.replace(/,/g, ""));
  return Number.isFinite(parsed) && parsed > 0
    ? Math.round(parsed * 100) / 100
    : undefined;
}

function subMilestoneNameById(
  row: TimelineMilestoneWorksheetRow,
  subMilestoneId: string
) {
  return (
    row.subMilestoneDetails.find((detail) => detail.id === subMilestoneId)
      ?.name ?? subMilestoneId
  );
}

function makeWorksheetId(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 8)}`;
}

function defaultGuidanceForRow(row: TimelineMilestoneWorksheetRow): SiteVisitGuidanceHtml {
  return {
    cameraAngles: guidanceLinesToHtml([
      "Wide shot showing the full milestone work area.",
      "Close-up of the highest-risk connection, fixture, or finish.",
    ]),
    whatToVerify: guidanceLinesToHtml(
      (row.subMilestones.length ? row.subMilestones : [row.name])
        .slice(0, 4)
        .map(
          (checkpoint) =>
            `${checkpoint} is complete, visible, and consistent with the approved scope.`
        )
    ),
  };
}

function makeUniqueRowKey(name: string, rows: TimelineMilestoneWorksheetRow[]) {
  const baseKey = `custom-${slugifySubMilestone(name)}`;
  const existingKeys = new Set(rows.map((row) => row.key));
  if (!existingKeys.has(baseKey)) {
    return baseKey;
  }
  let suffix = 2;
  while (existingKeys.has(`${baseKey}-${suffix}`)) {
    suffix += 1;
  }
  return `${baseKey}-${suffix}`;
}

function cascadeBudgetEdit({
  nextBudgetCents,
  rowKey,
  rows,
  targetBudgetCents,
}: {
  nextBudgetCents: number;
  rowKey: string;
  rows: TimelineMilestoneWorksheetRow[];
  targetBudgetCents: number;
}) {
  const editedIndex = rows.findIndex((row) => row.key === rowKey);
  const roundedTargetBudgetCents = Math.round(targetBudgetCents);
  if (editedIndex < 0 || roundedTargetBudgetCents <= 0) {
    return rows;
  }

  const precedingBudgetCents = rows
    .slice(0, editedIndex)
    .filter((row) => !row.excluded)
    .reduce((sum, row) => {
      const budget = rowBudgetCents(row);
      return sum + (Number.isFinite(budget) ? budget : 0);
    }, 0);
  const maxEditedBudgetCents = Math.max(
    0,
    roundedTargetBudgetCents - precedingBudgetCents
  );
  const editedBudgetCents = Math.min(
    Math.max(0, Math.round(nextBudgetCents)),
    maxEditedBudgetCents
  );
  const downstreamTargetBudgetCents = Math.max(
    0,
    roundedTargetBudgetCents - precedingBudgetCents - editedBudgetCents
  );
  const downstreamIndexes = rows
    .map((row, index) => ({ index, row }))
    .filter(({ index, row }) => index > editedIndex && !row.excluded)
    .map(({ index }) => index);
  const downstreamAllocations = allocateWeightedCents({
    fallbackWeights: downstreamIndexes.map((index) => {
      const row = rows[index];
      const budget = row ? rowBudgetCents(row) : Number.NaN;
      return Number.isFinite(budget) ? budget : 0;
    }),
    preferredWeights: downstreamIndexes.map(
      (index) => rows[index]?.percentageBps ?? 0
    ),
    totalCents: downstreamTargetBudgetCents,
  });
  const nextRows = rows.map((row, index) => {
    if (index === editedIndex) {
      return {
        ...row,
        budgetText: formatCurrency(editedBudgetCents),
      };
    }

    const downstreamIndex = downstreamIndexes.indexOf(index);
    if (downstreamIndex >= 0) {
      return {
        ...row,
        budgetText: formatCurrency(downstreamAllocations[downstreamIndex] ?? 0),
      };
    }

    return row;
  });

  return withBudgetPercentages(nextRows, roundedTargetBudgetCents);
}

function allocateWeightedCents({
  fallbackWeights,
  preferredWeights,
  totalCents,
}: {
  fallbackWeights: number[];
  preferredWeights: number[];
  totalCents: number;
}) {
  const roundedTotalCents = Math.max(0, Math.round(totalCents));
  if (preferredWeights.length === 0) {
    return [];
  }

  const weights = resolveAllocationWeights(preferredWeights, fallbackWeights);
  const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
  const allocations = weights.map((weight, order) => {
    const raw = roundedTotalCents * weight;
    return {
      cents: Math.floor(raw / totalWeight),
      order,
      remainder: raw % totalWeight,
    };
  });
  let remainderCents =
    roundedTotalCents -
    allocations.reduce((sum, allocation) => sum + allocation.cents, 0);
  const byRemainder = [...allocations].sort(
    (a, b) => b.remainder - a.remainder || a.order - b.order
  );
  for (const allocation of byRemainder) {
    if (remainderCents <= 0) {
      break;
    }
    allocation.cents += 1;
    remainderCents -= 1;
  }

  return allocations
    .sort((a, b) => a.order - b.order)
    .map((allocation) => allocation.cents);
}

function resolveAllocationWeights(
  preferredWeights: number[],
  fallbackWeights: number[]
) {
  const normalizedPreferredWeights = preferredWeights.map((weight) =>
    Number.isFinite(weight) ? Math.max(0, weight) : 0
  );
  if (normalizedPreferredWeights.some((weight) => weight > 0)) {
    return normalizedPreferredWeights;
  }

  const normalizedFallbackWeights = fallbackWeights.map((weight) =>
    Number.isFinite(weight) ? Math.max(0, weight) : 0
  );
  if (normalizedFallbackWeights.some((weight) => weight > 0)) {
    return normalizedFallbackWeights;
  }

  return preferredWeights.map(() => 1);
}

function withBudgetPercentages(
  rows: TimelineMilestoneWorksheetRow[],
  targetBudgetCents: number
) {
  if (!(Number.isFinite(targetBudgetCents) && targetBudgetCents > 0)) {
    return rows;
  }

  return rows.map((row) => {
    if (row.excluded) {
      return row;
    }

    const budget = rowBudgetCents(row);
    const percentageBps = Number.isFinite(budget)
      ? Math.max(0, Math.round((budget / targetBudgetCents) * 10_000))
      : row.percentageBps;

    return {
      ...row,
      percentageBps,
      percentageText: formatBps(percentageBps),
    };
  });
}

function rowBudgetCents(row: TimelineMilestoneWorksheetRow) {
  const parsed = parseCurrencyToCents(row.budgetText);
  return Number.isFinite(parsed) ? Math.max(0, parsed) : Number.NaN;
}

function rowDurationDays(row: TimelineMilestoneWorksheetRow) {
  const parsed = Number(row.durationText.replace(DURATION_PREFIX_REGEX, ""));
  return Number.isFinite(parsed) ? Math.max(1, Math.round(parsed)) : Number.NaN;
}

function parseDurationDays(value: string) {
  const parsed = Number(value.replace(DURATION_PREFIX_REGEX, ""));
  return Number.isFinite(parsed) ? Math.max(1, Math.round(parsed)) : 1;
}

function normalizeCurrencyText(value: string) {
  const cents = parseCurrencyToCents(value);
  return Number.isFinite(cents) ? formatCurrency(Math.max(0, cents)) : value;
}

function normalizeDurationText(value: string) {
  const parsed = Number(value.replace(DURATION_PREFIX_REGEX, ""));
  return Number.isFinite(parsed)
    ? String(Math.max(1, Math.round(parsed)))
    : value;
}

function formatBps(value: number) {
  return `${(value / 100).toFixed(2)}%`;
}

function normalizePercentText(value: string) {
  return formatBps(parsePercentToBps(value));
}

function parsePercentToBps(value: string) {
  const parsed = Number(value.replace("%", "").trim());
  return Number.isFinite(parsed) ? Math.max(0, Math.round(parsed * 100)) : 0;
}

function sanitizeSubMilestoneName(value: string) {
  const trimmed = value.trim();
  return trimmed || "Untitled sub-milestone";
}

function slugifySubMilestone(value: string) {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "sub-milestone"
  );
}

function makeUniqueSubMilestoneName(
  baseName: string,
  existingNameSet: Set<string>
) {
  const sanitizedBaseName = sanitizeSubMilestoneName(baseName);
  if (!existingNameSet.has(sanitizedBaseName.toLowerCase())) {
    return sanitizedBaseName;
  }

  let nextIndex = 2;
  while (
    existingNameSet.has(`${sanitizedBaseName} ${nextIndex}`.toLowerCase())
  ) {
    nextIndex += 1;
  }
  return `${sanitizedBaseName} ${nextIndex}`;
}

function hasAvailableSubMilestoneBankMatches(
  existingNameSet: Set<string>,
  query: string
) {
  return SUB_MILESTONE_BANK.some(
    (item) =>
      !existingNameSet.has(item.name.toLowerCase()) &&
      matchesSubMilestoneBankQuery(item, query)
  );
}

function matchesSubMilestoneBankQuery(
  item: SubMilestoneBankItem,
  query: string
) {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) {
    return true;
  }
  return [item.name, item.category, item.description].some((value) =>
    value.toLowerCase().includes(normalizedQuery)
  );
}

function formatRowType(value: string) {
  return value
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replaceAll("_", " ")
    .toLowerCase();
}
