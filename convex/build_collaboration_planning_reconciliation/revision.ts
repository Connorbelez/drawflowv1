import { v } from "convex/values";
import { internal } from "../_generated/api";
import { internalMutation } from "../fluent";
import type { Doc, Id, MutationCtx, QueryCtx } from "../types";

import {
  type PlanningActor,
  type PlanningDiff,
  type PlanningEntity,
  type PlanningSnapshot,
  PLANNING_MATERIALIZATION_RECOVERY_BATCH_SIZE,
  PLANNING_MATERIALIZATION_RECOVERY_DELAY_MS,
  PLANNING_MATERIALIZATION_RECOVERY_MAX_ATTEMPTS,
  PLANNING_REVISION_CHUNK_LIMIT,
  PLANNING_REVISION_DIFF_LIMIT,
  PLANNING_REVISION_ENTITY_LIMIT,
  PLANNING_REVISION_MATERIALIZATION_BATCH_SIZE,
  PLANNING_REVISION_READ_LIMIT,
  assertWithinPlanningSnapshotLimit,
  chunkPlanningRows,
  collectPlanningSnapshot,
  decodePlanningMaterializationRecoveryCursor,
  emptyPlanningSnapshot,
  encodePlanningMaterializationRecoveryCursor,
  flattenSnapshot,
  latestPlanningRevision,
  nextActiveBuildPlanningRevisionChunk,
  planningDiff,
  readRevisionSnapshot,
  scheduleActiveBuildPlanningRevisionMaterialization,
  snapshotEntitySummary,
} from "./core";


export async function ensureActiveBuildPlanningActivationRevision(
  ctx: MutationCtx,
  input: {
    actor: PlanningActor;
    build: Doc<"activeBuilds">;
    now?: number;
  }
) {
  const existing = await ctx.db
    .query("activeBuildPlanningRevisions")
    .withIndex("by_build_kind", (query) =>
      query.eq("buildId", input.build._id).eq("kind", "activation")
    )
    .take(1);
  if (existing[0]) return existing[0];
  return await recordApprovedActiveBuildPlanningRevision(ctx, {
    actor: input.actor,
    build: input.build,
    kind: "activation",
    reason: "Activation snapshot captured from the approved Build plan.",
    sourceCommand: "activateActiveBuildPlanning",
    now: input.now,
  });
}

export async function recordApprovedActiveBuildPlanningRevision(
  ctx: MutationCtx,
  input: {
    actor: PlanningActor;
    build: Doc<"activeBuilds">;
    kind?: "activation" | "approved";
    reason: string;
    sourceCommand: string;
    now?: number;
  }
) {
  const now = input.now ?? Date.now();
  const current = await collectPlanningSnapshot(ctx, input.build);
  const priorRevision = await latestPlanningRevision(ctx, input.build._id);
  const previous = priorRevision
    ? await readRevisionSnapshot(ctx, priorRevision._id, input.build._id, {
        allowPendingMaterialization: true,
      })
    : undefined;
  const kind = input.kind ?? "approved";
  if (kind === "approved" && priorRevision) {
    const diffs = planningDiff(previous, current);
    if (diffs.length === 0) return priorRevision;
  }
  const revision = (priorRevision?.revision ?? 0) + 1;
  const diffs = kind === "activation" ? [] : planningDiff(previous, current);
  // Build all bounded materialization payloads before creating the revision
  // row.  If a diff safety limit is exceeded, the mutation fails without
  // leaving a partially persisted revision or transient chunks behind.
  if (diffs.length > PLANNING_REVISION_DIFF_LIMIT) {
    throw new Error(
      `Active Build planning revision exceeds the ${PLANNING_REVISION_DIFF_LIMIT} diff safety limit.`,
    );
  }
  const entityChunks = chunkPlanningRows(
    flattenSnapshot(current),
    PLANNING_REVISION_MATERIALIZATION_BATCH_SIZE
  );
  const diffChunks = chunkPlanningRows(
    diffs,
    PLANNING_REVISION_MATERIALIZATION_BATCH_SIZE
  );
  if (diffChunks.length > PLANNING_REVISION_CHUNK_LIMIT) {
    throw new Error(
      `Active Build planning revision exceeds the ${PLANNING_REVISION_CHUNK_LIMIT} materialization chunk safety limit.`,
    );
  }
  const revisionId = await ctx.db.insert("activeBuildPlanningRevisions", {
    actorRoles: [...input.actor.actorRoles],
    actorWorkosUserId: input.actor.actorWorkosUserId,
    approvedAt: now,
    brokerageId: input.build.brokerageId,
    buildId: input.build._id,
    createdAt: now,
    diffCount: diffs.length,
    kind,
    organizationId: input.build.organizationId,
    previousRevision: priorRevision?.revision,
    reason: input.reason.trim() || "Approved planning revision.",
    revision,
    sourceCommand: input.sourceCommand,
    summary: snapshotEntitySummary(current),
  });
  for (const [chunkIndex, entities] of entityChunks.entries()) {
    await ctx.db.insert("activeBuildPlanningRevisionChunks", {
      brokerageId: input.build.brokerageId,
      buildId: input.build._id,
      chunkIndex,
      chunkKind: "entities",
      createdAt: now,
      organizationId: input.build.organizationId,
      payloadJson: JSON.stringify(entities),
      revision,
      revisionId,
      materializationRecoveryState: "pending",
    });
  }
  for (const [chunkIndex, diffChunk] of diffChunks.entries()) {
    await ctx.db.insert("activeBuildPlanningRevisionChunks", {
      brokerageId: input.build.brokerageId,
      buildId: input.build._id,
      chunkIndex,
      chunkKind: "diffs",
      createdAt: now,
      organizationId: input.build.organizationId,
      payloadJson: JSON.stringify(diffChunk),
      revision,
      revisionId,
      materializationRecoveryState: "pending",
    });
  }
  await ctx.db.insert("auditEvents", {
    actorRoles: [...input.actor.actorRoles],
    actorWorkosUserId: input.actor.actorWorkosUserId,
    brokerageId: input.build.brokerageId,
    command: input.sourceCommand,
    createdAt: now,
    entityId: String(revisionId),
    entityType: "activeBuildPlanningRevision",
    eventType:
      kind === "activation"
        ? "active_build.planning.activated"
        : "active_build.planning.revised",
    newState: JSON.stringify({
      buildId: String(input.build._id),
      diffCount: diffs.length,
      revision,
      summary: snapshotEntitySummary(current),
    }),
    organizationId: input.build.organizationId,
    priorState: priorRevision
      ? JSON.stringify({ revision: priorRevision.revision })
      : undefined,
    reason: input.reason.trim() || "Approved planning revision.",
    warnings: [],
  });
  if (entityChunks.length > 0 || diffChunks.length > 0) {
    await scheduleActiveBuildPlanningRevisionMaterialization(ctx, revisionId, now);
  }
  return await ctx.db.get(revisionId);
}

