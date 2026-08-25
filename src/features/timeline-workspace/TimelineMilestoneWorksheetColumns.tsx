import type { ColumnDef } from "@tanstack/react-table";
import type { JSONContent } from "@tiptap/react";
import { ChevronDown, ChevronRight } from "lucide-react";
import type { KeyboardEvent } from "react";
import { Badge } from "#/components/ui/badge.tsx";
import { Switch } from "#/components/ui/switch.tsx";
import {
  dateFromProposalDayOffset,
  dayOffsetFromProposalDate,
  inclusiveEndDateFromProposalSchedule,
  proposalDurationDaysFromInclusiveDates,
} from "#/features/production-proposals/proposalScheduleDates.ts";
import { cn } from "#/lib/utils.ts";
import { DragHandle } from "./TimelineMilestoneWorksheetGuidance.tsx";
import {
  DURATION_PREFIX_REGEX,
  FOCUSABLE_TABLE_CONTROL_SELECTOR,
  NON_DIGIT_REGEX,
  formatBps,
  formatInclusiveEndTOffset,
  formatRowType,
  formatTOffset,
  iconOptions,
  normalizeDurationText,
  normalizePercentText,
  parseDurationDays,
  parseTOffsetDay,
  parsePercentToBps,
  rowDurationDays,
  rowStartDay,
  type TimelineMilestoneWorksheetRow,
  type TimelineMilestoneWorksheetRowsChangeMeta,
  type TimelineScheduleDisplayMode,
} from "./TimelineMilestoneWorksheetContracts.tsx";
import type { IsometricIconKey } from "./-timeline-share-snapshot.ts";

export function setupColumns({
  commitBudgetEdit,
  commitRows,
  moveRowByKey,
  proposedStartDate,
  scheduleDisplayMode,
  updateRow,
}: {
  commitBudgetEdit: (rowKey: string) => void;
  commitRows: () => void;
  moveRowByKey: (rowKey: string, direction: "down" | "up") => void;
  proposedStartDate?: string;
  scheduleDisplayMode: TimelineScheduleDisplayMode;
  updateRow: (
    rowKey: string,
    patch: Partial<TimelineMilestoneWorksheetRow>,
    meta?: TimelineMilestoneWorksheetRowsChangeMeta
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
          onChange={(budgetText) =>
            updateRow(row.original.key, { budgetText }, { commit: false })
          }
          testId={`timeline-setup-row-budget-${row.original.key}`}
          value={row.original.budgetText}
        />
      ),
      header: "Budget",
      id: "budget",
      size: 150,
    },
    ...(scheduleDisplayMode === "dates" && proposedStartDate
      ? dateScheduleColumns(updateRow, commitRows, proposedStartDate)
      : tOffsetScheduleColumns(updateRow, commitRows)),
    excludeColumn(updateRow),
    expandColumn(),
  ];
}

