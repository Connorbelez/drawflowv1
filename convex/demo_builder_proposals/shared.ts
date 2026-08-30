import { v } from "convex/values";
import {
  publicMutation,
  publicQuery,
  withMutationTiming,
  withQueryTiming,
} from "../fluent";
import {
  GARDEN_SUITE_DEMO_TEMPLATE_KEY,
  GARDEN_SUITE_DESCRIPTION,
  GARDEN_SUITE_SECTIONS,
  GARDEN_SUITE_SUMMARY,
  GARDEN_SUITE_TEMPLATE_TITLE,
} from "../gardenSuiteTemplate";
import type { DatabaseReader, DatabaseWriter, Doc, Id } from "../types";

export const ORG_KEY = "org_fairlend_demo";
export const BUILDER_PERSONA = "builder_lead";
export const LENDER_DRAW_POLICY_LIMIT_CENTS = 48_000_000;
export const SEED_VERSION = 1;
export const DEMO_START_DATE = "2026-06-01";

export interface DemoCtx {
  db: DatabaseReader;
}

export interface DemoWriteCtx {
  db: DatabaseWriter;
}

export type BuilderProposalDraft = Doc<"demo_builderProposalDrafts">;
export type BuilderProposalDraftId = Id<"demo_builderProposalDrafts">;
export type BuilderProposalMilestone = Doc<"demo_builderProposalMilestones">;

export interface TemplatePreset {
  dependencyKeys: string[];
  durationDays: number;
  key: string;
  name: string;
  percentageBps: number;
  type: string;
}

export interface BuilderTemplate {
  description: string;
  isDefault: boolean;
  milestonePresets: TemplatePreset[];
  summary: string;
  templateKey: string;
  title: string;
}

export interface BankItem {
  bankItemKey: string;
  dependencyKeys: string[];
  durationDays: number;
  name: string;
  percentageBps: number;
  type: string;
}

export interface DraftMilestoneLike {
  budgetCents: number;
  drawGroupIndex?: number;
  included: boolean;
}

export interface CashAwareDrawGroup {
  milestones: DraftMilestoneLike[];
  totalBudgetCents: number;
}

