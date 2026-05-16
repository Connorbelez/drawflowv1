import type {
  TimelineItem,
  TimelineRange,
} from "#/components/roadmap/AnimatedCurvedTimeline.tsx";
import {
  type ActiveMilestoneSelection,
  DEFAULT_MILESTONE_DURATION_DAYS,
  normalizeMilestoneSchedule,
} from "./-timeline-milestone-schedule.ts";

export type DemoStatus = "complete" | "ready" | "review" | "upcoming";

export type IsometricIconKey =
  | "change"
  | "closeout"
  | "drywall"
  | "exterior"
  | "finishes"
  | "foundation"
  | "framing"
  | "roughIn";

export interface DemoMilestone {
  amount: number;
  completionPaymentAmount?: number;
  draw: string;
  drawX?: number;
  durationDays: number;
  evidence: string;
  icon: IsometricIconKey;
  initialPaymentAmount?: number;
  name: string;
  policy: string;
  status: DemoStatus;
  subMilestones: string[];
}

export interface DemoDraw {
  amount: number;
  customDate?: boolean;
  id: string;
  itemId?: string;
  label: string;
  x: number;
}

export interface DemoCapitalSpike {
  amount: number;
  id: string;
  label: string;
  x: number;
}

export type DemoTimelineSnapshotItem = Omit<
  TimelineItem<DemoMilestone>,
  "data"
> & {
  data: DemoMilestone;
};

export interface TimelineShareSnapshotV2 {
  activeSelection: ActiveMilestoneSelection;
  capitalSpikes: DemoCapitalSpike[];
  draws: DemoDraw[];
  items: DemoTimelineSnapshotItem[];
  payloadVersion: 2;
  progressValue: number;
  range: TimelineRange;
  selectedPanelOpen: boolean;
  snapshotSummary: string;
  startingCash: number;
  straightLine: boolean;
  title: string;
}

export interface TimelineShareSnapshotInput {
  activeSelection: ActiveMilestoneSelection;
  capitalSpikes: DemoCapitalSpike[];
  draws: DemoDraw[];
  items: TimelineItem<DemoMilestone>[];
  progressValue: number;
  range: TimelineRange;
  selectedPanelOpen: boolean;
  startingCash: number;
  straightLine: boolean;
  title?: string;
}

export interface TimelineShareState {
  activeSelection: ActiveMilestoneSelection;
  capitalSpikes: DemoCapitalSpike[];
  draws: DemoDraw[];
  items: TimelineItem<DemoMilestone>[];
  progressValue: number;
  range: TimelineRange;
  selectedPanelOpen: boolean;
  startingCash: number;
  straightLine: boolean;
}

const DEFAULT_TITLE = "Elm Street build draw roadmap";
const FALLBACK_RANGE: TimelineRange = {
  max: 230,
  min: 0,
  unit: "days",
};

export function buildTimelineShareSnapshotV2(
  input: TimelineShareSnapshotInput
): TimelineShareSnapshotV2 {
  const range = normalizeShareRange(input.range);
  const items = normalizeShareItems(input.items);
  const draws = normalizeShareDraws(input.draws);
  const capitalSpikes = normalizeShareCapitalSpikes(input.capitalSpikes);
  const activeSelection = resolveActiveSelection(input.activeSelection, items);
  const progressValue = normalizeNumber(input.progressValue, range.min);
  const startingCash = Math.max(
    0,
    Math.round(normalizeNumber(input.startingCash, 400_000))
  );
  const title = (input.title ?? DEFAULT_TITLE).trim() || DEFAULT_TITLE;

  return {
    activeSelection,
    capitalSpikes,
    draws,
    items,
    payloadVersion: 2,
    progressValue,
    range,
    selectedPanelOpen: input.selectedPanelOpen,
    snapshotSummary: summarizeTimelineSnapshot(
      items,
      draws,
      capitalSpikes,
      range
    ),
    startingCash,
    straightLine: input.straightLine,
    title,
  };
}

