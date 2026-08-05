import { v } from "convex/values";

import { authenticatedMutation, authenticatedQuery } from "./authz";
import { authorizeLifecycleAuthority } from "./build_collaboration_lifecycle";
import {
  assertNoActiveBuildCollaborationArchiveSnapshot,
  getStoredBuildCollaborationState,
} from "./build_collaboration_lifecycle_state";
import { authorizeActiveBuildCollaborationAccess } from "./build_collaboration_rollout";
import type { Doc, Id, MutationCtx } from "./types";

const MIN_RETENTION_DAYS = 30;
const MAX_RETENTION_DAYS = 3650;
const PURGE_POST_BATCH_SIZE = 10;
const MAX_CHILD_ROWS_PER_POST = 2000;

const retentionStateValidator = v.object({
  activeLegalHold: v.optional(
    v.object({
      holdId: v.id("buildCollaborationLegalHolds"),
      placedAt: v.number(),
      reason: v.string(),
      reference: v.optional(v.string()),
    })
  ),
  policy: v.optional(
    v.object({
      policyId: v.id("buildCollaborationRetentionPolicies"),
      policyKey: v.string(),
      retentionDays: v.number(),
      version: v.number(),
    })
  ),
});

export const getBuildCollaborationRetentionState = authenticatedQuery
  .input({
    buildId: v.id("activeBuilds"),
    organizationId: v.string(),
  })
  .returns(retentionStateValidator)
  .handler(async (ctx, args) => {
    const authorization = await authorizeActiveBuildCollaborationAccess(
      ctx,
      args
    );
    const [policy, legalHold] = await Promise.all([
      ctx.db
        .query("buildCollaborationRetentionPolicies")
        .withIndex("by_organizationId_and_state", (query) =>
          query
            .eq("organizationId", authorization.organizationId)
            .eq("state", "active")
        )
        .unique(),
      ctx.db
        .query("buildCollaborationLegalHolds")
        .withIndex("by_buildId_and_state", (query) =>
          query.eq("buildId", authorization.build._id).eq("state", "active")
        )
        .unique(),
    ]);
    return {
      activeLegalHold: legalHold
        ? {
            holdId: legalHold._id,
            placedAt: legalHold.placedAt,
            reason: legalHold.reason,
            reference: legalHold.reference,
          }
        : undefined,
      policy: policy
        ? {
            policyId: policy._id,
            policyKey: policy.policyKey,
            retentionDays: policy.retentionDays,
            version: policy.version,
          }
        : undefined,
    };
  })
  .public();

export const setBuildCollaborationRetentionPolicy = authenticatedMutation
  .input({
    buildId: v.id("activeBuilds"),
    organizationId: v.string(),
    policyKey: v.string(),
    reason: v.string(),
    retentionDays: v.number(),
  })
  .returns(v.id("buildCollaborationRetentionPolicies"))
  .handler(async (ctx, args) => {
    const authorization = await authorizeLifecycleAuthority(ctx, args);
    const reason = requiredReason(args.reason, "A retention-policy reason");
    const policyKey = requiredText(args.policyKey, "Retention policy key", 120);
    if (
      !Number.isInteger(args.retentionDays) ||
      args.retentionDays < MIN_RETENTION_DAYS ||
      args.retentionDays > MAX_RETENTION_DAYS
    ) {
      throw new Error(
        `Retention must be an integer from ${MIN_RETENTION_DAYS} to ${MAX_RETENTION_DAYS} days.`
      );
    }
    const current = await ctx.db
      .query("buildCollaborationRetentionPolicies")
      .withIndex("by_organizationId_and_state", (query) =>
        query
          .eq("organizationId", authorization.organizationId)
          .eq("state", "active")
      )
      .unique();
    const now = Date.now();
    if (current) {
      await ctx.db.patch(current._id, {
        state: "superseded",
        supersededAt: now,
      });
    }
    const policyId = await ctx.db.insert(
      "buildCollaborationRetentionPolicies",
      {
        brokerageId: authorization.brokerage._id,
        createdAt: now,
        createdByRole: authorization.effectiveRole.role,
        createdByWorkosUserId: authorization.viewer.subject,
        organizationId: authorization.organizationId,
        policyKey,
        reason,
        retentionDays: args.retentionDays,
        state: "active",
        version: (current?.version ?? 0) + 1,
      }
    );
    const setting = await ctx.db
      .query("buildCollaborationTenantSettings")
      .withIndex("by_organizationId", (query) =>
        query.eq("organizationId", authorization.organizationId)
      )
      .unique();
    if (!setting || setting.brokerageId !== authorization.brokerage._id) {
      throw new Error("Build collaboration tenant settings are unavailable.");
    }
    await ctx.db.patch(setting._id, {
      retentionPolicyKey: policyKey,
      updatedAt: now,
    });
    await recordGovernanceAudit(ctx, {
      authorization,
      command: "setBuildCollaborationRetentionPolicy",
      entityId: policyId,
      entityType: "buildCollaborationRetentionPolicy",
      eventType: "build.collaboration.retention_policy.changed",
      newState: JSON.stringify({
        policyKey,
        retentionDays: args.retentionDays,
        version: (current?.version ?? 0) + 1,
      }),
      now,
      priorState: current
        ? JSON.stringify({
            policyKey: current.policyKey,
            retentionDays: current.retentionDays,
            version: current.version,
          })
        : undefined,
      reason,
    });
    return policyId;
  })
  .public();

