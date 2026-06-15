import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { Loader2 } from "lucide-react";

import { Button } from "#/components/ui/button.tsx";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "#/components/ui/card.tsx";
import { TimelineWorkspace } from "#/features/timeline-workspace";
import { convexWorkspaceToTimelineState } from "#/features/timeline-workspace/-timeline-convex-adapter";
import { api } from "../../../../../../convex/_generated/api";
import { MOCK_BUILDER_PERSONA } from "../../../../../../convex/demo_personas";

export const Route = createFileRoute("/builder/demo/dashboard/builds/$buildId")(
  {
    ssr: false,
    component: BuilderLiveBuildWorkspaceRoute,
  }
);

function BuilderLiveBuildWorkspaceRoute() {
  const { buildId } = Route.useParams();
  const navigate = useNavigate();
  const workspace = useQuery(
    api.demo_timeline_plans.demo_getBuilderLiveTimelineWorkspaceByBuildKey,
    { buildKey: buildId, persona: MOCK_BUILDER_PERSONA }
  );

  if (workspace === undefined) {
    return (
      <div className="grid min-h-[24rem] place-items-center">
        <div className="flex items-center gap-2 rounded-lg border bg-background p-4 text-sm">
          <Loader2 className="size-4 animate-spin" />
          Loading live build...
        </div>
      </div>
    );
  }

  if (workspace === null) {
    return (
      <div className="grid min-h-[24rem] place-items-center">
        <Card className="w-full max-w-lg">
          <CardHeader>
            <CardTitle>Live build not available</CardTitle>
            <CardDescription>
              This build key is unknown, not approved, or not owned by the
              builder persona.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              onClick={() =>
                void navigate({ to: "/builder/demo/dashboard/builds" })
              }
              variant="outline"
            >
              Back to live builds
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <TimelineWorkspace
      durableMeta={{
        backofficeHref: "/builder/demo/dashboard",
        proposalHref: `/builder/demo/dashboard/proposals/${workspace.plan._id}`,
        proposalSlug: workspace.plan.proposalSlug,
        status: workspace.plan.status,
      }}
      durablePlanId={workspace.plan._id}
      initialRole="builder"
      initialState={convexWorkspaceToTimelineState(workspace)}
      modificationRequests={workspace.modificationRequests}
      workspaceMode="demo"
    />
  );
}
