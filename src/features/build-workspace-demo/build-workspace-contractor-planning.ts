import type { ContractorPlanningModel } from "#/features/contractors/ContractorPlanningPanel.tsx";
import type {
  ContractorAssignmentCostDraft,
  ContractorProfileDraft,
} from "#/features/contractors/ContractorQuickAddDrawer.tsx";

type ProductionContractorSource = {
  availableContractors?: Array<{
    _id: string;
    city?: string;
    defaultPayRateCents?: number;
    defaultPayRateUnit?: "hour" | "day" | "fixed";
    email?: string;
    name: string;
    onboardingStatus?: "profile_only" | "invited" | "account_linked";
    trades?: string[];
  }>;
  contractors?: Array<{
    _id: string;
    city?: string;
    contractorId?: string;
    defaultPayRateCents?: number;
    defaultPayRateUnit?: "hour" | "day" | "fixed";
    email?: string;
    hourlyRateCents?: number;
    name: string;
    onboardingStatus?: "profile_only" | "invited" | "account_linked";
    payRateCents?: number;
    payRateUnit?: "hour" | "day" | "fixed";
    role: string;
    trades?: string[];
  }>;
  milestoneContractorAssignments?: Array<{
    _id: string;
    actualCostCents?: number;
    actualHours?: number;
    contractor?: { _id: string; name: string; trades?: string[] };
    contractorId: string;
    estimatedCostCents?: number;
    estimatedHours?: number;
    milestoneKey: string;
    role: string;
    status: string;
    submilestoneKey?: string;
  }>;
  milestones: Array<{ key: string; name: string }>;
  submilestones?: Array<{
    key: string;
    milestoneKey: string;
    name: string;
  }>;
};

export type BuildWorkspaceAssignContractorInput = {
  assignmentCost?: ContractorAssignmentCostDraft;
  contractorId: string;
  milestoneId: string;
  role: string;
  submilestoneKeys?: string[];
};

export type BuildWorkspaceCreateAndAssignContractorInput = {
  assignmentCost?: ContractorAssignmentCostDraft;
  contractor: ContractorProfileDraft;
  milestoneId: string;
  role: string;
  submilestoneKeys?: string[];
};

export function parseGanttMilestoneScopeId(ganttMilestoneId: string): {
  milestoneKey: string;
  submilestoneKeys?: string[];
} {
  const separatorIndex = ganttMilestoneId.indexOf("::");
  if (separatorIndex === -1) {
    return { milestoneKey: ganttMilestoneId };
  }
  const milestoneKey = ganttMilestoneId.slice(0, separatorIndex);
  const submilestoneKey = ganttMilestoneId.slice(separatorIndex + 2);
  return {
    milestoneKey,
    submilestoneKeys: submilestoneKey ? [submilestoneKey] : undefined,
  };
}

export function contractorPlanningFromProductionDetail(
  detail: ProductionContractorSource
): ContractorPlanningModel {
  const milestoneNameByKey = new Map(
    detail.milestones.map((milestone) => [milestone.key, milestone.name])
  );
  const submilestoneNameByKey = new Map(
    (detail.submilestones ?? []).map((submilestone) => [
      `${submilestone.milestoneKey}:${submilestone.key}`,
      submilestone.name,
    ])
  );

  const proposalContractors = (detail.contractors ?? []).map((contractor) => ({
    _id: contractor.contractorId ?? contractor._id,
    city: contractor.city,
    contractorId: contractor.contractorId ?? contractor._id,
    defaultPayRateCents:
      contractor.payRateCents ??
      contractor.defaultPayRateCents ??
      contractor.hourlyRateCents,
    defaultPayRateUnit: contractor.payRateUnit ?? contractor.defaultPayRateUnit,
    email: contractor.email,
    name: contractor.name,
    onboardingStatus: contractor.onboardingStatus,
    role: contractor.role,
    status: "attached",
    trades: contractor.trades,
  }));

  const availableContractors = (detail.availableContractors ?? []).map(
    (contractor) => ({
      _id: contractor._id,
      city: contractor.city,
      defaultPayRateCents: contractor.defaultPayRateCents,
      defaultPayRateUnit: contractor.defaultPayRateUnit,
      email: contractor.email,
      name: contractor.name,
      onboardingStatus: contractor.onboardingStatus,
      trades: contractor.trades,
    })
  );

  const milestoneAssignments = (
    detail.milestoneContractorAssignments ?? []
  ).map((assignment) => ({
    _id: assignment._id,
    contractorId: String(assignment.contractorId),
    contractorName:
      assignment.contractor?.name ??
      proposalContractors.find(
        (contractor) =>
          contractor.contractorId === String(assignment.contractorId)
      )?.name ??
      availableContractors.find(
        (contractor) => contractor._id === String(assignment.contractorId)
      )?.name ??
      "Assigned contractor",
    estimatedCostCents: assignment.estimatedCostCents,
    estimatedHours: assignment.estimatedHours,
    milestoneKey: assignment.milestoneKey,
    milestoneName:
      milestoneNameByKey.get(assignment.milestoneKey) ??
      assignment.milestoneKey,
    role: assignment.role,
    status: assignment.status,
    submilestoneKey: assignment.submilestoneKey,
    submilestoneName: assignment.submilestoneKey
      ? submilestoneNameByKey.get(
          `${assignment.milestoneKey}:${assignment.submilestoneKey}`
        )
      : undefined,
  }));

  return {
    availableContractors,
    milestoneAssignments,
    proposalContractors,
  };
}

export function contractorPlanningFromTimelinePlanning(
  planning: ContractorPlanningModel | null | undefined
): ContractorPlanningModel | null {
  if (!planning) {
    return null;
  }
  return planning;
}
