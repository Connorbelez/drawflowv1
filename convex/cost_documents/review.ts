import { v } from "convex/values";
import {
  administrativeOverrideInputFields,
  appendGovernedAuditEvent,
  authorizeAdministrativeRecovery,
} from "../administrative_override_policy";
import { authenticatedMutation } from "../authz";
import { authorizeCostDocumentIntent } from "../cost_document_access";
import { assertOrganizationRetentionWritable } from "../data_retention";
import type { Doc } from "../types";
import {
  costDocumentFinancialAuditSummary,
  recordCostDocumentAudit,
} from "./audit";
import {
  activeBuildScopeFields,
  costDocumentIntegrityExceptionProjectionValidator,
  costDocumentReviewOutcomeValidator,
  costDocumentReviewTypeValidator,
  MAX_PAGES,
  requiredIdempotencyKey,
  requiredText,
  sha256Text,
} from "./contracts";
import {
  createCostDocumentCorrection,
  reconcileSubmittedCostDocumentIntegrity,
} from "./corrections_integrity";
import {
  assertCostDocumentReviewerRole,
  hasSequentialCostDocumentOrders,
  requireReadableCostDocument,
} from "./projections";

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
