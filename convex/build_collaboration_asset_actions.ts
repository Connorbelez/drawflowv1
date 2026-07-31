import { makeFunctionReference } from "convex/server";
import { v } from "convex/values";

import { internal } from "./_generated/api";
import { authenticatedAction } from "./authz";
import type { Id } from "./types";

interface FinalizeAssetUploadArgs extends Record<string, string | undefined> {
  buildId: Id<"activeBuilds">;
  contentHashSha256: string;
  fileName: string;
  mimeType?: string;
  organizationId: string;
  stagingSessionId: Id<"buildCollaborationAssetStagingSessions">;
  storageId: Id<"_storage">;
  supersedesAssetId?: Id<"buildCollaborationAssets">;
}

interface AssetStatus {
  _id: Id<"buildCollaborationAssets">;
  contentHashSha256?: string;
  fileName: string;
  mimeType: string;
  scanMessage?: string;
  scanState?: "pending" | "clean" | "rejected" | "error";
  sizeBytes: number;
  state: "staged" | "quarantined" | "available" | "rejected" | "superseded";
  version: number;
}

const finalizeAssetUploadMutation = makeFunctionReference<
  "mutation",
  FinalizeAssetUploadArgs,
  Id<"buildCollaborationAssets">
>("build_collaboration_assets:finalizeBuildCollaborationAssetUploadForAction");

const listAssetStatusesQuery = makeFunctionReference<
  "query",
  {
    assetIds: Id<"buildCollaborationAssets">[];
    buildId: Id<"activeBuilds">;
    organizationId: string;
  },
  AssetStatus[]
>("build_collaboration_assets:listBuildCollaborationAssetStatuses");

const assetStatusValidator = v.object({
  _id: v.id("buildCollaborationAssets"),
  contentHashSha256: v.optional(v.string()),
  fileName: v.string(),
  mimeType: v.string(),
  scanMessage: v.optional(v.string()),
  scanState: v.optional(
    v.union(
      v.literal("pending"),
      v.literal("clean"),
      v.literal("rejected"),
      v.literal("error")
    )
  ),
  sizeBytes: v.number(),
  state: v.union(
    v.literal("staged"),
    v.literal("quarantined"),
    v.literal("available"),
    v.literal("rejected"),
    v.literal("superseded")
  ),
  version: v.number(),
});

export const finalizeAndScanBuildCollaborationAssetUpload = authenticatedAction
  .input({
    buildId: v.id("activeBuilds"),
    contentHashSha256: v.string(),
    fileName: v.string(),
    mimeType: v.optional(v.string()),
    organizationId: v.string(),
    stagingSessionId: v.id("buildCollaborationAssetStagingSessions"),
    storageId: v.id("_storage"),
    supersedesAssetId: v.optional(v.id("buildCollaborationAssets")),
  })
  .returns(assetStatusValidator)
  .handler(async (ctx, args): Promise<AssetStatus> => {
    const assetId = await ctx.runMutation(finalizeAssetUploadMutation, args);
    await ctx.runAction(
      internal.build_collaboration_asset_maintenance
        .processBuildCollaborationAssetScan,
      { assetId }
    );
    const statuses = await ctx.runQuery(listAssetStatusesQuery, {
      assetIds: [assetId],
      buildId: args.buildId,
      organizationId: args.organizationId,
    });
    const status = statuses[0];
    if (!status) {
      throw new Error("The finalized collaboration asset is unavailable.");
    }
    return status;
  })
  .public();
