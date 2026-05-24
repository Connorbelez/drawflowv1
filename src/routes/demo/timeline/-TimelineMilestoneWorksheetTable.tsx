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
import { type ReactNode, useMemo, useState } from "react";

import {
  Sortable,
  SortableItem,
  SortableItemHandle,
} from "#/components/reui/sortable.tsx";
import {
  Autocomplete,
  AutocompleteGroup,
  AutocompleteGroupLabel,
  AutocompleteInput,
  AutocompleteList,
  AutocompletePopup,
} from "#/components/ui/autocomplete.tsx";
import { Badge } from "#/components/ui/badge.tsx";
import { Button } from "#/components/ui/button.tsx";
import { Switch } from "#/components/ui/switch.tsx";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "#/components/ui/table.tsx";
import { cn } from "#/lib/utils.ts";
import {
  formatCurrency,
  parseCurrencyToCents,
} from "../../../features/builder-proposal-demo/template-helpers.ts";
import type { IsometricIconKey } from "./-timeline-share-snapshot.ts";
import "./-timeline-setup-flow.css";

const DEFAULT_NEW_MILESTONE_BUDGET_TEXT = "$0";
const DEFAULT_NEW_MILESTONE_DURATION_TEXT = "7";
const DEFAULT_NEW_SUB_MILESTONE_BUDGET_TEXT = "$0";
const DEFAULT_NEW_SUB_MILESTONE_DURATION_TEXT = "1";

const iconOptions = [
  "change",
  "closeout",
  "drywall",
  "exterior",
  "finishes",
  "foundation",
  "framing",
  "roughIn",
] as const satisfies IsometricIconKey[];

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

export interface TimelineMilestoneWorksheetRow {
  baseItemId?: string;
  budgetText: string;
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
  subMilestoneDetails: TimelineMilestoneWorksheetSubMilestone[];
  subMilestones: string[];
  type: string;
}

type WorksheetMode = "settings" | "setup";

