import { spawnSync } from "node:child_process";
import { verify } from "node:crypto";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { z } from "zod";
import {
  type AcceptanceContract,
  type Artifact,
  BASE64_PATTERN,
  type LenderPortalReleaseGitState,
  LINE_SPLIT_PATTERN,
  LOCATION_HEADER_PATTERN,
  type MachineMapping,
  type MachineProof,
  machineArtifactPayloadSchema,
  nativeVitestJsonReportSchema,
  RAW_URL_PATH_PATTERN,
  rawVitestExecutionReportSchema,
  type SignedAttestation,
  sha40Schema,
  sha256Schema,
  type TestOnlyValidationHooks,
  type TestProof,
} from "./lender-portal-production-acceptance-contract";
import {
  assertExactValues,
  fail,
  readStableFile,
  sha256,
  stableLenderPortalEvidenceJson,
  trustedExecutable,
} from "./lender-portal-production-acceptance-io";
import { LENDER_PORTAL_PRODUCTION_TRUST_ROOT } from "./lender-portal-production-trust-root";

export function rawPathSegments(url: string) {
  const match = url.match(RAW_URL_PATH_PATTERN);
  return (match?.[1] ?? "").split("/").filter(Boolean);
}

export function validateNoUrlTraversal(url: string, label: string) {
  for (const segment of rawPathSegments(url)) {
    let decoded = segment;
    try {
      for (let pass = 0; pass < 3; pass += 1) {
        const next = decodeURIComponent(decoded);
        if (next === decoded) {
          break;
        }
        decoded = next;
      }
    } catch {
      fail(`${label} contains invalid URL path encoding`);
    }
    if (
      decoded === "." ||
      decoded === ".." ||
      decoded.includes("/") ||
      decoded.includes("\\")
    ) {
      fail(`${label} contains forbidden URL path traversal`);
    }
  }
}

export function validateInitialEvidenceUrl(
  contract: AcceptanceContract,
  evidenceUrl: string,
  label: string
) {
  validateNoUrlTraversal(evidenceUrl, label);
  let parsed: URL;
  try {
    parsed = new URL(evidenceUrl);
  } catch {
    fail(`${label} is not a trusted GitHub release asset URL`);
  }
  const prefix = `/${contract.evidencePolicy.githubOwner}/${contract.evidencePolicy.githubRepository}/releases/download/`;
  const suffix = parsed.pathname.slice(prefix.length);
  const parts = suffix.split("/");
  if (
    parsed.origin !== contract.evidencePolicy.initialOrigin ||
    parsed.username ||
    parsed.password ||
    parsed.port ||
    parsed.search ||
    parsed.hash ||
    !parsed.pathname.startsWith(prefix) ||
    parts.length !== 2 ||
    parts.some((part) => !part)
  ) {
    fail(`${label} is not a trusted GitHub release asset URL`);
  }
}

export function validateEffectiveEvidenceUrl(
  contract: AcceptanceContract,
  effectiveUrl: string,
  label: string
) {
  validateNoUrlTraversal(effectiveUrl, `${label} redirect`);
  let parsed: URL;
  try {
    parsed = new URL(effectiveUrl);
  } catch {
    fail(`${label} resolved to an untrusted evidence origin`);
  }
  try {
    validateInitialEvidenceUrl(contract, effectiveUrl, label);
    return;
  } catch {
    // GitHub release assets may resolve only to the pinned release asset CDN.
  }
  const allowed = contract.evidencePolicy.releaseAssetRedirects.some(
    (redirect) =>
      parsed.origin === redirect.origin &&
      new RegExp(redirect.pathnamePattern).test(parsed.pathname)
  );
  if (
    parsed.protocol !== "https:" ||
    parsed.username ||
    parsed.password ||
    parsed.port ||
    parsed.hash ||
    !allowed
  ) {
    fail(`${label} resolved to an untrusted evidence origin or path`);
  }
}

