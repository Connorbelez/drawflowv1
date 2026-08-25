import { ConvexError } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { LenderPortalReviewEvidenceReference } from "../lender_portal_phase5_contracts";
import type { MutationCtx, QueryCtx } from "../types";
import {
  COST_DOCUMENT_LIMIT,
  costDocumentUnavailableError,
  EVIDENCE_REFERENCE_LIMIT,
  evidenceReferenceLimitError,
  invalidEvidencePackageReference,
  numberValue,
  recordValue,
  requireMoneyInteger,
  reviewRequirements,
  safeMoneyAdd,
  safeUnavailableError,
  stringValue,
} from "./shared";
import type { ResolvedReviewTarget, ReviewCtx } from "./shared";

export async function snapshotSubmission(
  ctx: MutationCtx,
  input: {
    costDocumentIds: Id<"costDocuments">[];
    target: ResolvedReviewTarget;
  }
) {
  if (input.target.kind === "draw") {
    return await snapshotDrawSubmission(ctx, {
      costDocumentIds: input.costDocumentIds,
      target: input.target,
    });
  }
  return await snapshotMilestoneSubmission(ctx, {
    costDocumentIds: input.costDocumentIds,
    target: input.target,
  });
}
async function snapshotDrawSubmission(
  ctx: MutationCtx,
  input: {
    costDocumentIds: Id<"costDocuments">[];
    target: Extract<ResolvedReviewTarget, { kind: "draw" }>;
  }
) {
  if (input.target.record.status !== "requested") {
    throw new ConvexError({
      code: "DRAW_REQUEST_SUBMISSION_REQUIRED",
      message: "Submit the canonical Draw request before review entry.",
      recoverable: true,
    });
  }
  if (input.costDocumentIds.length > 0) {
    throw new ConvexError({
      code: "DRAW_COST_DOCUMENT_ATTACHMENTS_UNSUPPORTED",
      message: "Receipt and invoice attachments belong to Milestone review.",
      recoverable: true,
    });
  }
  const allocations = await ctx.db
    .query("activeBuildDrawRequestAllocations")
    .withIndex("by_request", (query) =>
      query.eq("drawRequestId", input.target.record._id)
    )
    .take(EVIDENCE_REFERENCE_LIMIT + 1);
  if (allocations.length > EVIDENCE_REFERENCE_LIMIT) {
    throw new Error("Draw allocation snapshot limit exceeded.");
  }
  return {
    evidenceReferences: [],
    submission: {
      allocations: allocations.map((allocation) => ({
        amountCents: allocation.amountCents,
        drawGroupKey: allocation.drawGroupKey,
        milestoneId: allocation.buildMilestoneId,
        milestoneKey: allocation.milestoneKey,
        sourceOrder: allocation.sourceOrder,
      })),
      amountCents: input.target.record.amountCents,
      displayId: input.target.record.displayId,
      drawRequestId: input.target.record._id,
      kind: "draw" as const,
      label: input.target.record.label,
      note: input.target.record.note ?? null,
      requestedAt: input.target.record.requestedAt,
      requestKey: input.target.record.requestKey,
    },
  };
}

