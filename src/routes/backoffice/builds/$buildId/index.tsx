import { createFileRoute } from "@tanstack/react-router";

import { ConvexAdminBuildDashboardRoute } from "#/features/build-workspace-demo/AdminBuildDashboardRoute.tsx";

export const Route = createFileRoute("/backoffice/builds/$buildId/")({
  ssr: false,
  component: RouteComponent,
});

function RouteComponent() {
  const { buildId } = Route.useParams();
  const { milestone } = Route.useSearch();

  if (buildId !== "active-maple-ridge") {
    return (
      <main className="min-h-[calc(100vh-4rem)] bg-muted/30 p-4">
        <div className="rounded-lg border bg-card p-6">
          <p className="font-medium">Build detail unavailable</p>
          <p className="mt-1 text-muted-foreground text-sm">
            The reusable lender build workspace currently exists for
            active-maple-ridge.
          </p>
        </div>
      </main>
    );
  }

  return <ConvexAdminBuildDashboardRoute initialMilestoneId={milestone} />;
}
