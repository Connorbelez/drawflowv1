import { ConvexError, v } from "convex/values";

import {
  authorizeActiveBuildAccess,
  type ActiveBuildAuthorization,
} from "./activeBuildAccess";
import { normalizeRoleSlugs, type AuthorizedViewer } from "./authz";
import {
  ensureMilestoneSystemPost,
  synchronizeMilestoneSystemPostLifecycle,
} from "./build_collaboration_system_posts";
import { resolveActiveSubmilestoneEvidencePackageReadiness } from "./build_submilestone_evidence";
import { authenticatedMutation, authenticatedQuery } from "./authz";
import type { Doc, Id, MutationCtx, QueryCtx } from "./types";

const LENDER_STAFF_ROLES = [
  "admin",
  "principle-broker",
  "broker",
  "broker-staff",
] as const;

type ReviewAuth = ActiveBuildAuthorization;
type ReviewCtx = QueryCtx | MutationCtx;
type SiteVisitRequirement = Doc<"buildSubmilestoneSiteVisitRequirements">;

import {
  childApprovedResultValidator,
  childReopenedResultValidator,
  changesRequestedResultValidator,
  milestoneApprovedResultValidator,
  milestoneReopenedResultValidator,
  recommendationResultValidator,
  reviewResultValidator,
  siteVisitDocValidator,
  siteVisitRequirementDocValidator,
  siteVisitWaivedResultValidator,
} from "./build_submilestone_review/validators";

import {
  assertExpectedMilestoneRevision,
  assertExpectedRevision,
  authorizeReview,
  currentRequirementVisit,
  ensureSiteVisitRequirement,
  existingChildDecision,
  existingParentDecision,
  getTarget,
  matchingSiteVisit,
  nonBlank,
  parentReadiness,
  recordReviewAudit,
  requireLenderAdmin,
  requireLenderStaff,
  syncSystemPost,
} from "./build_submilestone_review/helpers";

export const getActiveBuildSubmilestoneReview = authenticatedQuery
  .input({
    buildId: v.id("activeBuilds"),
    milestoneKey: v.string(),
    submilestoneKey: v.string(),
    workosOrganizationId: v.string(),
  })
  .returns(reviewResultValidator)
  .handler(async (ctx, args) => {
    const auth = await authorizeReview(ctx, args.buildId, args.workosOrganizationId);
    const { milestone, submilestone, submilestones } = await getTarget(
      ctx,
      auth,
      args.milestoneKey,
      args.submilestoneKey,
    );
    const reviewRound = submilestone.evidenceReviewRound ?? 0;
    const requirement =
      reviewRound > 0
        ? await ctx.db
            .query("buildSubmilestoneSiteVisitRequirements")
            .withIndex("by_submilestone_round", (query) =>
              query.eq("buildSubmilestoneId", submilestone._id).eq("reviewRound", reviewRound),
            )
            .unique()
        : null;
    const decisions = await ctx.db
      .query("buildSubmilestoneReviewDecisions")
      .withIndex("by_submilestone_createdAt", (query) =>
        query.eq("buildSubmilestoneId", submilestone._id),
      )
      .order("desc")
      .take(100);
    const readiness = await parentReadiness(submilestones);
    const currentVisit = await matchingSiteVisit(ctx, submilestone, reviewRound);
    return {
      child: {
        evidenceReviewState: submilestone.evidenceReviewState ?? "not_ready",
        reviewDecisionState: submilestone.reviewDecisionState ?? "in_review",
        reviewRevision: submilestone.reviewRevision ?? 0,
        reviewRound,
        status: submilestone.status,
      },
      decisions,
      parent: {
        ...readiness,
        reviewDecisionState: milestone.reviewDecisionState ?? "in_review",
        reviewRevision: milestone.reviewRevision ?? 0,
      },
      siteVisit: {
        currentVisit: currentVisit ?? null,
        requirement,
      },
    };
  })
  .public();

