import { defineTable } from "convex/server";
import { v } from "convex/values";
import * as schemaValidators from "./validators";
import {
  buildCollaborationRoleValidator,
  buildParticipantStatusValidator,
  buildPlanningDiffCategoryValidator,
  buildPlanningDiffChangeTypeValidator,
  buildPlanningRevisionKindValidator,
  buildPlanningStateValidator,
} from "../build_collaboration_validators";
import { proposalReviewPolicySnapshotValidator } from "../lender_portal_phase3";

export const schemaTables = {
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
    scope: schemaValidators.builderStaffPermissionScopeValidator,
    proposalId: v.optional(v.id("buildProposals")),
    buildId: v.optional(v.id("activeBuilds")),
    resourceType: schemaValidators.builderStaffPermissionResourceValidator,
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
    .index("by_buildId_and_workosUserId", ["buildId", "workosUserId"])
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
    status: schemaValidators.productionProposalStatusValidator,
    reviewOutcome: schemaValidators.productionReviewOutcomeValidator,
    totalBudgetCents: v.number(),
    borrowerStartingCashCents: v.optional(v.number()),
    // Deprecated migration source. Do not use as a revolving spending limit.
    borrowerWorkingCapitalLimitCents: v.number(),
    lenderDrawPolicyLimitCents: v.number(),
    borrowerCoPayBps: v.number(),
    capitalSource: v.optional(
      v.union(v.literal("internal"), v.literal("external"))
    ),
    borrowerCoPayCents: v.optional(v.number()),
    interestAnnualBps: v.optional(v.number()),
    timelineCurrentDay: v.optional(v.number()),
    timelineProgressValue: v.optional(v.number()),
    timelineRangeMax: v.optional(v.number()),
    timelineRangeMin: v.optional(v.number()),
    timelineRouteState: v.optional(v.any()),
    timelineMinimumCashReserveCents: v.optional(v.number()),
    timelineStartingCashCents: v.optional(v.number()),
    selectedPlan: v.optional(schemaValidators.productionSelectedPlanValidator),
    proposedStartDate: v.optional(v.string()),
    templateId: v.optional(v.id("proposalTemplates")),
    workflowRuleSnapshotId: v.optional(v.id("workflowRuleSnapshots")),
    currentProposalRevisionId: v.optional(v.id("proposalRevisions")),
    currentProposalRevisionNumber: v.optional(v.number()),
    latestLenderReviewedRevisionId: v.optional(v.id("proposalRevisions")),
    latestLenderReviewedRevisionNumber: v.optional(v.number()),
    latestLenderApprovalId: v.optional(v.id("proposalLenderApprovals")),
    currentReviewPolicyVersionId: v.optional(
      v.id("proposalReviewPolicyVersions")
    ),
    lockedReviewPolicyId: v.optional(v.id("proposalReviewPolicyLocks")),
    activeBuildId: v.optional(v.id("activeBuilds")),
    submittedAt: v.optional(v.number()),
    approvedAt: v.optional(v.number()),
    backOfficeApprovedByWorkosUserId: v.optional(v.string()),
    closedAt: v.optional(v.number()),
    createdByWorkosUserId: v.string(),
    updatedByWorkosUserId: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_brokerage", ["brokerageId"])
    .index("by_brokerage_and_organization", ["brokerageId", "organizationId"])
    .index("by_brokerage_status", ["brokerageId", "status"])
    .index("by_brokerage_status_builder", [
      "brokerageId",
      "status",
      "builderProfileId",
    ])
    .index("by_builder", ["builderProfileId"])
    .index("by_active_build", ["activeBuildId"]),
  activeBuildPlanningRevisions: defineTable({
    brokerageId: v.id("brokerages"),
    buildId: v.id("activeBuilds"),
    organizationId: v.string(),
    revision: v.number(),
    kind: buildPlanningRevisionKindValidator,
    sourceCommand: v.string(),
    actorWorkosUserId: v.string(),
    actorRoles: v.array(v.string()),
    reason: v.string(),
    approvedAt: v.number(),
    previousRevision: v.optional(v.number()),
    diffCount: v.number(),
    summary: v.string(),
    createdAt: v.number(),
  })
    .index("by_build_revision", ["buildId", "revision"])
    .index("by_build_kind", ["buildId", "kind"])
    .index("by_build_approvedAt", ["buildId", "approvedAt"]),
  activeBuildPlanningRevisionEntities: defineTable({
    brokerageId: v.id("brokerages"),
    buildId: v.id("activeBuilds"),
    organizationId: v.string(),
    revisionId: v.id("activeBuildPlanningRevisions"),
    revision: v.number(),
    entityType: v.string(),
    entityKey: v.string(),
    canonicalId: v.optional(v.string()),
    planningState: buildPlanningStateValidator,
    snapshotJson: v.string(),
    createdAt: v.number(),
  })
    .index("by_revision", ["revisionId"])
    .index("by_build_revision_entity", [
      "buildId",
      "revision",
      "entityType",
      "entityKey",
    ])
    .index("by_build_entity", ["buildId", "entityType", "entityKey"]),
  activeBuildPlanningRevisionDiffs: defineTable({
    brokerageId: v.id("brokerages"),
    buildId: v.id("activeBuilds"),
    organizationId: v.string(),
    revisionId: v.id("activeBuildPlanningRevisions"),
    revision: v.number(),
    category: buildPlanningDiffCategoryValidator,
    entityType: v.string(),
    entityKey: v.string(),
    field: v.string(),
    changeType: buildPlanningDiffChangeTypeValidator,
    priorValue: v.optional(v.any()),
    nextValue: v.optional(v.any()),
    createdAt: v.number(),
  })
    .index("by_revision", ["revisionId"])
    .index("by_build_revision", ["buildId", "revision"])
    .index("by_build_entity", ["buildId", "entityType", "entityKey"]),
  activeBuildPlanningRevisionChunks: defineTable({
    brokerageId: v.id("brokerages"),
    buildId: v.id("activeBuilds"),
    chunkIndex: v.number(),
    chunkKind: v.union(v.literal("entities"), v.literal("diffs")),
    createdAt: v.number(),
    organizationId: v.string(),
    payloadJson: v.string(),
    revision: v.number(),
    revisionId: v.id("activeBuildPlanningRevisions"),
    /**
     * Transient scheduler recovery metadata.  These fields are mutable by the
     * bounded sweeper; the revision and captured payload remain immutable.
     */
    materializationRecoveryAttemptCount: v.optional(v.number()),
    materializationRecoveryExhaustedAt: v.optional(v.number()),
    materializationRecoveryState: v.optional(
      v.union(v.literal("pending"), v.literal("exhausted"))
    ),
    materializationLastScheduledAt: v.optional(v.number()),
  })
    .index("by_revision", ["revisionId"])
    .index("by_revision_and_kind_and_index", [
      "revisionId",
      "chunkKind",
      "chunkIndex",
    ])
    .index("by_materialization_recovery_state", [
      "materializationRecoveryState",
    ])
    .index("by_build", ["buildId"]),
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
    // Build-local date scheduling is only authoritative when this canonical
    // IANA timezone is present. Historical rows may omit it and therefore
    // remain in an explicit unknown/recovery state.
    timezone: v.optional(v.string()),
    status: schemaValidators.productionBuildStatusValidator,
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
    legacyPolicyResolutionIssueId: v.optional(
      v.id("proposalPhase3MigrationIssues")
    ),
    reviewPolicyLockId: v.optional(v.id("proposalReviewPolicyLocks")),
    reviewPolicySnapshot: v.optional(proposalReviewPolicySnapshotValidator),
    reviewPolicyLockEvidence: v.optional(
      v.object({
        activeLenderMemberCount: v.number(),
        eligibleLenderApproverCount: v.optional(v.number()),
        eligibleLenderApproverCounts: v.optional(
          v.object({
            draw: v.number(),
            milestone: v.number(),
            proposalReview: v.number(),
          })
        ),
        assignmentId: v.union(v.id("proposalLenderAssignments"), v.null()),
        lenderOrganizationId: v.union(v.id("lenderOrganizations"), v.null()),
        lockedAt: v.number(),
        lockedByWorkosUserId: v.string(),
        policyVersionId: v.id("proposalReviewPolicyVersions"),
        proposalRevisionId: v.id("proposalRevisions"),
        proposalRevisionNumber: v.number(),
      })
    ),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_proposal", ["proposalId"])
    .index("by_brokerage", ["brokerageId"])
    .index("by_brokerage_and_buildName", ["brokerageId", "buildName"])
    .index("by_brokerage_and_location", ["brokerageId", "location"])
    .index("by_brokerage_and_startDate", ["brokerageId", "startDate"])
    .index("by_brokerage_and_totalBudgetCents", [
      "brokerageId",
      "totalBudgetCents",
    ])
    .index("by_brokerage_and_updatedAt", ["brokerageId", "updatedAt"])
    .index("by_organizationId", ["organizationId"])
    .index("by_status_and_timezone", ["status", "timezone"]),
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
  buildSubmilestoneCompanionCutoverRuns: defineTable({
    organizationId: v.string(),
    brokerageId: v.id("brokerages"),
    buildId: v.id("activeBuilds"),
    planToken: v.string(),
    planVersion: v.string(),
    status: v.union(
      v.literal("seeding_reports"),
      v.literal("repairing"),
      v.literal("materializing"),
      v.literal("checking_parity"),
      v.literal("complete"),
      v.literal("blocked")
    ),
    batchSize: v.number(),
    milestoneIds: v.array(v.id("buildMilestones")),
    lastParityRecordKey: v.optional(v.string()),
    nextReportOrdinal: v.number(),
    nextMilestoneOrdinal: v.number(),
    nextSeedOrdinal: v.number(),
    reportCount: v.number(),
    activeSubmilestoneCount: v.number(),
    healthyCount: v.number(),
    missingCount: v.number(),
    duplicateCount: v.number(),
    malformedCount: v.number(),
    crossScopeCount: v.number(),
    historicalCount: v.number(),
    repairedCount: v.number(),
    materializedCount: v.number(),
    exceptionCount: v.number(),
    parityCheckedCount: v.number(),
    parityMismatchCount: v.number(),
    manualActionItemCount: v.number(),
    generatedCompanionCount: v.number(),
    reportHash: v.optional(v.string()),
    lastError: v.optional(v.string()),
    startedByWorkosUserId: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
    completedAt: v.optional(v.number()),
  })
    .index("by_buildId_and_planToken", ["buildId", "planToken"])
    .index("by_buildId_and_status", ["buildId", "status"])
    .index("by_buildId_and_updatedAt", ["buildId", "updatedAt"])
    .index("by_organizationId_and_updatedAt", ["organizationId", "updatedAt"]),
  buildSubmilestoneCompanionCutoverReports: defineTable({
    organizationId: v.string(),
    brokerageId: v.id("brokerages"),
    buildId: v.id("activeBuilds"),
    runId: v.id("buildSubmilestoneCompanionCutoverRuns"),
    ordinal: v.number(),
    reportId: v.string(),
    recordKey: v.string(),
    buildSubmilestoneId: v.optional(v.id("buildSubmilestones")),
    candidateActionItemIds: v.array(v.id("buildActionItems")),
    classification: v.union(
      v.literal("healthy"),
      v.literal("missing"),
      v.literal("duplicate"),
      v.literal("malformed"),
      v.literal("cross_scope"),
      v.literal("incorrectly_superseded"),
      v.literal("historical")
    ),
    snapshotHash: v.string(),
    outcome: v.union(
      v.literal("pending"),
      v.literal("unchanged"),
      v.literal("repaired"),
      v.literal("materialized"),
      v.literal("historical"),
      v.literal("exception")
    ),
    survivorActionItemId: v.optional(v.id("buildActionItems")),
    historyCountsJson: v.optional(v.string()),
    exceptionReason: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_runId_and_ordinal", ["runId", "ordinal"])
    .index("by_runId_and_recordKey", ["runId", "recordKey"])
    .index("by_buildSubmilestoneId_and_createdAt", [
      "buildSubmilestoneId",
      "createdAt",
    ]),
  buildDocuments: defineTable({
    brokerageId: v.id("brokerages"),
    organizationId: v.string(),
    buildId: v.id("activeBuilds"),
    proposalId: v.id("buildProposals"),
    documentType: schemaValidators.productionDocumentTypeValidator,
    status: schemaValidators.buildDocumentStatusValidator,
    fileName: v.string(),
    mimeType: v.string(),
    sizeBytes: v.number(),
    storageId: v.optional(v.id("_storage")),
    // A Build Document may be the durable document projection of a scanned,
    // versioned collaboration asset. Recipient-visible package sources resolve
    // through a clean governed asset; this pointer contributes scan state and
    // immutable SHA-256 provenance without a parallel file model. Keep this
    // optional for legacy documents.
    governedAssetId: v.optional(v.id("buildCollaborationAssets")),
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
    evidencePackageRevisionId: v.optional(
      v.id("buildSubmilestoneEvidencePackageRevisions")
    ),
    sourceDiscussionAssetId: v.optional(v.id("buildCollaborationAssets")),
    sourceDiscussionAssetVersion: v.optional(v.number()),
    sourceDiscussionUploadedByWorkosUserId: v.optional(v.string()),
    sourceDiscussionPostId: v.optional(v.id("buildCollaborationPosts")),
    sourceDiscussionCapturedAt: v.optional(v.number()),
    sourceDiscussionPublishedAt: v.optional(v.number()),
    sourceDiscussionOwnerKind: v.optional(v.string()),
    sourceDiscussionOwnerRecordId: v.optional(v.string()),
    promotedByWorkosUserId: v.optional(v.string()),
    promotedAt: v.optional(v.number()),
    source: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_build", ["buildId"])
    .index("by_build_key", ["buildId", "evidenceKey"])
    .index("by_build_milestone", ["buildId", "milestoneKey"])
    .index("by_build_milestone_submilestone", [
      "buildId",
      "milestoneKey",
      "submilestoneKey",
    ])
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
    .index("by_build_visibility", ["buildId", "visibility"])
    .index("by_organizationId_and_buildId", ["organizationId", "buildId"]),
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
    agreedRateUnit: v.optional(schemaValidators.contractorPayRateUnitValidator),
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
    status: schemaValidators.milestoneContractorAssignmentStatusValidator,
    postHoc: v.boolean(),
    agreedRateCents: v.optional(v.number()),
    agreedRateUnit: v.optional(schemaValidators.contractorPayRateUnitValidator),
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
  buildBrokerAssignments: defineTable({
    brokerageId: v.id("brokerages"),
    organizationId: v.string(),
    buildId: v.id("activeBuilds"),
    assignedBrokerWorkosUserId: v.string(),
    role: v.union(v.literal("primary"), v.literal("support")),
    createdAt: v.number(),
  })
    .index("by_build", ["buildId"])
    .index("by_build_and_assignedBrokerWorkosUserId", [
      "buildId",
      "assignedBrokerWorkosUserId",
    ])
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
    // Explicit closure timestamp lets retention use the later Build/Loan
    // closure without inferring from a mutable updatedAt value.
    closedAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_build", ["buildId"])
    .index("by_brokerage", ["brokerageId"])
    .index("by_proposal", ["proposalId"]),
};
