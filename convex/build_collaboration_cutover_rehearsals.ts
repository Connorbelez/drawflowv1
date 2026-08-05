import { v } from "convex/values";

import { api, internal } from "./_generated/api";
import {
  authenticatedAction,
  authenticatedMutation,
  authenticatedQuery,
} from "./authz";
import {
  authorizeLegacyNoteOperator,
  normalizePageSize,
  sha256Hex,
} from "./build_collaboration_legacy_note_shared";
import { internalMutation } from "./fluent";
import type { Doc, Id, MutationCtx, QueryCtx } from "./types";

const SNAPSHOT_VERSION = "build-collaboration-rollback-snapshot/v1";
const MAX_SNAPSHOT_PAGE = 100;
const LEGACY_WRITE_DENIAL =
  "Public/Internal Notes are retired. Publish a governed collaboration post instead.";
const GIT_SHA_PATTERN = /^[a-f0-9]{40}$/i;
const HTTPS_PATTERN = /^https:\/\//;
const PRODUCTION_DEPLOYMENT_PATTERN =
  /^(?:prod|[a-z0-9][a-z0-9-]*:[a-z0-9][a-z0-9-]*:prod)$/i;
const SHA256_PATTERN = /^[a-f0-9]{64}$/i;

const artifactAttestationKindValidator = v.union(
  v.literal("migration_preview"),
  v.literal("migration_application"),
  v.literal("migration_replay"),
  v.literal("migration_parity"),
  v.literal("manual_visual_review"),
  v.literal("manual_keyboard_review")
);

const snapshotPhaseValidator = v.union(
  v.literal("posts"),
  v.literal("revisions"),
  v.literal("assets"),
  v.literal("receipts"),
  v.literal("auditEvents"),
  v.literal("complete")
);

type SnapshotPhase =
  | "posts"
  | "revisions"
  | "assets"
  | "receipts"
  | "auditEvents"
  | "complete";

interface ReleaseMetadata {
  applicationUrl: string;
  applicationVersion: string;
  convexDeployment: string;
  convexUrl: string;
  gitCommit: string;
}

export const beginBuildCollaborationRollbackRehearsal = authenticatedMutation
  .input({
    applicationUrl: v.string(),
    applicationVersion: v.string(),
    buildId: v.id("activeBuilds"),
    convexDeployment: v.string(),
    convexUrl: v.string(),
    gitCommit: v.string(),
    organizationId: v.string(),
  })
  .returns(
    v.object({
      rehearsalId: v.id("buildCollaborationCutoverRehearsals"),
      snapshotId: v.id("buildCollaborationCutoverSnapshots"),
    })
  )
  .handler(async (ctx, args) => {
    const authorization = await authorizeLegacyNoteOperator(ctx, args, true);
    const setting = await requireTenantSetting(
      ctx,
      authorization.organizationId
    );
    if (
      setting.brokerageId !== authorization.brokerage._id ||
      setting.status !== "active"
    ) {
      throw new Error("Rollback rehearsal must begin from an active tenant.");
    }
    const release = normalizeAndVerifyReleaseMetadata(args);
    const activeStatuses = [
      "capturing_before",
      "before_ready",
      "disabled_verified",
      "capturing_after",
    ] as const;
    const inProgress = (
      await Promise.all(
        activeStatuses.map((status) =>
          ctx.db
            .query("buildCollaborationCutoverRehearsals")
            .withIndex("by_organizationId_and_status", (query) =>
              query
                .eq("organizationId", authorization.organizationId)
                .eq("status", status)
            )
            .first()
        )
      )
    ).find(Boolean);
    if (inProgress) {
      throw new Error("A rollback rehearsal is already in progress.");
    }
    const now = Date.now();
    const rehearsalId = await ctx.db.insert(
      "buildCollaborationCutoverRehearsals",
      {
        beforeCutoverEpoch: setting.cutoverEpoch ?? 0,
        brokerageId: authorization.brokerage._id,
        createdAt: now,
        organizationId: authorization.organizationId,
        releaseApplicationUrl: release.applicationUrl,
        releaseApplicationVersion: release.applicationVersion,
        releaseConvexDeployment: release.convexDeployment,
        releaseConvexUrl: release.convexUrl,
        releaseGitCommit: release.gitCommit,
        representativeBuildId: authorization.build._id,
        requestedByWorkosUserId: authorization.viewer.subject,
        status: "capturing_before",
        updatedAt: now,
      }
    );
    const snapshotId = await createSnapshot(ctx, {
      auditCutoffAt: now,
      authorization,
      kind: "before",
      rehearsalId,
    });
    await ctx.db.patch(rehearsalId, { beforeSnapshotId: snapshotId });
    return { rehearsalId, snapshotId };
  })
  .public();

