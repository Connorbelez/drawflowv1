import { v } from "convex/values";
import { DEMO_PERSONAS } from "./demo_personas";
import {
  coerceSiteVisitGuidanceInput,
  defaultSiteVisitGuidance,
  guidanceHtmlExceedsMaxLength,
  guidanceItemsToGuidance,
  guidanceToItems,
  normalizeSiteVisitGuidance,
  SITE_VISIT_GUIDANCE_HTML_MAX_LENGTH,
  type SiteVisitGuidance,
  type SiteVisitGuidanceField,
} from "./demo_site_visit_guidance";
import {
  publicMutation,
  publicQuery,
  withMutationTiming,
  withQueryTiming,
} from "./fluent";
import {
  GARDEN_SUITE_DEMO_TEMPLATE_KEY,
  GARDEN_SUITE_DESCRIPTION,
  GARDEN_SUITE_SECTIONS,
  GARDEN_SUITE_SUMMARY,
  GARDEN_SUITE_TEMPLATE_TITLE,
} from "./gardenSuiteTemplate";
import type { DatabaseReader, DatabaseWriter, Doc } from "./types";

const SEED_VERSION = 2;
const TOTAL_BPS = 10_000;
const TIMELINE_DEMO_SETTINGS_HANDOFF_GAP_DAYS = 5;
const TIMELINE_DEMO_SETTINGS_DRAW_OFFSET_DAYS = 2;
const TIMELINE_DEMO_KEY_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const NOW = Date.parse("2026-05-20T18:34:00.000Z");

function canonicalTimelineDemoKey(value: string) {
  return value.trim().toLowerCase().replaceAll("_", "-");
}

type DemoSettingsSiteVisitGuidanceInput = {
  cameraAngles: SiteVisitGuidanceField;
  whatToVerify: SiteVisitGuidanceField;
};

const iconValidator = v.union(
  v.literal("change"),
  v.literal("closeout"),
  v.literal("drywall"),
  v.literal("exterior"),
  v.literal("finishes"),
  v.literal("foundation"),
  v.literal("framing"),
  v.literal("kitchen"),
  v.literal("plumbing"),
  v.literal("roofing"),
  v.literal("roughIn")
);

const scenarioDrawInputValidator = v.object({
  amountBps: v.number(),
  drawKey: v.string(),
  label: v.string(),
  order: v.number(),
  reviewNote: v.string(),
  timingDay: v.number(),
});

const siteVisitGuidanceFieldInputValidator = v.union(
  v.string(),
  v.array(v.string())
);

const siteVisitGuidanceInputValidator = v.object({
  cameraAngles: siteVisitGuidanceFieldInputValidator,
  whatToVerify: siteVisitGuidanceFieldInputValidator,
});

const milestoneInputValidator = v.object({
  dependencyKeys: v.array(v.string()),
  durationDays: v.number(),
  icon: iconValidator,
  included: v.boolean(),
  milestoneKey: v.string(),
  name: v.string(),
  order: v.number(),
  percentageBps: v.number(),
  siteVisitGuidance: v.optional(siteVisitGuidanceInputValidator),
  submilestones: v.array(
    v.object({
      description: v.string(),
      durationDays: v.number(),
      name: v.string(),
      order: v.number(),
      percentageBps: v.number(),
      submilestoneKey: v.string(),
    })
  ),
  type: v.string(),
});

const scenarioInputValidator = v.object({
  description: v.string(),
  draws: v.array(scenarioDrawInputValidator),
  isActive: v.boolean(),
  isDefault: v.boolean(),
  name: v.string(),
  scenarioKey: v.string(),
  sortOrder: v.number(),
});

interface SeedSubmilestone {
  description: string;
  durationDays: number;
  name: string;
  percentageBps: number;
  submilestoneKey: string;
}

interface SeedMilestone {
  dependencyKeys: string[];
  durationDays: number;
  icon:
    | "change"
    | "closeout"
    | "drywall"
    | "exterior"
    | "finishes"
    | "foundation"
    | "framing"
    | "kitchen"
    | "plumbing"
    | "roofing"
    | "roughIn";
  included: boolean;
  milestoneKey: string;
  name: string;
  percentageBps: number;
  siteVisitGuidance: SiteVisitGuidance;
  submilestones: SeedSubmilestone[];
  type: string;
}

interface SeedDraw {
  amountBps: number;
  drawKey: string;
  label: string;
  reviewNote: string;
  timingDay: number;
}

interface SeedScenario {
  description: string;
  draws: SeedDraw[];
  isActive: boolean;
  isDefault: boolean;
  name: string;
  scenarioKey: string;
}

interface SeedTemplate {
  description: string;
  isDefault: boolean;
  milestones: SeedMilestone[];
  scenarios: SeedScenario[];
  summary: string;
  templateKey: string;
  title: string;
}

type ReadCtx = { db: DatabaseReader };
type WriteCtx = { db: DatabaseWriter };
type MilestoneInput = {
  dependencyKeys: string[];
  durationDays: number;
  icon: SeedMilestone["icon"];
  included: boolean;
  milestoneKey: string;
  name: string;
  order: number;
  percentageBps: number;
  siteVisitGuidance?: SiteVisitGuidance;
  submilestones: (SeedSubmilestone & { order: number })[];
  type: string;
};

type MilestoneInputDraft = Omit<MilestoneInput, "siteVisitGuidance"> & {
  siteVisitGuidance?: DemoSettingsSiteVisitGuidanceInput;
};

function normalizeMilestoneInputs(
  rows: MilestoneInputDraft[]
): MilestoneInput[] {
  return rows.map((row) => ({
    ...row,
    siteVisitGuidance: row.siteVisitGuidance
      ? coerceSiteVisitGuidanceInput(row.siteVisitGuidance)
      : undefined,
  }));
}
type ScenarioInput = {
  description: string;
  draws: (SeedDraw & { order: number })[];
  isActive: boolean;
  isDefault: boolean;
  name: string;
  scenarioKey: string;
  sortOrder: number;
};
type MilestoneScheduleInput = {
  durationDays: number;
  included: boolean;
  milestoneKey: string;
  name: string;
  order: number;
};
type ScenarioDrawScheduleInput = {
  label: string;
  timingDay: number;
};
type MilestoneDrawWindow = {
  afterMilestoneEndDay: number;
  afterMilestoneKey: string;
  afterMilestoneName: string;
  beforeMilestoneKey: string;
  beforeMilestoneName?: string;
  beforeMilestoneStartDay: number;
};

