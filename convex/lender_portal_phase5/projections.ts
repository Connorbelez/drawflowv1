import { type PaginationOptions, paginationOptsValidator } from "convex/server";
import { v } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import {
  adminQuery,
  authenticatedQuery,
  lenderOrganizationQuery,
} from "../authz";
import { listAccessibleLenderBuilds } from "../lender_portal_access";
import {
  encodeLenderQueueCursor,
  type LenderQueueScope,
  parseValidatedLenderQueueCursor,
} from "../lender_portal_pagination";
import {
  lenderPortalBuilderRequestProjectionValidator,
  lenderPortalMilestoneQueuePageValidator,
  lenderPortalReviewEvidenceProjectionValidator,
  lenderPortalReviewerQueuePageValidator,
  lenderPortalReviewerRequestProjectionValidator,
  lenderPortalReviewTargetValidator,
} from "../lender_portal_phase5_contracts";
import type {
  LenderPortalReviewGroup,
  LenderPortalReviewRequestState,
} from "../lender_portal_phase5_contracts";
import {
  reviewEvidenceProjection,
  requireCurrentCycle,
} from "./evidence";
import {
  addDaysToIsoDate,
  approvalProgress,
  currentLenderApproverMaps,
  cycleTargetAvailability,
  eligibleLenderApproverIds,
  eligibleLenderApproverIdsForBuild,
  LENDER_MILESTONE_QUEUE_CYCLE_LIMIT,
  MAX_CYCLE_DECISIONS,
  lenderDecisionIsCurrentlyEligible,
  projectedCycleState,
  projectedDecisionState,
  requireBackofficeBuildAccess,
  requireBackofficeTargetAccess,
  requireBuilderTargetAccess,
  requireBuild,
  requireLenderBuildAccess,
  requireLenderTargetAccess,
  resolveReviewTarget,
  reviewActionState,
  safeMoneyAdd,
  safeUnavailableError,
  timestampToIsoDate,
  validateLenderMilestoneQueuePageSize,
} from "./shared";
import type {
  EligibleLenderApprover,
  EligibleLenderApprovers,
  ResolvedReviewTarget,
  ReviewCtx,
} from "./shared";

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
      args.historyPaginationOpts,
      {
        group: "backoffice",
        viewerWorkosUserId: ctx.viewer.subject,
      }
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
    const eligibleLenderWorkosUserIds = await currentLenderApproverMaps(ctx);
    return await reviewerQueueProjection(
      ctx,
      build,
      "lender",
      {
        actorWorkosUserId: ctx.activeOrganization.workosUserId,
        eligibleLenderWorkosUserIds,
      },
      args.paginationOpts
    );
  })
  .public();

