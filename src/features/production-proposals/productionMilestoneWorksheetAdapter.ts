import {
  parseCurrencyToCents,
} from "#/features/builder-proposal-demo/template-helpers.ts";
import type { TimelineMilestoneWorksheetRow } from "#/features/timeline-workspace/-TimelineMilestoneWorksheetTable.tsx";
import type { IsometricIconKey } from "#/features/timeline-workspace/-timeline-share-snapshot.ts";

import type { ProposalGanttMilestoneDraft } from "./ProductionProposalGanttWorkspace.tsx";

export interface ProductionProposalWorksheetDetail {
  milestones?: Array<{
    budgetCents: number;
    dayEnd: number;
    dayStart: number;
    dependencyKeys?: string[];
    durationDays?: number;
    icon?: IsometricIconKey;
    key: string;
    name: string;
    order: number;
  }>;
  proposal: {
    status: string;
    totalBudgetCents: number;
  };
  submilestones?: Array<{
    budgetCents?: number;
    durationDays?: number;
    key: string;
    milestoneKey: string;
    name: string;
    order?: number;
    startDay?: number;
  }>;
}

const DURATION_PREFIX_REGEX = /^T/i;

function allocateEvenlyCents(totalCents: number, count: number) {
  if (count <= 0) {
    return [];
  }
  const base = Math.floor(Math.max(0, Math.round(totalCents)) / count);
  let remainder = Math.max(0, Math.round(totalCents)) - base * count;
  return Array.from({ length: count }, () => {
    const extra = remainder > 0 ? 1 : 0;
    remainder -= extra;
    return base + extra;
  });
}

function formatCents(cents: number) {
  return new Intl.NumberFormat("en-US", {
    currency: "USD",
    maximumFractionDigits: 0,
    style: "currency",
  }).format(cents / 100);
}

function formatBps(bps: number) {
  return `${(bps / 100).toFixed(2)}% / ${bps} bps`;
}

function iconForMilestoneKey(key: string, name?: string): IsometricIconKey {
  const normalized = `${key} ${name ?? ""}`.toLowerCase();
  if (normalized.includes("foundation") || normalized.includes("site")) {
    return "foundation";
  }
  if (normalized.includes("kitchen") || normalized.includes("cabinet")) {
    return "kitchen";
  }
  if (
    normalized.includes("plumb") ||
    normalized.includes("mechanical") ||
    normalized.includes("mep")
  ) {
    return "plumbing";
  }
  if (normalized.includes("roof") || normalized.includes("dry-in")) {
    return "roofing";
  }
  if (normalized.includes("frame") || normalized.includes("shell")) {
    return "framing";
  }
  if (normalized.includes("rough")) {
    return "roughIn";
  }
  if (normalized.includes("exterior") || normalized.includes("window")) {
    return "exterior";
  }
  if (normalized.includes("finish") || normalized.includes("fixture")) {
    return "finishes";
  }
  if (normalized.includes("close")) {
    return "closeout";
  }
  if (normalized.includes("drywall")) {
    return "drywall";
  }
  return "change";
}

export function productionProposalDetailToWorksheetRows(
  detail: ProductionProposalWorksheetDetail
): TimelineMilestoneWorksheetRow[] {
  const submilestonesByMilestone = new Map<
    string,
    NonNullable<ProductionProposalWorksheetDetail["submilestones"]>
  >();
  for (const submilestone of detail.submilestones ?? []) {
    const next = submilestonesByMilestone.get(submilestone.milestoneKey) ?? [];
    next.push(submilestone);
    submilestonesByMilestone.set(submilestone.milestoneKey, next);
  }
  const totalBudgetCents = Math.max(1, detail.proposal.totalBudgetCents);

  return (detail.milestones ?? [])
    .slice()
    .sort((a, b) => a.order - b.order || a.key.localeCompare(b.key))
    .map((milestone) => {
      const submilestones = (submilestonesByMilestone.get(milestone.key) ?? [])
        .slice()
        .sort(
          (a, b) =>
            (a.order ?? 0) - (b.order ?? 0) || a.key.localeCompare(b.key)
        );
      const fallbackBudgets = allocateEvenlyCents(
        milestone.budgetCents,
        submilestones.length
      );
      const durationDays =
        milestone.durationDays ??
        Math.max(1, Math.round(milestone.dayEnd - milestone.dayStart));
      const percentageBps = Math.round(
        (milestone.budgetCents / totalBudgetCents) * 10_000
      );

      return {
        baseItemId: milestone.key,
        budgetText: formatCents(milestone.budgetCents),
        contractorAssignments: [],
        costItems: [],
        dependencyKeys: milestone.dependencyKeys ?? [],
        durationDays,
        durationText: String(durationDays),
        excluded: false,
        icon:
          milestone.icon ?? iconForMilestoneKey(milestone.key, milestone.name),
        key: milestone.key,
        name: milestone.name,
        order: milestone.order,
        percentageBps,
        percentageText: formatBps(percentageBps),
        subMilestoneDetails: submilestones.map((submilestone, index) => {
          const budgetCents =
            submilestone.budgetCents ?? fallbackBudgets[index] ?? 0;
          const subPercentageBps = Math.round(
            (budgetCents / totalBudgetCents) * 10_000
          );
          return {
            budgetText: formatCents(budgetCents),
            description: "",
            durationText: String(submilestone.durationDays ?? 1),
            id: submilestone.key,
            name: submilestone.name,
            percentageBps: subPercentageBps,
            percentageText: formatBps(subPercentageBps),
          };
        }),
        subMilestones: submilestones.map((submilestone) => submilestone.name),
        type: milestone.key,
      };
    });
}

