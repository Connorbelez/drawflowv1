/**
 * Production proposals roster queries bounded-context implementation.
 * The parent facade re-exports its handlers to preserve production_proposals function references.
 */
import { paginationOptsValidator, paginationResultValidator } from "convex/server";
import { type Infer, v } from "convex/values";
import { internal } from "../_generated/api";
import { authenticatedQuery } from "../authz";
import { internalQuery, withQueryTiming } from "../fluent";
import { type Id } from "../types";
import { hasProjectedWorkosPermission as hasPermission } from "../workos_permission_access";
import { resolveBrokerageScope } from "./authorization_core.js";
import { isBackoffice } from "./proposal_claim.js";
import { buildRosterPhaseValidator, backofficeBuildRosterSortValidator, backofficeBuildRosterSortDirectionValidator, backofficeBuildRosterRowValidator, type BackofficeBuildRosterRowWithStorage, type BackofficeBuildRosterAuth, BACKOFFICE_BUILD_ROSTER_PAGE_SIZE, BACKOFFICE_BUILD_ROSTER_SUMMARY_BATCH_SIZE, BACKOFFICE_BUILD_ROSTER_SUMMARY_CHILD_BATCH_SIZE, paginateBackofficeBuilds } from "./roster_contracts.js";
import {
  backofficeBuildRosterSearchText,
  productionDaysActive,
  productionMilestoneIsBehindSchedule,
  productionMilestoneNeedsBackofficeReview,
  productionSubmilestoneIsBehindSchedule,
  projectBackofficeBuildRosterRow,
} from "./roster_projection_helpers.js";
import { createStorageUrlResolver } from "./storage_helpers.js";

export const listBackofficeBuildRosterPage = authenticatedQuery
  .use(withQueryTiming("production_proposals.listBackofficeBuildRosterPage"))
  .input({
    paginationOpts: paginationOptsValidator,
    phase: v.optional(buildRosterPhaseValidator),
    search: v.optional(v.string()),
    sortBy: v.optional(backofficeBuildRosterSortValidator),
    sortDirection: v.optional(backofficeBuildRosterSortDirectionValidator),
    workosOrganizationId: v.string(),
  })
  .returns(paginationResultValidator(backofficeBuildRosterRowValidator))
  .handler(async (ctx, args) => {
    const scope = await resolveBrokerageScope(ctx, args.workosOrganizationId);
    if (!isBackoffice(scope.roles)) {
      throw new Error("Forbidden: backoffice");
    }
    if (!scope.brokerage) {
      throw new Error("Forbidden: brokerage");
    }

    const auth: BackofficeBuildRosterAuth = {
      brokerage: scope.brokerage,
      roles: scope.roles,
      subject: scope.subject,
    };
    const staffCanRead =
      auth.roles.includes("broker-staff") &&
      (await hasPermission(
        ctx,
        auth.brokerage.workosOrganizationId,
        auth.roles,
        "proposals:read",
      ));
    const requestedPageSize = Math.min(
      Math.max(args.paginationOpts.numItems, 1),
      BACKOFFICE_BUILD_ROSTER_PAGE_SIZE,
    );
    const normalizedSearch = args.search?.trim().toLowerCase() ?? "";
    const sortBy = args.sortBy ?? "updatedAt";
    const sortDirection = args.sortDirection ?? "desc";
    // Apply phase/search filtering after one bounded native page. The native
    // page size stays equal to the public page size so every source row before
    // the continuation cursor is considered exactly once; matching rows are
    // therefore never skipped when the client requests the next page.
    const sourcePage = await paginateBackofficeBuilds(ctx, {
      brokerageId: auth.brokerage._id,
      paginationOpts: {
        ...args.paginationOpts,
        numItems: requestedPageSize,
      },
      sortBy,
      sortDirection,
    });
    const projected = await Promise.all(
      sourcePage.page
        .filter((build) => build.organizationId === args.workosOrganizationId)
        .map((build) =>
          projectBackofficeBuildRosterRow(ctx, {
            auth,
            build,
            staffCanRead,
          }),
        ),
    );
    const rows = projected.filter(
      (row): row is BackofficeBuildRosterRowWithStorage =>
        row !== null &&
        (!args.phase || row.phase === args.phase) &&
        (!normalizedSearch ||
          backofficeBuildRosterSearchText(row).includes(normalizedSearch)),
    );

    const resolveStorageUrl = createStorageUrlResolver(ctx, rows.length);
    const page = await Promise.all(
      rows.map(async ({ imageStorageId, ...row }) => ({
        ...row,
        imageUrl: await resolveStorageUrl(imageStorageId),
      })),
    );

    return {
      continueCursor: sourcePage.continueCursor,
      isDone: sourcePage.isDone,
      page,
    };
  })
  .public();

