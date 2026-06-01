"use client";

import {
  AlertTriangle,
  Banknote,
  ChevronLeft,
  ChevronRight,
  CircleDollarSign,
  Hammer,
  Landmark,
  MoreVertical,
  Plus,
} from "lucide-react";
import {
  type CSSProperties,
  type ReactNode,
  type PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import type {
  TimelineItem,
  TimelineRange,
} from "#/components/roadmap/AnimatedCurvedTimeline.tsx";
import { Badge } from "#/components/ui/badge.tsx";
import { Button } from "#/components/ui/button.tsx";
import { Card } from "#/components/ui/card.tsx";
import { Frame, FramePanel } from "#/components/ui/frame.tsx";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "#/components/ui/menu.tsx";
import {
  WheelPicker,
  type WheelPickerOption,
  WheelPickerWrapper,
} from "#/components/wheel-picker.tsx";
import { cn } from "#/lib/utils.ts";
import { IsometricMilestoneIcon } from "./-MilestoneCard.tsx";
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

const money = (value: number) =>
  new Intl.NumberFormat("en-US", {
    currency: "USD",
    maximumFractionDigits: 0,
    style: "currency",
  }).format(value);
const MOBILE_EVENT_ID_PREFIX_RE = /^(capital|draw|milestone)-/;
const MOBILE_DAY_WHEEL_OPTION_ITEM_HEIGHT = 32;
/** Wheel viewport height; overrides the library default of 104px at visibleCount 12. */
const MOBILE_DAY_WHEEL_HEIGHT_PX = 150;
/** Extra inset for the centered highlight row vs scrolling options. */
const MOBILE_DAY_WHEEL_ACTIVE_INSET = "0.625rem";
const MOBILE_DAY_EVENT_CARD_STEP_PX = 82;
const MOBILE_DAY_WHEEL_VISIBLE_COUNT = 14;
const WHEEL_TRANSLATE_Y_RE = /translateY\((-?\d+(?:\.\d+)?)px\)/;
const WHEEL_MATRIX_RE = /matrix\(([^)]+)\)/;
const WHEEL_MATRIX_3D_RE = /matrix3d\(([^)]+)\)/;
const ISOMETRIC_ICON_KEY_SET = new Set<string>(ISOMETRIC_ICON_KEYS);
const MOBILE_ICON_INFERENCE_RULES: Array<{
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

const DRAW_STATE_COPY: Record<MobileDrawState, string> = {
  happened: "Released",
  planned: "Planned",
  rejected: "Rejected",
  requested: "Requested",
};

const DRAW_STATE_TONE: Record<
  MobileDrawState,
  "default" | "secondary" | "destructive" | "outline" | "success" | "warning"
> = {
  happened: "success",
  planned: "outline",
  rejected: "destructive",
  requested: "warning",
};

interface MilestoneFeedRowState {
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

function mobileEventKindRank(kind: MobileDayTimelineEventKind) {
  if (kind === "milestone") {
    return 0;
  }
  if (kind === "draw") {
    return 1;
  }
  return 2;
}

function buildDrawMilestoneLookup(items: TimelineItem<DemoMilestone>[]) {
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

function resolveDrawMilestoneItem(
  draw: DemoDraw,
  lookup: Map<string, TimelineItem<DemoMilestone>>
) {
  return (
    findDrawMilestoneLookupMatch("item", draw.itemId, lookup) ??
    findDrawMilestoneLookupMatch("draw", draw.id, lookup) ??
    findDrawMilestoneLookupMatch("label", draw.label, lookup)
  );
}

function findDrawMilestoneLookupMatch(
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

function normalizeDrawMilestoneLookupKeys(value: string | undefined) {
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

function resolveIsometricIconKey(value: string | undefined) {
  return value && ISOMETRIC_ICON_KEY_SET.has(value)
    ? (value as IsometricIconKey)
    : undefined;
}

function inferIsometricIconKeyFromText(
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
    drawAvailability: getMilestoneDrawAvailabilityAmount(milestone),
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

function derivePrimaryAction({
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

// ---------------------------------------------------------------------------
// Phone day dial — touch-native day selection + active event rail
// ---------------------------------------------------------------------------

export interface MobileTimelineDayDialWorkspaceProps {
  capitalSpikes: DemoCapitalSpike[];
  currentDay: number;
  draws: DemoDraw[];
  insertMenu?: MobileTimelineInsertMenuConfig;
  items: TimelineItem<DemoMilestone>[];
  onDayChange: (day: number) => void;
  onOpenCapitalEvent: (capitalSpikeId: string) => void;
  onOpenDraw: (drawId: string) => void;
  onOpenMilestone: (itemId: string) => void;
  range: Required<TimelineRange>;
  selectedDay?: number;
}

export interface MobileTimelineInsertMenuConfig {
  milestoneLabel?: string;
  onAddCapitalSpike?: (day: number) => void;
  onAddCashInfusion?: (day: number) => void;
  onAddDraw?: (day: number) => void;
  onAddMilestone?: (day: number) => void;
}

export function MobileTimelineDayDialWorkspace({
  capitalSpikes,
  currentDay,
  draws,
  insertMenu,
  items,
  onDayChange,
  onOpenCapitalEvent,
  onOpenDraw,
  onOpenMilestone,
  range,
  selectedDay: selectedDayInput,
}: MobileTimelineDayDialWorkspaceProps) {
  const selectedDay = selectedDayInput ?? currentDay;
  const [dialSide, setDialSide] = useState<"left" | "right">("right");
  const dialOnRight = dialSide === "right";
  const hasInsertActions = Boolean(
    insertMenu?.onAddMilestone ||
      insertMenu?.onAddDraw ||
      insertMenu?.onAddCapitalSpike ||
      insertMenu?.onAddCashInfusion
  );
  const rail = useMemo(
    () =>
      deriveMobileStickyTimelineRail({
        capitalSpikes,
        currentDay,
        draws,
        items,
        selectedDay,
      }),
    [capitalSpikes, currentDay, draws, items, selectedDay]
  );

  return (
    <Frame className="mx-0" data-testid="mobile-timeline-workspace">
      <FramePanel className="overflow-hidden p-0">
        <div className="border-b px-2 py-3 sm:px-4">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <h2 className="font-semibold text-sm">Draw status</h2>
              <p className="text-muted-foreground text-xs">
                Actual day D{Math.round(currentDay)} stays fixed while you
                inspect the plan.
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <MobileDialSideToggle onChange={setDialSide} side={dialSide} />
              <div
                className="min-w-[5rem] rounded-lg border bg-muted/45 px-2.5 py-1 text-right"
                data-testid="mobile-selected-day"
              >
                <span className="block whitespace-nowrap text-[9px] text-muted-foreground uppercase">
                  Viewing
                </span>
                <strong className="font-semibold text-sm tabular-nums">
                  D{Math.round(selectedDay)}
                </strong>
              </div>
              {hasInsertActions ? (
                <MobileTimelineInsertMenu
                  day={Math.round(selectedDay)}
                  menu={insertMenu}
                />
              ) : null}
            </div>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground">
            <MobileLegendDot className="bg-success" label="Happened" />
            <MobileLegendDot className="bg-warning" label="Requested" />
            <MobileLegendDot className="bg-info" label="Planned" />
            <MobileLegendDot className="bg-destructive" label="Rejected" />
          </div>
        </div>
        <div
          className={cn(
            "grid min-h-[22rem] gap-0 px-0 py-4",
            dialOnRight
              ? "grid-cols-[minmax(0,1fr)_3.5rem] sm:grid-cols-[minmax(0,1fr)_3.75rem]"
              : "grid-cols-[3.5rem_minmax(0,1fr)] sm:grid-cols-[3.75rem_minmax(0,1fr)]"
          )}
          data-dial-side={dialSide}
          data-testid="mobile-day-layout"
        >
          {dialOnRight ? (
            <>
              <MobileDayEventRail
                onOpenCapitalEvent={onOpenCapitalEvent}
                onOpenDraw={onOpenDraw}
                onOpenMilestone={onOpenMilestone}
                rail={rail}
                side="left"
              />
              <MobileDayDial
                currentDay={selectedDay}
                onDayChange={onDayChange}
                range={range}
                side="right"
              />
            </>
          ) : (
            <>
              <MobileDayDial
                currentDay={selectedDay}
                onDayChange={onDayChange}
                range={range}
                side="left"
              />
              <MobileDayEventRail
                onOpenCapitalEvent={onOpenCapitalEvent}
                onOpenDraw={onOpenDraw}
                onOpenMilestone={onOpenMilestone}
                rail={rail}
                side="right"
              />
            </>
          )}
        </div>
      </FramePanel>
    </Frame>
  );
}

function MobileDialSideToggle({
  onChange,
  side,
}: {
  onChange: (side: "left" | "right") => void;
  side: "left" | "right";
}) {
  return (
    <fieldset
      aria-label="Day dial side"
      className="m-0 grid grid-cols-2 rounded-lg border bg-muted/35 p-0.5"
      data-testid="mobile-dial-side-toggle"
    >
      <button
        aria-label="Show day dial on left"
        aria-pressed={side === "left"}
        className={cn(
          "grid h-9 w-9 place-items-center rounded-md text-muted-foreground transition-colors",
          side === "left" && "bg-background text-foreground shadow-sm"
        )}
        data-testid="mobile-dial-side-left"
        onClick={() => onChange("left")}
        type="button"
      >
        <ChevronLeft className="size-4" />
      </button>
      <button
        aria-label="Show day dial on right"
        aria-pressed={side === "right"}
        className={cn(
          "grid h-9 w-9 place-items-center rounded-md text-muted-foreground transition-colors",
          side === "right" && "bg-background text-foreground shadow-sm"
        )}
        data-testid="mobile-dial-side-right"
        onClick={() => onChange("right")}
        type="button"
      >
        <ChevronRight className="size-4" />
      </button>
    </fieldset>
  );
}

function MobileDayEventRail({
  onOpenCapitalEvent,
  onOpenDraw,
  onOpenMilestone,
  rail,
  side,
}: {
  onOpenCapitalEvent: (capitalSpikeId: string) => void;
  onOpenDraw: (drawId: string) => void;
  onOpenMilestone: (itemId: string) => void;
  rail: MobileStickyTimelineRail;
  side: "left" | "right";
}) {
  return (
    <div
      className={cn(
        "relative min-h-[20rem] overflow-hidden",
        side === "left" ? "pl-2" : "pr-2"
      )}
      data-testid="mobile-day-event-rail"
    >
      {rail.events.length > 0 ? (
        <div
          className={cn(
            "absolute grid gap-2 transition-transform duration-300 ease-out will-change-transform",
            side === "left" ? "right-0 left-2 mr-[7px]" : "right-2 left-0"
          )}
          data-active-index={rail.activeIndex}
          data-testid="mobile-day-event-stack"
          style={
            {
              "--mobile-event-rail-y": `${rail.translateY}px`,
              transform:
                "translateY(calc(10rem - 2.125rem + var(--mobile-event-rail-y)))",
            } as CSSProperties
          }
        >
          {rail.events.map((event, index) => (
            <MobileDayEventCard
              active={index === rail.activeIndex}
              event={event}
              key={event.id}
              onOpenCapitalEvent={onOpenCapitalEvent}
              onOpenDraw={onOpenDraw}
              onOpenMilestone={onOpenMilestone}
            />
          ))}
        </div>
      ) : (
        <Card className="p-4 text-sm">
          <p className="font-medium">No scheduled event on this day</p>
          <p className="mt-1 text-muted-foreground text-xs">
            Continue scrolling the dial to the next milestone or draw.
          </p>
        </Card>
      )}
    </div>
  );
}

function MobileTimelineInsertMenu({
  day,
  menu,
}: {
  day: number;
  menu: MobileTimelineInsertMenuConfig | undefined;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={`Insert timeline item at day ${day}`}
        data-testid="mobile-timeline-insert-menu"
        render={
          <Button
            className="h-11 w-11 shrink-0"
            size="icon"
            type="button"
            variant="outline"
          />
        }
      >
        <Plus className="size-4" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72">
        <div className="px-2 py-1.5">
          <p className="font-medium text-[10px] text-muted-foreground uppercase">
            Insert on roadmap
          </p>
          <p className="font-semibold text-sm">Day {day}</p>
        </div>
        {menu?.onAddMilestone ? (
          <DropdownMenuItem
            className="min-h-11 gap-3"
            data-testid="mobile-insert-milestone"
            onClick={() => menu.onAddMilestone?.(day)}
          >
            <Hammer className="size-4 text-amber-500" />
            {menu.milestoneLabel ?? "Add milestone"}
          </DropdownMenuItem>
        ) : null}
        {menu?.onAddMilestone &&
        (menu?.onAddDraw ||
          menu?.onAddCapitalSpike ||
          menu?.onAddCashInfusion) ? (
          <DropdownMenuSeparator />
        ) : null}
        {menu?.onAddDraw ? (
          <DropdownMenuItem
            className="min-h-11 gap-3"
            data-testid="mobile-insert-draw"
            onClick={() => menu.onAddDraw?.(day)}
          >
            <CircleDollarSign className="size-4 text-rose-500" />
            Add planned draw
          </DropdownMenuItem>
        ) : null}
        {menu?.onAddCapitalSpike ? (
          <DropdownMenuItem
            className="min-h-11 gap-3"
            data-testid="mobile-insert-capital-spike"
            onClick={() => menu.onAddCapitalSpike?.(day)}
          >
            <AlertTriangle className="size-4 text-amber-500" />
            Add capital event
          </DropdownMenuItem>
        ) : null}
        {menu?.onAddCashInfusion ? (
          <DropdownMenuItem
            className="min-h-11 gap-3"
            data-testid="mobile-insert-cash-infusion"
            onClick={() => menu.onAddCashInfusion?.(day)}
          >
            <Banknote className="size-4 text-emerald-600" />
            Add cash infusion
          </DropdownMenuItem>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function MobileLegendDot({
  className,
  label,
}: {
  className: string;
  label: string;
}) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={cn("size-2 rounded-full", className)} />
      {label}
    </span>
  );
}

function MobileDayDial({
  currentDay,
  onDayChange,
  range,
  side,
}: {
  currentDay: number;
  onDayChange: (day: number) => void;
  range: Required<TimelineRange>;
  side: "left" | "right";
}) {
  const clampDay = useCallback(
    (day: number) => Math.round(Math.min(range.max, Math.max(range.min, day))),
    [range.max, range.min]
  );
  const minDay = Math.round(range.min);
  const maxDay = Math.round(range.max);
  const selectedDay = clampDay(Math.round(currentDay));
  const wheelRootRef = useRef<HTMLDivElement | null>(null);
  const lastLiveDayRef = useRef(selectedDay);
  const dayOptions = useMemo<WheelPickerOption<number>[]>(() => {
    const dayCount = Math.max(0, maxDay - minDay + 1);
    return Array.from({ length: dayCount }, (_, index) => {
      const day = minDay + index;
      return {
        label: (
          <span
            className={cn(
              "inline-flex w-full items-center gap-1 tabular-nums",
              side === "right" ? "justify-start" : "justify-end"
            )}
          >
            {side === "right" ? <>D{day}</> : null}
            <span
              aria-hidden="true"
              className="h-px w-2.5 shrink-0 rounded-full bg-current opacity-35"
            />
            {side === "left" ? <>D{day}</> : null}
          </span>
        ),
        textValue: `Day ${day}`,
        value: day,
      };
    });
  }, [maxDay, minDay, side]);
  const publishLiveWheelDay = useCallback(() => {
    const highlightList =
      wheelRootRef.current?.querySelector<HTMLElement>(
        "[data-rwp-highlight-list]"
      ) ?? null;
    const translateY = parseWheelPickerTranslateY(
      highlightList?.style.transform ?? ""
    );
    if (translateY === null) {
      return;
    }
    const optionIndex = Math.round(
      -translateY / MOBILE_DAY_WHEEL_OPTION_ITEM_HEIGHT
    );
    const nextDay = clampDay(minDay + optionIndex);
    if (nextDay === lastLiveDayRef.current) {
      return;
    }
    lastLiveDayRef.current = nextDay;
    onDayChange(nextDay);
  }, [clampDay, minDay, onDayChange]);

  useEffect(() => {
    lastLiveDayRef.current = selectedDay;
  }, [selectedDay]);

  useEffect(() => {
    const highlightList =
      wheelRootRef.current?.querySelector<HTMLElement>(
        "[data-rwp-highlight-list]"
      ) ?? null;
    if (!highlightList || typeof MutationObserver === "undefined") {
      return;
    }

    let frame = 0;
    const schedulePublish = () => {
      if (frame !== 0) {
        return;
      }
      frame = requestAnimationFrame(() => {
        frame = 0;
        publishLiveWheelDay();
      });
    };
    const observer = new MutationObserver(schedulePublish);
    observer.observe(highlightList, {
      attributeFilter: ["style"],
      attributes: true,
    });

    return () => {
      observer.disconnect();
      if (frame !== 0) {
        cancelAnimationFrame(frame);
      }
    };
  }, [publishLiveWheelDay]);

  return (
    <fieldset
      aria-label="Timeline day dial"
      className="relative m-0 min-h-[20rem] min-w-0 touch-pan-y select-none border-0 p-0"
      data-side={side}
      data-testid="mobile-day-dial"
    >
      <label className="sr-only" htmlFor="mobile-day-dial-range">
        Timeline day dial
      </label>
      <input
        aria-label="Selected timeline day"
        className="sr-only"
        id="mobile-day-dial-range"
        max={range.max}
        min={range.min}
        onChange={(event) => onDayChange(clampDay(Number(event.target.value)))}
        type="range"
        value={selectedDay}
      />
      <div
        className={cn(
          "pointer-events-none absolute top-3 bottom-3 w-[7rem] border bg-muted/45",
          side === "right"
            ? "right-[-3.25rem] rounded-l-full"
            : "left-[-3.25rem] rounded-r-full"
        )}
      />
      <div className="pointer-events-none absolute top-1/2 right-0 left-0 h-px -translate-y-1/2 bg-primary/75" />
      <div
        className={cn(
          "relative z-10 flex min-h-[20rem] items-center",
          side === "right" ? "justify-start" : "justify-end"
        )}
      >
        <div
          className="relative w-[3.5rem] **:data-rwp:h-(--mobile-day-wheel-height)! sm:w-[3.75rem]"
          data-testid="mobile-day-wheel"
          ref={wheelRootRef}
          style={
            {
              "--mobile-day-wheel-active-inset": MOBILE_DAY_WHEEL_ACTIVE_INSET,
              "--mobile-day-wheel-height": `${MOBILE_DAY_WHEEL_HEIGHT_PX}px`,
            } as CSSProperties
          }
        >
          <WheelPickerWrapper
            className={cn(
              "w-full border bg-background/70 px-0 py-1 shadow-none backdrop-blur",
              side === "right"
                ? "rounded-r-none rounded-l-full border-r-0"
                : "rounded-r-full rounded-l-none border-l-0"
            )}
          >
            <WheelPicker<number>
              classNames={{
                highlightItem:
                  side === "right"
                    ? "justify-start pl-[calc(0.375rem+var(--mobile-day-wheel-active-inset))] pr-0.5 font-semibold text-foreground text"
                    : "justify-end pr-[calc(0.375rem+var(--mobile-day-wheel-active-inset))] pl-0.5 font-semibold text-foreground text-sm",
                highlightWrapper:
                  side === "right"
                    ? "ml-[var(--mobile-day-wheel-active-inset)] rounded-l-full border border-primary/45 bg-background/95 shadow-xs"
                    : "mr-[var(--mobile-day-wheel-active-inset)] rounded-r-full border border-primary/45 bg-background/95 shadow-xs",
                optionItem:
                  side === "right"
                    ? "justify-start pl-1.5 pr-0.5 font-medium text-muted-foreground/70 text-[16px] leading-none"
                    : "justify-end pr-1.5 pl-0.5 font-medium text-muted-foreground/70 text-[16px] leading-none",
              }}
              dragSensitivity={3}
              infinite={false}
              onValueChange={(day) => onDayChange(clampDay(day))}
              optionItemHeight={MOBILE_DAY_WHEEL_OPTION_ITEM_HEIGHT}
              options={dayOptions}
              scrollSensitivity={4}
              value={selectedDay}
              visibleCount={MOBILE_DAY_WHEEL_VISIBLE_COUNT}
            />
          </WheelPickerWrapper>
          <div
            className={cn(
              "pointer-events-none absolute top-1/2 -translate-y-1/2 rounded-full border bg-background p-1 shadow-xs",
              side === "right"
                ? "left-[calc(0.125rem+var(--mobile-day-wheel-active-inset))]"
                : "right-[calc(0.125rem+var(--mobile-day-wheel-active-inset))]"
            )}
          >
            <div className="grid size-6 place-items-center rounded-full bg-primary text-[10px] text-primary-foreground tabular-nums">
              D{selectedDay}
            </div>
          </div>
        </div>
      </div>
    </fieldset>
  );
}

function parseWheelPickerTranslateY(transform: string): number | null {
  if (!transform || transform === "none") {
    return null;
  }
  const translateMatch = WHEEL_TRANSLATE_Y_RE.exec(transform);
  if (translateMatch?.[1]) {
    return Number(translateMatch[1]);
  }
  const matrixMatch = WHEEL_MATRIX_RE.exec(transform);
  if (matrixMatch?.[1]) {
    const values = matrixMatch[1].split(",").map((value) => Number(value));
    return Number.isFinite(values[5]) ? values[5] : null;
  }
  const matrix3dMatch = WHEEL_MATRIX_3D_RE.exec(transform);
  if (matrix3dMatch?.[1]) {
    const values = matrix3dMatch[1].split(",").map((value) => Number(value));
    return Number.isFinite(values[13]) ? values[13] : null;
  }
  return null;
}

function MobileDayEventCard({
  active,
  event,
  onOpenCapitalEvent,
  onOpenDraw,
  onOpenMilestone,
}: {
  active?: boolean;
  event: MobileDayTimelineEvent;
  onOpenCapitalEvent: (capitalSpikeId: string) => void;
  onOpenDraw: (drawId: string) => void;
  onOpenMilestone: (itemId: string) => void;
}) {
  const Icon = mobileEventIcon(event.kind);
  const eventId = event.id.replace(MOBILE_EVENT_ID_PREFIX_RE, "");
  const artworkIcon = mobileDayEventArtworkIcon(event);
  const showMilestoneArtwork = Boolean(artworkIcon);
  return (
    <Card
      className={cn(
        "min-h-[4.25rem] p-0 outline-none transition focus-visible:ring-2 focus-visible:ring-primary/70",
        active && "shadow-sm",
        event.selected && "ring-1 ring-success/60"
      )}
      data-testid={`mobile-day-event-${event.id}`}
      onClick={() => {
        if (event.kind === "draw") {
          onOpenDraw(eventId);
        } else if (event.kind === "capital") {
          onOpenCapitalEvent(eventId);
        } else if (event.itemId) {
          onOpenMilestone(event.itemId);
        }
      }}
      render={<button type="button" />}
    >
      <div className="grid grid-cols-[2.85rem_3.35rem_minmax(0,1fr)_0.75rem] items-center gap-1.5 p-2.5 text-left sm:grid-cols-[3.75rem_3.65rem_minmax(0,1fr)_1rem] sm:gap-2 sm:p-3">
        <div className="text-center">
          <div
            className={cn(
              "font-semibold text-base tabular-nums sm:text-lg",
              event.selected && "text-success"
            )}
          >
            D{event.day}
          </div>
          {event.kind === "milestone" && event.endDay !== event.day ? (
            <div className="whitespace-nowrap text-[10px] text-muted-foreground tabular-nums">
              to D{event.endDay}
            </div>
          ) : null}
        </div>
        <div
          className={cn(
            "grid place-items-center overflow-hidden",
            showMilestoneArtwork
              ? "size-12 rounded-lg bg-muted/35 sm:size-13"
              : "size-9 rounded-full border bg-muted/50 sm:size-10",
            event.selected &&
              showMilestoneArtwork &&
              "bg-primary/10 ring-1 ring-primary/35",
            event.kind === "capital" && "text-success",
            event.kind === "draw" && !showMilestoneArtwork && "text-info",
            event.kind === "milestone" && !event.icon && "text-primary"
          )}
          data-testid={`mobile-day-event-icon-${event.id}`}
        >
          {showMilestoneArtwork && artworkIcon ? (
            <IsometricMilestoneIcon
              className="size-14 -translate-y-0.5 sm:size-16"
              type={artworkIcon}
            />
          ) : (
            <Icon className="size-5" />
          )}
        </div>
        <div className="min-w-0">
          <div className="mb-1 flex items-center gap-1.5">
            <Badge size="sm" variant={mobileEventBadgeVariant(event)}>
              {event.status}
            </Badge>
            <span className="truncate text-[10px] text-muted-foreground uppercase">
              {event.meta}
            </span>
          </div>
          <p className="truncate font-semibold text-sm">{event.title}</p>
          {event.amount === null ? null : (
            <p className="whitespace-nowrap text-xs tabular-nums">
              {money(event.amount)}
            </p>
          )}
        </div>
        <ChevronRight className="size-4 text-muted-foreground" />
      </div>
    </Card>
  );
}

function mobileDayEventArtworkIcon(
  event: MobileDayTimelineEvent
): IsometricIconKey | undefined {
  if (event.kind === "capital") {
    return;
  }
  return (
    resolveIsometricIconKey(event.icon) ??
    inferIsometricIconKeyFromText(
      event.itemId,
      event.id,
      event.title,
      event.meta
    ) ??
    "change"
  );
}

function mobileEventIcon(kind: MobileDayTimelineEventKind) {
  if (kind === "capital") {
    return Landmark;
  }
  if (kind === "draw") {
    return CircleDollarSign;
  }
  return Hammer;
}

function mobileEventBadgeVariant(
  event: MobileDayTimelineEvent
): "default" | "destructive" | "outline" | "secondary" | "success" | "warning" {
  if (event.status === "Rejected") {
    return "destructive";
  }
  if (event.status === "Requested" || event.status === "Review") {
    return "warning";
  }
  if (
    event.status === "Approved" ||
    event.status === "Released" ||
    event.status === "Opened"
  ) {
    return "success";
  }
  if (event.selected) {
    return "default";
  }
  return "outline";
}

// ---------------------------------------------------------------------------
// Level 0 — Sticky minimap (read-only spatial overview)
// ---------------------------------------------------------------------------

export interface TimelineMinimapProps {
  collapsed?: boolean;
  currentDay: number;
  draws: DemoDraw[];
  items: TimelineItem<DemoMilestone>[];
  onJumpToMilestone: (itemId: string) => void;
  onOpenDraw: (drawId: string) => void;
  range: Required<TimelineRange>;
  shortfallDays?: number[];
}

export function TimelineMinimap({
  collapsed = false,
  currentDay,
  draws,
  items,
  onJumpToMilestone,
  onOpenDraw,
  range,
  shortfallDays = [],
}: TimelineMinimapProps) {
  const span = Math.max(1, range.max - range.min);
  const toPct = useCallback(
    (value: number) =>
      `${Math.min(100, Math.max(0, ((value - range.min) / span) * 100))}%`,
    [range.min, span]
  );

  return (
    <div
      className="border-border border-b bg-background/95 px-3 pt-2 pb-3 backdrop-blur"
      data-testid="timeline-minimap"
    >
      <div className="mb-1 flex items-center justify-between">
        <span className="font-medium text-[10px] text-muted-foreground uppercase tracking-wide">
          Plan overview
        </span>
        <span className="text-[10px] text-muted-foreground tabular-nums">
          Day {Math.round(currentDay)}
        </span>
      </div>
      <div
        className={cn(
          "relative w-full rounded-md bg-muted/50",
          collapsed ? "h-6" : "h-12"
        )}
      >
        {/* current-day marker */}
        <div
          className="absolute top-0 bottom-0 z-10 w-0.5 bg-primary"
          data-testid="timeline-minimap-current-day"
          style={{ left: toPct(currentDay) }}
        />
        {/* milestone ticks (tap-to-jump) */}
        {items
          .filter((item) => item.data)
          .map((item) => {
            const startX = Math.round(item.x);
            return (
              <button
                aria-label={`Jump to ${item.data?.name ?? "milestone"}`}
                className="absolute top-1 bottom-1 z-20 w-3 -translate-x-1/2 rounded-sm bg-foreground/70 active:bg-primary"
                data-testid={`timeline-minimap-milestone-${item.id}`}
                key={item.id}
                onClick={() => onJumpToMilestone(item.id)}
                style={{ left: toPct(startX) }}
                type="button"
              />
            );
          })}
        {/* draw dots (tap-to-open) */}
        {!collapsed &&
          draws.map((draw) => {
            const state = mobileDrawState(draw, currentDay);
            return (
              <button
                aria-label={`Open ${draw.label}`}
                className={cn(
                  "absolute top-1/2 z-30 size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full ring-1 ring-background",
                  state === "happened" && "bg-emerald-500",
                  state === "requested" && "bg-amber-500",
                  state === "rejected" && "bg-destructive",
                  state === "planned" && "bg-sky-500"
                )}
                data-testid={`timeline-minimap-draw-${draw.id}`}
                key={draw.id}
                onClick={() => onOpenDraw(draw.id)}
                style={{ left: toPct(draw.x) }}
                type="button"
              />
            );
          })}
        {/* capital-shortfall sparkline markers */}
        {!collapsed &&
          shortfallDays.map((day) => (
            <div
              className="absolute bottom-0 z-10 h-2 w-0.5 -translate-x-1/2 bg-destructive"
              data-testid="timeline-minimap-shortfall"
              key={`shortfall-${day}`}
              style={{ left: toPct(day) }}
            />
          ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Level 1 — Milestone feed
// ---------------------------------------------------------------------------

const STATUS_TONE_CLASS: Record<MilestoneFeedRowState["statusTone"], string> = {
  active: "border-rose-200 bg-rose-50 text-rose-700",
  complete: "border-emerald-200 bg-emerald-50 text-emerald-700",
  ready: "border-zinc-200 bg-zinc-50 text-zinc-600",
  upcoming: "border-zinc-200 bg-zinc-50 text-zinc-500",
};

export interface MilestoneFeedRowProps {
  onOpenFocus: (itemId: string) => void;
  onPrimaryAction: (action: PrimaryAction, itemId: string) => void;
  onStructuralAction: (action: StructuralAction, itemId: string) => void;
  readOnly: boolean;
  registerRef: (itemId: string, el: HTMLElement | null) => void;
  rowState: MilestoneFeedRowState;
}

export type StructuralAction = "editDates" | "editBudget" | "deleteMilestone";

function MilestoneFeedRow({
  onOpenFocus,
  onPrimaryAction,
  onStructuralAction,
  readOnly,
  registerRef,
  rowState,
}: MilestoneFeedRowProps) {
  const { item } = rowState;
  const name = item.data?.name ?? "Milestone";
  return (
    <article
      className="rounded-lg border border-border bg-card p-4 shadow-sm"
      data-testid={`mobile-milestone-row-${item.id}`}
      ref={(el) => registerRef(item.id, el)}
    >
      <div className="flex items-start justify-between gap-3">
        <button
          className="flex min-w-0 flex-1 items-center gap-3 text-left"
          data-testid={`mobile-milestone-open-${item.id}`}
          onClick={() => onOpenFocus(item.id)}
          type="button"
        >
          {item.data?.icon ? (
            <span
              className="grid size-14 shrink-0 place-items-center overflow-hidden rounded-md bg-muted/55"
              data-testid={`mobile-milestone-icon-${item.id}`}
            >
              <IsometricMilestoneIcon
                className="size-14"
                type={item.data.icon}
              />
            </span>
          ) : null}
          <span className="min-w-0 flex-1">
            <h3 className="truncate font-semibold text-base">{name}</h3>
            <p className="mt-0.5 text-muted-foreground text-xs tabular-nums">
              Day {rowState.startDay}–{rowState.endDay} ·{" "}
              {money(rowState.budget)}
            </p>
          </span>
        </button>
        <div className="flex shrink-0 items-center gap-1">
          <span
            className={cn(
              "rounded-full border px-2 py-0.5 font-medium text-[11px]",
              STATUS_TONE_CLASS[rowState.statusTone]
            )}
            data-testid={`mobile-milestone-status-${item.id}`}
          >
            {rowState.statusLabel}
          </span>
          <DropdownMenu>
            <DropdownMenuTrigger
              aria-label="Milestone actions"
              className="grid size-8 place-items-center rounded-md text-muted-foreground hover:bg-muted"
              data-testid={`mobile-milestone-menu-${item.id}`}
              render={<button type="button" />}
            >
              <MoreVertical className="size-4" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => onOpenFocus(item.id)}>
                Open details
              </DropdownMenuItem>
              {readOnly ? null : (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    data-testid={`mobile-milestone-edit-dates-${item.id}`}
                    onClick={() => onStructuralAction("editDates", item.id)}
                  >
                    Edit dates
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    data-testid={`mobile-milestone-edit-budget-${item.id}`}
                    onClick={() => onStructuralAction("editBudget", item.id)}
                  >
                    Edit budget
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    data-testid={`mobile-milestone-delete-${item.id}`}
                    onClick={() =>
                      onStructuralAction("deleteMilestone", item.id)
                    }
                    variant="destructive"
                  >
                    Delete milestone
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* inline state chips that used to be hover-only */}
      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        <Badge variant="outline">{rowState.evidenceLabel}</Badge>
        {rowState.evidenceCount > 0 ? (
          <Badge variant="secondary">{rowState.evidenceCount} files</Badge>
        ) : null}
        {rowState.draws.map(({ draw, state }) => (
          <Badge key={draw.id} variant={DRAW_STATE_TONE[state]}>
            {money(draw.amount)} · {DRAW_STATE_COPY[state]}
          </Badge>
        ))}
      </div>

      {rowState.blockingMilestoneNames.length > 0 ? (
        <p
          className="mt-2 text-amber-700 text-xs dark:text-amber-300"
          data-testid={`mobile-milestone-blocked-${item.id}`}
        >
          Blocked by {rowState.blockingMilestoneNames.join(", ")}
        </p>
      ) : null}

      {rowState.primaryAction && rowState.primaryAction.intent !== "open" ? (
        <Button
          className="mt-3 w-full"
          data-testid={`mobile-milestone-primary-${item.id}`}
          onClick={() =>
            rowState.primaryAction &&
            onPrimaryAction(rowState.primaryAction, item.id)
          }
          size="sm"
        >
          {rowState.primaryAction.label}
        </Button>
      ) : null}
    </article>
  );
}

export interface MilestoneFeedProps {
  currentDay: number;
  draws: DemoDraw[];
  financialsSlot?: ReactNode;
  items: TimelineItem<DemoMilestone>[];
  onOpenFocus: (itemId: string) => void;
  onPrimaryAction: (action: PrimaryAction, itemId: string) => void;
  onStructuralAction: (action: StructuralAction, itemId: string) => void;
  readOnly: boolean;
  registerRef: (itemId: string, el: HTMLElement | null) => void;
  reviewsSlot?: ReactNode;
  role: MobileTimelineRole;
}

export function MilestoneFeed({
  currentDay,
  draws,
  financialsSlot,
  items,
  onOpenFocus,
  onPrimaryAction,
  onStructuralAction,
  readOnly,
  registerRef,
  reviewsSlot,
  role,
}: MilestoneFeedProps) {
  const rows = useMemo(
    () =>
      items
        .filter((item) => item.data)
        .map((item) =>
          deriveMilestoneRowState({ currentDay, draws, item, items, role })
        ),
    [currentDay, draws, items, role]
  );

  return (
    <div className="grid gap-3 p-3" data-testid="mobile-milestone-feed">
      {financialsSlot ? (
        <CollapsibleSection
          defaultOpen={false}
          testId="mobile-financials-section"
          title="Financials"
        >
          {financialsSlot}
        </CollapsibleSection>
      ) : null}
      {reviewsSlot ? (
        <CollapsibleSection
          defaultOpen={false}
          testId="mobile-reviews-section"
          title="Requests & reviews"
        >
          {reviewsSlot}
        </CollapsibleSection>
      ) : null}
      {rows.map((rowState) => (
        <MilestoneFeedRow
          key={rowState.item.id}
          onOpenFocus={onOpenFocus}
          onPrimaryAction={onPrimaryAction}
          onStructuralAction={onStructuralAction}
          readOnly={readOnly}
          registerRef={registerRef}
          rowState={rowState}
        />
      ))}
    </div>
  );
}

function CollapsibleSection({
  children,
  defaultOpen,
  testId,
  title,
}: {
  children: ReactNode;
  defaultOpen: boolean;
  testId: string;
  title: string;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section
      className="rounded-lg border border-border bg-card shadow-sm"
      data-testid={testId}
    >
      <button
        aria-expanded={open}
        className="flex w-full items-center justify-between px-4 py-3 text-left font-semibold text-sm"
        onClick={() => setOpen((value) => !value)}
        type="button"
      >
        {title}
        <ChevronRight
          className={cn("size-4 transition-transform", open && "rotate-90")}
        />
      </button>
      {open ? <div className="px-4 pb-4">{children}</div> : null}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Level 2 — Focus mode (one milestone, swipe / prev-next to advance)
// ---------------------------------------------------------------------------

const SWIPE_THRESHOLD_PX = 56;

export interface MilestoneFocusViewProps {
  children: ReactNode;
  index: number;
  onClose: () => void;
  onNavigate: (nextIndex: number) => void;
  title: string;
  total: number;
}

export function MilestoneFocusView({
  children,
  index,
  onClose,
  onNavigate,
  title,
  total,
}: MilestoneFocusViewProps) {
  const startX = useRef<number | null>(null);
  const canPrev = index > 0;
  const canNext = index < total - 1;

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    startX.current = event.clientX;
  };
  const onPointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (startX.current === null) {
      return;
    }
    const delta = event.clientX - startX.current;
    startX.current = null;
    if (delta <= -SWIPE_THRESHOLD_PX && canNext) {
      onNavigate(index + 1);
    } else if (delta >= SWIPE_THRESHOLD_PX && canPrev) {
      onNavigate(index - 1);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-background"
      data-testid="mobile-focus-view"
    >
      <header className="flex items-center gap-2 border-border border-b px-3 py-2">
        <Button
          aria-label="Back to feed"
          data-testid="mobile-focus-close"
          onClick={onClose}
          size="sm"
          variant="ghost"
        >
          Done
        </Button>
        <div className="flex flex-1 items-center justify-center gap-2">
          <Button
            aria-label="Previous milestone"
            data-testid="mobile-focus-prev"
            disabled={!canPrev}
            onClick={() => onNavigate(index - 1)}
            size="icon"
            variant="ghost"
          >
            <ChevronLeft className="size-4" />
          </Button>
          <span className="text-muted-foreground text-xs tabular-nums">
            {index + 1} / {total}
          </span>
          <Button
            aria-label="Next milestone"
            data-testid="mobile-focus-next"
            disabled={!canNext}
            onClick={() => onNavigate(index + 1)}
            size="icon"
            variant="ghost"
          >
            <ChevronRight className="size-4" />
          </Button>
        </div>
        <span className="w-12" />
      </header>
      <div
        className="min-h-0 flex-1 overflow-y-auto px-4 py-4"
        data-testid="mobile-focus-scroll"
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
      >
        <h2 className="mb-3 font-semibold text-lg">{title}</h2>
        {children}
      </div>
    </div>
  );
}
