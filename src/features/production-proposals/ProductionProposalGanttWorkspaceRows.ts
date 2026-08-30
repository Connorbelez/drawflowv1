import type {
  MilestonePatch,
  SubmilestoneParentTarget,
} from "#/features/build-workspace-demo/types.ts";
import type {
  ProposalGanttMilestoneDraft,
  ProposalGanttSubmilestoneDraft,
  ProposalGanttSubmilestoneRow,
} from "./ProductionProposalGanttWorkspaceTypes.ts";
import { BASE_DATE } from "./ProductionProposalGanttWorkspaceTypes.ts";
import {
  dayFromDate,
  dollarsToCents,
  sortedMilestones,
  uniqueSubmilestoneKey,
} from "./ProductionProposalGanttWorkspaceUtils.ts";

export function proposalMilestonesToGanttSubmilestoneRows(
  milestones: ProposalGanttMilestoneDraft[]
): ProposalGanttSubmilestoneRow[] {
  return sortedMilestones(milestones).flatMap((milestone) => {
    const submilestones = submilestonesForMilestone(milestone);
    const durationHints = submilestones.map((submilestone) =>
      Math.max(1, Math.round(submilestone.durationDays ?? 1))
    );
    const hasPersistedStarts = submilestones.some(
      (submilestone) => submilestone.startDay !== undefined
    );
    const durations = hasPersistedStarts
      ? durationHints
      : fitDurationsToTotal(
          durationHints,
          Math.max(1, milestone.dayEnd - milestone.dayStart)
        );
    const budgetHints = submilestones.map((submilestone, index) =>
      Math.max(1, Math.round(submilestone.budgetCents ?? durations[index] ?? 1))
    );
    const budgets = allocateIntegerTotal(
      Math.max(0, Math.round(milestone.budgetCents)),
      budgetHints
    );
    let cursor = milestone.dayStart;
    return submilestones.map((submilestone, index) => {
      const durationDays = durations[index] ?? 1;
      const dayStart =
        submilestone.startDay === undefined
          ? cursor
          : Math.round(submilestone.startDay);
      const dayEnd = dayStart + durationDays;
      cursor = dayEnd;
      return {
        budgetCents: budgets[index] ?? 0,
        dayEnd,
        dayStart,
        durationDays,
        id: ganttSubmilestoneRowId(milestone.key, submilestone.key),
        milestoneKey: milestone.key,
        milestoneName: milestone.name,
        milestoneOrder: milestone.order,
        name: submilestone.name,
        order: submilestone.order ?? index + 1,
        submilestone,
        submilestoneKey: submilestone.key,
      };
    });
  });
}

export function applyGanttSubmilestoneMoves(
  milestones: ProposalGanttMilestoneDraft[],
  moves: Array<{ endAt: Date | null; milestoneId: string; startAt: Date }>,
  baseDate = BASE_DATE
) {
  let nextMilestones = milestones;
  const movesByParent = new Map<string, typeof moves>();
  for (const move of moves) {
    const parentKey = resolveParentMilestoneKey(
      move.milestoneId,
      nextMilestones
    );
    if (!parentKey) {
      continue;
    }
    movesByParent.set(parentKey, [
      ...(movesByParent.get(parentKey) ?? []),
      move,
    ]);
  }

  for (const [parentKey, parentMoves] of movesByParent) {
    const milestone = nextMilestones.find((item) => item.key === parentKey);
    if (!milestone) {
      continue;
    }
    const rows = proposalMilestonesToGanttSubmilestoneRows([milestone]);
    const movedRowIds = new Set(parentMoves.map((move) => move.milestoneId));
    const deltas = parentMoves.map((move) => {
      const row = rows.find((item) => item.id === move.milestoneId);
      return row ? dayFromDate(move.startAt, baseDate) - row.dayStart : 0;
    });
    const uniqueDeltas = Array.from(new Set(deltas));
    if (movedRowIds.size === rows.length && uniqueDeltas.length === 1) {
      const delta = uniqueDeltas[0] ?? 0;
      nextMilestones = nextMilestones.map((item) =>
        item.key === parentKey ? shiftMilestoneDays(item, delta) : item
      );
      continue;
    }

    let nextMilestone = milestone;
    for (const move of parentMoves) {
      nextMilestone = applySingleGanttSubmilestoneMove(
        nextMilestone,
        move,
        baseDate
      );
    }
    nextMilestones = nextMilestones.map((item) =>
      item.key === parentKey ? nextMilestone : item
    );
  }

  return nextMilestones;
}