const backofficeBuildRosterSummaryBuildValidator = v.object({
  buildId: v.id("activeBuilds"),
  buildStatus: v.union(v.literal("active"), v.literal("future_start")),
  startDate: v.string(),
});

const backofficeBuildRosterSummaryLoanValidator = v.object({
  buildId: v.id("activeBuilds"),
  status: v.union(v.literal("active"), v.literal("closed")),
});

const backofficeBuildRosterSummaryMilestoneValidator = v.object({
  behindMilestoneKeys: v.array(v.string()),
  buildId: v.id("activeBuilds"),
  milestonesComplete: v.number(),
  milestonesInReview: v.number(),
  milestonesTotal: v.number(),
});

const backofficeBuildRosterSummarySubmilestoneValidator = v.object({
  buildId: v.id("activeBuilds"),
  milestoneKey: v.string(),
});

const backofficeBuildRosterScheduleInputValidator = v.object({
  buildId: v.id("activeBuilds"),
  startDate: v.string(),
});

const backofficeBuildRosterSummaryDrawRequestValidator = v.object({
  buildId: v.id("activeBuilds"),
  drawRequestsPending: v.number(),
});

export const backofficeBuildRosterSummarySiteVisitValidator = v.object({
  buildId: v.id("activeBuilds"),
  expiredSiteVisits: v.number(),
});

export type BackofficeBuildRosterSummaryBuild = Infer<
  typeof backofficeBuildRosterSummaryBuildValidator
>;

export type BackofficeBuildRosterSummaryLoan = Infer<
  typeof backofficeBuildRosterSummaryLoanValidator
>;

export type BackofficeBuildRosterSummaryMilestone = Infer<
  typeof backofficeBuildRosterSummaryMilestoneValidator
>;

export type BackofficeBuildRosterSummaryDrawRequest = Infer<
  typeof backofficeBuildRosterSummaryDrawRequestValidator
>;

export type BackofficeBuildRosterSummarySiteVisit = Infer<
  typeof backofficeBuildRosterSummarySiteVisitValidator
>;

export type BackofficeBuildRosterSummaryPage<T> = {
  continueCursor: string;
  isDone: boolean;
  page: T[];
};

export const listBackofficeBuildRosterSummaryBuildsPage = internalQuery
  .input({
    brokerageId: v.id("brokerages"),
    organizationId: v.string(),
    paginationOpts: paginationOptsValidator,
  })
  .returns(paginationResultValidator(backofficeBuildRosterSummaryBuildValidator))
  .handler(async (ctx, args) => {
    const page = await paginateBackofficeBuilds(ctx, {
      brokerageId: args.brokerageId,
      paginationOpts: args.paginationOpts,
      sortBy: "updatedAt",
      sortDirection: "desc",
    });
    const builds: BackofficeBuildRosterSummaryBuild[] = [];
    for (const build of page.page) {
      if (build.organizationId !== args.organizationId) {
        continue;
      }
      const proposal = await ctx.db.get(build.proposalId);
      if (!proposal || proposal.organizationId !== args.organizationId) {
        continue;
      }
      builds.push({
        buildId: build._id,
        buildStatus: build.status,
        startDate: build.startDate,
      });
    }
    return {
      continueCursor: page.continueCursor,
      isDone: page.isDone,
      page: builds,
    };
  })
  .internal();

export const listBackofficeBuildRosterSummaryBuilds = internalQuery
  .input({
    brokerageId: v.id("brokerages"),
    organizationId: v.string(),
  })
  .returns(v.array(backofficeBuildRosterSummaryBuildValidator))
  .handler(async (ctx, args) => {
    const builds: BackofficeBuildRosterSummaryBuild[] = [];
    let cursor: string | null = null;
    let isDone = false;

    while (!isDone) {
      const page: BackofficeBuildRosterSummaryPage<BackofficeBuildRosterSummaryBuild> = await ctx.runQuery(
        internal.production_proposals.listBackofficeBuildRosterSummaryBuildsPage,
        {
          brokerageId: args.brokerageId,
          organizationId: args.organizationId,
          paginationOpts: {
            cursor,
            numItems: BACKOFFICE_BUILD_ROSTER_SUMMARY_BATCH_SIZE,
          },
        },
      );
      builds.push(...page.page);
      cursor = page.continueCursor;
      isDone = page.isDone;
    }

    return builds;
  })
  .internal();

