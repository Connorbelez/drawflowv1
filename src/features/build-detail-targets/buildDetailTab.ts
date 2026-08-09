export const BUILD_SUBMILESTONE_DETAIL_TABS = [
  "overview",
  "evidence",
  "people",
  "materials",
  "collaboration",
  "review",
] as const;

export type BuildSubmilestoneDetailTab =
  (typeof BUILD_SUBMILESTONE_DETAIL_TABS)[number];

export function normalizeBuildSubmilestoneDetailTab(
  value: unknown,
): BuildSubmilestoneDetailTab | undefined {
  return typeof value === "string" &&
    BUILD_SUBMILESTONE_DETAIL_TABS.includes(
      value as BuildSubmilestoneDetailTab,
    )
    ? (value as BuildSubmilestoneDetailTab)
    : undefined;
}
