import { v } from "convex/values";
import { publicMutation, withMutationTiming } from "../fluent";
import {
  appendTimelineEvent,
  assertPlanWritable,
  getDrawOrThrow,
  getPlanOrThrow,
  getTimelineMilestoneDrawAvailabilityCents,
  normalizeDrawRequestStatus,
  renumberTimelineDraws,
  timelineDraws,
  timelineMilestones,
  touchPlan,
} from "./core";
import type { DemoReadCtx, DemoWriteCtx, TimelineDraw, TimelineMilestone, TimelinePlan, TimelinePlanId } from "./core";
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
    const nextAmountCents = Math.round(args.amountCents);
    const nextNote = args.note?.trim() || undefined;

    if (nextAmountCents <= 0) {
      throw new Error("Draw request amount must be greater than zero.");
    }
    if (draw.requestStatus === "requested") {
      const isSameRequest =
        draw.amountCents === nextAmountCents &&
        draw.x === nextX &&
        (draw.requestNote?.trim() || undefined) === nextNote;
      if (isSameRequest) {
        return { idempotent: true, ok: true };
      }
      throw new Error(
        "This draw is already requested with a different amount, date, or note."
      );
    }
    if (draw.requestStatus === "approved") {
      throw new Error("An approved draw request cannot be changed.");
    }

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
      if (nextAmountCents > approvedCapacity.availableLimitCents) {
        throw new Error(
          `Requested amount exceeds the available draw limit of ${approvedCapacity.availableLimitCents} cents.`
        );
      }
    }

    const nextRow: Omit<TimelineDraw, "_creationTime" | "_id"> = {
      amountCents: nextAmountCents,
      createdAt: draw.createdAt,
      customDate: true,
      drawKey: draw.drawKey,
      label: draw.label,
      order: draw.order,
      planId: draw.planId,
      requestNote: nextNote,
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
    return { idempotent: false, ok: true };
  })
  .public();

export async function calculateApprovedDrawCapacityCents(
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
