/**
 * Production proposals active build site visits bounded-context implementation.
 * The parent facade re-exports its handlers to preserve production_proposals function references.
 */
import { v } from "convex/values";
import { authenticatedMutation, type RoleSlug } from "../authz";
import { appendActiveSubmilestoneEvidenceAssetToDraft } from "../build_submilestone_evidence";
import { evidenceLocationMateriallyChanged, normalizeOperationalIdempotencyKey, operationalRequestFingerprint } from "../build_operational_idempotency";
import { createSiteVisitRecoveryReference, resolveSiteVisitGeofenceAttempt, validateSiteVisitReplacementRequest, validateSiteVisitReportSubmission, validateSiteVisitSubmissionContext } from "../demo_site_visit_tokens";
import { publicMutation, publicQuery } from "../fluent";
import { validateCanonicalSiteVisitCompletion } from "../lender_portal_phase5";
import { type Doc } from "../types";
import { getActiveBuildMilestoneOrThrow, assertActiveBuildPlanningTargetActive } from "./active_planning.js";
import { authorizeActiveBuildOrThrow, requireBackofficeActiveBuildWrite } from "./authorization_core.js";
import { siteVisitLocationAttemptValidator, siteVisitPrerequisiteExceptionValidator } from "./brokerage_site_visits.js";
import { requireActiveBuildAppPermission } from "./builder_staff_access.js";
import { insertContractorQualityRating } from "./contractor_active_helpers.js";
import { normalizeOptionalString, activeBuildCompletionReviewWithSiteVisit } from "./contractor_policy_helpers.js";
import { contractorQualityRatingInput } from "./contracts_workflow.js";
import { upsertBackofficeSiteVisitReportDeliveries, upsertBackofficeUnassignedEvidenceDeliveries } from "./notification_delivery_helpers.js";
import { writeActiveBuildEvent } from "./proposal_copy_audit.js";
import { getActiveBuildSiteVisitTokenState } from "./site_visit_helpers.js";

export const recordActiveBuildSiteVisit = authenticatedMutation
  .input({
    buildId: v.id("activeBuilds"),
    milestoneKey: v.string(),
    note: v.optional(v.string()),
    status: v.union(v.literal("complete"), v.literal("cancelled")),
    visitId: v.string(),
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
    await requireActiveBuildAppPermission(ctx, auth, "evidence", "update");
    await requireActiveBuildAppPermission(ctx, auth, "milestone", "update");
    const milestone = await getActiveBuildMilestoneOrThrow(
      ctx,
      args.buildId,
      args.milestoneKey,
    );
    assertActiveBuildPlanningTargetActive(milestone);
    const visit = await ctx.db
      .query("buildSiteVisits")
      .withIndex("by_visit", (q) => q.eq("visitId", args.visitId))
      .unique();
    if (!visit || visit.buildId !== args.buildId) {
      throw new Error("Production active-build site visit request not found.");
    }
    const now = Date.now();
    const note = args.note?.trim();
    const siteVisitReviewContext =
      args.status === "complete"
        ? await validateCanonicalSiteVisitCompletion(ctx, {
            milestoneId: milestone._id,
            report: note ?? "",
            visitId: visit._id,
          })
        : null;
    const statusChanged = visit.status !== args.status;
    const collaborationEventRevision = statusChanged
      ? (visit.collaborationEventRevision ?? 1) + 1
      : visit.collaborationEventRevision;
    const siteVisit = {
      ...(visit.note ? { note: visit.note } : {}),
      ...(visit.submilestoneId ? { submilestoneId: visit.submilestoneId } : {}),
      ...(note
        ? { recordNote: note, recordNoteFormat: "plain_text" as const }
        : {}),
      completedAt:
        args.status === "complete"
          ? new Date(now).toISOString()
          : visit.completedAt,
      requestedAt: visit.requestedAt,
      requestedDay: visit.requestedDay,
      status: args.status,
      tokenExpiresAt: visit.tokenExpiresAt,
      url: visit.url,
      visitId: visit.visitId,
    };
    const completionReview = activeBuildCompletionReviewWithSiteVisit(
      milestone.completionReview,
      siteVisit,
      new Date(now).toISOString(),
    );
    await ctx.db.patch(visit._id, {
      collaborationEventRevision,
      completedAt: siteVisit.completedAt,
      ...(args.status === "complete"
        ? {
            completedByGroup: "backoffice" as const,
            completedByRole: "admin" as const,
            completedByWorkosUserId: auth.subject,
          }
        : {}),
      recordNote: note,
      recordNoteFormat: note ? ("plain_text" as const) : undefined,
      status: args.status,
      updatedAt: now,
    });
    await ctx.db.patch(milestone._id, {
      completionReview,
      updatedAt: now,
    });
    await writeActiveBuildEvent(ctx, {
      auth,
      build: auth.build,
      command: "recordActiveBuildSiteVisit",
      entityId: String(visit._id),
      entityType: "buildSiteVisit",
      eventType: "active_build.site_visit.recorded",
      newState: JSON.stringify({
        ...siteVisit,
        ...(siteVisitReviewContext
          ? {
              aclChanges: {
                completedByGroup: "backoffice",
                completedByRole: "admin",
                completedByWorkosUserId: auth.subject,
              },
              currentCycleId: siteVisitReviewContext.currentCycleId,
              currentCycleNumber: siteVisitReviewContext.currentCycleNumber,
              policy: siteVisitReviewContext.policy,
              qualifyingEvidenceReferences:
                siteVisitReviewContext.qualifyingEvidenceReferences,
            }
          : {}),
      }),
      priorState: JSON.stringify(visit),
      reason: note,
      warnings: siteVisitReviewContext?.warnings ?? [],
    });
    return null;
  })
  .public();

