import { MoveRight } from "lucide-react";
import { useCallback, type ReactNode } from "react";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "#/components/ui/hover-card.tsx";
import {
  dateFromProposalDayOffset,
  inclusiveEndDateFromProposalSchedule,
  proposalDurationDaysFromInclusiveDates,
} from "#/features/production-proposals/proposalScheduleDates.ts";
import { coerceSiteVisitGuidance } from "#/lib/site-visit-guidance.ts";
import { formatCurrency } from "#/features/builder-proposal-demo/template-helpers.ts";
import {
  DURATION_PREFIX_REGEX,
  NON_DIGIT_REGEX,
  formatBps,
  formatInclusiveEndTOffset,
  formatDisplayDateWithoutYear,
  normalizeDurationText,
  normalizeCurrencyText,
  normalizePercentText,
  parseDurationDays,
  parsePercentToBps,
  parseTOffsetDay,
  rowBudgetCents,
  rowDurationDays,
  rowStartDay,
  subMilestoneNameById,
  subMilestoneStartDay,
  type TimelineDetailTab,
  type TimelineMilestoneWorksheetContractorAssignment,
  type TimelineMilestoneWorksheetCostItem,
  type TimelineMilestoneWorksheetRow,
  type TimelineMilestoneWorksheetRowsChangeMeta,
  type TimelineMilestoneWorksheetSubMilestone,
  type TimelineScheduleDisplayMode,
  type WorksheetMode,
} from "./TimelineMilestoneWorksheetContracts.tsx";
import { BlueprintInput } from "./TimelineMilestoneWorksheetColumns.tsx";
import {
  ScheduleWindowPicker,
  type ScheduleWindowValue,
} from "./-ScheduleWindowPicker.tsx";
import {
  plainTextFromHtml,
  plainTextFromTiptapJson,
} from "./TimelineMilestoneWorksheetText.ts";

export { plainTextFromHtml, plainTextFromTiptapJson } from "./TimelineMilestoneWorksheetText.ts";

export interface SummaryWindowEditConfig {
  durationDays: number;
  label: string;
  onCommit: () => void;
  onWindowChange: (next: ScheduleWindowValue) => void;
  proposedStartDate: string;
  startDay: number;
  testId: string;
}

export function SummaryWindowCell({
  edit,
  window,
}: {
  edit?: SummaryWindowEditConfig;
  window: { duration: string; primary: string };
}) {
  const content = (
    <>
      <strong>{window.primary}</strong>
      <small>{window.duration}</small>
    </>
  );

  if (!edit) {
    return <span className="timeline-blueprint-summary-window">{content}</span>;
  }

  return (
    <ScheduleWindowPicker
      durationDays={edit.durationDays}
      label={edit.label}
      onCommit={edit.onCommit}
      onWindowChange={edit.onWindowChange}
      proposedStartDate={edit.proposedStartDate}
      startDay={edit.startDay}
      testId={edit.testId}
      trigger={content}
      triggerClassName="timeline-blueprint-summary-window is-editable"
    />
  );
}

export function SummaryMilestoneDurationCell({
  mode,
  onCommitField,
  onUpdateRow,
  row,
}: {
  mode: WorksheetMode;
  onCommitField: () => void;
  onUpdateRow: (
    rowKey: string,
    patch: Partial<TimelineMilestoneWorksheetRow>,
    meta?: TimelineMilestoneWorksheetRowsChangeMeta
  ) => void;
  row: TimelineMilestoneWorksheetRow;
}) {
  if (row.subMilestoneDetails.length > 0) {
    return (
      <span className="timeline-blueprint-summary-readout">
        {rowDurationDays(row)}d
      </span>
    );
  }

  return (
    <BlueprintInput
      align="center"
      aliasTestIds={[`timeline-setup-row-duration-${row.key}`]}
      className="timeline-blueprint-summary-input"
      label={`${row.name} table duration`}
      onBlur={() =>
        onUpdateRow(row.key, {
          durationDays: parseDurationDays(row.durationText),
          durationText: normalizeDurationText(row.durationText),
        })
      }
      onChange={(durationText) =>
        onUpdateRow(
          row.key,
          {
            durationDays: parseDurationDays(durationText),
            durationText: durationText
              .replace(DURATION_PREFIX_REGEX, "")
              .replace(NON_DIGIT_REGEX, ""),
          },
          { commit: false }
        )
      }
      onCommit={onCommitField}
      testId={`timeline-setup-table-row-duration-${row.key}`}
      value={mode === "settings" ? row.durationText : row.durationText}
    />
  );
}

