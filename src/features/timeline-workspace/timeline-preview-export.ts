import type {
  TimelineItem,
  TimelineRange,
} from "#/components/roadmap/AnimatedCurvedTimeline.tsx";
import {
  getMilestoneEndX,
  getMilestonePaymentSchedule,
} from "./-timeline-milestone-schedule.ts";
import {
  resolveMilestoneSubmilestones,
  type DemoSubmilestone,
} from "./-timeline-milestone-submilestones.ts";
import {
  applyTimelineShareSnapshotV2,
  type DemoCapitalSpike,
  type DemoDraw,
  type DemoMilestone,
  getMilestoneDrawAvailabilityAmount,
  initialTimelineShareState,
  type TimelineShareSnapshotV2,
  type TimelineShareState,
} from "./-timeline-share-snapshot.ts";
import { normalizeTimelineShareStateForRoute } from "./TimelineWorkspace.tsx";

export interface TimelinePreviewSubmilestone {
  budgetDollars: number | null;
  description: string;
  durationDays: number | null;
  key: string;
  name: string;
  order: number;
  status: string;
}

export interface TimelinePreviewMilestone {
  amountDollars: number;
  dayEnd: number;
  dayStart: number;
  drawAvailabilityDollars: number;
  drawLabel: string;
  durationDays: number;
  evidence: string;
  id: string;
  name: string;
  order: number;
  paymentCompletionDollars: number;
  paymentInitialDollars: number;
  policy: string;
  status: DemoMilestone["status"];
  submilestones: TimelinePreviewSubmilestone[];
}

export interface TimelinePreviewDraw {
  amountDollars: number;
  customDate: boolean;
  day: number;
  id: string;
  label: string;
  linkedMilestoneId: string;
  linkedMilestoneName: string;
  requestStatus: string;
}

export interface TimelinePreviewCapitalEvent {
  amountDollars: number;
  day: number;
  id: string;
  label: string;
  type: "Capital cost" | "Cash infusion";
}

export interface TimelinePreviewModel {
  capitalEvents: TimelinePreviewCapitalEvent[];
  draws: TimelinePreviewDraw[];
  durationDays: number;
  milestones: TimelinePreviewMilestone[];
  minimumCashReserveDollars: number;
  range: Required<TimelineRange>;
  snapshotSummary: string;
  startingCashDollars: number;
  state: TimelineShareState;
  title: string;
  totalDrawDollars: number;
  totalMilestoneBudgetDollars: number;
  totalSubmilestoneBudgetDollars: number;
}

type TimelinePreviewSnapshotCandidate = Partial<TimelineShareSnapshotV2> & {
  payloadVersion?: unknown;
  snapshotSummary?: unknown;
  title?: unknown;
};

const DEFAULT_PREVIEW_TITLE = "DrawFlow proposal preview";
const DEFAULT_PREVIEW_RANGE: Required<TimelineRange> = {
  max: 230,
  min: 0,
  unit: "days",
};

