"use client";

import { restrictToVerticalAxis } from "@dnd-kit/modifiers";
import { arrayMove } from "@dnd-kit/sortable";
import {
  type ColumnDef,
  type ExpandedState,
  flexRender,
  getCoreRowModel,
  getExpandedRowModel,
  useReactTable,
} from "@tanstack/react-table";
import {
  Check,
  ChevronDown,
  ChevronRight,
  ClipboardCheck,
  FileText,
  GripVertical,
  Info,
  Plus,
  ShieldCheck,
  Trash2,
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
import {
  Sortable,
  SortableItem,
  SortableItemHandle,
} from "#/components/reui/sortable.tsx";
import type { TimelineItem } from "#/components/roadmap/AnimatedCurvedTimeline.tsx";
import {
  Autocomplete,
  AutocompleteGroup,
  AutocompleteGroupLabel,
  AutocompleteInput,
  AutocompleteList,
  AutocompletePopup,
} from "#/components/ui/autocomplete.tsx";
import { Badge } from "#/components/ui/badge.tsx";
import { Button } from "#/components/ui/button.tsx";
import { Switch } from "#/components/ui/switch.tsx";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "#/components/ui/table.tsx";
import { cn } from "#/lib/utils.ts";
import {
  allocateBudgetCents,
  formatCurrency,
  parseCurrencyToCents,
} from "../../../features/builder-proposal-demo/template-helpers.ts";
import {
  DEFAULT_DRAW_REVIEW_LAG_DAYS,
  normalizeMilestoneTimelineItems,
} from "./-timeline-milestone-schedule.ts";
import type {
  DemoMilestone,
  IsometricIconKey,
} from "./-timeline-share-snapshot.ts";
import "./-timeline-setup-flow.css";

const DEFAULT_SETUP_BUDGET_TEXT = "$1,250,000";
const DEFAULT_SETUP_CASH_TEXT = "$400,000";
const DEFAULT_SETUP_CO_PAY_TEXT = "$0";
const DEFAULT_SETUP_ADDRESS = "Hamilton, ON";
const GENERATED_TIMELINE_CURRENT_DAY = 0;
const DEFAULT_HANDOFF_GAP_DAYS = 10;
const DEFAULT_NEW_MILESTONE_BUDGET_TEXT = "$0";
const DEFAULT_NEW_MILESTONE_DURATION_TEXT = "7";
const DEFAULT_NEW_SUB_MILESTONE_BUDGET_TEXT = "$0";
const DEFAULT_NEW_SUB_MILESTONE_DURATION_TEXT = "1";
const STRIP_LEADING_DOLLAR = /^\$/;
const subMilestoneDescriptions = [
  "Basis, scope, and quantities",
  "Field completion target",
  "Evidence package requirement",
  "Lender review checkpoint",
];

interface SubMilestoneBankItem {
  budgetText?: string;
  category: string;
  description: string;
  durationText: string;
  name: string;
}

const SUB_MILESTONE_BANK: SubMilestoneBankItem[] = [
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
  multiplex_build:
    "/drawflow-template-thumbnails/multiplex-build-blueprint.png",
  single_family_full_build:
    "/drawflow-template-thumbnails/single-family-full-build-blueprint.png",
  single_family_renovation:
    "/drawflow-template-thumbnails/single-family-renovation-blueprint.png",
};

type SetupStep = "template" | "budget";

interface TimelineSetupTemplate {
  description: string;
  isDefault?: boolean;
  rows: TimelineSetupPreset[];
  summary: string;
  templateKey: string;
  title: string;
}

interface TimelineSetupPreset {
  baseItemId?: string;
  dependencyKeys: string[];
  durationDays: number;
  icon: IsometricIconKey;
  key: string;
  name: string;
  percentageBps: number;
  subMilestones: string[];
  type: string;
}

export interface TimelineSetupMilestoneRow extends TimelineSetupPreset {
  budgetText: string;
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
  currentDay: number;
  includedCount: number;
  items: TimelineItem<DemoMilestone>[];
  startingCash: number;
  templateTitle: string;
  totalBudget: number;
}

export interface TimelineSetupFlowProps {
  baseItems: TimelineItem<DemoMilestone>[];
  onComplete: (result: TimelineSetupResult) => void;
}

function rowBudgetCents(row: TimelineSetupMilestoneRow) {
  const parsed = parseCurrencyToCents(row.budgetText);

  return Number.isFinite(parsed) ? Math.max(0, parsed) : Number.NaN;
}

function rowDurationDays(row: TimelineSetupMilestoneRow) {
  const parsed = Number(row.durationText.replace(/^T/i, ""));

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

function normalizeDurationText(value: string) {
  const parsed = Number(value.replace(/^T/i, ""));

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

function buildSubMilestoneDetails(
  row: TimelineSetupPreset,
  budgetCents: number,
  durationDays: number
): TimelineSetupSubMilestone[] {
  const names =
    row.subMilestones.length > 0 ? row.subMilestones : ["Initial scope"];
  const count = Math.max(1, names.length);
  const baseBudgetCents = Math.floor(Math.max(0, budgetCents) / count);
  const budgetRemainderCents =
    Math.max(0, budgetCents) - baseBudgetCents * count;
  const baseDurationDays = Math.floor(Math.max(1, durationDays) / count);
  const durationRemainderDays =
    Math.max(1, durationDays) - baseDurationDays * count;

  return names.map((name, index) => ({
    budgetText: formatCurrency(
      baseBudgetCents + (index < budgetRemainderCents ? 1 : 0)
    ),
    description:
      subMilestoneDescriptions[index % subMilestoneDescriptions.length],
    durationText: String(
      Math.max(1, baseDurationDays + (index < durationRemainderDays ? 1 : 0))
    ),
    id: `${row.key}-${slugifySubMilestone(name)}-${index}`,
    name,
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

function createCustomMilestoneRow({
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

function formatRowType(value: string) {
  return value
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replaceAll("_", " ")
    .toLowerCase();
}

function buildDefaultTemplate(baseItems: TimelineItem<DemoMilestone>[]) {
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

function createRowsFromTemplate(
  template: TimelineSetupTemplate,
  budgetCents: number
): TimelineSetupMilestoneRow[] {
  const allocations = allocateBudgetCents(budgetCents, template.rows);

  return template.rows.map((row, order) => {
    const budgetCents = allocations[order] ?? 0;

    return {
      ...row,
      budgetText: formatCurrency(budgetCents),
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
  rows: TimelineSetupMilestoneRow[]
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
          drawX: startDay + normalizedDuration + DEFAULT_DRAW_REVIEW_LAG_DAYS,
          durationDays: normalizedDuration,
          evidence: status === "ready" ? "Ready to start" : "Not started",
          icon: row.icon,
          name: row.name,
          policy:
            status === "ready" ? "Planning handoff" : "Upcoming",
          status,
          subMilestones: row.subMilestones,
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
  const coPayCents = validCurrencyCents(coPayText);
  const reimbursementCents =
    Number.isFinite(budgetCents) && Number.isFinite(coPayCents)
      ? Math.max(0, budgetCents - coPayCents)
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
          <CurrencySetupField
            label="Co-pay"
            note="Co-pay is the portion paid out of pocket before reimbursement planning."
            onChange={onCoPayTextChange}
            testId="timeline-setup-co-pay-input"
            value={coPayText}
          />
        </BlueprintPanel>

        <BlueprintPanel>
          <label className="timeline-setup-address-field">
            <span>
              Project Address <em>(optional)</em>
            </span>
            <input
              aria-label="Project address"
              data-testid="timeline-setup-address-input"
              onChange={(event) =>
                onProjectAddressChange(event.currentTarget.value)
              }
              placeholder="Enter project address"
              value={projectAddress}
            />
          </label>
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
          >
            {error}
          </p>
        ) : null}
      </section>

      <aside className="timeline-setup-sidecar">
        <BlueprintSummaryCard
          budgetCents={budgetCents}
          cashCents={cashCents}
          coPayCents={coPayCents}
          projectAddress={projectAddress}
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

function BlueprintSummaryCard({
  budgetCents,
  cashCents,
  coPayCents,
  projectAddress,
  reimbursementCents,
  selectedTemplateTitle,
}: {
  budgetCents: number;
  cashCents: number;
  coPayCents: number;
  projectAddress: string;
  reimbursementCents: number;
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
          <dd>{formatMaybeCurrency(coPayCents)}</dd>
        </div>
        <div>
          <dt>Reimbursement Scope</dt>
          <dd>{formatMaybeCurrency(reimbursementCents)}</dd>
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

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
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
      <div
        className={cn("timeline-permit-dropzone", isDragging && "is-dragging")}
        onClick={() => inputRef.current?.click()}
        onDragLeave={() => setIsDragging(false)}
        onDragOver={(event) => {
          event.preventDefault();
          setIsDragging(true);
        }}
        onDrop={handleDrop}
        role="button"
        tabIndex={0}
      >
        <FileText aria-hidden="true" />
        <strong>
          Drag & drop files here, or <span>browse</span>
        </strong>
        <small>PNG, JPG, PDF, etc. up to 5MB each</small>
      </div>
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

function BlueprintMilestoneIcon({
  icon,
  name,
  testId,
}: {
  icon: IsometricIconKey;
  name: string;
  testId?: string;
}) {
  const sources: Record<IsometricIconKey, string> = {
    change: "/drawflow-milestone-blueprint-icons/change.png",
    closeout: "/drawflow-milestone-blueprint-icons/closeout.png",
    drywall: "/drawflow-milestone-blueprint-icons/drywall.png",
    exterior: "/drawflow-milestone-blueprint-icons/exterior.png",
    finishes: "/drawflow-milestone-blueprint-icons/finishes.png",
    foundation: "/drawflow-milestone-blueprint-icons/foundation.png",
    framing: "/drawflow-milestone-blueprint-icons/framing.png",
    roughIn: "/drawflow-milestone-blueprint-icons/rough-in.png",
  };

  return (
    <span className="timeline-blueprint-icon-shell">
      <img
        alt={`${name} blueprint milestone icon`}
        className="timeline-blueprint-icon"
        data-icon={icon}
        data-testid={testId}
        draggable={false}
        loading="lazy"
        src={sources[icon]}
      />
    </span>
  );
}

function BlueprintInput({
  align = "left",
  className,
  label,
  onBlur,
  onChange,
  testId,
  value,
}: {
  align?: "left" | "center" | "right";
  className?: string;
  label: string;
  onBlur: () => void;
  onChange: (value: string) => void;
  testId: string;
  value: string;
}) {
  return (
    <input
      aria-label={label}
      className={cn("timeline-blueprint-input", className)}
      data-align={align}
      data-testid={testId}
      onBlur={onBlur}
      onChange={(event) => onChange(event.currentTarget.value)}
      value={value}
    />
  );
}

function matchesSubMilestoneBankQuery(
  item: SubMilestoneBankItem,
  query: string
) {
  const normalizedQuery = query.trim().toLowerCase();

  if (!normalizedQuery) {
    return true;
  }

  return [item.name, item.category, item.description].some((value) =>
    value.toLowerCase().includes(normalizedQuery)
  );
}

function SubMilestoneBankPicker({
  existingNames,
  onAdd,
  rowKey,
}: {
  existingNames: string[];
  onAdd: (item: SubMilestoneBankItem) => void;
  rowKey: string;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const existingNameSet = useMemo(
    () => new Set(existingNames.map((name) => name.trim().toLowerCase())),
    [existingNames]
  );
  const availableItems = useMemo(
    () =>
      SUB_MILESTONE_BANK.filter(
        (item) => !existingNameSet.has(item.name.toLowerCase())
      ),
    [existingNameSet]
  );
  const filteredItems = useMemo(
    () =>
      availableItems
        .filter((item) => matchesSubMilestoneBankQuery(item, query))
        .slice(0, 36),
    [availableItems, query]
  );
  const groupedItems = useMemo(() => {
    const groups = new Map<string, SubMilestoneBankItem[]>();

    for (const item of filteredItems) {
      groups.set(item.category, [...(groups.get(item.category) ?? []), item]);
    }

    return [...groups.entries()];
  }, [filteredItems]);
  const customName = sanitizeSubMilestoneName(query);
  const normalizedCustomName = customName.toLowerCase();
  const canCreate =
    query.trim().length > 1 &&
    !existingNameSet.has(normalizedCustomName) &&
    !SUB_MILESTONE_BANK.some(
      (item) => item.name.toLowerCase() === normalizedCustomName
    );

  const addItem = (item: SubMilestoneBankItem) => {
    onAdd(item);
    setQuery("");
    setOpen(false);
  };

  return (
    <div className="timeline-submilestone-bank">
      <Autocomplete
        autoHighlight="always"
        keepHighlight
        onOpenChange={setOpen}
        onValueChange={(nextQuery) => {
          setQuery(nextQuery);
          setOpen(true);
        }}
        open={open}
        openOnInputClick
        value={query}
      >
        <AutocompleteInput
          aria-label="Add sub-milestone from bank"
          className="timeline-submilestone-bank-input"
          data-testid={`timeline-setup-submilestone-bank-input-${rowKey}`}
          onFocus={() => setOpen(true)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && canCreate) {
              event.preventDefault();
              addItem({
                budgetText: DEFAULT_NEW_SUB_MILESTONE_BUDGET_TEXT,
                category: "Custom",
                description: "Custom scope checkpoint",
                durationText: DEFAULT_NEW_SUB_MILESTONE_DURATION_TEXT,
                name: customName,
              });
            }
          }}
          placeholder="Add from sub-milestone bank..."
          showClear
          showTrigger
          size="sm"
        />
        <AutocompletePopup className="timeline-submilestone-bank-popup">
          <AutocompleteList className="timeline-submilestone-bank-list">
            {groupedItems.map(([category, items]) => (
              <AutocompleteGroup key={category}>
                <AutocompleteGroupLabel className="timeline-submilestone-bank-label">
                  {category}
                </AutocompleteGroupLabel>
                {items.map((item) => (
                  <button
                    className="timeline-submilestone-bank-item"
                    data-testid={`timeline-setup-submilestone-bank-item-${slugifySubMilestone(item.name)}`}
                    key={item.name}
                    onClick={() => addItem(item)}
                    onMouseDown={(event) => event.preventDefault()}
                    type="button"
                  >
                    <span>
                      <strong>{item.name}</strong>
                      <small>{item.description}</small>
                    </span>
                    <em>T{item.durationText}</em>
                  </button>
                ))}
              </AutocompleteGroup>
            ))}
            {canCreate ? (
              <button
                className="timeline-submilestone-bank-item is-create"
                data-testid={`timeline-setup-submilestone-bank-create-${rowKey}`}
                onClick={() =>
                  addItem({
                    budgetText: DEFAULT_NEW_SUB_MILESTONE_BUDGET_TEXT,
                    category: "Custom",
                    description: "Custom scope checkpoint",
                    durationText: DEFAULT_NEW_SUB_MILESTONE_DURATION_TEXT,
                    name: customName,
                  })
                }
                onMouseDown={(event) => event.preventDefault()}
                type="button"
              >
                <span>
                  <strong>Create "{customName}"</strong>
                  <small>Add a custom reimbursement checkpoint</small>
                </span>
                <Plus aria-hidden="true" />
              </button>
            ) : null}
            {filteredItems.length === 0 && !canCreate ? (
              <div className="timeline-submilestone-bank-empty">
                No available bank item matches this search.
              </div>
            ) : null}
          </AutocompleteList>
        </AutocompletePopup>
      </Autocomplete>
    </div>
  );
}

function SubMilestoneEditor({
  activeSubMilestoneId,
  onActiveSubMilestoneChange,
  onAddSubMilestone,
  onRemoveSubMilestone,
  onUpdateSubMilestone,
  row,
}: {
  activeSubMilestoneId?: string;
  onActiveSubMilestoneChange: (subMilestoneId: string) => void;
  onAddSubMilestone: (item?: SubMilestoneBankItem) => void;
  onRemoveSubMilestone: (subMilestoneId: string) => void;
  onUpdateSubMilestone: (
    subMilestoneId: string,
    patch: Partial<TimelineSetupSubMilestone>
  ) => void;
  row: TimelineSetupMilestoneRow;
}) {
  const subMilestones = row.subMilestoneDetails;
  const activeSubMilestone =
    subMilestones.find((detail) => detail.id === activeSubMilestoneId) ??
    subMilestones[0];

  return (
    <div className="timeline-submilestone-editor">
      <section
        aria-label={`${row.name} sub-milestones`}
        className="timeline-submilestone-list-pane"
      >
        <div className="timeline-submilestone-editor-heading">
          <div>
            <Badge className="timeline-blueprint-mini-badge" variant="outline">
              {subMilestones.length} sub-milestones
            </Badge>
            <p>{row.name}</p>
          </div>
          <SubMilestoneBankPicker
            existingNames={subMilestones.map((subMilestone) =>
              sanitizeSubMilestoneName(subMilestone.name)
            )}
            onAdd={onAddSubMilestone}
            rowKey={row.key}
          />
        </div>

        <div className="timeline-submilestone-card-list">
          {subMilestones.map((subMilestone) => {
            const selected = subMilestone.id === activeSubMilestone?.id;

            return (
              <article
                className="timeline-submilestone-card"
                data-selected={selected ? "true" : undefined}
                data-testid={`timeline-setup-submilestone-card-${subMilestone.id}`}
                key={subMilestone.id}
              >
                <button
                  aria-pressed={selected}
                  className="timeline-submilestone-card-main"
                  onClick={() => onActiveSubMilestoneChange(subMilestone.id)}
                  type="button"
                >
                  <span className="timeline-submilestone-card-title">
                    <strong>
                      {sanitizeSubMilestoneName(subMilestone.name)}
                    </strong>
                    <small>{subMilestone.description}</small>
                  </span>
                  <span className="timeline-submilestone-card-metrics">
                    <span>
                      <small>Budget</small>
                      <strong>{subMilestone.budgetText}</strong>
                    </span>
                    <span>
                      <small>Duration</small>
                      <strong>T{subMilestone.durationText}</strong>
                    </span>
                  </span>
                </button>
                <button
                  aria-label={`Remove ${sanitizeSubMilestoneName(subMilestone.name)}`}
                  className="timeline-submilestone-remove"
                  data-testid={`timeline-setup-submilestone-remove-${subMilestone.id}`}
                  onClick={() => onRemoveSubMilestone(subMilestone.id)}
                  type="button"
                >
                  <Trash2 aria-hidden="true" />
                </button>
              </article>
            );
          })}
        </div>
      </section>

      <section
        aria-label="Selected sub-milestone details"
        className="timeline-submilestone-detail-pane"
      >
        {activeSubMilestone ? (
          <div
            className="timeline-submilestone-detail-body"
            key={activeSubMilestone.id}
          >
            <div className="timeline-submilestone-detail-header">
              <span>Selected sub-milestone</span>
              <strong>
                {sanitizeSubMilestoneName(activeSubMilestone.name)}
              </strong>
            </div>
            <label className="timeline-submilestone-detail-field is-wide">
              <span>Name</span>
              <input
                aria-label="Sub-milestone name"
                data-testid={`timeline-setup-submilestone-name-${activeSubMilestone.id}`}
                onChange={(event) =>
                  onUpdateSubMilestone(activeSubMilestone.id, {
                    name: event.currentTarget.value,
                  })
                }
                value={activeSubMilestone.name}
              />
            </label>
            <label className="timeline-submilestone-detail-field is-wide">
              <span>Scope note</span>
              <textarea
                aria-label="Sub-milestone scope note"
                data-testid={`timeline-setup-submilestone-description-${activeSubMilestone.id}`}
                onChange={(event) =>
                  onUpdateSubMilestone(activeSubMilestone.id, {
                    description: event.currentTarget.value,
                  })
                }
                value={activeSubMilestone.description}
              />
            </label>
            <div className="timeline-submilestone-detail-grid">
              <label className="timeline-submilestone-detail-field">
                <span>Budget</span>
                <BlueprintInput
                  align="right"
                  className="timeline-submilestone-detail-input"
                  label="Sub-milestone budget"
                  onBlur={() =>
                    onUpdateSubMilestone(activeSubMilestone.id, {
                      budgetText: normalizeCurrencyText(
                        activeSubMilestone.budgetText
                      ),
                    })
                  }
                  onChange={(budgetText) =>
                    onUpdateSubMilestone(activeSubMilestone.id, { budgetText })
                  }
                  testId={`timeline-setup-submilestone-budget-${activeSubMilestone.id}`}
                  value={activeSubMilestone.budgetText}
                />
              </label>
              <label className="timeline-submilestone-detail-field">
                <span>Duration</span>
                <BlueprintInput
                  align="center"
                  className="timeline-submilestone-detail-input"
                  label="Sub-milestone duration"
                  onBlur={() =>
                    onUpdateSubMilestone(activeSubMilestone.id, {
                      durationText: normalizeDurationText(
                        activeSubMilestone.durationText
                      ),
                    })
                  }
                  onChange={(durationText) =>
                    onUpdateSubMilestone(activeSubMilestone.id, {
                      durationText: durationText
                        .replace(/^T/i, "")
                        .replace(/\D/g, ""),
                    })
                  }
                  testId={`timeline-setup-submilestone-duration-${activeSubMilestone.id}`}
                  value={`T${activeSubMilestone.durationText}`}
                />
              </label>
            </div>
            <button
              className="timeline-submilestone-detail-remove"
              data-testid={`timeline-setup-submilestone-detail-remove-${activeSubMilestone.id}`}
              onClick={() => onRemoveSubMilestone(activeSubMilestone.id)}
              type="button"
            >
              <Trash2 aria-hidden="true" />
              Remove sub-milestone
            </button>
          </div>
        ) : (
          <div className="timeline-submilestone-empty">
            <strong>No sub-milestones</strong>
            <button
              onClick={() =>
                onAddSubMilestone({
                  category: "Custom",
                  description: "Custom scope checkpoint",
                  durationText: DEFAULT_NEW_SUB_MILESTONE_DURATION_TEXT,
                  name: "New sub-milestone",
                })
              }
              type="button"
            >
              <Plus aria-hidden="true" />
              Add sub-milestone
            </button>
          </div>
        )}
      </section>
    </div>
  );
}

function DragHandle({
  id,
  name,
  onMove,
}: {
  id: string;
  name: string;
  onMove: (direction: "down" | "up") => void;
}) {
  return (
    <SortableItemHandle
      aria-label={`Drag ${name}`}
      className="timeline-blueprint-drag-handle"
      data-testid={`timeline-setup-row-drag-${id}`}
      onKeyDown={(event) => {
        if (event.key === "ArrowUp") {
          event.preventDefault();
          onMove("up");
        }

        if (event.key === "ArrowDown") {
          event.preventDefault();
          onMove("down");
        }
      }}
      render={<button type="button" />}
    >
      <GripVertical aria-hidden="true" />
    </SortableItemHandle>
  );
}

function BudgetStep({
  cashText,
  error,
  onBack,
  onComplete,
  onRowsChange,
  rows,
  templateTitle,
}: {
  cashText: string;
  error: string;
  onBack: () => void;
  onComplete: () => void;
  onRowsChange: (rows: TimelineSetupMilestoneRow[]) => void;
  rows: TimelineSetupMilestoneRow[];
  templateTitle: string;
}) {
  const [expanded, setExpanded] = useState<ExpandedState>(() =>
    rows[0]?.key ? { [rows[0].key]: true } : {}
  );
  const [activeSubMilestoneByRow, setActiveSubMilestoneByRow] = useState<
    Record<string, string>
  >(() =>
    rows[0]?.key && rows[0].subMilestoneDetails[0]?.id
      ? { [rows[0].key]: rows[0].subMilestoneDetails[0].id }
      : {}
  );
  const [customMilestoneName, setCustomMilestoneName] = useState("");
  const moveRowByKey = (rowKey: string, direction: "down" | "up") => {
    const currentIndex = rows.findIndex((row) => row.key === rowKey);
    const nextIndex = direction === "up" ? currentIndex - 1 : currentIndex + 1;

    if (
      currentIndex < 0 ||
      nextIndex < 0 ||
      nextIndex >= rows.length ||
      currentIndex === nextIndex
    ) {
      return;
    }

    onRowsChange(
      arrayMove(rows, currentIndex, nextIndex).map((row, order) => ({
        ...row,
        order,
      }))
    );
  };

  const updateRow = (
    rowKey: string,
    patch: Partial<TimelineSetupMilestoneRow>
  ) => {
    onRowsChange(
      rows.map((row) => (row.key === rowKey ? { ...row, ...patch } : row))
    );
  };
  const updateSubMilestone = (
    rowKey: string,
    subMilestoneId: string,
    patch: Partial<TimelineSetupSubMilestone>
  ) => {
    onRowsChange(
      rows.map((row) => {
        if (row.key !== rowKey) {
          return row;
        }

        const subMilestoneDetails = row.subMilestoneDetails.map((detail) =>
          detail.id === subMilestoneId ? { ...detail, ...patch } : detail
        );

        return withSubMilestoneDetails(row, subMilestoneDetails);
      })
    );
    setActiveSubMilestoneByRow((current) => ({
      ...current,
      [rowKey]: subMilestoneId,
    }));
  };
  const addSubMilestone = (rowKey: string, item?: SubMilestoneBankItem) => {
    const row = rows.find((candidate) => candidate.key === rowKey);

    if (!row) {
      return;
    }

    const nextIndex = row.subMilestoneDetails.length + 1;
    const nextName = item?.name ?? `New sub-milestone ${nextIndex}`;
    const nextSubMilestone: TimelineSetupSubMilestone = {
      budgetText: item?.budgetText ?? DEFAULT_NEW_SUB_MILESTONE_BUDGET_TEXT,
      description: item?.description ?? "Define scope checkpoint",
      durationText:
        item?.durationText ?? DEFAULT_NEW_SUB_MILESTONE_DURATION_TEXT,
      id: `${rowKey}-custom-${Date.now()}`,
      name: nextName,
    };

    onRowsChange(
      rows.map((candidate) =>
        candidate.key === rowKey
          ? withSubMilestoneDetails(candidate, [
              ...candidate.subMilestoneDetails,
              nextSubMilestone,
            ])
          : candidate
      )
    );
    setActiveSubMilestoneByRow((current) => ({
      ...current,
      [rowKey]: nextSubMilestone.id,
    }));
  };
  const removeSubMilestone = (rowKey: string, subMilestoneId: string) => {
    let nextActiveSubMilestoneId = "";

    onRowsChange(
      rows.map((row) => {
        if (row.key !== rowKey) {
          return row;
        }

        const currentIndex = row.subMilestoneDetails.findIndex(
          (detail) => detail.id === subMilestoneId
        );
        const subMilestoneDetails = row.subMilestoneDetails.filter(
          (detail) => detail.id !== subMilestoneId
        );
        nextActiveSubMilestoneId =
          subMilestoneDetails[Math.max(0, currentIndex - 1)]?.id ??
          subMilestoneDetails[0]?.id ??
          "";

        return withSubMilestoneDetails(row, subMilestoneDetails);
      })
    );
    setActiveSubMilestoneByRow((current) => ({
      ...current,
      [rowKey]: nextActiveSubMilestoneId,
    }));
  };
  const addCustomMilestone = () => {
    const fallbackCount =
      rows.filter((row) => row.type === "custom").length + 1;
    const name =
      customMilestoneName.trim() || `Custom milestone ${fallbackCount}`;
    const nextRow = createCustomMilestoneRow({
      name,
      order: rows.length,
      rows,
    });

    onRowsChange([...rows, nextRow]);
    setExpanded((current) =>
      current === true ? true : { ...current, [nextRow.key]: true }
    );
    setActiveSubMilestoneByRow((current) => ({
      ...current,
      [nextRow.key]: nextRow.subMilestoneDetails[0]?.id ?? "",
    }));
    setCustomMilestoneName("");
  };

  const columns = useMemo<ColumnDef<TimelineSetupMilestoneRow>[]>(
    () => [
      {
        cell: ({ row }) => (
          <div
            className="timeline-blueprint-name-cell"
            data-testid={`timeline-setup-row-name-${row.original.key}`}
          >
            <DragHandle
              id={row.original.key}
              name={row.original.name}
              onMove={(direction) => moveRowByKey(row.original.key, direction)}
            />
            <BlueprintMilestoneIcon
              icon={row.original.icon}
              name={row.original.name}
              testId={`timeline-setup-row-icon-${row.original.key}`}
            />
            <span className="timeline-blueprint-name-copy">
              <strong>{row.original.name}</strong>
              <small>{formatRowType(row.original.type)}</small>
            </span>
          </div>
        ),
        header: "Name",
        id: "name",
        size: 380,
      },
      {
        cell: ({ row }) => (
          <div className="timeline-blueprint-sub-cell">
            <Badge className="timeline-blueprint-mini-badge" variant="outline">
              {row.original.subMilestoneDetails.length} sub-milestones
            </Badge>
            <span>{row.original.subMilestones.slice(0, 3).join(", ")}</span>
          </div>
        ),
        header: "Submilestones",
        id: "subMilestones",
        size: 330,
      },
      {
        cell: ({ row }) => (
          <BlueprintInput
            align="right"
            className="timeline-blueprint-money"
            label={`${row.original.name} budget`}
            onBlur={() =>
              updateRow(row.original.key, {
                budgetText: normalizeCurrencyText(row.original.budgetText),
              })
            }
            onChange={(budgetText) =>
              updateRow(row.original.key, { budgetText })
            }
            testId={`timeline-setup-row-budget-${row.original.key}`}
            value={row.original.budgetText}
          />
        ),
        header: "Budget",
        id: "budget",
        size: 150,
      },
      {
        cell: ({ row }) => (
          <BlueprintInput
            align="center"
            className="timeline-blueprint-duration"
            label={`${row.original.name} duration`}
            onBlur={() =>
              updateRow(row.original.key, {
                durationText: normalizeDurationText(row.original.durationText),
              })
            }
            onChange={(durationText) =>
              updateRow(row.original.key, {
                durationText: durationText
                  .replace(/^T/i, "")
                  .replace(/\D/g, ""),
              })
            }
            testId={`timeline-setup-row-duration-${row.original.key}`}
            value={`T${row.original.durationText}`}
          />
        ),
        header: "Duration",
        id: "duration",
        size: 126,
      },
      {
        cell: ({ row }) => (
          <Switch
            aria-label={`Exclude ${row.original.name}`}
            checked={row.original.excluded}
            className="timeline-blueprint-switch"
            data-testid={`timeline-setup-row-exclude-${row.original.key}`}
            onCheckedChange={(excluded) =>
              updateRow(row.original.key, { excluded })
            }
          />
        ),
        header: "Exclude",
        id: "exclude",
        size: 110,
      },
      {
        cell: ({ row }) => (
          <button
            aria-label={`${row.getIsExpanded() ? "Collapse" : "Expand"} ${row.original.name}`}
            className="timeline-blueprint-expand"
            data-testid={`timeline-setup-row-expand-${row.original.key}`}
            onClick={row.getToggleExpandedHandler()}
            type="button"
          >
            {row.getIsExpanded() ? <ChevronDown /> : <ChevronRight />}
          </button>
        ),
        header: "",
        id: "expand",
        size: 64,
      },
    ],
    [rows]
  );

  const table = useReactTable({
    columns,
    data: rows,
    getCoreRowModel: getCoreRowModel(),
    getExpandedRowModel: getExpandedRowModel(),
    getRowCanExpand: () => true,
    getRowId: (row) => row.key,
    onExpandedChange: setExpanded,
    state: {
      expanded,
    },
  });
  const includedRows = rows.filter((row) => !row.excluded);
  const includedBudgetCents = includedRows.reduce((sum, row) => {
    const budget = rowBudgetCents(row);

    return sum + (Number.isFinite(budget) ? budget : 0);
  }, 0);
  const totalDuration = includedRows.reduce((sum, row) => {
    const duration = rowDurationDays(row);

    return sum + (Number.isFinite(duration) ? duration : 0);
  }, 0);
  const reorderRows = (activeIndex: number, overIndex: number) => {
    if (
      activeIndex < 0 ||
      overIndex < 0 ||
      activeIndex >= rows.length ||
      overIndex >= rows.length ||
      activeIndex === overIndex
    ) {
      return;
    }

    onRowsChange(
      arrayMove(rows, activeIndex, overIndex).map((row, order) => ({
        ...row,
        order,
      }))
    );
  };

  return (
    <div
      className="timeline-setup-panel timeline-setup-budget-panel"
      data-testid="timeline-setup-budget-screen"
    >
      <ProposalProgressSection step="budget" />
      <div className="timeline-blueprint-heading">
        <div>
          <span>Project milestones</span>
          <h1>{templateTitle}</h1>
        </div>
        <div className="timeline-blueprint-heading-meta">
          <span>Table variation 03</span>
          <span>Units: USD</span>
        </div>
      </div>

      <div className="timeline-blueprint-add-milestone">
        <div>
          <span>Custom milestone</span>
          <strong>Add a one-off construction checkpoint</strong>
        </div>
        <div className="timeline-blueprint-add-milestone-form">
          <input
            aria-label="Custom milestone name"
            data-testid="timeline-setup-custom-milestone-name"
            onChange={(event) =>
              setCustomMilestoneName(event.currentTarget.value)
            }
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                addCustomMilestone();
              }
            }}
            placeholder="Milestone name..."
            value={customMilestoneName}
          />
          <Button
            className="timeline-blueprint-add-milestone-button"
            data-testid="timeline-setup-add-custom-milestone"
            onClick={addCustomMilestone}
            type="button"
            variant="outline"
          >
            <Plus aria-hidden="true" />
            Add milestone
          </Button>
        </div>
      </div>

      <div
        className="timeline-blueprint-table-wrap"
        data-testid="timeline-setup-budget-table"
      >
        {(
          ["top-left", "top-right", "bottom-left", "bottom-right"] as const
        ).map((position) => (
          <span
            aria-hidden="true"
            className={`timeline-blueprint-table-corner is-${position}`}
            data-testid={`timeline-setup-budget-table-corner-${position}`}
            key={position}
          />
        ))}
        <Table className="timeline-blueprint-table">
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <TableHead
                    key={header.id}
                    style={{ width: header.getSize() }}
                  >
                    {header.isPlaceholder
                      ? null
                      : flexRender(
                          header.column.columnDef.header,
                          header.getContext()
                        )}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <Sortable
            aria-label="Milestone budget order"
            getItemValue={(row) => row.key}
            modifiers={[restrictToVerticalAxis]}
            onMove={({ activeIndex, overIndex }) =>
              reorderRows(activeIndex, overIndex)
            }
            render={<TableBody />}
            strategy="vertical"
            value={rows}
          >
            {table.getRowModel().rows.flatMap((row) => {
              const budgetRow = (
                <SortableItem
                  className={cn(row.original.excluded && "is-excluded")}
                  data-testid={`timeline-setup-budget-row-${row.original.key}`}
                  key={row.id}
                  render={<TableRow />}
                  value={row.original.key}
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>
                      {flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext()
                      )}
                    </TableCell>
                  ))}
                </SortableItem>
              );

              const expandedRow = row.getIsExpanded() ? (
                <TableRow
                  className="timeline-blueprint-expanded-row"
                  key={`${row.id}:expanded`}
                >
                  <TableCell colSpan={row.getVisibleCells().length}>
                    <SubMilestoneEditor
                      activeSubMilestoneId={
                        activeSubMilestoneByRow[row.original.key]
                      }
                      onActiveSubMilestoneChange={(subMilestoneId) =>
                        setActiveSubMilestoneByRow((current) => ({
                          ...current,
                          [row.original.key]: subMilestoneId,
                        }))
                      }
                      onAddSubMilestone={(item) =>
                        addSubMilestone(row.original.key, item)
                      }
                      onRemoveSubMilestone={(subMilestoneId) =>
                        removeSubMilestone(row.original.key, subMilestoneId)
                      }
                      onUpdateSubMilestone={(subMilestoneId, patch) =>
                        updateSubMilestone(
                          row.original.key,
                          subMilestoneId,
                          patch
                        )
                      }
                      row={row.original}
                    />
                  </TableCell>
                </TableRow>
              ) : null;

              return expandedRow ? [budgetRow, expandedRow] : [budgetRow];
            })}
          </Sortable>
        </Table>
      </div>

      <div className="timeline-blueprint-footer">
        <div className="timeline-blueprint-summary">
          <MetricPill
            label="Milestones"
            value={`${includedRows.length} active`}
          />
          <MetricPill
            label="Budget"
            value={formatCurrency(includedBudgetCents)}
          />
          <MetricPill label="Duration" value={`${totalDuration} days`} />
          <MetricPill label="Working capital" value={cashText} />
        </div>
        <div className="timeline-blueprint-actions">
          {error ? (
            <p
              className="timeline-blueprint-error"
              data-testid="timeline-setup-error"
            >
              {error}
            </p>
          ) : null}
          <Button
            className="timeline-setup-secondary"
            onClick={onBack}
            variant="outline"
          >
            Back to templates
          </Button>
          <Button
            className="timeline-setup-primary"
            data-testid="timeline-setup-complete"
            onClick={onComplete}
          >
            Generate timeline
            <ChevronRight />
          </Button>
        </div>
      </div>
    </div>
  );
}

function MetricPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="timeline-blueprint-metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
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
  onComplete,
}: TimelineSetupFlowProps) {
  const reducedMotion = useReducedMotion();
  const templates = useMemo(
    () => [buildDefaultTemplate(baseItems), ...secondaryTemplates()],
    [baseItems]
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
  const [projectAddress, setProjectAddress] = useState(DEFAULT_SETUP_ADDRESS);
  const [permitFiles, setPermitFiles] = useState<File[]>([]);
  const [permitsSkipped, setPermitsSkipped] = useState(false);
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
    window.scrollTo({ left: 0, top: 0 });
  }, [step]);

  const regenerateRows = (
    template: TimelineSetupTemplate,
    nextBudgetText: string
  ) => {
    const budgetCents = parseCurrencyToCents(nextBudgetText);

    if (!Number.isFinite(budgetCents) || budgetCents <= 0) {
      setError("Enter a positive reimbursable budget before generating rows.");
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
    const coPayCents = validCurrencyCents(coPayText);

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
        Number.isFinite(coPayCents) &&
        coPayCents >= 0 &&
        coPayCents <= budgetCents
      )
    ) {
      setError("Enter a co-pay amount between $0 and the total budget.");
      return;
    }

    if (regenerateRows(selectedTemplate, budgetText)) {
      setStep("budget");
    }
  };

  const completeSetup = () => {
    const invalidRow = rows.find((row) => {
      const budget = rowBudgetCents(row);
      const duration = rowDurationDays(row);

      return (
        !row.excluded &&
        !(
          Number.isFinite(budget) &&
          budget > 0 &&
          Number.isFinite(duration) &&
          duration > 0
        )
      );
    });
    const cashCents = validCurrencyCents(cashText);
    const coPayCents = validCurrencyCents(coPayText);

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
        Number.isFinite(coPayCents) &&
        coPayCents >= 0 &&
        coPayCents <= validCurrencyCents(budgetText)
      )
    ) {
      setError("Enter a co-pay amount between $0 and the total budget.");
      return;
    }

    const items = buildTimelineItemsFromSetupRows(rows);
    const totalBudget = rows
      .filter((row) => !row.excluded)
      .reduce((sum, row) => sum + Math.round(rowBudgetCents(row) / 100), 0);
    const activeItem = items[0];

    setError("");
    onComplete({
      activeItemId: activeItem?.id ?? "",
      currentDay: GENERATED_TIMELINE_CURRENT_DAY,
      includedCount: items.length,
      items,
      startingCash: Math.round(cashCents / 100),
      templateTitle: selectedTemplate?.title ?? "Timeline plan",
      totalBudget,
    });
  };

  const selectTemplate = (templateKey: string) => {
    setSelectedTemplateKey(templateKey);
    const nextTemplate = templates.find(
      (template) => template.templateKey === templateKey
    );

    if (nextTemplate) {
      regenerateRows(nextTemplate, budgetText);
    }
  };

  return (
    <main className="timeline-setup-shell">
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
            cashText={cashText}
            error={error}
            onBack={() => setStep("template")}
            onComplete={completeSetup}
            onRowsChange={(nextRows) => {
              setRows(nextRows);
              setError("");
            }}
            rows={rows}
            templateTitle={selectedTemplate?.title ?? "Timeline plan"}
          />
        )}
      </motion.div>
    </main>
  );
}
