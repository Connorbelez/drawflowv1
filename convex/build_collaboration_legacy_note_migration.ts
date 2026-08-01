import { v } from "convex/values";

import {
  type ActiveBuildAuthorization,
  authorizeActiveBuildAccess,
} from "./activeBuildAccess";
import { authenticatedMutation, authenticatedQuery } from "./authz";
import { stableContentHash } from "./build_collaboration_hash";
import { requireHumanCollaborationActor } from "./build_collaboration_human";
import {
  type BuildCollaborationRole,
  buildCollaborationRoles,
  resolveEffectiveCollaborationRole,
} from "./build_collaboration_model";
import type { Doc, Id, MutationCtx, QueryCtx } from "./types";

const PLAN_VERSION = "build-collaboration-legacy-notes/v1";
const PARITY_REPORT_VERSION = "build-collaboration-legacy-note-parity/v1";
const MAX_NOTES_PER_BATCH = 50;

type MigrationContext = MutationCtx | QueryCtx;
type LegacyNote = Doc<"buildNotes">;

const migrationWarningValidator = v.object({
  buildId: v.optional(v.id("activeBuilds")),
  code: v.string(),
  message: v.string(),
  sourceNoteId: v.optional(v.id("buildNotes")),
});

const sourceNotePreviewValidator = v.object({
  audienceFloorTier: v.number(),
  audienceMode: v.union(
    v.literal("build_wide"),
    v.literal("author_tier_and_higher")
  ),
  authorRole: v.optional(v.string()),
  authorRolesSnapshot: v.array(v.string()),
  authorWorkosUserId: v.string(),
  buildId: v.id("activeBuilds"),
  createdAt: v.number(),
  expectedRevision: v.literal(1),
  sourceNoteId: v.id("buildNotes"),
  updatedAt: v.number(),
  visibility: v.union(v.literal("internal"), v.literal("public")),
});

const migrationPreviewValidator = v.object({
  builds: v.array(
    v.object({
      buildId: v.id("activeBuilds"),
      buildName: v.string(),
      sourceNoteCount: v.number(),
    })
  ),
  planToken: v.string(),
  planVersion: v.string(),
  sourceNoteCount: v.number(),
  sourceNotes: v.array(sourceNotePreviewValidator),
  tenant: v.object({
    brokerageId: v.id("brokerages"),
    organizationId: v.string(),
    rolloutStatus: v.union(
      v.literal("active"),
      v.literal("disabled"),
      v.literal("migration_ready")
    ),
  }),
  warnings: v.array(migrationWarningValidator),
});

const applyResultValidator = v.object({
  complete: v.boolean(),
  nextOffset: v.number(),
  planToken: v.string(),
  processedInBatch: v.number(),
  runId: v.id("buildCollaborationLegacyNoteMigrationRuns"),
  sourceNoteCount: v.number(),
});

const parityResultValidator = v.object({
  buildReportCount: v.number(),
  evidenceId: v.id("buildCollaborationMigrationParityEvidence"),
  importedPostCount: v.number(),
  mismatchCount: v.number(),
  parityPassed: v.boolean(),
  planToken: v.string(),
  reportHash: v.string(),
  sourceRecordCount: v.number(),
});

const durableParityReportValidator = v.object({
  buildReports: v.array(
    v.object({
      buildId: v.id("activeBuilds"),
      importedPostCount: v.number(),
      mismatchCount: v.number(),
      mismatchDetailsJson: v.string(),
      parityPassed: v.boolean(),
      roleMatrixJson: v.string(),
      sourceRecordCount: v.number(),
    })
  ),
  evidence: v.object({
    evidenceId: v.id("buildCollaborationMigrationParityEvidence"),
    importedPostCount: v.number(),
    mismatchCount: v.number(),
    parityPassed: v.boolean(),
    planToken: v.string(),
    reportHash: v.string(),
    reportVersion: v.string(),
    sourceRecordCount: v.number(),
    verifiedAt: v.number(),
    verifiedByWorkosUserId: v.string(),
  }),
});

