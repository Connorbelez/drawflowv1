export type AllocationInput = {
  percentageBps: number;
};

export type ExposureMilestone = {
  budgetCents: number;
  included: boolean;
};

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

export function projectedPeakExposureCents(milestones: ExposureMilestone[]) {
  const included = milestones.filter((milestone) => milestone.included);
  let peak = 0;
  for (let index = 0; index < included.length; index += 1) {
    const next = included[index + 1];
    const overlapCents = next ? Math.round(next.budgetCents * 0.35) : 0;
    peak = Math.max(peak, included[index].budgetCents + overlapCents);
  }
  return peak;
}