export function SummaryMilestoneEndCell({
  onCommitField,
  onUpdateRow,
  proposedStartDate,
  row,
  scheduleDisplayMode,
}: {
  onCommitField: () => void;
  onUpdateRow: (
    rowKey: string,
    patch: Partial<TimelineMilestoneWorksheetRow>,
    meta?: TimelineMilestoneWorksheetRowsChangeMeta
  ) => void;
  proposedStartDate?: string;
  row: TimelineMilestoneWorksheetRow;
  scheduleDisplayMode: TimelineScheduleDisplayMode;
}) {
  const startDay = rowStartDay(row);
  const durationDays = rowDurationDays(row);
  const endDate =
    scheduleDisplayMode === "dates" && proposedStartDate
      ? inclusiveEndDateFromProposalSchedule(
          proposedStartDate,
          startDay,
          durationDays
        )
      : undefined;
  const readout = endDate
    ? formatDisplayDateWithoutYear(endDate)
    : formatInclusiveEndTOffset(startDay, durationDays);
  const inputValue = endDate ?? readout;

  if (row.subMilestoneDetails.length > 0) {
    return (
      <span className="timeline-blueprint-summary-readout">{readout}</span>
    );
  }

  return (
    <BlueprintInput
      align="center"
      className="timeline-blueprint-summary-input"
      label={`${row.name} table end`}
      onBlur={onCommitField}
      onChange={(endValue) => {
        const nextDurationDays =
          scheduleDisplayMode === "dates" && proposedStartDate
            ? proposalDurationDaysFromInclusiveDates(
                dateFromProposalDayOffset(proposedStartDate, startDay),
                endValue
              )
            : Math.max(1, parseTOffsetDay(endValue) - startDay + 1);
        onUpdateRow(
          row.key,
          {
            durationDays: nextDurationDays,
            durationText: String(nextDurationDays),
          },
          { commit: false }
        );
      }}
      onCommit={onCommitField}
      testId={
        scheduleDisplayMode === "dates" && proposedStartDate
          ? `timeline-setup-table-row-end-date-${row.key}`
          : `timeline-setup-table-row-end-offset-${row.key}`
      }
      type={
        scheduleDisplayMode === "dates" && proposedStartDate ? "date" : "text"
      }
      value={inputValue}
    />
  );
}

export function SummaryMilestoneValueCell({
  mode,
  onCommitBudgetEdit,
  onUpdateRow,
  row,
}: {
  mode: WorksheetMode;
  onCommitBudgetEdit: (rowKey: string) => void;
  onUpdateRow: (
    rowKey: string,
    patch: Partial<TimelineMilestoneWorksheetRow>,
    meta?: TimelineMilestoneWorksheetRowsChangeMeta
  ) => void;
  row: TimelineMilestoneWorksheetRow;
}) {
  if (row.subMilestoneDetails.length > 0) {
    return (
      <span className="timeline-blueprint-summary-readout">
        {summaryValueText(mode, row)}
      </span>
    );
  }

  if (mode === "settings") {
    return (
      <BlueprintInput
        align="right"
        aliasTestIds={[`timeline-setup-row-budget-${row.key}`]}
        className="timeline-blueprint-summary-input"
        label={`${row.name} table percentage`}
        onBlur={() =>
          onUpdateRow(row.key, {
            percentageBps: parsePercentToBps(row.percentageText ?? ""),
            percentageText: normalizePercentText(row.percentageText ?? ""),
          })
        }
        onChange={(percentageText) =>
          onUpdateRow(
            row.key,
            {
              percentageBps: parsePercentToBps(percentageText),
              percentageText,
            },
            { commit: false }
          )
        }
        testId={`timeline-setup-table-row-budget-${row.key}`}
        value={row.percentageText ?? formatBps(row.percentageBps)}
      />
    );
  }

  return (
    <BlueprintInput
      align="right"
      aliasTestIds={[`timeline-setup-row-budget-${row.key}`]}
      className="timeline-blueprint-summary-input"
      label={`${row.name} table budget`}
      onBlur={() => onCommitBudgetEdit(row.key)}
      onChange={(budgetText) =>
        onUpdateRow(row.key, { budgetText }, { commit: false })
      }
      testId={`timeline-setup-table-row-budget-${row.key}`}
      value={row.budgetText}
    />
  );
}

