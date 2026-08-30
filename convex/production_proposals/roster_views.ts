/**
 * Production proposals roster views bounded-context implementation.
 * The parent facade re-exports its handlers to preserve production_proposals function references.
 */
import { paginationOptsValidator, paginationResultValidator } from "convex/server";
import { v } from "convex/values";
import { internal } from "../_generated/api";
import { authenticatedQuery } from "../authz";
import { internalQuery, withQueryTiming } from "../fluent";
import { type Doc, type Id } from "../types";
import { hasProjectedWorkosPermission as hasPermission } from "../workos_permission_access";
import { resolveBrokerageScope } from "./authorization_core.js";
import { canReadBackofficeProposal } from "./contractor_policy_helpers.js";
import { productionBuildDisplayId } from "./directory_cards.js";
import { isBackoffice } from "./proposal_claim.js";
import { buildRosterPhaseValidator, backofficeBuildRosterSummaryValidator, type BackofficeBuildRosterAuth, BACKOFFICE_BUILD_ROSTER_SUMMARY_CHILD_BATCH_SIZE } from "./roster_contracts.js";
import { productionSiteVisitOperationalStatus, productionDaysActive, productionBuildStatusLabel, productionBuildRosterPhase, productionMilestoneNeedsBackofficeReview, productionMilestoneIsBehindSchedule } from "./roster_projection_helpers.js";
import { backofficeBuildRosterSummarySiteVisitValidator, type BackofficeBuildRosterSummaryBuild, type BackofficeBuildRosterSummaryLoan, type BackofficeBuildRosterSummaryMilestone, type BackofficeBuildRosterSummaryDrawRequest, type BackofficeBuildRosterSummarySiteVisit, type BackofficeBuildRosterSummaryPage } from "./roster_queries.js";

export const listBackofficeBuildRosterSummarySiteVisitsPage = internalQuery
  .input({
    asOf: v.number(),
    brokerageId: v.id("brokerages"),
    buildIds: v.array(v.id("activeBuilds")),
    organizationId: v.string(),
    paginationOpts: paginationOptsValidator,
  })
  .returns(
    paginationResultValidator(backofficeBuildRosterSummarySiteVisitValidator),
  )
  .handler(async (ctx, args) => {
    const buildIds = new Set(args.buildIds);
    const page = await ctx.db
      .query("buildSiteVisits")
      .withIndex("by_brokerage", (q) => q.eq("brokerageId", args.brokerageId))
      .paginate(args.paginationOpts);
    const expiredByBuild = new Map<Id<"activeBuilds">, number>();
    for (const visit of page.page) {
      if (
        visit.organizationId !== args.organizationId ||
        !buildIds.has(visit.buildId) ||
        productionSiteVisitOperationalStatus(visit, args.asOf) !== "expired"
      ) {
        continue;
      }
      expiredByBuild.set(
        visit.buildId,
        (expiredByBuild.get(visit.buildId) ?? 0) + 1,
      );
    }
    return {
      continueCursor: page.continueCursor,
      isDone: page.isDone,
      page: [...expiredByBuild].map(([buildId, expiredSiteVisits]) => ({
        buildId,
        expiredSiteVisits,
      })),
    };
  })
  .internal();

export const listBackofficeBuildRosterSummarySiteVisits = internalQuery
  .input({
    brokerageId: v.id("brokerages"),
    buildIds: v.array(v.id("activeBuilds")),
    organizationId: v.string(),
  })
  .returns(v.array(backofficeBuildRosterSummarySiteVisitValidator))
  .handler(async (ctx, args) => {
    const expiredByBuild = new Map<Id<"activeBuilds">, number>();
    const now = Date.now();
    let cursor: string | null = null;
    let isDone = false;

    while (!isDone) {
      const page: BackofficeBuildRosterSummaryPage<BackofficeBuildRosterSummarySiteVisit> =
        await ctx.runQuery(
          internal.production_proposals
            .listBackofficeBuildRosterSummarySiteVisitsPage,
          {
            asOf: now,
            brokerageId: args.brokerageId,
            buildIds: args.buildIds,
            organizationId: args.organizationId,
            paginationOpts: {
              cursor,
              numItems: BACKOFFICE_BUILD_ROSTER_SUMMARY_CHILD_BATCH_SIZE,
            },
          },
        );
      for (const visit of page.page) {
        expiredByBuild.set(
          visit.buildId,
          (expiredByBuild.get(visit.buildId) ?? 0) + 1,
        );
      }
      cursor = page.continueCursor;
      isDone = page.isDone;
    }

    return [...expiredByBuild].map(([buildId, expiredSiteVisits]) => ({
      buildId,
      expiredSiteVisits,
    }));
  })
  .internal();

