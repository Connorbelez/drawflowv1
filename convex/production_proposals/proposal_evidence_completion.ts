/**
 * Production proposals proposal evidence completion bounded-context implementation.
 * The parent facade re-exports its handlers to preserve production_proposals function references.
 */
import { v } from "convex/values";
import { authenticatedMutation } from "../authz";
import { assertProposalCollaborationEditAllowed } from "../proposal_collaboration_model";
import { authorizeProposal } from "./authorization_core.js";
import { requireProposalAppPermission } from "./builder_staff_access.js";
import { requireBackofficeProposalWrite, requireAnyRole } from "./contractor_policy_helpers.js";
import { BACKOFFICE_ROLES } from "./contracts_foundation.js";
import { evidenceAssetInput } from "./contracts_workflow.js";
import { getProductionMilestoneOrThrow, getProductionDrawOrThrow, getProductionEvidenceAssetOrThrow, writeProposalEvent } from "./proposal_copy_audit.js";
import { requireProductionTimelineLiveWrite } from "./proposal_cost_persistence.js";
import { requireProductionTimelineEditable } from "./proposal_lender_approval.js";

export const generateProductionEvidenceUploadUrl = authenticatedMutation
  .input({
    proposalId: v.id("buildProposals"),
    workosOrganizationId: v.string(),
  })
  .returns(v.string())
  .handler(async (ctx, args) => {
    const auth = await authorizeProposal(
      ctx,
      args.proposalId,
      args.workosOrganizationId,
    );
    await requireProductionTimelineEditable(ctx, auth);
    await requireProposalAppPermission(ctx, auth, "evidence", "create");
    return await ctx.storage.generateUploadUrl();
  })
  .public();

export const createProductionTimelineEvidenceAsset = authenticatedMutation
  .input({
    asset: evidenceAssetInput,
    proposalId: v.id("buildProposals"),
    workosOrganizationId: v.string(),
  })
  .returns(v.null())
  .handler(async (ctx, args) => {
    const auth = await authorizeProposal(
      ctx,
      args.proposalId,
      args.workosOrganizationId,
    );
    await requireProductionTimelineEditable(ctx, auth);
    await requireProposalAppPermission(ctx, auth, "evidence", "create");
    const milestone = await getProductionMilestoneOrThrow(
      ctx,
      args.proposalId,
      args.asset.milestoneKey,
    );
    const existing = await ctx.db
      .query("proposalEvidenceAssets")
      .withIndex("by_proposal_key", (q) =>
        q
          .eq("proposalId", args.proposalId)
          .eq("evidenceKey", args.asset.evidenceKey),
      )
      .unique();
    if (existing) {
      throw new Error("Production evidence asset already exists.");
    }
    const now = Date.now();
    await ctx.db.insert("proposalEvidenceAssets", {
      brokerageId: auth.brokerage._id,
      createdAt: now,
      evidenceKey: args.asset.evidenceKey,
      fileName: args.asset.fileName,
      label: args.asset.label.trim() || args.asset.fileName,
      locationVerified: args.asset.locationVerified ?? false,
      milestoneKey: args.asset.milestoneKey,
      mimeType: args.asset.mimeType,
      organizationId: auth.proposal.organizationId,
      proposalId: args.proposalId,
      sizeBytes: Math.max(0, Math.round(args.asset.sizeBytes)),
      source: args.asset.source ?? "production_timeline_upload",
      storageId: args.asset.storageId,
      tag: args.asset.tag.trim() || milestone.name,
      updatedAt: now,
    });
    await ctx.db.patch(milestone._id, {
      evidenceState: "Submitted package",
      updatedAt: now,
    });
    await writeProposalEvent(ctx, {
      auth,
      command: "createProductionTimelineEvidenceAsset",
      eventType: "proposal.evidence.created",
      newState: JSON.stringify(args.asset),
      proposalId: args.proposalId,
    });
    return null;
  })
  .public();