/**
 * Materialize one transient planning chunk in a bounded mutation. The chunk
 * is deleted in the same transaction as its canonical projection rows, so a
 * retry is idempotent and readers can fail closed while any chunk remains.
 */
export const materializeActiveBuildPlanningRevisionChunk = internalMutation
  .input({ revisionId: v.id("activeBuildPlanningRevisions") })
  .returns(v.null())
  .handler(async (ctx, args) => {
    const revision = await ctx.db.get(args.revisionId);
    if (!revision) return null;

    const chunk = await nextActiveBuildPlanningRevisionChunk(ctx, args.revisionId);
    if (!chunk) return null;
    if (chunk.materializationRecoveryState === "exhausted") return null;
    if (
      chunk.buildId !== revision.buildId ||
      chunk.brokerageId !== revision.brokerageId ||
      chunk.organizationId !== revision.organizationId ||
      chunk.revision !== revision.revision
    ) {
      throw new Error(
        "Active Build planning revision materialization chunk scope is invalid."
      );
    }

    if (chunk.chunkKind === "entities") {
      const entities = JSON.parse(chunk.payloadJson) as PlanningEntity[];
      if (entities.length > PLANNING_REVISION_MATERIALIZATION_BATCH_SIZE) {
        throw new Error(
          "Active Build planning revision entity chunk exceeds its bounded batch size."
        );
      }
      for (const entity of entities) {
        await ctx.db.insert("activeBuildPlanningRevisionEntities", {
          brokerageId: revision.brokerageId,
          buildId: revision.buildId,
          ...(entity.canonicalId === undefined
            ? {}
            : { canonicalId: entity.canonicalId }),
          createdAt: revision.createdAt,
          entityKey: entity.entityKey,
          entityType: entity.entityType,
          organizationId: revision.organizationId,
          planningState: entity.planningState,
          revision: revision.revision,
          revisionId: revision._id,
          snapshotJson: JSON.stringify(entity.snapshot),
        });
      }
    } else {
      const diffs = JSON.parse(chunk.payloadJson) as PlanningDiff[];
      if (diffs.length > PLANNING_REVISION_MATERIALIZATION_BATCH_SIZE) {
        throw new Error(
          "Active Build planning revision diff chunk exceeds its bounded batch size."
        );
      }
      for (const diff of diffs) {
        await ctx.db.insert("activeBuildPlanningRevisionDiffs", {
          brokerageId: revision.brokerageId,
          buildId: revision.buildId,
          category: diff.category,
          changeType: diff.changeType,
          createdAt: revision.createdAt,
          entityKey: diff.entityKey,
          entityType: diff.entityType,
          field: diff.field,
          ...(diff.nextValue === undefined ? {} : { nextValue: diff.nextValue }),
          organizationId: revision.organizationId,
          ...(diff.priorValue === undefined
            ? {}
            : { priorValue: diff.priorValue }),
          revision: revision.revision,
          revisionId: revision._id,
        });
      }
    }

    await ctx.db.delete(chunk._id);
    const remaining = await ctx.db
      .query("activeBuildPlanningRevisionChunks")
      .withIndex("by_revision", (query) => query.eq("revisionId", revision._id))
      .take(1);
    if (remaining.length > 0) {
      await scheduleActiveBuildPlanningRevisionMaterialization(
        ctx,
        revision._id,
        Date.now(),
      );
    }
    return null;
  })
  .internal();

