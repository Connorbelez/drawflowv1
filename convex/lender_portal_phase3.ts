import { paginationResultValidator } from "convex/server";
import { type Infer, v } from "convex/values";

export const proposalReviewApprovalModeValidator = v.union(
  v.literal("backoffice_only"),
  v.literal("lender_quorum"),
  v.literal("both")
);

export const proposalReviewPolicySnapshotValidator = v.object({
  drawApprovalMode: proposalReviewApprovalModeValidator,
  drawLenderQuorum: v.union(v.number(), v.null()),
  milestoneApprovalMode: proposalReviewApprovalModeValidator,
  milestoneLenderQuorum: v.union(v.number(), v.null()),
  milestoneReceiptInvoiceRequired: v.boolean(),
  milestoneSiteVisitRequired: v.boolean(),
});

export const proposalRevisionCheckpointNameValidator = v.union(
  v.literal("milestoneCount"),
  v.literal("budget"),
  v.literal("scheduleTimeline"),
  v.literal("builder"),
  v.literal("accessReviewPolicy")
);

export const proposalRevisionCheckpointSnapshotValidator = v.object({
  accessReviewPolicy: proposalReviewPolicySnapshotValidator,
  budget: v.object({
    totalBudgetCents: v.number(),
  }),
  builder: v.object({
    builderProfileId: v.id("builderProfiles"),
    displayName: v.string(),
  }),
  milestoneCount: v.object({
    count: v.number(),
  }),
  scheduleTimeline: v.object({
    milestonesFingerprint: v.string(),
    proposedStartDate: v.union(v.string(), v.null()),
    timelineRangeMax: v.union(v.number(), v.null()),
    timelineRangeMin: v.union(v.number(), v.null()),
  }),
});

export const proposalRevisionMilestoneValidator = v.object({
  dayEnd: v.number(),
  dayStart: v.number(),
  dependencyKeys: v.array(v.string()),
  durationDays: v.number(),
  key: v.string(),
  order: v.number(),
});

export const lenderProposalSnapshotDocumentValidator = v.object({
  createdAt: v.number(),
  documentId: v.id("proposalDocuments"),
  documentType: v.union(
    v.literal("permit"),
    v.literal("budget"),
    v.literal("plan"),
    v.literal("supporting")
  ),
  fileName: v.string(),
  mimeType: v.string(),
  sizeBytes: v.number(),
  status: v.union(
    v.literal("uploaded"),
    v.literal("linked"),
    v.literal("waived")
  ),
  storageId: v.optional(v.id("_storage")),
  storageUrl: v.optional(v.string()),
  updatedAt: v.number(),
});

export const lenderProposalSnapshotRevisionValidator = v.object({
  assignmentId: v.id("proposalLenderAssignments"),
  changedCheckpoints: v.array(proposalRevisionCheckpointNameValidator),
  checkpoints: proposalRevisionCheckpointSnapshotValidator,
  createdAt: v.number(),
  priorLenderReviewedRevisionId: v.optional(v.id("proposalRevisions")),
  revisionId: v.id("proposalRevisions"),
  revisionNumber: v.number(),
  reviewPolicyVersionId: v.id("proposalReviewPolicyVersions"),
});

export const lenderProposalSnapshotDecisionValidator = v.object({
  approvalId: v.id("proposalLenderApprovals"),
  approvedAt: v.optional(v.number()),
  declinedAt: v.optional(v.number()),
  proposalRevisionId: v.optional(v.id("proposalRevisions")),
  proposalRevisionNumber: v.optional(v.number()),
  migrationStatus: v.optional(v.literal("legacy_unlinked")),
  status: v.union(v.literal("approved"), v.literal("declined")),
});

export const lenderProposalSnapshotHistoryValidator = v.object({
  kind: v.union(
    v.literal("assignment_created"),
    v.literal("revision_published"),
    v.literal("decision_recorded"),
    v.literal("assignment_withdrawn")
  ),
  occurredAt: v.number(),
  proposalRevisionNumber: v.optional(v.number()),
  status: v.optional(v.union(v.literal("approved"), v.literal("declined"))),
});

