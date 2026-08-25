import { type PaginationOptions, paginationOptsValidator } from "convex/server";
import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import {
  adminMutation,
  lenderOrganizationMutation,
  lenderOrganizationQuery,
  requireLenderOrganizationPermission,
} from "../authz";
import {
  lenderPortalSiteVisitCompletionPageValidator,
  lenderPortalSiteVisitCompletionResultValidator,
} from "../lender_portal_phase5_contracts";
import type { LenderPortalReviewGroup } from "../lender_portal_phase5_contracts";
import type { MutationCtx } from "../types";
import {
  EVIDENCE_REFERENCE_LIMIT,
  evidenceReferenceLimitError,
  idempotencyConflictError,
  lockedReviewRequirements,
  normalizeIdempotencyKey,
  recordValue,
  requireBackofficeTargetAccess,
  requireLenderBuildAccess,
  resolveReviewTarget,
  safeUnavailableError,
} from "./shared";
import type { ResolvedReviewTarget, ReviewCtx } from "./shared";

const completeSiteVisitInput = {
  expectedVisitUpdatedAt: v.number(),
  idempotencyKey: v.string(),
  milestoneId: v.id("buildMilestones"),
  report: v.string(),
  visitId: v.id("buildSiteVisits"),
};

export const listLenderMilestoneSiteVisitCompletions = lenderOrganizationQuery
  .input({
    milestoneId: v.id("buildMilestones"),
    paginationOpts: paginationOptsValidator,
  })
  .returns(lenderPortalSiteVisitCompletionPageValidator)
  .handler(async (ctx, args) => {
    const target = await resolveReviewTarget(ctx, {
      kind: "milestone",
      milestoneId: args.milestoneId,
    });
    if (target.kind !== "milestone") {
      throw safeUnavailableError();
    }
    await requireLenderBuildAccess(ctx, target.build);

    let hasCompletionPermission = true;
    try {
      await requireLenderOrganizationPermission(
        ctx,
        ctx.activeOrganization,
        "siteVisitReview"
      );
    } catch {
      hasCompletionPermission = false;
    }

    const visits = await ctx.db
      .query("buildSiteVisits")
      .withIndex("by_build_milestone", (query) =>
        query
          .eq("buildId", target.build._id)
          .eq("milestoneKey", target.record.key)
      )
      .order("desc")
      .paginate(args.paginationOpts);
    const page = [];
    for (const visit of visits.page) {
      if (
        visit.buildMilestoneId !== target.record._id ||
        visit.organizationId !== target.build.organizationId ||
        visit.brokerageId !== target.build.brokerageId
      ) {
        throw safeUnavailableError();
      }
      if (visit.status !== "requested") {
        continue;
      }
      const assets = await ctx.db
        .query("buildEvidenceAssets")
        .withIndex("by_site_visit", (query) =>
          query.eq("siteVisitId", visit._id)
        )
        .take(EVIDENCE_REFERENCE_LIMIT + 1);
      if (assets.length > EVIDENCE_REFERENCE_LIMIT) {
        throw evidenceReferenceLimitError();
      }
      const photos = assets.filter(
        (asset) =>
          asset.siteVisitId === visit._id &&
          asset.buildId === target.build._id &&
          asset.organizationId === target.build.organizationId &&
          asset.brokerageId === target.build.brokerageId &&
          asset.proposalId === target.build.proposalId &&
          asset.milestoneKey === target.record.key &&
          asset.mimeType.toLowerCase().startsWith("image/")
      );
      const completionBlocker = !hasCompletionPermission
        ? ("permission_required" as const)
        : photos.length === 0
          ? ("photo_required" as const)
          : null;
      page.push({
        canComplete: completionBlocker === null,
        completionBlocker,
        locationUnverifiedPhotoCount: photos.filter(
          (photo) => !photo.locationVerified
        ).length,
        photoCount: photos.length,
        requestedAt: visit.requestedAt,
        siteVisitId: visit._id,
        updatedAt: visit.updatedAt,
      });
    }
    return { ...visits, page };
  })
  .public();

