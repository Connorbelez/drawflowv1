import {
  type ArtifactAttestationKind,
  type BuildCollaborationCutoverLiveState,
  type CommonArtifactContext,
  type JsonObject,
  NON_HUMAN_ACTOR_PATTERN,
  type REQUIRED_BUILD_COLLABORATION_CUTOVER_COMMANDS,
  SHA256_PATTERN,
  WORKOS_USER_PATTERN,
} from "./build-collaboration-cutover-contract";
import {
  BUILD_COLLABORATION_CUTOVER_GATE_RUNNER,
  BUILD_COLLABORATION_MANUAL_REVIEW_RUNNER,
  buildCollaborationCutoverGateArgv,
  isManualBuildCollaborationCutoverGate,
  serializeCommand,
} from "./build-collaboration-cutover-gates";
import {
  asObject,
  requireExactString,
  requireText,
  validateE2EArtifact,
  validateHashedCommandOutput,
  validateHashedFileReference,
  validateIsoTimestamp,
} from "./build-collaboration-cutover-validation-utils";

export function validateCompanionCutoverArtifact(
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

export function validateGovernedGateArtifact(
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

export function validateArtifactAttestation(
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
