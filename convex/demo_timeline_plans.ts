import { v } from "convex/values";

import {
  generateSiteVisitToken,
  hashSiteVisitToken,
  validateIncludedSiteVisitMilestones,
} from "./demo_site_visit_tokens";
import {
  publicMutation,
  publicQuery,
  withMutationTiming,
  withQueryTiming,
} from "./fluent";
import type { DatabaseReader, DatabaseWriter, Doc, Id } from "./types";

const ORG_KEY = "org_fairlend_demo";
const DEFAULT_FLAT_DRAW_FEE_CENTS = 50_000;
const DEFAULT_INTEREST_ANNUAL_BPS = 925;
const DEFAULT_PAYOFF_DATE = "2027-01-05";
const DEFAULT_PROJECT_START_DATE = "2026-06-01";
const DEFAULT_TODAY_DATE = "2026-05-20";
const TOKEN_TTL_MS = 60 * 60 * 1000;
const SHORT_LINK_PATTERN = /^[a-z]+-[a-z]+-[a-z0-9]{4}$/;

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
type TimelineMilestone = Doc<"demo_timelineMilestones">;
type TimelineDraw = Doc<"demo_timelineDraws">;
type TimelineCapitalEvent = Doc<"demo_timelineCapitalEvents">;
type TimelineEvidenceAsset = Doc<"demo_timelineEvidenceAssets">;
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
type NormalizedDraw = {
  amountCents: number;
  customDate: boolean;
  drawKey: string;
  itemMilestoneKey?: string;
  label: string;
  order: number;
  requestNote?: string;
  requestReviewNote?: string;
  requestStatus: DrawRequestStatus;
  reviewedAt?: string;
  requestedAt?: string;
  x: number;
};
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
}

interface DemoWriteCtx {
  db: DatabaseWriter;
}

const submilestoneInputValidator = v.object({
  budgetCents: v.optional(v.number()),
  durationDays: v.optional(v.number()),
  key: v.optional(v.string()),
  name: v.string(),
  order: v.optional(v.number()),
});

