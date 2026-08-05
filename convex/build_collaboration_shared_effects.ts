import type { ActiveBuildAuthorization } from "./activeBuildAccess";
import type { BuildCollaborationPublicationBundle } from "./build_collaboration_publication_bundle";
import { resolveSharedMutationRevisionPrecondition } from "./build_collaboration_publication_preconditions";
import type { Id, MutationCtx } from "./types";

export async function persistApprovedBuildCollaborationSharedEffects(
  ctx: MutationCtx,
  input: {
    authorization: ActiveBuildAuthorization;
    mutations: BuildCollaborationPublicationBundle["sharedMutations"];
    now: number;
    postId: Id<"buildCollaborationPosts">;
  }
) {
  for (const mutation of input.mutations) {
    const revisionPrecondition =
      await resolveSharedMutationRevisionPrecondition(
        ctx,
        input.authorization,
        mutation
      );
    const eventType = revisionPrecondition
      ? "build_collaboration.shared_revision_precondition.applied"
      : "build_collaboration.shared_mutation.requested";
    await ctx.db.insert("eventOutbox", {
      brokerageId: input.authorization.brokerage._id,
      createdAt: input.now,
      eventType,
      organizationId: input.authorization.organizationId,
      payloadPreview: JSON.stringify({
        approvedByWorkosUserId: input.authorization.viewer.subject,
        entityId: mutation.entityId,
        entityKind: mutation.entityKind,
        expectedRevision:
          revisionPrecondition?.expectedRevision ??
          mutation.expectedRevision ??
          null,
        observedRevision: revisionPrecondition?.observedRevision ?? null,
        operation: mutation.operation,
        postId: input.postId,
        summary: mutation.summary,
      }),
      relatedEntityId: input.postId,
      relatedEntityType: "buildCollaborationPost",
      status: "pending",
    });
  }
}