export function TimelineMilestoneWorksheetTable({
  cashText,
  className,
  error,
  footerExtra,
  leadingContent,
  mode,
  onBack,
  onComplete,
  onReset,
  onRowsChange,
  rows,
  showHeading = false,
  templateTitle,
}: {
  cashText?: string;
  className?: string;
  error?: string;
  footerExtra?: ReactNode;
  leadingContent?: ReactNode;
  mode: WorksheetMode;
  onBack?: () => void;
  onComplete?: (options: { redirectToDurableRoute: boolean }) => void;
  onReset?: () => void;
  onRowsChange: (rows: TimelineMilestoneWorksheetRow[]) => void;
  rows: TimelineMilestoneWorksheetRow[];
  showHeading?: boolean;
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
  const [redirectToDurableRoute, setRedirectToDurableRoute] = useState(false);
  const [customMilestoneName, setCustomMilestoneName] = useState("");

  const updateRows = (nextRows: TimelineMilestoneWorksheetRow[]) =>
    onRowsChange(
      nextRows.map((row, order) => ({
        ...row,
        order,
      }))
    );

  const updateRow = (
    rowKey: string,
    patch: Partial<TimelineMilestoneWorksheetRow>
  ) => {
    updateRows(rows.map((row) => (row.key === rowKey ? { ...row, ...patch } : row)));
  };

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
      durationText: item?.durationText ?? DEFAULT_NEW_SUB_MILESTONE_DURATION_TEXT,
      id: `${rowKey}-custom-${Date.now()}`,
      name: item?.name ?? `New sub-milestone ${row.subMilestoneDetails.length + 1}`,
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

  const addCustomMilestone = () => {
    const fallbackCount = rows.filter((row) => row.type === "custom").length + 1;
    const name = customMilestoneName.trim() || `Custom milestone ${fallbackCount}`;
    const nextRow = createCustomMilestoneRow({ name, order: rows.length, rows });

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

  const reorderRows = (activeIndex: number, overIndex: number) => {
    if (
      activeIndex < 0 ||
      overIndex < 0 ||
      activeIndex >= rows.length ||
      overIndex >= rows.length ||
      activeIndex === overIndex
    ) {
      return;
    }

    updateRows(arrayMove(rows, activeIndex, overIndex));
  };

  const moveRowByKey = (rowKey: string, direction: "down" | "up") => {
    const currentIndex = rows.findIndex((row) => row.key === rowKey);
    const nextIndex = direction === "up" ? currentIndex - 1 : currentIndex + 1;
    reorderRows(currentIndex, nextIndex);
  };

  const columns = useMemo<ColumnDef<TimelineMilestoneWorksheetRow>[]>(
    () =>
      mode === "settings"
        ? settingsColumns({ updateRow, moveRowByKey })
        : setupColumns({ updateRow, moveRowByKey }),
    [mode, rows]
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
          </div>
          <div className="timeline-blueprint-heading-meta">
            <span>Table variation 03</span>
            <span>{mode === "settings" ? "Units: PoC %" : "Units: USD"}</span>
          </div>
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
            onChange={(event) => setCustomMilestoneName(event.currentTarget.value)}
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
        {(["top-left", "top-right", "bottom-left", "bottom-right"] as const).map(
          (position) => (
            <span
              aria-hidden="true"
              className={`timeline-blueprint-table-corner is-${position}`}
              data-testid={`timeline-setup-budget-table-corner-${position}`}
              key={position}
            />
          )
        )}
        <Table className="timeline-blueprint-table">
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <TableHead key={header.id} style={{ width: header.getSize() }}>
                    {header.isPlaceholder
                      ? null
                      : flexRender(header.column.columnDef.header, header.getContext())}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <Sortable
            aria-label="Milestone budget order"
            getItemValue={(row) => row.key}
            modifiers={[restrictToVerticalAxis]}
            onMove={({ activeIndex, overIndex }) => reorderRows(activeIndex, overIndex)}
            render={<TableBody />}
            strategy="vertical"
            value={rows}
          >
            {table.getRowModel().rows.flatMap((row) => {
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
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </SortableItem>
              );
              const expandedRow = row.getIsExpanded() ? (
                <TableRow
                  className="timeline-blueprint-expanded-row"
                  key={`${row.id}:expanded`}
                >
                  <TableCell colSpan={row.getVisibleCells().length}>
                    <SubMilestoneEditor
                      activeSubMilestoneId={activeSubMilestoneByRow[row.original.key]}
                      mode={mode}
                      onActiveSubMilestoneChange={(subMilestoneId) =>
                        setActiveSubMilestoneByRow((current) => ({
                          ...current,
                          [row.original.key]: subMilestoneId,
                        }))
                      }
                      onAddSubMilestone={(item) => addSubMilestone(row.original.key, item)}
                      onRemoveSubMilestone={(subMilestoneId) =>
                        removeSubMilestone(row.original.key, subMilestoneId)
                      }
                      onUpdateSubMilestone={(subMilestoneId, patch) =>
                        updateSubMilestone(row.original.key, subMilestoneId, patch)
                      }
                      row={row.original}
                    />
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
            <MetricPill label="Budget" value={formatCurrency(includedBudgetCents)} />
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
            <p className="timeline-blueprint-error" data-testid="timeline-setup-error">
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
              <label className="timeline-durable-route-toggle">
                <span>
                  <strong>Open durable route</strong>
                  <small>Redirect after generation</small>
                </span>
                <Switch
                  aria-label="Open durable Convex route after generating"
                  checked={redirectToDurableRoute}
                  data-testid="timeline-setup-durable-route-toggle"
                  onCheckedChange={setRedirectToDurableRoute}
                />
              </label>
              <Button
                className="timeline-setup-primary"
                data-testid="timeline-setup-complete"
                onClick={() => onComplete?.({ redirectToDurableRoute })}
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
  moveRowByKey,
  updateRow,
}: {
  moveRowByKey: (rowKey: string, direction: "down" | "up") => void;
  updateRow: (rowKey: string, patch: Partial<TimelineMilestoneWorksheetRow>) => void;
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
          onBlur={() =>
            updateRow(row.original.key, {
              budgetText: normalizeCurrencyText(row.original.budgetText),
            })
          }
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
  updateRow: (rowKey: string, patch: Partial<TimelineMilestoneWorksheetRow>) => void;
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
              percentageBps: parsePercentToBps(row.original.percentageText ?? ""),
              percentageText: normalizePercentText(row.original.percentageText ?? ""),
            })
          }
          onChange={(percentageText) =>
            updateRow(row.original.key, {
              percentageBps: parsePercentToBps(percentageText),
              percentageText,
            })
          }
          testId={`timeline-setup-row-poc-${row.original.key}`}
          value={row.original.percentageText ?? formatBps(row.original.percentageBps)}
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
  updateRow?: (rowKey: string, patch: Partial<TimelineMilestoneWorksheetRow>) => void
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
  updateRow: (rowKey: string, patch: Partial<TimelineMilestoneWorksheetRow>) => void
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
            durationText: durationText.replace(/^T/i, "").replace(/\D/g, ""),
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
  updateRow: (rowKey: string, patch: Partial<TimelineMilestoneWorksheetRow>) => void
): ColumnDef<TimelineMilestoneWorksheetRow> {
  return {
    cell: ({ row }) => (
      <Switch
        aria-label={`Exclude ${row.original.name}`}
        checked={row.original.excluded}
        className="timeline-blueprint-switch"
        data-testid={`timeline-setup-row-exclude-${row.original.key}`}
        onCheckedChange={(excluded) => updateRow(row.original.key, { excluded })}
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
        aria-label={`${row.getIsExpanded() ? "Collapse" : "Expand"} ${row.original.name}`}
        className="timeline-blueprint-expand"
        data-testid={`timeline-setup-row-expand-${row.original.key}`}
        onClick={row.getToggleExpandedHandler()}
        type="button"
      >
        {row.getIsExpanded() ? <ChevronDown /> : <ChevronRight />}
      </button>
    ),
    header: "",
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
        loading="lazy"
        src={sources[icon]}
      />
    </span>
  );
}

function BlueprintInput({
  align = "left",
  className,
  label,
  onBlur,
  onChange,
  testId,
  value,
}: {
  align?: "left" | "center" | "right";
  className?: string;
  label: string;
  onBlur: () => void;
  onChange: (value: string) => void;
  testId: string;
  value: string;
}) {
  return (
    <input
      aria-label={label}
      className={cn("timeline-blueprint-input", className)}
      data-align={align}
      data-testid={testId}
      onBlur={onBlur}
      onChange={(event) => onChange(event.currentTarget.value)}
      value={value}
    />
  );
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
                    <strong>{sanitizeSubMilestoneName(subMilestone.name)}</strong>
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
          <div className="timeline-submilestone-detail-body" key={activeSubMilestone.id}>
            <div className="timeline-submilestone-detail-header">
              <span>Selected sub-milestone</span>
              <strong>{sanitizeSubMilestoneName(activeSubMilestone.name)}</strong>
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
              <label className="timeline-submilestone-detail-field">
                <span>{valueLabel}</span>
                <BlueprintInput
                  align="right"
                  className="timeline-submilestone-detail-input"
                  label={`Sub-milestone ${valueLabel.toLowerCase()}`}
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
              </label>
              <label className="timeline-submilestone-detail-field">
                <span>Duration</span>
                <BlueprintInput
                  align="center"
                  className="timeline-submilestone-detail-input"
                  label="Sub-milestone duration"
                  onBlur={() =>
                    onUpdateSubMilestone(activeSubMilestone.id, {
                      durationText: normalizeDurationText(
                        activeSubMilestone.durationText
                      ),
                    })
                  }
                  onChange={(durationText) =>
                    onUpdateSubMilestone(activeSubMilestone.id, {
                      durationText: durationText.replace(/^T/i, "").replace(/\D/g, ""),
                    })
                  }
                  testId={`timeline-setup-submilestone-duration-${activeSubMilestone.id}`}
                  value={`T${activeSubMilestone.durationText}`}
                />
              </label>
            </div>
            <button
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

  return (
    <div className="timeline-submilestone-bank">
      <Autocomplete
        autoHighlight="always"
        keepHighlight
        onOpenChange={setOpen}
        onValueChange={(nextQuery) => {
          setQuery(nextQuery);
          setOpen(true);
        }}
        open={open}
        openOnInputClick
        value={query}
      >
        <AutocompleteInput
          aria-label="Add sub-milestone from bank"
          className="timeline-submilestone-bank-input"
          data-testid={`timeline-setup-submilestone-bank-input-${rowKey}`}
          onFocus={() => setOpen(true)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && canCreate) {
              event.preventDefault();
              addItem({
                budgetText: DEFAULT_NEW_SUB_MILESTONE_BUDGET_TEXT,
                category: "Custom",
                description: "Custom scope checkpoint",
                durationText: DEFAULT_NEW_SUB_MILESTONE_DURATION_TEXT,
                name: customName,
              });
            }
          }}
          placeholder="Add from sub-milestone bank..."
          showClear
          showTrigger
          size="sm"
        />
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
      description: "Define reimbursable scope, evidence, and acceptance criteria",
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
  return {
    ...row,
    subMilestoneDetails,
    subMilestones: subMilestoneDetails.map((detail) =>
      sanitizeSubMilestoneName(detail.name)
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

function rowBudgetCents(row: TimelineMilestoneWorksheetRow) {
  const parsed = parseCurrencyToCents(row.budgetText);
  return Number.isFinite(parsed) ? Math.max(0, parsed) : Number.NaN;
}

function rowDurationDays(row: TimelineMilestoneWorksheetRow) {
  const parsed = Number(row.durationText.replace(/^T/i, ""));
  return Number.isFinite(parsed) ? Math.max(1, Math.round(parsed)) : Number.NaN;
}

function parseDurationDays(value: string) {
  const parsed = Number(value.replace(/^T/i, ""));
  return Number.isFinite(parsed) ? Math.max(1, Math.round(parsed)) : 1;
}

function normalizeCurrencyText(value: string) {
  const cents = parseCurrencyToCents(value);
  return Number.isFinite(cents) ? formatCurrency(Math.max(0, cents)) : value;
}

function normalizeDurationText(value: string) {
  const parsed = Number(value.replace(/^T/i, ""));
  return Number.isFinite(parsed) ? String(Math.max(1, Math.round(parsed))) : value;
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

function matchesSubMilestoneBankQuery(item: SubMilestoneBankItem, query: string) {
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
