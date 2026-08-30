import { existsSync } from "node:fs";
import { relative, resolve } from "node:path";
import ts from "typescript";
import { z } from "zod";

import {
  type AcceptanceContract,
  acceptanceContractSchema,
  CANONICAL_MACHINE_BINDINGS,
  CANONICAL_ROUTE_GRAPH,
  CANONICAL_TEST_BODY_SHA256,
  type canonicalApiConsumerSchema,
  EXPECTED_JOURNEY_IDS,
  EXPECTED_OPERATIONAL_GATE_IDS,
  EXPECTED_SURFACE_IDS,
  EXPECTED_VERTICAL_SLICE_GATE_IDS,
  LENDER_PORTAL_ACCEPTANCE_CONTRACT_PATH,
  type MachineMapping,
  productionRouteConsumerSchema,
  SEMVER_PATTERN,
  SHELL_CONTROL_PATTERN,
  sha256Schema,
  type TestProof,
  WHITESPACE_CHARACTER_PATTERN,
  WORD_SEPARATOR_PATTERN,
} from "./lender-portal-production-acceptance-contract";
import {
  assertExactValues,
  assertUnique,
  fail,
  lenderPortalPublicKeyFingerprint,
  parseTypescriptSource,
  readStableFile,
  readStableRepositoryFile,
  readTypescriptSource,
  readTypescriptTestSource,
  resolveLenderPortalRepositoryPath,
  sha256,
  stableLenderPortalEvidenceJson,
} from "./lender-portal-production-acceptance-io";
import {
  bodyReturnsRenderedSymbol,
  bodyShadowsIdentifier,
  hasExportedSymbol,
  importBinding,
  namedFunctionBody,
  resolveImportedProductionModule,
  routeComponentName,
  unaliasedNamedImport,
  walkReachable,
} from "./lender-portal-production-acceptance-static";
import { LENDER_PORTAL_PRODUCTION_TRUST_ROOT } from "./lender-portal-production-trust-root";

