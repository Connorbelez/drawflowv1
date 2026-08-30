import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import {
  adminMutation,
  authenticatedMutation,
  lenderOrganizationMutation,
} from "../authz";
import {
  enqueueReviewApprovalOutcomeNotifications,
  enqueueReviewApprovalRequiredNotifications,
} from "../lender_portal_notifications";
import {
  lenderPortalDecisionResultValidator,
  lenderPortalReviewTargetValidator,
  lenderPortalSubmitReviewResultValidator,
} from "../lender_portal_phase5_contracts";
import type {
  LenderPortalReviewGroup,
  LenderPortalReviewRequestState,
  LenderPortalReviewTarget,
} from "../lender_portal_phase5_contracts";
import type { MutationCtx } from "../types";
import {
  requireCurrentCycle,
  snapshotSubmission,
} from "./evidence";
import {
  approvalProgress,
  decisionResult,
  decisionState,
  eligibleLenderApproverIds,
  idempotencyConflictError,
  lenderAssignmentForDecision,
  lockedReviewRequirements,
  MAX_CYCLE_DECISIONS,
  normalizeIdempotencyKey,
  normalizeOptionalText,
  requireBackofficeTargetAccess,
  requireBuilderTargetAccess,
  requireLenderTargetAccess,
  resolveReviewTarget,
  safeUnavailableError,
  staleCycleError,
  submitResult,
  terminalContributorIds,
  writeReviewAudit,
} from "./shared";
import type { ResolvedReviewTarget, ReviewActorRole } from "./shared";

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
    JSON.stringify(cycle.requirements) !==
      JSON.stringify(currentRequirements) ||
    (target.kind === "milestone"
      ? cycle.milestoneId !== target.record._id ||
        cycle.drawRequestId !== undefined
      : cycle.drawRequestId !== target.record._id ||
        cycle.milestoneId !== undefined)
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


export async function submitReviewCycle(
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

export async function recordReviewDecision(
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
          : !updatedCycle.approvedGroups.includes(group)
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
