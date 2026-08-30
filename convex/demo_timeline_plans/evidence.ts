import { v } from "convex/values";
import {
  defaultSiteVisitGuidance,
  guidanceItemsToGuidance,
  guidanceToItems,
} from "../demo_site_visit_guidance";
import {
  generateSiteVisitToken,
  hashSiteVisitToken,
  validateIncludedSiteVisitMilestones,
} from "../demo_site_visit_tokens";
import { publicMutation, withMutationTiming } from "../fluent";
import {
  appendTimelineEvent,
  assertPlanWritable,
  getEvidenceAssetOrThrow,
  getMilestoneOrThrow,
  getPlanOrThrow,
  evidenceAssetInputValidator,
  TOKEN_TTL_MS,
  timelineGuidanceByMilestone,
  timelineMilestones,
  touchPlan,
} from "./core";
import type { DemoReadCtx, DemoWriteCtx, TimelineEvidenceAsset, TimelineMilestone } from "./core";
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
    const guidanceByMilestone = await timelineGuidanceByMilestone(
      ctx,
      plan._id
    );
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
    const workOrderId = `DEMO-WO-${selected.milestoneKey}-${now}`;
    const evidencePackageId = `DEMO-EP-${String(plan._id)}-${selected.milestoneKey}`;
    const visitId = await ctx.db.insert("demo_siteVisits", {
      assignedPersona: "site_visitor",
      buildId: plan.buildId,
      createdAt: now,
      evidencePackageId,
      organizationScopeKey: plan.orgKey,
      scopeBoundAt: now,
      workOrderId,
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
      evidencePackageId,
      organizationScopeKey: plan.orgKey,
      workOrderId,
      token,
      tokenExpiresAt: now + TOKEN_TTL_MS,
      url: `/newsitevisit/demo-timeline-${plan.proposalSlug}/${token}`,
      visitId,
    };
  })
  .public();