export const placeBuildCollaborationLegalHold = authenticatedMutation
  .input({
    buildId: v.id("activeBuilds"),
    organizationId: v.string(),
    reason: v.string(),
    reference: v.optional(v.string()),
  })
  .returns(v.id("buildCollaborationLegalHolds"))
  .handler(async (ctx, args) => {
    const authorization = await authorizeLifecycleAuthority(ctx, args);
    const reason = requiredReason(args.reason, "A legal-hold reason");
    const current = await ctx.db
      .query("buildCollaborationLegalHolds")
      .withIndex("by_buildId_and_state", (query) =>
        query.eq("buildId", authorization.build._id).eq("state", "active")
      )
      .unique();
    if (current) {
      throw new Error("This Build already has an active legal hold.");
    }
    const now = Date.now();
    const holdId = await ctx.db.insert("buildCollaborationLegalHolds", {
      brokerageId: authorization.brokerage._id,
      buildId: authorization.build._id,
      organizationId: authorization.organizationId,
      placedAt: now,
      placedByRole: authorization.effectiveRole.role,
      placedByWorkosUserId: authorization.viewer.subject,
      reason,
      reference: normalizeOptionalText(args.reference, 250),
      state: "active",
    });
    await recordGovernanceAudit(ctx, {
      authorization,
      command: "placeBuildCollaborationLegalHold",
      entityId: holdId,
      entityType: "buildCollaborationLegalHold",
      eventType: "build.collaboration.legal_hold.placed",
      newState: JSON.stringify({ state: "active" }),
      now,
      reason,
    });
    return holdId;
  })
  .public();

export const releaseBuildCollaborationLegalHold = authenticatedMutation
  .input({
    buildId: v.id("activeBuilds"),
    holdId: v.id("buildCollaborationLegalHolds"),
    organizationId: v.string(),
    reason: v.string(),
  })
  .returns(v.id("buildCollaborationLegalHolds"))
  .handler(async (ctx, args) => {
    const authorization = await authorizeLifecycleAuthority(ctx, args);
    const reason = requiredReason(args.reason, "A legal-hold release reason");
    const hold = await ctx.db.get(args.holdId);
    if (
      !hold ||
      hold.organizationId !== authorization.organizationId ||
      hold.brokerageId !== authorization.brokerage._id ||
      hold.buildId !== authorization.build._id ||
      hold.state !== "active"
    ) {
      throw new Error("Active legal hold not found.");
    }
    const now = Date.now();
    await ctx.db.patch(hold._id, {
      releaseReason: reason,
      releasedAt: now,
      releasedByRole: authorization.effectiveRole.role,
      releasedByWorkosUserId: authorization.viewer.subject,
      state: "released",
    });
    await recordGovernanceAudit(ctx, {
      authorization,
      command: "releaseBuildCollaborationLegalHold",
      entityId: hold._id,
      entityType: "buildCollaborationLegalHold",
      eventType: "build.collaboration.legal_hold.released",
      newState: JSON.stringify({ state: "released" }),
      now,
      priorState: JSON.stringify({ state: "active" }),
      reason,
    });
    return hold._id;
  })
  .public();