async function snapshotMilestoneSubmission(
  ctx: MutationCtx,
  input: {
    costDocumentIds: Id<"costDocuments">[];
    target: Extract<ResolvedReviewTarget, { kind: "milestone" }>;
  }
) {
  const { target } = input;

  const claim = recordValue(target.record.completionClaim);
  if (!(claim && stringValue(claim.submittedAt))) {
    throw new ConvexError({
      code: "MILESTONE_COMPLETION_REQUIRED",
      message: "Submit canonical Milestone completion before review entry.",
      recoverable: true,
    });
  }
  const evidenceReferences = await snapshotMilestoneEvidenceReferences(
    ctx,
    target,
    claim
  );

  const costDocumentReferences = await snapshotMilestoneCostDocuments(ctx, {
    costDocumentIds: input.costDocumentIds,
    target,
  });
  evidenceReferences.push(...costDocumentReferences);

  const requirements = reviewRequirements(target);
  const actualCostCents = numberValue(claim?.actualCostCents);
  if (requirements.receiptInvoiceRequired) {
    const actualCost = requireMoneyInteger(actualCostCents);
    const documentedTotal = costDocumentReferences.reduce(
      (sum, reference) =>
        reference.kind === "cost_document"
          ? safeMoneyAdd(sum, reference.amountCents)
          : sum,
      0
    );
    if (documentedTotal !== actualCost) {
      throw new ConvexError({
        actualCostCents: actualCost,
        code: "DOCUMENTED_TOTAL_MISMATCH",
        documentedTotalCents: documentedTotal,
        message:
          "Eligible current-cycle receipt and invoice total must equal actual cost.",
        recoverable: true,
      });
    }
  }

  const qualifyingSiteVisit = await qualifyingMilestoneSiteVisit(ctx, target);
  if (requirements.siteVisitRequired && !qualifyingSiteVisit) {
    throw new ConvexError({
      code: "SITE_VISIT_EVIDENCE_REQUIRED",
      message:
        "A completed Site Visit report with at least one photo is required.",
      recoverable: true,
    });
  }
  if (qualifyingSiteVisit) {
    evidenceReferences.push({
      completedAt: qualifyingSiteVisit.visit.completedAt,
      kind: "site_visit",
      label: `${target.record.name} Site Visit report`,
      milestoneKey: target.record.key,
      report: qualifyingSiteVisit.visit.recordNote,
      siteVisitId: qualifyingSiteVisit.visit._id,
    });
    evidenceReferences.push(
      ...qualifyingSiteVisit.photos.map((photo) => ({
        association: {
          kind: "site_visit" as const,
          siteVisitId: qualifyingSiteVisit.visit._id,
        },
        evidenceAssetId: photo._id,
        kind: "asset" as const,
        label: photo.label,
        ...(photo.locationFailureReason
          ? { locationFailureReason: photo.locationFailureReason }
          : {}),
        locationVerified: photo.locationVerified,
        milestoneKey: photo.milestoneKey,
        ...(photo.submilestoneKey
          ? { submilestoneKey: photo.submilestoneKey }
          : {}),
      }))
    );
  }
  if (evidenceReferences.length > EVIDENCE_REFERENCE_LIMIT) {
    throw new ConvexError({
      code: "EVIDENCE_REFERENCE_LIMIT_EXCEEDED",
      message: "The milestone evidence reference limit was exceeded.",
      recoverable: true,
    });
  }
  return {
    evidenceReferences,
    submission: {
      actualCostCents,
      completedDay: numberValue(claim?.completedDay),
      kind: "milestone" as const,
      milestoneId: target.record._id,
      milestoneKey: target.record.key,
      milestoneName: target.record.name,
      note: stringValue(claim?.note),
      progressPercent: target.record.progressPercent ?? null,
      submittedAt: stringValue(claim?.submittedAt),
    },
  };
}

async function snapshotMilestoneEvidenceReferences(
  ctx: MutationCtx,
  target: Extract<ResolvedReviewTarget, { kind: "milestone" }>,
  claim: Record<string, unknown>
) {
  const evidenceReferences: LenderPortalReviewEvidenceReference[] = [];
  const packageReferences = Array.isArray(claim.evidencePackageRevisionIds)
    ? claim.evidencePackageRevisionIds
    : [];
  if (
    packageReferences.length > EVIDENCE_REFERENCE_LIMIT ||
    evidenceReferences.length + packageReferences.length >
      EVIDENCE_REFERENCE_LIMIT
  ) {
    throw evidenceReferenceLimitError();
  }
  for (const reference of packageReferences) {
    const resolved = await resolveMilestonePackageReference(
      ctx,
      target,
      reference
    );
    evidenceReferences.push(resolved.packageReference);
    evidenceReferences.push(...resolved.assetReferences);
  }
  return evidenceReferences;
}

