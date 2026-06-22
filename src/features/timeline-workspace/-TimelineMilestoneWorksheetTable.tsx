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
  MoveRight,
  PanelRightOpen,
  Plus,
  Trash2,
} from "lucide-react";
import {
  type KeyboardEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Sortable,
  SortableItem,
  SortableItemHandle,
} from "#/components/reui/sortable.tsx";
import { FieldRichTextEditor } from "#/components/rich-text/field-rich-text.tsx";
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
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuGroup,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "#/components/ui/context-menu.tsx";
import { Group, GroupText } from "#/components/ui/group.tsx";
import {
  Sheet,
  SheetDescription,
  SheetHeader,
  SheetPanel,
  SheetPopup,
  SheetTitle,
} from "#/components/ui/sheet.tsx";
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
import { Tabs, TabsList, TabsPanel, TabsTab } from "#/components/ui/tabs.tsx";
import { Toggle } from "#/components/ui/toggle.tsx";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "#/components/ui/tooltip.tsx";
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
  dateFromProposalDayOffset,
  dayOffsetFromProposalDate,
  inclusiveEndDateFromProposalSchedule,
  proposalDurationDaysFromInclusiveDates,
} from "#/features/production-proposals/proposalScheduleDates.ts";
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
const T_OFFSET_PREFIX_REGEX = /^T/i;
const T_OFFSET_PLUS_PREFIX_REGEX = /^\+/;

const iconOptions = ISOMETRIC_ICON_KEYS;

export interface TimelineMilestoneWorksheetRowsChangeMeta {
  commit?: boolean;
}

interface SubMilestoneBankItem {
  budgetText?: string;
  category: string;
  description: string;
  durationText: string;
  name: string;
}

interface MilestoneMoveTarget {
  key: string;
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
  startDay?: number;
  subMilestoneDetails: TimelineMilestoneWorksheetSubMilestone[];
  subMilestones: string[];
  type: string;
}

type WorksheetMode = "settings" | "setup";
export type TimelineScheduleDisplayMode = "dates" | "tOffsets";
type TimelineWorksheetView = "editor" | "table";
type TimelineDetailsSheetTarget =
  | { kind: "milestone"; rowKey: string }
  | { kind: "subMilestone"; rowKey: string; subMilestoneId: string };