export const purgeExpiredBuildCollaborationContent = authenticatedMutation
  .input({
    buildId: v.id("activeBuilds"),
    expectedLifecycleRevision: v.number(),
    organizationId: v.string(),
    reason: v.string(),
  })
  .returns(
    v.object({
      complete: v.boolean(),
      deletedAssetCount: v.number(),
      deletedPostCount: v.number(),
      hasRemainingPosts: v.boolean(),
    })
  )
  .handler(async (ctx, args) => {
    const authorization = await authorizeLifecycleAuthority(ctx, args);
    const reason = requiredReason(args.reason, "A retention purge reason");
    const operationKey = `${authorization.build._id}:${args.expectedLifecycleRevision}`;
    let purge = await findMatchingRetentionPurge(ctx, {
      authorization,
      operationKey,
      reason,
    });
    const replayResult = resolveRetentionPurgeReplay(purge);
    if (replayResult) {
      return replayResult;
    }
    const { lifecycle, policy } = await requireEligiblePurgeContext(ctx, {
      authorization,
      expectedLifecycleRevision: args.expectedLifecycleRevision,
      purge,
    });

    const startedAt = Date.now();
    if (!purge) {
      const purgeId = await ctx.db.insert("buildCollaborationRetentionPurges", {
        batchCount: 0,
        brokerageId: authorization.brokerage._id,
        buildId: authorization.build._id,
        deletedAssetCount: 0,
        deletedPostCount: 0,
        operationKey,
        organizationId: authorization.organizationId,
        reason,
        requestedByRole: authorization.effectiveRole.role,
        requestedByWorkosUserId: authorization.viewer.subject,
        retainedAuditEventCount: 0,
        retentionPolicyId: policy._id,
        startedAt,
        state: "in_progress",
        updatedAt: startedAt,
      });
      purge = await ctx.db.get(purgeId);
      if (!purge) {
        throw new Error("Retention purge progress could not be initialized.");
      }
      await recordGovernanceAudit(ctx, {
        authorization,
        command: "purgeExpiredBuildCollaborationContent",
        entityId: purgeId,
        entityType: "buildCollaborationRetentionPurge",
        eventType: "build.collaboration.retention_purge.started",
        newState: JSON.stringify({
          operationKey,
          retentionPolicyId: policy._id,
          state: "in_progress",
        }),
        now: startedAt,
        reason,
      });
    }

    const posts = await ctx.db
      .query("buildCollaborationPosts")
      .withIndex("by_buildId_and_source_and_createdAt", (query) =>
        query
          .eq("buildId", authorization.build._id)
          .eq("source", "human")
      )
      .take(5001);
    const batch = posts.slice(0, PURGE_POST_BATCH_SIZE);
    for (const post of batch) {
      await deletePostTree(ctx, post);
    }
    const now = Date.now();
    const deletedPostCount = purge.deletedPostCount + batch.length;
    const batchCount = (purge.batchCount ?? 0) + (batch.length > 0 ? 1 : 0);
    const hasRemainingPosts = posts.length > PURGE_POST_BATCH_SIZE;
    if (hasRemainingPosts) {
      await ctx.db.patch(purge._id, {
        batchCount,
        deletedPostCount,
        updatedAt: now,
      });
      await recordGovernanceAudit(ctx, {
        authorization,
        command: "purgeExpiredBuildCollaborationContent",
        entityId: purge._id,
        entityType: "buildCollaborationRetentionPurge",
        eventType: "build.collaboration.retention_purge.batch_completed",
        newState: JSON.stringify({
          batchCount,
          deletedPostCount,
          hasRemainingPosts,
          state: "in_progress",
        }),
        now,
        reason,
      });
      return {
        complete: false,
        deletedAssetCount: purge.deletedAssetCount,
        deletedPostCount,
        hasRemainingPosts,
      };
    }

    const residue = await deleteBuildResidue(ctx, authorization.build._id);
    if (!residue.complete) {
      const residueBatchCount = batchCount + 1;
      await ctx.db.patch(purge._id, {
        batchCount: residueBatchCount,
        deletedPostCount,
        updatedAt: now,
      });
      await recordGovernanceAudit(ctx, {
        authorization,
        command: "purgeExpiredBuildCollaborationContent",
        entityId: purge._id,
        entityType: "buildCollaborationRetentionPurge",
        eventType: "build.collaboration.retention_purge.batch_completed",
        newState: JSON.stringify({
          batchCount: residueBatchCount,
          deletedPostCount,
          hasRemainingArchiveResidue: true,
          state: "in_progress",
        }),
        now,
        reason,
      });
      return {
        complete: false,
        deletedAssetCount: purge.deletedAssetCount,
        deletedPostCount,
        hasRemainingPosts: false,
      };
    }
    const deletedAssetCount =
      purge.deletedAssetCount + residue.deletedAssetCount;
    const revision = lifecycle.revision + 1;
    await ctx.db.patch(lifecycle._id, {
      purgeReason: reason,
      purgedAt: now,
      purgedByWorkosUserId: authorization.viewer.subject,
      revision,
      state: "purged",
      updatedAt: now,
    });
    const retainedAuditEventCount = (
      await ctx.db
        .query("buildCollaborationBuildLifecycleEvents")
        .withIndex("by_buildId_and_createdAt", (query) =>
          query.eq("buildId", authorization.build._id)
        )
        .take(500)
    ).length;
    await ctx.db.patch(purge._id, {
      batchCount,
      completedAt: now,
      deletedAssetCount,
      deletedPostCount,
      retainedAuditEventCount,
      state: "completed",
      updatedAt: now,
    });
    await ctx.db.insert("buildCollaborationBuildLifecycleEvents", {
      actorRole: authorization.effectiveRole.role,
      actorWorkosUserId: authorization.viewer.subject,
      brokerageId: authorization.brokerage._id,
      buildId: authorization.build._id,
      createdAt: now,
      eventType: "purged",
      newState: JSON.stringify({ revision, state: "purged" }),
      organizationId: authorization.organizationId,
      priorState: JSON.stringify({
        revision: lifecycle.revision,
        state: "closed",
      }),
      reason,
      revision,
    });
    await recordGovernanceAudit(ctx, {
      authorization,
      command: "purgeExpiredBuildCollaborationContent",
      entityId: lifecycle._id,
      entityType: "buildCollaborationBuildState",
      eventType: "build.collaboration.purged",
      newState: JSON.stringify({
        deletedAssetCount,
        deletedPostCount,
        revision,
        state: "purged",
      }),
      now,
      priorState: JSON.stringify({
        revision: lifecycle.revision,
        state: "closed",
      }),
      reason,
    });
    return {
      complete: true,
      deletedAssetCount,
      deletedPostCount,
      hasRemainingPosts: false,
    };
  })
  .public();

function resolveRetentionPurgeReplay(
  purge: Doc<"buildCollaborationRetentionPurges"> | null
) {
  if (purge?.state === "completed") {
    return {
      complete: true,
      deletedAssetCount: purge.deletedAssetCount,
      deletedPostCount: purge.deletedPostCount,
      hasRemainingPosts: false,
    };
  }
  if (purge?.state === "blocked") {
    throw new Error("Retention purge operation is blocked.");
  }
  return null;
}

async function findMatchingRetentionPurge(
  ctx: MutationCtx,
  input: {
    authorization: Awaited<ReturnType<typeof authorizeLifecycleAuthority>>;
    operationKey: string;
    reason: string;
  }
) {
  const purge = await ctx.db
    .query("buildCollaborationRetentionPurges")
    .withIndex("by_operationKey", (query) =>
      query.eq("operationKey", input.operationKey)
    )
    .unique();
  if (
    purge &&
    (purge.organizationId !== input.authorization.organizationId ||
      purge.brokerageId !== input.authorization.brokerage._id ||
      purge.buildId !== input.authorization.build._id ||
      purge.reason !== input.reason)
  ) {
    throw new Error("Retention purge operation does not match this request.");
  }
  return purge;
}

