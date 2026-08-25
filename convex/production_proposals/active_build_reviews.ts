/**
 * Production proposals active build reviews bounded-context implementation.
 * The parent facade re-exports its handlers to preserve production_proposals function references.
 */
import { ConvexError, v } from "convex/values";
import { authenticatedMutation } from "../authz";
import { publishMilestoneCollaborationEvent } from "../build_collaboration_workflow_events";
import { normalizeOperationalIdempotencyKey, operationalRequestFingerprint } from "../build_operational_idempotency";
import { recordCanonicalBackofficeReviewDecision, requireCanonicalReviewCycleCompleted } from "../lender_portal_phase5";
import { getActiveBuildMilestoneOrThrow, assertActiveBuildPlanningTargetActive } from "./active_planning.js";
import { authorizeActiveBuildOrThrow, requireBackofficeActiveBuildWrite, requireApproverActiveBuildWrite } from "./authorization_core.js";
import { activeBuildSiteVisitAssignmentResponse } from "./calendar_scheduling.js";
import { normalizeOptionalString, activeBuildCompletionReviewRecord, activeBuildCompletionReviewNote, activeBuildPendingCompletionReview, activeBuildCompletionReviewWithSiteVisit } from "./contractor_policy_helpers.js";
import { siteVisitGuidanceSectionInput, productionSettingsSiteVisitGuidanceInput } from "./contracts_foundation.js";
import { upsertBuilderMilestoneDecisionDeliveries } from "./notification_delivery_helpers.js";
import { writeActiveBuildEvent } from "./proposal_copy_audit.js";
import { resolveActiveBuildSiteVisitConfiguration, saveSiteVisitCanonicalGuidance, insertSiteVisitGuidanceSnapshots } from "./site_visit_helpers.js";

export const requestActiveBuildMilestoneInfo = authenticatedMutation
  .input({
    buildId: v.id("activeBuilds"),
    milestoneKey: v.string(),
    note: v.string(),
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
    const milestone = await getActiveBuildMilestoneOrThrow(
      ctx,
      args.buildId,
      args.milestoneKey,
    );
    assertActiveBuildPlanningTargetActive(milestone);
    const note = normalizeOptionalString(args.note);
    if (!note) {
      throw new Error("A requested change note is required.");
    }
    const priorReview = activeBuildCompletionReviewRecord(
      milestone.completionReview,
    );
    const materialTransition = priorReview.status !== "revisionRequested";
    const collaborationEventRevision = materialTransition
      ? (milestone.collaborationEventRevision ?? 0) + 1
      : milestone.collaborationEventRevision;
    const completionReview = {
      ...(milestone.completionReview ?? {}),
      note,
      reviewedAt: new Date().toISOString(),
      status: "revisionRequested",
    };
    await ctx.db.patch(milestone._id, {
      collaborationEventRevision,
      completionReview,
      evidenceState: "Info requested",
      updatedAt: Date.now(),
    });
    await writeActiveBuildEvent(ctx, {
      auth,
      build: auth.build,
      command: "requestActiveBuildMilestoneInfo",
      eventType: "active_build.milestone.info_requested",
      newState: JSON.stringify(completionReview),
      priorState: JSON.stringify(milestone.completionReview),
      reason: note,
    });
    if (materialTransition && collaborationEventRevision !== undefined) {
      await publishMilestoneCollaborationEvent(ctx, {
        actor: { roles: auth.roles, workosUserId: auth.subject },
        milestone,
        note,
        transition: "blocked",
      });
    }
    return null;
  })
  .public();