interface MigrationPlan {
  builds: Array<{
    buildId: Id<"activeBuilds">;
    buildName: string;
    sourceNoteCount: number;
  }>;
  notes: LegacyNote[];
  planToken: string;
  sourceNotes: Array<{
    audienceFloorTier: number;
    audienceMode: "author_tier_and_higher" | "build_wide";
    authorRole?: string;
    authorRolesSnapshot: string[];
    authorWorkosUserId: string;
    buildId: Id<"activeBuilds">;
    createdAt: number;
    expectedRevision: 1;
    sourceNoteId: Id<"buildNotes">;
    updatedAt: number;
    visibility: "internal" | "public";
  }>;
  tenantStatus: "active" | "disabled" | "migration_ready";
  warnings: Array<{
    buildId?: Id<"activeBuilds">;
    code: string;
    message: string;
    sourceNoteId?: Id<"buildNotes">;
  }>;
}

export const previewBuildCollaborationLegacyNoteMigration = authenticatedQuery
  .input({
    buildId: v.id("activeBuilds"),
    organizationId: v.string(),
  })
  .returns(migrationPreviewValidator)
  .handler(async (ctx, args) => {
    const authorization = await authorizeActiveBuildAccess(ctx, args);
    requireTenantOperator(authorization);
    const plan = await computeLegacyNoteMigrationPlan(ctx, authorization);
    return presentPlan(plan, authorization);
  })
  .public();

export const getBuildCollaborationLegacyNoteMigrationParityReport =
  authenticatedQuery
    .input({
      buildId: v.id("activeBuilds"),
      evidenceId: v.id("buildCollaborationMigrationParityEvidence"),
      organizationId: v.string(),
    })
    .returns(durableParityReportValidator)
    .handler(async (ctx, args) => {
      const authorization = await authorizeActiveBuildAccess(ctx, args);
      requireTenantOperator(authorization);
      const evidence = await ctx.db.get(args.evidenceId);
      if (
        !evidence ||
        evidence.organizationId !== authorization.organizationId ||
        evidence.brokerageId !== authorization.brokerage._id ||
        evidence.verificationSource !== "legacy_note_migration_v1" ||
        !evidence.planToken ||
        !evidence.reportVersion
      ) {
        throw new Error("Migration parity report is unavailable.");
      }
      const buildReports = await ctx.db
        .query("buildCollaborationLegacyNoteParityBuildReports")
        .withIndex("by_evidenceId_and_buildId", (query) =>
          query.eq("evidenceId", evidence._id)
        )
        .collect();
      if (
        buildReports.some(
          (report) =>
            report.organizationId !== authorization.organizationId ||
            report.brokerageId !== authorization.brokerage._id
        )
      ) {
        throw new Error("Migration parity report ownership is inconsistent.");
      }
      return {
        buildReports: buildReports.map((report) => ({
          buildId: report.buildId,
          importedPostCount: report.importedPostCount,
          mismatchCount: report.mismatchCount,
          mismatchDetailsJson: report.mismatchDetailsJson,
          parityPassed: report.parityPassed,
          roleMatrixJson: report.roleMatrixJson,
          sourceRecordCount: report.sourceRecordCount,
        })),
        evidence: {
          evidenceId: evidence._id,
          importedPostCount: evidence.importedPostCount,
          mismatchCount: evidence.mismatchCount,
          parityPassed: evidence.parityPassed,
          planToken: evidence.planToken,
          reportHash: evidence.reportHash,
          reportVersion: evidence.reportVersion,
          sourceRecordCount: evidence.sourceRecordCount,
          verifiedAt: evidence.verifiedAt,
          verifiedByWorkosUserId: evidence.verifiedByWorkosUserId,
        },
      };
    })
    .public();