export const BUILDER_TEMPLATES: BuilderTemplate[] = [
  {
    description:
      "Selective demo, rough-in upgrades, envelope repairs, interiors, inspection closeout.",
    isDefault: false,
    milestonePresets: [
      preset(
        "renovation_permits",
        "Permit updates and mobilization",
        800,
        10,
        "permitting",
        []
      ),
      preset(
        "selective_demo",
        "Selective demolition",
        1400,
        16,
        "demolition",
        []
      ),
      preset(
        "structural_repairs",
        "Structural repairs",
        1800,
        24,
        "foundation_structural",
        ["selective_demo"]
      ),
      preset(
        "mep_rework",
        "MEP rework",
        1500,
        21,
        "mechanical_electrical_plumbing",
        ["structural_repairs"]
      ),
      preset(
        "envelope_repairs",
        "Envelope repairs",
        1300,
        18,
        "exterior_envelope",
        ["structural_repairs"]
      ),
      preset(
        "renovation_interiors",
        "Interior rebuild",
        2400,
        36,
        "interior_finish",
        ["mep_rework"]
      ),
      preset(
        "renovation_closeout",
        "Inspection closeout",
        800,
        10,
        "closeout",
        ["renovation_interiors"]
      ),
    ],
    summary: "7 preset milestones",
    templateKey: "single-family-renovation",
    title: "Single Family Renovation",
  },
  {
    description:
      "Production-ready path with permits, sitework, foundation, framing, MEP, envelope, interiors, punch, and closeout.",
    isDefault: true,
    milestonePresets: [
      preset(
        "permits_mobilization",
        "Permits and mobilization",
        500,
        14,
        "permitting",
        []
      ),
      preset(
        "sitework_excavation",
        "Sitework and excavation",
        1000,
        24,
        "site_preparation",
        []
      ),
      preset(
        "foundation_slab",
        "Foundation and slab",
        1300,
        21,
        "foundation_structural",
        ["sitework_excavation"]
      ),
      preset(
        "framing_dried_in",
        "Framing dried in",
        2300,
        35,
        "foundation_structural",
        ["foundation_slab"]
      ),
      preset(
        "mep_rough_ins",
        "MEP rough-ins",
        1500,
        28,
        "mechanical_electrical_plumbing",
        ["framing_dried_in"]
      ),
      preset(
        "envelope_weatherproofing",
        "Envelope weatherproofing",
        900,
        24,
        "exterior_envelope",
        ["framing_dried_in"]
      ),
      preset(
        "interior_finishes",
        "Interior finishes",
        1400,
        42,
        "interior_finish",
        ["mep_rough_ins", "envelope_weatherproofing"]
      ),
      preset(
        "exterior_works",
        "Exterior works",
        400,
        18,
        "landscape_exterior",
        ["envelope_weatherproofing"]
      ),
      preset("punch_corrections", "Punch corrections", 400, 14, "closeout", [
        "interior_finishes",
      ]),
      preset(
        "final_inspection_closeout",
        "Final inspection and closeout",
        300,
        10,
        "closeout",
        ["punch_corrections"]
      ),
    ],
    summary: "10 preset milestones",
    templateKey: "single-family-full-build",
    title: "Single Family Full Build",
  },
  {
    description:
      "Multi-unit sitework, stacked framing, shared systems, unit finishes, exterior works, and closeout.",
    isDefault: false,
    milestonePresets: [
      preset(
        "multiplex_permits",
        "Permits and civil mobilization",
        500,
        16,
        "permitting",
        []
      ),
      preset(
        "shared_sitework",
        "Shared sitework and utilities",
        1000,
        28,
        "site_preparation",
        []
      ),
      preset(
        "podium_foundation",
        "Foundation and podium slab",
        1250,
        30,
        "foundation_structural",
        ["shared_sitework"]
      ),
      preset(
        "stacked_framing",
        "Stacked framing and dry-in",
        1900,
        42,
        "foundation_structural",
        ["podium_foundation"]
      ),
      preset(
        "shared_mep",
        "Shared MEP rough-ins",
        1250,
        35,
        "mechanical_electrical_plumbing",
        ["stacked_framing"]
      ),
      preset(
        "unit_rough_ins",
        "Unit-level rough-ins",
        900,
        24,
        "mechanical_electrical_plumbing",
        ["shared_mep"]
      ),
      preset(
        "building_envelope",
        "Building envelope",
        850,
        28,
        "exterior_envelope",
        ["stacked_framing"]
      ),
      preset("unit_finishes", "Unit finishes", 1350, 45, "interior_finish", [
        "unit_rough_ins",
      ]),
      preset(
        "common_areas",
        "Common areas and life safety",
        450,
        20,
        "interior_finish",
        ["unit_finishes"]
      ),
      preset(
        "exterior_site_finish",
        "Exterior site finish",
        350,
        18,
        "landscape_exterior",
        ["building_envelope"]
      ),
      preset(
        "multiplex_closeout",
        "Final inspections and occupancy",
        250,
        12,
        "closeout",
        ["common_areas", "exterior_site_finish"]
      ),
    ],
    summary: "11 preset milestones",
    templateKey: "multiplex-build",
    title: "Multi-plex Build",
  },
  {
    description: GARDEN_SUITE_DESCRIPTION,
    isDefault: false,
    milestonePresets: gardenSuiteBuilderPresets(),
    summary: GARDEN_SUITE_SUMMARY,
    templateKey: GARDEN_SUITE_DEMO_TEMPLATE_KEY,
    title: GARDEN_SUITE_TEMPLATE_TITLE,
  },
];

export const BANK_ITEMS: BankItem[] = [
  {
    bankItemKey: "landscape_exterior_punch",
    dependencyKeys: ["exterior_works"],
    durationDays: 14,
    name: "Landscape and exterior punch",
    percentageBps: 400,
    type: "landscape_exterior",
  },
  {
    bankItemKey: "solar_readiness_package",
    dependencyKeys: ["envelope_weatherproofing"],
    durationDays: 10,
    name: "Solar readiness package",
    percentageBps: 250,
    type: "utility",
  },
  {
    bankItemKey: "accessibility_lift",
    dependencyKeys: ["interior_finishes"],
    durationDays: 21,
    name: "Accessibility lift",
    percentageBps: 300,
    type: "accessibility",
  },
];

export function preset(
  key: string,
  name: string,
  percentageBps: number,
  durationDays: number,
  type: string,
  dependencyKeys: string[]
): TemplatePreset {
  return { dependencyKeys, durationDays, key, name, percentageBps, type };
}

export function gardenSuiteBuilderPresets(): TemplatePreset[] {
  return GARDEN_SUITE_SECTIONS.map((section, index) =>
    preset(
      section.key.replaceAll("-", "_"),
      section.name,
      section.percentageBps,
      section.durationDays,
      section.builderType,
      index === 0
        ? []
        : [GARDEN_SUITE_SECTIONS[index - 1].key.replaceAll("-", "_")]
    )
  );
}

export function now() {
  return Date.now();
}

export function allocateByBps(totalCents: number, rows: { percentageBps: number }[]) {
  const allocations = rows.map((row, order) => {
    const raw = totalCents * row.percentageBps;
    return {
      cents: Math.floor(raw / 10_000),
      order,
      remainder: raw % 10_000,
    };
  });
  let remainderCents =
    totalCents -
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

export function templateForKey(templateKey: string) {
  return BUILDER_TEMPLATES.find(
    (template) => template.templateKey === templateKey
  );
}
