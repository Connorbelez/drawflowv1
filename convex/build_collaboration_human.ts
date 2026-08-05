import type { ActiveBuildAuthorization } from "./activeBuildAccess";
import type { MutationCtx, QueryCtx } from "./types";

export function requireHumanCollaborationActor(
  _ctx: QueryCtx | MutationCtx,
  authorization: ActiveBuildAuthorization
) {
  if (authorization.viewer.actorKind !== "human") {
    throw new Error(
      "Publishing shared collaboration state requires an explicit human-in-the-loop approval."
    );
  }
  return authorization.viewer;
}