export const applyBuildCollaborationLegacyNoteMigrationBatch =
  authenticatedMutation
    .input({
      buildId: v.id("activeBuilds"),
      maxNotes: v.optional(v.number()),
      organizationId: v.string(),
      planToken: v.string(),
    })
    .returns(applyResultValidator)
    .handler(async (ctx, args) => {
      const authorization = await authorizeActiveBuildAccess(ctx, args);
      await requireHumanCollaborationActor(ctx, authorization);
      requireTenantOperator(authorization);
      const plan = await computeLegacyNoteMigrationPlan(ctx, authorization);
      requireExactPlanToken(args.planToken, plan.planToken);
      requireApplicablePlan(plan);
      const batchSize = normalizeBatchSize(args.maxNotes);
      const now = Date.now();
      const run = await getOrCreateMigrationRun(ctx, authorization, plan, now);
      if (run.status === "complete") {
        return {
          complete: true,
          nextOffset: run.nextOffset,
          planToken: plan.planToken,
          processedInBatch: 0,
          runId: run._id,
          sourceNoteCount: plan.notes.length,
        };
      }

      const notes = plan.notes.slice(
        run.nextOffset,
        run.nextOffset + batchSize
      );
      for (const note of notes) {
        await importLegacyNote(ctx, authorization, note);
      }
      const nextOffset = run.nextOffset + notes.length;
      const complete = nextOffset >= plan.notes.length;
      await ctx.db.patch(run._id, {
        ...(complete ? { completedAt: now, status: "complete" as const } : {}),
        nextOffset,
        updatedAt: now,
      });
      await recordMigrationAudit(ctx, authorization, {
        command: "applyBuildCollaborationLegacyNoteMigrationBatch",
        entityId: run._id,
        eventType: complete
          ? "build.collaboration.legacy_note_migration.completed"
          : "build.collaboration.legacy_note_migration.batch_applied",
        newState: JSON.stringify({
          complete,
          nextOffset,
          planToken: plan.planToken,
          processedInBatch: notes.length,
          sourceNoteCount: plan.notes.length,
        }),
        now,
      });
      return {
        complete,
        nextOffset,
        planToken: plan.planToken,
        processedInBatch: notes.length,
        runId: run._id,
        sourceNoteCount: plan.notes.length,
      };
    })
    .public();

export const verifyBuildCollaborationLegacyNoteMigrationParity =
  authenticatedMutation
    .input({
      buildId: v.id("activeBuilds"),
      organizationId: v.string(),
      planToken: v.string(),
      reason: v.optional(v.string()),
    })
    .returns(parityResultValidator)
    .handler(async (ctx, args) => {
      const authorization = await authorizeActiveBuildAccess(ctx, args);
      await requireHumanCollaborationActor(ctx, authorization);
      requireTenantOperator(authorization);
      const plan = await computeLegacyNoteMigrationPlan(ctx, authorization);
      requireExactPlanToken(args.planToken, plan.planToken);
      requireApplicablePlan(plan);
      await requireCompletedRun(ctx, authorization, plan);

      const buildReports: Awaited<ReturnType<typeof verifyBuildParity>>[] = [];
      for (const build of plan.builds) {
        buildReports.push(
          await verifyBuildParity(ctx, authorization, plan, build.buildId)
        );
      }
      const sourceRecordCount = plan.notes.length;
      const importedPostCount = buildReports.reduce(
        (total, report) => total + report.importedPostCount,
        0
      );
      const mismatchCount =
        plan.warnings.length +
        buildReports.reduce(
          (total, report) => total + report.mismatchDetails.length,
          0
        );
      const parityPassed =
        sourceRecordCount === importedPostCount && mismatchCount === 0;
      const reportHash = await sha256Hex(
        JSON.stringify({
          buildReports,
          planToken: plan.planToken,
          reportVersion: PARITY_REPORT_VERSION,
          warnings: plan.warnings,
        })
      );
      const now = Date.now();
      const evidenceId = await ctx.db.insert(
        "buildCollaborationMigrationParityEvidence",
        {
          brokerageId: authorization.brokerage._id,
          buildReportCount: buildReports.length,
          importedPostCount,
          mismatchCount,
          organizationId: authorization.organizationId,
          parityPassed,
          planToken: plan.planToken,
          reason: normalizeReason(args.reason),
          reportHash,
          reportVersion: PARITY_REPORT_VERSION,
          sourceRecordCount,
          verificationSource: "legacy_note_migration_v1",
          verifiedAt: now,
          verifiedByWorkosUserId: authorization.viewer.subject,
        }
      );
      for (const report of buildReports) {
        await ctx.db.insert("buildCollaborationLegacyNoteParityBuildReports", {
          brokerageId: authorization.brokerage._id,
          buildId: report.buildId,
          createdAt: now,
          evidenceId,
          importedPostCount: report.importedPostCount,
          mismatchCount: report.mismatchDetails.length,
          mismatchDetailsJson: JSON.stringify(report.mismatchDetails),
          organizationId: authorization.organizationId,
          parityPassed: report.mismatchDetails.length === 0,
          roleMatrixJson: JSON.stringify(report.roleMatrix),
          sourceRecordCount: report.sourceRecordCount,
        });
      }
      await recordMigrationAudit(ctx, authorization, {
        command: "verifyBuildCollaborationLegacyNoteMigrationParity",
        entityId: evidenceId,
        eventType: "build.collaboration.migration_parity.recorded",
        newState: JSON.stringify({
          importedPostCount,
          mismatchCount,
          parityPassed,
          planToken: plan.planToken,
          reportHash,
          sourceRecordCount,
        }),
        now,
        reason: normalizeReason(args.reason),
      });
      return {
        buildReportCount: buildReports.length,
        evidenceId,
        importedPostCount,
        mismatchCount,
        parityPassed,
        planToken: plan.planToken,
        reportHash,
        sourceRecordCount,
      };
    })
    .public();