const DEFAULT_TEMPLATES: SeedTemplate[] = [
  {
    description:
      "Ground-up single family construction roadmap for live draw planning demos.",
    isDefault: true,
    milestones: [
      milestone("site-prep", "Site prep & foundation", 1000, 14, "foundation", [
        "Permit mobilization",
        "Excavation",
        "Concrete forms",
        "Foundation pour",
      ]),
      milestone("framing", "Framing & structure", 1280, 18, "framing", [
        "Wall framing",
        "Roof trusses",
        "Structural sheathing",
      ]),
      milestone("rough-in", "Rough-in mechanical", 1960, 20, "roughIn", [
        "Plumbing rough-in",
        "Electrical rough-in",
        "HVAC ducts",
      ]),
      milestone("exterior", "Windows & exterior", 1680, 18, "exterior", [
        "Window install",
        "Weather barrier",
        "Exterior doors",
      ]),
      milestone("drywall", "Inspections & drywall", 1520, 16, "drywall", [
        "Rough-in inspection",
        "Insulation",
        "Drywall hang",
      ]),
      milestone("finishes", "Finishes & fixtures", 1280, 12, "finishes", [
        "Cabinetry",
        "Flooring",
        "Fixture set",
      ]),
      milestone(
        "closeout",
        "Final inspection & closeout",
        1280,
        4,
        "closeout",
        ["Punch list", "Final inspection", "Closeout package"]
      ),
    ],
    scenarios: [
      scenario("standard-reimbursement", "Standard reimbursement", true, [
        draw("draw-01", "Draw 01", 16, 2000, "Foundation complete"),
        draw("draw-02", "Draw 02", 39, 2500, "Framing verified"),
        draw("draw-03", "Draw 03", 64, 2500, "Rough-in approved"),
        draw("draw-04", "Draw 04", 108, 2000, "Envelope and drywall reviewed"),
        draw(
          "draw-05",
          "Draw 05",
          125,
          1000,
          "Finishes accepted before closeout"
        ),
      ]),
      scenario("conservative-review-lag", "Conservative review lag", false, [
        draw("draw-01", "Draw 01", 18, 1800, "Foundation plus review lag"),
        draw("draw-02", "Draw 02", 41, 2200, "Framing plus review lag"),
        draw("draw-03", "Draw 03", 66, 2500, "Rough-in plus review lag"),
        draw("draw-04", "Draw 04", 110, 2200, "Drywall plus review lag"),
        draw("draw-05", "Draw 05", 127, 1300, "Finishes plus review lag"),
      ]),
    ],
    summary: "7 milestones, 100.00% PoC, 102 field days",
    templateKey: "single-family-full-build",
    title: "Single Family Full Build",
  },
  {
    description:
      "Selective renovation path for quicker inspection cadence and lighter scope.",
    isDefault: false,
    milestones: [
      milestone(
        "renovation-permits",
        "Permit updates and mobilization",
        800,
        10,
        "foundation",
        ["Permit update", "Site protection"]
      ),
      milestone("selective-demo", "Selective demolition", 1400, 16, "change", [
        "Interior demo",
        "Waste removal",
      ]),
      milestone(
        "structural-repairs",
        "Structural repairs",
        1800,
        18,
        "framing",
        ["Beam repairs", "Blocking"]
      ),
      milestone("envelope-repairs", "Envelope repairs", 1500, 12, "exterior", [
        "Flashing",
        "Window repairs",
      ]),
      milestone("rough-in-refresh", "Rough-in refresh", 1500, 14, "roughIn", [
        "Electrical",
        "Plumbing",
      ]),
      milestone("interior-rebuild", "Interior rebuild", 2200, 14, "finishes", [
        "Drywall",
        "Millwork",
      ]),
      milestone(
        "renovation-closeout",
        "Inspection closeout",
        800,
        2,
        "closeout",
        ["Deficiency list", "Final signoff"]
      ),
    ],
    scenarios: [
      scenario("quick-inspection", "Quick inspection", true, [
        draw("draw-01", "Draw 01", 33, 2200, "Demolition complete"),
        draw("draw-02", "Draw 02", 57, 2800, "Structure reviewed"),
        draw("draw-03", "Draw 03", 93, 3000, "Rough-in refresh complete"),
        draw(
          "draw-04",
          "Draw 04",
          111,
          2000,
          "Interior rebuild substantially complete"
        ),
      ]),
    ],
    summary: "7 milestones, 100.00% PoC, 86 days",
    templateKey: "single-family-renovation",
    title: "Single Family Renovation",
  },
  {
    description:
      "Multi-unit build template with heavier envelope and closeout coordination.",
    isDefault: false,
    milestones: [
      milestone(
        "multiplex-sitework",
        "Sitework and servicing",
        900,
        18,
        "foundation",
        ["Survey", "Civil servicing"]
      ),
      milestone(
        "multiplex-foundation",
        "Foundation podium",
        1600,
        26,
        "foundation",
        ["Footings", "Foundation walls"]
      ),
      milestone(
        "multiplex-framing",
        "Multi-plex framing",
        2200,
        30,
        "framing",
        ["Floor framing", "Party walls"]
      ),
      milestone(
        "multiplex-rough-in",
        "Stacked rough-ins",
        1800,
        28,
        "roughIn",
        ["Electrical stacks", "Mechanical shafts"]
      ),
      milestone(
        "multiplex-envelope",
        "Envelope and windows",
        1500,
        18,
        "exterior",
        ["Windows", "Cladding"]
      ),
      milestone("multiplex-finishes", "Suite finishes", 1400, 20, "finishes", [
        "Drywall",
        "Cabinets",
      ]),
      milestone(
        "multiplex-closeout",
        "Occupancy closeout",
        600,
        6,
        "closeout",
        ["Life safety", "Occupancy package"]
      ),
    ],
    scenarios: [
      scenario("standard-multiplex", "Standard multi-plex", true, [
        draw("draw-01", "Draw 01", 51, 2500, "Foundation podium accepted"),
        draw("draw-02", "Draw 02", 86, 2500, "Framing inspection"),
        draw("draw-03", "Draw 03", 119, 2000, "Rough-in review"),
        draw("draw-04", "Draw 04", 143, 2000, "Envelope review"),
        draw("draw-05", "Draw 05", 167, 1000, "Suite finishes accepted"),
      ]),
    ],
    summary: "7 milestones, 100.00% PoC, 146 days",
    templateKey: "multiplex-build",
    title: "Multi-plex Build",
  },
  {
    description: GARDEN_SUITE_DESCRIPTION,
    isDefault: false,
    milestones: gardenSuiteDemoMilestones(),
    scenarios: [
      scenario(
        "standard-garden-suite-reimbursement",
        "Standard Garden Suite reimbursement",
        true,
        [
          draw(
            "draw-01",
            "Draw 01",
            48,
            2603,
            "Soft costs, site servicing, and foundation verified"
          ),
          draw(
            "draw-02",
            "Draw 02",
            95,
            2449,
            "Framing, envelope, windows, and exterior doors verified"
          ),
          draw(
            "draw-03",
            "Draw 03",
            142,
            1955,
            "Mechanical, electrical, insulation, and drywall verified"
          ),
          draw(
            "draw-04",
            "Draw 04",
            192,
            2306,
            "Flooring, trim, kitchen, and bathroom scope verified"
          ),
          draw(
            "draw-05",
            "Draw 05",
            218,
            687,
            "Exterior site finishes, laundry equipment, and closeout verified"
          ),
        ]
      ),
    ],
    summary: GARDEN_SUITE_SUMMARY,
    templateKey: GARDEN_SUITE_DEMO_TEMPLATE_KEY,
    title: GARDEN_SUITE_TEMPLATE_TITLE,
  },
];

assertHardCodedDefaultTemplatesConform();

export const getTimelineDemoSettings = publicQuery
  .use(withQueryTiming("demo_settings.getTimelineDemoSettings"))
  .input({})
  .returns(v.any())
  .handler(async (ctx) => await buildSettingsProjection(ctx))
  .public();

export const seedTimelineDemoDefaults = publicMutation
  .use(withMutationTiming("demo_settings.seedTimelineDemoDefaults"))
  .input({})
  .returns(v.any())
  .handler(async (ctx) => {
    const result = await seedDefaults(ctx);
    await insertEvent(ctx, {
      command: "seedTimelineDemoDefaults",
      entityKey: "timeline-demo",
      entityType: "timelineDemoSettings",
      eventType: "seed_defaults",
      newState: JSON.stringify(result),
      warnings: [],
    });
    return {
      ...result,
      settings: await buildSettingsProjection(ctx),
    };
  })
  .public();