export function validateRedirectChain(args: {
  contract: AcceptanceContract;
  effectiveUrl: string;
  initialUrl: string;
  label: string;
  redirectChain: string[];
}) {
  let current = args.initialUrl;
  for (const [index, hop] of args.redirectChain.entries()) {
    const resolved = new URL(hop, current).toString();
    validateEffectiveEvidenceUrl(
      args.contract,
      resolved,
      `${args.label} redirect hop ${index + 1}`
    );
    current = resolved;
  }
  if (current !== args.effectiveUrl) {
    fail(
      `${args.label} effective URL does not match its recorded redirect chain`
    );
  }
  validateEffectiveEvidenceUrl(args.contract, args.effectiveUrl, args.label);
}

export function redirectLocations(headers: Buffer) {
  return headers
    .toString("utf8")
    .split(LINE_SPLIT_PATTERN)
    .map((line) => line.match(LOCATION_HEADER_PATTERN)?.[1]?.trim())
    .filter((location): location is string => Boolean(location));
}

export function fetchRemoteEvidence(
  contract: AcceptanceContract,
  evidenceUrl: string,
  label: string
) {
  validateInitialEvidenceUrl(contract, evidenceUrl, label);
  const directory = mkdtempSync(join(tmpdir(), "lender-release-evidence-"));
  const outputPath = join(directory, "artifact");
  const headersPath = join(directory, "headers");
  try {
    const result = spawnSync(
      trustedExecutable("curl"),
      [
        "--fail",
        "--location",
        "--proto",
        "=https",
        "--proto-redir",
        "=https",
        "--silent",
        "--show-error",
        "--max-time",
        "30",
        "--dump-header",
        headersPath,
        "--output",
        outputPath,
        "--write-out",
        "%{url_effective}",
        evidenceUrl,
      ],
      { encoding: "utf8", maxBuffer: 1024 * 1024 }
    );
    if (result.status !== 0 || !existsSync(outputPath)) {
      fail(`${label} could not be fetched from its durable evidence location`);
    }
    const effectiveUrl = result.stdout.trim();
    const redirectChain = existsSync(headersPath)
      ? redirectLocations(readStableFile(headersPath))
      : [];
    validateRedirectChain({
      contract,
      effectiveUrl,
      initialUrl: evidenceUrl,
      label,
      redirectChain,
    });
    return readStableFile(outputPath);
  } finally {
    rmSync(directory, { force: true, recursive: true });
  }
}

export function fetchEvidence(args: {
  contract: AcceptanceContract;
  label: string;
  testOnlyHooks?: TestOnlyValidationHooks;
  url: string;
}) {
  validateInitialEvidenceUrl(args.contract, args.url, args.label);
  if (args.testOnlyHooks) {
    if (process.env.NODE_ENV !== "test") {
      fail("Release validation hooks are test-only");
    }
    const result = args.testOnlyHooks.fetchRemote({
      label: args.label,
      url: args.url,
    });
    validateRedirectChain({
      contract: args.contract,
      effectiveUrl: result.effectiveUrl,
      initialUrl: args.url,
      label: args.label,
      redirectChain: result.redirectChain,
    });
    return result.contents;
  }
  return fetchRemoteEvidence(args.contract, args.url, args.label);
}

