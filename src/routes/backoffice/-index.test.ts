import { describe, expect, test } from "vitest";

import {
  mergeTimelineRowsIntoBackofficeDashboard,
  normalizeBackofficeDashboardQuery,
} from "./index";

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

  test("surfaces draft/submitted timeline proposals and approved live builds", () => {
    const dashboard = mergeTimelineRowsIntoBackofficeDashboard(
      normalizeBackofficeDashboardQuery({
        dashboard: {
          activeBuilds: [],
          metrics: [
            {
              detail: "",
              id: "draw-requests",
              label: "Draw requests",
              tone: "warning",
              value: 0,
            },
            {
              detail: "",
              id: "proposals",
              label: "Proposals",
              tone: "default",
              value: 0,
            },
            {
              detail: "",
              id: "active-builds",
              label: "Active builds",
              tone: "default",
              value: 0,
            },
          ],
          milestoneColumns: [],
          drawRequests: [],
          milestones: [],
          proposalColumns: [
            { id: "draft", name: "Draft" },
            { id: "submitted", name: "Submitted" },
          ],
          proposals: [],
          quickActions: [],
          scheduleDate: "2026-05-08T12:00:00.000Z",
          scheduleEvents: [],
        },
        needsSeed: false,
      }),
      [
        {
          address: "Draft site",
          buildName: "Draft build",
          href: "/demo/timeline/draft-plan",
          ownerPersona: "mock_builder",
          planId: "draft-plan",
          status: "draft",
          statusLabel: "Draft",
          totalBudgetCents: 100_000_00,
        },
        {
          address: "Submitted site",
          buildName: "Submitted build",
          href: "/backoffice/proposals/submitted-plan",
          ownerPersona: "mock_builder",
          planId: "submitted-plan",
          status: "submitted",
          statusLabel: "Submitted",
          totalBudgetCents: 200_000_00,
        },
        {
          address: "Live site",
          buildKey: "demo-timeline-live",
          buildName: "Live build",
          milestoneCount: 3,
          ownerPersona: "mock_builder",
          pendingDrawRequestCount: 1,
          pendingModificationRequestCount: 2,
          planId: "approved-plan",
          drawRequests: [
            {
              amountCents: 90_000_00,
              drawKey: "draw-01",
              href: "/demo/timeline/approved-plan",
              label: "Draw 01",
              x: 31,
            },
          ],
          status: "approved",
          totalBudgetCents: 300_000_00,
        },
      ],
    );

    expect(dashboard.proposals.map((proposal) => proposal.column)).toEqual([
      "draft",
      "submitted",
    ]);
    expect(dashboard.proposals[0].href).toBe("/demo/timeline/draft-plan");
    expect(dashboard.proposals[1].href).toBe(
      "/backoffice/proposals/submitted-plan",
    );
    expect(dashboard.activeBuilds[0]).toMatchObject({
      buildKey: "demo-timeline-live",
      href: "/backoffice/builds/demo-timeline-live?rail=closed&tab=timeline",
      activeMilestone: "1 draw requests; 2 change requests",
      statusLabel: "Live timeline",
    });
    expect(dashboard.drawRequests[0]).toMatchObject({
      eligibleDate: "Day 31",
      href: "/backoffice/builds/demo-timeline-live?rail=closed&tab=timeline",
      label: "Draw 01",
      requestedAmount: "$90,000",
      statusLabel: "Requested",
    });
    expect(
      dashboard.metrics.find((metric) => metric.id === "draw-requests"),
    ).toMatchObject({
      trend: "1 timeline draw requests",
      value: 1,
    });
  });
});
