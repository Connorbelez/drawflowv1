import { v } from "convex/values";

import { authenticatedMutation } from "./authz";
import { stableContentHash } from "./build_collaboration_hash";
import { requireMigrationRun } from "./build_collaboration_legacy_note_plan";
import {
  authorizeLegacyNoteOperator,
  hasMore,
  legacyNoteTiptapJson,
  MAX_IMPORT_BATCH_SIZE,
  normalizePageSize,
  noteSnapshot,
  recordLegacyNoteCutoverAudit,
  requireLegacyNoteCutoverState,
  sha256Hex,
} from "./build_collaboration_legacy_note_shared";
import type { Doc, MutationCtx } from "./types";

const importResultValidator = v.object({
  complete: v.boolean(),
  nextImportOrdinal: v.number(),
  planToken: v.string(),
  processedInBatch: v.number(),
  runId: v.id("buildCollaborationLegacyNoteMigrationRuns"),
  sourceRecordCount: v.number(),
});

export const applyBuildCollaborationLegacyNoteMigrationBatch =
  authenticatedMutation
    .input({
      buildId: v.id("activeBuilds"),
      maxNotes: v.optional(v.number()),
      organizationId: v.string(),
      planToken: v.string(),
      runId: v.id("buildCollaborationLegacyNoteMigrationRuns"),
    })
    .returns(importResultValidator)
    .handler(async (ctx, args) => {
      const authorization = await authorizeLegacyNoteOperator(ctx, args, true);
      await requireLegacyNoteCutoverState(ctx, authorization);
      const run = await requireMigrationRun(ctx, args.runId, authorization);
      if (run.planToken !== args.planToken) {
        throw new Error(
          "The migration run does not match the confirmed plan token."
        );
      }
      if (run.status === "complete") {
        return presentImportResult(run, 0);
      }
      if (run.status !== "importing") {
        throw new Error(
          "The migration manifest must be validated before import."
        );
      }
      const limit = normalizePageSize(
        args.maxNotes ?? MAX_IMPORT_BATCH_SIZE,
        MAX_IMPORT_BATCH_SIZE
      );
      const rows = await ctx.db
        .query("buildCollaborationLegacyNotePlanNotes")
        .withIndex("by_runId_and_ordinal", (query) =>
          query.eq("runId", run._id).gte("ordinal", run.nextImportOrdinal)
        )
        .take(limit + 1);
      const { items, more } = hasMore(rows, limit);
      for (const manifest of items) {
        await importManifestNote(ctx, authorization, manifest);
      }
      const nextImportOrdinal = run.nextImportOrdinal + items.length;
      const complete = !more && nextImportOrdinal === run.sourceRecordCount;
      const now = Date.now();
      await ctx.db.patch(run._id, {
        ...(complete ? { completedAt: now, status: "complete" as const } : {}),
        nextImportOrdinal,
        updatedAt: now,
      });
      await recordLegacyNoteCutoverAudit(ctx, authorization, {
        command: "applyBuildCollaborationLegacyNoteMigrationBatch",
        entityId: run._id,
        eventType: complete
          ? "build.collaboration.legacy_note_migration.completed"
          : "build.collaboration.legacy_note_migration.batch_applied",
        newState: JSON.stringify({
          complete,
          nextImportOrdinal,
          planToken: run.planToken,
          processedInBatch: items.length,
          sourceRecordCount: run.sourceRecordCount,
        }),
        now,
      });
      const updated = await ctx.db.get(run._id);
      if (!updated) {
        throw new Error("Legacy-note migration run became unavailable.");
      }
      return presentImportResult(updated, items.length);
    })
    .public();