export const getActiveBuildSiteVisitByToken = publicQuery
  .input({ buildId: v.string(), token: v.string() })
  .returns(v.any())
  .handler(
    async (ctx, args) =>
      await getActiveBuildSiteVisitTokenState(ctx, args.buildId, args.token),
  )
  .public();

export const requestActiveBuildSiteVisitReplacementLink = publicMutation
  .input({
    buildId: v.string(),
    reason: v.string(),
    token: v.string(),
  })
  .returns(v.object({ reference: v.string(), requested: v.literal(true) }))
  .handler(async (ctx, args) => {
    const state = await getActiveBuildSiteVisitTokenState(
      ctx,
      args.buildId,
      args.token,
    );
    const tokenState =
      state.reason === "consumed"
        ? ("consumed" as const)
        : state.reason === "expired"
          ? ("expired" as const)
          : ("active" as const);
    const request = validateSiteVisitReplacementRequest({
      reason: args.reason,
      tokenState,
    });
    const buildId = ctx.db.normalizeId("activeBuilds", args.buildId);
    if (!buildId) {
      throw new Error("Site visit recovery is unavailable for this link.");
    }
    const [build, visit] = await Promise.all([
      ctx.db.get(buildId),
      ctx.db
        .query("buildSiteVisits")
        .withIndex("by_visit", (q) => q.eq("visitId", args.token))
        .unique(),
    ]);
    if (!(build && visit) || visit.buildId !== buildId) {
      throw new Error("Site visit recovery is unavailable for this link.");
    }

    const requestedAt = Date.now();
    const reference = createSiteVisitRecoveryReference(crypto.randomUUID());
    await ctx.db.insert("siteVisitLinkRecoveryRequests", {
      brokerageId: build.brokerageId,
      buildId: String(buildId),
      organizationId: build.organizationId,
      originalVisitId: visit.visitId,
      reason: request.reason,
      reference,
      requestedAt,
      source: "production",
      status: "pending",
      tokenState: request.tokenState,
    });
    await ctx.db.insert("auditEvents", {
      actorRoles: ["contractor"],
      actorWorkosUserId: "tokenized_site_visitor",
      brokerageId: build.brokerageId,
      buildId: build._id,
      command: "requestActiveBuildSiteVisitReplacementLink",
      createdAt: requestedAt,
      entityId: String(visit._id),
      entityType: "buildSiteVisit",
      eventType: "active_build.site_visit.replacement_link_requested",
      resourceType: "siteVisit",
      newState: JSON.stringify({
        reference,
        ...(visit.submilestoneId
          ? { submilestoneId: visit.submilestoneId }
          : {}),
        status: "pending",
        tokenState: request.tokenState,
      }),
      organizationId: build.organizationId,
      reason: request.reason,
      warnings: [],
    });
    await ctx.db.insert("eventOutbox", {
      brokerageId: build.brokerageId,
      createdAt: requestedAt,
      eventType: "active_build.site_visit.replacement_link_requested",
      organizationId: build.organizationId,
      payloadPreview: `Replacement site-visit link requested (${reference}).`,
      relatedEntityId: visit._id,
      relatedEntityType: "buildSiteVisit",
      status: "pending",
    });
    return { reference, requested: true as const };
  })
  .public();