function applySingleGanttSubmilestoneMove(
  milestone: ProposalGanttMilestoneDraft,
  move: { endAt: Date | null; milestoneId: string; startAt: Date },
  baseDate: Date
) {
  const rows = proposalMilestonesToGanttSubmilestoneRows([milestone]);
  const rowIndex = rows.findIndex((row) => row.id === move.milestoneId);
  if (rowIndex < 0) {
    return milestone;
  }
  const targetStart = dayFromDate(move.startAt, baseDate);
  const targetEnd = dayFromDate(move.endAt ?? move.startAt, baseDate);
  const targetDuration = Math.max(1, targetEnd - targetStart);
  const nextSubmilestones = submilestonesForMilestone(milestone).map(
    (submilestone, index) => ({
      ...submilestone,
      budgetCents: rows[index]?.budgetCents,
      durationDays: rows[index]?.durationDays ?? submilestone.durationDays ?? 1,
      startDay: rows[index]?.dayStart ?? submilestone.startDay,
    })
  );

  nextSubmilestones[rowIndex] = {
    ...nextSubmilestones[rowIndex]!,
    durationDays: targetDuration,
    startDay: targetStart,
  };
  return normalizeMilestoneFromSubmilestones({
    ...milestone,
    submilestones: nextSubmilestones,
  });
}

export function updateGanttSubmilestoneRow(
  milestones: ProposalGanttMilestoneDraft[],
  milestoneId: string,
  patch: MilestonePatch
) {
  const parentKey = resolveParentMilestoneKey(milestoneId, milestones);
  if (!parentKey) {
    return milestones;
  }
  return milestones.map((milestone) => {
    if (milestone.key !== parentKey) {
      return milestone;
    }
    const submilestones = submilestonesForMilestone(milestone).map(
      (submilestone) =>
        ganttSubmilestoneRowId(milestone.key, submilestone.key) === milestoneId
          ? {
              ...submilestone,
              budgetCents:
                patch.estimatedCost === undefined
                  ? submilestone.budgetCents
                  : dollarsToCents(patch.estimatedCost),
              durationDays:
                patch.estimatedDurationDays === undefined
                  ? submilestone.durationDays
                  : Math.max(1, Math.round(patch.estimatedDurationDays)),
              name: patch.name ?? submilestone.name,
            }
          : submilestone
    );
    return normalizeMilestoneFromSubmilestones({
      ...milestone,
      submilestones,
    });
  });
}

export function reorderGanttSubmilestoneRow(
  milestones: ProposalGanttMilestoneDraft[],
  sourceRowId: string,
  targetRowId: string
) {
  const sourceParentKey = resolveParentMilestoneKey(sourceRowId, milestones);
  const targetParentKey = resolveParentMilestoneKey(targetRowId, milestones);
  if (!(sourceParentKey && targetParentKey)) {
    return milestones;
  }
  if (sourceParentKey !== targetParentKey) {
    const ordered = sortedMilestones(milestones);
    const fromIndex = ordered.findIndex(
      (milestone) => milestone.key === sourceParentKey
    );
    const toIndex = ordered.findIndex(
      (milestone) => milestone.key === targetParentKey
    );
    if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) {
      return milestones;
    }
    const next = [...ordered];
    const [moved] = next.splice(fromIndex, 1);
    if (!moved) {
      return milestones;
    }
    next.splice(toIndex, 0, moved);
    return next;
  }
  return milestones.map((milestone) => {
    if (milestone.key !== sourceParentKey) {
      return milestone;
    }
    const submilestones = submilestonesForMilestone(milestone);
    const fromIndex = submilestones.findIndex(
      (submilestone) =>
        ganttSubmilestoneRowId(milestone.key, submilestone.key) === sourceRowId
    );
    const toIndex = submilestones.findIndex(
      (submilestone) =>
        ganttSubmilestoneRowId(milestone.key, submilestone.key) === targetRowId
    );
    if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) {
      return milestone;
    }
    const next = [...submilestones];
    const [moved] = next.splice(fromIndex, 1);
    if (!moved) {
      return milestone;
    }
    next.splice(toIndex, 0, moved);
    return normalizeMilestoneFromSubmilestones({
      ...milestone,
      submilestones: next.map((submilestone, index) => ({
        ...submilestone,
        order: index + 1,
      })),
    });
  });
}

export function buildGanttSubmilestoneParentTargets(
  milestones: ProposalGanttMilestoneDraft[],
  milestoneId: string
): SubmilestoneParentTarget[] {
  const rows = proposalMilestonesToGanttSubmilestoneRows(milestones);
  const sourceRow = rows.find((row) => row.id === milestoneId);
  if (!sourceRow) {
    return [];
  }
  const sourceParentRows = rows.filter(
    (row) => row.milestoneKey === sourceRow.milestoneKey
  );
  const sourceNeedsOneSubmilestone = sourceParentRows.length <= 1;

  return sortedMilestones(milestones)
    .filter((milestone) => milestone.key !== sourceRow.milestoneKey)
    .map((milestone) => ({
      disabled: sourceNeedsOneSubmilestone,
      id: milestone.key,
      label: milestone.name,
      reason: sourceNeedsOneSubmilestone
        ? "Parent needs at least one sub-milestone"
        : undefined,
    }));
}