export const completeBackofficeMilestoneSiteVisit = adminMutation
  .input({ ...completeSiteVisitInput, workosOrganizationId: v.string() })
  .returns(lenderPortalSiteVisitCompletionResultValidator)
  .handler(async (ctx, args) => {
    const target = await resolveReviewTarget(ctx, {
      kind: "milestone",
      milestoneId: args.milestoneId,
    });
    if (target.kind !== "milestone") {
      throw safeUnavailableError();
    }
    await requireBackofficeTargetAccess(ctx, target, args.workosOrganizationId);
    return await completeMilestoneSiteVisit(ctx, {
      actorRole: "admin",
      actorWorkosUserId: ctx.viewer.subject,
      expectedVisitUpdatedAt: args.expectedVisitUpdatedAt,
      group: "backoffice",
      idempotencyKey: args.idempotencyKey,
      report: args.report,
      target,
      visitId: args.visitId,
    });
  })
  .public();

export const completeLenderMilestoneSiteVisit = lenderOrganizationMutation
  .input(completeSiteVisitInput)
  .returns(lenderPortalSiteVisitCompletionResultValidator)
  .handler(async (ctx, args) => {
    const target = await resolveReviewTarget(ctx, {
      kind: "milestone",
      milestoneId: args.milestoneId,
    });
    if (target.kind !== "milestone") {
      throw safeUnavailableError();
    }
    await requireLenderBuildAccess(ctx, target.build);
    await requireLenderOrganizationPermission(
      ctx,
      ctx.activeOrganization,
      "siteVisitReview"
    );
    return await completeMilestoneSiteVisit(ctx, {
      actorRole: ctx.activeOrganization.roles.includes("lender-admin")
        ? "lender-admin"
        : "lender",
      actorWorkosUserId: ctx.activeOrganization.workosUserId,
      expectedVisitUpdatedAt: args.expectedVisitUpdatedAt,
      group: "lender",
      idempotencyKey: args.idempotencyKey,
      report: args.report,
      target,
      visitId: args.visitId,
    });
  })
  .public();

export async function validateCanonicalSiteVisitCompletion(
  ctx: MutationCtx,
  input: {
    milestoneId: Id<"buildMilestones">;
    report: string;
    visitId: Id<"buildSiteVisits">;
  }
) {
  const target = await resolveReviewTarget(ctx, {
    kind: "milestone",
    milestoneId: input.milestoneId,
  });
  if (target.kind !== "milestone") {
    throw safeUnavailableError();
  }
  const visit = await ctx.db.get(input.visitId);
  if (!visit) {
    throw safeUnavailableError();
  }
  const validation = await validateMilestoneSiteVisitCompletion(ctx, {
    report: input.report,
    target,
    visit,
  });
  return {
    currentCycleId: target.record.currentLenderPortalReviewCycleId ?? null,
    currentCycleNumber: target.record.currentLenderPortalReviewCycleNumber ?? 0,
    policy: await lockedReviewRequirements(ctx, target),
    qualifyingEvidenceReferences: validation.qualifyingPhotos.map((photo) => ({
      evidenceAssetId: photo._id,
      locationFailureReason: photo.locationFailureReason ?? null,
      locationVerified: photo.locationVerified,
      siteVisitId: visit._id,
    })),
    report: validation.report,
    warnings: validation.qualifyingPhotos
      .filter((photo) => !photo.locationVerified)
      .map((photo) => `site_visit_location_unverified:${String(photo._id)}`),
  };
}

