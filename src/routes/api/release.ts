import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/release")({
  server: {
    handlers: {
      GET: async ({ request }) => releaseMetadataResponse(request),
    },
  },
});

export function releaseMetadataResponse(
  request: Request,
  environment: Record<string, string | undefined> = process.env
) {
  const gitCommit =
    environment.VERCEL_GIT_COMMIT_SHA ??
    environment.BUILD_COLLABORATION_RELEASE_GIT_SHA;
  const applicationVersion =
    environment.VERCEL_DEPLOYMENT_ID ??
    environment.BUILD_COLLABORATION_RELEASE_APPLICATION_VERSION;
  if (!(gitCommit && applicationVersion)) {
    return Response.json(
      { error: "Release metadata is unavailable." },
      { status: 503 }
    );
  }
  return Response.json(
    {
      applicationUrl: new URL(request.url).origin,
      applicationVersion,
      gitCommit,
    },
    {
      headers: {
        "cache-control": "no-store, max-age=0",
      },
    }
  );
}