export const updateProductionTimelineEvidenceAsset = authenticatedMutation
  .input({
    evidenceKey: v.string(),
    label: v.optional(v.string()),
    proposalId: v.id("buildProposals"),
    tag: v.optional(v.string()),
    workosOrganizationId: v.string(),
  })
  .returns(v.null())
  .handler(async (ctx, args) => {
    const auth = await authorizeProposal(
      ctx,
      args.proposalId,
      args.workosOrganizationId,
    );
    await requireProductionTimelineEditable(ctx, auth);
    await requireProposalAppPermission(ctx, auth, "evidence", "update");
    const asset = await getProductionEvidenceAssetOrThrow(
      ctx,
      args.proposalId,
      args.evidenceKey,
    );
    const patch = {
      ...(args.label === undefined
        ? {}
        : { label: args.label.trim() || asset.label }),
      ...(args.tag === undefined ? {} : { tag: args.tag.trim() || asset.tag }),
      updatedAt: Date.now(),
    };
    await ctx.db.patch(asset._id, patch);
    await writeProposalEvent(ctx, {
      auth,
      command: "updateProductionTimelineEvidenceAsset",
      eventType: "proposal.evidence.updated",
      newState: JSON.stringify(patch),
      priorState: JSON.stringify(asset),
      proposalId: args.proposalId,
    });
    return null;
  })
  .public();

export const deleteProductionTimelineEvidenceAsset = authenticatedMutation
  .input({
    evidenceKey: v.string(),
    proposalId: v.id("buildProposals"),
    workosOrganizationId: v.string(),
  })
  .returns(v.null())
  .handler(async (ctx, args) => {
    const auth = await authorizeProposal(
      ctx,
      args.proposalId,
      args.workosOrganizationId,
    );
    await requireProductionTimelineEditable(ctx, auth);
    await requireProposalAppPermission(ctx, auth, "evidence", "delete");
    const asset = await getProductionEvidenceAssetOrThrow(
      ctx,
      args.proposalId,
      args.evidenceKey,
    );
    if (asset.storageId) {
      await ctx.storage.delete(asset.storageId);
    }
    await ctx.db.delete(asset._id);
    await writeProposalEvent(ctx, {
      auth,
      command: "deleteProductionTimelineEvidenceAsset",
      eventType: "proposal.evidence.deleted",
      priorState: JSON.stringify(asset),
      proposalId: args.proposalId,
    });
    return null;
  })
  .public();

export const submitProductionMilestoneCompletion = authenticatedMutation
  .input({
    actualCostCents: v.optional(v.number()),
    completedDay: v.number(),
    milestoneKey: v.string(),
    note: v.optional(v.string()),
    proposalId: v.id("buildProposals"),
    workosOrganizationId: v.string(),
  })
  .returns(v.null())
  .handler(async (ctx, args) => {
    const auth = await authorizeProposal(
      ctx,
      args.proposalId,
      args.workosOrganizationId,
    );
    await requireProductionTimelineLiveWrite(ctx, auth);
    await requireProposalAppPermission(ctx, auth, "milestone", "update");
    await requireProposalAppPermission(ctx, auth, "evidence", "update");
    const milestone = await getProductionMilestoneOrThrow(
      ctx,
      args.proposalId,
      args.milestoneKey,
    );
    const completionClaim = {
      ...(args.actualCostCents === undefined
        ? {}
        : { actualCostCents: Math.max(0, Math.round(args.actualCostCents)) }),
      completedDay: Math.max(0, Math.round(args.completedDay)),
      ...(args.note ? { note: args.note } : {}),
      submittedAt: new Date().toISOString(),
    };
    const now = Date.now();
    await ctx.db.patch(milestone._id, {
      completionClaim,
      evidenceState: milestone.evidenceState ?? "Completion claimed",
      timelineStatus: "complete",
      tone: "complete",
      updatedAt: now,
    });
    await writeProposalEvent(ctx, {
      auth,
      command: "submitProductionMilestoneCompletion",
      eventType: "proposal.milestone_completion.submitted",
      newState: JSON.stringify(completionClaim),
      priorState: JSON.stringify(milestone.completionClaim),
      proposalId: args.proposalId,
    });
    return null;
  })
  .public();

