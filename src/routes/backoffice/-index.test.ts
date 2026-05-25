import { describe, expect, test } from "vitest";

import { normalizeBackofficeDashboardQuery } from "./index";

describe("backoffice dashboard query normalization", () => {
  test("falls back to obvious mock rows when demo tables are not seeded", () => {
    const dashboard = normalizeBackofficeDashboardQuery({ needsSeed: true });

    expect(dashboard.activeBuilds[0].id).toBe("MOCK-BUILD-1");
    expect(dashboard.activeBuilds[0].address).toContain("Mock");
    expect(dashboard.proposals[0].builder).toContain("Mock builder");
  });

  test("converts persistent query schedule dates into calendar dates", () => {
    const dashboard = normalizeBackofficeDashboardQuery({
      dashboard: {
        activeBuilds: [],
        metrics: [],
        milestoneColumns: [],
        milestones: [],
        proposalColumns: [],
        proposals: [],
        quickActions: [],
        scheduleDate: "2026-05-08T12:00:00.000Z",
        scheduleEvents: [],
      },
      needsSeed: false,
    });

    expect(dashboard.scheduleDate).toBeInstanceOf(Date);
    expect(dashboard.scheduleDate.toISOString()).toBe(
      "2026-05-08T12:00:00.000Z",
    );
    expect(dashboard.drawRequests).toEqual([]);
  });
});