async function resolveMilestonePackageReference(
  ctx: MutationCtx,
  target: Extract<ResolvedReviewTarget, { kind: "milestone" }>,
  reference: unknown
) {
  const item = recordValue(reference);
  const rawId = item?.revisionId;
  const referencedRevision = numberValue(item?.revision);
  const referencedSubmilestoneKey = stringValue(item?.submilestoneKey);
  const revisionId =
    typeof rawId === "string"
      ? ctx.db.normalizeId("buildSubmilestoneEvidencePackageRevisions", rawId)
      : null;
  if (!(revisionId && referencedSubmilestoneKey)) {
    throw invalidEvidencePackageReference();
  }
  const packageRevision = await ctx.db.get(revisionId);
  const submilestone = packageRevision
    ? await ctx.db.get(packageRevision.buildSubmilestoneId)
    : null;
  if (
    !(
      packageRevision &&
      submilestone &&
      packageRevisionMatchesTarget({
        packageRevision,
        referencedRevision,
        referencedSubmilestoneKey,
        target,
      }) &&
      submilestoneMatchesPackage({
        packageRevision,
        referencedSubmilestoneKey,
        submilestone,
        target,
      })
    )
  ) {
    throw invalidEvidencePackageReference(referencedSubmilestoneKey);
  }
  const packageItems = await ctx.db
    .query("buildSubmilestoneEvidencePackageItems")
    .withIndex("by_package_revision", (query) =>
      query.eq("packageRevisionId", packageRevision._id)
    )
    .take(EVIDENCE_REFERENCE_LIMIT + 1);
  if (packageItems.length > EVIDENCE_REFERENCE_LIMIT) {
    throw evidenceReferenceLimitError();
  }
  const assetReferences: Extract<
    LenderPortalReviewEvidenceReference,
    { kind: "asset" }
  >[] = [];
  for (const item of packageItems) {
    const asset = await ctx.db.get(item.evidenceAssetId);
    if (
      !(
        asset &&
        packageItemMatchesTarget({
          asset,
          item,
          packageRevision,
          referencedSubmilestoneKey,
          target,
        })
      )
    ) {
      throw invalidEvidencePackageReference(referencedSubmilestoneKey);
    }
    assetReferences.push({
      association: {
        evidencePackageItemId: item._id,
        evidencePackageRevisionId: packageRevision._id,
        kind: "package_revision",
      },
      evidenceAssetId: asset._id,
      kind: "asset",
      label: asset.label,
      ...(asset.locationFailureReason
        ? { locationFailureReason: asset.locationFailureReason }
        : {}),
      locationVerified: asset.locationVerified,
      milestoneKey: asset.milestoneKey,
      submilestoneKey: referencedSubmilestoneKey,
    });
  }
  return {
    assetReferences,
    packageReference: {
      evidencePackageRevisionId: revisionId,
      kind: "package_revision" as const,
      label: `Evidence Package revision ${packageRevision.revision}`,
      milestoneKey: target.record.key,
      submilestoneKey: referencedSubmilestoneKey,
    },
  };
}

function packageItemMatchesTarget(input: {
  asset: Doc<"buildEvidenceAssets">;
  item: Doc<"buildSubmilestoneEvidencePackageItems">;
  packageRevision: Doc<"buildSubmilestoneEvidencePackageRevisions">;
  referencedSubmilestoneKey: string;
  target: Extract<ResolvedReviewTarget, { kind: "milestone" }>;
}) {
  return (
    input.item.packageRevisionId === input.packageRevision._id &&
    input.item.evidenceAssetId === input.asset._id &&
    input.item.buildId === input.target.build._id &&
    input.item.organizationId === input.target.build.organizationId &&
    input.item.brokerageId === input.target.build.brokerageId &&
    input.item.buildMilestoneId === input.target.record._id &&
    input.item.buildSubmilestoneId ===
      input.packageRevision.buildSubmilestoneId &&
    input.asset.buildId === input.target.build._id &&
    input.asset.organizationId === input.target.build.organizationId &&
    input.asset.brokerageId === input.target.build.brokerageId &&
    input.asset.proposalId === input.target.build.proposalId &&
    input.asset.milestoneKey === input.target.record.key &&
    input.asset.submilestoneKey === input.referencedSubmilestoneKey &&
    input.asset.evidencePackageRevisionId === input.packageRevision._id
  );
}

