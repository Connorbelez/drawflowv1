import type { ActiveBuildAuthorization } from "./activeBuildAccess";
import {
  isCleanCollaborationAsset,
  resolveCollaborationAssetReadDecision,
} from "./build_collaboration_asset_access";
import {
  isDrawSystemPost,
  resolveDrawSystemEventReadDecision,
} from "./build_collaboration_system_event_access";
import type { Doc, MutationCtx, QueryCtx } from "./types";

export async function buildCollaborationExportPostAclDecision(
  ctx: QueryCtx | MutationCtx,
  authorization: ActiveBuildAuthorization,
  post: Doc<"buildCollaborationPosts">
) {
  const customMembership =
    post.audienceMode === "custom"
      ? await ctx.db
          .query("buildCollaborationAudienceMembers")
          .withIndex("by_postId_and_workosUserId", (query) =>
            query
              .eq("postId", post._id)
              .eq("workosUserId", authorization.viewer.subject)
          )
          .unique()
      : null;
  const roleTierAuthorized =
    authorization.effectiveRole.tier >= post.audienceFloorTier;
  const entityAclRequired = isDrawSystemPost(post);
  const entityAclDecision = entityAclRequired
    ? await resolveDrawSystemEventReadDecision(ctx, {
        buildId: authorization.build._id,
        role: authorization.effectiveRole.role,
        workosUserId: authorization.viewer.subject,
      })
    : { basis: "not_required" as const };
  return {
    audienceFloorTier: post.audienceFloorTier,
    audienceMode: post.audienceMode,
    basis: roleTierAuthorized
      ? "role_tier"
      : post.audienceMode === "build_wide"
        ? "build_wide"
        : "custom_audience_membership",
    buildMatches: post.buildId === authorization.build._id,
    customAudienceAddedAt: customMembership?.createdAt,
    customAudienceAddedByWorkosUserId: customMembership?.addedByWorkosUserId,
    customAudienceMembershipId: customMembership?._id,
    decision: "authorized" as const,
    entityAclAuthorized: Boolean(entityAclDecision),
    entityAclDecision,
    entityAclRequired,
    organizationMatches: post.organizationId === authorization.organizationId,
    postId: post._id,
    viewerRoleTier: authorization.effectiveRole.tier,
  };
}

export async function buildCollaborationExportAssetAclDecision(
  ctx: QueryCtx | MutationCtx,
  authorization: ActiveBuildAuthorization,
  asset: Doc<"buildCollaborationAssets">
) {
  const authorizationDecision = await resolveCollaborationAssetReadDecision(
    ctx,
    { asset, authorization }
  );
  if (!authorizationDecision) {
    throw new Error("An exported asset is no longer authorized.");
  }
  return {
    assetId: asset._id,
    ...authorizationDecision,
    brokerageMatches: asset.brokerageId === authorization.brokerage._id,
    buildMatches: asset.buildId === authorization.build._id,
    cleanAssetRequired: true,
    cleanAssetSatisfied: isCleanCollaborationAsset(asset),
    decision: "authorized" as const,
    maximumAudienceMode: asset.maximumAudienceMode,
    organizationMatches: asset.organizationId === authorization.organizationId,
    originatingPostId: asset.originatingPostId,
    readerSnapshotIncludedViewer: asset.readerWorkosUserIds
      ? asset.readerWorkosUserIds.includes(authorization.viewer.subject)
      : undefined,
    readerSnapshotRestrictionPresent: Boolean(asset.readerWorkosUserIds),
  };
}
