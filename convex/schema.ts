import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

import {
  buildActionAssignmentStateValidator,
  buildActionItemPriorityValidator,
  buildActionItemStatusValidator,
  buildActionItemWorkKindValidator,
  buildActionRelationKindValidator,
  buildCollaborationActorKindValidator,
  buildCollaborationApprovalStateValidator,
  buildCollaborationAssetScanStateValidator,
  buildCollaborationAssetStagingContextValidator,
  buildCollaborationAssetStagingStateValidator,
  buildCollaborationAssetStateValidator,
  buildCollaborationAttachmentKindValidator,
  buildCollaborationAudienceModeValidator,
  buildCollaborationContentStateValidator,
  buildCollaborationDraftStateValidator,
  buildCollaborationNotificationChannelValidator,
  buildCollaborationNotificationKindValidator,
  buildCollaborationOwnerKindValidator,
  buildCollaborationPinKindValidator,
  buildCollaborationPostTypeValidator,
  buildCollaborationReactionValidator,
  buildCollaborationReferenceKindValidator,
  buildCollaborationRoleValidator,
  buildCollaborationSourceValidator,
  buildCollaborationTenantStatusValidator,
  buildCollaborationThreadStateValidator,
  buildParticipantStatusValidator,
} from "./build_collaboration_validators";

const siteVisitLocationAttemptValidator = v.object({
  accuracyMeters: v.optional(v.number()),
  attempted: v.boolean(),
  attemptedAt: v.optional(v.number()),
  distanceMeters: v.optional(v.number()),
  failureReason: v.optional(v.string()),
  geofenceRadiusMeters: v.optional(v.number()),
  latitude: v.optional(v.number()),
  longitude: v.optional(v.number()),
  permissionOutcome: v.union(
    v.literal("denied"),
    v.literal("granted"),
    v.literal("not_requested"),
    v.literal("unavailable")
  ),
  verified: v.boolean(),
});

const siteVisitPrerequisiteExceptionValidator = v.object({
  acknowledged: v.boolean(),
  reason: v.string(),
});

const demoTimelineStatusValidator = v.union(
  v.literal("complete"),
  v.literal("ready"),
  v.literal("review"),
  v.literal("upcoming")
);

const demoTimelineIconValidator = v.union(
  v.literal("change"),
  v.literal("closeout"),
  v.literal("drywall"),
  v.literal("exterior"),
  v.literal("finishes"),
  v.literal("foundation"),
  v.literal("framing"),
  v.literal("kitchen"),
  v.literal("plumbing"),
  v.literal("roofing"),
  v.literal("roughIn")
);

const demoTimelineToneValidator = v.optional(
  v.union(
    v.literal("active"),
    v.literal("blocked"),
    v.literal("complete"),
    v.literal("upcoming"),
    v.literal("warning")
  )
);

const demoTimelineSnapshotSubmilestoneStatusValidator = v.union(
  v.literal("todo"),
  v.literal("in_progress"),
  v.literal("done")
);

const demoTimelineSnapshotSubmilestoneValidator = v.object({
  budgetCents: v.optional(v.number()),
  description: v.optional(v.string()),
  durationDays: v.optional(v.number()),
  key: v.string(),
  name: v.string(),
  order: v.number(),
  status: v.optional(demoTimelineSnapshotSubmilestoneStatusValidator),
});

const demoTimelineSnapshotSiteVisitGuidanceValidator = v.object({
  cameraAngles: v.string(),
  whatToVerify: v.string(),
});

const demoTimelineMilestoneDataValidator = v.object({
  amount: v.number(),
  completionClaim: v.optional(
    v.object({
      actualCost: v.optional(v.number()),
      completedDay: v.number(),
      note: v.optional(v.string()),
      qualityNote: v.optional(v.string()),
      qualityRating: v.optional(v.number()),
      submittedAt: v.string(),
    })
  ),
  completionPaymentAmount: v.optional(v.number()),
  completionReview: v.optional(
    v.object({
      note: v.optional(v.string()),
      reviewedAt: v.string(),
      siteVisit: v.optional(
        v.object({
          includedItemIds: v.optional(v.array(v.string())),
          note: v.optional(v.string()),
          requestedAt: v.string(),
          requestedDay: v.number(),
          status: v.optional(v.string()),
          tokenExpiresAt: v.optional(v.number()),
          url: v.optional(v.string()),
          visitId: v.optional(v.string()),
        })
      ),
      status: v.union(v.literal("approved"), v.literal("revisionRequested")),
    })
  ),
  draw: v.string(),
  drawAvailabilityAmount: v.optional(v.number()),
  drawX: v.optional(v.number()),
  durationDays: v.number(),
  evidence: v.string(),
  evidencePackage: v.optional(
    v.object({
      assets: v.array(
        v.object({
          fileName: v.string(),
          id: v.string(),
          label: v.string(),
          mimeType: v.string(),
          previewUrl: v.optional(v.string()),
          size: v.number(),
          tag: v.string(),
        })
      ),
    })
  ),
  icon: demoTimelineIconValidator,
  initialPaymentAmount: v.optional(v.number()),
  name: v.string(),
  policy: v.string(),
  siteVisitGuidance: v.optional(demoTimelineSnapshotSiteVisitGuidanceValidator),
  status: demoTimelineStatusValidator,
  subMilestones: v.optional(v.array(v.string())),
  submilestoneDetails: v.optional(
    v.array(demoTimelineSnapshotSubmilestoneValidator)
  ),
});

const demoTimelineItemValidator = v.object({
  data: demoTimelineMilestoneDataValidator,
  disabled: v.optional(v.boolean()),
  eyebrow: v.optional(v.string()),
  id: v.string(),
  label: v.optional(v.string()),
  lane: v.optional(v.number()),
  markerLabel: v.optional(v.string()),
  tone: demoTimelineToneValidator,
  x: v.number(),
});

const demoTimelineDrawValidator = v.object({
  amount: v.number(),
  customDate: v.optional(v.boolean()),
  id: v.string(),
  itemId: v.optional(v.string()),
  label: v.string(),
  requestReviewNote: v.optional(v.string()),
  requestNote: v.optional(v.string()),
  requestStatus: v.optional(
    v.union(
      v.literal("draft"),
      v.literal("requested"),
      v.literal("approved"),
      v.literal("rejected")
    )
  ),
  reviewedAt: v.optional(v.string()),
  requestedAt: v.optional(v.string()),
  x: v.number(),
});

const demoTimelineCapitalSpikeValidator = v.object({
  amount: v.number(),
  eventKind: v.optional(
    v.union(
      v.literal("cashInfusion"),
      v.literal("cost"),
      v.literal("homeEquityTakeout")
    )
  ),
  id: v.string(),
  interestAnnualBps: v.optional(v.number()),
  label: v.string(),
  x: v.number(),
});

const demoTimelineRangeValidator = v.object({
  max: v.number(),
  min: v.number(),
  unit: v.optional(v.string()),
});

const demoActiveMilestoneSelectionValidator = v.object({
  itemId: v.string(),
  phase: v.union(v.literal("inProgress"), v.literal("complete")),
});

const demoTimelinePlanStatusValidator = v.union(
  v.literal("draft"),
  v.literal("submitted"),
  v.literal("approved"),
  v.literal("archived")
);

const demoTimelineDrawStatusValidator = v.union(
  v.literal("draft"),
  v.literal("requested"),
  v.literal("approved"),
  v.literal("rejected")
);

const demoTimelineCapitalEventKindValidator = v.union(
  v.literal("cost"),
  v.literal("cashInfusion")
);

const demoTimelineModificationRequestTypeValidator = v.union(
  v.literal("createMilestone"),
  v.literal("deleteMilestone"),
  v.literal("updateMilestoneBudget")
);

const demoTimelineModificationRequestStatusValidator = v.union(
  v.literal("requested"),
  v.literal("approved"),
  v.literal("rejected")
);

const demoTimelineSiteVisitStatusValidator = v.union(
  v.literal("unopened"),
  v.literal("in_progress"),
  v.literal("complete"),
  v.literal("expired"),
  v.literal("superseded")
);

const demoSiteVisitGuidanceKindValidator = v.union(
  v.literal("whatToVerify"),
  v.literal("cameraAngle")
);

const demoTimelineSubmilestoneSnapshotValidator = v.object({
  budgetCents: v.optional(v.number()),
  description: v.optional(v.string()),
  durationDays: v.optional(v.number()),
  key: v.string(),
  name: v.string(),
  order: v.number(),
  status: v.optional(
    v.union(v.literal("todo"), v.literal("in_progress"), v.literal("done"))
  ),
});

const productionProposalStatusValidator = v.union(
  v.literal("draft"),
  v.literal("submitted"),
  v.literal("approved"),
  v.literal("closed")
);

const productionReviewOutcomeValidator = v.union(
  v.literal("none"),
  v.literal("requested_changes"),
  v.literal("rejected"),
  v.literal("approved")
);

const productionSelectedPlanValidator = v.object({
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
  recommendationReason: v.string(),
  selectedAt: v.number(),
  selectedByWorkosUserId: v.string(),
});

const productionDocumentTypeValidator = v.union(
  v.literal("permit"),
  v.literal("budget"),
  v.literal("plan"),
  v.literal("supporting")
);

const productionDocumentStatusValidator = v.union(
  v.literal("uploaded"),
  v.literal("linked"),
  v.literal("waived")
);

const buildDocumentStatusValidator = v.union(
  v.literal("uploaded"),
  v.literal("linked"),
  v.literal("waived"),
  v.literal("superseded")
);

const siteVisitGuidanceFieldValidator = v.union(
  v.string(),
  v.array(v.string())
);

const siteVisitGuidanceValidator = v.object({
  cameraAngles: siteVisitGuidanceFieldValidator,
  whatToVerify: siteVisitGuidanceFieldValidator,
});

const richTextFormatValidator = v.union(
  v.literal("plain_text"),
  v.literal("html")
);

const productionBuildStatusValidator = v.union(
  v.literal("active"),
  v.literal("future_start")
);

const productionBuildDrawStatusValidator = v.union(
  v.literal("planned"),
  v.literal("requested"),
  v.literal("approved"),
  v.literal("in_review"),
  v.literal("ready_for_admin"),
  v.literal("approved_for_release"),
  v.literal("rejected"),
  v.literal("withdrawn"),
  v.literal("released")
);

const activeBuildDrawRequestStatusValidator = v.union(
  v.literal("requested"),
  v.literal("approved"),
  v.literal("in_review"),
  v.literal("ready_for_admin"),
  v.literal("approved_for_release"),
  v.literal("rejected"),
  v.literal("withdrawn"),
  v.literal("released")
);

const contractorKindValidator = v.union(
  v.literal("company"),
  v.literal("individual"),
  v.literal("crew")
);

const contractorPayRateUnitValidator = v.union(
  v.literal("hour"),
  v.literal("day"),
  v.literal("fixed")
);

const contractorOnboardingStatusValidator = v.union(
  v.literal("profile_only"),
  v.literal("invited"),
  v.literal("account_linked")
);

const contractorProfileSourceValidator = v.union(
  v.literal("builder_created"),
  v.literal("backoffice_created"),
  v.literal("self_service")
);

const contractorProfileReviewTypeValidator = v.union(
  v.literal("legal_name_change"),
  v.literal("primary_email_change"),
  v.literal("compliance_docs"),
  v.literal("deactivation"),
  v.literal("merge"),
  v.literal("split"),
  v.literal("account_unlink")
);

const contractorProfileReviewStatusValidator = v.union(
  v.literal("pending"),
  v.literal("approved"),
  v.literal("rejected")
);

// Self-service onboarding review state machine (PRD §7.1, §14.1). Distinct
// from the coarse account-link status on contractorProfiles.onboardingStatus:
// onboarding review is the gated path a self-service `member` follows before
// WorkOS contractor role promotion unlocks the full workspace.
const contractorOnboardingReviewStatusValidator = v.union(
  v.literal("draft"),
  v.literal("pending_backoffice_review"),
  v.literal("changes_requested"),
  v.literal("approved_pending_workos"),
  v.literal("active"),
  v.literal("rejected"),
  v.literal("merged")
);

// Backoffice onboarding review decision outcomes (PRD §7.2).
const contractorOnboardingReviewOutcomeValidator = v.union(
  v.literal("approved"),
  v.literal("rejected"),
  v.literal("changes_requested"),
  v.literal("merged"),
  v.literal("compliance_required"),
  v.literal("approved_missing_compliance"),
  v.literal("compliance_not_required")
);

// Invite/claim intent lifecycle (PRD §7.3, §14.2).
const contractorInviteClaimStateValidator = v.union(
  v.literal("not_invited"),
  v.literal("invited"),
  v.literal("accepted_pending_confirmation"),
  v.literal("claimed"),
  v.literal("revoked"),
  v.literal("expired")
);

// Contractor-submitted supporting evidence feedback (PRD §8.7, §14.4).
const contractorEvidenceFeedbackStateValidator = v.union(
  v.literal("submitted"),
  v.literal("useful"),
  v.literal("not_relevant"),
  v.literal("more_context_requested"),
  v.literal("replacement_requested"),
  v.literal("addressed")
);

// Assignment acknowledgement + scope issue state (PRD §14.3).
const contractorAssignmentAckStateValidator = v.union(
  v.literal("pending_acknowledgement"),
  v.literal("acknowledged"),
  v.literal("clarification_requested"),
  v.literal("scope_disputed"),
  v.literal("resolved")
);

const contractorScopeIssueKindValidator = v.union(
  v.literal("clarification"),
  v.literal("mismatch"),
  v.literal("schedule_conflict")
);

const contractorScopeIssueStatusValidator = v.union(
  v.literal("open"),
  v.literal("awaiting_contractor"),
  v.literal("awaiting_builder"),
  v.literal("awaiting_backoffice"),
  v.literal("resolved"),
  v.literal("withdrawn")
);

// Contractor notification channels (PRD §10). Narrow notifications only — no
// chat/threaded messaging (PRD §18).
const contractorNotificationKindValidator = v.union(
  v.literal("assigned_to_scope"),
  v.literal("removed_from_scope"),
  v.literal("schedule_changed"),
  v.literal("schedule_acknowledgement_requested"),
  v.literal("evidence_feedback"),
  v.literal("invite_claimed"),
  v.literal("profile_review_required"),
  v.literal("clarification_requested"),
  v.literal("clarification_responded"),
  v.literal("clarification_resolved"),
  v.literal("onboarding_result")
);

const contractorNotificationChannelValidator = v.union(
  v.literal("in_app"),
  v.literal("email")
);

const milestoneContractorAssignmentStatusValidator = v.union(
  v.literal("planned"),
  v.literal("active"),
  v.literal("completed"),
  v.literal("removed")
);

const contractorQualityRatingSourceValidator = v.union(
  v.literal("builder_evidence"),
  v.literal("site_visit"),
  v.literal("backoffice")
);

const productionCostItemTypeValidator = v.union(
  v.literal("material"),
  v.literal("equipment")
);

const productionCostItemBudgetTreatmentValidator = v.union(
  v.literal("logOnly"),
  v.literal("add"),
  v.literal("maintain")
);

const builderStaffPermissionScopeValidator = v.union(
  v.literal("proposal"),
  v.literal("activeBuild")
);

const builderStaffPermissionResourceValidator = v.union(
  v.literal("milestone"),
  v.literal("submilestone"),
  v.literal("draw"),
  v.literal("evidence"),
  v.literal("contractor"),
  v.literal("material"),
  v.literal("capitalEvent"),
  v.literal("reminder")
);

const productionOutboxStatusValidator = v.union(
  v.literal("pending"),
  v.literal("processed"),
  v.literal("failed")
);

const recipientDeliveryStatusValidator = v.union(
  v.literal("unread"),
  v.literal("read"),
  v.literal("dismissed"),
  v.literal("resolved")
);

const recipientDeliveryResolutionModeValidator = v.union(
  v.literal("domain"),
  v.literal("recipient")
);

const buildCollaborationExternalDeliveryStatusValidator = v.union(
  v.literal("queued"),
  v.literal("dispatched"),
  v.literal("failed"),
  v.literal("sent"),
  v.literal("cancelled")
);

const buildCollaborationExternalChannelValidator = v.union(
  v.literal("email"),
  v.literal("push")
);

const buildCollaborationDeliveryCadenceValidator = v.union(
  v.literal("immediate"),
  v.literal("daily"),
  v.literal("weekly")
);

const buildCollaborationDeliveryAttemptStateValidator = v.union(
  v.literal("sending"),
  v.literal("succeeded"),
  v.literal("failed")
);

const buildCollaborationDeliveryBatchStateValidator = v.union(
  v.literal("sending"),
  v.literal("succeeded"),
  v.literal("failed"),
  v.literal("cancelled")
);

const operationsHandoffAcknowledgementStateValidator = v.union(
  v.literal("pending_decision"),
  v.literal("returned"),
  v.literal("acknowledged")
);

const operationsHandoffReturnDecisionValidator = v.union(
  v.literal("continue"),
  v.literal("reroute"),
  v.literal("close")
);

const integrationEndpointStatusValidator = v.union(
  v.literal("draft"),
  v.literal("active"),
  v.literal("disabled"),
  v.literal("revoked")
);

const integrationDeliveryStatusValidator = v.union(
  v.literal("pending"),
  v.literal("delivered"),
  v.literal("failed"),
  v.literal("retry_pending")
);

const proposalCollaborationSessionStatusValidator = v.union(
  v.literal("active"),
  v.literal("inactive")
);

const proposalCollaborationInitiatorSideValidator = v.union(
  v.literal("broker"),
  v.literal("builder")
);

const proposalCollaborationPermissionValidator = v.union(
  v.literal("view"),
  v.literal("edit")
);

const proposalCollaborationParticipantStatusValidator = v.union(
  v.literal("invited"),
  v.literal("joined"),
  v.literal("revoked")
);

const proposalCollaborationParticipantSourceValidator = v.union(
  v.literal("creator"),
  v.literal("share-link"),
  v.literal("invite")
);

