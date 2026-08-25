"use client";

import type { TimelineItem } from "#/components/roadmap/AnimatedCurvedTimeline.tsx";
import {
  getMilestoneEndX,
  getMilestonePaymentSchedule,
} from "./-timeline-milestone-schedule.ts";
import {
  type DemoCapitalSpike,
  type DemoDraw,
  type DemoMilestone,
  getMilestoneDrawAvailabilityAmount,
  ISOMETRIC_ICON_KEYS,
  type IsometricIconKey,
} from "./-timeline-share-snapshot.ts";

// ---------------------------------------------------------------------------
// Shared display helpers
// ---------------------------------------------------------------------------

export const money = (value: number) =>
  new Intl.NumberFormat("en-US", {
    currency: "USD",
    maximumFractionDigits: 0,
    style: "currency",
  }).format(value);
export const MOBILE_EVENT_ID_PREFIX_RE = /^(capital|draw|milestone)-/;
export const MOBILE_DAY_WHEEL_OPTION_ITEM_HEIGHT = 32;
/** Wheel viewport height; overrides the library default of 104px at visibleCount 12. */
export const MOBILE_DAY_WHEEL_HEIGHT_PX = 150;
/** Extra inset for the centered highlight row vs scrolling options. */
export const MOBILE_DAY_WHEEL_ACTIVE_INSET = "0.625rem";
export const MOBILE_DAY_EVENT_CARD_STEP_PX = 82;
export const MOBILE_DAY_WHEEL_VISIBLE_COUNT = 14;
export const WHEEL_TRANSLATE_Y_RE = /translateY\((-?\d+(?:\.\d+)?)px\)/;
export const WHEEL_MATRIX_RE = /matrix\(([^)]+)\)/;
export const WHEEL_MATRIX_3D_RE = /matrix3d\(([^)]+)\)/;
export const ISOMETRIC_ICON_KEY_SET = new Set<string>(ISOMETRIC_ICON_KEYS);
export const MOBILE_ICON_INFERENCE_RULES: Array<{
  icon: IsometricIconKey;
  pattern: RegExp;
}> = [
  {
    icon: "foundation",
    pattern: /\b(foundation|footing|slab|podium|excavat|site prep|sitework)\b/,
  },
  { icon: "roofing", pattern: /\b(roof|roofing|shingle|dry in|dry-in)\b/ },
  {
    icon: "framing",
    pattern: /\b(frame|framing|shell|structure|structural)\b/,
  },
  { icon: "roughIn", pattern: /\b(rough|mep|mechanical|electrical|hvac)\b/ },
  { icon: "plumbing", pattern: /\b(plumb|plumbing)\b/ },
  {
    icon: "exterior",
    pattern: /\b(window|exterior|siding|cladding|facade|doors?)\b/,
  },
  { icon: "drywall", pattern: /\b(drywall|insulation|board|tape|mud)\b/ },
  { icon: "kitchen", pattern: /\b(kitchen|cabinet|countertop|millwork)\b/ },
  {
    icon: "finishes",
    pattern: /\b(finish|finishes|flooring|paint|trim|fixture|interior)\b/,
  },
  {
    icon: "closeout",
    pattern: /\b(closeout|close out|final|handover|occupancy|punch)\b/,
  },
  { icon: "change", pattern: /\b(change|contingency|allowance|revision)\b/ },
];

export type MobileDrawState = "happened" | "planned" | "rejected" | "requested";

/**
 * Mirror of `getDrawTimelineMarkerState` in TimelineWorkspace, kept local so the
 * mobile module does not depend on the 8k-line host module's internal exports.
 * The two MUST stay in lockstep; the parity test asserts identical output.
 */
