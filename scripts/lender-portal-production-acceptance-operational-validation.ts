import type { z } from "zod";

import {
  type AcceptanceContract,
  type Artifact,
  type LenderPortalReleaseGitState,
  operationalArtifactPayloadSchema,
  type productionRouteConsumerSchema,
  type SignedAttestation,
  signedAttestationSchema,
  type TestOnlyValidationHooks,
} from "./lender-portal-production-acceptance-contract";
import { allMachineMappings } from "./lender-portal-production-acceptance-contract-validation";
import {
  fetchEvidence,
  validateInitialEvidenceUrl,
  verifyGithubAttestedArtifact,
} from "./lender-portal-production-acceptance-evidence";
import {
  assertExactValues,
  fail,
  readLenderPortalReleaseGitState,
  sha256,
  stableLenderPortalEvidenceJson,
} from "./lender-portal-production-acceptance-io";
import {
  type Phase3CutoverProof,
  requiredOperationalProof,
  validatePhase3CutoverSemantics,
} from "./lender-portal-production-acceptance-phase3";
import {
  inboxReceiptSchema,
  providerWebhookReceiptSchema,
  validateRawOperationalResult,
} from "./lender-portal-production-acceptance-release-bundle";
import type {
  BrowserObservation,
  OperationalEvidenceUniqueness,
} from "./lender-portal-production-acceptance-trace-parser";
import {
  trustedEvidencePrincipalForMapping,
  trustedProviderTenantIdHash,
  validateBrowserObservations,
} from "./lender-portal-production-acceptance-trace-validation";
export function mappingIdsForOperationalGate(
  contract: AcceptanceContract,
  gateId: string
) {
  return allMachineMappings(contract)
    .filter((mapping) => mapping.operationalGateIds.includes(gateId))
    .map((mapping) => mapping.id);
}

export function canonicalRouteForMapping(
  contract: AcceptanceContract,
  mappingId: string
) {
  const mapping = allMachineMappings(contract).find(
    (candidate) => candidate.id === mappingId
  );
  const consumer = mapping?.consumerIds
    .map((consumerId) =>
      contract.consumers.find((candidate) => candidate.id === consumerId)
    )
    .find(
      (candidate): candidate is z.infer<typeof productionRouteConsumerSchema> =>
        candidate?.class === "production-route"
    );
  if (!consumer) {
    fail(`${mappingId} has no canonical notification route`);
  }
  return consumer.routerPath;
}

export function canonicalProviderAuthorizationContextHash(args: {
  assignmentIdentityHash: string;
  mappingId: string;
  organizationIdHash: string;
  provider: "Resend" | "WorkOS";
  recipientHash: string;
  roleHash: string;
  subjectIdHash: string;
  tenantIdHash: string;
}) {
  return sha256(
    stableLenderPortalEvidenceJson({
      assignmentIdentityHash: args.assignmentIdentityHash,
      mappingId: args.mappingId,
      organizationIdHash: args.organizationIdHash,
      provider: args.provider,
      recipientHash: args.recipientHash,
      roleHash: args.roleHash,
      subjectIdHash: args.subjectIdHash,
      tenantIdHash: args.tenantIdHash,
    })
  );
}

