import { v } from "convex/values";

import { internal } from "./_generated/api";
import { authorizeActiveBuildAccessForViewer } from "./activeBuildAccess";
import { normalizeRoleSlugs } from "./authz";
import {
  buildBuildCollaborationHistoryArchivePage,
  buildCollaborationPostArchivePage,
  type CollaborationPostArchiveSection,
  type CollaborationPostArchiveSnapshot,
} from "./build_collaboration_archive";
import { internalAction, internalMutation, internalQuery } from "./fluent";
import type { Id, QueryCtx } from "./types";

const ARCHIVE_CHUNK_BYTES = 256 * 1024;
const ARCHIVE_CHUNK_CLAIM_TTL_MS = 60_000;
const EXPORT_TTL_MS = 15 * 60_000;

export const readBuildCollaborationArchivePlan = internalQuery
  .input({ exportId: v.id("buildCollaborationExports") })
  .returns(v.any())
  .handler(async (ctx, args) => {
    const { authorization, exportRow } = await archiveContext(
      ctx,
      args.exportId
    );
    if (exportRow.archivePlanPhase !== "complete") {
      return {
        buildId: authorization.build._id,
        state: "planning" as const,
      };
    }
    const nextRecordIndex = exportRow.archiveNextRecordIndex ?? 0;
    const planRecord = await ctx.db
      .query("buildCollaborationExportArchivePlanRecords")
      .withIndex("by_exportId_and_ordinal", (query) =>
        query.eq("exportId", exportRow._id).eq("ordinal", nextRecordIndex)
      )
      .unique();
    return {
      buildId: authorization.build._id,
      cursor: exportRow.archiveCursor ?? null,
      nextRecordIndex,
      nextSequence: exportRow.archiveNextSequence ?? 0,
      planRecord,
      planRecordCount: exportRow.archivePlanNextOrdinal ?? 0,
      recordCount: exportRow.archiveRecordCount ?? 0,
      state: exportRow.state,
    };
  })
  .internal();

export const readBuildCollaborationArchiveRecord = internalQuery
  .input({
    exportId: v.id("buildCollaborationExports"),
    cursor: v.union(v.null(), v.string()),
    recordOrdinal: v.number(),
  })
  .returns(v.any())
  .handler(async (ctx, args) => {
    const { authorization, exportRow, manifest } = await archiveContext(
      ctx,
      args.exportId
    );
    const planRecord = await ctx.db
      .query("buildCollaborationExportArchivePlanRecords")
      .withIndex("by_exportId_and_ordinal", (query) =>
        query.eq("exportId", exportRow._id).eq("ordinal", args.recordOrdinal)
      )
      .unique();
    if (!planRecord) {
      throw new Error("Archive plan record is unavailable.");
    }
    if (planRecord.kind === "build_history") {
      if (!planRecord.section) {
        throw new Error("Build history archive plan is malformed.");
      }
      const page = await buildBuildCollaborationHistoryArchivePage(ctx, {
        authorization,
        cursor: args.cursor,
        section: planRecord.section,
        snapshotAt: manifest.snapshotAt,
        snapshotJson: planRecord.snapshotJson,
      });
      return {
        ...page,
        kind: planRecord.kind,
        section: planRecord.section,
        schemaVersion: 1,
      };
    }
    if (planRecord.kind === "asset") {
      return {
        aclDecision: planRecord.aclDecisionJson
          ? JSON.parse(planRecord.aclDecisionJson)
          : undefined,
        continueCursor: "",
        data: [JSON.parse(planRecord.snapshotJson)],
        isDone: true,
        kind: planRecord.kind,
        schemaVersion: 1,
      };
    }
    if (!(planRecord.postId && planRecord.section)) {
      throw new Error("Archive post plan is malformed.");
    }
    const postId = planRecord.postId;
    const plannedPost = await ctx.db
      .query("buildCollaborationExportArchivePlanPosts")
      .withIndex("by_exportId_and_postId", (query) =>
        query.eq("exportId", exportRow._id).eq("postId", postId)
      )
      .unique();
    if (!plannedPost) {
      throw new Error("Archive post is not part of this export.");
    }
    const postSnapshot = JSON.parse(
      plannedPost.snapshotJson
    ) as CollaborationPostArchiveSnapshot;
    const section = planRecord.section as CollaborationPostArchiveSection;
    return {
      ...(await buildCollaborationPostArchivePage(ctx, {
        authorization,
        cursor: args.cursor,
        post: { _id: postId },
        postSnapshot,
        section,
        snapshotAt: manifest.snapshotAt,
      })),
      aclDecision:
        section === "core"
          ? JSON.parse(plannedPost.aclDecisionJson)
          : undefined,
      kind: planRecord.kind,
      section,
      schemaVersion: 1,
    };
  })
  .internal();

