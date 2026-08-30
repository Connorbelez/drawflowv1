import { v } from "convex/values";
import { MOCK_BUILDER_PERSONA, MOCK_STAFF_PERSONA } from "../demo_personas";
import {
  defaultSiteVisitGuidance,
  normalizeSiteVisitGuidance,
} from "../demo_site_visit_guidance";
import { publicMutation, withMutationTiming } from "../fluent";
import {
  appendTimelineEvent,
  assertApprovedLiveBuild,
  assertPlanStateWritable,
  assertPlanWritable,
  calculateDrawAvailabilityCents,
  getMilestoneOrThrow,
  getPlanOrThrow,
  normalizeIcon,
  normalizeTimelineStatus,
  normalizeTone,
  replaceTimelineMilestoneGuidanceItems,
  toSubmilestoneSnapshot,
  touchPlan,
  siteVisitGuidanceInputValidator,
  submilestoneInputValidator,
  timelineMilestoneUpsertInputValidator,
  timelineRouteStateInputValidator,
  timelineModificationRequestTypeValidator,
} from "./core";
import type { DemoReadCtx, DemoWriteCtx, DemoTimelineSiteVisitGuidanceInput, TimelineMilestone, TimelineModificationRequest, TimelinePlan, TimelinePlanId } from "./core";
import type { Doc } from "../types";
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

export async function insertTimelineMilestoneFromInput(
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
        (milestoneInput.submilestones ?? []).map(
          (submilestone) => submilestone.name
        )
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

export async function applyTimelineModificationRequest(
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
