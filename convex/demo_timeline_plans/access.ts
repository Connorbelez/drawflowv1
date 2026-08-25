import { MOCK_BUILDER_PERSONA } from "../demo_personas";
import { guidanceToItems, type SiteVisitGuidance } from "../demo_site_visit_guidance";
import {
  createProposalSlugCandidate,
  getTimelineMilestoneDrawAvailabilityCents,
  normalizeDrawRequestStatus,
  DAY_MS,
} from "./shared";
import type {
  DemoReadCtx,
  DemoWriteCtx,
  DrawRequestStatus,
  TimelineCapitalEvent,
  TimelineDraw,
  TimelineEvidenceAsset,
  TimelineMilestone,
  TimelineModificationRequest,
  TimelinePlan,
  TimelinePlanId,
} from "./shared";
import type { Doc, Id } from "../types";

export async function appendTimelineEvent(
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

export async function generateUniqueProposalSlug(ctx: DemoReadCtx) {
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

export async function getPlanOrThrow(ctx: DemoReadCtx, planId: string) {
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

export async function getMilestoneOrThrow(
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

export async function getDrawOrThrow(
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

export function relabeledDrawLabel(label: string, order: number) {
  return /^draw\s+\d+$/i.test(label.trim())
    ? `Draw ${String(order).padStart(2, "0")}`
    : label;
}

export async function renumberTimelineDraws(
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

export async function getCapitalEventOrThrow(
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

export async function getEvidenceAssetOrThrow(
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

export function assertPlanWritable(plan: Doc<"demo_timelinePlans">) {
  if (!(plan.status === "draft" || plan.status === "approved")) {
    throw new Error(`Plan is not editable in status: ${plan.status}`);
  }
}

export function assertPlanDraftWritable(plan: Doc<"demo_timelinePlans">) {
  if (plan.status !== "draft") {
    throw new Error(`Plan is not editable in status: ${plan.status}`);
  }
}

export function assertPlanStateWritable(plan: Doc<"demo_timelinePlans">) {
  if (!(plan.status === "draft" || plan.status === "approved")) {
    throw new Error(`Plan state is not editable in status: ${plan.status}`);
  }
}

export function assertPlanAdminWritable(plan: Doc<"demo_timelinePlans">) {
  if (plan.status !== "submitted") {
    throw new Error("Plan is not in submitted status");
  }
}

export function assertApprovedLiveBuild(plan: Doc<"demo_timelinePlans">) {
  if (plan.status !== "approved") {
    throw new Error(
      "Modification requests are only available for live builds."
    );
  }
}

export function floorUtcMidnight(epochMs: number) {
  const date = new Date(epochMs);
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

export function addDaysIso(startDate: number, dayOffset: number) {
  return new Date(startDate + Math.round(dayOffset) * DAY_MS)
    .toISOString()
    .slice(0, 10);
}

export function utcDayOffset(startDate: number, nowMs: number) {
  return Math.max(
    0,
    Math.floor((floorUtcMidnight(nowMs) - floorUtcMidnight(startDate)) / DAY_MS)
  );
}

export function isTimelineMilestoneTerminalForCron(milestone: TimelineMilestone) {
  return milestone.status === "complete" || milestone.completedAt !== undefined;
}

export function nextTimelineMilestoneScheduleState(
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

export function isPromotedMilestoneTerminalForCron(status: string) {
  return (
    status === "completion_approved" ||
    status === "completion_rejected" ||
    status === "submitted_for_review" ||
    status === "site_visit_requested" ||
    status === "site_visit_complete" ||
    status === "complete_pending_submission"
  );
}

export function nextPromotedMilestoneScheduleStatus(
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

export function isPromotedMilestoneBehindSchedule(
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

export function isMutableDrawGroupForAutoRequest(status: string) {
  return (
    status === "planned" ||
    status === "not_yet_eligible" ||
    status === "partially_eligible" ||
    status === "active"
  );
}

export function buildScenarioKey(plan: Doc<"demo_timelinePlans">) {
  return `timeline:${plan.proposalSlug}`;
}

export async function deleteBackofficeCard(ctx: DemoWriteCtx, planId: TimelinePlanId) {
  const existing = await ctx.db
    .query("demo_backofficeProposalCards")
    .withIndex("by_plan", (q) => q.eq("planId", planId))
    .first();
  if (existing) {
    await ctx.db.delete(existing._id);
  }
}

export async function timelineDraws(ctx: DemoReadCtx, planId: TimelinePlanId) {
  return (
    await ctx.db
      .query("demo_timelineDraws")
      .withIndex("by_plan", (q) => q.eq("planId", planId))
      .take(200)
  ).sort((a, b) => a.order - b.order);
}

export async function timelineCapitalEvents(ctx: DemoReadCtx, planId: TimelinePlanId) {
  return (
    await ctx.db
      .query("demo_timelineCapitalEvents")
      .withIndex("by_plan", (q) => q.eq("planId", planId))
      .take(200)
  ).sort((a, b) => a.order - b.order);
}

export async function touchPlan(ctx: DemoWriteCtx, planId: TimelinePlanId) {
  await ctx.db.patch(planId, { updatedAt: Date.now() });
}

export async function timelineMilestones(ctx: DemoReadCtx, planId: TimelinePlanId) {
  return (
    await ctx.db
      .query("demo_timelineMilestones")
      .withIndex("by_plan", (q) => q.eq("planId", planId))
      .take(200)
  ).sort((a, b) => a.order - b.order);
}

export async function timelineMilestoneGuidanceItems(
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

export async function timelineGuidanceByMilestone(
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

export async function replaceTimelineMilestoneGuidanceItems(
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

export async function enrichTimelineMilestonesWithLiveSubmilestones(
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

  const byMilestoneKey = new Map<
    string,
    Map<string, (typeof submilestoneRows)[0]>
  >();
  for (const row of submilestoneRows) {
    const milestoneRows =
      byMilestoneKey.get(row.milestoneKey) ??
      new Map<string, (typeof submilestoneRows)[0]>();
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

export async function syncBackofficeCard(
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

export async function createTimelinePlanSnapshot(
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
