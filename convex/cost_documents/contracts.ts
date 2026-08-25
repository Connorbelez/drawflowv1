import { v } from "convex/values";

import { buildCollaborationRoleValidator } from "../build_collaboration_validators";
import type { BuildCollaborationRole } from "../build_collaboration_model";
import type { Doc, Id } from "../types";

export type { CurrentCostDocumentContractorScope } from "../cost_document_access";
export type CostDocumentActorCapacity = BuildCollaborationRole;

export const SUPPORTING_CONTEXT_DISCLOSURE =
  "This Cost Document does not prove payment, completion, reimbursement eligibility, Draw inclusion, or approval.";
export const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
export const MAX_PAGES = 50;
export const MAX_ALLOCATIONS = 100;
export const MAX_FINANCIAL_COMPONENTS = 20;
export const MAX_BATCH_DRAFTS = 10;
export const MAX_BATCH_PAGES = 100;
export const MAX_BATCH_ALLOCATIONS = 200;
export const MAX_BATCH_FINANCIAL_COMPONENTS = 200;
export const MAX_VENDOR_OPTIONS = 100;
export const MAX_VENDOR_DUPLICATE_CANDIDATES = 500;
export const MAX_ROADMAP_RECONCILIATION_INTEGRITY_EXCEPTIONS = 50;
export const COST_DOCUMENT_INTEGRITY_KINDS = [
  "unavailable",
  "quarantined",
  "missing",
  "corrupt",
] as const;
// Submitted Cost Documents are authorization-filtered after their indexed
// candidate lookup. The raw query can return more than `numItems` while a
// reactive page interval is being replayed, so every returned candidate must
// be authorized before we advance its native cursor.
export const MAX_SUBMITTED_DOCUMENT_LIST_SCAN = 100;
export const COST_DOCUMENT_DRAFT_STEPS = [
  "capture_confirm",
  "balance_allocate",
  "share",
  "freeze",
] as const;

export const costDocumentKindValidator = v.union(
  v.literal("invoice"),
  v.literal("receipt")
);
export const costDocumentCategoryValidator = v.union(
  v.literal("labour"),
  v.literal("materials")
);
export const costDocumentDraftStepValidator = v.union(
  v.literal("capture_confirm"),
  v.literal("balance_allocate"),
  v.literal("share"),
  v.literal("freeze")
);
export const costDocumentFinancialComponentKindValidator = v.union(
  v.literal("subtotal"),
  v.literal("tax"),
  v.literal("fee"),
  v.literal("discount")
);
export const costDocumentFinancialComponentInputValidator = v.object({
  amountCents: v.number(),
  kind: costDocumentFinancialComponentKindValidator,
  label: v.optional(v.string()),
});

export const costDocumentPageProjectionValidator = v.object({
  assetId: v.id("buildCollaborationAssets"),
  contentHashSha256: v.string(),
  fileName: v.string(),
  mimeType: v.string(),
  order: v.number(),
});

export const costDocumentAllocationProjectionValidator = v.object({
  amountCents: v.number(),
  buildSubmilestoneId: v.id("buildSubmilestones"),
  order: v.number(),
  submilestoneKey: v.string(),
  submilestoneName: v.string(),
});

export const costDocumentFinancialComponentProjectionValidator = v.object({
  amountCents: v.number(),
  kind: costDocumentFinancialComponentKindValidator,
  label: v.optional(v.string()),
  order: v.number(),
});

export const costDocumentActivityProjectionValidator = v.object({
  createdAt: v.number(),
  eventType: v.string(),
});

