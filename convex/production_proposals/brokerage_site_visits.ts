/**
 * Production proposals brokerage site visits bounded-context implementation.
 * The parent facade re-exports its handlers to preserve production_proposals function references.
 */
import { v } from "convex/values";
import { authenticatedQuery } from "../authz";
import { type Doc, type Id } from "../types";
import { resolveBrokerageScope } from "./authorization_core.js";
import { productionBuildDisplayId } from "./directory_cards.js";
import { isBackoffice } from "./proposal_claim.js";
import { productionSiteVisitOperationalStatus, productionSiteVisitTokenState, productionSiteVisitUrgencyRank, productionSiteVisitScheduledLabel } from "./roster_projection_helpers.js";

export const siteVisitLocationAttemptValidator = v.object({
  accuracyMeters: v.optional(v.number()),
  attempted: v.boolean(),
  attemptedAt: v.optional(v.number()),
  distanceMeters: v.optional(v.number()),
  failureReason: v.optional(v.string()),
  geofenceRadiusMeters: v.optional(v.number()),
  latitude: v.optional(v.number()),
  longitude: v.optional(v.number()),
  permissionOutcome: v.union(
    v.literal("denied"),
    v.literal("granted"),
    v.literal("not_requested"),
    v.literal("unavailable"),
  ),
  verified: v.boolean(),
});

export const siteVisitPrerequisiteExceptionValidator = v.object({
  acknowledged: v.boolean(),
  reason: v.string(),
});

const siteVisitOperationalStatusValidator = v.union(
  v.literal("open"),
  v.literal("in_field"),
  v.literal("expired"),
  v.literal("complete"),
  v.literal("cancelled"),
);

