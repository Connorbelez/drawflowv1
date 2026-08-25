"use client";
import type { TimelineItem } from "#/components/roadmap/AnimatedCurvedTimeline.tsx";
import {
  formatCurrency,
  parseCurrencyToCents,
} from "#/features/builder-proposal-demo/template-helpers.ts";
import type {
  TimelineMilestoneWorksheetContractorAssignment,
  TimelineMilestoneWorksheetContractorOption,
  TimelineMilestoneWorksheetCostItem,
} from "./-TimelineMilestoneWorksheetTable.tsx";
import type { TimelineSubmilestoneFieldGuidance } from "./-timeline-milestone-submilestones.ts";
import type {
  DemoMilestone,
  IsometricIconKey,
} from "./-timeline-share-snapshot.ts";
import { TOTAL_REIMBURSEMENT_BPS } from "./-timeline-share-snapshot.ts";
import "./-timeline-setup-flow.css";

export const DEFAULT_SETUP_BUDGET_TEXT = "$1,250,000";
export const DEFAULT_SETUP_CASH_TEXT = "$400,000";
export const DEFAULT_SETUP_LOAN_PERCENTAGE_TEXT = "80%";
export const DEFAULT_SETUP_ADDRESS = "Hamilton, ON";

export function resolveTimelineSetupAddress(value: string): string {
  const trimmed = value.trim();
  return trimmed || DEFAULT_SETUP_ADDRESS;
}
export const GENERATED_TIMELINE_CURRENT_DAY = 0;
export const DEFAULT_HANDOFF_GAP_DAYS = 5;
export const DEFAULT_GENERATED_DRAW_OFFSET_DAYS = 2;
export const DEFAULT_NEW_MILESTONE_BUDGET_TEXT = "$0";
export const DEFAULT_NEW_MILESTONE_DURATION_TEXT = "7";
export const DEFAULT_NEW_SUB_MILESTONE_BUDGET_TEXT = "$0";
export const DEFAULT_NEW_SUB_MILESTONE_DURATION_TEXT = "1";
export const DURATION_PREFIX_REGEX = /^T/i;
export const STRIP_LEADING_DOLLAR = /^\$/;
export const TRAILING_ZERO_DECIMAL_REGEX = /\.?0+$/;
export const ASSISTANT_SETUP_CLIENT_ACTION_KEYS = [
  "select_proposal_template",
  "set_proposal_setup_field",
  "set_proposal_setup_address",
  "set_proposal_setup_permit_status",
  "advance_proposal_setup_step",
  "set_setup_milestone_included",
  "create_setup_milestone",
  "reorder_setup_milestones",
  "update_setup_milestone",
  "update_setup_milestone_schedule_budget",
  "set_setup_budget_cascade_mode",
  "create_setup_submilestone",
  "update_setup_submilestone",
  "move_setup_submilestone",
  "delete_setup_submilestone",
  "update_setup_field_guidance",
  "import_proposal_budget_workbook",
  "create_setup_contractor_assignment",
  "delete_setup_contractor_assignment",
  "create_setup_cost_item",
  "update_setup_cost_item",
  "delete_setup_cost_item",
] as const;
export const subMilestoneDescriptions = [
  "Basis, scope, and quantities",
  "Field completion target",
  "Evidence package requirement",
  "Lender review checkpoint",
];

export interface SubMilestoneBankItem {
  budgetText?: string;
  category: string;
  description: string;
  durationText: string;
  name: string;
}

