import type {
  TimelineItem,
  TimelineRange,
} from "#/components/roadmap/AnimatedCurvedTimeline.tsx";
import {
  buildMilestoneSpendEvents,
  getMilestoneEndX,
} from "./-timeline-milestone-schedule.ts";
import type {
  DemoCapitalSpike,
  DemoDraw,
  DemoMilestone,
} from "./-timeline-share-snapshot.ts";
import { getMilestoneDrawAvailabilityAmount } from "./-timeline-share-snapshot.ts";

export const OPTIMIZED_DRAW_FEE = 500;
export const OPTIMIZED_INTEREST_APR = 0.0925;

const COST_EPSILON = 0.000_001;

export interface TimelineDrawOptimizationInput {
  capitalSpikes: DemoCapitalSpike[];
  items: TimelineItem<DemoMilestone>[];
  minimumCashReserve: number;
  range: TimelineRange;
  startingCash: number;
}

export type TimelineDrawOptimizationResult =
  | {
      drawFees: number;
      draws: DemoDraw[];
      infeasibleReason?: undefined;
      interestCost: number;
      status: "optimized";
      totalCost: number;
      totalDrawAmount: number;
    }
  | {
      drawFees: 0;
      draws: [];
      infeasibleReason: string;
      interestCost: 0;
      status: "infeasible";
      totalCost: 0;
      totalDrawAmount: 0;
    };

interface OptimizerEvent {
  amount: number;
  day: number;
  id: string;
  label: string;
  sortOrder: number;
  spendKind?: "capitalSpike" | "milestone";
  type: "capacityUnlock" | "cashInfusion" | "spend";
}

interface DrawConstraintLedgerTotals {
  capitalSpikeSpend: number;
  cashInfusions: number;
  milestoneSpend: number;
  startingCash: number;
}

interface DrawConstraint {
  availableBeforeEvent: number;
  day: number;
  id: string;
  label: string;
  requiredCumulativeDraw: number;
}

interface DrawStep {
  amount: number;
  anchorConstraintId: string;
  x: number;
}

interface PlanState {
  cost: number;
  steps: DrawStep[];
}

export function optimizeTimelineDrawSchedule(
  input: TimelineDrawOptimizationInput
): TimelineDrawOptimizationResult {
  const range = normalizeRange(input.range);
  const startingCash = normalizeCurrency(input.startingCash);
  const reserve = normalizeCurrency(input.minimumCashReserve);
  const ledger = buildDrawConstraintLedger(input, range, startingCash, reserve);

  if (ledger.status === "infeasible") {
    return {
      drawFees: 0,
      draws: [],
      infeasibleReason: ledger.reason,
      interestCost: 0,
      status: "infeasible",
      totalCost: 0,
      totalDrawAmount: 0,
    };
  }

  if (ledger.constraints.length === 0) {
    return {
      drawFees: 0,
      draws: [],
      interestCost: 0,
      status: "optimized",
      totalCost: 0,
      totalDrawAmount: 0,
    };
  }

  const demandLevels = uniqueSortedPositiveCurrencyValues(
    ledger.constraints.map((constraint) => constraint.requiredCumulativeDraw)
  );
  const memo = new Map<string, PlanState | null>();

  // Positive interest means an optimal draw is never earlier than the first
  // reserve constraint it satisfies. Fixed draw fees mean an optimal cumulative
  // draw level only lands on one of the future reserve demand levels.
  const solve = (
    startConstraintIndex: number,
    cumulativeDrawn: number
  ): PlanState | null => {
    const nextConstraintIndex = ledger.constraints.findIndex(
      (constraint, index) =>
        index >= startConstraintIndex &&
        constraint.requiredCumulativeDraw > cumulativeDrawn
    );

    if (nextConstraintIndex === -1) {
      return { cost: 0, steps: [] };
    }

    const key = `${nextConstraintIndex}:${cumulativeDrawn}`;
    const cached = memo.get(key);
    if (cached !== undefined) {
      return cached;
    }

    const constraint = ledger.constraints[nextConstraintIndex];
    let best: PlanState | null = null;

    for (const targetCumulativeDraw of demandLevels) {
      if (
        targetCumulativeDraw < constraint.requiredCumulativeDraw ||
        targetCumulativeDraw <= cumulativeDrawn ||
        targetCumulativeDraw > constraint.availableBeforeEvent
      ) {
        continue;
      }

      const drawAmount = targetCumulativeDraw - cumulativeDrawn;
      const drawX = latestDrawXBeforeConstraint(constraint.day, range);
      if (drawX === null) {
        continue;
      }

      const continuation = solve(nextConstraintIndex + 1, targetCumulativeDraw);
      if (!continuation) {
        continue;
      }

      const drawCost =
        OPTIMIZED_DRAW_FEE +
        calculateInterestCost(drawAmount, drawX, range.max);
      const candidate: PlanState = {
        cost: drawCost + continuation.cost,
        steps: [
          {
            amount: drawAmount,
            anchorConstraintId: constraint.id,
            x: drawX,
          },
          ...continuation.steps,
        ],
      };

      if (isBetterPlan(candidate, best)) {
        best = candidate;
      }
    }

    memo.set(key, best);
    return best;
  };

  const plan = solve(0, 0);
  if (!plan) {
    const firstBlockingConstraint = ledger.constraints.find(
      (constraint) =>
        latestDrawXBeforeConstraint(constraint.day, range) === null
    );

    return {
      drawFees: 0,
      draws: [],
      infeasibleReason: firstBlockingConstraint
        ? `${firstBlockingConstraint.label} requires draw cash before the timeline can schedule a draw.`
        : "No feasible draw schedule can satisfy the minimum cash reserve with the available milestone reimbursement capacity.",
      interestCost: 0,
      status: "infeasible",
      totalCost: 0,
      totalDrawAmount: 0,
    };
  }

  const draws = plan.steps.map((step, index) => {
    const owner = findDrawOwner(input.items, step.x);

    return {
      amount: step.amount,
      customDate: true,
      id: `optimized-draw-${index + 1}`,
      ...(owner ? { itemId: owner.id } : {}),
      label: `Draw ${String(index + 1).padStart(2, "0")}`,
      x: step.x,
    } satisfies DemoDraw;
  });
  const totalDrawAmount = draws.reduce((total, draw) => total + draw.amount, 0);
  const drawFees = draws.length * OPTIMIZED_DRAW_FEE;
  const interestCost = plan.steps.reduce(
    (total, step) =>
      total + calculateInterestCost(step.amount, step.x, range.max),
    0
  );

  return {
    drawFees,
    draws,
    interestCost,
    status: "optimized",
    totalCost: drawFees + interestCost,
    totalDrawAmount,
  };
}

