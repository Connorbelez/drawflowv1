import { v } from "convex/values";

import { internal } from "./_generated/api";
import { authorizeActiveBuildAccessForViewer } from "./activeBuildAccess";
import { normalizeRoleSlugs } from "./authz";
import { canReadCollaborationPost } from "./build_collaboration_access";
import {
  buildBuildCollaborationHistoryArchive,
  buildCollaborationPostArchive,
} from "./build_collaboration_archive";
import { internalAction, internalMutation, internalQuery } from "./fluent";
import type { Doc, Id, QueryCtx } from "./types";

const ARCHIVE_CHUNK_BYTES = 256 * 1024;
const EXPORT_TTL_MS = 15 * 60_000;

const archiveRecordKindValidator = v.union(
  v.literal("build_history"),
  v.literal("post")
);

export const readBuildCollaborationArchivePlan = internalQuery
  .input({ exportId: v.id("buildCollaborationExports") })
  .returns(v.any())
  .handler(async (ctx, args) => {
    const { authorization, exportRow, manifest } = await archiveContext(
      ctx,
      args.exportId
    );
    return {
      buildId: authorization.build._id,
      nextRecordIndex: exportRow.archiveNextRecordIndex ?? 0,
      nextSequence: exportRow.archiveNextSequence ?? 0,
      postIds: manifest.posts.map((post) => post.postId),
      state: exportRow.state,
    };
  })
  .internal();

export const readBuildCollaborationArchiveRecord = internalQuery
  .input({
    exportId: v.id("buildCollaborationExports"),
    kind: archiveRecordKindValidator,
    postId: v.optional(v.id("buildCollaborationPosts")),
  })
  .returns(v.any())
  .handler(async (ctx, args) => {
    const { authorization, manifest } = await archiveContext(
      ctx,
      args.exportId
    );
    if (args.kind === "build_history") {
      if (args.postId) {
        throw new Error("Build history archive records do not target a post.");
      }
      return {
        data: await buildBuildCollaborationHistoryArchive(ctx, {
          authorization,
        }),
        kind: args.kind,
        schemaVersion: 1,
      };
    }
    if (!(args.postId && manifest.postIds.has(args.postId))) {
      throw new Error("Archive post is not part of this export.");
    }
    const post = await ctx.db.get(args.postId);
    if (!(post && (await canReadCollaborationPost(ctx, authorization, post)))) {
      throw new Error("Archive post access changed during generation.");
    }
    return {
      data: await buildCollaborationPostArchive(ctx, { authorization, post }),
      kind: args.kind,
      schemaVersion: 1,
    };
  })
  .internal();

export const getBuildCollaborationArchiveChunk = internalQuery
  .input({
    exportId: v.id("buildCollaborationExports"),
    sequence: v.number(),
  })
  .returns(v.any())
  .handler(
    async (ctx, args) =>
      await ctx.db
        .query("buildCollaborationExportArchiveChunks")
        .withIndex("by_exportId_and_sequence", (query) =>
          query.eq("exportId", args.exportId).eq("sequence", args.sequence)
        )
        .unique()
  )
  .internal();

export const recordBuildCollaborationArchiveChunk = internalMutation
  .input({
    byteLength: v.number(),
    contentHashSha256: v.string(),
    exportId: v.id("buildCollaborationExports"),
    partIndex: v.number(),
    recordIndex: v.number(),
    sequence: v.number(),
    storageId: v.id("_storage"),
  })
  .returns(v.null())
  .handler(async (ctx, args) => {
    const exportRow = await requireBuildingArchiveExport(ctx, args.exportId);
    const existing = await ctx.db
      .query("buildCollaborationExportArchiveChunks")
      .withIndex("by_exportId_and_sequence", (query) =>
        query.eq("exportId", args.exportId).eq("sequence", args.sequence)
      )
      .unique();
    if (existing) {
      if (
        existing.contentHashSha256 !== args.contentHashSha256 ||
        existing.byteLength !== args.byteLength ||
        existing.recordIndex !== args.recordIndex ||
        existing.partIndex !== args.partIndex
      ) {
        throw new Error(
          "Archive chunk replay conflicts with persisted output."
        );
      }
      return null;
    }
    await ctx.db.insert("buildCollaborationExportArchiveChunks", {
      brokerageId: exportRow.brokerageId,
      buildId: exportRow.buildId,
      byteLength: args.byteLength,
      contentHashSha256: args.contentHashSha256,
      createdAt: Date.now(),
      exportId: exportRow._id,
      organizationId: exportRow.organizationId,
      partIndex: args.partIndex,
      recordIndex: args.recordIndex,
      sequence: args.sequence,
      storageId: args.storageId,
    });
    return null;
  })
  .internal();

