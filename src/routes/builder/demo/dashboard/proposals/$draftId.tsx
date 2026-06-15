import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { Loader2 } from "lucide-react";
import { TimelineWorkspace } from "#/features/timeline-workspace";
import { convexWorkspaceToTimelineState } from "#/features/timeline-workspace/-timeline-convex-adapter";
import { api } from "../../../../../../convex/_generated/api";

export const Route = createFileRoute(
  "/builder/demo/dashboard/proposals/$draftId"
)({
  ssr: false,
  component: BuilderProposalWorkspaceRoute,
});

function BuilderProposalWorkspaceRoute() {
  const { draftId } = Route.useParams();
  const workspace = useQuery(
    api.demo_timeline_plans.demo_getTimelinePlanWorkspace,
    { planId: draftId }
  );

  if (workspace === undefined) {
    return (
      <div className="grid min-h-[24rem] place-items-center">
        <div className="flex items-center gap-2 rounded-lg border bg-background p-4 text-sm">
          <Loader2 className="size-4 animate-spin" />
          Loading proposal workspace...
        </div>
      </div>
    );
  }

  return (
    <TimelineWorkspace
      durableMeta={{
        backofficeHref: "/builder/demo/dashboard",
        proposalHref: `/builder/demo/dashboard/proposals/${draftId}`,
        proposalSlug: workspace.plan.proposalSlug,
        status: workspace.plan.status,
      }}
      durablePlanId={draftId}
      initialRole="builder"
      initialState={convexWorkspaceToTimelineState(workspace)}
      modificationRequests={workspace.modificationRequests}
      workspaceMode="demo"
    />
  );
}