function buildDrawConstraintLedger(
  input: TimelineDrawOptimizationInput,
  range: Required<TimelineRange>,
  startingCash: number,
  reserve: number
):
  | { constraints: DrawConstraint[]; status: "ready" }
  | { reason: string; status: "infeasible" } {
  const events = buildOptimizerEvents(input.items, input.capitalSpikes, range);
  const constraints: DrawConstraint[] = [];
  let naturalCash = startingCash;
  let unlockedAvailability = 0;
  const totals: DrawConstraintLedgerTotals = {
    capitalSpikeSpend: 0,
    cashInfusions: 0,
    milestoneSpend: 0,
    startingCash,
  };

  if (naturalCash < reserve) {
    return {
      reason: `Starting cash leaves ${formatCurrency(naturalCash)} against the ${formatCurrency(reserve)} minimum reserve before any milestone draw availability is unlocked.`,
      status: "infeasible",
    };
  }

  for (const event of events) {
    if (event.type === "cashInfusion") {
      naturalCash += event.amount;
      totals.cashInfusions += event.amount;
      continue;
    }

    if (event.type === "capacityUnlock") {
      unlockedAvailability += event.amount;
      continue;
    }

    naturalCash -= event.amount;
    if (event.spendKind === "capitalSpike") {
      totals.capitalSpikeSpend += event.amount;
    } else {
      totals.milestoneSpend += event.amount;
    }
    const requiredCumulativeDraw = Math.max(0, reserve - naturalCash);
    if (requiredCumulativeDraw > 0) {
      const constraint = {
        availableBeforeEvent: unlockedAvailability,
        day: event.day,
        id: event.id,
        label: event.label,
        requiredCumulativeDraw,
      } satisfies DrawConstraint;

      if (requiredCumulativeDraw > unlockedAvailability) {
        return {
          reason: formatAvailabilityInfeasibleReason({
            event,
            requiredCumulativeDraw,
            totals,
            unlockedAvailability,
          }),
          status: "infeasible",
        };
      }

      constraints.push(constraint);
    }
  }

  return { constraints, status: "ready" };
}

