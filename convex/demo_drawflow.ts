import { v } from "convex/values";

import {
  publicMutation,
  publicQuery,
  withMutationTiming,
  withQueryTiming,
} from "./fluent";

const DEMO_TODAY = "2026-05-08";
const DEMO_NOW = Date.parse("2026-05-08T16:00:00.000Z");
const DAY_MS = 86_400_000;
const WORKING_CAPITAL_CENTS = 26_000_000;
const FLAT_DRAW_FEE_CENTS = 50_000;
const INTEREST_ANNUAL_BPS = 1200;
const SEED_VERSION = 7;

const DEMO_TABLES = [
  "demo_warningDismissals",
  "demo_eventOutbox",
  "demo_auditEvents",
  "demo_forecastUpdates",
  "demo_rolloverBuffers",
  "demo_reviewReports",
  "demo_siteVisits",
  "demo_evidenceFiles",
  "demo_evidencePackages",
  "demo_milestoneDependencies",
  "demo_milestones",
  "demo_drawGroups",
  "demo_policySnapshots",
  "demo_planningRuns",
  "demo_builds",
] as const;

type Scenario = "active" | "proposal";
type DependencyType =
  | "hard_blocker"
  | "procurement_dependency"
  | "soft_dependency";

type SeedMilestone = {
  key: string;
  name: string;
  valueCents: number;
  type: string;
};

type ActiveSeedMilestone = SeedMilestone & {
  code: string;
  drawGroupKey: string;
  baselineStartDate: string;
  baselineEndDate: string;
  forecastStartDate: string;
  forecastEndDate: string;
  progressPercent: number;
  requiresSiteVisit?: boolean;
  status: string;
};

type ProposalGroup = {
  key: string;
  milestoneKeys: string[];
};

type DemoMutationCtx = {
  db: any;
};

type WorkspaceIssueSeverity = "blocking" | "warning" | "info";
type WorkspaceIssueScope =
  | "workspace"
  | "drawGroup"
  | "milestone"
  | "dependency";

type WorkspaceIssueQuickFix = {
  action: string;
  label: string;
  targetId?: string;
};

type WorkspaceIssue = {
  code: string;
  conditionHash: string;
  dependencyIds: string[];
  dismissible: boolean;
  dismissed: boolean;
  drawGroupIds: string[];
  id: string;
  impact: string;
  message: string;
  milestoneIds: string[];
  quickFix?: WorkspaceIssueQuickFix;
  scope: WorkspaceIssueScope;
  severity: WorkspaceIssueSeverity;
  title: string;
};

type AuditInput = {
  actorPersona?: string;
  afterSummary?: string;
  beforeSummary?: string;
  buildId?: string;
  command: string;
  drawGroupKey?: string;
  entityKey?: string;
  entityLabel?: string;
  entityType?: string;
  eventType: string;
  milestoneKey?: string;
  reason?: string;
  scenario: Scenario;
  validation?: string;
};

const MILESTONE_CATALOG: SeedMilestone[] = [
  {
    key: "temp_fencing",
    name: "Temp Fencing",
    type: "site_preparation",
    valueCents: 400_000,
  },
  {
    key: "demo_excavation",
    name: "Demo / Excavation",
    type: "demolition_excavation",
    valueCents: 6_500_000,
  },
  {
    key: "general_labour",
    name: "General Labour",
    type: "labour",
    valueCents: 3_500_000,
  },
  {
    key: "tree_removal",
    name: "Tree Removal",
    type: "site_preparation",
    valueCents: 1_000_000,
  },
  {
    key: "foundation",
    name: "Foundation",
    type: "foundation_structural",
    valueCents: 8_400_000,
  },
  {
    key: "shoring",
    name: "Shoring",
    type: "foundation_structural",
    valueCents: 8_500_000,
  },
  {
    key: "underground_plumbing",
    name: "Underground Plumbing",
    type: "utility",
    valueCents: 2_000_000,
  },
  {
    key: "framing",
    name: "Framing",
    type: "foundation_structural",
    valueCents: 9_100_000,
  },
  {
    key: "lumber",
    name: "Lumber",
    type: "procurement",
    valueCents: 8_300_000,
  },
  {
    key: "masonry",
    name: "Masonry",
    type: "exterior_envelope",
    valueCents: 4_100_000,
  },
  {
    key: "stucco",
    name: "Stucco",
    type: "exterior_envelope",
    valueCents: 2_000_000,
  },
  {
    key: "aluminum_siding",
    name: "Aluminum Siding",
    type: "exterior_envelope",
    valueCents: 650_000,
  },
  {
    key: "soffit_fascia",
    name: "Soffit and Fascia",
    type: "exterior_envelope",
    valueCents: 1_500_000,
  },
  {
    key: "concrete_walkout",
    name: "Concrete Walkout / Stairs / Pathway",
    type: "landscape_exterior",
    valueCents: 5_500_000,
  },
  {
    key: "roof_flat_shingles",
    name: "Roof Flat / Shingles",
    type: "exterior_envelope",
    valueCents: 2_500_000,
  },
  {
    key: "aluminum_windows",
    name: "Aluminum Windows",
    type: "exterior_envelope",
    valueCents: 9_000_000,
  },
  {
    key: "hvac",
    name: "HVAC",
    type: "mechanical_electrical_plumbing",
    valueCents: 9_500_000,
  },
  {
    key: "plumbing",
    name: "Plumbing",
    type: "mechanical_electrical_plumbing",
    valueCents: 9_500_000,
  },
  {
    key: "plumbing_supplies",
    name: "Plumbing Supplies",
    type: "procurement",
    valueCents: 4_500_000,
  },
  {
    key: "electrical",
    name: "Electrical",
    type: "mechanical_electrical_plumbing",
    valueCents: 8_700_000,
  },
  {
    key: "drywall_install",
    name: "Insulation / Drywall / Taping Install",
    type: "interior_finish",
    valueCents: 9_000_000,
  },
  {
    key: "drywall_materials",
    name: "Insulation / Drywall / Taping Materials",
    type: "procurement",
    valueCents: 8_000_000,
  },
  {
    key: "stairs",
    name: "Stairs",
    type: "interior_finish",
    valueCents: 5_700_000,
  },
  {
    key: "tiles_labour",
    name: "Tiles Labour",
    type: "interior_finish",
    valueCents: 5_000_000,
  },
  {
    key: "tiles_supply",
    name: "Tiles Supply",
    type: "procurement",
    valueCents: 2_900_000,
  },
  {
    key: "kitchens",
    name: "Kitchens",
    type: "interior_finish",
    valueCents: 9_000_000,
  },
  {
    key: "finish_carpentry",
    name: "Finish Carpentry",
    type: "interior_finish",
    valueCents: 3_000_000,
  },
  {
    key: "doors_trim",
    name: "Doors / Trim Material",
    type: "procurement",
    valueCents: 1_800_000,
  },
  {
    key: "appliances",
    name: "Appliances",
    type: "procurement",
    valueCents: 4_000_000,
  },
  {
    key: "flooring",
    name: "Flooring",
    type: "interior_finish",
    valueCents: 3_900_000,
  },
  {
    key: "paint",
    name: "Paint",
    type: "interior_finish",
    valueCents: 4_500_000,
  },
  {
    key: "final_deep_clean",
    name: "Final Deep Clean",
    type: "interior_finish",
    valueCents: 200_000,
  },
  {
    key: "landscaping",
    name: "Landscaping",
    type: "landscape_exterior",
    valueCents: 2_000_000,
  },
  {
    key: "asphalt",
    name: "Asphalt",
    type: "landscape_exterior",
    valueCents: 400_000,
  },
  {
    key: "water_sewer",
    name: "Water / Sewer",
    type: "utility",
    valueCents: 4_500_000,
  },
  {
    key: "utilities_disconnect",
    name: "Utilities Disconnect",
    type: "utility",
    valueCents: 750_000,
  },
  {
    key: "utilities_connection",
    name: "Utilities Connection",
    type: "utility",
    valueCents: 4_500_000,
  },
  {
    key: "amp_upgrade",
    name: "400 Amp Upgrade",
    type: "utility",
    valueCents: 5_500_000,
  },
  {
    key: "over_run",
    name: "Over Run",
    type: "reserve",
    valueCents: 7_000_000,
  },
  {
    key: "neighbour_reserve",
    name: "Neighbour Reserve",
    type: "reserve",
    valueCents: 1_500_000,
  },
  {
    key: "dc_ed",
    name: "DC / ED",
    type: "permit_fee_admin",
    valueCents: 1_500_000,
  },
  {
    key: "permits",
    name: "Permits",
    type: "permit_fee_admin",
    valueCents: 1_000_000,
  },
  {
    key: "drawings_insurance",
    name: "Drawings / Insurance",
    type: "permit_fee_admin",
    valueCents: 2_000_000,
  },
  {
    key: "management_fee",
    name: "Management Fee",
    type: "management",
    valueCents: 3_500_000,
  },
];

const HARD_DEPENDENCIES: [string, string, DependencyType][] = [
  ["demo_excavation", "shoring", "hard_blocker"],
  ["shoring", "foundation", "hard_blocker"],
  ["foundation", "underground_plumbing", "hard_blocker"],
  ["foundation", "framing", "hard_blocker"],
  ["lumber", "framing", "procurement_dependency"],
  ["framing", "roof_flat_shingles", "hard_blocker"],
  ["framing", "aluminum_windows", "hard_blocker"],
  ["framing", "hvac", "hard_blocker"],
  ["framing", "plumbing", "hard_blocker"],
  ["framing", "electrical", "hard_blocker"],
  ["roof_flat_shingles", "drywall_install", "hard_blocker"],
  ["aluminum_windows", "drywall_install", "hard_blocker"],
  ["hvac", "drywall_install", "hard_blocker"],
  ["plumbing", "drywall_install", "hard_blocker"],
  ["electrical", "drywall_install", "hard_blocker"],
  ["drywall_materials", "drywall_install", "procurement_dependency"],
  ["drywall_install", "paint", "hard_blocker"],
  ["drywall_install", "flooring", "hard_blocker"],
  ["drywall_install", "kitchens", "hard_blocker"],
  ["stairs", "finish_carpentry", "hard_blocker"],
  ["flooring", "final_deep_clean", "hard_blocker"],
  ["paint", "final_deep_clean", "hard_blocker"],
  ["kitchens", "final_deep_clean", "hard_blocker"],
  ["appliances", "final_deep_clean", "procurement_dependency"],
];

const PROPOSAL_GROUPS: ProposalGroup[] = [
  {
    key: "d1",
    milestoneKeys: [
      "temp_fencing",
      "demo_excavation",
      "general_labour",
      "tree_removal",
      "foundation",
    ],
  },
  {
    key: "d2",
    milestoneKeys: ["shoring", "underground_plumbing", "framing"],
  },
  {
    key: "d3",
    milestoneKeys: [
      "lumber",
      "masonry",
      "stucco",
      "aluminum_siding",
      "soffit_fascia",
      "concrete_walkout",
      "roof_flat_shingles",
    ],
  },
  { key: "d4", milestoneKeys: ["aluminum_windows", "hvac"] },
  {
    key: "d5",
    milestoneKeys: ["plumbing", "plumbing_supplies", "electrical"],
  },
  {
    key: "d6",
    milestoneKeys: ["drywall_install", "drywall_materials", "stairs"],
  },
  {
    key: "d7",
    milestoneKeys: [
      "tiles_labour",
      "tiles_supply",
      "kitchens",
      "finish_carpentry",
      "doors_trim",
      "appliances",
    ],
  },
  {
    key: "d8",
    milestoneKeys: [
      "flooring",
      "paint",
      "final_deep_clean",
      "landscaping",
      "asphalt",
      "water_sewer",
      "utilities_disconnect",
      "utilities_connection",
    ],
  },
  {
    key: "d9",
    milestoneKeys: [
      "amp_upgrade",
      "over_run",
      "neighbour_reserve",
      "dc_ed",
      "permits",
      "drawings_insurance",
      "management_fee",
    ],
  },
];

const RECOMMENDED_ORDER = [
  "permits",
  "drawings_insurance",
  "dc_ed",
  "utilities_disconnect",
  "temp_fencing",
  "tree_removal",
  "demo_excavation",
  "shoring",
  "foundation",
  "underground_plumbing",
  "water_sewer",
  "lumber",
  "framing",
  "roof_flat_shingles",
  "aluminum_windows",
  "masonry",
  "stucco",
  "aluminum_siding",
  "soffit_fascia",
  "concrete_walkout",
  "utilities_connection",
  "amp_upgrade",
  "hvac",
  "plumbing_supplies",
  "plumbing",
  "electrical",
  "drywall_materials",
  "drywall_install",
  "stairs",
  "tiles_supply",
  "tiles_labour",
  "flooring",
  "kitchens",
  "finish_carpentry",
  "doors_trim",
  "paint",
  "appliances",
  "landscaping",
  "asphalt",
  "final_deep_clean",
  "management_fee",
  "over_run",
  "neighbour_reserve",
  "general_labour",
];

