import { createHash } from "node:crypto";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, test } from "vitest";

import {
  REQUIRED_BUILD_COLLABORATION_CUTOVER_COMMANDS,
  REQUIRED_BUILD_COLLABORATION_MONITORS,
  REQUIRED_BUILD_COLLABORATION_ROLES,
  validateBuildCollaborationCutoverEvidence,
} from "./build-collaboration-cutover-certification";

function artifact(directory: string, name: string) {
  const path = join(directory, `${name}.json`);
  const contents = JSON.stringify({ name, passed: true });
  writeFileSync(path, contents);
  return {
    path,
    sha256: createHash("sha256").update(contents).digest("hex"),
  };
}

function validManifest(directory: string) {
  const retainedCounts = {
    assets: 3,
    auditEvents: 42,
    posts: 8,
    receipts: 12,
    revisions: 11,
  };
  return {
    activation: {
      actorWorkosUserId: "user_admin",
      artifact: artifact(directory, "activation"),
      activatedAt: "2026-08-01T12:00:00.000Z",
      status: "active",
    },
    commands: Object.fromEntries(
      REQUIRED_BUILD_COLLABORATION_CUTOVER_COMMANDS.map((name) => [
        name,
        { artifact: artifact(directory, `command-${name}`), exitCode: 0 },
      ])
    ),
    interface: {
      artifact: artifact(directory, "interface"),
      buildOverviewUnchanged: true,
      canonicalTabsOwnContent: true,
      detailsIsDefault: true,
      legacyNotesRetired: true,
      status: "passed",
    },
    migration: {
      applicationArtifact: artifact(directory, "migration-application"),
      buildCount: 2,
      evidenceId: "evidence_123",
      importedPostCount: 4,
      mismatchCount: 0,
      parityArtifact: artifact(directory, "migration-parity"),
      parityPassed: true,
      parityRunId: "parity_123",
      planToken: "sha256:plan-token",
      previewArtifact: artifact(directory, "migration-preview"),
      replayArtifact: artifact(directory, "migration-replay"),
      reportVersion: "build-collaboration-legacy-note-parity/v2",
      runId: "migration_123",
      sourceRecordCount: 4,
    },
    monitoring: Object.fromEntries(
      REQUIRED_BUILD_COLLABORATION_MONITORS.map((name) => [
        name,
        `https://monitor.example.com/${name}`,
      ])
    ),
    organizationId: "org_fairlend",
    release: {
      applicationDeploymentUrl: "https://drawflow.example.com",
      applicationVersion: "release-2026-08-01",
      convexDeployment: "prod:example",
      gitCommit: "0123456789abcdef0123456789abcdef01234567",
    },
    representativeBuildId: "build_123",
    rollback: {
      artifact: artifact(directory, "rollback"),
      legacyWritesRemainDisabled: true,
      retainedCountsAfter: { ...retainedCounts },
      retainedCountsBefore: { ...retainedCounts },
      status: "passed",
    },
    schemaVersion: "build-collaboration-cutover-evidence/v1",
    smokeJourneys: Object.fromEntries(
      REQUIRED_BUILD_COLLABORATION_ROLES.map((role) => [
        role,
        { artifact: artifact(directory, `smoke-${role}`), status: "passed" },
      ])
    ),
  };
}

describe("Build Collaboration cutover evidence certification", () => {
  test("accepts a complete, hash-verified production deployment record", () => {
    const directory = mkdtempSync(join(tmpdir(), "drawflow-cutover-valid-"));
    expect(
      validateBuildCollaborationCutoverEvidence(
        validManifest(directory),
        directory
      )
    ).toEqual([]);
  });

  test("rejects missing role, monitoring, parity, rollback, and artifact evidence", () => {
    const directory = mkdtempSync(join(tmpdir(), "drawflow-cutover-invalid-"));
    const manifest = validManifest(directory) as any;
    delete manifest.smokeJourneys.contractor;
    delete manifest.monitoring.disclosureAlarms;
    manifest.migration.mismatchCount = 1;
    manifest.migration.parityPassed = false;
    manifest.rollback.retainedCountsAfter.posts = 7;
    manifest.activation.artifact.sha256 = "0".repeat(64);

    const errors = validateBuildCollaborationCutoverEvidence(
      manifest,
      directory
    );
    expect(errors).toEqual(
      expect.arrayContaining([
        expect.stringContaining("contractor smoke journey"),
        expect.stringContaining("disclosureAlarms monitoring link"),
        expect.stringContaining("parity must pass"),
        expect.stringContaining("posts changed during rollback"),
        expect.stringContaining("activation artifact hash does not match"),
      ])
    );
  });

  test("rejects placeholders and non-zero release gates", () => {
    const directory = mkdtempSync(join(tmpdir(), "drawflow-cutover-placeholder-"));
    const manifest = validManifest(directory) as any;
    manifest.release.applicationVersion = "<todo>";
    manifest.release.applicationDeploymentUrl = "https://<production-host>";
    manifest.commands.fullTestSuite.exitCode = 1;
    manifest.activation.actorWorkosUserId = "agent:cutover";

    const errors = validateBuildCollaborationCutoverEvidence(
      manifest,
      directory
    );
    expect(errors).toEqual(
      expect.arrayContaining([
        expect.stringContaining("release.applicationVersion"),
        expect.stringContaining("release.applicationDeploymentUrl"),
        expect.stringContaining("fullTestSuite command did not pass"),
        expect.stringContaining("human WorkOS user"),
      ])
    );
  });
});