export const reserveBuildCollaborationArchiveChunk = internalMutation
  .input({
    byteLength: v.number(),
    claimToken: v.string(),
    contentHashSha256: v.string(),
    exportId: v.id("buildCollaborationExports"),
    partIndex: v.number(),
    recordIndex: v.number(),
    sequence: v.number(),
  })
  .returns(v.any())
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
      if (existing.content || existing.storageId) {
        return { state: "stored" as const };
      }
      const reservationExpired =
        (existing.reservedAt ?? existing.createdAt) +
          ARCHIVE_CHUNK_CLAIM_TTL_MS <=
        Date.now();
      if (existing.claimToken === args.claimToken || reservationExpired) {
        await ctx.db.patch(existing._id, {
          claimToken: args.claimToken,
          reservedAt: Date.now(),
          state: "reserved",
        });
        return { state: "owned" as const };
      }
      return { state: "busy" as const };
    }
    await ctx.db.insert("buildCollaborationExportArchiveChunks", {
      brokerageId: exportRow.brokerageId,
      buildId: exportRow.buildId,
      byteLength: args.byteLength,
      claimToken: args.claimToken,
      contentHashSha256: args.contentHashSha256,
      createdAt: Date.now(),
      exportId: exportRow._id,
      organizationId: exportRow.organizationId,
      partIndex: args.partIndex,
      recordIndex: args.recordIndex,
      reservedAt: Date.now(),
      sequence: args.sequence,
      state: "reserved",
    });
    return { state: "owned" as const };
  })
  .internal();

export const completeBuildCollaborationArchiveChunk = internalMutation
  .input({
    claimToken: v.string(),
    content: v.bytes(),
    exportId: v.id("buildCollaborationExports"),
    sequence: v.number(),
  })
  .returns(v.any())
  .handler(async (ctx, args) => {
    await requireBuildingArchiveExport(ctx, args.exportId);
    const chunk = await ctx.db
      .query("buildCollaborationExportArchiveChunks")
      .withIndex("by_exportId_and_sequence", (query) =>
        query.eq("exportId", args.exportId).eq("sequence", args.sequence)
      )
      .unique();
    if (!chunk) {
      throw new Error("Archive chunk reservation is missing.");
    }
    if (chunk.content || chunk.storageId) {
      return { accepted: true };
    }
    if (chunk.claimToken !== args.claimToken) {
      return { accepted: false };
    }
    await ctx.db.patch(chunk._id, {
      content: args.content,
      state: "stored",
      storedAt: Date.now(),
    });
    return { accepted: true };
  })
  .internal();