export const advanceBuildCollaborationRollbackSnapshot = authenticatedMutation
  .input({
    buildId: v.id("activeBuilds"),
    limit: v.number(),
    organizationId: v.string(),
    snapshotId: v.id("buildCollaborationCutoverSnapshots"),
  })
  .returns(
    v.object({
      count: v.number(),
      isComplete: v.boolean(),
      phase: snapshotPhaseValidator,
      retentionMatched: v.optional(v.boolean()),
    })
  )
  .handler(async (ctx, args) => {
    const authorization = await authorizeLegacyNoteOperator(ctx, args, true);
    const limit = normalizePageSize(args.limit, MAX_SNAPSHOT_PAGE);
    const snapshot = await requireAuthorizedSnapshot(
      ctx,
      args.snapshotId,
      authorization.organizationId,
      authorization.brokerage._id
    );
    if (snapshot.status !== "capturing" || snapshot.phase === "complete") {
      return {
        count: snapshot.currentCount,
        isComplete: true,
        phase: snapshot.phase,
        retentionMatched: snapshot.status === "complete",
      };
    }
    await requireSnapshotState(ctx, snapshot);
    const page = await snapshotPage(ctx, snapshot, limit);
    let currentHash = snapshot.currentHash;
    for (const row of page.page) {
      currentHash = await sha256Hex(`${currentHash}\n${JSON.stringify(row)}`);
    }
    const currentCount = snapshot.currentCount + page.page.length;
    const now = Date.now();
    if (!page.isDone) {
      await ctx.db.patch(snapshot._id, {
        cursor: page.continueCursor,
        currentCount,
        currentHash,
        updatedAt: now,
      });
      return {
        count: currentCount,
        isComplete: false,
        phase: snapshot.phase,
      };
    }
    const nextPhase = phaseAfter(snapshot.phase);
    const completedPatch = phaseCompletionPatch(
      snapshot.phase,
      currentCount,
      currentHash
    );
    if (nextPhase !== "complete") {
      await ctx.db.patch(snapshot._id, {
        ...completedPatch,
        cursor: undefined,
        currentCount: 0,
        currentHash: await snapshotSeed(
          authorization.organizationId,
          nextPhase
        ),
        phase: nextPhase,
        updatedAt: now,
      });
      return { count: 0, isComplete: false, phase: nextPhase };
    }
    const completedSnapshot = { ...snapshot, ...completedPatch };
    await ctx.db.patch(snapshot._id, {
      ...completedPatch,
      cursor: undefined,
      currentCount,
      currentHash,
      updatedAt: now,
    });
    const retentionMatched = await finishSnapshot(ctx, completedSnapshot, now);
    return {
      count: currentCount,
      isComplete: true,
      phase: "complete",
      retentionMatched,
    };
  })
  .public();

export const beginBuildCollaborationRollbackAfterSnapshot =
  authenticatedMutation
    .input({
      buildId: v.id("activeBuilds"),
      organizationId: v.string(),
      rehearsalId: v.id("buildCollaborationCutoverRehearsals"),
    })
    .returns(v.id("buildCollaborationCutoverSnapshots"))
    .handler(async (ctx, args) => {
      const authorization = await authorizeLegacyNoteOperator(ctx, args, true);
      const rehearsal = await requireAuthorizedRehearsal(
        ctx,
        args.rehearsalId,
        authorization.organizationId,
        authorization.brokerage._id
      );
      const setting = await requireTenantSetting(
        ctx,
        authorization.organizationId
      );
      if (
        rehearsal.status !== "disabled_verified" ||
        setting.status !== "disabled" ||
        setting.cutoverEpoch !== rehearsal.beforeCutoverEpoch + 1 ||
        rehearsal.disabledCutoverEpoch !== setting.cutoverEpoch
      ) {
        throw new Error(
          "After-snapshot capture requires the server-verified disabled rehearsal state."
        );
      }
      const snapshotId = await createSnapshot(ctx, {
        auditCutoffAt: (await requireBeforeSnapshot(ctx, rehearsal))
          .auditCutoffAt,
        authorization,
        kind: "after",
        rehearsalId: rehearsal._id,
      });
      await ctx.db.patch(rehearsal._id, {
        afterSnapshotId: snapshotId,
        status: "capturing_after",
        updatedAt: Date.now(),
      });
      return snapshotId;
    })
    .public();

