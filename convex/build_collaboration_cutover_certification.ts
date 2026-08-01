import { v } from "convex/values";

import { authenticatedQuery } from "./authz";
import {
  authorizeLegacyNoteOperator,
  sha256Hex,
} from "./build_collaboration_legacy_note_shared";
import type { Doc, QueryCtx } from "./types";

const MAX_BUILD_RECORDS_PER_COLLECTION = 5000;
const MAX_TENANT_AUDIT_EVENTS = 10_000;

type RetainedCollection =
  | "assets"
  | "auditEvents"
  | "posts"
  | "receipts"
  | "revisions";

export const getBuildCollaborationCutoverCertificationState = authenticatedQuery
  .input({
    buildId: v.id("activeBuilds"),
    organizationId: v.string(),
  })
  .returns(v.any())
  .handler(async (ctx, args) => {
    const authorization = await authorizeLegacyNoteOperator(ctx, args);
    const setting = await ctx.db
      .query("buildCollaborationTenantSettings")
      .withIndex("by_organizationId", (query) =>
        query.eq("organizationId", authorization.organizationId)
      )
      .unique();
    if (!setting || setting.brokerageId !== authorization.brokerage._id) {
      throw new Error("Build Collaboration tenant state is unavailable.");
    }

    const evidence = await ctx.db
      .query("buildCollaborationMigrationParityEvidence")
      .withIndex("by_organizationId_and_verifiedAt", (query) =>
        query.eq("organizationId", authorization.organizationId)
      )
      .order("desc")
      .first();
    const migration = evidence?.migrationRunId
      ? await ctx.db.get(evidence.migrationRunId)
      : null;
    const parityRun = evidence?.parityRunId
      ? await ctx.db.get(evidence.parityRunId)
      : null;
    const latestBuild = await ctx.db
      .query("activeBuilds")
      .withIndex("by_organizationId", (query) =>
        query.eq("organizationId", authorization.organizationId)
      )
      .order("desc")
      .first();

    const [posts, revisions, assets, receipts, auditEvents] = await Promise.all(
      [
        takeBuildRows(
          ctx,
          "buildCollaborationPosts",
          args.buildId,
          MAX_BUILD_RECORDS_PER_COLLECTION
        ),
        takeBuildRows(
          ctx,
          "buildCollaborationPostRevisions",
          args.buildId,
          MAX_BUILD_RECORDS_PER_COLLECTION
        ),
        takeBuildRows(
          ctx,
          "buildCollaborationAssets",
          args.buildId,
          MAX_BUILD_RECORDS_PER_COLLECTION
        ),
        takeBuildRows(
          ctx,
          "buildCollaborationReceipts",
          args.buildId,
          MAX_BUILD_RECORDS_PER_COLLECTION
        ),
        ctx.db
          .query("auditEvents")
          .withIndex("by_brokerage", (query) =>
            query.eq("brokerageId", authorization.brokerage._id)
          )
          .filter((query) =>
            query.eq(
              query.field("organizationId"),
              authorization.organizationId
            )
          )
          .take(MAX_TENANT_AUDIT_EVENTS + 1),
      ]
    );
    assertWithinLimit("auditEvents", auditEvents, MAX_TENANT_AUDIT_EVENTS);

    return {
      evidence:
        evidence &&
        evidence.brokerageId === authorization.brokerage._id &&
        evidence.verificationSource === "legacy_note_migration_v1" &&
        evidence.migrationRunId &&
        evidence.parityRunId &&
        evidence.planToken &&
        evidence.reportVersion &&
        evidence.buildReportCount !== undefined &&
        evidence.cutoverEpoch !== undefined
          ? {
              buildReportCount: evidence.buildReportCount,
              cutoverEpoch: evidence.cutoverEpoch,
              evidenceId: evidence._id,
              importedPostCount: evidence.importedPostCount,
              migrationRunId: evidence.migrationRunId,
              mismatchCount: evidence.mismatchCount,
              parityPassed: evidence.parityPassed,
              parityRunId: evidence.parityRunId,
              planToken: evidence.planToken,
              reportHash: evidence.reportHash,
              reportVersion: evidence.reportVersion,
              sourceRecordCount: evidence.sourceRecordCount,
              verifiedAt: evidence.verifiedAt,
              verifiedByWorkosUserId: evidence.verifiedByWorkosUserId,
            }
          : null,
      latestBuild: latestBuild
        ? {
            buildId: latestBuild._id,
            creationTime: latestBuild._creationTime,
          }
        : null,
      migration:
        migration &&
        migration.organizationId === authorization.organizationId &&
        migration.latestBuildId &&
        migration.latestBuildCreationTime !== undefined
          ? {
              latestBuildCreationTime: migration.latestBuildCreationTime,
              latestBuildId: migration.latestBuildId,
              planToken: migration.planToken,
              processedBuildCount: migration.processedBuildCount,
              runId: migration._id,
              status: migration.status,
            }
          : null,
      observedAt: Date.now(),
      observedByWorkosUserId: authorization.viewer.subject,
      organizationId: authorization.organizationId,
      parityRun:
        parityRun &&
        parityRun.organizationId === authorization.organizationId &&
        parityRun.evidenceId
          ? {
              evidenceId: parityRun.evidenceId,
              importedPostCount: parityRun.importedPostCount,
              mismatchCount: parityRun.mismatchCount,
              migrationRunId: parityRun.migrationRunId,
              parityRunId: parityRun._id,
              sourceRecordCount: parityRun.sourceRecordCount,
              status: parityRun.status,
            }
          : null,
      representativeBuildId: authorization.build._id,
      legacyWritePolicy: {
        allowed: setting.status === "disabled" && !migration,
        reasonCode:
          setting.status !== "disabled" || migration
            ? "LEGACY_NOTES_RETIRED"
            : "LEGACY_NOTES_WRITE_ALLOWED",
      },
      retainedSnapshot: {
        assets: await stableRecords(assets),
        auditEvents: await stableRecords(auditEvents),
        posts: await stableRecords(posts),
        receipts: await stableRecords(receipts),
        revisions: await stableRecords(revisions),
      },
      schemaVersion: "build-collaboration-cutover-live-state/v1",
      rolloutTransitions: auditEvents
        .filter(
          (event) =>
            event.entityId === setting._id &&
            event.command === "transitionBuildCollaborationTenantStatus" &&
            event.eventType === "build.collaboration.tenant_status.changed"
        )
        .map((event) => ({
          actorWorkosUserId: event.actorWorkosUserId,
          createdAt: event.createdAt,
          newState: parseAuditState(event.newState),
          priorState: parseAuditState(event.priorState),
        })),
      tenant: {
        activatedAt: setting.activatedAt,
        activatedByWorkosUserId: setting.activatedByWorkosUserId,
        cutoverEpoch: setting.cutoverEpoch ?? 0,
        status: setting.status,
      },
    };
  })
  .public();