export function verifyGithubAttestedArtifact(args: {
  artifact: Buffer;
  artifactSha256: string;
  allowPreDeployment?: boolean;
  attestation: SignedAttestation;
  attestationBundle: Buffer;
  contract: AcceptanceContract;
  label: string;
  testOnlyHooks?: TestOnlyValidationHooks;
}) {
  const policy = args.contract.evidencePolicy.githubAttestation;
  if (args.testOnlyHooks) {
    if (process.env.NODE_ENV !== "test") {
      fail("GitHub attestation verification hooks are test-only");
    }
    if (!args.testOnlyHooks.verifyGithubAttestation) {
      fail(`${args.label} requires independently verified CI provenance`);
    }
    const verified = args.testOnlyHooks.verifyGithubAttestation({
      artifactSha256: args.artifactSha256,
      candidateSha: args.attestation.payload.candidateSha,
      label: args.label,
      repository: policy.repository,
      signerDigest: policy.signerDigest,
      signerWorkflow: policy.signerWorkflow,
      sourceRepository: policy.sourceRepository,
    });
    if (
      verified.artifactSha256 !== args.artifactSha256 ||
      verified.sourceDigest !== args.attestation.payload.candidateSha ||
      verified.sourceRepository !== policy.sourceRepository ||
      verified.signerDigest !== policy.signerDigest ||
      verified.signerWorkflow !== policy.signerWorkflow ||
      verified.builderId !== "https://github.com/actions/runner" ||
      !verified.invocationId ||
      Date.parse(verified.startedAt) <
        (args.allowPreDeployment
          ? Date.parse(args.attestation.payload.issuedAt) -
            args.contract.attestationMaxAgeHours * 60 * 60 * 1000
          : Date.parse(args.attestation.payload.deployment.deployedAt)) ||
      Date.parse(verified.startedAt) > Date.parse(verified.finishedAt) ||
      Date.parse(verified.finishedAt) >
        Date.parse(args.attestation.payload.issuedAt)
    ) {
      fail(`${args.label} GitHub Actions attestation is stale or foreign`);
    }
    return;
  }
  const directory = mkdtempSync(join(tmpdir(), "lender-ci-attestation-"));
  const artifactPath = join(directory, "artifact");
  const bundlePath = join(directory, "bundle.jsonl");
  try {
    writeFileSync(artifactPath, args.artifact);
    writeFileSync(bundlePath, args.attestationBundle);
    const result = spawnSync(
      trustedExecutable("gh"),
      [
        "attestation",
        "verify",
        artifactPath,
        "--bundle",
        bundlePath,
        "--repo",
        policy.repository,
        "--signer-workflow",
        policy.signerWorkflow,
        "--signer-digest",
        policy.signerDigest,
        "--source-digest",
        args.attestation.payload.candidateSha,
        "--cert-oidc-issuer",
        policy.oidcIssuer,
        "--deny-self-hosted-runners",
        "--format",
        "json",
      ],
      { encoding: "utf8", maxBuffer: 4 * 1024 * 1024 }
    );
    if (result.status !== 0) {
      fail(
        `${args.label} lacks a valid GitHub Actions artifact attestation: ${result.stderr.trim()}`
      );
    }
    const verified = z
      .array(
        z
          .object({
            verificationResult: z
              .object({
                statement: z
                  .object({
                    predicate: z
                      .object({
                        runDetails: z
                          .object({
                            builder: z
                              .object({
                                id: z.literal(
                                  "https://github.com/actions/runner"
                                ),
                              })
                              .passthrough(),
                            metadata: z
                              .object({
                                finishedOn: z
                                  .string()
                                  .datetime({ offset: true }),
                                invocationId: z.string().min(1),
                                startedOn: z
                                  .string()
                                  .datetime({ offset: true }),
                              })
                              .passthrough(),
                          })
                          .passthrough(),
                      })
                      .passthrough(),
                    subject: z.array(
                      z
                        .object({
                          digest: z
                            .object({ sha256: sha256Schema })
                            .passthrough(),
                        })
                        .passthrough()
                    ),
                  })
                  .passthrough(),
              })
              .passthrough(),
          })
          .passthrough()
      )
      .min(1)
      .parse(JSON.parse(result.stdout));
    if (
      !verified.some((entry) => {
        const statement = entry.verificationResult.statement;
        const metadata = statement.predicate.runDetails.metadata;
        return (
          statement.subject.some(
            (subject) => subject.digest.sha256 === args.artifactSha256
          ) &&
          Date.parse(metadata.startedOn) >=
            (args.allowPreDeployment
              ? Date.parse(args.attestation.payload.issuedAt) -
                args.contract.attestationMaxAgeHours * 60 * 60 * 1000
              : Date.parse(args.attestation.payload.deployment.deployedAt)) &&
          Date.parse(metadata.startedOn) <= Date.parse(metadata.finishedOn) &&
          Date.parse(metadata.finishedOn) <=
            Date.parse(args.attestation.payload.issuedAt)
        );
      })
    ) {
      fail(`${args.label} attestation does not cover the exact artifact bytes`);
    }
  } finally {
    rmSync(directory, { force: true, recursive: true });
  }
}

