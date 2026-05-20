import type {
  TimelineItem,
  TimelineRange,
} from "#/components/roadmap/AnimatedCurvedTimeline.tsx";
import type { DemoMilestone } from "./-timeline-share-snapshot.ts";

export const DEFAULT_MILESTONE_DURATION_DAYS = 14;
export const DEFAULT_DRAW_REVIEW_LAG_DAYS = 8;
export const MILESTONE_SPEND_INTERVAL_DAYS = 5;
export const MINIMUM_MILESTONE_HANDOFF_GAP_DAYS = 5;

export type MilestonePhase = "inProgress" | "complete";
export type MilestoneSpendKind = "completion" | "distributed" | "initial";

export interface ActiveMilestoneSelection {
  itemId: string;
  phase: MilestonePhase;
}

export interface MilestonePaymentSchedule {
  completionPaymentAmount: number;
  dailyDistributedAmount: number;
  distributedAmount: number;
  durationDays: number;
  endX: number;
  initialPaymentAmount: number;
  startX: number;
  totalAmount: number;
}

export interface MilestoneSpendEvent {
  amount: number;
  day: number;
  id: string;
  kind: MilestoneSpendKind;
  label: string;
  milestoneAmount: number;
  milestoneId: string;
  milestoneName: string;
}

type MilestoneScheduleFields = {
  completionPaymentAmount?: number;
  durationDays?: number;
  initialPaymentAmount?: number;
};

type ScheduledDemoMilestone = DemoMilestone & MilestoneScheduleFields;

type NormalizeMilestoneScheduleInput = DemoMilestone & MilestoneScheduleFields;

export function normalizeMilestoneSchedule(
  input: NormalizeMilestoneScheduleInput
): DemoMilestone {
  const amount = normalizeCurrency(input.amount, 0);
  const durationDays = normalizeDurationDays(input.durationDays);
  const initialPaymentAmount = Math.min(
    normalizeCurrency(input.initialPaymentAmount, 0),
    amount
  );
  const completionPaymentAmount = Math.min(
    normalizeCurrency(input.completionPaymentAmount, 0),
    amount - initialPaymentAmount
  );

  return {
    ...input,
    amount,
    completionPaymentAmount,
    durationDays,
    initialPaymentAmount,
  } as DemoMilestone;
}

export function getMilestonePaymentSchedule(
  item: TimelineItem<DemoMilestone>
): MilestonePaymentSchedule {
  const data = item.data as ScheduledDemoMilestone | undefined;
  const normalized = normalizeMilestoneSchedule({
    amount: data?.amount ?? 0,
    completionPaymentAmount: data?.completionPaymentAmount,
    draw: data?.draw ?? "",
    drawX: data?.drawX,
    durationDays: data?.durationDays ?? DEFAULT_MILESTONE_DURATION_DAYS,
    evidence: data?.evidence ?? "",
    icon: data?.icon ?? "change",
    initialPaymentAmount: data?.initialPaymentAmount,
    name: data?.name ?? "",
    policy: data?.policy ?? "",
    status: data?.status ?? "upcoming",
    subMilestones: data?.subMilestones ?? [],
  }) as ScheduledDemoMilestone;
  const totalAmount = normalized.amount;
  const initialPaymentAmount = normalized.initialPaymentAmount ?? 0;
  const completionPaymentAmount = normalized.completionPaymentAmount ?? 0;
  const durationDays =
    normalized.durationDays ?? DEFAULT_MILESTONE_DURATION_DAYS;
  const distributedAmount = Math.max(
    0,
    totalAmount - initialPaymentAmount - completionPaymentAmount
  );

  return {
    completionPaymentAmount,
    dailyDistributedAmount: distributedAmount / durationDays,
    distributedAmount,
    durationDays,
    endX: getMilestoneEndX(item),
    initialPaymentAmount,
    startX: normalizeNumber(item.x, 0),
    totalAmount,
  };
}

export function getMilestoneEndX(item: TimelineItem<DemoMilestone>): number {
  const data = item.data as ScheduledDemoMilestone | undefined;

  return normalizeNumber(item.x, 0) + normalizeDurationDays(data?.durationDays);
}