export const listBackofficeBuildRosterSummaryLoansPage = internalQuery
  .input({
    brokerageId: v.id("brokerages"),
    buildIds: v.array(v.id("activeBuilds")),
    organizationId: v.string(),
    paginationOpts: paginationOptsValidator,
  })
  .returns(paginationResultValidator(backofficeBuildRosterSummaryLoanValidator))
  .handler(async (ctx, args) => {
    const buildIds = new Set(args.buildIds);
    const page = await ctx.db
      .query("loanFacilities")
      .withIndex("by_brokerage", (q) => q.eq("brokerageId", args.brokerageId))
      .paginate(args.paginationOpts);
    const loans: BackofficeBuildRosterSummaryLoan[] = [];
    for (const loan of page.page) {
      if (
        loan.organizationId !== args.organizationId ||
        !buildIds.has(loan.buildId)
      ) {
        continue;
      }
      loans.push({
        buildId: loan.buildId,
        status: loan.status,
      });
    }
    return {
      continueCursor: page.continueCursor,
      isDone: page.isDone,
      page: loans,
    };
  })
  .internal();

export const listBackofficeBuildRosterSummaryLoans = internalQuery
  .input({
    brokerageId: v.id("brokerages"),
    buildIds: v.array(v.id("activeBuilds")),
    organizationId: v.string(),
  })
  .returns(v.array(backofficeBuildRosterSummaryLoanValidator))
  .handler(async (ctx, args) => {
    const loansByBuild = new Map<
      Id<"activeBuilds">,
      BackofficeBuildRosterSummaryLoan
    >();
    let cursor: string | null = null;
    let isDone = false;

    while (!isDone) {
      const page: BackofficeBuildRosterSummaryPage<BackofficeBuildRosterSummaryLoan> =
        await ctx.runQuery(
          internal.production_proposals.listBackofficeBuildRosterSummaryLoansPage,
          {
            brokerageId: args.brokerageId,
            buildIds: args.buildIds,
            organizationId: args.organizationId,
            paginationOpts: {
              cursor,
              numItems: BACKOFFICE_BUILD_ROSTER_SUMMARY_CHILD_BATCH_SIZE,
            },
          },
        );
      for (const loan of page.page) {
        loansByBuild.set(loan.buildId, {
          buildId: loan.buildId,
          status: loan.status,
        });
      }
      cursor = page.continueCursor;
      isDone = page.isDone;
    }

    return [...loansByBuild.values()];
  })
  .internal();

export const listBackofficeBuildRosterSummaryMilestonesPage = internalQuery
  .input({
    brokerageId: v.id("brokerages"),
    buildSchedules: v.array(backofficeBuildRosterScheduleInputValidator),
    buildIds: v.array(v.id("activeBuilds")),
    organizationId: v.string(),
    paginationOpts: paginationOptsValidator,
  })
  .returns(
    paginationResultValidator(backofficeBuildRosterSummaryMilestoneValidator),
  )
  .handler(async (ctx, args) => {
    const buildIds = new Set(args.buildIds);
    const startDateByBuild = new Map(
      args.buildSchedules.map((schedule) => [
        schedule.buildId,
        schedule.startDate,
      ]),
    );
    const page = await ctx.db
      .query("buildMilestones")
      .withIndex("by_brokerage", (q) => q.eq("brokerageId", args.brokerageId))
      .paginate(args.paginationOpts);
    const milestonesByBuild = new Map<
      Id<"activeBuilds">,
      BackofficeBuildRosterSummaryMilestone
    >();
    for (const milestone of page.page) {
      if (
        milestone.organizationId !== args.organizationId ||
        !buildIds.has(milestone.buildId)
      ) {
        continue;
      }
      const state = milestonesByBuild.get(milestone.buildId) ?? {
        behindMilestoneKeys: [],
        buildId: milestone.buildId,
        milestonesComplete: 0,
        milestonesInReview: 0,
        milestonesTotal: 0,
      };
      state.milestonesTotal += 1;
      if (milestone.status === "complete") {
        state.milestonesComplete += 1;
      }
      if (productionMilestoneNeedsBackofficeReview(milestone)) {
        state.milestonesInReview += 1;
      }
      const startDate = startDateByBuild.get(milestone.buildId);
      if (
        startDate &&
        productionMilestoneIsBehindSchedule(
          milestone,
          productionDaysActive(startDate),
        )
      ) {
        state.behindMilestoneKeys.push(milestone.key);
      }
      milestonesByBuild.set(milestone.buildId, state);
    }
    return {
      continueCursor: page.continueCursor,
      isDone: page.isDone,
      page: [...milestonesByBuild.values()],
    };
  })
  .internal();