export const listDemoPersonas = publicQuery
  .use(withQueryTiming("demo_settings.listDemoPersonas"))
  .input({})
  .returns(v.any())
  .handler(async (ctx) => {
    const rows = await ctx.db.query("demo_personas").take(50);
    return rows.sort((a, b) => a.key.localeCompare(b.key));
  })
  .public();

export const saveTimelineTemplateConfiguration = publicMutation
  .use(withMutationTiming("demo_settings.saveTimelineTemplateConfiguration"))
  .input({
    milestones: v.array(milestoneInputValidator),
    scenarios: v.array(scenarioInputValidator),
    template: v.object({
      description: v.string(),
      isDefault: v.boolean(),
      summary: v.string(),
      templateKey: v.string(),
      title: v.string(),
    }),
  })
  .returns(v.any())
  .handler(async (ctx, args) => {
    const milestones = normalizeMilestoneInputs(args.milestones);
    validateTemplateKey(args.template.templateKey);
    validateTemplateRows(milestones);
    validateScenarios(args.scenarios, milestones);
    await upsertTemplate(ctx, args.template, 0, true);
    await replaceTemplateMilestones(ctx, args.template.templateKey, milestones);
    for (const scenarioRow of args.scenarios) {
      await upsertScenario(ctx, args.template.templateKey, scenarioRow, true);
      await replaceScenarioDraws(
        ctx,
        args.template.templateKey,
        scenarioRow.scenarioKey,
        scenarioRow.draws
      );
    }
    await enforceSingleActiveScenario(
      ctx,
      args.template.templateKey,
      args.scenarios.find((scenarioRow) => scenarioRow.isActive)?.scenarioKey
    );
    await insertEvent(ctx, {
      command: "saveTimelineTemplateConfiguration",
      entityKey: args.template.templateKey,
      entityType: "timelineTemplate",
      eventType: "template_configuration_saved",
      newState: JSON.stringify({
        milestoneCount: milestones.length,
        scenarioCount: args.scenarios.length,
      }),
      warnings: [],
    });
    return await buildSettingsProjection(ctx);
  })
  .public();

export const saveTimelineTemplateWorksheet = publicMutation
  .use(withMutationTiming("demo_settings.saveTimelineTemplateWorksheet"))
  .input({
    milestones: v.array(milestoneInputValidator),
    templateKey: v.string(),
  })
  .returns(v.any())
  .handler(async (ctx, args) => {
    const milestones = normalizeMilestoneInputs(args.milestones);
    validateTemplateRows(milestones);
    await replaceTemplateMilestones(ctx, args.templateKey, milestones);
    await insertEvent(ctx, {
      command: "saveTimelineTemplateWorksheet",
      entityKey: args.templateKey,
      entityType: "timelineTemplate",
      eventType: "template_worksheet_saved",
      warnings: [],
    });
    return await buildSettingsProjection(ctx);
  })
  .public();

export const createTimelineDrawScenario = publicMutation
  .use(withMutationTiming("demo_settings.createTimelineDrawScenario"))
  .input({
    mode: v.union(
      v.literal("blank"),
      v.literal("duplicate"),
      v.literal("generated-standard")
    ),
    sourceScenarioKey: v.optional(v.string()),
    templateKey: v.string(),
  })
  .returns(v.any())
  .handler(async (ctx, args) => {
    const scenarios = await listScenarios(ctx, args.templateKey);
    const milestones = await listMilestones(ctx, args.templateKey);
    const key = uniqueKey(
      `${args.mode}-scenario`,
      scenarios.map((row) => row.scenarioKey)
    );
    const source = args.sourceScenarioKey
      ? scenarios.find((row) => row.scenarioKey === args.sourceScenarioKey)
      : null;
    const sourceDraws = source
      ? await listScenarioDraws(ctx, args.templateKey, source.scenarioKey)
      : [];
    const scenarioRow: ScenarioInput = {
      description:
        source?.description ??
        "Editable scenario draft for timeline demo reimbursement timing.",
      draws:
        sourceDraws.length > 0
          ? sourceDraws.map((row, order) => ({
              amountBps: row.amountBps,
              drawKey: uniqueKey(row.drawKey, []),
              label: row.label,
              order,
              reviewNote: row.reviewNote,
              timingDay: row.timingDay,
            }))
          : [
              {
                ...draw(
                  "draw-01",
                  "Draw 01",
                  defaultDrawTimingDay(milestones),
                  TOTAL_BPS,
                  "Generated standard draw"
                ),
                order: 0,
              },
            ],
      isActive: scenarios.length === 0,
      isDefault: false,
      name: source ? `${source.name} copy` : "New reimbursement scenario",
      scenarioKey: key,
      sortOrder: scenarios.length,
    };
    validateScenarios([scenarioRow], milestones);
    await upsertScenario(ctx, args.templateKey, scenarioRow, false);
    await replaceScenarioDraws(ctx, args.templateKey, key, scenarioRow.draws);
    await insertEvent(ctx, {
      command: "createTimelineDrawScenario",
      entityKey: `${args.templateKey}:${key}`,
      entityType: "timelineDrawScenario",
      eventType: "scenario_created",
      warnings: [],
    });
    return await buildSettingsProjection(ctx);
  })
  .public();

export const saveTimelineDrawScenario = publicMutation
  .use(withMutationTiming("demo_settings.saveTimelineDrawScenario"))
  .input({
    scenario: scenarioInputValidator,
    templateKey: v.string(),
  })
  .returns(v.any())
  .handler(async (ctx, args) => {
    const milestones = await listMilestones(ctx, args.templateKey);
    validateScenarios([args.scenario], milestones);
    await upsertScenario(ctx, args.templateKey, args.scenario, true);
    await replaceScenarioDraws(
      ctx,
      args.templateKey,
      args.scenario.scenarioKey,
      args.scenario.draws
    );
    if (args.scenario.isActive) {
      await enforceSingleActiveScenario(
        ctx,
        args.templateKey,
        args.scenario.scenarioKey
      );
    }
    await insertEvent(ctx, {
      command: "saveTimelineDrawScenario",
      entityKey: `${args.templateKey}:${args.scenario.scenarioKey}`,
      entityType: "timelineDrawScenario",
      eventType: "scenario_saved",
      warnings: [],
    });
    return await buildSettingsProjection(ctx);
  })
  .public();

export const setActiveTimelineDrawScenario = publicMutation
  .use(withMutationTiming("demo_settings.setActiveTimelineDrawScenario"))
  .input({
    scenarioKey: v.string(),
    templateKey: v.string(),
  })
  .returns(v.any())
  .handler(async (ctx, args) => {
    const milestones = await listMilestones(ctx, args.templateKey);
    validateScenarioDrawRows(
      await listScenarioDraws(ctx, args.templateKey, args.scenarioKey),
      milestones
    );
    await enforceSingleActiveScenario(ctx, args.templateKey, args.scenarioKey);
    await insertEvent(ctx, {
      command: "setActiveTimelineDrawScenario",
      entityKey: `${args.templateKey}:${args.scenarioKey}`,
      entityType: "timelineDrawScenario",
      eventType: "active_scenario_changed",
      warnings: [],
    });
    return await buildSettingsProjection(ctx);
  })
  .public();