const ACTIVE_MILESTONES: ActiveSeedMilestone[] = [
  {
    ...catalog("permits"),
    baselineEndDate: "2026-01-09",
    baselineStartDate: "2026-01-05",
    code: "M-010",
    drawGroupKey: "d1",
    forecastEndDate: "2026-01-09",
    forecastStartDate: "2026-01-05",
    progressPercent: 100,
    status: "completion_approved",
  },
  {
    ...catalog("drawings_insurance"),
    baselineEndDate: "2026-01-15",
    baselineStartDate: "2026-01-06",
    code: "M-020",
    drawGroupKey: "d1",
    forecastEndDate: "2026-01-15",
    forecastStartDate: "2026-01-06",
    progressPercent: 100,
    status: "completion_approved",
  },
  {
    ...catalog("dc_ed"),
    baselineEndDate: "2026-01-20",
    baselineStartDate: "2026-01-12",
    code: "M-030",
    drawGroupKey: "d1",
    forecastEndDate: "2026-01-20",
    forecastStartDate: "2026-01-12",
    progressPercent: 100,
    status: "completion_approved",
  },
  {
    ...catalog("utilities_disconnect"),
    baselineEndDate: "2026-01-23",
    baselineStartDate: "2026-01-20",
    code: "M-040",
    drawGroupKey: "d1",
    forecastEndDate: "2026-01-23",
    forecastStartDate: "2026-01-20",
    progressPercent: 100,
    status: "completion_approved",
  },
  {
    ...catalog("temp_fencing"),
    baselineEndDate: "2026-01-27",
    baselineStartDate: "2026-01-22",
    code: "M-050",
    drawGroupKey: "d1",
    forecastEndDate: "2026-01-27",
    forecastStartDate: "2026-01-22",
    progressPercent: 100,
    status: "completion_approved",
  },
  {
    ...catalog("tree_removal"),
    baselineEndDate: "2026-02-03",
    baselineStartDate: "2026-01-28",
    code: "M-060",
    drawGroupKey: "d1",
    forecastEndDate: "2026-02-03",
    forecastStartDate: "2026-01-28",
    progressPercent: 100,
    status: "completion_approved",
  },
  {
    ...catalog("demo_excavation"),
    baselineEndDate: "2026-02-20",
    baselineStartDate: "2026-02-04",
    code: "M-070",
    drawGroupKey: "d1",
    forecastEndDate: "2026-02-20",
    forecastStartDate: "2026-02-04",
    progressPercent: 100,
    status: "completion_approved",
  },
  {
    ...catalog("shoring"),
    baselineEndDate: "2026-03-06",
    baselineStartDate: "2026-02-19",
    code: "M-080",
    drawGroupKey: "d1",
    forecastEndDate: "2026-03-06",
    forecastStartDate: "2026-02-19",
    progressPercent: 100,
    status: "completion_approved",
  },
  {
    ...catalog("foundation"),
    baselineEndDate: "2026-04-24",
    baselineStartDate: "2026-03-09",
    code: "M-090",
    drawGroupKey: "d2",
    forecastEndDate: "2026-05-15",
    forecastStartDate: "2026-03-09",
    progressPercent: 80,
    requiresSiteVisit: true,
    status: "in_progress_behind_schedule",
  },
  {
    ...catalog("underground_plumbing"),
    baselineEndDate: "2026-05-08",
    baselineStartDate: "2026-04-27",
    code: "M-100",
    drawGroupKey: "d2",
    forecastEndDate: "2026-05-28",
    forecastStartDate: "2026-05-16",
    progressPercent: 0,
    status: "planned",
  },
  {
    ...catalog("water_sewer"),
    baselineEndDate: "2026-05-22",
    baselineStartDate: "2026-04-20",
    code: "M-110",
    drawGroupKey: "d2",
    forecastEndDate: "2026-05-27",
    forecastStartDate: "2026-04-20",
    progressPercent: 60,
    status: "in_progress_on_schedule",
  },
  {
    ...catalog("lumber"),
    baselineEndDate: "2026-04-15",
    baselineStartDate: "2026-03-18",
    code: "M-120",
    drawGroupKey: "d2",
    forecastEndDate: "2026-04-15",
    forecastStartDate: "2026-03-18",
    progressPercent: 100,
    status: "completion_approved",
  },
  {
    ...catalog("framing"),
    baselineEndDate: "2026-06-26",
    baselineStartDate: "2026-05-29",
    code: "M-130",
    drawGroupKey: "d3",
    forecastEndDate: "2026-07-02",
    forecastStartDate: "2026-05-29",
    progressPercent: 0,
    status: "planned",
  },
  {
    ...catalog("general_labour"),
    baselineEndDate: "2026-07-24",
    baselineStartDate: "2026-05-29",
    code: "M-140",
    drawGroupKey: "d3",
    forecastEndDate: "2026-07-31",
    forecastStartDate: "2026-05-29",
    progressPercent: 0,
    status: "planned",
  },
  {
    ...catalog("roof_flat_shingles"),
    baselineEndDate: "2026-07-17",
    baselineStartDate: "2026-06-29",
    code: "M-150",
    drawGroupKey: "d3",
    forecastEndDate: "2026-07-24",
    forecastStartDate: "2026-07-03",
    progressPercent: 0,
    status: "planned",
  },
  {
    ...catalog("aluminum_windows"),
    baselineEndDate: "2026-08-07",
    baselineStartDate: "2026-07-03",
    code: "M-160",
    drawGroupKey: "d3",
    forecastEndDate: "2026-08-14",
    forecastStartDate: "2026-07-06",
    progressPercent: 0,
    status: "planned",
  },
];

function catalog(key: string) {
  const row = MILESTONE_CATALOG.find((milestone) => milestone.key === key);
  if (!row) {
    throw new Error(`Unknown DrawFlow seed milestone: ${key}`);
  }
  return row;
}

function addDays(date: string, days: number) {
  return new Date(Date.parse(`${date}T00:00:00.000Z`) + days * DAY_MS)
    .toISOString()
    .slice(0, 10);
}

function dateDiffDays(startDate: string, endDate: string) {
  return Math.max(
    1,
    Math.round(
      (Date.parse(`${endDate}T00:00:00.000Z`) -
        Date.parse(`${startDate}T00:00:00.000Z`)) /
        DAY_MS
    ) + 1
  );
}

function groupAmount(milestones: { approvedValueCents: number }[]) {
  return milestones.reduce(
    (total, milestone) => total + milestone.approvedValueCents,
    0
  );
}

function latestDate(dates: string[]) {
  return dates.reduce((latest, date) => (date > latest ? date : latest));
}

function earliestDate(dates: string[]) {
  return dates.reduce((earliest, date) => (date < earliest ? date : earliest));
}

async function cleanupAll(ctx: DemoMutationCtx) {
  for (const tableName of DEMO_TABLES) {
    const rows = await ctx.db.query(tableName).collect();
    for (const row of rows) {
      await ctx.db.delete(row._id);
    }
  }
}

async function getBuild(ctx: DemoMutationCtx, scenario: Scenario) {
  return await ctx.db
    .query("demo_builds")
    .withIndex("by_scenario", (q: any) => q.eq("scenario", scenario))
    .first();
}

async function getBuildOrThrow(ctx: DemoMutationCtx, scenario: Scenario) {
  const build = await getBuild(ctx, scenario);
  if (!build) {
    throw new Error(`DrawFlow ${scenario} scenario is not seeded`);
  }
  return build;
}

async function getMilestones(ctx: DemoMutationCtx, scenario: Scenario) {
  return (
    await ctx.db
      .query("demo_milestones")
      .withIndex("by_scenario", (q: any) => q.eq("scenario", scenario))
      .collect()
  ).sort((a: any, b: any) => a.order - b.order);
}

async function getDrawGroups(ctx: DemoMutationCtx, scenario: Scenario) {
  return (
    await ctx.db
      .query("demo_drawGroups")
      .withIndex("by_scenario", (q: any) => q.eq("scenario", scenario))
      .collect()
  ).sort((a: any, b: any) => a.order - b.order);
}

async function getDependencies(ctx: DemoMutationCtx, scenario: Scenario) {
  return await ctx.db
    .query("demo_milestoneDependencies")
    .withIndex("by_scenario", (q: any) => q.eq("scenario", scenario))
    .collect();
}

async function findMilestone(
  ctx: DemoMutationCtx,
  scenario: Scenario,
  key: string
) {
  return await ctx.db
    .query("demo_milestones")
    .withIndex("by_key", (q: any) => q.eq("scenario", scenario).eq("key", key))
    .first();
}

async function activeEvidenceFiles(
  ctx: DemoMutationCtx,
  scenario: Scenario,
  milestoneKey: string
) {
  const files = await ctx.db
    .query("demo_evidenceFiles")
    .withIndex("by_milestone", (q: any) =>
      q.eq("scenario", scenario).eq("milestoneKey", milestoneKey)
    )
    .collect();
  return files.filter((file: any) => !file.removedAt);
}

async function latestEvidencePackage(
  ctx: DemoMutationCtx,
  scenario: Scenario,
  milestoneKey: string
) {
  const packages = await ctx.db
    .query("demo_evidencePackages")
    .withIndex("by_milestone", (q: any) =>
      q.eq("scenario", scenario).eq("milestoneKey", milestoneKey)
    )
    .collect();
  return packages.sort((a: any, b: any) => b.createdAt - a.createdAt)[0];
}

async function latestSiteVisit(
  ctx: DemoMutationCtx,
  scenario: Scenario,
  milestoneKey: string
) {
  const visits = await ctx.db
    .query("demo_siteVisits")
    .withIndex("by_milestone", (q: any) =>
      q.eq("scenario", scenario).eq("milestoneKey", milestoneKey)
    )
    .collect();
  return visits.sort((a: any, b: any) => b.createdAt - a.createdAt)[0];
}

async function appendAudit(ctx: DemoMutationCtx, input: AuditInput) {
  const createdAt = Date.now();
  await ctx.db.insert("demo_auditEvents", {
    actorPersona: input.actorPersona ?? "system",
    afterSummary: input.afterSummary,
    beforeSummary: input.beforeSummary,
    buildId: input.buildId,
    command: input.command,
    correlationId: `${input.command}:${createdAt}:${input.entityKey ?? "demo"}`,
    createdAt,
    drawGroupKey: input.drawGroupKey,
    entityKey: input.entityKey,
    entityLabel: input.entityLabel,
    entityType: input.entityType ?? "demo",
    eventType: input.eventType,
    milestoneKey: input.milestoneKey,
    reason: input.reason,
    scenario: input.scenario,
    validation: input.validation ?? "accepted",
  });
}

async function appendOutbox(
  ctx: DemoMutationCtx,
  input: {
    buildId?: string;
    drawGroupKey?: string;
    eventType: string;
    milestoneKey?: string;
    payloadPreview: string;
    relatedEntity: string;
    scenario: Scenario;
  }
) {
  await ctx.db.insert("demo_eventOutbox", {
    buildId: input.buildId,
    createdAt: Date.now(),
    drawGroupKey: input.drawGroupKey,
    eventType: input.eventType,
    milestoneKey: input.milestoneKey,
    payloadPreview: input.payloadPreview,
    relatedEntity: input.relatedEntity,
    scenario: input.scenario,
    status: "mock_delivered",
  });
}

async function seedCommonDependencies(ctx: DemoMutationCtx, buildId: string) {
  for (const scenario of ["active", "proposal"] as Scenario[]) {
    for (const [blockerKey, blockedKey, type] of HARD_DEPENDENCIES) {
      await ctx.db.insert("demo_milestoneDependencies", {
        blockedKey,
        blockerKey,
        buildId,
        isSystem: true,
        scenario,
        severity: type === "soft_dependency" ? "warning" : "blocking",
        type,
      });
    }
  }
}

async function seedActive(ctx: DemoMutationCtx) {
  const buildId = await ctx.db.insert("demo_builds", {
    flatDrawFeeCents: FLAT_DRAW_FEE_CENTS,
    interestAnnualBps: INTEREST_ANNUAL_BPS,
    key: "active-maple-ridge",
    lenderDrawPolicyLimitCents: WORKING_CAPITAL_CENTS,
    name: "Maple Ridge Townhomes",
    payoffDate: "2027-01-05",
    projectStartDate: "2026-01-05",
    scenario: "active",
    seedVersion: SEED_VERSION,
    status: "active",
    subtitle:
      "Phase 1 reimbursement proposal · Hamilton, ON · reimbursement only",
    todayDate: DEMO_TODAY,
    updatedAt: DEMO_NOW,
    workingCapitalLimitCents: WORKING_CAPITAL_CENTS,
  });

  for (const [index, milestone] of ACTIVE_MILESTONES.entries()) {
    await ctx.db.insert("demo_milestones", {
      actualCompletedDate:
        milestone.status === "completion_approved"
          ? milestone.forecastEndDate
          : undefined,
      approvedAt:
        milestone.status === "completion_approved"
          ? DEMO_NOW - DAY_MS
          : undefined,
      approvedByPersona:
        milestone.status === "completion_approved" ? "lender_admin" : undefined,
      approvedValueCents: milestone.valueCents,
      baselineEndDate: milestone.baselineEndDate,
      baselineStartDate: milestone.baselineStartDate,
      buildId,
      code: milestone.code,
      drawGroupKey: milestone.drawGroupKey,
      durationDays: dateDiffDays(
        milestone.forecastStartDate,
        milestone.forecastEndDate
      ),
      evidenceReviewStatus:
        milestone.status === "completion_approved" ? "accepted" : "not_started",
      forecastEndDate: milestone.forecastEndDate,
      forecastStartDate: milestone.forecastStartDate,
      key: milestone.key,
      name: milestone.name,
      order: index + 1,
      progressPercent: milestone.progressPercent,
      requestedAmountCents:
        milestone.status === "completion_approved"
          ? milestone.valueCents
          : undefined,
      requiresSiteVisit: Boolean(milestone.requiresSiteVisit),
      scenario: "active",
      status: milestone.status,
      type: milestone.type,
      updatedAt: DEMO_NOW,
    });
  }

  const activeGroups = ["d1", "d2", "d3"].map((key, index) => {
    const milestones = ACTIVE_MILESTONES.filter(
      (milestone) => milestone.drawGroupKey === key
    );
    return {
      approvedValueCents: milestones.reduce(
        (sum, milestone) => sum + milestone.valueCents,
        0
      ),
      forecastEndDate: latestDate(
        milestones.map((item) => item.forecastEndDate)
      ),
      forecastStartDate: earliestDate(
        milestones.map((item) => item.forecastStartDate)
      ),
      key,
      label: `Draw ${index + 1}`,
      order: index + 1,
      releaseApprovedAt: key === "d1" ? DEMO_NOW - DAY_MS * 30 : undefined,
      status:
        key === "d1"
          ? "release_approved"
          : key === "d2"
            ? "partially_eligible"
            : "not_yet_eligible",
    };
  });

  for (const group of activeGroups) {
    await ctx.db.insert("demo_drawGroups", {
      approvedValueCents: group.approvedValueCents,
      baselineEndDate: group.forecastEndDate,
      baselineStartDate: group.forecastStartDate,
      buildId,
      forecastEndDate: group.forecastEndDate,
      forecastStartDate: group.forecastStartDate,
      key: group.key,
      label: group.label,
      order: group.order,
      releaseApprovedAt: group.releaseApprovedAt,
      requestedValueCents: group.approvedValueCents,
      scenario: "active",
      status: group.status,
      updatedAt: DEMO_NOW,
    });
  }

  await ctx.db.insert("demo_policySnapshots", {
    buildId,
    createdAt: DEMO_NOW,
    flatDrawFeeCents: FLAT_DRAW_FEE_CENTS,
    interestAnnualBps: INTEREST_ANNUAL_BPS,
    scenario: "active",
    workingCapitalLimitCents: WORKING_CAPITAL_CENTS,
  });

  return buildId;
}