export const getBackofficeBuildRosterSummary = authenticatedQuery
  .use(withQueryTiming("production_proposals.getBackofficeBuildRosterSummary"))
  .input({ workosOrganizationId: v.string() })
  .returns(backofficeBuildRosterSummaryValidator)
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
    const summary = {
      active: 0,
      attention: 0,
      completed: 0,
      scheduled: 0,
      total: 0,
    };

    const canReadEveryBackofficeBuild =
      staffCanRead ||
      auth.roles.some(
        (role) =>
          role === "admin" ||
          role === "principle-broker" ||
          role === "broker",
      );
    if (!canReadEveryBackofficeBuild) {
      return summary;
    }

    const buildStates: BackofficeBuildRosterSummaryBuild[] = await ctx.runQuery(
      internal.production_proposals.listBackofficeBuildRosterSummaryBuilds,
      {
        brokerageId: auth.brokerage._id,
        organizationId: args.workosOrganizationId,
      },
    );
    if (buildStates.length === 0) {
      return summary;
    }

    const buildIds = buildStates.map((state) => state.buildId);
    const [
      loanStates,
      milestoneStates,
      drawRequestStates,
      siteVisitStates,
    ]: [
      BackofficeBuildRosterSummaryLoan[],
      BackofficeBuildRosterSummaryMilestone[],
      BackofficeBuildRosterSummaryDrawRequest[],
      BackofficeBuildRosterSummarySiteVisit[],
    ] = await Promise.all([
      ctx.runQuery(
        internal.production_proposals.listBackofficeBuildRosterSummaryLoans,
        {
          brokerageId: auth.brokerage._id,
          buildIds,
          organizationId: args.workosOrganizationId,
        },
      ),
      ctx.runQuery(
        internal.production_proposals
          .listBackofficeBuildRosterSummaryMilestones,
        {
          brokerageId: auth.brokerage._id,
          buildSchedules: buildStates.map(({ buildId, startDate }) => ({
            buildId,
            startDate,
          })),
          buildIds,
          organizationId: args.workosOrganizationId,
        },
      ),
      ctx.runQuery(
        internal.production_proposals
          .listBackofficeBuildRosterSummaryDrawRequests,
        {
          brokerageId: auth.brokerage._id,
          buildIds,
          organizationId: args.workosOrganizationId,
        },
      ),
      ctx.runQuery(
        internal.production_proposals
          .listBackofficeBuildRosterSummarySiteVisits,
        {
          brokerageId: auth.brokerage._id,
          buildIds,
          organizationId: args.workosOrganizationId,
        },
      ),
    ]);

    const loanByBuild = new Map(
      loanStates.map((state) => [state.buildId, state.status]),
    );
    const milestonesByBuild = new Map(
      milestoneStates.map((state) => [state.buildId, state]),
    );
    const drawRequestsByBuild = new Map(
      drawRequestStates.map((state) => [state.buildId, state.drawRequestsPending]),
    );
    const siteVisitsByBuild = new Map(
      siteVisitStates.map((state) => [state.buildId, state.expiredSiteVisits]),
    );

    for (const { buildId, buildStatus } of buildStates) {
      const milestones = milestonesByBuild.get(buildId);
      const drawRequestsPending = drawRequestsByBuild.get(buildId) ?? 0;
      const expiredSiteVisits = siteVisitsByBuild.get(buildId) ?? 0;
      const loanStatus = loanByBuild.get(buildId);
      const milestonesComplete = milestones?.milestonesComplete ?? 0;
      const milestonesBehindSchedule =
        milestones?.behindMilestoneKeys.length ?? 0;
      const milestonesInReview = milestones?.milestonesInReview ?? 0;
      const milestonesTotal = milestones?.milestonesTotal ?? 0;
      let phase: "scheduled" | "active" | "attention" | "completed";
      if (buildStatus === "future_start") {
        phase = "scheduled";
      } else if (
        loanStatus === "closed" ||
        (milestonesTotal > 0 && milestonesComplete === milestonesTotal)
      ) {
        phase = "completed";
      } else if (
        expiredSiteVisits > 0 ||
        drawRequestsPending > 0 ||
        milestonesBehindSchedule > 0 ||
        milestonesInReview > 0
      ) {
        phase = "attention";
      } else {
        phase = "active";
      }
      summary[phase] += 1;
      summary.total += 1;
    }

    return summary;
  })
  .public();