export async function computeLegacyNoteMigrationPlan(
  ctx: MigrationContext,
  authorization: ActiveBuildAuthorization
): Promise<MigrationPlan> {
  const builds = await ctx.db
    .query("activeBuilds")
    .withIndex("by_organizationId", (query) =>
      query.eq("organizationId", authorization.organizationId)
    )
    .collect();
  builds.sort((left, right) => left._id.localeCompare(right._id));
  const notes = await ctx.db
    .query("buildNotes")
    .withIndex("by_organizationId_and_buildId", (query) =>
      query.eq("organizationId", authorization.organizationId)
    )
    .collect();
  notes.sort((left, right) => left._id.localeCompare(right._id));
  const tenantSetting = await ctx.db
    .query("buildCollaborationTenantSettings")
    .withIndex("by_organizationId", (query) =>
      query.eq("organizationId", authorization.organizationId)
    )
    .first();
  const tenantStatus = tenantSetting?.status ?? "disabled";
  const buildById = new Map(builds.map((build) => [build._id, build]));
  const sourceNotes = notes.map(sourceNotePreview);
  const warnings: MigrationPlan["warnings"] = [];

  if (
    tenantSetting &&
    tenantSetting.brokerageId !== authorization.brokerage._id
  ) {
    warnings.push({
      code: "tenant_setting_brokerage_mismatch",
      message:
        "Collaboration tenant setting ownership does not match the brokerage.",
    });
  }

  for (const build of builds) {
    if (build.brokerageId !== authorization.brokerage._id) {
      warnings.push({
        buildId: build._id,
        code: "build_brokerage_mismatch",
        message: "Build ownership does not match the tenant brokerage.",
      });
    }
  }
  for (const note of notes) {
    const build = buildById.get(note.buildId);
    if (!build) {
      warnings.push({
        buildId: note.buildId,
        code: "source_build_outside_tenant",
        message: "Source note points to a Build outside the requested tenant.",
        sourceNoteId: note._id,
      });
    }
    if (
      note.brokerageId !== authorization.brokerage._id ||
      note.organizationId !== authorization.organizationId
    ) {
      warnings.push({
        buildId: note.buildId,
        code: "source_note_tenant_mismatch",
        message: "Source note ownership does not match the requested tenant.",
        sourceNoteId: note._id,
      });
    }
    if (!resolveEffectiveCollaborationRole(note.authorRoles)) {
      warnings.push({
        buildId: note.buildId,
        code: "source_author_role_unrecognized",
        message: "Source note has no recognized collaboration author role.",
        sourceNoteId: note._id,
      });
    }
  }

  const planToken = `${PLAN_VERSION}:${await sha256Hex(
    JSON.stringify({
      brokerageId: authorization.brokerage._id,
      builds: builds.map((build) => ({
        brokerageId: build.brokerageId,
        buildId: build._id,
        organizationId: build.organizationId,
      })),
      notes: notes.map((note) => ({
        authorRoles: note.authorRoles,
        authorWorkosUserId: note.authorWorkosUserId,
        body: note.body,
        brokerageId: note.brokerageId,
        buildId: note.buildId,
        createdAt: note.createdAt,
        organizationId: note.organizationId,
        sourceNoteId: note._id,
        updatedAt: note.updatedAt,
        visibility: note.visibility,
      })),
      organizationId: authorization.organizationId,
      planVersion: PLAN_VERSION,
      tenantSettingBrokerageId:
        tenantSetting?.brokerageId ?? authorization.brokerage._id,
    })
  )}`;
  return {
    builds: builds.map((build) => ({
      buildId: build._id,
      buildName: build.buildName,
      sourceNoteCount: notes.filter((note) => note.buildId === build._id)
        .length,
    })),
    notes,
    planToken,
    sourceNotes,
    tenantStatus,
    warnings,
  };
}

