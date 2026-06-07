import type {
  TimelineItem,
  TimelineRange,
} from "#/components/roadmap/AnimatedCurvedTimeline.tsx";
import {
  coerceSiteVisitGuidance,
  isSiteVisitGuidanceHtmlEmpty,
  type SiteVisitGuidanceHtml,
} from "#/lib/site-visit-guidance.ts";
import {
  type ActiveMilestoneSelection,
  DEFAULT_MILESTONE_DURATION_DAYS,
  normalizeMilestoneSchedule,
} from "./-timeline-milestone-schedule.ts";
import {
  type DemoSubmilestone,
  submilestoneNames,
} from "./-timeline-milestone-submilestones.ts";

export type { DemoSubmilestone } from "./-timeline-milestone-submilestones.ts";

export type DemoStatus = "complete" | "ready" | "upcoming";

export const TOTAL_REIMBURSEMENT_BPS = 10_000;
export const DEFAULT_BORROWER_CO_PAY_BPS = 2000;

export const ISOMETRIC_ICON_KEYS = [
  "change",
  "closeout",
  "drywall",
  "exterior",
  "finishes",
  "foundation",
  "framing",
  "kitchen",
  "plumbing",
  "roofing",
  "roughIn",
] as const;

export type IsometricIconKey = (typeof ISOMETRIC_ICON_KEYS)[number];

export interface DemoMilestone {
  amount: number;
  completionClaim?: DemoCompletionClaim;
  completionPaymentAmount?: number;
  completionReview?: DemoCompletionReview;
  draw: string;
  drawAvailabilityAmount?: number;
  drawX?: number;
  durationDays: number;
  evidence: string;
  evidencePackage?: DemoEvidencePackage;
  icon: IsometricIconKey;
  initialPaymentAmount?: number;
  name: string;
  policy: string;
  siteVisitGuidance?: {
    cameraAngles: string | string[];
    whatToVerify: string | string[];
  };
  status: DemoStatus;
  subMilestones: string[];
  submilestoneDetails?: DemoSubmilestone[];
}

export function normalizeBorrowerCoPayBps(value: number | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return DEFAULT_BORROWER_CO_PAY_BPS;
  }

  return Math.min(TOTAL_REIMBURSEMENT_BPS, Math.max(0, Math.round(value)));
}

export function getReimbursementBps(value: number | undefined) {
  return TOTAL_REIMBURSEMENT_BPS - normalizeBorrowerCoPayBps(value);
}

export function calculateDrawAvailabilityAmount(
  budgetAmount: number,
  coPayBps: number | undefined
) {
  const reimbursementBps = getReimbursementBps(coPayBps);

  return Math.max(
    0,
    Math.round(
      (Math.max(0, budgetAmount) * reimbursementBps) / TOTAL_REIMBURSEMENT_BPS
    )
  );
}

export function getMilestoneDrawAvailabilityAmount(
  milestone: DemoMilestone | undefined
) {
  if (!milestone) {
    return 0;
  }

  if (Number.isFinite(milestone.drawAvailabilityAmount)) {
    return Math.max(0, Math.round(milestone.drawAvailabilityAmount ?? 0));
  }

  return calculateDrawAvailabilityAmount(
    milestone.amount,
    DEFAULT_BORROWER_CO_PAY_BPS
  );
}

export interface DemoCompletionClaim {
  actualCost?: number;
  completedDay: number;
  note?: string;
  submittedAt: string;
}

export interface DemoCompletionReview {
  note?: string;
  reviewedAt: string;
  siteVisit?: DemoSiteVisitRequest;
  status: "approved" | "revisionRequested";
}

export interface DemoSiteVisitRequest {
  includedItemIds?: string[];
  note?: string;
  requestedAt: string;
  requestedDay: number;
  status?: string;
  tokenExpiresAt?: number;
  url?: string;
  visitId?: string;
}

export interface DemoEvidenceAsset {
  fileName: string;
  id: string;
  label: string;
  mimeType: string;
  previewUrl?: string;
  size: number;
  tag: string;
}

export interface DemoEvidencePackage {
  assets: DemoEvidenceAsset[];
}

export interface DemoDraw {
  amount: number;
  customDate?: boolean;
  id: string;
  itemId?: string;
  label: string;
  requestedAt?: string;
  requestNote?: string;
  requestReviewNote?: string;
  requestStatus?: "approved" | "draft" | "rejected" | "requested";
  reviewedAt?: string;
  x: number;
}