export const proposalLifecycleProjectionValidator = v.object({
  activation: v.union(v.literal("active"), v.literal("inactive")),
  backOfficeApproval: v.union(
    v.literal("approved"),
    v.literal("changes_requested"),
    v.literal("not_submitted"),
    v.literal("pending"),
    v.literal("rejected")
  ),
  capitalSource: v.union(v.literal("internal"), v.literal("external")),
  closing: v.union(
    v.literal("closed"),
    v.literal("not_ready"),
    v.literal("pending_closing")
  ),
  externalAssignment: v.union(
    v.literal("assigned"),
    v.literal("not_required"),
    v.literal("unassigned"),
    v.literal("withdrawn")
  ),
  lenderConfirmation: v.union(
    v.literal("approved"),
    v.literal("declined"),
    v.literal("not_required"),
    v.literal("pending")
  ),
  proposalState: v.union(
    v.literal("approved"),
    v.literal("closed"),
    v.literal("draft"),
    v.literal("submitted")
  ),
});

export const historicalLenderProposalDetailValidator = v.object({
  assignmentId: v.id("proposalLenderAssignments"),
  capturedAt: v.number(),
  decisions: paginationResultValidator(lenderProposalSnapshotDecisionValidator),
  documents: paginationResultValidator(lenderProposalSnapshotDocumentValidator),
  lifecycle: proposalLifecycleProjectionValidator,
  proposal: v.object({
    buildName: v.string(),
    location: v.string(),
    status: v.union(
      v.literal("draft"),
      v.literal("submitted"),
      v.literal("approved"),
      v.literal("closed")
    ),
  }),
  readOnly: v.literal(true),
  revisions: paginationResultValidator(lenderProposalSnapshotRevisionValidator),
});

export const lenderProposalAssignmentSnapshotValidator = v.object({
  assignmentId: v.id("proposalLenderAssignments"),
  capturedAt: v.number(),
  lifecycle: proposalLifecycleProjectionValidator,
  proposal: v.object({
    buildName: v.string(),
    location: v.string(),
    status: v.union(
      v.literal("draft"),
      v.literal("submitted"),
      v.literal("approved"),
      v.literal("closed")
    ),
  }),
});

