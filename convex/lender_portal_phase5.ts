import { type PaginationOptions, paginationOptsValidator } from "convex/server";
import { ConvexError, v } from "convex/values";

import type { Doc, Id } from "./_generated/dataModel";
import {
  type ActiveLenderOrganizationContext,
  type AuthorizedViewer,
  adminMutation,
  adminQuery,
  authenticatedMutation,
  authenticatedQuery,
  lenderOrganizationMutation,
  lenderOrganizationQuery,
  requireActiveWorkosUser,
  requireLenderOrganizationPermission,
} from "./authz";
import {
  type LenderPortalReviewEvidenceReference,
  type LenderPortalReviewGroup,
  type LenderPortalReviewRequestState,
  type LenderPortalReviewRequirements,
  type LenderPortalReviewTarget,
  lenderPortalBuilderRequestProjectionValidator,
  lenderPortalDecisionResultValidator,
  lenderPortalReviewEvidenceProjectionValidator,
  lenderPortalReviewerQueuePageValidator,
  lenderPortalReviewerRequestProjectionValidator,
  lenderPortalReviewTargetValidator,
  lenderPortalSiteVisitCompletionResultValidator,
  lenderPortalSubmitReviewResultValidator,
} from "./lender_portal_phase5_contracts";
import { getLenderOrganizationApprovalEligibility } from "./lenderOrganizationAccess";
import {
  enqueueReviewApprovalOutcomeNotifications,
  enqueueReviewApprovalRequiredNotifications,
} from "./lender_portal_notifications";
import type { MutationCtx, QueryCtx } from "./types";

const MAX_CYCLE_DECISIONS = 1001;
const EVIDENCE_REFERENCE_LIMIT = 500;
const COST_DOCUMENT_LIMIT = 100;

type ReviewCtx = QueryCtx | MutationCtx;
type ViewerReviewCtx = ReviewCtx & { viewer: AuthorizedViewer };
type LenderReviewCtx = ViewerReviewCtx & {
  activeOrganization: ActiveLenderOrganizationContext;
};
type ReviewActorRole = "admin" | "builder" | "lender" | "lender-admin";
type EligibleLenderApprover = {
  assignmentId: Id<"lenderOrganizationAssignments">;
  eligibilityEpoch: string;
};
type EligibleLenderApprovers = Map<string, EligibleLenderApprover>;

type ResolvedReviewTarget =
  | {
      build: Doc<"activeBuilds">;
      kind: "milestone";
      label: string;
      record: Doc<"buildMilestones">;
      requestIdentity: string;
    }
  | {
      build: Doc<"activeBuilds">;
      kind: "draw";
      label: string;
      record: Doc<"activeBuildDrawRequests">;
      requestIdentity: string;
    };

const decisionInput = {
  decision: v.union(v.literal("approved"), v.literal("rejected")),
  expectedCycleNumber: v.number(),
  idempotencyKey: v.string(),
  privateRationale: v.optional(v.string()),
  revisionInstructions: v.optional(v.string()),
  target: lenderPortalReviewTargetValidator,
};

const submitInput = {
  costDocumentIds: v.optional(v.array(v.id("costDocuments"))),
  expectedCycleNumber: v.number(),
  idempotencyKey: v.string(),
  target: lenderPortalReviewTargetValidator,
  workosOrganizationId: v.string(),
};

export const submitBuilderReviewRequest = authenticatedMutation
  .input(submitInput)
  .returns(lenderPortalSubmitReviewResultValidator)
  .handler(async (ctx, args) => {
    const target = await resolveReviewTarget(ctx, args.target);
    await requireBuilderTargetAccess(ctx, target, args.workosOrganizationId);
    return await submitReviewCycle(ctx, {
      actorWorkosUserId: ctx.viewer.subject,
      costDocumentIds: args.costDocumentIds ?? [],
      expectedCycleNumber: args.expectedCycleNumber,
      idempotencyKey: args.idempotencyKey,
      target,
    });
  })
  .public();

export const decideBackofficeReviewRequest = adminMutation
  .input({ ...decisionInput, workosOrganizationId: v.string() })
  .returns(lenderPortalDecisionResultValidator)
  .handler(async (ctx, args) => {
    const target = await resolveReviewTarget(ctx, args.target);
    await requireBackofficeTargetAccess(ctx, target, args.workosOrganizationId);
    return await recordReviewDecision(ctx, {
      actorRole: "admin",
      actorWorkosUserId: ctx.viewer.subject,
      decision: args.decision,
      expectedCycleNumber: args.expectedCycleNumber,
      group: "backoffice",
      idempotencyKey: args.idempotencyKey,
      privateRationale: args.privateRationale,
      revisionInstructions: args.revisionInstructions,
      target,
    });
  })
  .public();

export const decideLenderReviewRequest = lenderOrganizationMutation
  .input({ ...decisionInput })
  .returns(lenderPortalDecisionResultValidator)
  .handler(async (ctx, args) => {
    const target = await resolveReviewTarget(ctx, args.target);
    await requireLenderTargetAccess(ctx, target, true);
    return await recordReviewDecision(ctx, {
      actorRole: ctx.activeOrganization.roles.includes("lender-admin")
        ? "lender-admin"
        : ctx.activeOrganization.roles.includes("admin")
          ? "admin"
          : "lender",
      actorWorkosUserId: ctx.activeOrganization.workosUserId,
      decision: args.decision,
      expectedCycleNumber: args.expectedCycleNumber,
      group: "lender",
      idempotencyKey: args.idempotencyKey,
      privateRationale: args.privateRationale,
      revisionInstructions: args.revisionInstructions,
      target,
    });
  })
  .public();

export const getBuilderReviewRequest = authenticatedQuery
  .input({
    historyPaginationOpts: paginationOptsValidator,
    target: lenderPortalReviewTargetValidator,
    workosOrganizationId: v.string(),
  })
  .returns(lenderPortalBuilderRequestProjectionValidator)
  .handler(async (ctx, args) => {
    const target = await resolveReviewTarget(ctx, args.target);
    await requireBuilderTargetAccess(ctx, target, args.workosOrganizationId);
    const cycle = await requireCurrentCycle(ctx, target);
    return await builderProjection(
      ctx,
      target,
      cycle,
      args.historyPaginationOpts
    );
  })
  .public();

export const listBackofficeReviewRequests = adminQuery
  .input({
    buildId: v.id("activeBuilds"),
    paginationOpts: paginationOptsValidator,
    workosOrganizationId: v.string(),
  })
  .returns(lenderPortalReviewerQueuePageValidator)
  .handler(async (ctx, args) => {
    const build = await requireBuild(ctx, args.buildId);
    await requireBackofficeBuildAccess(ctx, build, args.workosOrganizationId);
    return await reviewerQueueProjection(
      ctx,
      build,
      "backoffice",
      {
        actorWorkosUserId: ctx.viewer.subject,
      },
      args.paginationOpts
    );
  })
  .public();

export const getBackofficeReviewRequest = adminQuery
  .input({
    historyPaginationOpts: paginationOptsValidator,
    target: lenderPortalReviewTargetValidator,
    workosOrganizationId: v.string(),
  })
  .returns(lenderPortalReviewerRequestProjectionValidator)
  .handler(async (ctx, args) => {
    const target = await resolveReviewTarget(ctx, args.target);
    await requireBackofficeTargetAccess(ctx, target, args.workosOrganizationId);
    return await reviewerDetailProjection(
      ctx,
      target,
      args.historyPaginationOpts
    );
  })
  .public();

export const listLenderReviewRequests = lenderOrganizationQuery
  .input({
    buildId: v.id("activeBuilds"),
    paginationOpts: paginationOptsValidator,
  })
  .returns(lenderPortalReviewerQueuePageValidator)
  .handler(async (ctx, args) => {
    const build = await requireBuild(ctx, args.buildId);
    await requireLenderBuildAccess(ctx, build);
    const eligibility = await getLenderOrganizationApprovalEligibility(
      ctx,
      ctx.activeOrganization.lenderOrganizationId
    );
    return await reviewerQueueProjection(
      ctx,
      build,
      "lender",
      {
        actorWorkosUserId: ctx.activeOrganization.workosUserId,
        eligibleLenderWorkosUserIds: {
          draw: new Map(
            eligibility.members.draw.map((member) => [
              member.workosUserId,
              {
                assignmentId: member.assignmentId,
                eligibilityEpoch: member.eligibilityEpoch,
              },
            ])
          ),
          milestone: new Map(
            eligibility.members.milestone.map((member) => [
              member.workosUserId,
              {
                assignmentId: member.assignmentId,
                eligibilityEpoch: member.eligibilityEpoch,
              },
            ])
          ),
        },
      },
      args.paginationOpts
    );
  })
  .public();

export const getLenderReviewRequest = lenderOrganizationQuery
  .input({
    historyPaginationOpts: paginationOptsValidator,
    target: lenderPortalReviewTargetValidator,
  })
  .returns(lenderPortalReviewerRequestProjectionValidator)
  .handler(async (ctx, args) => {
    const target = await resolveReviewTarget(ctx, args.target);
    await requireLenderTargetAccess(ctx, target, false);
    return await reviewerDetailProjection(
      ctx,
      target,
      args.historyPaginationOpts
    );
  })
  .public();

export const getLenderNotificationReviewRequest = lenderOrganizationQuery
  .input({
    historyPaginationOpts: paginationOptsValidator,
    reviewCycleId: v.id("lenderPortalReviewCycles"),
    reviewCycleNumber: v.number(),
    target: lenderPortalReviewTargetValidator,
  })
  .returns(lenderPortalReviewerRequestProjectionValidator)
  .handler(async (ctx, args) => {
    const target = await resolveReviewTarget(ctx, args.target);
    await requireLenderTargetAccess(ctx, target, false);
    const current = await requireCurrentCycle(ctx, target);
    if (
      current._id !== args.reviewCycleId ||
      current.cycleNumber !== args.reviewCycleNumber
    ) {
      throw safeUnavailableError();
    }
    return await reviewerDetailProjection(
      ctx,
      target,
      args.historyPaginationOpts,
    );
  })
  .public();

export const getBackofficeNotificationReviewRequest = adminQuery
  .input({
    historyPaginationOpts: paginationOptsValidator,
    reviewCycleId: v.id("lenderPortalReviewCycles"),
    reviewCycleNumber: v.number(),
    target: lenderPortalReviewTargetValidator,
    workosOrganizationId: v.string(),
  })
  .returns(lenderPortalReviewerRequestProjectionValidator)
  .handler(async (ctx, args) => {
    const target = await resolveReviewTarget(ctx, args.target);
    await requireBackofficeTargetAccess(ctx, target, args.workosOrganizationId);
    const current = await requireCurrentCycle(ctx, target);
    if (
      current._id !== args.reviewCycleId ||
      current.cycleNumber !== args.reviewCycleNumber
    ) {
      throw safeUnavailableError();
    }
    return await reviewerDetailProjection(
      ctx,
      target,
      args.historyPaginationOpts,
    );
  })
  .public();

