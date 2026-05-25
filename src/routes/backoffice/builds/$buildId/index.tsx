import { createFileRoute, useNavigate } from "@tanstack/react-router";

import { BuildDetailRoute } from "#/features/backoffice-build-detail/BuildDetailRoute.tsx";

export const Route = createFileRoute("/backoffice/builds/$buildId/")({
  ssr: false,
  component: RouteComponent,
});

function RouteComponent() {
  const { buildId } = Route.useParams();
  const search = Route.useSearch();
  const navigate = useNavigate();

  return (
    <BuildDetailRoute
      buildKey={buildId}
      initialMilestoneId={search.milestone}
      onChangeRail={(rail) =>
        navigate({
          to: "/backoffice/builds/$buildId",
          params: { buildId },
          search: (prev) => ({ ...prev, rail }),
          replace: true,
        })
      }
      onChangeTab={(tab) =>
        navigate({
          to: "/backoffice/builds/$buildId",
          params: { buildId },
          search: (prev) => ({ ...prev, tab }),
          replace: true,
        })
      }
      rail={search.rail}
      tab={search.tab}
    />
  );
}
