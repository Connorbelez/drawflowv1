import { arrayMove } from "@dnd-kit/sortable";
import {
  withDerivedSubMilestoneRollups,
  withSubMilestoneDetails,
  type TimelineMilestoneWorksheetRow,
  type TimelineSummaryDragItem,
} from "./TimelineMilestoneWorksheetContracts.tsx";

export function timelineSummaryDragItems(
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

export function summaryGroupItemId(rowKey: string) {
  return `summary-group:${rowKey}`;
}

export function summarySubMilestoneItemId(subMilestoneId: string) {
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
  if (
    sourceRow.key !== targetRow.key &&
    sourceRow.subMilestoneDetails.length <= 1
  ) {
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
