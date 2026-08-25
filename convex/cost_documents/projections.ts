import type { ActiveBuildAuthorization } from "../activeBuildAccess";
import type { AuthorizedViewer } from "../authz";
import type { Doc, Id, MutationCtx, QueryCtx } from "../types";
import {
  MAX_ALLOCATIONS,
  MAX_FINANCIAL_COMPONENTS,
  MAX_PAGES,
  MAX_ROADMAP_RECONCILIATION_INTEGRITY_EXCEPTIONS,
  MAX_SUBMITTED_DOCUMENT_LIST_SCAN,
  SUPPORTING_CONTEXT_DISCLOSURE,
  optionalText,
  positiveCents,
  requiredAssetHash,
  sha256Text,
  type CostDocumentActorCapacity,
  type CurrentCostDocumentContractorScope,
} from "./contracts";
import {
  authorizeCostDocumentIntent,
  canReadSubmittedCostDocument,
  isCostDocumentInScope as isCostDocumentInScopeForAuthorization,
  requireCostDocumentDraftAccess,
} from "../cost_document_access";
import {
  currentDraftPages,
  requiredDraftFacts,
} from "./draft_state";
import { projectCostDocumentVendor } from "./vendor";
import { assertDraftPageScope } from "./submission_support";
import type { AuthorizedCostDocumentCtx } from "./submission_support";
import { listCurrentOpenCostDocumentIntegrityExceptions } from "./submitted";
import { projectIntegrityException } from "./corrections_integrity";
import type { PreparedCostDocument } from "./submission";

function costDocumentLifecycleState(document: Doc<"costDocuments">) {
  return document.voidedAt
    ? ("voided" as const)
    : document.supersededByCostDocumentId
      ? ("superseded" as const)
      : ("current" as const);
}

export function costDocumentDraftLifecycleState(
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

export async function projectCostDocument(
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

export async function assertReadableCostDocumentProjectionGraph(
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

export async function assertReadableCostDocumentRoadmapProjectionGraph(
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

export function hasSequentialCostDocumentOrders(rows: { order: number }[]) {
  return rows.every((row, index) => row.order === index + 1);
}

export function throwCostDocumentProjectionGraphUnavailable(): never {
  throw new Error("The Cost Document durable graph is unavailable.");
}

export async function requireReadableCostDocument(
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

export function assertCostDocumentReviewerRole(
  authorization: ActiveBuildAuthorization,
  reviewType: "builder" | "brokerage"
) {
  if (!canRecordCostDocumentReview(authorization, reviewType)) {
    throw new Error(`The ${reviewType} Cost Document review is unavailable.`);
  }
}

export function canRecordCostDocumentReview(
  authorization: ActiveBuildAuthorization,
  reviewType: "builder" | "brokerage"
) {
  const role = authorization.effectiveRole.role;
  return reviewType === "builder"
    ? ["builder", "builder-staff"].includes(role)
    : ["admin", "principle-broker", "broker", "broker-staff"].includes(role);
}

export function canManageCostDocumentLifecycle(
  authorization: ActiveBuildAuthorization,
  _document: Doc<"costDocuments">
) {
  const role = authorization.effectiveRole.role;
  // Lifecycle recovery is a Build administrative action. Contractors retain
  // read access to their submitted record but cannot void or supersede it.
  return role === "builder" || role === "builder-staff";
}

export function canManageCostDocumentCorrection(
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

export function costDocumentCapabilities(
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

export async function assessCostDocumentDuplicates(
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

export async function validateBatchDuplicateAssessments(
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

export async function assessCostDocumentIdentity(
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

export async function hasExactCostDocumentSourceHashes(
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

export async function costDocumentRevisionLineageIds(
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

export function isCurrentCostDocument(document: Doc<"costDocuments">) {
  return (
    document.voidedAt === undefined &&
    document.supersededByCostDocumentId === undefined
  );
}

export function normalizeDuplicateText(value: string) {
  return value
    .trim()
    .toLocaleLowerCase("en-CA")
    .replace(/[^a-z0-9]+/g, " ");
}
