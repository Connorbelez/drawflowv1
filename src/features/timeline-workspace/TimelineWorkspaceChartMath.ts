import type {
  TimelineItem,
  TimelineRange,
} from "#/components/roadmap/AnimatedCurvedTimeline.tsx";
import {
  calculateHomeEquityInterestCost,
  OPTIMIZED_DRAW_FEE as DRAW_FEE,
} from "./-timeline-draw-optimizer.ts";
import {
  getMilestoneEndX,
  getMilestonePaymentSchedule,
} from "./-timeline-milestone-schedule.ts";
import { buildMilestoneDrawCapacityEvents } from "./-timeline-draw-capacity.ts";
import {
  normalizeInterestAnnualBps,
  type DemoCapitalSpike,
  type DemoDraw,
  type DemoMilestone,
  type TimelineShareState,
} from "./-timeline-share-snapshot.ts";
import {
  DEFAULT_TIMELINE_SHARE_PATH,
  MINIMUM_POST_MILESTONE_CASH_RESERVE,
  STARTING_CASH,
  money,
} from "./TimelineWorkspaceDefaults.ts";
import { clampNumber } from "./TimelineWorkspaceDrawUtils.ts";
import type {
  CashShortfallPoint,
  CashflowDatum,
  CumulativeDrawPosition,
  DrawAvailabilityDatum,
  FinancialOverview,
} from "./TimelineWorkspaceTypes.ts";

function compareCashflowPoints(left: CashflowDatum, right: CashflowDatum) {
  return (
    left.day - right.day ||
    getCashflowPointSortOrder(left) - getCashflowPointSortOrder(right) ||
    left.id.localeCompare(right.id)
  );
}

function getCashflowPointSortOrder(point: CashflowDatum) {
  if (typeof point.sortOrder === "number" && Number.isFinite(point.sortOrder)) {
    return point.sortOrder;
  }

  if (point.event === "start") {
    return -1;
  }

  if (point.event === "cashInfusion") {
    return 0;
  }

  if (point.event === "milestone") {
    return point.drawCapacityUnlocked > 0 && point.budget <= 0 ? 4 : 2;
  }

  if (point.event === "draw") {
    return 5;
  }

  return 3;
}

export function buildDrawAvailabilityData(
  cashflowData: CashflowDatum[],
  approvedDrawLimit?: number,
  interestAnnualBps = normalizeInterestAnnualBps(undefined)
): DrawAvailabilityDatum[] {
  const sortedCashflowData = [...cashflowData].sort(compareCashflowPoints);
  const normalizedInterestAnnualBps =
    normalizeInterestAnnualBps(interestAnnualBps);
  let unlockedDraw = 0;
  let releasedDraw = 0;
  let totalInterestAccrued = 0;
  let previousDay = sortedCashflowData[0]?.day ?? 0;

  const baseAvailability = sortedCashflowData.map((point) => {
    const day = Math.max(previousDay, point.day);
    totalInterestAccrued += calculateDailyCompoundedInterest(
      releasedDraw + totalInterestAccrued,
      day - previousDay,
      normalizedInterestAnnualBps
    );
    previousDay = day;

    unlockedDraw += point.drawCapacityUnlocked;
    releasedDraw += point.drawAmount;

    const interestBearingDraw = releasedDraw;
    const additionalAvailableDraw = Math.max(0, unlockedDraw - releasedDraw);

    return {
      additionalAvailableDraw,
      day: point.day,
      interestAnnualBps: normalizedInterestAnnualBps,
      interestBearingDraw,
      name: point.name,
      totalInterestAccrued,
      totalAvailableDraw: interestBearingDraw + additionalAvailableDraw,
      totalUnlockedDraw: unlockedDraw,
    };
  });

  const normalizedApprovedDrawLimit =
    typeof approvedDrawLimit === "number" && Number.isFinite(approvedDrawLimit)
      ? Math.max(0, Math.round(approvedDrawLimit))
      : undefined;
  if (normalizedApprovedDrawLimit === undefined) {
    return baseAvailability;
  }

  const baseTopLine = Math.max(
    0,
    ...baseAvailability.map((point) => point.totalAvailableDraw)
  );
  const approvedHeadroom = Math.max(
    0,
    normalizedApprovedDrawLimit - baseTopLine
  );
  if (approvedHeadroom <= 0) {
    return baseAvailability;
  }

  if (baseTopLine <= 0) {
    return baseAvailability.map((point, index) => {
      const additionalAvailableDraw =
        index === baseAvailability.length - 1
          ? point.additionalAvailableDraw + approvedHeadroom
          : point.additionalAvailableDraw;

      return {
        ...point,
        additionalAvailableDraw,
        totalAvailableDraw: point.interestBearingDraw + additionalAvailableDraw,
      };
    });
  }

  return baseAvailability.map((point) => {
    const approvedLimitShare =
      point.totalAvailableDraw >= baseTopLine
        ? approvedHeadroom
        : Math.round(
            (approvedHeadroom * point.totalAvailableDraw) / baseTopLine
          );
    const additionalAvailableDraw =
      point.additionalAvailableDraw + approvedLimitShare;

    return {
      ...point,
      additionalAvailableDraw,
      totalAvailableDraw: point.interestBearingDraw + additionalAvailableDraw,
    };
  });
}

