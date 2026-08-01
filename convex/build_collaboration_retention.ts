import { v } from "convex/values";

import { authenticatedMutation, authenticatedQuery } from "./authz";
import { authorizeLifecycleAuthority } from "./build_collaboration_lifecycle";
import { getStoredBuildCollaborationState } from "./build_collaboration_lifecycle_state";
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
      remainingPostCount: v.number(),
    })
  )
  .handler(async (ctx, args) => {
    const authorization = await authorizeLifecycleAuthority(ctx, args);
    const reason = requiredReason(args.reason, "A retention purge reason");
    const lifecycle = await getStoredBuildCollaborationState(
      ctx,
      authorization
    );
    if (
      !lifecycle ||
      lifecycle.state !== "closed" ||
      lifecycle.revision !== args.expectedLifecycleRevision ||
      !lifecycle.closedAt
    ) {
      throw new Error(
        "Retention purge requires the current explicitly closed Build collaboration revision."
      );
    }
    const policy = await ctx.db
      .query("buildCollaborationRetentionPolicies")
      .withIndex("by_organizationId_and_state", (query) =>
        query
          .eq("organizationId", authorization.organizationId)
          .eq("state", "active")
      )
      .unique();
    if (!policy || policy.brokerageId !== authorization.brokerage._id) {
      throw new Error("An active tenant retention policy is required.");
    }
    const eligibleAt = lifecycle.closedAt + policy.retentionDays * 86_400_000;
    if (Date.now() < eligibleAt) {
      throw new Error(
        "Build collaboration is not yet eligible for retention purge."
      );
    }
    const legalHold = await ctx.db
      .query("buildCollaborationLegalHolds")
      .withIndex("by_buildId_and_state", (query) =>
        query.eq("buildId", authorization.build._id).eq("state", "active")
      )
      .unique();
    if (legalHold) {
      throw new Error("Legal hold blocks retention purge for this Build.");
    }

    const posts = await ctx.db
      .query("buildCollaborationPosts")
      .withIndex("by_buildId_and_createdAt", (query) =>
        query.eq("buildId", authorization.build._id)
      )
      .take(PURGE_POST_BATCH_SIZE + 1);
    const batch = posts.slice(0, PURGE_POST_BATCH_SIZE);
    for (const post of batch) {
      await deletePostTree(ctx, post);
    }
    const remainingPostCount = Math.max(0, posts.length - batch.length);
    if (posts.length > PURGE_POST_BATCH_SIZE) {
      return {
        complete: false,
        deletedAssetCount: 0,
        deletedPostCount: batch.length,
        remainingPostCount,
      };
    }

    const deletedAssetCount = await deleteBuildResidue(
      ctx,
      authorization.build._id
    );
    const now = Date.now();
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
    await ctx.db.insert("buildCollaborationRetentionPurges", {
      brokerageId: authorization.brokerage._id,
      buildId: authorization.build._id,
      completedAt: now,
      deletedAssetCount,
      deletedPostCount: batch.length,
      organizationId: authorization.organizationId,
      reason,
      requestedByRole: authorization.effectiveRole.role,
      requestedByWorkosUserId: authorization.viewer.subject,
      retainedAuditEventCount,
      retentionPolicyId: policy._id,
      state: "completed",
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
        deletedPostCount: batch.length,
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
      deletedPostCount: batch.length,
      remainingPostCount: 0,
    };
  })
  .public();

async function deletePostTree(
  ctx: MutationCtx,
  post: Doc<"buildCollaborationPosts">
) {
  const revisions = await bounded(
    ctx.db
      .query("buildCollaborationPostRevisions")
      .withIndex("by_postId_and_revision", (query) =>
        query.eq("postId", post._id)
      )
      .take(MAX_CHILD_ROWS_PER_POST + 1),
    "post revisions"
  );
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
      await ctx.db
        .query("buildCollaborationReactions")
        .withIndex("by_commentId_and_workosUserId", (query) =>
          query.eq("commentId", comment._id)
        )
        .take(MAX_CHILD_ROWS_PER_POST)
    );
    await deleteRows(
      ctx,
      await ctx.db
        .query("buildCollaborationPins")
        .withIndex(
          "by_postId_and_commentId_and_workosUserId_and_kind",
          (query) => query.eq("postId", post._id).eq("commentId", comment._id)
        )
        .take(MAX_CHILD_ROWS_PER_POST)
    );
    await deleteModerationCase(ctx, "comment", comment._id);
    await ctx.db.delete(comment._id);
  }

  const actionItems = await bounded(
    ctx.db
      .query("buildActionItems")
      .withIndex("by_originatingPostId_and_queueSortAt", (query) =>
        query.eq("originatingPostId", post._id)
      )
      .take(MAX_CHILD_ROWS_PER_POST + 1),
    "Action Items"
  );
  for (const item of actionItems) {
    await deleteActionItem(ctx, item);
  }

  await deleteRows(
    ctx,
    await ctx.db
      .query("buildCollaborationDecisionOutcomeRevisions")
      .withIndex("by_postId_and_revision", (query) =>
        query.eq("postId", post._id)
      )
      .take(MAX_CHILD_ROWS_PER_POST)
  );
  await deleteRows(
    ctx,
    await ctx.db
      .query("buildCollaborationThreadEvents")
      .withIndex("by_postId_and_createdAt", (query) =>
        query.eq("postId", post._id)
      )
      .take(MAX_CHILD_ROWS_PER_POST)
  );
  await deleteRows(
    ctx,
    await ctx.db
      .query("buildCollaborationAudienceMembers")
      .withIndex("by_postId_and_workosUserId", (query) =>
        query.eq("postId", post._id)
      )
      .take(MAX_CHILD_ROWS_PER_POST)
  );
  await deleteRows(
    ctx,
    await ctx.db
      .query("buildCollaborationSearchRecords")
      .withIndex("by_postId", (query) => query.eq("postId", post._id))
      .take(MAX_CHILD_ROWS_PER_POST)
  );
  await deleteRows(
    ctx,
    await ctx.db
      .query("buildCollaborationReferences")
      .withIndex("by_postId", (query) => query.eq("postId", post._id))
      .take(MAX_CHILD_ROWS_PER_POST)
  );
  await deleteRows(
    ctx,
    await ctx.db
      .query("buildCollaborationFollows")
      .withIndex("by_postId_and_workosUserId", (query) =>
        query.eq("postId", post._id)
      )
      .take(MAX_CHILD_ROWS_PER_POST)
  );
  await deleteRows(
    ctx,
    await ctx.db
      .query("buildCollaborationReactions")
      .withIndex("by_postId_and_workosUserId", (query) =>
        query.eq("postId", post._id)
      )
      .take(MAX_CHILD_ROWS_PER_POST)
  );
  await deleteRows(
    ctx,
    await ctx.db
      .query("buildCollaborationReceipts")
      .withIndex("by_postId_and_workosUserId", (query) =>
        query.eq("postId", post._id)
      )
      .take(MAX_CHILD_ROWS_PER_POST)
  );
  await deleteRows(
    ctx,
    await ctx.db
      .query("buildCollaborationPins")
      .withIndex("by_postId_and_workosUserId_and_kind", (query) =>
        query.eq("postId", post._id)
      )
      .take(MAX_CHILD_ROWS_PER_POST)
  );
  const targets = await ctx.db
    .query("buildCollaborationAcknowledgementTargets")
    .withIndex("by_postId_and_workosUserId", (query) =>
      query.eq("postId", post._id)
    )
    .take(MAX_CHILD_ROWS_PER_POST);
  for (const target of targets) {
    await deleteRows(
      ctx,
      await ctx.db
        .query("buildCollaborationAcknowledgements")
        .withIndex("by_targetId", (query) => query.eq("targetId", target._id))
        .take(MAX_CHILD_ROWS_PER_POST)
    );
    await ctx.db.delete(target._id);
  }
  await deleteModerationCase(ctx, "post", post._id);
  await ctx.db.delete(post._id);
}

