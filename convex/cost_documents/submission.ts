import { v } from "convex/values";

import type { ActiveBuildAuthorization } from "../activeBuildAccess";
import {
  authenticatedMutation,
} from "../authz";
import { isCleanCollaborationAsset } from "../build_collaboration_asset_access";
import { abandonUnpublishedCostDocumentDraftAsset } from "../build_collaboration_assets";
import { enqueueCommunicationIntent } from "../email_transport";
import type { Doc, Id, MutationCtx, QueryCtx } from "../types";
import {
  MAX_BATCH_ALLOCATIONS,
  MAX_BATCH_DRAFTS,
  MAX_BATCH_FINANCIAL_COMPONENTS,
  MAX_BATCH_PAGES,
  MAX_ALLOCATIONS,
  MAX_PAGES,
  SUPPORTING_CONTEXT_DISCLOSURE,
  activeBuildScopeFields,
  costDocumentActorCapacityFields,
  costDocumentCategoryValidator,
  costDocumentDraftStepValidator,
  costDocumentFinancialComponentInputValidator,
  costDocumentIntegrityKindValidator,
  costDocumentKindValidator,
  type CostDocumentActorCapacity,
  optionalText,
  requiredAssetHash,
  requiredIdempotencyKey,
} from "./contracts";
import {
  assertCurrentCostDocumentAllocationScope,
  authorizeCostDocumentIntent,
  canReadSubmittedCostDocument,
  isCostDocumentInScope as isCostDocumentInScopeForAuthorization,
  requireCostDocumentBatchCreator,
  requireCostDocumentDraftAccess,
  requireCurrentContractorCostDocumentScope,
  currentCostDocumentBatchRevision,
  currentCostDocumentDraftRevision,
  assertExpectedCostDocumentBatchRevision,
} from "../cost_document_access";
import {
  listBatchDrafts,
  validateDraftForSubmission,
  validateDraftCapture,
  validateDraftBalance,
  currentDraftPages,
} from "./draft_state";
import {
  resolveCostDocumentUploaderEmail,
  requireSubmittedCostDocumentBatchReplay,
  assertDraftOwnershipScope,
  assertBatchOwnership,
  requireCostDocumentBatchOwner,
} from "./submission_support";
import {
  assessCostDocumentDuplicates,
  validateBatchDuplicateAssessments,
} from "./projections";
import {
  inspectCostDocumentPageIntegrity,
  recordCostDocumentIntegrityException,
  linkSubmittedCostDocumentCorrection,
} from "./corrections_integrity";
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


export type PreparedCostDocument = Awaited<
  ReturnType<typeof validateDraftForSubmission>
>;

export async function insertSubmittedCostDocument(
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

export async function recordCostDocumentBatchAudit(
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

export async function costDocumentFinancialAuditSummary(
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

export async function recordCostDocumentAudit(
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

export async function recordCostDocumentDraftAudit(
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
