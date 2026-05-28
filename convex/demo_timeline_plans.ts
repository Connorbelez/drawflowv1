import {
  makeFunctionReference,
  type StorageReader,
  type StorageWriter,
} from "convex/server";
import { v } from "convex/values";
import {
  DEMO_ORG_KEY,
  MOCK_BUILDER_PERSONA,
  MOCK_STAFF_PERSONA,
} from "./demo_personas";
import {
  generateSiteVisitToken,
  hashSiteVisitToken,
  validateIncludedSiteVisitMilestones,
} from "./demo_site_visit_tokens";
import {
  defaultSiteVisitGuidance,
  guidanceItemsToGuidance,
  guidanceToItems,
  normalizeSiteVisitGuidance,
  type SiteVisitGuidance,
} from "./demo_site_visit_guidance";
import {
  internalMutation,
  publicMutation,
  publicQuery,
  withMutationTiming,
  withQueryTiming,
} from "./fluent";
import type { DatabaseReader, DatabaseWriter, Doc, Id } from "./types";

const ORG_KEY = DEMO_ORG_KEY;
const DEFAULT_FLAT_DRAW_FEE_CENTS = 50_000;
const DEFAULT_INTEREST_ANNUAL_BPS = 925;
const DEFAULT_PAYOFF_DATE = "2027-01-05";
const DEFAULT_PROJECT_START_DATE = "2026-06-01";
const DEFAULT_TODAY_DATE = "2026-05-20";
const TOTAL_REIMBURSEMENT_BPS = 10_000;
const DEFAULT_BORROWER_CO_PAY_BPS = 2000;
const TOKEN_TTL_MS = 60 * 60 * 1000;
const SHORT_LINK_PATTERN = /^[a-z]+-[a-z]+-[a-z0-9]{4}$/;
const drawflowBackofficeDashboardQuery = makeFunctionReference<"query">(
  "demo_drawflow:demo_getBackofficeDashboard"
);

const slugVerbs = [
  "steady",
  "verified",
  "mapped",
  "ready",
  "bright",
  "solid",
  "clear",
  "guided",
];

const slugNouns = [
  "maple",
  "cedar",
  "harbor",
  "ridge",
  "foundry",
  "ledger",
  "beam",
  "parcel",
];

const base36Alphabet = "abcdefghijklmnopqrstuvwxyz0123456789";

type TimelinePlanId = Id<"demo_timelinePlans">;
type TimelinePlan = Doc<"demo_timelinePlans">;
type TimelineMilestone = Doc<"demo_timelineMilestones">;
type TimelineDraw = Doc<"demo_timelineDraws">;
type TimelineCapitalEvent = Doc<"demo_timelineCapitalEvents">;
type TimelineEvidenceAsset = Doc<"demo_timelineEvidenceAssets">;
type TimelineModificationRequest = Doc<"demo_timelineModificationRequests">;
type TimelineIcon =
  | "change"
  | "closeout"
  | "drywall"
  | "exterior"
  | "finishes"
  | "foundation"
  | "framing"
  | "roughIn";
type TimelineStatus = "complete" | "ready" | "review" | "upcoming";
type TimelineTone = "active" | "blocked" | "complete" | "upcoming" | "warning";
type DrawRequestStatus = "approved" | "draft" | "rejected" | "requested";
type TimelineCapitalEventKind = "cashInfusion" | "cost";
type TimelineModificationRequestType =
  | "createMilestone"
  | "deleteMilestone"
  | "updateMilestoneBudget";
