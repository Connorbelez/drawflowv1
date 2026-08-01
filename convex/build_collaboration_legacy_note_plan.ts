import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";

import { authenticatedMutation, authenticatedQuery } from "./authz";
import {
  advanceAccumulator,
  authorizeLegacyNoteOperator,
  buildSnapshot,
  initialPlanAccumulator,
  LEGACY_NOTE_PLAN_VERSION,
  MAX_MANIFEST_WRITE_SIZE,
  MAX_PLAN_PAGE_SIZE,
  nextCursor,
  normalizePageSize,
  noteAudience,
  noteSnapshot,
  planTokenFromAccumulator,
  recordLegacyNoteCutoverAudit,
  requireLegacyNoteCutoverState,
  requirePlanToken,
  sha256Hex,
} from "./build_collaboration_legacy_note_shared";
import type { BuildCollaborationRole } from "./build_collaboration_model";
import { resolveEffectiveCollaborationRole } from "./build_collaboration_model";
import type { Doc, Id, MutationCtx } from "./types";

interface BuildPreviewItem {
  buildId: Id<"activeBuilds">;
  buildName: string;
  kind: "build";
  snapshotHash: string;
}

interface NotePreviewItem {
  audienceFloorTier: number;
  audienceMode: "author_tier_and_higher" | "build_wide";
  authorRole: BuildCollaborationRole;
  authorRolesSnapshot: string[];
  authorWorkosUserId: string;
  buildId: Id<"activeBuilds">;
  contentHash: string;
  createdAt: number;
  expectedRevision: number;
  kind: "note";
  snapshotHash: string;
  sourceNoteId: Id<"buildNotes">;
  updatedAt: number;
  visibility: "internal" | "public";
}

const previewPhaseValidator = v.union(v.literal("builds"), v.literal("notes"));

const previewResultValidator = v.object({
  accumulator: v.string(),
  continueCursor: v.string(),
  isDone: v.boolean(),
  items: v.array(v.any()),
  nextPhase: v.optional(previewPhaseValidator),
  phase: previewPhaseValidator,
  planToken: v.optional(v.string()),
  planVersion: v.string(),
  warnings: v.array(v.string()),
});

const runResultValidator = v.object({
  blockedReason: v.optional(v.string()),
  blockingWarningCount: v.number(),
  planToken: v.string(),
  processedBuildCount: v.number(),
  processedNoteCount: v.number(),
  runId: v.id("buildCollaborationLegacyNoteMigrationRuns"),
  status: v.union(
    v.literal("validating"),
    v.literal("importing"),
    v.literal("complete"),
    v.literal("blocked")
  ),
  validationPhase: v.union(
    v.literal("builds"),
    v.literal("notes"),
    v.literal("complete")
  ),
});

