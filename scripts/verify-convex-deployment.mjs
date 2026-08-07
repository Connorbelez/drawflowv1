import { ConvexHttpClient } from "convex/browser";
import { makeFunctionReference } from "convex/server";

const skipOutsideVercel =
  process.argv.includes("--if-vercel") && process.env.VERCEL !== "1";

if (skipOutsideVercel) {
  console.log("Convex function-registration check skipped outside Vercel.");
  process.exit(0);
}

const urlArgumentIndex = process.argv.indexOf("--url");
const deploymentUrl =
  urlArgumentIndex >= 0
    ? process.argv[urlArgumentIndex + 1]
    : process.env.VITE_CONVEX_URL;
if (!deploymentUrl) {
  console.error(
    "Convex function-registration check failed: VITE_CONVEX_URL is not configured."
  );
  process.exit(1);
}

const expectedFunctionNames = [
  "build_collaboration:listBuildCollaborationFeed",
  "build_collaboration_references:listBuildCollaborationTagOptions",
  "build_collaboration_notifications:getMyBuildCollaborationNotificationPreferences",
  "build_collaboration_drafts:listMyBuildCollaborationDrafts",
  "build_collaboration_rollout:getBuildCollaborationRolloutState",
  "build_collaboration_search:getBuildCollaborationSearchReadiness",
  "build_collaboration_lifecycle:getBuildCollaborationLifecycleState",
  "build_collaboration_retention:getBuildCollaborationRetentionState",
  "build_collaboration_moderation:getBuildCollaborationModerationContext",
  "build_collaboration_webhooks:listBuildCollaborationWebhookEndpoints",
  "build_collaboration_legacy_note_plan:previewBuildCollaborationLegacyNoteMigrationPage",
  "build_collaboration_legacy_note_parity:getBuildCollaborationLegacyNoteMigrationParityReport",
];

const adminKey = process.env.CONVEX_DEPLOY_KEY;
if (!adminKey) {
  console.error(
    "Convex function-registration check failed: CONVEX_DEPLOY_KEY is required on Vercel to inspect deployed function metadata."
  );
  process.exit(1);
}

const client = new ConvexHttpClient(deploymentUrl, { logger: false });
client.setAdminAuth(adminKey);

let deployedFunctions;
try {
  deployedFunctions = await client.query(
    makeFunctionReference("_system/cli/modules:apiSpec"),
    {}
  );
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(
    `Convex function-registration check failed for ${deploymentUrl}: ${message.split("\n")[0]}`
  );
  process.exit(1);
}

if (!Array.isArray(deployedFunctions)) {
  console.error(
    "Convex function-registration check failed: deployment metadata was not an array."
  );
  process.exit(1);
}

const functionMetadata = new Map(
  deployedFunctions
    .filter(
      (entry) =>
        entry &&
        typeof entry === "object" &&
        typeof entry.identifier === "string"
    )
    .map((entry) => [entry.identifier.replace(/\.js:/g, ":"), entry])
);
const missingPublicFunctions = expectedFunctionNames.filter((name) => {
  const metadata = functionMetadata.get(name);
  return !metadata || metadata.visibility?.kind !== "public";
});
const nonQueryFunctions = expectedFunctionNames.filter((name) => {
  const metadata = functionMetadata.get(name);
  return (
    metadata?.visibility?.kind === "public" && metadata.functionType !== "Query"
  );
});

if (missingPublicFunctions.length > 0 || nonQueryFunctions.length > 0) {
  console.error(
    `Convex function-registration check failed for ${deploymentUrl}.`
  );
  for (const functionName of missingPublicFunctions) {
    console.error(`- Missing public function: ${functionName}`);
  }
  for (const functionName of nonQueryFunctions) {
    console.error(`- Expected a public query: ${functionName}`);
  }
  process.exit(1);
}

console.log(
  `Convex function-registration check passed (${expectedFunctionNames.length} collaboration queries).`
);
