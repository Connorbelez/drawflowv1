/**
 * Production proposals seed default builders bounded-context implementation.
 * The parent facade re-exports its handlers to preserve production_proposals function references.
 */
import { type AuthorizedViewer } from "../authz";
import { defaultSiteVisitGuidance, guidanceLinesToHtml, type SiteVisitGuidance } from "../demo_site_visit_guidance";
import { GARDEN_SUITE_SECTIONS, type GardenSuiteSection } from "../gardenSuiteTemplate";
import { type MutationCtx } from "../types";
import { authorizeBrokerage } from "./authorization_core.js";
import { requireAnyRole } from "./contractor_policy_helpers.js";
import { APPROVER_ROLES } from "./contracts_foundation.js";
import { titleCase } from "./legacy_seed.js";
import { type ProductionDefaultScenario } from "./seed_foundation.js";
import { type ProductionDefaultScenarioDraw, type ProductionDefaultMilestone, PRODUCTION_DEFAULT_TEMPLATES } from "./seed_template_defaults.js";

export function productionDefaultScenario(
  scenarioKey: string,
  name: string,
  isActive: boolean,
  draws: ProductionDefaultScenarioDraw[],
): ProductionDefaultScenario {
  return {
    description: `${name} draw timing and reimbursement amount assumptions.`,
    draws: draws.map((draw, order) => ({ ...draw, order })),
    isActive,
    isDefault: true,
    name,
    scenarioKey,
  };
}

export function productionDefaultDraw(
  drawKey: string,
  label: string,
  timingDay: number,
  amountBps: number,
  reviewNote: string,
): ProductionDefaultScenarioDraw {
  return { amountBps, drawKey, label, reviewNote, timingDay };
}

export function productionDefaultMilestone(
  key: string,
  name: string,
  percentageBps: number,
  durationDays: number,
  archetypeKey: string,
  submilestoneNames: string[],
): ProductionDefaultMilestone {
  const base = Math.floor(percentageBps / submilestoneNames.length);
  const remainder = percentageBps - base * submilestoneNames.length;
  const submilestones = submilestoneNames.map((submilestoneName, index) => ({
    durationDays: Math.max(
      1,
      Math.round(durationDays / submilestoneNames.length),
    ),
    key: `${key}-${slug(submilestoneName)}-${index}`,
    name: submilestoneName,
    percentageBps: base + (index < remainder ? 1 : 0),
  }));

  return {
    archetypeDescription:
      archetypeDescriptionForProductionDefault(archetypeKey),
    archetypeKey,
    dependencyKeys: [],
    durationDays,
    key,
    name,
    percentageBps,
    siteVisitGuidance: productionDefaultGuidance(key, name, submilestoneNames),
    submilestones,
  };
}

export function productionBudgetMilestone(
  key: string,
  name: string,
  percentageBps: number,
  durationDays: number,
  archetypeKey: string,
  submilestones: ProductionDefaultMilestone["submilestones"],
  siteVisitGuidance: SiteVisitGuidance,
): ProductionDefaultMilestone {
  return {
    archetypeDescription:
      archetypeDescriptionForProductionDefault(archetypeKey),
    archetypeKey,
    dependencyKeys: [],
    durationDays,
    key,
    name,
    percentageBps,
    siteVisitGuidance,
    submilestones,
  };
}

export function productionBudgetSubmilestone(
  milestoneKey: string,
  name: string,
  percentageBps: number,
  durationDays: number,
): ProductionDefaultMilestone["submilestones"][number] {
  return {
    durationDays,
    key: `${milestoneKey}-${slug(name)}`,
    name,
    percentageBps,
  };
}

export function gardenSuiteProductionMilestones(): ProductionDefaultMilestone[] {
  return GARDEN_SUITE_SECTIONS.map((section) =>
    productionBudgetMilestone(
      section.key,
      section.name,
      section.percentageBps,
      section.durationDays,
      section.icon,
      section.submilestones.map((submilestone) =>
        productionBudgetSubmilestone(
          section.key,
          submilestone.name,
          submilestone.percentageBps,
          submilestone.durationDays,
        ),
      ),
      gardenSuiteGuidance(section),
    ),
  );
}

function gardenSuiteGuidance(section: GardenSuiteSection): SiteVisitGuidance {
  const submilestoneNames = section.submilestones.map((row) => row.name);
  return {
    cameraAngles: guidanceLinesToHtml([
      `Required wide angle: ${section.name} work area showing completed scope and address context.`,
      `Required close-up: representative installed or documentary evidence for ${submilestoneNames[0]}.`,
      `Required exception angle: any incomplete, staged-only, damaged, or location-unclear ${section.name.toLowerCase()} item.`,
    ]),
    whatToVerify: guidanceLinesToHtml([
      `${section.name}: verify completed reimbursable work against the Garden Suite budget section before release.`,
      `Confirm claimed line items include ${submilestoneNames.slice(0, 3).join(", ")}${submilestoneNames.length > 3 ? ", and related scope." : "."}`,
      "Exclude project summaries, HST, rebates, cost-per-square-foot rows, and notes from milestone completion value.",
    ]),
  };
}

export function fourPlexGuidance(
  whatToVerify: string[],
  cameraAngles: string[],
): SiteVisitGuidance {
  return {
    cameraAngles: guidanceLinesToHtml(cameraAngles),
    whatToVerify: guidanceLinesToHtml(whatToVerify),
  };
}

