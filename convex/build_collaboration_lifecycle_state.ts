import type { ActiveBuildAuthorization } from "./activeBuildAccess";
import { buildCollaborationValidationError } from "./build_collaboration_validation";
import type { Doc, Id, MutationCtx, QueryCtx } from "./types";

export const BUILD_COLLABORATION_ARCHIVE_SNAPSHOT_LEASE_MS = 15 * 60_000;
export const BUILD_COLLABORATION_ARCHIVE_SNAPSHOT_ERROR =
  "This Build is temporarily read-only while a governed archive snapshot is captured.";
export const BUILD_COLLABORATION_RETENTION_PURGE_ERROR =
  "This Build cannot start a governed archive while retention purge is in progress.";

export const BUILD_COLLABORATION_CLOSED_ERROR =
  "This Build's collaboration archive is closed and read-only.";
export const BUILD_COLLABORATION_PURGED_ERROR =
  "This Build's collaboration content has been purged under its retention policy.";
export const BUILD_COLLABORATION_LIFECYCLE_TENANCY_ERROR =
  "Build collaboration lifecycle tenancy is invalid.";

export async function getStoredBuildCollaborationState(
  ctx: QueryCtx,
  authorization: ActiveBuildAuthorization
) {
  const state = await ctx.db
    .query("buildCollaborationBuildStates")
    .withIndex("by_buildId", (query) =>
      query.eq("buildId", authorization.build._id)
    )
    .unique();
  if (
    state &&
    (state.organizationId !== authorization.organizationId ||
      state.brokerageId !== authorization.brokerage._id)
  ) {
    throw buildCollaborationValidationError(
      BUILD_COLLABORATION_LIFECYCLE_TENANCY_ERROR
    );
  }
  return state;
}

export async function requireBuildCollaborationWritable(
  ctx: MutationCtx,
  authorization: ActiveBuildAuthorization
) {
  const state = await getStoredBuildCollaborationState(ctx, authorization);
  if (state?.state === "closed") {
    throw buildCollaborationValidationError(BUILD_COLLABORATION_CLOSED_ERROR);
  }
  if (state?.state === "purged") {
    throw buildCollaborationValidationError(BUILD_COLLABORATION_PURGED_ERROR);
  }
  if (
    state?.archiveSnapshotExportId &&
    (state.archiveSnapshotLeaseExpiresAt ?? 0) > Date.now()
  ) {
    throw buildCollaborationValidationError(
      BUILD_COLLABORATION_ARCHIVE_SNAPSHOT_ERROR
    );
  }
  const now = Date.now();
  if (state) {
    await ctx.db.patch(state._id, {
      contentRevision: (state.contentRevision ?? 0) + 1,
      updatedAt: now,
    });
  } else {
    await ctx.db.insert("buildCollaborationBuildStates", {
      brokerageId: authorization.brokerage._id,
      buildId: authorization.build._id,
      contentRevision: 1,
      createdAt: now,
      organizationId: authorization.organizationId,
      revision: 0,
      state: "open",
      updatedAt: now,
    });
  }
}

export async function isBuildCollaborationWritableByBuildId(
  ctx: QueryCtx,
  input: {
    buildId: Id<"activeBuilds">;
    organizationId: string;
  }
) {
  const state = await ctx.db
    .query("buildCollaborationBuildStates")
    .withIndex("by_buildId", (query) => query.eq("buildId", input.buildId))
    .unique();
  return (
    (!state || state.organizationId === input.organizationId) &&
    state?.state !== "closed" &&
    state?.state !== "purged" &&
    !(
      state?.archiveSnapshotExportId &&
      (state.archiveSnapshotLeaseExpiresAt ?? 0) > Date.now()
    )
  );
}

export async function recordBuildCollaborationWriteByBuildId(
  ctx: MutationCtx,
  input: { buildId: Id<"activeBuilds">; organizationId: string }
) {
  const state = await ctx.db
    .query("buildCollaborationBuildStates")
    .withIndex("by_buildId", (query) => query.eq("buildId", input.buildId))
    .unique();
  if (!state) {
    return;
  }
  if (state.organizationId !== input.organizationId) {
    throw buildCollaborationValidationError(
      BUILD_COLLABORATION_LIFECYCLE_TENANCY_ERROR
    );
  }
  await ctx.db.patch(state._id, {
    contentRevision: (state.contentRevision ?? 0) + 1,
    updatedAt: Date.now(),
  });
}

export async function claimBuildCollaborationWriteByBuildId(
  ctx: MutationCtx,
  input: { buildId: Id<"activeBuilds">; organizationId: string }
) {
  if (!(await isBuildCollaborationWritableByBuildId(ctx, input))) {
    return false;
  }
  await recordBuildCollaborationWriteByBuildId(ctx, input);
  return true;
}

