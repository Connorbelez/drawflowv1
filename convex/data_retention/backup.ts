import { ConvexError, v } from "convex/values";

import {
  type ActiveBuildAuthorization,
  authorizeActiveBuildAccess,
} from "../activeBuildAccess";
import { authenticatedQuery } from "../authz";
import { internalMutation } from "../fluent";
import {
  BACKUP_RPO_MS,
  NEVER_PERSISTED_RETENTION_CONTROLS,
  PRODUCTION_NAMESPACE_PATTERN,
  backupManifestEligibleAt,
  backupManifestMetadataValidator,
} from "./contracts";
import { latestBackupManifest } from "./schedule";
import { sha256Hex } from "./operations";
import {
  boundedJson,
  requireRetentionAdmin,
  requiredText,
} from "./support";

export const getLatestDataRetentionBackupManifest = authenticatedQuery
  .input({ organizationId: v.string(), buildId: v.id("activeBuilds") })
  .returns(v.union(backupManifestMetadataValidator, v.null()))
  .handler(async (ctx, args) => {
    const authorization = await authorizeActiveBuildAccess(ctx, args);
    requireRetentionAdmin(authorization);
    const manifest = await latestBackupManifest(
      ctx,
      authorization.organizationId
    );
    if (!manifest) {
      return null;
    }
    return {
      _id: manifest._id,
      backupDate: manifest.backupDate,
      buildCount: manifest.buildCount,
      capturedAt: manifest.capturedAt,
      documentsCount: manifest.documentsCount,
      failureReason: manifest.failureReason,
      manifestSha256: manifest.manifestSha256,
      neverPersistedControls: manifest.neverPersistedControls,
      organizationId: manifest.organizationId,
      relationshipCount: manifest.relationshipCount,
      revisionLineageCount: manifest.revisionLineageCount,
      rpoDeadlineAt: manifest.rpoDeadlineAt,
      state: manifest.state,
      storageBytes: manifest.storageBytes,
      storageObjectsCount: manifest.storageObjectsCount,
      verifiedAt: manifest.verifiedAt,
    };
  })
  .public();