function productionDefaultGuidance(
  key: string,
  name: string,
  submilestones: string[],
) {
  const normalized = `${key} ${name}`.toLowerCase();

  if (normalized.includes("foundation") || normalized.includes("site-prep")) {
    return {
      cameraAngles: guidanceLinesToHtml([
        "Wide site overview showing excavation limits, access, and completed foundation area.",
        "Close-up of forms, reinforcing, anchors, or embeds before concrete cover is lost.",
        "Drainage, waterproofing, and backfill condition at the most constrained elevation.",
      ]),
      whatToVerify: guidanceLinesToHtml([
        "Permit mobilization and site controls are in place before reimbursable work is counted.",
        "Excavation, forms, reinforcing, and concrete placement match approved plan dimensions.",
        "Waterproofing, drainage, and backfill are complete where required for the draw scope.",
      ]),
    };
  }

  if (normalized.includes("demo")) {
    return {
      cameraAngles: guidanceLinesToHtml([
        "Wide room-by-room overview showing demolition limits and protected areas.",
        "Close-up of capped utilities, shoring, or exposed structural conditions.",
        "Waste staging or haul-off evidence showing removed material left the site.",
      ]),
      whatToVerify: guidanceLinesToHtml([
        "Demolition is limited to the approved scope and retained structure is protected.",
        "Utilities affected by demolition are capped or made safe.",
        "Debris removal is complete enough for the next milestone to start.",
      ]),
    };
  }

  if (normalized.includes("exterior") || normalized.includes("envelope")) {
    return {
      cameraAngles: guidanceLinesToHtml([
        "Full elevation showing windows, doors, weather barrier, and cladding scope.",
        "Close-up of flashing transitions at openings and penetrations.",
        "Corner or roofline detail tying envelope work back to the approved plan.",
      ]),
      whatToVerify: guidanceLinesToHtml([
        "Windows and exterior doors are installed, flashed, and weather-tight.",
        "Weather barrier is continuous at seams, corners, and penetrations.",
        "Exterior cladding or repairs are complete for the draw scope being requested.",
      ]),
    };
  }

  if (normalized.includes("drywall") || normalized.includes("inspection")) {
    return {
      cameraAngles: guidanceLinesToHtml([
        "Wide interior overview showing insulation or board installation progress.",
        "Close-up of inspection stickers, signoff record, or deficiency tag.",
        "Representative ceiling and wall planes before finishes conceal the work.",
      ]),
      whatToVerify: guidanceLinesToHtml([
        "Required rough-in or insulation inspections are complete before close-in value is counted.",
        "Insulation, vapor control, drywall hang, or board scope is complete in the claimed areas.",
        "No unresolved inspection deficiencies block reimbursement for this milestone.",
      ]),
    };
  }

  if (normalized.includes("finish") || normalized.includes("rebuild")) {
    return {
      cameraAngles: guidanceLinesToHtml([
        "Wide view of completed rooms showing flooring, cabinetry, and trim continuity.",
        "Close-up of fixtures, cabinet installation, flooring transitions, or finish quality.",
        "Context photo tying finish work back to the milestone area and unit or room number.",
      ]),
      whatToVerify: guidanceLinesToHtml([
        "Finish materials are installed, not merely delivered or staged.",
        "Fixtures, millwork, flooring, and trim are complete enough to support reimbursement.",
        "Visible damage, missing components, or incomplete punch work is documented for review.",
      ]),
    };
  }

  if (normalized.includes("closeout") || normalized.includes("occupancy")) {
    return {
      cameraAngles: guidanceLinesToHtml([
        "Wide final condition photo of the completed work area or unit.",
        "Close-up of final inspection, occupancy, or closeout document evidence.",
        "Photo of remaining punch-list items, if any, with location context.",
      ]),
      whatToVerify: guidanceLinesToHtml([
        "Final inspection, occupancy, or lender-required closeout document is present.",
        "Punch-list work is complete or exceptions are clearly identified for admin review.",
        "The site is safe, accessible, and ready for final reimbursement review.",
      ]),
    };
  }

  return defaultSiteVisitGuidance(key, name, submilestones);
}

function archetypeDescriptionForProductionDefault(archetypeKey: string) {
  const descriptions: Record<string, string> = {
    change: "Selective demolition and change-scope work.",
    closeout: "Inspection, punch-list, occupancy, and final package work.",
    drywall: "Inspection close-in, insulation, and drywall work.",
    exterior:
      "Envelope, windows, doors, weather barrier, and exterior finishes.",
    finishes: "Interior finish, fixture, millwork, and final surface work.",
    foundation: "Permits, sitework, excavation, concrete, and foundation work.",
    framing: "Structural framing, sheathing, hardware, and dry-in work.",
    roughIn: "Mechanical, electrical, plumbing, and rough-in coordination.",
  };

  return (
    descriptions[archetypeKey] ?? `${titleCase(archetypeKey)} milestone work.`
  );
}

export function slug(value: string) {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "item"
  );
}

export function productionTemplateSortOrder(templateKey: string) {
  const index = PRODUCTION_DEFAULT_TEMPLATES.findIndex(
    (template) => template.templateKey === templateKey,
  );
  return index === -1 ? Number.MAX_SAFE_INTEGER : index;
}

export function normalizeProductionTemplateKey(value: string) {
  return (
    value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "template"
  );
}

export async function authorizeProductionSettingsMutation(
  ctx: MutationCtx & { viewer: AuthorizedViewer },
  workosOrganizationId: string,
) {
  const auth = await authorizeBrokerage(ctx, workosOrganizationId);
  requireAnyRole(auth.roles, APPROVER_ROLES);
  return auth;
}
