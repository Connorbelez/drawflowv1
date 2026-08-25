import { v } from "convex/values";

import { authenticatedQuery } from "./authz";
import { buildCollaborationRoleValidator } from "./build_collaboration_validators";
import { loadWorkspaceBootstrap } from "./build_submilestone_workspace/bootstrap";
import { loadWorkspaceCollection } from "./build_submilestone_workspace/collections";

const capabilityValidator = v.object({
  allowed: v.boolean(),
  reason: v.optional(v.string()),
});

const capabilitiesValidator = v.object({
  canonical: v.object({
    approveChild: capabilityValidator,
    correctStart: capabilityValidator,
    complete: capabilityValidator,
    retractChildApproval: capabilityValidator,
    retractStart: capabilityValidator,
    reopen: capabilityValidator,
    start: capabilityValidator,
    submitCompletion: capabilityValidator,
    updateEvidence: capabilityValidator,
    updateExecution: capabilityValidator,
    waiveSiteVisit: capabilityValidator,
    uploadEvidence: capabilityValidator,
    promoteEvidence: capabilityValidator,
    addAssignment: capabilityValidator,
    removeAssignment: capabilityValidator,
    readMaterials: capabilityValidator,
    updateMaterials: capabilityValidator,
  }),
  collaboration: v.object({
    addAttachment: capabilityValidator,
    addChecklist: capabilityValidator,
    comment: capabilityValidator,
    createChild: capabilityValidator,
    linkRelation: capabilityValidator,
    unlinkRelation: capabilityValidator,
    repairRelation: capabilityValidator,
    toggleChecklist: capabilityValidator,
  }),
  review: v.object({
    recommend: capabilityValidator,
    requestChanges: capabilityValidator,
  }),
  siteVisit: v.object({
    cancel: capabilityValidator,
    order: capabilityValidator,
  }),
});

