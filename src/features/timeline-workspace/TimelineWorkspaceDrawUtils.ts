import type {
  TimelineItem,
  TimelineRange,
} from "#/components/roadmap/AnimatedCurvedTimeline.tsx";
import { getAccruedMilestoneDrawCapacity } from "./-timeline-draw-capacity.ts";
import {
  DEFAULT_BORROWER_CO_PAY_BPS,
  calculateDrawAvailabilityAmount,
  getMilestoneDrawAvailabilityAmount,
} from "./-timeline-share-snapshot.ts";
import type {
  DemoDraw,
  DemoMilestone,
  TimelineShareState,
} from "./-timeline-share-snapshot.ts";
import {
  getMilestoneEndX,
  resolveDefaultDrawX,
} from "./-timeline-milestone-schedule.ts";
import { resolveMilestoneSubmilestones } from "./-timeline-milestone-submilestones.ts";
import {
  dollarsToCents,
  expandTimelineRangeForMilestones,
  fileSizeFormatter,
  normalizeDemoRange,
} from "./TimelineWorkspaceDefaults.ts";
import type { DrawRequestLimit } from "./TimelineWorkspaceTypes.ts";

export function clampNumber(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export function isCurrentTimelineSharePath(shareUrlPath: string) {
  if (typeof window === "undefined") {
    return true;
  }
  return (
    normalizeSharePath(window.location.pathname) ===
    normalizeSharePath(shareUrlPath)
  );
}

export function normalizeSharePath(path: string) {
  const parsed = new URL(path, "http://drawflow.local");
  const pathname = parsed.pathname.replace(/\/+$/, "");
  return pathname || "/";
}

export function buildDemoDraws(
  items: TimelineItem<DemoMilestone>[],
  range: TimelineRange
): DemoDraw[] {
  const resolvedRange = normalizeDemoRange(range);

  return items
    .filter((item) => item.data)
    .sort((a, b) => a.x - b.x || a.id.localeCompare(b.id))
    .map((item) => createDemoDraw(item, resolvedRange));
}

export function syncDemoDrawsWithItems(
  draws: DemoDraw[],
  _items: TimelineItem<DemoMilestone>[],
  range: TimelineRange,
  options?: { preserveLabels?: boolean }
): DemoDraw[] {
  const resolvedRange = normalizeDemoRange(range);
  const clampedDraws = draws.map((draw) => ({
    ...draw,
    x: clampNumber(draw.x, resolvedRange.min, resolvedRange.max),
  }));
  return options?.preserveLabels
    ? sortTimelineDraws(clampedDraws)
    : relabelTimelineDraws(clampedDraws);
}

export function sortTimelineDraws(draws: DemoDraw[]) {
  return draws.slice().sort((a, b) => a.x - b.x || a.id.localeCompare(b.id));
}

export function normalizeDrawForOptimizationComparison(draw: DemoDraw) {
  return {
    amountCents: dollarsToCents(draw.amount),
    timingMilliDay: Math.round(draw.x * 1000),
  };
}

export function drawSchedulesMatchForOptimization(
  currentDraws: DemoDraw[],
  optimizedDraws: DemoDraw[]
) {
  if (currentDraws.length !== optimizedDraws.length) {
    return false;
  }

  const current = sortTimelineDraws(currentDraws).map(
    normalizeDrawForOptimizationComparison
  );
  const optimized = sortTimelineDraws(optimizedDraws).map(
    normalizeDrawForOptimizationComparison
  );
  return current.every((draw, index) => {
    const optimizedDraw = optimized[index];
    return (
      optimizedDraw !== undefined &&
      draw.amountCents === optimizedDraw.amountCents &&
      draw.timingMilliDay === optimizedDraw.timingMilliDay
    );
  });
}

export function relabelTimelineDraws(draws: DemoDraw[]) {
  return sortTimelineDraws(draws).map((draw, index) => {
    if (!/^draw\s+\d+$/i.test(draw.label.trim())) {
      return draw;
    }

    return {
      ...draw,
      label: `Draw ${String(index + 1).padStart(2, "0")}`,
    };
  });
}

export function timelineItemToMilestoneMutationInput(
  item: TimelineItem<DemoMilestone>,
  order: number
) {
  const milestone = item.data;
  return {
    budgetCents: dollarsToCents(milestone?.amount ?? 0),
    dayEnd: Math.round(item.x + (milestone?.durationDays ?? 1)),
    dayStart: Math.round(item.x),
    dependencyKeys: [],
    drawAvailabilityCents: dollarsToCents(
      getMilestoneDrawAvailabilityAmount(milestone, DEFAULT_BORROWER_CO_PAY_BPS)
    ),
    drawKey: milestone?.draw,
    durationDays: milestone?.durationDays ?? 1,
    evidenceState: milestone?.evidence ?? "Draft package",
    icon: milestone?.icon,
    included: true,
    lane: item.lane,
    markerLabel: item.markerLabel,
    milestoneKey: item.id,
    name: milestone?.name ?? item.label ?? "Timeline milestone",
    order,
    policyState: milestone?.policy ?? "Needs sequencing",
    status: milestone?.status,
    submilestones: resolveMilestoneSubmilestones(
      milestone ?? { subMilestones: [], submilestoneDetails: [] },
      item.id
    ).map((submilestone) => ({
      ...(submilestone.budgetCents === undefined
        ? {}
        : { budgetCents: submilestone.budgetCents }),
      ...(submilestone.description
        ? { description: submilestone.description }
        : {}),
      ...(submilestone.durationDays === undefined
        ? {}
        : { durationDays: submilestone.durationDays }),
      key: submilestone.key,
      name: submilestone.name,
      order: submilestone.order,
    })),
    tone: item.tone,
    type: "timeline_demo",
    x: item.x,
  };
}

export function normalizeTimelineShareStateForRoute(
  state: TimelineShareState
): TimelineShareState {
  const range = expandTimelineRangeForMilestones(state.items, state.range);

  return {
    ...state,
    draws: syncDemoDrawsWithItems(state.draws, state.items, range, {
      preserveLabels: true,
    }),
    range,
  };
}

export function resolveSelectedDrawDate(
  activeItem: TimelineItem<DemoMilestone>,
  activeDraw: DemoDraw | null | undefined,
  range: TimelineRange
): number {
  if (activeDraw) {
    return activeDraw.x;
  }

  return createDemoDraw(
    activeItem,
    expandTimelineRangeForMilestones([activeItem], range)
  ).x;
}

export function createDemoDraw(
  item: TimelineItem<DemoMilestone>,
  range: Required<TimelineRange>
): DemoDraw {
  const milestone = item.data;
  const defaultDrawX = resolveDefaultDrawX(item, range);
  const drawX = clampNumber(
    Math.max(milestone?.drawX ?? defaultDrawX, defaultDrawX),
    range.min,
    range.max
  );

  return {
    amount: getMilestoneDrawAvailabilityAmount(
      milestone,
      DEFAULT_BORROWER_CO_PAY_BPS
    ),
    id: `${item.id}-draw`,
    itemId: item.id,
    label: milestone?.draw ?? item.label ?? "Reimbursement draw",
    x: drawX,
  };
}

export function findTimelineItemForDay(
  items: TimelineItem<DemoMilestone>[],
  day: number
) {
  const requestedDay = Math.round(day);
  const sortedItems = items
    .filter((item) => item.data)
    .sort((a, b) => a.x - b.x || a.id.localeCompare(b.id));
  const activeItem = sortedItems.find((item) => {
    const startDay = Math.round(item.x);
    const endDay = Math.round(getMilestoneEndX(item));
    return requestedDay >= startDay && requestedDay <= endDay;
  });

  return (
    activeItem ??
    sortedItems
      .map((item) => ({
        distance: Math.min(
          Math.abs(requestedDay - Math.round(item.x)),
          Math.abs(requestedDay - Math.round(getMilestoneEndX(item)))
        ),
        item,
      }))
      .sort((a, b) => a.distance - b.distance || a.item.x - b.item.x)[0]?.item
  );
}

export function formatTimelineDay(value: number) {
  const day = Math.round(value);
  return day < 0 ? `T−${Math.abs(day)}` : day === 0 ? "T0" : `T+${day}`;
}

export function formatTimelineDateTime(value: number) {
  return new Intl.DateTimeFormat("en-US", {
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    month: "short",
  }).format(new Date(value));
}

export function formatFileSize(size: number) {
  if (size >= 1_000_000) {
    return `${fileSizeFormatter.format(size / 1_000_000)} MB`;
  }

  if (size >= 1000) {
    return `${fileSizeFormatter.format(size / 1000)} KB`;
  }

  return `${size} B`;
}

export function hasCompletionClaim(item: TimelineItem<DemoMilestone>) {
  return Boolean(item.data?.completionClaim);
}

export function getDrawDomId(draw: DemoDraw) {
  return draw.itemId ?? draw.id;
}

export function getDrawRequestStatusLabel(status: DemoDraw["requestStatus"]) {
  if (status === "approved") {
    return "Draw approved";
  }

  if (status === "rejected") {
    return "Draw rejected";
  }

  if (status === "requested") {
    return "Request ready for review";
  }

  return "No builder request";
}

export type DrawTimelineMarkerState =
  | "happened"
  | "planned"
  | "rejected"
  | "requested";

export function getDrawTimelineMarkerState(
  draw: DemoDraw,
  currentDay: number
): DrawTimelineMarkerState {
  if (draw.requestStatus === "requested") {
    return "requested";
  }

  if (draw.requestStatus === "rejected") {
    return "rejected";
  }

  if (draw.requestStatus === "approved" || draw.x <= currentDay) {
    return "happened";
  }

  return "planned";
}

export function getDrawTimelineMarkerCopy(state: DrawTimelineMarkerState) {
  if (state === "requested") {
    return "Requested";
  }

  if (state === "happened") {
    return "Happened";
  }

  if (state === "rejected") {
    return "Rejected";
  }

  return "Planned";
}

export function calculateApprovedLimitShare(
  items: TimelineItem<DemoMilestone>[],
  totalUnlockedAtDay: number,
  approvedDrawLimit?: number
): number {
  const normalizedApprovedDrawLimit =
    typeof approvedDrawLimit === "number" && Number.isFinite(approvedDrawLimit)
      ? Math.max(0, Math.round(approvedDrawLimit))
      : undefined;

  if (normalizedApprovedDrawLimit === undefined) {
    return 0;
  }

  const maxTotalUnlocked = items.reduce((total, item) => {
    if (!item.data) {
      return total;
    }
    return total + getMilestoneRequestableDrawAmount(item.data);
  }, 0);

  const approvedHeadroom = Math.max(
    0,
    normalizedApprovedDrawLimit - maxTotalUnlocked
  );

  if (approvedHeadroom <= 0) {
    return 0;
  }

  if (maxTotalUnlocked <= 0) {
    return approvedHeadroom;
  }

  return totalUnlockedAtDay >= maxTotalUnlocked
    ? approvedHeadroom
    : Math.round((approvedHeadroom * totalUnlockedAtDay) / maxTotalUnlocked);
}

export function calculateDrawRequestLimit(
  targetDraw: DemoDraw,
  items: TimelineItem<DemoMilestone>[],
  draws: DemoDraw[],
  approvedDrawLimit?: number
): DrawRequestLimit {
  const drawDay = targetDraw.x;
  const totalUnlocked = items.reduce((total, item) => {
    if (!item.data) {
      return total;
    }

    const accruedCapacity = getAccruedMilestoneDrawCapacity(item, drawDay);
    return (
      total +
      Math.min(accruedCapacity, getMilestoneRequestableDrawAmount(item.data))
    );
  }, 0);
  const alreadyDrawn = draws.reduce((total, draw) => {
    if (draw.id === targetDraw.id || draw.x > drawDay) {
      return total;
    }

    if (draw.x === drawDay && draw.id.localeCompare(targetDraw.id) > 0) {
      return total;
    }

    return total + draw.amount;
  }, 0);
  const baseAvailableLimit = Math.max(0, totalUnlocked - alreadyDrawn);
  const approvedLimitShare = calculateApprovedLimitShare(
    items,
    totalUnlocked,
    approvedDrawLimit
  );
  const availableLimit = baseAvailableLimit + approvedLimitShare;

  return {
    alreadyDrawn,
    availableLimit,
    remainingAfterRequest: Math.max(0, availableLimit - targetDraw.amount),
    totalUnlocked,
  };
}

export function getMilestoneRequestableDrawAmount(milestone: DemoMilestone) {
  const approvedDrawAvailability =
    getMilestoneDrawAvailabilityAmount(
      milestone,
      DEFAULT_BORROWER_CO_PAY_BPS
    );
  const actualCost = milestone.completionClaim?.actualCost;

  if (actualCost === undefined || !Number.isFinite(actualCost)) {
    return approvedDrawAvailability;
  }

  return Math.min(
    approvedDrawAvailability,
    calculateDrawAvailabilityAmount(
      Math.max(0, Math.round(actualCost)),
      DEFAULT_BORROWER_CO_PAY_BPS
    )
  );
}

export interface ApprovedDrawRequestLimit extends DrawRequestLimit {
  blockingMilestones: string[];
}

export function isMilestoneAdminApproved(item: TimelineItem<DemoMilestone>) {
  return (
    item.data?.completionReview?.status === "approved" ||
    (
      item.data?.completionClaim as
        | (DemoMilestone["completionClaim"] & {
            completionReview?: DemoMilestone["completionReview"];
          })
        | undefined
    )?.completionReview?.status === "approved"
  );
}

export function calculateApprovedDrawRequestLimit(
  targetDraw: DemoDraw,
  items: TimelineItem<DemoMilestone>[],
  draws: DemoDraw[],
  approvedDrawLimit?: number
): ApprovedDrawRequestLimit {
  const drawDay = targetDraw.x;
  const blockingMilestones: string[] = [];
  const totalUnlocked = items.reduce((total, item) => {
    if (!item.data || getMilestoneEndX(item) > drawDay) {
      return total;
    }

    if (!isMilestoneAdminApproved(item)) {
      blockingMilestones.push(item.data.name);
      return total;
    }

    return total + getMilestoneRequestableDrawAmount(item.data);
  }, 0);
  const alreadyDrawn = draws.reduce((total, draw) => {
    if (draw.id === targetDraw.id || draw.x > drawDay) {
      return total;
    }

    if (draw.x === drawDay && draw.id.localeCompare(targetDraw.id) > 0) {
      return total;
    }

    return total + draw.amount;
  }, 0);
  const baseAvailableLimit = Math.max(0, totalUnlocked - alreadyDrawn);
  const approvedLimitShare = calculateApprovedLimitShare(
    items,
    totalUnlocked,
    approvedDrawLimit
  );
  const availableLimit = baseAvailableLimit + approvedLimitShare;

  return {
    alreadyDrawn,
    availableLimit,
    blockingMilestones,
    remainingAfterRequest: Math.max(0, availableLimit - targetDraw.amount),
    totalUnlocked,
  };
}

export function findDrawUnlockCapacityViolation(
  items: TimelineItem<DemoMilestone>[],
  draws: DemoDraw[],
  approvedDrawLimit?: number
): { draw: DemoDraw; limit: DrawRequestLimit } | null {
  const orderedDraws = [...draws].sort(
    (a, b) => a.x - b.x || a.id.localeCompare(b.id)
  );

  for (const draw of orderedDraws) {
    const limit = calculateDrawRequestLimit(
      draw,
      items,
      draws,
      approvedDrawLimit
    );
    if (draw.amount > limit.availableLimit) {
      return { draw, limit };
    }
  }

  return null;
}

export function getMaxSchedulableDrawAmount(
  requestedDay: number,
  items: TimelineItem<DemoMilestone>[],
  draws: DemoDraw[],
  options: { excludeDrawId?: string; proposedDrawId?: string } = {},
  approvedDrawLimit?: number
): number {
  const proposedDrawId =
    options.proposedDrawId ?? `__proposed-draw-${requestedDay}`;
  const drawsWithoutExcluded = options.excludeDrawId
    ? draws.filter((draw) => draw.id !== options.excludeDrawId)
    : draws;
  const probeDraw: DemoDraw = {
    amount: Number.MAX_SAFE_INTEGER,
    id: proposedDrawId,
    label: "Proposed draw",
    x: requestedDay,
  };
  let maxAmount = calculateDrawRequestLimit(
    probeDraw,
    items,
    [...drawsWithoutExcluded, probeDraw],
    approvedDrawLimit
  ).availableLimit;

  for (const laterDraw of drawsWithoutExcluded) {
    const proposedComesBeforeLater =
      requestedDay < laterDraw.x ||
      (requestedDay === laterDraw.x &&
        proposedDrawId.localeCompare(laterDraw.id) < 0);

    if (!proposedComesBeforeLater) {
      continue;
    }

    const limitWithoutProposed = calculateDrawRequestLimit(
      laterDraw,
      items,
      drawsWithoutExcluded,
      approvedDrawLimit
    );
    maxAmount = Math.min(
      maxAmount,
      Math.max(0, limitWithoutProposed.availableLimit - laterDraw.amount)
    );
  }

  return Math.max(0, Math.floor(maxAmount));
}

export const DRAW_UNLOCK_CAPACITY_BLOCKED_MESSAGE =
  "Cannot schedule a draw that exceeds unlocked draw availability at this point in the timeline.";
