import { defineTable } from "convex/server";
import { v } from "convex/values";
import * as schemaValidators from "./validators";
import { lenderPortalPhase9MigrationCountsValidator } from "../lender_portal_phase9_contracts";

export const schemaTables = {
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
    status: schemaValidators.proposalCollaborationSessionStatusValidator,
    initiatorSide: schemaValidators.proposalCollaborationInitiatorSideValidator,
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
    permission: schemaValidators.proposalCollaborationPermissionValidator,
    status: schemaValidators.proposalCollaborationParticipantStatusValidator,
    source: schemaValidators.proposalCollaborationParticipantSourceValidator,
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
    column: schemaValidators.productionProposalStatusValidator,
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
  lenderPortalTenantReleaseControls: defineTable({
    accessRevision: v.number(),
    brokerageId: v.id("brokerages"),
    candidateSha: v.string(),
    canaryRecipientWorkosUserIds: v.array(v.string()),
    configurationHash: v.string(),
    createdAt: v.number(),
    disabledAt: v.optional(v.number()),
    drainingAt: v.optional(v.number()),
    enabledAt: v.optional(v.number()),
    organizationId: v.string(),
    reason: v.string(),
    status: schemaValidators.lenderPortalReleaseStatusValidator,
    updatedAt: v.number(),
    updatedByWorkosUserId: v.string(),
  }).index("by_organizationId", ["organizationId"]),
  lenderPortalPhase9MigrationRuns: defineTable({
    active: v.boolean(),
    brokerageId: v.id("brokerages"),
    candidateSha: v.string(),
    configurationHash: v.string(),
    countsAfter: v.optional(lenderPortalPhase9MigrationCountsValidator),
    countsBefore: lenderPortalPhase9MigrationCountsValidator,
    createdAt: v.number(),
    inventoryFingerprint: v.string(),
    inventoryFingerprintAfter: v.optional(v.string()),
    issueCount: v.number(),
    issueSnapshots: v.array(
      v.object({
        code: v.string(),
        disposition: v.union(v.literal("open"), v.literal("resolved")),
        field: v.string(),
        provenance: v.string(),
        reason: v.string(),
        sourceRecordId: v.string(),
        sourceTable: v.string(),
      })
    ),
    organizationId: v.string(),
    reason: v.string(),
    runToken: v.string(),
    status: v.union(
      v.literal("blocked"),
      v.literal("ready"),
      v.literal("authorized"),
      v.literal("applying"),
      v.literal("verified")
    ),
    updatedAt: v.number(),
    updatedByWorkosUserId: v.string(),
    verifiedAt: v.optional(v.number()),
    workosProjectionFingerprintAfter: v.optional(v.string()),
    workosProjectionFingerprintBefore: v.string(),
    workosProjectionRowCount: v.number(),
    workosProjectionWriteCount: v.optional(v.number()),
  })
    .index("by_organizationId_and_active", ["organizationId", "active"])
    .index("by_status_and_active", ["status", "active"])
    .index("by_organizationId_and_runToken", ["organizationId", "runToken"]),
};