function packageRevisionMatchesTarget(input: {
  packageRevision: Doc<"buildSubmilestoneEvidencePackageRevisions">;
  referencedRevision: number | null;
  referencedSubmilestoneKey: string;
  target: Extract<ResolvedReviewTarget, { kind: "milestone" }>;
}) {
  return (
    input.packageRevision.buildId === input.target.build._id &&
    input.packageRevision.organizationId ===
      input.target.build.organizationId &&
    input.packageRevision.brokerageId === input.target.build.brokerageId &&
    input.packageRevision.proposalId === input.target.build.proposalId &&
    input.packageRevision.buildMilestoneId === input.target.record._id &&
    input.packageRevision.milestoneKey === input.target.record.key &&
    input.packageRevision.submilestoneKey === input.referencedSubmilestoneKey &&
    input.packageRevision.revision === input.referencedRevision &&
    input.packageRevision.status === "frozen"
  );
}

function submilestoneMatchesPackage(input: {
  packageRevision: Doc<"buildSubmilestoneEvidencePackageRevisions">;
  referencedSubmilestoneKey: string;
  submilestone: Doc<"buildSubmilestones">;
  target: Extract<ResolvedReviewTarget, { kind: "milestone" }>;
}) {
  return (
    input.submilestone._id === input.packageRevision.buildSubmilestoneId &&
    input.submilestone.buildId === input.target.build._id &&
    input.submilestone.organizationId === input.target.build.organizationId &&
    input.submilestone.brokerageId === input.target.build.brokerageId &&
    input.submilestone.buildMilestoneId === input.target.record._id &&
    input.submilestone.milestoneKey === input.target.record.key &&
    input.submilestone.key === input.referencedSubmilestoneKey &&
    input.submilestone.planningState !== "superseded"
  );
}

async function snapshotMilestoneCostDocuments(
  ctx: MutationCtx,
  input: {
    costDocumentIds: Id<"costDocuments">[];
    target: Extract<ResolvedReviewTarget, { kind: "milestone" }>;
  }
) {
  if (input.costDocumentIds.length > COST_DOCUMENT_LIMIT) {
    throw new ConvexError({
      code: "COST_DOCUMENT_LIMIT_EXCEEDED",
      message: `A review cycle accepts at most ${COST_DOCUMENT_LIMIT} cost documents.`,
      recoverable: true,
    });
  }
  if (
    new Set(input.costDocumentIds.map(String)).size !==
    input.costDocumentIds.length
  ) {
    throw new ConvexError({
      code: "DUPLICATE_COST_DOCUMENT_ATTACHMENT",
      message: "Attach each receipt or invoice once per review cycle.",
      recoverable: true,
    });
  }

  const references: Extract<
    LenderPortalReviewEvidenceReference,
    { kind: "cost_document" | "cost_document_page" }
  >[] = [];
  for (const costDocumentId of input.costDocumentIds) {
    references.push(
      ...(await snapshotMilestoneCostDocument(
        ctx,
        input.target,
        costDocumentId
      ))
    );
  }
  return references;
}