export const completeBuildCollaborationArchive = internalMutation
  .input({
    completedRecordIndex: v.number(),
    continueCursor: v.string(),
    exportId: v.id("buildCollaborationExports"),
    recordDone: v.boolean(),
    nextSequence: v.number(),
    planRecordCount: v.number(),
  })
  .returns(v.null())
  .handler(async (ctx, args) => {
    const exportRow = await ctx.db.get(args.exportId);
    if (!exportRow || exportRow.scope !== "full_archive") {
      throw new Error("Full archive export is unavailable.");
    }
    if (exportRow.state !== "building") {
      return null;
    }
    const expectedRecordIndex = exportRow.archiveNextRecordIndex ?? 0;
    const expectedSequence = exportRow.archiveNextSequence ?? 0;
    if (
      expectedRecordIndex > args.completedRecordIndex ||
      (expectedRecordIndex === args.completedRecordIndex &&
        expectedSequence >= args.nextSequence)
    ) {
      return null;
    }
    if (
      args.completedRecordIndex !== expectedRecordIndex ||
      args.nextSequence < expectedSequence
    ) {
      throw new Error(
        "Archive progress replay conflicts with persisted state."
      );
    }
    const nextRecordIndex = args.recordDone
      ? args.completedRecordIndex + 1
      : args.completedRecordIndex;
    const archiveRecordCount = (exportRow.archiveRecordCount ?? 0) + 1;
    if (nextRecordIndex < args.planRecordCount) {
      await ctx.db.patch(exportRow._id, {
        archiveCursor: args.recordDone ? undefined : args.continueCursor,
        archiveNextRecordIndex: nextRecordIndex,
        archiveNextSequence: args.nextSequence,
        archiveRecordCount,
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
      if (!(lastChunk?.content || lastChunk?.storageId)) {
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
      archiveCursor: undefined,
      archiveNextRecordIndex: nextRecordIndex,
      archiveNextSequence: args.nextSequence,
      archiveRecordCount,
      expiresAt: completedAt + EXPORT_TTL_MS,
      manifestJson: JSON.stringify({
        ...manifest,
        archive: {
          chunkCount: args.nextSequence,
          format: "application/x-ndjson",
          recordCount: archiveRecordCount,
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

export const cleanupBuildCollaborationExportArchive = internalMutation
  .input({ exportId: v.id("buildCollaborationExports") })
  .returns(v.null())
  .handler(async (ctx, args) => {
    const exportRow = await ctx.db.get(args.exportId);
    if (!exportRow) {
      return null;
    }
    const now = Date.now();
    if (exportRow.state !== "failed" && exportRow.expiresAt > now) {
      await ctx.scheduler.runAfter(
        exportRow.expiresAt - now,
        internal.build_collaboration_export_archive
          .cleanupBuildCollaborationExportArchive,
        args
      );
      return null;
    }
    const chunks = await ctx.db
      .query("buildCollaborationExportArchiveChunks")
      .withIndex("by_exportId_and_sequence", (query) =>
        query.eq("exportId", exportRow._id)
      )
      .take(100);
    for (const chunk of chunks) {
      if (chunk.storageId) {
        await ctx.storage.delete(chunk.storageId);
      }
      await ctx.db.delete(chunk._id);
    }
    const [planRecords, planPosts] = await Promise.all([
      ctx.db
        .query("buildCollaborationExportArchivePlanRecords")
        .withIndex("by_exportId_and_ordinal", (query) =>
          query.eq("exportId", exportRow._id)
        )
        .take(100),
      ctx.db
        .query("buildCollaborationExportArchivePlanPosts")
        .withIndex("by_exportId_and_postId", (query) =>
          query.eq("exportId", exportRow._id)
        )
        .take(100),
    ]);
    for (const row of [...planRecords, ...planPosts]) {
      await ctx.db.delete(row._id);
    }
    if (
      chunks.length === 100 ||
      planRecords.length === 100 ||
      planPosts.length === 100
    ) {
      await ctx.scheduler.runAfter(
        0,
        internal.build_collaboration_export_archive
          .cleanupBuildCollaborationExportArchive,
        args
      );
      return null;
    }
    await ctx.db.patch(exportRow._id, {
      archiveCleanupCompletedAt: now,
      archiveChunkCount: 0,
      state: exportRow.state === "failed" ? "cleanup_complete" : "expired",
    });
    return null;
  })
  .internal();

export const cleanupExpiredBuildCollaborationExportArchives = internalMutation
  .input({})
  .returns(v.number())
  .handler(async (ctx) => {
    const now = Date.now();
    const [expired, failed, abandoned] = await Promise.all([
      ctx.db
        .query("buildCollaborationExports")
        .withIndex("by_state_and_expiresAt", (query) =>
          query.eq("state", "active").lt("expiresAt", now)
        )
        .take(20),
      ctx.db
        .query("buildCollaborationExports")
        .withIndex("by_state_and_expiresAt", (query) =>
          query.eq("state", "failed")
        )
        .take(20),
      ctx.db
        .query("buildCollaborationExports")
        .withIndex("by_state_and_expiresAt", (query) =>
          query.eq("state", "building").lt("expiresAt", now)
        )
        .take(20),
    ]);
    const exports = [...expired, ...failed, ...abandoned].slice(0, 20);
    for (const exportRow of exports) {
      await ctx.scheduler.runAfter(
        0,
        internal.build_collaboration_export_archive
          .cleanupBuildCollaborationExportArchive,
        { exportId: exportRow._id }
      );
    }
    return exports.length;
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
        cursor: string | null;
        nextRecordIndex: number;
        nextSequence: number;
        planRecord?: { ordinal: number };
        planRecordCount?: number;
        recordCount: number;
        state: string;
      };
      if (plan.state === "planning" || plan.state !== "building") {
        return null;
      }
      const recordIndex = plan.nextRecordIndex;
      if (!plan.planRecord || plan.planRecord.ordinal !== recordIndex) {
        throw new Error("Archive generation progress exceeds its record plan.");
      }
      const record = (await ctx.runQuery(
        internal.build_collaboration_export_archive
          .readBuildCollaborationArchiveRecord,
        {
          cursor: plan.cursor,
          exportId: args.exportId,
          recordOrdinal: recordIndex,
        }
      )) as { continueCursor: string; isDone: boolean };
      const bytes = new TextEncoder().encode(`${JSON.stringify(record)}\n`);
      let sequence = plan.nextSequence;
      for (
        let offset = 0, partIndex = 0;
        offset < bytes.length;
        offset += ARCHIVE_CHUNK_BYTES, partIndex += 1
      ) {
        const part = bytes.slice(offset, offset + ARCHIVE_CHUNK_BYTES);
        const contentHashSha256 = await sha256Hex(part);
        const claimToken = crypto.randomUUID();
        const reservation = (await ctx.runMutation(
          internal.build_collaboration_export_archive
            .reserveBuildCollaborationArchiveChunk,
          {
            byteLength: part.byteLength,
            claimToken,
            contentHashSha256,
            exportId: args.exportId,
            partIndex,
            recordIndex,
            sequence,
          }
        )) as { state: "busy" | "owned" | "stored" };
        if (reservation.state === "busy") {
          await ctx.scheduler.runAfter(
            ARCHIVE_CHUNK_CLAIM_TTL_MS,
            internal.build_collaboration_export_archive
              .generateBuildCollaborationFullArchive,
            args
          );
          return null;
        }
        if (reservation.state === "owned") {
          const completed = (await ctx.runMutation(
            internal.build_collaboration_export_archive
              .completeBuildCollaborationArchiveChunk,
            {
              claimToken,
              content: part.buffer,
              exportId: args.exportId,
              sequence,
            }
          )) as { accepted: boolean };
          if (!completed.accepted) {
            await ctx.scheduler.runAfter(
              ARCHIVE_CHUNK_CLAIM_TTL_MS,
              internal.build_collaboration_export_archive
                .generateBuildCollaborationFullArchive,
              args
            );
            return null;
          }
        }
        sequence += 1;
      }
      await ctx.runMutation(
        internal.build_collaboration_export_archive
          .completeBuildCollaborationArchive,
        {
          completedRecordIndex: recordIndex,
          continueCursor: record.continueCursor,
          exportId: args.exportId,
          nextSequence: sequence,
          planRecordCount: plan.planRecordCount ?? 0,
          recordDone: record.isDone,
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
    archiveSnapshotAt?: number;
    posts?: CollaborationPostArchiveSnapshot[];
  };
  const posts = parsed.posts ?? [];
  return {
    authorization,
    exportRow,
    manifest: {
      postIds: new Set(posts.map((post) => post.postId)),
      posts,
      snapshotAt: parsed.archiveSnapshotAt ?? exportRow.createdAt,
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
