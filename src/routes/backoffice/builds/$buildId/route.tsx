import { createFileRoute, Outlet } from "@tanstack/react-router";

type BuildDetailSearch = {
  milestone?: string;
  tab?: "details" | "timeline" | "calendar" | "gantt";
  rail?: "open" | "closed";
};

export const Route = createFileRoute("/backoffice/builds/$buildId")({
  validateSearch: (search: Record<string, unknown>): BuildDetailSearch => {
    const tab =
      search.tab === "timeline" ||
      search.tab === "calendar" ||
      search.tab === "gantt" ||
      search.tab === "details"
        ? (search.tab as BuildDetailSearch["tab"])
        : undefined;
    const milestone =
      typeof search.milestone === "string" ? search.milestone : undefined;
    const rail =
      search.rail === "closed" || search.rail === "open"
        ? (search.rail as BuildDetailSearch["rail"])
        : undefined;
    const out: BuildDetailSearch = {};
    if (milestone !== undefined) out.milestone = milestone;
    if (tab !== undefined) out.tab = tab;
    if (rail !== undefined) out.rail = rail;
    return out;
  },
  component: RouteComponent,
});

function RouteComponent() {
  return <Outlet />;
}
