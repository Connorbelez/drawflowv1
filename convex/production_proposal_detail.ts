import { v } from "convex/values";

import { proposalLifecycleProjectionValidator } from "./lender_portal_phase3";

const proposalStatusValidator = v.union(
  v.literal("draft"),
  v.literal("submitted"),
  v.literal("approved"),
  v.literal("closed")
);

const proposalReviewOutcomeValidator = v.union(
  v.literal("none"),
  v.literal("requested_changes"),
  v.literal("rejected"),
  v.literal("approved")
);

const proposalIdentityValidator = v.object({
  email: v.optional(v.string()),
  emailVerified: v.optional(v.boolean()),
  name: v.optional(v.string()),
  workosUserId: v.string(),
});

const proposalAssignmentValidator = v.object({
  broker: v.optional(v.union(proposalIdentityValidator, v.null())),
  brokerage: v.optional(
    v.union(
      v.object({
        _id: v.optional(v.id("brokerages")),
        displayName: v.string(),
        legalName: v.optional(v.string()),
        workosOrganizationId: v.optional(v.string()),
      }),
      v.null()
    )
  ),
  builder: v.optional(
    v.union(
      v.object({
        _id: v.id("builderProfiles"),
        accounts: v.optional(
          v.array(
            proposalIdentityValidator.extend({ role: v.optional(v.string()) })
          )
        ),
        displayName: v.string(),
        legalName: v.optional(v.string()),
        ownerEmail: v.optional(v.string()),
        status: v.optional(v.string()),
      }),
      v.null()
    )
  ),
  builderAssigned: v.optional(v.boolean()),
  claimLinkActive: v.optional(v.boolean()),
  createdBy: v.optional(v.union(proposalIdentityValidator, v.null())),
  initiatedFromBackoffice: v.optional(v.boolean()),
});

const appPermissionValidator = v.object({
  grants: v.array(
    v.object({
      canCreate: v.boolean(),
      canDelete: v.boolean(),
      canUpdate: v.boolean(),
      canView: v.boolean(),
      resourceType: v.union(
        v.literal("milestone"),
        v.literal("submilestone"),
        v.literal("draw"),
        v.literal("evidence"),
        v.literal("contractor"),
        v.literal("material"),
        v.literal("capitalEvent"),
        v.literal("reminder")
      ),
    })
  ),
  mode: v.union(v.literal("full"), v.literal("limited")),
  role: v.union(
    v.literal("backoffice"),
    v.literal("owner"),
    v.literal("staff")
  ),
});

