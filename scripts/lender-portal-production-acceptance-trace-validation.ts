import { z } from "zod";
import type {
  AcceptanceContract,
  productionRouteConsumerSchema,
  SignedAttestation,
  TestOnlyValidationHooks,
} from "./lender-portal-production-acceptance-contract";
import { allMachineMappings } from "./lender-portal-production-acceptance-contract-validation";
import {
  fetchEvidence,
  verifyGithubAttestedArtifact,
} from "./lender-portal-production-acceptance-evidence";
import {
  assertExactValues,
  assertUnique,
  fail,
  sha256,
  stableLenderPortalEvidenceJson,
} from "./lender-portal-production-acceptance-io";
import { canonicalRouteForMapping } from "./lender-portal-production-acceptance-operational-validation";
import { browserTraceManifestSchema } from "./lender-portal-production-acceptance-release-bundle";
import {
  type AuthenticatedTraceSession,
  type BrowserObservation,
  cookieDomainIncludesHost,
  type OperationalEvidenceUniqueness,
  parsePlaywrightTraceArchive,
  parseTraceJsonLines,
  playwrightStorageStateSchema,
  traceAcceptanceMarkerSchema,
  uniqueTraceEventIndex,
} from "./lender-portal-production-acceptance-trace-parser";
import { LENDER_PORTAL_PRODUCTION_TRUST_ROOT } from "./lender-portal-production-trust-root";
export function validatePlaywrightTraceEvents(args: {
  context: BrowserObservationContext;
  manifest: z.infer<typeof browserTraceManifestSchema>;
  traceContents: Buffer;
}): AuthenticatedTraceSession {
  const events = parseTraceJsonLines(args.traceContents, "trace stream");
  const [authStep, navigateStep, assertStep] = args.manifest.steps;
  if (!(authStep && navigateStep && assertStep)) {
    fail("Authenticated Playwright trace manifest steps are incomplete");
  }
  const contextIndex = uniqueTraceEventIndex(
    events,
    (event) => event.type === "context-options",
    "context-options"
  );
  const beforeIndex = (stepCallId: string, apiName: string) =>
    uniqueTraceEventIndex(
      events,
      (event) =>
        event.type === "before" &&
        event.callId === stepCallId &&
        event.apiName === apiName,
      `${apiName} before`
    );
  const afterIndex = (stepCallId: string, apiName: string) =>
    uniqueTraceEventIndex(
      events,
      (event) =>
        event.type === "after" &&
        event.callId === stepCallId &&
        event.apiName === apiName,
      `${apiName} after`
    );
  const authBeforeIndex = beforeIndex(
    authStep.traceCallId,
    "browserContext.storageState"
  );
  const authAfterIndex = afterIndex(
    authStep.traceCallId,
    "browserContext.storageState"
  );
  const navigateBeforeIndex = beforeIndex(
    navigateStep.traceCallId,
    "page.goto"
  );
  const navigateAfterIndex = afterIndex(navigateStep.traceCallId, "page.goto");
  const assertBeforeIndex = beforeIndex(
    assertStep.traceCallId,
    "locator.textContent"
  );
  const assertAfterIndex = afterIndex(
    assertStep.traceCallId,
    "locator.textContent"
  );
  const consoleIndex = uniqueTraceEventIndex(
    events,
    (event) =>
      event.type === "console" &&
      event.messageType === "log" &&
      typeof event.text === "string" &&
      event.text.startsWith("LENDER_PORTAL_ACCEPTANCE:"),
    "acceptance correlation marker"
  );
  const contextEvent = events[contextIndex];
  const authAfter = events[authAfterIndex];
  const navigateBefore = events[navigateBeforeIndex];
  const navigateAfter = events[navigateAfterIndex];
  const assertBefore = events[assertBeforeIndex];
  const assertAfter = events[assertAfterIndex];
  const consoleEvent = events[consoleIndex];
  const orderedIndices = [
    contextIndex,
    authBeforeIndex,
    authAfterIndex,
    navigateBeforeIndex,
    navigateAfterIndex,
    assertBeforeIndex,
    assertAfterIndex,
    consoleIndex,
  ];
  if (
    orderedIndices.some((index, position) => {
      const previousIndex = orderedIndices[position - 1];
      return previousIndex !== undefined && index <= previousIndex;
    }) ||
    authAfter?.error !== undefined ||
    navigateAfter?.error !== undefined ||
    assertAfter?.error !== undefined
  ) {
    fail("Authenticated Playwright trace interaction sequence is invalid");
  }
  const markerText = String(consoleEvent?.text ?? "").slice(
    "LENDER_PORTAL_ACCEPTANCE:".length
  );
  let markerValue: unknown;
  try {
    markerValue = JSON.parse(Buffer.from(markerText, "base64url").toString());
  } catch {
    fail("Authenticated Playwright trace marker is malformed");
  }
  const marker = traceAcceptanceMarkerSchema.parse(markerValue);
  const storageState = z
    .object({ value: playwrightStorageStateSchema })
    .parse(authAfter?.result).value;
  const sessionCookieName =
    LENDER_PORTAL_PRODUCTION_TRUST_ROOT.authKit.sessionCookieName;
  const deploymentHost = new URL(args.manifest.deploymentOrigin).hostname;
  const sessionCookies = storageState.cookies.filter(
    (cookie) =>
      cookie.name === sessionCookieName &&
      cookieDomainIncludesHost(cookie.domain, deploymentHost) &&
      (cookie.expires === -1 ||
        cookie.expires * 1000 > Date.parse(args.manifest.finishedAt))
  );
  if (sessionCookies.length !== 1) {
    fail(
      "Authenticated Playwright trace requires one active, production-scoped WorkOS session cookie"
    );
  }
  const sessionCookie = sessionCookies[0];
  if (!sessionCookie) {
    fail("Authenticated Playwright trace session cookie is unavailable");
  }
  const navigationUrl = z
    .object({ url: z.string().url() })
    .parse(navigateBefore?.params).url;
  const navigation = new URL(navigationUrl);
  const assertionParams = z
    .object({ selector: z.string().min(1) })
    .parse(assertBefore?.params);
  const assertionResult = z
    .object({ value: z.string() })
    .parse(assertAfter?.result);
  const expectedRoute = args.context.routes[0];
  const expectedAssertionSelector = `[data-lender-portal-acceptance="${args.manifest.mappingId}"]`;
  if (
    !contextEvent ||
    contextEvent.browserName !== "chromium" ||
    contextEvent.playwrightVersion !==
      LENDER_PORTAL_PRODUCTION_TRUST_ROOT.runners.playwright.version ||
    z.object({ baseURL: z.string().url() }).parse(contextEvent.options)
      .baseURL !== args.manifest.deploymentOrigin ||
    navigation.origin !== args.manifest.deploymentOrigin ||
    navigation.pathname !== expectedRoute ||
    assertionParams.selector !== expectedAssertionSelector ||
    assertionResult.value !== args.context.testProof.observableResult ||
    marker.mappingId !== args.manifest.mappingId ||
    marker.releaseId !== args.manifest.releaseId ||
    marker.runId !== args.manifest.runId ||
    marker.sessionId !== args.manifest.sessionId ||
    marker.commitSha !== args.manifest.commitSha ||
    marker.sourceTreeSha !== args.manifest.sourceTreeSha ||
    marker.deploymentId !== args.manifest.deploymentId ||
    marker.route !== expectedRoute ||
    marker.observedResult !== args.context.testProof.observableResult ||
    stableLenderPortalEvidenceJson(marker.actor) !==
      stableLenderPortalEvidenceJson(args.manifest.actor)
  ) {
    fail("Authenticated Playwright trace events are stale or unrelated");
  }
  return {
    cookieName: sessionCookie.name,
    cookieValue: sessionCookie.value,
    sessionDigest: sha256(sessionCookie.value),
  };
}

