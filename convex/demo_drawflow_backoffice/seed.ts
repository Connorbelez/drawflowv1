import { v } from "convex/values";
import { publicMutation, withMutationTiming } from "../fluent";
import type { Id } from "../types";

const DEMO_SCENARIO = "active";

// -----------------------------------------------------------------------------
// Seed helpers (called from demo_drawflow.seedActive after build is created)
// -----------------------------------------------------------------------------

export interface SeedBuildDetailExtrasInput {
  buildId: Id<"demo_builds">;
  orgKey: string;
  scenario: string;
}

export async function seedBuildDetailExtras(
  ctx: { db: any },
  { buildId, scenario, orgKey }: SeedBuildDetailExtrasInput
): Promise<void> {
  const now = Date.now();
  const northpeakId = await ctx.db.insert("demo_contractors", {
    orgKey,
    scenario,
    name: "Northpeak Concrete",
    kind: "company",
    hourlyRateCents: 8500,
    city: "Boulder, CO",
    skills: ["forms", "rebar", "slab"],
    trades: ["concrete"],
    phone: "303-555-0118",
    email: "ops@northpeak.example",
    createdAt: now,
    updatedAt: now,
  });
  const silverlightId = await ctx.db.insert("demo_contractors", {
    orgKey,
    scenario,
    name: "Silverlight Electric",
    kind: "company",
    hourlyRateCents: 11_000,
    city: "Longmont, CO",
    skills: ["service", "rough-in", "trim"],
    trades: ["electrical"],
    phone: "303-555-0117",
    email: "ops@silverlight.example",
    createdAt: now,
    updatedAt: now,
  });
  const mendezId = await ctx.db.insert("demo_contractors", {
    orgKey,
    scenario,
    name: "K. Mendez",
    kind: "individual",
    hourlyRateCents: 9500,
    city: "Boulder, CO",
    skills: ["plumbing"],
    trades: ["plumbing"],
    phone: undefined,
    email: "k.mendez@example.com",
    createdAt: now,
    updatedAt: now,
  });

  for (const [contractorId, role] of [
    [northpeakId, "Concrete · Lead"],
    [silverlightId, "Electrical"],
    [mendezId, "Plumbing"],
  ] as const) {
    await ctx.db.insert("demo_buildContractors", {
      buildId,
      contractorId,
      scenario,
      role,
      createdAt: now,
    });
  }

  // Assign Northpeak + Mendez to a representative milestone key (foundation/excavation)
  for (const [milestoneKey, contractorId, role] of [
    ["foundation", northpeakId, "Lead · forms, rebar, slab"],
    ["foundation", mendezId, "Plumbing assist"],
    ["rough_ins", silverlightId, "Electrical rough-in"],
  ] as const) {
    await ctx.db.insert("demo_milestoneContractors", {
      buildId,
      milestoneKey,
      contractorId,
      scenario,
      role,
      createdAt: now,
    });
  }

  await ctx.db.insert("demo_buildNotes", {
    buildId,
    scenario,
    visibility: "internal",
    body: "Verified excavation depth against survey. Borrower copy on D-04 requested. Recommend approve once geofence override resolves.",
    authorPersona: "lender_admin",
    createdAt: now,
    updatedAt: now,
  });
  await ctx.db.insert("demo_buildNotes", {
    buildId,
    scenario,
    visibility: "public",
    body: "Draw 4 received; expect decision within 2 business days after site visit.",
    authorPersona: "lender_admin",
    createdAt: now,
    updatedAt: now,
  });

  await ctx.db.insert("demo_buildDocuments", {
    buildId,
    scenario,
    name: "Permit_Boulder_2025-09.pdf",
    kind: "permit",
    sizeBytes: 184_320,
    uploaderPersona: "builder",
    createdAt: now,
    updatedAt: now,
  });
  await ctx.db.insert("demo_buildDocuments", {
    buildId,
    scenario,
    name: "Survey_MapleRidge.pdf",
    kind: "survey",
    sizeBytes: 612_400,
    uploaderPersona: "builder",
    createdAt: now,
    updatedAt: now,
  });
  await ctx.db.insert("demo_buildDocuments", {
    buildId,
    scenario,
    name: "Excavation_inspection_2026-05-23.jpg",
    kind: "evidence",
    sizeBytes: 2_456_320,
    uploaderPersona: "site_visitor",
    createdAt: now,
    updatedAt: now,
  });

  // Submilestones for the most visible kanban milestones. Each milestone
  // gets a checklist with mixed status to power the "3/5 done" UX on cards.
  const SUBMILESTONE_SEED: Array<{
    milestoneKey: string;
    items: Array<{
      key: string;
      name: string;
      status: "todo" | "in_progress" | "done";
      budgetCents?: number;
      durationDays?: number;
    }>;
  }> = [
    {
      milestoneKey: "foundation",
      items: [
        {
          key: "footings_formed",
          name: "Footings formed & inspected",
          status: "done",
          budgetCents: 1_800_000,
          durationDays: 4,
        },
        {
          key: "rebar_tied",
          name: "Rebar tied",
          status: "done",
          budgetCents: 900_000,
          durationDays: 3,
        },
        {
          key: "slab_poured",
          name: "Slab poured",
          status: "done",
          budgetCents: 2_400_000,
          durationDays: 2,
        },
        {
          key: "stem_walls",
          name: "Stem walls cured",
          status: "in_progress",
          budgetCents: 1_500_000,
          durationDays: 5,
        },
        {
          key: "waterproofing",
          name: "Waterproofing applied",
          status: "todo",
          budgetCents: 600_000,
          durationDays: 2,
        },
      ],
    },
    {
      milestoneKey: "underground_plumbing",
      items: [
        {
          key: "rough_layout",
          name: "Rough layout marked",
          status: "todo",
          budgetCents: 350_000,
          durationDays: 1,
        },
        {
          key: "trench_dug",
          name: "Trenches dug",
          status: "todo",
          budgetCents: 420_000,
          durationDays: 2,
        },
        {
          key: "pipes_laid",
          name: "Pipes laid & pressure-tested",
          status: "todo",
          budgetCents: 1_100_000,
          durationDays: 4,
        },
        {
          key: "inspection_pass",
          name: "City inspection passed",
          status: "todo",
          budgetCents: 130_000,
          durationDays: 1,
        },
      ],
    },
    {
      milestoneKey: "water_sewer",
      items: [
        {
          key: "tap_permit",
          name: "City tap permit",
          status: "done",
          budgetCents: 240_000,
          durationDays: 1,
        },
        {
          key: "main_run",
          name: "Water main run",
          status: "done",
          budgetCents: 1_650_000,
          durationDays: 6,
        },
        {
          key: "sewer_connection",
          name: "Sewer connection",
          status: "in_progress",
          budgetCents: 1_300_000,
          durationDays: 5,
        },
        {
          key: "backfill",
          name: "Backfill & compact",
          status: "todo",
          budgetCents: 410_000,
          durationDays: 2,
        },
        {
          key: "as_built",
          name: "As-built drawings filed",
          status: "todo",
          budgetCents: 90_000,
          durationDays: 1,
        },
      ],
    },
    {
      milestoneKey: "framing",
      items: [
        {
          key: "sill_plate",
          name: "Sill plate set",
          status: "todo",
          budgetCents: 480_000,
          durationDays: 1,
        },
        {
          key: "floor_joists",
          name: "Floor joists & subfloor",
          status: "todo",
          budgetCents: 2_100_000,
          durationDays: 5,
        },
        {
          key: "exterior_walls",
          name: "Exterior walls raised",
          status: "todo",
          budgetCents: 3_500_000,
          durationDays: 6,
        },
        {
          key: "interior_walls",
          name: "Interior walls raised",
          status: "todo",
          budgetCents: 2_200_000,
          durationDays: 5,
        },
        {
          key: "roof_deck",
          name: "Roof deck installed",
          status: "todo",
          budgetCents: 1_900_000,
          durationDays: 4,
        },
        {
          key: "framing_inspection",
          name: "Framing inspection",
          status: "todo",
          budgetCents: 120_000,
          durationDays: 1,
        },
      ],
    },
    {
      milestoneKey: "roof_flat_shingles",
      items: [
        {
          key: "underlayment",
          name: "Underlayment & flashings",
          status: "todo",
          budgetCents: 650_000,
          durationDays: 2,
        },
        {
          key: "shingles",
          name: "Shingles installed",
          status: "todo",
          budgetCents: 1_450_000,
          durationDays: 4,
        },
        {
          key: "ridge_caps",
          name: "Ridge caps & vents",
          status: "todo",
          budgetCents: 280_000,
          durationDays: 1,
        },
      ],
    },
    {
      milestoneKey: "aluminum_windows",
      items: [
        {
          key: "delivery",
          name: "Window delivery on-site",
          status: "todo",
          budgetCents: 4_200_000,
          durationDays: 1,
        },
        {
          key: "install_first_floor",
          name: "First-floor install",
          status: "todo",
          budgetCents: 1_400_000,
          durationDays: 3,
        },
        {
          key: "install_upper",
          name: "Upper-floor install",
          status: "todo",
          budgetCents: 1_500_000,
          durationDays: 3,
        },
        {
          key: "seal_inspection",
          name: "Seal & weatherization inspection",
          status: "todo",
          budgetCents: 180_000,
          durationDays: 1,
        },
      ],
    },
  ];
  for (const group of SUBMILESTONE_SEED) {
    for (const [order, item] of group.items.entries()) {
      await ctx.db.insert("demo_milestoneSubmilestones", {
        buildId,
        milestoneKey: group.milestoneKey,
        key: item.key,
        name: item.name,
        order,
        status: item.status,
        budgetCents: item.budgetCents,
        durationDays: item.durationDays,
        scenario,
        createdAt: now,
        updatedAt: now,
      });
    }
  }
}

// Public seed entrypoint so tests + the demo route can populate the new tables
// without re-running the full demo seed.
export const demo_seedBuildDetailExtras = publicMutation
  .use(withMutationTiming("demo_drawflow_backoffice.seedBuildDetailExtras"))
  .input({ buildId: v.id("demo_builds"), orgKey: v.optional(v.string()) })
  .returns(v.object({ seeded: v.boolean() }))
  .handler(async (ctx, args) => {
    const build = await ctx.db.get(args.buildId);
    if (!build) {
      return { seeded: false };
    }
    // Idempotency: only seed once.
    const existing = await ctx.db
      .query("demo_buildContractors")
      .withIndex("by_build", (q) => q.eq("buildId", args.buildId))
      .first();
    if (existing) {
      return { seeded: false };
    }
    await seedBuildDetailExtras(ctx, {
      buildId: args.buildId,
      scenario: build.scenario,
      orgKey: args.orgKey ?? "demo",
    });
    return { seeded: true };
  })
  .public();

void DEMO_SCENARIO;
