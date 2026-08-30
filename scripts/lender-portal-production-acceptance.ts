// biome-ignore-all lint/suspicious/noBitwiseOperators: POSIX open flags and ZIP CRC validation require bitwise arithmetic.
// biome-ignore-all lint/performance/noBarrelFile: This file is the stable package-command facade.
import { fileURLToPath } from "node:url";
import { z } from "zod";

import {
  type AcceptanceContract,
  type LenderPortalReleaseGitState,
  operationalArtifactPayloadSchema,
  type TestOnlyValidationHooks,
} from "./lender-portal-production-acceptance-contract";
import {
  validateLenderPortalProductionAcceptanceContract,
  validateTrustedPolicies,
} from "./lender-portal-production-acceptance-contract-validation";
import {
  artifactEnvelope,
  assertGitStateMatches,
  fetchEvidence,
  validateMachineProofGroup,
  verifyGithubAttestedArtifact,
  verifySignatures,
} from "./lender-portal-production-acceptance-evidence";
import {
  assertUnique,
  fail,
  readLenderPortalReleaseGitState,
  sha256,
} from "./lender-portal-production-acceptance-io";
import {
  loadAttestation,
  resolveCurrentGitState,
  validateFreshness,
  validateIdentity,
  validateOperationalProofs,
} from "./lender-portal-production-acceptance-operational-validation";
import { requiredOperationalProof } from "./lender-portal-production-acceptance-phase3";
import { parseReleaseBundleManifest } from "./lender-portal-production-acceptance-release-bundle";