export function calculateDailyCompoundedInterest(
  principal: number,
  elapsedDays: number,
  interestAnnualBps: number
): number {
  if (principal <= 0 || elapsedDays <= 0) {
    return 0;
  }

  const dailyRate = interestAnnualBps / 10_000 / 365;
  return principal * ((1 + dailyRate) ** elapsedDays - 1);
}

export function buildCashShortfallPoints(
  cashflowData: CashflowDatum[],
  minimumCashReserve = MINIMUM_POST_MILESTONE_CASH_RESERVE
): CashShortfallPoint[] {
  const reserve = Math.max(0, Math.round(minimumCashReserve));
  return cashflowData.flatMap((point) => {
    if (point.event !== "milestone" || point.budget <= 0) {
      return [];
    }

    const cashBeforeMilestone = point.cashOnHand + point.budget;
    const cashAfterMilestone = point.cashOnHand;

    if (cashAfterMilestone >= reserve) {
      return [];
    }

    return [
      {
        cashBeforeMilestone,
        cashOnHand: point.cashOnHand,
        day: point.day,
        milestone: point.name,
        milestoneCost: point.budget,
        shortfall: Math.max(0, reserve - cashAfterMilestone),
      },
    ];
  });
}

export function formatCashShortfallMessage(point: CashShortfallPoint): string {
  if (point.shortfall > 0) {
    return `needs ${money(point.shortfall)} before ${point.milestone}`;
  }

  return `leaves ${money(point.cashOnHand)} after ${point.milestone}`;
}

export function buildFinancialOverview(
  cashflowData: CashflowDatum[],
  draws: DemoDraw[],
  range: Required<TimelineRange>,
  interestAnnualBps = normalizeInterestAnnualBps(undefined),
  capitalSpikes: DemoCapitalSpike[] = []
): FinancialOverview {
  const drawEvents = cashflowData
    .filter((point) => point.event === "draw")
    .sort((a, b) => a.day - b.day || a.id.localeCompare(b.id));
  const normalizedInterestAnnualBps =
    normalizeInterestAnnualBps(interestAnnualBps);
  let principal = 0;
  let previousDay = range.min;
  let interestPaid = 0;

  for (const event of drawEvents) {
    const day = clampNumber(event.day, range.min, range.max);
    interestPaid += calculateDailyCompoundedInterest(
      principal + interestPaid,
      Math.max(0, day - previousDay),
      normalizedInterestAnnualBps
    );
    principal += event.drawAmount;
    previousDay = day;
  }

  interestPaid += calculateDailyCompoundedInterest(
    principal + interestPaid,
    Math.max(0, range.max - previousDay),
    normalizedInterestAnnualBps
  );
  interestPaid += calculateHomeEquityInterestCost(capitalSpikes, range.max);

  return {
    drawCount: draws.length,
    drawFeesPaid: draws.length * DRAW_FEE,
    interestPaid,
    totalDrawReleased: drawEvents.reduce(
      (total, event) => total + event.drawAmount,
      0
    ),
  };
}