export const SUB_MILESTONE_BANK: SubMilestoneBankItem[] = [
  {
    category: "Preconstruction",
    description:
      "Finalize city permit conditions, drawings, and release notices",
    durationText: "3",
    name: "Building permit release",
  },
  {
    category: "Preconstruction",
    description: "Stake limits, benchmark elevations, and construction layout",
    durationText: "2",
    name: "Survey staking",
  },
  {
    category: "Preconstruction",
    description:
      "Temporary fencing, signage, safety controls, and access setup",
    durationText: "2",
    name: "Site mobilization",
  },
  {
    category: "Preconstruction",
    description: "Temporary power pole, water source, and site service setup",
    durationText: "3",
    name: "Temporary utilities",
  },
  {
    category: "Sitework",
    description: "Tree protection, selective clearing, and haul-off",
    durationText: "3",
    name: "Clearing and grubbing",
  },
  {
    category: "Sitework",
    description:
      "Strip topsoil, rough grade pad, and stockpile usable material",
    durationText: "3",
    name: "Topsoil stripping",
  },
  {
    category: "Sitework",
    description: "Excavate foundation, service trenches, and spoils removal",
    durationText: "5",
    name: "Excavation",
  },
  {
    category: "Sitework",
    description:
      "Place and compact structural fill for slab and foundation bearing",
    durationText: "3",
    name: "Structural backfill",
  },
  {
    category: "Sitework",
    description: "Install silt fence, inlet protection, and sediment controls",
    durationText: "2",
    name: "Erosion control",
  },
  {
    category: "Foundation",
    description: "Form and inspect footing layout before concrete placement",
    durationText: "3",
    name: "Footing forms",
  },
  {
    category: "Foundation",
    description: "Place footing reinforcing steel, dowels, and embeds",
    durationText: "2",
    name: "Footing rebar",
  },
  {
    category: "Foundation",
    description: "Place and finish concrete footings with test records",
    durationText: "1",
    name: "Footing pour",
  },
  {
    category: "Foundation",
    description: "Form foundation walls, anchor bolts, sleeves, and openings",
    durationText: "4",
    name: "Foundation wall forms",
  },
  {
    category: "Foundation",
    description: "Place foundation wall concrete and strip forms",
    durationText: "2",
    name: "Foundation wall pour",
  },
  {
    category: "Foundation",
    description: "Waterproof foundation walls and install protection board",
    durationText: "2",
    name: "Foundation waterproofing",
  },
  {
    category: "Foundation",
    description:
      "Install weeping tile, drainage stone, filter fabric, and outlets",
    durationText: "2",
    name: "Perimeter drainage",
  },
  {
    category: "Foundation",
    description:
      "Install underslab vapor barrier, granular base, and insulation",
    durationText: "2",
    name: "Slab preparation",
  },
  {
    category: "Foundation",
    description: "Place, finish, cure, and sawcut basement or garage slab",
    durationText: "1",
    name: "Slab pour",
  },
  {
    category: "Framing",
    description: "Frame floor beams, joists, rim boards, and deck sheathing",
    durationText: "4",
    name: "Floor framing",
  },
  {
    category: "Framing",
    description: "Frame exterior and interior bearing walls",
    durationText: "5",
    name: "Wall framing",
  },
  {
    category: "Framing",
    description:
      "Set roof trusses, rafters, bracing, and structural connectors",
    durationText: "4",
    name: "Roof framing",
  },
  {
    category: "Framing",
    description:
      "Install wall, roof, and floor sheathing with fastening inspection",
    durationText: "3",
    name: "Structural sheathing",
  },
  {
    category: "Framing",
    description: "Set stairs, landings, blocking, and guard backing",
    durationText: "2",
    name: "Stair framing",
  },
  {
    category: "Framing",
    description:
      "Complete clips, hold-downs, straps, and engineered connectors",
    durationText: "2",
    name: "Hardware and connectors",
  },
  {
    category: "Exterior envelope",
    description:
      "Install housewrap, flashing tapes, and air barrier transitions",
    durationText: "3",
    name: "Weather barrier",
  },
  {
    category: "Exterior envelope",
    description: "Set windows, exterior doors, pans, and perimeter flashing",
    durationText: "3",
    name: "Window and door install",
  },
  {
    category: "Exterior envelope",
    description:
      "Install roof underlayment, ice shield, flashing, and shingles",
    durationText: "4",
    name: "Roofing",
  },
  {
    category: "Exterior envelope",
    description: "Install gutters, downspouts, fascia, and soffit ventilation",
    durationText: "3",
    name: "Soffit fascia and gutters",
  },
  {
    category: "Exterior envelope",
    description:
      "Install exterior insulation, furring, siding, trim, or panels",
    durationText: "6",
    name: "Siding and exterior trim",
  },
  {
    category: "Exterior envelope",
    description: "Masonry veneer, brick ties, lintels, flashing, and weeps",
    durationText: "7",
    name: "Masonry veneer",
  },
  {
    category: "Mechanical rough-in",
    description: "Install supply, waste, vent, tub sets, and shower valves",
    durationText: "4",
    name: "Plumbing rough-in",
  },
  {
    category: "Mechanical rough-in",
    description:
      "Install water service, meter set, shutoffs, and pressure test",
    durationText: "2",
    name: "Water service rough-in",
  },
  {
    category: "Mechanical rough-in",
    description:
      "Install panels, boxes, wiring, low-voltage routes, and bonding",
    durationText: "5",
    name: "Electrical rough-in",
  },
  {
    category: "Mechanical rough-in",
    description: "Install duct trunks, branches, returns, bath fans, and vents",
    durationText: "4",
    name: "HVAC rough-in",
  },
  {
    category: "Mechanical rough-in",
    description: "Run gas lines, pressure test, and cap appliance stubs",
    durationText: "2",
    name: "Gas rough-in",
  },
  {
    category: "Mechanical rough-in",
    description:
      "Install fire blocking, draft stopping, and penetration sealants",
    durationText: "2",
    name: "Firestopping",
  },
  {
    category: "Insulation and drywall",
    description:
      "Complete batt, blown, spray foam, or exterior insulation scope",
    durationText: "3",
    name: "Thermal insulation",
  },
  {
    category: "Insulation and drywall",
    description:
      "Install poly, seal penetrations, and complete blower-door prep",
    durationText: "2",
    name: "Air sealing and vapor barrier",
  },
  {
    category: "Insulation and drywall",
    description: "Hang board at walls, ceilings, shafts, and moisture areas",
    durationText: "4",
    name: "Drywall hang",
  },
  {
    category: "Insulation and drywall",
    description: "Tape, mud, sand, and finish to specified level",
    durationText: "6",
    name: "Drywall finish",
  },
  {
    category: "Interior finishes",
    description: "Prime walls and ceilings after drywall acceptance",
    durationText: "2",
    name: "Prime coat",
  },
  {
    category: "Interior finishes",
    description: "Install tile backer, waterproofing, tile, grout, and sealant",
    durationText: "5",
    name: "Tile work",
  },
  {
    category: "Interior finishes",
    description:
      "Install hardwood, laminate, carpet, vinyl, or polished concrete",
    durationText: "4",
    name: "Flooring install",
  },
  {
    category: "Interior finishes",
    description:
      "Install interior doors, casing, baseboard, and finish carpentry",
    durationText: "5",
    name: "Interior trim",
  },
  {
    category: "Interior finishes",
    description: "Set cabinets, vanities, panels, and built-ins",
    durationText: "4",
    name: "Cabinetry install",
  },
  {
    category: "Interior finishes",
    description: "Template, fabricate, install, and seam countertops",
    durationText: "3",
    name: "Countertops",
  },
  {
    category: "Interior finishes",
    description: "Paint walls, ceilings, trim, doors, and touch-ups",
    durationText: "5",
    name: "Finish painting",
  },
  {
    category: "Final MEP",
    description:
      "Set fixtures, faucets, toilets, trim kits, and test operation",
    durationText: "3",
    name: "Plumbing trim-out",
  },
  {
    category: "Final MEP",
    description:
      "Install devices, plates, fixtures, breakers, and final labels",
    durationText: "3",
    name: "Electrical trim-out",
  },
  {
    category: "Final MEP",
    description:
      "Set furnace, condenser, HRV, registers, thermostats, and startup",
    durationText: "3",
    name: "HVAC final",
  },
  {
    category: "Final MEP",
    description:
      "Install appliances, test connections, and collect warranty docs",
    durationText: "2",
    name: "Appliance install",
  },
  {
    category: "Exterior and site completion",
    description: "Install porch, deck, railings, stairs, and exterior guards",
    durationText: "4",
    name: "Porch deck and railings",
  },
  {
    category: "Exterior and site completion",
    description: "Driveway base, curbs, concrete, asphalt, or pavers",
    durationText: "4",
    name: "Driveway and flatwork",
  },
  {
    category: "Exterior and site completion",
    description: "Final grade, swales, topsoil, sod, plantings, and cleanup",
    durationText: "4",
    name: "Final grading and landscaping",
  },
  {
    category: "Exterior and site completion",
    description: "Fence, gates, exterior lighting, and address features",
    durationText: "3",
    name: "Site accessories",
  },
  {
    category: "Inspections and closeout",
    description:
      "Pass framing, mechanical, electrical, plumbing, and insulation inspections",
    durationText: "3",
    name: "Rough-in inspections",
  },
  {
    category: "Inspections and closeout",
    description: "Final building inspection, life-safety checks, and signoffs",
    durationText: "2",
    name: "Final inspection",
  },
  {
    category: "Inspections and closeout",
    description:
      "Deficiency walk, punch list corrections, and verification photos",
    durationText: "4",
    name: "Punch list",
  },
  {
    category: "Inspections and closeout",
    description:
      "Occupancy permit, energy docs, manuals, and final release package",
    durationText: "2",
    name: "Occupancy package",
  },
];
export const TEMPLATE_THUMBNAILS: Record<string, string> = {
  "4-plex": "/drawflow-template-thumbnails/four-plex-blueprint.svg",
  four_plex: "/drawflow-template-thumbnails/four-plex-blueprint.svg",
  "multiplex-build":
    "/drawflow-template-thumbnails/multiplex-build-blueprint.png",
  "garden-suite": "/drawflow-template-thumbnails/multiplex-build-blueprint.png",
  "single-family-full-build":
    "/drawflow-template-thumbnails/single-family-full-build-blueprint.png",
  "single-family-renovation":
    "/drawflow-template-thumbnails/single-family-renovation-blueprint.png",
};