export function validateCanonicalQueryCall(args: {
  consumer: z.infer<typeof productionRouteConsumerSchema>;
  querySource: ts.SourceFile;
  repositoryRoot: string;
}) {
  let querySource = args.querySource;
  if (!namedFunctionBody(querySource, args.consumer.queryOwnerFunction)) {
    const reExport = querySource.statements
      .filter(ts.isExportDeclaration)
      .find((statement) => {
        const exportClause = statement.exportClause;
        return (
          exportClause &&
          ts.isNamedExports(exportClause) &&
          exportClause.elements.some(
            (element) =>
              (element.propertyName ?? element.name).text ===
              args.consumer.queryOwnerFunction
          ) &&
          !!statement.moduleSpecifier &&
          ts.isStringLiteral(statement.moduleSpecifier)
        );
      });
    if (
      reExport?.moduleSpecifier &&
      ts.isStringLiteral(reExport.moduleSpecifier)
    ) {
      const implementationPath = resolveImportedProductionModule({
        importModule: reExport.moduleSpecifier.text,
        repositoryRoot: args.repositoryRoot,
        routeSource: args.consumer.queryOwnerSource,
      });
      querySource = readTypescriptSource(
        args.repositoryRoot,
        relative(resolve(args.repositoryRoot), implementationPath).replaceAll(
          "\\",
          "/"
        ),
        "production-route"
      );
    }
  }
  const body = namedFunctionBody(querySource, args.consumer.queryOwnerFunction);
  if (!body) {
    fail(
      `${args.consumer.id}: query owner function ${args.consumer.queryOwnerFunction} is unavailable`
    );
  }
  const apiBinding = importBinding(querySource, "api");
  if (!apiBinding || apiBinding.importedName !== "api") {
    fail(`${args.consumer.id}: canonical api import is missing or aliased`);
  }
  const resolvedApiModule = resolveImportedProductionModule({
    importModule: apiBinding.moduleName,
    repositoryRoot: args.repositoryRoot,
    routeSource: args.consumer.queryOwnerSource,
  });
  const generatedApiModule = resolveLenderPortalRepositoryPath(
    args.repositoryRoot,
    "convex/_generated/api.js"
  );
  if (resolvedApiModule !== generatedApiModule) {
    fail(
      `${args.consumer.id}: api import does not resolve to generated Convex API`
    );
  }
  const queryHooks = ["usePaginatedQuery", "useQuery"].filter((hook) => {
    const binding = importBinding(querySource, hook);
    return (
      binding?.moduleName === "convex/react" && binding.importedName === hook
    );
  });
  if (
    bodyShadowsIdentifier(body, "api") ||
    queryHooks.some((hook) => bodyShadowsIdentifier(body, hook))
  ) {
    fail(`${args.consumer.id}: canonical query bindings are locally shadowed`);
  }
  const expectedQuerySegments = args.consumer.queryOwner.split(".");
  const queryExpressionMatches = (node: ts.Expression): boolean => {
    const segments: string[] = [];
    let current: ts.Expression = node;
    while (ts.isPropertyAccessExpression(current)) {
      segments.unshift(current.name.text);
      current = current.expression;
    }
    return (
      ts.isIdentifier(current) &&
      current.text === "api" &&
      stableLenderPortalEvidenceJson(["api", ...segments]) ===
        stableLenderPortalEvidenceJson(expectedQuerySegments)
    );
  };
  let resolved = false;
  walkReachable(body, (node) => {
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      queryHooks.includes(node.expression.text) &&
      node.arguments[0] &&
      queryExpressionMatches(node.arguments[0])
    ) {
      resolved = true;
    }
  });
  if (!resolved) {
    fail(
      `${args.consumer.id}: canonical query owner is not called by its declared production function`
    );
  }
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Route certification intentionally validates each binding and reachability boundary in one fail-closed path.
export function validateProductionRouteConsumer(
  repositoryRoot: string,
  consumer: z.infer<typeof productionRouteConsumerSchema>,
  sourceOverrides?: {
    componentSource?: string;
    querySource?: string;
    routeSource?: string;
  }
) {
  const routeSource = sourceOverrides?.routeSource
    ? parseTypescriptSource(consumer.routeSource, sourceOverrides.routeSource)
    : readTypescriptSource(
        repositoryRoot,
        consumer.routeSource,
        "production-route"
      );
  const componentSource = sourceOverrides?.componentSource
    ? parseTypescriptSource(
        consumer.componentSource,
        sourceOverrides.componentSource
      )
    : readTypescriptSource(
        repositoryRoot,
        consumer.componentSource,
        "production-route"
      );
  const querySource = sourceOverrides?.querySource
    ? parseTypescriptSource(
        consumer.queryOwnerSource,
        sourceOverrides.querySource
      )
    : readTypescriptSource(
        repositoryRoot,
        consumer.queryOwnerSource,
        "production-route"
      );
  const importedComponentPath = resolveImportedProductionModule({
    importModule: consumer.importModule,
    repositoryRoot,
    routeSource: consumer.routeSource,
  });
  const declaredComponentPath = resolveLenderPortalRepositoryPath(
    repositoryRoot,
    consumer.componentSource
  );
  if (importedComponentPath !== declaredComponentPath) {
    fail(
      `${consumer.id}: componentSource does not resolve to the rendered route import`
    );
  }
  const expectedQueryOwnerSource =
    consumer.queryOwnerLocation === "route"
      ? consumer.routeSource
      : consumer.componentSource;
  if (consumer.queryOwnerSource !== expectedQueryOwnerSource) {
    fail(
      `${consumer.id}: queryOwnerSource must be the actual rendered component or route owner`
    );
  }
  if (
    (consumer.queryOwnerLocation === "route" &&
      !consumer.renderPath.includes(consumer.queryOwnerFunction)) ||
    (consumer.queryOwnerLocation === "component" &&
      consumer.queryOwnerFunction !== consumer.componentExport)
  ) {
    fail(`${consumer.id}: query owner function is outside the render path`);
  }
  if (
    !unaliasedNamedImport(
      routeSource,
      "@tanstack/react-router",
      "createFileRoute"
    )
  ) {
    fail(`${consumer.id}: createFileRoute import is missing or aliased`);
  }
  const entryComponent = routeComponentName(routeSource, consumer.routerPath);
  if (!entryComponent) {
    fail(
      `${consumer.id}: production route is not registered at ${consumer.routerPath}`
    );
  }
  if (consumer.renderPath[0] !== entryComponent) {
    fail(
      `${consumer.id}: route component does not match its trusted render path`
    );
  }
  const componentImport = importBinding(routeSource, consumer.componentExport);
  if (
    consumer.renderPath.at(-1) !== consumer.componentExport ||
    !componentImport ||
    componentImport.importedName !== consumer.componentExport ||
    componentImport.moduleName !== consumer.importModule
  ) {
    fail(`${consumer.id}: production component import is missing or aliased`);
  }
  for (let index = 0; index < consumer.renderPath.length - 1; index += 1) {
    const ownerName = consumer.renderPath[index];
    const renderedName = consumer.renderPath[index + 1];
    if (!(ownerName && renderedName)) {
      fail(`${consumer.id}: trusted render path is malformed`);
    }
    const ownerBody = namedFunctionBody(routeSource, ownerName);
    if (
      !ownerBody ||
      bodyShadowsIdentifier(ownerBody, renderedName) ||
      !bodyReturnsRenderedSymbol(ownerBody, renderedName)
    ) {
      fail(
        `${consumer.id}: trusted render edge ${ownerName} -> ${renderedName} is absent`
      );
    }
  }
  if (!hasExportedSymbol(componentSource, consumer.componentExport)) {
    fail(
      `${consumer.id}: component export ${consumer.componentExport} is unavailable`
    );
  }
  validateCanonicalQueryCall({ consumer, querySource, repositoryRoot });
}