export const previewBuildCollaborationLegacyNoteMigrationPage =
  authenticatedQuery
    .input({
      accumulator: v.optional(v.string()),
      buildId: v.id("activeBuilds"),
      organizationId: v.string(),
      paginationOpts: paginationOptsValidator,
      phase: previewPhaseValidator,
    })
    .returns(previewResultValidator)
    .handler(async (ctx, args) => {
      const authorization = await authorizeLegacyNoteOperator(ctx, args);
      await requireLegacyNoteCutoverState(ctx, authorization);
      normalizePageSize(args.paginationOpts.numItems, MAX_PLAN_PAGE_SIZE);
      let accumulator =
        args.accumulator ?? (await initialPlanAccumulator(authorization));
      if (args.phase === "notes" && !args.accumulator) {
        throw new Error(
          "The notes preview requires the completed Build accumulator."
        );
      }
      if (args.paginationOpts.cursor && !args.accumulator) {
        throw new Error(
          "Continued preview pages require the prior accumulator."
        );
      }

      if (args.phase === "builds") {
        const page = await ctx.db
          .query("activeBuilds")
          .withIndex("by_organizationId", (query) =>
            query.eq("organizationId", authorization.organizationId)
          )
          .paginate(args.paginationOpts);
        const warnings: string[] = [];
        const items: BuildPreviewItem[] = [];
        for (const build of page.page) {
          if (build.brokerageId !== authorization.brokerage._id) {
            warnings.push(
              `Build ${build._id} has inconsistent brokerage ownership.`
            );
          }
          const snapshot = buildSnapshot(build);
          accumulator = await advanceAccumulator(
            accumulator,
            "build",
            snapshot
          );
          items.push({
            buildId: build._id,
            buildName: build.buildName,
            kind: "build",
            snapshotHash: await sha256Hex(JSON.stringify(snapshot)),
          });
        }
        return {
          accumulator,
          continueCursor: page.continueCursor,
          isDone: page.isDone,
          items,
          nextPhase: page.isDone ? ("notes" as const) : undefined,
          phase: "builds" as const,
          planVersion: LEGACY_NOTE_PLAN_VERSION,
          warnings,
        };
      }

      const page = await ctx.db
        .query("buildNotes")
        .withIndex("by_organizationId_and_buildId", (query) =>
          query.eq("organizationId", authorization.organizationId)
        )
        .paginate(args.paginationOpts);
      const warnings: string[] = [];
      const items: NotePreviewItem[] = [];
      for (const note of page.page) {
        const effectiveRole = resolveEffectiveCollaborationRole(
          note.authorRoles
        );
        const build = await ctx.db.get(note.buildId);
        if (!effectiveRole) {
          warnings.push(
            `Legacy note ${note._id} has no recognized author role.`
          );
          continue;
        }
        if (
          !build ||
          build.organizationId !== authorization.organizationId ||
          build.brokerageId !== authorization.brokerage._id ||
          note.brokerageId !== authorization.brokerage._id
        ) {
          warnings.push(
            `Legacy note ${note._id} has inconsistent tenant ownership.`
          );
          continue;
        }
        const snapshot = noteSnapshot(note);
        const audience = noteAudience(snapshot);
        accumulator = await advanceAccumulator(accumulator, "note", snapshot);
        items.push({
          ...audience,
          authorRole: snapshot.authorRole,
          authorRolesSnapshot: snapshot.authorRolesSnapshot,
          authorWorkosUserId: snapshot.authorWorkosUserId,
          buildId: snapshot.buildId,
          contentHash: await sha256Hex(snapshot.body),
          createdAt: snapshot.createdAt,
          expectedRevision: 1,
          kind: "note",
          snapshotHash: await sha256Hex(JSON.stringify(snapshot)),
          sourceNoteId: snapshot.sourceNoteId,
          updatedAt: snapshot.updatedAt,
          visibility: snapshot.visibility,
        });
      }
      return {
        accumulator,
        continueCursor: page.continueCursor,
        isDone: page.isDone,
        items,
        phase: "notes" as const,
        planToken: page.isDone
          ? planTokenFromAccumulator(accumulator)
          : undefined,
        planVersion: LEGACY_NOTE_PLAN_VERSION,
        warnings,
      };
    })
    .public();

export const startBuildCollaborationLegacyNoteMigration = authenticatedMutation
  .input({
    buildId: v.id("activeBuilds"),
    organizationId: v.string(),
    planToken: v.string(),
  })
  .returns(runResultValidator)
  .handler(async (ctx, args) => {
    const authorization = await authorizeLegacyNoteOperator(ctx, args, true);
    await requireLegacyNoteCutoverState(ctx, authorization);
    requirePlanToken(args.planToken);
    const existing = await ctx.db
      .query("buildCollaborationLegacyNoteMigrationRuns")
      .withIndex("by_organizationId_and_planToken", (query) =>
        query
          .eq("organizationId", authorization.organizationId)
          .eq("planToken", args.planToken)
      )
      .order("desc")
      .first();
    if (existing && existing.status !== "blocked") {
      requireRunOwnership(existing, authorization);
      return presentRun(existing);
    }
    const now = Date.now();
    const runId = await ctx.db.insert(
      "buildCollaborationLegacyNoteMigrationRuns",
      {
        blockingWarningCount: 0,
        brokerageId: authorization.brokerage._id,
        createdAt: now,
        nextImportOrdinal: 0,
        organizationId: authorization.organizationId,
        planToken: args.planToken,
        planVersion: LEGACY_NOTE_PLAN_VERSION,
        processedBuildCount: 0,
        processedNoteCount: 0,
        sourceRecordCount: 0,
        startedByWorkosUserId: authorization.viewer.subject,
        status: "validating",
        tokenAccumulator: await initialPlanAccumulator(authorization),
        updatedAt: now,
        validationPhase: "builds",
      }
    );
    await recordLegacyNoteCutoverAudit(ctx, authorization, {
      command: "startBuildCollaborationLegacyNoteMigration",
      entityId: runId,
      eventType: "build.collaboration.legacy_note_migration.started",
      newState: JSON.stringify({ planToken: args.planToken }),
      now,
    });
    const run = await ctx.db.get(runId);
    if (!run) {
      throw new Error("Legacy-note migration run could not be created.");
    }
    return presentRun(run);
  })
  .public();

