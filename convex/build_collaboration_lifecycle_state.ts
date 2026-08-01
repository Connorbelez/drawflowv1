import type { ActiveBuildAuthorization } from "./activeBuildAccess";
import type { QueryCtx } from "./types";

export const BUILD_COLLABORATION_CLOSED_ERROR =
  "This Build's collaboration archive is closed and read-only.";
export const BUILD_COLLABORATION_PURGED_ERROR =
  "This Build's collaboration content has been purged under its retention policy.";
export const BUILD_COLLABORATION_LIFECYCLE_TENANCY_ERROR =
  "Build collaboration lifecycle tenancy is invalid.";

export async function getStoredBuildCollaborationState(
  ctx: QueryCtx,
  authorization: ActiveBuildAuthorization
) {
  const state = await ctx.db
    .query("buildCollaborationBuildStates")
    .withIndex("by_buildId", (query) =>
      query.eq("buildId", authorization.build._id)
    )
    .unique();
  if (
    state &&
    (state.organizationId !== authorization.organizationId ||
      state.brokerageId !== authorization.brokerage._id)
  ) {
    throw new Error(BUILD_COLLABORATION_LIFECYCLE_TENANCY_ERROR);
  }
  return state;
}

export async function requireBuildCollaborationWritable(
  ctx: QueryCtx,
  authorization: ActiveBuildAuthorization
) {
  const state = await getStoredBuildCollaborationState(ctx, authorization);
  if (state?.state === "closed") {
    throw new Error(BUILD_COLLABORATION_CLOSED_ERROR);
  }
  if (state?.state === "purged") {
    throw new Error(BUILD_COLLABORATION_PURGED_ERROR);
  }
}