export function SummarySubMilestoneDurationCell({
  onCommitField,
  onUpdateSubMilestone,
  subMilestone,
}: {
  mode: WorksheetMode;
  onCommitField: () => void;
  onUpdateSubMilestone: (
    patch: Partial<TimelineMilestoneWorksheetSubMilestone>,
    meta?: TimelineMilestoneWorksheetRowsChangeMeta
  ) => void;
  subMilestone: TimelineMilestoneWorksheetSubMilestone;
}) {
  return (
    <BlueprintInput
      align="center"
      aliasTestIds={[`timeline-setup-submilestone-duration-${subMilestone.id}`]}
      className="timeline-blueprint-summary-input"
      label={`${subMilestone.name} table duration`}
      onBlur={() =>
        onUpdateSubMilestone(
          {
            durationText: normalizeDurationText(subMilestone.durationText),
          },
          { commit: true }
        )
      }
      onChange={(durationText) =>
        onUpdateSubMilestone(
          {
            durationText: durationText
              .replace(DURATION_PREFIX_REGEX, "")
              .replace(NON_DIGIT_REGEX, ""),
          },
          { commit: false }
        )
      }
      onCommit={onCommitField}
      testId={`timeline-setup-table-subrow-duration-${subMilestone.id}`}
      value={subMilestone.durationText}
    />
  );
}

export function SummarySubMilestoneEndCell({
  onCommitField,
  onUpdateSubMilestone,
  proposedStartDate,
  row,
  scheduleDisplayMode,
  subMilestone,
}: {
  onCommitField: () => void;
  onUpdateSubMilestone: (
    patch: Partial<TimelineMilestoneWorksheetSubMilestone>,
    meta?: TimelineMilestoneWorksheetRowsChangeMeta
  ) => void;
  proposedStartDate?: string;
  row: TimelineMilestoneWorksheetRow;
  scheduleDisplayMode: TimelineScheduleDisplayMode;
  subMilestone: TimelineMilestoneWorksheetSubMilestone;
}) {
  const startDay = subMilestoneStartDay(row, subMilestone);
  const durationDays = parseDurationDays(subMilestone.durationText);
  const value =
    scheduleDisplayMode === "dates" && proposedStartDate
      ? inclusiveEndDateFromProposalSchedule(
          proposedStartDate,
          startDay,
          durationDays
        )
      : formatInclusiveEndTOffset(startDay, durationDays);

  return (
    <BlueprintInput
      align="center"
      className="timeline-blueprint-summary-input"
      label={`${subMilestone.name} table end`}
      onBlur={onCommitField}
      onChange={(endValue) => {
        const nextDurationDays =
          scheduleDisplayMode === "dates" && proposedStartDate
            ? proposalDurationDaysFromInclusiveDates(
                dateFromProposalDayOffset(proposedStartDate, startDay),
                endValue
              )
            : Math.max(1, parseTOffsetDay(endValue) - startDay + 1);
        onUpdateSubMilestone(
          {
            durationText: String(nextDurationDays),
          },
          { commit: false }
        );
      }}
      onCommit={onCommitField}
      testId={
        scheduleDisplayMode === "dates" && proposedStartDate
          ? `timeline-setup-table-subrow-end-date-${subMilestone.id}`
          : `timeline-setup-table-subrow-end-offset-${subMilestone.id}`
      }
      type={
        scheduleDisplayMode === "dates" && proposedStartDate ? "date" : "text"
      }
      value={value}
    />
  );
}