export const advanceBuildCollaborationLegacyNotePlan = authenticatedMutation
  .input({
    buildId: v.id("activeBuilds"),
    maxItems: v.optional(v.number()),
    organizationId: v.string(),
    runId: v.id("buildCollaborationLegacyNoteMigrationRuns"),
  })
  .returns(runResultValidator)
  .handler(async (ctx, args) => {
    const authorization = await authorizeLegacyNoteOperator(ctx, args, true);
    await requireLegacyNoteCutoverState(ctx, authorization);
    const run = await requireMigrationRun(ctx, args.runId, authorization);
    if (run.status !== "validating") {
      return presentRun(run);
    }
    const limit = normalizePageSize(
      args.maxItems ?? MAX_MANIFEST_WRITE_SIZE,
      MAX_MANIFEST_WRITE_SIZE
    );
    if (run.validationPhase === "builds") {
      return await advanceBuildManifest(ctx, authorization, run, limit);
    }
    if (run.validationPhase === "notes") {
      return await advanceNoteManifest(ctx, authorization, run, limit);
    }
    return presentRun(run);
  })
  .public();

async function advanceBuildManifest(
  ctx: MutationCtx,
  authorization: Awaited<ReturnType<typeof authorizeLegacyNoteOperator>>,
  run: Doc<"buildCollaborationLegacyNoteMigrationRuns">,
  limit: number
) {
  const page = await ctx.db
    .query("activeBuilds")
    .withIndex("by_organizationId", (query) =>
      query.eq("organizationId", authorization.organizationId)
    )
    .paginate({ cursor: run.validationBuildCursor ?? null, numItems: limit });
  let accumulator = run.tokenAccumulator;
  let ordinal = run.processedBuildCount;
  for (const build of page.page) {
    if (build.brokerageId !== authorization.brokerage._id) {
      return await blockRun(
        ctx,
        run,
        `Build ${build._id} has inconsistent brokerage ownership.`
      );
    }
    const snapshot = buildSnapshot(build);
    accumulator = await advanceAccumulator(accumulator, "build", snapshot);
    await ctx.db.insert("buildCollaborationLegacyNotePlanBuilds", {
      brokerageId: authorization.brokerage._id,
      buildId: build._id,
      buildName: build.buildName,
      createdAt: Date.now(),
      ordinal,
      organizationId: authorization.organizationId,
      runId: run._id,
      snapshotHash: await sha256Hex(JSON.stringify(snapshot)),
    });
    ordinal += 1;
  }
  await ctx.db.patch(run._id, {
    processedBuildCount: ordinal,
    tokenAccumulator: accumulator,
    updatedAt: Date.now(),
    validationBuildCursor: nextCursor(page),
    ...(page.isDone
      ? { validationBuildCursor: undefined, validationPhase: "notes" as const }
      : {}),
  });
  const updated = await ctx.db.get(run._id);
  if (!updated) {
    throw new Error("Legacy-note migration run became unavailable.");
  }
  return presentRun(updated);
}