export interface DemoCapitalSpike {
  amount: number;
  eventKind?: "cashInfusion" | "cost";
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
  currentDay: number;
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
  currentDay: number;
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
  currentDay: number;
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
  const currentDay = normalizeNumber(input.currentDay, range.min);
  const progressValue = normalizeNumber(input.progressValue, range.min);
  const startingCash = Math.max(
    0,
    Math.round(normalizeNumber(input.startingCash, 400_000))
  );
  const title = (input.title ?? DEFAULT_TITLE).trim() || DEFAULT_TITLE;

  return {
    activeSelection,
    capitalSpikes,
    currentDay,
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
    currentDay: normalizeNumber(candidate.currentDay, fallbackState.currentDay),
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
  currentDay: number,
  selectedPanelOpen: boolean,
  startingCash: number,
  straightLine: boolean
): TimelineShareState {
  return {
    activeSelection,
    capitalSpikes,
    currentDay,
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
    currentDay: normalizeNumber(state.currentDay, range.min),
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
    drawAvailabilityAmount: data?.drawAvailabilityAmount,
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
    siteVisitGuidance: normalizeSiteVisitGuidance(data?.siteVisitGuidance),
    status: data?.status ?? "upcoming",
    subMilestones: normalizeShareSubMilestones(data?.subMilestones, index),
  });
  const submilestoneDetails = data?.submilestoneDetails?.length
    ? [...data.submilestoneDetails].sort((a, b) => a.order - b.order)
    : undefined;

  return {
    amount: normalized.amount,
    ...(data?.completionClaim === undefined
      ? {}
      : { completionClaim: normalizeCompletionClaim(data.completionClaim) }),
    ...(data?.completionPaymentAmount === undefined
      ? {}
      : { completionPaymentAmount: normalized.completionPaymentAmount }),
    ...(data?.completionReview === undefined
      ? {}
      : { completionReview: normalizeCompletionReview(data.completionReview) }),
    draw: normalized.draw,
    ...(data?.drawAvailabilityAmount === undefined
      ? {}
      : {
          drawAvailabilityAmount: Math.max(
            0,
            Math.round(normalizeNumber(data.drawAvailabilityAmount, 0))
          ),
        }),
    ...(normalized.drawX === undefined ? {} : { drawX: normalized.drawX }),
    durationDays: normalized.durationDays,
    evidence: normalized.evidence,
    ...(data?.evidencePackage === undefined
      ? {}
      : { evidencePackage: normalizeEvidencePackage(data.evidencePackage) }),
    icon: normalized.icon,
    ...(data?.initialPaymentAmount === undefined
      ? {}
      : { initialPaymentAmount: normalized.initialPaymentAmount }),
    name: normalized.name,
    policy: normalized.policy,
    ...(normalized.siteVisitGuidance ? { siteVisitGuidance: normalized.siteVisitGuidance } : {}),
    status: normalized.status,
    subMilestones: submilestoneDetails
      ? submilestoneNames(submilestoneDetails)
      : normalized.subMilestones,
    ...(submilestoneDetails ? { submilestoneDetails } : {}),
  };
}

function normalizeCompletionClaim(
  claim: DemoCompletionClaim | undefined
): DemoCompletionClaim | undefined {
  if (!claim) {
    return;
  }

  const actualCost =
    claim.actualCost === undefined
      ? undefined
      : Math.max(0, Math.round(normalizeNumber(claim.actualCost, 0)));
  const note = claim.note?.trim();

  return {
    ...(actualCost === undefined ? {} : { actualCost }),
    completedDay: Math.max(
      0,
      Math.round(normalizeNumber(claim.completedDay, 0))
    ),
    ...(note ? { note } : {}),
    submittedAt: claim.submittedAt.trim() || new Date(0).toISOString(),
  };
}

function normalizeCompletionReview(
  review: DemoCompletionReview | undefined
): DemoCompletionReview | undefined {
  if (!review) {
    return;
  }

  const note = review.note?.trim();
  const siteVisit = normalizeSiteVisitRequest(review.siteVisit);

  return {
    ...(note ? { note } : {}),
    reviewedAt: review.reviewedAt.trim() || new Date(0).toISOString(),
    ...(siteVisit ? { siteVisit } : {}),
    status:
      review.status === "revisionRequested" ? "revisionRequested" : "approved",
  };
}