export function productionProposalDetailToDraftMilestones(
  detail: ProductionProposalWorksheetDetail
): ProposalGanttMilestoneDraft[] {
  const submilestonesByMilestone = new Map<
    string,
    NonNullable<ProductionProposalWorksheetDetail["submilestones"]>
  >();
  for (const submilestone of detail.submilestones ?? []) {
    const next = submilestonesByMilestone.get(submilestone.milestoneKey) ?? [];
    next.push(submilestone);
    submilestonesByMilestone.set(submilestone.milestoneKey, next);
  }
  const sourceMilestones =
    detail.milestones && detail.milestones.length > 0
      ? detail.milestones
      : [
          {
            budgetCents: detail.proposal.totalBudgetCents || 10_000_000,
            dayEnd: 30,
            dayStart: 0,
            dependencyKeys: [],
            durationDays: 30,
            key: "foundation",
            name: "Foundation",
            order: 1,
          },
        ];

  return sourceMilestones
    .slice()
    .sort((a, b) => a.order - b.order || a.key.localeCompare(b.key))
    .map((milestone, index) => {
      const durationDays =
        milestone.durationDays ??
        Math.max(1, Math.round(milestone.dayEnd - milestone.dayStart));
      return {
        budgetCents: milestone.budgetCents,
        dayEnd: milestone.dayEnd,
        dayStart: milestone.dayStart,
        dependencyKeys: milestone.dependencyKeys ?? [],
        durationDays,
        icon: milestone.icon,
        key: milestone.key,
        name: milestone.name,
        order: milestone.order ?? index + 1,
        submilestones: (submilestonesByMilestone.get(milestone.key) ?? [])
          .slice()
          .sort(
            (a, b) =>
              (a.order ?? 0) - (b.order ?? 0) || a.key.localeCompare(b.key)
          )
          .map((submilestone, subIndex) => ({
            budgetCents: submilestone.budgetCents,
            durationDays: submilestone.durationDays,
            key: submilestone.key,
            name: submilestone.name,
            order: submilestone.order ?? subIndex + 1,
            startDay: submilestone.startDay,
          })),
      };
    });
}

function parseWorksheetBudgetCents(value: string, fallback = 0) {
  const parsed = parseCurrencyToCents(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.round(parsed)) : fallback;
}

function parseWorksheetDurationDays(value: string, fallback = 1) {
  const parsed = Number(value.replace(DURATION_PREFIX_REGEX, "").trim());
  return Number.isFinite(parsed)
    ? Math.max(1, Math.round(parsed))
    : Math.max(1, Math.round(fallback));
}

export function worksheetRowsToGanttMilestoneDrafts(
  rows: TimelineMilestoneWorksheetRow[],
  scheduleByMilestoneKey: Map<string, ProposalGanttMilestoneDraft>
): ProposalGanttMilestoneDraft[] {
  return rows
    .filter((row) => !row.excluded)
    .map((row, index) => {
      const schedule = scheduleByMilestoneKey.get(row.key);
      const budgetCents = parseWorksheetBudgetCents(
        row.budgetText,
        schedule?.budgetCents ?? 0
      );
      const durationDays = parseWorksheetDurationDays(
        row.durationText,
        schedule?.durationDays ?? 1
      );
      const scheduleSubmilestonesByKey = new Map(
        (schedule?.submilestones ?? []).map((submilestone) => [
          submilestone.key,
          submilestone,
        ])
      );

      return {
        budgetCents,
        dayEnd: schedule?.dayEnd ?? durationDays,
        dayStart: schedule?.dayStart ?? 0,
        dependencyKeys: row.dependencyKeys,
        durationDays,
        icon: row.icon,
        key: row.key,
        name: row.name,
        order: row.order ?? index + 1,
        submilestones: row.subMilestoneDetails.map((submilestone, subIndex) => {
          const scheduleSubmilestone =
            scheduleSubmilestonesByKey.get(submilestone.id) ??
            schedule?.submilestones?.[subIndex];
          return {
            budgetCents: parseWorksheetBudgetCents(
              submilestone.budgetText,
              scheduleSubmilestone?.budgetCents ?? 0
            ),
            durationDays: parseWorksheetDurationDays(
              submilestone.durationText,
              scheduleSubmilestone?.durationDays ?? 1
            ),
            key: submilestone.id,
            name: submilestone.name,
            order: subIndex + 1,
            ...(scheduleSubmilestone?.startDay === undefined
              ? {}
              : { startDay: scheduleSubmilestone.startDay }),
          };
        }),
      };
    });
}