function presentPlan(
  plan: MigrationPlan,
  authorization: ActiveBuildAuthorization
) {
  return {
    builds: plan.builds,
    planToken: plan.planToken,
    planVersion: PLAN_VERSION,
    sourceNoteCount: plan.notes.length,
    sourceNotes: plan.sourceNotes,
    tenant: {
      brokerageId: authorization.brokerage._id,
      organizationId: authorization.organizationId,
      rolloutStatus: plan.tenantStatus,
    },
    warnings: plan.warnings,
  };
}

function sourceNotePreview(note: LegacyNote) {
  const effectiveRole = resolveEffectiveCollaborationRole(note.authorRoles);
  return {
    audienceFloorTier:
      note.visibility === "public" ? 0 : (effectiveRole?.tier ?? -1),
    audienceMode:
      note.visibility === "public"
        ? ("build_wide" as const)
        : ("author_tier_and_higher" as const),
    authorRole: effectiveRole?.role,
    authorRolesSnapshot: note.authorRoles,
    authorWorkosUserId: note.authorWorkosUserId,
    buildId: note.buildId,
    createdAt: note.createdAt,
    expectedRevision: 1 as const,
    sourceNoteId: note._id,
    updatedAt: note.updatedAt,
    visibility: note.visibility,
  };
}

async function getOrCreateMigrationRun(
  ctx: MutationCtx,
  authorization: ActiveBuildAuthorization,
  plan: MigrationPlan,
  now: number
) {
  const existing = await ctx.db
    .query("buildCollaborationLegacyNoteMigrationRuns")
    .withIndex("by_organizationId_and_planToken", (query) =>
      query
        .eq("organizationId", authorization.organizationId)
        .eq("planToken", plan.planToken)
    )
    .unique();
  if (existing) {
    if (existing.brokerageId !== authorization.brokerage._id) {
      throw new Error("Migration run ownership no longer matches the tenant.");
    }
    return existing;
  }
  const runId = await ctx.db.insert(
    "buildCollaborationLegacyNoteMigrationRuns",
    {
      brokerageId: authorization.brokerage._id,
      createdAt: now,
      nextOffset: 0,
      organizationId: authorization.organizationId,
      planToken: plan.planToken,
      sourceRecordCount: plan.notes.length,
      startedByWorkosUserId: authorization.viewer.subject,
      status: plan.notes.length === 0 ? "complete" : "running",
      ...(plan.notes.length === 0 ? { completedAt: now } : {}),
      updatedAt: now,
    }
  );
  const created = await ctx.db.get(runId);
  if (!created) {
    throw new Error("Migration run could not be created.");
  }
  return created;
}