const proposalValidator = v.object({
  _id: v.id("buildProposals"),
  activeBuildId: v.optional(v.id("activeBuilds")),
  approvedAt: v.optional(v.number()),
  assignedBrokerWorkosUserId: v.optional(v.string()),
  backOfficeApprovedByWorkosUserId: v.optional(v.string()),
  borrowerCoPayBps: v.number(),
  borrowerCoPayCents: v.optional(v.number()),
  borrowerStartingCashCents: v.number(),
  borrowerWorkingCapitalLimitCents: v.number(),
  builderProfileId: v.optional(v.id("builderProfiles")),
  buildName: v.string(),
  capitalSource: v.optional(
    v.union(v.literal("internal"), v.literal("external"))
  ),
  closedAt: v.optional(v.number()),
  createdAt: v.number(),
  createdByWorkosUserId: v.optional(v.string()),
  currentProposalRevisionId: v.optional(v.id("proposalRevisions")),
  currentProposalRevisionNumber: v.optional(v.number()),
  currentReviewPolicyVersionId: v.optional(
    v.id("proposalReviewPolicyVersions")
  ),
  interestAnnualBps: v.optional(v.number()),
  lenderDrawPolicyLimitCents: v.number(),
  location: v.string(),
  locationLatitude: v.optional(v.number()),
  locationLongitude: v.optional(v.number()),
  locationPlaceId: v.optional(v.string()),
  lockedReviewPolicyId: v.optional(v.id("proposalReviewPolicyLocks")),
  proposedStartDate: v.optional(v.string()),
  reviewOutcome: proposalReviewOutcomeValidator,
  selectedPlan: v.optional(
    v.object({
      metrics: v.object({
        drawCount: v.number(),
        drawFeesCents: v.number(),
        interestCostCents: v.number(),
        minimumCashReserveCents: v.number(),
        projectedDurationDays: v.number(),
        requiredWorkingCapitalCents: v.optional(v.number()),
        startingCashCents: v.number(),
        totalCostCents: v.number(),
        totalDrawAmountCents: v.number(),
      }),
      name: v.string(),
      planKey: v.union(
        v.literal("cheapestFeasible"),
        v.literal("fastest"),
        v.literal("capitalConstrained")
      ),
      recommendationReason: v.optional(v.string()),
      selectedAt: v.optional(v.number()),
      selectedByWorkosUserId: v.optional(v.string()),
    })
  ),
  status: proposalStatusValidator,
  submittedAt: v.optional(v.number()),
  templateId: v.optional(v.id("proposalTemplates")),
  timelineMinimumCashReserveCents: v.optional(v.number()),
  timelineRangeMax: v.optional(v.number()),
  timelineRangeMin: v.optional(v.number()),
  timelineStartingCashCents: v.optional(v.number()),
  totalBudgetCents: v.number(),
  updatedAt: v.number(),
  updatedByWorkosUserId: v.optional(v.string()),
  workflowRuleSnapshotId: v.optional(v.id("workflowRuleSnapshots")),
});

const documentValidator = v.object({
  _id: v.id("proposalDocuments"),
  contractorVisible: v.optional(v.boolean()),
  createdAt: v.number(),
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
  storageUrl: v.union(v.string(), v.null()),
  updatedAt: v.number(),
  uploadedByWorkosUserId: v.optional(v.string()),
});

const milestoneValidator = v.object({
  _id: v.id("proposalMilestones"),
  budgetCents: v.number(),
  createdAt: v.number(),
  dayEnd: v.number(),
  dayStart: v.number(),
  dependencyKeys: v.array(v.string()),
  drawAvailabilityCents: v.number(),
  durationDays: v.number(),
  evidenceState: v.optional(v.string()),
  icon: v.optional(v.string()),
  key: v.string(),
  lane: v.optional(v.number()),
  markerLabel: v.optional(v.string()),
  name: v.string(),
  order: v.number(),
  policyState: v.optional(v.string()),
  timelineStatus: v.optional(v.string()),
  tone: v.optional(v.string()),
  updatedAt: v.number(),
});

const submilestoneValidator = v.object({
  _id: v.id("proposalSubmilestones"),
  budgetCents: v.optional(v.number()),
  createdAt: v.number(),
  durationDays: v.optional(v.number()),
  key: v.string(),
  milestoneKey: v.string(),
  name: v.string(),
  order: v.number(),
  proposalMilestoneId: v.id("proposalMilestones"),
  startDay: v.optional(v.number()),
  updatedAt: v.number(),
});

const buildMilestoneValidator = v.object({
  _id: v.id("buildMilestones"),
  budgetCents: v.number(),
  dayEnd: v.number(),
  dayStart: v.number(),
  dependencyKeys: v.array(v.string()),
  drawAvailabilityCents: v.number(),
  durationDays: v.number(),
  evidenceState: v.optional(v.string()),
  key: v.string(),
  name: v.string(),
  order: v.number(),
  planningState: v.optional(v.string()),
  policyState: v.optional(v.string()),
  progressPercent: v.optional(v.number()),
  proposalMilestoneId: v.id("proposalMilestones"),
  status: v.union(
    v.literal("planned"),
    v.literal("in_progress"),
    v.literal("complete")
  ),
  updatedAt: v.number(),
  workflowRevision: v.optional(v.number()),
});

