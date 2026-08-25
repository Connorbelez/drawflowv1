import { v } from "convex/values";
import type { DatabaseReader, DatabaseWriter, Doc, Id } from "../types";

export const siteVisitLocationAttemptValidator = v.object({
  accuracyMeters: v.optional(v.number()),
  attempted: v.boolean(),
  attemptedAt: v.optional(v.number()),
  distanceMeters: v.optional(v.number()),
  failureReason: v.optional(v.string()),
  geofenceRadiusMeters: v.optional(v.number()),
  latitude: v.optional(v.number()),
  longitude: v.optional(v.number()),
  permissionOutcome: v.union(
    v.literal("denied"),
    v.literal("granted"),
    v.literal("not_requested"),
    v.literal("unavailable")
  ),
  verified: v.boolean(),
});

export const siteVisitPrerequisiteExceptionValidator = v.object({
  acknowledged: v.boolean(),
  reason: v.string(),
});

export const DEMO_TODAY = "2026-05-08";
export const DEMO_NOW = Date.parse("2026-05-08T16:00:00.000Z");
export const DAY_MS = 86_400_000;
export const WORKING_CAPITAL_CENTS = 26_000_000;
export const FLAT_DRAW_FEE_CENTS = 50_000;
export const INTEREST_ANNUAL_BPS = 1200;
export const SEED_VERSION = 7;

export const DEMO_TABLES = [
  "demo_warningDismissals",
  "demo_eventOutbox",
  "demo_auditEvents",
  "demo_forecastUpdates",
  "demo_rolloverBuffers",
  "demo_reviewReports",
  "demo_siteVisitFiles",
  "demo_siteVisitTargetGuidanceItems",
  "demo_siteVisitTargets",
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

export type Scenario = "active" | "proposal";
export type DependencyType =
  | "hard_blocker"
  | "procurement_dependency"
  | "soft_dependency";

export interface SeedMilestone {
  key: string;
  name: string;
  type: string;
  valueCents: number;
}
export type ActiveSeedMilestone = SeedMilestone & {
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

export interface ProposalGroup {
  key: string;
  milestoneKeys: string[];
}

export interface DemoReadCtx {
  db: DatabaseReader;
}

export interface DemoMutationCtx {
  db: DatabaseWriter;
}

export type DemoBuildId = Id<"demo_builds">;
export type DemoMilestone = Doc<"demo_milestones">;
export type DemoDrawGroup = Doc<"demo_drawGroups">;
export type DemoDependency = Doc<"demo_milestoneDependencies">;
export type DemoEvidenceFile = Doc<"demo_evidenceFiles">;
export type DemoEvidencePackage = Doc<"demo_evidencePackages">;
export type DemoSiteVisit = Doc<"demo_siteVisits">;
export type DemoSiteVisitFile = Doc<"demo_siteVisitFiles">;
export type DemoSiteVisitTarget = Doc<"demo_siteVisitTargets">;
export type DemoReviewReport = Doc<"demo_reviewReports">;
export type DemoPlanningRun = Doc<"demo_planningRuns">;

export type DecoratedSiteVisit = DemoSiteVisit & {
  files: DemoSiteVisitFile[];
  targetMilestoneKeys: string[];
  targets: DemoSiteVisitTarget[];
};

export type DecoratedMilestone = DemoMilestone & {
  blockedByKeys: string[];
  blockingKeys: string[];
  blockingReasons: string[];
  displayStatus: string;
  evidenceCount: number;
  evidenceFiles: {
    fileName: string;
    id: DemoEvidenceFile["_id"];
    isSample: boolean;
    mimeType: string;
    sizeBytes: number;
    uploadedAt: number;
    uploadedByPersona: string;
  }[];
  evidencePackages: DemoEvidencePackage[];
  issues: WorkspaceIssue[];
  latestEvidencePackage?: DemoEvidencePackage;
  latestReview?: DemoReviewReport;
  latestSiteVisit?: DecoratedSiteVisit;
  reviewReports: DemoReviewReport[];
  siteVisits: DecoratedSiteVisit[];
};

export type ProjectedDrawGroup = DemoDrawGroup & {
  approvedValueCents: number;
  eligibleDate: string;
  endDate: string;
  firstRow: number;
  issues: WorkspaceIssue[];
  lastRow: number;
  requestedValueCents: number;
  startDate: string;
};

export type WorkspaceIssueSeverity = "blocking" | "warning" | "info";
export type WorkspaceIssueScope =
  | "workspace"
  | "drawGroup"
  | "milestone"
  | "dependency";

export interface WorkspaceIssueQuickFix {
  action: string;
  label: string;
  targetId?: string;
}

export interface WorkspaceIssue {
  code: string;
  conditionHash: string;
  dependencyIds: string[];
  dismissed: boolean;
  dismissible: boolean;
  drawGroupIds: string[];
  id: string;
  impact: string;
  message: string;
  milestoneIds: string[];
  quickFix?: WorkspaceIssueQuickFix;
  scope: WorkspaceIssueScope;
  severity: WorkspaceIssueSeverity;
  title: string;
}

export interface AuditInput {
  actorPersona?: string;
  afterSummary?: string;
  beforeSummary?: string;
  buildId?: DemoBuildId;
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
}

export const MILESTONE_CATALOG: SeedMilestone[] = [
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

export const HARD_DEPENDENCIES: [string, string, DependencyType][] = [
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

export const PROPOSAL_GROUPS: ProposalGroup[] = [
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

export const RECOMMENDED_ORDER = [
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

export const ACTIVE_MILESTONES: ActiveSeedMilestone[] = [
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

export function catalog(key: string) {
  const row = MILESTONE_CATALOG.find((milestone) => milestone.key === key);
  if (!row) {
    throw new Error(`Unknown DrawFlow seed milestone: ${key}`);
  }
  return row;
}

export function addDays(date: string, days: number) {
  return new Date(Date.parse(`${date}T00:00:00.000Z`) + days * DAY_MS)
    .toISOString()
    .slice(0, 10);
}

export function dateDiffDays(startDate: string, endDate: string) {
  return Math.max(
    1,
    Math.round(
      (Date.parse(`${endDate}T00:00:00.000Z`) -
        Date.parse(`${startDate}T00:00:00.000Z`)) /
        DAY_MS
    ) + 1
  );
}

export function groupAmount(milestones: { approvedValueCents: number }[]) {
  return milestones.reduce(
    (total, milestone) => total + milestone.approvedValueCents,
    0
  );
}

export function normalizedDates(dates: (string | undefined)[]) {
  const values = dates.filter((date): date is string => Boolean(date));
  return values.length > 0 ? values : [DEMO_TODAY];
}

export function latestDate(dates: (string | undefined)[]) {
  return normalizedDates(dates).reduce((latest, date) =>
    date > latest ? date : latest
  );
}

export function earliestDate(dates: (string | undefined)[]) {
  return normalizedDates(dates).reduce((earliest, date) =>
    date < earliest ? date : earliest
  );
}

export function dateValue(date: string | undefined) {
  return date ?? DEMO_TODAY;
}

export function issueHash(parts: (number | string | undefined)[]) {
  return parts.map((part) => String(part ?? "none")).join("|");
}
