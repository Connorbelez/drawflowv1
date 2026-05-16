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
  completionPaymentAmount: v.optional(v.number()),
  draw: v.string(),
  drawX: v.optional(v.number()),
  durationDays: v.number(),
  evidence: v.string(),
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
    borrowerCoPayCents: v.optional(v.number()),
    flatDrawFeeCents: v.number(),
    interestAnnualBps: v.number(),
    key: v.string(),
    lenderDrawPolicyLimitCents: v.number(),
    name: v.string(),
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
    plannedEndDate: v.optional(v.string()),
    plannedStartDate: v.optional(v.string()),
    releaseApprovedAt: v.optional(v.number()),
    requestedValueCents: v.number(),
    reviewLagDays: v.optional(v.number()),
    scenario: v.string(),
    status: v.string(),
    updatedAt: v.number(),
  })
    .index("by_build_order", ["buildId", "order"])
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
    milestoneId: v.id("demo_milestones"),
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
    plannedEndDate: v.optional(v.string()),
    plannedStartDate: v.optional(v.string()),
    progressPercent: v.number(),
    requestedAmountCents: v.optional(v.number()),
    requiresSiteVisit: v.boolean(),
    scenario: v.string(),
    status: v.string(),
    submittedAt: v.optional(v.number()),
    type: v.string(),
    updatedAt: v.number(),
  })
    .index("by_build_order", ["buildId", "order"])
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
    milestoneId: v.id("demo_milestones"),
    milestoneKey: v.string(),
    notes: v.string(),
    outcome: v.string(),
    reviewerPersona: v.string(),
    scenario: v.string(),
  }).index("by_milestone", ["scenario", "milestoneKey"]),
  demo_rolloverBuffers: defineTable({
    buildId: v.id("demo_builds"),
    createdAt: v.number(),
    milestoneId: v.id("demo_milestones"),
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
    milestoneId: v.id("demo_milestones"),
    milestoneKey: v.string(),
    notes: v.optional(v.string()),
    recommendedOutcome: v.optional(v.string()),
    riskFlags: v.optional(v.array(v.string())),
    scenario: v.string(),
    status: v.string(),
  })
    .index("by_milestone", ["scenario", "milestoneKey"])
    .index("by_scenario", ["scenario"]),
  demo_timelineSnapshots: defineTable({
    activeSelection: demoActiveMilestoneSelectionValidator,
    capitalSpikes: v.optional(v.array(demoTimelineCapitalSpikeValidator)),
    createdAt: v.number(),
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
