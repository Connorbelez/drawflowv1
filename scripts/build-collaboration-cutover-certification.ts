import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync,
  readFileSync,
  renameSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";

export const REQUIRED_BUILD_COLLABORATION_ROLES = [
  "admin",
  "principle-broker",
  "broker",
  "builder",
  "broker-staff",
  "builder-staff",
  "homeowner",
  "contractor",
] as const;

export const REQUIRED_BUILD_COLLABORATION_CUTOVER_COMMANDS = [
  "convexCodegen",
  "convexTypecheck",
  "targetedTests",
  "fullTestSuite",
  "applicationTypecheck",
  "productionBuild",
  "uiHtmlAudit",
  "deploymentRegistration",
  "authenticatedProductionProbes",
  "warningCheck",
  "playwrightRoleJourneys",
  "visualReview",
  "keyboardReview",
] as const;

export const REQUIRED_BUILD_COLLABORATION_MONITORS = [
  "authorizationDenials",
  "disclosureAlarms",
  "deliveryFanout",
  "idempotency",
  "staleApprovals",
  "revisionConflicts",
  "migrationParity",
  "searchLatency",
  "feedPagination",
  "overdueScheduling",
] as const;

const IMMUTABLE_ROLLBACK_COLLECTIONS = [
  "posts",
  "revisions",
  "assets",
  "receipts",
] as const;
const ALL_ROLLBACK_COLLECTIONS = [
  ...IMMUTABLE_ROLLBACK_COLLECTIONS,
  "auditEvents",
] as const;
const PLACEHOLDER_PATTERN =
  /ACTIVE_BUILD_ID|ACTION_ITEM_ID|<[^>]+>|(?:^|[_\W])(?:TODO|TBD|UNKNOWN|PLACEHOLDER|REPLACE(?:D|_ME)?|YOUR)(?:$|[_\W])/i;
const SHA256_PATTERN = /^[a-f0-9]{64}$/i;
const ISO_TIMESTAMP_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:/;
const GIT_SHA_PATTERN = /^[a-f0-9]{40}$/i;
const PROD_DEPLOYMENT_PATTERN = /^prod:/;
const HTTPS_PATTERN = /^https:\/\//;
const NON_HUMAN_ACTOR_PATTERN = /^(?:agent|system):/i;

type JsonObject = Record<string, unknown>;
interface StableRecord {
  id: string;
  sha256: string;
}
type StableSnapshot = Record<
  (typeof ALL_ROLLBACK_COLLECTIONS)[number],
  StableRecord[]
>;

export interface BuildCollaborationCutoverLiveState {
  evidence: {
    buildReportCount: number;
    cutoverEpoch: number;
    evidenceId: string;
    importedPostCount: number;
    migrationRunId: string;
    mismatchCount: number;
    parityPassed: boolean;
    parityRunId: string;
    planToken: string;
    reportHash: string;
    reportVersion: string;
    sourceRecordCount: number;
    verifiedAt: number;
    verifiedByWorkosUserId: string;
  } | null;
  latestBuild: { buildId: string; creationTime: number } | null;
  legacyWritePolicy: {
    allowed: boolean;
    reasonCode: string;
  };
  migration: {
    latestBuildCreationTime: number;
    latestBuildId: string;
    planToken: string;
    processedBuildCount: number;
    runId: string;
    status: string;
  } | null;
  observedAt: number;
  observedByWorkosUserId: string;
  organizationId: string;
  parityRun: {
    evidenceId: string;
    importedPostCount: number;
    mismatchCount: number;
    migrationRunId: string;
    parityRunId: string;
    sourceRecordCount: number;
    status: string;
  } | null;
  representativeBuildId: string;
  retainedSnapshot: StableSnapshot;
  rolloutTransitions: Array<{
    actorWorkosUserId: string;
    createdAt: number;
    newState: { cutoverEpoch?: number; status?: string } | null;
    priorState: { status?: string } | null;
  }>;
  schemaVersion: "build-collaboration-cutover-live-state/v1";
  tenant: {
    activatedAt?: number;
    activatedByWorkosUserId?: string;
    cutoverEpoch: number;
    status: "active" | "disabled" | "migration_ready";
  };
}