export const completeBuildCollaborationArchive = internalMutation
  .input({
    completedRecordIndex: v.number(),
    exportId: v.id("buildCollaborationExports"),
    nextSequence: v.number(),
    recordCount: v.number(),
  })
  .returns(v.null())
  .handler(async (ctx, args) => {
    const exportRow = await requireBuildingArchiveExport(ctx, args.exportId);
    const expectedRecordIndex = exportRow.archiveNextRecordIndex ?? 0;
    const expectedSequence = exportRow.archiveNextSequence ?? 0;
    if (
      args.completedRecordIndex !== expectedRecordIndex ||
      args.nextSequence < expectedSequence
    ) {
      throw new Error(
        "Archive progress replay conflicts with persisted state."
      );
    }
    const nextRecordIndex = args.completedRecordIndex + 1;
    if (nextRecordIndex < args.recordCount) {
      await ctx.db.patch(exportRow._id, {
        archiveNextRecordIndex: nextRecordIndex,
        archiveNextSequence: args.nextSequence,
      });
      await ctx.scheduler.runAfter(
        0,
        internal.build_collaboration_export_archive
          .generateBuildCollaborationFullArchive,
        { exportId: exportRow._id }
      );
      return null;
    }
    if (args.nextSequence > 0) {
      const lastChunk = await ctx.db
        .query("buildCollaborationExportArchiveChunks")
        .withIndex("by_exportId_and_sequence", (query) =>
          query
            .eq("exportId", exportRow._id)
            .eq("sequence", args.nextSequence - 1)
        )
        .unique();
      if (!lastChunk) {
        throw new Error("Archive chunk set is incomplete or out of order.");
      }
    }
    const completedAt = Date.now();
    const manifest = JSON.parse(exportRow.manifestJson) as Record<
      string,
      unknown
    >;
    await ctx.db.patch(exportRow._id, {
      archiveChunkCount: args.nextSequence,
      archiveCompletedAt: completedAt,
      archiveFailure: undefined,
      archiveNextRecordIndex: nextRecordIndex,
      archiveNextSequence: args.nextSequence,
      expiresAt: completedAt + EXPORT_TTL_MS,
      manifestJson: JSON.stringify({
        ...manifest,
        archive: {
          chunkCount: args.nextSequence,
          format: "application/x-ndjson",
          recordCount: args.recordCount,
          schemaVersion: 1,
        },
      }),
      state: "active",
    });
    return null;
  })
  .internal();

export const failBuildCollaborationArchive = internalMutation
  .input({
    exportId: v.id("buildCollaborationExports"),
    safeError: v.string(),
  })
  .returns(v.null())
  .handler(async (ctx, args) => {
    const exportRow = await ctx.db.get(args.exportId);
    if (exportRow?.state === "building") {
      await ctx.db.patch(exportRow._id, {
        archiveFailure: args.safeError,
        state: "failed",
      });
    }
    return null;
  })
  .internal();

