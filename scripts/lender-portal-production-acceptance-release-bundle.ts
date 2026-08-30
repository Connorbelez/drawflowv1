import { isAbsolute } from "node:path";
import { z } from "zod";

import {
  type AcceptanceContract,
  PATH_SEGMENT_SEPARATOR_PATTERN,
  SEMVER_PATTERN,
  type SignedAttestation,
  sha40Schema,
  sha256Schema,
  type TestOnlyValidationHooks,
  WINDOWS_ABSOLUTE_PATH_PATTERN,
} from "./lender-portal-production-acceptance-contract";
import {
  fetchEvidence,
  verifyGithubAttestedArtifact,
} from "./lender-portal-production-acceptance-evidence";
import {
  fail,
  sha256,
  stableLenderPortalEvidenceJson,
} from "./lender-portal-production-acceptance-io";
import { LENDER_PORTAL_PRODUCTION_TRUST_ROOT } from "./lender-portal-production-trust-root";
export const operationalRawResultSchema = z
  .object({
    commitSha: sha40Schema,
    deploymentId: z.string().min(1),
    gateId: z.string().min(1),
    recordedAt: z.string().datetime({ offset: true }),
    releaseId: z.string().uuid(),
    report: z.record(z.string(), z.unknown()),
    result: z.literal("passed"),
    schemaVersion: z.literal("lender-portal-operational-raw-result/v1"),
    sourceTreeSha: sha40Schema,
  })
  .strict();

export const releaseBundleManifestSchema = z
  .object({
    artifacts: z
      .array(
        z
          .object({
            path: z.string().min(1),
            sha256: sha256Schema,
          })
          .strict()
      )
      .min(1),
    build: z
      .object({
        command: z.literal("bun run build"),
        executablePath: z.literal(
          LENDER_PORTAL_PRODUCTION_TRUST_ROOT.executables.bun.path
        ),
        executableSha256: z.literal(
          LENDER_PORTAL_PRODUCTION_TRUST_ROOT.executables.bun.sha256
        ),
        executableVersion: z.literal(
          LENDER_PORTAL_PRODUCTION_TRUST_ROOT.executables.bun.version
        ),
        finishedAt: z.string().datetime({ offset: true }),
        startedAt: z.string().datetime({ offset: true }),
      })
      .strict(),
    commitSha: sha40Schema,
    deploymentId: z.string().min(1),
    releaseId: z.string().uuid(),
    schemaVersion: z.literal("lender-portal-release-bundle-manifest/v1"),
    sourceTreeSha: sha40Schema,
  })
  .strict();

export function validateLenderPortalReleaseBundleManifestFixture(
  value: unknown,
  deployedAt?: string
) {
  return parseReleaseBundleManifest(value, deployedAt);
}

export function assertSafeReleaseBundleArtifactPath(path: string) {
  const segments = path.split(PATH_SEGMENT_SEPARATOR_PATTERN);
  if (
    isAbsolute(path) ||
    WINDOWS_ABSOLUTE_PATH_PATTERN.test(path) ||
    path.startsWith("\\\\") ||
    segments.some(
      (segment) => segment.length === 0 || segment === "." || segment === ".."
    )
  ) {
    fail("Release bundle artifact path must be a safe relative path");
  }
}

export function parseReleaseBundleManifest(
  value: unknown,
  deployedAt?: string
) {
  const manifest = releaseBundleManifestSchema.parse(value);
  for (const artifact of manifest.artifacts) {
    assertSafeReleaseBundleArtifactPath(artifact.path);
  }
  if (
    deployedAt &&
    Date.parse(manifest.build.finishedAt) > Date.parse(deployedAt)
  ) {
    fail("Immutable release bundle build cannot finish after deployment");
  }
  return manifest;
}

