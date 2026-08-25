import { v } from "convex/values";

import type { ActiveBuildAuthorization } from "../activeBuildAccess";
import {
  authenticatedMutation,
  authenticatedQuery,
} from "../authz";
import { isCleanCollaborationAsset } from "../build_collaboration_asset_access";
import {
  abandonUnpublishedCostDocumentDraftAsset,
} from "../build_collaboration_assets";
import { normalizeCostDocumentWorkingStateJson } from "../cost_document_working_state";
import { assertOrganizationRetentionWritable } from "../data_retention";
import type { Doc, Id, MutationCtx, QueryCtx } from "../types";
import {
  MAX_ALLOCATIONS,
  MAX_BATCH_DRAFTS,
  MAX_FINANCIAL_COMPONENTS,
  MAX_PAGES,
  activeBuildScopeFields,
  costDocumentActorCapacityFields,
  costDocumentBatchProjectionValidator,
  costDocumentCategoryValidator,
  costDocumentDraftPageProjectionValidator,
  costDocumentDraftStepValidator,
  costDocumentFinancialComponentInputValidator,
  costDocumentKindValidator,
  type CostDocumentActorCapacity,
  requiredIdempotencyKey,
  optionalIdempotencyKey,
  optionalDraftText,
  optionalText,
  nonNegativeCents,
  requiredDocumentDate,
  positiveCents,
} from "./contracts";
import {
  assertExpectedCostDocumentBatchRevision,
  assertExpectedCostDocumentDraftRevision,
  authorizeCostDocumentIntent,
  currentCostDocumentBatchRevision,
  currentCostDocumentDraftRevision,
  currentCostDocumentBatchCreatorCapacity,
  requireCostDocumentBatchCreator,
  requireCostDocumentDraftAccess,
  requireCostDocumentDraftCreator,
  requireCurrentContractorCostDocumentScope,
  assertCurrentCostDocumentAllocationScope,
} from "../cost_document_access";
import {
  authorizeCostDocumentBuilder,
  requireActiveCostDocumentVendorProfile,
} from "./vendor";
import {
  listBatchDrafts,
  projectCostDocumentBatch,
  projectCostDocumentDraft,
  requiredDraftFacts,
  currentDraftPages,
  currentDraftAllocations,
  currentDraftFinancialComponents,
  replaceDraftAllocations,
  replaceDraftFinancialComponents,
  validateDraftAllocations,
  validateFinancialComponents,
  validateDraftCapture,
  validateDraftBalance,
  validateCompleteDraft,
  replaceDraftPages,
  requireAvailableDraftSourcePages,
  hasCostDocumentDraftSourceAuthority,
  consumeDraftPageSessions,
  retireReplacedDraftAssets,
} from "./draft_state";
import { validateCostDocumentDraftStepTransition } from "./submission_support";
import { costDocumentDraftLifecycleState } from "./projections";
import {
  recordCostDocumentBatchAudit,
  recordCostDocumentDraftAudit,
} from "./submission";
import {
  requireCostDocumentBatchOwner,
  findLegacyActiveCostDocumentBatch,
  assertBatchOwnership,
  assertDraftOwnershipScope,
  assertDraftPageScope,
  assertDraftPageMutationAllowed,
} from "./submission_support";
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
