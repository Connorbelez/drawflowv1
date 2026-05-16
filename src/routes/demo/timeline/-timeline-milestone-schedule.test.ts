import { describe, expect, test } from "vitest";
import type { TimelineItem } from "#/components/roadmap/AnimatedCurvedTimeline.tsx";
import type { DemoMilestone } from "./-timeline-share-snapshot.ts";
import {
  DEFAULT_DRAW_REVIEW_LAG_DAYS,
  DEFAULT_MILESTONE_DURATION_DAYS,
  MINIMUM_MILESTONE_HANDOFF_GAP_DAYS,
  buildMilestoneSpendEvents,
  getMilestoneEndX,
  getMilestonePaymentSchedule,
  normalizeMilestoneSchedule,
  normalizeMilestoneTimelineItems,
  resolveDefaultDrawX,
} from "./-timeline-milestone-schedule.ts";

describe("timeline milestone schedule helpers", () => {
  test("derives completion day from start day plus duration", () => {
    const item = milestoneItem({
      amount: 120_000,
      durationDays: 12,
      x: 40,
    });

    expect(getMilestoneEndX(item)).toBe(52);
    expect(resolveDefaultDrawX(item, { max: 80, min: 0, unit: "days" })).toBe(
      52 + DEFAULT_DRAW_REVIEW_LAG_DAYS
    );
  });

  test("normalizes invalid durations and caps explicit payments", () => {
    const schedule = getMilestonePaymentSchedule(
      milestoneItem({
        amount: 100_000,
        completionPaymentAmount: 60_000,
        durationDays: 0,
        initialPaymentAmount: 70_000,
        x: 10,
      })
    );

    expect(schedule).toMatchObject({
      completionPaymentAmount: 30_000,
      distributedAmount: 0,
      durationDays: DEFAULT_MILESTONE_DURATION_DAYS,
      initialPaymentAmount: 70_000,
      totalAmount: 100_000,
    });
  });

  test("enforces five days between previous completion and next start", () => {
    const items = normalizeMilestoneTimelineItems([
      milestoneItem({ durationDays: 10, id: "one", x: 10 }),
      milestoneItem({ durationDays: 12, id: "two", x: 22 }),
      milestoneItem({ durationDays: 8, id: "three", x: 35 }),
    ]);

    expect(items.map((item) => [item.id, item.x, getMilestoneEndX(item)])).toEqual(
      [
        ["one", 10, 20],
        ["two", 25, 37],
        ["three", 42, 50],
      ]
    );
    expect(MINIMUM_MILESTONE_HANDOFF_GAP_DAYS).toBe(5);
  });

  test("builds daily distributed spend events from start inclusive to end exclusive", () => {
    const events = buildMilestoneSpendEvents(
      milestoneItem({
        amount: 100_000,
        completionPaymentAmount: 20_000,
        durationDays: 4,
        initialPaymentAmount: 40_000,
        name: "Foundation",
        x: 10,
      })
    );

    expect(events).toEqual([
      {
        amount: 40_000,
        day: 10,
        id: "foundation-initial-payment",
        kind: "initial",
        label: "Foundation initial payment",
        milestoneAmount: 100_000,
        milestoneId: "foundation",
        milestoneName: "Foundation",
      },
      {
        amount: 10_000,
        day: 10,
        id: "foundation-distributed-10",
        kind: "distributed",
        label: "Foundation daily spend",
        milestoneAmount: 100_000,
        milestoneId: "foundation",
        milestoneName: "Foundation",
      },
      {
        amount: 10_000,
        day: 11,
        id: "foundation-distributed-11",
        kind: "distributed",
        label: "Foundation daily spend",
        milestoneAmount: 100_000,
        milestoneId: "foundation",
        milestoneName: "Foundation",
      },
      {
        amount: 10_000,
        day: 12,
        id: "foundation-distributed-12",
        kind: "distributed",
        label: "Foundation daily spend",
        milestoneAmount: 100_000,
        milestoneId: "foundation",
        milestoneName: "Foundation",
      },
      {
        amount: 10_000,
        day: 13,
        id: "foundation-distributed-13",
        kind: "distributed",
        label: "Foundation daily spend",
        milestoneAmount: 100_000,
        milestoneId: "foundation",
        milestoneName: "Foundation",
      },
      {
        amount: 20_000,
        day: 14,
        id: "foundation-completion-payment",
        kind: "completion",
        label: "Foundation completion payment",
        milestoneAmount: 100_000,
        milestoneId: "foundation",
        milestoneName: "Foundation",
      },
    ]);
  });

  test("builds zero initial and completion events when no explicit payments exist", () => {
    const events = buildMilestoneSpendEvents(
      milestoneItem({
        amount: 100_000,
        durationDays: 2,
        name: "Foundation",
        x: 10,
      })
    );

    expect(events).toEqual([
      {
        amount: 0,
        day: 10,
        id: "foundation-initial-payment",
        kind: "initial",
        label: "Foundation initial payment",
        milestoneAmount: 100_000,
        milestoneId: "foundation",
        milestoneName: "Foundation",
      },
      {
        amount: 50_000,
        day: 10,
        id: "foundation-distributed-10",
        kind: "distributed",
        label: "Foundation daily spend",
        milestoneAmount: 100_000,
        milestoneId: "foundation",
        milestoneName: "Foundation",
      },
      {
        amount: 50_000,
        day: 11,
        id: "foundation-distributed-11",
        kind: "distributed",
        label: "Foundation daily spend",
        milestoneAmount: 100_000,
        milestoneId: "foundation",
        milestoneName: "Foundation",
      },
      {
        amount: 0,
        day: 12,
        id: "foundation-completion-payment",
        kind: "completion",
        label: "Foundation completion payment",
        milestoneAmount: 100_000,
        milestoneId: "foundation",
        milestoneName: "Foundation",
      },
    ]);
  });

  test("uses integer day buckets for fractional timeline starts", () => {
    const events = buildMilestoneSpendEvents(
      milestoneItem({
        amount: 30_000,
        durationDays: 3,
        name: "Foundation",
        x: 10.6,
      })
    );
    const distributedEvents = events.filter(
      (event) => event.kind === "distributed"
    );

    expect(events[0]).toMatchObject({
      amount: 0,
      day: 10.6,
      kind: "initial",
    });
    expect(distributedEvents.map((event) => event.day)).toEqual([11, 12, 13]);
    expect(distributedEvents.map((event) => event.id)).toEqual([
      "foundation-distributed-11",
      "foundation-distributed-12",
      "foundation-distributed-13",
    ]);
    expect(events.at(-1)).toMatchObject({
      amount: 0,
      day: 13.6,
      kind: "completion",
    });
  });

  test("does not emit distributed buckets before a fractional start", () => {
    const events = buildMilestoneSpendEvents(
      milestoneItem({
        amount: 30_000,
        durationDays: 3,
        name: "Foundation",
        x: 10.4,
      })
    );
    const distributedEvents = events.filter(
      (event) => event.kind === "distributed"
    );

    expect(distributedEvents.map((event) => event.day)).toEqual([11, 12, 13]);
    expect(distributedEvents.some((event) => event.day === 10)).toBe(false);
    expect(events[0]).toMatchObject({
      amount: 0,
      day: 10.4,
      kind: "initial",
    });
    expect(events.at(-1)).toMatchObject({
      amount: 0,
      day: 13.4,
      kind: "completion",
    });
  });
});

type DemoMilestoneScheduleFields = {
  completionPaymentAmount?: number;
  durationDays?: number;
  initialPaymentAmount?: number;
};

type DemoMilestoneScheduleInput = TimelineItem<DemoMilestone> &
  DemoMilestone &
  DemoMilestoneScheduleFields;

function milestoneItem(
  overrides: Partial<DemoMilestoneScheduleInput> = {}
): TimelineItem<DemoMilestone> {
  const id = overrides.id ?? "foundation";
  const name = overrides.name ?? "Foundation";

  return {
    data: normalizeMilestoneSchedule({
      amount: overrides.amount ?? 100_000,
      completionPaymentAmount: overrides.completionPaymentAmount,
      draw: "Draw 1",
      drawX: overrides.drawX,
      durationDays: overrides.durationDays ?? DEFAULT_MILESTONE_DURATION_DAYS,
      evidence: "Planning",
      icon: "foundation",
      initialPaymentAmount: overrides.initialPaymentAmount,
      name,
      policy: "Planning",
      status: "ready",
      subMilestones: ["Excavation"],
    }),
    id,
    x: overrides.x ?? 10,
  };
}