async function deleteActionItem(
  ctx: MutationCtx,
  item: Doc<"buildActionItems">
) {
  await deleteRows(
    ctx,
    await ctx.db
      .query("buildActionItemEvents")
      .withIndex("by_actionItemId_and_createdAt", (query) =>
        query.eq("actionItemId", item._id)
      )
      .take(MAX_CHILD_ROWS_PER_POST)
  );
  await deleteRows(
    ctx,
    await ctx.db
      .query("buildActionItemRevisions")
      .withIndex("by_actionItemId_and_revision", (query) =>
        query.eq("actionItemId", item._id)
      )
      .take(MAX_CHILD_ROWS_PER_POST)
  );
  await deleteRows(
    ctx,
    await ctx.db
      .query("buildActionItemLabels")
      .withIndex("by_actionItemId_and_normalizedLabel", (query) =>
        query.eq("actionItemId", item._id)
      )
      .take(MAX_CHILD_ROWS_PER_POST)
  );
  const comments = await ctx.db
    .query("buildActionItemComments")
    .withIndex("by_actionItemId_and_createdAt", (query) =>
      query.eq("actionItemId", item._id)
    )
    .take(MAX_CHILD_ROWS_PER_POST);
  for (const comment of comments) {
    await deleteOwnerRows(ctx, "actionItemComment", comment._id);
    await ctx.db.delete(comment._id);
  }
  await deleteRows(
    ctx,
    await ctx.db
      .query("buildActionItemChecklistItems")
      .withIndex("by_actionItemId_and_order", (query) =>
        query.eq("actionItemId", item._id)
      )
      .take(MAX_CHILD_ROWS_PER_POST)
  );
  const relations = [
    ...(await ctx.db
      .query("buildActionItemRelations")
      .withIndex("by_sourceActionItemId_and_status", (query) =>
        query.eq("sourceActionItemId", item._id)
      )
      .take(MAX_CHILD_ROWS_PER_POST)),
    ...(await ctx.db
      .query("buildActionItemRelations")
      .withIndex("by_targetActionItemId_and_status", (query) =>
        query.eq("targetActionItemId", item._id)
      )
      .take(MAX_CHILD_ROWS_PER_POST)),
  ];
  for (const relationId of new Set(relations.map((relation) => relation._id))) {
    if (await ctx.db.get(relationId)) {
      await ctx.db.delete(relationId);
    }
  }
  await deleteRows(
    ctx,
    await ctx.db
      .query("buildActionItemPostLinks")
      .withIndex("by_actionItemId_and_postId", (query) =>
        query.eq("actionItemId", item._id)
      )
      .take(MAX_CHILD_ROWS_PER_POST)
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
    await ctx.db
      .query("buildCollaborationAttachments")
      .withIndex("by_ownerKind_and_ownerRecordId", (query) =>
        query.eq("ownerKind", ownerKind).eq("ownerRecordId", ownerRecordId)
      )
      .take(MAX_CHILD_ROWS_PER_POST)
  );
  await deleteRows(
    ctx,
    await ctx.db
      .query("buildCollaborationReferences")
      .withIndex("by_ownerKind_and_ownerRecordId", (query) =>
        query.eq("ownerKind", ownerKind).eq("ownerRecordId", ownerRecordId)
      )
      .take(MAX_CHILD_ROWS_PER_POST)
  );
}