export const deleteTimelineDrawScenario = publicMutation
  .use(withMutationTiming("demo_settings.deleteTimelineDrawScenario"))
  .input({
    scenarioKey: v.string(),
    templateKey: v.string(),
  })
  .returns(v.any())
  .handler(async (ctx, args) => {
    const scenarioRow = await getScenario(
      ctx,
      args.templateKey,
      args.scenarioKey
    );
    if (!scenarioRow) {
      return await buildSettingsProjection(ctx);
    }
    if (scenarioRow.isActive) {
      throw new Error("Active scenario cannot be deleted.");
    }
    await deleteScenarioDraws(ctx, args.templateKey, args.scenarioKey);
    await ctx.db.delete(scenarioRow._id);
    await insertEvent(ctx, {
      command: "deleteTimelineDrawScenario",
      entityKey: `${args.templateKey}:${args.scenarioKey}`,
      entityType: "timelineDrawScenario",
      eventType: "scenario_deleted",
      warnings: [],
    });
    return await buildSettingsProjection(ctx);
  })
  .public();

export const resetTimelineTemplateToDefaults = publicMutation
  .use(withMutationTiming("demo_settings.resetTimelineTemplateToDefaults"))
  .input({ templateKey: v.string() })
  .returns(v.any())
  .handler(async (ctx, args) => {
    const seed = requiredSeedTemplate(args.templateKey);
    await upsertTemplate(ctx, seed, seedIndex(seed.templateKey), true);
    await replaceTemplateMilestones(
      ctx,
      seed.templateKey,
      seed.milestones.map(toMilestoneInput)
    );
    await insertEvent(ctx, {
      command: "resetTimelineTemplateToDefaults",
      entityKey: seed.templateKey,
      entityType: "timelineTemplate",
      eventType: "template_reset",
      warnings: [],
    });
    return await buildSettingsProjection(ctx);
  })
  .public();

export const resetTimelineDrawScenarioToDefaults = publicMutation
  .use(withMutationTiming("demo_settings.resetTimelineDrawScenarioToDefaults"))
  .input({
    scenarioKey: v.string(),
    templateKey: v.string(),
  })
  .returns(v.any())
  .handler(async (ctx, args) => {
    const seed = requiredSeedTemplate(args.templateKey);
    const scenarioKey = canonicalTimelineDemoKey(args.scenarioKey);
    const scenarioRow = seed.scenarios.find(
      (row) => row.scenarioKey === scenarioKey
    );
    if (!scenarioRow) {
      throw new Error("No default scenario exists for reset.");
    }
    await upsertScenario(
      ctx,
      seed.templateKey,
      toScenarioInput(scenarioRow, seed.scenarios.indexOf(scenarioRow)),
      true
    );
    await replaceScenarioDraws(
      ctx,
      seed.templateKey,
      scenarioRow.scenarioKey,
      scenarioRow.draws.map((row, order) => ({ ...row, order }))
    );
    await insertEvent(ctx, {
      command: "resetTimelineDrawScenarioToDefaults",
      entityKey: `${seed.templateKey}:${scenarioRow.scenarioKey}`,
      entityType: "timelineDrawScenario",
      eventType: "scenario_reset",
      warnings: [],
    });
    return await buildSettingsProjection(ctx);
  })
  .public();

function milestone(
  milestoneKey: string,
  name: string,
  percentageBps: number,
  durationDays: number,
  icon: SeedMilestone["icon"],
  subNames: string[]
): SeedMilestone {
  const base = Math.floor(percentageBps / subNames.length);
  const remainder = percentageBps - base * subNames.length;
  const submilestones = subNames.map((subName, index) => ({
    description:
      index % 2 === 0 ? "Field completion target" : "Lender review checkpoint",
    durationDays: Math.max(1, Math.round(durationDays / subNames.length)),
    name: subName,
    percentageBps: base + (index < remainder ? 1 : 0),
    submilestoneKey: `${milestoneKey}-${slug(subName)}-${index}`,
  }));
  return {
    dependencyKeys: [],
    durationDays,
    icon,
    included: true,
    milestoneKey,
    name,
    percentageBps,
    siteVisitGuidance: defaultSiteVisitGuidance(
      milestoneKey,
      name,
      submilestones.map((row) => row.name)
    ),
    submilestones,
    type: icon,
  };
}

function gardenSuiteDemoMilestones(): SeedMilestone[] {
  return GARDEN_SUITE_SECTIONS.map((section) => {
    const submilestones = section.submilestones.map((submilestone, index) => ({
      description: "Workbook budget line item",
      durationDays: submilestone.durationDays,
      name: submilestone.name,
      percentageBps: submilestone.percentageBps,
      submilestoneKey: `${section.key}-${slug(submilestone.name)}-${index}`,
    }));
    return {
      dependencyKeys: [],
      durationDays: section.durationDays,
      icon: section.icon,
      included: true,
      milestoneKey: section.key,
      name: section.name,
      percentageBps: section.percentageBps,
      siteVisitGuidance: defaultSiteVisitGuidance(
        section.key,
        section.name,
        submilestones.map((row) => row.name)
      ),
      submilestones,
      type: section.icon,
    };
  });
}

function scenario(
  scenarioKey: string,
  name: string,
  isActive: boolean,
  draws: SeedDraw[]
): SeedScenario {
  return {
    description: `${name} draw timing and reimbursement amount assumptions.`,
    draws,
    isActive,
    isDefault: true,
    name,
    scenarioKey,
  };
}

function draw(
  drawKey: string,
  label: string,
  timingDay: number,
  amountBps: number,
  reviewNote: string
): SeedDraw {
  return { amountBps, drawKey, label, reviewNote, timingDay };
}

async function buildSettingsProjection(ctx: ReadCtx) {
  const templates = await ctx.db.query("demo_timelineTemplates").take(20);
  const sortedTemplates = [...templates].sort(
    (a, b) =>
      a.sortOrder - b.sortOrder || a.templateKey.localeCompare(b.templateKey)
  );
  const templateProjections = [];

  for (const templateRow of sortedTemplates) {
    const canonicalTemplateKey = canonicalTimelineDemoKey(
      templateRow.templateKey
    );
    const milestones = await listMilestones(ctx, templateRow.templateKey);
    const guidanceItems = await listGuidanceItemsForTemplate(
      ctx,
      templateRow.templateKey
    );
    const scenarios = await listScenarios(ctx, templateRow.templateKey);
    const scenarioProjections = [];
    for (const scenarioRow of scenarios) {
      const canonicalScenarioKey = canonicalTimelineDemoKey(
        scenarioRow.scenarioKey
      );
      const draws = await listScenarioDraws(
        ctx,
        templateRow.templateKey,
        scenarioRow.scenarioKey
      );
      scenarioProjections.push({
        ...scenarioRow,
        scenarioKey: canonicalScenarioKey,
        templateKey: canonicalTemplateKey,
        draws: draws.map((draw) => ({
          ...draw,
          scenarioKey: canonicalScenarioKey,
          templateKey: canonicalTemplateKey,
        })),
      });
    }
    const activeScenario =
      scenarioProjections.find((scenarioRow) => scenarioRow.isActive) ?? null;
    templateProjections.push({
      ...templateRow,
      templateKey: canonicalTemplateKey,
      activeScenarioKey: activeScenario?.scenarioKey ?? null,
      activeScenarioName: activeScenario?.name ?? null,
      milestones: milestones.map((milestone) => ({
        ...milestone,
        templateKey: canonicalTemplateKey,
      })),
      scenarios: scenarioProjections,
      status: templateStatus(
        canonicalTemplateKey,
        milestones,
        scenarioProjections
      ),
      guidanceItems: guidanceItems.map((item) => ({
        ...item,
        templateKey: canonicalTemplateKey,
      })),
      submilestones: (
        await listSubmilestonesForTemplate(ctx, templateRow.templateKey)
      ).map((submilestone) => ({
        ...submilestone,
        templateKey: canonicalTemplateKey,
      })),
    });
  }

  const events = await ctx.db
    .query("demo_timelineSettingsEvents")
    .order("desc")
    .take(25);

  return {
    completeness: settingsCompleteness(templateProjections),
    events,
    seedVersion: SEED_VERSION,
    templates: templateProjections,
  };
}

