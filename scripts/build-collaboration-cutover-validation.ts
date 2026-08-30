import {
  validateArtifactAttestation,
  validateCompanionCutoverArtifact,
  validateGovernedGateArtifact,
} from "./build-collaboration-cutover-artifact-validation";
import {
  GIT_SHA_PATTERN,
  HTTPS_PATTERN,
  MANUAL_ATTESTATION_KINDS,
  MIGRATION_ATTESTATION_KINDS,
  REQUIRED_BUILD_COLLABORATION_CUTOVER_COMMANDS,
  REQUIRED_BUILD_COLLABORATION_MONITORS,
  SHA256_PATTERN,
} from "./build-collaboration-cutover-contract";
import {
  BUILD_COLLABORATION_INTERFACE_RUNNER,
  BUILD_COLLABORATION_SMOKE_RUNNER,
  buildCollaborationRoleSmokeArgv,
  isManualBuildCollaborationCutoverGate,
  isProductionConvexDeployment,
  serializeCommand,
} from "./build-collaboration-cutover-gates";
import {
  validateActivation,
  validateLiveRelease,
  validateLiveState,
  validateParityArtifact,
  validateRollback,
} from "./build-collaboration-cutover-state-validation";
import {
  asObject,
  readTypedArtifact,
  requireExactString,
  requireObject,
  requireText,
  validateCommonArtifact,
  validateE2EArtifact,
  validateHashedCommandOutput,
  validateIsoTimestamp,
} from "./build-collaboration-cutover-validation-utils";
import { REQUIRED_BUILD_COLLABORATION_ROLES } from "./build-collaboration-personas";

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: one fail-closed validator reports every independent release-gate defect
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