async function takeBuildRows(
  ctx: QueryCtx,
  table:
    | "buildCollaborationAssets"
    | "buildCollaborationPosts"
    | "buildCollaborationPostRevisions"
    | "buildCollaborationReceipts",
  buildId: Doc<"activeBuilds">["_id"],
  limit: number
) {
  const rows = await ctx.db
    .query(table)
    .filter((query) => query.eq(query.field("buildId"), buildId))
    .take(limit + 1);
  assertWithinLimit(table, rows, limit);
  return rows;
}

function assertWithinLimit(collection: string, rows: unknown[], limit: number) {
  if (rows.length > limit) {
    throw new Error(
      `${collection} exceeds the generous ${limit}-record certification limit; certify with the paged operator export instead.`
    );
  }
}

async function stableRecords(
  rows: Array<{ _creationTime: number; _id: string }>
) {
  return await Promise.all(
    [...rows]
      .sort((left, right) => left._id.localeCompare(right._id))
      .map(async (row) => ({
        id: row._id,
        sha256: await sha256Hex(JSON.stringify(row)),
      }))
  );
}

export const buildCollaborationCutoverCertificationLimits: Record<
  RetainedCollection,
  number
> = {
  assets: MAX_BUILD_RECORDS_PER_COLLECTION,
  auditEvents: MAX_TENANT_AUDIT_EVENTS,
  posts: MAX_BUILD_RECORDS_PER_COLLECTION,
  receipts: MAX_BUILD_RECORDS_PER_COLLECTION,
  revisions: MAX_BUILD_RECORDS_PER_COLLECTION,
};

function parseAuditState(value?: string) {
  if (!value) {
    return null;
  }
  try {
    const parsed: unknown = JSON.parse(value);
    return parsed !== null && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}
