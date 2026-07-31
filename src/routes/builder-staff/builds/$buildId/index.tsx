import { createFileRoute } from "@tanstack/react-router";
import { normalizeBuildCollaborationFocus } from "#/features/build-collaboration/referenceFocus.ts";
import type { CalendarTimeframe } from "#/features/calendar-workspace/calendarTypes.ts";
import {
  isQuoteRequestsPrototypeScenario,
  QUOTE_REQUESTS_PROTOTYPE_VARIANT,
} from "#/features/quote-solicitation/QuoteRequestsWorkspace.prototype.tsx";
import {
  type BuilderBuildSearch,
  BuilderBuildWorkspaceRoute,
} from "#/routes/builder/builds/$buildId/index.tsx";

export const Route = createFileRoute("/builder-staff/builds/$buildId/")({
  validateSearch: (search: Record<string, unknown>): BuilderBuildSearch => {
    const tab =
      search.tab === "timeline" ||
      search.tab === "documents" ||
      search.tab === "evidence" ||
      search.tab === "contractors" ||
      search.tab === "milestones" ||
      search.tab === "materials" ||
      search.tab === "quotes" ||
      search.tab === "calendar" ||
      search.tab === "gantt" ||
      search.tab === "details"
        ? (search.tab as BuilderBuildSearch["tab"])
        : undefined;
    const milestone =
      typeof search.milestone === "string" ? search.milestone : undefined;
    const focus = normalizeBuildCollaborationFocus(search.focus);
    const scenario = isQuoteRequestsPrototypeScenario(search.scenario)
      ? search.scenario
      : undefined;
    const variant =
      search.variant === QUOTE_REQUESTS_PROTOTYPE_VARIANT
        ? search.variant
        : undefined;
    const rail =
      search.rail === "closed" || search.rail === "open"
        ? (search.rail as BuilderBuildSearch["rail"])
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
      ...(focus ? { focus } : {}),
      ...(timeframe ? { timeframe } : {}),
      ...(milestone ? { milestone } : {}),
      ...(rail ? { rail } : {}),
      ...(scenario ? { scenario } : {}),
      ...(tab ? { tab } : {}),
      ...(variant ? { variant } : {}),
    };
  },
  component: BuilderStaffBuildRoute,
});

function BuilderStaffBuildRoute() {
  const { buildId } = Route.useParams();
  const context = Route.useRouteContext();
  const search = Route.useSearch();
  return (
    <BuilderBuildWorkspaceRoute
      buildId={buildId}
      enableContractorLinks={false}
      includeStaffTab={false}
      routeBase="/builder-staff"
      search={search}
      workosOrganizationId={context.organizationId as string}
    />
  );
}
