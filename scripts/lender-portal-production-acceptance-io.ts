// biome-ignore-all lint/suspicious/noBitwiseOperators: POSIX open flags require bitwise arithmetic.
import { spawnSync } from "node:child_process";
import { createHash, createPublicKey } from "node:crypto";
import {
  closeSync,
  existsSync,
  constants as fsConstants,
  fstatSync,
  openSync,
  readFileSync,
  realpathSync,
} from "node:fs";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import ts from "typescript";

import {
  FORBIDDEN_EVIDENCE_SOURCE_PARTS,
  type LenderPortalReleaseGitState,
  PATH_SEGMENT_SEPARATOR_PATTERN,
} from "./lender-portal-production-acceptance-contract";
import { LENDER_PORTAL_PRODUCTION_TRUST_ROOT } from "./lender-portal-production-trust-root";

export function fail(message: string): never {
  throw new Error(message);
}

export function resolveLenderPortalRepositoryPath(
  repositoryRoot: string,
  path: string
) {
  if (isAbsolute(path)) {
    fail(`Repository evidence path must be relative: ${path}`);
  }
  if (
    path
      .split(PATH_SEGMENT_SEPARATOR_PATTERN)
      .some((segment) => segment === "..")
  ) {
    fail(`Repository evidence path contains traversal: ${path}`);
  }
  const absoluteRoot = realpathSync(resolve(repositoryRoot));
  const absolutePath = resolve(absoluteRoot, path);
  const relativePath = relative(absoluteRoot, absolutePath);
  if (
    relativePath === "" ||
    relativePath.startsWith("..") ||
    isAbsolute(relativePath)
  ) {
    fail(`Repository path escapes or aliases the checkout root: ${path}`);
  }
  const candidateExists = existsSync(absolutePath);
  const realCandidate = realpathSync(
    candidateExists ? absolutePath : dirname(absolutePath)
  );
  const realRelativePath = relative(absoluteRoot, realCandidate);
  if (realRelativePath.startsWith("..") || isAbsolute(realRelativePath)) {
    fail(`Repository path escapes the checkout after realpath: ${path}`);
  }
  return candidateExists ? realCandidate : absolutePath;
}

export function readStableFile(path: string) {
  const descriptor = openSync(
    path,
    fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW
  );
  try {
    const before = fstatSync(descriptor);
    if (!before.isFile()) {
      fail(`Release validation source is not a regular file: ${path}`);
    }
    const contents = readFileSync(descriptor);
    const after = fstatSync(descriptor);
    if (
      before.dev !== after.dev ||
      before.ino !== after.ino ||
      before.size !== after.size ||
      before.mtimeMs !== after.mtimeMs ||
      contents.byteLength !== after.size
    ) {
      fail(`Release validation source changed while open: ${path}`);
    }
    return contents;
  } finally {
    closeSync(descriptor);
  }
}

export function readStableRepositoryFile(repositoryRoot: string, path: string) {
  return readStableFile(
    resolveLenderPortalRepositoryPath(repositoryRoot, path)
  );
}

export function trustedExecutable(
  name: keyof typeof LENDER_PORTAL_PRODUCTION_TRUST_ROOT.executables
) {
  const policy = LENDER_PORTAL_PRODUCTION_TRUST_ROOT.executables[name];
  const executablePath = realpathSync(policy.path);
  if (
    executablePath !== policy.path ||
    sha256(readStableFile(executablePath)) !== policy.sha256
  ) {
    fail(`Trusted ${name} executable does not match the immutable trust root`);
  }
  return executablePath;
}

export function runGit(repositoryRoot: string, args: string[]) {
  const result = spawnSync(trustedExecutable("git"), args, {
    cwd: repositoryRoot,
    encoding: "utf8",
  });
  if (result.status !== 0) {
    fail(
      `Unable to inspect immutable release state with git ${args.join(" ")}: ${result.stderr.trim()}`
    );
  }
  return result.stdout.trim();
}

export function readLenderPortalReleaseGitState(
  repositoryRoot: string
): LenderPortalReleaseGitState {
  const dirtyEntries = runGit(repositoryRoot, [
    "status",
    "--porcelain=v1",
    "--untracked-files=all",
  ])
    .split("\n")
    .filter(Boolean);
  return {
    dirtyEntryCount: dirtyEntries.length,
    headSha: runGit(repositoryRoot, ["rev-parse", "HEAD"]),
    isClean: dirtyEntries.length === 0,
    treeSha: runGit(repositoryRoot, ["rev-parse", "HEAD^{tree}"]),
  };
}