export const costDocumentReviewTypeValidator = v.union(
  v.literal("builder"),
  v.literal("brokerage")
);
export const costDocumentReviewOutcomeValidator = v.union(
  v.literal("accepted"),
  v.literal("needs_correction")
);
export const costDocumentReviewProjectionValidator = v.object({
  annotation: v.string(),
  createdAt: v.number(),
  outcome: costDocumentReviewOutcomeValidator,
  revision: v.number(),
});
export const costDocumentIntegrityKindValidator = v.union(
  v.literal("unavailable"),
  v.literal("quarantined"),
  v.literal("missing"),
  v.literal("corrupt")
);
export const costDocumentLifecycleStateValidator = v.union(
  v.literal("current"),
  v.literal("superseded"),
  v.literal("voided")
);
export const costDocumentReviewAttentionValidator = v.union(
  v.literal("unreviewed"),
  v.literal("partially_reviewed"),
  v.literal("reviewed"),
  v.literal("needs_correction")
);
export const costDocumentVendorPartyTypeValidator = v.union(
  v.literal("contractor"),
  v.literal("supplier"),
  v.literal("vendor")
);
export const costDocumentVendorResolutionValidator = v.union(
  v.literal("linked"),
  v.literal("unresolved_legacy")
);
export const costDocumentVendorProjectionValidator = v.object({
  displayName: v.string(),
  partyType: costDocumentVendorPartyTypeValidator,
  profileId: v.optional(v.id("contractorProfiles")),
  resolution: costDocumentVendorResolutionValidator,
});
export const costDocumentVendorOptionValidator = v.object({
  city: v.optional(v.string()),
  email: v.optional(v.string()),
  name: v.string(),
  partyType: costDocumentVendorPartyTypeValidator,
  profileId: v.id("contractorProfiles"),
});
export const costDocumentVendorCreateAccessValidator = v.object({
  canCreate: v.boolean(),
});
export const costDocumentVendorCreationResultValidator = v.object({
  created: v.boolean(),
  duplicateOptions: v.array(costDocumentVendorOptionValidator),
  option: v.optional(costDocumentVendorOptionValidator),
});
export const costDocumentIntegrityExceptionProjectionValidator = v.object({
  actionRequired: v.boolean(),
  assetId: v.id("buildCollaborationAssets"),
  createdAt: v.number(),
  kind: costDocumentIntegrityKindValidator,
  pageId: v.id("costDocumentPages"),
});

export const costDocumentSummaryValidator = v.object({
  _id: v.id("costDocuments"),
  category: costDocumentCategoryValidator,
  currency: v.literal("CAD"),
  grossTotalCents: v.number(),
  kind: costDocumentKindValidator,
  state: v.literal("submitted"),
  submittedAt: v.number(),
  title: v.string(),
  vendor: costDocumentVendorProjectionValidator,
  vendorName: v.string(),
});

export const costDocumentRoadmapReconciliationSummaryValidator = v.object({
  _id: v.id("costDocuments"),
  allocations: v.array(costDocumentAllocationProjectionValidator),
  category: costDocumentCategoryValidator,
  currency: v.literal("CAD"),
  documentDate: v.string(),
  duplicateWarning: v.boolean(),
  financialComponents: v.array(
    costDocumentFinancialComponentProjectionValidator
  ),
  grossTotalCents: v.number(),
  integrity: v.optional(
    v.object({
      healthy: v.boolean(),
      openExceptionKinds: v.array(costDocumentIntegrityKindValidator),
    })
  ),
  kind: costDocumentKindValidator,
  lifecycle: v.object({ state: costDocumentLifecycleStateValidator }),
  pages: v.array(costDocumentPageProjectionValidator),
  reviewAttention: v.optional(costDocumentReviewAttentionValidator),
  state: v.literal("submitted"),
  submittedAt: v.number(),
  title: v.string(),
  uploaderScope: v.union(v.literal("self"), v.literal("other")),
  vendor: costDocumentVendorProjectionValidator,
  vendorName: v.string(),
});

export const costDocumentCapabilitiesValidator = v.object({
  canRecordBrokerageReview: v.boolean(),
  canRecordBuilderReview: v.boolean(),
  canStartCorrection: v.boolean(),
  canVoid: v.boolean(),
});

export const costDocumentProjectionValidator = v.object({
  _id: v.id("costDocuments"),
  activity: v.array(costDocumentActivityProjectionValidator),
  allocations: v.array(costDocumentAllocationProjectionValidator),
  category: costDocumentCategoryValidator,
  capabilities: costDocumentCapabilitiesValidator,
  currency: v.literal("CAD"),
  description: v.optional(v.string()),
  documentDate: v.string(),
  financialComponents: v.array(
    costDocumentFinancialComponentProjectionValidator
  ),
  grossTotalCents: v.number(),
  kind: costDocumentKindValidator,
  duplicateWarning: v.optional(
    v.object({
      overridden: v.literal(true),
      reason: v.string(),
    })
  ),
  integrity: v.optional(
    v.object({
      healthy: v.boolean(),
      openExceptions: v.array(
        costDocumentIntegrityExceptionProjectionValidator
      ),
    })
  ),
  lifecycle: v.object({
    state: v.union(
      v.literal("current"),
      v.literal("superseded"),
      v.literal("voided")
    ),
    supersededAt: v.optional(v.number()),
    voidedAt: v.optional(v.number()),
    voidReason: v.optional(v.string()),
  }),
  pages: v.array(costDocumentPageProjectionValidator),
  reviews: v.optional(
    v.object({
      brokerage: v.optional(costDocumentReviewProjectionValidator),
      builder: v.optional(costDocumentReviewProjectionValidator),
    })
  ),
  revision: v.object({
    number: v.number(),
    supersededByCostDocumentId: v.optional(v.id("costDocuments")),
    supersedesCostDocumentId: v.optional(v.id("costDocuments")),
  }),
  state: v.literal("submitted"),
  submittedAt: v.number(),
  supportingContextDisclosure: v.string(),
  title: v.string(),
  vendor: costDocumentVendorProjectionValidator,
  uploaderScope: v.union(v.literal("self"), v.literal("other")),
  vendorName: v.string(),
});

