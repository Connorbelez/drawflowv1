import type { ProductionBuildDetail } from "./ProductionBuildDetailSurface.tsx";
import type {
  PrototypeModel,
  PrototypeSubmilestone,
  WorkState,
} from "./-milestone-execution-contracts.ts";

const WHITESPACE_REGEX = /\s+/;
const MATERIAL_FALLBACKS = [
  ["Ductwork package", "Roof curbs"],
  ["PEX supply", "Rough-in valves"],
  ["Fixtures allowance", "Drain fittings", "Water heaters"],
  ["Panel package", "Branch wiring"],
];
const CONTRACTOR_FALLBACKS = [
  ["Northline Mechanical", "HVAC contractor"],
  [null, null],
  ["Atlas Plumbing Supply", "Supplier"],
  ["Northpoint Electric", "Electrical contractor"],
] as const;

export function buildPrototypeModel(
  detail: ProductionBuildDetail,
  requestedMilestoneKey?: string
): PrototypeModel {
  const milestone =
    detail.milestones.find((item) => item.key === requestedMilestoneKey) ??
    detail.milestones[0];
  const milestoneKey = milestone?.key ?? requestedMilestoneKey ?? "milestone";
  const sourceRows = detail.submilestones.filter(
    (item) => item.milestoneKey === milestoneKey
  );
  const fallbackNames = ["HVAC", "Plumbing", "Plumbing supplies", "Electrical"];
  const rows = sourceRows.length
    ? sourceRows
    : fallbackNames.map((name, index) => ({
        budgetCents: Math.round((milestone?.budgetCents ?? 10_000_000) / 4),
        durationDays: 4 + index,
        key: `${milestoneKey}-prototype-${index + 1}`,
        milestoneKey,
        name,
        order: index + 1,
        startDay: (milestone?.dayStart ?? 0) + index * 4,
        status: "planned" as const,
      }));
  const startBase = detail.build.startDate;
  const explicitlyBudgetedCents = rows.reduce(
    (sum, row) => sum + Math.max(0, row.budgetCents ?? 0),
    0
  );
  const unbudgetedCount = rows.filter(
    (row) => !row.budgetCents || row.budgetCents <= 0
  ).length;
  const distributedBudgetCents = Math.round(
    Math.max(0, (milestone?.budgetCents ?? 0) - explicitlyBudgetedCents) /
      Math.max(1, unbudgetedCount)
  );
  const submilestones = rows.map(
    // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: This throwaway fixture assembler intentionally keeps prototype shaping local.
    (row, index): PrototypeSubmilestone => {
      const assignments = (detail.milestoneContractorAssignments ?? []).filter(
        (assignment) => assignment.submilestoneKey === row.key
      );
      const assignment = assignments[0];
      const materialRows = (detail.costItems ?? []).filter((item) =>
        item.relevantSubmilestoneKeys.includes(row.key)
      );
      const evidenceRows = (detail.evidenceAssets ?? []).filter(
        (evidence) => evidence.submilestoneKey === row.key
      );
      const fallbackContractor =
        CONTRACTOR_FALLBACKS[index % CONTRACTOR_FALLBACKS.length];
      const startDay = row.startDay ?? (milestone?.dayStart ?? 0) + index * 3;
      const durationDays = Math.max(1, row.durationDays ?? 4);
      const plannedBudgetCents =
        row.budgetCents && row.budgetCents > 0
          ? row.budgetCents
          : distributedBudgetCents;
      const actualStatus =
        row.status === "complete"
          ? "complete"
          : row.status === "in_progress"
            ? "in_progress"
            : index === 0
              ? "in_progress"
              : index === 2
                ? "complete"
                : "not_started";
      return {
        actualCostCents:
          actualStatus === "complete"
            ? Math.round(plannedBudgetCents * 0.96)
            : null,
        contractor:
          assignment?.contractor?.name ?? fallbackContractor?.[0] ?? null,
        contractorRole: assignment?.role ?? fallbackContractor?.[1] ?? null,
        description:
          materialRows.find((item) => item.description)?.description ??
          `Complete and document the ${row.name.toLowerCase()} scope in accordance with the approved roadmap and inspection requirements.`,
        endDate: addDays(startBase, startDay + durationDays - 1),
        evidence:
          evidenceRows.length > 0
            ? evidenceRows.map((evidence, evidenceIndex) => ({
                fileName: evidence.fileName,
                id: evidence.evidenceKey || `${row.key}-${evidenceIndex}`,
                locationVerified: evidence.locationVerified ?? false,
                source: evidence.source ?? "Builder upload",
              }))
            : index === 0 || index === 2
              ? [
                  {
                    fileName:
                      index === 0
                        ? "rough-in-progress.jpg"
                        : "delivery-ticket.pdf",
                    id: `${row.key}-fixture-evidence`,
                    locationVerified: index === 0,
                    source: "Prototype fixture",
                  },
                ]
              : [],
        fieldNote:
          index === 0
            ? "Crew completed the east-side rough-in. West riser remains accessible for inspection."
            : "",
        key: row.key,
        materials:
          materialRows.length > 0
            ? materialRows.map((item) => item.title)
            : (MATERIAL_FALLBACKS[index % MATERIAL_FALLBACKS.length] ?? [
                "No materials recorded",
              ]),
        name: row.name,
        plannedBudgetCents,
        startDate: addDays(startBase, startDay),
        workState: actualStatus,
      };
    }
  );
  return {
    actionLog: ["Prototype initialized with local in-memory state."],
    milestoneKey,
    milestoneName: milestone?.name ?? "Milestone execution",
    milestoneSubmitted: false,
    plannedBudgetCents:
      milestone?.budgetCents ??
      submilestones.reduce((sum, item) => sum + item.plannedBudgetCents, 0),
    plannedEndDate: addDays(startBase, milestone?.dayEnd ?? 20),
    plannedStartDate: addDays(startBase, milestone?.dayStart ?? 0),
    submilestones,
  };
}

export function addDays(startIso: string, days: number) {
  const date = new Date(`${startIso.slice(0, 10)}T12:00:00`);
  date.setDate(date.getDate() + Math.round(days));
  return date.toISOString().slice(0, 10);
}

export function completedCount(model: PrototypeModel) {
  return model.submilestones.filter((item) => item.workState === "complete")
    .length;
}

export function formatMoney(cents: number) {
  return new Intl.NumberFormat("en-CA", {
    currency: "CAD",
    maximumFractionDigits: 0,
    style: "currency",
  }).format(cents / 100);
}

export function formatShortDate(value: string) {
  return new Intl.DateTimeFormat("en-CA", {
    day: "numeric",
    month: "short",
  }).format(new Date(`${value.slice(0, 10)}T12:00:00`));
}

export function initials(name: string) {
  return name
    .split(WHITESPACE_REGEX)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

export function nameFor(model: PrototypeModel, key: string) {
  return model.submilestones.find((item) => item.key === key)?.name ?? key;
}

export function workStateLabel(state: WorkState) {
  if (state === "complete") {
    return "Complete";
  }
  if (state === "in_progress") {
    return "In progress";
  }
  return "Not started";
}
