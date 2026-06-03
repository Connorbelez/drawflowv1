"use client";

import {
  Check,
  ChevronRight,
  ClipboardCheck,
  FileText,
  Info,
  ShieldCheck,
  Upload,
} from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import {
  type ChangeEvent,
  type DragEvent,
  type ReactNode,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { GoogleAddressAutocomplete } from "#/components/address/GoogleAddressAutocomplete.tsx";
import type { TimelineItem } from "#/components/roadmap/AnimatedCurvedTimeline.tsx";
import { Button } from "#/components/ui/button.tsx";
import { FramePanel } from "#/components/ui/frame.tsx";
import {
  BuildPermitViewerDrawer,
  firstPermitDocument,
} from "#/features/build-permit-viewer/BuildPermitViewerDrawer.tsx";
import {
  allocateBudgetCents,
  formatCurrency,
  parseCurrencyToCents,
} from "#/features/builder-proposal-demo/template-helpers.ts";
import {
  type BudgetWorkbookProposalDraft,
  parseBudgetWorkbookFile,
} from "#/features/proposal-import/budget-workbook-schema.ts";
import { coerceSiteVisitGuidance } from "#/lib/site-visit-guidance.ts";
import { cn } from "#/lib/utils.ts";
import {
  type TimelineMilestoneWorksheetContractorAssignment,
  type TimelineMilestoneWorksheetContractorOption,
  type TimelineMilestoneWorksheetCostItem,
  TimelineMilestoneWorksheetTable,
} from "./-TimelineMilestoneWorksheetTable.tsx";
import { normalizeMilestoneTimelineItems } from "./-timeline-milestone-schedule.ts";
import { mapSubmilestoneSnapshotRows } from "./-timeline-milestone-submilestones.ts";
import type {
  DemoMilestone,
  IsometricIconKey,
} from "./-timeline-share-snapshot.ts";
import {
  calculateDrawAvailabilityAmount,
  DEFAULT_BORROWER_CO_PAY_BPS,
  getReimbursementBps,
  normalizeBorrowerCoPayBps,
  TOTAL_REIMBURSEMENT_BPS,
} from "./-timeline-share-snapshot.ts";
import "./-timeline-setup-flow.css";

const DEFAULT_SETUP_BUDGET_TEXT = "$1,250,000";
const DEFAULT_SETUP_CASH_TEXT = "$400,000";
const DEFAULT_SETUP_CO_PAY_TEXT = "20%";
export const DEFAULT_SETUP_ADDRESS = "Hamilton, ON";

export function resolveTimelineSetupAddress(value: string): string {
  const trimmed = value.trim();
  return trimmed || DEFAULT_SETUP_ADDRESS;
}
const GENERATED_TIMELINE_CURRENT_DAY = 0;
const DEFAULT_HANDOFF_GAP_DAYS = 5;
const DEFAULT_GENERATED_DRAW_OFFSET_DAYS = 2;
const DEFAULT_NEW_MILESTONE_BUDGET_TEXT = "$0";
const DEFAULT_NEW_MILESTONE_DURATION_TEXT = "7";
const DEFAULT_NEW_SUB_MILESTONE_BUDGET_TEXT = "$0";
const DEFAULT_NEW_SUB_MILESTONE_DURATION_TEXT = "1";
const DURATION_PREFIX_REGEX = /^T/i;
const STRIP_LEADING_DOLLAR = /^\$/;
const TRAILING_ZERO_DECIMAL_REGEX = /\.?0+$/;
const subMilestoneDescriptions = [
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
const TEMPLATE_THUMBNAILS: Record<string, string> = {
  "4-plex": "/drawflow-template-thumbnails/four-plex-blueprint.svg",
  four_plex: "/drawflow-template-thumbnails/four-plex-blueprint.svg",
  multiplex_build:
    "/drawflow-template-thumbnails/multiplex-build-blueprint.png",
  "multiplex-build":
    "/drawflow-template-thumbnails/multiplex-build-blueprint.png",
  single_family_full_build:
    "/drawflow-template-thumbnails/single-family-full-build-blueprint.png",
  "single-family-full-build":
    "/drawflow-template-thumbnails/single-family-full-build-blueprint.png",
  single_family_renovation:
    "/drawflow-template-thumbnails/single-family-renovation-blueprint.png",
  "single-family-renovation":
    "/drawflow-template-thumbnails/single-family-renovation-blueprint.png",
};

type SetupStep = "template" | "budget";

export interface TimelineSetupTemplate {
  description: string;
  isDefault?: boolean;
  rows: TimelineSetupPreset[];
  summary: string;
  templateKey: string;
  title: string;
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
  key?: string;
  name: string;
  order?: number;
  percentageBps?: number;
}

export interface TimelineSetupMilestoneRow extends TimelineSetupPreset {
  budgetText: string;
  contractorAssignments?: TimelineMilestoneWorksheetContractorAssignment[];
  costItems?: TimelineMilestoneWorksheetCostItem[];
  durationText: string;
  excluded: boolean;
  order: number;
  subMilestoneDetails: TimelineSetupSubMilestone[];
}

export interface TimelineSetupSubMilestone {
  budgetText: string;
  description: string;
  durationText: string;
  id: string;
  name: string;
}

export interface TimelineSetupResult {
  activeItemId: string;
  borrowerCoPayBps: number;
  borrowerCoPayCents: number;
  contractorAssignments: TimelineSetupContractorAssignment[];
  costItems: TimelineSetupCostItem[];
  currentDay: number;
  includedCount: number;
  items: TimelineItem<DemoMilestone>[];
  permitFiles: File[];
  projectAddress: string;
  redirectToDurableRoute: boolean;
  reimbursableBudgetCents: number;
  reimbursementBps: number;
  startingCash: number;
  templateKey: string;
  templateTitle: string;
  totalBudget: number;
}

export interface TimelineSetupFlowProps {
  baseItems: TimelineItem<DemoMilestone>[];
  contractorOptions?: TimelineMilestoneWorksheetContractorOption[];
  onComplete: (result: TimelineSetupResult) => void;
  settingsTemplates?: TimelineSetupTemplate[];
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
  costCents: number;
  description?: string;
  itemType: "equipment" | "material";
  milestoneKey: string;
  quantity: number;
  relevantSubmilestoneKeys: string[];
  supplier?: string;
  title: string;
}

function rowBudgetCents(row: TimelineSetupMilestoneRow) {
  const parsed = parseCurrencyToCents(row.budgetText);

  return Number.isFinite(parsed) ? Math.max(0, parsed) : Number.NaN;
}

function setupRowsBudgetCents(rows: TimelineSetupMilestoneRow[]) {
  return rows
    .filter((row) => !row.excluded)
    .reduce((sum, row) => {
      const budgetCents = rowBudgetCents(row);

      return sum + (Number.isFinite(budgetCents) ? budgetCents : 0);
    }, 0);
}

function rowDurationDays(row: TimelineSetupMilestoneRow) {
  const parsed = Number(row.durationText.replace(DURATION_PREFIX_REGEX, ""));

  return Number.isFinite(parsed) ? Math.max(1, Math.round(parsed)) : Number.NaN;
}

function normalizeCurrencyText(value: string) {
  const cents = parseCurrencyToCents(value);

  return Number.isFinite(cents) ? formatCurrency(Math.max(0, cents)) : value;
}

function validCurrencyCents(value: string) {
  const cents = parseCurrencyToCents(value);

  return Number.isFinite(cents) ? Math.max(0, cents) : Number.NaN;
}

export function parsePercentTextToBps(value: string) {
  const parsed = Number(value.replace("%", "").trim());

  return Number.isFinite(parsed) ? Math.round(parsed * 100) : Number.NaN;
}

function validPercentBps(value: string) {
  const bps = parsePercentTextToBps(value);

  return Number.isFinite(bps) ? bps : Number.NaN;
}

function normalizePercentText(value: string) {
  const bps = parsePercentTextToBps(value);

  return Number.isFinite(bps)
    ? `${normalizeBorrowerCoPayBps(bps) / 100}%`
    : value;
}

function formatBpsPercent(value: number) {
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

function sanitizeSubMilestoneName(value: string) {
  const trimmed = value.trim();

  return trimmed || "Untitled sub-milestone";
}

function slugifySubMilestone(value: string) {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "sub-milestone"
  );
}

function slugifyMilestone(value: string) {
  return (
    value
      .toLowerCase()
      .replace(/&/g, " and ")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "milestone"
  );
}

function inferImportedMilestoneIcon(name: string): IsometricIconKey {
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

export function budgetWorkbookDraftToSetupRows(
  draft: BudgetWorkbookProposalDraft
): TimelineSetupMilestoneRow[] {
  return draft.milestones.map((milestone, index) => {
    const durationDays = Math.max(1, milestone.submilestones.length);
    const key = milestone.milestoneKey || slugifyMilestone(milestone.name);
    const subMilestoneDetails = milestone.submilestones.map((submilestone) => ({
      budgetText: formatCurrency(Math.round(submilestone.budgetAmount * 100)),
      description: `Imported budget line from ${draft.sourceName ?? "budget workbook"}`,
      durationText: "1",
      id: submilestone.budgetLineKey.replace(/[^a-zA-Z0-9_-]+/g, "-"),
      name: sanitizeSubMilestoneName(submilestone.name),
    }));

    return withSubMilestoneDetails(
      {
        budgetText: formatCurrency(Math.round(milestone.budgetAmount * 100)),
        contractorAssignments: [],
        costItems: [],
        dependencyKeys:
          index === 0
            ? []
            : [draft.milestones[index - 1]?.milestoneKey ?? ""].filter(Boolean),
        durationDays,
        durationText: String(durationDays),
        excluded: false,
        icon: inferImportedMilestoneIcon(
          `${milestone.name} ${milestone.submilestones
            .map((submilestone) => submilestone.name)
            .join(" ")}`
        ),
        key,
        name: milestone.name,
        order: index,
        percentageBps: Math.round(
          (milestone.budgetAmount / Math.max(1, draft.totalBudget)) * 10_000
        ),
        subMilestoneDetails,
        subMilestones: subMilestoneDetails.map((detail) => detail.name),
        type: "imported_budget",
      },
      subMilestoneDetails
    );
  });
}

function allocateWeightedBudgetCents(
  totalCents: number,
  rows: Array<{ percentageBps?: number }>
) {
  const totalBps = rows.reduce(
    (sum, row) => sum + Math.max(0, Math.round(row.percentageBps ?? 0)),
    0
  );
  if (totalBps <= 0) {
    return;
  }

  const roundedTotal = Math.round(totalCents);
  const allocations = rows.map((row, order) => {
    const raw = roundedTotal * Math.max(0, Math.round(row.percentageBps ?? 0));
    return {
      cents: Math.floor(raw / totalBps),
      order,
      remainder: raw % totalBps,
    };
  });
  let remainderCents =
    roundedTotal -
    allocations.reduce((sum, allocation) => sum + allocation.cents, 0);
  const byRemainder = [...allocations].sort(
    (a, b) => b.remainder - a.remainder || a.order - b.order
  );
  for (const allocation of byRemainder) {
    if (remainderCents <= 0) {
      break;
    }
    allocation.cents += 1;
    remainderCents -= 1;
  }
  return allocations
    .sort((a, b) => a.order - b.order)
    .map((allocation) => allocation.cents);
}

function buildSubMilestoneDetails(
  row: TimelineSetupPreset,
  budgetCents: number,
  durationDays: number
): TimelineSetupSubMilestone[] {
  const presets: TimelineSetupPresetSubMilestone[] =
    row.subMilestoneDetails && row.subMilestoneDetails.length > 0
      ? [...row.subMilestoneDetails]
          .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
          .map((detail) => ({
            ...detail,
            name: sanitizeSubMilestoneName(detail.name),
          }))
      : (row.subMilestones.length > 0
          ? row.subMilestones
          : ["Initial scope"]
        ).map((name) => ({ name: sanitizeSubMilestoneName(name) }));
  const count = Math.max(1, presets.length);
  const weightedBudgetCents = allocateWeightedBudgetCents(budgetCents, presets);
  const baseBudgetCents = Math.floor(Math.max(0, budgetCents) / count);
  const budgetRemainderCents =
    Math.max(0, budgetCents) - baseBudgetCents * count;
  const baseDurationDays = Math.floor(Math.max(1, durationDays) / count);
  const durationRemainderDays =
    Math.max(1, durationDays) - baseDurationDays * count;

  return presets.map((preset, index) => ({
    budgetText: formatCurrency(
      weightedBudgetCents?.[index] ??
        baseBudgetCents + (index < budgetRemainderCents ? 1 : 0)
    ),
    description:
      preset.description ??
      subMilestoneDescriptions[index % subMilestoneDescriptions.length],
    durationText: String(
      Math.max(
        1,
        Math.round(
          preset.durationDays ??
            baseDurationDays + (index < durationRemainderDays ? 1 : 0)
        )
      )
    ),
    id: preset.key ?? `${row.key}-${slugifySubMilestone(preset.name)}-${index}`,
    name: preset.name,
  }));
}

function withSubMilestoneDetails(
  row: TimelineSetupMilestoneRow,
  subMilestoneDetails: TimelineSetupSubMilestone[]
): TimelineSetupMilestoneRow {
  return {
    ...row,
    subMilestoneDetails,
    subMilestones: subMilestoneDetails.map((detail) =>
      sanitizeSubMilestoneName(detail.name)
    ),
  };
}

function makeUniqueRowKey(name: string, rows: TimelineSetupMilestoneRow[]) {
  const baseKey = `custom-${slugifySubMilestone(name)}`;
  const existingKeys = new Set(rows.map((row) => row.key));

  if (!existingKeys.has(baseKey)) {
    return baseKey;
  }

  let suffix = 2;
  while (existingKeys.has(`${baseKey}-${suffix}`)) {
    suffix += 1;
  }

  return `${baseKey}-${suffix}`;
}

export function createCustomMilestoneRow({
  name,
  order,
  rows,
}: {
  name: string;
  order: number;
  rows: TimelineSetupMilestoneRow[];
}): TimelineSetupMilestoneRow {
  const key = makeUniqueRowKey(name, rows);
  const subMilestoneDetails: TimelineSetupSubMilestone[] = [
    {
      budgetText: DEFAULT_NEW_SUB_MILESTONE_BUDGET_TEXT,
      description:
        "Define reimbursable scope, evidence, and acceptance criteria",
      durationText: DEFAULT_NEW_SUB_MILESTONE_DURATION_TEXT,
      id: `${key}-scope-definition-0`,
      name: "Scope definition",
    },
  ];

  return withSubMilestoneDetails(
    {
      budgetText: DEFAULT_NEW_MILESTONE_BUDGET_TEXT,
      contractorAssignments: [],
      costItems: [],
      dependencyKeys: [],
      durationDays: Number(DEFAULT_NEW_MILESTONE_DURATION_TEXT),
      durationText: DEFAULT_NEW_MILESTONE_DURATION_TEXT,
      excluded: false,
      icon: "change",
      key,
      name,
      order,
      percentageBps: 0,
      subMilestoneDetails,
      subMilestones: [],
      type: "custom",
    },
    subMilestoneDetails
  );
}

export function formatRowType(value: string) {
  return value
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replaceAll("_", " ")
    .toLowerCase();
}

function buildDefaultTemplate(
  baseItems: TimelineItem<DemoMilestone>[]
): TimelineSetupTemplate {
  const totalAmount = Math.max(
    1,
    baseItems.reduce((sum, item) => sum + (item.data?.amount ?? 0), 0)
  );

  return {
    description:
      "The current Elm Street draw roadmap, ready for budget tuning before the live timeline.",
    isDefault: true,
    rows: baseItems.map((item) => {
      const data = item.data;
      const amount = data?.amount ?? 0;

      return {
        baseItemId: item.id,
        dependencyKeys: [],
        durationDays: data?.durationDays ?? 14,
        icon: data?.icon ?? "change",
        key: item.id,
        name: data?.name ?? item.label ?? item.id,
        percentageBps: Math.round((amount / totalAmount) * 10_000),
        siteVisitGuidance: coerceSiteVisitGuidance(data?.siteVisitGuidance),
        subMilestones: data?.subMilestones ?? [],
        type: data?.icon ?? "scope",
      } satisfies TimelineSetupPreset;
    }),
    summary: `${baseItems.length} project milestones`,
    templateKey: "single_family_full_build",
    title: "Single Family Full Build",
  } satisfies TimelineSetupTemplate;
}

function secondaryTemplates(): TimelineSetupTemplate[] {
  return [
    {
      description:
        "Selective demolition, structural repairs, envelope work, interior rebuild, and inspection closeout.",
      rows: [
        preset(
          "renovation_permits",
          "Permit updates and mobilization",
          800,
          10,
          "foundation",
          "permitting",
          ["Permit update", "Site protection", "Mobilization"]
        ),
        preset(
          "selective_demo",
          "Selective demolition",
          1400,
          16,
          "change",
          "demolition",
          ["Interior demo", "Waste removal", "Utility safety"]
        ),
        preset(
          "structural_repairs",
          "Structural repairs",
          1800,
          24,
          "framing",
          "foundation_structural",
          ["Beam repair", "Load path", "Inspection"]
        ),
        preset(
          "mep_rework",
          "MEP rework",
          1500,
          21,
          "roughIn",
          "mechanical_electrical_plumbing",
          ["Plumbing rework", "Electrical panel", "HVAC adjustments"]
        ),
        preset(
          "envelope_repairs",
          "Envelope repairs",
          1300,
          18,
          "exterior",
          "exterior_envelope",
          ["Window repair", "Weather barrier", "Exterior patch"]
        ),
        preset(
          "renovation_interiors",
          "Interior rebuild",
          2400,
          36,
          "finishes",
          "interior_finish",
          ["Drywall", "Cabinetry", "Fixture set"]
        ),
        preset(
          "renovation_closeout",
          "Inspection closeout",
          800,
          10,
          "closeout",
          "closeout",
          ["Punch list", "Final inspection", "Closeout package"]
        ),
      ],
      summary: "7 renovation milestones",
      templateKey: "single_family_renovation",
      title: "Single Family Renovation",
    },
    {
      description:
        "Multi-unit civil work, podium, stacked framing, shared systems, unit finishes, and occupancy closeout.",
      rows: [
        preset(
          "multiplex_permits",
          "Permits and civil mobilization",
          500,
          16,
          "foundation",
          "permitting",
          ["Civil permit", "Mobilization", "Survey control"]
        ),
        preset(
          "shared_sitework",
          "Shared sitework and utilities",
          1000,
          28,
          "foundation",
          "site_preparation",
          ["Rough grading", "Utility trenching", "Site access"]
        ),
        preset(
          "podium_foundation",
          "Foundation and podium slab",
          1250,
          30,
          "foundation",
          "foundation_structural",
          ["Footings", "Podium formwork", "Concrete placement"]
        ),
        preset(
          "stacked_framing",
          "Stacked framing and dry-in",
          1900,
          42,
          "framing",
          "foundation_structural",
          ["Level framing", "Trusses", "Dry-in"]
        ),
        preset(
          "shared_mep",
          "Shared MEP rough-ins",
          1250,
          35,
          "roughIn",
          "mechanical_electrical_plumbing",
          ["Main risers", "Electrical rooms", "Mechanical trunk"]
        ),
        preset(
          "unit_finishes",
          "Unit finishes",
          1350,
          45,
          "finishes",
          "interior_finish",
          ["Drywall", "Flooring", "Kitchen package"]
        ),
        preset(
          "multiplex_closeout",
          "Final inspections and occupancy",
          750,
          18,
          "closeout",
          "closeout",
          ["Life safety", "Occupancy inspections", "Closeout binder"]
        ),
      ],
      summary: "7 multiplex milestones",
      templateKey: "multiplex_build",
      title: "Multi-plex Build",
    },
  ];
}

function preset(
  key: string,
  name: string,
  percentageBps: number,
  durationDays: number,
  icon: IsometricIconKey,
  type: string,
  subMilestones: string[]
): TimelineSetupPreset {
  return {
    dependencyKeys: [],
    durationDays,
    icon,
    key,
    name,
    percentageBps,
    subMilestones,
    type,
  };
}

export function createRowsFromTemplate(
  template: TimelineSetupTemplate,
  budgetCents: number
): TimelineSetupMilestoneRow[] {
  const allocations = allocateBudgetCents(budgetCents, template.rows);

  return template.rows.map((row, order) => {
    const budgetCents = allocations[order] ?? 0;

    return {
      ...row,
      budgetText: formatCurrency(budgetCents),
      contractorAssignments: [],
      costItems: [],
      durationText: String(row.durationDays),
      excluded: false,
      order,
      subMilestoneDetails: buildSubMilestoneDetails(
        row,
        budgetCents,
        row.durationDays
      ),
    };
  });
}

function chooseStatus(
  order: number,
  includedCount: number
): DemoMilestone["status"] {
  if (includedCount > 0 && order === 0) {
    return "ready";
  }

  return "upcoming";
}

function chooseTone(status: DemoMilestone["status"]) {
  if (status === "complete") {
    return "complete" as const;
  }

  if (status === "ready") {
    return "active" as const;
  }

  return "upcoming" as const;
}

export function buildTimelineItemsFromSetupRows(
  rows: TimelineSetupMilestoneRow[],
  coPayBps = DEFAULT_BORROWER_CO_PAY_BPS
): TimelineItem<DemoMilestone>[] {
  const includedRows = rows.filter((row) => !row.excluded);
  let cursor = GENERATED_TIMELINE_CURRENT_DAY;

  return normalizeMilestoneTimelineItems(
    includedRows.map((row, includedIndex) => {
      const budgetCents = rowBudgetCents(row);
      const durationDays = rowDurationDays(row);
      const amount = Number.isFinite(budgetCents)
        ? Math.round(budgetCents / 100)
        : 0;
      const normalizedDuration = Number.isFinite(durationDays)
        ? durationDays
        : row.durationDays;
      const startDay = cursor;
      const status = chooseStatus(includedIndex, includedRows.length);
      const item: TimelineItem<DemoMilestone> = {
        data: {
          amount,
          draw: `Draw ${includedIndex + 1}`,
          drawAvailabilityAmount: calculateDrawAvailabilityAmount(
            amount,
            coPayBps
          ),
          drawX:
            startDay +
            normalizedDuration +
            Math.min(
              DEFAULT_GENERATED_DRAW_OFFSET_DAYS,
              DEFAULT_HANDOFF_GAP_DAYS - 1
            ),
          durationDays: normalizedDuration,
          evidence: status === "ready" ? "Ready to start" : "Not started",
          icon: row.icon,
          name: row.name,
          policy: status === "ready" ? "Planning handoff" : "Upcoming",
          siteVisitGuidance: row.siteVisitGuidance,
          status,
          subMilestones: row.subMilestones,
          submilestoneDetails: mapSubmilestoneSnapshotRows(
            row.subMilestoneDetails.map((detail, index) => ({
              budgetCents: (() => {
                const cents = parseCurrencyToCents(detail.budgetText);
                return Number.isFinite(cents) ? Math.max(0, cents) : undefined;
              })(),
              description: detail.description,
              durationDays: (() => {
                const parsed = Number(
                  detail.durationText.replace(DURATION_PREFIX_REGEX, "")
                );
                return Number.isFinite(parsed)
                  ? Math.max(1, Math.round(parsed))
                  : undefined;
              })(),
              key: detail.id,
              name: detail.name,
              order: index + 1,
            })),
            row.key
          ),
        },
        eyebrow: `Milestone ${includedIndex + 1}`,
        id: row.key,
        label: row.name.split(" ")[0] ?? row.name,
        lane: includedIndex % 3 === 1 ? -1 : includedIndex % 3 === 2 ? 1 : 0,
        markerLabel: String(includedIndex + 1),
        tone: chooseTone(status),
        x: startDay,
      };

      cursor += normalizedDuration + DEFAULT_HANDOFF_GAP_DAYS;
      return item;
    })
  );
}

export function buildPlanningPayloadFromSetupRows(
  rows: TimelineSetupMilestoneRow[]
): {
  contractorAssignments: TimelineSetupContractorAssignment[];
  costItems: TimelineSetupCostItem[];
} {
  const includedRows = rows.filter((row) => !row.excluded);
  return {
    contractorAssignments: includedRows.flatMap(
      setupRowContractorAssignmentsToPayload
    ),
    costItems: includedRows.flatMap(setupRowCostItemsToPayload),
  };
}

function setupRowContractorAssignmentsToPayload(
  row: TimelineSetupMilestoneRow
) {
  const availableSubmilestoneKeys = setupRowSubmilestoneKeys(row);
  return (row.contractorAssignments ?? [])
    .map((assignment) =>
      setupContractorAssignmentToPayload(
        row,
        availableSubmilestoneKeys,
        assignment
      )
    )
    .filter((assignment): assignment is TimelineSetupContractorAssignment =>
      Boolean(assignment)
    );
}

function setupContractorAssignmentToPayload(
  row: TimelineSetupMilestoneRow,
  availableSubmilestoneKeys: Set<string>,
  assignment: TimelineMilestoneWorksheetContractorAssignment
): TimelineSetupContractorAssignment | null {
  const contractorName = assignment.contractorName.trim();
  const role = assignment.role.trim();
  if (!(contractorName && role)) {
    return null;
  }
  return {
    ...(assignment.contractorId
      ? { contractorId: assignment.contractorId }
      : {}),
    contractorName,
    ...(assignment.estimatedCostCents === undefined
      ? {}
      : { estimatedCostCents: assignment.estimatedCostCents }),
    ...(assignment.estimatedHours === undefined
      ? {}
      : { estimatedHours: assignment.estimatedHours }),
    milestoneKey: row.key,
    role,
    submilestoneKeys: assignment.subMilestoneIds.filter((key) =>
      availableSubmilestoneKeys.has(key)
    ),
  };
}

function setupRowCostItemsToPayload(row: TimelineSetupMilestoneRow) {
  const availableSubmilestoneKeys = setupRowSubmilestoneKeys(row);
  return (row.costItems ?? [])
    .map((item) => setupCostItemToPayload(row, availableSubmilestoneKeys, item))
    .filter((item): item is TimelineSetupCostItem => Boolean(item));
}

function setupCostItemToPayload(
  row: TimelineSetupMilestoneRow,
  availableSubmilestoneKeys: Set<string>,
  item: TimelineMilestoneWorksheetCostItem
): TimelineSetupCostItem | null {
  const title = item.title.trim();
  if (!title || item.costCents <= 0 || item.quantity <= 0) {
    return null;
  }
  return {
    costCents: item.costCents,
    ...(item.description?.trim()
      ? { description: item.description.trim() }
      : {}),
    itemType: item.itemType,
    milestoneKey: row.key,
    quantity: item.quantity,
    relevantSubmilestoneKeys: item.relevantSubMilestoneIds.filter((key) =>
      availableSubmilestoneKeys.has(key)
    ),
    ...(item.supplier?.trim() ? { supplier: item.supplier.trim() } : {}),
    title,
  };
}

function setupRowSubmilestoneKeys(row: TimelineSetupMilestoneRow) {
  return new Set(row.subMilestoneDetails.map((detail) => detail.id));
}

function TemplateStep({
  budgetText,
  cashText,
  coPayText,
  error,
  onBudgetTextChange,
  onCashTextChange,
  onCoPayTextChange,
  onContinue,
  onPermitFilesChange,
  onPermitSkipChange,
  onProjectAddressChange,
  onTemplateSelect,
  permitFiles,
  permitsSkipped,
  projectAddress,
  selectedTemplateKey,
  templates,
}: {
  budgetText: string;
  cashText: string;
  coPayText: string;
  error: string;
  onBudgetTextChange: (value: string) => void;
  onCashTextChange: (value: string) => void;
  onCoPayTextChange: (value: string) => void;
  onContinue: () => void;
  onPermitFilesChange: (files: File[]) => void;
  onPermitSkipChange: (skipped: boolean) => void;
  onProjectAddressChange: (value: string) => void;
  onTemplateSelect: (templateKey: string) => void;
  permitFiles: File[];
  permitsSkipped: boolean;
  projectAddress: string;
  selectedTemplateKey: string;
  templates: TimelineSetupTemplate[];
}) {
  const selectedTemplate = templates.find(
    (template) => template.templateKey === selectedTemplateKey
  );
  const budgetCents = validCurrencyCents(budgetText);
  const cashCents = validCurrencyCents(cashText);
  const coPayBps = validPercentBps(coPayText);
  const reimbursementBps = getReimbursementBps(coPayBps);
  const coPayCents =
    Number.isFinite(budgetCents) && Number.isFinite(coPayBps)
      ? Math.round((budgetCents * coPayBps) / TOTAL_REIMBURSEMENT_BPS)
      : Number.NaN;
  const reimbursementCents =
    Number.isFinite(budgetCents) && Number.isFinite(reimbursementBps)
      ? Math.max(
          0,
          Math.round((budgetCents * reimbursementBps) / TOTAL_REIMBURSEMENT_BPS)
        )
      : Number.NaN;

  return (
    <div
      className="timeline-setup-panel timeline-setup-template-panel"
      data-testid="timeline-setup-template-screen"
    >
      <ProposalProgressSection step="template" />

      <section className="timeline-setup-main">
        <BlueprintPanel
          description="Choose a template that best matches your project."
          title="1. Select Template"
        >
          <div className="timeline-template-grid">
            {templates.map((template) => {
              const selected = template.templateKey === selectedTemplateKey;

              return (
                <button
                  aria-label={`${selected ? "Selected" : "Select"} ${template.title} template`}
                  aria-pressed={selected}
                  className={cn(
                    "timeline-template-card",
                    selected && "is-selected"
                  )}
                  data-testid={`timeline-setup-template-card-${template.templateKey}`}
                  key={template.templateKey}
                  onClick={() => onTemplateSelect(template.templateKey)}
                  type="button"
                >
                  <img
                    alt={`${template.title} blueprint`}
                    className="timeline-template-thumb"
                    height={96}
                    src={TEMPLATE_THUMBNAILS[template.templateKey]}
                    width={128}
                  />
                  <span className="timeline-template-card-copy">
                    <strong>{template.title}</strong>
                    <small>{template.description}</small>
                  </span>
                  <span className="timeline-template-radio">
                    {selected ? <Check aria-hidden="true" /> : null}
                  </span>
                </button>
              );
            })}
          </div>
        </BlueprintPanel>

        <BlueprintPanel className="timeline-setup-budget-input-panel">
          <CurrencySetupField
            label="Total Budget"
            note=""
            onChange={onBudgetTextChange}
            testId="timeline-setup-budget-input"
            value={budgetText}
          />
          <CurrencySetupField
            label="Max Cash on Hand"
            note="Cash on hand is how much the borrower can spend before needing a draw."
            onChange={onCashTextChange}
            testId="timeline-setup-cash-input"
            value={cashText}
          />
          <PercentSetupField
            label="Co-pay"
            note="Percentage paid out of pocket. 20% co-pay means 80% of each completed milestone unlocks as draw availability."
            onChange={onCoPayTextChange}
            testId="timeline-setup-co-pay-input"
            value={coPayText}
          />
        </BlueprintPanel>

        <BlueprintPanel>
          <GoogleAddressAutocomplete
            className="timeline-setup-address-field"
            inputRender={
              <input
                aria-label="Project address"
                data-testid="timeline-setup-address-input"
              />
            }
            label={
              <span>
                Project Address <em>(optional)</em>
              </span>
            }
            onChange={onProjectAddressChange}
            placeholder="Enter project address"
            value={projectAddress}
          />
        </BlueprintPanel>

        <BlueprintPanel
          description="Upload building permits or other required approvals."
          title="4. Build Permits"
        >
          <BlueprintPermitUploader
            files={permitFiles}
            onFilesChange={(files) => {
              onPermitFilesChange(files);
              if (files.length > 0) {
                onPermitSkipChange(false);
              }
            }}
          />
          <div className="timeline-permit-footer">
            <span>
              <FileText aria-hidden="true" />
              Permits can be skipped for now. You'll be required to upload
              before final submission.
            </span>
            <button
              aria-pressed={permitsSkipped}
              data-testid="timeline-setup-skip-permits"
              onClick={() => onPermitSkipChange(true)}
              type="button"
            >
              {permitsSkipped ? "Skipped" : "Skip for now"}
            </button>
          </div>
        </BlueprintPanel>

        {error ? (
          <p
            className="timeline-blueprint-error"
            data-testid="timeline-setup-error"
            role="alert"
          >
            {error}
          </p>
        ) : null}
      </section>

      <aside className="timeline-setup-sidecar">
        <BlueprintSummaryCard
          budgetCents={budgetCents}
          cashCents={cashCents}
          coPayBps={coPayBps}
          coPayCents={coPayCents}
          projectAddress={projectAddress}
          reimbursementBps={reimbursementBps}
          reimbursementCents={reimbursementCents}
          selectedTemplateTitle={selectedTemplate?.title}
        />
        <BlueprintAsideCard icon={<ClipboardCheck aria-hidden="true" />}>
          <h2>What happens next</h2>
          <p>
            We'll use your selected template to automatically generate
            milestones and default draw groups.
          </p>
          <ul>
            <li>Milestone schedule will be created</li>
            <li>Draw groups and line items will be added</li>
            <li>You can edit everything in the next step</li>
          </ul>
        </BlueprintAsideCard>
        <BlueprintAsideCard icon={<ShieldCheck aria-hidden="true" />}>
          <h2>Compliance Note</h2>
          <strong>Permits required before final submission</strong>
          <p>
            Building permits and other required approvals must be uploaded
            before you can submit this proposal for review and funding.
          </p>
        </BlueprintAsideCard>
        <Button
          className="timeline-setup-primary"
          data-testid="timeline-setup-continue-budget"
          onClick={onContinue}
        >
          Continue to milestone budget
          <ChevronRight />
        </Button>
      </aside>
    </div>
  );
}

function ProposalProgressSection({ step }: { step: SetupStep }) {
  return (
    <section className="timeline-proposal-progress-section">
      <p className="timeline-proposal-step-label">
        Step {step === "template" ? "1" : "2"} of 4 -{" "}
        {step === "template" ? "Project Setup" : "Milestones & Budget"}
      </p>
      <StepRail step={step} />
    </section>
  );
}

function BlueprintPanel({
  children,
  className,
  description,
  title,
}: {
  children: ReactNode;
  className?: string;
  description?: string;
  title?: string;
}) {
  return (
    <section className={cn("timeline-blueprint-panel", className)}>
      {title ? (
        <div className="timeline-blueprint-panel-heading">
          <h2>{title}</h2>
          {description ? <p>{description}</p> : null}
        </div>
      ) : null}
      {children}
    </section>
  );
}

function CurrencySetupField({
  label,
  note,
  onChange,
  testId,
  value,
}: {
  label: string;
  note: string;
  onChange: (value: string) => void;
  testId: string;
  value: string;
}) {
  return (
    <label className="timeline-setup-money-field">
      <span>
        {label} <Info aria-hidden="true" />
      </span>
      <div className="timeline-setup-money-input">
        <span>$</span>
        <input
          aria-label={label}
          data-testid={testId}
          onBlur={(event) =>
            onChange(normalizeCurrencyText(event.currentTarget.value))
          }
          onChange={(event) => onChange(event.currentTarget.value)}
          value={value.replace(STRIP_LEADING_DOLLAR, "")}
        />
      </div>
      {note ? <small>{note}</small> : null}
    </label>
  );
}

function PercentSetupField({
  label,
  note,
  onChange,
  testId,
  value,
}: {
  label: string;
  note: string;
  onChange: (value: string) => void;
  testId: string;
  value: string;
}) {
  return (
    <label className="timeline-setup-money-field">
      <span>
        {label} <Info aria-hidden="true" />
      </span>
      <div className="timeline-setup-money-input timeline-setup-percent-input">
        <input
          aria-label={label}
          data-testid={testId}
          onBlur={(event) =>
            onChange(normalizePercentText(event.currentTarget.value))
          }
          onChange={(event) => onChange(event.currentTarget.value)}
          value={value.replace("%", "")}
        />
        <span>%</span>
      </div>
      {note ? <small>{note}</small> : null}
    </label>
  );
}

function BlueprintSummaryCard({
  budgetCents,
  cashCents,
  coPayBps,
  coPayCents,
  projectAddress,
  reimbursementCents,
  reimbursementBps,
  selectedTemplateTitle,
}: {
  budgetCents: number;
  cashCents: number;
  coPayBps: number;
  coPayCents: number;
  projectAddress: string;
  reimbursementCents: number;
  reimbursementBps: number;
  selectedTemplateTitle?: string;
}) {
  const formatMaybeCurrency = (value: number) =>
    Number.isFinite(value) ? formatCurrency(value) : "--";

  return (
    <div className="timeline-setup-side-card">
      <h2>Proposal Summary</h2>
      <dl>
        <div>
          <dt>Template</dt>
          <dd>{selectedTemplateTitle ?? "Not selected"}</dd>
        </div>
        <div>
          <dt>Total Budget</dt>
          <dd>{formatMaybeCurrency(budgetCents)}</dd>
        </div>
        <div>
          <dt>Max Cash on Hand</dt>
          <dd>{formatMaybeCurrency(cashCents)}</dd>
        </div>
        <div>
          <dt>Co-pay</dt>
          <dd>
            {formatBpsPercent(coPayBps)} · {formatMaybeCurrency(coPayCents)}
          </dd>
        </div>
        <div>
          <dt>Reimbursement / LTV</dt>
          <dd>
            {formatBpsPercent(reimbursementBps)} ·{" "}
            {formatMaybeCurrency(reimbursementCents)}
          </dd>
        </div>
        <div>
          <dt>Project Address</dt>
          <dd>{projectAddress || "Not provided"}</dd>
        </div>
      </dl>
    </div>
  );
}

function BlueprintAsideCard({
  children,
  icon,
}: {
  children: ReactNode;
  icon: ReactNode;
}) {
  return (
    <div className="timeline-setup-side-card timeline-setup-side-card-icon">
      <div className="timeline-setup-side-icon">{icon}</div>
      <div>{children}</div>
    </div>
  );
}

function BlueprintPermitUploader({
  files,
  onFilesChange,
}: {
  files: File[];
  onFilesChange: (files: File[]) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  const addFiles = (fileList: FileList | null) => {
    if (!fileList) {
      return;
    }
    const nextFiles = Array.from(fileList);
    onFilesChange([
      ...files,
      ...nextFiles.filter(
        (file) =>
          !files.some(
            (existing) =>
              existing.name === file.name && existing.size === file.size
          )
      ),
    ]);
  };

  const handleDrop = (event: DragEvent<HTMLButtonElement>) => {
    event.preventDefault();
    setIsDragging(false);
    addFiles(event.dataTransfer.files);
  };

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    addFiles(event.currentTarget.files);
    event.currentTarget.value = "";
  };

  return (
    <div className="timeline-permit-uploader">
      <input
        aria-label="Permit file input"
        className="sr-only"
        data-testid="timeline-setup-permit-input"
        multiple
        onChange={handleChange}
        ref={inputRef}
        type="file"
      />
      <button
        className={cn("timeline-permit-dropzone", isDragging && "is-dragging")}
        onClick={() => inputRef.current?.click()}
        onDragLeave={() => setIsDragging(false)}
        onDragOver={(event) => {
          event.preventDefault();
          setIsDragging(true);
        }}
        onDrop={handleDrop}
        type="button"
      >
        <FileText aria-hidden="true" />
        <strong>
          Drag & drop files here, or <span>browse</span>
        </strong>
        <small>PNG, JPG, PDF, etc. up to 5MB each</small>
      </button>
      {files.length > 0 ? (
        <div className="timeline-permit-file-list">
          {files.map((file) => (
            <span key={`${file.name}-${file.size}`}>
              <FileText aria-hidden="true" />
              {file.name}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function BudgetStep({
  cascadeBudgetEdits,
  cashText,
  contractorOptions,
  error,
  onBudgetFileImport,
  onBack,
  onCascadeBudgetEditsChange,
  onComplete,
  onRowsChange,
  projectAddress,
  permitFiles,
  rows,
  targetBudgetCents,
  templateTitle,
}: {
  cascadeBudgetEdits: boolean;
  cashText: string;
  contractorOptions: TimelineMilestoneWorksheetContractorOption[];
  error: string;
  onBudgetFileImport: (file: File) => Promise<BudgetWorkbookProposalDraft>;
  onBack: () => void;
  onCascadeBudgetEditsChange: (enabled: boolean) => void;
  onComplete: (options: { redirectToDurableRoute: boolean }) => void;
  onRowsChange: (rows: TimelineSetupMilestoneRow[]) => void;
  permitFiles: File[];
  projectAddress: string;
  rows: TimelineSetupMilestoneRow[];
  targetBudgetCents: number;
  templateTitle: string;
}) {
  const budgetImportInputRef = useRef<HTMLInputElement>(null);
  const [importState, setImportState] = useState<
    | { message: string; tone: "error" | "success" }
    | { message: ""; tone: "idle" }
  >({ message: "", tone: "idle" });
  const [isImporting, setIsImporting] = useState(false);

  const importBudgetFile = async (file: File | undefined) => {
    if (!file) {
      return;
    }

    setIsImporting(true);
    setImportState({ message: "", tone: "idle" });
    try {
      const draft = await onBudgetFileImport(file);
      setImportState({
        message: `Imported ${draft.milestones.length} milestones and ${draft.milestones.reduce(
          (count, milestone) => count + milestone.submilestones.length,
          0
        )} budget lines from ${file.name}.`,
        tone: "success",
      });
    } catch (caught) {
      setImportState({
        message:
          caught instanceof Error
            ? caught.message
            : "Budget workbook import failed.",
        tone: "error",
      });
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <TimelineMilestoneWorksheetTable
      cascadeBudgetEdits={cascadeBudgetEdits}
      cashText={cashText}
      contractorOptions={contractorOptions}
      error={error}
      leadingContent={
        <div className="grid gap-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <ProposalProgressSection step="budget" />
            <BuildPermitViewerDrawer
              permit={firstPermitDocument(
                permitFiles.map((file) => ({
                  documentType: "permit",
                  file,
                  fileName: file.name,
                  mimeType: file.type || "application/pdf",
                }))
              )}
              size="sm"
            />
          </div>
          <FramePanel className="flex flex-wrap items-center justify-between gap-3 p-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2 font-medium text-sm">
                <Upload className="size-4 text-muted-foreground" />
                Import milestone budget
              </div>
              <p className="mt-1 text-muted-foreground text-xs">
                Upload a DrawFlow budget .xlsx or exported Budget Import .csv to
                replace the worksheet with the milestone and sub-milestone
                breakdown.
              </p>
              {importState.message ? (
                <p
                  className={cn(
                    "mt-2 text-xs",
                    importState.tone === "error"
                      ? "text-destructive"
                      : "text-emerald-600"
                  )}
                  data-testid="timeline-budget-import-status"
                >
                  {importState.message}
                </p>
              ) : null}
            </div>
            <Button
              disabled={isImporting}
              onClick={() => budgetImportInputRef.current?.click()}
              size="sm"
              variant="outline"
            >
              {isImporting ? "Importing..." : "Upload budget"}
            </Button>
            <input
              accept=".xlsx,.xls,.csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
              aria-label="Upload milestone budget workbook"
              className="sr-only"
              data-testid="timeline-budget-import-input"
              disabled={isImporting}
              onChange={(event) => {
                const file = event.currentTarget.files?.[0];
                event.currentTarget.value = "";
                importBudgetFile(file);
              }}
              ref={budgetImportInputRef}
              type="file"
            />
          </FramePanel>
        </div>
      }
      mode="setup"
      onBack={onBack}
      onCascadeBudgetEditsChange={onCascadeBudgetEditsChange}
      onComplete={onComplete}
      onRowsChange={onRowsChange}
      projectAddress={projectAddress}
      rows={rows}
      showHeading
      targetBudgetCents={targetBudgetCents}
      templateTitle={templateTitle}
    />
  );
}

function StepRail({ step }: { step: SetupStep }) {
  const activeIndex = step === "template" ? 0 : 1;
  const steps = [
    "Project Setup",
    "Milestones & Budget",
    "Schedule & Draw Groups",
    "Review & Submit",
  ];

  return (
    <ol aria-label="Timeline setup steps" className="timeline-setup-step-rail">
      {steps.map((label, index) => (
        <li
          aria-current={index === activeIndex ? "step" : undefined}
          className={cn(
            index === activeIndex && "is-active",
            index < activeIndex && "is-complete"
          )}
          key={label}
        >
          <span>{String(index + 1).padStart(2, "0")}</span>
          <strong>{label}</strong>
        </li>
      ))}
    </ol>
  );
}

function CornerMarker({
  position,
}: {
  position: "bottom-left" | "bottom-right" | "top-left" | "top-right";
}) {
  return (
    <span aria-hidden="true" className={`timeline-corner-marker ${position}`} />
  );
}

export function TimelineSetupFlow({
  baseItems,
  contractorOptions = [],
  onComplete,
  settingsTemplates,
}: TimelineSetupFlowProps) {
  const reducedMotion = useReducedMotion();
  const templates = useMemo(
    () =>
      settingsTemplates && settingsTemplates.length > 0
        ? settingsTemplates
        : [buildDefaultTemplate(baseItems), ...secondaryTemplates()],
    [baseItems, settingsTemplates]
  );
  const defaultTemplate =
    templates.find((template) => template.isDefault) ?? templates[0];
  const [step, setStep] = useState<SetupStep>("template");
  const [selectedTemplateKey, setSelectedTemplateKey] = useState(
    defaultTemplate?.templateKey ?? ""
  );
  const [budgetText, setBudgetText] = useState(DEFAULT_SETUP_BUDGET_TEXT);
  const [cashText, setCashText] = useState(DEFAULT_SETUP_CASH_TEXT);
  const [coPayText, setCoPayText] = useState(DEFAULT_SETUP_CO_PAY_TEXT);
  const [cascadeBudgetEdits, setCascadeBudgetEdits] = useState(false);
  const [projectAddress, setProjectAddress] = useState(DEFAULT_SETUP_ADDRESS);
  const [permitFiles, setPermitFiles] = useState<File[]>([]);
  const [permitsSkipped, setPermitsSkipped] = useState(false);
  const [importedBudgetTitle, setImportedBudgetTitle] = useState("");
  const [rows, setRows] = useState<TimelineSetupMilestoneRow[]>(() =>
    defaultTemplate
      ? createRowsFromTemplate(
          defaultTemplate,
          parseCurrencyToCents(DEFAULT_SETUP_BUDGET_TEXT)
        )
      : []
  );
  const [error, setError] = useState("");
  const selectedTemplate =
    templates.find(
      (template) => template.templateKey === selectedTemplateKey
    ) ?? defaultTemplate;

  useEffect(() => {
    if (
      defaultTemplate &&
      !templates.some(
        (template) => template.templateKey === selectedTemplateKey
      )
    ) {
      setSelectedTemplateKey(defaultTemplate.templateKey);
      setRows(
        createRowsFromTemplate(
          defaultTemplate,
          parseCurrencyToCents(DEFAULT_SETUP_BUDGET_TEXT)
        )
      );
    }
  }, [defaultTemplate, selectedTemplateKey, templates]);

  useEffect(() => {
    window.scrollTo({ left: 0, top: 0 });
  }, []);

  const regenerateRows = (
    template: TimelineSetupTemplate,
    nextBudgetText: string
  ) => {
    const budgetCents = parseCurrencyToCents(nextBudgetText);

    if (!Number.isFinite(budgetCents) || budgetCents <= 0) {
      setError("Enter a positive total project budget before generating rows.");
      return false;
    }

    setRows(createRowsFromTemplate(template, budgetCents));
    setError("");
    return true;
  };

  const continueToBudget = () => {
    if (!selectedTemplate) {
      setError("Select a construction template.");
      return;
    }

    const budgetCents = validCurrencyCents(budgetText);
    const cashCents = validCurrencyCents(cashText);
    const coPayBps = validPercentBps(coPayText);

    if (!(Number.isFinite(budgetCents) && budgetCents > 0)) {
      setError("Enter a positive total project budget.");
      return;
    }

    if (!(Number.isFinite(cashCents) && cashCents > 0)) {
      setError("Enter a positive borrower working capital amount.");
      return;
    }

    if (
      !(
        Number.isFinite(coPayBps) &&
        coPayBps >= 0 &&
        coPayBps <= TOTAL_REIMBURSEMENT_BPS
      )
    ) {
      setError("Enter a co-pay percentage between 0% and 100%.");
      return;
    }

    if (regenerateRows(selectedTemplate, budgetText)) {
      setStep("budget");
    }
  };

  const completeSetup = ({
    redirectToDurableRoute,
  }: {
    redirectToDurableRoute: boolean;
  }) => {
    const invalidRow = rows.find((row) => {
      const budget = rowBudgetCents(row);
      const duration = rowDurationDays(row);

      return !(
        row.excluded ||
        (Number.isFinite(budget) &&
          budget > 0 &&
          Number.isFinite(duration) &&
          duration > 0)
      );
    });
    const cashCents = validCurrencyCents(cashText);
    const coPayBps = validPercentBps(coPayText);

    if (!rows.some((row) => !row.excluded)) {
      setError("Keep at least one milestone active.");
      return;
    }

    if (invalidRow) {
      setError(`${invalidRow.name} needs a positive budget and duration.`);
      return;
    }

    if (!(Number.isFinite(cashCents) && cashCents > 0)) {
      setError("Enter positive borrower working capital.");
      return;
    }

    if (
      !(
        Number.isFinite(coPayBps) &&
        coPayBps >= 0 &&
        coPayBps <= TOTAL_REIMBURSEMENT_BPS
      )
    ) {
      setError("Enter a co-pay percentage between 0% and 100%.");
      return;
    }

    const budgetCents = setupRowsBudgetCents(rows);
    const totalBudget = rows
      .filter((row) => !row.excluded)
      .reduce((sum, row) => sum + Math.round(rowBudgetCents(row) / 100), 0);
    const borrowerCoPayBps = normalizeBorrowerCoPayBps(coPayBps);
    const reimbursementBps = getReimbursementBps(borrowerCoPayBps);
    const borrowerCoPayCents = Math.round(
      (budgetCents * borrowerCoPayBps) / TOTAL_REIMBURSEMENT_BPS
    );
    const reimbursableBudgetCents = Math.round(
      (budgetCents * reimbursementBps) / TOTAL_REIMBURSEMENT_BPS
    );
    const items = buildTimelineItemsFromSetupRows(rows, borrowerCoPayBps);
    const planningPayload = buildPlanningPayloadFromSetupRows(rows);
    const activeItem = items[0];

    setError("");
    onComplete({
      activeItemId: activeItem?.id ?? "",
      borrowerCoPayBps,
      borrowerCoPayCents,
      contractorAssignments: planningPayload.contractorAssignments,
      currentDay: GENERATED_TIMELINE_CURRENT_DAY,
      includedCount: items.length,
      items,
      permitFiles,
      costItems: planningPayload.costItems,
      projectAddress: resolveTimelineSetupAddress(projectAddress),
      redirectToDurableRoute,
      reimbursableBudgetCents,
      reimbursementBps,
      startingCash: Math.round(cashCents / 100),
      templateKey: selectedTemplate?.templateKey ?? "",
      templateTitle:
        importedBudgetTitle || selectedTemplate?.title || "Timeline plan",
      totalBudget,
    });
  };

  const selectTemplate = (templateKey: string) => {
    setSelectedTemplateKey(templateKey);
    setImportedBudgetTitle("");
    const nextTemplate = templates.find(
      (template) => template.templateKey === templateKey
    );

    if (nextTemplate) {
      regenerateRows(nextTemplate, budgetText);
    }
  };

  const importBudgetFile = async (file: File) => {
    const draft = await parseBudgetWorkbookFile(file);
    const totalBudgetCents = Math.round(draft.totalBudget * 100);
    const borrowerCoPayBps = normalizeBorrowerCoPayBps(
      Math.round(
        ((draft.totalBudget - draft.totalDrawableAmount) /
          Math.max(1, draft.totalBudget)) *
          TOTAL_REIMBURSEMENT_BPS
      )
    );

    setBudgetText(formatCurrency(totalBudgetCents));
    setCoPayText(formatBpsPercent(borrowerCoPayBps));
    setImportedBudgetTitle(draft.buildName);
    setRows(budgetWorkbookDraftToSetupRows(draft));
    setError("");

    return draft;
  };

  return (
    <div className="timeline-setup-shell">
      <CornerMarker position="top-left" />
      <CornerMarker position="top-right" />
      <CornerMarker position="bottom-left" />
      <CornerMarker position="bottom-right" />
      <motion.div
        animate={{ opacity: 1, y: 0 }}
        className="timeline-setup-frame"
        initial={reducedMotion ? false : { opacity: 0, y: 16 }}
        transition={{
          duration: reducedMotion ? 0 : 0.32,
          ease: [0.22, 1, 0.36, 1],
        }}
      >
        <header className="timeline-setup-header">
          <div>
            <span>DrawFlow timeline setup</span>
            <strong>Reimbursement roadmap generator</strong>
          </div>
          <span>Saved</span>
        </header>

        {step === "template" ? (
          <TemplateStep
            budgetText={budgetText}
            cashText={cashText}
            coPayText={coPayText}
            error={error}
            onBudgetTextChange={(value) => {
              setBudgetText(value);
              setError("");
            }}
            onCashTextChange={(value) => {
              setCashText(value);
              setError("");
            }}
            onContinue={continueToBudget}
            onCoPayTextChange={(value) => {
              setCoPayText(value);
              setError("");
            }}
            onPermitFilesChange={setPermitFiles}
            onPermitSkipChange={setPermitsSkipped}
            onProjectAddressChange={setProjectAddress}
            onTemplateSelect={selectTemplate}
            permitFiles={permitFiles}
            permitsSkipped={permitsSkipped}
            projectAddress={projectAddress}
            selectedTemplateKey={selectedTemplateKey}
            templates={templates}
          />
        ) : (
          <BudgetStep
            cascadeBudgetEdits={cascadeBudgetEdits}
            cashText={cashText}
            contractorOptions={contractorOptions}
            error={error}
            onBack={() => setStep("template")}
            onBudgetFileImport={importBudgetFile}
            onCascadeBudgetEditsChange={setCascadeBudgetEdits}
            onComplete={completeSetup}
            onRowsChange={(nextRows) => {
              setRows(nextRows);
              setBudgetText(formatCurrency(setupRowsBudgetCents(nextRows)));
              setError("");
            }}
            permitFiles={permitFiles}
            projectAddress={projectAddress}
            rows={rows}
            targetBudgetCents={validCurrencyCents(budgetText)}
            templateTitle={
              importedBudgetTitle || selectedTemplate?.title || "Timeline plan"
            }
          />
        )}
      </motion.div>
    </div>
  );
}