export function validateLenderPortalProductionRouteConsumerSourceFixture(args: {
  consumerValue: unknown;
  repositoryRoot: string;
  sourceOverrides: {
    componentSource?: string;
    querySource?: string;
    routeSource?: string;
  };
}) {
  validateProductionRouteConsumer(
    args.repositoryRoot,
    productionRouteConsumerSchema.parse(args.consumerValue),
    args.sourceOverrides
  );
}

export function validateCanonicalApiConsumer(
  repositoryRoot: string,
  consumer: z.infer<typeof canonicalApiConsumerSchema>
) {
  const source = readTypescriptSource(
    repositoryRoot,
    consumer.sourcePath,
    "canonical-api"
  );
  if (!hasExportedSymbol(source, consumer.exportName)) {
    fail(
      `${consumer.id}: canonical API export ${consumer.exportName} is unavailable`
    );
  }
}

export function tokenizeCommand(command: string) {
  const tokens: string[] = [];
  let token = "";
  let quote: "'" | '"' | undefined;
  for (const character of command) {
    if (quote) {
      if (character === quote) {
        quote = undefined;
      } else {
        token += character;
      }
    } else if (character === "'" || character === '"') {
      quote = character;
    } else if (WHITESPACE_CHARACTER_PATTERN.test(character)) {
      if (token) {
        tokens.push(token);
      }
      token = "";
    } else {
      token += character;
    }
  }
  if (quote) {
    fail("Registered production test command contains an unterminated quote");
  }
  if (token) {
    tokens.push(token);
  }
  return tokens;
}

