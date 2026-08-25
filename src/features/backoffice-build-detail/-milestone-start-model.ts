import type { ProductionBuildDetail } from "./ProductionBuildDetailSurface.tsx";
import { ENTRY_SOURCES } from "./-milestone-start-contracts.ts";
import type {
  PrototypeDependency,
  PrototypeEntrySource,
  PrototypeLifecycle,
  PrototypeScenario,
  PrototypeStartContext,
  PrototypeStartState,
} from "./-milestone-start-contracts.ts";

export function buildPrototypeStartContext(
  detail: ProductionBuildDetail,
  requestedMilestoneKey?: string,
  requestedSubmilestoneKey?: string
): PrototypeStartContext {
  const milestone =
    detail.milestones.find((item) => item.key === requestedMilestoneKey) ??
    detail.milestones.find((item) => item.status === "planned") ??
    detail.milestones[0];
  const milestoneKey =
    milestone?.key ?? requestedMilestoneKey ?? "prototype-milestone";
  const submilestone = requestedSubmilestoneKey
    ? detail.submilestones.find(
        (item) =>
          item.key === requestedSubmilestoneKey &&
          item.milestoneKey === milestoneKey
      )
    : undefined;
  const scopeKind = submilestone ? "submilestone" : "milestone";
  const targetKey = submilestone?.key ?? milestoneKey;
  const targetName = submilestone?.name ?? milestone?.name ?? "Milestone";
  const dependencyCandidates = (milestone?.dependencyKeys ?? [])
    .map((key) => detail.milestones.find((item) => item.key === key))
    .filter((item): item is NonNullable<(typeof detail.milestones)[number]> =>
      Boolean(item)
    )
    .map((item) => ({
      key: item.key,
      name: item.name,
      status:
        item.status === "planned"
          ? ("planned" as const)
          : ("in_progress" as const),
    }));
  const fallbackDependency =
    detail.milestones.find((item) => item.key !== milestoneKey) ?? milestone;
  const plannedStartDay = submilestone?.startDay ?? milestone?.dayStart ?? 0;
  const plannedEndDay = submilestone
    ? plannedStartDay + Math.max(1, submilestone.durationDays ?? 1)
    : (milestone?.dayEnd ?? 20);

  return {
    buildName: detail.build.buildName,
    dependencyCandidates:
      dependencyCandidates.length > 0
        ? dependencyCandidates
        : [
            {
              key: fallbackDependency?.key ?? "site-servicing",
              name: fallbackDependency?.name ?? "Site servicing",
              status: "in_progress",
            },
          ],
    evidenceState: milestone?.evidenceState ?? "Not started",
    milestoneKey,
    plannedEndDate: addDays(detail.build.startDate, plannedEndDay),
    plannedStartDate: addDays(detail.build.startDate, plannedStartDay),
    progressPercent: submilestone
      ? 0
      : (milestone?.progressPercent ??
        milestone?.normalizedProgressPercent ??
        0),
    scopeKind,
    targetKey,
    targetName,
  };
}

export function stateForScenario(
  context: PrototypeStartContext,
  scenario: PrototypeScenario,
  entrySource?: PrototypeEntrySource
): PrototypeStartState {
  const now = new Date();
  const actual =
    scenario === "backdated"
      ? backdatedValue(context.plannedStartDate, now)
      : toDateTimeLocal(now);

  return {
    actionLog: [
      `Loaded ${scenario.replace("_", " ")} scenario in local prototype state.`,
    ],
    actualStartedAtInput: actual,
    dependencyOverrideReason: "",
    entrySource:
      entrySource ??
      (scenario === "completion"
        ? "submilestone"
        : scenario === "dependency"
          ? "gantt"
          : "milestone_card"),
    lifecycle: "planned",
    scenario,
  };
}

export function backdatedValue(plannedStartDate: string, now: Date) {
  const planned = new Date(`${plannedStartDate}T08:00:00`);
  const candidate = new Date(planned);
  candidate.setDate(candidate.getDate() + 1);
  if (candidate.getTime() < now.getTime()) {
    return toDateTimeLocal(candidate);
  }
  const fallback = new Date(now);
  fallback.setDate(fallback.getDate() - 4);
  fallback.setHours(8, 0, 0, 0);
  return toDateTimeLocal(fallback);
}

export function addDays(startIso: string, days: number) {
  const date = new Date(`${startIso.slice(0, 10)}T12:00:00`);
  date.setDate(date.getDate() + Math.round(days));
  return date.toISOString().slice(0, 10);
}

export function scheduleVarianceDays(actualInput: string, plannedDate: string) {
  const actual = new Date(actualInput);
  const planned = new Date(`${plannedDate}T12:00:00`);
  if (Number.isNaN(actual.getTime()) || Number.isNaN(planned.getTime())) {
    return 0;
  }
  return Math.round(
    (actual.getTime() - planned.getTime()) / (24 * 60 * 60 * 1000)
  );
}

export function varianceLabel(days: number) {
  if (days === 0) {
    return "On plan";
  }
  return days < 0 ? `${Math.abs(days)}d early` : `${Math.abs(days)}d late`;
}

export function toDateTimeLocal(date: Date) {
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

export function formatShortDate(value: string) {
  return new Intl.DateTimeFormat("en-CA", {
    day: "numeric",
    month: "short",
  }).format(new Date(`${value}T12:00:00`));
}

export function formatLongDate(value: string) {
  return new Intl.DateTimeFormat("en-CA", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(`${value}T12:00:00`));
}

export function formatInputDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "Not set";
  }
  return new Intl.DateTimeFormat("en-CA", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

export function formatIsoDateTime(value?: string) {
  if (!value) {
    return "Not recorded";
  }
  return new Intl.DateTimeFormat("en-CA", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export function entrySourceLabel(source: PrototypeEntrySource) {
  return ENTRY_SOURCES.find((item) => item.value === source)?.label ?? source;
}

export function lifecycleLabel(
  lifecycle: PrototypeLifecycle | PrototypeDependency["status"]
) {
  if (lifecycle === "completion_submitted") {
    return "Completion submitted";
  }
  if (lifecycle === "in_progress") {
    return "In progress";
  }
  return "Planned";
}