async function requireEligiblePurgeContext(
  ctx: MutationCtx,
  input: {
    authorization: Awaited<ReturnType<typeof authorizeLifecycleAuthority>>;
    expectedLifecycleRevision: number;
    purge: Doc<"buildCollaborationRetentionPurges"> | null;
  }
) {
  const lifecycle = await getStoredBuildCollaborationState(
    ctx,
    input.authorization
  );
  if (
    !lifecycle ||
    lifecycle.state !== "closed" ||
    lifecycle.revision !== input.expectedLifecycleRevision ||
    !lifecycle.closedAt
  ) {
    throw new Error(
      "Retention purge requires the current explicitly closed Build collaboration revision."
    );
  }
  assertNoActiveBuildCollaborationArchiveSnapshot(lifecycle);
  const policy = lifecycle.retentionPolicyId
    ? await ctx.db.get(lifecycle.retentionPolicyId)
    : input.purge
      ? await ctx.db.get(input.purge.retentionPolicyId)
      : null;
  if (
    !policy ||
    policy.organizationId !== input.authorization.organizationId ||
    policy.brokerageId !== input.authorization.brokerage._id ||
    lifecycle.retentionPolicyVersion !== policy.version
  ) {
    throw new Error(
      "Build closure is missing its exact retention policy snapshot."
    );
  }
  if (!lifecycle.retentionEligibleAt) {
    throw new Error(
      "Build closure is missing its snapshotted retention eligibility date."
    );
  }
  if (Date.now() < lifecycle.retentionEligibleAt) {
    throw new Error(
      "Build collaboration is not yet eligible for retention purge."
    );
  }
  const legalHold = await ctx.db
    .query("buildCollaborationLegalHolds")
    .withIndex("by_buildId_and_state", (query) =>
      query.eq("buildId", input.authorization.build._id).eq("state", "active")
    )
    .unique();
  if (legalHold) {
    throw new Error("Legal hold blocks retention purge for this Build.");
  }
  return { lifecycle, policy };
}