export function decodeAuthenticatedProviderReadback(args: {
  expected: Record<string, unknown>;
  expectedAuthorizationContextHash: string;
  expectedResourceId: string;
  provider: "Resend" | "WorkOS";
  readback: {
    authorizationContextHash: string;
    method: "authenticated-api-readback";
    requestId: string;
    requestUrl: string;
    responseBase64: string;
    responseSha256: string;
  };
  uniqueness: OperationalEvidenceUniqueness;
}) {
  if (args.uniqueness.providerRequestIds.has(args.readback.requestId)) {
    fail(`${args.provider} authenticated API request ID is reused`);
  }
  args.uniqueness.providerRequestIds.add(args.readback.requestId);
  const response = Buffer.from(args.readback.responseBase64, "base64");
  if (
    response.toString("base64") !== args.readback.responseBase64 ||
    sha256(response) !== args.readback.responseSha256
  ) {
    fail(`${args.provider} authenticated API response digest is invalid`);
  }
  const requestUrl = new URL(args.readback.requestUrl);
  const expectedOrigin =
    args.provider === "WorkOS"
      ? "https://api.workos.com"
      : "https://api.resend.com";
  const expectedPath = `${
    args.provider === "WorkOS" ? "/events/" : "/emails/"
  }${encodeURIComponent(args.expectedResourceId)}`;
  if (
    requestUrl.origin !== expectedOrigin ||
    args.readback.authorizationContextHash !==
      args.expectedAuthorizationContextHash
  ) {
    fail(`${args.provider} evidence is not an authenticated provider readback`);
  }
  if (requestUrl.pathname !== expectedPath || requestUrl.search) {
    fail(
      `${args.provider} authenticated provider resource does not match its receipt record`
    );
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(response.toString("utf8"));
  } catch {
    fail(`${args.provider} authenticated API response is not JSON`);
  }
  if (
    stableLenderPortalEvidenceJson(parsed) !==
    stableLenderPortalEvidenceJson(args.expected)
  ) {
    fail(`${args.provider} authenticated API response is stale or fabricated`);
  }
}

