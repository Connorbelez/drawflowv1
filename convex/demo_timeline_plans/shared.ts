import {
  makeFunctionReference,
  type StorageReader,
  type StorageWriter,
} from "convex/server";
import { v } from "convex/values";
import { DEMO_ORG_KEY } from "../demo_personas";
import {
  defaultSiteVisitGuidance,
  guidanceItemsToGuidance,
  guidanceToItems,
  normalizeSiteVisitGuidance,
  type SiteVisitGuidance,
} from "../demo_site_visit_guidance";
import {
  GARDEN_SUITE_DEMO_TEMPLATE_KEY,
  GARDEN_SUITE_DESCRIPTION,
  GARDEN_SUITE_SECTIONS,
  GARDEN_SUITE_SUMMARY,
  GARDEN_SUITE_TEMPLATE_TITLE,
} from "../gardenSuiteTemplate";
import type { DatabaseReader, DatabaseWriter, Doc, Id } from "../types";
export const ORG_KEY = DEMO_ORG_KEY;
export const DEFAULT_FLAT_DRAW_FEE_CENTS = 50_000;
export const DEFAULT_DRAW_REVIEW_LAG_DAYS = 5;
export const DEFAULT_INTEREST_ANNUAL_BPS = 925;
export const DEFAULT_PAYOFF_DATE = "2027-01-05";
export const DEFAULT_PROJECT_START_DATE = "2026-06-01";
export const DEFAULT_TODAY_DATE = "2026-05-20";
export const TOTAL_REIMBURSEMENT_BPS = 10_000;
export const DEFAULT_BORROWER_CO_PAY_BPS = 2000;
export const TOKEN_TTL_MS = 60 * 60 * 1000;
export const SHORT_LINK_PATTERN = /^[a-z]+-[a-z]+-[a-z0-9]{4}$/;

export type DemoTimelineSiteVisitGuidanceInput = Parameters<
  typeof normalizeSiteVisitGuidance
>[0];
export const drawflowBackofficeDashboardQuery = makeFunctionReference<"query">(
  "demo_drawflow:demo_getBackofficeDashboard"
);

export function normalizeDrawRequestStatus(
  status: string | undefined
): DrawRequestStatus {
  const allowed = new Set<DrawRequestStatus>([
    "approved",
    "draft",
    "rejected",
    "requested",
  ]);
  return status && allowed.has(status as DrawRequestStatus)
    ? (status as DrawRequestStatus)
    : "draft";
}

export const slugVerbs = [
  "steady",
  "verified",
  "mapped",
  "ready",
  "bright",
  "solid",
  "clear",
  "guided",
];

export const slugNouns = [
  "maple",
  "cedar",
  "harbor",
  "ridge",
  "foundry",
  "ledger",
  "beam",
  "parcel",
];

export const base36Alphabet = "abcdefghijklmnopqrstuvwxyz0123456789";

export type TimelinePlanId = Id<"demo_timelinePlans">;
export type TimelinePlan = Doc<"demo_timelinePlans">;
export type TimelineMilestone = Doc<"demo_timelineMilestones">;
export type TimelineDraw = Doc<"demo_timelineDraws">;
export type TimelineCapitalEvent = Doc<"demo_timelineCapitalEvents">;
export type TimelineEvidenceAsset = Doc<"demo_timelineEvidenceAssets">;
export type TimelineModificationRequest = Doc<"demo_timelineModificationRequests">;
export type TimelineIcon =
  | "change"
  | "closeout"
  | "drywall"
  | "exterior"
  | "finishes"
  | "foundation"
  | "framing"
  | "kitchen"
  | "plumbing"
  | "roofing"
  | "roughIn";
export type TimelineStatus = "complete" | "ready" | "review" | "upcoming";
export type TimelineTone = "active" | "blocked" | "complete" | "upcoming" | "warning";
export type DrawRequestStatus = "approved" | "draft" | "rejected" | "requested";
export type TimelineCapitalEventKind = "cashInfusion" | "cost";
export type TimelineModificationRequestType =
  | "createMilestone"
  | "deleteMilestone"
  | "updateMilestoneBudget";
export const DAY_MS = 86_400_000;
export const START_DATE_ERROR = "startDate must be ≥ today (UTC)";
export interface NormalizedDraw {
  amountCents: number;
  customDate: boolean;
  drawKey: string;
  itemMilestoneKey?: string;
  label: string;
  order: number;
  requestedAt?: string;
  requestNote?: string;
  requestReviewNote?: string;
  requestStatus: DrawRequestStatus;
  reviewedAt?: string;
  x: number;
}
export type DrawInput = Omit<
  NormalizedDraw,
  "customDate" | "order" | "requestStatus"