async function advanceNoteManifest(
  ctx: MutationCtx,
  authorization: Awaited<ReturnType<typeof authorizeLegacyNoteOperator>>,
  run: Doc<"buildCollaborationLegacyNoteMigrationRuns">,
  limit: number
) {
  const page = await ctx.db
    .query("buildNotes")
    .withIndex("by_organizationId_and_buildId", (query) =>
      query.eq("organizationId", authorization.organizationId)
    )
    .paginate({ cursor: run.validationNoteCursor ?? null, numItems: limit });
  let accumulator = run.tokenAccumulator;
  let ordinal = run.processedNoteCount;
  for (const note of page.page) {
    const role = resolveEffectiveCollaborationRole(note.authorRoles);
    const manifestBuild = await ctx.db
      .query("buildCollaborationLegacyNotePlanBuilds")
      .withIndex("by_runId_and_buildId", (query) =>
        query.eq("runId", run._id).eq("buildId", note.buildId)
      )
      .unique();
    if (
      !(role && manifestBuild) ||
      note.brokerageId !== authorization.brokerage._id
    ) {
      return await blockRun(
        ctx,
        run,
        `Legacy note ${note._id} has inconsistent ownership or author role.`
      );
    }
    const snapshot = noteSnapshot(note);
    const audience = noteAudience(snapshot);
    accumulator = await advanceAccumulator(accumulator, "note", snapshot);
    await ctx.db.insert("buildCollaborationLegacyNotePlanNotes", {
      ...audience,
      authorRole: snapshot.authorRole,
      authorRolesSnapshot: snapshot.authorRolesSnapshot,
      authorWorkosUserId: snapshot.authorWorkosUserId,
      body: snapshot.body,
      brokerageId: authorization.brokerage._id,
      buildId: snapshot.buildId,
      createdAt: snapshot.createdAt,
      importedSourceId: snapshot.importedSourceId,
      ordinal,
      organizationId: authorization.organizationId,
      runId: run._id,
      snapshotHash: await sha256Hex(JSON.stringify(snapshot)),
      sourceNoteId: snapshot.sourceNoteId,
      updatedAt: snapshot.updatedAt,
      visibility: snapshot.visibility,
    });
    ordinal += 1;
  }
  const finalToken = page.isDone
    ? planTokenFromAccumulator(accumulator)
    : undefined;
  if (finalToken && finalToken !== run.planToken) {
    return await blockRun(
      ctx,
      run,
      "Migration plan changed after preview; generate and confirm a new plan token."
    );
  }
  await ctx.db.patch(run._id, {
    processedNoteCount: ordinal,
    sourceRecordCount: ordinal,
    tokenAccumulator: accumulator,
    updatedAt: Date.now(),
    validationNoteCursor: nextCursor(page),
    ...(page.isDone
      ? {
          status:
            ordinal === 0 ? ("complete" as const) : ("importing" as const),
          ...(ordinal === 0 ? { completedAt: Date.now() } : {}),
          validationNoteCursor: undefined,
          validationPhase: "complete" as const,
        }
      : {}),
  });
  const updated = await ctx.db.get(run._id);
  if (!updated) {
    throw new Error("Legacy-note migration run became unavailable.");
  }
  return presentRun(updated);
}

async function blockRun(
  ctx: MutationCtx,
  run: Doc<"buildCollaborationLegacyNoteMigrationRuns">,
  reason: string
) {
  await ctx.db.patch(run._id, {
    blockedReason: reason,
    blockingWarningCount: run.blockingWarningCount + 1,
    status: "blocked",
    updatedAt: Date.now(),
  });
  const blocked = await ctx.db.get(run._id);
  if (!blocked) {
    throw new Error("Legacy-note migration run became unavailable.");
  }
  return presentRun(blocked);
}

export async function requireMigrationRun(
  ctx: MutationCtx,
  runId: Id<"buildCollaborationLegacyNoteMigrationRuns">,
  authorization: Awaited<ReturnType<typeof authorizeLegacyNoteOperator>>
) {
  const run = await ctx.db.get(runId);
  if (!run) {
    throw new Error("Legacy-note migration run is unavailable.");
  }
  requireRunOwnership(run, authorization);
  return run;
}

function requireRunOwnership(
  run: Doc<"buildCollaborationLegacyNoteMigrationRuns">,
  authorization: Awaited<ReturnType<typeof authorizeLegacyNoteOperator>>
) {
  if (
    run.organizationId !== authorization.organizationId ||
    run.brokerageId !== authorization.brokerage._id
  ) {
    throw new Error("Legacy-note migration run is unavailable.");
  }
}

function presentRun(run: Doc<"buildCollaborationLegacyNoteMigrationRuns">) {
  return {
    blockedReason: run.blockedReason,
    blockingWarningCount: run.blockingWarningCount,
    planToken: run.planToken,
    processedBuildCount: run.processedBuildCount,
    processedNoteCount: run.processedNoteCount,
    runId: run._id,
    status: run.status,
    validationPhase: run.validationPhase,
  };
}