export const recommendActiveBuildSubmilestoneReview = authenticatedMutation
  .input({
    buildId: v.id("activeBuilds"),
    expectedRevision: v.optional(v.number()),
    idempotencyKey: v.string(),
    milestoneKey: v.string(),
    note: v.optional(v.string()),
    remediation: v.optional(v.array(v.string())),
    siteVisitRequired: v.optional(v.boolean()),
    submilestoneKey: v.string(),
    workosOrganizationId: v.string(),
  })
  .returns(recommendationResultValidator)
  .handler(async (ctx, args) => {
    const auth = await authorizeReview(ctx, args.buildId, args.workosOrganizationId);
    requireLenderStaff(auth);
    const { milestone, submilestone } = await getTarget(
      ctx,
      auth,
      args.milestoneKey,
      args.submilestoneKey,
    );
    assertExpectedRevision(submilestone, args.expectedRevision);
    const existing = await existingChildDecision(
      ctx,
      submilestone._id,
      args.idempotencyKey,
      "recommendation",
    );
    if (existing) {
      const requirement = existing.requirementId
        ? await ctx.db.get(existing.requirementId)
        : null;
      return {
        decisionId: existing._id,
        replayed: true,
        requirement,
        reviewRound: existing.reviewRound,
      };
    }
    if (submilestone.evidenceReviewState !== "in_review") {
      throw new ConvexError({ code: "SUBMILESTONE_NOT_IN_REVIEW", message: "Recommendations require an In Review child." });
    }
    const round = submilestone.evidenceReviewRound ?? 0;
    const requirement = await ensureSiteVisitRequirement(
      ctx,
      auth,
      milestone,
      submilestone,
      round,
      args.siteVisitRequired,
    );
    const now = Date.now();
    const resolvedSiteVisitRequired = requirement.required;
    const decisionId = await ctx.db.insert("buildSubmilestoneReviewDecisions", {
      actorRoles: normalizeRoleSlugs(auth.roles),
      actorWorkosUserId: auth.viewer.subject,
      brokerageId: auth.brokerage._id,
      buildId: auth.build._id,
      buildMilestoneId: milestone._id,
      buildSubmilestoneId: submilestone._id,
      createdAt: now,
      idempotencyKey: args.idempotencyKey,
      kind: "recommendation",
      milestoneKey: milestone.key,
      newState: JSON.stringify({ siteVisitRequired: resolvedSiteVisitRequired }),
      note: args.note?.trim() || undefined,
      organizationId: auth.organizationId,
      priorState: JSON.stringify({
        reviewDecisionState: submilestone.reviewDecisionState ?? "in_review",
      }),
      remediation: args.remediation?.map((item) => item.trim()).filter(Boolean),
      requirementId: requirement._id,
      reviewRound: round,
      siteVisitRequired: resolvedSiteVisitRequired,
      submilestoneKey: submilestone.key,
      warnings: requirement.riskSignals,
    });
    await ctx.db.patch(submilestone._id, {
      reviewDecisionId: decisionId,
      reviewRevision: (submilestone.reviewRevision ?? 0) + 1,
      siteVisitRequirementId: requirement._id,
      updatedAt: now,
    });
    await recordReviewAudit(ctx, auth, {
      command: "recommendActiveBuildSubmilestoneReview",
      entityId: String(submilestone._id),
      entityType: "buildSubmilestone",
      eventType: "active_build.submilestone.review.recommended",
      newState: JSON.stringify({ decisionId, siteVisitRequired: resolvedSiteVisitRequired }),
      priorState: JSON.stringify({ reviewRound: round }),
      reason: args.note,
      warnings: requirement.riskSignals,
    });
    return {
      decisionId,
      replayed: false,
      requirement,
      reviewRound: round,
    };
  })
  .public();