export function validatePlaywrightNetworkEvents(args: {
  authentication: AuthenticatedTraceSession;
  context: BrowserObservationContext;
  manifest: z.infer<typeof browserTraceManifestSchema>;
  networkContents: Buffer;
}) {
  const networkEventSchema = z
    .object({
      snapshot: z
        .object({
          _resourceType: z.literal("document"),
          request: z
            .object({
              headers: z.array(
                z.object({ name: z.string(), value: z.string() }).passthrough()
              ),
              method: z.literal("GET"),
              url: z.string().url(),
            })
            .passthrough(),
          response: z
            .object({
              content: z.object({ mimeType: z.string() }).passthrough(),
              headers: z.array(
                z.object({ name: z.string(), value: z.string() }).passthrough()
              ),
              status: z.number().int(),
            })
            .passthrough(),
        })
        .passthrough(),
      type: z.literal("resource-snapshot"),
    })
    .passthrough();
  const events = parseTraceJsonLines(args.networkContents, "network stream");
  const snapshots = events
    .filter((event) => event.type === "resource-snapshot")
    .map((event) => networkEventSchema.parse(event));
  const expectedRoute = args.context.routes[0];
  const expectedUrl = `${args.manifest.deploymentOrigin}${expectedRoute}`;
  const matches = snapshots.filter((event) => {
    const requestHeaders = new Map(
      event.snapshot.request.headers.map((header) => [
        header.name.toLowerCase(),
        header.value,
      ])
    );
    const responseHeaders = new Map(
      event.snapshot.response.headers.map((header) => [
        header.name.toLowerCase(),
        header.value,
      ])
    );
    const cookieHeader = requestHeaders.get("cookie") ?? "";
    const sessionCookieValues = cookieHeader
      .split(";")
      .map((cookie) => cookie.trim().split("="))
      .filter(([name]) => name === args.authentication.cookieName)
      .map(([, ...valueParts]) => valueParts.join("="));
    return (
      event.snapshot.request.url === expectedUrl &&
      event.snapshot.response.status >= 200 &&
      event.snapshot.response.status < 400 &&
      event.snapshot.response.content.mimeType.startsWith("text/html") &&
      requestHeaders.get("x-drawflow-acceptance-run-id") ===
        args.manifest.runId &&
      requestHeaders.get("x-drawflow-acceptance-session-id") ===
        args.manifest.sessionId &&
      requestHeaders.get("x-drawflow-acceptance-mapping-id") ===
        args.manifest.mappingId &&
      sessionCookieValues.length === 1 &&
      sessionCookieValues[0] === args.authentication.cookieValue &&
      responseHeaders.get("x-drawflow-auth-session-hash") ===
        args.authentication.sessionDigest &&
      responseHeaders.get("x-drawflow-auth-subject-hash") ===
        args.manifest.actor.subjectIdHash &&
      responseHeaders.get("x-drawflow-auth-organization-hash") ===
        args.manifest.actor.organizationIdHash &&
      responseHeaders.get("x-drawflow-auth-role-hash") ===
        args.manifest.actor.roleHash
    );
  });
  if (matches.length !== 1) {
    fail("Authenticated Playwright network events are stale or unrelated");
  }
}

