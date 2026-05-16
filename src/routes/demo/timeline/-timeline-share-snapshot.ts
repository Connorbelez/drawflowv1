import type {
  TimelineItem,
  TimelineRange,
} from "#/components/roadmap/AnimatedCurvedTimeline.tsx";

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
  draw: string;
  drawX?: number;
  evidence: string;
  icon: IsometricIconKey;
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

export interface TimelineShareSnapshotV1 {
  activeItemId: string;
  capitalSpikes: DemoCapitalSpike[];
  draws: DemoDraw[];
  items: DemoTimelineSnapshotItem[];
  payloadVersion: 1;
  progressValue: number;
  range: TimelineRange;
  selectedPanelOpen: boolean;
  snapshotSummary: string;
  startingCash: number;
  straightLine: boolean;
  title: string;
}

export interface TimelineShareSnapshotInput {
  activeItemId: string;
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
  activeItemId: string;
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

export function buildTimelineShareSnapshotV1(
  input: TimelineShareSnapshotInput
): TimelineShareSnapshotV1 {
  const range = normalizeShareRange(input.range);
  const items = normalizeShareItems(input.items);
  const draws = normalizeShareDraws(input.draws);
  const capitalSpikes = normalizeShareCapitalSpikes(input.capitalSpikes);
  const activeItemId = resolveActiveItemId(input.activeItemId, items);
  const progressValue = normalizeNumber(input.progressValue, range.min);
  const startingCash = Math.max(
    0,
    Math.round(normalizeNumber(input.startingCash, 400_000))
  );
  const title = (input.title ?? DEFAULT_TITLE).trim() || DEFAULT_TITLE;

  return {
    activeItemId,
    capitalSpikes,
    draws,
    items,
    payloadVersion: 1,
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

export function applyTimelineShareSnapshotV1(
  snapshot: TimelineShareSnapshotV1,
  fallback: TimelineShareState
): TimelineShareState {
  const fallbackSnapshot = buildTimelineShareSnapshotV1(fallback);

  if (snapshot.payloadVersion !== 1) {
    return fallbackSnapshot;
  }

  const range = normalizeShareRange(snapshot.range);
  const items = normalizeShareItems(snapshot.items);
  const draws = normalizeShareDraws(snapshot.draws);
  const capitalSpikes = normalizeShareCapitalSpikes(
    snapshot.capitalSpikes ?? fallbackSnapshot.capitalSpikes
  );
  const activeItemId = resolveActiveItemId(snapshot.activeItemId, items);

  return {
    activeItemId,
    capitalSpikes,
    draws,
    items,
    progressValue: normalizeNumber(snapshot.progressValue, range.min),
    range,
    selectedPanelOpen: snapshot.selectedPanelOpen,
    startingCash: Math.max(
      0,
      Math.round(
        normalizeNumber(snapshot.startingCash, fallbackSnapshot.startingCash)
      )
    ),
    straightLine: snapshot.straightLine,
  };
}

export function initialTimelineShareState(
  items: TimelineItem<DemoMilestone>[],
  draws: DemoDraw[],
  capitalSpikes: DemoCapitalSpike[],
  range: TimelineRange,
  activeItemId: string,
  progressValue: number,
  selectedPanelOpen: boolean,
  startingCash: number,
  straightLine: boolean
): TimelineShareState {
  return {
    activeItemId,
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

function normalizeShareItems(
  items: TimelineItem<DemoMilestone>[]
): DemoTimelineSnapshotItem[] {
  return items
    .filter((item) => item.id.trim().length > 0 && Number.isFinite(item.x))
    .map((item, index) => ({
      data: normalizeMilestoneData(item.data, index),
      disabled: item.disabled,
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
  return {
    amount: Math.max(0, Math.round(normalizeNumber(data?.amount, 0))),
    draw: data?.draw?.trim() || `Draw ${index + 1}`,
    drawX:
      data?.drawX === undefined
        ? undefined
        : Math.max(0, normalizeNumber(data.drawX, 0)),
    evidence: data?.evidence?.trim() || "Draft package",
    icon: data?.icon ?? "change",
    name: data?.name?.trim() || `Milestone ${index + 1}`,
    policy: data?.policy?.trim() || "Needs review",
    status: data?.status ?? "upcoming",
    subMilestones: normalizeShareSubMilestones(data?.subMilestones, index),
  };
}

function normalizeShareDraws(draws: DemoDraw[]): DemoDraw[] {
  return draws
    .filter((draw) => draw.id.trim().length > 0 && Number.isFinite(draw.x))
    .map((draw, index) => ({
      amount: Math.max(0, Math.round(normalizeNumber(draw.amount, 0))),
      customDate: draw.customDate,
      id: draw.id,
      itemId: draw.itemId,
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

function resolveActiveItemId(
  activeItemId: string,
  items: TimelineItem<DemoMilestone>[]
): string {
  return items.some((item) => item.id === activeItemId)
    ? activeItemId
    : (items[0]?.id ?? "");
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