async function seedProposal(ctx: DemoMutationCtx) {
  const buildId = await ctx.db.insert("demo_builds", {
    flatDrawFeeCents: FLAT_DRAW_FEE_CENTS,
    interestAnnualBps: INTEREST_ANNUAL_BPS,
    key: "proposal-maple-ridge",
    lenderDrawPolicyLimitCents: WORKING_CAPITAL_CENTS,
    name: "Maple Ridge Townhomes",
    payoffDate: "2027-01-05",
    projectStartDate: "2026-01-05",
    scenario: "proposal",
    seedVersion: SEED_VERSION,
    status: "draft",
    subtitle:
      "Phase 1 reimbursement proposal · Hamilton, ON · reimbursement only",
    todayDate: DEMO_TODAY,
    updatedAt: DEMO_NOW,
    workingCapitalLimitCents: WORKING_CAPITAL_CENTS,
  });

  const drawGroupByKey = new Map<string, string>();
  for (const group of PROPOSAL_GROUPS) {
    for (const milestoneKey of group.milestoneKeys) {
      drawGroupByKey.set(milestoneKey, group.key);
    }
  }

  for (const [index, milestone] of MILESTONE_CATALOG.entries()) {
    const groupKey = drawGroupByKey.get(milestone.key) ?? "d9";
    const start = addDays("2026-01-05", Math.floor(index * 7.5));
    const duration = 7 + (index % 5) * 4;
    const end = addDays(start, duration);
    await ctx.db.insert("demo_milestones", {
      approvedValueCents: milestone.valueCents,
      buildId,
      code: `M-${String((index + 1) * 10).padStart(3, "0")}`,
      drawGroupKey: groupKey,
      durationDays: dateDiffDays(start, end),
      evidenceReviewStatus: "not_started",
      key: milestone.key,
      name: milestone.name,
      order: index + 1,
      plannedEndDate: end,
      plannedStartDate: start,
      progressPercent: 0,
      requiresSiteVisit: milestone.key === "foundation",
      scenario: "proposal",
      status: "draft",
      type: milestone.type,
      updatedAt: DEMO_NOW,
    });
  }

  const proposalMilestones = await getMilestones(ctx, "proposal");
  for (const [index, group] of PROPOSAL_GROUPS.entries()) {
    const groupMilestones = proposalMilestones.filter((milestone: any) =>
      group.milestoneKeys.includes(milestone.key)
    );
    await ctx.db.insert("demo_drawGroups", {
      approvedValueCents: groupAmount(groupMilestones),
      buildId,
      key: group.key,
      label: `Draw ${index + 1}`,
      order: index + 1,
      plannedEndDate: latestDate(
        groupMilestones.map((item: any) => item.plannedEndDate)
      ),
      plannedStartDate: earliestDate(
        groupMilestones.map((item: any) => item.plannedStartDate)
      ),
      requestedValueCents: groupAmount(groupMilestones),
      scenario: "proposal",
      status: "planned",
      updatedAt: DEMO_NOW,
    });
  }

  await ctx.db.insert("demo_policySnapshots", {
    buildId,
    createdAt: DEMO_NOW,
    flatDrawFeeCents: FLAT_DRAW_FEE_CENTS,
    interestAnnualBps: INTEREST_ANNUAL_BPS,
    scenario: "proposal",
    workingCapitalLimitCents: WORKING_CAPITAL_CENTS,
  });

  return buildId;
}

async function seedAll(ctx: DemoMutationCtx) {
  const activeBuildId = await seedActive(ctx);
  await seedProposal(ctx);
  await seedCommonDependencies(ctx, activeBuildId);
  await appendAudit(ctx, {
    actorPersona: "system",
    command: "demo_seedDrawFlowDemo",
    entityType: "demo",
    eventType: "DemoSeeded",
    scenario: "active",
  });
  await appendAudit(ctx, {
    actorPersona: "system",
    command: "demo_seedDrawFlowDemo",
    entityType: "demo",
    eventType: "DemoSeeded",
    scenario: "proposal",
  });
}

function computeInterestCents(
  amountCents: number,
  releaseDate: string,
  payoffDate: string,
  annualBps: number
) {
  if (amountCents <= 0) {
    return 0;
  }
  const days = Math.max(
    0,
    Math.round(
      (Date.parse(`${payoffDate}T00:00:00.000Z`) -
        Date.parse(`${releaseDate}T00:00:00.000Z`)) /
        DAY_MS
    )
  );
  const dailyRate = annualBps / 10_000 / 365;
  return Math.round(amountCents * ((1 + dailyRate) ** days - 1));
}

function latestPlanningRun(planningRuns: any[]) {
  return planningRuns.sort((a, b) => b.createdAt - a.createdAt)[0] ?? null;
}

function issueHash(parts: (number | string | undefined)[]) {
  return parts.map((part) => String(part ?? "none")).join("|");
}

async function getDismissedIssueKeys(ctx: DemoMutationCtx, scenario: Scenario) {
  const dismissals = await ctx.db
    .query("demo_warningDismissals")
    .withIndex("by_scenario", (q: any) => q.eq("scenario", scenario))
    .collect();
  return new Set<string>(
    dismissals.map((dismissal: any) => dismissal.warningId)
  );
}

function withDismissalState(
  issues: WorkspaceIssue[],
  dismissedKeys: Set<string>
) {
  return issues.map((issue) => ({
    ...issue,
    dismissed:
      dismissedKeys.has(`${issue.id}:${issue.conditionHash}`) ||
      dismissedKeys.has(issue.id),
  }));
}

async function clearProposalDismissals(ctx: DemoMutationCtx) {
  const rows = await ctx.db
    .query("demo_warningDismissals")
    .withIndex("by_scenario", (q: any) => q.eq("scenario", "proposal"))
    .collect();
  for (const row of rows) {
    await ctx.db.delete(row._id);
  }
}

async function recordJitPlanningRun(ctx: DemoMutationCtx, command: string) {
  const build = await getBuild(ctx, "proposal");
  if (!build) {
    return;
  }
  await clearProposalDismissals(ctx);
  const milestones = await getMilestones(ctx, "proposal");
  const drawGroups = await getDrawGroups(ctx, "proposal");
  const dependencies = await getDependencies(ctx, "proposal");
  const validation = validateProposal(
    milestones,
    drawGroups,
    dependencies,
    build.workingCapitalLimitCents
  );
  await ctx.db.insert("demo_planningRuns", {
    buildId: build._id,
    createdAt: Date.now(),
    errors: validation.errors,
    interestEstimateCents: drawGroups.length * FLAT_DRAW_FEE_CENTS,
    recommendedDrawCount: Math.max(1, drawGroups.length),
    recommendedOrderKeys: RECOMMENDED_ORDER,
    runType: "jit",
    scenario: "proposal",
    status: validation.errors.length > 0 ? "blocked" : "feasible",
    warnings: validation.warnings,
  });
  await appendAudit(ctx, {
    actorPersona: "system",
    buildId: build._id,
    command,
    entityType: "planning_run",
    eventType: "ProposalPlanCompiledJustInTime",
    scenario: "proposal",
  });
}

async function buildProjection(ctx: DemoMutationCtx, scenario: Scenario) {
  const build = await getBuild(ctx, scenario);
  if (!build) {
    return { needsSeed: true, scenario };
  }

  const milestones = await getMilestones(ctx, scenario);
  const drawGroups = await getDrawGroups(ctx, scenario);
  const dependencies = await getDependencies(ctx, scenario);
  const rolloverBuffers = await ctx.db
    .query("demo_rolloverBuffers")
    .withIndex("by_scenario", (q: any) => q.eq("scenario", scenario))
    .collect();
  const planningRuns = await ctx.db
    .query("demo_planningRuns")
    .withIndex("by_scenario", (q: any) => q.eq("scenario", scenario))
    .collect();
  const auditEvents = await ctx.db
    .query("demo_auditEvents")
    .withIndex("by_scenario", (q: any) => q.eq("scenario", scenario))
    .collect();
  const outboxEvents = await ctx.db
    .query("demo_eventOutbox")
    .withIndex("by_scenario", (q: any) => q.eq("scenario", scenario))
    .collect();
  const siteVisits = await ctx.db
    .query("demo_siteVisits")
    .withIndex("by_scenario", (q: any) => q.eq("scenario", scenario))
    .collect();
  const reviewReports = await ctx.db
    .query("demo_reviewReports")
    .withIndex("by_milestone", (q: any) => q.eq("scenario", scenario))
    .collect()
    .catch(async () => []);
  const evidencePackages = await ctx.db
    .query("demo_evidencePackages")
    .withIndex("by_scenario", (q: any) => q.eq("scenario", scenario))
    .collect();

  const milestoneByKey = new Map<string, any>();
  for (const milestone of milestones) {
    milestoneByKey.set(milestone.key, milestone);
  }

  const groupByKey = new Map<string, any>();
  for (const group of drawGroups) {
    groupByKey.set(group.key, group);
  }

  const proposalValidation = validateProposal(
    milestones,
    drawGroups,
    dependencies,
    build.workingCapitalLimitCents
  );
  const dismissedIssueKeys = await getDismissedIssueKeys(ctx, scenario);
  const typedIssues = withDismissalState(
    scenario === "proposal" ? proposalValidation.issues : [],
    dismissedIssueKeys
  );

  const decoratedMilestones: any[] = [];
  for (const milestone of milestones) {
    const evidenceFiles = await activeEvidenceFiles(
      ctx,
      scenario,
      milestone.key
    );
    const milestoneEvidencePackages = evidencePackages
      .filter((item: any) => item.milestoneKey === milestone.key)
      .sort((a: any, b: any) => b.createdAt - a.createdAt);
    const milestoneSiteVisits = siteVisits
      .filter((visit: any) => visit.milestoneKey === milestone.key)
      .sort((a: any, b: any) => b.createdAt - a.createdAt);
    const milestoneReviewReports = reviewReports
      .filter((report: any) => report.milestoneKey === milestone.key)
      .sort((a: any, b: any) => b.createdAt - a.createdAt);
    const evidencePackage = milestoneEvidencePackages[0];
    const siteVisit = milestoneSiteVisits[0];
    const blockers = deriveBlockingReasons({
      dependencies,
      drawGroups,
      evidenceFiles,
      groupByKey,
      milestone,
      milestoneByKey,
      proposalValidation,
      scenario,
      siteVisit,
    });
    const milestoneIssues = typedIssues.filter((issue) =>
      issue.milestoneIds.includes(milestone.key)
    );
    const blocks = dependencies
      .filter((edge: any) => edge.blockerKey === milestone.key)
      .map((edge: any) => edge.blockedKey);
    const blockedBy = dependencies
      .filter((edge: any) => edge.blockedKey === milestone.key)
      .map((edge: any) => edge.blockerKey);
    const displayStatus =
      scenario === "active" &&
      milestone.status === "planned" &&
      blockers.length === 0
        ? "ready"
        : milestone.status;

    decoratedMilestones.push({
      ...milestone,
      blockedByKeys: blockedBy,
      blockingKeys: blocks,
      blockingReasons: blockers,
      issues: milestoneIssues,
      displayStatus,
      evidenceCount: evidenceFiles.length,
      evidenceFiles: evidenceFiles
        .sort((a: any, b: any) => b.uploadedAt - a.uploadedAt)
        .map((file: any) => ({
          fileName: file.fileName,
          id: file._id,
          isSample: file.isSample,
          mimeType: file.mimeType,
          sizeBytes: file.sizeBytes,
          uploadedAt: file.uploadedAt,
          uploadedByPersona: file.uploadedByPersona,
        })),
      latestEvidencePackage: evidencePackage,
      evidencePackages: milestoneEvidencePackages,
      latestReview: milestoneReviewReports[0],
      reviewReports: milestoneReviewReports,
      latestSiteVisit: siteVisit,
      siteVisits: milestoneSiteVisits,
    });
  }

  const projectedGroups = drawGroups.map((group: any) => {
    const groupMilestones = decoratedMilestones.filter(
      (milestone) => milestone.drawGroupKey === group.key
    );
    const startField =
      scenario === "active" ? "forecastStartDate" : "plannedStartDate";
    const endField =
      scenario === "active" ? "forecastEndDate" : "plannedEndDate";
    const fallbackStartDate =
      group[startField] ??
      group.plannedStartDate ??
      group.forecastStartDate ??
      build.projectStartDate;
    const fallbackEndDate =
      group[endField] ??
      group.plannedEndDate ??
      group.forecastEndDate ??
      fallbackStartDate;
    const fallbackRow = Math.min(
      Math.max(1, group.order),
      Math.max(1, decoratedMilestones.length)
    );
    return {
      ...group,
      approvedValueCents: groupAmount(groupMilestones),
      eligibleDate:
        groupMilestones.length > 0
          ? addDays(
              latestDate(groupMilestones.map((item) => item[endField])),
              1
            )
          : addDays(fallbackEndDate, 1),
      endDate:
        groupMilestones.length > 0
          ? latestDate(groupMilestones.map((item) => item[endField]))
          : fallbackEndDate,
      firstRow:
        groupMilestones.length > 0
          ? Math.min(...groupMilestones.map((item) => item.order))
          : fallbackRow,
      lastRow:
        groupMilestones.length > 0
          ? Math.max(...groupMilestones.map((item) => item.order))
          : fallbackRow,
      requestedValueCents: groupMilestones.reduce(
        (sum, item) =>
          sum + (item.requestedAmountCents ?? item.approvedValueCents),
        0
      ),
      issues: typedIssues.filter((issue) =>
        issue.drawGroupIds.includes(group.key)
      ),
      startDate:
        groupMilestones.length > 0
          ? earliestDate(groupMilestones.map((item) => item[startField]))
          : fallbackStartDate,
    };
  });

  const approvedProjectValueCents = milestones.reduce(
    (sum: number, milestone: any) => sum + milestone.approvedValueCents,
    0
  );
  const projectedCapitalDrawnCents = milestones.reduce(
    (sum: number, milestone: any) =>
      sum + (milestone.requestedAmountCents ?? milestone.approvedValueCents),
    0
  );
  const drawFeesCents =
    projectedGroups.filter((group: any) => group.requestedValueCents > 0)
      .length * build.flatDrawFeeCents;
  const interestEstimateCents = projectedGroups.reduce(
    (sum: number, group: any) =>
      sum +
      computeInterestCents(
        group.requestedValueCents,
        addDays(group.endDate, 1),
        build.payoffDate,
        build.interestAnnualBps
      ),
    0
  );
  const rolloverBufferCents = rolloverBuffers.reduce(
    (sum: number, buffer: any) =>
      buffer.status === "available" ? sum + buffer.unusedAmountCents : sum,
    0
  );

  return {
    auditEvents: auditEvents.sort(
      (a: any, b: any) => b.createdAt - a.createdAt
    ),
    build,
    dependencies,
    drawGroups: projectedGroups,
    latestPlanningRun: latestPlanningRun(planningRuns),
    issues: typedIssues,
    milestones: decoratedMilestones,
    needsSeed: false,
    outboxEvents: outboxEvents.sort(
      (a: any, b: any) => b.createdAt - a.createdAt
    ),
    rolloverBuffers,
    scenario,
    siteVisits,
    summary: {
      approvedProjectValueCents,
      drawFeesCents,
      interestEstimateCents,
      projectedBorrowerCostCents:
        approvedProjectValueCents + drawFeesCents + interestEstimateCents,
      projectedCapitalDrawnCents,
      remainingApprovedBudgetCents:
        approvedProjectValueCents - projectedCapitalDrawnCents,
      rolloverBufferCents,
      statusCounts: decoratedMilestones.reduce(
        (counts: Record<string, number>, milestone) => {
          counts[milestone.displayStatus] =
            (counts[milestone.displayStatus] ?? 0) + 1;
          return counts;
        },
        {}
      ),
      validationErrors: proposalValidation.errors,
      validationWarnings: proposalValidation.warnings,
      workingCapitalLimitCents: build.workingCapitalLimitCents,
    },
  };
}

