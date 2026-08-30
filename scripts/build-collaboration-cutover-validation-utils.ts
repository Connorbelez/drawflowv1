import { createHash } from "node:crypto";
import { existsSync, readFileSync, statSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";
import type {
  CommonArtifactContext,
  JsonObject,
} from "./build-collaboration-cutover-contract";
import {
  ISO_TIMESTAMP_PATTERN,
  PLACEHOLDER_PATTERN,
  SHA256_PATTERN,
} from "./build-collaboration-cutover-contract";
import { validateBuildCollaborationE2EFixture } from "./build-collaboration-cutover-fixture";

export function readTypedArtifact(
  errors: string[],
  value: unknown,
  directory: string,
  label: string
) {
  const reference = asObject(value);
  if (!reference) {
    errors.push(`Missing ${label} artifact reference.`);
    return;
  }
  const path = requireText(errors, reference, "path", {
    label: `${label} artifact path`,
  });
  const expectedHash = requireText(errors, reference, "sha256", {
    label: `${label} artifact sha256`,
    pattern: SHA256_PATTERN,
  });
  if (!(path && expectedHash)) {
    return;
  }
  const resolved = isAbsolute(path) ? path : resolve(directory, path);
  if (!(existsSync(resolved) && statSync(resolved).isFile())) {
    errors.push(`${label} artifact does not exist: ${path}.`);
    return;
  }
  const bytes = readFileSync(resolved);
  const actualHash = createHash("sha256").update(bytes).digest("hex");
  if (actualHash !== expectedHash.toLowerCase()) {
    errors.push(`${label} artifact hash does not match ${path}.`);
    return;
  }
  try {
    const parsed = asObject(JSON.parse(bytes.toString("utf8")));
    if (!parsed) {
      throw new Error("root is not an object");
    }
    return parsed;
  } catch (error) {
    errors.push(
      `${label} artifact is not valid typed JSON: ${error instanceof Error ? error.message : String(error)}.`
    );
    return;
  }
}

export function validateCommonArtifact(
  errors: string[],
  artifact: JsonObject,
  expected: CommonArtifactContext,
  label: string
) {
  for (const [key, value] of Object.entries(expected)) {
    if (artifact[key] !== value) {
      errors.push(
        `${label} artifact ${key} does not match the manifest release scope.`
      );
    }
  }
}

export function validateHashedFileReference(
  errors: string[],
  reference: JsonObject,
  directory: string,
  label: string
) {
  const path = requireText(errors, reference, "path", {
    label: `${label} path`,
  });
  const expectedHash = requireText(errors, reference, "sha256", {
    label: `${label} sha256`,
    pattern: SHA256_PATTERN,
  });
  if (!(path && expectedHash)) {
    return;
  }
  const resolved = isAbsolute(path) ? path : resolve(directory, path);
  if (!(existsSync(resolved) && statSync(resolved).isFile())) {
    errors.push(`${label} does not exist: ${path}.`);
    return;
  }
  const actualHash = createHash("sha256")
    .update(readFileSync(resolved))
    .digest("hex");
  if (actualHash !== expectedHash.toLowerCase()) {
    errors.push(`${label} hash does not match ${path}.`);
  }
}

export function validateE2EArtifact(
  errors: string[],
  artifact: JsonObject,
  context: CommonArtifactContext,
  label: string
) {
  try {
    const evidence = validateBuildCollaborationE2EFixture(
      context,
      typeof artifact.fixturePath === "string" ? artifact.fixturePath : ""
    );
    if (artifact.fixtureSha256 !== evidence.fixtureSha256) {
      errors.push(`${label} fixture hash does not match retained evidence.`);
    }
    if (
      JSON.stringify(artifact.storageStates) !==
      JSON.stringify(evidence.storageStates)
    ) {
      errors.push(`${label} authenticated storage-state evidence changed.`);
    }
  } catch (error) {
    errors.push(
      `${label} fixture evidence is invalid: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

export function validateHashedCommandOutput(
  errors: string[],
  artifact: JsonObject,
  stream: "stderr" | "stdout",
  label: string
) {
  const path = artifact[`${stream}Path`];
  const expectedHash = artifact[`${stream}Sha256`];
  if (
    typeof path !== "string" ||
    !isAbsolute(path) ||
    !(existsSync(path) && statSync(path).isFile())
  ) {
    errors.push(`${label} ${stream} evidence file is unavailable.`);
    return;
  }
  const actualHash = createHash("sha256")
    .update(readFileSync(path))
    .digest("hex");
  if (actualHash !== expectedHash) {
    errors.push(`${label} ${stream} evidence hash does not match.`);
  }
}

export function validateIsoTimestamp(
  errors: string[],
  parent: JsonObject,
  key: string,
  label: string
) {
  const value = parent[key];
  if (
    typeof value !== "string" ||
    !ISO_TIMESTAMP_PATTERN.test(value) ||
    Number.isNaN(Date.parse(value))
  ) {
    errors.push(`${label}.${key} must be an ISO-8601 timestamp.`);
  }
}

export function requireObject(
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
export function requireText(
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
    return;
  }
  if (options?.pattern && !options.pattern.test(value.trim())) {
    errors.push(`${label} has an invalid format.`);
    return;
  }
  return value.trim();
}
export function requireExactString(
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
export function asObject(value: unknown): JsonObject | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonObject)
    : undefined;
}