export const reviewProductionMilestoneCompletion = authenticatedMutation
  .input({
    milestoneKey: v.string(),
    note: v.optional(v.string()),
    proposalId: v.id("buildProposals"),
    status: v.union(v.literal("approved"), v.literal("revisionRequested")),
    workosOrganizationId: v.string(),
  })
  .returns(v.null())
  .handler(async (ctx, args) => {
    const auth = await authorizeProposal(
      ctx,
      args.proposalId,
      args.workosOrganizationId,
    );
    requireAnyRole(auth.roles, BACKOFFICE_ROLES);
    requireBackofficeProposalWrite(auth, auth.proposal);
    await assertProposalCollaborationEditAllowed(ctx, auth);
    const milestone = await getProductionMilestoneOrThrow(
      ctx,
      args.proposalId,
      args.milestoneKey,
    );
    const completionReview = {
      ...(args.note ? { note: args.note } : {}),
      reviewedAt: new Date().toISOString(),
      status: args.status,
    };
    await ctx.db.patch(milestone._id, {
      completionReview,
      completionClaim: {
        ...(milestone.completionClaim ?? {}),
        completionReview,
      },
      timelineStatus:
        args.status === "approved" ? "complete" : milestone.timelineStatus,
      tone: args.status === "approved" ? "complete" : "warning",
      updatedAt: Date.now(),
    });
    await writeProposalEvent(ctx, {
      auth,
      command: "reviewProductionMilestoneCompletion",
      eventType: "proposal.milestone_completion.reviewed",
      newState: JSON.stringify(completionReview),
      priorState: JSON.stringify(milestone.completionReview),
      proposalId: args.proposalId,
    });
    return null;
  })
  .public();

export const requestProductionMilestoneSiteVisit = authenticatedMutation
  .input({
    includedMilestoneKeys: v.optional(v.array(v.string())),
    milestoneKey: v.string(),
    note: v.optional(v.string()),
    proposalId: v.id("buildProposals"),
    requestedDay: v.number(),
    workosOrganizationId: v.string(),
  })
  .returns(
    v.object({
      includedItemIds: v.optional(v.array(v.string())),
      note: v.optional(v.string()),
      requestedAt: v.string(),
      requestedDay: v.number(),
      status: v.string(),
      tokenExpiresAt: v.number(),
      url: v.string(),
      visitId: v.string(),
    }),
  )
  .handler(async (ctx, args) => {
    const auth = await authorizeProposal(
      ctx,
      args.proposalId,
      args.workosOrganizationId,
    );
    if (auth.proposal.status !== "approved") {
      throw new Error("Site visit requests require an approved proposal.");
    }
    requireAnyRole(auth.roles, BACKOFFICE_ROLES);
    requireBackofficeProposalWrite(auth, auth.proposal);
    await assertProposalCollaborationEditAllowed(ctx, auth);
    const milestone = await getProductionMilestoneOrThrow(
      ctx,
      args.proposalId,
      args.milestoneKey,
    );
    const now = Date.now();
    const visitId = `site_visit_${args.milestoneKey}_${now}`;
    const siteVisit = {
      includedItemIds:
        args.includedMilestoneKeys && args.includedMilestoneKeys.length > 0
          ? args.includedMilestoneKeys
          : [args.milestoneKey],
      ...(args.note ? { note: args.note } : {}),
      requestedAt: new Date(now).toISOString(),
      requestedDay: Math.max(0, Math.round(args.requestedDay)),
      status: "requested",
      tokenExpiresAt: now + 60 * 60 * 1000,
      url: `/newsitevisit/${String(args.proposalId)}/${visitId}`,
      visitId,
    };
    const completionReview = {
      ...(milestone.completionReview ?? {}),
      reviewedAt:
        milestone.completionReview?.reviewedAt ?? siteVisit.requestedAt,
      siteVisit,
      status: milestone.completionReview?.status ?? "revisionRequested",
    };
    await ctx.db.patch(milestone._id, {
      completionReview,
      tone: "warning",
      updatedAt: now,
    });
    await writeProposalEvent(ctx, {
      auth,
      command: "requestProductionMilestoneSiteVisit",
      eventType: "proposal.site_visit.requested",
      newState: JSON.stringify(siteVisit),
      priorState: JSON.stringify(milestone.completionReview),
      proposalId: args.proposalId,
      reason: args.note,
    });
    return siteVisit;
  })
  .public();

