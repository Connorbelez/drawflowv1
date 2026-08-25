import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";

import { internal } from "./_generated/api";
import { authorizeActiveBuildAccess } from "./activeBuildAccess";
import { authenticatedMutation, authenticatedQuery } from "./authz";
import {
  ensureMilestoneSystemPost,
  synchronizeMilestoneSystemPostPlanning,
} from "./build_collaboration_system_posts";
import {
  buildPlanningActivationSnapshotPageValidator,
  buildPlanningReconciliationDiffPageValidator,
  buildPlanningReconciliationMetadataValidator,
  buildPlanningReconciliationSnapshotPageValidator,
} from "./build_collaboration_validators";
import type { Id } from "./types";
import {
  type PlanningDiff,
  type PlanningSnapshot,
  PLANNING_REVISION_DIFF_LIMIT,
  PLANNING_SNAPSHOT_LIMITS,
  assertWithinPlanningSnapshotLimit,
  boundedPlanningPagination,
  collectPlanningSnapshot,
  encodePlanningPageCursor,
  latestPlanningRevision,
  planningPageOffset,
  readRevisionDiffs,
  readRevisionSnapshot,
} from "./build_collaboration_planning_reconciliation/core";
import {
  pagedPlanningSnapshot,
  planningActivationSummary,
  planningRevisionPage,
  planningRevisionSummary,
  redactContractorPlanningDiff,
  redactSnapshotForViewer,
} from "./build_collaboration_planning_reconciliation/viewer";
import {
  ensureActiveBuildPlanningActivationRevision,
  recordApprovedActiveBuildPlanningRevision,
} from "./build_collaboration_planning_reconciliation/revision";

export const getActiveBuildPlanningReconciliation = authenticatedQuery
  .input({
    buildId: v.id("activeBuilds"),
    organizationId: v.string(),
  })
  .returns(buildPlanningReconciliationMetadataValidator)
  .handler(async (ctx, args) => {
    const authorization = await authorizeActiveBuildAccess(ctx, args);
    const [revisionPage, pendingChunks] = await Promise.all([
      planningRevisionPage(ctx, authorization.build._id),
      ctx.db
        .query("activeBuildPlanningRevisionChunks")
        .withIndex("by_build", (query) =>
          query.eq("buildId", authorization.build._id),
        )
        .take(1),
    ]);
    const contractorProjection = authorization.effectiveRole.role === "contractor";
    const activationRevision = revisionPage.rows.find(
      (revision) => revision.kind === "activation",
    );
    const diffsTruncated =
      revisionPage.rows.reduce((total, revision) => total + revision.diffCount, 0) >
      PLANNING_REVISION_DIFF_LIMIT;
    return {
      activation: planningActivationSummary(
        activationRevision,
        contractorProjection,
      ),
      current: { revision: revisionPage.rows[0]?.revision ?? 0 },
      diffsTruncated,
      materializationPending: pendingChunks.length > 0,
      revisionsTruncated: revisionPage.isTruncated,
      revisions: planningRevisionSummary(
        revisionPage.rows,
        contractorProjection,
      ),
    };
  })
  .public();

export const getActiveBuildPlanningReconciliationSnapshot = authenticatedQuery
  .input({
    buildId: v.id("activeBuilds"),
    organizationId: v.string(),
    paginationOpts: paginationOptsValidator,
  })
  .returns(buildPlanningReconciliationSnapshotPageValidator)
  .handler(async (ctx, args) => {
    const authorization = await authorizeActiveBuildAccess(ctx, args);
    const [currentSnapshot, pendingChunks, revision] = await Promise.all([
      collectPlanningSnapshot(ctx, authorization.build),
      ctx.db
        .query("activeBuildPlanningRevisionChunks")
        .withIndex("by_build", (query) =>
          query.eq("buildId", authorization.build._id),
        )
        .take(1),
      latestPlanningRevision(ctx, authorization.build._id),
    ]);
    const projection = await redactSnapshotForViewer(
      ctx,
      authorization,
      currentSnapshot,
    );
    const page = pagedPlanningSnapshot(
      projection.snapshot,
      args.paginationOpts.cursor,
      boundedPlanningPagination(args.paginationOpts).numItems,
    );
    return {
      buildId: currentSnapshot.buildId,
      isDone: page.isDone,
      materializationPending: pendingChunks.length > 0,
      page: page.page,
      revision: revision?.revision ?? 0,
      continueCursor: page.continueCursor,
    };
  })
  .public();

