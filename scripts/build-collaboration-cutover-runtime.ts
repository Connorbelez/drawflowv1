import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import type { JsonObject } from "./build-collaboration-cutover-contract";
import { isProductionConvexDeployment } from "./build-collaboration-cutover-gates";
import { validateBuildCollaborationCutoverEvidence } from "./build-collaboration-cutover-validation";
import { asObject } from "./build-collaboration-cutover-validation-utils";

function fetchAuthenticatedProductionLiveState(manifest: JsonObject) {
  const identity = process.env.BUILD_COLLABORATION_OPERATOR_IDENTITY_JSON;
  if (!identity) {
    throw new Error(
      "BUILD_COLLABORATION_OPERATOR_IDENTITY_JSON is required; certification never accepts operator-authored live state."
    );
  }
  JSON.parse(identity);
  const release = asObject(manifest.release);
  const convexDeployment =
    typeof release?.convexDeployment === "string"
      ? release.convexDeployment
      : "";
  if (!(convexDeployment && isProductionConvexDeployment(convexDeployment))) {
    throw new Error("A specific production Convex deployment is required.");
  }
  const result = spawnSync(
    "bun",
    [
      "x",
      "convex",
      "run",
      "--deployment",
      convexDeployment,
      "--identity",
      identity,
      "build_collaboration_cutover_certification:getBuildCollaborationCutoverCertificationState",
      JSON.stringify({
        organizationId: manifest.organizationId,
        buildId: manifest.representativeBuildId,
      }),
    ],
    { encoding: "utf8" }
  );
  if (result.status !== 0) {
    throw new Error(
      `Authenticated production state query failed: ${(result.stderr || result.stdout).trim()}`
    );
  }
  return JSON.parse(result.stdout);
}

export function main() {
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
  let liveState: unknown;
  try {
    liveState = fetchAuthenticatedProductionLiveState(manifest as JsonObject);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 2;
    return;
  }
  const errors = validateBuildCollaborationCutoverEvidence(
    manifest,
    dirname(absoluteManifestPath),
    liveState
  );
  if (errors.length) {
    console.error("Build Collaboration cutover certification failed:");
    for (const error of errors) {
      console.error(`- ${error}`);
    }
    process.exitCode = 1;
    return;
  }
  const certifiedRecord = {
    ...(manifest as JsonObject),
    serverAttestation: liveState,
    certification: {
      certifiedAt: new Date().toISOString(),
      evidenceManifestSha256: createHash("sha256").update(source).digest("hex"),
      validatorVersion: "build-collaboration-cutover-certifier/v2",
    },
  };
  const absoluteOutputPath = resolve(
    outputPath ??
      resolve(dirname(absoluteManifestPath), "deployment-record.certified.json")
  );
  const temporaryPath = `${absoluteOutputPath}.${process.pid}.tmp`;
  writeFileSync(
    temporaryPath,
    `${JSON.stringify(certifiedRecord, null, 2)}\n`,
    { mode: 0o600 }
  );
  renameSync(temporaryPath, absoluteOutputPath);
  console.log(
    `Certified Build Collaboration cutover evidence: ${absoluteOutputPath}`
  );
}
function argumentValue(name: string) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}
