import type { ActiveBuildAuthorization } from "./activeBuildAccess";
import { canReadCollaborationPost } from "./build_collaboration_access";
import type { BuildCollaborationPublicationBundle } from "./build_collaboration_publication_bundle";
import type { MutationCtx } from "./types";

type SharedMutation =
  BuildCollaborationPublicationBundle["sharedMutations"][number];

export async function validateBuildCollaborationPublicationPreconditions(
  ctx: MutationCtx,
  input: {
    authorization: ActiveBuildAuthorization;
    bundle: Pick<BuildCollaborationPublicationBundle, "sharedMutations">;
  }
) {
  for (const mutation of input.bundle.sharedMutations) {
    await validateSharedMutationExpectedRevision(
      ctx,
      input.authorization,
      mutation
    );
  }
}

async function validateSharedMutationExpectedRevision(
  ctx: MutationCtx,
  authorization: ActiveBuildAuthorization,
  mutation: SharedMutation
) {
  const kind = mutation.entityKind.trim().toLowerCase();
  const entityId = mutation.entityId?.trim();
  if (!(entityId && isRevisionControlledKind(kind))) {
    return;
  }
  if (mutation.expectedRevision === undefined) {
    throw new Error(
      `Shared mutation ${mutation.entityKind}:${entityId} requires an expected revision.`
    );
  }

  const currentRevision = await authorizedRevisionForEntity(
    ctx,
    authorization,
    kind,
    entityId
  );
  if (currentRevision === null) {
    throw new Error(
      `Shared mutation ${mutation.entityKind}:${entityId} is unavailable.`
    );
  }
  if (currentRevision !== mutation.expectedRevision) {
    throw new Error(
      `Revision conflict: ${mutation.entityKind}:${entityId} expected revision ${mutation.expectedRevision} but found ${currentRevision}. Review the latest state before publishing.`
    );
  }
}

function isRevisionControlledKind(kind: string) {
  return (
    kind === "post" ||
    kind === "buildcollaborationpost" ||
    kind === "comment" ||
    kind === "reply" ||
    kind === "buildcollaborationcomment" ||
    kind === "actionitem" ||
    kind === "buildactionitem"
  );
}

async function authorizedRevisionForEntity(
  ctx: MutationCtx,
  authorization: ActiveBuildAuthorization,
  kind: string,
  entityId: string
) {
  if (kind === "post" || kind === "buildcollaborationpost") {
    const id = ctx.db.normalizeId("buildCollaborationPosts", entityId);
    const row = id ? await ctx.db.get(id) : null;
    return row && (await canReadCollaborationPost(ctx, authorization, row))
      ? row.revision
      : null;
  }
  if (
    kind === "comment" ||
    kind === "reply" ||
    kind === "buildcollaborationcomment"
  ) {
    const id = ctx.db.normalizeId("buildCollaborationComments", entityId);
    const row = id ? await ctx.db.get(id) : null;
    const post = row ? await ctx.db.get(row.postId) : null;
    return row &&
      post &&
      row.organizationId === authorization.organizationId &&
      row.buildId === authorization.build._id &&
      (await canReadCollaborationPost(ctx, authorization, post))
      ? row.revision
      : null;
  }
  const id = ctx.db.normalizeId("buildActionItems", entityId);
  const row = id ? await ctx.db.get(id) : null;
  const post = row ? await ctx.db.get(row.originatingPostId) : null;
  return row &&
    post &&
    row.organizationId === authorization.organizationId &&
    row.buildId === authorization.build._id &&
    (await canReadCollaborationPost(ctx, authorization, post))
    ? row.currentRevision
    : null;
}
