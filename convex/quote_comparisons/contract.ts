import { v } from "convex/values";

import { quoteInvitationCommunicationProjectionValidator } from "../quote_notifications";

export const MAX_PACKAGE_LABOUR_LINES = 340;
export const MAX_PACKAGE_MATERIAL_LINES = 340;
export const MAX_PACKAGE_ASSIGNMENTS_PER_LINE = 100;
export const MAX_PACKAGE_ASSIGNMENTS_TOTAL = 500;
export const MAX_PACKAGE_RESPONSE_FIELDS = 100;
export const MAX_PACKAGE_ATTACHMENTS = 100;
export const MAX_INVITATIONS = 100;
export const MAX_SUBMISSION_LINES = 340;
export const MAX_SUBMISSION_ANSWERS = 100;
export const MAX_SUBMISSION_ATTACHMENTS = 25;
export const MAX_SUBMISSION_EVENTS = 4;
export const MAX_HISTORY = 20;
export const MAX_PACKAGE_REVISION_LINEAGE = MAX_HISTORY;
export const MAX_QUOTE_AMOUNT_CENTS = 100_000_000_000;

const packageLabourLineValidator = v.object({
  _id: v.id("quotePackageRevisionLabourLines"),
  budgetCents: v.optional(v.number()),
  buildMilestoneId: v.id("buildMilestones"),
  buildSubmilestoneId: v.id("buildSubmilestones"),
  durationDays: v.optional(v.number()),
  milestoneKey: v.string(),
  milestoneName: v.string(),
  order: v.number(),
  scopeOfWorkTiptapJson: v.string(),
  sourceScopeChangeReason: v.optional(v.string()),
  sourceScopeRevisionId: v.optional(v.id("submilestoneScopeRevisions")),
  sourceScopeVersion: v.optional(v.number()),
  startDay: v.optional(v.number()),
  submilestoneKey: v.string(),
  submilestoneName: v.string(),
});

const packageMaterialAssignmentValidator = v.object({
  _id: v.id("quotePackageRevisionMaterialAssignments"),
  buildMilestoneId: v.id("buildMilestones"),
  buildSubmilestoneId: v.id("buildSubmilestones"),
  durationDays: v.optional(v.number()),
  milestoneKey: v.string(),
  milestoneName: v.string(),
  order: v.number(),
  startDay: v.optional(v.number()),
  submilestoneKey: v.string(),
  submilestoneName: v.string(),
});

const packageMaterialLineValidator = v.object({
  _id: v.id("quotePackageRevisionMaterialLines"),
  deliveryEndDay: v.number(),
  deliveryInstructions: v.string(),
  deliveryLocation: v.string(),
  deliveryStartDay: v.number(),
  description: v.optional(v.string()),
  order: v.number(),
  quantity: v.number(),
  source: v.union(v.literal("build_cost_item"), v.literal("ad_hoc")),
  sourceBuildCostItemId: v.optional(v.id("buildCostItems")),
  sourceDraftRowKey: v.optional(v.string()),
  specificationTiptapJson: v.string(),
  title: v.string(),
  unit: v.string(),
  assignments: v.array(packageMaterialAssignmentValidator),
});

const packageResponseFieldValidator = v.object({
  _id: v.id("quotePackageRevisionResponseFields"),
  allowAlternates: v.boolean(),
  allowExclusions: v.boolean(),
  choiceOptions: v.optional(v.array(v.string())),
  fieldKey: v.string(),
  isPermanent: v.boolean(),
  kind: v.union(
    v.literal("priced_line"),
    v.literal("short_text"),
    v.literal("long_text"),
    v.literal("date"),
    v.literal("choice"),
    v.literal("attachment")
  ),
  label: v.string(),
  order: v.number(),
  repeatable: v.boolean(),
  renderer: v.union(v.literal("input"), v.literal("tiptap")),
  required: v.boolean(),
  richTextDefaultHtml: v.optional(v.string()),
  scope: v.union(
    v.literal("whole_quote"),
    v.literal("labour"),
    v.literal("materials")
  ),
  sourceTemplateFieldId: v.id("quoteResponseTemplateFields"),
  supportsTax: v.boolean(),
  tax: v.any(),
  validation: v.any(),
});

