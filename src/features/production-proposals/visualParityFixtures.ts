import type {
  ProductionKanban,
  ProductionProposalDetail,
  ProductionProposalSettings,
} from "./ProductionProposalSurfaces.tsx";
import type { ProductionProposalTemplateProjection } from "./timelineSetupAdapter.ts";

export const VISUAL_PARITY_ORGANIZATION_ID = "org_visual_parity_workos";
export const VISUAL_PARITY_PROPOSAL_ID = "proposal_visual_parity";

export function isProductionVisualParityFixtureEnabled(): boolean {
  return (
    !import.meta.env.PROD &&
    import.meta.env.VITE_DRAWFLOW_VISUAL_PARITY_FIXTURE === "1"
  );
}

export function getVisualParityCreateContext() {
  return {
    brokerage: {
      _id: "brokerage_visual_parity",
      name: "FairLend Capital",
      organizationId: VISUAL_PARITY_ORGANIZATION_ID,
    },
    builderProfile: {
      _id: "builder_visual_parity",
      companyName: "Northline Homes",
      status: "active",
    },
    templates: VISUAL_PARITY_TEMPLATES,
  };
}

export function getVisualParityKanban(): ProductionKanban {
  const now = Date.UTC(2026, 4, 27, 14, 30);
  return {
    columns: [
      {
        cards: [
          {
            builderName: "Northline Homes",
            column: "draft",
            proposalId: VISUAL_PARITY_PROPOSAL_ID,
            subtitle: "Hamilton, ON - package in progress",
            title: "Hamilton Infill Build",
            totalBudgetCents: 1_250_000_00,
            updatedAt: now,
          },
        ],
        id: "draft",
        name: "Draft",
      },
      {
        cards: [
          {
            builderName: "Northline Homes",
            column: "submitted",
            proposalId: "proposal_visual_submitted",
            subtitle: "Permit linked - ready for broker review",
            title: "King Street Townhomes",
            totalBudgetCents: 1_480_000_00,
            updatedAt: now - 86_400_000,
          },
        ],
        id: "submitted",
        name: "Submitted",
      },
      {
        cards: [
          {
            builderName: "Cedarpoint Builders",
            column: "approved",
            proposalId: "proposal_visual_approved",
            subtitle: "Approved - waiting on offline closing",
            title: "Cedarpoint Duplex",
            totalBudgetCents: 980_000_00,
            updatedAt: now - 172_800_000,
          },
        ],
        id: "approved",
        name: "Approved",
      },
      {
        cards: [
          {
            builderName: "Northline Homes",
            column: "closed",
            proposalId: "proposal_visual_closed",
            subtitle: "Active build created from closed proposal",
            title: "Wentworth Garden Suites",
            totalBudgetCents: 1_110_000_00,
            updatedAt: now - 259_200_000,
          },
        ],
        id: "closed",
        name: "Closed",
      },
    ],
  };
}

