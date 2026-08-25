import type { TimelinePlanRow } from "#/features/builder-dashboard/BuilderTimelineDashboard.tsx";
import type { BuilderStaffAppPermissions } from "#/features/builder-staff/app-permissions.ts";
import type { MaterialPlanningItem } from "#/features/material-planning/MaterialPlanningTab.tsx";
import type { IsometricIconKey } from "#/features/timeline-workspace/-timeline-share-snapshot.ts";
import type {
  ProposalGanttDrawDraft,
  ProposalGanttMilestoneDraft,
} from "./ProductionProposalGanttWorkspace.tsx";
import type {
  ProposalLenderApprovalSummary,
  ProposalLenderAssignmentRecord,
} from "./ProposalLenderAssignmentSection.tsx";

export type ProductionProposalStatus =
  | "draft"
  | "submitted"
  | "approved"
  | "closed";

export interface ProductionProposal {
  _id?: string;
  borrowerCoPayBps: number;
  borrowerCoPayCents?: number;
  borrowerStartingCashCents: number;
  buildName: string;
  capitalSource?: "internal" | "external";
  currentProposalRevisionId?: string;
  currentProposalRevisionNumber?: number;
  currentReviewPolicyVersionId?: string;
  interestAnnualBps?: number;
  lenderDrawPolicyLimitCents: number;
  location: string;
  proposedStartDate?: string;
  selectedPlan?: {
    metrics?: {
      drawCount: number;
      drawFeesCents: number;
      interestCostCents: number;
      minimumCashReserveCents: number;
      projectedDurationDays: number;
      requiredWorkingCapitalCents?: number;
      startingCashCents: number;
      totalCostCents: number;
      totalDrawAmountCents: number;
    };
    name: string;
    planKey: "cheapestFeasible" | "fastest" | "capitalConstrained";
    recommendationReason?: string;
  };
  status: ProductionProposalStatus;
  totalBudgetCents: number;
}

export interface ProductionProposalIdentity {
  email?: string;
  name?: string;
  workosUserId: string;
}

export interface ProductionProposalAssignment {
  broker?: ProductionProposalIdentity | null;
  brokerage?: {
    _id?: string;
    displayName: string;
    legalName?: string;
    workosOrganizationId?: string;
  } | null;
  builder?: {
    _id: string;
    accounts?: Array<ProductionProposalIdentity & { role?: string }>;
    displayName: string;
    legalName?: string;
    ownerEmail?: string;
    status?: string;
  } | null;
  builderAssigned?: boolean;
  claimLinkActive?: boolean;
  createdBy?: ProductionProposalIdentity | null;
  initiatedFromBackoffice?: boolean;
}

export interface ProductionMilestone {
  budgetCents: number;
  dayEnd: number;
  dayStart: number;
  dependencyKeys?: string[];
  drawAvailabilityCents?: number;
  durationDays?: number;
  icon?: IsometricIconKey;
  key: string;
  name: string;
  order: number;
}

export interface ProductionSubmilestone {
  _id?: string;
  budgetCents?: number;
  durationDays?: number;
  key: string;
  milestoneKey: string;
  name: string;
  order?: number;
  startDay?: number;
}

export interface ProductionDraw {
  amountCents: number;
  drawKey: string;
  label: string;
  milestoneKey?: string;
  order?: number;
  timingDay: number;
}

export interface ProductionDocument {
  documentType: string;
  fileName: string;
  mimeType?: string;
  sizeBytes?: number;
  status: string;
  storageId?: string;
  storageUrl?: string | null;
}