async function seedDefaults(ctx: WriteCtx) {
  await clearTimelineDemoSettings(ctx);
  const inserted = {
    draws: 0,
    guidanceItems: 0,
    guidanceMilestones: 0,
    milestones: 0,
    personas: 0,
    scenarios: 0,
    submilestones: 0,
    templates: 0,
  };
  inserted.personas = await upsertDemoPersonas(ctx);
  for (const [templateIndex, templateRow] of DEFAULT_TEMPLATES.entries()) {
    if (await upsertTemplate(ctx, templateRow, templateIndex, false)) {
      inserted.templates += 1;
    }
    for (const [
      milestoneIndex,
      milestoneRow,
    ] of templateRow.milestones.entries()) {
      if (
        await insertMissingMilestone(
          ctx,
          templateRow.templateKey,
          milestoneRow,
          milestoneIndex
        )
      ) {
        inserted.milestones += 1;
      }
      for (const [subIndex, subRow] of milestoneRow.submilestones.entries()) {
        if (
          await insertMissingSubmilestone(
            ctx,
            templateRow.templateKey,
            milestoneRow.milestoneKey,
            subRow,
            subIndex
          )
        ) {
          inserted.submilestones += 1;
        }
      }
      const guidanceResult = await insertMissingTemplateGuidance(
        ctx,
        templateRow.templateKey,
        milestoneRow
      );
      inserted.guidanceMilestones += guidanceResult.guidanceMilestones;
      inserted.guidanceItems += guidanceResult.guidanceItems;
    }
    const existingScenarios = await listScenarios(ctx, templateRow.templateKey);
    for (const [
      scenarioIndex,
      scenarioRow,
    ] of templateRow.scenarios.entries()) {
      if (
        await upsertScenario(
          ctx,
          templateRow.templateKey,
          toScenarioInput(scenarioRow, scenarioIndex),
          false
        )
      ) {
        inserted.scenarios += 1;
      }
      for (const [drawIndex, drawRow] of scenarioRow.draws.entries()) {
        if (
          await insertMissingDraw(
            ctx,
            templateRow.templateKey,
            scenarioRow.scenarioKey,
            drawRow,
            drawIndex
          )
        ) {
          inserted.draws += 1;
        }
      }
    }
    const activeAfterSeed = (
      await listScenarios(ctx, templateRow.templateKey)
    ).filter((row) => row.isActive);
    if (
      activeAfterSeed.length === 0 &&
      existingScenarios.length === 0 &&
      templateRow.scenarios[0]
    ) {
      await enforceSingleActiveScenario(
        ctx,
        templateRow.templateKey,
        templateRow.scenarios[0].scenarioKey
      );
    }
  }
  return inserted;
}

async function upsertDemoPersonas(ctx: WriteCtx) {
  let changed = 0;
  for (const persona of DEMO_PERSONAS) {
    const existing = await ctx.db
      .query("demo_personas")
      .withIndex("by_key", (q) => q.eq("key", persona.key))
      .unique();
    const nextRow = {
      createdAt: existing?.createdAt ?? NOW,
      key: persona.key,
      label: persona.label,
      role: persona.role,
      updatedAt: NOW,
    };
    if (existing) {
      await ctx.db.patch(existing._id, nextRow);
    } else {
      await ctx.db.insert("demo_personas", nextRow);
    }
    changed += 1;
  }
  return changed;
}

async function clearTimelineDemoSettings(ctx: WriteCtx) {
  for (const row of await ctx.db
    .query("demo_timelineDrawScenarioDraws")
    .take(500)) {
    await ctx.db.delete(row._id);
  }
  for (const row of await ctx.db
    .query("demo_timelineDrawScenarios")
    .take(200)) {
    await ctx.db.delete(row._id);
  }
  for (const row of await ctx.db
    .query("demo_timelineTemplateSubmilestones")
    .take(500)) {
    await ctx.db.delete(row._id);
  }
  for (const row of await ctx.db
    .query("demo_timelineTemplateMilestoneGuidanceItems")
    .take(500)) {
    await ctx.db.delete(row._id);
  }
  for (const row of await ctx.db
    .query("demo_timelineTemplateMilestoneGuidance")
    .take(200)) {
    await ctx.db.delete(row._id);
  }
  for (const row of await ctx.db
    .query("demo_timelineTemplateMilestones")
    .take(200)) {
    await ctx.db.delete(row._id);
  }
  for (const row of await ctx.db.query("demo_timelineTemplates").take(100)) {
    await ctx.db.delete(row._id);
  }
}

async function upsertTemplate(
  ctx: WriteCtx,
  templateRow: Pick<
    SeedTemplate,
    "description" | "isDefault" | "summary" | "templateKey" | "title"
  >,
  sortOrder: number,
  overwrite: boolean
) {
  const existing = await ctx.db
    .query("demo_timelineTemplates")
    .withIndex("by_template", (q) =>
      q.eq("templateKey", templateRow.templateKey)
    )
    .unique();
  if (existing && !overwrite) {
    return false;
  }
  const nextRow = {
    createdAt: existing?._creationTime ?? NOW,
    description: templateRow.description,
    isDefault: templateRow.isDefault,
    seedVersion: SEED_VERSION,
    sortOrder,
    summary: templateRow.summary,
    templateKey: templateRow.templateKey,
    title: templateRow.title,
    updatedAt: NOW,
  };
  if (existing) {
    await ctx.db.replace(existing._id, nextRow);
    return false;
  }
  await ctx.db.insert("demo_timelineTemplates", nextRow);
  return true;
}

async function insertMissingMilestone(
  ctx: WriteCtx,
  templateKey: string,
  milestoneRow: SeedMilestone,
  order: number
) {
  const existing = await getMilestone(
    ctx,
    templateKey,
    milestoneRow.milestoneKey
  );
  if (existing) {
    return false;
  }
  await ctx.db.insert("demo_timelineTemplateMilestones", {
    createdAt: NOW,
    dependencyKeys: milestoneRow.dependencyKeys,
    durationDays: milestoneRow.durationDays,
    icon: milestoneRow.icon,
    included: milestoneRow.included,
    milestoneKey: milestoneRow.milestoneKey,
    name: milestoneRow.name,
    order,
    percentageBps: milestoneRow.percentageBps,
    templateKey,
    type: milestoneRow.type,
    updatedAt: NOW,
  });
  return true;
}

async function insertMissingSubmilestone(
  ctx: WriteCtx,
  templateKey: string,
  milestoneKey: string,
  row: SeedSubmilestone,
  order: number
) {
  const existing = (
    await listSubmilestones(ctx, templateKey, milestoneKey)
  ).find((subRow) => subRow.submilestoneKey === row.submilestoneKey);
  if (existing) {
    return false;
  }
  await ctx.db.insert("demo_timelineTemplateSubmilestones", {
    createdAt: NOW,
    description: row.description,
    durationDays: row.durationDays,
    milestoneKey,
    name: row.name,
    order,
    percentageBps: row.percentageBps,
    submilestoneKey: row.submilestoneKey,
    templateKey,
    updatedAt: NOW,
  });
  return true;
}

