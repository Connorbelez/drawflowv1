import type { TimelineItem } from "#/components/roadmap/AnimatedCurvedTimeline.tsx";
import {
  DEFAULT_DRAW_REVIEW_LAG_DAYS,
  getMilestoneEndX,
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
}

export function buildMilestoneDrawCapacityEvents(
  item: TimelineItem<DemoMilestone>
): MilestoneDrawCapacityEvent[] {
  if (!item.data) {
    return [];
  }

  const totalCapacity = getMilestoneDrawAvailabilityAmount(item.data);

  if (totalCapacity <= 0) {
    return [];
  }

  const milestoneName = item.data.name?.trim() || item.label || item.id;
  return [
    {
      amount: totalCapacity,
      day: getMilestoneEndX(item) + DEFAULT_DRAW_REVIEW_LAG_DAYS,
      id: `${item.id}-reimbursement-capacity`,
      label: `${milestoneName} reimbursement eligibility`,
      milestoneId: item.id,
      milestoneName,
    },
  ];
}

export function getAccruedMilestoneDrawCapacity(
  item: TimelineItem<DemoMilestone>,
  day: number
) {
  if (item.data?.status === "complete") {
    const completedDay =
      item.data.completionClaim?.completedDay ?? getMilestoneEndX(item);
    if (completedDay <= day) {
      return getMilestoneDrawAvailabilityAmount(item.data);
    }
  }

  return buildMilestoneDrawCapacityEvents(item).reduce(
    (total, event) => (event.day <= day ? total + event.amount : total),
    0
  );
}
