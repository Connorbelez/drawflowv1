import {
  type BuildCollaborationCutoverLiveState,
  type CommonArtifactContext,
  type JsonObject,
  NON_HUMAN_ACTOR_PATTERN,
  type RetainedDigestSnapshot,
  SHA256_PATTERN,
} from "./build-collaboration-cutover-contract";
import {
  asObject,
  requireExactString,
} from "./build-collaboration-cutover-validation-utils";

export function validateLiveState(
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
    return live as unknown as BuildCollaborationCutoverLiveState;
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
  return live as unknown as BuildCollaborationCutoverLiveState;
}

export function validateLiveRelease(
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

export function validateParityArtifact(
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

export function validateActivation(
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

export function validateRollback(
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

export function digestSnapshotsMatch(
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