export type { LenderPortalReleaseGitState } from "./lender-portal-production-acceptance-contract";
export { LENDER_PORTAL_ACCEPTANCE_CONTRACT_PATH } from "./lender-portal-production-acceptance-contract";
export {
  validateLenderPortalProductionAcceptanceContract,
  validateLenderPortalProductionAcceptanceContractValue,
  validateLenderPortalProductionRouteConsumerSourceFixture,
  validateLenderPortalRegisteredAssertionSourceFixture,
} from "./lender-portal-production-acceptance-contract-validation";
export { createLenderPortalIndependentReviewStatement } from "./lender-portal-production-acceptance-evidence";
export {
  lenderPortalPublicKeyFingerprint,
  readLenderPortalReleaseGitState,
  resolveLenderPortalRepositoryPath,
  stableLenderPortalEvidenceJson,
} from "./lender-portal-production-acceptance-io";
export { validateLenderPortalPhase3IndexCutoverSource } from "./lender-portal-production-acceptance-phase3";
export { validateLenderPortalReleaseBundleManifestFixture } from "./lender-portal-production-acceptance-release-bundle";
export function validateLenderPortalReleaseAcceptanceEvidence(args: {
  contract: AcceptanceContract;
  contractSha256: string;
  evidenceLocation: string;
  gitState: LenderPortalReleaseGitState;
  now?: number;
  repositoryRoot: string;
  testOnlyHooks?: TestOnlyValidationHooks;
}) {
  validateTrustedPolicies(args.contract);
  if (!args.gitState.isClean || args.gitState.dirtyEntryCount !== 0) {
    fail(
      `Release validation requires a clean immutable checkout; found ${args.gitState.dirtyEntryCount} dirty entries`
    );
  }
  assertGitStateMatches(
    args.gitState,
    resolveCurrentGitState(args),
    "Release validation start"
  );
  const attestation = loadAttestation({
    contract: args.contract,
    evidenceLocation: args.evidenceLocation,
    testOnlyHooks: args.testOnlyHooks,
  });
  validateIdentity({
    attestation,
    contract: args.contract,
    contractSha256: args.contractSha256,
    gitState: args.gitState,
  });
  verifySignatures(attestation, args.testOnlyHooks);

  const artifactIds = attestation.payload.artifacts.map(
    (artifact) => artifact.id
  );
  const artifactUris = attestation.payload.artifacts.map(
    (artifact) => artifact.uri
  );
  const artifactDigests = attestation.payload.artifacts.map(
    (artifact) => artifact.sha256
  );
  assertUnique(artifactIds, "Evidence artifact IDs");
  assertUnique(artifactUris, "Evidence artifact URIs");
  assertUnique(artifactDigests, "Evidence artifact digests");
  const artifacts = new Map(
    attestation.payload.artifacts.map((artifact) => [artifact.id, artifact])
  );
  const independentArtifact = artifacts.get(
    attestation.payload.independentAcceptance.artifactId
  );
  const releaseArtifact = artifacts.get(
    attestation.payload.deployment.releaseArtifactId
  );
  if (
    !independentArtifact ||
    independentArtifact.kind !== "independent-review" ||
    independentArtifact.sha256 !==
      attestation.payload.independentAcceptance.artifactSha256
  ) {
    fail(
      "Independent acceptance must reference its own durable independent-review artifact"
    );
  }
  if (
    !releaseArtifact ||
    releaseArtifact.kind !== "release-artifact" ||
    releaseArtifact.sha256 !==
      attestation.payload.deployment.releaseArtifactSha256
  ) {
    fail(
      "Deployment must reference its own durable immutable release artifact"
    );
  }
  if (
    independentArtifact.uri === attestation.payload.attestationUri ||
    independentArtifact.uri === releaseArtifact.uri ||
    independentArtifact.sha256 === releaseArtifact.sha256
  ) {
    fail(
      "Independent acceptance evidence must be distinct from release evidence and attestation"
    );
  }

  const artifactPayloads = new Map<string, unknown>();
  for (const artifact of attestation.payload.artifacts) {
    const contents = fetchEvidence({
      contract: args.contract,
      label: artifact.id,
      testOnlyHooks: args.testOnlyHooks,
      url: artifact.uri,
    });
    artifactPayloads.set(
      artifact.id,
      artifactEnvelope(contents, artifact, args.gitState)
    );
  }
  const releasePayload = operationalArtifactPayloadSchema.parse(
    artifactPayloads.get(releaseArtifact.id)
  );
  requiredOperationalProof(
    "exact-release-commit",
    releasePayload.proof,
    attestation
  );
  const releaseBundle = fetchEvidence({
    contract: args.contract,
    label: "Immutable release bundle",
    testOnlyHooks: args.testOnlyHooks,
    url: attestation.payload.deployment.releaseBundleUri,
  });
  if (
    sha256(releaseBundle) !== attestation.payload.deployment.releaseBundleSha256
  ) {
    fail(
      "Immutable release bundle digest does not match the signed deployment"
    );
  }
  const releaseBundleAttestation = fetchEvidence({
    contract: args.contract,
    label: "Immutable release bundle GitHub attestation",
    testOnlyHooks: args.testOnlyHooks,
    url: attestation.payload.deployment.releaseBundleGithubAttestationUri,
  });
  if (
    sha256(releaseBundleAttestation) !==
    attestation.payload.deployment.releaseBundleGithubAttestationSha256
  ) {
    fail("Immutable release bundle attestation digest is invalid");
  }
  verifyGithubAttestedArtifact({
    allowPreDeployment: true,
    artifact: releaseBundle,
    artifactSha256: attestation.payload.deployment.releaseBundleSha256,
    attestation,
    attestationBundle: releaseBundleAttestation,
    contract: args.contract,
    label: "Immutable release bundle",
    testOnlyHooks: args.testOnlyHooks,
  });
  let releaseManifestValue: unknown;
  try {
    releaseManifestValue = JSON.parse(releaseBundle.toString("utf8"));
  } catch {
    fail("Immutable release bundle does not contain build provenance JSON");
  }
  const releaseManifest = parseReleaseBundleManifest(
    releaseManifestValue,
    attestation.payload.deployment.deployedAt
  );
  if (
    releaseManifest.releaseId !== attestation.payload.releaseId ||
    releaseManifest.commitSha !== attestation.payload.candidateSha ||
    releaseManifest.sourceTreeSha !==
      attestation.payload.deployment.sourceTreeSha ||
    releaseManifest.deploymentId !== attestation.payload.deployment.id ||
    Date.parse(releaseManifest.build.startedAt) >
      Date.parse(releaseManifest.build.finishedAt) ||
    Date.parse(releaseManifest.build.finishedAt) >
      Date.parse(attestation.payload.issuedAt)
  ) {
    fail("Immutable release bundle build provenance is stale or foreign");
  }
  assertUnique(
    releaseManifest.artifacts.map((artifact) => artifact.path),
    "Release bundle artifact paths"
  );
  assertUnique(
    releaseManifest.artifacts.map((artifact) => artifact.sha256),
    "Release bundle artifact digests"
  );
  const independentPayload = operationalArtifactPayloadSchema.parse(
    artifactPayloads.get(independentArtifact.id)
  );
  z.object({
    attestationUri: z.literal(attestation.payload.attestationUri),
    decision: z.literal("accepted"),
    releaseArtifactId: z.literal(releaseArtifact.id),
    releaseArtifactSha256: z.literal(releaseArtifact.sha256),
    reviewerDisplayName: z.literal(
      attestation.payload.independentAcceptance.reviewerDisplayName
    ),
    reviewerId: z.literal(attestation.payload.independentAcceptance.reviewerId),
  })
    .strict()
    .parse(independentPayload.proof);

  const usedArtifactIds = new Set<string>();
  const usedReportDigests = new Set<string>();
  const usedReportIds = new Set<string>();
  validateMachineProofGroup({
    attestation,
    artifacts,
    artifactPayloads,
    contract: args.contract,
    label: "Production surface evidence",
    mappings: args.contract.surfaces,
    proofs: attestation.payload.surfaces,
    testOnlyHooks: args.testOnlyHooks,
    usedArtifactIds,
    usedReportDigests,
    usedReportIds,
  });
  validateMachineProofGroup({
    attestation,
    artifacts,
    artifactPayloads,
    contract: args.contract,
    label: "Journey evidence",
    mappings: args.contract.journeys,
    proofs: attestation.payload.journeys,
    testOnlyHooks: args.testOnlyHooks,
    usedArtifactIds,
    usedReportDigests,
    usedReportIds,
  });
  validateMachineProofGroup({
    attestation,
    artifacts,
    artifactPayloads,
    contract: args.contract,
    label: "Vertical-slice evidence",
    mappings: args.contract.verticalSliceGates,
    proofs: attestation.payload.verticalSliceGates,
    testOnlyHooks: args.testOnlyHooks,
    usedArtifactIds,
    usedReportDigests,
    usedReportIds,
  });
  validateOperationalProofs({
    artifactPayloads,
    artifacts,
    attestation,
    contract: args.contract,
    repositoryRoot: args.repositoryRoot,
    testOnlyHooks: args.testOnlyHooks,
    usedArtifactIds,
  });
  validateFreshness(args.contract, attestation, args.now ?? Date.now());
  assertGitStateMatches(
    args.gitState,
    resolveCurrentGitState(args),
    "Release validation completion"
  );
  return attestation;
}

function parseCliArgument(prefix: string) {
  return process.argv
    .slice(2)
    .find((argument) => argument.startsWith(prefix))
    ?.slice(prefix.length);
}

if (import.meta.main) {
  const repositoryRoot = fileURLToPath(new URL("..", import.meta.url));
  const contractResult = validateLenderPortalProductionAcceptanceContract({
    repositoryRoot,
  });
  const evidenceLocation = parseCliArgument("--evidence=");
  const contractOnly = process.argv.slice(2).includes("--contract-only");
  if (contractOnly && evidenceLocation) {
    fail("Use either --contract-only or --evidence, not both");
  }
  if (contractOnly) {
    console.log(
      `Non-release acceptance contract validation passed (${contractResult.contractSha256})`
    );
  } else {
    if (!evidenceLocation) {
      fail(
        "Release acceptance validation requires --evidence=<trusted GitHub release attestation URL>"
      );
    }
    const gitState = readLenderPortalReleaseGitState(repositoryRoot);
    validateLenderPortalReleaseAcceptanceEvidence({
      contract: contractResult.contract,
      contractSha256: contractResult.contractSha256,
      evidenceLocation,
      gitState,
      repositoryRoot,
    });
  }
}