export const browserTraceManifestSchema = z
  .object({
    actor: z
      .object({
        organizationIdHash: sha256Schema,
        role: z.enum([
          "backoffice",
          "builder",
          "lender",
          "lender-admin",
          "lender-staff",
        ]),
        roleHash: sha256Schema,
        subjectIdHash: sha256Schema,
      })
      .strict(),
    commitSha: sha40Schema,
    deploymentId: z.string().min(1),
    deploymentOrigin: z.string().url(),
    finishedAt: z.string().datetime({ offset: true }),
    mappingId: z.string().min(1),
    releaseId: z.string().uuid(),
    runId: z.string().uuid(),
    runner: z
      .object({
        executableSha256: sha256Schema,
        name: z.literal("playwright"),
        version: z.string().regex(SEMVER_PATTERN),
      })
      .strict(),
    schemaVersion: z.literal("lender-portal-browser-trace-manifest/v1"),
    sessionId: z.string().uuid(),
    sourceTreeSha: sha40Schema,
    startedAt: z.string().datetime({ offset: true }),
    steps: z
      .array(
        z
          .object({
            kind: z.enum(["assert", "authenticate", "navigate"]),
            observedAt: z.string().datetime({ offset: true }),
            observedResult: z.string().min(8),
            route: z.string().startsWith("/"),
            status: z.literal("passed"),
            stepId: z.string().min(1),
            traceCallId: z.string().min(1),
          })
          .strict()
      )
      .length(3),
    trace: z
      .object({
        byteLength: z.number().int().positive(),
        format: z.literal("playwright-trace-zip"),
        githubAttestationBundleSha256: sha256Schema,
        githubAttestationBundleUri: z.string().url(),
        sha256: sha256Schema,
        uri: z.string().url(),
      })
      .strict(),
  })
  .strict();

export const providerWebhookReceiptSchema = z
  .object({
    commitSha: sha40Schema,
    deploymentId: z.string().min(1),
    provider: z.literal("WorkOS"),
    providerAccountId: z.string().min(2),
    records: z.array(
      z
        .object({
          assignmentIdentityHash: sha256Schema,
          correlationId: z.string().min(2),
          deliveryId: z.string().min(2),
          mappingId: z.string().min(1),
          occurredAt: z.string().datetime({ offset: true }),
          readback: z
            .object({
              authorizationContextHash: sha256Schema,
              method: z.literal("authenticated-api-readback"),
              requestId: z.string().min(2),
              requestUrl: z.string().url(),
              responseBase64: z.string().min(16),
              responseSha256: sha256Schema,
            })
            .strict(),
          recipientHash: sha256Schema,
          organizationIdHash: sha256Schema,
          route: z.string().startsWith("/"),
          roleHash: sha256Schema,
          status: z.literal("delivered"),
          subjectIdHash: sha256Schema,
          tenantIdHash: sha256Schema,
          webhookEventId: z.string().min(2),
        })
        .strict()
    ),
    releaseId: z.string().uuid(),
    schemaVersion: z.literal("lender-portal-provider-readback-receipt/v2"),
    sourceTreeSha: sha40Schema,
    tenantIdHash: sha256Schema,
  })
  .strict();

export const inboxReceiptSchema = z
  .object({
    commitSha: sha40Schema,
    deploymentId: z.string().min(1),
    provider: z.literal("Resend"),
    providerAccountId: z.string().min(2),
    records: z.array(
      z
        .object({
          assignmentIdentityHash: sha256Schema,
          correlationId: z.string().min(2),
          deliveryId: z.string().min(2),
          linkPath: z.string().startsWith("/"),
          mappingId: z.string().min(1),
          messageId: z.string().min(2),
          occurredAt: z.string().datetime({ offset: true }),
          readback: z
            .object({
              authorizationContextHash: sha256Schema,
              method: z.literal("authenticated-api-readback"),
              requestId: z.string().min(2),
              requestUrl: z.string().url(),
              responseBase64: z.string().min(16),
              responseSha256: sha256Schema,
            })
            .strict(),
          reauthorizationResult: z.literal("authorized"),
          recipientHash: sha256Schema,
          organizationIdHash: sha256Schema,
          roleHash: sha256Schema,
          status: z.literal("delivered"),
          subjectIdHash: sha256Schema,
          tenantIdHash: sha256Schema,
        })
        .strict()
    ),
    releaseId: z.string().uuid(),
    schemaVersion: z.literal("lender-portal-inbox-readback-receipt/v2"),
    sourceTreeSha: sha40Schema,
    tenantIdHash: sha256Schema,
  })
  .strict();