async function deletePostTree(
  ctx: MutationCtx,
  post: Doc<"buildCollaborationPosts">
) {
  const preserveSystemPost = Boolean(post.systemPostKind);
  const revisions = await bounded(
    ctx.db
      .query("buildCollaborationPostRevisions")
      .withIndex("by_postId_and_revision", (query) =>
        query.eq("postId", post._id)
      )
      .take(MAX_CHILD_ROWS_PER_POST + 1),
    "post revisions"
  );
  if (!preserveSystemPost) {
    for (const revision of revisions) {
      await deleteRows(
        ctx,
        await bounded(
          ctx.db
            .query("buildCollaborationAudienceSnapshots")
            .withIndex("by_postRevisionId_and_workosUserId", (query) =>
              query.eq("postRevisionId", revision._id)
            )
            .take(MAX_CHILD_ROWS_PER_POST + 1),
          "audience snapshots"
        )
      );
      await deleteOwnerRows(ctx, "postRevision", revision._id);
      await ctx.db.delete(revision._id);
    }
  }

  const comments = await bounded(
    ctx.db
      .query("buildCollaborationComments")
      .withIndex("by_postId_and_createdAt", (query) =>
        query.eq("postId", post._id)
      )
      .take(MAX_CHILD_ROWS_PER_POST + 1),
    "comments"
  );
  for (const comment of comments) {
    const commentRevisions = await bounded(
      ctx.db
        .query("buildCollaborationCommentRevisions")
        .withIndex("by_commentId_and_revision", (query) =>
          query.eq("commentId", comment._id)
        )
        .take(MAX_CHILD_ROWS_PER_POST + 1),
      "comment revisions"
    );
    for (const revision of commentRevisions) {
      await deleteOwnerRows(ctx, "commentRevision", revision._id);
      await ctx.db.delete(revision._id);
    }
    await deleteRows(
      ctx,
      await bounded(
        ctx.db
          .query("buildCollaborationReactions")
          .withIndex("by_commentId_and_workosUserId", (query) =>
            query.eq("commentId", comment._id)
          )
          .take(MAX_CHILD_ROWS_PER_POST + 1),
        "comment reactions"
      )
    );
    await deleteRows(
      ctx,
      await bounded(
        ctx.db
          .query("buildCollaborationPins")
          .withIndex(
            "by_postId_and_commentId_and_workosUserId_and_kind",
            (query) => query.eq("postId", post._id).eq("commentId", comment._id)
          )
          .take(MAX_CHILD_ROWS_PER_POST + 1),
        "comment pins"
      )
    );
    await deleteModerationCase(ctx, "comment", comment._id);
    await ctx.db.delete(comment._id);
  }

  const actionItems = (await bounded(
    ctx.db
      .query("buildActionItems")
      .withIndex("by_originatingPostId_and_queueSortAt", (query) =>
        query.eq("originatingPostId", post._id)
      )
      .take(MAX_CHILD_ROWS_PER_POST + 1),
    "Action Items"
  )).filter(
    (item) =>
      !preserveSystemPost || item.systemMode !== "generated_milestone_submilestone",
  );
  for (const item of actionItems) {
    await deleteActionItem(ctx, item);
  }
  await deleteRows(
    ctx,
    await bounded(
      ctx.db
        .query("buildActionItemCreationRequests")
        .withIndex("by_postId_and_creatorWorkosUserId_and_requestId", (query) =>
          query.eq("postId", post._id)
        )
        .take(MAX_CHILD_ROWS_PER_POST + 1),
      "Action Item creation requests"
    )
  );

  if (!preserveSystemPost) await deleteRows(
    ctx,
    await bounded(
      ctx.db
        .query("buildCollaborationDecisionOutcomeRevisions")
        .withIndex("by_postId_and_revision", (query) =>
          query.eq("postId", post._id)
        )
        .take(MAX_CHILD_ROWS_PER_POST + 1),
      "decision outcome revisions"
    )
  );
  if (!preserveSystemPost) await deleteRows(
    ctx,
    await bounded(
      ctx.db
        .query("buildCollaborationThreadEvents")
        .withIndex("by_postId_and_createdAt", (query) =>
          query.eq("postId", post._id)
        )
        .take(MAX_CHILD_ROWS_PER_POST + 1),
      "thread events"
    )
  );
  if (!preserveSystemPost) await deleteRows(
    ctx,
    await bounded(
      ctx.db
        .query("buildCollaborationAudienceMembers")
        .withIndex("by_postId_and_workosUserId", (query) =>
          query.eq("postId", post._id)
        )
        .take(MAX_CHILD_ROWS_PER_POST + 1),
      "audience members"
    )
  );
  if (!preserveSystemPost) await deleteRows(
    ctx,
    await bounded(
      ctx.db
        .query("buildCollaborationSearchRecords")
        .withIndex("by_postId", (query) => query.eq("postId", post._id))
        .take(MAX_CHILD_ROWS_PER_POST + 1),
      "search records"
    )
  );
  if (preserveSystemPost) {
    const commentSearchRecords = (
      await bounded(
        ctx.db
          .query("buildCollaborationSearchRecords")
          .withIndex("by_postId", (query) => query.eq("postId", post._id))
          .take(MAX_CHILD_ROWS_PER_POST + 1),
        "system post comment search records"
      )
    ).filter((record) => record.ownerKind === "comment");
    await deleteRows(ctx, commentSearchRecords);
  }
  if (!preserveSystemPost) await deleteRows(
    ctx,
    await bounded(
      ctx.db
        .query("buildCollaborationReferences")
        .withIndex("by_postId", (query) => query.eq("postId", post._id))
        .take(MAX_CHILD_ROWS_PER_POST + 1),
      "post references"
    )
  );
  if (!preserveSystemPost) await deleteRows(
    ctx,
    await bounded(
      ctx.db
        .query("buildCollaborationFollows")
        .withIndex("by_postId_and_workosUserId", (query) =>
          query.eq("postId", post._id)
        )
        .take(MAX_CHILD_ROWS_PER_POST + 1),
      "post follows"
    )
  );
  if (!preserveSystemPost) await deleteRows(
    ctx,
    await bounded(
      ctx.db
        .query("buildCollaborationReactions")
        .withIndex("by_postId_and_workosUserId", (query) =>
          query.eq("postId", post._id)
        )
        .take(MAX_CHILD_ROWS_PER_POST + 1),
      "post reactions"
    )
  );
  if (!preserveSystemPost) await deleteRows(
    ctx,
    await bounded(
      ctx.db
        .query("buildCollaborationReceipts")
        .withIndex("by_postId_and_workosUserId", (query) =>
          query.eq("postId", post._id)
        )
        .take(MAX_CHILD_ROWS_PER_POST + 1),
      "post receipts"
    )
  );
  if (!preserveSystemPost) await deleteRows(
    ctx,
    await bounded(
      ctx.db
        .query("buildCollaborationPins")
        .withIndex("by_postId_and_workosUserId_and_kind", (query) =>
          query.eq("postId", post._id)
        )
        .take(MAX_CHILD_ROWS_PER_POST + 1),
      "post pins"
    )
  );
  if (!preserveSystemPost) {
    const targets = await bounded(
      ctx.db
        .query("buildCollaborationAcknowledgementTargets")
        .withIndex("by_postId_and_workosUserId", (query) =>
          query.eq("postId", post._id)
        )
        .take(MAX_CHILD_ROWS_PER_POST + 1),
      "acknowledgement targets"
    );
    for (const target of targets) {
      await deleteRows(
        ctx,
        await bounded(
          ctx.db
            .query("buildCollaborationAcknowledgements")
            .withIndex("by_targetId", (query) => query.eq("targetId", target._id))
            .take(MAX_CHILD_ROWS_PER_POST + 1),
          "acknowledgements"
        )
      );
      await ctx.db.delete(target._id);
    }
  }
  if (!preserveSystemPost) {
    await deleteModerationCase(ctx, "post", post._id);
    await ctx.db.delete(post._id);
  }
}