export const generateActiveBuildSiteVisitUploadUrl = publicMutation
  .input({ buildId: v.string(), token: v.string() })
  .returns(v.string())
  .handler(async (ctx, args) => {
    const state = await getActiveBuildSiteVisitTokenState(
      ctx,
      args.buildId,
      args.token,
    );
    if (!state.available) {
      throw new Error("Site visit token is not active.");
    }
    return await ctx.storage.generateUploadUrl();
  })
  .public();

export const registerActiveBuildSiteVisitFile = publicMutation
  .input({
    buildId: v.string(),
    clientEvidenceId: v.string(),
    contractorIds: v.optional(v.array(v.id("contractorProfiles"))),
    fileName: v.string(),
    mimeType: v.string(),
    sizeBytes: v.number(),
    storageId: v.id("_storage"),
    targetMilestoneKey: v.optional(v.string()),
    targetSubmilestoneKey: v.optional(v.string()),
    token: v.string(),
    locationAttempt: v.optional(siteVisitLocationAttemptValidator),
  })
  .returns(
    v.union(
      v.object({
        assetId: v.id("buildEvidenceAssets"),
        status: v.literal("registered"),
      }),
      v.object({
        assetId: v.id("buildEvidenceAssets"),
        storageDisposition: v.union(
          v.literal("reused_existing_upload"),
          v.literal("preserved_unowned_upload"),
        ),
        status: v.literal("replayed"),
      }),
      v.object({
        reason: v.literal("idempotency_conflict"),
        storageDisposition: v.literal("preserved_unowned_upload"),
        status: v.literal("rejected"),
      }),
    ),
  )
  .handler(async (ctx, args) => {
    const state = await getActiveBuildSiteVisitTokenState(
      ctx,
      args.buildId,
      args.token,
      { allowUnassignedTarget: true },
    );
    if (!state.available) {
      throw new Error("Site visit token is not active.");
    }
    const buildId = ctx.db.normalizeId("activeBuilds", args.buildId);
    if (!buildId) {
      throw new Error("Site visit token is invalid.");
    }
    const build = await ctx.db.get(buildId);
    const visit = await ctx.db
      .query("buildSiteVisits")
      .withIndex("by_visit", (q) => q.eq("visitId", args.token))
      .unique();
    if (!(build && visit) || visit.buildId !== buildId) {
      throw new Error("Site visit token is invalid.");
    }
    const visitMilestone = await ctx.db.get(visit.buildMilestoneId);
    const clientEvidenceId = normalizeOperationalIdempotencyKey(
      args.clientEvidenceId,
      "Site Visit Evidence client ID",
    );
    const fileName = args.fileName.trim();
    const mimeType = args.mimeType.trim().toLowerCase();
    if (!fileName || !mimeType) {
      throw new Error(
        "Site Visit Evidence file name and MIME type are required.",
      );
    }
    const sizeBytes = Math.max(0, Math.round(args.sizeBytes));
    const targetMilestoneKey = normalizeOptionalString(args.targetMilestoneKey);
    const targetSubmilestoneKey = normalizeOptionalString(
      args.targetSubmilestoneKey,
    );
    const resolvedLocationAttempt = args.locationAttempt
      ? resolveSiteVisitGeofenceAttempt({
          locationAttempt: args.locationAttempt,
          siteLatitude: build.locationLatitude,
          siteLongitude: build.locationLongitude,
        })
      : undefined;
    const clientEvidenceFingerprint = await operationalRequestFingerprint({
      clientEvidenceId,
      contractorIds: (args.contractorIds ?? []).map(String).sort(),
      fileName,
      locationAttempt: resolvedLocationAttempt ?? null,
      mimeType,
      sizeBytes,
      targetMilestoneKey: targetMilestoneKey ?? null,
      targetSubmilestoneKey: targetSubmilestoneKey ?? null,
    });
    const existing = await ctx.db
      .query("buildEvidenceAssets")
      .withIndex("by_site_visit_client", (q) =>
        q.eq("siteVisitId", visit._id).eq("clientEvidenceId", clientEvidenceId),
      )
      .unique();
    if (existing) {
      if (existing.clientEvidenceFingerprint === clientEvidenceFingerprint) {
        return {
          assetId: existing._id,
          status: "replayed" as const,
          storageDisposition:
            existing.storageId === args.storageId
              ? ("reused_existing_upload" as const)
              : ("preserved_unowned_upload" as const),
        };
      }
      return {
        reason: "idempotency_conflict" as const,
        status: "rejected" as const,
        storageDisposition: "preserved_unowned_upload" as const,
      };
    }
    let targetMilestone: Doc<"buildMilestones"> | undefined;
    if (targetMilestoneKey) {
      const targetMilestones = (await ctx.db
        .query("buildMilestones")
        .withIndex("by_build_key", (query) =>
          query.eq("buildId", buildId).eq("key", targetMilestoneKey),
        )
        .collect()) as Doc<"buildMilestones">[];
      targetMilestone =
        targetMilestones.find(
          (milestone) => milestone.planningState !== "superseded",
        ) ?? targetMilestones[0];
    } else {
      targetMilestone = visitMilestone ?? undefined;
    }
    const activeTargetMilestone =
      targetMilestone && targetMilestone.planningState !== "superseded"
        ? targetMilestone
        : undefined;
    let targetSubmilestone: Doc<"buildSubmilestones"> | undefined;
    if (activeTargetMilestone && targetSubmilestoneKey) {
      targetSubmilestone = (
        (await ctx.db
          .query("buildSubmilestones")
          .withIndex("by_milestone", (query) =>
            query.eq("buildMilestoneId", activeTargetMilestone._id),
          )
          .collect()) as Doc<"buildSubmilestones">[]
      ).find(
        (submilestone) =>
          submilestone.key === targetSubmilestoneKey &&
          submilestone.planningState !== "superseded",
      );
    }
    const evidenceTargetUnassigned =
      !activeTargetMilestone ||
      Boolean(targetSubmilestoneKey && !targetSubmilestone);
    const now = Date.now();
    const assetId = await ctx.db.insert("buildEvidenceAssets", {
      brokerageId: build.brokerageId,
      buildId,
      clientEvidenceFingerprint,
      clientEvidenceId,
      collaborationEventRevision: 1,
      contractorIds: args.contractorIds,
      createdAt: now,
      evidenceKey: `site-visit-${args.token}-${clientEvidenceId}`,
      fileName,
      label: fileName,
      locationVerified: resolvedLocationAttempt?.verified ?? false,
      ...(resolvedLocationAttempt?.accuracyMeters === undefined
        ? {}
        : { locationAccuracyMeters: resolvedLocationAttempt.accuracyMeters }),
      ...(resolvedLocationAttempt?.attemptedAt === undefined
        ? {}
        : { locationAttemptedAt: resolvedLocationAttempt.attemptedAt }),
      ...(resolvedLocationAttempt?.distanceMeters === undefined
        ? {}
        : { locationDistanceMeters: resolvedLocationAttempt.distanceMeters }),
      ...(resolvedLocationAttempt?.failureReason
        ? { locationFailureReason: resolvedLocationAttempt.failureReason }
        : {}),
      ...(resolvedLocationAttempt?.geofenceRadiusMeters === undefined
        ? {}
        : {
            locationGeofenceRadiusMeters:
              resolvedLocationAttempt.geofenceRadiusMeters,
          }),
      milestoneKey: targetMilestoneKey ?? visit.milestoneKey,
      mimeType,
      organizationId: build.organizationId,
      proposalId: build.proposalId,
      sizeBytes,
      siteVisitId: visit._id,
      source: `active_build_site_visit:${args.token}:${targetSubmilestoneKey ?? ""}`,
      storageId: args.storageId,
      ...(targetSubmilestone ? { submilestoneKey: targetSubmilestone.key } : {}),
      tag: "Site visit evidence",
      updatedAt: now,
    });
    if (visitMilestone && visitMilestone.planningState !== "superseded") {
      await ctx.db.patch(visit.buildMilestoneId, {
        evidenceState: "Site visit evidence submitted",
        updatedAt: now,
      });
    }
    const persistedAsset = await ctx.db.get(assetId);
    if (!persistedAsset) {
      throw new Error("Submitted Site Visit Evidence became unavailable.");
    }
    if (targetSubmilestone && activeTargetMilestone) {
      await appendActiveSubmilestoneEvidenceAssetToDraft(ctx, {
        actorRoles: ["contractor"],
        actorWorkosUserId: "tokenized_site_visitor",
        asset: persistedAsset,
        build,
        milestone: activeTargetMilestone,
        sourceKind: "site_visit",
        submilestone: targetSubmilestone,
      });
    }
    if (evidenceTargetUnassigned) {
      const targetLabel = [
        targetMilestoneKey ?? visit.milestoneKey,
        targetSubmilestoneKey,
      ]
        .filter(Boolean)
        .join(" / ");
      await upsertBackofficeUnassignedEvidenceDeliveries(ctx, {
        asset: persistedAsset,
        build,
        targetLabel,
      });
    }
    return { assetId, status: "registered" as const };
  })
  .public();