export const getBuilderNotificationReviewRequest = authenticatedQuery
  .input({
    historyPaginationOpts: paginationOptsValidator,
    reviewCycleId: v.id("lenderPortalReviewCycles"),
    reviewCycleNumber: v.number(),
    target: lenderPortalReviewTargetValidator,
    workosOrganizationId: v.string(),
  })
  .returns(lenderPortalBuilderRequestProjectionValidator)
  .handler(async (ctx, args) => {
    const target = await resolveReviewTarget(ctx, args.target);
    await requireBuilderTargetAccess(ctx, target, args.workosOrganizationId);
    const current = await requireCurrentCycle(ctx, target);
    if (
      current._id !== args.reviewCycleId ||
      current.cycleNumber !== args.reviewCycleNumber
    ) {
      throw safeUnavailableError();
    }
    return await builderProjection(
      ctx,
      target,
      current,
      args.historyPaginationOpts,
    );
  })
  .public();

const reviewEvidenceInput = {
  cycleId: v.id("lenderPortalReviewCycles"),
  target: lenderPortalReviewTargetValidator,
};

export const getBackofficeReviewEvidence = adminQuery
  .input({ ...reviewEvidenceInput, workosOrganizationId: v.string() })
  .returns(lenderPortalReviewEvidenceProjectionValidator)
  .handler(async (ctx, args) => {
    const target = await resolveReviewTarget(ctx, args.target);
    await requireBackofficeTargetAccess(ctx, target, args.workosOrganizationId);
    return await reviewEvidenceProjection(ctx, target, args.cycleId);
  })
  .public();

export const getLenderReviewEvidence = lenderOrganizationQuery
  .input(reviewEvidenceInput)
  .returns(lenderPortalReviewEvidenceProjectionValidator)
  .handler(async (ctx, args) => {
    const target = await resolveReviewTarget(ctx, args.target);
    await requireLenderTargetAccess(ctx, target, false);
    return await reviewEvidenceProjection(ctx, target, args.cycleId);
  })
  .public();

export async function submitCanonicalReviewCycle(
  ctx: MutationCtx,
  input: {
    actorWorkosUserId: string;
    costDocumentIds?: Id<"costDocuments">[];
    expectedCycleNumber: number;
    idempotencyKey: string;
    target: LenderPortalReviewTarget;
  }
) {
  const target = await resolveReviewTarget(ctx, input.target);
  return await submitReviewCycle(ctx, {
    actorWorkosUserId: input.actorWorkosUserId,
    costDocumentIds: input.costDocumentIds ?? [],
    expectedCycleNumber: input.expectedCycleNumber,
    idempotencyKey: input.idempotencyKey,
    target,
  });
}

export async function recordCanonicalBackofficeReviewDecision(
  ctx: MutationCtx,
  input: {
    actorWorkosUserId: string;
    decision: "approved" | "rejected";
    expectedCycleNumber: number;
    idempotencyKey: string;
    privateRationale?: string;
    revisionInstructions?: string;
    target: LenderPortalReviewTarget;
  }
) {
  const target = await resolveReviewTarget(ctx, input.target);
  return await recordReviewDecision(ctx, {
    actorRole: "admin",
    actorWorkosUserId: input.actorWorkosUserId,
    decision: input.decision,
    expectedCycleNumber: input.expectedCycleNumber,
    group: "backoffice",
    idempotencyKey: input.idempotencyKey,
    privateRationale: input.privateRationale,
    revisionInstructions: input.revisionInstructions,
    target,
  });
}

export async function requireCanonicalReviewCycleCompleted(
  ctx: MutationCtx,
  targetInput: LenderPortalReviewTarget,
  expectedCycleNumber: number
) {
  const target = await resolveReviewTarget(ctx, targetInput);
  const cycle = await requireCurrentCycle(ctx, target);
  const currentRequirements = await lockedReviewRequirements(ctx, target);
  if (
    !cycle.isCurrent ||
    cycle.cycleNumber !== expectedCycleNumber ||
    cycle.state !== "completed" ||
    target.record.lenderPortalReviewState !== "completed" ||
    JSON.stringify(cycle.requirements) !== JSON.stringify(currentRequirements) ||
    (target.kind === "milestone"
      ? cycle.milestoneId !== target.record._id || cycle.drawRequestId !== undefined
      : cycle.drawRequestId !== target.record._id || cycle.milestoneId !== undefined)
  ) {
    throw new ConvexError({
      code: "REVIEW_CYCLE_COMPLETION_REQUIRED",
      message:
        "The current locked-policy review cycle must complete before this command.",
      recoverable: true,
    });
  }
  const contributorIds = new Set(
    cycle.terminalContributorDecisionIds?.map(String) ?? []
  );
  const decisions = await ctx.db
    .query("lenderPortalReviewDecisions")
    .withIndex("by_cycle", (query) => query.eq("cycleId", cycle._id))
    .take(MAX_CYCLE_DECISIONS + 1);
  if (decisions.length > MAX_CYCLE_DECISIONS) {
    throw safeUnavailableError();
  }
  const contributors = decisions.filter((decision) =>
    contributorIds.has(String(decision._id))
  );
  const backofficeSatisfied =
    !cycle.requirements.requiredGroups.includes("backoffice") ||
    contributors.some(
      (decision) =>
        decision.group === "backoffice" && decision.decision === "approved"
    );
  const lenderSatisfied =
    !cycle.requirements.requiredGroups.includes("lender") ||
    contributors.filter(
      (decision) =>
        decision.group === "lender" &&
        decision.decision === "approved" &&
        decision.lenderEligibilityEpoch !== undefined &&
        decision.lenderOrganizationAssignmentId !== undefined
    ).length >= (cycle.requirements.lenderQuorum ?? 1);
  if (
    contributorIds.size !== contributors.length ||
    contributors.some((decision) => decision.cycleId !== cycle._id) ||
    !backofficeSatisfied ||
    !lenderSatisfied
  ) {
    throw new ConvexError({
      code: "REVIEW_CYCLE_TERMINAL_CONTRIBUTORS_INVALID",
      message: "The terminal review contribution record is unavailable.",
      recoverable: false,
    });
  }
  return { cycle, target };
}

async function resolveReviewTarget(
  ctx: ReviewCtx,
  target: LenderPortalReviewTarget
): Promise<ResolvedReviewTarget> {
  if (target.kind === "milestone") {
    const milestone = await ctx.db.get(target.milestoneId);
    if (!milestone || milestone.planningState === "superseded") {
      throw safeUnavailableError();
    }
    const build = await requireBuild(ctx, milestone.buildId);
    if (
      milestone.brokerageId !== build.brokerageId ||
      milestone.organizationId !== build.organizationId
    ) {
      throw safeUnavailableError();
    }
    return {
      build,
      kind: "milestone",
      label: milestone.name,
      record: milestone,
      requestIdentity: `milestone:${String(milestone._id)}`,
    };
  }

  const draw = await ctx.db.get(target.drawRequestId);
  if (!draw) {
    throw safeUnavailableError();
  }
  const build = await requireBuild(ctx, draw.buildId);
  if (
    draw.brokerageId !== build.brokerageId ||
    draw.organizationId !== build.organizationId
  ) {
    throw safeUnavailableError();
  }
  return {
    build,
    kind: "draw",
    label: `${draw.displayId} · ${draw.label}`,
    record: draw,
    requestIdentity: `draw:${String(draw._id)}`,
  };
}

async function requireBuild(ctx: ReviewCtx, buildId: Id<"activeBuilds">) {
  const build = await ctx.db.get(buildId);
  if (!build) {
    throw safeUnavailableError();
  }
  return build;
}

async function requireActiveOrganizationMembership(
  ctx: ViewerReviewCtx,
  organizationId: string
) {
  try {
    await requireActiveWorkosUser(ctx, ctx.viewer.subject);
  } catch {
    throw safeUnavailableError();
  }
  const memberships = await ctx.db
    .query("workosOrganizationMemberships")
    .withIndex("by_user_and_organization", (query) =>
      query
        .eq("workosUserId", ctx.viewer.subject)
        .eq("workosOrganizationId", organizationId)
    )
    .take(2);
  if (!memberships.some((membership) => membership.status === "active")) {
    throw safeUnavailableError();
  }
}

async function requireBuilderTargetAccess(
  ctx: ViewerReviewCtx,
  target: ResolvedReviewTarget,
  organizationId: string
) {
  if (organizationId !== target.build.organizationId) {
    throw safeUnavailableError();
  }
  await requireActiveOrganizationMembership(ctx, organizationId);
  if (
    !ctx.viewer.roles.some((role) =>
      ["admin", "builder", "builder-staff"].includes(role)
    )
  ) {
    throw safeUnavailableError();
  }
  if (ctx.viewer.roles.includes("admin")) {
    return;
  }
  const proposal = await ctx.db.get(target.build.proposalId);
  if (!proposal?.builderProfileId) {
    throw safeUnavailableError();
  }
  const link = await ctx.db
    .query("builderAccountLinks")
    .withIndex("by_builder_user", (query) =>
      query
        .eq(
          "builderProfileId",
          proposal.builderProfileId as Id<"builderProfiles">
        )
        .eq("workosUserId", ctx.viewer.subject)
    )
    .unique();
  if (!link || link.status !== "active") {
    throw safeUnavailableError();
  }
}

async function requireBackofficeTargetAccess(
  ctx: ViewerReviewCtx,
  target: ResolvedReviewTarget,
  organizationId: string
) {
  await requireBackofficeBuildAccess(ctx, target.build, organizationId);
}

async function requireBackofficeBuildAccess(
  ctx: ViewerReviewCtx,
  build: Doc<"activeBuilds">,
  organizationId: string
) {
  if (organizationId !== build.organizationId) {
    throw safeUnavailableError();
  }
  await requireActiveOrganizationMembership(ctx, organizationId);
}

async function requireLenderTargetAccess(
  ctx: LenderReviewCtx,
  target: ResolvedReviewTarget,
  finalDecision: boolean
) {
  await requireLenderBuildAccess(ctx, target.build);
  const permission =
    target.kind === "milestone" ? "milestoneDecisions" : "drawDecisions";
  if (finalDecision) {
    await requireLenderOrganizationPermission(
      ctx,
      ctx.activeOrganization,
      permission
    );
  } else if (!ctx.activeOrganization.permissions[permission]) {
    throw safeUnavailableError();
  }
}

async function requireLenderBuildAccess(
  ctx: LenderReviewCtx,
  build: Doc<"activeBuilds">
) {
  const assignments = await ctx.db
    .query("proposalLenderAssignments")
    .withIndex("by_proposal_status", (query) =>
      query.eq("proposalId", build.proposalId).eq("status", "current")
    )
    .take(2);
  const assignment = assignments.find(
    (candidate) =>
      candidate.brokerageId === build.brokerageId &&
      candidate.organizationId === build.organizationId &&
      candidate.lenderBrokerageId === ctx.activeOrganization.brokerageId &&
      candidate.lenderOrganizationId ===
        ctx.activeOrganization.lenderOrganizationId
  );
  if (!assignment) {
    throw safeUnavailableError();
  }
}