export async function validateMilestoneSiteVisitCompletion(
  ctx: ReviewCtx,
  input: {
    report: string;
    target: Extract<ResolvedReviewTarget, { kind: "milestone" }>;
    visit: Doc<"buildSiteVisits">;
  }
) {
  const report = input.report.trim();
  if (!report || report.length > 4000) {
    throw new ConvexError({
      code: "SITE_VISIT_REPORT_REQUIRED",
      message: "Site Visit report must contain 1 to 4000 characters.",
      recoverable: true,
    });
  }
  const { visit } = input;
  if (
    visit.buildId !== input.target.build._id ||
    visit.buildMilestoneId !== input.target.record._id ||
    visit.milestoneKey !== input.target.record.key ||
    visit.organizationId !== input.target.build.organizationId ||
    visit.brokerageId !== input.target.build.brokerageId
  ) {
    throw safeUnavailableError();
  }
  const siteVisitAssets = await ctx.db
    .query("buildEvidenceAssets")
    .withIndex("by_site_visit", (query) => query.eq("siteVisitId", visit._id))
    .take(EVIDENCE_REFERENCE_LIMIT + 1);
  if (siteVisitAssets.length > EVIDENCE_REFERENCE_LIMIT) {
    throw evidenceReferenceLimitError();
  }
  const qualifyingPhotos = siteVisitAssets.filter(
    (asset) =>
      asset.siteVisitId === visit._id &&
      asset.buildId === input.target.build._id &&
      asset.organizationId === input.target.build.organizationId &&
      asset.brokerageId === input.target.build.brokerageId &&
      asset.proposalId === input.target.build.proposalId &&
      asset.milestoneKey === input.target.record.key &&
      asset.mimeType.toLowerCase().startsWith("image/")
  );
  if (qualifyingPhotos.length === 0) {
    throw new ConvexError({
      code: "SITE_VISIT_PHOTO_REQUIRED",
      message: "Attach at least one Site Visit photo before completion.",
      recoverable: true,
    });
  }
  return { qualifyingPhotos, report };
}