export function buildTimelinePreviewModel(
  snapshot: unknown
): TimelinePreviewModel | null {
  const candidate = toTimelinePreviewSnapshotCandidate(snapshot);

  if (!candidate || candidate.payloadVersion !== 2) {
    return null;
  }

  const items = arrayOrEmpty<TimelineItem<DemoMilestone>>(candidate.items);

  if (items.length === 0) {
    return null;
  }

  const fallback = initialTimelineShareState(
    items,
    arrayOrEmpty<DemoDraw>(candidate.draws),
    arrayOrEmpty<DemoCapitalSpike>(candidate.capitalSpikes),
    normalizePreviewRange(candidate.range),
    normalizePreviewActiveSelection(candidate.activeSelection, items),
    numberOr(candidate.progressValue, items[0]?.x ?? 0),
    numberOr(candidate.currentDay, 0),
    Boolean(candidate.selectedPanelOpen),
    numberOr(candidate.startingCash, 0),
    candidate.straightLine ?? true,
    numberOr(candidate.minimumCashReserve, 0)
  );
  const state = normalizeTimelineShareStateForRoute(
    applyTimelineShareSnapshotV2(candidate, fallback)
  );
  const range = normalizePreviewRange(state.range);
  const milestones = state.items.map((item, index) =>
    buildPreviewMilestone(item, index)
  );
  const milestoneById = new Map(
    milestones.map((milestone) => [milestone.id, milestone])
  );
  const draws = state.draws
    .map((draw) => {
      const linkedMilestone = draw.itemId
        ? milestoneById.get(draw.itemId)
        : undefined;

      return {
        amountDollars: draw.amount,
        customDate: Boolean(draw.customDate),
        day: Math.round(draw.x),
        id: draw.id,
        label: draw.label,
        linkedMilestoneId: draw.itemId ?? "",
        linkedMilestoneName: linkedMilestone?.name ?? "",
        requestStatus: draw.requestStatus ?? "planned",
      } satisfies TimelinePreviewDraw;
    })
    .sort((a, b) => a.day - b.day || a.id.localeCompare(b.id));
  const capitalEvents = state.capitalSpikes
    .map((event) => ({
      amountDollars: event.amount,
      day: Math.round(event.x),
      id: event.id,
      label: event.label,
      type:
        event.eventKind === "cashInfusion" ? "Cash infusion" : "Capital cost",
    }))
    .sort((a, b) => a.day - b.day || a.id.localeCompare(b.id));
  const title =
    typeof candidate.title === "string" && candidate.title.trim()
      ? candidate.title.trim()
      : DEFAULT_PREVIEW_TITLE;
  const snapshotSummary =
    typeof candidate.snapshotSummary === "string" &&
    candidate.snapshotSummary.trim()
      ? candidate.snapshotSummary.trim()
      : `${milestones.length} milestones · ${draws.length} draws`;

  return {
    capitalEvents,
    draws,
    durationDays: Math.max(0, Math.round(range.max - range.min)),
    milestones,
    minimumCashReserveDollars: state.minimumCashReserve,
    range,
    snapshotSummary,
    startingCashDollars: state.startingCash,
    state,
    title,
    totalDrawDollars: draws.reduce(
      (total, draw) => total + draw.amountDollars,
      0
    ),
    totalMilestoneBudgetDollars: milestones.reduce(
      (total, milestone) => total + milestone.amountDollars,
      0
    ),
    totalSubmilestoneBudgetDollars: milestones.reduce(
      (total, milestone) =>
        total +
        milestone.submilestones.reduce(
          (subTotal, submilestone) =>
            subTotal + (submilestone.budgetDollars ?? 0),
          0
        ),
      0
    ),
  };
}

export function buildTimelinePreviewCsv(model: TimelinePreviewModel): string {
  const rows: CsvValue[][] = [
    [
      "section",
      "type",
      "milestone_order",
      "milestone_id",
      "milestone_name",
      "submilestone_order",
      "submilestone_name",
      "draw_id",
      "label",
      "day_start",
      "day_end",
      "duration_days",
      "amount_usd",
      "draw_availability_usd",
      "status",
      "policy",
      "evidence",
      "notes",
    ],
  ];

  for (const milestone of model.milestones) {
    rows.push([
      "Building budget",
      "Milestone",
      milestone.order,
      milestone.id,
      milestone.name,
      "",
      "",
      "",
      milestone.drawLabel,
      milestone.dayStart,
      milestone.dayEnd,
      milestone.durationDays,
      milestone.amountDollars,
      milestone.drawAvailabilityDollars,
      milestone.status,
      milestone.policy,
      milestone.evidence,
      `Initial payment ${milestone.paymentInitialDollars}; distributed spend ${Math.max(
        0,
        milestone.amountDollars -
          milestone.paymentInitialDollars -
          milestone.paymentCompletionDollars
      )}; completion payment ${milestone.paymentCompletionDollars}`,
    ]);

    for (const submilestone of milestone.submilestones) {
      rows.push([
        "Building budget",
        "Sub-milestone",
        milestone.order,
        milestone.id,
        milestone.name,
        submilestone.order,
        submilestone.name,
        "",
        submilestone.name,
        "",
        "",
        submilestone.durationDays ?? "",
        submilestone.budgetDollars ?? "",
        "",
        submilestone.status,
        "",
        "",
        submilestone.description,
      ]);
    }
  }

  for (const milestone of model.milestones) {
    rows.push([
      "Timeline",
      "Milestone window",
      milestone.order,
      milestone.id,
      milestone.name,
      "",
      "",
      "",
      milestone.name,
      milestone.dayStart,
      milestone.dayEnd,
      milestone.durationDays,
      milestone.amountDollars,
      milestone.drawAvailabilityDollars,
      milestone.status,
      milestone.policy,
      milestone.evidence,
      "",
    ]);
  }

  for (const event of model.capitalEvents) {
    rows.push([
      "Timeline",
      event.type,
      "",
      "",
      "",
      "",
      "",
      event.id,
      event.label,
      event.day,
      event.day,
      0,
      event.amountDollars,
      "",
      "planned",
      "",
      "",
      event.type,
    ]);
  }

  for (const draw of model.draws) {
    rows.push([
      "Draw schedule",
      "Reimbursement draw",
      "",
      draw.linkedMilestoneId,
      draw.linkedMilestoneName,
      "",
      "",
      draw.id,
      draw.label,
      draw.day,
      draw.day,
      0,
      draw.amountDollars,
      "",
      draw.requestStatus,
      "Reimbursement only",
      "",
      draw.customDate ? "Custom draw date" : "Milestone-linked draw",
    ]);
  }

  return rows.map((row) => row.map(escapeCsvCell).join(",")).join("\n");
}