export const costDocumentVendorHistorySummaryValidator = v.object({
  _id: v.id("costDocuments"),
  buildId: v.id("activeBuilds"),
  buildName: v.string(),
  category: costDocumentCategoryValidator,
  currency: v.literal("CAD"),
  documentDate: v.string(),
  grossTotalCents: v.number(),
  kind: costDocumentKindValidator,
  state: v.literal("submitted"),
  submittedAt: v.number(),
  title: v.string(),
  vendor: costDocumentVendorProjectionValidator,
  vendorName: v.string(),
});

export const costDocumentDuplicateAssessmentValidator = v.object({
  exactDuplicateCostDocumentId: v.optional(v.id("costDocuments")),
  likelyDuplicateCostDocumentIds: v.array(v.id("costDocuments")),
  requiresOverride: v.boolean(),
  sourceHashDigest: v.string(),
});

export const costDocumentDraftPageProjectionValidator = v.object({
  assetId: v.id("buildCollaborationAssets"),
  contentHashSha256: v.optional(v.string()),
  fileName: v.optional(v.string()),
  mimeType: v.optional(v.string()),
  order: v.number(),
  priorAssetId: v.optional(v.id("buildCollaborationAssets")),
  replacedAt: v.optional(v.number()),
});

export const costDocumentDraftCapabilitiesValidator = v.object({
  canDiscardBatch: v.boolean(),
  canEditDraft: v.boolean(),
  canManageDraftCollaboration: v.boolean(),
  canManageSourcePages: v.boolean(),
  canReadDraft: v.boolean(),
  canSubmitBatch: v.boolean(),
});

export const costDocumentDraftProjectionValidator = v.object({
  _id: v.id("costDocumentDrafts"),
  activeStep: costDocumentDraftStepValidator,
  allocations: v.array(costDocumentAllocationProjectionValidator),
  batchId: v.id("costDocumentBatches"),
  capabilities: costDocumentDraftCapabilitiesValidator,
  category: costDocumentCategoryValidator,
  collaboration: v.object({
    currentCollaborators: v.array(
      v.object({
        grantedAt: v.number(),
        workosUserId: v.string(),
      })
    ),
    eligibleCollaborators: v.array(
      v.object({
        displayName: v.string(),
        role: v.union(v.literal("builder"), v.literal("builder-staff")),
        workosUserId: v.string(),
      })
    ),
  }),
  completedAt: v.optional(v.number()),
  creator: v.object({ workosUserId: v.string() }),
  currency: v.literal("CAD"),
  description: v.optional(v.string()),
  documentDate: v.optional(v.string()),
  financialComponents: v.array(
    costDocumentFinancialComponentProjectionValidator
  ),
  grossTotalCents: v.optional(v.number()),
  kind: costDocumentKindValidator,
  lifecycle: v.union(
    v.literal("draft"),
    v.literal("complete"),
    v.literal("submitted")
  ),
  order: v.number(),
  pages: v.array(costDocumentDraftPageProjectionValidator),
  revision: v.number(),
  self: v.object({ workosUserId: v.string() }),
  submittedCostDocumentId: v.optional(v.id("costDocuments")),
  title: v.optional(v.string()),
  vendorProfileId: v.optional(v.id("contractorProfiles")),
  vendorName: v.optional(v.string()),
  workingStateJson: v.optional(v.string()),
});