async function emitPlanningMaterializationRecoveryExhausted(
  ctx: MutationCtx,
  revision: Doc<"activeBuildPlanningRevisions">,
  residualChunkCount: number,
  now: number,
) {
  const reconciliationKey = [
    "active-build-planning-materialization",
    revision._id,
    "exhausted",
  ].join(":");
  const existing = await ctx.db
    .query("auditEvents")
    .withIndex("by_organizationId_and_reconciliationKey", (query) =>
      query
        .eq("organizationId", revision.organizationId)
        .eq("reconciliationKey", reconciliationKey),
    )
    .first();
  if (existing) return;

  const newState = JSON.stringify({
    buildId: revision.buildId,
    maxRecoveryAttempts: PLANNING_MATERIALIZATION_RECOVERY_MAX_ATTEMPTS,
    residualChunkCount,
    revision: revision.revision,
    revisionId: revision._id,
    state: "recovery_exhausted",
  });
  const reason =
    "Active Build planning revision materialization retained residual chunks after the bounded scheduler recovery budget was exhausted.";
  const warnings = [
    "planning_materialization_recovery_exhausted",
    "canonical_planning_revision_requires_operator_repair",
  ];
  await Promise.all([
    ctx.db.insert("auditEvents", {
      actorRoles: ["system"],
      actorWorkosUserId: "system:build-collaboration-planning-recovery",
      brokerageId: revision.brokerageId,
      command: "recoverActiveBuildPlanningRevisionMaterialization",
      createdAt: now,
      entityId: String(revision._id),
      entityType: "activeBuildPlanningRevision",
      eventType: "active_build.planning.materialization_recovery_exhausted",
      newState,
      organizationId: revision.organizationId,
      reason,
      reconciliationKey,
      warnings,
    }),
    ctx.db.insert("eventOutbox", {
      brokerageId: revision.brokerageId,
      createdAt: now,
      eventType: "active_build.planning.materialization_recovery_exhausted",
      organizationId: revision.organizationId,
      payloadPreview: JSON.stringify({
        buildId: revision.buildId,
        reconciliationKey,
        residualChunkCount,
        revision: revision.revision,
        revisionId: revision._id,
      }),
      relatedEntityId: String(revision._id),
      relatedEntityType: "activeBuildPlanningRevision",
      status: "pending",
    }),
  ]);
}

async function exhaustPlanningMaterializationRecovery(
  ctx: MutationCtx,
  revision: Doc<"activeBuildPlanningRevisions">,
  now: number,
) {
  const residualChunks = await ctx.db
    .query("activeBuildPlanningRevisionChunks")
    .withIndex("by_revision", (query) => query.eq("revisionId", revision._id))
    .take(PLANNING_REVISION_CHUNK_LIMIT + 1);
  assertWithinPlanningSnapshotLimit(
    "planning revision materialization chunks",
    residualChunks.length,
    PLANNING_REVISION_CHUNK_LIMIT,
  );
  for (const chunk of residualChunks) {
    await ctx.db.patch(chunk._id, {
      materializationRecoveryExhaustedAt:
        chunk.materializationRecoveryExhaustedAt ?? now,
      materializationRecoveryState: "exhausted",
    });
  }
  await emitPlanningMaterializationRecoveryExhausted(
    ctx,
    revision,
    residualChunks.length,
    now,
  );
}