async function deleteActionItem(
  ctx: MutationCtx,
  item: Doc<"buildActionItems">
) {
  await deleteRows(
    ctx,
    await bounded(
      ctx.db
        .query("buildActionItemEvents")
        .withIndex("by_actionItemId_and_createdAt", (query) =>
          query.eq("actionItemId", item._id)
        )
        .take(MAX_CHILD_ROWS_PER_POST + 1),
      "Action Item events"
    )
  );
  await deleteRows(
    ctx,
    await bounded(
      ctx.db
        .query("buildActionItemRevisions")
        .withIndex("by_actionItemId_and_revision", (query) =>
          query.eq("actionItemId", item._id)
        )
        .take(MAX_CHILD_ROWS_PER_POST + 1),
      "Action Item revisions"
    )
  );
  await deleteRows(
    ctx,
    await bounded(
      ctx.db
        .query("buildActionItemLabels")
        .withIndex("by_actionItemId_and_normalizedLabel", (query) =>
          query.eq("actionItemId", item._id)
        )
        .take(MAX_CHILD_ROWS_PER_POST + 1),
      "Action Item labels"
    )
  );
  const comments = await bounded(
    ctx.db
      .query("buildActionItemComments")
      .withIndex("by_actionItemId_and_createdAt", (query) =>
        query.eq("actionItemId", item._id)
      )
      .take(MAX_CHILD_ROWS_PER_POST + 1),
    "Action Item comments"
  );
  for (const comment of comments) {
    await deleteOwnerRows(ctx, "actionItemComment", comment._id);
    await ctx.db.delete(comment._id);
  }
  await deleteRows(
    ctx,
    await bounded(
      ctx.db
        .query("buildActionItemChecklistItems")
        .withIndex("by_actionItemId_and_order", (query) =>
          query.eq("actionItemId", item._id)
        )
        .take(MAX_CHILD_ROWS_PER_POST + 1),
      "Action Item checklist entries"
    )
  );
  const relations = [
    ...(await bounded(
      ctx.db
        .query("buildActionItemRelations")
        .withIndex("by_sourceActionItemId_and_status", (query) =>
          query.eq("sourceActionItemId", item._id)
        )
        .take(MAX_CHILD_ROWS_PER_POST + 1),
      "outgoing Action Item relations"
    )),
    ...(await bounded(
      ctx.db
        .query("buildActionItemRelations")
        .withIndex("by_targetActionItemId_and_status", (query) =>
          query.eq("targetActionItemId", item._id)
        )
        .take(MAX_CHILD_ROWS_PER_POST + 1),
      "incoming Action Item relations"
    )),
  ];
  for (const relationId of new Set(relations.map((relation) => relation._id))) {
    if (await ctx.db.get(relationId)) {
      await ctx.db.delete(relationId);
    }
  }
  await deleteRows(
    ctx,
    await bounded(
      ctx.db
        .query("buildActionItemPostLinks")
        .withIndex("by_actionItemId_and_postId", (query) =>
          query.eq("actionItemId", item._id)
        )
        .take(MAX_CHILD_ROWS_PER_POST + 1),
      "Action Item post links"
    )
  );
  await deleteOwnerRows(ctx, "actionItem", item._id);
  await ctx.db.delete(item._id);
}

async function deleteOwnerRows(
  ctx: MutationCtx,
  ownerKind:
    | "actionItem"
    | "actionItemComment"
    | "commentRevision"
    | "postRevision",
  ownerRecordId: string
) {
  await deleteRows(
    ctx,
    await bounded(
      ctx.db
        .query("buildCollaborationAttachments")
        .withIndex("by_ownerKind_and_ownerRecordId", (query) =>
          query.eq("ownerKind", ownerKind).eq("ownerRecordId", ownerRecordId)
        )
        .take(MAX_CHILD_ROWS_PER_POST + 1),
      `${ownerKind} attachments`
    )
  );
  await deleteRows(
    ctx,
    await bounded(
      ctx.db
        .query("buildCollaborationReferences")
        .withIndex("by_ownerKind_and_ownerRecordId", (query) =>
          query.eq("ownerKind", ownerKind).eq("ownerRecordId", ownerRecordId)
        )
        .take(MAX_CHILD_ROWS_PER_POST + 1),
      `${ownerKind} references`
    )
  );
}

async function deleteModerationCase(
  ctx: MutationCtx,
  entityKind: "comment" | "post",
  entityId: string
) {
  const cases = await boundedAt(
    ctx.db
      .query("buildCollaborationModerationCases")
      .withIndex("by_entityKind_and_entityId", (query) =>
        query.eq("entityKind", entityKind).eq("entityId", entityId)
      )
      .take(21),
    20,
    `${entityKind} moderation cases`
  );
  for (const moderationCase of cases) {
    await deleteRows(
      ctx,
      await boundedAt(
        ctx.db
          .query("buildCollaborationModerationEvents")
          .withIndex("by_caseId_and_createdAt", (query) =>
            query.eq("caseId", moderationCase._id)
          )
          .take(101),
        100,
        "moderation events"
      )
    );
    await ctx.db.delete(moderationCase._id);
  }
}

async function deleteBuildResidue(
  ctx: MutationCtx,
  buildId: Id<"activeBuilds">
) {
  if (!(await deleteArchiveResidueBatch(ctx, buildId))) {
    return { complete: false, deletedAssetCount: 0 };
  }

  const assets = await boundedAt(
    ctx.db
      .query("buildCollaborationAssets")
      .withIndex("by_buildId", (query) => query.eq("buildId", buildId))
      .take(5001),
    5000,
    "Build assets"
  );
  for (const asset of assets) {
    if (!asset.storageDeletedAt) {
      await ctx.storage.delete(asset.storageId);
    }
    await ctx.db.delete(asset._id);
  }
  const deliveryBatches = await boundedAt(
    ctx.db
      .query("buildCollaborationDeliveryBatches")
      .withIndex("by_buildId", (query) => query.eq("buildId", buildId))
      .take(5001),
    5000,
    "delivery batches"
  );
  for (const batch of deliveryBatches) {
    await deleteRows(
      ctx,
      await boundedAt(
        ctx.db
          .query("buildCollaborationDeliveryAttempts")
          .withIndex("by_batchId_and_state", (query) =>
            query.eq("batchId", batch._id)
          )
          .take(5001),
        5000,
        "delivery attempts"
      )
    );
    await ctx.db.delete(batch._id);
  }
  const stagingSessions = await boundedAt(
    ctx.db
      .query("buildCollaborationAssetStagingSessions")
      .withIndex("by_buildId", (query) => query.eq("buildId", buildId))
      .take(5001),
    5000,
    "asset staging sessions"
  );
  for (const session of stagingSessions) {
    if (session.pendingStorageId && !session.assetId) {
      const pendingStorageId = session.pendingStorageId;
      const [boundAsset, boundSessions] = await Promise.all([
        ctx.db
          .query("buildCollaborationAssets")
          .withIndex("by_storageId", (query) =>
            query.eq("storageId", pendingStorageId)
          )
          .unique(),
        ctx.db
          .query("buildCollaborationAssetStagingSessions")
          .withIndex("by_pendingStorageId", (query) =>
            query.eq("pendingStorageId", pendingStorageId)
          )
          .take(2),
      ]);
      if (
        !boundAsset &&
        boundSessions.length === 1 &&
        boundSessions[0]?._id === session._id
      ) {
        await ctx.storage.delete(pendingStorageId);
      }
    }
    await ctx.db.delete(session._id);
  }
  return await deleteRemainingBuildResidue(ctx, buildId, assets.length);
}

