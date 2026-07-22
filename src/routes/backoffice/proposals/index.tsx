import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery } from "convex/react";
import { Loader2 } from "lucide-react";

import { ProductionProposalKanbanSurface } from "#/features/production-proposals/ProductionProposalSurfaces.tsx";
import {
  getVisualParityKanban,
  isProductionVisualParityFixtureEnabled,
} from "#/features/production-proposals/visualParityFixtures.ts";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";

export const Route = createFileRoute("/backoffice/proposals/")({
  ssr: false,
  component: BackofficeProductionProposalsRoute,
});

function BackofficeProductionProposalsRoute() {
  const context = Route.useRouteContext();
  const navigate = useNavigate();
  const workosOrganizationId = context.organizationId as string;
  const visualFixtureEnabled = isProductionVisualParityFixtureEnabled();
  const kanbanQuery = useQuery(
    api.production_proposals.listProposalKanban,
    visualFixtureEnabled ? "skip" : { workosOrganizationId }
  );
  const buildersQuery = useQuery(
    api.production_proposals.listBrokerageBuilders,
    visualFixtureEnabled ? "skip" : { workosOrganizationId }
  );
  const assignDraftBuilder = useMutation(
    api.production_proposals.assignDraftBuilder
  );
  const deleteDraftProposal = useMutation(
    api.production_proposals.deleteDraftProposal
  );
  const kanban = visualFixtureEnabled ? getVisualParityKanban() : kanbanQuery;

  if (!kanban) {
    return (
      <div className="grid min-h-[24rem] place-items-center">
        <div className="flex items-center gap-2 rounded-lg border bg-background p-4 text-sm">
          <Loader2 className="size-4 animate-spin" />
          Loading production proposal kanban...
        </div>
      </div>
    );
  }

  return (
    <ProductionProposalKanbanSurface
      builders={buildersQuery ?? []}
      kanban={kanban}
      onAssignBuilder={
        visualFixtureEnabled
          ? undefined
          : async (card, builderProfileId) => {
              await assignDraftBuilder({
                builderProfileId: builderProfileId as Id<"builderProfiles">,
                proposalId: card.proposalId as Id<"buildProposals">,
                workosOrganizationId,
              });
            }
      }
      onDeleteDraft={
        visualFixtureEnabled
          ? undefined
          : async (card) => {
              await deleteDraftProposal({
                proposalId: card.proposalId as Id<"buildProposals">,
                workosOrganizationId,
              });
            }
      }
      onOpen={(card) =>
        void navigate({
          params: { planId: card.proposalId },
          to: "/backoffice/proposals/$planId",
        })
      }
    />
  );
}
