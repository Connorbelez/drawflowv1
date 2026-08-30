import { defineTable } from "convex/server";
import { v } from "convex/values";
import * as schemaValidators from "./validators";
import { buildPlanningStateValidator } from "../build_collaboration_validators";
import { lenderPortalReviewRequestStateValidator } from "../lender_portal_phase5_contracts";

export const schemaTables = {
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
    currentLenderPortalReviewCycleId: v.optional(
      v.id("lenderPortalReviewCycles")
    ),
    currentLenderPortalReviewCycleNumber: v.optional(v.number()),
    lenderPortalReviewState: v.optional(
      lenderPortalReviewRequestStateValidator
    ),
    reviewDecisionState: v.optional(
      v.union(
        v.literal("in_review"),
        v.literal("ready_for_approval"),
        v.literal("approved"),
        v.literal("reopened")
      )
    ),
    reviewDecisionId: v.optional(v.id("buildMilestoneReviewDecisions")),
    reviewRevision: v.optional(v.number()),
    collaborationEventRevision: v.optional(v.number()),
    collaborationEvidenceEventRevision: v.optional(v.number()),
    workflowRevision: v.optional(v.number()),
    evidenceState: v.optional(v.string()),
    isDragLocked: v.optional(v.boolean()),
    policyState: v.optional(v.string()),
    progressPercent: v.optional(v.number()),
    siteVisitGuidance: v.optional(schemaValidators.siteVisitGuidanceValidator),
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
    planningState: v.optional(buildPlanningStateValidator),
    activationPlanningRevision: v.optional(v.number()),
    scheduledActivationJobId: v.optional(v.string()),
    supersededAt: v.optional(v.number()),
    supersededByPlanningRevision: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_build", ["buildId"])
    .index("by_build_key", ["buildId", "key"])
    .index("by_brokerage", ["brokerageId"])
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
    progressPercent: v.optional(v.number()),
    completionForecastDate: v.optional(v.string()),
    evidencePackageRevisionId: v.optional(
      v.id("buildSubmilestoneEvidencePackageRevisions")
    ),
    evidenceReviewState: v.optional(
      v.union(
        v.literal("not_ready"),
        v.literal("in_review"),
        v.literal("changes_requested"),
        v.literal("approved")
      )
    ),
    evidenceReviewRound: v.optional(v.number()),
    reviewDecisionState: v.optional(
      v.union(
        v.literal("in_review"),
        v.literal("changes_requested"),
        v.literal("approved"),
        v.literal("reopened")
      )
    ),
    reviewDecisionId: v.optional(v.id("buildSubmilestoneReviewDecisions")),
    siteVisitRequirementId: v.optional(
      v.id("buildSubmilestoneSiteVisitRequirements")
    ),
    reviewRevision: v.optional(v.number()),
    completionSubmissionId: v.optional(
      v.id("buildSubmilestoneCompletionSubmissions")
    ),
    workflowRevision: v.optional(v.number()),
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
    planningState: v.optional(buildPlanningStateValidator),
    activationPlanningRevision: v.optional(v.number()),
    scheduledActivationJobId: v.optional(v.string()),
    supersededAt: v.optional(v.number()),
    supersededByPlanningRevision: v.optional(v.number()),
    completedAt: v.optional(v.number()),
    completedByWorkosUserId: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_build", ["buildId"])
    .index("by_milestone", ["buildMilestoneId"])
    .index("by_milestone_and_key", ["buildMilestoneId", "key"])
    .index("by_proposalSubmilestoneId", ["proposalSubmilestoneId"]),
  buildSubmilestoneDocumentLinks: defineTable({
    brokerageId: v.id("brokerages"),
    organizationId: v.string(),
    buildId: v.id("activeBuilds"),
    buildSubmilestoneId: v.id("buildSubmilestones"),
    buildDocumentId: v.id("buildDocuments"),
    visibility:
      schemaValidators.buildSubmilestoneDocumentLinkVisibilityValidator,
    createdByWorkosUserId: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_buildSubmilestoneId", ["buildSubmilestoneId"])
    .index("by_buildId_and_visibility", ["buildId", "visibility"])
    .index("by_buildSubmilestoneId_and_buildDocumentId", [
      "buildSubmilestoneId",
      "buildDocumentId",
    ]),
  buildSubmilestoneSiteVisitRequirements: defineTable({
    brokerageId: v.id("brokerages"),
    organizationId: v.string(),
    buildId: v.id("activeBuilds"),
    buildMilestoneId: v.id("buildMilestones"),
    buildSubmilestoneId: v.id("buildSubmilestones"),
    milestoneKey: v.string(),
    submilestoneKey: v.string(),
    reviewRound: v.number(),
    required: v.boolean(),
    policyRequired: v.boolean(),
    riskRequired: v.boolean(),
    manualRequired: v.boolean(),
    policySignals: v.array(v.string()),
    riskSignals: v.array(v.string()),
    manualSignals: v.array(v.string()),
    status: v.union(
      v.literal("not_required"),
      v.literal("required"),
      v.literal("satisfied"),
      v.literal("waived")
    ),
    siteVisitId: v.optional(v.id("buildSiteVisits")),
    waivedByWorkosUserId: v.optional(v.string()),
    waivedByRole: v.optional(v.string()),
    waivedAt: v.optional(v.number()),
    waiverReason: v.optional(v.string()),
    evaluatedAt: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_submilestone_round", ["buildSubmilestoneId", "reviewRound"])
    .index("by_submilestone_status", ["buildSubmilestoneId", "status"])
    .index("by_build", ["buildId"]),
  buildSubmilestoneReviewDecisions: defineTable({
    brokerageId: v.id("brokerages"),
    organizationId: v.string(),
    buildId: v.id("activeBuilds"),
    buildMilestoneId: v.id("buildMilestones"),
    buildSubmilestoneId: v.id("buildSubmilestones"),
    milestoneKey: v.string(),
    submilestoneKey: v.string(),
    reviewRound: v.number(),
    kind: v.union(
      v.literal("recommendation"),
      v.literal("changes_requested"),
      v.literal("approved"),
      v.literal("site_visit_waived"),
      v.literal("retracted")
    ),
    siteVisitRequired: v.optional(v.boolean()),
    siteVisitId: v.optional(v.id("buildSiteVisits")),
    requirementId: v.optional(v.id("buildSubmilestoneSiteVisitRequirements")),
    remediation: v.optional(v.array(v.string())),
    note: v.optional(v.string()),
    priorState: v.string(),
    newState: v.string(),
    warnings: v.array(v.string()),
    reason: v.optional(v.string()),
    actorWorkosUserId: v.string(),
    actorRoles: v.array(v.string()),
    createdAt: v.number(),
    idempotencyKey: v.string(),
  })
    .index("by_submilestone_round", ["buildSubmilestoneId", "reviewRound"])
    .index("by_submilestone_idempotency", [
      "buildSubmilestoneId",
      "idempotencyKey",
    ])
    .index("by_submilestone_createdAt", ["buildSubmilestoneId", "createdAt"]),
  buildSubmilestoneEvidenceRequirements: defineTable({
    brokerageId: v.id("brokerages"),
    organizationId: v.string(),
    buildId: v.id("activeBuilds"),
    proposalId: v.id("buildProposals"),
    buildMilestoneId: v.id("buildMilestones"),
    buildSubmilestoneId: v.id("buildSubmilestones"),
    milestoneKey: v.string(),
    submilestoneKey: v.string(),
    requirementKey: v.string(),
    label: v.string(),
    description: v.optional(v.string()),
    kind: v.union(
      v.literal("photo"),
      v.literal("document"),
      v.literal("site_visit"),
      v.literal("any")
    ),
    required: v.boolean(),
    locationRequired: v.boolean(),
    revision: v.number(),
    active: v.boolean(),
    createdByWorkosUserId: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_submilestone", ["buildSubmilestoneId", "active"])
    .index("by_build", ["buildId"])
    .index("by_build_milestone", ["buildId", "milestoneKey"])
    .index("by_build_submilestone_requirement", [
      "buildId",
      "buildSubmilestoneId",
      "requirementKey",
      "revision",
    ]),
  buildSubmilestoneEvidencePackageRevisions: defineTable({
    brokerageId: v.id("brokerages"),
    organizationId: v.string(),
    buildId: v.id("activeBuilds"),
    proposalId: v.id("buildProposals"),
    buildMilestoneId: v.id("buildMilestones"),
    buildSubmilestoneId: v.id("buildSubmilestones"),
    milestoneKey: v.string(),
    submilestoneKey: v.string(),
    revision: v.number(),
    requirementsRevision: v.number(),
    status: v.union(v.literal("draft"), v.literal("frozen")),
    supersedesRevisionId: v.optional(
      v.id("buildSubmilestoneEvidencePackageRevisions")
    ),
    createdByWorkosUserId: v.string(),
    createdAt: v.number(),
    frozenByWorkosUserId: v.optional(v.string()),
    frozenAt: v.optional(v.number()),
    updatedAt: v.number(),
  })
    .index("by_submilestone_revision", ["buildSubmilestoneId", "revision"])
    .index("by_submilestone_status", ["buildSubmilestoneId", "status"]),
  buildSubmilestoneEvidencePackageItems: defineTable({
    brokerageId: v.id("brokerages"),
    organizationId: v.string(),
    buildId: v.id("activeBuilds"),
    buildMilestoneId: v.id("buildMilestones"),
    buildSubmilestoneId: v.id("buildSubmilestones"),
    packageRevisionId: v.id("buildSubmilestoneEvidencePackageRevisions"),
    evidenceAssetId: v.id("buildEvidenceAssets"),
    requirementKey: v.string(),
    sourceKind: v.union(
      v.literal("canonical_upload"),
      v.literal("discussion_promotion"),
      v.literal("site_visit")
    ),
    sourceDiscussionAssetId: v.optional(v.id("buildCollaborationAssets")),
    sourceDiscussionPostId: v.optional(v.id("buildCollaborationPosts")),
    sourceUploaderWorkosUserId: v.string(),
    sourceAssetVersion: v.optional(v.number()),
    sourceCapturedAt: v.optional(v.number()),
    sourcePublishedAt: v.optional(v.number()),
    locationVerified: v.boolean(),
    createdAt: v.number(),
  })
    .index("by_package_revision", ["packageRevisionId"])
    .index("by_submilestone", ["buildSubmilestoneId"]),
  buildSubmilestoneEvidencePromotions: defineTable({
    brokerageId: v.id("brokerages"),
    organizationId: v.string(),
    buildId: v.id("activeBuilds"),
    buildMilestoneId: v.id("buildMilestones"),
    buildSubmilestoneId: v.id("buildSubmilestones"),
    packageRevisionId: v.id("buildSubmilestoneEvidencePackageRevisions"),
    evidenceAssetId: v.id("buildEvidenceAssets"),
    sourceDiscussionAssetId: v.id("buildCollaborationAssets"),
    sourceDiscussionPostId: v.optional(v.id("buildCollaborationPosts")),
    sourceAssetVersion: v.number(),
    sourceUploaderWorkosUserId: v.string(),
    sourceCapturedAt: v.optional(v.number()),
    sourcePublishedAt: v.optional(v.number()),
    // Explicit promotion identity/provenance. Legacy promotion rows may not
    // have these fields; new writes persist them so retries and review rounds
    // remain auditable without relying only on the command receipt projection.
    idempotencyKey: v.optional(v.string()),
    fingerprint: v.optional(v.string()),
    requirementKey: v.optional(v.string()),
    reviewRound: v.optional(v.number()),
    workflowRevision: v.optional(v.number()),
    promotedByWorkosUserId: v.string(),
    promotedAt: v.number(),
  })
    .index("by_source_asset", ["sourceDiscussionAssetId"])
    .index("by_package_revision", ["packageRevisionId"]),
  buildSubmilestoneCompletionSubmissions: defineTable({
    brokerageId: v.id("brokerages"),
    organizationId: v.string(),
    buildId: v.id("activeBuilds"),
    buildMilestoneId: v.id("buildMilestones"),
    buildSubmilestoneId: v.id("buildSubmilestones"),
    milestoneKey: v.string(),
    submilestoneKey: v.string(),
    revision: v.number(),
    idempotencyKey: v.string(),
    // A deterministic command/payload fingerprint protects retries from
    // accidentally reusing a key for a different completion declaration.
    // Optional keeps legacy rows readable while all new writes persist it.
    fingerprint: v.optional(v.string()),
    actorWorkosUserId: v.string(),
    actorRoles: v.array(v.string()),
    declaredAt: v.number(),
    progressPercent: v.number(),
    actualCostCents: v.optional(v.number()),
    fieldNote: v.optional(v.string()),
    completionForecastDate: v.optional(v.string()),
    packageRevisionId: v.id("buildSubmilestoneEvidencePackageRevisions"),
  })
    .index("by_submilestone_revision", ["buildSubmilestoneId", "revision"])
    .index("by_submilestone_idempotency", [
      "buildSubmilestoneId",
      "idempotencyKey",
    ]),
  buildSubmilestoneReviewRounds: defineTable({
    brokerageId: v.id("brokerages"),
    organizationId: v.string(),
    buildId: v.id("activeBuilds"),
    buildMilestoneId: v.id("buildMilestones"),
    buildSubmilestoneId: v.id("buildSubmilestones"),
    milestoneKey: v.string(),
    submilestoneKey: v.string(),
    round: v.number(),
    status: v.union(
      v.literal("in_review"),
      v.literal("changes_requested"),
      v.literal("approved")
    ),
    completionSubmissionId: v.id("buildSubmilestoneCompletionSubmissions"),
    packageRevisionId: v.id("buildSubmilestoneEvidencePackageRevisions"),
    enteredByWorkosUserId: v.string(),
    enteredAt: v.number(),
    reviewedByWorkosUserId: v.optional(v.string()),
    reviewedAt: v.optional(v.number()),
    reviewNote: v.optional(v.string()),
    remediation: v.optional(v.array(v.string())),
  })
    .index("by_submilestone_round", ["buildSubmilestoneId", "round"])
    .index("by_submilestone_status", ["buildSubmilestoneId", "status"]),
  buildSubmilestoneCommandReceipts: defineTable({
    organizationId: v.string(),
    buildId: v.id("activeBuilds"),
    buildSubmilestoneId: v.id("buildSubmilestones"),
    command: v.string(),
    // Canonical command payload identity. Legacy receipts may not have a
    // fingerprint; new commands reject such rows as unsafe key reuse.
    fingerprint: v.optional(v.string()),
    idempotencyKey: v.string(),
    resultJson: v.string(),
    createdAt: v.number(),
  }).index("by_submilestone_idempotency", [
    "buildSubmilestoneId",
    "idempotencyKey",
  ]),
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
    workflowRevision: v.optional(v.number()),
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
    itemType: schemaValidators.productionCostItemTypeValidator,
    title: v.string(),
    description: v.optional(v.string()),
    unit: v.optional(v.string()),
    specificationTiptapJson: v.optional(v.string()),
    costCents: v.number(),
    quantity: v.number(),
    // Material solicitation fields belong on canonical Build cost items, not
    // on a parallel quote-planning source. Quote drafts may additionally own
    // explicitly ad-hoc rows without mutating this budget record.
    deliveryLocation: v.optional(v.string()),
    deliveryStartDay: v.optional(v.number()),
    deliveryEndDay: v.optional(v.number()),
    deliveryInstructions: v.optional(v.string()),
    budgetTreatment: v.optional(
      schemaValidators.productionCostItemBudgetTreatmentValidator
    ),
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
  costDocuments: defineTable({
    brokerageId: v.id("brokerages"),
    organizationId: v.string(),
    buildId: v.id("activeBuilds"),
    batchId: v.optional(v.id("costDocumentBatches")),
    draftId: v.optional(v.id("costDocumentDrafts")),
    // Immutable creator provenance for Contractor-owned records. Optional
    // only so pre-cutover Builder/Homeowner rows remain readable; Contractor
    // access fails closed when this value is absent or no longer matches the
    // exact linked profile.
    contractorProfileId: v.optional(v.id("contractorProfiles")),
    // Canonical organization party selected for vendor/supplier/contractor
    // identity. `vendorName` remains as an immutable snapshot and supports
    // explicit unresolved legacy records.
    vendorProfileId: v.optional(v.id("contractorProfiles")),
    kind: v.union(v.literal("invoice"), v.literal("receipt")),
    category: v.union(v.literal("labour"), v.literal("materials")),
    state: v.literal("submitted"),
    title: v.string(),
    description: v.optional(v.string()),
    vendorName: v.string(),
    documentDate: v.string(),
    grossTotalCents: v.number(),
    currency: v.literal("CAD"),
    uploaderWorkosUserId: v.string(),
    uploaderEmailSnapshot: v.string(),
    // Integrity/lifecycle metadata is append-only or lifecycle-only. The
    // submitted source facts above remain immutable after insertion.
    sourceHashDigest: v.optional(v.string()),
    likelyDuplicateFingerprint: v.optional(v.string()),
    duplicateOverrideReason: v.optional(v.string()),
    revisionNumber: v.optional(v.number()),
    supersedesCostDocumentId: v.optional(v.id("costDocuments")),
    supersededByCostDocumentId: v.optional(v.id("costDocuments")),
    supersededAt: v.optional(v.number()),
    voidedAt: v.optional(v.number()),
    voidedByWorkosUserId: v.optional(v.string()),
    voidReason: v.optional(v.string()),
    submittedAt: v.number(),
    createdAt: v.number(),
  })
    .index("by_buildId_and_submittedAt", ["buildId", "submittedAt"])
    .index("by_batchId", ["batchId"])
    .index("by_draftId", ["draftId"])
    .index("by_organizationId_and_vendorProfileId_and_submittedAt", [
      "organizationId",
      "vendorProfileId",
      "submittedAt",
    ])
    .index("by_organizationId_and_submittedAt", [
      "organizationId",
      "submittedAt",
    ])
    .index("by_buildId_and_uploaderWorkosUserId_and_submittedAt", [
      "buildId",
      "uploaderWorkosUserId",
      "submittedAt",
    ])
    .index("by_buildId_and_sourceHashDigest", ["buildId", "sourceHashDigest"])
    .index("by_buildId_and_likelyDuplicateFingerprint", [
      "buildId",
      "likelyDuplicateFingerprint",
    ])
    .index("by_supersedesCostDocumentId", ["supersedesCostDocumentId"]),
  costDocumentPages: defineTable({
    brokerageId: v.id("brokerages"),
    organizationId: v.string(),
    buildId: v.id("activeBuilds"),
    costDocumentId: v.id("costDocuments"),
    assetId: v.id("buildCollaborationAssets"),
    order: v.number(),
    fileNameSnapshot: v.string(),
    mimeTypeSnapshot: v.string(),
    contentHashSha256Snapshot: v.string(),
    createdAt: v.number(),
  })
    .index("by_costDocumentId_and_order", ["costDocumentId", "order"])
    .index("by_costDocumentId_and_assetId", ["costDocumentId", "assetId"])
    .index("by_buildId_and_assetId", ["buildId", "assetId"]),
};