export function expectedEvidenceRole(routes: string[]) {
  if (routes.some((route) => route.startsWith("/builder"))) {
    return "builder" as const;
  }
  if (routes.some((route) => route.startsWith("/backoffice"))) {
    return "backoffice" as const;
  }
  return "lender-admin" as const;
}

export function trustedEvidencePrincipalForRole(
  role: ReturnType<typeof expectedEvidenceRole>
) {
  const principal =
    LENDER_PORTAL_PRODUCTION_TRUST_ROOT.productionEvidencePrincipals.find(
      (candidate) => candidate.role === role
    );
  if (!principal) {
    fail(`No source-owned production evidence principal is pinned for ${role}`);
  }
  return principal;
}

export function trustedEvidencePrincipalForMapping(
  contract: AcceptanceContract,
  mappingId: string
) {
  const route = canonicalRouteForMapping(contract, mappingId);
  return trustedEvidencePrincipalForRole(expectedEvidenceRole([route]));
}

export function trustedProviderTenantIdHash(
  contract: AcceptanceContract,
  mappingIds: string[],
  provider: "Resend" | "WorkOS"
) {
  const tenantHashes = mappingIds.map(
    (mappingId) =>
      trustedEvidencePrincipalForMapping(contract, mappingId)
        .providerTenantIdHashes[provider]
  );
  const uniqueTenantHashes = [...new Set(tenantHashes)];
  if (uniqueTenantHashes.length !== 1 || !uniqueTenantHashes[0]) {
    fail(
      `${provider} operational mappings do not resolve to one source-owned tenant identity`
    );
  }
  return uniqueTenantHashes[0];
}

export interface BrowserObservationContext {
  mapping: ReturnType<typeof allMachineMappings>[number];
  routes: string[];
  testProof: AcceptanceContract["testProofs"][number];
}

export function browserObservationContext(args: {
  consumersById: Map<string, AcceptanceContract["consumers"][number]>;
  mapping: ReturnType<typeof allMachineMappings>[number] | undefined;
  proofsById: Map<string, AcceptanceContract["testProofs"][number]>;
}): BrowserObservationContext | undefined {
  if (!args.mapping) {
    return;
  }
  const testProof = args.proofsById.get(args.mapping.testProofId);
  const routes = args.mapping.consumerIds
    .map((consumerId) => args.consumersById.get(consumerId))
    .filter(
      (consumer): consumer is z.infer<typeof productionRouteConsumerSchema> =>
        consumer?.class === "production-route"
    )
    .map((consumer) => consumer.routerPath);
  if (!testProof || routes.length === 0) {
    return;
  }
  return { mapping: args.mapping, routes, testProof };
}