export function SummarySubMilestoneValueCell({
  mode,
  onUpdateSubMilestone,
  subMilestone,
}: {
  mode: WorksheetMode;
  onUpdateSubMilestone: (
    patch: Partial<TimelineMilestoneWorksheetSubMilestone>,
    meta?: TimelineMilestoneWorksheetRowsChangeMeta
  ) => void;
  subMilestone: TimelineMilestoneWorksheetSubMilestone;
}) {
  if (mode === "settings") {
    return (
      <BlueprintInput
        align="right"
        aliasTestIds={[`timeline-setup-submilestone-budget-${subMilestone.id}`]}
        className="timeline-blueprint-summary-input"
        label={`${subMilestone.name} table percentage`}
        onBlur={() =>
          onUpdateSubMilestone(
            {
              percentageBps: parsePercentToBps(
                subMilestone.percentageText ?? ""
              ),
              percentageText: normalizePercentText(
                subMilestone.percentageText ?? ""
              ),
            },
            { commit: true }
          )
        }
        onChange={(percentageText) =>
          onUpdateSubMilestone(
            {
              percentageBps: parsePercentToBps(percentageText),
              percentageText,
            },
            { commit: false }
          )
        }
        testId={`timeline-setup-table-subrow-budget-${subMilestone.id}`}
        value={
          subMilestone.percentageText ??
          formatBps(subMilestone.percentageBps ?? 0)
        }
      />
    );
  }

  return (
    <BlueprintInput
      align="right"
      aliasTestIds={[`timeline-setup-submilestone-budget-${subMilestone.id}`]}
      className="timeline-blueprint-summary-input"
      label={`${subMilestone.name} table budget`}
      onBlur={() =>
        onUpdateSubMilestone(
          {
            budgetText: normalizeCurrencyText(subMilestone.budgetText),
          },
          { commit: true }
        )
      }
      onChange={(budgetText) =>
        onUpdateSubMilestone({ budgetText }, { commit: false })
      }
      testId={`timeline-setup-table-subrow-budget-${subMilestone.id}`}
      value={subMilestone.budgetText}
    />
  );
}

export function SummaryStatusSignals({
  onOpenDetails,
  row,
  subMilestone,
}: {
  onOpenDetails: (
    rowKey: string,
    subMilestoneId?: string,
    tab?: TimelineDetailTab
  ) => void;
  row: TimelineMilestoneWorksheetRow;
  subMilestone?: TimelineMilestoneWorksheetSubMilestone;
}) {
  const statusScopeKey = subMilestone?.id ?? row.key;
  const contractorAssignments = scopedContractorAssignments(row, subMilestone);
  const materialItems = scopedCostItems(row, subMilestone);
  const guidanceDetails = summaryGuidanceDetails(row, subMilestone);
  const openChipTab = useCallback(
    (tab: TimelineDetailTab) => {
      onOpenDetails(row.key, subMilestone?.id, tab);
    },
    [onOpenDetails, row.key, subMilestone?.id]
  );

  return (
    <div className="timeline-blueprint-summary-status">
      <SummaryStatusChip
        count={contractorAssignments.length}
        details={
          <SummaryStatusContractorDetails
            assignments={contractorAssignments}
            row={row}
          />
        }
        kind="contractor"
        label="Contractor"
        onOpenTab={() => openChipTab("contractors")}
        scopeKey={statusScopeKey}
        summary={summaryContractorStatusText(contractorAssignments, row)}
      />
      <SummaryStatusChip
        active={guidanceDetails.active}
        details={<SummaryStatusGuidanceDetails details={guidanceDetails} />}
        kind="guidance"
        label="Guidance"
        onOpenTab={() => openChipTab("field-guidance")}
        scopeKey={statusScopeKey}
        summary={guidanceDetails.summary}
      />
      <SummaryStatusChip
        count={materialItems.length}
        details={
          <SummaryStatusMaterialDetails items={materialItems} row={row} />
        }
        kind="materials"
        label="Materials"
        onOpenTab={() => openChipTab("materials")}
        scopeKey={statusScopeKey}
        summary={summaryMaterialStatusText(materialItems)}
      />
    </div>
  );
}