export function trustedReleaseKey(
  keyId: string,
  testOnlyHooks?: TestOnlyValidationHooks
) {
  const policies =
    testOnlyHooks?.trustRoot?.releaseKeys ??
    LENDER_PORTAL_PRODUCTION_TRUST_ROOT.releaseKeys;
  const key = policies.find((candidate) => candidate.id === keyId);
  if (!key) {
    fail("Release attestation was not signed by a pinned trusted key");
  }
  return key;
}

export function trustedReviewer(
  acceptance: SignedAttestation["payload"]["independentAcceptance"],
  testOnlyHooks?: TestOnlyValidationHooks
) {
  const policies =
    testOnlyHooks?.trustRoot?.reviewers ??
    LENDER_PORTAL_PRODUCTION_TRUST_ROOT.reviewers;
  const policy = policies.find(
    (candidate) => candidate.id === acceptance.signature.keyId
  );
  if (
    !policy ||
    policy.reviewerId !== acceptance.reviewerId ||
    policy.reviewerDisplayName !== acceptance.reviewerDisplayName
  ) {
    fail(
      "Independent acceptance reviewer identity is outside the pinned policy"
    );
  }
  return policy;
}

export function verifyEd25519(
  statement: string,
  signature: string,
  publicKeyPem: string,
  label: string
) {
  let valid = false;
  try {
    valid = verify(
      null,
      Buffer.from(statement),
      publicKeyPem,
      Buffer.from(signature, "base64")
    );
  } catch {
    valid = false;
  }
  if (!valid) {
    fail(`${label} signature verification failed`);
  }
}

export function createLenderPortalIndependentReviewStatement(
  payload: SignedAttestation["payload"]
) {
  return stableLenderPortalEvidenceJson({
    artifacts: payload.artifacts.map((artifact) => ({
      commitSha: artifact.commitSha,
      id: artifact.id,
      kind: artifact.kind,
      sha256: artifact.sha256,
      sourceTreeSha: artifact.sourceTreeSha,
      uri: artifact.uri,
    })),
    attestationUri: payload.attestationUri,
    candidateSha: payload.candidateSha,
    contractSha256: payload.contractSha256,
    decision: payload.independentAcceptance.decision,
    deployment: payload.deployment,
    issuedAt: payload.issuedAt,
    releaseId: payload.releaseId,
    journeys: payload.journeys,
    independentAcceptanceArtifactId: payload.independentAcceptance.artifactId,
    independentAcceptanceArtifactSha256:
      payload.independentAcceptance.artifactSha256,
    operationalGates: payload.operationalGates,
    reviewerDisplayName: payload.independentAcceptance.reviewerDisplayName,
    reviewerId: payload.independentAcceptance.reviewerId,
    surfaces: payload.surfaces,
    verifiedAt: payload.independentAcceptance.verifiedAt,
    verticalSliceGates: payload.verticalSliceGates,
  });
}

export function verifySignatures(
  attestation: SignedAttestation,
  testOnlyHooks?: TestOnlyValidationHooks
) {
  const releaseKey = trustedReleaseKey(
    attestation.signature.keyId,
    testOnlyHooks
  );
  verifyEd25519(
    stableLenderPortalEvidenceJson(attestation.payload),
    attestation.signature.value,
    releaseKey.publicKeyPem,
    "Release attestation"
  );
  const reviewer = trustedReviewer(
    attestation.payload.independentAcceptance,
    testOnlyHooks
  );
  verifyEd25519(
    createLenderPortalIndependentReviewStatement(attestation.payload),
    attestation.payload.independentAcceptance.signature.value,
    reviewer.publicKeyPem,
    "Independent acceptance"
  );
}

