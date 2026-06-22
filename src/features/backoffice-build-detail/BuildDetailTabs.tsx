"use client";

export type BuildDetailSubTab =
  | "calendar"
  | "details"
  | "evidence"
  | "gantt"
  | "materials"
  | "staff"
  | "timeline";

export const BUILD_DETAIL_TABS: { value: BuildDetailSubTab; label: string }[] =
  [
    { value: "details", label: "Details" },
    { value: "timeline", label: "Timeline" },
    { value: "evidence", label: "Evidence" },
    { value: "materials", label: "Materials" },
    { value: "staff", label: "Staff" },
    { value: "calendar", label: "Calendar" },
    { value: "gantt", label: "Gantt" },
  ];

export function BuildDetailTabBar({
  activeTab,
  onChangeTab,
}: {
  activeTab: BuildDetailSubTab;
  onChangeTab: (tab: BuildDetailSubTab) => void;
}) {
  return (
    <div className="-mx-2 overflow-x-auto px-2 sm:mx-0 sm:px-0">
      <div
        className="flex w-max min-w-full gap-1 rounded-lg border border-border bg-card p-1 sm:min-w-0"
        data-testid="build-detail-tabbar"
        role="tablist"
      >
        {BUILD_DETAIL_TABS.map((tab) => (
          <button
            aria-selected={activeTab === tab.value}
            className={
              activeTab === tab.value
                ? "min-h-11 flex-1 whitespace-nowrap rounded-md bg-primary/25 px-3 py-2 text-xs text-foreground sm:min-h-9 sm:flex-none sm:py-1.5"
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