function validateProposal(
  milestones: any[],
  drawGroups: any[],
  dependencies: any[],
  workingCapitalLimitCents: number
) {
  const errors: string[] = [];
  const warnings: string[] = [];
  const issues: WorkspaceIssue[] = [];
  const byKey = new Map<string, any>();
  for (const milestone of milestones) {
    byKey.set(milestone.key, milestone);
    if (milestone.approvedValueCents <= 0) {
      const message = `${milestone.name} must have a positive approved value.`;
      errors.push(message);
      issues.push({
        code: "MILESTONE_VALUE_MISSING",
        conditionHash: issueHash([milestone.key, milestone.approvedValueCents]),
        dependencyIds: [],
        dismissible: false,
        dismissed: false,
        drawGroupIds: [milestone.drawGroupKey],
        id: `milestone-value-${milestone.key}`,
        impact:
          "Proposal submission is blocked until every budget line has a reimbursable value.",
        message,
        milestoneIds: [milestone.key],
        quickFix: {
          action: "openMilestoneEditor",
          label: "Open milestone estimate",
          targetId: milestone.key,
        },
        scope: "milestone",
        severity: "blocking",
        title: "Missing milestone value",
      });
    }
  }

  for (const group of drawGroups) {
    const groupMilestones = milestones.filter(
      (milestone) => milestone.drawGroupKey === group.key
    );
    const amount = groupMilestones.reduce(
      (sum, milestone) => sum + milestone.approvedValueCents,
      0
    );
    if (amount > workingCapitalLimitCents) {
      const message = `${group.label} exceeds Borrower Working Capital Limit.`;
      errors.push(message);
      issues.push({
        code: "DRAW_GROUP_WORKING_CAPITAL_EXCEEDED",
        conditionHash: issueHash([group.key, amount, workingCapitalLimitCents]),
        dependencyIds: [],
        dismissible: false,
        dismissed: false,
        drawGroupIds: [group.key],
        id: `draw-capital-${group.key}`,
        impact:
          "The borrower would need more working capital than the lender-configured cap before reimbursement.",
        message,
        milestoneIds: groupMilestones.map((milestone) => milestone.key),
        quickFix: {
          action: "splitDrawGroup",
          label: "Split this draw group",
          targetId: group.key,
        },
        scope: "drawGroup",
        severity: "blocking",
        title: "Working-capital cap exceeded",
      });
    }
  }

  const sortedGroups = [...drawGroups].sort((a, b) => a.order - b.order);
  for (let index = 0; index < sortedGroups.length - 1; index += 1) {
    const current = sortedGroups[index];
    const next = sortedGroups[index + 1];
    const currentMilestones = milestones.filter(
      (milestone) => milestone.drawGroupKey === current.key
    );
    const nextMilestones = milestones.filter(
      (milestone) => milestone.drawGroupKey === next.key
    );
    const currentEnd =
      current.plannedEndDate ??
      (currentMilestones.length
        ? latestDate(
            currentMilestones.map((milestone) => milestone.plannedEndDate)
          )
        : undefined);
    const nextStart =
      next.plannedStartDate ??
      (nextMilestones.length
        ? earliestDate(
            nextMilestones.map((milestone) => milestone.plannedStartDate)
          )
        : undefined);
    if (currentEnd && nextStart && currentEnd >= nextStart) {
      const message = `${current.label} ends on or after ${next.label} starts.`;
      warnings.push(message);
      issues.push({
        code: "DRAW_GROUP_OVERLAP",
        conditionHash: issueHash([
          current.key,
          currentEnd,
          next.key,
          nextStart,
        ]),
        dependencyIds: [],
        dismissible: true,
        dismissed: false,
        drawGroupIds: [current.key, next.key],
        id: `draw-overlap-${current.key}-${next.key}`,
        impact:
          "Eligibility dates, review sequencing, and reimbursement release timing become ambiguous when draw groups overlap.",
        message,
        milestoneIds: [
          ...currentMilestones.map((milestone) => milestone.key),
          ...nextMilestones.map((milestone) => milestone.key),
        ],
        quickFix: {
          action: "shiftNextDrawGroup",
          label: `Shift ${next.label} after ${current.label}`,
          targetId: current.key,
        },
        scope: "drawGroup",
        severity: "warning",
        title: "Draw groups overlap",
      });
    }
  }

  for (const edge of dependencies) {
    const blocker = byKey.get(edge.blockerKey);
    const blocked = byKey.get(edge.blockedKey);
    if (!(blocker && blocked)) {
      continue;
    }
    const violatesSchedule = blocker.plannedEndDate >= blocked.plannedStartDate;
    if (violatesSchedule && edge.severity === "blocking") {
      const message = `${blocker.name} must finish before ${blocked.name}.`;
      errors.push(message);
      issues.push({
        code: "DEPENDENCY_ORDER_BLOCKED",
        conditionHash: issueHash([
          edge._id,
          blocker.plannedEndDate,
          blocked.plannedStartDate,
        ]),
        dependencyIds: [edge._id],
        dismissible: false,
        dismissed: false,
        drawGroupIds: [blocker.drawGroupKey, blocked.drawGroupKey],
        id: `dependency-order-${edge.blockerKey}-${edge.blockedKey}`,
        impact:
          "A hard construction dependency is out of sequence, so proposal submission cannot proceed.",
        message,
        milestoneIds: [blocker.key, blocked.key],
        quickFix: {
          action: "shiftDependentMilestone",
          label: `Shift ${blocked.name} after ${blocker.name}`,
          targetId: edge._id,
        },
        scope: "dependency",
        severity: "blocking",
        title: "Dependency schedule conflict",
      });
    } else if (violatesSchedule) {
      const message = `${blocker.name} is scheduled tight against ${blocked.name}.`;
      warnings.push(message);
      issues.push({
        code: "DEPENDENCY_ORDER_WARNING",
        conditionHash: issueHash([
          edge._id,
          blocker.plannedEndDate,
          blocked.plannedStartDate,
        ]),
        dependencyIds: [edge._id],
        dismissible: true,
        dismissed: false,
        drawGroupIds: [blocker.drawGroupKey, blocked.drawGroupKey],
        id: `dependency-warning-${edge.blockerKey}-${edge.blockedKey}`,
        impact:
          "This soft dependency may create field coordination risk or lender review questions.",
        message,
        milestoneIds: [blocker.key, blocked.key],
        quickFix: {
          action: "shiftDependentMilestone",
          label: `Shift ${blocked.name}`,
          targetId: edge._id,
        },
        scope: "dependency",
        severity: "warning",
        title: "Soft dependency is tight",
      });
    }
  }

  return { errors, issues, warnings };
}

function deriveBlockingReasons(input: {
  dependencies: any[];
  drawGroups: any[];
  evidenceFiles: any[];
  groupByKey: Map<string, any>;
  milestone: any;
  milestoneByKey: Map<string, any>;
  proposalValidation: { errors: string[]; warnings: string[] };
  scenario: Scenario;
  siteVisit?: any;
}) {
  const reasons = new Set<string>();
  if (input.scenario === "active") {
    const group = input.groupByKey.get(input.milestone.drawGroupKey);
    const priorGroups = input.drawGroups.filter(
      (candidate) => candidate.order < group.order
    );
    if (
      priorGroups.some((candidate) => candidate.status !== "release_approved")
    ) {
      reasons.add("capital_blocked");
    }
  }

  for (const edge of input.dependencies) {
    const blocker = input.milestoneByKey.get(edge.blockerKey);
    if (!blocker) {
      continue;
    }
    if (edge.blockedKey === input.milestone.key) {
      const dependencySatisfied = blocker.status === "completion_approved";
      if (!dependencySatisfied && edge.type === "procurement_dependency") {
        reasons.add("procurement_dependency_blocked");
      } else if (!dependencySatisfied && edge.severity === "blocking") {
        reasons.add("hard_dependency_blocked");
      }
    }
    if (
      input.scenario === "active" &&
      edge.blockerKey === input.milestone.key &&
      input.milestone.forecastEndDate >=
        (input.milestoneByKey.get(edge.blockedKey)?.forecastStartDate ??
          "9999-01-01")
    ) {
      reasons.add("forecast_invalid");
    }
  }

  if (
    input.milestone.status === "complete_pending_submission" &&
    input.evidenceFiles.length === 0
  ) {
    reasons.add("evidence_required");
  }
  if (
    input.milestone.status === "submitted_for_review" &&
    input.milestone.evidenceReviewStatus !== "accepted"
  ) {
    reasons.add("review_required");
  }
  if (
    input.milestone.requiresSiteVisit &&
    ["submitted_for_review", "site_visit_requested"].includes(
      input.milestone.status
    ) &&
    input.siteVisit?.status !== "completed"
  ) {
    reasons.add("site_visit_required");
  }
  if (input.scenario === "proposal") {
    const relatedHardError = input.proposalValidation.errors.some((error) =>
      error.includes(input.milestone.name)
    );
    if (relatedHardError) {
      reasons.add("draw_group_limit_exceeded");
    }
  }

  return [...reasons];
}

async function recomputeActiveDrawGroupStatuses(ctx: DemoMutationCtx) {
  const groups = await getDrawGroups(ctx, "active");
  const milestones = await getMilestones(ctx, "active");
  for (const group of groups) {
    const groupMilestones = milestones.filter(
      (milestone: any) => milestone.drawGroupKey === group.key
    );
    const allApproved = groupMilestones.every(
      (milestone: any) => milestone.status === "completion_approved"
    );
    const nextStatus = allApproved
      ? "release_approved"
      : group.order === 2
        ? "partially_eligible"
        : "not_yet_eligible";
    if (group.status !== nextStatus) {
      await ctx.db.patch(group._id, {
        releaseApprovedAt:
          nextStatus === "release_approved"
            ? Date.now()
            : group.releaseApprovedAt,
        status: nextStatus,
        updatedAt: Date.now(),
      });
      if (nextStatus === "release_approved") {
        await appendAudit(ctx, {
          actorPersona: "system",
          buildId: group.buildId,
          command: "demo_recomputeDrawGroupStatuses",
          drawGroupKey: group.key,
          entityKey: group.key,
          entityLabel: group.label,
          entityType: "draw_group",
          eventType: "DrawGroupReleaseApproved",
          scenario: "active",
        });
        await appendOutbox(ctx, {
          buildId: group.buildId,
          drawGroupKey: group.key,
          eventType: "demo.drawGroup.releaseApproved",
          payloadPreview: `${group.label} release approved; capital exposure reset.`,
          relatedEntity: group.label,
          scenario: "active",
        });
      }
    }
  }
}

async function recalcDrawGroupDates(ctx: DemoMutationCtx, scenario: Scenario) {
  const groups = await getDrawGroups(ctx, scenario);
  const milestones = await getMilestones(ctx, scenario);
  const startField =
    scenario === "active" ? "forecastStartDate" : "plannedStartDate";
  const endField = scenario === "active" ? "forecastEndDate" : "plannedEndDate";

  for (const group of groups) {
    const groupMilestones = milestones.filter(
      (milestone: any) => milestone.drawGroupKey === group.key
    );
    if (groupMilestones.length === 0) {
      continue;
    }
    await ctx.db.patch(group._id, {
      approvedValueCents: groupAmount(groupMilestones),
      [endField]: latestDate(
        groupMilestones.map((item: any) => item[endField])
      ),
      [startField]: earliestDate(
        groupMilestones.map((item: any) => item[startField])
      ),
      requestedValueCents: groupMilestones.reduce(
        (sum: number, item: any) =>
          sum + (item.requestedAmountCents ?? item.approvedValueCents),
        0
      ),
      updatedAt: Date.now(),
    });
  }
}

async function ensureDraftEvidencePackage(
  ctx: DemoMutationCtx,
  milestone: any
) {
  const existing = await latestEvidencePackage(ctx, "active", milestone.key);
  if (existing && existing.status === "draft") {
    return existing._id;
  }
  return await ctx.db.insert("demo_evidencePackages", {
    buildId: milestone.buildId,
    createdAt: Date.now(),
    milestoneId: milestone._id,
    milestoneKey: milestone.key,
    reviewStatus: "not_started",
    scenario: "active",
    status: "draft",
  });
}

export const demo_seedDrawFlowDemo = publicMutation
  .use(withMutationTiming("demo_drawflow.seed"))
  .input({})
  .returns(v.any())
  .handler(async (ctx) => {
    const active = await getBuild(ctx, "active");
    const proposal = await getBuild(ctx, "proposal");
    if (active && proposal) {
      return { seeded: false };
    }
    await cleanupAll(ctx);
    await seedAll(ctx);
    return { seeded: true };
  })
  .public();

export const demo_cleanupDrawFlowDemo = publicMutation
  .use(withMutationTiming("demo_drawflow.cleanup"))
  .input({})
  .returns(v.any())
  .handler(async (ctx) => {
    await cleanupAll(ctx);
    return { cleaned: true };
  })
  .public();

export const demo_resetDrawFlowDemo = publicMutation
  .use(withMutationTiming("demo_drawflow.reset"))
  .input({})
  .returns(v.any())
  .handler(async (ctx) => {
    await cleanupAll(ctx);
    await seedAll(ctx);
    await appendAudit(ctx, {
      actorPersona: "system",
      command: "demo_resetDrawFlowDemo",
      entityType: "demo",
      eventType: "DemoReset",
      scenario: "active",
    });
    return { reset: true };
  })
  .public();

export const demo_getActiveWorkspace = publicQuery
  .use(withQueryTiming("demo_drawflow.getActiveWorkspace"))
  .returns(v.any())
  .handler(async (ctx) => await buildProjection(ctx, "active"))
  .public();

export const demo_getProposalWorkspace = publicQuery
  .use(withQueryTiming("demo_drawflow.getProposalWorkspace"))
  .returns(v.any())
  .handler(async (ctx) => await buildProjection(ctx, "proposal"))
  .public();

export const demo_getWorkspace = publicQuery
  .use(withQueryTiming("demo_drawflow.getWorkspace"))
  .input({ scenario: v.union(v.literal("active"), v.literal("proposal")) })
  .returns(v.any())
  .handler(async (ctx, args) => await buildProjection(ctx, args.scenario))
  .public();

export const demo_getAuditEvents = publicQuery
  .use(withQueryTiming("demo_drawflow.getAuditEvents"))
  .input({
    drawGroupKey: v.optional(v.string()),
    milestoneKey: v.optional(v.string()),
    scenario: v.union(v.literal("active"), v.literal("proposal")),
  })
  .returns(v.any())
  .handler(async (ctx, args) => {
    const events = await ctx.db
      .query("demo_auditEvents")
      .withIndex("by_scenario", (q) => q.eq("scenario", args.scenario))
      .collect();
    return events
      .filter((event) =>
        args.milestoneKey ? event.milestoneKey === args.milestoneKey : true
      )
      .filter((event) =>
        args.drawGroupKey ? event.drawGroupKey === args.drawGroupKey : true
      )
      .sort((a, b) => b.createdAt - a.createdAt);
  })
  .public();

export const demo_getEventOutbox = publicQuery
  .use(withQueryTiming("demo_drawflow.getEventOutbox"))
  .input({ scenario: v.union(v.literal("active"), v.literal("proposal")) })
  .returns(v.any())
  .handler(async (ctx, args) => {
    const events = await ctx.db
      .query("demo_eventOutbox")
      .withIndex("by_scenario", (q) => q.eq("scenario", args.scenario))
      .collect();
    return events.sort((a, b) => b.createdAt - a.createdAt);
  })
  .public();