export const getBuildCollaborationRollbackCanaryContext = authenticatedQuery
  .input({
    buildId: v.id("activeBuilds"),
    organizationId: v.string(),
    rehearsalId: v.id("buildCollaborationCutoverRehearsals"),
  })
  .returns(
    v.object({
      cutoverEpoch: v.number(),
      status: v.literal("disabled"),
    })
  )
  .handler(async (ctx, args) => {
    const authorization = await authorizeLegacyNoteOperator(ctx, args);
    const rehearsal = await requireAuthorizedRehearsal(
      ctx,
      args.rehearsalId,
      authorization.organizationId,
      authorization.brokerage._id
    );
    const setting = await requireTenantSetting(
      ctx,
      authorization.organizationId
    );
    if (
      rehearsal.status !== "before_ready" ||
      setting.status !== "disabled" ||
      setting.cutoverEpoch !== rehearsal.beforeCutoverEpoch + 1
    ) {
      throw new Error(
        "Legacy-write canary requires the disabled rollback state."
      );
    }
    return { cutoverEpoch: setting.cutoverEpoch, status: "disabled" };
  })
  .public();

export const executeBuildCollaborationLegacyWriteDenialCanary =
  authenticatedAction
    .input({
      buildId: v.id("activeBuilds"),
      organizationId: v.string(),
      rehearsalId: v.id("buildCollaborationCutoverRehearsals"),
    })
    .returns(v.literal("denied"))
    .handler(async (ctx, args) => {
      const context = await ctx.runQuery(
        api.build_collaboration_cutover_rehearsals
          .getBuildCollaborationRollbackCanaryContext,
        args
      );
      let denial = "";
      try {
        await ctx.runMutation(api.production_proposals.addActiveBuildNote, {
          body: "Build Collaboration rollback denial canary",
          buildId: args.buildId,
          visibility: "internal",
          workosOrganizationId: args.organizationId,
        });
      } catch (error) {
        denial = error instanceof Error ? error.message : String(error);
      }
      if (!denial.includes(LEGACY_WRITE_DENIAL)) {
        throw new Error(
          "Legacy Note denial canary did not receive the exact retired-write contract."
        );
      }
      await ctx.runMutation(
        internal.build_collaboration_cutover_rehearsals
          .recordBuildCollaborationLegacyWriteDenialCanary,
        {
          cutoverEpoch: context.cutoverEpoch,
          denial: LEGACY_WRITE_DENIAL,
          rehearsalId: args.rehearsalId,
          roles: [...ctx.viewer.roles],
          workosUserId: ctx.viewer.subject,
        }
      );
      return "denied" as const;
    })
    .public();

export const recordBuildCollaborationLegacyWriteDenialCanary = internalMutation
  .input({
    cutoverEpoch: v.number(),
    denial: v.string(),
    rehearsalId: v.id("buildCollaborationCutoverRehearsals"),
    roles: v.array(v.string()),
    workosUserId: v.string(),
  })
  .returns(v.null())
  .handler(async (ctx, args) => {
    const rehearsal = await ctx.db.get(args.rehearsalId);
    if (!rehearsal || rehearsal.status !== "before_ready") {
      throw new Error("Rollback rehearsal is not ready for denial evidence.");
    }
    const setting = await requireTenantSetting(ctx, rehearsal.organizationId);
    if (
      setting.status !== "disabled" ||
      setting.cutoverEpoch !== args.cutoverEpoch ||
      args.cutoverEpoch !== rehearsal.beforeCutoverEpoch + 1 ||
      args.denial !== LEGACY_WRITE_DENIAL
    ) {
      throw new Error("Rollback denial evidence does not match tenant state.");
    }
    const now = Date.now();
    await ctx.db.patch(rehearsal._id, {
      disabledCutoverEpoch: args.cutoverEpoch,
      disabledVerifiedAt: now,
      legacyWriteDenialError: args.denial,
      legacyWriteDeniedAt: now,
      status: "disabled_verified",
      updatedAt: now,
    });
    await ctx.db.insert("auditEvents", {
      actorRoles: args.roles,
      actorWorkosUserId: args.workosUserId,
      brokerageId: rehearsal.brokerageId,
      command: "executeBuildCollaborationLegacyWriteDenialCanary",
      createdAt: now,
      entityId: rehearsal._id,
      entityType: "buildCollaborationCutoverRehearsal",
      eventType: "build.collaboration.rollback.legacy_write_denied",
      newState: JSON.stringify({ cutoverEpoch: args.cutoverEpoch }),
      organizationId: rehearsal.organizationId,
      warnings: [],
    });
    return null;
  })
  .internal();

