/**
 * Production proposals active build documents bounded-context implementation.
 * The parent facade re-exports its handlers to preserve production_proposals function references.
 */
import { v } from "convex/values";
import { authenticatedMutation } from "../authz";
import { isCleanCollaborationAsset } from "../build_collaboration_asset_access";
import { normalizeOperationalIdempotencyKey, operationalRequestFingerprint } from "../build_operational_idempotency";
import { type Doc } from "../types";
import { getActiveBuildMilestoneOrThrow, assertActiveBuildPlanningTargetActive } from "./active_planning.js";
import { authorizeActiveBuildOrThrow, requireBackofficeActiveBuildWrite } from "./authorization_core.js";
import { normalizeOptionalString, activeBuildCompletionReviewRecord, activeBuildPendingCompletionReview } from "./contractor_policy_helpers.js";
import { activeBuildNoteVisibility } from "./contracts_workflow.js";
import { writeActiveBuildEvent } from "./proposal_copy_audit.js";

export const reviewActiveBuildEvidence = authenticatedMutation
  .input({
    accepted: v.boolean(),
    buildId: v.id("activeBuilds"),
    milestoneKey: v.string(),
    note: v.optional(v.string()),
    workosOrganizationId: v.string(),
  })
  .returns(v.null())
  .handler(async (ctx, args) => {
    const auth = await authorizeActiveBuildOrThrow(
      ctx,
      args.buildId,
      args.workosOrganizationId,
    );
    requireBackofficeActiveBuildWrite(auth);
    const milestone = await getActiveBuildMilestoneOrThrow(
      ctx,
      args.buildId,
      args.milestoneKey,
    );
    assertActiveBuildPlanningTargetActive(milestone);
    const reviewedAt = new Date().toISOString();
    const note = normalizeOptionalString(args.note);
    if (!(args.accepted || note)) {
      throw new Error("A requested change note is required.");
    }
    const existingReview = activeBuildCompletionReviewRecord(
      milestone.completionReview,
    );
    const existingEvidenceReview = activeBuildCompletionReviewRecord(
      existingReview.evidenceReview,
    );
    const reviewChanged = args.accepted
      ? existingEvidenceReview.accepted !== true ||
        existingEvidenceReview.note !== note
      : existingReview.status !== "approved" &&
        (existingReview.status !== "revisionRequested" ||
          existingReview.note !== note);
    const collaborationEvidenceEventRevision = reviewChanged
      ? (milestone.collaborationEvidenceEventRevision ?? 0) + 1
      : milestone.collaborationEvidenceEventRevision;
    const completionReview = args.accepted
      ? {
          ...activeBuildPendingCompletionReview(existingReview),
          evidenceReview: {
            accepted: true,
            ...(note ? { note } : {}),
            reviewedAt,
          },
          reviewedAt,
        }
      : existingReview.status === "approved"
        ? existingReview
        : {
            ...existingReview,
            note,
            reviewedAt,
            status: "revisionRequested",
          };
    await ctx.db.patch(milestone._id, {
      collaborationEvidenceEventRevision,
      completionReview,
      evidenceState: args.accepted ? "Accepted" : "Info requested",
      status:
        completionReview.status === "approved" ||
        milestone.status !== "complete"
          ? milestone.status
          : "in_progress",
      updatedAt: Date.now(),
    });
    await writeActiveBuildEvent(ctx, {
      auth,
      build: auth.build,
      command: "reviewActiveBuildEvidence",
      eventType: "active_build.evidence.reviewed",
      newState: JSON.stringify(completionReview),
      priorState: JSON.stringify(milestone.completionReview),
      reason: note,
    });
    return null;
  })
  .public();

export const addActiveBuildNote = authenticatedMutation
  .input({
    body: v.string(),
    buildId: v.id("activeBuilds"),
    visibility: activeBuildNoteVisibility,
    workosOrganizationId: v.string(),
  })
  .returns(v.null())
  .handler(async (ctx, args) => {
    await authorizeActiveBuildOrThrow(
      ctx,
      args.buildId,
      args.workosOrganizationId,
    );
    throw new Error(
      "Public/Internal Notes are retired. Publish a governed collaboration post instead.",
    );
  })
  .public();