export const listBrokerageSiteVisits = authenticatedQuery
  .input({
    buildId: v.optional(v.id("activeBuilds")),
    milestoneKey: v.optional(v.string()),
    submilestoneId: v.optional(v.id("buildSubmilestones")),
    workosOrganizationId: v.string(),
  })
  .returns(
    v.object({
      builds: v.array(
        v.object({
          activeVisitCount: v.number(),
          buildDisplayId: v.string(),
          buildId: v.id("activeBuilds"),
          buildName: v.string(),
          builderName: v.string(),
          href: v.string(),
          location: v.string(),
          visits: v.array(
            v.object({
              buildDisplayId: v.string(),
              buildHref: v.string(),
              buildId: v.id("activeBuilds"),
              buildName: v.string(),
              builderName: v.string(),
              completedAt: v.optional(v.string()),
              geofenceFlagged: v.boolean(),
              location: v.string(),
              locationAttempt: v.optional(siteVisitLocationAttemptValidator),
              milestoneKey: v.string(),
              milestoneName: v.string(),
              milestoneReviewStatus: v.optional(v.string()),
              missingPrerequisites: v.optional(v.array(v.string())),
              note: v.optional(v.string()),
              operationalStatus: siteVisitOperationalStatusValidator,
              prerequisiteException: v.optional(
                siteVisitPrerequisiteExceptionValidator,
              ),
              recordNote: v.optional(v.string()),
              recordNoteFormat: v.optional(
                v.union(v.literal("plain_text"), v.literal("html")),
              ),
              recommendedOutcome: v.optional(v.string()),
              requestedAt: v.string(),
              requestedDay: v.number(),
              scheduledDateLabel: v.string(),
              tokenExpiresAt: v.number(),
              tokenMsRemaining: v.number(),
              tokenOpenedAt: v.optional(v.number()),
              tokenState: v.union(
                v.literal("not_sent"),
                v.literal("live"),
                v.literal("opened"),
                v.literal("consumed"),
                v.literal("expired"),
              ),
              updatedAt: v.number(),
              url: v.string(),
              visitId: v.string(),
            }),
          ),
        }),
      ),
      summary: v.object({
        cancelled: v.number(),
        complete: v.number(),
        expiringWithin15Min: v.number(),
        expired: v.number(),
        geofenceFlagged: v.number(),
        inField: v.number(),
        open: v.number(),
        total: v.number(),
      }),
      visits: v.array(
        v.object({
          buildDisplayId: v.string(),
          buildHref: v.string(),
          buildId: v.id("activeBuilds"),
          buildName: v.string(),
          builderName: v.string(),
          completedAt: v.optional(v.string()),
          geofenceFlagged: v.boolean(),
          location: v.string(),
          locationAttempt: v.optional(siteVisitLocationAttemptValidator),
          milestoneKey: v.string(),
          milestoneName: v.string(),
          milestoneReviewStatus: v.optional(v.string()),
          missingPrerequisites: v.optional(v.array(v.string())),
          note: v.optional(v.string()),
          operationalStatus: siteVisitOperationalStatusValidator,
          prerequisiteException: v.optional(
            siteVisitPrerequisiteExceptionValidator,
          ),
          recordNote: v.optional(v.string()),
          recordNoteFormat: v.optional(
            v.union(v.literal("plain_text"), v.literal("html")),
          ),
          recommendedOutcome: v.optional(v.string()),
          requestedAt: v.string(),
          requestedDay: v.number(),
          scheduledDateLabel: v.string(),
          tokenExpiresAt: v.number(),
          tokenMsRemaining: v.number(),
          tokenOpenedAt: v.optional(v.number()),
          tokenState: v.union(
            v.literal("not_sent"),
            v.literal("live"),
            v.literal("opened"),
            v.literal("consumed"),
            v.literal("expired"),
          ),
          updatedAt: v.number(),
          url: v.string(),
          visitId: v.string(),
        }),
      ),
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
    const brokerageId = scope.brokerage._id;
    const now = Date.now();
    if ((args.milestoneKey || args.submilestoneId) && !args.buildId) {
      throw new Error("A Build is required when scoping Site Visits.");
    }
    const scopedBuild = args.buildId ? await ctx.db.get(args.buildId) : null;
    if (
      args.buildId &&
      (!scopedBuild ||
        scopedBuild.organizationId !== args.workosOrganizationId ||
        scopedBuild.brokerageId !== brokerageId)
    ) {
      throw new Error("Forbidden: active Build Site Visits");
    }
    const scopedSubmilestone = args.submilestoneId
      ? await ctx.db.get(args.submilestoneId)
      : null;
    if (
      args.submilestoneId &&
      (!scopedSubmilestone ||
        scopedSubmilestone.organizationId !== args.workosOrganizationId ||
        scopedSubmilestone.brokerageId !== brokerageId ||
        scopedSubmilestone.buildId !== args.buildId ||
        (args.milestoneKey &&
          scopedSubmilestone.milestoneKey !== args.milestoneKey))
    ) {
      throw new Error("Forbidden: Sub-milestone Site Visits");
    }
    const resolvedMilestoneKey =
      args.milestoneKey ?? scopedSubmilestone?.milestoneKey;
    const visitRows = args.buildId
      ? resolvedMilestoneKey
        ? await ctx.db
            .query("buildSiteVisits")
            .withIndex("by_build_milestone", (q) =>
              q
                .eq("buildId", args.buildId as Id<"activeBuilds">)
                .eq("milestoneKey", resolvedMilestoneKey),
            )
            .take(500)
        : await ctx.db
            .query("buildSiteVisits")
            .withIndex("by_build", (q) =>
              q.eq("buildId", args.buildId as Id<"activeBuilds">),
            )
            .take(500)
      : await ctx.db
          .query("buildSiteVisits")
          .withIndex("by_brokerage", (q) => q.eq("brokerageId", brokerageId))
          .take(500);
    const scopedVisits = visitRows.filter(
      (visit) =>
        visit.organizationId === args.workosOrganizationId &&
        (!scopedSubmilestone ||
          (visit.submilestoneId
            ? visit.submilestoneId === scopedSubmilestone._id
            : !visit.submilestoneKeys?.length ||
              visit.submilestoneKeys.includes(scopedSubmilestone.key))),
    );
    scopedVisits.sort((a, b) => b.updatedAt - a.updatedAt);

    const buildIds = [...new Set(scopedVisits.map((visit) => visit.buildId))];
    const builds = new Map<Id<"activeBuilds">, Doc<"activeBuilds"> | null>();
    const builders = new Map<
      Id<"builderProfiles">,
      Doc<"builderProfiles"> | null
    >();
    const milestones = new Map<string, Doc<"buildMilestones"> | null>();
    const geofenceByMilestone = new Map<string, boolean>();

    await Promise.all(
      buildIds.map(async (buildId) => {
        const build = await ctx.db.get(buildId);
        builds.set(buildId, build);
        if (build?.builderProfileId && !builders.has(build.builderProfileId)) {
          builders.set(
            build.builderProfileId,
            await ctx.db.get(build.builderProfileId),
          );
        }
        const evidenceAssets = await ctx.db
          .query("buildEvidenceAssets")
          .withIndex("by_build", (q) => q.eq("buildId", buildId))
          .take(500);
        for (const asset of evidenceAssets) {
          if (asset.locationVerified) {
            continue;
          }
          const key = `${String(buildId)}:${asset.milestoneKey}`;
          geofenceByMilestone.set(key, true);
        }
      }),
    );

    await Promise.all(
      scopedVisits.map(async (visit) => {
        const milestoneKey = `${String(visit.buildId)}:${visit.milestoneKey}`;
        if (milestones.has(milestoneKey)) {
          return;
        }
        milestones.set(milestoneKey, await ctx.db.get(visit.buildMilestoneId));
      }),
    );

    const visits = scopedVisits.map((visit) => {
      const build = builds.get(visit.buildId);
      const builder =
        build?.builderProfileId == null
          ? null
          : builders.get(build.builderProfileId);
      const milestone =
        milestones.get(`${String(visit.buildId)}:${visit.milestoneKey}`) ??
        null;
      const tokenState = productionSiteVisitTokenState(visit, now);
      const operationalStatus = productionSiteVisitOperationalStatus(
        visit,
        now,
      );
      const geofenceFlagged =
        geofenceByMilestone.get(
          `${String(visit.buildId)}:${visit.milestoneKey}`,
        ) ?? false;
      const scheduledDateLabel = build
        ? productionSiteVisitScheduledLabel(build.startDate, visit.requestedDay)
        : `Day ${visit.requestedDay}`;
      return {
        buildDisplayId: build ? productionBuildDisplayId(build) : "Build",
        buildHref: `/backoffice/builds/${String(visit.buildId)}`,
        buildId: visit.buildId,
        buildName: build?.buildName ?? "Unknown build",
        builderName: builder?.displayName ?? "Builder",
        completedAt: visit.completedAt,
        geofenceFlagged,
        location: build?.location ?? "",
        locationAttempt: visit.locationAttempt,
        milestoneKey: visit.milestoneKey,
        milestoneName: milestone?.name ?? visit.milestoneKey,
        milestoneReviewStatus: milestone?.completionReview?.status,
        missingPrerequisites: visit.missingPrerequisites,
        note: visit.note,
        operationalStatus,
        prerequisiteException: visit.prerequisiteException,
        recordNote: visit.recordNote,
        recordNoteFormat: visit.recordNoteFormat,
        recommendedOutcome:
          milestone?.completionReview?.siteVisit?.recommendedOutcome,
        requestedAt: visit.requestedAt,
        requestedDay: visit.requestedDay,
        scheduledDateLabel,
        tokenExpiresAt: visit.tokenExpiresAt,
        tokenMsRemaining: Math.max(0, visit.tokenExpiresAt - now),
        tokenOpenedAt: visit.tokenOpenedAt,
        tokenState,
        updatedAt: visit.updatedAt,
        url: visit.url,
        visitId: visit.visitId,
      };
    });

    visits.sort((a, b) => {
      const urgency = productionSiteVisitUrgencyRank(a.operationalStatus);
      const urgencyB = productionSiteVisitUrgencyRank(b.operationalStatus);
      if (urgency !== urgencyB) {
        return urgency - urgencyB;
      }
      if (a.operationalStatus === "expired" || a.operationalStatus === "open") {
        return a.tokenMsRemaining - b.tokenMsRemaining;
      }
      return b.updatedAt - a.updatedAt;
    });

    const summary = {
      cancelled: visits.filter(
        (visit) => visit.operationalStatus === "cancelled",
      ).length,
      complete: visits.filter((visit) => visit.operationalStatus === "complete")
        .length,
      expiringWithin15Min: visits.filter(
        (visit) =>
          visit.operationalStatus === "open" &&
          visit.tokenMsRemaining > 0 &&
          visit.tokenMsRemaining <= 15 * 60 * 1000,
      ).length,
      expired: visits.filter((visit) => visit.operationalStatus === "expired")
        .length,
      geofenceFlagged: visits.filter((visit) => visit.geofenceFlagged).length,
      inField: visits.filter((visit) => visit.operationalStatus === "in_field")
        .length,
      open: visits.filter((visit) => visit.operationalStatus === "open").length,
      total: visits.length,
    };

    const buildsGrouped = new Map<
      string,
      {
        activeVisitCount: number;
        buildDisplayId: string;
        buildId: Id<"activeBuilds">;
        buildName: string;
        builderName: string;
        href: string;
        location: string;
        visits: typeof visits;
      }
    >();
    for (const visit of visits) {
      const key = String(visit.buildId);
      const existing = buildsGrouped.get(key);
      const isActive =
        visit.operationalStatus === "open" ||
        visit.operationalStatus === "in_field" ||
        visit.operationalStatus === "expired";
      if (existing) {
        existing.visits.push(visit);
        if (isActive) {
          existing.activeVisitCount += 1;
        }
        continue;
      }
      buildsGrouped.set(key, {
        activeVisitCount: isActive ? 1 : 0,
        buildDisplayId: visit.buildDisplayId,
        buildId: visit.buildId,
        buildName: visit.buildName,
        builderName: visit.builderName,
        href: visit.buildHref,
        location: visit.location,
        visits: [visit],
      });
    }

    const buildsOut = [...buildsGrouped.values()].sort((a, b) => {
      if (a.activeVisitCount !== b.activeVisitCount) {
        return b.activeVisitCount - a.activeVisitCount;
      }
      return a.buildName.localeCompare(b.buildName);
    });

    return { builds: buildsOut, summary, visits };
  })
  .public();

export const productionBuildDrawStatusValidator = v.union(
  v.literal("planned"),
  v.literal("requested"),
  v.literal("in_review"),
  v.literal("ready_for_admin"),
  v.literal("approved_for_release"),
  v.literal("rejected"),
  v.literal("withdrawn"),
  v.literal("cancelled"),
  v.literal("released"),
);

export const brokerageDrawRowValidator = v.object({
  amountCents: v.number(),
  buildDisplayId: v.string(),
  buildHref: v.string(),
  buildId: v.id("activeBuilds"),
  buildName: v.string(),
  builderContact: v.object({
    contactName: v.optional(v.string()),
    displayName: v.string(),
    email: v.optional(v.string()),
    role: v.optional(v.string()),
  }),
  builderName: v.string(),
  drawId: v.union(
    v.id("plannedDrawScheduleRows"),
    v.id("activeBuildDrawRequests"),
  ),
  drawKey: v.string(),
  label: v.string(),
  location: v.string(),
  funding: v.object({
    availableCents: v.number(),
    drawnCents: v.number(),
    totalApprovedCents: v.number(),
  }),
  milestoneKey: v.optional(v.string()),
  milestoneName: v.optional(v.string()),
  requestNote: v.optional(v.string()),
  requestReviewNote: v.optional(v.string()),
  requestedAt: v.optional(v.string()),
  reviewedAt: v.optional(v.string()),
  releaseDate: v.optional(v.string()),
  releasedAt: v.optional(v.string()),
  sourceAllocations: v.optional(
    v.array(
      v.object({
        amountCents: v.number(),
        drawGroupKey: v.string(),
        milestoneKey: v.string(),
        milestoneName: v.string(),
        sourceOrder: v.number(),
      }),
    ),
  ),
  scheduledDateIso: v.string(),
  scheduledDateLabel: v.string(),
  status: productionBuildDrawStatusValidator,
  timingDay: v.number(),
  updatedAt: v.number(),
  workOrderKey: v.optional(v.string()),
});