export async function beginBuildCollaborationArchiveSnapshot(
  ctx: MutationCtx,
  authorization: ActiveBuildAuthorization,
  exportId: Id<"buildCollaborationExports">
) {
  const now = Date.now();
  let state = await getStoredBuildCollaborationState(ctx, authorization);
  if (
    state?.archiveSnapshotExportId &&
    (state.archiveSnapshotLeaseExpiresAt ?? 0) > now
  ) {
    throw new Error(
      "Another governed archive snapshot is already in progress."
    );
  }
  if (state?.archiveSnapshotExportId) {
    const abandoned = await ctx.db.get(state.archiveSnapshotExportId);
    if (abandoned?.state === "building") {
      await ctx.db.patch(abandoned._id, {
        archiveFailure: "Archive snapshot lease expired before completion.",
        state: "failed",
      });
    }
  }
  const activePurge = await ctx.db
    .query("buildCollaborationRetentionPurges")
    .withIndex("by_buildId_and_state", (query) =>
      query.eq("buildId", authorization.build._id).eq("state", "in_progress")
    )
    .first();
  if (activePurge) {
    throw buildCollaborationValidationError(
      BUILD_COLLABORATION_RETENTION_PURGE_ERROR
    );
  }
  if (!state) {
    const stateId = await ctx.db.insert("buildCollaborationBuildStates", {
      brokerageId: authorization.brokerage._id,
      buildId: authorization.build._id,
      contentRevision: 0,
      createdAt: now,
      organizationId: authorization.organizationId,
      revision: 0,
      state: "open",
      updatedAt: now,
    });
    state = await ctx.db.get(stateId);
  }
  if (!state) {
    throw new Error("Archive snapshot lock could not be initialized.");
  }
  await ctx.db.patch(state._id, {
    archiveSnapshotExportId: exportId,
    archiveSnapshotLeaseExpiresAt:
      now + BUILD_COLLABORATION_ARCHIVE_SNAPSHOT_LEASE_MS,
    archiveSnapshotStartedAt: now,
    updatedAt: now,
  });
  return state.contentRevision ?? 0;
}

export function assertNoActiveBuildCollaborationArchiveSnapshot(
  state: Doc<"buildCollaborationBuildStates"> | null,
  now = Date.now()
) {
  if (
    state?.archiveSnapshotExportId &&
    (state.archiveSnapshotLeaseExpiresAt ?? 0) > now
  ) {
    throw buildCollaborationValidationError(
      BUILD_COLLABORATION_ARCHIVE_SNAPSHOT_ERROR
    );
  }
}

export async function renewBuildCollaborationArchiveSnapshot(
  ctx: MutationCtx,
  input: {
    buildId: Id<"activeBuilds">;
    exportId: Id<"buildCollaborationExports">;
    organizationId: string;
  }
) {
  const state = await ctx.db
    .query("buildCollaborationBuildStates")
    .withIndex("by_buildId", (query) => query.eq("buildId", input.buildId))
    .unique();
  const now = Date.now();
  if (
    !state ||
    state.organizationId !== input.organizationId ||
    state.archiveSnapshotExportId !== input.exportId ||
    (state.archiveSnapshotLeaseExpiresAt ?? 0) <= now
  ) {
    throw new Error("Archive snapshot lease is unavailable or expired.");
  }
  await ctx.db.patch(state._id, {
    archiveSnapshotLeaseExpiresAt:
      now + BUILD_COLLABORATION_ARCHIVE_SNAPSHOT_LEASE_MS,
    updatedAt: now,
  });
  return state.contentRevision ?? 0;
}

export async function releaseBuildCollaborationArchiveSnapshot(
  ctx: MutationCtx,
  input: {
    buildId: Id<"activeBuilds">;
    exportId: Id<"buildCollaborationExports">;
  }
) {
  const state = await ctx.db
    .query("buildCollaborationBuildStates")
    .withIndex("by_buildId", (query) => query.eq("buildId", input.buildId))
    .unique();
  if (state?.archiveSnapshotExportId === input.exportId) {
    await ctx.db.patch(state._id, {
      archiveSnapshotExportId: undefined,
      archiveSnapshotLeaseExpiresAt: undefined,
      archiveSnapshotStartedAt: undefined,
      updatedAt: Date.now(),
    });
  }
}

export async function requireBuildCollaborationArchiveSnapshot(
  ctx: QueryCtx,
  input: {
    buildId: Id<"activeBuilds">;
    exportId: Id<"buildCollaborationExports">;
    organizationId: string;
  }
) {
  const state = await ctx.db
    .query("buildCollaborationBuildStates")
    .withIndex("by_buildId", (query) => query.eq("buildId", input.buildId))
    .unique();
  if (
    !state ||
    state.organizationId !== input.organizationId ||
    state.archiveSnapshotExportId !== input.exportId ||
    (state.archiveSnapshotLeaseExpiresAt ?? 0) <= Date.now()
  ) {
    throw new Error("Archive snapshot lease is unavailable or expired.");
  }
  return state;
}
