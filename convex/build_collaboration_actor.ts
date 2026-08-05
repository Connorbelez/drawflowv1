import { requireHumanCollaborationActor } from "./build_collaboration_human";
import { requireBuildCollaborationWritable } from "./build_collaboration_lifecycle_state";
import { authorizeActiveBuildCollaborationAccess } from "./build_collaboration_rollout";
import type { AuthorizedViewer } from "./authz";
import type { Id, MutationCtx } from "./types";

type ActiveBuildCollaborationMutationCtx = MutationCtx & {
  viewer: AuthorizedViewer;
};

export async function authorizeActiveBuildHumanCollaborationAccess(
  ctx: ActiveBuildCollaborationMutationCtx,
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
  ctx: ActiveBuildCollaborationMutationCtx,
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