export function validateBrowserObservation(args: {
  attestation: SignedAttestation;
  context: BrowserObservationContext;
  contract: AcceptanceContract;
  observation: BrowserObservation;
  recordedAt: number;
  testOnlyHooks?: TestOnlyValidationHooks;
  uniqueness: OperationalEvidenceUniqueness;
}) {
  const { observation } = args;
  if (args.uniqueness.manifestUris.has(observation.manifestUri)) {
    fail(`${observation.mappingId} reuses a browser trace manifest`);
  }
  args.uniqueness.manifestUris.add(observation.manifestUri);
  const manifestBytes = fetchEvidence({
    contract: args.contract,
    label: `${observation.mappingId} browser trace manifest`,
    testOnlyHooks: args.testOnlyHooks,
    url: observation.manifestUri,
  });
  if (sha256(manifestBytes) !== observation.manifestSha256) {
    fail(`${observation.mappingId} browser trace manifest digest is invalid`);
  }
  const bundle = fetchEvidence({
    contract: args.contract,
    label: `${observation.mappingId} browser trace GitHub attestation`,
    testOnlyHooks: args.testOnlyHooks,
    url: observation.githubAttestationBundleUri,
  });
  if (sha256(bundle) !== observation.githubAttestationBundleSha256) {
    fail(
      `${observation.mappingId} browser trace attestation digest is invalid`
    );
  }
  verifyGithubAttestedArtifact({
    artifact: manifestBytes,
    artifactSha256: observation.manifestSha256,
    attestation: args.attestation,
    attestationBundle: bundle,
    contract: args.contract,
    label: `${observation.mappingId} browser trace manifest`,
    testOnlyHooks: args.testOnlyHooks,
  });
  let manifestValue: unknown;
  try {
    manifestValue = JSON.parse(manifestBytes.toString("utf8"));
  } catch {
    fail(`${observation.mappingId} browser trace manifest is not JSON`);
  }
  const manifest = browserTraceManifestSchema.parse(manifestValue);
  const stepKinds = manifest.steps.map((step) => step.kind);
  const [authenticateStep, navigateStep, assertionStep] = manifest.steps;
  const trustedPrincipal = trustedEvidencePrincipalForRole(
    expectedEvidenceRole(args.context.routes)
  );
  const trustedActor = {
    organizationIdHash: trustedPrincipal.organizationIdHash,
    role: trustedPrincipal.role,
    roleHash: trustedPrincipal.roleHash,
    subjectIdHash: trustedPrincipal.subjectIdHash,
  };
  const expectedRoute = args.context.routes[0];
  if (
    manifest.mappingId !== observation.mappingId ||
    manifest.releaseId !== args.attestation.payload.releaseId ||
    manifest.commitSha !== args.attestation.payload.candidateSha ||
    manifest.sourceTreeSha !==
      args.attestation.payload.deployment.sourceTreeSha ||
    manifest.deploymentId !== args.attestation.payload.deployment.id ||
    manifest.deploymentOrigin !== args.attestation.payload.deployment.url ||
    manifest.runner.name !== "playwright" ||
    manifest.runner.version !==
      LENDER_PORTAL_PRODUCTION_TRUST_ROOT.runners.playwright.version ||
    manifest.runner.executableSha256 !==
      LENDER_PORTAL_PRODUCTION_TRUST_ROOT.runners.playwright.executableSha256 ||
    stableLenderPortalEvidenceJson(manifest.actor) !==
      stableLenderPortalEvidenceJson(trustedActor) ||
    stableLenderPortalEvidenceJson(stepKinds) !==
      stableLenderPortalEvidenceJson(["authenticate", "navigate", "assert"]) ||
    manifest.steps.some((step) => !args.context.routes.includes(step.route)) ||
    authenticateStep?.observedResult !==
      `Authenticated ${trustedPrincipal.role} session` ||
    navigateStep?.observedResult !== `Reached ${expectedRoute}` ||
    assertionStep?.observedResult !== args.context.testProof.observableResult
  ) {
    fail(
      `${observation.mappingId} browser trace manifest is stale or unrelated`
    );
  }
  assertUnique(
    manifest.steps.map((step) => step.stepId),
    `${observation.mappingId} browser step IDs`
  );
  assertUnique(
    manifest.steps.map((step) => step.traceCallId),
    `${observation.mappingId} browser trace call IDs`
  );
  if (
    args.uniqueness.runIds.has(manifest.runId) ||
    args.uniqueness.sessionIds.has(manifest.sessionId) ||
    args.uniqueness.traceDigests.has(manifest.trace.sha256) ||
    args.uniqueness.traceUris.has(manifest.trace.uri)
  ) {
    fail(
      `${observation.mappingId} reuses browser run, session, or trace evidence`
    );
  }
  args.uniqueness.runIds.add(manifest.runId);
  args.uniqueness.sessionIds.add(manifest.sessionId);
  args.uniqueness.traceDigests.add(manifest.trace.sha256);
  args.uniqueness.traceUris.add(manifest.trace.uri);
  const startedAt = Date.parse(manifest.startedAt);
  const finishedAt = Date.parse(manifest.finishedAt);
  const deployedAt = Date.parse(args.attestation.payload.deployment.deployedAt);
  if (
    startedAt < deployedAt ||
    startedAt > finishedAt ||
    finishedAt > args.recordedAt ||
    manifest.steps.some((step) => {
      const observedAt = Date.parse(step.observedAt);
      return observedAt < startedAt || observedAt > finishedAt;
    })
  ) {
    fail(`${observation.mappingId} browser trace timestamps are invalid`);
  }
  const trace = fetchEvidence({
    contract: args.contract,
    label: `${observation.mappingId} authenticated browser trace`,
    testOnlyHooks: args.testOnlyHooks,
    url: manifest.trace.uri,
  });
  if (
    sha256(trace) !== manifest.trace.sha256 ||
    trace.byteLength !== manifest.trace.byteLength
  ) {
    fail(
      `${observation.mappingId} authenticated browser trace digest is invalid`
    );
  }
  const traceBundle = fetchEvidence({
    contract: args.contract,
    label: `${observation.mappingId} trace-byte GitHub attestation`,
    testOnlyHooks: args.testOnlyHooks,
    url: manifest.trace.githubAttestationBundleUri,
  });
  if (sha256(traceBundle) !== manifest.trace.githubAttestationBundleSha256) {
    fail(`${observation.mappingId} trace-byte attestation digest is invalid`);
  }
  verifyGithubAttestedArtifact({
    artifact: trace,
    artifactSha256: manifest.trace.sha256,
    attestation: args.attestation,
    attestationBundle: traceBundle,
    contract: args.contract,
    label: `${observation.mappingId} authenticated Playwright trace bytes`,
    testOnlyHooks: args.testOnlyHooks,
  });
  const archive = parsePlaywrightTraceArchive(trace);
  const authentication = validatePlaywrightTraceEvents({
    context: args.context,
    manifest,
    traceContents: archive.trace,
  });
  if (args.uniqueness.authSessionDigests.has(authentication.sessionDigest)) {
    fail(`${observation.mappingId} reuses an authenticated browser session`);
  }
  args.uniqueness.authSessionDigests.add(authentication.sessionDigest);
  validatePlaywrightNetworkEvents({
    authentication,
    context: args.context,
    manifest,
    networkContents: archive.network,
  });
}

export function validateBrowserObservations(args: {
  attestation: SignedAttestation;
  contract: AcceptanceContract;
  observations: BrowserObservation[];
  recordedAt: number;
  testOnlyHooks?: TestOnlyValidationHooks;
  uniqueness: OperationalEvidenceUniqueness;
}) {
  const mappings = allMachineMappings(args.contract);
  assertExactValues(
    args.observations.map((observation) => observation.mappingId),
    mappings.map((mapping) => mapping.id),
    "Authenticated production-browser journey observations"
  );
  const mappingsById = new Map(
    mappings.map((mapping) => [mapping.id, mapping])
  );
  const proofsById = new Map(
    args.contract.testProofs.map((testProof) => [testProof.id, testProof])
  );
  const consumersById = new Map(
    args.contract.consumers.map((consumer) => [consumer.id, consumer])
  );
  for (const observation of args.observations) {
    const context = browserObservationContext({
      consumersById,
      mapping: mappingsById.get(observation.mappingId),
      proofsById,
    });
    if (!context) {
      fail(
        `${observation.mappingId} browser observation does not match its production consumer and expected result`
      );
    }
    validateBrowserObservation({ ...args, context, observation });
  }
}
