export type ScheduleHealth = "on_track" | "behind_schedule";

export interface ScheduleHealthInput {
  actualStartedAt?: number | null;
  currentDay?: number | null;
  endDay?: number | null;
  lifecycleStatus?: string | null;
  startDay?: number | null;
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
  const startDay = normalizeBuildDay(input.startDay);
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
  if (overdueDays > 0) {
    return { health: "behind_schedule", overdueDays };
  }

  const started =
    normalizeTimestamp(input.actualStartedAt) !== undefined ||
    lifecycleStatus === "in_progress";
  const missedStartDays = startDay === undefined ? 0 : currentDay - startDay;
  return !started && missedStartDays > 0
    ? { health: "behind_schedule", overdueDays: missedStartDays }
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

function normalizeTimestamp(value?: number | null) {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
}
