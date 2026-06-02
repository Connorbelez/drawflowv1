import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

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

const demoTimelineMilestoneDataValidator = v.object({
  amount: v.number(),
  completionClaim: v.optional(
    v.object({
      actualCost: v.optional(v.number()),
      completedDay: v.number(),
      note: v.optional(v.string()),
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
          note: v.optional(v.string()),
          requestedAt: v.string(),
          requestedDay: v.number(),
        })
      ),
      status: v.union(v.literal("approved"), v.literal("revisionRequested")),
    })
  ),
  draw: v.string(),
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
  status: demoTimelineStatusValidator,
  subMilestones: v.optional(v.array(v.string())),
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
  id: v.string(),
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

const siteVisitGuidanceValidator = v.object({
  cameraAngles: v.array(v.string()),
  whatToVerify: v.array(v.string()),
});

const productionBuildStatusValidator = v.union(
  v.literal("active"),
  v.literal("future_start")
);

const productionBuildDrawStatusValidator = v.union(
  v.literal("planned"),
  v.literal("requested"),
  v.literal("approved"),
  v.literal("rejected"),
  v.literal("released")
);

const contractorKindValidator = v.union(
  v.literal("company"),
  v.literal("individual")
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

const productionOutboxStatusValidator = v.union(
  v.literal("pending"),
  v.literal("processed"),
  v.literal("failed")
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
    milestoneId: v.union(
      v.id("demo_milestones"),
      v.id("demo_timelineMilestones")
    ),
    milestoneKey: v.string(),
    notes: v.optional(v.string()),
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
    capitalSpikes: v.optional(v.array(demoTimelineCapitalSpikeValidator)),
    createdAt: v.number(),
    currentDay: v.optional(v.number()),
    draws: v.array(demoTimelineDrawValidator),
    items: v.array(demoTimelineItemValidator),
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
    .index("by_organization", ["organizationId"]),
  builderAccountLinks: defineTable({
    brokerageId: v.id("brokerages"),
    builderProfileId: v.id("builderProfiles"),
    workosUserId: v.string(),
    role: v.union(v.literal("owner"), v.literal("staff")),
    status: v.union(v.literal("active"), v.literal("inactive")),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_builder", ["builderProfileId"])
    .index("by_user", ["workosUserId"])
    .index("by_builder_user", ["builderProfileId", "workosUserId"]),
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
    phone: v.optional(v.string()),
    trades: v.array(v.string()),
    defaultPayRateCents: v.optional(v.number()),
    defaultPayRateUnit: v.optional(contractorPayRateUnitValidator),
    accountWorkosUserId: v.optional(v.string()),
    onboardingStatus: v.optional(contractorOnboardingStatusValidator),
    status: v.union(v.literal("active"), v.literal("inactive")),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_brokerage", ["brokerageId"])
    .index("by_account_user", ["accountWorkosUserId"]),
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
    status: productionProposalStatusValidator,
    reviewOutcome: productionReviewOutcomeValidator,
    totalBudgetCents: v.number(),
    borrowerWorkingCapitalLimitCents: v.number(),
    lenderDrawPolicyLimitCents: v.number(),
    borrowerCoPayBps: v.number(),
    timelineCurrentDay: v.optional(v.number()),
    timelineProgressValue: v.optional(v.number()),
    timelineRangeMax: v.optional(v.number()),
    timelineRangeMin: v.optional(v.number()),
    timelineRouteState: v.optional(v.any()),
    timelineMinimumCashReserveCents: v.optional(v.number()),
    timelineStartingCashCents: v.optional(v.number()),
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
    uploadedByWorkosUserId: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_proposal", ["proposalId"])
    .index("by_proposal_type", ["proposalId", "documentType"]),
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
    eventKind: v.union(v.literal("cost"), v.literal("cashInfusion")),
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
  activeBuilds: defineTable({
    brokerageId: v.id("brokerages"),
    organizationId: v.string(),
    proposalId: v.id("buildProposals"),
    builderProfileId: v.id("builderProfiles"),
    workflowRuleSnapshotId: v.id("workflowRuleSnapshots"),
    buildName: v.string(),
    location: v.string(),
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
    timelineStartingCashCents: v.optional(v.number()),
    totalBudgetCents: v.number(),
    permitDocumentId: v.optional(v.id("proposalDocuments")),
    permitWaiverId: v.optional(v.id("documentWaivers")),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_proposal", ["proposalId"])
    .index("by_brokerage", ["brokerageId"]),
  buildDocuments: defineTable({
    brokerageId: v.id("brokerages"),
    organizationId: v.string(),
    buildId: v.id("activeBuilds"),
    proposalId: v.id("buildProposals"),
    documentType: productionDocumentTypeValidator,
    status: productionDocumentStatusValidator,
    fileName: v.string(),
    mimeType: v.string(),
    sizeBytes: v.number(),
    storageId: v.optional(v.id("_storage")),
    uploadedByWorkosUserId: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_build", ["buildId"])
    .index("by_build_type", ["buildId", "documentType"]),
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
    locationVerified: v.boolean(),
    source: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_build", ["buildId"])
    .index("by_build_key", ["buildId", "evidenceKey"])
    .index("by_build_milestone", ["buildId", "milestoneKey"]),
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
    .index("by_build_contractor", ["buildId", "contractorId"]),
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
    .index("by_broker", ["brokerageId", "assignedBrokerWorkosUserId"]),
  loanFacilities: defineTable({
    brokerageId: v.id("brokerages"),
    organizationId: v.string(),
    buildId: v.id("activeBuilds"),
    proposalId: v.id("buildProposals"),
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
    borrowerWorkingCapitalLimitCents: v.number(),
    lenderDrawPolicyLimitCents: v.number(),
    borrowerCoPayBps: v.number(),
    version: v.number(),
    source: v.literal("proposal_closing_copy"),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_build", ["buildId"])
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
    evidenceState: v.optional(v.string()),
    isDragLocked: v.optional(v.boolean()),
    policyState: v.optional(v.string()),
    progressPercent: v.optional(v.number()),
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
    durationDays: v.optional(v.number()),
    status: v.union(
      v.literal("planned"),
      v.literal("in_progress"),
      v.literal("complete")
    ),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_build", ["buildId"])
    .index("by_milestone", ["buildMilestoneId"]),
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
    note: v.optional(v.string()),
    completedAt: v.optional(v.string()),
    recordNote: v.optional(v.string()),
    tokenConsumedAt: v.optional(v.number()),
    tokenExpiresAt: v.number(),
    tokenOpenedAt: v.optional(v.number()),
    url: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_build", ["buildId"])
    .index("by_build_milestone", ["buildId", "milestoneKey"])
    .index("by_visit", ["visitId"]),
  capitalEvents: defineTable({
    brokerageId: v.id("brokerages"),
    organizationId: v.string(),
    buildId: v.id("activeBuilds"),
    capitalEventKey: v.optional(v.string()),
    eventType: v.union(
      v.literal("borrower_copay"),
      v.literal("draw_release"),
      v.literal("cost")
    ),
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
    .index("by_organization", ["workosOrganizationId"]),
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