export function applyTimelineShareSnapshotV2(
  snapshot: unknown,
  fallback: TimelineShareState
): TimelineShareState {
  const fallbackState = normalizeTimelineShareState(fallback);
  const candidate =
    snapshot && typeof snapshot === "object"
      ? (snapshot as Partial<TimelineShareSnapshotV2> & {
          payloadVersion?: unknown;
        })
      : {};

  if (candidate.payloadVersion !== 2) {
    return fallbackState;
  }

  const range = normalizeShareRange(candidate.range ?? fallbackState.range);
  const items = normalizeShareItems(candidate.items ?? fallbackState.items);

  if (items.length === 0) {
    return fallbackState;
  }

  const draws = normalizeShareDraws(candidate.draws ?? fallbackState.draws);
  const capitalSpikes = normalizeShareCapitalSpikes(
    candidate.capitalSpikes ?? fallbackState.capitalSpikes
  );
  const activeSelection = resolveActiveSelection(
    candidate.activeSelection,
    items
  );

  return {
    activeSelection,
    capitalSpikes,
    draws,
    items,
    progressValue: normalizeNumber(candidate.progressValue, range.min),
    range,
    selectedPanelOpen:
      candidate.selectedPanelOpen ?? fallbackState.selectedPanelOpen,
    startingCash: Math.max(
      0,
      Math.round(
        normalizeNumber(candidate.startingCash, fallbackState.startingCash)
      )
    ),
    straightLine: candidate.straightLine ?? fallbackState.straightLine,
  };
}

export function initialTimelineShareState(
  items: TimelineItem<DemoMilestone>[],
  draws: DemoDraw[],
  capitalSpikes: DemoCapitalSpike[],
  range: TimelineRange,
  activeSelection: ActiveMilestoneSelection,
  progressValue: number,
  selectedPanelOpen: boolean,
  startingCash: number,
  straightLine: boolean
): TimelineShareState {
  return {
    activeSelection,
    capitalSpikes,
    draws,
    items,
    progressValue,
    range,
    selectedPanelOpen,
    startingCash,
    straightLine,
  };
}

function normalizeTimelineShareState(
  state: TimelineShareState
): TimelineShareState {
  const range = normalizeShareRange(state.range);
  const items = normalizeShareItems(state.items);

  return {
    activeSelection: resolveActiveSelection(state.activeSelection, items),
    capitalSpikes: normalizeShareCapitalSpikes(state.capitalSpikes),
    draws: normalizeShareDraws(state.draws),
    items,
    progressValue: normalizeNumber(state.progressValue, range.min),
    range,
    selectedPanelOpen: state.selectedPanelOpen,
    startingCash: Math.max(
      0,
      Math.round(normalizeNumber(state.startingCash, 400_000))
    ),
    straightLine: state.straightLine,
  };
}

function normalizeShareItems(
  items: TimelineItem<DemoMilestone>[]
): DemoTimelineSnapshotItem[] {
  return items
    .filter((item) => item.id.trim().length > 0 && Number.isFinite(item.x))
    .map((item, index) => ({
      data: normalizeMilestoneData(item.data, index),
      ...(item.disabled === undefined ? {} : { disabled: item.disabled }),
      eyebrow: item.eyebrow,
      id: item.id,
      label: item.label,
      lane: Number.isFinite(item.lane) ? item.lane : 0,
      markerLabel: item.markerLabel,
      tone: item.tone,
      x: normalizeNumber(item.x, 0),
    }))
    .sort((a, b) => a.x - b.x || a.id.localeCompare(b.id));
}

