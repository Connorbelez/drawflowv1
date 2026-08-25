import type { ActiveBuildAuthorization } from "../activeBuildAccess";
import type { AuthorizedViewer } from "../authz";
import { isCleanCollaborationAsset } from "../build_collaboration_asset_access";
import {
  abandonUnpublishedCostDocumentDraftAsset,
} from "../build_collaboration_assets";
import type { Doc, Id, MutationCtx, QueryCtx } from "../types";
import {
  MAX_ALLOCATIONS,
  MAX_FINANCIAL_COMPONENTS,
  MAX_PAGES,
  MAX_VENDOR_OPTIONS,
  SUPPORTING_CONTEXT_DISCLOSURE,
  activeBuildScopeFields,
  costDocumentDraftStepValidator,
  optionalDraftText,
  requiredDocumentDate,
  requiredText,
  positiveCents,
  requiredAssetHash,
  stepIndex,
} from "./contracts";
import {
  assertCurrentCostDocumentAllocationScope,
  assertExpectedCostDocumentBatchRevision,
  assertExpectedCostDocumentDraftRevision,
  canManageCostDocumentDraftCollaboration,
  currentCostDocumentBatchCreatorCapacity,
  currentCostDocumentBatchRevision,
  currentCostDocumentDraftRevision,
  costDocumentDraftCapabilities,
  listCurrentCostDocumentDraftCollaborators,
  listEligibleCostDocumentDraftCollaborators,
  requireCostDocumentDraftAccess,
  requireCurrentContractorCostDocumentScope,
} from "../cost_document_access";
import {
  requireActiveCostDocumentVendorProfile,
} from "./vendor";
import {
  assertDraftAllocationScope,
  assertDraftComponentScope,
  assertDraftOwnershipScope,
  assertDraftPageScope,
} from "./submission_support";
export async function listBatchDrafts(
  ctx: QueryCtx | MutationCtx,
  batchId: Id<"costDocumentBatches">
) {
  return await ctx.db
    .query("costDocumentDrafts")
    .withIndex("by_batchId_and_order", (query) => query.eq("batchId", batchId))
    .order("asc")
    .collect();
}

export async function projectCostDocumentBatch(
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

export async function projectCostDocumentDraft(
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

export async function requireAvailableDraftSourcePages(
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

export async function hasCostDocumentDraftSourceAuthority(
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

export async function replaceDraftPages(
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

export async function markReplacedDraftPages(
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

export async function insertDraftPageReplacements(
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

export async function retireReplacedDraftAssets(
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

export async function consumeDraftPageSessions(
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

export async function validateDraftAllocations(
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

export function validateFinancialComponents(
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

export async function replaceDraftAllocations(
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

export async function replaceDraftFinancialComponents(
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

export async function validateDraftCapture(
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

export async function validateDraftBalance(
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

export async function validateCompleteDraft(
  ctx: MutationCtx,
  authorization: ActiveBuildAuthorization,
  draft: Doc<"costDocumentDrafts">
) {
  await validateDraftBalance(ctx, authorization, draft);
}

export async function validateDraftForSubmission(
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

export async function awaitSubmilestone(
  ctx: MutationCtx,
  submilestoneId: Id<"buildSubmilestones">
) {
  const submilestone = await ctx.db.get(submilestoneId);
  if (!submilestone) {
    throw new Error("Cost Allocation Sub-milestone is unavailable.");
  }
  return submilestone;
}

export async function requiredDraftFacts(
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

export async function currentDraftPages(
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

export async function currentDraftAllocations(
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

export async function currentDraftFinancialComponents(
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

export async function resolveDraftAssets(
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

export function validateFinancialComponentsAgainstGross(
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