export const requestActiveBuildSubmilestoneChanges = authenticatedMutation
  .input({
    buildId: v.id("activeBuilds"),
    expectedRevision: v.optional(v.number()),
    idempotencyKey: v.string(),
    milestoneKey: v.string(),
    reason: v.string(),
    remediation: v.optional(v.array(v.string())),
    submilestoneKey: v.string(),
    workosOrganizationId: v.string(),
  })
  .returns(changesRequestedResultValidator)
  .handler(async (ctx, args) => {
    const auth = await authorizeReview(ctx, args.buildId, args.workosOrganizationId);
    requireLenderStaff(auth);
    const reason = nonBlank(args.reason, "Changes requested reason");
    const { milestone, submilestone } = await getTarget(
      ctx,
      auth,
      args.milestoneKey,
      args.submilestoneKey,
    );
    assertExpectedRevision(submilestone, args.expectedRevision);
    const existing = await existingChildDecision(
      ctx,
      submilestone._id,
      args.idempotencyKey,
      "changes_requested",
    );
    if (existing) {
      return {
        decisionId: existing._id,
        replayed: true,
        reviewRound: existing.reviewRound,
        status: "changes_requested" as const,
      };
    }
    if (submilestone.evidenceReviewState !== "in_review") {
      throw new ConvexError({ code: "SUBMILESTONE_NOT_IN_REVIEW", message: "Changes can be requested only from In Review." });
    }
    const round = submilestone.evidenceReviewRound ?? 0;
    const requirement = await ensureSiteVisitRequirement(ctx, auth, milestone, submilestone, round);
    const priorState = JSON.stringify({
      evidenceReviewState: submilestone.evidenceReviewState ?? "in_review",
      reviewDecisionState: submilestone.reviewDecisionState ?? "in_review",
      status: submilestone.status,
    });
    const now = Date.now();
    const decisionId = await ctx.db.insert("buildSubmilestoneReviewDecisions", {
      actorRoles: normalizeRoleSlugs(auth.roles),
      actorWorkosUserId: auth.viewer.subject,
      brokerageId: auth.brokerage._id,
      buildId: auth.build._id,
      buildMilestoneId: milestone._id,
      buildSubmilestoneId: submilestone._id,
      createdAt: now,
      idempotencyKey: args.idempotencyKey,
      kind: "changes_requested",
      milestoneKey: milestone.key,
      newState: JSON.stringify({ evidenceReviewState: "changes_requested", status: "in_progress" }),
      note: reason,
      organizationId: auth.organizationId,
      priorState,
      reason,
      remediation: args.remediation?.map((item) => item.trim()).filter(Boolean),
      requirementId: requirement._id,
      reviewRound: round,
      submilestoneKey: submilestone.key,
      warnings: requirement.riskSignals,
    });
    await ctx.db.patch(submilestone._id, {
      evidenceReviewState: "changes_requested",
      reviewDecisionId: decisionId,
      reviewDecisionState: "changes_requested",
      reviewRevision: (submilestone.reviewRevision ?? 0) + 1,
      status: "in_progress",
      updatedAt: now,
      workflowRevision: (submilestone.workflowRevision ?? 0) + 1,
    });
    const roundRow = await ctx.db
      .query("buildSubmilestoneReviewRounds")
      .withIndex("by_submilestone_round", (query) =>
        query.eq("buildSubmilestoneId", submilestone._id).eq("round", round),
      )
      .unique();
    if (roundRow) {
      await ctx.db.patch(roundRow._id, {
        remediation: args.remediation?.map((item) => item.trim()).filter(Boolean) ?? [],
        reviewedAt: now,
        reviewedByWorkosUserId: auth.viewer.subject,
        reviewNote: reason,
        status: "changes_requested",
      });
    }
    const newState = JSON.stringify({ evidenceReviewState: "changes_requested", status: "in_progress" });
    await recordReviewAudit(ctx, auth, {
      command: "requestActiveBuildSubmilestoneChanges",
      entityId: String(submilestone._id),
      entityType: "buildSubmilestone",
      eventType: "active_build.submilestone.review.changes_requested",
      newState,
      priorState,
      reason,
      warnings: requirement.riskSignals,
    });
    return { decisionId, replayed: false, reviewRound: round, status: "changes_requested" as const };
  })
  .public();

