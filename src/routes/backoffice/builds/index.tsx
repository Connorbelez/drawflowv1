import { createFileRoute } from "@tanstack/react-router";
import { usePaginatedQuery, useQuery } from "convex/react";
import { useDeferredValue, useState } from "react";

import { BuildRosterSurface } from "#/features/backoffice-builds/BuildRosterSurface.tsx";
import type {
  BackofficeBuildRosterSortState,
  BuildRosterPhase,
} from "#/features/backoffice-builds/build-roster-types.ts";

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
  const [search, setSearch] = useState("");
  const [phase, setPhase] = useState<"all" | BuildRosterPhase>("all");
  const [sort, setSort] = useState<BackofficeBuildRosterSortState>({
    desc: true,
    id: "updatedAt",
  });
  const deferredSearch = useDeferredValue(search);
  const roster = usePaginatedQuery(
    api.production_proposals.listBackofficeBuildRosterPage,
    {
      phase: phase === "all" ? undefined : phase,
      search: deferredSearch.trim() || undefined,
      sortBy: sort.id,
      sortDirection: sort.desc ? "desc" : "asc",
      workosOrganizationId,
    },
    { initialNumItems: 15 }
  );
  const summary = useQuery(
    api.production_proposals.getBackofficeBuildRosterSummary,
    roster.status === "LoadingFirstPage" ? "skip" : { workosOrganizationId }
  );

  return (
    <BuildRosterSurface
      canLoadMore={
        roster.status === "CanLoadMore" || roster.status === "LoadingMore"
      }
      loadingMore={roster.status === "LoadingMore"}
      onLoadMore={roster.loadMore}
      onPhaseChange={setPhase}
      onSearchChange={setSearch}
      onSortChange={setSort}
      pending={
        roster.status === "LoadingFirstPage" || search !== deferredSearch
      }
      phase={phase}
      rows={roster.results}
      search={search}
      sort={sort}
      summary={summary}
    />
  );
}