export interface ProductionProposalDetail {
  activeBuild?: { _id?: string; startDate?: string; timezone?: string } | null;
  appPermissions?: BuilderStaffAppPermissions | null;
  assignment?: ProductionProposalAssignment | null;
  costItems?: MaterialPlanningItem[];
  documents?: ProductionDocument[];
  draws?: ProductionDraw[];
  lenderApproval?: ProposalLenderApprovalSummary | null;
  lenderAssignment?: ProposalLenderAssignmentRecord | null;
  lenderAssignmentHistory?: ProposalLenderAssignmentRecord[];
  lifecycle?: {
    activation: "active" | "inactive";
    backOfficeApproval:
      | "approved"
      | "changes_requested"
      | "not_submitted"
      | "pending"
      | "rejected";
    capitalSource: "external" | "internal";
    closing: "closed" | "not_ready" | "pending_closing";
    externalAssignment:
      | "assigned"
      | "not_required"
      | "unassigned"
      | "withdrawn";
    lenderConfirmation: "approved" | "declined" | "not_required" | "pending";
    proposalState: "approved" | "closed" | "draft" | "submitted";
  };
  loanFacility?: { interestAnnualBps?: number; principalCents?: number } | null;
  milestones?: ProductionMilestone[];
  permitWaiver?: { reason: string } | null;
  plannedDraws?: ProductionDraw[];
  proposal: ProductionProposal;
  submilestones?: ProductionSubmilestone[];
}

export interface ProposalDrawAvailabilityViolation {
  availableCents: number;
  draw: ProductionDraw;
  overageCents: number;
}

export type ProductionReviewTab =
  | "calendar"
  | "closing"
  | "contractors"
  | "draws"
  | "gantt"
  | "milestones"
  | "materials"
  | "packet"
  | "review"
  | "staff"
  | "timeline";

export type PacketMilestonePatch = {
  budgetCents: number;
  dayEnd: number;
  dayStart: number;
  durationDays: number;
  name: string;
  submilestones: PacketSubmilestonePatch[];
};

export type PacketMilestoneCreatePayload = PacketMilestonePatch & {
  dependencyKeys?: string[];
  drawAvailabilityCents?: number;
  durationDays: number;
  evidenceState: string;
  milestoneKey: string;
  order: number;
  policyState: string;
  status?: string;
  x: number;
};

export type PacketSubmilestonePatch = {
  budgetCents?: number;
  durationDays?: number;
  key: string;
  name: string;
  order: number;
  startDay?: number;
};

export type PacketSubmilestoneFormDraft = {
  budgetDollars: string;
  dayEnd: string;
  key: string;
  name: string;
  order: number;
  startDay: string;
};

export type PacketMilestoneFormDraft = {
  budgetDollars: string;
  dayEnd: string;
  dayStart: string;
  milestoneKey: string;
  mode: "create" | "edit";
  name: string;
  order: number;
  submilestones: PacketSubmilestoneFormDraft[];
};

export type PacketSubmilestoneOverlayDraft = {
  budgetDollars: string;
  dayEnd: string;
  key?: string;
  milestoneKey: string;
  name: string;
  order?: number;
  startDay: string;
};

export type PacketMilestoneGroup = {
  fallbackBudgets: number[];
  fallbackDurations: number[];
  fallbackStartOffsets: number[];
  milestone: ProductionMilestone;
  submilestones: ProductionSubmilestone[];
};

export type PacketSubmilestoneTableRow = {
  budgetCents: number;
  budgetDollars: string;
  dayEndDraft: string;
  durationDays: number;
  key: string;
  name: string;
  startDay: number;
  startDayDraft: string;
};