export const getActiveBuildPlanningActivationSnapshot = authenticatedQuery
  .input({
    buildId: v.id("activeBuilds"),
    organizationId: v.string(),
    paginationOpts: paginationOptsValidator,
  })
  .returns(buildPlanningActivationSnapshotPageValidator)
  .handler(async (ctx, args) => {
    const authorization = await authorizeActiveBuildAccess(ctx, args);
    const activationRevision = await ctx.db
      .query("activeBuildPlanningRevisions")
      .withIndex("by_build_kind", (query) =>
        query.eq("buildId", authorization.build._id).eq("kind", "activation"),
      )
      .order("desc")
      .take(1)
      .then((rows) => rows[0]);
    if (!activationRevision) {
      return {
        activation: null,
        buildId: String(authorization.build._id),
        isDone: true,
        materializationPending: false,
        page: [],
        continueCursor: encodePlanningPageCursor(0),
      };
    }
    const [snapshot, pendingChunks] = await Promise.all([
      readRevisionSnapshot(
        ctx,
        activationRevision._id,
        authorization.build._id,
        { allowPendingMaterialization: true },
      ),
      ctx.db
        .query("activeBuildPlanningRevisionChunks")
        .withIndex("by_revision", (query) =>
          query.eq("revisionId", activationRevision._id),
        )
        .take(1),
    ]);
    const projection = await redactSnapshotForViewer(
      ctx,
      authorization,
      snapshot,
    );
    const page = pagedPlanningSnapshot(
      projection.snapshot,
      args.paginationOpts.cursor,
      boundedPlanningPagination(args.paginationOpts).numItems,
    );
    return {
      activation: planningActivationSummary(
        activationRevision,
        authorization.effectiveRole.role === "contractor",
      ),
      buildId: snapshot.buildId,
      isDone: page.isDone,
      materializationPending: pendingChunks.length > 0,
      page: page.page,
      continueCursor: page.continueCursor,
    };
  })
  .public();

export const listActiveBuildPlanningReconciliationDiffs = authenticatedQuery
  .input({
    buildId: v.id("activeBuilds"),
    organizationId: v.string(),
    paginationOpts: paginationOptsValidator,
  })
  .returns(buildPlanningReconciliationDiffPageValidator)
  .handler(async (ctx, args) => {
    const authorization = await authorizeActiveBuildAccess(ctx, args);
    const [revisionPage, pendingChunks] = await Promise.all([
      planningRevisionPage(ctx, authorization.build._id),
      ctx.db
        .query("activeBuildPlanningRevisionChunks")
        .withIndex("by_build", (query) =>
          query.eq("buildId", authorization.build._id),
        )
        .take(1),
    ]);
    const diffs: Array<PlanningDiff & { revision: number }> = [];
    let diffsTruncated = false;
    for (const revision of revisionPage.rows) {
      const remainingDiffLimit = PLANNING_REVISION_DIFF_LIMIT - diffs.length;
      if (remainingDiffLimit <= 0) {
        diffsTruncated ||= revision.diffCount > 0;
        if (diffsTruncated) break;
        continue;
      }
      const result = await readRevisionDiffs(ctx, revision, remainingDiffLimit);
      diffs.push(...result.rows);
      if (result.truncated) {
        diffsTruncated = true;
        break;
      }
    }
    let visibleDiffs = diffs;
    if (authorization.effectiveRole.role === "contractor") {
      const currentProjection = await redactSnapshotForViewer(
        ctx,
        authorization,
        await collectPlanningSnapshot(ctx, authorization.build),
      );
      visibleDiffs = diffs.flatMap((diff) => {
        const redacted = redactContractorPlanningDiff(diff);
        if (!redacted) return [];
        if (
          diff.entityType === "milestone" &&
          !currentProjection.visibleMilestoneKeys?.has(diff.entityKey)
        ) {
          return [];
        }
        if (
          diff.entityType === "submilestone" &&
          !currentProjection.visibleSubmilestoneKeys?.has(diff.entityKey)
        ) {
          return [];
        }
        return [{ ...redacted, revision: diff.revision }];
      });
    }
    const pagination = boundedPlanningPagination(args.paginationOpts);
    const offset = planningPageOffset(pagination.cursor);
    const page = visibleDiffs.slice(offset, offset + pagination.numItems);
    const nextOffset = offset + page.length;
    return {
      diffsTruncated,
      isDone: nextOffset >= visibleDiffs.length,
      materializationPending: pendingChunks.length > 0,
      page: page.map((diff) => ({
        category: diff.category,
        changeType: diff.changeType,
        entityKey: diff.entityKey,
        entityType: diff.entityType,
        field: diff.field,
        nextValue: diff.nextValue,
        priorValue: diff.priorValue,
        revision: diff.revision,
      })),
      revisionsTruncated: revisionPage.isTruncated,
      continueCursor: encodePlanningPageCursor(nextOffset),
    };
  })
  .public();