async function insertMissingTemplateGuidance(
  ctx: WriteCtx,
  templateKey: string,
  milestoneRow: SeedMilestone
) {
  const existing = await getTemplateGuidance(
    ctx,
    templateKey,
    milestoneRow.milestoneKey
  );
  if (existing) {
    return { guidanceItems: 0, guidanceMilestones: 0 };
  }
  const guidanceId = await ctx.db.insert(
    "demo_timelineTemplateMilestoneGuidance",
    {
      createdAt: NOW,
      milestoneKey: milestoneRow.milestoneKey,
      templateKey,
      updatedAt: NOW,
    }
  );
  const items = guidanceToItems(
    milestoneRow.siteVisitGuidance,
    defaultSiteVisitGuidance(
      milestoneRow.milestoneKey,
      milestoneRow.name,
      milestoneRow.submilestones.map((row) => row.name)
    )
  );
  for (const item of items) {
    await ctx.db.insert("demo_timelineTemplateMilestoneGuidanceItems", {
      createdAt: NOW,
      guidanceId,
      kind: item.kind,
      milestoneKey: milestoneRow.milestoneKey,
      order: item.order ?? 0,
      templateKey,
      text: item.text,
      updatedAt: NOW,
    });
  }
  return { guidanceItems: items.length, guidanceMilestones: 1 };
}

async function upsertScenario(
  ctx: WriteCtx,
  templateKey: string,
  scenarioRow: ScenarioInput,
  overwrite: boolean
) {
  const existing = await getScenario(ctx, templateKey, scenarioRow.scenarioKey);
  if (existing && !overwrite) {
    return false;
  }
  const nextRow = {
    createdAt: existing?._creationTime ?? NOW,
    description: scenarioRow.description,
    isActive: scenarioRow.isActive,
    isDefault: scenarioRow.isDefault,
    name: scenarioRow.name,
    scenarioKey: scenarioRow.scenarioKey,
    seedVersion: SEED_VERSION,
    sortOrder: scenarioRow.sortOrder,
    templateKey,
    updatedAt: NOW,
  };
  if (existing) {
    await ctx.db.replace(existing._id, nextRow);
    return false;
  }
  await ctx.db.insert("demo_timelineDrawScenarios", nextRow);
  return true;
}

async function insertMissingDraw(
  ctx: WriteCtx,
  templateKey: string,
  scenarioKey: string,
  row: SeedDraw,
  order: number
) {
  const existing = (
    await listScenarioDraws(ctx, templateKey, scenarioKey)
  ).find((drawRow) => drawRow.drawKey === row.drawKey);
  if (existing) {
    return false;
  }
  await ctx.db.insert("demo_timelineDrawScenarioDraws", {
    amountBps: row.amountBps,
    amountMode: "percentage",
    createdAt: NOW,
    drawKey: row.drawKey,
    label: row.label,
    order,
    reviewNote: row.reviewNote,
    scenarioKey,
    templateKey,
    timingDay: row.timingDay,
    updatedAt: NOW,
  });
  return true;
}

async function replaceTemplateMilestones(
  ctx: WriteCtx,
  templateKey: string,
  rows: MilestoneInput[]
) {
  for (const row of await listMilestones(ctx, templateKey)) {
    await ctx.db.delete(row._id);
  }
  for (const row of await listSubmilestonesForTemplate(ctx, templateKey)) {
    await ctx.db.delete(row._id);
  }
  for (const row of await listTemplateGuidanceRows(ctx, templateKey)) {
    await deleteTemplateGuidance(ctx, row._id);
  }
  for (const [index, row] of rows.entries()) {
    await ctx.db.insert("demo_timelineTemplateMilestones", {
      createdAt: NOW,
      dependencyKeys: row.dependencyKeys,
      durationDays: row.durationDays,
      icon: row.icon,
      included: row.included,
      milestoneKey: row.milestoneKey,
      name: row.name,
      order: index,
      percentageBps: row.percentageBps,
      templateKey,
      type: row.type,
      updatedAt: NOW,
    });
    for (const [subIndex, subRow] of row.submilestones.entries()) {
      await ctx.db.insert("demo_timelineTemplateSubmilestones", {
        createdAt: NOW,
        description: subRow.description,
        durationDays: subRow.durationDays,
        milestoneKey: row.milestoneKey,
        name: subRow.name,
        order: subIndex,
        percentageBps: subRow.percentageBps,
        submilestoneKey: subRow.submilestoneKey,
        templateKey,
        updatedAt: NOW,
      });
    }
    await replaceTemplateGuidance(ctx, templateKey, row);
  }
}

async function replaceScenarioDraws(
  ctx: WriteCtx,
  templateKey: string,
  scenarioKey: string,
  rows: (SeedDraw & { order?: number })[]
) {
  await deleteScenarioDraws(ctx, templateKey, scenarioKey);
  for (const [index, row] of rows.entries()) {
    await ctx.db.insert("demo_timelineDrawScenarioDraws", {
      amountBps: row.amountBps,
      amountMode: "percentage",
      createdAt: NOW,
      drawKey: row.drawKey,
      label: row.label,
      order: row.order ?? index,
      reviewNote: row.reviewNote,
      scenarioKey,
      templateKey,
      timingDay: row.timingDay,
      updatedAt: NOW,
    });
  }
}

async function deleteScenarioDraws(
  ctx: WriteCtx,
  templateKey: string,
  scenarioKey: string
) {
  for (const row of await listScenarioDraws(ctx, templateKey, scenarioKey)) {
    await ctx.db.delete(row._id);
  }
}

async function enforceSingleActiveScenario(
  ctx: WriteCtx,
  templateKey: string,
  scenarioKey: string | undefined
) {
  if (!scenarioKey) {
    throw new Error("An active scenario is required.");
  }
  const scenarios = await listScenarios(ctx, templateKey);
  if (!scenarios.some((row) => row.scenarioKey === scenarioKey)) {
    throw new Error("Active scenario does not exist.");
  }
  for (const row of scenarios) {
    await ctx.db.patch(row._id, {
      isActive: row.scenarioKey === scenarioKey,
      updatedAt: NOW,
    });
  }
}

async function listMilestones(ctx: ReadCtx, templateKey: string) {
  return await ctx.db
    .query("demo_timelineTemplateMilestones")
    .withIndex("by_template_and_order", (q) => q.eq("templateKey", templateKey))
    .take(100);
}

async function getMilestone(
  ctx: ReadCtx,
  templateKey: string,
  milestoneKey: string
) {
  return await ctx.db
    .query("demo_timelineTemplateMilestones")
    .withIndex("by_milestone", (q) =>
      q.eq("templateKey", templateKey).eq("milestoneKey", milestoneKey)
    )
    .unique();
}

async function listSubmilestones(
  ctx: ReadCtx,
  templateKey: string,
  milestoneKey: string
) {
  return await ctx.db
    .query("demo_timelineTemplateSubmilestones")
    .withIndex("by_milestone_and_order", (q) =>
      q.eq("templateKey", templateKey).eq("milestoneKey", milestoneKey)
    )
    .take(100);
}

async function listSubmilestonesForTemplate(ctx: ReadCtx, templateKey: string) {
  const rows = [];
  const milestones = await listMilestones(ctx, templateKey);
  for (const milestoneRow of milestones) {
    rows.push(
      ...(await listSubmilestones(ctx, templateKey, milestoneRow.milestoneKey))
    );
  }
  return rows;
}

async function listTemplateGuidanceRows(ctx: ReadCtx, templateKey: string) {
  return await ctx.db
    .query("demo_timelineTemplateMilestoneGuidance")
    .withIndex("by_template", (q) => q.eq("templateKey", templateKey))
    .take(100);
}

async function getTemplateGuidance(
  ctx: ReadCtx,
  templateKey: string,
  milestoneKey: string
) {
  return await ctx.db
    .query("demo_timelineTemplateMilestoneGuidance")
    .withIndex("by_milestone", (q) =>
      q.eq("templateKey", templateKey).eq("milestoneKey", milestoneKey)
    )
    .unique();
}

