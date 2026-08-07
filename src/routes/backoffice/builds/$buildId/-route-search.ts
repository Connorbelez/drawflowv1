import type { BuildDetailSubTab } from "#/features/backoffice-build-detail/BuildDetailTabs.tsx";
import { normalizeBuildCollaborationFocus } from "#/features/build-collaboration/referenceFocus.ts";
import type { CalendarTimeframe } from "#/features/calendar-workspace/calendarTypes.ts";
import {
  type CostDocumentRouteSearch,
  normalizeCostDocumentSearch,
} from "#/features/cost-documents/costDocumentRouteState.ts";

export interface BuildDetailSearch extends CostDocumentRouteSearch {
  focus?: string;
  milestone?: string;
  rail?: "open" | "closed";
  roundId?: string;
  tab?: BuildDetailSubTab;
  timeframe?: CalendarTimeframe;
}

export function validateBuildDetailSearch(
  search: Record<string, unknown>
): BuildDetailSearch {
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
      ? (search.tab as BuildDetailSearch["tab"])
      : undefined;
  const milestone =
    typeof search.milestone === "string" ? search.milestone : undefined;
  const roundId =
    typeof search.roundId === "string" && search.roundId.trim()
      ? search.roundId.trim()
      : undefined;
  const focus = normalizeBuildCollaborationFocus(search.focus);
  const rail =
    search.rail === "closed" || search.rail === "open"
      ? (search.rail as BuildDetailSearch["rail"])
      : undefined;
  const timeframe =
    search.timeframe === "day" ||
    search.timeframe === "week" ||
    search.timeframe === "month" ||
    search.timeframe === "quarter" ||
    search.timeframe === "agenda"
      ? (search.timeframe as CalendarTimeframe)
      : undefined;
  const costWorkspaceActive = Boolean(
    costDocumentSearch.costBatch ||
      costDocumentSearch.costDocument ||
      costDocumentSearch.costDocumentDraft
  );
  const out: BuildDetailSearch = {};
  if (focus !== undefined) {
    out.focus = focus;
  }
  if (milestone !== undefined) {
    out.milestone = milestone;
  }
  if (
    tab !== undefined ||
    costDocumentSearch.costBatch !== undefined ||
    costDocumentSearch.costDocument !== undefined ||
    costDocumentSearch.costDocumentDraft !== undefined ||
    roundId !== undefined
  ) {
    out.tab = roundId ? "quotes" : costWorkspaceActive ? "costs" : tab;
  }
  if (costDocumentSearch.costBatch !== undefined) {
    out.costBatch = costDocumentSearch.costBatch;
  }
  if (costDocumentSearch.costDocument !== undefined) {
    out.costDocument = costDocumentSearch.costDocument;
  }
  if (costDocumentSearch.costDocumentDraft !== undefined) {
    out.costDocumentDraft = costDocumentSearch.costDocumentDraft;
  }
  if (rail !== undefined) {
    out.rail = rail;
  }
  if (timeframe !== undefined) {
    out.timeframe = timeframe;
  }
  if (roundId !== undefined) {
    out.roundId = roundId;
  }
  return out;
}