export default defineSchema({
  demo_auditEvents: defineTable({
    actorPersona: v.string(),
    afterSummary: v.optional(v.string()),
    beforeSummary: v.optional(v.string()),
    buildId: v.optional(v.id("demo_builds")),
    command: v.string(),
    correlationId: v.string(),
    createdAt: v.number(),
    drawGroupKey: v.optional(v.string()),
    entityKey: v.optional(v.string()),
    entityLabel: v.optional(v.string()),
    entityType: v.string(),
    eventType: v.string(),
    milestoneKey: v.optional(v.string()),
    reason: v.optional(v.string()),
    scenario: v.string(),
    validation: v.string(),
  })
    .index("by_scenario", ["scenario"])
    .index("by_milestone", ["scenario", "milestoneKey"])
    .index("by_draw_group", ["scenario", "drawGroupKey"]),
  demo_builds: defineTable({
    address: v.optional(v.string()),
    detailOverrides: v.optional(
      v.object({
        openWarnings: v.optional(v.number()),
        percentComplete: v.optional(v.number()),
        siteVisitsOpen: v.optional(v.number()),
      })
    ),
    borrowerCoPayBps: v.optional(v.number()),
    borrowerCoPayCents: v.optional(v.number()),
    flatDrawFeeCents: v.number(),
    interestAnnualBps: v.number(),
    key: v.string(),
    lenderDrawPolicyLimitCents: v.number(),
    locationLatitude: v.optional(v.number()),
    locationLongitude: v.optional(v.number()),
    name: v.string(),
    orgKey: v.optional(v.string()),
    ownerPersona: v.optional(v.string()),
    payoffDate: v.string(),
    projectStartDate: v.string(),
    scenario: v.string(),
    seedVersion: v.number(),
    status: v.string(),
    subtitle: v.string(),
    submittedAt: v.optional(v.number()),
    todayDate: v.string(),
    updatedAt: v.number(),
    workingCapitalLimitCents: v.number(),
  })
    .index("by_key", ["key"])
    .index("by_scenario", ["scenario"]),
  demo_drawGroups: defineTable({
    approvedValueCents: v.number(),
    baselineEndDate: v.optional(v.string()),
    baselineStartDate: v.optional(v.string()),
    buildId: v.id("demo_builds"),
    forecastEndDate: v.optional(v.string()),
    forecastStartDate: v.optional(v.string()),
    key: v.string(),
    label: v.string(),
    order: v.number(),
    orgKey: v.optional(v.string()),
    plannedEndDate: v.optional(v.string()),
    plannedStartDate: v.optional(v.string()),
    releaseApprovedAt: v.optional(v.number()),
    requestedValueCents: v.number(),
    reviewLagDays: v.optional(v.number()),
    scenario: v.string(),
    sourceTimelineDrawId: v.optional(v.id("demo_timelineDraws")),
    status: v.string(),
    updatedAt: v.number(),
  })
    .index("by_build_order", ["buildId", "order"])
    .index("by_build_and_source_timeline_draw", [
      "buildId",
      "sourceTimelineDrawId",
    ])
    .index("by_scenario", ["scenario"])
    .index("by_scenario_key", ["scenario", "key"]),
  demo_eventOutbox: defineTable({
    buildId: v.optional(v.id("demo_builds")),
    createdAt: v.number(),
    drawGroupKey: v.optional(v.string()),
    eventType: v.string(),
    milestoneKey: v.optional(v.string()),
    payloadPreview: v.string(),
    relatedEntity: v.string(),
    scenario: v.string(),
    status: v.string(),
  })
    .index("by_scenario", ["scenario"])
    .index("by_milestone", ["scenario", "milestoneKey"]),
  demo_evidenceFiles: defineTable({
    buildId: v.id("demo_builds"),
    evidencePackageId: v.optional(v.id("demo_evidencePackages")),
    fileName: v.string(),
    isSample: v.boolean(),
    milestoneId: v.id("demo_milestones"),
    milestoneKey: v.string(),
    mimeType: v.string(),
    removedAt: v.optional(v.number()),
    scenario: v.string(),
    sizeBytes: v.number(),
    uploadedAt: v.number(),
    uploadedByPersona: v.string(),
  })
    .index("by_milestone", ["scenario", "milestoneKey"])
    .index("by_package", ["evidencePackageId"]),
  demo_evidencePackages: defineTable({
    buildId: v.id("demo_builds"),
    createdAt: v.number(),
    frozenAt: v.optional(v.number()),
    milestoneId: v.union(
      v.id("demo_milestones"),
      v.id("demo_timelineMilestones")
    ),
    milestoneKey: v.string(),
    reviewStatus: v.string(),
    scenario: v.string(),
    status: v.string(),
    submittedAt: v.optional(v.number()),
  })
    .index("by_milestone", ["scenario", "milestoneKey"])
    .index("by_scenario", ["scenario"]),
  demo_forecastUpdates: defineTable({
    actorPersona: v.string(),
    buildId: v.id("demo_builds"),
    createdAt: v.number(),
    milestoneId: v.id("demo_milestones"),
    milestoneKey: v.string(),
    newEndDate: v.string(),
    newStartDate: v.string(),
    priorEndDate: v.string(),
    priorStartDate: v.string(),
    reason: v.string(),
    scenario: v.string(),
  }).index("by_milestone", ["scenario", "milestoneKey"]),
  demo_milestoneDependencies: defineTable({
    blockedKey: v.string(),
    blockerKey: v.string(),
    buildId: v.id("demo_builds"),
    isSystem: v.boolean(),
    scenario: v.string(),
    severity: v.string(),
    type: v.string(),
  })
    .index("by_blocked", ["scenario", "blockedKey"])
    .index("by_blocker", ["scenario", "blockerKey"])
    .index("by_scenario", ["scenario"]),
  demo_milestones: defineTable({
    actualCompletedDate: v.optional(v.string()),
    approvedAt: v.optional(v.number()),
    approvedByPersona: v.optional(v.string()),
    approvedValueCents: v.number(),
    baselineEndDate: v.optional(v.string()),
    baselineStartDate: v.optional(v.string()),
    buildId: v.id("demo_builds"),
    code: v.string(),
    drawGroupKey: v.string(),
    durationDays: v.number(),
    evidenceReviewStatus: v.optional(v.string()),
    forecastEndDate: v.optional(v.string()),
    forecastStartDate: v.optional(v.string()),
    isDragLocked: v.optional(v.boolean()),
    key: v.string(),
    name: v.string(),
    order: v.number(),
    orgKey: v.optional(v.string()),
    plannedEndDate: v.optional(v.string()),
    plannedStartDate: v.optional(v.string()),
    progressPercent: v.number(),
    requestedAmountCents: v.optional(v.number()),
    requiresSiteVisit: v.boolean(),
    scenario: v.string(),
    sourceTimelineMilestoneId: v.optional(v.id("demo_timelineMilestones")),
    status: v.string(),
    submittedAt: v.optional(v.number()),
    type: v.string(),
    updatedAt: v.number(),
  })
    .index("by_build_order", ["buildId", "order"])
    .index("by_build_and_source_timeline_milestone", [
      "buildId",
      "sourceTimelineMilestoneId",
    ])
    .index("by_draw_group", ["scenario", "drawGroupKey"])
    .index("by_key", ["scenario", "key"])
    .index("by_scenario", ["scenario"]),
  demo_planningRuns: defineTable({
    buildId: v.id("demo_builds"),
    createdAt: v.number(),
    errors: v.array(v.string()),
    interestEstimateCents: v.number(),
    recommendedDrawCount: v.number(),
    recommendedOrderKeys: v.array(v.string()),
    runType: v.string(),
    scenario: v.string(),
    status: v.string(),
    warnings: v.array(v.string()),
  }).index("by_scenario", ["scenario"]),
  demo_warningDismissals: defineTable({
    actorPersona: v.string(),
    conditionHash: v.string(),
    dismissedAt: v.number(),
    drawGroupKey: v.optional(v.string()),
    milestoneKey: v.optional(v.string()),
    reason: v.optional(v.string()),
    scenario: v.string(),
    warningCode: v.string(),
    warningId: v.string(),
  })
    .index("by_scenario", ["scenario"])
    .index("by_warning", ["scenario", "warningId", "conditionHash"]),
  demo_policySnapshots: defineTable({
    buildId: v.id("demo_builds"),
    createdAt: v.number(),
    flatDrawFeeCents: v.number(),
    interestAnnualBps: v.number(),
    scenario: v.string(),
    workingCapitalLimitCents: v.number(),
  }).index("by_scenario", ["scenario"]),
  demo_reviewReports: defineTable({
    buildId: v.id("demo_builds"),
    createdAt: v.number(),
    milestoneId: v.union(
      v.id("demo_milestones"),
      v.id("demo_timelineMilestones")
    ),
    milestoneKey: v.string(),
    notes: v.string(),
    outcome: v.string(),
    reviewerPersona: v.string(),
    scenario: v.string(),
  }).index("by_milestone", ["scenario", "milestoneKey"]),
  demo_rolloverBuffers: defineTable({
    buildId: v.id("demo_builds"),
    createdAt: v.number(),
    milestoneId: v.union(
      v.id("demo_milestones"),
      v.id("demo_timelineMilestones")
    ),
    milestoneKey: v.string(),
    originalApprovedCents: v.number(),
    requestedAmountCents: v.number(),
    scenario: v.string(),
    status: v.string(),
    unusedAmountCents: v.number(),
  }).index("by_scenario", ["scenario"]),
  demo_siteVisits: defineTable({
    assignedPersona: v.string(),
    buildId: v.id("demo_builds"),
    claimedAt: v.optional(v.number()),
    completedAt: v.optional(v.number()),
    completionObserved: v.optional(v.boolean()),
    createdAt: v.number(),
    organizationScopeKey: v.optional(v.string()),
    workOrderId: v.optional(v.string()),
    evidencePackageId: v.optional(v.string()),
    scopeBoundAt: v.optional(v.number()),
    milestoneId: v.union(
      v.id("demo_milestones"),
      v.id("demo_timelineMilestones")
    ),
    locationAttempt: v.optional(siteVisitLocationAttemptValidator),
    milestoneKey: v.string(),
    missingPrerequisites: v.optional(v.array(v.string())),
    notes: v.optional(v.string()),
    notesFormat: v.optional(richTextFormatValidator),
    prerequisiteException: v.optional(siteVisitPrerequisiteExceptionValidator),
    recommendedOutcome: v.optional(v.string()),
    requestReason: v.optional(v.string()),
    requestedByPersona: v.optional(v.string()),
    riskFlags: v.optional(v.array(v.string())),
    scenario: v.string(),
    status: v.string(),
    tokenConsumedAt: v.optional(v.number()),
    tokenExpiresAt: v.optional(v.number()),
    tokenHash: v.optional(v.string()),
  })
    .index("by_milestone", ["scenario", "milestoneKey"])
    .index("by_token_hash", ["tokenHash"])
    .index("by_scenario", ["scenario"]),
  demo_siteVisitTargets: defineTable({
    buildId: v.id("demo_builds"),
    createdAt: v.number(),
    milestoneId: v.union(
      v.id("demo_milestones"),
      v.id("demo_timelineMilestones")
    ),
    milestoneKey: v.string(),
    milestoneName: v.string(),
    milestoneOrder: v.number(),
    scenario: v.string(),
    siteVisitId: v.id("demo_siteVisits"),
    submilestones: v.array(v.string()),
  })
    .index("by_site_visit", ["siteVisitId"])
    .index("by_milestone", ["scenario", "milestoneKey"])
    .index("by_scenario", ["scenario"]),
  demo_siteVisitTargetGuidanceItems: defineTable({
    buildId: v.id("demo_builds"),
    createdAt: v.number(),
    kind: demoSiteVisitGuidanceKindValidator,
    milestoneKey: v.string(),
    milestoneName: v.string(),
    order: v.number(),
    scenario: v.string(),
    siteVisitId: v.id("demo_siteVisits"),
    siteVisitTargetId: v.id("demo_siteVisitTargets"),
    sourceKind: v.optional(v.string()),
    sourceKey: v.optional(v.string()),
    text: v.string(),
  })
    .index("by_site_visit", ["siteVisitId"])
    .index("by_target", ["siteVisitTargetId"])
    .index("by_milestone", ["scenario", "milestoneKey"]),
  demo_siteVisitFiles: defineTable({
    buildId: v.id("demo_builds"),
    fileName: v.string(),
    mimeType: v.string(),
    scenario: v.string(),
    siteVisitId: v.id("demo_siteVisits"),
    sizeBytes: v.number(),
    storageId: v.id("_storage"),
    targetMilestoneKey: v.optional(v.string()),
    targetSubmilestoneKey: v.optional(v.string()),
    uploadedAt: v.number(),
  })
    .index("by_site_visit", ["siteVisitId"])
    .index("by_milestone", ["scenario", "targetMilestoneKey"])
    .index("by_scenario", ["scenario"]),
  demo_timelineSnapshots: defineTable({
    activeSelection: demoActiveMilestoneSelectionValidator,
    approvedDrawLimit: v.optional(v.number()),
    capitalSpikes: v.optional(v.array(demoTimelineCapitalSpikeValidator)),
    createdAt: v.number(),
    currentDay: v.optional(v.number()),
    draws: v.array(demoTimelineDrawValidator),
    items: v.array(demoTimelineItemValidator),
    minimumCashReserve: v.optional(v.number()),
    payloadVersion: v.literal(2),
    progressValue: v.number(),
    range: demoTimelineRangeValidator,
    selectedPanelOpen: v.boolean(),
    snapshotSummary: v.string(),
    startingCash: v.optional(v.number()),
    straightLine: v.boolean(),
    title: v.string(),
    updatedAt: v.number(),
  }).index("by_created_at", ["createdAt"]),
  demo_builderProposalTemplates: defineTable({
    createdAt: v.number(),
    description: v.string(),
    isDefault: v.boolean(),
    milestonePresets: v.array(
      v.object({
        dependencyKeys: v.array(v.string()),
        durationDays: v.number(),
        key: v.string(),
        name: v.string(),
        percentageBps: v.number(),
        type: v.string(),
      })
    ),
    orgKey: v.string(),
    seedVersion: v.number(),
    summary: v.string(),
    templateKey: v.string(),
    title: v.string(),
    updatedAt: v.number(),
  })
    .index("by_org", ["orgKey"])
    .index("by_template", ["orgKey", "templateKey"]),
  demo_builderProposalDrafts: defineTable({
    borrowerCashAvailabilityCents: v.optional(v.number()),
    borrowerCoPayCents: v.optional(v.number()),
    buildLocation: v.string(),
    buildName: v.string(),
    createdAt: v.number(),
    currentBudgetCents: v.number(),
    estimatedStartDate: v.optional(v.string()),
    generatedMilestoneVersion: v.number(),
    lenderDrawPolicyLimitCents: v.number(),
    manuallyEdited: v.boolean(),
    orgKey: v.string(),
    originalBudgetCents: v.optional(v.number()),
    proposalNumber: v.string(),
    status: v.string(),
    templateKey: v.optional(v.string()),
    templateTitle: v.optional(v.string()),
    updatedAt: v.number(),
    workspaceReadyAt: v.optional(v.number()),
  })
    .index("by_org", ["orgKey"])
    .index("by_org_status", ["orgKey", "status"])
    .index("by_proposal_number", ["orgKey", "proposalNumber"]),
  demo_builderProposalMilestones: defineTable({
    bankItemKey: v.optional(v.string()),
    budgetCents: v.number(),
    createdAt: v.number(),
    dayEnd: v.number(),
    dayStart: v.number(),
    dependencyKeys: v.array(v.string()),
    drawGroupIndex: v.optional(v.number()),
    draftId: v.id("demo_builderProposalDrafts"),
    durationDays: v.number(),
    included: v.boolean(),
    key: v.string(),
    name: v.string(),
    order: v.number(),
    orgKey: v.string(),
    percentageBps: v.optional(v.number()),
    source: v.string(),
    templateKey: v.optional(v.string()),
    type: v.string(),
    updatedAt: v.number(),
  })
    .index("by_draft_order", ["draftId", "order"])
    .index("by_key", ["draftId", "key"])
    .index("by_org", ["orgKey"]),
  demo_builderProposalEvents: defineTable({
    actorPersona: v.string(),
    command: v.string(),
    createdAt: v.number(),
    draftId: v.optional(v.id("demo_builderProposalDrafts")),
    entityKey: v.optional(v.string()),
    entityType: v.string(),
    eventType: v.string(),
    newState: v.optional(v.string()),
    orgKey: v.string(),
    priorState: v.optional(v.string()),
    reason: v.optional(v.string()),
    requirementIds: v.array(v.string()),
    validationIds: v.array(v.string()),
    warnings: v.array(v.string()),
  })
    .index("by_draft", ["draftId"])
    .index("by_org", ["orgKey"]),
  demo_builderProposalBoundaryPayloads: defineTable({
    buildName: v.string(),
    createdAt: v.number(),
    draftId: v.id("demo_builderProposalDrafts"),
    orgKey: v.string(),
    payload: v.any(),
    payloadVersion: v.number(),
    snapshotSummary: v.string(),
    status: v.string(),
    validationWarnings: v.array(v.string()),
  })
    .index("by_draft", ["draftId"])
    .index("by_org", ["orgKey"]),
  demo_timelineTemplates: defineTable({
    createdAt: v.number(),
    description: v.string(),
    isDefault: v.boolean(),
    seedVersion: v.number(),
    sortOrder: v.number(),
    summary: v.string(),
    templateKey: v.string(),
    title: v.string(),
    updatedAt: v.number(),
  }).index("by_template", ["templateKey"]),
  demo_timelineTemplateMilestones: defineTable({
    createdAt: v.number(),
    dependencyKeys: v.array(v.string()),
    durationDays: v.number(),
    icon: demoTimelineIconValidator,
    included: v.boolean(),
    milestoneKey: v.string(),
    name: v.string(),
    order: v.number(),
    percentageBps: v.number(),
    templateKey: v.string(),
    type: v.string(),
    updatedAt: v.number(),
  })
    .index("by_template", ["templateKey"])
    .index("by_template_and_order", ["templateKey", "order"])
    .index("by_milestone", ["templateKey", "milestoneKey"]),
  demo_timelineTemplateSubmilestones: defineTable({
    createdAt: v.number(),
    description: v.string(),
    durationDays: v.number(),
    milestoneKey: v.string(),
    name: v.string(),
    order: v.number(),
    percentageBps: v.number(),
    submilestoneKey: v.string(),
    templateKey: v.string(),
    updatedAt: v.number(),
  })
    .index("by_milestone", ["templateKey", "milestoneKey"])
    .index("by_milestone_and_order", ["templateKey", "milestoneKey", "order"]),
  demo_timelineTemplateMilestoneGuidance: defineTable({
    createdAt: v.number(),
    milestoneKey: v.string(),
    templateKey: v.string(),
    updatedAt: v.number(),
  })
    .index("by_template", ["templateKey"])
    .index("by_milestone", ["templateKey", "milestoneKey"]),
  demo_timelineTemplateMilestoneGuidanceItems: defineTable({
    createdAt: v.number(),
    guidanceId: v.id("demo_timelineTemplateMilestoneGuidance"),
    kind: demoSiteVisitGuidanceKindValidator,
    milestoneKey: v.string(),
    order: v.number(),
    templateKey: v.string(),
    text: v.string(),
    updatedAt: v.number(),
  })
    .index("by_guidance", ["guidanceId"])
    .index("by_milestone_kind", ["templateKey", "milestoneKey", "kind"]),
  demo_timelineDrawScenarios: defineTable({
    createdAt: v.number(),
    description: v.string(),
    isActive: v.boolean(),
    isDefault: v.boolean(),
    name: v.string(),
    scenarioKey: v.string(),
    seedVersion: v.number(),
    sortOrder: v.number(),
    templateKey: v.string(),
    updatedAt: v.number(),
  })
    .index("by_template", ["templateKey"])
    .index("by_scenario", ["templateKey", "scenarioKey"])
    .index("by_template_active", ["templateKey", "isActive"]),
  demo_timelineDrawScenarioDraws: defineTable({
    amountBps: v.number(),
    amountMode: v.literal("percentage"),
    createdAt: v.number(),
    drawKey: v.string(),
    label: v.string(),
    order: v.number(),
    reviewNote: v.string(),
    scenarioKey: v.string(),
    templateKey: v.string(),
    timingDay: v.number(),
    updatedAt: v.number(),
  })
    .index("by_scenario", ["templateKey", "scenarioKey"])
    .index("by_scenario_and_order", ["templateKey", "scenarioKey", "order"]),
  demo_timelineSettingsEvents: defineTable({
    actorPersona: v.string(),
    command: v.string(),
    createdAt: v.number(),
    entityKey: v.string(),
    entityType: v.string(),
    eventType: v.string(),
    newState: v.optional(v.string()),
    priorState: v.optional(v.string()),
    reason: v.optional(v.string()),
    warnings: v.array(v.string()),
  }).index("by_entity", ["entityType", "entityKey"]),
  demo_personas: defineTable({
    createdAt: v.number(),
    key: v.string(),
    label: v.string(),
    role: v.union(v.literal("builder"), v.literal("staff")),
    updatedAt: v.number(),
  }).index("by_key", ["key"]),
  demo_timelinePlans: defineTable({
    actorPersona: v.string(),
    address: v.string(),
    buildId: v.id("demo_builds"),
    borrowerCoPayBps: v.optional(v.number()),
    borrowerCoPayCents: v.optional(v.number()),
    buildName: v.string(),
    createdAt: v.number(),
    currentDay: v.number(),
    lenderDrawPolicyLimitCents: v.number(),
    adminNote: v.optional(v.string()),
    approvedAt: v.optional(v.number()),
    approvedByPersona: v.optional(v.string()),
    archivedAt: v.optional(v.number()),
    archivedReason: v.optional(v.string()),
    orgKey: v.string(),
    ownerPersona: v.optional(v.string()),
    progressValue: v.number(),
    proposalSlug: v.string(),
    rangeMax: v.number(),
    rangeMin: v.number(),
    routeState: v.object({
      activeCapitalSpikeId: v.optional(v.string()),
      activeDrawId: v.optional(v.string()),
      activeMilestoneKey: v.optional(v.string()),
      selectedPanelOpen: v.boolean(),
      straightLine: v.boolean(),
    }),
    source: v.literal("timeline_setup"),
    startingCashCents: v.number(),
    status: demoTimelinePlanStatusValidator,
    startDate: v.optional(v.number()),
    tag: v.literal("demo"),
    templateTitle: v.string(),
    submittedAt: v.optional(v.number()),
    submittedByPersona: v.optional(v.string()),
    submittedSnapshotId: v.optional(v.id("demo_timelinePlanSnapshots")),
    totalBudgetCents: v.number(),
    updatedAt: v.number(),
    workingCapitalLimitCents: v.number(),
  })
    .index("by_build", ["buildId"])
    .index("by_owner_updated", ["ownerPersona", "updatedAt"])
    .index("by_org_updated", ["orgKey", "updatedAt"])
    .index("by_proposal_slug", ["proposalSlug"])
    .index("by_status_updated", ["status", "updatedAt"]),
  demo_timelinePlanSnapshots: defineTable({
    address: v.string(),
    borrowerCoPayBps: v.optional(v.number()),
    borrowerCoPayCents: v.optional(v.number()),
    buildId: v.id("demo_builds"),
    buildName: v.string(),
    createdAt: v.number(),
    lenderDrawPolicyLimitCents: v.number(),
    orgKey: v.string(),
    ownerPersona: v.optional(v.string()),
    planId: v.id("demo_timelinePlans"),
    planName: v.string(),
    submittedAt: v.number(),
    submittedByPersona: v.string(),
    totalBudgetCents: v.number(),
    workingCapitalLimitCents: v.number(),
  })
    .index("by_build", ["buildId"])
    .index("by_plan", ["planId"])
    .index("by_org_submitted", ["orgKey", "submittedAt"]),
  demo_timelinePlanSnapshotMilestones: defineTable({
    budgetCents: v.number(),
    buildId: v.id("demo_builds"),
    createdAt: v.number(),
    dayEnd: v.number(),
    dayStart: v.number(),
    dependencyKeys: v.array(v.string()),
    drawAvailabilityCents: v.optional(v.number()),
    drawKey: v.optional(v.string()),
    durationDays: v.number(),
    evidenceState: v.string(),
    icon: demoTimelineIconValidator,
    included: v.boolean(),
    lane: v.optional(v.number()),
    markerLabel: v.optional(v.string()),
    milestoneKey: v.string(),
    name: v.string(),
    order: v.number(),
    orgKey: v.string(),
    planId: v.id("demo_timelinePlans"),
    policyState: v.string(),
    snapshotId: v.id("demo_timelinePlanSnapshots"),
    sourceTimelineMilestoneId: v.id("demo_timelineMilestones"),
    status: demoTimelineStatusValidator,
    submilestoneSnapshot: v.array(demoTimelineSubmilestoneSnapshotValidator),
    tone: demoTimelineToneValidator,
    type: v.string(),
    x: v.number(),
  })
    .index("by_plan", ["planId"])
    .index("by_snapshot", ["snapshotId"])
    .index("by_build", ["buildId", "sourceTimelineMilestoneId"]),
  demo_timelinePlanSnapshotDraws: defineTable({
    amountCents: v.number(),
    buildId: v.id("demo_builds"),
    createdAt: v.number(),
    customDate: v.boolean(),
    drawKey: v.string(),
    itemMilestoneKey: v.optional(v.string()),
    label: v.string(),
    order: v.number(),
    orgKey: v.string(),
    planId: v.id("demo_timelinePlans"),
    requestNote: v.optional(v.string()),
    requestReviewNote: v.optional(v.string()),
    requestStatus: demoTimelineDrawStatusValidator,
    reviewedAt: v.optional(v.string()),
    requestedAt: v.optional(v.string()),
    snapshotId: v.id("demo_timelinePlanSnapshots"),
    sourceTimelineDrawId: v.id("demo_timelineDraws"),
    x: v.number(),
  })
    .index("by_plan", ["planId"])
    .index("by_snapshot", ["snapshotId"])
    .index("by_build", ["buildId", "sourceTimelineDrawId"]),
  demo_timelinePlanSnapshotCapitalEvents: defineTable({
    amountCents: v.number(),
    buildId: v.id("demo_builds"),
    capitalEventKey: v.string(),
    createdAt: v.number(),
    eventKind: v.optional(demoTimelineCapitalEventKindValidator),
    label: v.string(),
    order: v.number(),
    orgKey: v.string(),
    planId: v.id("demo_timelinePlans"),
    snapshotId: v.id("demo_timelinePlanSnapshots"),
    sourceTimelineCapitalEventId: v.id("demo_timelineCapitalEvents"),
    x: v.number(),
  })
    .index("by_plan", ["planId"])
    .index("by_snapshot", ["snapshotId"])
    .index("by_build", ["buildId", "sourceTimelineCapitalEventId"]),
  demo_timelineMilestones: defineTable({
    budgetCents: v.number(),
    completedAt: v.optional(v.number()),
    completionClaim: v.optional(v.any()),
    createdAt: v.number(),
    dayEnd: v.number(),
    dayStart: v.number(),
    dependencyKeys: v.array(v.string()),
    drawAvailabilityCents: v.optional(v.number()),
    drawKey: v.optional(v.string()),
    durationDays: v.number(),
    evidenceState: v.string(),
    icon: demoTimelineIconValidator,
    included: v.boolean(),
    lane: v.optional(v.number()),
    markerLabel: v.optional(v.string()),
    milestoneKey: v.string(),
    name: v.string(),
    order: v.number(),
    planId: v.id("demo_timelinePlans"),
    policyState: v.string(),
    status: demoTimelineStatusValidator,
    submilestoneSnapshot: v.array(demoTimelineSubmilestoneSnapshotValidator),
    tone: demoTimelineToneValidator,
    type: v.string(),
    updatedAt: v.number(),
    x: v.number(),
  })
    .index("by_plan", ["planId"])
    .index("by_plan_and_key", ["planId", "milestoneKey"])
    .index("by_plan_and_order", ["planId", "order"]),
  demo_timelineMilestoneGuidanceItems: defineTable({
    createdAt: v.number(),
    kind: demoSiteVisitGuidanceKindValidator,
    milestoneKey: v.string(),
    order: v.number(),
    planId: v.id("demo_timelinePlans"),
    text: v.string(),
    updatedAt: v.number(),
  })
    .index("by_plan", ["planId"])
    .index("by_plan_milestone", ["planId", "milestoneKey"]),
  demo_timelineDraws: defineTable({
    amountCents: v.number(),
    createdAt: v.number(),
    customDate: v.boolean(),
    drawKey: v.string(),
    itemMilestoneKey: v.optional(v.string()),
    label: v.string(),
    order: v.number(),
    planId: v.id("demo_timelinePlans"),
    requestNote: v.optional(v.string()),
    requestReviewNote: v.optional(v.string()),
    requestStatus: demoTimelineDrawStatusValidator,
    reviewedAt: v.optional(v.string()),
    requestedAt: v.optional(v.string()),
    updatedAt: v.number(),
    x: v.number(),
  })
    .index("by_plan", ["planId"])
    .index("by_plan_and_key", ["planId", "drawKey"])
    .index("by_plan_and_order", ["planId", "order"]),
  demo_timelineCapitalEvents: defineTable({
    amountCents: v.number(),
    capitalEventKey: v.string(),
    createdAt: v.number(),
    eventKind: v.optional(demoTimelineCapitalEventKindValidator),
    label: v.string(),
    order: v.number(),
    planId: v.id("demo_timelinePlans"),
    updatedAt: v.number(),
    x: v.number(),
  })
    .index("by_plan", ["planId"])
    .index("by_plan_and_key", ["planId", "capitalEventKey"])
    .index("by_plan_and_order", ["planId", "order"]),
  demo_timelineModificationRequests: defineTable({
    actorPersona: v.string(),
    buildId: v.id("demo_builds"),
    createdAt: v.number(),
    milestoneKey: v.optional(v.string()),
    orgKey: v.string(),
    planId: v.id("demo_timelinePlans"),
    priorState: v.optional(v.any()),
    reason: v.optional(v.string()),
    requestedPayload: v.any(),
    requestType: demoTimelineModificationRequestTypeValidator,
    reviewedAt: v.optional(v.number()),
    reviewerPersona: v.optional(v.string()),
    reviewNote: v.optional(v.string()),
    status: demoTimelineModificationRequestStatusValidator,
    updatedAt: v.number(),
  })
    .index("by_plan", ["planId"])
    .index("by_plan_status", ["planId", "status"])
    .index("by_status_updated", ["status", "updatedAt"]),
  demo_timelineEvidenceAssets: defineTable({
    createdAt: v.number(),
    evidenceKey: v.string(),
    fileName: v.string(),
    label: v.string(),
    locationVerified: v.boolean(),
    milestoneKey: v.string(),
    mimeType: v.string(),
    planId: v.id("demo_timelinePlans"),
    sizeBytes: v.number(),
    source: v.string(),
    storageId: v.optional(v.string()),
    tag: v.string(),
    updatedAt: v.number(),
  })
    .index("by_plan", ["planId"])
    .index("by_plan_and_milestone", ["planId", "milestoneKey"])
    .index("by_plan_and_key", ["planId", "evidenceKey"]),
  demo_timelineSiteVisitLinks: defineTable({
    createdAt: v.number(),
    milestoneKey: v.string(),
    planId: v.id("demo_timelinePlans"),
    siteVisitId: v.id("demo_siteVisits"),
    status: demoTimelineSiteVisitStatusValidator,
    supersededAt: v.optional(v.number()),
    tokenExpiresAt: v.optional(v.number()),
    updatedAt: v.number(),
  })
    .index("by_plan", ["planId"])
    .index("by_plan_and_milestone", ["planId", "milestoneKey"])
    .index("by_site_visit", ["siteVisitId"]),
  demo_timelineEvents: defineTable({
    actorPersona: v.string(),
    command: v.string(),
    createdAt: v.number(),
    entityKey: v.optional(v.string()),
    entityType: v.string(),
    eventType: v.string(),
    newState: v.optional(v.string()),
    planId: v.id("demo_timelinePlans"),
    priorState: v.optional(v.string()),
    reason: v.optional(v.string()),
    requirementIds: v.array(v.string()),
    traceIds: v.array(v.string()),
    validationIds: v.array(v.string()),
    warnings: v.array(v.string()),
  })
    .index("by_plan", ["planId"])
    .index("by_plan_and_entity", ["planId", "entityType", "entityKey"]),
  demo_proposalShortLinks: defineTable({
    createdAt: v.number(),
    lastResolvedAt: v.optional(v.number()),
    planId: v.id("demo_timelinePlans"),
    slug: v.string(),
    status: v.union(
      v.literal("active"),
      v.literal("disabled"),
      v.literal("expired")
    ),
    updatedAt: v.number(),
  })
    .index("by_plan", ["planId"])
    .index("by_slug", ["slug"]),
  demo_backofficeProposalCards: defineTable({
    buildId: v.id("demo_builds"),
    column: v.string(),
    createdAt: v.number(),
    href: v.string(),
    planId: v.id("demo_timelinePlans"),
    priority: v.string(),
    proposalSlug: v.string(),
    sortAt: v.number(),
    status: v.string(),
    subtitle: v.string(),
    tag: v.literal("demo"),
    title: v.string(),
    totalBudgetCents: v.number(),
    updatedAt: v.number(),
  })
    .index("by_plan", ["planId"])
    .index("by_column_sort", ["column", "sortAt"])
    .index("by_updated", ["updatedAt"]),
  demo_capitalEvents: defineTable({
    amountCents: v.number(),
    buildId: v.id("demo_builds"),
    capitalEventKey: v.string(),
    eventDate: v.string(),
    label: v.string(),
    order: v.number(),
    orgKey: v.optional(v.string()),
    scenario: v.string(),
    sourceTimelineCapitalEventId: v.optional(
      v.id("demo_timelineCapitalEvents")
    ),
    updatedAt: v.number(),
  })
    .index("by_build_order", ["buildId", "order"])
    .index("by_build_and_source_timeline_capital_event", [
      "buildId",
      "sourceTimelineCapitalEventId",
    ])
    .index("by_scenario", ["scenario"]),
  demo_contractors: defineTable({
    orgKey: v.string(),
    scenario: v.string(),
    name: v.string(),
    kind: v.union(v.literal("company"), v.literal("individual")),
    hourlyRateCents: v.number(),
    city: v.string(),
    skills: v.array(v.string()),
    trades: v.array(v.string()),
    phone: v.optional(v.string()),
    email: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_org", ["orgKey"])
    .index("by_scenario", ["scenario"]),
  demo_buildContractors: defineTable({
    buildId: v.id("demo_builds"),
    contractorId: v.id("demo_contractors"),
    scenario: v.string(),
    role: v.string(),
    createdAt: v.number(),
  })
    .index("by_build", ["buildId"])
    .index("by_scenario", ["scenario"])
    .index("by_build_contractor", ["buildId", "contractorId"]),
  demo_milestoneContractors: defineTable({
    buildId: v.id("demo_builds"),
    milestoneKey: v.string(),
    contractorId: v.id("demo_contractors"),
    scenario: v.string(),
    role: v.string(),
    createdAt: v.number(),
  })
    .index("by_build", ["buildId"])
    .index("by_build_milestone", ["buildId", "milestoneKey"])
    .index("by_scenario", ["scenario"]),
  demo_buildNotes: defineTable({
    buildId: v.id("demo_builds"),
    scenario: v.string(),
    visibility: v.union(v.literal("internal"), v.literal("public")),
    body: v.string(),
    authorPersona: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_build", ["buildId"])
    .index("by_build_visibility", ["buildId", "visibility"])
    .index("by_scenario", ["scenario"]),
  demo_buildDocuments: defineTable({
    buildId: v.id("demo_builds"),
    scenario: v.string(),
    name: v.string(),
    kind: v.string(),
    sizeBytes: v.number(),
    uploaderPersona: v.string(),
    url: v.optional(v.string()),
    storageId: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_build", ["buildId"])
    .index("by_scenario", ["scenario"]),
  demo_milestoneSubmilestones: defineTable({
    buildId: v.id("demo_builds"),
    description: v.optional(v.string()),
    milestoneKey: v.string(),
    key: v.string(),
    name: v.string(),
    order: v.number(),
    status: v.union(
      v.literal("todo"),
      v.literal("in_progress"),
      v.literal("done")
    ),
    budgetCents: v.optional(v.number()),
    durationDays: v.optional(v.number()),
    scenario: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_build", ["buildId"])
    .index("by_build_milestone", ["buildId", "milestoneKey"])
    .index("by_scenario", ["scenario"]),
  brokerages: defineTable({
    workosOrganizationId: v.string(),
    legalName: v.string(),
    displayName: v.string(),
    principalBrokerEmail: v.optional(v.string()),
    principalBrokerWorkosUserId: v.optional(v.string()),
    status: v.union(v.literal("active"), v.literal("inactive")),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_workos_organization", ["workosOrganizationId"])
    .index("by_status", ["status"]),
  builderProfiles: defineTable({
    brokerageId: v.id("brokerages"),
    organizationId: v.string(),
    displayName: v.string(),
    legalName: v.optional(v.string()),
    status: v.union(v.literal("active"), v.literal("inactive")),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_brokerage", ["brokerageId"])
    .index("by_brokerage_and_status", ["brokerageId", "status"])
    .index("by_organization", ["organizationId"]),
  builderBrokerAssignments: defineTable({
    brokerageId: v.id("brokerages"),
    organizationId: v.string(),
    builderProfileId: v.id("builderProfiles"),
    assignedBrokerWorkosUserId: v.string(),
    status: v.union(
      v.literal("pending"),
      v.literal("active"),
      v.literal("transferred"),
      v.literal("failed")
    ),
    effectiveAt: v.number(),
    updatedAt: v.number(),
    createdAt: v.number(),
  })
    .index("by_builderProfileId_and_createdAt", [
      "builderProfileId",
      "createdAt",
    ])
    .index("by_builderProfileId_and_status_and_effectiveAt", [
      "builderProfileId",
      "status",
      "effectiveAt",
    ])
    .index("by_brokerageId_and_assignedBrokerWorkosUserId", [
      "brokerageId",
      "assignedBrokerWorkosUserId",
    ]),
  builderAccountLinks: defineTable({
    brokerageId: v.id("brokerages"),
    builderProfileId: v.id("builderProfiles"),
    workosUserId: v.string(),
    assignedEmail: v.optional(v.string()),
    workosMembershipId: v.optional(v.string()),
    role: v.union(v.literal("owner"), v.literal("staff")),
    status: v.union(v.literal("active"), v.literal("inactive")),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_builder", ["builderProfileId"])
    .index("by_brokerageId_and_updatedAt", ["brokerageId", "updatedAt"])
    .index("by_builder_assigned_email", ["builderProfileId", "assignedEmail"])
    .index("by_assigned_email", ["assignedEmail"])
    .index("by_user", ["workosUserId"])
    .index("by_builder_user", ["builderProfileId", "workosUserId"]),
  builderStaffPermissionGrants: defineTable({
    brokerageId: v.id("brokerages"),
    organizationId: v.string(),
    builderProfileId: v.id("builderProfiles"),
    builderAccountLinkId: v.id("builderAccountLinks"),
    workosUserId: v.string(),
    scope: builderStaffPermissionScopeValidator,
    proposalId: v.optional(v.id("buildProposals")),
    buildId: v.optional(v.id("activeBuilds")),
    resourceType: builderStaffPermissionResourceValidator,
    canCreate: v.boolean(),
    canView: v.boolean(),
    canUpdate: v.boolean(),
    canDelete: v.boolean(),
    createdByWorkosUserId: v.string(),
    updatedByWorkosUserId: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_builder", ["builderProfileId"])
    .index("by_link", ["builderAccountLinkId"])
    .index("by_user", ["workosUserId"])
    .index("by_proposal_link_resource", [
      "proposalId",
      "builderAccountLinkId",
      "resourceType",
    ])
    .index("by_build_link_resource", [
      "buildId",
      "builderAccountLinkId",
      "resourceType",
    ]),
  builderOnboardingDismissals: defineTable({
    workosUserId: v.string(),
    organizationId: v.string(),
    dismissedAt: v.number(),
  }).index("by_user_org", ["workosUserId", "organizationId"]),
  contractorProfiles: defineTable({
    brokerageId: v.id("brokerages"),
    organizationId: v.string(),
    name: v.string(),
    kind: v.optional(contractorKindValidator),
    city: v.optional(v.string()),
    email: v.optional(v.string()),
    normalizedEmail: v.optional(v.string()),
    phone: v.optional(v.string()),
    website: v.optional(v.string()),
    description: v.optional(v.string()),
    trades: v.array(v.string()),
    defaultPayRateCents: v.optional(v.number()),
    defaultPayRateUnit: v.optional(contractorPayRateUnitValidator),
    serviceAreaPrimaryCity: v.optional(v.string()),
    serviceAreaRadiusKm: v.optional(v.number()),
    serviceAreaPostalPrefixes: v.optional(v.array(v.string())),
    serviceAreaNotes: v.optional(v.string()),
    complianceNotes: v.optional(v.string()),
    accountWorkosUserId: v.optional(v.string()),
    onboardingStatus: v.optional(contractorOnboardingStatusValidator),
    source: v.optional(contractorProfileSourceValidator),
    status: v.union(v.literal("active"), v.literal("inactive")),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_brokerage", ["brokerageId"])
    .index("by_account_user", ["accountWorkosUserId"])
    .index("by_organizationId_and_updatedAt", ["organizationId", "updatedAt"])
    .index("by_brokerage_normalized_email", ["brokerageId", "normalizedEmail"]),
  contractorCapabilities: defineTable({
    brokerageId: v.id("brokerages"),
    organizationId: v.string(),
    contractorId: v.id("contractorProfiles"),
    capabilityKey: v.string(),
    label: v.string(),
    trade: v.optional(v.string()),
    milestoneArchetypeKey: v.optional(v.string()),
    notes: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_contractor", ["contractorId"])
    .index("by_brokerage_capability", ["brokerageId", "capabilityKey"])
    .index("by_brokerage_archetype", ["brokerageId", "milestoneArchetypeKey"]),
  contractorEquipment: defineTable({
    brokerageId: v.id("brokerages"),
    organizationId: v.string(),
    contractorId: v.id("contractorProfiles"),
    equipmentKey: v.string(),
    name: v.string(),
    quantity: v.number(),
    notes: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_contractor", ["contractorId"])
    .index("by_brokerage_equipment", ["brokerageId", "equipmentKey"]),
  contractorAvailabilityWindows: defineTable({
    brokerageId: v.id("brokerages"),
    organizationId: v.string(),
    contractorId: v.id("contractorProfiles"),
    dayOfWeek: v.number(),
    startMinute: v.number(),
    endMinute: v.number(),
    timezone: v.string(),
    effectiveStartDate: v.optional(v.string()),
    effectiveEndDate: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_contractor", ["contractorId"])
    .index("by_brokerage_weekday", ["brokerageId", "dayOfWeek"]),
  contractorIdentityLinks: defineTable({
    organizationId: v.string(),
    primaryBrokerageId: v.id("brokerages"),
    primaryContractorId: v.id("contractorProfiles"),
    primaryOrganizationId: v.string(),
    linkedBrokerageId: v.id("brokerages"),
    linkedContractorId: v.id("contractorProfiles"),
    linkedOrganizationId: v.string(),
    status: v.union(
      v.literal("suggested"),
      v.literal("verified"),
      v.literal("rejected")
    ),
    confidence: v.optional(v.number()),
    reason: v.optional(v.string()),
    createdByWorkosUserId: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_primary", ["primaryContractorId"])
    .index("by_linked", ["linkedContractorId"])
    .index("by_primary_linked", ["primaryContractorId", "linkedContractorId"])
    .index("by_primary_brokerage", ["primaryBrokerageId"]),
  contractorProfileReviewRequests: defineTable({
    brokerageId: v.id("brokerages"),
    organizationId: v.string(),
    contractorId: v.id("contractorProfiles"),
    reviewType: contractorProfileReviewTypeValidator,
    status: contractorProfileReviewStatusValidator,
    requestedFields: v.any(),
    priorState: v.optional(v.any()),
    proposedState: v.optional(v.any()),
    reason: v.optional(v.string()),
    requestedByWorkosUserId: v.string(),
    requestedByRole: v.string(),
    reviewerWorkosUserId: v.optional(v.string()),
    reviewNote: v.optional(v.string()),
    reviewedAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_contractor", ["contractorId"])
    .index("by_contractor_status", ["contractorId", "status"])
    .index("by_brokerage_status", ["brokerageId", "status"]),
  // Self-service onboarding review state (PRD §7.1, §7.2, §13.3, §14.1). One
  // row per self-service onboarding attempt, tracked across the full review
  // state machine independently of the coarse account-link status on the
  // profile. The backoffice review queue reads rows in
  // pending_backoffice_review / changes_requested.
  contractorOnboardingReviews: defineTable({
    brokerageId: v.id("brokerages"),
    organizationId: v.string(),
    contractorId: v.id("contractorProfiles"),
    // WorkOS user that initiated self-service onboarding as a `member`. Linked
    // to the canonical profile on approval (PRD §7.1 step 11).
    applicantWorkosUserId: v.string(),
    applicantNormalizedEmail: v.optional(v.string()),
    status: contractorOnboardingReviewStatusValidator,
    // Draft payload captures the onboarding form fields (trades, capabilities,
    // rates, service area, availability, equipment, compliance) (PRD §7.1.3).
    draftFields: v.optional(v.any()),
    submissionNote: v.optional(v.string()),
    lastOutcome: v.optional(contractorOnboardingReviewOutcomeValidator),
    reviewDecisionNote: v.optional(v.string()),
    reviewerWorkosUserId: v.optional(v.string()),
    submittedAt: v.optional(v.number()),
    reviewedAt: v.optional(v.number()),
    mergedIntoContractorId: v.optional(v.id("contractorProfiles")),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_contractor", ["contractorId"])
    .index("by_applicant", ["applicantWorkosUserId"])
    .index("by_brokerage_status", ["brokerageId", "status"])
    .index("by_status", ["status"]),
  // Invite/claim intent for invited known contractors (PRD §7.3, §7.5, §13.4,
  // §14.2). WorkOS owns the organization invitation + role projection; this
  // table stores app-level claim intent + confirmation state only.
  contractorInviteClaims: defineTable({
    brokerageId: v.id("brokerages"),
    organizationId: v.string(),
    contractorId: v.id("contractorProfiles"),
    invitedNormalizedEmail: v.optional(v.string()),
    inviterWorkosUserId: v.string(),
    // WorkOS organization invitation id returned by the Management API.
    workosInvitationId: v.optional(v.string()),
    state: contractorInviteClaimStateValidator,
    // The WorkOS user that accepted the organization invitation. Populated
    // after AuthKit acceptance, before contractor confirmation (PRD §7.3.6).
    acceptedWorkosUserId: v.optional(v.string()),
    confirmedAt: v.optional(v.number()),
    expiresAt: v.optional(v.number()),
    revokedAt: v.optional(v.number()),
    revokedByWorkosUserId: v.optional(v.string()),
    revokeReason: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_contractor", ["contractorId"])
    .index("by_contractor_state", ["contractorId", "state"])
    .index("by_brokerage_state", ["brokerageId", "state"])
    .index("by_accepted_user", ["acceptedWorkosUserId"])
    .index("by_invited_email", ["invitedNormalizedEmail"]),
  // Contractor-submitted supporting evidence (PRD §8.7, §13.5, §14.4).
  // Supporting context only — must never auto-satisfy completion, draw, or
  // approval requirements (PRD §3.14).
  contractorEvidence: defineTable({
    brokerageId: v.id("brokerages"),
    organizationId: v.string(),
    contractorId: v.id("contractorProfiles"),
    // Optional explicit assignment pointer (PRD §8.7 required metadata).
    proposalAssignmentId: v.optional(
      v.id("proposalMilestoneContractorAssignments")
    ),
    buildAssignmentId: v.optional(v.id("milestoneContractorAssignments")),
    targetType: v.union(v.literal("proposal"), v.literal("build")),
    proposalId: v.optional(v.id("buildProposals")),
    buildId: v.optional(v.id("activeBuilds")),
    milestoneKey: v.string(),
    submilestoneKey: v.optional(v.string()),
    caption: v.string(),
    storageId: v.id("_storage"),
    fileName: v.string(),
    mimeType: v.string(),
    sizeBytes: v.number(),
    tags: v.optional(v.array(v.string())),
    takenAt: v.optional(v.number()),
    linkedReminderEventId: v.optional(v.string()),
    source: v.literal("contractor_submitted"),
    sourceActorRole: v.literal("contractor"),
    feedbackState: contractorEvidenceFeedbackStateValidator,
    feedbackNote: v.optional(v.string()),
    feedbackByWorkosUserId: v.optional(v.string()),
    feedbackAt: v.optional(v.number()),
    uploadedAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_contractor", ["contractorId"])
    .index("by_contractor_uploaded", ["contractorId", "uploadedAt"])
    .index("by_proposal", ["proposalId"])
    .index("by_build", ["buildId"])
    .index("by_proposal_milestone", ["proposalId", "milestoneKey"])
    .index("by_build_milestone", ["buildId", "milestoneKey"])
    .index("by_assignment", ["buildAssignmentId"])
    .index("by_feedback", ["feedbackState"]),
  // Assignment acknowledgements + scope issues (PRD §13.6, §14.3). One row per
  // assignment per acknowledgement kind, so acknowledgement, schedule, and
  // scope-issue state stay auditable without overwriting prior transitions.
  contractorAcknowledgements: defineTable({
    brokerageId: v.id("brokerages"),
    organizationId: v.string(),
    contractorId: v.id("contractorProfiles"),
    assignmentType: v.union(v.literal("proposal"), v.literal("build")),
    proposalAssignmentId: v.optional(
      v.id("proposalMilestoneContractorAssignments")
    ),
    buildAssignmentId: v.optional(v.id("milestoneContractorAssignments")),
    kind: v.union(v.literal("assignment"), v.literal("schedule")),
    state: contractorAssignmentAckStateValidator,
    acknowledgedAt: v.optional(v.number()),
    updatedAt: v.number(),
    createdAt: v.number(),
  })
    .index("by_contractor", ["contractorId"])
    .index("by_assignment_type", ["assignmentType", "proposalAssignmentId"])
    .index("by_build_assignment", ["buildAssignmentId"])
    .index("by_contractor_kind_state", ["contractorId", "kind", "state"]),
  contractorScopeIssues: defineTable({
    brokerageId: v.id("brokerages"),
    organizationId: v.string(),
    contractorId: v.id("contractorProfiles"),
    assignmentType: v.union(v.literal("proposal"), v.literal("build")),
    proposalAssignmentId: v.optional(
      v.id("proposalMilestoneContractorAssignments")
    ),
    buildAssignmentId: v.optional(v.id("milestoneContractorAssignments")),
    proposalId: v.optional(v.id("buildProposals")),
    buildId: v.optional(v.id("activeBuilds")),
    milestoneKey: v.string(),
    submilestoneKey: v.optional(v.string()),
    kind: contractorScopeIssueKindValidator,
    status: contractorScopeIssueStatusValidator,
    summary: v.string(),
    detail: v.optional(v.string()),
    raisedByWorkosUserId: v.string(),
    raisedByRole: v.string(),
    resolvedByWorkosUserId: v.optional(v.string()),
    resolutionNote: v.optional(v.string()),
    resolvedAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_contractor", ["contractorId"])
    .index("by_status", ["status"])
    .index("by_brokerage_status", ["brokerageId", "status"])
    .index("by_proposal", ["proposalId"])
    .index("by_build", ["buildId"]),
  // Contractor aliases / merged identity records (PRD §6.1.4, §13.2, §6.3).
  // Preserves builder-created identity labels that may differ from the
  // canonical profile, so merging never orphans assignment history.
  contractorAliases: defineTable({
    brokerageId: v.id("brokerages"),
    organizationId: v.string(),
    canonicalContractorId: v.id("contractorProfiles"),
    mergedContractorId: v.optional(v.id("contractorProfiles")),
    originalName: v.string(),
    originalEmail: v.optional(v.string()),
    originalPhone: v.optional(v.string()),
    originalTrade: v.optional(v.string()),
    sourceBuilderProfileId: v.optional(v.id("builderProfiles")),
    sourceProposalId: v.optional(v.id("buildProposals")),
    sourceBuildId: v.optional(v.id("activeBuilds")),
    createdByWorkosUserId: v.string(),
    mergeStatus: v.union(
      v.literal("suggested"),
      v.literal("resolved"),
      v.literal("rejected")
    ),
    mergedByWorkosUserId: v.optional(v.string()),
    mergedAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_canonical", ["canonicalContractorId"])
    .index("by_merged", ["mergedContractorId"])
    .index("by_brokerage_email", ["brokerageId", "originalEmail"]),
  // Narrow contractor notifications (PRD §10, §13.8). No chat/threading.
  contractorNotifications: defineTable({
    brokerageId: v.id("brokerages"),
    organizationId: v.string(),
    contractorId: v.id("contractorProfiles"),
    kind: contractorNotificationKindValidator,
    channel: contractorNotificationChannelValidator,
    title: v.string(),
    body: v.optional(v.string()),
    // Optional context pointers so the notification can deep-link into the
    // relevant workspace surface.
    proposalId: v.optional(v.id("buildProposals")),
    buildId: v.optional(v.id("activeBuilds")),
    milestoneKey: v.optional(v.string()),
    evidenceId: v.optional(v.id("contractorEvidence")),
    scopeIssueId: v.optional(v.id("contractorScopeIssues")),
    readAt: v.optional(v.number()),
    createdAt: v.number(),
  })
    .index("by_contractor", ["contractorId"])
    .index("by_contractor_read", ["contractorId", "readAt"])
    .index("by_contractor_created", ["contractorId", "createdAt"]),
  milestoneArchetypes: defineTable({
    brokerageId: v.id("brokerages"),
    organizationId: v.string(),
    key: v.string(),
    name: v.string(),
    description: v.optional(v.string()),
    sortOrder: v.number(),
    status: v.union(v.literal("active"), v.literal("inactive")),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_brokerage_key", ["brokerageId", "key"]),
  proposalTemplates: defineTable({
    brokerageId: v.id("brokerages"),
    organizationId: v.string(),
    templateKey: v.string(),
    title: v.string(),
    summary: v.string(),
    isDefault: v.boolean(),
    status: v.union(v.literal("active"), v.literal("inactive")),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_brokerage", ["brokerageId"])
    .index("by_brokerage_template", ["brokerageId", "templateKey"]),
  proposalTemplateMilestones: defineTable({
    brokerageId: v.id("brokerages"),
    organizationId: v.string(),
    templateId: v.id("proposalTemplates"),
    key: v.string(),
    name: v.string(),
    order: v.number(),
    percentageBps: v.number(),
    durationDays: v.number(),
    dependencyKeys: v.array(v.string()),
    archetypeKey: v.optional(v.string()),
    siteVisitGuidance: v.optional(siteVisitGuidanceValidator),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_template", ["templateId"])
    .index("by_template_order", ["templateId", "order"]),
  proposalTemplateSubmilestones: defineTable({
    brokerageId: v.id("brokerages"),
    organizationId: v.string(),
    templateMilestoneId: v.id("proposalTemplateMilestones"),
    milestoneKey: v.string(),
    key: v.string(),
    name: v.string(),
    order: v.number(),
    percentageBps: v.number(),
    durationDays: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_template_milestone", ["templateMilestoneId"])
    .index("by_milestone", ["organizationId", "milestoneKey"]),
  drawScheduleScenarios: defineTable({
    brokerageId: v.id("brokerages"),
    organizationId: v.string(),
    templateId: v.id("proposalTemplates"),
    scenarioKey: v.string(),
    description: v.optional(v.string()),
    isActive: v.optional(v.boolean()),
    name: v.string(),
    isDefault: v.boolean(),
    sortOrder: v.optional(v.number()),
    status: v.union(v.literal("active"), v.literal("inactive")),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_template", ["templateId"])
    .index("by_template_scenario", ["templateId", "scenarioKey"]),
  drawScheduleScenarioRows: defineTable({
    brokerageId: v.id("brokerages"),
    organizationId: v.string(),
    templateId: v.id("proposalTemplates"),
    scenarioKey: v.string(),
    drawKey: v.string(),
    label: v.string(),
    order: v.number(),
    amountBps: v.number(),
    reviewNote: v.string(),
    timingDay: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_template_scenario_order", ["templateId", "scenarioKey", "order"])
    .index("by_template_scenario_key", [
      "templateId",
      "scenarioKey",
      "drawKey",
    ]),
  workflowRules: defineTable({
    brokerageId: v.id("brokerages"),
    organizationId: v.string(),
    ruleKey: v.string(),
    version: v.number(),
    status: v.union(v.literal("active"), v.literal("inactive")),
    requirePermitForApproval: v.boolean(),
    allowPermitWaiverByRoles: v.array(v.string()),
    proposalStates: v.array(v.string()),
    settings: v.any(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_brokerage", ["brokerageId"])
    .index("by_brokerage_rule", ["brokerageId", "ruleKey"])
    .index("by_brokerage_status", ["brokerageId", "status"]),
  workflowRuleSnapshots: defineTable({
    brokerageId: v.id("brokerages"),
    organizationId: v.string(),
    proposalId: v.id("buildProposals"),
    workflowRuleId: v.id("workflowRules"),
    ruleKey: v.string(),
    version: v.number(),
    requirePermitForApproval: v.boolean(),
    allowPermitWaiverByRoles: v.array(v.string()),
    proposalStates: v.array(v.string()),
    settings: v.any(),
    createdAt: v.number(),
  })
    .index("by_proposal", ["proposalId"])
    .index("by_rule", ["workflowRuleId"]),
  buildProposals: defineTable({
    brokerageId: v.id("brokerages"),
    organizationId: v.string(),
    builderProfileId: v.optional(v.id("builderProfiles")),
    assignedBrokerWorkosUserId: v.optional(v.string()),
    buildName: v.string(),
    location: v.string(),
    locationLatitude: v.optional(v.number()),
    locationLongitude: v.optional(v.number()),
    locationPlaceId: v.optional(v.string()),
    status: productionProposalStatusValidator,
    reviewOutcome: productionReviewOutcomeValidator,
    totalBudgetCents: v.number(),
    borrowerStartingCashCents: v.optional(v.number()),
    // Deprecated migration source. Do not use as a revolving spending limit.
    borrowerWorkingCapitalLimitCents: v.number(),
    lenderDrawPolicyLimitCents: v.number(),
    borrowerCoPayBps: v.number(),
    borrowerCoPayCents: v.optional(v.number()),
    interestAnnualBps: v.optional(v.number()),
    timelineCurrentDay: v.optional(v.number()),
    timelineProgressValue: v.optional(v.number()),
    timelineRangeMax: v.optional(v.number()),
    timelineRangeMin: v.optional(v.number()),
    timelineRouteState: v.optional(v.any()),
    timelineMinimumCashReserveCents: v.optional(v.number()),
    timelineStartingCashCents: v.optional(v.number()),
    selectedPlan: v.optional(productionSelectedPlanValidator),
    proposedStartDate: v.optional(v.string()),
    templateId: v.optional(v.id("proposalTemplates")),
    workflowRuleSnapshotId: v.optional(v.id("workflowRuleSnapshots")),
    activeBuildId: v.optional(v.id("activeBuilds")),
    submittedAt: v.optional(v.number()),
    approvedAt: v.optional(v.number()),
    closedAt: v.optional(v.number()),
    createdByWorkosUserId: v.string(),
    updatedByWorkosUserId: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_brokerage", ["brokerageId"])
    .index("by_brokerage_status", ["brokerageId", "status"])
    .index("by_brokerage_status_builder", [
      "brokerageId",
      "status",
      "builderProfileId",
    ])
    .index("by_builder", ["builderProfileId"])
    .index("by_active_build", ["activeBuildId"]),
  proposalDocuments: defineTable({
    brokerageId: v.id("brokerages"),
    organizationId: v.string(),
    proposalId: v.id("buildProposals"),
    documentType: productionDocumentTypeValidator,
    status: productionDocumentStatusValidator,
    fileName: v.string(),
    mimeType: v.string(),
    sizeBytes: v.number(),
    storageId: v.optional(v.id("_storage")),
    // Permits are contractor-visible by default (PRD §3.17, §15). Non-permit
    // documents require an explicit contractor-visible ACL flag (PRD §3.34).
    contractorVisible: v.optional(v.boolean()),
    uploadedByWorkosUserId: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_proposal", ["proposalId"])
    .index("by_proposal_type", ["proposalId", "documentType"])
    .index("by_proposal_contractor_visible", [
      "proposalId",
      "contractorVisible",
    ]),
  documentWaivers: defineTable({
    brokerageId: v.id("brokerages"),
    organizationId: v.string(),
    proposalId: v.id("buildProposals"),
    documentType: productionDocumentTypeValidator,
    reason: v.string(),
    grantedByWorkosUserId: v.string(),
    grantedByRole: v.string(),
    createdAt: v.number(),
  })
    .index("by_proposal", ["proposalId"])
    .index("by_proposal_type", ["proposalId", "documentType"]),
  proposalMilestones: defineTable({
    brokerageId: v.id("brokerages"),
    organizationId: v.string(),
    proposalId: v.id("buildProposals"),
    key: v.string(),
    name: v.string(),
    order: v.number(),
    budgetCents: v.number(),
    drawAvailabilityCents: v.number(),
    dayStart: v.number(),
    dayEnd: v.number(),
    durationDays: v.number(),
    dependencyKeys: v.array(v.string()),
    completionClaim: v.optional(v.any()),
    completionReview: v.optional(v.any()),
    evidenceState: v.optional(v.string()),
    icon: v.optional(v.string()),
    lane: v.optional(v.number()),
    markerLabel: v.optional(v.string()),
    policyState: v.optional(v.string()),
    siteVisitGuidance: v.optional(siteVisitGuidanceValidator),
    timelineStatus: v.optional(v.string()),
    tone: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_proposal", ["proposalId"])
    .index("by_proposal_key", ["proposalId", "key"])
    .index("by_proposal_order", ["proposalId", "order"]),
  proposalSubmilestones: defineTable({
    brokerageId: v.id("brokerages"),
    organizationId: v.string(),
    proposalId: v.id("buildProposals"),
    proposalMilestoneId: v.id("proposalMilestones"),
    milestoneKey: v.string(),
    key: v.string(),
    name: v.string(),
    order: v.number(),
    budgetCents: v.optional(v.number()),
    startDay: v.optional(v.number()),
    durationDays: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_proposal", ["proposalId"])
    .index("by_milestone", ["proposalMilestoneId"]),
  proposalContractorAssignments: defineTable({
    brokerageId: v.id("brokerages"),
    organizationId: v.string(),
    proposalId: v.id("buildProposals"),
    contractorId: v.id("contractorProfiles"),
    role: v.string(),
    status: v.union(v.literal("active"), v.literal("inactive")),
    startDay: v.optional(v.number()),
    endDay: v.optional(v.number()),
    agreedRateCents: v.optional(v.number()),
    agreedRateUnit: v.optional(contractorPayRateUnitValidator),
    notes: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_proposal", ["proposalId"])
    .index("by_proposal_contractor", ["proposalId", "contractorId"])
    .index("by_contractor", ["contractorId"])
    .index("by_brokerage", ["brokerageId"]),
  proposalMilestoneContractorAssignments: defineTable({
    brokerageId: v.id("brokerages"),
    organizationId: v.string(),
    proposalId: v.id("buildProposals"),
    contractorId: v.id("contractorProfiles"),
    proposalContractorAssignmentId: v.id("proposalContractorAssignments"),
    proposalMilestoneId: v.id("proposalMilestones"),
    milestoneKey: v.string(),
    proposalSubmilestoneId: v.optional(v.id("proposalSubmilestones")),
    submilestoneKey: v.optional(v.string()),
    role: v.string(),
    status: milestoneContractorAssignmentStatusValidator,
    agreedRateCents: v.optional(v.number()),
    agreedRateUnit: v.optional(contractorPayRateUnitValidator),
    estimatedHours: v.optional(v.number()),
    estimatedCostCents: v.optional(v.number()),
    note: v.optional(v.string()),
    assignedByWorkosUserId: v.string(),
    assignedAt: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_proposal", ["proposalId"])
    .index("by_proposal_milestone", ["proposalId", "milestoneKey"])
    .index("by_contractor", ["contractorId"])
    .index("by_contractor_proposal", ["contractorId", "proposalId"])
    .index("by_submilestone", [
      "proposalId",
      "milestoneKey",
      "submilestoneKey",
    ]),
  proposalCostItems: defineTable({
    brokerageId: v.id("brokerages"),
    organizationId: v.string(),
    proposalId: v.id("buildProposals"),
    proposalMilestoneId: v.id("proposalMilestones"),
    milestoneKey: v.string(),
    itemKey: v.string(),
    itemType: productionCostItemTypeValidator,
    title: v.string(),
    description: v.optional(v.string()),
    costCents: v.number(),
    quantity: v.number(),
    budgetTreatment: v.optional(productionCostItemBudgetTreatmentValidator),
    budgetSubmilestoneKey: v.optional(v.string()),
    supplier: v.optional(v.string()),
    relevantSubmilestoneKeys: v.array(v.string()),
    createdByWorkosUserId: v.string(),
    updatedByWorkosUserId: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_proposal", ["proposalId"])
    .index("by_proposal_key", ["proposalId", "itemKey"])
    .index("by_proposal_milestone", ["proposalId", "milestoneKey"])
    .index("by_milestone", ["proposalMilestoneId"]),
  proposalDrawScheduleRows: defineTable({
    brokerageId: v.id("brokerages"),
    organizationId: v.string(),
    proposalId: v.id("buildProposals"),
    proposalMilestoneId: v.optional(v.id("proposalMilestones")),
    milestoneKey: v.optional(v.string()),
    drawKey: v.string(),
    label: v.string(),
    order: v.number(),
    timingDay: v.number(),
    amountCents: v.number(),
    source: v.union(v.literal("milestone"), v.literal("manual")),
    customDate: v.optional(v.boolean()),
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
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_proposal", ["proposalId"])
    .index("by_proposal_order", ["proposalId", "order"])
    .index("by_proposal_key", ["proposalId", "drawKey"]),
  proposalCapitalEvents: defineTable({
    brokerageId: v.id("brokerages"),
    organizationId: v.string(),
    proposalId: v.id("buildProposals"),
    capitalEventKey: v.string(),
    label: v.string(),
    amountCents: v.number(),
    eventKind: v.union(
      v.literal("cost"),
      v.literal("cashInfusion"),
      v.literal("homeEquityTakeout")
    ),
    interestAnnualBps: v.optional(v.number()),
    order: v.number(),
    x: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_proposal", ["proposalId"])
    .index("by_proposal_key", ["proposalId", "capitalEventKey"])
    .index("by_proposal_order", ["proposalId", "order"]),
  proposalEvidenceAssets: defineTable({
    brokerageId: v.id("brokerages"),
    organizationId: v.string(),
    proposalId: v.id("buildProposals"),
    evidenceKey: v.string(),
    milestoneKey: v.string(),
    fileName: v.string(),
    label: v.string(),
    mimeType: v.string(),
    sizeBytes: v.number(),
    storageId: v.optional(v.id("_storage")),
    tag: v.string(),
    submilestoneKey: v.optional(v.string()),
    contractorIds: v.optional(v.array(v.id("contractorProfiles"))),
    locationVerified: v.boolean(),
    source: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_proposal", ["proposalId"])
    .index("by_proposal_key", ["proposalId", "evidenceKey"])
    .index("by_proposal_milestone", ["proposalId", "milestoneKey"]),
  proposalTimelineModificationRequests: defineTable({
    brokerageId: v.id("brokerages"),
    organizationId: v.string(),
    proposalId: v.id("buildProposals"),
    milestoneKey: v.optional(v.string()),
    priorState: v.optional(v.any()),
    reason: v.optional(v.string()),
    requestedPayload: v.any(),
    requestType: v.union(
      v.literal("createMilestone"),
      v.literal("deleteMilestone"),
      v.literal("updateMilestoneBudget")
    ),
    reviewNote: v.optional(v.string()),
    reviewedAt: v.optional(v.number()),
    reviewerWorkosUserId: v.optional(v.string()),
    requestedByWorkosUserId: v.string(),
    status: v.union(
      v.literal("requested"),
      v.literal("approved"),
      v.literal("rejected")
    ),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_proposal", ["proposalId"])
    .index("by_proposal_status", ["proposalId", "status"]),
  proposalCollaborationSessions: defineTable({
    brokerageId: v.id("brokerages"),
    organizationId: v.string(),
    proposalId: v.id("buildProposals"),
    status: proposalCollaborationSessionStatusValidator,
    initiatorSide: proposalCollaborationInitiatorSideValidator,
    shareTokenHash: v.string(),
    startedByWorkosUserId: v.string(),
    startedByRoles: v.array(v.string()),
    assignedBuilderProfileId: v.optional(v.id("builderProfiles")),
    assignedBuilderWorkosUserId: v.optional(v.string()),
    stoppedAt: v.optional(v.number()),
    stoppedByWorkosUserId: v.optional(v.string()),
    stopReason: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_brokerage_status", ["brokerageId", "status"])
    .index("by_brokerage_proposal", ["brokerageId", "proposalId"])
    .index("by_organization_proposal", ["organizationId", "proposalId"])
    .index("by_proposal", ["proposalId"])
    .index("by_proposal_status", ["proposalId", "status"])
    .index("by_share_token_hash", ["shareTokenHash"]),
  proposalClaimLinks: defineTable({
    brokerageId: v.id("brokerages"),
    organizationId: v.string(),
    proposalId: v.id("buildProposals"),
    shareTokenHash: v.string(),
    status: v.union(
      v.literal("active"),
      v.literal("claimed"),
      v.literal("revoked")
    ),
    createdByWorkosUserId: v.string(),
    claimedByWorkosUserId: v.optional(v.string()),
    claimedBuilderProfileId: v.optional(v.id("builderProfiles")),
    claimedAt: v.optional(v.number()),
    expiresAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_share_token_hash", ["shareTokenHash"])
    .index("by_proposal_status", ["proposalId", "status"])
    .index("by_brokerage_status", ["brokerageId", "status"]),
  proposalCollaborationParticipants: defineTable({
    brokerageId: v.id("brokerages"),
    organizationId: v.string(),
    proposalId: v.id("buildProposals"),
    sessionId: v.id("proposalCollaborationSessions"),
    permission: proposalCollaborationPermissionValidator,
    status: proposalCollaborationParticipantStatusValidator,
    source: proposalCollaborationParticipantSourceValidator,
    displayName: v.optional(v.string()),
    inviteEmail: v.optional(v.string()),
    invitedByWorkosUserId: v.optional(v.string()),
    lastJoinedAt: v.optional(v.number()),
    roleSlugs: v.array(v.string()),
    workosUserId: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_brokerage_proposal", ["brokerageId", "proposalId"])
    .index("by_organization_proposal", ["organizationId", "proposalId"])
    .index("by_proposal", ["proposalId"])
    .index("by_session", ["sessionId"])
    .index("by_session_status", ["sessionId", "status"])
    .index("by_session_user", ["sessionId", "workosUserId"])
    .index("by_session_invite_email", ["sessionId", "inviteEmail"])
    .index("by_user", ["workosUserId"]),
  proposalKanbanCards: defineTable({
    brokerageId: v.id("brokerages"),
    organizationId: v.string(),
    proposalId: v.id("buildProposals"),
    column: productionProposalStatusValidator,
    title: v.string(),
    subtitle: v.string(),
    builderName: v.string(),
    totalBudgetCents: v.number(),
    sortAt: v.number(),
    href: v.string(),
    updatedAt: v.number(),
  })
    .index("by_proposal", ["proposalId"])
    .index("by_brokerage_column_sort", ["brokerageId", "column", "sortAt"]),
  proposalEvents: defineTable({
    brokerageId: v.id("brokerages"),
    organizationId: v.string(),
    proposalId: v.id("buildProposals"),
    eventType: v.string(),
    command: v.string(),
    actorWorkosUserId: v.string(),
    actorRoles: v.array(v.string()),
    priorState: v.optional(v.string()),
    newState: v.optional(v.string()),
    reason: v.optional(v.string()),
    warnings: v.array(v.string()),
    createdAt: v.number(),
  })
    .index("by_proposal", ["proposalId"])
    .index("by_brokerage", ["brokerageId"]),
  auditEvents: defineTable({
    brokerageId: v.id("brokerages"),
    organizationId: v.string(),
    entityType: v.string(),
    entityId: v.string(),
    eventType: v.string(),
    command: v.string(),
    actorWorkosUserId: v.string(),
    actorRoles: v.array(v.string()),
    priorState: v.optional(v.string()),
    newState: v.optional(v.string()),
    reason: v.optional(v.string()),
    warnings: v.array(v.string()),
    createdAt: v.number(),
  })
    .index("by_entity", ["entityType", "entityId"])
    .index("by_brokerage", ["brokerageId"]),
  eventOutbox: defineTable({
    brokerageId: v.id("brokerages"),
    organizationId: v.string(),
    relatedEntityType: v.string(),
    relatedEntityId: v.string(),
    eventType: v.string(),
    payloadPreview: v.string(),
    status: productionOutboxStatusValidator,
    createdAt: v.number(),
    processedAt: v.optional(v.number()),
  })
    .index("by_brokerage_status", ["brokerageId", "status"])
    .index("by_entity", ["relatedEntityType", "relatedEntityId"]),
  recipientDeliveries: defineTable({
    actionLabel: v.string(),
    actionRequired: v.boolean(),
    body: v.string(),
    brokerageId: v.id("brokerages"),
    collaborationActionItemId: v.optional(v.id("buildActionItems")),
    collaborationAssetId: v.optional(v.id("buildCollaborationAssets")),
    collaborationBuildId: v.optional(v.id("activeBuilds")),
    collaborationCommentId: v.optional(v.id("buildCollaborationComments")),
    collaborationEventKind: v.optional(
      buildCollaborationNotificationKindValidator
    ),
    collaborationPostId: v.optional(v.id("buildCollaborationPosts")),
    collaborationReferenceId: v.optional(v.id("buildCollaborationReferences")),
    createdAt: v.number(),
    dedupeKey: v.string(),
    entityId: v.string(),
    entityLabel: v.string(),
    entityType: v.string(),
    href: v.string(),
    inAppVisible: v.optional(v.boolean()),
    organizationId: v.string(),
    recipientWorkosUserId: v.string(),
    resolutionMode: recipientDeliveryResolutionModeValidator,
    sourceLabel: v.string(),
    status: recipientDeliveryStatusValidator,
    title: v.string(),
    updatedAt: v.number(),
  })
    .index("by_recipient", [
      "organizationId",
      "recipientWorkosUserId",
      "createdAt",
    ])
    .index("by_recipient_dedupe", [
      "organizationId",
      "recipientWorkosUserId",
      "dedupeKey",
    ]),
  buildCollaborationDeliveryBatches: defineTable({
    organizationId: v.string(),
    brokerageId: v.id("brokerages"),
    buildId: v.id("activeBuilds"),
    recipientWorkosUserId: v.string(),
    channel: buildCollaborationExternalChannelValidator,
    cadence: v.optional(buildCollaborationDeliveryCadenceValidator),
    deliveryIds: v.array(v.id("buildCollaborationExternalDeliveries")),
    providerIdempotencyKey: v.string(),
    payloadSnapshot: v.string(),
    contactSnapshot: v.string(),
    state: buildCollaborationDeliveryBatchStateValidator,
    completedAt: v.optional(v.number()),
    cancelledAt: v.optional(v.number()),
    safeError: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_providerIdempotencyKey", ["providerIdempotencyKey"])
    .index("by_organizationId_and_recipientWorkosUserId_and_createdAt", [
      "organizationId",
      "recipientWorkosUserId",
      "createdAt",
    ]),
  buildCollaborationDeliveryAttempts: defineTable({
    organizationId: v.string(),
    brokerageId: v.id("brokerages"),
    batchId: v.optional(v.id("buildCollaborationDeliveryBatches")),
    deliveryIds: v.array(v.id("buildCollaborationExternalDeliveries")),
    channel: buildCollaborationExternalChannelValidator,
    attemptNumber: v.number(),
    providerIdempotencyKey: v.string(),
    state: buildCollaborationDeliveryAttemptStateValidator,
    attemptedAt: v.number(),
    completedAt: v.optional(v.number()),
    responseCode: v.optional(v.number()),
    providerMessageId: v.optional(v.string()),
    safeError: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_organizationId_and_attemptedAt", [
      "organizationId",
      "attemptedAt",
    ])
    .index("by_batchId_and_state", ["batchId", "state"])
    .index("by_providerIdempotencyKey", ["providerIdempotencyKey"]),
  buildCollaborationPushSubscriptions: defineTable({
    organizationId: v.string(),
    buildId: v.optional(v.id("activeBuilds")),
    workosUserId: v.string(),
    endpoint: v.string(),
    p256dh: v.string(),
    auth: v.string(),
    ownershipRevision: v.optional(v.number()),
    state: v.union(v.literal("active"), v.literal("revoked")),
    createdAt: v.number(),
    updatedAt: v.number(),
    revokedAt: v.optional(v.number()),
  })
    .index("by_organizationId_and_workosUserId_and_state", [
      "organizationId",
      "workosUserId",
      "state",
    ])
    .index("by_organizationId_and_workosUserId_and_endpoint", [
      "organizationId",
      "workosUserId",
      "endpoint",
    ])
    .index("by_organizationId_and_workosUserId_and_buildId_and_endpoint", [
      "organizationId",
      "workosUserId",
      "buildId",
      "endpoint",
    ])
    .index("by_organizationId_and_workosUserId_and_buildId_and_state", [
      "organizationId",
      "workosUserId",
      "buildId",
      "state",
    ])
    .index("by_endpoint_and_state", ["endpoint", "state"])
    .index("by_endpoint_and_workosUserId_and_state", [
      "endpoint",
      "workosUserId",
      "state",
    ]),
  buildCollaborationPushEndpointOwners: defineTable({
    endpoint: v.string(),
    workosUserId: v.string(),
    revision: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_endpoint", ["endpoint"]),
  buildCollaborationPushEndpointBuildBindings: defineTable({
    organizationId: v.string(),
    buildId: v.id("activeBuilds"),
    endpoint: v.string(),
    workosUserId: v.string(),
    subscriptionId: v.id("buildCollaborationPushSubscriptions"),
    ownershipRevision: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_buildId_and_endpoint", ["buildId", "endpoint"])
    .index("by_organizationId_and_workosUserId_and_buildId_and_endpoint", [
      "organizationId",
      "workosUserId",
      "buildId",
      "endpoint",
    ]),
  operationsQueueHandoffs: defineTable({
    acknowledgementState: operationsHandoffAcknowledgementStateValidator,
    acknowledgedAt: v.optional(v.number()),
    acknowledgedByWorkosUserId: v.optional(v.string()),
    brokerageId: v.id("brokerages"),
    createdAt: v.number(),
    decisionPreview: v.string(),
    escalatedByWorkosUserId: v.string(),
    escalationReason: v.string(),
    evidenceSummary: v.string(),
    followUpAssignment: v.optional(v.string()),
    organizationId: v.string(),
    queueItemId: v.string(),
    recommendation: v.string(),
    requiredAction: v.string(),
    returnDecision: v.optional(operationsHandoffReturnDecisionValidator),
    returnedAt: v.optional(v.number()),
    returnedByWorkosUserId: v.optional(v.string()),
    returnReason: v.optional(v.string()),
    targetHref: v.string(),
    targetLabel: v.string(),
    targetRecordId: v.string(),
    targetType: v.string(),
    updatedAt: v.number(),
    warnings: v.array(v.string()),
  })
    .index("by_brokerage_queue_item", [
      "brokerageId",
      "queueItemId",
      "createdAt",
    ])
    .index("by_organization_updated", ["organizationId", "updatedAt"]),
  integrationEndpoints: defineTable({
    activatedAt: v.optional(v.number()),
    brokerageId: v.id("brokerages"),
    createdAt: v.number(),
    createdByWorkosUserId: v.string(),
    disabledAt: v.optional(v.number()),
    endpointUrl: v.string(),
    eventTypes: v.array(v.string()),
    name: v.string(),
    organizationId: v.string(),
    payloadVersion: v.string(),
    revokedAt: v.optional(v.number()),
    secretFingerprint: v.string(),
    secretHash: v.string(),
    secretVersion: v.number(),
    status: integrationEndpointStatusValidator,
    updatedAt: v.number(),
    validatedAt: v.optional(v.number()),
  })
    .index("by_organization", ["organizationId", "createdAt"])
    .index("by_brokerage_status", ["brokerageId", "status"]),
  integrationDeliveryAttempts: defineTable({
    attemptNumber: v.number(),
    attemptedAt: v.number(),
    brokerageId: v.id("brokerages"),
    completedAt: v.optional(v.number()),
    createdAt: v.number(),
    deliveryId: v.string(),
    endpointId: v.id("integrationEndpoints"),
    eventId: v.string(),
    eventType: v.string(),
    nextRetryAt: v.optional(v.number()),
    organizationId: v.string(),
    payloadVersion: v.string(),
    responseCode: v.optional(v.number()),
    retryOfAttemptId: v.optional(v.id("integrationDeliveryAttempts")),
    safeError: v.optional(v.string()),
    status: integrationDeliveryStatusValidator,
    updatedAt: v.number(),
  })
    .index("by_organization_attempted", ["organizationId", "attemptedAt"])
    .index("by_endpoint_attempted", ["endpointId", "attemptedAt"])
    .index("by_event", ["organizationId", "eventId"]),
  calendarSavedViews: defineTable({
    brokerageId: v.id("brokerages"),
    createdAt: v.number(),
    filters: v.any(),
    isDefault: v.boolean(),
    label: v.string(),
    organizationId: v.string(),
    surface: v.union(v.literal("proposal"), v.literal("activeBuild")),
    timeframe: v.union(
      v.literal("day"),
      v.literal("week"),
      v.literal("month"),
      v.literal("quarter"),
      v.literal("agenda")
    ),
    updatedAt: v.number(),
    viewKey: v.string(),
    workosUserId: v.string(),
  })
    .index("by_user_surface", ["organizationId", "workosUserId", "surface"])
    .index("by_view_key", ["organizationId", "workosUserId", "viewKey"]),
  calendarTargetDates: defineTable({
    brokerageId: v.id("brokerages"),
    buildId: v.optional(v.id("activeBuilds")),
    createdAt: v.number(),
    dateKind: v.union(
      v.literal("evidenceDue"),
      v.literal("reviewTarget"),
      v.literal("adminDecisionTarget"),
      v.literal("drawReleaseTarget")
    ),
    drawKey: v.optional(v.string()),
    entityKey: v.string(),
    entityType: v.string(),
    milestoneKey: v.optional(v.string()),
    organizationId: v.string(),
    proposalId: v.optional(v.id("buildProposals")),
    reason: v.optional(v.string()),
    targetDate: v.string(),
    targetTime: v.optional(v.string()),
    updatedAt: v.number(),
  })
    .index("by_build", ["buildId"])
    .index("by_proposal", ["proposalId"])
    .index("by_entity", ["entityType", "entityKey", "dateKind"]),
  calendarReminderEvents: defineTable({
    allDay: v.boolean(),
    assignedParticipants: v.array(
      v.object({
        builderProfileId: v.optional(v.id("builderProfiles")),
        contractorId: v.optional(v.id("contractorProfiles")),
        displayName: v.optional(v.string()),
        email: v.optional(v.string()),
        participantType: v.union(
          v.literal("workosUser"),
          v.literal("builderProfile"),
          v.literal("contractorProfile"),
          v.literal("externalEmail")
        ),
        role: v.optional(v.string()),
        workosUserId: v.optional(v.string()),
      })
    ),
    brokerageId: v.id("brokerages"),
    createdAt: v.number(),
    createdByWorkosUserId: v.string(),
    description: v.optional(v.string()),
    endsAt: v.optional(v.string()),
    externalEventId: v.optional(v.string()),
    externalProvider: v.optional(
      v.union(v.literal("google"), v.literal("outlook"), v.literal("ics"))
    ),
    location: v.optional(v.string()),
    buildId: v.optional(v.id("activeBuilds")),
    organizationId: v.string(),
    proposalId: v.id("buildProposals"),
    source: v.union(v.literal("drawflow"), v.literal("external")),
    startsAt: v.string(),
    status: v.union(v.literal("active"), v.literal("cancelled")),
    timezone: v.string(),
    title: v.string(),
    updatedAt: v.number(),
    updatedByWorkosUserId: v.string(),
  })
    .index("by_proposal", ["proposalId"])
    .index("by_build", ["buildId"])
    .index("by_created_by", ["organizationId", "createdByWorkosUserId"])
    .index("by_external", [
      "organizationId",
      "externalProvider",
      "externalEventId",
    ]),
  calendarSyncSubscriptions: defineTable({
    brokerageId: v.id("brokerages"),
    createdAt: v.number(),
    direction: v.union(v.literal("outbound"), v.literal("bidirectional")),
    filters: v.any(),
    organizationId: v.string(),
    provider: v.union(
      v.literal("ics"),
      v.literal("google"),
      v.literal("outlook")
    ),
    sourceBuildId: v.optional(v.id("activeBuilds")),
    sourceProposalId: v.optional(v.id("buildProposals")),
    status: v.union(
      v.literal("active"),
      v.literal("paused"),
      v.literal("revoked")
    ),
    subscriptionKey: v.string(),
    surface: v.union(v.literal("proposal"), v.literal("activeBuild")),
    updatedAt: v.number(),
    workosUserId: v.string(),
  })
    .index("by_subscription_key", ["subscriptionKey"])
    .index("by_user_surface", ["organizationId", "workosUserId", "surface"]),
  calendarSyncChanges: defineTable({
    brokerageId: v.id("brokerages"),
    changeKey: v.string(),
    createdAt: v.number(),
    externalEventId: v.optional(v.string()),
    organizationId: v.string(),
    payload: v.any(),
    provider: v.union(
      v.literal("ics"),
      v.literal("google"),
      v.literal("outlook")
    ),
    status: v.union(
      v.literal("pendingReview"),
      v.literal("applied"),
      v.literal("rejected")
    ),
    subscriptionId: v.optional(v.id("calendarSyncSubscriptions")),
    updatedAt: v.number(),
    workosUserId: v.string(),
  })
    .index("by_change_key", ["changeKey"])
    .index("by_status", ["organizationId", "status"]),
  scheduleRevisionRecords: defineTable({
    brokerageId: v.id("brokerages"),
    buildId: v.optional(v.id("activeBuilds")),
    createdAt: v.number(),
    entityKey: v.string(),
    entityType: v.string(),
    newState: v.any(),
    organizationId: v.string(),
    priorState: v.any(),
    proposalId: v.optional(v.id("buildProposals")),
    reason: v.string(),
    revisionType: v.string(),
    revisedByWorkosUserId: v.string(),
    warnings: v.array(v.string()),
  })
    .index("by_build", ["buildId"])
    .index("by_proposal", ["proposalId"])
    .index("by_entity", ["entityType", "entityKey"]),
  assistantThreads: defineTable({
    brokerageId: v.optional(v.id("brokerages")),
    componentThreadId: v.optional(v.string()),
    createdAt: v.number(),
    createdByWorkosUserId: v.string(),
    organizationId: v.string(),
    routeContext: v.any(),
    status: v.union(v.literal("active"), v.literal("archived")),
    title: v.string(),
    updatedAt: v.number(),
  })
    .index("by_organization", ["organizationId"])
    .index("by_actor", ["organizationId", "createdByWorkosUserId"]),
  assistantMessages: defineTable({
    content: v.string(),
    createdAt: v.number(),
    metadata: v.any(),
    organizationId: v.string(),
    role: v.union(
      v.literal("user"),
      v.literal("assistant"),
      v.literal("system"),
      v.literal("tool")
    ),
    threadId: v.id("assistantThreads"),
  })
    .index("by_thread", ["threadId"])
    .index("by_organization", ["organizationId"]),
  assistantActionPlans: defineTable({
    acceptedClientRequestIds: v.array(v.string()),
    actorRoles: v.array(v.string()),
    brokerageId: v.optional(v.id("brokerages")),
    buildId: v.optional(v.id("activeBuilds")),
    commitOutcome: v.optional(v.any()),
    committedAt: v.optional(v.number()),
    createdAt: v.number(),
    createdByWorkosUserId: v.string(),
    items: v.array(v.any()),
    organizationId: v.string(),
    proposalId: v.optional(v.id("buildProposals")),
    rejectedClientRequestIds: v.array(v.string()),
    routeContext: v.any(),
    status: v.union(
      v.literal("preview"),
      v.literal("committed"),
      v.literal("failed"),
      v.literal("cancelled")
    ),
    threadId: v.optional(v.id("assistantThreads")),
    updatedAt: v.number(),
    validationResults: v.array(v.any()),
  })
    .index("by_organization", ["organizationId"])
    .index("by_thread", ["threadId"])
    .index("by_proposal", ["proposalId"])
    .index("by_build", ["buildId"]),
  assistantWorkflowRuns: defineTable({
    actorRoles: v.array(v.string()),
    brokerageId: v.optional(v.id("brokerages")),
    createdAt: v.number(),
    createdByWorkosUserId: v.string(),
    currentStepId: v.optional(v.string()),
    finalSummary: v.optional(v.string()),
    goal: v.string(),
    organizationId: v.string(),
    prompt: v.string(),
    routeContext: v.any(),
    status: v.union(
      v.literal("running"),
      v.literal("needs_input"),
      v.literal("succeeded"),
      v.literal("failed"),
      v.literal("cancelled")
    ),
    steps: v.array(v.any()),
    threadId: v.optional(v.id("assistantThreads")),
    updatedAt: v.number(),
  })
    .index("by_organization", ["organizationId"])
    .index("by_actor_status", [
      "organizationId",
      "createdByWorkosUserId",
      "status",
    ])
    .index("by_thread_status", ["threadId", "status"]),
  assistantTraceEvents: defineTable({
    aguiType: v.string(),
    createdAt: v.number(),
    label: v.string(),
    metadata: v.any(),
    organizationId: v.string(),
    planId: v.optional(v.id("assistantActionPlans")),
    status: v.union(
      v.literal("queued"),
      v.literal("running"),
      v.literal("needs_input"),
      v.literal("succeeded"),
      v.literal("failed")
    ),
    threadId: v.id("assistantThreads"),
  })
    .index("by_thread", ["threadId"])
    .index("by_plan", ["planId"])
    .index("by_organization", ["organizationId"]),
  activeBuilds: defineTable({
    brokerageId: v.id("brokerages"),
    organizationId: v.string(),
    proposalId: v.id("buildProposals"),
    builderProfileId: v.id("builderProfiles"),
    workflowRuleSnapshotId: v.id("workflowRuleSnapshots"),
    buildName: v.string(),
    location: v.string(),
    locationLatitude: v.optional(v.number()),
    locationLongitude: v.optional(v.number()),
    locationPlaceId: v.optional(v.string()),
    status: productionBuildStatusValidator,
    startDate: v.string(),
    timelineCurrentDay: v.optional(v.number()),
    timelineProgressValue: v.optional(v.number()),
    timelineRangeMax: v.optional(v.number()),
    timelineRangeMin: v.optional(v.number()),
    timelineRouteState: v.optional(
      v.object({
        activeCapitalSpikeId: v.optional(v.string()),
        activeDrawId: v.optional(v.string()),
        activeMilestoneKey: v.optional(v.string()),
        selectedPanelOpen: v.boolean(),
        straightLine: v.boolean(),
      })
    ),
    timelineMinimumCashReserveCents: v.optional(v.number()),
    borrowerStartingCashCents: v.optional(v.number()),
    timelineStartingCashCents: v.optional(v.number()),
    totalBudgetCents: v.number(),
    permitDocumentId: v.optional(v.id("proposalDocuments")),
    permitWaiverId: v.optional(v.id("documentWaivers")),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_proposal", ["proposalId"])
    .index("by_brokerage", ["brokerageId"])
    .index("by_organizationId", ["organizationId"]),
  buildParticipants: defineTable({
    organizationId: v.string(),
    brokerageId: v.id("brokerages"),
    buildId: v.id("activeBuilds"),
    workosUserId: v.string(),
    displayNameSnapshot: v.string(),
    emailSnapshot: v.optional(v.string()),
    role: buildCollaborationRoleValidator,
    status: buildParticipantStatusValidator,
    participationPeriod: v.number(),
    invitedByWorkosUserId: v.optional(v.string()),
    joinedAt: v.optional(v.number()),
    removedAt: v.optional(v.number()),
    removedByWorkosUserId: v.optional(v.string()),
    removalReason: v.optional(v.string()),
    revocationCleanupCompletedAt: v.optional(v.number()),
    revocationCleanupStatus: v.optional(
      v.union(v.literal("pending"), v.literal("completed"))
    ),
    validFrom: v.number(),
    validUntil: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_buildId_and_status", ["buildId", "status"])
    .index("by_buildId_and_workosUserId", ["buildId", "workosUserId"])
    .index("by_buildId_and_workosUserId_and_participationPeriod", [
      "buildId",
      "workosUserId",
      "participationPeriod",
    ])
    .index("by_workosUserId_and_status", ["workosUserId", "status"])
    .index("by_organizationId_and_workosUserId_and_status", [
      "organizationId",
      "workosUserId",
      "status",
    ]),
  buildCollaborationTenantSettings: defineTable({
    organizationId: v.string(),
    brokerageId: v.id("brokerages"),
    status: buildCollaborationTenantStatusValidator,
    retentionPolicyKey: v.optional(v.string()),
    generousRateLimitMultiplier: v.number(),
    migrationCompletedAt: v.optional(v.number()),
    activatedAt: v.optional(v.number()),
    activatedByWorkosUserId: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_organizationId", ["organizationId"]),
  buildCollaborationMigrationParityEvidence: defineTable({
    organizationId: v.string(),
    brokerageId: v.id("brokerages"),
    reportHash: v.string(),
    sourceRecordCount: v.number(),
    importedPostCount: v.number(),
    mismatchCount: v.number(),
    parityPassed: v.boolean(),
    reason: v.optional(v.string()),
    verifiedAt: v.number(),
    verifiedByWorkosUserId: v.string(),
  }).index("by_organizationId_and_verifiedAt", [
    "organizationId",
    "verifiedAt",
  ]),
  buildCollaborationPosts: defineTable({
    organizationId: v.string(),
    brokerageId: v.id("brokerages"),
    buildId: v.id("activeBuilds"),
    source: buildCollaborationSourceValidator,
    postType: buildCollaborationPostTypeValidator,
    authorWorkosUserId: v.optional(v.string()),
    authorDisplayNameSnapshot: v.string(),
    authorRole: v.optional(buildCollaborationRoleValidator),
    authorRolesSnapshot: v.array(v.string()),
    agentDrafted: v.boolean(),
    systemEventKey: v.optional(v.string()),
    importedSourceId: v.optional(v.string()),
    audienceMode: buildCollaborationAudienceModeValidator,
    audienceFloorTier: v.number(),
    currentRevisionId: v.optional(v.id("buildCollaborationPostRevisions")),
    revision: v.number(),
    readRevision: v.optional(v.number()),
    threadState: buildCollaborationThreadStateValidator,
    threadRevision: v.optional(v.number()),
    contentState: buildCollaborationContentStateValidator,
    acceptedCommentId: v.optional(v.id("buildCollaborationComments")),
    decisionOwnerWorkosUserId: v.optional(v.string()),
    decisionOutcome: v.optional(v.string()),
    resolutionSummary: v.optional(v.string()),
    resolvedAt: v.optional(v.number()),
    resolvedByWorkosUserId: v.optional(v.string()),
    announcementExpiresAt: v.optional(v.number()),
    announcementProminent: v.optional(v.boolean()),
    primaryReferenceKind: v.optional(buildCollaborationReferenceKindValidator),
    primaryReferenceId: v.optional(v.string()),
    commentCount: v.number(),
    openActionItemCount: v.number(),
    acknowledgementRequired: v.boolean(),
    lastMeaningfulActivityAt: v.number(),
    latestActivityActorWorkosUserId: v.optional(v.string()),
    tombstonedAt: v.optional(v.number()),
    tombstonedByWorkosUserId: v.optional(v.string()),
    moderationReason: v.optional(v.string()),
    moderatedAt: v.optional(v.number()),
    moderatedByWorkosUserId: v.optional(v.string()),
    moderatedByRole: v.optional(buildCollaborationRoleValidator),
    activeModerationCaseId: v.optional(
      v.id("buildCollaborationModerationCases")
    ),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_buildId_and_lastMeaningfulActivityAt", [
      "buildId",
      "lastMeaningfulActivityAt",
    ])
    .index("by_build_prominence_activity", [
      "buildId",
      "announcementProminent",
      "lastMeaningfulActivityAt",
    ])
    .index("by_buildId_and_createdAt", ["buildId", "createdAt"])
    .index("by_buildId_and_threadState_and_postType", [
      "buildId",
      "threadState",
      "postType",
    ])
    .index("by_buildId_and_systemEventKey", ["buildId", "systemEventKey"])
    .index("by_buildId_and_importedSourceId", ["buildId", "importedSourceId"]),
  buildCollaborationPostRevisions: defineTable({
    organizationId: v.string(),
    brokerageId: v.id("brokerages"),
    buildId: v.id("activeBuilds"),
    postId: v.id("buildCollaborationPosts"),
    revision: v.number(),
    tiptapJson: v.string(),
    plainText: v.string(),
    contentHash: v.string(),
    authorWorkosUserId: v.string(),
    authorRole: buildCollaborationRoleValidator,
    editReason: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index("by_postId_and_revision", ["postId", "revision"])
    .index("by_buildId_and_createdAt", ["buildId", "createdAt"])
    .searchIndex("search_plainText", {
      searchField: "plainText",
      filterFields: ["buildId", "organizationId"],
    }),
  buildCollaborationDecisionOutcomeRevisions: defineTable({
    organizationId: v.string(),
    brokerageId: v.id("brokerages"),
    buildId: v.id("activeBuilds"),
    postId: v.id("buildCollaborationPosts"),
    revision: v.number(),
    outcome: v.string(),
    ownerWorkosUserId: v.string(),
    ownerDisplayNameSnapshot: v.string(),
    changedByWorkosUserId: v.string(),
    changedByRole: buildCollaborationRoleValidator,
    reason: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index("by_postId_and_revision", ["postId", "revision"])
    .index("by_buildId_and_createdAt", ["buildId", "createdAt"]),
  buildCollaborationThreadEvents: defineTable({
    organizationId: v.string(),
    brokerageId: v.id("brokerages"),
    buildId: v.id("activeBuilds"),
    postId: v.id("buildCollaborationPosts"),
    eventType: v.union(
      v.literal("resolved"),
      v.literal("reopened"),
      v.literal("reply_reopened"),
      v.literal("accepted_answer_unavailable"),
      v.literal("announcement_expiration_changed")
    ),
    actorWorkosUserId: v.string(),
    actorRole: buildCollaborationRoleValidator,
    priorState: v.string(),
    newState: v.string(),
    reason: v.optional(v.string()),
    acceptedCommentId: v.optional(v.id("buildCollaborationComments")),
    decisionRevisionId: v.optional(
      v.id("buildCollaborationDecisionOutcomeRevisions")
    ),
    createdAt: v.number(),
  }).index("by_postId_and_createdAt", ["postId", "createdAt"]),
  buildCollaborationAudienceMembers: defineTable({
    organizationId: v.string(),
    brokerageId: v.id("brokerages"),
    buildId: v.id("activeBuilds"),
    postId: v.id("buildCollaborationPosts"),
    workosUserId: v.string(),
    addedByWorkosUserId: v.string(),
    createdAt: v.number(),
  })
    .index("by_postId_and_workosUserId", ["postId", "workosUserId"])
    .index("by_buildId_and_workosUserId", ["buildId", "workosUserId"]),
  buildCollaborationAudienceSnapshots: defineTable({
    organizationId: v.string(),
    brokerageId: v.id("brokerages"),
    buildId: v.id("activeBuilds"),
    postId: v.id("buildCollaborationPosts"),
    postRevisionId: v.id("buildCollaborationPostRevisions"),
    workosUserId: v.string(),
    resolution: v.union(
      v.literal("reader"),
      v.literal("excluded"),
      v.literal("mandatory")
    ),
    reason: v.string(),
    createdAt: v.number(),
  })
    .index("by_postRevisionId_and_workosUserId", [
      "postRevisionId",
      "workosUserId",
    ])
    .index("by_buildId_and_workosUserId", ["buildId", "workosUserId"]),
  buildCollaborationComments: defineTable({
    organizationId: v.string(),
    brokerageId: v.id("brokerages"),
    buildId: v.id("activeBuilds"),
    postId: v.id("buildCollaborationPosts"),
    parentCommentId: v.optional(v.id("buildCollaborationComments")),
    logicalDepth: v.number(),
    authorWorkosUserId: v.string(),
    authorDisplayNameSnapshot: v.string(),
    authorRole: buildCollaborationRoleValidator,
    currentRevisionId: v.optional(v.id("buildCollaborationCommentRevisions")),
    revision: v.number(),
    contentState: buildCollaborationContentStateValidator,
    tombstonedAt: v.optional(v.number()),
    tombstonedByWorkosUserId: v.optional(v.string()),
    moderationReason: v.optional(v.string()),
    moderatedAt: v.optional(v.number()),
    moderatedByWorkosUserId: v.optional(v.string()),
    moderatedByRole: v.optional(buildCollaborationRoleValidator),
    activeModerationCaseId: v.optional(
      v.id("buildCollaborationModerationCases")
    ),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_postId_and_createdAt", ["postId", "createdAt"])
    .index("by_parentCommentId_and_createdAt", ["parentCommentId", "createdAt"])
    .index("by_buildId_and_authorWorkosUserId", [
      "buildId",
      "authorWorkosUserId",
    ]),
  buildCollaborationCommentRevisions: defineTable({
    organizationId: v.string(),
    brokerageId: v.id("brokerages"),
    buildId: v.id("activeBuilds"),
    postId: v.id("buildCollaborationPosts"),
    commentId: v.id("buildCollaborationComments"),
    revision: v.number(),
    tiptapJson: v.string(),
    plainText: v.string(),
    contentHash: v.string(),
    authorWorkosUserId: v.string(),
    authorRole: v.optional(buildCollaborationRoleValidator),
    editReason: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index("by_commentId_and_revision", ["commentId", "revision"])
    .searchIndex("search_plainText", {
      searchField: "plainText",
      filterFields: ["buildId", "organizationId"],
    }),
  buildCollaborationSearchRecords: defineTable({
    organizationId: v.string(),
    brokerageId: v.id("brokerages"),
    buildId: v.id("activeBuilds"),
    postId: v.id("buildCollaborationPosts"),
    ownerKind: v.optional(
      v.union(v.literal("post"), v.literal("comment"), v.literal("actionItem"))
    ),
    ownerId: v.optional(v.string()),
    readerPartitionKey: v.string(),
    candidateKey: v.string(),
    candidateJson: v.string(),
    searchText: v.string(),
    contentState: v.union(v.literal("active"), v.literal("retired")),
    sourceUpdatedAt: v.number(),
    indexedAt: v.number(),
    maintenanceJobId: v.optional(v.id("buildCollaborationSearchJobs")),
  })
    .index("by_postId", ["postId"])
    .index("by_postId_and_ownerKind_and_ownerId", [
      "postId",
      "ownerKind",
      "ownerId",
    ])
    .index("by_postId_and_reader", ["postId", "readerPartitionKey"])
    .index("by_build_reader_state_updatedAt", [
      "buildId",
      "readerPartitionKey",
      "contentState",
      "sourceUpdatedAt",
    ])
    .index("by_buildId_and_reader", ["buildId", "readerPartitionKey"])
    .index("by_maintenanceJobId_and_contentState", [
      "maintenanceJobId",
      "contentState",
    ])
    .searchIndex("search_searchText", {
      searchField: "searchText",
      filterFields: [
        "buildId",
        "organizationId",
        "readerPartitionKey",
        "contentState",
      ],
    }),
  buildCollaborationSearchStates: defineTable({
    organizationId: v.string(),
    brokerageId: v.id("brokerages"),
    buildId: v.id("activeBuilds"),
    generation: v.number(),
    status: v.union(v.literal("building"), v.literal("ready")),
    readerFingerprint: v.optional(v.string()),
    targetReaderFingerprint: v.optional(v.string()),
    requestedAt: v.number(),
    readyAt: v.optional(v.number()),
    updatedAt: v.number(),
  })
    .index("by_buildId", ["buildId"])
    .index("by_brokerageId_and_status", ["brokerageId", "status"])
    .index("by_organizationId_and_status", ["organizationId", "status"]),
  buildCollaborationSearchJobs: defineTable({
    organizationId: v.string(),
    brokerageId: v.id("brokerages"),
    buildId: v.id("activeBuilds"),
    postId: v.optional(v.id("buildCollaborationPosts")),
    ownerKind: v.optional(
      v.union(v.literal("post"), v.literal("comment"), v.literal("actionItem"))
    ),
    ownerId: v.optional(v.string()),
    scope: v.union(
      v.literal("owner"),
      v.literal("post"),
      v.literal("post_tree"),
      v.literal("build")
    ),
    generation: v.number(),
    status: v.union(
      v.literal("queued"),
      v.literal("running"),
      v.literal("failed"),
      v.literal("complete")
    ),
    phase: v.union(
      v.literal("retire"),
      v.literal("tier"),
      v.literal("readers"),
      v.literal("activate"),
      v.literal("enumerate_posts"),
      v.literal("enumerate_comments"),
      v.literal("enumerate_actions"),
      v.literal("complete")
    ),
    readerOffset: v.optional(v.number()),
    candidateOffset: v.optional(v.number()),
    candidateCursor: v.optional(v.union(v.string(), v.null())),
    candidatePhase: v.optional(
      v.union(v.literal("base"), v.literal("references"), v.literal("assets"))
    ),
    cursor: v.optional(v.union(v.string(), v.null())),
    failureCount: v.optional(v.number()),
    lastError: v.optional(v.string()),
    lastScheduledAt: v.optional(v.number()),
    leaseExpiresAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_buildId_and_status", ["buildId", "status"])
    .index("by_brokerageId_and_status", ["brokerageId", "status"])
    .index("by_organizationId_and_status", ["organizationId", "status"])
    .index("by_buildId_and_scope_and_status", ["buildId", "scope", "status"])
    .index("by_buildId_and_postId_and_scope_and_status", [
      "buildId",
      "postId",
      "scope",
      "status",
    ])
    .index("by_buildId_and_ownerKind_and_ownerId", [
      "buildId",
      "ownerKind",
      "ownerId",
    ]),
  buildCollaborationSearchCutoverChecks: defineTable({
    organizationId: v.string(),
    brokerageId: v.id("brokerages"),
    status: v.union(
      v.literal("building"),
      v.literal("blocked"),
      v.literal("ready")
    ),
    authorityCursor: v.optional(v.union(v.string(), v.null())),
    authorityProjectionComplete: v.optional(v.boolean()),
    rebuildCursor: v.optional(v.union(v.string(), v.null())),
    searchRebuildComplete: v.optional(v.boolean()),
    cursor: v.optional(v.union(v.string(), v.null())),
    buildCount: v.number(),
    readyBuildCount: v.number(),
    latestBuildCreationTime: v.optional(v.number()),
    authorityReaderFingerprint: v.optional(v.string()),
    implicitReaderSourceFingerprint: v.optional(v.string()),
    failureReason: v.optional(v.string()),
    startedAt: v.number(),
    completedAt: v.optional(v.number()),
    updatedAt: v.number(),
  }).index("by_organizationId", ["organizationId"]),
  buildCollaborationSearchAuthorities: defineTable({
    organizationId: v.string(),
    workosMembershipId: v.string(),
    workosUserId: v.string(),
    role: v.union(v.literal("admin"), v.literal("principle-broker")),
    updatedAt: v.number(),
  })
    .index("by_workosMembershipId", ["workosMembershipId"])
    .index("by_organizationId_and_role", ["organizationId", "role"]),
  buildCollaborationModerationCases: defineTable({
    organizationId: v.string(),
    brokerageId: v.id("brokerages"),
    buildId: v.id("activeBuilds"),
    postId: v.id("buildCollaborationPosts"),
    commentId: v.optional(v.id("buildCollaborationComments")),
    entityKind: v.union(v.literal("post"), v.literal("comment")),
    entityId: v.string(),
    contentAuthorWorkosUserId: v.string(),
    contentAuthorRole: buildCollaborationRoleValidator,
    moderatorWorkosUserId: v.string(),
    moderatorRole: buildCollaborationRoleValidator,
    moderatorTier: v.number(),
    status: v.union(
      v.literal("moderated"),
      v.literal("appealed"),
      v.literal("restored"),
      v.literal("final_retained")
    ),
    currentReason: v.string(),
    appealReviewerMinimumTier: v.number(),
    evidenceSnapshotJson: v.string(),
    lastAppealedAt: v.optional(v.number()),
    lastAppealedByWorkosUserId: v.optional(v.string()),
    resolvedAt: v.optional(v.number()),
    resolvedByWorkosUserId: v.optional(v.string()),
    resolvedByRole: v.optional(buildCollaborationRoleValidator),
    resolutionReason: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_entityKind_and_entityId", ["entityKind", "entityId"])
    .index("by_postId_and_status", ["postId", "status"])
    .index("by_contentAuthorWorkosUserId_and_status", [
      "contentAuthorWorkosUserId",
      "status",
    ]),
  buildCollaborationModerationEvents: defineTable({
    organizationId: v.string(),
    brokerageId: v.id("brokerages"),
    buildId: v.id("activeBuilds"),
    caseId: v.id("buildCollaborationModerationCases"),
    eventType: v.union(
      v.literal("moderated"),
      v.literal("appealed"),
      v.literal("restored"),
      v.literal("retained")
    ),
    actorWorkosUserId: v.string(),
    actorRole: buildCollaborationRoleValidator,
    priorState: v.string(),
    newState: v.string(),
    reason: v.string(),
    createdAt: v.number(),
  }).index("by_caseId_and_createdAt", ["caseId", "createdAt"]),
  buildCollaborationReferences: defineTable({
    organizationId: v.string(),
    brokerageId: v.id("brokerages"),
    buildId: v.id("activeBuilds"),
    ownerKind: buildCollaborationOwnerKindValidator,
    ownerRecordId: v.string(),
    postId: v.id("buildCollaborationPosts"),
    entityKind: buildCollaborationReferenceKindValidator,
    entityId: v.string(),
    primary: v.boolean(),
    labelSnapshot: v.string(),
    summarySnapshot: v.optional(v.string()),
    actionItemQueueSortAt: v.optional(v.number()),
    createdAt: v.number(),
  })
    .index("by_ownerKind_and_ownerRecordId", ["ownerKind", "ownerRecordId"])
    .index("by_buildId_and_entityKind_and_entityId", [
      "buildId",
      "entityKind",
      "entityId",
    ])
    .index("by_build_entity_owner_queueSort", [
      "buildId",
      "entityKind",
      "entityId",
      "ownerKind",
      "actionItemQueueSortAt",
    ])
    .index("by_postId", ["postId"]),
  buildCollaborationFollows: defineTable({
    organizationId: v.string(),
    brokerageId: v.id("brokerages"),
    buildId: v.id("activeBuilds"),
    postId: v.id("buildCollaborationPosts"),
    workosUserId: v.string(),
    reason: v.union(
      v.literal("author"),
      v.literal("commenter"),
      v.literal("mentioned"),
      v.literal("assigned"),
      v.literal("manual")
    ),
    active: v.boolean(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_postId_and_workosUserId", ["postId", "workosUserId"])
    .index("by_buildId_and_workosUserId_and_active", [
      "buildId",
      "workosUserId",
      "active",
    ]),
  buildCollaborationReactions: defineTable({
    organizationId: v.string(),
    brokerageId: v.id("brokerages"),
    buildId: v.id("activeBuilds"),
    postId: v.id("buildCollaborationPosts"),
    commentId: v.optional(v.id("buildCollaborationComments")),
    workosUserId: v.string(),
    reaction: buildCollaborationReactionValidator,
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_postId_and_workosUserId", ["postId", "workosUserId"])
    .index("by_postId_and_commentId_and_workosUserId", [
      "postId",
      "commentId",
      "workosUserId",
    ])
    .index("by_commentId_and_workosUserId", ["commentId", "workosUserId"]),
  buildCollaborationReceipts: defineTable({
    organizationId: v.string(),
    brokerageId: v.id("brokerages"),
    buildId: v.id("activeBuilds"),
    postId: v.id("buildCollaborationPosts"),
    workosUserId: v.string(),
    viewerRole: buildCollaborationRoleValidator,
    firstViewedAt: v.number(),
    lastViewedAt: v.number(),
    latestRevisionViewed: v.number(),
  })
    .index("by_postId_and_workosUserId", ["postId", "workosUserId"])
    .index("by_buildId_and_workosUserId", ["buildId", "workosUserId"]),
  buildCollaborationPins: defineTable({
    organizationId: v.string(),
    brokerageId: v.id("brokerages"),
    buildId: v.id("activeBuilds"),
    postId: v.id("buildCollaborationPosts"),
    commentId: v.optional(v.id("buildCollaborationComments")),
    workosUserId: v.string(),
    kind: buildCollaborationPinKindValidator,
    createdAt: v.number(),
  })
    .index("by_buildId_and_kind_and_createdAt", [
      "buildId",
      "kind",
      "createdAt",
    ])
    .index("by_postId_and_workosUserId_and_kind", [
      "postId",
      "workosUserId",
      "kind",
    ])
    .index("by_postId_and_commentId_and_workosUserId_and_kind", [
      "postId",
      "commentId",
      "workosUserId",
      "kind",
    ]),
  buildCollaborationAcknowledgementTargets: defineTable({
    organizationId: v.string(),
    brokerageId: v.id("brokerages"),
    buildId: v.id("activeBuilds"),
    postId: v.id("buildCollaborationPosts"),
    workosUserId: v.string(),
    dueAt: v.optional(v.number()),
    waivedAt: v.optional(v.number()),
    waivedByWorkosUserId: v.optional(v.string()),
    waiverReason: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index("by_postId_and_workosUserId", ["postId", "workosUserId"])
    .index("by_buildId_and_workosUserId", ["buildId", "workosUserId"]),
  buildCollaborationAcknowledgements: defineTable({
    organizationId: v.string(),
    brokerageId: v.id("brokerages"),
    buildId: v.id("activeBuilds"),
    postId: v.id("buildCollaborationPosts"),
    targetId: v.id("buildCollaborationAcknowledgementTargets"),
    workosUserId: v.string(),
    acknowledgedRevision: v.number(),
    acknowledgedAt: v.number(),
  })
    .index("by_targetId", ["targetId"])
    .index("by_postId_and_workosUserId", ["postId", "workosUserId"]),
  buildActionItems: defineTable({
    organizationId: v.string(),
    brokerageId: v.id("brokerages"),
    buildId: v.id("activeBuilds"),
    originatingPostId: v.id("buildCollaborationPosts"),
    parentActionItemId: v.optional(v.id("buildActionItems")),
    title: v.string(),
    descriptionTiptapJson: v.string(),
    descriptionPlainText: v.string(),
    status: buildActionItemStatusValidator,
    workKind: v.optional(buildActionItemWorkKindValidator),
    previousActiveStatus: v.optional(buildActionItemStatusValidator),
    priority: buildActionItemPriorityValidator,
    creatorWorkosUserId: v.string(),
    creatorRole: v.optional(buildCollaborationRoleValidator),
    assigneeWorkosUserId: v.optional(v.string()),
    assignedByWorkosUserId: v.optional(v.string()),
    assignmentState: buildActionAssignmentStateValidator,
    assignmentRequestedAt: v.optional(v.number()),
    dueAt: v.optional(v.number()),
    dueDateSource: v.optional(
      v.union(v.literal("manual"), v.literal("policy"))
    ),
    dueDatePolicyKey: v.optional(v.string()),
    policyDueAt: v.optional(v.number()),
    dueDateOverrideReason: v.optional(v.string()),
    dueDateOverriddenAt: v.optional(v.number()),
    dueDateOverriddenByWorkosUserId: v.optional(v.string()),
    policyObligationKey: v.optional(v.string()),
    deadlineNextAt: v.optional(v.number()),
    deadlineScheduleGeneration: v.optional(v.number()),
    deadlineNextStage: v.optional(
      v.union(
        v.literal("before"),
        v.literal("due"),
        v.literal("overdue"),
        v.literal("escalated")
      )
    ),
    deadlineProcessingState: v.optional(
      v.union(
        v.literal("pending"),
        v.literal("complete"),
        v.literal("quarantined")
      )
    ),
    deadlineProcessingFailure: v.optional(v.string()),
    deadlineProcessingFailedAt: v.optional(v.number()),
    requiresAcceptance: v.boolean(),
    blockedReason: v.optional(v.string()),
    cancellationReason: v.optional(v.string()),
    unassignmentReason: v.optional(v.literal("participant_removed")),
    completionRequestedAt: v.optional(v.number()),
    completionRequestedByWorkosUserId: v.optional(v.string()),
    completedAt: v.optional(v.number()),
    completedByWorkosUserId: v.optional(v.string()),
    completionAcceptedByWorkosUserId: v.optional(v.string()),
    currentRevision: v.number(),
    queueSortAt: v.optional(v.number()),
    primaryReferenceKind: v.optional(buildCollaborationReferenceKindValidator),
    primaryReferenceId: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_originatingPostId_and_status", ["originatingPostId", "status"])
    .index("by_originatingPostId_and_queueSortAt", [
      "originatingPostId",
      "queueSortAt",
    ])
    .index("by_buildId_and_status_and_updatedAt", [
      "buildId",
      "status",
      "updatedAt",
    ])
    .index("by_buildId_and_queueSortAt", ["buildId", "queueSortAt"])
    .index("by_buildId_and_assigneeWorkosUserId_and_status", [
      "buildId",
      "assigneeWorkosUserId",
      "status",
    ])
    .index("by_organizationId_and_assigneeWorkosUserId_and_status", [
      "organizationId",
      "assigneeWorkosUserId",
      "status",
    ])
    .index("by_organizationId_and_assigneeWorkosUserId_and_updatedAt", [
      "organizationId",
      "assigneeWorkosUserId",
      "updatedAt",
    ])
    .index("by_organizationId_and_assigneeWorkosUserId_and_queueSortAt", [
      "organizationId",
      "assigneeWorkosUserId",
      "queueSortAt",
    ])
    .index("by_parentActionItemId_and_status", ["parentActionItemId", "status"])
    .index("by_deadlineProcessingState_and_nextDeadlineAt", [
      "deadlineProcessingState",
      "deadlineNextAt",
    ])
    .index("by_buildId_and_deadlineProcessingState_and_nextDeadlineAt", [
      "buildId",
      "deadlineProcessingState",
      "deadlineNextAt",
    ])
    .index("by_buildId_and_policyObligationKey", [
      "buildId",
      "policyObligationKey",
    ])
    .index("by_dueAt", ["dueAt"])
    .index("by_buildId_and_dueAt", ["buildId", "dueAt"]),
  buildActionItemPostLinks: defineTable({
    organizationId: v.string(),
    brokerageId: v.id("brokerages"),
    buildId: v.id("activeBuilds"),
    postId: v.id("buildCollaborationPosts"),
    actionItemId: v.id("buildActionItems"),
    linkKind: v.union(v.literal("originating"), v.literal("policy_obligation")),
    createdAt: v.number(),
  })
    .index("by_postId_and_actionItemId", ["postId", "actionItemId"])
    .index("by_actionItemId_and_postId", ["actionItemId", "postId"]),
  buildActionItemEvents: defineTable({
    organizationId: v.string(),
    brokerageId: v.id("brokerages"),
    buildId: v.id("activeBuilds"),
    actionItemId: v.id("buildActionItems"),
    eventType: v.string(),
    actorWorkosUserId: v.string(),
    actorRole: buildCollaborationRoleValidator,
    exercisedAuthority: v.optional(v.string()),
    revision: v.optional(v.number()),
    priorState: v.optional(v.string()),
    newState: v.optional(v.string()),
    reason: v.optional(v.string()),
    warnings: v.optional(v.array(v.string())),
    createdAt: v.number(),
  }).index("by_actionItemId_and_createdAt", ["actionItemId", "createdAt"]),
  buildActionItemRevisions: defineTable({
    organizationId: v.string(),
    brokerageId: v.id("brokerages"),
    buildId: v.id("activeBuilds"),
    actionItemId: v.id("buildActionItems"),
    revision: v.number(),
    snapshotJson: v.string(),
    actorWorkosUserId: v.string(),
    actorRole: buildCollaborationRoleValidator,
    reason: v.optional(v.string()),
    createdAt: v.number(),
  }).index("by_actionItemId_and_revision", ["actionItemId", "revision"]),
  buildActionItemLabels: defineTable({
    organizationId: v.string(),
    brokerageId: v.id("brokerages"),
    buildId: v.id("activeBuilds"),
    actionItemId: v.id("buildActionItems"),
    label: v.string(),
    normalizedLabel: v.string(),
    createdByWorkosUserId: v.string(),
    createdAt: v.number(),
  })
    .index("by_actionItemId_and_normalizedLabel", [
      "actionItemId",
      "normalizedLabel",
    ])
    .index("by_buildId_and_normalizedLabel", ["buildId", "normalizedLabel"]),
  buildActionItemComments: defineTable({
    organizationId: v.string(),
    brokerageId: v.id("brokerages"),
    buildId: v.id("activeBuilds"),
    actionItemId: v.id("buildActionItems"),
    authorWorkosUserId: v.string(),
    authorDisplayNameSnapshot: v.string(),
    authorRole: buildCollaborationRoleValidator,
    tiptapJson: v.string(),
    plainText: v.string(),
    createdAt: v.number(),
  }).index("by_actionItemId_and_createdAt", ["actionItemId", "createdAt"]),
  buildActionItemCreationRequests: defineTable({
    organizationId: v.string(),
    brokerageId: v.id("brokerages"),
    buildId: v.id("activeBuilds"),
    postId: v.id("buildCollaborationPosts"),
    creatorWorkosUserId: v.string(),
    requestId: v.string(),
    actionItemId: v.id("buildActionItems"),
    createdAt: v.number(),
  }).index("by_postId_and_creatorWorkosUserId_and_requestId", [
    "postId",
    "creatorWorkosUserId",
    "requestId",
  ]),
  buildCollaborationActivityProjections: defineTable({
    organizationId: v.string(),
    brokerageId: v.id("brokerages"),
    buildId: v.id("activeBuilds"),
    postId: v.id("buildCollaborationPosts"),
    actionItemId: v.id("buildActionItems"),
    targetKind: v.union(
      v.literal("post"),
      buildCollaborationReferenceKindValidator
    ),
    targetId: v.string(),
    eventType: v.string(),
    projectionKey: v.string(),
    actorWorkosUserId: v.string(),
    createdAt: v.number(),
  })
    .index("by_buildId_and_projectionKey", ["buildId", "projectionKey"])
    .index("by_buildId_and_targetKind_and_targetId_and_createdAt", [
      "buildId",
      "targetKind",
      "targetId",
      "createdAt",
    ]),
  buildActionItemRelations: defineTable({
    organizationId: v.string(),
    brokerageId: v.id("brokerages"),
    buildId: v.id("activeBuilds"),
    sourceActionItemId: v.id("buildActionItems"),
    targetActionItemId: v.id("buildActionItems"),
    kind: buildActionRelationKindValidator,
    relationshipKey: v.optional(v.string()),
    status: v.union(
      v.literal("active"),
      v.literal("suspended"),
      v.literal("superseded")
    ),
    suspensionReason: v.optional(v.string()),
    suspendedAt: v.optional(v.number()),
    suspendedByWorkosUserId: v.optional(v.string()),
    restoredAt: v.optional(v.number()),
    restoredByWorkosUserId: v.optional(v.string()),
    supersededAt: v.optional(v.number()),
    supersededByRelationId: v.optional(v.id("buildActionItemRelations")),
    createdByWorkosUserId: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_buildId_and_relationshipKey", ["buildId", "relationshipKey"])
    .index("by_buildId_and_status", ["buildId", "status"])
    .index("by_sourceActionItemId_and_kind", ["sourceActionItemId", "kind"])
    .index("by_sourceActionItemId_and_status", ["sourceActionItemId", "status"])
    .index("by_targetActionItemId_and_kind", ["targetActionItemId", "kind"])
    .index("by_targetActionItemId_and_status", [
      "targetActionItemId",
      "status",
    ]),
  buildActionItemChecklistItems: defineTable({
    organizationId: v.string(),
    brokerageId: v.id("brokerages"),
    buildId: v.id("activeBuilds"),
    actionItemId: v.id("buildActionItems"),
    label: v.string(),
    required: v.boolean(),
    completed: v.boolean(),
    order: v.number(),
    completedAt: v.optional(v.number()),
    completedByWorkosUserId: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_actionItemId_and_order", ["actionItemId", "order"]),
  buildCollaborationAssets: defineTable({
    organizationId: v.string(),
    brokerageId: v.id("brokerages"),
    buildId: v.id("activeBuilds"),
    storageId: v.id("_storage"),
    fileName: v.string(),
    mimeType: v.string(),
    sizeBytes: v.number(),
    state: buildCollaborationAssetStateValidator,
    scanState: v.optional(buildCollaborationAssetScanStateValidator),
    contentHashSha256: v.optional(v.string()),
    stagingSessionId: v.optional(
      v.id("buildCollaborationAssetStagingSessions")
    ),
    uploadedByWorkosUserId: v.string(),
    version: v.number(),
    lineageRootAssetId: v.optional(v.id("buildCollaborationAssets")),
    supersedesAssetId: v.optional(v.id("buildCollaborationAssets")),
    maximumAudienceMode: buildCollaborationAudienceModeValidator,
    originatingPostId: v.optional(v.id("buildCollaborationPosts")),
    readerWorkosUserIds: v.optional(v.array(v.string())),
    scanMessage: v.optional(v.string()),
    scanCompletedAt: v.optional(v.number()),
    storageDeletedAt: v.optional(v.number()),
    publishedAt: v.optional(v.number()),
    publishedOwnerKind: v.optional(buildCollaborationOwnerKindValidator),
    publishedOwnerRecordId: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_buildId_and_state_and_createdAt", [
      "buildId",
      "state",
      "createdAt",
    ])
    .index("by_storageId", ["storageId"])
    .index("by_supersedesAssetId", ["supersedesAssetId"])
    .index("by_lineageRootAssetId_and_version", [
      "lineageRootAssetId",
      "version",
    ]),
  buildCollaborationAssetStagingSessions: defineTable({
    organizationId: v.string(),
    brokerageId: v.id("brokerages"),
    buildId: v.id("activeBuilds"),
    ownerWorkosUserId: v.string(),
    contextKind: buildCollaborationAssetStagingContextValidator,
    contextRecordId: v.optional(v.string()),
    expectedFileName: v.optional(v.string()),
    expectedMimeType: v.optional(v.string()),
    expectedSizeBytes: v.optional(v.number()),
    state: buildCollaborationAssetStagingStateValidator,
    assetId: v.optional(v.id("buildCollaborationAssets")),
    pendingStorageId: v.optional(v.id("_storage")),
    expiresAt: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_buildId_and_ownerWorkosUserId_and_state", [
      "buildId",
      "ownerWorkosUserId",
      "state",
    ])
    .index("by_contextKind_and_contextRecordId_and_state", [
      "contextKind",
      "contextRecordId",
      "state",
    ])
    .index("by_assetId", ["assetId"])
    .index("by_pendingStorageId", ["pendingStorageId"])
    .index("by_state_and_expiresAt", ["state", "expiresAt"]),
  buildCollaborationAttachments: defineTable({
    organizationId: v.string(),
    brokerageId: v.id("brokerages"),
    buildId: v.id("activeBuilds"),
    ownerKind: buildCollaborationOwnerKindValidator,
    ownerRecordId: v.string(),
    attachmentKind: buildCollaborationAttachmentKindValidator,
    attachmentId: v.string(),
    createdByWorkosUserId: v.string(),
    createdAt: v.number(),
  })
    .index("by_ownerKind_and_ownerRecordId", ["ownerKind", "ownerRecordId"])
    .index("by_buildId_and_attachmentKind_and_attachmentId", [
      "buildId",
      "attachmentKind",
      "attachmentId",
    ]),
  buildCollaborationDrafts: defineTable({
    organizationId: v.string(),
    brokerageId: v.id("brokerages"),
    buildId: v.id("activeBuilds"),
    ownerWorkosUserId: v.string(),
    approvalOwnerWorkosUserId: v.optional(v.string()),
    preparedByActorKind: v.optional(buildCollaborationActorKindValidator),
    preparedByWorkosUserId: v.optional(v.string()),
    preparedByAgent: v.optional(v.boolean()),
    state: buildCollaborationDraftStateValidator,
    bundleJson: v.string(),
    bundleHash: v.string(),
    revision: v.number(),
    scheduledFor: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_buildId_and_ownerWorkosUserId_and_state", [
      "buildId",
      "ownerWorkosUserId",
      "state",
    ])
    .index("by_buildId_and_approvalOwnerWorkosUserId_and_state", [
      "buildId",
      "approvalOwnerWorkosUserId",
      "state",
    ]),
  buildCollaborationPublicationApprovals: defineTable({
    organizationId: v.string(),
    brokerageId: v.id("brokerages"),
    buildId: v.id("activeBuilds"),
    draftId: v.id("buildCollaborationDrafts"),
    approvingWorkosUserId: v.string(),
    approvingActorKind: v.optional(buildCollaborationActorKindValidator),
    bundleHash: v.string(),
    bundleJsonSnapshot: v.optional(v.string()),
    draftRevision: v.optional(v.number()),
    readerSummaryJson: v.string(),
    mutationSummaryJson: v.string(),
    state: buildCollaborationApprovalStateValidator,
    scheduledFor: v.optional(v.number()),
    approvedAt: v.number(),
    invalidatedAt: v.optional(v.number()),
    publishedAt: v.optional(v.number()),
  })
    .index("by_draftId_and_state", ["draftId", "state"])
    .index("by_buildId_and_scheduledFor_and_state", [
      "buildId",
      "scheduledFor",
      "state",
    ]),
  buildCollaborationNotificationPreferences: defineTable({
    organizationId: v.string(),
    brokerageId: v.id("brokerages"),
    buildId: v.id("activeBuilds"),
    workosUserId: v.string(),
    ordinaryMuted: v.boolean(),
    digestEnabled: v.boolean(),
    digestCadence: v.union(
      v.literal("daily"),
      v.literal("weekly"),
      v.literal("never")
    ),
    channels: v.array(buildCollaborationNotificationChannelValidator),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_buildId_and_workosUserId", ["buildId", "workosUserId"]),
  buildCollaborationExternalDeliveries: defineTable({
    organizationId: v.string(),
    brokerageId: v.id("brokerages"),
    buildId: v.id("activeBuilds"),
    recipientWorkosUserId: v.string(),
    recipientParticipationPeriod: v.optional(v.number()),
    recipientDeliveryId: v.optional(v.id("recipientDeliveries")),
    channel: v.union(v.literal("email"), v.literal("push")),
    deliveryMode: v.union(v.literal("immediate"), v.literal("digest")),
    cadence: v.optional(buildCollaborationDeliveryCadenceValidator),
    eventKind: buildCollaborationNotificationKindValidator,
    dedupeKey: v.string(),
    batchId: v.optional(v.id("buildCollaborationDeliveryBatches")),
    batchKey: v.optional(v.string()),
    batchRevision: v.optional(v.number()),
    renderedItemSnapshot: v.optional(v.string()),
    collaborationPostId: v.optional(v.id("buildCollaborationPosts")),
    collaborationPostRevisionId: v.optional(
      v.id("buildCollaborationPostRevisions")
    ),
    collaborationCommentId: v.optional(v.id("buildCollaborationComments")),
    collaborationCommentRevisionId: v.optional(
      v.id("buildCollaborationCommentRevisions")
    ),
    collaborationActionItemId: v.optional(v.id("buildActionItems")),
    collaborationReferenceId: v.optional(v.id("buildCollaborationReferences")),
    collaborationAssetId: v.optional(v.id("buildCollaborationAssets")),
    status: buildCollaborationExternalDeliveryStatusValidator,
    scheduledFor: v.number(),
    attemptCount: v.number(),
    providerOutboxId: v.optional(v.id("eventOutbox")),
    lastAttemptAt: v.optional(v.number()),
    leaseExpiresAt: v.optional(v.number()),
    lastError: v.optional(v.string()),
    cancellationReason: v.optional(v.string()),
    cancelledAt: v.optional(v.number()),
    sentAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_status_and_scheduledFor", ["status", "scheduledFor"])
    .index("by_status_and_leaseExpiresAt", ["status", "leaseExpiresAt"])
    .index("by_providerOutboxId", ["providerOutboxId"])
    .index("by_batchKey_and_status", ["batchKey", "status"])
    .index("by_organizationId_and_recipientWorkosUserId_and_dedupeKey", [
      "organizationId",
      "recipientWorkosUserId",
      "dedupeKey",
    ])
    .index("by_recipientDeliveryId_and_channel", [
      "recipientDeliveryId",
      "channel",
    ])
    .index("by_organizationId_and_recipientWorkosUserId_and_createdAt", [
      "organizationId",
      "recipientWorkosUserId",
      "createdAt",
    ])
    .index("by_buildId_and_recipientWorkosUserId_and_status", [
      "buildId",
      "recipientWorkosUserId",
      "status",
    ])
    .index("by_buildId_and_recipientWorkosUserId_and_status_and_createdAt", [
      "buildId",
      "recipientWorkosUserId",
      "status",
      "createdAt",
    ]),
  buildDocuments: defineTable({
    brokerageId: v.id("brokerages"),
    organizationId: v.string(),
    buildId: v.id("activeBuilds"),
    proposalId: v.id("buildProposals"),
    documentType: productionDocumentTypeValidator,
    status: buildDocumentStatusValidator,
    fileName: v.string(),
    mimeType: v.string(),
    sizeBytes: v.number(),
    storageId: v.optional(v.id("_storage")),
    // Permits are contractor-visible by default (PRD §3.17, §15). Non-permit
    // documents require an explicit contractor-visible ACL flag (PRD §3.34).
    contractorVisible: v.optional(v.boolean()),
    clientOperationId: v.optional(v.string()),
    clientOperationFingerprint: v.optional(v.string()),
    version: v.optional(v.number()),
    supersedesDocumentId: v.optional(v.id("buildDocuments")),
    supersededByDocumentId: v.optional(v.id("buildDocuments")),
    supersededAt: v.optional(v.number()),
    uploadedByWorkosUserId: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_build", ["buildId"])
    .index("by_build_type", ["buildId", "documentType"])
    .index("by_build_operation", ["buildId", "clientOperationId"])
    .index("by_build_contractor_visible", ["buildId", "contractorVisible"]),
  buildEvidenceAssets: defineTable({
    brokerageId: v.id("brokerages"),
    organizationId: v.string(),
    buildId: v.id("activeBuilds"),
    proposalId: v.id("buildProposals"),
    evidenceKey: v.string(),
    milestoneKey: v.string(),
    fileName: v.string(),
    label: v.string(),
    mimeType: v.string(),
    sizeBytes: v.number(),
    storageId: v.optional(v.id("_storage")),
    tag: v.string(),
    submilestoneKey: v.optional(v.string()),
    contractorIds: v.optional(v.array(v.id("contractorProfiles"))),
    clientEvidenceId: v.optional(v.string()),
    clientEvidenceFingerprint: v.optional(v.string()),
    collaborationEventRevision: v.optional(v.number()),
    siteVisitId: v.optional(v.id("buildSiteVisits")),
    locationVerified: v.boolean(),
    locationAccuracyMeters: v.optional(v.number()),
    locationAttemptedAt: v.optional(v.number()),
    locationDistanceMeters: v.optional(v.number()),
    locationFailureReason: v.optional(v.string()),
    locationGeofenceRadiusMeters: v.optional(v.number()),
    source: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_build", ["buildId"])
    .index("by_build_key", ["buildId", "evidenceKey"])
    .index("by_build_milestone", ["buildId", "milestoneKey"])
    .index("by_site_visit", ["siteVisitId"])
    .index("by_site_visit_client", ["siteVisitId", "clientEvidenceId"]),
  buildNotes: defineTable({
    brokerageId: v.id("brokerages"),
    organizationId: v.string(),
    buildId: v.id("activeBuilds"),
    visibility: v.union(v.literal("internal"), v.literal("public")),
    body: v.string(),
    authorWorkosUserId: v.string(),
    authorRoles: v.array(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_build", ["buildId"])
    .index("by_build_visibility", ["buildId", "visibility"]),
  buildContractorAssignments: defineTable({
    brokerageId: v.id("brokerages"),
    organizationId: v.string(),
    buildId: v.id("activeBuilds"),
    contractorId: v.id("contractorProfiles"),
    role: v.string(),
    status: v.optional(v.union(v.literal("active"), v.literal("inactive"))),
    startDate: v.optional(v.string()),
    endDate: v.optional(v.string()),
    agreedRateCents: v.optional(v.number()),
    agreedRateUnit: v.optional(contractorPayRateUnitValidator),
    notes: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_build", ["buildId"])
    .index("by_build_contractor", ["buildId", "contractorId"])
    .index("by_organizationId_and_updatedAt", ["organizationId", "updatedAt"]),
  milestoneContractorAssignments: defineTable({
    brokerageId: v.id("brokerages"),
    organizationId: v.string(),
    buildId: v.id("activeBuilds"),
    contractorId: v.id("contractorProfiles"),
    buildContractorAssignmentId: v.id("buildContractorAssignments"),
    buildMilestoneId: v.id("buildMilestones"),
    milestoneKey: v.string(),
    buildSubmilestoneId: v.optional(v.id("buildSubmilestones")),
    submilestoneKey: v.optional(v.string()),
    role: v.string(),
    status: milestoneContractorAssignmentStatusValidator,
    postHoc: v.boolean(),
    agreedRateCents: v.optional(v.number()),
    agreedRateUnit: v.optional(contractorPayRateUnitValidator),
    estimatedHours: v.optional(v.number()),
    actualHours: v.optional(v.number()),
    estimatedCostCents: v.optional(v.number()),
    actualCostCents: v.optional(v.number()),
    costNotes: v.optional(v.string()),
    note: v.optional(v.string()),
    assignedByWorkosUserId: v.string(),
    assignedAt: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_build", ["buildId"])
    .index("by_build_milestone", ["buildId", "milestoneKey"])
    .index("by_contractor", ["contractorId"])
    .index("by_contractor_build", ["contractorId", "buildId"])
    .index("by_submilestone", ["buildId", "milestoneKey", "submilestoneKey"]),
  contractorQualityRatings: defineTable({
    brokerageId: v.id("brokerages"),
    organizationId: v.string(),
    buildId: v.id("activeBuilds"),
    contractorId: v.id("contractorProfiles"),
    buildMilestoneId: v.id("buildMilestones"),
    milestoneKey: v.string(),
    buildSubmilestoneId: v.optional(v.id("buildSubmilestones")),
    submilestoneKey: v.optional(v.string()),
    rating: v.number(),
    source: contractorQualityRatingSourceValidator,
    note: v.optional(v.string()),
    sourceEvidenceKey: v.optional(v.string()),
    sourceVisitId: v.optional(v.string()),
    createdByWorkosUserId: v.string(),
    createdAt: v.number(),
  })
    .index("by_contractor", ["contractorId"])
    .index("by_contractor_build", ["contractorId", "buildId"])
    .index("by_build", ["buildId"])
    .index("by_milestone", ["buildId", "milestoneKey"]),
  buildBrokerAssignments: defineTable({
    brokerageId: v.id("brokerages"),
    organizationId: v.string(),
    buildId: v.id("activeBuilds"),
    assignedBrokerWorkosUserId: v.string(),
    role: v.union(v.literal("primary"), v.literal("support")),
    createdAt: v.number(),
  })
    .index("by_build", ["buildId"])
    .index("by_broker", ["brokerageId", "assignedBrokerWorkosUserId"])
    .index("by_organizationId_and_createdAt", ["organizationId", "createdAt"]),
  loanFacilities: defineTable({
    brokerageId: v.id("brokerages"),
    organizationId: v.string(),
    buildId: v.id("activeBuilds"),
    proposalId: v.id("buildProposals"),
    facilityKind: v.optional(
      v.union(v.literal("construction"), v.literal("homeEquityTakeout"))
    ),
    sourceCapitalEventKey: v.optional(v.string()),
    interestAccrualStartDate: v.optional(v.string()),
    principalCents: v.number(),
    interestAnnualBps: v.number(),
    interestStartsOn: v.literal("funds_released"),
    paybackDate: v.optional(v.string()),
    status: v.union(v.literal("active"), v.literal("closed")),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_build", ["buildId"])
    .index("by_proposal", ["proposalId"]),
  buildCapitalPlans: defineTable({
    brokerageId: v.id("brokerages"),
    organizationId: v.string(),
    buildId: v.id("activeBuilds"),
    proposalId: v.id("buildProposals"),
    borrowerStartingCashCents: v.optional(v.number()),
    // Deprecated migration source. Do not use as a revolving spending limit.
    borrowerWorkingCapitalLimitCents: v.number(),
    lenderDrawPolicyLimitCents: v.number(),
    borrowerCoPayBps: v.number(),
    version: v.number(),
    source: v.union(
      v.literal("proposal_closing_copy"),
      v.literal("approved_budget_revision")
    ),
    supersedesCapitalPlanId: v.optional(v.id("buildCapitalPlans")),
    revisionRequestId: v.optional(v.id("activeBuildBudgetRevisionRequests")),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_build", ["buildId"])
    .index("by_proposal", ["proposalId"]),
  activeBuildBudgetRevisionRequests: defineTable({
    brokerageId: v.id("brokerages"),
    organizationId: v.string(),
    buildId: v.id("activeBuilds"),
    proposalId: v.id("buildProposals"),
    capitalPlanId: v.id("buildCapitalPlans"),
    baseVersion: v.number(),
    priorState: v.any(),
    requestedPayload: v.any(),
    varianceCents: v.number(),
    reason: v.string(),
    requestedByWorkosUserId: v.string(),
    status: v.union(
      v.literal("requested"),
      v.literal("approved"),
      v.literal("rejected")
    ),
    reviewNote: v.optional(v.string()),
    reviewedAt: v.optional(v.number()),
    reviewerWorkosUserId: v.optional(v.string()),
    approvedCapitalPlanId: v.optional(v.id("buildCapitalPlans")),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_build", ["buildId"])
    .index("by_build_status", ["buildId", "status"])
    .index("by_brokerage_status", ["brokerageId", "status"])
    .index("by_proposal", ["proposalId"]),
  activeBuildFacilityChangeRequests: defineTable({
    brokerageId: v.id("brokerages"),
    organizationId: v.string(),
    buildId: v.id("activeBuilds"),
    proposalId: v.id("buildProposals"),
    priorState: v.any(),
    reason: v.optional(v.string()),
    requestedPayload: v.any(),
    requestType: v.union(
      v.literal("principalIncrease"),
      v.literal("paybackExtension")
    ),
    reviewNote: v.optional(v.string()),
    reviewedAt: v.optional(v.number()),
    reviewerWorkosUserId: v.optional(v.string()),
    requestedByWorkosUserId: v.string(),
    status: v.union(
      v.literal("requested"),
      v.literal("approved"),
      v.literal("rejected")
    ),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_build", ["buildId"])
    .index("by_build_status", ["buildId", "status"])
    .index("by_brokerage_status", ["brokerageId", "status"])
    .index("by_proposal", ["proposalId"]),
  buildMilestones: defineTable({
    brokerageId: v.id("brokerages"),
    organizationId: v.string(),
    buildId: v.id("activeBuilds"),
    proposalMilestoneId: v.id("proposalMilestones"),
    key: v.string(),
    name: v.string(),
    order: v.number(),
    budgetCents: v.number(),
    drawAvailabilityCents: v.number(),
    dayStart: v.number(),
    dayEnd: v.number(),
    durationDays: v.number(),
    dependencyKeys: v.array(v.string()),
    completionClaim: v.optional(v.any()),
    completionReview: v.optional(v.any()),
    collaborationEventRevision: v.optional(v.number()),
    collaborationEvidenceEventRevision: v.optional(v.number()),
    evidenceState: v.optional(v.string()),
    isDragLocked: v.optional(v.boolean()),
    policyState: v.optional(v.string()),
    progressPercent: v.optional(v.number()),
    siteVisitGuidance: v.optional(siteVisitGuidanceValidator),
    actualStartedAt: v.optional(v.number()),
    startEventId: v.optional(v.id("milestoneStartEvents")),
    startReportedAt: v.optional(v.number()),
    startedByWorkosUserId: v.optional(v.string()),
    startSource: v.optional(v.string()),
    startedAt: v.optional(v.number()),
    status: v.union(
      v.literal("planned"),
      v.literal("in_progress"),
      v.literal("complete")
    ),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_build", ["buildId"])
    .index("by_build_key", ["buildId", "key"])
    .index("by_build_order", ["buildId", "order"]),
  buildSubmilestones: defineTable({
    brokerageId: v.id("brokerages"),
    organizationId: v.string(),
    buildId: v.id("activeBuilds"),
    buildMilestoneId: v.id("buildMilestones"),
    proposalSubmilestoneId: v.id("proposalSubmilestones"),
    milestoneKey: v.string(),
    key: v.string(),
    name: v.string(),
    order: v.number(),
    budgetCents: v.optional(v.number()),
    actualCostCents: v.optional(v.number()),
    startDay: v.optional(v.number()),
    durationDays: v.optional(v.number()),
    fieldNote: v.optional(v.string()),
    actualStartedAt: v.optional(v.number()),
    startEventId: v.optional(v.id("milestoneStartEvents")),
    startReportedAt: v.optional(v.number()),
    startedByWorkosUserId: v.optional(v.string()),
    startSource: v.optional(v.string()),
    status: v.union(
      v.literal("planned"),
      v.literal("in_progress"),
      v.literal("complete")
    ),
    completedAt: v.optional(v.number()),
    completedByWorkosUserId: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_build", ["buildId"])
    .index("by_milestone", ["buildMilestoneId"]),
  milestoneStartEvents: defineTable({
    actualStartedAt: v.optional(v.number()),
    actorRoles: v.array(v.string()),
    actorWorkosUserId: v.string(),
    brokerageId: v.id("brokerages"),
    buildId: v.id("activeBuilds"),
    buildMilestoneId: v.id("buildMilestones"),
    buildSubmilestoneId: v.optional(v.id("buildSubmilestones")),
    dependencySnapshot: v.array(
      v.object({
        milestoneKey: v.string(),
        milestoneName: v.string(),
        status: v.union(
          v.literal("planned"),
          v.literal("in_progress"),
          v.literal("complete")
        ),
      })
    ),
    eventType: v.union(
      v.literal("started"),
      v.literal("start_corrected"),
      v.literal("start_retracted")
    ),
    idempotencyKey: v.string(),
    milestoneKey: v.string(),
    newLifecycleState: v.union(
      v.literal("planned"),
      v.literal("in_progress"),
      v.literal("complete")
    ),
    organizationId: v.string(),
    originalEventId: v.optional(v.id("milestoneStartEvents")),
    priorActualStartedAt: v.optional(v.number()),
    priorLifecycleState: v.union(
      v.literal("planned"),
      v.literal("in_progress"),
      v.literal("complete")
    ),
    reason: v.optional(v.string()),
    reportedAt: v.number(),
    source: v.string(),
    startParentRequested: v.optional(v.boolean()),
    submilestoneKey: v.optional(v.string()),
    warnings: v.array(v.string()),
  })
    .index("by_organization_idempotency", ["organizationId", "idempotencyKey"])
    .index("by_build", ["buildId"])
    .index("by_target", ["buildId", "milestoneKey", "submilestoneKey"])
    .index("by_original", ["originalEventId"]),
  buildCostItems: defineTable({
    brokerageId: v.id("brokerages"),
    organizationId: v.string(),
    buildId: v.id("activeBuilds"),
    proposalId: v.id("buildProposals"),
    buildMilestoneId: v.id("buildMilestones"),
    proposalCostItemId: v.optional(v.id("proposalCostItems")),
    milestoneKey: v.string(),
    itemKey: v.string(),
    itemType: productionCostItemTypeValidator,
    title: v.string(),
    description: v.optional(v.string()),
    costCents: v.number(),
    quantity: v.number(),
    budgetTreatment: v.optional(productionCostItemBudgetTreatmentValidator),
    budgetSubmilestoneKey: v.optional(v.string()),
    supplier: v.optional(v.string()),
    relevantSubmilestoneKeys: v.array(v.string()),
    createdByWorkosUserId: v.string(),
    updatedByWorkosUserId: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_build", ["buildId"])
    .index("by_build_key", ["buildId", "itemKey"])
    .index("by_build_milestone", ["buildId", "milestoneKey"])
    .index("by_milestone", ["buildMilestoneId"])
    .index("by_proposal", ["proposalId"]),
  plannedDrawScheduleRows: defineTable({
    brokerageId: v.id("brokerages"),
    organizationId: v.string(),
    buildId: v.id("activeBuilds"),
    proposalDrawScheduleRowId: v.id("proposalDrawScheduleRows"),
    buildMilestoneId: v.optional(v.id("buildMilestones")),
    milestoneKey: v.optional(v.string()),
    drawKey: v.string(),
    label: v.string(),
    order: v.number(),
    timingDay: v.number(),
    amountCents: v.number(),
    requestNote: v.optional(v.string()),
    requestReviewNote: v.optional(v.string()),
    requestedAt: v.optional(v.string()),
    reviewedAt: v.optional(v.string()),
    releaseDate: v.optional(v.string()),
    releaseNote: v.optional(v.string()),
    releasedAt: v.optional(v.string()),
    status: productionBuildDrawStatusValidator,
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_build", ["buildId"])
    .index("by_build_order", ["buildId", "order"]),
  activeBuildDrawRequests: defineTable({
    brokerageId: v.id("brokerages"),
    organizationId: v.string(),
    buildId: v.id("activeBuilds"),
    requestKey: v.string(),
    displayId: v.string(),
    clientOperationId: v.string(),
    workOrderKey: v.optional(v.string()),
    plannedDrawKey: v.optional(v.string()),
    label: v.string(),
    amountCents: v.number(),
    status: activeBuildDrawRequestStatusValidator,
    note: v.optional(v.string()),
    operationsRecommendationNote: v.optional(v.string()),
    operationsReviewStartedAt: v.optional(v.string()),
    operationsReviewerWorkosUserId: v.optional(v.string()),
    readyForAdminAt: v.optional(v.string()),
    reviewNote: v.optional(v.string()),
    releaseNote: v.optional(v.string()),
    withdrawalNote: v.optional(v.string()),
    requestedByWorkosUserId: v.string(),
    reviewedByWorkosUserId: v.optional(v.string()),
    withdrawnByWorkosUserId: v.optional(v.string()),
    requestedAt: v.string(),
    reviewedAt: v.optional(v.string()),
    withdrawnAt: v.optional(v.string()),
    releaseDate: v.optional(v.string()),
    releasedAt: v.optional(v.string()),
    collaborationEventRevision: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_build", ["buildId"])
    .index("by_build_status", ["buildId", "status"])
    .index("by_build_operation", ["buildId", "clientOperationId"])
    .index("by_build_request_key", ["buildId", "requestKey"]),
  activeBuildDrawRequestAllocations: defineTable({
    brokerageId: v.id("brokerages"),
    organizationId: v.string(),
    buildId: v.id("activeBuilds"),
    drawRequestId: v.id("activeBuildDrawRequests"),
    buildMilestoneId: v.id("buildMilestones"),
    milestoneKey: v.string(),
    drawGroupKey: v.string(),
    amountCents: v.number(),
    sourceOrder: v.number(),
    createdAt: v.number(),
  })
    .index("by_build", ["buildId"])
    .index("by_request", ["drawRequestId"])
    .index("by_build_milestone", ["buildId", "buildMilestoneId"]),
  buildSiteVisits: defineTable({
    brokerageId: v.id("brokerages"),
    organizationId: v.string(),
    buildId: v.id("activeBuilds"),
    buildMilestoneId: v.id("buildMilestones"),
    milestoneKey: v.string(),
    visitId: v.string(),
    status: v.union(
      v.literal("requested"),
      v.literal("complete"),
      v.literal("cancelled")
    ),
    requestedDay: v.number(),
    requestedAt: v.string(),
    requestedTime: v.optional(v.string()),
    note: v.optional(v.string()),
    siteVisitGuidance: v.optional(siteVisitGuidanceValidator),
    submilestoneKeys: v.optional(v.array(v.string())),
    completedAt: v.optional(v.string()),
    collaborationEventRevision: v.optional(v.number()),
    scheduleIdempotencyKey: v.optional(v.string()),
    scheduleRequestFingerprint: v.optional(v.string()),
    locationAttempt: v.optional(siteVisitLocationAttemptValidator),
    missingPrerequisites: v.optional(v.array(v.string())),
    prerequisiteException: v.optional(siteVisitPrerequisiteExceptionValidator),
    recordNote: v.optional(v.string()),
    recordNoteFormat: v.optional(richTextFormatValidator),
    tokenConsumedAt: v.optional(v.number()),
    tokenExpiresAt: v.number(),
    tokenOpenedAt: v.optional(v.number()),
    url: v.string(),
    workOrderId: v.optional(v.string()),
    evidencePackageId: v.optional(v.string()),
    scopeBoundAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_brokerage", ["brokerageId"])
    .index("by_build", ["buildId"])
    .index("by_build_milestone", ["buildId", "milestoneKey"])
    .index("by_build_schedule_idempotency", [
      "buildId",
      "scheduleIdempotencyKey",
    ])
    .index("by_visit", ["visitId"]),
  siteVisitLinkRecoveryRequests: defineTable({
    brokerageId: v.optional(v.id("brokerages")),
    buildId: v.string(),
    organizationId: v.optional(v.string()),
    originalVisitId: v.string(),
    reason: v.string(),
    reference: v.string(),
    requestedAt: v.number(),
    source: v.union(v.literal("demo"), v.literal("production")),
    status: v.literal("pending"),
    tokenState: v.union(v.literal("consumed"), v.literal("expired")),
  })
    .index("by_reference", ["reference"])
    .index("by_source_visit", ["source", "originalVisitId"]),
  capitalEvents: defineTable({
    brokerageId: v.id("brokerages"),
    organizationId: v.string(),
    buildId: v.id("activeBuilds"),
    capitalEventKey: v.optional(v.string()),
    eventType: v.union(
      v.literal("borrower_copay"),
      v.literal("draw_release"),
      v.literal("cost"),
      v.literal("home_equity_takeout")
    ),
    loanFacilityId: v.optional(v.id("loanFacilities")),
    label: v.string(),
    amountCents: v.number(),
    eventDate: v.string(),
    createdAt: v.number(),
  }).index("by_build", ["buildId"]),
  products: defineTable({
    title: v.string(),
    imageId: v.string(),
    price: v.number(),
  }),
  todos: defineTable({
    text: v.string(),
    completed: v.boolean(),
  }),
  users: defineTable({
    authId: v.string(),
    email: v.string(),
    name: v.string(),
    status: v.optional(v.union(v.literal("active"), v.literal("deleted"))),
    workosUserId: v.optional(v.string()),
    firstName: v.optional(v.string()),
    lastName: v.optional(v.string()),
    emailVerified: v.optional(v.boolean()),
    profilePictureUrl: v.optional(v.string()),
    createdAt: v.optional(v.number()),
    updatedAt: v.optional(v.number()),
    deletedAt: v.optional(v.number()),
    sourceEventId: v.optional(v.string()),
    sourceEventType: v.optional(v.string()),
  })
    .index("authId", ["authId"])
    .index("by_workos_user_id", ["workosUserId"]),
  workosOrganizations: defineTable({
    workosOrganizationId: v.string(),
    name: v.string(),
    status: v.union(v.literal("active"), v.literal("deleted")),
    domains: v.array(v.any()),
    createdAt: v.optional(v.number()),
    updatedAt: v.optional(v.number()),
    deletedAt: v.optional(v.number()),
    sourceEventId: v.string(),
    sourceEventType: v.string(),
  }).index("by_workos_organization_id", ["workosOrganizationId"]),
  workosOrganizationMemberships: defineTable({
    workosMembershipId: v.string(),
    workosUserId: v.string(),
    workosOrganizationId: v.string(),
    status: v.union(
      v.literal("active"),
      v.literal("inactive"),
      v.literal("pending"),
      v.literal("deleted")
    ),
    roleSlug: v.optional(v.string()),
    roleSlugs: v.array(v.string()),
    directoryManaged: v.optional(v.boolean()),
    createdAt: v.optional(v.number()),
    updatedAt: v.optional(v.number()),
    deletedAt: v.optional(v.number()),
    sourceEventId: v.string(),
    sourceEventType: v.string(),
  })
    .index("by_workos_membership_id", ["workosMembershipId"])
    .index("by_user", ["workosUserId"])
    .index("by_user_and_organization", ["workosUserId", "workosOrganizationId"])
    .index("by_organization", ["workosOrganizationId"])
    .index("by_organization_and_status_and_roleSlug", [
      "workosOrganizationId",
      "status",
      "roleSlug",
    ]),
  workosRoles: defineTable({
    slug: v.string(),
    resourceTypeSlug: v.optional(v.string()),
    permissionSlugs: v.array(v.string()),
    status: v.union(v.literal("active"), v.literal("deleted")),
    createdAt: v.optional(v.number()),
    updatedAt: v.optional(v.number()),
    deletedAt: v.optional(v.number()),
    sourceEventId: v.string(),
    sourceEventType: v.string(),
  }).index("by_slug", ["slug"]),
  workosOrganizationRoles: defineTable({
    workosOrganizationId: v.string(),
    slug: v.string(),
    name: v.string(),
    description: v.optional(v.string()),
    resourceTypeSlug: v.optional(v.string()),
    permissionSlugs: v.array(v.string()),
    status: v.union(v.literal("active"), v.literal("deleted")),
    createdAt: v.optional(v.number()),
    updatedAt: v.optional(v.number()),
    deletedAt: v.optional(v.number()),
    sourceEventId: v.string(),
    sourceEventType: v.string(),
  }).index("by_organization_slug", ["workosOrganizationId", "slug"]),
  workosPermissions: defineTable({
    workosPermissionId: v.optional(v.string()),
    slug: v.string(),
    name: v.string(),
    description: v.optional(v.string()),
    system: v.optional(v.boolean()),
    status: v.union(v.literal("active"), v.literal("deleted")),
    createdAt: v.optional(v.number()),
    updatedAt: v.optional(v.number()),
    deletedAt: v.optional(v.number()),
    sourceEventId: v.string(),
    sourceEventType: v.string(),
  }).index("by_slug", ["slug"]),
  workosWebhookReceipts: defineTable({
    eventId: v.string(),
    eventType: v.string(),
    workosCreatedAt: v.optional(v.number()),
    status: v.union(
      v.literal("processing"),
      v.literal("processed"),
      v.literal("failed"),
      v.literal("skipped")
    ),
    processedAt: v.optional(v.number()),
    error: v.optional(v.string()),
  }).index("by_event_id", ["eventId"]),
});