export function resolveDefaultDrawX(
  item: TimelineItem<DemoMilestone>,
  range: TimelineRange
): number {
  return clampNumber(
    getMilestoneEndX(item) + DEFAULT_DRAW_REVIEW_LAG_DAYS,
    normalizeNumber(range.min, 0),
    normalizeNumber(range.max, 0)
  );
}

export function normalizeMilestoneTimelineItems(
  items: TimelineItem<DemoMilestone>[]
): TimelineItem<DemoMilestone>[] {
  let previousEndX = Number.NEGATIVE_INFINITY;

  return [...items]
    .sort((a, b) => a.x - b.x || a.id.localeCompare(b.id))
    .map((item) => {
      const x = Math.max(
        normalizeNumber(item.x, 0),
        previousEndX + MINIMUM_MILESTONE_HANDOFF_GAP_DAYS
      );
      const normalizedItem = {
        ...item,
        data: item.data
          ? normalizeMilestoneSchedule(
              item.data as NormalizeMilestoneScheduleInput
            )
          : item.data,
        x,
      };

      previousEndX = getMilestoneEndX(normalizedItem);

      return normalizedItem;
    });
}

export function buildMilestoneSpendEvents(
  item: TimelineItem<DemoMilestone>
): MilestoneSpendEvent[] {
  const schedule = getMilestonePaymentSchedule(item);
  const milestoneId = item.id;
  const milestoneName = item.data?.name?.trim() || item.label || item.id;
  const events: MilestoneSpendEvent[] = [];

  events.push({
    amount: schedule.initialPaymentAmount,
    day: schedule.startX,
    id: `${milestoneId}-initial-payment`,
    kind: "initial",
    label: `${milestoneName} initial payment`,
    milestoneAmount: schedule.totalAmount,
    milestoneId,
    milestoneName,
  });

  const distributedDays = getDistributedSpendDays(schedule);
  const distributedAmount =
    distributedDays.length > 0
      ? schedule.distributedAmount / distributedDays.length
      : 0;

  for (const day of distributedDays) {
    if (distributedAmount <= 0) {
      break;
    }

    events.push({
      amount: distributedAmount,
      day,
      id: `${milestoneId}-distributed-${formatSpendEventDayId(day)}`,
      kind: "distributed",
      label: `${milestoneName} interval spend`,
      milestoneAmount: schedule.totalAmount,
      milestoneId,
      milestoneName,
    });
  }

  events.push({
    amount: schedule.completionPaymentAmount,
    day: schedule.endX,
    id: `${milestoneId}-completion-payment`,
    kind: "completion",
    label: `${milestoneName} completion payment`,
    milestoneAmount: schedule.totalAmount,
    milestoneId,
    milestoneName,
  });

  return events;
}

function getDistributedSpendDays(schedule: MilestonePaymentSchedule): number[] {
  if (schedule.distributedAmount <= 0) {
    return [];
  }

  const days: number[] = [];

  for (
    let day = schedule.startX;
    day < schedule.endX;
    day += MILESTONE_SPEND_INTERVAL_DAYS
  ) {
    days.push(day);
  }

  return days.length > 0 ? days : [schedule.startX];
}

function formatSpendEventDayId(day: number): string {
  return String(day).replaceAll(".", "-");
}

function normalizeDurationDays(value: number | undefined): number {
  if (value === undefined || !Number.isFinite(value) || value <= 0) {
    return DEFAULT_MILESTONE_DURATION_DAYS;
  }

  return Math.max(1, Math.round(normalizeNumber(value, 1)));
}

function normalizeCurrency(
  value: number | undefined,
  fallback: number
): number {
  return Math.max(0, Math.round(normalizeNumber(value, fallback)));
}

function normalizeNumber(value: number | undefined, fallback: number): number {
  return Number.isFinite(value) ? Number(value) : fallback;
}

function clampNumber(value: number, min: number, max: number): number {
  if (max < min) {
    return min;
  }

  return Math.min(Math.max(value, min), max);
}