export const demo_updateMilestoneProgress = publicMutation
  .use(withMutationTiming("demo_drawflow.updateMilestoneProgress"))
  .input({
    milestoneKey: v.string(),
    mode: v.union(v.literal("mark_complete"), v.literal("set_progress")),
    persona: v.string(),
    progressPercent: v.optional(v.number()),
  })
  .returns(v.any())
  .handler(async (ctx, args) => {
    const milestone = await findMilestone(ctx, "active", args.milestoneKey);
    if (!milestone) {
      throw new Error("Milestone not found");
    }
    if (args.persona !== "builder_lead") {
      await appendAudit(ctx, {
        actorPersona: args.persona,
        command: "demo_updateMilestoneProgress",
        entityKey: milestone.key,
        entityLabel: milestone.name,
        entityType: "milestone",
        eventType: "MilestoneProgressRejected",
        milestoneKey: milestone.key,
        scenario: "active",
        validation: "rejected",
      });
      throw new Error("Only Builder Lead can update milestone progress.");
    }
    const patch =
      args.mode === "mark_complete"
        ? {
            actualCompletedDate: DEMO_TODAY,
            progressPercent: 100,
            status: "complete_pending_submission",
            updatedAt: Date.now(),
          }
        : {
            progressPercent: args.progressPercent ?? milestone.progressPercent,
            updatedAt: Date.now(),
          };
    await ctx.db.patch(milestone._id, patch);
    await appendAudit(ctx, {
      actorPersona: args.persona,
      afterSummary:
        args.mode === "mark_complete"
          ? "Progress set to 100%"
          : "Progress updated",
      beforeSummary: `${milestone.progressPercent}%`,
      buildId: milestone.buildId,
      command: "demo_updateMilestoneProgress",
      entityKey: milestone.key,
      entityLabel: milestone.name,
      entityType: "milestone",
      eventType:
        args.mode === "mark_complete"
          ? "MilestoneMarkedComplete"
          : "MilestoneProgressUpdated",
      milestoneKey: milestone.key,
      scenario: "active",
    });
    await recalcDrawGroupDates(ctx, "active");
    return { ok: true };
  })
  .public();

export const demo_updateForecastDatesWithReason = publicMutation
  .use(withMutationTiming("demo_drawflow.updateForecastDatesWithReason"))
  .input({
    forecastEndDate: v.string(),
    forecastStartDate: v.string(),
    milestoneKey: v.string(),
    persona: v.string(),
    reason: v.string(),
  })
  .returns(v.any())
  .handler(async (ctx, args) => {
    if (!args.reason.trim()) {
      throw new Error("Forecast date changes require a reason.");
    }
    const milestone = await findMilestone(ctx, "active", args.milestoneKey);
    if (!milestone) {
      throw new Error("Milestone not found");
    }
    if (milestone.isDragLocked) {
      throw new Error(`${milestone.name} is locked and cannot be moved.`);
    }
    if (args.forecastEndDate < args.forecastStartDate) {
      throw new Error("Forecast end date must be after start date.");
    }
    const priorEndDate = milestone.forecastEndDate;
    const priorStartDate = milestone.forecastStartDate;
    await ctx.db.patch(milestone._id, {
      durationDays: dateDiffDays(args.forecastStartDate, args.forecastEndDate),
      forecastEndDate: args.forecastEndDate,
      forecastStartDate: args.forecastStartDate,
      updatedAt: Date.now(),
    });
    await ctx.db.insert("demo_forecastUpdates", {
      actorPersona: args.persona,
      buildId: milestone.buildId,
      createdAt: Date.now(),
      milestoneId: milestone._id,
      milestoneKey: milestone.key,
      newEndDate: args.forecastEndDate,
      newStartDate: args.forecastStartDate,
      priorEndDate,
      priorStartDate,
      reason: args.reason,
      scenario: "active",
    });
    await appendAudit(ctx, {
      actorPersona: args.persona,
      afterSummary: `${args.forecastStartDate} → ${args.forecastEndDate}`,
      beforeSummary: `${priorStartDate} → ${priorEndDate}`,
      buildId: milestone.buildId,
      command: "demo_updateForecastDatesWithReason",
      entityKey: milestone.key,
      entityLabel: milestone.name,
      entityType: "milestone",
      eventType: "ActiveMilestoneForecastChanged",
      milestoneKey: milestone.key,
      reason: args.reason,
      scenario: "active",
    });
    await recalcDrawGroupDates(ctx, "active");
    return { ok: true };
  })
  .public();

export const demo_setMilestoneDragLocked = publicMutation
  .use(withMutationTiming("demo_drawflow.setMilestoneDragLocked"))
  .input({
    locked: v.boolean(),
    milestoneKey: v.string(),
    persona: v.string(),
    scenario: v.union(v.literal("active"), v.literal("proposal")),
  })
  .returns(v.any())
  .handler(async (ctx, args) => {
    const build = await getBuildOrThrow(ctx, args.scenario);
    if (args.scenario === "proposal" && build.status === "submitted") {
      throw new Error(
        "Submitted proposals cannot change milestone drag locks."
      );
    }
    const milestone = await findMilestone(
      ctx,
      args.scenario,
      args.milestoneKey
    );
    if (!milestone) {
      throw new Error("Milestone not found");
    }
    const beforeLocked = Boolean(milestone.isDragLocked);
    await ctx.db.patch(milestone._id, {
      isDragLocked: args.locked,
      updatedAt: Date.now(),
    });
    await appendAudit(ctx, {
      actorPersona: args.persona,
      afterSummary: args.locked
        ? "Timeline drag locked"
        : "Timeline drag unlocked",
      beforeSummary: beforeLocked
        ? "Timeline drag locked"
        : "Timeline drag unlocked",
      buildId: milestone.buildId,
      command: "demo_setMilestoneDragLocked",
      entityKey: milestone.key,
      entityLabel: milestone.name,
      entityType: "milestone",
      eventType: args.locked ? "MilestoneDragLocked" : "MilestoneDragUnlocked",
      milestoneKey: milestone.key,
      reason: "Timeline drag lock toggled.",
      scenario: args.scenario,
    });
    return { ok: true };
  })
  .public();

export const demo_batchMoveMilestoneDates = publicMutation
  .use(withMutationTiming("demo_drawflow.batchMoveMilestoneDates"))
  .input({
    moves: v.array(
      v.object({
        endDate: v.string(),
        milestoneKey: v.string(),
        startDate: v.string(),
      })
    ),
    persona: v.string(),
    reason: v.optional(v.string()),
    scenario: v.union(v.literal("active"), v.literal("proposal")),
    source: v.union(v.literal("selection"), v.literal("drawGroup")),
    sourceKey: v.optional(v.string()),
  })
  .returns(v.any())
  .handler(async (ctx, args) => {
    if (args.moves.length === 0) {
      throw new Error("At least one milestone move is required.");
    }
    if (args.scenario === "active" && !args.reason?.trim()) {
      throw new Error("Forecast batch changes require a reason.");
    }
    const build = await getBuildOrThrow(ctx, args.scenario);
    if (args.scenario === "proposal" && build.status === "submitted") {
      throw new Error("Submitted proposals cannot move milestone dates.");
    }

    const milestones = await getMilestones(ctx, args.scenario);
    const milestoneByKey = new Map<string, any>(
      milestones.map((milestone: any) => [milestone.key, milestone])
    );
    const loadedMoves = args.moves.map((move) => {
      const milestone = milestoneByKey.get(move.milestoneKey);
      if (!milestone) {
        throw new Error(`Milestone not found: ${move.milestoneKey}`);
      }
      if (milestone.isDragLocked) {
        throw new Error(`${milestone.name} is locked and cannot be moved.`);
      }
      if (move.endDate < move.startDate) {
        throw new Error("Milestone end date must be after start date.");
      }
      return { milestone, move };
    });

    const first = loadedMoves[0];
    const priorFirstStart =
      args.scenario === "active"
        ? first.milestone.forecastStartDate
        : first.milestone.plannedStartDate;
    const deltaDays = Math.round(
      (Date.parse(`${first.move.startDate}T00:00:00.000Z`) -
        Date.parse(`${priorFirstStart}T00:00:00.000Z`)) /
        DAY_MS
    );

    for (const { milestone, move } of loadedMoves) {
      const priorEndDate =
        args.scenario === "active"
          ? milestone.forecastEndDate
          : milestone.plannedEndDate;
      const priorStartDate =
        args.scenario === "active"
          ? milestone.forecastStartDate
          : milestone.plannedStartDate;
      await ctx.db.patch(
        milestone._id,
        args.scenario === "active"
          ? {
              durationDays: dateDiffDays(move.startDate, move.endDate),
              forecastEndDate: move.endDate,
              forecastStartDate: move.startDate,
              updatedAt: Date.now(),
            }
          : {
              durationDays: dateDiffDays(move.startDate, move.endDate),
              plannedEndDate: move.endDate,
              plannedStartDate: move.startDate,
              updatedAt: Date.now(),
            }
      );
      if (args.scenario === "active") {
        await ctx.db.insert("demo_forecastUpdates", {
          actorPersona: args.persona,
          buildId: milestone.buildId,
          createdAt: Date.now(),
          milestoneId: milestone._id,
          milestoneKey: milestone.key,
          newEndDate: move.endDate,
          newStartDate: move.startDate,
          priorEndDate,
          priorStartDate,
          reason: args.reason?.trim() ?? "",
          scenario: "active",
        });
      }
    }

    await appendAudit(ctx, {
      actorPersona: args.persona,
      afterSummary: `${loadedMoves.length} milestones shifted ${deltaDays} days`,
      buildId: build._id,
      command: "demo_batchMoveMilestoneDates",
      drawGroupKey: args.source === "drawGroup" ? args.sourceKey : undefined,
      entityKey: args.sourceKey,
      entityLabel:
        args.source === "drawGroup" ? args.sourceKey : "Selected milestones",
      entityType: "milestone_batch",
      eventType:
        args.scenario === "active"
          ? "ActiveMilestoneForecastBatchShifted"
          : "ProposalMilestoneDatesBatchShifted",
      reason: args.reason?.trim(),
      scenario: args.scenario,
      validation: JSON.stringify({
        movedMilestoneKeys: loadedMoves.map(({ milestone }) => milestone.key),
        source: args.source,
        sourceKey: args.sourceKey,
      }),
    });
    await recalcDrawGroupDates(ctx, args.scenario);
    if (args.scenario === "proposal") {
      await recordJitPlanningRun(ctx, "demo_jitProposalCompilation");
    }
    return { ok: true };
  })
  .public();

export const demo_addSampleEvidence = publicMutation
  .use(withMutationTiming("demo_drawflow.addSampleEvidence"))
  .input({ milestoneKey: v.string(), persona: v.string() })
  .returns(v.any())
  .handler(async (ctx, args) => {
    const milestone = await findMilestone(ctx, "active", args.milestoneKey);
    if (!milestone) {
      throw new Error("Milestone not found");
    }
    if (args.persona !== "builder_lead") {
      throw new Error("Only Builder Lead can add evidence.");
    }
    const packageId = await ensureDraftEvidencePackage(ctx, milestone);
    const evidenceId = await ctx.db.insert("demo_evidenceFiles", {
      buildId: milestone.buildId,
      evidencePackageId: packageId,
      fileName: `${milestone.key}-inspection-photo-01.jpg`,
      isSample: true,
      milestoneId: milestone._id,
      milestoneKey: milestone.key,
      mimeType: "image/jpeg",
      scenario: "active",
      sizeBytes: 482_000,
      uploadedAt: Date.now(),
      uploadedByPersona: args.persona,
    });
    await appendAudit(ctx, {
      actorPersona: args.persona,
      buildId: milestone.buildId,
      command: "demo_addSampleEvidence",
      entityKey: milestone.key,
      entityLabel: milestone.name,
      entityType: "milestone",
      eventType: "SampleEvidenceAdded",
      milestoneKey: milestone.key,
      scenario: "active",
    });
    return { evidenceId };
  })
  .public();

export const demo_registerUploadedEvidenceMetadata = publicMutation
  .use(withMutationTiming("demo_drawflow.registerUploadedEvidenceMetadata"))
  .input({
    fileName: v.string(),
    milestoneKey: v.string(),
    mimeType: v.string(),
    persona: v.string(),
    sizeBytes: v.number(),
  })
  .returns(v.any())
  .handler(async (ctx, args) => {
    const milestone = await findMilestone(ctx, "active", args.milestoneKey);
    if (!milestone) {
      throw new Error("Milestone not found");
    }
    const packageId = await ensureDraftEvidencePackage(ctx, milestone);
    const evidenceId = await ctx.db.insert("demo_evidenceFiles", {
      buildId: milestone.buildId,
      evidencePackageId: packageId,
      fileName: args.fileName,
      isSample: false,
      milestoneId: milestone._id,
      milestoneKey: milestone.key,
      mimeType: args.mimeType || "application/octet-stream",
      scenario: "active",
      sizeBytes: args.sizeBytes,
      uploadedAt: Date.now(),
      uploadedByPersona: args.persona,
    });
    await appendAudit(ctx, {
      actorPersona: args.persona,
      buildId: milestone.buildId,
      command: "demo_registerUploadedEvidenceMetadata",
      entityKey: milestone.key,
      entityLabel: milestone.name,
      entityType: "milestone",
      eventType: "EvidenceMetadataRegistered",
      milestoneKey: milestone.key,
      scenario: "active",
    });
    return { evidenceId };
  })
  .public();

export const demo_removeEvidenceFile = publicMutation
  .use(withMutationTiming("demo_drawflow.removeEvidenceFile"))
  .input({ evidenceFileId: v.id("demo_evidenceFiles"), persona: v.string() })
  .returns(v.any())
  .handler(async (ctx, args) => {
    const evidence = await ctx.db.get(args.evidenceFileId);
    if (!evidence) {
      throw new Error("Evidence not found");
    }
    const evidencePackage = evidence.evidencePackageId
      ? await ctx.db.get(evidence.evidencePackageId)
      : null;
    if (evidencePackage?.status === "submitted") {
      throw new Error("Submitted evidence packages are frozen.");
    }
    await ctx.db.patch(evidence._id, { removedAt: Date.now() });
    await appendAudit(ctx, {
      actorPersona: args.persona,
      buildId: evidence.buildId,
      command: "demo_removeEvidenceFile",
      entityKey: evidence.milestoneKey,
      entityType: "evidence_file",
      eventType: "EvidenceRemoved",
      milestoneKey: evidence.milestoneKey,
      scenario: "active",
    });
    return { ok: true };
  })
  .public();

