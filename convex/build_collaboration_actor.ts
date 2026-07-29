import { requireHumanCollaborationActor } from "./build_collaboration_human";
import { authorizeActiveBuildCollaborationAccess } from "./build_collaboration_rollout";
import type { Id } from "./types";

export async function authorizeActiveBuildHumanCollaborationAccess(
  ctx: Parameters<typeof authorizeActiveBuildCollaborationAccess>[0],
  input: {
    buildId: Id<"activeBuilds">;
    organizationId: string;
  }
) {
  const authorization = await authorizeActiveBuildCollaborationAccess(
    ctx,
    input
  );
  await requireHumanCollaborationActor(ctx, authorization);
  return authorization;
}