export function validateProviderReceipt(args: {
  attestation: SignedAttestation;
  contract: AcceptanceContract;
  parsedProof: Record<string, unknown>;
  recordedAt: number;
  testOnlyHooks?: TestOnlyValidationHooks;
  uniqueness: OperationalEvidenceUniqueness;
}) {
  const receiptUri = String(args.parsedProof.providerReceiptUri);
  if (args.uniqueness.receiptUris.has(receiptUri)) {
    fail("Provider delivery receipt is reused");
  }
  args.uniqueness.receiptUris.add(receiptUri);
  const receipt = fetchEvidence({
    contract: args.contract,
    label: "Provider delivery receipt",
    testOnlyHooks: args.testOnlyHooks,
    url: receiptUri,
  });
  if (sha256(receipt) !== args.parsedProof.providerReceiptSha256) {
    fail("Provider delivery receipt digest is invalid");
  }
  const bundle = fetchEvidence({
    contract: args.contract,
    label: "Provider delivery GitHub attestation",
    testOnlyHooks: args.testOnlyHooks,
    url: String(args.parsedProof.githubAttestationBundleUri),
  });
  if (sha256(bundle) !== args.parsedProof.githubAttestationBundleSha256) {
    fail("Provider delivery attestation digest is invalid");
  }
  verifyGithubAttestedArtifact({
    artifact: receipt,
    artifactSha256: String(args.parsedProof.providerReceiptSha256),
    attestation: args.attestation,
    attestationBundle: bundle,
    contract: args.contract,
    label: "Provider delivery receipt",
    testOnlyHooks: args.testOnlyHooks,
  });
  const parsed = providerWebhookReceiptSchema.parse(
    JSON.parse(receipt.toString("utf8"))
  );
  const expectedMappingIds = mappingIdsForOperationalGate(
    args.contract,
    "provider-and-webhook-delivery"
  );
  const expectedTenantIdHash = trustedProviderTenantIdHash(
    args.contract,
    expectedMappingIds,
    "WorkOS"
  );
  if (
    parsed.commitSha !== args.attestation.payload.candidateSha ||
    parsed.sourceTreeSha !==
      args.attestation.payload.deployment.sourceTreeSha ||
    parsed.deploymentId !== args.attestation.payload.deployment.id ||
    parsed.releaseId !== args.attestation.payload.releaseId ||
    parsed.provider !== args.parsedProof.provider ||
    parsed.providerAccountId !== args.parsedProof.providerAccountId ||
    stableLenderPortalEvidenceJson(args.parsedProof.mappingIds) !==
      stableLenderPortalEvidenceJson(expectedMappingIds)
  ) {
    fail("Provider delivery receipt is fabricated, stale, or unrelated");
  }
  if (
    parsed.tenantIdHash !== expectedTenantIdHash ||
    args.parsedProof.tenantIdHash !== expectedTenantIdHash
  ) {
    fail("WorkOS tenant is not bound to the source-owned production principal");
  }
  assertExactValues(
    parsed.records.map((record) => record.mappingId),
    expectedMappingIds,
    "Provider receipt mapping records"
  );
  for (const record of parsed.records) {
    const trustedPrincipal = trustedEvidencePrincipalForMapping(
      args.contract,
      record.mappingId
    );
    const occurredAt = Date.parse(record.occurredAt);
    if (
      record.assignmentIdentityHash !==
        trustedPrincipal.assignmentIdentityHash ||
      record.tenantIdHash !== expectedTenantIdHash ||
      record.organizationIdHash !== trustedPrincipal.organizationIdHash ||
      record.recipientHash !== trustedPrincipal.recipientHash ||
      record.roleHash !== trustedPrincipal.roleHash ||
      record.subjectIdHash !== trustedPrincipal.subjectIdHash
    ) {
      fail(
        `${record.mappingId} provider tenant, organization, role, or recipient is not bound to its source-owned production evidence principal`
      );
    }
    if (
      record.route !==
        canonicalRouteForMapping(args.contract, record.mappingId) ||
      occurredAt < Date.parse(args.attestation.payload.deployment.deployedAt) ||
      occurredAt > args.recordedAt
    ) {
      fail(`${record.mappingId} provider receipt is stale or misrouted`);
    }
    if (
      args.uniqueness.deliveryIds.has(record.deliveryId) ||
      args.uniqueness.eventIds.has(record.webhookEventId) ||
      args.uniqueness.correlationIds.has(record.correlationId)
    ) {
      fail(`${record.mappingId} provider identifiers are reused`);
    }
    args.uniqueness.deliveryIds.add(record.deliveryId);
    args.uniqueness.eventIds.add(record.webhookEventId);
    args.uniqueness.correlationIds.add(record.correlationId);
    decodeAuthenticatedProviderReadback({
      expected: {
        accountId: parsed.providerAccountId,
        assignmentIdentityHash: trustedPrincipal.assignmentIdentityHash,
        correlationId: record.correlationId,
        deliveryId: record.deliveryId,
        organizationIdHash: trustedPrincipal.organizationIdHash,
        recipientHash: trustedPrincipal.recipientHash,
        roleHash: trustedPrincipal.roleHash,
        route: record.route,
        status: record.status,
        subjectIdHash: trustedPrincipal.subjectIdHash,
        tenantIdHash: expectedTenantIdHash,
        webhookEventId: record.webhookEventId,
      },
      expectedAuthorizationContextHash:
        canonicalProviderAuthorizationContextHash({
          assignmentIdentityHash: trustedPrincipal.assignmentIdentityHash,
          mappingId: record.mappingId,
          organizationIdHash: trustedPrincipal.organizationIdHash,
          provider: "WorkOS",
          recipientHash: trustedPrincipal.recipientHash,
          roleHash: trustedPrincipal.roleHash,
          subjectIdHash: trustedPrincipal.subjectIdHash,
          tenantIdHash: expectedTenantIdHash,
        }),
      expectedResourceId: record.webhookEventId,
      provider: "WorkOS",
      readback: record.readback,
      uniqueness: args.uniqueness,
    });
  }
}

