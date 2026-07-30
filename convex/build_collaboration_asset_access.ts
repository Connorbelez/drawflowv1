import type { ActiveBuildAuthorization } from "./activeBuildAccess";
import { resolveCurrentCollaborationPostReaderIds } from "./build_collaboration_access";
import type { Doc, QueryCtx } from "./types";

export async function canUseCollaborationAssetForPost(
  ctx: QueryCtx,
  input: {
    asset: Doc<"buildCollaborationAssets">;
    authorization: ActiveBuildAuthorization;
    post: Doc<"buildCollaborationPosts">;
  }
) {
  if (
    input.asset.organizationId !== input.authorization.organizationId ||
    input.asset.brokerageId !== input.authorization.brokerage._id ||
    input.asset.buildId !== input.authorization.build._id ||
    input.post.organizationId !== input.authorization.organizationId ||
    input.post.brokerageId !== input.authorization.brokerage._id ||
    input.post.buildId !== input.authorization.build._id
  ) {
    return false;
  }
  if (input.asset.originatingPostId === input.post._id) {
    return true;
  }
  const destinationReaderIds = await resolveCurrentCollaborationPostReaderIds(
    ctx,
    input.authorization,
    input.post
  );
  if (input.asset.readerWorkosUserIds) {
    const assetReaders = new Set(input.asset.readerWorkosUserIds);
    return destinationReaderIds.every((readerId) => assetReaders.has(readerId));
  }
  if (input.asset.maximumAudienceMode === "build_wide") {
    return true;
  }
  return false;
}
