import { existsSync } from "node:fs";
import { extname, join } from "node:path";
import ts from "typescript";
import { z } from "zod";

import {
  PHASE3_CUTOVER_INDEXES,
  PHASE3_CUTOVER_MIGRATIONS,
  SEMVER_PATTERN,
  type SignedAttestation,
  sha256Schema,
  type TestOnlyValidationHooks,
  VIEWPORT_PATTERN,
} from "./lender-portal-production-acceptance-contract";
import {
  assertUnique,
  fail,
  readStableFile,
  readStableRepositoryFile,
  resolveLenderPortalRepositoryPath,
  sha256,
  stableLenderPortalEvidenceJson,
} from "./lender-portal-production-acceptance-io";
import { LENDER_PORTAL_PRODUCTION_TRUST_ROOT } from "./lender-portal-production-trust-root";
export const phase3ExecutionStepSchema = z
  .object({
    completedAt: z.string().datetime({ offset: true }),
    invocationId: z.string().uuid(),
    reportSha256: sha256Schema,
    result: z.literal("passed"),
  })
  .strict();

export const phase3MigrationEvidenceSchema = z
  .object({
    apply: phase3ExecutionStepSchema,
    dryRun: phase3ExecutionStepSchema,
    id: z.enum(["proposal-phase3-lifecycle", "workos-user-normalized-email"]),
    readback: phase3ExecutionStepSchema.extend({
      remainingRecordCount: z.literal(0),
    }),
    runner: z.enum([
      "migrations:runProposalPhase3LifecycleBackfill",
      "migrations:runWorkosUserNormalizedEmailBackfill",
    ]),
  })
  .strict();

export const phase3IndexEvidenceSchema = z
  .object({
    fields: z.array(z.string().min(1)).min(1),
    name: z.enum([
      "by_proposal_assignment_revision_status",
      "by_normalized_email",
    ]),
    staged: z.literal(false),
    status: z.literal("ready"),
    table: z.enum(["proposalLenderApprovals", "users"]),
    verifiedAt: z.string().datetime({ offset: true }),
  })
  .strict();

export interface Phase3CutoverProof {
  ambiguity: {
    completePagination: true;
    openIssueCount: 0;
    query: "lender_portal_phase9:listLenderPortalPhase9MigrationIssues";
  };
  authenticatedReadback: {
    authorization: "admin-or-principle-broker";
    brokerageIdHash: string;
    organizationIdHash: string;
    query: "lender_portal_phase9:getLenderPortalPhase9MigrationRun";
    readAt: string;
    runTokenHash: string;
    status: "verified";
  };
  indexes: z.infer<typeof phase3IndexEvidenceSchema>[];
  manifestSealing: {
    archivingAssignmentCount: 0;
    buildingManifestCount: 0;
    failedManifestCount: 0;
    readAt: string;
    sealedManifestCount: number;
    withdrawnAssignmentCount: number;
  };
  migrations: z.infer<typeof phase3MigrationEvidenceSchema>[];
  recordedAt: string;
  rollbackRehearsal: {
    completedAt: string;
    exerciseId: string;
    recoveryMode: "disable-and-forward-recovery";
    reportSha256: string;
    result: "passed";
  };
  schemaSourceSha256: string;
}

export function readStringArray(node: ts.Expression | undefined) {
  if (!(node && ts.isArrayLiteralExpression(node))) {
    return null;
  }
  const values: string[] = [];
  for (const element of node.elements) {
    if (!ts.isStringLiteral(element)) {
      return null;
    }
    values.push(element.text);
  }
  return values;
}

export function tableNameForIndexCall(call: ts.CallExpression) {
  let current: ts.Node | undefined = call;
  while (current) {
    if (ts.isPropertyAssignment(current)) {
      const name = current.name;
      if (ts.isIdentifier(name) || ts.isStringLiteral(name)) {
        return name.text;
      }
    }
    current = current.parent;
  }
  return null;
}

