import { makeFunctionReference } from "convex/server";
import { v } from "convex/values";

import { internal } from "./_generated/api";
import { authenticatedAction } from "./authz";
import {
  type CollaborationAssetStatus,
  finalizeAndScanCollaborationAssetUpload,
} from "./build_collaboration_asset_upload_application";
import { buildCollaborationAssetStatusValidator } from "./build_collaboration_assets";
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
  CollaborationAssetStatus[]
>("build_collaboration_assets:listBuildCollaborationAssetStatuses");

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
  .returns(buildCollaborationAssetStatusValidator)
  .handler(
    async (ctx, args): Promise<CollaborationAssetStatus> =>
      await finalizeAndScanCollaborationAssetUpload({
        abandon: async (message) =>
          await ctx.runMutation(
            internal.build_collaboration_asset_maintenance
              .abandonBuildCollaborationAssetUploadAfterFailure,
            {
              message,
              stagingSessionId: args.stagingSessionId,
              storageId: args.storageId,
            }
          ),
        finalize: async () =>
          await ctx.runMutation(finalizeAssetUploadMutation, args),
        readStatus: async (assetId) => {
          const statuses = await ctx.runQuery(listAssetStatusesQuery, {
            assetIds: [assetId],
            buildId: args.buildId,
            organizationId: args.organizationId,
          });
          return statuses[0] ?? null;
        },
        scan: async (assetId) =>
          await ctx.runAction(
            internal.build_collaboration_asset_maintenance
              .processBuildCollaborationAssetScan,
            { assetId }
          ),
      })
  )
  .public();
