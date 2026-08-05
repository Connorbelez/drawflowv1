import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync,
  readFileSync,
  renameSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { isAbsolute, resolve } from "node:path";
import { validateBuildCollaborationE2EFixture } from "./build-collaboration-cutover-fixture";
import {
  BUILD_COLLABORATION_CUTOVER_GATE_RUNNER,
  BUILD_COLLABORATION_MANUAL_REVIEW_RUNNER,
  type BuildCollaborationCutoverGateContext,
  buildCollaborationCutoverGateArgv,
  isBuildCollaborationCutoverGate,
  isManualBuildCollaborationCutoverGate,
  isProductionConvexDeployment,
  serializeCommand,
} from "./build-collaboration-cutover-gates";

const GIT_SHA_PATTERN = /^[a-f0-9]{40}$/i;
const WORKOS_USER_PATTERN = /^user_[A-Za-z0-9]+$/;

interface RunnerArguments {
  evidencePaths: string[];
  gate?: string;
  manifestPath?: string;
  outputPath?: string;
  reviewerWorkosUserId?: string;
}

interface CutoverManifest {
  forbiddenOrganizationId?: string;
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

function parseArguments(argv: string[]): RunnerArguments {
  const parsed: RunnerArguments = { evidencePaths: [] };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index + 1];
    switch (argv[index]) {
      case "--gate":
        parsed.gate = value;
        index += 1;
        break;
      case "--manifest":
        parsed.manifestPath = value;
        index += 1;
        break;
      case "--output":
        parsed.outputPath = value;
        index += 1;
        break;
      case "--evidence":
        if (value) {
          parsed.evidencePaths.push(value);
        }
        index += 1;
        break;
      case "--reviewer-workos-user-id":
        parsed.reviewerWorkosUserId = value;
        index += 1;
        break;
      default:
        throw new Error(`Unknown runner argument: ${argv[index]}`);
    }
  }
  return parsed;
}

function requireManifest(path: string): CutoverManifest {
  const parsed = JSON.parse(
    readFileSync(resolve(path), "utf8")
  ) as CutoverManifest;
  const release = parsed.release;
  if (
    !(
      parsed.organizationId &&
      parsed.representativeBuildId &&
      release?.applicationUrl?.startsWith("https://") &&
      release.applicationVersion &&
      isProductionConvexDeployment(release.convexDeployment ?? "") &&
      release.convexUrl?.startsWith("https://") &&
      GIT_SHA_PATTERN.test(release.gitCommit)
    )
  ) {
    throw new Error("Cutover manifest release scope is incomplete or invalid.");
  }
  return parsed;
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

function evidenceFiles(paths: string[]) {
  if (paths.length === 0) {
    throw new Error("Manual review requires at least one --evidence file.");
  }
  return paths.map((path) => {
    const resolved = isAbsolute(path) ? path : resolve(path);
    if (!(existsSync(resolved) && statSync(resolved).isFile())) {
      throw new Error(`Manual review evidence does not exist: ${path}`);
    }
    return {
      path: resolved,
      sha256: sha256(readFileSync(resolved)),
    };
  });
}

export function runBuildCollaborationCutoverGate(argv: string[]) {
  const args = parseArguments(argv);
  if (!(args.gate && isBuildCollaborationCutoverGate(args.gate))) {
    throw new Error("--gate must name a governed Build Collaboration gate.");
  }
  if (!(args.manifestPath && args.outputPath)) {
    throw new Error("--manifest and --output are required.");
  }
  const manifest = requireManifest(args.manifestPath);
  const context: BuildCollaborationCutoverGateContext = {
    ...manifest.release,
    forbiddenOrganizationId: manifest.forbiddenOrganizationId,
    organizationId: manifest.organizationId,
    representativeBuildId: manifest.representativeBuildId,
  };
  const git = spawnSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" });
  const gitHead = git.stdout.trim();
  if (git.status !== 0 || gitHead !== manifest.release.gitCommit) {
    throw new Error(
      "Runner Git HEAD does not match manifest.release.gitCommit."
    );
  }
  const startedAt = new Date().toISOString();
  const common = {
    ...context,
    commandName: args.gate,
    gitHead,
    schemaVersion: "build-collaboration-command-evidence/v2",
    startedAt,
  };
  if (isManualBuildCollaborationCutoverGate(args.gate)) {
    if (
      !(
        args.reviewerWorkosUserId &&
        WORKOS_USER_PATTERN.test(args.reviewerWorkosUserId)
      )
    ) {
      throw new Error(
        "Manual review requires --reviewer-workos-user-id with a WorkOS user ID."
      );
    }
    writeArtifact(args.outputPath, {
      ...common,
      completedAt: new Date().toISOString(),
      evidence: evidenceFiles(args.evidencePaths),
      exitCode: 0,
      mode: "human_review",
      producer: BUILD_COLLABORATION_MANUAL_REVIEW_RUNNER,
      reviewerWorkosUserId: args.reviewerWorkosUserId,
    });
    return;
  }
  const command = buildCollaborationCutoverGateArgv(args.gate, context);
  if (!command) {
    throw new Error(`Missing automated command for ${args.gate}.`);
  }
  const e2eEvidence =
    args.gate === "playwrightRoleJourneys"
      ? validateBuildCollaborationE2EFixture(context)
      : undefined;
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
      `${args.gate} failed with exit code ${result.status ?? -1}.`
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
    ...(e2eEvidence ?? {}),
    command: serializeCommand(command),
    completedAt: new Date().toISOString(),
    exitCode: 0,
    mode: "automated",
    producer: BUILD_COLLABORATION_CUTOVER_GATE_RUNNER,
    stderrPath: stderr.path,
    stderrSha256: stderr.sha256,
    stdoutPath: stdout.path,
    stdoutSha256: stdout.sha256,
  });
}

if (import.meta.main) {
  try {
    runBuildCollaborationCutoverGate(process.argv.slice(2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
