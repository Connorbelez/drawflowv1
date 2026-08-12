export type ScheduleHealth = "on_track" | "behind_schedule";

export interface ScheduleHealthInput {
  currentDay?: number | null;
  endDay?: number | null;
  lifecycleStatus?: string | null;
}

export interface ScheduleHealthResult {
  health: ScheduleHealth;
  overdueDays: number;
}

const TERMINAL_SCHEDULE_STATUSES = new Set([
  "approved",
  "complete",
  "completion_approved",
  "completion_submitted",
]);

export function deriveScheduleHealth(
  input: ScheduleHealthInput
): ScheduleHealthResult {
  const currentDay = normalizeBuildDay(input.currentDay);
  const endDay = normalizeBuildDay(input.endDay);
  const lifecycleStatus = input.lifecycleStatus?.trim();

  if (
    currentDay === undefined ||
    endDay === undefined ||
    !lifecycleStatus ||
    TERMINAL_SCHEDULE_STATUSES.has(lifecycleStatus)
  ) {
    return onTrack();
  }

  const overdueDays = currentDay - endDay;
  return overdueDays > 0
    ? { health: "behind_schedule", overdueDays }
    : onTrack();
}

function onTrack(): ScheduleHealthResult {
  return { health: "on_track", overdueDays: 0 };
}

function normalizeBuildDay(value?: number | null) {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.round(value)
    : undefined;
}