export async function completeMilestoneSiteVisit(
  ctx: MutationCtx,
  input: {
    actorRole: "admin" | "lender" | "lender-admin";
    actorWorkosUserId: string;
    expectedVisitUpdatedAt: number;
    group: LenderPortalReviewGroup;
    idempotencyKey: string;
    report: string;
    target: Extract<ResolvedReviewTarget, { kind: "milestone" }>;
    visitId: Id<"buildSiteVisits">;
  }
) {
  const idempotencyKey = normalizeIdempotencyKey(input.idempotencyKey);
  const report = input.report.trim();
  if (!report || report.length > 4000) {
    throw new ConvexError({
      code: "SITE_VISIT_REPORT_REQUIRED",
      message: "Site Visit report must contain 1 to 4000 characters.",
      recoverable: true,
    });
  }
  const fingerprint = JSON.stringify({
    command: "completeMilestoneSiteVisit",
    expectedVisitUpdatedAt: input.expectedVisitUpdatedAt,
    group: input.group,
    report,
    requestIdentity: input.target.requestIdentity,
    visitId: String(input.visitId),
  });
  const visit = await ctx.db.get(input.visitId);
  if (
    !visit ||
    visit.buildId !== input.target.build._id ||
    visit.buildMilestoneId !== input.target.record._id ||
    visit.milestoneKey !== input.target.record.key ||
    visit.organizationId !== input.target.build.organizationId ||
    visit.brokerageId !== input.target.build.brokerageId
  ) {
    throw safeUnavailableError();
  }
  if (visit.completionIdempotencyKey === idempotencyKey) {
    if (visit.completionCommandFingerprint !== fingerprint) {
      throw idempotencyConflictError();
    }
    return {
      replayed: true,
      siteVisitId: visit._id,
      status: "complete" as const,
    };
  }
  if (visit.status !== "requested") {
    throw new ConvexError({
      code: "SITE_VISIT_NOT_COMPLETABLE",
      message: "This Site Visit no longer accepts a completion report.",
      recoverable: true,
    });
  }
  if (visit.updatedAt !== input.expectedVisitUpdatedAt) {
    throw new ConvexError({
      code: "STALE_SITE_VISIT",
      message: "Site Visit changed. Refresh before retrying.",
      recoverable: true,
    });
  }
  const { qualifyingPhotos } = await validateMilestoneSiteVisitCompletion(ctx, {
    report,
    target: input.target,
    visit,
  });

  const now = Date.now();
  const completedAt = new Date(now).toISOString();
  const siteVisitProjection = {
    completedAt,
    recordNote: report,
    recordNoteFormat: "plain_text" as const,
    requestedAt: visit.requestedAt,
    requestedDay: visit.requestedDay,
    status: "complete" as const,
    tokenExpiresAt: visit.tokenExpiresAt,
    url: visit.url,
    visitId: visit.visitId,
  };
  const existingReview =
    recordValue(input.target.record.completionReview) ?? {};
  const completionReview = {
    ...existingReview,
    reviewedAt:
      typeof existingReview.reviewedAt === "string"
        ? existingReview.reviewedAt
        : completedAt,
    siteVisit: siteVisitProjection,
    status:
      existingReview.status === "approved" ||
      existingReview.status === "rejected" ||
      existingReview.status === "revisionRequested"
        ? existingReview.status
        : "pending",
  };
  await ctx.db.patch(visit._id, {
    completedAt,
    completedByGroup: input.group,
    completedByRole: input.actorRole,
    completedByWorkosUserId: input.actorWorkosUserId,
    completionCommandFingerprint: fingerprint,
    completionIdempotencyKey: idempotencyKey,
    recordNote: report,
    recordNoteFormat: "plain_text",
    status: "complete",
    updatedAt: now,
  });
  await ctx.db.patch(input.target.record._id, {
    completionReview,
    evidenceState: "Site visit report submitted",
    updatedAt: now,
  });
  await ctx.db.insert("auditEvents", {
    actorRole: input.actorRole,
    actorRoles: [input.actorRole],
    actorWorkosUserId: input.actorWorkosUserId,
    brokerageId: input.target.build.brokerageId,
    buildId: input.target.build._id,
    command: "lender_portal.site_visit.completed",
    createdAt: now,
    entityId: String(visit._id),
    entityType: "buildSiteVisit",
    eventType: "lender_portal.site_visit.completed",
    newState: JSON.stringify({
      aclChanges: {
        completedByGroup: input.group,
        completedByRole: input.actorRole,
        completedByWorkosUserId: input.actorWorkosUserId,
      },
      currentCycleId:
        input.target.record.currentLenderPortalReviewCycleId ?? null,
      currentCycleNumber:
        input.target.record.currentLenderPortalReviewCycleNumber ?? 0,
      policy: await lockedReviewRequirements(ctx, input.target),
      qualifyingEvidenceReferences: qualifyingPhotos.map((photo) => ({
        evidenceAssetId: photo._id,
        locationFailureReason: photo.locationFailureReason ?? null,
        locationVerified: photo.locationVerified,
        siteVisitId: visit._id,
      })),
      report,
      status: "complete",
    }),
    organizationId: input.target.build.organizationId,
    priorState: JSON.stringify({
      completedByGroup: visit.completedByGroup ?? null,
      recordNote: visit.recordNote ?? null,
      status: visit.status,
    }),
    reason: report,
    resourceType: "siteVisit",
    targetRevisions: [
      {
        entityId: String(input.target.record._id),
        entityType: "buildMilestone",
        revision: input.target.record.workflowRevision ?? 0,
      },
      ...(input.target.record.currentLenderPortalReviewCycleId
        ? [
            {
              entityId: String(
                input.target.record.currentLenderPortalReviewCycleId
              ),
              entityType: "lenderPortalReviewCycle",
              revision:
                input.target.record.currentLenderPortalReviewCycleNumber ?? 0,
            },
          ]
        : []),
    ],
    warnings: qualifyingPhotos
      .filter((photo) => !photo.locationVerified)
      .map((photo) => `site_visit_location_unverified:${String(photo._id)}`),
  });
  return {
    replayed: false,
    siteVisitId: visit._id,
    status: "complete" as const,
  };
}