async function eligibleLenderApproverIds(
  ctx: ReviewCtx,
  target: ResolvedReviewTarget
) {
  return await eligibleLenderApproverIdsForBuild(
    ctx,
    target.build,
    target.kind
  );
}

async function eligibleLenderApproverIdsForBuild(
  ctx: ReviewCtx,
  build: Doc<"activeBuilds">,
  kind: "draw" | "milestone"
) {
  const assignments = await ctx.db
    .query("proposalLenderAssignments")
    .withIndex("by_proposal_status", (query) =>
      query.eq("proposalId", build.proposalId).eq("status", "current")
    )
    .take(2);
  const assignment = assignments.find(
    (candidate) =>
      candidate.brokerageId === build.brokerageId &&
      candidate.organizationId === build.organizationId
  );
  if (!assignment) {
    return new Map<string, EligibleLenderApprover>();
  }
  const lenderOrganizationId = ctx.db.normalizeId(
    "lenderOrganizations",
    String(assignment.lenderOrganizationId)
  );
  if (!lenderOrganizationId) {
    return new Map<string, EligibleLenderApprover>();
  }
  const eligibility = await getLenderOrganizationApprovalEligibility(
    ctx,
    lenderOrganizationId
  );
  return new Map(
    eligibility.members[kind].map((member) => [
      member.workosUserId,
      {
        assignmentId: member.assignmentId,
        eligibilityEpoch: member.eligibilityEpoch,
      },
    ])
  );
}

const completeSiteVisitInput = {
  expectedVisitUpdatedAt: v.number(),
  idempotencyKey: v.string(),
  milestoneId: v.id("buildMilestones"),
  report: v.string(),
  visitId: v.id("buildSiteVisits"),
};

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
    currentCycleNumber:
      target.record.currentLenderPortalReviewCycleNumber ?? 0,
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
      .map(
        (photo) =>
          `site_visit_location_unverified:${String(photo._id)}`
      ),
  };
}

async function validateMilestoneSiteVisitCompletion(
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

async function completeMilestoneSiteVisit(
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
      .map(
        (photo) =>
          `site_visit_location_unverified:${String(photo._id)}`
      ),
  });
  return {
    replayed: false,
    siteVisitId: visit._id,
    status: "complete" as const,
  };
}

async function submitReviewCycle(
  ctx: MutationCtx,
  input: {
    actorWorkosUserId: string;
    costDocumentIds: Id<"costDocuments">[];
    expectedCycleNumber: number;
    idempotencyKey: string;
    target: ResolvedReviewTarget;
  }
) {
  const idempotencyKey = normalizeIdempotencyKey(input.idempotencyKey);
  const fingerprint = JSON.stringify({
    command: "submitBuilderReviewRequest",
    costDocumentIds: input.costDocumentIds.map(String).sort(),
    expectedCycleNumber: input.expectedCycleNumber,
    requestIdentity: input.target.requestIdentity,
  });
  const replay = await ctx.db
    .query("lenderPortalReviewCycles")
    .withIndex("by_request_identity_and_idempotency_key", (query) =>
      query
        .eq("requestIdentity", input.target.requestIdentity)
        .eq("idempotencyKey", idempotencyKey)
    )
    .unique();
  if (replay) {
    if (replay.commandFingerprint !== fingerprint) {
      throw idempotencyConflictError();
    }
    return submitResult(replay, true);
  }

  const currentCycleNumber =
    input.target.record.currentLenderPortalReviewCycleNumber ?? 0;
  if (input.expectedCycleNumber !== currentCycleNumber) {
    throw staleCycleError();
  }
  if (
    currentCycleNumber > 0 &&
    input.target.record.lenderPortalReviewState !== "correction_required"
  ) {
    throw new ConvexError({
      code: "REVIEW_REQUEST_NOT_CORRECTABLE",
      message: "This request is not ready for Builder resubmission.",
      recoverable: true,
    });
  }

  const requirements = await lockedReviewRequirements(ctx, input.target);
  const { evidenceReferences, submission } = await snapshotSubmission(ctx, {
    costDocumentIds: input.costDocumentIds,
    target: input.target,
  });
  const now = Date.now();
  const cycleNumber = currentCycleNumber + 1;
  const priorCycleId = input.target.record.currentLenderPortalReviewCycleId;
  if (priorCycleId) {
    const priorCycle = await ctx.db.get(priorCycleId);
    if (
      !priorCycle ||
      priorCycle.requestIdentity !== input.target.requestIdentity ||
      !priorCycle.isCurrent
    ) {
      throw staleCycleError();
    }
    await ctx.db.patch(priorCycleId, { isCurrent: false, updatedAt: now });
  }
  const cycleId = await ctx.db.insert("lenderPortalReviewCycles", {
    approvedGroups: [],
    brokerageId: input.target.build.brokerageId,
    buildId: input.target.build._id,
    commandFingerprint: fingerprint,
    cycleNumber,
    ...(input.target.kind === "milestone"
      ? { milestoneId: input.target.record._id }
      : { drawRequestId: input.target.record._id }),
    evidenceReferences,
    idempotencyKey,
    isCurrent: true,
    kind: input.target.kind,
    lenderApprovalCount: 0,
    organizationId: input.target.build.organizationId,
    requestIdentity: input.target.requestIdentity,
    requirements,
    state: "in_review",
    submission,
    submittedAt: now,
    submittedByWorkosUserId: input.actorWorkosUserId,
    targetLabel: input.target.label,
    decisionSummaries: [],
    updatedAt: now,
  });
  await ctx.db.patch(input.target.record._id, {
    currentLenderPortalReviewCycleId: cycleId,
    currentLenderPortalReviewCycleNumber: cycleNumber,
    lenderPortalReviewState: "in_review",
  });
  await writeReviewAudit(ctx, {
    actorRole: "builder",
    actorWorkosUserId: input.actorWorkosUserId,
    cycleNumber,
    eventType:
      cycleNumber === 1
        ? "lender_portal.review_request.submitted"
        : "lender_portal.review_request.resubmitted",
    newState: "in_review",
    priorState: input.target.record.lenderPortalReviewState,
    target: input.target,
  });
  const cycle = await ctx.db.get(cycleId);
  if (!cycle) {
    throw new Error("Review cycle could not be reloaded.");
  }
  await enqueueReviewApprovalRequiredNotifications(ctx, {
    build: input.target.build,
    cycle,
    kind: input.target.kind,
    label: input.target.label,
    targetId: input.target.record._id,
  });
  return submitResult(cycle, false);
}

async function recordReviewDecision(
  ctx: MutationCtx,
  input: {
    actorRole: Exclude<ReviewActorRole, "builder">;
    actorWorkosUserId: string;
    decision: "approved" | "rejected";
    expectedCycleNumber: number;
    group: LenderPortalReviewGroup;
    idempotencyKey: string;
    privateRationale?: string;
    revisionInstructions?: string;
    target: ResolvedReviewTarget;
  }
) {
  const idempotencyKey = normalizeIdempotencyKey(input.idempotencyKey);
  const revisionInstructions = normalizeOptionalText(
    input.revisionInstructions,
    1000
  );
  const privateRationale = normalizeOptionalText(input.privateRationale, 2000);
  if (input.decision === "rejected" && !revisionInstructions) {
    throw new ConvexError({
      code: "REVISION_INSTRUCTIONS_REQUIRED",
      message: "Builder-visible revision instructions are required.",
      recoverable: true,
    });
  }
  const fingerprint = JSON.stringify({
    decision: input.decision,
    expectedCycleNumber: input.expectedCycleNumber,
    group: input.group,
    privateRationale: privateRationale ?? null,
    requestIdentity: input.target.requestIdentity,
    revisionInstructions: revisionInstructions ?? null,
  });
  const replay = await ctx.db
    .query("lenderPortalReviewDecisions")
    .withIndex("by_request_identity_and_idempotency_key", (query) =>
      query
        .eq("requestIdentity", input.target.requestIdentity)
        .eq("idempotencyKey", idempotencyKey)
    )
    .unique();
  if (replay) {
    if (replay.commandFingerprint !== fingerprint) {
      throw idempotencyConflictError();
    }
    const replayCycle = await ctx.db.get(replay.cycleId);
    if (!replayCycle) {
      throw safeUnavailableError();
    }
    return decisionResult(replay, replayCycle.state, true);
  }

  const cycle = await requireCurrentCycle(ctx, input.target);
  if (
    input.expectedCycleNumber !== cycle.cycleNumber ||
    input.target.record.currentLenderPortalReviewCycleId !== cycle._id
  ) {
    throw staleCycleError();
  }
  if (cycle.state !== "in_review" && cycle.state !== "partial_approval") {
    throw new ConvexError({
      code: "REVIEW_REQUEST_NOT_DECIDABLE",
      message: "This review cycle no longer accepts decisions.",
      recoverable: true,
    });
  }
  if (!cycle.requirements.requiredGroups.includes(input.group)) {
    throw new ConvexError({
      code: "REVIEW_GROUP_NOT_REQUIRED",
      message: "This approval group is not required by the locked policy.",
      recoverable: true,
    });
  }
  const actorDecision = await ctx.db
    .query("lenderPortalReviewDecisions")
    .withIndex("by_cycle_group_and_actor", (query) =>
      query
        .eq("cycleId", cycle._id)
        .eq("group", input.group)
        .eq("actorWorkosUserId", input.actorWorkosUserId)
    )
    .unique();
  if (actorDecision) {
    throw new ConvexError({
      code: "REVIEW_DECISION_ALREADY_RECORDED",
      message: "This reviewer already decided the current cycle.",
      recoverable: true,
    });
  }

  const eligibleLenderWorkosUserIds = await eligibleLenderApproverIds(
    ctx,
    input.target
  );
  const lenderEligibility = lenderAssignmentForDecision(
    input.group,
    input.actorWorkosUserId,
    eligibleLenderWorkosUserIds
  );

  const now = Date.now();
  const decisionId = await ctx.db.insert("lenderPortalReviewDecisions", {
    actorRole: input.actorRole,
    actorWorkosUserId: input.actorWorkosUserId,
    brokerageId: input.target.build.brokerageId,
    buildId: input.target.build._id,
    commandFingerprint: fingerprint,
    createdAt: now,
    cycleId: cycle._id,
    cycleNumber: cycle.cycleNumber,
    decision: input.decision,
    group: input.group,
    idempotencyKey,
    ...(lenderEligibility
      ? {
          lenderEligibilityEpoch: lenderEligibility.eligibilityEpoch,
          lenderOrganizationAssignmentId: lenderEligibility.assignmentId,
        }
      : {}),
    organizationId: input.target.build.organizationId,
    privateRationale,
    requestIdentity: input.target.requestIdentity,
    revisionInstructions,
  });
  const existingDecisions = await ctx.db
    .query("lenderPortalReviewDecisions")
    .withIndex("by_cycle", (query) => query.eq("cycleId", cycle._id))
    .take(MAX_CYCLE_DECISIONS + 1);
  if (existingDecisions.length > MAX_CYCLE_DECISIONS) {
    throw new ConvexError({
      code: "REVIEW_DECISION_LIMIT_EXCEEDED",
      message: "The review cycle decision limit was exceeded.",
      recoverable: false,
    });
  }
  const state = decisionState({
    decisions: existingDecisions,
    eligibleLenderWorkosUserIds,
    requirements: cycle.requirements,
  });
  const { approvedGroups, lenderApprovalCount } = approvalProgress({
    decisions: existingDecisions,
    eligibleLenderWorkosUserIds,
  });
  const terminalContributorDecisionIds =
    state === "completed"
      ? terminalContributorIds({
          decisions: existingDecisions,
          eligibleLenderWorkosUserIds,
          requirements: cycle.requirements,
        })
      : undefined;
  await ctx.db.patch(cycle._id, {
    approvedGroups,
    decisionSummaries: existingDecisions.map((decision) => ({
      actorWorkosUserId: decision.actorWorkosUserId,
      decision: decision.decision,
      group: decision.group,
      ...(decision.lenderOrganizationAssignmentId
        ? {
            lenderOrganizationAssignmentId:
              decision.lenderOrganizationAssignmentId,
          }
        : {}),
      ...(decision.lenderEligibilityEpoch
        ? { lenderEligibilityEpoch: decision.lenderEligibilityEpoch }
        : {}),
    })),
    lenderApprovalCount,
    ...(revisionInstructions ? { revisionInstructions } : {}),
    state,
    ...(terminalContributorDecisionIds
      ? { terminalContributorDecisionIds }
      : {}),
    updatedAt: now,
  });
  await ctx.db.patch(input.target.record._id, {
    lenderPortalReviewState: state,
  });
  await writeReviewAudit(ctx, {
    actorRole: input.actorRole,
    actorWorkosUserId: input.actorWorkosUserId,
    cycleNumber: cycle.cycleNumber,
    eventType:
      input.decision === "rejected"
        ? "lender_portal.review_request.correction_requested"
        : "lender_portal.review_request.approval_recorded",
    newState: state,
    priorState: cycle.state,
    reason: revisionInstructions,
    target: input.target,
  });
  const decision = await ctx.db.get(decisionId);
  if (!decision) {
    throw new Error("Review decision could not be reloaded.");
  }
  const updatedCycle = await ctx.db.get(cycle._id);
  if (!updatedCycle) {
    throw new Error("Updated review cycle could not be reloaded.");
  }
  if (state === "partial_approval") {
    const outstandingGroups = updatedCycle.requirements.requiredGroups.filter(
      (group) =>
        group === "lender"
          ? updatedCycle.lenderApprovalCount <
            (updatedCycle.requirements.lenderQuorum ?? 1)
          : !updatedCycle.approvedGroups.includes(group),
    );
    await enqueueReviewApprovalRequiredNotifications(ctx, {
      build: input.target.build,
      cycle: updatedCycle,
      groups: outstandingGroups,
      kind: input.target.kind,
      label: input.target.label,
      targetId: input.target.record._id,
    });
  } else if (state === "completed" || state === "correction_required") {
    await enqueueReviewApprovalOutcomeNotifications(ctx, {
      build: input.target.build,
      cycle: updatedCycle,
      kind: input.target.kind,
      label: input.target.label,
      outcome: state === "completed" ? "approved" : "rejected",
      targetId: input.target.record._id,
    });
  }
  return decisionResult(decision, state, false);
}

