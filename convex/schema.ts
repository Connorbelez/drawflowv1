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
    storageId: v.optional(v.id("_storage")),
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
    storageId: v.optional(v.id("_storage")),
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
  }).index("authId", ["authId"]),
});
