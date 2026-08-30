import { v } from "convex/values";
import type { AuthorizedViewer } from "../authz";
import { quoteInvitationCommunicationProjectionValidator } from "../quote_notifications";
import type { Doc, Id, MutationCtx, QueryCtx } from "../types";

export const MAX_DRAFT_LABOUR_LINES = 100;
export const MAX_DRAFT_MATERIAL_LINES = 100;
export const MAX_DRAFT_RECIPIENTS = 100;
export const MAX_REGISTER_INVITATIONS = MAX_DRAFT_RECIPIENTS * 2;
export const MAX_REGISTER_ACTIVE_INVITATIONS = 500;
export const MAX_REGISTER_CREDENTIALS_PER_INVITATION = 50;
export const MAX_REGISTER_NOTICES_PER_ROUND = 500;
export const MAX_MATERIAL_ASSIGNMENTS_PER_ROW = 100;
// A quote package writes a row for every material assignment alongside
// package lines, attachments, response fields, invitations, and credentials.
// Keep the aggregate below Convex's 4,096 range headroom rather than allowing
// the per-row limit to multiply into a publication-sized transaction.
export const MAX_TOTAL_MATERIAL_ASSIGNMENTS = 3000;
// The Build roadmap itself is capped at 500 Sub-milestones. Enforce that
// cardinality before hydration so one valid payload cannot fan out above
// Convex's 1,000 concurrent-I/O or 4,096 range-read transaction limits.
export const MAX_DISTINCT_MATERIAL_SUBMILESTONES = 500;
export const MAX_INHERITED_ATTACHMENTS = 200;
// Link discovery is global across the package, including internal and permit
// links that are intentionally excluded from the attachment result.
export const MAX_INHERITED_LINKS_SCANNED = 1000;
export const MAX_CURRENT_PERMIT_CANDIDATES = 500;
export const MAX_PACKAGE_REVISION_HISTORY = 20;
export const MAX_TIPTAP_JSON_LENGTH = 250_000;
export const MATERIAL_ROW_KEY_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._:-]*$/;

export const quoteRoundModeValidator = v.union(
  v.literal("labour"),
  v.literal("material"),
  v.literal("combined")
);
export const quoteRoundStateValidator = v.union(
  v.literal("draft"),
  v.literal("open"),
  v.literal("closed"),
  v.literal("cancelled")
);
export const quoteRoundAttentionReasonValidator = v.union(
  v.literal("delivery_failure"),
  v.literal("deadline_overdue"),
  v.literal("deadline_imminent"),
  v.literal("revision_wait"),
  v.literal("reminder_eligible"),
  v.literal("scheduling_readiness")
);
export const quoteRoundAttentionToneValidator = v.union(
  v.literal("critical"),
  v.literal("warning"),
  v.literal("neutral")
);
export const quoteRoundDeliveryStatusValidator = v.union(
  v.literal("not_dispatched"),
  v.literal("partially_dispatched"),
  v.literal("pending"),
  v.literal("delivered"),
  v.literal("failed"),
  v.literal("mixed")
);
export const quoteRoundMaterialSourceValidator = v.union(
  v.literal("build_cost_item"),
  v.literal("ad_hoc")
);
export const quoteRecipientCapabilityValidator = v.union(
  v.literal("contractor"),
  v.literal("supplier")
);
export const quoteResponseTemplateAudienceValidator = v.union(
  v.literal("contractor"),
  v.literal("supplier"),
  v.literal("either")
);
export const quoteResponseTemplateFieldKindValidator = v.union(
  v.literal("priced_line"),
  v.literal("short_text"),
  v.literal("long_text"),
  v.literal("date"),
  v.literal("choice"),
  v.literal("attachment")
);
export const quoteResponseTemplateFieldScopeValidator = v.union(
  v.literal("whole_quote"),
  v.literal("labour"),
  v.literal("materials")
);
export const quoteResponseTemplateFieldRendererValidator = v.union(
  v.literal("input"),
  v.literal("tiptap")
);
export const quoteResponseTemplateFieldValidationValidator = v.object({
  allowedMimeTypes: v.optional(v.array(v.string())),
  maxFiles: v.optional(v.number()),
  maxLength: v.optional(v.number()),
  maxValueCents: v.optional(v.number()),
  minFiles: v.optional(v.number()),
  minLength: v.optional(v.number()),
  minValueCents: v.optional(v.number()),
  pattern: v.optional(v.string()),
});
export const quoteResponseTemplateTaxValidator = v.object({
  label: v.string(),
  rateBps: v.number(),
});