async function deleteArchiveResidueBatch(
  ctx: MutationCtx,
  buildId: Id<"activeBuilds">
) {
  const [archiveChunks, archivePlanRecords, archivePlanPosts] =
    await Promise.all([
      ctx.db
        .query("buildCollaborationExportArchiveChunks")
        .withIndex("by_buildId", (query) => query.eq("buildId", buildId))
        .take(101),
      ctx.db
        .query("buildCollaborationExportArchivePlanRecords")
        .withIndex("by_buildId", (query) => query.eq("buildId", buildId))
        .take(101),
      ctx.db
        .query("buildCollaborationExportArchivePlanPosts")
        .withIndex("by_buildId", (query) => query.eq("buildId", buildId))
        .take(101),
    ]);
  for (const chunk of archiveChunks.slice(0, 100)) {
    if (chunk.storageId) {
      await ctx.storage.delete(chunk.storageId);
    }
    await ctx.db.delete(chunk._id);
  }
  for (const row of [
    ...archivePlanRecords.slice(0, 100),
    ...archivePlanPosts.slice(0, 100),
  ]) {
    await ctx.db.delete(row._id);
  }
  if (
    archiveChunks.length > 100 ||
    archivePlanRecords.length > 100 ||
    archivePlanPosts.length > 100
  ) {
    return false;
  }
  return true;
}

async function deleteRemainingBuildResidue(
  ctx: MutationCtx,
  buildId: Id<"activeBuilds">,
  deletedAssetCount: number
) {
  for (const tableRows of [
    await boundedAt(
      ctx.db
        .query("buildCollaborationPublicationApprovals")
        .withIndex("by_buildId", (query) => query.eq("buildId", buildId))
        .take(5001),
      5000,
      "publication approvals"
    ),
    await boundedAt(
      ctx.db
        .query("buildCollaborationDrafts")
        .withIndex("by_buildId", (query) => query.eq("buildId", buildId))
        .take(5001),
      5000,
      "drafts"
    ),
    await boundedAt(
      ctx.db
        .query("buildCollaborationSearchJobs")
        .withIndex("by_buildId_and_status", (query) =>
          query.eq("buildId", buildId)
        )
        .take(5001),
      5000,
      "search jobs"
    ),
    await boundedAt(
      ctx.db
        .query("buildCollaborationExternalDeliveries")
        .withIndex("by_buildId", (query) => query.eq("buildId", buildId))
        .take(5001),
      5000,
      "external deliveries"
    ),
    await boundedAt(
      ctx.db
        .query("recipientDeliveries")
        .withIndex("by_collaborationBuildId", (query) =>
          query.eq("collaborationBuildId", buildId)
        )
        .take(5001),
      5000,
      "recipient deliveries"
    ),
    await boundedAt(
      ctx.db
        .query("buildActionItemCreationRequests")
        .withIndex("by_buildId", (query) => query.eq("buildId", buildId))
        .take(5001),
      5000,
      "Action Item creation requests"
    ),
    await boundedAt(
      ctx.db
        .query("buildCollaborationActivityProjections")
        .withIndex("by_buildId_and_projectionKey", (query) =>
          query.eq("buildId", buildId)
        )
        .take(5001),
      5000,
      "activity projections"
    ),
    await boundedAt(
      ctx.db
        .query("buildCollaborationNotificationPreferences")
        .withIndex("by_buildId_and_workosUserId", (query) =>
          query.eq("buildId", buildId)
        )
        .take(5001),
      5000,
      "notification preferences"
    ),
    await boundedAt(
      ctx.db
        .query("buildCollaborationPushEndpointBuildBindings")
        .withIndex("by_buildId_and_endpoint", (query) =>
          query.eq("buildId", buildId)
        )
        .take(5001),
      5000,
      "push endpoint Build bindings"
    ),
    await boundedAt(
      ctx.db
        .query("buildCollaborationPushSubscriptions")
        .withIndex("by_buildId", (query) => query.eq("buildId", buildId))
        .take(5001),
      5000,
      "Build-scoped push subscriptions"
    ),
  ]) {
    await deleteRows(ctx, tableRows);
  }
  const searchState = await ctx.db
    .query("buildCollaborationSearchStates")
    .withIndex("by_buildId", (query) => query.eq("buildId", buildId))
    .unique();
  if (searchState) {
    await ctx.db.delete(searchState._id);
  }
  const exports = await boundedAt(
    ctx.db
      .query("buildCollaborationExports")
      .withIndex("by_buildId_and_createdAt", (query) =>
        query.eq("buildId", buildId)
      )
      .take(5001),
    5000,
    "exports"
  );
  for (const row of exports) {
    await ctx.db.patch(row._id, {
      aclSnapshotJson: JSON.stringify({ purged: true }),
      manifestJson: JSON.stringify({ purged: true }),
      state: "revoked",
      tokenHash: `revoked:${row._id}`,
    });
  }
  await assertBuildCollaborationResidueRemoved(ctx, buildId);
  return { complete: true, deletedAssetCount };
}