export function buildTimelinePreviewCsvFilename(
  title: string,
  snapshotId?: string | null
) {
  const slug =
    title
      .toLowerCase()
      .replaceAll(/[^a-z0-9]+/g, "-")
      .replaceAll(/^-|-$/g, "")
      .slice(0, 48) || "drawflow-proposal-preview";
  const suffix = snapshotId?.slice(0, 8);

  return `${slug}${suffix ? `-${suffix}` : ""}.csv`;
}

function buildPreviewMilestone(
  item: TimelineItem<DemoMilestone>,
  index: number
): TimelinePreviewMilestone {
  const data = item.data;
  const fallbackMilestone: DemoMilestone = {
    amount: 0,
    draw: `Draw ${index + 1}`,
    durationDays: 1,
    evidence: "Planning",
    icon: "change",
    name: item.label ?? `Milestone ${index + 1}`,
    policy: "Planning",
    status: "upcoming",
    subMilestones: [],
  };
  const milestone = data ?? fallbackMilestone;
  const submilestones = resolveMilestoneSubmilestones(milestone, item.id).map(
    (submilestone) => buildPreviewSubmilestone(submilestone)
  );
  const paymentSchedule = getMilestonePaymentSchedule(item);
  const dayStart = Math.round(item.x);
  const dayEnd = Math.round(getMilestoneEndX(item));

  return {
    amountDollars: milestone.amount,
    dayEnd,
    dayStart,
    drawAvailabilityDollars: getMilestoneDrawAvailabilityAmount(milestone),
    drawLabel: milestone.draw,
    durationDays: Math.max(1, dayEnd - dayStart),
    evidence: milestone.evidence,
    id: item.id,
    name: milestone.name,
    order: index + 1,
    paymentCompletionDollars: paymentSchedule.completionPaymentAmount,
    paymentInitialDollars: paymentSchedule.initialPaymentAmount,
    policy: milestone.policy,
    status: milestone.status,
    submilestones,
  };
}

function buildPreviewSubmilestone(
  submilestone: DemoSubmilestone
): TimelinePreviewSubmilestone {
  return {
    budgetDollars:
      submilestone.budgetCents === undefined
        ? null
        : Math.round(submilestone.budgetCents / 100),
    description: submilestone.description ?? "",
    durationDays: submilestone.durationDays ?? null,
    key: submilestone.key,
    name: submilestone.name,
    order: submilestone.order,
    status: submilestone.status ?? "planned",
  };
}

function toTimelinePreviewSnapshotCandidate(
  snapshot: unknown
): TimelinePreviewSnapshotCandidate | null {
  return snapshot && typeof snapshot === "object"
    ? (snapshot as TimelinePreviewSnapshotCandidate)
    : null;
}

function normalizePreviewRange(
  range: TimelineRange | undefined
): Required<TimelineRange> {
  if (!range) {
    return DEFAULT_PREVIEW_RANGE;
  }

  const min = Number.isFinite(range.min)
    ? range.min
    : DEFAULT_PREVIEW_RANGE.min;
  const max =
    Number.isFinite(range.max) && range.max > min
      ? range.max
      : Math.max(min + 1, DEFAULT_PREVIEW_RANGE.max);

  return {
    max,
    min,
    unit: range.unit ?? DEFAULT_PREVIEW_RANGE.unit,
  };
}

function normalizePreviewActiveSelection(
  activeSelection: TimelineShareSnapshotV2["activeSelection"] | undefined,
  items: TimelineItem<DemoMilestone>[]
): TimelineShareState["activeSelection"] {
  if (
    activeSelection &&
    items.some((item) => item.id === activeSelection.itemId)
  ) {
    return activeSelection;
  }

  return {
    itemId: items[0]?.id ?? "",
    phase: "inProgress",
  };
}

function arrayOrEmpty<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

function numberOr(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

type CsvValue = number | string;

function escapeCsvCell(value: CsvValue): string {
  const text = String(value);

  if (!/[",\n\r]/.test(text)) {
    return text;
  }

  return `"${text.replaceAll('"', '""')}"`;
}
