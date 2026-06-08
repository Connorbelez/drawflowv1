import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { LifeBuoy, Loader2 } from "lucide-react";
import { useState } from "react";

import {
  BuilderTimelineDashboardSurface,
  type TimelinePlanRow,
} from "#/features/builder-dashboard/BuilderTimelineDashboard.tsx";
import { BuilderFirstRun } from "#/features/builder-onboarding/BuilderFirstRun.tsx";
import { resolveBuilderHomeView } from "#/features/builder-onboarding/onboarding-gate.ts";
import {
  Frame,
  FrameDescription,
  FramePanel,
  FrameTitle,
} from "#/components/ui/frame.tsx";
import {
  type ProductionKanban,
  toTimelineRows,
} from "#/features/production-proposals/ProductionProposalSurfaces.tsx";
import {
  getVisualParityKanban,
  isProductionVisualParityFixtureEnabled,
} from "#/features/production-proposals/visualParityFixtures.ts";
import { api } from "../../../convex/_generated/api";

export const Route = createFileRoute("/builder/")({
  ssr: false,
  component: BuilderProductionHomeRoute,
});

function BuilderProductionHomeRoute() {
  const context = Route.useRouteContext();
  return (
    <BuilderProductionHomeWorkspace
      routeBase="/builder"
      workosOrganizationId={context.organizationId as string}
    />
  );
}

export function BuilderProductionHomeWorkspace({
  routeBase,
  workosOrganizationId,
}: {
  routeBase: "/builder" | "/builder-staff";
  workosOrganizationId: string;
}) {
  const navigate = useNavigate();
  const isStaffWorkspace = routeBase === "/builder-staff";
  const visualFixtureEnabled = isProductionVisualParityFixtureEnabled();

  // First-run gating: a builder with a profile but no proposals (and who has
  // not dismissed) sees the welcome flow before the dashboard. Fixtures bypass.
  const onboardingQuery = useQuery(
    api.production_proposals.getBuilderOnboardingState,
    visualFixtureEnabled || isStaffWorkspace
      ? "skip"
      : { workosOrganizationId },
  );
  const [forceDashboard, setForceDashboard] = useState(false);

  const kanbanQuery = useQuery(
    api.production_proposals.listProposalKanban,
    visualFixtureEnabled || isStaffWorkspace
      ? "skip"
      : { workosOrganizationId },
  );
  const staffWorkspaceQuery = useQuery(
    api.production_proposals.listBuilderStaffWorkspace,
    visualFixtureEnabled || !isStaffWorkspace
      ? "skip"
      : { workosOrganizationId },
  );
  const kanban = visualFixtureEnabled ? getVisualParityKanban() : kanbanQuery;
  const rows: TimelinePlanRow[] = isStaffWorkspace
    ? [
        ...((staffWorkspaceQuery?.proposalRows ?? []) as TimelinePlanRow[]),
        ...((staffWorkspaceQuery?.activeBuildRows ?? []) as TimelinePlanRow[]),
      ]
    : toTimelineRows(
        (kanban as ProductionKanban | undefined)?.columns.flatMap(
          (column) => column.cards,
        ) ?? [],
      );

  const view = resolveBuilderHomeView({
    fixtureEnabled: visualFixtureEnabled,
    forceDashboard,
    state: isStaffWorkspace
      ? {
          complete: true,
          dismissed: true,
          hasProfile: true,
          hasProposals: true,
          isBuilder: true,
        }
      : onboardingQuery ?? undefined,
  });

  if (view === "loading") {
    return <BuilderHomeLoading />;
  }

  if (view === "first-run") {
    return (
      <BuilderFirstRun
        builderName={onboardingQuery?.builderProfile?.displayName ?? "builder"}
        onStart={() => {
          setForceDashboard(true);
          void navigate({ to: "/builder/proposals/new" });
        }}
        workosOrganizationId={workosOrganizationId}
      />
    );
  }

  if (view === "profile-pending") {
    return <BuilderProfilePending />;
  }

  if (
    (!isStaffWorkspace && !kanban) ||
    (isStaffWorkspace && !staffWorkspaceQuery)
  ) {
    return <BuilderHomeLoading />;
  }

  return (
    <BuilderTimelineDashboardSurface
      chrome="embedded"
      liveBuildRoute={`${routeBase}/builds/$buildId`}
      onNavigate={(to, params) => {
        if (to === "/demo/timeline") {
          void navigate({ to: "/builder/proposals/new" });
          return;
        }
        if (params?.draftId) {
          void navigate({
            params: { proposalId: params.draftId },
            to: `${routeBase}/proposals/$proposalId` as never,
          });
          return;
        }
        if (params?.buildId) {
          void navigate({
            params: { buildId: params.buildId },
            to: `${routeBase}/builds/$buildId` as never,
          });
          return;
        }
        void navigate({ to: `${routeBase}/proposals` as never });
      }}
      personaLabel={isStaffWorkspace ? "Builder staff" : "Production borrower"}
      rows={rows}
      showStartProposalAction={!isStaffWorkspace}
    />
  );
}

function BuilderHomeLoading() {
  return (
    <div className="grid min-h-[24rem] place-items-center">
      <div className="flex items-center gap-2 rounded-lg border bg-background p-4 text-sm">
        <Loader2 className="size-4 animate-spin" />
        Loading builder dashboard...
      </div>
    </div>
  );
}

function BuilderProfilePending() {
  return (
    <main className="grid min-h-[calc(100svh-1rem)] place-items-center bg-bg-base px-4 py-8">
      <Frame className="w-full max-w-lg">
        <FramePanel className="flex flex-col gap-4 p-6">
          <span className="grid size-10 place-items-center rounded-full bg-warning/16 text-warning-foreground">
            <LifeBuoy className="size-5" />
          </span>
          <div className="flex flex-col gap-1.5">
            <FrameTitle className="text-lg">
              Your builder workspace is almost ready
            </FrameTitle>
            <FrameDescription className="text-base">
              Your account is authenticated, but it isn&rsquo;t linked to a
              builder profile yet. Your brokerage finishes this in their
              backoffice. Once they do, your workspace and first build appear
              here automatically.
            </FrameDescription>
          </div>
          <p className="text-muted-foreground text-sm">
            Already expecting access? Ask your broker to confirm your builder
            profile in DrawFlow.
          </p>
        </FramePanel>
      </Frame>
    </main>
  );
}
