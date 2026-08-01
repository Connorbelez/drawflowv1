import { createHash } from "node:crypto";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, test } from "vitest";

import {
  REQUIRED_BUILD_COLLABORATION_CUTOVER_COMMANDS,
  REQUIRED_BUILD_COLLABORATION_MONITORS,
  REQUIRED_BUILD_COLLABORATION_ROLES,
  type BuildCollaborationCutoverLiveState,
  validateBuildCollaborationCutoverEvidence,
} from "./build-collaboration-cutover-certification";

const context = {
  applicationVersion: "release-2026-08-01",
  convexDeployment: "prod:example",
  gitCommit: "0123456789abcdef0123456789abcdef01234567",
  organizationId: "org_fairlend",
  representativeBuildId: "build_123",
};
const record = (id: string) => ({ id, sha256: createHash("sha256").update(id).digest("hex") });
const snapshot = () => ({
  assets: [record("asset_1")],
  auditEvents: [record("audit_1")],
  posts: [record("post_1")],
  receipts: [record("receipt_1")],
  revisions: [record("revision_1")],
});

function artifact(directory: string, name: string, contents: Record<string, unknown>) {
  const path = join(directory, `${name}.json`);
  const source = JSON.stringify({ ...context, ...contents });
  writeFileSync(path, source);
  return { path, sha256: createHash("sha256").update(source).digest("hex") };
}

function liveState(): BuildCollaborationCutoverLiveState {
  return {
    evidence: {
      buildReportCount: 2,
      cutoverEpoch: 4,
      evidenceId: "evidence_123",
      importedPostCount: 4,
      migrationRunId: "migration_123",
      mismatchCount: 0,
      parityPassed: true,
      parityRunId: "parity_123",
      planToken: "build-collaboration-legacy-notes/v2:token",
      reportHash: "a".repeat(64),
      reportVersion: "build-collaboration-legacy-note-parity/v2",
      sourceRecordCount: 4,
      verifiedAt: 1_754_046_000_000,
      verifiedByWorkosUserId: "user_admin",
    },
    latestBuild: { buildId: "build_latest", creationTime: 1_754_045_000_000 },
    migration: {
      latestBuildCreationTime: 1_754_045_000_000,
      latestBuildId: "build_latest",
      planToken: "build-collaboration-legacy-notes/v2:token",
      processedBuildCount: 2,
      runId: "migration_123",
      status: "complete",
    },
    observedAt: 1_754_047_000_000,
    observedByWorkosUserId: "user_admin",
    organizationId: context.organizationId,
    legacyWritePolicy: {
      allowed: false,
      reasonCode: "LEGACY_NOTES_RETIRED",
    },
    parityRun: {
      evidenceId: "evidence_123",
      importedPostCount: 4,
      mismatchCount: 0,
      migrationRunId: "migration_123",
      parityRunId: "parity_123",
      sourceRecordCount: 4,
      status: "complete",
    },
    representativeBuildId: context.representativeBuildId,
    retainedSnapshot: { ...snapshot(), auditEvents: [record("audit_1"), record("audit_2")] },
    rolloutTransitions: [
      {
        actorWorkosUserId: "user_admin",
        createdAt: 1_754_046_100_000,
        newState: { cutoverEpoch: 4, status: "disabled" },
        priorState: { status: "active" },
      },
      {
        actorWorkosUserId: "user_admin",
        createdAt: 1_754_046_500_000,
        newState: { cutoverEpoch: 4, status: "active" },
        priorState: { status: "migration_ready" },
      },
    ],
    schemaVersion: "build-collaboration-cutover-live-state/v1",
    tenant: {
      activatedAt: 1_754_046_500_000,
      activatedByWorkosUserId: "user_admin",
      cutoverEpoch: 4,
      status: "active",
    },
  };
}