export const waiveActiveBuildSubmilestoneSiteVisit = authenticatedMutation
  .input({
    buildId: v.id("activeBuilds"),
    expectedRevision: v.optional(v.number()),
    idempotencyKey: v.string(),
    milestoneKey: v.string(),
    reason: v.string(),
    submilestoneKey: v.string(),
    workosOrganizationId: v.string(),
  })
  .returns(siteVisitWaivedResultValidator)
  .handler(async (ctx, args) => {
    const auth = await authorizeReview(ctx, args.buildId, args.workosOrganizationId);
    requireLenderAdmin(auth);
    const reason = nonBlank(args.reason, "Site Visit waiver reason");
    const { milestone, submilestone } = await getTarget(ctx, auth, args.milestoneKey, args.submilestoneKey);
    assertExpectedRevision(submilestone, args.expectedRevision);
    const existing = await existingChildDecision(
      ctx,
      submilestone._id,
      args.idempotencyKey,
      "site_visit_waived",
    );
    if (existing) {
      return {
        decisionId: existing._id,
        replayed: true,
        requirementId: existing.requirementId ?? null,
        status: "waived" as const,
      };
    }
    if (submilestone.evidenceReviewState !== "in_review") {
      throw new ConvexError({ code: "SUBMILESTONE_NOT_IN_REVIEW", message: "A Site Visit may be waived only during In Review." });
    }
    const round = submilestone.evidenceReviewRound ?? 0;
    const requirement = await ensureSiteVisitRequirement(ctx, auth, milestone, submilestone, round);
    if (!requirement.required || requirement.status !== "required") {
      throw new ConvexError({ code: "SITE_VISIT_NOT_REQUIRED", message: "This review has no required Site Visit to waive." });
    }
    const now = Date.now();
    const priorState = JSON.stringify({ status: requirement.status, required: requirement.required });
    const decisionId = await ctx.db.insert("buildSubmilestoneReviewDecisions", {
      actorRoles: normalizeRoleSlugs(auth.roles),
      actorWorkosUserId: auth.viewer.subject,
      brokerageId: auth.brokerage._id,
      buildId: auth.build._id,
      buildMilestoneId: milestone._id,
      buildSubmilestoneId: submilestone._id,
      createdAt: now,
      idempotencyKey: args.idempotencyKey,
      kind: "site_visit_waived",
      milestoneKey: milestone.key,
      newState: JSON.stringify({ status: "waived" }),
      organizationId: auth.organizationId,
      priorState,
      reason,
      requirementId: requirement._id,
      reviewRound: round,
      submilestoneKey: submilestone.key,
      warnings: requirement.riskSignals,
    });
    await ctx.db.patch(requirement._id, {
      status: "waived",
      updatedAt: now,
      waivedAt: now,
      waivedByRole: auth.effectiveRole.role,
      waivedByWorkosUserId: auth.viewer.subject,
      waiverReason: reason,
    });
    await ctx.db.patch(submilestone._id, {
      reviewDecisionId: decisionId,
      reviewRevision: (submilestone.reviewRevision ?? 0) + 1,
      siteVisitRequirementId: requirement._id,
      updatedAt: now,
      workflowRevision: (submilestone.workflowRevision ?? 0) + 1,
    });
    await recordReviewAudit(ctx, auth, {
      command: "waiveActiveBuildSubmilestoneSiteVisit",
      entityId: String(submilestone._id),
      entityType: "buildSubmilestone",
      eventType: "active_build.submilestone.site_visit.waived",
      newState: JSON.stringify({ requirementId: requirement._id, status: "waived" }),
      priorState,
      reason,
      warnings: requirement.riskSignals,
    });
    return { decisionId, replayed: false, requirementId: requirement._id, status: "waived" as const };
  })
  .public();

