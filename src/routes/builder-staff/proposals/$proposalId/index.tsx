import { createFileRoute } from "@tanstack/react-router";

import {
  type BuilderProposalSearch,
  BuilderProductionProposalWorkspace,
} from "#/routes/builder/proposals/$proposalId/index.tsx";
import type { CalendarTimeframe } from "#/features/calendar-workspace/calendarTypes.ts";

export const Route = createFileRoute("/builder-staff/proposals/$proposalId/")({
  ssr: false,
  validateSearch: (search: Record<string, unknown>): BuilderProposalSearch => {
    const tab =
      search.tab === "calendar" ||
      search.tab === "contractors" ||
      search.tab === "gantt" ||
      search.tab === "materials" ||
      search.tab === "timeline"
        ? (search.tab as BuilderProposalSearch["tab"])
        : undefined;
    const timeframe =
      search.timeframe === "day" ||
      search.timeframe === "week" ||
      search.timeframe === "month" ||
      search.timeframe === "quarter" ||
      search.timeframe === "agenda"
        ? (search.timeframe as CalendarTimeframe)
        : undefined;
    return {
      ...(tab ? { tab } : {}),
      ...(timeframe ? { timeframe } : {}),
    };
  },
  component: BuilderStaffProposalRoute,
});

function BuilderStaffProposalRoute() {
  const { proposalId } = Route.useParams();
  const search = Route.useSearch();
  const context = Route.useRouteContext();
  return (
    <BuilderProductionProposalWorkspace
      includeStaffTab={false}
      proposalId={proposalId}
      routeBase="/builder-staff"
      search={search}
      workosOrganizationId={context.organizationId as string}
    />
  );
}
