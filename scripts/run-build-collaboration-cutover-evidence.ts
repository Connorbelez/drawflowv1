import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, renameSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { validateBuildCollaborationE2EFixture } from "./build-collaboration-cutover-fixture";
import {
  BUILD_COLLABORATION_INTERFACE_RUNNER,
  BUILD_COLLABORATION_MANUAL_REVIEW_RUNNER,
  BUILD_COLLABORATION_SMOKE_RUNNER,
  buildCollaborationRoleSmokeArgv,
  isProductionConvexDeployment,
  serializeCommand,
} from "./build-collaboration-cutover-gates";

const ROLES = [
  "admin",
  "principle-broker",
  "broker",
  "builder",
  "broker-staff",
  "builder-staff",
  "homeowner",
  "contractor",
] as const;
const GIT_SHA_PATTERN = /^[a-f0-9]{40}$/i;
const SHA256_PATTERN = /^[a-f0-9]{64}$/i;

type Role = (typeof ROLES)[number];

interface EvidenceArguments {
  keyboardPath?: string;
  kind?: string;
  manifestPath?: string;
  outputPath?: string;
  role?: string;
  visualPath?: string;
}

interface Manifest {
  forbiddenOrganizationId: string;
  organizationId: string;
  release: {
    applicationUrl: string;
    applicationVersion: string;
    convexDeployment: string;
    convexUrl: string;
    gitCommit: string;
  };
  representativeBuildId: string;
}

function sha256(input: string | Buffer) {
  return createHash("sha256").update(input).digest("hex");
}

function parseArguments(argv: string[]) {
  const parsed: EvidenceArguments = {};
  for (let index = 0; index < argv.length; index += 2) {
    const value = argv[index + 1];
    if (!value) {
      throw new Error(`Missing value for ${argv[index]}.`);
    }
    switch (argv[index]) {
      case "--kind":
        parsed.kind = value;
        break;
      case "--manifest":
        parsed.manifestPath = value;
        break;
      case "--output":
        parsed.outputPath = value;
        break;
      case "--role":
        parsed.role = value;
        break;
      case "--visual-evidence":
        parsed.visualPath = value;
        break;
      case "--keyboard-evidence":
        parsed.keyboardPath = value;
        break;
      default:
        throw new Error(`Unknown evidence-runner argument: ${argv[index]}`);
    }
  }
  return parsed;
}

function readManifest(path: string): Manifest {
  const manifest = JSON.parse(readFileSync(resolve(path), "utf8")) as Manifest;
  if (
    !(
      manifest.organizationId &&
      manifest.forbiddenOrganizationId &&
      manifest.representativeBuildId &&
      manifest.release?.applicationUrl?.startsWith("https://") &&
      manifest.release.applicationVersion &&
      isProductionConvexDeployment(manifest.release.convexDeployment ?? "") &&
      manifest.release.convexUrl?.startsWith("https://") &&
      GIT_SHA_PATTERN.test(manifest.release.gitCommit)
    )
  ) {
    throw new Error("Cutover evidence manifest release scope is invalid.");
  }
  return manifest;
}

function verifyGitHead(gitCommit: string) {
  const result = spawnSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" });
  if (result.status !== 0 || result.stdout.trim() !== gitCommit) {
    throw new Error(
      "Evidence runner Git HEAD does not match the manifest release."
    );
  }
  return result.stdout.trim();
}

function writeArtifact(path: string, artifact: Record<string, unknown>) {
  const target = resolve(path);
  const temporary = `${target}.tmp-${process.pid}`;
  writeFileSync(temporary, `${JSON.stringify(artifact, null, 2)}\n`);
  renameSync(temporary, target);
}

function writeCommandOutput(outputPath: string, suffix: string, value: string) {
  const path = `${resolve(outputPath)}.${suffix}.log`;
  writeFileSync(path, value);
  return { path, sha256: sha256(value) };
}