export const approveActiveBuildSubmilestone = authenticatedMutation
  .input({
    buildId: v.id("activeBuilds"),
    expectedRevision: v.optional(v.number()),
    idempotencyKey: v.string(),
    milestoneKey: v.string(),
    note: v.optional(v.string()),
    submilestoneKey: v.string(),
    workosOrganizationId: v.string(),
  })
  .returns(childApprovedResultValidator)
  .handler(async (ctx, args) => {
    const auth = await authorizeReview(ctx, args.buildId, args.workosOrganizationId);
    requireLenderAdmin(auth);
    const { milestone, submilestone, submilestones } = await getTarget(ctx, auth, args.milestoneKey, args.submilestoneKey);
    assertExpectedRevision(submilestone, args.expectedRevision);
    const existing = await existingChildDecision(
      ctx,
      submilestone._id,
      args.idempotencyKey,
      "approved",
    );
    if (existing) {
      const readiness = await parentReadiness(submilestones);
      return {
        decisionId: existing._id,
        parentReadyForApproval: readiness.readyForApproval,
        replayed: true,
        status: "approved" as const,
      };
    }
    if (submilestone.evidenceReviewState !== "in_review") {
      throw new ConvexError({ code: "SUBMILESTONE_NOT_IN_REVIEW", message: "Final child approval requires an In Review child." });
    }
    const round = submilestone.evidenceReviewRound ?? 0;
    const requirement = await ensureSiteVisitRequirement(ctx, auth, milestone, submilestone, round);
    let siteVisitId: Id<"buildSiteVisits"> | undefined;
    if (requirement.required && requirement.status !== "waived") {
      const visit = await currentRequirementVisit(ctx, submilestone, requirement);
      if (!visit) {
        throw new ConvexError({ code: "SITE_VISIT_REQUIRED", message: "A required Site Visit must be completed before child approval." });
      }
      if (visit.status !== "complete") {
        throw new ConvexError({ code: "SITE_VISIT_REQUIRED", message: "A required Site Visit report must be completed before child approval." });
      }
      siteVisitId = visit._id;
    }
    const now = Date.now();
    const priorState = JSON.stringify({
      evidenceReviewState: submilestone.evidenceReviewState,
      reviewDecisionState: submilestone.reviewDecisionState ?? "in_review",
      status: submilestone.status,
    });
    const decisionId = await ctx.db.insert("buildSubmilestoneReviewDecisions", {
      actorRoles: normalizeRoleSlugs(auth.roles),
      actorWorkosUserId: auth.viewer.subject,
      brokerageId: auth.brokerage._id,
      buildId: auth.build._id,
      buildMilestoneId: milestone._id,
      buildSubmilestoneId: submilestone._id,
      createdAt: now,
      idempotencyKey: args.idempotencyKey,
      kind: "approved",
      milestoneKey: milestone.key,
      newState: JSON.stringify({ evidenceReviewState: "approved", status: "complete" }),
      note: args.note?.trim() || undefined,
      organizationId: auth.organizationId,
      priorState,
      requirementId: requirement.required ? requirement._id : undefined,
      reviewRound: round,
      siteVisitId,
      submilestoneKey: submilestone.key,
      warnings: requirement.riskSignals,
    });
    if (requirement.required && requirement.status !== "waived") {
      await ctx.db.patch(requirement._id, {
        siteVisitId,
        status: "satisfied",
        updatedAt: now,
      });
    }
    await ctx.db.patch(submilestone._id, {
      completedAt: submilestone.completedAt ?? now,
      completedByWorkosUserId: submilestone.completedByWorkosUserId ?? auth.viewer.subject,
      evidenceReviewState: "approved",
      reviewDecisionId: decisionId,
      reviewDecisionState: "approved",
      reviewRevision: (submilestone.reviewRevision ?? 0) + 1,
      siteVisitRequirementId: requirement._id,
      status: "complete",
      updatedAt: now,
      workflowRevision: (submilestone.workflowRevision ?? 0) + 1,
    });
    const roundRow = await ctx.db
      .query("buildSubmilestoneReviewRounds")
      .withIndex("by_submilestone_round", (query) =>
        query.eq("buildSubmilestoneId", submilestone._id).eq("round", round),
      )
      .unique();
    if (roundRow) {
      await ctx.db.patch(roundRow._id, {
        reviewedAt: now,
        reviewedByWorkosUserId: auth.viewer.subject,
        reviewNote: args.note?.trim() || undefined,
        status: "approved",
      });
    }
    const readiness = await parentReadiness(submilestones.map((row) => (row._id === submilestone._id ? { ...row, reviewDecisionState: "approved" as const, status: "complete" as const } : row)));
    await ctx.db.patch(milestone._id, {
      reviewDecisionState: readiness.readyForApproval ? "ready_for_approval" : "in_review",
      reviewRevision: (milestone.reviewRevision ?? 0) + 1,
      updatedAt: now,
    });
    await recordReviewAudit(ctx, auth, {
      command: "approveActiveBuildSubmilestone",
      entityId: String(submilestone._id),
      entityType: "buildSubmilestone",
      eventType: "active_build.submilestone.review.approved",
      newState: JSON.stringify({ decisionId, status: "approved" }),
      priorState,
      reason: args.note,
      warnings: requirement.riskSignals,
    });
    return { decisionId, parentReadyForApproval: readiness.readyForApproval, replayed: false, status: "approved" as const };
  })
  .public();

