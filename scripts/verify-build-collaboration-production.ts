import { spawnSync } from "node:child_process";

interface ProbeResult {
  error?: string;
  name: string;
  ok: boolean;
  value?: unknown;
}

const AUTHORIZATION_DENIAL_PATTERN = /Forbidden:/;
const TRAILING_SLASH_PATTERN = /\/$/;

export function validateBuildCollaborationProductionProbeResults(
  results: ProbeResult[],
  expected: {
    applicationUrl: string;
    applicationVersion: string;
    buildId: string;
    gitCommit: string;
    organizationId: string;
  }
) {
  const errors: string[] = [];
  const byName = new Map(results.map((result) => [result.name, result]));
  const rollout = successfulValue(byName, "rollout", errors);
  if (
    !isObject(rollout) ||
    rollout.available !== true ||
    rollout.status !== "active"
  ) {
    errors.push("Authenticated rollout probe did not return an active tenant.");
  }
  const certification = successfulValue(byName, "certification", errors);
  if (
    !isObject(certification) ||
    certification.organizationId !== expected.organizationId ||
    certification.representativeBuildId !== expected.buildId ||
    !isObject(certification.tenant) ||
    certification.tenant.status !== "active"
  ) {
    errors.push(
      "Authenticated certification-state probe returned the wrong production scope."
    );
  }
  const release = successfulValue(byName, "applicationRelease", errors);
  if (
    !isObject(release) ||
    release.applicationUrl !== expected.applicationUrl ||
    release.applicationVersion !== expected.applicationVersion ||
    release.gitCommit !== expected.gitCommit
  ) {
    errors.push(
      "Production application release metadata does not match the declared release."
    );
  }
  const feed = successfulValue(byName, "feed", errors);
  if (
    !(isObject(feed) && Array.isArray(feed.page)) ||
    typeof feed.isDone !== "boolean"
  ) {
    errors.push(
      "Authenticated feed handler probe returned an invalid contract."
    );
  }
  for (const name of ["tags", "drafts"] as const) {
    const value = successfulValue(byName, name, errors);
    if (!Array.isArray(value)) {
      errors.push(
        `Authenticated ${name} handler probe returned an invalid contract.`
      );
    }
  }
  const preferences = successfulValue(
    byName,
    "notificationPreferences",
    errors
  );
  if (
    !(isObject(preferences) && Array.isArray(preferences.channels)) ||
    typeof preferences.workosUserId !== "string"
  ) {
    errors.push(
      "Authenticated notification-preference probe returned an invalid contract."
    );
  }
  const denial = byName.get("crossTenantDenial");
  if (
    !denial ||
    denial.ok ||
    !AUTHORIZATION_DENIAL_PATTERN.test(denial.error ?? "")
  ) {
    errors.push(
      "Cross-tenant negative probe did not reach and reject the deployed authorization handler."
    );
  }
  return errors;
}

