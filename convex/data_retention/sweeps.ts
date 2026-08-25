import {
  assertRetentionDeletionAllowed,
  hasActiveBuildRetentionHold,
} from "./access";
import {
  CREDENTIAL_RETENTION_DAYS,
  COST_UPLOAD_RETENTION_DAYS,
  DAY_MS,
  ISOLATED_ASSET_RETENTION_DAYS,
  MAX_ROWS_PER_SWEEP,
  QUOTE_DRAFT_RECOVERY_DAYS,
  TOMBSTONE_RETENTION_MS,
} from "./contracts";
import {
  addSystemAuditedTombstone,
  addTombstone,
  beginOperation,
  completeOperation,
  deleteStorageIfPresent,
  recordSystemAudit,
  blockOperation,
  requireRetentionTombstoneHmacKey,
} from "./operations";
import type { Doc, Id, MutationCtx } from "../types";

export async function sweepBuildRetention(
  ctx: MutationCtx,
  build: Doc<"activeBuilds">,
  asOf: number
) {
  const totals = {
    blockedByLegalHold: 0,
    completedOperations: 0,
    deletedOrRedactedCount: 0,
    markedRecoveryCount: 0,
    tombstoneCount: 0,
  };
  const [legacyDrafts, activeDrafts, recoveryDrafts] = await Promise.all([
    ctx.db
      .query("quoteInvitationResponseDrafts")
      .withIndex(
        "by_buildId_and_retentionState_and_retentionNextCheckAt",
        (query) =>
          query
            .eq("buildId", build._id)
            .eq("retentionState", undefined)
            .eq("retentionNextCheckAt", undefined)
      )
      .take(MAX_ROWS_PER_SWEEP),
    ctx.db
      .query("quoteInvitationResponseDrafts")
      .withIndex(
        "by_buildId_and_retentionState_and_retentionNextCheckAt",
        (query) =>
          query
            .eq("buildId", build._id)
            .eq("retentionState", "active")
            .lte("retentionNextCheckAt", asOf)
      )
      .take(MAX_ROWS_PER_SWEEP),
    ctx.db
      .query("quoteInvitationResponseDrafts")
      .withIndex("by_buildId_and_retentionState_and_purgeEligibleAt", (query) =>
        query
          .eq("buildId", build._id)
          .eq("retentionState", "recovery")
          .lte("purgeEligibleAt", asOf)
      )
      .take(MAX_ROWS_PER_SWEEP),
  ]);
  const drafts = [...legacyDrafts, ...activeDrafts, ...recoveryDrafts].slice(
    0,
    MAX_ROWS_PER_SWEEP
  );
  for (const draft of drafts) {
    if (
      draft.organizationId !== build.organizationId ||
      draft.brokerageId !== build.brokerageId
    ) {
      continue;
    }
    const round = await ctx.db.get(draft.quoteRoundId);
    if (!round || (round.state !== "closed" && round.state !== "cancelled")) {
      await ctx.db.patch(draft._id, {
        retentionNextCheckAt: asOf + DAY_MS,
        retentionState: "active",
      });
      continue;
    }
    const terminalAt = draft.terminalAt ?? round.cancelledAt ?? round.closedAt;
    if (!terminalAt) {
      await ctx.db.patch(draft._id, {
        retentionNextCheckAt: asOf + DAY_MS,
        retentionState: "active",
      });
      continue;
    }
    const purgeEligibleAt =
      draft.purgeEligibleAt ?? terminalAt + QUOTE_DRAFT_RECOVERY_DAYS * DAY_MS;
    if (asOf < purgeEligibleAt) {
      if (
        draft.retentionState !== "recovery" ||
        draft.terminalAt !== terminalAt
      ) {
        await ctx.db.patch(draft._id, {
          purgeEligibleAt,
          retentionNextCheckAt: undefined,
          retentionState: "recovery",
          terminalAt,
        });
        totals.markedRecoveryCount += 1;
      }
      continue;
    }
    const operation = await beginOperation(ctx, {
      build,
      operationKey: `quote-draft:${draft._id}:${terminalAt}`,
      operationKind: "quote_draft",
      reasonCode: "terminal_quote_draft_expired",
      scopeId: String(draft._id),
      scopeKind: "quoteInvitationResponseDraft",
      now: asOf,
    });
    if (!operation || operation.state === "completed") {
      continue;
    }
    if (
      await hasActiveBuildRetentionHold(ctx, {
        buildId: build._id,
        organizationId: build.organizationId,
      })
    ) {
      await blockOperation(
        ctx,
        operation,
        "Active legal hold blocks Quote Draft purge.",
        asOf
      );
      totals.blockedByLegalHold += 1;
      continue;
    }
    const deletion = await deleteQuoteDraftChildren(ctx, build, draft._id);
    totals.deletedOrRedactedCount += deletion.deletedCount;
    const totalDeletedCount =
      (operation.affectedCount ?? 0) + deletion.deletedCount;
    if (!deletion.complete) {
      await ctx.db.patch(operation._id, {
        affectedCount: totalDeletedCount,
        updatedAt: asOf,
      });
      continue;
    }
    await ctx.db.patch(draft._id, {
      attachmentCount: 0,
      commentsHtml: undefined,
      purgedAt: asOf,
      retentionNextCheckAt: undefined,
      retentionState: "purged",
      purgeEligibleAt,
      terminalAt,
      updatedAt: asOf,
      version: draft.version + 1,
    });
    await completeOperation(ctx, operation, totalDeletedCount, asOf);
    const tombstoneId = await addTombstone(ctx, {
      build,
      completedAt: asOf,
      lifecycleState: "terminal_draft",
      operation,
      revisionCount: draft.version,
      scopeId: String(draft._id),
      scopeKind: "quoteInvitationResponseDraft",
      tombstoneExpiresAt: asOf + TOMBSTONE_RETENTION_MS,
    });
    const auditEventId = await recordSystemAudit(ctx, build, {
      command: "runDataRetentionMaintenance",
      entityId: draft._id,
      entityType: "quoteInvitationResponseDraft",
      eventType: "data_retention.quote_draft.purged",
      newState: {
        childRows: totalDeletedCount,
        retentionState: "purged",
        tombstoneId,
      },
      reason: "Terminal Quote Draft recovery window elapsed.",
      now: asOf,
    });
    await ctx.db.patch(tombstoneId, { auditEventId });
    totals.completedOperations += 1;
    totals.tombstoneCount += 1;
  }
  totals.deletedOrRedactedCount += await sweepCostUploadStaging(
    ctx,
    build,
    asOf,
    totals
  );
  totals.deletedOrRedactedCount += await sweepIsolatedAssets(
    ctx,
    build,
    asOf,
    totals
  );
  totals.deletedOrRedactedCount += await sweepCredentialMaterial(
    ctx,
    build,
    asOf,
    totals
  );
  return totals;
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Cost and Quote staging require ownership, hold, storage-bound, and tombstone guards in one bounded pass.
export async function sweepCostUploadStaging(
  ctx: MutationCtx,
  build: Doc<"activeBuilds">,
  asOf: number,
  totals: {
    blockedByLegalHold: number;
    completedOperations: number;
    deletedOrRedactedCount: number;
    markedRecoveryCount: number;
    tombstoneCount: number;
  }
) {
  let count = 0;
  const [openSessions, finalizedSessions] = await Promise.all([
    ctx.db
      .query("buildCollaborationAssetStagingSessions")
      .withIndex(
        "by_buildId_and_contextKind_and_state_and_expiresAt",
        (query) =>
          query
            .eq("buildId", build._id)
            .eq("contextKind", "costDocumentDraft")
            .eq("state", "open")
            .lte("expiresAt", asOf)
      )
      .take(MAX_ROWS_PER_SWEEP),
    ctx.db
      .query("buildCollaborationAssetStagingSessions")
      .withIndex(
        "by_buildId_and_contextKind_and_state_and_expiresAt",
        (query) =>
          query
            .eq("buildId", build._id)
            .eq("contextKind", "costDocumentDraft")
            .eq("state", "finalized")
            .lte("expiresAt", asOf)
      )
      .take(MAX_ROWS_PER_SWEEP),
  ]);
  const sessions = [...openSessions, ...finalizedSessions].slice(
    0,
    MAX_ROWS_PER_SWEEP
  );
  for (const session of sessions) {
    if (
      session.organizationId !== build.organizationId ||
      session.brokerageId !== build.brokerageId
    ) {
      continue;
    }
    const operation = await beginOperation(ctx, {
      build,
      operationKey: `cost-upload:${session._id}:${session.expiresAt}`,
      operationKind: "cost_upload",
      reasonCode: "staged_cost_upload_expired",
      scopeId: String(session._id),
      scopeKind: "buildCollaborationAssetStagingSession",
      now: asOf,
    });
    if (!operation || operation.state === "completed") {
      continue;
    }
    if (
      await hasActiveBuildRetentionHold(ctx, {
        buildId: build._id,
        organizationId: build.organizationId,
      })
    ) {
      await blockOperation(
        ctx,
        operation,
        "Active legal hold blocks staged Cost upload purge.",
        asOf
      );
      totals.blockedByLegalHold += 1;
      continue;
    }
    const asset = session.assetId ? await ctx.db.get(session.assetId) : null;
    let deleted = 0;
    if (session.pendingStorageId && !asset) {
      const pendingStorageId = session.pendingStorageId;
      const bound = await ctx.db
        .query("buildCollaborationAssetStagingSessions")
        .withIndex("by_pendingStorageId", (query) =>
          query.eq("pendingStorageId", pendingStorageId)
        )
        .take(2);
      if (bound.length === 1 && bound[0]?._id === session._id) {
        await assertRetentionDeletionAllowed(ctx, build);
        await deleteStorageIfPresent(ctx, pendingStorageId);
        deleted = 1;
      }
    }
    if (
      asset &&
      !asset.storageDeletedAt &&
      !asset.publishedAt &&
      asset.state !== "available"
    ) {
      await assertRetentionDeletionAllowed(ctx, build);
      await deleteStorageIfPresent(ctx, asset.storageId);
      await ctx.db.patch(asset._id, {
        scanCompletedAt: asOf,
        scanMessage: "Cost upload staging retention expired.",
        scanState: "rejected",
        state: "rejected",
        storageDeletedAt: asOf,
        updatedAt: asOf,
      });
      deleted = 1;
    }
    await ctx.db.patch(session._id, { state: "abandoned", updatedAt: asOf });
    await completeOperation(ctx, operation, deleted, asOf);
    await addSystemAuditedTombstone(
      ctx,
      {
        build,
        completedAt: asOf,
        lifecycleState: "staged_cost_upload",
        operation,
        scopeId: String(session._id),
        scopeKind: "buildCollaborationAssetStagingSession",
        tombstoneExpiresAt: asOf + TOMBSTONE_RETENTION_MS,
      },
      {
        command: "runDataRetentionMaintenance",
        entityId: session._id,
        entityType: "buildCollaborationAssetStagingSession",
        eventType: "data_retention.cost_upload_staging.purged",
        newState: { storageDeleted: deleted === 1 },
        now: asOf,
        reason: "Staged Cost upload retention window elapsed.",
      }
    );
    totals.completedOperations += 1;
    totals.tombstoneCount += 1;
    count += deleted;
  }
  const [openQuoteSessions, finalizedQuoteSessions] = await Promise.all([
    ctx.db
      .query("quoteInvitationResponseDraftAttachmentStagingSessions")
      .withIndex("by_buildId_and_state_and_expiresAt", (query) =>
        query
          .eq("buildId", build._id)
          .eq("state", "open")
          .lte("expiresAt", asOf)
      )
      .take(MAX_ROWS_PER_SWEEP),
    ctx.db
      .query("quoteInvitationResponseDraftAttachmentStagingSessions")
      .withIndex("by_buildId_and_state_and_expiresAt", (query) =>
        query
          .eq("buildId", build._id)
          .eq("state", "finalized")
          .lte("expiresAt", asOf)
      )
      .take(MAX_ROWS_PER_SWEEP),
  ]);
  const quoteSessions = [...openQuoteSessions, ...finalizedQuoteSessions].slice(
    0,
    MAX_ROWS_PER_SWEEP
  );
  for (const session of quoteSessions) {
    if (
      session.organizationId !== build.organizationId ||
      session.brokerageId !== build.brokerageId
    ) {
      continue;
    }
    const operation = await beginOperation(ctx, {
      build,
      operationKey: `quote-upload:${session._id}:${session.expiresAt}`,
      operationKind: "cost_upload",
      reasonCode: "staged_quote_upload_expired",
      scopeId: String(session._id),
      scopeKind: "quoteInvitationResponseDraftAttachmentStagingSession",
      now: asOf,
    });
    if (!operation || operation.state === "completed") {
      continue;
    }
    if (
      await hasActiveBuildRetentionHold(ctx, {
        buildId: build._id,
        organizationId: build.organizationId,
      })
    ) {
      await blockOperation(
        ctx,
        operation,
        "Active legal hold blocks staged Quote upload purge.",
        asOf
      );
      totals.blockedByLegalHold += 1;
      continue;
    }
    let deleted = 0;
    const pendingStorageId = session.pendingStorageId;
    if (pendingStorageId) {
      const bound = await ctx.db
        .query("quoteInvitationResponseDraftAttachments")
        .withIndex("by_storageId", (query) =>
          query.eq("storageId", pendingStorageId)
        )
        .take(1);
      if (bound.length === 0) {
        await assertRetentionDeletionAllowed(ctx, build);
        await deleteStorageIfPresent(ctx, pendingStorageId);
        deleted = 1;
      }
    }
    await ctx.db.patch(session._id, { state: "abandoned", updatedAt: asOf });
    await completeOperation(ctx, operation, deleted, asOf);
    await addSystemAuditedTombstone(
      ctx,
      {
        build,
        completedAt: asOf,
        lifecycleState: "staged_quote_upload",
        operation,
        scopeId: String(session._id),
        scopeKind: "quoteInvitationResponseDraftAttachmentStagingSession",
        tombstoneExpiresAt: asOf + TOMBSTONE_RETENTION_MS,
      },
      {
        command: "runDataRetentionMaintenance",
        entityId: session._id,
        entityType: "quoteInvitationResponseDraftAttachmentStagingSession",
        eventType: "data_retention.quote_upload_staging.purged",
        newState: { storageDeleted: deleted === 1 },
        now: asOf,
        reason: "Staged Quote upload retention window elapsed.",
      }
    );
    totals.completedOperations += 1;
    totals.tombstoneCount += 1;
    count += deleted;
  }
  return count;
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: The bounded fair-state sweep keeps age, tenancy, hold, storage, audit, and tombstone guards in one transaction.
export async function sweepIsolatedAssets(
  ctx: MutationCtx,
  build: Doc<"activeBuilds">,
  asOf: number,
  totals: {
    blockedByLegalHold: number;
    completedOperations: number;
    deletedOrRedactedCount: number;
    markedRecoveryCount: number;
    tombstoneCount: number;
  }
) {
  requireRetentionTombstoneHmacKey();
  const oldestEligibleCreatedAt = asOf - ISOLATED_ASSET_RETENTION_DAYS * DAY_MS;
  const [rejectedAssets, quarantinedAssets] = await Promise.all([
    ctx.db
      .query("buildCollaborationAssets")
      .withIndex(
        "by_buildId_and_state_and_storageDeletedAt_and_createdAt",
        (query) =>
          query
            .eq("buildId", build._id)
            .eq("state", "rejected")
            .eq("storageDeletedAt", undefined)
            .lte("createdAt", oldestEligibleCreatedAt)
      )
      .take(MAX_ROWS_PER_SWEEP),
    ctx.db
      .query("buildCollaborationAssets")
      .withIndex(
        "by_buildId_and_state_and_storageDeletedAt_and_createdAt",
        (query) =>
          query
            .eq("buildId", build._id)
            .eq("state", "quarantined")
            .eq("storageDeletedAt", undefined)
            .lte("createdAt", oldestEligibleCreatedAt)
      )
      .take(MAX_ROWS_PER_SWEEP),
  ]);
  const assets: Doc<"buildCollaborationAssets">[] = [];
  for (
    let index = 0;
    assets.length < MAX_ROWS_PER_SWEEP &&
    (index < rejectedAssets.length || index < quarantinedAssets.length);
    index += 1
  ) {
    const rejected = rejectedAssets[index];
    if (rejected) {
      assets.push(rejected);
    }
    const quarantined = quarantinedAssets[index];
    if (quarantined && assets.length < MAX_ROWS_PER_SWEEP) {
      assets.push(quarantined);
    }
  }
  let count = 0;
  for (const asset of assets) {
    const terminal =
      asset.state === "rejected" || asset.state === "quarantined";
    const ageAt = asset.scanCompletedAt ?? asset.updatedAt ?? asset.createdAt;
    if (!terminal || ageAt + ISOLATED_ASSET_RETENTION_DAYS * DAY_MS > asOf) {
      continue;
    }
    const operation = await beginOperation(ctx, {
      build,
      operationKey: `isolated-asset:${asset._id}:${ageAt}`,
      operationKind: "isolated_asset",
      reasonCode: "failed_or_quarantined_asset_expired",
      scopeId: String(asset._id),
      scopeKind: "buildCollaborationAsset",
      now: asOf,
    });
    if (!operation || operation.state === "completed") {
      continue;
    }
    if (
      await hasActiveBuildRetentionHold(ctx, {
        buildId: build._id,
        organizationId: build.organizationId,
      })
    ) {
      await blockOperation(
        ctx,
        operation,
        "Active legal hold blocks isolated asset purge.",
        asOf
      );
      totals.blockedByLegalHold += 1;
      continue;
    }
    let deleted = 0;
    if (!asset.storageDeletedAt) {
      await assertRetentionDeletionAllowed(ctx, build);
      await deleteStorageIfPresent(ctx, asset.storageId);
      await ctx.db.patch(asset._id, {
        storageDeletedAt: asOf,
        updatedAt: asOf,
      });
      deleted = 1;
    }
    await completeOperation(ctx, operation, deleted, asOf);
    await addSystemAuditedTombstone(
      ctx,
      {
        build,
        completedAt: asOf,
        lifecycleState: asset.state,
        operation,
        revisionCount: asset.version,
        scopeId: String(asset._id),
        scopeKind: "buildCollaborationAsset",
        sourceHashSha256: asset.contentHashSha256,
        tombstoneExpiresAt: asOf + TOMBSTONE_RETENTION_MS,
      },
      {
        command: "runDataRetentionMaintenance",
        entityId: asset._id,
        entityType: "buildCollaborationAsset",
        eventType: "data_retention.isolated_asset.purged",
        newState: { storageDeleted: deleted === 1 },
        now: asOf,
        reason: "Isolated failed asset retention window elapsed.",
      }
    );
    totals.completedOperations += 1;
    totals.tombstoneCount += 1;
    count += deleted;
  }
  return count;
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Credential/session minimization intentionally handles both terminal verifier types with one Build-scoped hold gate.
export async function sweepCredentialMaterial(
  ctx: MutationCtx,
  build: Doc<"activeBuilds">,
  asOf: number,
  totals: {
    blockedByLegalHold: number;
    completedOperations: number;
    deletedOrRedactedCount: number;
    markedRecoveryCount: number;
    tombstoneCount: number;
  }
) {
  let count = 0;
  let remaining = MAX_ROWS_PER_SWEEP;
  const cutoff = asOf - CREDENTIAL_RETENTION_DAYS * DAY_MS;
  for (const state of ["expired", "rotated", "revoked"] as const) {
    if (remaining === 0) {
      break;
    }
    const credentials = await ctx.db
      .query("quoteInvitationAccessCredentials")
      .withIndex(
        "by_buildId_and_state_and_verifierPurgedAt_and_updatedAt",
        (query) =>
          query
            .eq("buildId", build._id)
            .eq("state", state)
            .eq("verifierPurgedAt", undefined)
            .lte("updatedAt", cutoff)
      )
      .take(remaining);
    remaining -= credentials.length;
    for (const credential of credentials) {
      if (
        credential.organizationId !== build.organizationId ||
        credential.brokerageId !== build.brokerageId
      ) {
        continue;
      }
      if (!credential.credentialVerifier) {
        await ctx.db.patch(credential._id, { verifierPurgedAt: asOf });
        continue;
      }
      const operation = await beginOperation(ctx, {
        build,
        operationKey: `credential-verifier:${credential._id}:${credential.updatedAt}`,
        operationKind: "credential_verifier",
        reasonCode: "terminal_credential_verifier_expired",
        scopeId: String(credential._id),
        scopeKind: "quoteInvitationAccessCredential",
        now: asOf,
      });
      if (!operation || operation.state === "completed") {
        continue;
      }
      if (
        await hasActiveBuildRetentionHold(ctx, {
          buildId: build._id,
          organizationId: build.organizationId,
        })
      ) {
        await blockOperation(
          ctx,
          operation,
          "Active legal hold blocks credential verifier purge.",
          asOf
        );
        totals.blockedByLegalHold += 1;
        continue;
      }
      await ctx.db.patch(credential._id, {
        credentialVerifier: undefined,
        updatedAt: asOf,
        verifierPurgedAt: asOf,
      });
      await completeOperation(ctx, operation, 1, asOf);
      await addSystemAuditedTombstone(
        ctx,
        {
          build,
          completedAt: asOf,
          lifecycleState: credential.state,
          operation,
          scopeId: String(credential._id),
          scopeKind: "quoteInvitationAccessCredential",
          tombstoneExpiresAt: asOf + TOMBSTONE_RETENTION_MS,
        },
        {
          command: "runDataRetentionMaintenance",
          entityId: credential._id,
          entityType: "quoteInvitationAccessCredential",
          eventType: "data_retention.credential_verifier.purged",
          newState: { retentionAction: "credential_identifier_minimized" },
          now: asOf,
          reason:
            "Terminal Quote invitation credential recovery window elapsed.",
        }
      );
      totals.completedOperations += 1;
      totals.tombstoneCount += 1;
      count += 1;
    }
  }
  for (const state of ["expired", "revoked"] as const) {
    if (remaining === 0) {
      break;
    }
    const sessions = await ctx.db
      .query("quoteInvitationBrowserSessions")
      .withIndex(
        "by_buildId_and_state_and_verifierPurgedAt_and_updatedAt",
        (query) =>
          query
            .eq("buildId", build._id)
            .eq("state", state)
            .eq("verifierPurgedAt", undefined)
            .lte("updatedAt", cutoff)
      )
      .take(remaining);
    remaining -= sessions.length;
    for (const session of sessions) {
      if (
        session.organizationId !== build.organizationId ||
        session.brokerageId !== build.brokerageId
      ) {
        continue;
      }
      if (!session.sessionVerifier) {
        await ctx.db.patch(session._id, { verifierPurgedAt: asOf });
        continue;
      }
      const operation = await beginOperation(ctx, {
        build,
        operationKey: `session-verifier:${session._id}:${session.updatedAt}`,
        operationKind: "credential_verifier",
        reasonCode: "terminal_session_verifier_expired",
        scopeId: String(session._id),
        scopeKind: "quoteInvitationBrowserSession",
        now: asOf,
      });
      if (!operation || operation.state === "completed") {
        continue;
      }
      if (
        await hasActiveBuildRetentionHold(ctx, {
          buildId: build._id,
          organizationId: build.organizationId,
        })
      ) {
        await blockOperation(
          ctx,
          operation,
          "Active legal hold blocks session verifier purge.",
          asOf
        );
        totals.blockedByLegalHold += 1;
        continue;
      }
      await ctx.db.patch(session._id, {
        sessionVerifier: undefined,
        updatedAt: asOf,
        verifierPurgedAt: asOf,
      });
      await completeOperation(ctx, operation, 1, asOf);
      await addSystemAuditedTombstone(
        ctx,
        {
          build,
          completedAt: asOf,
          lifecycleState: session.state,
          operation,
          scopeId: String(session._id),
          scopeKind: "quoteInvitationBrowserSession",
          tombstoneExpiresAt: asOf + TOMBSTONE_RETENTION_MS,
        },
        {
          command: "runDataRetentionMaintenance",
          entityId: session._id,
          entityType: "quoteInvitationBrowserSession",
          eventType: "data_retention.browser_session_verifier.purged",
          newState: { retentionAction: "session_identifier_minimized" },
          now: asOf,
          reason: "Terminal Quote invitation session recovery window elapsed.",
        }
      );
      totals.completedOperations += 1;
      totals.tombstoneCount += 1;
      count += 1;
    }
  }
  return count;
}

export async function deleteQuoteDraftChildren(
  ctx: MutationCtx,
  build: Doc<"activeBuilds">,
  draftId: Id<"quoteInvitationResponseDrafts">
) {
  let deleted = 0;
  const lines = await ctx.db
    .query("quoteInvitationResponseDraftLineItems")
    .withIndex("by_quoteInvitationResponseDraftId_and_lineKey", (query) =>
      query.eq("quoteInvitationResponseDraftId", draftId)
    )
    .take(MAX_ROWS_PER_SWEEP + 1);
  for (const row of lines.slice(0, MAX_ROWS_PER_SWEEP)) {
    await ctx.db.delete(row._id);
    deleted += 1;
  }
  const answers = await ctx.db
    .query("quoteInvitationResponseDraftAnswers")
    .withIndex("by_draft_and_responseFieldId", (query) =>
      query.eq("quoteInvitationResponseDraftId", draftId)
    )
    .take(MAX_ROWS_PER_SWEEP + 1);
  for (const row of answers.slice(0, MAX_ROWS_PER_SWEEP)) {
    await ctx.db.delete(row._id);
    deleted += 1;
  }
  const attachments = await ctx.db
    .query("quoteInvitationResponseDraftAttachments")
    .withIndex("by_quoteInvitationResponseDraftId_and_createdAt", (query) =>
      query.eq("quoteInvitationResponseDraftId", draftId)
    )
    .take(MAX_ROWS_PER_SWEEP + 1);
  for (const row of attachments.slice(0, MAX_ROWS_PER_SWEEP)) {
    await assertRetentionDeletionAllowed(ctx, build);
    await deleteStorageIfPresent(ctx, row.storageId);
    await ctx.db.delete(row._id);
    deleted += 1;
  }
  return {
    complete:
      lines.length <= MAX_ROWS_PER_SWEEP &&
      answers.length <= MAX_ROWS_PER_SWEEP &&
      attachments.length <= MAX_ROWS_PER_SWEEP,
    deletedCount: deleted,
  };
}