const DAY_MS = 86_400_000;
const START_DATE_ERROR = "startDate must be ≥ today (UTC)";
interface NormalizedDraw {
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
type DrawInput = Omit<
  NormalizedDraw,
  "customDate" | "order" | "requestStatus"
> & {
  customDate?: boolean;
  order?: number;
  requestStatus?: string;
};

interface DemoReadCtx {
  db: DatabaseReader;
  storage: StorageReader;
}

interface DemoWriteCtx {
  db: DatabaseWriter;
  storage: StorageWriter;
}

const submilestoneInputValidator = v.object({
  budgetCents: v.optional(v.number()),
  description: v.optional(v.string()),
  durationDays: v.optional(v.number()),
  key: v.optional(v.string()),
  name: v.string(),
  order: v.optional(v.number()),
});

function toSubmilestoneSnapshot(
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

const siteVisitGuidanceInputValidator = v.object({
  cameraAngles: v.array(v.string()),
  whatToVerify: v.array(v.string()),
});

const setupMilestoneInputValidator = v.object({
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

const setupDrawInputValidator = v.object({
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

const setupCapitalEventInputValidator = v.object({
  amountCents: v.number(),
  capitalEventKey: v.string(),
  eventKind: v.optional(v.union(v.literal("cost"), v.literal("cashInfusion"))),
  label: v.string(),
  order: v.optional(v.number()),
  x: v.number(),
});

const timelineRouteStateInputValidator = v.object({
  activeCapitalSpikeId: v.optional(v.string()),
  activeDrawId: v.optional(v.string()),
  activeMilestoneKey: v.optional(v.string()),
  selectedPanelOpen: v.boolean(),
  straightLine: v.boolean(),
});

const timelineMilestoneUpsertInputValidator = v.object({
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

const timelineModificationRequestTypeValidator = v.union(
  v.literal("createMilestone"),
  v.literal("deleteMilestone"),
  v.literal("updateMilestoneBudget")
);

const evidenceAssetInputValidator = v.object({
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

function randomBase36(length: number) {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return [...bytes]
    .map((byte) => base36Alphabet[byte % base36Alphabet.length])
    .join("");
}

function normalizeBorrowerCoPayBps(value: number | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return DEFAULT_BORROWER_CO_PAY_BPS;
  }

  return Math.min(TOTAL_REIMBURSEMENT_BPS, Math.max(0, Math.round(value)));
}

function getReimbursementBps(value: number | undefined) {
  return TOTAL_REIMBURSEMENT_BPS - normalizeBorrowerCoPayBps(value);
}

function calculateDrawAvailabilityCents(
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

function getTimelineMilestoneDrawAvailabilityCents(
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
    siteVisitGuidance?: SiteVisitGuidance;
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
          defaultSiteVisitGuidance(milestone.key, milestone.name, submilestoneNames)
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
    : milestones.map((milestone, index) => ({
        amountCents: milestone.drawAvailabilityCents,
        drawKey: `draw-${String(index + 1).padStart(2, "0")}`,
        label: `Draw ${index + 1}`,
        order: index + 1,
        x: milestone.dayEnd + 7,
      }));

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

function normalizeIcon(icon: string | undefined): TimelineIcon {
  const allowed = new Set<TimelineIcon>([
    "change",
    "closeout",
    "drywall",
    "exterior",
    "finishes",
    "foundation",
    "framing",
    "roughIn",
  ]);
  return icon && allowed.has(icon as TimelineIcon)
    ? (icon as TimelineIcon)
    : "foundation";
}

function normalizeTimelineStatus(status: string | undefined): TimelineStatus {
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

function normalizeTone(tone: string | undefined): TimelineTone | undefined {
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

function normalizeDrawRequestStatus(
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

async function appendTimelineEvent(
  ctx: DemoWriteCtx,
  input: {
    actorPersona?: string;
    command: string;
    entityKey?: string;
    entityType: string;
    eventType: string;
    newState?: string;
    planId: TimelinePlanId;
    priorState?: string;
    reason?: string;
    requirementIds?: string[];
    traceIds?: string[];
    validationIds?: string[];
    warnings?: string[];
  }
) {
  await ctx.db.insert("demo_timelineEvents", {
    actorPersona: input.actorPersona ?? "system",
    command: input.command,
    createdAt: Date.now(),
    entityKey: input.entityKey,
    entityType: input.entityType,
    eventType: input.eventType,
    newState: input.newState,
    planId: input.planId,
    priorState: input.priorState,
    reason: input.reason,
    requirementIds: input.requirementIds ?? [],
    traceIds: input.traceIds ?? [],
    validationIds: input.validationIds ?? [],
    warnings: input.warnings ?? [],
  });
}

async function generateUniqueProposalSlug(ctx: DemoReadCtx) {
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const candidate = createProposalSlugCandidate(Date.now() + attempt);
    const existing = await ctx.db
      .query("demo_proposalShortLinks")
      .withIndex("by_slug", (q) => q.eq("slug", candidate))
      .first();
    if (!existing) {
      return candidate;
    }
  }
  throw new Error("Unable to generate a unique proposal link.");
}

async function getPlanOrThrow(ctx: DemoReadCtx, planId: string) {
  const normalized = ctx.db.normalizeId("demo_timelinePlans", planId);
  if (!normalized) {
    throw new Error("Timeline plan not found.");
  }
  const plan = await ctx.db.get(normalized);
  if (!plan) {
    throw new Error("Timeline plan not found.");
  }
  return plan;
}

async function getMilestoneOrThrow(
  ctx: DemoReadCtx,
  planId: TimelinePlanId,
  milestoneKey: string
) {
  const milestone = await ctx.db
    .query("demo_timelineMilestones")
    .withIndex("by_plan_and_key", (q) =>
      q.eq("planId", planId).eq("milestoneKey", milestoneKey)
    )
    .first();
  if (!milestone) {
    throw new Error("Timeline milestone not found.");
  }
  return milestone;
}

async function getDrawOrThrow(
  ctx: DemoReadCtx,
  planId: TimelinePlanId,
  drawKey: string
) {
  const draw = await ctx.db
    .query("demo_timelineDraws")
    .withIndex("by_plan_and_key", (q) =>
      q.eq("planId", planId).eq("drawKey", drawKey)
    )
    .first();
  if (!draw) {
    throw new Error("Timeline draw not found.");
  }
  return draw;
}

function relabeledDrawLabel(label: string, order: number) {
  return /^draw\s+\d+$/i.test(label.trim())
    ? `Draw ${String(order).padStart(2, "0")}`
    : label;
}

async function renumberTimelineDraws(
  ctx: DemoWriteCtx,
  planId: TimelinePlanId
) {
  const now = Date.now();
  const draws = await ctx.db
    .query("demo_timelineDraws")
    .withIndex("by_plan", (q) => q.eq("planId", planId))
    .take(200);
  const sortedDraws = draws.sort(
    (a, b) =>
      a.order - b.order || a.x - b.x || a.drawKey.localeCompare(b.drawKey)
  );

  for (const [index, draw] of sortedDraws.entries()) {
    const nextOrder = index + 1;
    const nextLabel = relabeledDrawLabel(draw.label, nextOrder);
    if (draw.order === nextOrder && draw.label === nextLabel) {
      continue;
    }
    await ctx.db.patch(draw._id, {
      label: nextLabel,
      order: nextOrder,
      updatedAt: now,
    });
  }
}

async function getCapitalEventOrThrow(
  ctx: DemoReadCtx,
  planId: TimelinePlanId,
  capitalEventKey: string
) {
  const event = await ctx.db
    .query("demo_timelineCapitalEvents")
    .withIndex("by_plan_and_key", (q) =>
      q.eq("planId", planId).eq("capitalEventKey", capitalEventKey)
    )
    .first();
  if (!event) {
    throw new Error("Timeline capital event not found.");
  }
  return event;
}

async function getEvidenceAssetOrThrow(
  ctx: DemoReadCtx,
  planId: TimelinePlanId,
  evidenceKey: string
) {
  const asset = await ctx.db
    .query("demo_timelineEvidenceAssets")
    .withIndex("by_plan_and_key", (q) =>
      q.eq("planId", planId).eq("evidenceKey", evidenceKey)
    )
    .first();
  if (!asset) {
    throw new Error("Timeline evidence asset not found.");
  }
  return asset;
}

function assertPlanWritable(plan: Doc<"demo_timelinePlans">) {
  if (!(plan.status === "draft" || plan.status === "approved")) {
    throw new Error(`Plan is not editable in status: ${plan.status}`);
  }
}

function assertPlanDraftWritable(plan: Doc<"demo_timelinePlans">) {
  if (plan.status !== "draft") {
    throw new Error(`Plan is not editable in status: ${plan.status}`);
  }
}

function assertPlanStateWritable(plan: Doc<"demo_timelinePlans">) {
  if (!(plan.status === "draft" || plan.status === "approved")) {
    throw new Error(`Plan state is not editable in status: ${plan.status}`);
  }
}

function assertPlanAdminWritable(plan: Doc<"demo_timelinePlans">) {
  if (plan.status !== "submitted") {
    throw new Error("Plan is not in submitted status");
  }
}

function assertApprovedLiveBuild(plan: Doc<"demo_timelinePlans">) {
  if (plan.status !== "approved") {
    throw new Error(
      "Modification requests are only available for live builds."
    );
  }
}

function floorUtcMidnight(epochMs: number) {
  const date = new Date(epochMs);
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

function addDaysIso(startDate: number, dayOffset: number) {
  return new Date(startDate + Math.round(dayOffset) * DAY_MS)
    .toISOString()
    .slice(0, 10);
}

function utcDayOffset(startDate: number, nowMs: number) {
  return Math.max(
    0,
    Math.floor((floorUtcMidnight(nowMs) - floorUtcMidnight(startDate)) / DAY_MS)
  );
}

function isTimelineMilestoneTerminalForCron(milestone: TimelineMilestone) {
  return milestone.status === "complete" || milestone.completedAt !== undefined;
}

function nextTimelineMilestoneScheduleState(
  milestone: TimelineMilestone,
  currentDay: number
): Pick<TimelineMilestone, "status" | "tone"> {
  if (isTimelineMilestoneTerminalForCron(milestone)) {
    return { status: "complete", tone: "complete" };
  }
  if (currentDay < milestone.dayStart) {
    return { status: "upcoming", tone: "upcoming" };
  }
  if (currentDay <= milestone.dayEnd) {
    return { status: "ready", tone: "active" };
  }
  return { status: "review", tone: "warning" };
}

function isPromotedMilestoneTerminalForCron(status: string) {
  return (
    status === "completion_approved" ||
    status === "completion_rejected" ||
    status === "submitted_for_review" ||
    status === "site_visit_requested" ||
    status === "site_visit_complete" ||
    status === "complete_pending_submission"
  );
}

function nextPromotedMilestoneScheduleStatus(
  milestone: Pick<
    Doc<"demo_milestones">,
    "actualCompletedDate" | "plannedEndDate" | "plannedStartDate" | "status"
  >,
  todayIso: string
) {
  if (
    milestone.actualCompletedDate ||
    isPromotedMilestoneTerminalForCron(milestone.status)
  ) {
    return milestone.status;
  }
  if (milestone.plannedEndDate && milestone.plannedEndDate < todayIso) {
    return "in_progress_behind_schedule";
  }
  if (milestone.plannedStartDate && milestone.plannedStartDate <= todayIso) {
    return "in_progress_on_schedule";
  }
  return "planned";
}

function isPromotedMilestoneBehindSchedule(
  milestone: Pick<
    Doc<"demo_milestones">,
    "actualCompletedDate" | "plannedEndDate" | "status"
  >,
  todayIso: string
) {
  return (
    !milestone.actualCompletedDate &&
    milestone.status !== "completion_approved" &&
    Boolean(milestone.plannedEndDate && milestone.plannedEndDate < todayIso)
  );
}

function isMutableDrawGroupForAutoRequest(status: string) {
  return (
    status === "planned" ||
    status === "not_yet_eligible" ||
    status === "partially_eligible" ||
    status === "active"
  );
}

function buildScenarioKey(plan: Doc<"demo_timelinePlans">) {
  return `timeline:${plan.proposalSlug}`;
}

async function deleteBackofficeCard(ctx: DemoWriteCtx, planId: TimelinePlanId) {
  const existing = await ctx.db
    .query("demo_backofficeProposalCards")
    .withIndex("by_plan", (q) => q.eq("planId", planId))
    .first();
  if (existing) {
    await ctx.db.delete(existing._id);
  }
}

async function timelineDraws(ctx: DemoReadCtx, planId: TimelinePlanId) {
  return (
    await ctx.db
      .query("demo_timelineDraws")
      .withIndex("by_plan", (q) => q.eq("planId", planId))
      .take(200)
  ).sort((a, b) => a.order - b.order);
}

async function timelineCapitalEvents(ctx: DemoReadCtx, planId: TimelinePlanId) {
  return (
    await ctx.db
      .query("demo_timelineCapitalEvents")
      .withIndex("by_plan", (q) => q.eq("planId", planId))
      .take(200)
  ).sort((a, b) => a.order - b.order);
}

async function touchPlan(ctx: DemoWriteCtx, planId: TimelinePlanId) {
  await ctx.db.patch(planId, { updatedAt: Date.now() });
}

async function timelineMilestones(ctx: DemoReadCtx, planId: TimelinePlanId) {
  return (
    await ctx.db
      .query("demo_timelineMilestones")
      .withIndex("by_plan", (q) => q.eq("planId", planId))
      .take(200)
  ).sort((a, b) => a.order - b.order);
}

async function timelineMilestoneGuidanceItems(
  ctx: DemoReadCtx,
  planId: TimelinePlanId,
  milestoneKey: string
) {
  return await ctx.db
    .query("demo_timelineMilestoneGuidanceItems")
    .withIndex("by_plan_milestone", (q) =>
      q.eq("planId", planId).eq("milestoneKey", milestoneKey)
    )
    .take(100);
}

async function timelineGuidanceByMilestone(
  ctx: DemoReadCtx,
  planId: TimelinePlanId
) {
  const rows = await ctx.db
    .query("demo_timelineMilestoneGuidanceItems")
    .withIndex("by_plan", (q) => q.eq("planId", planId))
    .take(500);
  const byMilestone = new Map<string, typeof rows>();
  for (const row of rows) {
    const current = byMilestone.get(row.milestoneKey) ?? [];
    current.push(row);
    byMilestone.set(row.milestoneKey, current);
  }
  return byMilestone;
}

async function replaceTimelineMilestoneGuidanceItems(
  ctx: DemoWriteCtx,
  {
    guidance,
    milestoneKey,
    planId,
  }: {
    guidance: SiteVisitGuidance;
    milestoneKey: string;
    planId: TimelinePlanId;
  }
) {
  for (const row of await timelineMilestoneGuidanceItems(
    ctx,
    planId,
    milestoneKey
  )) {
    await ctx.db.delete(row._id);
  }
  const now = Date.now();
  for (const item of guidanceToItems(guidance)) {
    await ctx.db.insert("demo_timelineMilestoneGuidanceItems", {
      createdAt: now,
      kind: item.kind,
      milestoneKey,
      order: item.order ?? 0,
      planId,
      text: item.text,
      updatedAt: now,
    });
  }
}

async function enrichTimelineMilestonesWithLiveSubmilestones(
  ctx: DemoReadCtx,
  plan: Doc<"demo_timelinePlans">,
  milestones: TimelineMilestone[]
) {
  if (plan.status !== "approved") {
    return milestones;
  }

  const submilestoneRows = await ctx.db
    .query("demo_milestoneSubmilestones")
    .withIndex("by_build", (q) => q.eq("buildId", plan.buildId))
    .take(500);
  if (submilestoneRows.length === 0) {
    return milestones;
  }

  const byMilestoneKey = new Map<string, Map<string, (typeof submilestoneRows)[0]>>();
  for (const row of submilestoneRows) {
    const milestoneRows =
      byMilestoneKey.get(row.milestoneKey) ?? new Map<string, (typeof submilestoneRows)[0]>();
    milestoneRows.set(row.key, row);
    byMilestoneKey.set(row.milestoneKey, milestoneRows);
  }

  return milestones.map((milestone) => {
    const liveByKey = byMilestoneKey.get(milestone.milestoneKey);
    if (!liveByKey) {
      return milestone;
    }

    return {
      ...milestone,
      submilestoneSnapshot: milestone.submilestoneSnapshot.map(
        (snapshot, index) => {
          const key =
            snapshot.key ??
            `${milestone.milestoneKey}-sub-${String(index + 1).padStart(2, "0")}`;
          const live = liveByKey.get(key);
          if (!live) {
            return snapshot;
          }

          return {
            ...snapshot,
            budgetCents: live.budgetCents ?? snapshot.budgetCents,
            description: live.description ?? snapshot.description,
            durationDays: live.durationDays ?? snapshot.durationDays,
            key,
            name: live.name,
            order: live.order,
            status: live.status,
          };
        }
      ),
    };
  });
}

async function syncBackofficeCard(
  ctx: DemoWriteCtx,
  input: {
    buildId: Id<"demo_builds">;
    planId: TimelinePlanId;
    proposalSlug: string;
    status: string;
    subtitle: string;
    title: string;
    totalBudgetCents: number;
  }
) {
  const now = Date.now();
  const existing = await ctx.db
    .query("demo_backofficeProposalCards")
    .withIndex("by_plan", (q) => q.eq("planId", input.planId))
    .first();
  const row = {
    buildId: input.buildId,
    column: input.status,
    href:
      input.status === "submitted"
        ? `/backoffice/proposals/${input.planId}`
        : `/demo/timeline/${input.planId}`,
    planId: input.planId,
    priority: "medium",
    proposalSlug: input.proposalSlug,
    sortAt: now,
    status: input.status,
    subtitle: input.subtitle,
    tag: "demo" as const,
    title: input.title,
    totalBudgetCents: input.totalBudgetCents,
    updatedAt: now,
  };
  if (existing) {
    await ctx.db.patch(existing._id, row);
  } else {
    await ctx.db.insert("demo_backofficeProposalCards", {
      ...row,
      createdAt: now,
    });
  }
}

async function createTimelinePlanSnapshot(
  ctx: DemoWriteCtx,
  input: {
    capitalEvents: TimelineCapitalEvent[];
    draws: TimelineDraw[];
    milestones: TimelineMilestone[];
    plan: Doc<"demo_timelinePlans">;
    submittedAt: number;
  }
) {
  const snapshotId = await ctx.db.insert("demo_timelinePlanSnapshots", {
    address: input.plan.address,
    borrowerCoPayBps: input.plan.borrowerCoPayBps,
    borrowerCoPayCents: input.plan.borrowerCoPayCents,
    buildId: input.plan.buildId,
    buildName: input.plan.buildName,
    createdAt: input.submittedAt,
    lenderDrawPolicyLimitCents: input.plan.lenderDrawPolicyLimitCents,
    orgKey: input.plan.orgKey,
    ownerPersona: input.plan.ownerPersona,
    planId: input.plan._id,
    planName: input.plan.templateTitle,
    submittedAt: input.submittedAt,
    submittedByPersona: MOCK_BUILDER_PERSONA,
    totalBudgetCents: input.plan.totalBudgetCents,
    workingCapitalLimitCents: input.plan.workingCapitalLimitCents,
  });

  for (const milestone of input.milestones) {
    await ctx.db.insert("demo_timelinePlanSnapshotMilestones", {
      budgetCents: milestone.budgetCents,
      buildId: input.plan.buildId,
      createdAt: input.submittedAt,
      dayEnd: milestone.dayEnd,
      dayStart: milestone.dayStart,
      dependencyKeys: milestone.dependencyKeys,
      drawAvailabilityCents: getTimelineMilestoneDrawAvailabilityCents(
        milestone,
        input.plan
      ),
      drawKey: milestone.drawKey,
      durationDays: milestone.durationDays,
      evidenceState: milestone.evidenceState,
      icon: milestone.icon,
      included: milestone.included,
      lane: milestone.lane,
      markerLabel: milestone.markerLabel,
      milestoneKey: milestone.milestoneKey,
      name: milestone.name,
      order: milestone.order,
      orgKey: input.plan.orgKey,
      planId: input.plan._id,
      policyState: milestone.policyState,
      snapshotId,
      sourceTimelineMilestoneId: milestone._id,
      status: milestone.status,
      submilestoneSnapshot: milestone.submilestoneSnapshot,
      tone: milestone.tone,
      type: milestone.type,
      x: milestone.x,
    });
  }

  for (const draw of input.draws) {
    await ctx.db.insert("demo_timelinePlanSnapshotDraws", {
      amountCents: draw.amountCents,
      buildId: input.plan.buildId,
      createdAt: input.submittedAt,
      customDate: draw.customDate,
      drawKey: draw.drawKey,
      itemMilestoneKey: draw.itemMilestoneKey,
      label: draw.label,
      order: draw.order,
      orgKey: input.plan.orgKey,
      planId: input.plan._id,
      requestNote: draw.requestNote,
      requestReviewNote: draw.requestReviewNote,
      requestStatus: draw.requestStatus,
      reviewedAt: draw.reviewedAt,
      requestedAt: draw.requestedAt,
      snapshotId,
      sourceTimelineDrawId: draw._id,
      x: draw.x,
    });
  }

  for (const event of input.capitalEvents) {
    await ctx.db.insert("demo_timelinePlanSnapshotCapitalEvents", {
      amountCents: event.amountCents,
      buildId: input.plan.buildId,
      capitalEventKey: event.capitalEventKey,
      createdAt: input.submittedAt,
      eventKind: event.eventKind ?? "cost",
      label: event.label,
      order: event.order,
      orgKey: input.plan.orgKey,
      planId: input.plan._id,
      snapshotId,
      sourceTimelineCapitalEventId: event._id,
      x: event.x,
    });
  }

  return snapshotId;
}

export const demo_createTimelinePlanFromSetup = publicMutation
  .use(withMutationTiming("demo_timeline_plans.create"))
  .input({
    actorPersona: v.optional(v.string()),
    address: v.string(),
    borrowerCoPayBps: v.optional(v.number()),
    borrowerCoPayCents: v.optional(v.number()),
    buildName: v.optional(v.string()),
    capitalEvents: v.optional(v.array(setupCapitalEventInputValidator)),
    currentDay: v.optional(v.number()),
    draws: v.optional(v.array(setupDrawInputValidator)),
    lenderDrawPolicyLimitCents: v.optional(v.number()),
    milestones: v.array(setupMilestoneInputValidator),
    progressValue: v.optional(v.number()),
    rangeMax: v.optional(v.number()),
    rangeMin: v.optional(v.number()),
    startingCashCents: v.number(),
    templateTitle: v.string(),
    totalBudgetCents: v.number(),
    workingCapitalLimitCents: v.optional(v.number()),
  })
  .returns(v.any())
  .handler(async (ctx, args) => {
    const normalized = normalizeSetupPayload({
      borrowerCoPayBps: args.borrowerCoPayBps,
      capitalEvents: args.capitalEvents,
      draws: args.draws,
      milestones: args.milestones,
    });
    const borrowerCoPayBps = normalizeBorrowerCoPayBps(args.borrowerCoPayBps);
    const borrowerCoPayCents =
      args.borrowerCoPayCents ??
      Math.round(
        (args.totalBudgetCents * borrowerCoPayBps) / TOTAL_REIMBURSEMENT_BPS
      );
    const now = Date.now();
    const proposalSlug = await generateUniqueProposalSlug(ctx);
    const buildKey = `demo-timeline-${proposalSlug}`;
    const buildId = await ctx.db.insert("demo_builds", {
      address: args.address.trim() || undefined,
      borrowerCoPayBps,
      borrowerCoPayCents,
      flatDrawFeeCents: DEFAULT_FLAT_DRAW_FEE_CENTS,
      interestAnnualBps: DEFAULT_INTEREST_ANNUAL_BPS,
      key: buildKey,
      lenderDrawPolicyLimitCents:
        args.lenderDrawPolicyLimitCents ??
        args.workingCapitalLimitCents ??
        args.startingCashCents,
      name: args.buildName ?? args.templateTitle,
      orgKey: ORG_KEY,
      ownerPersona: MOCK_BUILDER_PERSONA,
      payoffDate: DEFAULT_PAYOFF_DATE,
      projectStartDate: DEFAULT_PROJECT_START_DATE,
      scenario: buildKey,
      seedVersion: 1,
      status: "draft",
      subtitle: `${args.address} · durable demo proposal`,
      todayDate: DEFAULT_TODAY_DATE,
      updatedAt: now,
      workingCapitalLimitCents:
        args.workingCapitalLimitCents ?? args.startingCashCents,
    });
    const planId = await ctx.db.insert("demo_timelinePlans", {
      actorPersona: args.actorPersona ?? MOCK_BUILDER_PERSONA,
      address: args.address,
      buildId,
      borrowerCoPayBps,
      borrowerCoPayCents,
      buildName: args.buildName ?? args.templateTitle,
      createdAt: now,
      currentDay: args.currentDay ?? 0,
      lenderDrawPolicyLimitCents:
        args.lenderDrawPolicyLimitCents ??
        args.workingCapitalLimitCents ??
        args.startingCashCents,
      orgKey: ORG_KEY,
      ownerPersona: MOCK_BUILDER_PERSONA,
      progressValue: args.progressValue ?? args.currentDay ?? 0,
      proposalSlug,
      rangeMax:
        args.rangeMax ??
        Math.max(...normalized.milestones.map((m) => m.dayEnd)) + 10,
      rangeMin: args.rangeMin ?? 0,
      routeState: {
        activeMilestoneKey: normalized.milestones[0]?.key,
        selectedPanelOpen: true,
        straightLine: false,
      },
      source: "timeline_setup",
      startingCashCents: args.startingCashCents,
      status: "draft",
      tag: "demo",
      templateTitle: args.templateTitle,
      totalBudgetCents: args.totalBudgetCents,
      updatedAt: now,
      workingCapitalLimitCents:
        args.workingCapitalLimitCents ?? args.startingCashCents,
    });
    await ctx.db.insert("demo_proposalShortLinks", {
      createdAt: now,
      planId,
      slug: proposalSlug,
      status: "active",
      updatedAt: now,
    });
    for (const milestone of normalized.milestones) {
      await ctx.db.insert("demo_timelineMilestones", {
        budgetCents: milestone.budgetCents,
        createdAt: now,
        dayEnd: milestone.dayEnd,
        dayStart: milestone.dayStart,
        dependencyKeys: milestone.dependencyKeys ?? [],
        drawAvailabilityCents: milestone.drawAvailabilityCents,
        drawKey: milestone.drawKey,
        durationDays: milestone.durationDays,
        evidenceState: milestone.evidenceState ?? "not_started",
        icon: normalizeIcon(milestone.icon),
        included: true,
        lane: milestone.lane,
        markerLabel: milestone.markerLabel,
        milestoneKey: milestone.key,
        name: milestone.name,
        order: milestone.order,
        planId,
        policyState: milestone.policyState ?? "evidence_required",
        status: normalizeTimelineStatus(milestone.status),
        submilestoneSnapshot: milestone.submilestoneSnapshot,
        tone: normalizeTone(milestone.tone),
        type: milestone.type ?? "custom",
        updatedAt: now,
        x: milestone.x,
      });
      await replaceTimelineMilestoneGuidanceItems(ctx, {
        guidance: milestone.siteVisitGuidance,
        milestoneKey: milestone.key,
        planId,
      });
    }
    for (const draw of normalized.draws) {
      await ctx.db.insert("demo_timelineDraws", {
        amountCents: draw.amountCents,
        createdAt: now,
        customDate: draw.customDate,
        drawKey: draw.drawKey,
        itemMilestoneKey: draw.itemMilestoneKey,
        label: draw.label,
        order: draw.order,
        planId,
        requestNote: draw.requestNote,
        requestReviewNote: draw.requestReviewNote,
        requestStatus:
          draw.requestStatus === "requested" ||
          draw.requestStatus === "approved" ||
          draw.requestStatus === "rejected"
            ? draw.requestStatus
            : "draft",
        reviewedAt: draw.reviewedAt,
        requestedAt: draw.requestedAt,
        updatedAt: now,
        x: draw.x,
      });
    }
    for (const event of normalized.capitalEvents) {
      await ctx.db.insert("demo_timelineCapitalEvents", {
        amountCents: event.amountCents,
        capitalEventKey: event.capitalEventKey,
        createdAt: now,
        eventKind: event.eventKind ?? "cost",
        label: event.label,
        order: event.order,
        planId,
        updatedAt: now,
        x: event.x,
      });
    }
    await appendTimelineEvent(ctx, {
      actorPersona: args.actorPersona ?? MOCK_BUILDER_PERSONA,
      command: "demo_createTimelinePlanFromSetup",
      entityType: "timeline_plan",
      eventType: "TimelinePlanCreated",
      planId,
      requirementIds: ["REQ-01", "REQ-02", "REQ-10"],
      traceIds: [
        "UI-GENERATE-TIMELINE",
        "PSEUDO-FLOW-01",
        "UML-SCHEMA-TIMELINE",
      ],
      validationIds: ["VAL-01", "VAL-08"],
    });
    await syncBackofficeCard(ctx, {
      buildId,
      planId,
      proposalSlug,
      status: "draft",
      subtitle: `${args.address} · ${normalized.milestones.length} milestones`,
      title: args.buildName ?? args.templateTitle,
      totalBudgetCents: args.totalBudgetCents,
    });
    return {
      backofficeProjectionStatus: "upserted",
      buildId,
      proposalSlug,
      routeUrl: `/demo/timeline/${planId}`,
      shareUrl: `/demo/timeline/${planId}?proposal=${proposalSlug}`,
      timelineId: planId,
    };
  })
  .public();

export const demo_submitTimelinePlan = publicMutation
  .use(withMutationTiming("demo_timeline_plans.submit"))
  .input({ planId: v.string() })
  .returns(v.any())
  .handler(async (ctx, args) => {
    const plan = await getPlanOrThrow(ctx, args.planId);
    assertPlanDraftWritable(plan);
    const [milestones, draws, capitalEvents] = await Promise.all([
      timelineMilestones(ctx, plan._id),
      timelineDraws(ctx, plan._id),
      timelineCapitalEvents(ctx, plan._id),
    ]);
    const includedMilestones = milestones.filter(
      (milestone) => milestone.included
    );
    if (includedMilestones.length === 0) {
      throw new Error("Plan has no included milestones");
    }
    const submittedAt = Date.now();
    const snapshotId = await createTimelinePlanSnapshot(ctx, {
      capitalEvents,
      draws,
      milestones,
      plan,
      submittedAt,
    });
    await ctx.db.patch(plan._id, {
      status: "submitted",
      submittedAt,
      submittedByPersona: MOCK_BUILDER_PERSONA,
      submittedSnapshotId: snapshotId,
      updatedAt: submittedAt,
    });
    await syncBackofficeCard(ctx, {
      buildId: plan.buildId,
      planId: plan._id,
      proposalSlug: plan.proposalSlug,
      status: "submitted",
      subtitle: `${plan.address} · ${includedMilestones.length} milestones`,
      title: plan.buildName,
      totalBudgetCents: plan.totalBudgetCents,
    });
    await appendTimelineEvent(ctx, {
      actorPersona: MOCK_BUILDER_PERSONA,
      command: "demo_submitTimelinePlan",
      entityType: "timeline_plan",
      eventType: "TimelinePlanSubmitted",
      newState: JSON.stringify({ snapshotId, status: "submitted" }),
      planId: plan._id,
      priorState: JSON.stringify({ status: plan.status }),
      requirementIds: ["REQ-01", "REQ-02", "REQ-15"],
      traceIds: ["PSEUDO-FLOW-SUBMIT", "UML-SEQUENCE-SUBMIT"],
      validationIds: ["VAL-02", "VAL-03"],
    });
    return { planId: plan._id, snapshotId };
  })
  .public();

export const demo_listBuilderTimelinePlans = publicQuery
  .use(withQueryTiming("demo_timeline_plans.listBuilderTimelinePlans"))
  .input({ persona: v.string() })
  .returns(v.any())
  .handler(async (ctx, args) => {
    const plans = await ctx.db
      .query("demo_timelinePlans")
      .withIndex("by_owner_updated", (q) => q.eq("ownerPersona", args.persona))
      .order("desc")
      .take(100);
    return await Promise.all(
      plans.map(async (plan) => {
        const [build, milestones, draws, modificationRequests] =
          await Promise.all([
            ctx.db.get(plan.buildId),
            timelineMilestones(ctx, plan._id),
            timelineDraws(ctx, plan._id),
            ctx.db
              .query("demo_timelineModificationRequests")
              .withIndex("by_plan_status", (q) =>
                q.eq("planId", plan._id).eq("status", "requested")
              )
              .take(100),
          ]);
        const drawRequests = draws.filter(
          (draw) => draw.requestStatus === "requested"
        );
        const builderHref =
          plan.status === "approved" && build?.key
            ? `/builder/demo/dashboard/builds/${build.key}`
            : `/builder/demo/dashboard/proposals/${plan._id}`;
        return {
          buildId: plan.buildId,
          buildKey: build?.key,
          buildName: plan.buildName,
          drawCount: draws.length,
          href: builderHref,
          milestoneCount: milestones.length,
          ownerPersona: plan.ownerPersona,
          pendingDrawRequestCount: drawRequests.length,
          pendingModificationRequestCount: modificationRequests.length,
          planId: plan._id,
          proposalSlug: plan.proposalSlug,
          status: plan.status,
          timelineHref: `/demo/timeline/${plan._id}`,
          totalBudgetCents: plan.totalBudgetCents,
          updatedAt: plan.updatedAt,
        };
      })
    );
  })
  .public();

export const demo_getSubmittedProposalsForBackoffice = publicQuery
  .use(withQueryTiming("demo_timeline_plans.proposalsForBackoffice"))
  .input({})
  .returns(v.any())
  .handler(async (ctx) => {
    const [drafts, submitted, approved] = await Promise.all([
      ctx.db
        .query("demo_timelinePlans")
        .withIndex("by_status_updated", (q) => q.eq("status", "draft"))
        .order("desc")
        .take(100),
      ctx.db
        .query("demo_timelinePlans")
        .withIndex("by_status_updated", (q) => q.eq("status", "submitted"))
        .order("desc")
        .take(100),
      ctx.db
        .query("demo_timelinePlans")
        .withIndex("by_status_updated", (q) => q.eq("status", "approved"))
        .order("desc")
        .take(100),
    ]);
    const plans = [...drafts, ...submitted, ...approved]
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, 150);
    return await Promise.all(
      plans.map(async (plan) => {
        const [build, milestones, draws, modificationRequests] =
          await Promise.all([
            ctx.db.get(plan.buildId),
            timelineMilestones(ctx, plan._id),
            timelineDraws(ctx, plan._id),
            ctx.db
              .query("demo_timelineModificationRequests")
              .withIndex("by_plan_status", (q) =>
                q.eq("planId", plan._id).eq("status", "requested")
              )
              .take(100),
          ]);
        const drawRequests = draws
          .filter((draw) => draw.requestStatus === "requested")
          .map((draw) => ({
            amountCents: draw.amountCents,
            drawKey: draw.drawKey,
            href:
              plan.status === "approved" && build?.key
                ? `/backoffice/builds/${build.key}?rail=closed&tab=timeline`
                : `/demo/timeline/${plan._id}`,
            label: draw.label,
            planId: plan._id,
            requestedAt: draw.requestedAt,
            status: draw.requestStatus,
            x: draw.x,
          }));
        const activeMilestone =
          milestones
            .slice()
            .sort((a, b) => a.order - b.order)
            .find(
              (milestone) =>
                milestone.status !== "complete" &&
                milestone.dayStart <= plan.currentDay &&
                plan.currentDay <= milestone.dayEnd
            ) ??
          milestones
            .slice()
            .sort((a, b) => a.order - b.order)
            .find((milestone) => milestone.status !== "complete");
        const buildStatus =
          build?.status === "behind_schedule" ||
          milestones.some((milestone) => milestone.tone === "warning")
            ? "behind"
            : "onTrack";
        const reviewHref =
          plan.status === "submitted"
            ? `/backoffice/proposals/${plan._id}`
            : plan.status === "approved" && build?.key
              ? `/backoffice/builds/${build.key}?rail=closed&tab=timeline`
              : `/demo/timeline/${plan._id}`;
        return {
          address: plan.address,
          builder: plan.ownerPersona ?? MOCK_BUILDER_PERSONA,
          buildId: plan.buildId,
          buildKey: build?.key,
          buildName: plan.buildName,
          buildStatus,
          currentDay: plan.currentDay,
          drawCount: draws.length,
          drawRequests,
          href: reviewHref,
          liveStatusLabel:
            buildStatus === "behind" ? "Behind schedule" : "Live timeline",
          milestoneCount: milestones.length,
          activeMilestone: activeMilestone?.name,
          pendingDrawRequestCount: drawRequests.length,
          pendingModificationRequestCount: modificationRequests.length,
          ownerPersona: plan.ownerPersona,
          planId: plan._id,
          proposalSlug: plan.proposalSlug,
          status: plan.status,
          statusLabel:
            plan.status === "approved"
              ? "Approved"
              : plan.status === "submitted"
                ? "Submitted"
                : "Draft",
          submittedAt: plan.submittedAt ?? plan.updatedAt,
          totalBudgetCents: plan.totalBudgetCents,
          updatedAt: plan.updatedAt,
        };
      })
    );
  })
  .public();

async function getSnapshotForPlan(
  ctx: DemoReadCtx,
  plan: Doc<"demo_timelinePlans">
) {
  if (!plan.submittedSnapshotId) {
    return null;
  }
  const snapshot = await ctx.db.get(plan.submittedSnapshotId);
  if (!snapshot) {
    return null;
  }
  const [milestones, draws, capitalEvents] = await Promise.all([
    ctx.db
      .query("demo_timelinePlanSnapshotMilestones")
      .withIndex("by_snapshot", (q) => q.eq("snapshotId", snapshot._id))
      .take(200),
    ctx.db
      .query("demo_timelinePlanSnapshotDraws")
      .withIndex("by_snapshot", (q) => q.eq("snapshotId", snapshot._id))
      .take(200),
    ctx.db
      .query("demo_timelinePlanSnapshotCapitalEvents")
      .withIndex("by_snapshot", (q) => q.eq("snapshotId", snapshot._id))
      .take(200),
  ]);
  return {
    capitalEvents: capitalEvents.sort((a, b) => a.order - b.order),
    draws: draws.sort((a, b) => a.order - b.order),
    milestones: milestones.sort((a, b) => a.order - b.order),
    snapshot,
  };
}

export const demo_getProposalReviewViewModel = publicQuery
  .use(withQueryTiming("demo_timeline_plans.proposalReview"))
  .input({ planId: v.string() })
  .returns(v.any())
  .handler(async (ctx, args) => {
    const plan = await getPlanOrThrow(ctx, args.planId);
    const [build, snapshot, milestones, draws, capitalEvents] =
      await Promise.all([
        ctx.db.get(plan.buildId),
        getSnapshotForPlan(ctx, plan),
        timelineMilestones(ctx, plan._id),
        timelineDraws(ctx, plan._id),
        timelineCapitalEvents(ctx, plan._id),
      ]);
    return {
      build,
      plan,
      snapshot,
      workingCopy: {
        capitalEvents,
        draws,
        milestones,
      },
    };
  })
  .public();

interface RollForwardSummary {
  autoRequestedDraws: number;
  buildsMarkedBehind: number;
  buildsUpdated: number;
  drawGroupsUpdated: number;
  milestonesUpdated: number;
  plansSkipped: number;
  plansUpdated: number;
  processedPlans: number;
}

interface RollForwardRows {
  build: Doc<"demo_builds"> | null;
  draws: TimelineDraw[];
  milestones: TimelineMilestone[];
  promotedDrawGroups: Doc<"demo_drawGroups">[];
  promotedMilestones: Doc<"demo_milestones">[];
}

function emptyRollForwardSummary(): RollForwardSummary {
  return {
    autoRequestedDraws: 0,
    buildsMarkedBehind: 0,
    buildsUpdated: 0,
    drawGroupsUpdated: 0,
    milestonesUpdated: 0,
    plansSkipped: 0,
    plansUpdated: 0,
    processedPlans: 0,
  };
}

async function getRollForwardRows(
  ctx: DemoWriteCtx,
  plan: TimelinePlan
): Promise<RollForwardRows> {
  const [milestones, draws, promotedMilestones, promotedDrawGroups, build] =
    await Promise.all([
      timelineMilestones(ctx, plan._id),
      timelineDraws(ctx, plan._id),
      ctx.db
        .query("demo_milestones")
        .withIndex("by_build_order", (q) => q.eq("buildId", plan.buildId))
        .collect(),
      ctx.db
        .query("demo_drawGroups")
        .withIndex("by_build_order", (q) => q.eq("buildId", plan.buildId))
        .collect(),
      ctx.db.get(plan.buildId),
    ]);
  return { build, draws, milestones, promotedDrawGroups, promotedMilestones };
}

function activeMilestoneForDay(
  milestones: TimelineMilestone[],
  currentDay: number
) {
  const ordered = milestones.slice().sort((a, b) => a.order - b.order);
  const activeWindow = ordered.find(
    (milestone) =>
      !isTimelineMilestoneTerminalForCron(milestone) &&
      milestone.dayStart <= currentDay &&
      currentDay <= milestone.dayEnd
  );
  return (
    activeWindow ??
    ordered.find(
      (milestone) =>
        !isTimelineMilestoneTerminalForCron(milestone) &&
        currentDay > milestone.dayEnd
    ) ??
    ordered.find((milestone) => !isTimelineMilestoneTerminalForCron(milestone))
  );
}

async function rollForwardPlanState(
  ctx: DemoWriteCtx,
  input: {
    currentDay: number;
    now: number;
    plan: TimelinePlan;
    summary: RollForwardSummary;
    todayIso: string;
    activeMilestoneKey?: string;
  }
) {
  const patch: Partial<TimelinePlan> = {};
  if (input.plan.currentDay !== input.currentDay) {
    patch.currentDay = input.currentDay;
  }
  if (input.plan.progressValue !== input.currentDay) {
    patch.progressValue = input.currentDay;
  }
  if (
    input.activeMilestoneKey &&
    input.plan.routeState.activeMilestoneKey !== input.activeMilestoneKey
  ) {
    patch.routeState = {
      ...input.plan.routeState,
      activeMilestoneKey: input.activeMilestoneKey,
    };
  }
  if (Object.keys(patch).length === 0) {
    return;
  }
  patch.updatedAt = input.now;
  await ctx.db.patch(input.plan._id, patch);
  input.summary.plansUpdated += 1;
  await appendTimelineEvent(ctx, {
    command: "demo_rollForwardApprovedTimelines",
    entityType: "timeline_plan_state",
    eventType: "TimelinePlanCronRolledForward",
    newState: JSON.stringify(patch),
    planId: input.plan._id,
    priorState: JSON.stringify({
      currentDay: input.plan.currentDay,
      progressValue: input.plan.progressValue,
      routeState: input.plan.routeState,
    }),
    reason: `Daily cron advanced timeline to ${input.todayIso}.`,
    requirementIds: ["REQ-10"],
    validationIds: ["VAL-04"],
  });
}

async function rollForwardTimelineMilestones(
  ctx: DemoWriteCtx,
  input: {
    currentDay: number;
    milestones: TimelineMilestone[];
    now: number;
    planId: TimelinePlanId;
    summary: RollForwardSummary;
  }
) {
  for (const milestone of input.milestones) {
    const nextState = nextTimelineMilestoneScheduleState(
      milestone,
      input.currentDay
    );
    if (
      milestone.status === nextState.status &&
      milestone.tone === nextState.tone
    ) {
      continue;
    }
    await ctx.db.patch(milestone._id, { ...nextState, updatedAt: input.now });
    input.summary.milestonesUpdated += 1;
    await appendTimelineEvent(ctx, {
      command: "demo_rollForwardApprovedTimelines",
      entityKey: milestone.milestoneKey,
      entityType: "timeline_milestone",
      eventType: "TimelineMilestoneScheduleStateUpdated",
      newState: JSON.stringify(nextState),
      planId: input.planId,
      priorState: JSON.stringify({
        status: milestone.status,
        tone: milestone.tone,
      }),
      reason: `Daily cron evaluated milestone at T+${input.currentDay}.`,
      requirementIds: ["REQ-10"],
      validationIds: ["VAL-04"],
    });
  }
}

async function rollForwardPromotedMilestones(
  ctx: DemoWriteCtx,
  milestones: Doc<"demo_milestones">[],
  todayIso: string,
  now: number
) {
  const nextMilestones = milestones.map((milestone) => ({
    ...milestone,
    status: nextPromotedMilestoneScheduleStatus(milestone, todayIso),
  }));
  for (const milestone of nextMilestones) {
    const prior = milestones.find(
      (candidate) => candidate._id === milestone._id
    );
    if (!prior || prior.status === milestone.status) {
      continue;
    }
    await ctx.db.patch(milestone._id, {
      status: milestone.status,
      updatedAt: now,
    });
  }
  return nextMilestones;
}

async function autoRequestDueDraws(
  ctx: DemoWriteCtx,
  input: {
    currentDay: number;
    drawGroups: Doc<"demo_drawGroups">[];
    draws: TimelineDraw[];
    now: number;
    planId: TimelinePlanId;
    summary: RollForwardSummary;
    todayIso: string;
  }
) {
  const drawGroupBySource = new Map(
    input.drawGroups
      .filter((group) => group.sourceTimelineDrawId !== undefined)
      .map((group) => [group.sourceTimelineDrawId, group])
  );
  for (const draw of input.draws) {
    if (!(draw.requestStatus === "draft" && draw.x <= input.currentDay)) {
      continue;
    }
    const nextDraw = {
      requestNote:
        draw.requestNote ??
        `Automatically requested when planned draw date reached on ${input.todayIso}.`,
      requestStatus: "requested" as const,
      requestedAt: new Date(input.now).toISOString(),
      updatedAt: input.now,
    };
    await ctx.db.patch(draw._id, nextDraw);
    input.summary.autoRequestedDraws += 1;
    await appendTimelineEvent(ctx, {
      command: "demo_rollForwardApprovedTimelines",
      entityKey: draw.drawKey,
      entityType: "timeline_draw",
      eventType: "TimelineDrawAutoRequested",
      newState: JSON.stringify(nextDraw),
      planId: input.planId,
      priorState: JSON.stringify({
        requestStatus: draw.requestStatus,
        requestedAt: draw.requestedAt,
      }),
      reason: `Daily cron reached planned draw date T+${draw.x}.`,
      requirementIds: ["REQ-10"],
      validationIds: ["VAL-04"],
    });
    const promotedGroup = drawGroupBySource.get(draw._id);
    if (
      !(promotedGroup && isMutableDrawGroupForAutoRequest(promotedGroup.status))
    ) {
      continue;
    }
    await ctx.db.patch(promotedGroup._id, {
      requestedValueCents: draw.amountCents,
      status: "requested",
      updatedAt: input.now,
    });
    input.summary.drawGroupsUpdated += 1;
  }
}

async function rollForwardBuild(
  ctx: DemoWriteCtx,
  input: {
    build: Doc<"demo_builds"> | null;
    milestones: Doc<"demo_milestones">[];
    now: number;
    summary: RollForwardSummary;
    todayIso: string;
  }
) {
  if (!input.build) {
    return;
  }
  const buildBehindSchedule = input.milestones.some((milestone) =>
    isPromotedMilestoneBehindSchedule(milestone, input.todayIso)
  );
  const nextStatus = buildBehindSchedule ? "behind_schedule" : "active";
  if (
    input.build.todayDate === input.todayIso &&
    input.build.status === nextStatus
  ) {
    return;
  }
  await ctx.db.patch(input.build._id, {
    status: nextStatus,
    todayDate: input.todayIso,
    updatedAt: input.now,
  });
  input.summary.buildsUpdated += 1;
  if (nextStatus === "behind_schedule") {
    input.summary.buildsMarkedBehind += 1;
  }
}

async function rollForwardApprovedPlan(
  ctx: DemoWriteCtx,
  plan: TimelinePlan,
  now: number,
  todayIso: string,
  summary: RollForwardSummary
) {
  if (plan.startDate === undefined) {
    summary.plansSkipped += 1;
    return;
  }
  summary.processedPlans += 1;
  const currentDay = utcDayOffset(plan.startDate, now);
  const rows = await getRollForwardRows(ctx, plan);
  const milestones = rows.milestones.slice().sort((a, b) => a.order - b.order);
  const activeMilestone = activeMilestoneForDay(milestones, currentDay);

  await rollForwardPlanState(ctx, {
    activeMilestoneKey: activeMilestone?.milestoneKey,
    currentDay,
    now,
    plan,
    summary,
    todayIso,
  });
  await rollForwardTimelineMilestones(ctx, {
    currentDay,
    milestones,
    now,
    planId: plan._id,
    summary,
  });
  const promotedMilestones = await rollForwardPromotedMilestones(
    ctx,
    rows.promotedMilestones,
    todayIso,
    now
  );
  await autoRequestDueDraws(ctx, {
    currentDay,
    drawGroups: rows.promotedDrawGroups,
    draws: rows.draws,
    now,
    planId: plan._id,
    summary,
    todayIso,
  });
  await rollForwardBuild(ctx, {
    build: rows.build,
    milestones: promotedMilestones,
    now,
    summary,
    todayIso,
  });
}

async function rollForwardApprovedTimelines(ctx: DemoWriteCtx, now: number) {
  const todayIso = new Date(floorUtcMidnight(now)).toISOString().slice(0, 10);
  const plans = await ctx.db
    .query("demo_timelinePlans")
    .withIndex("by_status_updated", (q) => q.eq("status", "approved"))
    .take(200);
  const summary = emptyRollForwardSummary();
  for (const plan of plans) {
    await rollForwardApprovedPlan(ctx, plan, now, todayIso, summary);
  }
  return summary;
}

export const demo_rollForwardApprovedTimelines = internalMutation
  .use(withMutationTiming("demo_timeline_plans.rollForwardApprovedTimelines"))
  .input({ nowMs: v.optional(v.number()) })
  .returns(v.any())
  .handler(
    async (ctx, args) =>
      await rollForwardApprovedTimelines(ctx, args.nowMs ?? Date.now())
  )
  .internal();

export const demo_syncApprovedTimelinesNow = publicMutation
  .use(withMutationTiming("demo_timeline_plans.syncApprovedTimelinesNow"))
  .input({})
  .returns(v.any())
  .handler(async (ctx) => await rollForwardApprovedTimelines(ctx, Date.now()))
  .public();

export const demo_adminUpdateTimelineMilestone = publicMutation
  .use(withMutationTiming("demo_timeline_plans.adminUpdateMilestone"))
  .input({
    budgetCents: v.optional(v.number()),
    dayEnd: v.optional(v.number()),
    dayStart: v.optional(v.number()),
    drawAvailabilityCents: v.optional(v.number()),
    durationDays: v.optional(v.number()),
    milestoneKey: v.string(),
    name: v.optional(v.string()),
    planId: v.string(),
  })
  .returns(v.any())
  .handler(async (ctx, args) => {
    const plan = await getPlanOrThrow(ctx, args.planId);
    assertPlanAdminWritable(plan);
    const milestone = await getMilestoneOrThrow(
      ctx,
      plan._id,
      args.milestoneKey
    );
    const patch: Partial<TimelineMilestone> = { updatedAt: Date.now() };
    if (args.budgetCents !== undefined) {
      patch.budgetCents = Math.max(0, Math.round(args.budgetCents));
      patch.drawAvailabilityCents =
        args.drawAvailabilityCents === undefined
          ? calculateDrawAvailabilityCents(
              patch.budgetCents,
              plan.borrowerCoPayBps
            )
          : Math.max(0, Math.round(args.drawAvailabilityCents));
    } else if (args.drawAvailabilityCents !== undefined) {
      patch.drawAvailabilityCents = Math.max(
        0,
        Math.round(args.drawAvailabilityCents)
      );
    }
    if (args.dayStart !== undefined) {
      const nextDayStart = Math.round(args.dayStart);
      patch.dayStart = nextDayStart;
      patch.x = nextDayStart;
    }
    if (args.durationDays !== undefined) {
      patch.durationDays = Math.max(1, Math.round(args.durationDays));
    }
    if (args.dayEnd !== undefined) {
      patch.dayEnd = Math.round(args.dayEnd);
    }
    if (args.name !== undefined) {
      patch.name = args.name.trim() || milestone.name;
    }
    const nextDayStart = patch.dayStart ?? milestone.dayStart;
    const nextDuration = patch.durationDays ?? milestone.durationDays;
    if (
      args.dayEnd === undefined &&
      (args.dayStart !== undefined || args.durationDays !== undefined)
    ) {
      patch.dayEnd = nextDayStart + nextDuration;
    }
    const nextDayEnd = patch.dayEnd ?? milestone.dayEnd;
    if (nextDayEnd < nextDayStart) {
      throw new Error("Milestone end day must be after start day.");
    }
    await ctx.db.patch(milestone._id, patch);
    await touchPlan(ctx, plan._id);
    await appendTimelineEvent(ctx, {
      actorPersona: MOCK_STAFF_PERSONA,
      command: "demo_adminUpdateTimelineMilestone",
      entityKey: milestone.milestoneKey,
      entityType: "timeline_milestone",
      eventType: "TimelineMilestoneAdminUpdated",
      newState: JSON.stringify(patch),
      planId: plan._id,
      priorState: JSON.stringify(milestone),
      requirementIds: ["REQ-10"],
      traceIds: ["PSEUDO-LIFECYCLE-PLAN"],
      validationIds: ["VAL-04", "VAL-06"],
    });
    return { ok: true };
  })
  .public();

export const demo_adminUpdateTimelinePlan = publicMutation
  .use(withMutationTiming("demo_timeline_plans.adminUpdatePlan"))
  .input({
    planId: v.string(),
    totalBudgetCents: v.optional(v.number()),
    workingCapitalLimitCents: v.optional(v.number()),
  })
  .returns(v.any())
  .handler(async (ctx, args) => {
    const plan = await getPlanOrThrow(ctx, args.planId);
    assertPlanAdminWritable(plan);
    const patch: Partial<Doc<"demo_timelinePlans">> = { updatedAt: Date.now() };
    if (args.totalBudgetCents !== undefined) {
      patch.totalBudgetCents = Math.max(0, Math.round(args.totalBudgetCents));
    }
    if (args.workingCapitalLimitCents !== undefined) {
      patch.workingCapitalLimitCents = Math.max(
        0,
        Math.round(args.workingCapitalLimitCents)
      );
    }
    await ctx.db.patch(plan._id, patch);
    await appendTimelineEvent(ctx, {
      actorPersona: MOCK_STAFF_PERSONA,
      command: "demo_adminUpdateTimelinePlan",
      entityType: "timeline_plan",
      eventType: "TimelinePlanAdminUpdated",
      newState: JSON.stringify(patch),
      planId: plan._id,
      priorState: JSON.stringify({
        totalBudgetCents: plan.totalBudgetCents,
        workingCapitalLimitCents: plan.workingCapitalLimitCents,
      }),
      requirementIds: ["REQ-10"],
      validationIds: ["VAL-04"],
    });
    return { ok: true };
  })
  .public();

export const demo_adminUpdateTimelineDraw = publicMutation
  .use(withMutationTiming("demo_timeline_plans.adminUpdateDraw"))
  .input({
    amountCents: v.optional(v.number()),
    drawKey: v.string(),
    label: v.optional(v.string()),
    order: v.optional(v.number()),
    planId: v.string(),
    x: v.optional(v.number()),
  })
  .returns(v.any())
  .handler(async (ctx, args) => {
    const plan = await getPlanOrThrow(ctx, args.planId);
    assertPlanAdminWritable(plan);
    const draw = await getDrawOrThrow(ctx, plan._id, args.drawKey);
    const patch: Partial<TimelineDraw> = { updatedAt: Date.now() };
    if (args.amountCents !== undefined) {
      patch.amountCents = Math.max(0, Math.round(args.amountCents));
    }
    if (args.label !== undefined) {
      patch.label = args.label.trim() || draw.label;
    }
    if (args.order !== undefined) {
      patch.order = Math.max(1, Math.round(args.order));
    }
    if (args.x !== undefined) {
      patch.x = Math.round(args.x);
    }
    await ctx.db.patch(draw._id, patch);
    await touchPlan(ctx, plan._id);
    await appendTimelineEvent(ctx, {
      actorPersona: MOCK_STAFF_PERSONA,
      command: "demo_adminUpdateTimelineDraw",
      entityKey: draw.drawKey,
      entityType: "timeline_draw",
      eventType: "TimelineDrawAdminUpdated",
      newState: JSON.stringify(patch),
      planId: plan._id,
      priorState: JSON.stringify(draw),
      requirementIds: ["REQ-10"],
      validationIds: ["VAL-04", "VAL-06"],
    });
    return { ok: true };
  })
  .public();

export const demo_adminAddTimelineDraw = publicMutation
  .use(withMutationTiming("demo_timeline_plans.adminAddDraw"))
  .input({
    amountCents: v.number(),
    label: v.string(),
    planId: v.string(),
    x: v.number(),
  })
  .returns(v.any())
  .handler(async (ctx, args) => {
    const plan = await getPlanOrThrow(ctx, args.planId);
    assertPlanAdminWritable(plan);
    const draws = await timelineDraws(ctx, plan._id);
    const order = draws.length + 1;
    const drawKey = `admin-draw-${String(order).padStart(2, "0")}`;
    const now = Date.now();
    await ctx.db.insert("demo_timelineDraws", {
      amountCents: Math.max(0, Math.round(args.amountCents)),
      createdAt: now,
      customDate: true,
      drawKey,
      label: args.label.trim() || `Draw ${order}`,
      order,
      planId: plan._id,
      requestStatus: "draft",
      updatedAt: now,
      x: Math.round(args.x),
    });
    await touchPlan(ctx, plan._id);
    return { drawKey, ok: true };
  })
  .public();

export const demo_adminRemoveTimelineDraw = publicMutation
  .use(withMutationTiming("demo_timeline_plans.adminRemoveDraw"))
  .input({ drawKey: v.string(), planId: v.string() })
  .returns(v.any())
  .handler(async (ctx, args) => {
    const plan = await getPlanOrThrow(ctx, args.planId);
    assertPlanAdminWritable(plan);
    const draw = await getDrawOrThrow(ctx, plan._id, args.drawKey);
    await ctx.db.delete(draw._id);
    await renumberTimelineDraws(ctx, plan._id);
    await touchPlan(ctx, plan._id);
    return { ok: true };
  })
  .public();

async function upsertPromotedMilestone(
  ctx: DemoWriteCtx,
  input: {
    milestone: TimelineMilestone;
    plan: Doc<"demo_timelinePlans">;
    startDate: number;
  }
) {
  const existing = await ctx.db
    .query("demo_milestones")
    .withIndex("by_build_and_source_timeline_milestone", (q) =>
      q
        .eq("buildId", input.plan.buildId)
        .eq("sourceTimelineMilestoneId", input.milestone._id)
    )
    .first();
  const plannedStartDate = addDaysIso(
    input.startDate,
    input.milestone.dayStart
  );
  const plannedEndDate = addDaysIso(input.startDate, input.milestone.dayEnd);
  const row = {
    approvedValueCents: input.milestone.budgetCents,
    buildId: input.plan.buildId,
    code: input.milestone.milestoneKey.toUpperCase().slice(0, 12),
    drawGroupKey: input.milestone.drawKey ?? input.milestone.milestoneKey,
    durationDays: input.milestone.durationDays,
    key: input.milestone.milestoneKey,
    name: input.milestone.name,
    order: input.milestone.order,
    orgKey: input.plan.orgKey,
    plannedEndDate,
    plannedStartDate,
    progressPercent: 0,
    requiresSiteVisit: false,
    scenario: buildScenarioKey(input.plan),
    sourceTimelineMilestoneId: input.milestone._id,
    status: "planned",
    type: input.milestone.type,
    updatedAt: Date.now(),
  };
  if (existing) {
    await ctx.db.patch(existing._id, row);
  } else {
    await ctx.db.insert("demo_milestones", row);
  }

  await syncPromotedSubmilestones(ctx, input);
}

async function syncPromotedSubmilestones(
  ctx: DemoWriteCtx,
  input: {
    milestone: TimelineMilestone;
    plan: Doc<"demo_timelinePlans">;
  }
) {
  const scenario = buildScenarioKey(input.plan);
  const existing = await ctx.db
    .query("demo_milestoneSubmilestones")
    .withIndex("by_build_milestone", (q) =>
      q
        .eq("buildId", input.plan.buildId)
        .eq("milestoneKey", input.milestone.milestoneKey)
    )
    .collect();
  const existingByKey = new Map(existing.map((row) => [row.key, row]));
  const now = Date.now();

  for (const [index, snapshot] of input.milestone.submilestoneSnapshot.entries()) {
    const key =
      snapshot.key ??
      `${input.milestone.milestoneKey}-sub-${String(index + 1).padStart(2, "0")}`;
    const row = {
      budgetCents: snapshot.budgetCents,
      buildId: input.plan.buildId,
      ...(snapshot.description?.trim()
        ? { description: snapshot.description.trim() }
        : existingByKey.get(key)?.description
          ? { description: existingByKey.get(key)?.description }
          : {}),
      durationDays: snapshot.durationDays,
      key,
      milestoneKey: input.milestone.milestoneKey,
      name: snapshot.name,
      order: snapshot.order ?? index + 1,
      scenario,
      status: existingByKey.get(key)?.status ?? ("todo" as const),
      updatedAt: now,
    };
    const existingRow = existingByKey.get(key);
    if (existingRow) {
      await ctx.db.patch(existingRow._id, row);
      continue;
    }

    await ctx.db.insert("demo_milestoneSubmilestones", {
      ...row,
      createdAt: now,
    });
  }
}

async function upsertPromotedDraw(
  ctx: DemoWriteCtx,
  input: {
    draw: TimelineDraw;
    plan: Doc<"demo_timelinePlans">;
    startDate: number;
  }
) {
  const existing = await ctx.db
    .query("demo_drawGroups")
    .withIndex("by_build_and_source_timeline_draw", (q) =>
      q
        .eq("buildId", input.plan.buildId)
        .eq("sourceTimelineDrawId", input.draw._id)
    )
    .first();
  const plannedDate = addDaysIso(input.startDate, input.draw.x);
  const row = {
    approvedValueCents: input.draw.amountCents,
    buildId: input.plan.buildId,
    key: input.draw.drawKey,
    label: input.draw.label,
    order: input.draw.order,
    orgKey: input.plan.orgKey,
    plannedEndDate: plannedDate,
    plannedStartDate: plannedDate,
    requestedValueCents: 0,
    scenario: buildScenarioKey(input.plan),
    sourceTimelineDrawId: input.draw._id,
    status: "planned",
    updatedAt: Date.now(),
  };
  if (existing) {
    await ctx.db.patch(existing._id, row);
  } else {
    await ctx.db.insert("demo_drawGroups", row);
  }
}

async function upsertPromotedCapitalEvent(
  ctx: DemoWriteCtx,
  input: {
    event: TimelineCapitalEvent;
    plan: Doc<"demo_timelinePlans">;
    startDate: number;
  }
) {
  const existing = await ctx.db
    .query("demo_capitalEvents")
    .withIndex("by_build_and_source_timeline_capital_event", (q) =>
      q
        .eq("buildId", input.plan.buildId)
        .eq("sourceTimelineCapitalEventId", input.event._id)
    )
    .first();
  const row = {
    amountCents: input.event.amountCents,
    buildId: input.plan.buildId,
    capitalEventKey: input.event.capitalEventKey,
    eventDate: addDaysIso(input.startDate, input.event.x),
    label: input.event.label,
    order: input.event.order,
    orgKey: input.plan.orgKey,
    scenario: buildScenarioKey(input.plan),
    sourceTimelineCapitalEventId: input.event._id,
    updatedAt: Date.now(),
  };
  if (existing) {
    await ctx.db.patch(existing._id, row);
  } else {
    await ctx.db.insert("demo_capitalEvents", row);
  }
}

export const demo_approveTimelinePlan = publicMutation
  .use(withMutationTiming("demo_timeline_plans.approve"))
  .input({
    adminNote: v.optional(v.string()),
    planId: v.string(),
    startDate: v.number(),
  })
  .returns(v.any())
  .handler(async (ctx, args) => {
    const plan = await getPlanOrThrow(ctx, args.planId);
    if (plan.status === "approved") {
      const build = await ctx.db.get(plan.buildId);
      return { buildId: plan.buildId, buildKey: build?.key, planId: plan._id };
    }
    assertPlanAdminWritable(plan);
    if (args.startDate < floorUtcMidnight(Date.now())) {
      throw new Error(START_DATE_ERROR);
    }
    const [build, milestones, draws, capitalEvents] = await Promise.all([
      ctx.db.get(plan.buildId),
      timelineMilestones(ctx, plan._id),
      timelineDraws(ctx, plan._id),
      timelineCapitalEvents(ctx, plan._id),
    ]);
    if (!build) {
      throw new Error("Build not found.");
    }
    for (const milestone of milestones.filter((row) => row.included)) {
      await upsertPromotedMilestone(ctx, {
        milestone,
        plan,
        startDate: args.startDate,
      });
    }
    for (const draw of draws) {
      await upsertPromotedDraw(ctx, { draw, plan, startDate: args.startDate });
    }
    for (const event of capitalEvents) {
      await upsertPromotedCapitalEvent(ctx, {
        event,
        plan,
        startDate: args.startDate,
      });
    }
    const now = Date.now();
    await ctx.db.patch(plan.buildId, {
      orgKey: plan.orgKey,
      ownerPersona: plan.ownerPersona,
      projectStartDate: addDaysIso(args.startDate, 0),
      status: "active",
      updatedAt: now,
    });
    await ctx.db.patch(plan._id, {
      adminNote: args.adminNote,
      approvedAt: now,
      approvedByPersona: MOCK_STAFF_PERSONA,
      startDate: args.startDate,
      status: "approved",
      updatedAt: now,
    });
    await deleteBackofficeCard(ctx, plan._id);
    await appendTimelineEvent(ctx, {
      actorPersona: MOCK_STAFF_PERSONA,
      command: "demo_approveTimelinePlan",
      entityType: "timeline_plan",
      eventType: "TimelinePlanApproved",
      newState: JSON.stringify({
        startDate: args.startDate,
        status: "approved",
      }),
      planId: plan._id,
      priorState: JSON.stringify({ status: plan.status }),
      reason: args.adminNote,
      requirementIds: ["REQ-05", "REQ-08", "REQ-15"],
      traceIds: ["PSEUDO-FLOW-APPROVE", "UML-SEQUENCE-APPROVE"],
      validationIds: ["VAL-07", "VAL-10"],
    });
    return { buildId: plan.buildId, buildKey: build.key, planId: plan._id };
  })
  .public();

export const demo_rejectTimelinePlan = publicMutation
  .use(withMutationTiming("demo_timeline_plans.reject"))
  .input({
    adminNote: v.optional(v.string()),
    planId: v.string(),
    reason: v.optional(v.string()),
  })
  .returns(v.any())
  .handler(async (ctx, args) => {
    const plan = await getPlanOrThrow(ctx, args.planId);
    assertPlanAdminWritable(plan);
    const now = Date.now();
    await ctx.db.patch(plan._id, {
      adminNote: args.adminNote,
      approvedByPersona: MOCK_STAFF_PERSONA,
      archivedAt: now,
      archivedReason: args.reason,
      status: "archived",
      updatedAt: now,
    });
    await deleteBackofficeCard(ctx, plan._id);
    await appendTimelineEvent(ctx, {
      actorPersona: MOCK_STAFF_PERSONA,
      command: "demo_rejectTimelinePlan",
      entityType: "timeline_plan",
      eventType: "TimelinePlanArchived",
      newState: JSON.stringify({ reason: args.reason, status: "archived" }),
      planId: plan._id,
      priorState: JSON.stringify({ status: plan.status }),
      reason: args.reason,
      requirementIds: ["REQ-09", "REQ-15"],
      validationIds: ["VAL-08"],
    });
    return { ok: true, planId: plan._id };
  })
  .public();

export const demo_getTimelinePlanWorkspace = publicQuery
  .use(withQueryTiming("demo_timeline_plans.workspace"))
  .input({ planId: v.string() })
  .returns(v.any())
  .handler(async (ctx, args) => {
    const plan = await getPlanOrThrow(ctx, args.planId);
    return await buildTimelinePlanWorkspace(ctx, plan);
  })
  .public();

async function buildTimelinePlanWorkspace(
  ctx: DemoReadCtx,
  plan: TimelinePlan
) {
  const [
    milestoneRows,
    draws,
    capitalEvents,
    evidenceAssets,
    siteVisitLinks,
    events,
    projection,
    modificationRequests,
  ] = await Promise.all([
    timelineMilestones(ctx, plan._id),
    ctx.db
      .query("demo_timelineDraws")
      .withIndex("by_plan", (q) => q.eq("planId", plan._id))
      .take(100),
    ctx.db
      .query("demo_timelineCapitalEvents")
      .withIndex("by_plan", (q) => q.eq("planId", plan._id))
      .take(100),
    ctx.db
      .query("demo_timelineEvidenceAssets")
      .withIndex("by_plan", (q) => q.eq("planId", plan._id))
      .take(200),
    ctx.db
      .query("demo_timelineSiteVisitLinks")
      .withIndex("by_plan", (q) => q.eq("planId", plan._id))
      .take(100),
    ctx.db
      .query("demo_timelineEvents")
      .withIndex("by_plan", (q) => q.eq("planId", plan._id))
      .order("desc")
      .take(100),
    ctx.db
      .query("demo_backofficeProposalCards")
      .withIndex("by_plan", (q) => q.eq("planId", plan._id))
      .first(),
    ctx.db
      .query("demo_timelineModificationRequests")
      .withIndex("by_plan", (q) => q.eq("planId", plan._id))
      .take(100),
  ]);
  const milestones = await enrichTimelineMilestonesWithLiveSubmilestones(
    ctx,
    plan,
    milestoneRows
  );
  const siteVisits = await Promise.all(
    siteVisitLinks.map(async (link) => {
      const visit = await ctx.db.get(link.siteVisitId);
      if (!visit) {
        return { ...link, visit: null };
      }
      const files = await ctx.db
        .query("demo_siteVisitFiles")
        .withIndex("by_site_visit", (q) => q.eq("siteVisitId", visit._id))
        .take(100);
      return { ...link, files, visit };
    })
  );
  const evidenceAssetProjections = await Promise.all(
    evidenceAssets.map(async (asset) => ({
      ...asset,
      previewUrl: asset.storageId
        ? await ctx.storage.getUrl(asset.storageId)
        : undefined,
    }))
  );
  return {
    capitalEvents: capitalEvents.sort((a, b) => a.order - b.order),
    draws: draws.sort((a, b) => a.order - b.order),
    events,
    evidenceAssets: evidenceAssetProjections,
    milestones,
    modificationRequests: modificationRequests.sort(
      (a, b) => b.updatedAt - a.updatedAt
    ),
    plan,
    projection,
    routeState: plan.routeState,
    siteVisits,
  };
}

export const demo_getBuilderLiveTimelineWorkspaceByBuildKey = publicQuery
  .use(withQueryTiming("demo_timeline_plans.builderLiveWorkspaceByBuildKey"))
  .input({ buildKey: v.string(), persona: v.string() })
  .returns(v.any())
  .handler(async (ctx, args) => {
    const build = await ctx.db
      .query("demo_builds")
      .withIndex("by_key", (q) => q.eq("key", args.buildKey))
      .first();
    if (!(build && build.ownerPersona === args.persona)) {
      return null;
    }
    const plan = await ctx.db
      .query("demo_timelinePlans")
      .withIndex("by_build", (q) => q.eq("buildId", build._id))
      .first();
    if (
      !(
        plan &&
        plan.status === "approved" &&
        plan.ownerPersona === args.persona &&
        plan.orgKey === build.orgKey
      )
    ) {
      return null;
    }
    return await buildTimelinePlanWorkspace(ctx, plan);
  })
  .public();

export const demo_resolveProposalShortLink = publicQuery
  .use(withQueryTiming("demo_timeline_plans.resolveShortLink"))
  .input({ proposalSlug: v.string() })
  .returns(v.any())
  .handler(async (ctx, args) => {
    if (!isProposalSlug(args.proposalSlug)) {
      return null;
    }
    const link = await ctx.db
      .query("demo_proposalShortLinks")
      .withIndex("by_slug", (q) => q.eq("slug", args.proposalSlug))
      .first();
    if (!(link && link.status === "active")) {
      return null;
    }
    return {
      canonicalRouteUrl: `/demo/timeline/${link.planId}`,
      link,
      liveShareUrl: `/demo/timeline/${link.planId}?proposal=${link.slug}`,
      status: link.status,
      timelinePlanId: link.planId,
    };
  })
  .public();

export const demo_updateTimelineMilestone = publicMutation
  .use(withMutationTiming("demo_timeline_plans.updateMilestone"))
  .input({
    budgetCents: v.optional(v.number()),
    dayEnd: v.optional(v.number()),
    dayStart: v.optional(v.number()),
    dependencyKeys: v.optional(v.array(v.string())),
    drawAvailabilityCents: v.optional(v.number()),
    drawKey: v.optional(v.string()),
    durationDays: v.optional(v.number()),
    evidenceState: v.optional(v.string()),
    icon: v.optional(v.string()),
    included: v.optional(v.boolean()),
    lane: v.optional(v.number()),
    markerLabel: v.optional(v.string()),
    milestoneKey: v.string(),
    name: v.optional(v.string()),
    order: v.optional(v.number()),
    planId: v.string(),
    policyState: v.optional(v.string()),
    reason: v.optional(v.string()),
    status: v.optional(v.string()),
    siteVisitGuidance: v.optional(siteVisitGuidanceInputValidator),
    submilestones: v.optional(v.array(submilestoneInputValidator)),
    tone: v.optional(v.string()),
    type: v.optional(v.string()),
    x: v.optional(v.number()),
  })
  .returns(v.any())
  .handler(async (ctx, args) => {
    const plan = await getPlanOrThrow(ctx, args.planId);
    assertPlanStateWritable(plan);
    const milestone = await getMilestoneOrThrow(
      ctx,
      plan._id,
      args.milestoneKey
    );
    if (
      plan.status === "approved" &&
      args.budgetCents !== undefined &&
      args.budgetCents !== milestone.budgetCents
    ) {
      throw new Error("Milestone budget changes require admin approval.");
    }
    const patch: Partial<TimelineMilestone> = { updatedAt: Date.now() };
    if (args.budgetCents !== undefined) {
      if (args.budgetCents < 0) {
        throw new Error("Milestone budget cannot be negative.");
      }
      patch.budgetCents = args.budgetCents;
      patch.drawAvailabilityCents =
        args.drawAvailabilityCents === undefined
          ? calculateDrawAvailabilityCents(
              args.budgetCents,
              plan.borrowerCoPayBps
            )
          : Math.max(0, Math.round(args.drawAvailabilityCents));
    } else if (args.drawAvailabilityCents !== undefined) {
      patch.drawAvailabilityCents = Math.max(
        0,
        Math.round(args.drawAvailabilityCents)
      );
    }
    if (args.dependencyKeys !== undefined) {
      patch.dependencyKeys = args.dependencyKeys;
    }
    if (args.dayStart !== undefined) {
      patch.dayStart = args.dayStart;
    }
    if (args.dayEnd !== undefined) {
      patch.dayEnd = args.dayEnd;
    }
    if (args.drawKey !== undefined) {
      patch.drawKey = args.drawKey;
    }
    if (args.durationDays !== undefined) {
      patch.durationDays = Math.max(1, args.durationDays);
    }
    if (args.evidenceState !== undefined) {
      patch.evidenceState = args.evidenceState;
    }
    if (args.icon !== undefined) {
      patch.icon = normalizeIcon(args.icon);
    }
    if (args.included !== undefined) {
      patch.included = args.included;
    }
    if (args.lane !== undefined) {
      patch.lane = args.lane;
    }
    if (args.markerLabel !== undefined) {
      patch.markerLabel = args.markerLabel;
    }
    if (args.name !== undefined) {
      patch.name = args.name.trim();
    }
    if (args.order !== undefined) {
      patch.order = Math.max(1, Math.round(args.order));
    }
    if (args.policyState !== undefined) {
      patch.policyState = args.policyState;
    }
    if (args.status !== undefined) {
      patch.status = normalizeTimelineStatus(
        args.status
      ) as TimelineMilestone["status"];
    }
    if (args.submilestones !== undefined) {
      patch.submilestoneSnapshot = toSubmilestoneSnapshot(
        args.submilestones,
        args.milestoneKey
      );
    }
    if (args.siteVisitGuidance !== undefined) {
      await replaceTimelineMilestoneGuidanceItems(ctx, {
        guidance: normalizeSiteVisitGuidance(
          args.siteVisitGuidance,
          defaultSiteVisitGuidance(
            milestone.milestoneKey,
            args.name ?? milestone.name,
            (patch.submilestoneSnapshot ?? milestone.submilestoneSnapshot).map(
              (submilestone) => submilestone.name
            )
          )
        ),
        milestoneKey: milestone.milestoneKey,
        planId: plan._id,
      });
    }
    if (args.tone !== undefined) {
      patch.tone = normalizeTone(args.tone);
    }
    if (args.type !== undefined) {
      patch.type = args.type;
    }
    if (args.x !== undefined) {
      patch.x = args.x;
    }
    const nextDayStart = patch.dayStart ?? milestone.dayStart;
    const nextDayEnd = patch.dayEnd ?? milestone.dayEnd;
    if (nextDayEnd < nextDayStart) {
      throw new Error("Milestone end day must be after start day.");
    }
    await ctx.db.patch(milestone._id, patch);
    await ctx.db.patch(plan._id, { updatedAt: Date.now() });
    await appendTimelineEvent(ctx, {
      command: "demo_updateTimelineMilestone",
      entityKey: milestone.milestoneKey,
      entityType: "timeline_milestone",
      eventType: "TimelineMilestoneUpdated",
      newState: JSON.stringify(patch),
      planId: plan._id,
      priorState: JSON.stringify({
        budgetCents: milestone.budgetCents,
        dayEnd: milestone.dayEnd,
        dayStart: milestone.dayStart,
        status: milestone.status,
      }),
      reason: args.reason,
      requirementIds: ["REQ-04"],
      traceIds: ["PSEUDO-FLOW-02", "UML-SEQUENCE-TIMELINE-EDIT"],
      validationIds: ["VAL-03"],
    });
    return { ok: true };
  })
  .public();

async function insertTimelineMilestoneFromInput(
  ctx: DemoWriteCtx,
  plan: Doc<"demo_timelinePlans">,
  milestoneInput: {
    budgetCents: number;
    dayEnd: number;
    dayStart: number;
    dependencyKeys?: string[];
    drawAvailabilityCents?: number;
    drawKey?: string;
    durationDays: number;
    evidenceState: string;
    icon?: string;
    included?: boolean;
    lane?: number;
    markerLabel?: string;
    milestoneKey: string;
    name: string;
    order: number;
    policyState: string;
    status?: string;
    siteVisitGuidance?: SiteVisitGuidance;
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
  }
) {
  const existing = await ctx.db
    .query("demo_timelineMilestones")
    .withIndex("by_plan_and_key", (q) =>
      q.eq("planId", plan._id).eq("milestoneKey", milestoneInput.milestoneKey)
    )
    .first();
  if (existing) {
    throw new Error("Timeline milestone already exists.");
  }
  const now = Date.now();
  const milestoneId = await ctx.db.insert("demo_timelineMilestones", {
    budgetCents: Math.max(0, milestoneInput.budgetCents),
    createdAt: now,
    dayEnd: milestoneInput.dayEnd,
    dayStart: milestoneInput.dayStart,
    dependencyKeys: milestoneInput.dependencyKeys ?? [],
    drawAvailabilityCents:
      milestoneInput.drawAvailabilityCents === undefined
        ? calculateDrawAvailabilityCents(
            milestoneInput.budgetCents,
            plan.borrowerCoPayBps
          )
        : Math.max(0, Math.round(milestoneInput.drawAvailabilityCents)),
    drawKey: milestoneInput.drawKey,
    durationDays: Math.max(1, Math.round(milestoneInput.durationDays)),
    evidenceState: milestoneInput.evidenceState,
    icon: normalizeIcon(milestoneInput.icon),
    included: milestoneInput.included ?? true,
    lane: milestoneInput.lane,
    markerLabel: milestoneInput.markerLabel,
    milestoneKey: milestoneInput.milestoneKey,
    name: milestoneInput.name.trim(),
    order: Math.max(1, Math.round(milestoneInput.order)),
    planId: plan._id,
    policyState: milestoneInput.policyState,
    status: normalizeTimelineStatus(milestoneInput.status),
    submilestoneSnapshot: toSubmilestoneSnapshot(
      milestoneInput.submilestones ?? [],
      milestoneInput.milestoneKey
    ),
    tone: normalizeTone(milestoneInput.tone),
    type: milestoneInput.type ?? "timeline_demo",
    updatedAt: now,
    x: milestoneInput.x,
  });
  await replaceTimelineMilestoneGuidanceItems(ctx, {
    guidance: normalizeSiteVisitGuidance(
      milestoneInput.siteVisitGuidance,
      defaultSiteVisitGuidance(
        milestoneInput.milestoneKey,
        milestoneInput.name,
        (milestoneInput.submilestones ?? []).map((submilestone) => submilestone.name)
      )
    ),
    milestoneKey: milestoneInput.milestoneKey,
    planId: plan._id,
  });
  return milestoneId;
}

export const demo_createTimelineMilestone = publicMutation
  .use(withMutationTiming("demo_timeline_plans.createMilestone"))
  .input({
    milestone: timelineMilestoneUpsertInputValidator,
    planId: v.string(),
  })
  .returns(v.any())
  .handler(async (ctx, args) => {
    const plan = await getPlanOrThrow(ctx, args.planId);
    assertPlanWritable(plan);
    if (plan.status === "approved") {
      throw new Error("Structural milestone changes require admin approval.");
    }
    await insertTimelineMilestoneFromInput(ctx, plan, args.milestone);
    await touchPlan(ctx, plan._id);
    await appendTimelineEvent(ctx, {
      command: "demo_createTimelineMilestone",
      entityKey: args.milestone.milestoneKey,
      entityType: "timeline_milestone",
      eventType: "TimelineMilestoneCreated",
      newState: JSON.stringify(args.milestone),
      planId: plan._id,
    });
    return { ok: true };
  })
  .public();

export const demo_deleteTimelineMilestone = publicMutation
  .use(withMutationTiming("demo_timeline_plans.deleteMilestone"))
  .input({
    milestoneKey: v.string(),
    planId: v.string(),
  })
  .returns(v.any())
  .handler(async (ctx, args) => {
    const plan = await getPlanOrThrow(ctx, args.planId);
    assertPlanWritable(plan);
    if (plan.status === "approved") {
      throw new Error("Structural milestone changes require admin approval.");
    }
    const milestone = await getMilestoneOrThrow(
      ctx,
      plan._id,
      args.milestoneKey
    );
    const assets = await ctx.db
      .query("demo_timelineEvidenceAssets")
      .withIndex("by_plan_and_milestone", (q) =>
        q.eq("planId", plan._id).eq("milestoneKey", args.milestoneKey)
      )
      .take(100);
    for (const asset of assets) {
      if (asset.storageId) {
        await ctx.storage.delete(asset.storageId);
      }
      await ctx.db.delete(asset._id);
    }
    await ctx.db.delete(milestone._id);
    await touchPlan(ctx, plan._id);
    await appendTimelineEvent(ctx, {
      command: "demo_deleteTimelineMilestone",
      entityKey: args.milestoneKey,
      entityType: "timeline_milestone",
      eventType: "TimelineMilestoneDeleted",
      planId: plan._id,
      priorState: JSON.stringify(milestone),
    });
    return { ok: true };
  })
  .public();

export const demo_requestTimelineModification = publicMutation
  .use(withMutationTiming("demo_timeline_plans.requestModification"))
  .input({
    milestoneKey: v.optional(v.string()),
    planId: v.string(),
    reason: v.optional(v.string()),
    requestedPayload: v.any(),
    requestType: timelineModificationRequestTypeValidator,
  })
  .returns(v.any())
  .handler(async (ctx, args) => {
    const plan = await getPlanOrThrow(ctx, args.planId);
    assertApprovedLiveBuild(plan);
    let priorState: unknown;
    if (
      args.requestType === "deleteMilestone" ||
      args.requestType === "updateMilestoneBudget"
    ) {
      if (!args.milestoneKey) {
        throw new Error("milestoneKey is required for this request.");
      }
      priorState = await getMilestoneOrThrow(ctx, plan._id, args.milestoneKey);
    }
    if (
      args.requestType === "createMilestone" &&
      !args.requestedPayload?.milestone
    ) {
      throw new Error("milestone payload is required.");
    }
    if (
      args.requestType === "updateMilestoneBudget" &&
      typeof args.requestedPayload?.budgetCents !== "number"
    ) {
      throw new Error("budgetCents is required.");
    }
    const now = Date.now();
    const requestId = await ctx.db.insert("demo_timelineModificationRequests", {
      actorPersona: MOCK_BUILDER_PERSONA,
      buildId: plan.buildId,
      createdAt: now,
      milestoneKey: args.milestoneKey,
      orgKey: plan.orgKey,
      planId: plan._id,
      priorState,
      reason: args.reason,
      requestedPayload: args.requestedPayload,
      requestType: args.requestType,
      status: "requested",
      updatedAt: now,
    });
    await touchPlan(ctx, plan._id);
    await appendTimelineEvent(ctx, {
      actorPersona: MOCK_BUILDER_PERSONA,
      command: "demo_requestTimelineModification",
      entityKey: args.milestoneKey,
      entityType: "timeline_modification_request",
      eventType: "TimelineModificationRequested",
      newState: JSON.stringify({ requestId, requestType: args.requestType }),
      planId: plan._id,
      reason: args.reason,
    });
    return { requestId };
  })
  .public();

export const demo_reviewTimelineModificationRequest = publicMutation
  .use(withMutationTiming("demo_timeline_plans.reviewModification"))
  .input({
    note: v.optional(v.string()),
    requestId: v.string(),
    status: v.union(v.literal("approved"), v.literal("rejected")),
  })
  .returns(v.any())
  .handler(async (ctx, args) => {
    const requestId = ctx.db.normalizeId(
      "demo_timelineModificationRequests",
      args.requestId
    );
    if (!requestId) {
      throw new Error("Timeline modification request not found.");
    }
    const request = await ctx.db.get(requestId);
    if (!request) {
      throw new Error("Timeline modification request not found.");
    }
    if (request.status !== "requested") {
      return { ok: true, requestId };
    }
    const plan = await ctx.db.get(request.planId);
    if (!plan) {
      throw new Error("Timeline plan not found.");
    }

    if (args.status === "approved") {
      await applyTimelineModificationRequest(ctx, plan, request);
    }

    const now = Date.now();
    await ctx.db.patch(request._id, {
      reviewedAt: now,
      reviewerPersona: MOCK_STAFF_PERSONA,
      reviewNote: args.note,
      status: args.status,
      updatedAt: now,
    });
    await touchPlan(ctx, plan._id);
    await appendTimelineEvent(ctx, {
      actorPersona: MOCK_STAFF_PERSONA,
      command: "demo_reviewTimelineModificationRequest",
      entityKey: request.milestoneKey,
      entityType: "timeline_modification_request",
      eventType: "TimelineModificationReviewed",
      newState: JSON.stringify({ requestId, status: args.status }),
      planId: plan._id,
      reason: args.note,
    });
    return { ok: true, requestId };
  })
  .public();

async function applyTimelineModificationRequest(
  ctx: DemoWriteCtx,
  plan: Doc<"demo_timelinePlans">,
  request: TimelineModificationRequest
) {
  if (request.requestType === "createMilestone") {
    await insertTimelineMilestoneFromInput(
      ctx,
      plan,
      request.requestedPayload.milestone
    );
    return;
  }

  if (!request.milestoneKey) {
    throw new Error("milestoneKey is required for this request.");
  }
  const milestone = await getMilestoneOrThrow(
    ctx,
    plan._id,
    request.milestoneKey
  );

  if (request.requestType === "updateMilestoneBudget") {
    const budgetCents = request.requestedPayload.budgetCents;
    if (typeof budgetCents !== "number" || budgetCents < 0) {
      throw new Error("budgetCents is required.");
    }
    await ctx.db.patch(milestone._id, {
      budgetCents: Math.round(budgetCents),
      drawAvailabilityCents: calculateDrawAvailabilityCents(
        Math.round(budgetCents),
        plan.borrowerCoPayBps
      ),
      updatedAt: Date.now(),
    });
    return;
  }

  if (request.requestType === "deleteMilestone") {
    const assets = await ctx.db
      .query("demo_timelineEvidenceAssets")
      .withIndex("by_plan_and_milestone", (q) =>
        q.eq("planId", plan._id).eq("milestoneKey", request.milestoneKey ?? "")
      )
      .take(100);
    for (const asset of assets) {
      if (asset.storageId) {
        await ctx.storage.delete(asset.storageId);
      }
      await ctx.db.delete(asset._id);
    }
    await ctx.db.delete(milestone._id);
  }
}

export const demo_updateTimelineRouteState = publicMutation
  .use(withMutationTiming("demo_timeline_plans.updateRouteState"))
  .input({
    activeCapitalSpikeId: v.optional(v.string()),
    activeDrawId: v.optional(v.string()),
    activeMilestoneKey: v.optional(v.string()),
    planId: v.string(),
    selectedPanelOpen: v.optional(v.boolean()),
    straightLine: v.optional(v.boolean()),
  })
  .returns(v.any())
  .handler(async (ctx, args) => {
    const plan = await getPlanOrThrow(ctx, args.planId);
    assertPlanWritable(plan);
    const routeState = {
      activeCapitalSpikeId:
        args.activeCapitalSpikeId ?? plan.routeState.activeCapitalSpikeId,
      activeDrawId: args.activeDrawId ?? plan.routeState.activeDrawId,
      activeMilestoneKey:
        args.activeMilestoneKey ?? plan.routeState.activeMilestoneKey,
      selectedPanelOpen:
        args.selectedPanelOpen ?? plan.routeState.selectedPanelOpen,
      straightLine: args.straightLine ?? plan.routeState.straightLine,
    };
    await ctx.db.patch(plan._id, { routeState, updatedAt: Date.now() });
    await appendTimelineEvent(ctx, {
      command: "demo_updateTimelineRouteState",
      entityType: "timeline_route_state",
      eventType: "TimelineRouteStateUpdated",
      newState: JSON.stringify(routeState),
      planId: plan._id,
      requirementIds: ["REQ-04"],
      traceIds: ["UI-TIMELINE-SIDEBAR", "PSEUDO-FLOW-02"],
      validationIds: ["VAL-03"],
    });
    return { ok: true };
  })
  .public();

export const demo_updateTimelinePlanState = publicMutation
  .use(withMutationTiming("demo_timeline_plans.updatePlanState"))
  .input({
    currentDay: v.optional(v.number()),
    planId: v.string(),
    progressValue: v.optional(v.number()),
    rangeMax: v.optional(v.number()),
    rangeMin: v.optional(v.number()),
    routeState: v.optional(timelineRouteStateInputValidator),
    startingCashCents: v.optional(v.number()),
  })
  .returns(v.any())
  .handler(async (ctx, args) => {
    const plan = await getPlanOrThrow(ctx, args.planId);
    assertPlanStateWritable(plan);
    const patch: Partial<Doc<"demo_timelinePlans">> = { updatedAt: Date.now() };
    if (args.currentDay !== undefined) {
      patch.currentDay = args.currentDay;
    }
    if (args.progressValue !== undefined) {
      patch.progressValue = args.progressValue;
    }
    if (args.rangeMax !== undefined) {
      patch.rangeMax = args.rangeMax;
    }
    if (args.rangeMin !== undefined) {
      patch.rangeMin = args.rangeMin;
    }
    if (args.startingCashCents !== undefined) {
      patch.startingCashCents = Math.max(0, Math.round(args.startingCashCents));
      patch.workingCapitalLimitCents = Math.max(
        0,
        Math.round(args.startingCashCents)
      );
    }
    if (args.routeState !== undefined) {
      patch.routeState = args.routeState;
    }
    const nextRangeMin = patch.rangeMin ?? plan.rangeMin;
    const nextRangeMax = patch.rangeMax ?? plan.rangeMax;
    if (nextRangeMax <= nextRangeMin) {
      throw new Error("Timeline range max must be after range min.");
    }
    await ctx.db.patch(plan._id, patch);
    await appendTimelineEvent(ctx, {
      command: "demo_updateTimelinePlanState",
      entityType: "timeline_plan_state",
      eventType: "TimelinePlanStateUpdated",
      newState: JSON.stringify(patch),
      planId: plan._id,
    });
    return { ok: true };
  })
  .public();

export const demo_createTimelineDraw = publicMutation
  .use(withMutationTiming("demo_timeline_plans.createDraw"))
  .input({
    amountCents: v.number(),
    customDate: v.optional(v.boolean()),
    drawKey: v.string(),
    label: v.string(),
    order: v.optional(v.number()),
    planId: v.string(),
    requestNote: v.optional(v.string()),
    requestReviewNote: v.optional(v.string()),
    requestStatus: v.optional(v.string()),
    reviewedAt: v.optional(v.string()),
    requestedAt: v.optional(v.string()),
    x: v.number(),
  })
  .returns(v.any())
  .handler(async (ctx, args) => {
    const plan = await getPlanOrThrow(ctx, args.planId);
    assertPlanWritable(plan);
    const existing = await ctx.db
      .query("demo_timelineDraws")
      .withIndex("by_plan_and_key", (q) =>
        q.eq("planId", plan._id).eq("drawKey", args.drawKey)
      )
      .first();
    if (existing) {
      throw new Error("Timeline draw already exists.");
    }
    const now = Date.now();
    await ctx.db.insert("demo_timelineDraws", {
      amountCents: Math.max(0, Math.round(args.amountCents)),
      createdAt: now,
      customDate: args.customDate ?? true,
      drawKey: args.drawKey,
      label: args.label.trim() || "Reimbursement draw",
      order: args.order ?? 1,
      planId: plan._id,
      requestNote: args.requestNote,
      requestReviewNote: args.requestReviewNote,
      requestStatus: normalizeDrawRequestStatus(args.requestStatus),
      reviewedAt: args.reviewedAt,
      requestedAt: args.requestedAt,
      updatedAt: now,
      x: args.x,
    });
    await touchPlan(ctx, plan._id);
    await appendTimelineEvent(ctx, {
      command: "demo_createTimelineDraw",
      entityKey: args.drawKey,
      entityType: "timeline_draw",
      eventType: "TimelineDrawCreated",
      newState: JSON.stringify(args),
      planId: plan._id,
    });
    return { ok: true };
  })
  .public();

export const demo_updateTimelineDraw = publicMutation
  .use(withMutationTiming("demo_timeline_plans.updateDraw"))
  .input({
    amountCents: v.optional(v.number()),
    customDate: v.optional(v.boolean()),
    drawKey: v.string(),
    label: v.optional(v.string()),
    order: v.optional(v.number()),
    planId: v.string(),
    x: v.optional(v.number()),
  })
  .returns(v.any())
  .handler(async (ctx, args) => {
    const plan = await getPlanOrThrow(ctx, args.planId);
    assertPlanWritable(plan);
    const draw = await getDrawOrThrow(ctx, plan._id, args.drawKey);
    const nextRow: Omit<TimelineDraw, "_creationTime" | "_id"> = {
      amountCents:
        args.amountCents === undefined
          ? draw.amountCents
          : Math.max(0, Math.round(args.amountCents)),
      createdAt: draw.createdAt,
      customDate: args.customDate ?? draw.customDate,
      drawKey: draw.drawKey,
      label:
        args.label === undefined ? draw.label : args.label.trim() || draw.label,
      order: args.order ?? draw.order,
      planId: draw.planId,
      requestNote: draw.requestNote,
      requestReviewNote: draw.requestReviewNote,
      requestStatus: draw.requestStatus,
      reviewedAt: draw.reviewedAt,
      requestedAt: draw.requestedAt,
      updatedAt: Date.now(),
      x: args.x ?? draw.x,
    };
    await ctx.db.replace(draw._id, nextRow);
    await touchPlan(ctx, plan._id);
    await appendTimelineEvent(ctx, {
      command: "demo_updateTimelineDraw",
      entityKey: args.drawKey,
      entityType: "timeline_draw",
      eventType: "TimelineDrawUpdated",
      newState: JSON.stringify(nextRow),
      planId: plan._id,
      priorState: JSON.stringify(draw),
    });
    return { ok: true };
  })
  .public();

export const demo_deleteTimelineDraw = publicMutation
  .use(withMutationTiming("demo_timeline_plans.deleteDraw"))
  .input({
    drawKey: v.string(),
    planId: v.string(),
  })
  .returns(v.any())
  .handler(async (ctx, args) => {
    const plan = await getPlanOrThrow(ctx, args.planId);
    assertPlanWritable(plan);
    const draw = await getDrawOrThrow(ctx, plan._id, args.drawKey);
    if (draw.requestStatus === "approved") {
      throw new Error("Approved reimbursement draws cannot be deleted.");
    }
    await ctx.db.delete(draw._id);
    await renumberTimelineDraws(ctx, plan._id);
    await touchPlan(ctx, plan._id);
    await appendTimelineEvent(ctx, {
      command: "demo_deleteTimelineDraw",
      entityKey: args.drawKey,
      entityType: "timeline_draw",
      eventType: "TimelineDrawDeleted",
      planId: plan._id,
      priorState: JSON.stringify(draw),
    });
    return { ok: true };
  })
  .public();

export const demo_submitTimelineDrawRequest = publicMutation
  .use(withMutationTiming("demo_timeline_plans.submitDrawRequest"))
  .input({
    amountCents: v.number(),
    drawKey: v.string(),
    note: v.optional(v.string()),
    planId: v.string(),
    x: v.optional(v.number()),
  })
  .returns(v.any())
  .handler(async (ctx, args) => {
    const plan = await getPlanOrThrow(ctx, args.planId);
    assertPlanWritable(plan);
    const draw = await getDrawOrThrow(ctx, plan._id, args.drawKey);
    const nextX = args.x ?? draw.x;
    let nextAmountCents = Math.max(0, Math.round(args.amountCents));
    if (plan.status === "approved") {
      const approvedCapacity = await calculateApprovedDrawCapacityCents(
        ctx,
        plan,
        plan._id,
        draw,
        nextX
      );
      if (approvedCapacity.availableLimitCents <= 0) {
        throw new Error("Draw request requires approved milestone completion.");
      }
      nextAmountCents = Math.min(
        nextAmountCents,
        approvedCapacity.availableLimitCents
      );
    }
    const nextRow: Omit<TimelineDraw, "_creationTime" | "_id"> = {
      amountCents: nextAmountCents,
      createdAt: draw.createdAt,
      customDate: true,
      drawKey: draw.drawKey,
      label: draw.label,
      order: draw.order,
      planId: draw.planId,
      requestNote: args.note,
      requestStatus: "requested",
      requestedAt: new Date().toISOString(),
      updatedAt: Date.now(),
      x: nextX,
    };
    await ctx.db.replace(draw._id, nextRow);
    await touchPlan(ctx, plan._id);
    await appendTimelineEvent(ctx, {
      command: "demo_submitTimelineDrawRequest",
      entityKey: args.drawKey,
      entityType: "timeline_draw",
      eventType: "TimelineDrawRequestSubmitted",
      newState: JSON.stringify(nextRow),
      planId: plan._id,
      priorState: JSON.stringify(draw),
    });
    return { ok: true };
  })
  .public();

async function calculateApprovedDrawCapacityCents(
  ctx: DemoReadCtx,
  plan: TimelinePlan,
  planId: TimelinePlanId,
  targetDraw: TimelineDraw,
  drawDay: number
) {
  const [milestones, draws] = await Promise.all([
    timelineMilestones(ctx, planId),
    timelineDraws(ctx, planId),
  ]);
  const approvedMilestones = milestones.filter(
    (milestone) =>
      milestone.dayEnd <= drawDay &&
      milestone.completionClaim?.completionReview?.status === "approved"
  );
  const totalUnlockedCents = approvedMilestones.reduce(
    (total, milestone) =>
      total + getTimelineMilestoneDrawAvailabilityCents(milestone, plan),
    0
  );
  const alreadyDrawnCents = draws.reduce((total, draw) => {
    if (draw.drawKey === targetDraw.drawKey || draw.x > drawDay) {
      return total;
    }
    if (draw.requestStatus === "rejected" || draw.requestStatus === "draft") {
      return total;
    }
    return total + draw.amountCents;
  }, 0);
  return {
    approvedMilestones,
    availableLimitCents: Math.max(0, totalUnlockedCents - alreadyDrawnCents),
    totalUnlockedCents,
  };
}

export const demo_reviewTimelineDrawRequest = publicMutation
  .use(withMutationTiming("demo_timeline_plans.reviewDrawRequest"))
  .input({
    drawKey: v.string(),
    note: v.optional(v.string()),
    planId: v.string(),
    status: v.union(v.literal("approved"), v.literal("rejected")),
  })
  .returns(v.any())
  .handler(async (ctx, args) => {
    const plan = await getPlanOrThrow(ctx, args.planId);
    assertPlanWritable(plan);
    const draw = await getDrawOrThrow(ctx, plan._id, args.drawKey);
    await ctx.db.patch(draw._id, {
      requestReviewNote: args.note,
      requestStatus: args.status,
      reviewedAt: new Date().toISOString(),
      updatedAt: Date.now(),
    });
    await touchPlan(ctx, plan._id);
    await appendTimelineEvent(ctx, {
      command: "demo_reviewTimelineDrawRequest",
      entityKey: args.drawKey,
      entityType: "timeline_draw",
      eventType: "TimelineDrawRequestReviewed",
      newState: JSON.stringify({ note: args.note, status: args.status }),
      planId: plan._id,
      priorState: JSON.stringify(draw),
    });
    return { ok: true };
  })
  .public();

export const demo_createTimelineCapitalEvent = publicMutation
  .use(withMutationTiming("demo_timeline_plans.createCapitalEvent"))
  .input({
    amountCents: v.number(),
    capitalEventKey: v.string(),
    eventKind: v.optional(
      v.union(v.literal("cost"), v.literal("cashInfusion"))
    ),
    label: v.string(),
    order: v.optional(v.number()),
    planId: v.string(),
    x: v.number(),
  })
  .returns(v.any())
  .handler(async (ctx, args) => {
    const plan = await getPlanOrThrow(ctx, args.planId);
    assertPlanWritable(plan);
    const existing = await ctx.db
      .query("demo_timelineCapitalEvents")
      .withIndex("by_plan_and_key", (q) =>
        q.eq("planId", plan._id).eq("capitalEventKey", args.capitalEventKey)
      )
      .first();
    if (existing) {
      throw new Error("Timeline capital event already exists.");
    }
    const now = Date.now();
    await ctx.db.insert("demo_timelineCapitalEvents", {
      amountCents: Math.max(0, Math.round(args.amountCents)),
      capitalEventKey: args.capitalEventKey,
      createdAt: now,
      eventKind: args.eventKind ?? "cost",
      label: args.label.trim() || "Capital spike",
      order: args.order ?? 1,
      planId: plan._id,
      updatedAt: now,
      x: args.x,
    });
    await touchPlan(ctx, plan._id);
    await appendTimelineEvent(ctx, {
      command: "demo_createTimelineCapitalEvent",
      entityKey: args.capitalEventKey,
      entityType: "timeline_capital_event",
      eventType: "TimelineCapitalEventCreated",
      newState: JSON.stringify(args),
      planId: plan._id,
    });
    return { ok: true };
  })
  .public();

export const demo_updateTimelineCapitalEvent = publicMutation
  .use(withMutationTiming("demo_timeline_plans.updateCapitalEvent"))
  .input({
    amountCents: v.optional(v.number()),
    capitalEventKey: v.string(),
    eventKind: v.optional(
      v.union(v.literal("cost"), v.literal("cashInfusion"))
    ),
    label: v.optional(v.string()),
    order: v.optional(v.number()),
    planId: v.string(),
    x: v.optional(v.number()),
  })
  .returns(v.any())
  .handler(async (ctx, args) => {
    const plan = await getPlanOrThrow(ctx, args.planId);
    assertPlanWritable(plan);
    const event = await getCapitalEventOrThrow(
      ctx,
      plan._id,
      args.capitalEventKey
    );
    const patch: Partial<TimelineCapitalEvent> = { updatedAt: Date.now() };
    if (args.amountCents !== undefined) {
      patch.amountCents = Math.max(0, Math.round(args.amountCents));
    }
    if (args.label !== undefined) {
      patch.label = args.label.trim() || event.label;
    }
    if (args.eventKind !== undefined) {
      patch.eventKind = args.eventKind;
    }
    if (args.order !== undefined) {
      patch.order = args.order;
    }
    if (args.x !== undefined) {
      patch.x = args.x;
    }
    await ctx.db.patch(event._id, patch);
    await touchPlan(ctx, plan._id);
    await appendTimelineEvent(ctx, {
      command: "demo_updateTimelineCapitalEvent",
      entityKey: args.capitalEventKey,
      entityType: "timeline_capital_event",
      eventType: "TimelineCapitalEventUpdated",
      newState: JSON.stringify(patch),
      planId: plan._id,
      priorState: JSON.stringify(event),
    });
    return { ok: true };
  })
  .public();

export const demo_createTimelineCashInfusion = publicMutation
  .use(withMutationTiming("demo_timeline_plans.createCashInfusion"))
  .input({
    amountCents: v.number(),
    cashInfusionKey: v.string(),
    label: v.string(),
    order: v.optional(v.number()),
    planId: v.string(),
    x: v.number(),
  })
  .returns(v.any())
  .handler(async (ctx, args) => {
    const plan = await getPlanOrThrow(ctx, args.planId);
    assertPlanWritable(plan);
    const existing = await ctx.db
      .query("demo_timelineCapitalEvents")
      .withIndex("by_plan_and_key", (q) =>
        q.eq("planId", plan._id).eq("capitalEventKey", args.cashInfusionKey)
      )
      .first();
    if (existing) {
      throw new Error("Timeline capital event already exists.");
    }
    const now = Date.now();
    await ctx.db.insert("demo_timelineCapitalEvents", {
      amountCents: Math.max(0, Math.round(args.amountCents)),
      capitalEventKey: args.cashInfusionKey,
      createdAt: now,
      eventKind: "cashInfusion",
      label: args.label.trim() || "Cash infusion",
      order: args.order ?? 1,
      planId: plan._id,
      updatedAt: now,
      x: args.x,
    });
    await touchPlan(ctx, plan._id);
    await appendTimelineEvent(ctx, {
      actorPersona: MOCK_BUILDER_PERSONA,
      command: "demo_createTimelineCashInfusion",
      entityKey: args.cashInfusionKey,
      entityType: "timeline_capital_event",
      eventType: "TimelineCashInfusionCreated",
      newState: JSON.stringify(args),
      planId: plan._id,
    });
    return { ok: true };
  })
  .public();

export const demo_deleteTimelineCapitalEvent = publicMutation
  .use(withMutationTiming("demo_timeline_plans.deleteCapitalEvent"))
  .input({
    capitalEventKey: v.string(),
    planId: v.string(),
  })
  .returns(v.any())
  .handler(async (ctx, args) => {
    const plan = await getPlanOrThrow(ctx, args.planId);
    assertPlanWritable(plan);
    const event = await getCapitalEventOrThrow(
      ctx,
      plan._id,
      args.capitalEventKey
    );
    await ctx.db.delete(event._id);
    await touchPlan(ctx, plan._id);
    await appendTimelineEvent(ctx, {
      command: "demo_deleteTimelineCapitalEvent",
      entityKey: args.capitalEventKey,
      entityType: "timeline_capital_event",
      eventType: "TimelineCapitalEventDeleted",
      planId: plan._id,
      priorState: JSON.stringify(event),
    });
    return { ok: true };
  })
  .public();

export const demo_submitTimelineMilestoneCompletion = publicMutation
  .use(withMutationTiming("demo_timeline_plans.submitMilestoneCompletion"))
  .input({
    actualCostCents: v.optional(v.number()),
    completedDay: v.number(),
    milestoneKey: v.string(),
    note: v.optional(v.string()),
    planId: v.string(),
  })
  .returns(v.any())
  .handler(async (ctx, args) => {
    const plan = await getPlanOrThrow(ctx, args.planId);
    assertPlanWritable(plan);
    const milestone = await getMilestoneOrThrow(
      ctx,
      plan._id,
      args.milestoneKey
    );
    const completionClaim = {
      ...(args.actualCostCents === undefined
        ? {}
        : { actualCost: Math.max(0, Math.round(args.actualCostCents)) }),
      completedDay: Math.max(0, Math.round(args.completedDay)),
      ...(args.note ? { note: args.note } : {}),
      submittedAt: new Date().toISOString(),
    };
    await ctx.db.patch(milestone._id, {
      completionClaim,
      completedAt: Date.now(),
      evidenceState:
        milestone.evidenceState === "Submitted package"
          ? milestone.evidenceState
          : "Completion claimed",
      status: "complete",
      updatedAt: Date.now(),
    });
    await touchPlan(ctx, plan._id);
    await appendTimelineEvent(ctx, {
      command: "demo_submitTimelineMilestoneCompletion",
      entityKey: args.milestoneKey,
      entityType: "timeline_milestone",
      eventType: "TimelineMilestoneCompletionSubmitted",
      newState: JSON.stringify(completionClaim),
      planId: plan._id,
      priorState: JSON.stringify(milestone.completionClaim),
    });
    return { ok: true };
  })
  .public();

export const demo_reviewTimelineMilestoneCompletion = publicMutation
  .use(withMutationTiming("demo_timeline_plans.reviewMilestoneCompletion"))
  .input({
    milestoneKey: v.string(),
    note: v.optional(v.string()),
    planId: v.string(),
    status: v.union(v.literal("approved"), v.literal("revisionRequested")),
  })
  .returns(v.any())
  .handler(async (ctx, args) => {
    const plan = await getPlanOrThrow(ctx, args.planId);
    assertPlanWritable(plan);
    const milestone = await getMilestoneOrThrow(
      ctx,
      plan._id,
      args.milestoneKey
    );
    const completionReview = {
      ...(args.note ? { note: args.note } : {}),
      reviewedAt: new Date().toISOString(),
      ...(milestone.completionClaim?.siteVisit
        ? { siteVisit: milestone.completionClaim.siteVisit }
        : {}),
      status: args.status,
    };
    await ctx.db.patch(milestone._id, {
      completionClaim: {
        ...(milestone.completionClaim ?? {}),
        completionReview,
      },
      updatedAt: Date.now(),
    });
    await touchPlan(ctx, plan._id);
    await appendTimelineEvent(ctx, {
      command: "demo_reviewTimelineMilestoneCompletion",
      entityKey: args.milestoneKey,
      entityType: "timeline_milestone",
      eventType: "TimelineMilestoneCompletionReviewed",
      newState: JSON.stringify(completionReview),
      planId: plan._id,
      priorState: JSON.stringify(milestone.completionClaim),
    });
    return { ok: true };
  })
  .public();

export const demo_generateTimelineEvidenceUploadUrl = publicMutation
  .use(withMutationTiming("demo_timeline_plans.generateEvidenceUploadUrl"))
  .input({ planId: v.string() })
  .returns(v.string())
  .handler(async (ctx, args) => {
    const plan = await getPlanOrThrow(ctx, args.planId);
    assertPlanWritable(plan);
    return await ctx.storage.generateUploadUrl();
  })
  .public();

export const demo_createTimelineEvidenceAsset = publicMutation
  .use(withMutationTiming("demo_timeline_plans.createEvidenceAsset"))
  .input({
    asset: evidenceAssetInputValidator,
    planId: v.string(),
  })
  .returns(v.any())
  .handler(async (ctx, args) => {
    const plan = await getPlanOrThrow(ctx, args.planId);
    assertPlanWritable(plan);
    await getMilestoneOrThrow(ctx, plan._id, args.asset.milestoneKey);
    const existing = await ctx.db
      .query("demo_timelineEvidenceAssets")
      .withIndex("by_plan_and_key", (q) =>
        q.eq("planId", plan._id).eq("evidenceKey", args.asset.evidenceKey)
      )
      .first();
    if (existing) {
      throw new Error("Timeline evidence asset already exists.");
    }
    const now = Date.now();
    await ctx.db.insert("demo_timelineEvidenceAssets", {
      createdAt: now,
      evidenceKey: args.asset.evidenceKey,
      fileName: args.asset.fileName,
      label: args.asset.label,
      locationVerified: args.asset.locationVerified ?? false,
      milestoneKey: args.asset.milestoneKey,
      mimeType: args.asset.mimeType,
      planId: plan._id,
      sizeBytes: Math.max(0, Math.round(args.asset.sizeBytes)),
      source: args.asset.source ?? "timeline_upload",
      storageId: args.asset.storageId,
      tag: args.asset.tag,
      updatedAt: now,
    });
    const milestone = await getMilestoneOrThrow(
      ctx,
      plan._id,
      args.asset.milestoneKey
    );
    await ctx.db.patch(milestone._id, {
      evidenceState: "Submitted package",
      updatedAt: now,
    });
    await touchPlan(ctx, plan._id);
    await appendTimelineEvent(ctx, {
      command: "demo_createTimelineEvidenceAsset",
      entityKey: args.asset.evidenceKey,
      entityType: "timeline_evidence_asset",
      eventType: "TimelineEvidenceAssetCreated",
      newState: JSON.stringify(args.asset),
      planId: plan._id,
    });
    return { ok: true };
  })
  .public();

export const demo_updateTimelineEvidenceAsset = publicMutation
  .use(withMutationTiming("demo_timeline_plans.updateEvidenceAsset"))
  .input({
    evidenceKey: v.string(),
    label: v.optional(v.string()),
    planId: v.string(),
    tag: v.optional(v.string()),
  })
  .returns(v.any())
  .handler(async (ctx, args) => {
    const plan = await getPlanOrThrow(ctx, args.planId);
    assertPlanWritable(plan);
    const asset = await getEvidenceAssetOrThrow(
      ctx,
      plan._id,
      args.evidenceKey
    );
    const patch: Partial<TimelineEvidenceAsset> = { updatedAt: Date.now() };
    if (args.label !== undefined) {
      patch.label = args.label.trim() || asset.label;
    }
    if (args.tag !== undefined) {
      patch.tag = args.tag.trim() || asset.tag;
    }
    await ctx.db.patch(asset._id, patch);
    await touchPlan(ctx, plan._id);
    await appendTimelineEvent(ctx, {
      command: "demo_updateTimelineEvidenceAsset",
      entityKey: args.evidenceKey,
      entityType: "timeline_evidence_asset",
      eventType: "TimelineEvidenceAssetUpdated",
      newState: JSON.stringify(patch),
      planId: plan._id,
      priorState: JSON.stringify(asset),
    });
    return { ok: true };
  })
  .public();

export const demo_deleteTimelineEvidenceAsset = publicMutation
  .use(withMutationTiming("demo_timeline_plans.deleteEvidenceAsset"))
  .input({
    evidenceKey: v.string(),
    planId: v.string(),
  })
  .returns(v.any())
  .handler(async (ctx, args) => {
    const plan = await getPlanOrThrow(ctx, args.planId);
    assertPlanWritable(plan);
    const asset = await getEvidenceAssetOrThrow(
      ctx,
      plan._id,
      args.evidenceKey
    );
    if (asset.storageId) {
      await ctx.storage.delete(asset.storageId);
    }
    await ctx.db.delete(asset._id);
    await touchPlan(ctx, plan._id);
    await appendTimelineEvent(ctx, {
      command: "demo_deleteTimelineEvidenceAsset",
      entityKey: args.evidenceKey,
      entityType: "timeline_evidence_asset",
      eventType: "TimelineEvidenceAssetDeleted",
      planId: plan._id,
      priorState: JSON.stringify(asset),
    });
    return { ok: true };
  })
  .public();

export const demo_requestTimelineSiteVisit = publicMutation
  .use(withMutationTiming("demo_timeline_plans.requestSiteVisit"))
  .input({
    includedMilestoneKeys: v.optional(v.array(v.string())),
    milestoneKey: v.string(),
    persona: v.string(),
    planId: v.string(),
    reason: v.string(),
  })
  .returns(v.any())
  .handler(async (ctx, args) => {
    const plan = await getPlanOrThrow(ctx, args.planId);
    const selected = await getMilestoneOrThrow(
      ctx,
      plan._id,
      args.milestoneKey
    );
    const milestones = await timelineMilestones(ctx, plan._id);
    const guidanceByMilestone = await timelineGuidanceByMilestone(ctx, plan._id);
    const milestoneByKey = new Map(
      milestones.map((milestone) => [milestone.milestoneKey, milestone])
    );
    const includedMilestoneKeys = validateIncludedSiteVisitMilestones({
      includedMilestoneKeys: args.includedMilestoneKeys?.length
        ? args.includedMilestoneKeys
        : [selected.milestoneKey],
      milestoneOrder: milestones.map((milestone) => milestone.milestoneKey),
      selectedMilestoneKey: selected.milestoneKey,
    });
    const token = generateSiteVisitToken();
    const tokenHash = await hashSiteVisitToken(token);
    const now = Date.now();
    const visitId = await ctx.db.insert("demo_siteVisits", {
      assignedPersona: "site_visitor",
      buildId: plan.buildId,
      createdAt: now,
      milestoneId: selected._id,
      milestoneKey: selected.milestoneKey,
      requestReason: args.reason,
      requestedByPersona: args.persona,
      scenario: `timeline:${plan._id}`,
      status: "requested",
      tokenExpiresAt: now + TOKEN_TTL_MS,
      tokenHash,
    });
    for (const milestoneKey of includedMilestoneKeys) {
      const milestone = milestoneByKey.get(milestoneKey);
      if (!milestone) {
        continue;
      }
      const targetId = await ctx.db.insert("demo_siteVisitTargets", {
        buildId: plan.buildId,
        createdAt: now,
        milestoneId: milestone._id,
        milestoneKey: milestone.milestoneKey,
        milestoneName: milestone.name,
        milestoneOrder: milestone.order,
        scenario: `timeline:${plan._id}`,
        siteVisitId: visitId,
        submilestones: milestone.submilestoneSnapshot.map((item) => item.name),
      });
      const guidance = guidanceItemsToGuidance(
        guidanceByMilestone.get(milestone.milestoneKey) ?? [],
        defaultSiteVisitGuidance(
          milestone.milestoneKey,
          milestone.name,
          milestone.submilestoneSnapshot.map((item) => item.name)
        )
      );
      for (const item of guidanceToItems(guidance)) {
        await ctx.db.insert("demo_siteVisitTargetGuidanceItems", {
          buildId: plan.buildId,
          createdAt: now,
          kind: item.kind,
          milestoneKey: milestone.milestoneKey,
          milestoneName: milestone.name,
          order: item.order ?? 0,
          scenario: `timeline:${plan._id}`,
          siteVisitId: visitId,
          siteVisitTargetId: targetId,
          sourceKind: "timeline_milestone",
          sourceKey: milestone.milestoneKey,
          text: item.text,
        });
      }
      await ctx.db.insert("demo_timelineSiteVisitLinks", {
        createdAt: now,
        milestoneKey: milestone.milestoneKey,
        planId: plan._id,
        siteVisitId: visitId,
        status: "unopened",
        tokenExpiresAt: now + TOKEN_TTL_MS,
        updatedAt: now,
      });
    }
    await appendTimelineEvent(ctx, {
      actorPersona: args.persona,
      command: "demo_requestTimelineSiteVisit",
      entityKey: selected.milestoneKey,
      entityType: "timeline_site_visit",
      eventType: "TimelineSiteVisitRequested",
      planId: plan._id,
      reason: args.reason,
      requirementIds: ["REQ-07", "REQ-08"],
      traceIds: [
        "UI-REQUEST-SITE-VISIT",
        "PSEUDO-FLOW-03",
        "UML-STATE-SITE-VISIT",
      ],
      validationIds: ["VAL-04", "VAL-05"],
    });
    return {
      token,
      tokenExpiresAt: now + TOKEN_TTL_MS,
      url: `/newsitevisit/demo-timeline-${plan.proposalSlug}/${token}`,
      visitId,
    };
  })
  .public();

export const demo_getBackofficeDashboard = publicQuery
  .use(withQueryTiming("demo_timeline_plans.backofficeDashboard"))
  .input({})
  .returns(v.any())
  .handler(
    async (ctx) => await ctx.runQuery(drawflowBackofficeDashboardQuery, {})
  )
  .public();