const bootstrapVisibleValidator = v.object({
  build: v.object({
    buildId: v.id("activeBuilds"),
    buildName: v.string(),
    location: v.string(),
    startDate: v.string(),
    status: v.string(),
  }),
  capabilities: capabilitiesValidator,
  companion: v.optional(
    v.object({
      actionItemId: v.id("buildActionItems"),
      canonicalBindingRevision: v.optional(v.number()),
      currentRevision: v.number(),
      originatingPostId: v.id("buildCollaborationPosts"),
      requestedActionItemId: v.optional(v.id("buildActionItems")),
    })
  ),
  collaboration: v.object({
    code: v.optional(v.string()),
    message: v.optional(v.string()),
    state: v.union(v.literal("available"), v.literal("degraded")),
  }),
  evidence: v.object({
    evidencePackageRevision: v.optional(v.number()),
    evidencePackageStatus: v.optional(
      v.union(v.literal("draft"), v.literal("frozen"))
    ),
    evidenceReviewState: v.string(),
    itemCount: v.number(),
    partial: v.boolean(),
    requirementCount: v.number(),
    requirements: v.array(
      v.object({
        description: v.optional(v.string()),
        kind: v.union(
          v.literal("photo"),
          v.literal("document"),
          v.literal("site_visit"),
          v.literal("any")
        ),
        label: v.string(),
        locationRequired: v.boolean(),
        required: v.boolean(),
        requirementKey: v.string(),
        status: v.string(),
      })
    ),
  }),
  execution: v.object({
    actualCostCents: v.optional(v.number()),
    actualCompletedAt: v.optional(v.number()),
    actualStartedAt: v.optional(v.number()),
    completionForecastDate: v.optional(v.string()),
    fieldNote: v.optional(v.string()),
    progressPercent: v.number(),
  }),
  milestone: v.object({
    buildMilestoneId: v.id("buildMilestones"),
    drawAvailabilityCents: v.number(),
    key: v.string(),
    name: v.string(),
    planningState: v.string(),
    status: v.string(),
  }),
  overview: v.object({
    actualCostCents: v.optional(v.number()),
    actualCompletedAt: v.optional(v.number()),
    actualStartedAt: v.optional(v.number()),
    budgetCents: v.optional(v.number()),
    executionOwnership: v.object({
      contractorId: v.optional(v.id("contractorProfiles")),
      contractorName: v.optional(v.string()),
      reason: v.string(),
      state: v.string(),
    }),
    fieldNote: v.optional(v.string()),
    forecastDate: v.optional(v.string()),
    plannedDurationDays: v.optional(v.number()),
    plannedStartDay: v.optional(v.number()),
    progressPercent: v.number(),
    status: v.string(),
  }),
  people: v.object({
    assigned: v.number(),
    assignmentRequired: v.boolean(),
    availableContractors: v.array(
      v.object({
        _id: v.id("contractorProfiles"),
        city: v.optional(v.string()),
        defaultPayRateCents: v.optional(v.number()),
        defaultPayRateUnit: v.optional(
          v.union(v.literal("hour"), v.literal("day"), v.literal("fixed"))
        ),
        email: v.optional(v.string()),
        name: v.string(),
        onboardingStatus: v.optional(
          v.union(
            v.literal("profile_only"),
            v.literal("invited"),
            v.literal("account_linked")
          )
        ),
        trades: v.array(v.string()),
      })
    ),
    historyCount: v.number(),
    historyPartial: v.boolean(),
    participants: v.array(
      v.object({
        displayName: v.string(),
        participationPeriod: v.number(),
        redacted: v.boolean(),
        role: buildCollaborationRoleValidator,
        source: v.union(v.literal("derived"), v.literal("grant")),
        workosUserId: v.optional(v.string()),
      })
    ),
    participantsPartial: v.boolean(),
    participantCount: v.number(),
  }),
  materials: v.object({
    equipmentCount: v.optional(v.number()),
    materialCount: v.optional(v.number()),
    partial: v.boolean(),
    totalBudgetCents: v.optional(v.number()),
  }),
  ownership: v.object({
    reason: v.string(),
    state: v.string(),
  }),
  parentReadiness: v.object({
    approvedChildCount: v.number(),
    childCount: v.number(),
    partial: v.boolean(),
    readyForApproval: v.boolean(),
  }),
  persona: buildCollaborationRoleValidator,
  review: v.object({
    evidenceReviewState: v.string(),
    reviewDecisionState: v.string(),
    reviewRound: v.number(),
    siteVisitRequirementStatus: v.optional(v.string()),
  }),
  revisions: v.object({
    canonicalWorkflowRevision: v.number(),
    companionRevision: v.optional(v.number()),
    evidencePackageRevision: v.optional(v.number()),
    parentReviewRevision: v.number(),
    reviewRevision: v.number(),
  }),
  schedule: v.object({
    durationDays: v.optional(v.number()),
    parentDayEnd: v.number(),
    parentDayStart: v.number(),
    startDay: v.optional(v.number()),
  }),
  state: v.union(v.literal("visible"), v.literal("superseded")),
  submilestone: v.object({
    buildSubmilestoneId: v.id("buildSubmilestones"),
    key: v.string(),
    name: v.string(),
    planningState: v.string(),
    proposalSubmilestoneId: v.id("proposalSubmilestones"),
    status: v.string(),
    supersededAt: v.optional(v.number()),
  }),
});

const bootstrapValidator = v.union(
  v.object({ state: v.literal("revoked") }),
  v.object({
    code: v.string(),
    message: v.string(),
    state: v.literal("integrity_error"),
  }),
  bootstrapVisibleValidator
);

const workspaceCollectionValidator = v.union(
  v.literal("evidence_requirements"),
  v.literal("evidence_assets"),
  v.literal("people_assignments"),
  v.literal("people_history"),
  v.literal("materials"),
  v.literal("collaboration_comments"),
  v.literal("collaboration_activity"),
  v.literal("collaboration_revisions"),
  v.literal("collaboration_checklist"),
  v.literal("collaboration_children"),
  v.literal("collaboration_relations"),
  v.literal("review_decisions")
);

