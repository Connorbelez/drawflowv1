import { defineTable } from "convex/server";
import { v } from "convex/values";
import * as schemaValidators from "./validators";
import {
  buildCollaborationRoleValidator,
  costDocumentBatchStateValidator,
  costDocumentDraftLifecycleValidator,
  costDocumentDraftPageStateValidator,
  costDocumentDraftStepValidator,
  costDocumentFinancialComponentKindValidator,
} from "../build_collaboration_validators";
import {
  lenderPortalReviewGroupValidator,
  lenderPortalReviewRequestStateValidator,
  lenderPortalReviewerRoleValidator,
} from "../lender_portal_phase5_contracts";

export const schemaTables = {
  costDocumentAllocations: defineTable({
    brokerageId: v.id("brokerages"),
    organizationId: v.string(),
    buildId: v.id("activeBuilds"),
    costDocumentId: v.id("costDocuments"),
    buildSubmilestoneId: v.id("buildSubmilestones"),
    amountCents: v.number(),
    order: v.number(),
    submilestoneKeySnapshot: v.string(),
    submilestoneNameSnapshot: v.string(),
    createdAt: v.number(),
  })
    .index("by_costDocumentId_and_order", ["costDocumentId", "order"])
    .index("by_buildSubmilestoneId_and_createdAt", [
      "buildSubmilestoneId",
      "createdAt",
    ]),
  costDocumentFinancialComponents: defineTable({
    brokerageId: v.id("brokerages"),
    organizationId: v.string(),
    buildId: v.id("activeBuilds"),
    costDocumentId: v.id("costDocuments"),
    kind: costDocumentFinancialComponentKindValidator,
    label: v.optional(v.string()),
    amountCents: v.number(),
    order: v.number(),
    createdAt: v.number(),
  }).index("by_costDocumentId_and_order", ["costDocumentId", "order"]),
  costDocumentReviewAnnotations: defineTable({
    brokerageId: v.id("brokerages"),
    organizationId: v.string(),
    buildId: v.id("activeBuilds"),
    costDocumentId: v.id("costDocuments"),
    reviewType: v.union(v.literal("builder"), v.literal("brokerage")),
    outcome: v.union(v.literal("accepted"), v.literal("needs_correction")),
    annotation: v.string(),
    revision: v.number(),
    actorWorkosUserId: v.string(),
    actorRoles: v.array(v.string()),
    createdAt: v.number(),
  })
    .index("by_costDocumentId_and_reviewType_and_revision", [
      "costDocumentId",
      "reviewType",
      "revision",
    ])
    .index("by_buildId_and_createdAt", ["buildId", "createdAt"]),
  costDocumentIntegrityExceptions: defineTable({
    brokerageId: v.id("brokerages"),
    organizationId: v.string(),
    buildId: v.id("activeBuilds"),
    costDocumentId: v.id("costDocuments"),
    pageId: v.id("costDocumentPages"),
    assetId: v.id("buildCollaborationAssets"),
    kind: v.union(
      v.literal("unavailable"),
      v.literal("quarantined"),
      v.literal("missing"),
      v.literal("corrupt")
    ),
    actionRequired: v.boolean(),
    detectedHashSha256: v.optional(v.string()),
    expectedHashSha256: v.string(),
    resolvedAt: v.optional(v.number()),
    createdAt: v.number(),
  })
    .index("by_costDocumentId_and_createdAt", ["costDocumentId", "createdAt"])
    .index("by_costDocumentId_and_pageId_and_kind", [
      "costDocumentId",
      "pageId",
      "kind",
    ]),
  costDocumentBatches: defineTable({
    brokerageId: v.id("brokerages"),
    organizationId: v.string(),
    buildId: v.id("activeBuilds"),
    ownerWorkosUserId: v.string(),
    // Capacity is durable provenance. A shared identity may hold independent
    // Homeowner, Builder, Builder Staff, and Contractor working batches.
    creatorCapacity: v.optional(buildCollaborationRoleValidator),
    contractorProfileId: v.optional(v.id("contractorProfiles")),
    correctionSourceCostDocumentId: v.optional(v.id("costDocuments")),
    state: costDocumentBatchStateValidator,
    createIdempotencyKey: v.optional(v.string()),
    submitIdempotencyKey: v.optional(v.string()),
    submittedAt: v.optional(v.number()),
    // Optimistic aggregate revision. Legacy rows default to revision 1 at the
    // authorization boundary until first material mutation backfills it.
    revision: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_buildId_and_ownerWorkosUserId_and_state", [
      "buildId",
      "ownerWorkosUserId",
      "state",
    ])
    .index("by_buildId_and_ownerWorkosUserId_and_creatorCapacity_and_state", [
      "buildId",
      "ownerWorkosUserId",
      "creatorCapacity",
      "state",
    ])
    .index("by_organizationId_and_createIdempotencyKey", [
      "organizationId",
      "createIdempotencyKey",
    ]),
  costDocumentDrafts: defineTable({
    brokerageId: v.id("brokerages"),
    organizationId: v.string(),
    buildId: v.id("activeBuilds"),
    batchId: v.id("costDocumentBatches"),
    ownerWorkosUserId: v.string(),
    contractorProfileId: v.optional(v.id("contractorProfiles")),
    vendorProfileId: v.optional(v.id("contractorProfiles")),
    order: v.number(),
    kind: v.union(v.literal("invoice"), v.literal("receipt")),
    category: v.union(v.literal("labour"), v.literal("materials")),
    title: v.optional(v.string()),
    description: v.optional(v.string()),
    vendorName: v.optional(v.string()),
    documentDate: v.optional(v.string()),
    grossTotalCents: v.optional(v.number()),
    // Exact owner-private in-progress editor state. Canonical monetary rows
    // remain validated separately when the workflow advances.
    workingStateJson: v.optional(v.string()),
    currency: v.literal("CAD"),
    activeStep: costDocumentDraftStepValidator,
    lifecycle: costDocumentDraftLifecycleValidator,
    completedAt: v.optional(v.number()),
    submittedCostDocumentId: v.optional(v.id("costDocuments")),
    supersedesCostDocumentId: v.optional(v.id("costDocuments")),
    // Optimistic revision for all material draft edits and collaboration
    // decisions. Legacy rows default to revision 1 at read/write time.
    revision: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_batchId_and_order", ["batchId", "order"])
    .index("by_buildId_and_ownerWorkosUserId_and_lifecycle", [
      "buildId",
      "ownerWorkosUserId",
      "lifecycle",
    ])
    .index("by_batchId_and_lifecycle", ["batchId", "lifecycle"])
    .index("by_supersedesCostDocumentId", ["supersedesCostDocumentId"]),
  costDocumentDraftCollaborationEvents: defineTable({
    organizationId: v.string(),
    brokerageId: v.id("brokerages"),
    buildId: v.id("activeBuilds"),
    batchId: v.id("costDocumentBatches"),
    draftId: v.id("costDocumentDrafts"),
    creatorWorkosUserId: v.string(),
    collaboratorWorkosUserId: v.string(),
    actorWorkosUserId: v.string(),
    actorRole: buildCollaborationRoleValidator,
    eventType: v.union(v.literal("granted"), v.literal("revoked")),
    draftRevision: v.number(),
    reason: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index("by_draftId_and_draftRevision", ["draftId", "draftRevision"])
    .index("by_draftId_and_collaboratorWorkosUserId_and_draftRevision", [
      "draftId",
      "collaboratorWorkosUserId",
      "draftRevision",
    ])
    .index("by_buildId_and_collaboratorWorkosUserId_and_draftRevision", [
      "buildId",
      "collaboratorWorkosUserId",
      "draftRevision",
    ]),
  costDocumentDraftPages: defineTable({
    brokerageId: v.id("brokerages"),
    organizationId: v.string(),
    buildId: v.id("activeBuilds"),
    batchId: v.id("costDocumentBatches"),
    draftId: v.id("costDocumentDrafts"),
    order: v.number(),
    assetId: v.id("buildCollaborationAssets"),
    priorAssetId: v.optional(v.id("buildCollaborationAssets")),
    state: costDocumentDraftPageStateValidator,
    replacedAt: v.optional(v.number()),
    createdAt: v.number(),
  })
    .index("by_draftId_and_order", ["draftId", "order"])
    .index("by_draftId_and_state_and_order", ["draftId", "state", "order"])
    .index("by_assetId", ["assetId"])
    .index("by_assetId_and_state", ["assetId", "state"]),
  costDocumentDraftAllocations: defineTable({
    brokerageId: v.id("brokerages"),
    organizationId: v.string(),
    buildId: v.id("activeBuilds"),
    batchId: v.id("costDocumentBatches"),
    draftId: v.id("costDocumentDrafts"),
    buildSubmilestoneId: v.id("buildSubmilestones"),
    amountCents: v.number(),
    order: v.number(),
    submilestoneKeySnapshot: v.string(),
    submilestoneNameSnapshot: v.string(),
    createdAt: v.number(),
  }).index("by_draftId_and_order", ["draftId", "order"]),
  costDocumentDraftFinancialComponents: defineTable({
    brokerageId: v.id("brokerages"),
    organizationId: v.string(),
    buildId: v.id("activeBuilds"),
    batchId: v.id("costDocumentBatches"),
    draftId: v.id("costDocumentDrafts"),
    kind: costDocumentFinancialComponentKindValidator,
    label: v.optional(v.string()),
    amountCents: v.number(),
    order: v.number(),
    createdAt: v.number(),
  }).index("by_draftId_and_order", ["draftId", "order"]),
  plannedDrawScheduleRows: defineTable({
    brokerageId: v.id("brokerages"),
    organizationId: v.string(),
    buildId: v.id("activeBuilds"),
    proposalDrawScheduleRowId: v.id("proposalDrawScheduleRows"),
    buildMilestoneId: v.optional(v.id("buildMilestones")),
    milestoneKey: v.optional(v.string()),
    drawKey: v.string(),
    label: v.string(),
    order: v.number(),
    timingDay: v.number(),
    amountCents: v.number(),
    requestNote: v.optional(v.string()),
    requestReviewNote: v.optional(v.string()),
    requestedAt: v.optional(v.string()),
    reviewedAt: v.optional(v.string()),
    releaseDate: v.optional(v.string()),
    releaseNote: v.optional(v.string()),
    releasedAt: v.optional(v.string()),
    status: schemaValidators.productionBuildDrawStatusValidator,
    scheduledActivationJobId: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_build", ["buildId"])
    .index("by_build_order", ["buildId", "order"])
    .index("by_build_draw_key", ["buildId", "drawKey"])
    .index("by_build_proposal_draw_schedule_row", [
      "buildId",
      "proposalDrawScheduleRowId",
    ]),
  activeBuildDrawRequests: defineTable({
    brokerageId: v.id("brokerages"),
    organizationId: v.string(),
    buildId: v.id("activeBuilds"),
    requestKey: v.string(),
    displayId: v.string(),
    clientOperationId: v.string(),
    workOrderKey: v.optional(v.string()),
    plannedDrawKey: v.optional(v.string()),
    label: v.string(),
    amountCents: v.number(),
    status: schemaValidators.activeBuildDrawRequestStatusValidator,
    currentLenderPortalReviewCycleId: v.optional(
      v.id("lenderPortalReviewCycles")
    ),
    currentLenderPortalReviewCycleNumber: v.optional(v.number()),
    lenderPortalReviewState: v.optional(
      lenderPortalReviewRequestStateValidator
    ),
    note: v.optional(v.string()),
    operationsRecommendationNote: v.optional(v.string()),
    operationsReviewStartedAt: v.optional(v.string()),
    operationsReviewerWorkosUserId: v.optional(v.string()),
    readyForAdminAt: v.optional(v.string()),
    reviewNote: v.optional(v.string()),
    releaseNote: v.optional(v.string()),
    withdrawalNote: v.optional(v.string()),
    cancellationNote: v.optional(v.string()),
    requestedByWorkosUserId: v.string(),
    reviewedByWorkosUserId: v.optional(v.string()),
    withdrawnByWorkosUserId: v.optional(v.string()),
    requestedAt: v.string(),
    reviewedAt: v.optional(v.string()),
    withdrawnAt: v.optional(v.string()),
    cancelledAt: v.optional(v.string()),
    cancelledByWorkosUserId: v.optional(v.string()),
    releaseDate: v.optional(v.string()),
    releasedAt: v.optional(v.string()),
    collaborationEventRevision: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_build", ["buildId"])
    .index("by_brokerage", ["brokerageId"])
    .index("by_build_status", ["buildId", "status"])
    .index("by_build_operation", ["buildId", "clientOperationId"])
    .index("by_build_request_key", ["buildId", "requestKey"])
    .index("by_build_planned_draw_key", ["buildId", "plannedDrawKey"]),
  activeBuildDrawRequestAllocations: defineTable({
    brokerageId: v.id("brokerages"),
    organizationId: v.string(),
    buildId: v.id("activeBuilds"),
    drawRequestId: v.id("activeBuildDrawRequests"),
    buildMilestoneId: v.id("buildMilestones"),
    milestoneKey: v.string(),
    drawGroupKey: v.string(),
    amountCents: v.number(),
    sourceOrder: v.number(),
    createdAt: v.number(),
  })
    .index("by_build", ["buildId"])
    .index("by_request", ["drawRequestId"])
    .index("by_build_milestone", ["buildId", "buildMilestoneId"]),
  buildSiteVisits: defineTable({
    brokerageId: v.id("brokerages"),
    organizationId: v.string(),
    buildId: v.id("activeBuilds"),
    buildMilestoneId: v.id("buildMilestones"),
    milestoneKey: v.string(),
    visitId: v.string(),
    status: v.union(
      v.literal("requested"),
      v.literal("complete"),
      v.literal("cancelled")
    ),
    requestedDay: v.number(),
    requestedAt: v.string(),
    requestedTime: v.optional(v.string()),
    note: v.optional(v.string()),
    siteVisitGuidance: v.optional(schemaValidators.siteVisitGuidanceValidator),
    // Set only when the visit was explicitly scoped to one canonical
    // Sub-milestone. Display keys remain a scheduling convenience and are
    // never used by Event Rail to reconstruct this identity.
    submilestoneId: v.optional(v.id("buildSubmilestones")),
    submilestoneKeys: v.optional(v.array(v.string())),
    completedAt: v.optional(v.string()),
    completedByGroup: v.optional(lenderPortalReviewGroupValidator),
    completedByRole: v.optional(lenderPortalReviewerRoleValidator),
    completedByWorkosUserId: v.optional(v.string()),
    completionCommandFingerprint: v.optional(v.string()),
    completionIdempotencyKey: v.optional(v.string()),
    collaborationEventRevision: v.optional(v.number()),
    scheduleIdempotencyKey: v.optional(v.string()),
    scheduleRequestFingerprint: v.optional(v.string()),
    locationAttempt: v.optional(
      schemaValidators.siteVisitLocationAttemptValidator
    ),
    missingPrerequisites: v.optional(v.array(v.string())),
    prerequisiteException: v.optional(
      schemaValidators.siteVisitPrerequisiteExceptionValidator
    ),
    recordNote: v.optional(v.string()),
    recordNoteFormat: v.optional(schemaValidators.richTextFormatValidator),
    tokenConsumedAt: v.optional(v.number()),
    tokenExpiresAt: v.number(),
    tokenOpenedAt: v.optional(v.number()),
    url: v.string(),
    workOrderId: v.optional(v.string()),
    evidencePackageId: v.optional(v.string()),
    scopeBoundAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_brokerage", ["brokerageId"])
    .index("by_build", ["buildId"])
    .index("by_build_milestone", ["buildId", "milestoneKey"])
    .index("by_build_schedule_idempotency", [
      "buildId",
      "scheduleIdempotencyKey",
    ])
    .index("by_visit", ["visitId"]),
  buildSiteVisitGuidanceSections: defineTable({
    brokerageId: v.id("brokerages"),
    organizationId: v.string(),
    buildId: v.id("activeBuilds"),
    buildSiteVisitId: v.id("buildSiteVisits"),
    buildMilestoneId: v.id("buildMilestones"),
    milestoneKey: v.string(),
    proposalSubmilestoneId: v.id("proposalSubmilestones"),
    buildSubmilestoneId: v.id("buildSubmilestones"),
    submilestoneKey: v.string(),
    submilestoneName: v.string(),
    order: v.number(),
    whatToVerifyTiptapJson: v.string(),
    cameraAnglesTiptapJson: v.string(),
    capturedAt: v.number(),
  })
    .index("by_buildSiteVisitId_and_order", ["buildSiteVisitId", "order"])
    .index("by_buildId", ["buildId"])
    .index("by_buildSubmilestoneId", ["buildSubmilestoneId"]),
  buildMilestoneReviewDecisions: defineTable({
    brokerageId: v.id("brokerages"),
    organizationId: v.string(),
    buildId: v.id("activeBuilds"),
    buildMilestoneId: v.id("buildMilestones"),
    milestoneKey: v.string(),
    kind: v.union(v.literal("approved"), v.literal("retracted")),
    reviewRevision: v.number(),
    priorState: v.string(),
    newState: v.string(),
    warnings: v.array(v.string()),
    reason: v.optional(v.string()),
    actorWorkosUserId: v.string(),
    actorRoles: v.array(v.string()),
    createdAt: v.number(),
    idempotencyKey: v.string(),
  })
    .index("by_milestone_revision", ["buildMilestoneId", "reviewRevision"])
    .index("by_milestone_idempotency", ["buildMilestoneId", "idempotencyKey"]),
  siteVisitLinkRecoveryRequests: defineTable({
    brokerageId: v.optional(v.id("brokerages")),
    buildId: v.string(),
    organizationId: v.optional(v.string()),
    originalVisitId: v.string(),
    reason: v.string(),
    reference: v.string(),
    requestedAt: v.number(),
    source: v.union(v.literal("demo"), v.literal("production")),
    status: v.literal("pending"),
    tokenState: v.union(v.literal("consumed"), v.literal("expired")),
  })
    .index("by_reference", ["reference"])
    .index("by_source_visit", ["source", "originalVisitId"]),
  capitalEvents: defineTable({
    brokerageId: v.id("brokerages"),
    organizationId: v.string(),
    buildId: v.id("activeBuilds"),
    capitalEventKey: v.optional(v.string()),
    eventType: v.union(
      v.literal("borrower_copay"),
      v.literal("draw_release"),
      v.literal("cost"),
      v.literal("home_equity_takeout")
    ),
    loanFacilityId: v.optional(v.id("loanFacilities")),
    label: v.string(),
    amountCents: v.number(),
    eventDate: v.string(),
    createdAt: v.number(),
  }).index("by_build", ["buildId"]),
  products: defineTable({
    title: v.string(),
    imageId: v.string(),
    price: v.number(),
  }),
  todos: defineTable({
    text: v.string(),
    completed: v.boolean(),
  }),
};