export function settingsColumns({
  includedRowCount,
  moveRowByKey,
  onIncludedChange,
  updateRow,
}: {
  includedRowCount: number;
  moveRowByKey: (rowKey: string, direction: "down" | "up") => void;
  onIncludedChange: (rowKey: string, included: boolean) => void;
  updateRow: (
    rowKey: string,
    patch: Partial<TimelineMilestoneWorksheetRow>,
    meta?: TimelineMilestoneWorksheetRowsChangeMeta
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
            onChange={(type) =>
              updateRow(row.original.key, { type }, { commit: false })
            }
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
            updateRow(
              row.original.key,
              {
                percentageBps: parsePercentToBps(percentageText),
                percentageText,
              },
              { commit: false }
            )
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
          disabled={!row.original.excluded && includedRowCount <= 1}
          onCheckedChange={(included) =>
            onIncludedChange(row.original.key, included)
          }
          title={
            !row.original.excluded && includedRowCount <= 1
              ? "At least one milestone must remain included."
              : undefined
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

export function nameColumn(
  moveRowByKey: (rowKey: string, direction: "down" | "up") => void,
  updateRow?: (
    rowKey: string,
    patch: Partial<TimelineMilestoneWorksheetRow>,
    meta?: TimelineMilestoneWorksheetRowsChangeMeta
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
              onBlur={() => updateRow(row.original.key, {})}
              onChange={(name) =>
                updateRow(row.original.key, { name }, { commit: false })
              }
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

export function subMilestoneColumn(): ColumnDef<TimelineMilestoneWorksheetRow> {
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

export function durationColumn(
  updateRow: (
    rowKey: string,
    patch: Partial<TimelineMilestoneWorksheetRow>,
    meta?: TimelineMilestoneWorksheetRowsChangeMeta
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
          updateRow(
            row.original.key,
            {
              durationDays: parseDurationDays(durationText),
              durationText: durationText
                .replace(DURATION_PREFIX_REGEX, "")
                .replace(NON_DIGIT_REGEX, ""),
            },
            { commit: false }
          )
        }
        testId={`timeline-setup-row-duration-${row.original.key}`}
        value={`T${rowDurationDays(row.original)}`}
      />
    ),
    header: "Duration",
    id: "duration",
    size: 126,
  };
}

export function tOffsetScheduleColumns(
  updateRow: (
    rowKey: string,
    patch: Partial<TimelineMilestoneWorksheetRow>,
    meta?: TimelineMilestoneWorksheetRowsChangeMeta
  ) => void,
  commitRows: () => void
): ColumnDef<TimelineMilestoneWorksheetRow>[] {
  return [
    {
      cell: ({ row }) => (
        <BlueprintInput
          align="center"
          className="timeline-blueprint-duration"
          label={`${row.original.name} T offset start`}
          onBlur={commitRows}
          onChange={(startText) =>
            updateRow(
              row.original.key,
              {
                startDay: parseTOffsetDay(startText),
              },
              { commit: false }
            )
          }
          testId={`timeline-setup-row-start-offset-${row.original.key}`}
          value={formatTOffset(rowStartDay(row.original))}
        />
      ),
      header: "Start",
      id: "startOffset",
      size: 126,
    },
    durationColumn(updateRow),
    {
      cell: ({ row }) => (
        <BlueprintInput
          align="center"
          className="timeline-blueprint-duration"
          label={`${row.original.name} T offset end`}
          onBlur={() => undefined}
          onChange={() => undefined}
          readOnly
          testId={`timeline-setup-row-end-offset-${row.original.key}`}
          value={formatInclusiveEndTOffset(
            rowStartDay(row.original),
            rowDurationDays(row.original)
          )}
        />
      ),
      header: "End",
      id: "endOffset",
      size: 126,
    },
  ];
}

export function dateScheduleColumns(
  updateRow: (
    rowKey: string,
    patch: Partial<TimelineMilestoneWorksheetRow>,
    meta?: TimelineMilestoneWorksheetRowsChangeMeta
  ) => void,
  commitRows: () => void,
  proposedStartDate: string
): ColumnDef<TimelineMilestoneWorksheetRow>[] {
  return [
    {
      cell: ({ row }) => {
        const startDay = rowStartDay(row.original);
        return (
          <BlueprintInput
            align="center"
            className="timeline-blueprint-date"
            label={`${row.original.name} start date`}
            onBlur={commitRows}
            onChange={(startDate) => {
              const dayStart = dayOffsetFromProposalDate(
                proposedStartDate,
                startDate
              );
              updateRow(
                row.original.key,
                {
                  startDay: dayStart,
                },
                { commit: false }
              );
            }}
            testId={`timeline-setup-row-start-date-${row.original.key}`}
            type="date"
            value={dateFromProposalDayOffset(proposedStartDate, startDay)}
          />
        );
      },
      header: "Start",
      id: "startDate",
      size: 142,
    },
    {
      cell: ({ row }) => {
        const startDay = rowStartDay(row.original);
        const durationDays = rowDurationDays(row.original);
        return (
          <BlueprintInput
            align="center"
            className="timeline-blueprint-date"
            label={`${row.original.name} end date`}
            onBlur={commitRows}
            onChange={(endDate) => {
              const startDate = dateFromProposalDayOffset(
                proposedStartDate,
                startDay
              );
              const nextDurationDays = proposalDurationDaysFromInclusiveDates(
                startDate,
                endDate
              );
              updateRow(
                row.original.key,
                {
                  durationDays: nextDurationDays,
                  durationText: String(nextDurationDays),
                },
                { commit: false }
              );
            }}
            testId={`timeline-setup-row-end-date-${row.original.key}`}
            type="date"
            value={inclusiveEndDateFromProposalSchedule(
              proposedStartDate,
              startDay,
              durationDays
            )}
          />
        );
      },
      header: "End",
      id: "endDate",
      size: 142,
    },
  ];
}

export function excludeColumn(
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

export function expandColumn(): ColumnDef<TimelineMilestoneWorksheetRow> {
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

export function BlueprintMilestoneIcon({
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

export function BlueprintInput({
  align = "left",
  aliasTestIds = [],
  className,
  id,
  label,
  labelledBy,
  onBlur,
  onChange,
  onCommit,
  readOnly = false,
  testId,
  type = "text",
  value,
}: {
  align?: "left" | "center" | "right";
  aliasTestIds?: string[];
  className?: string;
  id?: string;
  label: string;
  labelledBy?: string;
  onBlur: () => void;
  onChange: (value: string) => void;
  onCommit?: () => void;
  readOnly?: boolean;
  testId: string;
  type?: "date" | "text";
  value: string;
}) {
  const handleChange = (value: string) => {
    if (!readOnly) {
      onChange(value);
    }
  };

  const input = (
    <input
      aria-keyshortcuts="Enter Shift+Enter ArrowDown ArrowUp"
      aria-label={labelledBy ? undefined : label}
      aria-labelledby={labelledBy}
      className={cn("timeline-blueprint-input", className)}
      data-align={align}
      data-testid={testId}
      id={id}
      onBlur={onBlur}
      onChange={(event) => handleChange(event.currentTarget.value)}
      onKeyDown={(event) => handleBlueprintInputKeyDown(event, onCommit)}
      readOnly={readOnly}
      tabIndex={readOnly ? -1 : undefined}
      type={type}
      value={value}
    />
  );

  if (aliasTestIds.length === 0) {
    return input;
  }

  return (
    <>
      {input}
      {aliasTestIds.map((aliasTestId) => (
        <input
          aria-hidden="true"
          data-testid={aliasTestId}
          key={aliasTestId}
          onBlur={onBlur}
          onChange={(event) => handleChange(event.currentTarget.value)}
          onKeyDown={(event) => handleBlueprintInputKeyDown(event, onCommit)}
          readOnly={readOnly}
          style={{ display: "none" }}
          tabIndex={-1}
          type={type}
          value={value}
        />
      ))}
    </>
  );
}

export function handleBlueprintInputKeyDown(
  event: KeyboardEvent<HTMLInputElement>,
  onCommit?: () => void
) {
  if (event.altKey || event.ctrlKey || event.metaKey) {
    return;
  }

  if (event.key === "Enter") {
    event.preventDefault();
    onCommit?.();
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

export function focusAdjacentTableControl(
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

export function getExpandedRowId(rowKey: string) {
  return `timeline-blueprint-expanded-${rowKey}`;
}

export function parseTiptapEditorValue(value: string): string | JSONContent {
  if (!value.trim()) {
    return "";
  }
  try {
    const parsed = JSON.parse(value) as JSONContent;
    if (parsed && typeof parsed === "object" && parsed.type === "doc") {
      return parsed;
    }
  } catch {
    // Existing worksheet drafts may still contain HTML. TipTap accepts that
    // representation directly while newly saved values use JSON below.
  }
  return value;
}

export function stringifyTiptapDocument(document: JSONContent) {
  return JSON.stringify(document);
}
