import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { Loader2 } from "lucide-react";

import {
  BuilderLiveBuildListSurface,
  type TimelinePlanRow,
} from "#/features/builder-dashboard/BuilderTimelineDashboard.tsx";
import { api } from "../../../../convex/_generated/api";

export const Route = createFileRoute("/builder-staff/builds/")({
  ssr: false,
  component: BuilderStaffBuildsRoute,
});

function BuilderStaffBuildsRoute() {
  const context = Route.useRouteContext();
  const navigate = useNavigate();
  const workosOrganizationId = context.organizationId as string;
  const staffWorkspace = useQuery(
    api.production_proposals.listBuilderStaffWorkspace,
    { workosOrganizationId },
  );

  if (!staffWorkspace) {
    return (
      <div className="grid min-h-[24rem] place-items-center">
        <div className="flex items-center gap-2 rounded-lg border bg-background p-4 text-sm">
          <Loader2 className="size-4 animate-spin" />
          Loading assigned live builds...
        </div>
      </div>
    );
  }

  return (
    <BuilderLiveBuildListSurface
      liveBuildRoute="/builder-staff/builds/$buildId"
      onNavigate={(_to, params) => {
        if (params?.buildId) {
          void navigate({
            params: { buildId: params.buildId },
            to: "/builder-staff/builds/$buildId",
          });
        }
      }}
      rows={staffWorkspace.activeBuildRows as TimelinePlanRow[]}
      showStartProposalAction={false}
    />
  );
}
