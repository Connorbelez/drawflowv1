import type {
  OptimizationPlan,
  OptimizationPlanId,
} from "#/features/build-workspace-demo/types.ts";
import type { ContractorPlanningModel } from "#/features/contractors/ContractorPlanningPanel.tsx";
import type {
  ContractorAssignmentCostDraft,
  ContractorProfileDraft,
} from "#/features/contractors/ContractorQuickAddDrawer.tsx";
import type { ConvexTimelineWorkspace } from "#/features/timeline-workspace/-timeline-convex-adapter.ts";
import type { TimelineSubmilestoneFieldGuidance } from "#/features/timeline-workspace/-timeline-milestone-submilestones.ts";
import type { IsometricIconKey } from "#/features/timeline-workspace/-timeline-share-snapshot.ts";
import type { Id } from "../../../convex/_generated/dataModel";

export const BASE_DATE = new Date(2026, 5, 1);
export const DRAW_FEE_DOLLARS = 500;
export const DEFAULT_INTEREST_RATE_PCT = 9.25;

export interface ProposalGanttSubmilestoneDraft {
  budgetCents?: number;
  durationDays?: number;
  fieldGuidance?: TimelineSubmilestoneFieldGuidance;
  key: string;
  name: string;
  order: number;
  scopeOfWorkTiptapJson?: string;
  startDay?: number;
}

export interface ProposalGanttMilestoneDraft {
  budgetCents: number;
  dayEnd: number;
  dayStart: number;
  dependencyKeys: string[];
  durationDays: number;
  icon?: IsometricIconKey;
  key: string;
  name: string;
  order: number;
  submilestones: ProposalGanttSubmilestoneDraft[];
}

export interface ProposalGanttDrawDraft {
  amountCents: number;
  customDate?: boolean;
  drawKey: string;
  label: string;
  milestoneKey?: string;
  order?: number;
  timingDay: number;
}

export interface DerivedProposalDrawGroup {
  amountCents: number;
  draw: ProposalGanttDrawDraft;
  drawAvailabilityCents: number;
  endDay: number;
  groupMilestones: ProposalGanttMilestoneDraft[];
  order: number;
  startDay: number;
  submilestones: Array<
    ProposalGanttSubmilestoneDraft & {
      groupOrdinal: number;
      milestoneKey: string;
      milestoneName: string;
    }
  >;
}

export interface ProposalGanttSubmilestoneRow {
  budgetCents: number;
  dayEnd: number;
  dayStart: number;
  durationDays: number;
  id: string;
  milestoneKey: string;
  milestoneName: string;
  milestoneOrder: number;
  name: string;
  order: number;
  submilestone: ProposalGanttSubmilestoneDraft;
  submilestoneKey: string;
}

export interface ProductionProposalGanttWorkspaceProps {
  baseDate?: string;
  borrowerCoPayBps: number;
  borrowerStartingCashCents: number;
  buildName: string;
  contractorPlanning?: ContractorPlanningModel | null;
  draws: ProposalGanttDrawDraft[];
  lenderDrawPolicyLimitCents: number;
  location: string;
  milestones: ProposalGanttMilestoneDraft[];
  onAssignContractorToMilestone?: (input: {
    assignmentCost?: ContractorAssignmentCostDraft;
    contractorId: string;
    milestoneId: string;
    role: string;
    submilestoneKeys?: string[];
  }) => Promise<void>;
  onCreateAndAssignContractor?: (input: {
    assignmentCost?: ContractorAssignmentCostDraft;
    contractor: ContractorProfileDraft;
    milestoneId: string;
    role: string;
    submilestoneKeys?: string[];
  }) => Promise<void | string | { contractorId?: string }>;
  onDrawsChange: (draws: ProposalGanttDrawDraft[]) => void;
  onInviteContractor?: (contractorId: string) => Promise<void>;
  onMilestonesChange: (milestones: ProposalGanttMilestoneDraft[]) => void;
  onSelectPlan?: (plan: OptimizationPlan) => void;
  onSubmit?: () => void;
  proposalStatus: "draft" | "submitted" | "approved" | "closed";
  selectedPlanId?: OptimizationPlanId;
}

export interface ProductionProposalTimelineGanttWorkspaceProps {
  persistenceMode?: "convex" | "noop";
  proposalId: Id<"buildProposals">;
  workosOrganizationId: string;
  workspace: ConvexTimelineWorkspace & {
    activeBuild?: { startDate?: string } | null;
    contractorPlanning?: ContractorPlanningModel | null;
    proposal: {
      borrowerCoPayBps?: number;
      borrowerStartingCashCents?: number;
      buildName: string;
      lenderDrawPolicyLimitCents?: number;
      location: string;
      proposedStartDate?: string;
      selectedPlan?: {
        planKey: OptimizationPlanId;
      };
      status: string;
      totalBudgetCents: number;
    };
  };
}