export function validateInboxReceipt(args: {
  attestation: SignedAttestation;
  contract: AcceptanceContract;
  parsedProof: Record<string, unknown>;
  recordedAt: number;
  testOnlyHooks?: TestOnlyValidationHooks;
  uniqueness: OperationalEvidenceUniqueness;
}) {
  const receiptUri = String(args.parsedProof.receiptUri);
  if (args.uniqueness.receiptUris.has(receiptUri)) {
    fail("Inbox receipt is reused");
  }
  args.uniqueness.receiptUris.add(receiptUri);
  const receipt = fetchEvidence({
    contract: args.contract,
    label: "Inbox delivery and reauthorization receipt",
    testOnlyHooks: args.testOnlyHooks,
    url: receiptUri,
  });
  if (sha256(receipt) !== args.parsedProof.receiptSha256) {
    fail("Inbox receipt digest is invalid");
  }
  const bundle = fetchEvidence({
    contract: args.contract,
    label: "Inbox receipt GitHub attestation",
    testOnlyHooks: args.testOnlyHooks,
    url: String(args.parsedProof.githubAttestationBundleUri),
  });
  if (sha256(bundle) !== args.parsedProof.githubAttestationBundleSha256) {
    fail("Inbox receipt attestation digest is invalid");
  }
  verifyGithubAttestedArtifact({
    artifact: receipt,
    artifactSha256: String(args.parsedProof.receiptSha256),
    attestation: args.attestation,
    attestationBundle: bundle,
    contract: args.contract,
    label: "Inbox receipt",
    testOnlyHooks: args.testOnlyHooks,
  });
  const parsed = inboxReceiptSchema.parse(JSON.parse(receipt.toString("utf8")));
  const expectedMappingIds = mappingIdsForOperationalGate(
    args.contract,
    "inbox-and-reauthorized-links"
  );
  const expectedTenantIdHash = trustedProviderTenantIdHash(
    args.contract,
    expectedMappingIds,
    "Resend"
  );
  if (
    parsed.commitSha !== args.attestation.payload.candidateSha ||
    parsed.sourceTreeSha !==
      args.attestation.payload.deployment.sourceTreeSha ||
    parsed.deploymentId !== args.attestation.payload.deployment.id ||
    parsed.releaseId !== args.attestation.payload.releaseId ||
    parsed.provider !== args.parsedProof.inboxProvider ||
    parsed.providerAccountId !== args.parsedProof.providerAccountId ||
    stableLenderPortalEvidenceJson(args.parsedProof.mappingIds) !==
      stableLenderPortalEvidenceJson(expectedMappingIds)
  ) {
    fail("Inbox receipt is fabricated, stale, or unrelated");
  }
  if (
    parsed.tenantIdHash !== expectedTenantIdHash ||
    args.parsedProof.tenantIdHash !== expectedTenantIdHash
  ) {
    fail("Resend tenant is not bound to the source-owned production principal");
  }
  assertExactValues(
    parsed.records.map((record) => record.mappingId),
    expectedMappingIds,
    "Inbox receipt mapping records"
  );
  for (const record of parsed.records) {
    const trustedPrincipal = trustedEvidencePrincipalForMapping(
      args.contract,
      record.mappingId
    );
    const occurredAt = Date.parse(record.occurredAt);
    if (
      record.assignmentIdentityHash !==
        trustedPrincipal.assignmentIdentityHash ||
      record.tenantIdHash !== expectedTenantIdHash ||
      record.organizationIdHash !== trustedPrincipal.organizationIdHash ||
      record.recipientHash !== trustedPrincipal.recipientHash ||
      record.roleHash !== trustedPrincipal.roleHash ||
      record.subjectIdHash !== trustedPrincipal.subjectIdHash
    ) {
      fail(
        `${record.mappingId} inbox tenant, organization, role, or recipient is not bound to its source-owned production evidence principal`
      );
    }
    if (
      record.linkPath !==
        canonicalRouteForMapping(args.contract, record.mappingId) ||
      occurredAt < Date.parse(args.attestation.payload.deployment.deployedAt) ||
      occurredAt > args.recordedAt
    ) {
      fail(`${record.mappingId} inbox receipt is stale or misrouted`);
    }
    if (
      args.uniqueness.deliveryIds.has(record.deliveryId) ||
      args.uniqueness.messageIds.has(record.messageId) ||
      args.uniqueness.correlationIds.has(record.correlationId)
    ) {
      fail(`${record.mappingId} inbox identifiers are reused`);
    }
    args.uniqueness.deliveryIds.add(record.deliveryId);
    args.uniqueness.messageIds.add(record.messageId);
    args.uniqueness.correlationIds.add(record.correlationId);
    decodeAuthenticatedProviderReadback({
      expected: {
        accountId: parsed.providerAccountId,
        assignmentIdentityHash: trustedPrincipal.assignmentIdentityHash,
        correlationId: record.correlationId,
        deliveryId: record.deliveryId,
        linkPath: record.linkPath,
        messageId: record.messageId,
        organizationIdHash: trustedPrincipal.organizationIdHash,
        recipientHash: trustedPrincipal.recipientHash,
        roleHash: trustedPrincipal.roleHash,
        status: record.status,
        subjectIdHash: trustedPrincipal.subjectIdHash,
        tenantIdHash: expectedTenantIdHash,
      },
      expectedAuthorizationContextHash:
        canonicalProviderAuthorizationContextHash({
          assignmentIdentityHash: trustedPrincipal.assignmentIdentityHash,
          mappingId: record.mappingId,
          organizationIdHash: trustedPrincipal.organizationIdHash,
          provider: "Resend",
          recipientHash: trustedPrincipal.recipientHash,
          roleHash: trustedPrincipal.roleHash,
          subjectIdHash: trustedPrincipal.subjectIdHash,
          tenantIdHash: expectedTenantIdHash,
        }),
      expectedResourceId: record.messageId,
      provider: "Resend",
      readback: record.readback,
      uniqueness: args.uniqueness,
    });
  }
}