export function mobileDrawState(
  draw: DemoDraw,
  currentDay: number
): MobileDrawState {
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

export const DRAW_STATE_COPY: Record<MobileDrawState, string> = {
  happened: "Released",
  planned: "Planned",
  rejected: "Rejected",
  requested: "Requested",
};

export const DRAW_STATE_TONE: Record<
  MobileDrawState,
  "default" | "secondary" | "destructive" | "outline" | "success" | "warning"
> = {
  happened: "success",
  planned: "outline",
  rejected: "destructive",
  requested: "warning",
};

export interface MilestoneFeedRowState {
  blockingMilestoneNames: string[];
  budget: number;
  complete: boolean;
  drawAvailability: number;
  draws: Array<{ draw: DemoDraw; state: MobileDrawState }>;
  endDay: number;
  evidenceCount: number;
  evidenceLabel: string;
  item: TimelineItem<DemoMilestone>;
  primaryAction: PrimaryAction | null;
  startDay: number;
  statusLabel: string;
  statusTone: "active" | "complete" | "ready" | "upcoming";
  underReview: boolean;
}

export interface PrimaryAction {
  intent:
    | "requestDraw"
    | "reviewDraw"
    | "submitCompletion"
    | "reviewCompletion"
    | "requestSiteVisit"
    | "open";
  label: string;
}

export type MobileTimelineRole = "builder" | "lender";

export type MobileDayTimelineEventKind = "capital" | "draw" | "milestone";

export interface MobileDayTimelineEvent {
  amount: number | null;
  day: number;
  endDay: number;
  icon?: IsometricIconKey;
  id: string;
  itemId?: string;
  kind: MobileDayTimelineEventKind;
  meta: string;
  selected: boolean;
  status: string;
  title: string;
}

export interface MobileStickyTimelineRail {
  activeIndex: number;
  events: MobileDayTimelineEvent[];
  progressToNext: number;
  translateY: number;
}

export function deriveMobileDayTimelineEvents({
  capitalSpikes,
  currentDay,
  draws,
  items,
  selectedDay: selectedDayInput,
}: {
  capitalSpikes: DemoCapitalSpike[];
  currentDay: number;
  draws: DemoDraw[];
  items: TimelineItem<DemoMilestone>[];
  selectedDay?: number;
}): MobileDayTimelineEvent[] {
  const selectedDay = Math.round(selectedDayInput ?? currentDay);
  const activeMilestoneIds = new Set<string>();
  const drawMilestoneLookup = buildDrawMilestoneLookup(items);
  const milestoneEvents = items.flatMap((item) => {
    if (!item.data) {
      return [];
    }
    const schedule = getMilestonePaymentSchedule(item);
    const startDay = Math.round(schedule.startX);
    const endDay = Math.round(getMilestoneEndX(item));
    if (selectedDay < startDay || selectedDay > endDay) {
      return [];
    }
    activeMilestoneIds.add(item.id);
    const approved = item.data.completionReview?.status === "approved";
    const claimed = Boolean(item.data.completionClaim);
    return [
      {
        amount: schedule.totalAmount,
        day: startDay,
        endDay,
        icon:
          resolveIsometricIconKey(item.data.icon) ??
          inferIsometricIconKeyFromText(item.id, item.data.name),
        id: `milestone-${item.id}`,
        itemId: item.id,
        kind: "milestone" as const,
        meta: `Day ${startDay}-${endDay}`,
        selected: true,
        status: approved ? "Approved" : claimed ? "Review" : "Active",
        title: item.data.name,
      },
    ];
  });

  const nearbyWindow = 3;
  const drawEvents = draws
    .map((draw) => {
      const owner = resolveDrawMilestoneItem(draw, drawMilestoneLookup);
      const drawDay = Math.round(draw.x);
      const state = mobileDrawState(draw, currentDay);
      return {
        amount: draw.amount,
        day: drawDay,
        endDay: drawDay,
        icon:
          resolveIsometricIconKey(owner?.data?.icon) ??
          inferIsometricIconKeyFromText(
            draw.itemId,
            draw.id,
            draw.label,
            owner?.id,
            owner?.data?.name,
            owner?.data?.draw
          ),
        id: `draw-${draw.id}`,
        itemId: draw.itemId ?? owner?.id,
        kind: "draw" as const,
        meta: DRAW_STATE_COPY[state],
        selected: drawDay === selectedDay,
        status: DRAW_STATE_COPY[state],
        title: draw.label,
        visible:
          Math.abs(drawDay - selectedDay) <= nearbyWindow ||
          (owner ? activeMilestoneIds.has(owner.id) : false),
      };
    })
    .filter((event) => event.visible)
    .map(({ visible: _visible, ...event }) => event);

  const capitalEvents = capitalSpikes
    .filter(
      (event) => Math.abs(Math.round(event.x) - selectedDay) <= nearbyWindow
    )
    .map((event) => {
      const eventDay = Math.round(event.x);
      return {
        amount: event.amount,
        day: eventDay,
        endDay: eventDay,
        id: `capital-${event.id}`,
        kind: "capital" as const,
        meta: event.eventKind === "cashInfusion" ? "Cash infusion" : "Capital",
        selected: eventDay === selectedDay,
        status: event.eventKind === "cashInfusion" ? "Opened" : "Planned",
        title: event.label,
      };
    });

  const events = [...milestoneEvents, ...drawEvents, ...capitalEvents].sort(
    (a, b) =>
      Math.abs(a.day - selectedDay) - Math.abs(b.day - selectedDay) ||
      a.day - b.day ||
      a.id.localeCompare(b.id)
  );

  if (events.length > 0) {
    return events.slice(0, 7);
  }

  const nextMilestone = items
    .filter((item) => item.data)
    .map((item) => ({
      item,
      startDay: Math.round(getMilestonePaymentSchedule(item).startX),
    }))
    .sort(
      (a, b) =>
        Math.abs(a.startDay - selectedDay) - Math.abs(b.startDay - selectedDay)
    )[0];

  if (!nextMilestone?.item.data) {
    return [];
  }

  const endDay = Math.round(getMilestoneEndX(nextMilestone.item));
  return [
    {
      amount: getMilestonePaymentSchedule(nextMilestone.item).totalAmount,
      day: nextMilestone.startDay,
      endDay,
      icon:
        resolveIsometricIconKey(nextMilestone.item.data.icon) ??
        inferIsometricIconKeyFromText(
          nextMilestone.item.id,
          nextMilestone.item.data.name
        ),
      id: `milestone-${nextMilestone.item.id}`,
      itemId: nextMilestone.item.id,
      kind: "milestone",
      meta: `Day ${nextMilestone.startDay}-${endDay}`,
      selected: false,
      status: "Next",
      title: nextMilestone.item.data.name,
    },
  ];
}

export function deriveMobileStickyTimelineRail({
  capitalSpikes,
  currentDay,
  draws,
  items,
  selectedDay: selectedDayInput,
}: {
  capitalSpikes: DemoCapitalSpike[];
  currentDay: number;
  draws: DemoDraw[];
  items: TimelineItem<DemoMilestone>[];
  selectedDay?: number;
}): MobileStickyTimelineRail {
  const selectedDay = Math.round(selectedDayInput ?? currentDay);
  const drawMilestoneLookup = buildDrawMilestoneLookup(items);
  const milestoneEvents = items.flatMap((item) => {
    if (!item.data) {
      return [];
    }
    const schedule = getMilestonePaymentSchedule(item);
    const startDay = Math.round(schedule.startX);
    const endDay = Math.round(getMilestoneEndX(item));
    const approved = item.data.completionReview?.status === "approved";
    const claimed = Boolean(item.data.completionClaim);
    return [
      {
        amount: schedule.totalAmount,
        day: startDay,
        endDay,
        icon:
          resolveIsometricIconKey(item.data.icon) ??
          inferIsometricIconKeyFromText(item.id, item.data.name),
        id: `milestone-${item.id}`,
        itemId: item.id,
        kind: "milestone" as const,
        meta: `Day ${startDay}-${endDay}`,
        selected: selectedDay >= startDay && selectedDay <= endDay,
        status: approved ? "Approved" : claimed ? "Review" : "Active",
        title: item.data.name,
      },
    ];
  });

  const drawEvents = draws.map((draw) => {
    const owner = resolveDrawMilestoneItem(draw, drawMilestoneLookup);
    const drawDay = Math.round(draw.x);
    const state = mobileDrawState(draw, currentDay);
    return {
      amount: draw.amount,
      day: drawDay,
      endDay: drawDay,
      icon:
        resolveIsometricIconKey(owner?.data?.icon) ??
        inferIsometricIconKeyFromText(
          draw.itemId,
          draw.id,
          draw.label,
          owner?.id,
          owner?.data?.name,
          owner?.data?.draw
        ),
      id: `draw-${draw.id}`,
      itemId: draw.itemId ?? owner?.id,
      kind: "draw" as const,
      meta: DRAW_STATE_COPY[state],
      selected: drawDay === selectedDay,
      status: DRAW_STATE_COPY[state],
      title: draw.label,
    };
  });

  const capitalEvents = capitalSpikes.map((event) => {
    const eventDay = Math.round(event.x);
    return {
      amount: event.amount,
      day: eventDay,
      endDay: eventDay,
      id: `capital-${event.id}`,
      kind: "capital" as const,
      meta: event.eventKind === "cashInfusion" ? "Cash infusion" : "Capital",
      selected: eventDay === selectedDay,
      status: event.eventKind === "cashInfusion" ? "Opened" : "Planned",
      title: event.label,
    };
  });

  const events = [...milestoneEvents, ...drawEvents, ...capitalEvents].sort(
    (a, b) =>
      a.day - b.day ||
      a.endDay - b.endDay ||
      mobileEventKindRank(a.kind) - mobileEventKindRank(b.kind) ||
      a.id.localeCompare(b.id)
  );

  if (events.length === 0) {
    return {
      activeIndex: 0,
      events: [],
      progressToNext: 0,
      translateY: 0,
    };
  }

  const activeIndex = events.findIndex((event) => selectedDay <= event.endDay);
  const resolvedActiveIndex =
    activeIndex === -1 ? events.length - 1 : activeIndex;
  const activeEvent = events[resolvedActiveIndex];
  const hasNext = resolvedActiveIndex < events.length - 1;
  const duration = Math.max(1, activeEvent.endDay - activeEvent.day);
  const transitionDays = Math.min(5, Math.max(2, Math.ceil(duration * 0.22)));
  const transitionStart = activeEvent.endDay - transitionDays;
  const progressToNext =
    hasNext && selectedDay >= transitionStart
      ? Math.min(
          1,
          Math.max(0, (selectedDay - transitionStart) / transitionDays)
        )
      : 0;
  const offsetIndex = resolvedActiveIndex + progressToNext;

  return {
    activeIndex: resolvedActiveIndex,
    events,
    progressToNext,
    translateY:
      offsetIndex === 0 ? 0 : -offsetIndex * MOBILE_DAY_EVENT_CARD_STEP_PX,
  };
}

export function mobileEventKindRank(kind: MobileDayTimelineEventKind) {
  if (kind === "milestone") {
    return 0;
  }
  if (kind === "draw") {
    return 1;
  }
  return 2;
}

export function buildDrawMilestoneLookup(items: TimelineItem<DemoMilestone>[]) {
  const lookup = new Map<string, TimelineItem<DemoMilestone>>();
  const add = (
    kind: "draw" | "item" | "label",
    value: string | undefined,
    item: TimelineItem<DemoMilestone>
  ) => {
    for (const key of normalizeDrawMilestoneLookupKeys(value)) {
      if (!key || lookup.has(`${kind}:${key}`)) {
        continue;
      }
      lookup.set(`${kind}:${key}`, item);
    }
  };

  for (const item of items) {
    if (!item.data) {
      continue;
    }
    add("item", item.id, item);
    add("draw", `${item.id}-draw`, item);
    add("label", item.data.draw, item);
    add("label", item.data.name, item);
    add("label", `${item.data.name} reimbursement draw`, item);
  }

  return lookup;
}

export function resolveDrawMilestoneItem(
  draw: DemoDraw,
  lookup: Map<string, TimelineItem<DemoMilestone>>
) {
  return (
    findDrawMilestoneLookupMatch("item", draw.itemId, lookup) ??
    findDrawMilestoneLookupMatch("draw", draw.id, lookup) ??
    findDrawMilestoneLookupMatch("label", draw.label, lookup)
  );
}

export function findDrawMilestoneLookupMatch(
  kind: "draw" | "item" | "label",
  value: string | undefined,
  lookup: Map<string, TimelineItem<DemoMilestone>>
) {
  for (const key of normalizeDrawMilestoneLookupKeys(value)) {
    const item = lookup.get(`${kind}:${key}`);
    if (item) {
      return item;
    }
  }
  return;
}

export function normalizeDrawMilestoneLookupKeys(value: string | undefined) {
  const base = value?.trim().toLowerCase() ?? "";
  if (!base) {
    return [];
  }
  const compact = base
    .replace(/\b(reimbursement|planned|requested|approved|released)\b/g, " ")
    .replace(/\bdraws?\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return Array.from(new Set([base, compact].filter(Boolean)));
}

export function resolveIsometricIconKey(value: string | undefined) {
  return value && ISOMETRIC_ICON_KEY_SET.has(value)
    ? (value as IsometricIconKey)
    : undefined;
}

export function inferIsometricIconKeyFromText(
  ...values: Array<string | undefined>
): IsometricIconKey | undefined {
  const normalized = values.filter(Boolean).join(" ").toLowerCase();
  if (!normalized) {
    return;
  }
  return MOBILE_ICON_INFERENCE_RULES.find(({ pattern }) =>
    pattern.test(normalized)
  )?.icon;
}

/**
 * Pure derivation of a milestone's mobile feed-row view-model. Exported for the
 * component test (asserts status/draw/dependency rendering per state permutation).
 */
export function deriveMilestoneRowState({
  currentDay,
  draws,
  item,
  items,
  role,
}: {
  currentDay: number;
  draws: DemoDraw[];
  item: TimelineItem<DemoMilestone>;
  items: TimelineItem<DemoMilestone>[];
  role: MobileTimelineRole;
}): MilestoneFeedRowState {
  const milestone = item.data;
  const schedule = getMilestonePaymentSchedule(item);
  const complete = Boolean(milestone?.completionClaim);
  const review = milestone?.completionReview;
  const underReview = complete && !review;
  const statusLabel = complete
    ? review?.status === "approved"
      ? "Approved"
      : underReview
        ? "In review"
        : review?.status === "revisionRequested"
          ? "Revision requested"
          : "Complete"
    : milestone?.status === "ready"
      ? "Ready"
      : "Upcoming";
  const statusTone: MilestoneFeedRowState["statusTone"] = complete
    ? "complete"
    : milestone?.status === "ready"
      ? "ready"
      : "upcoming";

  const itemDraws = draws
    .filter((draw) => (draw.itemId ?? "") === item.id)
    .map((draw) => ({ draw, state: mobileDrawState(draw, currentDay) }));

  // Dependency blockers: in the reimbursement flow draws unlock sequentially, so
  // a milestone is "blocked" while any earlier milestone (lower start day) has
  // not been completion-approved yet. This mirrors the ordering constraint the
  // spatial timeline encodes positionally, independent of calendar overlap.
  const startDay = Math.round(schedule.startX);
  const blockingMilestoneNames = complete
    ? []
    : items
        .filter((other) => {
          if (other.id === item.id || !other.data) {
            return false;
          }
          const otherApproved =
            other.data.completionReview?.status === "approved";
          return other.x < item.x && !otherApproved;
        })
        .map((other) => other.data?.name ?? "milestone");

  const evidenceCount = milestone?.evidencePackage?.assets.length ?? 0;

  return {
    blockingMilestoneNames,
    budget: schedule.totalAmount,
    complete,
    drawAvailability: getMilestoneDrawAvailabilityAmount(milestone, undefined),
    draws: itemDraws,
    endDay: Math.round(getMilestoneEndX(item)),
    evidenceCount,
    evidenceLabel: milestone?.evidence ?? "No evidence",
    item,
    primaryAction: derivePrimaryAction({
      complete,
      itemDraws,
      review,
      role,
      underReview,
    }),
    startDay,
    statusLabel,
    statusTone,
    underReview,
  };
}

export function derivePrimaryAction({
  complete,
  itemDraws,
  review,
  role,
  underReview,
}: {
  complete: boolean;
  itemDraws: Array<{ draw: DemoDraw; state: MobileDrawState }>;
  review: DemoMilestone["completionReview"];
  role: MobileTimelineRole;
  underReview: boolean;
}): PrimaryAction | null {
  const requestedDraw = itemDraws.find((entry) => entry.state === "requested");
  if (role === "lender") {
    if (requestedDraw) {
      return { intent: "reviewDraw", label: "Review draw" };
    }
    if (underReview) {
      return { intent: "reviewCompletion", label: "Review claim" };
    }
    if (complete && review?.status !== "approved") {
      return { intent: "requestSiteVisit", label: "Request site visit" };
    }
    return { intent: "open", label: "Open" };
  }
  // builder
  if (!complete) {
    return { intent: "submitCompletion", label: "Submit completion" };
  }
  if (review?.status === "approved" && !requestedDraw) {
    return { intent: "requestDraw", label: "Request draw" };
  }
  return { intent: "open", label: "Open" };
}
