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
import { validateBuildCollaborationE2EFixture } from "./build-collaboration-cutover-fixture";
import {
  BUILD_COLLABORATION_CUTOVER_GATE_RUNNER,
  BUILD_COLLABORATION_CUTOVER_GATES,
  BUILD_COLLABORATION_INTERFACE_RUNNER,
  BUILD_COLLABORATION_MANUAL_REVIEW_RUNNER,
  BUILD_COLLABORATION_SMOKE_RUNNER,
  buildCollaborationCutoverGateArgv,
  buildCollaborationRoleSmokeArgv,
  isManualBuildCollaborationCutoverGate,
  isProductionConvexDeployment,
  serializeCommand,
} from "./build-collaboration-cutover-gates";
import { REQUIRED_BUILD_COLLABORATION_ROLES } from "./build-collaboration-personas";

export const REQUIRED_BUILD_COLLABORATION_CUTOVER_COMMANDS =
  BUILD_COLLABORATION_CUTOVER_GATES;

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

const PLACEHOLDER_PATTERN =
  /ACTIVE_BUILD_ID|ACTION_ITEM_ID|<[^>]+>|(?:^|[_\W])(?:TODO|TBD|UNKNOWN|PLACEHOLDER|REPLACE(?:D|_ME)?|YOUR)(?:$|[_\W])/i;
const SHA256_PATTERN = /^[a-f0-9]{64}$/i;
const ISO_TIMESTAMP_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:/;
const GIT_SHA_PATTERN = /^[a-f0-9]{40}$/i;
const HTTPS_PATTERN = /^https:\/\//;
const NON_HUMAN_ACTOR_PATTERN = /^(?:agent|system):/i;
const WORKOS_USER_PATTERN = /^user_[A-Za-z0-9]+$/;

type ArtifactAttestationKind =
  | "migration_preview"
  | "migration_application"
  | "migration_replay"
  | "migration_parity"
  | "manual_visual_review"
  | "manual_keyboard_review";

const MIGRATION_ATTESTATION_KINDS = {
  application: "migration_application",
  parity: "migration_parity",
  preview: "migration_preview",
  replay: "migration_replay",
} as const satisfies Record<string, ArtifactAttestationKind>;

const MANUAL_ATTESTATION_KINDS = {
  keyboardReview: "manual_keyboard_review",
  visualReview: "manual_visual_review",
} as const satisfies Record<string, ArtifactAttestationKind>;

type JsonObject = Record<string, unknown>;
export interface BuildCollaborationCutoverLiveState {
  artifactAttestations: Array<{
    artifactSha256: string;
    attestedByRoles: string[];
    attestedByWorkosUserId: string;
    attestationId: string;
    createdAt: number;
    kind: ArtifactAttestationKind;
    rehearsalId: string;
  }>;
  companionCutover: {
    activeSubmilestoneCount: number;
    exceptionCount: number;
    generatedCompanionCount: number;
    manualActionItemCount: number;
    materializedCount: number;
    parityMismatchCount: number;
    planToken: string;
    repairedCount: number;
    reportCount: number;
    reportHash?: string;
    runId: string;
    status: string;
  } | null;
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
  release: {
    applicationUrl: string;
    applicationVersion: string;
    convexDeployment: string;
    convexUrl: string;
    gitCommit: string;
  } | null;
  representativeBuildId: string;
  rollbackRehearsal: {
    afterSnapshot: RetainedDigestSnapshot;
    beforeCutoverEpoch: number;
    beforeSnapshot: RetainedDigestSnapshot;
    completedAt: number;
    disabledCutoverEpoch: number;
    disabledVerifiedAt: number;
    legacyWriteDenialError: string;
    legacyWriteDeniedAt: number;
    rehearsalId: string;
    requestedByWorkosUserId: string;
    status: string;
  } | null;
  rolloutTransitions: Array<{
    actorWorkosUserId: string;
    createdAt: number;
    newState: { cutoverEpoch?: number; status?: string } | null;
    priorState: { status?: string } | null;
  }>;
  schemaVersion: "build-collaboration-cutover-live-state/v2";
  tenant: {
    activatedAt?: number;
    activatedByWorkosUserId?: string;
    cutoverEpoch: number;
    status: "active" | "disabled" | "migration_ready";
  };
}

