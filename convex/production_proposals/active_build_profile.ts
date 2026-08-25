/**
 * Production proposals active build profile bounded-context implementation.
 * The parent facade re-exports its handlers to preserve production_proposals function references.
 */
import { v } from "convex/values";
import { authenticatedMutation, authenticatedQuery } from "../authz";
import { scheduleCurrentMilestoneSystemPostActivations } from "../build_collaboration_scheduling";
import { validateBuildTimezone } from "../build_collaboration_system_posts";
import { type Doc } from "../types";
import { activeBuildMilestoneEffectiveDrawAvailabilityCents } from "./active_planning.js";
import { authorizeActiveBuildOrThrow, requireBackofficeActiveBuildWrite } from "./authorization_core.js";
import { activeBuildAppPermissionProjection, canUseAppPermission } from "./builder_staff_access.js";
import { PROPOSAL_TIMELINE_MIN_DAY, TIMELINE_AUDIT_EVENTS_LIMIT, TIMELINE_EVIDENCE_URL_CAP } from "./contracts_foundation.js";
import { resolveBorrowerStartingCashCents } from "./directory_cards.js";
import { isBackoffice } from "./proposal_claim.js";
import { writeActiveBuildEvent, activeBuildDrawWorkOrderKey } from "./proposal_copy_audit.js";
import { requireReason, productionCompletionClaimView, productionCompletionReviewView, productionPolicyState, iconForProductionMilestone } from "./proposal_lender_approval.js";
import { daysBetweenIso, signedDaysBetweenIso, activeBuildTimelineRequestStatus, activeBuildTimelineMilestoneStatus, activeBuildTimelineMilestoneTone, activeBuildMilestoneSummary, activeBuildSiteVisitCompletionReviewView } from "./roster_projection_helpers.js";
import { createStorageUrlResolver, collectByIndex } from "./storage_helpers.js";

export const updateActiveBuildNonFinancialDetails = authenticatedMutation
  .input({
    buildId: v.id("activeBuilds"),
    buildName: v.string(),
    ianaTimezone: v.optional(v.string()),
    location: v.string(),
    locationLatitude: v.optional(v.union(v.number(), v.null())),
    locationLongitude: v.optional(v.union(v.number(), v.null())),
    locationPlaceId: v.optional(v.union(v.string(), v.null())),
    reason: v.string(),
    startDate: v.string(),
    workosOrganizationId: v.string(),
  })
  .returns(v.null())
  .handler(async (ctx, args) => {
    const auth = await authorizeActiveBuildOrThrow(
      ctx,
      args.buildId,
      args.workosOrganizationId,
    );
    requireBackofficeActiveBuildWrite(auth);
    requireReason(args.reason);

    const buildName = args.buildName.trim();
    const location = args.location.trim();
    const startDate = args.startDate.trim();
    const timezone =
      args.ianaTimezone === undefined
        ? undefined
        : validateBuildTimezone(args.ianaTimezone);
    if (!buildName) {
      throw new Error("Build title is required.");
    }
    if (!location) {
      throw new Error("Build address is required.");
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate)) {
      throw new Error("Project start must use YYYY-MM-DD.");
    }
    if (
      (args.locationLatitude === null) !== (args.locationLongitude === null) ||
      (args.locationLatitude === undefined) !==
        (args.locationLongitude === undefined)
    ) {
      throw new Error("Latitude and longitude must be updated together.");
    }

    const priorState = {
      buildName: auth.build.buildName,
      location: auth.build.location,
      locationLatitude: auth.build.locationLatitude,
      locationLongitude: auth.build.locationLongitude,
      locationPlaceId: auth.build.locationPlaceId,
      startDate: auth.build.startDate,
      timezone: auth.build.timezone,
    };
    const patch: any = {
      buildName,
      location,
      startDate,
      updatedAt: Date.now(),
    };
    if (timezone !== undefined) {
      patch.timezone = timezone;
    }
    if (args.locationPlaceId !== undefined) {
      patch.locationPlaceId = args.locationPlaceId?.trim() || undefined;
    }
    if (args.locationLatitude !== undefined) {
      patch.locationLatitude = args.locationLatitude ?? undefined;
    }
    if (args.locationLongitude !== undefined) {
      patch.locationLongitude = args.locationLongitude ?? undefined;
    }

    const newState = {
      buildName,
      location,
      locationLatitude:
        args.locationLatitude === undefined
          ? auth.build.locationLatitude
          : args.locationLatitude,
      locationLongitude:
        args.locationLongitude === undefined
          ? auth.build.locationLongitude
          : args.locationLongitude,
      locationPlaceId:
        args.locationPlaceId === undefined
          ? auth.build.locationPlaceId
          : args.locationPlaceId,
      startDate,
      timezone:
        timezone === undefined ? auth.build.timezone : timezone,
    };

    await ctx.db.patch(args.buildId, patch);
    const updatedBuild = await ctx.db.get(args.buildId);
    if (updatedBuild) {
      await scheduleCurrentMilestoneSystemPostActivations(ctx, {
        build: updatedBuild,
      });
    }
    await writeActiveBuildEvent(ctx, {
      auth,
      build: auth.build,
      command: "updateActiveBuildNonFinancialDetails",
      eventType: "active_build.non_financial_details.updated",
      newState: JSON.stringify(newState),
      priorState: JSON.stringify(priorState),
      reason: args.reason.trim(),
    });
    return null;
  })
  .public();