export function objectLiteralPropertyName(
  property: ts.ObjectLiteralElementLike
) {
  if (ts.isSpreadAssignment(property)) {
    return null;
  }
  const name = property.name;
  if (
    ts.isIdentifier(name) ||
    ts.isStringLiteral(name) ||
    ts.isNumericLiteral(name)
  ) {
    return name.text;
  }
  return null;
}

export function phase3IndexDeclaration(node: ts.Node) {
  if (!ts.isCallExpression(node)) {
    return null;
  }
  if (!ts.isPropertyAccessExpression(node.expression)) {
    return null;
  }
  if (
    node.expression.name.text !== "index" ||
    !ts.isStringLiteral(node.arguments[0])
  ) {
    return null;
  }
  const name = node.arguments[0].text;
  if (!PHASE3_CUTOVER_INDEXES.some((expected) => expected.name === name)) {
    return null;
  }
  const definition = node.arguments[1];
  let fields = readStringArray(definition);
  let stagedOrUnknown = false;
  if (definition && ts.isObjectLiteralExpression(definition)) {
    const fieldsProperty = definition.properties.find(
      (property) =>
        ts.isPropertyAssignment(property) &&
        objectLiteralPropertyName(property) === "fields"
    );
    fields =
      fieldsProperty && ts.isPropertyAssignment(fieldsProperty)
        ? readStringArray(fieldsProperty.initializer)
        : null;
    const stagedProperties = definition.properties.filter(
      (property) => objectLiteralPropertyName(property) === "staged"
    );
    const stagedProperty = stagedProperties[0];
    const hasDynamicProperty = definition.properties.some(
      (property) =>
        ts.isSpreadAssignment(property) ||
        (!ts.isSpreadAssignment(property) &&
          ts.isComputedPropertyName(property.name))
    );
    stagedOrUnknown = Boolean(
      hasDynamicProperty ||
        stagedProperties.length > 1 ||
        (stagedProperty &&
          (!ts.isPropertyAssignment(stagedProperty) ||
            stagedProperty.initializer.kind !== ts.SyntaxKind.FalseKeyword))
    );
  }
  return {
    fields,
    name,
    stagedOrUnknown,
    table: tableNameForIndexCall(node),
  };
}

export function resolvePhase3SchemaImport(
  repositoryRoot: string,
  moduleName: string
) {
  if (!moduleName.startsWith("./schema/")) {
    return null;
  }
  const logicalPath = join("convex", moduleName);
  const candidates = extname(logicalPath)
    ? [logicalPath]
    : [`${logicalPath}.ts`, `${logicalPath}.js`, join(logicalPath, "index.ts")];
  for (const candidate of candidates) {
    const absolutePath = resolveLenderPortalRepositoryPath(
      repositoryRoot,
      candidate
    );
    if (existsSync(absolutePath)) {
      return candidate;
    }
  }
  fail(`Phase 3 schema import does not resolve: ${moduleName}`);
}

export function phase3SchemaModuleSources(args: {
  repositoryRoot: string;
  schemaSourceText: string;
  testOnlyHooks?: TestOnlyValidationHooks;
}) {
  const source = ts.createSourceFile(
    "convex/schema.ts",
    args.schemaSourceText,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS
  );
  const modulePaths = source.statements.flatMap((statement) => {
    if (
      !(
        ts.isImportDeclaration(statement) &&
        ts.isStringLiteral(statement.moduleSpecifier)
      )
    ) {
      return [];
    }
    const modulePath = resolvePhase3SchemaImport(
      args.repositoryRoot,
      statement.moduleSpecifier.text
    );
    return modulePath ? [modulePath] : [];
  });
  return modulePaths.map((modulePath) => {
    const bytes = args.testOnlyHooks?.readRepositoryFile
      ? args.testOnlyHooks.readRepositoryFile(modulePath)
      : readStableRepositoryFile(args.repositoryRoot, modulePath);
    return bytes.toString("utf8");
  });
}

