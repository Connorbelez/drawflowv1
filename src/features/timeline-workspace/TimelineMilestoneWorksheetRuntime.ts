import { arrayMove } from "@dnd-kit/sortable";
import {
  getCoreRowModel,
  getExpandedRowModel,
  useReactTable,
  type ColumnDef,
  type ExpandedState,
} from "@tanstack/react-table";
import {
  useCallback,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import { parseCurrencyToCents } from "#/features/builder-proposal-demo/template-helpers.ts";
import type { MaterialPlanningPayload } from "#/features/material-planning/MaterialPlanningTab.tsx";
import {
  DEFAULT_NEW_SUB_MILESTONE_BUDGET_TEXT,
  DEFAULT_NEW_SUB_MILESTONE_DURATION_TEXT,
  cascadeBudgetEdit,
  cascadeSubMilestoneBudgetEdit,
  createCustomMilestoneRow,
  formatBps,
  makeWorksheetId,
  materialPayloadToWorksheetCostItem,
  normalizeCurrencyText,
  parseDurationDays,
  rebalanceWorksheetCompletionPercentages,
  rowBudgetCents,
  rowDurationDays,
  rowStartDay,
  sanitizeSubMilestoneName,
  subMilestoneStartDay,
  withDerivedSubMilestoneRollups,
  withSubMilestoneDetails,
  worksheetCostItemsToMaterialItems,
  type SubMilestoneBankItem,
  type SubMilestoneEditorResetVersions,
  type TimelineDetailTab,
  type TimelineDetailsSheetTarget,
  type TimelineMilestoneWorksheetContractorAssignment,
  type TimelineMilestoneWorksheetRow,
  type TimelineMilestoneWorksheetRowsChangeMeta,
  type TimelineMilestoneWorksheetSubMilestone,
  type TimelineWorksheetView,
  type PendingUnsavedNavigation,
} from "./TimelineMilestoneWorksheetContracts.tsx";
import { settingsColumns, setupColumns } from "./TimelineMilestoneWorksheetColumns.tsx";
import {
  milestoneSummaryWindow,
  subMilestoneSummaryWindow,
  summaryValueText,
} from "./TimelineMilestoneWorksheetSummaryCells.tsx";
import { moveSubMilestoneWithinSummaryRows } from "./TimelineMilestoneWorksheetSummaryDrag.ts";
import { renderMilestoneDetailTabs as renderDetailTabs } from "./TimelineMilestoneWorksheetDetailRenderer.tsx";
import type { TimelineMilestoneWorksheetProps } from "./TimelineMilestoneWorksheetContracts.tsx";
import type { TimelineMilestoneWorksheetViewProps } from "./TimelineMilestoneWorksheetView.tsx";

export function useTimelineMilestoneWorksheetRuntime({
  cascadeBudgetEdits = false,
  cashText,
  className,
  contractorActions,
  contractorOptions = [],
  error,
  footerExtra,
  initialWorksheetView,
  leadingContent,
  materialPlanningActions,
  mode,
  onBack,
  onCascadeBudgetEditsChange,
  onComplete,
  onReset,
  onRowsChange,
  onScheduleDisplayModeChange,
  planningFocusScopeKey,
  projectAddress,
  proposalSubmittedAt,
  proposedStartDate,
  rows,
  scheduleDisplayMode = proposedStartDate ? "dates" : "tOffsets",
  scopeRoute,
  scopeWorkosOrganizationId,
  showHeading = false,
  targetBudgetCents,
  templateTitle,
  viewerCapacity,
}: TimelineMilestoneWorksheetProps): TimelineMilestoneWorksheetViewProps {
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
  const [pendingMilestoneDeleteKey, setPendingMilestoneDeleteKey] = useState<
    string | null
  >(null);
  const [pendingMilestoneDeleteSource, setPendingMilestoneDeleteSource] =
    useState<"finalSubMilestone" | "milestone">("milestone");
  const [dirtySubMilestoneEditorKeys, setDirtySubMilestoneEditorKeys] =
    useState<Set<string>>(() => new Set());
  const [subMilestoneEditorResetVersions, setSubMilestoneEditorResetVersions] =
    useState<SubMilestoneEditorResetVersions>({});
  const [pendingUnsavedNavigation, setPendingUnsavedNavigation] =
    useState<PendingUnsavedNavigation | null>(null);
  const [cascadeBudgetError, setCascadeBudgetError] = useState("");
  // Active tab inside the detail sheet. Seeded from `detailsSheetTarget.tab`
  // when the sheet opens (e.g. from a status-chip click), then owned by the
  // user once they start switching tabs.
  const [detailsSheetTab, setDetailsSheetTab] = useState<
    TimelineDetailTab | undefined
  >(detailsSheetTarget?.tab);
  const keyboardInstructionsId = useId();
  const rowsRef = useRef(rows);
  const onRowsChangeRef = useRef(onRowsChange);
  const cascadeBudgetStartRowsRef = useRef(
    new Map<string, TimelineMilestoneWorksheetRow[]>()
  );
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
      const editKey = `milestone:${rowKey}`;
      const isCascadeBudgetEdit =
        cascadeBudgetEdits &&
        mode === "setup" &&
        typeof patch.budgetText === "string";
      if (
        isCascadeBudgetEdit &&
        meta?.commit === false &&
        !cascadeBudgetStartRowsRef.current.has(editKey)
      ) {
        cascadeBudgetStartRowsRef.current.set(editKey, rowsRef.current);
        setCascadeBudgetError("");
      }
      if (!cascadeBudgetEdits && typeof patch.budgetText === "string") {
        cascadeBudgetStartRowsRef.current.delete(editKey);
        setCascadeBudgetError("");
      }
      updateRows(
        rowsRef.current.map((row) =>
          row.key === rowKey ? { ...row, ...patch } : row
        ),
        meta
      );
    },
    [cascadeBudgetEdits, mode, updateRows]
  );

  const updateSubMilestone = (
    rowKey: string,
    subMilestoneId: string,
    patch: Partial<TimelineMilestoneWorksheetSubMilestone>,
    meta?: TimelineMilestoneWorksheetRowsChangeMeta
  ) => {
    const editKey = `subMilestone:${rowKey}:${subMilestoneId}`;
    const isCascadeBudgetEdit =
      cascadeBudgetEdits &&
      mode === "setup" &&
      typeof patch.budgetText === "string";

    if (
      isCascadeBudgetEdit &&
      meta?.commit === false &&
      !cascadeBudgetStartRowsRef.current.has(editKey)
    ) {
      cascadeBudgetStartRowsRef.current.set(editKey, rowsRef.current);
      setCascadeBudgetError("");
    }

    if (isCascadeBudgetEdit && meta?.commit !== false) {
      const startRows =
        cascadeBudgetStartRowsRef.current.get(editKey) ?? rowsRef.current;
      cascadeBudgetStartRowsRef.current.delete(editKey);
      const result = cascadeSubMilestoneBudgetEdit({
        nextBudgetCents: parseCurrencyToCents(patch.budgetText ?? ""),
        rowKey,
        rows: startRows,
        subMilestoneId,
        targetBudgetCents: targetBudgetCents ?? Number.NaN,
      });
      setActiveSubMilestoneByRow((current) => ({
        ...current,
        [rowKey]: subMilestoneId,
      }));
      if (result.status === "rejected") {
        setCascadeBudgetError(result.message);
        return updateRows(startRows, { commit: false });
      }
      setCascadeBudgetError("");
      return updateRows(result.rows, meta);
    }

    if (!cascadeBudgetEdits && typeof patch.budgetText === "string") {
      cascadeBudgetStartRowsRef.current.delete(editKey);
      setCascadeBudgetError("");
    }

    const result = updateRows(
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
    return result;
  };
  const commitRows = useCallback(() => {
    updateRows(rowsRef.current, { commit: true });
  }, [updateRows]);

  const handleCascadeBudgetEditsChange = useCallback(
    (enabled: boolean) => {
      cascadeBudgetStartRowsRef.current.clear();
      setCascadeBudgetError("");
      onCascadeBudgetEditsChange?.(enabled);
    },
    [onCascadeBudgetEditsChange]
  );

  const addSubMilestone = (rowKey: string, item?: SubMilestoneBankItem) => {
    const currentRows = rowsRef.current;
    const row = currentRows.find((candidate) => candidate.key === rowKey);
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
      percentageBps:
        row.subMilestoneDetails.length === 0 ? row.percentageBps : 0,
      percentageText:
        row.subMilestoneDetails.length === 0
          ? formatBps(row.percentageBps)
          : "0.00%",
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

    const nextRows = currentRows.map((candidate) => {
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
    });
    updateRows(
      mode === "settings"
        ? rebalanceWorksheetCompletionPercentages(nextRows)
        : nextRows
    );
    setActiveSubMilestoneByRow((current) => ({
      ...current,
      [rowKey]: nextSubMilestone.id,
    }));
  };

  const removeSubMilestone = (rowKey: string, subMilestoneId: string) => {
    const currentRows = rowsRef.current;
    const targetRow = currentRows.find((row) => row.key === rowKey);
    if (!targetRow) {
      return;
    }
    if (targetRow.subMilestoneDetails.length === 1) {
      setPendingMilestoneDeleteSource("finalSubMilestone");
      setPendingMilestoneDeleteKey(rowKey);
      return;
    }
    let nextActiveSubMilestoneId = "";

    const nextRows = currentRows.map((row) => {
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
    });
    updateRows(
      mode === "settings"
        ? rebalanceWorksheetCompletionPercentages(nextRows)
        : nextRows
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
    if (sourceRow.subMilestoneDetails.length <= 1) {
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

    const nextRows = currentRows.map((row) => {
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
    });
    updateRows(
      mode === "settings"
        ? rebalanceWorksheetCompletionPercentages(nextRows)
        : nextRows
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
        updateRows(
          mode === "settings"
            ? rebalanceWorksheetCompletionPercentages(nextRows)
            : nextRows
        );
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
    if (materialPlanningActions?.create) {
      return materialPlanningActions.create(payload);
    }
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
    return;
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
    const existingItem = worksheetCostItemsToMaterialItems(row).find(
      (candidate) => candidate._id === itemId
    );
    if (materialPlanningActions?.update && existingItem) {
      return materialPlanningActions.update(existingItem, payload);
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
    return;
  };

  const deleteCostItem = (rowKey: string, itemId: string) => {
    const row = rows.find((candidate) => candidate.key === rowKey);
    if (!row) {
      return;
    }
    const existingItem = worksheetCostItemsToMaterialItems(row).find(
      (candidate) => candidate._id === itemId
    );
    if (materialPlanningActions?.delete && existingItem) {
      return materialPlanningActions.delete(existingItem);
    }
    updateRow(rowKey, {
      costItems: (row.costItems ?? []).filter((item) => item.id !== itemId),
    });
    return;
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

    const nextRows = [...rowsRef.current, nextRow];
    updateRows(
      mode === "settings"
        ? rebalanceWorksheetCompletionPercentages(nextRows)
        : nextRows
    );
    setExpanded((current) =>
      current === true ? true : { ...current, [nextRow.key]: true }
    );
    setActiveSubMilestoneByRow((current) => ({
      ...current,
      [nextRow.key]: nextRow.subMilestoneDetails[0]?.id ?? "",
    }));
    setCustomMilestoneName("");
  };

  const setMilestoneIncluded = useCallback(
    (rowKey: string, included: boolean) => {
      const currentRows = rowsRef.current;
      const row = currentRows.find((candidate) => candidate.key === rowKey);
      if (!row || row.excluded === !included) {
        return;
      }
      if (
        !included &&
        currentRows.filter((candidate) => !candidate.excluded).length <= 1
      ) {
        return;
      }

      updateRows(
        rebalanceWorksheetCompletionPercentages(
          currentRows.map((candidate) =>
            candidate.key === rowKey
              ? { ...candidate, excluded: !included }
              : candidate
          )
        )
      );
    },
    [updateRows]
  );

  const deleteMilestone = useCallback(
    (rowKey: string) => {
      const currentRows = rowsRef.current;
      const row = currentRows.find((candidate) => candidate.key === rowKey);
      if (!row) {
        return;
      }
      if (
        !row.excluded &&
        currentRows.filter((candidate) => !candidate.excluded).length <= 1
      ) {
        return;
      }

      const nextRows = currentRows
        .filter((candidate) => candidate.key !== rowKey)
        .map((candidate) => ({
          ...candidate,
          dependencyKeys: candidate.dependencyKeys.filter(
            (dependencyKey) => dependencyKey !== rowKey
          ),
        }));
      updateRows(
        mode === "settings" && !row.excluded
          ? rebalanceWorksheetCompletionPercentages(nextRows)
          : nextRows
      );
      setPendingMilestoneDeleteKey(null);
      setPendingMilestoneDeleteSource("milestone");
      setDetailsSheetTarget((current) =>
        current?.rowKey === rowKey ? null : current
      );
      setExpanded((current) => {
        if (current === true) {
          return current;
        }
        const { [rowKey]: _removed, ...remaining } = current;
        return remaining;
      });
      setActiveSubMilestoneByRow((current) => {
        const { [rowKey]: _removed, ...remaining } = current;
        return remaining;
      });
      setDirtySubMilestoneEditorKeys(
        (current) =>
          new Set(
            [...current].filter(
              (editorKey) => !editorKey.startsWith(`${rowKey}:`)
            )
          )
      );
      setSubMilestoneEditorResetVersions((current) =>
        Object.fromEntries(
          Object.entries(current).filter(
            ([editorKey]) => !editorKey.startsWith(`${rowKey}:`)
          )
        )
      );
      for (const editKey of cascadeBudgetStartRowsRef.current.keys()) {
        if (
          editKey === `milestone:${rowKey}` ||
          editKey.startsWith(`subMilestone:${rowKey}:`)
        ) {
          cascadeBudgetStartRowsRef.current.delete(editKey);
        }
      }
      setPendingUnsavedNavigation(null);
    },
    [mode, updateRows]
  );

  const requestMilestoneDelete = useCallback((rowKey: string) => {
    setPendingMilestoneDeleteSource("milestone");
    setPendingMilestoneDeleteKey(rowKey);
  }, []);

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
        !row.excluded
      ) {
        const editKey = `milestone:${rowKey}`;
        const startRows =
          cascadeBudgetStartRowsRef.current.get(editKey) ?? currentRows;
        cascadeBudgetStartRowsRef.current.delete(editKey);
        const result = cascadeBudgetEdit({
          nextBudgetCents,
          rowKey,
          rows: startRows,
          targetBudgetCents: targetBudgetCents ?? Number.NaN,
        });
        if (result.status === "rejected") {
          setCascadeBudgetError(result.message);
          updateRows(startRows, { commit: false });
          return;
        }
        setCascadeBudgetError("");
        updateRows(result.rows);
        return;
      }

      cascadeBudgetStartRowsRef.current.delete(`milestone:${rowKey}`);
      setCascadeBudgetError("");
      updateRow(rowKey, {
        budgetText: normalizeCurrencyText(row.budgetText),
      });
    },
    [cascadeBudgetEdits, targetBudgetCents, updateRow, updateRows]
  );

  const includedRowCount = rows.filter((row) => !row.excluded).length;
  const columns = useMemo<ColumnDef<TimelineMilestoneWorksheetRow>[]>(
    () =>
      mode === "settings"
        ? settingsColumns({
            includedRowCount,
            moveRowByKey,
            onIncludedChange: setMilestoneIncluded,
            updateRow,
          })
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
      includedRowCount,
      mode,
      moveRowByKey,
      proposedStartDate,
      scheduleDisplayMode,
      setMilestoneIncluded,
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
  const detailsSheetDefaultTab: TimelineDetailTab =
    detailsSheetTarget?.kind === "subMilestone" ? "scope" : "submilestones";
  const detailsSheetAvailableTabs = useMemo<TimelineDetailTab[]>(
    () =>
      mode === "setup"
        ? detailsSheetTarget?.kind === "subMilestone"
          ? ["scope", "contractors", "materials", "field-guidance"]
          : ["submilestones", "contractors", "materials", "field-guidance"]
        : detailsSheetTarget?.kind === "subMilestone"
          ? ["scope", "field-guidance"]
          : ["submilestones", "field-guidance"],
    [detailsSheetTarget?.kind, mode]
  );
  // Guard the requested tab against the current mode's available tabs so the
  // sheet still opens cleanly (e.g. a "contractors" tab request in settings
  // mode falls back to the default tab).
  const detailsSheetActiveTab: TimelineDetailTab =
    detailsSheetTab && detailsSheetAvailableTabs.includes(detailsSheetTab)
      ? detailsSheetTab
      : detailsSheetDefaultTab;
  const handleDetailsSheetTabChange = useCallback(
    (nextTab: TimelineDetailTab) => {
      setDetailsSheetTab(nextTab);
    },
    []
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
  const markSubMilestoneEditorDirty = useCallback(
    (
      rowKey: string,
      subMilestoneId: string,
      group: "fieldGuidance" | "scope",
      dirty: boolean
    ) => {
      const editorKey = `${rowKey}:${subMilestoneId}:${group}`;
      setDirtySubMilestoneEditorKeys((current) => {
        if (current.has(editorKey) === dirty) {
          return current;
        }
        const next = new Set(current);
        if (dirty) {
          next.add(editorKey);
        } else {
          next.delete(editorKey);
        }
        return next;
      });
    },
    []
  );
  const reportSubMilestoneEditorDirty = useCallback(
    (
      rowKey: string,
      subMilestoneId: string,
      group: "fieldGuidance" | "scope",
      dirty: boolean
    ) => {
      markSubMilestoneEditorDirty(rowKey, subMilestoneId, group, dirty);
    },
    [markSubMilestoneEditorDirty]
  );
  const requestUnsavedNavigation = useCallback(
    (action: () => void, dirtyKeys = dirtySubMilestoneEditorKeys) => {
      if (dirtyKeys.size === 0) {
        action();
        return;
      }
      setPendingUnsavedNavigation({ action, dirtyKeys: new Set(dirtyKeys) });
    },
    [dirtySubMilestoneEditorKeys]
  );
  const resolveActiveSubMilestoneId = useCallback(
    (rowKey: string) => {
      const row = rowsRef.current.find((candidate) => candidate.key === rowKey);
      return activeSubMilestoneByRow[rowKey] ?? row?.subMilestoneDetails[0]?.id;
    },
    [activeSubMilestoneByRow]
  );
  const handleWorksheetViewChange = useCallback(
    (value: string) => {
      if (value !== "editor" && value !== "table") {
        return;
      }
      requestUnsavedNavigation(() => setWorksheetView(value));
    },
    [requestUnsavedNavigation]
  );
  const changeActiveSubMilestone = useCallback(
    (rowKey: string, subMilestoneId: string) => {
      const previousSubMilestoneId = resolveActiveSubMilestoneId(rowKey);
      if (
        !previousSubMilestoneId ||
        previousSubMilestoneId === subMilestoneId
      ) {
        setActiveSubMilestoneByRow((current) => ({
          ...current,
          [rowKey]: subMilestoneId,
        }));
        return;
      }

      const previousKeyPrefix = `${rowKey}:${previousSubMilestoneId}:`;
      const previousDirtyKeys = new Set(
        [...dirtySubMilestoneEditorKeys].filter(
          (editorKey) =>
            editorKey === `${previousKeyPrefix}scope` ||
            editorKey === `${previousKeyPrefix}fieldGuidance`
        )
      );
      requestUnsavedNavigation(
        () =>
          setActiveSubMilestoneByRow((current) => ({
            ...current,
            [rowKey]: subMilestoneId,
          })),
        previousDirtyKeys
      );
    },
    [
      activeSubMilestoneByRow,
      dirtySubMilestoneEditorKeys,
      resolveActiveSubMilestoneId,
      requestUnsavedNavigation,
    ]
  );
  const openDetailsSheet = useCallback(
    (rowKey: string, subMilestoneId?: string, tab?: TimelineDetailTab) => {
      setDetailsSheetTab(tab);
      if (!subMilestoneId) {
        setDetailsSheetTarget({ kind: "milestone", rowKey, tab });
        return;
      }

      const openSubMilestoneSheet = () => {
        setActiveSubMilestoneByRow((current) => ({
          ...current,
          [rowKey]: subMilestoneId,
        }));
        setDetailsSheetTarget({
          kind: "subMilestone",
          rowKey,
          subMilestoneId,
          tab,
        });
      };
      const previousSubMilestoneId = resolveActiveSubMilestoneId(rowKey);
      if (
        !previousSubMilestoneId ||
        previousSubMilestoneId === subMilestoneId
      ) {
        openSubMilestoneSheet();
        return;
      }

      const previousKeyPrefix = `${rowKey}:${previousSubMilestoneId}:`;
      const previousDirtyKeys = new Set(
        [...dirtySubMilestoneEditorKeys].filter(
          (editorKey) =>
            editorKey === `${previousKeyPrefix}scope` ||
            editorKey === `${previousKeyPrefix}fieldGuidance`
        )
      );
      requestUnsavedNavigation(openSubMilestoneSheet, previousDirtyKeys);
    },
    [
      activeSubMilestoneByRow,
      dirtySubMilestoneEditorKeys,
      resolveActiveSubMilestoneId,
      requestUnsavedNavigation,
    ]
  );
  const closeDetailsSheet = useCallback(() => {
    const target = detailsSheetTarget;
    const dirtyKeys = new Set(
      [...dirtySubMilestoneEditorKeys].filter((editorKey) => {
        if (!target) {
          return false;
        }
        const rowPrefix = `${target.rowKey}:`;
        if (!editorKey.startsWith(rowPrefix)) {
          return false;
        }
        if (target.kind === "milestone") {
          return true;
        }
        return editorKey.startsWith(`${rowPrefix}${target.subMilestoneId}:`);
      })
    );
    requestUnsavedNavigation(() => setDetailsSheetTarget(null), dirtyKeys);
  }, [
    detailsSheetTarget,
    dirtySubMilestoneEditorKeys,
    requestUnsavedNavigation,
  ]);
  const pendingMilestoneDeleteRow =
    rows.find((row) => row.key === pendingMilestoneDeleteKey) ?? null;
  const canDeleteMilestone = (row: TimelineMilestoneWorksheetRow) =>
    row.excluded || includedRows.length > 1;
  const pendingMilestoneDeleteCanDelete = pendingMilestoneDeleteRow
    ? canDeleteMilestone(pendingMilestoneDeleteRow)
    : false;

  const renderMilestoneDetailTabs = (
    row: TimelineMilestoneWorksheetRow,
    placement: "expanded" | "sheet" = "expanded"
  ) =>
    renderDetailTabs({
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
      setPendingMilestoneDeleteKey: requestMilestoneDelete,
      subMilestoneEditorResetVersions,
      updateCostItem,
      updateRow,
      updateSubMilestone,
      viewerCapacity,
      placement,
      resolveActiveSubMilestoneId,
    });
  return {
    addContractorAssignment, addCustomMilestone, addSubMilestone,
    cascadeBudgetEdits, cashText, className, closeDetailsSheet,
    commitBudgetEdit, commitRows, contractorActions, contractorOptions,
    createCostItem, customMilestoneName, deleteCostItem, deleteMilestone,
    detailsSheetActiveTab, detailsSheetDescription, detailsSheetOpen,
    detailsSheetRow, detailsSheetSubMilestone, detailsSheetTarget,
    detailsSheetTestId, detailsSheetTitle,
    error: cascadeBudgetError || error, footerExtra,
    handleDetailsSheetTabChange, handleWorksheetViewChange,
    includedBudgetCents, includedRows, keyboardInstructionsId, leadingContent,
    mode, moveSummarySubMilestone, onBack,
    onCascadeBudgetEditsChange: handleCascadeBudgetEditsChange,
    onComplete, onReset, onScheduleDisplayModeChange, openDetailsSheet,
    planningFocusScopeKey, projectAddress, proposedStartDate,
    proposalSubmittedAt, pendingMilestoneDeleteRow,
    pendingMilestoneDeleteCanDelete, pendingMilestoneDeleteSource,
    pendingUnsavedNavigation,
    reportSubMilestoneEditorDirty, removeContractorAssignment,
    removeSubMilestone, renderMilestoneDetailTabs, reorderRows,
    requestMilestoneDelete,
    requestUnsavedNavigation, rows, scheduleDisplayMode, scopeRoute,
    scopeWorkosOrganizationId, setCustomMilestoneName,
    setDirtySubMilestoneEditorKeys, setPendingMilestoneDeleteKey,
    setPendingUnsavedNavigation, setSubMilestoneEditorResetVersions,
    showHeading, showSetupActions, subMilestoneEditorResetVersions, table,
    templateTitle, totalDuration, totalPocBps, updateCostItem, updateRow,
    updateSubMilestone, viewerCapacity, worksheetView,
  };
}