async function importLegacyNote(
  ctx: MutationCtx,
  authorization: ActiveBuildAuthorization,
  note: LegacyNote
) {
  if (
    note.organizationId !== authorization.organizationId ||
    note.brokerageId !== authorization.brokerage._id
  ) {
    throw new Error("Source note ownership changed after preview.");
  }
  const build = await ctx.db.get(note.buildId);
  if (
    !build ||
    build.organizationId !== authorization.organizationId ||
    build.brokerageId !== authorization.brokerage._id
  ) {
    throw new Error("Source note Build ownership changed after preview.");
  }
  const effectiveRole = resolveEffectiveCollaborationRole(note.authorRoles);
  if (!effectiveRole) {
    throw new Error("Source note author role cannot be preserved.");
  }
  const importedSourceId = importedSourceIdFor(note._id);
  const existing = await ctx.db
    .query("buildCollaborationPosts")
    .withIndex("by_buildId_and_importedSourceId", (query) =>
      query.eq("buildId", note.buildId).eq("importedSourceId", importedSourceId)
    )
    .collect();
  if (existing.length > 1) {
    throw new Error(`Duplicate imported posts exist for ${importedSourceId}.`);
  }
  if (existing[0]) {
    const mismatches = await importedPostMismatches(ctx, note, existing[0]);
    if (mismatches.length > 0) {
      throw new Error(
        `Existing import does not match ${importedSourceId}: ${mismatches.join(", ")}.`
      );
    }
    return;
  }

  const tiptapJson = legacyNoteTiptapJson(note.body);
  const audienceMode =
    note.visibility === "public"
      ? ("build_wide" as const)
      : ("author_tier_and_higher" as const);
  const audienceFloorTier =
    note.visibility === "public" ? 0 : effectiveRole.tier;
  const postId = await ctx.db.insert("buildCollaborationPosts", {
    acknowledgementRequired: false,
    agentDrafted: false,
    announcementProminent: false,
    audienceFloorTier,
    audienceMode,
    authorDisplayNameSnapshot: note.authorWorkosUserId,
    authorRole: effectiveRole.role,
    authorRolesSnapshot: note.authorRoles,
    authorWorkosUserId: note.authorWorkosUserId,
    brokerageId: note.brokerageId,
    buildId: note.buildId,
    commentCount: 0,
    contentState: "active",
    createdAt: note.createdAt,
    importedSourceId,
    lastMeaningfulActivityAt: note.createdAt,
    latestActivityActorWorkosUserId: note.authorWorkosUserId,
    openActionItemCount: 0,
    organizationId: note.organizationId,
    postType: "update",
    readRevision: 1,
    revision: 1,
    source: "imported",
    threadRevision: 0,
    threadState: "open",
    updatedAt: note.updatedAt,
  });
  const revisionId = await ctx.db.insert("buildCollaborationPostRevisions", {
    authorRole: effectiveRole.role,
    authorWorkosUserId: note.authorWorkosUserId,
    brokerageId: note.brokerageId,
    buildId: note.buildId,
    contentHash: stableContentHash(tiptapJson),
    createdAt: note.createdAt,
    organizationId: note.organizationId,
    plainText: note.body,
    postId,
    revision: 1,
    tiptapJson,
  });
  await ctx.db.patch(postId, { currentRevisionId: revisionId });
}

