import { ConvexError } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import {
  type ActiveLenderOrganizationContext,
  type AuthorizedViewer,
  requireActiveWorkosUser,
  requireLenderOrganizationPermission,
} from "../authz";
import { getLenderOrganizationApprovalEligibility } from "../lenderOrganizationAccess";
import type {
  LenderPortalReviewGroup,
  LenderPortalReviewRequestState,
  LenderPortalReviewRequirements,
  LenderPortalReviewTarget,
} from "../lender_portal_phase5_contracts";
import type { MutationCtx, QueryCtx } from "../types";

export const MAX_CYCLE_DECISIONS = 1001;
export const EVIDENCE_REFERENCE_LIMIT = 500;
export const COST_DOCUMENT_LIMIT = 100;
export const LENDER_MILESTONE_QUEUE_CYCLE_LIMIT = 500;
export const LENDER_MILESTONE_QUEUE_MAX_PAGE_SIZE = 50;

export type ReviewCtx = QueryCtx | MutationCtx;
export type ViewerReviewCtx = ReviewCtx & { viewer: AuthorizedViewer };
export type LenderReviewCtx = ViewerReviewCtx & {
  activeOrganization: ActiveLenderOrganizationContext;
};
export type ReviewActorRole = "admin" | "builder" | "lender" | "lender-admin";
export type EligibleLenderApprover = {
  assignmentId: Id<"lenderOrganizationAssignments">;
  eligibilityEpoch: string;
};
export type EligibleLenderApprovers = Map<string, EligibleLenderApprover>;

export async function currentLenderApproverMaps(ctx: LenderReviewCtx) {
  const eligibility = await getLenderOrganizationApprovalEligibility(
    ctx,
    ctx.activeOrganization.lenderOrganizationId
  );
  const toMap = (
    members: typeof eligibility.members.milestone
  ): EligibleLenderApprovers =>
    new Map(
      members.map((member) => [
        member.workosUserId,
        {
          assignmentId: member.assignmentId,
          eligibilityEpoch: member.eligibilityEpoch,
        },
      ])
    );
  return {
    draw: toMap(eligibility.members.draw),
    milestone: toMap(eligibility.members.milestone),
  };
}
export type ResolvedReviewTarget =
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


