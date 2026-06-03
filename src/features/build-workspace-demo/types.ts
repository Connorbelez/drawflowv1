import type { ContractorPlanningModel } from "#/features/contractors/ContractorPlanningPanel.tsx";

import type {
  BuildWorkspaceAssignContractorInput,
  BuildWorkspaceCreateAndAssignContractorInput,
} from "./build-workspace-contractor-planning.ts";

export type WorkspaceMode = "active" | "proposal";

export type WorkspaceRole = "builderLead" | "lenderAdmin" | "siteVisitor";

export type MilestoneStatus =
  | "proposed"
  | "notStarted"
  | "inProgress"
  | "blocked"
  | "evidenceRequired"
  | "evidenceSubmitted"
  | "underReview"
  | "approved";

export type EvidenceStatus =
  | "notStarted"
  | "draft"
  | "submitted"
  | "locationUnverified"
  | "needsInfo"
  | "accepted";

export type DrawStatus =
  | "planned"
  | "evidencePending"
  | "blocked"
  | "readyForRelease"
  | "released";

export type DependencyHardness = "hard" | "soft";

export type OptimizationPlanId =
  | "cheapestFeasible"
  | "fastest"
  | "capitalConstrained";

export type WorkspaceIssueSeverity = "blocking" | "warning" | "info";

export type WorkspaceIssueScope =
  | "workspace"
  | "drawGroup"
  | "milestone"
  | "dependency";

export interface WorkspaceIssueQuickFix {
  action: string;
  label: string;
  targetId?: string;
}

export interface WorkspaceIssue {
  code: string;
  conditionHash: string;
  dependencyIds: string[];
  dismissed: boolean;
  dismissible: boolean;
  drawGroupIds: string[];
  id: string;
  impact: string;
  message: string;
  milestoneIds: string[];
  quickFix?: WorkspaceIssueQuickFix;
  scope: WorkspaceIssueScope;
  severity: WorkspaceIssueSeverity;
  title: string;
}

export type AuditEventType =
  | "proposalSubmitted"
  | "milestoneChanged"
  | "dependencyChanged"
  | "drawChanged"
  | "evidenceChanged"
  | "approvalChanged"
  | "budgetRevisionRequested";

export interface BuildSummary {
  borrowerName: string;
  buildName: string;
  lenderName: string;
  organizationId: string;
  phaseLabel: string;
  proposalStatus: "draft" | "submitted" | "adminReview" | "approved";
  siteAddress: string;
}

export interface BudgetSummary {
  borrowerWorkingCapitalLimit: number;
  drawFeeBps: number;
  interestRatePct: number;
  lenderDrawPolicyLimit: number;
  requestedLoanAmount: number;
  totalBuildBudget: number;
  version: number;
}

export interface EvidenceFileSummary {
  fileName: string;
  id: string;
  isSample: boolean;
  mimeType: string;
  sizeBytes: number;
  uploadedAt: string;
  uploadedByPersona: string;
}

export interface EvidencePackageSummary {
  createdAt: string;
  frozenAt?: string;
  id: string;
  reviewStatus: string;
  status: string;
  submittedAt?: string;
}

export interface ReviewReportSummary {
  createdAt: string;
  id: string;
  notes: string;
  outcome: string;
  reviewerPersona: string;
}

export interface SiteVisitTargetSummary {
  milestoneKey: string;
  milestoneName: string;
  milestoneOrder: number;
  submilestones: string[];
}

export interface SiteVisitFileSummary {
  fileName: string;
  id: string;
  mimeType: string;
  sizeBytes: number;
  targetMilestoneKey?: string;
  targetSubmilestoneKey?: string;
  uploadedAt: string;
  url?: string | null;
}

export interface SiteVisitSummary {
  assignedPersona: string;
  claimedAt?: string;
  completedAt?: string;
  completionObserved?: boolean;
  createdAt: string;
  files?: SiteVisitFileSummary[];
  id: string;
  notes?: string;
  recommendedOutcome?: string;
  requestReason?: string;
  riskFlags: string[];
  status: string;
  targetMilestoneKeys?: string[];
  targets?: SiteVisitTargetSummary[];
  tokenConsumedAt?: string;
  tokenExpiresAt?: string;
}