const buildSubmilestoneValidator = v.object({
  _id: v.id("buildSubmilestones"),
  actualCostCents: v.optional(v.number()),
  budgetCents: v.optional(v.number()),
  buildMilestoneId: v.id("buildMilestones"),
  completionForecastDate: v.optional(v.string()),
  durationDays: v.optional(v.number()),
  evidenceReviewRound: v.optional(v.number()),
  evidenceReviewState: v.optional(v.string()),
  fieldNote: v.optional(v.string()),
  key: v.string(),
  milestoneKey: v.string(),
  name: v.string(),
  order: v.number(),
  planningState: v.optional(v.string()),
  progressPercent: v.optional(v.number()),
  proposalSubmilestoneId: v.id("proposalSubmilestones"),
  startDay: v.optional(v.number()),
  status: v.union(
    v.literal("planned"),
    v.literal("in_progress"),
    v.literal("complete")
  ),
  updatedAt: v.number(),
  workflowRevision: v.optional(v.number()),
});

const costItemValidator = v.object({
  _id: v.id("proposalCostItems"),
  budgetSubmilestoneKey: v.optional(v.string()),
  budgetTreatment: v.optional(
    v.union(v.literal("logOnly"), v.literal("add"), v.literal("maintain"))
  ),
  costCents: v.number(),
  createdAt: v.number(),
  createdByWorkosUserId: v.optional(v.string()),
  deliveryEndDay: v.optional(v.number()),
  deliveryInstructions: v.optional(v.string()),
  deliveryLocation: v.optional(v.string()),
  deliveryStartDay: v.optional(v.number()),
  description: v.optional(v.string()),
  itemKey: v.string(),
  itemType: v.union(v.literal("material"), v.literal("equipment")),
  milestoneKey: v.string(),
  proposalMilestoneId: v.id("proposalMilestones"),
  quantity: v.number(),
  relevantSubmilestoneKeys: v.array(v.string()),
  specificationTiptapJson: v.optional(v.string()),
  supplier: v.optional(v.string()),
  title: v.string(),
  unit: v.optional(v.string()),
  updatedAt: v.number(),
  updatedByWorkosUserId: v.optional(v.string()),
});

const proposalDrawValidator = v.object({
  _id: v.id("proposalDrawScheduleRows"),
  amountCents: v.number(),
  createdAt: v.number(),
  customDate: v.optional(v.boolean()),
  drawKey: v.string(),
  label: v.string(),
  milestoneKey: v.optional(v.string()),
  order: v.number(),
  requestNote: v.optional(v.string()),
  requestReviewNote: v.optional(v.string()),
  requestStatus: v.optional(
    v.union(
      v.literal("draft"),
      v.literal("requested"),
      v.literal("approved"),
      v.literal("rejected")
    )
  ),
  requestedAt: v.optional(v.string()),
  reviewedAt: v.optional(v.string()),
  source: v.union(v.literal("milestone"), v.literal("manual")),
  timingDay: v.number(),
  updatedAt: v.number(),
});

const plannedDrawValidator = v.object({
  _id: v.id("plannedDrawScheduleRows"),
  amountCents: v.number(),
  createdAt: v.number(),
  drawKey: v.string(),
  label: v.string(),
  milestoneKey: v.optional(v.string()),
  order: v.number(),
  releaseDate: v.optional(v.string()),
  releasedAt: v.optional(v.string()),
  requestedAt: v.optional(v.string()),
  reviewedAt: v.optional(v.string()),
  status: v.union(
    v.literal("planned"),
    v.literal("requested"),
    v.literal("approved"),
    v.literal("in_review"),
    v.literal("ready_for_admin"),
    v.literal("approved_for_release"),
    v.literal("rejected"),
    v.literal("withdrawn"),
    v.literal("cancelled"),
    v.literal("released")
  ),
  timingDay: v.number(),
  updatedAt: v.number(),
});