export function moveGanttSubmilestoneToParent(
  milestones: ProposalGanttMilestoneDraft[],
  sourceRowId: string,
  targetParentKey: string
) {
  return prepareGanttSubmilestoneParentMove(
    milestones,
    sourceRowId,
    targetParentKey
  ).milestones;
}

export function prepareGanttSubmilestoneParentMove(
  milestones: ProposalGanttMilestoneDraft[],
  sourceRowId: string,
  targetParentKey: string
): { milestones: ProposalGanttMilestoneDraft[]; movedRowId?: string } {
  const rows = proposalMilestonesToGanttSubmilestoneRows(milestones);
  const sourceRow = rows.find((row) => row.id === sourceRowId);
  const targetMilestone = milestones.find(
    (milestone) => milestone.key === targetParentKey
  );
  if (!(sourceRow && targetMilestone)) {
    return { milestones };
  }
  if (sourceRow.milestoneKey === targetParentKey) {
    return { milestones, movedRowId: sourceRowId };
  }
  const sourceRows = rows.filter(
    (row) => row.milestoneKey === sourceRow.milestoneKey
  );
  if (sourceRows.length <= 1) {
    return { milestones, movedRowId: sourceRowId };
  }
  const targetRows = rows.filter((row) => row.milestoneKey === targetParentKey);
  const movedSubmilestoneKey = uniqueSubmilestoneKey(
    sourceRow.submilestoneKey,
    new Set(targetRows.map((row) => row.submilestoneKey))
  );
  const movedSubmilestone = materializeGanttSubmilestoneRow(
    sourceRow,
    movedSubmilestoneKey
  );
  const movedRowId = ganttSubmilestoneRowId(
    targetParentKey,
    movedSubmilestoneKey
  );

  return {
    milestones: milestones.map((milestone) => {
      if (milestone.key === sourceRow.milestoneKey) {
        return normalizeMilestoneFromSubmilestones(
          {
            ...milestone,
            submilestones: sourceRows
              .filter((row) => row.id !== sourceRowId)
              .map((row, index) => ({
                ...materializeGanttSubmilestoneRow(row),
                order: index + 1,
              })),
          },
          { fitToSubmilestoneBounds: true }
        );
      }
      if (milestone.key === targetParentKey) {
        return normalizeMilestoneFromSubmilestones(
          {
            ...milestone,
            submilestones: [
              ...targetRows.map((row, index) => ({
                ...materializeGanttSubmilestoneRow(row),
                order: index + 1,
              })),
              {
                ...movedSubmilestone,
                order: targetRows.length + 1,
              },
            ],
          },
          { fitToSubmilestoneBounds: true }
        );
      }
      return milestone;
    }),
    movedRowId,
  };
}

function materializeGanttSubmilestoneRow(
  row: ProposalGanttSubmilestoneRow,
  key = row.submilestoneKey
): ProposalGanttSubmilestoneDraft {
  return {
    ...row.submilestone,
    budgetCents: row.budgetCents,
    durationDays: row.durationDays,
    key,
    startDay: row.dayStart,
  };
}

function normalizeMilestoneFromSubmilestones(
  milestone: ProposalGanttMilestoneDraft,
  options: { fitToSubmilestoneBounds?: boolean } = {}
) {
  const submilestones = submilestonesForMilestone(milestone).map(
    (submilestone, index) => ({
      ...submilestone,
      durationDays: Math.max(1, Math.round(submilestone.durationDays ?? 1)),
      order: index + 1,
    })
  );
  const budgetCents = submilestones.reduce(
    (total, submilestone) =>
      total + Math.max(0, Math.round(submilestone.budgetCents ?? 0)),
    0
  );
  let cursor = milestone.dayStart;
  let largestSubmilestoneEnd = milestone.dayStart;
  let earliestSubmilestoneStart = Number.POSITIVE_INFINITY;
  const scheduledSubmilestones = submilestones.map((submilestone) => {
    const startDay =
      submilestone.startDay === undefined
        ? cursor
        : Math.max(0, Math.round(submilestone.startDay));
    const durationDays = Math.max(
      1,
      Math.round(submilestone.durationDays ?? 1)
    );
    const endDay = startDay + durationDays;
    cursor = endDay;
    largestSubmilestoneEnd = Math.max(largestSubmilestoneEnd, endDay);
    earliestSubmilestoneStart = Math.min(earliestSubmilestoneStart, startDay);
    return {
      ...submilestone,
      durationDays,
      startDay,
    };
  });
  const dayStart =
    options.fitToSubmilestoneBounds &&
    Number.isFinite(earliestSubmilestoneStart)
      ? earliestSubmilestoneStart
      : milestone.dayStart;
  const durationDays = options.fitToSubmilestoneBounds
    ? Math.max(1, largestSubmilestoneEnd - dayStart)
    : Math.max(
        Math.max(1, Math.round(milestone.durationDays)),
        largestSubmilestoneEnd - milestone.dayStart
      );
  return {
    ...milestone,
    budgetCents: budgetCents || milestone.budgetCents,
    dayEnd: dayStart + durationDays,
    dayStart,
    durationDays,
    submilestones: scheduledSubmilestones,
  };
}