async function listGuidanceItemsForTemplate(ctx: ReadCtx, templateKey: string) {
  const rows = [];
  for (const guidanceRow of await listTemplateGuidanceRows(ctx, templateKey)) {
    rows.push(...(await listTemplateGuidanceItems(ctx, guidanceRow._id)));
  }
  return rows.sort(
    (a, b) =>
      a.milestoneKey.localeCompare(b.milestoneKey) ||
      a.kind.localeCompare(b.kind) ||
      a.order - b.order
  );
}

async function listTemplateGuidanceItems(
  ctx: ReadCtx,
  guidanceId: Doc<"demo_timelineTemplateMilestoneGuidance">["_id"]
) {
  return await ctx.db
    .query("demo_timelineTemplateMilestoneGuidanceItems")
    .withIndex("by_guidance", (q) => q.eq("guidanceId", guidanceId))
    .take(100);
}

async function deleteTemplateGuidance(
  ctx: WriteCtx,
  guidanceId: Doc<"demo_timelineTemplateMilestoneGuidance">["_id"]
) {
  for (const item of await listTemplateGuidanceItems(ctx, guidanceId)) {
    await ctx.db.delete(item._id);
  }
  await ctx.db.delete(guidanceId);
}

async function replaceTemplateGuidance(
  ctx: WriteCtx,
  templateKey: string,
  row: MilestoneInput
) {
  const existing = await getTemplateGuidance(
    ctx,
    templateKey,
    row.milestoneKey
  );
  if (existing) {
    await deleteTemplateGuidance(ctx, existing._id);
  }
  const guidanceId = await ctx.db.insert(
    "demo_timelineTemplateMilestoneGuidance",
    {
      createdAt: NOW,
      milestoneKey: row.milestoneKey,
      templateKey,
      updatedAt: NOW,
    }
  );
  const guidance = normalizeSiteVisitGuidance(
    row.siteVisitGuidance,
    defaultSiteVisitGuidance(
      row.milestoneKey,
      row.name,
      row.submilestones.map((subRow) => subRow.name)
    )
  );
  for (const item of guidanceToItems(guidance)) {
    await ctx.db.insert("demo_timelineTemplateMilestoneGuidanceItems", {
      createdAt: NOW,
      guidanceId,
      kind: item.kind,
      milestoneKey: row.milestoneKey,
      order: item.order ?? 0,
      templateKey,
      text: item.text,
      updatedAt: NOW,
    });
  }
}

async function listScenarios(ctx: ReadCtx, templateKey: string) {
  const rows = await ctx.db
    .query("demo_timelineDrawScenarios")
    .withIndex("by_template", (q) => q.eq("templateKey", templateKey))
    .take(50);
  return rows.sort(
    (a, b) =>
      a.sortOrder - b.sortOrder || a.scenarioKey.localeCompare(b.scenarioKey)
  );
}

async function getScenario(
  ctx: ReadCtx,
  templateKey: string,
  scenarioKey: string
) {
  return await ctx.db
    .query("demo_timelineDrawScenarios")
    .withIndex("by_scenario", (q) =>
      q.eq("templateKey", templateKey).eq("scenarioKey", scenarioKey)
    )
    .unique();
}

async function listScenarioDraws(
  ctx: ReadCtx,
  templateKey: string,
  scenarioKey: string
) {
  const rows = await ctx.db
    .query("demo_timelineDrawScenarioDraws")
    .withIndex("by_scenario_and_order", (q) =>
      q.eq("templateKey", templateKey).eq("scenarioKey", scenarioKey)
    )
    .take(100);
  return rows.sort(
    (a, b) => a.order - b.order || a.drawKey.localeCompare(b.drawKey)
  );
}

async function insertEvent(
  ctx: WriteCtx,
  row: Omit<
    Doc<"demo_timelineSettingsEvents">,
    "_creationTime" | "_id" | "actorPersona" | "createdAt"
  >
) {
  await ctx.db.insert("demo_timelineSettingsEvents", {
    actorPersona: "demo-operator",
    createdAt: NOW,
    ...row,
  });
}

function templateStatus(
  templateKey: string,
  milestones: unknown[],
  scenarios: { draws: unknown[]; isActive: boolean }[]
) {
  const expected = requiredSeedTemplate(templateKey);
  const activeCount = scenarios.filter(
    (scenarioRow) => scenarioRow.isActive
  ).length;
  return {
    activeScenarioCount: activeCount,
    hasActiveScenario: activeCount === 1,
    hasRequiredMilestones: milestones.length >= expected.milestones.length,
    hasScenarioDraws: scenarios.every(
      (scenarioRow) => scenarioRow.draws.length > 0
    ),
    scenarioCount: scenarios.length,
    totalDurationDays: sumBy(
      milestones as { durationDays: number; included: boolean }[],
      (row) => (row.included ? row.durationDays : 0)
    ),
    totalPocBps: sumBy(
      milestones as { included: boolean; percentageBps: number }[],
      (row) => (row.included ? row.percentageBps : 0)
    ),
  };
}

function settingsCompleteness(
  templates: {
    status: ReturnType<typeof templateStatus>;
    templateKey: string;
  }[]
) {
  return {
    missingTemplateKeys: DEFAULT_TEMPLATES.map(
      (templateRow) => templateRow.templateKey
    ).filter(
      (templateKey) =>
        !templates.some(
          (templateRow) => templateRow.templateKey === templateKey
        )
    ),
    readyTemplateCount: templates.filter(
      (templateRow) =>
        templateRow.status.hasRequiredMilestones &&
        templateRow.status.hasActiveScenario &&
        templateRow.status.hasScenarioDraws
    ).length,
    requiredTemplateCount: DEFAULT_TEMPLATES.length,
    templateCount: templates.length,
  };
}

function validateTemplateRows(
  rows: {
    durationDays: number;
    included: boolean;
    milestoneKey: string;
    name: string;
    order: number;
    percentageBps: number;
    siteVisitGuidance?: DemoSettingsSiteVisitGuidanceInput;
    submilestones: { name: string }[];
  }[]
) {
  const included = rows.filter((row) => row.included);
  const total = sumBy(included, (row) => row.percentageBps);
  if (total !== TOTAL_BPS) {
    throw new Error(
      `Included PoC total must equal 100.00%; received ${(total / 100).toFixed(2)}%.`
    );
  }
  for (const row of included) {
    if (!row.name.trim()) {
      throw new Error("Included milestones require names.");
    }
    if (row.durationDays <= 0) {
      throw new Error("Included milestones require positive durations.");
    }
    if (row.submilestones.some((subRow) => !subRow.name.trim())) {
      throw new Error("Sub-milestones require names.");
    }
    const guidance = normalizeSiteVisitGuidance(row.siteVisitGuidance);
    if (guidanceHtmlExceedsMaxLength(guidance)) {
      throw new Error(
        `Field guidance must be ${SITE_VISIT_GUIDANCE_HTML_MAX_LENGTH} characters or less per section.`
      );
    }
  }
  validateMilestoneHandoffGaps(rows);
}

function validateScenarios(
  rows: {
    draws: { amountBps: number; label: string; timingDay: number }[];
    isActive: boolean;
    name: string;
    scenarioKey?: string;
  }[],
  milestones?: MilestoneScheduleInput[]
) {
  const names = new Set<string>();
  for (const row of rows) {
    if (row.scenarioKey !== undefined) {
      validateScenarioKey(row.scenarioKey);
    }
    const normalizedName = row.name.trim().toLowerCase();
    if (!normalizedName) {
      throw new Error("Scenario name is required.");
    }
    if (names.has(normalizedName)) {
      throw new Error("Scenario names must be unique within a template.");
    }
    names.add(normalizedName);
    validateScenarioDrawRows(row.draws, milestones);
  }
  if (rows.length > 0 && rows.filter((row) => row.isActive).length !== 1) {
    throw new Error("Exactly one active scenario is required.");
  }
}