type TimelineSummaryDragItem =
  | { id: string; kind: "group"; rowKey: string }
  | {
      id: string;
      kind: "subMilestone";
      rowKey: string;
      subMilestoneId: string;
    };

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Existing shared worksheet orchestrator owns row editing, drag/drop, scheduling, planning tabs, and setup persistence.
export function TimelineMilestoneWorksheetTable({
  cascadeBudgetEdits = false,
  cashText,
  className,
  contractorOptions = [],
  error,
  footerExtra,
  initialWorksheetView,
  leadingContent,
  mode,
  onBack,
  onCascadeBudgetEditsChange,
  onComplete,
  onReset,
  onRowsChange,
  onScheduleDisplayModeChange,
  projectAddress,
  proposedStartDate,
  rows,
  scheduleDisplayMode = proposedStartDate ? "dates" : "tOffsets",
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
  initialWorksheetView?: TimelineWorksheetView;
  leadingContent?: ReactNode;
  mode: WorksheetMode;
  onBack?: () => void;
  onCascadeBudgetEditsChange?: (enabled: boolean) => void;
  onComplete?: (options: { redirectToDurableRoute: boolean }) => void;
  onReset?: () => void;
  onRowsChange: (
    rows: TimelineMilestoneWorksheetRow[],
    meta?: TimelineMilestoneWorksheetRowsChangeMeta
  ) => void;
  onScheduleDisplayModeChange?: (mode: TimelineScheduleDisplayMode) => void;
  projectAddress?: string;
  proposedStartDate?: string;
  rows: TimelineMilestoneWorksheetRow[];
  scheduleDisplayMode?: TimelineScheduleDisplayMode;
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
  const [worksheetView, setWorksheetView] = useState<TimelineWorksheetView>(
    () => initialWorksheetView ?? (mode === "setup" ? "table" : "editor")
  );
  const [detailsSheetTarget, setDetailsSheetTarget] =
    useState<TimelineDetailsSheetTarget | null>(null);
  const keyboardInstructionsId = useId();
  const rowsRef = useRef(rows);
  const onRowsChangeRef = useRef(onRowsChange);
  rowsRef.current = rows;
  onRowsChangeRef.current = onRowsChange;

  const updateRows = useCallback(
    (
      nextRows: TimelineMilestoneWorksheetRow[],
      meta: TimelineMilestoneWorksheetRowsChangeMeta = { commit: true }
    ) =>
      onRowsChangeRef.current(
        nextRows.map((row, order) => ({
          ...row,
          order,
        })),
        meta
      ),
    []
  );

  const updateRow = useCallback(
    (
      rowKey: string,
      patch: Partial<TimelineMilestoneWorksheetRow>,
      meta?: TimelineMilestoneWorksheetRowsChangeMeta
    ) => {
      updateRows(
        rowsRef.current.map((row) =>
          row.key === rowKey ? { ...row, ...patch } : row
        ),
        meta
      );
    },
    [updateRows]
  );

  const updateSubMilestone = (
    rowKey: string,
    subMilestoneId: string,
    patch: Partial<TimelineMilestoneWorksheetSubMilestone>,
    meta?: TimelineMilestoneWorksheetRowsChangeMeta
  ) => {
    updateRows(
      rowsRef.current.map((row) => {
        if (row.key !== rowKey) {
          return row;
        }

        const nextRow = withSubMilestoneDetails(
          row,
          row.subMilestoneDetails.map((detail) =>
            detail.id === subMilestoneId ? { ...detail, ...patch } : detail
          )
        );

        return withDerivedSubMilestoneRollups(nextRow, {
          includeBudget: mode === "setup",
        });
      }),
      meta
    );
    setActiveSubMilestoneByRow((current) => ({
      ...current,
      [rowKey]: subMilestoneId,
    }));
  };
  const commitRows = useCallback(() => {
    updateRows(rowsRef.current, { commit: true });
  }, [updateRows]);

  const openDetailsSheet = useCallback(
    (rowKey: string, subMilestoneId?: string) => {
      if (subMilestoneId) {
        setActiveSubMilestoneByRow((current) => ({
          ...current,
          [rowKey]: subMilestoneId,
        }));
        setDetailsSheetTarget({
          kind: "subMilestone",
          rowKey,
          subMilestoneId,
        });
        return;
      }
      setDetailsSheetTarget({ kind: "milestone", rowKey });
    },
    []
  );

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
      startDay:
        row.subMilestoneDetails.length === 0
          ? rowStartDay(row)
          : Math.max(
              ...row.subMilestoneDetails.map(
                (detail) =>
                  subMilestoneStartDay(row, detail) +
                  parseDurationDays(detail.durationText)
              )
            ),
    };

    updateRows(
      rows.map((candidate) => {
        if (candidate.key !== rowKey) {
          return candidate;
        }

        const nextRow = withSubMilestoneDetails(candidate, [
          ...candidate.subMilestoneDetails,
          nextSubMilestone,
        ]);

        return withDerivedSubMilestoneRollups(nextRow, {
          includeBudget: mode === "setup",
        });
      })
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

        const nextRow = withSubMilestoneDetails(row, subMilestoneDetails);

        return withDerivedSubMilestoneRollups(nextRow, {
          includeBudget: mode === "setup",
        });
      })
    );
    setActiveSubMilestoneByRow((current) => ({
      ...current,
      [rowKey]: nextActiveSubMilestoneId,
    }));
  };

  const moveSubMilestone = (
    sourceRowKey: string,
    subMilestoneId: string,
    targetRowKey: string
  ) => {
    if (sourceRowKey === targetRowKey) {
      return;
    }

    const currentRows = rowsRef.current;
    const sourceRow = currentRows.find((row) => row.key === sourceRowKey);
    const targetRow = currentRows.find((row) => row.key === targetRowKey);
    const movedSubMilestone = sourceRow?.subMilestoneDetails.find(
      (detail) => detail.id === subMilestoneId
    );
    if (!(sourceRow && targetRow && movedSubMilestone)) {
      return;
    }

    const sourceIndex = sourceRow.subMilestoneDetails.findIndex(
      (detail) => detail.id === subMilestoneId
    );
    const nextSourceSubMilestones = sourceRow.subMilestoneDetails.filter(
      (detail) => detail.id !== subMilestoneId
    );
    const nextTargetSubMilestones = [
      ...targetRow.subMilestoneDetails,
      movedSubMilestone,
    ];
    const nextSourceActiveSubMilestoneId =
      nextSourceSubMilestones[Math.max(0, sourceIndex - 1)]?.id ??
      nextSourceSubMilestones[0]?.id ??
      "";

    updateRows(
      currentRows.map((row) => {
        if (row.key === sourceRowKey) {
          return withDerivedSubMilestoneRollups(
            withSubMilestoneDetails(row, nextSourceSubMilestones),
            { includeBudget: mode === "setup" }
          );
        }
        if (row.key === targetRowKey) {
          return withDerivedSubMilestoneRollups(
            withSubMilestoneDetails(row, nextTargetSubMilestones),
            { includeBudget: mode === "setup" }
          );
        }
        return row;
      })
    );
    setActiveSubMilestoneByRow((current) => ({
      ...current,
      [sourceRowKey]: nextSourceActiveSubMilestoneId,
      [targetRowKey]: subMilestoneId,
    }));
  };

  const moveSummarySubMilestone = useCallback(
    (activeIndex: number, overIndex: number) => {
      const nextRows = moveSubMilestoneWithinSummaryRows(
        rowsRef.current,
        activeIndex,
        overIndex,
        { includeBudget: mode === "setup" }
      );
      if (nextRows) {
        updateRows(nextRows);
      }
    },
    [mode, updateRows]
  );

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
        : setupColumns({
            commitBudgetEdit,
            commitRows,
            moveRowByKey,
            proposedStartDate,
            scheduleDisplayMode,
            updateRow,
          }),
    [
      commitBudgetEdit,
      commitRows,
      mode,
      moveRowByKey,
      proposedStartDate,
      scheduleDisplayMode,
      updateRow,
    ]
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
  const showSetupActions = mode === "setup" && Boolean(onBack || onComplete);
  const detailsSheetRow =
    rows.find((row) => row.key === detailsSheetTarget?.rowKey) ?? null;
  const detailsSheetSubMilestone =
    detailsSheetTarget?.kind === "subMilestone"
      ? (detailsSheetRow?.subMilestoneDetails.find(
          (subMilestone) =>
            subMilestone.id === detailsSheetTarget.subMilestoneId
        ) ?? null)
      : null;
  const detailsSheetSummary = detailsSheetRow
    ? milestoneSummaryWindow(detailsSheetRow, {
        proposedStartDate,
        scheduleDisplayMode,
      })
    : null;
  const detailsSheetSubMilestoneSummary =
    detailsSheetRow && detailsSheetSubMilestone
      ? subMilestoneSummaryWindow(detailsSheetRow, detailsSheetSubMilestone, {
          proposedStartDate,
          scheduleDisplayMode,
        })
      : null;
  const detailsSheetOpen = Boolean(
    detailsSheetRow &&
      (detailsSheetTarget?.kind === "milestone" || detailsSheetSubMilestone)
  );
  const detailsSheetTitle =
    detailsSheetTarget?.kind === "subMilestone" && detailsSheetSubMilestone
      ? sanitizeSubMilestoneName(detailsSheetSubMilestone.name)
      : (detailsSheetRow?.name ?? "Milestone details");
  const detailsSheetDescription =
    detailsSheetTarget?.kind === "subMilestone" &&
    detailsSheetRow &&
    detailsSheetSubMilestone &&
    detailsSheetSubMilestoneSummary
      ? `${detailsSheetRow.name} / ${detailsSheetSubMilestoneSummary.primary} / ${
          mode === "settings"
            ? (detailsSheetSubMilestone.percentageText ??
              formatBps(detailsSheetSubMilestone.percentageBps ?? 0))
            : detailsSheetSubMilestone.budgetText
        }`
      : detailsSheetRow && detailsSheetSummary
        ? `${detailsSheetSummary.primary} / ${summaryValueText(
            mode,
            detailsSheetRow
          )} / ${detailsSheetRow.subMilestoneDetails.length} sub-milestone${
            detailsSheetRow.subMilestoneDetails.length === 1 ? "" : "s"
          }`
        : "Milestone details";
  const detailsSheetTestId =
    detailsSheetTarget?.kind === "subMilestone" && detailsSheetSubMilestone
      ? `timeline-setup-submilestone-details-sheet-${detailsSheetSubMilestone.id}`
      : detailsSheetRow
        ? `timeline-setup-details-sheet-${detailsSheetRow.key}`
        : undefined;

  const renderMilestoneDetailTabs = (
    row: TimelineMilestoneWorksheetRow,
    placement: "expanded" | "sheet" = "expanded"
  ) => (
    <MilestoneExpandedTabs
      activeSubMilestoneId={activeSubMilestoneByRow[row.key]}
      contractorOptions={contractorOptions}
      mode={mode}
      moveTargetRows={rows.map(({ key, name }) => ({
        key,
        name,
      }))}
      onActiveSubMilestoneChange={(subMilestoneId) =>
        setActiveSubMilestoneByRow((current) => ({
          ...current,
          [row.key]: subMilestoneId,
        }))
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
      proposedStartDate={proposedStartDate}
      row={row}
      scheduleDisplayMode={scheduleDisplayMode}
    />
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
        onValueChange={(value) => {
          if (value === "editor" || value === "table") {
            setWorksheetView(value);
          }
        }}
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
        <TabsPanel className="timeline-blueprint-view-panel" value="editor">
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
            onMoveSubMilestone={moveSummarySubMilestone}
            onOpenDetails={openDetailsSheet}
            onUpdateRow={updateRow}
            onUpdateSubMilestone={updateSubMilestone}
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
            >
              {error}
            </p>
          ) : null}
          {showSetupActions ? (
            <>
              {onBack ? (
                <Button
                  className="timeline-setup-secondary"
                  onClick={onBack}
                  variant="outline"
                >
                  Back to templates
                </Button>
              ) : null}
              {onComplete ? (
                <Button
                  className="timeline-setup-primary"
                  data-testid="timeline-setup-complete"
                  onClick={() => onComplete({ redirectToDurableRoute: false })}
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
            setDetailsSheetTarget(null);
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
                contractorOptions={contractorOptions}
                mode={mode}
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
                proposedStartDate={proposedStartDate}
                row={detailsSheetRow}
                scheduleDisplayMode={scheduleDisplayMode}
                subMilestone={detailsSheetSubMilestone}
              />
            ) : detailsSheetRow ? (
              renderMilestoneDetailTabs(detailsSheetRow, "sheet")
            ) : null}
          </SheetPanel>
        </SheetPopup>
      </Sheet>
    </div>
  );
}