export function validateLenderPortalPhase3IndexCutoverSource(
  sourceText: string,
  additionalSourceTexts: readonly string[] = []
) {
  const declarations = new Map<
    string,
    {
      fields: string[] | null;
      stagedOrUnknown: boolean;
      table: string | null;
    }
  >();
  for (const [index, text] of [
    sourceText,
    ...additionalSourceTexts,
  ].entries()) {
    const source = ts.createSourceFile(
      index === 0 ? "convex/schema.ts" : `convex/schema/module-${index}.ts`,
      text,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TS
    );
    const visit = (node: ts.Node) => {
      const declaration = phase3IndexDeclaration(node);
      if (declaration) {
        if (declarations.has(declaration.name)) {
          fail(
            `Phase 3 cutover index ${declaration.name} is declared more than once`
          );
        }
        declarations.set(declaration.name, declaration);
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
  }
  for (const expected of PHASE3_CUTOVER_INDEXES) {
    const declaration = declarations.get(expected.name);
    if (
      !declaration ||
      declaration.table !== expected.table ||
      stableLenderPortalEvidenceJson(declaration.fields) !==
        stableLenderPortalEvidenceJson(expected.fields)
    ) {
      fail(
        `Phase 3 cutover index ${expected.name} does not match its canonical schema`
      );
    }
    if (declaration.stagedOrUnknown) {
      fail(
        `Phase 3 cutover index ${expected.name} is staged or has an unknown staged expression`
      );
    }
  }
}

export function validatePhase3CutoverSemantics(args: {
  attestation: SignedAttestation;
  proof: Phase3CutoverProof;
  repositoryRoot: string;
  testOnlyHooks?: TestOnlyValidationHooks;
}) {
  const schemaPath = "convex/schema.ts";
  const schemaBytes = args.testOnlyHooks?.readRepositoryFile
    ? args.testOnlyHooks.readRepositoryFile(schemaPath)
    : readStableFile(
        resolveLenderPortalRepositoryPath(args.repositoryRoot, schemaPath)
      );
  if (sha256(schemaBytes) !== args.proof.schemaSourceSha256) {
    fail("Phase 3 cutover evidence does not match the candidate schema source");
  }
  const schemaSourceText = schemaBytes.toString("utf8");
  validateLenderPortalPhase3IndexCutoverSource(
    schemaSourceText,
    phase3SchemaModuleSources({
      repositoryRoot: args.repositoryRoot,
      schemaSourceText,
      testOnlyHooks: args.testOnlyHooks,
    })
  );
  if (
    args.proof.authenticatedReadback.organizationIdHash ===
    args.proof.authenticatedReadback.brokerageIdHash
  ) {
    fail(
      "Phase 3 cutover readback must bind distinct tenant and Brokerage scopes"
    );
  }
  if (
    args.proof.manifestSealing.withdrawnAssignmentCount !==
    args.proof.manifestSealing.sealedManifestCount
  ) {
    fail("Phase 3 withdrawal manifests are not completely sealed");
  }
  for (const [index, expected] of PHASE3_CUTOVER_MIGRATIONS.entries()) {
    const migration = args.proof.migrations[index];
    if (migration?.id !== expected.id || migration.runner !== expected.runner) {
      fail("Phase 3 cutover migration evidence is missing or reordered");
    }
  }
  for (const [index, expected] of PHASE3_CUTOVER_INDEXES.entries()) {
    const evidence = args.proof.indexes[index];
    if (
      evidence?.name !== expected.name ||
      evidence.table !== expected.table ||
      stableLenderPortalEvidenceJson(evidence.fields) !==
        stableLenderPortalEvidenceJson(expected.fields)
    ) {
      fail("Phase 3 cutover index evidence is missing or mismatched");
    }
  }
  const deployedAt = Date.parse(args.attestation.payload.deployment.deployedAt);
  const recordedAt = Date.parse(args.proof.recordedAt);
  const reportDigests: string[] = [args.proof.rollbackRehearsal.reportSha256];
  const invocationIds: string[] = [args.proof.rollbackRehearsal.exerciseId];
  let latestMigrationReadback = deployedAt;
  for (const migration of args.proof.migrations) {
    const dryRunAt = Date.parse(migration.dryRun.completedAt);
    const applyAt = Date.parse(migration.apply.completedAt);
    const readbackAt = Date.parse(migration.readback.completedAt);
    if (
      deployedAt > dryRunAt ||
      dryRunAt > applyAt ||
      applyAt > readbackAt ||
      readbackAt > recordedAt
    ) {
      fail("Phase 3 migration dry-run, apply, and readback order is invalid");
    }
    latestMigrationReadback = Math.max(latestMigrationReadback, readbackAt);
    for (const step of [
      migration.dryRun,
      migration.apply,
      migration.readback,
    ]) {
      reportDigests.push(step.reportSha256);
      invocationIds.push(step.invocationId);
    }
  }
  const finalEvidenceTimes = [
    Date.parse(args.proof.authenticatedReadback.readAt),
    Date.parse(args.proof.manifestSealing.readAt),
    Date.parse(args.proof.rollbackRehearsal.completedAt),
    ...args.proof.indexes.map((index) => Date.parse(index.verifiedAt)),
  ];
  if (
    finalEvidenceTimes.some(
      (timestamp) =>
        timestamp < latestMigrationReadback || timestamp > recordedAt
    )
  ) {
    fail(
      "Phase 3 cutover readback, index, or rollback evidence is out of sequence"
    );
  }
  assertUnique(reportDigests, "Phase 3 cutover report digests");
  assertUnique(invocationIds, "Phase 3 cutover invocation IDs");
}

export function requiredOperationalProof(
  gateId: string,
  proof: Record<string, unknown>,
  attestation: SignedAttestation
) {
  const deployment = attestation.payload.deployment;
  const common = {
    deploymentId: z.literal(deployment.id),
    deploymentUrl: z.literal(deployment.url),
    gateId: z.literal(gateId),
    recordedAt: z.string().datetime({ offset: true }),
    releaseId: z.literal(attestation.payload.releaseId),
    result: z.literal("passed"),
    resultArtifactSha256: sha256Schema,
    resultArtifactUri: z.string().url(),
    resultGithubAttestationBundleSha256: sha256Schema,
    resultGithubAttestationBundleUri: z.string().url(),
  };
  const schemas: Record<string, z.ZodTypeAny> = {
    "authenticated-production-browser": z
      .object({
        ...common,
        observations: z
          .array(
            z
              .object({
                githubAttestationBundleSha256: sha256Schema,
                githubAttestationBundleUri: z.string().url(),
                manifestSha256: sha256Schema,
                manifestUri: z.string().url(),
                mappingId: z.string().min(1),
              })
              .strict()
          )
          .min(1),
        resultFormat: z.literal("playwright-production-journey-report/v1"),
      })
      .strict(),
    "focus-and-status-announcements": z
      .object({
        ...common,
        auditTool: z.literal("axe-core"),
        auditToolVersion: z.string().regex(SEMVER_PATTERN),
        focusTarget: z.string().min(2),
        liveRegionResult: z.literal("announced"),
        resultFormat: z.literal("axe-focus-status-report/v1"),
        route: z.string().startsWith("/"),
      })
      .strict(),
    "responsive-zoom-and-screen-reader": z
      .object({
        ...common,
        assistiveTechnology: z.literal("VoiceOver"),
        assistiveTechnologyVersion: z.string().min(2),
        resultFormat: z.literal("assistive-technology-report/v1"),
        route: z.string().startsWith("/"),
        viewport: z.string().regex(VIEWPORT_PATTERN),
        zoomPercent: z.number().int().min(100).max(400),
      })
      .strict(),
    "provider-and-webhook-delivery": z
      .object({
        ...common,
        githubAttestationBundleSha256: sha256Schema,
        githubAttestationBundleUri: z.string().url(),
        mappingIds: z.array(z.string().min(1)).min(1),
        provider: z.literal("WorkOS"),
        providerAccountId: z.string().min(2),
        providerReceiptSha256: sha256Schema,
        providerReceiptUri: z.string().url(),
        resultFormat: z.literal("provider-readback-receipt/v2"),
        tenantIdHash: sha256Schema,
      })
      .strict(),
    "inbox-and-reauthorized-links": z
      .object({
        ...common,
        inboxProvider: z.literal("Resend"),
        githubAttestationBundleSha256: sha256Schema,
        githubAttestationBundleUri: z.string().url(),
        mappingIds: z.array(z.string().min(1)).min(1),
        providerAccountId: z.string().min(2),
        receiptSha256: sha256Schema,
        receiptUri: z.string().url(),
        resultFormat: z.literal("inbox-readback-receipt/v2"),
        tenantIdHash: sha256Schema,
      })
      .strict(),
    "phase3-migration-cutover": z
      .object({
        ...common,
        ambiguity: z
          .object({
            completePagination: z.literal(true),
            openIssueCount: z.literal(0),
            query: z.literal(
              "lender_portal_phase9:listLenderPortalPhase9MigrationIssues"
            ),
          })
          .strict(),
        authenticatedReadback: z
          .object({
            authorization: z.literal("admin-or-principle-broker"),
            brokerageIdHash: sha256Schema,
            organizationIdHash: sha256Schema,
            query: z.literal(
              "lender_portal_phase9:getLenderPortalPhase9MigrationRun"
            ),
            readAt: z.string().datetime({ offset: true }),
            runTokenHash: sha256Schema,
            status: z.literal("verified"),
          })
          .strict(),
        indexes: z.array(phase3IndexEvidenceSchema).length(2),
        manifestSealing: z
          .object({
            archivingAssignmentCount: z.literal(0),
            buildingManifestCount: z.literal(0),
            failedManifestCount: z.literal(0),
            readAt: z.string().datetime({ offset: true }),
            sealedManifestCount: z.number().int().nonnegative(),
            withdrawnAssignmentCount: z.number().int().nonnegative(),
          })
          .strict(),
        migrations: z.array(phase3MigrationEvidenceSchema).length(2),
        resultFormat: z.literal("phase3-migration-cutover-report/v1"),
        rollbackRehearsal: z
          .object({
            completedAt: z.string().datetime({ offset: true }),
            exerciseId: z.string().uuid(),
            recoveryMode: z.literal("disable-and-forward-recovery"),
            reportSha256: sha256Schema,
            result: z.literal("passed"),
          })
          .strict(),
        schemaSourceSha256: sha256Schema,
      })
      .strict(),
    "exact-release-commit": z
      .object({
        ...common,
        buildCommand: z.literal("bun run build"),
        builderExecutablePath: z.literal(
          LENDER_PORTAL_PRODUCTION_TRUST_ROOT.executables.bun.path
        ),
        builderExecutableSha256: z.literal(
          LENDER_PORTAL_PRODUCTION_TRUST_ROOT.executables.bun.sha256
        ),
        builderVersion: z.literal(
          LENDER_PORTAL_PRODUCTION_TRUST_ROOT.executables.bun.version
        ),
        bundleGithubAttestationSha256: sha256Schema,
        bundleGithubAttestationUri: z.string().url(),
        bundleSha256: z.literal(deployment.releaseBundleSha256),
        bundleUri: z.literal(deployment.releaseBundleUri),
        deployedCommitSha: z.literal(deployment.deployedCommitSha),
        resultFormat: z.literal("immutable-release-build-report/v1"),
        sourceTreeSha: z.literal(deployment.sourceTreeSha),
      })
      .strict(),
  };
  const schema = schemas[gateId];
  if (!schema) {
    fail(`Unknown operational gate semantics ${gateId}`);
  }
  return schema.parse(proof);
}