export type SetupStep = "template" | "budget";

export interface TimelineSetupTemplate {
  description: string;
  isDefault?: boolean;
  rows: TimelineSetupPreset[];
  scenarios?: TimelineSetupScenario[];
  summary: string;
  templateKey: string;
  title: string;
}

export interface TimelineSetupScenario {
  draws: TimelineSetupScenarioDraw[];
  isActive?: boolean;
  isDefault?: boolean;
  scenarioKey: string;
}

export interface TimelineSetupScenarioDraw {
  amountBps: number;
  drawKey: string;
  label: string;
  order?: number;
  reviewNote?: string;
  timingDay: number;
}

export interface TimelineSetupPreset {
  baseItemId?: string;
  dependencyKeys: string[];
  durationDays: number;
  icon: IsometricIconKey;
  key: string;
  name: string;
  percentageBps: number;
  siteVisitGuidance?: {
    cameraAngles: string;
    whatToVerify: string;
  };
  subMilestoneDetails?: TimelineSetupPresetSubMilestone[];
  subMilestones: string[];
  type: string;
}

export interface TimelineSetupPresetSubMilestone {
  description?: string;
  durationDays?: number;
  fieldGuidance?: TimelineSubmilestoneFieldGuidance;
  key?: string;
  name: string;
  order?: number;
  percentageBps?: number;
  scopeOfWorkTiptapJson?: string;
  startDay?: number;
}

