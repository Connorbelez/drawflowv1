import { v } from "convex/values";
import { publicQuery, withQueryTiming } from "../fluent";
import { drawflowBackofficeDashboardQuery } from "./core";
export const demo_getBackofficeDashboard = publicQuery
  .use(withQueryTiming("demo_timeline_plans.backofficeDashboard"))
  .input({})
  .returns(v.any())
  .handler(
    async (ctx) => await ctx.runQuery(drawflowBackofficeDashboardQuery, {})
  )
  .public();
