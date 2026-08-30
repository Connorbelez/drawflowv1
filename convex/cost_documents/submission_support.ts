import type { ActiveBuildAuthorization } from "../activeBuildAccess";
import { isCleanCollaborationAsset } from "../build_collaboration_asset_access";
import { normalizeContractorEmail } from "../contractorWorkspace";
import {
  currentCostDocumentBatchCreatorCapacity,
  requireCostDocumentBatchCreator,
  requireCurrentContractorCostDocumentScope,
} from "../cost_document_access";
import type { Doc, Id, MutationCtx, QueryCtx } from "../types";
import {
  MAX_ALLOCATIONS,
  MAX_BATCH_ALLOCATIONS,
  MAX_BATCH_DRAFTS,
  MAX_BATCH_FINANCIAL_COMPONENTS,
  MAX_BATCH_PAGES,
  MAX_FINANCIAL_COMPONENTS,
  MAX_PAGES,
  optionalText,
  positiveCents,
  requiredDocumentDate,
  requiredText,
  stepIndex,
} from "./contracts";
import {
  validateCompleteDraft,
  validateDraftBalance,
  validateDraftCapture,
  validateFinancialComponents,
  validateFinancialComponentsAgainstGross,
} from "./draft_state";
export type AuthorizedCostDocumentCtx = (QueryCtx | MutationCtx) & {
  viewer: ActiveBuildAuthorization["viewer"];
};

export async function resolveCostDocumentUploaderEmail(
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

export async function currentCostDocumentCreatorProfileId(
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

export async function requireCostDocumentBatchOwner(
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

export async function validateCostDocumentDraftStepTransition(
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
export async function requireSubmittedCostDocumentBatchReplay(
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

export async function requireSubmittedCostDocumentReplay(
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

export async function assertSubmittedReplayPages(
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

export async function assertSubmittedReplayAllocations(
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

export function assertSubmittedReplayFinancialComponents(
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

export function assertSubmittedReplayDocumentFacts(
  document: Doc<"costDocuments">
) {
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

export function assertExactSequentialOrders(
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

export function isValidSubmissionTimestamp(value: number | undefined) {
  return Number.isSafeInteger(value) && (value ?? 0) > 0;
}

export const SUBMITTED_REPLAY_ERROR =
  "The submitted Cost Document batch is incomplete.";

export function throwSubmittedCostDocumentReplayIncomplete(): never {
  throw new Error(SUBMITTED_REPLAY_ERROR);
}

export function assertBatchOwnership(
  batch: Doc<"costDocumentBatches">,
  authorization: ActiveBuildAuthorization
) {
  if (!isBatchOwnedBy(batch, authorization)) {
    throw new Error("The Cost Document batch is unavailable.");
  }
}

export async function findLegacyActiveCostDocumentBatch(
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

export function isBatchOwnedBy(
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

export function assertDraftOwnershipScope(
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

export function assertDraftPageScope(
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

export function assertDraftAllocationScope(
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

export function assertDraftComponentScope(
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

export function assertDraftPageMutationAllowed(
  draft: Doc<"costDocumentDrafts">
) {
  if (draft.activeStep !== "capture_confirm" || draft.lifecycle !== "draft") {
    throw new Error(
      "Cost Document source pages can be changed only during Capture & confirm on an open draft."
    );
  }
}