async function importManifestNote(
  ctx: MutationCtx,
  authorization: Awaited<ReturnType<typeof authorizeLegacyNoteOperator>>,
  manifest: Doc<"buildCollaborationLegacyNotePlanNotes">
) {
  const source = await ctx.db.get(manifest.sourceNoteId);
  if (!source) {
    throw new Error(
      `Legacy note ${manifest.sourceNoteId} changed after validation.`
    );
  }
  const currentSnapshot = noteSnapshot(source);
  if (
    (await sha256Hex(JSON.stringify(currentSnapshot))) !==
      manifest.snapshotHash ||
    source.organizationId !== authorization.organizationId ||
    source.brokerageId !== authorization.brokerage._id
  ) {
    throw new Error(
      `Legacy note ${manifest.sourceNoteId} changed after validation.`
    );
  }
  const build = await ctx.db.get(manifest.buildId);
  if (
    !build ||
    build.organizationId !== authorization.organizationId ||
    build.brokerageId !== authorization.brokerage._id
  ) {
    throw new Error(`Build ${manifest.buildId} changed after validation.`);
  }
  const existing = await ctx.db
    .query("buildCollaborationPosts")
    .withIndex("by_buildId_and_importedSourceId", (query) =>
      query
        .eq("buildId", manifest.buildId)
        .eq("importedSourceId", manifest.importedSourceId)
    )
    .take(2);
  if (existing.length > 1) {
    throw new Error(
      `Duplicate imported posts exist for ${manifest.importedSourceId}.`
    );
  }
  if (existing[0]) {
    const mismatches = await importedManifestPostMismatches(
      ctx,
      manifest,
      existing[0]
    );
    if (mismatches.length > 0) {
      throw new Error(
        `Existing import does not match ${manifest.importedSourceId}: ${mismatches.join(", ")}.`
      );
    }
    return;
  }
  const tiptapJson = legacyNoteTiptapJson(manifest.body);
  const postId = await ctx.db.insert("buildCollaborationPosts", {
    acknowledgementRequired: false,
    agentDrafted: false,
    announcementProminent: false,
    audienceFloorTier: manifest.audienceFloorTier,
    audienceMode: manifest.audienceMode,
    authorDisplayNameSnapshot: manifest.authorWorkosUserId,
    authorRole: manifest.authorRole,
    authorRolesSnapshot: manifest.authorRolesSnapshot,
    authorWorkosUserId: manifest.authorWorkosUserId,
    brokerageId: manifest.brokerageId,
    buildId: manifest.buildId,
    commentCount: 0,
    contentState: "active",
    createdAt: manifest.createdAt,
    importedSourceId: manifest.importedSourceId,
    lastMeaningfulActivityAt: manifest.createdAt,
    latestActivityActorWorkosUserId: manifest.authorWorkosUserId,
    openActionItemCount: 0,
    organizationId: manifest.organizationId,
    postType: "update",
    readRevision: 1,
    revision: 1,
    source: "imported",
    threadRevision: 0,
    threadState: "open",
    updatedAt: manifest.updatedAt,
  });
  const revisionId = await ctx.db.insert("buildCollaborationPostRevisions", {
    authorRole: manifest.authorRole,
    authorWorkosUserId: manifest.authorWorkosUserId,
    brokerageId: manifest.brokerageId,
    buildId: manifest.buildId,
    contentHash: stableContentHash(tiptapJson),
    createdAt: manifest.createdAt,
    organizationId: manifest.organizationId,
    plainText: manifest.body,
    postId,
    revision: 1,
    tiptapJson,
  });
  await ctx.db.patch(postId, { currentRevisionId: revisionId });
}

export async function importedManifestPostMismatches(
  ctx: MutationCtx,
  manifest: Doc<"buildCollaborationLegacyNotePlanNotes">,
  post: Doc<"buildCollaborationPosts">
) {
  const mismatches: string[] = [];
  if (
    post.organizationId !== manifest.organizationId ||
    post.brokerageId !== manifest.brokerageId ||
    post.buildId !== manifest.buildId
  ) {
    mismatches.push("tenant_or_build_mismatch");
  }
  if (
    post.source !== "imported" ||
    post.postType !== "update" ||
    post.importedSourceId !== manifest.importedSourceId
  ) {
    mismatches.push("import_identity_mismatch");
  }
  if (
    post.audienceMode !== manifest.audienceMode ||
    post.audienceFloorTier !== manifest.audienceFloorTier
  ) {
    mismatches.push("audience_mapping_mismatch");
  }
  if (
    post.authorWorkosUserId !== manifest.authorWorkosUserId ||
    post.authorRole !== manifest.authorRole ||
    JSON.stringify(post.authorRolesSnapshot) !==
      JSON.stringify(manifest.authorRolesSnapshot)
  ) {
    mismatches.push("author_snapshot_mismatch");
  }
  if (
    post.createdAt !== manifest.createdAt ||
    post.updatedAt !== manifest.updatedAt ||
    post.lastMeaningfulActivityAt !== manifest.createdAt
  ) {
    mismatches.push("timestamp_mismatch");
  }
  if (post.revision !== 1 || !post.currentRevisionId) {
    mismatches.push("current_revision_mismatch");
    return mismatches;
  }
  const revisions = await ctx.db
    .query("buildCollaborationPostRevisions")
    .withIndex("by_postId_and_revision", (query) =>
      query.eq("postId", post._id)
    )
    .take(2);
  if (revisions.length !== 1 || revisions[0]._id !== post.currentRevisionId) {
    mismatches.push("revision_count_mismatch");
    return mismatches;
  }
  const tiptapJson = legacyNoteTiptapJson(manifest.body);
  const revision = revisions[0];
  if (
    revision.revision !== 1 ||
    revision.plainText !== manifest.body ||
    revision.tiptapJson !== tiptapJson ||
    revision.contentHash !== stableContentHash(tiptapJson) ||
    revision.authorWorkosUserId !== manifest.authorWorkosUserId ||
    revision.authorRole !== manifest.authorRole ||
    revision.createdAt !== manifest.createdAt
  ) {
    mismatches.push("revision_content_mismatch");
  }
  return mismatches;
}

function presentImportResult(
  run: Doc<"buildCollaborationLegacyNoteMigrationRuns">,
  processedInBatch: number
) {
  return {
    complete: run.status === "complete",
    nextImportOrdinal: run.nextImportOrdinal,
    planToken: run.planToken,
    processedInBatch,
    runId: run._id,
    sourceRecordCount: run.sourceRecordCount,
  };
}