export const assignActiveBuildSiteVisit = authenticatedMutation
  .input({
    buildId: v.id("activeBuilds"),
    idempotencyKey: v.string(),
    milestoneKey: v.string(),
    note: v.optional(v.string()),
    requestedDay: v.number(),
    requestedTime: v.optional(v.string()),
    siteVisitGuidance: v.optional(productionSettingsSiteVisitGuidanceInput),
    submilestoneKeys: v.optional(v.array(v.string())),
    submilestoneGuidanceSections: v.optional(
      v.array(siteVisitGuidanceSectionInput),
    ),
    workosOrganizationId: v.string(),
  })
  .returns(
    v.object({
      evidencePackageId: v.string(),
      scopeBoundAt: v.number(),
      workOrderId: v.string(),
      note: v.optional(v.string()),
      requestedAt: v.string(),
      requestedDay: v.number(),
      requestedTime: v.optional(v.string()),
      siteVisitGuidance: productionSettingsSiteVisitGuidanceInput,
      submilestoneId: v.optional(v.id("buildSubmilestones")),
      status: v.string(),
      submilestoneKeys: v.array(v.string()),
      tokenExpiresAt: v.number(),
      url: v.string(),
      visitId: v.string(),
    }),
  )
  .handler(async (ctx, args) => {
    const auth = await authorizeActiveBuildOrThrow(
      ctx,
      args.buildId,
      args.workosOrganizationId,
    );
    requireBackofficeActiveBuildWrite(auth);
    const milestone = await getActiveBuildMilestoneOrThrow(
      ctx,
      args.buildId,
      args.milestoneKey,
    );
    assertActiveBuildPlanningTargetActive(milestone);
    const configuration = await resolveActiveBuildSiteVisitConfiguration(
      ctx,
      milestone,
      args.siteVisitGuidance,
      args.submilestoneKeys,
      args.submilestoneGuidanceSections,
      auth.build,
    );
    const idempotencyKey = normalizeOperationalIdempotencyKey(
      args.idempotencyKey,
      "Site Visit assignment idempotency key",
    );
    const requestedDay = Math.max(0, Math.round(args.requestedDay));
    const requestedTime = normalizeOptionalString(args.requestedTime);
    const note = normalizeOptionalString(args.note);
    const assignRequestFingerprint = await operationalRequestFingerprint({
      command: "assignActiveBuildSiteVisit",
      milestoneKey: milestone.key,
      note: note ?? null,
      requestedDay,
      requestedTime: requestedTime ?? null,
      siteVisitGuidance: configuration.siteVisitGuidance,
      submilestoneGuidanceSections: configuration.guidanceSections.map(
        (section) => ({
          buildSubmilestoneId: String(section.buildSubmilestone._id),
          cameraAnglesTiptapJson: section.cameraAnglesTiptapJson,
          proposalSubmilestoneId: String(section.proposalSubmilestoneId),
          whatToVerifyTiptapJson: section.whatToVerifyTiptapJson,
        }),
      ),
      submilestoneKeys: [...configuration.submilestoneKeys].sort(),
    });
    const existingVisit = await ctx.db
      .query("buildSiteVisits")
      .withIndex("by_build_schedule_idempotency", (query) =>
        query
          .eq("buildId", args.buildId)
          .eq("scheduleIdempotencyKey", idempotencyKey),
      )
      .unique();
    if (existingVisit) {
      if (existingVisit.scheduleRequestFingerprint !== assignRequestFingerprint) {
        throw new ConvexError({
          code: "SITE_VISIT_ASSIGN_IDEMPOTENCY_CONFLICT",
          message:
            "This Site Visit assignment idempotency key was already used for a different request.",
          recoverable: true,
        });
      }
      return activeBuildSiteVisitAssignmentResponse(existingVisit);
    }
    const now = Date.now();
    const visitId = `active_visit_${args.milestoneKey}_${now}`;
    const workOrderId = `WO-${visitId}`;
    const evidencePackageId = `EP-${String(args.buildId)}-${args.milestoneKey}`;
    const siteVisit = {
      evidencePackageId,
      scopeBoundAt: now,
      workOrderId,
      ...(note ? { note } : {}),
      requestedAt: new Date(now).toISOString(),
      requestedDay,
      requestedTime,
      siteVisitGuidance: configuration.siteVisitGuidance,
      ...(configuration.submilestoneId
        ? { submilestoneId: configuration.submilestoneId }
        : {}),
      status: "requested",
      submilestoneKeys: configuration.submilestoneKeys,
      tokenExpiresAt: now + 60 * 60 * 1000,
      url: `/newsitevisit/${String(args.buildId)}/${visitId}`,
      visitId,
    };
    await saveSiteVisitCanonicalGuidance(ctx, {
      auth,
      guidanceSections: configuration.guidanceSections,
      now,
      organizationId: args.workosOrganizationId,
    });
    const siteVisitId = await ctx.db.insert("buildSiteVisits", {
      brokerageId: auth.brokerage._id,
      buildId: args.buildId,
      buildMilestoneId: milestone._id,
      createdAt: now,
      evidencePackageId,
      scopeBoundAt: now,
      workOrderId,
      milestoneKey: args.milestoneKey,
      note,
      organizationId: args.workosOrganizationId,
      requestedAt: siteVisit.requestedAt,
      requestedDay: siteVisit.requestedDay,
      requestedTime: siteVisit.requestedTime,
      scheduleIdempotencyKey: idempotencyKey,
      scheduleRequestFingerprint: assignRequestFingerprint,
      siteVisitGuidance: configuration.siteVisitGuidance,
      ...(configuration.submilestoneId
        ? { submilestoneId: configuration.submilestoneId }
        : {}),
      status: "requested",
      submilestoneKeys: configuration.submilestoneKeys,
      tokenExpiresAt: siteVisit.tokenExpiresAt,
      updatedAt: now,
      url: siteVisit.url,
      visitId,
    });
    await insertSiteVisitGuidanceSnapshots(ctx, {
      auth,
      buildSiteVisitId: siteVisitId,
      guidanceSections: configuration.guidanceSections,
      milestone,
      now,
      organizationId: args.workosOrganizationId,
    });
    const completionReview = activeBuildCompletionReviewWithSiteVisit(
      milestone.completionReview,
      siteVisit,
      siteVisit.requestedAt,
    );
    await ctx.db.patch(milestone._id, {
      completionReview,
      evidenceState: milestone.evidenceState ?? "Site visit requested",
      siteVisitGuidance: configuration.siteVisitGuidance,
      updatedAt: now,
    });
    await writeActiveBuildEvent(ctx, {
      auth,
      build: auth.build,
      command: "assignActiveBuildSiteVisit",
      entityId: String(siteVisitId),
      entityType: "buildSiteVisit",
      eventType: "active_build.site_visit.requested",
      newState: JSON.stringify(siteVisit),
      priorState: JSON.stringify(milestone.completionReview),
      reason: note,
    });
    return siteVisit;
  })
  .public();