export function buildCashUseSummary(
  items: TimelineItem<DemoMilestone>[],
  draws: DemoDraw[],
  capitalSpikes: DemoCapitalSpike[]
) {
  const milestoneSpend = items.reduce((total, item) => {
    if (!item.data) {
      return total;
    }

    return total + getMilestonePaymentSchedule(item).totalAmount;
  }, 0);
  const costSpikeSpend = capitalSpikes.reduce((total, spike) => {
    if (
      spike.eventKind === "cashInfusion" ||
      spike.eventKind === "homeEquityTakeout"
    ) {
      return total;
    }

    return total + spike.amount;
  }, 0);
  const lenderCashUsed = draws.reduce((total, draw) => total + draw.amount, 0);
  const totalPlannedSpend = milestoneSpend + costSpikeSpend;

  return {
    builderCashUsed: Math.max(0, totalPlannedSpend - lenderCashUsed),
    lenderCashUsed,
    totalPlannedSpend,
  };
}

export function getTimelineAlignedTicks(
  range: Required<TimelineRange>,
  pixelsPerUnit: number
): number[] {
  const axisWidth = Math.max(1, (range.max - range.min) * pixelsPerUnit);
  const tickCount = Math.max(5, Math.ceil(axisWidth / 220));

  return Array.from({ length: tickCount }, (_, index) => {
    const ratio = tickCount === 1 ? 0 : index / (tickCount - 1);

    return Math.round(range.min + (range.max - range.min) * ratio);
  });
}

export function getCashflowChartExtent(data: CashflowDatum[]) {
  const values = data.flatMap((item) => [
    item.cashOnHand,
    item.budget,
    item.capitalSpikeAmount,
  ]);
  const min = Math.min(0, ...values);
  const max = Math.max(1, ...values);
  const padding = (max - min) * 0.12;

  return {
    max: max + padding,
    min: min < 0 ? min - padding : 0,
  };
}

export function getDrawAvailabilityChartExtent(data: DrawAvailabilityDatum[]) {
  const max = Math.max(
    1,
    ...data.flatMap((item) => [
      item.additionalAvailableDraw,
      item.interestBearingDraw,
      item.totalAvailableDraw,
    ])
  );

  return {
    max: max * 1.12,
  };
}

export function interpolateCashOnHand(data: CashflowDatum[], value: number): number {
  if (data.length === 0) {
    return STARTING_CASH;
  }

  let cashOnHand = data[0]?.cashOnHand ?? STARTING_CASH;

  for (const point of data) {
    if (point.day > value) {
      break;
    }

    cashOnHand = point.cashOnHand;
  }

  return cashOnHand;
}

export function interpolateLinearCashOnHand(
  data: CashflowDatum[],
  value: number
): number {
  if (data.length === 0) {
    return STARTING_CASH;
  }

  const sorted = [...data].sort(
    (a, b) => a.day - b.day || a.id.localeCompare(b.id)
  );
  let previous = sorted[0];

  if (!previous) {
    return STARTING_CASH;
  }

  if (value <= previous.day) {
    return previous.cashOnHand;
  }

  for (const point of sorted.slice(1)) {
    if (point.day < value) {
      previous = point;
      continue;
    }

    if (point.day === value || point.day === previous.day) {
      return point.cashOnHand;
    }

    const ratio = (value - previous.day) / (point.day - previous.day);

    return (
      previous.cashOnHand + (point.cashOnHand - previous.cashOnHand) * ratio
    );
  }

  return previous.cashOnHand;
}