export const proposalPhase3ReviewControlValidator = v.object({
  currentAssignmentId: v.union(v.id("proposalLenderAssignments"), v.null()),
  currentEligibleLenderApproverCounts: v.optional(
    v.object({
      draw: v.number(),
      milestone: v.number(),
      proposalReview: v.number(),
    })
  ),
  currentLenderEligibilityIssue: v.optional(v.string()),
  currentPolicyVersionId: v.union(
    v.id("proposalReviewPolicyVersions"),
    v.null()
  ),
  currentRevisionId: v.union(v.id("proposalRevisions"), v.null()),
  currentRevisionNumber: v.union(v.number(), v.null()),
  latestLenderReviewedRevisionId: v.union(v.id("proposalRevisions"), v.null()),
  latestLenderReviewedRevisionNumber: v.union(v.number(), v.null()),
  lock: v.union(
    v.null(),
    v.object({
      activeLenderMemberCount: v.optional(v.number()),
      assignmentId: v.optional(
        v.union(v.id("proposalLenderAssignments"), v.null())
      ),
      eligibleLenderApproverCount: v.optional(v.number()),
      eligibleLenderApproverCounts: v.optional(
        v.object({
          draw: v.number(),
          milestone: v.number(),
          proposalReview: v.number(),
        })
      ),
      lenderOrganizationId: v.optional(
        v.union(v.id("lenderOrganizations"), v.null())
      ),
      lockId: v.id("proposalReviewPolicyLocks"),
      lockedAt: v.number(),
      lockedByRole: v.optional(v.string()),
      lockedByWorkosUserId: v.optional(v.string()),
      policy: proposalReviewPolicySnapshotValidator,
      policyVersionId: v.id("proposalReviewPolicyVersions"),
      proposalRevisionId: v.id("proposalRevisions"),
      proposalRevisionNumber: v.number(),
      reason: v.optional(v.string()),
    })
  ),
  lockedReviewPolicyId: v.union(v.id("proposalReviewPolicyLocks"), v.null()),
  policyVersions: v.array(
    v.object({
      configuredAt: v.optional(v.number()),
      configuredByRole: v.optional(v.string()),
      configuredByWorkosUserId: v.optional(v.string()),
      policy: proposalReviewPolicySnapshotValidator,
      policyVersionId: v.id("proposalReviewPolicyVersions"),
      provenance: v.optional(
        v.union(
          v.literal("build_override"),
          v.literal("organization_default"),
          v.literal("system_baseline")
        )
      ),
      reason: v.optional(v.string()),
      sourceLenderOrganizationId: v.optional(v.id("lenderOrganizations")),
      sourceLenderOrganizationName: v.optional(v.string()),
      sourceOrganizationReviewPolicyVersion: v.optional(v.number()),
      sourceOrganizationReviewPolicyVersionId: v.optional(
        v.id("lenderOrganizationReviewPolicyVersions")
      ),
      version: v.number(),
    })
  ),
  revisions: v.array(
    v.object({
      assignmentId: v.union(v.id("proposalLenderAssignments"), v.null()),
      backOfficeApprovedByWorkosUserId: v.optional(v.string()),
      changedCheckpoints: v.array(proposalRevisionCheckpointNameValidator),
      checkpoints: proposalRevisionCheckpointSnapshotValidator,
      createdAt: v.number(),
      createdByRole: v.optional(v.string()),
      createdByWorkosUserId: v.optional(v.string()),
      priorLenderReviewedRevisionId: v.union(
        v.id("proposalRevisions"),
        v.null()
      ),
      proposalRevisionId: v.id("proposalRevisions"),
      reason: v.optional(v.string()),
      revisionNumber: v.number(),
      reviewPolicyVersionId: v.id("proposalReviewPolicyVersions"),
    })
  ),
});

export const lenderProposalLifecycleProjectionValidator = v.object({
  assignment: v.object({
    assignmentId: v.id("proposalLenderAssignments"),
    readOnly: v.boolean(),
    status: v.union(v.literal("current"), v.literal("withdrawn")),
  }),
  canApproveClosing: v.boolean(),
  lifecycleActions: v.object({
    canActivateClosedProposal: v.boolean(),
    canRecordClosing: v.boolean(),
  }),
  lifecycle: proposalLifecycleProjectionValidator,
  proposal: v.object({
    buildName: v.string(),
    location: v.string(),
    status: v.union(
      v.literal("draft"),
      v.literal("submitted"),
      v.literal("approved"),
      v.literal("closed")
    ),
  }),
  snapshot: lenderProposalAssignmentSnapshotValidator,
});

export type ProposalReviewApprovalMode = Infer<
  typeof proposalReviewApprovalModeValidator
>;
export type ProposalReviewPolicySnapshot = Infer<
  typeof proposalReviewPolicySnapshotValidator
>;
export type ProposalRevisionCheckpointName = Infer<
  typeof proposalRevisionCheckpointNameValidator
>;
export type ProposalRevisionCheckpointSnapshot = Infer<
  typeof proposalRevisionCheckpointSnapshotValidator
>;

export const PROPOSAL_REVISION_CHECKPOINTS = [
  "milestoneCount",
  "budget",
  "scheduleTimeline",
  "builder",
  "accessReviewPolicy",
] as const satisfies readonly ProposalRevisionCheckpointName[];

export const DEFAULT_PROPOSAL_REVIEW_POLICY: ProposalReviewPolicySnapshot = {
  drawApprovalMode: "backoffice_only",
  drawLenderQuorum: null,
  milestoneApprovalMode: "backoffice_only",
  milestoneLenderQuorum: null,
  milestoneReceiptInvoiceRequired: false,
  milestoneSiteVisitRequired: false,
};

