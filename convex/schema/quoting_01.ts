import { defineTable } from "convex/server";
import { v } from "convex/values";
import * as schemaValidators from "./validators";

export const schemaTables = {
  proposalTemplates: defineTable({
    brokerageId: v.id("brokerages"),
    organizationId: v.string(),
    templateKey: v.string(),
    title: v.string(),
    summary: v.string(),
    isDefault: v.boolean(),
    status: v.union(v.literal("active"), v.literal("inactive")),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_brokerage", ["brokerageId"])
    .index("by_brokerage_template", ["brokerageId", "templateKey"]),
  quoteResponseTemplates: defineTable({
    brokerageId: v.id("brokerages"),
    organizationId: v.string(),
    templateKey: v.string(),
    name: v.string(),
    description: v.optional(v.string()),
    audience: schemaValidators.quoteResponseTemplateAudienceValidator,
    status: v.union(v.literal("active"), v.literal("archived")),
    currentVersionId: v.optional(v.id("quoteResponseTemplateVersions")),
    selectedVersionId: v.optional(v.id("quoteResponseTemplateVersions")),
    createdByWorkosUserId: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_brokerage", ["brokerageId"])
    .index("by_organization", ["organizationId"])
    .index("by_organization_status", ["organizationId", "status"])
    .index("by_organization_templateKey", ["organizationId", "templateKey"]),
  quoteResponseTemplateVersions: defineTable({
    brokerageId: v.id("brokerages"),
    organizationId: v.string(),
    templateId: v.id("quoteResponseTemplates"),
    name: v.string(),
    description: v.optional(v.string()),
    audience: schemaValidators.quoteResponseTemplateAudienceValidator,
    version: v.number(),
    status: v.union(v.literal("draft"), v.literal("published")),
    releaseNote: v.optional(v.string()),
    validationState: v.union(v.literal("invalid"), v.literal("valid")),
    createdByWorkosUserId: v.string(),
    publishedByWorkosUserId: v.optional(v.string()),
    publishedAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_template", ["templateId"])
    .index("by_template_version", ["templateId", "version"])
    .index("by_template_status", ["templateId", "status"])
    .index("by_organization_status", ["organizationId", "status"]),
  quoteResponseTemplateFields: defineTable({
    brokerageId: v.id("brokerages"),
    organizationId: v.string(),
    templateId: v.id("quoteResponseTemplates"),
    versionId: v.id("quoteResponseTemplateVersions"),
    fieldKey: v.string(),
    label: v.string(),
    kind: schemaValidators.quoteResponseTemplateFieldKindValidator,
    scope: schemaValidators.quoteResponseTemplateFieldScopeValidator,
    order: v.number(),
    required: v.boolean(),
    isPermanent: v.boolean(),
    repeatable: v.boolean(),
    renderer: schemaValidators.quoteResponseTemplateFieldRendererValidator,
    choiceOptions: v.optional(v.array(v.string())),
    validation: v.optional(
      schemaValidators.quoteResponseTemplateFieldValidationValidator
    ),
    tax: v.optional(schemaValidators.quoteResponseTemplateTaxValidator),
    supportsTax: v.boolean(),
    allowAlternates: v.boolean(),
    allowExclusions: v.boolean(),
    richTextDefaultHtml: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_version", ["versionId"])
    .index("by_version_order", ["versionId", "order"])
    .index("by_version_fieldKey", ["versionId", "fieldKey"])
    .index("by_organization", ["organizationId"]),
  quoteRounds: defineTable({
    brokerageId: v.id("brokerages"),
    organizationId: v.string(),
    buildId: v.id("activeBuilds"),
    proposalId: v.id("buildProposals"),
    mode: schemaValidators.quoteRoundModeValidator,
    state: schemaValidators.quoteRoundStateValidator,
    title: v.string(),
    // Optimistic revision of mutable draft configuration and the terminal
    // draft-to-open transition. Package Revision numbers are independent.
    revision: v.number(),
    currentPackageRevisionId: v.optional(v.id("quotePackageRevisions")),
    closedAt: v.optional(v.number()),
    closedByWorkosUserId: v.optional(v.string()),
    closeReason: v.optional(v.string()),
    cancelledAt: v.optional(v.number()),
    cancelledByWorkosUserId: v.optional(v.string()),
    cancellationReason: v.optional(v.string()),
    createdByWorkosUserId: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_buildId", ["buildId"])
    .index("by_buildId_and_state", ["buildId", "state"])
    .index("by_state_and_updatedAt", ["state", "updatedAt"])
    .index("by_organizationId_and_createdAt", ["organizationId", "createdAt"]),
  quoteRoundDrafts: defineTable({
    brokerageId: v.id("brokerages"),
    organizationId: v.string(),
    buildId: v.id("activeBuilds"),
    quoteRoundId: v.id("quoteRounds"),
    templateVersionId: v.optional(v.id("quoteResponseTemplateVersions")),
    responseDeadline: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_quoteRoundId", ["quoteRoundId"]),
  quoteRoundDraftLabourScope: defineTable({
    brokerageId: v.id("brokerages"),
    organizationId: v.string(),
    buildId: v.id("activeBuilds"),
    quoteRoundId: v.id("quoteRounds"),
    buildSubmilestoneId: v.id("buildSubmilestones"),
    // Every Labour draft pins the exact canonical Scope revision and bytes.
    sourceScopeRevisionId: v.id("submilestoneScopeRevisions"),
    sourceScopeVersion: v.number(),
    sourceScopeChangeReason: v.optional(v.string()),
    scopeOfWorkTiptapJson: v.string(),
    order: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_quoteRoundId_and_order", ["quoteRoundId", "order"])
    .index("by_quoteRoundId_and_buildSubmilestoneId", [
      "quoteRoundId",
      "buildSubmilestoneId",
    ]),
  quoteRoundDraftMaterialRows: defineTable({
    brokerageId: v.id("brokerages"),
    organizationId: v.string(),
    buildId: v.id("activeBuilds"),
    quoteRoundId: v.id("quoteRounds"),
    rowKey: v.string(),
    source: schemaValidators.quoteRoundMaterialSourceValidator,
    sourceBuildCostItemId: v.optional(v.id("buildCostItems")),
    title: v.optional(v.string()),
    description: v.optional(v.string()),
    quantity: v.optional(v.number()),
    unit: v.optional(v.string()),
    specificationTiptapJson: v.optional(v.string()),
    deliveryLocation: v.optional(v.string()),
    deliveryStartDay: v.optional(v.number()),
    deliveryEndDay: v.optional(v.number()),
    deliveryInstructions: v.optional(v.string()),
    order: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_quoteRoundId_and_order", ["quoteRoundId", "order"])
    .index("by_quoteRoundId_and_rowKey", ["quoteRoundId", "rowKey"]),
  quoteRoundDraftMaterialAssignments: defineTable({
    brokerageId: v.id("brokerages"),
    organizationId: v.string(),
    buildId: v.id("activeBuilds"),
    quoteRoundId: v.id("quoteRounds"),
    quoteRoundDraftMaterialRowId: v.id("quoteRoundDraftMaterialRows"),
    buildSubmilestoneId: v.id("buildSubmilestones"),
    order: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_quoteRoundDraftMaterialRowId_and_order", [
      "quoteRoundDraftMaterialRowId",
      "order",
    ])
    .index("by_quoteRoundId", ["quoteRoundId"]),
  quoteRoundDraftRecipients: defineTable({
    brokerageId: v.id("brokerages"),
    organizationId: v.string(),
    buildId: v.id("activeBuilds"),
    quoteRoundId: v.id("quoteRounds"),
    recipientProfileId: v.id("contractorProfiles"),
    order: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_quoteRoundId_and_order", ["quoteRoundId", "order"])
    .index("by_quoteRoundId_and_recipientProfileId", [
      "quoteRoundId",
      "recipientProfileId",
    ]),
  quotePackageRevisions: defineTable({
    brokerageId: v.id("brokerages"),
    organizationId: v.string(),
    buildId: v.id("activeBuilds"),
    quoteRoundId: v.id("quoteRounds"),
    revision: v.number(),
    sourceDraftRevision: v.number(),
    previousPackageRevisionId: v.optional(v.id("quotePackageRevisions")),
    changedFieldKeys: v.optional(v.array(v.string())),
    templateId: v.id("quoteResponseTemplates"),
    templateVersionId: v.id("quoteResponseTemplateVersions"),
    responseDeadline: v.number(),
    // One immutable Access Window applies to every invitation sent with this
    // package revision. Individual credentials can rotate, but cannot outlive
    // this shared window.
    accessExpiresAt: v.optional(v.number()),
    permitDocumentId: v.id("buildDocuments"),
    permitDocumentVersion: v.number(),
    siteAddressSnapshot: v.string(),
    siteLatitudeSnapshot: v.optional(v.number()),
    siteLongitudeSnapshot: v.optional(v.number()),
    sitePlaceIdSnapshot: v.optional(v.string()),
    siteMapUrlSnapshot: v.string(),
    timelineStartDateSnapshot: v.string(),
    timelineCurrentDaySnapshot: v.optional(v.number()),
    timelineRangeMinSnapshot: v.optional(v.number()),
    timelineRangeMaxSnapshot: v.optional(v.number()),
    roadmapSnapshotFingerprint: v.string(),
    publishedByWorkosUserId: v.string(),
    publishedAt: v.number(),
  })
    .index("by_quoteRoundId_and_revision", ["quoteRoundId", "revision"])
    .index("by_buildId_and_publishedAt", ["buildId", "publishedAt"]),
  quotePackageRevisionLabourLines: defineTable({
    brokerageId: v.id("brokerages"),
    organizationId: v.string(),
    buildId: v.id("activeBuilds"),
    quoteRoundId: v.id("quoteRounds"),
    quotePackageRevisionId: v.id("quotePackageRevisions"),
    buildMilestoneId: v.id("buildMilestones"),
    buildSubmilestoneId: v.id("buildSubmilestones"),
    milestoneKey: v.string(),
    milestoneName: v.string(),
    submilestoneKey: v.string(),
    submilestoneName: v.string(),
    order: v.number(),
    startDay: v.optional(v.number()),
    durationDays: v.optional(v.number()),
    budgetCents: v.optional(v.number()),
    // Historical Package Revision snapshots may predate canonical Scope
    // identity, so these provenance pins remain optional and immutable. New
    // Package Revision writes always populate these pins.
    sourceScopeRevisionId: v.optional(v.id("submilestoneScopeRevisions")),
    sourceScopeVersion: v.optional(v.number()),
    sourceScopeChangeReason: v.optional(v.string()),
    scopeOfWorkTiptapJson: v.string(),
    createdAt: v.number(),
  })
    .index("by_quotePackageRevisionId_and_order", [
      "quotePackageRevisionId",
      "order",
    ])
    .index("by_quotePackageRevisionId_and_buildSubmilestoneId", [
      "quotePackageRevisionId",
      "buildSubmilestoneId",
    ]),
  quotePackageRevisionMaterialLines: defineTable({
    brokerageId: v.id("brokerages"),
    organizationId: v.string(),
    buildId: v.id("activeBuilds"),
    quoteRoundId: v.id("quoteRounds"),
    quotePackageRevisionId: v.id("quotePackageRevisions"),
    source: schemaValidators.quoteRoundMaterialSourceValidator,
    sourceBuildCostItemId: v.optional(v.id("buildCostItems")),
    sourceDraftRowKey: v.optional(v.string()),
    title: v.string(),
    description: v.optional(v.string()),
    quantity: v.number(),
    unit: v.string(),
    specificationTiptapJson: v.string(),
    deliveryLocation: v.string(),
    deliveryStartDay: v.number(),
    deliveryEndDay: v.number(),
    deliveryInstructions: v.string(),
    order: v.number(),
    createdAt: v.number(),
  }).index("by_quotePackageRevisionId_and_order", [
    "quotePackageRevisionId",
    "order",
  ]),
  quotePackageRevisionMaterialAssignments: defineTable({
    brokerageId: v.id("brokerages"),
    organizationId: v.string(),
    buildId: v.id("activeBuilds"),
    quoteRoundId: v.id("quoteRounds"),
    quotePackageRevisionId: v.id("quotePackageRevisions"),
    quotePackageRevisionMaterialLineId: v.id(
      "quotePackageRevisionMaterialLines"
    ),
    buildMilestoneId: v.id("buildMilestones"),
    buildSubmilestoneId: v.id("buildSubmilestones"),
    milestoneKey: v.string(),
    milestoneName: v.string(),
    submilestoneKey: v.string(),
    submilestoneName: v.string(),
    startDay: v.optional(v.number()),
    durationDays: v.optional(v.number()),
    order: v.number(),
    createdAt: v.number(),
  }).index("by_quotePackageRevisionMaterialLineId_and_order", [
    "quotePackageRevisionMaterialLineId",
    "order",
  ]),
  quotePackageRevisionResponseFields: defineTable({
    brokerageId: v.id("brokerages"),
    organizationId: v.string(),
    buildId: v.id("activeBuilds"),
    quoteRoundId: v.id("quoteRounds"),
    quotePackageRevisionId: v.id("quotePackageRevisions"),
    sourceTemplateFieldId: v.id("quoteResponseTemplateFields"),
    fieldKey: v.string(),
    label: v.string(),
    kind: schemaValidators.quoteResponseTemplateFieldKindValidator,
    scope: schemaValidators.quoteResponseTemplateFieldScopeValidator,
    order: v.number(),
    required: v.boolean(),
    isPermanent: v.boolean(),
    repeatable: v.boolean(),
    renderer: schemaValidators.quoteResponseTemplateFieldRendererValidator,
    choiceOptions: v.optional(v.array(v.string())),
    validation: v.optional(
      schemaValidators.quoteResponseTemplateFieldValidationValidator
    ),
    tax: v.optional(schemaValidators.quoteResponseTemplateTaxValidator),
    supportsTax: v.boolean(),
    allowAlternates: v.boolean(),
    allowExclusions: v.boolean(),
    richTextDefaultHtml: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index("by_quotePackageRevisionId_and_order", [
      "quotePackageRevisionId",
      "order",
    ])
    .index("by_quotePackageRevisionId_and_fieldKey", [
      "quotePackageRevisionId",
      "fieldKey",
    ]),
  quotePackageRevisionAttachments: defineTable({
    brokerageId: v.id("brokerages"),
    organizationId: v.string(),
    buildId: v.id("activeBuilds"),
    quoteRoundId: v.id("quoteRounds"),
    quotePackageRevisionId: v.id("quotePackageRevisions"),
    kind: schemaValidators.quotePackageAttachmentKindValidator,
    sourceBuildDocumentId: v.id("buildDocuments"),
    sourceBuildSubmilestoneId: v.optional(v.id("buildSubmilestones")),
    fileNameSnapshot: v.string(),
    mimeTypeSnapshot: v.string(),
    sizeBytesSnapshot: v.number(),
    storageIdSnapshot: v.optional(v.id("_storage")),
    contentHashSha256Snapshot: v.string(),
    sourceDocumentVersionSnapshot: v.number(),
    order: v.number(),
    createdAt: v.number(),
  })
    .index("by_quotePackageRevisionId_and_order", [
      "quotePackageRevisionId",
      "order",
    ])
    .index("by_quotePackageRevisionId_and_sourceBuildDocumentId", [
      "quotePackageRevisionId",
      "sourceBuildDocumentId",
    ]),
  quoteInvitationResponseDrafts: defineTable({
    brokerageId: v.id("brokerages"),
    organizationId: v.string(),
    buildId: v.id("activeBuilds"),
    quoteRoundId: v.id("quoteRounds"),
    quoteRoundInvitationId: v.id("quoteRoundInvitations"),
    quotePackageRevisionId: v.id("quotePackageRevisions"),
    version: v.number(),
    // A new Package Revision may seed a Draft from the recipient's prior
    // response only after acknowledgement. Copied commercial values remain
    // unusable for submission until the recipient explicitly confirms them.
    copiedFromQuotePackageRevisionId: v.optional(v.id("quotePackageRevisions")),
    copiedValuesConfirmationState: v.optional(
      v.union(v.literal("pending"), v.literal("confirmed"))
    ),
    copiedValuesConfirmedAt: v.optional(v.number()),
    copiedValuesConfirmedByWorkosUserId: v.optional(v.string()),
    commentsHtml: v.optional(v.string()),
    completedPricingLineCount: v.number(),
    answeredFieldCount: v.number(),
    attachmentCount: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
    // Terminal drafts remain recoverable for the retention window before
    // editable rows and attachments are physically removed. Submitted
    // response revisions are separate immutable history and are never deleted
    // by this lifecycle.
    retentionState: v.optional(
      v.union(v.literal("active"), v.literal("recovery"), v.literal("purged"))
    ),
    terminalAt: v.optional(v.number()),
    purgeEligibleAt: v.optional(v.number()),
    purgedAt: v.optional(v.number()),
    retentionNextCheckAt: v.optional(v.number()),
  })
    .index("by_quoteRoundInvitationId_and_quotePackageRevisionId", [
      "quoteRoundInvitationId",
      "quotePackageRevisionId",
    ])
    .index("by_buildId_and_retentionState_and_purgeEligibleAt", [
      "buildId",
      "retentionState",
      "purgeEligibleAt",
    ])
    .index("by_buildId_and_retentionState_and_retentionNextCheckAt", [
      "buildId",
      "retentionState",
      "retentionNextCheckAt",
    ])
    .index("by_quoteRoundId_and_updatedAt", ["quoteRoundId", "updatedAt"]),
  quoteInvitationResponseDraftLineItems: defineTable({
    brokerageId: v.id("brokerages"),
    organizationId: v.string(),
    buildId: v.id("activeBuilds"),
    quoteRoundId: v.id("quoteRounds"),
    quoteRoundInvitationId: v.id("quoteRoundInvitations"),
    quotePackageRevisionId: v.id("quotePackageRevisions"),
    quoteInvitationResponseDraftId: v.id("quoteInvitationResponseDrafts"),
    lineKey: v.string(),
    source: schemaValidators.quoteInvitationResponseDraftLineSourceValidator,
    scope: schemaValidators.quoteInvitationResponseDraftLineScopeValidator,
    sourcePackageRevisionLabourLineId: v.optional(
      v.id("quotePackageRevisionLabourLines")
    ),
    sourcePackageRevisionMaterialLineId: v.optional(
      v.id("quotePackageRevisionMaterialLines")
    ),
    sourcePackageRevisionResponseFieldId: v.optional(
      v.id("quotePackageRevisionResponseFields")
    ),
    title: v.string(),
    quotedAmountCents: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_quoteInvitationResponseDraftId_and_lineKey", [
      "quoteInvitationResponseDraftId",
      "lineKey",
    ])
    .index("by_quoteInvitationResponseDraftId_and_updatedAt", [
      "quoteInvitationResponseDraftId",
      "updatedAt",
    ]),
  quoteInvitationResponseDraftAnswers: defineTable({
    brokerageId: v.id("brokerages"),
    organizationId: v.string(),
    buildId: v.id("activeBuilds"),
    quoteRoundId: v.id("quoteRounds"),
    quoteRoundInvitationId: v.id("quoteRoundInvitations"),
    quotePackageRevisionId: v.id("quotePackageRevisions"),
    quoteInvitationResponseDraftId: v.id("quoteInvitationResponseDrafts"),
    sourcePackageRevisionResponseFieldId: v.id(
      "quotePackageRevisionResponseFields"
    ),
    fieldKey: v.string(),
    scope: schemaValidators.quoteInvitationResponseDraftLineScopeValidator,
    value: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_draft_and_responseFieldId", [
    "quoteInvitationResponseDraftId",
    "sourcePackageRevisionResponseFieldId",
  ]),
  quoteInvitationResponseDraftAttachments: defineTable({
    brokerageId: v.id("brokerages"),
    organizationId: v.string(),
    buildId: v.id("activeBuilds"),
    quoteRoundId: v.id("quoteRounds"),
    quoteRoundInvitationId: v.id("quoteRoundInvitations"),
    quotePackageRevisionId: v.id("quotePackageRevisions"),
    quoteInvitationResponseDraftId: v.id("quoteInvitationResponseDrafts"),
    storageId: v.id("_storage"),
    fileName: v.string(),
    mimeType: v.string(),
    sizeBytes: v.number(),
    sourcePackageRevisionResponseFieldId: v.optional(
      v.id("quotePackageRevisionResponseFields")
    ),
    createdAt: v.number(),
  })
    .index("by_quoteInvitationResponseDraftId_and_createdAt", [
      "quoteInvitationResponseDraftId",
      "createdAt",
    ])
    .index("by_storageId", ["storageId"]),
  quoteInvitationResponseDraftAttachmentStagingSessions: defineTable({
    brokerageId: v.id("brokerages"),
    organizationId: v.string(),
    buildId: v.id("activeBuilds"),
    quoteRoundId: v.id("quoteRounds"),
    quoteRoundInvitationId: v.id("quoteRoundInvitations"),
    quotePackageRevisionId: v.id("quotePackageRevisions"),
    quoteInvitationBrowserSessionId: v.optional(
      v.id("quoteInvitationBrowserSessions")
    ),
    ownerWorkosUserId: v.optional(v.string()),
    expectedFileName: v.string(),
    expectedMimeType: v.string(),
    expectedSizeBytes: v.number(),
    // Consumed staging rows may predate verifier-backed uploads. Live upload
    // authorization treats a missing verifier as unavailable, while keeping
    // those immutable historical rows schema-readable during deployment.
    uploadSecretVerifier: v.optional(v.string()),
    sourcePackageRevisionResponseFieldId: v.optional(
      v.id("quotePackageRevisionResponseFields")
    ),
    pendingStorageId: v.optional(v.id("_storage")),
    state:
      schemaValidators.quoteInvitationResponseDraftAttachmentStagingStateValidator,
    expiresAt: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_quoteRoundInvitationId_and_quotePackageRevisionId_and_state", [
      "quoteRoundInvitationId",
      "quotePackageRevisionId",
      "state",
    ])
    .index("by_buildId_and_state_and_expiresAt", [
      "buildId",
      "state",
      "expiresAt",
    ])
    .index("by_pendingStorageId", ["pendingStorageId"])
    .index("by_state_and_expiresAt", ["state", "expiresAt"]),
  quoteInvitationResponseSubmissionRevisions: defineTable({
    brokerageId: v.id("brokerages"),
    organizationId: v.string(),
    buildId: v.id("activeBuilds"),
    quoteRoundId: v.id("quoteRounds"),
    quoteRoundInvitationId: v.id("quoteRoundInvitations"),
    quotePackageRevisionId: v.id("quotePackageRevisions"),
    revision: v.number(),
    sourceDraftVersion: v.number(),
    canonicalTotalCents: v.number(),
    commentsHtml: v.optional(v.string()),
    submittedByKind:
      schemaValidators.quoteInvitationResponseSubmissionActorKindValidator,
    submittedByWorkosUserId: v.optional(v.string()),
    submittedAt: v.number(),
    createdAt: v.number(),
  })
    .index("by_quoteRoundInvitationId_and_revision", [
      "quoteRoundInvitationId",
      "revision",
    ])
    .index("by_quotePackageRevisionId_and_submittedAt", [
      "quotePackageRevisionId",
      "submittedAt",
    ])
    .index("by_quoteRoundId_and_submittedAt", ["quoteRoundId", "submittedAt"]),
  quoteInvitationResponseSubmissionLineItems: defineTable({
    brokerageId: v.id("brokerages"),
    organizationId: v.string(),
    buildId: v.id("activeBuilds"),
    quoteRoundId: v.id("quoteRounds"),
    quoteRoundInvitationId: v.id("quoteRoundInvitations"),
    quotePackageRevisionId: v.id("quotePackageRevisions"),
    quoteInvitationResponseSubmissionRevisionId: v.id(
      "quoteInvitationResponseSubmissionRevisions"
    ),
    lineKey: v.string(),
    source: schemaValidators.quoteInvitationResponseDraftLineSourceValidator,
    scope: schemaValidators.quoteInvitationResponseDraftLineScopeValidator,
    sourcePackageRevisionLabourLineId: v.optional(
      v.id("quotePackageRevisionLabourLines")
    ),
    sourcePackageRevisionMaterialLineId: v.optional(
      v.id("quotePackageRevisionMaterialLines")
    ),
    sourcePackageRevisionResponseFieldId: v.optional(
      v.id("quotePackageRevisionResponseFields")
    ),
    title: v.string(),
    quotedAmountCents: v.optional(v.number()),
    createdAt: v.number(),
  })
    .index("by_quoteInvitationResponseSubmissionRevisionId_and_lineKey", [
      "quoteInvitationResponseSubmissionRevisionId",
      "lineKey",
    ])
    .index("by_quoteInvitationResponseSubmissionRevisionId_and_createdAt", [
      "quoteInvitationResponseSubmissionRevisionId",
      "createdAt",
    ]),
  quoteInvitationResponseSubmissionAnswers: defineTable({
    brokerageId: v.id("brokerages"),
    organizationId: v.string(),
    buildId: v.id("activeBuilds"),
    quoteRoundId: v.id("quoteRounds"),
    quoteRoundInvitationId: v.id("quoteRoundInvitations"),
    quotePackageRevisionId: v.id("quotePackageRevisions"),
    quoteInvitationResponseSubmissionRevisionId: v.id(
      "quoteInvitationResponseSubmissionRevisions"
    ),
    sourcePackageRevisionResponseFieldId: v.id(
      "quotePackageRevisionResponseFields"
    ),
    fieldKey: v.string(),
    scope: schemaValidators.quoteInvitationResponseDraftLineScopeValidator,
    value: v.string(),
    createdAt: v.number(),
  }).index("by_quoteInvitationResponseSubmissionRevisionId", [
    "quoteInvitationResponseSubmissionRevisionId",
  ]),
  quoteInvitationResponseSubmissionAttachments: defineTable({
    brokerageId: v.id("brokerages"),
    organizationId: v.string(),
    buildId: v.id("activeBuilds"),
    quoteRoundId: v.id("quoteRounds"),
    quoteRoundInvitationId: v.id("quoteRoundInvitations"),
    quotePackageRevisionId: v.id("quotePackageRevisions"),
    quoteInvitationResponseSubmissionRevisionId: v.id(
      "quoteInvitationResponseSubmissionRevisions"
    ),
    storageId: v.id("_storage"),
    fileName: v.string(),
    mimeType: v.string(),
    sizeBytes: v.number(),
    sourcePackageRevisionResponseFieldId: v.optional(
      v.id("quotePackageRevisionResponseFields")
    ),
    createdAt: v.number(),
  })
    .index("by_quoteInvitationResponseSubmissionRevisionId_and_createdAt", [
      "quoteInvitationResponseSubmissionRevisionId",
      "createdAt",
    ])
    .index("by_storageId", ["storageId"]),
};
