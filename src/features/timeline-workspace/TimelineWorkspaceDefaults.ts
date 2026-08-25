import type {
  TimelineItem,
  TimelineRange,
} from "#/components/roadmap/AnimatedCurvedTimeline.tsx";
import { normalizeSiteVisitTokenRoute } from "#/features/build-workspace-demo/site-visit-token-route-model.ts";
import type {
  DemoCapitalSpike,
  DemoMilestone,
} from "./-timeline-share-snapshot.ts";
import {
  DEFAULT_DRAW_REVIEW_LAG_DAYS,
  getMilestoneEndX,
  normalizeMilestoneTimelineItems,
} from "./-timeline-milestone-schedule.ts";
import {
  mapSubmilestoneSnapshotRows,
} from "./-timeline-milestone-submilestones.ts";
import type {
  TimelineModificationRequestView,
  TimelinePlanStatePersistenceInput,
  TimelineResponsiveSizing,
  TimelineWorkspaceMode,
} from "./TimelineWorkspaceTypes.ts";

export const BASE_INITIAL_RANGE: TimelineRange = {
  max: 230,
  min: 0,
  unit: "days",
};
export const CHART_PROBE_INTERVAL_DAYS = 5;
export const MINIMUM_POST_MILESTONE_CASH_RESERVE = 0;
export const STARTING_CASH = 400_000;
export const INITIAL_CURRENT_DAY = 86;
export const GENERATED_TIMELINE_CURRENT_DAY = 0;
export const TIMELINE_END_PADDING_DAYS = DEFAULT_DRAW_REVIEW_LAG_DAYS;
export const INITIAL_CAPITAL_SPIKES: DemoCapitalSpike[] = [];
export const INITIAL_COMPLETION_SUBMITTED_AT = "2026-05-01T14:00:00.000Z";
export const LOCAL_TIMELINE_SHARE_PREFIX = "local-timeline-";
export const DEFAULT_TIMELINE_SHARE_PATH = "/proposal-preview";
const TIMELINE_TO_DEMO_MILESTONE_KEY: Record<string, string> = {
  closeout: "aluminum_windows",
  drywall: "aluminum_windows",
  exterior: "aluminum_windows",
  finishes: "aluminum_windows",
  framing: "framing",
  "rough-in": "aluminum_windows",
  "site-prep": "foundation",
};

