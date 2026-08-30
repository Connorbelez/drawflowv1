import { ConvexError, v } from "convex/values";

import { internal } from "../_generated/api";
import {
  administrativeOverrideInputFields,
  appendGovernedAuditEvent,
  authorizeAdministrativeRecovery,
  requiredAdministrativeReason,
} from "../administrative_override_policy";
import {
  authorizeActiveBuildAccess,
} from "../activeBuildAccess";
import { authenticatedMutation } from "../authz";
import { internalMutation } from "../fluent";
import {
  RESTORE_COMPLETE_RTO_MS,
  RESTORE_START_RTO_MS,
  TOMBSTONE_RETENTION_MS,
  backupManifestEligibleAt,
} from "./contracts";
import {
  assertRetentionDeletionAllowed,
  hasActiveBuildRetentionHold,
} from "./access";
import {
  addTombstone,
  completeOperation,
  deleteStorageIfPresent,
  findOperation,
  findTombstone,
  requireRetentionTombstoneHmacKey,
} from "./operations";
import {
  boundedJson,
  requiredText,
} from "./support";

export const startDataRetentionRestore = authenticatedMutation
  .input({
    ...administrativeOverrideInputFields,
    buildId: v.id("activeBuilds"),
    confirmed: v.boolean(),
    correctionHistoryJson: v.string(),
    freshBackupManifestId: v.id("dataRetentionBackupManifests"),
    incidentReference: v.string(),
    organizationId: v.string(),
    reason: v.string(),
  })
  .returns(
    v.object({
      completionDeadlineAt: v.number(),
      incidentId: v.id("dataRetentionRestoreIncidents"),
      startDeadlineAt: v.number(),
      state: v.literal("started"),
    })
  )
  .handler(async (ctx, args) => {
    if (!args.confirmed) {
      throw new ConvexError(
        "Explicit confirmation is required to restore data."
      );
    }
    const reason = requiredAdministrativeReason(
      args.reason,
      "A restore reason"
    );
    const baseAuthorization = await authorizeActiveBuildAccess(ctx, args);
    const { authorization, breakGlass } = await authorizeAdministrativeRecovery(
      ctx,
      baseAuthorization,
      { ...args, reason }
    );
    if (!breakGlass) {
      throw new ConvexError(
        "Destructive restore requires Brokerage Admin break-glass authority."
      );
    }
    const incidentReference = requiredText(
      args.incidentReference,
      "Incident reference",
      200
    );
    const existingIncident = await ctx.db
      .query("dataRetentionRestoreIncidents")
      .withIndex("by_organizationId_and_incidentReference", (query) =>
        query
          .eq("organizationId", authorization.organizationId)
          .eq("incidentReference", incidentReference)
      )
      .unique();
    if (existingIncident?.state === "started") {
      return {
        completionDeadlineAt: existingIncident.targetCompletionDeadlineAt,
        incidentId: existingIncident._id,
        startDeadlineAt: existingIncident.targetStartDeadlineAt,
        state: "started" as const,
      };
    }
    if (existingIncident) {
      throw new ConvexError(
        "Restore incident reference already identifies a terminal restore."
      );
    }
    const manifest = await ctx.db.get(args.freshBackupManifestId);
    const now = Date.now();
    if (
      !manifest ||
      manifest.organizationId !== authorization.organizationId ||
      manifest.brokerageId !== authorization.brokerage._id ||
      manifest.state !== "verified" ||
      !backupManifestEligibleAt({
        capturedAt: manifest.capturedAt,
        restoreRequestedAt: now,
        rpoDeadlineAt: manifest.rpoDeadlineAt,
      })
    ) {
      throw new ConvexError(
        "A fresh verified backup manifest is required before restore."
      );
    }
    const incidentId = await ctx.db.insert("dataRetentionRestoreIncidents", {
      auditEventId: undefined,
      breakGlassConfirmed: true,
      brokerageId: authorization.brokerage._id,
      buildId: authorization.build._id,
      correctionHistoryJson: boundedJson(args.correctionHistoryJson),
      createdByWorkosUserId: authorization.viewer.subject,
      incidentReference,
      organizationId: authorization.organizationId,
      reason,
      freshBackupManifestId: manifest._id,
      startedAt: now,
      state: "started",
      targetCompletionDeadlineAt: now + RESTORE_COMPLETE_RTO_MS,
      targetStartDeadlineAt: now + RESTORE_START_RTO_MS,
    });
    const auditEventId = await appendGovernedAuditEvent(ctx, authorization, {
      breakGlass: true,
      command: "startDataRetentionRestore",
      entityId: incidentId,
      entityType: "dataRetentionRestoreIncident",
      eventType: "data_retention.restore.started",
      newState: { state: "started", freshBackupManifestId: manifest._id },
      now,
      overrideKind: "destructive_restore",
      priorState: { state: "not_started" },
      reason,
      targetRevisions: [
        {
          entityId: String(incidentId),
          entityType: "dataRetentionRestoreIncident",
        },
      ],
      warnings: ["RESTORE_REQUIRES_CORRECTION_HISTORY_REVIEW"],
    });
    await ctx.db.patch(incidentId, { auditEventId });
    return {
      completionDeadlineAt: now + RESTORE_COMPLETE_RTO_MS,
      incidentId,
      startDeadlineAt: now + RESTORE_START_RTO_MS,
      state: "started" as const,
    };
  })
  .public();