function validManifest(directory: string) {
  const live = liveState();
  const completedAt = "2026-08-01T12:00:00.000Z";
  return {
    activation: artifact(directory, "activation", {
      activatedAt: live.tenant.activatedAt,
      actorWorkosUserId: "user_admin",
      cutoverEpoch: 4,
      schemaVersion: "build-collaboration-activation-evidence/v1",
      status: "active",
    }),
    commands: Object.fromEntries(REQUIRED_BUILD_COLLABORATION_CUTOVER_COMMANDS.map((commandName) => [commandName, artifact(directory, `command-${commandName}`, {
      command: `bun run ${commandName}`,
      commandName,
      completedAt,
      exitCode: 0,
      schemaVersion: "build-collaboration-command-evidence/v1",
    })])),
    interface: artifact(directory, "interface", {
      buildOverviewUnchanged: true,
      canonicalTabsOwnContent: true,
      detailsIsDefault: true,
      legacyNotesRetired: true,
      schemaVersion: "build-collaboration-interface-evidence/v1",
      status: "passed",
    }),
    migration: {
      applicationArtifact: artifact(directory, "migration-application", { completedAt, schemaVersion: "build-collaboration-migration-artifact/v1", stage: "application", status: "passed" }),
      parityArtifact: artifact(directory, "migration-parity", { ...live.evidence, completedAt, schemaVersion: "build-collaboration-migration-artifact/v1", stage: "parity", status: "passed" }),
      previewArtifact: artifact(directory, "migration-preview", { completedAt, schemaVersion: "build-collaboration-migration-artifact/v1", stage: "preview", status: "passed" }),
      replayArtifact: artifact(directory, "migration-replay", { completedAt, schemaVersion: "build-collaboration-migration-artifact/v1", stage: "replay", status: "passed" }),
    },
    monitoring: Object.fromEntries(REQUIRED_BUILD_COLLABORATION_MONITORS.map((name) => [name, `https://monitor.example.com/${name}`])),
    organizationId: context.organizationId,
    release: {
      applicationDeploymentUrl: "https://drawflow.example.com",
      applicationVersion: context.applicationVersion,
      convexDeployment: context.convexDeployment,
      gitCommit: context.gitCommit,
    },
    representativeBuildId: context.representativeBuildId,
    rollback: artifact(directory, "rollback", {
      after: { cutoverEpoch: 4, snapshot: { ...snapshot(), auditEvents: [record("audit_1"), record("audit_2")] }, status: "active" },
      before: { cutoverEpoch: 3, snapshot: snapshot(), status: "active" },
      disabled: { cutoverEpoch: 4, status: "disabled" },
      legacyWriteProbe: { denied: true, errorCode: "LEGACY_NOTES_RETIRED" },
      schemaVersion: "build-collaboration-rollback-evidence/v1",
      status: "passed",
    }),
    schemaVersion: "build-collaboration-cutover-evidence/v2",
    smokeJourneys: Object.fromEntries(REQUIRED_BUILD_COLLABORATION_ROLES.map((role) => [role, artifact(directory, `smoke-${role}`, { completedAt, role, schemaVersion: "build-collaboration-smoke-evidence/v1", status: "passed" })])),
  };
}

describe("Build Collaboration cutover evidence certification", () => {
  test("accepts typed evidence cross-checked against authenticated production state", () => {
    const directory = mkdtempSync(join(tmpdir(), "drawflow-cutover-valid-"));
    expect(validateBuildCollaborationCutoverEvidence(validManifest(directory), directory, liveState())).toEqual([]);
  });

  test("rejects fabricated hash-valid artifacts, stale parity, and missing live state", () => {
    const directory = mkdtempSync(join(tmpdir(), "drawflow-cutover-invalid-"));
    const manifest = validManifest(directory) as any;
    manifest.commands.fullTestSuite = artifact(directory, "forged-command", { command: "bun run test", commandName: "targetedTests", completedAt: "2026-08-01T12:00:00.000Z", exitCode: 0, schemaVersion: "build-collaboration-command-evidence/v1" });
    const stale = liveState() as any;
    stale.migration.latestBuildId = "older_build";
    const errors = validateBuildCollaborationCutoverEvidence(manifest, directory, stale);
    expect(errors).toEqual(expect.arrayContaining([
      expect.stringContaining("fullTestSuite commandName"),
      expect.stringContaining("parity is stale"),
    ]));
    expect(validateBuildCollaborationCutoverEvidence(manifest, directory)).toContain("Authenticated production live state is required for certification.");
  });

  test("rejects rollback record replacement and a non-incrementing epoch", () => {
    const directory = mkdtempSync(join(tmpdir(), "drawflow-cutover-rollback-"));
    const manifest = validManifest(directory) as any;
    manifest.rollback = artifact(directory, "invalid-rollback", {
      after: { cutoverEpoch: 3, snapshot: { ...snapshot(), posts: [record("replacement_post")] }, status: "active" },
      before: { cutoverEpoch: 3, snapshot: snapshot(), status: "active" },
      disabled: { cutoverEpoch: 3, status: "disabled" },
      legacyWriteProbe: { denied: true, errorCode: "LEGACY_NOTES_RETIRED" },
      schemaVersion: "build-collaboration-rollback-evidence/v1",
      status: "passed",
    });
    const errors = validateBuildCollaborationCutoverEvidence(manifest, directory, liveState());
    expect(errors).toEqual(expect.arrayContaining([
      expect.stringContaining("cutover epoch"),
      expect.stringContaining("posts stable IDs"),
    ]));
  });
});
