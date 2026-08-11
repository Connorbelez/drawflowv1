import { describe, expect, test } from "vitest";

import {
  BUILD_SUBMILESTONE_DETAIL_TABS,
  normalizeBuildSubmilestoneDetailTab,
} from "./buildDetailTab.ts";

describe("Build Sub-milestone detail tabs", () => {
  test("keeps the public tab identifiers stable and ordered", () => {
    expect(BUILD_SUBMILESTONE_DETAIL_TABS).toEqual([
      "overview",
      "evidence",
      "people",
      "materials",
      "collaboration",
      "review",
    ]);
  });

  test.each(BUILD_SUBMILESTONE_DETAIL_TABS)("accepts %s", (tab) => {
    expect(normalizeBuildSubmilestoneDetailTab(tab)).toBe(tab);
  });

  test.each([undefined, null, "notes", "Review", "overview:scope"])(
    "rejects invalid tab %s",
    (tab) => expect(normalizeBuildSubmilestoneDetailTab(tab)).toBeUndefined(),
  );
});
