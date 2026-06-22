import type { TimelineItem } from "#/components/roadmap/AnimatedCurvedTimeline.tsx";
import type {
  TimelineSetupResult,
  TimelineSetupTemplate,
} from "#/features/timeline-workspace/-TimelineSetupFlow.tsx";
import { resolveMilestoneSubmilestones } from "#/features/timeline-workspace/-timeline-milestone-submilestones.ts";
import type { DemoMilestone } from "#/features/timeline-workspace/-timeline-share-snapshot.ts";

import type { ProductionProposalDraftSavePayload } from "./ProductionProposalSurfaces.tsx";

export interface ProductionProposalTemplateProjection {
  isDefault?: boolean;
  milestones: Array<{
    archetypeKey?: string;
    dependencyKeys?: string[];
    durationDays: number;
    key: string;
    name: string;
    order: number;
    percentageBps: number;
    siteVisitGuidance?: {
      cameraAngles: string;
      whatToVerify: string;
    };
    submilestones?: Array<{
      durationDays?: number;
      key: string;
      name: string;
      order?: number;
      percentageBps?: number;
    }>;
  }>;
  scenarios?: Array<{
    draws: Array<{
      amountBps: number;
      drawKey: string;
      label: string;
      order?: number;
      reviewNote?: string;
      timingDay: number;
    }>;
    isActive?: boolean;
    isDefault?: boolean;
    scenarioKey: string;
  }>;
  summary?: string;
  templateKey: string;
  title: string;
}

export const PRODUCTION_SETUP_BASE_ITEMS: TimelineItem<DemoMilestone>[] = [
  {
    data: {
      amount: 125_000,
      draw: "Draw 1",
      drawX: 36,
      durationDays: 14,
      evidence: "Accepted package",
      icon: "foundation",
      name: "Site prep & foundation",
      policy: "Released",
      status: "complete",
      subMilestones: ["Permit mobilization", "Excavation", "Concrete forms"],
    },
    eyebrow: "Milestone 1",
    id: "site-prep",
    label: "Site prep",
    lane: 0,
    markerLabel: "1",
    tone: "complete",
    x: 14,
  },
  {
    data: {
      amount: 160_000,
      draw: "Draw 2",
      drawX: 64,
      durationDays: 18,
      evidence: "Accepted package",
      icon: "framing",
      name: "Framing & structure",
      policy: "Released",
      status: "complete",
      subMilestones: ["Wall framing", "Roof trusses", "Structural sheathing"],
    },
    eyebrow: "Milestone 2",
    id: "framing",
    label: "Framing",
    lane: -1,
    markerLabel: "2",
    tone: "complete",
    x: 38,
  },
  {
    data: {
      amount: 245_000,
      draw: "Draw 3",
      drawX: 94,
      durationDays: 20,
      evidence: "Site visit today",
      icon: "plumbing",
      name: "Rough-in mechanical",
      policy: "Admin review",
      status: "ready",
      subMilestones: ["Plumbing rough-in", "Electrical rough-in", "HVAC ducts"],
    },
    eyebrow: "Milestone 3",
    id: "rough-in",
    label: "Rough-in",
    lane: 1,
    markerLabel: "3",
    tone: "active",
    x: 66,
  },
  {
    data: {
      amount: 210_000,
      draw: "Draw 4",
      drawX: 122,
      durationDays: 18,
      evidence: "Draft started",
      icon: "exterior",
      name: "Windows & exterior",
      policy: "Evidence required",
      status: "ready",
      subMilestones: ["Window install", "Weather barrier", "Exterior doors"],
    },
    eyebrow: "Milestone 4",
    id: "exterior",
    label: "Exterior",
    lane: 0,
    markerLabel: "4",
    tone: "warning",
    x: 96,
  },
  {
    data: {
      amount: 190_000,
      draw: "Draw 5",
      drawX: 148,
      durationDays: 16,
      evidence: "Not started",
      icon: "drywall",
      name: "Inspections & drywall",
      policy: "Upcoming",
      status: "upcoming",
      subMilestones: ["Rough-in inspection", "Insulation", "Drywall hang"],
    },
    eyebrow: "Milestone 5",
    id: "drywall",
    label: "Drywall",
    lane: -1,
    markerLabel: "5",
    tone: "upcoming",
    x: 124,
  },
  {
    data: {
      amount: 160_000,
      draw: "Draw 6",
      drawX: 170,
      durationDays: 12,
      evidence: "Not started",
      icon: "kitchen",
      name: "Finishes & fixtures",
      policy: "Upcoming",
      status: "upcoming",
      subMilestones: ["Cabinetry", "Flooring", "Fixture set"],
    },
    eyebrow: "Milestone 6",
    id: "finishes",
    label: "Finishes",
    lane: 1,
    markerLabel: "6",
    tone: "upcoming",
    x: 150,
  },
  {
    data: {
      amount: 160_000,
      draw: "Draw 7",
      drawX: 184,
      durationDays: 4,
      evidence: "Not started",
      icon: "closeout",
      name: "Final inspection & closeout",
      policy: "Upcoming",
      status: "upcoming",
      subMilestones: ["Punch list", "Final inspection", "Closeout package"],
    },
    eyebrow: "Milestone 7",
    id: "closeout",
    label: "Closeout",
    lane: 0,
    markerLabel: "7",
    tone: "upcoming",
    x: 172,
  },
];

