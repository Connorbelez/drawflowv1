import type {
  ProductionProposalSettings,
} from "./ProductionProposalSurfaces.tsx";
import type { ProductionProposalTemplateProjection } from "./timelineSetupAdapter.ts";
import type { IsometricIconKey } from "#/features/timeline-workspace/-timeline-share-snapshot.ts";

export function getVisualParitySettings(): ProductionProposalSettings {
  return {
    archetypes: [
      { key: "foundation", name: "Foundation", status: "active" },
      { key: "framing", name: "Framing", status: "active" },
      { key: "rough-in", name: "Rough-in", status: "active" },
    ],
    templates: VISUAL_PARITY_TEMPLATES.map((template) => ({
      milestones: template.milestones.map((milestone) => ({
        archetypeKey: milestone.archetypeKey,
        dependencyKeys: milestone.dependencyKeys,
        durationDays: milestone.durationDays,
        icon: iconForTemplateMilestone(milestone.key, milestone.name),
        key: milestone.key,
        name: milestone.name,
        percentageBps: milestone.percentageBps,
        submilestones: (milestone.submilestones ?? []).map((submilestone) => ({
          budgetCents: submilestone.budgetCents,
          durationDays: submilestone.durationDays,
          key: submilestone.key,
          name: submilestone.name,
          startDay: submilestone.startDay,
        })),
        type: milestone.archetypeKey,
      })),
      scenarios: [
        {
          isDefault: true,
          name: "Capital constrained reimbursement",
          scenarioKey: "capital-constrained",
        },
      ],
      templateKey: template.templateKey,
      title: template.title,
    })),
    workflowRules: [
      {
        allowPermitWaiverByRoles: ["admin", "principle-broker"],
        proposalStates: ["draft", "submitted", "approved", "closed"],
        requirePermitForApproval: true,
        ruleKey: "proposal-foundation-v1",
        settings: {
          interestStartsOn: "funds_released",
          reimbursementOnly: true,
        },
        version: 1,
      },
    ],
  };
}

export function iconForTemplateMilestone(
  key: string,
  name?: string
): IsometricIconKey {
  const normalized = `${key} ${name ?? ""}`.toLowerCase();
  if (normalized.includes("site") || normalized.includes("foundation")) {
    return "foundation";
  }
  if (normalized.includes("kitchen") || normalized.includes("cabinet")) {
    return "kitchen";
  }
  if (
    normalized.includes("plumb") ||
    normalized.includes("mechanical") ||
    normalized.includes("mep")
  ) {
    return "plumbing";
  }
  if (normalized.includes("roof") || normalized.includes("dry-in")) {
    return "roofing";
  }
  if (normalized.includes("fram")) {
    return "framing";
  }
  if (normalized.includes("rough")) {
    return "roughIn";
  }
  if (normalized.includes("exterior")) {
    return "exterior";
  }
  if (normalized.includes("drywall")) {
    return "drywall";
  }
  if (normalized.includes("finish")) {
    return "finishes";
  }
  if (normalized.includes("close")) {
    return "closeout";
  }
  return "change";
}

export const VISUAL_PARITY_TEMPLATES: ProductionProposalTemplateProjection[] = [
  {
    isDefault: true,
    milestones: [
      templateMilestone("site-prep", "Site prep & foundation", 1, 1000, 14, [
        "Permit mobilization",
        "Excavation",
        "Concrete forms",
      ]),
      templateMilestone("framing", "Framing & structure", 2, 1280, 20, [
        "Wall framing",
        "Roof trusses",
        "Structural sheathing",
      ]),
      templateMilestone("rough-in", "Rough-in mechanical", 3, 1960, 20, [
        "Plumbing rough-in",
        "Electrical rough-in",
        "HVAC ducts",
      ]),
      templateMilestone("exterior", "Windows & exterior", 4, 1680, 19, [
        "Window install",
        "Weather barrier",
        "Exterior doors",
      ]),
      templateMilestone("drywall", "Inspections & drywall", 5, 1520, 19, [
        "Rough-in inspection",
        "Insulation",
        "Drywall hang",
      ]),
      templateMilestone("finishes", "Finishes & fixtures", 6, 1280, 19, [
        "Cabinetry",
        "Flooring",
        "Fixture set",
      ]),
      templateMilestone(
        "closeout",
        "Final inspection & closeout",
        7,
        1280,
        15,
        ["Punch list", "Final inspection", "Closeout package"]
      ),
    ],
    summary: "Single-family reimbursement draw template",
    templateKey: "single-family-full-build",
    title: "Single-family full build",
  },
];

function templateMilestone(
  key: string,
  name: string,
  order: number,
  percentageBps: number,
  durationDays: number,
  submilestoneNames: string[]
) {
  return {
    archetypeKey: key,
    dependencyKeys: [],
    durationDays,
    key,
    name,
    order,
    percentageBps,
    submilestones: submilestoneNames.map((submilestone, index) => ({
      key: `${key}-${index + 1}`,
      name: submilestone,
      order: index + 1,
    })),
  };
}
