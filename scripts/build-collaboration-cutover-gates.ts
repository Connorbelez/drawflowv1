export const BUILD_COLLABORATION_CUTOVER_GATE_RUNNER =
  "drawflow-build-collaboration-cutover-gate/v1";

export const BUILD_COLLABORATION_MANUAL_REVIEW_RUNNER =
  "drawflow-build-collaboration-manual-review/v1";

export const BUILD_COLLABORATION_SMOKE_RUNNER =
  "drawflow-build-collaboration-smoke-runner/v1";

export const BUILD_COLLABORATION_INTERFACE_RUNNER =
  "drawflow-build-collaboration-interface-runner/v1";

const SHELL_SAFE_ARGUMENT_PATTERN = /^[A-Za-z0-9_./:=+-]+$/;
const PRODUCTION_DEPLOYMENT_PATTERN =
  /^(?:prod|[a-z0-9][a-z0-9-]*:[a-z0-9][a-z0-9-]*:prod)$/i;

export const BUILD_COLLABORATION_AUTOMATED_CUTOVER_GATES = [
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
] as const;

export const BUILD_COLLABORATION_MANUAL_CUTOVER_GATES = [
  "visualReview",
  "keyboardReview",
] as const;

export const BUILD_COLLABORATION_CUTOVER_GATES = [
  ...BUILD_COLLABORATION_AUTOMATED_CUTOVER_GATES,
  ...BUILD_COLLABORATION_MANUAL_CUTOVER_GATES,
] as const;

export type BuildCollaborationCutoverGate =
  (typeof BUILD_COLLABORATION_CUTOVER_GATES)[number];

export interface BuildCollaborationCutoverGateContext {
  applicationUrl: string;
  applicationVersion: string;
  convexDeployment: string;
  convexUrl: string;
  forbiddenOrganizationId?: string;
  gitCommit: string;
  organizationId: string;
  representativeBuildId: string;
}

const TARGETED_TEST_FILES = [
  "convex/build_action_item_queues.test.ts",
  "convex/build_action_items.test.ts",
  "convex/build_collaboration.test.ts",
  "convex/build_collaboration_delivery.test.ts",
  "convex/build_collaboration_delivery_model.test.ts",
  "convex/build_collaboration_editing.test.ts",
  "convex/build_collaboration_legacy_note_migration.test.ts",
  "convex/build_collaboration_lifecycle.test.ts",
  "convex/build_collaboration_links.test.ts",
  "convex/build_collaboration_model.test.ts",
  "convex/build_collaboration_moderation.test.ts",
  "convex/build_collaboration_notifications.test.ts",
  "convex/build_collaboration_operational_events.test.ts",
  "convex/build_collaboration_resolution.test.ts",
  "convex/build_collaboration_scheduling.test.ts",
  "convex/build_collaboration_webhook_network.test.ts",
  "convex/build_collaboration_webhooks.test.ts",
  "scripts/build-collaboration-cutover-certification.test.ts",
  "scripts/build-collaboration-cutover-gates.test.ts",
  "scripts/prepare-build-collaboration-e2e.test.ts",
  "scripts/verify-build-collaboration-production.test.ts",
  "src/features/build-collaboration/BuildCollaborationEditSheet.test.tsx",
  "src/features/build-collaboration/BuildCollaborationFeed.test.tsx",
  "src/features/build-collaboration/BuildCollaborationModerationSheet.test.tsx",
  "src/features/build-collaboration/BuildCollaborationMutationGate.test.tsx",
  "src/features/build-collaboration/BuildCollaborationSearch.test.tsx",
  "src/features/build-collaboration/BuildCollaborationThreadSheet.test.tsx",
  "src/features/build-collaboration/BuildCollaborationWorkspace.test.tsx",
  "src/features/build-collaboration/build-collaboration-asset-upload.test.ts",
  "src/features/build-collaboration/build-collaboration-offline-drafts.test.ts",
  "src/features/build-collaboration/referenceFocus.test.ts",
  "src/routes/api/-release.test.ts",
  "src/routes/homeowner/builds/-build-collaboration.test.tsx",
] as const;

export function isBuildCollaborationCutoverGate(
  value: string
): value is BuildCollaborationCutoverGate {
  return (BUILD_COLLABORATION_CUTOVER_GATES as readonly string[]).includes(
    value
  );
}

export function isProductionConvexDeployment(value: string) {
  return PRODUCTION_DEPLOYMENT_PATTERN.test(value);
}

export function isManualBuildCollaborationCutoverGate(
  value: BuildCollaborationCutoverGate
) {
  return (
    BUILD_COLLABORATION_MANUAL_CUTOVER_GATES as readonly string[]
  ).includes(value);
}

export function buildCollaborationCutoverGateArgv(
  gate: BuildCollaborationCutoverGate,
  context: BuildCollaborationCutoverGateContext
): string[] | null {
  switch (gate) {
    case "convexCodegen":
      return ["bun", "x", "convex", "codegen"];
    case "convexTypecheck":
      return ["bun", "x", "tsc", "-p", "convex/tsconfig.json", "--noEmit"];
    case "targetedTests":
      return ["bun", "run", "test", "--", ...TARGETED_TEST_FILES];
    case "fullTestSuite":
      return ["bun", "run", "test"];
    case "applicationTypecheck":
      return ["bun", "run", "typecheck"];
    case "productionBuild":
      return ["bun", "run", "build"];
    case "uiHtmlAudit":
      return ["bun", "run", "ui:html:audit"];
    case "deploymentRegistration":
      return [
        "bun",
        "run",
        "verify:convex-deployment",
        "--",
        "--url",
        context.convexUrl,
      ];
    case "authenticatedProductionProbes":
      if (!context.forbiddenOrganizationId) {
        throw new Error(
          "authenticatedProductionProbes requires forbiddenOrganizationId."
        );
      }
      return [
        "bun",
        "run",
        "verify:build-collaboration-production",
        "--organization-id",
        context.organizationId,
        "--build-id",
        context.representativeBuildId,
        "--forbidden-organization-id",
        context.forbiddenOrganizationId,
        "--application-url",
        context.applicationUrl,
        "--application-version",
        context.applicationVersion,
        "--git-commit",
        context.gitCommit,
        "--convex-deployment",
        context.convexDeployment,
      ];
    case "warningCheck":
      return ["bun", "run", "verify:build-warnings"];
    case "playwrightRoleJourneys":
      return ["bun", "run", "test:e2e:build-collaboration"];
    case "visualReview":
    case "keyboardReview":
      return null;
  }
}

export function serializeCommand(argv: readonly string[]) {
  return argv
    .map((part) =>
      SHELL_SAFE_ARGUMENT_PATTERN.test(part)
        ? part
        : `'${part.replaceAll("'", "'\\''")}'`
    )
    .join(" ");
}

export function buildCollaborationRoleSmokeArgv(role: string) {
  return [
    "bun",
    "x",
    "playwright",
    "test",
    "--config=playwright.build-collaboration.config.ts",
    "tests/e2e/build-collaboration-participants.spec.ts",
    "--project=chromium",
    "--grep",
    `${role} production collaboration`,
  ];
}