export const materialDraftRowInputValidator = v.object({
  assignedSubmilestoneIds: v.array(v.id("buildSubmilestones")),
  deliveryEndDay: v.optional(v.number()),
  deliveryInstructions: v.optional(v.string()),
  deliveryLocation: v.optional(v.string()),
  deliveryStartDay: v.optional(v.number()),
  description: v.optional(v.string()),
  quantity: v.optional(v.number()),
  rowKey: v.string(),
  source: quoteRoundMaterialSourceValidator,
  sourceBuildCostItemId: v.optional(v.id("buildCostItems")),
  specificationTiptapJson: v.optional(v.string()),
  title: v.optional(v.string()),
  unit: v.optional(v.string()),
});

export const quoteTemplateFieldProjectionValidator = v.object({
  _id: v.id("quoteResponseTemplateFields"),
  allowAlternates: v.boolean(),
  allowExclusions: v.boolean(),
  choiceOptions: v.optional(v.array(v.string())),
  fieldKey: v.string(),
  isPermanent: v.boolean(),
  kind: quoteResponseTemplateFieldKindValidator,
  label: v.string(),
  order: v.number(),
  renderer: quoteResponseTemplateFieldRendererValidator,
  repeatable: v.boolean(),
  required: v.boolean(),
  richTextDefaultHtml: v.optional(v.string()),
  scope: quoteResponseTemplateFieldScopeValidator,
  supportsTax: v.boolean(),
  tax: v.optional(quoteResponseTemplateTaxValidator),
  validation: v.optional(quoteResponseTemplateFieldValidationValidator),
});

export const quoteTemplateVersionProjectionValidator = v.object({
  _id: v.id("quoteResponseTemplateVersions"),
  audience: quoteResponseTemplateAudienceValidator,
  description: v.optional(v.string()),
  fields: v.array(quoteTemplateFieldProjectionValidator),
  name: v.string(),
  templateId: v.id("quoteResponseTemplates"),
  version: v.number(),
});

export const labourSourceProjectionValidator = v.object({
  _id: v.id("buildSubmilestones"),
  budgetCents: v.optional(v.number()),
  buildMilestoneId: v.id("buildMilestones"),
  durationDays: v.optional(v.number()),
  milestoneKey: v.string(),
  milestoneName: v.string(),
  name: v.string(),
  order: v.number(),
  scopeOfWorkTiptapJson: v.string(),
  sourceScopeChangeReason: v.optional(v.string()),
  sourceScopeRevisionId: v.id("submilestoneScopeRevisions"),
  sourceScopeVersion: v.number(),
  startDay: v.optional(v.number()),
  submilestoneKey: v.string(),
});

export const materialSourceProjectionValidator = v.object({
  _id: v.id("buildCostItems"),
  deliveryEndDay: v.optional(v.number()),
  deliveryInstructions: v.optional(v.string()),
  deliveryLocation: v.optional(v.string()),
  deliveryStartDay: v.optional(v.number()),
  description: v.optional(v.string()),
  milestoneKey: v.string(),
  quantity: v.number(),
  relevantSubmilestoneKeys: v.array(v.string()),
  specificationTiptapJson: v.optional(v.string()),
  title: v.string(),
  unit: v.optional(v.string()),
});

export const quoteRecipientProjectionValidator = v.object({
  _id: v.id("contractorProfiles"),
  email: v.string(),
  name: v.string(),
  quoteRecipientCapabilities: v.array(quoteRecipientCapabilityValidator),
  quoteRecipientProvisioningState: v.optional(
    v.union(v.literal("provisional"), v.literal("claimed"))
  ),
});

export const composerProjectionValidator = v.object({
  build: v.object({
    _id: v.id("activeBuilds"),
    buildName: v.string(),
    location: v.string(),
    locationLatitude: v.optional(v.number()),
    locationLongitude: v.optional(v.number()),
    locationPlaceId: v.optional(v.string()),
    startDate: v.string(),
    timelineCurrentDay: v.optional(v.number()),
    timelineRangeMax: v.optional(v.number()),
    timelineRangeMin: v.optional(v.number()),
  }),
  eligibleRecipients: v.array(quoteRecipientProjectionValidator),
  labourSubmilestones: v.array(labourSourceProjectionValidator),
  materialCostItems: v.array(materialSourceProjectionValidator),
  permit: v.union(
    v.object({
      _id: v.id("buildDocuments"),
      fileName: v.string(),
      governedAssetId: v.optional(v.id("buildCollaborationAssets")),
      mimeType: v.string(),
      version: v.number(),
    }),
    v.null()
  ),
  responseTemplates: v.array(quoteTemplateVersionProjectionValidator),
});

