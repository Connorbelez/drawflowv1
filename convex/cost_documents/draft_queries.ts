import { v } from "convex/values";

import { authenticatedMutation, authenticatedQuery } from "../authz";
import {
  assertExpectedCostDocumentDraftRevision,
  authorizeCostDocumentIntent,
  canManageCostDocumentDraftCollaboration,
  costDocumentDraftCapabilities,
  currentCostDocumentBatchCreatorCapacity,
  currentCostDocumentBatchRevision,
  currentCostDocumentDraftRevision,
  hasCurrentDraftCollaborationGrant,
  requireCostDocumentDraftAccess,
  requireEligibleCostDocumentDraftCollaborator,
} from "../cost_document_access";
import { recordCostDocumentDraftAudit } from "./audit";
import {
  activeBuildScopeFields,
  collaborativeCostDocumentDraftProjectionValidator,
  costDocumentActorCapacityFields,
  costDocumentBatchProjectionValidator,
  optionalText,
} from "./contracts";
import {
  projectCostDocumentBatch,
  projectCostDocumentDraft,
} from "./draft_state";
import {
  assertBatchOwnership,
  currentCostDocumentCreatorProfileId,
  findLegacyActiveCostDocumentBatch,
  isBatchOwnedBy,
} from "./submission_support";
export const getActiveCostDocumentBatch = authenticatedQuery
  .input(activeBuildScopeFields)
  .returns(v.union(costDocumentBatchProjectionValidator, v.null()))
  .handler(async (ctx, args) => {
    const authorization = await authorizeCostDocumentIntent(ctx, {
      ...args,
      intent: "create",
    });
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
    const authorization = await authorizeCostDocumentIntent(ctx, {
      ...args,
      intent: "create",
    });
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
