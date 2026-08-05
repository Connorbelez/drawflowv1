import { v } from "convex/values";

import { internal } from "./_generated/api";
import {
  claimBuildCollaborationWriteByBuildId,
  isBuildCollaborationWritableByBuildId as isBuildCollaborationWritableForScan,
} from "./build_collaboration_lifecycle_state";
import { internalAction, internalMutation, internalQuery } from "./fluent";
import type { ActionCtx, Doc, Id, MutationCtx } from "./types";

const scanOutcomeValidator = v.union(
  v.literal("clean"),
  v.literal("rejected"),
  v.literal("error")
);

export const getBuildCollaborationAssetScanInput = internalQuery
  .input({ assetId: v.id("buildCollaborationAssets") })
  .returns(
    v.union(
      v.null(),
      v.object({
        contentHashSha256: v.string(),
        fileName: v.string(),
        fileUrl: v.string(),
        mimeType: v.string(),
        sizeBytes: v.number(),
      })
    )
  )
  .handler(async (ctx, args) => {
    const asset = await ctx.db.get(args.assetId);
    if (
      !asset ||
      asset.state !== "quarantined" ||
      (asset.scanState !== "pending" && asset.scanState !== "error") ||
      !asset.contentHashSha256
    ) {
      return null;
    }
    if (
      !(await isBuildCollaborationWritableForScan(ctx, {
        buildId: asset.buildId,
        organizationId: asset.organizationId,
      }))
    ) {
      return null;
    }
    const fileUrl = await ctx.storage.getUrl(asset.storageId);
    if (!fileUrl) {
      return null;
    }
    return {
      contentHashSha256: asset.contentHashSha256,
      fileName: asset.fileName,
      fileUrl,
      mimeType: asset.mimeType,
      sizeBytes: asset.sizeBytes,
    };
  })
  .internal();

export const recordBuildCollaborationAssetScanResult = internalMutation
  .input({
    assetId: v.id("buildCollaborationAssets"),
    computedHashSha256: v.optional(v.string()),
    message: v.optional(v.string()),
    outcome: scanOutcomeValidator,
    provider: v.string(),
  })
  .returns(v.null())
  .handler(async (ctx, args) => {
    const asset = await ctx.db.get(args.assetId);
    if (
      !asset ||
      asset.state !== "quarantined" ||
      asset.scanState === "clean" ||
      asset.scanState === "rejected"
    ) {
      return null;
    }
    if (
      !(await claimBuildCollaborationWriteByBuildId(ctx, {
        buildId: asset.buildId,
        organizationId: asset.organizationId,
      }))
    ) {
      return null;
    }
    const now = Date.now();
    const session = asset.stagingSessionId
      ? await ctx.db.get(asset.stagingSessionId)
      : null;
    if (
      !session ||
      session.assetId !== asset._id ||
      session.state !== "finalized" ||
      session.expiresAt <= now
    ) {
      await rejectUnpublishedAsset(ctx, asset, {
        message: "The asset staging session is no longer active.",
        now,
        provider: args.provider,
      });
      return null;
    }
    const { clean, rejected, scanMessage, scanState, state } =
      resolveScanResult(asset, args);
    await ctx.db.patch(asset._id, {
      scanCompletedAt: now,
      scanMessage,
      scanState,
      state,
      updatedAt: now,
    });
    await ctx.db.insert("auditEvents", {
      actorRoles: ["system"],
      actorWorkosUserId: `asset-scanner:${boundedProvider(args.provider)}`,
      brokerageId: asset.brokerageId,
      command: "recordBuildCollaborationAssetScanResult",
      createdAt: now,
      entityId: asset._id,
      entityType: "buildCollaborationAsset",
      eventType: clean
        ? "build.collaboration.asset.scan_passed"
        : rejected
          ? "build.collaboration.asset.scan_rejected"
          : "build.collaboration.asset.scan_failed",
      newState: JSON.stringify({ scanState, state }),
      organizationId: asset.organizationId,
      warnings: clean ? [] : [scanMessage ?? "Asset remains unavailable."],
    });
    return null;
  })
  .internal();