export function validateRawOperationalResult(args: {
  attestation: SignedAttestation;
  contract: AcceptanceContract;
  gateId: string;
  parsedProof: Record<string, unknown>;
  testOnlyHooks?: TestOnlyValidationHooks;
}) {
  const resultArtifactUri = String(args.parsedProof.resultArtifactUri);
  const resultArtifactSha256 = String(args.parsedProof.resultArtifactSha256);
  const rawResultBytes = fetchEvidence({
    contract: args.contract,
    label: `${args.gateId} raw operational result`,
    testOnlyHooks: args.testOnlyHooks,
    url: resultArtifactUri,
  });
  if (sha256(rawResultBytes) !== resultArtifactSha256) {
    fail(`${args.gateId} raw operational result digest is invalid`);
  }
  const resultAttestationBundle = fetchEvidence({
    contract: args.contract,
    label: `${args.gateId} raw-result GitHub attestation`,
    testOnlyHooks: args.testOnlyHooks,
    url: String(args.parsedProof.resultGithubAttestationBundleUri),
  });
  if (
    sha256(resultAttestationBundle) !==
    args.parsedProof.resultGithubAttestationBundleSha256
  ) {
    fail(`${args.gateId} raw-result attestation digest is invalid`);
  }
  verifyGithubAttestedArtifact({
    artifact: rawResultBytes,
    artifactSha256: resultArtifactSha256,
    attestation: args.attestation,
    attestationBundle: resultAttestationBundle,
    contract: args.contract,
    label: `${args.gateId} raw operational result`,
    testOnlyHooks: args.testOnlyHooks,
  });
  let rawResultValue: unknown;
  try {
    rawResultValue = JSON.parse(rawResultBytes.toString("utf8"));
  } catch {
    fail(`${args.gateId} raw operational result is not valid JSON`);
  }
  const rawResult = operationalRawResultSchema.parse(rawResultValue);
  if (
    rawResult.gateId !== args.gateId ||
    rawResult.releaseId !== args.attestation.payload.releaseId ||
    rawResult.deploymentId !== args.attestation.payload.deployment.id ||
    rawResult.commitSha !== args.attestation.payload.candidateSha ||
    rawResult.sourceTreeSha !==
      args.attestation.payload.deployment.sourceTreeSha ||
    rawResult.recordedAt !== args.parsedProof.recordedAt
  ) {
    fail(`${args.gateId} raw operational result is stale or foreign`);
  }
  const expectedRawReport = Object.fromEntries(
    Object.entries(args.parsedProof).filter(
      ([key]) =>
        ![
          "resultArtifactSha256",
          "resultArtifactUri",
          "resultGithubAttestationBundleSha256",
          "resultGithubAttestationBundleUri",
        ].includes(key)
    )
  );
  if (
    stableLenderPortalEvidenceJson(rawResult.report) !==
    stableLenderPortalEvidenceJson(expectedRawReport)
  ) {
    fail(`${args.gateId} raw operational result does not prove gate semantics`);
  }
  const recordedAt = Date.parse(rawResult.recordedAt);
  if (
    recordedAt < Date.parse(args.attestation.payload.deployment.deployedAt) ||
    recordedAt > Date.parse(args.attestation.payload.issuedAt)
  ) {
    fail(`${args.gateId} raw operational result timestamp is invalid`);
  }
  return recordedAt;
}
