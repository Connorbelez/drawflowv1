import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { Frame, FramePanel } from "#/components/ui/frame.tsx";
import { BuildCollaborationWorkspace } from "#/features/build-collaboration/BuildCollaborationWorkspace.tsx";
import { normalizeBuildCollaborationFocus } from "#/features/build-collaboration/referenceFocus.ts";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";

interface HomeownerBuildSearch {
  focus?: string;
}

export const Route = createFileRoute("/homeowner/builds/$buildId")({
  component: HomeownerBuildCollaboration,
  staticData: {
    breadcrumb: {
      label: "Build collaboration",
      to: "/homeowner",
    },
  },
  validateSearch: (search: Record<string, unknown>): HomeownerBuildSearch => {
    const focus = normalizeBuildCollaborationFocus(search.focus);
    return focus ? { focus } : {};
  },
});

export function HomeownerBuildCollaboration() {
  const { buildId } = Route.useParams();
  const { focus } = Route.useSearch();
  const scope = useQuery(api.build_participants.getMyBuildParticipationScope, {
    buildId: buildId as Id<"activeBuilds">,
  });

  if (scope === undefined) {
    return (
      <main className="p-4 sm:p-6">
        <Frame className="mx-auto w-full max-w-6xl">
          <FramePanel className="animate-pulse text-muted-foreground text-sm">
            Loading Build collaboration…
          </FramePanel>
        </Frame>
      </main>
    );
  }

  return (
    <main className="p-4 sm:p-6">
      <div className="mx-auto w-full max-w-6xl space-y-4">
        <header>
          <p className="text-muted-foreground text-xs uppercase">
            Active build
          </p>
          <h1 className="mt-1 font-semibold text-2xl">{scope.buildName}</h1>
          <p className="mt-1 text-muted-foreground text-sm">
            Build collaboration
          </p>
        </header>
        <BuildCollaborationWorkspace
          buildId={buildId}
          focusedReference={focus}
          organizationId={scope.organizationId}
        />
      </div>
    </main>
  );
}
