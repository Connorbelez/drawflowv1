import type {
  ContractorDrawerAvailableContractor,
  ContractorProfileDraft,
} from "#/features/contractors/ContractorQuickAddDrawer.tsx";
import {
  type MaterialPlanningActions,
  type MaterialPlanningItem,
  type MaterialPlanningMilestone,
  type MaterialPlanningPayload,
} from "#/features/material-planning/MaterialPlanningTab.tsx";
import type { ReactNode } from "react";
import {
  dateFromProposalDayOffset,
  inclusiveEndDateFromProposalSchedule,
} from "#/features/production-proposals/proposalScheduleDates.ts";
import {
  formatCurrency,
  parseCurrencyToCents,
} from "#/features/builder-proposal-demo/template-helpers.ts";
import {
  guidanceLinesToHtml,
  type SiteVisitGuidanceHtml,
} from "#/lib/site-visit-guidance.ts";
import type { IsometricIconKey } from "./-timeline-share-snapshot.ts";
import { ISOMETRIC_ICON_KEYS } from "./-timeline-share-snapshot.ts";
import type { TimelineSubmilestoneFieldGuidance } from "./-timeline-milestone-submilestones.ts";
import type { ScopeRevisionSurfaceRoute } from "../submilestone-scope/SubmilestoneScopeRevisionSurface.tsx";