async function snapshotMilestoneCostDocument(
  ctx: MutationCtx,
  target: Extract<ResolvedReviewTarget, { kind: "milestone" }>,
  costDocumentId: Id<"costDocuments">
) {
  const document = await ctx.db.get(costDocumentId);
  if (!(document && costDocumentMatchesTarget(document, target))) {
    throw costDocumentUnavailableError();
  }
  requireMoneyInteger(document.grossTotalCents);
  const allocations = await ctx.db
    .query("costDocumentAllocations")
    .withIndex("by_costDocumentId_and_order", (query) =>
      query.eq("costDocumentId", document._id)
    )
    .take(EVIDENCE_REFERENCE_LIMIT + 1);
  if (allocations.length > EVIDENCE_REFERENCE_LIMIT) {
    throw costDocumentUnavailableError();
  }
  let amountCents = 0;
  for (const allocation of allocations) {
    const submilestone = await ctx.db.get(allocation.buildSubmilestoneId);
    if (
      !(
        allocationMatchesTarget(allocation, target) &&
        allocation.costDocumentId === document._id &&
        submilestone &&
        submilestoneMatchesCostDocumentTarget(submilestone, target) &&
        allocation.submilestoneKeySnapshot === submilestone.key &&
        allocation.submilestoneNameSnapshot === submilestone.name
      )
    ) {
      throw costDocumentUnavailableError();
    }
    amountCents = safeMoneyAdd(
      amountCents,
      requireMoneyInteger(allocation.amountCents)
    );
  }
  if (amountCents === 0) {
    throw costDocumentUnavailableError();
  }
  const pages = await ctx.db
    .query("costDocumentPages")
    .withIndex("by_costDocumentId_and_order", (query) =>
      query.eq("costDocumentId", document._id)
    )
    .take(EVIDENCE_REFERENCE_LIMIT + 1);
  if (pages.length === 0 || pages.length > EVIDENCE_REFERENCE_LIMIT) {
    throw costDocumentUnavailableError();
  }
  const pageReferences: Extract<
    LenderPortalReviewEvidenceReference,
    { kind: "cost_document_page" }
  >[] = [];
  for (const page of pages) {
    const asset = await ctx.db.get(page.assetId);
    if (
      !asset ||
      page.costDocumentId !== document._id ||
      page.buildId !== target.build._id ||
      page.organizationId !== target.build.organizationId ||
      page.brokerageId !== target.build.brokerageId ||
      asset.buildId !== target.build._id ||
      asset.organizationId !== target.build.organizationId ||
      asset.brokerageId !== target.build.brokerageId ||
      asset.storageDeletedAt !== undefined ||
      (asset.contentHashSha256 !== undefined &&
        asset.contentHashSha256 !== page.contentHashSha256Snapshot)
    ) {
      throw costDocumentUnavailableError();
    }
    pageReferences.push({
      assetId: asset._id,
      costDocumentId: document._id,
      costDocumentPageId: page._id,
      kind: "cost_document_page",
      label: page.fileNameSnapshot,
      milestoneKey: target.record.key,
      order: page.order,
    });
  }
  return [
    {
      amountCents,
      costDocumentId: document._id,
      currency: "CAD",
      documentKind: document.kind,
      kind: "cost_document",
      label: document.title,
      milestoneKey: target.record.key,
    },
    ...pageReferences,
  ] as Extract<
    LenderPortalReviewEvidenceReference,
    { kind: "cost_document" | "cost_document_page" }
  >[];
}

function costDocumentMatchesTarget(
  document: Doc<"costDocuments">,
  target: Extract<ResolvedReviewTarget, { kind: "milestone" }>
) {
  return (
    document.buildId === target.build._id &&
    document.organizationId === target.build.organizationId &&
    document.brokerageId === target.build.brokerageId &&
    document.state === "submitted" &&
    document.voidedAt === undefined &&
    document.supersededAt === undefined &&
    document.supersededByCostDocumentId === undefined &&
    document.currency === "CAD"
  );
}

function allocationMatchesTarget(
  allocation: Doc<"costDocumentAllocations">,
  target: Extract<ResolvedReviewTarget, { kind: "milestone" }>
) {
  return (
    allocation.buildId === target.build._id &&
    allocation.organizationId === target.build.organizationId &&
    allocation.brokerageId === target.build.brokerageId
  );
}

function submilestoneMatchesCostDocumentTarget(
  submilestone: Doc<"buildSubmilestones">,
  target: Extract<ResolvedReviewTarget, { kind: "milestone" }>
) {
  return (
    submilestone.buildId === target.build._id &&
    submilestone.organizationId === target.build.organizationId &&
    submilestone.brokerageId === target.build.brokerageId &&
    submilestone.buildMilestoneId === target.record._id &&
    submilestone.milestoneKey === target.record.key &&
    submilestone.planningState !== "superseded"
  );
}