function lenderAssignmentForDecision(
  group: LenderPortalReviewGroup,
  actorWorkosUserId: string,
  eligibleLenderWorkosUserIds: EligibleLenderApprovers
) {
  if (group !== "lender") {
    return;
  }
  const eligibility = eligibleLenderWorkosUserIds.get(actorWorkosUserId);
  if (!eligibility) {
    throw safeUnavailableError();
  }
  return eligibility;
}

function decisionState(input: {
  decisions: Array<{
    actorWorkosUserId: string;
    decision: "approved" | "rejected";
    group: string;
    lenderEligibilityEpoch?: string;
    lenderOrganizationAssignmentId?: Id<"lenderOrganizationAssignments">;
  }>;
  eligibleLenderWorkosUserIds: EligibleLenderApprovers;
  requirements: LenderPortalReviewRequirements;
}): LenderPortalReviewRequestState {
  if (input.decisions.some((decision) => decision.decision === "rejected")) {
    return "correction_required";
  }
  const { approvedGroups, lenderApprovalCount } = approvalProgress(input);
  const approvedGroupSet = new Set(approvedGroups);
  const complete = input.requirements.requiredGroups.every((group) =>
    group === "lender"
      ? lenderApprovalCount >= (input.requirements.lenderQuorum ?? 1)
      : approvedGroupSet.has(group)
  );
  return complete
    ? "completed"
    : approvedGroups.length > 0
      ? "partial_approval"
      : "in_review";
}

function approvalProgress(input: {
  decisions: Array<{
    actorWorkosUserId: string;
    decision: "approved" | "rejected";
    group: string;
    lenderEligibilityEpoch?: string;
    lenderOrganizationAssignmentId?: Id<"lenderOrganizationAssignments">;
  }>;
  eligibleLenderWorkosUserIds: EligibleLenderApprovers;
}) {
  const approvals = input.decisions.filter(
    (decision) =>
      decision.decision === "approved" &&
      (decision.group !== "lender" ||
        lenderDecisionIsCurrentlyEligible(
          decision,
          input.eligibleLenderWorkosUserIds
        ))
  );
  const lenderApprovalCount = approvals.filter(
    (decision) => decision.group === "lender"
  ).length;
  const approvedGroups = [
    ...new Set(approvals.map((decision) => decision.group)),
  ].filter(
    (group) => group !== "lender" || lenderApprovalCount > 0
  ) as LenderPortalReviewGroup[];
  return { approvedGroups, lenderApprovalCount };
}

function lenderDecisionIsCurrentlyEligible(
  decision: {
    actorWorkosUserId: string;
    lenderEligibilityEpoch?: string;
    lenderOrganizationAssignmentId?: Id<"lenderOrganizationAssignments">;
  },
  eligibleLenderWorkosUserIds: EligibleLenderApprovers
) {
  const currentEligibility = eligibleLenderWorkosUserIds.get(
    decision.actorWorkosUserId
  );
  return Boolean(
    currentEligibility &&
      decision.lenderOrganizationAssignmentId ===
        currentEligibility.assignmentId &&
      decision.lenderEligibilityEpoch === currentEligibility.eligibilityEpoch
  );
}

function terminalContributorIds(input: {
  decisions: Array<
    Pick<
      Doc<"lenderPortalReviewDecisions">,
      | "_id"
      | "actorWorkosUserId"
      | "decision"
      | "group"
      | "lenderEligibilityEpoch"
      | "lenderOrganizationAssignmentId"
    >
  >;
  eligibleLenderWorkosUserIds: EligibleLenderApprovers;
  requirements: LenderPortalReviewRequirements;
}) {
  const contributorIds: Id<"lenderPortalReviewDecisions">[] = [];
  if (input.requirements.requiredGroups.includes("backoffice")) {
    const backofficeDecision = input.decisions.find(
      (decision) =>
        decision.group === "backoffice" && decision.decision === "approved"
    );
    if (backofficeDecision) {
      contributorIds.push(backofficeDecision._id);
    }
  }
  if (input.requirements.requiredGroups.includes("lender")) {
    const quorum = input.requirements.lenderQuorum ?? 1;
    contributorIds.push(
      ...input.decisions
        .filter(
          (decision) =>
            decision.group === "lender" &&
            decision.decision === "approved" &&
            lenderDecisionIsCurrentlyEligible(
              decision,
              input.eligibleLenderWorkosUserIds
            )
        )
        .slice(0, quorum)
        .map((decision) => decision._id)
    );
  }
  return contributorIds;
}

function projectedDecisionState(input: {
  cycle: Pick<
    Doc<"lenderPortalReviewCycles">,
    "isCurrent" | "requirements" | "state"
  >;
  decisions: Array<{
    actorWorkosUserId: string;
    decision: "approved" | "rejected";
    group: string;
    lenderEligibilityEpoch?: string;
    lenderOrganizationAssignmentId?: Id<"lenderOrganizationAssignments">;
  }>;
  eligibleLenderWorkosUserIds: EligibleLenderApprovers;
}) {
  if (
    !input.cycle.isCurrent ||
    input.cycle.state === "completed" ||
    input.cycle.state === "correction_required"
  ) {
    return input.cycle.state;
  }
  return decisionState({
    decisions: input.decisions,
    eligibleLenderWorkosUserIds: input.eligibleLenderWorkosUserIds,
    requirements: input.cycle.requirements,
  });
}

async function projectedCycleState(
  ctx: ReviewCtx,
  target: ResolvedReviewTarget,
  cycle: Doc<"lenderPortalReviewCycles">
) {
  if (
    !cycle.isCurrent ||
    cycle.state === "completed" ||
    cycle.state === "correction_required"
  ) {
    return cycle.state;
  }
  const decisions = await ctx.db
    .query("lenderPortalReviewDecisions")
    .withIndex("by_cycle", (query) => query.eq("cycleId", cycle._id))
    .take(MAX_CYCLE_DECISIONS + 1);
  if (decisions.length > MAX_CYCLE_DECISIONS) {
    throw safeUnavailableError();
  }
  return projectedDecisionState({
    cycle,
    decisions,
    eligibleLenderWorkosUserIds: await eligibleLenderApproverIds(ctx, target),
  });
}

function reviewRequirements(
  target: ResolvedReviewTarget
): LenderPortalReviewRequirements {
  const policy = target.build.reviewPolicySnapshot;
  if (!policy) {
    throw new ConvexError({
      code: "LOCKED_REVIEW_POLICY_REQUIRED",
      message: "The Build review policy is unavailable.",
      recoverable: false,
    });
  }
  const approvalMode =
    target.kind === "milestone"
      ? policy.milestoneApprovalMode
      : policy.drawApprovalMode;
  const lenderQuorum =
    target.kind === "milestone"
      ? policy.milestoneLenderQuorum
      : policy.drawLenderQuorum;
  return {
    approvalMode,
    lenderQuorum,
    receiptInvoiceRequired:
      target.kind === "milestone"
        ? policy.milestoneReceiptInvoiceRequired
        : false,
    requiredGroups:
      approvalMode === "both"
        ? ["backoffice", "lender"]
        : approvalMode === "lender_quorum"
          ? ["lender"]
          : ["backoffice"],
    siteVisitRequired:
      target.kind === "milestone" ? policy.milestoneSiteVisitRequired : false,
  };
}