export interface Milestone {
  actualCost: number;
  blockedByKeys: string[];
  blockingKeys: string[];
  blockingReasons: string[];
  code: string;
  completionReport: string;
  drawGroupId: string;
  endAt: Date;
  estimatedCost: number;
  estimatedDurationDays: number;
  evidenceFiles: EvidenceFileSummary[];
  evidencePackages: EvidencePackageSummary[];
  evidenceStatus: EvidenceStatus;
  id: string;
  isDragLocked: boolean;
  isSystem?: boolean;
  issues: WorkspaceIssue[];
  lane: string;
  name: string;
  notes: string;
  progress: number;
  requestedAmountCents?: number;
  requiresSiteVisit: boolean;
  reviewReports: ReviewReportSummary[];
  siteVisitRequested: boolean;
  siteVisits: SiteVisitSummary[];
  staffRecommendation: string;
  startAt: Date;
  status: MilestoneStatus;
  warningCount: number;
}

export interface DrawGroup {
  amount: number;
  eligibleAt: Date;
  endAt: Date;
  id: string;
  issues: WorkspaceIssue[];
  label: string;
  order: number;
  plannedAt?: Date;
  rowIndex: number;
  rowSpan: number;
  startAt: Date;
  status: DrawStatus;
  timingDay?: number;
  totalExposure: number;
  warningState: "clear" | "warning" | "critical";
}

export type DrawGroupPatch = Partial<
  Pick<DrawGroup, "amount" | "eligibleAt" | "label" | "plannedAt">
> & {
  timingDay?: number;
};

export interface MilestoneDependency {
  fromMilestoneId: string;
  hardness: DependencyHardness;
  id: string;
  isSystem: boolean;
  toMilestoneId: string;
  type: string;
}

export interface OptimizationPlan {
  durationDays: number;
  id: OptimizationPlanId;
  label: string;
  peakWorkingCapital: number;
  projectedInterest: number;
  summary: string;
  totalFees: number;
  warning: string;
}

export interface AuditEvent {
  actor: string;
  command: string;
  id: string;
  message: string;
  reason?: string;
  role: WorkspaceRole;
  timestamp: string;
  type: AuditEventType;
}

export interface OutboxEvent {
  eventType: string;
  id: string;
  payloadPreview: string;
  relatedEntity: string;
  status: string;
  timestamp: string;
}

export interface SiteVisitReportDraft {
  completionObserved: boolean;
  notes: string;
  recommendedOutcome: string;
}

export interface AddMilestoneInput {
  drawGroupId: string;
  estimatedCost: number;
  estimatedDurationDays: number;
  name: string;
  startAt?: Date;
}

export type MilestonePatch = Partial<
  Pick<
    Milestone,
    | "name"
    | "status"
    | "evidenceStatus"
    | "estimatedCost"
    | "actualCost"
    | "estimatedDurationDays"
    | "progress"
    | "notes"
    | "completionReport"
    | "warningCount"
    | "lane"
  >
>;

