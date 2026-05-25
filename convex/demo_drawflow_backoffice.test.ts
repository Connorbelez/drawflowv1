/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";

import { api } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

describe("drawflow backoffice dashboard projection", () => {
  test("reports an explicit seed gap before demo tables exist", async () => {
    const t = convexTest(schema, modules);

    const result = await t.query(api.demo_drawflow.demo_getBackofficeDashboard, {});

    expect(result.needsSeed).toBe(true);
    expect(result.gapAnalysis[0]).toMatchObject({
      display: "All dashboard sections",
      resolution: "Frontend uses explicit Mock-prefixed fallback rows.",
    });
  });

  test("derives dashboard sections from persistent demo tables after seeding", async () => {
    const t = convexTest(schema, modules);
    await t.mutation(api.demo_drawflow.demo_seedDrawFlowDemo, {});

    const result = await t.query(api.demo_drawflow.demo_getBackofficeDashboard, {});

    expect(result.needsSeed).toBe(false);
    expect(result.dashboard.activeBuilds).toHaveLength(1);
    expect(result.dashboard.activeBuilds[0]).toMatchObject({
      activeMilestone: expect.any(String),
      address: expect.stringContaining("Mock address"),
      buildKey: "active-maple-ridge",
      builder: expect.stringContaining("Mock builder"),
      href: "/backoffice/builds/active-maple-ridge",
      id: expect.stringMatching(/^B-/),
    });
    expect(result.dashboard.metrics.map((metric: any) => metric.id)).toEqual([
      "draw-requests",
      "active-builds",
      "proposals",
      "milestones",
    ]);
    expect(result.dashboard.drawRequests).toBeInstanceOf(Array);
    expect(result.dashboard.drawRequests).toHaveLength(
      result.dashboard.metrics.find((metric: any) => metric.id === "draw-requests")
        .value,
    );
    expect(result.dashboard.drawRequests[0]).toMatchObject({
      address: expect.stringContaining("Mock address"),
      buildId: expect.stringMatching(/^B-/),
      buildKey: "active-maple-ridge",
      href: "/backoffice/builds/active-maple-ridge",
      label: expect.any(String),
      requestedAmount: expect.stringMatching(/^\$/),
    });
    expect(result.dashboard.milestones.length).toBeGreaterThan(0);
    expect(result.dashboard.milestones[0].href).toContain(
      "/backoffice/builds/active-maple-ridge?milestone=",
    );
    expect(result.dashboard.proposals[0]).toMatchObject({
      isMockBuilder: true,
      isMockLtv: true,
    });
    expect(result.gapAnalysis.map((gap: any) => gap.display)).toContain(
      "Proposal LTV",
    );
  });

  test("approves submitted proposals and moves them into the approved queue", async () => {
    const t = convexTest(schema, modules);
    await t.mutation(api.demo_drawflow.demo_seedDrawFlowDemo, {});
    await t.mutation(api.demo_drawflow.demo_applyProposalPlanRecommendation, {});
    await t.mutation(api.demo_drawflow.demo_submitProposal, {});

    const submitted = await t.query(
      api.demo_drawflow.demo_getBackofficeDashboard,
      {},
    );
    expect(submitted.dashboard.proposals[0]).toMatchObject({
      column: "submitted",
      statusLabel: "Submitted",
    });

    await t.mutation(api.demo_drawflow.demo_approveProposal, {
      reason: "Approved in backoffice dashboard test.",
    });

    const approved = await t.query(
      api.demo_drawflow.demo_getBackofficeDashboard,
      {},
    );
    expect(approved.dashboard.proposals[0]).toMatchObject({
      column: "approved",
      statusLabel: "Approved",
    });
  });
});