export interface TimelineSetupMilestoneRow extends TimelineSetupPreset {
  budgetText: string;
  contractorAssignments?: TimelineMilestoneWorksheetContractorAssignment[];
  costItems?: TimelineMilestoneWorksheetCostItem[];
  durationText: string;
  excluded: boolean;
  order: number;
  startDay: number;
  subMilestoneDetails: TimelineSetupSubMilestone[];
}

export interface TimelineSetupSubMilestone {
  budgetText: string;
  description: string;
  durationText: string;
  fieldGuidance?: TimelineSubmilestoneFieldGuidance;
  id: string;
  name: string;
  scopeOfWorkTiptapJson?: string;
  startDay?: number;
}

export interface TimelineSetupResult {
  activeItemId: string;
  assignedBrokerWorkosUserId?: string;
  borrowerCoPayBps: number;
  borrowerCoPayCents: number;
  contractorAssignments: TimelineSetupContractorAssignment[];
  costItems: TimelineSetupCostItem[];
  currentDay: number;
  draws?: TimelineSetupDrawResult[];
  includedCount: number;
  items: TimelineItem<DemoMilestone>[];
  permitFiles: File[];
  projectAddress: string;
  projectAddressLatitude?: number;
  projectAddressLongitude?: number;
  projectAddressPlaceId?: string;
  proposedStartDate: string;
  redirectToDurableRoute: boolean;
  reimbursableBudgetCents: number;
  reimbursementBps: number;
  startingCash: number;
  templateKey: string;
  templateTitle: string;
  totalBudget: number;
}

export interface TimelineSetupDrawResult {
  amountCents: number;
  customDate?: boolean;
  drawKey: string;
  label: string;
  milestoneKey?: string;
  order?: number;
  timingDay: number;
}

export interface TimelineSetupFlowProps {
  baseItems: TimelineItem<DemoMilestone>[];
  brokerOptions?: TimelineSetupBrokerOption[];
  contractorOptions?: TimelineMilestoneWorksheetContractorOption[];
  defaultAssignedBrokerWorkosUserId?: string;
  onComplete: (result: TimelineSetupResult) => void;
  settingsTemplates?: TimelineSetupTemplate[];
}

export interface TimelineSetupBrokerOption {
  email?: string;
  isPrincipal: boolean;
  name: string;
  workosUserId: string;
}

export interface TimelineSetupContractorAssignment {
  contractorId?: string;
  contractorName: string;
  estimatedCostCents?: number;
  estimatedHours?: number;
  milestoneKey: string;
  role: string;
  submilestoneKeys: string[];
}