export interface BuildWorkspaceActions {
  addDependency: (
    fromMilestoneId: string,
    toMilestoneId: string,
    hardness: DependencyHardness
  ) => Promise<void>;
  addMilestone: (input: AddMilestoneInput) => Promise<void>;
  addSampleEvidence: (milestoneId: string) => Promise<void>;
  applyIssueQuickFix: (issue: WorkspaceIssue) => Promise<void>;
  applyRecommendedPlan: () => Promise<void>;
  approveMilestone: (milestoneId: string, reason: string) => Promise<void>;
  batchMoveMilestoneDates: (
    milestoneMoves: {
      milestoneId: string;
      startAt: Date;
      endAt: Date | null;
    }[],
    reason?: string,
    source?: "selection" | "drawGroup",
    sourceId?: string
  ) => Promise<void>;
  claimSiteVisit: (milestoneId: string) => Promise<void>;
  dismissIssue: (issue: WorkspaceIssue, reason?: string) => Promise<void>;
  mergeDrawGroups: (
    sourceDrawGroupId: string,
    targetDrawGroupId: string
  ) => Promise<void>;
  moveMilestoneDates: (
    milestoneId: string,
    startAt: Date,
    endAt: Date | null,
    reason?: string
  ) => Promise<void>;
  moveMilestoneToDrawGroup: (
    milestoneId: string,
    drawGroupId: string
  ) => Promise<void>;
  recomputeProposalPlan: () => Promise<void>;
  rejectMilestone: (milestoneId: string, reason: string) => Promise<void>;
  removeDependency: (dependencyId: string) => Promise<void>;
  reorderMilestone: (
    milestoneId: string,
    direction: "up" | "down"
  ) => Promise<void>;
  reorderMilestoneAbsolute: (
    milestoneId: string,
    fromIndex: number,
    toIndex: number
  ) => Promise<void>;
  requestMoreInformation: (
    milestoneId: string,
    reason: string
  ) => Promise<void>;
  requestSiteVisit: (
    milestoneId: string,
    reason: string,
    includedMilestoneIds?: string[]
  ) => Promise<{ token?: string; url?: string; visitId?: string } | void>;
  resetWorkspace: () => Promise<void>;
  reviewEvidence: (
    milestoneId: string,
    accepted: boolean,
    reason: string
  ) => Promise<void>;
  selectMilestone: (milestoneId: string) => void;
  setActivePlan: (planId: OptimizationPlanId) => void;
  setDependencyHardness: (
    dependencyId: string,
    hardness: DependencyHardness
  ) => Promise<void>;
  setMilestoneDragLocked: (
    milestoneId: string,
    locked: boolean
  ) => Promise<void>;
  setRole: (role: WorkspaceRole) => void;
  splitDrawGroup: (
    drawGroupId: string,
    afterMilestoneId: string
  ) => Promise<void>;
  submitCompletionClaim: (
    milestoneId: string,
    requestedAmountCents: number
  ) => Promise<void>;
  submitProposal: () => Promise<void>;
  submitSiteVisitReport: (
    milestoneId: string,
    report: SiteVisitReportDraft
  ) => Promise<void>;
  updateForecastDates: (
    milestoneId: string,
    startAt: Date,
    endAt: Date,
    reason: string
  ) => Promise<void>;
  updateMilestone: (
    milestoneId: string,
    patch: MilestonePatch
  ) => Promise<void>;
  updateDrawGroup?: (
    drawGroupId: string,
    patch: DrawGroupPatch
  ) => Promise<void>;
  updateProgress: (milestoneId: string, progress: number) => Promise<void>;
  uploadEvidence: (
    milestoneId: string,
    file: File,
    geofencePassed: boolean
  ) => Promise<void>;
  assignContractorToMilestone?: (
    input: BuildWorkspaceAssignContractorInput
  ) => Promise<void>;
  createAndAssignContractor?: (
    input: BuildWorkspaceCreateAndAssignContractorInput
  ) => Promise<void>;
  resolveContractorMilestoneKey?: (milestoneId: string) => string;
}

export interface BuildWorkspaceState {
  activePlanId: OptimizationPlanId;
  auditEvents: AuditEvent[];
  budget: BudgetSummary;
  build: BuildSummary;
  compilationStatus: "upToDate" | "updating" | "blocked" | "failed";
  dependencies: MilestoneDependency[];
  drawGroups: DrawGroup[];
  isLoading: boolean;
  issues: WorkspaceIssue[];
  latestPlanningRun?: unknown;
  milestones: Milestone[];
  mode: WorkspaceMode;
  needsSeed: boolean;
  optimizationPlans: OptimizationPlan[];
  outboxEvents: OutboxEvent[];
  role: WorkspaceRole;
  selectedMilestoneId: string;
  terminalMessage?: string;
  validationErrors: string[];
  validationWarnings: string[];
  contractorPlanning?: ContractorPlanningModel | null;
}

export type BuildWorkspaceAdapter = BuildWorkspaceState & BuildWorkspaceActions;
