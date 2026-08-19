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

export const lenderPortalReviewEvidenceReferenceValidator = v.union(
  v.object({
    association: v.union(
      v.object({
        evidencePackageItemId: v.id("buildSubmilestoneEvidencePackageItems"),
        evidencePackageRevisionId: v.id(
          "buildSubmilestoneEvidencePackageRevisions"
        ),
        kind: v.literal("package_revision"),
      }),
      v.object({
        kind: v.literal("site_visit"),
        siteVisitId: v.id("buildSiteVisits"),
      })
    ),
    evidenceAssetId: v.id("buildEvidenceAssets"),
    kind: v.literal("asset"),
    label: v.string(),
    locationFailureReason: v.optional(v.string()),
    locationVerified: v.boolean(),
    milestoneKey: v.string(),
    submilestoneKey: v.optional(v.string()),
  }),
  v.object({
    evidencePackageRevisionId: v.id(
      "buildSubmilestoneEvidencePackageRevisions"
    ),
    kind: v.literal("package_revision"),
    label: v.string(),
    milestoneKey: v.string(),
    submilestoneKey: v.string(),
  }),
  v.object({
    amountCents: v.number(),
    costDocumentId: v.id("costDocuments"),
    currency: v.literal("CAD"),
    documentKind: v.union(v.literal("invoice"), v.literal("receipt")),
    kind: v.literal("cost_document"),
    label: v.string(),
    milestoneKey: v.string(),
  }),
  v.object({
    assetId: v.id("buildCollaborationAssets"),
    costDocumentId: v.id("costDocuments"),
    costDocumentPageId: v.id("costDocumentPages"),
    kind: v.literal("cost_document_page"),
    label: v.string(),
    milestoneKey: v.string(),
    order: v.number(),
  }),
  v.object({
    completedAt: v.string(),
    kind: v.literal("site_visit"),
    label: v.string(),
    milestoneKey: v.string(),
    report: v.string(),
    siteVisitId: v.id("buildSiteVisits"),
  })
);

export const lenderPortalReviewEvidenceFileValidator = v.object({
  downloadUrl: v.union(v.string(), v.null()),
  fileName: v.string(),
  mimeType: v.string(),
  reference: v.union(
    v.object({
      evidenceAssetId: v.id("buildEvidenceAssets"),
      kind: v.literal("asset"),
    }),
    v.object({
      assetId: v.id("buildCollaborationAssets"),
      costDocumentId: v.id("costDocuments"),
      costDocumentPageId: v.id("costDocumentPages"),
      kind: v.literal("cost_document_page"),
    })
  ),
  sizeBytes: v.number(),
});

export const lenderPortalReviewEvidenceProjectionValidator = v.object({
  cycleId: v.id("lenderPortalReviewCycles"),
  cycleNumber: v.number(),
  evidenceReferences: v.array(lenderPortalReviewEvidenceReferenceValidator),
  files: v.array(lenderPortalReviewEvidenceFileValidator),
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
  countsTowardCurrentApproval: v.boolean(),
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
  history: paginationResultValidator(
    lenderPortalBuilderCycleProjectionValidator
  ),
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
  cycles: paginationResultValidator(
    lenderPortalReviewerCycleProjectionValidator
  ),
  kind: lenderPortalReviewRequestKindValidator,
  label: v.string(),
  requestIdentity: v.string(),
  state: lenderPortalReviewRequestStateValidator,
  targetAvailability: v.union(v.literal("available"), v.literal("unavailable")),
  viewerActionState: v.union(
    v.literal("needs_action"),
    v.literal("acted"),
    v.literal("not_required"),
    v.literal("ineligible"),
    v.literal("closed"),
    v.literal("unavailable")
  ),
  viewerDecision: v.union(lenderPortalReviewDecisionValidator, v.null()),
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
  targetAvailability: v.union(v.literal("available"), v.literal("unavailable")),
});

export const lenderPortalReviewerQueuePageValidator = paginationResultValidator(
  lenderPortalReviewerQueueRowValidator
);

const lenderPortalMilestoneQueueEvidenceValidator = v.object({
  kind: v.union(
    v.literal("asset"),
    v.literal("package_revision"),
    v.literal("cost_document"),
    v.literal("cost_document_page"),
    v.literal("site_visit")
  ),
  label: v.string(),
});

const lenderPortalMilestoneQueueSubmilestoneValidator = v.object({
  builderEvidence: v.boolean(),
  name: v.string(),
  receiptCoverageCents: v.union(v.number(), v.null()),
  siteVisitAddressed: v.boolean(),
  siteVisitRequired: v.boolean(),
});

export const lenderPortalMilestoneQueueRowValidator = v.object({
  actionRequired: v.boolean(),
  actualCostCents: v.union(v.number(), v.null()),
  actualEndDate: v.union(v.string(), v.null()),
  actualStartDate: v.union(v.string(), v.null()),
  approvedGroups: v.array(lenderPortalReviewGroupValidator),
  buildId: v.id("activeBuilds"),
  buildName: v.string(),
  currentEligibleLenderCount: v.number(),
  evidence: v.array(lenderPortalMilestoneQueueEvidenceValidator),
  lenderApprovalCount: v.number(),
  lenderQuorum: v.union(v.number(), v.null()),
  milestoneId: v.id("buildMilestones"),
  milestoneName: v.string(),
  plannedBudgetCents: v.union(v.number(), v.null()),
  plannedEndDate: v.union(v.string(), v.null()),
  plannedStartDate: v.union(v.string(), v.null()),
  receiptCoverageCents: v.union(v.number(), v.null()),
  receiptInvoiceRequired: v.boolean(),
  requiredGroups: v.array(lenderPortalReviewGroupValidator),
  reviewCycleId: v.id("lenderPortalReviewCycles"),
  reviewCycleNumber: v.number(),
  siteVisitRequired: v.boolean(),
  state: lenderPortalReviewRequestStateValidator,
  submittedAt: v.number(),
  submilestones: v.array(lenderPortalMilestoneQueueSubmilestoneValidator),
  targetAvailability: v.union(v.literal("available"), v.literal("unavailable")),
  viewerActionState: v.union(
    v.literal("needs_action"),
    v.literal("acted"),
    v.literal("not_required"),
    v.literal("ineligible"),
    v.literal("closed"),
    v.literal("unavailable")
  ),
  viewerDecision: v.union(lenderPortalReviewDecisionValidator, v.null()),
});

export const lenderPortalMilestoneQueuePageValidator =
  paginationResultValidator(lenderPortalMilestoneQueueRowValidator);

export type LenderPortalMilestoneQueueRow = Infer<
  typeof lenderPortalMilestoneQueueRowValidator
>;

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

export const lenderPortalSiteVisitCompletionResultValidator = v.object({
  replayed: v.boolean(),
  siteVisitId: v.id("buildSiteVisits"),
  status: v.literal("complete"),
});

export const lenderPortalSiteVisitCompletionCandidateValidator = v.object({
  canComplete: v.boolean(),
  completionBlocker: v.union(
    v.literal("permission_required"),
    v.literal("photo_required"),
    v.null()
  ),
  locationUnverifiedPhotoCount: v.number(),
  photoCount: v.number(),
  requestedAt: v.string(),
  siteVisitId: v.id("buildSiteVisits"),
  updatedAt: v.number(),
});

export const lenderPortalSiteVisitCompletionPageValidator =
  paginationResultValidator(lenderPortalSiteVisitCompletionCandidateValidator);

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
