import { defineTable } from "convex/server";
import { v } from "convex/values";
import {
  lenderProposalSnapshotDecisionValidator,
  lenderProposalSnapshotDocumentValidator,
  lenderProposalSnapshotRevisionValidator,
  proposalLifecycleProjectionValidator,
  proposalReviewPolicySnapshotValidator,
  proposalRevisionCheckpointNameValidator,
  proposalRevisionCheckpointSnapshotValidator,
  proposalRevisionMilestoneValidator,
} from "../lender_portal_phase3";
import { proposalConfirmationCycleStatusValidator } from "../lender_portal_phase4";
import {
  lenderPortalReviewDecisionValidator,
  lenderPortalReviewEvidenceReferenceValidator,
  lenderPortalReviewerRoleValidator,
  lenderPortalReviewGroupValidator,
  lenderPortalReviewRequestKindValidator,
  lenderPortalReviewRequestStateValidator,
  lenderPortalReviewRequirementsValidator,
  lenderPortalReviewSubmissionSnapshotValidator,
} from "../lender_portal_phase5_contracts";
import {
  costItemValidator,
  documentValidator,
  milestoneValidator,
  proposalDrawValidator,
  proposalRevisionLenderContentSnapshotValidator,
  submilestoneValidator,
} from "../production_proposal_detail";
import * as schemaValidators from "./validators";

