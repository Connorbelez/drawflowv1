import {
  appendGovernedAuditEvent,
} from "../administrative_override_policy";
import type { ActiveBuildAuthorization } from "../activeBuildAccess";
import { isCleanCollaborationAsset } from "../build_collaboration_asset_access";
import { enqueueCommunicationIntent } from "../email_transport";
import type { Doc, Id, MutationCtx, QueryCtx } from "../types";
import {
  COST_DOCUMENT_INTEGRITY_KINDS,
  MAX_PAGES,
  isCurrentCostDocument,
} from "./contracts";
import {
  assertCurrentCostDocumentAllocationScope,
  authorizeCostDocumentIntent,
} from "../cost_document_access";
import {
  listBatchDrafts,
} from "./draft_state";
import {
  recordCostDocumentAudit,
} from "./submission";

export async function replayCostDocumentCorrection(
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

export async function requireCostDocumentCorrectionSource(
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

export async function createCostDocumentCorrection(
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

export async function linkSubmittedCostDocumentCorrection(
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

export async function reconcileSubmittedCostDocumentIntegrity(
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

export async function inspectCostDocumentPageIntegrity(
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

export async function recordCostDocumentIntegrityException(
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

export async function resolveCostDocumentPageIntegrityExceptions(
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

export function projectIntegrityException(
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
