import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { Loader2 } from "lucide-react";

import { BuilderTimelineDashboardSurface } from "#/features/builder-dashboard/BuilderTimelineDashboard.tsx";
import { toTimelineRows } from "#/features/production-proposals/ProductionProposalSurfaces.tsx";
import {
  getVisualParityKanban,
  isProductionVisualParityFixtureEnabled,
} from "#/features/production-proposals/visualParityFixtures.ts";
import { api } from "../../../convex/_generated/api";

export const Route = createFileRoute("/builder/")({
  ssr: false,
  component: BuilderProductionHomeRoute,
});

function BuilderProductionHomeRoute() {
  const context = Route.useRouteContext();
  const navigate = useNavigate();
  const workosOrganizationId = context.organizationId as string;
  const visualFixtureEnabled = isProductionVisualParityFixtureEnabled();
  const kanbanQuery = useQuery(
    api.production_proposals.listProposalKanban,
    visualFixtureEnabled ? "skip" : { workosOrganizationId },
  );
  const kanban = visualFixtureEnabled ? getVisualParityKanban() : kanbanQuery;

  if (!kanban) {
    return (
      <div className="grid min-h-[24rem] place-items-center">
        <div className="flex items-center gap-2 rounded-lg border bg-background p-4 text-sm">
          <Loader2 className="size-4 animate-spin" />
          Loading builder dashboard...
        </div>
      </div>
    );
  }

  return (
    <BuilderTimelineDashboardSurface
      chrome="embedded"
      onNavigate={(to, params) => {
        if (to === "/demo/timeline") {
          void navigate({ to: "/builder/proposals/new" });
          return;
        }
        if (params?.draftId) {
          void navigate({
            params: { proposalId: params.draftId },
            to: "/builder/proposals/$proposalId",
          });
          return;
        }
        if (params?.buildId) {
          void navigate({ to: "/builder/proposals" });
          return;
        }
        void navigate({ to: "/builder/proposals" });
      }}
      personaLabel="Production borrower"
      rows={toTimelineRows(kanban.columns.flatMap((column) => column.cards))}
    />
  );
}
