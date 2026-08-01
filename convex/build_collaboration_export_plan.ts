import { v } from "convex/values";

import { internal } from "./_generated/api";
import {
  type ActiveBuildAuthorization,
  authorizeActiveBuildAccessForViewer,
} from "./activeBuildAccess";
import { normalizeRoleSlugs } from "./authz";
import { canReadCollaborationPost } from "./build_collaboration_access";
import {
  COLLABORATION_POST_ARCHIVE_SECTIONS,
  type CollaborationPostArchiveSnapshot,
} from "./build_collaboration_archive";
import {
  canReadCollaborationAsset,
  isCleanCollaborationAsset,
} from "./build_collaboration_asset_access";
import {
  buildCollaborationExportAssetAclDecision,
  buildCollaborationExportPostAclDecision,
} from "./build_collaboration_export_acl";
import { internalMutation } from "./fluent";
import type { Doc, Id, MutationCtx } from "./types";

const MAX_ARCHIVE_POSTS = 2000;
const MAX_ARCHIVE_ASSETS = 2000;
const POST_PLAN_PAGE_SIZE = 1;
const ASSET_PLAN_PAGE_SIZE = 5;

export const BUILD_HISTORY_ARCHIVE_SECTIONS = [
  "build_state",
  "lifecycle_events",
  "closure_waivers",
  "lifecycle_audit",
] as const;

export const planBuildCollaborationFullArchive = internalMutation
  .input({ exportId: v.id("buildCollaborationExports") })
  .returns(v.null())
  .handler(async (ctx, args) => {
    const exportRow = await ctx.db.get(args.exportId);
    if (
      !exportRow ||
      exportRow.scope !== "full_archive" ||
      exportRow.state !== "building" ||
      exportRow.archivePlanPhase === "complete"
    ) {
      return null;
    }
    const authorization = await archivePlanAuthorization(ctx, exportRow);
    const phase = exportRow.archivePlanPhase ?? "posts";
    if (phase === "posts") {
      await planPostPage(ctx, exportRow, authorization);
    } else {
      await planAssetPage(ctx, exportRow, authorization);
    }
    return null;
  })
  .internal();

async function planPostPage(
  ctx: MutationCtx,
  exportRow: Doc<"buildCollaborationExports">,
  authorization: ActiveBuildAuthorization
) {
  let ordinal = await ensureBuildHistoryPlan(ctx, exportRow);
  const page = await ctx.db
    .query("buildCollaborationPosts")
    .withIndex("by_buildId_and_createdAt", (query) =>
      query
        .eq("buildId", exportRow.buildId)
        .lte("createdAt", exportRow.createdAt)
    )
    .paginate({
      cursor: exportRow.archivePlanCursor ?? null,
      numItems: POST_PLAN_PAGE_SIZE,
    });
  let plannedPostCount = exportRow.archivePlannedPostCount ?? 0;
  for (const post of page.page) {
    if (!(await canReadCollaborationPost(ctx, authorization, post))) {
      continue;
    }
    if (plannedPostCount >= MAX_ARCHIVE_POSTS) {
      await failPlanning(
        ctx,
        exportRow,
        "Full archive exceeds the 2,000-post limit."
      );
      return;
    }
    const snapshot = await buildPostSnapshot(ctx, post, exportRow.createdAt);
    const aclDecision = await buildCollaborationExportPostAclDecision(
      ctx,
      authorization,
      post
    );
    await ctx.db.insert("buildCollaborationExportArchivePlanPosts", {
      aclDecisionJson: JSON.stringify(aclDecision),
      brokerageId: exportRow.brokerageId,
      buildId: exportRow.buildId,
      createdAt: Date.now(),
      exportId: exportRow._id,
      organizationId: exportRow.organizationId,
      postId: post._id,
      snapshotJson: JSON.stringify(snapshot),
    });
    for (const section of COLLABORATION_POST_ARCHIVE_SECTIONS) {
      await insertPlanRecord(ctx, exportRow, {
        kind: "post",
        ordinal,
        postId: post._id,
        recordKey: `post:${post._id}:${section}`,
        section,
      });
      ordinal += 1;
    }
    plannedPostCount += 1;
  }
  await ctx.db.patch(exportRow._id, {
    archiveHeartbeatAt: Date.now(),
    archivePlanCursor: page.isDone ? undefined : page.continueCursor,
    archivePlanNextOrdinal: ordinal,
    archivePlanPhase: page.isDone ? "assets" : "posts",
    archivePlannedPostCount: plannedPostCount,
  });
  await scheduleNextPlanStep(ctx, exportRow._id);
}

