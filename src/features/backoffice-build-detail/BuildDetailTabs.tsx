"use client";

export type BuildDetailSubTab = "details" | "timeline" | "calendar" | "gantt";

export const BUILD_DETAIL_TABS: { value: BuildDetailSubTab; label: string }[] =
  [
    { value: "details", label: "Details" },
    { value: "timeline", label: "Timeline" },
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
    <div
      className="flex w-max gap-1 rounded-lg border border-border bg-card p-1"
      data-testid="build-detail-tabbar"
      role="tablist"
    >
      {BUILD_DETAIL_TABS.map((tab) => (
        <button
          aria-selected={activeTab === tab.value}
          className={
            activeTab === tab.value
              ? "rounded-md bg-primary/25 px-3 py-1.5 text-xs text-foreground"
              : "rounded-md px-3 py-1.5 text-muted-foreground text-xs hover:bg-accent hover:text-foreground"
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
  );
}
