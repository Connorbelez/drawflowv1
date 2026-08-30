import { makeFunctionReference } from "convex/server";
import { v } from "convex/values";

import { internal } from "../_generated/api";
import { authenticatedAction } from "../authz";
import {
  type CollaborationAssetStatus,
  finalizeAndScanCollaborationAssetUpload,
} from "../build_collaboration_asset_upload_application";
import { buildCollaborationAssetStatusValidator } from "../build_collaboration_assets";
import type { Id } from "../types";

interface FinalizeLenderAssetArgs extends Record<string, string | undefined> {
  buildId: Id<"activeBuilds">;
  contentHashSha256: string;
  fileName: string;
  mimeType?: string;
  stagingSessionId: Id<"buildCollaborationAssetStagingSessions">;
  storageId: Id<"_storage">;
  supersedesAssetId?: Id<"buildCollaborationAssets">;
}

const finalizeAssetMutation = makeFunctionReference<
  "mutation",
  FinalizeLenderAssetArgs,
  Id<"buildCollaborationAssets">
>("lender_portal:finalizeLenderBuildCollaborationAssetUploadForAction");

const listAssetStatusesQuery = makeFunctionReference<
  "query",
  {
    assetIds: Id<"buildCollaborationAssets">[];
    buildId: Id<"activeBuilds">;
  },
  CollaborationAssetStatus[]
>("lender_portal:listLenderBuildCollaborationAssetStatuses");

export const finalizeAndScanLenderBuildCollaborationAssetUpload =
  authenticatedAction
    .input({
      buildId: v.id("activeBuilds"),
      contentHashSha256: v.string(),
      fileName: v.string(),
      mimeType: v.optional(v.string()),
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
            await ctx.runMutation(finalizeAssetMutation, args),
          readStatus: async (assetId) => {
            const statuses = await ctx.runQuery(listAssetStatusesQuery, {
              assetIds: [assetId],
              buildId: args.buildId,
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