function buildOptimizerEvents(
  items: TimelineItem<DemoMilestone>[],
  capitalSpikes: DemoCapitalSpike[],
  range: Required<TimelineRange>
): OptimizerEvent[] {
  return [
    ...items
      .filter((item) => item.data)
      .flatMap((item) => {
        const spendEvents = buildMilestoneSpendEvents(item).map((event) => ({
          amount: normalizeCurrency(event.amount),
          day: clampNumber(event.day, range.min, range.max),
          id: event.id,
          label: event.label,
          spendKind: "milestone" as const,
          sortOrder: getMilestoneSpendSortOrder(event.kind),
          type: "spend" as const,
        }));
        const capacityEvent = {
          amount: normalizeCurrency(
            getMilestoneDrawAvailabilityAmount(item.data)
          ),
          day: clampNumber(getMilestoneEndX(item), range.min, range.max),
          id: `${item.id}-completion-capacity`,
          label: `${item.data?.name ?? item.label ?? "Milestone"} completion capacity`,
          sortOrder: 4,
          type: "capacityUnlock" as const,
        };

        return [...spendEvents, capacityEvent];
      }),
    ...capitalSpikes.map((spike) => {
      const eventKind = spike.eventKind ?? "cost";

      return {
        amount: normalizeCurrency(spike.amount),
        day: clampNumber(spike.x, range.min, range.max),
        id: spike.id,
        label: spike.label,
        ...(eventKind === "cashInfusion"
          ? {}
          : { spendKind: "capitalSpike" as const }),
        sortOrder: eventKind === "cashInfusion" ? 0 : 3,
        type: eventKind === "cashInfusion" ? "cashInfusion" : "spend",
      } satisfies OptimizerEvent;
    }),
  ].sort(
    (a, b) =>
      a.day - b.day || a.sortOrder - b.sortOrder || a.id.localeCompare(b.id)
  );
}

function getMilestoneSpendSortOrder(
  kind: ReturnType<typeof buildMilestoneSpendEvents>[number]["kind"]
) {
  if (kind === "initial") {
    return 1;
  }

  if (kind === "distributed") {
    return 2;
  }

  return 3;
}

function formatAvailabilityInfeasibleReason({
  event,
  requiredCumulativeDraw,
  totals,
  unlockedAvailability,
}: {
  event: OptimizerEvent;
  requiredCumulativeDraw: number;
  totals: DrawConstraintLedgerTotals;
  unlockedAvailability: number;
}) {
  return `${event.label} needs ${formatCurrency(requiredCumulativeDraw)} of cumulative draw cash by Day ${formatDay(event.day)} after applying ${formatCurrency(totals.startingCash)} starting cash, ${formatCurrency(totals.cashInfusions)} cash infusions, ${formatCurrency(totals.capitalSpikeSpend)} capital spikes, and ${formatCurrency(totals.milestoneSpend)} milestone spend through that day; only ${formatCurrency(unlockedAvailability)} is unlocked by previously completed milestones.`;
}

function latestDrawXBeforeConstraint(
  constraintDay: number,
  range: Required<TimelineRange>
) {
  const constraintCalendarDay = Math.round(constraintDay);
  const minCalendarDay = Math.round(range.min);

  if (constraintCalendarDay <= minCalendarDay) {
    return null;
  }

  return Math.max(range.min, constraintCalendarDay - 1);
}

function calculateInterestCost(
  principal: number,
  drawX: number,
  rangeMax: number
) {
  const elapsedDays = Math.max(0, rangeMax - drawX);
  if (principal <= 0 || elapsedDays <= 0) {
    return 0;
  }

  return principal * ((1 + OPTIMIZED_INTEREST_APR / 365) ** elapsedDays - 1);
}

function isBetterPlan(candidate: PlanState, incumbent: PlanState | null) {
  if (!incumbent) {
    return true;
  }

  if (candidate.cost < incumbent.cost - COST_EPSILON) {
    return true;
  }

  if (candidate.cost > incumbent.cost + COST_EPSILON) {
    return false;
  }

  if (candidate.steps.length !== incumbent.steps.length) {
    return candidate.steps.length < incumbent.steps.length;
  }

  const candidateFirstDrawX = candidate.steps[0]?.x ?? Number.NEGATIVE_INFINITY;
  const incumbentFirstDrawX = incumbent.steps[0]?.x ?? Number.NEGATIVE_INFINITY;

  return candidateFirstDrawX > incumbentFirstDrawX;
}

function findDrawOwner(
  items: TimelineItem<DemoMilestone>[],
  drawX: number
): TimelineItem<DemoMilestone> | undefined {
  return items
    .filter((item) => item.data && getMilestoneEndX(item) <= drawX)
    .sort((a, b) => getMilestoneEndX(b) - getMilestoneEndX(a))[0];
}

function uniqueSortedPositiveCurrencyValues(values: number[]) {
  return [
    ...new Set(values.map(normalizeCurrency).filter((value) => value > 0)),
  ].sort((a, b) => a - b);
}

function normalizeCurrency(value: number | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return 0;
  }

  return Math.max(0, Math.round(value));
}

function normalizeRange(range: TimelineRange): Required<TimelineRange> {
  const min = Number.isFinite(range.min) ? range.min : 0;
  const max =
    Number.isFinite(range.max) && range.max > min ? range.max : min + 1;

  return {
    max,
    min,
    unit: range.unit ?? "",
  };
}

function clampNumber(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) {
    return min;
  }

  return Math.min(max, Math.max(min, value));
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", {
    currency: "USD",
    maximumFractionDigits: 0,
    style: "currency",
  }).format(value);
}

function formatDay(value: number) {
  return String(Math.round(value));
}