export const recordProductionMilestoneSiteVisit = authenticatedMutation
  .input({
    milestoneKey: v.string(),
    note: v.optional(v.string()),
    proposalId: v.id("buildProposals"),
    status: v.union(v.literal("complete"), v.literal("cancelled")),
    visitId: v.string(),
    workosOrganizationId: v.string(),
  })
  .returns(v.null())
  .handler(async (ctx, args) => {
    const auth = await authorizeProposal(
      ctx,
      args.proposalId,
      args.workosOrganizationId,
    );
    if (auth.proposal.status !== "approved") {
      throw new Error("Site visit records require an approved proposal.");
    }
    requireAnyRole(auth.roles, BACKOFFICE_ROLES);
    requireBackofficeProposalWrite(auth, auth.proposal);
    await assertProposalCollaborationEditAllowed(ctx, auth);
    const milestone = await getProductionMilestoneOrThrow(
      ctx,
      args.proposalId,
      args.milestoneKey,
    );
    const existingReview = milestone.completionReview ?? {};
    const existingSiteVisit = existingReview.siteVisit;
    if (!existingSiteVisit || existingSiteVisit.visitId !== args.visitId) {
      throw new Error("Production site visit request not found.");
    }
    const now = Date.now();
    const siteVisit = {
      ...existingSiteVisit,
      completedAt:
        args.status === "complete"
          ? new Date(now).toISOString()
          : existingSiteVisit.completedAt,
      ...(args.note ? { recordNote: args.note } : {}),
      status: args.status,
    };
    const completionReview = {
      ...existingReview,
      reviewedAt: existingReview.reviewedAt ?? new Date(now).toISOString(),
      siteVisit,
      status: existingReview.status ?? "revisionRequested",
    };
    await ctx.db.patch(milestone._id, {
      completionReview,
      updatedAt: now,
    });
    await writeProposalEvent(ctx, {
      auth,
      command: "recordProductionMilestoneSiteVisit",
      eventType: "proposal.site_visit.recorded",
      newState: JSON.stringify(siteVisit),
      priorState: JSON.stringify(existingSiteVisit),
      proposalId: args.proposalId,
      reason: args.note,
    });
    return null;
  })
  .public();

export const submitProductionDrawRequest = authenticatedMutation
  .input({
    amountCents: v.number(),
    drawKey: v.string(),
    note: v.optional(v.string()),
    proposalId: v.id("buildProposals"),
    workosOrganizationId: v.string(),
    x: v.optional(v.number()),
  })
  .returns(v.null())
  .handler(async (ctx, args) => {
    const auth = await authorizeProposal(
      ctx,
      args.proposalId,
      args.workosOrganizationId,
    );
    await requireProductionTimelineLiveWrite(ctx, auth);
    await requireProposalAppPermission(ctx, auth, "draw", "update");
    const draw = await getProductionDrawOrThrow(
      ctx,
      args.proposalId,
      args.drawKey,
    );
    const patch = {
      amountCents: Math.max(0, Math.round(args.amountCents)),
      customDate: args.x === undefined ? draw.customDate : true,
      requestNote: args.note,
      requestStatus: "requested" as const,
      requestedAt: new Date().toISOString(),
      timingDay:
        args.x === undefined ? draw.timingDay : Math.max(0, Math.round(args.x)),
      updatedAt: Date.now(),
    };
    await ctx.db.patch(draw._id, patch);
    await writeProposalEvent(ctx, {
      auth,
      command: "submitProductionDrawRequest",
      eventType: "proposal.draw_request.submitted",
      newState: JSON.stringify(patch),
      priorState: JSON.stringify(draw),
      proposalId: args.proposalId,
    });
    return null;
  })
  .public();

export const reviewProductionDrawRequest = authenticatedMutation
  .input({
    drawKey: v.string(),
    note: v.optional(v.string()),
    proposalId: v.id("buildProposals"),
    status: v.union(v.literal("approved"), v.literal("rejected")),
    workosOrganizationId: v.string(),
  })
  .returns(v.null())
  .handler(async (ctx, args) => {
    const auth = await authorizeProposal(
      ctx,
      args.proposalId,
      args.workosOrganizationId,
    );
    requireAnyRole(auth.roles, BACKOFFICE_ROLES);
    requireBackofficeProposalWrite(auth, auth.proposal);
    await assertProposalCollaborationEditAllowed(ctx, auth);
    const draw = await getProductionDrawOrThrow(
      ctx,
      args.proposalId,
      args.drawKey,
    );
    const patch = {
      requestReviewNote: args.note,
      requestStatus: args.status,
      reviewedAt: new Date().toISOString(),
      updatedAt: Date.now(),
    };
    await ctx.db.patch(draw._id, patch);
    await writeProposalEvent(ctx, {
      auth,
      command: "reviewProductionDrawRequest",
      eventType: "proposal.draw_request.reviewed",
      newState: JSON.stringify(patch),
      priorState: JSON.stringify(draw),
      proposalId: args.proposalId,
    });
    return null;
  })
  .public();