const packageAttachmentValidator = v.object({
  _id: v.id("quotePackageRevisionAttachments"),
  contentHashSha256Snapshot: v.string(),
  fileNameSnapshot: v.string(),
  kind: v.union(v.literal("permit"), v.literal("inherited")),
  mimeTypeSnapshot: v.string(),
  order: v.number(),
  sizeBytesSnapshot: v.number(),
  sourceBuildDocumentId: v.id("buildDocuments"),
  sourceBuildSubmilestoneId: v.optional(v.id("buildSubmilestones")),
  sourceDocumentVersionSnapshot: v.number(),
  storageIdSnapshot: v.optional(v.id("_storage")),
});

const packageComparisonValidator = v.object({
  _id: v.id("quotePackageRevisions"),
  accessExpiresAt: v.optional(v.number()),
  attachments: v.array(packageAttachmentValidator),
  labourLines: v.array(packageLabourLineValidator),
  materialLines: v.array(packageMaterialLineValidator),
  permitDocumentId: v.id("buildDocuments"),
  permitDocumentVersion: v.number(),
  responseDeadline: v.number(),
  responseFields: v.array(packageResponseFieldValidator),
  revision: v.number(),
  roadmapSnapshotFingerprint: v.string(),
  siteAddressSnapshot: v.string(),
  siteLatitudeSnapshot: v.optional(v.number()),
  siteLongitudeSnapshot: v.optional(v.number()),
  siteMapUrlSnapshot: v.string(),
  sitePlaceIdSnapshot: v.optional(v.string()),
  timelineCurrentDaySnapshot: v.optional(v.number()),
  timelineRangeMaxSnapshot: v.optional(v.number()),
  timelineRangeMinSnapshot: v.optional(v.number()),
  timelineStartDateSnapshot: v.string(),
});

const comparisonLineValidator = v.object({
  _id: v.id("quoteInvitationResponseSubmissionLineItems"),
  lineKey: v.string(),
  quotedAmountCents: v.optional(v.number()),
  scope: v.union(
    v.literal("labour"),
    v.literal("materials"),
    v.literal("whole_quote")
  ),
  source: v.union(
    v.literal("package_labour"),
    v.literal("package_material"),
    v.literal("template_priced"),
    v.literal("expanded_scope")
  ),
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
});

const comparisonAnswerValidator = v.object({
  fieldKey: v.string(),
  kind: v.union(
    v.literal("priced_line"),
    v.literal("short_text"),
    v.literal("long_text"),
    v.literal("date"),
    v.literal("choice"),
    v.literal("attachment")
  ),
  label: v.string(),
  scope: v.union(
    v.literal("labour"),
    v.literal("materials"),
    v.literal("whole_quote")
  ),
  sourcePackageRevisionResponseFieldId: v.id(
    "quotePackageRevisionResponseFields"
  ),
  supportsTax: v.boolean(),
  tax: v.any(),
  value: v.string(),
});

const comparisonAttachmentValidator = v.object({
  _id: v.id("quoteInvitationResponseSubmissionAttachments"),
  createdAt: v.number(),
  fileName: v.string(),
  mimeType: v.string(),
  sizeBytes: v.number(),
  sourcePackageRevisionResponseFieldId: v.optional(
    v.id("quotePackageRevisionResponseFields")
  ),
  storageId: v.optional(v.id("_storage")),
});

const comparisonHistoryValidator = v.object({
  canonicalTotalCents: v.number(),
  revision: v.number(),
  status: v.union(
    v.literal("active"),
    v.literal("superseded"),
    v.literal("withdrawn")
  ),
  submittedAt: v.number(),
  supersededByRevision: v.optional(v.number()),
  withdrawnAt: v.optional(v.number()),
});