export function SummaryStatusChip({
  active,
  count,
  details,
  kind,
  label,
  onOpenTab,
  scopeKey,
  summary,
}: {
  active?: boolean;
  count?: number;
  details: ReactNode;
  kind: "contractor" | "guidance" | "materials";
  label: string;
  onOpenTab: () => void;
  scopeKey: string;
  summary: string;
}) {
  const isActive = active ?? Boolean(count && count > 0);
  const displayLabel =
    typeof count === "number" && count > 0 ? `${label} ${count}` : label;
  const triggerId = `timeline-status-chip-${scopeKey}-${kind}`;
  return (
    <HoverCard>
      <HoverCardTrigger
        closeDelay={150}
        delay={250}
        render={
          <button
            aria-describedby={triggerId}
            aria-label={`${label}: ${summary}`}
            className="timeline-blueprint-summary-status-chip"
            data-state={isActive ? "set" : "missing"}
            data-testid={`timeline-setup-status-${scopeKey}-${kind}`}
            onClick={onOpenTab}
            type="button"
          />
        }
      >
        {displayLabel}
      </HoverCardTrigger>
      <HoverCardContent
        align="center"
        className="timeline-blueprint-summary-status-hover"
        id={triggerId}
        side="top"
        sideOffset={8}
      >
        <div className="timeline-blueprint-summary-status-tooltip-card">
          <div className="timeline-blueprint-summary-status-tooltip-heading">
            <span>{label}</span>
            <strong>{displayLabel}</strong>
          </div>
          <p>{summary}</p>
          {details}
          <button
            className="timeline-blueprint-summary-status-hover-open"
            data-testid={`timeline-setup-status-${scopeKey}-${kind}-open`}
            onClick={onOpenTab}
            type="button"
          >
            Open in detail sheet
            <MoveRight aria-hidden="true" />
          </button>
        </div>
      </HoverCardContent>
    </HoverCard>
  );
}

export function SummaryStatusContractorDetails({
  assignments,
  row,
}: {
  assignments: TimelineMilestoneWorksheetContractorAssignment[];
  row: TimelineMilestoneWorksheetRow;
}) {
  if (assignments.length === 0) {
    return (
      <p className="timeline-blueprint-summary-status-tooltip-empty">
        No designated contractors are assigned yet.
      </p>
    );
  }

  return (
    <div className="timeline-blueprint-summary-status-tooltip-list">
      {assignments.slice(0, 3).map((assignment) => (
        <article key={assignment.id}>
          <strong>{assignment.contractorName}</strong>
          <span>{assignment.role || "Role not set"}</span>
          <small>{contractorScopeLabel(row, assignment)}</small>
          <small>{contractorEstimateLabel(assignment)}</small>
        </article>
      ))}
      {assignments.length > 3 ? (
        <p className="timeline-blueprint-summary-status-tooltip-more">
          +{assignments.length - 3} more contractor
          {assignments.length - 3 === 1 ? "" : "s"}
        </p>
      ) : null}
    </div>
  );
}

export function SummaryStatusGuidanceDetails({
  details,
}: {
  details: SummaryGuidanceDetails;
}) {
  if (!details.active) {
    return (
      <p className="timeline-blueprint-summary-status-tooltip-empty">
        Add field guidance from the detail sheet before lender review.
      </p>
    );
  }

  return (
    <div className="timeline-blueprint-summary-status-tooltip-list">
      {details.items.map((item) => (
        <article key={item.label}>
          <strong>{item.label}</strong>
          <span>{item.value}</span>
        </article>
      ))}
    </div>
  );
}