export function collectTestAssertions(source: ts.SourceFile) {
  const assertions = new Map<
    string,
    Array<{ bodySha256: string; expectCalls: number }>
  >();
  const directVitestImports = new Set<string>();
  for (const statement of source.statements) {
    if (
      ts.isImportDeclaration(statement) &&
      ts.isStringLiteral(statement.moduleSpecifier) &&
      statement.moduleSpecifier.text === "vitest" &&
      statement.importClause?.namedBindings &&
      ts.isNamedImports(statement.importClause.namedBindings)
    ) {
      for (const specifier of statement.importClause.namedBindings.elements) {
        const importedName =
          specifier.propertyName?.text ?? specifier.name.text;
        if (importedName === specifier.name.text) {
          directVitestImports.add(importedName);
        }
      }
    }
  }
  const scopeDeclarations = (statements: readonly ts.Statement[]) => {
    const names = new Set<string>();
    for (const statement of statements) {
      if (ts.isVariableStatement(statement)) {
        for (const declaration of statement.declarationList.declarations) {
          if (ts.isIdentifier(declaration.name)) {
            names.add(declaration.name.text);
          }
        }
      } else if (
        (ts.isFunctionDeclaration(statement) ||
          ts.isClassDeclaration(statement)) &&
        statement.name
      ) {
        names.add(statement.name.text);
      }
    }
    return names;
  };
  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Registration validation keeps scope, direct Vitest bindings, and executable body collection together to reject nested shadow decoys.
  const collectScope = (statements: readonly ts.Statement[]) => {
    const declarations = scopeDeclarations(statements);
    for (const statement of statements) {
      if (
        !(
          ts.isExpressionStatement(statement) &&
          ts.isCallExpression(statement.expression) &&
          ts.isIdentifier(statement.expression.expression)
        )
      ) {
        continue;
      }
      const registrationName = statement.expression.expression.text;
      const call = statement.expression;
      const callback = call.arguments[1];
      if (
        (registrationName === "describe" || registrationName === "suite") &&
        directVitestImports.has(registrationName) &&
        !declarations.has(registrationName) &&
        callback &&
        (ts.isArrowFunction(callback) || ts.isFunctionExpression(callback)) &&
        ts.isBlock(callback.body)
      ) {
        collectScope(callback.body.statements);
        continue;
      }
      if (
        (registrationName !== "test" && registrationName !== "it") ||
        !directVitestImports.has(registrationName) ||
        declarations.has(registrationName) ||
        !call.arguments[0] ||
        !ts.isStringLiteral(call.arguments[0]) ||
        !callback ||
        !(ts.isArrowFunction(callback) || ts.isFunctionExpression(callback))
      ) {
        continue;
      }
      const body = callback.body;
      let expectCalls = 0;
      if (
        directVitestImports.has("expect") &&
        !bodyShadowsIdentifier(body, "expect")
      ) {
        walkReachable(body, (candidate) => {
          if (
            ts.isCallExpression(candidate) &&
            ts.isIdentifier(candidate.expression) &&
            candidate.expression.text === "expect"
          ) {
            expectCalls += 1;
          }
        });
      }
      const entries = assertions.get(call.arguments[0].text) ?? [];
      entries.push({
        bodySha256: sha256(body.getText(source)),
        expectCalls,
      });
      assertions.set(call.arguments[0].text, entries);
    }
  };
  collectScope(source.statements);
  return assertions;
}

export function validateRegisteredAssertionSource(
  source: ts.SourceFile,
  proofId: string,
  assertionName: string
) {
  const matchedAssertions =
    collectTestAssertions(source).get(assertionName) ?? [];
  const expectedBodySha256 = CANONICAL_TEST_BODY_SHA256[proofId];
  if (
    matchedAssertions.length !== 1 ||
    !expectedBodySha256 ||
    matchedAssertions[0]?.bodySha256 !== expectedBodySha256 ||
    matchedAssertions[0].expectCalls === 0
  ) {
    fail(
      `${proofId} assertion does not uniquely match its trusted executable body and observable route behavior`
    );
  }
}

export function validateLenderPortalRegisteredAssertionSourceFixture(args: {
  assertionName: string;
  proofId: string;
  sourceText: string;
}) {
  validateRegisteredAssertionSource(
    parseTypescriptSource("fixture.test.tsx", args.sourceText),
    args.proofId,
    args.assertionName
  );
}

