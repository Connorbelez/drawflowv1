import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "convex/react";

import { Card, CardContent, CardHeader, CardTitle } from "#/components/ui/card.tsx";
import { Frame, FramePanel } from "#/components/ui/frame.tsx";
import { BuildDetailRoute } from "#/features/backoffice-build-detail/BuildDetailRoute.tsx";
import { api } from "../../../../../convex/_generated/api";

export const Route = createFileRoute("/backoffice/builds/$buildId/")({
  ssr: false,
  component: RouteComponent,
});

function RouteComponent() {
  const { buildId } = Route.useParams();
  const context = Route.useRouteContext();
  const search = Route.useSearch();
  const navigate = useNavigate();
  const productionBuild = useQuery(
    api.production_proposals.getActiveBuildDetailByString,
    {
      buildId,
      workosOrganizationId: context.organizationId as string,
    },
  );

  if (productionBuild === undefined) {
    return (
      <main className="grid min-h-[24rem] place-items-center bg-muted/30">
        <div className="rounded-lg border bg-background p-4 text-sm">
          Loading build detail...
        </div>
      </main>
    );
  }

  if (productionBuild) {
    return (
      <main className="flex min-h-[calc(100vh-4rem)] flex-col gap-4 bg-muted/30 p-3 md:p-5">
        <Frame>
          <FramePanel className="p-4">
            <h1 className="font-semibold text-2xl tracking-tight">
              {productionBuild.build.buildName}
            </h1>
            <p className="mt-1 text-muted-foreground text-sm">
              Active build starts {productionBuild.build.startDate}; interest
              begins only after funds are released.
            </p>
          </FramePanel>
        </Frame>
        <div className="grid gap-4 lg:grid-cols-3">
          <Card>
            <CardHeader>
              <CardTitle>Loan facility</CardTitle>
            </CardHeader>
            <CardContent className="text-sm">
              Principal:{" "}
              {formatCents(productionBuild.loanFacility?.principalCents ?? 0)}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Milestones</CardTitle>
            </CardHeader>
            <CardContent className="text-sm">
              {productionBuild.milestones.length} copied from proposal
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Planned draws</CardTitle>
            </CardHeader>
            <CardContent className="text-sm">
              {productionBuild.draws.length} reimbursement rows
            </CardContent>
          </Card>
        </div>
      </main>
    );
  }

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

function formatCents(cents: number) {
  return new Intl.NumberFormat("en-US", {
    currency: "USD",
    maximumFractionDigits: 0,
    style: "currency",
  }).format(cents / 100);
}