export const repairActiveBuildMilestoneReviewStates = authenticatedMutation
  .input({
    buildId: v.id("activeBuilds"),
    workosOrganizationId: v.string(),
  })
  .returns(
    v.object({
      milestoneKeys: v.array(v.string()),
      repaired: v.number(),
    }),
  )
  .handler(async (ctx, args) => {
    const auth = await authorizeActiveBuildOrThrow(
      ctx,
      args.buildId,
      args.workosOrganizationId,
    );
    requireApproverActiveBuildWrite(auth);
    const milestones = await ctx.db
      .query("buildMilestones")
      .withIndex("by_build", (q) => q.eq("buildId", args.buildId))
      .collect();
    const malformed = milestones.filter((milestone) => {
      const review = activeBuildCompletionReviewRecord(
        milestone.completionReview,
      );
      return (
        review.status === "revisionRequested" &&
        !activeBuildCompletionReviewNote(review)
      );
    });
    const now = Date.now();
    for (const milestone of malformed) {
      await ctx.db.patch(milestone._id, {
        completionReview: activeBuildPendingCompletionReview(
          milestone.completionReview,
        ),
        updatedAt: now,
      });
    }
    const milestoneKeys = malformed.map((milestone) => milestone.key);
    if (milestoneKeys.length > 0) {
      await writeActiveBuildEvent(ctx, {
        auth,
        build: auth.build,
        command: "repairActiveBuildMilestoneReviewStates",
        eventType: "active_build.milestone_review_states.repaired",
        newState: JSON.stringify({ milestoneKeys, status: "pending" }),
        priorState: JSON.stringify(
          malformed.map((milestone) => ({
            completionReview: milestone.completionReview,
            milestoneKey: milestone.key,
          })),
        ),
        reason:
          "Removed malformed revision-requested states that had no requested-change note.",
      });
    }
    return { milestoneKeys, repaired: milestoneKeys.length };
  })
  .public();

export const approveActiveBuildMilestone = authenticatedMutation
  .input({
    buildId: v.id("activeBuilds"),
    expectedReviewCycleNumber: v.optional(v.number()),
    milestoneKey: v.string(),
    note: v.optional(v.string()),
    reviewIdempotencyKey: v.optional(v.string()),
    workosOrganizationId: v.string(),
  })
  .returns(v.null())
  .handler(async (ctx, args) => {
    const auth = await authorizeActiveBuildOrThrow(
      ctx,
      args.buildId,
      args.workosOrganizationId,
    );
    requireApproverActiveBuildWrite(auth);
    const milestone = await getActiveBuildMilestoneOrThrow(
      ctx,
      args.buildId,
      args.milestoneKey,
    );
    assertActiveBuildPlanningTargetActive(milestone);
    if (
      args.expectedReviewCycleNumber === undefined ||
      !args.reviewIdempotencyKey
    ) {
      throw new ConvexError({
        code: "REVIEW_COMMAND_CONTEXT_REQUIRED",
        message:
          "Refresh the current review cycle before recording this approval.",
        recoverable: true,
      });
    }
    const reviewDecision = await recordCanonicalBackofficeReviewDecision(ctx, {
      actorWorkosUserId: auth.subject,
      decision: "approved",
      expectedCycleNumber: args.expectedReviewCycleNumber,
      idempotencyKey: args.reviewIdempotencyKey,
      privateRationale: args.note,
      target: { kind: "milestone", milestoneId: milestone._id },
    });
    if (reviewDecision.state !== "completed") {
      return null;
    }
    await requireCanonicalReviewCycleCompleted(
      ctx,
      { kind: "milestone", milestoneId: milestone._id },
      args.expectedReviewCycleNumber,
    );
    const completionReview = {
      ...(milestone.completionReview ?? {}),
      ...(args.note ? { note: args.note } : {}),
      reviewedAt: new Date().toISOString(),
      status: "approved",
    };
    const priorReview = activeBuildCompletionReviewRecord(
      milestone.completionReview,
    );
    const materialTransition = priorReview.status !== "approved";
    const collaborationEventRevision = materialTransition
      ? (milestone.collaborationEventRevision ?? 0) + 1
      : milestone.collaborationEventRevision;
    await ctx.db.patch(milestone._id, {
      collaborationEventRevision,
      completionReview,
      evidenceState: "Approved",
      status: "complete",
      updatedAt: Date.now(),
    });
    await writeActiveBuildEvent(ctx, {
      auth,
      build: auth.build,
      command: "approveActiveBuildMilestone",
      eventType: "active_build.milestone.approved",
      newState: JSON.stringify(completionReview),
      priorState: JSON.stringify(milestone.completionReview),
      reason: args.note,
    });
    if (materialTransition && collaborationEventRevision !== undefined) {
      await publishMilestoneCollaborationEvent(ctx, {
        actor: { roles: auth.roles, workosUserId: auth.subject },
        milestone,
        note: args.note,
        transition: "approved",
      });
    }
    await upsertBuilderMilestoneDecisionDeliveries(ctx, {
      auth,
      milestone,
      note: args.note,
      status: "approved",
    });
    return null;
  })
  .public();