export const listBackofficeBuildRosterSummaryMilestones = internalQuery
  .input({
    brokerageId: v.id("brokerages"),
    buildSchedules: v.array(backofficeBuildRosterScheduleInputValidator),
    buildIds: v.array(v.id("activeBuilds")),
    organizationId: v.string(),
  })
  .returns(v.array(backofficeBuildRosterSummaryMilestoneValidator))
  .handler(async (ctx, args) => {
    const milestonesByBuild = new Map<
      Id<"activeBuilds">,
      BackofficeBuildRosterSummaryMilestone
    >();
    let cursor: string | null = null;
    let isDone = false;

    while (!isDone) {
      const page: BackofficeBuildRosterSummaryPage<BackofficeBuildRosterSummaryMilestone> =
        await ctx.runQuery(
          internal.production_proposals
            .listBackofficeBuildRosterSummaryMilestonesPage,
          {
            brokerageId: args.brokerageId,
            buildSchedules: args.buildSchedules,
            buildIds: args.buildIds,
            organizationId: args.organizationId,
            paginationOpts: {
              cursor,
              numItems: BACKOFFICE_BUILD_ROSTER_SUMMARY_CHILD_BATCH_SIZE,
            },
          },
        );
      for (const milestone of page.page) {
        const state = milestonesByBuild.get(milestone.buildId) ?? {
          behindMilestoneKeys: [],
          buildId: milestone.buildId,
          milestonesComplete: 0,
          milestonesInReview: 0,
          milestonesTotal: 0,
        };
        state.behindMilestoneKeys.push(...milestone.behindMilestoneKeys);
        state.milestonesComplete += milestone.milestonesComplete;
        state.milestonesInReview += milestone.milestonesInReview;
        state.milestonesTotal += milestone.milestonesTotal;
        milestonesByBuild.set(milestone.buildId, state);
      }
      cursor = page.continueCursor;
      isDone = page.isDone;
    }

    const childRisks: BackofficeBuildRosterSummarySubmilestone[] =
      await ctx.runQuery(
        internal.production_proposals
          .listBackofficeBuildRosterSummarySubmilestones,
        {
          brokerageId: args.brokerageId,
          buildSchedules: args.buildSchedules,
          buildIds: args.buildIds,
          organizationId: args.organizationId,
        },
      );
    for (const risk of childRisks) {
      const state = milestonesByBuild.get(risk.buildId);
      if (state) {
        state.behindMilestoneKeys.push(risk.milestoneKey);
      }
    }

    for (const state of milestonesByBuild.values()) {
      state.behindMilestoneKeys = [...new Set(state.behindMilestoneKeys)];
    }

    return [...milestonesByBuild.values()];
  })
  .internal();

export type BackofficeBuildRosterSummarySubmilestone = Infer<
  typeof backofficeBuildRosterSummarySubmilestoneValidator
>;

export const listBackofficeBuildRosterSummarySubmilestonesPage = internalQuery
  .input({
    brokerageId: v.id("brokerages"),
    buildSchedules: v.array(backofficeBuildRosterScheduleInputValidator),
    buildIds: v.array(v.id("activeBuilds")),
    organizationId: v.string(),
    paginationOpts: paginationOptsValidator,
  })
  .returns(
    paginationResultValidator(
      backofficeBuildRosterSummarySubmilestoneValidator,
    ),
  )
  .handler(async (ctx, args) => {
    const buildIds = new Set(args.buildIds);
    const startDateByBuild = new Map(
      args.buildSchedules.map((schedule) => [
        schedule.buildId,
        schedule.startDate,
      ]),
    );
    const page = await ctx.db
      .query("buildSubmilestones")
      .paginate(args.paginationOpts);
    const risks: BackofficeBuildRosterSummarySubmilestone[] = [];
    for (const submilestone of page.page) {
      if (
        submilestone.organizationId !== args.organizationId ||
        submilestone.brokerageId !== args.brokerageId ||
        !buildIds.has(submilestone.buildId)
      ) {
        continue;
      }
      const [milestone, startDate] = [
        await ctx.db.get(submilestone.buildMilestoneId),
        startDateByBuild.get(submilestone.buildId),
      ];
      if (
        milestone &&
        milestone.buildId === submilestone.buildId &&
        startDate &&
        productionSubmilestoneIsBehindSchedule(
          submilestone,
          milestone,
          productionDaysActive(startDate),
        )
      ) {
        risks.push({
          buildId: submilestone.buildId,
          milestoneKey: submilestone.milestoneKey,
        });
      }
    }
    return {
      continueCursor: page.continueCursor,
      isDone: page.isDone,
      page: risks,
    };
  })
  .internal();