function MilestoneSummaryTable({
  customMilestoneName,
  mode,
  onAddCustomMilestone,
  onAddSubMilestone,
  onCommitBudgetEdit,
  onCommitField,
  onCustomMilestoneNameChange,
  onMoveSubMilestone,
  onOpenDetails,
  onUpdateRow,
  onUpdateSubMilestone,
  proposedStartDate,
  rows,
  scheduleDisplayMode,
  templateTitle,
}: {
  customMilestoneName: string;
  mode: WorksheetMode;
  onAddCustomMilestone: () => void;
  onAddSubMilestone: (rowKey: string) => void;
  onCommitBudgetEdit: (rowKey: string) => void;
  onCommitField: () => void;
  onCustomMilestoneNameChange: (value: string) => void;
  onMoveSubMilestone: (activeIndex: number, overIndex: number) => void;
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
  proposedStartDate?: string;
  rows: TimelineMilestoneWorksheetRow[];
  scheduleDisplayMode: TimelineScheduleDisplayMode;
  templateTitle: string;
}) {
  const valueHeader = mode === "settings" ? "PoC" : "Budget";
  const dragItems = timelineSummaryDragItems(rows);

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
                  <SummaryWindowCell window={rowWindow} />
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
                  <SummaryStatusSignals row={row} />
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
                      row.excluded && "is-excluded"
                    )}
                    data-testid={`timeline-setup-table-subrow-${subMilestone.id}`}
                    key={`${row.key}:${subMilestone.id}`}
                    render={<TableRow />}
                    value={summarySubMilestoneItemId(subMilestone.id)}
                  >
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

function SummaryWindowCell({
  window,
}: {
  window: { duration: string; primary: string };
}) {
  return (
    <span className="timeline-blueprint-summary-window">
      <strong>{window.primary}</strong>
      <small>{window.duration}</small>
    </span>
  );
}

