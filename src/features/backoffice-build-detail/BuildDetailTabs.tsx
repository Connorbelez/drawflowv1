"use client";

import { useMediaQuery } from "#/hooks/use-media-query.ts";

export type BuildDetailSubTab =
  | "calendar"
  | "contractors"
  | "costs"
  | "details"
  | "documents"
  | "evidence"
  | "gantt"
  | "materials"
  | "milestones"
  | "staff"
  | "timeline";

export const BUILD_DETAIL_TABS: { value: BuildDetailSubTab; label: string }[] =
  [
    { value: "details", label: "Details" },
    { value: "documents", label: "Documents" },
    { value: "milestones", label: "Milestones" },
    { value: "contractors", label: "Contractors" },
    { value: "materials", label: "Materials" },
    { value: "costs", label: "Costs" },
    { value: "timeline", label: "Timeline" },
    { value: "evidence", label: "Evidence" },
    { value: "staff", label: "Staff" },
    { value: "calendar", label: "Calendar" },
    { value: "gantt", label: "Gantt" },
  ];

export function BuildDetailTabBar({
  activeTab,
  onChangeTab,
  tabs = BUILD_DETAIL_TABS.map((tab) => tab.value),
}: {
  activeTab: BuildDetailSubTab;
  onChangeTab: (tab: BuildDetailSubTab) => void;
  tabs?: BuildDetailSubTab[];
}) {
  const visibleTabs = BUILD_DETAIL_TABS.filter((tab) =>
    tabs.includes(tab.value)
  );
  const compact = useMediaQuery("max-md");

  if (compact) {
    return (
      <nav
        aria-label="Build workspace navigation"
        className="grid min-w-0 gap-1.5 rounded-lg border border-border bg-card p-2"
      >
        <label
          className="font-medium text-foreground text-xs"
          htmlFor="build-workspace-section"
        >
          Workspace section
        </label>
        <select
          aria-label="Build workspace section"
          className="min-h-11 w-full min-w-0 rounded-md border border-input bg-background px-3 text-sm"
          id="build-workspace-section"
          onChange={(event) =>
            onChangeTab(event.target.value as BuildDetailSubTab)
          }
          value={activeTab}
        >
          {visibleTabs.map((tab) => (
            <option key={tab.value} value={tab.value}>
              {tab.label}
            </option>
          ))}
        </select>
      </nav>
    );
  }

  return (
    <div className="-mx-2 overflow-x-auto px-2 sm:mx-0 sm:px-0">
      <div
        className="flex w-max min-w-full gap-1 rounded-lg border border-border bg-card p-1 sm:min-w-0"
        data-testid="build-detail-tabbar"
        role="tablist"
      >
        {visibleTabs.map((tab) => (
          <button
            aria-selected={activeTab === tab.value}
            className={
              activeTab === tab.value
                ? "min-h-11 flex-1 whitespace-nowrap rounded-md bg-primary/25 px-3 py-2 text-foreground text-xs sm:min-h-9 sm:flex-none sm:py-1.5"
                : "min-h-11 flex-1 whitespace-nowrap rounded-md px-3 py-2 text-muted-foreground text-xs hover:bg-accent hover:text-foreground sm:min-h-9 sm:flex-none sm:py-1.5"
            }
            data-testid={`build-detail-tab-${tab.value}`}
            key={tab.value}
            onClick={() => onChangeTab(tab.value)}
            role="tab"
            type="button"
          >
            {tab.label}
          </button>
        ))}
      </div>
    </div>
  );
}
