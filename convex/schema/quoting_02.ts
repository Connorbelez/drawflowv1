import { defineTable } from "convex/server";
import { v } from "convex/values";
import * as schemaValidators from "./validators";

export const schemaTables = {
  quoteInvitationResponseSubmissionLifecycleEvents: defineTable({
    brokerageId: v.id("brokerages"),
    organizationId: v.string(),
    buildId: v.id("activeBuilds"),
    quoteRoundId: v.id("quoteRounds"),
    quoteRoundInvitationId: v.id("quoteRoundInvitations"),
    quotePackageRevisionId: v.id("quotePackageRevisions"),
    quoteInvitationResponseSubmissionRevisionId: v.id(
      "quoteInvitationResponseSubmissionRevisions"
    ),
    eventType:
      schemaValidators.quoteInvitationResponseSubmissionLifecycleEventTypeValidator,
    replacementSubmissionRevisionId: v.optional(
      v.id("quoteInvitationResponseSubmissionRevisions")
    ),
    withdrawalExplanation: v.optional(v.string()),
    actorKind:
      schemaValidators.quoteInvitationResponseSubmissionActorKindValidator,
    actorWorkosUserId: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index("by_quoteInvitationResponseSubmissionRevisionId_and_createdAt", [
      "quoteInvitationResponseSubmissionRevisionId",
      "createdAt",
    ])
    .index("by_quoteRoundInvitationId_and_createdAt", [
      "quoteRoundInvitationId",
      "createdAt",
    ]),
  quoteInvitationResponseSubmissionStates: defineTable({
    brokerageId: v.id("brokerages"),
    organizationId: v.string(),
    buildId: v.id("activeBuilds"),
    quoteRoundId: v.id("quoteRounds"),
    quoteRoundInvitationId: v.id("quoteRoundInvitations"),
    quotePackageRevisionId: v.id("quotePackageRevisions"),
    latestSubmissionRevisionId: v.id(
      "quoteInvitationResponseSubmissionRevisions"
    ),
    activeSubmissionRevisionId: v.optional(
      v.id("quoteInvitationResponseSubmissionRevisions")
    ),
    latestRevision: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_quoteRoundInvitationId_and_quotePackageRevisionId", [
    "quoteRoundInvitationId",
    "quotePackageRevisionId",
  ]),
  quoteRoundPreferredSubmissionStates: defineTable({
    brokerageId: v.id("brokerages"),
    organizationId: v.string(),
    buildId: v.id("activeBuilds"),
    quoteRoundId: v.id("quoteRounds"),
    quotePackageRevisionId: v.optional(v.id("quotePackageRevisions")),
    quoteRoundInvitationId: v.optional(v.id("quoteRoundInvitations")),
    quoteInvitationResponseSubmissionRevisionId: v.optional(
      v.id("quoteInvitationResponseSubmissionRevisions")
    ),
    submissionRevision: v.optional(v.number()),
    stateVersion: v.number(),
    selectedAt: v.optional(v.number()),
    selectedByWorkosUserId: v.optional(v.string()),
    updatedAt: v.number(),
    createdAt: v.number(),
  })
    .index("by_quoteRoundId", ["quoteRoundId"])
    .index("by_preferredSubmissionRevisionId", [
      "quoteInvitationResponseSubmissionRevisionId",
    ]),
  quoteInvitationResponseSubmissionRequests: defineTable({
    brokerageId: v.id("brokerages"),
    organizationId: v.string(),
    buildId: v.id("activeBuilds"),
    quoteRoundId: v.id("quoteRounds"),
    quoteRoundInvitationId: v.id("quoteRoundInvitations"),
    quotePackageRevisionId: v.id("quotePackageRevisions"),
    idempotencyKey: v.string(),
    requestFingerprint: v.string(),
    expectedDraftVersion: v.number(),
    quoteInvitationResponseSubmissionRevisionId: v.id(
      "quoteInvitationResponseSubmissionRevisions"
    ),
    createdAt: v.number(),
  }).index("by_quoteRoundInvitationId_and_idempotencyKey", [
    "quoteRoundInvitationId",
    "idempotencyKey",
  ]),
  quoteRoundInvitations: defineTable({
    brokerageId: v.id("brokerages"),
    organizationId: v.string(),
    buildId: v.id("activeBuilds"),
    quoteRoundId: v.id("quoteRounds"),
    quotePackageRevisionId: v.id("quotePackageRevisions"),
    // Immutable provenance for the Invitation. During a Quote Round reopen,
    // this value remains pinned while currentQuotePackageRevisionId advances
    // so recipient Drafts and Submissions retain their original revision
    // scope without creating a second Invitation row.
    currentQuotePackageRevisionId: v.optional(v.id("quotePackageRevisions")),
    supersedesInvitationId: v.optional(v.id("quoteRoundInvitations")),
    recipientProfileId: v.id("contractorProfiles"),
    recipientNameSnapshot: v.string(),
    recipientEmailSnapshot: v.string(),
    recipientCapabilitiesSnapshot: v.array(
      schemaValidators.quoteRecipientCapabilityValidator
    ),
    participationState:
      schemaValidators.quoteInvitationParticipationStateValidator,
    accessGeneration: v.optional(v.number()),
    revokedAt: v.optional(v.number()),
    revocationReason: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_quoteRoundId_and_participationState", [
      "quoteRoundId",
      "participationState",
    ])
    .index("by_quoteRoundId_and_recipientProfileId", [
      "quoteRoundId",
      "recipientProfileId",
    ]),
  quoteInvitationAccessCredentials: defineTable({
    brokerageId: v.id("brokerages"),
    organizationId: v.string(),
    buildId: v.id("activeBuilds"),
    quoteRoundId: v.id("quoteRounds"),
    quoteRoundInvitationId: v.id("quoteRoundInvitations"),
    // Never persist a raw bearer secret. The secure delivery transport receives
    // it only as the outgoing email body; application rows retain this verifier.
    // Cleared after the credential's terminal retention window. The index
    // remains useful for live verifiers while optionality lets cleanup remove
    // the bearer-derived material without deleting lifecycle history.
    credentialVerifier: v.optional(v.string()),
    verifierPurgedAt: v.optional(v.number()),
    credentialVersion: v.number(),
    accessGeneration: v.optional(v.number()),
    purpose: v.optional(
      schemaValidators.quoteInvitationCredentialPurposeValidator
    ),
    deliveryEmailMessageId: v.optional(v.id("emailMessages")),
    state: schemaValidators.quoteInvitationCredentialStateValidator,
    accessExpiresAt: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_quoteRoundInvitationId_and_state", [
      "quoteRoundInvitationId",
      "state",
    ])
    .index("by_quoteRoundInvitationId_and_createdAt", [
      "quoteRoundInvitationId",
      "createdAt",
    ])
    .index("by_quoteRoundInvitationId_and_credentialVersion", [
      "quoteRoundInvitationId",
      "credentialVersion",
    ])
    .index("by_buildId_and_state_and_verifierPurgedAt_and_updatedAt", [
      "buildId",
      "state",
      "verifierPurgedAt",
      "updatedAt",
    ])
    .index("by_credentialVerifier", ["credentialVerifier"]),
  quoteInvitationBrowserSessions: defineTable({
    brokerageId: v.id("brokerages"),
    organizationId: v.string(),
    buildId: v.id("activeBuilds"),
    quoteRoundId: v.id("quoteRounds"),
    quoteRoundInvitationId: v.id("quoteRoundInvitations"),
    quoteInvitationAccessCredentialId: v.id("quoteInvitationAccessCredentials"),
    // Cleared after an expired/revoked browser lease ages past retention.
    sessionVerifier: v.optional(v.string()),
    verifierPurgedAt: v.optional(v.number()),
    state: schemaValidators.quoteInvitationBrowserSessionStateValidator,
    accessExpiresAt: v.number(),
    sessionExpiresAt: v.number(),
    lastActiveAt: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_sessionVerifier", ["sessionVerifier"])
    .index("by_quoteRoundInvitationId_and_state", [
      "quoteRoundInvitationId",
      "state",
    ])
    .index("by_quoteInvitationAccessCredentialId_and_state", [
      "quoteInvitationAccessCredentialId",
      "state",
    ])
    .index("by_buildId_and_state_and_verifierPurgedAt_and_updatedAt", [
      "buildId",
      "state",
      "verifierPurgedAt",
      "updatedAt",
    ]),
  quoteInvitationAccessEvents: defineTable({
    brokerageId: v.id("brokerages"),
    organizationId: v.string(),
    buildId: v.id("activeBuilds"),
    quoteRoundId: v.id("quoteRounds"),
    quoteRoundInvitationId: v.id("quoteRoundInvitations"),
    quoteInvitationAccessCredentialId: v.optional(
      v.id("quoteInvitationAccessCredentials")
    ),
    quoteInvitationBrowserSessionId: v.optional(
      v.id("quoteInvitationBrowserSessions")
    ),
    eventType: schemaValidators.quoteInvitationAccessEventTypeValidator,
    createdAt: v.number(),
  })
    .index("by_quoteRoundInvitationId_and_createdAt", [
      "quoteRoundInvitationId",
      "createdAt",
    ])
    .index("by_quoteInvitationAccessCredentialId_and_createdAt", [
      "quoteInvitationAccessCredentialId",
      "createdAt",
    ]),
  quoteRoundPublicationRequests: defineTable({
    brokerageId: v.id("brokerages"),
    organizationId: v.string(),
    buildId: v.id("activeBuilds"),
    quoteRoundId: v.id("quoteRounds"),
    idempotencyKey: v.string(),
    requestFingerprint: v.string(),
    expectedDraftRevision: v.number(),
    quotePackageRevisionId: v.id("quotePackageRevisions"),
    createdAt: v.number(),
  })
    .index("by_quoteRoundId_and_idempotencyKey", [
      "quoteRoundId",
      "idempotencyKey",
    ])
    .index("by_organizationId_and_idempotencyKey", [
      "organizationId",
      "idempotencyKey",
    ]),
  quoteRoundRecipientNoticeIntents: defineTable({
    brokerageId: v.id("brokerages"),
    organizationId: v.string(),
    buildId: v.id("activeBuilds"),
    quoteRoundId: v.id("quoteRounds"),
    quoteRoundInvitationId: v.id("quoteRoundInvitations"),
    quotePackageRevisionId: v.id("quotePackageRevisions"),
    kind: schemaValidators.quoteRoundRecipientNoticeKindValidator,
    reason: v.string(),
    status: schemaValidators.quoteRoundRecipientNoticeStatusValidator,
    createdAt: v.number(),
    acknowledgedAt: v.optional(v.number()),
  })
    .index("by_quoteRoundInvitationId_and_createdAt", [
      "quoteRoundInvitationId",
      "createdAt",
    ])
    .index("by_quoteRoundInvitationId_and_quotePackageRevisionId_and_kind", [
      "quoteRoundInvitationId",
      "quotePackageRevisionId",
      "kind",
    ])
    .index("by_quoteRoundId_and_createdAt", ["quoteRoundId", "createdAt"]),
  quoteInvitationPackageRevisionAcknowledgements: defineTable({
    brokerageId: v.id("brokerages"),
    organizationId: v.string(),
    buildId: v.id("activeBuilds"),
    quoteRoundId: v.id("quoteRounds"),
    quoteRoundInvitationId: v.id("quoteRoundInvitations"),
    previousPackageRevisionId: v.optional(v.id("quotePackageRevisions")),
    quotePackageRevisionId: v.id("quotePackageRevisions"),
    changedFieldKeys: v.array(v.string()),
    acknowledgedFieldKeys: v.array(v.string()),
    status:
      schemaValidators.quoteInvitationPackageRevisionAcknowledgementStatusValidator,
    acknowledgedAt: v.optional(v.number()),
    acknowledgedByWorkosUserId: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_quoteRoundInvitationId_and_quotePackageRevisionId", [
    "quoteRoundInvitationId",
    "quotePackageRevisionId",
  ]),
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
    siteVisitGuidance: v.optional(schemaValidators.siteVisitGuidanceValidator),
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
    scopeOfWorkTiptapJson: v.optional(v.string()),
    fieldGuidance: v.optional(
      v.object({
        cameraAnglesTiptapJson: v.string(),
        whatToVerifyTiptapJson: v.string(),
      })
    ),
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
};