export interface TimelineSetupCostItem {
  budgetSubmilestoneKey?: string;
  budgetTreatment?: "add" | "logOnly" | "maintain";
  costCents: number;
  description?: string;
  itemType: "equipment" | "material";
  milestoneKey: string;
  quantity: number;
  relevantSubmilestoneKeys: string[];
  supplier?: string;
  title: string;
}

export function rowBudgetCents(row: TimelineSetupMilestoneRow) {
  const parsed = parseCurrencyToCents(row.budgetText);

  return Number.isFinite(parsed) ? Math.max(0, parsed) : Number.NaN;
}

export function setupRowsBudgetCents(rows: TimelineSetupMilestoneRow[]) {
  return rows
    .filter((row) => !row.excluded)
    .reduce((sum, row) => {
      const budgetCents = rowBudgetCents(row);

      return sum + (Number.isFinite(budgetCents) ? budgetCents : 0);
    }, 0);
}

export function rowDurationDays(row: TimelineSetupMilestoneRow) {
  const parsed = Number(row.durationText.replace(DURATION_PREFIX_REGEX, ""));

  return Number.isFinite(parsed) ? Math.max(1, Math.round(parsed)) : Number.NaN;
}

export function normalizeCurrencyText(value: string) {
  const cents = parseCurrencyToCents(value);

  return Number.isFinite(cents) ? formatCurrency(Math.max(0, cents)) : value;
}

export function validCurrencyCents(value: string) {
  const cents = parseCurrencyToCents(value);

  return Number.isFinite(cents) ? Math.max(0, cents) : Number.NaN;
}

export function parsePercentTextToBps(value: string) {
  const parsed = Number(value.replace("%", "").trim());

  return Number.isFinite(parsed) ? Math.round(parsed * 100) : Number.NaN;
}

export function validPercentBps(value: string) {
  const bps = parsePercentTextToBps(value);

  return Number.isFinite(bps) ? bps : Number.NaN;
}

export function normalizePercentText(value: string) {
  const bps = parsePercentTextToBps(value);

  return Number.isFinite(bps)
    ? `${Math.min(TOTAL_REIMBURSEMENT_BPS, Math.max(0, Math.round(bps))) / 100}%`
    : value;
}

export function formatBpsPercent(value: number) {
  if (!Number.isFinite(value)) {
    return "--";
  }

  const percent = value / 100;
  return Number.isInteger(percent)
    ? `${percent}%`
    : `${percent.toFixed(2).replace(TRAILING_ZERO_DECIMAL_REGEX, "")}%`;
}

export function normalizeDurationText(value: string) {
  const parsed = Number(value.replace(DURATION_PREFIX_REGEX, ""));

  return Number.isFinite(parsed)
    ? String(Math.max(1, Math.round(parsed)))
    : value;
}

export function sanitizeSubMilestoneName(value: string) {
  const trimmed = value.trim();

  return trimmed || "Untitled sub-milestone";
}

export function slugifySubMilestone(value: string) {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "sub-milestone"
  );
}

export function slugifyMilestone(value: string) {
  return (
    value
      .toLowerCase()
      .replace(/&/g, " and ")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "milestone"
  );
}

export function inferImportedMilestoneIcon(name: string): IsometricIconKey {
  const normalized = name.toLowerCase();
  if (normalized.includes("foundation") || normalized.includes("permit")) {
    return "foundation";
  }
  if (
    normalized.includes("framing") ||
    normalized.includes("lumber") ||
    normalized.includes("concrete")
  ) {
    return "framing";
  }
  if (
    normalized.includes("hvac") ||
    normalized.includes("plumbing") ||
    normalized.includes("electrical")
  ) {
    return "roughIn";
  }
  if (
    normalized.includes("stucco") ||
    normalized.includes("brick") ||
    normalized.includes("roof") ||
    normalized.includes("window") ||
    normalized.includes("door")
  ) {
    return "exterior";
  }
  if (
    normalized.includes("drywall") ||
    normalized.includes("insulation") ||
    normalized.includes("floor") ||
    normalized.includes("tile") ||
    normalized.includes("paint")
  ) {
    return "finishes";
  }
  if (
    normalized.includes("kitchen") ||
    normalized.includes("appliance") ||
    normalized.includes("trim")
  ) {
    return "kitchen";
  }
  if (
    normalized.includes("landscaping") ||
    normalized.includes("insurance") ||
    normalized.includes("management")
  ) {
    return "closeout";
  }
  return "change";
}