export function SummaryStatusMaterialDetails({
  items,
  row,
}: {
  items: TimelineMilestoneWorksheetCostItem[];
  row: TimelineMilestoneWorksheetRow;
}) {
  if (items.length === 0) {
    return (
      <p className="timeline-blueprint-summary-status-tooltip-empty">
        No material or equipment costs are defined yet.
      </p>
    );
  }

  return (
    <div className="timeline-blueprint-summary-status-tooltip-list">
      {items.slice(0, 3).map((item) => (
        <article key={item.id}>
          <strong>{item.title}</strong>
          <span>
            {item.itemType === "equipment" ? "Equipment" : "Material"} ·{" "}
            {formatMaterialCost(item)}
          </span>
          <small>{item.supplier || "Supplier not set"}</small>
          <small>{materialScopeLabel(row, item)}</small>
        </article>
      ))}
      {items.length > 3 ? (
        <p className="timeline-blueprint-summary-status-tooltip-more">
          +{items.length - 3} more material item
          {items.length - 3 === 1 ? "" : "s"}
        </p>
      ) : null}
    </div>
  );
}

export interface SummaryGuidanceDetails {
  active: boolean;
  items: { label: string; value: string }[];
  summary: string;
}

export function scopedContractorAssignments(
  row: TimelineMilestoneWorksheetRow,
  subMilestone?: TimelineMilestoneWorksheetSubMilestone
) {
  const assignments = row.contractorAssignments ?? [];
  if (!subMilestone) {
    return assignments;
  }
  return assignments.filter((assignment) =>
    assignment.subMilestoneIds.includes(subMilestone.id)
  );
}

export function scopedCostItems(
  row: TimelineMilestoneWorksheetRow,
  subMilestone?: TimelineMilestoneWorksheetSubMilestone
) {
  const items = row.costItems ?? [];
  if (!subMilestone) {
    return items;
  }
  return items.filter((item) =>
    item.relevantSubMilestoneIds.includes(subMilestone.id)
  );
}

export function summaryContractorStatusText(
  assignments: TimelineMilestoneWorksheetContractorAssignment[],
  row: TimelineMilestoneWorksheetRow
) {
  if (assignments.length === 0) {
    return "No designated contractors assigned.";
  }
  return assignments
    .slice(0, 3)
    .map(
      (assignment) =>
        `${assignment.contractorName}, ${assignment.role || "role not set"}, ${contractorScopeLabel(row, assignment)}`
    )
    .join("; ");
}

export function summaryMaterialStatusText(
  items: TimelineMilestoneWorksheetCostItem[]
) {
  if (items.length === 0) {
    return "No materials or equipment defined.";
  }
  return items
    .slice(0, 3)
    .map((item) => `${item.title}, ${formatMaterialCost(item)}`)
    .join("; ");
}

export function summaryGuidanceDetails(
  row: TimelineMilestoneWorksheetRow,
  subMilestone?: TimelineMilestoneWorksheetSubMilestone
): SummaryGuidanceDetails {
  if (subMilestone) {
    const verification = plainTextFromTiptapJson(
      subMilestone.fieldGuidance?.whatToVerifyTiptapJson ?? ""
    );
    const cameraAngles = plainTextFromTiptapJson(
      subMilestone.fieldGuidance?.cameraAnglesTiptapJson ?? ""
    );
    const items = [
      verification ? { label: "What to verify", value: verification } : null,
      cameraAngles
        ? { label: "Recommended camera angles", value: cameraAngles }
        : null,
    ].filter((item): item is { label: string; value: string } => Boolean(item));
    return {
      active: items.length > 0,
      items,
      summary:
        items.length > 0
          ? items.map((item) => `${item.label}: ${item.value}`).join("; ")
          : "No field guidance set.",
    };
  }

  const guidance = coerceSiteVisitGuidance(row.siteVisitGuidance);
  const verify = plainTextFromHtml(guidance.whatToVerify);
  const camera = plainTextFromHtml(guidance.cameraAngles);
  const items = [
    verify ? { label: "What to verify", value: verify } : null,
    camera ? { label: "Required photo angles", value: camera } : null,
  ].filter((item): item is { label: string; value: string } => Boolean(item));

  return {
    active: items.length > 0,
    items,
    summary:
      items.length > 0
        ? items.map((item) => `${item.label}: ${item.value}`).join("; ")
        : "No field guidance set.",
  };
}