export const listAllAssignedLenderMilestoneReviewRequests =
  lenderOrganizationQuery
    .input({
      paginationOpts: paginationOptsValidator,
      scope: v.union(v.literal("action"), v.literal("all")),
    })
    .returns(lenderPortalMilestoneQueuePageValidator)
    .handler(async (ctx, args) => {
      validateLenderMilestoneQueuePageSize(args.paginationOpts.numItems);
      const [accessibleBuilds, eligibleLenderWorkosUserIds] = await Promise.all(
        [listAccessibleLenderBuilds(ctx), currentLenderApproverMaps(ctx)]
      );
      const cycleGroups = await Promise.all(
        accessibleBuilds.map(async ({ build }) => {
          const cycles = await ctx.db
            .query("lenderPortalReviewCycles")
            .withIndex("by_build_and_is_current_and_submitted_at", (query) =>
              query.eq("buildId", build._id).eq("isCurrent", true)
            )
            .order("desc")
            .take(LENDER_MILESTONE_QUEUE_CYCLE_LIMIT + 1);
          if (cycles.length > LENDER_MILESTONE_QUEUE_CYCLE_LIMIT) {
            throw safeUnavailableError();
          }
          return cycles
            .filter((cycle) => cycle.kind === "milestone")
            .map((cycle) => ({ build, cycle }));
        })
      );
      const rows = await Promise.all(
        cycleGroups.flat().map(({ build, cycle }) =>
          lenderMilestoneQueueRow(ctx, {
            build,
            cycle,
            eligibleLenderIds: eligibleLenderWorkosUserIds.milestone,
            viewerWorkosUserId: ctx.activeOrganization.workosUserId,
          })
        )
      );
      const authorizedRows = rows.sort(compareLenderMilestoneQueueRows);
      const scopedRows =
        args.scope === "action"
          ? authorizedRows.filter((row) => row.actionRequired)
          : authorizedRows;
      return paginateLenderMilestoneQueueRows({
        authorizedRows,
        paginationOpts: args.paginationOpts,
        rows: scopedRows,
        scope: args.scope,
      });
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
      args.historyPaginationOpts,
      {
        group: "lender",
        viewerWorkosUserId: ctx.activeOrganization.workosUserId,
      }
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
      {
        group: "lender",
        viewerWorkosUserId: ctx.activeOrganization.workosUserId,
      }
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
      {
        group: "backoffice",
        viewerWorkosUserId: ctx.viewer.subject,
      }
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
      args.historyPaginationOpts
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
  historyPaginationOpts: PaginationOptions,
  viewer: {
    group: LenderPortalReviewGroup;
    viewerWorkosUserId: string;
  }
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
      projectReviewerCycle(ctx, target, cycle, eligibleLenderWorkosUserIds)
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
  const viewerState = await reviewerQueueRow(ctx, {
    build: target.build,
    cycle: current,
    eligibleLenderIds: eligibleLenderWorkosUserIds,
    group: viewer.group,
    viewerWorkosUserId: viewer.viewerWorkosUserId,
  });
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
    targetAvailability: viewerState.targetAvailability,
    viewerActionState: viewerState.viewerActionState,
    viewerDecision: viewerState.viewerDecision,
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

export async function reviewerQueueRow(
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

async function lenderMilestoneQueueRow(
  ctx: ReviewCtx,
  input: {
    build: Doc<"activeBuilds">;
    cycle: Doc<"lenderPortalReviewCycles">;
    eligibleLenderIds: EligibleLenderApprovers;
    viewerWorkosUserId: string;
  }
) {
  if (
    input.cycle.kind !== "milestone" ||
    !input.cycle.milestoneId ||
    input.cycle.submission.kind !== "milestone" ||
    input.cycle.submission.milestoneId !== input.cycle.milestoneId
  ) {
    throw safeUnavailableError();
  }
  const milestoneId = input.cycle.milestoneId;
  const queueRow = await reviewerQueueRow(ctx, {
    build: input.build,
    cycle: input.cycle,
    eligibleLenderIds: input.eligibleLenderIds,
    group: "lender",
    viewerWorkosUserId: input.viewerWorkosUserId,
  });
  const milestone = await ctx.db.get(milestoneId);
  const canonicalMilestone =
    queueRow.targetAvailability === "available" &&
    milestone !== null &&
    milestone.buildId === input.build._id &&
    milestone.brokerageId === input.build.brokerageId &&
    milestone.organizationId === input.build.organizationId
      ? milestone
      : null;
  const submilestones = canonicalMilestone
    ? await ctx.db
        .query("buildSubmilestones")
        .withIndex("by_milestone", (query) =>
          query.eq("buildMilestoneId", milestoneId)
        )
        .take(501)
    : [];
  if (submilestones.length > 500) {
    throw safeUnavailableError();
  }
  const visibleSubmilestones = submilestones.filter(
    (submilestone) =>
      submilestone.planningState !== "superseded" &&
      submilestone.buildId === input.build._id &&
      submilestone.brokerageId === input.build.brokerageId &&
      submilestone.organizationId === input.build.organizationId
  );
  const projectedSubmilestones = await Promise.all(
    visibleSubmilestones.map(async (submilestone) => {
      const requirement = submilestone.siteVisitRequirementId
        ? await ctx.db.get(submilestone.siteVisitRequirementId)
        : null;
      const validRequirement =
        requirement &&
        requirement.buildId === input.build._id &&
        requirement.buildMilestoneId === milestoneId &&
        requirement.buildSubmilestoneId === submilestone._id &&
        requirement.brokerageId === input.build.brokerageId &&
        requirement.organizationId === input.build.organizationId
          ? requirement
          : null;
      const hasBuilderEvidence = input.cycle.evidenceReferences.some(
        (reference) =>
          "submilestoneKey" in reference &&
          reference.submilestoneKey === submilestone.key &&
          (reference.kind === "asset" || reference.kind === "package_revision")
      );
      return {
        builderEvidence: hasBuilderEvidence,
        name: submilestone.name,
        receiptCoverageCents: null,
        siteVisitAddressed:
          validRequirement?.status === "satisfied" ||
          validRequirement?.status === "waived",
        siteVisitRequired:
          validRequirement?.required === true &&
          validRequirement.status === "required",
      };
    })
  );
  const receiptCoverageCents = input.cycle.evidenceReferences.reduce(
    (total, reference) =>
      reference.kind === "cost_document"
        ? safeMoneyAdd(total, reference.amountCents)
        : total,
    0
  );
  const actualStartAt = canonicalMilestone
    ? (canonicalMilestone.actualStartedAt ?? canonicalMilestone.startedAt)
    : undefined;
  const evidence = [
    ...new Map(
      input.cycle.evidenceReferences.map((reference) => [
        `${reference.kind}:${reference.label}`,
        { kind: reference.kind, label: reference.label },
      ])
    ).values(),
  ];
  return {
    actionRequired: queueRow.actionRequired,
    actualCostCents: input.cycle.submission.actualCostCents,
    actualEndDate:
      input.cycle.submission.completedDay === null
        ? null
        : addDaysToIsoDate(
            input.build.startDate,
            input.cycle.submission.completedDay
          ),
    actualStartDate:
      actualStartAt === undefined ? null : timestampToIsoDate(actualStartAt),
    approvedGroups: queueRow.approvedGroups,
    buildId: input.build._id,
    buildName: input.build.buildName,
    currentEligibleLenderCount:
      queueRow.currentEligibleLenderCount ?? input.eligibleLenderIds.size,
    evidence,
    lenderApprovalCount: queueRow.lenderApprovalCount,
    lenderQuorum: queueRow.lenderQuorum,
    milestoneId,
    milestoneName: input.cycle.submission.milestoneName,
    plannedBudgetCents: canonicalMilestone?.budgetCents ?? null,
    plannedEndDate: canonicalMilestone
      ? addDaysToIsoDate(input.build.startDate, canonicalMilestone.dayEnd)
      : null,
    plannedStartDate: canonicalMilestone
      ? addDaysToIsoDate(input.build.startDate, canonicalMilestone.dayStart)
      : null,
    receiptCoverageCents:
      receiptCoverageCents > 0 ? receiptCoverageCents : null,
    receiptInvoiceRequired: input.cycle.requirements.receiptInvoiceRequired,
    requiredGroups: queueRow.requiredGroups,
    reviewCycleId: input.cycle._id,
    reviewCycleNumber: input.cycle.cycleNumber,
    siteVisitRequired: input.cycle.requirements.siteVisitRequired,
    state: queueRow.state,
    submittedAt: input.cycle.submittedAt,
    submilestones: projectedSubmilestones,
    targetAvailability: queueRow.targetAvailability,
    viewerActionState: queueRow.viewerActionState,
    viewerDecision: queueRow.viewerDecision,
  };
}

function compareLenderMilestoneQueueRows(
  left: Awaited<ReturnType<typeof lenderMilestoneQueueRow>>,
  right: Awaited<ReturnType<typeof lenderMilestoneQueueRow>>
) {
  return (
    right.submittedAt - left.submittedAt ||
    String(right.reviewCycleId).localeCompare(String(left.reviewCycleId))
  );
}

function paginateLenderMilestoneQueueRows(input: {
  authorizedRows: Awaited<ReturnType<typeof lenderMilestoneQueueRow>>[];
  paginationOpts: PaginationOptions;
  rows: Awaited<ReturnType<typeof lenderMilestoneQueueRow>>[];
  scope: LenderQueueScope;
}) {
  const cursor = parseValidatedLenderQueueCursor({
    cursor: input.paginationOpts.cursor,
    getAnchorId: (row) => String(row.reviewCycleId),
    getAnchorValue: (row) => row.submittedAt,
    label: "Milestone",
    rows: input.authorizedRows,
    scope: input.scope,
  });
  const endCursor = parseValidatedLenderQueueCursor({
    cursor: input.paginationOpts.endCursor ?? null,
    getAnchorId: (row) => String(row.reviewCycleId),
    getAnchorValue: (row) => row.submittedAt,
    label: "Milestone",
    rows: input.authorizedRows,
    scope: input.scope,
  });
  const afterStart = cursor
    ? input.rows.filter((row) =>
        lenderMilestoneQueueRowIsAfterCursor(row, cursor)
      )
    : input.rows;
  const candidates = endCursor
    ? afterStart.filter(
        (row) => !lenderMilestoneQueueRowIsAfterCursor(row, endCursor)
      )
    : afterStart;
  const page = endCursor
    ? candidates
    : candidates.slice(0, input.paginationOpts.numItems);
  if (endCursor) {
    return {
      continueCursor: input.paginationOpts.endCursor ?? "",
      isDone: true,
      page,
    };
  }
  const isDone = candidates.length <= input.paginationOpts.numItems;
  const last = page.at(-1);
  return {
    continueCursor:
      isDone || !last
        ? ""
        : encodeLenderQueueCursor({
            position: {
              anchorId: String(last.reviewCycleId),
              anchorValue: last.submittedAt,
            },
            scope: input.scope,
          }),
    isDone,
    page,
  };
}

function lenderMilestoneQueueRowIsAfterCursor(
  row: Awaited<ReturnType<typeof lenderMilestoneQueueRow>>,
  cursor: { anchorId: string; anchorValue: number }
) {
  return (
    row.submittedAt < cursor.anchorValue ||
    (row.submittedAt === cursor.anchorValue &&
      String(row.reviewCycleId).localeCompare(cursor.anchorId) < 0)
  );
}
