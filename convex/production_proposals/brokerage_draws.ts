/**
 * Production proposals brokerage draws bounded-context implementation.
 * The parent facade re-exports its handlers to preserve production_proposals function references.
 */
import { v } from "convex/values";
import { authenticatedQuery } from "../authz";
import { type Doc, type Id } from "../types";
import { hasProjectedWorkosPermission as hasPermission } from "../workos_permission_access";
import { addDaysIso } from "./active_capital_evidence.js";
import { activeBuildDrawFundingSnapshot, activeBuildDrawAllocationViews } from "./active_funding.js";
import { resolveBrokerageScope } from "./authorization_core.js";
import { productionBuildDrawStatusValidator, brokerageDrawRowValidator } from "./brokerage_site_visits.js";
import { canReadBackofficeProposal } from "./contractor_policy_helpers.js";
import { productionBuildDisplayId, productionDrawUrgencyRank, buildBrokerageDrawChartSeries } from "./directory_cards.js";
import { drawReviewBuilderContact, isBackoffice } from "./proposal_claim.js";
import { activeBuildDrawWorkOrderKey } from "./proposal_copy_audit.js";
import { activeBuildDrawCanonicalStatus } from "./roster_projection_helpers.js";

export const listBrokerageDraws = authenticatedQuery
  .input({ workosOrganizationId: v.string() })
  .returns(
    v.object({
      builds: v.array(
        v.object({
          buildDisplayId: v.string(),
          buildId: v.id("activeBuilds"),
          buildName: v.string(),
          builderName: v.string(),
          draws: v.array(brokerageDrawRowValidator),
          href: v.string(),
          location: v.string(),
          openDrawCount: v.number(),
        }),
      ),
      chartSeries: v.array(
        v.object({
          approvedCents: v.number(),
          periodKey: v.string(),
          periodLabel: v.string(),
          plannedCents: v.number(),
          releasedCents: v.number(),
          requestedCents: v.number(),
        }),
      ),
      draws: v.array(brokerageDrawRowValidator),
      exposureSnapshot: v.array(
        v.object({
          amountCents: v.number(),
          label: v.string(),
          status: productionBuildDrawStatusValidator,
        }),
      ),
      summary: v.object({
        approved: v.number(),
        exposureApprovedCents: v.number(),
        exposureRequestedCents: v.number(),
        planned: v.number(),
        rejected: v.number(),
        released: v.number(),
        releasedCents: v.number(),
        requested: v.number(),
        total: v.number(),
        upcomingPlannedCents: v.number(),
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

    const activeBuildRows = await ctx.db
      .query("activeBuilds")
      .withIndex("by_brokerage", (q) => q.eq("brokerageId", auth.brokerage._id))
      .collect();
    const scopedBuilds = activeBuildRows.filter(
      (build) => build.organizationId === args.workosOrganizationId,
    );

    const builders = new Map<
      Id<"builderProfiles">,
      Doc<"builderProfiles"> | null
    >();
    const milestones = new Map<string, Doc<"buildMilestones"> | null>();
    const draws: Array<{
      amountCents: number;
      buildDisplayId: string;
      buildHref: string;
      buildId: Id<"activeBuilds">;
      buildName: string;
      builderContact: {
        contactName?: string;
        displayName: string;
        email?: string;
        role?: string;
      };
      builderName: string;
      drawId: Id<"plannedDrawScheduleRows"> | Id<"activeBuildDrawRequests">;
      drawKey: string;
      label: string;
      location: string;
      funding: {
        availableCents: number;
        drawnCents: number;
        totalApprovedCents: number;
      };
      milestoneKey?: string;
      milestoneName?: string;
      requestNote?: string;
      requestReviewNote?: string;
      requestedAt?: string;
      reviewedAt?: string;
      releaseDate?: string;
      releasedAt?: string;
      sourceAllocations?: Array<{
        amountCents: number;
        drawGroupKey: string;
        milestoneKey: string;
        milestoneName: string;
        sourceOrder: number;
      }>;
      scheduledDateIso: string;
      scheduledDateLabel: string;
      status: Exclude<Doc<"plannedDrawScheduleRows">["status"], "approved">;
      timingDay: number;
      updatedAt: number;
      workOrderKey?: string;
    }> = [];

    for (const build of scopedBuilds) {
      const proposal = await ctx.db.get(build.proposalId);
      if (!proposal) {
        continue;
      }
      if (!(canReadBackofficeProposal(auth, proposal) || staffCanRead)) {
        continue;
      }
      if (!builders.has(build.builderProfileId)) {
        builders.set(
          build.builderProfileId,
          await ctx.db.get(build.builderProfileId),
        );
      }
      const builder = builders.get(build.builderProfileId);
      const drawRows = await ctx.db
        .query("plannedDrawScheduleRows")
        .withIndex("by_build_order", (q) => q.eq("buildId", build._id))
        .collect();
      const requestRows = await ctx.db
        .query("activeBuildDrawRequests")
        .withIndex("by_build", (q) => q.eq("buildId", build._id))
        .collect();
      const builderContact = await drawReviewBuilderContact(
        ctx,
        build.builderProfileId,
        builder?.displayName ?? "Builder",
      );
      const fundingSnapshot = await activeBuildDrawFundingSnapshot(
        ctx,
        build._id,
        { allowLegacyUnattributedRequests: true },
      );
      const funding = {
        availableCents: fundingSnapshot.availableCents,
        drawnCents: requestRows
          .filter(
            (request) =>
              activeBuildDrawCanonicalStatus(request.status) === "released",
          )
          .reduce((sum, request) => sum + request.amountCents, 0),
        totalApprovedCents: fundingSnapshot.unlockedCents,
      };
      const plannedByKey = new Map(
        drawRows.map((draw) => [draw.drawKey, draw]),
      );

      for (const draw of drawRows) {
        const milestoneKey = draw.milestoneKey;
        let milestone: Doc<"buildMilestones"> | null = null;
        if (milestoneKey) {
          const milestoneCacheKey = `${String(build._id)}:${milestoneKey}`;
          if (!milestones.has(milestoneCacheKey)) {
            const milestoneRows = await ctx.db
              .query("buildMilestones")
              .withIndex("by_build_key", (q) =>
                q.eq("buildId", build._id).eq("key", milestoneKey),
              )
              .take(1);
            milestones.set(milestoneCacheKey, milestoneRows[0] ?? null);
          }
          milestone = milestones.get(milestoneCacheKey) ?? null;
        }
        const scheduledDateIso = addDaysIso(build.startDate, draw.timingDay);
        draws.push({
          amountCents: draw.amountCents,
          buildDisplayId: productionBuildDisplayId(build),
          buildHref: `/backoffice/builds/${String(build._id)}?tab=timeline&draw=${draw.drawKey}`,
          buildId: build._id,
          buildName: build.buildName,
          builderContact,
          builderName: builder?.displayName ?? "Builder",
          drawId: draw._id,
          drawKey: draw.drawKey,
          label: draw.label,
          location: build.location,
          funding,
          milestoneKey,
          milestoneName: milestone?.name,
          scheduledDateIso,
          scheduledDateLabel: scheduledDateIso,
          status: "planned",
          timingDay: draw.timingDay,
          updatedAt: draw.updatedAt,
        });
      }
      for (const request of requestRows) {
        const sourceAllocations = await activeBuildDrawAllocationViews(
          ctx,
          request._id,
        );
        const planned = request.plannedDrawKey
          ? plannedByKey.get(request.plannedDrawKey)
          : undefined;
        const scheduledDateIso =
          request.releaseDate ??
          request.releasedAt?.slice(0, 10) ??
          request.requestedAt.slice(0, 10);
        draws.push({
          amountCents: request.amountCents,
          buildDisplayId: productionBuildDisplayId(build),
          buildHref: `/backoffice/builds/${String(build._id)}?tab=details`,
          buildId: build._id,
          buildName: build.buildName,
          builderContact,
          builderName: builder?.displayName ?? "Builder",
          drawId: request._id,
          drawKey: request.requestKey,
          label: `${request.displayId} · ${request.label}`,
          location: build.location,
          funding,
          milestoneKey: planned?.milestoneKey,
          milestoneName: planned?.milestoneKey
            ? milestones.get(`${String(build._id)}:${planned.milestoneKey}`)
                ?.name
            : undefined,
          requestNote: request.note,
          requestReviewNote:
            request.reviewNote ?? request.operationsRecommendationNote,
          requestedAt: request.requestedAt,
          reviewedAt: request.reviewedAt,
          releaseDate: request.releaseDate,
          releasedAt: request.releasedAt,
          sourceAllocations,
          scheduledDateIso,
          scheduledDateLabel: scheduledDateIso,
          status: activeBuildDrawCanonicalStatus(request.status),
          timingDay: planned?.timingDay ?? 0,
          updatedAt: request.updatedAt,
          workOrderKey: activeBuildDrawWorkOrderKey(request),
        });
      }
    }

    draws.sort((a, b) => {
      const urgency = productionDrawUrgencyRank(a.status);
      const urgencyB = productionDrawUrgencyRank(b.status);
      if (urgency !== urgencyB) {
        return urgency - urgencyB;
      }
      if (
        a.status === "requested" ||
        a.status === "in_review" ||
        a.status === "ready_for_admin" ||
        a.status === "approved_for_release"
      ) {
        return b.updatedAt - a.updatedAt;
      }
      return a.scheduledDateIso.localeCompare(b.scheduledDateIso);
    });

    const summary = {
      approved: draws.filter((draw) => draw.status === "approved_for_release")
        .length,
      exposureApprovedCents: draws
        .filter((draw) => draw.status === "approved_for_release")
        .reduce((sum, draw) => sum + draw.amountCents, 0),
      exposureRequestedCents: draws
        .filter(
          (draw) =>
            draw.status === "requested" ||
            draw.status === "in_review" ||
            draw.status === "ready_for_admin",
        )
        .reduce((sum, draw) => sum + draw.amountCents, 0),
      planned: draws.filter((draw) => draw.status === "planned").length,
      rejected: draws.filter((draw) => draw.status === "rejected").length,
      released: draws.filter((draw) => draw.status === "released").length,
      releasedCents: draws
        .filter((draw) => draw.status === "released")
        .reduce((sum, draw) => sum + draw.amountCents, 0),
      requested: draws.filter(
        (draw) =>
          draw.status === "requested" ||
          draw.status === "in_review" ||
          draw.status === "ready_for_admin",
      ).length,
      total: draws.length,
      upcomingPlannedCents: draws
        .filter((draw) => draw.status === "planned")
        .reduce((sum, draw) => sum + draw.amountCents, 0),
    };

    const exposureSnapshot = (
      [
        ["requested", "Under review"],
        ["approved_for_release", "Approved to release"],
        ["planned", "Upcoming planned"],
        ["released", "Released"],
        ["rejected", "Rejected"],
      ] as const
    ).map(([status, label]) => ({
      amountCents: draws
        .filter((draw) => draw.status === status)
        .reduce((sum, draw) => sum + draw.amountCents, 0),
      label,
      status,
    }));

    const chartSeries = buildBrokerageDrawChartSeries(draws);

    const buildsGrouped = new Map<
      string,
      {
        buildDisplayId: string;
        buildId: Id<"activeBuilds">;
        buildName: string;
        builderName: string;
        draws: typeof draws;
        href: string;
        location: string;
        openDrawCount: number;
      }
    >();
    for (const draw of draws) {
      const key = String(draw.buildId);
      const isOpen =
        draw.status === "requested" ||
        draw.status === "in_review" ||
        draw.status === "ready_for_admin" ||
        draw.status === "approved_for_release" ||
        draw.status === "planned";
      const existing = buildsGrouped.get(key);
      if (existing) {
        existing.draws.push(draw);
        if (isOpen) {
          existing.openDrawCount += 1;
        }
        continue;
      }
      buildsGrouped.set(key, {
        buildDisplayId: draw.buildDisplayId,
        buildId: draw.buildId,
        buildName: draw.buildName,
        builderName: draw.builderName,
        draws: [draw],
        href: `/backoffice/builds/${String(draw.buildId)}?tab=timeline`,
        location: draw.location,
        openDrawCount: isOpen ? 1 : 0,
      });
    }

    const buildsOut = [...buildsGrouped.values()].sort((a, b) => {
      if (a.openDrawCount !== b.openDrawCount) {
        return b.openDrawCount - a.openDrawCount;
      }
      return a.buildName.localeCompare(b.buildName);
    });

    return {
      builds: buildsOut,
      chartSeries,
      draws,
      exposureSnapshot,
      summary,
    };
  })
  .public();