export const listBackofficeBuildRosterSummarySubmilestones = internalQuery
  .input({
    brokerageId: v.id("brokerages"),
    buildSchedules: v.array(backofficeBuildRosterScheduleInputValidator),
    buildIds: v.array(v.id("activeBuilds")),
    organizationId: v.string(),
  })
  .returns(v.array(backofficeBuildRosterSummarySubmilestoneValidator))
  .handler(async (ctx, args) => {
    const risks = new Map<string, BackofficeBuildRosterSummarySubmilestone>();
    let cursor: string | null = null;
    let isDone = false;
    while (!isDone) {
      const page: BackofficeBuildRosterSummaryPage<BackofficeBuildRosterSummarySubmilestone> =
        await ctx.runQuery(
          internal.production_proposals
            .listBackofficeBuildRosterSummarySubmilestonesPage,
          {
            ...args,
            paginationOpts: {
              cursor,
              numItems: BACKOFFICE_BUILD_ROSTER_SUMMARY_CHILD_BATCH_SIZE,
            },
          },
        );
      for (const risk of page.page) {
        risks.set(`${risk.buildId}:${risk.milestoneKey}`, risk);
      }
      cursor = page.continueCursor;
      isDone = page.isDone;
    }
    return [...risks.values()];
  })
  .internal();

export const listBackofficeBuildRosterSummaryDrawRequestsPage = internalQuery
  .input({
    brokerageId: v.id("brokerages"),
    buildIds: v.array(v.id("activeBuilds")),
    organizationId: v.string(),
    paginationOpts: paginationOptsValidator,
  })
  .returns(
    paginationResultValidator(backofficeBuildRosterSummaryDrawRequestValidator),
  )
  .handler(async (ctx, args) => {
    const buildIds = new Set(args.buildIds);
    const page = await ctx.db
      .query("activeBuildDrawRequests")
      .withIndex("by_brokerage", (q) => q.eq("brokerageId", args.brokerageId))
      .paginate(args.paginationOpts);
    const pendingByBuild = new Map<Id<"activeBuilds">, number>();
    for (const drawRequest of page.page) {
      if (
        drawRequest.organizationId !== args.organizationId ||
        drawRequest.status !== "requested" ||
        !buildIds.has(drawRequest.buildId)
      ) {
        continue;
      }
      pendingByBuild.set(
        drawRequest.buildId,
        (pendingByBuild.get(drawRequest.buildId) ?? 0) + 1,
      );
    }
    return {
      continueCursor: page.continueCursor,
      isDone: page.isDone,
      page: [...pendingByBuild].map(([buildId, drawRequestsPending]) => ({
        buildId,
        drawRequestsPending,
      })),
    };
  })
  .internal();

export const listBackofficeBuildRosterSummaryDrawRequests = internalQuery
  .input({
    brokerageId: v.id("brokerages"),
    buildIds: v.array(v.id("activeBuilds")),
    organizationId: v.string(),
  })
  .returns(v.array(backofficeBuildRosterSummaryDrawRequestValidator))
  .handler(async (ctx, args) => {
    const pendingByBuild = new Map<Id<"activeBuilds">, number>();
    let cursor: string | null = null;
    let isDone = false;

    while (!isDone) {
      const page: BackofficeBuildRosterSummaryPage<BackofficeBuildRosterSummaryDrawRequest> =
        await ctx.runQuery(
          internal.production_proposals
            .listBackofficeBuildRosterSummaryDrawRequestsPage,
          {
            brokerageId: args.brokerageId,
            buildIds: args.buildIds,
            organizationId: args.organizationId,
            paginationOpts: {
              cursor,
              numItems: BACKOFFICE_BUILD_ROSTER_SUMMARY_CHILD_BATCH_SIZE,
            },
          },
        );
      for (const drawRequest of page.page) {
        pendingByBuild.set(
          drawRequest.buildId,
          (pendingByBuild.get(drawRequest.buildId) ?? 0) + 1,
        );
      }
      cursor = page.continueCursor;
      isDone = page.isDone;
    }

    return [...pendingByBuild].map(([buildId, drawRequestsPending]) => ({
      buildId,
      drawRequestsPending,
    }));
  })
  .internal();
