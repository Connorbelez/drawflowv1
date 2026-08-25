import { v } from "convex/values";
import { publicQuery, withQueryTiming } from "../fluent";
import { buildBackofficeDashboardProjection } from "./dashboard";
import { buildProjection } from "./projection";

export const demo_getBackofficeDashboard = publicQuery
  .use(withQueryTiming("demo_drawflow.getBackofficeDashboard"))
  .input({})
  .returns(v.any())
  .handler(async (ctx) => await buildBackofficeDashboardProjection(ctx))
  .public();
export const demo_getActiveWorkspace = publicQuery
  .use(withQueryTiming("demo_drawflow.getActiveWorkspace"))
  .returns(v.any())
  .handler(async (ctx) => await buildProjection(ctx, "active"))
  .public();

export const demo_getProposalWorkspace = publicQuery
  .use(withQueryTiming("demo_drawflow.getProposalWorkspace"))
  .returns(v.any())
  .handler(async (ctx) => await buildProjection(ctx, "proposal"))
  .public();

export const demo_getWorkspace = publicQuery
  .use(withQueryTiming("demo_drawflow.getWorkspace"))
  .input({ scenario: v.union(v.literal("active"), v.literal("proposal")) })
  .returns(v.any())
  .handler(async (ctx, args) => await buildProjection(ctx, args.scenario))
  .public();

export const demo_getAuditEvents = publicQuery
  .use(withQueryTiming("demo_drawflow.getAuditEvents"))
  .input({
    drawGroupKey: v.optional(v.string()),
    milestoneKey: v.optional(v.string()),
    scenario: v.union(v.literal("active"), v.literal("proposal")),
  })
  .returns(v.any())
  .handler(async (ctx, args) => {
    const events = await ctx.db
      .query("demo_auditEvents")
      .withIndex("by_scenario", (q) => q.eq("scenario", args.scenario))
      .collect();
    return events
      .filter((event) =>
        args.milestoneKey ? event.milestoneKey === args.milestoneKey : true
      )
      .filter((event) =>
        args.drawGroupKey ? event.drawGroupKey === args.drawGroupKey : true
      )
      .sort((a, b) => b.createdAt - a.createdAt);
  })
  .public();
export const demo_getEventOutbox = publicQuery
  .use(withQueryTiming("demo_drawflow.getEventOutbox"))
  .input({ scenario: v.union(v.literal("active"), v.literal("proposal")) })
  .returns(v.any())
  .handler(async (ctx, args) => {
    const events = await ctx.db
      .query("demo_eventOutbox")
      .withIndex("by_scenario", (q) => q.eq("scenario", args.scenario))
      .collect();
    return events.sort((a, b) => b.createdAt - a.createdAt);
  })
  .public();
