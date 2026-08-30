import { v } from "convex/values";
import { publicQuery, withQueryTiming } from "../fluent";

// -----------------------------------------------------------------------------
// Helper for buildId resolution by route key (e.g. "active-maple-ridge")
// -----------------------------------------------------------------------------

// Simpler implementation: re-export buildId resolver and let frontend call the
// main query directly.
export const demo_resolveBuildIdByKey = publicQuery
  .use(withQueryTiming("demo_drawflow_backoffice.resolveBuildIdByKey"))
  .input({ buildKey: v.string() })
  .returns(v.union(v.id("demo_builds"), v.null()))
  .handler(async (ctx, { buildKey }) => {
    const build = await ctx.db
      .query("demo_builds")
      .withIndex("by_key", (q) => q.eq("key", buildKey))
      .first();
    return build?._id ?? null;
  })
  .public();
// -----------------------------------------------------------------------------
// Mutations
// -----------------------------------------------------------------------------
