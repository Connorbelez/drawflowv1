import { createHash } from "node:crypto";
import {
  existsSync,
  readFileSync,
  renameSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";

export const REQUIRED_BUILD_COLLABORATION_ROLES = [
  "admin",
  "principle-broker",
  "broker",
  "builder",
  "broker-staff",
  "builder-staff",
  "homeowner",
  "contractor",
] as const;

export const REQUIRED_BUILD_COLLABORATION_CUTOVER_COMMANDS = [
  "convexCodegen",
  "convexTypecheck",
  "targetedTests",
  "fullTestSuite",
  "applicationTypecheck",
  "productionBuild",
  "uiHtmlAudit",
  "deploymentParity",
  "warningCheck",
  "playwrightRoleJourneys",
  "visualReview",
  "keyboardReview",
] as const;

export const REQUIRED_BUILD_COLLABORATION_MONITORS = [
  "authorizationDenials",
  "disclosureAlarms",
  "deliveryFanout",
  "idempotency",
  "staleApprovals",
  "revisionConflicts",
  "migrationParity",
  "searchLatency",
  "feedPagination",
  "overdueScheduling",
] as const;

const RETAINED_ROLLBACK_COLLECTIONS = [
  "posts",
  "revisions",
  "assets",
  "receipts",
  "auditEvents",
] as const;
const PLACEHOLDER_PATTERN =
  /ACTIVE_BUILD_ID|ACTION_ITEM_ID|<[^>]+>|(?:^|[_\W])(?:TODO|TBD|UNKNOWN|PLACEHOLDER|REPLACE(?:D|_ME)?|YOUR)(?:$|[_\W])/i;
const SHA256_PATTERN = /^[a-f0-9]{64}$/i;

type JsonObject = Record<string, unknown>;

export function validateBuildCollaborationCutoverEvidence(
  input: unknown,
  manifestDirectory: string
) {
  const errors: string[] = [];
  const manifest = asObject(input);
  if (!manifest) {
    return ["Cutover evidence must be a JSON object."];
  }

  requireExactString(
    errors,
    manifest,
    "schemaVersion",
    "build-collaboration-cutover-evidence/v1"
  );
  requireText(errors, manifest, "organizationId");
  requireText(errors, manifest, "representativeBuildId");

  const release = requireObject(errors, manifest, "release");
  if (release) {
    requireText(errors, release, "gitCommit", {
      label: "release.gitCommit",
      pattern: /^[a-f0-9]{40}$/i,
    });
    requireText(errors, release, "applicationVersion", {
      label: "release.applicationVersion",
    });
    requireText(errors, release, "convexDeployment", {
      label: "release.convexDeployment",
    });
    requireText(errors, release, "applicationDeploymentUrl", {
      label: "release.applicationDeploymentUrl",
      pattern: /^https:\/\//,
    });
  }

  const migration = requireObject(errors, manifest, "migration");
  if (migration) {
    requireText(errors, migration, "planToken");
    requireText(errors, migration, "runId");
    requireText(errors, migration, "parityRunId");
    requireText(errors, migration, "evidenceId");
    requireExactString(
      errors,
      migration,
      "reportVersion",
      "build-collaboration-legacy-note-parity/v2",
      "migration.reportVersion"
    );
    const sourceRecordCount = requireNonNegativeNumber(
      errors,
      migration,
      "sourceRecordCount",
      "migration.sourceRecordCount"
    );
    const importedPostCount = requireNonNegativeNumber(
      errors,
      migration,
      "importedPostCount",
      "migration.importedPostCount"
    );
    const mismatchCount = requireNonNegativeNumber(
      errors,
      migration,
      "mismatchCount",
      "migration.mismatchCount"
    );
    requireNonNegativeNumber(
      errors,
      migration,
      "buildCount",
      "migration.buildCount"
    );
    if (
      migration.parityPassed !== true ||
      mismatchCount !== 0 ||
      sourceRecordCount === undefined ||
      sourceRecordCount !== importedPostCount
    ) {
      errors.push(
        "Migration parity must pass with zero mismatches and equal source/imported counts."
      );
    }
    for (const artifactName of [
      "previewArtifact",
      "applicationArtifact",
      "replayArtifact",
      "parityArtifact",
    ]) {
      validateArtifact(
        errors,
        migration[artifactName],
        manifestDirectory,
        `migration ${artifactName}`
      );
    }
  }

  const commands = requireObject(errors, manifest, "commands");
  if (commands) {
    for (const commandName of REQUIRED_BUILD_COLLABORATION_CUTOVER_COMMANDS) {
      const command = asObject(commands[commandName]);
      if (!command) {
        errors.push(`Missing ${commandName} command evidence.`);
        continue;
      }
      if (command.exitCode !== 0) {
        errors.push(`${commandName} command did not pass with exit code 0.`);
      }
      validateArtifact(
        errors,
        command.artifact,
        manifestDirectory,
        `${commandName} command`
      );
    }
  }

  const smokeJourneys = requireObject(errors, manifest, "smokeJourneys");
  if (smokeJourneys) {
    for (const role of REQUIRED_BUILD_COLLABORATION_ROLES) {
      const journey = asObject(smokeJourneys[role]);
      if (!journey) {
        errors.push(`Missing ${role} smoke journey evidence.`);
        continue;
      }
      if (journey.status !== "passed") {
        errors.push(`${role} smoke journey did not pass.`);
      }
      validateArtifact(
        errors,
        journey.artifact,
        manifestDirectory,
        `${role} smoke journey`
      );
    }
  }

  const interfaceEvidence = requireObject(errors, manifest, "interface");
  if (interfaceEvidence) {
    if (interfaceEvidence.status !== "passed") {
      errors.push("Production interface verification did not pass.");
    }
    for (const invariant of [
      "detailsIsDefault",
      "buildOverviewUnchanged",
      "canonicalTabsOwnContent",
      "legacyNotesRetired",
    ]) {
      if (interfaceEvidence[invariant] !== true) {
        errors.push(`Production interface invariant ${invariant} is not true.`);
      }
    }
    validateArtifact(
      errors,
      interfaceEvidence.artifact,
      manifestDirectory,
      "interface"
    );
  }

  const monitoring = requireObject(errors, manifest, "monitoring");
  if (monitoring) {
    for (const monitor of REQUIRED_BUILD_COLLABORATION_MONITORS) {
      requireText(errors, monitoring, monitor, {
        label: `${monitor} monitoring link`,
      });
    }
  }

  validateActivation(errors, manifest.activation, manifestDirectory);
  validateRollback(errors, manifest.rollback, manifestDirectory);
  return errors;
}

function validateActivation(
  errors: string[],
  value: unknown,
  manifestDirectory: string
) {
  const activation = requireObject(errors, { activation: value }, "activation");
  if (!activation) {
    return;
  }
  if (activation.status !== "active") {
    errors.push("Tenant activation status is not active.");
  }
  const actorWorkosUserId = requireText(
    errors,
    activation,
    "actorWorkosUserId",
    { label: "activation.actorWorkosUserId" }
  );
  if (actorWorkosUserId && /^(?:agent|system):/i.test(actorWorkosUserId)) {
    errors.push("Activation actor must be a human WorkOS user.");
  }
  const activatedAt = requireText(errors, activation, "activatedAt");
  if (activatedAt && Number.isNaN(Date.parse(activatedAt))) {
    errors.push("activation.activatedAt must be an ISO-8601 timestamp.");
  }
  validateArtifact(
    errors,
    activation.artifact,
    manifestDirectory,
    "activation"
  );
}

function validateRollback(
  errors: string[],
  value: unknown,
  manifestDirectory: string
) {
  const rollback = requireObject(errors, { rollback: value }, "rollback");
  if (!rollback) {
    return;
  }
  if (rollback.status !== "passed") {
    errors.push("Rollback rehearsal did not pass.");
  }
  if (rollback.legacyWritesRemainDisabled !== true) {
    errors.push("Rollback rehearsal re-enabled a legacy Note write path.");
  }
  const before = requireObject(errors, rollback, "retainedCountsBefore");
  const after = requireObject(errors, rollback, "retainedCountsAfter");
  if (before && after) {
    for (const collection of RETAINED_ROLLBACK_COLLECTIONS) {
      const beforeCount = requireNonNegativeNumber(
        errors,
        before,
        collection,
        `rollback.retainedCountsBefore.${collection}`
      );
      const afterCount = requireNonNegativeNumber(
        errors,
        after,
        collection,
        `rollback.retainedCountsAfter.${collection}`
      );
      if (
        beforeCount !== undefined &&
        afterCount !== undefined &&
        beforeCount !== afterCount
      ) {
        errors.push(`${collection} changed during rollback rehearsal.`);
      }
    }
  }
  validateArtifact(errors, rollback.artifact, manifestDirectory, "rollback");
}

function validateArtifact(
  errors: string[],
  value: unknown,
  manifestDirectory: string,
  label: string
) {
  const artifact = asObject(value);
  if (!artifact) {
    errors.push(`Missing ${label} artifact.`);
    return;
  }
  const artifactPath = requireText(errors, artifact, "path", {
    label: `${label} artifact path`,
  });
  const expectedHash = requireText(errors, artifact, "sha256", {
    label: `${label} artifact sha256`,
    pattern: SHA256_PATTERN,
  });
  if (!(artifactPath && expectedHash)) {
    return;
  }
  const resolvedPath = isAbsolute(artifactPath)
    ? artifactPath
    : resolve(manifestDirectory, artifactPath);
  if (!existsSync(resolvedPath) || !statSync(resolvedPath).isFile()) {
    errors.push(`${label} artifact does not exist: ${artifactPath}.`);
    return;
  }
  const actualHash = createHash("sha256")
    .update(readFileSync(resolvedPath))
    .digest("hex");
  if (actualHash !== expectedHash.toLowerCase()) {
    errors.push(`${label} artifact hash does not match ${artifactPath}.`);
  }
}

function requireObject(
  errors: string[],
  parent: JsonObject,
  key: string
) {
  const value = asObject(parent[key]);
  if (!value) {
    errors.push(`Missing ${key} evidence object.`);
  }
  return value;
}

function requireText(
  errors: string[],
  parent: JsonObject,
  key: string,
  options?: { label?: string; pattern?: RegExp }
) {
  const label = options?.label ?? key;
  const value = parent[key];
  if (
    typeof value !== "string" ||
    !value.trim() ||
    PLACEHOLDER_PATTERN.test(value.trim())
  ) {
    errors.push(`${label} must be a non-placeholder string.`);
    return undefined;
  }
  if (options?.pattern && !options.pattern.test(value.trim())) {
    errors.push(`${label} has an invalid format.`);
    return undefined;
  }
  return value.trim();
}

function requireExactString(
  errors: string[],
  parent: JsonObject,
  key: string,
  expected: string,
  label = key
) {
  if (parent[key] !== expected) {
    errors.push(`${label} must equal ${expected}.`);
  }
}

function requireNonNegativeNumber(
  errors: string[],
  parent: JsonObject,
  key: string,
  label: string
) {
  const value = parent[key];
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    errors.push(`${label} must be a non-negative integer.`);
    return undefined;
  }
  return value;
}