/**
 * Rebuild only the collaboration projection. This command deliberately does
 * not mutate canonical Milestone, Draw, Evidence, or ownership state.
 */
export const reconcileActiveBuildMilestonePlanning = authenticatedMutation
  .input({
    buildId: v.id("activeBuilds"),
    milestoneKey: v.optional(v.string()),
    organizationId: v.string(),
  })
  .returns(
    v.object({
      buildId: v.id("activeBuilds"),
      planningRevision: v.number(),
      postIds: v.array(v.id("buildCollaborationPosts")),
      repairedMilestoneCount: v.number(),
      synchronizedMilestoneCount: v.number(),
    })
  )
  .handler(async (ctx, args) => {
    const authorization = await authorizeActiveBuildAccess(ctx, args);
    if (authorization.effectiveRole.tier < 3) {
      throw new Error(
        "Forbidden: planning reconciliation requires an authorized operator."
      );
    }
    await ensureActiveBuildPlanningActivationRevision(ctx, {
      actor: {
        actorRoles: authorization.roles,
        actorWorkosUserId: authorization.viewer.subject,
      },
      build: authorization.build,
    });
    const milestones = await ctx.db
      .query("buildMilestones")
      .withIndex("by_build", (query) =>
        query.eq("buildId", authorization.build._id)
      )
      .take(PLANNING_SNAPSHOT_LIMITS.milestones + 1);
    assertWithinPlanningSnapshotLimit(
      "Milestones",
      milestones.length,
      PLANNING_SNAPSHOT_LIMITS.milestones
    );
    const targets = milestones.filter(
      (milestone) =>
        args.milestoneKey === undefined || milestone.key === args.milestoneKey
    );
    const posts: Id<"buildCollaborationPosts">[] = [];
    let repairedMilestoneCount = 0;
    for (const milestone of targets) {
      let postId = await synchronizeMilestoneSystemPostPlanning(ctx, {
        actor: {
          roles: authorization.roles,
          workosUserId: authorization.viewer.subject,
        },
        build: authorization.build,
        milestone,
      });
      if (!postId && milestone.planningState !== "superseded") {
        const repaired = await ensureMilestoneSystemPost(ctx, {
          actor: {
            roles: authorization.roles,
            workosUserId: authorization.viewer.subject,
          },
          activationReason: "recovery",
          build: authorization.build,
          milestone,
        });
        postId = repaired?.postId ?? null;
        if (postId) repairedMilestoneCount += 1;
      }
      if (postId) posts.push(postId);
    }
    return {
      buildId: authorization.build._id,
      planningRevision:
        (await latestPlanningRevision(ctx, authorization.build._id))
          ?.revision ?? 0,
      postIds: posts,
      repairedMilestoneCount,
      synchronizedMilestoneCount: posts.length,
    };
  })
  .public();

export {
  ensureActiveBuildPlanningActivationRevision,
  recordApprovedActiveBuildPlanningRevision,
} from "./build_collaboration_planning_reconciliation/revision";
export {
  materializeActiveBuildPlanningRevisionChunk,
  recoverActiveBuildPlanningRevisionMaterialization,
} from "./build_collaboration_planning_reconciliation/revision";