> & {
  customDate?: boolean;
  order?: number;
  requestStatus?: string;
};

export interface DemoReadCtx {
  db: DatabaseReader;
  storage: StorageReader;
}

export interface DemoWriteCtx {
  db: DatabaseWriter;
  storage: StorageWriter;
}

export const submilestoneInputValidator = v.object({
  budgetCents: v.optional(v.number()),
  description: v.optional(v.string()),
  durationDays: v.optional(v.number()),
  key: v.optional(v.string()),
  name: v.string(),
  order: v.optional(v.number()),
});

export function toSubmilestoneSnapshot(
  submilestones: {
    budgetCents?: number;
    description?: string;
    durationDays?: number;
    key?: string;
    name: string;
    order?: number;
  }[],
  milestoneKey: string
) {
  return submilestones.map((submilestone, index) => ({
    budgetCents: submilestone.budgetCents,
    ...(submilestone.description?.trim()
      ? { description: submilestone.description.trim() }
      : {}),
    durationDays: submilestone.durationDays,
    key:
      submilestone.key ??
      `${milestoneKey}-sub-${String(index + 1).padStart(2, "0")}`,
    name: submilestone.name,
    order: submilestone.order ?? index + 1,
  }));
}

export const siteVisitGuidanceFieldInputValidator = v.union(
  v.string(),
  v.array(v.string())
);

export const siteVisitGuidanceInputValidator = v.object({
  cameraAngles: siteVisitGuidanceFieldInputValidator,
  whatToVerify: siteVisitGuidanceFieldInputValidator,
});

export const setupMilestoneInputValidator = v.object({
  budgetCents: v.number(),
  dayEnd: v.optional(v.number()),
  dayStart: v.optional(v.number()),
  dependencyKeys: v.optional(v.array(v.string())),
  drawAvailabilityCents: v.optional(v.number()),
  drawKey: v.optional(v.string()),
  durationDays: v.number(),
  evidenceState: v.optional(v.string()),
  icon: v.optional(v.string()),
  included: v.optional(v.boolean()),
  key: v.string(),
  lane: v.optional(v.number()),
  markerLabel: v.optional(v.string()),
  name: v.string(),
  order: v.optional(v.number()),
  policyState: v.optional(v.string()),
  status: v.optional(v.string()),
  siteVisitGuidance: v.optional(siteVisitGuidanceInputValidator),
  submilestones: v.optional(v.array(submilestoneInputValidator)),
  tone: v.optional(v.string()),
  type: v.optional(v.string()),
  x: v.number(),
});

export const setupDrawInputValidator = v.object({
  amountCents: v.number(),
  customDate: v.optional(v.boolean()),
  drawKey: v.string(),
  itemMilestoneKey: v.optional(v.string()),
  label: v.string(),
  order: v.optional(v.number()),
  requestNote: v.optional(v.string()),
  requestReviewNote: v.optional(v.string()),
  requestStatus: v.optional(v.string()),
  reviewedAt: v.optional(v.string()),
  requestedAt: v.optional(v.string()),
  x: v.number(),
});

export const setupCapitalEventInputValidator = v.object({
  amountCents: v.number(),
  capitalEventKey: v.string(),
  eventKind: v.optional(v.union(v.literal("cost"), v.literal("cashInfusion"))),
  label: v.string(),
  order: v.optional(v.number()),
  x: v.number(),
});

export const timelineRouteStateInputValidator = v.object({
  activeCapitalSpikeId: v.optional(v.string()),
  activeDrawId: v.optional(v.string()),
  activeMilestoneKey: v.optional(v.string()),
  selectedPanelOpen: v.boolean(),
  straightLine: v.boolean(),
});

export const timelineMilestoneUpsertInputValidator = v.object({
  budgetCents: v.number(),
  completionClaim: v.optional(v.any()),
  dayEnd: v.number(),
  dayStart: v.number(),
  dependencyKeys: v.optional(v.array(v.string())),
  drawAvailabilityCents: v.optional(v.number()),
  drawKey: v.optional(v.string()),
  durationDays: v.number(),
  evidenceState: v.string(),
  icon: v.optional(v.string()),
  included: v.optional(v.boolean()),
  lane: v.optional(v.number()),
  markerLabel: v.optional(v.string()),
  milestoneKey: v.string(),
  name: v.string(),
  order: v.number(),
  policyState: v.string(),
  status: v.optional(v.string()),
  siteVisitGuidance: v.optional(siteVisitGuidanceInputValidator),
  submilestones: v.optional(v.array(submilestoneInputValidator)),
  tone: v.optional(v.string()),
  type: v.optional(v.string()),
  x: v.number(),
});