export function resolveMilestoneDrawPositionDay(
  item: TimelineItem<DemoMilestone>,
  range: Required<TimelineRange>
): number {
  const unlockDay =
    buildMilestoneDrawCapacityEvents(item)[0]?.day ?? getMilestoneEndX(item);

  return clampNumber(Math.round(unlockDay), range.min, range.max);
}

export function getCumulativeDrawPosition(
  availability: DrawAvailabilityDatum | null | undefined
): CumulativeDrawPosition {
  const totalDrawn = Math.max(0, availability?.interestBearingDraw ?? 0);
  const totalUnlocked = Math.max(
    0,
    availability?.totalUnlockedDraw ??
      // Fallback for sparse fixtures: never prefer policy-inflated additional
      // available draw over explicit unlocked capacity.
      totalDrawn
  );

  return {
    availableToDraw: Math.max(0, totalUnlocked - totalDrawn),
    day: availability?.day ?? 0,
    totalDrawn,
    totalUnlocked,
  };
}

export function resolveMilestoneCumulativeDrawPosition(
  item: TimelineItem<DemoMilestone>,
  drawAvailabilityData: DrawAvailabilityDatum[] | null | undefined,
  range: Required<TimelineRange>
): CumulativeDrawPosition {
  const day = resolveMilestoneDrawPositionDay(item, range);

  return getCumulativeDrawPosition(
    interpolateDrawAvailability(drawAvailabilityData ?? [], day)
  );
}

export function interpolateDrawAvailability(
  data: DrawAvailabilityDatum[] | null | undefined,
  value: number
): DrawAvailabilityDatum {
  const fallback = {
    additionalAvailableDraw: 0,
    day: value,
    interestBearingDraw: 0,
    name: "No draw capacity",
    totalInterestAccrued: 0,
    totalAvailableDraw: 0,
    totalUnlockedDraw: 0,
  };

  if (!data || data.length === 0) {
    return fallback;
  }

  let current = data[0] ?? fallback;

  for (const point of data) {
    if (point.day > value) {
      break;
    }

    current = point;
  }

  return {
    ...current,
    day: value,
    totalInterestAccrued:
      current.totalInterestAccrued +
      calculateDailyCompoundedInterest(
        current.interestBearingDraw + current.totalInterestAccrued,
        Math.max(0, value - current.day),
        normalizeInterestAnnualBps(current.interestAnnualBps)
      ),
  };
}

export function withHomeEquityInterest(
  availability: DrawAvailabilityDatum,
  capitalSpikes: readonly DemoCapitalSpike[],
  throughDay: number
): DrawAvailabilityDatum {
  const homeEquityInterestAccrued = calculateHomeEquityInterestCost(
    capitalSpikes,
    throughDay
  );
  return {
    ...availability,
    constructionInterestAccrued: availability.totalInterestAccrued,
    homeEquityInterestAccrued,
    totalInterestAccrued:
      availability.totalInterestAccrued + homeEquityInterestAccrued,
  };
}

export function formatCompactMoney(value: number) {
  return new Intl.NumberFormat("en-US", {
    compactDisplay: "short",
    currency: "USD",
    maximumFractionDigits: 0,
    notation: "compact",
    style: "currency",
  }).format(value);
}

export function countInsertedTimelineItems(
  items: TimelineItem<DemoMilestone>[]
): number {
  return items.filter((item) => item.id.startsWith("inserted-")).length;
}

export function countManualDraws(draws: DemoDraw[]): number {
  return draws.filter((draw) => draw.id.startsWith("manual-draw-")).length;
}

export function timelineShareStateSignature(state: TimelineShareState): string {
  return JSON.stringify(state);
}

export function buildTimelineShareUrl(
  snapshotId: string,
  shareUrlPath = DEFAULT_TIMELINE_SHARE_PATH
): string {
  if (typeof window === "undefined") {
    return `${shareUrlPath}?share=${encodeURIComponent(snapshotId)}`;
  }

  const url = new URL(shareUrlPath, window.location.origin);
  url.searchParams.set("share", snapshotId);

  return url.toString();
}