function successfulValue(
  results: Map<string, ProbeResult>,
  name: string,
  errors: string[]
) {
  const result = results.get(name);
  if (!result?.ok) {
    errors.push(
      `${name} production probe failed: ${result?.error ?? "missing result"}.`
    );
    return;
  }
  return result.value;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function runConvexQuery(input: {
  args: Record<string, unknown>;
  deployment: string;
  identity: string;
  name: string;
}) {
  const result = spawnSync(
    "bun",
    [
      "x",
      "convex",
      "run",
      "--deployment",
      input.deployment,
      "--identity",
      input.identity,
      input.name,
      JSON.stringify(input.args),
    ],
    { encoding: "utf8" }
  );
  if (result.status !== 0) {
    throw new Error((result.stderr || result.stdout).trim());
  }
  return JSON.parse(result.stdout);
}

async function main() {
  const organizationId = argumentValue("--organization-id");
  const buildId = argumentValue("--build-id");
  const forbiddenOrganizationId = argumentValue("--forbidden-organization-id");
  const applicationUrl = argumentValue("--application-url");
  const applicationVersion = argumentValue("--application-version");
  const convexDeployment = argumentValue("--convex-deployment");
  const gitCommit = argumentValue("--git-commit");
  const identity = process.env.BUILD_COLLABORATION_OPERATOR_IDENTITY_JSON;
  if (
    !(
      organizationId &&
      buildId &&
      forbiddenOrganizationId &&
      applicationUrl &&
      applicationVersion &&
      convexDeployment &&
      gitCommit &&
      identity
    )
  ) {
    console.error(
      "Usage: BUILD_COLLABORATION_OPERATOR_IDENTITY_JSON='<identity>' bun scripts/verify-build-collaboration-production.ts --organization-id <org> --build-id <build> --forbidden-organization-id <other-org> --application-url <https-url> --application-version <deployment-id> --git-commit <sha> --convex-deployment <deployment>"
    );
    process.exitCode = 2;
    return;
  }
  if (forbiddenOrganizationId === organizationId) {
    console.error(
      "The forbidden organization must differ from the production organization."
    );
    process.exitCode = 2;
    return;
  }
  JSON.parse(identity);
  const common = { buildId, organizationId };
  const definitions = [
    {
      args: common,
      name: "rollout",
      query: "build_collaboration_rollout:getBuildCollaborationRolloutState",
    },
    {
      args: common,
      name: "certification",
      query:
        "build_collaboration_cutover_certification:getBuildCollaborationCutoverCertificationState",
    },
    {
      args: { ...common, paginationOpts: { cursor: null, numItems: 10 } },
      name: "feed",
      query: "build_collaboration:listBuildCollaborationFeed",
    },
    {
      args: common,
      name: "tags",
      query: "build_collaboration_references:listBuildCollaborationTagOptions",
    },
    {
      args: common,
      name: "drafts",
      query: "build_collaboration_drafts:listMyBuildCollaborationDrafts",
    },
    {
      args: common,
      name: "notificationPreferences",
      query:
        "build_collaboration_notifications:getMyBuildCollaborationNotificationPreferences",
    },
  ];
  const results: ProbeResult[] = definitions.map((definition) => {
    try {
      return {
        name: definition.name,
        ok: true,
        value: runConvexQuery({
          args: definition.args,
          deployment: convexDeployment,
          identity,
          name: definition.query,
        }),
      };
    } catch (error) {
      return {
        name: definition.name,
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  });
  try {
    const response = await fetch(
      `${applicationUrl.replace(TRAILING_SLASH_PATTERN, "")}/api/release`
    );
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    results.push({
      name: "applicationRelease",
      ok: true,
      value: await response.json(),
    });
  } catch (error) {
    results.push({
      name: "applicationRelease",
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
  try {
    runConvexQuery({
      args: { buildId, organizationId: forbiddenOrganizationId },
      deployment: convexDeployment,
      identity,
      name: "build_collaboration_rollout:getBuildCollaborationRolloutState",
    });
    results.push({ name: "crossTenantDenial", ok: true });
  } catch (error) {
    results.push({
      name: "crossTenantDenial",
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
  const errors = validateBuildCollaborationProductionProbeResults(results, {
    applicationUrl,
    applicationVersion,
    buildId,
    gitCommit,
    organizationId,
  });
  if (errors.length) {
    console.error(
      "Authenticated Build Collaboration production probes failed:"
    );
    for (const error of errors) {
      console.error(`- ${error}`);
    }
    process.exitCode = 1;
    return;
  }
  console.log(
    JSON.stringify(
      {
        buildId,
        completedAt: new Date().toISOString(),
        organizationId,
        probeCount: results.length,
        schemaVersion: "build-collaboration-production-probes/v1",
        status: "passed",
      },
      null,
      2
    )
  );
}

function argumentValue(name: string) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

if (import.meta.main) {
  await main();
}