export const timelineModificationRequestTypeValidator = v.union(
  v.literal("createMilestone"),
  v.literal("deleteMilestone"),
  v.literal("updateMilestoneBudget")
);

export const evidenceAssetInputValidator = v.object({
  evidenceKey: v.string(),
  fileName: v.string(),
  label: v.string(),
  locationVerified: v.optional(v.boolean()),
  milestoneKey: v.string(),
  mimeType: v.string(),
  sizeBytes: v.number(),
  source: v.optional(v.string()),
  storageId: v.optional(v.id("_storage")),
  tag: v.string(),
});

export function randomBase36(length: number) {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return [...bytes]
    .map((byte) => base36Alphabet[byte % base36Alphabet.length])
    .join("");
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

export function calculateDrawAvailabilityCents(
  budgetCents: number,
  coPayBps: number | undefined
) {
  return Math.max(
    0,
    Math.round(
      (Math.max(0, budgetCents) * getReimbursementBps(coPayBps)) /
        TOTAL_REIMBURSEMENT_BPS
    )
  );
}

export function getTimelineMilestoneDrawAvailabilityCents(
  milestone: Pick<TimelineMilestone, "budgetCents" | "drawAvailabilityCents">,
  plan?: Pick<TimelinePlan, "borrowerCoPayBps">
) {
  return milestone.drawAvailabilityCents === undefined
    ? calculateDrawAvailabilityCents(
        milestone.budgetCents,
        plan?.borrowerCoPayBps
      )
    : Math.max(0, Math.round(milestone.drawAvailabilityCents));
}

export function createProposalSlugCandidate(seed?: number) {
  const now = seed ?? Date.now();
  const left = slugVerbs[now % slugVerbs.length];
  const right =
    slugNouns[Math.floor(now / slugVerbs.length) % slugNouns.length];
  const suffix =
    seed === undefined
      ? randomBase36(4)
      : now.toString(36).slice(-4).padStart(4, "0");
  return `${left}-${right}-${suffix}`;
}

export function isProposalSlug(value: string) {
  return SHORT_LINK_PATTERN.test(value);
}

/**
 * Clamps auto-generated draw amounts so cumulative draws never exceed the
 * cumulative milestone capacity unlocked by each draw's timing day.
 * Milestone capacity is considered unlocked when dayEnd <= draw.x.
 */
export function clampGeneratedDrawsToCapacity(
  draws: { amountCents: number; drawKey: string; label: string; order: number; x: number }[],
  milestones: { dayEnd: number; drawAvailabilityCents: number }[],
  lenderDrawPolicyLimitCents?: number
): { amountCents: number; drawKey: string; label: string; order: number; x: number }[] {
  const sortedDraws = [...draws].sort(
    (a, b) => a.x - b.x || a.order - b.order
  );
  let cumulativeDrawn = 0;
  const limit = lenderDrawPolicyLimitCents ?? Infinity;

  return sortedDraws.map((draw) => {
    const cumulativeAvailable = milestones.reduce((total, milestone) => {
      if (milestone.dayEnd <= draw.x) {
        return total + milestone.drawAvailabilityCents;
      }
      return total;
    }, 0);

    const remainingMilestoneCapacity = Math.max(0, cumulativeAvailable - cumulativeDrawn);
    const remainingLenderLimit = Math.max(0, limit - cumulativeDrawn);
    const maxAllowed = Math.min(remainingMilestoneCapacity, remainingLenderLimit);
    const clampedAmount = Math.min(draw.amountCents, maxAllowed);
    cumulativeDrawn += clampedAmount;

    return { ...draw, amountCents: clampedAmount };
  });
}

export function normalizeSetupPayload(input: {
  borrowerCoPayBps?: number;
  capitalEvents?: {
    amountCents: number;
    capitalEventKey: string;
    eventKind?: TimelineCapitalEventKind;
    label: string;
    order?: number;
    x: number;
  }[];
  draws?: {
    amountCents: number;
    customDate?: boolean;
    drawKey: string;
    itemMilestoneKey?: string;
    label: string;
    order?: number;
    requestNote?: string;
    requestReviewNote?: string;
    requestStatus?: string;
    reviewedAt?: string;
    requestedAt?: string;
    x: number;
  }[];
  lenderDrawPolicyLimitCents?: number;
  milestones: {
    budgetCents: number;
    dayEnd?: number;
    dayStart?: number;
    dependencyKeys?: string[];
    drawAvailabilityCents?: number;
    drawKey?: string;
    durationDays: number;
    evidenceState?: string;
    icon?: string;
    included?: boolean;
    key: string;
    lane?: number;
    markerLabel?: string;
    name: string;
    order?: number;
    policyState?: string;
    status?: string;
    siteVisitGuidance?: DemoTimelineSiteVisitGuidanceInput;
    submilestones?: {
      budgetCents?: number;
      description?: string;
      durationDays?: number;
      key?: string;
      name: string;
      order?: number;
    }[];
    tone?: string;
    type?: string;
    x: number;
  }[];
}) {
  const milestones = input.milestones
    .filter((milestone) => milestone.included ?? true)
    .map((milestone, index) => {
      const order = milestone.order ?? index + 1;
      const dayStart = milestone.dayStart ?? Math.round(milestone.x);
      const durationDays = Math.max(1, Math.round(milestone.durationDays));
      const submilestoneNames = (milestone.submilestones ?? []).map(
        (submilestone) => submilestone.name
      );
      return {
        ...milestone,
        dayEnd: milestone.dayEnd ?? dayStart + durationDays,
        dayStart,
        drawAvailabilityCents:
          milestone.drawAvailabilityCents === undefined
            ? calculateDrawAvailabilityCents(
                milestone.budgetCents,
                input.borrowerCoPayBps
              )
            : Math.max(0, Math.round(milestone.drawAvailabilityCents)),
        durationDays,
        order,
        siteVisitGuidance: normalizeSiteVisitGuidance(
          milestone.siteVisitGuidance,
          defaultSiteVisitGuidance(
            milestone.key,
            milestone.name,
            submilestoneNames
          )
        ),
        submilestoneSnapshot: toSubmilestoneSnapshot(
          milestone.submilestones ?? [],
          milestone.key
        ),
      };
    })
    .sort((a, b) => a.dayStart - b.dayStart || a.order - b.order);

  if (milestones.length === 0) {
    throw new Error("At least one included milestone is required.");
  }

  const drawsInput: DrawInput[] = input.draws?.length
    ? input.draws
    : clampGeneratedDrawsToCapacity(
        milestones.map((milestone, index) => ({
          amountCents: milestone.drawAvailabilityCents,
          drawKey: `draw-${String(index + 1).padStart(2, "0")}`,
          label: `Draw ${index + 1}`,
          order: index + 1,
          x: milestone.dayEnd + DEFAULT_DRAW_REVIEW_LAG_DAYS,
        })),
        milestones,
        input.lenderDrawPolicyLimitCents
      );

  const draws: NormalizedDraw[] = drawsInput.map((draw, index) => ({
    ...draw,
    customDate: draw.customDate ?? false,
    order: draw.order ?? index + 1,
    requestStatus: normalizeDrawRequestStatus(draw.requestStatus),
  }));

  const capitalEvents = (input.capitalEvents ?? []).map((event, index) => ({
    ...event,
    eventKind: event.eventKind ?? "cost",
    order: event.order ?? index + 1,
  }));

  return { capitalEvents, draws, milestones };
}

export function normalizeIcon(icon: string | undefined): TimelineIcon {
  const allowed = new Set<TimelineIcon>([
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
  ]);
  return icon && allowed.has(icon as TimelineIcon)
    ? (icon as TimelineIcon)
    : "foundation";
}

export function normalizeTimelineStatus(status: string | undefined): TimelineStatus {
  const allowed = new Set<TimelineStatus>([
    "complete",
    "ready",
    "review",
    "upcoming",
  ]);
  return status && allowed.has(status as TimelineStatus)
    ? (status as TimelineStatus)
    : "upcoming";
}

export function normalizeTone(tone: string | undefined): TimelineTone | undefined {
  const allowed = new Set<TimelineTone>([
    "active",
    "blocked",
    "complete",
    "upcoming",
    "warning",
  ]);
  return tone && allowed.has(tone as TimelineTone)
    ? (tone as TimelineTone)
    : undefined;
}
