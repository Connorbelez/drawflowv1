/**
 * Production proposals active build detail bounded-context implementation.
 * The parent facade re-exports its handlers to preserve production_proposals function references.
 */
import { v } from "convex/values";
import { deriveResourceType as deriveLegacyAuditResourceType } from "../audit_event_migrations";
import { authorizeActiveBuildAccess } from "../activeBuildAccess";
import { authenticatedQuery } from "../authz";
import { normalizeSiteVisitGuidance } from "../demo_site_visit_guidance";
import { type Doc } from "../types";
import { resolveAuditCanonicalSubmilestone, auditEventHasSubmilestoneScope, productionSubmilestoneAuditTab, activeBuildAuditPermissionResource, activeBuildAuditResourceType } from "./active_build_staff.js";
import { latestBuildCapitalPlan } from "./active_cost.js";
import { activeBuildDrawFundingSnapshot } from "./active_funding.js";
import { projectAuditStateChanges } from "./audit_helpers.js";
import { authorizeBrokerage, authorizeActiveBuild } from "./authorization_core.js";
import { activeBuildAppPermissionProjection, canUseAppPermission } from "./builder_staff_access.js";
import { ACTIVE_BUILD_AUDIT_EVENTS_LIMIT, ACTIVE_BUILD_AUDIT_STREAM_LIMIT, ACTIVE_BUILD_AUDIT_RESOURCE_TYPES, ACTIVE_BUILD_AUDIT_LEGACY_COMPATIBILITY_LIMIT, ACTIVE_BUILD_DOCUMENT_URL_CAP, ACTIVE_BUILD_EVIDENCE_URL_CAP, ACTIVE_BUILD_AVAILABLE_CONTRACTORS_LIMIT } from "./contracts_foundation.js";
import { resolveBorrowerStartingCashCents, productionBuildDisplayId } from "./directory_cards.js";
import { titleCase } from "./legacy_seed.js";
import { drawReviewBuilderContact, isBackoffice } from "./proposal_claim.js";
import { activeBuildDrawWorkOrderKey } from "./proposal_copy_audit.js";
import { activeBuildDrawCanonicalStatus, activeBuildMilestoneSummary, productionMilestoneNeedsBackofficeReview } from "./roster_projection_helpers.js";
import { withBuildDocumentStorageUrls, withBuildEvidenceAssetStorageUrls, productionSitePhotosForBuild, collectByIndex } from "./storage_helpers.js";

export const getActiveBuildRouteAvailabilityByString = authenticatedQuery
  .input({
    buildId: v.string(),
    workosOrganizationId: v.string(),
  })
  .returns(
    v.object({
      buildName: v.optional(v.string()),
      category: v.union(
        v.literal("accessDenied"),
        v.literal("available"),
        v.literal("invalidLink"),
        v.literal("notFound"),
      ),
      requestedBuildId: v.string(),
    }),
  )
  .handler(async (ctx, args) => {
    await authorizeBrokerage(ctx, args.workosOrganizationId);
    const buildId = ctx.db.normalizeId("activeBuilds", args.buildId);
    if (!buildId) {
      return {
        category: "invalidLink" as const,
        requestedBuildId: args.buildId,
      };
    }
    const build = await ctx.db.get(buildId);
    if (!build) {
      return {
        category: "notFound" as const,
        requestedBuildId: args.buildId,
      };
    }
    try {
      const auth = await authorizeActiveBuild(
        ctx,
        buildId,
        args.workosOrganizationId,
      );
      if (!auth) {
        return {
          category: "accessDenied" as const,
          requestedBuildId: args.buildId,
        };
      }
      return {
        buildName: auth.build.buildName,
        category: "available" as const,
        requestedBuildId: args.buildId,
      };
    } catch {
      return {
        category: "accessDenied" as const,
        requestedBuildId: args.buildId,
      };
    }
  })
  .public();

