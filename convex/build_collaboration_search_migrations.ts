import { internal } from "./_generated/api.js";
import { authorizeActiveBuildAccessForViewer } from "./activeBuildAccess";
import { rebuildBuildCollaborationSearchRecordsForPost } from "./build_collaboration_search_index";
import { migrations } from "./migrations";

export const backfillBuildCollaborationSearchRecords = migrations.define({
  batchSize: 1,
  table: "buildCollaborationPosts",
  migrateOne: async (ctx, post) => {
    const authorization = await authorizeActiveBuildAccessForViewer(
      ctx,
      {
        actorKind: "system",
        capability: "authenticated",
        organizationId: post.organizationId,
        roles: ["admin"],
        subject: "build-collaboration-search-migration",
        tokenIdentifier: "build-collaboration-search-migration",
      },
      {
        buildId: post.buildId,
        organizationId: post.organizationId,
      }
    );
    await rebuildBuildCollaborationSearchRecordsForPost(ctx, {
      authorization,
      postId: post._id,
    });
  },
});

export const runBuildCollaborationSearchRecordBackfill = migrations.runner([
  internal.build_collaboration_search_migrations
    .backfillBuildCollaborationSearchRecords,
]);
