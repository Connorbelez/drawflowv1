import { v } from "convex/values";
import { z } from "zod/v4";
import {
  coerceSiteVisitGuidanceInput,
  defaultSiteVisitGuidance,
  guidanceItemsToGuidance,
  guidanceToItems,
  normalizeSiteVisitGuidance,
  SITE_VISIT_GUIDANCE_HTML_MAX_LENGTH,
  type SiteVisitGuidance,
  type SiteVisitGuidanceField,
} from "../demo_site_visit_guidance";
import {
  GARDEN_SUITE_DEMO_TEMPLATE_KEY,
  GARDEN_SUITE_DESCRIPTION,
  GARDEN_SUITE_SECTIONS,
  GARDEN_SUITE_SUMMARY,
  GARDEN_SUITE_TEMPLATE_TITLE,
} from "../gardenSuiteTemplate";
import type { DatabaseReader, DatabaseWriter, Doc } from "../types";
export const SEED_VERSION = 2;
export const TOTAL_BPS = 10_000;
export const TIMELINE_DEMO_SETTINGS_HANDOFF_GAP_DAYS = 5;
export const TIMELINE_DEMO_SETTINGS_DRAW_OFFSET_DAYS = 2;
export const TIMELINE_DEMO_KEY_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const MAX_TIPTAP_JSON_LENGTH = 250_000;
export const EMPTY_TIPTAP_JSON = JSON.stringify({ content: [], type: "doc" });
export const NOW = Date.parse("2026-05-20T18:34:00.000Z");

export function canonicalTimelineDemoKey(value: string) {
  return value.trim().toLowerCase().replaceAll("_", "-");
}

export type DemoSettingsSiteVisitGuidanceInput = {
  cameraAngles: SiteVisitGuidanceField;
  whatToVerify: SiteVisitGuidanceField;
};

export const scenarioDrawInputValidator = v.object({
  amountBps: v.number(),
  drawKey: v.string(),
  label: v.string(),
  order: v.number(),
  reviewNote: v.string(),
  timingDay: v.number(),
});

export const optionalTiptapJsonSchema = z
  .string()
  .optional()
  .superRefine((value, ctx) => {
    if (value === undefined) {
      return;
    }
    if (!value.trim()) {
      ctx.addIssue({
        code: "custom",
        message: "TipTap JSON must contain TipTap JSON.",
      });
      return;
    }
    if (value.length > MAX_TIPTAP_JSON_LENGTH) {
      ctx.addIssue({
        code: "custom",
        message: "TipTap JSON exceeds the supported length.",
      });
      return;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(value);
    } catch {
      ctx.addIssue({
        code: "custom",
        message: "TipTap JSON must be valid TipTap JSON.",
      });
      return;
    }
    if (
      !parsed ||
      typeof parsed !== "object" ||
      Array.isArray(parsed) ||
      !("type" in parsed) ||
      parsed.type !== "doc"
    ) {
      ctx.addIssue({
        code: "custom",
        message: "TipTap JSON must contain a TipTap document root.",
      });
    }
  });

export const siteVisitGuidanceFieldZodSchema = z.union([
  z.string(),
  z.array(z.string()),
]);

export const siteVisitGuidanceZodSchema = z.object({
  cameraAngles: siteVisitGuidanceFieldZodSchema,
  whatToVerify: siteVisitGuidanceFieldZodSchema,
});

export const submilestoneFieldGuidanceZodSchema = z.object({
  cameraAnglesTiptapJson: optionalTiptapJsonSchema,
  whatToVerifyTiptapJson: optionalTiptapJsonSchema,
});

export const milestoneInputZodSchema = z.object({
  dependencyKeys: z.array(z.string()),
  durationDays: z.number(),
  icon: z.enum([
    "change",
    "closeout",
    "drywall",
    "exterior",
    "finishes",
    "foundation",
    "framing",
    "kitchen",
    "plumbing",
    "roofing",
    "roughIn",
  ]),
  included: z.boolean(),
  milestoneKey: z.string(),
  name: z.string(),
  order: z.number(),
  percentageBps: z.number(),
  siteVisitGuidance: siteVisitGuidanceZodSchema.optional(),
  submilestones: z.array(
    z.object({
      description: z.string(),
      durationDays: z.number(),
      fieldGuidance: submilestoneFieldGuidanceZodSchema.optional(),
      name: z.string(),
      order: z.number(),
      percentageBps: z.number(),
      scopeOfWorkTiptapJson: optionalTiptapJsonSchema,
      submilestoneKey: z.string(),
    })
  ),
  type: z.string(),
});

export const timelineTemplateConfigurationInputSchema = z.object({
  milestones: z.array(milestoneInputZodSchema),
  scenarios: z.array(
    z.object({
      description: z.string(),
      draws: z.array(
        z.object({
          amountBps: z.number(),
          drawKey: z.string(),
          label: z.string(),
          order: z.number(),
          reviewNote: z.string(),
          timingDay: z.number(),
        })
      ),
      isActive: z.boolean(),
      isDefault: z.boolean(),
      name: z.string(),
      scenarioKey: z.string(),
      sortOrder: z.number(),
    })
  ),
  template: z.object({
    description: z.string(),
    isDefault: z.boolean(),
    summary: z.string(),
    templateKey: z.string(),
    title: z.string(),
  }),
});