function shiftMilestoneDays(
  milestone: ProposalGanttMilestoneDraft,
  deltaDays: number
) {
  const nextDayStart = Math.max(0, milestone.dayStart + deltaDays);
  const durationDays = Math.max(1, milestone.dayEnd - milestone.dayStart);
  return {
    ...milestone,
    dayEnd: nextDayStart + durationDays,
    dayStart: nextDayStart,
    durationDays,
    submilestones: milestone.submilestones.map((submilestone) => ({
      ...submilestone,
      ...(submilestone.startDay === undefined
        ? {}
        : { startDay: Math.max(0, submilestone.startDay + deltaDays) }),
    })),
  };
}

export function submilestonesForMilestone(
  milestone: ProposalGanttMilestoneDraft
): ProposalGanttSubmilestoneDraft[] {
  const rows = milestone.submilestones.length
    ? milestone.submilestones
    : [
        {
          budgetCents: milestone.budgetCents,
          durationDays: milestone.durationDays,
          key: `${milestone.key}-scope`,
          name: milestone.name,
          order: 1,
          startDay: milestone.dayStart,
        },
      ];
  return [...rows].sort(
    (left, right) =>
      left.order - right.order || left.key.localeCompare(right.key)
  );
}

export function resolveParentMilestoneKey(
  ganttMilestoneId: string,
  milestones: ProposalGanttMilestoneDraft[]
) {
  if (milestones.some((milestone) => milestone.key === ganttMilestoneId)) {
    return ganttMilestoneId;
  }
  const [parentKey] = ganttMilestoneId.split("::");
  return parentKey &&
    milestones.some((milestone) => milestone.key === parentKey)
    ? parentKey
    : undefined;
}

export function firstSubmilestoneRowId(
  milestoneKey: string,
  milestones: ProposalGanttMilestoneDraft[]
) {
  return proposalMilestonesToGanttSubmilestoneRows(milestones).find(
    (row) => row.milestoneKey === milestoneKey
  )?.id;
}

export function lastSubmilestoneRowId(
  milestoneKey: string,
  milestones: ProposalGanttMilestoneDraft[]
) {
  return proposalMilestonesToGanttSubmilestoneRows(milestones)
    .filter((row) => row.milestoneKey === milestoneKey)
    .at(-1)?.id;
}

export function ganttSubmilestoneRowId(
  milestoneKey: string,
  submilestoneKey: string
) {
  return `${milestoneKey}::${submilestoneKey}`;
}

function allocateIntegerTotal(total: number, weights: number[]) {
  if (weights.length === 0) {
    return [];
  }
  const normalizedTotal = Math.max(0, Math.round(total));
  if (normalizedTotal === 0) {
    return weights.map(() => 0);
  }
  const normalizedWeights = weights.map((weight) =>
    Math.max(1, Math.round(weight))
  );
  const weightTotal = normalizedWeights.reduce(
    (sum, weight) => sum + weight,
    0
  );
  const floors = normalizedWeights.map((weight) =>
    Math.floor((normalizedTotal * weight) / weightTotal)
  );
  let remainder =
    normalizedTotal - floors.reduce((sum, value) => sum + value, 0);
  const ranked = normalizedWeights
    .map((weight, index) => ({
      index,
      remainder: (normalizedTotal * weight) / weightTotal - floors[index]!,
    }))
    .sort(
      (left, right) =>
        right.remainder - left.remainder || left.index - right.index
    );
  for (const row of ranked) {
    if (remainder <= 0) {
      break;
    }
    floors[row.index] = (floors[row.index] ?? 0) + 1;
    remainder -= 1;
  }
  return floors;
}

function fitDurationsToTotal(durations: number[], total: number) {
  if (durations.length === 0) {
    return [];
  }
  const target = Math.max(durations.length, Math.round(total));
  return allocateIntegerTotal(target, durations).map((duration) =>
    Math.max(1, duration)
  );
}
