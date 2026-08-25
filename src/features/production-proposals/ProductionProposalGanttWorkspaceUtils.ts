import { addDays, differenceInDays } from "date-fns";
import { localDateFromIsoDate } from "#/features/production-proposals/proposalScheduleDates.ts";
import type {
  ProposalGanttDrawDraft,
  ProposalGanttMilestoneDraft,
  ProposalGanttSubmilestoneDraft,
  ProposalGanttSubmilestoneRow,
} from "./ProductionProposalGanttWorkspaceTypes.ts";
import { BASE_DATE } from "./ProductionProposalGanttWorkspaceTypes.ts";

export function sameStringArray(left: string[], right: string[]) {
  return (
    left.length === right.length &&
    left.every((value, index) => value === right[index])
  );
}

export function sameSubmilestones(
  left: ProposalGanttSubmilestoneDraft[],
  right: ProposalGanttSubmilestoneDraft[]
) {
  return JSON.stringify(left) === JSON.stringify(right);
}

export function normalizeProposalStatus(
  status: string
): "draft" | "submitted" | "approved" | "closed" {
  if (
    status === "draft" ||
    status === "submitted" ||
    status === "approved" ||
    status === "closed"
  ) {
    return status;
  }
  return "submitted";
}

export function resolveDrawBoundaryIndex(
  draw: ProposalGanttDrawDraft,
  milestones: ProposalGanttMilestoneDraft[]
) {
  const byMilestone = draw.milestoneKey
    ? milestones.findIndex((milestone) => milestone.key === draw.milestoneKey)
    : -1;
  if (byMilestone >= 0) {
    return byMilestone;
  }
  let byTimingDay = -1;
  for (let index = milestones.length - 1; index >= 0; index -= 1) {
    if (milestones[index]!.dayEnd <= draw.timingDay) {
      byTimingDay = index;
      break;
    }
  }
  return byTimingDay >= 0 ? byTimingDay : milestones.length - 1;
}

export function normalizeMilestoneOrders(
  milestones: ProposalGanttMilestoneDraft[]
) {
  return sortedMilestones(milestones).map((milestone, index) => ({
    ...milestone,
    dayEnd: Math.max(milestone.dayStart + 1, Math.round(milestone.dayEnd)),
    dayStart: Math.max(0, Math.round(milestone.dayStart)),
    durationDays: Math.max(
      1,
      Math.round(
        milestone.durationDays || milestone.dayEnd - milestone.dayStart
      )
    ),
    order: index + 1,
    submilestones: milestone.submilestones.map((submilestone, subIndex) => ({
      ...submilestone,
      order: submilestone.order ?? subIndex + 1,
    })),
  }));
}

export function sortedMilestones(milestones: ProposalGanttMilestoneDraft[]) {
  return [...milestones].sort(
    (left, right) =>
      left.order - right.order || left.key.localeCompare(right.key)
  );
}

export function indexOfSubmilestoneRow(
  rows: ProposalGanttSubmilestoneRow[],
  milestoneKey: string | undefined,
  submilestoneKey: string | undefined
) {
  return Math.max(
    0,
    rows.findIndex(
      (row) =>
        row.milestoneKey === milestoneKey &&
        (submilestoneKey === undefined ||
          row.submilestoneKey === submilestoneKey)
    )
  );
}

export function calculateDrawAvailabilityCents(
  budgetCents: number,
  borrowerCoPayBps: number
) {
  const reimbursableBps = Math.max(
    0,
    Math.min(10_000, 10_000 - borrowerCoPayBps)
  );
  return Math.max(0, Math.round((budgetCents * reimbursableBps) / 10_000));
}

export function uniqueMilestoneKey(
  name: string,
  milestones: ProposalGanttMilestoneDraft[]
) {
  const existing = new Set(milestones.map((milestone) => milestone.key));
  const base = slugify(name) || "milestone";
  let key = base;
  let index = 2;
  while (existing.has(key)) {
    key = `${base}-${index}`;
    index += 1;
  }
  return key;
}

export function uniqueSubmilestoneKey(baseKey: string, existing: Set<string>) {
  if (!existing.has(baseKey)) {
    return baseKey;
  }
  let index = 2;
  let key = `${baseKey}-${index}`;
  while (existing.has(key)) {
    index += 1;
    key = `${baseKey}-${index}`;
  }
  return key;
}

export function uniqueDrawKey(
  milestoneKey: string,
  draws: ProposalGanttDrawDraft[]
) {
  const existing = new Set(draws.map((draw) => draw.drawKey));
  const base = `${milestoneKey}-draw`;
  let key = base;
  let index = 2;
  while (existing.has(key)) {
    key = `${base}-${index}`;
    index += 1;
  }
  return key;
}

export function slugify(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function proposalBaseDateFromIso(value?: string) {
  if (!value) {
    return BASE_DATE;
  }
  try {
    return localDateFromIsoDate(value);
  } catch {
    return BASE_DATE;
  }
}

export function dateFromDay(day: number, baseDate = BASE_DATE) {
  return addDays(baseDate, Math.round(day));
}

export function dayFromDate(date: Date, baseDate = BASE_DATE) {
  return differenceInDays(date, baseDate);
}

export function centsToDollars(cents: number) {
  return Math.round(cents) / 100;
}

export function formatCents(cents: number) {
  return new Intl.NumberFormat("en-US", {
    currency: "USD",
    maximumFractionDigits: 0,
    style: "currency",
  }).format(centsToDollars(cents));
}

export function dollarsToCents(dollars: number) {
  return Math.max(0, Math.round(dollars * 100));
}