export const timelineTemplateWorksheetInputSchema = z.object({
  milestones: z.array(milestoneInputZodSchema),
  templateKey: z.string(),
});

export const scenarioInputValidator = v.object({
  description: v.string(),
  draws: v.array(scenarioDrawInputValidator),
  isActive: v.boolean(),
  isDefault: v.boolean(),
  name: v.string(),
  scenarioKey: v.string(),
  sortOrder: v.number(),
});

export interface SeedSubmilestone {
  description: string;
  durationDays: number;
  fieldGuidance?: {
    cameraAnglesTiptapJson: string;
    whatToVerifyTiptapJson: string;
  };
  name: string;
  percentageBps: number;
  scopeOfWorkTiptapJson?: string;
  submilestoneKey: string;
}

export interface SeedMilestone {
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

export interface SeedDraw {
  amountBps: number;
  drawKey: string;
  label: string;
  reviewNote: string;
  timingDay: number;
}

export interface SeedScenario {
  description: string;
  draws: SeedDraw[];
  isActive: boolean;
  isDefault: boolean;
  name: string;
  scenarioKey: string;
}

export interface SeedTemplate {
  description: string;
  isDefault: boolean;
  milestones: SeedMilestone[];
  scenarios: SeedScenario[];
  summary: string;
  templateKey: string;
  title: string;
}

export type ReadCtx = { db: DatabaseReader };
export type WriteCtx = { db: DatabaseWriter };
export type MilestoneInput = {
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

export type DemoSettingsSubmilestoneFieldGuidanceInput = {
  cameraAnglesTiptapJson?: string;
  whatToVerifyTiptapJson?: string;
};

export type MilestoneInputDraft = Omit<
  MilestoneInput,
  "siteVisitGuidance" | "submilestones"
> & {
  siteVisitGuidance?: DemoSettingsSiteVisitGuidanceInput;
  submilestones: (Omit<SeedSubmilestone, "fieldGuidance"> & {
    fieldGuidance?: DemoSettingsSubmilestoneFieldGuidanceInput;
    order: number;
  })[];
};

export function normalizeSubmilestoneFieldGuidance(
  guidance: DemoSettingsSubmilestoneFieldGuidanceInput | undefined
): SeedSubmilestone["fieldGuidance"] {
  if (guidance === undefined) {
    return;
  }
  return {
    cameraAnglesTiptapJson:
      guidance.cameraAnglesTiptapJson ?? EMPTY_TIPTAP_JSON,
    whatToVerifyTiptapJson:
      guidance.whatToVerifyTiptapJson ?? EMPTY_TIPTAP_JSON,
  };
}

export function normalizeMilestoneInputs(
  rows: MilestoneInputDraft[]
): MilestoneInput[] {
  return rows.map((row) => ({
    ...row,
    siteVisitGuidance: row.siteVisitGuidance
      ? coerceSiteVisitGuidanceInput(row.siteVisitGuidance)
      : undefined,
    submilestones: row.submilestones.map((submilestone) => ({
      ...submilestone,
      fieldGuidance: normalizeSubmilestoneFieldGuidance(
        submilestone.fieldGuidance
      ),
    })),
  }));
}

export type ScenarioInput = {
  description: string;
  draws: (SeedDraw & { order: number })[];
  isActive: boolean;
  isDefault: boolean;
  name: string;
  scenarioKey: string;
  sortOrder: number;
};
export type MilestoneScheduleInput = {
  durationDays: number;
  included: boolean;
  milestoneKey: string;
  name: string;
  order: number;
};
export type ScenarioDrawScheduleInput = {
  label: string;
  timingDay: number;
};
export type MilestoneDrawWindow = {
  afterMilestoneEndDay: number;
  afterMilestoneKey: string;
  afterMilestoneName: string;
  beforeMilestoneKey: string;
  beforeMilestoneName?: string;
  beforeMilestoneStartDay: number;
};

export const DEFAULT_TEMPLATES: SeedTemplate[] = [
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


export function milestone(
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

export function gardenSuiteDemoMilestones(): SeedMilestone[] {
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

export function scenario(
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

export function draw(
  drawKey: string,
  label: string,
  timingDay: number,
  amountBps: number,
  reviewNote: string
): SeedDraw {
  return { amountBps, drawKey, label, reviewNote, timingDay };
}

export function templateStatus(
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

export function settingsCompleteness(
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

export function toMilestoneInput(row: SeedMilestone, order = 0): MilestoneInput {
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

export function toScenarioInput(row: SeedScenario, sortOrder: number): ScenarioInput {
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

export function requiredSeedTemplate(templateKey: string) {
  const canonicalTemplateKey = canonicalTimelineDemoKey(templateKey);
  const seed = DEFAULT_TEMPLATES.find(
    (row) => row.templateKey === canonicalTemplateKey
  );
  if (!seed) {
    throw new Error(`Unknown timeline demo template: ${templateKey}`);
  }
  return seed;
}

export function slug(value: string) {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "item"
  );
}

export function sumBy<T>(rows: T[], pick: (row: T) => number) {
  return rows.reduce((sum, row) => sum + pick(row), 0);
}