function SummaryMilestoneDurationCell({
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

function SummaryMilestoneEndCell({
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

function SummaryMilestoneValueCell({
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

function SummarySubMilestoneDurationCell({
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

function SummarySubMilestoneEndCell({
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

function SummarySubMilestoneValueCell({
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

function SummaryStatusSignals({
  row,
  subMilestone,
}: {
  row: TimelineMilestoneWorksheetRow;
  subMilestone?: TimelineMilestoneWorksheetSubMilestone;
}) {
  const statusScopeKey = subMilestone?.id ?? row.key;
  const contractorAssignments = scopedContractorAssignments(row, subMilestone);
  const materialItems = scopedCostItems(row, subMilestone);
  const guidanceDetails = summaryGuidanceDetails(row, subMilestone);

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
        scopeKey={statusScopeKey}
        summary={summaryContractorStatusText(contractorAssignments, row)}
      />
      <SummaryStatusChip
        active={guidanceDetails.active}
        details={<SummaryStatusGuidanceDetails details={guidanceDetails} />}
        kind="guidance"
        label="Guidance"
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
        scopeKey={statusScopeKey}
        summary={summaryMaterialStatusText(materialItems)}
      />
    </div>
  );
}

function SummaryStatusChip({
  active,
  count,
  details,
  kind,
  label,
  scopeKey,
  summary,
}: {
  active?: boolean;
  count?: number;
  details: ReactNode;
  kind: "contractor" | "guidance" | "materials";
  label: string;
  scopeKey: string;
  summary: string;
}) {
  const isActive = active ?? Boolean(count && count > 0);
  const displayLabel =
    typeof count === "number" && count > 0 ? `${label} ${count}` : label;
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <button
            aria-label={`${label}: ${summary}`}
            className="timeline-blueprint-summary-status-chip"
            data-state={isActive ? "set" : "missing"}
            data-testid={`timeline-setup-status-${scopeKey}-${kind}`}
            type="button"
          />
        }
      >
        {displayLabel}
      </TooltipTrigger>
      <TooltipContent
        className="timeline-blueprint-summary-status-tooltip"
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
        </div>
      </TooltipContent>
    </Tooltip>
  );
}

function SummaryStatusContractorDetails({
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

function SummaryStatusGuidanceDetails({
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

function SummaryStatusMaterialDetails({
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

interface SummaryGuidanceDetails {
  active: boolean;
  items: { label: string; value: string }[];
  summary: string;
}

function scopedContractorAssignments(
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

function scopedCostItems(
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

function summaryContractorStatusText(
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

function summaryMaterialStatusText(
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

function summaryGuidanceDetails(
  row: TimelineMilestoneWorksheetRow,
  subMilestone?: TimelineMilestoneWorksheetSubMilestone
): SummaryGuidanceDetails {
  if (subMilestone) {
    const scopeNote = subMilestone.description.trim();
    return {
      active: Boolean(scopeNote),
      items: scopeNote ? [{ label: "Scope note", value: scopeNote }] : [],
      summary: scopeNote || "No field guidance set.",
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

function contractorScopeLabel(
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

function contractorEstimateLabel(
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

function materialScopeLabel(
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

function formatMaterialCost(item: TimelineMilestoneWorksheetCostItem) {
  return `${item.quantity} x ${formatCurrency(item.costCents)}`;
}

function plainTextFromHtml(value: string) {
  return value
    .replace(/<[^>]*>/g, " ")
    .replaceAll("&nbsp;", " ")
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replace(/\s+/g, " ")
    .trim();
}

function summaryValueText(
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

function milestoneSummaryWindow(
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

function subMilestoneSummaryWindow(
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

function summaryWindowLabel({
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

function timelineSummaryDragItems(
  rows: TimelineMilestoneWorksheetRow[]
): TimelineSummaryDragItem[] {
  return rows.flatMap((row) => [
    {
      id: summaryGroupItemId(row.key),
      kind: "group" as const,
      rowKey: row.key,
    },
    ...row.subMilestoneDetails.map((subMilestone) => ({
      id: summarySubMilestoneItemId(subMilestone.id),
      kind: "subMilestone" as const,
      rowKey: row.key,
      subMilestoneId: subMilestone.id,
    })),
  ]);
}

function summaryGroupItemId(rowKey: string) {
  return `summary-group:${rowKey}`;
}

function summarySubMilestoneItemId(subMilestoneId: string) {
  return `summary-submilestone:${subMilestoneId}`;
}

export function moveSubMilestoneWithinSummaryRows(
  rows: TimelineMilestoneWorksheetRow[],
  activeIndex: number,
  overIndex: number,
  { includeBudget }: { includeBudget: boolean }
) {
  const dragItems = timelineSummaryDragItems(rows);
  const activeItem = dragItems[activeIndex];
  const overItem = dragItems[overIndex];
  if (!(activeItem?.kind === "subMilestone" && overItem)) {
    return null;
  }

  const sourceRow = rows.find((row) => row.key === activeItem.rowKey);
  const targetRow = rows.find((row) => row.key === overItem.rowKey);
  const movedSubMilestone = sourceRow?.subMilestoneDetails.find(
    (subMilestone) => subMilestone.id === activeItem.subMilestoneId
  );
  if (!(sourceRow && targetRow && movedSubMilestone)) {
    return null;
  }

  const sourceIndex = sourceRow.subMilestoneDetails.findIndex(
    (subMilestone) => subMilestone.id === activeItem.subMilestoneId
  );
  const targetIndex =
    overItem.kind === "subMilestone"
      ? targetRow.subMilestoneDetails.findIndex(
          (subMilestone) => subMilestone.id === overItem.subMilestoneId
        )
      : targetRow.subMilestoneDetails.length;
  if (sourceIndex < 0 || targetIndex < 0) {
    return null;
  }

  if (sourceRow.key === targetRow.key) {
    const clampedTargetIndex =
      overItem.kind === "group"
        ? sourceRow.subMilestoneDetails.length - 1
        : targetIndex;
    if (sourceIndex === clampedTargetIndex) {
      return null;
    }
    return rows.map((row) =>
      row.key === sourceRow.key
        ? withDerivedSubMilestoneRollups(
            withSubMilestoneDetails(
              row,
              arrayMove(
                row.subMilestoneDetails,
                sourceIndex,
                clampedTargetIndex
              )
            ),
            { includeBudget }
          )
        : row
    );
  }

  const nextSourceSubMilestones = sourceRow.subMilestoneDetails.filter(
    (subMilestone) => subMilestone.id !== movedSubMilestone.id
  );
  const nextTargetSubMilestones = [
    ...targetRow.subMilestoneDetails.slice(0, targetIndex),
    movedSubMilestone,
    ...targetRow.subMilestoneDetails.slice(targetIndex),
  ];

  return rows.map((row) => {
    if (row.key === sourceRow.key) {
      return withDerivedSubMilestoneRollups(
        withSubMilestoneDetails(row, nextSourceSubMilestones),
        { includeBudget }
      );
    }
    if (row.key === targetRow.key) {
      return withDerivedSubMilestoneRollups(
        withSubMilestoneDetails(row, nextTargetSubMilestones),
        { includeBudget }
      );
    }
    return row;
  });
}

function setupColumns({
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

function settingsColumns({
  moveRowByKey,
  updateRow,
}: {
  moveRowByKey: (rowKey: string, direction: "down" | "up") => void;
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

function tOffsetScheduleColumns(
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

function dateScheduleColumns(
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
  onCommit,
  readOnly = false,
  testId,
  type = "text",
  value,
}: {
  align?: "left" | "center" | "right";
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
      onChange={(event) => {
        if (!readOnly) {
          onChange(event.currentTarget.value);
        }
      }}
      onKeyDown={(event) => handleBlueprintInputKeyDown(event, onCommit)}
      readOnly={readOnly}
      tabIndex={readOnly ? -1 : undefined}
      type={type}
      value={value}
    />
  );
}

function handleBlueprintInputKeyDown(
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
  moveTargetRows,
  onCommitField,
  onActiveSubMilestoneChange,
  onAddSubMilestone,
  onMoveSubMilestone,
  onRemoveSubMilestone,
  onUpdateSubMilestone,
  proposedStartDate,
  row,
  scheduleDisplayMode,
}: {
  activeSubMilestoneId?: string;
  mode: WorksheetMode;
  moveTargetRows: MilestoneMoveTarget[];
  onActiveSubMilestoneChange: (subMilestoneId: string) => void;
  onAddSubMilestone: (item?: SubMilestoneBankItem) => void;
  onMoveSubMilestone: (subMilestoneId: string, targetRowKey: string) => void;
  onRemoveSubMilestone: (subMilestoneId: string) => void;
  onUpdateSubMilestone: (
    subMilestoneId: string,
    patch: Partial<TimelineMilestoneWorksheetSubMilestone>,
    meta?: TimelineMilestoneWorksheetRowsChangeMeta
  ) => void;
  onCommitField: () => void;
  proposedStartDate?: string;
  row: TimelineMilestoneWorksheetRow;
  scheduleDisplayMode: TimelineScheduleDisplayMode;
}) {
  const subMilestones = row.subMilestoneDetails;
  const activeSubMilestone =
    subMilestones.find((detail) => detail.id === activeSubMilestoneId) ??
    subMilestones[0];
  const valueLabel = mode === "settings" ? "PoC" : "Budget";
  const showDateSchedule =
    scheduleDisplayMode === "dates" && Boolean(proposedStartDate);
  const moveTargets = moveTargetRows.filter(
    (targetRow) => targetRow.key !== row.key
  );

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
              <ContextMenu key={subMilestone.id}>
                <ContextMenuTrigger
                  render={
                    <article
                      className="timeline-submilestone-card"
                      data-selected={selected ? "true" : undefined}
                      data-testid={`timeline-setup-submilestone-card-${subMilestone.id}`}
                    />
                  }
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
                        <small>
                          {showDateSchedule ? "Dates" : "T offsets"}
                        </small>
                        <strong>
                          {showDateSchedule && proposedStartDate
                            ? subMilestoneDateRangeLabel(
                                row,
                                subMilestone,
                                proposedStartDate
                              )
                            : subMilestoneTOffsetRangeLabel(row, subMilestone)}
                        </strong>
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
                </ContextMenuTrigger>
                <ContextMenuContent className="w-64">
                  <ContextMenuGroup>
                    <ContextMenuLabel className="truncate">
                      Move sub-milestone
                    </ContextMenuLabel>
                    <ContextMenuSeparator />
                    {moveTargets.length > 0 ? (
                      moveTargets.map((targetRow) => (
                        <ContextMenuItem
                          key={targetRow.key}
                          onClick={(event) => {
                            event.preventDefault();
                            onMoveSubMilestone(subMilestone.id, targetRow.key);
                          }}
                        >
                          <MoveRight aria-hidden="true" />
                          <span className="truncate">
                            Move to {targetRow.name}
                          </span>
                        </ContextMenuItem>
                      ))
                    ) : (
                      <ContextMenuItem disabled>
                        No other milestones
                      </ContextMenuItem>
                    )}
                  </ContextMenuGroup>
                </ContextMenuContent>
              </ContextMenu>
            );
          })}
        </div>
      </section>

      <section
        aria-label="Selected sub-milestone details"
        className="timeline-submilestone-detail-pane"
      >
        <SubMilestoneDetailEditor
          activeSubMilestone={activeSubMilestone}
          mode={mode}
          onAddSubMilestone={onAddSubMilestone}
          onCommitField={onCommitField}
          onRemoveSubMilestone={onRemoveSubMilestone}
          onUpdateSubMilestone={onUpdateSubMilestone}
          proposedStartDate={proposedStartDate}
          row={row}
          scheduleDisplayMode={scheduleDisplayMode}
        />
      </section>
    </div>
  );
}

function SubMilestoneDetailEditor({
  activeSubMilestone,
  mode,
  onAddSubMilestone,
  onCommitField,
  onRemoveSubMilestone,
  onUpdateSubMilestone,
  proposedStartDate,
  row,
  scheduleDisplayMode,
}: {
  activeSubMilestone?: TimelineMilestoneWorksheetSubMilestone;
  mode: WorksheetMode;
  onAddSubMilestone?: (item?: SubMilestoneBankItem) => void;
  onCommitField: () => void;
  onRemoveSubMilestone: (subMilestoneId: string) => void;
  onUpdateSubMilestone: (
    subMilestoneId: string,
    patch: Partial<TimelineMilestoneWorksheetSubMilestone>,
    meta?: TimelineMilestoneWorksheetRowsChangeMeta
  ) => void;
  proposedStartDate?: string;
  row: TimelineMilestoneWorksheetRow;
  scheduleDisplayMode: TimelineScheduleDisplayMode;
}) {
  const valueLabel = mode === "settings" ? "PoC" : "Budget";
  const valueFieldLabelId = activeSubMilestone
    ? `timeline-submilestone-value-label-${activeSubMilestone.id}`
    : undefined;
  const durationFieldLabelId = activeSubMilestone
    ? `timeline-submilestone-duration-label-${activeSubMilestone.id}`
    : undefined;
  const showDateSchedule =
    scheduleDisplayMode === "dates" && Boolean(proposedStartDate);

  if (!activeSubMilestone) {
    return (
      <div className="timeline-submilestone-empty">
        <strong>No sub-milestones</strong>
        {onAddSubMilestone ? (
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
        ) : null}
      </div>
    );
  }

  return (
    <div
      className="timeline-submilestone-detail-body"
      key={activeSubMilestone.id}
    >
      <div className="timeline-submilestone-detail-header">
        <span>Selected sub-milestone</span>
        <strong>{sanitizeSubMilestoneName(activeSubMilestone.name)}</strong>
      </div>
      <label className="timeline-submilestone-detail-field is-wide">
        <span>Name</span>
        <input
          aria-label="Sub-milestone name"
          data-testid={`timeline-setup-submilestone-name-${activeSubMilestone.id}`}
          onBlur={onCommitField}
          onChange={(event) =>
            onUpdateSubMilestone(
              activeSubMilestone.id,
              {
                name: event.currentTarget.value,
              },
              { commit: false }
            )
          }
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              onCommitField();
              event.currentTarget.blur();
            }
          }}
          value={activeSubMilestone.name}
        />
      </label>
      <label className="timeline-submilestone-detail-field is-wide">
        <span>Scope note</span>
        <textarea
          aria-label="Sub-milestone scope note"
          data-testid={`timeline-setup-submilestone-description-${activeSubMilestone.id}`}
          onBlur={onCommitField}
          onChange={(event) =>
            onUpdateSubMilestone(
              activeSubMilestone.id,
              {
                description: event.currentTarget.value,
              },
              { commit: false }
            )
          }
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              onCommitField();
              event.currentTarget.blur();
            }
          }}
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
                    },
                { commit: true }
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
                  : { budgetText: value },
                { commit: false }
              )
            }
            onCommit={onCommitField}
            testId={`timeline-setup-submilestone-budget-${activeSubMilestone.id}`}
            value={
              mode === "settings"
                ? (activeSubMilestone.percentageText ??
                  formatBps(activeSubMilestone.percentageBps ?? 0))
                : activeSubMilestone.budgetText
            }
          />
        </div>
        {showDateSchedule && proposedStartDate ? (
          <>
            <div className="timeline-submilestone-detail-field">
              <span>Start</span>
              <BlueprintInput
                align="center"
                className="timeline-submilestone-detail-input"
                label="Sub-milestone start date"
                onBlur={onCommitField}
                onChange={(startDate) =>
                  onUpdateSubMilestone(
                    activeSubMilestone.id,
                    {
                      startDay: dayOffsetFromProposalDate(
                        proposedStartDate,
                        startDate
                      ),
                    },
                    { commit: false }
                  )
                }
                onCommit={onCommitField}
                testId={`timeline-setup-submilestone-start-date-${activeSubMilestone.id}`}
                type="date"
                value={dateFromProposalDayOffset(
                  proposedStartDate,
                  subMilestoneStartDay(row, activeSubMilestone)
                )}
              />
            </div>
            <div className="timeline-submilestone-detail-field">
              <span>End</span>
              <BlueprintInput
                align="center"
                className="timeline-submilestone-detail-input"
                label="Sub-milestone end date"
                onBlur={onCommitField}
                onChange={(endDate) => {
                  const startDate = dateFromProposalDayOffset(
                    proposedStartDate,
                    subMilestoneStartDay(row, activeSubMilestone)
                  );
                  const durationDays = proposalDurationDaysFromInclusiveDates(
                    startDate,
                    endDate
                  );
                  onUpdateSubMilestone(
                    activeSubMilestone.id,
                    {
                      durationText: String(durationDays),
                    },
                    { commit: false }
                  );
                }}
                onCommit={onCommitField}
                testId={`timeline-setup-submilestone-end-date-${activeSubMilestone.id}`}
                type="date"
                value={inclusiveEndDateFromProposalSchedule(
                  proposedStartDate,
                  subMilestoneStartDay(row, activeSubMilestone),
                  parseDurationDays(activeSubMilestone.durationText)
                )}
              />
            </div>
          </>
        ) : (
          <>
            <div className="timeline-submilestone-detail-field">
              <span>Start</span>
              <BlueprintInput
                align="center"
                className="timeline-submilestone-detail-input"
                label="Sub-milestone T offset start"
                onBlur={onCommitField}
                onChange={(startText) =>
                  onUpdateSubMilestone(
                    activeSubMilestone.id,
                    {
                      startDay: parseTOffsetDay(startText),
                    },
                    { commit: false }
                  )
                }
                onCommit={onCommitField}
                testId={`timeline-setup-submilestone-start-offset-${activeSubMilestone.id}`}
                value={formatTOffset(
                  subMilestoneStartDay(row, activeSubMilestone)
                )}
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
                  onUpdateSubMilestone(
                    activeSubMilestone.id,
                    {
                      durationText: normalizeDurationText(
                        activeSubMilestone.durationText
                      ),
                    },
                    { commit: true }
                  )
                }
                onChange={(durationText) =>
                  onUpdateSubMilestone(
                    activeSubMilestone.id,
                    {
                      durationText: durationText
                        .replace(DURATION_PREFIX_REGEX, "")
                        .replace(NON_DIGIT_REGEX, ""),
                    },
                    { commit: false }
                  )
                }
                onCommit={onCommitField}
                testId={`timeline-setup-submilestone-duration-${activeSubMilestone.id}`}
                value={`T${activeSubMilestone.durationText}`}
              />
            </div>
            <div className="timeline-submilestone-detail-field">
              <span>End</span>
              <BlueprintInput
                align="center"
                className="timeline-submilestone-detail-input"
                label="Sub-milestone T offset end"
                onBlur={() => undefined}
                onChange={() => undefined}
                readOnly
                testId={`timeline-setup-submilestone-end-offset-${activeSubMilestone.id}`}
                value={formatInclusiveEndTOffset(
                  subMilestoneStartDay(row, activeSubMilestone),
                  parseDurationDays(activeSubMilestone.durationText)
                )}
              />
            </div>
          </>
        )}
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
  );
}

function SubMilestoneFocusedTabs({
  contractorOptions,
  mode,
  onAddContractorAssignment,
  onCommitField,
  onCreateCostItem,
  onDeleteCostItem,
  onRemoveContractorAssignment,
  onRemoveSubMilestone,
  onUpdateCostItem,
  onUpdateSubMilestone,
  proposedStartDate,
  row,
  scheduleDisplayMode,
  subMilestone,
}: {
  contractorOptions: TimelineMilestoneWorksheetContractorOption[];
  mode: WorksheetMode;
  onAddContractorAssignment: (
    assignment: Omit<TimelineMilestoneWorksheetContractorAssignment, "id">
  ) => void;
  onCommitField: () => void;
  onCreateCostItem: (payload: MaterialPlanningPayload) => void;
  onDeleteCostItem: (itemId: string) => void;
  onRemoveContractorAssignment: (assignmentId: string) => void;
  onRemoveSubMilestone: (subMilestoneId: string) => void;
  onUpdateCostItem: (itemId: string, payload: MaterialPlanningPayload) => void;
  onUpdateSubMilestone: (
    subMilestoneId: string,
    patch: Partial<TimelineMilestoneWorksheetSubMilestone>,
    meta?: TimelineMilestoneWorksheetRowsChangeMeta
  ) => void;
  proposedStartDate?: string;
  row: TimelineMilestoneWorksheetRow;
  scheduleDisplayMode: TimelineScheduleDisplayMode;
  subMilestone: TimelineMilestoneWorksheetSubMilestone;
}) {
  const subMilestoneName = sanitizeSubMilestoneName(subMilestone.name);

  return (
    <Tabs
      className="timeline-blueprint-expanded-tabs timeline-submilestone-focused-tabs is-sheet"
      defaultValue="scope"
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
        value="scope"
      >
        <section
          aria-label={`${subMilestoneName} scope`}
          className="timeline-submilestone-focused-pane timeline-submilestone-detail-pane"
        >
          <SubMilestoneDetailEditor
            activeSubMilestone={subMilestone}
            mode={mode}
            onCommitField={onCommitField}
            onRemoveSubMilestone={onRemoveSubMilestone}
            onUpdateSubMilestone={onUpdateSubMilestone}
            proposedStartDate={proposedStartDate}
            row={row}
            scheduleDisplayMode={scheduleDisplayMode}
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
        value="field-guidance"
      >
        <SubMilestoneFieldGuidanceEditor
          onCommitField={onCommitField}
          onUpdateSubMilestone={onUpdateSubMilestone}
          row={row}
          subMilestone={subMilestone}
        />
      </TabsPanel>
    </Tabs>
  );
}

function SubMilestoneFieldGuidanceEditor({
  onCommitField,
  onUpdateSubMilestone,
  row,
  subMilestone,
}: {
  onCommitField: () => void;
  onUpdateSubMilestone: (
    subMilestoneId: string,
    patch: Partial<TimelineMilestoneWorksheetSubMilestone>,
    meta?: TimelineMilestoneWorksheetRowsChangeMeta
  ) => void;
  row: TimelineMilestoneWorksheetRow;
  subMilestone: TimelineMilestoneWorksheetSubMilestone;
}) {
  const subMilestoneName = sanitizeSubMilestoneName(subMilestone.name);

  return (
    <section
      aria-label={`${subMilestoneName} field guidance`}
      className="timeline-blueprint-field-guidance timeline-submilestone-focused-guidance"
      data-testid={`timeline-focused-submilestone-guidance-${subMilestone.id}`}
    >
      <div className="timeline-blueprint-planning-pane-heading">
        <div>
          <Badge className="timeline-blueprint-mini-badge" variant="outline">
            Field Guidance
          </Badge>
          <strong>{subMilestoneName}</strong>
          <p>{row.name}</p>
        </div>
      </div>
      <label className="timeline-submilestone-detail-field is-wide">
        <span>Verification note</span>
        <textarea
          aria-label={`${subMilestoneName} verification note`}
          data-testid={`timeline-setup-submilestone-guidance-description-${subMilestone.id}`}
          onBlur={onCommitField}
          onChange={(event) =>
            onUpdateSubMilestone(
              subMilestone.id,
              {
                description: event.currentTarget.value,
              },
              { commit: false }
            )
          }
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              onCommitField();
              event.currentTarget.blur();
            }
          }}
          value={subMilestone.description}
        />
      </label>
    </section>
  );
}

function MilestoneExpandedTabs({
  activeSubMilestoneId,
  contractorOptions,
  moveTargetRows,
  onAddContractorAssignment,
  onActiveSubMilestoneChange,
  onAddSubMilestone,
  onCommitField,
  onCreateCostItem,
  onDeleteCostItem,
  onMoveSubMilestone,
  onRemoveContractorAssignment,
  onRemoveSubMilestone,
  onUpdateCostItem,
  onUpdateFieldGuidance,
  onUpdateSubMilestone,
  mode,
  placement = "expanded",
  proposedStartDate,
  row,
  scheduleDisplayMode,
}: {
  activeSubMilestoneId?: string;
  contractorOptions: TimelineMilestoneWorksheetContractorOption[];
  mode: WorksheetMode;
  moveTargetRows: MilestoneMoveTarget[];
  onActiveSubMilestoneChange: (subMilestoneId: string) => void;
  onAddContractorAssignment: (
    assignment: Omit<TimelineMilestoneWorksheetContractorAssignment, "id">
  ) => void;
  onAddSubMilestone: (item?: SubMilestoneBankItem) => void;
  onCommitField: () => void;
  onCreateCostItem: (payload: MaterialPlanningPayload) => void;
  onDeleteCostItem: (itemId: string) => void;
  onMoveSubMilestone: (subMilestoneId: string, targetRowKey: string) => void;
  onRemoveContractorAssignment: (assignmentId: string) => void;
  onRemoveSubMilestone: (subMilestoneId: string) => void;
  onUpdateCostItem: (itemId: string, payload: MaterialPlanningPayload) => void;
  onUpdateFieldGuidance: (guidance: SiteVisitGuidanceHtml) => void;
  onUpdateSubMilestone: (
    subMilestoneId: string,
    patch: Partial<TimelineMilestoneWorksheetSubMilestone>,
    meta?: TimelineMilestoneWorksheetRowsChangeMeta
  ) => void;
  placement?: "expanded" | "sheet";
  proposedStartDate?: string;
  row: TimelineMilestoneWorksheetRow;
  scheduleDisplayMode: TimelineScheduleDisplayMode;
}) {
  return (
    <Tabs
      className={cn(
        "timeline-blueprint-expanded-tabs",
        placement === "sheet" && "is-sheet"
      )}
      defaultValue="submilestones"
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
          onUpdateSubMilestone={onUpdateSubMilestone}
          proposedStartDate={proposedStartDate}
          row={row}
          scheduleDisplayMode={scheduleDisplayMode}
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

function MaterialCostItemsEditor({
  onCreateCostItem,
  onDeleteCostItem,
  onUpdateCostItem,
  row,
  scopeName,
  scopeSubMilestoneId,
}: {
  onCreateCostItem: (payload: MaterialPlanningPayload) => void;
  onDeleteCostItem: (itemId: string) => void;
  onUpdateCostItem: (itemId: string, payload: MaterialPlanningPayload) => void;
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
          panelLayout="stacked"
          scopeLabel={scopeName ? "Sub-milestone" : "Milestone"}
          showChangeReason={false}
          variant="embedded"
        />
      </div>
    </section>
  );
}

function ContractorAssignmentEditor({
  contractorOptions,
  onAddAssignment,
  onRemoveAssignment,
  row,
  scopeName,
  scopeSubMilestoneId,
}: {
  contractorOptions: TimelineMilestoneWorksheetContractorOption[];
  onAddAssignment: (
    assignment: Omit<TimelineMilestoneWorksheetContractorAssignment, "id">
  ) => void;
  onRemoveAssignment: (assignmentId: string) => void;
  row: TimelineMilestoneWorksheetRow;
  scopeName?: string;
  scopeSubMilestoneId?: string;
}) {
  const [contractorName, setContractorName] = useState("");
  const [contractorPickerOpen, setContractorPickerOpen] = useState(false);
  const [estimatedCostText, setEstimatedCostText] = useState("");
  const [estimatedHoursText, setEstimatedHoursText] = useState("");
  const [role, setRole] = useState("");
  const [subMilestoneIds, setSubMilestoneIds] = useState<string[]>(
    scopeSubMilestoneId ? [scopeSubMilestoneId] : []
  );
  const assignments = (row.contractorAssignments ?? []).filter((assignment) =>
    scopeSubMilestoneId
      ? assignment.subMilestoneIds.includes(scopeSubMilestoneId)
      : true
  );
  const normalizedContractorQuery = contractorName.trim().toLowerCase();
  const visibleContractorOptions = useMemo(
    () =>
      contractorOptions.filter((option) => {
        if (!normalizedContractorQuery) {
          return true;
        }
        return [option.name, option.city ?? "", ...(option.trades ?? [])].some(
          (value) =>
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

  useEffect(() => {
    if (scopeSubMilestoneId) {
      setSubMilestoneIds([scopeSubMilestoneId]);
    }
  }, [scopeSubMilestoneId]);

  const toggleSubMilestone = (subMilestoneId: string, checked: boolean) => {
    if (scopeSubMilestoneId) {
      return;
    }
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
      subMilestoneIds: scopeSubMilestoneId
        ? [scopeSubMilestoneId]
        : subMilestoneIds,
    });
    setContractorName("");
    setEstimatedCostText("");
    setEstimatedHoursText("");
    setRole("");
    setSubMilestoneIds(scopeSubMilestoneId ? [scopeSubMilestoneId] : []);
    setContractorPickerOpen(false);
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
      aria-label={`${scopeName ?? row.name} contractor assignments`}
      className="timeline-blueprint-planning-pane timeline-blueprint-planning-pane-contractors"
    >
      <div className="timeline-blueprint-planning-pane-heading">
        <div>
          <Badge className="timeline-blueprint-mini-badge" variant="outline">
            Contractors
          </Badge>
          <strong>
            {scopeName
              ? `${scopeName} crew planning`
              : "Milestone crew planning"}
          </strong>
          <p>Assign an existing contractor or type a guest contractor name.</p>
        </div>
        <span className="timeline-blueprint-planning-count">
          {assignments.length} assignment
          {assignments.length === 1 ? "" : "s"}
        </span>
      </div>

      <div className="grid gap-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="grid gap-1.5 text-sm">
            <span className="font-medium">Contractor</span>
            <div className="timeline-contractor-autocomplete">
              <Autocomplete
                autoHighlight="always"
                filter={null}
                items={visibleContractorOptions}
                itemToStringValue={(
                  option: TimelineMilestoneWorksheetContractorOption
                ) => option.name}
                keepHighlight
                modal={false}
                onOpenChange={(nextOpen) =>
                  setContractorPickerOpen(nextOpen && hasContractorOptions)
                }
                onValueChange={(nextQuery) => {
                  setContractorName(nextQuery);
                  setContractorPickerOpen(
                    hasContractorOptions && Boolean(nextQuery.trim())
                  );
                }}
                open={contractorPickerOpen && hasContractorOptions}
                openOnInputClick
                value={contractorName}
              >
                <AutocompleteInput
                  aria-label="Contractor"
                  className="timeline-blueprint-input timeline-contractor-autocomplete-input"
                  data-testid={`timeline-setup-contractor-name-${row.key}`}
                  onClick={() => setContractorPickerOpen(hasContractorOptions)}
                  onFocus={() => setContractorPickerOpen(hasContractorOptions)}
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
                    {(option: TimelineMilestoneWorksheetContractorOption) => (
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
          </div>
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
        {scopeSubMilestoneId ? (
          <div className="grid gap-2">
            <p className="font-medium text-sm">Sub-milestone scope</p>
            <div className="flex flex-wrap gap-2">
              <span className="timeline-blueprint-planning-scope-chip is-locked">
                {scopeName ?? subMilestoneNameById(row, scopeSubMilestoneId)}
              </span>
            </div>
          </div>
        ) : (
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
        )}
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
        <div className="timeline-submilestone-detail-field is-wide timeline-field-rich-text-field">
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
        </div>
        <div className="timeline-submilestone-detail-field is-wide timeline-field-rich-text-field">
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
        </div>
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

function withDerivedSubMilestoneRollups(
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

function worksheetRowToScopedMaterialMilestone(
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

function defaultGuidanceForRow(
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

function storedRowDurationDays(row: TimelineMilestoneWorksheetRow) {
  const parsed = Number(row.durationText.replace(DURATION_PREFIX_REGEX, ""));
  return Number.isFinite(parsed) ? Math.max(1, Math.round(parsed)) : Number.NaN;
}

function rowDurationDays(row: TimelineMilestoneWorksheetRow) {
  return (
    subMilestoneScheduleRange(row)?.durationDays ?? storedRowDurationDays(row)
  );
}

function storedRowStartDay(row: TimelineMilestoneWorksheetRow) {
  return Math.round(row.startDay ?? 0);
}

function rowStartDay(row: TimelineMilestoneWorksheetRow) {
  return subMilestoneScheduleRange(row)?.startDay ?? storedRowStartDay(row);
}

function parseTOffsetDay(value: string) {
  const normalized = value
    .trim()
    .replace(T_OFFSET_PREFIX_REGEX, "")
    .replace(T_OFFSET_PLUS_PREFIX_REGEX, "");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? Math.round(parsed) : 0;
}

function formatTOffset(day: number) {
  const rounded = Math.round(day);
  if (rounded > 0) {
    return `T+${rounded}`;
  }
  return `T${rounded}`;
}

function formatInclusiveEndTOffset(startDay: number, durationDays: number) {
  return formatTOffset(Math.round(startDay) + Math.max(1, durationDays) - 1);
}

function subMilestoneStartDay(
  row: TimelineMilestoneWorksheetRow,
  subMilestone: TimelineMilestoneWorksheetSubMilestone
) {
  return Math.round(subMilestone.startDay ?? storedRowStartDay(row));
}

function subMilestoneScheduleRange(row: TimelineMilestoneWorksheetRow) {
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

function subMilestoneDateRangeLabel(
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

function formatDisplayDateWithoutYear(value: string) {
  const [, month, day] = value.split("-");
  return month && day ? `${month}-${day}` : value;
}

function subMilestoneTOffsetRangeLabel(
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