export async function resolveReviewTarget(
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

export async function requireBuild(ctx: ReviewCtx, buildId: Id<"activeBuilds">) {
  const build = await ctx.db.get(buildId);
  if (!build) {
    throw safeUnavailableError();
  }
  return build;
}

export async function requireActiveOrganizationMembership(
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

export async function requireBuilderTargetAccess(
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

export async function requireBackofficeTargetAccess(
  ctx: ViewerReviewCtx,
  target: ResolvedReviewTarget,
  organizationId: string
) {
  await requireBackofficeBuildAccess(ctx, target.build, organizationId);
}

export async function requireBackofficeBuildAccess(
  ctx: ViewerReviewCtx,
  build: Doc<"activeBuilds">,
  organizationId: string
) {
  if (organizationId !== build.organizationId) {
    throw safeUnavailableError();
  }
  await requireActiveOrganizationMembership(ctx, organizationId);
}

export async function requireLenderTargetAccess(
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

export async function requireLenderBuildAccess(
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

export async function eligibleLenderApproverIds(
  ctx: ReviewCtx,
  target: ResolvedReviewTarget
) {
  return await eligibleLenderApproverIdsForBuild(
    ctx,
    target.build,
    target.kind
  );
}

export async function eligibleLenderApproverIdsForBuild(
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


export function lenderAssignmentForDecision(
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

export function decisionState(input: {
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

export function approvalProgress(input: {
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

export function lenderDecisionIsCurrentlyEligible(
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

export function terminalContributorIds(input: {
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

export function projectedDecisionState(input: {
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

export async function projectedCycleState(
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

export function reviewRequirements(
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

export async function lockedReviewRequirements(
  ctx: ReviewCtx,
  target: ResolvedReviewTarget
) {
  const lockId = target.build.reviewPolicyLockId;
  const policy = target.build.reviewPolicySnapshot;
  const lock = lockId ? await ctx.db.get(lockId) : null;
  if (
    !(lock && policy) ||
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


export function validateLenderMilestoneQueuePageSize(numItems: number) {
  if (
    !Number.isSafeInteger(numItems) ||
    numItems < 1 ||
    numItems > LENDER_MILESTONE_QUEUE_MAX_PAGE_SIZE
  ) {
    throw new ConvexError({
      code: "INVALID_PAGE_SIZE",
      message: `Milestone queue pages must contain between 1 and ${LENDER_MILESTONE_QUEUE_MAX_PAGE_SIZE} rows.`,
      recoverable: true,
    });
  }
}

export function addDaysToIsoDate(startDate: string, days: number) {
  const start = new Date(`${startDate}T00:00:00.000Z`);
  if (Number.isNaN(start.getTime()) || !Number.isSafeInteger(days)) {
    throw safeUnavailableError();
  }
  start.setUTCDate(start.getUTCDate() + days);
  return start.toISOString().slice(0, 10);
}

export function timestampToIsoDate(timestamp: number) {
  if (!Number.isFinite(timestamp)) {
    throw safeUnavailableError();
  }
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) {
    throw safeUnavailableError();
  }
  return date.toISOString().slice(0, 10);
}

export function reviewActionState(input: {
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
  if (!input.viewerEligible) {
    return "ineligible" as const;
  }
  if (input.actorDecided) {
    return "acted" as const;
  }
  return "needs_action" as const;
}

export async function cycleTargetAvailability(
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
      milestone.organizationId === build.organizationId &&
      milestone.currentLenderPortalReviewCycleId === cycle._id &&
      milestone.currentLenderPortalReviewCycleNumber === cycle.cycleNumber
      ? ("available" as const)
      : ("unavailable" as const);
  }
  if (cycle.kind === "draw" && cycle.drawRequestId) {
    const draw = await ctx.db.get(cycle.drawRequestId);
    return draw &&
      draw.buildId === build._id &&
      draw.brokerageId === build.brokerageId &&
      draw.organizationId === build.organizationId &&
      draw.currentLenderPortalReviewCycleId === cycle._id &&
      draw.currentLenderPortalReviewCycleNumber === cycle.cycleNumber
      ? ("available" as const)
      : ("unavailable" as const);
  }
  return "unavailable" as const;
}

export async function writeReviewAudit(
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

export function submitResult(
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

export function decisionResult(
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

export function normalizeIdempotencyKey(value: string) {
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

export function normalizeOptionalText(value: string | undefined, max: number) {
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

export function recordValue(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export function numberValue(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function stringValue(value: unknown) {
  return typeof value === "string" ? value : null;
}

export function requireMoneyInteger(value: number | null) {
  if (value === null || !Number.isSafeInteger(value) || value < 0) {
    throw new ConvexError({
      code: "INVALID_MONEY_AMOUNT",
      message: "Money must use non-negative safe integer Build-currency units.",
      recoverable: true,
    });
  }
  return value;
}

export function safeMoneyAdd(left: number, right: number) {
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

export function costDocumentUnavailableError() {
  return new ConvexError({
    code: "COST_DOCUMENT_UNAVAILABLE",
    message: "Receipt or invoice is unavailable for this Milestone review.",
    recoverable: true,
  });
}

export function evidenceReferenceLimitError() {
  return new ConvexError({
    code: "EVIDENCE_REFERENCE_LIMIT_EXCEEDED",
    message: "The milestone evidence reference limit was exceeded.",
    recoverable: true,
  });
}

export function safeUnavailableError() {
  return new ConvexError({
    code: "REVIEW_REQUEST_UNAVAILABLE",
    message: "Review request unavailable.",
    recoverable: false,
  });
}

export function invalidEvidencePackageReference(submilestoneKey?: string) {
  return new ConvexError({
    code: "INVALID_EVIDENCE_PACKAGE_REFERENCE",
    message: "Evidence Package reference is invalid for this review request.",
    recoverable: true,
    ...(submilestoneKey ? { submilestoneKey } : {}),
  });
}

export function staleCycleError() {
  return new ConvexError({
    code: "STALE_REVIEW_CYCLE",
    message: "Review cycle changed. Refresh before retrying.",
    recoverable: true,
  });
}

export function idempotencyConflictError() {
  return new ConvexError({
    code: "IDEMPOTENCY_KEY_REUSED",
    message: "This idempotency key belongs to a different review command.",
    recoverable: true,
  });
}