export const attestBuildCollaborationCutoverArtifact = authenticatedMutation
  .input({
    artifactSha256: v.string(),
    buildId: v.id("activeBuilds"),
    kind: artifactAttestationKindValidator,
    organizationId: v.string(),
    rehearsalId: v.id("buildCollaborationCutoverRehearsals"),
  })
  .returns(v.id("buildCollaborationCutoverArtifactAttestations"))
  .handler(async (ctx, args) => {
    const authorization = await authorizeLegacyNoteOperator(ctx, args, true);
    const rehearsal = await requireAuthorizedRehearsal(
      ctx,
      args.rehearsalId,
      authorization.organizationId,
      authorization.brokerage._id
    );
    const setting = await requireTenantSetting(
      ctx,
      authorization.organizationId
    );
    if (
      rehearsal.status !== "complete" ||
      setting.status !== "active" ||
      rehearsal.disabledCutoverEpoch === undefined ||
      setting.cutoverEpoch !== rehearsal.disabledCutoverEpoch ||
      rehearsal.representativeBuildId !== authorization.build._id
    ) {
      throw new Error(
        "Cutover artifacts may be attested only after the completed rehearsal is reactivated at the certified epoch."
      );
    }
    const artifactSha256 = args.artifactSha256.trim().toLowerCase();
    if (!SHA256_PATTERN.test(artifactSha256)) {
      throw new Error("Cutover artifact SHA-256 is invalid.");
    }
    const now = Date.now();
    const attestationId = await ctx.db.insert(
      "buildCollaborationCutoverArtifactAttestations",
      {
        artifactSha256,
        attestedByRoles: [...authorization.viewer.roles],
        attestedByWorkosUserId: authorization.viewer.subject,
        brokerageId: authorization.brokerage._id,
        createdAt: now,
        kind: args.kind,
        organizationId: authorization.organizationId,
        rehearsalId: rehearsal._id,
        representativeBuildId: authorization.build._id,
      }
    );
    await ctx.db.insert("auditEvents", {
      actorRoles: [...authorization.viewer.roles],
      actorWorkosUserId: authorization.viewer.subject,
      brokerageId: authorization.brokerage._id,
      command: "attestBuildCollaborationCutoverArtifact",
      createdAt: now,
      entityId: attestationId,
      entityType: "buildCollaborationCutoverArtifactAttestation",
      eventType: "build.collaboration.cutover.artifact_attested",
      newState: JSON.stringify({ artifactSha256, kind: args.kind }),
      organizationId: authorization.organizationId,
      warnings: [],
    });
    return attestationId;
  })
  .public();

async function createSnapshot(
  ctx: MutationCtx,
  input: {
    auditCutoffAt: number;
    authorization: Awaited<ReturnType<typeof authorizeLegacyNoteOperator>>;
    kind: "after" | "before";
    rehearsalId: Id<"buildCollaborationCutoverRehearsals">;
  }
) {
  const now = Date.now();
  return await ctx.db.insert("buildCollaborationCutoverSnapshots", {
    auditCutoffAt: input.auditCutoffAt,
    brokerageId: input.authorization.brokerage._id,
    createdAt: now,
    currentCount: 0,
    currentHash: await snapshotSeed(
      input.authorization.organizationId,
      "posts"
    ),
    kind: input.kind,
    organizationId: input.authorization.organizationId,
    phase: "posts",
    rehearsalId: input.rehearsalId,
    status: "capturing",
    updatedAt: now,
  });
}