export function assertGitStateMatches(
  expected: LenderPortalReleaseGitState,
  actual: LenderPortalReleaseGitState,
  phase: string
) {
  if (!actual.isClean || actual.dirtyEntryCount !== 0) {
    fail(
      `${phase} requires a clean immutable checkout; found ${actual.dirtyEntryCount} dirty entries`
    );
  }
  if (
    actual.headSha !== expected.headSha ||
    actual.treeSha !== expected.treeSha
  ) {
    fail(
      `${phase} detected a repository HEAD or tree change during validation`
    );
  }
}

export function artifactEnvelope(
  contents: Buffer,
  artifact: Artifact,
  gitState: LenderPortalReleaseGitState
) {
  if (sha256(contents) !== artifact.sha256) {
    fail(`${artifact.id} durable evidence digest mismatch`);
  }
  if (
    artifact.commitSha !== gitState.headSha ||
    artifact.sourceTreeSha !== gitState.treeSha
  ) {
    fail(`${artifact.id} is stale or bound to a foreign commit/tree`);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(contents.toString("utf8"));
  } catch {
    fail(`${artifact.id} is not a structured JSON evidence artifact`);
  }
  const envelope = z
    .object({
      artifactId: z.string(),
      commitSha: sha40Schema,
      sourceTreeSha: sha40Schema,
    })
    .passthrough()
    .parse(parsed);
  if (
    envelope.artifactId !== artifact.id ||
    envelope.commitSha !== artifact.commitSha ||
    envelope.sourceTreeSha !== artifact.sourceTreeSha
  ) {
    fail(
      `${artifact.id} content metadata does not match its signed artifact identity`
    );
  }
  return parsed;
}

export function machineInvocation(testProof: TestProof, packageScript: string) {
  const argv = [
    "bun",
    "run",
    packageScript,
    "--",
    testProof.targetFile,
    "--testNamePattern",
    testProof.assertionName,
    "--reporter=json",
  ];
  return { argv, command: argv.join(" "), cwd: "." as const };
}