async function verifyBuildParity(
  ctx: MutationCtx,
  authorization: ActiveBuildAuthorization,
  plan: MigrationPlan,
  buildId: Id<"activeBuilds">
) {
  const notes = plan.notes.filter((note) => note.buildId === buildId);
  const mismatchDetails: Array<{
    code: string;
    postId?: Id<"buildCollaborationPosts">;
    sourceNoteId?: Id<"buildNotes">;
  }> = [];
  let importedPostCount = 0;
  for (const note of notes) {
    const posts = await ctx.db
      .query("buildCollaborationPosts")
      .withIndex("by_buildId_and_importedSourceId", (query) =>
        query
          .eq("buildId", buildId)
          .eq("importedSourceId", importedSourceIdFor(note._id))
      )
      .collect();
    importedPostCount += posts.length;
    if (posts.length !== 1) {
      mismatchDetails.push({
        code: posts.length === 0 ? "missing_import" : "duplicate_import",
        sourceNoteId: note._id,
      });
      continue;
    }
    for (const code of await importedPostMismatches(ctx, note, posts[0])) {
      mismatchDetails.push({
        code,
        postId: posts[0]._id,
        sourceNoteId: note._id,
      });
    }
  }
  const knownSourceIds = new Set(
    notes.map((note) => importedSourceIdFor(note._id))
  );
  const buildPosts = await ctx.db
    .query("buildCollaborationPosts")
    .withIndex("by_buildId_and_createdAt", (query) =>
      query.eq("buildId", buildId)
    )
    .collect();
  for (const post of buildPosts) {
    if (
      post.organizationId === authorization.organizationId &&
      post.importedSourceId?.startsWith("buildNote:") &&
      !knownSourceIds.has(post.importedSourceId)
    ) {
      mismatchDetails.push({ code: "orphan_import", postId: post._id });
      importedPostCount += 1;
    }
  }
  const roleMatrix = notes.map((note) => {
    const preview = sourceNotePreview(note);
    return {
      audienceFloorTier: preview.audienceFloorTier,
      audienceMode: preview.audienceMode,
      readableBy: Object.fromEntries(
        buildCollaborationRoles.map((role) => [
          role,
          canRoleReadImportedNote(
            role,
            preview.audienceMode,
            preview.audienceFloorTier
          ),
        ])
      ),
      sourceNoteId: note._id,
      visibility: note.visibility,
    };
  });
  return {
    buildId,
    importedPostCount,
    mismatchDetails,
    roleMatrix,
    sourceRecordCount: notes.length,
  };
}

async function importedPostMismatches(
  ctx: MigrationContext,
  note: LegacyNote,
  post: Doc<"buildCollaborationPosts">
) {
  const mismatches: string[] = [];
  const effectiveRole = resolveEffectiveCollaborationRole(note.authorRoles);
  const expectedMode =
    note.visibility === "public" ? "build_wide" : "author_tier_and_higher";
  const expectedFloor = note.visibility === "public" ? 0 : effectiveRole?.tier;
  if (
    post.organizationId !== note.organizationId ||
    post.brokerageId !== note.brokerageId ||
    post.buildId !== note.buildId
  ) {
    mismatches.push("tenant_or_build_mismatch");
  }
  if (
    post.source !== "imported" ||
    post.postType !== "update" ||
    post.importedSourceId !== importedSourceIdFor(note._id)
  ) {
    mismatches.push("import_identity_mismatch");
  }
  if (
    post.audienceMode !== expectedMode ||
    post.audienceFloorTier !== expectedFloor
  ) {
    mismatches.push("audience_mapping_mismatch");
  }
  if (
    post.authorWorkosUserId !== note.authorWorkosUserId ||
    post.authorRole !== effectiveRole?.role ||
    JSON.stringify(post.authorRolesSnapshot) !==
      JSON.stringify(note.authorRoles)
  ) {
    mismatches.push("author_snapshot_mismatch");
  }
  if (
    post.createdAt !== note.createdAt ||
    post.updatedAt !== note.updatedAt ||
    post.lastMeaningfulActivityAt !== note.createdAt
  ) {
    mismatches.push("timestamp_mismatch");
  }
  if (post.revision !== 1 || !post.currentRevisionId) {
    mismatches.push("current_revision_mismatch");
    return mismatches;
  }
  const revisions = await ctx.db
    .query("buildCollaborationPostRevisions")
    .withIndex("by_postId_and_revision", (query) =>
      query.eq("postId", post._id)
    )
    .collect();
  if (revisions.length !== 1 || revisions[0]._id !== post.currentRevisionId) {
    mismatches.push("revision_count_mismatch");
    return mismatches;
  }
  const tiptapJson = legacyNoteTiptapJson(note.body);
  const revision = revisions[0];
  if (
    revision.revision !== 1 ||
    revision.plainText !== note.body ||
    revision.tiptapJson !== tiptapJson ||
    revision.contentHash !== stableContentHash(tiptapJson) ||
    revision.authorWorkosUserId !== note.authorWorkosUserId ||
    revision.authorRole !== effectiveRole?.role ||
    revision.createdAt !== note.createdAt
  ) {
    mismatches.push("revision_content_mismatch");
  }
  return mismatches;
}