function normalizeSiteVisitRequest(
  siteVisit: DemoSiteVisitRequest | undefined
): DemoSiteVisitRequest | undefined {
  if (!siteVisit) {
    return;
  }

  const note = siteVisit.note?.trim();
  const includedItemIds = Array.from(
    new Set(
      (siteVisit.includedItemIds ?? []).map((id) => id.trim()).filter(Boolean)
    )
  );
  const status = siteVisit.status?.trim();
  const url = siteVisit.url?.trim();
  const visitId = siteVisit.visitId?.trim();

  return {
    ...(includedItemIds.length ? { includedItemIds } : {}),
    ...(note ? { note } : {}),
    requestedAt: siteVisit.requestedAt.trim() || new Date(0).toISOString(),
    requestedDay: Math.max(
      0,
      Math.round(normalizeNumber(siteVisit.requestedDay, 0))
    ),
    ...(status ? { status } : {}),
    ...(siteVisit.tokenExpiresAt === undefined
      ? {}
      : { tokenExpiresAt: normalizeNumber(siteVisit.tokenExpiresAt, 0) }),
    ...(url ? { url } : {}),
    ...(visitId ? { visitId } : {}),
  };
}

function normalizeEvidencePackage(
  evidencePackage: DemoEvidencePackage | undefined
): DemoEvidencePackage | undefined {
  const assets = (evidencePackage?.assets ?? [])
    .filter((asset) => asset.id.trim() && asset.fileName.trim())
    .map((asset, index) => {
      const label = asset.label.trim() || `Evidence image ${index + 1}`;
      const tag = asset.tag.trim() || "Milestone";

      return {
        fileName: asset.fileName.trim(),
        id: asset.id,
        label,
        mimeType: asset.mimeType.trim() || "image/*",
        size: Math.max(0, Math.round(normalizeNumber(asset.size, 0))),
        tag,
      };
    });

  return { assets };
}

function normalizeShareDraws(draws: DemoDraw[]): DemoDraw[] {
  return draws
    .filter((draw) => draw.id.trim().length > 0 && Number.isFinite(draw.x))
    .map((draw, index) => {
      const requestNote = draw.requestNote?.trim();
      const requestReviewNote = draw.requestReviewNote?.trim();
      const requestedAt = draw.requestedAt?.trim();
      const reviewedAt = draw.reviewedAt?.trim();
      const requestStatus = normalizeDrawRequestStatus(draw.requestStatus);

      return {
        amount: Math.max(0, Math.round(normalizeNumber(draw.amount, 0))),
        ...(draw.customDate === undefined
          ? {}
          : { customDate: draw.customDate }),
        id: draw.id,
        ...(draw.itemId === undefined ? {} : { itemId: draw.itemId }),
        label: draw.label.trim() || `Draw ${index + 1}`,
        ...(requestReviewNote ? { requestReviewNote } : {}),
        ...(requestNote ? { requestNote } : {}),
        ...(requestStatus ? { requestStatus } : {}),
        ...(reviewedAt ? { reviewedAt } : {}),
        ...(requestedAt ? { requestedAt } : {}),
        x: normalizeNumber(draw.x, 0),
      };
    })
    .sort((a, b) => a.x - b.x || a.id.localeCompare(b.id));
}

function normalizeDrawRequestStatus(
  status: DemoDraw["requestStatus"] | undefined
) {
  return status === "requested" ||
    status === "approved" ||
    status === "rejected"
    ? status
    : undefined;
}

function normalizeShareCapitalSpikes(
  capitalSpikes: DemoCapitalSpike[] | undefined
): DemoCapitalSpike[] {
  return (capitalSpikes ?? [])
    .filter((spike) => spike.id.trim().length > 0 && Number.isFinite(spike.x))
    .map((spike, index) => ({
      amount: Math.max(0, Math.round(normalizeNumber(spike.amount, 0))),
      eventKind: spike.eventKind === "cashInfusion" ? "cashInfusion" : "cost",
      id: spike.id,
      label:
        spike.label.trim() ||
        (spike.eventKind === "cashInfusion"
          ? `Cash infusion ${index + 1}`
          : `Capital spike ${index + 1}`),
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

function normalizeSiteVisitGuidance(
  guidance: DemoMilestone["siteVisitGuidance"] | undefined
): SiteVisitGuidanceHtml | undefined {
  if (!guidance) {
    return undefined;
  }
  const normalized = coerceSiteVisitGuidance(guidance);
  if (isSiteVisitGuidanceHtmlEmpty(normalized)) {
    return undefined;
  }
  return normalized;
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
    validSelection?.phase === "complete" ? "complete" : "inProgress";

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