export const draftMaterialRowProjectionValidator = v.object({
  assignedSubmilestoneIds: v.array(v.id("buildSubmilestones")),
  deliveryEndDay: v.optional(v.number()),
  deliveryInstructions: v.optional(v.string()),
  deliveryLocation: v.optional(v.string()),
  deliveryStartDay: v.optional(v.number()),
  description: v.optional(v.string()),
  quantity: v.optional(v.number()),
  rowKey: v.string(),
  source: quoteRoundMaterialSourceValidator,
  sourceBuildCostItemId: v.optional(v.id("buildCostItems")),
  specificationTiptapJson: v.optional(v.string()),
  title: v.optional(v.string()),
  unit: v.optional(v.string()),
});

export const quoteRoundDraftProjectionValidator = v.object({
  labourLines: v.array(
    v.object({
      buildSubmilestoneId: v.id("buildSubmilestones"),
      scopeOfWorkTiptapJson: v.string(),
      sourceScopeChangeReason: v.optional(v.string()),
      sourceScopeRevisionId: v.id("submilestoneScopeRevisions"),
      sourceScopeVersion: v.number(),
    })
  ),
  labourSubmilestoneIds: v.array(v.id("buildSubmilestones")),
  materialRows: v.array(draftMaterialRowProjectionValidator),
  recipientProfileIds: v.array(v.id("contractorProfiles")),
  responseDeadline: v.optional(v.number()),
  scopeUpdateAvailable: v.boolean(),
  templateVersionId: v.optional(v.id("quoteResponseTemplateVersions")),
});

export const packageAttachmentProjectionValidator = v.object({
  contentHashSha256Snapshot: v.string(),
  fileNameSnapshot: v.string(),
  kind: v.union(v.literal("permit"), v.literal("inherited")),
  mimeTypeSnapshot: v.string(),
  sourceBuildDocumentId: v.id("buildDocuments"),
  sourceBuildSubmilestoneId: v.optional(v.id("buildSubmilestones")),
});

export const packageLabourLineProjectionValidator = v.object({
  buildSubmilestoneId: v.id("buildSubmilestones"),
  milestoneKey: v.string(),
  milestoneName: v.string(),
  scopeOfWorkTiptapJson: v.string(),
  sourceScopeChangeReason: v.optional(v.string()),
  sourceScopeRevisionId: v.optional(v.id("submilestoneScopeRevisions")),
  sourceScopeVersion: v.optional(v.number()),
  startDay: v.optional(v.number()),
  submilestoneKey: v.string(),
  submilestoneName: v.string(),
});

export const packageMaterialAssignmentProjectionValidator = v.object({
  buildSubmilestoneId: v.id("buildSubmilestones"),
  milestoneKey: v.string(),
  milestoneName: v.string(),
  submilestoneKey: v.string(),
  submilestoneName: v.string(),
});

export const packageMaterialLineProjectionValidator = v.object({
  assignments: v.array(packageMaterialAssignmentProjectionValidator),
  deliveryEndDay: v.number(),
  deliveryInstructions: v.string(),
  deliveryLocation: v.string(),
  deliveryStartDay: v.number(),
  description: v.optional(v.string()),
  quantity: v.number(),
  source: quoteRoundMaterialSourceValidator,
  sourceBuildCostItemId: v.optional(v.id("buildCostItems")),
  specificationTiptapJson: v.string(),
  title: v.string(),
  unit: v.string(),
});

export const packageResponseFieldProjectionValidator = v.object({
  allowAlternates: v.boolean(),
  allowExclusions: v.boolean(),
  choiceOptions: v.optional(v.array(v.string())),
  fieldKey: v.string(),
  isPermanent: v.boolean(),
  kind: quoteResponseTemplateFieldKindValidator,
  label: v.string(),
  order: v.number(),
  renderer: quoteResponseTemplateFieldRendererValidator,
  repeatable: v.boolean(),
  required: v.boolean(),
  richTextDefaultHtml: v.optional(v.string()),
  scope: quoteResponseTemplateFieldScopeValidator,
  supportsTax: v.boolean(),
  tax: v.optional(quoteResponseTemplateTaxValidator),
  validation: v.optional(quoteResponseTemplateFieldValidationValidator),
});