function canRoleReadImportedNote(
  role: BuildCollaborationRole,
  audienceMode: "author_tier_and_higher" | "build_wide",
  audienceFloorTier: number
) {
  if (audienceMode === "build_wide") {
    return true;
  }
  return (
    resolveEffectiveCollaborationRole([role])?.tier !== undefined &&
    (resolveEffectiveCollaborationRole([role])?.tier ?? -1) >= audienceFloorTier
  );
}

async function requireCompletedRun(
  ctx: MutationCtx,
  authorization: ActiveBuildAuthorization,
  plan: MigrationPlan
) {
  const run = await ctx.db
    .query("buildCollaborationLegacyNoteMigrationRuns")
    .withIndex("by_organizationId_and_planToken", (query) =>
      query
        .eq("organizationId", authorization.organizationId)
        .eq("planToken", plan.planToken)
    )
    .unique();
  if (
    !run ||
    run.brokerageId !== authorization.brokerage._id ||
    run.status !== "complete" ||
    run.nextOffset !== plan.notes.length
  ) {
    throw new Error("Parity verification requires a completed migration run.");
  }
}

function requireTenantOperator(authorization: ActiveBuildAuthorization) {
  if (
    authorization.effectiveRole.role !== "admin" &&
    authorization.effectiveRole.role !== "principle-broker"
  ) {
    throw new Error(
      "Only an administrator or principal broker can operate the legacy-note migration."
    );
  }
}

function requireApplicablePlan(plan: MigrationPlan) {
  if (plan.tenantStatus === "active") {
    throw new Error("Legacy notes cannot be migrated after tenant activation.");
  }
  if (plan.warnings.length > 0) {
    throw new Error(
      "Migration preview contains blocking warnings; correct source ownership or role data and preview again."
    );
  }
}

function requireExactPlanToken(provided: string, expected: string) {
  if (provided !== expected) {
    throw new Error(
      "Migration plan changed after preview; generate a new preview and confirm its exact plan token."
    );
  }
}

function normalizeBatchSize(value?: number) {
  const batchSize = value ?? MAX_NOTES_PER_BATCH;
  if (
    !Number.isSafeInteger(batchSize) ||
    batchSize < 1 ||
    batchSize > MAX_NOTES_PER_BATCH
  ) {
    throw new Error(
      `Migration batches must contain between 1 and ${MAX_NOTES_PER_BATCH} notes.`
    );
  }
  return batchSize;
}

function importedSourceIdFor(sourceNoteId: Id<"buildNotes">) {
  return `buildNote:${sourceNoteId}`;
}

function legacyNoteTiptapJson(body: string) {
  return JSON.stringify({
    content: [
      {
        content: body ? [{ text: body, type: "text" }] : [],
        type: "paragraph",
      },
    ],
    type: "doc",
  });
}

async function sha256Hex(value: string) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value)
  );
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function normalizeReason(reason?: string) {
  const normalized = reason?.trim();
  return normalized || undefined;
}

async function recordMigrationAudit(
  ctx: MutationCtx,
  authorization: ActiveBuildAuthorization,
  input: {
    command: string;
    entityId: string;
    eventType: string;
    newState: string;
    now: number;
    reason?: string;
  }
) {
  await ctx.db.insert("auditEvents", {
    actorRoles: authorization.roles,
    actorWorkosUserId: authorization.viewer.subject,
    brokerageId: authorization.brokerage._id,
    command: input.command,
    createdAt: input.now,
    entityId: input.entityId,
    entityType: "buildCollaborationLegacyNoteMigration",
    eventType: input.eventType,
    newState: input.newState,
    organizationId: authorization.organizationId,
    reason: input.reason,
    warnings: [],
  });
}
