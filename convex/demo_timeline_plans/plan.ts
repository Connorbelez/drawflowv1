import { v } from "convex/values";
import { MOCK_BUILDER_PERSONA } from "../demo_personas";
import {
  internalMutation,
  publicMutation,
  publicQuery,
  withMutationTiming,
  withQueryTiming,
} from "../fluent";
import {
  DEFAULT_FLAT_DRAW_FEE_CENTS,
  DEFAULT_INTEREST_ANNUAL_BPS,
  DEFAULT_PAYOFF_DATE,
  DEFAULT_PROJECT_START_DATE,
  DEFAULT_TODAY_DATE,
  ORG_KEY,
  TOTAL_REIMBURSEMENT_BPS,
  addDaysIso,
  appendTimelineEvent,
  assertPlanDraftWritable,
  createTimelinePlanSnapshot,
  floorUtcMidnight,
  generateUniqueProposalSlug,
  getPlanOrThrow,
  isMutableDrawGroupForAutoRequest,
  isPromotedMilestoneBehindSchedule,
  isPromotedMilestoneTerminalForCron,
  isTimelineMilestoneTerminalForCron,
  nextPromotedMilestoneScheduleStatus,
  nextTimelineMilestoneScheduleState,
  normalizeBorrowerCoPayBps,
  normalizeIcon,
  normalizeSetupPayload,
  normalizeTimelineStatus,
  normalizeTone,
  replaceTimelineMilestoneGuidanceItems,
  setupCapitalEventInputValidator,
  setupDrawInputValidator,
  setupMilestoneInputValidator,
  syncBackofficeCard,
  timelineCapitalEvents,
  timelineDraws,
  timelineMilestones,
  utcDayOffset,
} from "./core";
import type { Doc } from "../types";
import type {
  DemoReadCtx,
  DemoWriteCtx,
  TimelineDraw,
  TimelineMilestone,
  TimelinePlan,
  TimelinePlanId,
} from "./core";
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
      lenderDrawPolicyLimitCents: args.lenderDrawPolicyLimitCents,
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
        straightLine: true,
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

export async function getSnapshotForPlan(
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

export interface RollForwardSummary {
  autoRequestedDraws: number;
  buildsMarkedBehind: number;
  buildsUpdated: number;
  drawGroupsUpdated: number;
  milestonesUpdated: number;
  plansSkipped: number;
  plansUpdated: number;
  processedPlans: number;
}

export interface RollForwardRows {
  build: Doc<"demo_builds"> | null;
  draws: TimelineDraw[];
  milestones: TimelineMilestone[];
  promotedDrawGroups: Doc<"demo_drawGroups">[];
  promotedMilestones: Doc<"demo_milestones">[];
}

export function emptyRollForwardSummary(): RollForwardSummary {
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

export async function getRollForwardRows(
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

export function activeMilestoneForDay(
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

export async function rollForwardPlanState(
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

export async function rollForwardTimelineMilestones(
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

export async function rollForwardPromotedMilestones(
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

export async function autoRequestDueDraws(
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

export async function rollForwardBuild(
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

export async function rollForwardApprovedPlan(
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

export async function rollForwardApprovedTimelines(ctx: DemoWriteCtx, now: number) {
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