export function contractorScopeLabel(
  row: TimelineMilestoneWorksheetRow,
  assignment: TimelineMilestoneWorksheetContractorAssignment
) {
  if (assignment.subMilestoneIds.length === 0) {
    return "Milestone-level";
  }
  return assignment.subMilestoneIds
    .map((id) => subMilestoneNameById(row, id))
    .join(", ");
}

export function contractorEstimateLabel(
  assignment: TimelineMilestoneWorksheetContractorAssignment
) {
  const parts = [
    assignment.estimatedCostCents
      ? formatCurrency(assignment.estimatedCostCents)
      : null,
    assignment.estimatedHours
      ? `${assignment.estimatedHours} hr${assignment.estimatedHours === 1 ? "" : "s"}`
      : null,
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(" · ") : "Estimate not set";
}

export function materialScopeLabel(
  row: TimelineMilestoneWorksheetRow,
  item: TimelineMilestoneWorksheetCostItem
) {
  if (item.relevantSubMilestoneIds.length === 0) {
    return "Milestone-level";
  }
  return item.relevantSubMilestoneIds
    .map((id) => subMilestoneNameById(row, id))
    .join(", ");
}

export function formatMaterialCost(item: TimelineMilestoneWorksheetCostItem) {
  return `${item.quantity} x ${formatCurrency(item.costCents)}`;
}

export function summaryValueText(
  mode: WorksheetMode,
  row: TimelineMilestoneWorksheetRow
) {
  if (mode === "settings") {
    return formatBps(row.percentageBps);
  }
  const budgetCents = rowBudgetCents(row);
  return Number.isFinite(budgetCents)
    ? formatCurrency(budgetCents)
    : row.budgetText;
}

export function milestoneSummaryWindow(
  row: TimelineMilestoneWorksheetRow,
  {
    proposedStartDate,
    scheduleDisplayMode,
  }: {
    proposedStartDate?: string;
    scheduleDisplayMode: TimelineScheduleDisplayMode;
  }
) {
  const startDay = rowStartDay(row);
  const durationDays = rowDurationDays(row);
  return summaryWindowLabel({
    durationDays,
    proposedStartDate,
    scheduleDisplayMode,
    startDay,
  });
}

export function subMilestoneSummaryWindow(
  row: TimelineMilestoneWorksheetRow,
  subMilestone: TimelineMilestoneWorksheetSubMilestone,
  {
    proposedStartDate,
    scheduleDisplayMode,
  }: {
    proposedStartDate?: string;
    scheduleDisplayMode: TimelineScheduleDisplayMode;
  }
) {
  const startDay = subMilestoneStartDay(row, subMilestone);
  const durationDays = parseDurationDays(subMilestone.durationText);
  return summaryWindowLabel({
    durationDays,
    proposedStartDate,
    scheduleDisplayMode,
    startDay,
  });
}

export function summaryWindowLabel({
  durationDays,
  proposedStartDate,
  scheduleDisplayMode,
  startDay,
}: {
  durationDays: number;
  proposedStartDate?: string;
  scheduleDisplayMode: TimelineScheduleDisplayMode;
  startDay: number;
}) {
  const roundedStartDay = Math.round(startDay);
  const roundedDurationDays = Math.max(1, Math.round(durationDays));
  const endDay = roundedStartDay + roundedDurationDays;
  const duration = `${roundedDurationDays}d`;

  if (scheduleDisplayMode === "dates" && proposedStartDate) {
    return {
      duration,
      primary: [
        formatDisplayDateWithoutYear(
          dateFromProposalDayOffset(proposedStartDate, roundedStartDay)
        ),
        formatDisplayDateWithoutYear(
          dateFromProposalDayOffset(proposedStartDate, endDay)
        ),
      ].join(" to "),
    };
  }

  return {
    duration,
    primary: `Day ${roundedStartDay} to ${endDay}`,
  };
}
