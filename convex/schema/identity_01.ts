import { defineTable } from "convex/server";
import { v } from "convex/values";
import * as schemaValidators from "./validators";

export const schemaTables = {
  brokerages: defineTable({
    workosOrganizationId: v.string(),
    legalName: v.string(),
    displayName: v.string(),
    legacyWorkosOrganizationId: v.optional(v.string()),
    principalBrokerEmail: v.optional(v.string()),
    principalBrokerWorkosUserId: v.optional(v.string()),
    status: v.union(v.literal("active"), v.literal("inactive")),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_workos_organization", ["workosOrganizationId"])
    .index("by_status", ["status"]),
  lenderOrganizations: defineTable({
    brokerageId: v.id("brokerages"),
    legalName: v.string(),
    displayName: v.string(),
    /** Legacy WorkOS-derived identifier used only during cutover/reconciliation. */
    legacyWorkosOrganizationId: v.optional(v.string()),
    status: v.union(v.literal("active"), v.literal("inactive")),
    permissions: v.object({
      proposalReview: v.boolean(),
      milestoneDecisions: v.boolean(),
      drawDecisions: v.boolean(),
      siteVisitReview: v.boolean(),
    }),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_brokerage", ["brokerageId"])
    .index("by_brokerage_and_status", ["brokerageId", "status"])
    .index("by_brokerage_and_legacy_workos_organization", [
      "brokerageId",
      "legacyWorkosOrganizationId",
    ])
    .index("by_legacy_workos_organization", ["legacyWorkosOrganizationId"])
    .index("by_status", ["status"]),
  lenderOrganizationReconciliationCandidates: defineTable({
    brokerageId: v.optional(v.id("brokerages")),
    // Legacy rows may predate tenant provenance. New reconciliation rows must
    // always carry this field and Phase 9 only consumes the exact tenant scope.
    organizationId: v.optional(v.string()),
    legacyWorkosOrganizationId: v.string(),
    sourceTable: v.union(
      v.literal("proposalLenderAssignments"),
      v.literal("proposalLenderApprovals")
    ),
    sourceRecordId: v.string(),
    snapshotName: v.optional(v.string()),
    status: v.union(v.literal("open"), v.literal("resolved")),
    reason: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_legacy_workos_organization", ["legacyWorkosOrganizationId"])
    .index("by_brokerage_and_status", ["brokerageId", "status"])
    .index("by_brokerage_organization_status", [
      "brokerageId",
      "organizationId",
      "status",
    ])
    .index("by_scope_source", [
      "brokerageId",
      "organizationId",
      "sourceTable",
      "sourceRecordId",
    ])
    .index("by_status", ["status"]),
  lenderOrganizationAssignments: defineTable({
    brokerageId: v.id("brokerages"),
    lenderOrganizationId: v.id("lenderOrganizations"),
    workosUserId: v.optional(v.string()),
    normalizedEmail: v.string(),
    status: v.union(
      v.literal("pending"),
      v.literal("active"),
      v.literal("inactive")
    ),
    assignedByWorkosUserId: v.string(),
    assignedByRole: v.string(),
    reason: v.string(),
    assignedAt: v.number(),
    updatedAt: v.number(),
    unassignedAt: v.optional(v.number()),
    unassignedByWorkosUserId: v.optional(v.string()),
    reconciledAt: v.optional(v.number()),
    reconciledToAssignmentId: v.optional(v.id("lenderOrganizationAssignments")),
    reconciliationOutcome: v.optional(
      v.union(v.literal("bound"), v.literal("conflict_rejected"))
    ),
    reconciliationReason: v.optional(v.string()),
  })
    .index("by_lender_organization", ["lenderOrganizationId"])
    .index("by_lender_organization_and_status", [
      "lenderOrganizationId",
      "status",
    ])
    .index("by_workos_user_and_status", ["workosUserId", "status"])
    .index("by_normalized_email_and_status", ["normalizedEmail", "status"])
    .index("by_brokerage_and_status", ["brokerageId", "status"])
    .index("by_status", ["status"]),
  contractorProfiles: defineTable({
    brokerageId: v.id("brokerages"),
    organizationId: v.string(),
    name: v.string(),
    kind: v.optional(schemaValidators.contractorKindValidator),
    // A Contractor Profile is the existing, brokerage-scoped quote-recipient
    // identity. The optional capability list and provisioning state are additive
    // so legacy profiles remain valid Contractor recipients while
    // Supplier/Combined solicitation requires an explicit compatible capability.
    quoteRecipientCapabilities: v.optional(
      v.array(schemaValidators.quoteRecipientCapabilityValidator)
    ),
    // Cost Documents can link to a vendor that is not a Quote recipient. Keep
    // that classification on the canonical profile instead of creating a
    // second organization-party identity table.
    costDocumentPartyType: v.optional(
      schemaValidators.costDocumentPartyTypeValidator
    ),
    // A provisional quote profile is intentionally not a partner-network
    // membership, Build assignment, or Contractor Workspace admission. An
    // exact-email WorkOS claim changes only this local ownership marker.
    quoteRecipientProvisioningState: v.optional(
      schemaValidators.quoteRecipientProvisioningStateValidator
    ),
    city: v.optional(v.string()),
    email: v.optional(v.string()),
    normalizedEmail: v.optional(v.string()),
    phone: v.optional(v.string()),
    website: v.optional(v.string()),
    description: v.optional(v.string()),
    trades: v.array(v.string()),
    defaultPayRateCents: v.optional(v.number()),
    defaultPayRateUnit: v.optional(
      schemaValidators.contractorPayRateUnitValidator
    ),
    serviceAreaPrimaryCity: v.optional(v.string()),
    serviceAreaRadiusKm: v.optional(v.number()),
    serviceAreaPostalPrefixes: v.optional(v.array(v.string())),
    serviceAreaNotes: v.optional(v.string()),
    complianceNotes: v.optional(v.string()),
    accountWorkosUserId: v.optional(v.string()),
    onboardingStatus: v.optional(
      schemaValidators.contractorOnboardingStatusValidator
    ),
    source: v.optional(schemaValidators.contractorProfileSourceValidator),
    status: v.union(v.literal("active"), v.literal("inactive")),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_brokerage", ["brokerageId"])
    .index("by_account_user", ["accountWorkosUserId"])
    .index("by_organizationId_and_updatedAt", ["organizationId", "updatedAt"])
    .index("by_organizationId_and_brokerageId_and_status_and_name", [
      "organizationId",
      "brokerageId",
      "status",
      "name",
    ])
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
    reviewType: schemaValidators.contractorProfileReviewTypeValidator,
    status: schemaValidators.contractorProfileReviewStatusValidator,
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
  contractorOnboardingReviews: defineTable({
    brokerageId: v.id("brokerages"),
    organizationId: v.string(),
    contractorId: v.id("contractorProfiles"),
    // WorkOS user that initiated self-service onboarding as a `member`. Linked
    // to the canonical profile on approval (PRD §7.1 step 11).
    applicantWorkosUserId: v.string(),
    applicantNormalizedEmail: v.optional(v.string()),
    status: schemaValidators.contractorOnboardingReviewStatusValidator,
    // Draft payload captures the onboarding form fields (trades, capabilities,
    // rates, service area, availability, equipment, compliance) (PRD §7.1.3).
    draftFields: v.optional(v.any()),
    submissionNote: v.optional(v.string()),
    lastOutcome: v.optional(
      schemaValidators.contractorOnboardingReviewOutcomeValidator
    ),
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
  contractorInviteClaims: defineTable({
    brokerageId: v.id("brokerages"),
    organizationId: v.string(),
    contractorId: v.id("contractorProfiles"),
    invitedNormalizedEmail: v.optional(v.string()),
    inviterWorkosUserId: v.string(),
    // WorkOS organization invitation id returned by the Management API.
    workosInvitationId: v.optional(v.string()),
    state: schemaValidators.contractorInviteClaimStateValidator,
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
    feedbackState: schemaValidators.contractorEvidenceFeedbackStateValidator,
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
    state: schemaValidators.contractorAssignmentAckStateValidator,
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
    kind: schemaValidators.contractorScopeIssueKindValidator,
    status: schemaValidators.contractorScopeIssueStatusValidator,
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
  contractorNotifications: defineTable({
    brokerageId: v.id("brokerages"),
    organizationId: v.string(),
    contractorId: v.id("contractorProfiles"),
    kind: schemaValidators.contractorNotificationKindValidator,
    channel: schemaValidators.contractorNotificationChannelValidator,
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
    source: schemaValidators.contractorQualityRatingSourceValidator,
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
  })
    .index("by_workos_organization_id", ["workosOrganizationId"])
    .index("by_status_and_name", ["status", "name"]),
  workosManagementOperations: defineTable({
    brokerageId: v.id("brokerages"),
    organizationId: v.string(),
    operation: v.literal("principal-broker-transfer"),
    idempotencyKey: v.string(),
    sourceMembershipId: v.string(),
    targetMembershipId: v.string(),
    sourceRoleSlugs: v.array(v.string()),
    targetRoleSlugs: v.array(v.string()),
    actorWorkosUserId: v.string(),
    actorRoles: v.array(v.string()),
    reason: v.string(),
    status: v.union(
      v.literal("pending"),
      v.literal("target-promoted"),
      v.literal("accepted"),
      v.literal("failed")
    ),
    failureStage: v.optional(
      v.union(v.literal("target-promotion"), v.literal("source-demotion"))
    ),
    safeError: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_organization_idempotency", ["organizationId", "idempotencyKey"])
    .index("by_organization_operation_status", [
      "organizationId",
      "operation",
      "status",
    ]),
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
    .index("by_status", ["status"])
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
};
