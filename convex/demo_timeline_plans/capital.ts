import { v } from "convex/values";
import { MOCK_BUILDER_PERSONA } from "../demo_personas";
import { publicMutation, withMutationTiming } from "../fluent";
import {
  appendTimelineEvent,
  assertPlanWritable,
  getCapitalEventOrThrow,
  getPlanOrThrow,
  touchPlan,
} from "./core";
import type { DemoReadCtx, DemoWriteCtx, TimelineCapitalEvent } from "./core";
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