export const collaborativeCostDocumentDraftProjectionValidator = v.object({
  _id: v.id("costDocumentDrafts"),
  activeStep: costDocumentDraftStepValidator,
  allocations: v.array(costDocumentAllocationProjectionValidator),
  capabilities: costDocumentDraftCapabilitiesValidator,
  category: costDocumentCategoryValidator,
  completedAt: v.optional(v.number()),
  creator: v.object({ workosUserId: v.string() }),
  currency: v.literal("CAD"),
  description: v.optional(v.string()),
  documentDate: v.optional(v.string()),
  financialComponents: v.array(
    costDocumentFinancialComponentProjectionValidator
  ),
  grossTotalCents: v.optional(v.number()),
  kind: costDocumentKindValidator,
  lifecycle: v.union(
    v.literal("draft"),
    v.literal("complete"),
    v.literal("submitted")
  ),
  pages: v.array(costDocumentDraftPageProjectionValidator),
  revision: v.number(),
  self: v.object({ workosUserId: v.string() }),
  title: v.optional(v.string()),
  vendorProfileId: v.optional(v.id("contractorProfiles")),
  vendorName: v.optional(v.string()),
  workingStateJson: v.optional(v.string()),
});

export const costDocumentBatchProjectionValidator = v.object({
  _id: v.id("costDocumentBatches"),
  drafts: v.array(costDocumentDraftProjectionValidator),
  idempotencyKey: v.optional(v.string()),
  revision: v.number(),
  state: v.union(
    v.literal("active"),
    v.literal("submitted"),
    v.literal("abandoned")
  ),
  submittedAt: v.optional(v.number()),
  supportingContextDisclosure: v.string(),
});

export const activeBuildScopeFields = {
  actorCapacity: v.optional(buildCollaborationRoleValidator),
  buildId: v.id("activeBuilds"),
  organizationId: v.string(),
};

export const costDocumentActorCapacityFields = {
  actorCapacity: v.optional(buildCollaborationRoleValidator),
};

export function isCurrentCostDocument(document: Doc<"costDocuments">) {
  return (
    document.voidedAt === undefined &&
    document.supersededByCostDocumentId === undefined
  );
}

export async function sha256Text(value: string) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value)
  );
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0")
  ).join("");
}


export function requiredText(value: string, label: string, maxLength: number) {
  const normalized = value.trim();
  if (!normalized) {
    throw new Error(`${label} is required.`);
  }
  if (normalized.length > maxLength) {
    throw new Error(`${label} must be at most ${maxLength} characters.`);
  }
  return normalized;
}

export function optionalText(
  value: string | undefined,
  label: string,
  maxLength: number
) {
  if (value === undefined) {
    return;
  }
  const normalized = value.trim();
  if (normalized.length > maxLength) {
    throw new Error(`${label} must be at most ${maxLength} characters.`);
  }
  return normalized || undefined;
}

export function requiredDocumentDate(value: string) {
  const normalized = value.trim();
  const match = DATE_PATTERN.exec(normalized);
  if (!match) {
    throw new Error("Document date must be a valid YYYY-MM-DD date.");
  }
  const year = Number(match.at(1));
  const month = Number(match.at(2));
  const day = Number(match.at(3));
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  ) {
    throw new Error("Document date must be a valid YYYY-MM-DD date.");
  }
  return normalized;
}

export function positiveCents(value: number, label: string) {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${label} must be a positive integer number of cents.`);
  }
  return value;
}

export function nonNegativeCents(value: number, label: string) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${label} must be a non-negative integer number of cents.`);
  }
  return value;
}

export function optionalDraftText(value: string, label: string, maxLength: number) {
  const normalized = value.trim();
  if (normalized.length > maxLength) {
    throw new Error(`${label} must be at most ${maxLength} characters.`);
  }
  return normalized || undefined;
}

export function stepIndex(step: (typeof COST_DOCUMENT_DRAFT_STEPS)[number]) {
  const index = COST_DOCUMENT_DRAFT_STEPS.indexOf(step);
  if (index < 0) {
    throw new Error("The Cost Document draft step is invalid.");
  }
  return index;
}

export function optionalIdempotencyKey(value: string | undefined) {
  if (value === undefined) {
    return;
  }
  return requiredIdempotencyKey(value);
}

export function requiredIdempotencyKey(value: string) {
  const normalized = value.trim();
  if (!normalized || normalized.length > 240) {
    throw new Error("A Cost Document batch idempotency key is required.");
  }
  return normalized;
}

export function requiredAssetHash(asset: Doc<"buildCollaborationAssets">) {
  if (!asset.contentHashSha256) {
    throw new Error(
      "Every Cost Document source page requires a verified hash."
    );
  }
  return asset.contentHashSha256;
}