function resolveScanResult(
  asset: Doc<"buildCollaborationAssets">,
  input: {
    computedHashSha256?: string;
    message?: string;
    outcome: "clean" | "rejected" | "error";
  }
) {
  const computedHashSha256 = input.computedHashSha256?.trim().toLowerCase();
  const hashMatches =
    Boolean(computedHashSha256) &&
    computedHashSha256 === asset.contentHashSha256;
  const clean = input.outcome === "clean" && hashMatches;
  const rejected =
    input.outcome === "rejected" || (input.outcome === "clean" && !hashMatches);
  return {
    clean,
    rejected,
    scanMessage: boundedMessage(
      clean
        ? input.message
        : input.outcome === "clean" && !hashMatches
          ? "Scanner content hash did not match the finalized upload."
          : input.message
    ),
    scanState: clean
      ? ("clean" as const)
      : rejected
        ? ("rejected" as const)
        : ("error" as const),
    state: clean
      ? ("available" as const)
      : rejected
        ? ("rejected" as const)
        : ("quarantined" as const),
  };
}

/** Opt-in integrity-only scanner for local/dev. Not malware AV. */
export const BUILTIN_INTEGRITY_SCANNER = "builtin:integrity";

export const processBuildCollaborationAssetScan = internalAction
  .input({ assetId: v.id("buildCollaborationAssets") })
  .returns(v.null())
  .handler(async (ctx, args) => {
    const input = await ctx.runQuery(
      internal.build_collaboration_asset_maintenance
        .getBuildCollaborationAssetScanInput,
      args
    );
    if (!input) {
      return null;
    }
    const endpoint = process.env.BUILD_COLLABORATION_ASSET_SCAN_URL?.trim();
    if (!endpoint) {
      await recordResult(ctx, args.assetId, {
        message:
          "Asset scanner is not configured; the file remains quarantined.",
        outcome: "error",
        provider: "unconfigured",
      });
      return null;
    }
    if (isEphemeralTunnelScannerUrl(endpoint)) {
      await recordResult(ctx, args.assetId, {
        message:
          "BUILD_COLLABORATION_ASSET_SCAN_URL points at an ephemeral Cloudflare tunnel. Set it to builtin:integrity for development or a durable HTTPS scanner for production.",
        outcome: "error",
        provider: "misconfigured-scanner",
      });
      return null;
    }
    try {
      if (endpoint === BUILTIN_INTEGRITY_SCANNER) {
        const payload = await scanWithBuiltinIntegrity(input);
        await recordResult(ctx, args.assetId, {
          computedHashSha256: payload.sha256,
          message: payload.message,
          outcome: payload.clean ? "clean" : "rejected",
          provider: "builtin-integrity",
        });
        return null;
      }
      const response = await fetch(endpoint, {
        body: JSON.stringify(input),
        headers: {
          "Content-Type": "application/json",
          ...(process.env.BUILD_COLLABORATION_ASSET_SCAN_BEARER_TOKEN
            ? {
                Authorization: `Bearer ${process.env.BUILD_COLLABORATION_ASSET_SCAN_BEARER_TOKEN}`,
              }
            : {}),
        },
        method: "POST",
      });
      if (!response.ok) {
        throw new Error(`Scanner returned HTTP ${response.status}.`);
      }
      const payload = (await response.json()) as {
        clean?: boolean;
        message?: string;
        sha256?: string;
      };
      await recordResult(ctx, args.assetId, {
        computedHashSha256: payload.sha256,
        message: payload.message,
        outcome: payload.clean ? "clean" : "rejected",
        provider: new URL(endpoint).hostname,
      });
    } catch (error) {
      await recordResult(ctx, args.assetId, {
        message:
          error instanceof Error
            ? error.message
            : "Asset scanner request failed.",
        outcome: "error",
        provider: "configured-scanner",
      });
    }
    return null;
  })
  .internal();

export const abandonBuildCollaborationAssetUploadAfterFailure = internalMutation
  .input({
    message: v.string(),
    stagingSessionId: v.id("buildCollaborationAssetStagingSessions"),
    storageId: v.id("_storage"),
  })
  .returns(v.null())
  .handler(async (ctx, args) => {
    const session = await ctx.db.get(args.stagingSessionId);
    if (
      !session ||
      session.state !== "open" ||
      session.assetId ||
      session.pendingStorageId !== args.storageId
    ) {
      return null;
    }
    if (
      !(await claimBuildCollaborationWriteByBuildId(ctx, {
        buildId: session.buildId,
        organizationId: session.organizationId,
      }))
    ) {
      return null;
    }
    const [boundAsset, boundSessions] = await Promise.all([
      ctx.db
        .query("buildCollaborationAssets")
        .withIndex("by_storageId", (query) =>
          query.eq("storageId", args.storageId)
        )
        .unique(),
      ctx.db
        .query("buildCollaborationAssetStagingSessions")
        .withIndex("by_pendingStorageId", (query) =>
          query.eq("pendingStorageId", args.storageId)
        )
        .take(2),
    ]);
    if (
      boundAsset ||
      boundSessions.length !== 1 ||
      boundSessions[0]?._id !== session._id
    ) {
      return null;
    }
    const now = Date.now();
    await ctx.storage.delete(args.storageId);
    await ctx.db.patch(session._id, { state: "abandoned", updatedAt: now });
    await ctx.db.insert("auditEvents", {
      actorRoles: ["system"],
      actorWorkosUserId: "system:asset-upload-cleanup",
      brokerageId: session.brokerageId,
      command: "abandonBuildCollaborationAssetUploadAfterFailure",
      createdAt: now,
      entityId: session._id,
      entityType: "buildCollaborationAssetStagingSession",
      eventType: "build.collaboration.asset.upload_abandoned",
      newState: JSON.stringify({ state: "abandoned" }),
      organizationId: session.organizationId,
      warnings: [boundedMessage(args.message) ?? "Upload finalization failed."],
    });
    return null;
  })
  .internal();

