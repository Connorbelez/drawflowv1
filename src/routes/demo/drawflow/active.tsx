import { createFileRoute } from "@tanstack/react-router";

import { ConvexBuildWorkspaceRoute } from "#/features/build-workspace-demo/ConvexBuildWorkspaceRoute.tsx";

export const Route = createFileRoute("/demo/drawflow/active")({
  ssr: false,
  component: () => <ConvexBuildWorkspaceRoute mode="active" />,
});