const comparisonCandidateValidator = v.object({
  answers: v.array(comparisonAnswerValidator),
  attachments: v.array(comparisonAttachmentValidator),
  commentsHtml: v.optional(v.string()),
  expandedScopeLines: v.array(comparisonLineValidator),
  history: v.array(comparisonHistoryValidator),
  invitation: v.object({
    _id: v.id("quoteRoundInvitations"),
    recipientCapabilitiesSnapshot: v.array(
      v.union(v.literal("contractor"), v.literal("supplier"))
    ),
    recipientEmailSnapshot: v.string(),
    recipientNameSnapshot: v.string(),
    recipientProfileId: v.id("contractorProfiles"),
  }),
  labourLines: v.array(comparisonLineValidator),
  materialLines: v.array(comparisonLineValidator),
  submission: v.object({
    _id: v.id("quoteInvitationResponseSubmissionRevisions"),
    canonicalTotalCents: v.number(),
    quotePackageRevisionId: v.id("quotePackageRevisions"),
    revision: v.number(),
    sourceDraftVersion: v.number(),
    status: v.literal("active"),
    submittedAt: v.number(),
  }),
  totals: v.object({
    canonicalTotalCents: v.number(),
    expandedScopeCents: v.number(),
    labourCents: v.number(),
    materialsCents: v.number(),
    templatePricedCents: v.number(),
  }),
});

const preferredSummaryValidator = v.object({
  selectedAt: v.number(),
  selectedByWorkosUserId: v.string(),
  submissionRevision: v.number(),
  submissionRevisionId: v.id("quoteInvitationResponseSubmissionRevisions"),
  quotePackageRevisionId: v.id("quotePackageRevisions"),
  quoteRoundInvitationId: v.id("quoteRoundInvitations"),
});

const comparisonInvitationValidator = v.object({
  _id: v.id("quoteRoundInvitations"),
  access: v.object({
    active: v.number(),
    expired: v.number(),
    revoked: v.number(),
    rotated: v.number(),
    total: v.number(),
  }),
  communication: quoteInvitationCommunicationProjectionValidator,
  currentPackageRevisionId: v.optional(v.id("quotePackageRevisions")),
  hasCurrentSubmission: v.boolean(),
  originalPackageRevisionId: v.id("quotePackageRevisions"),
  participationState: v.union(v.literal("active"), v.literal("revoked")),
  recipientCapabilitiesSnapshot: v.array(
    v.union(v.literal("contractor"), v.literal("supplier"))
  ),
  recipientEmailSnapshot: v.string(),
  recipientNameSnapshot: v.string(),
  recipientProfileId: v.id("contractorProfiles"),
});

const availableComparisonValidator = v.object({
  candidates: v.array(comparisonCandidateValidator),
  canClearPreferred: v.boolean(),
  canSetPreferred: v.boolean(),
  invitations: v.array(comparisonInvitationValidator),
  isHistoricalPackageRevision: v.boolean(),
  package: packageComparisonValidator,
  packageRevisionHistory: v.array(
    v.object({
      _id: v.id("quotePackageRevisions"),
      publishedAt: v.number(),
      responseDeadline: v.number(),
      revision: v.number(),
    })
  ),
  preferred: v.union(preferredSummaryValidator, v.null()),
  round: v.object({
    _id: v.id("quoteRounds"),
    mode: v.union(
      v.literal("labour"),
      v.literal("material"),
      v.literal("combined")
    ),
    revision: v.number(),
    state: v.union(
      v.literal("draft"),
      v.literal("open"),
      v.literal("closed"),
      v.literal("cancelled")
    ),
    title: v.string(),
    updatedAt: v.number(),
  }),
  stateVersion: v.number(),
  status: v.literal("available"),
});

export const comparisonResultValidator = v.union(
  v.object({ reason: v.string(), status: v.literal("unavailable") }),
  availableComparisonValidator
);

export const preferredCommandResultValidator = v.union(
  v.object({
    idempotentReplay: v.boolean(),
    preferred: v.union(preferredSummaryValidator, v.null()),
    stateVersion: v.number(),
    status: v.literal("selected"),
  }),
  v.object({
    preferred: v.union(preferredSummaryValidator, v.null()),
    stateVersion: v.number(),
    status: v.literal("cleared"),
  }),
  v.object({
    idempotentReplay: v.literal(false),
    preferred: v.union(preferredSummaryValidator, v.null()),
    stateVersion: v.number(),
    status: v.literal("conflict"),
  })
);
