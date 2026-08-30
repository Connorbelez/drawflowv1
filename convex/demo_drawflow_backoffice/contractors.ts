import { v } from "convex/values";
import { publicMutation, withMutationTiming } from "../fluent";

// -----------------------------------------------------------------------------
// Contractors + Documents add mutations
// -----------------------------------------------------------------------------

export const demo_attachContractorToBuild = publicMutation
  .use(withMutationTiming("demo_drawflow_backoffice.attachContractorToBuild"))
  .input({
    buildId: v.id("demo_builds"),
    contractorId: v.id("demo_contractors"),
    role: v.string(),
    actorPersona: v.optional(v.string()),
  })
  .returns(
    v.object({
      buildContractorId: v.union(v.id("demo_buildContractors"), v.null()),
      alreadyAttached: v.boolean(),
    })
  )
  .handler(async (ctx, args) => {
    const role = args.role.trim();
    if (!role) {
      throw new Error("empty_role");
    }
    const build = await ctx.db.get(args.buildId);
    if (!build) {
      throw new Error(`Build ${args.buildId} not found`);
    }
    const contractor = await ctx.db.get(args.contractorId);
    if (!contractor) {
      throw new Error(`Contractor ${args.contractorId} not found`);
    }
    if (contractor.scenario !== build.scenario) {
      throw new Error("scenario_mismatch");
    }
    const existing = await ctx.db
      .query("demo_buildContractors")
      .withIndex("by_build_contractor", (q) =>
        q.eq("buildId", args.buildId).eq("contractorId", args.contractorId)
      )
      .first();
    if (existing) {
      return { buildContractorId: null, alreadyAttached: true };
    }
    const now = Date.now();
    const buildContractorId = await ctx.db.insert("demo_buildContractors", {
      buildId: args.buildId,
      contractorId: args.contractorId,
      scenario: build.scenario,
      role,
      createdAt: now,
    });
    const actorPersona = args.actorPersona ?? "lender_admin";
    await ctx.db.insert("demo_auditEvents", {
      actorPersona,
      buildId: args.buildId,
      command: "demo_attachContractorToBuild",
      correlationId: `demo_attachContractorToBuild:${buildContractorId}:${now}`,
      createdAt: now,
      entityKey: buildContractorId,
      entityLabel: `${contractor.name} · ${role}`,
      entityType: "buildContractor",
      eventType: "contractor.attached",
      scenario: build.scenario,
      validation: "accepted",
    });
    return { buildContractorId, alreadyAttached: false };
  })
  .public();
export const demo_addBuildDocument = publicMutation
  .use(withMutationTiming("demo_drawflow_backoffice.addBuildDocument"))
  .input({
    buildId: v.id("demo_builds"),
    name: v.string(),
    kind: v.string(),
    sizeBytes: v.optional(v.number()),
    url: v.optional(v.string()),
    uploaderPersona: v.optional(v.string()),
  })
  .returns(v.id("demo_buildDocuments"))
  .handler(async (ctx, args) => {
    const name = args.name.trim();
    const kind = args.kind.trim();
    if (!name) {
      throw new Error("empty_name");
    }
    if (!kind) {
      throw new Error("empty_kind");
    }
    const build = await ctx.db.get(args.buildId);
    if (!build) {
      throw new Error(`Build ${args.buildId} not found`);
    }
    const now = Date.now();
    const uploaderPersona = args.uploaderPersona ?? "lender_admin";
    const id = await ctx.db.insert("demo_buildDocuments", {
      buildId: args.buildId,
      scenario: build.scenario,
      name,
      kind,
      sizeBytes: args.sizeBytes ?? 0,
      uploaderPersona,
      url: args.url,
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.insert("demo_auditEvents", {
      actorPersona: uploaderPersona,
      buildId: args.buildId,
      command: "demo_addBuildDocument",
      correlationId: `demo_addBuildDocument:${id}:${now}`,
      createdAt: now,
      entityKey: id,
      entityLabel: name,
      entityType: "buildDocument",
      eventType: `document.${kind}.added`,
      scenario: build.scenario,
      validation: "accepted",
    });
    return id;
  })
  .public();

export const demo_createAndAttachContractor = publicMutation
  .use(withMutationTiming("demo_drawflow_backoffice.createAndAttachContractor"))
  .input({
    buildId: v.id("demo_builds"),
    role: v.string(),
    contractor: v.object({
      name: v.string(),
      kind: v.union(v.literal("company"), v.literal("individual")),
      hourlyRateCents: v.number(),
      city: v.string(),
      skills: v.array(v.string()),
      trades: v.array(v.string()),
      phone: v.optional(v.string()),
      email: v.optional(v.string()),
    }),
    actorPersona: v.optional(v.string()),
  })
  .returns(
    v.object({
      contractorId: v.id("demo_contractors"),
      buildContractorId: v.id("demo_buildContractors"),
    })
  )
  .handler(async (ctx, args) => {
    const role = args.role.trim();
    if (!role) {
      throw new Error("empty_role");
    }
    const name = args.contractor.name.trim();
    if (!name) {
      throw new Error("empty_name");
    }
    const city = args.contractor.city.trim();
    if (!city) {
      throw new Error("empty_city");
    }
    if (
      !Number.isFinite(args.contractor.hourlyRateCents) ||
      args.contractor.hourlyRateCents < 0
    ) {
      throw new Error("invalid_hourly_rate");
    }
    const trades = args.contractor.trades
      .map((t) => t.trim())
      .filter((t) => t.length > 0);
    if (trades.length === 0) {
      throw new Error("empty_trades");
    }
    const skills = args.contractor.skills
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    const build = await ctx.db.get(args.buildId);
    if (!build) {
      throw new Error(`Build ${args.buildId} not found`);
    }
    // Builds carry scenario but not orgKey; derive orgKey from any existing
    // contractor in the same scenario, falling back to "demo".
    const sibling = await ctx.db
      .query("demo_contractors")
      .withIndex("by_scenario", (q) => q.eq("scenario", build.scenario))
      .first();
    const orgKey = sibling?.orgKey ?? "demo";
    const now = Date.now();
    const phone = args.contractor.phone?.trim() || undefined;
    const email = args.contractor.email?.trim() || undefined;
    const contractorId = await ctx.db.insert("demo_contractors", {
      orgKey,
      scenario: build.scenario,
      name,
      kind: args.contractor.kind,
      hourlyRateCents: Math.round(args.contractor.hourlyRateCents),
      city,
      skills,
      trades,
      phone,
      email,
      createdAt: now,
      updatedAt: now,
    });
    const buildContractorId = await ctx.db.insert("demo_buildContractors", {
      buildId: args.buildId,
      contractorId,
      scenario: build.scenario,
      role,
      createdAt: now,
    });
    const actorPersona = args.actorPersona ?? "lender_admin";
    await ctx.db.insert("demo_auditEvents", {
      actorPersona,
      buildId: args.buildId,
      command: "demo_createAndAttachContractor",
      correlationId: `demo_createAndAttachContractor:${buildContractorId}:${now}`,
      createdAt: now,
      entityKey: buildContractorId,
      entityLabel: `${name} · ${role}`,
      entityType: "buildContractor",
      eventType: "contractor.created_attached",
      scenario: build.scenario,
      validation: "accepted",
    });
    return { contractorId, buildContractorId };
  })
  .public();
