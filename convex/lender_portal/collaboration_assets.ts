import { v } from "convex/values";

import { lenderOrganizationMutation, lenderOrganizationQuery } from "../authz";
import {
  abandonBuildCollaborationAssetsForAuthorization,
  authorizeBuildCollaborationAssetDownloadForAuthorization,
  beginBuildCollaborationAssetUploadForAuthorization,
  buildCollaborationAssetStatusValidator,
  finalizeBuildCollaborationAssetUploadForAuthorization,
  listBuildCollaborationAssetStatusesForAuthorization,
  registerBuildCollaborationAssetStorageForAuthorization,
} from "../build_collaboration_assets";
import { authorizeAssignedLenderBuildCollaboration } from "./collaboration_access";

const lenderAssetStagingContextValidator = v.union(
  v.literal("composer"),
  v.literal("post")
);

const finalizeAssetFields = {
  buildId: v.id("activeBuilds"),
  contentHashSha256: v.string(),
  fileName: v.string(),
  mimeType: v.optional(v.string()),
  stagingSessionId: v.id("buildCollaborationAssetStagingSessions"),
  storageId: v.id("_storage"),
  supersedesAssetId: v.optional(v.id("buildCollaborationAssets")),
};

export const beginLenderBuildCollaborationAssetUpload =
  lenderOrganizationMutation
    .input({
      buildId: v.id("activeBuilds"),
      contextKind: lenderAssetStagingContextValidator,
      contextRecordId: v.optional(v.string()),
      fileName: v.string(),
      mimeType: v.optional(v.string()),
      sizeBytes: v.number(),
      sourceCapturedAt: v.optional(v.number()),
    })
    .returns(
      v.object({
        expiresAt: v.number(),
        stagingSessionId: v.id("buildCollaborationAssetStagingSessions"),
        uploadUrl: v.string(),
      })
    )
    .handler(async (ctx, args) => {
      const authorization = await authorizeAssignedLenderBuildCollaboration(
        ctx,
        args.buildId
      );
      return await beginBuildCollaborationAssetUploadForAuthorization(
        ctx,
        authorization,
        args
      );
    })
    .public();

export const registerLenderBuildCollaborationAssetUploadedStorage =
  lenderOrganizationMutation
    .input({
      buildId: v.id("activeBuilds"),
      stagingSessionId: v.id("buildCollaborationAssetStagingSessions"),
      storageId: v.id("_storage"),
    })
    .returns(v.null())
    .handler(async (ctx, args) => {
      const authorization = await authorizeAssignedLenderBuildCollaboration(
        ctx,
        args.buildId
      );
      return await registerBuildCollaborationAssetStorageForAuthorization(
        ctx,
        authorization,
        args
      );
    })
    .public();

export const finalizeLenderBuildCollaborationAssetUploadForAction =
  lenderOrganizationMutation
    .input(finalizeAssetFields)
    .returns(v.id("buildCollaborationAssets"))
    .handler(async (ctx, args) => {
      const authorization = await authorizeAssignedLenderBuildCollaboration(
        ctx,
        args.buildId
      );
      return await finalizeBuildCollaborationAssetUploadForAuthorization(
        ctx,
        authorization,
        args,
        { scanInBackground: false }
      );
    })
    .public();

export const listLenderBuildCollaborationAssetStatuses = lenderOrganizationQuery
  .input({
    assetIds: v.array(v.id("buildCollaborationAssets")),
    buildId: v.id("activeBuilds"),
  })
  .returns(v.array(buildCollaborationAssetStatusValidator))
  .handler(async (ctx, args) => {
    const authorization = await authorizeAssignedLenderBuildCollaboration(
      ctx,
      args.buildId
    );
    return await listBuildCollaborationAssetStatusesForAuthorization(
      ctx,
      authorization,
      args.assetIds
    );
  })
  .public();

export const authorizeLenderBuildCollaborationAssetDownload =
  lenderOrganizationMutation
    .input({
      assetId: v.id("buildCollaborationAssets"),
      buildId: v.id("activeBuilds"),
    })
    .returns(v.string())
    .handler(async (ctx, args) => {
      const authorization = await authorizeAssignedLenderBuildCollaboration(
        ctx,
        args.buildId
      );
      return await authorizeBuildCollaborationAssetDownloadForAuthorization(
        ctx,
        authorization,
        args.assetId
      );
    })
    .public();

export const abandonLenderBuildCollaborationAssets = lenderOrganizationMutation
  .input({
    assetIds: v.array(v.id("buildCollaborationAssets")),
    buildId: v.id("activeBuilds"),
    reason: v.string(),
  })
  .returns(v.number())
  .handler(async (ctx, args) => {
    const authorization = await authorizeAssignedLenderBuildCollaboration(
      ctx,
      args.buildId
    );
    return await abandonBuildCollaborationAssetsForAuthorization(
      ctx,
      authorization,
      args
    );
  })
  .public();
