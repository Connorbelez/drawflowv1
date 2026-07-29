import { ConvexHttpClient } from "convex/browser";
import { makeFunctionReference } from "convex/server";

const skipOutsideVercel =
  process.argv.includes("--if-vercel") && process.env.VERCEL !== "1";

if (skipOutsideVercel) {
  console.log("Convex deployment parity check skipped outside Vercel.");
  process.exit(0);
}

const deploymentUrl = process.env.VITE_CONVEX_URL;
if (!deploymentUrl) {
  console.error(
    "Convex deployment parity check failed: VITE_CONVEX_URL is not configured."
  );
  process.exit(1);
}

const probes = [
  {
    args: {
      buildId: "__deployment_parity_probe__",
      organizationId: "__deployment_parity_probe__",
      paginationOpts: { cursor: null, numItems: 1 },
    },
    name: "build_collaboration:listBuildCollaborationFeed",
  },
  {
    args: {
      buildId: "__deployment_parity_probe__",
      organizationId: "__deployment_parity_probe__",
    },
    name: "build_collaboration_references:listBuildCollaborationTagOptions",
  },
  {
    args: {
      buildId: "__deployment_parity_probe__",
      organizationId: "__deployment_parity_probe__",
    },
    name: "build_collaboration_notifications:getMyBuildCollaborationNotificationPreferences",
  },
  {
    args: {
      buildId: "__deployment_parity_probe__",
      organizationId: "__deployment_parity_probe__",
    },
    name: "build_collaboration_drafts:listMyBuildCollaborationDrafts",
  },
];

const client = new ConvexHttpClient(deploymentUrl);
const missingFunctions = [];
const verificationFailures = [];

await Promise.all(
  probes.map(async ({ args, name }) => {
    try {
      await client.query(makeFunctionReference(name), args);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes("Could not find public function")) {
        missingFunctions.push(name);
        return;
      }
      if (message.includes("ArgumentValidationError")) {
        return;
      }
      verificationFailures.push(`${name}: ${message.split("\n")[0]}`);
    }
  })
);

if (missingFunctions.length > 0 || verificationFailures.length > 0) {
  console.error(`Convex deployment parity check failed for ${deploymentUrl}.`);
  for (const functionName of missingFunctions) {
    console.error(`- Missing public function: ${functionName}`);
  }
  for (const failure of verificationFailures) {
    console.error(`- Could not verify ${failure}`);
  }
  process.exit(1);
}

console.log(
  `Convex deployment parity check passed (${probes.length} collaboration queries).`
);