export const demo_submitCompletionClaim = publicMutation
  .use(withMutationTiming("demo_drawflow.submitCompletionClaim"))
  .input({
    milestoneKey: v.string(),
    persona: v.string(),
    requestedAmountCents: v.number(),
  })
  .returns(v.any())
  .handler(async (ctx, args) => {
    const milestone = await findMilestone(ctx, "active", args.milestoneKey);
    if (!milestone) {
      throw new Error("Milestone not found");
    }
    if (args.persona !== "builder_lead") {
      throw new Error("Only Builder Lead can submit completion claims.");
    }
    const files = await activeEvidenceFiles(ctx, "active", milestone.key);
    if (milestone.status !== "complete_pending_submission") {
      await appendAudit(ctx, {
        actorPersona: args.persona,
        command: "demo_submitCompletionClaim",
        entityKey: milestone.key,
        entityLabel: milestone.name,
        entityType: "milestone",
        eventType: "CompletionClaimSubmitRejected",
        milestoneKey: milestone.key,
        scenario: "active",
        validation: "rejected",
      });
      throw new Error("Milestone must be marked complete before submission.");
    }
    if (
      args.requestedAmountCents < 0 ||
      args.requestedAmountCents > milestone.approvedValueCents
    ) {
      throw new Error("Requested amount must be within approved value.");
    }
    const packageId = await ensureDraftEvidencePackage(ctx, milestone);
    await ctx.db.patch(packageId, {
      frozenAt: Date.now(),
      reviewStatus: "pending",
      status: "submitted",
      submittedAt: Date.now(),
    });
    await ctx.db.patch(milestone._id, {
      evidenceReviewStatus: "pending",
      requestedAmountCents: args.requestedAmountCents,
      status: "submitted_for_review",
      submittedAt: Date.now(),
      updatedAt: Date.now(),
    });
    if (args.requestedAmountCents < milestone.approvedValueCents) {
      await ctx.db.insert("demo_rolloverBuffers", {
        buildId: milestone.buildId,
        createdAt: Date.now(),
        milestoneId: milestone._id,
        milestoneKey: milestone.key,
        originalApprovedCents: milestone.approvedValueCents,
        requestedAmountCents: args.requestedAmountCents,
        scenario: "active",
        status: "available",
        unusedAmountCents:
          milestone.approvedValueCents - args.requestedAmountCents,
      });
    }
    await appendAudit(ctx, {
      actorPersona: args.persona,
      afterSummary: `Requested ${args.requestedAmountCents} cents`,
      buildId: milestone.buildId,
      command: "demo_submitCompletionClaim",
      entityKey: milestone.key,
      entityLabel: milestone.name,
      entityType: "milestone",
      eventType: "CompletionClaimSubmitted",
      milestoneKey: milestone.key,
      scenario: "active",
    });
    await appendOutbox(ctx, {
      buildId: milestone.buildId,
      eventType: "demo.milestone.completionClaimSubmitted",
      milestoneKey: milestone.key,
      payloadPreview: `${milestone.name} submitted with ${files.length} evidence file(s).`,
      relatedEntity: milestone.name,
      scenario: "active",
    });
    await recalcDrawGroupDates(ctx, "active");
    return { ok: true };
  })
  .public();

export const demo_reviewEvidence = publicMutation
  .use(withMutationTiming("demo_drawflow.reviewEvidence"))
  .input({
    milestoneKey: v.string(),
    notes: v.optional(v.string()),
    outcome: v.union(v.literal("accepted"), v.literal("more_information")),
    persona: v.string(),
  })
  .returns(v.any())
  .handler(async (ctx, args) => {
    const milestone = await findMilestone(ctx, "active", args.milestoneKey);
    if (!milestone) {
      throw new Error("Milestone not found");
    }
    if (args.persona !== "lender_admin") {
      throw new Error("Only Lender Admin can review evidence.");
    }
    await ctx.db.insert("demo_reviewReports", {
      buildId: milestone.buildId,
      createdAt: Date.now(),
      milestoneId: milestone._id,
      milestoneKey: milestone.key,
      notes: args.notes ?? "",
      outcome: args.outcome,
      reviewerPersona: args.persona,
      scenario: "active",
    });
    await ctx.db.patch(milestone._id, {
      evidenceReviewStatus: args.outcome,
      status:
        args.outcome === "more_information"
          ? "more_information_requested"
          : milestone.status,
      updatedAt: Date.now(),
    });
    await appendAudit(ctx, {
      actorPersona: args.persona,
      buildId: milestone.buildId,
      command: "demo_reviewEvidence",
      entityKey: milestone.key,
      entityLabel: milestone.name,
      entityType: "milestone",
      eventType:
        args.outcome === "accepted"
          ? "EvidenceApproved"
          : "EvidenceMoreInformationRequested",
      milestoneKey: milestone.key,
      reason: args.notes,
      scenario: "active",
    });
    await appendOutbox(ctx, {
      buildId: milestone.buildId,
      eventType:
        args.outcome === "accepted"
          ? "demo.evidence.accepted"
          : "demo.evidence.moreInformationRequested",
      milestoneKey: milestone.key,
      payloadPreview:
        args.outcome === "accepted"
          ? `${milestone.name} evidence accepted.`
          : `${milestone.name} evidence needs more information.`,
      relatedEntity: milestone.name,
      scenario: "active",
    });
    return { ok: true };
  })
  .public();

export const demo_requestSiteVisit = publicMutation
  .use(withMutationTiming("demo_drawflow.requestSiteVisit"))
  .input({ milestoneKey: v.string(), persona: v.string(), reason: v.string() })
  .returns(v.any())
  .handler(async (ctx, args) => {
    const milestone = await findMilestone(ctx, "active", args.milestoneKey);
    if (!milestone) {
      throw new Error("Milestone not found");
    }
    if (args.persona !== "lender_admin") {
      throw new Error("Only Lender Admin can request site visits.");
    }
    const visitId = await ctx.db.insert("demo_siteVisits", {
      assignedPersona: "site_visitor",
      buildId: milestone.buildId,
      createdAt: Date.now(),
      milestoneId: milestone._id,
      milestoneKey: milestone.key,
      scenario: "active",
      status: "requested",
    });
    await ctx.db.patch(milestone._id, {
      status: "site_visit_requested",
      updatedAt: Date.now(),
    });
    await appendAudit(ctx, {
      actorPersona: args.persona,
      buildId: milestone.buildId,
      command: "demo_requestSiteVisit",
      entityKey: milestone.key,
      entityLabel: milestone.name,
      entityType: "milestone",
      eventType: "SiteVisitRequested",
      milestoneKey: milestone.key,
      reason: args.reason,
      scenario: "active",
    });
    await appendOutbox(ctx, {
      buildId: milestone.buildId,
      eventType: "demo.siteVisit.requested",
      milestoneKey: milestone.key,
      payloadPreview: `${milestone.name} site visit requested.`,
      relatedEntity: milestone.name,
      scenario: "active",
    });
    return { visitId };
  })
  .public();

export const demo_claimSiteVisit = publicMutation
  .use(withMutationTiming("demo_drawflow.claimSiteVisit"))
  .input({ milestoneKey: v.string(), persona: v.string() })
  .returns(v.any())
  .handler(async (ctx, args) => {
    const visit = await latestSiteVisit(ctx, "active", args.milestoneKey);
    if (!visit) {
      throw new Error("No site visit requested.");
    }
    if (args.persona !== "site_visitor") {
      throw new Error("Only Site Visitor can claim visits.");
    }
    await ctx.db.patch(visit._id, {
      claimedAt: Date.now(),
      status: "claimed",
    });
    await appendAudit(ctx, {
      actorPersona: args.persona,
      buildId: visit.buildId,
      command: "demo_claimSiteVisit",
      entityKey: visit.milestoneKey,
      entityType: "site_visit",
      eventType: "SiteVisitClaimed",
      milestoneKey: visit.milestoneKey,
      scenario: "active",
    });
    return { ok: true };
  })
  .public();

export const demo_submitSiteVisitReport = publicMutation
  .use(withMutationTiming("demo_drawflow.submitSiteVisitReport"))
  .input({
    completionObserved: v.boolean(),
    milestoneKey: v.string(),
    notes: v.string(),
    persona: v.string(),
    recommendedOutcome: v.string(),
  })
  .returns(v.any())
  .handler(async (ctx, args) => {
    const visit = await latestSiteVisit(ctx, "active", args.milestoneKey);
    const milestone = await findMilestone(ctx, "active", args.milestoneKey);
    if (!(visit && milestone)) {
      throw new Error("Site visit or milestone not found.");
    }
    if (args.persona !== "site_visitor") {
      throw new Error("Only Site Visitor can submit reports.");
    }
    await ctx.db.patch(visit._id, {
      completedAt: Date.now(),
      completionObserved: args.completionObserved,
      notes: args.notes,
      recommendedOutcome: args.recommendedOutcome,
      riskFlags: args.completionObserved ? [] : ["completion_not_observed"],
      status: "completed",
    });
    await ctx.db.patch(milestone._id, {
      status: "site_visit_complete",
      updatedAt: Date.now(),
    });
    await appendAudit(ctx, {
      actorPersona: args.persona,
      buildId: milestone.buildId,
      command: "demo_submitSiteVisitReport",
      entityKey: milestone.key,
      entityLabel: milestone.name,
      entityType: "site_visit",
      eventType: "SiteVisitReportSubmitted",
      milestoneKey: milestone.key,
      reason: args.notes,
      scenario: "active",
    });
    await appendOutbox(ctx, {
      buildId: milestone.buildId,
      eventType: "demo.siteVisit.reportSubmitted",
      milestoneKey: milestone.key,
      payloadPreview: `${milestone.name} site visit report submitted.`,
      relatedEntity: milestone.name,
      scenario: "active",
    });
    return { ok: true };
  })
  .public();

export const demo_approveMilestoneCompletion = publicMutation
  .use(withMutationTiming("demo_drawflow.approveMilestoneCompletion"))
  .input({
    milestoneKey: v.string(),
    overrideReason: v.optional(v.string()),
    persona: v.string(),
  })
  .returns(v.any())
  .handler(async (ctx, args) => {
    const milestone = await findMilestone(ctx, "active", args.milestoneKey);
    if (!milestone) {
      throw new Error("Milestone not found");
    }
    if (args.persona !== "lender_admin") {
      throw new Error("Only Lender Admin can approve completion.");
    }
    if (milestone.evidenceReviewStatus !== "accepted") {
      throw new Error("Evidence must be accepted before completion approval.");
    }
    const visit = await latestSiteVisit(ctx, "active", milestone.key);
    if (
      milestone.requiresSiteVisit &&
      visit?.status !== "completed" &&
      !args.overrideReason?.trim()
    ) {
      throw new Error(
        "Site visit must be complete or overridden with a reason."
      );
    }
    await ctx.db.patch(milestone._id, {
      approvedAt: Date.now(),
      approvedByPersona: args.persona,
      status: "completion_approved",
      updatedAt: Date.now(),
    });
    await appendAudit(ctx, {
      actorPersona: args.persona,
      buildId: milestone.buildId,
      command: "demo_approveMilestoneCompletion",
      entityKey: milestone.key,
      entityLabel: milestone.name,
      entityType: "milestone",
      eventType: "MilestoneCompletionApproved",
      milestoneKey: milestone.key,
      reason: args.overrideReason,
      scenario: "active",
    });
    await appendOutbox(ctx, {
      buildId: milestone.buildId,
      eventType: "demo.milestone.completionApproved",
      milestoneKey: milestone.key,
      payloadPreview: `${milestone.name} completion approved.`,
      relatedEntity: milestone.name,
      scenario: "active",
    });
    await recomputeActiveDrawGroupStatuses(ctx);
    return { ok: true };
  })
  .public();

export const demo_rejectMilestoneCompletion = publicMutation
  .use(withMutationTiming("demo_drawflow.rejectMilestoneCompletion"))
  .input({ milestoneKey: v.string(), persona: v.string(), reason: v.string() })
  .returns(v.any())
  .handler(async (ctx, args) => {
    if (!args.reason.trim()) {
      throw new Error("Rejection requires a reason.");
    }
    const milestone = await findMilestone(ctx, "active", args.milestoneKey);
    if (!milestone) {
      throw new Error("Milestone not found");
    }
    if (args.persona !== "lender_admin") {
      throw new Error("Only Lender Admin can reject completion.");
    }
    await ctx.db.patch(milestone._id, {
      status: "completion_rejected",
      updatedAt: Date.now(),
    });
    await appendAudit(ctx, {
      actorPersona: args.persona,
      buildId: milestone.buildId,
      command: "demo_rejectMilestoneCompletion",
      entityKey: milestone.key,
      entityLabel: milestone.name,
      entityType: "milestone",
      eventType: "MilestoneCompletionRejected",
      milestoneKey: milestone.key,
      reason: args.reason,
      scenario: "active",
    });
    await appendOutbox(ctx, {
      buildId: milestone.buildId,
      eventType: "demo.milestone.completionRejected",
      milestoneKey: milestone.key,
      payloadPreview: `${milestone.name} completion rejected.`,
      relatedEntity: milestone.name,
      scenario: "active",
    });
    return { ok: true };
  })
  .public();

export const demo_updateProposalMilestoneValue = publicMutation
  .use(withMutationTiming("demo_drawflow.updateProposalMilestoneValue"))
  .input({ milestoneKey: v.string(), valueCents: v.number() })
  .returns(v.any())
  .handler(async (ctx, args) => {
    const milestone = await findMilestone(ctx, "proposal", args.milestoneKey);
    if (!milestone) {
      throw new Error("Milestone not found");
    }
    await ctx.db.patch(milestone._id, {
      approvedValueCents: Math.max(0, Math.round(args.valueCents)),
      updatedAt: Date.now(),
    });
    await appendAudit(ctx, {
      actorPersona: "builder_lead",
      buildId: milestone.buildId,
      command: "demo_updateProposalMilestoneValue",
      entityKey: milestone.key,
      entityLabel: milestone.name,
      entityType: "milestone",
      eventType: "ProposalMilestoneValueChanged",
      milestoneKey: milestone.key,
      scenario: "proposal",
    });
    await recalcDrawGroupDates(ctx, "proposal");
    await recordJitPlanningRun(ctx, "demo_jitProposalCompilation");
    return { ok: true };
  })
  .public();

export const demo_updateProposalMilestoneDuration = publicMutation
  .use(withMutationTiming("demo_drawflow.updateProposalMilestoneDuration"))
  .input({ durationDays: v.number(), milestoneKey: v.string() })
  .returns(v.any())
  .handler(async (ctx, args) => {
    const milestone = await findMilestone(ctx, "proposal", args.milestoneKey);
    if (!milestone) {
      throw new Error("Milestone not found");
    }
    const durationDays = Math.max(1, Math.round(args.durationDays));
    const plannedEndDate = addDays(
      milestone.plannedStartDate,
      durationDays - 1
    );
    await ctx.db.patch(milestone._id, {
      durationDays,
      plannedEndDate,
      updatedAt: Date.now(),
    });
    await appendAudit(ctx, {
      actorPersona: "builder_lead",
      buildId: milestone.buildId,
      command: "demo_updateProposalMilestoneDuration",
      entityKey: milestone.key,
      entityLabel: milestone.name,
      entityType: "milestone",
      eventType: "ProposalMilestoneDurationChanged",
      milestoneKey: milestone.key,
      scenario: "proposal",
    });
    await recalcDrawGroupDates(ctx, "proposal");
    await recordJitPlanningRun(ctx, "demo_jitProposalCompilation");
    return { ok: true };
  })
  .public();

