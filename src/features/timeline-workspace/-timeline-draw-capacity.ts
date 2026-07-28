import type { TimelineItem } from "#/components/roadmap/AnimatedCurvedTimeline.tsx";
import {
  buildMilestoneSpendEvents,
  type MilestoneSpendEvent,
} from "./-timeline-milestone-schedule.ts";
import {
  type DemoMilestone,
  getMilestoneDrawAvailabilityAmount,
} from "./-timeline-share-snapshot.ts";

export interface MilestoneDrawCapacityEvent {
  amount: number;
  day: number;
  id: string;
  label: string;
  milestoneId: string;
  milestoneName: string;
  sourceSpendEvent: MilestoneSpendEvent;
}

export function buildMilestoneDrawCapacityEvents(
  item: TimelineItem<DemoMilestone>
): MilestoneDrawCapacityEvent[] {
  if (!item.data) {
    return [];
  }

  const spendEvents = buildMilestoneSpendEvents(item);
  const totalSpend = spendEvents.reduce(
    (total, event) => total + normalizeCurrency(event.amount),
    0
  );
  const totalCapacity = getMilestoneDrawAvailabilityAmount(item.data);

  if (totalSpend <= 0 || totalCapacity <= 0) {
    return [];
  }

  let allocatedCapacity = 0;

  return spendEvents.flatMap((event, index) => {
    const remainingCapacity = totalCapacity - allocatedCapacity;
    if (remainingCapacity <= 0) {
      return [];
    }

    const isFinalEvent = index === spendEvents.length - 1;
    const eventCapacity = isFinalEvent
      ? remainingCapacity
      : Math.min(
          remainingCapacity,
          Math.round(
            (normalizeCurrency(event.amount) * totalCapacity) / totalSpend
          )
        );
    allocatedCapacity += eventCapacity;

    if (eventCapacity <= 0) {
      return [];
    }

    return [
      {
        amount: eventCapacity,
        day: event.day,
        id: `${event.id}-capacity`,
        label: `${event.milestoneName} accrued capacity`,
        milestoneId: event.milestoneId,
        milestoneName: event.milestoneName,
        sourceSpendEvent: event,
      },
    ];
  });
}

export function getAccruedMilestoneDrawCapacity(
  item: TimelineItem<DemoMilestone>,
  day: number
) {
  return buildMilestoneDrawCapacityEvents(item).reduce(
    (total, event) => (event.day <= day ? total + event.amount : total),
    0
  );
}

function normalizeCurrency(value: number | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return 0;
  }

  return Math.max(0, Math.round(value));
}