export function getDemoApprovalStartDate(now = Date.now()) {
  const date = new Date(now);
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

export function resolveDemoLiveBuildHref({
  buildKey,
  liveBuildHref,
}: {
  buildKey?: string | null;
  liveBuildHref?: string | null;
}) {
  if (liveBuildHref) {
    return liveBuildHref;
  }

  return buildKey ? `/backoffice/builds/${buildKey}` : undefined;
}

export const INITIAL_ITEMS: TimelineItem<DemoMilestone>[] = [
  {
    data: {
      amount: 125_000,
      completionClaim: {
        actualCost: 125_000,
        completedDay: 28,
        submittedAt: INITIAL_COMPLETION_SUBMITTED_AT,
      },
      draw: "Draw 1",
      drawX: 36,
      durationDays: 14,
      evidence: "Accepted package",
      icon: "foundation",
      name: "Site prep & foundation",
      policy: "Released",
      status: "complete",
      subMilestones: ["Permit mobilization", "Excavation", "Concrete forms"],
    },
    eyebrow: "Milestone 1",
    id: "site-prep",
    label: "Site prep",
    lane: 0,
    markerLabel: "1",
    tone: "complete",
    x: 14,
  },
  {
    data: {
      amount: 160_000,
      completionClaim: {
        actualCost: 160_000,
        completedDay: 56,
        submittedAt: INITIAL_COMPLETION_SUBMITTED_AT,
      },
      draw: "Draw 2",
      drawX: 64,
      durationDays: 18,
      evidence: "Accepted package",
      icon: "framing",
      name: "Framing & structure",
      policy: "Released",
      status: "complete",
      subMilestones: ["Wall framing", "Roof trusses", "Structural sheathing"],
    },
    eyebrow: "Milestone 2",
    id: "framing",
    label: "Framing",
    lane: -1,
    markerLabel: "2",
    tone: "complete",
    x: 38,
  },
  {
    data: {
      amount: 245_000,
      draw: "Draw 3",
      drawX: 94,
      durationDays: 20,
      evidence: "Site visit today",
      icon: "roughIn",
      name: "Rough-in mechanical",
      policy: "Admin review",
      status: "ready",
      subMilestones: ["Plumbing rough-in", "Electrical rough-in", "HVAC ducts"],
    },
    eyebrow: "Milestone 3",
    id: "rough-in",
    label: "Rough-in",
    lane: 1,
    markerLabel: "3",
    tone: "active",
    x: 66,
  },
  {
    data: {
      amount: 210_000,
      draw: "Draw 4",
      drawX: 122,
      durationDays: 18,
      evidence: "Draft started",
      icon: "exterior",
      name: "Windows & exterior",
      policy: "Evidence required",
      status: "ready",
      subMilestones: ["Window install", "Weather barrier", "Exterior doors"],
    },
    eyebrow: "Milestone 4",
    id: "exterior",
    label: "Exterior",
    lane: 0,
    markerLabel: "4",
    tone: "warning",
    x: 96,
  },
  {
    data: {
      amount: 190_000,
      draw: "Draw 5",
      drawX: 148,
      durationDays: 16,
      evidence: "Not started",
      icon: "drywall",
      name: "Inspections & drywall",
      policy: "Upcoming",
      status: "upcoming",
      subMilestones: ["Rough-in inspection", "Insulation", "Drywall hang"],
    },
    eyebrow: "Milestone 5",
    id: "drywall",
    label: "Drywall",
    lane: -1,
    markerLabel: "5",
    tone: "upcoming",
    x: 124,
  },
  {
    data: {
      amount: 160_000,
      draw: "Draw 6",
      drawX: 170,
      durationDays: 12,
      evidence: "Not started",
      icon: "finishes",
      name: "Finishes & fixtures",
      policy: "Upcoming",
      status: "upcoming",
      subMilestones: ["Cabinetry", "Flooring", "Fixture set"],
    },
    eyebrow: "Milestone 6",
    id: "finishes",
    label: "Finishes",
    lane: 1,
    markerLabel: "6",
    tone: "upcoming",
    x: 150,
  },
  {
    data: {
      amount: 160_000,
      draw: "Draw 7",
      drawX: 184,
      durationDays: 4,
      evidence: "Not started",
      icon: "closeout",
      name: "Final inspection & closeout",
      policy: "Upcoming",
      status: "upcoming",
      subMilestones: ["Punch list", "Final inspection", "Closeout package"],
    },
    eyebrow: "Milestone 7",
    id: "closeout",
    label: "Closeout",
    lane: 0,
    markerLabel: "7",
    tone: "upcoming",
    x: 172,
  },
];

export const NORMALIZED_INITIAL_ITEMS = normalizeMilestoneTimelineItems(INITIAL_ITEMS);
export const INITIAL_RANGE = expandTimelineRangeForMilestones(
  NORMALIZED_INITIAL_ITEMS,
  BASE_INITIAL_RANGE
);

export const money = (value: number) =>
  new Intl.NumberFormat("en-US", {
    currency: "USD",
    maximumFractionDigits: 0,
    style: "currency",
  }).format(value);

export const dollarsToCents = (value: number) => Math.round(value * 100);

export function resolveTimelineSiteVisitMilestoneKey(itemId: string) {
  return TIMELINE_TO_DEMO_MILESTONE_KEY[itemId] ?? itemId;
}

export function resolveTimelinePersistenceSiteVisitMilestoneKey(
  itemId: string,
  workspaceMode: TimelineWorkspaceMode
) {
  return workspaceMode === "demo"
    ? resolveTimelineSiteVisitMilestoneKey(itemId)
    : itemId;
}

export function normalizeTimelineSiteVisitStatus(
  status?: string,
  tokenExpiresAt?: number,
  now = Date.now()
) {
  if (status === "completed") {
    return "complete";
  }
  if (status === "claimed" || status === "in_progress") {
    return "in progress";
  }
  if (tokenExpiresAt && tokenExpiresAt <= now) {
    return "expired";
  }
  if (status === "requested") {
    return "un-opened";
  }
  return "not requested";
}

export function buildAbsoluteSiteVisitUrl(path?: string) {
  const normalizedPath = normalizeSiteVisitTokenRoute({ url: path });
  if (!normalizedPath) {
    return "";
  }
  if (/^https?:\/\//i.test(normalizedPath)) {
    return normalizedPath;
  }
  if (typeof window === "undefined") {
    return normalizedPath;
  }
  return `${window.location.origin}${normalizedPath}`;
}

export function findLiveSiteVisit(workspace: any, visitId?: string) {
  if (!(workspace && visitId)) {
    return null;
  }

  for (const milestone of workspace.milestones ?? []) {
    for (const visit of milestone.siteVisits ?? []) {
      if (visit._id === visitId) {
        return visit;
      }
    }
  }

  return null;
}

export const fileSizeFormatter = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 1,
});

export const routeSectionVariants = {
  hidden: {
    filter: "blur(10px)",
    opacity: 0,
    y: 24,
  },
  show: {
    filter: "blur(0px)",
    opacity: 1,
    transition: {
      duration: 0.48,
      ease: [0.16, 1, 0.3, 1],
    },
    y: 0,
  },
} as const;