export const quotePackageRevisionProjectionValidator = v.object({
  _id: v.id("quotePackageRevisions"),
  attachments: v.array(packageAttachmentProjectionValidator),
  labourLines: v.array(packageLabourLineProjectionValidator),
  materialLines: v.array(packageMaterialLineProjectionValidator),
  permitDocumentId: v.id("buildDocuments"),
  responseDeadline: v.number(),
  responseFields: v.array(packageResponseFieldProjectionValidator),
  revision: v.number(),
  roadmapSnapshotFingerprint: v.string(),
  siteAddressSnapshot: v.string(),
  siteLatitudeSnapshot: v.optional(v.number()),
  siteLongitudeSnapshot: v.optional(v.number()),
  siteMapUrlSnapshot: v.string(),
  sitePlaceIdSnapshot: v.optional(v.string()),
  templateVersionId: v.id("quoteResponseTemplateVersions"),
  timelineCurrentDaySnapshot: v.optional(v.number()),
  timelineRangeMaxSnapshot: v.optional(v.number()),
  timelineRangeMinSnapshot: v.optional(v.number()),
  timelineStartDateSnapshot: v.string(),
});

export const quoteInvitationProjectionValidator = v.object({
  _id: v.id("quoteRoundInvitations"),
  participationState: v.union(v.literal("active"), v.literal("revoked")),
  recipientCapabilitiesSnapshot: v.array(quoteRecipientCapabilityValidator),
  recipientEmailSnapshot: v.string(),
  recipientNameSnapshot: v.string(),
  recipientProfileId: v.id("contractorProfiles"),
});

export const quoteRoundProjectionValidator = v.object({
  _id: v.id("quoteRounds"),
  buildId: v.id("activeBuilds"),
  draft: v.union(quoteRoundDraftProjectionValidator, v.null()),
  invitations: v.array(quoteInvitationProjectionValidator),
  mode: quoteRoundModeValidator,
  packageRevisionHistory: v.array(
    v.object({
      _id: v.id("quotePackageRevisions"),
      publishedAt: v.number(),
      responseDeadline: v.number(),
      revision: v.number(),
    })
  ),
  packageRevision: v.union(quotePackageRevisionProjectionValidator, v.null()),
  revision: v.number(),
  scopeUpdateAvailable: v.boolean(),
  state: quoteRoundStateValidator,
  title: v.string(),
  updatedAt: v.number(),
});

export const quoteRoundSummaryValidator = v.object({
  _id: v.id("quoteRounds"),
  access: v.object({
    active: v.number(),
    expired: v.number(),
    revoked: v.number(),
    rotated: v.number(),
    total: v.number(),
  }),
  attention: v.union(
    v.object({
      detail: v.string(),
      label: v.string(),
      rank: v.number(),
      reason: quoteRoundAttentionReasonValidator,
      tone: quoteRoundAttentionToneValidator,
    }),
    v.null()
  ),
  delivery: v.object({
    delivered: v.number(),
    failed: v.number(),
    pending: v.number(),
    status: quoteRoundDeliveryStatusValidator,
    total: v.number(),
    undispatched: v.number(),
  }),
  invitationCount: v.number(),
  lastActivityAt: v.number(),
  mode: quoteRoundModeValidator,
  packageRevisionId: v.optional(v.id("quotePackageRevisions")),
  packageRevisionNumber: v.optional(v.number()),
  participation: v.object({
    active: v.number(),
    revoked: v.number(),
    total: v.number(),
  }),
  preferredQuote: v.union(
    v.object({
      canonicalTotalCents: v.number(),
      invitationId: v.id("quoteRoundInvitations"),
      packageRevisionId: v.id("quotePackageRevisions"),
      revision: v.number(),
      submittedAt: v.number(),
      submissionRevisionId: v.id("quoteInvitationResponseSubmissionRevisions"),
    }),
    v.null()
  ),
  recipients: v.object({
    active: v.number(),
    revoked: v.number(),
    total: v.number(),
  }),
  recipientDelivery: v.array(quoteInvitationCommunicationProjectionValidator),
  responseDeadline: v.optional(v.number()),
  responses: v.object({
    drafting: v.number(),
    submitted: v.number(),
    total: v.number(),
  }),
  revision: v.number(),
  scope: v.string(),
  scopeUpdateAvailable: v.boolean(),
  state: quoteRoundStateValidator,
  title: v.string(),
  updatedAt: v.number(),
});

export const quoteRoundListValidator = v.object({
  rounds: v.array(quoteRoundSummaryValidator),
});

