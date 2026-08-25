/**
 * Production proposals roster contracts bounded-context implementation.
 * The parent facade re-exports its handlers to preserve production_proposals function references.
 */
import { type PaginationOptions } from "convex/server";
import { type Infer, v } from "convex/values";
import { type RoleSlug } from "../authz";
import { type Doc, type Id, type QueryCtx } from "../types";

export const buildRosterPhaseValidator = v.union(
  v.literal("scheduled"),
  v.literal("active"),
  v.literal("attention"),
  v.literal("completed"),
);

export const backofficeBuildRosterSortValidator = v.union(
  v.literal("build"),
  v.literal("location"),
  v.literal("budget"),
  v.literal("timeline"),
  v.literal("updatedAt"),
);

export const backofficeBuildRosterSortDirectionValidator = v.union(
  v.literal("asc"),
  v.literal("desc"),
);

export const backofficeBuildRosterRowValidator = v.object({
  buildId: v.id("activeBuilds"),
  buildName: v.string(),
  buildStatus: v.union(v.literal("active"), v.literal("future_start")),
  buildStatusLabel: v.string(),
  builderName: v.string(),
  closedAt: v.optional(v.number()),
  daysActive: v.number(),
  displayId: v.string(),
  drawCount: v.number(),
  drawRequestsPending: v.number(),
  href: v.string(),
  imageUrl: v.union(v.string(), v.null()),
  loanStatus: v.optional(v.union(v.literal("active"), v.literal("closed"))),
  location: v.string(),
  locationLatitude: v.optional(v.number()),
  locationLongitude: v.optional(v.number()),
  milestonesBehindSchedule: v.number(),
  milestonesComplete: v.number(),
  milestonesInReview: v.number(),
  milestonesTotal: v.number(),
  activeMilestoneName: v.string(),
  phase: buildRosterPhaseValidator,
  proposalStatus: v.union(
    v.literal("approved"),
    v.literal("closed"),
    v.literal("draft"),
    v.literal("submitted"),
  ),
  siteVisitsExpired: v.number(),
  siteVisitsOpen: v.number(),
  startDate: v.string(),
  totalBudgetCents: v.number(),
  updatedAt: v.number(),
});

export const backofficeBuildRosterSummaryValidator = v.object({
  active: v.number(),
  attention: v.number(),
  completed: v.number(),
  scheduled: v.number(),
  total: v.number(),
});

type BackofficeBuildRosterRow = Infer<
  typeof backofficeBuildRosterRowValidator
>;

export type BackofficeBuildRosterRowWithStorage = Omit<
  BackofficeBuildRosterRow,
  "imageUrl"
> & {
  imageStorageId: Id<"_storage"> | null;
};

export type BackofficeBuildRosterAuth = {
  brokerage: Doc<"brokerages">;
  roles: RoleSlug[];
  subject: string;
};

export const BACKOFFICE_BUILD_ROSTER_PAGE_SIZE = 15;

export const BACKOFFICE_BUILD_ROSTER_SUMMARY_BATCH_SIZE = 50;

export const BACKOFFICE_BUILD_ROSTER_SUMMARY_CHILD_BATCH_SIZE = 100;

type BackofficeBuildRosterSort = Infer<
  typeof backofficeBuildRosterSortValidator
>;

type BackofficeBuildRosterSortDirection = Infer<
  typeof backofficeBuildRosterSortDirectionValidator
>;

export async function paginateBackofficeBuilds(
  ctx: QueryCtx,
  {
    brokerageId,
    paginationOpts,
    sortBy,
    sortDirection,
  }: {
    brokerageId: Id<"brokerages">;
    paginationOpts: PaginationOptions;
    sortBy: BackofficeBuildRosterSort;
    sortDirection: BackofficeBuildRosterSortDirection;
  },
) {
  switch (sortBy) {
    case "build":
      return await ctx.db
        .query("activeBuilds")
        .withIndex("by_brokerage_and_buildName", (q) =>
          q.eq("brokerageId", brokerageId),
        )
        .order(sortDirection)
        .paginate(paginationOpts);
    case "location":
      return await ctx.db
        .query("activeBuilds")
        .withIndex("by_brokerage_and_location", (q) =>
          q.eq("brokerageId", brokerageId),
        )
        .order(sortDirection)
        .paginate(paginationOpts);
    case "budget":
      return await ctx.db
        .query("activeBuilds")
        .withIndex("by_brokerage_and_totalBudgetCents", (q) =>
          q.eq("brokerageId", brokerageId),
        )
        .order(sortDirection)
        .paginate(paginationOpts);
    case "timeline":
      return await ctx.db
        .query("activeBuilds")
        .withIndex("by_brokerage_and_startDate", (q) =>
          q.eq("brokerageId", brokerageId),
        )
        .order(sortDirection === "asc" ? "desc" : "asc")
        .paginate(paginationOpts);
    case "updatedAt":
      return await ctx.db
        .query("activeBuilds")
        .withIndex("by_brokerage_and_updatedAt", (q) =>
          q.eq("brokerageId", brokerageId),
        )
        .order(sortDirection)
        .paginate(paginationOpts);
  }
}