export function validateOperationalProofs(args: {
  artifactPayloads: Map<string, unknown>;
  artifacts: Map<string, Artifact>;
  attestation: SignedAttestation;
  contract: AcceptanceContract;
  repositoryRoot: string;
  testOnlyHooks?: TestOnlyValidationHooks;
  usedArtifactIds: Set<string>;
}) {
  const proofs = args.attestation.payload.operationalGates;
  assertExactValues(
    proofs.map((proof) => proof.id),
    args.contract.operationalGates.map((gate) => gate.id),
    "Operational evidence"
  );
  const gates = new Map(
    args.contract.operationalGates.map((gate) => [gate.id, gate])
  );
  const uniqueness: OperationalEvidenceUniqueness = {
    authSessionDigests: new Set(),
    correlationIds: new Set(),
    deliveryIds: new Set(),
    eventIds: new Set(),
    manifestUris: new Set(),
    messageIds: new Set(),
    providerRequestIds: new Set(),
    receiptUris: new Set(),
    runIds: new Set(),
    sessionIds: new Set(),
    traceDigests: new Set(),
    traceUris: new Set(),
  };
  for (const proof of proofs) {
    if (args.usedArtifactIds.has(proof.artifactId)) {
      fail(`${proof.id} reuses an evidence artifact`);
    }
    args.usedArtifactIds.add(proof.artifactId);
    const gate = gates.get(proof.id);
    const artifact = args.artifacts.get(proof.artifactId);
    if (!(gate && artifact) || artifact.kind !== gate.artifactKind) {
      fail(`${proof.id} references missing or wrong-kind gate evidence`);
    }
    const payload = operationalArtifactPayloadSchema.parse(
      args.artifactPayloads.get(proof.artifactId)
    );
    const parsedProof = requiredOperationalProof(
      proof.id,
      payload.proof,
      args.attestation
    ) as Record<string, unknown>;
    const recordedAt = validateRawOperationalResult({
      attestation: args.attestation,
      contract: args.contract,
      gateId: proof.id,
      parsedProof,
      testOnlyHooks: args.testOnlyHooks,
    });
    if (proof.id === "authenticated-production-browser") {
      validateBrowserObservations({
        attestation: args.attestation,
        contract: args.contract,
        observations: parsedProof.observations as BrowserObservation[],
        recordedAt,
        testOnlyHooks: args.testOnlyHooks,
        uniqueness,
      });
    }
    if (proof.id === "provider-and-webhook-delivery") {
      validateProviderReceipt({
        attestation: args.attestation,
        contract: args.contract,
        parsedProof,
        recordedAt,
        testOnlyHooks: args.testOnlyHooks,
        uniqueness,
      });
    }
    if (proof.id === "inbox-and-reauthorized-links") {
      validateInboxReceipt({
        attestation: args.attestation,
        contract: args.contract,
        parsedProof,
        recordedAt,
        testOnlyHooks: args.testOnlyHooks,
        uniqueness,
      });
    }
    if (proof.id === "phase3-migration-cutover") {
      validatePhase3CutoverSemantics({
        attestation: args.attestation,
        proof: parsedProof as unknown as Phase3CutoverProof,
        repositoryRoot: args.repositoryRoot,
        testOnlyHooks: args.testOnlyHooks,
      });
    }
  }
}