export function getVisualParityProposalDetail(): ProductionProposalDetail {
  return {
    activeBuild: null,
    documents: [
      {
        documentType: "permit",
        fileName: "hamilton-infill-building-permit.pdf",
        mimeType: "application/pdf",
        sizeBytes: 482_102,
        status: "uploaded",
        storageId: "storage_visual_permit",
        storageUrl: null,
      },
      {
        documentType: "budget",
        fileName: "cost-breakdown-v3.xlsx",
        mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        sizeBytes: 94_336,
        status: "uploaded",
        storageId: "storage_visual_budget",
        storageUrl: null,
      },
    ],
    draws: [
      {
        amountCents: 100_000_00,
        drawKey: "draw-site-prep",
        label: "Draw 1 - site prep",
        milestoneKey: "site-prep",
        timingDay: 16,
      },
      {
        amountCents: 128_000_00,
        drawKey: "draw-framing",
        label: "Draw 2 - framing",
        milestoneKey: "framing",
        timingDay: 43,
      },
      {
        amountCents: 196_000_00,
        drawKey: "draw-rough-in",
        label: "Draw 3 - rough-in",
        milestoneKey: "rough-in",
        timingDay: 68,
      },
      {
        amountCents: 168_000_00,
        drawKey: "draw-exterior",
        label: "Draw 4 - exterior",
        milestoneKey: "exterior",
        timingDay: 92,
      },
      {
        amountCents: 152_000_00,
        drawKey: "draw-drywall",
        label: "Draw 5 - drywall",
        milestoneKey: "drywall",
        timingDay: 116,
      },
      {
        amountCents: 128_000_00,
        drawKey: "draw-finishes",
        label: "Draw 6 - finishes",
        milestoneKey: "finishes",
        timingDay: 138,
      },
      {
        amountCents: 128_000_00,
        drawKey: "draw-closeout",
        label: "Draw 7 - closeout",
        milestoneKey: "closeout",
        timingDay: 158,
      },
    ],
    milestones: [
      {
        budgetCents: 125_000_00,
        dayEnd: 14,
        dayStart: 0,
        durationDays: 14,
        key: "site-prep",
        name: "Site prep & foundation",
        order: 1,
      },
      {
        budgetCents: 160_000_00,
        dayEnd: 39,
        dayStart: 19,
        durationDays: 20,
        key: "framing",
        name: "Framing & structure",
        order: 2,
      },
      {
        budgetCents: 245_000_00,
        dayEnd: 64,
        dayStart: 44,
        durationDays: 20,
        key: "rough-in",
        name: "Rough-in mechanical",
        order: 3,
      },
      {
        budgetCents: 210_000_00,
        dayEnd: 88,
        dayStart: 69,
        durationDays: 19,
        key: "exterior",
        name: "Windows & exterior",
        order: 4,
      },
      {
        budgetCents: 190_000_00,
        dayEnd: 112,
        dayStart: 93,
        durationDays: 19,
        key: "drywall",
        name: "Inspections & drywall",
        order: 5,
      },
      {
        budgetCents: 160_000_00,
        dayEnd: 136,
        dayStart: 117,
        durationDays: 19,
        key: "finishes",
        name: "Finishes & fixtures",
        order: 6,
      },
      {
        budgetCents: 160_000_00,
        dayEnd: 156,
        dayStart: 141,
        durationDays: 15,
        key: "closeout",
        name: "Final inspection & closeout",
        order: 7,
      },
    ],
    permitWaiver: null,
    proposal: {
      borrowerCoPayBps: 2000,
      borrowerWorkingCapitalLimitCents: 250_000_00,
      buildName: "Hamilton Infill Build",
      lenderDrawPolicyLimitCents: 1_000_000_00,
      location: "Hamilton, ON",
      status: "submitted",
      totalBudgetCents: 1_250_000_00,
    },
    submilestones: [
      { key: "permit-mobilization", milestoneKey: "site-prep", name: "Permit mobilization" },
      { key: "excavation", milestoneKey: "site-prep", name: "Excavation" },
      { key: "forms", milestoneKey: "site-prep", name: "Concrete forms" },
      { key: "wall-framing", milestoneKey: "framing", name: "Wall framing" },
      { key: "roof-trusses", milestoneKey: "framing", name: "Roof trusses" },
      { key: "sheathing", milestoneKey: "framing", name: "Structural sheathing" },
      { key: "plumbing", milestoneKey: "rough-in", name: "Plumbing rough-in" },
      { key: "electrical", milestoneKey: "rough-in", name: "Electrical rough-in" },
      { key: "hvac", milestoneKey: "rough-in", name: "HVAC ducts" },
      { key: "windows", milestoneKey: "exterior", name: "Window install" },
      { key: "weather-barrier", milestoneKey: "exterior", name: "Weather barrier" },
      { key: "drywall-hang", milestoneKey: "drywall", name: "Drywall hang" },
      { key: "cabinetry", milestoneKey: "finishes", name: "Cabinetry" },
      { key: "fixture-set", milestoneKey: "finishes", name: "Fixture set" },
      { key: "punch-list", milestoneKey: "closeout", name: "Punch list" },
    ],
  };
}

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
        icon: iconForTemplateMilestone(milestone.key),
        key: milestone.key,
        name: milestone.name,
        percentageBps: milestone.percentageBps,
        submilestones: (milestone.submilestones ?? []).map((submilestone) => ({
          budgetCents: submilestone.budgetCents,
          durationDays: submilestone.durationDays,
          key: submilestone.key,
          name: submilestone.name,
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

function iconForTemplateMilestone(key: string) {
  const normalized = key.toLowerCase();
  if (normalized.includes("site") || normalized.includes("foundation")) {
    return "foundation";
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

const VISUAL_PARITY_TEMPLATES: ProductionProposalTemplateProjection[] = [
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
      templateMilestone("closeout", "Final inspection & closeout", 7, 1280, 15, [
        "Punch list",
        "Final inspection",
        "Closeout package",
      ]),
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
  submilestoneNames: string[],
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
