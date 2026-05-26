import { describe, expect, test } from "vitest";

import {
  getMetricDrilldownItems,
  getMetricSectionHref,
} from "./metric-drilldown.ts";
import { getExplicitMockBackofficeDashboardData } from "./mock-data.ts";

describe("metric drilldown mapping", () => {
  test("maps each dashboard metric to drilldown cards", () => {
    const dashboard = getExplicitMockBackofficeDashboardData();

    expect(getMetricDrilldownItems("draw-requests", dashboard)).toEqual([
      expect.objectContaining({
        badgeLabel: "Pending",
        context: "$0 requested · Eligible 2026-05-08",
        href: "/backoffice/builds/mock-build-1?rail=closed&tab=timeline",
        subtitle: "MOCK-BUILD-1 · Mock build 1 address",
        title: "Mock draw request",
      }),
    ]);

    expect(getMetricDrilldownItems("active-builds", dashboard)).toEqual([
      expect.objectContaining({
        badgeLabel: "Mock status - on track",
        context: "T+0 days · Mock milestone - awaiting demo seed",
        href: "/backoffice/builds/mock-build-1?rail=closed&tab=timeline",
        subtitle: "Mock build 1 address · Mock builder 1",
        title: "MOCK-BUILD-1",
      }),
    ]);

    expect(getMetricDrilldownItems("proposals", dashboard)).toEqual([
      expect.objectContaining({
        badgeLabel: "Mock status",
        context: "$0 · Mock 0% LTV",
        href: "#proposals-kanban",
        subtitle:
          "Mock proposal address · Mock builder - demo table has no builder company",
        title: "Mock proposal - seed demo proposals",
      }),
    ]);

    expect(getMetricDrilldownItems("milestones", dashboard)).toEqual([
      expect.objectContaining({
        badgeLabel: "medium",
        context: "MOCK-BUILD-1 · Active queue item",
        href: "/backoffice/builds/mock-build-1?milestone=mock-milestone-1",
        subtitle: "Mock build 1 address · MK",
        title: "Mock milestone - seed demo_milestones",
      }),
    ]);
  });

  test("returns section anchors for metric empty states", () => {
    expect(getMetricSectionHref("draw-requests")).toBe("#active-builds");
    expect(getMetricSectionHref("proposals")).toBe("#proposals-kanban");
    expect(getMetricSectionHref("milestones")).toBe("#milestones-kanban");
  });
});