export const markActiveBuildSiteVisitTokenOpened = publicMutation
  .input({ buildId: v.string(), token: v.string() })
  .returns(v.null())
  .handler(async (ctx, args) => {
    const buildId = ctx.db.normalizeId("activeBuilds", args.buildId);
    if (!buildId) {
      return null;
    }
    const visit = await ctx.db
      .query("buildSiteVisits")
      .withIndex("by_visit", (q) => q.eq("visitId", args.token))
      .unique();
    if (!visit || visit.buildId !== buildId || visit.status !== "requested") {
      return null;
    }
    await ctx.db.patch(visit._id, {
      tokenOpenedAt: visit.tokenOpenedAt ?? Date.now(),
      updatedAt: Date.now(),
    });
    return null;
  })
  .public();

export const submitActiveBuildTokenizedSiteVisitReport = publicMutation
  .input({
    buildId: v.string(),
    completionObserved: v.boolean(),
    contractorRatings: v.optional(v.array(contractorQualityRatingInput)),
    locationAttempt: siteVisitLocationAttemptValidator,
    missingPrerequisites: v.array(
      v.union(v.literal("permit"), v.literal("site_plan")),
    ),
    prerequisiteException: v.optional(siteVisitPrerequisiteExceptionValidator),
    recommendedOutcome: v.string(),
    reportNotes: v.string(),
    token: v.string(),
  })
  .returns(v.null())
  .handler(async (ctx, args) => {
    const state = await getActiveBuildSiteVisitTokenState(
      ctx,
      args.buildId,
      args.token,
    );
    if (!state.available) {
      throw new Error("Site visit token is not active.");
    }
    const buildId = ctx.db.normalizeId("activeBuilds", args.buildId);
    if (!buildId) {
      throw new Error("Site visit token is invalid.");
    }
    const build = await ctx.db.get(buildId);
    const visit = await ctx.db
      .query("buildSiteVisits")
      .withIndex("by_visit", (q) => q.eq("visitId", args.token))
      .unique();
    if (!(build && visit) || visit.buildId !== buildId) {
      throw new Error("Site visit token is invalid.");
    }
    const visitMilestone = await ctx.db.get(visit.buildMilestoneId);
    if (!visitMilestone) {
      throw new Error("Site visit milestone was not found.");
    }
    assertActiveBuildPlanningTargetActive(visitMilestone);
    const visitEvidence = (
      await ctx.db
        .query("buildEvidenceAssets")
        .withIndex("by_build", (q) => q.eq("buildId", buildId))
        .collect()
    ).filter(
      (asset) =>
        asset.siteVisitId === visit._id ||
        asset.source.startsWith(`active_build_site_visit:${args.token}:`),
    );
    const validatedReport = validateSiteVisitReportSubmission({
      compressedPackageBytes: visitEvidence.reduce(
        (sum, asset) => sum + asset.sizeBytes,
        0,
      ),
      reportNotes: args.reportNotes,
      uploadedEvidenceCount: visitEvidence.length,
    });
    const reportNotes = validatedReport.reportNotes;
    const reportNotesText = validatedReport.reportNotesText;
    const permitDocuments = await ctx.db
      .query("buildDocuments")
      .withIndex("by_build_type", (q) =>
        q.eq("buildId", buildId).eq("documentType", "permit"),
      )
      .collect();
    const missingPrerequisites = [
      ...args.missingPrerequisites,
      ...(permitDocuments.length === 0 ? (["permit"] as const) : []),
    ];
    const submissionContext = validateSiteVisitSubmissionContext({
      locationAttempt: resolveSiteVisitGeofenceAttempt({
        locationAttempt: args.locationAttempt,
        siteLatitude: build.locationLatitude,
        siteLongitude: build.locationLongitude,
      }),
      missingPrerequisites,
      prerequisiteException: args.prerequisiteException,
    });
    const unverifiedEvidence: Array<{
      asset: Doc<"buildEvidenceAssets">;
      revision: number;
    }> = [];
    for (const asset of visitEvidence) {
      const locationChanged = evidenceLocationMateriallyChanged(
        asset,
        submissionContext.locationAttempt,
      );
      const collaborationEventRevision = locationChanged
        ? (asset.collaborationEventRevision ?? 1) + 1
        : asset.collaborationEventRevision;
      const evidencePatch = {
        collaborationEventRevision,
        locationVerified: submissionContext.locationAttempt.verified,
        ...(submissionContext.locationAttempt.accuracyMeters === undefined
          ? {}
          : {
              locationAccuracyMeters:
                submissionContext.locationAttempt.accuracyMeters,
            }),
        ...(submissionContext.locationAttempt.attemptedAt === undefined
          ? {}
          : {
              locationAttemptedAt:
                submissionContext.locationAttempt.attemptedAt,
            }),
        ...(submissionContext.locationAttempt.distanceMeters === undefined
          ? {}
          : {
              locationDistanceMeters:
                submissionContext.locationAttempt.distanceMeters,
            }),
        locationFailureReason: submissionContext.locationAttempt.failureReason,
        ...(submissionContext.locationAttempt.geofenceRadiusMeters === undefined
          ? {}
          : {
              locationGeofenceRadiusMeters:
                submissionContext.locationAttempt.geofenceRadiusMeters,
            }),
        siteVisitId: visit._id,
        updatedAt: Date.now(),
      };
      await ctx.db.patch(asset._id, evidencePatch);
      if (!submissionContext.locationAttempt.verified && locationChanged) {
        unverifiedEvidence.push({
          asset: { ...asset, ...evidencePatch },
          revision: collaborationEventRevision ?? 1,
        });
      }
    }
    const milestone = visitMilestone;
    const now = Date.now();
    const collaborationEventRevision =
      (visit.collaborationEventRevision ?? 1) + 1;
    const completedAt = new Date(now).toISOString();
    const siteVisit = {
      ...(visit.note ? { note: visit.note } : {}),
      ...(visit.submilestoneId ? { submilestoneId: visit.submilestoneId } : {}),
      completedAt,
      locationAttempt: submissionContext.locationAttempt,
      missingPrerequisites: submissionContext.missingPrerequisites,
      prerequisiteException: submissionContext.prerequisiteException,
      recordNote: reportNotes,
      recordNoteFormat: "html" as const,
      recommendedOutcome: args.recommendedOutcome,
      requestedAt: visit.requestedAt,
      requestedDay: visit.requestedDay,
      status: args.completionObserved ? "complete" : "cancelled",
      tokenExpiresAt: visit.tokenExpiresAt,
      url: visit.url,
      visitId: visit.visitId,
    };
    const completionReview = activeBuildCompletionReviewWithSiteVisit(
      milestone.completionReview,
      siteVisit,
      completedAt,
    );
    await ctx.db.patch(visit._id, {
      collaborationEventRevision,
      completedAt,
      locationAttempt: submissionContext.locationAttempt,
      missingPrerequisites: submissionContext.missingPrerequisites,
      prerequisiteException: submissionContext.prerequisiteException,
      recordNote: reportNotes,
      recordNoteFormat: "html" as const,
      status: args.completionObserved ? "complete" : "cancelled",
      tokenConsumedAt: now,
      updatedAt: now,
    });
    await ctx.db.patch(milestone._id, {
      completionReview,
      evidenceState: "Site visit report submitted",
      status:
        completionReview.status === "approved" ||
        milestone.status !== "complete"
          ? milestone.status
          : "in_progress",
      updatedAt: now,
    });
    const tokenAuth = {
      brokerage: { _id: build.brokerageId },
      build,
      proposal: { _id: build.proposalId },
      roles: ["contractor"] as RoleSlug[],
      subject: "tokenized_site_visitor",
    };
    for (const rating of args.contractorRatings ?? []) {
      await insertContractorQualityRating(ctx, {
        auth: tokenAuth as any,
        buildId,
        contractorId: rating.contractorId,
        milestoneKey: rating.milestoneKey ?? visit.milestoneKey,
        note: rating.note,
        rating: rating.rating,
        source: "site_visit",
        sourceEvidenceKey: rating.sourceEvidenceKey,
        sourceVisitId: rating.sourceVisitId ?? visit.visitId,
        submilestoneKey: rating.submilestoneKey,
        workosOrganizationId: build.organizationId,
      });
    }
    await ctx.db.insert("auditEvents", {
      actorRoles: ["contractor"],
      actorWorkosUserId: "tokenized_site_visitor",
      brokerageId: build.brokerageId,
      buildId: build._id,
      command: "submitActiveBuildTokenizedSiteVisitReport",
      createdAt: now,
      entityId: String(visit._id),
      entityType: "buildSiteVisit",
      eventType: "active_build.site_visit.token_report_submitted",
      resourceType: "siteVisit",
      newState: JSON.stringify(siteVisit),
      organizationId: build.organizationId,
      priorState: JSON.stringify(visit),
      reason: reportNotesText,
      warnings: submissionContext.locationAttempt.verified
        ? []
        : ["site_visit_location_unverified"],
    });
    await ctx.db.insert("eventOutbox", {
      brokerageId: build.brokerageId,
      createdAt: now,
      eventType: "active_build.site_visit.token_report_submitted",
      organizationId: build.organizationId,
      payloadPreview: JSON.stringify(siteVisit),
      relatedEntityId: build._id,
      relatedEntityType: "activeBuild",
      status: "pending",
    });
    await upsertBackofficeSiteVisitReportDeliveries(ctx, {
      build,
      milestone,
      reportNotes: reportNotesText,
      visit: { ...visit, ...siteVisit },
    });
    return null;
  })
  .public();