export const demo_updateProposalMilestonePlannedDates = publicMutation
  .use(withMutationTiming("demo_drawflow.updateProposalMilestonePlannedDates"))
  .input({
    milestoneKey: v.string(),
    plannedEndDate: v.string(),
    plannedStartDate: v.string(),
  })
  .returns(v.any())
  .handler(async (ctx, args) => {
    const milestone = await findMilestone(ctx, "proposal", args.milestoneKey);
    if (!milestone) {
      throw new Error("Milestone not found");
    }
    if (milestone.isDragLocked) {
      throw new Error(`${milestone.name} is locked and cannot be moved.`);
    }
    await ctx.db.patch(milestone._id, {
      durationDays: dateDiffDays(args.plannedStartDate, args.plannedEndDate),
      plannedEndDate: args.plannedEndDate,
      plannedStartDate: args.plannedStartDate,
      updatedAt: Date.now(),
    });
    await appendAudit(ctx, {
      actorPersona: "builder_lead",
      buildId: milestone.buildId,
      command: "demo_updateProposalMilestonePlannedDates",
      entityKey: milestone.key,
      entityLabel: milestone.name,
      entityType: "milestone",
      eventType: "ProposalMilestoneDatesMoved",
      milestoneKey: milestone.key,
      scenario: "proposal",
    });
    await recalcDrawGroupDates(ctx, "proposal");
    await recordJitPlanningRun(ctx, "demo_jitProposalCompilation");
    return { ok: true };
  })
  .public();

export const demo_moveProposalMilestoneToDrawGroup = publicMutation
  .use(withMutationTiming("demo_drawflow.moveProposalMilestoneToDrawGroup"))
  .input({ drawGroupKey: v.string(), milestoneKey: v.string() })
  .returns(v.any())
  .handler(async (ctx, args) => {
    const milestone = await findMilestone(ctx, "proposal", args.milestoneKey);
    if (!milestone) {
      throw new Error("Milestone not found.");
    }
    const groups = await getDrawGroups(ctx, "proposal");
    const group = groups.find(
      (candidate: any) => candidate.key === args.drawGroupKey
    );
    if (!group) {
      throw new Error("Draw group not found.");
    }
    await ctx.db.patch(milestone._id, {
      drawGroupKey: group.key,
      updatedAt: Date.now(),
    });
    await recalcDrawGroupDates(ctx, "proposal");
    await recordJitPlanningRun(ctx, "demo_jitProposalCompilation");
    await appendAudit(ctx, {
      actorPersona: "builder_lead",
      buildId: milestone.buildId,
      command: "demo_moveProposalMilestoneToDrawGroup",
      drawGroupKey: group.key,
      entityKey: milestone.key,
      entityLabel: milestone.name,
      entityType: "milestone",
      eventType: "ProposalMilestoneMovedToDrawGroup",
      milestoneKey: milestone.key,
      scenario: "proposal",
    });
    return { ok: true };
  })
  .public();

export const demo_reorderProposalMilestones = publicMutation
  .use(withMutationTiming("demo_drawflow.reorderProposalMilestones"))
  .input({
    direction: v.union(v.literal("up"), v.literal("down")),
    milestoneKey: v.string(),
  })
  .returns(v.any())
  .handler(async (ctx, args) => {
    const milestones = await getMilestones(ctx, "proposal");
    const index = milestones.findIndex(
      (milestone: any) => milestone.key === args.milestoneKey
    );
    const targetIndex = args.direction === "up" ? index - 1 : index + 1;
    if (index < 0 || targetIndex < 0 || targetIndex >= milestones.length) {
      return { ok: false };
    }
    const current = milestones[index];
    const target = milestones[targetIndex];
    await ctx.db.patch(current._id, {
      order: target.order,
      updatedAt: Date.now(),
    });
    await ctx.db.patch(target._id, {
      order: current.order,
      updatedAt: Date.now(),
    });
    await appendAudit(ctx, {
      actorPersona: "builder_lead",
      buildId: current.buildId,
      command: "demo_reorderProposalMilestones",
      entityKey: current.key,
      entityLabel: current.name,
      entityType: "milestone",
      eventType: "ProposalMilestonesReordered",
      milestoneKey: current.key,
      scenario: "proposal",
    });
    await recalcDrawGroupDates(ctx, "proposal");
    await recordJitPlanningRun(ctx, "demo_jitProposalCompilation");
    return { ok: true };
  })
  .public();

export const demo_addProposalMilestone = publicMutation
  .use(withMutationTiming("demo_drawflow.addProposalMilestone"))
  .input({
    drawGroupKey: v.optional(v.string()),
    durationDays: v.optional(v.number()),
    name: v.string(),
    plannedStartDate: v.optional(v.string()),
    valueCents: v.optional(v.number()),
  })
  .returns(v.any())
  .handler(async (ctx, args) => {
    const build = await getBuildOrThrow(ctx, "proposal");
    const milestones = await getMilestones(ctx, "proposal");
    const order = milestones.length + 1;
    const key = `custom_${order}`;
    const durationDays = Math.max(1, Math.round(args.durationDays ?? 7));
    const start = args.plannedStartDate ?? addDays("2026-08-01", order);
    const milestoneId = await ctx.db.insert("demo_milestones", {
      approvedValueCents: Math.max(0, Math.round(args.valueCents ?? 0)),
      buildId: build._id,
      code: `M-${String(order * 10).padStart(3, "0")}`,
      drawGroupKey: args.drawGroupKey ?? "d9",
      durationDays,
      evidenceReviewStatus: "not_started",
      key,
      name: args.name.trim() || "Custom Milestone",
      order,
      plannedEndDate: addDays(start, durationDays - 1),
      plannedStartDate: start,
      progressPercent: 0,
      requiresSiteVisit: false,
      scenario: "proposal",
      status: "draft",
      type: "custom",
      updatedAt: Date.now(),
    });
    await appendAudit(ctx, {
      actorPersona: "builder_lead",
      buildId: build._id,
      command: "demo_addProposalMilestone",
      entityKey: key,
      entityLabel: args.name,
      entityType: "milestone",
      eventType: "ProposalMilestoneAdded",
      milestoneKey: key,
      scenario: "proposal",
    });
    await recalcDrawGroupDates(ctx, "proposal");
    await recordJitPlanningRun(ctx, "demo_jitProposalCompilation");
    return { milestoneId, key };
  })
  .public();

export const demo_addProposalDependency = publicMutation
  .use(withMutationTiming("demo_drawflow.addProposalDependency"))
  .input({
    blockedKey: v.string(),
    blockerKey: v.string(),
    dependencyType: v.union(
      v.literal("hard_blocker"),
      v.literal("soft_dependency"),
      v.literal("procurement_dependency")
    ),
  })
  .returns(v.any())
  .handler(async (ctx, args) => {
    const build = await getBuildOrThrow(ctx, "proposal");
    if (args.blockedKey === args.blockerKey) {
      throw new Error("A milestone cannot depend on itself.");
    }
    const dependencies = await getDependencies(ctx, "proposal");
    if (createsCycle(dependencies, args.blockerKey, args.blockedKey)) {
      await appendAudit(ctx, {
        actorPersona: "builder_lead",
        command: "demo_addProposalDependency",
        entityKey: args.blockedKey,
        entityType: "dependency",
        eventType: "ProposalDependencyCycleRejected",
        milestoneKey: args.blockedKey,
        scenario: "proposal",
        validation: "rejected",
      });
      throw new Error("Dependency would create a cycle.");
    }
    const dependencyId = await ctx.db.insert("demo_milestoneDependencies", {
      blockedKey: args.blockedKey,
      blockerKey: args.blockerKey,
      buildId: build._id,
      isSystem: false,
      scenario: "proposal",
      severity:
        args.dependencyType === "soft_dependency" ? "warning" : "blocking",
      type: args.dependencyType,
    });
    await appendAudit(ctx, {
      actorPersona: "builder_lead",
      buildId: build._id,
      command: "demo_addProposalDependency",
      entityKey: args.blockedKey,
      entityType: "dependency",
      eventType: "ProposalDependencyAdded",
      milestoneKey: args.blockedKey,
      scenario: "proposal",
    });
    await recordJitPlanningRun(ctx, "demo_jitProposalCompilation");
    return { dependencyId };
  })
  .public();

export const demo_removeProposalDependency = publicMutation
  .use(withMutationTiming("demo_drawflow.removeProposalDependency"))
  .input({ blockedKey: v.string(), blockerKey: v.string() })
  .returns(v.any())
  .handler(async (ctx, args) => {
    const dependencies = await getDependencies(ctx, "proposal");
    const dependency = dependencies.find(
      (edge: any) =>
        edge.blockedKey === args.blockedKey &&
        edge.blockerKey === args.blockerKey
    );
    if (!dependency) {
      return { ok: false };
    }
    if (dependency.isSystem) {
      await appendAudit(ctx, {
        actorPersona: "builder_lead",
        command: "demo_removeProposalDependency",
        entityKey: args.blockedKey,
        entityType: "dependency",
        eventType: "ProposalSystemDependencyRemoveBlocked",
        milestoneKey: args.blockedKey,
        scenario: "proposal",
        validation: "rejected",
      });
      throw new Error("System hard dependencies cannot be removed.");
    }
    await ctx.db.delete(dependency._id);
    await appendAudit(ctx, {
      actorPersona: "builder_lead",
      command: "demo_removeProposalDependency",
      entityKey: args.blockedKey,
      entityType: "dependency",
      eventType: "ProposalDependencyRemoved",
      milestoneKey: args.blockedKey,
      scenario: "proposal",
    });
    await recordJitPlanningRun(ctx, "demo_jitProposalCompilation");
    return { ok: true };
  })
  .public();

export const demo_recomputeProposalPlan = publicMutation
  .use(withMutationTiming("demo_drawflow.recomputeProposalPlan"))
  .input({ runType: v.union(v.literal("jit"), v.literal("explicit")) })
  .returns(v.any())
  .handler(async (ctx, args) => {
    const build = await getBuildOrThrow(ctx, "proposal");
    const milestones = await getMilestones(ctx, "proposal");
    const drawGroups = await getDrawGroups(ctx, "proposal");
    const dependencies = await getDependencies(ctx, "proposal");
    const validation = validateProposal(
      milestones,
      drawGroups,
      dependencies,
      build.workingCapitalLimitCents
    );
    const runId = await ctx.db.insert("demo_planningRuns", {
      buildId: build._id,
      createdAt: Date.now(),
      errors: validation.errors,
      interestEstimateCents: drawGroups.length * FLAT_DRAW_FEE_CENTS,
      recommendedDrawCount: 9,
      recommendedOrderKeys: RECOMMENDED_ORDER,
      runType: args.runType,
      scenario: "proposal",
      status: validation.errors.length > 0 ? "blocked" : "feasible",
      warnings: validation.warnings,
    });
    await appendAudit(ctx, {
      actorPersona: "builder_lead",
      buildId: build._id,
      command: "demo_recomputeProposalPlan",
      entityType: "planning_run",
      eventType: "ProposalPlanAnalyzed",
      scenario: "proposal",
    });
    return { runId };
  })
  .public();

export const demo_applyProposalPlanRecommendation = publicMutation
  .use(withMutationTiming("demo_drawflow.applyProposalPlanRecommendation"))
  .input({})
  .returns(v.any())
  .handler(async (ctx) => {
    const build = await getBuildOrThrow(ctx, "proposal");
    const milestones = await getMilestones(ctx, "proposal");
    const orderedMilestones = [...milestones].sort(
      (a: any, b: any) =>
        RECOMMENDED_ORDER.indexOf(a.key) - RECOMMENDED_ORDER.indexOf(b.key)
    );
    const recommendedGroupByKey = new Map<string, string>();
    let currentGroupNumber = 1;
    let currentGroupTotal = 0;
    for (const milestone of orderedMilestones) {
      if (
        currentGroupTotal > 0 &&
        currentGroupTotal + milestone.approvedValueCents > WORKING_CAPITAL_CENTS
      ) {
        currentGroupNumber += 1;
        currentGroupTotal = 0;
      }
      recommendedGroupByKey.set(milestone.key, `d${currentGroupNumber}`);
      currentGroupTotal += milestone.approvedValueCents;
    }
    for (const milestone of milestones) {
      const newOrder = RECOMMENDED_ORDER.indexOf(milestone.key) + 1;
      if (newOrder > 0) {
        const start = addDays("2026-01-05", Math.floor((newOrder - 1) * 30));
        await ctx.db.patch(milestone._id, {
          drawGroupKey:
            recommendedGroupByKey.get(milestone.key) ?? milestone.drawGroupKey,
          order: newOrder,
          plannedEndDate: addDays(start, milestone.durationDays - 1),
          plannedStartDate: start,
          updatedAt: Date.now(),
        });
      }
    }
    await recalcDrawGroupDates(ctx, "proposal");
    await recordJitPlanningRun(ctx, "demo_jitProposalCompilation");
    await appendAudit(ctx, {
      actorPersona: "builder_lead",
      buildId: build._id,
      command: "demo_applyProposalPlanRecommendation",
      entityType: "planning_run",
      eventType: "ProposalRecommendationApplied",
      scenario: "proposal",
    });
    return { ok: true };
  })
  .public();

export const demo_splitProposalDrawGroup = publicMutation
  .use(withMutationTiming("demo_drawflow.splitProposalDrawGroup"))
  .input({
    afterMilestoneKey: v.optional(v.string()),
    drawGroupKey: v.string(),
  })
  .returns(v.any())
  .handler(async (ctx, args) => {
    const build = await getBuildOrThrow(ctx, "proposal");
    const groups = await getDrawGroups(ctx, "proposal");
    const group = groups.find(
      (candidate: any) => candidate.key === args.drawGroupKey
    );
    if (!group) {
      throw new Error("Draw group not found.");
    }
    const milestones = await getMilestones(ctx, "proposal");
    const groupMilestones = milestones.filter(
      (milestone: any) => milestone.drawGroupKey === group.key
    );
    const splitIndex = args.afterMilestoneKey
      ? groupMilestones.findIndex(
          (milestone: any) => milestone.key === args.afterMilestoneKey
        )
      : Math.floor(groupMilestones.length / 2) - 1;
    if (splitIndex < 0 || splitIndex >= groupMilestones.length - 1) {
      return {
        ok: false,
        reason: "Choose a milestone before the end of a draw group to split.",
      };
    }
    const nextNumber = groups.length + 1;
    const newKey = `d${nextNumber}`;
    await ctx.db.insert("demo_drawGroups", {
      approvedValueCents: 0,
      buildId: build._id,
      key: newKey,
      label: `Draw ${nextNumber}`,
      order: nextNumber,
      plannedEndDate: group.plannedEndDate,
      plannedStartDate: group.plannedEndDate,
      requestedValueCents: 0,
      scenario: "proposal",
      status: "planned",
      updatedAt: Date.now(),
    });
    for (const milestone of groupMilestones.slice(splitIndex + 1)) {
      await ctx.db.patch(milestone._id, {
        drawGroupKey: newKey,
        updatedAt: Date.now(),
      });
    }
    await recalcDrawGroupDates(ctx, "proposal");
    await recordJitPlanningRun(ctx, "demo_jitProposalCompilation");
    await appendAudit(ctx, {
      actorPersona: "builder_lead",
      buildId: build._id,
      command: "demo_splitProposalDrawGroup",
      drawGroupKey: group.key,
      entityKey: group.key,
      entityLabel: group.label,
      entityType: "draw_group",
      eventType: "ProposalDrawGroupSplit",
      scenario: "proposal",
    });
    return { ok: true };
  })
  .public();

