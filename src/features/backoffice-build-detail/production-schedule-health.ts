import type {
  ProductionMilestone,
  ProductionSubmilestone,
} from "./production-build-detail-contracts.ts";
import {
  deriveScheduleHealth,
  type ScheduleHealthResult,
} from "./scheduleHealth.ts";

export function productionSubmilestoneScheduleDays(
  milestone: ProductionMilestone,
  submilestone: ProductionSubmilestone
) {
  const startDay =
    submilestone.startDay ??
    milestone.dayStart + Math.max(0, submilestone.order - 1);
  const durationDays = Math.max(1, submilestone.durationDays ?? 1);
  return { endDay: startDay + durationDays - 1, startDay };
}

export function productionSubmilestoneScheduleHealth(
  milestone: ProductionMilestone,
  submilestone: ProductionSubmilestone,
  currentDay: number
): ScheduleHealthResult {
  const { endDay, startDay } = productionSubmilestoneScheduleDays(
    milestone,
    submilestone
  );
  return deriveScheduleHealth({
    actualStartedAt: submilestone.actualStartedAt,
    currentDay,
    endDay,
    lifecycleStatus: submilestone.status,
    startDay,
  });
}

export function productionMilestoneScheduleHealth(
  milestone: ProductionMilestone,
  submilestones: readonly ProductionSubmilestone[],
  currentDay: number
): ScheduleHealthResult {
  const health = [
    deriveScheduleHealth({
      currentDay,
      endDay: milestone.dayEnd,
      lifecycleStatus: milestone.status,
    }),
    ...submilestones.map((submilestone) =>
      productionSubmilestoneScheduleHealth(milestone, submilestone, currentDay)
    ),
  ];
  const overdueDays = Math.max(
    0,
    ...health
      .filter((result) => result.health === "behind_schedule")
      .map((result) => result.overdueDays)
  );
  return overdueDays > 0
    ? { health: "behind_schedule", overdueDays }
    : { health: "on_track", overdueDays: 0 };
}

export function productionMilestoneHasStartedSubmilestone(
  submilestones: readonly ProductionSubmilestone[]
) {
  return submilestones.some(
    (submilestone) =>
      submilestone.status !== "planned" ||
      (typeof submilestone.actualStartedAt === "number" &&
        Number.isFinite(submilestone.actualStartedAt))
  );
}