export const recordDataRetentionBackupManifest = internalMutation
  .input({
    backupDate: v.string(),
    brokerageId: v.id("brokerages"),
    buildCount: v.number(),
    capturedAt: v.number(),
    documentsCount: v.number(),
    failureReason: v.optional(v.string()),
    manifestJson: v.string(),
    manifestSha256: v.string(),
    neverPersistedControls: v.optional(v.array(v.string())),
    organizationId: v.string(),
    relationshipCount: v.number(),
    revisionLineageCount: v.number(),
    rpoDeadlineAt: v.number(),
    state: v.union(
      v.literal("pending"),
      v.literal("verified"),
      v.literal("failed")
    ),
    storageBytes: v.number(),
    storageObjectsCount: v.number(),
  })
  .returns(v.id("dataRetentionBackupManifests"))
  .handler(async (ctx, args) => {
    const manifestJson = boundedJson(args.manifestJson, "Backup manifest");
    const manifestSha256 = await sha256Hex(manifestJson);
    if (manifestSha256 !== args.manifestSha256.toLowerCase()) {
      throw new ConvexError(
        "Backup manifest SHA-256 does not match its canonical JSON body."
      );
    }
    const now = Date.now();
    if (
      !backupManifestEligibleAt({
        capturedAt: args.capturedAt,
        restoreRequestedAt: args.capturedAt,
        rpoDeadlineAt: args.rpoDeadlineAt,
      })
    ) {
      throw new ConvexError("Backup manifest RPO may not exceed 24 hours.");
    }
    const build = await ctx.db
      .query("activeBuilds")
      .withIndex("by_organizationId", (query) =>
        query.eq("organizationId", args.organizationId)
      )
      .filter((query) => query.eq(query.field("brokerageId"), args.brokerageId))
      .first();
    if (!build) {
      throw new ConvexError("Backup manifest organization is unavailable.");
    }
    const existing = await ctx.db
      .query("dataRetentionBackupManifests")
      .withIndex("by_organizationId_and_backupDate", (query) =>
        query
          .eq("organizationId", args.organizationId)
          .eq("backupDate", args.backupDate)
      )
      .unique();
    if (existing) {
      if (existing.brokerageId !== args.brokerageId) {
        throw new ConvexError(
          "Backup manifest brokerage does not match the declared tenant scope."
        );
      }
      if (existing.manifestSha256 !== args.manifestSha256) {
        throw new ConvexError("Backup date already has a different manifest.");
      }
      if (
        existing.state !== args.state ||
        existing.failureReason !== args.failureReason ||
        existing.manifestJson !== manifestJson ||
        existing.capturedAt !== args.capturedAt ||
        existing.rpoDeadlineAt !== args.rpoDeadlineAt ||
        existing.buildCount !== args.buildCount ||
        existing.documentsCount !== args.documentsCount ||
        existing.relationshipCount !== args.relationshipCount ||
        existing.revisionLineageCount !== args.revisionLineageCount ||
        existing.storageBytes !== args.storageBytes ||
        existing.storageObjectsCount !== args.storageObjectsCount
      ) {
        await ctx.db.patch(existing._id, {
          buildCount: args.buildCount,
          capturedAt: args.capturedAt,
          documentsCount: args.documentsCount,
          failureReason: args.failureReason,
          manifestJson,
          neverPersistedControls: args.neverPersistedControls ?? [
            ...NEVER_PERSISTED_RETENTION_CONTROLS,
          ],
          relationshipCount: args.relationshipCount,
          revisionLineageCount: args.revisionLineageCount,
          rpoDeadlineAt: args.rpoDeadlineAt,
          state: args.state,
          storageBytes: args.storageBytes,
          storageObjectsCount: args.storageObjectsCount,
          verifiedAt: args.state === "verified" ? now : undefined,
        });
      }
      return existing._id;
    }
    return await ctx.db.insert("dataRetentionBackupManifests", {
      backupDate: args.backupDate,
      brokerageId: args.brokerageId,
      buildCount: args.buildCount,
      capturedAt: args.capturedAt,
      createdByWorkosUserId: "system:backup-manifest",
      documentsCount: args.documentsCount,
      failureReason: args.failureReason,
      manifestJson,
      manifestSha256: args.manifestSha256,
      neverPersistedControls: args.neverPersistedControls ?? [
        ...NEVER_PERSISTED_RETENTION_CONTROLS,
      ],
      organizationId: args.organizationId,
      relationshipCount: args.relationshipCount,
      revisionLineageCount: args.revisionLineageCount,
      rpoDeadlineAt: args.rpoDeadlineAt,
      state: args.state,
      storageBytes: args.storageBytes,
      storageObjectsCount: args.storageObjectsCount,
      verifiedAt: args.state === "verified" ? now : undefined,
    });
  })
  .internal();