export const demo_mergeProposalDrawGroups = publicMutation
  .use(withMutationTiming("demo_drawflow.mergeProposalDrawGroups"))
  .input({ drawGroupKey: v.string() })
  .returns(v.any())
  .handler(async (ctx, args) => {
    const groups = await getDrawGroups(ctx, "proposal");
    const group = groups.find(
      (candidate: any) => candidate.key === args.drawGroupKey
    );
    if (!group || group.order === 1) {
      return { ok: false };
    }
    const previous = groups.find(
      (candidate: any) => candidate.order === group.order - 1
    );
    const milestones = await getMilestones(ctx, "proposal");
    for (const milestone of milestones.filter(
      (candidate: any) => candidate.drawGroupKey === group.key
    )) {
      await ctx.db.patch(milestone._id, {
        drawGroupKey: previous.key,
        updatedAt: Date.now(),
      });
    }
    await ctx.db.delete(group._id);
    const remainingGroups = groups
      .filter((candidate: any) => candidate._id !== group._id)
      .sort((a: any, b: any) => a.order - b.order);
    for (const [index, remainingGroup] of remainingGroups.entries()) {
      const order = index + 1;
      await ctx.db.patch(remainingGroup._id, {
        label: `Draw ${order}`,
        order,
        updatedAt: Date.now(),
      });
    }
    await recalcDrawGroupDates(ctx, "proposal");
    await appendAudit(ctx, {
      actorPersona: "builder_lead",
      command: "demo_mergeProposalDrawGroups",
      drawGroupKey: previous.key,
      entityKey: previous.key,
      entityLabel: previous.label,
      entityType: "draw_group",
      eventType: "ProposalDrawGroupsMerged",
      scenario: "proposal",
    });
    await recordJitPlanningRun(ctx, "demo_jitProposalCompilation");
    return { ok: true };
  })
  .public();

export const demo_reorderProposalMilestoneAbsolute = publicMutation
  .use(withMutationTiming("demo_drawflow.reorderProposalMilestoneAbsolute"))
  .input({
    fromIndex: v.number(),
    milestoneKey: v.string(),
    toIndex: v.number(),
  })
  .returns(v.any())
  .handler(async (ctx, args) => {
    const milestones = await getMilestones(ctx, "proposal");
    const fromIndex = milestones.findIndex(
      (milestone: any) => milestone.key === args.milestoneKey
    );
    if (fromIndex < 0) {
      return { ok: false };
    }
    const boundedToIndex = Math.max(
      0,
      Math.min(milestones.length - 1, Math.round(args.toIndex))
    );
    const reordered = [...milestones];
    const [moved] = reordered.splice(fromIndex, 1);
    reordered.splice(boundedToIndex, 0, moved);
    for (const [index, milestone] of reordered.entries()) {
      await ctx.db.patch(milestone._id, {
        order: index + 1,
        updatedAt: Date.now(),
      });
    }
    await recalcDrawGroupDates(ctx, "proposal");
    await appendAudit(ctx, {
      actorPersona: "builder_lead",
      buildId: moved.buildId,
      command: "demo_reorderProposalMilestoneAbsolute",
      entityKey: moved.key,
      entityLabel: moved.name,
      entityType: "milestone",
      eventType: "ProposalMilestonesReorderedByDrag",
      milestoneKey: moved.key,
      reason: `Moved from ${args.fromIndex + 1} to ${boundedToIndex + 1}.`,
      scenario: "proposal",
    });
    await recordJitPlanningRun(ctx, "demo_jitProposalCompilation");
    return { ok: true };
  })
  .public();

export const demo_dismissWorkspaceIssue = publicMutation
  .use(withMutationTiming("demo_drawflow.dismissWorkspaceIssue"))
  .input({
    actorPersona: v.string(),
    conditionHash: v.string(),
    drawGroupKey: v.optional(v.string()),
    issueCode: v.string(),
    issueId: v.string(),
    milestoneKey: v.optional(v.string()),
    reason: v.optional(v.string()),
    scenario: v.union(v.literal("active"), v.literal("proposal")),
  })
  .returns(v.any())
  .handler(async (ctx, args) => {
    const existing = await ctx.db
      .query("demo_warningDismissals")
      .withIndex("by_warning", (q: any) =>
        q
          .eq("scenario", args.scenario)
          .eq("warningId", args.issueId)
          .eq("conditionHash", args.conditionHash)
      )
      .first();
    if (existing) {
      return { ok: true };
    }
    await ctx.db.insert("demo_warningDismissals", {
      actorPersona: args.actorPersona,
      conditionHash: args.conditionHash,
      dismissedAt: Date.now(),
      drawGroupKey: args.drawGroupKey,
      milestoneKey: args.milestoneKey,
      reason: args.reason,
      scenario: args.scenario,
      warningCode: args.issueCode,
      warningId: args.issueId,
    });
    await appendAudit(ctx, {
      actorPersona: args.actorPersona,
      command: "demo_dismissWorkspaceIssue",
      drawGroupKey: args.drawGroupKey,
      entityKey: args.issueId,
      entityType: "workspace_issue",
      eventType: "WorkspaceIssueDismissed",
      milestoneKey: args.milestoneKey,
      reason: args.reason ?? args.issueCode,
      scenario: args.scenario,
    });
    return { ok: true };
  })
  .public();

export const demo_applyWorkspaceIssueQuickFix = publicMutation
  .use(withMutationTiming("demo_drawflow.applyWorkspaceIssueQuickFix"))
  .input({
    action: v.string(),
    issueId: v.string(),
    targetId: v.optional(v.string()),
  })
  .returns(v.any())
  .handler(async (ctx, args) => {
    if (args.action === "applyRecommendedPlan") {
      const build = await getBuildOrThrow(ctx, "proposal");
      const milestones = await getMilestones(ctx, "proposal");
      const orderedMilestones = [...milestones].sort(
        (a: any, b: any) =>
          RECOMMENDED_ORDER.indexOf(a.key) - RECOMMENDED_ORDER.indexOf(b.key)
      );
      for (const [index, milestone] of orderedMilestones.entries()) {
        const start = addDays("2026-01-05", index * 30);
        await ctx.db.patch(milestone._id, {
          order: index + 1,
          plannedEndDate: addDays(start, milestone.durationDays - 1),
          plannedStartDate: start,
          updatedAt: Date.now(),
        });
      }
      await recalcDrawGroupDates(ctx, "proposal");
      await appendAudit(ctx, {
        actorPersona: "builder_lead",
        buildId: build._id,
        command: "demo_applyWorkspaceIssueQuickFix",
        entityKey: args.issueId,
        entityType: "workspace_issue",
        eventType: "WorkspaceIssueQuickFixApplied",
        reason: "Applied recommended capital-constrained plan.",
        scenario: "proposal",
      });
      await recordJitPlanningRun(ctx, "demo_jitProposalCompilation");
      return { ok: true };
    }

    if (args.action === "splitDrawGroup" && args.targetId) {
      const build = await getBuildOrThrow(ctx, "proposal");
      const groups = await getDrawGroups(ctx, "proposal");
      const group = groups.find(
        (candidate: any) => candidate.key === args.targetId
      );
      const milestones = await getMilestones(ctx, "proposal");
      const groupMilestones = milestones.filter(
        (milestone: any) => milestone.drawGroupKey === args.targetId
      );
      if (group && groupMilestones.length > 1) {
        const splitIndex = Math.floor(groupMilestones.length / 2) - 1;
        const nextNumber = groups.length + 1;
        const newKey = `d${nextNumber}`;
        await ctx.db.insert("demo_drawGroups", {
          approvedValueCents: 0,
          buildId: build._id,
          key: newKey,
          label: `Draw ${nextNumber}`,
          order: nextNumber,
          plannedEndDate: group.plannedEndDate,
          plannedStartDate: group.plannedEndDate,
          requestedValueCents: 0,
          scenario: "proposal",
          status: "planned",
          updatedAt: Date.now(),
        });
        for (const milestone of groupMilestones.slice(splitIndex + 1)) {
          await ctx.db.patch(milestone._id, {
            drawGroupKey: newKey,
            updatedAt: Date.now(),
          });
        }
        await recalcDrawGroupDates(ctx, "proposal");
        await appendAudit(ctx, {
          actorPersona: "builder_lead",
          buildId: build._id,
          command: "demo_applyWorkspaceIssueQuickFix",
          drawGroupKey: group.key,
          entityKey: args.issueId,
          entityLabel: group.label,
          entityType: "workspace_issue",
          eventType: "WorkspaceIssueQuickFixApplied",
          reason: "Split draw group to reduce working-capital exposure.",
          scenario: "proposal",
        });
        await recordJitPlanningRun(ctx, "demo_jitProposalCompilation");
        return { ok: true };
      }
    }

    if (args.action === "shiftDependentMilestone" && args.targetId) {
      const dependencies = await getDependencies(ctx, "proposal");
      const dependency = dependencies.find(
        (edge: any) => edge._id === args.targetId
      );
      if (!dependency) {
        throw new Error("Dependency not found.");
      }
      const blocker = await findMilestone(
        ctx,
        "proposal",
        dependency.blockerKey
      );
      const blocked = await findMilestone(
        ctx,
        "proposal",
        dependency.blockedKey
      );
      if (!(blocker && blocked)) {
        throw new Error("Dependency milestones not found.");
      }
      const start = addDays(blocker.plannedEndDate, 1);
      await ctx.db.patch(blocked._id, {
        plannedEndDate: addDays(start, blocked.durationDays - 1),
        plannedStartDate: start,
        updatedAt: Date.now(),
      });
      await recalcDrawGroupDates(ctx, "proposal");
      await appendAudit(ctx, {
        actorPersona: "builder_lead",
        command: "demo_applyWorkspaceIssueQuickFix",
        entityKey: args.issueId,
        entityType: "workspace_issue",
        eventType: "WorkspaceIssueQuickFixApplied",
        milestoneKey: blocked.key,
        reason: `Shifted ${blocked.name} after ${blocker.name}.`,
        scenario: "proposal",
      });
      await recordJitPlanningRun(ctx, "demo_jitProposalCompilation");
      return { ok: true };
    }

    if (args.action === "shiftNextDrawGroup" && args.targetId) {
      const groups = await getDrawGroups(ctx, "proposal");
      const current = groups.find((group: any) => group.key === args.targetId);
      const next = groups.find(
        (group: any) => group.order === current?.order + 1
      );
      if (!(current && next)) {
        throw new Error("Draw group sequence not found.");
      }
      const milestones = await getMilestones(ctx, "proposal");
      const currentMilestones = milestones.filter(
        (milestone: any) => milestone.drawGroupKey === current.key
      );
      const nextMilestones = milestones.filter(
        (milestone: any) => milestone.drawGroupKey === next.key
      );
      const currentEnd = latestDate(
        currentMilestones.map((milestone: any) => milestone.plannedEndDate)
      );
      const nextStart = earliestDate(
        nextMilestones.map((milestone: any) => milestone.plannedStartDate)
      );
      const deltaDays = dateDiffDays(nextStart, currentEnd);
      for (const milestone of nextMilestones) {
        await ctx.db.patch(milestone._id, {
          plannedEndDate: addDays(milestone.plannedEndDate, deltaDays),
          plannedStartDate: addDays(milestone.plannedStartDate, deltaDays),
          updatedAt: Date.now(),
        });
      }
      await recalcDrawGroupDates(ctx, "proposal");
      await appendAudit(ctx, {
        actorPersona: "builder_lead",
        command: "demo_applyWorkspaceIssueQuickFix",
        drawGroupKey: next.key,
        entityKey: args.issueId,
        entityType: "workspace_issue",
        eventType: "WorkspaceIssueQuickFixApplied",
        reason: `Shifted ${next.label} after ${current.label}.`,
        scenario: "proposal",
      });
      await recordJitPlanningRun(ctx, "demo_jitProposalCompilation");
      return { ok: true };
    }

    throw new Error(
      "This issue opens the relevant editor instead of applying an automatic fix."
    );
  })
  .public();

export const demo_submitProposal = publicMutation
  .use(withMutationTiming("demo_drawflow.submitProposal"))
  .input({})
  .returns(v.any())
  .handler(async (ctx) => {
    const build = await getBuildOrThrow(ctx, "proposal");
    const milestones = await getMilestones(ctx, "proposal");
    const drawGroups = await getDrawGroups(ctx, "proposal");
    const dependencies = await getDependencies(ctx, "proposal");
    const validation = validateProposal(
      milestones,
      drawGroups,
      dependencies,
      build.workingCapitalLimitCents
    );
    if (validation.errors.length > 0) {
      await appendAudit(ctx, {
        actorPersona: "builder_lead",
        buildId: build._id,
        command: "demo_submitProposal",
        entityType: "proposal",
        eventType: "ProposalSubmitRejected",
        reason: validation.errors[0],
        scenario: "proposal",
        validation: "rejected",
      });
      throw new Error(validation.errors[0]);
    }
    await ctx.db.patch(build._id, {
      status: "submitted",
      submittedAt: Date.now(),
      updatedAt: Date.now(),
    });
    await appendAudit(ctx, {
      actorPersona: "builder_lead",
      buildId: build._id,
      command: "demo_submitProposal",
      entityType: "proposal",
      eventType: "ProposalSubmitted",
      scenario: "proposal",
    });
    await appendOutbox(ctx, {
      buildId: build._id,
      eventType: "demo.proposal.submitted",
      payloadPreview: "Proposal submitted for lender review.",
      relatedEntity: "Maple Ridge Townhomes proposal",
      scenario: "proposal",
    });
    return { ok: true };
  })
  .public();

function createsCycle(
  dependencies: any[],
  blockerKey: string,
  blockedKey: string
) {
  const edges = [...dependencies, { blockedKey, blockerKey }];
  const visit = (
    current: string,
    target: string,
    seen: Set<string>
  ): boolean => {
    if (current === target) {
      return true;
    }
    if (seen.has(current)) {
      return false;
    }
    seen.add(current);
    return edges
      .filter((edge) => edge.blockerKey === current)
      .some((edge) => visit(edge.blockedKey, target, seen));
  };
  return visit(blockedKey, blockerKey, new Set<string>());
}
