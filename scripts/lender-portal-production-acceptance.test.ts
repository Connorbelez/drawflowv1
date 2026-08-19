import {
  createHash,
  generateKeyPairSync,
  sign,
  type KeyObject,
} from "node:crypto";
import { spawnSync } from "node:child_process";
import {
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { unzipSync, zipSync } from "fflate";
import ts from "typescript";
import { describe, expect, test } from "vitest";
import {
  createLenderPortalIndependentReviewStatement,
  LENDER_PORTAL_ACCEPTANCE_CONTRACT_PATH,
  lenderPortalPublicKeyFingerprint,
  type LenderPortalReleaseGitState,
  resolveLenderPortalRepositoryPath,
  stableLenderPortalEvidenceJson,
  validateLenderPortalProductionAcceptanceContract,
  validateLenderPortalProductionAcceptanceContractValue,
  validateLenderPortalPhase3IndexCutoverSource,
  validateLenderPortalRegisteredAssertionSourceFixture,
  validateLenderPortalReleaseBundleManifestFixture,
  validateLenderPortalProductionRouteConsumerSourceFixture,
  validateLenderPortalReleaseAcceptanceEvidence,
} from "./lender-portal-production-acceptance";
import { LENDER_PORTAL_PRODUCTION_TRUST_ROOT } from "./lender-portal-production-trust-root";

const candidateSha = "a".repeat(40);
const sourceTreeSha = "b".repeat(40);
const now = Date.parse("2026-08-18T13:00:00.000Z");
const releaseBaseUrl =
  "https://github.com/Connorbelez/drawflowv1/releases/download/v1.0.0/";
const attestationUrl = `${releaseBaseUrl}LP-P9-04-${candidateSha}.json`;
const cleanGitState: LenderPortalReleaseGitState = {
  dirtyEntryCount: 0,
  headSha: candidateSha,
  isClean: true,
  treeSha: sourceTreeSha,
};

const EXPECTED_MACHINE_BINDINGS = [
  ["LP-SURFACE-DASHBOARD", "proof-surface-dashboard", "src/routes/lender/-dashboard-route.test.tsx", "renders every Review requirement beyond the former three-row cap"],
  ["LP-SURFACE-BUILD-DETAIL", "proof-surface-build-detail", "src/routes/lender/builds/-build-detail-route.test.tsx", "queries the authorized canonical boundary and renders promoted Variant C"],
  ["LP-SURFACE-MILESTONE-QUEUE", "proof-surface-milestones", "src/routes/lender/-milestones-route.test.tsx", "opens canonical queue data through the ordinary target-only route contract"],
  ["LP-SURFACE-DRAW-QUEUE", "proof-surface-draws", "src/routes/lender/-draws-route.test.tsx", "opens canonical queue data through the ordinary target-only route contract"],
  ["LP-E2E-01", "proof-e2e-01", "src/routes/lender/proposals/-index.test.tsx", "renders the public lender Proposal list query through the production route"],
  ["LP-E2E-02", "proof-e2e-02", "src/routes/lender/proposals/-detail-route.test.tsx", "wires an eligible lender closing through the supported route"],
  ["LP-E2E-03", "proof-e2e-03", "src/routes/lender/proposals/-detail-route.test.tsx", "wires separate activation and opens the returned authorized Build"],
  ["LP-E2E-04", "proof-e2e-04", "src/routes/lender/proposals/-detail-route.test.tsx", "renders sealed revision checkpoints and decisions without private fields"],
  ["LP-E2E-05", "proof-e2e-05", "src/routes/lender/-milestones-route.test.tsx", "renders the ordinary Phase 5 detail from a queue target"],
  ["LP-E2E-06", "proof-e2e-06", "src/routes/builder/proposals/-proposal.$proposalId.test.ts", "wires a numeric notification URL cycle to Builder correction and the returned N+1 tuple"],
  ["LP-E2E-07", "proof-e2e-07", "src/routes/lender/-draws-route.test.tsx", "renders the canonical review surface for a complete deep-link tuple"],
  ["LP-E2E-08", "proof-e2e-08", "src/routes/backoffice/lenders/-lender-control-plane.test.tsx", "reaches the promoted Variant E directory with canonical scoped members"],
  ["LP-E2E-09", "proof-e2e-09", "src/routes/lender/-dashboard-route.test.tsx", "does not request portfolio data without an assigned lender organization"],
  ["LP-E2E-10", "proof-e2e-10", "src/routes/lender/-notification-review-routes.test.ts", "branches current and withdrawn Proposal detail at the route query boundary"],
  ["LP-VSG-01", "proof-vsg-01", "src/routes/lender/-dashboard-route.test.tsx", "keeps an assigned lender in loading state until Dashboard data is defined"],
  ["LP-VSG-02", "proof-vsg-02", "src/routes/lender/builds/-build-detail-route.test.tsx", "renders the authorized Build overview from the supported route entry"],
  ["LP-VSG-03", "proof-vsg-03", "src/routes/lender/-milestones-route.test.tsx", "retains the exact-cycle notification boundary for correlated links"],
  ["LP-VSG-04", "proof-vsg-04", "src/routes/lender/-draws-route.test.tsx", "renders the promoted production Draw queue from the ordinary route entry"],
  ["LP-VSG-05", "proof-vsg-05", "src/routes/lender/-draws-route.test.tsx", "renders the ordinary Phase 5 detail from a queue target without notification correlation"],
  ["LP-VSG-06", "proof-vsg-06", "src/routes/builder/proposals/-proposal.$proposalId.test.ts", "keeps submitted Builder proposals read-only despite broad app permissions"],
  ["LP-VSG-07", "proof-vsg-07", "src/routes/builder/proposals/-proposal.$proposalId.test.ts", "does not wire lender-only review or backoffice draw controls into the builder workspace"],
  ["LP-VSG-08", "proof-vsg-08", "src/routes/backoffice/lenders/-lender-control-plane.test.tsx", "requires and forwards the operator-entered workflow policy audit reason"],
  ["LP-VSG-09", "proof-vsg-09", "src/routes/backoffice/-proposals.$planId.test.tsx", "wires the supported Back Office detail route to explicit closing terms and separate activation"],
  ["LP-VSG-10", "proof-vsg-10", "src/routes/backoffice/lenders/-lender-control-plane.test.tsx", "keeps an accepted role change pending until the WorkOS projection reconciles"],
] as const;

function sha256(value: string | Buffer) {
  return createHash("sha256").update(value).digest("hex");
}

function publicPem(key: KeyObject) {
  return key.export({ format: "pem", type: "spki" }).toString();
}

function signature(statement: string, privateKey: KeyObject) {
  return sign(null, Buffer.from(statement), privateKey).toString("base64");
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

function phase3CutoverSchemaFixture() {
  const source = readFileSync(join(process.cwd(), "convex/schema.ts"), "utf8");
  const approvalIndex = /(\.index\("by_proposal_assignment_revision_status", \{[\s\S]*?)staged: true/;
  const normalizedEmailIndex = /(\.index\("by_normalized_email", \{[\s\S]*?)staged: true/;
  const cutover = source
    .replace(approvalIndex, "$1staged: false")
    .replace(normalizedEmailIndex, "$1staged: false");
  if (cutover === source) {
    throw new Error("Phase 3 staged-index fixture did not find its source declarations");
  }
  return Buffer.from(cutover);
}

function createEvidenceFixture() {
  const contractResult = validateLenderPortalProductionAcceptanceContract({
    repositoryRoot: process.cwd(),
  });
  const contract = clone(contractResult.contract);
  const cutoverSchema = phase3CutoverSchemaFixture();
  const releaseKeys = generateKeyPairSync("ed25519");
  const reviewerKeys = generateKeyPairSync("ed25519");
  const releasePublicKey = publicPem(releaseKeys.publicKey);
  const reviewerPublicKey = publicPem(reviewerKeys.publicKey);
  const testTrustRoot = {
    releaseKeys: [
    {
      id: "test-release-key",
      publicKeyPem: releasePublicKey,
      sha256: lenderPortalPublicKeyFingerprint(releasePublicKey),
    },
    ],
    reviewers: [
    {
      id: "test-reviewer-key",
      publicKeyPem: reviewerPublicKey,
      reviewerDisplayName: "Independent Test Reviewer",
      reviewerId: "independent-test-reviewer",
      sha256: lenderPortalPublicKeyFingerprint(reviewerPublicKey),
    },
    ],
  };

  const mappings = [
    ...contract.surfaces,
    ...contract.journeys,
    ...contract.verticalSliceGates,
  ];
  const proofsById = new Map(
    contract.testProofs.map((proof) => [proof.id, proof])
  );
  const actualBindings = mappings.map((mapping) => {
    const proof = proofsById.get(mapping.testProofId);
    return [
      mapping.id,
      mapping.testProofId,
      proof?.targetFile,
      proof?.assertionName,
    ];
  });
  if (
    stableLenderPortalEvidenceJson(actualBindings) !==
    stableLenderPortalEvidenceJson(EXPECTED_MACHINE_BINDINGS)
  ) {
    throw new Error("Production mapping fixture drifted from independent expectations");
  }

  const remote = new Map<string, Buffer>();
  const effectiveUrls = new Map<string, string>();
  const redirectChains = new Map<string, string[]>();
  const artifacts: Array<{
    commitSha: string;
    id: string;
    kind:
      | "machine-test-output"
      | "browser-capture"
      | "accessibility-report"
      | "provider-delivery-report"
      | "inbox-link-report"
      | "migration-cutover-report"
      | "release-artifact"
      | "independent-review";
    mediaType: "application/json";
    sha256: string;
    sourceTreeSha: string;
    uri: string;
  }> = [];

  const registerArtifact = (
    id: string,
    kind: (typeof artifacts)[number]["kind"],
    payload: unknown
  ) => {
    const contents = Buffer.from(JSON.stringify(payload));
    const uri = `${releaseBaseUrl}${id}.json`;
    remote.set(uri, contents);
    artifacts.push({
      commitSha: candidateSha,
      id,
      kind,
      mediaType: "application/json",
      sha256: sha256(contents),
      sourceTreeSha,
      uri,
    });
    return id;
  };

  const testProofs = new Map(
    contract.testProofs.map((proof) => [proof.id, proof])
  );
  const testCommands = new Map(
    contract.testCommands.map((command) => [command.id, command])
  );
  const githubBundle = (id: string, artifactSha256: string) => {
    const uri = `${releaseBaseUrl}${id}-github-attestation.jsonl`;
    const bytes = Buffer.from(
      JSON.stringify({
        artifactSha256,
        issuer: "https://token.actions.githubusercontent.com",
        repository: "Connorbelez/drawflowv1",
        signerWorkflow:
          "github.com/Connorbelez/drawflowv1/.github/workflows/lender-portal-production-evidence.yml",
        sourceDigest: candidateSha,
      })
    );
    remote.set(uri, bytes);
    return { sha256: sha256(bytes), uri };
  };
  const releaseId = "30000000-0000-4000-8000-000000000001";
  let executionIndex = 0;
  const machineProof = (mapping: (typeof mappings)[number]) => {
    const proof = testProofs.get(mapping.testProofId);
    if (!proof) throw new Error(`Missing fixture test proof ${mapping.testProofId}`);
    const command = testCommands.get(proof.commandId);
    if (!command) throw new Error(`Missing fixture command ${proof.commandId}`);
    const expected = EXPECTED_MACHINE_BINDINGS.find(
      ([mappingId]) => mappingId === mapping.id
    );
    if (
      !expected ||
      expected[1] !== proof.id ||
      expected[2] !== proof.targetFile ||
      expected[3] !== proof.assertionName
    ) {
      throw new Error(`Machine fixture semantics drifted for ${mapping.id}`);
    }
    executionIndex += 1;
    const argv = [
      "bun",
      "run",
      command.packageScript,
      "--",
      proof.targetFile,
      "--testNamePattern",
      proof.assertionName,
      "--reporter=json",
    ];
    const nativeReportBytes = Buffer.from(
      JSON.stringify({
        numFailedTestSuites: 0,
        numFailedTests: 0,
        numPassedTestSuites: 1,
        numPassedTests: 1,
        numPendingTestSuites: 0,
        numPendingTests: 0,
        numTodoTests: 0,
        numTotalTestSuites: 1,
        numTotalTests: 1,
        snapshot: {},
        startTime: Date.parse("2026-08-18T12:05:00.000Z"),
        success: true,
        testResults: [
          {
            assertionResults: [
              {
                ancestorTitles: ["Registered production journey"],
                duration: 12,
                failureMessages: [],
                fullName: `Registered production journey ${proof.assertionName}`,
                meta: {},
                status: "passed",
                title: proof.assertionName,
              },
            ],
            endTime: Date.parse("2026-08-18T12:06:00.000Z"),
            message: "",
            name: join(process.cwd(), proof.targetFile),
            startTime: Date.parse("2026-08-18T12:05:00.000Z"),
            status: "passed",
          },
        ],
      })
    );
    const executionReport = {
      commitSha: candidateSha,
      deploymentId: deployment.id,
      deploymentUrl: deployment.url,
      executionId: `00000000-0000-4000-8000-${String(executionIndex).padStart(12, "0")}`,
      expectedTotals: {
        failed: 0,
        passed: 1,
        pending: 0,
        skipped: 0,
        suites: 1,
        tests: 1,
        todo: 0,
      },
      finishedAt: "2026-08-18T12:06:00.000Z",
      invocation: { argv, command: argv.join(" "), cwd: "." as const },
      nativeReport: {
        rawReportBase64: nativeReportBytes.toString("base64"),
        rawReportSha256: sha256(nativeReportBytes),
      },
      mappingId: mapping.id,
      releaseId,
      runner: {
        executableSha256: command.runnerExecutableSha256,
        name: "vitest" as const,
        version: command.runnerVersion,
      },
      schemaVersion: "lender-portal-vitest-execution-report/v1" as const,
      sourceTreeSha,
      startedAt: "2026-08-18T12:05:00.000Z",
      success: true as const,
      testResults: [
        {
          assertions: [
            {
              assertionId: `${proof.id}::${proof.assertionName}`,
              assertionName: proof.assertionName,
              durationMs: 12,
              status: "passed" as const,
            },
          ],
          targetFile: proof.targetFile,
        },
      ],
    };
    const rawReport = Buffer.from(JSON.stringify(executionReport));
    const reportAttestation = githubBundle(
      `machine-${mapping.id.toLowerCase()}`,
      sha256(rawReport)
    );
    const proofMetadata = {
      assertionName: proof.assertionName,
      commandId: proof.commandId,
      consumerIds: proof.consumerIds,
      mappingId: mapping.id,
      observableResult: proof.observableResult,
      targetFile: proof.targetFile,
      testProofId: proof.id,
    };
    const artifactId = `machine-${mapping.id.toLowerCase()}`;
    registerArtifact(artifactId, "machine-test-output", {
      artifactId,
      commitSha: candidateSha,
      executionReport: {
        githubAttestationBundleSha256: reportAttestation.sha256,
        githubAttestationBundleUri: reportAttestation.uri,
        rawReportBase64: rawReport.toString("base64"),
        rawReportSha256: sha256(rawReport),
      },
      proof: proofMetadata,
      schemaVersion: "lender-portal-machine-proof/v2",
      sourceTreeSha,
    });
    return {
      artifactId,
      id: mapping.id,
      kind: "machine-test" as const,
      result: "passed" as const,
      testProofId: mapping.testProofId,
    };
  };

  const deploymentId = "deployment-production-1";
  const releaseBundleUri = `${releaseBaseUrl}drawflow-production-bundle.json`;
  const releaseBundle = Buffer.from(
    JSON.stringify({
      artifacts: [
        { path: "server/index.mjs", sha256: sha256("server artifact") },
        { path: "public/index.html", sha256: sha256("client artifact") },
      ],
      build: {
        command: "bun run build",
        executablePath:
          LENDER_PORTAL_PRODUCTION_TRUST_ROOT.executables.bun.path,
        executableSha256:
          LENDER_PORTAL_PRODUCTION_TRUST_ROOT.executables.bun.sha256,
        executableVersion:
          LENDER_PORTAL_PRODUCTION_TRUST_ROOT.executables.bun.version,
        finishedAt: "2026-08-18T11:59:00.000Z",
        startedAt: "2026-08-18T11:56:00.000Z",
      },
      commitSha: candidateSha,
      deploymentId,
      releaseId,
      schemaVersion: "lender-portal-release-bundle-manifest/v1",
      sourceTreeSha,
    })
  );
  remote.set(releaseBundleUri, releaseBundle);
  const releaseBundleAttestation = githubBundle(
    "release-bundle",
    sha256(releaseBundle)
  );
  const deployment = {
    deployedAt: "2026-08-18T12:00:00.000Z",
    deployedCommitSha: candidateSha,
    environment: "production" as const,
    id: deploymentId,
    releaseArtifactId: "release-build",
    releaseArtifactSha256: "",
    releaseBundleGithubAttestationSha256: releaseBundleAttestation.sha256,
    releaseBundleGithubAttestationUri: releaseBundleAttestation.uri,
    releaseBundleSha256: sha256(releaseBundle),
    releaseBundleUri,
    sourceTreeSha,
    url: "https://drawflow.fairlend.ca",
  };
  const operationalPayload = (
    artifactId: string,
    proof: Record<string, unknown>
  ) => ({
    artifactId,
    commitSha: candidateSha,
    proof,
    schemaVersion: "lender-portal-operational-proof/v1",
    sourceTreeSha,
  });
  const common = {
    deploymentId: deployment.id,
    deploymentUrl: deployment.url,
    recordedAt: "2026-08-18T12:20:00.000Z",
    releaseId,
    result: "passed" as const,
  };
  const consumersById = new Map(
    contract.consumers.map((consumer) => [consumer.id, consumer])
  );
  const browserObservations = mappings.map((mapping, index) => {
    const routeConsumer = mapping.consumerIds
      .map((consumerId) => consumersById.get(consumerId))
      .find((consumer) => consumer?.class === "production-route");
    const testProof = testProofs.get(mapping.testProofId);
    if (!routeConsumer || !testProof) {
      throw new Error(`Missing production browser fixture for ${mapping.id}`);
    }
    const role = routeConsumer.routerPath.startsWith("/builder")
      ? ("builder" as const)
      : routeConsumer.routerPath.startsWith("/backoffice")
        ? ("backoffice" as const)
        : ("lender-admin" as const);
    const principal =
      LENDER_PORTAL_PRODUCTION_TRUST_ROOT.productionEvidencePrincipals.find(
        (candidate) => candidate.role === role
      );
    if (!principal) {
      throw new Error(`Missing source-owned production principal for ${role}`);
    }
    const actor = {
      organizationIdHash: principal.organizationIdHash,
      role: principal.role,
      roleHash: principal.roleHash,
      subjectIdHash: principal.subjectIdHash,
    };
    const runId = `20000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`;
    const sessionId = `10000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`;
    const traceUri = `${releaseBaseUrl}trace-${mapping.id.toLowerCase()}.zip`;
    const authCallId = `${mapping.id}-authenticate-call`;
    const navigateCallId = `${mapping.id}-navigate-call`;
    const assertCallId = `${mapping.id}-assert-call`;
    const sessionCookieValue = `sealed-workos-session-${mapping.id}-${sessionId}`;
    const sessionDigest = sha256(sessionCookieValue);
    const marker = Buffer.from(
      JSON.stringify({
        actor,
        commitSha: candidateSha,
        deploymentId: deployment.id,
        mappingId: mapping.id,
        observedResult: testProof.observableResult,
        releaseId,
        route: routeConsumer.routerPath,
        runId,
        schemaVersion: "lender-portal-playwright-trace-marker/v1",
        sessionId,
        sourceTreeSha,
      })
    ).toString("base64url");
    const traceEvents = [
      {
        browserName: "chromium",
        options: { baseURL: deployment.url },
        playwrightVersion:
          LENDER_PORTAL_PRODUCTION_TRUST_ROOT.runners.playwright.version,
        type: "context-options",
      },
      {
        apiName: "browserContext.storageState",
        callId: authCallId,
        params: {},
        type: "before",
      },
      {
        apiName: "browserContext.storageState",
        callId: authCallId,
        result: {
          value: {
            cookies: [
              {
                domain: "drawflow.fairlend.ca",
                expires: -1,
                httpOnly: true,
                name: "wos-session",
                path: "/",
                sameSite: "Lax",
                secure: true,
                value: sessionCookieValue,
              },
            ],
            origins: [],
          },
        },
        type: "after",
      },
      {
        apiName: "page.goto",
        callId: navigateCallId,
        params: { url: `${deployment.url}${routeConsumer.routerPath}` },
        type: "before",
      },
      {
        apiName: "page.goto",
        callId: navigateCallId,
        result: {},
        type: "after",
      },
      {
        apiName: "locator.textContent",
        callId: assertCallId,
        params: {
          selector: `[data-lender-portal-acceptance="${mapping.id}"]`,
        },
        type: "before",
      },
      {
        apiName: "locator.textContent",
        callId: assertCallId,
        result: { value: testProof.observableResult },
        type: "after",
      },
      {
        messageType: "log",
        text: `LENDER_PORTAL_ACCEPTANCE:${marker}`,
        type: "console",
      },
    ]
      .map((event) => JSON.stringify(event))
      .join("\n");
    const trace = Buffer.from(
      zipSync({
        "trace.network": Buffer.from(
          `${JSON.stringify({
            snapshot: {
              _resourceType: "document",
              request: {
                headers: [
                  {
                    name: "x-drawflow-acceptance-run-id",
                    value: runId,
                  },
                  {
                    name: "x-drawflow-acceptance-mapping-id",
                    value: mapping.id,
                  },
                  {
                    name: "x-drawflow-acceptance-session-id",
                    value: sessionId,
                  },
                  {
                    name: "cookie",
                    value: `wos-session=${sessionCookieValue}`,
                  },
                ],
                method: "GET",
                url: `${deployment.url}${routeConsumer.routerPath}`,
              },
              response: {
                content: { mimeType: "text/html; charset=utf-8" },
                headers: [
                  {
                    name: "x-drawflow-auth-session-hash",
                    value: sessionDigest,
                  },
                  {
                    name: "x-drawflow-auth-subject-hash",
                    value: principal.subjectIdHash,
                  },
                  {
                    name: "x-drawflow-auth-organization-hash",
                    value: principal.organizationIdHash,
                  },
                  {
                    name: "x-drawflow-auth-role-hash",
                    value: principal.roleHash,
                  },
                ],
                status: 200,
              },
            },
            type: "resource-snapshot",
          })}\n`
        ),
        "trace.trace": Buffer.from(`${traceEvents}\n`),
      })
    );
    remote.set(traceUri, trace);
    const traceAttestation = githubBundle(
      `trace-bytes-${mapping.id.toLowerCase()}`,
      sha256(trace)
    );
    const manifest = Buffer.from(
      JSON.stringify({
        actor,
        commitSha: candidateSha,
        deploymentId: deployment.id,
        deploymentOrigin: deployment.url,
        finishedAt: "2026-08-18T12:16:00.000Z",
        mappingId: mapping.id,
        releaseId,
        runId,
        runner: {
          executableSha256:
            LENDER_PORTAL_PRODUCTION_TRUST_ROOT.runners.playwright
              .executableSha256,
          name: "playwright",
          version:
            LENDER_PORTAL_PRODUCTION_TRUST_ROOT.runners.playwright.version,
        },
        schemaVersion: "lender-portal-browser-trace-manifest/v1",
        sessionId,
        sourceTreeSha,
        startedAt: "2026-08-18T12:12:00.000Z",
        steps: [
          {
            kind: "authenticate",
            observedAt: "2026-08-18T12:13:00.000Z",
            observedResult: `Authenticated ${role} session`,
            route: routeConsumer.routerPath,
            status: "passed",
            stepId: `${mapping.id}-authenticate`,
            traceCallId: authCallId,
          },
          {
            kind: "navigate",
            observedAt: "2026-08-18T12:14:00.000Z",
            observedResult: `Reached ${routeConsumer.routerPath}`,
            route: routeConsumer.routerPath,
            status: "passed",
            stepId: `${mapping.id}-navigate`,
            traceCallId: navigateCallId,
          },
          {
            kind: "assert",
            observedAt: "2026-08-18T12:15:00.000Z",
            observedResult: testProof.observableResult,
            route: routeConsumer.routerPath,
            status: "passed",
            stepId: `${mapping.id}-assert`,
            traceCallId: assertCallId,
          },
        ],
        trace: {
          byteLength: trace.byteLength,
          format: "playwright-trace-zip",
          githubAttestationBundleSha256: traceAttestation.sha256,
          githubAttestationBundleUri: traceAttestation.uri,
          sha256: sha256(trace),
          uri: traceUri,
        },
      })
    );
    const manifestUri = `${releaseBaseUrl}trace-${mapping.id.toLowerCase()}-manifest.json`;
    remote.set(manifestUri, manifest);
    const manifestAttestation = githubBundle(
      `trace-${mapping.id.toLowerCase()}`,
      sha256(manifest)
    );
    return {
      githubAttestationBundleSha256: manifestAttestation.sha256,
      githubAttestationBundleUri: manifestAttestation.uri,
      manifestSha256: sha256(manifest),
      manifestUri,
      mappingId: mapping.id,
    };
  });
  const routeForMapping = (mapping: (typeof mappings)[number]) => {
    const route = mapping.consumerIds
      .map((consumerId) => consumersById.get(consumerId))
      .find((consumer) => consumer?.class === "production-route");
    if (!route || route.class !== "production-route") {
      throw new Error(`Missing route for ${mapping.id}`);
    }
    return route.routerPath;
  };
  const principalForMapping = (mapping: (typeof mappings)[number]) => {
    const route = routeForMapping(mapping);
    const role = route.startsWith("/builder")
      ? "builder"
      : route.startsWith("/backoffice")
        ? "backoffice"
        : "lender-admin";
    const principal =
      LENDER_PORTAL_PRODUCTION_TRUST_ROOT.productionEvidencePrincipals.find(
        (candidate) => candidate.role === role
      );
    if (!principal) {
      throw new Error(`Missing production principal for ${mapping.id}`);
    }
    return principal;
  };
  const authorizationContextHash = (
    mapping: (typeof mappings)[number],
    provider: "Resend" | "WorkOS"
  ) => {
    const principal = principalForMapping(mapping);
    return sha256(
      stableLenderPortalEvidenceJson({
        assignmentIdentityHash: principal.assignmentIdentityHash,
        mappingId: mapping.id,
        organizationIdHash: principal.organizationIdHash,
        provider,
        recipientHash: principal.recipientHash,
        roleHash: principal.roleHash,
        subjectIdHash: principal.subjectIdHash,
        tenantIdHash: principal.providerTenantIdHashes[provider],
      })
    );
  };
  const providerMappings = mappings.filter((mapping) =>
    mapping.operationalGateIds.includes("provider-and-webhook-delivery")
  );
  const inboxMappings = mappings.filter((mapping) =>
    mapping.operationalGateIds.includes("inbox-and-reauthorized-links")
  );
  const providerAccountId = "workos-account-production";
  const providerTenantIdHash =
    LENDER_PORTAL_PRODUCTION_TRUST_ROOT.productionEvidencePrincipals[0]
      .providerTenantIdHashes.WorkOS;
  const providerRecords = providerMappings.map((mapping, index) => {
    const principal = principalForMapping(mapping);
    const record = {
      assignmentIdentityHash: principal.assignmentIdentityHash,
      correlationId: `workos-correlation-${mapping.id}`,
      deliveryId: `workos-delivery-${mapping.id}`,
      mappingId: mapping.id,
      occurredAt: "2026-08-18T12:18:00.000Z",
      organizationIdHash: principal.organizationIdHash,
      recipientHash: principal.recipientHash,
      roleHash: principal.roleHash,
      route: routeForMapping(mapping),
      status: "delivered" as const,
      subjectIdHash: principal.subjectIdHash,
      tenantIdHash: providerTenantIdHash,
      webhookEventId: `workos-event-${mapping.id}`,
    };
    const response = Buffer.from(
      JSON.stringify({
        accountId: providerAccountId,
        assignmentIdentityHash: record.assignmentIdentityHash,
        correlationId: record.correlationId,
        deliveryId: record.deliveryId,
        organizationIdHash: record.organizationIdHash,
        recipientHash: record.recipientHash,
        roleHash: record.roleHash,
        route: record.route,
        status: record.status,
        subjectIdHash: record.subjectIdHash,
        tenantIdHash: providerTenantIdHash,
        webhookEventId: record.webhookEventId,
      })
    );
    return {
      ...record,
      readback: {
        authorizationContextHash: authorizationContextHash(mapping, "WorkOS"),
        method: "authenticated-api-readback" as const,
        requestId: `workos-request-${index + 1}`,
        requestUrl: `https://api.workos.com/events/${record.webhookEventId}`,
        responseBase64: response.toString("base64"),
        responseSha256: sha256(response),
      },
    };
  });
  const providerReceiptUri = `${releaseBaseUrl}provider-receipt.json`;
  const providerReceipt = Buffer.from(
    JSON.stringify({
      commitSha: candidateSha,
      deploymentId: deployment.id,
      provider: "WorkOS",
      providerAccountId,
      records: providerRecords,
      releaseId,
      schemaVersion: "lender-portal-provider-readback-receipt/v2",
      sourceTreeSha,
      tenantIdHash: providerTenantIdHash,
    })
  );
  remote.set(providerReceiptUri, providerReceipt);
  const providerAttestation = githubBundle(
    "provider-receipt",
    sha256(providerReceipt)
  );
  const inboxAccountId = "resend-account-production";
  const inboxTenantIdHash =
    LENDER_PORTAL_PRODUCTION_TRUST_ROOT.productionEvidencePrincipals[0]
      .providerTenantIdHashes.Resend;
  const inboxRecords = inboxMappings.map((mapping, index) => {
    const principal = principalForMapping(mapping);
    const record = {
      assignmentIdentityHash: principal.assignmentIdentityHash,
      correlationId: `resend-correlation-${mapping.id}`,
      deliveryId: `resend-delivery-${mapping.id}`,
      linkPath: routeForMapping(mapping),
      mappingId: mapping.id,
      messageId: `resend-message-${mapping.id}`,
      occurredAt: "2026-08-18T12:19:00.000Z",
      organizationIdHash: principal.organizationIdHash,
      reauthorizationResult: "authorized" as const,
      recipientHash: principal.recipientHash,
      roleHash: principal.roleHash,
      status: "delivered" as const,
      subjectIdHash: principal.subjectIdHash,
      tenantIdHash: inboxTenantIdHash,
    };
    const response = Buffer.from(
      JSON.stringify({
        accountId: inboxAccountId,
        assignmentIdentityHash: record.assignmentIdentityHash,
        correlationId: record.correlationId,
        deliveryId: record.deliveryId,
        linkPath: record.linkPath,
        messageId: record.messageId,
        organizationIdHash: record.organizationIdHash,
        recipientHash: record.recipientHash,
        roleHash: record.roleHash,
        status: record.status,
        subjectIdHash: record.subjectIdHash,
        tenantIdHash: inboxTenantIdHash,
      })
    );
    return {
      ...record,
      readback: {
        authorizationContextHash: authorizationContextHash(mapping, "Resend"),
        method: "authenticated-api-readback" as const,
        requestId: `resend-request-${index + 1}`,
        requestUrl: `https://api.resend.com/emails/${record.messageId}`,
        responseBase64: response.toString("base64"),
        responseSha256: sha256(response),
      },
    };
  });
  const inboxReceiptUri = `${releaseBaseUrl}inbox-receipt.json`;
  const inboxReceipt = Buffer.from(
    JSON.stringify({
      commitSha: candidateSha,
      deploymentId: deployment.id,
      provider: "Resend",
      providerAccountId: inboxAccountId,
      records: inboxRecords,
      releaseId,
      schemaVersion: "lender-portal-inbox-readback-receipt/v2",
      sourceTreeSha,
      tenantIdHash: inboxTenantIdHash,
    })
  );
  remote.set(inboxReceiptUri, inboxReceipt);
  const inboxAttestation = githubBundle(
    "inbox-receipt",
    sha256(inboxReceipt)
  );
  const operational = [
    {
      artifactId: "browser-production",
      gateId: "authenticated-production-browser",
      kind: "browser-capture" as const,
      proof: {
        ...common,
        gateId: "authenticated-production-browser",
        observations: browserObservations,
        resultFormat: "playwright-production-journey-report/v1" as const,
      },
    },
    {
      artifactId: "focus-production",
      gateId: "focus-and-status-announcements",
      kind: "accessibility-report" as const,
      proof: {
        ...common,
        auditTool: "axe-core" as const,
        auditToolVersion: "4.10.2",
        focusTarget: "Milestone review heading",
        gateId: "focus-and-status-announcements",
        liveRegionResult: "announced" as const,
        resultFormat: "axe-focus-status-report/v1" as const,
        route: "/lender/milestones",
      },
    },
    {
      artifactId: "responsive-production",
      gateId: "responsive-zoom-and-screen-reader",
      kind: "accessibility-report" as const,
      proof: {
        ...common,
        assistiveTechnology: "VoiceOver",
        assistiveTechnologyVersion: "15.0",
        gateId: "responsive-zoom-and-screen-reader",
        resultFormat: "assistive-technology-report/v1" as const,
        route: "/lender/draws",
        viewport: "1280x720",
        zoomPercent: 200,
      },
    },
    {
      artifactId: "provider-production",
      gateId: "provider-and-webhook-delivery",
      kind: "provider-delivery-report" as const,
      proof: {
        ...common,
        gateId: "provider-and-webhook-delivery",
        githubAttestationBundleSha256: providerAttestation.sha256,
        githubAttestationBundleUri: providerAttestation.uri,
        mappingIds: providerMappings.map((mapping) => mapping.id),
        provider: "WorkOS",
        providerAccountId,
        providerReceiptSha256: sha256(providerReceipt),
        providerReceiptUri,
        resultFormat: "provider-readback-receipt/v2" as const,
        tenantIdHash: providerTenantIdHash,
      },
    },
    {
      artifactId: "inbox-production",
      gateId: "inbox-and-reauthorized-links",
      kind: "inbox-link-report" as const,
      proof: {
        ...common,
        gateId: "inbox-and-reauthorized-links",
        githubAttestationBundleSha256: inboxAttestation.sha256,
        githubAttestationBundleUri: inboxAttestation.uri,
        inboxProvider: "Resend",
        mappingIds: inboxMappings.map((mapping) => mapping.id),
        providerAccountId: inboxAccountId,
        receiptSha256: sha256(inboxReceipt),
        receiptUri: inboxReceiptUri,
        resultFormat: "inbox-readback-receipt/v2" as const,
        tenantIdHash: inboxTenantIdHash,
      },
    },
    {
      artifactId: "phase3-cutover-production",
      gateId: "phase3-migration-cutover",
      kind: "migration-cutover-report" as const,
      proof: {
        ...common,
        ambiguity: {
          completePagination: true as const,
          openIssueCount: 0 as const,
          query:
            "lender_portal_phase9:listLenderPortalPhase9MigrationIssues" as const,
        },
        authenticatedReadback: {
          authorization: "admin-or-principle-broker" as const,
          brokerageIdHash: sha256("brokerage:production-1"),
          organizationIdHash: sha256("organization:production-1"),
          query:
            "lender_portal_phase9:getLenderPortalPhase9MigrationRun" as const,
          readAt: "2026-08-18T12:10:00.000Z",
          runTokenHash: sha256("phase3-run-token"),
          status: "verified" as const,
        },
        gateId: "phase3-migration-cutover",
        indexes: [
          {
            fields: [
              "proposalId",
              "assignmentId",
              "proposalRevisionId",
              "status",
            ],
            name: "by_proposal_assignment_revision_status" as const,
            staged: false as const,
            status: "ready" as const,
            table: "proposalLenderApprovals" as const,
            verifiedAt: "2026-08-18T12:12:00.000Z",
          },
          {
            fields: ["normalizedEmail"],
            name: "by_normalized_email" as const,
            staged: false as const,
            status: "ready" as const,
            table: "users" as const,
            verifiedAt: "2026-08-18T12:13:00.000Z",
          },
        ],
        manifestSealing: {
          archivingAssignmentCount: 0 as const,
          buildingManifestCount: 0 as const,
          failedManifestCount: 0 as const,
          readAt: "2026-08-18T12:11:00.000Z",
          sealedManifestCount: 2,
          withdrawnAssignmentCount: 2,
        },
        migrations: [
          {
            apply: {
              completedAt: "2026-08-18T12:04:00.000Z",
              invocationId: "10000000-0000-4000-8000-000000000002",
              reportSha256: sha256("phase3-lifecycle-apply-report"),
              result: "passed" as const,
            },
            dryRun: {
              completedAt: "2026-08-18T12:02:00.000Z",
              invocationId: "10000000-0000-4000-8000-000000000001",
              reportSha256: sha256("phase3-lifecycle-dry-run-report"),
              result: "passed" as const,
            },
            id: "proposal-phase3-lifecycle" as const,
            readback: {
              completedAt: "2026-08-18T12:06:00.000Z",
              invocationId: "10000000-0000-4000-8000-000000000003",
              remainingRecordCount: 0 as const,
              reportSha256: sha256("phase3-lifecycle-readback-report"),
              result: "passed" as const,
            },
            runner: "migrations:runProposalPhase3LifecycleBackfill" as const,
          },
          {
            apply: {
              completedAt: "2026-08-18T12:05:00.000Z",
              invocationId: "20000000-0000-4000-8000-000000000002",
              reportSha256: sha256("normalized-email-apply-report"),
              result: "passed" as const,
            },
            dryRun: {
              completedAt: "2026-08-18T12:03:00.000Z",
              invocationId: "20000000-0000-4000-8000-000000000001",
              reportSha256: sha256("normalized-email-dry-run-report"),
              result: "passed" as const,
            },
            id: "workos-user-normalized-email" as const,
            readback: {
              completedAt: "2026-08-18T12:07:00.000Z",
              invocationId: "20000000-0000-4000-8000-000000000003",
              remainingRecordCount: 0 as const,
              reportSha256: sha256("normalized-email-readback-report"),
              result: "passed" as const,
            },
            runner: "migrations:runWorkosUserNormalizedEmailBackfill" as const,
          },
        ],
        resultFormat: "phase3-migration-cutover-report/v1" as const,
        rollbackRehearsal: {
          completedAt: "2026-08-18T12:15:00.000Z",
          exerciseId: "30000000-0000-4000-8000-000000000001",
          recoveryMode: "disable-and-forward-recovery" as const,
          reportSha256: sha256("phase3-rollback-rehearsal-report"),
          result: "passed" as const,
        },
        schemaSourceSha256: sha256(cutoverSchema),
      },
    },
    {
      artifactId: "release-build",
      gateId: "exact-release-commit",
      kind: "release-artifact" as const,
      proof: {
        ...common,
        buildCommand: "bun run build",
        builderExecutablePath:
          LENDER_PORTAL_PRODUCTION_TRUST_ROOT.executables.bun.path,
        builderExecutableSha256:
          LENDER_PORTAL_PRODUCTION_TRUST_ROOT.executables.bun.sha256,
        builderVersion:
          LENDER_PORTAL_PRODUCTION_TRUST_ROOT.executables.bun.version,
        bundleGithubAttestationSha256: releaseBundleAttestation.sha256,
        bundleGithubAttestationUri: releaseBundleAttestation.uri,
        bundleSha256: deployment.releaseBundleSha256,
        bundleUri: deployment.releaseBundleUri,
        deployedCommitSha: candidateSha,
        gateId: "exact-release-commit",
        resultFormat: "immutable-release-build-report/v1" as const,
        sourceTreeSha,
      },
    },
  ];
  for (const item of operational) {
    const resultArtifactUri = `${releaseBaseUrl}${item.gateId}-raw-result.json`;
    const rawResult = Buffer.from(
      JSON.stringify({
        commitSha: candidateSha,
        deploymentId: deployment.id,
        gateId: item.gateId,
        recordedAt: common.recordedAt,
        releaseId,
        report: item.proof,
        result: "passed",
        schemaVersion: "lender-portal-operational-raw-result/v1",
        sourceTreeSha,
      })
    );
    remote.set(resultArtifactUri, rawResult);
    const resultAttestation = githubBundle(
      `${item.gateId}-raw-result`,
      sha256(rawResult)
    );
    const proof = {
      ...item.proof,
      resultArtifactSha256: sha256(rawResult),
      resultArtifactUri,
      resultGithubAttestationBundleSha256: resultAttestation.sha256,
      resultGithubAttestationBundleUri: resultAttestation.uri,
    };
    registerArtifact(
      item.artifactId,
      item.kind,
      operationalPayload(item.artifactId, proof)
    );
  }
  deployment.releaseArtifactSha256 =
    artifacts.find((artifact) => artifact.id === "release-build")?.sha256 ?? "";

  const independentArtifactId = "independent-review";
  registerArtifact(
    independentArtifactId,
    "independent-review",
    operationalPayload(independentArtifactId, {
      attestationUri: attestationUrl,
      decision: "accepted",
      releaseArtifactId: deployment.releaseArtifactId,
      releaseArtifactSha256: deployment.releaseArtifactSha256,
      reviewerDisplayName: "Independent Test Reviewer",
      reviewerId: "independent-test-reviewer",
    })
  );
  const independentArtifact = artifacts.find(
    (artifact) => artifact.id === independentArtifactId
  );
  if (!independentArtifact) throw new Error("Missing independent artifact");

  const payload = {
    artifacts,
    attestationUri: attestationUrl,
    candidateSha,
    contractSha256: contractResult.contractSha256,
    deployment,
    independentAcceptance: {
      artifactId: independentArtifactId,
      artifactSha256: independentArtifact.sha256,
      decision: "accepted" as const,
      reviewerDisplayName: "Independent Test Reviewer",
      reviewerId: "independent-test-reviewer",
      signature: {
        algorithm: "ed25519" as const,
        keyId: "test-reviewer-key",
        value: "",
      },
      verifiedAt: "2026-08-18T12:30:00.000Z",
    },
    issuedAt: "2026-08-18T12:45:00.000Z",
    releaseId,
    journeys: contract.journeys.map(machineProof),
    operationalGates: operational.map((item) => ({
      artifactId: item.artifactId,
      id: item.gateId,
      kind: "operational-attestation" as const,
      result: "passed" as const,
    })),
    schemaVersion:
      "lender-portal-production-acceptance-attestation/v3" as const,
    surfaces: contract.surfaces.map(machineProof),
    verticalSliceGates: contract.verticalSliceGates.map(machineProof),
  };
  const attestation = {
    payload,
    signature: {
      algorithm: "ed25519" as const,
      keyId: "test-release-key",
      value: "",
    },
  };
  const resign = (options?: { releaseOnly?: boolean }) => {
    if (!options?.releaseOnly) {
      payload.independentAcceptance.signature.value = signature(
        createLenderPortalIndependentReviewStatement(payload),
        reviewerKeys.privateKey
      );
    }
    attestation.signature.value = signature(
      stableLenderPortalEvidenceJson(payload),
      releaseKeys.privateKey
    );
    remote.set(attestationUrl, Buffer.from(JSON.stringify(attestation)));
  };
  resign();

  let fetchCount = 0;
  let gitStates = [cleanGitState, cleanGitState];
  const hooks = {
    fetchRemote: ({ url }: { label: string; url: string }) => {
      fetchCount += 1;
      const contents = remote.get(url);
      if (!contents) throw new Error(`Missing simulated remote ${url}`);
      const effectiveUrl = effectiveUrls.get(url) ?? url;
      return {
        contents,
        effectiveUrl,
        redirectChain:
          redirectChains.get(url) ?? (effectiveUrl === url ? [] : [effectiveUrl]),
      };
    },
    readRepositoryFile: (path: string) => {
      if (path === "convex/schema.ts") return cutoverSchema;
      return readFileSync(join(process.cwd(), path));
    },
    readGitState: () => gitStates.shift() ?? cleanGitState,
    trustRoot: testTrustRoot,
    verifyGithubAttestation: ({
      artifactSha256,
      candidateSha: expectedCandidateSha,
      repository,
      signerDigest,
      signerWorkflow,
      sourceRepository,
    }: {
      artifactSha256: string;
      candidateSha: string;
      label: string;
      repository: string;
      signerDigest: string;
      signerWorkflow: string;
      sourceRepository: string;
    }) => ({
      artifactSha256,
      builderId: "https://github.com/actions/runner",
      finishedAt: "2026-08-18T12:40:00.000Z",
      invocationId: `github-run-${artifactSha256}`,
      sourceDigest: expectedCandidateSha,
      sourceRepository: repository === sourceRepository ? sourceRepository : "",
      signerDigest,
      signerWorkflow,
      startedAt: "2026-08-18T12:01:00.000Z",
    }),
  };
  const validate = (overrides?: {
    gitState?: LenderPortalReleaseGitState;
    hooks?: typeof hooks;
  }) =>
    validateLenderPortalReleaseAcceptanceEvidence({
      contract,
      contractSha256: contractResult.contractSha256,
      evidenceLocation: attestationUrl,
      gitState: overrides?.gitState ?? cleanGitState,
      now,
      repositoryRoot: process.cwd(),
      testOnlyHooks: overrides?.hooks ?? hooks,
    });
  const replaceArtifactPayload = (artifactId: string, value: unknown) => {
    const artifact = artifacts.find((candidate) => candidate.id === artifactId);
    if (!artifact) throw new Error(`Missing artifact ${artifactId}`);
    const contents = Buffer.from(JSON.stringify(value));
    remote.set(artifact.uri, contents);
    artifact.sha256 = sha256(contents);
  };
  const readArtifactPayload = (artifactId: string) => {
    const artifact = artifacts.find((candidate) => candidate.id === artifactId);
    if (!artifact) throw new Error(`Missing artifact ${artifactId}`);
    const contents = remote.get(artifact.uri);
    if (!contents) throw new Error(`Missing artifact bytes ${artifactId}`);
    return JSON.parse(contents.toString("utf8")) as Record<string, unknown>;
  };
  const replaceOperationalProof = (
    artifactId: string,
    mutate: (proof: Record<string, unknown>) => void
  ) => {
    const payload = readArtifactPayload(artifactId);
    const proof = payload.proof as Record<string, unknown>;
    mutate(proof);
    const resultArtifactUri = String(proof.resultArtifactUri);
    const report = Object.fromEntries(
      Object.entries(proof).filter(
        ([key]) =>
          ![
            "resultArtifactSha256",
            "resultArtifactUri",
            "resultGithubAttestationBundleSha256",
            "resultGithubAttestationBundleUri",
          ].includes(key)
      )
    );
    const resultBytes = Buffer.from(
      JSON.stringify({
        commitSha: candidateSha,
        deploymentId: deployment.id,
        gateId: proof.gateId,
        recordedAt: proof.recordedAt,
        releaseId,
        report,
        result: "passed",
        schemaVersion: "lender-portal-operational-raw-result/v1",
        sourceTreeSha,
      })
    );
    remote.set(resultArtifactUri, resultBytes);
    proof.resultArtifactSha256 = sha256(resultBytes);
    const resultAttestation = githubBundle(
      `${String(proof.gateId)}-raw-result`,
      sha256(resultBytes)
    );
    proof.resultGithubAttestationBundleSha256 = resultAttestation.sha256;
    proof.resultGithubAttestationBundleUri = resultAttestation.uri;
    replaceArtifactPayload(artifactId, payload);
  };
  const mutateBrowserManifest = (
    mappingId: string,
    mutate: (manifest: Record<string, unknown>) => Buffer | void
  ) => {
    replaceOperationalProof("browser-production", (proof) => {
      const observations = proof.observations as Array<Record<string, unknown>>;
      const observation = observations.find(
        (candidate) => candidate.mappingId === mappingId
      );
      if (!observation) throw new Error(`Missing browser manifest ${mappingId}`);
      const manifestUri = String(observation.manifestUri);
      const current = remote.get(manifestUri);
      if (!current) throw new Error(`Missing browser manifest bytes ${mappingId}`);
      const manifest = JSON.parse(current.toString("utf8")) as Record<
        string,
        unknown
      >;
      const replacement = mutate(manifest);
      const bytes = Buffer.isBuffer(replacement)
        ? replacement
        : Buffer.from(JSON.stringify(manifest));
      remote.set(manifestUri, bytes);
      observation.manifestSha256 = sha256(bytes);
    });
  };
  const mutateReceipt = (
    artifactId: "inbox-production" | "provider-production",
    uriKey: "providerReceiptUri" | "receiptUri",
    digestKey: "providerReceiptSha256" | "receiptSha256",
    mutate: (receipt: Record<string, unknown>) => void
  ) => {
    replaceOperationalProof(artifactId, (proof) => {
      const uri = String(proof[uriKey]);
      const current = remote.get(uri);
      if (!current) throw new Error(`Missing receipt ${artifactId}`);
      const receipt = JSON.parse(current.toString("utf8")) as Record<
        string,
        unknown
      >;
      mutate(receipt);
      const bytes = Buffer.from(JSON.stringify(receipt));
      remote.set(uri, bytes);
      proof[digestKey] = sha256(bytes);
      const attestation = githubBundle(`${artifactId}-receipt`, sha256(bytes));
      proof.githubAttestationBundleSha256 = attestation.sha256;
      proof.githubAttestationBundleUri = attestation.uri;
    });
  };
  const mutateBrowserTrace = (
    mappingId: string,
    mutate: (trace: Buffer) => Buffer
  ) => {
    mutateBrowserManifest(mappingId, (manifest) => {
      const trace = manifest.trace as Record<string, unknown>;
      const uri = String(trace.uri);
      const current = remote.get(uri);
      if (!current) throw new Error(`Missing trace ${mappingId}`);
      const replacement = mutate(current);
      remote.set(uri, replacement);
      trace.byteLength = replacement.byteLength;
      trace.sha256 = sha256(replacement);
      const attestation = githubBundle(
        `trace-bytes-${mappingId.toLowerCase()}`,
        sha256(replacement)
      );
      trace.githubAttestationBundleSha256 = attestation.sha256;
      trace.githubAttestationBundleUri = attestation.uri;
    });
  };
  const mutateExecutionReport = (
    artifactId: string,
    mutate: (report: Record<string, unknown>) => void
  ) => {
    const payload = readArtifactPayload(artifactId);
    const executionReport = payload.executionReport as {
      rawReportBase64: string;
      rawReportSha256: string;
    };
    const report = JSON.parse(
      Buffer.from(executionReport.rawReportBase64, "base64").toString("utf8")
    ) as Record<string, unknown>;
    mutate(report);
    const bytes = Buffer.from(JSON.stringify(report));
    executionReport.rawReportBase64 = bytes.toString("base64");
    executionReport.rawReportSha256 = sha256(bytes);
    const reportAttestation = githubBundle(
      `${artifactId}-mutated`,
      sha256(bytes)
    );
    Object.assign(executionReport, {
      githubAttestationBundleSha256: reportAttestation.sha256,
      githubAttestationBundleUri: reportAttestation.uri,
    });
    replaceArtifactPayload(artifactId, payload);
  };
  return {
    artifacts,
    attestation,
    contract,
    contractResult,
    effectiveUrls,
    redirectChains,
    getFetchCount: () => fetchCount,
    hooks,
    mutateExecutionReport,
    mutateBrowserManifest,
    mutateBrowserTrace,
    mutateReceipt,
    readArtifactPayload,
    remote,
    replaceArtifactPayload,
    replaceOperationalProof,
    resign,
    setGitStates: (states: LenderPortalReleaseGitState[]) => {
      gitStates = [...states];
    },
    validate,
  };
}

describe("Lender Portal production acceptance contract", () => {
  test("fails closed unless Phase 3 staged state is absent or directly false", () => {
    const currentSchema = readFileSync(
      join(process.cwd(), "convex/schema.ts"),
      "utf8"
    );
    const cutoverSchema = phase3CutoverSchemaFixture().toString("utf8");
    const assertedTrue = cutoverSchema.replace(
      /(\.index\("by_proposal_assignment_revision_status", \{[\s\S]*?)staged: false/,
      "$1staged: true as boolean"
    );
    const parenthesizedTrue = cutoverSchema.replace(
      /(\.index\("by_normalized_email", \{[\s\S]*?)staged: false/,
      "$1staged: (true)"
    );
    const falseThenTrue = cutoverSchema.replace(
      /(\.index\("by_proposal_assignment_revision_status", \{[\s\S]*?)staged: false/,
      "$1staged: false, staged: true"
    );
    const trueThenFalse = cutoverSchema.replace(
      /(\.index\("by_normalized_email", \{[\s\S]*?)staged: false/,
      "$1staged: true, staged: false"
    );
    const absent = cutoverSchema.replaceAll(/\s*staged: false,?/g, "");

    expect(() =>
      validateLenderPortalPhase3IndexCutoverSource(currentSchema)
    ).toThrow(/staged or has an unknown staged expression/);
    expect(() =>
      validateLenderPortalPhase3IndexCutoverSource(cutoverSchema)
    ).not.toThrow();
    expect(() =>
      validateLenderPortalPhase3IndexCutoverSource(absent)
    ).not.toThrow();
    expect(() =>
      validateLenderPortalPhase3IndexCutoverSource(assertedTrue)
    ).toThrow(/staged or has an unknown staged expression/);
    expect(() =>
      validateLenderPortalPhase3IndexCutoverSource(parenthesizedTrue)
    ).toThrow(/staged or has an unknown staged expression/);
    expect(() =>
      validateLenderPortalPhase3IndexCutoverSource(falseThenTrue)
    ).toThrow(/staged or has an unknown staged expression/);
    expect(() =>
      validateLenderPortalPhase3IndexCutoverSource(trueThenFalse)
    ).toThrow(/staged or has an unknown staged expression/);
  });

  test("resolves structured route consumers and exact registered test assertions", () => {
    const result = validateLenderPortalProductionAcceptanceContract({
      repositoryRoot: process.cwd(),
    });

    expect(result.contract.schemaVersion).toBe(
      "lender-portal-production-acceptance/v3"
    );
    expect(result.contract.surfaces).toHaveLength(4);
    expect(result.contract.journeys).toHaveLength(10);
    expect(result.contract.verticalSliceGates).toHaveLength(10);
    expect(
      result.contract.testProofs.every(
        (proof) => proof.assertionName && proof.observableResult
      )
    ).toBe(true);
    expect(result.contractSha256).toBe(
      sha256(
        readFileSync(
          join(process.cwd(), LENDER_PORTAL_ACCEPTANCE_CONTRACT_PATH)
        )
      )
    );
  });

  test("accepts independently specified mappings with real Ed25519 signatures and simulated remote fetches", () => {
    const fixture = createEvidenceFixture();

    expect(fixture.validate().payload.candidateSha).toBe(candidateSha);
    expect(fixture.getFetchCount()).toBeGreaterThan(30);
  });

  test("requires exact authorized Phase 3 migration, manifest, index, and rollback evidence", () => {
    const missingApply = createEvidenceFixture();
    missingApply.replaceOperationalProof(
      "phase3-cutover-production",
      (proof) => {
        const migrations = proof.migrations as Array<Record<string, unknown>>;
        delete migrations[0]!.apply;
      }
    );
    missingApply.resign();
    expect(() => missingApply.validate()).toThrow(/apply/);

    const unsealed = createEvidenceFixture();
    unsealed.replaceOperationalProof(
      "phase3-cutover-production",
      (proof) => {
        const manifests = proof.manifestSealing as Record<string, unknown>;
        manifests.sealedManifestCount = 1;
      }
    );
    unsealed.resign();
    expect(() => unsealed.validate()).toThrow(/not completely sealed/);

    const foreignReadback = createEvidenceFixture();
    foreignReadback.replaceOperationalProof(
      "phase3-cutover-production",
      (proof) => {
        const readback = proof.authenticatedReadback as Record<string, unknown>;
        readback.query = "lender_portal:getLenderDashboard";
      }
    );
    foreignReadback.resign();
    expect(() => foreignReadback.validate()).toThrow();

    const noRollback = createEvidenceFixture();
    noRollback.replaceOperationalProof(
      "phase3-cutover-production",
      (proof) => {
        delete proof.rollbackRehearsal;
      }
    );
    noRollback.resign();
    expect(() => noRollback.validate()).toThrow(/rollbackRehearsal/);
  });

  test("rejects a Phase 3 cutover claim that does not match the immutable schema source", () => {
    const fixture = createEvidenceFixture();
    const currentSchema = readFileSync(join(process.cwd(), "convex/schema.ts"));

    expect(() =>
      fixture.validate({
        hooks: {
          ...fixture.hooks,
          readRepositoryFile: (path: string) =>
            path === "convex/schema.ts"
              ? currentSchema
              : readFileSync(join(process.cwd(), path)),
        },
      })
    ).toThrow(/does not match the candidate schema source|still staged/);
  });

  test("rejects locally self-attested runner reports without trusted CI verification", () => {
    const fixture = createEvidenceFixture();
    const { verifyGithubAttestation: _verification, ...selfAttestedHooks } =
      fixture.hooks;

    expect(() =>
      fixture.validate({
        hooks: selfAttestedHooks as typeof fixture.hooks,
      })
    ).toThrow(/requires independently verified CI provenance/);

    const foreignCi = createEvidenceFixture();
    expect(() =>
      foreignCi.validate({
        hooks: {
          ...foreignCi.hooks,
          verifyGithubAttestation: (args) => ({
            artifactSha256: args.artifactSha256,
            builderId: "https://github.com/actions/runner",
            finishedAt: "2026-08-18T12:40:00.000Z",
            invocationId: "foreign-ci-run",
            sourceDigest: "c".repeat(40),
            sourceRepository: args.sourceRepository,
            signerDigest: args.signerDigest,
            signerWorkflow: args.signerWorkflow,
            startedAt: "2026-08-18T12:01:00.000Z",
          }),
        },
      })
    ).toThrow(/GitHub Actions attestation is stale or foreign/);
  });

  test("rejects dirty state before any evidence fetch", () => {
    const fixture = createEvidenceFixture();

    expect(() =>
      fixture.validate({
        gitState: { ...cleanGitState, dirtyEntryCount: 2, isClean: false },
      })
    ).toThrow(/clean immutable checkout/);
    expect(fixture.getFetchCount()).toBe(0);
  });

  test("rejects repository state changes after remote evidence resolution", () => {
    const fixture = createEvidenceFixture();
    fixture.setGitStates([
      cleanGitState,
      { ...cleanGitState, headSha: "c".repeat(40) },
    ]);

    expect(() => fixture.validate()).toThrow(
      /repository HEAD or tree change during validation/
    );
  });

  test("rejects local, test-domain, foreign-repository, and traversal evidence URLs", () => {
    const local = createEvidenceFixture();
    expect(() =>
      validateLenderPortalReleaseAcceptanceEvidence({
        contract: local.contract,
        contractSha256: local.contractResult.contractSha256,
        evidenceLocation: "./attestation.json",
        gitState: cleanGitState,
        repositoryRoot: process.cwd(),
        testOnlyHooks: local.hooks,
      })
    ).toThrow(/trusted GitHub release asset URL/);

    const testDomain = createEvidenceFixture();
    expect(() =>
      validateLenderPortalReleaseAcceptanceEvidence({
        contract: testDomain.contract,
        contractSha256: testDomain.contractResult.contractSha256,
        evidenceLocation: "https://evidence.example.test/release/attestation.json",
        gitState: cleanGitState,
        repositoryRoot: process.cwd(),
        testOnlyHooks: testDomain.hooks,
      })
    ).toThrow(/trusted GitHub release asset URL/);

    const foreign = createEvidenceFixture();
    expect(() =>
      validateLenderPortalReleaseAcceptanceEvidence({
        contract: foreign.contract,
        contractSha256: foreign.contractResult.contractSha256,
        evidenceLocation:
          "https://github.com/another/repository/releases/download/v1/a.json",
        gitState: cleanGitState,
        repositoryRoot: process.cwd(),
        testOnlyHooks: foreign.hooks,
      })
    ).toThrow(/trusted GitHub release asset URL/);

    const traversal = createEvidenceFixture();
    expect(() =>
      validateLenderPortalReleaseAcceptanceEvidence({
        contract: traversal.contract,
        contractSha256: traversal.contractResult.contractSha256,
        evidenceLocation: `${releaseBaseUrl}%2e%2e/raw/attestation.json`,
        gitState: cleanGitState,
        repositoryRoot: process.cwd(),
        testOnlyHooks: traversal.hooks,
      })
    ).toThrow(/path traversal|trusted GitHub release asset URL/);
  });

  test("rejects arbitrary redirect origins and unexpected GitHub asset paths", () => {
    const foreignRedirect = createEvidenceFixture();
    foreignRedirect.effectiveUrls.set(
      attestationUrl,
      "https://attacker.example.com/attestation.json"
    );
    expect(() => foreignRedirect.validate()).toThrow(
      /untrusted evidence origin or path/
    );

    const wrongPath = createEvidenceFixture();
    wrongPath.effectiveUrls.set(
      attestationUrl,
      "https://release-assets.githubusercontent.com/raw/content.json"
    );
    expect(() => wrongPath.validate()).toThrow(
      /untrusted evidence origin or path/
    );

    const allowedRedirect = createEvidenceFixture();
    allowedRedirect.effectiveUrls.set(
      attestationUrl,
      "https://release-assets.githubusercontent.com/github-production-release-asset/12345/abcd-1234/attestation.json?token=opaque"
    );
    expect(allowedRedirect.validate().payload.candidateSha).toBe(candidateSha);

    const foreignIntermediateHop = createEvidenceFixture();
    const allowedFinalUrl =
      "https://release-assets.githubusercontent.com/github-production-release-asset/12345/abcd-1234/attestation.json?token=opaque";
    foreignIntermediateHop.effectiveUrls.set(attestationUrl, allowedFinalUrl);
    foreignIntermediateHop.redirectChains.set(attestationUrl, [
      "https://attacker.example.com/intermediate.json",
      allowedFinalUrl,
    ]);
    expect(() => foreignIntermediateHop.validate()).toThrow(
      /untrusted evidence origin or path/
    );
  });

  test("rejects stale artifact commit or tree bindings", () => {
    const fixture = createEvidenceFixture();
    fixture.artifacts[0]!.commitSha = "c".repeat(40);
    fixture.resign();

    expect(() => fixture.validate()).toThrow(/stale or bound to a foreign/);

    const treeMismatch = createEvidenceFixture();
    treeMismatch.artifacts[0]!.sourceTreeSha = "c".repeat(40);
    treeMismatch.resign();
    expect(() => treeMismatch.validate()).toThrow(
      /stale or bound to a foreign/
    );
  });

  test("rejects a mismatched immutable release bundle or reused independent artifact", () => {
    const bundleMismatch = createEvidenceFixture();
    bundleMismatch.remote.set(
      bundleMismatch.attestation.payload.deployment.releaseBundleUri,
      Buffer.from("different bundle bytes")
    );
    expect(() => bundleMismatch.validate()).toThrow(
      /release bundle digest does not match/
    );

    const reusedIndependent = createEvidenceFixture();
    const independent = reusedIndependent.artifacts.find(
      (artifact) => artifact.id === "independent-review"
    );
    const release = reusedIndependent.artifacts.find(
      (artifact) => artifact.id === "release-build"
    );
    if (!(independent && release)) throw new Error("Missing fixture artifacts");
    independent.uri = release.uri;
    reusedIndependent.resign();
    expect(() => reusedIndependent.validate()).toThrow(
      /duplicate values|must be distinct/
    );
  });

  test("rejects reused artifacts and metadata-only machine claims", () => {
    const reused = createEvidenceFixture();
    reused.attestation.payload.journeys[1]!.artifactId =
      reused.attestation.payload.journeys[0]!.artifactId;
    reused.resign();
    expect(() => reused.validate()).toThrow(/reuses a machine evidence artifact/);

    const unrelated = createEvidenceFixture();
    const machineId = unrelated.attestation.payload.journeys[0]!.artifactId;
    unrelated.replaceArtifactPayload(machineId, {
      artifactId: machineId,
      commitSha: candidateSha,
      proof: {
        assertionName: "unrelated test",
        command: "bun run test:lender-portal-production-journeys",
        commandId: "registered-production-journeys",
        consumerIds: ["route-dashboard"],
        mappingId: "LP-E2E-01",
        observableResult: "Unrelated output that proves no registered journey.",
        result: "passed",
        resultDigest: "e".repeat(64),
        targetFile: "src/routes/lender/-dashboard-route.test.tsx",
        testProofId: "proof-e2e-01",
      },
      schemaVersion: "lender-portal-machine-proof/v1",
      sourceTreeSha,
    });
    unrelated.resign();
    expect(() => unrelated.validate()).toThrow(/executionReport/);
  });

  test("rejects replayed and fabricated execution reports", () => {
    const replayed = createEvidenceFixture();
    const firstId = replayed.attestation.payload.journeys[0]!.artifactId;
    const secondId = replayed.attestation.payload.journeys[1]!.artifactId;
    const firstPayload = replayed.readArtifactPayload(firstId);
    const secondPayload = replayed.readArtifactPayload(secondId);
    secondPayload.executionReport = firstPayload.executionReport;
    replayed.replaceArtifactPayload(secondId, secondPayload);
    replayed.resign();
    expect(() => replayed.validate()).toThrow(/replays execution report/);

    const fabricated = createEvidenceFixture();
    const artifactId = fabricated.attestation.payload.journeys[0]!.artifactId;
    fabricated.mutateExecutionReport(artifactId, (report) => {
      const runner = report.runner as Record<string, unknown>;
      runner.version = "9.9.9";
    });
    fabricated.resign();
    expect(() => fabricated.validate()).toThrow(
      /does not prove its designated test invocation and result/
    );

    const fabricatedNative = createEvidenceFixture();
    const nativeArtifactId =
      fabricatedNative.attestation.payload.journeys[0]!.artifactId;
    fabricatedNative.mutateExecutionReport(nativeArtifactId, (report) => {
      const native = report.nativeReport as {
        rawReportBase64: string;
        rawReportSha256: string;
      };
      const nativeValue = JSON.parse(
        Buffer.from(native.rawReportBase64, "base64").toString("utf8")
      ) as Record<string, unknown>;
      const results = nativeValue.testResults as Array<Record<string, unknown>>;
      const assertions = results[0]!.assertionResults as Array<
        Record<string, unknown>
      >;
      assertions[0]!.title = "fabricated passing assertion";
      const nativeBytes = Buffer.from(JSON.stringify(nativeValue));
      native.rawReportBase64 = nativeBytes.toString("base64");
      native.rawReportSha256 = sha256(nativeBytes);
    });
    fabricatedNative.resign();
    expect(() => fabricatedNative.validate()).toThrow(
      /does not prove its designated test invocation and result/
    );
  });

  test("rejects incomplete suite totals, skipped tests, stale release identities, and stale CI attestations", () => {
    const incompleteTotals = createEvidenceFixture();
    const artifactId = incompleteTotals.attestation.payload.journeys[0]!.artifactId;
    incompleteTotals.mutateExecutionReport(artifactId, (report) => {
      const totals = report.expectedTotals as Record<string, unknown>;
      totals.tests = 2;
    });
    incompleteTotals.resign();
    expect(() => incompleteTotals.validate()).toThrow(
      /does not prove its designated test invocation and result/
    );

    const skipped = createEvidenceFixture();
    const skippedArtifactId = skipped.attestation.payload.journeys[0]!.artifactId;
    skipped.mutateExecutionReport(skippedArtifactId, (report) => {
      const native = report.nativeReport as {
        rawReportBase64: string;
        rawReportSha256: string;
      };
      const nativeValue = JSON.parse(
        Buffer.from(native.rawReportBase64, "base64").toString("utf8")
      ) as Record<string, unknown>;
      nativeValue.numPassedTests = 0;
      nativeValue.numPendingTests = 1;
      const results = nativeValue.testResults as Array<Record<string, unknown>>;
      results[0]!.status = "pending";
      const assertions = results[0]!.assertionResults as Array<
        Record<string, unknown>
      >;
      assertions[0]!.status = "skipped";
      const nativeBytes = Buffer.from(JSON.stringify(nativeValue));
      native.rawReportBase64 = nativeBytes.toString("base64");
      native.rawReportSha256 = sha256(nativeBytes);
    });
    skipped.resign();
    expect(() => skipped.validate()).toThrow(/expected.*0|pending|does not prove/i);

    const staleRelease = createEvidenceFixture();
    const staleArtifactId =
      staleRelease.attestation.payload.journeys[0]!.artifactId;
    staleRelease.mutateExecutionReport(staleArtifactId, (report) => {
      report.releaseId = "40000000-0000-4000-8000-000000000002";
    });
    staleRelease.resign();
    expect(() => staleRelease.validate()).toThrow(
      /does not prove its designated test invocation and result/
    );

    const staleCi = createEvidenceFixture();
    expect(() =>
      staleCi.validate({
        hooks: {
          ...staleCi.hooks,
          verifyGithubAttestation: (args) => ({
            ...staleCi.hooks.verifyGithubAttestation!(args),
            finishedAt: "2026-08-18T11:00:00.000Z",
            startedAt: "2026-08-18T10:59:00.000Z",
          }),
        },
      })
    ).toThrow(/GitHub Actions attestation is stale or foreign/);
  });

  test("rejects partial and gate-generic operational evidence", () => {
    const fixture = createEvidenceFixture();
    const browserId =
      fixture.attestation.payload.operationalGates[0]!.artifactId;
    fixture.replaceArtifactPayload(browserId, {
      artifactId: browserId,
      commitSha: candidateSha,
      proof: {
        deploymentId: "deployment-production-1",
        deploymentUrl: "https://drawflow.fairlend.ca",
        gateId: "authenticated-production-browser",
        result: "passed",
      },
      schemaVersion: "lender-portal-operational-proof/v1",
      sourceTreeSha,
    });
    fixture.resign();

    expect(() => fixture.validate()).toThrow();

    const fabricatedResult = createEvidenceFixture();
    const focusId = "focus-production";
    const focusPayload = fabricatedResult.readArtifactPayload(focusId);
    const focusProof = focusPayload.proof as Record<string, unknown>;
    const resultUri = String(focusProof.resultArtifactUri);
    const rawResult = JSON.parse(
      fabricatedResult.remote.get(resultUri)!.toString("utf8")
    ) as Record<string, unknown>;
    rawResult.report = {
      gateId: "focus-and-status-announcements",
      result: "passed",
    };
    const rawBytes = Buffer.from(JSON.stringify(rawResult));
    fabricatedResult.remote.set(resultUri, rawBytes);
    focusProof.resultArtifactSha256 = sha256(rawBytes);
    fabricatedResult.replaceArtifactPayload(focusId, focusPayload);
    fabricatedResult.resign();
    expect(() => fabricatedResult.validate()).toThrow(
      /does not prove gate semantics/
    );
  });

  test("requires independent CI attestation for operational results and pinned build provenance", () => {
    const unattestedOperationalResult = createEvidenceFixture();
    expect(() =>
      unattestedOperationalResult.validate({
        hooks: {
          ...unattestedOperationalResult.hooks,
          verifyGithubAttestation: (args) => {
            const verified =
              unattestedOperationalResult.hooks.verifyGithubAttestation!(args);
            return args.label ===
              "focus-and-status-announcements raw operational result"
              ? { ...verified, sourceDigest: "c".repeat(40) }
              : verified;
          },
        },
      })
    ).toThrow(/GitHub Actions attestation is stale or foreign/);

    const validManifest = {
      artifacts: [
        { path: "server/index.mjs", sha256: "d".repeat(64) },
      ],
      build: {
        command: "bun run build",
        executablePath:
          LENDER_PORTAL_PRODUCTION_TRUST_ROOT.executables.bun.path,
        executableSha256:
          LENDER_PORTAL_PRODUCTION_TRUST_ROOT.executables.bun.sha256,
        executableVersion:
          LENDER_PORTAL_PRODUCTION_TRUST_ROOT.executables.bun.version,
        finishedAt: "2026-08-18T12:04:00.000Z",
        startedAt: "2026-08-18T12:01:00.000Z",
      },
      commitSha: candidateSha,
      deploymentId: "deployment-production-1",
      releaseId: "30000000-0000-4000-8000-000000000001",
      schemaVersion: "lender-portal-release-bundle-manifest/v1",
      sourceTreeSha,
    };
    expect(
      validateLenderPortalReleaseBundleManifestFixture(
        validManifest,
        "2026-08-18T12:05:00.000Z"
      )
        .build.executableSha256
    ).toBe(LENDER_PORTAL_PRODUCTION_TRUST_ROOT.executables.bun.sha256);
    expect(() =>
      validateLenderPortalReleaseBundleManifestFixture({
        ...validManifest,
        build: { ...validManifest.build, executableSha256: "f".repeat(64) },
      })
    ).toThrow();
    expect(() =>
      validateLenderPortalReleaseBundleManifestFixture(
        {
          ...validManifest,
          build: {
            ...validManifest.build,
            finishedAt: "2026-08-18T12:06:00.000Z",
          },
        },
        "2026-08-18T12:05:00.000Z"
      )
    ).toThrow(/cannot finish after deployment/);
    for (const unsafePath of [
      "/tmp/release-artifact.mjs",
      "../outside/release-artifact.mjs",
      "server/../../outside.mjs",
    ]) {
      expect(() =>
        validateLenderPortalReleaseBundleManifestFixture({
          ...validManifest,
          artifacts: [{ path: unsafePath, sha256: "d".repeat(64) }],
        })
      ).toThrow(/safe relative path/);
    }
  });

  test("rejects malformed, reused, and fabricated authenticated browser traces", () => {
    const plainText = createEvidenceFixture();
    plainText.mutateBrowserManifest("LP-E2E-01", (manifest) => {
      const trace = manifest.trace as Record<string, unknown>;
      const bytes = Buffer.from("plain text labeled as a Playwright archive");
      plainText.remote.set(String(trace.uri), bytes);
      trace.byteLength = bytes.byteLength;
      trace.sha256 = sha256(bytes);
    });
    plainText.resign();
    expect(() => plainText.validate()).toThrow(/decompressible ZIP archive/);

    const missingIdentity = createEvidenceFixture();
    missingIdentity.mutateBrowserManifest("LP-E2E-01", (manifest) => {
      manifest.actor = undefined;
    });
    missingIdentity.resign();
    expect(() => missingIdentity.validate()).toThrow(/actor/);

    const missingRunner = createEvidenceFixture();
    missingRunner.mutateBrowserManifest("LP-E2E-01", (manifest) => {
      manifest.runner = undefined;
    });
    missingRunner.resign();
    expect(() => missingRunner.validate()).toThrow(/runner/);

    const emptyStorageState = createEvidenceFixture();
    emptyStorageState.mutateBrowserTrace("LP-E2E-01", (trace) => {
      const entries = unzipSync(trace);
      const events = Buffer.from(entries["trace.trace"]!)
        .toString("utf8")
        .trim()
        .split("\n")
        .map((line) => JSON.parse(line) as Record<string, unknown>);
      const authResult = events.find(
        (event) =>
          event.type === "after" &&
          String(event.callId).endsWith("-authenticate-call")
      );
      if (!authResult) throw new Error("Missing storage-state result");
      authResult.result = { value: { cookies: [], origins: [] } };
      return Buffer.from(
        zipSync({
          "trace.network": entries["trace.network"]!,
          "trace.trace": Buffer.from(
            `${events.map((event) => JSON.stringify(event)).join("\n")}\n`
          ),
        })
      );
    });
    emptyStorageState.resign();
    expect(() => emptyStorageState.validate()).toThrow(
      /active, production-scoped WorkOS session cookie/
    );

    const unauthenticatedRouteRequest = createEvidenceFixture();
    unauthenticatedRouteRequest.mutateBrowserTrace("LP-E2E-01", (trace) => {
      const entries = unzipSync(trace);
      const networkEvents = Buffer.from(entries["trace.network"]!)
        .toString("utf8")
        .trim()
        .split("\n")
        .map((line) => JSON.parse(line) as Record<string, unknown>);
      const snapshot = networkEvents[0]!.snapshot as Record<string, unknown>;
      const request = snapshot.request as Record<string, unknown>;
      request.headers = (request.headers as Array<Record<string, unknown>>).filter(
        (header) => String(header.name).toLowerCase() !== "cookie"
      );
      return Buffer.from(
        zipSync({
          "trace.network": Buffer.from(
            `${networkEvents.map((event) => JSON.stringify(event)).join("\n")}\n`
          ),
          "trace.trace": entries["trace.trace"]!,
        })
      );
    });
    unauthenticatedRouteRequest.resign();
    expect(() => unauthenticatedRouteRequest.validate()).toThrow(
      /network events are stale or unrelated/
    );

    const foreignAuthenticatedActor = createEvidenceFixture();
    foreignAuthenticatedActor.mutateBrowserTrace("LP-E2E-01", (trace) => {
      const entries = unzipSync(trace);
      const networkEvents = Buffer.from(entries["trace.network"]!)
        .toString("utf8")
        .trim()
        .split("\n")
        .map((line) => JSON.parse(line) as Record<string, unknown>);
      const snapshot = networkEvents[0]!.snapshot as Record<string, unknown>;
      const response = snapshot.response as Record<string, unknown>;
      const subjectHeader = (
        response.headers as Array<Record<string, unknown>>
      ).find(
        (header) =>
          String(header.name).toLowerCase() ===
          "x-drawflow-auth-subject-hash"
      );
      if (!subjectHeader) throw new Error("Missing authenticated subject header");
      subjectHeader.value = sha256("foreign-authenticated-subject");
      return Buffer.from(
        zipSync({
          "trace.network": Buffer.from(
            `${networkEvents.map((event) => JSON.stringify(event)).join("\n")}\n`
          ),
          "trace.trace": entries["trace.trace"]!,
        })
      );
    });
    foreignAuthenticatedActor.resign();
    expect(() => foreignAuthenticatedActor.validate()).toThrow(
      /network events are stale or unrelated/
    );

    const foreignDeployment = createEvidenceFixture();
    foreignDeployment.mutateBrowserManifest("LP-E2E-01", (manifest) => {
      manifest.deploymentOrigin = "https://unrelated.example.com";
    });
    foreignDeployment.resign();
    expect(() => foreignDeployment.validate()).toThrow(/stale or unrelated/);

    const fabricated = createEvidenceFixture();
    fabricated.mutateBrowserManifest("LP-E2E-01", (manifest) => {
      const steps = manifest.steps as Array<Record<string, unknown>>;
      steps[2]!.observedResult = "A fabricated generic browser result.";
    });
    fabricated.resign();
    expect(() => fabricated.validate()).toThrow(/stale or unrelated/);

    const unrelatedTrace = createEvidenceFixture();
    unrelatedTrace.mutateBrowserTrace("LP-E2E-01", (trace) => {
      const entries = unzipSync(trace);
      const events = Buffer.from(entries["trace.trace"]!)
        .toString("utf8")
        .trim()
        .split("\n")
        .map((line) => JSON.parse(line) as Record<string, unknown>);
      const markerEvent = events.find(
        (event) =>
          event.type === "console" &&
          String(event.text).startsWith("LENDER_PORTAL_ACCEPTANCE:")
      );
      if (!markerEvent) throw new Error("Missing trace marker");
      const encoded = String(markerEvent.text).slice(
        "LENDER_PORTAL_ACCEPTANCE:".length
      );
      const marker = JSON.parse(
        Buffer.from(encoded, "base64url").toString("utf8")
      ) as Record<string, unknown>;
      marker.observedResult = "Unrelated synthetic observation";
      markerEvent.text = `LENDER_PORTAL_ACCEPTANCE:${Buffer.from(
        JSON.stringify(marker)
      ).toString("base64url")}`;
      return Buffer.from(
        zipSync({
          "trace.network": entries["trace.network"]!,
          "trace.trace": Buffer.from(
            `${events.map((event) => JSON.stringify(event)).join("\n")}\n`
          ),
        })
      );
    });
    unrelatedTrace.resign();
    expect(() => unrelatedTrace.validate()).toThrow(
      /trace events are stale or unrelated/
    );

    const unrelatedNetwork = createEvidenceFixture();
    unrelatedNetwork.mutateBrowserTrace("LP-E2E-01", (trace) => {
      const entries = unzipSync(trace);
      const networkEvents = Buffer.from(entries["trace.network"]!)
        .toString("utf8")
        .trim()
        .split("\n")
        .map((line) => JSON.parse(line) as Record<string, unknown>);
      const snapshot = networkEvents[0]!.snapshot as Record<string, unknown>;
      const request = snapshot.request as Record<string, unknown>;
      request.url = "https://drawflow.fairlend.ca/unrelated";
      return Buffer.from(
        zipSync({
          "trace.network": Buffer.from(
            `${networkEvents.map((event) => JSON.stringify(event)).join("\n")}\n`
          ),
          "trace.trace": entries["trace.trace"]!,
        })
      );
    });
    unrelatedNetwork.resign();
    expect(() => unrelatedNetwork.validate()).toThrow(
      /network events are stale or unrelated/
    );

    const outOfOrderInteraction = createEvidenceFixture();
    outOfOrderInteraction.mutateBrowserTrace("LP-E2E-01", (trace) => {
      const entries = unzipSync(trace);
      const events = Buffer.from(entries["trace.trace"]!)
        .toString("utf8")
        .trim()
        .split("\n")
        .map((line) => JSON.parse(line) as Record<string, unknown>);
      const navigateIndex = events.findIndex(
        (event) => event.type === "before" && event.apiName === "page.goto"
      );
      const assertionIndex = events.findIndex(
        (event) =>
          event.type === "before" && event.apiName === "locator.textContent"
      );
      if (navigateIndex < 0 || assertionIndex < 0) {
        throw new Error("Missing ordered trace calls");
      }
      [events[navigateIndex], events[assertionIndex]] = [
        events[assertionIndex]!,
        events[navigateIndex]!,
      ];
      return Buffer.from(
        zipSync({
          "trace.network": entries["trace.network"]!,
          "trace.trace": Buffer.from(
            `${events.map((event) => JSON.stringify(event)).join("\n")}\n`
          ),
        })
      );
    });
    outOfOrderInteraction.resign();
    expect(() => outOfOrderInteraction.validate()).toThrow(
      /interaction sequence is invalid/
    );

    const swappedAfterOperation = createEvidenceFixture();
    swappedAfterOperation.mutateBrowserTrace("LP-E2E-01", (trace) => {
      const entries = unzipSync(trace);
      const events = Buffer.from(entries["trace.trace"]!)
        .toString("utf8")
        .trim()
        .split("\n")
        .map((line) => JSON.parse(line) as Record<string, unknown>);
      const navigateAfter = events.find(
        (event) =>
          event.type === "after" &&
          String(event.callId).endsWith("-navigate-call")
      );
      if (!navigateAfter) throw new Error("Missing navigation after event");
      navigateAfter.apiName = "locator.textContent";
      return Buffer.from(
        zipSync({
          "trace.network": entries["trace.network"]!,
          "trace.trace": Buffer.from(
            `${events.map((event) => JSON.stringify(event)).join("\n")}\n`
          ),
        })
      );
    });
    swappedAfterOperation.resign();
    expect(() => swappedAfterOperation.validate()).toThrow(
      /requires one page.goto after event/
    );

    const fabricatedTraceResult = createEvidenceFixture();
    fabricatedTraceResult.mutateBrowserTrace("LP-E2E-01", (trace) => {
      const entries = unzipSync(trace);
      const events = Buffer.from(entries["trace.trace"]!)
        .toString("utf8")
        .trim()
        .split("\n")
        .map((line) => JSON.parse(line) as Record<string, unknown>);
      const resultEvent = events.find(
        (event) =>
          event.type === "after" &&
          String(event.callId).endsWith("-assert-call")
      );
      if (!resultEvent) throw new Error("Missing trace assertion result");
      resultEvent.result = { value: "Artifact-controlled generic success" };
      return Buffer.from(
        zipSync({
          "trace.network": entries["trace.network"]!,
          "trace.trace": Buffer.from(
            `${events.map((event) => JSON.stringify(event)).join("\n")}\n`
          ),
        })
      );
    });
    fabricatedTraceResult.resign();
    expect(() => fabricatedTraceResult.validate()).toThrow(
      /trace events are stale or unrelated/
    );

    const reused = createEvidenceFixture();
    const browserPayload = reused.readArtifactPayload("browser-production");
    const proof = browserPayload.proof as Record<string, unknown>;
    const observations = proof.observations as Array<Record<string, unknown>>;
    const first = observations.find(
      (observation) => observation.mappingId === "LP-E2E-01"
    );
    if (!first) throw new Error("Missing first browser observation");
    const firstManifest = JSON.parse(
      reused.remote.get(String(first.manifestUri))!.toString("utf8")
    ) as Record<string, unknown>;
    reused.mutateBrowserManifest("LP-E2E-02", (manifest) => {
      manifest.runId = firstManifest.runId;
      manifest.sessionId = firstManifest.sessionId;
      manifest.trace = firstManifest.trace;
    });
    reused.resign();
    expect(() => reused.validate()).toThrow(
      /reuses browser run, session, or trace evidence/
    );
  }, 30_000);

  test("rejects fabricated or reused provider and inbox receipts", () => {
    const wrongProvider = createEvidenceFixture();
    wrongProvider.mutateReceipt(
      "provider-production",
      "providerReceiptUri",
      "providerReceiptSha256",
      (receipt) => {
        receipt.provider = "Resend";
      }
    );
    wrongProvider.resign();
    expect(() => wrongProvider.validate()).toThrow(/WorkOS/);

    const wrongStatus = createEvidenceFixture();
    wrongStatus.mutateReceipt(
      "inbox-production",
      "receiptUri",
      "receiptSha256",
      (receipt) => {
        const records = receipt.records as Array<Record<string, unknown>>;
        records[0]!.status = "queued";
      }
    );
    wrongStatus.resign();
    expect(() => wrongStatus.validate()).toThrow(/delivered/);

    const reusedDelivery = createEvidenceFixture();
    reusedDelivery.mutateReceipt(
      "inbox-production",
      "receiptUri",
      "receiptSha256",
      (receipt) => {
        const records = receipt.records as Array<Record<string, unknown>>;
        records[1]!.deliveryId = records[0]!.deliveryId;
      }
    );
    reusedDelivery.resign();
    expect(() => reusedDelivery.validate()).toThrow(/identifiers are reused/);

    const wrongRoute = createEvidenceFixture();
    wrongRoute.mutateReceipt(
      "provider-production",
      "providerReceiptUri",
      "providerReceiptSha256",
      (receipt) => {
        const records = receipt.records as Array<Record<string, unknown>>;
        records[0]!.route = "/unrelated/provider/route";
      }
    );
    wrongRoute.resign();
    expect(() => wrongRoute.validate()).toThrow(/stale or misrouted/);

    for (const provider of ["WorkOS", "Resend"] as const) {
      const foreignResource = createEvidenceFixture();
      foreignResource.mutateReceipt(
        provider === "WorkOS" ? "provider-production" : "inbox-production",
        provider === "WorkOS" ? "providerReceiptUri" : "receiptUri",
        provider === "WorkOS" ? "providerReceiptSha256" : "receiptSha256",
        (receipt) => {
          const records = receipt.records as Array<Record<string, unknown>>;
          const readback = records[0]!.readback as Record<string, unknown>;
          readback.requestUrl =
            provider === "WorkOS"
              ? "https://api.workos.com/events/foreign-event"
              : "https://api.resend.com/emails/foreign-message";
        }
      );
      foreignResource.resign();
      expect(() => foreignResource.validate()).toThrow(
        /authenticated provider resource does not match its receipt record/
      );
    }

    const fabricatedReadback = createEvidenceFixture();
    fabricatedReadback.mutateReceipt(
      "provider-production",
      "providerReceiptUri",
      "providerReceiptSha256",
      (receipt) => {
        const records = receipt.records as Array<Record<string, unknown>>;
        const readback = records[0]!.readback as Record<string, unknown>;
        const response = Buffer.from(JSON.stringify({ status: "delivered" }));
        readback.responseBase64 = response.toString("base64");
        readback.responseSha256 = sha256(response);
      }
    );
    fabricatedReadback.resign();
    expect(() => fabricatedReadback.validate()).toThrow(
      /authenticated API response is stale or fabricated/
    );

    const reusedMapping = createEvidenceFixture();
    reusedMapping.mutateReceipt(
      "inbox-production",
      "receiptUri",
      "receiptSha256",
      (receipt) => {
        const records = receipt.records as Array<Record<string, unknown>>;
        records[1]!.mappingId = records[0]!.mappingId;
      }
    );
    reusedMapping.resign();
    expect(() => reusedMapping.validate()).toThrow(
      /mapping records contains duplicate values/
    );

    const selfConsistentWorkosRecipient = createEvidenceFixture();
    selfConsistentWorkosRecipient.mutateReceipt(
      "provider-production",
      "providerReceiptUri",
      "providerReceiptSha256",
      (receipt) => {
        const records = receipt.records as Array<Record<string, unknown>>;
        const record = records[0]!;
        const readback = record.readback as Record<string, unknown>;
        const response = JSON.parse(
          Buffer.from(String(readback.responseBase64), "base64").toString()
        ) as Record<string, unknown>;
        const artifactRecipientHash = sha256("artifact-controlled-recipient");
        record.recipientHash = artifactRecipientHash;
        response.recipientHash = artifactRecipientHash;
        const bytes = Buffer.from(JSON.stringify(response));
        readback.responseBase64 = bytes.toString("base64");
        readback.responseSha256 = sha256(bytes);
      }
    );
    selfConsistentWorkosRecipient.resign();
    expect(() => selfConsistentWorkosRecipient.validate()).toThrow(
      /source-owned production evidence principal/
    );

    const selfConsistentResendRecipient = createEvidenceFixture();
    selfConsistentResendRecipient.mutateReceipt(
      "inbox-production",
      "receiptUri",
      "receiptSha256",
      (receipt) => {
        const records = receipt.records as Array<Record<string, unknown>>;
        const record = records[0]!;
        const readback = record.readback as Record<string, unknown>;
        const response = JSON.parse(
          Buffer.from(String(readback.responseBase64), "base64").toString()
        ) as Record<string, unknown>;
        const artifactRecipientHash = sha256("artifact-controlled-inbox");
        record.recipientHash = artifactRecipientHash;
        response.recipientHash = artifactRecipientHash;
        const bytes = Buffer.from(JSON.stringify(response));
        readback.responseBase64 = bytes.toString("base64");
        readback.responseSha256 = sha256(bytes);
      }
    );
    selfConsistentResendRecipient.resign();
    expect(() => selfConsistentResendRecipient.validate()).toThrow(
      /source-owned production evidence principal/
    );

    const expectForeignPrincipalCorrelationRejected = (
      provider: "Resend" | "WorkOS",
      field: "organizationIdHash" | "roleHash" | "tenantIdHash"
    ) => {
      const fixture = createEvidenceFixture();
      const artifactId =
        provider === "WorkOS" ? "provider-production" : "inbox-production";
      const uriKey =
        provider === "WorkOS" ? "providerReceiptUri" : "receiptUri";
      const digestKey =
        provider === "WorkOS" ? "providerReceiptSha256" : "receiptSha256";
      const foreignValue = sha256(
        `artifact-controlled-${provider}-${field}`
      );
      fixture.mutateReceipt(
        artifactId,
        uriKey,
        digestKey,
        (receipt) => {
          const records = receipt.records as Array<Record<string, unknown>>;
          const record = records[0]!;
          const readback = record.readback as Record<string, unknown>;
          const response = JSON.parse(
            Buffer.from(String(readback.responseBase64), "base64").toString()
          ) as Record<string, unknown>;
          record[field] = foreignValue;
          response[field] = foreignValue;
          if (field === "tenantIdHash") {
            receipt.tenantIdHash = foreignValue;
          }
          readback.authorizationContextHash = sha256(
            stableLenderPortalEvidenceJson({
              assignmentIdentityHash: record.assignmentIdentityHash,
              mappingId: record.mappingId,
              organizationIdHash: record.organizationIdHash,
              provider,
              recipientHash: record.recipientHash,
              roleHash: record.roleHash,
              subjectIdHash: record.subjectIdHash,
              tenantIdHash: record.tenantIdHash,
            })
          );
          const responseBytes = Buffer.from(JSON.stringify(response));
          readback.responseBase64 = responseBytes.toString("base64");
          readback.responseSha256 = sha256(responseBytes);
        }
      );
      if (field === "tenantIdHash") {
        fixture.replaceOperationalProof(artifactId, (proof) => {
          proof.tenantIdHash = foreignValue;
        });
      }
      fixture.resign();
      expect(() => fixture.validate()).toThrow(
        /source-owned production principal|source-owned production evidence principal/
      );
    };

    for (const provider of ["WorkOS", "Resend"] as const) {
      for (const field of [
        "tenantIdHash",
        "organizationIdHash",
        "roleHash",
      ] as const) {
        expectForeignPrincipalCorrelationRejected(provider, field);
      }
    }
  });

  test("binds independent approval to deployment and every artifact statement", () => {
    const fixture = createEvidenceFixture();
    fixture.attestation.payload.deployment.url =
      "https://drawflow.fairlend.ca/altered-after-review";
    fixture.resign({ releaseOnly: true });

    expect(() => fixture.validate()).toThrow(
      /Independent acceptance signature verification failed/
    );
  });

  test("rejects swapped reviewer identity and non-disjoint signer trust", () => {
    const identity = createEvidenceFixture();
    identity.attestation.payload.independentAcceptance.reviewerId =
      "different-reviewer";
    identity.resign();
    expect(() => identity.validate()).toThrow(/reviewer identity/);

    const sameSigner = createEvidenceFixture();
    const mutated = clone(sameSigner.contract);
    mutated.trustedReviewers[0] = {
      ...mutated.trustedReviewers[0]!,
      id: "different-id-same-material",
      publicKeyPem: mutated.trustedReleaseKeys[0]!.publicKeyPem,
      sha256: mutated.trustedReleaseKeys[0]!.sha256,
    };
    expect(() =>
      validateLenderPortalProductionAcceptanceContractValue({
        contractValue: mutated,
        repositoryRoot: process.cwd(),
      })
    ).toThrow(/immutable trust root/);

    const rewrapped = clone(sameSigner.contract);
    const releasePem = rewrapped.trustedReleaseKeys[0]!.publicKeyPem;
    const crlfPem = releasePem.replaceAll("\n", "\r\n");
    rewrapped.trustedReviewers[0] = {
      ...rewrapped.trustedReviewers[0]!,
      id: "different-id-rewrapped-material",
      publicKeyPem: crlfPem,
      sha256: lenderPortalPublicKeyFingerprint(crlfPem),
    };
    expect(() =>
      validateLenderPortalProductionAcceptanceContractValue({
        contractValue: rewrapped,
        repositoryRoot: process.cwd(),
      })
    ).toThrow(/immutable trust root/);

    const rsa = generateKeyPairSync("rsa", { modulusLength: 2048 });
    const nonEd25519 = clone(sameSigner.contract);
    nonEd25519.trustedReviewers[0] = {
      ...nonEd25519.trustedReviewers[0]!,
      publicKeyPem: publicPem(rsa.publicKey),
      sha256: "d".repeat(64),
    };
    expect(() =>
      validateLenderPortalProductionAcceptanceContractValue({
        contractValue: nonEd25519,
        repositoryRoot: process.cwd(),
      })
    ).toThrow(/immutable trust root/);
  });

  test("rejects self-referential or backend-only production consumer mappings", () => {
    const fixture = createEvidenceFixture();
    const selfReferential = clone(fixture.contract);
    const route = selfReferential.consumers.find(
      (consumer) => consumer.id === "route-dashboard"
    );
    if (route?.class !== "production-route") throw new Error("Missing route");
    route.routeSource = "scripts/lender-portal-production-acceptance.ts";
    expect(() =>
      validateLenderPortalProductionAcceptanceContractValue({
        contractValue: selfReferential,
        repositoryRoot: process.cwd(),
      })
    ).toThrow(/trusted source policy/);

    const backendOnly = clone(fixture.contract);
    const mapping = backendOnly.journeys[0]!;
    const proof = backendOnly.testProofs.find(
      (candidate) => candidate.id === mapping.testProofId
    );
    if (!proof) throw new Error("Missing proof");
    mapping.consumerIds = ["api-proposal-lifecycle"];
    proof.consumerIds = ["api-proposal-lifecycle"];
    expect(() =>
      validateLenderPortalProductionAcceptanceContractValue({
        contractValue: backendOnly,
        repositoryRoot: process.cwd(),
      })
    ).toThrow(/lacks a supported production route|requires a real supported/);

    const wrongRouteTest = clone(fixture.contract);
    const routeProof = wrongRouteTest.testProofs.find(
      (candidate) => candidate.id === "proof-e2e-01"
    );
    if (!routeProof) throw new Error("Missing route proof");
    routeProof.targetFile = "src/routes/lender/-dashboard-route.test.tsx";
    routeProof.assertionName =
      "renders every Review requirement beyond the former three-row cap";
    expect(() =>
      validateLenderPortalProductionAcceptanceContractValue({
        contractValue: wrongRouteTest,
        repositoryRoot: process.cwd(),
      })
    ).toThrow(/trusted executable body and observable route behavior/);

    const prototypeComponent = clone(fixture.contract);
    const dashboard = prototypeComponent.consumers.find(
      (consumer) => consumer.id === "route-dashboard"
    );
    if (dashboard?.class !== "production-route") {
      throw new Error("Missing dashboard route");
    }
    dashboard.componentSource = "src/routes/lender.prototype.tsx";
    expect(() =>
      validateLenderPortalProductionAcceptanceContractValue({
        contractValue: prototypeComponent,
        repositoryRoot: process.cwd(),
      })
    ).toThrow(/trusted source policy/);

    const wrongQueryOwner = clone(fixture.contract);
    const dashboardOwner = wrongQueryOwner.consumers.find(
      (consumer) => consumer.id === "route-dashboard"
    );
    if (dashboardOwner?.class !== "production-route") {
      throw new Error("Missing dashboard route");
    }
    dashboardOwner.queryOwnerSource = "src/routes/lender/index.tsx";
    expect(() =>
      validateLenderPortalProductionAcceptanceContractValue({
        contractValue: wrongQueryOwner,
        repositoryRoot: process.cwd(),
      })
    ).toThrow(/trusted source policy/);

    const unrelatedQuery = clone(fixture.contract);
    const dashboardQuery = unrelatedQuery.consumers.find(
      (consumer) => consumer.id === "route-dashboard"
    );
    if (dashboardQuery?.class !== "production-route") {
      throw new Error("Missing dashboard route");
    }
    dashboardQuery.queryOwner =
      "api.lenderOrganizations.getCurrentLenderOrganization";
    expect(() =>
      validateLenderPortalProductionAcceptanceContractValue({
        contractValue: unrelatedQuery,
        repositoryRoot: process.cwd(),
      })
    ).toThrow(/trusted source policy/);
  });

  test("rejects mutable trust replacement, signer digest drift, and foreign workflow ownership", () => {
    const fixture = createEvidenceFixture();
    const replacementKey = clone(fixture.contract);
    replacementKey.trustedReleaseKeys[0] = {
      ...replacementKey.trustedReleaseKeys[0]!,
      sha256: "f".repeat(64),
    };
    expect(() =>
      validateLenderPortalProductionAcceptanceContractValue({
        contractValue: replacementKey,
        repositoryRoot: process.cwd(),
      })
    ).toThrow(/immutable trust root/);

    const signerDigest = clone(fixture.contract);
    signerDigest.evidencePolicy.githubAttestation.signerDigest = "c".repeat(40);
    expect(() =>
      validateLenderPortalProductionAcceptanceContractValue({
        contractValue: signerDigest,
        repositoryRoot: process.cwd(),
      })
    ).toThrow(/immutable trust root/);

    const foreignWorkflow = clone(fixture.contract);
    foreignWorkflow.evidencePolicy.githubAttestation.signerWorkflow =
      "github.com/foreign/repository/.github/workflows/lender-portal-production-evidence.yml";
    expect(() =>
      validateLenderPortalProductionAcceptanceContractValue({
        contractValue: foreignWorkflow,
        repositoryRoot: process.cwd(),
      })
    ).toThrow(/immutable trust root/);
  });

  test("rejects post-return and nested source-graph decoys while retaining the actual route", () => {
    const fixture = createEvidenceFixture();
    const dashboard = fixture.contract.consumers.find(
      (consumer) => consumer.id === "route-dashboard"
    );
    if (dashboard?.class !== "production-route") {
      throw new Error("Missing dashboard route consumer");
    }
    const unreachableDashboard = `
      import { createFileRoute } from "@tanstack/react-router";
      import { LenderDashboardVariantD } from "#/features/lender-dashboard/LenderDashboardVariantD.tsx";
      export const Route = createFileRoute("/lender/")({ component: LenderDashboard });
      function LenderDashboard() {
        if (false) return <LenderDashboardVariantD />;
        return <main>Decoy</main>;
      }
    `;
    expect(() =>
      validateLenderPortalProductionRouteConsumerSourceFixture({
        consumerValue: dashboard,
        repositoryRoot: process.cwd(),
        sourceOverrides: { routeSource: unreachableDashboard },
      })
    ).toThrow(/trusted render edge/);

    for (const falsyCondition of [
      "false",
      "0",
      "-0",
      "0n",
      '""',
      "null",
      "void 0",
    ]) {
      const falsyBranchDashboard = `
        import { createFileRoute } from "@tanstack/react-router";
        import { LenderDashboardVariantD } from "#/features/lender-dashboard/LenderDashboardVariantD.tsx";
        export const Route = createFileRoute("/lender/")({ component: LenderDashboard });
        function LenderDashboard() {
          if (${falsyCondition}) return <LenderDashboardVariantD />;
          return <main>Decoy</main>;
        }
      `;
      expect(() =>
        validateLenderPortalProductionRouteConsumerSourceFixture({
          consumerValue: dashboard,
          repositoryRoot: process.cwd(),
          sourceOverrides: { routeSource: falsyBranchDashboard },
        })
      ).toThrow(/trusted render edge/);
    }

    const falseLoopDashboard = `
      import { createFileRoute } from "@tanstack/react-router";
      import { LenderDashboardVariantD } from "#/features/lender-dashboard/LenderDashboardVariantD.tsx";
      export const Route = createFileRoute("/lender/")({ component: LenderDashboard });
      function LenderDashboard() {
        while (0) return <LenderDashboardVariantD />;
        for (; ""; ) return <LenderDashboardVariantD />;
        return 0 ? <LenderDashboardVariantD /> : <main>Decoy</main>;
      }
    `;
    expect(() =>
      validateLenderPortalProductionRouteConsumerSourceFixture({
        consumerValue: dashboard,
        repositoryRoot: process.cwd(),
        sourceOverrides: { routeSource: falseLoopDashboard },
      })
    ).toThrow(/trusted render edge/);

    const advancedDeadControlFlowSources = [
      `
        function LenderDashboard() {
          return 0 ?? <LenderDashboardVariantD />;
        }
      `,
      `
        function LenderDashboard() {
          if (1 !== 1) return <LenderDashboardVariantD />;
          return <main>Decoy</main>;
        }
      `,
      `
        function LenderDashboard() {
          switch (false) {
            case true: return <LenderDashboardVariantD />;
            default: return <main>Decoy</main>;
          }
        }
      `,
      `
        function LenderDashboard() {
          while (true) {}
          return <LenderDashboardVariantD />;
        }
      `,
      `
        function LenderDashboard() {
          try {
            return <main>Decoy</main>;
          } catch {
            return <main>Recovered decoy</main>;
          } finally {
            void 0;
          }
          return <LenderDashboardVariantD />;
        }
      `,
    ];
    for (const componentBody of advancedDeadControlFlowSources) {
      const routeSource = `
        import { createFileRoute } from "@tanstack/react-router";
        import { LenderDashboardVariantD } from "#/features/lender-dashboard/LenderDashboardVariantD.tsx";
        export const Route = createFileRoute("/lender/")({ component: LenderDashboard });
        ${componentBody}
      `;
      expect(() =>
        validateLenderPortalProductionRouteConsumerSourceFixture({
          consumerValue: dashboard,
          repositoryRoot: process.cwd(),
          sourceOverrides: { routeSource },
        })
      ).toThrow(/trusted render edge/);
    }

    expect(() =>
      validateLenderPortalProductionRouteConsumerSourceFixture({
        consumerValue: dashboard,
        repositoryRoot: process.cwd(),
        sourceOverrides: {
          routeSource: `${unreachableDashboard}\nconst DecoyRoute = createFileRoute("/decoy")({ component: LenderDashboard });`,
        },
      })
    ).toThrow(/exactly one createFileRoute/);

    const aliasedComponent = `
      import { createFileRoute } from "@tanstack/react-router";
      import { LenderDashboardVariantD as DashboardAlias } from "#/features/lender-dashboard/LenderDashboardVariantD.tsx";
      export const Route = createFileRoute("/lender/")({ component: LenderDashboard });
      function LenderDashboard() {
        return <DashboardAlias />;
      }
    `;
    expect(() =>
      validateLenderPortalProductionRouteConsumerSourceFixture({
        consumerValue: dashboard,
        repositoryRoot: process.cwd(),
        sourceOverrides: { routeSource: aliasedComponent },
      })
    ).toThrow(/production component import is missing or aliased/);

    const buildDetail = fixture.contract.consumers.find(
      (consumer) => consumer.id === "route-build-detail"
    );
    if (buildDetail?.class !== "production-route") {
      throw new Error("Missing Build Detail route consumer");
    }
    const postReturnComponentAndQuery = `
      import { createFileRoute } from "@tanstack/react-router";
      import { useQuery } from "convex/react";
      import { api } from "../../../../convex/_generated/api";
      import { LenderBuildDetailOverview } from "#/features/lender-portal/LenderBuildDetailOverview.tsx";
      export const Route = createFileRoute("/lender/builds/$buildId")({ component: LenderBuildDetail });
      function LenderBuildDetail() {
        return <main>Decoy</main>;
        useQuery(api.lender_portal.getLenderBuildDetail, {});
        return <LenderBuildDetailOverview />;
      }
    `;
    expect(() =>
      validateLenderPortalProductionRouteConsumerSourceFixture({
        consumerValue: buildDetail,
        repositoryRoot: process.cwd(),
        sourceOverrides: {
          querySource: postReturnComponentAndQuery,
          routeSource: postReturnComponentAndQuery,
        },
      })
    ).toThrow(/trusted render edge/);

    const postReturnQuery = `
      import { useQuery } from "convex/react";
      import { api } from "../../../../convex/_generated/api";
      function LenderBuildDetail(usePrimaryExit: boolean) {
        if (usePrimaryExit) {
          return null;
        } else {
          return null;
        }
        useQuery(api.lender_portal.getLenderBuildDetail, {});
      }
    `;
    expect(() =>
      validateLenderPortalProductionRouteConsumerSourceFixture({
        consumerValue: buildDetail,
        repositoryRoot: process.cwd(),
        sourceOverrides: { querySource: postReturnQuery },
      })
    ).toThrow(/canonical query owner is not called/);

    const falseLoopQuery = `
      import { useQuery } from "convex/react";
      import { api } from "../../../../convex/_generated/api";
      function LenderBuildDetail() {
        while (0) useQuery(api.lender_portal.getLenderBuildDetail, {});
        for (; ""; ) useQuery(api.lender_portal.getLenderBuildDetail, {});
        return null;
      }
    `;
    expect(() =>
      validateLenderPortalProductionRouteConsumerSourceFixture({
        consumerValue: buildDetail,
        repositoryRoot: process.cwd(),
        sourceOverrides: { querySource: falseLoopQuery },
      })
    ).toThrow(/canonical query owner is not called/);

    for (const queryOwnerBody of [
      `
        if (null ?? false) useQuery(api.lender_portal.getLenderBuildDetail, {});
        return null;
      `,
      `
        if (1 !== 1) useQuery(api.lender_portal.getLenderBuildDetail, {});
        return null;
      `,
      `
        switch (false) {
          case true: useQuery(api.lender_portal.getLenderBuildDetail, {}); break;
          default: return null;
        }
      `,
      `
        while (true) {}
        useQuery(api.lender_portal.getLenderBuildDetail, {});
      `,
      `
        try { return null; } catch { return null; } finally { void 0; }
        useQuery(api.lender_portal.getLenderBuildDetail, {});
      `,
      `
        try { return null; }
        catch { useQuery(api.lender_portal.getLenderBuildDetail, {}); }
      `,
    ]) {
      const deadAdvancedQuery = `
        import { useQuery } from "convex/react";
        import { api } from "../../../../convex/_generated/api";
        function LenderBuildDetail() { ${queryOwnerBody} }
      `;
      expect(() =>
        validateLenderPortalProductionRouteConsumerSourceFixture({
          consumerValue: buildDetail,
          repositoryRoot: process.cwd(),
          sourceOverrides: { querySource: deadAdvancedQuery },
        })
      ).toThrow(/canonical query owner is not called/);
    }

    expect(() =>
      validateLenderPortalProductionRouteConsumerSourceFixture({
        consumerValue: buildDetail,
        repositoryRoot: process.cwd(),
        sourceOverrides: {},
      })
    ).not.toThrow();

    const nestedQueryDecoy = `
      import { createFileRoute } from "@tanstack/react-router";
      import { useQuery } from "convex/react";
      import { api } from "../../../../convex/_generated/api";
      import { LenderBuildDetailOverview } from "#/features/lender-portal/LenderBuildDetailOverview.tsx";
      export const Route = createFileRoute("/lender/builds/$buildId")({ component: LenderBuildDetail });
      function LenderBuildDetail() {
        function unreachableQuery() { useQuery(api.lender_portal.getLenderBuildDetail, {}); }
        return <LenderBuildDetailOverview />;
      }
    `;
    expect(() =>
      validateLenderPortalProductionRouteConsumerSourceFixture({
        consumerValue: buildDetail,
        repositoryRoot: process.cwd(),
        sourceOverrides: {
          querySource: nestedQueryDecoy,
          routeSource: nestedQueryDecoy,
        },
      })
    ).toThrow(/canonical query owner is not called/);

    const locallyShadowedQuery = `
      import { useQuery } from "convex/react";
      import { api } from "../../../../convex/_generated/api";
      function LenderBuildDetail() {
        const useQuery = () => null;
        useQuery(api.lender_portal.getLenderBuildDetail, {});
        return null;
      }
    `;
    expect(() =>
      validateLenderPortalProductionRouteConsumerSourceFixture({
        consumerValue: buildDetail,
        repositoryRoot: process.cwd(),
        sourceOverrides: { querySource: locallyShadowedQuery },
      })
    ).toThrow(/canonical query bindings are locally shadowed/);

    expect(() =>
      validateLenderPortalRegisteredAssertionSourceFixture({
        assertionName:
          "renders every Review requirement beyond the former three-row cap",
        proofId: "proof-surface-dashboard",
        sourceText: `
          test("renders every Review requirement beyond the former three-row cap", () => expect(true).toBe(true));
          test("renders every Review requirement beyond the former three-row cap", () => expect(true).toBe(true));
        `,
      })
    ).toThrow(/does not uniquely match/);

    const assertionName =
      "renders every Review requirement beyond the former three-row cap";
    const canonicalTestPath = join(
      process.cwd(),
      "src/routes/lender/-dashboard-route.test.tsx"
    );
    const canonicalTestText = readFileSync(canonicalTestPath, "utf8");
    const canonicalTestSource = ts.createSourceFile(
      canonicalTestPath,
      canonicalTestText,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TSX
    );
    let canonicalBodyText: string | undefined;
    const findCanonicalBody = (node: ts.Node) => {
      if (
        ts.isCallExpression(node) &&
        ts.isIdentifier(node.expression) &&
        node.expression.text === "test" &&
        node.arguments[0] &&
        ts.isStringLiteral(node.arguments[0]) &&
        node.arguments[0].text === assertionName &&
        node.arguments[1] &&
        (ts.isArrowFunction(node.arguments[1]) ||
          ts.isFunctionExpression(node.arguments[1]))
      ) {
        canonicalBodyText = node.arguments[1].body.getText(canonicalTestSource);
      }
      node.forEachChild(findCanonicalBody);
    };
    findCanonicalBody(canonicalTestSource);
    if (!canonicalBodyText) throw new Error("Missing canonical dashboard body");
    expect(() =>
      validateLenderPortalRegisteredAssertionSourceFixture({
        assertionName,
        proofId: "proof-surface-dashboard",
        sourceText: `
          import { expect, test } from "vitest";
          function shadowedRegistration() {
            test(${JSON.stringify(assertionName)}, () => ${canonicalBodyText});
          }
          test("unrelated top-level test", () => expect(true).toBe(true));
        `,
      })
    ).toThrow(/trusted executable body and observable route behavior/);
  });

  test("rejects generic, missing, or unmapped registered test semantics", () => {
    const fixture = createEvidenceFixture();
    const generic = clone(fixture.contract);
    generic.testProofs[0]!.observableResult = "generic proof passed";
    expect(() =>
      validateLenderPortalProductionAcceptanceContractValue({
        contractValue: generic,
        repositoryRoot: process.cwd(),
      })
    ).toThrow(/generic-only/);

    const missing = clone(fixture.contract);
    missing.testProofs[0]!.assertionName = "not a registered assertion";
    expect(() =>
      validateLenderPortalProductionAcceptanceContractValue({
        contractValue: missing,
        repositoryRoot: process.cwd(),
      })
    ).toThrow(/trusted executable body and observable route behavior/);

    const reassigned = clone(fixture.contract);
    const closing = reassigned.testProofs.find(
      (proof) => proof.id === "proof-e2e-02"
    );
    const activation = reassigned.testProofs.find(
      (proof) => proof.id === "proof-e2e-03"
    );
    if (!(closing && activation)) throw new Error("Missing E2E proof fixture");
    closing.assertionName = activation.assertionName;
    expect(() =>
      validateLenderPortalProductionAcceptanceContractValue({
        contractValue: reassigned,
        repositoryRoot: process.cwd(),
      })
    ).toThrow(/trusted executable body and observable route behavior/);
  });

  test("rejects absolute and traversal Phase 9 traceability paths", () => {
    expect(() =>
      resolveLenderPortalRepositoryPath(process.cwd(), "/tmp/evidence.md")
    ).toThrow(/must be relative/);
    expect(() =>
      resolveLenderPortalRepositoryPath(
        process.cwd(),
        "docs/../outside/evidence.md"
      )
    ).toThrow(/contains traversal/);
  });

  test("rejects Phase 9 traceability paths that escape through a symlink", () => {
    const repository = mkdtempSync(join(tmpdir(), "lp-acceptance-repository-"));
    const outside = mkdtempSync(join(tmpdir(), "lp-acceptance-outside-"));
    try {
      const outsideEvidence = join(outside, "evidence.json");
      writeFileSync(outsideEvidence, "{}");
      symlinkSync(outsideEvidence, join(repository, "evidence.json"));
      expect(() =>
        resolveLenderPortalRepositoryPath(repository, "evidence.json")
      ).toThrow(/escapes the checkout after realpath/);
    } finally {
      rmSync(repository, { force: true, recursive: true });
      rmSync(outside, { force: true, recursive: true });
    }
  });

  test("requires evidence for the release CLI and exposes a named non-release contract check", () => {
    const script = join(
      process.cwd(),
      "scripts/lender-portal-production-acceptance.ts"
    );
    const release = spawnSync("bun", [script], {
      cwd: process.cwd(),
      encoding: "utf8",
    });
    expect(release.status).not.toBe(0);
    expect(`${release.stdout}${release.stderr}`).toContain(
      "Release acceptance validation requires --evidence="
    );

    const contractOnly = spawnSync("bun", [script, "--contract-only"], {
      cwd: process.cwd(),
      encoding: "utf8",
    });
    expect(contractOnly.status).toBe(0);
    expect(contractOnly.stdout).toContain(
      "Non-release acceptance contract validation passed"
    );
  });

  test("keeps production trust independent of runtime public-key environment", () => {
    const source = readFileSync(
      join(process.cwd(), "scripts/lender-portal-production-acceptance.ts"),
      "utf8"
    );

    expect(source).not.toContain(
      "LENDER_PORTAL_RELEASE_ATTESTATION_PUBLIC_KEY_PEM"
    );
    expect(source).not.toContain(
      "LENDER_PORTAL_INDEPENDENT_REVIEW_PUBLIC_KEY_PEM"
    );
    expect(source).toContain("readLenderPortalReleaseGitState(repositoryRoot)");
  });
});