// The branches correspond to separate fail-closed registry invariants.
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: keeping them together prevents partial command/proof validation.
export function validateTestRegistry(
  repositoryRoot: string,
  contract: AcceptanceContract,
  consumers: Map<string, AcceptanceContract["consumers"][number]>
) {
  const packageJson = z
    .object({ scripts: z.record(z.string(), z.string()) })
    .parse(
      JSON.parse(
        readStableRepositoryFile(repositoryRoot, "package.json").toString(
          "utf8"
        )
      )
    );
  const commands = new Map(
    contract.testCommands.map((command) => [command.id, command])
  );
  const vitestPackage = z
    .object({ version: z.string().regex(SEMVER_PATTERN) })
    .parse(
      JSON.parse(
        readStableRepositoryFile(
          repositoryRoot,
          "node_modules/vitest/package.json"
        ).toString("utf8")
      )
    );
  const vitestExecutable = readStableRepositoryFile(
    repositoryRoot,
    LENDER_PORTAL_PRODUCTION_TRUST_ROOT.runners.vitest.executablePath
  );
  for (const command of contract.testCommands) {
    assertUnique(command.targetFiles, `${command.id} target files`);
    const registered = packageJson.scripts[command.packageScript];
    if (!registered) {
      fail(`Missing registered test command ${command.packageScript}`);
    }
    const tokens = tokenizeCommand(registered);
    if (tokens[0] !== "vitest" || tokens[1] !== "run") {
      fail(`${command.id} must resolve to the exact vitest run entry point`);
    }
    if (tokens.some((token) => SHELL_CONTROL_PATTERN.test(token))) {
      fail(`${command.id} contains unsupported shell control syntax`);
    }
    if (
      command.runnerVersion !== vitestPackage.version ||
      command.runnerVersion !==
        LENDER_PORTAL_PRODUCTION_TRUST_ROOT.runners.vitest.version ||
      command.runnerExecutableSha256 !== sha256(vitestExecutable) ||
      command.runnerExecutableSha256 !==
        LENDER_PORTAL_PRODUCTION_TRUST_ROOT.runners.vitest.executableSha256
    ) {
      fail(`${command.id} does not pin the installed Vitest runner identity`);
    }
    assertExactValues(
      tokens.slice(2),
      command.targetFiles,
      `${command.id} executable targets`
    );
  }
  for (const proof of contract.testProofs) {
    const command = commands.get(proof.commandId);
    if (!command) {
      fail(`${proof.id} maps to unknown test command ${proof.commandId}`);
    }
    if (!command.targetFiles.includes(proof.targetFile)) {
      fail(`${proof.id} target is not registered by ${proof.commandId}`);
    }
    if (
      proof.observableResult.trim().split(WORD_SEPARATOR_PATTERN).length < 4
    ) {
      fail(`${proof.id} observable result is generic-only`);
    }
    if (!proof.targetFile.includes(".test.")) {
      fail(`${proof.id} does not resolve to an executable test target`);
    }
    validateRegisteredAssertionSource(
      readTypescriptTestSource(repositoryRoot, proof.targetFile),
      proof.id,
      proof.assertionName
    );
    assertUnique(proof.consumerIds, `${proof.id} consumer IDs`);
    const proofConsumers = proof.consumerIds.map((id) => {
      const consumer = consumers.get(id);
      if (!consumer) {
        fail(`${proof.id} maps to unknown production consumer ${id}`);
      }
      return consumer;
    });
    if (
      proof.proofClass === "production-route" &&
      !proofConsumers.some((consumer) => consumer.class === "production-route")
    ) {
      fail(
        `${proof.id} is backend-only and lacks a supported production route consumer`
      );
    }
    if (
      proof.proofClass === "production-route" &&
      !proofConsumers.some(
        (consumer) =>
          consumer.class === "production-route" &&
          consumer.testTargets.includes(proof.targetFile)
      )
    ) {
      fail(
        `${proof.id} test target is not registered to its supported production route consumer`
      );
    }
  }
}

