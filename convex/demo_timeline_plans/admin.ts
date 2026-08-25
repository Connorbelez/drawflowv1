import { v } from "convex/values";
import { MOCK_STAFF_PERSONA } from "../demo_personas";
import { internalMutation, publicMutation, withMutationTiming } from "../fluent";
import {
  addDaysIso,
  appendTimelineEvent,
  assertPlanAdminWritable,
  buildScenarioKey,
  calculateDrawAvailabilityCents,
  deleteBackofficeCard,
  getDrawOrThrow,
  getMilestoneOrThrow,
  getPlanOrThrow,
  floorUtcMidnight,
  START_DATE_ERROR,
  renumberTimelineDraws,
  syncBackofficeCard,
  timelineCapitalEvents,
  timelineDraws,
  timelineMilestones,
  touchPlan,
} from "./core";
import { rollForwardApprovedTimelines } from "./plan";
import {
  ORG_KEY,
} from "./core";
import type {
  DemoReadCtx,
  DemoWriteCtx,
  TimelineCapitalEvent,
  TimelineDraw,
  TimelineMilestone,
  TimelinePlan,
} from "./core";
import type { Doc } from "../types";
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

export async function upsertPromotedMilestone(
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

export async function syncPromotedSubmilestones(
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

  for (const [
    index,
    snapshot,
  ] of input.milestone.submilestoneSnapshot.entries()) {
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

export async function upsertPromotedDraw(
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

export async function upsertPromotedCapitalEvent(
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