export const DEFAULT_NEW_MILESTONE_BUDGET_TEXT = "$0";
export const DEFAULT_NEW_MILESTONE_DURATION_TEXT = "7";
export const DEFAULT_NEW_SUB_MILESTONE_BUDGET_TEXT = "$0";
export const DEFAULT_NEW_SUB_MILESTONE_DURATION_TEXT = "1";
export const TOTAL_COMPLETION_BPS = 10_000;
export const FOCUSABLE_TABLE_CONTROL_SELECTOR = [
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(",");
export const DURATION_PREFIX_REGEX = /^T/i;
export const NON_DIGIT_REGEX = /\D/g;
export const T_OFFSET_PREFIX_REGEX = /^T/i;
export const T_OFFSET_PLUS_PREFIX_REGEX = /^\+/;

export const iconOptions = ISOMETRIC_ICON_KEYS;

export interface TimelineMilestoneWorksheetRowsChangeMeta {
  commit?: boolean;
  save?: {
    group: "fieldGuidance" | "scope";
    rowKey: string;
    subMilestoneId: string;
  };
}

export interface SubMilestoneBankItem {
  budgetText?: string;
  category: string;
  description: string;
  durationText: string;
  name: string;
}

export interface MilestoneMoveTarget {
  key: string;
  name: string;
}

export const SUB_MILESTONE_BANK: SubMilestoneBankItem[] = [
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
  fieldGuidance?: TimelineSubmilestoneFieldGuidance;
  id: string;
  name: string;
  percentageBps?: number;
  percentageText?: string;
  proposalSubmilestoneId?: string;
  scopeOfWorkTiptapJson?: string;
  startDay?: number;
}

export interface TimelineMilestoneWorksheetContractorOption {
  city?: string;
  contractorId: string;
  defaultPayRateCents?: number;
  defaultPayRateUnit?: "day" | "fixed" | "hour";
  name: string;
  trades?: string[];
}

export interface WorksheetContractorActions {
  availableContractors?: ContractorDrawerAvailableContractor[];
  onAttachAndInviteExisting?: (input: {
    contractorId: string;
    role: string;
  }) => Promise<unknown> | unknown;
  onAttachExisting?: (input: { contractorId: string; role: string }) => unknown;
  onCreate: (input: {
    contractor: ContractorProfileDraft;
    role?: string;
  }) => unknown;
  onInviteCreatedContractor?: (contractorId: string) => unknown;
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
  budgetSubmilestoneKey?: string;
  budgetTreatment?: "add" | "logOnly" | "maintain";
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
  startDay?: number;
  subMilestoneDetails: TimelineMilestoneWorksheetSubMilestone[];
  subMilestones: string[];
  type: string;
}

export type WorksheetMode = "settings" | "setup";
export type TimelineScheduleDisplayMode = "dates" | "tOffsets";
export type TimelineWorksheetView = "editor" | "table";
/**
 * Tabs surfaced inside the milestone/sub-milestone detail sheet. Status chips
 * in the table view map directly onto these values so a chip click can open
 * the sheet already focused on the relevant section.
 */
export type TimelineDetailTab =
  | "scope"
  | "submilestones"
  | "contractors"
  | "materials"
  | "field-guidance";
export type TimelineDetailsSheetTarget =
  | { kind: "milestone"; rowKey: string; tab?: TimelineDetailTab }
  | {
      kind: "subMilestone";
      rowKey: string;
      subMilestoneId: string;
      tab?: TimelineDetailTab;
    };
export interface PendingUnsavedNavigation {
  action: () => void;
  dirtyKeys: Set<string>;
}
export type SubMilestoneEditorResetVersions = Readonly<Record<string, number>>;
export type TimelineSummaryDragItem =
  | { id: string; kind: "group"; rowKey: string }
  | {
      id: string;
      kind: "subMilestone";
      rowKey: string;
      subMilestoneId: string;
    };

export interface TimelineMilestoneWorksheetProps {
  cascadeBudgetEdits?: boolean;
  cashText?: string;
  className?: string;
  contractorActions?: WorksheetContractorActions;
  contractorOptions?: TimelineMilestoneWorksheetContractorOption[];
  error?: string;
  footerExtra?: ReactNode;
  initialWorksheetView?: TimelineWorksheetView;
  leadingContent?: ReactNode;
  materialPlanningActions?: MaterialPlanningActions;
  mode: WorksheetMode;
  onBack?: () => void;
  onCascadeBudgetEditsChange?: (enabled: boolean) => void;
  onComplete?: (options: { redirectToDurableRoute: boolean }) => void;
  onReset?: () => void;
  onRowsChange: (
    rows: TimelineMilestoneWorksheetRow[],
    meta?: TimelineMilestoneWorksheetRowsChangeMeta
  ) => void | Promise<void>;
  onScheduleDisplayModeChange?: (mode: TimelineScheduleDisplayMode) => void;
  planningFocusScopeKey?: string;
  projectAddress?: string;
  proposalSubmittedAt?: number;
  proposedStartDate?: string;
  rows: TimelineMilestoneWorksheetRow[];
  scheduleDisplayMode?: TimelineScheduleDisplayMode;
  scopeRoute?: ScopeRevisionSurfaceRoute;
  scopeWorkosOrganizationId?: string;
  showHeading?: boolean;
  targetBudgetCents?: number;
  templateTitle: string;
  viewerCapacity?: import("../../../convex/build_collaboration_model").BuildCollaborationRole;
}


export function MetricPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="timeline-blueprint-metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

export function createCustomMilestoneRow({
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
      startDay:
        rows.length === 0
          ? 0
          : Math.max(
              ...rows.map((row) => rowStartDay(row) + rowDurationDays(row))
            ),
      subMilestoneDetails,
      subMilestones: [],
      type: "custom",
    },
    subMilestoneDetails
  );
}