export const generateBuildCollaborationFullArchive = internalAction
  .input({ exportId: v.id("buildCollaborationExports") })
  .returns(v.null())
  .handler(async (ctx, args) => {
    try {
      const plan = (await ctx.runQuery(
        internal.build_collaboration_export_archive
          .readBuildCollaborationArchivePlan,
        args
      )) as {
        nextRecordIndex: number;
        nextSequence: number;
        postIds: Id<"buildCollaborationPosts">[];
        state: string;
      };
      if (plan.state !== "building") {
        return null;
      }
      const records: {
        kind: "build_history" | "post";
        postId?: Id<"buildCollaborationPosts">;
      }[] = [
        { kind: "build_history" },
        ...plan.postIds.map((postId) => ({ kind: "post" as const, postId })),
      ];
      const recordIndex = plan.nextRecordIndex;
      const source = records[recordIndex];
      if (!source) {
        throw new Error("Archive generation progress exceeds its record plan.");
      }
      const record = await ctx.runQuery(
        internal.build_collaboration_export_archive
          .readBuildCollaborationArchiveRecord,
        { exportId: args.exportId, ...source }
      );
      const bytes = new TextEncoder().encode(`${JSON.stringify(record)}\n`);
      let sequence = plan.nextSequence;
      for (
        let offset = 0, partIndex = 0;
        offset < bytes.length;
        offset += ARCHIVE_CHUNK_BYTES, partIndex += 1
      ) {
        const part = bytes.slice(offset, offset + ARCHIVE_CHUNK_BYTES);
        const contentHashSha256 = await sha256Hex(part);
        const existing = (await ctx.runQuery(
          internal.build_collaboration_export_archive
            .getBuildCollaborationArchiveChunk,
          { exportId: args.exportId, sequence }
        )) as Doc<"buildCollaborationExportArchiveChunks"> | null;
        if (!existing) {
          const storageId = await ctx.storage.store(
            new Blob([part], { type: "application/x-ndjson" })
          );
          await ctx.runMutation(
            internal.build_collaboration_export_archive
              .recordBuildCollaborationArchiveChunk,
            {
              byteLength: part.byteLength,
              contentHashSha256,
              exportId: args.exportId,
              partIndex,
              recordIndex,
              sequence,
              storageId,
            }
          );
        } else if (
          existing.contentHashSha256 !== contentHashSha256 ||
          existing.byteLength !== part.byteLength ||
          existing.recordIndex !== recordIndex ||
          existing.partIndex !== partIndex
        ) {
          throw new Error("Archive generation replay conflicts with a chunk.");
        }
        sequence += 1;
      }
      await ctx.runMutation(
        internal.build_collaboration_export_archive
          .completeBuildCollaborationArchive,
        {
          completedRecordIndex: recordIndex,
          exportId: args.exportId,
          nextSequence: sequence,
          recordCount: records.length,
        }
      );
    } catch (error) {
      await ctx.runMutation(
        internal.build_collaboration_export_archive
          .failBuildCollaborationArchive,
        {
          exportId: args.exportId,
          safeError:
            error instanceof Error
              ? error.message.slice(0, 500)
              : "Archive generation failed.",
        }
      );
    }
    return null;
  })
  .internal();

async function archiveContext(
  ctx: QueryCtx,
  exportId: Id<"buildCollaborationExports">
) {
  const exportRow = await ctx.db.get(exportId);
  if (!exportRow || exportRow.scope !== "full_archive") {
    throw new Error("Full archive export is unavailable.");
  }
  if (exportRow.state !== "building") {
    throw new Error("Full archive export is not generating.");
  }
  const roles = normalizeRoleSlugs([exportRow.requestedByRole]);
  const authorization = await authorizeActiveBuildAccessForViewer(
    ctx,
    {
      actorKind: "human",
      capability: "authenticated",
      organizationId: exportRow.organizationId,
      roles,
      subject: exportRow.requestedByWorkosUserId,
      tokenIdentifier: `archive-export:${exportRow._id}`,
    },
    { buildId: exportRow.buildId, organizationId: exportRow.organizationId }
  );
  const parsed = JSON.parse(exportRow.manifestJson) as {
    posts?: { postId: Id<"buildCollaborationPosts"> }[];
  };
  return {
    authorization,
    exportRow,
    manifest: {
      postIds: new Set((parsed.posts ?? []).map((post) => post.postId)),
      posts: parsed.posts ?? [],
    },
  };
}

async function requireBuildingArchiveExport(
  ctx: { db: QueryCtx["db"] },
  exportId: Id<"buildCollaborationExports">
) {
  const exportRow = await ctx.db.get(exportId);
  if (
    !exportRow ||
    exportRow.scope !== "full_archive" ||
    exportRow.state !== "building"
  ) {
    throw new Error("Full archive export is not accepting chunks.");
  }
  return exportRow;
}

async function sha256Hex(bytes: Uint8Array) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    Uint8Array.from(bytes).buffer
  );
  return [...new Uint8Array(digest)]
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
}