const setupMilestoneInputValidator = v.object({
  budgetCents: v.number(),
  dayEnd: v.optional(v.number()),
  dayStart: v.optional(v.number()),
  dependencyKeys: v.optional(v.array(v.string())),
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
  submilestones: v.optional(v.array(submilestoneInputValidator)),
  tone: v.optional(v.string()),
  type: v.optional(v.string()),
  x: v.number(),
});

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
  capitalEvents?: {
    amountCents: number;
    capitalEventKey: string;
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
    submilestones?: {
      budgetCents?: number;
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
      return {
        ...milestone,
        dayEnd: milestone.dayEnd ?? dayStart + durationDays,
        dayStart,
        durationDays,
        order,
        submilestoneSnapshot: (milestone.submilestones ?? []).map(
          (submilestone, subIndex) => ({
            budgetCents: submilestone.budgetCents,
            durationDays: submilestone.durationDays,
            key:
              submilestone.key ??
              `${milestone.key}-sub-${String(subIndex + 1).padStart(2, "0")}`,
            name: submilestone.name,
            order: submilestone.order ?? subIndex + 1,
          }),
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
        amountCents: milestone.budgetCents,
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
  status: string | undefined,
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
  },
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
  milestoneKey: string,
) {
  const milestone = await ctx.db
    .query("demo_timelineMilestones")
    .withIndex("by_plan_and_key", (q) =>
      q.eq("planId", planId).eq("milestoneKey", milestoneKey),
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
  drawKey: string,
) {
  const draw = await ctx.db
    .query("demo_timelineDraws")
    .withIndex("by_plan_and_key", (q) =>
      q.eq("planId", planId).eq("drawKey", drawKey),
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
  planId: TimelinePlanId,
) {
  const now = Date.now();
  const draws = await ctx.db
    .query("demo_timelineDraws")
    .withIndex("by_plan", (q) => q.eq("planId", planId))
    .take(200);
  const sortedDraws = draws.sort(
    (a, b) =>
      a.order - b.order || a.x - b.x || a.drawKey.localeCompare(b.drawKey),
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
  capitalEventKey: string,
) {
  const event = await ctx.db
    .query("demo_timelineCapitalEvents")
    .withIndex("by_plan_and_key", (q) =>
      q.eq("planId", planId).eq("capitalEventKey", capitalEventKey),
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
  evidenceKey: string,
) {
  const asset = await ctx.db
    .query("demo_timelineEvidenceAssets")
    .withIndex("by_plan_and_key", (q) =>
      q.eq("planId", planId).eq("evidenceKey", evidenceKey),
    )
    .first();
  if (!asset) {
    throw new Error("Timeline evidence asset not found.");
  }
  return asset;
}

function assertPlanWritable(plan: Doc<"demo_timelinePlans">) {
  if (plan.status === "archived") {
    throw new Error("Archived plans are read only.");
  }
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
  },
) {
  const now = Date.now();
  const existing = await ctx.db
    .query("demo_backofficeProposalCards")
    .withIndex("by_plan", (q) => q.eq("planId", input.planId))
    .first();
  const row = {
    buildId: input.buildId,
    column: input.status === "draft" ? "draft" : "active",
    href: `/demo/timeline/${input.planId}`,
    planId: input.planId,
    priority: "medium",
    proposalSlug: input.proposalSlug,
    sortAt: now,
    status: "timeline generated",
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

export const demo_createTimelinePlanFromSetup = publicMutation
  .use(withMutationTiming("demo_timeline_plans.create"))
  .input({
    actorPersona: v.optional(v.string()),
    address: v.string(),
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
      capitalEvents: args.capitalEvents,
      draws: args.draws,
      milestones: args.milestones,
    });
    const now = Date.now();
    const proposalSlug = await generateUniqueProposalSlug(ctx);
    const buildKey = `demo-timeline-${proposalSlug}`;
    const buildId = await ctx.db.insert("demo_builds", {
      borrowerCoPayCents: args.borrowerCoPayCents ?? 0,
      flatDrawFeeCents: DEFAULT_FLAT_DRAW_FEE_CENTS,
      interestAnnualBps: DEFAULT_INTEREST_ANNUAL_BPS,
      key: buildKey,
      lenderDrawPolicyLimitCents:
        args.lenderDrawPolicyLimitCents ??
        args.workingCapitalLimitCents ??
        args.startingCashCents,
      name: args.buildName ?? args.templateTitle,
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
      actorPersona: args.actorPersona ?? "lender_admin",
      address: args.address,
      buildId,
      borrowerCoPayCents: args.borrowerCoPayCents ?? 0,
      buildName: args.buildName ?? args.templateTitle,
      createdAt: now,
      currentDay: args.currentDay ?? 0,
      lenderDrawPolicyLimitCents:
        args.lenderDrawPolicyLimitCents ??
        args.workingCapitalLimitCents ??
        args.startingCashCents,
      orgKey: ORG_KEY,
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
        label: event.label,
        order: event.order,
        planId,
        updatedAt: now,
        x: event.x,
      });
    }
    await appendTimelineEvent(ctx, {
      actorPersona: args.actorPersona,
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

export const demo_getTimelinePlanWorkspace = publicQuery
  .use(withQueryTiming("demo_timeline_plans.workspace"))
  .input({ planId: v.string() })
  .returns(v.any())
  .handler(async (ctx, args) => {
    const plan = await getPlanOrThrow(ctx, args.planId);
    const [
      milestones,
      draws,
      capitalEvents,
      evidenceAssets,
      siteVisitLinks,
      events,
      projection,
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
    ]);
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
      }),
    );
    const evidenceAssetProjections = await Promise.all(
      evidenceAssets.map(async (asset) => ({
        ...asset,
        previewUrl: asset.storageId
          ? await ctx.storage.getUrl(asset.storageId)
          : undefined,
      })),
    );
    return {
      capitalEvents: capitalEvents.sort((a, b) => a.order - b.order),
      draws: draws.sort((a, b) => a.order - b.order),
      events,
      evidenceAssets: evidenceAssetProjections,
      milestones,
      plan,
      projection,
      routeState: plan.routeState,
      siteVisits,
    };
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
    submilestones: v.optional(v.array(submilestoneInputValidator)),
    tone: v.optional(v.string()),
    type: v.optional(v.string()),
    x: v.optional(v.number()),
  })
  .returns(v.any())
  .handler(async (ctx, args) => {
    const plan = await getPlanOrThrow(ctx, args.planId);
    assertPlanWritable(plan);
    const milestone = await getMilestoneOrThrow(
      ctx,
      plan._id,
      args.milestoneKey,
    );
    const patch: Partial<TimelineMilestone> = { updatedAt: Date.now() };
    if (args.budgetCents !== undefined) {
      if (args.budgetCents < 0) {
        throw new Error("Milestone budget cannot be negative.");
      }
      patch.budgetCents = args.budgetCents;
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
        args.status,
      ) as TimelineMilestone["status"];
    }
    if (args.submilestones !== undefined) {
      patch.submilestoneSnapshot = args.submilestones.map(
        (submilestone, index) => ({
          budgetCents: submilestone.budgetCents,
          durationDays: submilestone.durationDays,
          key:
            submilestone.key ??
            `${args.milestoneKey}-sub-${String(index + 1).padStart(2, "0")}`,
          name: submilestone.name,
          order: submilestone.order ?? index + 1,
        }),
      );
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
    const existing = await ctx.db
      .query("demo_timelineMilestones")
      .withIndex("by_plan_and_key", (q) =>
        q
          .eq("planId", plan._id)
          .eq("milestoneKey", args.milestone.milestoneKey),
      )
      .first();
    if (existing) {
      throw new Error("Timeline milestone already exists.");
    }
    const now = Date.now();
    await ctx.db.insert("demo_timelineMilestones", {
      budgetCents: Math.max(0, args.milestone.budgetCents),
      createdAt: now,
      dayEnd: args.milestone.dayEnd,
      dayStart: args.milestone.dayStart,
      dependencyKeys: args.milestone.dependencyKeys ?? [],
      drawKey: args.milestone.drawKey,
      durationDays: Math.max(1, Math.round(args.milestone.durationDays)),
      evidenceState: args.milestone.evidenceState,
      icon: normalizeIcon(args.milestone.icon),
      included: args.milestone.included ?? true,
      lane: args.milestone.lane,
      markerLabel: args.milestone.markerLabel,
      milestoneKey: args.milestone.milestoneKey,
      name: args.milestone.name.trim(),
      order: Math.max(1, Math.round(args.milestone.order)),
      planId: plan._id,
      policyState: args.milestone.policyState,
      status: normalizeTimelineStatus(args.milestone.status),
      submilestoneSnapshot: (args.milestone.submilestones ?? []).map(
        (submilestone, index) => ({
          budgetCents: submilestone.budgetCents,
          durationDays: submilestone.durationDays,
          key:
            submilestone.key ??
            `${args.milestone.milestoneKey}-sub-${String(index + 1).padStart(2, "0")}`,
          name: submilestone.name,
          order: submilestone.order ?? index + 1,
        }),
      ),
      tone: normalizeTone(args.milestone.tone),
      type: args.milestone.type ?? "timeline_demo",
      updatedAt: now,
      x: args.milestone.x,
    });
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
    const milestone = await getMilestoneOrThrow(
      ctx,
      plan._id,
      args.milestoneKey,
    );
    const assets = await ctx.db
      .query("demo_timelineEvidenceAssets")
      .withIndex("by_plan_and_milestone", (q) =>
        q.eq("planId", plan._id).eq("milestoneKey", args.milestoneKey),
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
    assertPlanWritable(plan);
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
        Math.round(args.startingCashCents),
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
        q.eq("planId", plan._id).eq("drawKey", args.drawKey),
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
  })
  .returns(v.any())
  .handler(async (ctx, args) => {
    const plan = await getPlanOrThrow(ctx, args.planId);
    assertPlanWritable(plan);
    const draw = await getDrawOrThrow(ctx, plan._id, args.drawKey);
    const nextRow: Omit<TimelineDraw, "_creationTime" | "_id"> = {
      amountCents: Math.max(0, Math.round(args.amountCents)),
      createdAt: draw.createdAt,
      customDate: draw.customDate,
      drawKey: draw.drawKey,
      label: draw.label,
      order: draw.order,
      planId: draw.planId,
      requestNote: args.note,
      requestStatus: "requested",
      requestedAt: new Date().toISOString(),
      updatedAt: Date.now(),
      x: draw.x,
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
        q.eq("planId", plan._id).eq("capitalEventKey", args.capitalEventKey),
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
      args.capitalEventKey,
    );
    const patch: Partial<TimelineCapitalEvent> = { updatedAt: Date.now() };
    if (args.amountCents !== undefined) {
      patch.amountCents = Math.max(0, Math.round(args.amountCents));
    }
    if (args.label !== undefined) {
      patch.label = args.label.trim() || event.label;
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
      args.capitalEventKey,
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
      args.milestoneKey,
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
      args.milestoneKey,
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
        q.eq("planId", plan._id).eq("evidenceKey", args.asset.evidenceKey),
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
      args.asset.milestoneKey,
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
      args.evidenceKey,
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
      args.evidenceKey,
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
      args.milestoneKey,
    );
    const milestones = await timelineMilestones(ctx, plan._id);
    const milestoneByKey = new Map(
      milestones.map((milestone) => [milestone.milestoneKey, milestone]),
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
      await ctx.db.insert("demo_siteVisitTargets", {
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
  .handler(async (ctx) => {
    const cards = await ctx.db
      .query("demo_backofficeProposalCards")
      .withIndex("by_updated")
      .order("desc")
      .take(50);
    return {
      generatedProposalCards: cards.map((card) => ({
        ...card,
        badge: "demo",
        href: `/demo/timeline/${card.planId}`,
      })),
    };
  })
  .public();