async function ensureBuildHistoryPlan(
  ctx: MutationCtx,
  exportRow: Doc<"buildCollaborationExports">
) {
  let ordinal = exportRow.archivePlanNextOrdinal ?? 0;
  if (ordinal !== 0) {
    return ordinal;
  }
  const buildState = await ctx.db
    .query("buildCollaborationBuildStates")
    .withIndex("by_buildId", (query) => query.eq("buildId", exportRow.buildId))
    .unique();
  for (const section of BUILD_HISTORY_ARCHIVE_SECTIONS) {
    await insertPlanRecord(ctx, exportRow, {
      kind: "build_history",
      ordinal,
      recordKey: `build:${section}`,
      section,
      snapshotJson:
        section === "build_state" ? JSON.stringify(buildState) : "{}",
    });
    ordinal += 1;
  }
  return ordinal;
}

async function planAssetPage(
  ctx: MutationCtx,
  exportRow: Doc<"buildCollaborationExports">,
  authorization: ActiveBuildAuthorization
) {
  const page = await ctx.db
    .query("buildCollaborationAssets")
    .withIndex("by_buildId", (query) => query.eq("buildId", exportRow.buildId))
    .filter((query) => query.lte(query.field("createdAt"), exportRow.createdAt))
    .paginate({
      cursor: exportRow.archivePlanCursor ?? null,
      numItems: ASSET_PLAN_PAGE_SIZE,
    });
  let ordinal = exportRow.archivePlanNextOrdinal ?? 0;
  let plannedAssetCount = exportRow.archivePlannedAssetCount ?? 0;
  for (const asset of page.page) {
    if (
      !(
        isCleanCollaborationAsset(asset) &&
        (await canReadCollaborationAsset(ctx, { asset, authorization }))
      )
    ) {
      continue;
    }
    if (plannedAssetCount >= MAX_ARCHIVE_ASSETS) {
      await failPlanning(
        ctx,
        exportRow,
        "Full archive exceeds the 2,000-asset limit."
      );
      return;
    }
    const aclDecision = await buildCollaborationExportAssetAclDecision(
      ctx,
      authorization,
      asset
    );
    await insertPlanRecord(ctx, exportRow, {
      aclDecisionJson: JSON.stringify(aclDecision),
      assetId: asset._id,
      kind: "asset",
      ordinal,
      recordKey: `asset:${asset._id}`,
      snapshotJson: JSON.stringify(assetSnapshot(asset)),
    });
    ordinal += 1;
    plannedAssetCount += 1;
  }
  if (!page.isDone) {
    await ctx.db.patch(exportRow._id, {
      archiveHeartbeatAt: Date.now(),
      archivePlanCursor: page.continueCursor,
      archivePlanNextOrdinal: ordinal,
      archivePlannedAssetCount: plannedAssetCount,
    });
    await scheduleNextPlanStep(ctx, exportRow._id);
    return;
  }
  await completePlan(ctx, exportRow, authorization, {
    ordinal,
    plannedAssetCount,
  });
}

async function completePlan(
  ctx: MutationCtx,
  exportRow: Doc<"buildCollaborationExports">,
  authorization: ActiveBuildAuthorization,
  input: { ordinal: number; plannedAssetCount: number }
) {
  const completedAt = Date.now();
  const plannedPostCount = exportRow.archivePlannedPostCount ?? 0;
  await ctx.db.patch(exportRow._id, {
    aclSnapshotJson: JSON.stringify({
      decisionsInArchive: true,
      effectiveRole: authorization.effectiveRole.role,
      generatedAt: exportRow.createdAt,
      organizationId: exportRow.organizationId,
      plannedAssetCount: input.plannedAssetCount,
      plannedPostCount,
      scope: "full_archive",
      viewerWorkosUserId: exportRow.requestedByWorkosUserId,
    }),
    archiveHeartbeatAt: completedAt,
    archivePlanCompletedAt: completedAt,
    archivePlanCursor: undefined,
    archivePlanNextOrdinal: input.ordinal,
    archivePlanPhase: "complete",
    archivePlannedAssetCount: input.plannedAssetCount,
    manifestJson: JSON.stringify({
      archiveSnapshotAt: exportRow.createdAt,
      assetsInArchive: true,
      build: {
        buildId: authorization.build._id,
        buildName: authorization.build.buildName,
      },
      exportedAt: exportRow.createdAt,
      plannedAssetCount: input.plannedAssetCount,
      plannedPostCount,
      postsInArchive: true,
      scope: "full_archive",
    }),
    recordCount: input.ordinal,
  });
  await ctx.scheduler.runAfter(
    0,
    internal.build_collaboration_export_archive
      .generateBuildCollaborationFullArchive,
    { exportId: exportRow._id }
  );
}