async function lockedReviewRequirements(
  ctx: ReviewCtx,
  target: ResolvedReviewTarget
) {
  const lockId = target.build.reviewPolicyLockId;
  const policy = target.build.reviewPolicySnapshot;
  const lock = lockId ? await ctx.db.get(lockId) : null;
  if (
    !lock ||
    !policy ||
    lock._id !== lockId ||
    lock.proposalId !== target.build.proposalId ||
    lock.organizationId !== target.build.organizationId ||
    lock.brokerageId !== target.build.brokerageId ||
    JSON.stringify(lock.policy) !== JSON.stringify(policy)
  ) {
    throw new ConvexError({
      code: "LOCKED_REVIEW_POLICY_REQUIRED",
      message: "The immutable Build review policy lock is unavailable.",
      recoverable: false,
    });
  }
  return reviewRequirements(target);
}

async function snapshotSubmission(
  ctx: MutationCtx,
  input: {
    costDocumentIds: Id<"costDocuments">[];
    target: ResolvedReviewTarget;
  }
) {
  if (input.target.kind === "draw") {
    return await snapshotDrawSubmission(ctx, {
      costDocumentIds: input.costDocumentIds,
      target: input.target,
    });
  }
  return await snapshotMilestoneSubmission(ctx, {
    costDocumentIds: input.costDocumentIds,
    target: input.target,
  });
}

async function snapshotDrawSubmission(
  ctx: MutationCtx,
  input: {
    costDocumentIds: Id<"costDocuments">[];
    target: Extract<ResolvedReviewTarget, { kind: "draw" }>;
  }
) {
  if (input.target.record.status !== "requested") {
    throw new ConvexError({
      code: "DRAW_REQUEST_SUBMISSION_REQUIRED",
      message: "Submit the canonical Draw request before review entry.",
      recoverable: true,
    });
  }
  if (input.costDocumentIds.length > 0) {
    throw new ConvexError({
      code: "DRAW_COST_DOCUMENT_ATTACHMENTS_UNSUPPORTED",
      message: "Receipt and invoice attachments belong to Milestone review.",
      recoverable: true,
    });
  }
  const allocations = await ctx.db
    .query("activeBuildDrawRequestAllocations")
    .withIndex("by_request", (query) =>
      query.eq("drawRequestId", input.target.record._id)
    )
    .take(EVIDENCE_REFERENCE_LIMIT + 1);
  if (allocations.length > EVIDENCE_REFERENCE_LIMIT) {
    throw new Error("Draw allocation snapshot limit exceeded.");
  }
  return {
    evidenceReferences: [],
    submission: {
      allocations: allocations.map((allocation) => ({
        amountCents: allocation.amountCents,
        drawGroupKey: allocation.drawGroupKey,
        milestoneId: allocation.buildMilestoneId,
        milestoneKey: allocation.milestoneKey,
        sourceOrder: allocation.sourceOrder,
      })),
      amountCents: input.target.record.amountCents,
      displayId: input.target.record.displayId,
      drawRequestId: input.target.record._id,
      kind: "draw" as const,
      label: input.target.record.label,
      note: input.target.record.note ?? null,
      requestedAt: input.target.record.requestedAt,
      requestKey: input.target.record.requestKey,
    },
  };
}

async function snapshotMilestoneSubmission(
  ctx: MutationCtx,
  input: {
    costDocumentIds: Id<"costDocuments">[];
    target: Extract<ResolvedReviewTarget, { kind: "milestone" }>;
  }
) {
  const { target } = input;

  const claim = recordValue(target.record.completionClaim);
  if (!(claim && stringValue(claim.submittedAt))) {
    throw new ConvexError({
      code: "MILESTONE_COMPLETION_REQUIRED",
      message: "Submit canonical Milestone completion before review entry.",
      recoverable: true,
    });
  }
  const evidenceReferences = await snapshotMilestoneEvidenceReferences(
    ctx,
    target,
    claim
  );

  const costDocumentReferences = await snapshotMilestoneCostDocuments(ctx, {
    costDocumentIds: input.costDocumentIds,
    target,
  });
  evidenceReferences.push(...costDocumentReferences);

  const requirements = reviewRequirements(target);
  const actualCostCents = numberValue(claim?.actualCostCents);
  if (requirements.receiptInvoiceRequired) {
    const actualCost = requireMoneyInteger(actualCostCents);
    const documentedTotal = costDocumentReferences.reduce(
      (sum, reference) =>
        reference.kind === "cost_document"
          ? safeMoneyAdd(sum, reference.amountCents)
          : sum,
      0
    );
    if (documentedTotal !== actualCost) {
      throw new ConvexError({
        actualCostCents: actualCost,
        code: "DOCUMENTED_TOTAL_MISMATCH",
        documentedTotalCents: documentedTotal,
        message:
          "Eligible current-cycle receipt and invoice total must equal actual cost.",
        recoverable: true,
      });
    }
  }

  const qualifyingSiteVisit = await qualifyingMilestoneSiteVisit(ctx, target);
  if (requirements.siteVisitRequired && !qualifyingSiteVisit) {
    throw new ConvexError({
      code: "SITE_VISIT_EVIDENCE_REQUIRED",
      message:
        "A completed Site Visit report with at least one photo is required.",
      recoverable: true,
    });
  }
  if (qualifyingSiteVisit) {
    evidenceReferences.push({
      completedAt: qualifyingSiteVisit.visit.completedAt,
      kind: "site_visit",
      label: `${target.record.name} Site Visit report`,
      milestoneKey: target.record.key,
      report: qualifyingSiteVisit.visit.recordNote,
      siteVisitId: qualifyingSiteVisit.visit._id,
    });
    evidenceReferences.push(
      ...qualifyingSiteVisit.photos.map((photo) => ({
        association: {
          kind: "site_visit" as const,
          siteVisitId: qualifyingSiteVisit.visit._id,
        },
        evidenceAssetId: photo._id,
        kind: "asset" as const,
        label: photo.label,
        ...(photo.locationFailureReason
          ? { locationFailureReason: photo.locationFailureReason }
          : {}),
        locationVerified: photo.locationVerified,
        milestoneKey: photo.milestoneKey,
        ...(photo.submilestoneKey
          ? { submilestoneKey: photo.submilestoneKey }
          : {}),
      }))
    );
  }
  if (evidenceReferences.length > EVIDENCE_REFERENCE_LIMIT) {
    throw new ConvexError({
      code: "EVIDENCE_REFERENCE_LIMIT_EXCEEDED",
      message: "The milestone evidence reference limit was exceeded.",
      recoverable: true,
    });
  }
  return {
    evidenceReferences,
    submission: {
      actualCostCents,
      completedDay: numberValue(claim?.completedDay),
      kind: "milestone" as const,
      milestoneId: target.record._id,
      milestoneKey: target.record.key,
      milestoneName: target.record.name,
      note: stringValue(claim?.note),
      progressPercent: target.record.progressPercent ?? null,
      submittedAt: stringValue(claim?.submittedAt),
    },
  };
}

async function snapshotMilestoneEvidenceReferences(
  ctx: MutationCtx,
  target: Extract<ResolvedReviewTarget, { kind: "milestone" }>,
  claim: Record<string, unknown>
) {
  const evidenceReferences: LenderPortalReviewEvidenceReference[] = [];
  const packageReferences = Array.isArray(claim.evidencePackageRevisionIds)
    ? claim.evidencePackageRevisionIds
    : [];
  if (
    packageReferences.length > EVIDENCE_REFERENCE_LIMIT ||
    evidenceReferences.length + packageReferences.length >
      EVIDENCE_REFERENCE_LIMIT
  ) {
    throw evidenceReferenceLimitError();
  }
  for (const reference of packageReferences) {
    const resolved = await resolveMilestonePackageReference(
      ctx,
      target,
      reference
    );
    evidenceReferences.push(resolved.packageReference);
    evidenceReferences.push(...resolved.assetReferences);
  }
  return evidenceReferences;
}

async function resolveMilestonePackageReference(
  ctx: MutationCtx,
  target: Extract<ResolvedReviewTarget, { kind: "milestone" }>,
  reference: unknown
) {
  const item = recordValue(reference);
  const rawId = item?.revisionId;
  const referencedRevision = numberValue(item?.revision);
  const referencedSubmilestoneKey = stringValue(item?.submilestoneKey);
  const revisionId =
    typeof rawId === "string"
      ? ctx.db.normalizeId("buildSubmilestoneEvidencePackageRevisions", rawId)
      : null;
  if (!(revisionId && referencedSubmilestoneKey)) {
    throw invalidEvidencePackageReference();
  }
  const packageRevision = await ctx.db.get(revisionId);
  const submilestone = packageRevision
    ? await ctx.db.get(packageRevision.buildSubmilestoneId)
    : null;
  if (
    !(
      packageRevision &&
      submilestone &&
      packageRevisionMatchesTarget({
        packageRevision,
        referencedRevision,
        referencedSubmilestoneKey,
        target,
      }) &&
      submilestoneMatchesPackage({
        packageRevision,
        referencedSubmilestoneKey,
        submilestone,
        target,
      })
    )
  ) {
    throw invalidEvidencePackageReference(referencedSubmilestoneKey);
  }
  const packageItems = await ctx.db
    .query("buildSubmilestoneEvidencePackageItems")
    .withIndex("by_package_revision", (query) =>
      query.eq("packageRevisionId", packageRevision._id)
    )
    .take(EVIDENCE_REFERENCE_LIMIT + 1);
  if (packageItems.length > EVIDENCE_REFERENCE_LIMIT) {
    throw evidenceReferenceLimitError();
  }
  const assetReferences: Extract<
    LenderPortalReviewEvidenceReference,
    { kind: "asset" }
  >[] = [];
  for (const item of packageItems) {
    const asset = await ctx.db.get(item.evidenceAssetId);
    if (
      !asset ||
      !packageItemMatchesTarget({
        asset,
        item,
        packageRevision,
        referencedSubmilestoneKey,
        target,
      })
    ) {
      throw invalidEvidencePackageReference(referencedSubmilestoneKey);
    }
    assetReferences.push({
      association: {
        evidencePackageItemId: item._id,
        evidencePackageRevisionId: packageRevision._id,
        kind: "package_revision",
      },
      evidenceAssetId: asset._id,
      kind: "asset",
      label: asset.label,
      ...(asset.locationFailureReason
        ? { locationFailureReason: asset.locationFailureReason }
        : {}),
      locationVerified: asset.locationVerified,
      milestoneKey: asset.milestoneKey,
      submilestoneKey: referencedSubmilestoneKey,
    });
  }
  return {
    assetReferences,
    packageReference: {
      evidencePackageRevisionId: revisionId,
      kind: "package_revision" as const,
      label: `Evidence Package revision ${packageRevision.revision}`,
      milestoneKey: target.record.key,
      submilestoneKey: referencedSubmilestoneKey,
    },
  };
}