export function withSubMilestoneDetails(
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

export function withDerivedSubMilestoneRollups(
  row: TimelineMilestoneWorksheetRow,
  { includeBudget }: { includeBudget: boolean }
): TimelineMilestoneWorksheetRow {
  const totalBudgetCents = row.subMilestoneDetails.reduce((sum, detail) => {
    const budgetCents = parseCurrencyToCents(detail.budgetText);

    return sum + (Number.isFinite(budgetCents) ? Math.max(0, budgetCents) : 0);
  }, 0);
  const scheduleRange = subMilestoneScheduleRange(row);

  return {
    ...row,
    ...(includeBudget ? { budgetText: formatCurrency(totalBudgetCents) } : {}),
    ...(scheduleRange
      ? {
          durationDays: scheduleRange.durationDays,
          durationText: String(scheduleRange.durationDays),
          startDay: scheduleRange.startDay,
        }
      : {}),
  };
}

export function rebalanceWorksheetCompletionPercentages(
  rows: TimelineMilestoneWorksheetRow[]
): TimelineMilestoneWorksheetRow[] {
  const allocationUnits = rows.flatMap((row) => {
    if (row.excluded) {
      return [];
    }
    if (row.subMilestoneDetails.length === 0) {
      return [{ percentageBps: row.percentageBps }];
    }
    return row.subMilestoneDetails.map((subMilestone) => ({
      percentageBps: subMilestone.percentageBps ?? 0,
    }));
  });
  if (allocationUnits.length === 0) {
    return rows;
  }

  const allocations = allocateWeightedUnits({
    fallbackWeights: allocationUnits.map(() => 0),
    preferredWeights: allocationUnits.map(
      (allocationUnit) => allocationUnit.percentageBps
    ),
    totalUnits: TOTAL_COMPLETION_BPS,
  });
  let allocationIndex = 0;

  return rows.map((row) => {
    if (row.excluded) {
      return row;
    }
    if (row.subMilestoneDetails.length === 0) {
      const percentageBps = allocations[allocationIndex] ?? 0;
      allocationIndex += 1;
      return {
        ...row,
        percentageBps,
        percentageText: formatBps(percentageBps),
      };
    }

    const subMilestoneDetails = row.subMilestoneDetails.map((subMilestone) => {
      const percentageBps = allocations[allocationIndex] ?? 0;
      allocationIndex += 1;
      return {
        ...subMilestone,
        percentageBps,
        percentageText: formatBps(percentageBps),
      };
    });
    const percentageBps = subMilestoneDetails.reduce(
      (sum, subMilestone) => sum + (subMilestone.percentageBps ?? 0),
      0
    );

    return {
      ...row,
      percentageBps,
      percentageText: formatBps(percentageBps),
      subMilestoneDetails,
    };
  });
}

export function worksheetRowToMaterialMilestone(
  row: TimelineMilestoneWorksheetRow
): MaterialPlanningMilestone {
  const budgetCents = rowBudgetCents(row);
  return {
    budgetCents: Number.isFinite(budgetCents) ? Math.max(0, budgetCents) : 0,
    key: row.key,
    name: row.name,
    order: row.order,
    submilestones: row.subMilestoneDetails.map((subMilestone, index) => ({
      budgetCents: Math.max(0, parseCurrencyToCents(subMilestone.budgetText)),
      key: subMilestone.id,
      milestoneKey: row.key,
      name: sanitizeSubMilestoneName(subMilestone.name),
      order: index + 1,
    })),
  };
}

export function worksheetRowToScopedMaterialMilestone(
  row: TimelineMilestoneWorksheetRow,
  subMilestone: TimelineMilestoneWorksheetSubMilestone
): MaterialPlanningMilestone {
  const budgetCents = parseCurrencyToCents(subMilestone.budgetText);
  return {
    budgetCents: Number.isFinite(budgetCents) ? Math.max(0, budgetCents) : 0,
    key: row.key,
    name: row.name,
    order: row.order,
    submilestones: [
      {
        budgetCents: Math.max(0, budgetCents),
        key: subMilestone.id,
        milestoneKey: row.key,
        name: sanitizeSubMilestoneName(subMilestone.name),
        order:
          row.subMilestoneDetails.findIndex(
            (candidate) => candidate.id === subMilestone.id
          ) + 1,
      },
    ],
  };
}

export function worksheetCostItemsToMaterialItems(
  row: TimelineMilestoneWorksheetRow
): MaterialPlanningItem[] {
  return (row.costItems ?? []).map((item) => ({
    _id: item.id,
    budgetSubmilestoneKey: item.budgetSubmilestoneKey,
    budgetTreatment: item.budgetTreatment,
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

export function materialPayloadToWorksheetCostItem(
  rowKey: string,
  payload: MaterialPlanningPayload,
  existingId?: string
): TimelineMilestoneWorksheetCostItem {
  return {
    budgetSubmilestoneKey: payload.budgetSubmilestoneKey ?? undefined,
    budgetTreatment: payload.budgetTreatment,
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

export function parseOptionalCurrencyCents(value: string) {
  if (!value.trim()) {
    return;
  }
  const cents = parseCurrencyToCents(value);
  return Number.isFinite(cents) && cents > 0 ? Math.round(cents) : undefined;
}

export function parseOptionalHours(value: string) {
  if (!value.trim()) {
    return;
  }
  const parsed = Number(value.replace(/,/g, ""));
  return Number.isFinite(parsed) && parsed > 0
    ? Math.round(parsed * 100) / 100
    : undefined;
}

export function subMilestoneNameById(
  row: TimelineMilestoneWorksheetRow,
  subMilestoneId: string
) {
  return (
    row.subMilestoneDetails.find((detail) => detail.id === subMilestoneId)
      ?.name ?? subMilestoneId
  );
}

export function makeWorksheetId(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 8)}`;
}

export function defaultGuidanceForRow(
  row: TimelineMilestoneWorksheetRow
): SiteVisitGuidanceHtml {
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

export function makeUniqueRowKey(name: string, rows: TimelineMilestoneWorksheetRow[]) {
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

export function cascadeBudgetEdit({
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

export function allocateWeightedCents({
  fallbackWeights,
  preferredWeights,
  totalCents,
}: {
  fallbackWeights: number[];
  preferredWeights: number[];
  totalCents: number;
}) {
  return allocateWeightedUnits({
    fallbackWeights,
    preferredWeights,
    totalUnits: totalCents,
  });
}

export function allocateWeightedUnits({
  fallbackWeights,
  preferredWeights,
  totalUnits,
}: {
  fallbackWeights: number[];
  preferredWeights: number[];
  totalUnits: number;
}) {
  const roundedTotalUnits = Math.max(0, Math.round(totalUnits));
  if (preferredWeights.length === 0) {
    return [];
  }

  const weights = resolveAllocationWeights(preferredWeights, fallbackWeights);
  const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
  const allocations = weights.map((weight, order) => {
    const raw = roundedTotalUnits * weight;
    return {
      units: Math.floor(raw / totalWeight),
      order,
      remainder: raw % totalWeight,
    };
  });
  let remainderUnits =
    roundedTotalUnits -
    allocations.reduce((sum, allocation) => sum + allocation.units, 0);
  const byRemainder = [...allocations].sort(
    (a, b) => b.remainder - a.remainder || a.order - b.order
  );
  for (const allocation of byRemainder) {
    if (remainderUnits <= 0) {
      break;
    }
    allocation.units += 1;
    remainderUnits -= 1;
  }

  return allocations
    .sort((a, b) => a.order - b.order)
    .map((allocation) => allocation.units);
}

export function resolveAllocationWeights(
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

export function withBudgetPercentages(
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

export function rowBudgetCents(row: TimelineMilestoneWorksheetRow) {
  const parsed = parseCurrencyToCents(row.budgetText);
  return Number.isFinite(parsed) ? Math.max(0, parsed) : Number.NaN;
}

export function storedRowDurationDays(row: TimelineMilestoneWorksheetRow) {
  const parsed = Number(row.durationText.replace(DURATION_PREFIX_REGEX, ""));
  return Number.isFinite(parsed) ? Math.max(1, Math.round(parsed)) : Number.NaN;
}

export function rowDurationDays(row: TimelineMilestoneWorksheetRow) {
  return (
    subMilestoneScheduleRange(row)?.durationDays ?? storedRowDurationDays(row)
  );
}

export function storedRowStartDay(row: TimelineMilestoneWorksheetRow) {
  return Math.round(row.startDay ?? 0);
}

export function rowStartDay(row: TimelineMilestoneWorksheetRow) {
  return subMilestoneScheduleRange(row)?.startDay ?? storedRowStartDay(row);
}

export function parseTOffsetDay(value: string) {
  const normalized = value
    .trim()
    .replace(T_OFFSET_PREFIX_REGEX, "")
    .replace(T_OFFSET_PLUS_PREFIX_REGEX, "");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? Math.round(parsed) : 0;
}

export function formatTOffset(day: number) {
  const rounded = Math.round(day);
  if (rounded > 0) {
    return `T+${rounded}`;
  }
  return `T${rounded}`;
}

export function formatInclusiveEndTOffset(startDay: number, durationDays: number) {
  return formatTOffset(Math.round(startDay) + Math.max(1, durationDays) - 1);
}

export function subMilestoneStartDay(
  row: TimelineMilestoneWorksheetRow,
  subMilestone: TimelineMilestoneWorksheetSubMilestone
) {
  return Math.round(subMilestone.startDay ?? storedRowStartDay(row));
}

export function subMilestoneScheduleRange(row: TimelineMilestoneWorksheetRow) {
  if (row.subMilestoneDetails.length === 0) {
    return;
  }

  const startsAndEnds = row.subMilestoneDetails.map((subMilestone) => {
    const startDay = subMilestoneStartDay(row, subMilestone);
    const endDay = startDay + parseDurationDays(subMilestone.durationText) - 1;
    return { endDay, startDay };
  });
  const startDay = Math.min(...startsAndEnds.map((range) => range.startDay));
  const endDay = Math.max(...startsAndEnds.map((range) => range.endDay));

  return {
    durationDays: Math.max(1, endDay - startDay + 1),
    endDay,
    startDay,
  };
}

export function subMilestoneDateRangeLabel(
  row: TimelineMilestoneWorksheetRow,
  subMilestone: TimelineMilestoneWorksheetSubMilestone,
  proposedStartDate: string
) {
  const startDay = subMilestoneStartDay(row, subMilestone);
  return [
    formatDisplayDateWithoutYear(
      dateFromProposalDayOffset(proposedStartDate, startDay)
    ),
    formatDisplayDateWithoutYear(
      inclusiveEndDateFromProposalSchedule(
        proposedStartDate,
        startDay,
        parseDurationDays(subMilestone.durationText)
      )
    ),
  ].join(" - ");
}

export function formatDisplayDateWithoutYear(value: string) {
  const [, month, day] = value.split("-");
  return month && day ? `${month}-${day}` : value;
}

export function subMilestoneTOffsetRangeLabel(
  row: TimelineMilestoneWorksheetRow,
  subMilestone: TimelineMilestoneWorksheetSubMilestone
) {
  const startDay = subMilestoneStartDay(row, subMilestone);
  return [
    formatTOffset(startDay),
    formatInclusiveEndTOffset(
      startDay,
      parseDurationDays(subMilestone.durationText)
    ),
  ].join(" - ");
}

export function parseDurationDays(value: string) {
  const parsed = Number(value.replace(DURATION_PREFIX_REGEX, ""));
  return Number.isFinite(parsed) ? Math.max(1, Math.round(parsed)) : 1;
}

export function normalizeCurrencyText(value: string) {
  const cents = parseCurrencyToCents(value);
  return Number.isFinite(cents) ? formatCurrency(Math.max(0, cents)) : value;
}

export function normalizeDurationText(value: string) {
  const parsed = Number(value.replace(DURATION_PREFIX_REGEX, ""));
  return Number.isFinite(parsed)
    ? String(Math.max(1, Math.round(parsed)))
    : value;
}

export function formatBps(value: number) {
  return `${(value / 100).toFixed(2)}%`;
}

export function normalizePercentText(value: string) {
  return formatBps(parsePercentToBps(value));
}

export function parsePercentToBps(value: string) {
  const parsed = Number(value.replace("%", "").trim());
  return Number.isFinite(parsed) ? Math.max(0, Math.round(parsed * 100)) : 0;
}

export function sanitizeSubMilestoneName(value: string) {
  const trimmed = value.trim();
  return trimmed || "Untitled sub-milestone";
}

export function slugifySubMilestone(value: string) {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "sub-milestone"
  );
}

export function makeUniqueSubMilestoneName(
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

export function hasAvailableSubMilestoneBankMatches(
  existingNameSet: Set<string>,
  query: string
) {
  return SUB_MILESTONE_BANK.some(
    (item) =>
      !existingNameSet.has(item.name.toLowerCase()) &&
      matchesSubMilestoneBankQuery(item, query)
  );
}

export function matchesSubMilestoneBankQuery(
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

export function formatRowType(value: string) {
  return value
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replaceAll("_", " ")
    .toLowerCase();
}
