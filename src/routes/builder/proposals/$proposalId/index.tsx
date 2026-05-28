import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { Loader2 } from "lucide-react";

import { ProductionTimelineWorkspace } from "#/features/production-proposals/ProductionTimelineWorkspace.tsx";
import {
  getVisualParityTimelineWorkspace,
  isProductionVisualParityFixtureEnabled,
} from "#/features/production-proposals/visualParityFixtures.ts";
import { api } from "../../../../../convex/_generated/api";
import type { Id } from "../../../../../convex/_generated/dataModel";

export const Route = createFileRoute("/builder/proposals/$proposalId/")({
  ssr: false,
  component: BuilderProductionProposalRoute,
});

function BuilderProductionProposalRoute() {
  const { proposalId } = Route.useParams();
  const context = Route.useRouteContext();
  const workosOrganizationId = context.organizationId as string;
  const visualFixtureEnabled = isProductionVisualParityFixtureEnabled();
  const typedProposalId = proposalId as Id<"buildProposals">;
  const workspaceQuery = useQuery(
    api.production_proposals.getProductionTimelineWorkspace,
    visualFixtureEnabled
      ? "skip"
      : {
          proposalId: typedProposalId,
          workosOrganizationId,
        },
  );
  const workspace = visualFixtureEnabled
    ? getVisualParityTimelineWorkspace(proposalId)
    : workspaceQuery;

  if (!workspace) {
    return (
      <div className="grid min-h-[24rem] place-items-center">
        <div className="flex items-center gap-2 rounded-lg border bg-background p-4 text-sm">
          <Loader2 className="size-4 animate-spin" />
          Loading production timeline...
        </div>
      </div>
    );
  }

  return (
    <ProductionTimelineWorkspace
      backofficeHref={`/backoffice/proposals/${proposalId}`}
      initialRole="builder"
      persistenceMode={visualFixtureEnabled ? "noop" : "convex"}
      proposalHref={`/builder/proposals/${proposalId}`}
      proposalId={typedProposalId}
      workspace={workspace}
      workosOrganizationId={workosOrganizationId}
    />
  );
}
