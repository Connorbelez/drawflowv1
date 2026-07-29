import { createFileRoute } from "@tanstack/react-router";

import { BuildCollaborationWorkspace } from "#/features/build-collaboration/BuildCollaborationWorkspace.tsx";
import { normalizeBuildCollaborationFocus } from "#/features/build-collaboration/referenceFocus.ts";

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
  const { organizationId } = Route.useRouteContext();
  const { focus } = Route.useSearch();

  return (
    <main className="p-4 sm:p-6">
      <div className="mx-auto w-full max-w-6xl space-y-4">
        <header>
          <p className="text-muted-foreground text-xs uppercase">
            Active build
          </p>
          <h1 className="mt-1 font-semibold text-2xl">Build collaboration</h1>
        </header>
        <BuildCollaborationWorkspace
          buildId={buildId}
          focusedReference={focus}
          organizationId={organizationId ?? undefined}
        />
      </div>
    </main>
  );
}
