import { v } from "convex/values";

import { authenticatedMutation, authenticatedQuery } from "./authz";
import { authorizeLifecycleAuthority } from "./build_collaboration_lifecycle";
import {
  assertNoActiveBuildCollaborationArchiveSnapshot,
  getStoredBuildCollaborationState,
} from "./build_collaboration_lifecycle_state";
import { authorizeActiveBuildCollaborationAccess } from "./build_collaboration_rollout";
import type { Doc, Id, MutationCtx } from "./types";

import {
  resolveRetentionPurgeReplay,
  findMatchingRetentionPurge,
  requireEligiblePurgeContext,
  deletePostTree,
  deleteActionItem,
  deleteOwnerRows,
  deleteModerationCase,
  deleteBuildResidue,
  deleteArchiveResidueBatch,
  deleteRemainingBuildResidue,
  assertBuildCollaborationResidueRemoved,
  deleteRows,
  bounded,
  boundedAt,
} from "./build_collaboration_retention/helpers";
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
        query.eq("buildId", authorization.build._id).eq("source", "human")
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
