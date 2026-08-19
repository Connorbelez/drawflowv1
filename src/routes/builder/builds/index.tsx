import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { Loader2 } from "lucide-react";

import {
  BuilderLiveBuildListSurface,
  type TimelinePlanRow,
} from "#/features/builder-dashboard/BuilderTimelineDashboard.tsx";
import {
  type ProductionKanbanCard,
  toTimelineRows,
} from "#/features/production-proposals/ProductionProposalSurfaces.tsx";
import {
  getVisualParityKanban,
  isProductionVisualParityFixtureEnabled,
} from "#/features/production-proposals/visualParityFixtures.ts";
import { Frame, FramePanel } from "#/components/ui/frame.tsx";
import { api } from "../../../../convex/_generated/api";

export const Route = createFileRoute("/builder/builds/")({
  ssr: false,
  component: BuilderBuildsRoute,
});

function BuilderBuildsRoute() {
  const context = Route.useRouteContext();
  const navigate = useNavigate();
  const visualFixtureEnabled = isProductionVisualParityFixtureEnabled();
  const kanbanQuery = useQuery(
    api.production_proposals.listProposalKanban,
    visualFixtureEnabled
      ? "skip"
      : { workosOrganizationId: context.organizationId as string },
  );
  const kanban = visualFixtureEnabled ? getVisualParityKanban() : kanbanQuery;

  if (!kanban) {
    return (
      <Frame className="mx-auto mt-6 max-w-6xl">
        <FramePanel
          aria-live="polite"
          className="flex items-center gap-3 p-5"
          role="status"
        >
          <Loader2 className="size-4 animate-spin motion-reduce:animate-none" />
          Loading assigned live builds...
        </FramePanel>
      </Frame>
    );
  }

  return (
    <BuilderLiveBuildListSurface
      liveBuildRoute="/builder/builds/$buildId"
      onNavigate={(_to, params) => {
        if (params?.buildId) {
          void navigate({
            params: { buildId: params.buildId },
            to: "/builder/builds/$buildId",
          });
        }
      }}
      rows={toTimelineRows(
        kanban.columns.flatMap(
          (column: { cards: ProductionKanbanCard[] }) => column.cards,
        ),
      ) as TimelinePlanRow[]}
      showStartProposalAction={false}
    />
  );
}
