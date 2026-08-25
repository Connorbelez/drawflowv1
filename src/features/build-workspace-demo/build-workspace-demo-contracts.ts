import { differenceInDays, format } from "date-fns";
import type { GanttFeature, Range } from "#/components/kibo-ui/gantt/index.tsx";
import type {
  DrawStatus,
  EvidenceStatus,
  Milestone,
  MilestoneStatus,
  WorkspaceRole,
} from "./types";

export type GanttResolution = Extract<Range, "daily" | "weekly" | "monthly">;
export type MilestoneHighlightTone = "selected" | "blocking" | "blocked";
export type MilestoneHighlightTones = Record<string, MilestoneHighlightTone>;
export type ScheduleDisplayMode = "dates" | "tOffsets";
export type SelectedMilestoneIds = Set<string>;
export type BatchShiftPreview = {
  deltaDays: number;
  movingMilestoneIds: string[];
  lockedMilestoneIds: string[];
  source: "selection" | "drawGroup";
  sourceId?: string;
} | null;
export type SingleMilestoneShiftPreview = {
  deltaDays: number;
  milestoneId: string;
} | null;

export const resolutionOptions: { label: string; value: GanttResolution }[] = [
  { label: "Days", value: "daily" },
  { label: "Weeks", value: "weekly" },
  { label: "Months", value: "monthly" },
];

export const milestoneStatuses: MilestoneStatus[] = [
  "proposed",
  "notStarted",
  "inProgress",
  "blocked",
  "evidenceRequired",
  "evidenceSubmitted",
  "underReview",
  "approved",
];

export const roleLabels: Record<WorkspaceRole, string> = {
  builderLead: "Builder Lead",
  lenderAdmin: "Lender Admin",
  siteVisitor: "Site Visitor",
};

export const statusLabels: Record<
  MilestoneStatus | DrawStatus | EvidenceStatus,
  string
> = {
  accepted: "Accepted",
  approved: "Approved",
  blocked: "Blocked",
  draft: "Draft",
  evidencePending: "Evidence pending",
  evidenceRequired: "Evidence required",
  evidenceSubmitted: "Evidence submitted",
  inProgress: "In progress",
  locationUnverified: "Location unverified",
  needsInfo: "Needs info",
  notStarted: "Not started",
  planned: "Planned",
  proposed: "Proposed",
  readyForRelease: "Ready for release",
  released: "Released",
  submitted: "Submitted",
  underReview: "Under review",
};

export const statusColors: Record<MilestoneStatus, string> = {
  approved: "#7dd3a8",
  blocked: "#f97373",
  evidenceRequired: "#fbbf24",
  evidenceSubmitted: "#67e8f9",
  inProgress: "#8ab4ff",
  notStarted: "#8b949e",
  proposed: "#c084fc",
  underReview: "#fde047",
};

export const drawClasses: Record<DrawStatus, string> = {
  blocked: "border-red-400/70 bg-red-500/10 text-red-700 dark:text-red-100",
  evidencePending:
    "border-amber-300/70 bg-amber-400/10 text-amber-800 dark:text-amber-100",
  planned: "border-sky-300/50 bg-sky-400/10 text-sky-700 dark:text-sky-100",
  readyForRelease:
    "border-emerald-300/70 bg-emerald-400/10 text-emerald-700 dark:text-emerald-100",
  released:
    "border-lime-300/70 bg-lime-400/15 text-lime-800 dark:text-lime-100",
};

export const money = (value: number) =>
  new Intl.NumberFormat("en-US", {
    currency: "USD",
    maximumFractionDigits: 0,
    style: "currency",
  }).format(value);

export const compactMoney = (value: number) =>
  new Intl.NumberFormat("en-US", {
    currency: "USD",
    maximumFractionDigits: 0,
    notation: "compact",
    style: "currency",
  }).format(value);

export const ANNUAL_DRAW_INTEREST_RATE = 0.14;
export const DRAW_FEE_AMOUNT = 500;

export const parseNumber = (value: string, fallback: number) => {
  const parsed = Number(value);

  return Number.isFinite(parsed) ? parsed : fallback;
};

export const toDateInputValue = (date: Date) => format(date, "yyyy-MM-dd");

export const fromDateInputValue = (value: string) => {
  const [year, month, day] = value.split("-").map(Number);

  return new Date(year, month - 1, day);
};

export function scheduleDateLabel(
  date: Date,
  baseDate: Date,
  displayMode: ScheduleDisplayMode,
  prefix?: string
) {
  const value =
    displayMode === "tOffsets"
      ? `T${differenceInDays(date, baseDate)}`
      : format(date, "MMM dd");
  return prefix ? `${prefix} ${value}` : value;
}

export function scheduleDateRangeLabel({
  baseDate,
  displayMode,
  endAt,
  startAt,
}: {
  baseDate: Date;
  displayMode: ScheduleDisplayMode;
  endAt: Date;
  startAt: Date;
}) {
  if (displayMode === "tOffsets") {
    return `T${differenceInDays(startAt, baseDate)} - T${differenceInDays(
      endAt,
      baseDate
    )}`;
  }
  return `${format(startAt, "MMM d")} - ${format(endAt, "MMM d")}`;
}

export function initialScheduleBaseDate(milestones: Milestone[]) {
  const firstStart = milestones
    .map((milestone) => milestone.startAt)
    .sort((left, right) => left.getTime() - right.getTime())[0];

  return firstStart ?? new Date();
}

export const milestoneToFeature = (milestone: Milestone): GanttFeature => ({
  id: milestone.id,
  name: milestone.name,
  startAt: milestone.startAt,
  endAt: milestone.endAt,
  lane: milestone.lane,
  status: {
    id: milestone.status,
    name: statusLabels[milestone.status],
    color: statusColors[milestone.status],
  },
});
