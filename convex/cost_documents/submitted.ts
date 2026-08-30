import { v } from "convex/values";
import {
  type PaginationOptions,
  paginationOptsValidator,
  paginationResultValidator,
} from "convex/server";

import type { ActiveBuildAuthorization } from "../activeBuildAccess";
import {
  type AuthorizedViewer,
  authenticatedQuery,
  backofficeQuery,
} from "../authz";
import type { Doc, Id, QueryCtx } from "../types";
import {
  MAX_ALLOCATIONS,
  MAX_FINANCIAL_COMPONENTS,
  MAX_PAGES,
  MAX_ROADMAP_RECONCILIATION_INTEGRITY_EXCEPTIONS,
  COST_DOCUMENT_INTEGRITY_KINDS,
  activeBuildScopeFields,
  costDocumentActorCapacityFields,
  costDocumentCategoryValidator,
  costDocumentIntegrityKindValidator,
  costDocumentKindValidator,
  costDocumentRoadmapReconciliationSummaryValidator,
  costDocumentSummaryValidator,
  costDocumentProjectionValidator,
  costDocumentDuplicateAssessmentValidator,
  costDocumentVendorHistorySummaryValidator,
  type CurrentCostDocumentContractorScope,
} from "./contracts";
import {
  authorizeCostDocumentIntent,
  canReadSubmittedCostDocument,
  requireCostDocumentDraftAccess,
  requireCurrentContractorCostDocumentScope,
  isCostDocumentInScope as isCostDocumentInScopeForAuthorization,
} from "../cost_document_access";
import { projectCostDocumentVendor } from "./vendor";
import {
  assessCostDocumentDuplicates,
  assertReadableCostDocumentRoadmapProjectionGraph,
  projectCostDocument,
  throwCostDocumentProjectionGraphUnavailable,
} from "./projections";

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

export async function listCurrentOpenCostDocumentIntegrityExceptions(
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
