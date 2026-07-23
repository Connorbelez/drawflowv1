import { createFileRoute } from "@tanstack/react-router";

import { ConvexBorrowerDashboardRoute } from "#/features/build-workspace-demo/BorrowerDashboardRoute.tsx";

export const Route = createFileRoute("/demo/drawflow/active")({
  ssr: false,
  component: () => <ConvexBorrowerDashboardRoute mode="active" />,
});