async function processPlanningMaterializationRecoveryPage(
  ctx: MutationCtx,
  chunks: Doc<"activeBuildPlanningRevisionChunks">[],
  asOf: number,
) {
  const revisionIds = new Set(chunks.map((chunk) => String(chunk.revisionId)));
  for (const revisionIdString of revisionIds) {
    const revisionId = ctx.db.normalizeId(
      "activeBuildPlanningRevisions",
      revisionIdString,
    );
    if (!revisionId) continue;
    const nextChunk = await nextActiveBuildPlanningRevisionChunk(
      ctx,
      revisionId,
    );
    // Only the first chunk in the canonical entity-then-diff order may be
    // retried. The materializer schedules its own continuation after each
    // successful deletion, so this keeps a single in-flight retry per
    // revision even when a global recovery page splits its chunks.
    if (!nextChunk || !chunks.some((chunk) => chunk._id === nextChunk._id)) {
      continue;
    }
    if (nextChunk.materializationRecoveryState === "exhausted") continue;
    const lastScheduledAt = nextChunk.materializationLastScheduledAt;
    if (
      lastScheduledAt !== undefined &&
      asOf - lastScheduledAt < PLANNING_MATERIALIZATION_RECOVERY_DELAY_MS
    ) {
      continue;
    }
    const attempts = nextChunk.materializationRecoveryAttemptCount ?? 0;
    const revision = await ctx.db.get(revisionId);
    if (!revision) continue;
    if (attempts >= PLANNING_MATERIALIZATION_RECOVERY_MAX_ATTEMPTS) {
      await exhaustPlanningMaterializationRecovery(ctx, revision, asOf);
      continue;
    }
    await ctx.db.patch(nextChunk._id, {
      materializationRecoveryAttemptCount: attempts + 1,
      materializationRecoveryState: "pending",
    });
    await scheduleActiveBuildPlanningRevisionMaterialization(
      ctx,
      revisionId,
      asOf,
    );
  }
}

/**
 * Recover residual planning materialization chunks when a scheduled
 * materializer failed after the creating mutation committed.  This is a
 * bounded reconciliation pass over the existing transient chunk rows, not a
 * second job system: every retry re-enters the canonical materializer and the
 * canonical materializer owns continuation scheduling.
 */
export const recoverActiveBuildPlanningRevisionMaterialization = internalMutation
  .input({
    asOf: v.optional(v.number()),
    cursor: v.optional(v.union(v.string(), v.null())),
  })
  .returns(v.null())
  .handler(async (ctx, args) => {
    const asOf = args.asOf ?? Date.now();
    const recoveryCursor = decodePlanningMaterializationRecoveryCursor(
      args.cursor,
    );
    const page =
      recoveryCursor.phase === "pending"
        ? await ctx.db
            .query("activeBuildPlanningRevisionChunks")
            .withIndex("by_materialization_recovery_state", (query) =>
              query.eq("materializationRecoveryState", "pending"),
            )
            .order("asc")
            .paginate({
              cursor: recoveryCursor.cursor,
              numItems: PLANNING_MATERIALIZATION_RECOVERY_BATCH_SIZE,
            })
        : await ctx.db
            .query("activeBuildPlanningRevisionChunks")
            // Older chunks predate recovery metadata and therefore cannot be
            // addressed by the state index. This is deliberately a separate,
            // bounded legacy pass; new rows always take the indexed path.
            .order("asc")
            .paginate({
              cursor: recoveryCursor.cursor,
              numItems: PLANNING_MATERIALIZATION_RECOVERY_BATCH_SIZE,
            });
    const candidateChunks =
      recoveryCursor.phase === "legacy"
        ? page.page.filter(
            (chunk) => chunk.materializationRecoveryState === undefined,
          )
        : page.page;
    await processPlanningMaterializationRecoveryPage(
      ctx,
      candidateChunks,
      asOf,
    );

    if (!page.isDone) {
      await ctx.scheduler.runAfter(
        0,
        internal.build_collaboration_planning_reconciliation
          .recoverActiveBuildPlanningRevisionMaterialization,
        {
          asOf,
          cursor: encodePlanningMaterializationRecoveryCursor({
            cursor: page.continueCursor,
            phase: recoveryCursor.phase,
          }),
        },
      );
    } else if (recoveryCursor.phase === "pending") {
      // Convex allows only one paginated query per function. Finish the first
      // legacy batch with `.take()`, then schedule a paginated legacy sweep if
      // the table may still contain more pre-index rows.
      const legacyCandidates = await ctx.db
        .query("activeBuildPlanningRevisionChunks")
        .order("asc")
        .take(PLANNING_MATERIALIZATION_RECOVERY_BATCH_SIZE);
      await processPlanningMaterializationRecoveryPage(
        ctx,
        legacyCandidates.filter(
          (chunk) => chunk.materializationRecoveryState === undefined,
        ),
        asOf,
      );
      if (
        legacyCandidates.length === PLANNING_MATERIALIZATION_RECOVERY_BATCH_SIZE
      ) {
        await ctx.scheduler.runAfter(
          0,
          internal.build_collaboration_planning_reconciliation
            .recoverActiveBuildPlanningRevisionMaterialization,
          {
            asOf,
            cursor: encodePlanningMaterializationRecoveryCursor({
              cursor: null,
              phase: "legacy",
            }),
          },
        );
      }
    }
    return null;
  })
  .internal();