function normalizeMilestoneData(
  data: DemoMilestone | undefined,
  index: number
): DemoMilestone {
  const normalized = normalizeMilestoneSchedule({
    amount: Math.max(0, Math.round(normalizeNumber(data?.amount, 0))),
    completionPaymentAmount: data?.completionPaymentAmount,
    draw: data?.draw?.trim() || `Draw ${index + 1}`,
    drawX:
      data?.drawX === undefined
        ? undefined
        : Math.max(0, normalizeNumber(data.drawX, 0)),
    durationDays: data?.durationDays ?? DEFAULT_MILESTONE_DURATION_DAYS,
    evidence: data?.evidence?.trim() || "Draft package",
    icon: data?.icon ?? "change",
    initialPaymentAmount: data?.initialPaymentAmount,
    name: data?.name?.trim() || `Milestone ${index + 1}`,
    policy: data?.policy?.trim() || "Needs review",
    status: data?.status ?? "upcoming",
    subMilestones: normalizeShareSubMilestones(data?.subMilestones, index),
  });

  return {
    amount: normalized.amount,
    ...(data?.completionPaymentAmount === undefined
      ? {}
      : { completionPaymentAmount: normalized.completionPaymentAmount }),
    draw: normalized.draw,
    ...(normalized.drawX === undefined ? {} : { drawX: normalized.drawX }),
    durationDays: normalized.durationDays,
    evidence: normalized.evidence,
    icon: normalized.icon,
    ...(data?.initialPaymentAmount === undefined
      ? {}
      : { initialPaymentAmount: normalized.initialPaymentAmount }),
    name: normalized.name,
    policy: normalized.policy,
    status: normalized.status,
    subMilestones: normalized.subMilestones,
  };
}

function normalizeShareDraws(draws: DemoDraw[]): DemoDraw[] {
  return draws
    .filter((draw) => draw.id.trim().length > 0 && Number.isFinite(draw.x))
    .map((draw, index) => ({
      amount: Math.max(0, Math.round(normalizeNumber(draw.amount, 0))),
      ...(draw.customDate === undefined ? {} : { customDate: draw.customDate }),
      id: draw.id,
      ...(draw.itemId === undefined ? {} : { itemId: draw.itemId }),
      label: draw.label.trim() || `Draw ${index + 1}`,
      x: normalizeNumber(draw.x, 0),
    }))
    .sort((a, b) => a.x - b.x || a.id.localeCompare(b.id));
}

function normalizeShareCapitalSpikes(
  capitalSpikes: DemoCapitalSpike[] | undefined
): DemoCapitalSpike[] {
  return (capitalSpikes ?? [])
    .filter((spike) => spike.id.trim().length > 0 && Number.isFinite(spike.x))
    .map((spike, index) => ({
      amount: Math.max(0, Math.round(normalizeNumber(spike.amount, 0))),
      id: spike.id,
      label: spike.label.trim() || `Capital spike ${index + 1}`,
      x: normalizeNumber(spike.x, 0),
    }))
    .sort((a, b) => a.x - b.x || a.id.localeCompare(b.id));
}

function normalizeShareSubMilestones(
  subMilestones: string[] | undefined,
  index: number
): string[] {
  const normalized = (subMilestones ?? [])
    .map((subMilestone) => subMilestone.trim())
    .filter(Boolean)
    .slice(0, 6);

  return normalized.length > 0
    ? normalized
    : [`Scope ${index + 1}`, "Budget alignment", "Schedule planning"];
}

function normalizeShareRange(range: TimelineRange): TimelineRange {
  const min = normalizeNumber(range.min, FALLBACK_RANGE.min);
  const max = Math.max(min, normalizeNumber(range.max, FALLBACK_RANGE.max));

  return {
    max,
    min,
    unit: range.unit?.trim() || FALLBACK_RANGE.unit,
  };
}

function normalizeNumber(value: number | undefined, fallback: number): number {
  return Number.isFinite(value) ? Number(value) : fallback;
}

export function resolveActiveSelection(
  activeSelection: ActiveMilestoneSelection | undefined,
  items: TimelineItem<DemoMilestone>[]
): ActiveMilestoneSelection {
  const validSelection =
    activeSelection && items.some((item) => item.id === activeSelection.itemId)
      ? activeSelection
      : undefined;
  const itemId = validSelection?.itemId ?? items[0]?.id ?? "";
  const phase =
    validSelection?.phase === "complete"
      ? "complete"
      : "inProgress";

  return { itemId, phase };
}

function summarizeTimelineSnapshot(
  items: TimelineItem<DemoMilestone>[],
  draws: DemoDraw[],
  capitalSpikes: DemoCapitalSpike[],
  range: TimelineRange
): string {
  return `${items.length} milestones · ${draws.length} draws · ${
    capitalSpikes.length
  } spikes · ${Math.round(range.min)}-${Math.round(range.max)} ${
    range.unit ?? "days"
  }`;
}