export function allMachineMappings(contract: AcceptanceContract) {
  return [
    ...contract.surfaces,
    ...contract.journeys,
    ...contract.verticalSliceGates,
  ];
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: One fail-closed trust-root audit intentionally validates every signer, provider tenant, principal, executable, workflow, and redirect policy together.
export function validateTrustedPolicies(contract: AcceptanceContract) {
  const root = LENDER_PORTAL_PRODUCTION_TRUST_ROOT;
  assertExactValues(
    root.productionEvidencePrincipals.map((principal) => principal.role),
    ["backoffice", "builder", "lender-admin"],
    "Source-owned production evidence principal roles"
  );
  for (const field of [
    "assignmentIdentityHash",
    "organizationIdHash",
    "recipientHash",
    "roleHash",
    "subjectIdHash",
  ] as const) {
    const values = root.productionEvidencePrincipals.map(
      (principal) => principal[field]
    );
    if (values.some((value) => !sha256Schema.safeParse(value).success)) {
      fail(`Source-owned production evidence principal ${field} is invalid`);
    }
    assertUnique(values, `Source-owned production evidence principal ${field}`);
  }
  for (const provider of ["Resend", "WorkOS"] as const) {
    const tenantHashes = root.productionEvidencePrincipals.map(
      (principal) => principal.providerTenantIdHashes[provider]
    );
    if (tenantHashes.some((value) => !sha256Schema.safeParse(value).success)) {
      fail(`Source-owned ${provider} tenant identity is invalid`);
    }
    if (new Set(tenantHashes).size !== 1) {
      fail(
        `Source-owned ${provider} tenant identity is inconsistent across production evidence principals`
      );
    }
  }
  if (
    root.authKit.sessionCookieName !== "wos-session" ||
    root.authKit.sessionCookieDomain !== "drawflow.fairlend.ca"
  ) {
    fail("Source-owned AuthKit session cookie policy is invalid");
  }
  const workflow = root.github.allowedWorkflows[0];
  const expectedRepository = root.github.repository;
  const expectedWorkflowPrefix = `github.com/${expectedRepository}/.github/workflows/`;
  const contractPolicy = contract.evidencePolicy.githubAttestation;
  if (
    contractPolicy.repository !== expectedRepository ||
    contractPolicy.sourceRepository !== expectedRepository ||
    contractPolicy.oidcIssuer !== root.github.oidcIssuer ||
    contractPolicy.signerDigest !== workflow.signerDigest ||
    contractPolicy.signerWorkflow !== workflow.signerWorkflow ||
    !contractPolicy.signerWorkflow.startsWith(expectedWorkflowPrefix) ||
    !contractPolicy.signerWorkflow.endsWith(".yml")
  ) {
    fail(
      "GitHub Actions attestation claims do not match the immutable trust root"
    );
  }
  const [githubOwner, githubRepository] = expectedRepository.split("/");
  if (
    contract.evidencePolicy.githubOwner !== githubOwner ||
    contract.evidencePolicy.githubRepository !== githubRepository ||
    contract.evidencePolicy.initialOrigin !== root.github.initialOrigin ||
    stableLenderPortalEvidenceJson(
      contract.evidencePolicy.releaseAssetRedirects
    ) !== stableLenderPortalEvidenceJson(root.github.releaseAssetRedirects)
  ) {
    fail(
      "GitHub release transport claims do not match the immutable trust root"
    );
  }
  if (
    stableLenderPortalEvidenceJson(contract.trustedDeploymentOrigins) !==
      stableLenderPortalEvidenceJson(root.deploymentOrigins) ||
    stableLenderPortalEvidenceJson(contract.trustedReleaseKeys) !==
      stableLenderPortalEvidenceJson(root.releaseKeys) ||
    stableLenderPortalEvidenceJson(contract.trustedReviewers) !==
      stableLenderPortalEvidenceJson(root.reviewers)
  ) {
    fail("Signing or deployment claims do not match the immutable trust root");
  }
  assertUnique(contract.trustedDeploymentOrigins, "Trusted deployment origins");
  for (const origin of contract.trustedDeploymentOrigins) {
    const parsed = new URL(origin);
    if (
      parsed.protocol !== "https:" ||
      parsed.origin !== origin ||
      parsed.hostname === "localhost" ||
      parsed.hostname.endsWith(".local") ||
      parsed.hostname.endsWith(".test")
    ) {
      fail(`Untrusted production deployment origin in contract: ${origin}`);
    }
  }
  const releaseIds = contract.trustedReleaseKeys.map((key) => key.id);
  const reviewerIds = contract.trustedReviewers.map((key) => key.id);
  const releaseFingerprints = contract.trustedReleaseKeys.map((key) =>
    lenderPortalPublicKeyFingerprint(key.publicKeyPem)
  );
  const reviewerFingerprints = contract.trustedReviewers.map((key) =>
    lenderPortalPublicKeyFingerprint(key.publicKeyPem)
  );
  assertUnique(releaseIds, "Trusted release key IDs");
  assertUnique(reviewerIds, "Trusted reviewer key IDs");
  assertUnique(releaseFingerprints, "Trusted release key fingerprints");
  assertUnique(reviewerFingerprints, "Trusted reviewer key fingerprints");
  for (const key of [
    ...contract.trustedReleaseKeys,
    ...contract.trustedReviewers,
  ]) {
    if (lenderPortalPublicKeyFingerprint(key.publicKeyPem) !== key.sha256) {
      fail(
        `Pinned signing key ${key.id} fingerprint does not match its material`
      );
    }
  }
  if (
    releaseIds.some((id) => reviewerIds.includes(id)) ||
    releaseFingerprints.some((fingerprint) =>
      reviewerFingerprints.includes(fingerprint)
    )
  ) {
    fail("Release and independent-review signing trust sets must be disjoint");
  }
}

export function validateMachineMapping(
  mapping: MachineMapping,
  proofs: Map<string, TestProof>,
  consumers: Map<string, AcceptanceContract["consumers"][number]>,
  operationalGateIds: readonly string[]
) {
  const proof = proofs.get(mapping.testProofId);
  if (!proof) {
    fail(`${mapping.id} maps to unknown test proof ${mapping.testProofId}`);
  }
  assertExactValues(
    mapping.consumerIds,
    proof.consumerIds,
    `${mapping.id} consumer mapping`
  );
  for (const consumerId of mapping.consumerIds) {
    if (!consumers.has(consumerId)) {
      fail(`${mapping.id} maps to unknown consumer ${consumerId}`);
    }
  }
  assertUnique(mapping.operationalGateIds, `${mapping.id} operational gates`);
  for (const gateId of mapping.operationalGateIds) {
    if (!operationalGateIds.includes(gateId)) {
      fail(`${mapping.id} maps to unknown gate ${gateId}`);
    }
  }
  if (
    (mapping.id.startsWith("LP-E2E-") || mapping.id.startsWith("LP-VSG-")) &&
    (proof.proofClass !== "production-route" ||
      !mapping.consumerIds.some(
        (id) => consumers.get(id)?.class === "production-route"
      ))
  ) {
    fail(`${mapping.id} requires a real supported production-route proof`);
  }
  if (
    !mapping.operationalGateIds.includes("authenticated-production-browser")
  ) {
    fail(
      `${mapping.id} requires authenticated deployed-browser journey evidence`
    );
  }
}

export function validateLenderPortalProductionAcceptanceContractValue(args: {
  contractValue: unknown;
  repositoryRoot: string;
}) {
  const contract = acceptanceContractSchema.parse(args.contractValue);
  assertExactValues(
    contract.surfaces.map((item) => item.id),
    EXPECTED_SURFACE_IDS,
    "Production acceptance surfaces"
  );
  assertExactValues(
    contract.journeys.map((item) => item.id),
    EXPECTED_JOURNEY_IDS,
    "Acceptance journeys"
  );
  assertExactValues(
    contract.verticalSliceGates.map((item) => item.id),
    EXPECTED_VERTICAL_SLICE_GATE_IDS,
    "Vertical-slice gates"
  );
  assertExactValues(
    contract.operationalGates.map((item) => item.id),
    EXPECTED_OPERATIONAL_GATE_IDS,
    "Operational gates"
  );
  assertUnique(
    contract.consumers.map((item) => item.id),
    "Production consumer IDs"
  );
  assertUnique(
    contract.testCommands.map((item) => item.id),
    "Test command IDs"
  );
  assertUnique(
    contract.testProofs.map((item) => item.id),
    "Test proof IDs"
  );
  assertUnique(
    contract.authorizationTestProofIds,
    "Authorization test proof IDs"
  );
  validateTrustedPolicies(contract);
  const consumers = new Map(
    contract.consumers.map((consumer) => [consumer.id, consumer])
  );
  const routeGraph = contract.consumers
    .filter(
      (consumer): consumer is z.infer<typeof productionRouteConsumerSchema> =>
        consumer.class === "production-route"
    )
    .map((consumer) => [
      consumer.id,
      consumer.routeSource,
      consumer.importModule,
      consumer.componentSource,
      consumer.componentExport,
      consumer.renderPath,
      consumer.queryOwnerSource,
      consumer.queryOwnerFunction,
      consumer.queryOwner,
    ]);
  if (
    stableLenderPortalEvidenceJson(routeGraph) !==
    stableLenderPortalEvidenceJson(CANONICAL_ROUTE_GRAPH)
  ) {
    fail(
      "Production route/query graph does not match the trusted source policy"
    );
  }
  for (const consumer of contract.consumers) {
    if (consumer.class === "production-route") {
      validateProductionRouteConsumer(args.repositoryRoot, consumer);
    } else {
      validateCanonicalApiConsumer(args.repositoryRoot, consumer);
    }
  }
  validateTestRegistry(args.repositoryRoot, contract, consumers);
  const proofs = new Map(contract.testProofs.map((proof) => [proof.id, proof]));
  for (const proofId of contract.authorizationTestProofIds) {
    const proof = proofs.get(proofId);
    if (!proof || proof.proofClass !== "authorization-boundary") {
      fail(
        `Authorization proof ${proofId} is missing or has the wrong proof class`
      );
    }
  }
  const mappings = allMachineMappings(contract);
  const canonicalBindings = mappings.map((mapping) => {
    const proof = proofs.get(mapping.testProofId);
    return [
      mapping.id,
      mapping.testProofId,
      proof?.targetFile,
      proof?.assertionName,
    ];
  });
  if (
    stableLenderPortalEvidenceJson(canonicalBindings) !==
    stableLenderPortalEvidenceJson(CANONICAL_MACHINE_BINDINGS)
  ) {
    fail(
      "Machine mappings do not match the canonical per-ID acceptance policy"
    );
  }
  assertUnique(
    mappings.map((mapping) => mapping.testProofId),
    "Machine mapping test proof IDs"
  );
  assertUnique(
    mappings.map((mapping) => {
      const proof = proofs.get(mapping.testProofId);
      return `${proof?.targetFile ?? "missing"}::${proof?.assertionName ?? "missing"}`;
    }),
    "Machine mapping executable assertions"
  );
  const operationalGateIds = contract.operationalGates.map((gate) => gate.id);
  for (const mapping of mappings) {
    validateMachineMapping(mapping, proofs, consumers, operationalGateIds);
  }
  return contract;
}

export function validateLenderPortalProductionAcceptanceContract(args: {
  contractPath?: string;
  repositoryRoot: string;
}) {
  const contractPath =
    args.contractPath ?? LENDER_PORTAL_ACCEPTANCE_CONTRACT_PATH;
  const absolutePath = resolveLenderPortalRepositoryPath(
    args.repositoryRoot,
    contractPath
  );
  if (!existsSync(absolutePath)) {
    fail(`Missing lender production acceptance contract: ${contractPath}`);
  }
  const contractText = readStableFile(absolutePath).toString("utf8");
  const contract = validateLenderPortalProductionAcceptanceContractValue({
    contractValue: JSON.parse(contractText),
    repositoryRoot: args.repositoryRoot,
  });
  return { contract, contractSha256: sha256(contractText) };
}