async function qualifyingMilestoneSiteVisit(
  ctx: ReviewCtx,
  target: Extract<ResolvedReviewTarget, { kind: "milestone" }>
) {
  const visits = await ctx.db
    .query("buildSiteVisits")
    .withIndex("by_build_milestone", (query) =>
      query
        .eq("buildId", target.build._id)
        .eq("milestoneKey", target.record.key)
    )
    .order("desc")
    .take(EVIDENCE_REFERENCE_LIMIT + 1);
  if (visits.length > EVIDENCE_REFERENCE_LIMIT) {
    throw new ConvexError({
      code: "SITE_VISIT_LIMIT_EXCEEDED",
      message: "The Milestone Site Visit limit was exceeded.",
      recoverable: false,
    });
  }
  for (const visit of visits) {
    if (
      visit.buildMilestoneId !== target.record._id ||
      visit.organizationId !== target.build.organizationId ||
      visit.brokerageId !== target.build.brokerageId ||
      visit.status !== "complete" ||
      !visit.completedAt ||
      !visit.recordNote?.trim()
    ) {
      continue;
    }
    const visitAssets = await ctx.db
      .query("buildEvidenceAssets")
      .withIndex("by_site_visit", (query) => query.eq("siteVisitId", visit._id))
      .take(EVIDENCE_REFERENCE_LIMIT + 1);
    if (visitAssets.length > EVIDENCE_REFERENCE_LIMIT) {
      throw evidenceReferenceLimitError();
    }
    const photos = visitAssets.filter(
      (asset) =>
        asset.siteVisitId === visit._id &&
        asset.buildId === target.build._id &&
        asset.organizationId === target.build.organizationId &&
        asset.brokerageId === target.build.brokerageId &&
        asset.proposalId === target.build.proposalId &&
        asset.milestoneKey === target.record.key &&
        asset.mimeType.toLowerCase().startsWith("image/")
    );
    if (photos.length > 0) {
      return {
        photos,
        visit: {
          ...visit,
          completedAt: visit.completedAt,
          recordNote: visit.recordNote.trim(),
        },
      };
    }
  }
  return null;
}

export async function reviewEvidenceProjection(
  ctx: ReviewCtx,
  target: ResolvedReviewTarget,
  cycleId: Id<"lenderPortalReviewCycles">
) {
  const cycle = await requireCurrentCycle(ctx, target);
  if (
    cycle._id !== cycleId ||
    cycle.requestIdentity !== target.requestIdentity ||
    cycle.buildId !== target.build._id ||
    cycle.organizationId !== target.build.organizationId ||
    cycle.brokerageId !== target.build.brokerageId ||
    cycle.kind !== target.kind
  ) {
    throw safeUnavailableError();
  }
  const files: Array<{
    downloadUrl: string | null;
    fileName: string;
    mimeType: string;
    reference:
      | { evidenceAssetId: Id<"buildEvidenceAssets">; kind: "asset" }
      | {
          assetId: Id<"buildCollaborationAssets">;
          costDocumentId: Id<"costDocuments">;
          costDocumentPageId: Id<"costDocumentPages">;
          kind: "cost_document_page";
        };
    sizeBytes: number;
  }> = [];
  for (const reference of cycle.evidenceReferences) {
    if (reference.kind === "asset") {
      if (target.kind !== "milestone") {
        throw safeUnavailableError();
      }
      const asset = await ctx.db.get(reference.evidenceAssetId);
      let valid = Boolean(
        asset &&
          asset.buildId === target.build._id &&
          asset.organizationId === target.build.organizationId &&
          asset.brokerageId === target.build.brokerageId &&
          asset.proposalId === target.build.proposalId &&
          asset.milestoneKey === target.record.key
      );
      if (asset && reference.association.kind === "package_revision") {
        const [item, packageRevision] = await Promise.all([
          ctx.db.get(reference.association.evidencePackageItemId),
          ctx.db.get(reference.association.evidencePackageRevisionId),
        ]);
        valid = Boolean(
          valid &&
            item &&
            packageRevision &&
            packageRevisionMatchesTarget({
              packageRevision,
              referencedRevision: packageRevision.revision,
              referencedSubmilestoneKey:
                reference.submilestoneKey ?? packageRevision.submilestoneKey,
              target,
            }) &&
            packageItemMatchesTarget({
              asset,
              item,
              packageRevision,
              referencedSubmilestoneKey:
                reference.submilestoneKey ?? packageRevision.submilestoneKey,
              target,
            })
        );
      } else if (asset && reference.association.kind === "site_visit") {
        const visit = await ctx.db.get(reference.association.siteVisitId);
        valid = Boolean(
          valid &&
            visit &&
            asset.siteVisitId === visit._id &&
            visit.buildId === target.build._id &&
            visit.buildMilestoneId === target.record._id &&
            visit.organizationId === target.build.organizationId &&
            visit.brokerageId === target.build.brokerageId &&
            visit.status === "complete"
        );
      }
      if (!(valid && asset)) {
        throw safeUnavailableError();
      }
      files.push({
        downloadUrl: asset.storageId
          ? await ctx.storage.getUrl(asset.storageId)
          : null,
        fileName: asset.fileName,
        mimeType: asset.mimeType,
        reference: {
          evidenceAssetId: asset._id,
          kind: "asset",
        },
        sizeBytes: asset.sizeBytes,
      });
      continue;
    }
    if (reference.kind !== "cost_document_page") {
      continue;
    }
    if (target.kind !== "milestone") {
      throw safeUnavailableError();
    }
    const [page, document, asset] = await Promise.all([
      ctx.db.get(reference.costDocumentPageId),
      ctx.db.get(reference.costDocumentId),
      ctx.db.get(reference.assetId),
    ]);
    if (
      !(page && document && asset) ||
      page._id !== reference.costDocumentPageId ||
      page.assetId !== asset._id ||
      page.costDocumentId !== document._id ||
      page.buildId !== target.build._id ||
      page.organizationId !== target.build.organizationId ||
      page.brokerageId !== target.build.brokerageId ||
      !costDocumentMatchesTarget(document, target) ||
      asset.buildId !== target.build._id ||
      asset.organizationId !== target.build.organizationId ||
      asset.brokerageId !== target.build.brokerageId ||
      asset.storageDeletedAt !== undefined
    ) {
      throw safeUnavailableError();
    }
    files.push({
      downloadUrl: await ctx.storage.getUrl(asset.storageId),
      fileName: page.fileNameSnapshot,
      mimeType: page.mimeTypeSnapshot,
      reference: {
        assetId: asset._id,
        costDocumentId: document._id,
        costDocumentPageId: page._id,
        kind: "cost_document_page",
      },
      sizeBytes: asset.sizeBytes,
    });
  }
  return {
    cycleId: cycle._id,
    cycleNumber: cycle.cycleNumber,
    evidenceReferences: cycle.evidenceReferences,
    files,
  };
}

