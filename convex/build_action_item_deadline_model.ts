import type { Doc } from "./types";

export const BUILD_ACTION_ITEM_DEADLINE_DAY_MS = 24 * 60 * 60 * 1000;
const OPEN_UNDATED_QUEUE_SORT_AT = Number.MAX_SAFE_INTEGER - 1;
const CLOSED_QUEUE_SORT_AT = Number.MAX_SAFE_INTEGER;

export type BuildActionItemDeadlineStage =
  | "before"
  | "due"
  | "overdue"
  | "escalated";

export function buildActionItemQueueSortAt(
  dueAt: number | undefined,
  status: Doc<"buildActionItems">["status"]
) {
  if (status === "done" || status === "cancelled") {
    return CLOSED_QUEUE_SORT_AT;
  }
  if (dueAt === undefined) {
    return OPEN_UNDATED_QUEUE_SORT_AT;
  }
  return Math.min(Math.max(0, dueAt), OPEN_UNDATED_QUEUE_SORT_AT - 1);
}

const DEADLINE_STAGES: readonly BuildActionItemDeadlineStage[] = [
  "before",
  "due",
  "overdue",
  "escalated",
];

export function resetBuildActionItemDeadlineSchedule(
  dueAt: number | undefined,
  status: Doc<"buildActionItems">["status"],
  currentGeneration = 0
) {
  const deadlineScheduleGeneration = currentGeneration + 1;
  if (dueAt === undefined || status === "done" || status === "cancelled") {
    return {
      deadlineNextAt: undefined,
      deadlineNextStage: undefined,
      deadlineScheduleGeneration,
      deadlineProcessingFailure: undefined,
      deadlineProcessingFailedAt: undefined,
      deadlineProcessingState: "complete" as const,
    };
  }
  return {
    deadlineNextAt: dueAt - BUILD_ACTION_ITEM_DEADLINE_DAY_MS,
    deadlineNextStage: "before" as const,
    deadlineScheduleGeneration,
    deadlineProcessingFailure: undefined,
    deadlineProcessingFailedAt: undefined,
    deadlineProcessingState: "pending" as const,
  };
}

export function dueBuildActionItemDeadlineStages(input: {
  asOf: number;
  dueAt: number;
  nextStage: BuildActionItemDeadlineStage;
}) {
  const start = DEADLINE_STAGES.indexOf(input.nextStage);
  return DEADLINE_STAGES.slice(start).filter(
    (stage) => buildActionItemDeadlineStageAt(input.dueAt, stage) <= input.asOf
  );
}

export function advanceBuildActionItemDeadlineSchedule(input: {
  dueAt: number;
  processedStages: readonly BuildActionItemDeadlineStage[];
}) {
  const last = input.processedStages.at(-1);
  if (!last) {
    throw new Error("A processed deadline stage is required.");
  }
  const next = DEADLINE_STAGES[DEADLINE_STAGES.indexOf(last) + 1];
  if (!next) {
    return {
      deadlineNextAt: undefined,
      deadlineNextStage: undefined,
      deadlineProcessingFailure: undefined,
      deadlineProcessingFailedAt: undefined,
      deadlineProcessingState: "complete" as const,
    };
  }
  return {
    deadlineNextAt: buildActionItemDeadlineStageAt(input.dueAt, next),
    deadlineNextStage: next,
    deadlineProcessingFailure: undefined,
    deadlineProcessingFailedAt: undefined,
    deadlineProcessingState: "pending" as const,
  };
}

export function buildActionItemDeadlineStageAt(
  dueAt: number,
  stage: BuildActionItemDeadlineStage
) {
  switch (stage) {
    case "before":
      return dueAt - BUILD_ACTION_ITEM_DEADLINE_DAY_MS;
    case "due":
      return dueAt;
    case "overdue":
      return dueAt + BUILD_ACTION_ITEM_DEADLINE_DAY_MS;
    case "escalated":
      return dueAt + 2 * BUILD_ACTION_ITEM_DEADLINE_DAY_MS;
  }
}
