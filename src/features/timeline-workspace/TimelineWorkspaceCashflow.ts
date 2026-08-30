import type {
  TimelineItem,
  TimelineRange,
} from "#/components/roadmap/AnimatedCurvedTimeline.tsx";
import {
  buildMilestoneSpendEvents,
  getMilestoneEndX,
  getMilestonePaymentSchedule,
} from "./-timeline-milestone-schedule.ts";
import { buildMilestoneDrawCapacityEvents } from "./-timeline-draw-capacity.ts";
import {
  DEFAULT_BORROWER_CO_PAY_BPS,
  getMilestoneDrawAvailabilityAmount,
} from "./-timeline-share-snapshot.ts";
import type {
  DemoCapitalSpike,
  DemoDraw,
  DemoMilestone,
} from "./-timeline-share-snapshot.ts";
import {
  CHART_PROBE_INTERVAL_DAYS,
  STARTING_CASH,
} from "./TimelineWorkspaceDefaults.ts";
import { clampNumber, formatTimelineDay } from "./TimelineWorkspaceDrawUtils.ts";
import {
  interpolateCashOnHand,
  interpolateDrawAvailability,
} from "./TimelineWorkspaceChartMath.ts";
import type {
  CashflowDatum,
  DrawAvailabilityDatum,
} from "./TimelineWorkspaceTypes.ts";

export function buildTimelineCashflowData(
  items: TimelineItem<DemoMilestone>[],
  draws: DemoDraw[],
  capitalSpikes: DemoCapitalSpike[],
  range: Required<TimelineRange>,
  startingCash = STARTING_CASH
): CashflowDatum[] {
  const events = [
    ...items
      .filter((item) => item.data)
      .flatMap((item) => {
        const spendEvents = buildMilestoneSpendEvents(item);
        const drawAvailabilityAmount = getMilestoneDrawAvailabilityAmount(
          item.data,
          DEFAULT_BORROWER_CO_PAY_BPS
        );
        const completionDay = getMilestoneEndX(item);
        const milestoneName = item.data?.name ?? item.label ?? "Milestone";
        const capacityEvents = buildMilestoneDrawCapacityEvents(item);

        return [
          ...spendEvents.map((event) => ({
            amount: event.amount,
            day: clampNumber(event.day, range.min, range.max),
            drawCapacityUnlocked: 0,
            id: event.id,
            label: event.label,
            milestoneDrawAvailability: drawAvailabilityAmount,
            milestoneEndDay: completionDay,
            milestoneId: event.milestoneId,
            milestoneTotalBudget: event.milestoneAmount,
            sortOrder: getMilestoneCashflowSortOrder(event.kind),
            type: "milestone" as const,
          })),
          ...capacityEvents.map((event) => ({
            amount: 0,
            day: clampNumber(event.day, range.min, range.max),
            drawCapacityUnlocked: event.amount,
            id: event.id,
            label: event.label || `${milestoneName} accrued capacity`,
            milestoneDrawAvailability: drawAvailabilityAmount,
            milestoneEndDay: getMilestoneEndX(item),
            milestoneId: event.milestoneId,
            milestoneTotalBudget: item.data?.amount ?? 0,
            sortOrder: 4,
            type: "capacityUnlock" as const,
          })),
        ];
      }),
    ...capitalSpikes.map((spike) => {
      const eventKind = spike.eventKind ?? "cost";
      const isCashSource =
        eventKind === "cashInfusion" || eventKind === "homeEquityTakeout";

      return {
        amount: spike.amount,
        day: clampNumber(spike.x, range.min, range.max),
        drawCapacityUnlocked: 0,
        id: spike.id,
        label: spike.label,
        sortOrder: isCashSource ? 0 : 3,
        type: isCashSource ? "cashInfusion" : "capitalSpike",
      } as const;
    }),
    ...draws.map((draw) => ({
      amount: draw.amount,
      day: clampNumber(draw.x, range.min, range.max),
      drawCapacityUnlocked: 0,
      id: draw.id,
      label: draw.label,
      sortOrder: 5,
      type: "draw" as const,
    })),
  ].sort(
    (a, b) =>
      a.day - b.day || a.sortOrder - b.sortOrder || a.id.localeCompare(b.id)
  );
  const data: CashflowDatum[] = [
    {
      budget: 0,
      capitalSpikeAmount: 0,
      cashInfusionAmount: 0,
      cashOnHand: startingCash,
      day: range.min,
      drawCapacityUnlocked: 0,
      drawAmount: 0,
      event: "start",
      id: "start",
      name: "Starting cash",
      sortOrder: -1,
    },
  ];
  let cashOnHand = startingCash;

  for (const event of events) {
    if (event.type === "milestone") {
      cashOnHand -= event.amount;
      data.push({
        budget: event.amount,
        capitalSpikeAmount: 0,
        cashInfusionAmount: 0,
        cashOnHand,
        day: event.day,
        drawCapacityUnlocked: event.drawCapacityUnlocked,
        drawAmount: 0,
        event: "milestone",
        id: event.id,
        milestoneDrawAvailability: event.milestoneDrawAvailability,
        milestoneEndDay: event.milestoneEndDay,
        milestoneId: event.milestoneId,
        milestoneTotalBudget: event.milestoneTotalBudget,
        name: event.label,
        sortOrder: event.sortOrder,
      });
      continue;
    }

    if (event.type === "capacityUnlock") {
      data.push({
        budget: 0,
        capitalSpikeAmount: 0,
        cashInfusionAmount: 0,
        cashOnHand,
        day: event.day,
        drawCapacityUnlocked: event.drawCapacityUnlocked,
        drawAmount: 0,
        event: "milestone",
        id: event.id,
        milestoneDrawAvailability: event.milestoneDrawAvailability,
        milestoneEndDay: event.milestoneEndDay,
        milestoneId: event.milestoneId,
        milestoneTotalBudget: event.milestoneTotalBudget,
        name: event.label,
        sortOrder: event.sortOrder,
      });
      continue;
    }

    if (event.type === "capitalSpike") {
      cashOnHand -= event.amount;
      data.push({
        budget: 0,
        capitalSpikeAmount: event.amount,
        cashInfusionAmount: 0,
        cashOnHand,
        day: event.day,
        drawCapacityUnlocked: 0,
        drawAmount: 0,
        event: "capitalSpike",
        id: event.id,
        name: event.label,
        sortOrder: event.sortOrder,
      });
      continue;
    }

    if (event.type === "cashInfusion") {
      cashOnHand += event.amount;
      data.push({
        budget: 0,
        capitalSpikeAmount: 0,
        cashInfusionAmount: event.amount,
        cashOnHand,
        day: event.day,
        drawCapacityUnlocked: 0,
        drawAmount: 0,
        event: "cashInfusion",
        id: event.id,
        name: event.label,
        sortOrder: event.sortOrder,
      });
      continue;
    }

    cashOnHand += event.amount;
    data.push({
      budget: 0,
      capitalSpikeAmount: 0,
      cashInfusionAmount: 0,
      cashOnHand,
      day: event.day,
      drawCapacityUnlocked: 0,
      drawAmount: event.amount,
      event: "draw",
      id: event.id,
      name: event.label,
      sortOrder: event.sortOrder,
    });
  }

  return data;
}

