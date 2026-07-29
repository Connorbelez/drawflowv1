import type { ActiveBuildAuthorization } from "./activeBuildAccess";
import type { Doc, QueryCtx } from "./types";

export async function canReadCollaborationPost(
  ctx: QueryCtx,
  authorization: ActiveBuildAuthorization,
  post: Doc<"buildCollaborationPosts">
) {
  if (
    post.organizationId !== authorization.organizationId ||
    post.buildId !== authorization.build._id
  ) {
    return false;
  }
  if (authorization.effectiveRole.tier >= post.audienceFloorTier) {
    return true;
  }
  if (post.audienceMode === "build_wide") {
    return true;
  }
  const member = await ctx.db
    .query("buildCollaborationAudienceMembers")
    .withIndex("by_postId_and_workosUserId", (query) =>
      query
        .eq("postId", post._id)
        .eq("workosUserId", authorization.viewer.subject)
    )
    .unique();
  return Boolean(member);
}

export function canSeeCollaborationReceipt(
  authorization: ActiveBuildAuthorization,
  receipt: Doc<"buildCollaborationReceipts">
) {
  return (
    receipt.workosUserId !== authorization.viewer.subject &&
    receipt.viewerRole !== "admin" &&
    authorization.effectiveRole.tier >= roleTierForReceipt(receipt.viewerRole)
  );
}

function roleTierForReceipt(
  role: Doc<"buildCollaborationReceipts">["viewerRole"]
) {
  switch (role) {
    case "admin":
      return 5;
    case "principle-broker":
      return 4;
    case "broker":
    case "builder":
    case "broker-staff":
      return 3;
    case "builder-staff":
    case "homeowner":
      return 2;
    case "contractor":
      return 1;
  }
}