export function validateFreshness(
  contract: AcceptanceContract,
  attestation: SignedAttestation,
  now: number
) {
  const issuedAt = Date.parse(attestation.payload.issuedAt);
  const deployedAt = Date.parse(attestation.payload.deployment.deployedAt);
  const verifiedAt = Date.parse(
    attestation.payload.independentAcceptance.verifiedAt
  );
  const maximumAge = contract.attestationMaxAgeHours * 60 * 60 * 1000;
  if (
    deployedAt > now ||
    now - deployedAt > maximumAge ||
    verifiedAt > now ||
    now - verifiedAt > maximumAge ||
    issuedAt > now ||
    now - issuedAt > maximumAge ||
    deployedAt > verifiedAt ||
    verifiedAt > issuedAt
  ) {
    fail("Release attestation is stale or has an inconsistent time sequence");
  }
}

export function validateIdentity(args: {
  attestation: SignedAttestation;
  contract: AcceptanceContract;
  contractSha256: string;
  gitState: LenderPortalReleaseGitState;
}) {
  const payload = args.attestation.payload;
  if (payload.contractSha256 !== args.contractSha256) {
    fail("Release attestation does not match the current acceptance contract");
  }
  if (
    payload.candidateSha !== args.gitState.headSha ||
    payload.deployment.deployedCommitSha !== args.gitState.headSha
  ) {
    fail(
      "Release attestation commit does not match the immutable checkout HEAD"
    );
  }
  if (payload.deployment.sourceTreeSha !== args.gitState.treeSha) {
    fail(
      "Release attestation source tree does not match the immutable checkout tree"
    );
  }
  const deploymentUrl = new URL(payload.deployment.url);
  if (
    deploymentUrl.protocol !== "https:" ||
    deploymentUrl.username ||
    deploymentUrl.password ||
    deploymentUrl.port ||
    !args.contract.trustedDeploymentOrigins.includes(deploymentUrl.origin)
  ) {
    fail(
      "Release attestation deployment URL is outside the trusted production domain policy"
    );
  }
}

export function loadAttestation(args: {
  contract: AcceptanceContract;
  evidenceLocation: string;
  testOnlyHooks?: TestOnlyValidationHooks;
}) {
  const contents = fetchEvidence({
    contract: args.contract,
    label: "Release attestation",
    testOnlyHooks: args.testOnlyHooks,
    url: args.evidenceLocation,
  });
  const attestation = signedAttestationSchema.parse(
    JSON.parse(contents.toString("utf8"))
  );
  validateInitialEvidenceUrl(
    args.contract,
    attestation.payload.attestationUri,
    "Signed release attestation"
  );
  if (attestation.payload.attestationUri !== args.evidenceLocation) {
    fail("Signed release attestation URI does not match its durable location");
  }
  return attestation;
}

export function resolveCurrentGitState(args: {
  repositoryRoot: string;
  testOnlyHooks?: TestOnlyValidationHooks;
}) {
  if (args.testOnlyHooks) {
    if (process.env.NODE_ENV !== "test") {
      fail("Release validation hooks are test-only");
    }
    return args.testOnlyHooks.readGitState();
  }
  return readLenderPortalReleaseGitState(args.repositoryRoot);
}