export const listBackofficeBuildRoster = authenticatedQuery
  .input({ workosOrganizationId: v.string() })
  .returns(
    v.object({
      builds: v.array(
        v.object({
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
          loanStatus: v.optional(
            v.union(v.literal("active"), v.literal("closed")),
          ),
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
        }),
      ),
      summary: v.object({
        active: v.number(),
        attention: v.number(),
        completed: v.number(),
        scheduled: v.number(),
        total: v.number(),
      }),
    }),
  )
  .handler(async (ctx, args) => {
    const scope = await resolveBrokerageScope(ctx, args.workosOrganizationId);
    if (!isBackoffice(scope.roles)) {
      throw new Error("Forbidden: backoffice");
    }
    if (!scope.brokerage) {
      throw new Error("Forbidden: brokerage");
    }
    const auth = {
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
    const now = Date.now();
    const brokerageId = auth.brokerage._id;

    const [buildRows, visitRows] = await Promise.all([
      ctx.db
        .query("activeBuilds")
        .withIndex("by_brokerage", (q) => q.eq("brokerageId", brokerageId))
        .collect(),
      ctx.db
        .query("buildSiteVisits")
        .withIndex("by_brokerage", (q) => q.eq("brokerageId", brokerageId))
        .collect(),
    ]);

    const visitsByBuild = new Map<
      string,
      {
        expired: number;
        open: number;
      }
    >();
    for (const visit of visitRows) {
      if (visit.organizationId !== args.workosOrganizationId) {
        continue;
      }
      const key = String(visit.buildId);
      const bucket = visitsByBuild.get(key) ?? { expired: 0, open: 0 };
      const operationalStatus = productionSiteVisitOperationalStatus(
        visit,
        now,
      );
      if (operationalStatus === "expired") {
        bucket.expired += 1;
      }
      if (operationalStatus === "open" || operationalStatus === "in_field") {
        bucket.open += 1;
      }
      visitsByBuild.set(key, bucket);
    }

    const rosterBuilds: Array<{
      buildId: Id<"activeBuilds">;
      buildName: string;
      buildStatus: Doc<"activeBuilds">["status"];
      buildStatusLabel: string;
      builderName: string;
      closedAt?: number;
      daysActive: number;
      displayId: string;
      drawCount: number;
      drawRequestsPending: number;
      href: string;
      imageUrl: string | null;
      loanStatus?: "active" | "closed";
      location: string;
      locationLatitude?: number;
      locationLongitude?: number;
      milestonesBehindSchedule: number;
      milestonesComplete: number;
      milestonesInReview: number;
      milestonesTotal: number;
      activeMilestoneName: string;
      phase: "scheduled" | "active" | "attention" | "completed";
      proposalStatus: Doc<"buildProposals">["status"];
      siteVisitsExpired: number;
      siteVisitsOpen: number;
      startDate: string;
      totalBudgetCents: number;
      updatedAt: number;
    }> = [];

    for (const build of buildRows) {
      if (build.organizationId !== args.workosOrganizationId) {
        continue;
      }
      const proposal = await ctx.db.get(build.proposalId);
      if (!proposal) {
        continue;
      }
      if (!(canReadBackofficeProposal(auth, proposal) || staffCanRead)) {
        continue;
      }

      const [
        builder,
        milestones,
        submilestones,
        plannedDraws,
        drawRequests,
        loan,
        evidence,
      ] =
        await Promise.all([
          ctx.db.get(build.builderProfileId),
          ctx.db
            .query("buildMilestones")
              .withIndex("by_build_order", (q) => q.eq("buildId", build._id))
              .take(100),
          ctx.db
            .query("buildSubmilestones")
            .withIndex("by_build", (q) => q.eq("buildId", build._id))
            .take(500),
          ctx.db
            .query("plannedDrawScheduleRows")
            .withIndex("by_build_order", (q) => q.eq("buildId", build._id))
            .take(100),
          ctx.db
            .query("activeBuildDrawRequests")
            .withIndex("by_build", (q) => q.eq("buildId", build._id))
            .take(100),
          ctx.db
            .query("loanFacilities")
            .withIndex("by_build", (q) => q.eq("buildId", build._id))
            .unique(),
          ctx.db
            .query("buildEvidenceAssets")
            .withIndex("by_build", (q) => q.eq("buildId", build._id))
            .take(100),
        ]);

      const visitCounts = visitsByBuild.get(String(build._id)) ?? {
        expired: 0,
        open: 0,
      };
      const milestonesComplete = milestones.filter(
        (milestone) => milestone.status === "complete",
      ).length;
      const milestonesInReview = milestones.filter(
        productionMilestoneNeedsBackofficeReview,
      ).length;
      const drawRequestsPending = drawRequests.filter(
        (request) => request.status === "requested",
      ).length;
      const milestonesBehindSchedule = milestones.filter((milestone) =>
        productionMilestoneIsBehindSchedule(
          milestone,
          productionDaysActive(build.startDate),
          submilestones.filter(
            (submilestone) =>
              submilestone.milestoneKey === milestone.key,
          ),
        ),
      ).length;
      const firstImage = evidence.find(
        (asset) => asset.storageId && asset.mimeType.startsWith("image/"),
      );
      const imageUrl = firstImage?.storageId
        ? await ctx.storage.getUrl(firstImage.storageId)
        : null;
      const activeMilestone =
        milestones.find((milestone) => milestone.status !== "complete") ??
        milestones[0];

      const phase = productionBuildRosterPhase({
        build,
        drawRequestsPending,
        expiredSiteVisits: visitCounts.expired,
        loan,
        milestones,
        milestonesBehindSchedule,
        milestonesInReview,
      });

      rosterBuilds.push({
        activeMilestoneName:
          activeMilestone?.name ?? `${milestones.length} milestones`,
        buildId: build._id,
        buildName: build.buildName,
        buildStatus: build.status,
        buildStatusLabel: productionBuildStatusLabel(build.status),
        builderName: builder?.displayName ?? "Builder",
        ...(proposal.closedAt === undefined
          ? {}
          : { closedAt: proposal.closedAt }),
        daysActive: productionDaysActive(build.startDate),
        displayId: productionBuildDisplayId(build),
        drawCount: plannedDraws.length,
        drawRequestsPending,
        href: `/backoffice/builds/${build._id}`,
        imageUrl,
        ...(loan ? { loanStatus: loan.status } : {}),
        location: build.location,
        ...(build.locationLatitude === undefined
          ? {}
          : { locationLatitude: build.locationLatitude }),
        ...(build.locationLongitude === undefined
          ? {}
          : { locationLongitude: build.locationLongitude }),
        milestonesBehindSchedule,
        milestonesComplete,
        milestonesInReview,
        milestonesTotal: milestones.length,
        phase,
        proposalStatus: proposal.status,
        siteVisitsExpired: visitCounts.expired,
        siteVisitsOpen: visitCounts.open,
        startDate: build.startDate,
        totalBudgetCents: build.totalBudgetCents,
        updatedAt: build.updatedAt,
      });
    }

    rosterBuilds.sort((a, b) => b.updatedAt - a.updatedAt);

    const summary = {
      active: rosterBuilds.filter((row) => row.phase === "active").length,
      attention: rosterBuilds.filter((row) => row.phase === "attention").length,
      completed: rosterBuilds.filter((row) => row.phase === "completed").length,
      scheduled: rosterBuilds.filter((row) => row.phase === "scheduled").length,
      total: rosterBuilds.length,
    };

    return { builds: rosterBuilds, summary };
  })
  .public();
