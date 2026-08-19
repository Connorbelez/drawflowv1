import {
  type PaginationOptions,
  paginationOptsValidator,
  paginationResultValidator,
} from "convex/server";
import { v } from "convex/values";

import type { ActiveBuildAuthorization } from "./activeBuildAccess";
import {
  administrativeOverrideInputFields,
  appendGovernedAuditEvent,
  authorizeAdministrativeRecovery,
} from "./administrative_override_policy";
import {
  type AuthorizedViewer,
  authenticatedMutation,
  authenticatedQuery,
  backofficeQuery,
} from "./authz";
import { isCleanCollaborationAsset } from "./build_collaboration_asset_access";
import { abandonUnpublishedCostDocumentDraftAsset } from "./build_collaboration_assets";
import { buildCollaborationRoleValidator } from "./build_collaboration_validators";
import { normalizeContractorEmail } from "./contractorWorkspace";
import {
  assertCurrentCostDocumentAllocationScope,
  assertExpectedCostDocumentBatchRevision,
  assertExpectedCostDocumentDraftRevision,
  authorizeCostDocumentIntent,
  type CurrentCostDocumentContractorScope,
  canCreateCostDocumentVendor,
  canManageCostDocumentDraftCollaboration,
  canReadSubmittedCostDocument,
  costDocumentDraftCapabilities,
  currentCostDocumentBatchCreatorCapacity,
  currentCostDocumentBatchRevision,
  currentCostDocumentDraftRevision,
  hasCurrentDraftCollaborationGrant,
  isCostDocumentInScope as isCostDocumentInScopeForAuthorization,
  listCurrentCostDocumentDraftCollaborators,
  listEligibleCostDocumentDraftCollaborators,
  requireCostDocumentBatchCreator,
  requireCostDocumentDraftAccess,
  requireCurrentContractorCostDocumentScope,
  requireEligibleCostDocumentDraftCollaborator,
} from "./cost_document_access";
import { normalizeCostDocumentWorkingStateJson } from "./cost_document_working_state";
import { assertOrganizationRetentionWritable } from "./data_retention";
import { enqueueCommunicationIntent } from "./email_transport";
import type { Doc, Id, MutationCtx, QueryCtx } from "./types";

const SUPPORTING_CONTEXT_DISCLOSURE =
  "This Cost Document does not prove payment, completion, reimbursement eligibility, Draw inclusion, or approval.";
const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const MAX_PAGES = 50;
const MAX_ALLOCATIONS = 100;
const MAX_FINANCIAL_COMPONENTS = 20;
const MAX_BATCH_DRAFTS = 10;
const MAX_BATCH_PAGES = 100;
const MAX_BATCH_ALLOCATIONS = 200;
const MAX_BATCH_FINANCIAL_COMPONENTS = 200;
const MAX_VENDOR_OPTIONS = 100;
const MAX_VENDOR_DUPLICATE_CANDIDATES = 500;
const MAX_ROADMAP_RECONCILIATION_INTEGRITY_EXCEPTIONS = 50;
const COST_DOCUMENT_INTEGRITY_KINDS = [
  "unavailable",
  "quarantined",
  "missing",
  "corrupt",
] as const;
// Submitted Cost Documents are authorization-filtered after their indexed
// candidate lookup. The raw query can return more than `numItems` while a
// reactive page interval is being replayed, so every returned candidate must
// be authorized before we advance its native cursor.
const MAX_SUBMITTED_DOCUMENT_LIST_SCAN = 100;
const COST_DOCUMENT_DRAFT_STEPS = [
  "capture_confirm",
  "balance_allocate",
  "share",
  "freeze",
] as const;

const costDocumentKindValidator = v.union(
  v.literal("invoice"),
  v.literal("receipt")
);
const costDocumentCategoryValidator = v.union(
  v.literal("labour"),
  v.literal("materials")
);
const costDocumentDraftStepValidator = v.union(
  v.literal("capture_confirm"),
  v.literal("balance_allocate"),
  v.literal("share"),
  v.literal("freeze")
);
const costDocumentFinancialComponentKindValidator = v.union(
  v.literal("subtotal"),
  v.literal("tax"),
  v.literal("fee"),
  v.literal("discount")
);
const costDocumentFinancialComponentInputValidator = v.object({
  amountCents: v.number(),
  kind: costDocumentFinancialComponentKindValidator,
  label: v.optional(v.string()),
});

const costDocumentPageProjectionValidator = v.object({
  assetId: v.id("buildCollaborationAssets"),
  contentHashSha256: v.string(),
  fileName: v.string(),
  mimeType: v.string(),
  order: v.number(),
});

const costDocumentAllocationProjectionValidator = v.object({
  amountCents: v.number(),
  buildSubmilestoneId: v.id("buildSubmilestones"),
  order: v.number(),
  submilestoneKey: v.string(),
  submilestoneName: v.string(),
});

const costDocumentFinancialComponentProjectionValidator = v.object({
  amountCents: v.number(),
  kind: costDocumentFinancialComponentKindValidator,
  label: v.optional(v.string()),
  order: v.number(),
});

const costDocumentActivityProjectionValidator = v.object({
  createdAt: v.number(),
  eventType: v.string(),
});

const costDocumentReviewTypeValidator = v.union(
  v.literal("builder"),
  v.literal("brokerage")
);
const costDocumentReviewOutcomeValidator = v.union(
  v.literal("accepted"),
  v.literal("needs_correction")
);
const costDocumentReviewProjectionValidator = v.object({
  annotation: v.string(),
  createdAt: v.number(),
  outcome: costDocumentReviewOutcomeValidator,
  revision: v.number(),
});
const costDocumentIntegrityKindValidator = v.union(
  v.literal("unavailable"),
  v.literal("quarantined"),
  v.literal("missing"),
  v.literal("corrupt")
);
const costDocumentLifecycleStateValidator = v.union(
  v.literal("current"),
  v.literal("superseded"),
  v.literal("voided")
);
const costDocumentReviewAttentionValidator = v.union(
  v.literal("unreviewed"),
  v.literal("partially_reviewed"),
  v.literal("reviewed"),
  v.literal("needs_correction")
);
const costDocumentVendorPartyTypeValidator = v.union(
  v.literal("contractor"),
  v.literal("supplier"),
  v.literal("vendor")
);
const costDocumentVendorResolutionValidator = v.union(
  v.literal("linked"),
  v.literal("unresolved_legacy")
);
const costDocumentVendorProjectionValidator = v.object({
  displayName: v.string(),
  partyType: costDocumentVendorPartyTypeValidator,
  profileId: v.optional(v.id("contractorProfiles")),
  resolution: costDocumentVendorResolutionValidator,
});
const costDocumentVendorOptionValidator = v.object({
  city: v.optional(v.string()),
  email: v.optional(v.string()),
  name: v.string(),
  partyType: costDocumentVendorPartyTypeValidator,
  profileId: v.id("contractorProfiles"),
});
const costDocumentVendorCreateAccessValidator = v.object({
  canCreate: v.boolean(),
});
const costDocumentVendorCreationResultValidator = v.object({
  created: v.boolean(),
  duplicateOptions: v.array(costDocumentVendorOptionValidator),
  option: v.optional(costDocumentVendorOptionValidator),
});
const costDocumentIntegrityExceptionProjectionValidator = v.object({
  actionRequired: v.boolean(),
  assetId: v.id("buildCollaborationAssets"),
  createdAt: v.number(),
  kind: costDocumentIntegrityKindValidator,
  pageId: v.id("costDocumentPages"),
});