export const schemaTables = {
  proposalLenderAssignments: defineTable({
    brokerageId: v.id("brokerages"),
    organizationId: v.string(),
    proposalId: v.id("buildProposals"),
    lenderBrokerageId: v.id("brokerages"),
    // During the cutover this accepts the legacy WorkOS id so the migration
    // can normalize existing history in place. New records always contain
    // an Id<"lenderOrganizations"> and preserve the legacy id separately.
    lenderOrganizationId: v.union(v.string(), v.id("lenderOrganizations")),
    legacyLenderOrganizationId: v.optional(v.string()),
    lenderOrganizationName: v.string(),
    organizationReviewPolicyVersion: v.optional(v.number()),
    organizationReviewPolicyVersionId: v.optional(
      v.id("lenderOrganizationReviewPolicyVersions")
    ),
    reviewPolicyProvenance: v.optional(
      v.union(
        v.literal("build_override"),
        v.literal("organization_default"),
        v.literal("system_baseline")
      )
    ),
    reviewPolicyVersionId: v.optional(v.id("proposalReviewPolicyVersions")),
    status: v.union(
      v.literal("current"),
      v.literal("archiving"),
      v.literal("withdrawn")
    ),
    archiveManifestId: v.optional(v.id("proposalLenderAssignmentManifests")),
    assignedAt: v.number(),
    assignedByWorkosUserId: v.string(),
    assignedByRole: v.string(),
    withdrawnAt: v.optional(v.number()),
    withdrawnByWorkosUserId: v.optional(v.string()),
    withdrawnByRole: v.optional(v.string()),
    withdrawalReason: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index("by_proposal", ["proposalId"])
    .index("by_proposal_status", ["proposalId", "status"])
    .index("by_proposal_lender_organization", [
      "proposalId",
      "lenderOrganizationId",
    ])
    .index("by_lender_organization", ["lenderOrganizationId"]),
  proposalLenderAssignmentManifests: defineTable({
    assignmentId: v.id("proposalLenderAssignments"),
    brokerageId: v.id("brokerages"),
    capturedAt: v.number(),
    lenderOrganizationId: v.id("lenderOrganizations"),
    lifecycleSnapshot: proposalLifecycleProjectionValidator,
    organizationId: v.string(),
    proposalId: v.id("buildProposals"),
    proposalSnapshot: v.object({
      buildName: v.string(),
      location: v.string(),
      status: schemaValidators.productionProposalStatusValidator,
    }),
    status: v.union(
      v.literal("building"),
      v.literal("failed"),
      v.literal("sealed")
    ),
    phase: v.union(
      v.literal("documents"),
      v.literal("revisions"),
      v.literal("decisions"),
      v.literal("complete")
    ),
    cursor: v.optional(v.union(v.string(), v.null())),
    documentCreationTimeCutoff: v.optional(v.number()),
    documentCutoffVersion: v.optional(v.literal(1)),
    attemptCount: v.optional(v.number()),
    failedAt: v.optional(v.number()),
    failureReason: v.optional(v.string()),
    lastAttemptAt: v.optional(v.number()),
    lastRetryReason: v.optional(v.string()),
    lastRetryRequestedAt: v.optional(v.number()),
    lastRetryRequestedByWorkosUserId: v.optional(v.string()),
    reviewPolicyVersionId: v.optional(v.id("proposalReviewPolicyVersions")),
    sealedAt: v.optional(v.number()),
    version: v.literal(2),
  })
    .index("by_assignment", ["assignmentId"])
    .index("by_proposal", ["proposalId"])
    .index("by_lender_organization", ["lenderOrganizationId"]),
  proposalLenderAssignmentManifestDocuments: defineTable(
    lenderProposalSnapshotDocumentValidator.omit("storageUrl").extend({
      manifestId: v.id("proposalLenderAssignmentManifests"),
    })
  )
    .index("by_manifest", ["manifestId"])
    .index("by_manifest_and_document", ["manifestId", "documentId"]),
  proposalLenderAssignmentManifestRevisions: defineTable(
    lenderProposalSnapshotRevisionValidator.extend({
      manifestId: v.id("proposalLenderAssignmentManifests"),
    })
  )
    .index("by_manifest", ["manifestId"])
    .index("by_manifest_and_revision", ["manifestId", "revisionId"]),
  proposalLenderAssignmentManifestDecisions: defineTable(
    lenderProposalSnapshotDecisionValidator.extend({
      manifestId: v.id("proposalLenderAssignmentManifests"),
    })
  )
    .index("by_manifest", ["manifestId"])
    .index("by_manifest_and_approval", ["manifestId", "approvalId"]),
  proposalReviewPolicyVersions: defineTable({
    brokerageId: v.id("brokerages"),
    organizationId: v.string(),
    proposalId: v.id("buildProposals"),
    version: v.number(),
    policy: proposalReviewPolicySnapshotValidator,
    configuredByWorkosUserId: v.string(),
    configuredByRole: v.string(),
    configuredAt: v.number(),
    reason: v.string(),
    idempotencyKey: v.string(),
    provenance: v.optional(
      v.union(
        v.literal("build_override"),
        v.literal("organization_default"),
        v.literal("system_baseline")
      )
    ),
    sourceLenderOrganizationId: v.optional(v.id("lenderOrganizations")),
    sourceLenderOrganizationName: v.optional(v.string()),
    sourceOrganizationReviewPolicyVersion: v.optional(v.number()),
    sourceOrganizationReviewPolicyVersionId: v.optional(
      v.id("lenderOrganizationReviewPolicyVersions")
    ),
  })
    .index("by_proposal", ["proposalId"])
    .index("by_proposal_and_version", ["proposalId", "version"])
    .index("by_proposal_and_idempotency_key", ["proposalId", "idempotencyKey"]),
  proposalRevisions: defineTable({
    brokerageId: v.id("brokerages"),
    organizationId: v.string(),
    proposalId: v.id("buildProposals"),
    assignmentId: v.optional(v.id("proposalLenderAssignments")),
    revisionNumber: v.number(),
    checkpoints: proposalRevisionCheckpointSnapshotValidator,
    changedCheckpoints: v.array(proposalRevisionCheckpointNameValidator),
    priorLenderReviewedRevisionId: v.optional(v.id("proposalRevisions")),
    reviewPolicyVersionId: v.id("proposalReviewPolicyVersions"),
    backOfficeApprovedByWorkosUserId: v.string(),
    createdByWorkosUserId: v.string(),
    createdByRole: v.string(),
    createdAt: v.number(),
    reason: v.string(),
    idempotencyKey: v.string(),
  })
    .index("by_proposal", ["proposalId"])
    .index("by_proposal_and_revision_number", ["proposalId", "revisionNumber"])
    .index("by_proposal_and_idempotency_key", ["proposalId", "idempotencyKey"])
    .index("by_assignment_and_revision_number", [
      "assignmentId",
      "revisionNumber",
    ])
    .index("by_assignment_and_created_at", ["assignmentId", "createdAt"]),
  proposalRevisionMilestones: defineTable(
    proposalRevisionMilestoneValidator.extend({
      brokerageId: v.id("brokerages"),
      organizationId: v.string(),
      proposalId: v.id("buildProposals"),
      revisionId: v.id("proposalRevisions"),
    })
  )
    .index("by_revision", ["revisionId"])
    .index("by_revision_and_order", ["revisionId", "order"]),
  proposalRevisionLenderContentSnapshots: defineTable(
    proposalRevisionLenderContentSnapshotValidator.extend({
      brokerageId: v.id("brokerages"),
      organizationId: v.string(),
      proposalId: v.id("buildProposals"),
      revisionId: v.id("proposalRevisions"),
    })
  ).index("by_revision", ["revisionId"]),
  proposalRevisionLenderDocuments: defineTable(
    documentValidator.omit("_id").extend({
      brokerageId: v.id("brokerages"),
      organizationId: v.string(),
      proposalId: v.id("buildProposals"),
      revisionId: v.id("proposalRevisions"),
      sourceDocumentId: v.id("proposalDocuments"),
    })
  ).index("by_revision", ["revisionId"]),
  proposalRevisionLenderMilestones: defineTable(
    milestoneValidator.omit("_id").extend({
      brokerageId: v.id("brokerages"),
      organizationId: v.string(),
      proposalId: v.id("buildProposals"),
      revisionId: v.id("proposalRevisions"),
      sourceMilestoneId: v.id("proposalMilestones"),
    })
  )
    .index("by_revision", ["revisionId"])
    .index("by_revision_and_order", ["revisionId", "order"]),
  proposalRevisionLenderSubmilestones: defineTable(
    submilestoneValidator.omit("_id").extend({
      brokerageId: v.id("brokerages"),
      organizationId: v.string(),
      proposalId: v.id("buildProposals"),
      revisionId: v.id("proposalRevisions"),
      sourceSubmilestoneId: v.id("proposalSubmilestones"),
    })
  )
    .index("by_revision", ["revisionId"])
    .index("by_revision_and_order", ["revisionId", "order"]),
  proposalRevisionLenderCostItems: defineTable(
    costItemValidator.omit("_id").extend({
      brokerageId: v.id("brokerages"),
      organizationId: v.string(),
      proposalId: v.id("buildProposals"),
      revisionId: v.id("proposalRevisions"),
      sourceCostItemId: v.id("proposalCostItems"),
    })
  ).index("by_revision", ["revisionId"]),
  proposalRevisionLenderDraws: defineTable(
    proposalDrawValidator.omit("_id").extend({
      brokerageId: v.id("brokerages"),
      organizationId: v.string(),
      proposalId: v.id("buildProposals"),
      revisionId: v.id("proposalRevisions"),
      sourceDrawId: v.id("proposalDrawScheduleRows"),
    })
  )
    .index("by_revision", ["revisionId"])
    .index("by_revision_and_order", ["revisionId", "order"]),
  proposalLenderConfirmationCycles: defineTable({
    assignmentId: v.id("proposalLenderAssignments"),
    brokerageId: v.id("brokerages"),
    closedAt: v.optional(v.number()),
    createdAt: v.number(),
    cycleNumber: v.number(),
    decisionId: v.optional(v.id("proposalLenderApprovals")),
    openedAt: v.number(),
    organizationId: v.string(),
    proposalId: v.id("buildProposals"),
    proposalRevisionId: v.id("proposalRevisions"),
    proposalRevisionNumber: v.number(),
    status: proposalConfirmationCycleStatusValidator,
    supersededAt: v.optional(v.number()),
  })
    .index("by_proposal", ["proposalId"])
    .index("by_proposal_status", ["proposalId", "status"])
    .index("by_assignment", ["assignmentId"])
    .index("by_assignment_and_status", ["assignmentId", "status"])
    .index("by_assignment_and_cycle_number", ["assignmentId", "cycleNumber"])
    .index("by_assignment_and_revision", [
      "assignmentId",
      "proposalRevisionId",
    ]),
  proposalLenderConfirmationAcknowledgements: defineTable({
    acknowledgedAt: v.number(),
    acknowledgedByRole: v.string(),
    acknowledgedByWorkosUserId: v.string(),
    assignmentId: v.id("proposalLenderAssignments"),
    brokerageId: v.id("brokerages"),
    checkpoint: proposalRevisionCheckpointNameValidator,
    confirmationCycleId: v.id("proposalLenderConfirmationCycles"),
    idempotencyKey: v.string(),
    organizationId: v.string(),
    proposalId: v.id("buildProposals"),
    proposalRevisionId: v.id("proposalRevisions"),
    sequence: v.number(),
  })
    .index("by_cycle", ["confirmationCycleId"])
    .index("by_cycle_and_actor", [
      "confirmationCycleId",
      "acknowledgedByWorkosUserId",
    ])
    .index("by_cycle_actor_checkpoint", [
      "confirmationCycleId",
      "acknowledgedByWorkosUserId",
      "checkpoint",
    ])
    .index("by_cycle_and_idempotency_key", [
      "confirmationCycleId",
      "idempotencyKey",
    ]),
  proposalLenderApprovals: defineTable({
    brokerageId: v.id("brokerages"),
    organizationId: v.string(),
    proposalId: v.id("buildProposals"),
    assignmentId: v.id("proposalLenderAssignments"),
    proposalRevisionId: v.optional(v.id("proposalRevisions")),
    proposalRevisionNumber: v.optional(v.number()),
    confirmationCycleId: v.optional(v.id("proposalLenderConfirmationCycles")),
    declinedCheckpoint: v.optional(proposalRevisionCheckpointNameValidator),
    idempotencyKey: v.optional(v.string()),
    lenderOrganizationId: v.union(v.string(), v.id("lenderOrganizations")),
    legacyLenderOrganizationId: v.optional(v.string()),
    approverWorkosUserId: v.string(),
    approverRole: v.string(),
    status: v.union(v.literal("approved"), v.literal("declined")),
    reason: v.optional(v.string()),
    approvedAt: v.optional(v.number()),
    declinedAt: v.optional(v.number()),
    createdAt: v.number(),
  })
    .index("by_proposal", ["proposalId"])
    .index("by_proposal_assignment", ["proposalId", "assignmentId"])
    .index("by_proposal_assignment_status", [
      "proposalId",
      "assignmentId",
      "status",
    ])
    .index("by_proposal_assignment_revision_status", {
      fields: ["proposalId", "assignmentId", "proposalRevisionId", "status"],
      staged: true,
    })
    .index("by_confirmation_cycle", ["confirmationCycleId"])
    .index("by_confirmation_cycle_and_idempotency_key", [
      "confirmationCycleId",
      "idempotencyKey",
    ])
    .index("by_assignment", ["assignmentId"]),
  proposalReviewPolicyLocks: defineTable({
    brokerageId: v.id("brokerages"),
    organizationId: v.string(),
    proposalId: v.id("buildProposals"),
    policyVersionId: v.id("proposalReviewPolicyVersions"),
    proposalRevisionId: v.id("proposalRevisions"),
    proposalRevisionNumber: v.number(),
    assignmentId: v.optional(v.id("proposalLenderAssignments")),
    lenderOrganizationId: v.optional(v.id("lenderOrganizations")),
    activeLenderMemberCount: v.number(),
    eligibleLenderApproverCount: v.optional(v.number()),
    eligibleLenderApproverCounts: v.optional(
      v.object({
        draw: v.number(),
        milestone: v.number(),
        proposalReview: v.number(),
      })
    ),
    policy: proposalReviewPolicySnapshotValidator,
    lockedAt: v.number(),
    lockedByWorkosUserId: v.string(),
    lockedByRole: v.string(),
    reason: v.string(),
    idempotencyKey: v.string(),
    provenance: v.optional(
      v.union(
        v.literal("build_override"),
        v.literal("organization_default"),
        v.literal("system_baseline")
      )
    ),
    sourceLenderOrganizationId: v.optional(v.id("lenderOrganizations")),
    sourceLenderOrganizationName: v.optional(v.string()),
    sourceOrganizationReviewPolicyVersion: v.optional(v.number()),
    sourceOrganizationReviewPolicyVersionId: v.optional(
      v.id("lenderOrganizationReviewPolicyVersions")
    ),
  })
    .index("by_proposal", ["proposalId"])
    .index("by_proposal_and_idempotency_key", ["proposalId", "idempotencyKey"]),
  lenderPortalReviewCycles: defineTable({
    approvedGroups: v.array(lenderPortalReviewGroupValidator),
    brokerageId: v.id("brokerages"),
    buildId: v.id("activeBuilds"),
    commandFingerprint: v.string(),
    cycleNumber: v.number(),
    drawRequestId: v.optional(v.id("activeBuildDrawRequests")),
    evidenceReferences: v.array(lenderPortalReviewEvidenceReferenceValidator),
    idempotencyKey: v.string(),
    isCurrent: v.boolean(),
    kind: lenderPortalReviewRequestKindValidator,
    lenderApprovalCount: v.number(),
    milestoneId: v.optional(v.id("buildMilestones")),
    organizationId: v.string(),
    requestIdentity: v.string(),
    requirements: lenderPortalReviewRequirementsValidator,
    revisionInstructions: v.optional(v.string()),
    state: lenderPortalReviewRequestStateValidator,
    submission: lenderPortalReviewSubmissionSnapshotValidator,
    submittedAt: v.number(),
    submittedByWorkosUserId: v.string(),
    targetLabel: v.string(),
    decisionSummaries: v.array(
      v.object({
        actorWorkosUserId: v.string(),
        decision: lenderPortalReviewDecisionValidator,
        group: lenderPortalReviewGroupValidator,
        lenderOrganizationAssignmentId: v.optional(
          v.id("lenderOrganizationAssignments")
        ),
        lenderEligibilityEpoch: v.optional(v.string()),
      })
    ),
    terminalContributorDecisionIds: v.optional(
      v.array(v.id("lenderPortalReviewDecisions"))
    ),
    updatedAt: v.number(),
  })
    .index("by_request_identity_and_cycle_number", [
      "requestIdentity",
      "cycleNumber",
    ])
    .index("by_request_identity_and_idempotency_key", [
      "requestIdentity",
      "idempotencyKey",
    ])
    .index("by_build_and_state", ["buildId", "state"])
    .index("by_build_and_submitted_at", ["buildId", "submittedAt"])
    .index("by_build_and_is_current_and_submitted_at", [
      "buildId",
      "isCurrent",
      "submittedAt",
    ]),
  lenderPortalReviewDecisions: defineTable({
    actorRole: lenderPortalReviewerRoleValidator,
    actorWorkosUserId: v.string(),
    brokerageId: v.id("brokerages"),
    buildId: v.id("activeBuilds"),
    commandFingerprint: v.string(),
    createdAt: v.number(),
    cycleId: v.id("lenderPortalReviewCycles"),
    cycleNumber: v.number(),
    decision: lenderPortalReviewDecisionValidator,
    group: lenderPortalReviewGroupValidator,
    idempotencyKey: v.string(),
    lenderOrganizationAssignmentId: v.optional(
      v.id("lenderOrganizationAssignments")
    ),
    lenderEligibilityEpoch: v.optional(v.string()),
    organizationId: v.string(),
    privateRationale: v.optional(v.string()),
    requestIdentity: v.string(),
    revisionInstructions: v.optional(v.string()),
  })
    .index("by_cycle", ["cycleId"])
    .index("by_cycle_and_group", ["cycleId", "group"])
    .index("by_cycle_group_and_actor", [
      "cycleId",
      "group",
      "actorWorkosUserId",
    ])
    .index("by_request_identity_and_idempotency_key", [
      "requestIdentity",
      "idempotencyKey",
    ]),
  proposalPhase3MigrationIssues: defineTable({
    brokerageId: v.id("brokerages"),
    organizationId: v.string(),
    proposalId: v.id("buildProposals"),
    reason: v.string(),
    sourceRecordId: v.string(),
    sourceTable: v.union(
      v.literal("buildProposals"),
      v.literal("proposalLenderAssignments"),
      v.literal("proposalLenderApprovals"),
      v.literal("proposalClosings"),
      v.literal("activeBuilds")
    ),
    status: v.union(v.literal("open"), v.literal("resolved")),
    resolutionMode: v.optional(v.literal("operator_activation_override")),
    resolutionEvidenceReference: v.optional(v.string()),
    resolutionReason: v.optional(v.string()),
    resolvedAt: v.optional(v.number()),
    resolvedByRole: v.optional(v.string()),
    resolvedByWorkosUserId: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_proposal_and_status", ["proposalId", "status"])
    .index("by_source_table_and_record", ["sourceTable", "sourceRecordId"]),
  proposalClosings: defineTable({
    brokerageId: v.id("brokerages"),
    organizationId: v.string(),
    proposalId: v.id("buildProposals"),
    buildStartDate: v.string(),
    ianaTimezone: v.string(),
    loanFacility: v.object({
      interestAnnualBps: v.number(),
      principalCents: v.number(),
    }),
    closedAt: v.number(),
    closedByWorkosUserId: v.string(),
    closedByRole: v.string(),
    reason: v.string(),
    legacyPolicyResolutionIssueId: v.optional(
      v.id("proposalPhase3MigrationIssues")
    ),
    reviewPolicyLockId: v.optional(v.id("proposalReviewPolicyLocks")),
    createdAt: v.number(),
  }).index("by_proposal", ["proposalId"]),
  proposalDocuments: defineTable({
    brokerageId: v.id("brokerages"),
    organizationId: v.string(),
    proposalId: v.id("buildProposals"),
    documentType: schemaValidators.productionDocumentTypeValidator,
    status: schemaValidators.productionDocumentStatusValidator,
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
    documentType: schemaValidators.productionDocumentTypeValidator,
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
    siteVisitGuidance: v.optional(schemaValidators.siteVisitGuidanceValidator),
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
    agreedRateUnit: v.optional(schemaValidators.contractorPayRateUnitValidator),
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
    status: schemaValidators.milestoneContractorAssignmentStatusValidator,
    agreedRateCents: v.optional(v.number()),
    agreedRateUnit: v.optional(schemaValidators.contractorPayRateUnitValidator),
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
    itemType: schemaValidators.productionCostItemTypeValidator,
    title: v.string(),
    description: v.optional(v.string()),
    unit: v.optional(v.string()),
    specificationTiptapJson: v.optional(v.string()),
    costCents: v.number(),
    quantity: v.number(),
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
};