export function normalizeDemoRange(range: TimelineRange): Required<TimelineRange> {
  const min = Number.isFinite(range.min) ? range.min : 0;
  const max =
    Number.isFinite(range.max) && range.max > min ? range.max : min + 1;

  return {
    max,
    min,
    unit: range.unit ?? "",
  };
}

export function expandTimelineRangeForMilestones(
  items: TimelineItem<DemoMilestone>[],
  range: TimelineRange
): Required<TimelineRange> {
  const resolvedRange = normalizeDemoRange(range);
  const lastCompletionX = items.reduce(
    (nextMax, item) => Math.max(nextMax, getMilestoneEndX(item)),
    Number.NEGATIVE_INFINITY
  );
  const max = Number.isFinite(lastCompletionX)
    ? Math.max(
        resolvedRange.max,
        resolvedRange.min + 1,
        lastCompletionX + TIMELINE_END_PADDING_DAYS
      )
    : Math.max(
        resolvedRange.max,
        resolvedRange.min + TIMELINE_END_PADDING_DAYS
      );

  return {
    ...resolvedRange,
    max,
  };
}

export function toDemoTimelinePlanStateMutationInput(
  input: TimelinePlanStatePersistenceInput
) {
  const { minimumCashReserveCents: _productionOnlyReserve, ...demoInput } =
    input;
  return demoInput;
}

export function createTimelineSaveReference(): string {
  const randomPart =
    globalThis.crypto?.randomUUID?.() ??
    `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  return `TL-${randomPart
    .replace(/[^a-z0-9-]/gi, "")
    .slice(0, 12)
    .toUpperCase()}`;
}

export const EMPTY_TIMELINE_MODIFICATION_REQUESTS: TimelineModificationRequestView[] =
  [];

export function getTimelineResponsiveSizing(
  isCompactLayout: boolean,
  isPhoneLayout: boolean
): TimelineResponsiveSizing {
  if (isPhoneLayout) {
    return {
      barSize: 14,
      cardWidth: 224,
      endCardWidth: 244,
      minNodeSpacingPx: 184,
      paddingX: 128,
      pixelsPerUnit: 5.35,
      yAxisWidth: 48,
    };
  }

  if (isCompactLayout) {
    return {
      barSize: 20,
      cardWidth: 232,
      endCardWidth: 260,
      minNodeSpacingPx: 190,
      paddingX: 136,
      pixelsPerUnit: 5.85,
      yAxisWidth: 58,
    };
  }

  return {
    barSize: 20,
    cardWidth: 232,
    endCardWidth: 276,
    minNodeSpacingPx: 198,
    paddingX: 136,
    pixelsPerUnit: 6.4,
    yAxisWidth: 58,
  };
}

export function timelineMilestonePayloadToItem(
  milestone: any,
  approved = false
): TimelineItem<DemoMilestone> {
  const milestoneKey = milestone.milestoneKey ?? milestone.key ?? "milestone";
  const submilestoneDetails = mapSubmilestoneSnapshotRows(
    milestone.submilestoneSnapshot ??
      (milestone.submilestones ?? []).map(
        (
          submilestone: {
            budgetCents?: number;
            description?: string;
            durationDays?: number;
            key?: string;
            name: string;
            order?: number;
          },
          index: number
        ) => ({
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
          order: submilestone.order ?? index + 1,
        })
      ),
    milestoneKey
  );

  return {
    data: {
      amount: Math.round((milestone.budgetCents ?? 0) / 100),
      draw: milestone.drawKey ?? "Requested draw",
      ...(milestone.drawAvailabilityCents === undefined
        ? {}
        : {
            drawAvailabilityAmount: Math.round(
              milestone.drawAvailabilityCents / 100
            ),
          }),
      durationDays:
        milestone.durationDays ??
        Math.max(1, (milestone.dayEnd ?? 1) - (milestone.dayStart ?? 0)),
      evidence: milestone.evidenceState ?? "Requested change",
      icon: milestone.icon ?? "change",
      name: milestone.name ?? "Requested milestone",
      policy: milestone.policyState ?? "Admin approval required",
      status: (approved ? "ready" : "review") as DemoMilestone["status"],
      subMilestones: submilestoneDetails.map(
        (submilestone) => submilestone.name
      ),
      submilestoneDetails,
    },
    disabled: !approved,
    eyebrow: approved ? "Approved live change" : "Requested milestone",
    id: milestone.milestoneKey,
    label: milestone.name ?? "Requested milestone",
    lane: milestone.lane,
    markerLabel: milestone.markerLabel ?? "+",
    tone: milestone.tone ?? "warning",
    x: milestone.x ?? milestone.dayStart ?? 0,
  };
}