export const retractActiveBuildSubmilestoneApproval = authenticatedMutation
  .input({
    buildId: v.id("activeBuilds"),
    expectedRevision: v.optional(v.number()),
    idempotencyKey: v.string(),
    milestoneKey: v.string(),
    reason: v.string(),
    submilestoneKey: v.string(),
    workosOrganizationId: v.string(),
  })
  .returns(childReopenedResultValidator)
  .handler(async (ctx, args) => {
    const auth = await authorizeReview(ctx, args.buildId, args.workosOrganizationId);
    requireLenderAdmin(auth);
    const reason = nonBlank(args.reason, "Child approval retraction reason");
    const { milestone, submilestone, submilestones } = await getTarget(
      ctx,
      auth,
      args.milestoneKey,
      args.submilestoneKey,
    );
    assertExpectedRevision(submilestone, args.expectedRevision);
    const existing = await existingChildDecision(
      ctx,
      submilestone._id,
      args.idempotencyKey,
      "retracted",
    );
    if (existing) {
      return {
        decisionId: existing._id,
        replayed: true,
        status: "reopened" as const,
      };
    }
    if (submilestone.reviewDecisionState !== "approved") {
      throw new ConvexError({ code: "SUBMILESTONE_NOT_APPROVED", message: "Only an approved child can be retracted." });
    }
    const now = Date.now();
    const priorState = JSON.stringify({ reviewDecisionState: "approved", status: submilestone.status });
    const decisionId = await ctx.db.insert("buildSubmilestoneReviewDecisions", {
      actorRoles: normalizeRoleSlugs(auth.roles),
      actorWorkosUserId: auth.viewer.subject,
      brokerageId: auth.brokerage._id,
      buildId: auth.build._id,
      buildMilestoneId: milestone._id,
      buildSubmilestoneId: submilestone._id,
      createdAt: now,
      idempotencyKey: args.idempotencyKey,
      kind: "retracted",
      milestoneKey: milestone.key,
      newState: JSON.stringify({ reviewDecisionState: "reopened", status: "in_progress" }),
      organizationId: auth.organizationId,
      priorState,
      reason,
      reviewRound: submilestone.evidenceReviewRound ?? 0,
      submilestoneKey: submilestone.key,
      warnings: [],
    });
    await ctx.db.patch(submilestone._id, {
      evidenceReviewState: "changes_requested",
      reviewDecisionId: decisionId,
      reviewDecisionState: "reopened",
      reviewRevision: (submilestone.reviewRevision ?? 0) + 1,
      status: "in_progress",
      updatedAt: now,
      workflowRevision: (submilestone.workflowRevision ?? 0) + 1,
    });
    const parentWasApproved = milestone.reviewDecisionState === "approved";
    const readiness = await parentReadiness(
      submilestones.map((child) =>
        child._id === submilestone._id
          ? {
              ...child,
              reviewDecisionState: "reopened" as const,
              status: "in_progress" as const,
            }
          : child,
      ),
    );
    const parentReviewDecisionState = parentWasApproved
      ? "reopened"
      : readiness.readyForApproval
        ? "ready_for_approval"
        : "in_review";
    await ctx.db.patch(milestone._id, {
      reviewDecisionState: parentReviewDecisionState,
      reviewRevision: (milestone.reviewRevision ?? 0) + 1,
      status: milestone.status === "complete" ? "in_progress" : milestone.status,
      updatedAt: now,
    });
    await syncSystemPost(ctx, auth, milestone, "open", reason);
    await recordReviewAudit(ctx, auth, {
      command: "retractActiveBuildSubmilestoneApproval",
      entityId: String(submilestone._id),
      entityType: "buildSubmilestone",
      eventType: "active_build.submilestone.review.retracted",
      newState: JSON.stringify({
        decisionId,
        parentReviewDecisionState,
        reviewDecisionState: "reopened",
      }),
      priorState,
      reason,
    });
    return { decisionId, replayed: false, status: "reopened" as const };
  })
  .public();

