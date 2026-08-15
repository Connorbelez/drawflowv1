import { paginationResultValidator } from "convex/server";
import { type Infer, v } from "convex/values";

import { proposalReviewApprovalModeValidator } from "./lender_portal_phase3";

export const lenderPortalReviewRequestKindValidator = v.union(
  v.literal("milestone"),
  v.literal("draw")
);

export const lenderPortalReviewRequestStateValidator = v.union(
  v.literal("in_review"),
  v.literal("partial_approval"),
  v.literal("correction_required"),
  v.literal("completed")
);

export const lenderPortalReviewGroupValidator = v.union(
  v.literal("backoffice"),
  v.literal("lender")
);

export const lenderPortalReviewDecisionValidator = v.union(
  v.literal("approved"),
  v.literal("rejected")
);

export const lenderPortalReviewerRoleValidator = v.union(
  v.literal("admin"),
  v.literal("lender"),
  v.literal("lender-admin")
);

export const lenderPortalReviewTargetValidator = v.union(
  v.object({
    kind: v.literal("milestone"),
    milestoneId: v.id("buildMilestones"),
  }),
  v.object({
    drawRequestId: v.id("activeBuildDrawRequests"),
    kind: v.literal("draw"),
  })
);

export const lenderPortalReviewRequirementsValidator = v.object({
  approvalMode: proposalReviewApprovalModeValidator,
  lenderQuorum: v.union(v.number(), v.null()),
  receiptInvoiceRequired: v.boolean(),
  requiredGroups: v.array(lenderPortalReviewGroupValidator),
  siteVisitRequired: v.boolean(),
});

export const lenderPortalReviewEvidenceReferenceValidator = v.object({
  evidenceAssetId: v.optional(v.id("buildEvidenceAssets")),
  evidencePackageRevisionId: v.optional(
    v.id("buildSubmilestoneEvidencePackageRevisions")
  ),
  kind: v.union(v.literal("asset"), v.literal("package_revision")),
  label: v.string(),
  locationVerified: v.optional(v.boolean()),
  milestoneKey: v.optional(v.string()),
  submilestoneKey: v.optional(v.string()),
});

export const lenderPortalMilestoneSubmissionSnapshotValidator = v.object({
  actualCostCents: v.union(v.number(), v.null()),
  completedDay: v.union(v.number(), v.null()),
  kind: v.literal("milestone"),
  milestoneId: v.id("buildMilestones"),
  milestoneKey: v.string(),
  milestoneName: v.string(),
  note: v.union(v.string(), v.null()),
  progressPercent: v.union(v.number(), v.null()),
  submittedAt: v.union(v.string(), v.null()),
});

export const lenderPortalDrawSubmissionSnapshotValidator = v.object({
  allocations: v.array(
    v.object({
      amountCents: v.number(),
      drawGroupKey: v.string(),
      milestoneId: v.id("buildMilestones"),
      milestoneKey: v.string(),
      sourceOrder: v.number(),
    })
  ),
  amountCents: v.number(),
  displayId: v.string(),
  drawRequestId: v.id("activeBuildDrawRequests"),
  kind: v.literal("draw"),
  label: v.string(),
  note: v.union(v.string(), v.null()),
  requestedAt: v.string(),
  requestKey: v.string(),
});

export const lenderPortalReviewSubmissionSnapshotValidator = v.union(
  lenderPortalMilestoneSubmissionSnapshotValidator,
  lenderPortalDrawSubmissionSnapshotValidator
);

export const lenderPortalReviewDecisionProjectionValidator = v.object({
  actorRole: lenderPortalReviewerRoleValidator,
  actorWorkosUserId: v.string(),
  createdAt: v.number(),
  decision: lenderPortalReviewDecisionValidator,
  decisionId: v.id("lenderPortalReviewDecisions"),
  group: lenderPortalReviewGroupValidator,
  privateRationale: v.union(v.string(), v.null()),
  revisionInstructions: v.union(v.string(), v.null()),
});

export const lenderPortalBuilderCycleProjectionValidator = v.object({
  cycleNumber: v.number(),
  evidenceReferences: v.array(lenderPortalReviewEvidenceReferenceValidator),
  requirements: lenderPortalReviewRequirementsValidator,
  state: lenderPortalReviewRequestStateValidator,
  submission: lenderPortalReviewSubmissionSnapshotValidator,
  submittedAt: v.number(),
});

