import { v } from "convex/values";
import { publicQuery, withQueryTiming } from "../fluent";
import {
  enrichTimelineMilestonesWithLiveSubmilestones,
  getPlanOrThrow,
  isProposalSlug,
  timelineMilestones,
} from "./core";
import type { DemoReadCtx, TimelinePlan } from "./core";
export const demo_getTimelinePlanWorkspace = publicQuery
  .use(withQueryTiming("demo_timeline_plans.workspace"))
  .input({ planId: v.string() })
  .returns(v.any())
  .handler(async (ctx, args) => {
    const plan = await getPlanOrThrow(ctx, args.planId);
    return await buildTimelinePlanWorkspace(ctx, plan);
  })
  .public();

export async function buildTimelinePlanWorkspace(
  ctx: DemoReadCtx,
  plan: TimelinePlan
) {
  const [
    build,
    milestoneRows,
    draws,
    capitalEvents,
    evidenceAssets,
    siteVisitLinks,
    events,
    projection,
    modificationRequests,
  ] = await Promise.all([
    ctx.db.get(plan.buildId),
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
    build,
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