interface CommonArtifactContext {
  applicationVersion: string;
  convexDeployment: string;
  gitCommit: string;
  organizationId: string;
  representativeBuildId: string;
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: report every independent release-gate defect in one invocation
export function validateBuildCollaborationCutoverEvidence(
  input: unknown,
  manifestDirectory: string,
  liveStateInput?: unknown
) {
  const errors: string[] = [];
  const manifest = asObject(input);
  if (!manifest) {
    return ["Cutover evidence must be a JSON object."];
  }
  requireExactString(
    errors,
    manifest,
    "schemaVersion",
    "build-collaboration-cutover-evidence/v2"
  );
  const organizationId = requireText(errors, manifest, "organizationId");
  const representativeBuildId = requireText(
    errors,
    manifest,
    "representativeBuildId"
  );
  const release = requireObject(errors, manifest, "release");
  const gitCommit = release
    ? requireText(errors, release, "gitCommit", {
        label: "release.gitCommit",
        pattern: GIT_SHA_PATTERN,
      })
    : undefined;
  const applicationVersion = release
    ? requireText(errors, release, "applicationVersion", {
        label: "release.applicationVersion",
      })
    : undefined;
  const convexDeployment = release
    ? requireText(errors, release, "convexDeployment", {
        label: "release.convexDeployment",
        pattern: PROD_DEPLOYMENT_PATTERN,
      })
    : undefined;
  if (release) {
    requireText(errors, release, "applicationDeploymentUrl", {
      label: "release.applicationDeploymentUrl",
      pattern: HTTPS_PATTERN,
    });
  }
  const context =
    organizationId &&
    representativeBuildId &&
    gitCommit &&
    applicationVersion &&
    convexDeployment
      ? {
          applicationVersion,
          convexDeployment,
          gitCommit,
          organizationId,
          representativeBuildId,
        }
      : undefined;
  const liveState = validateLiveState(
    errors,
    liveStateInput,
    organizationId,
    representativeBuildId
  );

  const migration = requireObject(errors, manifest, "migration");
  if (migration && context && liveState) {
    for (const stage of [
      "preview",
      "application",
      "replay",
      "parity",
    ] as const) {
      const artifact = readTypedArtifact(
        errors,
        migration[`${stage}Artifact`],
        manifestDirectory,
        `migration ${stage}`
      );
      if (!artifact) {
        continue;
      }
      validateCommonArtifact(errors, artifact, context, `migration ${stage}`);
      requireExactString(
        errors,
        artifact,
        "schemaVersion",
        "build-collaboration-migration-artifact/v1",
        `migration ${stage} schemaVersion`
      );
      requireExactString(
        errors,
        artifact,
        "stage",
        stage,
        `migration ${stage} stage`
      );
      requireExactString(
        errors,
        artifact,
        "status",
        "passed",
        `migration ${stage} status`
      );
      validateIsoTimestamp(
        errors,
        artifact,
        "completedAt",
        `migration ${stage}`
      );
      if (stage === "parity") {
        validateParityArtifact(errors, artifact, liveState);
      }
    }
  }

  const commands = requireObject(errors, manifest, "commands");
  if (commands && context) {
    for (const commandName of REQUIRED_BUILD_COLLABORATION_CUTOVER_COMMANDS) {
      const artifact = readTypedArtifact(
        errors,
        commands[commandName],
        manifestDirectory,
        `${commandName} command`
      );
      if (!artifact) {
        continue;
      }
      validateCommonArtifact(
        errors,
        artifact,
        context,
        `${commandName} command`
      );
      requireExactString(
        errors,
        artifact,
        "schemaVersion",
        "build-collaboration-command-evidence/v1",
        `${commandName} schemaVersion`
      );
      requireExactString(
        errors,
        artifact,
        "commandName",
        commandName,
        `${commandName} commandName`
      );
      requireText(errors, artifact, "command", {
        label: `${commandName} command`,
      });
      if (artifact.exitCode !== 0) {
        errors.push(`${commandName} command did not pass with exit code 0.`);
      }
      validateIsoTimestamp(errors, artifact, "completedAt", commandName);
    }
  }

  const smokeJourneys = requireObject(errors, manifest, "smokeJourneys");
  if (smokeJourneys && context) {
    for (const role of REQUIRED_BUILD_COLLABORATION_ROLES) {
      const artifact = readTypedArtifact(
        errors,
        smokeJourneys[role],
        manifestDirectory,
        `${role} smoke journey`
      );
      if (!artifact) {
        continue;
      }
      validateCommonArtifact(
        errors,
        artifact,
        context,
        `${role} smoke journey`
      );
      requireExactString(
        errors,
        artifact,
        "schemaVersion",
        "build-collaboration-smoke-evidence/v1",
        `${role} smoke schemaVersion`
      );
      requireExactString(errors, artifact, "role", role, `${role} smoke role`);
      requireExactString(
        errors,
        artifact,
        "status",
        "passed",
        `${role} smoke status`
      );
      validateIsoTimestamp(errors, artifact, "completedAt", `${role} smoke`);
    }
  }

  const interfaceArtifact = context
    ? readTypedArtifact(
        errors,
        manifest.interface,
        manifestDirectory,
        "interface"
      )
    : undefined;
  if (interfaceArtifact && context) {
    validateCommonArtifact(errors, interfaceArtifact, context, "interface");
    requireExactString(
      errors,
      interfaceArtifact,
      "schemaVersion",
      "build-collaboration-interface-evidence/v1",
      "interface schemaVersion"
    );
    requireExactString(
      errors,
      interfaceArtifact,
      "status",
      "passed",
      "interface status"
    );
    for (const invariant of [
      "detailsIsDefault",
      "buildOverviewUnchanged",
      "canonicalTabsOwnContent",
      "legacyNotesRetired",
    ]) {
      if (interfaceArtifact[invariant] !== true) {
        errors.push(`Production interface invariant ${invariant} is not true.`);
      }
    }
  }

  const activationArtifact = context
    ? readTypedArtifact(
        errors,
        manifest.activation,
        manifestDirectory,
        "activation"
      )
    : undefined;
  if (activationArtifact && context && liveState) {
    validateCommonArtifact(errors, activationArtifact, context, "activation");
    validateActivation(errors, activationArtifact, liveState);
  }

  const rollbackArtifact = context
    ? readTypedArtifact(
        errors,
        manifest.rollback,
        manifestDirectory,
        "rollback"
      )
    : undefined;
  if (rollbackArtifact && context && liveState) {
    validateCommonArtifact(errors, rollbackArtifact, context, "rollback");
    validateRollback(errors, rollbackArtifact, liveState);
  }

  const monitoring = requireObject(errors, manifest, "monitoring");
  if (monitoring) {
    for (const monitor of REQUIRED_BUILD_COLLABORATION_MONITORS) {
      requireText(errors, monitoring, monitor, {
        label: `${monitor} monitoring link`,
        pattern: HTTPS_PATTERN,
      });
    }
  }
  return errors;
}

function validateLiveState(
  errors: string[],
  input: unknown,
  organizationId?: string,
  representativeBuildId?: string
) {
  const live = asObject(input);
  if (!live) {
    errors.push(
      "Authenticated production live state is required for certification."
    );
    return;
  }
  requireExactString(
    errors,
    live,
    "schemaVersion",
    "build-collaboration-cutover-live-state/v1",
    "live state schemaVersion"
  );
  if (organizationId && live.organizationId !== organizationId) {
    errors.push("Live-state organization does not match the manifest.");
  }
  if (
    representativeBuildId &&
    live.representativeBuildId !== representativeBuildId
  ) {
    errors.push("Live-state Build does not match the manifest.");
  }
  const tenant = asObject(live.tenant);
  if (!tenant || tenant.status !== "active") {
    errors.push("Server-derived tenant state is not active.");
  }
  if (
    !Number.isSafeInteger(tenant?.cutoverEpoch) ||
    Number(tenant?.cutoverEpoch) < 0
  ) {
    errors.push("Server-derived cutover epoch is invalid.");
  }
  if (
    !(
      typeof tenant?.activatedAt === "number" &&
      typeof tenant?.activatedByWorkosUserId === "string"
    )
  ) {
    errors.push("Server-derived activation actor and timestamp are required.");
  }
  const evidence = asObject(live.evidence);
  const migration = asObject(live.migration);
  const parityRun = asObject(live.parityRun);
  const latestBuild = asObject(live.latestBuild);
  if (!(evidence && migration && parityRun && latestBuild)) {
    errors.push(
      "Server-derived linked migration, parity, and latest-Build state is incomplete."
    );
    return live as BuildCollaborationCutoverLiveState;
  }
  if (
    evidence.parityPassed !== true ||
    evidence.mismatchCount !== 0 ||
    evidence.sourceRecordCount !== evidence.importedPostCount ||
    evidence.cutoverEpoch !== tenant?.cutoverEpoch ||
    evidence.migrationRunId !== migration.runId ||
    evidence.parityRunId !== parityRun.parityRunId ||
    evidence.evidenceId !== parityRun.evidenceId ||
    evidence.planToken !== migration.planToken ||
    migration.status !== "complete" ||
    parityRun.status !== "complete" ||
    parityRun.migrationRunId !== migration.runId ||
    migration.latestBuildId !== latestBuild.buildId ||
    migration.latestBuildCreationTime !== latestBuild.creationTime ||
    migration.processedBuildCount !== evidence.buildReportCount
  ) {
    errors.push(
      "Server-derived parity is stale, mismatched, or not linked to the current Build boundary."
    );
  }
  return live as BuildCollaborationCutoverLiveState;
}

function validateParityArtifact(
  errors: string[],
  artifact: JsonObject,
  live: BuildCollaborationCutoverLiveState
) {
  const evidence = live.evidence;
  if (!evidence) {
    return;
  }
  const mappings: [string, unknown][] = [
    ["evidenceId", evidence.evidenceId],
    ["migrationRunId", evidence.migrationRunId],
    ["parityRunId", evidence.parityRunId],
    ["planToken", evidence.planToken],
    ["reportHash", evidence.reportHash],
    ["reportVersion", evidence.reportVersion],
    ["cutoverEpoch", evidence.cutoverEpoch],
    ["verifiedAt", evidence.verifiedAt],
    ["buildReportCount", evidence.buildReportCount],
    ["sourceRecordCount", evidence.sourceRecordCount],
    ["importedPostCount", evidence.importedPostCount],
    ["mismatchCount", evidence.mismatchCount],
  ];
  for (const [key, expected] of mappings) {
    if (artifact[key] !== expected) {
      errors.push(
        `Migration parity artifact ${key} does not match authenticated production state.`
      );
    }
  }
  if (artifact.parityPassed !== true) {
    errors.push("Migration parity artifact did not pass.");
  }
}

function validateActivation(
  errors: string[],
  artifact: JsonObject,
  live: BuildCollaborationCutoverLiveState
) {
  requireExactString(
    errors,
    artifact,
    "schemaVersion",
    "build-collaboration-activation-evidence/v1",
    "activation schemaVersion"
  );
  requireExactString(errors, artifact, "status", "active", "activation status");
  const tenant = live.tenant;
  if (
    artifact.actorWorkosUserId !== tenant.activatedByWorkosUserId ||
    artifact.activatedAt !== tenant.activatedAt ||
    artifact.cutoverEpoch !== tenant.cutoverEpoch
  ) {
    errors.push(
      "Activation artifact does not match authenticated production state."
    );
  }
  if (
    typeof artifact.actorWorkosUserId === "string" &&
    NON_HUMAN_ACTOR_PATTERN.test(artifact.actorWorkosUserId)
  ) {
    errors.push("Activation actor must be a human WorkOS user.");
  }
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: rollback proof is one fail-closed cross-state invariant
function validateRollback(
  errors: string[],
  artifact: JsonObject,
  live: BuildCollaborationCutoverLiveState
) {
  requireExactString(
    errors,
    artifact,
    "schemaVersion",
    "build-collaboration-rollback-evidence/v1",
    "rollback schemaVersion"
  );
  requireExactString(errors, artifact, "status", "passed", "rollback status");
  const before = asObject(artifact.before);
  const disabled = asObject(artifact.disabled);
  const after = asObject(artifact.after);
  const denial = asObject(artifact.legacyWriteProbe);
  if (!(before && disabled && after && denial)) {
    errors.push(
      "Rollback evidence must include before, disabled, after, and legacy-write probe state."
    );
    return;
  }
  const beforeEpoch = requireNonNegativeNumber(
    errors,
    before,
    "cutoverEpoch",
    "rollback.before.cutoverEpoch"
  );
  const disabledEpoch = requireNonNegativeNumber(
    errors,
    disabled,
    "cutoverEpoch",
    "rollback.disabled.cutoverEpoch"
  );
  const afterEpoch = requireNonNegativeNumber(
    errors,
    after,
    "cutoverEpoch",
    "rollback.after.cutoverEpoch"
  );
  if (
    before.status !== "active" ||
    disabled.status !== "disabled" ||
    after.status !== "active"
  ) {
    errors.push(
      "Rollback evidence does not prove active → disabled → active server states."
    );
  }
  if (
    beforeEpoch === undefined ||
    disabledEpoch !== beforeEpoch + 1 ||
    afterEpoch !== disabledEpoch ||
    live.tenant.cutoverEpoch !== afterEpoch
  ) {
    errors.push(
      "Rollback did not increment and preserve the server-derived cutover epoch."
    );
  }
  if (denial.denied !== true || denial.errorCode !== "LEGACY_NOTES_RETIRED") {
    errors.push(
      "Rollback did not prove that legacy Note writes remained denied."
    );
  }
  const liveLegacyPolicy = asObject(live.legacyWritePolicy);
  if (
    liveLegacyPolicy?.allowed !== false ||
    liveLegacyPolicy.reasonCode !== "LEGACY_NOTES_RETIRED"
  ) {
    errors.push(
      "Authenticated production state does not keep the legacy Note write path retired."
    );
  }
  const rolloutTransitions = Array.isArray(live.rolloutTransitions)
    ? live.rolloutTransitions.filter(
        (
          transition
        ): transition is BuildCollaborationCutoverLiveState["rolloutTransitions"][number] =>
          Boolean(asObject(transition))
      )
    : [];
  const disabledTransition = rolloutTransitions.find(
    (transition) =>
      transition.newState?.status === "disabled" &&
      transition.newState.cutoverEpoch === disabledEpoch
  );
  const reactivationTransition = rolloutTransitions.find(
    (transition) =>
      transition.createdAt >
        (disabledTransition?.createdAt ?? Number.MAX_SAFE_INTEGER) &&
      transition.newState?.status === "active" &&
      transition.newState.cutoverEpoch === afterEpoch
  );
  if (!(disabledTransition && reactivationTransition)) {
    errors.push(
      "Authenticated rollout audit does not prove the disabled and reactivated rollback transitions."
    );
  }
  for (const transition of [disabledTransition, reactivationTransition]) {
    if (
      transition &&
      NON_HUMAN_ACTOR_PATTERN.test(transition.actorWorkosUserId)
    ) {
      errors.push(
        "Rollback transitions must be performed by a human operator."
      );
    }
  }
  const beforeSnapshot = parseSnapshot(
    errors,
    before.snapshot,
    "rollback.before.snapshot"
  );
  const afterSnapshot = parseSnapshot(
    errors,
    after.snapshot,
    "rollback.after.snapshot"
  );
  const liveSnapshot = parseSnapshot(
    errors,
    live.retainedSnapshot,
    "live retainedSnapshot"
  );
  if (!(beforeSnapshot && afterSnapshot && liveSnapshot)) {
    return;
  }
  for (const collection of IMMUTABLE_ROLLBACK_COLLECTIONS) {
    if (!sameRecords(beforeSnapshot[collection], afterSnapshot[collection])) {
      errors.push(
        `${collection} stable IDs or immutable content changed during rollback rehearsal.`
      );
    }
    if (!sameRecords(afterSnapshot[collection], liveSnapshot[collection])) {
      errors.push(
        `${collection} changed after the rollback rehearsal evidence was captured.`
      );
    }
  }
  if (
    !(
      recordsAreSubset(beforeSnapshot.auditEvents, afterSnapshot.auditEvents) &&
      recordsAreSubset(afterSnapshot.auditEvents, liveSnapshot.auditEvents)
    )
  ) {
    errors.push(
      "Previously recorded audit events were removed or rewritten during/after rollback rehearsal."
    );
  }
}

function parseSnapshot(
  errors: string[],
  input: unknown,
  label: string
): StableSnapshot | undefined {
  const value = asObject(input);
  if (!value) {
    errors.push(`${label} is missing.`);
    return;
  }
  const result = {} as StableSnapshot;
  for (const collection of ALL_ROLLBACK_COLLECTIONS) {
    const rows = value[collection];
    if (!Array.isArray(rows)) {
      errors.push(`${label}.${collection} must be an array.`);
      result[collection] = [];
      continue;
    }
    const seen = new Set<string>();
    result[collection] = rows
      .flatMap((row, index) => {
        const record = asObject(row);
        if (
          !record ||
          typeof record.id !== "string" ||
          !record.id ||
          typeof record.sha256 !== "string" ||
          !SHA256_PATTERN.test(record.sha256) ||
          seen.has(record.id)
        ) {
          errors.push(
            `${label}.${collection}[${index}] is not a unique stable-ID/content-hash record.`
          );
          return [];
        }
        seen.add(record.id);
        return [{ id: record.id, sha256: record.sha256.toLowerCase() }];
      })
      .sort((a, b) => a.id.localeCompare(b.id));
  }
  return result;
}

function sameRecords(left: StableRecord[], right: StableRecord[]) {
  return left.length === right.length && recordsAreSubset(left, right);
}
function recordsAreSubset(left: StableRecord[], right: StableRecord[]) {
  const rightMap = new Map(right.map((row) => [row.id, row.sha256]));
  return left.every((row) => rightMap.get(row.id) === row.sha256);
}

function readTypedArtifact(
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

function validateCommonArtifact(
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

function validateIsoTimestamp(
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

function requireObject(errors: string[], parent: JsonObject, key: string) {
  const value = asObject(parent[key]);
  if (!value) {
    errors.push(`Missing ${key} evidence object.`);
  }
  return value;
}
function requireText(
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
function requireExactString(
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
function requireNonNegativeNumber(
  errors: string[],
  parent: JsonObject,
  key: string,
  label: string
) {
  const value = parent[key];
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    errors.push(`${label} must be a non-negative integer.`);
    return;
  }
  return value;
}
function asObject(value: unknown): JsonObject | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonObject)
    : undefined;
}

function fetchAuthenticatedProductionLiveState(manifest: JsonObject) {
  const identity = process.env.BUILD_COLLABORATION_OPERATOR_IDENTITY_JSON;
  if (!identity) {
    throw new Error(
      "BUILD_COLLABORATION_OPERATOR_IDENTITY_JSON is required; certification never accepts operator-authored live state."
    );
  }
  JSON.parse(identity);
  const result = spawnSync(
    "bun",
    [
      "x",
      "convex",
      "run",
      "--prod",
      "--identity",
      identity,
      "build_collaboration_cutover_certification:getBuildCollaborationCutoverCertificationState",
      JSON.stringify({
        organizationId: manifest.organizationId,
        buildId: manifest.representativeBuildId,
      }),
    ],
    { encoding: "utf8" }
  );
  if (result.status !== 0) {
    throw new Error(
      `Authenticated production state query failed: ${(result.stderr || result.stdout).trim()}`
    );
  }
  return JSON.parse(result.stdout);
}

function main() {
  const manifestPath = argumentValue("--manifest");
  const outputPath = argumentValue("--output");
  if (!manifestPath) {
    console.error(
      "Usage: bun scripts/build-collaboration-cutover-certification.ts --manifest <evidence.json> [--output <deployment-record.json>]"
    );
    process.exitCode = 2;
    return;
  }
  const absoluteManifestPath = resolve(manifestPath);
  let source: string;
  let manifest: unknown;
  try {
    source = readFileSync(absoluteManifestPath, "utf8");
    manifest = JSON.parse(source);
  } catch (error) {
    console.error(
      `Could not read cutover evidence manifest: ${error instanceof Error ? error.message : String(error)}`
    );
    process.exitCode = 2;
    return;
  }
  let liveState: unknown;
  try {
    liveState = fetchAuthenticatedProductionLiveState(manifest as JsonObject);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 2;
    return;
  }
  const errors = validateBuildCollaborationCutoverEvidence(
    manifest,
    dirname(absoluteManifestPath),
    liveState
  );
  if (errors.length) {
    console.error("Build Collaboration cutover certification failed:");
    for (const error of errors) {
      console.error(`- ${error}`);
    }
    process.exitCode = 1;
    return;
  }
  const certifiedRecord = {
    ...(manifest as JsonObject),
    serverAttestation: liveState,
    certification: {
      certifiedAt: new Date().toISOString(),
      evidenceManifestSha256: createHash("sha256").update(source).digest("hex"),
      validatorVersion: "build-collaboration-cutover-certifier/v2",
    },
  };
  const absoluteOutputPath = resolve(
    outputPath ??
      resolve(dirname(absoluteManifestPath), "deployment-record.certified.json")
  );
  const temporaryPath = `${absoluteOutputPath}.${process.pid}.tmp`;
  writeFileSync(
    temporaryPath,
    `${JSON.stringify(certifiedRecord, null, 2)}\n`,
    { mode: 0o600 }
  );
  renameSync(temporaryPath, absoluteOutputPath);
  console.log(
    `Certified Build Collaboration cutover evidence: ${absoluteOutputPath}`
  );
}
function argumentValue(name: string) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}
if (import.meta.main) {
  main();
}
