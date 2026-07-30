import { internal } from "./_generated/api.js";
import { stableContentHash } from "./build_collaboration";
import { resolveEffectiveCollaborationRole } from "./build_collaboration_model";
import { migrations } from "./migrations";

export const backfillBuildNotesIntoCollaboration = migrations.define({
  table: "buildNotes",
  migrateOne: async (ctx, note) => {
    const importedSourceId = `buildNote:${note._id}`;
    const existing = await ctx.db
      .query("buildCollaborationPosts")
      .withIndex("by_buildId_and_importedSourceId", (query) =>
        query
          .eq("buildId", note.buildId)
          .eq("importedSourceId", importedSourceId)
      )
      .first();
    if (existing) {
      return;
    }

    const effectiveAuthorRole = resolveEffectiveCollaborationRole(
      note.authorRoles
    ) ?? {
      role: "broker" as const,
      tier: 3,
    };
    const authorRole = effectiveAuthorRole.role;
    const audienceMode =
      note.visibility === "public"
        ? ("build_wide" as const)
        : ("author_tier_and_higher" as const);
    const audienceFloorTier =
      note.visibility === "public" ? 0 : effectiveAuthorRole.tier;
    const tiptapJson = JSON.stringify({
      content: [
        {
          content: [{ text: note.body, type: "text" }],
          type: "paragraph",
        },
      ],
      type: "doc",
    });
    const postId = await ctx.db.insert("buildCollaborationPosts", {
      acknowledgementRequired: false,
      agentDrafted: false,
      announcementProminent: false,
      audienceFloorTier,
      audienceMode,
      authorDisplayNameSnapshot: note.authorWorkosUserId,
      authorRole,
      authorRolesSnapshot: note.authorRoles,
      authorWorkosUserId: note.authorWorkosUserId,
      brokerageId: note.brokerageId,
      buildId: note.buildId,
      commentCount: 0,
      contentState: "active",
      createdAt: note.createdAt,
      importedSourceId,
      lastMeaningfulActivityAt: note.createdAt,
      latestActivityActorWorkosUserId: note.authorWorkosUserId,
      openActionItemCount: 0,
      organizationId: note.organizationId,
      postType: "update",
      readRevision: 1,
      revision: 1,
      source: "imported",
      threadState: "open",
      threadRevision: 0,
      updatedAt: note.updatedAt,
    });
    const revisionId = await ctx.db.insert("buildCollaborationPostRevisions", {
      authorRole,
      authorWorkosUserId: note.authorWorkosUserId,
      brokerageId: note.brokerageId,
      buildId: note.buildId,
      contentHash: stableContentHash(tiptapJson),
      createdAt: note.createdAt,
      organizationId: note.organizationId,
      plainText: note.body,
      postId,
      revision: 1,
      tiptapJson,
    });
    await ctx.db.patch(postId, { currentRevisionId: revisionId });
  },
});

export const runBuildCollaborationNoteBackfill = migrations.runner([
  internal.build_collaboration_migrations.backfillBuildNotesIntoCollaboration,
]);