export function approvalModeRequiresLender(mode: ProposalReviewApprovalMode) {
  return mode === "lender_quorum" || mode === "both";
}

export function normalizeProposalReviewPolicy(input: {
  drawApprovalMode: ProposalReviewApprovalMode;
  drawLenderQuorum?: number;
  milestoneApprovalMode: ProposalReviewApprovalMode;
  milestoneLenderQuorum?: number;
  milestoneReceiptInvoiceRequired: boolean;
  milestoneSiteVisitRequired: boolean;
}): ProposalReviewPolicySnapshot {
  const normalizeQuorum = (
    mode: ProposalReviewApprovalMode,
    quorum: number | undefined,
    label: string
  ) => {
    if (!approvalModeRequiresLender(mode)) {
      if (quorum !== undefined) {
        throw new Error(
          `${label} quorum is not allowed for Back Office-only approval.`
        );
      }
      return null;
    }
    if (!Number.isInteger(quorum) || (quorum ?? 0) < 1) {
      throw new Error(`${label} quorum must be a positive integer.`);
    }
    return quorum as number;
  };

  return {
    drawApprovalMode: input.drawApprovalMode,
    drawLenderQuorum: normalizeQuorum(
      input.drawApprovalMode,
      input.drawLenderQuorum,
      "Draw lender"
    ),
    milestoneApprovalMode: input.milestoneApprovalMode,
    milestoneLenderQuorum: normalizeQuorum(
      input.milestoneApprovalMode,
      input.milestoneLenderQuorum,
      "Milestone lender"
    ),
    milestoneReceiptInvoiceRequired: input.milestoneReceiptInvoiceRequired,
    milestoneSiteVisitRequired: input.milestoneSiteVisitRequired,
  };
}

export function proposalReviewPoliciesEqual(
  left: ProposalReviewPolicySnapshot,
  right: ProposalReviewPolicySnapshot
) {
  return canonicalDeepEqual(left, right);
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(canonicalize);
  }
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nested]) => [key, canonicalize(nested)])
    );
  }
  return value;
}

export function canonicalDeepEqual(left: unknown, right: unknown) {
  return (
    JSON.stringify(canonicalize(left)) === JSON.stringify(canonicalize(right))
  );
}

export function deterministicProposalRevisionDiff(
  prior: ProposalRevisionCheckpointSnapshot | null,
  current: ProposalRevisionCheckpointSnapshot
): ProposalRevisionCheckpointName[] {
  if (!prior) {
    return [];
  }
  return PROPOSAL_REVISION_CHECKPOINTS.filter(
    (checkpoint) => !canonicalDeepEqual(prior[checkpoint], current[checkpoint])
  );
}

export function validateProposalReviewPolicyQuorums(
  policy: ProposalReviewPolicySnapshot,
  eligibleCounts: { draw: number; milestone: number }
) {
  const validate = (
    mode: ProposalReviewApprovalMode,
    quorum: number | null,
    label: string,
    eligibleCount: number
  ) => {
    if (!Number.isInteger(eligibleCount) || eligibleCount < 0) {
      throw new Error(
        `${label} eligible member count must be a non-negative integer.`
      );
    }
    if (!approvalModeRequiresLender(mode)) {
      if (quorum !== null) {
        throw new Error(
          `${label} quorum must be empty for Back Office-only approval.`
        );
      }
      return;
    }
    if (eligibleCount === 0) {
      throw new Error(
        `${label} quorum cannot be configured because the assigned organization has no active approval-eligible lender member.`
      );
    }
    if (
      !Number.isInteger(quorum) ||
      quorum === null ||
      quorum < 1 ||
      quorum > eligibleCount
    ) {
      throw new Error(
        `${label} quorum must be an integer from 1 through ${eligibleCount}.`
      );
    }
  };
  validate(
    policy.drawApprovalMode,
    policy.drawLenderQuorum,
    "Draw lender",
    eligibleCounts.draw
  );
  validate(
    policy.milestoneApprovalMode,
    policy.milestoneLenderQuorum,
    "Milestone lender",
    eligibleCounts.milestone
  );
}