export const expireBuildCollaborationAssetStagingSession = internalMutation
  .input({
    stagingSessionId: v.id("buildCollaborationAssetStagingSessions"),
  })
  .returns(v.null())
  .handler(async (ctx, args) => {
    const session = await ctx.db.get(args.stagingSessionId);
    if (
      !session ||
      (session.state !== "open" && session.state !== "finalized") ||
      session.expiresAt > Date.now()
    ) {
      return null;
    }
    if (
      !(await claimBuildCollaborationWriteByBuildId(ctx, {
        buildId: session.buildId,
        organizationId: session.organizationId,
      }))
    ) {
      return null;
    }
    await expireStagingSession(ctx, session, Date.now());
    return null;
  })
  .internal();

export const expireBuildCollaborationAssetStagingSessions = internalMutation
  .input({
    state: v.union(v.literal("open"), v.literal("finalized")),
  })
  .returns(v.number())
  .handler(async (ctx, args) => {
    const now = Date.now();
    const sessions = await ctx.db
      .query("buildCollaborationAssetStagingSessions")
      .withIndex("by_state_and_expiresAt", (query) =>
        query.eq("state", args.state).lt("expiresAt", now)
      )
      .take(100);
    let expiredCount = 0;
    for (const session of sessions) {
      if (
        !(await claimBuildCollaborationWriteByBuildId(ctx, {
          buildId: session.buildId,
          organizationId: session.organizationId,
        }))
      ) {
        continue;
      }
      await expireStagingSession(ctx, session, now);
      expiredCount += 1;
    }
    return expiredCount;
  })
  .internal();

async function expireStagingSession(
  ctx: MutationCtx,
  session: Doc<"buildCollaborationAssetStagingSessions">,
  now: number
) {
  const asset = session.assetId ? await ctx.db.get(session.assetId) : null;
  const activeCostDocumentDraftPages = asset
    ? await ctx.db
        .query("costDocumentDraftPages")
        .withIndex("by_assetId", (query) => query.eq("assetId", asset._id))
        .filter((query) => query.eq(query.field("state"), "active"))
        .take(1)
    : [];
  if (
    asset &&
    !asset.publishedAt &&
    session.state === "finalized" &&
    activeCostDocumentDraftPages.length > 0
  ) {
    // A durable Cost Document draft page owns this otherwise-private source
    // asset. This is an interrupted bind convergence, not an expiry: retain
    // the storage and consume the session so a subsequent pass cannot delete
    // a page the draft already references.
    await ctx.db.patch(session._id, { state: "consumed", updatedAt: now });
    await ctx.db.insert("auditEvents", {
      actorRoles: ["system"],
      actorWorkosUserId: "system:asset-staging-expiry",
      brokerageId: session.brokerageId,
      command: "expireBuildCollaborationAssetStagingSession",
      createdAt: now,
      entityId: asset._id,
      entityType: "buildCollaborationAsset",
      eventType: "build.collaboration.asset.staging_retained",
      newState: JSON.stringify({
        assetState: asset.state,
        reason: "active_cost_document_draft_page",
        sessionState: "consumed",
        storageDeleted: false,
      }),
      organizationId: session.organizationId,
      warnings: [],
    });
    return;
  }
  const attachments = asset
    ? await ctx.db
        .query("buildCollaborationAttachments")
        .withIndex("by_buildId_and_attachmentKind_and_attachmentId", (query) =>
          query
            .eq("buildId", session.buildId)
            .eq("attachmentKind", "collaborationAsset")
            .eq("attachmentId", asset._id)
        )
        .take(1)
    : [];
  const shouldDeleteStorage = Boolean(
    asset &&
      !asset.publishedAt &&
      !asset.storageDeletedAt &&
      attachments.length === 0
  );
  const shouldDeletePendingStorage = Boolean(
    !asset && session.pendingStorageId
  );
  if (shouldDeletePendingStorage && session.pendingStorageId) {
    await ctx.storage.delete(session.pendingStorageId);
  }
  if (asset && shouldDeleteStorage) {
    await ctx.storage.delete(asset.storageId);
    await ctx.db.patch(asset._id, {
      scanCompletedAt: now,
      scanMessage: "The private asset staging session expired.",
      scanState: "rejected",
      state: "rejected",
      storageDeletedAt: now,
      updatedAt: now,
    });
  }
  await ctx.db.patch(session._id, { state: "abandoned", updatedAt: now });
  await ctx.db.insert("auditEvents", {
    actorRoles: ["system"],
    actorWorkosUserId: "system:asset-staging-expiry",
    brokerageId: session.brokerageId,
    command: "expireBuildCollaborationAssetStagingSession",
    createdAt: now,
    entityId: asset?._id ?? session._id,
    entityType: asset
      ? "buildCollaborationAsset"
      : "buildCollaborationAssetStagingSession",
    eventType: "build.collaboration.asset.staging_expired",
    newState: JSON.stringify({
      assetState: asset && !asset.publishedAt ? "rejected" : asset?.state,
      sessionState: "abandoned",
      storageDeleted: shouldDeleteStorage || shouldDeletePendingStorage,
    }),
    organizationId: session.organizationId,
    warnings: [],
  });
}