function packageItemMatchesTarget(input: {
  asset: Doc<"buildEvidenceAssets">;
  item: Doc<"buildSubmilestoneEvidencePackageItems">;
  packageRevision: Doc<"buildSubmilestoneEvidencePackageRevisions">;
  referencedSubmilestoneKey: string;
  target: Extract<ResolvedReviewTarget, { kind: "milestone" }>;
}) {
  return (
    input.item.packageRevisionId === input.packageRevision._id &&
    input.item.evidenceAssetId === input.asset._id &&
    input.item.buildId === input.target.build._id &&
    input.item.organizationId === input.target.build.organizationId &&
    input.item.brokerageId === input.target.build.brokerageId &&
    input.item.buildMilestoneId === input.target.record._id &&
    input.item.buildSubmilestoneId === input.packageRevision.buildSubmilestoneId &&
    input.asset.buildId === input.target.build._id &&
    input.asset.organizationId === input.target.build.organizationId &&
    input.asset.brokerageId === input.target.build.brokerageId &&
    input.asset.proposalId === input.target.build.proposalId &&
    input.asset.milestoneKey === input.target.record.key &&
    input.asset.submilestoneKey === input.referencedSubmilestoneKey &&
    input.asset.evidencePackageRevisionId === input.packageRevision._id
  );
}

function packageRevisionMatchesTarget(input: {
  packageRevision: Doc<"buildSubmilestoneEvidencePackageRevisions">;
  referencedRevision: number | null;
  referencedSubmilestoneKey: string;
  target: Extract<ResolvedReviewTarget, { kind: "milestone" }>;
}) {
  return (
    input.packageRevision.buildId === input.target.build._id &&
    input.packageRevision.organizationId ===
      input.target.build.organizationId &&
    input.packageRevision.brokerageId === input.target.build.brokerageId &&
    input.packageRevision.proposalId === input.target.build.proposalId &&
    input.packageRevision.buildMilestoneId === input.target.record._id &&
    input.packageRevision.milestoneKey === input.target.record.key &&
    input.packageRevision.submilestoneKey === input.referencedSubmilestoneKey &&
    input.packageRevision.revision === input.referencedRevision &&
    input.packageRevision.status === "frozen"
  );
}

function submilestoneMatchesPackage(input: {
  packageRevision: Doc<"buildSubmilestoneEvidencePackageRevisions">;
  referencedSubmilestoneKey: string;
  submilestone: Doc<"buildSubmilestones">;
  target: Extract<ResolvedReviewTarget, { kind: "milestone" }>;
}) {
  return (
    input.submilestone._id === input.packageRevision.buildSubmilestoneId &&
    input.submilestone.buildId === input.target.build._id &&
    input.submilestone.organizationId === input.target.build.organizationId &&
    input.submilestone.brokerageId === input.target.build.brokerageId &&
    input.submilestone.buildMilestoneId === input.target.record._id &&
    input.submilestone.milestoneKey === input.target.record.key &&
    input.submilestone.key === input.referencedSubmilestoneKey &&
    input.submilestone.planningState !== "superseded"
  );
}

async function snapshotMilestoneCostDocuments(
  ctx: MutationCtx,
  input: {
    costDocumentIds: Id<"costDocuments">[];
    target: Extract<ResolvedReviewTarget, { kind: "milestone" }>;
  }
) {
  if (input.costDocumentIds.length > COST_DOCUMENT_LIMIT) {
    throw new ConvexError({
      code: "COST_DOCUMENT_LIMIT_EXCEEDED",
      message: `A review cycle accepts at most ${COST_DOCUMENT_LIMIT} cost documents.`,
      recoverable: true,
    });
  }
  if (
    new Set(input.costDocumentIds.map(String)).size !==
    input.costDocumentIds.length
  ) {
    throw new ConvexError({
      code: "DUPLICATE_COST_DOCUMENT_ATTACHMENT",
      message: "Attach each receipt or invoice once per review cycle.",
      recoverable: true,
    });
  }

  const references: Extract<
    LenderPortalReviewEvidenceReference,
    { kind: "cost_document" | "cost_document_page" }
  >[] = [];
  for (const costDocumentId of input.costDocumentIds) {
    references.push(
      ...(await snapshotMilestoneCostDocument(
        ctx,
        input.target,
        costDocumentId
      ))
    );
  }
  return references;
}

async function snapshotMilestoneCostDocument(
  ctx: MutationCtx,
  target: Extract<ResolvedReviewTarget, { kind: "milestone" }>,
  costDocumentId: Id<"costDocuments">
) {
  const document = await ctx.db.get(costDocumentId);
  if (!(document && costDocumentMatchesTarget(document, target))) {
    throw costDocumentUnavailableError();
  }
  requireMoneyInteger(document.grossTotalCents);
  const allocations = await ctx.db
    .query("costDocumentAllocations")
    .withIndex("by_costDocumentId_and_order", (query) =>
      query.eq("costDocumentId", document._id)
    )
    .take(EVIDENCE_REFERENCE_LIMIT + 1);
  if (allocations.length > EVIDENCE_REFERENCE_LIMIT) {
    throw costDocumentUnavailableError();
  }
  let amountCents = 0;
  for (const allocation of allocations) {
    const submilestone = await ctx.db.get(allocation.buildSubmilestoneId);
    if (
      !(
        allocationMatchesTarget(allocation, target) &&
        allocation.costDocumentId === document._id &&
        submilestone &&
        submilestoneMatchesCostDocumentTarget(submilestone, target) &&
        allocation.submilestoneKeySnapshot === submilestone.key &&
        allocation.submilestoneNameSnapshot === submilestone.name
      )
    ) {
      throw costDocumentUnavailableError();
    }
    amountCents = safeMoneyAdd(
      amountCents,
      requireMoneyInteger(allocation.amountCents)
    );
  }
  if (amountCents === 0) {
    throw costDocumentUnavailableError();
  }
  const pages = await ctx.db
    .query("costDocumentPages")
    .withIndex("by_costDocumentId_and_order", (query) =>
      query.eq("costDocumentId", document._id)
    )
    .take(EVIDENCE_REFERENCE_LIMIT + 1);
  if (pages.length === 0 || pages.length > EVIDENCE_REFERENCE_LIMIT) {
    throw costDocumentUnavailableError();
  }
  const pageReferences: Extract<
    LenderPortalReviewEvidenceReference,
    { kind: "cost_document_page" }
  >[] = [];
  for (const page of pages) {
    const asset = await ctx.db.get(page.assetId);
    if (
      !asset ||
      page.costDocumentId !== document._id ||
      page.buildId !== target.build._id ||
      page.organizationId !== target.build.organizationId ||
      page.brokerageId !== target.build.brokerageId ||
      asset.buildId !== target.build._id ||
      asset.organizationId !== target.build.organizationId ||
      asset.brokerageId !== target.build.brokerageId ||
      asset.storageDeletedAt !== undefined ||
      (asset.contentHashSha256 !== undefined &&
        asset.contentHashSha256 !== page.contentHashSha256Snapshot)
    ) {
      throw costDocumentUnavailableError();
    }
    pageReferences.push({
      assetId: asset._id,
      costDocumentId: document._id,
      costDocumentPageId: page._id,
      kind: "cost_document_page",
      label: page.fileNameSnapshot,
      milestoneKey: target.record.key,
      order: page.order,
    });
  }
  return [
    {
      amountCents,
      costDocumentId: document._id,
      currency: "CAD",
      documentKind: document.kind,
      kind: "cost_document",
      label: document.title,
      milestoneKey: target.record.key,
    },
    ...pageReferences,
  ] as Extract<
    LenderPortalReviewEvidenceReference,
    { kind: "cost_document" | "cost_document_page" }
  >[];
}

function costDocumentMatchesTarget(
  document: Doc<"costDocuments">,
  target: Extract<ResolvedReviewTarget, { kind: "milestone" }>
) {
  return (
    document.buildId === target.build._id &&
    document.organizationId === target.build.organizationId &&
    document.brokerageId === target.build.brokerageId &&
    document.state === "submitted" &&
    document.voidedAt === undefined &&
    document.supersededAt === undefined &&
    document.supersededByCostDocumentId === undefined &&
    document.currency === "CAD"
  );
}

function allocationMatchesTarget(
  allocation: Doc<"costDocumentAllocations">,
  target: Extract<ResolvedReviewTarget, { kind: "milestone" }>
) {
  return (
    allocation.buildId === target.build._id &&
    allocation.organizationId === target.build.organizationId &&
    allocation.brokerageId === target.build.brokerageId
  );
}

function submilestoneMatchesCostDocumentTarget(
  submilestone: Doc<"buildSubmilestones">,
  target: Extract<ResolvedReviewTarget, { kind: "milestone" }>
) {
  return (
    submilestone.buildId === target.build._id &&
    submilestone.organizationId === target.build.organizationId &&
    submilestone.brokerageId === target.build.brokerageId &&
    submilestone.buildMilestoneId === target.record._id &&
    submilestone.milestoneKey === target.record.key &&
    submilestone.planningState !== "superseded"
  );
}

async function qualifyingMilestoneSiteVisit(
  ctx: ReviewCtx,
  target: Extract<ResolvedReviewTarget, { kind: "milestone" }>
) {
  const visits = await ctx.db
    .query("buildSiteVisits")
    .withIndex("by_build_milestone", (query) =>
      query
        .eq("buildId", target.build._id)
        .eq("milestoneKey", target.record.key)
    )
    .order("desc")
    .take(EVIDENCE_REFERENCE_LIMIT + 1);
  if (visits.length > EVIDENCE_REFERENCE_LIMIT) {
    throw new ConvexError({
      code: "SITE_VISIT_LIMIT_EXCEEDED",
      message: "The Milestone Site Visit limit was exceeded.",
      recoverable: false,
    });
  }
  for (const visit of visits) {
    if (
      visit.buildMilestoneId !== target.record._id ||
      visit.organizationId !== target.build.organizationId ||
      visit.brokerageId !== target.build.brokerageId ||
      visit.status !== "complete" ||
      !visit.completedAt ||
      !visit.recordNote?.trim()
    ) {
      continue;
    }
    const visitAssets = await ctx.db
      .query("buildEvidenceAssets")
      .withIndex("by_site_visit", (query) =>
        query.eq("siteVisitId", visit._id)
      )
      .take(EVIDENCE_REFERENCE_LIMIT + 1);
    if (visitAssets.length > EVIDENCE_REFERENCE_LIMIT) {
      throw evidenceReferenceLimitError();
    }
    const photos = visitAssets.filter(
      (asset) =>
        asset.siteVisitId === visit._id &&
        asset.buildId === target.build._id &&
        asset.organizationId === target.build.organizationId &&
        asset.brokerageId === target.build.brokerageId &&
        asset.proposalId === target.build.proposalId &&
        asset.milestoneKey === target.record.key &&
        asset.mimeType.toLowerCase().startsWith("image/")
    );
    if (photos.length > 0) {
      return {
        photos,
        visit: {
          ...visit,
          completedAt: visit.completedAt,
          recordNote: visit.recordNote.trim(),
        },
      };
    }
  }
  return null;
}