export const approveActiveBuildMilestoneReview = authenticatedMutation
  .input({
    buildId: v.id("activeBuilds"),
    expectedRevision: v.optional(v.number()),
    idempotencyKey: v.string(),
    milestoneKey: v.string(),
    reason: v.optional(v.string()),
    workosOrganizationId: v.string(),
  })
  .returns(milestoneApprovedResultValidator)
  .handler(async (ctx, args) => {
    const auth = await authorizeReview(ctx, args.buildId, args.workosOrganizationId);
    requireLenderAdmin(auth);
    const milestone = await ctx.db
      .query("buildMilestones")
      .withIndex("by_build_key", (query) => query.eq("buildId", auth.build._id).eq("key", args.milestoneKey))
      .unique();
    if (!milestone) throw new ConvexError({ code: "MILESTONE_NOT_FOUND", message: "Milestone is unavailable." });
    assertExpectedMilestoneRevision(milestone, args.expectedRevision);
    const existing = await existingParentDecision(
      ctx,
      milestone._id,
      args.idempotencyKey,
      "approved",
    );
    if (existing) {
      return {
        decisionId: existing._id,
        replayed: true,
        status: "approved" as const,
      };
    }
    const submilestones = await ctx.db
      .query("buildSubmilestones")
      .withIndex("by_milestone", (query) => query.eq("buildMilestoneId", milestone._id))
      .take(500);
    const readiness = await parentReadiness(submilestones);
    if (readiness.childCount === 0) {
      throw new ConvexError({
        code: "MILESTONE_NO_ACTIVE_CHILDREN",
        message:
          "A Milestone with no active Sub-milestones cannot enter parent approval.",
        ...readiness,
      });
    }
    if (!readiness.readyForApproval) {
      throw new ConvexError({
        code: "MILESTONE_NOT_READY_FOR_APPROVAL",
        message: "Every required child must be independently approved before parent approval.",
        ...readiness,
      });
    }
    const now = Date.now();
    const priorState = JSON.stringify({ reviewDecisionState: milestone.reviewDecisionState ?? "ready_for_approval", status: milestone.status });
    const decisionId = await ctx.db.insert("buildMilestoneReviewDecisions", {
      actorRoles: normalizeRoleSlugs(auth.roles),
      actorWorkosUserId: auth.viewer.subject,
      brokerageId: auth.brokerage._id,
      buildId: auth.build._id,
      buildMilestoneId: milestone._id,
      createdAt: now,
      idempotencyKey: args.idempotencyKey,
      kind: "approved",
      milestoneKey: milestone.key,
      newState: JSON.stringify({ reviewDecisionState: "approved", status: "complete" }),
      organizationId: auth.organizationId,
      priorState,
      reason: args.reason?.trim() || undefined,
      reviewRevision: (milestone.reviewRevision ?? 0) + 1,
      warnings: [],
    });
    await ctx.db.patch(milestone._id, {
      completionReview: {
        ...(milestone.completionReview && typeof milestone.completionReview === "object" ? milestone.completionReview : {}),
        reviewedAt: new Date(now).toISOString(),
        status: "approved",
      },
      evidenceState: "Approved",
      reviewDecisionId: decisionId,
      reviewDecisionState: "approved",
      reviewRevision: (milestone.reviewRevision ?? 0) + 1,
      status: "complete",
      updatedAt: now,
    });
    await syncSystemPost(ctx, auth, milestone, "resolved", args.reason);
    await recordReviewAudit(ctx, auth, {
      command: "approveActiveBuildMilestoneReview",
      entityId: String(milestone._id),
      entityType: "buildMilestone",
      eventType: "active_build.milestone.review.approved",
      newState: JSON.stringify({ decisionId, reviewDecisionState: "approved", status: "complete" }),
      priorState,
      reason: args.reason,
    });
    return { decisionId, replayed: false, status: "approved" as const };
  })
  .public();