async function deleteModerationCase(
  ctx: MutationCtx,
  entityKind: "comment" | "post",
  entityId: string
) {
  const cases = await ctx.db
    .query("buildCollaborationModerationCases")
    .withIndex("by_entityKind_and_entityId", (query) =>
      query.eq("entityKind", entityKind).eq("entityId", entityId)
    )
    .take(20);
  for (const moderationCase of cases) {
    await deleteRows(
      ctx,
      await ctx.db
        .query("buildCollaborationModerationEvents")
        .withIndex("by_caseId_and_createdAt", (query) =>
          query.eq("caseId", moderationCase._id)
        )
        .take(100)
    );
    await ctx.db.delete(moderationCase._id);
  }
}

async function deleteBuildResidue(
  ctx: MutationCtx,
  buildId: Id<"activeBuilds">
) {
  const assets = await ctx.db
    .query("buildCollaborationAssets")
    .withIndex("by_buildId", (query) => query.eq("buildId", buildId))
    .take(5001);
  if (assets.length > 5000) {
    throw new Error("Build asset purge exceeds the 5,000-asset safety limit.");
  }
  for (const asset of assets) {
    if (!asset.storageDeletedAt) {
      await ctx.storage.delete(asset.storageId);
    }
    await ctx.db.delete(asset._id);
  }
  const deliveryBatches = await ctx.db
    .query("buildCollaborationDeliveryBatches")
    .withIndex("by_buildId", (query) => query.eq("buildId", buildId))
    .take(5000);
  for (const batch of deliveryBatches) {
    await deleteRows(
      ctx,
      await ctx.db
        .query("buildCollaborationDeliveryAttempts")
        .withIndex("by_batchId_and_state", (query) =>
          query.eq("batchId", batch._id)
        )
        .take(5000)
    );
    await ctx.db.delete(batch._id);
  }
  for (const tableRows of [
    await ctx.db
      .query("buildCollaborationAssetStagingSessions")
      .withIndex("by_buildId", (query) => query.eq("buildId", buildId))
      .take(5000),
    await ctx.db
      .query("buildCollaborationPublicationApprovals")
      .withIndex("by_buildId", (query) => query.eq("buildId", buildId))
      .take(5000),
    await ctx.db
      .query("buildCollaborationDrafts")
      .withIndex("by_buildId", (query) => query.eq("buildId", buildId))
      .take(5000),
    await ctx.db
      .query("buildCollaborationSearchJobs")
      .withIndex("by_buildId_and_status", (query) =>
        query.eq("buildId", buildId)
      )
      .take(5000),
    await ctx.db
      .query("buildCollaborationExternalDeliveries")
      .withIndex("by_buildId", (query) => query.eq("buildId", buildId))
      .take(5000),
    await ctx.db
      .query("recipientDeliveries")
      .withIndex("by_collaborationBuildId", (query) =>
        query.eq("collaborationBuildId", buildId)
      )
      .take(5000),
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
  const exports = await ctx.db
    .query("buildCollaborationExports")
    .withIndex("by_buildId_and_createdAt", (query) =>
      query.eq("buildId", buildId)
    )
    .take(5000);
  for (const row of exports) {
    await ctx.db.patch(row._id, {
      aclSnapshotJson: JSON.stringify({ purged: true }),
      manifestJson: JSON.stringify({ purged: true }),
      state: "revoked",
      tokenHash: `revoked:${row._id}`,
    });
  }
  return assets.length;
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
  const rows = await promise;
  if (rows.length > MAX_CHILD_ROWS_PER_POST) {
    throw new Error(
      `Retention purge found more than ${MAX_CHILD_ROWS_PER_POST} ${label} on one post.`
    );
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