export function decodeExecutionReport(args: {
  attestation: SignedAttestation;
  contract: AcceptanceContract;
  payload: z.infer<typeof machineArtifactPayloadSchema>;
  mappingId: string;
  registered: TestProof;
  testOnlyHooks?: TestOnlyValidationHooks;
  usedReportIds: Set<string>;
  usedReportDigests: Set<string>;
}) {
  const encoded = args.payload.executionReport.rawReportBase64;
  if (encoded.length % 4 !== 0 || !BASE64_PATTERN.test(encoded)) {
    fail(`${args.registered.id} execution report is not canonical base64`);
  }
  const bytes = Buffer.from(encoded, "base64");
  if (
    bytes.toString("base64") !== encoded ||
    sha256(bytes) !== args.payload.executionReport.rawReportSha256
  ) {
    fail(`${args.registered.id} execution report bytes or digest are invalid`);
  }
  if (
    args.usedReportDigests.has(args.payload.executionReport.rawReportSha256)
  ) {
    fail(
      `${args.registered.id} replays execution report bytes across releases`
    );
  }
  args.usedReportDigests.add(args.payload.executionReport.rawReportSha256);
  const githubAttestationBundle = fetchEvidence({
    contract: args.contract,
    label: `${args.registered.id} GitHub Actions attestation bundle`,
    testOnlyHooks: args.testOnlyHooks,
    url: args.payload.executionReport.githubAttestationBundleUri,
  });
  if (
    sha256(githubAttestationBundle) !==
    args.payload.executionReport.githubAttestationBundleSha256
  ) {
    fail(`${args.registered.id} GitHub Actions attestation bundle is invalid`);
  }
  verifyGithubAttestedArtifact({
    artifact: bytes,
    artifactSha256: args.payload.executionReport.rawReportSha256,
    attestation: args.attestation,
    attestationBundle: githubAttestationBundle,
    contract: args.contract,
    label: `${args.registered.id} execution report`,
    testOnlyHooks: args.testOnlyHooks,
  });
  let raw: unknown;
  try {
    raw = JSON.parse(bytes.toString("utf8"));
  } catch {
    fail(`${args.registered.id} execution report is not valid JSON`);
  }
  const report = rawVitestExecutionReportSchema.parse(raw);
  const nativeEncoded = report.nativeReport.rawReportBase64;
  if (nativeEncoded.length % 4 !== 0 || !BASE64_PATTERN.test(nativeEncoded)) {
    fail(`${args.registered.id} native Vitest report is not canonical base64`);
  }
  const nativeBytes = Buffer.from(nativeEncoded, "base64");
  if (
    nativeBytes.toString("base64") !== nativeEncoded ||
    sha256(nativeBytes) !== report.nativeReport.rawReportSha256
  ) {
    fail(`${args.registered.id} native Vitest report digest is invalid`);
  }
  let nativeValue: unknown;
  try {
    nativeValue = JSON.parse(nativeBytes.toString("utf8"));
  } catch {
    fail(`${args.registered.id} native Vitest report is not valid JSON`);
  }
  const nativeReport = nativeVitestJsonReportSchema.parse(nativeValue);
  if (args.usedReportIds.has(report.executionId)) {
    fail(`${args.registered.id} replays an execution report identity`);
  }
  args.usedReportIds.add(report.executionId);
  const command = args.contract.testCommands.find(
    (candidate) => candidate.id === args.registered.commandId
  );
  if (!command) {
    fail(`${args.registered.id} has no designated runner command`);
  }
  const expectedInvocation = machineInvocation(
    args.registered,
    command.packageScript
  );
  const testResult = report.testResults[0];
  const assertion = testResult?.assertions[0];
  const nativeAssertions = nativeReport.testResults.flatMap((result) =>
    result.assertionResults.map((candidate) => ({
      ...candidate,
      targetFile: result.name,
    }))
  );
  const nativePassedAssertions = nativeAssertions.filter(
    (candidate) => candidate.status === "passed"
  );
  const nativeAssertion = nativePassedAssertions[0];
  const nonPassedAssertions = nativeAssertions.filter(
    (candidate) => candidate.status !== "passed"
  );
  const expectedTotals = {
    failed: 0,
    passed: nativePassedAssertions.length,
    pending: 0,
    skipped: 0,
    suites: nativeReport.testResults.length,
    tests: nativeAssertions.length,
    todo: 0,
  };
  if (
    report.commitSha !== args.attestation.payload.candidateSha ||
    report.sourceTreeSha !==
      args.attestation.payload.deployment.sourceTreeSha ||
    report.deploymentId !== args.attestation.payload.deployment.id ||
    report.deploymentUrl !== args.attestation.payload.deployment.url ||
    report.releaseId !== args.attestation.payload.releaseId ||
    report.mappingId !== args.mappingId ||
    report.runner.name !== command.runner ||
    report.runner.version !== command.runnerVersion ||
    report.runner.executableSha256 !== command.runnerExecutableSha256 ||
    stableLenderPortalEvidenceJson(report.invocation) !==
      stableLenderPortalEvidenceJson(expectedInvocation) ||
    report.testResults.length !== 1 ||
    testResult?.targetFile !== args.registered.targetFile ||
    testResult.assertions.length !== 1 ||
    assertion?.assertionId !==
      `${args.registered.id}::${args.registered.assertionName}` ||
    assertion?.assertionName !== args.registered.assertionName ||
    assertion?.status !== "passed" ||
    nativeReport.numFailedTests !== 0 ||
    nativeReport.numPassedTests !== nativeAssertions.length ||
    nativeReport.numTotalTests !== nativeAssertions.length ||
    nativeReport.numPassedTestSuites !== nativeReport.testResults.length ||
    nativeReport.numTotalTestSuites !== nativeReport.testResults.length ||
    nativeReport.testResults.some((result) => result.status !== "passed") ||
    nonPassedAssertions.length !== 0 ||
    stableLenderPortalEvidenceJson(report.expectedTotals) !==
      stableLenderPortalEvidenceJson(expectedTotals) ||
    nativePassedAssertions.length !== 1 ||
    nativeAssertion?.title !== args.registered.assertionName ||
    !nativeAssertion.fullName.endsWith(args.registered.assertionName) ||
    !nativeAssertion.targetFile.endsWith(`/${args.registered.targetFile}`)
  ) {
    fail(
      `${args.registered.id} execution report does not prove its designated test invocation and result`
    );
  }
  const startedAt = Date.parse(report.startedAt);
  const finishedAt = Date.parse(report.finishedAt);
  const deployedAt = Date.parse(args.attestation.payload.deployment.deployedAt);
  const issuedAt = Date.parse(args.attestation.payload.issuedAt);
  if (
    deployedAt > startedAt ||
    startedAt > finishedAt ||
    finishedAt > issuedAt ||
    nativeReport.startTime !== startedAt
  ) {
    fail(`${args.registered.id} execution report timestamps are inconsistent`);
  }
}

