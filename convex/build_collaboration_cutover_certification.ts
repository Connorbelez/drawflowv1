import { v } from "convex/values";

import { authenticatedQuery } from "./authz";
import { authorizeLegacyNoteOperator } from "./build_collaboration_legacy_note_shared";
import type { Doc, Id } from "./types";

const CUTOVER_ARTIFACT_ATTESTATION_KINDS = [
  "migration_preview",
  "migration_application",
  "migration_replay",
  "migration_parity",
  "manual_visual_review",
  "manual_keyboard_review",
] as const;

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
    const companionCutover = await ctx.db
      .query("buildSubmilestoneCompanionCutoverRuns")
      .withIndex("by_buildId_and_updatedAt", (query) =>
        query.eq("buildId", authorization.build._id)
      )
      .order("desc")
      .first();
    const latestBuild = await ctx.db
      .query("activeBuilds")
      .withIndex("by_organizationId", (query) =>
        query.eq("organizationId", authorization.organizationId)
      )
      .order("desc")
      .first();
    const rehearsal = await ctx.db
      .query("buildCollaborationCutoverRehearsals")
      .withIndex("by_organizationId_and_createdAt", (query) =>
        query.eq("organizationId", authorization.organizationId)
      )
      .order("desc")
      .first();
    const beforeSnapshot = rehearsal?.beforeSnapshotId
      ? await ctx.db.get(rehearsal.beforeSnapshotId)
      : null;
    const afterSnapshot = rehearsal?.afterSnapshotId
      ? await ctx.db.get(rehearsal.afterSnapshotId)
      : null;
    const artifactAttestations = rehearsal
      ? (
          await Promise.all(
            CUTOVER_ARTIFACT_ATTESTATION_KINDS.map((kind) =>
              ctx.db
                .query("buildCollaborationCutoverArtifactAttestations")
                .withIndex("by_rehearsalId_and_kind_and_createdAt", (query) =>
                  query.eq("rehearsalId", rehearsal._id).eq("kind", kind)
                )
                .order("desc")
                .first()
            )
          )
        ).filter(
          (attestation): attestation is NonNullable<typeof attestation> =>
            Boolean(
              attestation &&
                attestation.organizationId === authorization.organizationId &&
                attestation.brokerageId === authorization.brokerage._id &&
                attestation.representativeBuildId === authorization.build._id
            )
        )
      : [];
    const rolloutEvents = await ctx.db
      .query("auditEvents")
      .withIndex("by_entity", (query) =>
        query
          .eq("entityType", "buildCollaborationTenantSettings")
          .eq("entityId", setting._id)
      )
      .order("desc")
      .take(20);

    return {
      artifactAttestations: artifactAttestations.map((attestation) => ({
        artifactSha256: attestation.artifactSha256,
        attestedByRoles: attestation.attestedByRoles,
        attestedByWorkosUserId: attestation.attestedByWorkosUserId,
        attestationId: attestation._id,
        createdAt: attestation.createdAt,
        kind: attestation.kind,
        rehearsalId: attestation.rehearsalId,
      })),
      companionCutover:
        companionCutover &&
        companionCutover.organizationId === authorization.organizationId &&
        companionCutover.brokerageId === authorization.brokerage._id
          ? {
              activeSubmilestoneCount: companionCutover.activeSubmilestoneCount,
              exceptionCount: companionCutover.exceptionCount,
              generatedCompanionCount: companionCutover.generatedCompanionCount,
              manualActionItemCount: companionCutover.manualActionItemCount,
              materializedCount: companionCutover.materializedCount,
              parityMismatchCount: companionCutover.parityMismatchCount,
              planToken: companionCutover.planToken,
              repairedCount: companionCutover.repairedCount,
              reportCount: companionCutover.reportCount,
              reportHash: companionCutover.reportHash,
              runId: companionCutover._id,
              status: companionCutover.status,
            }
          : null,
      evidence: projectEvidence(evidence, authorization.brokerage._id),
      latestBuild: latestBuild
        ? { buildId: latestBuild._id, creationTime: latestBuild._creationTime }
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
      release: rehearsal
        ? {
            applicationUrl: rehearsal.releaseApplicationUrl,
            applicationVersion: rehearsal.releaseApplicationVersion,
            convexDeployment: rehearsal.releaseConvexDeployment,
            convexUrl: rehearsal.releaseConvexUrl,
            gitCommit: rehearsal.releaseGitCommit,
          }
        : null,
      representativeBuildId: authorization.build._id,
      rollbackRehearsal:
        rehearsal && beforeSnapshot && afterSnapshot
          ? {
              afterSnapshot: projectSnapshot(afterSnapshot),
              beforeCutoverEpoch: rehearsal.beforeCutoverEpoch,
              beforeSnapshot: projectSnapshot(beforeSnapshot),
              completedAt: rehearsal.completedAt,
              disabledCutoverEpoch: rehearsal.disabledCutoverEpoch,
              disabledVerifiedAt: rehearsal.disabledVerifiedAt,
              legacyWriteDenialError: rehearsal.legacyWriteDenialError,
              legacyWriteDeniedAt: rehearsal.legacyWriteDeniedAt,
              rehearsalId: rehearsal._id,
              requestedByWorkosUserId: rehearsal.requestedByWorkosUserId,
              status: rehearsal.status,
            }
          : null,
      rolloutTransitions: rolloutEvents.map((event) => ({
        actorWorkosUserId: event.actorWorkosUserId,
        createdAt: event.createdAt,
        newState: parseAuditState(event.newState),
        priorState: parseAuditState(event.priorState),
      })),
      schemaVersion: "build-collaboration-cutover-live-state/v2",
      tenant: {
        activatedAt: setting.activatedAt,
        activatedByWorkosUserId: setting.activatedByWorkosUserId,
        cutoverEpoch: setting.cutoverEpoch ?? 0,
        status: setting.status,
      },
    };
  })
  .public();

function projectEvidence(
  evidence: Doc<"buildCollaborationMigrationParityEvidence"> | null,
  brokerageId: Id<"brokerages">
) {
  if (
    !evidence ||
    evidence.brokerageId !== brokerageId ||
    evidence.verificationSource !== "legacy_note_migration_v1" ||
    !evidence.migrationRunId ||
    !evidence.parityRunId ||
    !evidence.planToken ||
    !evidence.reportVersion ||
    evidence.buildReportCount === undefined ||
    evidence.cutoverEpoch === undefined
  ) {
    return null;
  }
  return {
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
  };
}

function projectSnapshot(snapshot: {
  _id: string;
  assetsCount?: number;
  assetsHash?: string;
  auditCutoffAt: number;
  auditEventsCount?: number;
  auditEventsHash?: string;
  completedAt?: number;
  postsCount?: number;
  postsHash?: string;
  receiptsCount?: number;
  receiptsHash?: string;
  revisionsCount?: number;
  revisionsHash?: string;
  status: string;
}) {
  return {
    assets: { count: snapshot.assetsCount, sha256: snapshot.assetsHash },
    auditCutoffAt: snapshot.auditCutoffAt,
    auditEvents: {
      count: snapshot.auditEventsCount,
      sha256: snapshot.auditEventsHash,
    },
    completedAt: snapshot.completedAt,
    posts: { count: snapshot.postsCount, sha256: snapshot.postsHash },
    receipts: { count: snapshot.receiptsCount, sha256: snapshot.receiptsHash },
    revisions: {
      count: snapshot.revisionsCount,
      sha256: snapshot.revisionsHash,
    },
    snapshotId: snapshot._id,
    status: snapshot.status,
  };
}

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