export function productionTemplatesToTimelineSetupTemplates(
  templates: ProductionProposalTemplateProjection[] | undefined
): TimelineSetupTemplate[] | undefined {
  if (!templates?.length) {
    return;
  }

  return templates.map((template) => ({
    description: template.summary ?? "Production proposal template",
    isDefault: template.isDefault,
    rows: [...template.milestones]
      .sort((a, b) => a.order - b.order)
      .map((milestone) => ({
        dependencyKeys: milestone.dependencyKeys ?? [],
        durationDays: milestone.durationDays,
        icon: iconForMilestone(
          milestone.key,
          milestone.archetypeKey,
          milestone.name
        ),
        key: milestone.key,
        name: milestone.name,
        percentageBps: milestone.percentageBps,
        siteVisitGuidance: milestone.siteVisitGuidance,
        subMilestoneDetails: [...(milestone.submilestones ?? [])]
          .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
          .map((submilestone) => ({
            durationDays: submilestone.durationDays,
            key: submilestone.key,
            name: submilestone.name,
            order: submilestone.order,
            percentageBps: submilestone.percentageBps,
          })),
        subMilestones: [...(milestone.submilestones ?? [])]
          .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
          .map((submilestone) => submilestone.name),
        type: milestone.archetypeKey ?? milestone.key,
      })),
    scenarios: template.scenarios?.map((scenario) => ({
      draws: [...scenario.draws]
        .sort(
          (left, right) =>
            (left.order ?? 0) - (right.order ?? 0) ||
            left.timingDay - right.timingDay ||
            left.drawKey.localeCompare(right.drawKey)
        )
        .map((draw, order) => ({
          amountBps: draw.amountBps,
          drawKey: draw.drawKey,
          label: draw.label,
          order: draw.order ?? order + 1,
          reviewNote: draw.reviewNote,
          timingDay: draw.timingDay,
        })),
      isActive: scenario.isActive,
      isDefault: scenario.isDefault,
      scenarioKey: scenario.scenarioKey,
    })),
    summary: template.summary ?? "Production proposal template",
    templateKey: template.templateKey,
    title: template.title,
  }));
}

export function timelineSetupResultToDraftPackage(
  result: TimelineSetupResult
): ProductionProposalDraftSavePayload {
  return {
    borrowerCoPayBps: result.borrowerCoPayBps,
    borrowerWorkingCapitalLimitCents: dollarsToCents(result.startingCash),
    buildName: `${result.templateTitle} Proposal`,
    contractorAssignments: result.contractorAssignments,
    costItems: result.costItems,
    draws: result.draws,
    lenderDrawPolicyLimitCents: result.reimbursableBudgetCents,
    location: result.projectAddress,
    milestones: result.items.map((item, index) => {
      const durationDays = Math.max(1, item.data.durationDays);
      const dayStart = Math.max(0, Math.round(item.x));
      return {
        budgetCents: dollarsToCents(item.data.amount),
        dayEnd: dayStart + durationDays,
        dayStart,
        dependencyKeys: item.data.dependencyKeys ?? [],
        durationDays,
        icon: item.data.icon,
        key: item.id,
        name: item.data.name,
        order: index + 1,
        submilestones: resolveMilestoneSubmilestones(item.data, item.id).map(
          (submilestone) => ({
            ...(submilestone.budgetCents === undefined
              ? {}
              : { budgetCents: submilestone.budgetCents }),
            ...(submilestone.durationDays === undefined
              ? {}
              : { durationDays: submilestone.durationDays }),
            key: submilestone.key,
            name: submilestone.name,
            order: submilestone.order,
            ...(submilestone.startDay === undefined
              ? {}
              : { startDay: submilestone.startDay }),
          })
        ),
      };
    }),
    proposedStartDate: result.proposedStartDate,
  };
}

function iconForMilestone(
  key: string,
  archetypeKey?: string,
  name?: string
): DemoMilestone["icon"] {
  const value = `${archetypeKey ?? ""} ${key} ${name ?? ""}`.toLowerCase();
  if (value.includes("foundation") || value.includes("site")) {
    return "foundation";
  }
  if (value.includes("kitchen") || value.includes("cabinet")) {
    return "kitchen";
  }
  if (
    value.includes("plumb") ||
    value.includes("mechanical") ||
    value.includes("mep")
  ) {
    return "plumbing";
  }
  if (value.includes("roof") || value.includes("dry-in")) {
    return "roofing";
  }
  if (value.includes("shell") || value.includes("fram")) {
    return "framing";
  }
  if (value.includes("rough")) {
    return "roughIn";
  }
  if (value.includes("exterior") || value.includes("dry")) {
    return "exterior";
  }
  if (value.includes("finish") || value.includes("interior")) {
    return "finishes";
  }
  if (value.includes("close")) {
    return "closeout";
  }
  return "drywall";
}

function dollarsToCents(value: number) {
  return Math.max(0, Math.round(value * 100));
}
