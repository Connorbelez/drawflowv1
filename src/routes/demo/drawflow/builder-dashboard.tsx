import { createFileRoute } from "@tanstack/react-router";

import { BuilderDashboardRoute } from "#/features/builder-proposal-demo/BuilderProposalDemo.tsx";

export const Route = createFileRoute("/demo/drawflow/builder-dashboard")({
  ssr: false,
  component: BuilderDashboardRoute,
});
