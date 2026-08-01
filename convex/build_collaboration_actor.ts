import { requireHumanCollaborationActor } from "./build_collaboration_human";
import { requireBuildCollaborationWritable } from "./build_collaboration_lifecycle_state";
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
  await requireBuildCollaborationWritable(ctx, authorization);
  return authorization;
}

export async function authorizeActiveBuildCollaborationPreparerAccess(
  ctx: Parameters<typeof authorizeActiveBuildCollaborationAccess>[0],
  input: {
    buildId: Id<"activeBuilds">;
    organizationId: string;
  },
  options: { allowClosed?: boolean } = {}
) {
  const authorization = await authorizeActiveBuildCollaborationAccess(
    ctx,
    input
  );
  if (
    authorization.viewer.actorKind !== "human" &&
    authorization.viewer.actorKind !== "agent"
  ) {
    throw new Error(
      "Collaboration preparation requires a trusted human or agent actor."
    );
  }
  if (!options.allowClosed) {
    await requireBuildCollaborationWritable(ctx, authorization);
  }
  return authorization;
}