export const lenderPortalReviewerCycleProjectionValidator =
  lenderPortalBuilderCycleProjectionValidator.extend({
    cycleId: v.id("lenderPortalReviewCycles"),
    decisions: v.array(lenderPortalReviewDecisionProjectionValidator),
    submittedByWorkosUserId: v.string(),
  });

export const lenderPortalBuilderRequestProjectionValidator = v.object({
  buildId: v.id("activeBuilds"),
  canResubmit: v.boolean(),
  currentCycle: lenderPortalBuilderCycleProjectionValidator,
  currentCycleNumber: v.number(),
  eligibility: v.object({
    canSubmit: v.boolean(),
    reason: v.union(
      v.literal("eligible_for_resubmission"),
      v.literal("awaiting_review"),
      v.literal("review_completed")
    ),
  }),
  history: paginationResultValidator(lenderPortalBuilderCycleProjectionValidator),
  kind: lenderPortalReviewRequestKindValidator,
  notice: v.object({ body: v.string(), title: v.string() }),
  requestIdentity: v.string(),
  revisionInstructions: v.union(v.string(), v.null()),
  state: lenderPortalReviewRequestStateValidator,
});

export const lenderPortalReviewerRequestProjectionValidator = v.object({
  buildId: v.id("activeBuilds"),
  buildName: v.string(),
  currentCycle: lenderPortalReviewerCycleProjectionValidator,
  currentCycleNumber: v.number(),
  cycles: paginationResultValidator(lenderPortalReviewerCycleProjectionValidator),
  kind: lenderPortalReviewRequestKindValidator,
  label: v.string(),
  requestIdentity: v.string(),
  state: lenderPortalReviewRequestStateValidator,
});

export const lenderPortalReviewerQueueRowValidator = v.object({
  actionRequired: v.boolean(),
  approvedGroups: v.array(lenderPortalReviewGroupValidator),
  buildId: v.id("activeBuilds"),
  buildName: v.string(),
  currentCycleNumber: v.number(),
  kind: lenderPortalReviewRequestKindValidator,
  label: v.string(),
  lenderApprovalCount: v.number(),
  lenderQuorum: v.union(v.number(), v.null()),
  currentEligibleLenderCount: v.union(v.number(), v.null()),
  requestIdentity: v.string(),
  requiredGroups: v.array(lenderPortalReviewGroupValidator),
  state: lenderPortalReviewRequestStateValidator,
  viewerActionState: v.union(
    v.literal("needs_action"),
    v.literal("acted"),
    v.literal("not_required"),
    v.literal("ineligible"),
    v.literal("closed"),
    v.literal("unavailable")
  ),
  viewerDecision: v.union(lenderPortalReviewDecisionValidator, v.null()),
  targetAvailability: v.union(
    v.literal("available"),
    v.literal("unavailable")
  ),
});

export const lenderPortalReviewerQueuePageValidator = paginationResultValidator(
  lenderPortalReviewerQueueRowValidator
);

export const lenderPortalSubmitReviewResultValidator = v.object({
  cycleId: v.id("lenderPortalReviewCycles"),
  cycleNumber: v.number(),
  replayed: v.boolean(),
  requestIdentity: v.string(),
  state: lenderPortalReviewRequestStateValidator,
});

export const lenderPortalDecisionResultValidator = v.object({
  cycleNumber: v.number(),
  decisionId: v.id("lenderPortalReviewDecisions"),
  replayed: v.boolean(),
  requestIdentity: v.string(),
  state: lenderPortalReviewRequestStateValidator,
});

export type LenderPortalReviewTarget = Infer<
  typeof lenderPortalReviewTargetValidator
>;
export type LenderPortalReviewEvidenceReference = Infer<
  typeof lenderPortalReviewEvidenceReferenceValidator
>;
export type LenderPortalReviewGroup = Infer<
  typeof lenderPortalReviewGroupValidator
>;
export type LenderPortalReviewRequestState = Infer<
  typeof lenderPortalReviewRequestStateValidator
>;
export type LenderPortalReviewRequirements = Infer<
  typeof lenderPortalReviewRequirementsValidator
>;
