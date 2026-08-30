import { createFileRoute } from "@tanstack/react-router";

import { normalizeBuildCollaborationFocus } from "#/features/build-collaboration/referenceFocus.ts";
import type { CalendarTimeframe } from "#/features/calendar-workspace/calendarTypes.ts";
import {
  type BuildSubmilestoneDetailTab,
  normalizeBuildSubmilestoneDetailTab,
} from "#/features/build-detail-targets/buildDetailTab.ts";
import type { MilestonePrototypeVariant } from "#/features/backoffice-build-detail/MilestoneExecutionSheet.prototype.tsx";
import type { MilestoneStartPrototypeVariant } from "#/features/backoffice-build-detail/MilestoneStartWorkflow.prototype.tsx";
import { normalizeCostDocumentSearch } from "#/features/cost-documents/costDocumentRouteState.ts";
import { BuilderBuildWorkspaceRoute } from "./-build-workspace.tsx";
export {
  BuilderBuildWorkspaceRoute,
  createBuildAvailabilityReference,
} from "./-build-workspace.tsx";

export interface BuilderBuildSearch {
  costBatch?: string;
  costDocument?: string;
  costDocumentDraft?: string;
  detailTab?: BuildSubmilestoneDetailTab;
  focus?: string;
  milestone?: string;
  rail?: "open" | "closed";
  tab?:
    | "calendar"
    | "contractors"
    | "costs"
    | "details"
    | "documents"
    | "evidence"
    | "gantt"
    | "materials"
    | "milestones"
    | "quotes"
    | "staff"
    | "timeline";
  timeframe?: CalendarTimeframe;
  variant?: MilestonePrototypeVariant | MilestoneStartPrototypeVariant;
}

export const Route = createFileRoute("/builder/builds/$buildId/")({
  validateSearch: (search: Record<string, unknown>): BuilderBuildSearch => {
    const costDocumentSearch = normalizeCostDocumentSearch(search);
    const tab =
      search.tab === "timeline" ||
      search.tab === "costs" ||
      search.tab === "documents" ||
      search.tab === "evidence" ||
      search.tab === "contractors" ||
      search.tab === "milestones" ||
      search.tab === "materials" ||
      search.tab === "quotes" ||
      search.tab === "staff" ||
      search.tab === "calendar" ||
      search.tab === "gantt" ||
      search.tab === "details"
        ? (search.tab as BuilderBuildSearch["tab"])
        : undefined;
    const milestone =
      typeof search.milestone === "string" ? search.milestone : undefined;
    const focus = normalizeBuildCollaborationFocus(search.focus);
    const detailTab = normalizeBuildSubmilestoneDetailTab(search.detailTab);
    const variant =
      search.variant === "ledger" ||
      search.variant === "console" ||
      search.variant === "field-walk" ||
      search.variant === "start-dialog" ||
      search.variant === "start-context" ||
      search.variant === "start-guided"
        ? (search.variant as BuilderBuildSearch["variant"])
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
      ...costDocumentSearch,
      ...(detailTab ? { detailTab } : {}),
      ...(focus ? { focus } : {}),
      ...(timeframe ? { timeframe } : {}),
      ...(milestone ? { milestone } : {}),
      ...(rail ? { rail } : {}),
      ...(tab ? { tab } : {}),
      ...(variant ? { variant } : {}),
    };
  },
  component: BuilderBuildRoute,
});

function BuilderBuildRoute() {
  const { buildId } = Route.useParams();
  const context = Route.useRouteContext();
  const search = Route.useSearch();
  return (
    <BuilderBuildWorkspaceRoute
      buildId={buildId}
      enableContractorLinks
      includeStaffTab
      routeBase="/builder"
      search={search}
      viewerRoles={[context.role, ...(context.roles ?? [])]}
      workosOrganizationId={context.organizationId as string}
    />
  );
}