async function snapshotPage(
  ctx: MutationCtx,
  snapshot: Doc<"buildCollaborationCutoverSnapshots">,
  limit: number
) {
  const paginationOpts = {
    cursor: snapshot.cursor ?? null,
    numItems: limit,
  };
  switch (snapshot.phase) {
    case "posts":
      return await ctx.db
        .query("buildCollaborationPosts")
        .withIndex("by_organizationId_and_createdAt", (query) =>
          query
            .eq("organizationId", snapshot.organizationId)
            .lt("createdAt", snapshot.auditCutoffAt)
        )
        .paginate(paginationOpts);
    case "revisions":
      return await ctx.db
        .query("buildCollaborationPostRevisions")
        .withIndex("by_organizationId_and_createdAt", (query) =>
          query
            .eq("organizationId", snapshot.organizationId)
            .lt("createdAt", snapshot.auditCutoffAt)
        )
        .paginate(paginationOpts);
    case "assets":
      return await ctx.db
        .query("buildCollaborationAssets")
        .withIndex("by_organizationId_and_createdAt", (query) =>
          query
            .eq("organizationId", snapshot.organizationId)
            .lt("createdAt", snapshot.auditCutoffAt)
        )
        .paginate(paginationOpts);
    case "receipts":
      return await ctx.db
        .query("buildCollaborationReceipts")
        .withIndex("by_organizationId_and_firstViewedAt", (query) =>
          query
            .eq("organizationId", snapshot.organizationId)
            .lt("firstViewedAt", snapshot.auditCutoffAt)
        )
        .paginate(paginationOpts);
    case "auditEvents":
      return await ctx.db
        .query("auditEvents")
        .withIndex("by_organizationId_and_createdAt", (query) =>
          query
            .eq("organizationId", snapshot.organizationId)
            .lt("createdAt", snapshot.auditCutoffAt)
        )
        .paginate(paginationOpts);
    case "complete":
      throw new Error("Completed snapshots cannot be advanced.");
  }
}

function phaseAfter(phase: SnapshotPhase): SnapshotPhase {
  const phases: SnapshotPhase[] = [
    "posts",
    "revisions",
    "assets",
    "receipts",
    "auditEvents",
    "complete",
  ];
  return phases[phases.indexOf(phase) + 1] ?? "complete";
}

function phaseCompletionPatch(
  phase: Exclude<SnapshotPhase, "complete">,
  count: number,
  hash: string
) {
  return {
    [`${phase}Count`]: count,
    [`${phase}Hash`]: hash,
  } as Partial<Doc<"buildCollaborationCutoverSnapshots">>;
}

async function finishSnapshot(
  ctx: MutationCtx,
  snapshot: Doc<"buildCollaborationCutoverSnapshots">,
  now: number
) {
  const rehearsal = await ctx.db.get(snapshot.rehearsalId);
  if (!rehearsal) {
    throw new Error("Rollback rehearsal was not found.");
  }
  if (snapshot.kind === "before") {
    await ctx.db.patch(snapshot._id, {
      completedAt: now,
      phase: "complete",
      status: "complete",
      updatedAt: now,
    });
    await ctx.db.patch(rehearsal._id, {
      status: "before_ready",
      updatedAt: now,
    });
    return true;
  }
  const before = await requireBeforeSnapshot(ctx, rehearsal);
  const retentionMatched = retainedDigestsMatch(before, snapshot);
  await ctx.db.patch(snapshot._id, {
    completedAt: now,
    phase: "complete",
    status: retentionMatched ? "complete" : "failed",
    updatedAt: now,
  });
  await ctx.db.patch(rehearsal._id, {
    completedAt: retentionMatched ? now : undefined,
    failureReason: retentionMatched
      ? undefined
      : "Tenant-wide retained collaboration digests changed during rollback.",
    status: retentionMatched ? "complete" : "failed",
    updatedAt: now,
  });
  return retentionMatched;
}

function retainedDigestsMatch(
  before: Doc<"buildCollaborationCutoverSnapshots">,
  after: Doc<"buildCollaborationCutoverSnapshots">
) {
  return ["posts", "revisions", "assets", "receipts", "auditEvents"].every(
    (phase) =>
      before[`${phase}Count` as keyof typeof before] ===
        after[`${phase}Count` as keyof typeof after] &&
      before[`${phase}Hash` as keyof typeof before] ===
        after[`${phase}Hash` as keyof typeof after]
  );
}

async function snapshotSeed(organizationId: string, phase: SnapshotPhase) {
  return await sha256Hex(
    JSON.stringify({ organizationId, phase, version: SNAPSHOT_VERSION })
  );
}

