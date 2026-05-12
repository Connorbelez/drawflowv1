export interface AllocationInput {
  percentageBps: number;
}

export interface ExposureMilestone {
  budgetCents: number;
  included: boolean;
}

export interface CashAwareDrawGroup<T extends ExposureMilestone> {
  endDay?: number;
  endRow: number;
  index: number;
  isOverCashLimit: boolean;
  milestones: T[];
  startDay?: number;
  startRow: number;
  totalBudgetCents: number;
}

export function allocateBudgetCents(
  totalCents: number,
  rows: AllocationInput[]
) {
  const roundedTotal = Math.round(totalCents);
  const allocations = rows.map((row, order) => {
    const raw = roundedTotal * row.percentageBps;
    return {
      cents: Math.floor(raw / 10_000),
      order,
      remainder: raw % 10_000,
    };
  });
  let remainderCents =
    roundedTotal -
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

export function parseCurrencyToCents(input: string) {
  const normalized = input.replace(/[$,\s]/g, "");
  if (!normalized) {
    return 0;
  }
  const value = Number(normalized);
  if (!Number.isFinite(value)) {
    return Number.NaN;
  }
  return Math.round(value * 100);
}

export function formatCurrency(
  cents?: number,
  options: { compact?: boolean } = {}
) {
  const value = (cents ?? 0) / 100;
  return new Intl.NumberFormat("en-US", {
    compactDisplay: "short",
    currency: "USD",
    maximumFractionDigits: options.compact ? 1 : 0,
    notation: options.compact ? "compact" : "standard",
    style: "currency",
  }).format(value);
}

export function formatSignedCurrency(cents: number) {
  if (cents === 0) {
    return "$0";
  }
  const prefix = cents > 0 ? "+" : "-";
  return `${prefix}${formatCurrency(Math.abs(cents))}`;
}

export function currentBudgetCents(milestones: ExposureMilestone[]) {
  return milestones
    .filter((milestone) => milestone.included)
    .reduce((sum, milestone) => sum + milestone.budgetCents, 0);
}

function fallbackPreviewGroups<T extends ExposureMilestone>(
  included: T[]
): CashAwareDrawGroup<T>[] {
  const targetGroups = Math.min(3, Math.ceil(included.length / 2));
  const groupSize = Math.max(2, Math.ceil(included.length / targetGroups));

  const groups: CashAwareDrawGroup<T>[] = [];
  for (let index = 0; index < included.length; index += groupSize) {
    const groupMilestones = included.slice(index, index + groupSize);
    groups.push({
      endRow: index + groupMilestones.length - 1,
      index: groups.length,
      isOverCashLimit: false,
      milestones: groupMilestones,
      startRow: index,
      totalBudgetCents: groupMilestones.reduce(
        (sum, milestone) => sum + milestone.budgetCents,
        0
      ),
    });
  }
  return groups;
}

export function cashAwareDrawGroups<T extends ExposureMilestone>(
  milestones: T[],
  borrowerCashAvailabilityCents?: number
): CashAwareDrawGroup<T>[] {
  const included = milestones.filter((milestone) => milestone.included);
  const cashLimit = Math.round(borrowerCashAvailabilityCents ?? 0);

  if (included.length === 0) {
    return [];
  }
  if (cashLimit <= 0) {
    return fallbackPreviewGroups(included);
  }

  const groups: CashAwareDrawGroup<T>[] = [];
  let currentMilestones: T[] = [];
  let currentStartRow = 0;
  let currentTotal = 0;

  function pushCurrent() {
    if (currentMilestones.length === 0) {
      return;
    }
    groups.push({
      endRow: currentStartRow + currentMilestones.length - 1,
      index: groups.length,
      isOverCashLimit: currentTotal > cashLimit,
      milestones: currentMilestones,
      startRow: currentStartRow,
      totalBudgetCents: currentTotal,
    });
    currentMilestones = [];
    currentTotal = 0;
  }

  included.forEach((milestone, includedIndex) => {
    const budgetCents = Math.max(0, milestone.budgetCents);
    if (budgetCents > cashLimit) {
      pushCurrent();
      groups.push({
        endRow: includedIndex,
        index: groups.length,
        isOverCashLimit: true,
        milestones: [milestone],
        startRow: includedIndex,
        totalBudgetCents: budgetCents,
      });
      return;
    }

    if (
      currentMilestones.length > 0 &&
      currentTotal + budgetCents > cashLimit
    ) {
      pushCurrent();
    }

    if (currentMilestones.length === 0) {
      currentStartRow = includedIndex;
    }
    currentMilestones.push(milestone);
    currentTotal += budgetCents;
  });

  pushCurrent();
  return groups;
}

export function projectedPeakExposureCents(
  milestones: ExposureMilestone[],
  borrowerCashAvailabilityCents?: number
) {
  return cashAwareDrawGroups(milestones, borrowerCashAvailabilityCents).reduce(
    (peak, group) => Math.max(peak, group.totalBudgetCents),
    0
  );
}
