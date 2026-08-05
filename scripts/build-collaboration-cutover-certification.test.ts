import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, test } from "vitest";

import {
  REQUIRED_BUILD_COLLABORATION_CUTOVER_COMMANDS,
  REQUIRED_BUILD_COLLABORATION_MONITORS,
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
import {
  buildCollaborationBuildPath,
  REQUIRED_BUILD_COLLABORATION_ROLES,
} from "./build-collaboration-personas";

const context = {
  applicationUrl: "https://drawflow.example.com",
  applicationVersion: "release-2026-08-01",
  convexDeployment: "fairlend:drawflow:prod",
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
    artifactAttestations: [],
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

function validManifest(
  directory: string,
  live = liveState()
) {
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
  const migration = {
    applicationArtifact: artifact(directory, "migration-application", { completedAt, schemaVersion: "build-collaboration-migration-artifact/v1", stage: "application", status: "passed" }),
    parityArtifact: artifact(directory, "migration-parity", { ...live.evidence, completedAt, schemaVersion: "build-collaboration-migration-artifact/v1", stage: "parity", status: "passed" }),
    previewArtifact: artifact(directory, "migration-preview", { completedAt, schemaVersion: "build-collaboration-migration-artifact/v1", stage: "preview", status: "passed" }),
    replayArtifact: artifact(directory, "migration-replay", { completedAt, schemaVersion: "build-collaboration-migration-artifact/v1", stage: "replay", status: "passed" }),
  };
  const manifest = {
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
    migration,
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
            ...e2eEvidence(directory),
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
  live.artifactAttestations = [
    attestation("migration_preview", migration.previewArtifact.sha256),
    attestation("migration_application", migration.applicationArtifact.sha256),
    attestation("migration_replay", migration.replayArtifact.sha256),
    attestation("migration_parity", migration.parityArtifact.sha256),
    attestation("manual_visual_review", commands.visualReview.sha256),
    attestation("manual_keyboard_review", commands.keyboardReview.sha256),
  ];
  return manifest;
}

function attestation(
  kind: BuildCollaborationCutoverLiveState["artifactAttestations"][number]["kind"],
  artifactSha256: string
) {
  return {
    artifactSha256,
    attestedByRoles: ["admin"],
    attestedByWorkosUserId: "user_admin",
    attestationId: `attestation_${kind}`,
    createdAt: 1_754_046_900_000,
    kind,
    rehearsalId: "rehearsal_123",
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
    const evidencePath = join(directory, `${commandName}-evidence.png`);
    const evidenceBytes = `reviewed-${commandName}`;
    writeFileSync(evidencePath, evidenceBytes);
    return {
      ...common,
      evidence: [{
        path: evidencePath,
        sha256: createHash("sha256").update(evidenceBytes).digest("hex"),
      }],
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
    ...(commandName === "playwrightRoleJourneys"
      ? e2eEvidence(directory)
      : {}),
    command: serializeCommand(argv ?? []),
    mode: "automated",
    producer: BUILD_COLLABORATION_CUTOVER_GATE_RUNNER,
    stderrPath: stderr.path,
    stderrSha256: stderr.sha256,
    stdoutPath: stdout.path,
    stdoutSha256: stdout.sha256,
  };
}

function e2eEvidence(directory: string) {
  const roles = [...REQUIRED_BUILD_COLLABORATION_ROLES];
  const storageStates = roles.map((role) => {
    const path = join(directory, `storage-${role}.json`);
    const contents = JSON.stringify({ cookies: [{ name: "auth", role }] });
    writeFileSync(path, contents);
    return {
      path,
      role,
      sha256: createHash("sha256").update(contents).digest("hex"),
    };
  });
  const fixturePath = join(directory, "e2e-fixture.json");
  const fixtureSource = JSON.stringify({
    applicationUrl: context.applicationUrl,
    buildId: context.representativeBuildId,
    organizationId: context.organizationId,
    personas: roles.map((role, index) => ({
      buildUrl: `${context.applicationUrl}${buildCollaborationBuildPath(role, context.representativeBuildId)}?focus=actionItem:action_${index}`,
      role,
      storageState: storageStates[index].path,
      workosUserId: `user_${role.replaceAll("-", "_")}`,
    })),
  });
  writeFileSync(fixturePath, fixtureSource);
  return {
    fixturePath,
    fixtureSha256: createHash("sha256").update(fixtureSource).digest("hex"),
    storageStates,
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
    const live = liveState();
    expect(validateBuildCollaborationCutoverEvidence(validManifest(directory, live), directory, live)).toEqual([]);
  });

  test("rejects fabricated hash-valid artifacts, stale parity, and missing live state", () => {
    const directory = mkdtempSync(join(tmpdir(), "drawflow-cutover-invalid-"));
    const stale = liveState() as any;
    const manifest = validManifest(directory, stale) as any;
    manifest.commands.fullTestSuite = artifact(directory, "forged-command", {
      ...commandEvidence(
        "fullTestSuite",
        "2026-08-01T12:00:00.000Z",
        directory
      ),
      command: "bun run fake-tests",
      producer: "operator-authored-json/v1",
    });
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
    const invalid = liveState();
    const manifest = validManifest(directory, invalid);
    invalid.rollbackRehearsal!.disabledCutoverEpoch = 3;
    invalid.rollbackRehearsal!.afterSnapshot.posts = digest("replacement");
    const errors = validateBuildCollaborationCutoverEvidence(manifest, directory, invalid);
    expect(errors).toEqual(expect.arrayContaining([
      expect.stringContaining("cutover epoch"),
      expect.stringContaining("Tenant-wide stable-ID/content digests"),
    ]));
  });

  test("rejects tampered manual evidence and an artifact attestation mismatch", () => {
    const directory = mkdtempSync(join(tmpdir(), "drawflow-cutover-provenance-"));
    const live = liveState();
    const manifest = validManifest(directory, live) as any;
    const visualArtifact = JSON.parse(
      readFileSync(manifest.commands.visualReview.path, "utf8")
    );
    writeFileSync(visualArtifact.evidence[0].path, "tampered-after-review");
    const preview = live.artifactAttestations.find(
      (candidate) => candidate.kind === "migration_preview"
    );
    if (preview) {
      preview.artifactSha256 = "f".repeat(64);
    }
    const errors = validateBuildCollaborationCutoverEvidence(
      manifest,
      directory,
      live
    );
    expect(errors).toEqual(
      expect.arrayContaining([
        expect.stringContaining("visualReview evidence 0 hash does not match"),
        expect.stringContaining(
          "migration preview artifact hash does not match its server attestation"
        ),
      ])
    );
  });
});
