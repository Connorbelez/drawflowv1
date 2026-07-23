import { createFileRoute } from "@tanstack/react-router";

import { ConvexAdminBuildDashboardRoute } from "#/features/build-workspace-demo/AdminBuildDashboardRoute.tsx";

export const Route = createFileRoute("/demo/drawflow/admin-build-dashboard")({
  ssr: false,
  component: ConvexAdminBuildDashboardRoute,
});