interface RetainedDigestSnapshot {
  assets: { count: number; sha256: string };
  auditCutoffAt: number;
  auditEvents: { count: number; sha256: string };
  completedAt: number;
  posts: { count: number; sha256: string };
  receipts: { count: number; sha256: string };
  revisions: { count: number; sha256: string };
  snapshotId: string;
  status: string;
}

interface CommonArtifactContext {
  applicationUrl: string;
  applicationVersion: string;
  convexDeployment: string;
  convexUrl: string;
  forbiddenOrganizationId: string;
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
  const forbiddenOrganizationId = requireText(
    errors,
    manifest,
    "forbiddenOrganizationId"
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
      })
    : undefined;
  const applicationUrl = release
    ? requireText(errors, release, "applicationUrl", {
        label: "release.applicationUrl",
        pattern: HTTPS_PATTERN,
      })
    : undefined;
  const convexUrl = release
    ? requireText(errors, release, "convexUrl", {
        label: "release.convexUrl",
        pattern: HTTPS_PATTERN,
      })
    : undefined;
  if (convexDeployment && !isProductionConvexDeployment(convexDeployment)) {
    errors.push("release.convexDeployment must be prod or team:project:prod.");
  }
  const context =
    organizationId &&
    representativeBuildId &&
    forbiddenOrganizationId &&
    gitCommit &&
    applicationVersion &&
    convexDeployment &&
    applicationUrl &&
    convexUrl
      ? {
          applicationUrl,
          applicationVersion,
          convexDeployment,
          convexUrl,
          forbiddenOrganizationId,
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
  if (context && liveState) {
    validateLiveRelease(errors, liveState, context);
  }

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
      validateCompanionCutoverArtifact(errors, artifact, liveState, stage);
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
      validateArtifactAttestation(
        errors,
        liveState,
        MIGRATION_ATTESTATION_KINDS[stage],
        asObject(migration[`${stage}Artifact`])?.sha256,
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
        "build-collaboration-command-evidence/v2",
        `${commandName} schemaVersion`
      );
      requireExactString(
        errors,
        artifact,
        "commandName",
        commandName,
        `${commandName} commandName`
      );
      validateGovernedGateArtifact(
        errors,
        artifact,
        commandName,
        context,
        manifestDirectory
      );
      if (liveState && isManualBuildCollaborationCutoverGate(commandName)) {
        validateArtifactAttestation(
          errors,
          liveState,
          MANUAL_ATTESTATION_KINDS[commandName],
          asObject(commands[commandName])?.sha256,
          commandName
        );
      }
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
        "build-collaboration-smoke-evidence/v2",
        `${role} smoke schemaVersion`
      );
      requireExactString(errors, artifact, "role", role, `${role} smoke role`);
      requireExactString(
        errors,
        artifact,
        "producer",
        BUILD_COLLABORATION_SMOKE_RUNNER,
        `${role} smoke producer`
      );
      requireExactString(
        errors,
        artifact,
        "gitHead",
        context.gitCommit,
        `${role} smoke gitHead`
      );
      requireExactString(
        errors,
        artifact,
        "command",
        serializeCommand(buildCollaborationRoleSmokeArgv(role)),
        `${role} smoke command`
      );
      requireExactString(
        errors,
        artifact,
        "status",
        "passed",
        `${role} smoke status`
      );
      if (artifact.exitCode !== 0) {
        errors.push(`${role} smoke journey did not pass with exit code 0.`);
      }
      requireText(errors, artifact, "stdoutSha256", {
        label: `${role} smoke stdoutSha256`,
        pattern: SHA256_PATTERN,
      });
      requireText(errors, artifact, "stderrSha256", {
        label: `${role} smoke stderrSha256`,
        pattern: SHA256_PATTERN,
      });
      validateHashedCommandOutput(errors, artifact, "stdout", `${role} smoke`);
      validateHashedCommandOutput(errors, artifact, "stderr", `${role} smoke`);
      validateE2EArtifact(errors, artifact, context, `${role} smoke`);
      validateIsoTimestamp(errors, artifact, "startedAt", `${role} smoke`);
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
      "build-collaboration-interface-evidence/v2",
      "interface schemaVersion"
    );
    requireExactString(
      errors,
      interfaceArtifact,
      "status",
      "passed",
      "interface status"
    );
    requireExactString(
      errors,
      interfaceArtifact,
      "producer",
      BUILD_COLLABORATION_INTERFACE_RUNNER,
      "interface producer"
    );
    requireExactString(
      errors,
      interfaceArtifact,
      "gitHead",
      context.gitCommit,
      "interface gitHead"
    );
    const visualReview = commands ? asObject(commands.visualReview) : undefined;
    const keyboardReview = commands
      ? asObject(commands.keyboardReview)
      : undefined;
    requireExactString(
      errors,
      interfaceArtifact,
      "visualReviewSha256",
      typeof visualReview?.sha256 === "string" ? visualReview.sha256 : "",
      "interface visualReviewSha256"
    );
    requireExactString(
      errors,
      interfaceArtifact,
      "keyboardReviewSha256",
      typeof keyboardReview?.sha256 === "string" ? keyboardReview.sha256 : "",
      "interface keyboardReviewSha256"
    );
    validateIsoTimestamp(errors, interfaceArtifact, "startedAt", "interface");
    validateIsoTimestamp(errors, interfaceArtifact, "completedAt", "interface");
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
    "build-collaboration-cutover-live-state/v2",
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
  if (!Array.isArray(live.artifactAttestations)) {
    errors.push("Server-derived artifact attestations are required.");
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

function validateLiveRelease(
  errors: string[],
  live: BuildCollaborationCutoverLiveState,
  expected: CommonArtifactContext
) {
  const release = asObject(live.release);
  if (!release) {
    errors.push("Server-derived release metadata is unavailable.");
    return;
  }
  for (const key of [
    "applicationUrl",
    "applicationVersion",
    "convexDeployment",
    "convexUrl",
    "gitCommit",
  ] as const) {
    if (release[key] !== expected[key]) {
      errors.push(
        `Server-derived release ${key} does not match the declared deployment.`
      );
    }
  }
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

function validateRollback(
  errors: string[],
  artifact: JsonObject,
  live: BuildCollaborationCutoverLiveState
) {
  requireExactString(
    errors,
    artifact,
    "schemaVersion",
    "build-collaboration-rollback-evidence/v2",
    "rollback schemaVersion"
  );
  requireExactString(errors, artifact, "status", "passed", "rollback status");
  const rehearsal = live.rollbackRehearsal;
  if (!rehearsal || rehearsal.status !== "complete") {
    errors.push("A completed server-retained rollback rehearsal is required.");
    return;
  }
  if (artifact.rehearsalId !== rehearsal.rehearsalId) {
    errors.push(
      "Rollback artifact does not reference the certified server rehearsal."
    );
  }
  if (
    rehearsal.disabledCutoverEpoch !== rehearsal.beforeCutoverEpoch + 1 ||
    live.tenant.cutoverEpoch !== rehearsal.disabledCutoverEpoch
  ) {
    errors.push(
      "Rollback did not increment and preserve the server-derived cutover epoch."
    );
  }
  if (
    rehearsal.legacyWriteDenialError !==
      "Public/Internal Notes are retired. Publish a governed collaboration post instead." ||
    !Number.isSafeInteger(rehearsal.legacyWriteDeniedAt)
  ) {
    errors.push(
      "The production addActiveBuildNote denial canary did not pass."
    );
  }
  if (
    !digestSnapshotsMatch(rehearsal.beforeSnapshot, rehearsal.afterSnapshot)
  ) {
    errors.push(
      "Tenant-wide stable-ID/content digests changed during rollback."
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
      transition.newState.cutoverEpoch === rehearsal.disabledCutoverEpoch
  );
  const reactivationTransition = rolloutTransitions.find(
    (transition) =>
      transition.createdAt >
        (disabledTransition?.createdAt ?? Number.MAX_SAFE_INTEGER) &&
      transition.newState?.status === "active" &&
      transition.newState.cutoverEpoch === rehearsal.disabledCutoverEpoch
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
}

function digestSnapshotsMatch(
  before: RetainedDigestSnapshot,
  after: RetainedDigestSnapshot
) {
  if (
    before.status !== "complete" ||
    after.status !== "complete" ||
    before.auditCutoffAt !== after.auditCutoffAt
  ) {
    return false;
  }
  return ["posts", "revisions", "assets", "receipts", "auditEvents"].every(
    (collection) => {
      const beforeDigest = before[collection as keyof RetainedDigestSnapshot];
      const afterDigest = after[collection as keyof RetainedDigestSnapshot];
      return (
        asObject(beforeDigest)?.count === asObject(afterDigest)?.count &&
        asObject(beforeDigest)?.sha256 === asObject(afterDigest)?.sha256 &&
        typeof asObject(beforeDigest)?.sha256 === "string" &&
        SHA256_PATTERN.test(String(asObject(beforeDigest)?.sha256))
      );
    }
  );
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

function validateCompanionCutoverArtifact(
  errors: string[],
  artifact: JsonObject,
  live: BuildCollaborationCutoverLiveState,
  stage: "preview" | "application" | "replay" | "parity"
) {
  const rawCutover = (live as unknown as JsonObject).companionCutover;
  if (rawCutover === null) {
    if (artifactClaimsCompanionCutover(artifact)) {
      errors.push(
        `Migration ${stage} artifact claims a companion cutover, but authenticated companion cutover state is unavailable.`
      );
    }
    return;
  }
  const cutoverObject = asObject(rawCutover);
  if (!cutoverObject) {
    errors.push(
      "Authenticated companion cutover state must be null or a JSON object."
    );
    return;
  }
  const cutover = cutoverObject as unknown as NonNullable<
    BuildCollaborationCutoverLiveState["companionCutover"]
  >;
  validateAuthenticatedCompanionCutoverShape(errors, cutover);
  const mappings: [string, unknown][] = [
    ["companionRunId", cutover.runId],
    ["companionPlanToken", cutover.planToken],
    ["companionReportCount", cutover.reportCount],
  ];
  for (const [key, expected] of mappings) {
    if (artifact[key] !== expected) {
      errors.push(
        `Migration ${stage} artifact ${key} does not match the authenticated companion cutover.`
      );
    }
  }
  validateCompanionReportHash(errors, artifact, cutover, stage);
  validateCompletedCompanionCutover(errors, cutover);
  validateCompanionStageEvidence(errors, artifact, cutover, stage);
}

function artifactClaimsCompanionCutover(artifact: JsonObject) {
  return [
    "activeSubmilestoneCount",
    "exceptionCount",
    "companionParityPassed",
    "companionRunId",
    "companionPlanToken",
    "companionReportCount",
    "companionReportHash",
    "companionReplayed",
    "companionWriteCount",
    "generatedCompanionCount",
    "manualActionItemCount",
    "materializedCount",
    "parityMismatchCount",
    "repairedCount",
  ].some((key) => artifact[key] !== undefined);
}

function validateAuthenticatedCompanionCutoverShape(
  errors: string[],
  cutover: NonNullable<BuildCollaborationCutoverLiveState["companionCutover"]>
) {
  if (
    typeof cutover.runId !== "string" ||
    cutover.runId.trim().length === 0 ||
    typeof cutover.planToken !== "string" ||
    cutover.planToken.trim().length === 0
  ) {
    errors.push(
      "Authenticated companion cutover is missing a non-empty run ID or plan token."
    );
  }
  const completionMetrics = [
    ["activeSubmilestoneCount", cutover.activeSubmilestoneCount],
    ["exceptionCount", cutover.exceptionCount],
    ["generatedCompanionCount", cutover.generatedCompanionCount],
    ["manualActionItemCount", cutover.manualActionItemCount],
    ["materializedCount", cutover.materializedCount],
    ["parityMismatchCount", cutover.parityMismatchCount],
    ["repairedCount", cutover.repairedCount],
    ["reportCount", cutover.reportCount],
  ] as const;
  for (const [name, value] of completionMetrics) {
    if (!Number.isSafeInteger(value) || value < 0) {
      errors.push(
        `Authenticated companion cutover ${name} must be a non-negative integer.`
      );
    }
  }
}

function validateCompanionReportHash(
  errors: string[],
  artifact: JsonObject,
  cutover: NonNullable<BuildCollaborationCutoverLiveState["companionCutover"]>,
  stage: "preview" | "application" | "replay" | "parity"
) {
  if (stage !== "preview") {
    if (
      typeof cutover.reportHash !== "string" ||
      !SHA256_PATTERN.test(cutover.reportHash)
    ) {
      errors.push(
        "Authenticated companion cutover is missing a valid report hash."
      );
    }
    if (
      typeof artifact.companionReportHash !== "string" ||
      !SHA256_PATTERN.test(artifact.companionReportHash) ||
      artifact.companionReportHash !== cutover.reportHash
    ) {
      errors.push(
        `Migration ${stage} artifact companionReportHash does not match the authenticated companion cutover.`
      );
    }
  }
}

function validateCompletedCompanionCutover(
  errors: string[],
  cutover: NonNullable<BuildCollaborationCutoverLiveState["companionCutover"]>
) {
  if (
    cutover.status !== "complete" ||
    cutover.exceptionCount !== 0 ||
    cutover.parityMismatchCount !== 0
  ) {
    errors.push(
      "Authenticated companion cutover is not complete with zero exceptions and parity mismatches."
    );
  }
}

function validateCompanionStageEvidence(
  errors: string[],
  artifact: JsonObject,
  cutover: NonNullable<BuildCollaborationCutoverLiveState["companionCutover"]>,
  stage: "preview" | "application" | "replay" | "parity"
) {
  if (
    stage === "replay" &&
    (artifact.companionReplayed !== true || artifact.companionWriteCount !== 0)
  ) {
    errors.push(
      "Migration replay artifact must prove a zero-write companion replay."
    );
  }
  if (
    stage === "parity" &&
    (artifact.companionParityPassed !== true ||
      artifact.activeSubmilestoneCount !== cutover.activeSubmilestoneCount ||
      artifact.generatedCompanionCount !== cutover.generatedCompanionCount ||
      artifact.manualActionItemCount !== cutover.manualActionItemCount)
  ) {
    errors.push(
      "Migration parity artifact does not match the certified companion dimensions."
    );
  }
}

function validateGovernedGateArtifact(
  errors: string[],
  artifact: JsonObject,
  commandName: (typeof REQUIRED_BUILD_COLLABORATION_CUTOVER_COMMANDS)[number],
  context: CommonArtifactContext,
  manifestDirectory: string
) {
  requireExactString(
    errors,
    artifact,
    "gitHead",
    context.gitCommit,
    `${commandName} gitHead`
  );
  validateIsoTimestamp(errors, artifact, "startedAt", commandName);
  if (isManualBuildCollaborationCutoverGate(commandName)) {
    requireExactString(
      errors,
      artifact,
      "mode",
      "human_review",
      `${commandName} mode`
    );
    requireExactString(
      errors,
      artifact,
      "producer",
      BUILD_COLLABORATION_MANUAL_REVIEW_RUNNER,
      `${commandName} producer`
    );
    requireText(errors, artifact, "reviewerWorkosUserId", {
      label: `${commandName} reviewerWorkosUserId`,
      pattern: WORKOS_USER_PATTERN,
    });
    const evidence = artifact.evidence;
    if (Array.isArray(evidence) && evidence.length > 0) {
      for (const [index, item] of evidence.entries()) {
        const typed = asObject(item);
        if (!typed) {
          errors.push(`${commandName} evidence ${index} must be an object.`);
          continue;
        }
        validateHashedFileReference(
          errors,
          typed,
          manifestDirectory,
          `${commandName} evidence ${index}`
        );
      }
    } else {
      errors.push(`${commandName} requires hashed human-review evidence.`);
    }
    return;
  }
  requireExactString(
    errors,
    artifact,
    "mode",
    "automated",
    `${commandName} mode`
  );
  requireExactString(
    errors,
    artifact,
    "producer",
    BUILD_COLLABORATION_CUTOVER_GATE_RUNNER,
    `${commandName} producer`
  );
  let expectedCommand: string | undefined;
  try {
    const argv = buildCollaborationCutoverGateArgv(commandName, {
      ...context,
    });
    expectedCommand = argv ? serializeCommand(argv) : undefined;
  } catch (error) {
    errors.push(
      `${commandName} command contract is incomplete: ${error instanceof Error ? error.message : String(error)}`
    );
  }
  if (expectedCommand) {
    requireExactString(
      errors,
      artifact,
      "command",
      expectedCommand,
      `${commandName} command`
    );
  }
  requireText(errors, artifact, "stdoutSha256", {
    label: `${commandName} stdoutSha256`,
    pattern: SHA256_PATTERN,
  });
  requireText(errors, artifact, "stderrSha256", {
    label: `${commandName} stderrSha256`,
    pattern: SHA256_PATTERN,
  });
  validateHashedCommandOutput(errors, artifact, "stdout", commandName);
  validateHashedCommandOutput(errors, artifact, "stderr", commandName);
  if (commandName === "playwrightRoleJourneys") {
    validateE2EArtifact(errors, artifact, context, commandName);
  }
}

function validateArtifactAttestation(
  errors: string[],
  live: BuildCollaborationCutoverLiveState,
  kind: ArtifactAttestationKind,
  artifactSha256: unknown,
  label: string
) {
  const rehearsalId = live.rollbackRehearsal?.rehearsalId;
  const attestation = (
    Array.isArray(live.artifactAttestations) ? live.artifactAttestations : []
  ).find((candidate) => asObject(candidate)?.kind === kind);
  if (!attestation) {
    errors.push(
      `${label} requires an authenticated human artifact attestation.`
    );
    return;
  }
  if (
    typeof artifactSha256 !== "string" ||
    !SHA256_PATTERN.test(artifactSha256) ||
    attestation.artifactSha256 !== artifactSha256.toLowerCase()
  ) {
    errors.push(
      `${label} artifact hash does not match its server attestation.`
    );
  }
  if (attestation.rehearsalId !== rehearsalId) {
    errors.push(
      `${label} attestation is not bound to the certified rehearsal.`
    );
  }
  if (
    !WORKOS_USER_PATTERN.test(attestation.attestedByWorkosUserId) ||
    NON_HUMAN_ACTOR_PATTERN.test(attestation.attestedByWorkosUserId) ||
    !Array.isArray(attestation.attestedByRoles) ||
    attestation.attestedByRoles.length === 0 ||
    !Number.isSafeInteger(attestation.createdAt)
  ) {
    errors.push(`${label} attestation lacks authenticated human provenance.`);
  }
}

function validateHashedFileReference(
  errors: string[],
  reference: JsonObject,
  directory: string,
  label: string
) {
  const path = requireText(errors, reference, "path", {
    label: `${label} path`,
  });
  const expectedHash = requireText(errors, reference, "sha256", {
    label: `${label} sha256`,
    pattern: SHA256_PATTERN,
  });
  if (!(path && expectedHash)) {
    return;
  }
  const resolved = isAbsolute(path) ? path : resolve(directory, path);
  if (!(existsSync(resolved) && statSync(resolved).isFile())) {
    errors.push(`${label} does not exist: ${path}.`);
    return;
  }
  const actualHash = createHash("sha256")
    .update(readFileSync(resolved))
    .digest("hex");
  if (actualHash !== expectedHash.toLowerCase()) {
    errors.push(`${label} hash does not match ${path}.`);
  }
}

function validateE2EArtifact(
  errors: string[],
  artifact: JsonObject,
  context: CommonArtifactContext,
  label: string
) {
  try {
    const evidence = validateBuildCollaborationE2EFixture(
      context,
      typeof artifact.fixturePath === "string" ? artifact.fixturePath : ""
    );
    if (artifact.fixtureSha256 !== evidence.fixtureSha256) {
      errors.push(`${label} fixture hash does not match retained evidence.`);
    }
    if (
      JSON.stringify(artifact.storageStates) !==
      JSON.stringify(evidence.storageStates)
    ) {
      errors.push(`${label} authenticated storage-state evidence changed.`);
    }
  } catch (error) {
    errors.push(
      `${label} fixture evidence is invalid: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

function validateHashedCommandOutput(
  errors: string[],
  artifact: JsonObject,
  stream: "stderr" | "stdout",
  label: string
) {
  const path = artifact[`${stream}Path`];
  const expectedHash = artifact[`${stream}Sha256`];
  if (
    typeof path !== "string" ||
    !isAbsolute(path) ||
    !(existsSync(path) && statSync(path).isFile())
  ) {
    errors.push(`${label} ${stream} evidence file is unavailable.`);
    return;
  }
  const actualHash = createHash("sha256")
    .update(readFileSync(path))
    .digest("hex");
  if (actualHash !== expectedHash) {
    errors.push(`${label} ${stream} evidence hash does not match.`);
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
  const release = asObject(manifest.release);
  const convexDeployment =
    typeof release?.convexDeployment === "string"
      ? release.convexDeployment
      : "";
  if (!(convexDeployment && isProductionConvexDeployment(convexDeployment))) {
    throw new Error("A specific production Convex deployment is required.");
  }
  const result = spawnSync(
    "bun",
    [
      "x",
      "convex",
      "run",
      "--deployment",
      convexDeployment,
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
