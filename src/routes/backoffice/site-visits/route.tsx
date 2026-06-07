import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery } from "convex/react";
import { useCallback } from "react";

import { SiteVisitControlRoom } from "#/features/backoffice-site-visits/site-visit-control-room.tsx";
import type { BrokerageSiteVisitsResult } from "#/features/backoffice-site-visits/site-visit-types.ts";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";

export const Route = createFileRoute("/backoffice/site-visits")({
  staticData: {
    breadcrumb: {
      label: "Site Visits",
      to: "/backoffice/site-visits",
    },
  },
  component: RouteComponent,
});

function RouteComponent() {
  const context = Route.useRouteContext();
  const workosOrganizationId = context.organizationId as string;
  const siteVisits = useQuery(api.production_proposals.listBrokerageSiteVisits, {
    workosOrganizationId,
  }) as BrokerageSiteVisitsResult | undefined;
  const cancelSiteVisit = useMutation(
    api.production_proposals.cancelActiveBuildSiteVisit,
  );

  const onCancelVisit = useCallback(
    async (input: { buildId: string; reason: string; visitId: string }) => {
      await cancelSiteVisit({
        buildId: input.buildId as Id<"activeBuilds">,
        reason: input.reason,
        visitId: input.visitId,
        workosOrganizationId,
      });
    },
    [cancelSiteVisit, workosOrganizationId],
  );

  return (
    <SiteVisitControlRoom
      data={siteVisits}
      onCancelVisit={onCancelVisit}
      pending={siteVisits === undefined}
    />
  );
}