async function assertBuildCollaborationResidueRemoved(
  ctx: MutationCtx,
  buildId: Id<"activeBuilds">
) {
  const checks = [
    [
      "posts",
      await ctx.db
        .query("buildCollaborationPosts")
        .withIndex("by_buildId_and_systemPostKind", (query) =>
          query.eq("buildId", buildId).eq("systemPostKind", undefined)
        )
        .first(),
    ],
    [
      "Action Items",
      await ctx.db
      .query("buildActionItems")
      .withIndex("by_buildId_and_systemMode", (query) =>
        query.eq("buildId", buildId).eq("systemMode", undefined)
      )
        .first(),
    ],
    [
      "assets",
      await ctx.db
        .query("buildCollaborationAssets")
        .withIndex("by_buildId", (query) => query.eq("buildId", buildId))
        .first(),
    ],
    [
      "export archive chunks",
      await ctx.db
        .query("buildCollaborationExportArchiveChunks")
        .withIndex("by_buildId", (query) => query.eq("buildId", buildId))
        .first(),
    ],
    [
      "export archive plan records",
      await ctx.db
        .query("buildCollaborationExportArchivePlanRecords")
        .withIndex("by_buildId", (query) => query.eq("buildId", buildId))
        .first(),
    ],
    [
      "export archive post snapshots",
      await ctx.db
        .query("buildCollaborationExportArchivePlanPosts")
        .withIndex("by_buildId", (query) => query.eq("buildId", buildId))
        .first(),
    ],
    [
      "drafts",
      await ctx.db
        .query("buildCollaborationDrafts")
        .withIndex("by_buildId", (query) => query.eq("buildId", buildId))
        .first(),
    ],
    [
      "publication approvals",
      await ctx.db
        .query("buildCollaborationPublicationApprovals")
        .withIndex("by_buildId", (query) => query.eq("buildId", buildId))
        .first(),
    ],
    [
      "Action Item creation requests",
      await ctx.db
        .query("buildActionItemCreationRequests")
        .withIndex("by_buildId", (query) => query.eq("buildId", buildId))
        .first(),
    ],
    [
      "activity projections",
      await ctx.db
        .query("buildCollaborationActivityProjections")
        .withIndex("by_buildId_and_projectionKey", (query) =>
          query.eq("buildId", buildId)
        )
        .first(),
    ],
    [
      "notification preferences",
      await ctx.db
        .query("buildCollaborationNotificationPreferences")
        .withIndex("by_buildId_and_workosUserId", (query) =>
          query.eq("buildId", buildId)
        )
        .first(),
    ],
    [
      "push bindings",
      await ctx.db
        .query("buildCollaborationPushEndpointBuildBindings")
        .withIndex("by_buildId_and_endpoint", (query) =>
          query.eq("buildId", buildId)
        )
        .first(),
    ],
    [
      "push subscriptions",
      await ctx.db
        .query("buildCollaborationPushSubscriptions")
        .withIndex("by_buildId", (query) => query.eq("buildId", buildId))
        .first(),
    ],
  ] as const;
  const residue = checks.find(([, row]) => row !== null);
  if (residue) {
    throw new Error(
      `Retention purge cannot finalize while ${residue[0]} remain.`
    );
  }
}

async function deleteRows(
  ctx: MutationCtx,
  rows: Array<{ _id: Parameters<typeof ctx.db.delete>[0] }>
) {
  for (const row of rows) {
    await ctx.db.delete(row._id);
  }
}

async function bounded<T>(promise: Promise<T[]>, label: string) {
  return await boundedAt(promise, MAX_CHILD_ROWS_PER_POST, label);
}

async function boundedAt<T>(
  promise: Promise<T[]>,
  limit: number,
  label: string
) {
  const rows = await promise;
  if (rows.length > limit) {
    throw new Error(`Retention purge found more than ${limit} ${label}.`);
  }
  return rows;
}

async function recordGovernanceAudit(
  ctx: MutationCtx,
  input: {
    authorization: Awaited<ReturnType<typeof authorizeLifecycleAuthority>>;
    command: string;
    entityId: string;
    entityType: string;
    eventType: string;
    newState: string;
    now: number;
    priorState?: string;
    reason: string;
  }
) {
  await ctx.db.insert("auditEvents", {
    actorRoles: input.authorization.roles,
    actorWorkosUserId: input.authorization.viewer.subject,
    brokerageId: input.authorization.brokerage._id,
    command: input.command,
    createdAt: input.now,
    entityId: input.entityId,
    entityType: input.entityType,
    eventType: input.eventType,
    newState: input.newState,
    organizationId: input.authorization.organizationId,
    priorState: input.priorState,
    reason: input.reason,
    warnings: [],
  });
  await ctx.db.insert("eventOutbox", {
    brokerageId: input.authorization.brokerage._id,
    createdAt: input.now,
    eventType: input.eventType,
    organizationId: input.authorization.organizationId,
    payloadPreview: input.newState,
    relatedEntityId: input.entityId,
    relatedEntityType: input.entityType,
    status: "pending",
  });
}

function requiredReason(value: string, label: string) {
  return requiredText(value, label, 2000, 5);
}

function requiredText(
  value: string,
  label: string,
  maximum: number,
  minimum = 1
) {
  const normalized = value.trim();
  if (normalized.length < minimum || normalized.length > maximum) {
    throw new Error(
      `${label} must be between ${minimum} and ${maximum} characters.`
    );
  }
  return normalized;
}

function normalizeOptionalText(value: string | undefined, maximum: number) {
  const normalized = value?.trim();
  if (!normalized) {
    return;
  }
  if (normalized.length > maximum) {
    throw new Error(
      `Legal-hold reference may contain at most ${maximum} characters.`
    );
  }
  return normalized;
}