const costDocumentSummaryValidator = v.object({
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

const costDocumentRoadmapReconciliationSummaryValidator = v.object({
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

const costDocumentCapabilitiesValidator = v.object({
  canRecordBrokerageReview: v.boolean(),
  canRecordBuilderReview: v.boolean(),
  canStartCorrection: v.boolean(),
  canVoid: v.boolean(),
});

const costDocumentProjectionValidator = v.object({
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

const costDocumentVendorHistorySummaryValidator = v.object({
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

const costDocumentDuplicateAssessmentValidator = v.object({
  exactDuplicateCostDocumentId: v.optional(v.id("costDocuments")),
  likelyDuplicateCostDocumentIds: v.array(v.id("costDocuments")),
  requiresOverride: v.boolean(),
  sourceHashDigest: v.string(),
});

const costDocumentDraftPageProjectionValidator = v.object({
  assetId: v.id("buildCollaborationAssets"),
  contentHashSha256: v.optional(v.string()),
  fileName: v.optional(v.string()),
  mimeType: v.optional(v.string()),
  order: v.number(),
  priorAssetId: v.optional(v.id("buildCollaborationAssets")),
  replacedAt: v.optional(v.number()),
});

const costDocumentDraftCapabilitiesValidator = v.object({
  canDiscardBatch: v.boolean(),
  canEditDraft: v.boolean(),
  canManageDraftCollaboration: v.boolean(),
  canManageSourcePages: v.boolean(),
  canReadDraft: v.boolean(),
  canSubmitBatch: v.boolean(),
});

const costDocumentDraftProjectionValidator = v.object({
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

const collaborativeCostDocumentDraftProjectionValidator = v.object({
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

const costDocumentBatchProjectionValidator = v.object({
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

const activeBuildScopeFields = {
  actorCapacity: v.optional(buildCollaborationRoleValidator),
  buildId: v.id("activeBuilds"),
  organizationId: v.string(),
};

const costDocumentActorCapacityFields = {
  actorCapacity: v.optional(buildCollaborationRoleValidator),
};

export const submitCostDocument = authenticatedMutation
  .input({
    ...activeBuildScopeFields,
    allocations: v.array(
      v.object({
        amountCents: v.number(),
        buildSubmilestoneId: v.id("buildSubmilestones"),
      })
    ),
    category: costDocumentCategoryValidator,
    currency: v.literal("CAD"),
    description: v.optional(v.string()),
    documentDate: v.string(),
    grossTotalCents: v.number(),
    kind: costDocumentKindValidator,
    pageAssetIds: v.array(v.id("buildCollaborationAssets")),
    title: v.string(),
    vendorProfileId: v.optional(v.id("contractorProfiles")),
    vendorName: v.string(),
  })
  .returns(v.id("costDocuments"))
  .handler(() => {
    // Direct immutable insertion cannot prove batch ownership, exact-Draft
    // collaboration, or optimistic concurrency. Retain the legacy symbol only
    // to fail closed for stale clients while every supported submission flows
    // through submitCostDocumentBatch.
    throw new Error(
      "Direct Cost Document submission is unavailable. Create or resume a Cost Document batch."
    );
  })
  .public();

/**
 * Narrow allocation-option projection for role-specific Cost capture routes.
 * Homeowner and Contractor workspaces must not load the much broader Builder /
 * Backoffice Build-detail projection merely to resolve authorized roadmap
 * targets.
 */
export const listCostDocumentSubmilestoneOptions = authenticatedQuery
  .input(activeBuildScopeFields)
  .returns(
    v.array(
      v.object({
        id: v.id("buildSubmilestones"),
        label: v.string(),
        milestoneKey: v.string(),
        milestoneName: v.string(),
        milestoneOrder: v.number(),
        milestoneBudgetCents: v.number(),
        milestoneActualCostCents: v.number(),
        milestoneStatus: v.union(
          v.literal("planned"),
          v.literal("in_progress"),
          v.literal("complete")
        ),
        milestoneDayStart: v.number(),
        milestoneDayEnd: v.number(),
        budgetCents: v.optional(v.number()),
        actualCostCents: v.optional(v.number()),
      })
    )
  )
  .handler(async (ctx, args) => {
    const authorization = await authorizeCostDocumentIntent(ctx, {
      ...args,
      intent: "create",
    });
    const [rows, milestones] = await Promise.all([
      ctx.db
        .query("buildSubmilestones")
        .withIndex("by_build", (query) =>
          query.eq("buildId", authorization.build._id)
        )
        .take(501),
      ctx.db
        .query("buildMilestones")
        .withIndex("by_build", (query) =>
          query.eq("buildId", authorization.build._id)
        )
        .take(501),
    ]);
    if (rows.length > 500) {
      throw new Error("Cost Document allocation options are unavailable.");
    }
    if (milestones.length > 500) {
      throw new Error("Cost Document allocation options are unavailable.");
    }
    if (
      rows.some(
        (row) =>
          row.organizationId !== authorization.organizationId ||
          row.brokerageId !== authorization.brokerage._id ||
          row.buildId !== authorization.build._id
      )
    ) {
      throw new Error("Cost Document allocation options are unavailable.");
    }
    if (
      milestones.some(
        (milestone) =>
          milestone.organizationId !== authorization.organizationId ||
          milestone.brokerageId !== authorization.brokerage._id ||
          milestone.buildId !== authorization.build._id
      )
    ) {
      throw new Error("Cost Document allocation options are unavailable.");
    }
    const milestoneById = new Map(
      milestones.map((milestone) => [String(milestone._id), milestone])
    );
    const rowsWithMilestones = rows.map((row) => {
      const milestone = milestoneById.get(String(row.buildMilestoneId));
      if (!milestone || milestone.key !== row.milestoneKey) {
        throw new Error("Cost Document allocation options are unavailable.");
      }
      return { milestone, row };
    });
    let allowedIds: Set<string> | undefined;
    if (authorization.effectiveRole.role === "contractor") {
      const contractorScope = await requireCurrentContractorCostDocumentScope(
        ctx,
        {
          authorization,
          purpose: "draft.write",
          workosUserId: authorization.viewer.subject,
        }
      );
      allowedIds = new Set(
        contractorScope.qualifyingSubmilestoneIds.map(String)
      );
    }
    const rowsForProjection = rowsWithMilestones.filter(
      ({ row }) => !allowedIds || allowedIds.has(String(row._id))
    );
    const milestoneActualCostByKey = new Map<string, number>();
    for (const { row } of rowsForProjection) {
      milestoneActualCostByKey.set(
        row.milestoneKey,
        (milestoneActualCostByKey.get(row.milestoneKey) ?? 0) +
          Math.max(0, row.actualCostCents ?? 0)
      );
    }
    return rowsForProjection
      .sort(
        (left, right) =>
          left.milestone.order - right.milestone.order ||
          left.row.order - right.row.order ||
          left.row.name.localeCompare(right.row.name)
      )
      .map(({ milestone, row }) => ({
        ...(row.actualCostCents === undefined
          ? {}
          : { actualCostCents: row.actualCostCents }),
        ...(row.budgetCents === undefined
          ? {}
          : { budgetCents: row.budgetCents }),
        id: row._id,
        label: `${milestone.name} · ${row.name}`,
        milestoneActualCostCents:
          milestoneActualCostByKey.get(row.milestoneKey) ?? 0,
        milestoneBudgetCents: milestone.budgetCents,
        milestoneDayEnd: milestone.dayEnd,
        milestoneDayStart: milestone.dayStart,
        milestoneKey: milestone.key,
        milestoneName: milestone.name,
        milestoneOrder: milestone.order,
        milestoneStatus: milestone.status,
      }));
  })
  .public();

/**
 * Organization-scoped party options for Cost Document capture. The Build
 * authorization still gates the route, while the profile lookup stays on the
 * canonical brokerage identity table used by quote recipients and Contractor
 * Workspace assignments.
 */
export const listCostDocumentVendorOptions = authenticatedQuery
  .input({
    ...activeBuildScopeFields,
    search: v.optional(v.string()),
  })
  .returns(v.array(costDocumentVendorOptionValidator))
  .handler(async (ctx, args) => {
    const authorization = await authorizeCostDocumentBuilder(ctx, args);
    const normalizedSearch = args.search?.trim().toLocaleLowerCase("en-CA");
    const profiles = await listCostDocumentVendorProfiles(ctx, authorization);
    return profiles
      .filter(
        (profile) =>
          !normalizedSearch ||
          [profile.name, profile.email, profile.city, ...profile.trades]
            .filter(Boolean)
            .join(" ")
            .toLocaleLowerCase("en-CA")
            .includes(normalizedSearch)
      )
      .slice(0, MAX_VENDOR_OPTIONS)
      .map(costDocumentVendorOptionForProfile);
  })
  .public();

export const getCostDocumentVendorCreateAccess = authenticatedQuery
  .input(activeBuildScopeFields)
  .returns(costDocumentVendorCreateAccessValidator)
  .handler(async (ctx, args) => {
    const authorization = await authorizeCostDocumentVendorAccess(ctx, args);
    return { canCreate: canCreateCostDocumentVendor(authorization) };
  })
  .public();

/**
 * Creates a canonical organization party from the Capture & confirm picker.
 * Duplicate candidates are returned before insertion so the UI can keep the
 * current draft open and let the uploader link existing history instead.
 */
export const createCostDocumentVendorProfile = authenticatedMutation
  .input({
    ...activeBuildScopeFields,
    allowDuplicate: v.optional(v.boolean()),
    city: v.optional(v.string()),
    email: v.optional(v.string()),
    name: v.string(),
    partyType: costDocumentVendorPartyTypeValidator,
    phone: v.optional(v.string()),
  })
  .returns(costDocumentVendorCreationResultValidator)
  .handler(async (ctx, args) => {
    const accessAuthorization = await authorizeCostDocumentVendorAccess(
      ctx,
      args
    );
    if (!canCreateCostDocumentVendor(accessAuthorization)) {
      throw new Error(
        "You do not have permission to create a party from Cost Document capture."
      );
    }
    const authorization = await authorizeCostDocumentBuilder(ctx, args);

    const name = requiredText(args.name, "Party name", 160);
    const email = optionalText(args.email, "Email", 320);
    const normalizedEmail = normalizeContractorEmail(email);
    if (email && !normalizedEmail) {
      throw new Error("Enter a valid email address or leave it blank.");
    }
    const city = optionalText(args.city, "City", 120);
    const phone = optionalText(args.phone, "Phone", 80);
    const duplicateCandidates = await listCostDocumentVendorDuplicateCandidates(
      ctx,
      authorization
    );
    const existingEmailProfile = normalizedEmail
      ? (await findCostDocumentVendorProfileByNormalizedEmail(
          ctx,
          authorization,
          normalizedEmail
        )) ??
        duplicateCandidates.find(
          (profile) =>
            normalizeContractorEmail(profile.email) === normalizedEmail
        )
      : undefined;
    if (existingEmailProfile) {
      return {
        created: false,
        duplicateOptions: [],
        option: costDocumentVendorOptionForProfile(existingEmailProfile),
      };
    }
    const duplicateOptions = duplicateCandidates
      .filter((profile) =>
        isPotentialCostDocumentVendorDuplicate(profile.name, name)
      )
      .slice(0, 5)
      .map(costDocumentVendorOptionForProfile);
    if (duplicateOptions.length > 0 && !args.allowDuplicate) {
      return {
        created: false,
        duplicateOptions,
      };
    }

    const now = Date.now();
    const profileId = await ctx.db.insert("contractorProfiles", {
      brokerageId: authorization.brokerage._id,
      city,
      costDocumentPartyType: args.partyType,
      createdAt: now,
      email,
      kind: "company",
      name,
      normalizedEmail: normalizedEmail || undefined,
      onboardingStatus: "profile_only",
      organizationId: authorization.organizationId,
      quoteRecipientCapabilities:
        args.partyType === "vendor" ? [] : [args.partyType],
      source:
        authorization.effectiveRole.role === "admin" ||
        authorization.effectiveRole.role === "principle-broker"
          ? "backoffice_created"
          : "builder_created",
      status: "active",
      phone,
      trades: [],
      updatedAt: now,
    });
    const profile = await ctx.db.get(profileId);
    if (!profile) {
      throw new Error("The new Cost Document party could not be loaded.");
    }
    return {
      created: true,
      duplicateOptions: [],
      option: costDocumentVendorOptionForProfile(profile),
    };
  })
  .public();

export const getCostDocument = authenticatedQuery
  .input({
    ...activeBuildScopeFields,
    // Route/search state is untrusted. Accept the serialized value here and
    // normalize it against the exact table before any document read so a
    // malformed or wrong-table ID cannot fail the entire reactive ledger.
    costDocumentId: v.string(),
  })
  .returns(v.union(costDocumentProjectionValidator, v.null()))
  .handler(async (ctx, args) => {
    const authorization = await authorizeCostDocumentIntent(ctx, {
      ...args,
      intent: "submitted.read",
    });
    const costDocumentId = ctx.db.normalizeId(
      "costDocuments",
      args.costDocumentId
    );
    if (!costDocumentId) {
      return null;
    }
    const document = await ctx.db.get(costDocumentId);
    if (
      !(
        isCostDocumentInScopeForAuthorization(document, authorization) &&
        (await canReadSubmittedCostDocument(ctx, authorization, document))
      )
    ) {
      return null;
    }
    return await projectCostDocument(ctx, authorization, document);
  })
  .public();

export const getCostDocumentDuplicateAssessment = authenticatedQuery
  .input({
    ...costDocumentActorCapacityFields,
    draftId: v.id("costDocumentDrafts"),
  })
  .returns(costDocumentDuplicateAssessmentValidator)
  .handler(async (ctx, args) => {
    const { authorization, draft } = await requireCostDocumentDraftAccess(ctx, {
      actorCapacity: args.actorCapacity,
      draftId: args.draftId,
      intent: "draft.read",
    });
    const assessment = await assessCostDocumentDuplicates(
      ctx,
      authorization,
      draft
    );
    return {
      exactDuplicateCostDocumentId: assessment.exactDuplicateCostDocumentId,
      likelyDuplicateCostDocumentIds: assessment.likelyDuplicateCostDocumentIds,
      requiresOverride: assessment.requiresOverride,
      sourceHashDigest: assessment.sourceHashDigest,
    };
  })
  .public();

export const listCostDocuments = authenticatedQuery
  .input({
    ...activeBuildScopeFields,
    paginationOpts: paginationOptsValidator,
  })
  .returns(paginationResultValidator(costDocumentSummaryValidator))
  .handler(async (ctx, args) => {
    const authorization = await authorizeCostDocumentIntent(ctx, {
      ...args,
      intent: "submitted.list",
    });
    const contractorSubmittedReadScope =
      await resolveContractorSubmittedReadScope(ctx, authorization);
    if (contractorSubmittedReadScope === null) {
      // The public list is non-enumerating. A Contractor with no current or
      // normally completed scope has no authorized submitted-record result
      // set, even when raw indexed rows still exist.
      return { continueCursor: "", isDone: true, page: [] };
    }
    return await listAuthorizedCostDocumentPage(ctx, {
      authorization,
      contractorSubmittedReadScope,
      paginationOpts: args.paginationOpts,
      project: (document) => projectCostDocumentSummary(ctx, document),
    });
  })
  .public();

/**
 * A bounded, Build-scoped ledger projection for the canonical Build Workspace
 * Costs tab. Unlike the compact submitted-record list, this deliberately
 * retains superseded and voided documents so reconciliation remains auditable.
 * It does not alter payment, completion, reimbursement, Draw, or approval
 * state; Cost Documents remain supporting context only.
 */
export const listCostDocumentRoadmapReconciliation = authenticatedQuery
  .input({
    ...activeBuildScopeFields,
    paginationOpts: paginationOptsValidator,
  })
  .returns(
    paginationResultValidator(costDocumentRoadmapReconciliationSummaryValidator)
  )
  .handler(async (ctx, args) => {
    const authorization = await authorizeCostDocumentIntent(ctx, {
      ...args,
      intent: "submitted.list",
    });
    const contractorSubmittedReadScope =
      await resolveContractorSubmittedReadScope(ctx, authorization);
    if (contractorSubmittedReadScope === null) {
      return { continueCursor: "", isDone: true, page: [] };
    }
    return await listAuthorizedCostDocumentPage(ctx, {
      authorization,
      contractorSubmittedReadScope,
      includeLifecycleHistory: true,
      // Keep the worst-case projection comfortably below Convex's 4,096
      // document-read transaction ceiling. The client drains every bounded
      // page before presenting totals, search results, or empty states.
      maxRequestedCount: 5,
      paginationOpts: args.paginationOpts,
      project: (document) =>
        projectCostDocumentRoadmapReconciliationSummary(
          ctx,
          authorization,
          document
        ),
    });
  })
  .public();

/**
 * Backoffice vendor history across every Build in one WorkOS organization.
 * This query intentionally uses the durable profile foreign key and never
 * reconstructs identity from the denormalized vendor snapshot.
 */
export const listCostDocumentsByVendor = backofficeQuery
  .input({
    organizationId: v.string(),
    paginationOpts: paginationOptsValidator,
    vendorProfileId: v.id("contractorProfiles"),
  })
  .returns(paginationResultValidator(costDocumentVendorHistorySummaryValidator))
  .handler(async (ctx, args) => {
    const scope = await resolveCostDocumentVendorHistoryScope(
      ctx,
      args.organizationId
    );
    const profile = await ctx.db.get(args.vendorProfileId);
    if (
      !profile ||
      profile.organizationId !== args.organizationId.trim() ||
      profile.brokerageId !== scope.brokerage._id
    ) {
      throw new Error("Cost Document vendor history is unavailable.");
    }
    const page = await ctx.db
      .query("costDocuments")
      .withIndex(
        "by_organizationId_and_vendorProfileId_and_submittedAt",
        (query) =>
          query
            .eq("organizationId", args.organizationId.trim())
            .eq("vendorProfileId", args.vendorProfileId)
      )
      .order("desc")
      .paginate(args.paginationOpts);
    const projected = [] as Array<{
      _id: Id<"costDocuments">;
      buildId: Id<"activeBuilds">;
      buildName: string;
      category: "labour" | "materials";
      currency: "CAD";
      documentDate: string;
      grossTotalCents: number;
      kind: "invoice" | "receipt";
      state: "submitted";
      submittedAt: number;
      title: string;
      vendor: Awaited<ReturnType<typeof projectCostDocumentVendor>>;
      vendorName: string;
    }>;
    for (const document of page.page) {
      if (
        document.organizationId !== args.organizationId.trim() ||
        document.brokerageId !== scope.brokerage._id ||
        document.vendorProfileId !== args.vendorProfileId ||
        document.state !== "submitted"
      ) {
        throw new Error("Cost Document vendor history is unavailable.");
      }
      const build = await ctx.db.get(document.buildId);
      if (
        !build ||
        build.organizationId !== args.organizationId.trim() ||
        build.brokerageId !== scope.brokerage._id
      ) {
        throw new Error("Cost Document vendor history is unavailable.");
      }
      projected.push({
        _id: document._id,
        buildId: document.buildId,
        buildName: build.buildName,
        category: document.category,
        currency: document.currency,
        documentDate: document.documentDate,
        grossTotalCents: document.grossTotalCents,
        kind: document.kind,
        state: document.state,
        submittedAt: document.submittedAt,
        title: document.title,
        vendor: await projectCostDocumentVendor(ctx, document),
        vendorName: document.vendorName,
      });
    }
    return { ...page, page: projected };
  })
  .public();

async function resolveContractorSubmittedReadScope(
  ctx: QueryCtx,
  authorization: ActiveBuildAuthorization
): Promise<CurrentCostDocumentContractorScope | null | undefined> {
  if (authorization.effectiveRole.role !== "contractor") {
    return;
  }
  try {
    return await requireCurrentContractorCostDocumentScope(ctx, {
      authorization,
      purpose: "submitted.read",
      workosUserId: authorization.viewer.subject,
    });
  } catch {
    return null;
  }
}

async function listCostDocumentVendorProfiles(
  ctx: QueryCtx | MutationCtx,
  authorization: ActiveBuildAuthorization
) {
  return await ctx.db
    .query("contractorProfiles")
    .withIndex(
      "by_organizationId_and_brokerageId_and_status_and_name",
      (query) =>
        query
          .eq("organizationId", authorization.organizationId)
          .eq("brokerageId", authorization.brokerage._id)
          .eq("status", "active")
    )
    .take(MAX_VENDOR_OPTIONS * 3);
}

async function listCostDocumentVendorDuplicateCandidates(
  ctx: QueryCtx | MutationCtx,
  authorization: ActiveBuildAuthorization
) {
  // Name matches are advisory; exact-email matches use the normalized-email
  // index below. Keep this mutation read bounded so a large organization
  // cannot turn inline party creation into an oversized transaction.
  return await ctx.db
    .query("contractorProfiles")
    .withIndex(
      "by_organizationId_and_brokerageId_and_status_and_name",
      (query) =>
        query
          .eq("organizationId", authorization.organizationId)
          .eq("brokerageId", authorization.brokerage._id)
          .eq("status", "active")
    )
    .take(MAX_VENDOR_DUPLICATE_CANDIDATES);
}

async function findCostDocumentVendorProfileByNormalizedEmail(
  ctx: QueryCtx | MutationCtx,
  authorization: ActiveBuildAuthorization,
  normalizedEmail: string
) {
  return await ctx.db
    .query("contractorProfiles")
    .withIndex("by_brokerage_normalized_email", (query) =>
      query
        .eq("brokerageId", authorization.brokerage._id)
        .eq("normalizedEmail", normalizedEmail)
    )
    .filter((query) =>
      query.and(
        query.eq(query.field("organizationId"), authorization.organizationId),
        query.eq(query.field("status"), "active")
      )
    )
    .first();
}

function costDocumentVendorOptionForProfile(
  profile: Doc<"contractorProfiles">
) {
  return {
    ...(profile.city ? { city: profile.city } : {}),
    ...(profile.email ? { email: profile.email } : {}),
    name: profile.name,
    partyType: costDocumentVendorPartyTypeForProfile(profile),
    profileId: profile._id,
  };
}

function costDocumentVendorPartyTypeForProfile(
  profile: Doc<"contractorProfiles">
) {
  if (profile.costDocumentPartyType) {
    return profile.costDocumentPartyType;
  }
  const capabilities = profile.quoteRecipientCapabilities;
  if (
    capabilities?.includes("supplier") &&
    !capabilities.includes("contractor")
  ) {
    return "supplier" as const;
  }
  if (!capabilities || capabilities.includes("contractor")) {
    return "contractor" as const;
  }
  return "vendor" as const;
}

function isPotentialCostDocumentVendorDuplicate(left: string, right: string) {
  const leftKey = normalizeCostDocumentVendorNameForMatch(left);
  const rightKey = normalizeCostDocumentVendorNameForMatch(right);
  if (!(leftKey && rightKey)) {
    return false;
  }
  if (
    leftKey === rightKey ||
    leftKey.includes(rightKey) ||
    rightKey.includes(leftKey)
  ) {
    return true;
  }
  const leftTokens = new Set(leftKey.split(" "));
  const rightTokens = new Set(rightKey.split(" "));
  const overlap = [...leftTokens].filter((token) => rightTokens.has(token));
  return (
    overlap.length >= 2 &&
    overlap.length / Math.min(leftTokens.size, rightTokens.size) >= 0.5
  );
}

function normalizeCostDocumentVendorNameForMatch(value: string) {
  return value
    .trim()
    .toLocaleLowerCase("en-CA")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

async function projectCostDocumentVendor(
  ctx: QueryCtx,
  document: Doc<"costDocuments">
) {
  if (document.vendorProfileId) {
    const profile = await ctx.db.get(document.vendorProfileId);
    if (
      profile &&
      profile.organizationId === document.organizationId &&
      profile.brokerageId === document.brokerageId
    ) {
      return {
        displayName: profile.name,
        partyType: costDocumentVendorPartyTypeForProfile(profile),
        profileId: profile._id,
        resolution: "linked" as const,
      };
    }
  }
  return {
    displayName: document.vendorName,
    partyType: "vendor" as const,
    resolution: "unresolved_legacy" as const,
  };
}

async function requireActiveCostDocumentVendorProfile(
  ctx: QueryCtx | MutationCtx,
  authorization: ActiveBuildAuthorization,
  profileId: Id<"contractorProfiles">
) {
  const profile = await ctx.db.get(profileId);
  if (
    !profile ||
    profile.organizationId !== authorization.organizationId ||
    profile.brokerageId !== authorization.brokerage._id ||
    profile.status !== "active"
  ) {
    throw new Error(
      "Select an active organization vendor, supplier, or contractor."
    );
  }
  return profile;
}

async function resolveCostDocumentVendorHistoryScope(
  ctx: QueryCtx & { viewer: AuthorizedViewer },
  organizationId: string
) {
  const normalizedOrganizationId = organizationId.trim();
  if (!normalizedOrganizationId) {
    throw new Error("Cost Document vendor history is unavailable.");
  }
  const membership = await ctx.db
    .query("workosOrganizationMemberships")
    .withIndex("by_user", (query) =>
      query.eq("workosUserId", ctx.viewer.subject)
    )
    .filter((query) =>
      query.eq(query.field("workosOrganizationId"), normalizedOrganizationId)
    )
    .first();
  if (!membership || membership.status !== "active") {
    throw new Error("Cost Document vendor history is unavailable.");
  }
  const brokerage = await ctx.db
    .query("brokerages")
    .withIndex("by_workos_organization", (query) =>
      query.eq("workosOrganizationId", normalizedOrganizationId)
    )
    .unique();
  if (!brokerage || brokerage.status !== "active") {
    throw new Error("Cost Document vendor history is unavailable.");
  }
  return { brokerage };
}

async function listAuthorizedCostDocumentPage<T>(
  ctx: QueryCtx,
  input: {
    authorization: ActiveBuildAuthorization;
    contractorSubmittedReadScope?: CurrentCostDocumentContractorScope;
    includeLifecycleHistory?: boolean;
    maxRequestedCount?: number;
    paginationOpts: PaginationOptions;
    project: (document: Doc<"costDocuments">) => Promise<T> | T;
  }
) {
  const requestedCount = Math.min(
    input.maxRequestedCount ?? 50,
    Math.max(1, input.paginationOpts.numItems)
  );
  // Convex permits exactly one `.paginate()` call in a query execution. Read
  // one native interval, authorize every row in memory, and forward its native
  // cursor and split metadata unchanged. Authorization can make a page sparse
  // or empty; clients must continue draining until the native page is done.
  const rawPage = await loadRawCostDocumentPage(ctx, {
    authorization: input.authorization,
    paginationOpts: {
      ...input.paginationOpts,
      numItems: requestedCount,
    },
  });
  const readable = await listReadableCostDocuments(ctx, {
    authorization: input.authorization,
    contractorSubmittedReadScope: input.contractorSubmittedReadScope,
    documents: rawPage.page,
    includeLifecycleHistory: input.includeLifecycleHistory,
  });
  return {
    ...rawPage,
    page: await Promise.all(readable.map(input.project)),
  };
}

async function loadRawCostDocumentPage(
  ctx: QueryCtx,
  input: {
    authorization: ActiveBuildAuthorization;
    paginationOpts: PaginationOptions;
  }
) {
  const contractorOnly =
    input.authorization.effectiveRole.role === "contractor";
  if (contractorOnly) {
    return await ctx.db
      .query("costDocuments")
      .withIndex(
        "by_buildId_and_uploaderWorkosUserId_and_submittedAt",
        (query) =>
          query
            .eq("buildId", input.authorization.build._id)
            .eq("uploaderWorkosUserId", input.authorization.viewer.subject)
      )
      .order("desc")
      .paginate(input.paginationOpts);
  }
  return await ctx.db
    .query("costDocuments")
    .withIndex("by_buildId_and_submittedAt", (query) =>
      query.eq("buildId", input.authorization.build._id)
    )
    .order("desc")
    .paginate(input.paginationOpts);
}

async function listReadableCostDocuments(
  ctx: QueryCtx,
  input: {
    authorization: ActiveBuildAuthorization;
    contractorSubmittedReadScope?: CurrentCostDocumentContractorScope;
    documents: Doc<"costDocuments">[];
    includeLifecycleHistory?: boolean;
  }
) {
  const readable = await Promise.all(
    input.documents.map((document) =>
      input.includeLifecycleHistory ||
      (document.voidedAt === undefined &&
        document.supersededByCostDocumentId === undefined)
        ? canReadSubmittedCostDocument(
            ctx,
            input.authorization,
            document,
            input.contractorSubmittedReadScope
          )
        : Promise.resolve(false)
    )
  );
  return input.documents.filter((_, index) => readable[index]);
}

async function projectCostDocumentSummary(
  ctx: QueryCtx,
  document: Doc<"costDocuments">
) {
  return {
    _id: document._id,
    category: document.category,
    currency: document.currency,
    grossTotalCents: document.grossTotalCents,
    kind: document.kind,
    state: document.state,
    submittedAt: document.submittedAt,
    title: document.title,
    vendor: await projectCostDocumentVendor(ctx, document),
    vendorName: document.vendorName,
  };
}

async function listCurrentOpenCostDocumentIntegrityExceptions(
  ctx: QueryCtx,
  document: Doc<"costDocuments">,
  pages: Doc<"costDocumentPages">[]
) {
  if (pages.length < 1 || pages.length > MAX_PAGES) {
    throwCostDocumentProjectionGraphUnavailable();
  }
  const latestByPageAndKind = await Promise.all(
    pages.flatMap((page) =>
      COST_DOCUMENT_INTEGRITY_KINDS.map(async (kind) => ({
        exception: await ctx.db
          .query("costDocumentIntegrityExceptions")
          .withIndex("by_costDocumentId_and_pageId_and_kind", (query) =>
            query
              .eq("costDocumentId", document._id)
              .eq("pageId", page._id)
              .eq("kind", kind)
          )
          .order("desc")
          .first(),
        kind,
        page,
      }))
    )
  );
  const openExceptions: Doc<"costDocumentIntegrityExceptions">[] = [];
  for (const { exception, kind, page } of latestByPageAndKind) {
    if (!exception) {
      continue;
    }
    if (
      exception.organizationId !== document.organizationId ||
      exception.brokerageId !== document.brokerageId ||
      exception.buildId !== document.buildId ||
      exception.costDocumentId !== document._id ||
      exception.pageId !== page._id ||
      exception.assetId !== page.assetId ||
      exception.kind !== kind
    ) {
      throwCostDocumentProjectionGraphUnavailable();
    }
    if (exception.resolvedAt === undefined) {
      openExceptions.push(exception);
    }
  }
  return openExceptions;
}

async function projectCostDocumentRoadmapReconciliationSummary(
  ctx: QueryCtx,
  authorization: ActiveBuildAuthorization,
  document: Doc<"costDocuments">
) {
  const isHomeownerView = authorization.effectiveRole.role === "homeowner";
  const [allocations, builderReview, financialComponents, brokerageReview, pages] =
    await Promise.all([
      ctx.db
        .query("costDocumentAllocations")
        .withIndex("by_costDocumentId_and_order", (query) =>
          query.eq("costDocumentId", document._id)
        )
        .order("asc")
        .take(MAX_ALLOCATIONS + 1),
      ctx.db
        .query("costDocumentReviewAnnotations")
        .withIndex("by_costDocumentId_and_reviewType_and_revision", (query) =>
          query.eq("costDocumentId", document._id).eq("reviewType", "builder")
        )
        .order("desc")
        .first(),
      ctx.db
        .query("costDocumentFinancialComponents")
        .withIndex("by_costDocumentId_and_order", (query) =>
          query.eq("costDocumentId", document._id)
        )
        .order("asc")
        .take(MAX_FINANCIAL_COMPONENTS + 1),
      ctx.db
        .query("costDocumentReviewAnnotations")
        .withIndex("by_costDocumentId_and_reviewType_and_revision", (query) =>
          query.eq("costDocumentId", document._id).eq("reviewType", "brokerage")
        )
        .order("desc")
        .first(),
      ctx.db
        .query("costDocumentPages")
        .withIndex("by_costDocumentId_and_order", (query) =>
          query.eq("costDocumentId", document._id)
        )
        .order("asc")
        .take(MAX_PAGES + 1),
    ]);
  const integrityExceptions =
    await listCurrentOpenCostDocumentIntegrityExceptions(ctx, document, pages);
  await assertReadableCostDocumentRoadmapProjectionGraph(ctx, document, {
    allocations,
    brokerageReview,
    builderReview,
    financialComponents,
    integrityExceptions,
  });
  const openIntegrityExceptions = integrityExceptions;
  return {
    _id: document._id,
    allocations: allocations.map((allocation) => ({
      amountCents: allocation.amountCents,
      buildSubmilestoneId: allocation.buildSubmilestoneId,
      order: allocation.order,
      submilestoneKey: allocation.submilestoneKeySnapshot,
      submilestoneName: allocation.submilestoneNameSnapshot,
    })),
    category: document.category,
    currency: document.currency,
    documentDate: document.documentDate,
    duplicateWarning:
      !isHomeownerView && document.duplicateOverrideReason !== undefined,
    financialComponents: financialComponents.map((component) => ({
      amountCents: component.amountCents,
      kind: component.kind,
      label: component.label,
      order: component.order,
    })),
    grossTotalCents: document.grossTotalCents,
    ...(isHomeownerView
      ? {}
      : {
          integrity: {
            healthy: openIntegrityExceptions.length === 0,
            openExceptionKinds: [
              ...new Set(openIntegrityExceptions.map((item) => item.kind)),
            ],
          },
          reviewAttention: costDocumentReviewAttention(
            builderReview,
            brokerageReview
          ),
        }),
    kind: document.kind,
    lifecycle: { state: costDocumentLifecycleState(document) },
    pages: pages.map((page) => ({
      assetId: page.assetId,
      contentHashSha256: page.contentHashSha256Snapshot,
      fileName: page.fileNameSnapshot,
      mimeType: page.mimeTypeSnapshot,
      order: page.order,
    })),
    state: document.state,
    submittedAt: document.submittedAt,
    title: document.title,
    uploaderScope:
      document.uploaderWorkosUserId === authorization.viewer.subject
        ? ("self" as const)
        : ("other" as const),
    vendor: await projectCostDocumentVendor(ctx, document),
    vendorName: document.vendorName,
  };
}

function costDocumentLifecycleState(document: Doc<"costDocuments">) {
  return document.voidedAt
    ? ("voided" as const)
    : document.supersededByCostDocumentId
      ? ("superseded" as const)
      : ("current" as const);
}

function costDocumentReviewAttention(
  builderReview: Doc<"costDocumentReviewAnnotations"> | null,
  brokerageReview: Doc<"costDocumentReviewAnnotations"> | null
) {
  if (
    builderReview?.outcome === "needs_correction" ||
    brokerageReview?.outcome === "needs_correction"
  ) {
    return "needs_correction" as const;
  }
  if (builderReview && brokerageReview) {
    return "reviewed" as const;
  }
  return builderReview || brokerageReview
    ? ("partially_reviewed" as const)
    : ("unreviewed" as const);
}

export const setCostDocumentReviewAnnotation = authenticatedMutation
  .input({
    ...activeBuildScopeFields,
    annotation: v.string(),
    costDocumentId: v.id("costDocuments"),
    outcome: costDocumentReviewOutcomeValidator,
    reviewType: costDocumentReviewTypeValidator,
  })
  .returns(v.object({ revision: v.number() }))
  .handler(async (ctx, args) => {
    const { authorization, document } = await requireReadableCostDocument(
      ctx,
      args
    );
    await assertOrganizationRetentionWritable(
      ctx,
      authorization.organizationId
    );
    assertCostDocumentReviewerRole(authorization, args.reviewType);
    const annotation = requiredText(args.annotation, "Review annotation", 4000);
    const latest = await ctx.db
      .query("costDocumentReviewAnnotations")
      .withIndex("by_costDocumentId_and_reviewType_and_revision", (query) =>
        query
          .eq("costDocumentId", document._id)
          .eq("reviewType", args.reviewType)
      )
      .order("desc")
      .first();
    const revision = (latest?.revision ?? 0) + 1;
    const now = Date.now();
    await ctx.db.insert("costDocumentReviewAnnotations", {
      actorRoles: authorization.viewer.roles,
      actorWorkosUserId: authorization.viewer.subject,
      annotation,
      brokerageId: authorization.brokerage._id,
      buildId: authorization.build._id,
      costDocumentId: document._id,
      createdAt: now,
      organizationId: authorization.organizationId,
      outcome: args.outcome,
      reviewType: args.reviewType,
      revision,
    });
    await recordCostDocumentAudit(ctx, authorization, document._id, {
      command: "setCostDocumentReviewAnnotation",
      eventType: `cost_document.${args.reviewType}_review_recorded`,
      newState: JSON.stringify({ annotation, outcome: args.outcome, revision }),
      now,
      priorState: latest
        ? JSON.stringify({
            annotation: latest.annotation,
            outcome: latest.outcome,
            revision: latest.revision,
          })
        : undefined,
    });
    return { revision };
  })
  .public();

export const voidCostDocument = authenticatedMutation
  .input({
    ...activeBuildScopeFields,
    ...administrativeOverrideInputFields,
    costDocumentId: v.id("costDocuments"),
    reason: v.string(),
  })
  .returns(v.object({ voidedAt: v.number() }))
  .handler(async (ctx, args) => {
    const { authorization: baseAuthorization, document } =
      await requireReadableCostDocument(ctx, args);
    await assertOrganizationRetentionWritable(
      ctx,
      baseAuthorization.organizationId
    );
    const reason = requiredText(args.reason, "Void reason", 1000);
    const recovery = await authorizeAdministrativeRecovery(
      ctx,
      baseAuthorization,
      { ...args, reason }
    );
    const authorization = recovery.authorization;
    if (document.voidedAt !== undefined) {
      throw new Error("The Cost Document is already voided.");
    }
    if (document.supersededByCostDocumentId !== undefined) {
      throw new Error("A superseded Cost Document cannot be voided.");
    }
    const now = Date.now();
    const financialSummary = await costDocumentFinancialAuditSummary(
      ctx,
      authorization,
      document
    );
    await ctx.db.patch(document._id, {
      voidReason: reason,
      voidedAt: now,
      voidedByWorkosUserId: authorization.viewer.subject,
    });
    await appendGovernedAuditEvent(ctx, authorization, {
      breakGlass: recovery.breakGlass,
      command: "voidCostDocument",
      entityId: String(document._id),
      entityType: "costDocument",
      eventType: "cost_document.voided",
      newState: { ...financialSummary, state: "voided", voidedAt: now },
      now,
      overrideKind: "cost_void",
      priorState: { ...financialSummary, state: "current" },
      reason,
      targetRevisions: [
        {
          entityId: String(document._id),
          entityType: "costDocument",
          revision: document.revisionNumber ?? 1,
        },
      ],
    });
    await ctx.db.insert("eventOutbox", {
      brokerageId: authorization.brokerage._id,
      createdAt: now,
      eventType: "cost_document.voided",
      organizationId: authorization.organizationId,
      payloadPreview: JSON.stringify({
        buildId: authorization.build._id,
        reason,
      }),
      relatedEntityId: String(document._id),
      relatedEntityType: "costDocument",
      status: "pending",
    });
    return { voidedAt: now };
  })
  .public();

export const startCostDocumentCorrection = authenticatedMutation
  .input({
    ...activeBuildScopeFields,
    ...administrativeOverrideInputFields,
    costDocumentId: v.id("costDocuments"),
    idempotencyKey: v.string(),
    reason: v.string(),
    reuseSourcePages: v.boolean(),
  })
  .returns(
    v.object({
      batchId: v.id("costDocumentBatches"),
      draftId: v.id("costDocumentDrafts"),
      replayed: v.boolean(),
    })
  )
  .handler(async (ctx, args) => {
    const { authorization: baseAuthorization, document } =
      await requireReadableCostDocument(ctx, args);
    await assertOrganizationRetentionWritable(
      ctx,
      baseAuthorization.organizationId
    );
    const recoveryReason = requiredText(args.reason, "Correction reason", 1000);
    const recovery = await authorizeAdministrativeRecovery(
      ctx,
      baseAuthorization,
      {
        ...args,
        reason: recoveryReason,
      }
    );
    const authorization = recovery.authorization;
    if (
      document.contractorProfileId &&
      document.uploaderWorkosUserId !== authorization.viewer.subject
    ) {
      throw new Error(
        "The Contractor Cost Document correction is unavailable."
      );
    }
    return await createCostDocumentCorrection(ctx, authorization, document, {
      idempotencyKey: requiredIdempotencyKey(args.idempotencyKey),
      reason: recoveryReason,
      reuseSourcePages: args.reuseSourcePages,
      breakGlass: recovery.breakGlass,
    });
  })
  .public();

export const reconcileCostDocumentIntegrity = authenticatedMutation
  .input({
    ...activeBuildScopeFields,
    costDocumentId: v.id("costDocuments"),
  })
  .returns(
    v.object({
      exceptions: v.array(costDocumentIntegrityExceptionProjectionValidator),
      healthy: v.boolean(),
    })
  )
  .handler(async (ctx, args) => {
    const { authorization, document } = await requireReadableCostDocument(
      ctx,
      args
    );
    await assertOrganizationRetentionWritable(
      ctx,
      authorization.organizationId
    );
    return await reconcileSubmittedCostDocumentIntegrity(
      ctx,
      authorization,
      document
    );
  })
  .public();

export const backfillCostDocumentSourceHashDigests = authenticatedMutation
  .input({
    ...activeBuildScopeFields,
    limit: v.optional(v.number()),
  })
  .returns(
    v.object({
      hasMore: v.boolean(),
      processed: v.number(),
    })
  )
  .handler(async (ctx, args) => {
    const authorization = await authorizeCostDocumentIntent(ctx, {
      ...args,
      intent: "submitted.read",
    });
    await assertOrganizationRetentionWritable(
      ctx,
      authorization.organizationId
    );
    if (
      !["admin", "principle-broker"].includes(authorization.effectiveRole.role)
    ) {
      throw new Error("Cost Document source-digest backfill is unavailable.");
    }
    const limit = args.limit ?? 25;
    if (!(Number.isSafeInteger(limit) && limit >= 1 && limit <= 100)) {
      throw new Error("Cost Document source-digest backfill limit is invalid.");
    }
    const candidates = await ctx.db
      .query("costDocuments")
      .withIndex("by_buildId_and_sourceHashDigest", (query) =>
        query
          .eq("buildId", authorization.build._id)
          .eq("sourceHashDigest", undefined)
      )
      .take(limit + 1);
    const documents = candidates.slice(0, limit);
    for (const document of documents) {
      if (
        document.organizationId !== authorization.organizationId ||
        document.brokerageId !== authorization.brokerage._id
      ) {
        throw new Error("The Cost Document backfill graph is unavailable.");
      }
      const pages = await ctx.db
        .query("costDocumentPages")
        .withIndex("by_costDocumentId_and_order", (query) =>
          query.eq("costDocumentId", document._id)
        )
        .order("asc")
        .take(MAX_PAGES + 1);
      if (
        pages.length < 1 ||
        pages.length > MAX_PAGES ||
        !hasSequentialCostDocumentOrders(pages) ||
        pages.some(
          (page) =>
            page.organizationId !== authorization.organizationId ||
            page.brokerageId !== authorization.brokerage._id ||
            page.buildId !== authorization.build._id ||
            page.costDocumentId !== document._id
        )
      ) {
        throw new Error("The Cost Document backfill graph is unavailable.");
      }
      const sourceHashDigest = await sha256Text(
        pages
          .map((page) => page.contentHashSha256Snapshot)
          .sort((left, right) => left.localeCompare(right))
          .join("\n")
      );
      await ctx.db.patch(document._id, { sourceHashDigest });
      await recordCostDocumentAudit(ctx, authorization, document._id, {
        command: "backfillCostDocumentSourceHashDigests",
        eventType: "cost_document.source_digest_backfilled",
        newState: JSON.stringify({ sourceHashDigest }),
        now: Date.now(),
        priorState: JSON.stringify({ sourceHashDigest: null }),
      });
    }
    return {
      hasMore: candidates.length > limit,
      processed: documents.length,
    };
  })
  .public();

export const getActiveCostDocumentBatch = authenticatedQuery
  .input(activeBuildScopeFields)
  .returns(v.union(costDocumentBatchProjectionValidator, v.null()))
  .handler(async (ctx, args) => {
    const authorization = await authorizeCostDocumentBuilder(ctx, args);
    const contractorProfileId = await currentCostDocumentCreatorProfileId(
      ctx,
      authorization
    );
    const exactBatch = await ctx.db
      .query("costDocumentBatches")
      .withIndex(
        "by_buildId_and_ownerWorkosUserId_and_creatorCapacity_and_state",
        (query) =>
          query
            .eq("buildId", authorization.build._id)
            .eq("ownerWorkosUserId", authorization.viewer.subject)
            .eq("creatorCapacity", authorization.effectiveRole.role)
            .eq("state", "active")
      )
      .order("desc")
      .first();
    const batch =
      exactBatch ??
      (await findLegacyActiveCostDocumentBatch(ctx, {
        authorization,
        contractorProfileId,
      }));
    if (!batch) {
      return null;
    }
    assertBatchOwnership(batch, authorization);
    if (
      batch.contractorProfileId !== contractorProfileId ||
      currentCostDocumentBatchCreatorCapacity(batch, authorization) !==
        authorization.effectiveRole.role
    ) {
      return null;
    }
    return await projectCostDocumentBatch(ctx, batch, authorization);
  })
  .public();

/**
 * Resolves one Cost Document batch for a refreshable workspace deep link.
 *
 * Recovery intentionally remains a separate query: it finds the caller's
 * newest active batch, while this query proves that the requested identifier
 * belongs to the caller and to the requested Build before exposing it.
 */
export const getCostDocumentBatch = authenticatedQuery
  .input({
    ...activeBuildScopeFields,
    batchId: v.string(),
  })
  .returns(v.union(costDocumentBatchProjectionValidator, v.null()))
  .handler(async (ctx, args) => {
    const batchId = ctx.db.normalizeId("costDocumentBatches", args.batchId);
    if (!batchId) {
      return null;
    }
    const authorization = await authorizeCostDocumentBuilder(ctx, args);
    const contractorProfileId = await currentCostDocumentCreatorProfileId(
      ctx,
      authorization
    );
    const batch = await ctx.db.get(batchId);
    if (
      !(
        batch &&
        isBatchOwnedBy(batch, authorization) &&
        batch.contractorProfileId === contractorProfileId &&
        currentCostDocumentBatchCreatorCapacity(batch, authorization) ===
          authorization.effectiveRole.role
      )
    ) {
      return null;
    }
    return await projectCostDocumentBatch(ctx, batch, authorization);
  })
  .public();

/**
 * Exact-Draft seam for an explicitly granted Builder collaborator. It is
 * deliberately not a batch projection: a grant never discloses sibling
 * drafts, batch state, batch order, or transport metadata.
 */
export const getCostDocumentDraft = authenticatedQuery
  .input({
    ...activeBuildScopeFields,
    // Route/deep-link input is untrusted. Normalize it in the handler so an
    // expired grant or malformed ID resolves to the intentional unavailable
    // state instead of leaking through a validator/error boundary.
    draftId: v.string(),
  })
  .returns(v.union(collaborativeCostDocumentDraftProjectionValidator, v.null()))
  .handler(async (ctx, args) => {
    const draftId = ctx.db.normalizeId("costDocumentDrafts", args.draftId);
    if (!draftId) {
      return null;
    }
    try {
      const requestedAuthorization = await authorizeCostDocumentIntent(ctx, {
        actorCapacity: args.actorCapacity,
        buildId: args.buildId,
        intent: "draft.read",
        organizationId: args.organizationId,
      });
      const access = await requireCostDocumentDraftAccess(ctx, {
        actorCapacity: args.actorCapacity,
        draftId,
        intent: "draft.read",
      });
      if (
        access.authorization.build._id !== requestedAuthorization.build._id ||
        access.authorization.organizationId !==
          requestedAuthorization.organizationId
      ) {
        return null;
      }
      const projected = await projectCostDocumentDraft(
        ctx,
        access.draft,
        access.authorization
      );
      return {
        _id: projected._id,
        activeStep: projected.activeStep,
        allocations: projected.allocations,
        capabilities: costDocumentDraftCapabilities(access),
        category: projected.category,
        completedAt: projected.completedAt,
        creator: { workosUserId: access.draft.ownerWorkosUserId },
        currency: projected.currency,
        description: projected.description,
        documentDate: projected.documentDate,
        financialComponents: projected.financialComponents,
        grossTotalCents: projected.grossTotalCents,
        kind: projected.kind,
        lifecycle: projected.lifecycle,
        pages: projected.pages,
        revision: currentCostDocumentDraftRevision(access.draft),
        self: { workosUserId: access.authorization.viewer.subject },
        title: projected.title,
        vendorProfileId: projected.vendorProfileId,
        vendorName: projected.vendorName,
        workingStateJson: projected.workingStateJson,
      };
    } catch {
      return null;
    }
  })
  .public();

export const grantCostDocumentDraftCollaborator = authenticatedMutation
  .input({
    ...costDocumentActorCapacityFields,
    collaboratorWorkosUserId: v.string(),
    draftId: v.id("costDocumentDrafts"),
    expectedRevision: v.number(),
    reason: v.optional(v.string()),
  })
  .returns(
    v.object({
      draftId: v.id("costDocumentDrafts"),
      revision: v.number(),
    })
  )
  .handler(async (ctx, args) => {
    const access = await requireCostDocumentDraftAccess(ctx, {
      actorCapacity: args.actorCapacity,
      draftId: args.draftId,
      intent: "draft.edit",
    });
    if (
      access.mode !== "creator" ||
      access.batch.state !== "active" ||
      access.draft.lifecycle !== "draft" ||
      !canManageCostDocumentDraftCollaboration(access.authorization)
    ) {
      throw new Error("The Cost Document draft is unavailable.");
    }
    assertExpectedCostDocumentDraftRevision(
      access.draft,
      args.expectedRevision
    );
    const collaboratorWorkosUserId = args.collaboratorWorkosUserId.trim();
    if (!collaboratorWorkosUserId) {
      throw new Error("The Cost Document collaborator is unavailable.");
    }
    await requireEligibleCostDocumentDraftCollaborator(ctx, {
      authorization: access.authorization,
      collaboratorWorkosUserId,
      creatorWorkosUserId: access.draft.ownerWorkosUserId,
    });
    if (
      await hasCurrentDraftCollaborationGrant(ctx, {
        draft: access.draft,
        workosUserId: collaboratorWorkosUserId,
      })
    ) {
      throw new Error("The Cost Document collaborator already has access.");
    }
    const now = Date.now();
    const revision = currentCostDocumentDraftRevision(access.draft) + 1;
    await ctx.db.insert("costDocumentDraftCollaborationEvents", {
      actorRole: access.authorization.effectiveRole.role,
      actorWorkosUserId: access.authorization.viewer.subject,
      batchId: access.batch._id,
      brokerageId: access.authorization.brokerage._id,
      buildId: access.authorization.build._id,
      collaboratorWorkosUserId,
      createdAt: now,
      creatorWorkosUserId: access.draft.ownerWorkosUserId,
      draftId: access.draft._id,
      draftRevision: revision,
      eventType: "granted",
      organizationId: access.authorization.organizationId,
      reason: optionalText(args.reason, "Collaboration reason", 500),
    });
    await ctx.db.patch(access.draft._id, { revision, updatedAt: now });
    await ctx.db.patch(access.batch._id, {
      revision: currentCostDocumentBatchRevision(access.batch) + 1,
      updatedAt: now,
    });
    await recordCostDocumentDraftAudit(
      ctx,
      access.authorization,
      access.draft,
      {
        command: "grantCostDocumentDraftCollaborator",
        eventType: "cost_document.draft_collaborator_granted",
        newState: JSON.stringify({ collaboratorWorkosUserId, revision }),
        now,
        priorState: JSON.stringify({
          revision: currentCostDocumentDraftRevision(access.draft),
        }),
      }
    );
    return { draftId: access.draft._id, revision };
  })
  .public();

export const revokeCostDocumentDraftCollaborator = authenticatedMutation
  .input({
    ...costDocumentActorCapacityFields,
    collaboratorWorkosUserId: v.string(),
    draftId: v.id("costDocumentDrafts"),
    expectedRevision: v.number(),
    reason: v.optional(v.string()),
  })
  .returns(
    v.object({
      draftId: v.id("costDocumentDrafts"),
      revision: v.number(),
    })
  )
  .handler(async (ctx, args) => {
    const access = await requireCostDocumentDraftAccess(ctx, {
      actorCapacity: args.actorCapacity,
      draftId: args.draftId,
      intent: "draft.edit",
    });
    if (
      access.mode !== "creator" ||
      access.batch.state !== "active" ||
      access.draft.lifecycle !== "draft" ||
      !canManageCostDocumentDraftCollaboration(access.authorization)
    ) {
      throw new Error("The Cost Document draft is unavailable.");
    }
    assertExpectedCostDocumentDraftRevision(
      access.draft,
      args.expectedRevision
    );
    const collaboratorWorkosUserId = args.collaboratorWorkosUserId.trim();
    if (
      !(
        collaboratorWorkosUserId &&
        (await hasCurrentDraftCollaborationGrant(ctx, {
          draft: access.draft,
          workosUserId: collaboratorWorkosUserId,
        }))
      )
    ) {
      throw new Error("The Cost Document collaborator is unavailable.");
    }
    const now = Date.now();
    const revision = currentCostDocumentDraftRevision(access.draft) + 1;
    await ctx.db.insert("costDocumentDraftCollaborationEvents", {
      actorRole: access.authorization.effectiveRole.role,
      actorWorkosUserId: access.authorization.viewer.subject,
      batchId: access.batch._id,
      brokerageId: access.authorization.brokerage._id,
      buildId: access.authorization.build._id,
      collaboratorWorkosUserId,
      createdAt: now,
      creatorWorkosUserId: access.draft.ownerWorkosUserId,
      draftId: access.draft._id,
      draftRevision: revision,
      eventType: "revoked",
      organizationId: access.authorization.organizationId,
      reason: optionalText(args.reason, "Collaboration reason", 500),
    });
    await ctx.db.patch(access.draft._id, { revision, updatedAt: now });
    await ctx.db.patch(access.batch._id, {
      revision: currentCostDocumentBatchRevision(access.batch) + 1,
      updatedAt: now,
    });
    await recordCostDocumentDraftAudit(
      ctx,
      access.authorization,
      access.draft,
      {
        command: "revokeCostDocumentDraftCollaborator",
        eventType: "cost_document.draft_collaborator_revoked",
        newState: JSON.stringify({ collaboratorWorkosUserId, revision }),
        now,
        priorState: JSON.stringify({
          revision: currentCostDocumentDraftRevision(access.draft),
        }),
      }
    );
    return { draftId: access.draft._id, revision };
  })
  .public();

export const createCostDocumentBatch = authenticatedMutation
  .input({
    ...activeBuildScopeFields,
    idempotencyKey: v.optional(v.string()),
  })
  .returns(v.id("costDocumentBatches"))
  .handler(async (ctx, args) => {
    const authorization = await authorizeCostDocumentBuilder(ctx, args);
    const contractorProfileId =
      authorization.effectiveRole.role === "contractor"
        ? (
            await requireCurrentContractorCostDocumentScope(ctx, {
              authorization,
              purpose: "draft.write",
              workosUserId: authorization.viewer.subject,
            })
          ).contractorId
        : undefined;
    const idempotencyKey = optionalIdempotencyKey(args.idempotencyKey);
    if (idempotencyKey) {
      const existingByKey = await ctx.db
        .query("costDocumentBatches")
        .withIndex("by_organizationId_and_createIdempotencyKey", (query) =>
          query
            .eq("organizationId", authorization.organizationId)
            .eq("createIdempotencyKey", idempotencyKey)
        )
        .unique();
      if (existingByKey) {
        assertBatchOwnership(existingByKey, authorization);
        if (
          existingByKey.contractorProfileId !== contractorProfileId ||
          currentCostDocumentBatchCreatorCapacity(
            existingByKey,
            authorization
          ) !== authorization.effectiveRole.role
        ) {
          throw new Error("The Cost Document batch is unavailable.");
        }
        return existingByKey._id;
      }
    }
    const exactActive = await ctx.db
      .query("costDocumentBatches")
      .withIndex(
        "by_buildId_and_ownerWorkosUserId_and_creatorCapacity_and_state",
        (query) =>
          query
            .eq("buildId", authorization.build._id)
            .eq("ownerWorkosUserId", authorization.viewer.subject)
            .eq("creatorCapacity", authorization.effectiveRole.role)
            .eq("state", "active")
      )
      .order("desc")
      .first();
    const existingActive =
      exactActive ??
      (await findLegacyActiveCostDocumentBatch(ctx, {
        authorization,
        contractorProfileId,
      }));
    if (existingActive) {
      assertBatchOwnership(existingActive, authorization);
      if (
        existingActive.contractorProfileId !== contractorProfileId ||
        currentCostDocumentBatchCreatorCapacity(
          existingActive,
          authorization
        ) !== authorization.effectiveRole.role
      ) {
        throw new Error("The Cost Document batch is unavailable.");
      }
      return existingActive._id;
    }
    const now = Date.now();
    const batchId = await ctx.db.insert("costDocumentBatches", {
      brokerageId: authorization.brokerage._id,
      buildId: authorization.build._id,
      createIdempotencyKey: idempotencyKey,
      createdAt: now,
      creatorCapacity: authorization.effectiveRole.role,
      contractorProfileId,
      organizationId: authorization.organizationId,
      ownerWorkosUserId: authorization.viewer.subject,
      revision: 1,
      state: "active",
      updatedAt: now,
    });
    await recordCostDocumentBatchAudit(ctx, authorization, {
      batchId,
      command: "createCostDocumentBatch",
      eventType: "cost_document.batch_created",
      newState: JSON.stringify({ state: "active" }),
      now,
    });
    return batchId;
  })
  .public();

export const addCostDocumentDraft = authenticatedMutation
  .input({
    ...costDocumentActorCapacityFields,
    batchId: v.id("costDocumentBatches"),
    category: costDocumentCategoryValidator,
    kind: costDocumentKindValidator,
  })
  .returns(v.id("costDocumentDrafts"))
  .handler(async (ctx, args) => {
    const { authorization, batch } = await requireCostDocumentBatchOwner(
      ctx,
      args.batchId,
      "create",
      args.actorCapacity
    );
    if (batch.state !== "active") {
      throw new Error("The Cost Document batch is no longer editable.");
    }
    if (batch.correctionSourceCostDocumentId !== undefined) {
      throw new Error(
        "A Cost Document correction batch contains one revision."
      );
    }
    const existing = await ctx.db
      .query("costDocumentDrafts")
      .withIndex("by_batchId_and_order", (query) =>
        query.eq("batchId", batch._id)
      )
      .order("desc")
      .first();
    if ((existing?.order ?? 0) >= MAX_BATCH_DRAFTS) {
      throw new Error(
        `A Cost Document batch supports at most ${MAX_BATCH_DRAFTS} documents.`
      );
    }
    const now = Date.now();
    const draftId = await ctx.db.insert("costDocumentDrafts", {
      activeStep: "capture_confirm",
      batchId: batch._id,
      brokerageId: authorization.brokerage._id,
      buildId: authorization.build._id,
      category: args.category,
      contractorProfileId: batch.contractorProfileId,
      currency: "CAD",
      createdAt: now,
      kind: args.kind,
      lifecycle: "draft",
      order: (existing?.order ?? 0) + 1,
      organizationId: authorization.organizationId,
      ownerWorkosUserId: authorization.viewer.subject,
      revision: 1,
      updatedAt: now,
    });
    await ctx.db.patch(batch._id, {
      revision: currentCostDocumentBatchRevision(batch) + 1,
      updatedAt: now,
    });
    await recordCostDocumentBatchAudit(ctx, authorization, {
      batchId: batch._id,
      command: "addCostDocumentDraft",
      eventType: "cost_document.draft_created",
      newState: JSON.stringify({ draftId, order: (existing?.order ?? 0) + 1 }),
      now,
    });
    return draftId;
  })
  .public();

/**
 * Discards the creator-owned batch without deleting its durable audit trail or
 * source-page history. Draft access ends immediately because every exact
 * authorizer requires an active batch; scheduled staging cleanup remains
 * responsible for any unbound private storage.
 */
export const abandonCostDocumentBatch = authenticatedMutation
  .input({
    ...costDocumentActorCapacityFields,
    batchId: v.id("costDocumentBatches"),
    expectedRevision: v.number(),
    reason: v.optional(v.string()),
  })
  .returns(v.object({ revision: v.number() }))
  .handler(async (ctx, args) => {
    const { authorization, batch } = await requireCostDocumentBatchOwner(
      ctx,
      args.batchId,
      "batch.submit",
      args.actorCapacity
    );
    if (batch.state !== "active") {
      throw new Error("The Cost Document batch is no longer editable.");
    }
    assertExpectedCostDocumentBatchRevision(batch, args.expectedRevision);
    const drafts = await listBatchDrafts(ctx, batch._id);
    for (const draft of drafts) {
      assertDraftOwnershipScope(draft, batch, authorization);
    }
    const now = Date.now();
    const revision = currentCostDocumentBatchRevision(batch) + 1;
    const reason = optionalText(args.reason, "Discard reason", 500);
    await ctx.db.patch(batch._id, {
      revision,
      state: "abandoned",
      updatedAt: now,
    });
    await recordCostDocumentBatchAudit(ctx, authorization, {
      batchId: batch._id,
      command: "abandonCostDocumentBatch",
      eventType: "cost_document.batch_abandoned",
      newState: JSON.stringify({ reason, revision, state: "abandoned" }),
      now,
      priorState: JSON.stringify({
        revision: currentCostDocumentBatchRevision(batch),
        state: batch.state,
      }),
    });
    return { revision };
  })
  .public();

export const saveCostDocumentDraft = authenticatedMutation
  .input({
    ...costDocumentActorCapacityFields,
    category: v.optional(costDocumentCategoryValidator),
    description: v.optional(v.string()),
    documentDate: v.optional(v.string()),
    draftId: v.id("costDocumentDrafts"),
    expectedRevision: v.number(),
    financialComponents: v.optional(
      v.array(costDocumentFinancialComponentInputValidator)
    ),
    grossTotalCents: v.optional(v.number()),
    kind: v.optional(costDocumentKindValidator),
    allocations: v.optional(
      v.array(
        v.object({
          amountCents: v.number(),
          buildSubmilestoneId: v.id("buildSubmilestones"),
        })
      )
    ),
    pageAssetIds: v.optional(v.array(v.id("buildCollaborationAssets"))),
    title: v.optional(v.string()),
    vendorProfileId: v.optional(v.union(v.id("contractorProfiles"), v.null())),
    vendorName: v.optional(v.string()),
    workingStateJson: v.optional(v.string()),
  })
  .returns(v.object({ revision: v.number() }))
  .handler(async (ctx, args) => {
    const { authorization, batch, draft } =
      await requireCostDocumentDraftAccess(ctx, {
        actorCapacity: args.actorCapacity,
        draftId: args.draftId,
        intent: "draft.edit",
      });
    if (batch.state !== "active" || draft.lifecycle !== "draft") {
      throw new Error("The Cost Document draft is no longer editable.");
    }
    assertExpectedCostDocumentDraftRevision(draft, args.expectedRevision);
    const now = Date.now();
    const revision = currentCostDocumentDraftRevision(draft) + 1;
    const updates: {
      category?: "labour" | "materials";
      description?: string;
      documentDate?: string;
      grossTotalCents?: number;
      kind?: "invoice" | "receipt";
      title?: string;
      vendorProfileId?: Id<"contractorProfiles">;
      vendorName?: string;
      workingStateJson?: string;
      revision: number;
      updatedAt: number;
    } = { revision, updatedAt: now };
    if (args.category !== undefined) {
      updates.category = args.category;
    }
    if (args.kind !== undefined) {
      updates.kind = args.kind;
    }
    if (args.title !== undefined) {
      updates.title = optionalDraftText(args.title, "Title", 240);
    }
    if (args.vendorProfileId !== undefined && args.vendorProfileId !== null) {
      const profile = await requireActiveCostDocumentVendorProfile(
        ctx,
        authorization,
        args.vendorProfileId
      );
      updates.vendorProfileId = profile._id;
      updates.vendorName = profile.name;
    } else if (args.vendorProfileId === null) {
      updates.vendorProfileId = undefined;
    }
    if (
      args.vendorName !== undefined &&
      (args.vendorProfileId === undefined || args.vendorProfileId === null)
    ) {
      updates.vendorName = optionalDraftText(args.vendorName, "Vendor", 240);
    }
    if (args.description !== undefined) {
      updates.description = optionalDraftText(
        args.description,
        "Description",
        4000
      );
    }
    if (args.documentDate !== undefined) {
      const normalizedDate = args.documentDate.trim();
      updates.documentDate = normalizedDate
        ? requiredDocumentDate(normalizedDate)
        : "";
    }
    if (args.grossTotalCents !== undefined) {
      updates.grossTotalCents = nonNegativeCents(
        args.grossTotalCents,
        "Gross Document Total"
      );
    }
    if (args.workingStateJson !== undefined) {
      updates.workingStateJson = normalizeCostDocumentWorkingStateJson(
        args.workingStateJson
      );
    }

    if (args.pageAssetIds !== undefined) {
      assertDraftPageMutationAllowed(draft);
      const pages = await requireAvailableDraftSourcePages(ctx, authorization, {
        draft,
        now,
        pageAssetIds: args.pageAssetIds,
      });
      await replaceDraftPages(ctx, authorization, draft, pages, now);
    }
    if (args.allocations !== undefined) {
      const allocations = await validateDraftAllocations(
        ctx,
        authorization,
        args.allocations
      );
      await assertCurrentCostDocumentAllocationScope(ctx, {
        allocationSubmilestoneIds: allocations.map(
          (allocation) => allocation.submilestone._id
        ),
        authorization,
        contractorProfileId: draft.contractorProfileId,
        ownerWorkosUserId: draft.ownerWorkosUserId,
        purpose: "draft.write",
      });
      await replaceDraftAllocations(
        ctx,
        authorization,
        draft,
        allocations,
        now
      );
    }
    if (args.financialComponents !== undefined) {
      const components = validateFinancialComponents(args.financialComponents);
      await replaceDraftFinancialComponents(
        ctx,
        authorization,
        draft,
        components,
        now
      );
    }
    await ctx.db.patch(draft._id, updates);
    await ctx.db.patch(batch._id, {
      revision: currentCostDocumentBatchRevision(batch) + 1,
      updatedAt: now,
    });
    await recordCostDocumentDraftAudit(ctx, authorization, draft, {
      command: "saveCostDocumentDraft",
      eventType: "cost_document.draft_edited",
      newState: JSON.stringify({ revision }),
      now,
      priorState: JSON.stringify({
        revision: currentCostDocumentDraftRevision(draft),
      }),
    });
    return { revision };
  })
  .public();

/**
 * Makes one successfully scanned Cost Document source page durable immediately
 * after upload. This closes the interruption window between generic governed
 * upload finalization and the next draft-form save: the active draft page row
 * survives staging-session expiry and keeps the exact-Draft asset readable.
 *
 * The mutation is idempotent so an interrupted client can retry safely.
 */
export const bindCostDocumentDraftPageAsset = authenticatedMutation
  .input({
    ...costDocumentActorCapacityFields,
    assetId: v.id("buildCollaborationAssets"),
    draftId: v.id("costDocumentDrafts"),
    expectedRevision: v.number(),
    replaceAssetId: v.optional(v.id("buildCollaborationAssets")),
  })
  .returns(v.object({ order: v.number(), revision: v.number() }))
  .handler(async (ctx, args) => {
    const { authorization, batch, draft } =
      await requireCostDocumentDraftAccess(ctx, {
        actorCapacity: args.actorCapacity,
        draftId: args.draftId,
        intent: "draft.edit",
      });
    if (batch.state !== "active") {
      throw new Error("The Cost Document batch is no longer editable.");
    }
    assertDraftPageMutationAllowed(draft);
    assertExpectedCostDocumentDraftRevision(draft, args.expectedRevision);

    const now = Date.now();
    const revision = currentCostDocumentDraftRevision(draft) + 1;
    const activePages = await currentDraftPages(ctx, draft);
    for (const page of activePages) {
      assertDraftPageScope(page, draft, authorization);
    }
    const existing = activePages.find((page) => page.assetId === args.assetId);
    if (args.replaceAssetId !== undefined) {
      return await replaceCostDocumentDraftPageAsset(ctx, {
        activePages,
        assetId: args.assetId,
        authorization,
        batch,
        draft,
        existing,
        now,
        revision,
        replaceAssetId: args.replaceAssetId,
      });
    }
    if (existing) {
      // A retry must be idempotent, but never turn a corrupted/rejected page
      // into a false success merely because a stale active row still exists.
      const [asset] = await requireAvailableDraftSourcePages(
        ctx,
        authorization,
        {
          draft,
          now,
          pageAssetIds: [args.assetId],
        }
      );
      if (!asset) {
        throw new Error("The Cost Document draft source page is unavailable.");
      }
      // Legacy/interrupted binds can leave an active page row with its fresh
      // finalized session. Retrying must converge that exact durable binding
      // to consumed so expiry cannot subsequently delete its storage.
      await consumeDraftPageSessions(ctx, [asset], now);
      return {
        order: existing.order,
        revision: currentCostDocumentDraftRevision(draft),
      };
    }
    if (activePages.length >= MAX_PAGES) {
      throw new Error(`A Cost Document requires at most ${MAX_PAGES} pages.`);
    }

    const [asset] = await requireAvailableDraftSourcePages(ctx, authorization, {
      draft,
      now,
      pageAssetIds: [args.assetId],
    });
    if (!asset) {
      throw new Error("The Cost Document draft source page is unavailable.");
    }
    const order =
      activePages.reduce((highest, page) => Math.max(highest, page.order), 0) +
      1;
    await ctx.db.insert("costDocumentDraftPages", {
      assetId: asset._id,
      batchId: draft.batchId,
      brokerageId: authorization.brokerage._id,
      buildId: authorization.build._id,
      createdAt: now,
      draftId: draft._id,
      order,
      organizationId: authorization.organizationId,
      state: "active",
    });
    await consumeDraftPageSessions(ctx, [asset], now);
    await ctx.db.patch(draft._id, { revision, updatedAt: now });
    await ctx.db.patch(batch._id, {
      revision: currentCostDocumentBatchRevision(batch) + 1,
      updatedAt: now,
    });
    await recordCostDocumentDraftAudit(ctx, authorization, draft, {
      command: "bindCostDocumentDraftPageAsset",
      eventType: "cost_document.draft_page_bound",
      newState: JSON.stringify({ assetId: asset._id, order, revision }),
      now,
      priorState: JSON.stringify({
        revision: currentCostDocumentDraftRevision(draft),
      }),
    });
    return { order, revision };
  })
  .public();

/**
 * Replaces one active private draft page without using the published-asset
 * versioning lineage. Draft source pages are intentionally unpublished, so the
 * page record itself is the durable replacement authority.
 */
async function replaceCostDocumentDraftPageAsset(
  ctx: MutationCtx,
  input: {
    activePages: Doc<"costDocumentDraftPages">[];
    assetId: Id<"buildCollaborationAssets">;
    authorization: ActiveBuildAuthorization;
    batch: Doc<"costDocumentBatches">;
    draft: Doc<"costDocumentDrafts">;
    existing?: Doc<"costDocumentDraftPages">;
    now: number;
    revision: number;
    replaceAssetId: Id<"buildCollaborationAssets">;
  }
) {
  if (input.replaceAssetId === input.assetId) {
    throw new Error("A Cost Document source page cannot replace itself.");
  }
  const replacedPage = input.activePages.find(
    (page) => page.assetId === input.replaceAssetId
  );
  if (input.existing) {
    if (replacedPage || input.existing.priorAssetId !== input.replaceAssetId) {
      throw new Error(
        "The replacement Cost Document source page is unavailable."
      );
    }
    // Retrying a completed atomic replacement must converge the exact durable
    // page binding without adding a 51st row at the page cap.
    const asset = await requireOneAvailableDraftSourcePage(ctx, input);
    await consumeDraftPageSessions(ctx, [asset], input.now);
    return {
      order: input.existing.order,
      revision: currentCostDocumentDraftRevision(input.draft),
    };
  }
  if (!replacedPage) {
    throw new Error("The original Cost Document source page is unavailable.");
  }
  const asset = await requireOneAvailableDraftSourcePage(ctx, input);

  await ctx.db.patch(replacedPage._id, {
    replacedAt: input.now,
    state: "replaced",
  });
  await ctx.db.insert("costDocumentDraftPages", {
    assetId: asset._id,
    batchId: input.draft.batchId,
    brokerageId: input.authorization.brokerage._id,
    buildId: input.authorization.build._id,
    createdAt: input.now,
    draftId: input.draft._id,
    order: replacedPage.order,
    organizationId: input.authorization.organizationId,
    priorAssetId: replacedPage.assetId,
    state: "active",
  });
  await retireReplacedDraftAssets(
    ctx,
    input.authorization,
    input.draft,
    [replacedPage],
    [asset],
    input.now
  );
  await consumeDraftPageSessions(ctx, [asset], input.now);
  await ctx.db.patch(input.draft._id, {
    revision: input.revision,
    updatedAt: input.now,
  });
  await ctx.db.patch(input.batch._id, {
    revision: currentCostDocumentBatchRevision(input.batch) + 1,
    updatedAt: input.now,
  });
  await recordCostDocumentDraftAudit(ctx, input.authorization, input.draft, {
    command: "replaceCostDocumentDraftPageAsset",
    eventType: "cost_document.draft_page_replaced",
    newState: JSON.stringify({
      assetId: asset._id,
      order: replacedPage.order,
      priorAssetId: replacedPage.assetId,
      revision: input.revision,
    }),
    now: input.now,
    priorState: JSON.stringify({
      assetId: replacedPage.assetId,
      order: replacedPage.order,
      revision: currentCostDocumentDraftRevision(input.draft),
    }),
  });
  return { order: replacedPage.order, revision: input.revision };
}

async function requireOneAvailableDraftSourcePage(
  ctx: MutationCtx,
  input: Pick<
    Parameters<typeof replaceCostDocumentDraftPageAsset>[1],
    "assetId" | "authorization" | "draft" | "now"
  >
) {
  const [asset] = await requireAvailableDraftSourcePages(
    ctx,
    input.authorization,
    {
      draft: input.draft,
      now: input.now,
      pageAssetIds: [input.assetId],
    }
  );
  if (!asset) {
    throw new Error("The Cost Document draft source page is unavailable.");
  }
  return asset;
}

export const setCostDocumentDraftStep = authenticatedMutation
  .input({
    ...costDocumentActorCapacityFields,
    complete: v.optional(v.boolean()),
    draftId: v.id("costDocumentDrafts"),
    expectedRevision: v.number(),
    step: costDocumentDraftStepValidator,
  })
  .returns(v.object({ revision: v.number() }))
  .handler(async (ctx, args) => {
    const { authorization, batch, draft } =
      await requireCostDocumentDraftAccess(ctx, {
        actorCapacity: args.actorCapacity,
        draftId: args.draftId,
        intent: "draft.edit",
      });
    if (batch.state !== "active" || draft.lifecycle === "submitted") {
      throw new Error("The Cost Document draft is no longer editable.");
    }
    assertExpectedCostDocumentDraftRevision(draft, args.expectedRevision);
    await validateCostDocumentDraftStepTransition(
      ctx,
      authorization,
      draft,
      args
    );
    const now = Date.now();
    const revision = currentCostDocumentDraftRevision(draft) + 1;
    const nextLifecycle = args.complete ? "complete" : "draft";
    const nextCompletedAt = args.complete ? now : undefined;
    await ctx.db.patch(draft._id, {
      activeStep: args.step,
      completedAt: nextCompletedAt,
      lifecycle: nextLifecycle,
      revision,
      updatedAt: now,
      workingStateJson: args.complete ? undefined : draft.workingStateJson,
    });
    await ctx.db.patch(batch._id, {
      revision: currentCostDocumentBatchRevision(batch) + 1,
      updatedAt: now,
    });
    await recordCostDocumentDraftAudit(ctx, authorization, draft, {
      command: "setCostDocumentDraftStep",
      eventType: args.complete
        ? "cost_document.draft_completed"
        : draft.lifecycle === "complete"
          ? "cost_document.draft_reopened"
          : "cost_document.draft_step_changed",
      priorState: JSON.stringify({
        ...costDocumentDraftLifecycleState(draft),
        revision: currentCostDocumentDraftRevision(draft),
      }),
      newState: JSON.stringify({
        ...costDocumentDraftLifecycleState({
          activeStep: args.step,
          completedAt: nextCompletedAt,
          lifecycle: nextLifecycle,
        }),
        revision,
      }),
      now,
    });
    return { revision };
  })
  .public();

export const submitCostDocumentBatch = authenticatedMutation
  .input({
    ...costDocumentActorCapacityFields,
    batchId: v.id("costDocumentBatches"),
    duplicateOverrideReason: v.optional(v.string()),
    expectedRevision: v.number(),
    idempotencyKey: v.string(),
  })
  .returns(
    v.object({
      batchId: v.id("costDocumentBatches"),
      costDocumentIds: v.array(v.id("costDocuments")),
      replayed: v.boolean(),
      revision: v.number(),
    })
  )
  .handler(async (ctx, args) => {
    const { authorization, batch } = await requireCostDocumentBatchOwner(
      ctx,
      args.batchId,
      "batch.submit",
      args.actorCapacity
    );
    const idempotencyKey = requiredIdempotencyKey(args.idempotencyKey);
    if (batch.state === "submitted") {
      if (batch.submitIdempotencyKey !== idempotencyKey) {
        throw new Error("The Cost Document batch submit key does not match.");
      }
      const drafts = await listBatchDrafts(ctx, batch._id);
      for (const draft of drafts) {
        assertDraftOwnershipScope(draft, batch, authorization);
      }
      const costDocumentIds = await requireSubmittedCostDocumentBatchReplay(
        ctx,
        authorization,
        batch,
        drafts
      );
      return {
        batchId: batch._id,
        costDocumentIds,
        replayed: true,
        revision: currentCostDocumentBatchRevision(batch),
      };
    }
    if (batch.state !== "active") {
      throw new Error("The Cost Document batch is no longer editable.");
    }
    assertExpectedCostDocumentBatchRevision(batch, args.expectedRevision);
    if (
      batch.submitIdempotencyKey &&
      batch.submitIdempotencyKey !== idempotencyKey
    ) {
      throw new Error(
        "The Cost Document batch already has another submit key."
      );
    }
    const drafts = await listBatchDrafts(ctx, batch._id);
    for (const draft of drafts) {
      assertDraftOwnershipScope(draft, batch, authorization);
    }
    if (drafts.length === 0) {
      throw new Error("A Cost Document batch requires at least one document.");
    }
    const uploaderEmail = await resolveCostDocumentUploaderEmail(
      ctx,
      authorization.viewer
    );
    // All validation runs before the first insert or asset publication. A
    // malformed member therefore cannot leave a partially submitted batch.
    const prepared: PreparedCostDocument[] = [];
    for (const draft of drafts) {
      prepared.push(
        await validateDraftForSubmission(ctx, authorization, draft)
      );
    }
    const totalPages = prepared.reduce(
      (total, document) => total + document.pages.length,
      0
    );
    const totalAllocations = prepared.reduce(
      (total, document) => total + document.allocations.length,
      0
    );
    const totalFinancialComponents = prepared.reduce(
      (total, document) => total + document.components.length,
      0
    );
    if (totalPages > MAX_BATCH_PAGES) {
      throw new Error(
        `A Cost Document batch supports at most ${MAX_BATCH_PAGES} source pages.`
      );
    }
    if (totalAllocations > MAX_BATCH_ALLOCATIONS) {
      throw new Error(
        `A Cost Document batch supports at most ${MAX_BATCH_ALLOCATIONS} allocations.`
      );
    }
    if (totalFinancialComponents > MAX_BATCH_FINANCIAL_COMPONENTS) {
      throw new Error(
        `A Cost Document batch supports at most ${MAX_BATCH_FINANCIAL_COMPONENTS} financial components.`
      );
    }
    const { duplicateAssessments, duplicateOverrideReason } =
      await validateBatchDuplicateAssessments(
        ctx,
        authorization,
        prepared,
        args.duplicateOverrideReason
      );
    const now = Date.now();
    const revision = currentCostDocumentBatchRevision(batch) + 1;
    const costDocumentIds: Id<"costDocuments">[] = [];
    for (const [index, document] of prepared.entries()) {
      const duplicateAssessment = duplicateAssessments[index];
      if (!duplicateAssessment) {
        throw new Error(
          "The Cost Document duplicate assessment is unavailable."
        );
      }
      const costDocumentId = await insertSubmittedCostDocument(
        ctx,
        authorization,
        {
          batchId: batch._id,
          draftId: document.draft._id,
          now,
          uploaderEmail,
          duplicateAssessment,
          duplicateOverrideReason,
          ...document,
        }
      );
      costDocumentIds.push(costDocumentId);
      if (document.draft.supersedesCostDocumentId) {
        await linkSubmittedCostDocumentCorrection(ctx, authorization, {
          costDocumentId,
          draft: document.draft,
          now,
        });
      }
      await ctx.db.patch(document.draft._id, {
        lifecycle: "submitted",
        revision: currentCostDocumentDraftRevision(document.draft) + 1,
        submittedCostDocumentId: costDocumentId,
        updatedAt: now,
        workingStateJson: undefined,
      });
    }
    await ctx.db.patch(batch._id, {
      revision,
      state: "submitted",
      submitIdempotencyKey: idempotencyKey,
      submittedAt: now,
      updatedAt: now,
    });
    await recordCostDocumentBatchAudit(ctx, authorization, {
      batchId: batch._id,
      command: "submitCostDocumentBatch",
      eventType: "cost_document.batch_submitted",
      newState: JSON.stringify({
        costDocumentIds,
        revision,
        state: "submitted",
      }),
      now,
      priorState: JSON.stringify({
        revision: currentCostDocumentBatchRevision(batch),
        state: batch.state,
      }),
    });
    return { batchId: batch._id, costDocumentIds, replayed: false, revision };
  })
  .public();

export const authorizeCostDocumentPageDownload = authenticatedMutation
  .input({
    ...activeBuildScopeFields,
    assetId: v.id("buildCollaborationAssets"),
    costDocumentId: v.id("costDocuments"),
  })
  .returns(
    v.union(
      v.object({
        fileName: v.string(),
        mimeType: v.string(),
        order: v.number(),
        status: v.literal("authorized"),
        storageId: v.id("_storage"),
      }),
      v.object({
        actionRequired: v.literal(true),
        kind: costDocumentIntegrityKindValidator,
        status: v.literal("integrity_exception"),
      })
    )
  )
  .handler(async (ctx, args) => {
    const authorization = await authorizeCostDocumentIntent(ctx, {
      ...args,
      intent: "submitted.read",
    });
    const document = await ctx.db.get(args.costDocumentId);
    if (
      !(
        isCostDocumentInScopeForAuthorization(document, authorization) &&
        (await canReadSubmittedCostDocument(ctx, authorization, document))
      )
    ) {
      throw new Error("The Cost Document is unavailable.");
    }
    const page = await ctx.db
      .query("costDocumentPages")
      .withIndex("by_costDocumentId_and_assetId", (query) =>
        query.eq("costDocumentId", document._id).eq("assetId", args.assetId)
      )
      .unique();
    if (
      !page ||
      page.costDocumentId !== document._id ||
      page.organizationId !== authorization.organizationId ||
      page.brokerageId !== authorization.brokerage._id ||
      page.buildId !== authorization.build._id
    ) {
      throw new Error("The Cost Document page is unavailable.");
    }
    const scopedAsset = await ctx.db.get(page.assetId);
    if (
      scopedAsset &&
      (scopedAsset.organizationId !== authorization.organizationId ||
        scopedAsset.brokerageId !== authorization.brokerage._id ||
        scopedAsset.buildId !== authorization.build._id)
    ) {
      throw new Error("The Cost Document page is unavailable.");
    }
    const integrity = await inspectCostDocumentPageIntegrity(
      ctx,
      authorization,
      document,
      page
    );
    if (integrity.kind) {
      await recordCostDocumentIntegrityException(ctx, authorization, document, {
        detectedHashSha256: integrity.asset?.contentHashSha256,
        kind: integrity.kind,
        page,
      });
      return {
        actionRequired: true as const,
        kind: integrity.kind,
        status: "integrity_exception" as const,
      };
    }
    const asset = integrity.asset;
    if (!asset) {
      throw new Error("The Cost Document page is unavailable.");
    }
    await ctx.db.insert("auditEvents", {
      actorKind: authorization.viewer.actorKind,
      actorRole: authorization.effectiveRole.role,
      actorRoles: authorization.viewer.roles,
      actorWorkosUserId: authorization.viewer.subject,
      brokerageId: authorization.brokerage._id,
      buildId: authorization.build._id,
      command: "authorizeCostDocumentPageDownload",
      createdAt: Date.now(),
      entityId: String(document._id),
      entityType: "costDocument",
      eventType: "cost_document.page_download_authorized",
      effectiveCapacity: authorization.effectiveRole.role,
      newState: JSON.stringify({
        assetId: asset._id,
        pageOrder: page.order,
      }),
      organizationId: authorization.organizationId,
      targetRevisions: [
        {
          entityId: String(document._id),
          entityType: "costDocument",
          revision: document.revisionNumber ?? 1,
        },
      ],
      warnings: [],
    });
    return {
      fileName: page.fileNameSnapshot,
      mimeType: page.mimeTypeSnapshot,
      order: page.order,
      status: "authorized" as const,
      storageId: asset.storageId,
    };
  })
  .internal();

export const recordCostDocumentPageDeliveryFailure = authenticatedMutation
  .input({
    ...activeBuildScopeFields,
    assetId: v.id("buildCollaborationAssets"),
    costDocumentId: v.id("costDocuments"),
    kind: v.union(v.literal("missing"), v.literal("unavailable")),
  })
  .returns(v.null())
  .handler(async (ctx, args) => {
    const authorization = await authorizeCostDocumentIntent(ctx, {
      ...args,
      intent: "submitted.read",
    });
    const document = await ctx.db.get(args.costDocumentId);
    if (
      !(
        isCostDocumentInScopeForAuthorization(document, authorization) &&
        (await canReadSubmittedCostDocument(ctx, authorization, document))
      )
    ) {
      throw new Error("The Cost Document is unavailable.");
    }
    const page = await ctx.db
      .query("costDocumentPages")
      .withIndex("by_costDocumentId_and_assetId", (query) =>
        query.eq("costDocumentId", document._id).eq("assetId", args.assetId)
      )
      .unique();
    if (
      !page ||
      page.organizationId !== authorization.organizationId ||
      page.brokerageId !== authorization.brokerage._id ||
      page.buildId !== authorization.build._id
    ) {
      throw new Error("The Cost Document page is unavailable.");
    }
    await recordCostDocumentIntegrityException(ctx, authorization, document, {
      kind: args.kind,
      page,
    });
    return null;
  })
  .internal();

type AuthorizedCostDocumentCtx = (QueryCtx | MutationCtx) & {
  viewer: ActiveBuildAuthorization["viewer"];
};

async function resolveCostDocumentUploaderEmail(
  ctx: MutationCtx,
  viewer: ActiveBuildAuthorization["viewer"]
) {
  const tokenEmail = normalizeContractorEmail(viewer.email);
  const projectedUsers = await ctx.db
    .query("users")
    .withIndex("by_workos_user_id", (query) =>
      query.eq("workosUserId", viewer.subject)
    )
    .take(2);
  const activeProjected = projectedUsers.filter(
    (user) => user.status !== "deleted"
  );
  const projectedUser =
    activeProjected.length === 1 ? activeProjected[0] : undefined;
  const projectedEmail = normalizeContractorEmail(projectedUser?.email);

  // Prefer the signed-in session email. WorkOS AuthKit places it on the
  // identity; projection emailVerified can lag or stay unset after webhooks.
  if (tokenEmail) {
    if (projectedEmail && projectedEmail !== tokenEmail) {
      throw new Error("WorkOS identity email verification is inconsistent.");
    }
    return tokenEmail;
  }

  if (activeProjected.length !== 1 || !projectedEmail) {
    throw new Error(
      activeProjected.length > 1
        ? "A uniquely projected, verified uploader email is required for the receipt."
        : "A verified uploader email is required for the receipt."
    );
  }
  return projectedEmail;
}

async function authorizeCostDocumentBuilder(
  ctx: AuthorizedCostDocumentCtx,
  input: {
    actorCapacity?: ActiveBuildAuthorization["effectiveRole"]["role"];
    buildId: Id<"activeBuilds">;
    organizationId: string;
  }
) {
  return await authorizeCostDocumentIntent(ctx, { ...input, intent: "create" });
}

async function authorizeCostDocumentVendorAccess(
  ctx: AuthorizedCostDocumentCtx,
  input: {
    actorCapacity?: ActiveBuildAuthorization["effectiveRole"]["role"];
    buildId: Id<"activeBuilds">;
    organizationId: string;
  }
) {
  return await authorizeCostDocumentIntent(ctx, {
    ...input,
    intent: "submitted.read",
  });
}

async function currentCostDocumentCreatorProfileId(
  ctx: QueryCtx | MutationCtx,
  authorization: ActiveBuildAuthorization
) {
  if (authorization.effectiveRole.role !== "contractor") {
    return;
  }
  return (
    await requireCurrentContractorCostDocumentScope(ctx, {
      authorization,
      purpose: "draft.write",
      workosUserId: authorization.viewer.subject,
    })
  ).contractorId;
}

async function requireCostDocumentBatchOwner(
  ctx: AuthorizedCostDocumentCtx,
  batchId: Id<"costDocumentBatches">,
  intent: "create" | "draft.read" | "batch.submit" = "draft.read",
  actorCapacity?: ActiveBuildAuthorization["effectiveRole"]["role"]
) {
  return await requireCostDocumentBatchCreator(ctx, {
    actorCapacity,
    batchId,
    intent,
  });
}

async function validateCostDocumentDraftStepTransition(
  ctx: MutationCtx,
  authorization: ActiveBuildAuthorization,
  draft: Doc<"costDocumentDrafts">,
  input: {
    complete?: boolean;
    step: Doc<"costDocumentDrafts">["activeStep"];
  }
) {
  const nextIndex = stepIndex(input.step);
  const currentIndex = stepIndex(draft.activeStep);
  if (input.complete) {
    if (
      draft.lifecycle !== "draft" ||
      draft.activeStep !== "freeze" ||
      input.step !== "freeze"
    ) {
      throw new Error(
        "A Cost Document can be completed only from an open draft at Freeze."
      );
    }
    await validateCompleteDraft(ctx, authorization, draft);
    return { currentIndex, nextIndex };
  }
  if (draft.lifecycle === "complete") {
    if (draft.activeStep === "freeze" && input.step === "share") {
      return { currentIndex, nextIndex };
    }
    throw new Error(
      "A completed Cost Document can reopen only from Freeze to Share."
    );
  }
  if (draft.lifecycle !== "draft") {
    throw new Error("The Cost Document draft is no longer editable.");
  }
  if (Math.abs(nextIndex - currentIndex) !== 1) {
    throw new Error(
      "A Cost Document can move only to an adjacent workflow step."
    );
  }
  if (nextIndex > currentIndex && nextIndex >= stepIndex("balance_allocate")) {
    await validateDraftCapture(ctx, authorization, draft);
  }
  if (nextIndex > currentIndex && nextIndex >= stepIndex("share")) {
    await validateDraftBalance(ctx, authorization, draft);
  }
  return { currentIndex, nextIndex };
}

/**
 * A submitted batch is idempotent only while its complete durable graph still
 * represents the frozen drafts. Do not return a successful replay merely
 * because the parent Cost Document rows remain: page, allocation, component,
 * source asset, and scope corruption must fail closed as well.
 */
async function requireSubmittedCostDocumentBatchReplay(
  ctx: MutationCtx,
  authorization: ActiveBuildAuthorization,
  batch: Doc<"costDocumentBatches">,
  drafts: Doc<"costDocumentDrafts">[]
): Promise<Id<"costDocuments">[]> {
  const submittedAt = batch.submittedAt;
  if (
    batch.state !== "submitted" ||
    submittedAt === undefined ||
    !isValidSubmissionTimestamp(submittedAt) ||
    drafts.length < 1 ||
    drafts.length > MAX_BATCH_DRAFTS
  ) {
    throwSubmittedCostDocumentReplayIncomplete();
  }
  assertExactSequentialOrders(drafts, MAX_BATCH_DRAFTS);

  const documents = await ctx.db
    .query("costDocuments")
    .withIndex("by_batchId", (query) => query.eq("batchId", batch._id))
    .order("asc")
    .take(MAX_BATCH_DRAFTS + 1);
  if (documents.length !== drafts.length) {
    throwSubmittedCostDocumentReplayIncomplete();
  }
  const documentsById = new Map(
    documents.map((document) => [String(document._id), document])
  );
  const costDocumentIds: Id<"costDocuments">[] = [];
  let totalPages = 0;
  let totalAllocations = 0;
  let totalFinancialComponents = 0;

  for (const draft of drafts) {
    if (
      draft.lifecycle !== "submitted" ||
      draft.activeStep !== "freeze" ||
      draft.completedAt === undefined ||
      !isValidSubmissionTimestamp(draft.completedAt) ||
      draft.completedAt > submittedAt ||
      !draft.submittedCostDocumentId
    ) {
      throwSubmittedCostDocumentReplayIncomplete();
    }
    const document = documentsById.get(String(draft.submittedCostDocumentId));
    if (!document) {
      throwSubmittedCostDocumentReplayIncomplete();
    }
    const documentsForDraft = await ctx.db
      .query("costDocuments")
      .withIndex("by_draftId", (query) => query.eq("draftId", draft._id))
      .take(2);
    if (
      documentsForDraft.length !== 1 ||
      documentsForDraft[0]?._id !== document._id
    ) {
      throwSubmittedCostDocumentReplayIncomplete();
    }
    const counts = await requireSubmittedCostDocumentReplay(
      ctx,
      authorization,
      batch,
      draft,
      document
    );
    totalPages += counts.pageCount;
    totalAllocations += counts.allocationCount;
    totalFinancialComponents += counts.financialComponentCount;
    costDocumentIds.push(document._id);
  }
  if (
    new Set(costDocumentIds).size !== drafts.length ||
    documents.some(
      (document) => !costDocumentIds.some((id) => id === document._id)
    ) ||
    totalPages > MAX_BATCH_PAGES ||
    totalAllocations > MAX_BATCH_ALLOCATIONS ||
    totalFinancialComponents > MAX_BATCH_FINANCIAL_COMPONENTS
  ) {
    throwSubmittedCostDocumentReplayIncomplete();
  }
  return costDocumentIds;
}

async function requireSubmittedCostDocumentReplay(
  ctx: MutationCtx,
  authorization: ActiveBuildAuthorization,
  batch: Doc<"costDocumentBatches">,
  draft: Doc<"costDocumentDrafts">,
  document: Doc<"costDocuments">
): Promise<{
  allocationCount: number;
  financialComponentCount: number;
  pageCount: number;
}> {
  if (
    document.state !== "submitted" ||
    document.batchId !== batch._id ||
    document.draftId !== draft._id ||
    document.organizationId !== authorization.organizationId ||
    document.brokerageId !== authorization.brokerage._id ||
    document.buildId !== authorization.build._id ||
    document.uploaderWorkosUserId !== draft.ownerWorkosUserId ||
    document.uploaderWorkosUserId !== authorization.viewer.subject ||
    document.contractorProfileId !== draft.contractorProfileId ||
    document.contractorProfileId !== batch.contractorProfileId ||
    document.submittedAt !== batch.submittedAt ||
    document.createdAt !== batch.submittedAt ||
    document.category !== draft.category ||
    document.kind !== draft.kind ||
    document.currency !== draft.currency ||
    document.title !== draft.title ||
    document.description !== draft.description ||
    document.vendorName !== draft.vendorName ||
    document.documentDate !== draft.documentDate ||
    document.grossTotalCents !== draft.grossTotalCents
  ) {
    throwSubmittedCostDocumentReplayIncomplete();
  }
  assertSubmittedReplayDocumentFacts(document);

  const [
    draftPages,
    submittedPages,
    draftAllocations,
    submittedAllocations,
    draftComponents,
    submittedComponents,
  ] = await Promise.all([
    ctx.db
      .query("costDocumentDraftPages")
      .withIndex("by_draftId_and_state_and_order", (query) =>
        query.eq("draftId", draft._id).eq("state", "active")
      )
      .order("asc")
      .take(MAX_PAGES + 1),
    ctx.db
      .query("costDocumentPages")
      .withIndex("by_costDocumentId_and_order", (query) =>
        query.eq("costDocumentId", document._id)
      )
      .order("asc")
      .take(MAX_PAGES + 1),
    ctx.db
      .query("costDocumentDraftAllocations")
      .withIndex("by_draftId_and_order", (query) =>
        query.eq("draftId", draft._id)
      )
      .order("asc")
      .take(MAX_ALLOCATIONS + 1),
    ctx.db
      .query("costDocumentAllocations")
      .withIndex("by_costDocumentId_and_order", (query) =>
        query.eq("costDocumentId", document._id)
      )
      .order("asc")
      .take(MAX_ALLOCATIONS + 1),
    ctx.db
      .query("costDocumentDraftFinancialComponents")
      .withIndex("by_draftId_and_order", (query) =>
        query.eq("draftId", draft._id)
      )
      .order("asc")
      .take(MAX_FINANCIAL_COMPONENTS + 1),
    ctx.db
      .query("costDocumentFinancialComponents")
      .withIndex("by_costDocumentId_and_order", (query) =>
        query.eq("costDocumentId", document._id)
      )
      .order("asc")
      .take(MAX_FINANCIAL_COMPONENTS + 1),
  ]);

  await assertSubmittedReplayPages(
    ctx,
    authorization,
    batch,
    draft,
    document,
    draftPages,
    submittedPages
  );
  await assertSubmittedReplayAllocations(
    ctx,
    authorization,
    batch,
    draft,
    document,
    draftAllocations,
    submittedAllocations
  );
  assertSubmittedReplayFinancialComponents(
    batch,
    draft,
    document,
    draftComponents,
    submittedComponents
  );
  return {
    allocationCount: submittedAllocations.length,
    financialComponentCount: submittedComponents.length,
    pageCount: submittedPages.length,
  };
}

async function assertSubmittedReplayPages(
  ctx: MutationCtx,
  authorization: ActiveBuildAuthorization,
  batch: Doc<"costDocumentBatches">,
  draft: Doc<"costDocumentDrafts">,
  document: Doc<"costDocuments">,
  draftPages: Doc<"costDocumentDraftPages">[],
  submittedPages: Doc<"costDocumentPages">[]
) {
  if (
    draftPages.length < 1 ||
    draftPages.length > MAX_PAGES ||
    submittedPages.length !== draftPages.length ||
    new Set(draftPages.map((page) => page.assetId)).size !== draftPages.length
  ) {
    throwSubmittedCostDocumentReplayIncomplete();
  }
  assertExactSequentialOrders(draftPages, MAX_PAGES);
  assertExactSequentialOrders(submittedPages, MAX_PAGES);
  for (const [index, draftPage] of draftPages.entries()) {
    const submittedPage = submittedPages[index];
    if (
      !submittedPage ||
      draftPage.draftId !== draft._id ||
      draftPage.batchId !== batch._id ||
      draftPage.organizationId !== authorization.organizationId ||
      draftPage.brokerageId !== authorization.brokerage._id ||
      draftPage.buildId !== authorization.build._id ||
      draftPage.state !== "active" ||
      draftPage.replacedAt !== undefined ||
      submittedPage.costDocumentId !== document._id ||
      submittedPage.organizationId !== authorization.organizationId ||
      submittedPage.brokerageId !== authorization.brokerage._id ||
      submittedPage.buildId !== authorization.build._id ||
      submittedPage.createdAt !== document.submittedAt ||
      submittedPage.order !== draftPage.order ||
      submittedPage.assetId !== draftPage.assetId
    ) {
      throwSubmittedCostDocumentReplayIncomplete();
    }
    const asset = await ctx.db.get(submittedPage.assetId);
    const storage = asset
      ? await ctx.db.system.get("_storage", asset.storageId)
      : null;
    const sourceDocument = document.supersedesCostDocumentId
      ? await ctx.db.get(document.supersedesCostDocumentId)
      : null;
    const sourcePage = sourceDocument
      ? await ctx.db
          .query("costDocumentPages")
          .withIndex("by_costDocumentId_and_assetId", (query) =>
            query
              .eq("costDocumentId", sourceDocument._id)
              .eq("assetId", submittedPage.assetId)
          )
          .unique()
      : null;
    const publicationMatches = Boolean(
      asset &&
        (asset.publishedAt === document.submittedAt ||
          (sourceDocument &&
            sourcePage &&
            sourceDocument.organizationId === authorization.organizationId &&
            sourceDocument.brokerageId === authorization.brokerage._id &&
            sourceDocument.buildId === authorization.build._id &&
            sourcePage.contentHashSha256Snapshot ===
              submittedPage.contentHashSha256Snapshot &&
            asset.publishedAt === sourceDocument.submittedAt))
    );
    if (
      !(asset && storage) ||
      asset.organizationId !== authorization.organizationId ||
      asset.brokerageId !== authorization.brokerage._id ||
      asset.buildId !== authorization.build._id ||
      asset.state !== "available" ||
      !isCleanCollaborationAsset(asset) ||
      !publicationMatches ||
      asset.fileName !== submittedPage.fileNameSnapshot ||
      asset.mimeType !== submittedPage.mimeTypeSnapshot ||
      asset.contentHashSha256 !== submittedPage.contentHashSha256Snapshot
    ) {
      throwSubmittedCostDocumentReplayIncomplete();
    }
  }
}

async function assertSubmittedReplayAllocations(
  ctx: MutationCtx,
  authorization: ActiveBuildAuthorization,
  batch: Doc<"costDocumentBatches">,
  draft: Doc<"costDocumentDrafts">,
  document: Doc<"costDocuments">,
  draftAllocations: Doc<"costDocumentDraftAllocations">[],
  submittedAllocations: Doc<"costDocumentAllocations">[]
) {
  if (
    draftAllocations.length < 1 ||
    draftAllocations.length > MAX_ALLOCATIONS ||
    submittedAllocations.length !== draftAllocations.length ||
    new Set(
      draftAllocations.map((allocation) => allocation.buildSubmilestoneId)
    ).size !== draftAllocations.length
  ) {
    throwSubmittedCostDocumentReplayIncomplete();
  }
  assertExactSequentialOrders(draftAllocations, MAX_ALLOCATIONS);
  assertExactSequentialOrders(submittedAllocations, MAX_ALLOCATIONS);
  let allocatedCents = 0;
  for (const [index, draftAllocation] of draftAllocations.entries()) {
    const submittedAllocation = submittedAllocations[index];
    if (
      !submittedAllocation ||
      draftAllocation.draftId !== draft._id ||
      draftAllocation.batchId !== batch._id ||
      draftAllocation.organizationId !== authorization.organizationId ||
      draftAllocation.brokerageId !== authorization.brokerage._id ||
      draftAllocation.buildId !== authorization.build._id ||
      submittedAllocation.costDocumentId !== document._id ||
      submittedAllocation.organizationId !== authorization.organizationId ||
      submittedAllocation.brokerageId !== authorization.brokerage._id ||
      submittedAllocation.buildId !== authorization.build._id ||
      submittedAllocation.createdAt !== document.submittedAt ||
      submittedAllocation.order !== draftAllocation.order ||
      submittedAllocation.amountCents !== draftAllocation.amountCents ||
      submittedAllocation.buildSubmilestoneId !==
        draftAllocation.buildSubmilestoneId ||
      submittedAllocation.submilestoneKeySnapshot !==
        draftAllocation.submilestoneKeySnapshot ||
      submittedAllocation.submilestoneNameSnapshot !==
        draftAllocation.submilestoneNameSnapshot
    ) {
      throwSubmittedCostDocumentReplayIncomplete();
    }
    if (
      !Number.isSafeInteger(submittedAllocation.amountCents) ||
      submittedAllocation.amountCents <= 0
    ) {
      throwSubmittedCostDocumentReplayIncomplete();
    }
    allocatedCents += submittedAllocation.amountCents;
    if (!Number.isSafeInteger(allocatedCents)) {
      throwSubmittedCostDocumentReplayIncomplete();
    }
    const submilestone = await ctx.db.get(
      submittedAllocation.buildSubmilestoneId
    );
    if (
      !submilestone ||
      submilestone.organizationId !== authorization.organizationId ||
      submilestone.brokerageId !== authorization.brokerage._id ||
      submilestone.buildId !== authorization.build._id
    ) {
      throwSubmittedCostDocumentReplayIncomplete();
    }
  }
  if (allocatedCents !== document.grossTotalCents) {
    throwSubmittedCostDocumentReplayIncomplete();
  }
}

function assertSubmittedReplayFinancialComponents(
  batch: Doc<"costDocumentBatches">,
  draft: Doc<"costDocumentDrafts">,
  document: Doc<"costDocuments">,
  draftComponents: Doc<"costDocumentDraftFinancialComponents">[],
  submittedComponents: Doc<"costDocumentFinancialComponents">[]
) {
  if (
    draftComponents.length > MAX_FINANCIAL_COMPONENTS ||
    submittedComponents.length !== draftComponents.length
  ) {
    throwSubmittedCostDocumentReplayIncomplete();
  }
  assertExactSequentialOrders(draftComponents, MAX_FINANCIAL_COMPONENTS);
  assertExactSequentialOrders(submittedComponents, MAX_FINANCIAL_COMPONENTS);
  for (const [index, draftComponent] of draftComponents.entries()) {
    const submittedComponent = submittedComponents[index];
    if (
      !submittedComponent ||
      draftComponent.draftId !== draft._id ||
      draftComponent.batchId !== batch._id ||
      draftComponent.organizationId !== document.organizationId ||
      draftComponent.brokerageId !== document.brokerageId ||
      draftComponent.buildId !== document.buildId ||
      submittedComponent.costDocumentId !== document._id ||
      submittedComponent.organizationId !== document.organizationId ||
      submittedComponent.brokerageId !== document.brokerageId ||
      submittedComponent.buildId !== document.buildId ||
      submittedComponent.createdAt !== document.submittedAt ||
      submittedComponent.order !== draftComponent.order ||
      submittedComponent.kind !== draftComponent.kind ||
      submittedComponent.label !== draftComponent.label ||
      submittedComponent.amountCents !== draftComponent.amountCents
    ) {
      throwSubmittedCostDocumentReplayIncomplete();
    }
  }
  try {
    const normalized = validateFinancialComponents(
      draftComponents.map((component) => ({
        amountCents: component.amountCents,
        kind: component.kind,
        label: component.label,
      }))
    );
    for (const [index, component] of normalized.entries()) {
      const draftComponent = draftComponents[index];
      if (
        !draftComponent ||
        component.amountCents !== draftComponent.amountCents ||
        component.kind !== draftComponent.kind ||
        component.label !== draftComponent.label ||
        component.order !== draftComponent.order
      ) {
        throwSubmittedCostDocumentReplayIncomplete();
      }
    }
    validateFinancialComponentsAgainstGross(
      normalized,
      document.grossTotalCents
    );
  } catch (error) {
    if (error instanceof Error && error.message === SUBMITTED_REPLAY_ERROR) {
      throw error;
    }
    throwSubmittedCostDocumentReplayIncomplete();
  }
}

function assertSubmittedReplayDocumentFacts(document: Doc<"costDocuments">) {
  try {
    requiredText(document.title, "Title", 240);
    requiredText(document.vendorName, "Vendor", 240);
    requiredDocumentDate(document.documentDate);
    optionalText(document.description, "Description", 4000);
    positiveCents(document.grossTotalCents, "Gross Document Total");
  } catch {
    throwSubmittedCostDocumentReplayIncomplete();
  }
}

function assertExactSequentialOrders(
  rows: { order: number }[],
  maxRows: number
) {
  if (
    rows.length > maxRows ||
    rows.some((row, index) => row.order !== index + 1)
  ) {
    throwSubmittedCostDocumentReplayIncomplete();
  }
}

function isValidSubmissionTimestamp(value: number | undefined) {
  return Number.isSafeInteger(value) && (value ?? 0) > 0;
}

const SUBMITTED_REPLAY_ERROR =
  "The submitted Cost Document batch is incomplete.";

function throwSubmittedCostDocumentReplayIncomplete(): never {
  throw new Error(SUBMITTED_REPLAY_ERROR);
}

function assertBatchOwnership(
  batch: Doc<"costDocumentBatches">,
  authorization: ActiveBuildAuthorization
) {
  if (!isBatchOwnedBy(batch, authorization)) {
    throw new Error("The Cost Document batch is unavailable.");
  }
}

async function findLegacyActiveCostDocumentBatch(
  ctx: QueryCtx | MutationCtx,
  input: {
    authorization: ActiveBuildAuthorization;
    contractorProfileId?: Id<"contractorProfiles">;
  }
) {
  const candidates = await ctx.db
    .query("costDocumentBatches")
    .withIndex(
      "by_buildId_and_ownerWorkosUserId_and_creatorCapacity_and_state",
      (query) =>
        query
          .eq("buildId", input.authorization.build._id)
          .eq("ownerWorkosUserId", input.authorization.viewer.subject)
          .eq("creatorCapacity", undefined)
          .eq("state", "active")
    )
    .order("desc")
    .take(6);
  if (candidates.length > 5) {
    throw new Error("The Cost Document batch is unavailable.");
  }
  const matches = candidates.filter(
    (candidate) =>
      candidate.contractorProfileId === input.contractorProfileId &&
      currentCostDocumentBatchCreatorCapacity(
        candidate,
        input.authorization
      ) === input.authorization.effectiveRole.role
  );
  if (matches.length > 1) {
    throw new Error("The Cost Document batch is unavailable.");
  }
  return matches[0] ?? null;
}

function isBatchOwnedBy(
  batch: Doc<"costDocumentBatches">,
  authorization: ActiveBuildAuthorization
) {
  return !(
    batch.organizationId !== authorization.organizationId ||
    batch.brokerageId !== authorization.brokerage._id ||
    batch.buildId !== authorization.build._id ||
    batch.ownerWorkosUserId !== authorization.viewer.subject
  );
}

function assertDraftOwnershipScope(
  draft: Doc<"costDocumentDrafts">,
  batch: Doc<"costDocumentBatches">,
  authorization: ActiveBuildAuthorization
) {
  if (
    draft.batchId !== batch._id ||
    draft.organizationId !== authorization.organizationId ||
    draft.brokerageId !== authorization.brokerage._id ||
    draft.buildId !== authorization.build._id ||
    draft.ownerWorkosUserId !== authorization.viewer.subject ||
    batch.organizationId !== draft.organizationId ||
    batch.brokerageId !== draft.brokerageId ||
    batch.buildId !== draft.buildId ||
    batch.ownerWorkosUserId !== draft.ownerWorkosUserId ||
    batch.contractorProfileId !== draft.contractorProfileId
  ) {
    throw new Error("The Cost Document draft is unavailable.");
  }
}

function assertDraftPageScope(
  page: Doc<"costDocumentDraftPages">,
  draft: Doc<"costDocumentDrafts">,
  authorization: ActiveBuildAuthorization
) {
  if (
    page.draftId !== draft._id ||
    page.batchId !== draft.batchId ||
    page.organizationId !== authorization.organizationId ||
    page.brokerageId !== authorization.brokerage._id ||
    page.buildId !== authorization.build._id
  ) {
    throw new Error("The Cost Document draft page is unavailable.");
  }
}

function assertDraftAllocationScope(
  allocation: Doc<"costDocumentDraftAllocations">,
  draft: Doc<"costDocumentDrafts">,
  authorization: ActiveBuildAuthorization
) {
  if (
    allocation.draftId !== draft._id ||
    allocation.batchId !== draft.batchId ||
    allocation.organizationId !== authorization.organizationId ||
    allocation.brokerageId !== authorization.brokerage._id ||
    allocation.buildId !== authorization.build._id
  ) {
    throw new Error("The Cost Document draft allocation is unavailable.");
  }
}

function assertDraftComponentScope(
  component: Doc<"costDocumentDraftFinancialComponents">,
  draft: Doc<"costDocumentDrafts">,
  authorization: ActiveBuildAuthorization
) {
  if (
    component.draftId !== draft._id ||
    component.batchId !== draft.batchId ||
    component.organizationId !== authorization.organizationId ||
    component.brokerageId !== authorization.brokerage._id ||
    component.buildId !== authorization.build._id
  ) {
    throw new Error(
      "The Cost Document draft financial component is unavailable."
    );
  }
}

function assertDraftPageMutationAllowed(draft: Doc<"costDocumentDrafts">) {
  if (draft.activeStep !== "capture_confirm" || draft.lifecycle !== "draft") {
    throw new Error(
      "Cost Document source pages can be changed only during Capture & confirm on an open draft."
    );
  }
}

async function listBatchDrafts(
  ctx: QueryCtx | MutationCtx,
  batchId: Id<"costDocumentBatches">
) {
  return await ctx.db
    .query("costDocumentDrafts")
    .withIndex("by_batchId_and_order", (query) => query.eq("batchId", batchId))
    .order("asc")
    .collect();
}

async function projectCostDocumentBatch(
  ctx: QueryCtx,
  batch: Doc<"costDocumentBatches">,
  authorization: ActiveBuildAuthorization
) {
  const drafts = await listBatchDrafts(ctx, batch._id);
  for (const draft of drafts) {
    assertDraftOwnershipScope(draft, batch, authorization);
  }
  // A collaborator's exact-Draft projection never traverses this batch path.
  // A qualifying Contractor creator can project the same eligible Builder-side
  // grant ledger, while homeowner-owned batches cannot create any grants.
  const canProjectCollaboration =
    batch.state === "active" &&
    canManageCostDocumentDraftCollaboration(authorization);
  const eligibleCollaborators = canProjectCollaboration
    ? await listEligibleCostDocumentDraftCollaborators(ctx, authorization)
    : [];
  return {
    _id: batch._id,
    drafts: await Promise.all(
      drafts.map(async (draft) => {
        const projected = await projectCostDocumentDraft(
          ctx,
          draft,
          authorization
        );
        const access = {
          authorization,
          batch,
          draft,
          mode: "creator" as const,
        };
        const currentCollaborators = canProjectCollaboration
          ? await listCurrentCostDocumentDraftCollaborators(ctx, {
              authorization,
              draft,
            })
          : [];
        return {
          ...projected,
          capabilities: costDocumentDraftCapabilities(access),
          collaboration: {
            currentCollaborators: currentCollaborators.map(
              ({ grantedAt, workosUserId }) => ({ grantedAt, workosUserId })
            ),
            eligibleCollaborators,
          },
          creator: { workosUserId: draft.ownerWorkosUserId },
          revision: currentCostDocumentDraftRevision(draft),
          self: { workosUserId: authorization.viewer.subject },
        };
      })
    ),
    idempotencyKey: batch.submitIdempotencyKey ?? batch.createIdempotencyKey,
    revision: currentCostDocumentBatchRevision(batch),
    state: batch.state,
    submittedAt: batch.submittedAt,
    supportingContextDisclosure: SUPPORTING_CONTEXT_DISCLOSURE,
  };
}

async function projectCostDocumentDraft(
  ctx: QueryCtx,
  draft: Doc<"costDocumentDrafts">,
  authorization: ActiveBuildAuthorization
) {
  const [pageRows, allocationRows, componentRows] = await Promise.all([
    ctx.db
      .query("costDocumentDraftPages")
      .withIndex("by_draftId_and_state_and_order", (query) =>
        query.eq("draftId", draft._id).eq("state", "active")
      )
      .order("asc")
      .take(MAX_PAGES + 1),
    ctx.db
      .query("costDocumentDraftAllocations")
      .withIndex("by_draftId_and_order", (query) =>
        query.eq("draftId", draft._id)
      )
      .order("asc")
      .take(MAX_ALLOCATIONS + 1),
    ctx.db
      .query("costDocumentDraftFinancialComponents")
      .withIndex("by_draftId_and_order", (query) =>
        query.eq("draftId", draft._id)
      )
      .order("asc")
      .take(MAX_FINANCIAL_COMPONENTS + 1),
  ]);
  for (const page of pageRows) {
    assertDraftPageScope(page, draft, authorization);
  }
  for (const allocation of allocationRows) {
    assertDraftAllocationScope(allocation, draft, authorization);
  }
  for (const component of componentRows) {
    assertDraftComponentScope(component, draft, authorization);
  }
  const pages = await Promise.all(
    pageRows.map(async (page) => {
      const asset = await ctx.db.get(page.assetId);
      if (
        !asset ||
        asset.organizationId !== authorization.organizationId ||
        asset.brokerageId !== authorization.brokerage._id ||
        asset.buildId !== authorization.build._id
      ) {
        throw new Error("The Cost Document draft source page is unavailable.");
      }
      return {
        assetId: page.assetId,
        contentHashSha256: asset.contentHashSha256,
        fileName: asset.fileName,
        mimeType: asset.mimeType,
        order: page.order,
        priorAssetId: page.priorAssetId,
        replacedAt: page.replacedAt,
      };
    })
  );
  return {
    _id: draft._id,
    activeStep: draft.activeStep,
    allocations: allocationRows.map((allocation) => ({
      amountCents: allocation.amountCents,
      buildSubmilestoneId: allocation.buildSubmilestoneId,
      order: allocation.order,
      submilestoneKey: allocation.submilestoneKeySnapshot,
      submilestoneName: allocation.submilestoneNameSnapshot,
    })),
    batchId: draft.batchId,
    category: draft.category,
    completedAt: draft.completedAt,
    currency: draft.currency,
    description: draft.description,
    documentDate: draft.documentDate,
    financialComponents: componentRows.map((component) => ({
      amountCents: component.amountCents,
      kind: component.kind,
      label: component.label,
      order: component.order,
    })),
    grossTotalCents: draft.grossTotalCents,
    kind: draft.kind,
    lifecycle: draft.lifecycle,
    order: draft.order,
    pages,
    submittedCostDocumentId: draft.submittedCostDocumentId,
    title: draft.title,
    vendorProfileId: draft.vendorProfileId,
    vendorName: draft.vendorName,
    workingStateJson: draft.workingStateJson,
  };
}

async function requireAvailableDraftSourcePages(
  ctx: MutationCtx,
  authorization: ActiveBuildAuthorization,
  input: {
    draft: Doc<"costDocumentDrafts">;
    now: number;
    pageAssetIds: Id<"buildCollaborationAssets">[];
  }
) {
  if (
    input.pageAssetIds.length > MAX_PAGES ||
    new Set(input.pageAssetIds).size !== input.pageAssetIds.length
  ) {
    throw new Error(
      `A Cost Document requires at most ${MAX_PAGES} unique pages.`
    );
  }
  const currentBound = await ctx.db
    .query("costDocumentDraftPages")
    .withIndex("by_draftId_and_state_and_order", (query) =>
      query.eq("draftId", input.draft._id).eq("state", "active")
    )
    .collect();
  for (const page of currentBound) {
    assertDraftPageScope(page, input.draft, authorization);
  }
  const boundAssetIds = new Set(currentBound.map((page) => page.assetId));
  const pages: Doc<"buildCollaborationAssets">[] = [];
  for (const assetId of input.pageAssetIds) {
    const asset = await ctx.db.get(assetId);
    if (
      !asset ||
      asset.organizationId !== authorization.organizationId ||
      asset.brokerageId !== authorization.brokerage._id ||
      asset.buildId !== authorization.build._id ||
      asset.state !== "available" ||
      !isCleanCollaborationAsset(asset) ||
      !(await hasCostDocumentDraftSourceAuthority(ctx, authorization, {
        asset,
        draft: input.draft,
        isAlreadyBound: boundAssetIds.has(assetId),
        now: input.now,
      }))
    ) {
      throw new Error(
        "Every Cost Document draft source page must be available."
      );
    }
    pages.push(asset);
  }
  return pages;
}

async function hasCostDocumentDraftSourceAuthority(
  ctx: MutationCtx,
  authorization: ActiveBuildAuthorization,
  input: {
    asset: Doc<"buildCollaborationAssets">;
    draft: Doc<"costDocumentDrafts">;
    isAlreadyBound: boolean;
    now: number;
  }
) {
  const supersedesId = input.draft.supersedesCostDocumentId;
  if (supersedesId && input.isAlreadyBound && input.asset.publishedAt) {
    const sourcePage = await ctx.db
      .query("costDocumentPages")
      .withIndex("by_costDocumentId_and_assetId", (query) =>
        query.eq("costDocumentId", supersedesId).eq("assetId", input.asset._id)
      )
      .unique();
    if (
      sourcePage &&
      sourcePage.organizationId === authorization.organizationId &&
      sourcePage.brokerageId === authorization.brokerage._id &&
      sourcePage.buildId === authorization.build._id &&
      sourcePage.contentHashSha256Snapshot === input.asset.contentHashSha256
    ) {
      return true;
    }
  }
  if (input.asset.publishedAt) {
    return false;
  }
  const session = input.asset.stagingSessionId
    ? await ctx.db.get(input.asset.stagingSessionId)
    : null;
  if (
    !session ||
    session.organizationId !== authorization.organizationId ||
    session.brokerageId !== authorization.brokerage._id ||
    session.buildId !== authorization.build._id ||
    session.contextKind !== "costDocumentDraft" ||
    session.contextRecordId !== String(input.draft._id)
  ) {
    return false;
  }
  if (input.isAlreadyBound && session.state === "consumed") {
    return true;
  }
  return (
    session.state === "finalized" &&
    session.expiresAt > input.now &&
    session.ownerWorkosUserId === authorization.viewer.subject
  );
}

async function replaceDraftPages(
  ctx: MutationCtx,
  authorization: ActiveBuildAuthorization,
  draft: Doc<"costDocumentDrafts">,
  pages: Doc<"buildCollaborationAssets">[],
  now: number
) {
  const current = await ctx.db
    .query("costDocumentDraftPages")
    .withIndex("by_draftId_and_state_and_order", (query) =>
      query.eq("draftId", draft._id).eq("state", "active")
    )
    .collect();
  for (const page of current) {
    assertDraftPageScope(page, draft, authorization);
  }
  const currentByOrder = new Map(current.map((page) => [page.order, page]));
  await markReplacedDraftPages(ctx, current, pages, now);
  await insertDraftPageReplacements(
    ctx,
    authorization,
    draft,
    pages,
    currentByOrder,
    now
  );
  await retireReplacedDraftAssets(
    ctx,
    authorization,
    draft,
    current,
    pages,
    now
  );
  await consumeDraftPageSessions(ctx, pages, now);
}

async function markReplacedDraftPages(
  ctx: MutationCtx,
  current: Doc<"costDocumentDraftPages">[],
  pages: Doc<"buildCollaborationAssets">[],
  now: number
) {
  for (const oldPage of current) {
    if (pages[oldPage.order - 1]?._id === oldPage.assetId) {
      continue;
    }
    await ctx.db.patch(oldPage._id, {
      replacedAt: now,
      state: "replaced",
    });
  }
}

async function insertDraftPageReplacements(
  ctx: MutationCtx,
  authorization: ActiveBuildAuthorization,
  draft: Doc<"costDocumentDrafts">,
  pages: Doc<"buildCollaborationAssets">[],
  currentByOrder: Map<number, Doc<"costDocumentDraftPages">>,
  now: number
) {
  for (const [index, asset] of pages.entries()) {
    const order = index + 1;
    const oldPage = currentByOrder.get(order);
    if (oldPage?.assetId === asset._id) {
      continue;
    }
    await ctx.db.insert("costDocumentDraftPages", {
      assetId: asset._id,
      batchId: draft.batchId,
      brokerageId: authorization.brokerage._id,
      buildId: authorization.build._id,
      createdAt: now,
      draftId: draft._id,
      order,
      priorAssetId: oldPage?.assetId,
      organizationId: authorization.organizationId,
      state: "active",
    });
  }
}

async function retireReplacedDraftAssets(
  ctx: MutationCtx,
  authorization: ActiveBuildAuthorization,
  draft: Doc<"costDocumentDrafts">,
  current: Doc<"costDocumentDraftPages">[],
  pages: Doc<"buildCollaborationAssets">[],
  now: number
) {
  const desiredAssetIds = new Set(pages.map((page) => page._id));
  for (const oldPage of current) {
    if (desiredAssetIds.has(oldPage.assetId)) {
      continue;
    }
    const references = await ctx.db
      .query("costDocumentDraftPages")
      .withIndex("by_assetId_and_state", (query) =>
        query.eq("assetId", oldPage.assetId).eq("state", "active")
      )
      .take(2);
    if (references.length > 0) {
      continue;
    }
    const asset = await ctx.db.get(oldPage.assetId);
    const session = asset?.stagingSessionId
      ? await ctx.db.get(asset.stagingSessionId)
      : null;
    if (asset && session && !asset.publishedAt) {
      await abandonUnpublishedCostDocumentDraftAsset(ctx, authorization, {
        asset,
        draftId: draft._id,
        now,
        reason: "Replaced by another Cost Document source page.",
        session,
      });
    }
  }
}

async function consumeDraftPageSessions(
  ctx: MutationCtx,
  pages: Doc<"buildCollaborationAssets">[],
  now: number
) {
  for (const asset of pages) {
    const session = asset.stagingSessionId
      ? await ctx.db.get(asset.stagingSessionId)
      : null;
    if (session?.state === "finalized") {
      await ctx.db.patch(session._id, { state: "consumed", updatedAt: now });
    }
  }
}

async function validateDraftAllocations(
  ctx: MutationCtx,
  authorization: ActiveBuildAuthorization,
  allocations: {
    amountCents: number;
    buildSubmilestoneId: Id<"buildSubmilestones">;
  }[]
) {
  if (
    allocations.length > MAX_ALLOCATIONS ||
    new Set(allocations.map((allocation) => allocation.buildSubmilestoneId))
      .size !== allocations.length
  ) {
    throw new Error(
      `A Cost Document requires at most ${MAX_ALLOCATIONS} unique Cost Allocations.`
    );
  }
  const result: {
    amountCents: number;
    submilestone: Doc<"buildSubmilestones">;
  }[] = [];
  for (const allocation of allocations) {
    const amountCents = positiveCents(
      allocation.amountCents,
      "Cost Allocation amount"
    );
    const submilestone = await ctx.db.get(allocation.buildSubmilestoneId);
    if (
      !submilestone ||
      submilestone.organizationId !== authorization.organizationId ||
      submilestone.brokerageId !== authorization.brokerage._id ||
      submilestone.buildId !== authorization.build._id
    ) {
      throw new Error("Cost Allocation Sub-milestone is unavailable.");
    }
    result.push({ amountCents, submilestone });
  }
  return result;
}

function validateFinancialComponents(
  components: {
    amountCents: number;
    kind: "subtotal" | "tax" | "fee" | "discount";
    label?: string;
  }[]
) {
  if (components.length > MAX_FINANCIAL_COMPONENTS) {
    throw new Error(
      `At most ${MAX_FINANCIAL_COMPONENTS} financial components are allowed.`
    );
  }
  let subtotalCount = 0;
  return components
    .map((component) => {
      const amountCents = positiveCents(
        component.amountCents,
        "Financial component amount"
      );
      if (component.kind === "subtotal") {
        subtotalCount += 1;
      }
      if (
        component.label !== undefined &&
        component.label.trim().length > 240
      ) {
        throw new Error(
          "Financial component label must be at most 240 characters."
        );
      }
      return {
        amountCents,
        kind: component.kind,
        label: component.label?.trim() || undefined,
      };
    })
    .map((component, index, all) => {
      if (all.length > 0 && subtotalCount !== 1) {
        throw new Error(
          "Financial reconciliation requires exactly one subtotal."
        );
      }
      return { ...component, order: index + 1 };
    });
}

async function replaceDraftAllocations(
  ctx: MutationCtx,
  authorization: ActiveBuildAuthorization,
  draft: Doc<"costDocumentDrafts">,
  allocations: {
    amountCents: number;
    submilestone: Doc<"buildSubmilestones">;
  }[],
  now: number
) {
  const existing = await ctx.db
    .query("costDocumentDraftAllocations")
    .withIndex("by_draftId_and_order", (query) =>
      query.eq("draftId", draft._id)
    )
    .collect();
  for (const allocation of existing) {
    if (
      allocation.batchId !== draft.batchId ||
      allocation.organizationId !== authorization.organizationId ||
      allocation.brokerageId !== authorization.brokerage._id ||
      allocation.buildId !== authorization.build._id
    ) {
      throw new Error("The Cost Document draft allocation is unavailable.");
    }
  }
  await Promise.all(
    existing.map((allocation) => ctx.db.delete(allocation._id))
  );
  for (const [index, allocation] of allocations.entries()) {
    await ctx.db.insert("costDocumentDraftAllocations", {
      amountCents: allocation.amountCents,
      batchId: draft.batchId,
      brokerageId: authorization.brokerage._id,
      buildId: authorization.build._id,
      buildSubmilestoneId: allocation.submilestone._id,
      createdAt: now,
      draftId: draft._id,
      order: index + 1,
      organizationId: authorization.organizationId,
      submilestoneKeySnapshot: allocation.submilestone.key,
      submilestoneNameSnapshot: allocation.submilestone.name,
    });
  }
}

async function replaceDraftFinancialComponents(
  ctx: MutationCtx,
  authorization: ActiveBuildAuthorization,
  draft: Doc<"costDocumentDrafts">,
  components: {
    amountCents: number;
    kind: "subtotal" | "tax" | "fee" | "discount";
    label?: string;
    order: number;
  }[],
  now: number
) {
  const existing = await ctx.db
    .query("costDocumentDraftFinancialComponents")
    .withIndex("by_draftId_and_order", (query) =>
      query.eq("draftId", draft._id)
    )
    .collect();
  for (const component of existing) {
    if (
      component.batchId !== draft.batchId ||
      component.organizationId !== authorization.organizationId ||
      component.brokerageId !== authorization.brokerage._id ||
      component.buildId !== authorization.build._id
    ) {
      throw new Error(
        "The Cost Document draft financial component is unavailable."
      );
    }
  }
  await Promise.all(existing.map((component) => ctx.db.delete(component._id)));
  for (const component of components) {
    await ctx.db.insert("costDocumentDraftFinancialComponents", {
      amountCents: component.amountCents,
      batchId: draft.batchId,
      brokerageId: authorization.brokerage._id,
      buildId: authorization.build._id,
      createdAt: now,
      draftId: draft._id,
      kind: component.kind,
      label: component.label,
      order: component.order,
      organizationId: authorization.organizationId,
    });
  }
}

async function validateDraftCapture(
  ctx: MutationCtx,
  authorization: ActiveBuildAuthorization,
  draft: Doc<"costDocumentDrafts">
) {
  await requiredDraftFacts(ctx, authorization, draft);
  const pages = await currentDraftPages(ctx, draft);
  if (pages.length < 1 || pages.length > MAX_PAGES) {
    throw new Error(`A Cost Document requires 1-${MAX_PAGES} source pages.`);
  }
  for (const page of pages) {
    if (
      page.batchId !== draft.batchId ||
      page.organizationId !== authorization.organizationId ||
      page.brokerageId !== authorization.brokerage._id ||
      page.buildId !== authorization.build._id
    ) {
      throw new Error("The Cost Document draft page is unavailable.");
    }
  }
  await requireAvailableDraftSourcePages(ctx, authorization, {
    draft,
    now: Date.now(),
    pageAssetIds: pages.map((page) => page.assetId),
  });
  return pages;
}

async function validateDraftBalance(
  ctx: MutationCtx,
  authorization: ActiveBuildAuthorization,
  draft: Doc<"costDocumentDrafts">
) {
  await validateDraftCapture(ctx, authorization, draft);
  const allocations = await currentDraftAllocations(ctx, draft);
  const grossTotalCents = positiveCents(
    draft.grossTotalCents ?? 0,
    "Gross Document Total"
  );
  if (allocations.length < 1) {
    throw new Error("A Cost Document requires at least one Cost Allocation.");
  }
  let allocatedCents = 0;
  for (const allocation of allocations) {
    if (
      allocation.batchId !== draft.batchId ||
      allocation.organizationId !== authorization.organizationId ||
      allocation.brokerageId !== authorization.brokerage._id ||
      allocation.buildId !== authorization.build._id
    ) {
      throw new Error("The Cost Document draft allocation is unavailable.");
    }
    allocatedCents += positiveCents(
      allocation.amountCents,
      "Cost Allocation amount"
    );
    if (!Number.isSafeInteger(allocatedCents)) {
      throw new Error("Cost Allocation total exceeds safe integer cents.");
    }
    const submilestone = await ctx.db.get(allocation.buildSubmilestoneId);
    if (
      !submilestone ||
      submilestone.organizationId !== authorization.organizationId ||
      submilestone.brokerageId !== authorization.brokerage._id ||
      submilestone.buildId !== authorization.build._id
    ) {
      throw new Error("Cost Allocation Sub-milestone is unavailable.");
    }
  }
  // Recheck the persisted graph immediately before completion/submission. This
  // is intentionally separate from the mutation-entry guard so an assignment
  // that goes stale between Draft saves cannot be carried into an immutable
  // submitted Cost Document.
  await assertCurrentCostDocumentAllocationScope(ctx, {
    allocationSubmilestoneIds: allocations.map(
      (allocation) => allocation.buildSubmilestoneId
    ),
    authorization,
    contractorProfileId: draft.contractorProfileId,
    ownerWorkosUserId: draft.ownerWorkosUserId,
    purpose: "draft.write",
  });
  if (allocatedCents !== grossTotalCents) {
    throw new Error(
      "Cost Allocations must equal the Gross Document Total exactly."
    );
  }
  const components = await currentDraftFinancialComponents(ctx, draft);
  for (const component of components) {
    if (
      component.batchId !== draft.batchId ||
      component.organizationId !== authorization.organizationId ||
      component.brokerageId !== authorization.brokerage._id ||
      component.buildId !== authorization.build._id
    ) {
      throw new Error(
        "The Cost Document draft financial component is unavailable."
      );
    }
  }
  validateFinancialComponentsAgainstGross(components, grossTotalCents);
  return { allocations, components, grossTotalCents };
}

async function validateCompleteDraft(
  ctx: MutationCtx,
  authorization: ActiveBuildAuthorization,
  draft: Doc<"costDocumentDrafts">
) {
  await validateDraftBalance(ctx, authorization, draft);
}

async function validateDraftForSubmission(
  ctx: MutationCtx,
  authorization: ActiveBuildAuthorization,
  draft: Doc<"costDocumentDrafts">
) {
  if (draft.lifecycle !== "complete" || draft.activeStep !== "freeze") {
    throw new Error(
      "Every Cost Document must be complete at Freeze before batch submission."
    );
  }
  const pages = await validateDraftCapture(ctx, authorization, draft);
  const balance = await validateDraftBalance(ctx, authorization, draft);
  const facts = await requiredDraftFacts(ctx, authorization, draft);
  const allocations = [] as {
    amountCents: number;
    submilestone: Doc<"buildSubmilestones">;
  }[];
  for (const allocation of balance.allocations) {
    allocations.push({
      amountCents: allocation.amountCents,
      submilestone: await awaitSubmilestone(
        ctx,
        allocation.buildSubmilestoneId
      ),
    });
  }
  return {
    allocations,
    category: draft.category,
    components: balance.components,
    description: draft.description,
    documentDate: facts.documentDate,
    draft,
    grossTotalCents: balance.grossTotalCents,
    kind: draft.kind,
    pages: await resolveDraftAssets(ctx, authorization, pages),
    title: facts.title,
    vendorProfileId: facts.vendorProfileId,
    vendorName: facts.vendorName,
  };
}

async function awaitSubmilestone(
  ctx: MutationCtx,
  submilestoneId: Id<"buildSubmilestones">
) {
  const submilestone = await ctx.db.get(submilestoneId);
  if (!submilestone) {
    throw new Error("Cost Allocation Sub-milestone is unavailable.");
  }
  return submilestone;
}

async function requiredDraftFacts(
  ctx: QueryCtx | MutationCtx,
  authorization: ActiveBuildAuthorization,
  draft: Doc<"costDocumentDrafts">
) {
  // New capture writes a durable profile link. The name-only branch is kept
  // for historical drafts and stale clients so their records remain usable as
  // explicit unresolved legacy vendor text until a linked party is selected.
  if (draft.vendorProfileId) {
    try {
      const profile = await requireActiveCostDocumentVendorProfile(
        ctx,
        authorization,
        draft.vendorProfileId
      );
      return {
        documentDate: requiredDocumentDate(draft.documentDate ?? ""),
        title: requiredText(draft.title ?? "", "Title", 240),
        vendorName: profile.name,
        vendorProfileId: profile._id,
      };
    } catch {
      // A stale or retired profile link remains usable as explicit unresolved
      // legacy text until a current party is selected.
    }
  }
  return {
    documentDate: requiredDocumentDate(draft.documentDate ?? ""),
    title: requiredText(draft.title ?? "", "Title", 240),
    vendorName: requiredText(draft.vendorName ?? "", "Vendor", 240),
    vendorProfileId: undefined,
  };
}

async function currentDraftPages(
  ctx: QueryCtx | MutationCtx,
  draft: Doc<"costDocumentDrafts">
) {
  return await ctx.db
    .query("costDocumentDraftPages")
    .withIndex("by_draftId_and_state_and_order", (query) =>
      query.eq("draftId", draft._id).eq("state", "active")
    )
    .order("asc")
    .collect();
}

async function currentDraftAllocations(
  ctx: QueryCtx | MutationCtx,
  draft: Doc<"costDocumentDrafts">
) {
  return await ctx.db
    .query("costDocumentDraftAllocations")
    .withIndex("by_draftId_and_order", (query) =>
      query.eq("draftId", draft._id)
    )
    .order("asc")
    .collect();
}

async function currentDraftFinancialComponents(
  ctx: QueryCtx | MutationCtx,
  draft: Doc<"costDocumentDrafts">
) {
  return await ctx.db
    .query("costDocumentDraftFinancialComponents")
    .withIndex("by_draftId_and_order", (query) =>
      query.eq("draftId", draft._id)
    )
    .order("asc")
    .collect();
}

async function resolveDraftAssets(
  ctx: QueryCtx | MutationCtx,
  authorization: ActiveBuildAuthorization,
  pages: Doc<"costDocumentDraftPages">[]
) {
  const assets: Doc<"buildCollaborationAssets">[] = [];
  for (const page of pages) {
    const asset = await ctx.db.get(page.assetId);
    if (
      !asset ||
      asset.organizationId !== authorization.organizationId ||
      asset.brokerageId !== authorization.brokerage._id ||
      asset.buildId !== authorization.build._id
    ) {
      throw new Error(
        "Every Cost Document draft source page must be available."
      );
    }
    assets.push(asset);
  }
  return assets;
}

function validateFinancialComponentsAgainstGross(
  components: {
    amountCents: number;
    kind: "subtotal" | "tax" | "fee" | "discount";
  }[],
  grossTotalCents: number
) {
  if (components.length === 0) {
    return;
  }
  let subtotal = 0;
  let taxAndFees = 0;
  let discounts = 0;
  for (const component of components) {
    if (component.kind === "subtotal") {
      subtotal += component.amountCents;
    } else if (component.kind === "discount") {
      discounts += component.amountCents;
    } else {
      taxAndFees += component.amountCents;
    }
  }
  if (subtotal + taxAndFees - discounts !== grossTotalCents) {
    throw new Error(
      "Financial components must reconcile to the Gross Document Total exactly."
    );
  }
}

type PreparedCostDocument = Awaited<
  ReturnType<typeof validateDraftForSubmission>
>;

async function insertSubmittedCostDocument(
  ctx: MutationCtx,
  authorization: ActiveBuildAuthorization,
  input: PreparedCostDocument & {
    batchId: Id<"costDocumentBatches">;
    draftId: Id<"costDocumentDrafts">;
    duplicateAssessment: Awaited<
      ReturnType<typeof assessCostDocumentDuplicates>
    >;
    duplicateOverrideReason?: string;
    now: number;
    uploaderEmail: string;
  }
) {
  const costDocumentId = await ctx.db.insert("costDocuments", {
    batchId: input.batchId,
    brokerageId: authorization.brokerage._id,
    buildId: authorization.build._id,
    category: input.category,
    contractorProfileId: input.draft.contractorProfileId,
    createdAt: input.now,
    currency: "CAD",
    description: input.description,
    documentDate: input.documentDate,
    draftId: input.draftId,
    duplicateOverrideReason:
      input.duplicateAssessment.likelyDuplicateCostDocumentIds.length > 0
        ? input.duplicateOverrideReason
        : undefined,
    grossTotalCents: input.grossTotalCents,
    kind: input.kind,
    likelyDuplicateFingerprint:
      input.duplicateAssessment.likelyDuplicateFingerprint,
    organizationId: authorization.organizationId,
    revisionNumber: input.duplicateAssessment.revisionNumber,
    sourceHashDigest: input.duplicateAssessment.sourceHashDigest,
    state: "submitted",
    submittedAt: input.now,
    supersedesCostDocumentId: input.draft.supersedesCostDocumentId,
    title: input.title,
    uploaderEmailSnapshot: input.uploaderEmail,
    uploaderWorkosUserId: authorization.viewer.subject,
    vendorProfileId: input.vendorProfileId,
    vendorName: input.vendorName,
  });
  for (const [index, asset] of input.pages.entries()) {
    await ctx.db.insert("costDocumentPages", {
      assetId: asset._id,
      brokerageId: authorization.brokerage._id,
      buildId: authorization.build._id,
      contentHashSha256Snapshot: requiredAssetHash(asset),
      costDocumentId,
      createdAt: input.now,
      fileNameSnapshot: asset.fileName,
      mimeTypeSnapshot: asset.mimeType,
      order: index + 1,
      organizationId: authorization.organizationId,
    });
    if (asset.publishedAt === undefined) {
      await ctx.db.patch(asset._id, { publishedAt: input.now });
    }
  }
  for (const [index, allocation] of input.allocations.entries()) {
    await ctx.db.insert("costDocumentAllocations", {
      amountCents: allocation.amountCents,
      brokerageId: authorization.brokerage._id,
      buildId: authorization.build._id,
      buildSubmilestoneId: allocation.submilestone._id,
      costDocumentId,
      createdAt: input.now,
      order: index + 1,
      organizationId: authorization.organizationId,
      submilestoneKeySnapshot: allocation.submilestone.key,
      submilestoneNameSnapshot: allocation.submilestone.name,
    });
  }
  for (const component of input.components) {
    await ctx.db.insert("costDocumentFinancialComponents", {
      amountCents: component.amountCents,
      brokerageId: authorization.brokerage._id,
      buildId: authorization.build._id,
      costDocumentId,
      createdAt: input.now,
      kind: component.kind,
      label: component.label,
      order: component.order,
      organizationId: authorization.organizationId,
    });
  }
  await ctx.db.insert("auditEvents", {
    actorKind: authorization.viewer.actorKind,
    actorRole: authorization.effectiveRole.role,
    actorRoles: authorization.viewer.roles,
    actorWorkosUserId: authorization.viewer.subject,
    brokerageId: authorization.brokerage._id,
    buildId: authorization.build._id,
    command: "submitCostDocumentBatch",
    createdAt: input.now,
    entityId: String(costDocumentId),
    entityType: "costDocument",
    effectiveCapacity: authorization.effectiveRole.role,
    eventType: "cost_document.submitted",
    newState: JSON.stringify({
      allocationCount: input.allocations.length,
      allocationTotalCents: input.allocations.reduce(
        (total, allocation) => total + allocation.amountCents,
        0
      ),
      batchId: input.batchId,
      category: input.category,
      currency: "CAD",
      draftId: input.draftId,
      grossTotalCents: input.grossTotalCents,
      kind: input.kind,
      pageCount: input.pages.length,
      revisionNumber: input.duplicateAssessment.revisionNumber,
      state: "submitted",
      supersedesCostDocumentId: input.draft.supersedesCostDocumentId,
    }),
    organizationId: authorization.organizationId,
    targetRevisions: [
      {
        entityId: String(costDocumentId),
        entityType: "costDocument",
        revision: input.duplicateAssessment.revisionNumber,
      },
    ],
    warnings:
      input.duplicateAssessment.likelyDuplicateCostDocumentIds.length > 0
        ? [
            `Likely duplicate override: ${input.duplicateOverrideReason ?? "unspecified"}`,
          ]
        : [],
  });
  await ctx.db.insert("eventOutbox", {
    brokerageId: authorization.brokerage._id,
    createdAt: input.now,
    eventType: "cost_document.submitted",
    organizationId: authorization.organizationId,
    payloadPreview: JSON.stringify({
      batchId: input.batchId,
      buildId: authorization.build._id,
      draftId: input.draftId,
      grossTotalCents: input.grossTotalCents,
      state: "submitted",
    }),
    relatedEntityId: String(costDocumentId),
    relatedEntityType: "costDocument",
    status: "pending",
  });
  await enqueueCommunicationIntent(ctx, {
    brokerageId: authorization.brokerage._id,
    buildId: authorization.build._id,
    kind: "cost_document_receipt",
    idempotencyKey: `cost-document:${costDocumentId}:submitted-receipt`,
    organizationId: authorization.organizationId,
    payloadSnapshot: JSON.stringify({
      grossTotalCents: input.grossTotalCents,
      kind: input.kind,
      supportingContextDisclosure: SUPPORTING_CONTEXT_DISCLOSURE,
      title: input.title,
    }),
    recipientEmailSnapshot: input.uploaderEmail,
    relatedEntityId: String(costDocumentId),
    relatedEntityType: "costDocument",
    templateKey: "cost_document_upload_receipt_v1",
  });
  return costDocumentId;
}

async function recordCostDocumentBatchAudit(
  ctx: MutationCtx,
  authorization: ActiveBuildAuthorization,
  input: {
    batchId: Id<"costDocumentBatches">;
    command: string;
    eventType: string;
    newState?: string;
    now: number;
    priorState?: string;
  }
) {
  await ctx.db.insert("auditEvents", {
    actorKind: authorization.viewer.actorKind,
    actorRole: authorization.effectiveRole.role,
    actorRoles: authorization.viewer.roles,
    actorWorkosUserId: authorization.viewer.subject,
    brokerageId: authorization.brokerage._id,
    buildId: authorization.build._id,
    command: input.command,
    createdAt: input.now,
    entityId: String(input.batchId),
    entityType: "costDocumentBatch",
    effectiveCapacity: authorization.effectiveRole.role,
    eventType: input.eventType,
    newState: input.newState,
    organizationId: authorization.organizationId,
    priorState: input.priorState,
    targetRevisions: [
      { entityId: String(input.batchId), entityType: "costDocumentBatch" },
    ],
    warnings: [],
  });
}

async function costDocumentFinancialAuditSummary(
  ctx: QueryCtx | MutationCtx,
  authorization: ActiveBuildAuthorization,
  document: Doc<"costDocuments">
) {
  const allocations = await ctx.db
    .query("costDocumentAllocations")
    .withIndex("by_costDocumentId_and_order", (query) =>
      query.eq("costDocumentId", document._id)
    )
    .take(MAX_ALLOCATIONS + 1);
  if (
    allocations.length < 1 ||
    allocations.length > MAX_ALLOCATIONS ||
    allocations.some(
      (allocation) =>
        allocation.organizationId !== authorization.organizationId ||
        allocation.brokerageId !== authorization.brokerage._id ||
        allocation.buildId !== authorization.build._id
    )
  ) {
    throw new Error(
      "The Cost Document financial audit summary is unavailable."
    );
  }
  return {
    allocationCount: allocations.length,
    allocationTotalCents: allocations.reduce(
      (total, allocation) => total + allocation.amountCents,
      0
    ),
    grossTotalCents: document.grossTotalCents,
    revision: document.revisionNumber ?? 1,
  };
}

async function recordCostDocumentAudit(
  ctx: MutationCtx,
  authorization: ActiveBuildAuthorization,
  costDocumentId: Id<"costDocuments">,
  input: {
    command: string;
    eventType: string;
    newState?: string;
    now: number;
    priorState?: string;
  }
) {
  await ctx.db.insert("auditEvents", {
    actorKind: authorization.viewer.actorKind,
    actorRole: authorization.effectiveRole.role,
    actorRoles: authorization.viewer.roles,
    actorWorkosUserId: authorization.viewer.subject,
    brokerageId: authorization.brokerage._id,
    buildId: authorization.build._id,
    command: input.command,
    createdAt: input.now,
    entityId: String(costDocumentId),
    entityType: "costDocument",
    effectiveCapacity: authorization.effectiveRole.role,
    eventType: input.eventType,
    newState: input.newState,
    organizationId: authorization.organizationId,
    priorState: input.priorState,
    targetRevisions: [
      { entityId: String(costDocumentId), entityType: "costDocument" },
    ],
    warnings: [],
  });
}

async function recordCostDocumentDraftAudit(
  ctx: MutationCtx,
  authorization: ActiveBuildAuthorization,
  draft: Doc<"costDocumentDrafts">,
  input: {
    command: string;
    eventType: string;
    newState?: string;
    now: number;
    priorState?: string;
  }
) {
  await ctx.db.insert("auditEvents", {
    actorKind: authorization.viewer.actorKind,
    actorRole: authorization.effectiveRole.role,
    actorRoles: authorization.viewer.roles,
    actorWorkosUserId: authorization.viewer.subject,
    brokerageId: authorization.brokerage._id,
    buildId: authorization.build._id,
    command: input.command,
    createdAt: input.now,
    entityId: String(draft._id),
    entityType: "costDocumentDraft",
    effectiveCapacity: authorization.effectiveRole.role,
    eventType: input.eventType,
    newState: input.newState,
    organizationId: authorization.organizationId,
    priorState: input.priorState,
    targetRevisions: [
      {
        entityId: String(draft._id),
        entityType: "costDocumentDraft",
        revision: currentCostDocumentDraftRevision(draft),
      },
    ],
    warnings: [],
  });
}

function costDocumentDraftLifecycleState(
  draft: Pick<
    Doc<"costDocumentDrafts">,
    "activeStep" | "completedAt" | "lifecycle"
  >
) {
  return {
    activeStep: draft.activeStep,
    completedAt: draft.completedAt ?? null,
    lifecycle: draft.lifecycle,
  };
}

async function projectCostDocument(
  ctx: QueryCtx,
  authorization: ActiveBuildAuthorization,
  document: Doc<"costDocuments">
) {
  const isHomeownerView = authorization.effectiveRole.role === "homeowner";
  const [
    pages,
    allocations,
    financialComponents,
    activity,
    builderReview,
    brokerageReview,
  ] = await Promise.all([
    ctx.db
      .query("costDocumentPages")
      .withIndex("by_costDocumentId_and_order", (query) =>
        query.eq("costDocumentId", document._id)
      )
      .order("asc")
      .take(MAX_PAGES + 1),
    ctx.db
      .query("costDocumentAllocations")
      .withIndex("by_costDocumentId_and_order", (query) =>
        query.eq("costDocumentId", document._id)
      )
      .order("asc")
      .take(MAX_ALLOCATIONS + 1),
    ctx.db
      .query("costDocumentFinancialComponents")
      .withIndex("by_costDocumentId_and_order", (query) =>
        query.eq("costDocumentId", document._id)
      )
      .order("asc")
      .take(MAX_FINANCIAL_COMPONENTS + 1),
    isHomeownerView
      ? ctx.db
          .query("auditEvents")
          .withIndex("by_entity", (query) =>
            query
              .eq("entityType", "costDocument")
              .eq("entityId", String(document._id))
          )
          .filter((query) =>
            query.eq(query.field("eventType"), "cost_document.submitted")
          )
          .order("asc")
          .first()
          .then((event) => (event ? [event] : []))
      : ctx.db
          .query("auditEvents")
          .withIndex("by_entity", (query) =>
            query
              .eq("entityType", "costDocument")
              .eq("entityId", String(document._id))
          )
          .order("desc")
          .take(50),
    ctx.db
      .query("costDocumentReviewAnnotations")
      .withIndex("by_costDocumentId_and_reviewType_and_revision", (query) =>
        query.eq("costDocumentId", document._id).eq("reviewType", "builder")
      )
      .order("desc")
      .first(),
    ctx.db
      .query("costDocumentReviewAnnotations")
      .withIndex("by_costDocumentId_and_reviewType_and_revision", (query) =>
        query.eq("costDocumentId", document._id).eq("reviewType", "brokerage")
      )
      .order("desc")
      .first(),
  ]);
  const integrityExceptions =
    await listCurrentOpenCostDocumentIntegrityExceptions(ctx, document, pages);
  await assertReadableCostDocumentProjectionGraph(ctx, document, {
    activity,
    allocations,
    brokerageReview,
    builderReview,
    financialComponents,
    integrityExceptions,
    pages,
  });
  const openIntegrityExceptions = integrityExceptions.filter(
    (exception) =>
      exception.resolvedAt === undefined &&
      exception.organizationId === document.organizationId &&
      exception.brokerageId === document.brokerageId &&
      exception.buildId === document.buildId
  );
  const projectReview = (
    review: Doc<"costDocumentReviewAnnotations"> | null
  ) =>
    review &&
    review.organizationId === document.organizationId &&
    review.brokerageId === document.brokerageId &&
    review.buildId === document.buildId
      ? {
          annotation: review.annotation,
          createdAt: review.createdAt,
          outcome: review.outcome,
          revision: review.revision,
        }
      : undefined;
  return {
    _id: document._id,
    activity: activity
      .filter(
        (event) =>
          !isHomeownerView || event.eventType === "cost_document.submitted"
      )
      .map((event) => ({
        createdAt: event.createdAt,
        eventType: event.eventType,
      })),
    allocations: allocations.map((allocation) => ({
      amountCents: allocation.amountCents,
      buildSubmilestoneId: allocation.buildSubmilestoneId,
      order: allocation.order,
      submilestoneKey: allocation.submilestoneKeySnapshot,
      submilestoneName: allocation.submilestoneNameSnapshot,
    })),
    category: document.category,
    capabilities: costDocumentCapabilities(authorization, document),
    currency: document.currency,
    description: document.description,
    documentDate: document.documentDate,
    financialComponents: financialComponents.map((component) => ({
      amountCents: component.amountCents,
      kind: component.kind,
      label: component.label,
      order: component.order,
    })),
    grossTotalCents: document.grossTotalCents,
    kind: document.kind,
    duplicateWarning:
      !isHomeownerView && document.duplicateOverrideReason
        ? {
            overridden: true as const,
            reason: document.duplicateOverrideReason,
          }
        : undefined,
    ...(isHomeownerView
      ? {}
      : {
          integrity: {
            healthy: openIntegrityExceptions.length === 0,
            openExceptions: openIntegrityExceptions.map((exception) => ({
              actionRequired: exception.actionRequired,
              assetId: exception.assetId,
              createdAt: exception.createdAt,
              kind: exception.kind,
              pageId: exception.pageId,
            })),
          },
          reviews: {
            brokerage: projectReview(brokerageReview),
            builder: projectReview(builderReview),
          },
        }),
    lifecycle: {
      state: costDocumentLifecycleState(document),
      supersededAt: document.supersededAt,
      voidedAt: document.voidedAt,
      voidReason: isHomeownerView ? undefined : document.voidReason,
    },
    pages: pages.map((page) => ({
      assetId: page.assetId,
      contentHashSha256: page.contentHashSha256Snapshot,
      fileName: page.fileNameSnapshot,
      mimeType: page.mimeTypeSnapshot,
      order: page.order,
    })),
    revision: {
      number: document.revisionNumber ?? 1,
      supersededByCostDocumentId: document.supersededByCostDocumentId,
      supersedesCostDocumentId: document.supersedesCostDocumentId,
    },
    state: document.state,
    submittedAt: document.submittedAt,
    supportingContextDisclosure: SUPPORTING_CONTEXT_DISCLOSURE,
    title: document.title,
    uploaderScope:
      document.uploaderWorkosUserId === authorization.viewer.subject
        ? ("self" as const)
        : ("other" as const),
    vendor: await projectCostDocumentVendor(ctx, document),
    vendorName: document.vendorName,
  };
}

async function assertReadableCostDocumentProjectionGraph(
  ctx: QueryCtx,
  document: Doc<"costDocuments">,
  graph: {
    activity: Doc<"auditEvents">[];
    allocations: Doc<"costDocumentAllocations">[];
    brokerageReview: Doc<"costDocumentReviewAnnotations"> | null;
    builderReview: Doc<"costDocumentReviewAnnotations"> | null;
    financialComponents: Doc<"costDocumentFinancialComponents">[];
    integrityExceptions: Doc<"costDocumentIntegrityExceptions">[];
    pages: Doc<"costDocumentPages">[];
  }
) {
  if (
    graph.pages.length < 1 ||
    graph.pages.length > MAX_PAGES ||
    graph.allocations.length < 1 ||
    graph.allocations.length > MAX_ALLOCATIONS ||
    graph.financialComponents.length > MAX_FINANCIAL_COMPONENTS ||
    graph.integrityExceptions.length >
      MAX_ROADMAP_RECONCILIATION_INTEGRITY_EXCEPTIONS ||
    !hasSequentialCostDocumentOrders(graph.pages) ||
    !hasSequentialCostDocumentOrders(graph.allocations) ||
    !hasSequentialCostDocumentOrders(graph.financialComponents)
  ) {
    throwCostDocumentProjectionGraphUnavailable();
  }
  const scopedChildren = [
    ...graph.pages,
    ...graph.allocations,
    ...graph.financialComponents,
    ...graph.integrityExceptions,
    ...(graph.builderReview ? [graph.builderReview] : []),
    ...(graph.brokerageReview ? [graph.brokerageReview] : []),
  ];
  if (
    scopedChildren.some(
      (child) =>
        child.organizationId !== document.organizationId ||
        child.brokerageId !== document.brokerageId ||
        child.buildId !== document.buildId ||
        child.costDocumentId !== document._id
    ) ||
    graph.activity.some(
      (event) =>
        event.organizationId !== document.organizationId ||
        event.brokerageId !== document.brokerageId ||
        event.entityType !== "costDocument" ||
        event.entityId !== String(document._id)
    )
  ) {
    throwCostDocumentProjectionGraphUnavailable();
  }
  const [assets, submilestones] = await Promise.all([
    Promise.all(graph.pages.map((page) => ctx.db.get(page.assetId))),
    Promise.all(
      graph.allocations.map((allocation) =>
        ctx.db.get(allocation.buildSubmilestoneId)
      )
    ),
  ]);
  if (
    assets.some(
      (asset) =>
        !asset ||
        asset.organizationId !== document.organizationId ||
        asset.brokerageId !== document.brokerageId ||
        asset.buildId !== document.buildId
    ) ||
    submilestones.some(
      (submilestone) =>
        !submilestone ||
        submilestone.organizationId !== document.organizationId ||
        submilestone.brokerageId !== document.brokerageId ||
        submilestone.buildId !== document.buildId
    )
  ) {
    throwCostDocumentProjectionGraphUnavailable();
  }
}

async function assertReadableCostDocumentRoadmapProjectionGraph(
  ctx: QueryCtx,
  document: Doc<"costDocuments">,
  graph: {
    allocations: Doc<"costDocumentAllocations">[];
    brokerageReview: Doc<"costDocumentReviewAnnotations"> | null;
    builderReview: Doc<"costDocumentReviewAnnotations"> | null;
    financialComponents: Doc<"costDocumentFinancialComponents">[];
    integrityExceptions: Doc<"costDocumentIntegrityExceptions">[];
  }
) {
  if (
    graph.allocations.length < 1 ||
    graph.allocations.length > MAX_ALLOCATIONS ||
    graph.financialComponents.length > MAX_FINANCIAL_COMPONENTS ||
    graph.integrityExceptions.length >
      MAX_ROADMAP_RECONCILIATION_INTEGRITY_EXCEPTIONS ||
    !hasSequentialCostDocumentOrders(graph.allocations) ||
    !hasSequentialCostDocumentOrders(graph.financialComponents)
  ) {
    throwCostDocumentProjectionGraphUnavailable();
  }
  const scopedChildren = [
    ...graph.allocations,
    ...graph.financialComponents,
    ...graph.integrityExceptions,
    ...(graph.builderReview ? [graph.builderReview] : []),
    ...(graph.brokerageReview ? [graph.brokerageReview] : []),
  ];
  if (
    scopedChildren.some(
      (child) =>
        child.organizationId !== document.organizationId ||
        child.brokerageId !== document.brokerageId ||
        child.buildId !== document.buildId ||
        child.costDocumentId !== document._id
    )
  ) {
    throwCostDocumentProjectionGraphUnavailable();
  }
  const [submilestones, integrityAssets, integrityPages] = await Promise.all([
    Promise.all(
      graph.allocations.map((allocation) =>
        ctx.db.get(allocation.buildSubmilestoneId)
      )
    ),
    Promise.all(
      graph.integrityExceptions.map((exception) =>
        ctx.db.get(exception.assetId)
      )
    ),
    Promise.all(
      graph.integrityExceptions.map((exception) => ctx.db.get(exception.pageId))
    ),
  ]);
  if (
    submilestones.some(
      (submilestone) =>
        !submilestone ||
        submilestone.organizationId !== document.organizationId ||
        submilestone.brokerageId !== document.brokerageId ||
        submilestone.buildId !== document.buildId
    ) ||
    integrityAssets.some(
      (asset) =>
        !asset ||
        asset.organizationId !== document.organizationId ||
        asset.brokerageId !== document.brokerageId ||
        asset.buildId !== document.buildId
    ) ||
    integrityPages.some(
      (page, index) =>
        !page ||
        page.organizationId !== document.organizationId ||
        page.brokerageId !== document.brokerageId ||
        page.buildId !== document.buildId ||
        page.costDocumentId !== document._id ||
        page.assetId !== graph.integrityExceptions[index]?.assetId
    )
  ) {
    throwCostDocumentProjectionGraphUnavailable();
  }
}

function hasSequentialCostDocumentOrders(rows: { order: number }[]) {
  return rows.every((row, index) => row.order === index + 1);
}

function throwCostDocumentProjectionGraphUnavailable(): never {
  throw new Error("The Cost Document durable graph is unavailable.");
}

async function requireReadableCostDocument(
  ctx: AuthorizedCostDocumentCtx,
  input: {
    actorCapacity?: ActiveBuildAuthorization["effectiveRole"]["role"];
    buildId: Id<"activeBuilds">;
    costDocumentId: Id<"costDocuments">;
    organizationId: string;
  }
) {
  const authorization = await authorizeCostDocumentIntent(ctx, {
    actorCapacity: input.actorCapacity,
    buildId: input.buildId,
    intent: "submitted.read",
    organizationId: input.organizationId,
  });
  const document = await ctx.db.get(input.costDocumentId);
  if (
    !(
      isCostDocumentInScopeForAuthorization(document, authorization) &&
      (await canReadSubmittedCostDocument(ctx, authorization, document))
    )
  ) {
    throw new Error("The Cost Document is unavailable.");
  }
  return { authorization, document };
}

function assertCostDocumentReviewerRole(
  authorization: ActiveBuildAuthorization,
  reviewType: "builder" | "brokerage"
) {
  if (!canRecordCostDocumentReview(authorization, reviewType)) {
    throw new Error(`The ${reviewType} Cost Document review is unavailable.`);
  }
}

function canRecordCostDocumentReview(
  authorization: ActiveBuildAuthorization,
  reviewType: "builder" | "brokerage"
) {
  const role = authorization.effectiveRole.role;
  return reviewType === "builder"
    ? ["builder", "builder-staff"].includes(role)
    : ["admin", "principle-broker", "broker", "broker-staff"].includes(role);
}

function canManageCostDocumentLifecycle(
  authorization: ActiveBuildAuthorization,
  _document: Doc<"costDocuments">
) {
  const role = authorization.effectiveRole.role;
  // Lifecycle recovery is a Build administrative action. Contractors retain
  // read access to their submitted record but cannot void or supersede it.
  return role === "builder" || role === "builder-staff";
}

function canManageCostDocumentCorrection(
  authorization: ActiveBuildAuthorization,
  document: Doc<"costDocuments">
) {
  if (!canManageCostDocumentLifecycle(authorization, document)) {
    return false;
  }
  if (
    document.contractorProfileId &&
    document.uploaderWorkosUserId !== authorization.viewer.subject
  ) {
    return false;
  }
  return true;
}

function costDocumentCapabilities(
  authorization: ActiveBuildAuthorization,
  document: Doc<"costDocuments">
) {
  const isCurrent = isCurrentCostDocument(document);
  return {
    canRecordBrokerageReview: canRecordCostDocumentReview(
      authorization,
      "brokerage"
    ),
    canRecordBuilderReview: canRecordCostDocumentReview(
      authorization,
      "builder"
    ),
    canStartCorrection:
      isCurrent && canManageCostDocumentCorrection(authorization, document),
    canVoid:
      isCurrent && canManageCostDocumentLifecycle(authorization, document),
  };
}

async function assessCostDocumentDuplicates(
  ctx: QueryCtx | MutationCtx,
  authorization: ActiveBuildAuthorization,
  draft: Doc<"costDocumentDrafts">
) {
  const pages = await currentDraftPages(ctx, draft);
  if (pages.length < 1 || pages.length > MAX_PAGES) {
    throw new Error(`A Cost Document requires 1-${MAX_PAGES} source pages.`);
  }
  const assets: Doc<"buildCollaborationAssets">[] = [];
  for (const page of pages) {
    assertDraftPageScope(page, draft, authorization);
    const asset = await ctx.db.get(page.assetId);
    if (
      !asset ||
      asset.organizationId !== authorization.organizationId ||
      asset.brokerageId !== authorization.brokerage._id ||
      asset.buildId !== authorization.build._id ||
      !asset.contentHashSha256
    ) {
      throw new Error("Every Cost Document source page must be available.");
    }
    assets.push(asset);
  }
  const facts = await requiredDraftFacts(ctx, authorization, draft);
  return await assessCostDocumentIdentity(ctx, authorization, {
    category: draft.category,
    documentDate: facts.documentDate,
    draft,
    grossTotalCents: positiveCents(
      draft.grossTotalCents ?? 0,
      "Gross Document Total"
    ),
    kind: draft.kind,
    pages: assets,
    vendorName: facts.vendorName,
  });
}

async function validateBatchDuplicateAssessments(
  ctx: MutationCtx,
  authorization: ActiveBuildAuthorization,
  prepared: PreparedCostDocument[],
  requestedOverrideReason: string | undefined
) {
  const duplicateOverrideReason = optionalText(
    requestedOverrideReason,
    "Likely duplicate override reason",
    1000
  );
  const duplicateAssessments: Awaited<
    ReturnType<typeof assessCostDocumentDuplicates>
  >[] = [];
  const batchSourceManifests = new Map<string, string>();
  for (const document of prepared) {
    const assessment = await assessCostDocumentDuplicates(
      ctx,
      authorization,
      document.draft
    );
    if (assessment.exactDuplicateCostDocumentId) {
      throw new Error(
        `This source is an exact duplicate of Cost Document ${assessment.exactDuplicateCostDocumentId}.`
      );
    }
    const sourceManifest = document.pages
      .map(requiredAssetHash)
      .sort((left, right) => left.localeCompare(right))
      .join("\n");
    const priorManifest = batchSourceManifests.get(assessment.sourceHashDigest);
    if (priorManifest === sourceManifest) {
      throw new Error(
        "This source is an exact duplicate of another Cost Document draft in this batch."
      );
    }
    batchSourceManifests.set(assessment.sourceHashDigest, sourceManifest);
    if (
      assessment.likelyDuplicateCostDocumentIds.length > 0 &&
      !duplicateOverrideReason
    ) {
      throw new Error(
        "This appears to be a likely duplicate. Record an override reason before submission."
      );
    }
    duplicateAssessments.push(assessment);
  }
  return { duplicateAssessments, duplicateOverrideReason };
}

async function assessCostDocumentIdentity(
  ctx: QueryCtx | MutationCtx,
  authorization: ActiveBuildAuthorization,
  input: {
    category: "labour" | "materials";
    documentDate: string;
    draft: Doc<"costDocumentDrafts">;
    grossTotalCents: number;
    kind: "invoice" | "receipt";
    pages: Doc<"buildCollaborationAssets">[];
    vendorName: string;
  }
) {
  const sourceHashDigest = await sha256Text(
    input.pages
      .map(requiredAssetHash)
      .sort((left, right) => left.localeCompare(right))
      .join("\n")
  );
  const sourceHashes = input.pages
    .map(requiredAssetHash)
    .sort((left, right) => left.localeCompare(right));
  const likelyDuplicateFingerprint = await sha256Text(
    JSON.stringify({
      category: input.category,
      documentDate: input.documentDate,
      grossTotalCents: input.grossTotalCents,
      kind: input.kind,
      vendorName: normalizeDuplicateText(input.vendorName),
    })
  );
  const lineage = await costDocumentRevisionLineageIds(
    ctx,
    authorization,
    input.draft.supersedesCostDocumentId
  );
  const exactCandidates = await ctx.db
    .query("costDocuments")
    .withIndex("by_buildId_and_sourceHashDigest", (query) =>
      query
        .eq("buildId", authorization.build._id)
        .eq("sourceHashDigest", sourceHashDigest)
    )
    .take(MAX_SUBMITTED_DOCUMENT_LIST_SCAN);
  const legacyExactCandidates = await ctx.db
    .query("costDocuments")
    .withIndex("by_buildId_and_sourceHashDigest", (query) =>
      query
        .eq("buildId", authorization.build._id)
        .eq("sourceHashDigest", undefined)
    )
    .take(MAX_SUBMITTED_DOCUMENT_LIST_SCAN + 1);
  if (legacyExactCandidates.length > MAX_SUBMITTED_DOCUMENT_LIST_SCAN) {
    throw new Error(
      "Legacy Cost Document source digests require backfill before submission."
    );
  }
  let exactDuplicate: Doc<"costDocuments"> | undefined;
  for (const candidate of [...exactCandidates, ...legacyExactCandidates]) {
    if (
      candidate.organizationId === authorization.organizationId &&
      candidate.brokerageId === authorization.brokerage._id &&
      !lineage.has(String(candidate._id)) &&
      (await hasExactCostDocumentSourceHashes(ctx, candidate, sourceHashes))
    ) {
      exactDuplicate = candidate;
      break;
    }
  }
  const likelyCandidates = await ctx.db
    .query("costDocuments")
    .withIndex("by_buildId_and_likelyDuplicateFingerprint", (query) =>
      query
        .eq("buildId", authorization.build._id)
        .eq("likelyDuplicateFingerprint", likelyDuplicateFingerprint)
    )
    .take(21);
  const likelyDuplicateCostDocumentIds: Id<"costDocuments">[] = [];
  for (const candidate of likelyCandidates) {
    if (
      likelyDuplicateCostDocumentIds.length >= 20 ||
      !isCurrentCostDocument(candidate) ||
      candidate.organizationId !== authorization.organizationId ||
      candidate.brokerageId !== authorization.brokerage._id ||
      lineage.has(String(candidate._id)) ||
      (await hasExactCostDocumentSourceHashes(ctx, candidate, sourceHashes))
    ) {
      continue;
    }
    likelyDuplicateCostDocumentIds.push(candidate._id);
  }
  const supersedes = input.draft.supersedesCostDocumentId
    ? await ctx.db.get(input.draft.supersedesCostDocumentId)
    : null;
  return {
    exactDuplicateCostDocumentId: exactDuplicate?._id,
    likelyDuplicateCostDocumentIds,
    likelyDuplicateFingerprint,
    requiresOverride: likelyDuplicateCostDocumentIds.length > 0,
    revisionNumber: supersedes ? (supersedes.revisionNumber ?? 1) + 1 : 1,
    sourceHashDigest,
  };
}

async function hasExactCostDocumentSourceHashes(
  ctx: QueryCtx | MutationCtx,
  candidate: Doc<"costDocuments">,
  expectedHashes: string[]
) {
  const pages = await ctx.db
    .query("costDocumentPages")
    .withIndex("by_costDocumentId_and_order", (query) =>
      query.eq("costDocumentId", candidate._id)
    )
    .take(MAX_PAGES + 1);
  if (pages.length !== expectedHashes.length) {
    return false;
  }
  const candidateHashes = pages
    .map((page) => page.contentHashSha256Snapshot)
    .sort((left, right) => left.localeCompare(right));
  return candidateHashes.every((hash, index) => hash === expectedHashes[index]);
}

async function costDocumentRevisionLineageIds(
  ctx: QueryCtx | MutationCtx,
  authorization: ActiveBuildAuthorization,
  startId: Id<"costDocuments"> | undefined
) {
  const result = new Set<string>();
  let currentId = startId;
  for (let depth = 0; currentId && depth < 100; depth += 1) {
    const current = await ctx.db.get(currentId);
    if (
      !current ||
      current.organizationId !== authorization.organizationId ||
      current.brokerageId !== authorization.brokerage._id ||
      current.buildId !== authorization.build._id
    ) {
      throw new Error("The Cost Document correction lineage is unavailable.");
    }
    result.add(String(current._id));
    currentId = current.supersedesCostDocumentId;
  }
  if (currentId) {
    throw new Error("The Cost Document correction lineage is too deep.");
  }
  return result;
}

function isCurrentCostDocument(document: Doc<"costDocuments">) {
  return (
    document.voidedAt === undefined &&
    document.supersededByCostDocumentId === undefined
  );
}

function normalizeDuplicateText(value: string) {
  return value
    .trim()
    .toLocaleLowerCase("en-CA")
    .replace(/[^a-z0-9]+/g, " ");
}

async function sha256Text(value: string) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value)
  );
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0")
  ).join("");
}

async function replayCostDocumentCorrection(
  ctx: MutationCtx,
  authorization: ActiveBuildAuthorization,
  document: Doc<"costDocuments">,
  input: { idempotencyKey: string }
) {
  const existingBatch = await ctx.db
    .query("costDocumentBatches")
    .withIndex("by_organizationId_and_createIdempotencyKey", (query) =>
      query
        .eq("organizationId", authorization.organizationId)
        .eq("createIdempotencyKey", input.idempotencyKey)
    )
    .unique();
  if (!existingBatch) {
    return;
  }
  const drafts = await listBatchDrafts(ctx, existingBatch._id);
  const draft = drafts[0];
  if (
    drafts.length !== 1 ||
    !draft ||
    existingBatch.correctionSourceCostDocumentId !== document._id ||
    existingBatch.organizationId !== authorization.organizationId ||
    existingBatch.brokerageId !== authorization.brokerage._id ||
    existingBatch.buildId !== authorization.build._id ||
    existingBatch.ownerWorkosUserId !== authorization.viewer.subject ||
    draft.supersedesCostDocumentId !== document._id
  ) {
    throw new Error("The Cost Document correction key is unavailable.");
  }
  return { batchId: existingBatch._id, draftId: draft._id, replayed: true };
}

async function requireCostDocumentCorrectionSource(
  ctx: MutationCtx,
  authorization: ActiveBuildAuthorization,
  document: Doc<"costDocuments">,
  input: { reuseSourcePages: boolean }
) {
  if (!isCurrentCostDocument(document)) {
    throw new Error("Corrections must start from the newest revision.");
  }
  const [submittedChild, draftChildren, pages, allocations, components] =
    await Promise.all([
      ctx.db
        .query("costDocuments")
        .withIndex("by_supersedesCostDocumentId", (query) =>
          query.eq("supersedesCostDocumentId", document._id)
        )
        .first(),
      ctx.db
        .query("costDocumentDrafts")
        .withIndex("by_supersedesCostDocumentId", (query) =>
          query.eq("supersedesCostDocumentId", document._id)
        )
        .take(100),
      ctx.db
        .query("costDocumentPages")
        .withIndex("by_costDocumentId_and_order", (query) =>
          query.eq("costDocumentId", document._id)
        )
        .order("asc")
        .collect(),
      ctx.db
        .query("costDocumentAllocations")
        .withIndex("by_costDocumentId_and_order", (query) =>
          query.eq("costDocumentId", document._id)
        )
        .order("asc")
        .collect(),
      ctx.db
        .query("costDocumentFinancialComponents")
        .withIndex("by_costDocumentId_and_order", (query) =>
          query.eq("costDocumentId", document._id)
        )
        .order("asc")
        .collect(),
    ]);
  for (const draftChild of draftChildren) {
    const draftChildBatch = await ctx.db.get(draftChild.batchId);
    if (draftChildBatch?.state !== "abandoned") {
      throw new Error("Corrections must start from the newest revision.");
    }
  }
  if (submittedChild) {
    throw new Error("Corrections must start from the newest revision.");
  }
  if (allocations.length < 1 || (input.reuseSourcePages && pages.length < 1)) {
    throw new Error("The Cost Document correction source is incomplete.");
  }
  for (const row of [...pages, ...allocations, ...components]) {
    if (
      row.organizationId !== authorization.organizationId ||
      row.brokerageId !== authorization.brokerage._id ||
      row.buildId !== authorization.build._id
    ) {
      throw new Error("The Cost Document correction source is unavailable.");
    }
  }
  await assertCurrentCostDocumentAllocationScope(ctx, {
    allocationSubmilestoneIds: allocations.map(
      (allocation) => allocation.buildSubmilestoneId
    ),
    authorization,
    contractorProfileId: document.contractorProfileId,
    ownerWorkosUserId: authorization.viewer.subject,
    purpose: "draft.write",
  });
  return { allocations, components, pages };
}

async function createCostDocumentCorrection(
  ctx: MutationCtx,
  authorization: ActiveBuildAuthorization,
  document: Doc<"costDocuments">,
  input: {
    breakGlass?: boolean;
    idempotencyKey: string;
    reason: string;
    reuseSourcePages: boolean;
  }
) {
  const replay = await replayCostDocumentCorrection(
    ctx,
    authorization,
    document,
    input
  );
  if (replay) {
    return replay;
  }
  const { allocations, components, pages } =
    await requireCostDocumentCorrectionSource(ctx, authorization, document, {
      reuseSourcePages: input.reuseSourcePages,
    });
  const now = Date.now();
  const batchId = await ctx.db.insert("costDocumentBatches", {
    brokerageId: authorization.brokerage._id,
    buildId: authorization.build._id,
    contractorProfileId: document.contractorProfileId,
    correctionSourceCostDocumentId: document._id,
    createIdempotencyKey: input.idempotencyKey,
    createdAt: now,
    organizationId: authorization.organizationId,
    ownerWorkosUserId: authorization.viewer.subject,
    revision: 1,
    state: "active",
    updatedAt: now,
  });
  const draftId = await ctx.db.insert("costDocumentDrafts", {
    activeStep: "capture_confirm",
    batchId,
    brokerageId: authorization.brokerage._id,
    buildId: authorization.build._id,
    category: document.category,
    contractorProfileId: document.contractorProfileId,
    createdAt: now,
    currency: "CAD",
    description: document.description,
    documentDate: document.documentDate,
    grossTotalCents: document.grossTotalCents,
    kind: document.kind,
    lifecycle: "draft",
    order: 1,
    organizationId: authorization.organizationId,
    ownerWorkosUserId: authorization.viewer.subject,
    revision: 1,
    supersedesCostDocumentId: document._id,
    title: document.title,
    updatedAt: now,
    vendorProfileId: document.vendorProfileId,
    vendorName: document.vendorName,
  });
  if (input.reuseSourcePages) {
    for (const page of pages) {
      await ctx.db.insert("costDocumentDraftPages", {
        assetId: page.assetId,
        batchId,
        brokerageId: authorization.brokerage._id,
        buildId: authorization.build._id,
        createdAt: now,
        draftId,
        order: page.order,
        organizationId: authorization.organizationId,
        state: "active",
      });
    }
  }
  for (const allocation of allocations) {
    await ctx.db.insert("costDocumentDraftAllocations", {
      amountCents: allocation.amountCents,
      batchId,
      brokerageId: authorization.brokerage._id,
      buildId: authorization.build._id,
      buildSubmilestoneId: allocation.buildSubmilestoneId,
      createdAt: now,
      draftId,
      order: allocation.order,
      organizationId: authorization.organizationId,
      submilestoneKeySnapshot: allocation.submilestoneKeySnapshot,
      submilestoneNameSnapshot: allocation.submilestoneNameSnapshot,
    });
  }
  for (const component of components) {
    await ctx.db.insert("costDocumentDraftFinancialComponents", {
      amountCents: component.amountCents,
      batchId,
      brokerageId: authorization.brokerage._id,
      buildId: authorization.build._id,
      createdAt: now,
      draftId,
      kind: component.kind,
      label: component.label,
      order: component.order,
      organizationId: authorization.organizationId,
    });
  }
  await appendGovernedAuditEvent(ctx, authorization, {
    breakGlass: input.breakGlass,
    command: "startCostDocumentCorrection",
    entityId: String(document._id),
    entityType: "costDocument",
    eventType: "cost_document.correction_started",
    newState: {
      allocationCount: allocations.length,
      allocationTotalCents: allocations.reduce(
        (total, allocation) => total + allocation.amountCents,
        0
      ),
      batchId,
      draftId,
      grossTotalCents: document.grossTotalCents,
      reuseSourcePages: input.reuseSourcePages,
    },
    now,
    overrideKind: "cost_supersede",
    priorState: {
      allocationCount: allocations.length,
      allocationTotalCents: allocations.reduce(
        (total, allocation) => total + allocation.amountCents,
        0
      ),
      grossTotalCents: document.grossTotalCents,
      revision: document.revisionNumber ?? 1,
      state: "current",
    },
    reason: input.reason,
    targetRevisions: [
      {
        entityId: String(document._id),
        entityType: "costDocument",
        revision: document.revisionNumber ?? 1,
      },
    ],
  });
  return { batchId, draftId, replayed: false };
}

async function linkSubmittedCostDocumentCorrection(
  ctx: MutationCtx,
  authorization: ActiveBuildAuthorization,
  input: {
    costDocumentId: Id<"costDocuments">;
    draft: Doc<"costDocumentDrafts">;
    now: number;
  }
) {
  const supersedesId = input.draft.supersedesCostDocumentId;
  if (!supersedesId) {
    return;
  }
  const source = await ctx.db.get(supersedesId);
  if (
    !source ||
    source.organizationId !== authorization.organizationId ||
    source.brokerageId !== authorization.brokerage._id ||
    source.buildId !== authorization.build._id ||
    !isCurrentCostDocument(source)
  ) {
    throw new Error("Corrections must submit from the newest revision.");
  }
  const existingChild = await ctx.db
    .query("costDocuments")
    .withIndex("by_supersedesCostDocumentId", (query) =>
      query.eq("supersedesCostDocumentId", source._id)
    )
    .filter((query) => query.neq(query.field("_id"), input.costDocumentId))
    .first();
  if (existingChild) {
    throw new Error("Corrections must form one linear revision chain.");
  }
  await ctx.db.patch(source._id, {
    supersededAt: input.now,
    supersededByCostDocumentId: input.costDocumentId,
  });
  await appendGovernedAuditEvent(ctx, authorization, {
    command: "submitCostDocumentBatch",
    entityId: String(source._id),
    entityType: "costDocument",
    eventType: "cost_document.superseded",
    newState: {
      state: "superseded",
      supersededAt: input.now,
      supersededByCostDocumentId: input.costDocumentId,
    },
    now: input.now,
    overrideKind: "cost_supersede",
    priorState: { state: "current" },
    reason: "Submitted a corrected Cost Document revision.",
    targetRevisions: [
      {
        entityId: String(source._id),
        entityType: "costDocument",
        revision: source.revisionNumber,
      },
    ],
  });
}

async function reconcileSubmittedCostDocumentIntegrity(
  ctx: MutationCtx,
  authorization: ActiveBuildAuthorization,
  document: Doc<"costDocuments">
) {
  const pages = await ctx.db
    .query("costDocumentPages")
    .withIndex("by_costDocumentId_and_order", (query) =>
      query.eq("costDocumentId", document._id)
    )
    .order("asc")
    .collect();
  const exceptions: {
    actionRequired: boolean;
    assetId: Id<"buildCollaborationAssets">;
    createdAt: number;
    kind: "unavailable" | "quarantined" | "missing" | "corrupt";
    pageId: Id<"costDocumentPages">;
  }[] = [];
  for (const page of pages) {
    if (
      page.organizationId !== authorization.organizationId ||
      page.brokerageId !== authorization.brokerage._id ||
      page.buildId !== authorization.build._id
    ) {
      throw new Error("The Cost Document integrity graph is unavailable.");
    }
    const inspection = await inspectCostDocumentPageIntegrity(
      ctx,
      authorization,
      document,
      page
    );
    if (inspection.kind) {
      exceptions.push(
        await recordCostDocumentIntegrityException(
          ctx,
          authorization,
          document,
          {
            detectedHashSha256: inspection.asset?.contentHashSha256,
            kind: inspection.kind,
            page,
          }
        )
      );
    } else {
      await resolveCostDocumentPageIntegrityExceptions(ctx, page);
    }
  }
  return { exceptions, healthy: exceptions.length === 0 };
}

async function inspectCostDocumentPageIntegrity(
  ctx: MutationCtx,
  authorization: ActiveBuildAuthorization,
  document: Doc<"costDocuments">,
  page: Doc<"costDocumentPages">
) {
  const asset = await ctx.db.get(page.assetId);
  if (!asset) {
    return { asset: null, kind: "missing" as const };
  }
  if (
    asset.organizationId !== authorization.organizationId ||
    asset.brokerageId !== authorization.brokerage._id ||
    asset.buildId !== authorization.build._id ||
    page.costDocumentId !== document._id
  ) {
    return { asset, kind: "unavailable" as const };
  }
  const storage = await ctx.db.system.get("_storage", asset.storageId);
  if (!storage || asset.storageDeletedAt !== undefined) {
    return { asset, kind: "missing" as const };
  }
  if (asset.state === "quarantined") {
    return { asset, kind: "quarantined" as const };
  }
  if (
    asset.contentHashSha256 !== page.contentHashSha256Snapshot ||
    asset.fileName !== page.fileNameSnapshot ||
    asset.mimeType !== page.mimeTypeSnapshot
  ) {
    return { asset, kind: "corrupt" as const };
  }
  if (!isCleanCollaborationAsset(asset)) {
    return { asset, kind: "unavailable" as const };
  }
  return { asset, kind: undefined };
}

async function recordCostDocumentIntegrityException(
  ctx: MutationCtx,
  authorization: ActiveBuildAuthorization,
  document: Doc<"costDocuments">,
  input: {
    detectedHashSha256?: string;
    kind: "unavailable" | "quarantined" | "missing" | "corrupt";
    page: Doc<"costDocumentPages">;
  }
) {
  await resolveCostDocumentPageIntegrityExceptions(ctx, input.page, input.kind);
  const existing = await ctx.db
    .query("costDocumentIntegrityExceptions")
    .withIndex("by_costDocumentId_and_pageId_and_kind", (query) =>
      query
        .eq("costDocumentId", document._id)
        .eq("pageId", input.page._id)
        .eq("kind", input.kind)
    )
    .order("desc")
    .first();
  if (existing && existing.resolvedAt === undefined) {
    return projectIntegrityException(existing);
  }
  const now = Date.now();
  const exceptionId = await ctx.db.insert("costDocumentIntegrityExceptions", {
    actionRequired: true,
    assetId: input.page.assetId,
    brokerageId: authorization.brokerage._id,
    buildId: authorization.build._id,
    costDocumentId: document._id,
    createdAt: now,
    detectedHashSha256: input.detectedHashSha256,
    expectedHashSha256: input.page.contentHashSha256Snapshot,
    kind: input.kind,
    organizationId: authorization.organizationId,
    pageId: input.page._id,
  });
  await recordCostDocumentAudit(ctx, authorization, document._id, {
    command: "reconcileCostDocumentIntegrity",
    eventType: "cost_document.integrity_exception",
    newState: JSON.stringify({
      actionRequired: true,
      assetId: input.page.assetId,
      exceptionId,
      kind: input.kind,
      pageId: input.page._id,
    }),
    now,
  });
  await ctx.db.insert("eventOutbox", {
    brokerageId: authorization.brokerage._id,
    createdAt: now,
    eventType: "cost_document.integrity_exception",
    organizationId: authorization.organizationId,
    payloadPreview: JSON.stringify({
      actionRequired: true,
      buildId: authorization.build._id,
      kind: input.kind,
      pageId: input.page._id,
    }),
    relatedEntityId: String(document._id),
    relatedEntityType: "costDocument",
    status: "pending",
  });
  await enqueueCommunicationIntent(ctx, {
    brokerageId: authorization.brokerage._id,
    buildId: authorization.build._id,
    kind: "cost_document_integrity_action_required",
    idempotencyKey: `cost-document:${document._id}:integrity:${input.page._id}:${input.kind}:${exceptionId}`,
    organizationId: authorization.organizationId,
    payloadSnapshot: JSON.stringify({
      kind: input.kind,
      pageId: String(input.page._id),
      title: document.title,
    }),
    recipientEmailSnapshot: document.uploaderEmailSnapshot,
    relatedEntityId: String(document._id),
    relatedEntityType: "costDocument",
    templateKey: "cost_document_integrity_action_required_v1",
  });
  const inserted = await ctx.db.get(exceptionId);
  if (!inserted) {
    throw new Error("The Cost Document integrity exception is unavailable.");
  }
  return projectIntegrityException(inserted);
}

async function resolveCostDocumentPageIntegrityExceptions(
  ctx: MutationCtx,
  page: Doc<"costDocumentPages">,
  exceptKind?: "unavailable" | "quarantined" | "missing" | "corrupt"
) {
  const kinds = ["unavailable", "quarantined", "missing", "corrupt"] as const;
  const now = Date.now();
  for (const kind of kinds) {
    if (kind === exceptKind) {
      continue;
    }
    const exception = await ctx.db
      .query("costDocumentIntegrityExceptions")
      .withIndex("by_costDocumentId_and_pageId_and_kind", (query) =>
        query
          .eq("costDocumentId", page.costDocumentId)
          .eq("pageId", page._id)
          .eq("kind", kind)
      )
      .order("desc")
      .first();
    if (exception && exception.resolvedAt === undefined) {
      await ctx.db.patch(exception._id, { resolvedAt: now });
    }
  }
}

function projectIntegrityException(
  exception: Doc<"costDocumentIntegrityExceptions">
) {
  return {
    actionRequired: exception.actionRequired,
    assetId: exception.assetId,
    createdAt: exception.createdAt,
    kind: exception.kind,
    pageId: exception.pageId,
  };
}

function requiredText(value: string, label: string, maxLength: number) {
  const normalized = value.trim();
  if (!normalized) {
    throw new Error(`${label} is required.`);
  }
  if (normalized.length > maxLength) {
    throw new Error(`${label} must be at most ${maxLength} characters.`);
  }
  return normalized;
}

function optionalText(
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

function requiredDocumentDate(value: string) {
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

function positiveCents(value: number, label: string) {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${label} must be a positive integer number of cents.`);
  }
  return value;
}

function nonNegativeCents(value: number, label: string) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${label} must be a non-negative integer number of cents.`);
  }
  return value;
}

function optionalDraftText(value: string, label: string, maxLength: number) {
  const normalized = value.trim();
  if (normalized.length > maxLength) {
    throw new Error(`${label} must be at most ${maxLength} characters.`);
  }
  return normalized || undefined;
}

function stepIndex(step: (typeof COST_DOCUMENT_DRAFT_STEPS)[number]) {
  const index = COST_DOCUMENT_DRAFT_STEPS.indexOf(step);
  if (index < 0) {
    throw new Error("The Cost Document draft step is invalid.");
  }
  return index;
}

function optionalIdempotencyKey(value: string | undefined) {
  if (value === undefined) {
    return;
  }
  return requiredIdempotencyKey(value);
}

function requiredIdempotencyKey(value: string) {
  const normalized = value.trim();
  if (!normalized || normalized.length > 240) {
    throw new Error("A Cost Document batch idempotency key is required.");
  }
  return normalized;
}

function requiredAssetHash(asset: Doc<"buildCollaborationAssets">) {
  if (!asset.contentHashSha256) {
    throw new Error(
      "Every Cost Document source page requires a verified hash."
    );
  }
  return asset.contentHashSha256;
}
