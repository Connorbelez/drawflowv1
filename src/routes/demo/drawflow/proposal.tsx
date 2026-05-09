import { createFileRoute } from "@tanstack/react-router";

import { ConvexBuildWorkspaceRoute } from "#/features/build-workspace-demo/ConvexBuildWorkspaceRoute.tsx";

export const Route = createFileRoute("/demo/drawflow/proposal")({
  ssr: false,
  component: () => <ConvexBuildWorkspaceRoute mode="proposal" />,
});