async function rejectUnpublishedAsset(
  ctx: MutationCtx,
  asset: Doc<"buildCollaborationAssets">,
  input: { message: string; now: number; provider: string }
) {
  if (!asset.storageDeletedAt) {
    await ctx.storage.delete(asset.storageId);
  }
  await ctx.db.patch(asset._id, {
    scanCompletedAt: input.now,
    scanMessage: input.message,
    scanState: "rejected",
    state: "rejected",
    storageDeletedAt: input.now,
    updatedAt: input.now,
  });
  await ctx.db.insert("auditEvents", {
    actorRoles: ["system"],
    actorWorkosUserId: `asset-scanner:${boundedProvider(input.provider)}`,
    brokerageId: asset.brokerageId,
    command: "recordBuildCollaborationAssetScanResult",
    createdAt: input.now,
    entityId: asset._id,
    entityType: "buildCollaborationAsset",
    eventType: "build.collaboration.asset.scan_ignored",
    newState: JSON.stringify({ scanState: "rejected", state: "rejected" }),
    organizationId: asset.organizationId,
    warnings: [input.message],
  });
}

async function recordResult(
  ctx: ActionCtx,
  assetId: Id<"buildCollaborationAssets">,
  result: {
    computedHashSha256?: string;
    message?: string;
    outcome: "clean" | "rejected" | "error";
    provider: string;
  }
) {
  await ctx.runMutation(
    internal.build_collaboration_asset_maintenance
      .recordBuildCollaborationAssetScanResult,
    { assetId, ...result }
  );
}

function boundedMessage(value?: string) {
  const normalized = value?.trim();
  return normalized ? normalized.slice(0, 500) : undefined;
}

function boundedProvider(value: string) {
  return value.trim().slice(0, 100) || "unknown";
}

function isEphemeralTunnelScannerUrl(endpoint: string) {
  try {
    const hostname = new URL(endpoint).hostname.toLowerCase();
    return (
      hostname === "trycloudflare.com" ||
      hostname.endsWith(".trycloudflare.com")
    );
  } catch {
    return false;
  }
}

async function scanWithBuiltinIntegrity(input: {
  contentHashSha256: string;
  fileUrl: string;
}) {
  const response = await fetch(input.fileUrl);
  if (!response.ok) {
    throw new Error(
      `Unable to download asset for integrity scan (HTTP ${response.status}).`
    );
  }
  const digest = await crypto.subtle.digest(
    "SHA-256",
    await response.arrayBuffer()
  );
  const sha256 = Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0")
  ).join("");
  const expected = input.contentHashSha256.trim().toLowerCase();
  const clean = sha256 === expected;
  return {
    clean,
    message: clean
      ? "Builtin integrity scan matched the upload hash."
      : "Builtin integrity scan hash mismatch.",
    sha256,
  };
}