const workspaceCollectionRowValidator = v.object({
  amountCents: v.optional(v.number()),
  budgetSubmilestoneKey: v.optional(v.string()),
  budgetTreatment: v.optional(v.string()),
  completed: v.optional(v.boolean()),
  costCents: v.optional(v.number()),
  createdAt: v.optional(v.number()),
  detail: v.optional(v.string()),
  description: v.optional(v.string()),
  id: v.string(),
  itemKey: v.optional(v.string()),
  itemType: v.optional(v.string()),
  kind: v.string(),
  displayName: v.optional(v.string()),
  email: v.optional(v.string()),
  contractorId: v.optional(v.id("contractorProfiles")),
  assignmentId: v.optional(v.id("milestoneContractorAssignments")),
  historyType: v.optional(v.string()),
  actorWorkosUserId: v.optional(v.string()),
  locationRequired: v.optional(v.boolean()),
  locationVerified: v.optional(v.boolean()),
  milestoneKey: v.optional(v.string()),
  sourceDiscussionAssetId: v.optional(v.id("buildCollaborationAssets")),
  sourceDiscussionPostId: v.optional(v.id("buildCollaborationPosts")),
  sourceKind: v.optional(v.string()),
  quantity: v.optional(v.number()),
  relevantSubmilestoneKeys: v.optional(v.array(v.string())),
  required: v.optional(v.boolean()),
  requirementKey: v.optional(v.string()),
  status: v.optional(v.string()),
  supplier: v.optional(v.string()),
  title: v.string(),
  totalCents: v.optional(v.number()),
  unit: v.optional(v.string()),
  updatedAt: v.optional(v.number()),
});

const workspaceCollectionResultValidator = v.union(
  v.object({ state: v.literal("revoked") }),
  v.object({
    code: v.string(),
    message: v.string(),
    state: v.literal("integrity_error"),
  }),
  v.object({
    canonicalWorkflowRevision: v.number(),
    collection: workspaceCollectionValidator,
    companionActionItemId: v.optional(v.id("buildActionItems")),
    companionRevision: v.optional(v.number()),
    collaboration: v.object({
      code: v.optional(v.string()),
      message: v.optional(v.string()),
      state: v.union(v.literal("available"), v.literal("degraded")),
    }),
    hasMore: v.boolean(),
    nextCursor: v.optional(v.string()),
    page: v.array(workspaceCollectionRowValidator),
    partial: v.boolean(),
    state: v.union(v.literal("visible"), v.literal("superseded")),
  })
);


export const getBuildSubmilestoneWorkspaceBootstrap = authenticatedQuery
  .input({
    buildId: v.id("activeBuilds"),
    buildSubmilestoneId: v.id("buildSubmilestones"),
    companionActionItemId: v.optional(v.id("buildActionItems")),
    organizationId: v.string(),
    viewerCapacity: v.optional(buildCollaborationRoleValidator),
  })
  .returns(bootstrapValidator)
  .handler(loadWorkspaceBootstrap)
  .public();

export const getBuildSubmilestoneWorkspaceCollection = authenticatedQuery
  .input({
    buildId: v.id("activeBuilds"),
    buildSubmilestoneId: v.id("buildSubmilestones"),
    companionActionItemId: v.optional(v.id("buildActionItems")),
    collection: workspaceCollectionValidator,
    cursor: v.optional(v.string()),
    limit: v.optional(v.number()),
    organizationId: v.string(),
    viewerCapacity: v.optional(buildCollaborationRoleValidator),
  })
  .returns(workspaceCollectionResultValidator)
  .handler(loadWorkspaceCollection)
  .public();

export {
  resolveBuildSubmilestoneWorkspaceContext,
  resolveCanonicalBuildSubmilestoneWorkspaceContext,
} from "./build_submilestone_workspace/context";