function readManualReview(
  path: string,
  expectedCommandName: string,
  expectedScope: Record<string, string>
) {
  const source = readFileSync(resolve(path));
  const artifact = JSON.parse(source.toString("utf8")) as Record<
    string,
    unknown
  >;
  if (
    artifact.commandName !== expectedCommandName ||
    artifact.producer !== BUILD_COLLABORATION_MANUAL_REVIEW_RUNNER ||
    artifact.exitCode !== 0 ||
    artifact.schemaVersion !== "build-collaboration-command-evidence/v2" ||
    typeof artifact.reviewerWorkosUserId !== "string" ||
    !(Array.isArray(artifact.evidence) && artifact.evidence.length > 0) ||
    Object.entries(expectedScope).some(
      ([key, value]) => artifact[key] !== value
    )
  ) {
    throw new Error(`${expectedCommandName} is not governed passing evidence.`);
  }
  const hash = sha256(source);
  if (!SHA256_PATTERN.test(hash)) {
    throw new Error("Evidence hash failed.");
  }
  return hash;
}

export function runBuildCollaborationCutoverEvidence(argv: string[]) {
  const args = parseArguments(argv);
  if (!(args.manifestPath && args.outputPath)) {
    throw new Error("--manifest and --output are required.");
  }
  const manifest = readManifest(args.manifestPath);
  const gitHead = verifyGitHead(manifest.release.gitCommit);
  const common = {
    ...manifest.release,
    forbiddenOrganizationId: manifest.forbiddenOrganizationId,
    gitHead,
    organizationId: manifest.organizationId,
    representativeBuildId: manifest.representativeBuildId,
  };
  const startedAt = new Date().toISOString();
  if (args.kind === "smoke") {
    if (!(args.role && ROLES.includes(args.role as Role))) {
      throw new Error("Smoke evidence requires an approved --role.");
    }
    const command = buildCollaborationRoleSmokeArgv(args.role);
    const e2eEvidence = validateBuildCollaborationE2EFixture(common);
    const result = spawnSync(command[0], command.slice(1), {
      encoding: "utf8",
      env: process.env,
      maxBuffer: 64 * 1024 * 1024,
      stdio: ["inherit", "pipe", "pipe"],
    });
    if (result.status !== 0) {
      process.stdout.write(result.stdout ?? "");
      process.stderr.write(result.stderr ?? "");
      throw new Error(
        `Smoke journey failed with exit code ${result.status ?? -1}.`
      );
    }
    const stdout = writeCommandOutput(
      args.outputPath,
      "stdout",
      result.stdout ?? ""
    );
    const stderr = writeCommandOutput(
      args.outputPath,
      "stderr",
      result.stderr ?? ""
    );
    writeArtifact(args.outputPath, {
      ...common,
      ...e2eEvidence,
      command: serializeCommand(command),
      completedAt: new Date().toISOString(),
      exitCode: 0,
      producer: BUILD_COLLABORATION_SMOKE_RUNNER,
      role: args.role,
      schemaVersion: "build-collaboration-smoke-evidence/v2",
      startedAt,
      status: "passed",
      stderrPath: stderr.path,
      stderrSha256: stderr.sha256,
      stdoutPath: stdout.path,
      stdoutSha256: stdout.sha256,
    });
    return;
  }
  if (args.kind === "interface") {
    if (!(args.visualPath && args.keyboardPath)) {
      throw new Error(
        "Interface evidence requires --visual-evidence and --keyboard-evidence."
      );
    }
    writeArtifact(args.outputPath, {
      ...common,
      buildOverviewUnchanged: true,
      canonicalTabsOwnContent: true,
      completedAt: new Date().toISOString(),
      detailsIsDefault: true,
      keyboardReviewSha256: readManualReview(
        args.keyboardPath,
        "keyboardReview",
        common
      ),
      legacyNotesRetired: true,
      producer: BUILD_COLLABORATION_INTERFACE_RUNNER,
      schemaVersion: "build-collaboration-interface-evidence/v2",
      startedAt,
      status: "passed",
      visualReviewSha256: readManualReview(
        args.visualPath,
        "visualReview",
        common
      ),
    });
    return;
  }
  throw new Error("--kind must be smoke or interface.");
}

if (import.meta.main) {
  try {
    runBuildCollaborationCutoverEvidence(process.argv.slice(2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