export const addActiveBuildDocument = authenticatedMutation
  .input({
    buildId: v.id("activeBuilds"),
    clientOperationId: v.string(),
    documentType: v.union(
      v.literal("permit"),
      v.literal("budget"),
      v.literal("plan"),
      v.literal("supporting"),
    ),
    fileName: v.string(),
    governedAssetId: v.optional(v.id("buildCollaborationAssets")),
    mimeType: v.string(),
    sizeBytes: v.number(),
    storageId: v.optional(v.id("_storage")),
    supersedesDocumentId: v.optional(v.id("buildDocuments")),
    workosOrganizationId: v.string(),
  })
  .returns(v.null())
  .handler(async (ctx, args) => {
    const auth = await authorizeActiveBuildOrThrow(
      ctx,
      args.buildId,
      args.workosOrganizationId,
    );
    requireBackofficeActiveBuildWrite(auth);
    const now = Date.now();
    const fileName = args.fileName.trim();
    if (!fileName) {
      throw new Error("Document file name is required.");
    }
    const clientOperationId = normalizeOperationalIdempotencyKey(
      args.clientOperationId,
      "Document operation ID",
      128,
    );
    const clientOperationFingerprint = await operationalRequestFingerprint({
      documentType: args.documentType,
      fileName,
      governedAssetId: args.governedAssetId ? String(args.governedAssetId) : null,
      mimeType: args.mimeType,
      sizeBytes: Math.max(0, Math.round(args.sizeBytes)),
      storageId: args.storageId ? String(args.storageId) : null,
      supersedesDocumentId: args.supersedesDocumentId
        ? String(args.supersedesDocumentId)
        : null,
    });
    const existingOperation = await ctx.db
      .query("buildDocuments")
      .withIndex("by_build_operation", (query) =>
        query
          .eq("buildId", args.buildId)
          .eq("clientOperationId", clientOperationId),
      )
      .first();
    if (existingOperation) {
      if (
        existingOperation.clientOperationFingerprint !==
        clientOperationFingerprint
      ) {
        throw new Error(
          "This Document operation ID was already used for different content.",
        );
      }
      return null;
    }
    const governedAsset = args.governedAssetId
      ? await ctx.db.get(args.governedAssetId)
      : undefined;
    if (
      governedAsset &&
      (governedAsset.buildId !== args.buildId ||
        governedAsset.organizationId !== args.workosOrganizationId ||
        governedAsset.brokerageId !== auth.brokerage._id ||
        !isCleanCollaborationAsset(governedAsset))
    ) {
      throw new Error("The governed Document asset is unavailable for this Build.");
    }
    if (
      args.governedAssetId &&
      (!args.storageId || !governedAsset || governedAsset.storageId !== args.storageId)
    ) {
      throw new Error(
        "A governed Document asset must be clean and reference the same stored file.",
      );
    }
    const typeDocuments = await ctx.db
      .query("buildDocuments")
      .withIndex("by_build_type", (query) =>
        query.eq("buildId", args.buildId).eq("documentType", args.documentType),
      )
      .collect();
    const activeTypeDocuments = typeDocuments.filter(
      (document) =>
        document.status !== "superseded" && !document.supersededByDocumentId,
    );
    const supersededDocument =
      (args.supersedesDocumentId
        ? await ctx.db.get(args.supersedesDocumentId)
        : undefined) ?? undefined;
    if (
      supersededDocument &&
      (supersededDocument.buildId !== args.buildId ||
        supersededDocument.organizationId !== args.workosOrganizationId ||
        supersededDocument.documentType !== args.documentType)
    ) {
      throw new Error(
        "The superseded Document must be an active Document of the same type on this Build.",
      );
    }
    if (
      supersededDocument &&
      (supersededDocument.status === "superseded" ||
        supersededDocument.supersededByDocumentId)
    ) {
      throw new Error("The selected Document was already superseded.");
    }
    const currentTypeDocument = activeTypeDocuments.reduce<
      Doc<"buildDocuments"> | undefined
    >((current, candidate) => {
      if (!current) {
        return candidate;
      }
      const versionDelta = (candidate.version ?? 1) - (current.version ?? 1);
      if (versionDelta !== 0) {
        return versionDelta > 0 ? candidate : current;
      }
      return candidate.createdAt > current.createdAt ? candidate : current;
    }, undefined);
    if (
      args.documentType !== "supporting" &&
      supersededDocument &&
      currentTypeDocument?._id !== supersededDocument._id
    ) {
      throw new Error(
        "Only the current governing Document version can be superseded.",
      );
    }
    if (
      args.documentType !== "supporting" &&
      activeTypeDocuments.length > 0 &&
      !supersededDocument
    ) {
      throw new Error(
        "Select the current governing Document to supersede before adding another version.",
      );
    }
    const version =
      typeDocuments.reduce(
        (latest, document) => Math.max(latest, document.version ?? 1),
        0,
      ) + 1;
    const document = {
      brokerageId: auth.brokerage._id,
      buildId: args.buildId,
      clientOperationFingerprint,
      clientOperationId,
      createdAt: now,
      documentType: args.documentType,
      fileName,
      governedAssetId: args.governedAssetId,
      mimeType: args.mimeType,
      organizationId: args.workosOrganizationId,
      proposalId: auth.proposal._id,
      sizeBytes: Math.max(0, Math.round(args.sizeBytes)),
      status: "uploaded" as const,
      storageId: args.storageId,
      supersedesDocumentId: supersededDocument?._id,
      updatedAt: now,
      uploadedByWorkosUserId: auth.subject,
      version,
    };
    const documentId = await ctx.db.insert("buildDocuments", document);
    if (supersededDocument) {
      await ctx.db.patch(supersededDocument._id, {
        status: "superseded",
        supersededAt: now,
        supersededByDocumentId: documentId,
        updatedAt: now,
      });
    }
    await writeActiveBuildEvent(ctx, {
      auth,
      build: auth.build,
      command: "addActiveBuildDocument",
      eventType: "active_build.document.created",
      newState: JSON.stringify(document),
      priorState: supersededDocument
        ? JSON.stringify(supersededDocument)
        : undefined,
    });
    return null;
  })
  .public();