export async function requireCurrentCycle(
  ctx: ReviewCtx,
  target: ResolvedReviewTarget
) {
  const cycleId = target.record.currentLenderPortalReviewCycleId;
  const cycle = cycleId ? await ctx.db.get(cycleId) : null;
  if (
    !(cycle && cycle.isCurrent) ||
    cycle.requestIdentity !== target.requestIdentity ||
    cycle.buildId !== target.build._id ||
    cycle.brokerageId !== target.build.brokerageId ||
    cycle.organizationId !== target.build.organizationId ||
    cycle.cycleNumber !== target.record.currentLenderPortalReviewCycleNumber ||
    (target.kind === "milestone"
      ? cycle.kind !== "milestone" ||
        cycle.milestoneId !== target.record._id ||
        cycle.submission.kind !== "milestone" ||
        cycle.submission.milestoneId !== target.record._id
      : cycle.kind !== "draw" ||
        cycle.drawRequestId !== target.record._id ||
        cycle.submission.kind !== "draw" ||
        cycle.submission.drawRequestId !== target.record._id)
  ) {
    throw safeUnavailableError();
  }
  return cycle;
}

/**
 * Canonical read-only evidence projection for a current Milestone review.
 *
 * Lender Build detail uses this helper so its evidence, receipt/invoice, and
 * Site Visit facts pass through the same exact-cycle and source-row integrity
 * checks as the focused review boundary. It intentionally exposes no mutation
 * or decision capability.
 */
export async function projectCurrentMilestoneReviewEvidence(
  ctx: QueryCtx,
  build: Doc<"activeBuilds">,
  milestone: Doc<"buildMilestones">
) {
  if (
    !milestone.currentLenderPortalReviewCycleId ||
    milestone.currentLenderPortalReviewCycleNumber === undefined
  ) {
    return null;
  }
  const target: Extract<ResolvedReviewTarget, { kind: "milestone" }> = {
    build,
    kind: "milestone",
    label: milestone.name,
    record: milestone,
    requestIdentity: `milestone:${String(milestone._id)}`,
  };
  const cycle = await requireCurrentCycle(ctx, target);
  const evidence = await reviewEvidenceProjection(ctx, target, cycle._id);
  return {
    evidence,
    requirements: cycle.requirements,
    submission: cycle.submission,
  };
}