function asObject(value: unknown): JsonObject | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonObject)
    : undefined;
}

async function main() {
  const manifestPath = argumentValue("--manifest");
  const outputPath = argumentValue("--output");
  if (!manifestPath) {
    console.error(
      "Usage: bun scripts/build-collaboration-cutover-certification.ts --manifest <evidence.json> [--output <deployment-record.json>]"
    );
    process.exitCode = 2;
    return;
  }
  const absoluteManifestPath = resolve(manifestPath);
  let source: string;
  let manifest: unknown;
  try {
    source = readFileSync(absoluteManifestPath, "utf8");
    manifest = JSON.parse(source);
  } catch (error) {
    console.error(
      `Could not read cutover evidence manifest: ${error instanceof Error ? error.message : String(error)}`
    );
    process.exitCode = 2;
    return;
  }
  const errors = validateBuildCollaborationCutoverEvidence(
    manifest,
    dirname(absoluteManifestPath)
  );
  if (errors.length > 0) {
    console.error("Build Collaboration cutover certification failed:");
    for (const error of errors) {
      console.error(`- ${error}`);
    }
    process.exitCode = 1;
    return;
  }
  const certifiedRecord = {
    ...(manifest as JsonObject),
    certification: {
      certifiedAt: new Date().toISOString(),
      evidenceManifestSha256: createHash("sha256").update(source).digest("hex"),
      validatorVersion: "build-collaboration-cutover-certifier/v1",
    },
  };
  const absoluteOutputPath = resolve(
    outputPath ??
      resolve(dirname(absoluteManifestPath), "deployment-record.certified.json")
  );
  const temporaryPath = `${absoluteOutputPath}.${process.pid}.tmp`;
  writeFileSync(temporaryPath, `${JSON.stringify(certifiedRecord, null, 2)}\n`, {
    mode: 0o600,
  });
  renameSync(temporaryPath, absoluteOutputPath);
  console.log(`Certified Build Collaboration cutover evidence: ${absoluteOutputPath}`);
}

function argumentValue(name: string) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

if (import.meta.main) {
  await main();
}
