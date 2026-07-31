import { v } from "convex/values";

import { internal } from "./_generated/api";
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
      asset.scanState === "clean" ||
      asset.scanState === "rejected"
    ) {
      return null;
    }
    const now = Date.now();
    const { clean, rejected, scanMessage, scanState, state } =
      resolveScanResult(asset, args);
    await supersedePriorAssetVersion(ctx, asset, clean, now);
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

async function supersedePriorAssetVersion(
  ctx: MutationCtx,
  asset: Doc<"buildCollaborationAssets">,
  clean: boolean,
  now: number
) {
  if (!(clean && asset.supersedesAssetId)) {
    return;
  }
  const prior = await ctx.db.get(asset.supersedesAssetId);
  if (
    prior &&
    prior.organizationId === asset.organizationId &&
    prior.buildId === asset.buildId &&
    (prior.state === "available" || prior.state === "superseded")
  ) {
    await ctx.db.patch(prior._id, {
      state: "superseded",
      updatedAt: now,
    });
  }
}

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
    try {
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