export const completeDataRetentionRestore = internalMutation
  .input({
    correctionHistoryJson: v.string(),
    incidentId: v.id("dataRetentionRestoreIncidents"),
    succeeded: v.boolean(),
  })
  .returns(v.null())
  .handler(async (ctx, args) => {
    const incident = await ctx.db.get(args.incidentId);
    if (!incident || incident.state !== "started") {
      return null;
    }
    await ctx.db.patch(incident._id, {
      completedAt: Date.now(),
      correctionHistoryJson: boundedJson(args.correctionHistoryJson),
      state: args.succeeded ? "completed" : "failed",
    });
    return null;
  })
  .internal();


export const approveAndDeleteDataRetentionFile = authenticatedMutation
  .input({
    ...administrativeOverrideInputFields,
    assetId: v.id("buildCollaborationAssets"),
    buildId: v.id("activeBuilds"),
    confirmed: v.boolean(),
    organizationId: v.string(),
    reason: v.string(),
  })
  .returns(
    v.object({
      assetId: v.id("buildCollaborationAssets"),
      tombstoneId: v.id("dataRetentionTombstones"),
    })
  )
  .handler(async (ctx, args) => {
    if (!args.confirmed) {
      throw new ConvexError(
        "Explicit approval is required before physical file deletion."
      );
    }
    const reason = requiredAdministrativeReason(
      args.reason,
      "A physical deletion reason"
    );
    const baseAuthorization = await authorizeActiveBuildAccess(ctx, args);
    const { authorization, breakGlass } = await authorizeAdministrativeRecovery(
      ctx,
      baseAuthorization,
      {
        ...args,
        reason,
      }
    );
    if (authorization.effectiveRole.role !== "admin") {
      throw new ConvexError(
        "Physical file deletion requires Brokerage Admin break-glass authority."
      );
    }
    requireRetentionTombstoneHmacKey();
    const asset = await ctx.db.get(args.assetId);
    if (
      !asset ||
      asset.buildId !== authorization.build._id ||
      asset.organizationId !== authorization.organizationId ||
      asset.brokerageId !== authorization.brokerage._id
    ) {
      throw new ConvexError("Asset is unavailable for physical deletion.");
    }
    if (asset.state === "available" || asset.publishedAt) {
      throw new ConvexError(
        "Published or available assets require a governed record disposition before deletion."
      );
    }
    if (
      await hasActiveBuildRetentionHold(ctx, {
        buildId: authorization.build._id,
        organizationId: authorization.organizationId,
      })
    ) {
      throw new ConvexError("Active legal hold blocks physical file deletion.");
    }
    const operationKey = `physical-file:${asset._id}`;
    const existing = await findOperation(
      ctx,
      authorization.organizationId,
      operationKey
    );
    if (existing?.state === "completed") {
      const tombstone = await findTombstone(
        ctx,
        "buildCollaborationAsset",
        String(asset._id)
      );
      if (!tombstone) {
        throw new ConvexError("Completed deletion is missing its tombstone.");
      }
      return { assetId: asset._id, tombstoneId: tombstone._id };
    }
    const now = Date.now();
    const operation =
      existing ??
      (await ctx.db
        .insert("dataRetentionOperations", {
          brokerageId: authorization.brokerage._id,
          buildId: authorization.build._id,
          operationKey,
          operationKind: "physical_file",
          organizationId: authorization.organizationId,
          reasonCode: "approved_physical_file_delete",
          scopeId: String(asset._id),
          scopeKind: "buildCollaborationAsset",
          startedAt: now,
          state: "started",
          updatedAt: now,
        })
        .then((id) => ctx.db.get(id)));
    if (!operation) {
      throw new ConvexError(
        "Physical deletion operation could not be initialized."
      );
    }
    if (!asset.storageDeletedAt) {
      if (
        await hasActiveBuildRetentionHold(ctx, {
          buildId: authorization.build._id,
          organizationId: authorization.organizationId,
        })
      ) {
        throw new ConvexError(
          "Active legal hold blocks physical file deletion."
        );
      }
      await deleteStorageIfPresent(ctx, asset.storageId);
    }
    await ctx.db.patch(asset._id, {
      scanCompletedAt: now,
      scanMessage:
        "Physical file deleted under approved retention disposition.",
      scanState: "rejected",
      state: "rejected",
      storageDeletedAt: now,
      updatedAt: now,
    });
    const tombstoneId = await addTombstone(ctx, {
      build: authorization.build,
      completedAt: now,
      lifecycleState: asset.state,
      operation,
      physicalStorageDeletedAt: now,
      revisionCount: asset.version,
      scopeId: String(asset._id),
      scopeKind: "buildCollaborationAsset",
      sourceHashSha256: asset.contentHashSha256,
      tombstoneExpiresAt: now + TOMBSTONE_RETENTION_MS,
    });
    const auditEventId = await appendGovernedAuditEvent(ctx, authorization, {
      breakGlass,
      command: "approveAndDeleteDataRetentionFile",
      entityId: asset._id,
      entityType: "buildCollaborationAsset",
      eventType: "data_retention.physical_file.deleted",
      newState: { storageDeleted: true, tombstoneId },
      now,
      overrideKind: "retention_purge",
      priorState: { state: asset.state },
      reason,
      targetRevisions: [
        {
          entityId: String(asset._id),
          entityType: "buildCollaborationAsset",
          revision: asset.version,
        },
      ],
    });
    await ctx.db.patch(tombstoneId, { auditEventId });
    await completeOperation(ctx, operation, 1, now);
    return { assetId: asset._id, tombstoneId };
  })
  .public();