export interface ProductionKanbanCard {
  activeBuildId?: string;
  approvedAt?: number;
  assignedBrokerEmail?: string;
  assignedBrokerName?: string;
  assignedBrokerWorkosUserId?: string;
  borrowerCoPayBps?: number;
  borrowerCoPayCents?: number;
  borrowerStartingCashCents?: number;
  budgetGovernance?: TimelinePlanRow["budgetGovernance"];
  builderAssigned?: boolean;
  builderEmail?: string;
  builderLegalName?: string;
  builderName?: string;
  builderProfileId?: string;
  buildName?: string;
  buildStatus?: TimelinePlanRow["buildStatus"];
  column: ProductionProposalStatus;
  createdAt?: number;
  createdByEmail?: string;
  createdByName?: string;
  createdByWorkosUserId?: string;
  drawCount?: number;
  href?: string;
  imageUrl?: string | null;
  lenderDrawPolicyLimitCents?: number;
  location?: string;
  locationLatitude?: number;
  locationLongitude?: number;
  milestoneCount?: number;
  milestonesBehindSchedule?: number;
  pendingDrawRequestCount?: number;
  pendingModificationRequestCount?: number;
  planKey?: "capitalConstrained" | "cheapestFeasible" | "fastest";
  planName?: string;
  proposalId: string;
  proposedStartDate?: string;
  reviewOutcome?: "approved" | "none" | "rejected" | "requested_changes";
  statusLabel?: string;
  submittedAt?: number;
  subtitle?: string;
  title: string;
  totalBudgetCents: number;
  updatedAt: number;
  updatedByWorkosUserId?: string;
}

export interface ProductionBuilderOption {
  _id: string;
  displayName: string;
  email?: string;
  workosUserIds?: string[];
}

export interface ProductionKanbanColumn {
  cards: ProductionKanbanCard[];
  id: ProductionProposalStatus;
  name: string;
}

export interface ProductionKanban {
  columns: ProductionKanbanColumn[];
}

export interface ProductionProposalSettings {
  archetypes: Array<{ key: string; name: string; status: string }>;
  brokerage?: unknown | null;
  provisioningRequired?: boolean;
  templates: Array<{
    milestones: Array<{
      archetypeKey?: string;
      dependencyKeys?: string[];
      durationDays?: number;
      icon?: IsometricIconKey;
      key: string;
      name: string;
      percentageBps: number;
      siteVisitGuidance?: {
        cameraAngles: string;
        whatToVerify: string;
      };
      submilestones: Array<{
        budgetCents?: number;
        durationDays?: number;
        fieldGuidance?: {
          cameraAnglesTiptapJson: string;
          whatToVerifyTiptapJson: string;
        };
        key: string;
        name: string;
        scopeOfWorkTiptapJson?: string;
      }>;
      type?: string;
    }>;
    scenarios: Array<{ isDefault: boolean; name: string; scenarioKey: string }>;
    templateKey: string;
    title: string;
  }>;
  workflowRules: Array<{
    allowPermitWaiverByRoles: string[];
    proposalStates: string[];
    requirePermitForApproval: boolean;
    ruleKey: string;
    settings: { interestStartsOn?: string; reimbursementOnly?: boolean };
    version: number;
  }>;
}

export interface ProductionProposalDraftSavePayload {
  borrowerCoPayBps: number;
  borrowerStartingCashCents: number;
  buildName: string;
  contractorAssignments?: Array<{
    contractorId?: string;
    contractorName: string;
    estimatedCostCents?: number;
    estimatedHours?: number;
    milestoneKey: string;
    role: string;
    submilestoneKeys: string[];
  }>;
  costItems?: Array<{
    budgetSubmilestoneKey?: string;
    budgetTreatment?: "add" | "logOnly" | "maintain";
    costCents: number;
    description?: string;
    itemType: "equipment" | "material";
    milestoneKey: string;
    quantity: number;
    relevantSubmilestoneKeys: string[];
    supplier?: string;
    title: string;
  }>;
  documents?: Array<{
    documentType: "permit" | "budget" | "plan" | "supporting";
    fileName: string;
    mimeType: string;
    sizeBytes: number;
    storageId?: string;
  }>;
  draws?: ProposalGanttDrawDraft[];
  lenderDrawPolicyLimitCents: number;
  location: string;
  milestones: Array<{
    budgetCents: number;
    dayEnd: number;
    dayStart: number;
    dependencyKeys: string[];
    durationDays: number;
    icon?: IsometricIconKey;
    key: string;
    name: string;
    order: number;
    submilestones: Array<{
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
    }>;
  }>;
  proposedStartDate?: string;
}