function validateScenarioDrawRows(
  rows: { amountBps: number; label: string; timingDay: number }[],
  milestones?: MilestoneScheduleInput[]
) {
  if (rows.length === 0) {
    throw new Error("Scenario requires at least one draw.");
  }
  const total = sumBy(rows, (row) => row.amountBps);
  if (total !== TOTAL_BPS) {
    throw new Error(
      `Draw total must equal 100.00%; received ${(total / 100).toFixed(2)}%.`
    );
  }
  for (const row of rows) {
    if (!row.label.trim()) {
      throw new Error("Draw labels are required.");
    }
    if (row.timingDay < 0) {
      throw new Error("Draw timing day must be non-negative.");
    }
    if (row.amountBps <= 0) {
      throw new Error("Draw percentage must be positive.");
    }
  }
  if (milestones) {
    validateDrawTimingsAgainstMilestones(rows, milestones);
  }
}

function assertHardCodedDefaultTemplatesConform() {
  for (const templateRow of DEFAULT_TEMPLATES) {
    validateTemplateKey(templateRow.templateKey);
    const milestones = templateRow.milestones.map(toMilestoneInput);
    validateTemplateRows(milestones);
    validateScenarios(templateRow.scenarios.map(toScenarioInput), milestones);
  }
}

function validateTemplateKey(templateKey: string) {
  if (!TIMELINE_DEMO_KEY_PATTERN.test(templateKey)) {
    throw new Error(
      "Template key must use lowercase letters, numbers, and hyphens."
    );
  }
}

function validateScenarioKey(scenarioKey: string) {
  if (!TIMELINE_DEMO_KEY_PATTERN.test(scenarioKey)) {
    throw new Error(
      "Scenario key must use lowercase letters, numbers, and hyphens."
    );
  }
}

function validateMilestoneHandoffGaps(rows: MilestoneScheduleInput[]) {
  const included = sortedIncludedMilestones(rows);
  for (let index = 0; index < included.length - 1; index += 1) {
    const gap =
      milestoneStartDay(included, index + 1) - milestoneEndDay(included, index);
    if (gap > TIMELINE_DEMO_SETTINGS_HANDOFF_GAP_DAYS) {
      throw new Error(
        `Milestone handoff gap cannot exceed ${TIMELINE_DEMO_SETTINGS_HANDOFF_GAP_DAYS} days.`
      );
    }
  }
}

function validateDrawTimingsAgainstMilestones(
  draws: ScenarioDrawScheduleInput[],
  milestones: MilestoneScheduleInput[]
) {
  void draws;
  void milestones;
}

function buildMilestoneDrawWindows(
  rows: MilestoneScheduleInput[]
): MilestoneDrawWindow[] {
  const included = sortedIncludedMilestones(rows);
  const windows: MilestoneDrawWindow[] = [];
  for (let index = 0; index < included.length - 1; index += 1) {
    const row = included[index];
    const next = included[index + 1];
    if (!(row && next)) {
      continue;
    }
    windows.push({
      afterMilestoneEndDay: milestoneEndDay(included, index),
      afterMilestoneKey: row.milestoneKey,
      afterMilestoneName: row.name,
      beforeMilestoneKey: next.milestoneKey,
      beforeMilestoneName: next.name,
      beforeMilestoneStartDay: milestoneStartDay(included, index + 1),
    });
  }
  const final = included.at(-1);
  if (final) {
    const finalIndex = included.length - 1;
    const finalEndDay = milestoneEndDay(included, finalIndex);
    windows.push({
      afterMilestoneEndDay: finalEndDay,
      afterMilestoneKey: final.milestoneKey,
      afterMilestoneName: final.name,
      beforeMilestoneKey: "final-closeout",
      beforeMilestoneStartDay:
        finalEndDay + TIMELINE_DEMO_SETTINGS_HANDOFF_GAP_DAYS,
    });
  }
  return windows;
}

function defaultDrawTimingDay(rows: MilestoneScheduleInput[]) {
  const [firstWindow] = buildMilestoneDrawWindows(rows);
  if (!firstWindow) {
    return 0;
  }
  return Math.min(
    firstWindow.beforeMilestoneStartDay - 1,
    firstWindow.afterMilestoneEndDay + TIMELINE_DEMO_SETTINGS_DRAW_OFFSET_DAYS
  );
}

function sortedIncludedMilestones(rows: MilestoneScheduleInput[]) {
  return rows
    .filter((row) => row.included)
    .slice()
    .sort(
      (a, b) =>
        a.order - b.order || a.milestoneKey.localeCompare(b.milestoneKey)
    );
}

function milestoneStartDay(rows: MilestoneScheduleInput[], index: number) {
  return rows
    .slice(0, index)
    .reduce(
      (day, row) =>
        day + row.durationDays + TIMELINE_DEMO_SETTINGS_HANDOFF_GAP_DAYS,
      0
    );
}

function milestoneEndDay(rows: MilestoneScheduleInput[], index: number) {
  return milestoneStartDay(rows, index) + (rows[index]?.durationDays ?? 0);
}

function toMilestoneInput(row: SeedMilestone, order = 0): MilestoneInput {
  return {
    dependencyKeys: row.dependencyKeys,
    durationDays: row.durationDays,
    icon: row.icon,
    included: row.included,
    milestoneKey: row.milestoneKey,
    name: row.name,
    order,
    percentageBps: row.percentageBps,
    siteVisitGuidance: guidanceItemsToGuidance(
      guidanceToItems(row.siteVisitGuidance),
      defaultSiteVisitGuidance(
        row.milestoneKey,
        row.name,
        row.submilestones.map((subRow) => subRow.name)
      )
    ),
    submilestones: row.submilestones.map((subRow, subOrder) => ({
      ...subRow,
      order: subOrder,
    })),
    type: row.type,
  };
}

function toScenarioInput(row: SeedScenario, sortOrder: number): ScenarioInput {
  return {
    description: row.description,
    draws: row.draws.map((drawRow, order) => ({ ...drawRow, order })),
    isActive: row.isActive,
    isDefault: row.isDefault,
    name: row.name,
    scenarioKey: row.scenarioKey,
    sortOrder,
  };
}

function requiredSeedTemplate(templateKey: string) {
  const canonicalTemplateKey = canonicalTimelineDemoKey(templateKey);
  const seed = DEFAULT_TEMPLATES.find(
    (row) => row.templateKey === canonicalTemplateKey
  );
  if (!seed) {
    throw new Error(`Unknown timeline demo template: ${templateKey}`);
  }
  return seed;
}

function seedIndex(templateKey: string) {
  return Math.max(
    0,
    DEFAULT_TEMPLATES.findIndex((row) => row.templateKey === templateKey)
  );
}

function uniqueKey(base: string, existing: string[]) {
  const normalized = slug(base);
  const seen = new Set(existing);
  if (!seen.has(normalized)) {
    return normalized;
  }
  let suffix = 2;
  while (seen.has(`${normalized}-${suffix}`)) {
    suffix += 1;
  }
  return `${normalized}-${suffix}`;
}

function slug(value: string) {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "item"
  );
}

function sumBy<T>(rows: T[], pick: (row: T) => number) {
  return rows.reduce((sum, row) => sum + pick(row), 0);
}