async function reviewEvidenceProjection(
  ctx: ReviewCtx,
  target: ResolvedReviewTarget,
  cycleId: Id<"lenderPortalReviewCycles">
) {
  const cycle = await ctx.db.get(cycleId);
  if (
    !cycle ||
    cycle.requestIdentity !== target.requestIdentity ||
    cycle.buildId !== target.build._id ||
    cycle.organizationId !== target.build.organizationId ||
    cycle.brokerageId !== target.build.brokerageId ||
    cycle.kind !== target.kind
  ) {
    throw safeUnavailableError();
  }
  const files: Array<{
    downloadUrl: string | null;
    fileName: string;
    mimeType: string;
    reference:
      | { evidenceAssetId: Id<"buildEvidenceAssets">; kind: "asset" }
      | {
          assetId: Id<"buildCollaborationAssets">;
          costDocumentId: Id<"costDocuments">;
          costDocumentPageId: Id<"costDocumentPages">;
          kind: "cost_document_page";
        };
    sizeBytes: number;
  }> = [];
  for (const reference of cycle.evidenceReferences) {
    if (reference.kind === "asset") {
      if (target.kind !== "milestone") {
        throw safeUnavailableError();
      }
      const asset = await ctx.db.get(reference.evidenceAssetId);
      let valid = Boolean(
        asset &&
          asset.buildId === target.build._id &&
          asset.organizationId === target.build.organizationId &&
          asset.brokerageId === target.build.brokerageId &&
          asset.proposalId === target.build.proposalId &&
          asset.milestoneKey === target.record.key
      );
      if (asset && reference.association.kind === "package_revision") {
        const [item, packageRevision] = await Promise.all([
          ctx.db.get(reference.association.evidencePackageItemId),
          ctx.db.get(reference.association.evidencePackageRevisionId),
        ]);
        valid = Boolean(
          valid &&
            item &&
            packageRevision &&
            packageRevisionMatchesTarget({
              packageRevision,
              referencedRevision: packageRevision.revision,
              referencedSubmilestoneKey:
                reference.submilestoneKey ?? packageRevision.submilestoneKey,
              target,
            }) &&
            packageItemMatchesTarget({
              asset,
              item,
              packageRevision,
              referencedSubmilestoneKey:
                reference.submilestoneKey ?? packageRevision.submilestoneKey,
              target,
            })
        );
      } else if (asset && reference.association.kind === "site_visit") {
        const visit = await ctx.db.get(reference.association.siteVisitId);
        valid = Boolean(
          valid &&
            visit &&
            asset.siteVisitId === visit._id &&
            visit.buildId === target.build._id &&
            visit.buildMilestoneId === target.record._id &&
            visit.organizationId === target.build.organizationId &&
            visit.brokerageId === target.build.brokerageId &&
            visit.status === "complete"
        );
      }
      if (!(valid && asset)) {
        throw safeUnavailableError();
      }
      files.push({
        downloadUrl: asset.storageId
          ? await ctx.storage.getUrl(asset.storageId)
          : null,
        fileName: asset.fileName,
        mimeType: asset.mimeType,
        reference: {
          evidenceAssetId: asset._id,
          kind: "asset",
        },
        sizeBytes: asset.sizeBytes,
      });
      continue;
    }
    if (reference.kind !== "cost_document_page") {
      continue;
    }
    if (target.kind !== "milestone") {
      throw safeUnavailableError();
    }
    const [page, document, asset] = await Promise.all([
      ctx.db.get(reference.costDocumentPageId),
      ctx.db.get(reference.costDocumentId),
      ctx.db.get(reference.assetId),
    ]);
    if (
      !page ||
      !document ||
      !asset ||
      page._id !== reference.costDocumentPageId ||
      page.assetId !== asset._id ||
      page.costDocumentId !== document._id ||
      page.buildId !== target.build._id ||
      page.organizationId !== target.build.organizationId ||
      page.brokerageId !== target.build.brokerageId ||
      !costDocumentMatchesTarget(document, target) ||
      asset.buildId !== target.build._id ||
      asset.organizationId !== target.build.organizationId ||
      asset.brokerageId !== target.build.brokerageId ||
      asset.storageDeletedAt !== undefined
    ) {
      throw safeUnavailableError();
    }
    files.push({
      downloadUrl: await ctx.storage.getUrl(asset.storageId),
      fileName: page.fileNameSnapshot,
      mimeType: page.mimeTypeSnapshot,
      reference: {
        assetId: asset._id,
        costDocumentId: document._id,
        costDocumentPageId: page._id,
        kind: "cost_document_page",
      },
      sizeBytes: asset.sizeBytes,
    });
  }
  return {
    cycleId: cycle._id,
    cycleNumber: cycle.cycleNumber,
    evidenceReferences: cycle.evidenceReferences,
    files,
  };
}

async function requireCurrentCycle(
  ctx: ReviewCtx,
  target: ResolvedReviewTarget
) {
  const cycleId = target.record.currentLenderPortalReviewCycleId;
  const cycle = cycleId ? await ctx.db.get(cycleId) : null;
  if (
    !cycle ||
    cycle.requestIdentity !== target.requestIdentity ||
    cycle.buildId !== target.build._id
  ) {
    throw safeUnavailableError();
  }
  return cycle;
}

async function builderProjection(
  ctx: ReviewCtx,
  target: ResolvedReviewTarget,
  cycle: Doc<"lenderPortalReviewCycles">,
  historyPaginationOpts: PaginationOptions
) {
  const effectiveState = await projectedCycleState(ctx, target, cycle);
  const revisionInstructions = cycle.revisionInstructions ?? null;
  const history = await ctx.db
    .query("lenderPortalReviewCycles")
    .withIndex("by_request_identity_and_cycle_number", (query) =>
      query.eq("requestIdentity", target.requestIdentity)
    )
    .order("desc")
    .paginate(historyPaginationOpts);
  return {
    buildId: target.build._id,
    canResubmit: effectiveState === "correction_required",
    currentCycle: builderCycleProjection(cycle, effectiveState),
    currentCycleNumber: cycle.cycleNumber,
    eligibility: builderEligibility(effectiveState),
    history: {
      ...history,
      page: history.page.map((historyCycle) =>
        builderCycleProjection(historyCycle)
      ),
    },
    kind: target.kind,
    notice: builderNotice(effectiveState, revisionInstructions),
    requestIdentity: target.requestIdentity,
    revisionInstructions,
    state: effectiveState,
  };
}

function builderCycleProjection(
  cycle: Doc<"lenderPortalReviewCycles">,
  state: LenderPortalReviewRequestState = cycle.state
) {
  return {
    cycleNumber: cycle.cycleNumber,
    evidenceReferences: cycle.evidenceReferences,
    requirements: cycle.requirements,
    state,
    submission: cycle.submission,
    submittedAt: cycle.submittedAt,
  };
}

function builderEligibility(state: LenderPortalReviewRequestState) {
  if (state === "correction_required") {
    return { canSubmit: true, reason: "eligible_for_resubmission" as const };
  }
  if (state === "completed") {
    return { canSubmit: false, reason: "review_completed" as const };
  }
  return { canSubmit: false, reason: "awaiting_review" as const };
}

function builderNotice(
  state: LenderPortalReviewRequestState,
  revisionInstructions: string | null
) {
  if (state === "correction_required") {
    return {
      body:
        revisionInstructions ??
        "Update the request and submit the next decision cycle.",
      title: "Needs revision",
    };
  }
  if (state === "completed") {
    return { body: "The current review cycle is complete.", title: "Complete" };
  }
  if (state === "partial_approval") {
    return {
      body: "The current review cycle is still awaiting a required review.",
      title: "Review in progress",
    };
  }
  return {
    body: "The current request is with the review team.",
    title: "In review",
  };
}

async function reviewerDetailProjection(
  ctx: ReviewCtx,
  target: ResolvedReviewTarget,
  historyPaginationOpts: PaginationOptions
) {
  const cycles = await ctx.db
    .query("lenderPortalReviewCycles")
    .withIndex("by_request_identity_and_cycle_number", (query) =>
      query.eq("requestIdentity", target.requestIdentity)
    )
    .order("desc")
    .paginate(historyPaginationOpts);
  const current = await requireCurrentCycle(ctx, target);
  const needsLiveEligibility = [current, ...cycles.page].some(
    (cycle) =>
      cycle.isCurrent &&
      (cycle.state === "in_review" || cycle.state === "partial_approval")
  );
  const eligibleLenderWorkosUserIds = needsLiveEligibility
    ? await eligibleLenderApproverIds(ctx, target)
    : new Map<string, EligibleLenderApprover>();
  const projectedCycles = await Promise.all(
    cycles.page.map((cycle) =>
      projectReviewerCycle(
        ctx,
        target,
        cycle,
        eligibleLenderWorkosUserIds
      )
    )
  );
  const projectedCurrent =
    projectedCycles.find((cycle) => cycle.cycleId === current._id) ??
    (await projectReviewerCycle(
      ctx,
      target,
      current,
      eligibleLenderWorkosUserIds
    ));
  return {
    buildId: target.build._id,
    buildName: target.build.buildName,
    currentCycle: projectedCurrent,
    currentCycleNumber: current.cycleNumber,
    cycles: { ...cycles, page: projectedCycles },
    kind: target.kind,
    label: target.label,
    requestIdentity: target.requestIdentity,
    state: projectedCurrent.state,
  };
}

async function projectReviewerCycle(
  ctx: ReviewCtx,
  target: ResolvedReviewTarget,
  cycle: Doc<"lenderPortalReviewCycles">,
  eligibleLenderWorkosUserIds: EligibleLenderApprovers
) {
  if (
    cycle.requestIdentity !== target.requestIdentity ||
    cycle.buildId !== target.build._id ||
    cycle.organizationId !== target.build.organizationId ||
    cycle.brokerageId !== target.build.brokerageId
  ) {
    throw safeUnavailableError();
  }
  const decisions = await ctx.db
    .query("lenderPortalReviewDecisions")
    .withIndex("by_cycle", (query) => query.eq("cycleId", cycle._id))
    .take(MAX_CYCLE_DECISIONS + 1);
  if (decisions.length > MAX_CYCLE_DECISIONS) {
    throw safeUnavailableError();
  }
  const state = projectedDecisionState({
    cycle,
    decisions,
    eligibleLenderWorkosUserIds,
  });
  const terminalContributorDecisionIds = new Set(
    cycle.terminalContributorDecisionIds?.map(String) ?? []
  );
  return {
    cycleId: cycle._id,
    cycleNumber: cycle.cycleNumber,
    decisions: decisions.map((decision) => ({
      actorRole: decision.actorRole,
      actorWorkosUserId: decision.actorWorkosUserId,
      createdAt: decision.createdAt,
      countsTowardCurrentApproval:
        decision.decision === "approved" &&
        cycle.isCurrent &&
        (cycle.state === "completed"
          ? terminalContributorDecisionIds.has(String(decision._id))
          : (cycle.state === "in_review" ||
                cycle.state === "partial_approval") &&
              (decision.group !== "lender" ||
                lenderDecisionIsCurrentlyEligible(
                  decision,
                  eligibleLenderWorkosUserIds
                ))),
      decision: decision.decision,
      decisionId: decision._id,
      group: decision.group,
      privateRationale: decision.privateRationale ?? null,
      revisionInstructions: decision.revisionInstructions ?? null,
    })),
    evidenceReferences: cycle.evidenceReferences,
    requirements: cycle.requirements,
    state,
    submission: cycle.submission,
    submittedAt: cycle.submittedAt,
    submittedByWorkosUserId: cycle.submittedByWorkosUserId,
  };
}