export const getActiveBuildDetailByString = authenticatedQuery
  .input({
    buildId: v.string(),
    workosOrganizationId: v.string(),
  })
  .returns(v.any())
  .handler(async (ctx, args) => {
    const buildId = ctx.db.normalizeId("activeBuilds", args.buildId);
    if (!buildId) {
      return null;
    }
    const auth = await authorizeActiveBuild(
      ctx,
      buildId,
      args.workosOrganizationId,
    );
    if (!auth) {
      return null;
    }
    const { build } = auth;
    const viewerBuildAccess = await authorizeActiveBuildAccess(ctx, {
      backofficePolicy: "proposal-read",
      buildId: build._id,
      organizationId: args.workosOrganizationId,
    }).catch((cause: unknown) => {
      if (cause instanceof Error && cause.message.startsWith("Forbidden:")) {
        return null;
      }
      throw cause;
    });
    const [
      loanFacilities,
      capitalPlans,
      milestones,
      submilestones,
      costItems,
      plannedDraws,
      drawRequests,
      drawAllocations,
      facilityChangeRequests,
      budgetRevisionRequests,
      proposalMilestones,
    ] = await Promise.all([
      collectByIndex(ctx, "loanFacilities", "by_build", buildId),
      collectByIndex(ctx, "buildCapitalPlans", "by_build", buildId),
      collectByIndex(ctx, "buildMilestones", "by_build", buildId),
      collectByIndex(ctx, "buildSubmilestones", "by_build", buildId),
      collectByIndex(ctx, "buildCostItems", "by_build", buildId),
      collectByIndex(ctx, "plannedDrawScheduleRows", "by_build", buildId),
      collectByIndex(ctx, "activeBuildDrawRequests", "by_build", buildId),
      collectByIndex(
        ctx,
        "activeBuildDrawRequestAllocations",
        "by_build",
        buildId,
      ),
      collectByIndex(
        ctx,
        "activeBuildFacilityChangeRequests",
        "by_build",
        buildId,
      ),
      collectByIndex(
        ctx,
        "activeBuildBudgetRevisionRequests",
        "by_build",
        buildId,
      ),
      collectByIndex(
        ctx,
        "proposalMilestones",
        "by_proposal",
        auth.proposal._id,
      ),
    ]);
    // Phase 4: keep domain collections for workspace UI, but cap audit / URL fan-out.
    // Follow-up: split evidence/audit/assignment trees into dedicated queries for first paint.
    const appPermissions = await activeBuildAppPermissionProjection(ctx, auth);
    const [
      documents,
      evidenceAssets,
      assignments,
      milestoneAssignments,
      siteVisits,
      contractorProfiles,
    ] = await Promise.all([
      collectByIndex(ctx, "buildDocuments", "by_build", buildId),
      collectByIndex(ctx, "buildEvidenceAssets", "by_build", buildId),
      collectByIndex(ctx, "buildContractorAssignments", "by_build", buildId),
      collectByIndex(
        ctx,
        "milestoneContractorAssignments",
        "by_build",
        buildId,
      ),
      collectByIndex(ctx, "buildSiteVisits", "by_build", buildId),
      ctx.db
        .query("contractorProfiles")
        .withIndex("by_brokerage", (q) =>
          q.eq("brokerageId", build.brokerageId),
        )
        .take(ACTIVE_BUILD_AVAILABLE_CONTRACTORS_LIMIT),
    ]);
    const buildDocuments = documents as Doc<"buildDocuments">[];
    const buildEvidenceAssets = evidenceAssets as Doc<"buildEvidenceAssets">[];
    const buildContractorAssignments =
      assignments as Doc<"buildContractorAssignments">[];
    const buildMilestoneContractorAssignments = (
      milestoneAssignments as Doc<"milestoneContractorAssignments">[]
    ).filter((assignment) => assignment.status !== "removed");
    const buildSiteVisits = siteVisits as Doc<"buildSiteVisits">[];
    // Ensure contractors attached to this build are present even if outside the
    // brokerage-wide available-contractor cap.
    const attachedContractorIdsNeeded = [
      ...new Set(
        buildContractorAssignments.map((assignment) => assignment.contractorId),
      ),
    ];
    const missingAttachedContractorIds = attachedContractorIdsNeeded.filter(
      (contractorId) =>
        !contractorProfiles.some(
          (contractor) => contractor._id === contractorId,
        ),
    );
    const missingAttachedContractors =
      missingAttachedContractorIds.length > 0
        ? (
            await Promise.all(
              missingAttachedContractorIds.map((id) => ctx.db.get(id)),
            )
          ).flatMap((contractor) => (contractor ? [contractor] : []))
        : [];
    const contractorProfilesForBuild = [
      ...contractorProfiles,
      ...missingAttachedContractors,
    ];
    const proposalGuidanceByMilestoneId = new Map(
      (proposalMilestones as Doc<"proposalMilestones">[]).map((milestone) => [
        String(milestone._id),
        milestone.siteVisitGuidance,
      ]),
    );
    const hydratedSubmilestones = (
      submilestones as Doc<"buildSubmilestones">[]
    ).map((submilestone) => ({
      ...submilestone,
      workflowRevision: submilestone.workflowRevision ?? 0,
    }));
    const hydratedMilestones = (milestones as Doc<"buildMilestones">[]).map(
      (milestone) => {
        const proposalGuidance = proposalGuidanceByMilestoneId.get(
          String(milestone.proposalMilestoneId),
        );
        return {
          ...milestone,
          siteVisitGuidance:
            milestone.siteVisitGuidance ??
            (proposalGuidance
              ? normalizeSiteVisitGuidance(proposalGuidance)
              : undefined),
        };
      },
    );
    const milestoneById = new Map(
      hydratedMilestones.map((milestone) => [String(milestone._id), milestone]),
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
          milestoneById.get(String(allocation.buildMilestoneId))?.name ??
          allocation.milestoneKey,
        sourceOrder: allocation.sourceOrder,
      });
      drawAllocationsByRequest.set(requestId, list);
    }
    for (const allocations of drawAllocationsByRequest.values()) {
      allocations.sort(
        (a, b) =>
          a.sourceOrder - b.sourceOrder ||
          a.milestoneKey.localeCompare(b.milestoneKey),
      );
    }
    const drawFunding = await activeBuildDrawFundingSnapshot(ctx, buildId, {
      allowLegacyUnattributedRequests: true,
    });
    const contractorById = new Map(
      contractorProfilesForBuild.map((contractor) => [
        String(contractor._id),
        contractor,
      ]),
    );
    const attachedContractorIds = new Set(
      buildContractorAssignments.map((assignment) =>
        String(assignment.contractorId),
      ),
    );
    const acknowledgementByMilestoneAssignmentId = new Map(
      (
        await Promise.all(
          buildMilestoneContractorAssignments.map(async (assignment) => {
            const acknowledgements = await ctx.db
              .query("contractorAcknowledgements")
              .withIndex("by_build_assignment", (q) =>
                q.eq("buildAssignmentId", assignment._id),
              )
              .collect();
            const acknowledgement = acknowledgements.find(
              (row) => row.kind === "assignment",
            );
            return [String(assignment._id), acknowledgement] as const;
          }),
        )
      ).filter((entry) => entry[1]),
    );
    // The buildId index is the fast path for canonical producers, but older
    // audit rows predate that field. The bounded organization index provides
    // temporary compatibility until audit_event_migrations completes; only
    // known canonical entity pairs below can enter this Build's history.
    const buildAuditEntityRefs = [
      { entityId: String(build._id), entityType: "activeBuild" },
      ...hydratedMilestones.flatMap((milestone) => [
        { entityId: String(milestone._id), entityType: "buildMilestone" },
        { entityId: String(milestone._id), entityType: "milestone" },
      ]),
      ...hydratedSubmilestones.flatMap((submilestone) => [
        { entityId: String(submilestone._id), entityType: "buildSubmilestone" },
        { entityId: String(submilestone._id), entityType: "submilestone" },
      ]),
      ...(costItems as Doc<"buildCostItems">[]).flatMap((item) => [
        { entityId: String(item._id), entityType: "buildCostItem" },
        { entityId: String(item._id), entityType: "material" },
      ]),
      ...(drawRequests as Doc<"activeBuildDrawRequests">[]).flatMap((draw) => [
        { entityId: String(draw._id), entityType: "activeBuildDrawRequest" },
        { entityId: String(draw._id), entityType: "draw" },
      ]),
      ...(plannedDraws as Doc<"plannedDrawScheduleRows">[]).map((draw) => ({
        entityId: String(draw._id),
        entityType: "draw",
      })),
      ...(buildEvidenceAssets as Doc<"buildEvidenceAssets">[]).flatMap(
        (asset) => [
          { entityId: String(asset._id), entityType: "buildEvidenceAsset" },
          { entityId: String(asset._id), entityType: "evidence" },
          { entityId: String(asset._id), entityType: "evidencePackage" },
        ],
      ),
      ...(buildSiteVisits as Doc<"buildSiteVisits">[]).flatMap((visit) => [
        { entityId: String(visit._id), entityType: "buildSiteVisit" },
        { entityId: String(visit._id), entityType: "siteVisit" },
      ]),
    ];
    const buildAuditEntityKeys = new Set(
      buildAuditEntityRefs.map(
        (ref) => `${ref.entityType}:${ref.entityId}`,
      ),
    );
    const auditEvents = (
      await Promise.all(
        ACTIVE_BUILD_AUDIT_RESOURCE_TYPES.filter((resourceType) => {
          const permissionResource =
            activeBuildAuditPermissionResource(resourceType);
          return (
            permissionResource !== undefined &&
            canUseAppPermission(appPermissions, permissionResource, "view")
          );
        }).map((resourceType) =>
          ctx.db
            .query("auditEvents")
            .withIndex("by_buildId_and_resourceType_and_createdAt", (q) =>
              q.eq("buildId", buildId).eq("resourceType", resourceType),
            )
            .order("desc")
            .take(ACTIVE_BUILD_AUDIT_STREAM_LIMIT),
        ),
      )
    ).flat();
    const legacyAuditEvents = await ctx.db
      .query("auditEvents")
      .withIndex("by_organizationId_and_createdAt", (q) =>
        q.eq("organizationId", build.organizationId),
      )
      .order("desc")
      .take(ACTIVE_BUILD_AUDIT_LEGACY_COMPATIBILITY_LIMIT);
    const legacyBuildEntityAuditEvents = await ctx.db
      .query("auditEvents")
      .withIndex("by_entity", (q) =>
        q.eq("entityType", "activeBuild").eq("entityId", String(build._id)),
      )
      .order("desc")
      .take(ACTIVE_BUILD_AUDIT_STREAM_LIMIT);
    const auditEventsById = new Map<string, Doc<"auditEvents">>();
    for (const event of [
      ...auditEvents,
      ...legacyAuditEvents,
      ...legacyBuildEntityAuditEvents,
    ]) {
      auditEventsById.set(String(event._id), event);
    }
    const submilestoneById = new Map(
      hydratedSubmilestones.map((submilestone) => [
        String(submilestone._id),
        submilestone,
      ]),
    );
    const relevantAuditEvents = [...auditEventsById.values()]
      .filter(
        (event) =>
          event.organizationId === build.organizationId &&
          event.brokerageId === build.brokerageId &&
          (event.buildId === undefined || event.buildId === build._id),
      )
      .filter((event) =>
        buildAuditEntityKeys.has(`${event.entityType}:${event.entityId}`),
      )
      .filter(
        (event) => {
          const resourceType = activeBuildAuditResourceType(
            event.resourceType ?? deriveLegacyAuditResourceType(event),
          );
          const isDirectChildAudit =
            event.entityType === "buildSubmilestone" ||
            event.entityType === "submilestone";
          const exposesChildTarget =
            isDirectChildAudit ||
            auditEventHasSubmilestoneScope(event) ||
            resolveAuditCanonicalSubmilestone(event, submilestoneById) !==
              undefined;
          return (
            resourceType !== undefined &&
            canUseAppPermission(appPermissions, resourceType, "view") &&
            (!exposesChildTarget ||
              canUseAppPermission(appPermissions, "submilestone", "view"))
          );
        },
      )
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, ACTIVE_BUILD_AUDIT_EVENTS_LIMIT);
    const mappedAuditEvents = relevantAuditEvents
      .map((event) => {
        const changes = projectAuditStateChanges(
          event.priorState,
          event.newState,
        );
        const canonicalSubmilestone = resolveAuditCanonicalSubmilestone(
          event,
          submilestoneById,
        );
        return {
          _id: String(event._id),
          actorPersona:
            event.actorRoles.map((role) => titleCase(role)).join(", ") ||
            "Authorized user",
          afterSummary: changes[0]?.after,
          beforeSummary: changes[0]?.before,
          changes,
          command: event.command,
          createdAt: event.createdAt,
          entityLabel: canonicalSubmilestone?.name ?? build.buildName,
          entityType: event.entityType,
          eventType: event.eventType,
          reason: event.reason,
          warnings: event.warnings,
          ...(canonicalSubmilestone
            ? {
                canonicalTarget: {
                  kind: "submilestone" as const,
                  submilestoneId: canonicalSubmilestone._id,
                },
                canonicalTargetContext: {
                  selectedTab: productionSubmilestoneAuditTab(event),
                },
              }
            : {}),
        };
      });
    const canViewLenderDrawNotes = isBackoffice(auth.roles);
    const builderProfile = await ctx.db.get(build.builderProfileId);
    const builderContact = await drawReviewBuilderContact(
      ctx,
      build.builderProfileId,
      builderProfile?.displayName ?? "Builder",
    );
    const quickActionEvents = isBackoffice(auth.roles)
      ? [
          ...(drawRequests as Doc<"activeBuildDrawRequests">[])
            .filter((request) => request.status === "requested")
            .map((request) => ({
              _id: String(request._id),
              actionLabel: "Review draw",
              body: "Review eligibility, evidence, and the requested amount.",
              createdAt: request.createdAt,
              entityLabel: `${build.buildName} · ${request.label}`,
              entityType: "draw",
              href: `/backoffice/draws?buildId=${build._id}&drawId=${request._id}`,
              resolutionMode: "domain" as const,
              sourceLabel: "Builder workspace",
              title: "Draw request awaiting review",
            })),
          ...(milestones as Doc<"buildMilestones">[])
            .filter(productionMilestoneNeedsBackofficeReview)
            .map((milestone) => {
              const siteVisit = milestone.completionReview?.siteVisit;
              const isSiteVisitAction =
                siteVisit !== undefined && siteVisit.status !== "complete";
              return {
                _id: String(milestone._id),
                actionLabel: isSiteVisitAction
                  ? "Manage site visit"
                  : "Review milestone",
                body: isSiteVisitAction
                  ? "Complete field verification and return a recommendation."
                  : "Review the completion package and record the next decision.",
                createdAt: milestone.updatedAt,
                entityLabel: `${build.buildName} · ${milestone.name}`,
                entityType: isSiteVisitAction ? "siteVisit" : "milestone",
                href: isSiteVisitAction
                  ? `/backoffice/site-visits?buildId=${build._id}&milestone=${milestone.key}`
                  : `/backoffice/builds/${build._id}?milestone=${milestone.key}`,
                resolutionMode: "domain" as const,
                sourceLabel: "Builder workspace",
                title: isSiteVisitAction
                  ? "Site visit requires follow-up"
                  : "Milestone completion awaiting review",
              };
            }),
        ]
      : [];
    return {
      appPermissions,
      build,
      builderContact,
      capitalPlan: (() => {
        const capitalPlan = latestBuildCapitalPlan(capitalPlans);
        return capitalPlan
          ? {
              ...capitalPlan,
              borrowerStartingCashCents:
                resolveBorrowerStartingCashCents(capitalPlan),
            }
          : null;
      })(),
      displayId: productionBuildDisplayId(build),
      viewerBuildRoles:
        viewerBuildAccess?.roles ??
        (isBackoffice(auth.roles)
          ? auth.roles
          : appPermissions.role === "owner"
            ? ["builder"]
            : appPermissions.role === "staff"
              ? ["builder-staff"]
              : []),
      documents: await withBuildDocumentStorageUrls(
        ctx,
        buildDocuments,
        ACTIVE_BUILD_DOCUMENT_URL_CAP,
      ),
      drawFunding: {
        approvedMilestoneCents: drawFunding.approvedMilestoneCents,
        attributionShortfallCents: drawFunding.attributionShortfallCents,
        availableCents: drawFunding.availableCents,
        facilityCents: drawFunding.facilityCents,
        legacyUnattributedRequestCents:
          drawFunding.legacyUnattributedRequestCents,
        legacyUnattributedRequestCount:
          drawFunding.legacyUnattributedRequestCount,
        requiresAttributionMigration: drawFunding.requiresAttributionMigration,
        reservedCents: drawFunding.reservedCents,
        sources: drawFunding.sources.map(({ buildMilestoneId, ...source }) => ({
          ...source,
          buildMilestoneId: String(buildMilestoneId),
        })),
        unlockedCents: drawFunding.unlockedCents,
      },
      draws: canUseAppPermission(appPermissions, "draw", "view")
        ? (drawRequests as Doc<"activeBuildDrawRequests">[])
            .slice()
            .sort((a, b) => b.createdAt - a.createdAt)
            .map((request, index) => ({
              _id: request._id,
              amountCents: request.amountCents,
              displayId: request.displayId,
              drawKey: request.requestKey,
              label: request.label,
              milestoneKey: undefined,
              ...(request.note &&
              (canViewLenderDrawNotes ||
                request.requestedByWorkosUserId === auth.subject)
                ? { note: request.note }
                : {}),
              order: index + 1,
              plannedDrawKey: request.plannedDrawKey,
              ...(canViewLenderDrawNotes
                ? {
                    operationsRecommendationNote:
                      request.operationsRecommendationNote,
                    operationsReviewStartedAt: request.operationsReviewStartedAt,
                    readyForAdminAt: request.readyForAdminAt,
                  }
                : {}),
              releaseDate: request.releaseDate,
              releasedAt: request.releasedAt,
              ...(canViewLenderDrawNotes
                ? { releaseNote: request.releaseNote }
                : {}),
              requestedAt: request.requestedAt,
              ...(canViewLenderDrawNotes
                ? {
                    requestNote: request.note,
                    requestReviewNote: request.reviewNote,
                  }
                : request.requestedByWorkosUserId === auth.subject &&
                    request.note
                  ? { requestNote: request.note }
                  : {}),
              reviewedByWorkosUserId: request.reviewedByWorkosUserId,
              nextAction:
                request.status === "rejected"
                  ? "Correct the request and submit it again for review."
                  : request.status === "approved"
                    ? "Lender Admin can release the approved funds."
                    : request.status === "requested"
                      ? "Lender Operations must review this request."
                      : request.status === "released"
                        ? "Confirm receipt and report any settlement discrepancy."
                        : undefined,
              reviewedAt: request.reviewedAt,
              sourceAllocations:
                drawAllocationsByRequest.get(String(request._id)) ?? [],
              status: activeBuildDrawCanonicalStatus(request.status),
              timingDay: 0,
              workOrderKey: activeBuildDrawWorkOrderKey(request),
              withdrawnAt: request.withdrawnAt,
              withdrawalNote: request.withdrawalNote,
            }))
        : [],
      plannedDraws: canUseAppPermission(appPermissions, "draw", "view")
        ? (plannedDraws as Doc<"plannedDrawScheduleRows">[])
            .slice()
            .sort((a, b) => a.order - b.order)
            .map((draw) => {
              if (canViewLenderDrawNotes) {
                return draw;
              }
              const {
                releaseNote: _releaseNote,
                requestNote: _requestNote,
                requestReviewNote: _requestReviewNote,
                ...safeDraw
              } = draw;
              return safeDraw;
            })
        : [],
      evidenceAssets: canUseAppPermission(appPermissions, "evidence", "view")
        ? await withBuildEvidenceAssetStorageUrls(
            ctx,
            buildEvidenceAssets,
            ACTIVE_BUILD_EVIDENCE_URL_CAP,
          )
        : [],
      budgetRevisionRequests: (
        budgetRevisionRequests as Doc<"activeBuildBudgetRevisionRequests">[]
      )
        .sort((a, b) => b.createdAt - a.createdAt)
        .map((request) => ({
          _id: request._id,
          approvedCapitalPlanId: request.approvedCapitalPlanId,
          baseVersion: request.baseVersion,
          createdAt: request.createdAt,
          priorState: request.priorState,
          reason: request.reason,
          requestedByWorkosUserId: request.requestedByWorkosUserId,
          requestedPayload: request.requestedPayload,
          reviewNote: request.reviewNote,
          reviewedAt: request.reviewedAt,
          reviewerWorkosUserId: request.reviewerWorkosUserId,
          status: request.status,
          updatedAt: request.updatedAt,
          varianceCents: request.varianceCents,
        })),
      facilityChangeRequests: (
        facilityChangeRequests as Doc<"activeBuildFacilityChangeRequests">[]
      )
        .sort((a, b) => b.createdAt - a.createdAt)
        .map((request) => ({
          _id: request._id,
          createdAt: request.createdAt,
          priorState: request.priorState,
          reason: request.reason,
          requestedByWorkosUserId: request.requestedByWorkosUserId,
          requestedPayload: request.requestedPayload,
          requestType: request.requestType,
          reviewNote: request.reviewNote,
          reviewedAt: request.reviewedAt,
          reviewerWorkosUserId: request.reviewerWorkosUserId,
          status: request.status,
          updatedAt: request.updatedAt,
        })),
      auditEvents: mappedAuditEvents,
      availableContractors: canUseAppPermission(
        appPermissions,
        "contractor",
        "view",
      )
        ? contractorProfiles
            .filter(
              (contractor) =>
                !attachedContractorIds.has(String(contractor._id)),
            )
            .map((contractor) => ({
              _id: contractor._id,
              city: contractor.city,
              defaultPayRateCents: contractor.defaultPayRateCents,
              defaultPayRateUnit: contractor.defaultPayRateUnit ?? "hour",
              email: contractor.email,
              name: contractor.name,
              onboardingStatus:
                contractor.onboardingStatus ??
                (contractor.accountWorkosUserId
                  ? "account_linked"
                  : "profile_only"),
              skills: contractor.trades,
              trades: contractor.trades,
            }))
        : [],
      contractors: canUseAppPermission(appPermissions, "contractor", "view")
        ? buildContractorAssignments
            .map((assignment) => {
              const contractor = contractorById.get(
                String(assignment.contractorId),
              );
              if (!contractor) {
                return null;
              }
              const contractorMilestoneAssignments =
                buildMilestoneContractorAssignments.filter(
                  (milestoneAssignment) =>
                    milestoneAssignment.contractorId === contractor._id &&
                    milestoneAssignment.status !== "removed",
                );
              const hasPendingAcknowledgement =
                contractorMilestoneAssignments.length > 0 &&
                contractorMilestoneAssignments.some((milestoneAssignment) => {
                  const acknowledgement =
                    acknowledgementByMilestoneAssignmentId.get(
                      String(milestoneAssignment._id),
                    );
                  return (
                    !acknowledgement ||
                    acknowledgement.state === "pending_acknowledgement" ||
                    acknowledgement.state === "clarification_requested" ||
                    acknowledgement.state === "scope_disputed"
                  );
                });
              const onboardingStatus =
                contractor.onboardingStatus ??
                (contractor.accountWorkosUserId
                  ? "account_linked"
                  : "profile_only");
              const lifecycleState = contractor.accountWorkosUserId
                ? hasPendingAcknowledgement
                  ? "acknowledgement_pending"
                  : "active"
                : onboardingStatus === "invited"
                  ? "invited"
                  : contractorMilestoneAssignments.length > 0
                    ? "assigned"
                    : "attached";
              return {
                _id: String(assignment._id),
                agreedRateCents:
                  assignment.agreedRateCents ?? contractor.defaultPayRateCents,
                agreedRateUnit:
                  assignment.agreedRateUnit ??
                  contractor.defaultPayRateUnit ??
                  "hour",
                contractorId: contractor._id,
                city: contractor.city,
                email: contractor.email,
                hourlyRateCents: contractor.defaultPayRateCents,
                lifecycleState,
                onboardingStatus,
                payRateCents:
                  assignment.agreedRateCents ?? contractor.defaultPayRateCents,
                payRateUnit:
                  assignment.agreedRateUnit ??
                  contractor.defaultPayRateUnit ??
                  "hour",
                name: contractor.name,
                role: assignment.role,
                trades: contractor.trades,
              };
            })
            .filter(Boolean)
        : [],
      milestoneContractorAssignments: canUseAppPermission(
        appPermissions,
        "contractor",
        "view",
      )
        ? buildMilestoneContractorAssignments
            .map((assignment) => {
              const contractor = contractorById.get(
                String(assignment.contractorId),
              );
              if (!contractor) {
                return null;
              }
              return {
                _id: assignment._id,
                actualCostCents: assignment.actualCostCents,
                actualHours: assignment.actualHours,
                agreedRateCents: assignment.agreedRateCents,
                agreedRateUnit: assignment.agreedRateUnit,
                contractorId: assignment.contractorId,
                contractor: {
                  _id: contractor._id,
                  name: contractor.name,
                  trades: contractor.trades,
                },
                costNotes: assignment.costNotes,
                estimatedCostCents: assignment.estimatedCostCents,
                estimatedHours: assignment.estimatedHours,
                milestoneKey: assignment.milestoneKey,
                postHoc: assignment.postHoc,
                role: assignment.role,
                status: assignment.status,
                submilestoneKey: assignment.submilestoneKey,
              };
            })
            .filter(Boolean)
        : [],
      quickActionEvents,
      loanFacility:
        (loanFacilities as Doc<"loanFacilities">[]).find(
          (facility) =>
            facility.facilityKind === undefined ||
            facility.facilityKind === "construction",
        ) ?? null,
      loanFacilities: [...loanFacilities].sort((a, b) => {
        const aPrimary =
          a.facilityKind === undefined || a.facilityKind === "construction";
        const bPrimary =
          b.facilityKind === undefined || b.facilityKind === "construction";
        return Number(bPrimary) - Number(aPrimary) || a.createdAt - b.createdAt;
      }),
      milestones: canUseAppPermission(appPermissions, "milestone", "view")
        ? hydratedMilestones.map((milestone) => ({
            ...milestone,
            ...activeBuildMilestoneSummary({
              assignments: buildMilestoneContractorAssignments,
              includeSubmilestones: canUseAppPermission(
                appPermissions,
                "submilestone",
                "view",
              ),
              milestone,
              milestones: hydratedMilestones,
              submilestones: hydratedSubmilestones,
            }),
          }))
        : [],
      sitePhotos: canUseAppPermission(appPermissions, "evidence", "view")
        ? await productionSitePhotosForBuild(ctx, build, buildEvidenceAssets)
        : [],
      siteVisits: canUseAppPermission(appPermissions, "evidence", "view")
        ? buildSiteVisits
        : [],
      submilestones: canUseAppPermission(appPermissions, "submilestone", "view")
        ? hydratedSubmilestones
        : [],
      costItems: canUseAppPermission(appPermissions, "material", "view")
        ? costItems
        : [],
    };
  })
  .public();