export function validateMachineProofGroup(args: {
  artifacts: Map<string, Artifact>;
  artifactPayloads: Map<string, unknown>;
  contract: AcceptanceContract;
  label: string;
  mappings: readonly MachineMapping[];
  proofs: readonly MachineProof[];
  testOnlyHooks?: TestOnlyValidationHooks;
  usedArtifactIds: Set<string>;
  usedReportIds: Set<string>;
  usedReportDigests: Set<string>;
  attestation: SignedAttestation;
}) {
  assertExactValues(
    args.proofs.map((proof) => proof.id),
    args.mappings.map((mapping) => mapping.id),
    args.label
  );
  const mappingById = new Map(
    args.mappings.map((mapping) => [mapping.id, mapping])
  );
  const testProofById = new Map(
    args.contract.testProofs.map((proof) => [proof.id, proof])
  );
  for (const proof of args.proofs) {
    const mapping = mappingById.get(proof.id);
    if (!mapping || proof.testProofId !== mapping.testProofId) {
      fail(
        `${proof.id} is unmapped or references the wrong registered test proof`
      );
    }
    if (args.usedArtifactIds.has(proof.artifactId)) {
      fail(`${proof.id} reuses a machine evidence artifact`);
    }
    args.usedArtifactIds.add(proof.artifactId);
    const artifact = args.artifacts.get(proof.artifactId);
    if (!artifact || artifact.kind !== "machine-test-output") {
      fail(
        `${proof.id} must reference one unique machine-test-output artifact`
      );
    }
    const payload = machineArtifactPayloadSchema.parse(
      args.artifactPayloads.get(proof.artifactId)
    );
    const registered = testProofById.get(mapping.testProofId);
    if (!registered) {
      fail(`${proof.id} references a missing registered proof`);
    }
    const expectedProof = {
      assertionName: registered.assertionName,
      commandId: registered.commandId,
      consumerIds: registered.consumerIds,
      mappingId: mapping.id,
      observableResult: registered.observableResult,
      targetFile: registered.targetFile,
      testProofId: registered.id,
    };
    if (
      stableLenderPortalEvidenceJson(payload.proof) !==
      stableLenderPortalEvidenceJson(expectedProof)
    ) {
      fail(
        `${proof.id} machine artifact is stale, unrelated, or has mismatched test semantics`
      );
    }
    decodeExecutionReport({
      attestation: args.attestation,
      contract: args.contract,
      payload,
      mappingId: mapping.id,
      registered,
      testOnlyHooks: args.testOnlyHooks,
      usedReportIds: args.usedReportIds,
      usedReportDigests: args.usedReportDigests,
    });
  }
}
