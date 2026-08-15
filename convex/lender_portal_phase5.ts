import {
  type PaginationOptions,
  paginationOptsValidator,
} from "convex/server";
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
  lenderPortalReviewerQueuePageValidator,
  lenderPortalReviewerRequestProjectionValidator,
  lenderPortalReviewTargetValidator,
  lenderPortalSubmitReviewResultValidator,
} from "./lender_portal_phase5_contracts";
import { getLenderOrganizationApprovalEligibility } from "./lenderOrganizationAccess";
import type { MutationCtx, QueryCtx } from "./types";

const MAX_CYCLE_DECISIONS = 1_001;
const EVIDENCE_REFERENCE_LIMIT = 500;

type ReviewCtx = QueryCtx | MutationCtx;
type ViewerReviewCtx = ReviewCtx & { viewer: AuthorizedViewer };
type LenderReviewCtx = ViewerReviewCtx & {
  activeOrganization: ActiveLenderOrganizationContext;
};
type ReviewActorRole = "admin" | "builder" | "lender" | "lender-admin";

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
    return await reviewerQueueProjection(ctx, build, "backoffice", {
      actorWorkosUserId: ctx.viewer.subject,
    }, args.paginationOpts);
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
          draw: new Set(
            eligibility.members.draw.map((member) => member.workosUserId)
          ),
          milestone: new Set(
            eligibility.members.milestone.map((member) => member.workosUserId)
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

async function submitReviewCycle(
  ctx: MutationCtx,
  input: {
    actorWorkosUserId: string;
    expectedCycleNumber: number;
    idempotencyKey: string;
    target: ResolvedReviewTarget;
  }
) {
  const idempotencyKey = normalizeIdempotencyKey(input.idempotencyKey);
  const fingerprint = JSON.stringify({
    command: "submitBuilderReviewRequest",
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

  const requirements = reviewRequirements(input.target);
  const { evidenceReferences, submission } = await snapshotSubmission(
    ctx,
    input.target
  );
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
    requirements: cycle.requirements,
  });
  const approvedGroups = [
    ...new Set(
      existingDecisions
        .filter((decision) => decision.decision === "approved")
        .map((decision) => decision.group)
    ),
  ];
  const lenderApprovalCount = existingDecisions.filter(
    (decision) =>
      decision.decision === "approved" && decision.group === "lender"
  ).length;
  await ctx.db.patch(cycle._id, {
    approvedGroups,
    decisionSummaries: existingDecisions.map((decision) => ({
      actorWorkosUserId: decision.actorWorkosUserId,
      decision: decision.decision,
      group: decision.group,
    })),
    lenderApprovalCount,
    ...(revisionInstructions ? { revisionInstructions } : {}),
    state,
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
  return decisionResult(decision, state, false);
}

function decisionState(input: {
  decisions: Array<{ decision: "approved" | "rejected"; group: string }>;
  requirements: LenderPortalReviewRequirements;
}): LenderPortalReviewRequestState {
  if (input.decisions.some((decision) => decision.decision === "rejected")) {
    return "correction_required";
  }
  const approvals = input.decisions.filter(
    (decision) => decision.decision === "approved"
  );
  const approvedGroups = new Set(approvals.map((decision) => decision.group));
  const lenderApprovalCount = approvals.filter(
    (decision) => decision.group === "lender"
  ).length;
  const complete = input.requirements.requiredGroups.every((group) =>
    group === "lender"
      ? lenderApprovalCount >= (input.requirements.lenderQuorum ?? 1)
      : approvedGroups.has(group)
  );
  return complete
    ? "completed"
    : approvedGroups.size > 0
      ? "partial_approval"
      : "in_review";
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

async function snapshotSubmission(
  ctx: MutationCtx,
  target: ResolvedReviewTarget
) {
  if (target.kind === "draw") {
    const allocations = await ctx.db
      .query("activeBuildDrawRequestAllocations")
      .withIndex("by_request", (query) =>
        query.eq("drawRequestId", target.record._id)
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
        amountCents: target.record.amountCents,
        displayId: target.record.displayId,
        drawRequestId: target.record._id,
        kind: "draw" as const,
        label: target.record.label,
        note: target.record.note ?? null,
        requestedAt: target.record.requestedAt,
        requestKey: target.record.requestKey,
      },
    };
  }

  const claim = recordValue(target.record.completionClaim);
  const assets = await ctx.db
    .query("buildEvidenceAssets")
    .withIndex("by_build_milestone", (query) =>
      query
        .eq("buildId", target.build._id)
        .eq("milestoneKey", target.record.key)
    )
    .take(EVIDENCE_REFERENCE_LIMIT + 1);
  if (assets.length > EVIDENCE_REFERENCE_LIMIT) {
    throw new Error("Milestone evidence snapshot limit exceeded.");
  }
  const evidenceReferences: LenderPortalReviewEvidenceReference[] = assets.map(
    (asset) => ({
    evidenceAssetId: asset._id,
    kind: "asset" as const,
    label: asset.label,
    locationVerified: asset.locationVerified,
    milestoneKey: asset.milestoneKey,
    ...(asset.submilestoneKey
      ? { submilestoneKey: asset.submilestoneKey }
      : {}),
    })
  );
  const packageReferences = Array.isArray(claim?.evidencePackageRevisionIds)
    ? claim.evidencePackageRevisionIds
    : [];
  if (
    packageReferences.length > EVIDENCE_REFERENCE_LIMIT ||
    evidenceReferences.length + packageReferences.length >
      EVIDENCE_REFERENCE_LIMIT
  ) {
    throw new ConvexError({
      code: "EVIDENCE_REFERENCE_LIMIT_EXCEEDED",
      message: "The milestone evidence reference limit was exceeded.",
      recoverable: true,
    });
  }
  for (const reference of packageReferences) {
    const item = recordValue(reference);
    const rawId = item?.revisionId;
    const referencedRevision = numberValue(item?.revision);
    const referencedSubmilestoneKey = stringValue(item?.submilestoneKey);
    const revisionId =
      typeof rawId === "string"
        ? ctx.db.normalizeId("buildSubmilestoneEvidencePackageRevisions", rawId)
        : null;
    if (!revisionId || !referencedSubmilestoneKey) {
      throw invalidEvidencePackageReference();
    }
    const packageRevision = await ctx.db.get(revisionId);
    const submilestone = packageRevision
      ? await ctx.db.get(packageRevision.buildSubmilestoneId)
      : null;
    if (
      !packageRevision ||
      !submilestone ||
      packageRevision.buildId !== target.build._id ||
      packageRevision.organizationId !== target.build.organizationId ||
      packageRevision.brokerageId !== target.build.brokerageId ||
      packageRevision.proposalId !== target.build.proposalId ||
      packageRevision.buildMilestoneId !== target.record._id ||
      packageRevision.milestoneKey !== target.record.key ||
      packageRevision.submilestoneKey !== referencedSubmilestoneKey ||
      packageRevision.revision !== referencedRevision ||
      packageRevision.status !== "frozen" ||
      submilestone._id !== packageRevision.buildSubmilestoneId ||
      submilestone.buildId !== target.build._id ||
      submilestone.organizationId !== target.build.organizationId ||
      submilestone.brokerageId !== target.build.brokerageId ||
      submilestone.buildMilestoneId !== target.record._id ||
      submilestone.milestoneKey !== target.record.key ||
      submilestone.key !== referencedSubmilestoneKey ||
      submilestone.planningState === "superseded"
    ) {
      throw invalidEvidencePackageReference(referencedSubmilestoneKey);
    }
    evidenceReferences.push({
      evidencePackageRevisionId: revisionId,
      kind: "package_revision" as const,
      label: `Evidence Package revision ${packageRevision.revision}`,
      milestoneKey: target.record.key,
      submilestoneKey: referencedSubmilestoneKey,
    });
  }
  return {
    evidenceReferences,
    submission: {
      actualCostCents: numberValue(claim?.actualCostCents),
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
    canResubmit: cycle.state === "correction_required",
    currentCycle: builderCycleProjection(cycle),
    currentCycleNumber: cycle.cycleNumber,
    eligibility: builderEligibility(cycle.state),
    history: {
      ...history,
      page: history.page.map(builderCycleProjection),
    },
    kind: target.kind,
    notice: builderNotice(cycle.state, revisionInstructions),
    requestIdentity: target.requestIdentity,
    revisionInstructions,
    state: cycle.state,
  };
}

function builderCycleProjection(cycle: Doc<"lenderPortalReviewCycles">) {
  return {
    cycleNumber: cycle.cycleNumber,
    evidenceReferences: cycle.evidenceReferences,
    requirements: cycle.requirements,
    state: cycle.state,
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
  const projectedCycles = await Promise.all(
    cycles.page.map((cycle) => projectReviewerCycle(ctx, target, cycle))
  );
  const current = await requireCurrentCycle(ctx, target);
  return {
    buildId: target.build._id,
    buildName: target.build.buildName,
    currentCycle: await projectReviewerCycle(ctx, target, current),
    currentCycleNumber: current.cycleNumber,
    cycles: { ...cycles, page: projectedCycles },
    kind: target.kind,
    label: target.label,
    requestIdentity: target.requestIdentity,
    state: current.state,
  };
}

async function projectReviewerCycle(
  ctx: ReviewCtx,
  target: ResolvedReviewTarget,
  cycle: Doc<"lenderPortalReviewCycles">
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
  return {
      cycleId: cycle._id,
      cycleNumber: cycle.cycleNumber,
      decisions: decisions.map((decision) => ({
        actorRole: decision.actorRole,
        actorWorkosUserId: decision.actorWorkosUserId,
        createdAt: decision.createdAt,
        decision: decision.decision,
        decisionId: decision._id,
        group: decision.group,
        privateRationale: decision.privateRationale ?? null,
        revisionInstructions: decision.revisionInstructions ?? null,
      })),
      evidenceReferences: cycle.evidenceReferences,
      requirements: cycle.requirements,
      state: cycle.state,
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
      draw: Set<string>;
      milestone: Set<string>;
    };
  },
  paginationOpts: PaginationOptions
) {
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
    cycles.page.map(async (cycle) => {
      const actorDecision = cycle.decisionSummaries.find(
        (decision) =>
          decision.group === group &&
          decision.actorWorkosUserId === viewer.actorWorkosUserId
      );
      const eligibleLenderWorkosUserIds =
        viewer.eligibleLenderWorkosUserIds?.[cycle.kind];
      const active =
        cycle.state === "in_review" || cycle.state === "partial_approval";
      const groupRequired = cycle.requirements.requiredGroups.includes(group);
      const viewerEligible =
        group !== "lender" ||
        eligibleLenderWorkosUserIds?.has(viewer.actorWorkosUserId) === true;
      const targetAvailability = await cycleTargetAvailability(ctx, build, cycle);
      const viewerActionState = targetAvailability === "unavailable"
        ? "unavailable"
        : !active
        ? "closed"
        : !groupRequired
          ? "not_required"
          : actorDecision
            ? "acted"
            : !viewerEligible
              ? "ineligible"
              : "needs_action";
      return {
        actionRequired: viewerActionState === "needs_action",
        approvedGroups: cycle.approvedGroups,
        buildId: build._id,
        buildName: build.buildName,
        currentEligibleLenderCount:
          eligibleLenderWorkosUserIds?.size ?? null,
        currentCycleNumber: cycle.cycleNumber,
        kind: cycle.kind,
        label: cycle.targetLabel,
        lenderApprovalCount: cycle.lenderApprovalCount,
        lenderQuorum: cycle.requirements.lenderQuorum,
        requestIdentity: cycle.requestIdentity,
        requiredGroups: cycle.requirements.requiredGroups,
        state: cycle.state,
        targetAvailability,
        viewerActionState,
        viewerDecision: actorDecision?.decision ?? null,
      };
    })
  ),
  };
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
      ? "available" as const
      : "unavailable" as const;
  }
  if (cycle.kind === "draw" && cycle.drawRequestId) {
    const draw = await ctx.db.get(cycle.drawRequestId);
    return draw &&
      draw.buildId === build._id &&
      draw.brokerageId === build.brokerageId &&
      draw.organizationId === build.organizationId
      ? "available" as const
      : "unavailable" as const;
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
    message:
      "Evidence Package reference is invalid for this review request.",
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