export function sha256(contents: string | Buffer) {
  return createHash("sha256").update(contents).digest("hex");
}

export function lenderPortalPublicKeyFingerprint(publicKeyPem: string) {
  let publicKey: ReturnType<typeof createPublicKey>;
  try {
    publicKey = createPublicKey(publicKeyPem);
  } catch {
    fail("Pinned signing key is not a valid canonical public key");
  }
  if (publicKey.asymmetricKeyType !== "ed25519") {
    fail("Pinned signing key must use Ed25519");
  }
  return sha256(publicKey.export({ format: "der", type: "spki" }));
}

export function stableLenderPortalEvidenceJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableLenderPortalEvidenceJson).join(",")}]`;
  }
  if (value !== null && typeof value === "object") {
    return `{${Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(
        ([key, nestedValue]) =>
          `${JSON.stringify(key)}:${stableLenderPortalEvidenceJson(nestedValue)}`
      )
      .join(",")}}`;
  }
  const serialized = JSON.stringify(value);
  if (serialized === undefined) {
    fail("Release evidence contains a non-JSON value");
  }
  return serialized;
}

export function assertUnique(values: readonly string[], label: string) {
  const duplicates = values.filter(
    (value, index) => values.indexOf(value) !== index
  );
  if (duplicates.length > 0) {
    fail(
      `${label} contains duplicate values: ${[...new Set(duplicates)].join(", ")}`
    );
  }
}

export function assertExactValues(
  actual: readonly string[],
  expected: readonly string[],
  label: string
) {
  assertUnique(actual, label);
  const missing = expected.filter((value) => !actual.includes(value));
  const foreign = actual.filter((value) => !expected.includes(value));
  if (missing.length > 0 || foreign.length > 0) {
    fail(
      `${label} must match the required values exactly; missing: ${missing.join(", ") || "none"}; foreign: ${foreign.join(", ") || "none"}`
    );
  }
}

export function assertSafeProductionSource(
  path: string,
  consumerClass: string
) {
  const normalized = path.replaceAll("\\", "/");
  if (
    normalized.includes(".test.") ||
    (consumerClass === "production-route" &&
      normalized.includes("prototype")) ||
    normalized.startsWith("scripts/") ||
    normalized.startsWith("docs/") ||
    FORBIDDEN_EVIDENCE_SOURCE_PARTS.some((part) => normalized.includes(part))
  ) {
    fail(
      `${consumerClass} consumer points to forbidden evidence source ${path}`
    );
  }
  if (consumerClass === "production-route" && !normalized.startsWith("src/")) {
    fail(`Production route consumer must resolve inside src/: ${path}`);
  }
  if (consumerClass === "canonical-api" && !normalized.startsWith("convex/")) {
    fail(`Canonical API consumer must resolve inside convex/: ${path}`);
  }
}

export function readTypescriptSource(
  repositoryRoot: string,
  path: string,
  consumerClass: "production-route" | "canonical-api"
) {
  assertSafeProductionSource(path, consumerClass);
  const absolutePath = resolveLenderPortalRepositoryPath(repositoryRoot, path);
  if (!existsSync(absolutePath)) {
    fail(`Missing production source ${path}`);
  }
  return ts.createSourceFile(
    path,
    readStableFile(absolutePath).toString("utf8"),
    ts.ScriptTarget.Latest,
    true,
    path.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS
  );
}

export function readTypescriptTestSource(repositoryRoot: string, path: string) {
  const absolutePath = resolveLenderPortalRepositoryPath(repositoryRoot, path);
  if (!existsSync(absolutePath)) {
    fail(`Missing executable test target ${path}`);
  }
  return ts.createSourceFile(
    path,
    readStableFile(absolutePath).toString("utf8"),
    ts.ScriptTarget.Latest,
    true,
    path.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS
  );
}

export function parseTypescriptSource(path: string, contents: string) {
  return ts.createSourceFile(
    path,
    contents,
    ts.ScriptTarget.Latest,
    true,
    path.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS
  );
}