function normalizeAndVerifyReleaseMetadata(
  input: ReleaseMetadata
): ReleaseMetadata {
  const release = Object.fromEntries(
    Object.entries(input).map(([key, value]) => [key, value.trim()])
  ) as unknown as ReleaseMetadata;
  if (
    !(
      GIT_SHA_PATTERN.test(release.gitCommit) &&
      release.applicationVersion &&
      PRODUCTION_DEPLOYMENT_PATTERN.test(release.convexDeployment) &&
      HTTPS_PATTERN.test(release.applicationUrl) &&
      HTTPS_PATTERN.test(release.convexUrl)
    )
  ) {
    throw new Error("Rollback rehearsal release metadata is invalid.");
  }
  const expected = {
    applicationUrl: process.env.BUILD_COLLABORATION_RELEASE_APPLICATION_URL,
    applicationVersion:
      process.env.BUILD_COLLABORATION_RELEASE_APPLICATION_VERSION,
    convexDeployment: process.env.BUILD_COLLABORATION_RELEASE_CONVEX_DEPLOYMENT,
    convexUrl: process.env.CONVEX_CLOUD_URL,
    gitCommit: process.env.BUILD_COLLABORATION_RELEASE_GIT_SHA,
  };
  for (const [key, value] of Object.entries(expected)) {
    if (!value || release[key as keyof ReleaseMetadata] !== value) {
      throw new Error(
        `Rollback rehearsal release metadata does not match server ${key}.`
      );
    }
  }
  return release;
}

async function requireTenantSetting(
  ctx: MutationCtx | QueryCtx,
  organizationId: string
) {
  const setting = await ctx.db
    .query("buildCollaborationTenantSettings")
    .withIndex("by_organizationId", (query) =>
      query.eq("organizationId", organizationId)
    )
    .unique();
  if (!setting) {
    throw new Error("Build Collaboration tenant state is unavailable.");
  }
  return setting;
}

async function requireAuthorizedSnapshot(
  ctx: MutationCtx,
  snapshotId: Id<"buildCollaborationCutoverSnapshots">,
  organizationId: string,
  brokerageId: Id<"brokerages">
) {
  const snapshot = await ctx.db.get(snapshotId);
  if (
    !snapshot ||
    snapshot.organizationId !== organizationId ||
    snapshot.brokerageId !== brokerageId
  ) {
    throw new Error("Forbidden: rollback snapshot scope.");
  }
  return snapshot;
}

async function requireSnapshotState(
  ctx: MutationCtx,
  snapshot: Doc<"buildCollaborationCutoverSnapshots">
) {
  const [rehearsal, setting] = await Promise.all([
    ctx.db.get(snapshot.rehearsalId),
    requireTenantSetting(ctx, snapshot.organizationId),
  ]);
  if (!rehearsal) {
    throw new Error("Rollback rehearsal was not found.");
  }
  const isValidBefore =
    snapshot.kind === "before" &&
    rehearsal.beforeSnapshotId === snapshot._id &&
    rehearsal.status === "capturing_before" &&
    setting.status === "active" &&
    setting.cutoverEpoch === rehearsal.beforeCutoverEpoch;
  const isValidAfter =
    snapshot.kind === "after" &&
    rehearsal.afterSnapshotId === snapshot._id &&
    rehearsal.status === "capturing_after" &&
    setting.status === "disabled" &&
    rehearsal.disabledCutoverEpoch !== undefined &&
    setting.cutoverEpoch === rehearsal.disabledCutoverEpoch;
  if (!(isValidBefore || isValidAfter)) {
    throw new Error(
      "Rollback snapshot state changed; discard the partial snapshot and restart the rehearsal."
    );
  }
}

async function requireAuthorizedRehearsal(
  ctx: MutationCtx | QueryCtx,
  rehearsalId: Id<"buildCollaborationCutoverRehearsals">,
  organizationId: string,
  brokerageId: Id<"brokerages">
) {
  const rehearsal = await ctx.db.get(rehearsalId);
  if (
    !rehearsal ||
    rehearsal.organizationId !== organizationId ||
    rehearsal.brokerageId !== brokerageId
  ) {
    throw new Error("Forbidden: rollback rehearsal scope.");
  }
  return rehearsal;
}

async function requireBeforeSnapshot(
  ctx: MutationCtx,
  rehearsal: Doc<"buildCollaborationCutoverRehearsals">
) {
  const snapshot = rehearsal.beforeSnapshotId
    ? await ctx.db.get(rehearsal.beforeSnapshotId)
    : null;
  if (!snapshot || snapshot.status !== "complete") {
    throw new Error("Rollback before-snapshot is incomplete.");
  }
  return snapshot;
}
