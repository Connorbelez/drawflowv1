import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "convex/react";

import { BuilderLiveBuildListSurface } from "#/features/builder-dashboard/BuilderTimelineDashboard.tsx";
import { api } from "../../../../../../convex/_generated/api";
import { MOCK_BUILDER_PERSONA } from "../../../../../../convex/demo_personas";

export const Route = createFileRoute("/builder/demo/dashboard/builds/")({
  ssr: false,
  component: BuilderLiveBuildsRoute,
});

function BuilderLiveBuildsRoute() {
  const navigate = useNavigate();
  const rows =
    useQuery(api.demo_timeline_plans.demo_listBuilderTimelinePlans, {
      persona: MOCK_BUILDER_PERSONA,
    }) ?? [];

  return (
    <BuilderLiveBuildListSurface
      onNavigate={(to, params) => void navigate({ params, to } as never)}
      rows={rows}
    />
  );
}