async function reviewerQueueProjection(
  ctx: ReviewCtx,
  build: Doc<"activeBuilds">,
  group: LenderPortalReviewGroup,
  viewer: {
    actorWorkosUserId: string;
    eligibleLenderWorkosUserIds?: {
      draw: EligibleLenderApprovers;
      milestone: EligibleLenderApprovers;
    };
  },
  paginationOpts: PaginationOptions
) {
  const eligibleLenderWorkosUserIds = viewer.eligibleLenderWorkosUserIds ?? {
    draw: await eligibleLenderApproverIdsForBuild(ctx, build, "draw"),
    milestone: await eligibleLenderApproverIdsForBuild(ctx, build, "milestone"),
  };
  const cycles = await ctx.db
    .query("lenderPortalReviewCycles")
    .withIndex("by_build_and_is_current_and_submitted_at", (query) =>
      query.eq("buildId", build._id).eq("isCurrent", true)
    )
    .order("desc")
    .paginate(paginationOpts);
  return {
    ...cycles,
    page: await Promise.all(
      cycles.page.map((cycle) =>
        reviewerQueueRow(ctx, {
          build,
          cycle,
          eligibleLenderIds: eligibleLenderWorkosUserIds[cycle.kind],
          group,
          viewerWorkosUserId: viewer.actorWorkosUserId,
        })
      )
    ),
  };
}

async function reviewerQueueRow(
  ctx: ReviewCtx,
  input: {
    build: Doc<"activeBuilds">;
    cycle: Doc<"lenderPortalReviewCycles">;
    eligibleLenderIds: EligibleLenderApprovers;
    group: LenderPortalReviewGroup;
    viewerWorkosUserId: string;
  }
) {
  const actorDecision = input.cycle.decisionSummaries.find(
    (decision) =>
      decision.group === input.group &&
      decision.actorWorkosUserId === input.viewerWorkosUserId
  );
  const effectiveState = projectedDecisionState({
    cycle: input.cycle,
    decisions: input.cycle.decisionSummaries,
    eligibleLenderWorkosUserIds: input.eligibleLenderIds,
  });
  const progress =
    input.cycle.state === "completed"
      ? {
          approvedGroups: input.cycle.approvedGroups,
          lenderApprovalCount: input.cycle.lenderApprovalCount,
        }
      : approvalProgress({
          decisions: input.cycle.decisionSummaries,
          eligibleLenderWorkosUserIds: input.eligibleLenderIds,
        });
  const active =
    effectiveState === "in_review" || effectiveState === "partial_approval";
  const groupRequired = input.cycle.requirements.requiredGroups.includes(
    input.group
  );
  const viewerEligible =
    input.group !== "lender" ||
    input.eligibleLenderIds.has(input.viewerWorkosUserId);
  const targetAvailability = await cycleTargetAvailability(
    ctx,
    input.build,
    input.cycle
  );
  const viewerActionState = reviewActionState({
    active,
    actorDecided: Boolean(actorDecision),
    groupRequired,
    targetAvailability,
    viewerEligible,
  });
  return {
    actionRequired: viewerActionState === "needs_action",
    approvedGroups: progress.approvedGroups,
    buildId: input.build._id,
    buildName: input.build.buildName,
    currentEligibleLenderCount: input.eligibleLenderIds.size,
    currentCycleNumber: input.cycle.cycleNumber,
    kind: input.cycle.kind,
    label: input.cycle.targetLabel,
    lenderApprovalCount: progress.lenderApprovalCount,
    lenderQuorum: input.cycle.requirements.lenderQuorum,
    requestIdentity: input.cycle.requestIdentity,
    requiredGroups: input.cycle.requirements.requiredGroups,
    state: effectiveState,
    targetAvailability,
    viewerActionState,
    viewerDecision: actorDecision?.decision ?? null,
  };
}

function reviewActionState(input: {
  active: boolean;
  actorDecided: boolean;
  groupRequired: boolean;
  targetAvailability: "available" | "unavailable";
  viewerEligible: boolean;
}) {
  if (input.targetAvailability === "unavailable") {
    return "unavailable" as const;
  }
  if (!input.active) {
    return "closed" as const;
  }
  if (!input.groupRequired) {
    return "not_required" as const;
  }
  if (input.actorDecided) {
    return "acted" as const;
  }
  return input.viewerEligible
    ? ("needs_action" as const)
    : ("ineligible" as const);
}

async function cycleTargetAvailability(
  ctx: ReviewCtx,
  build: Doc<"activeBuilds">,
  cycle: Doc<"lenderPortalReviewCycles">
) {
  if (cycle.kind === "milestone" && cycle.milestoneId) {
    const milestone = await ctx.db.get(cycle.milestoneId);
    return milestone &&
      milestone.planningState !== "superseded" &&
      milestone.buildId === build._id &&
      milestone.brokerageId === build.brokerageId &&
      milestone.organizationId === build.organizationId
      ? ("available" as const)
      : ("unavailable" as const);
  }
  if (cycle.kind === "draw" && cycle.drawRequestId) {
    const draw = await ctx.db.get(cycle.drawRequestId);
    return draw &&
      draw.buildId === build._id &&
      draw.brokerageId === build.brokerageId &&
      draw.organizationId === build.organizationId
      ? ("available" as const)
      : ("unavailable" as const);
  }
  return "unavailable" as const;
}

async function writeReviewAudit(
  ctx: MutationCtx,
  input: {
    actorRole: ReviewActorRole;
    actorWorkosUserId: string;
    cycleNumber: number;
    eventType: string;
    newState: LenderPortalReviewRequestState;
    priorState?: LenderPortalReviewRequestState;
    reason?: string;
    target: ResolvedReviewTarget;
  }
) {
  await ctx.db.insert("auditEvents", {
    actorRole: input.actorRole,
    actorRoles: [input.actorRole],
    actorWorkosUserId: input.actorWorkosUserId,
    brokerageId: input.target.build.brokerageId,
    buildId: input.target.build._id,
    command: input.eventType,
    createdAt: Date.now(),
    entityId: input.target.requestIdentity,
    entityType:
      input.target.kind === "milestone"
        ? "buildMilestone"
        : "activeBuildDrawRequest",
    eventType: input.eventType,
    newState: input.newState,
    organizationId: input.target.build.organizationId,
    priorState: input.priorState,
    reason: input.reason,
    resourceType: input.target.kind,
    targetRevisions: [
      {
        entityId: input.target.requestIdentity,
        entityType: "lenderPortalReviewCycle",
        revision: input.cycleNumber,
      },
    ],
    warnings: [],
  });
}

function submitResult(
  cycle: Doc<"lenderPortalReviewCycles">,
  replayed: boolean
) {
  return {
    cycleId: cycle._id,
    cycleNumber: cycle.cycleNumber,
    replayed,
    requestIdentity: cycle.requestIdentity,
    state: cycle.state,
  };
}

function decisionResult(
  decision: Doc<"lenderPortalReviewDecisions">,
  state: LenderPortalReviewRequestState,
  replayed: boolean
) {
  return {
    cycleNumber: decision.cycleNumber,
    decisionId: decision._id,
    replayed,
    requestIdentity: decision.requestIdentity,
    state,
  };
}

function normalizeIdempotencyKey(value: string) {
  const normalized = value.trim();
  if (normalized.length < 8 || normalized.length > 128) {
    throw new ConvexError({
      code: "INVALID_IDEMPOTENCY_KEY",
      message: "Idempotency key must contain 8 to 128 characters.",
      recoverable: true,
    });
  }
  return normalized;
}

function normalizeOptionalText(value: string | undefined, max: number) {
  const normalized = value?.trim();
  if (!normalized) {
    return;
  }
  if (normalized.length > max) {
    throw new ConvexError({
      code: "REVIEW_TEXT_TOO_LONG",
      message: `Review text must contain ${max} characters or fewer.`,
      recoverable: true,
    });
  }
  return normalized;
}

function recordValue(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function numberValue(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value : null;
}

function requireMoneyInteger(value: number | null) {
  if (value === null || !Number.isSafeInteger(value) || value < 0) {
    throw new ConvexError({
      code: "INVALID_MONEY_AMOUNT",
      message: "Money must use non-negative safe integer Build-currency units.",
      recoverable: true,
    });
  }
  return value;
}

function safeMoneyAdd(left: number, right: number) {
  const total = left + right;
  if (!Number.isSafeInteger(total)) {
    throw new ConvexError({
      code: "INVALID_MONEY_AMOUNT",
      message: "Documented total exceeds safe integer Build-currency units.",
      recoverable: true,
    });
  }
  return total;
}

function costDocumentUnavailableError() {
  return new ConvexError({
    code: "COST_DOCUMENT_UNAVAILABLE",
    message: "Receipt or invoice is unavailable for this Milestone review.",
    recoverable: true,
  });
}

function evidenceReferenceLimitError() {
  return new ConvexError({
    code: "EVIDENCE_REFERENCE_LIMIT_EXCEEDED",
    message: "The milestone evidence reference limit was exceeded.",
    recoverable: true,
  });
}

function safeUnavailableError() {
  return new ConvexError({
    code: "REVIEW_REQUEST_UNAVAILABLE",
    message: "Review request unavailable.",
    recoverable: false,
  });
}

function invalidEvidencePackageReference(submilestoneKey?: string) {
  return new ConvexError({
    code: "INVALID_EVIDENCE_PACKAGE_REFERENCE",
    message: "Evidence Package reference is invalid for this review request.",
    recoverable: true,
    ...(submilestoneKey ? { submilestoneKey } : {}),
  });
}

function staleCycleError() {
  return new ConvexError({
    code: "STALE_REVIEW_CYCLE",
    message: "Review cycle changed. Refresh before retrying.",
    recoverable: true,
  });
}

function idempotencyConflictError() {
  return new ConvexError({
    code: "IDEMPOTENCY_KEY_REUSED",
    message: "This idempotency key belongs to a different review command.",
    recoverable: true,
  });
}