export const quoteRoundScopePinTransitionValidator = v.object({
  buildSubmilestoneId: v.id("buildSubmilestones"),
  newSourceScopeRevisionId: v.id("submilestoneScopeRevisions"),
  priorSourceScopeRevisionId: v.union(
    v.id("submilestoneScopeRevisions"),
    v.null()
  ),
});

export const quoteRoundDraftMutationResultValidator = v.object({
  quoteRoundId: v.id("quoteRounds"),
  revision: v.number(),
  state: quoteRoundStateValidator,
});

export const quoteRoundScopeRefreshMutationResultValidator = v.object({
  quoteRoundId: v.id("quoteRounds"),
  revision: v.number(),
  scopePinTransitions: v.array(quoteRoundScopePinTransitionValidator),
  state: quoteRoundStateValidator,
});

export const quoteRoundPublicationResultValidator = v.object({
  idempotentReplay: v.boolean(),
  invitationCount: v.number(),
  invitationIds: v.array(v.id("quoteRoundInvitations")),
  packageRevisionId: v.id("quotePackageRevisions"),
  packageRevisionNumber: v.number(),
  quoteRoundId: v.id("quoteRounds"),
  responseDeadline: v.number(),
  state: v.literal("open"),
});

export type QuoteRoundCtx = (QueryCtx | MutationCtx) & {
  viewer: AuthorizedViewer;
};

export interface DraftMaterialRowInput {
  assignedSubmilestoneIds: Id<"buildSubmilestones">[];
  deliveryEndDay?: number;
  deliveryInstructions?: string;
  deliveryLocation?: string;
  deliveryStartDay?: number;
  description?: string;
  quantity?: number;
  rowKey: string;
  source: "build_cost_item" | "ad_hoc";
  sourceBuildCostItemId?: Id<"buildCostItems">;
  specificationTiptapJson?: string;
  title?: string;
  unit?: string;
}

export type NormalizedAdHocMaterialRow = Omit<
  DraftMaterialRowInput,
  "assignedSubmilestoneIds" | "sourceBuildCostItemId"
> & {
  deliveryEndDay: number;
  deliveryInstructions: string;
  deliveryLocation: string;
  deliveryStartDay: number;
  quantity: number;
  specificationTiptapJson: string;
  title: string;
  unit: string;
};

export interface DraftState {
  draft: Doc<"quoteRoundDrafts">;
  labourScope: Doc<"quoteRoundDraftLabourScope">[];
  materialAssignmentsByRowId: Map<
    Id<"quoteRoundDraftMaterialRows">,
    Doc<"quoteRoundDraftMaterialAssignments">[]
  >;
  materialRows: Doc<"quoteRoundDraftMaterialRows">[];
  recipients: Doc<"quoteRoundDraftRecipients">[];
}

export interface EffectiveQuoteScope {
  scopeOfWorkTiptapJson: string;
  sourceScopeChangeReason?: string;
  sourceScopeRevisionId: Id<"submilestoneScopeRevisions">;
  sourceScopeVersion: number;
}

export interface QuoteRoundScopePinTransition {
  buildSubmilestoneId: Id<"buildSubmilestones">;
  newSourceScopeRevisionId: Id<"submilestoneScopeRevisions">;
  priorSourceScopeRevisionId: Id<"submilestoneScopeRevisions"> | null;
}

// Scope resolution is request-local. A single Sub-milestone can appear in a
// draft, a package projection, and multiple register rows; cache the in-flight
// Promise so concurrent Promise.all branches share one canonical lookup.
export type QuoteScopeCache = Map<
  Id<"buildSubmilestones">,
  Promise<EffectiveQuoteScope | null>
>;

export interface QuoteRoundPublicationResult {
  idempotentReplay: boolean;
  invitationCount: number;
  invitationIds: Id<"quoteRoundInvitations">[];
  packageRevisionId: Id<"quotePackageRevisions">;
  packageRevisionNumber: number;
  quoteRoundId: Id<"quoteRounds">;
  responseDeadline: number;
  state: "open";
}

export interface QuoteRoundRegisterAttention {
  detail: string;
  label: string;
  rank: number;
  reason:
    | "delivery_failure"
    | "deadline_overdue"
    | "deadline_imminent"
    | "revision_wait"
    | "reminder_eligible"
    | "scheduling_readiness";
  tone: "critical" | "warning" | "neutral";
}

export interface QuoteRoundRegisterDelivery {
  delivered: number;
  failed: number;
  pending: number;
  status:
    | "not_dispatched"
    | "partially_dispatched"
    | "pending"
    | "delivered"
    | "failed"
    | "mixed";
  total: number;
  undispatched: number;
}
