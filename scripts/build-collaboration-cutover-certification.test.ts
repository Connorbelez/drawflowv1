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
import {
  BUILD_COLLABORATION_CUTOVER_GATE_RUNNER,
  BUILD_COLLABORATION_INTERFACE_RUNNER,
  BUILD_COLLABORATION_MANUAL_REVIEW_RUNNER,
  BUILD_COLLABORATION_SMOKE_RUNNER,
  buildCollaborationCutoverGateArgv,
  buildCollaborationRoleSmokeArgv,
  isManualBuildCollaborationCutoverGate,
  serializeCommand,
  type BuildCollaborationCutoverGate,
} from "./build-collaboration-cutover-gates";

const context = {
  applicationUrl: "https://drawflow.example.com",
  applicationVersion: "release-2026-08-01",
  convexDeployment: "example-production",
  convexUrl: "https://example.convex.cloud",
  forbiddenOrganizationId: "org_forbidden",
  gitCommit: "0123456789abcdef0123456789abcdef01234567",
  organizationId: "org_fairlend",
  representativeBuildId: "build_123",
};
const digest = (name: string, count = 1) => ({
  count,
  sha256: createHash("sha256").update(name).digest("hex"),
});
const snapshot = () => ({
  assets: digest("assets"),
  auditCutoffAt: 1_754_046_000_000,
  auditEvents: digest("auditEvents"),
  completedAt: 1_754_046_050_000,
  posts: digest("posts"),
  receipts: digest("receipts"),
  revisions: digest("revisions"),
  snapshotId: "snapshot_before",
  status: "complete",
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
    parityRun: {
      evidenceId: "evidence_123",
      importedPostCount: 4,
      mismatchCount: 0,
      migrationRunId: "migration_123",
      parityRunId: "parity_123",
      sourceRecordCount: 4,
      status: "complete",
    },
    release: {
      applicationUrl: context.applicationUrl,
      applicationVersion: context.applicationVersion,
      convexDeployment: context.convexDeployment,
      convexUrl: context.convexUrl,
      gitCommit: context.gitCommit,
    },
    representativeBuildId: context.representativeBuildId,
    rollbackRehearsal: {
      afterSnapshot: { ...snapshot(), snapshotId: "snapshot_after" },
      beforeCutoverEpoch: 3,
      beforeSnapshot: snapshot(),
      completedAt: 1_754_046_300_000,
      disabledCutoverEpoch: 4,
      disabledVerifiedAt: 1_754_046_150_000,
      legacyWriteDenialError:
        "Public/Internal Notes are retired. Publish a governed collaboration post instead.",
      legacyWriteDeniedAt: 1_754_046_150_000,
      rehearsalId: "rehearsal_123",
      requestedByWorkosUserId: "user_admin",
      status: "complete",
    },
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
    schemaVersion: "build-collaboration-cutover-live-state/v2",
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
  const commands = Object.fromEntries(
    REQUIRED_BUILD_COLLABORATION_CUTOVER_COMMANDS.map((commandName) => [
      commandName,
      artifact(
        directory,
        `command-${commandName}`,
        commandEvidence(commandName, completedAt, directory)
      ),
    ])
  );
  return {
    activation: artifact(directory, "activation", {
      activatedAt: live.tenant.activatedAt,
      actorWorkosUserId: "user_admin",
      cutoverEpoch: 4,
      schemaVersion: "build-collaboration-activation-evidence/v1",
      status: "active",
    }),
    commands,
    forbiddenOrganizationId: context.forbiddenOrganizationId,
    interface: artifact(directory, "interface", {
      buildOverviewUnchanged: true,
      canonicalTabsOwnContent: true,
      completedAt,
      detailsIsDefault: true,
      gitHead: context.gitCommit,
      keyboardReviewSha256: commands.keyboardReview.sha256,
      legacyNotesRetired: true,
      producer: BUILD_COLLABORATION_INTERFACE_RUNNER,
      schemaVersion: "build-collaboration-interface-evidence/v2",
      startedAt: completedAt,
      status: "passed",
      visualReviewSha256: commands.visualReview.sha256,
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
      applicationUrl: context.applicationUrl,
      applicationVersion: context.applicationVersion,
      convexDeployment: context.convexDeployment,
      convexUrl: context.convexUrl,
      gitCommit: context.gitCommit,
    },
    representativeBuildId: context.representativeBuildId,
    rollback: artifact(directory, "rollback", {
      rehearsalId: "rehearsal_123",
      schemaVersion: "build-collaboration-rollback-evidence/v2",
      status: "passed",
    }),
    schemaVersion: "build-collaboration-cutover-evidence/v2",
    smokeJourneys: Object.fromEntries(
      REQUIRED_BUILD_COLLABORATION_ROLES.map((role) => {
        const stdout = outputEvidence(directory, `${role}-stdout`, "stdout");
        const stderr = outputEvidence(directory, `${role}-stderr`, "stderr");
        return [
          role,
          artifact(directory, `smoke-${role}`, {
            command: serializeCommand(buildCollaborationRoleSmokeArgv(role)),
            completedAt,
            exitCode: 0,
            gitHead: context.gitCommit,
            producer: BUILD_COLLABORATION_SMOKE_RUNNER,
            role,
            schemaVersion: "build-collaboration-smoke-evidence/v2",
            startedAt: completedAt,
            status: "passed",
            stderrPath: stderr.path,
            stderrSha256: stderr.sha256,
            stdoutPath: stdout.path,
            stdoutSha256: stdout.sha256,
          }),
        ];
      })
    ),
  };
}

function commandEvidence(
  commandName: BuildCollaborationCutoverGate,
  completedAt: string,
  directory: string
) {
  const common = {
    commandName,
    completedAt,
    exitCode: 0,
    gitHead: context.gitCommit,
    schemaVersion: "build-collaboration-command-evidence/v2",
    startedAt: completedAt,
  };
  if (isManualBuildCollaborationCutoverGate(commandName)) {
    return {
      ...common,
      evidence: [{ path: `/evidence/${commandName}.png`, sha256: "b".repeat(64) }],
      mode: "human_review",
      producer: BUILD_COLLABORATION_MANUAL_REVIEW_RUNNER,
      reviewerWorkosUserId: "user_admin",
    };
  }
  const argv = buildCollaborationCutoverGateArgv(commandName, context);
  const stdout = outputEvidence(directory, `${commandName}-stdout`, "stdout");
  const stderr = outputEvidence(directory, `${commandName}-stderr`, "stderr");
  return {
    ...common,
    command: serializeCommand(argv ?? []),
    mode: "automated",
    producer: BUILD_COLLABORATION_CUTOVER_GATE_RUNNER,
    stderrPath: stderr.path,
    stderrSha256: stderr.sha256,
    stdoutPath: stdout.path,
    stdoutSha256: stdout.sha256,
  };
}

function outputEvidence(directory: string, name: string, contents: string) {
  const path = join(directory, `${name}.log`);
  writeFileSync(path, contents);
  return {
    path,
    sha256: createHash("sha256").update(contents).digest("hex"),
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
    manifest.commands.fullTestSuite = artifact(directory, "forged-command", {
      ...commandEvidence(
        "fullTestSuite",
        "2026-08-01T12:00:00.000Z",
        directory
      ),
      command: "bun run fake-tests",
      producer: "operator-authored-json/v1",
    });
    const stale = liveState() as any;
    stale.migration.latestBuildId = "older_build";
    const errors = validateBuildCollaborationCutoverEvidence(manifest, directory, stale);
    expect(errors).toEqual(expect.arrayContaining([
      expect.stringContaining("fullTestSuite command"),
      expect.stringContaining("fullTestSuite producer"),
      expect.stringContaining("parity is stale"),
    ]));
    expect(validateBuildCollaborationCutoverEvidence(manifest, directory)).toContain("Authenticated production live state is required for certification.");
  });

  test("rejects rollback record replacement and a non-incrementing epoch", () => {
    const directory = mkdtempSync(join(tmpdir(), "drawflow-cutover-rollback-"));
    const manifest = validManifest(directory);
    const invalid = liveState();
    invalid.rollbackRehearsal!.disabledCutoverEpoch = 3;
    invalid.rollbackRehearsal!.afterSnapshot.posts = digest("replacement");
    const errors = validateBuildCollaborationCutoverEvidence(manifest, directory, invalid);
    expect(errors).toEqual(expect.arrayContaining([
      expect.stringContaining("cutover epoch"),
      expect.stringContaining("Tenant-wide stable-ID/content digests"),
    ]));
  });
});