export const retractActiveBuildMilestoneApproval = authenticatedMutation
  .input({
    buildId: v.id("activeBuilds"),
    expectedRevision: v.optional(v.number()),
    idempotencyKey: v.string(),
    milestoneKey: v.string(),
    reason: v.string(),
    workosOrganizationId: v.string(),
  })
  .returns(milestoneReopenedResultValidator)
  .handler(async (ctx, args) => {
    const auth = await authorizeReview(ctx, args.buildId, args.workosOrganizationId);
    requireLenderAdmin(auth);
    const reason = nonBlank(args.reason, "Parent approval retraction reason");
    const milestone = await ctx.db
      .query("buildMilestones")
      .withIndex("by_build_key", (query) => query.eq("buildId", auth.build._id).eq("key", args.milestoneKey))
      .unique();
    if (!milestone) throw new ConvexError({ code: "MILESTONE_NOT_FOUND", message: "Milestone is unavailable." });
    assertExpectedMilestoneRevision(milestone, args.expectedRevision);
    const existing = await existingParentDecision(
      ctx,
      milestone._id,
      args.idempotencyKey,
      "retracted",
    );
    if (existing) {
      return {
        decisionId: existing._id,
        replayed: true,
        status: "reopened" as const,
      };
    }
    if (milestone.reviewDecisionState !== "approved") {
      throw new ConvexError({ code: "MILESTONE_NOT_APPROVED", message: "Only an approved Milestone can be retracted." });
    }
    const now = Date.now();
    const priorState = JSON.stringify({ reviewDecisionState: "approved", status: milestone.status });
    const decisionId = await ctx.db.insert("buildMilestoneReviewDecisions", {
      actorRoles: normalizeRoleSlugs(auth.roles),
      actorWorkosUserId: auth.viewer.subject,
      brokerageId: auth.brokerage._id,
      buildId: auth.build._id,
      buildMilestoneId: milestone._id,
      createdAt: now,
      idempotencyKey: args.idempotencyKey,
      kind: "retracted",
      milestoneKey: milestone.key,
      newState: JSON.stringify({ reviewDecisionState: "reopened", status: "in_progress" }),
      organizationId: auth.organizationId,
      priorState,
      reason,
      reviewRevision: (milestone.reviewRevision ?? 0) + 1,
      warnings: [],
    });
    await ctx.db.patch(milestone._id, {
      completionReview: {
        ...(milestone.completionReview && typeof milestone.completionReview === "object" ? milestone.completionReview : {}),
        reviewedAt: new Date(now).toISOString(),
        status: "pending",
      },
      evidenceState: "Approval retracted",
      reviewDecisionId: decisionId,
      reviewDecisionState: "reopened",
      reviewRevision: (milestone.reviewRevision ?? 0) + 1,
      status: "in_progress",
      updatedAt: now,
    });
    await syncSystemPost(ctx, auth, milestone, "open", reason);
    await recordReviewAudit(ctx, auth, {
      command: "retractActiveBuildMilestoneApproval",
      entityId: String(milestone._id),
      entityType: "buildMilestone",
      eventType: "active_build.milestone.review.retracted",
      newState: JSON.stringify({ decisionId, reviewDecisionState: "reopened", status: "in_progress" }),
      priorState,
      reason,
    });
    return { decisionId, replayed: false, status: "reopened" as const };
  })
  .public();