export function getMilestoneCashflowSortOrder(
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

export function densifyCashflowData(
  data: CashflowDatum[],
  range: Required<TimelineRange>
): CashflowDatum[] {
  const grouped = groupCashflowPointsByDay(data);
  const eventDays = data.map((point) => point.day);

  return buildChartProbeDays(range, eventDays).flatMap((day) => {
    const existing = grouped.get(day);

    if (existing) {
      return existing;
    }

    return [
      {
        budget: 0,
        capitalSpikeAmount: 0,
        cashInfusionAmount: 0,
        cashOnHand: interpolateCashOnHand(data, day),
        day,
        drawCapacityUnlocked: 0,
        drawAmount: 0,
        event: "start",
        id: `cash-probe-${day}`,
        name: formatTimelineDay(day),
      } satisfies CashflowDatum,
    ];
  });
}

export function buildCashflowChartData(
  accountingData: CashflowDatum[],
  items: TimelineItem<DemoMilestone>[],
  range: Required<TimelineRange>,
  startingCash = STARTING_CASH
): CashflowDatum[] {
  const milestoneBars = buildMilestoneCostBars(items, range);
  const milestoneDays = items
    .filter((item) => item.data)
    .flatMap((item) => [item.x, getMilestoneEndX(item)]);
  const eventDays = [
    ...accountingData
      .filter((point) => !isDistributedMilestoneCashflowPoint(point))
      .map((point) => point.day),
    ...milestoneDays,
  ];
  const milestoneBudgetByDay = new Map<number, number>();
  const milestoneReimbursableBudgetByDay = new Map<number, number>();
  const milestoneEndDayByStartDay = new Map<number, number>();

  for (const bar of milestoneBars) {
    milestoneBudgetByDay.set(
      bar.day,
      (milestoneBudgetByDay.get(bar.day) ?? 0) + bar.amount
    );
    milestoneReimbursableBudgetByDay.set(
      bar.day,
      (milestoneReimbursableBudgetByDay.get(bar.day) ?? 0) +
        bar.reimbursableAmount
    );
    milestoneEndDayByStartDay.set(bar.day, bar.endDay);
  }

  return buildCashflowChartEventDays(range, eventDays).map((day) => {
    const dayEvents = accountingData.filter(
      (point) => Math.round(point.day) === day
    );
    const drawAmount = dayEvents.reduce(
      (total, point) => total + point.drawAmount,
      0
    );
    const capitalSpikeAmount = dayEvents.reduce(
      (total, point) => total + point.capitalSpikeAmount,
      0
    );
    const cashInfusionAmount = dayEvents.reduce(
      (total, point) => total + point.cashInfusionAmount,
      0
    );
    const drawCapacityUnlocked = dayEvents.reduce(
      (total, point) => total + point.drawCapacityUnlocked,
      0
    );
    const budget = milestoneBudgetByDay.get(day) ?? 0;
    const reimbursableBudget = Math.min(
      budget,
      milestoneReimbursableBudgetByDay.get(day) ?? budget
    );
    const outOfPocketBudget = Math.max(0, budget - reimbursableBudget);
    const primaryEvent =
      dayEvents.find((point) => point.event === "draw") ??
      dayEvents.find((point) => point.event === "cashInfusion") ??
      dayEvents.find((point) => point.event === "capitalSpike") ??
      dayEvents.find((point) => point.drawCapacityUnlocked > 0) ??
      dayEvents[0];

    return {
      budget,
      capitalSpikeAmount,
      cashInfusionAmount,
      cashOnHand: projectCashOnHandForChart(
        accountingData,
        items,
        day,
        startingCash
      ),
      day,
      drawAmount,
      drawCapacityUnlocked,
      event: budget > 0 ? "milestone" : (primaryEvent?.event ?? "start"),
      id:
        budget > 0
          ? `milestone-cost-gate-${day}`
          : (primaryEvent?.id ?? `cash-probe-${day}`),
      milestoneEndDay:
        budget > 0 ? milestoneEndDayByStartDay.get(day) : undefined,
      name:
        budget > 0
          ? "Milestone cost gate"
          : (primaryEvent?.name ?? formatTimelineDay(day)),
      outOfPocketBudget,
      reimbursableBudget,
    } satisfies CashflowDatum;
  });
}

export function buildCashflowChartEventDays(
  range: Required<TimelineRange>,
  eventDays: number[]
): number[] {
  const min = Math.round(range.min);
  const max = Math.round(range.max);
  const days = new Set<number>([min, max]);

  for (const eventDay of eventDays) {
    if (Number.isFinite(eventDay)) {
      days.add(Math.round(clampNumber(eventDay, min, max)));
    }
  }

  return [...days].sort((a, b) => a - b);
}

export function buildMilestoneCostBars(
  items: TimelineItem<DemoMilestone>[],
  range: Required<TimelineRange>
): Array<{
  amount: number;
  day: number;
  endDay: number;
  reimbursableAmount: number;
}> {
  return items
    .filter(
      (item): item is TimelineItem<DemoMilestone> & { data: DemoMilestone } =>
        Boolean(item.data)
    )
    .map((item) => {
      const schedule = getMilestonePaymentSchedule(item);
      const amount = Math.max(0, Math.round(schedule.totalAmount));
      const milestoneDrawAvailability = getMilestoneDrawAvailabilityAmount(
        item.data,
        DEFAULT_BORROWER_CO_PAY_BPS
      );
      const reimbursableAmount = Math.min(amount, milestoneDrawAvailability);

      return {
        amount,
        day: Math.round(clampNumber(schedule.startX, range.min, range.max)),
        endDay: Math.round(clampNumber(schedule.endX, range.min, range.max)),
        reimbursableAmount,
      };
    })
    .filter((bar) => bar.amount > 0);
}

export function projectCashOnHandForChart(
  accountingData: CashflowDatum[],
  items: TimelineItem<DemoMilestone>[],
  value: number,
  startingCash = STARTING_CASH
): number {
  const startPoint = accountingData.find((point) => point.event === "start");
  const cashOnHand = startPoint?.cashOnHand ?? startingCash;
  const projectedDistributedSpend = getProjectedDistributedMilestoneSpend(
    items,
    value
  );

  const settledCashOnHand = accountingData
    .filter(
      (point) =>
        point.id !== "start" &&
        point.day <= value &&
        !isDistributedMilestoneCashflowPoint(point)
    )
    .sort(compareCashflowPoints)
    .reduce(
      (total, point) =>
        total +
        point.drawAmount +
        point.cashInfusionAmount -
        point.capitalSpikeAmount -
        point.budget,
      cashOnHand
    );

  return settledCashOnHand - projectedDistributedSpend;
}

export function isDistributedMilestoneCashflowPoint(point: CashflowDatum) {
  return point.event === "milestone" && point.id.includes("-distributed-");
}

export function getProjectedDistributedMilestoneSpend(
  items: TimelineItem<DemoMilestone>[],
  value: number
): number {
  return items.reduce((total, item) => {
    if (!item.data) {
      return total;
    }

    const schedule = getMilestonePaymentSchedule(item);
    const distributedAmount = Math.max(
      0,
      Math.round(schedule.distributedAmount)
    );

    if (distributedAmount <= 0 || value <= schedule.startX) {
      return total;
    }

    if (value >= schedule.endX || schedule.endX <= schedule.startX) {
      return total + distributedAmount;
    }

    const progress =
      (value - schedule.startX) / (schedule.endX - schedule.startX);

    return total + distributedAmount * progress;
  }, 0);
}

export function densifyDrawAvailabilityData(
  data: DrawAvailabilityDatum[],
  range: Required<TimelineRange>
): DrawAvailabilityDatum[] {
  const grouped = new Map<number, DrawAvailabilityDatum[]>();

  for (const point of data) {
    const day = Math.round(point.day);
    grouped.set(day, [...(grouped.get(day) ?? []), point]);
  }

  return buildChartProbeDays(
    range,
    data.map((point) => point.day)
  ).flatMap((day) => {
    const existing = grouped.get(day);

    if (existing) {
      return existing;
    }

    return {
      ...interpolateDrawAvailability(data, day),
      day,
      name: formatTimelineDay(day),
    };
  });
}

export function buildDrawAvailabilityChartData(
  availabilityData: DrawAvailabilityDatum[],
  cashflowData: CashflowDatum[],
  items: TimelineItem<DemoMilestone>[],
  range: Required<TimelineRange>
): DrawAvailabilityDatum[] {
  const milestoneDays = items
    .filter((item) => item.data)
    .flatMap((item) => [item.x, getMilestoneEndX(item)]);
  const eventDays = [
    ...cashflowData
      .filter((point) => !isDistributedMilestoneCashflowPoint(point))
      .map((point) => point.day),
    ...milestoneDays,
  ];

  return buildCashflowChartEventDays(range, eventDays).map((day) => ({
    ...interpolateDrawAvailability(availabilityData, day),
    day,
    name: formatTimelineDay(day),
  }));
}

export function buildChartProbeDays(
  range: Required<TimelineRange>,
  eventDays: number[],
  intervalDays = CHART_PROBE_INTERVAL_DAYS
): number[] {
  const min = Math.round(range.min);
  const max = Math.round(range.max);
  const days = new Set<number>([min, max]);

  for (const eventDay of eventDays) {
    if (Number.isFinite(eventDay)) {
      days.add(Math.round(clampNumber(eventDay, min, max)));
    }
  }

  for (let day = min; day <= max; day += intervalDays) {
    days.add(day);
  }

  return [...days].sort((a, b) => a - b);
}

export function groupCashflowPointsByDay(data: CashflowDatum[]) {
  const grouped = new Map<number, CashflowDatum[]>();

  for (const point of data) {
    const day = Math.round(point.day);
    grouped.set(day, [...(grouped.get(day) ?? []), point]);
  }

  return grouped;
}

export function compareCashflowPoints(left: CashflowDatum, right: CashflowDatum) {
  return (
    left.day - right.day ||
    getCashflowPointSortOrder(left) - getCashflowPointSortOrder(right) ||
    left.id.localeCompare(right.id)
  );
}

export function getCashflowPointSortOrder(point: CashflowDatum) {
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