export const runQuarterlyDataRetentionDrill = internalMutation
  .input({
    backupManifestId: v.id("dataRetentionBackupManifests"),
    isolatedAccessBoundaryValidated: v.boolean(),
    isolatedNamespace: v.string(),
    organizationId: v.string(),
    productionStorageCredentialFingerprint: v.string(),
    productionTenantCredentialFingerprint: v.string(),
    quarterKey: v.string(),
    restoredBuildCount: v.number(),
    restoredDocumentsCount: v.number(),
    restoredRelationshipCount: v.number(),
    restoredRevisionLineageCount: v.number(),
    restoredSampleSourceSha256: v.string(),
    restoredStorageBytes: v.number(),
    restoredStorageObjectsCount: v.number(),
    productionAccessDenied: v.boolean(),
    storageCredentialFingerprint: v.string(),
    tenantCredentialFingerprint: v.string(),
  })
  .returns(v.id("dataRetentionDrills"))
  .handler(async (ctx, args) => {
    const quarterKey = requiredText(args.quarterKey, "Quarter key", 32);
    const existing = await ctx.db
      .query("dataRetentionDrills")
      .withIndex("by_organizationId_and_quarterKey", (query) =>
        query
          .eq("organizationId", args.organizationId)
          .eq("quarterKey", quarterKey)
      )
      .unique();
    if (existing) {
      return existing._id;
    }
    const manifest = await ctx.db.get(args.backupManifestId);
    if (
      !manifest ||
      manifest.organizationId !== args.organizationId ||
      manifest.state !== "verified"
    ) {
      throw new ConvexError(
        "Quarterly drill requires a verified tenant backup manifest."
      );
    }
    const isolatedNamespace = requiredText(
      args.isolatedNamespace,
      "Isolated drill namespace",
      200
    );
    if (
      PRODUCTION_NAMESPACE_PATTERN.test(isolatedNamespace) ||
      !isolatedNamespace.toLowerCase().startsWith("retention-drill-")
    ) {
      throw new ConvexError(
        "Quarterly drill namespace must be an explicit non-production retention-drill namespace."
      );
    }
    if (
      !(args.isolatedAccessBoundaryValidated && args.productionAccessDenied)
    ) {
      throw new ConvexError(
        "Quarterly drill requires validated isolated access boundaries and denied production access."
      );
    }
    const tenantCredentialFingerprint = requiredText(
      args.tenantCredentialFingerprint,
      "Drill tenant credential fingerprint",
      200
    );
    const storageCredentialFingerprint = requiredText(
      args.storageCredentialFingerprint,
      "Drill storage credential fingerprint",
      200
    );
    const productionTenantCredentialFingerprint = requiredText(
      args.productionTenantCredentialFingerprint,
      "Production tenant credential fingerprint",
      200
    );
    const productionStorageCredentialFingerprint = requiredText(
      args.productionStorageCredentialFingerprint,
      "Production storage credential fingerprint",
      200
    );
    const isolatedFingerprints = [
      tenantCredentialFingerprint,
      storageCredentialFingerprint,
    ];
    const productionFingerprints = [
      productionTenantCredentialFingerprint,
      productionStorageCredentialFingerprint,
    ];
    if (
      tenantCredentialFingerprint === storageCredentialFingerprint ||
      isolatedFingerprints.some((isolated) =>
        productionFingerprints.includes(isolated)
      )
    ) {
      throw new ConvexError(
        "Quarterly drill requires separate isolated tenant and storage credentials."
      );
    }
    const restoredSampleSourceSha256 = requiredText(
      args.restoredSampleSourceSha256,
      "Restored sample source SHA-256",
      200
    );
    const sampleSha256 = await sha256Hex(
      `${isolatedNamespace}:${restoredSampleSourceSha256}`
    );
    const isolationEvidenceSha256 = await sha256Hex(
      [
        isolatedNamespace,
        tenantCredentialFingerprint,
        storageCredentialFingerprint,
        productionTenantCredentialFingerprint,
        productionStorageCredentialFingerprint,
        String(args.isolatedAccessBoundaryValidated),
        String(args.productionAccessDenied),
      ].join(":")
    );
    const failures = [
      args.restoredBuildCount === 0 ? "No Builds were restored." : undefined,
      args.restoredRelationshipCount === 0
        ? "No relationships were restored."
        : undefined,
      args.restoredRevisionLineageCount === 0
        ? "No Cost Document revision lineage was restored."
        : undefined,
      args.restoredBuildCount === manifest.buildCount
        ? undefined
        : `Build count mismatch: expected ${manifest.buildCount}, observed ${args.restoredBuildCount}.`,
      args.restoredRelationshipCount === manifest.relationshipCount
        ? undefined
        : `Relationship count mismatch: expected ${manifest.relationshipCount}, observed ${args.restoredRelationshipCount}.`,
      args.restoredRevisionLineageCount === manifest.revisionLineageCount
        ? undefined
        : `Revision lineage mismatch: expected ${manifest.revisionLineageCount}, observed ${args.restoredRevisionLineageCount}.`,
      args.restoredDocumentsCount === manifest.documentsCount
        ? undefined
        : `Document count mismatch: expected ${manifest.documentsCount}, observed ${args.restoredDocumentsCount}.`,
      args.restoredStorageBytes === manifest.storageBytes
        ? undefined
        : `Storage byte mismatch: expected ${manifest.storageBytes}, observed ${args.restoredStorageBytes}.`,
      args.restoredStorageObjectsCount === manifest.storageObjectsCount
        ? undefined
        : `Storage object mismatch: expected ${manifest.storageObjectsCount}, observed ${args.restoredStorageObjectsCount}.`,
    ].filter((failure): failure is string => Boolean(failure));
    const now = Date.now();
    return await ctx.db.insert("dataRetentionDrills", {
      backupManifestId: manifest._id,
      buildCount: args.restoredBuildCount,
      brokerageId: manifest.brokerageId,
      completedAt: now,
      createdByWorkosUserId: "system:quarterly-retention-drill",
      failureReason: failures.length > 0 ? failures.join(" ") : undefined,
      isolatedNamespace,
      isolationEvidenceSha256,
      organizationId: args.organizationId,
      passed: failures.length === 0,
      quarterKey,
      relationshipCount: args.restoredRelationshipCount,
      revisionLineageCount: args.restoredRevisionLineageCount,
      sampleSha256,
      startedAt: now,
    });
  })
  .internal();
