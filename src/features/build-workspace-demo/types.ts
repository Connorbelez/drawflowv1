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
  dismissible: boolean;
  dismissed: boolean;
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
  evidenceStatus: EvidenceStatus;
  id: string;
  isDragLocked: boolean;
  isSystem?: boolean;
  lane: string;
  name: string;
  notes: string;
  progress: number;
  requestedAmountCents?: number;
  siteVisitRequested: boolean;
  staffRecommendation: string;
  startAt: Date;
  status: MilestoneStatus;
  warningCount: number;
  issues: WorkspaceIssue[];
}

export interface DrawGroup {
  amount: number;
  endAt: Date;
  id: string;
  label: string;
  order: number;
  rowIndex: number;
  rowSpan: number;
  startAt: Date;
  status: DrawStatus;
  totalExposure: number;
  warningState: "clear" | "warning" | "critical";
  eligibleAt: Date;
  issues: WorkspaceIssue[];
}

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
  applyRecommendedPlan: () => Promise<void>;
  approveMilestone: (milestoneId: string, reason: string) => Promise<void>;
  claimSiteVisit: (milestoneId: string) => Promise<void>;
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
  setMilestoneDragLocked: (
    milestoneId: string,
    locked: boolean
  ) => Promise<void>;
  moveMilestoneToDrawGroup: (
    milestoneId: string,
    drawGroupId: string
  ) => Promise<void>;
  recomputeProposalPlan: () => Promise<void>;
  dismissIssue: (issue: WorkspaceIssue, reason?: string) => Promise<void>;
  applyIssueQuickFix: (issue: WorkspaceIssue) => Promise<void>;
  reorderMilestoneAbsolute: (
    milestoneId: string,
    fromIndex: number,
    toIndex: number
  ) => Promise<void>;
  rejectMilestone: (milestoneId: string, reason: string) => Promise<void>;
  removeDependency: (dependencyId: string) => Promise<void>;
  reorderMilestone: (
    milestoneId: string,
    direction: "up" | "down"
  ) => Promise<void>;
  requestMoreInformation: (
    milestoneId: string,
    reason: string
  ) => Promise<void>;
  requestSiteVisit: (milestoneId: string, reason: string) => Promise<void>;
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
  updateProgress: (milestoneId: string, progress: number) => Promise<void>;
  uploadEvidence: (
    milestoneId: string,
    file: File,
    geofencePassed: boolean
  ) => Promise<void>;
}

export interface BuildWorkspaceState {
  activePlanId: OptimizationPlanId;
  auditEvents: AuditEvent[];
  budget: BudgetSummary;
  build: BuildSummary;
  dependencies: MilestoneDependency[];
  drawGroups: DrawGroup[];
  isLoading: boolean;
  latestPlanningRun?: unknown;
  issues: WorkspaceIssue[];
  compilationStatus: "upToDate" | "updating" | "blocked" | "failed";
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
}

export type BuildWorkspaceAdapter = BuildWorkspaceState & BuildWorkspaceActions;
