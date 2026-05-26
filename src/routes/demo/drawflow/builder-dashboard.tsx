import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "convex/react";

import {
  BuilderLiveBuildListSurface,
  BuilderProposalListSurface,
  BuilderTimelineDashboardSurface,
  PlanStatusBadge,
} from "#/features/builder-dashboard/BuilderTimelineDashboard.tsx";
import { api } from "../../../../convex/_generated/api";
import { MOCK_BUILDER_PERSONA } from "../../../../convex/demo_personas";

export {
  BuilderLiveBuildListSurface,
  BuilderProposalListSurface,
  BuilderTimelineDashboardSurface,
  PlanStatusBadge,
};

export const Route = createFileRoute("/demo/drawflow/builder-dashboard")({
  ssr: false,
  component: BuilderTimelineDashboardRoute,
});

function BuilderTimelineDashboardRoute() {
  const navigate = useNavigate();
  const rows =
    useQuery(api.demo_timeline_plans.demo_listBuilderTimelinePlans, {
      persona: MOCK_BUILDER_PERSONA,
    }) ?? [];

  return (
    <BuilderTimelineDashboardSurface
      onNavigate={(to, params) => void navigate({ params, to } as never)}
      rows={rows}
      showBuilderShellAction
    />
  );
}