export const getActiveBuildTimelineWorkspace = authenticatedQuery
  .input({
    buildId: v.id("activeBuilds"),
    workosOrganizationId: v.string(),
  })
  .returns(v.any())
  .handler(async (ctx, args) => {
    const auth = await authorizeActiveBuildOrThrow(
      ctx,
      args.buildId,
      args.workosOrganizationId,
    );
    const { build, proposal } = auth;
    // Phase 4: milestones/draws stay for first paint; audit + evidence URLs are capped.
    // Follow-up: lazy-load evidence previews / audit pages via dedicated queries.
    const [
      milestones,
      submilestones,
      draws,
      drawRequests,
      drawAllocations,
      evidenceAssets,
      capitalPlanRows,
      siteVisits,
      capitalEvents,
      loanFacilities,
      auditEvents,
      permitWaiver,
      milestoneAssignments,
    ] = await Promise.all([
      collectByIndex(ctx, "buildMilestones", "by_build", args.buildId),
      collectByIndex(ctx, "buildSubmilestones", "by_build", args.buildId),
      collectByIndex(ctx, "plannedDrawScheduleRows", "by_build", args.buildId),
      collectByIndex(ctx, "activeBuildDrawRequests", "by_build", args.buildId),
      collectByIndex(
        ctx,
        "activeBuildDrawRequestAllocations",
        "by_build",
        args.buildId,
      ),
      collectByIndex(ctx, "buildEvidenceAssets", "by_build", args.buildId),
      collectByIndex(ctx, "buildCapitalPlans", "by_build", args.buildId),
      collectByIndex(ctx, "buildSiteVisits", "by_build", args.buildId),
      collectByIndex(ctx, "capitalEvents", "by_build", args.buildId),
      collectByIndex(ctx, "loanFacilities", "by_build", args.buildId),
      ctx.db
        .query("auditEvents")
        .withIndex("by_entity", (q) =>
          q
            .eq("entityType", "activeBuild")
            .eq("entityId", String(args.buildId)),
        )
        .order("desc")
        .take(TIMELINE_AUDIT_EVENTS_LIMIT),
      build.permitWaiverId ? ctx.db.get(build.permitWaiverId) : null,
      collectByIndex(
        ctx,
        "milestoneContractorAssignments",
        "by_build",
        args.buildId,
      ),
    ]);
    const sortedMilestones = [...milestones].sort(
      (a, b) => a.order - b.order || a.key.localeCompare(b.key),
    );
    const sortedDraws = [...draws].sort(
      (a, b) => a.order - b.order || a.drawKey.localeCompare(b.drawKey),
    );
    const sortedDrawRequests = (
      drawRequests as Doc<"activeBuildDrawRequests">[]
    )
      .slice()
      .sort((a, b) => a.createdAt - b.createdAt);
    const milestoneNameById = new Map(
      sortedMilestones.map((milestone) => [
        String(milestone._id),
        milestone.name,
      ]),
    );
    const drawAllocationsByRequest = new Map<
      string,
      Array<{
        amountCents: number;
        drawGroupKey: string;
        milestoneKey: string;
        milestoneName: string;
        sourceOrder: number;
      }>
    >();
    for (const allocation of drawAllocations as Doc<"activeBuildDrawRequestAllocations">[]) {
      const requestId = String(allocation.drawRequestId);
      const list = drawAllocationsByRequest.get(requestId) ?? [];
      list.push({
        amountCents: allocation.amountCents,
        drawGroupKey: allocation.drawGroupKey,
        milestoneKey: allocation.milestoneKey,
        milestoneName:
          milestoneNameById.get(String(allocation.buildMilestoneId)) ??
          allocation.milestoneKey,
        sourceOrder: allocation.sourceOrder,
      });
      drawAllocationsByRequest.set(requestId, list);
    }
    const plannedDrawByKey = new Map(
      sortedDraws.map((draw) => [draw.drawKey, draw]),
    );
    const maxDay = Math.max(
      60,
      ...sortedMilestones.map((milestone) => milestone.dayEnd + 10),
      ...sortedDraws.map((draw) => draw.timingDay + 10),
    );
    const computedCurrentDay = Math.max(
      0,
      Math.min(
        maxDay,
        daysBetweenIso(build.startDate, new Date().toISOString()),
      ),
    );
    const currentDay = build.timelineCurrentDay ?? computedCurrentDay;
    const activeMilestone =
      sortedMilestones.find((milestone) => milestone.status !== "complete") ??
      sortedMilestones[0];
    const drawByMilestoneKey = new Map(
      sortedDraws
        .filter((draw) => draw.milestoneKey)
        .map((draw) => [draw.milestoneKey as string, draw]),
    );
    const capitalPlan = capitalPlanRows[0] ?? null;
    const siteVisitsByMilestone = new Map<string, any[]>();
    for (const visit of siteVisits) {
      const list = siteVisitsByMilestone.get(visit.milestoneKey) ?? [];
      list.push(visit);
      siteVisitsByMilestone.set(visit.milestoneKey, list);
    }
    const activeCapitalEvents = capitalEvents as Doc<"capitalEvents">[];
    const loanFacilityById = new Map(
      (loanFacilities as Doc<"loanFacilities">[]).map((facility) => [
        String(facility._id),
        facility,
      ]),
    );
    const activeSubmilestones = submilestones as Doc<"buildSubmilestones">[];
    const buildMilestoneContractorAssignments = (
      milestoneAssignments as Doc<"milestoneContractorAssignments">[]
    ).filter((assignment) => assignment.status !== "removed");
    const appPermissions = await activeBuildAppPermissionProjection(ctx, auth);
    const canViewLenderDrawNotes = isBackoffice(auth.roles);

    return {
      activeBuild: build,
      appPermissions,
      auditEvents: auditEvents
        .sort((a, b) => b.createdAt - a.createdAt)
        .map((event) => ({
          _id: event._id,
          actorPersona: event.actorWorkosUserId,
          command: event.command,
          createdAt: event.createdAt,
          entityType: event.entityType,
          eventType: event.eventType,
          reason: event.reason,
        })),
      capitalEvents: canUseAppPermission(appPermissions, "capitalEvent", "view")
        ? [
            {
              amountCents:
                capitalPlan?.borrowerStartingCashCents ??
                capitalPlan?.borrowerWorkingCapitalLimitCents ??
                resolveBorrowerStartingCashCents(proposal),
              capitalEventKey: "borrower-reserve",
              eventKind: "cashInfusion",
              label: "Borrower reserve",
              x: 0,
            },
            ...activeCapitalEvents
              .filter((event) => event.eventType !== "draw_release")
              .sort((a, b) => a.createdAt - b.createdAt)
              .map((event) => ({
                ...(event.loanFacilityId
                  ? {
                      interestAnnualBps: loanFacilityById.get(
                        String(event.loanFacilityId),
                      )?.interestAnnualBps,
                    }
                  : {}),
                amountCents: event.amountCents,
                capitalEventKey: event.capitalEventKey ?? String(event._id),
                eventKind:
                  event.eventType === "borrower_copay"
                    ? "cashInfusion"
                    : event.eventType === "home_equity_takeout"
                      ? "homeEquityTakeout"
                      : "cost",
                label: event.label,
                x: signedDaysBetweenIso(build.startDate, event.eventDate),
              })),
          ]
        : [],
      draws: canUseAppPermission(appPermissions, "draw", "view")
        ? [
            ...sortedDraws.map((draw) => {
              const drawMilestone = draw.milestoneKey
                ? sortedMilestones.find(
                    (milestone) => milestone.key === draw.milestoneKey,
                  )
                : undefined;
              const amountCents =
                draw.status === "planned" && drawMilestone
                  ? Math.min(
                      draw.amountCents,
                      activeBuildMilestoneEffectiveDrawAvailabilityCents(
                        drawMilestone as Doc<"buildMilestones">,
                      ),
                    )
                  : draw.amountCents;

              return {
                amountCents,
                customDate: false,
                drawKey: draw.drawKey,
                itemMilestoneKey: draw.milestoneKey,
                label: draw.label,
                requestStatus: "planned" as const,
                x: draw.timingDay,
              };
            }),
            ...sortedDrawRequests.map((request) => {
              const planned = request.plannedDrawKey
                ? plannedDrawByKey.get(request.plannedDrawKey)
                : undefined;
              return {
                amountCents: request.amountCents,
                customDate: true,
                drawKey: request.requestKey,
                itemMilestoneKey: planned?.milestoneKey,
                label: `${request.displayId} · ${request.label}`,
                ...(canViewLenderDrawNotes
                  ? {
                      requestNote: request.note,
                      requestReviewNote:
                        request.reviewNote ??
                        request.operationsRecommendationNote ??
                        request.releaseNote ??
                        request.withdrawalNote,
                    }
                  : request.requestedByWorkosUserId === auth.subject &&
                      request.note
                    ? { requestNote: request.note }
                    : {}),
                requestStatus: activeBuildTimelineRequestStatus(request.status),
                reviewedAt:
                  request.reviewedAt ??
                  request.readyForAdminAt ??
                  request.operationsReviewStartedAt ??
                  request.releasedAt ??
                  request.withdrawnAt,
                requestedAt: request.requestedAt,
                sourceAllocations:
                  drawAllocationsByRequest.get(String(request._id)) ?? [],
                workOrderKey: activeBuildDrawWorkOrderKey(request),
                x: planned?.timingDay ?? currentDay,
              };
            }),
          ]
        : [],
      evidenceAssets: canUseAppPermission(appPermissions, "evidence", "view")
        ? await (async () => {
            const resolveStorageUrl = createStorageUrlResolver(
              ctx,
              TIMELINE_EVIDENCE_URL_CAP,
            );
            const sortedEvidence = [...evidenceAssets].sort(
              (a, b) => a.createdAt - b.createdAt,
            );
            return await Promise.all(
              sortedEvidence.map(async (asset) => ({
                evidenceKey: asset.evidenceKey,
                fileName: asset.fileName,
                label: asset.label,
                milestoneKey: asset.milestoneKey,
                mimeType: asset.mimeType,
                previewUrl: await resolveStorageUrl(asset.storageId),
                sizeBytes: asset.sizeBytes,
                tag: asset.tag,
              })),
            );
          })()
        : [],
      milestones: canUseAppPermission(appPermissions, "milestone", "view")
        ? sortedMilestones.map((milestone, index) => {
            const draw = drawByMilestoneKey.get(milestone.key);
            const visits = siteVisitsByMilestone.get(milestone.key) ?? [];
            const completionReview = productionCompletionReviewView(
              milestone.completionReview,
            );
            const status = activeBuildTimelineMilestoneStatus(milestone, {
              currentDay,
              milestones: sortedMilestones,
            });
            const milestoneSummary = activeBuildMilestoneSummary({
              assignments: buildMilestoneContractorAssignments,
              includeSubmilestones: canUseAppPermission(
                appPermissions,
                "submilestone",
                "view",
              ),
              milestone,
              milestones: sortedMilestones,
              submilestones: activeSubmilestones,
            });
            return {
              ...milestoneSummary,
              completionClaim: productionCompletionClaimView(
                milestone.completionClaim,
              ),
              completionReview:
                completionReview ??
                activeBuildSiteVisitCompletionReviewView(visits.at(-1)),
              drawKey: draw?.label ?? "Reimbursement draw",
              durationDays: milestone.durationDays,
              evidenceState:
                milestone.evidenceState ??
                (milestone.completionClaim
                  ? "Completion claimed"
                  : "Draft package"),
              icon: iconForProductionMilestone(milestone.key, milestone.name),
              lane: index % 3 === 1 ? -1 : index % 3 === 2 ? 1 : 0,
              markerLabel: String(index + 1),
              milestoneKey: milestone.key,
              name: milestone.name,
              order: index + 1,
              policyState:
                milestone.policyState ??
                productionPolicyState(proposal, permitWaiver),
              status,
              tone: activeBuildTimelineMilestoneTone(
                milestone,
                status,
                currentDay,
              ),
              x: milestone.dayStart,
            };
          })
        : [],
      modificationRequests: [],
      loanFacilities: [...(loanFacilities as Doc<"loanFacilities">[])].sort(
        (a, b) => {
          const aPrimary =
            a.facilityKind === undefined || a.facilityKind === "construction";
          const bPrimary =
            b.facilityKind === undefined || b.facilityKind === "construction";
          return (
            Number(bPrimary) - Number(aPrimary) || a.createdAt - b.createdAt
          );
        },
      ),
      permissions: {
        reviewDrawRequests: isBackoffice(auth.roles),
        reviewMilestones: isBackoffice(auth.roles),
        submitDrawRequests:
          !isBackoffice(auth.roles) &&
          canUseAppPermission(appPermissions, "draw", "update"),
        submitMilestoneCompletion:
          !isBackoffice(auth.roles) &&
          canUseAppPermission(appPermissions, "milestone", "update"),
      },
      plan: {
        borrowerCoPayBps:
          capitalPlan?.borrowerCoPayBps ?? proposal.borrowerCoPayBps,
        borrowerCoPayCents: Math.round(
          (build.totalBudgetCents *
            (capitalPlan?.borrowerCoPayBps ?? proposal.borrowerCoPayBps)) /
            10_000,
        ),
        currentDay,
        progressValue:
          build.timelineProgressValue ??
          activeMilestone?.dayStart ??
          currentDay,
        rangeMax: build.timelineRangeMax ?? maxDay,
        rangeMin: PROPOSAL_TIMELINE_MIN_DAY,
        routeState: build.timelineRouteState ?? {
          activeMilestoneKey: activeMilestone?.key,
          selectedPanelOpen: Boolean(activeMilestone),
          straightLine: true,
        },
        minimumCashReserveCents: build.timelineMinimumCashReserveCents ?? 0,
        startingCashCents:
          build.borrowerStartingCashCents ??
          build.timelineStartingCashCents ??
          capitalPlan?.borrowerStartingCashCents ??
          capitalPlan?.borrowerWorkingCapitalLimitCents ??
          resolveBorrowerStartingCashCents(proposal),
      },
      planSummary: {
        address: build.location,
        includedCount: sortedMilestones.length,
        templateTitle: build.buildName,
        totalBudget: build.totalBudgetCents,
      },
      proposal: {
        buildName: build.buildName,
        location: build.location,
        reviewOutcome: proposal.reviewOutcome,
        status: "approved",
        totalBudgetCents: build.totalBudgetCents,
      },
    };
  })
  .public();
