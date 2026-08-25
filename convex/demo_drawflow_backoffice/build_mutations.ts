import { v } from "convex/values";
import { publicMutation, withMutationTiming } from "../fluent";
import { demoBuildAddress } from "../demo_build_address";
import {
  addDaysToIsoDate,
  assertIsoDate,
  centsSum,
  daysBetween,
  type DemoBuild,
} from "./view";

export const demo_updateBuildDetails = publicMutation
  .use(withMutationTiming("demo_drawflow_backoffice.updateBuildDetails"))
  .input({
    buildId: v.id("demo_builds"),
    address: v.optional(v.string()),
    projectStartDate: v.optional(v.string()),
    payoffDate: v.optional(v.string()),
    todayDate: v.optional(v.string()),
    daysToPayoff: v.optional(v.number()),
    percentComplete: v.optional(v.number()),
    openWarnings: v.optional(v.number()),
    siteVisitsOpen: v.optional(v.number()),
  })
  .returns(
    v.object({
      address: v.string(),
      projectStartDate: v.string(),
      payoffDate: v.string(),
      todayDate: v.string(),
      daysToPayoff: v.number(),
      percentComplete: v.number(),
      openWarnings: v.number(),
      siteVisitsOpen: v.number(),
    })
  )
  .handler(async (ctx, args) => {
    const build = await ctx.db.get(args.buildId);
    if (!build) {
      throw new Error(`Build ${args.buildId} not found`);
    }

    const patch: Partial<DemoBuild> & { updatedAt: number } = {
      updatedAt: Date.now(),
    };

    if (args.address !== undefined) {
      const trimmed = args.address.trim();
      if (!trimmed) {
        throw new Error("Address cannot be empty.");
      }
      patch.address = trimmed;
    }
    if (args.projectStartDate !== undefined) {
      patch.projectStartDate = assertIsoDate(
        "Project start",
        args.projectStartDate
      );
    }
    if (args.todayDate !== undefined) {
      patch.todayDate = assertIsoDate("Today", args.todayDate);
    }
    if (args.payoffDate !== undefined) {
      patch.payoffDate = assertIsoDate("Payoff", args.payoffDate);
    }
    if (args.daysToPayoff !== undefined) {
      const todayDate = patch.todayDate ?? build.todayDate;
      const boundedDays = Math.max(0, Math.round(args.daysToPayoff));
      patch.payoffDate = addDaysToIsoDate(todayDate, boundedDays);
    }

    const detailOverrides = { ...(build.detailOverrides ?? {}) };
    let detailOverridesTouched = false;
    if (args.percentComplete !== undefined) {
      detailOverrides.percentComplete = Math.min(
        100,
        Math.max(0, Math.round(args.percentComplete))
      );
      detailOverridesTouched = true;
    }
    if (args.openWarnings !== undefined) {
      detailOverrides.openWarnings = Math.max(0, Math.round(args.openWarnings));
      detailOverridesTouched = true;
    }
    if (args.siteVisitsOpen !== undefined) {
      detailOverrides.siteVisitsOpen = Math.max(
        0,
        Math.round(args.siteVisitsOpen)
      );
      detailOverridesTouched = true;
    }
    if (detailOverridesTouched) {
      patch.detailOverrides = detailOverrides;
    }

    await ctx.db.patch(args.buildId, patch);
    const updated = await ctx.db.get(args.buildId);
    if (!updated) {
      throw new Error(`Build ${args.buildId} not found after update`);
    }

    const refreshedMilestones = await ctx.db
      .query("demo_milestones")
      .withIndex("by_build_order", (q) => q.eq("buildId", args.buildId))
      .collect();
    const refreshedVisits = (
      await ctx.db
        .query("demo_siteVisits")
        .withIndex("by_scenario", (q) => q.eq("scenario", updated.scenario))
        .collect()
    ).filter((visit) => visit.buildId === args.buildId);

    const calculatedPercentComplete = Math.round(
      centsSum(
        refreshedMilestones,
        (m) => m.progressPercent * Math.max(1, m.approvedValueCents)
      ) /
        Math.max(
          1,
          centsSum(refreshedMilestones, (m) =>
            Math.max(1, m.approvedValueCents)
          )
        )
    );
    const calculatedOpenWarnings = refreshedMilestones.filter(
      (m) =>
        m.status === "review" ||
        m.evidenceReviewStatus === "submitted" ||
        m.evidenceReviewStatus === "rejected"
    ).length;
    const calculatedSiteVisitsOpen = refreshedVisits.filter(
      (visit) => visit.status === "unopened" || visit.status === "in_progress"
    ).length;

    return {
      address: demoBuildAddress(updated),
      projectStartDate: updated.projectStartDate,
      payoffDate: updated.payoffDate,
      todayDate: updated.todayDate,
      daysToPayoff: daysBetween(updated.todayDate, updated.payoffDate),
      percentComplete:
        updated.detailOverrides?.percentComplete ?? calculatedPercentComplete,
      openWarnings:
        updated.detailOverrides?.openWarnings ?? calculatedOpenWarnings,
      siteVisitsOpen:
        updated.detailOverrides?.siteVisitsOpen ?? calculatedSiteVisitsOpen,
    };
  })
  .public();