async function archivePlanAuthorization(
  ctx: MutationCtx,
  exportRow: Doc<"buildCollaborationExports">
) {
  return await authorizeActiveBuildAccessForViewer(
    ctx,
    {
      actorKind: "human",
      capability: "authenticated",
      organizationId: exportRow.organizationId,
      roles: normalizeRoleSlugs([exportRow.requestedByRole]),
      subject: exportRow.requestedByWorkosUserId,
      tokenIdentifier: `archive-plan:${exportRow._id}`,
    },
    { buildId: exportRow.buildId, organizationId: exportRow.organizationId }
  );
}

async function buildPostSnapshot(
  ctx: MutationCtx,
  post: Doc<"buildCollaborationPosts">,
  snapshotAt: number
): Promise<CollaborationPostArchiveSnapshot> {
  const revision = await ctx.db
    .query("buildCollaborationPostRevisions")
    .withIndex("by_postId_and_revision", (query) =>
      query.eq("postId", post._id)
    )
    .filter((query) => query.lte(query.field("createdAt"), snapshotAt))
    .order("desc")
    .first();
  if (!revision) {
    throw new Error(
      "A collaboration post is missing its request-time revision."
    );
  }
  return {
    audienceFloorTier: post.audienceFloorTier,
    audienceMode: post.audienceMode,
    authorDisplayNameSnapshot: post.authorDisplayNameSnapshot,
    authorRole: post.authorRole,
    createdAt: post.createdAt,
    currentRevisionId: revision._id,
    postId: post._id,
    postType: post.postType,
    primaryReferenceId: post.primaryReferenceId,
    primaryReferenceKind: post.primaryReferenceKind,
    revision: revision.revision,
    source: post.source,
    threadRevision: post.threadRevision ?? 0,
    updatedAt: Math.min(post.updatedAt, snapshotAt),
  };
}

function assetSnapshot(asset: Doc<"buildCollaborationAssets">) {
  return {
    assetId: asset._id,
    contentHashSha256: asset.contentHashSha256,
    createdAt: asset.createdAt,
    fileName: asset.fileName,
    maximumAudienceMode: asset.maximumAudienceMode,
    mimeType: asset.mimeType,
    originatingPostId: asset.originatingPostId,
    publishedOwnerKind: asset.publishedOwnerKind,
    publishedOwnerRecordId: asset.publishedOwnerRecordId,
    sizeBytes: asset.sizeBytes,
    version: asset.version,
  };
}

async function insertPlanRecord(
  ctx: MutationCtx,
  exportRow: Doc<"buildCollaborationExports">,
  input: {
    aclDecisionJson?: string;
    assetId?: Id<"buildCollaborationAssets">;
    kind: "asset" | "build_history" | "post";
    ordinal: number;
    postId?: Id<"buildCollaborationPosts">;
    recordKey: string;
    section?: string;
    snapshotJson?: string;
  }
) {
  await ctx.db.insert("buildCollaborationExportArchivePlanRecords", {
    aclDecisionJson: input.aclDecisionJson,
    assetId: input.assetId,
    brokerageId: exportRow.brokerageId,
    buildId: exportRow.buildId,
    createdAt: Date.now(),
    exportId: exportRow._id,
    kind: input.kind,
    ordinal: input.ordinal,
    organizationId: exportRow.organizationId,
    postId: input.postId,
    recordKey: input.recordKey,
    section: input.section,
    snapshotJson: input.snapshotJson ?? "{}",
  });
}

async function scheduleNextPlanStep(
  ctx: MutationCtx,
  exportId: Id<"buildCollaborationExports">
) {
  await ctx.scheduler.runAfter(
    0,
    internal.build_collaboration_export_plan.planBuildCollaborationFullArchive,
    { exportId }
  );
}

async function failPlanning(
  ctx: MutationCtx,
  exportRow: Doc<"buildCollaborationExports">,
  safeError: string
) {
  await ctx.db.patch(exportRow._id, {
    archiveFailure: safeError,
    archiveHeartbeatAt: Date.now(),
    state: "failed",
  });
}
