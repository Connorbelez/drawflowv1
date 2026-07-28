import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "convex/react";

import { BuildRosterSurface } from "#/features/backoffice-builds/BuildRosterSurface.tsx";
import type { BackofficeBuildRosterResult } from "#/features/backoffice-builds/build-roster-types.ts";

import { api } from "../../../../convex/_generated/api";

export const Route = createFileRoute("/backoffice/builds/")({
  staticData: {
    breadcrumb: {
      label: "Builds",
      to: "/backoffice/builds",
    },
  },
  component: BuildsIndexRoute,
});

function BuildsIndexRoute() {
  const context = Route.useRouteContext();
  const workosOrganizationId = context.organizationId as string;
  const roster = useQuery(api.production_proposals.listBackofficeBuildRoster, {
    workosOrganizationId,
  }) as BackofficeBuildRosterResult | undefined;

  return <BuildRosterSurface pending={roster === undefined} roster={roster} />;
}
