import { defineTable } from "convex/server";
import { v } from "convex/values";
import * as schemaValidators from "./validators";
import {
  buildCollaborationActorKindValidator,
  buildCollaborationRoleValidator,
} from "../build_collaboration_validators";

export const schemaTables = {
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
  submilestoneScopeContracts: defineTable({
    brokerageId: v.id("brokerages"),
    organizationId: v.string(),
    proposalId: v.id("buildProposals"),
    proposalSubmilestoneId: v.id("proposalSubmilestones"),
    buildId: v.optional(v.id("activeBuilds")),
    buildSubmilestoneId: v.optional(v.id("buildSubmilestones")),
    effectiveRevisionId: v.optional(v.id("submilestoneScopeRevisions")),
    activeDraftRevisionId: v.optional(v.id("submilestoneScopeRevisions")),
    latestVersion: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_proposalSubmilestoneId", ["proposalSubmilestoneId"])
    .index("by_organizationId_and_proposalId", ["organizationId", "proposalId"])
    .index("by_organizationId_and_buildId", ["organizationId", "buildId"])
    .index("by_buildSubmilestoneId", ["buildSubmilestoneId"]),
  submilestoneScopeRevisions: defineTable({
    brokerageId: v.id("brokerages"),
    organizationId: v.string(),
    proposalId: v.id("buildProposals"),
    proposalSubmilestoneId: v.id("proposalSubmilestones"),
    contractId: v.id("submilestoneScopeContracts"),
    version: v.number(),
    status: v.union(v.literal("draft"), v.literal("published")),
    scopeOfWorkTiptapJson: v.string(),
    basedOnRevisionId: v.optional(v.id("submilestoneScopeRevisions")),
    authoredByWorkosUserId: v.string(),
    createdAt: v.number(),
    savedAt: v.number(),
    publishedByWorkosUserId: v.optional(v.string()),
    publishedAt: v.optional(v.number()),
    changeReason: v.optional(v.string()),
  })
    .index("by_contractId_and_version", ["contractId", "version"])
    .index("by_contractId_and_status", ["contractId", "status"]),
  submilestoneScopeDecisions: defineTable({
    brokerageId: v.id("brokerages"),
    organizationId: v.string(),
    proposalId: v.id("buildProposals"),
    proposalSubmilestoneId: v.id("proposalSubmilestones"),
    contractId: v.id("submilestoneScopeContracts"),
    revisionId: v.id("submilestoneScopeRevisions"),
    version: v.number(),
    kind: v.union(
      v.literal("borrower_acknowledged"),
      v.literal("borrower_rejected"),
      v.literal("lender_admin_approved"),
      v.literal("admin_override")
    ),
    actorWorkosUserId: v.string(),
    actorRoles: v.array(v.string()),
    reason: v.optional(v.string()),
    bypassedDecisionKinds: v.optional(
      v.array(
        v.union(
          v.literal("borrower_acknowledged"),
          v.literal("borrower_rejected"),
          v.literal("lender_admin_approved")
        )
      )
    ),
    priorEffectiveRevisionId: v.optional(v.id("submilestoneScopeRevisions")),
    newEffectiveRevisionId: v.optional(v.id("submilestoneScopeRevisions")),
    idempotencyKey: v.string(),
    createdAt: v.number(),
  })
    .index("by_revisionId_and_createdAt", ["revisionId", "createdAt"])
    .index("by_revisionId_and_kind", ["revisionId", "kind"])
    .index("by_contractId", ["contractId"])
    .index("by_contractId_and_idempotencyKey", [
      "contractId",
      "idempotencyKey",
    ]),
  submilestoneFieldGuidance: defineTable({
    brokerageId: v.id("brokerages"),
    organizationId: v.string(),
    proposalId: v.id("buildProposals"),
    proposalSubmilestoneId: v.id("proposalSubmilestones"),
    buildId: v.optional(v.id("activeBuilds")),
    buildSubmilestoneId: v.optional(v.id("buildSubmilestones")),
    whatToVerifyTiptapJson: v.string(),
    cameraAnglesTiptapJson: v.string(),
    updatedByWorkosUserId: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_proposalSubmilestoneId", ["proposalSubmilestoneId"])
    .index("by_organizationId_and_proposalId", ["organizationId", "proposalId"])
    .index("by_organizationId_and_buildId", ["organizationId", "buildId"])
    .index("by_buildSubmilestoneId", ["buildSubmilestoneId"]),
  auditEvents: defineTable({
    brokerageId: v.id("brokerages"),
    lenderOrganizationId: v.optional(v.id("lenderOrganizations")),
    organizationId: v.string(),
    // Canonical audit producers may include Build-scoped actor/capacity and
    // revision context. Keep these optional so legacy producers and records
    // remain readable while the shared audit contract rolls out.
    buildId: v.optional(v.id("activeBuilds")),
    resourceType: v.optional(schemaValidators.auditEventResourceTypeValidator),
    entityType: v.string(),
    entityId: v.string(),
    eventType: v.string(),
    command: v.string(),
    actorWorkosUserId: v.string(),
    actorKind: v.optional(buildCollaborationActorKindValidator),
    actorRole: v.optional(schemaValidators.auditActorRoleValidator),
    actorRoles: v.array(v.string()),
    effectiveCapacity: v.optional(buildCollaborationRoleValidator),
    targetRevisions: v.optional(
      v.array(
        v.object({
          entityId: v.string(),
          entityType: v.string(),
          revision: v.optional(v.number()),
        })
      )
    ),
    priorState: v.optional(v.string()),
    newState: v.optional(v.string()),
    reason: v.optional(v.string()),
    reconciliationKey: v.optional(v.string()),
    drawFlowCorrelationId: v.optional(v.string()),
    providerCorrelationId: v.optional(v.string()),
    phase9RunToken: v.optional(v.string()),
    overrideKind: v.optional(v.string()),
    breakGlass: v.optional(v.boolean()),
    warnings: v.array(v.string()),
    createdAt: v.number(),
  })
    .index("by_entity", ["entityType", "entityId"])
    .index("by_brokerage", ["brokerageId"])
    .index("by_buildId_and_resourceType_and_createdAt", [
      "buildId",
      "resourceType",
      "createdAt",
    ])
    .index("by_organizationId_and_createdAt", ["organizationId", "createdAt"])
    .index("by_organizationId_and_entityType_and_createdAt", [
      "organizationId",
      "entityType",
      "createdAt",
    ])
    .index("by_organizationId_and_phase9RunToken_and_createdAt", [
      "organizationId",
      "phase9RunToken",
      "createdAt",
    ])
    .index("by_organizationId_and_reconciliationKey", [
      "organizationId",
      "reconciliationKey",
    ]),
  eventOutbox: defineTable({
    brokerageId: v.id("brokerages"),
    organizationId: v.string(),
    relatedEntityType: v.string(),
    relatedEntityId: v.string(),
    eventType: v.string(),
    payloadPreview: v.string(),
    status: schemaValidators.productionOutboxStatusValidator,
    createdAt: v.number(),
    processedAt: v.optional(v.number()),
  })
    .index("by_brokerage_status", ["brokerageId", "status"])
    .index("by_entity", ["relatedEntityType", "relatedEntityId"]),
  users: defineTable({
    authId: v.string(),
    email: v.string(),
    normalizedEmail: v.optional(v.string()),
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
    .index("by_workos_user_id", ["workosUserId"])
    .index("by_email", ["email"])
    .index("by_normalized_email", {
      fields: ["normalizedEmail"],
      staged: true,
    }),
};
