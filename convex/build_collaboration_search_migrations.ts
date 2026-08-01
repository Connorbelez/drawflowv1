import { internal } from "./_generated/api.js";
import { authorizeActiveBuildAccessForViewer } from "./activeBuildAccess";
import {
  queueBuildCollaborationSearchBuildRebuild,
  queueBuildCollaborationSearchOwnerRebuild,
} from "./build_collaboration_search_maintenance";
import { migrations } from "./migrations";
import type { Id, MutationCtx } from "./types";

export const backfillBuildCollaborationSearchBuilds = migrations.define({
  batchSize: 1,
  table: "activeBuilds",
  migrateOne: async (ctx, build) => {
    const authorization = await searchMigrationAuthorization(ctx, {
      buildId: build._id,
      organizationId: build.organizationId,
    });
    await queueBuildCollaborationSearchBuildRebuild(ctx, { authorization });
  },
});

export const backfillBuildCollaborationPostSearchRecords = migrations.define({
  batchSize: 1,
  table: "buildCollaborationPosts",
  migrateOne: async (ctx, post) => {
    const authorization = await searchMigrationAuthorization(ctx, post);
    await queueBuildCollaborationSearchOwnerRebuild(ctx, {
      authorization,
      owner: { id: post._id, kind: "post" },
      postId: post._id,
    });
  },
});

export const backfillBuildCollaborationCommentSearchRecords = migrations.define(
  {
    batchSize: 1,
    table: "buildCollaborationComments",
    migrateOne: async (ctx, comment) => {
      const authorization = await searchMigrationAuthorization(ctx, comment);
      await queueBuildCollaborationSearchOwnerRebuild(ctx, {
        authorization,
        owner: { id: comment._id, kind: "comment" },
        postId: comment.postId,
      });
    },
  }
);

export const backfillBuildActionItemSearchRecords = migrations.define({
  batchSize: 1,
  table: "buildActionItems",
  migrateOne: async (ctx, item) => {
    const authorization = await searchMigrationAuthorization(ctx, item);
    await queueBuildCollaborationSearchOwnerRebuild(ctx, {
      authorization,
      owner: { id: item._id, kind: "actionItem" },
      postId: item.originatingPostId,
    });
  },
});

export const runBuildCollaborationSearchRecordBackfill = migrations.runner([
  internal.build_collaboration_search_migrations
    .backfillBuildCollaborationSearchBuilds,
  internal.build_collaboration_search_migrations
    .backfillBuildCollaborationPostSearchRecords,
  internal.build_collaboration_search_migrations
    .backfillBuildCollaborationCommentSearchRecords,
  internal.build_collaboration_search_migrations
    .backfillBuildActionItemSearchRecords,
]);

async function searchMigrationAuthorization(
  ctx: MutationCtx,
  row: { buildId: Id<"activeBuilds">; organizationId: string }
) {
  return await authorizeActiveBuildAccessForViewer(
    ctx,
    {
      actorKind: "system",
      capability: "authenticated",
      organizationId: row.organizationId,
      roles: ["admin"],
      subject: "build-collaboration-search-migration",
      tokenIdentifier: "build-collaboration-search-migration",
    },
    {
      buildId: row.buildId,
      organizationId: row.organizationId,
    }
  );
}
