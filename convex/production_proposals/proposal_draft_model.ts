/**
 * Production proposals proposal draft model bounded-context implementation.
 * The parent facade re-exports its handlers to preserve production_proposals function references.
 */
import { type RoleSlug } from "../authz";
import { type Doc, type Id } from "../types";
import { type CostItemBudgetTreatment } from "./proposal_cost_validation.js";

export interface DraftProposalSaveAuth {
  brokerage: Doc<"brokerages">;
  proposal: Doc<"buildProposals">;
  roles: RoleSlug[];
  subject: string;
}

export interface DraftProposalSubmilestoneInput {
  budgetCents?: number;
  durationDays?: number;
  fieldGuidance?: {
    cameraAnglesTiptapJson: string;
    whatToVerifyTiptapJson: string;
  };
  key: string;
  name: string;
  order: number;
  scopeOfWorkTiptapJson?: string;
  startDay?: number;
}

export interface DraftProposalMilestoneInput {
  budgetCents: number;
  dayEnd: number;
  dayStart: number;
  dependencyKeys: string[];
  durationDays: number;
  icon?: string;
  key: string;
  name: string;
  order: number;
  siteVisitGuidance?: {
    cameraAngles: string | string[];
    whatToVerify: string | string[];
  };
  submilestones: DraftProposalSubmilestoneInput[];
}

interface ProductionSubmilestoneScheduleInput {
  budgetCents?: number;
  durationDays?: number;
  fieldGuidance?: {
    cameraAnglesTiptapJson: string;
    whatToVerifyTiptapJson: string;
  };
  key: string;
  name: string;
  order: number;
  scopeOfWorkTiptapJson?: string;
  startDay?: number;
}

export function normalizeProductionMilestoneSchedule<
  T extends {
    dayEnd?: number;
    dayStart?: number;
    durationDays?: number;
    submilestones?: ProductionSubmilestoneScheduleInput[];
  },
>(milestone: T) {
  const dayStart = Math.max(0, Math.round(milestone.dayStart ?? 0));
  const fallbackEnd = Math.max(
    dayStart,
    Math.round(
      milestone.dayEnd ?? dayStart + Math.max(1, milestone.durationDays ?? 1),
    ),
  );
  const requestedDurationDays = Math.max(
    1,
    Math.round(milestone.durationDays ?? fallbackEnd - dayStart),
  );
  let cursor = dayStart;
  let smallestSubmilestoneStart = Number.POSITIVE_INFINITY;
  let largestSubmilestoneEnd = dayStart;
  const submilestones = [...(milestone.submilestones ?? [])]
    .sort(
      (left, right) =>
        left.order - right.order || left.key.localeCompare(right.key),
    )
    .map((submilestone, index) => {
      const startDay = Math.max(0, Math.round(submilestone.startDay ?? cursor));
      const durationDays = Math.max(
        1,
        Math.round(submilestone.durationDays ?? 1),
      );
      const endDay = startDay + durationDays;
      cursor = endDay;
      smallestSubmilestoneStart = Math.min(smallestSubmilestoneStart, startDay);
      largestSubmilestoneEnd = Math.max(largestSubmilestoneEnd, endDay);
      return {
        ...submilestone,
        durationDays,
        key: submilestone.key.trim(),
        name: submilestone.name.trim(),
        order: Math.max(1, Math.round(submilestone.order ?? index + 1)),
        startDay,
      };
    });
  const hasSubmilestones = submilestones.length > 0;
  const scheduleDayStart = hasSubmilestones
    ? smallestSubmilestoneStart
    : dayStart;
  const durationDays = hasSubmilestones
    ? Math.max(1, largestSubmilestoneEnd - scheduleDayStart)
    : Math.max(requestedDurationDays, largestSubmilestoneEnd - dayStart);
  return {
    dayEnd: scheduleDayStart + durationDays,
    dayStart: scheduleDayStart,
    durationDays,
    submilestones,
  };
}

export function assertValidProductionSubmilestones(
  rows: readonly ProductionSubmilestoneScheduleInput[],
  label: string,
) {
  if (rows.length === 0) {
    throw new Error(`${label} must contain at least one valid Sub-milestone.`);
  }
  const keys = new Set<string>();
  for (const row of rows) {
    const key = row.key.trim();
    const name = row.name.trim();
    if (!key || !name) {
      throw new Error(
        `${label} contains a Sub-milestone with an empty key or name.`,
      );
    }
    if (keys.has(key)) {
      throw new Error(
        `${label} contains duplicate Sub-milestone key ${key}.`,
      );
    }
    keys.add(key);
  }
}

export function sumProductionSubmilestoneBudgetCents(
  rows: ProductionSubmilestoneScheduleInput[],
) {
  return rows.reduce(
    (total, row) => total + Math.max(0, Math.round(row.budgetCents ?? 0)),
    0,
  );
}

export interface DraftProposalDrawInput {
  amountCents: number;
  customDate?: boolean;
  drawKey: string;
  label: string;
  milestoneKey?: string;
  order?: number;
  timingDay: number;
}

export interface DraftProposalCostItemInput {
  budgetSubmilestoneKey?: null | string;
  budgetTreatment?: CostItemBudgetTreatment;
  costCents: number;
  description?: string;
  deliveryEndDay?: number;
  deliveryInstructions?: string;
  deliveryLocation?: string;
  deliveryStartDay?: number;
  itemType: "equipment" | "material";
  milestoneKey: string;
  quantity: number;
  relevantSubmilestoneKeys: string[];
  specificationTiptapJson?: string;
  supplier?: string;
  title: string;
  unit?: string;
}

export interface DraftProposalContractorAssignmentInput {
  contractorId?: Id<"contractorProfiles">;
  contractorName: string;
  estimatedCostCents?: number;
  estimatedHours?: number;
  milestoneKey: string;
  role: string;
  submilestoneKeys: string[];
}

export interface DraftProposalSavedMilestone {
  _id: Id<"proposalMilestones">;
  budgetCents: number;
  dayEnd: number;
  drawAvailabilityCents: number;
  key: string;
}

export interface DraftProposalPlanRows {
  drawIdByMilestoneKey: Map<string, Id<"proposalDrawScheduleRows">>;
  milestoneByKey: Map<string, DraftProposalSavedMilestone>;
  submilestoneByMilestoneAndKey: Map<string, Id<"proposalSubmilestones">>;
  totalBudgetCents: number;
}