export const rejectActiveBuildMilestone = authenticatedMutation
  .input({
    buildId: v.id("activeBuilds"),
    expectedReviewCycleNumber: v.optional(v.number()),
    milestoneKey: v.string(),
    note: v.optional(v.string()),
    reviewIdempotencyKey: v.optional(v.string()),
    workosOrganizationId: v.string(),
  })
  .returns(v.null())
  .handler(async (ctx, args) => {
    const auth = await authorizeActiveBuildOrThrow(
      ctx,
      args.buildId,
      args.workosOrganizationId,
    );
    requireApproverActiveBuildWrite(auth);
    const milestone = await getActiveBuildMilestoneOrThrow(
      ctx,
      args.buildId,
      args.milestoneKey,
    );
    assertActiveBuildPlanningTargetActive(milestone);
    const revisionInstructions = args.note?.trim();
    if (
      args.expectedReviewCycleNumber === undefined ||
      !args.reviewIdempotencyKey
    ) {
      throw new ConvexError({
        code: "REVIEW_COMMAND_CONTEXT_REQUIRED",
        message:
          "Refresh the current review cycle before recording this rejection.",
        recoverable: true,
      });
    }
    await recordCanonicalBackofficeReviewDecision(ctx, {
      actorWorkosUserId: auth.subject,
      decision: "rejected",
      expectedCycleNumber: args.expectedReviewCycleNumber,
      idempotencyKey: args.reviewIdempotencyKey,
      privateRationale: revisionInstructions,
      revisionInstructions,
      target: { kind: "milestone", milestoneId: milestone._id },
    });
    const completionReview = {
      ...(milestone.completionReview ?? {}),
      ...(args.note ? { note: args.note } : {}),
      reviewedAt: new Date().toISOString(),
      status: "rejected",
    };
    const priorReview = activeBuildCompletionReviewRecord(
      milestone.completionReview,
    );
    const materialTransition = priorReview.status !== "rejected";
    const collaborationEventRevision = materialTransition
      ? (milestone.collaborationEventRevision ?? 0) + 1
      : milestone.collaborationEventRevision;
    await ctx.db.patch(milestone._id, {
      collaborationEventRevision,
      completionReview,
      evidenceState: "Rejected",
      status:
        milestone.status === "complete" ? "in_progress" : milestone.status,
      updatedAt: Date.now(),
    });
    await writeActiveBuildEvent(ctx, {
      auth,
      build: auth.build,
      command: "rejectActiveBuildMilestone",
      eventType: "active_build.milestone.rejected",
      newState: JSON.stringify(completionReview),
      priorState: JSON.stringify(milestone.completionReview),
      reason: args.note,
    });
    if (materialTransition && collaborationEventRevision !== undefined) {
      await publishMilestoneCollaborationEvent(ctx, {
        actor: { roles: auth.roles, workosUserId: auth.subject },
        milestone,
        note: args.note,
        transition: "rejected",
      });
    }
    await upsertBuilderMilestoneDecisionDeliveries(ctx, {
      auth,
      milestone,
      note: args.note,
      status: "rejected",
    });
    return null;
  })
  .public();