const lenderApprovalValidator = v.object({
  approvalId: v.id("proposalLenderApprovals"),
  approvedAt: v.optional(v.number()),
  declinedAt: v.optional(v.number()),
  proposalRevisionId: v.optional(v.id("proposalRevisions")),
  proposalRevisionNumber: v.optional(v.number()),
  status: v.union(v.literal("approved"), v.literal("declined")),
});

const lenderAssignmentValidator = v.object({
  assignmentId: v.id("proposalLenderAssignments"),
  assignedAt: v.number(),
  assignedByRole: v.string(),
  assignedByWorkosUserId: v.string(),
  lenderBrokerageId: v.id("brokerages"),
  lenderOrganizationId: v.union(v.id("lenderOrganizations"), v.string()),
  lenderOrganizationName: v.string(),
  status: v.union(
    v.literal("current"),
    v.literal("archiving"),
    v.literal("withdrawn")
  ),
  withdrawalReason: v.optional(v.string()),
  withdrawnAt: v.optional(v.number()),
  withdrawnByRole: v.optional(v.string()),
  withdrawnByWorkosUserId: v.optional(v.string()),
});

const auditEventValidator = v.object({
  _id: v.id("auditEvents"),
  actorRoles: v.array(v.string()),
  actorWorkosUserId: v.optional(v.string()),
  command: v.string(),
  createdAt: v.number(),
  entityId: v.string(),
  entityType: v.string(),
  eventType: v.string(),
  newState: v.optional(v.string()),
  priorState: v.optional(v.string()),
  reason: v.optional(v.string()),
  warnings: v.array(v.string()),
});

const proposalEventValidator = v.object({
  _id: v.id("proposalEvents"),
  actorRoles: v.array(v.string()),
  actorWorkosUserId: v.optional(v.string()),
  command: v.string(),
  createdAt: v.number(),
  eventType: v.string(),
  newState: v.optional(v.string()),
  priorState: v.optional(v.string()),
  reason: v.optional(v.string()),
  warnings: v.array(v.string()),
});

export const productionProposalDetailValidator = v.object({
  activeBuild: v.union(
    v.null(),
    v.object({
      _id: v.id("activeBuilds"),
      startDate: v.string(),
      status: v.union(v.literal("active"), v.literal("future_start")),
      timezone: v.optional(v.string()),
    })
  ),
  appPermissions: appPermissionValidator,
  assignment: proposalAssignmentValidator,
  auditEvents: v.optional(v.array(auditEventValidator)),
  buildMilestones: v.optional(v.array(buildMilestoneValidator)),
  buildSubmilestones: v.optional(v.array(buildSubmilestoneValidator)),
  costItems: v.array(costItemValidator),
  documents: v.array(documentValidator),
  draws: v.array(proposalDrawValidator),
  events: v.optional(v.array(proposalEventValidator)),
  lenderApproval: v.union(lenderApprovalValidator, v.null()),
  lenderAssignment: v.union(lenderAssignmentValidator, v.null()),
  lenderAssignmentHistory: v.array(lenderAssignmentValidator),
  lifecycle: proposalLifecycleProjectionValidator,
  milestones: v.array(milestoneValidator),
  permitWaiver: v.union(
    v.null(),
    v.object({
      _id: v.id("documentWaivers"),
      createdAt: v.number(),
      documentType: v.union(
        v.literal("permit"),
        v.literal("budget"),
        v.literal("plan"),
        v.literal("supporting")
      ),
      grantedByRole: v.optional(v.string()),
      grantedByWorkosUserId: v.optional(v.string()),
      reason: v.string(),
    })
  ),
  plannedDraws: v.array(plannedDrawValidator),
  proposal: proposalValidator,
  submilestones: v.array(submilestoneValidator),
});

export const nullableProductionProposalDetailValidator = v.union(
  productionProposalDetailValidator,
  v.null()
);
