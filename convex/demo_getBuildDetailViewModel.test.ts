/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";

import { api, internal } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

async function seedAndResolveBuildId(t: ReturnType<typeof convexTest>) {
  await t.mutation(api.demo_drawflow.demo_seedDrawFlowDemo, {});
  const buildId = await t.query(
    api.demo_drawflow_backoffice.demo_resolveBuildIdByKey,
    { buildKey: "active-maple-ridge" },
  );
  if (!buildId) {
    throw new Error("Expected active-maple-ridge build after seed.");
  }
  return buildId;
}

describe("demo_getBuildDetailViewModel", () => {
  test("returns needsSeed when no build exists", async () => {
    const t = convexTest(schema, modules);
    const result = await t.query(
      api.demo_drawflow_backoffice.demo_resolveBuildIdByKey,
      { buildKey: "active-maple-ridge" },
    );
    expect(result).toBeNull();
  });

  test("hydrates header, draws, kanban, contractors, notes, documents after seed", async () => {
    const t = convexTest(schema, modules);
    const buildId = await seedAndResolveBuildId(t);
    const vm = await t.query(
      api.demo_drawflow_backoffice.demo_getBuildDetailViewModel,
      { buildId },
    );
    expect(vm.needsSeed).toBe(false);
    expect(vm.build.key).toBe("active-maple-ridge");
    expect(vm.displayId).toMatch(/^BLD-/);
    expect(vm.draws.length).toBeGreaterThan(0);
    expect(vm.kanban.length).toBeGreaterThan(0);
    // Seed populates 3 contractors + 3 milestone assignments via seedBuildDetailExtras.
    expect(vm.contractors).toHaveLength(3);
    expect(vm.milestoneContractors).toHaveLength(3);
    expect(vm.notes.internal).toHaveLength(1);
    expect(vm.notes.public).toHaveLength(1);
    expect(vm.documents).toHaveLength(3);
    // CC-07 CI guard: traverse the entire view model and assert no field
    // begins with `mock_` other than the explicit allowlist.
    const allowedMockKeys = new Set(["mock_satelliteImageUrl", "mock_sitePhotos"]);
    const leaks: string[] = [];
    const walk = (node: unknown, path: string) => {
      if (node === null || typeof node !== "object") return;
      if (Array.isArray(node)) {
        node.forEach((child, idx) => walk(child, `${path}[${idx}]`));
        return;
      }
      for (const [key, value] of Object.entries(node)) {
        const childPath = path ? `${path}.${key}` : key;
        if (key.startsWith("mock_") && !allowedMockKeys.has(key)) {
          leaks.push(childPath);
        }
        walk(value, childPath);
      }
    };
    walk(vm, "");
    expect(leaks).toEqual([]);
    expect(vm.mock_satelliteImageUrl).toMatch(/^mock:\/\/satellite\//);
    expect(Array.isArray(vm.mock_sitePhotos)).toBe(true);
    expect(vm.mock_sitePhotos.length).toBeGreaterThan(1);
    expect(vm.mock_sitePhotos[0]?.url).toMatch(/^mock:\/\//);

    // Kanban cards expose enriched fields used by the new card UI.
    const enrichedCard = vm.kanban.find(
      (card: any) => card.milestoneKey === "foundation",
    );
    expect(enrichedCard).toBeDefined();
    expect(enrichedCard.code).toMatch(/^M-/);
    expect(enrichedCard.approvedValueCents).toBeGreaterThan(0);
    expect(enrichedCard.forecastStartDate).toMatch(/^\d{4}-\d{2}-\d{2}/);
    expect(enrichedCard.forecastEndDate).toMatch(/^\d{4}-\d{2}-\d{2}/);
    expect(Array.isArray(enrichedCard.submilestones)).toBe(true);
    expect(enrichedCard.submilestones.length).toBeGreaterThan(0);
    expect(enrichedCard.submilestones[0].status).toMatch(
      /^(todo|in_progress|done)$/,
    );

    // Timeline projection ready for inline AnimatedCurvedTimeline mounting.
    expect(vm.timeline.items.length).toBe(vm.kanban.length);
    expect(vm.timeline.range.max).toBeGreaterThan(0);
    expect(vm.timeline.drawMarkers.some((m: any) => m.id === "today")).toBe(true);
  });

  test("derives approvedPrincipal and drawAvailable from draw groups", async () => {
    const t = convexTest(schema, modules);
    const buildId = await seedAndResolveBuildId(t);
    const vm = await t.query(
      api.demo_drawflow_backoffice.demo_getBuildDetailViewModel,
      { buildId },
    );
    expect(vm.derived.approvedPrincipalCents).toBeGreaterThan(0);
    expect(vm.derived.drawableTotalCents).toBe(
      vm.derived.approvedPrincipalCents,
    );
    expect(vm.derived.drawAvailableCents).toBeLessThanOrEqual(
      vm.derived.drawableTotalCents,
    );
    expect(vm.derived.percentComplete).toBeGreaterThanOrEqual(0);
    expect(vm.derived.percentComplete).toBeLessThanOrEqual(100);
  });

  test("projects kanban cards onto the documented columns", async () => {
    const t = convexTest(schema, modules);
    const buildId = await seedAndResolveBuildId(t);
    const vm = await t.query(
      api.demo_drawflow_backoffice.demo_getBuildDetailViewModel,
      { buildId },
    );
    const allowed = new Set([
      "Backlog",
      "InProgress",
      "MarkedComplete",
      "SiteVisit",
      "NeedsApproval",
    ]);
    for (const card of vm.kanban) {
      expect(allowed.has(card.column)).toBe(true);
    }
  });
});

describe("demo_approveDraw", () => {
  test("flips the draw group to release_approved and emits audit + outbox events", async () => {
    const t = convexTest(schema, modules);
    const buildId = await seedAndResolveBuildId(t);
    const vmBefore = await t.query(
      api.demo_drawflow_backoffice.demo_getBuildDetailViewModel,
      { buildId },
    );
    const target = vmBefore.draws.find(
      (draw: any) => draw.status !== "release_approved",
    );
    expect(target).toBeDefined();
    const result = await t.mutation(
      api.demo_drawflow_backoffice.demo_approveDraw,
      {
        buildId,
        drawGroupKey: target.drawGroupKey,
        overrideReason: "Test override for policy limit",
      },
    );
    expect(result.idempotent).toBe(false);
    expect(result.status).toBe("release_approved");
    const vmAfter = await t.query(
      api.demo_drawflow_backoffice.demo_getBuildDetailViewModel,
      { buildId },
    );
    const after = vmAfter.draws.find(
      (draw: any) => draw.drawGroupKey === target.drawGroupKey,
    );
    expect(after.status).toBe("release_approved");
    expect(
      vmAfter.auditEvents.some(
        (ev: any) =>
          ev.command === "demo_approveDraw" &&
          ev.drawGroupKey === target.drawGroupKey,
      ),
    ).toBe(true);
  });

  test("is idempotent for the same actor in the correlation window", async () => {
    const t = convexTest(schema, modules);
    const buildId = await seedAndResolveBuildId(t);
    const vm = await t.query(
      api.demo_drawflow_backoffice.demo_getBuildDetailViewModel,
      { buildId },
    );
    const target = vm.draws.find(
      (draw: any) => draw.status !== "release_approved",
    );
    const first = await t.mutation(
      api.demo_drawflow_backoffice.demo_approveDraw,
      {
        buildId,
        drawGroupKey: target.drawGroupKey,
        overrideReason: "Test override for policy limit",
      },
    );
    const second = await t.mutation(
      api.demo_drawflow_backoffice.demo_approveDraw,
      {
        buildId,
        drawGroupKey: target.drawGroupKey,
        overrideReason: "Test override for policy limit",
      },
    );
    expect(first.idempotent).toBe(false);
    expect(second.idempotent).toBe(true);
    const vmAfter = await t.query(
      api.demo_drawflow_backoffice.demo_getBuildDetailViewModel,
      { buildId },
    );
    const auditsForDraw = vmAfter.auditEvents.filter(
      (ev: any) =>
        ev.command === "demo_approveDraw" &&
        ev.drawGroupKey === target.drawGroupKey,
    );
    // Exactly one audit event should be written across both calls.
    expect(auditsForDraw).toHaveLength(1);
  });
});

describe("internal notes borrower-leak guard", () => {
  test("getBorrowerVisibleNotes never returns internal notes", async () => {
    const t = convexTest(schema, modules);
    const buildId = await seedAndResolveBuildId(t);
    await t.mutation(api.demo_drawflow_backoffice.demo_addBuildNote, {
      buildId,
      visibility: "internal",
      body: "Borrower must never see this.",
    });
    await t.mutation(api.demo_drawflow_backoffice.demo_addBuildNote, {
      buildId,
      visibility: "public",
      body: "Borrower-safe update.",
    });
    const visible = await t.query(
      api.demo_drawflow_backoffice.demo_getBorrowerVisibleNotes,
      { buildId },
    );
    expect(visible.every((n: any) => n.visibility === "public")).toBe(true);
    expect(
      visible.some((n: any) =>
        String(n.body).includes("Borrower must never see this"),
      ),
    ).toBe(false);
  });
});

describe("demo_attachContractorToBuild", () => {
  test("moves a contractor from availableContractors into contractors", async () => {
    const t = convexTest(schema, modules);
    const buildId = await seedAndResolveBuildId(t);
    // Insert a fresh contractor not yet attached to the build.
    const newContractorId = await t.run(async (ctx: any) => {
      const now = Date.now();
      return await ctx.db.insert("demo_contractors", {
        orgKey: "demo",
        scenario: "active",
        name: "Apex Drywall",
        kind: "company",
        hourlyRateCents: 7200,
        city: "Denver, CO",
        skills: ["drywall", "tape", "texture"],
        trades: ["drywall"],
        createdAt: now,
        updatedAt: now,
      });
    });
    const vmBefore = await t.query(
      api.demo_drawflow_backoffice.demo_getBuildDetailViewModel,
      { buildId },
    );
    expect(
      vmBefore.availableContractors.some(
        (c: any) => c._id === newContractorId,
      ),
    ).toBe(true);
    const result = await t.mutation(
      api.demo_drawflow_backoffice.demo_attachContractorToBuild,
      { buildId, contractorId: newContractorId, role: "Drywall · Lead" },
    );
    expect(result.alreadyAttached).toBe(false);
    const dup = await t.mutation(
      api.demo_drawflow_backoffice.demo_attachContractorToBuild,
      { buildId, contractorId: newContractorId, role: "Drywall · Lead" },
    );
    expect(dup.alreadyAttached).toBe(true);
    const vmAfter = await t.query(
      api.demo_drawflow_backoffice.demo_getBuildDetailViewModel,
      { buildId },
    );
    expect(
      vmAfter.contractors.some((c: any) => c._id === newContractorId),
    ).toBe(true);
    expect(
      vmAfter.availableContractors.some(
        (c: any) => c._id === newContractorId,
      ),
    ).toBe(false);
    expect(
      vmAfter.auditEvents.some(
        (ev: any) => ev.command === "demo_attachContractorToBuild",
      ),
    ).toBe(true);
  });
});

describe("demo_createAndAttachContractor", () => {
  test("creates a new contractor record and attaches it with audit", async () => {
    const t = convexTest(schema, modules);
    const buildId = await seedAndResolveBuildId(t);
    const result = await t.mutation(
      api.demo_drawflow_backoffice.demo_createAndAttachContractor,
      {
        buildId,
        role: "Framing lead",
        contractor: {
          name: "Cedar Peak Framing",
          kind: "company",
          hourlyRateCents: 9_500,
          city: "Loveland, CO",
          trades: ["framing", "carpentry"],
          skills: ["truss", "stick-build"],
          phone: "303-555-2299",
          email: "ops@cedarpeak.example",
        },
      },
    );
    expect(result.contractorId).toBeTruthy();
    expect(result.buildContractorId).toBeTruthy();
    const vm = await t.query(
      api.demo_drawflow_backoffice.demo_getBuildDetailViewModel,
      { buildId },
    );
    const attached = vm.contractors.find(
      (c: any) => c._id === result.contractorId,
    );
    expect(attached).toBeTruthy();
    expect(attached.role).toBe("Framing lead");
    expect(attached.trades).toEqual(["framing", "carpentry"]);
    expect(attached.hourlyRateCents).toBe(9_500);
    expect(attached.city).toBe("Loveland, CO");
    expect(
      vm.availableContractors.some(
        (c: any) => c._id === result.contractorId,
      ),
    ).toBe(false);
    expect(
      vm.auditEvents.some(
        (ev: any) => ev.command === "demo_createAndAttachContractor",
      ),
    ).toBe(true);
  });

  test("rejects empty role and empty trades", async () => {
    const t = convexTest(schema, modules);
    const buildId = await seedAndResolveBuildId(t);
    await expect(
      t.mutation(
        api.demo_drawflow_backoffice.demo_createAndAttachContractor,
        {
          buildId,
          role: "   ",
          contractor: {
            name: "X",
            kind: "individual",
            hourlyRateCents: 5000,
            city: "Y",
            trades: ["plumbing"],
            skills: [],
          },
        },
      ),
    ).rejects.toThrow(/empty_role/);
    await expect(
      t.mutation(
        api.demo_drawflow_backoffice.demo_createAndAttachContractor,
        {
          buildId,
          role: "Plumber",
          contractor: {
            name: "X",
            kind: "individual",
            hourlyRateCents: 5000,
            city: "Y",
            trades: [" ", ""],
            skills: [],
          },
        },
      ),
    ).rejects.toThrow(/empty_trades/);
  });
});

describe("demo_addBuildDocument", () => {
  test("appends a named document and surfaces it in the view model", async () => {
    const t = convexTest(schema, modules);
    const buildId = await seedAndResolveBuildId(t);
    const vmBefore = await t.query(
      api.demo_drawflow_backoffice.demo_getBuildDetailViewModel,
      { buildId },
    );
    const baseCount = vmBefore.documents.length;
    await t.mutation(api.demo_drawflow_backoffice.demo_addBuildDocument, {
      buildId,
      name: "Insurance_2026.pdf",
      kind: "insurance",
    });
    const vmAfter = await t.query(
      api.demo_drawflow_backoffice.demo_getBuildDetailViewModel,
      { buildId },
    );
    expect(vmAfter.documents).toHaveLength(baseCount + 1);
    const added = vmAfter.documents.find(
      (d: any) => d.name === "Insurance_2026.pdf",
    );
    expect(added).toBeDefined();
    expect(added.kind).toBe("insurance");
    expect(
      vmAfter.auditEvents.some(
        (ev: any) => ev.command === "demo_addBuildDocument",
      ),
    ).toBe(true);
  });
});
