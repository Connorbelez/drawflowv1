import { backofficeBuildWorkspaceHref } from "#/features/backoffice-dashboard/backoffice-build-links.ts";

export interface DashboardMetric {
  detail: string;
  id: string;
  label: string;
  tone: "default" | "success" | "warning" | "destructive";
  trend?: string;
  value: number;
}

export interface MetricDrilldownItem {
  badgeLabel?: string;
  badgeVariant?: "default" | "outline" | "warning" | "destructive" | "success";
  context?: string;
  href: string;
  id: string;
  subtitle?: string;
  title: string;
}

export interface DashboardDrawRequest {
  address: string;
  buildId: string;
  buildKey: string;
  eligibleDate: string;
  href: string;
  id: string;
  label: string;
  requestedAmount: string;
  statusLabel: string;
}

export interface ActiveBuild {
  activeMilestone: string;
  address: string;
  buildName?: string;
  builder: string;
  buildKey: string;
  daysActive: number;
  drawCount?: number;
  href: string;
  id: string;
  imageUrl?: string | null;
  locationLatitude?: number;
  locationLongitude?: number;
  milestoneCount?: number;
  milestonesBehindSchedule?: number;
  milestoneState: "backlog" | "inProgress" | "inReview";
  pendingDrawRequestCount?: number;
  status: "onTrack" | "behind" | "overBudget";
  statusLabel: string;
}

export interface DashboardKanbanColumn extends Record<string, unknown> {
  description?: string;
  id: string;
  name: string;
}

export const MILESTONE_KANBAN_COLUMNS: DashboardKanbanColumn[] = [
  {
    description: "Builder marked complete; triage",
    id: "backlog",
    name: "Backlog",
  },
  {
    description: "Visit ordered or requested",
    id: "needsSiteVisit",
    name: "Needs site visit",
  },
  {
    description: "Visit picked up and scheduled",
    id: "inProgress",
    name: "In progress",
  },
  {
    description: "Planned finish date has passed",
    id: "behindSchedule",
    name: "Behind schedule",
  },
  {
    description: "Pending staff approval",
    id: "inReview",
    name: "In review",
  },
];

export interface MilestoneKanbanCard extends Record<string, unknown> {
  address: string;
  buildId: string;
  buildKey: string;
  column: string;
  dueLabel?: string;
  href: string;
  id: string;
  milestoneKey: string;
  name: string;
  priority: "low" | "medium" | "high";
  reviewerInitials?: string;
}

export interface ProposalKanbanCard extends Record<string, unknown> {
  address: string;
  approvedAt?: number;
  borrowerStartingCashCents?: number;
  builder: string;
  builderAssigned?: boolean;
  builderEmail?: string;
  builderProfileId?: string;
  closeLabel?: string;
  column: string;
  createdAt?: number;
  href?: string;
  id: string;
  isMockAddress?: boolean;
  isMockBuilder?: boolean;
  isMockLtv?: boolean;
  lenderDrawPolicyLimitCents?: number;
  loanAmount: string;
  ltv: number;
  name: string;
  proposalId?: string;
  reviewOutcome?: string;
  statusLabel?: string;
  submittedAt?: number;
  tag?: string;
  totalBudgetCents?: number;
  updatedAt?: number;
}

export interface ScheduleEvent {
  date: string;
  id: string;
  kind: "siteVisit" | "drawReview" | "milestoneReview";
  label: string;
}

export type OperationsHandoffAcknowledgementState =
  | "pending_decision"
  | "returned"
  | "acknowledged";

export type OperationsHandoffReturnDecision = "continue" | "reroute" | "close";

export interface OperationsQueueHandoff {
  _id: string;
  acknowledgementState: OperationsHandoffAcknowledgementState;
  acknowledgedAt?: number;
  acknowledgedByWorkosUserId?: string;
  createdAt: number;
  decisionPreview: string;
  escalatedByWorkosUserId: string;
  escalationReason: string;
  evidenceSummary: string;
  followUpAssignment?: string;
  queueItemId: string;
  recommendation: string;
  requiredAction: string;
  returnDecision?: OperationsHandoffReturnDecision;
  returnedAt?: number;
  returnedByWorkosUserId?: string;
  returnReason?: string;
  targetHref: string;
  targetLabel: string;
  targetRecordId: string;
  targetType: string;
  updatedAt: number;
  warnings: string[];
}

export interface QuickAction {
  actionLabel: string;
  address: string;
  ageLabel: string;
  authorityLabel: string;
  blocker: string;
  buildId: string;
  canAcknowledgeHandoff?: boolean;
  dueLabel: string;
  entityLabel: string;
  handoff?: OperationsQueueHandoff;
  href: string;
  id: string;
  ownerLabel: string;
  recommendationLabel: string;
  title: string;
  type: "build" | "drawRequest" | "milestone" | "proposal" | "siteVisit";
}

export interface BackofficeDashboardData {
  activeBuilds: ActiveBuild[];
  canMakeFinalDecision?: boolean;
  drawRequests: DashboardDrawRequest[];
  metrics: DashboardMetric[];
  milestoneColumns: DashboardKanbanColumn[];
  milestones: MilestoneKanbanCard[];
  proposalColumns: DashboardKanbanColumn[];
  proposals: ProposalKanbanCard[];
  quickActions: QuickAction[];
  scheduleDate: Date;
  scheduleEvents: ScheduleEvent[];
}

export function getExplicitMockBackofficeDashboardData(): BackofficeDashboardData {
  return {
    activeBuilds: [
      {
        activeMilestone: "Mock milestone - awaiting demo seed",
        address: "Mock build 1 address",
        buildKey: "mock-build-1",
        builder: "Mock builder 1",
        daysActive: 0,
        href: backofficeBuildWorkspaceHref("mock-build-1"),
        id: "MOCK-BUILD-1",
        milestoneState: "backlog",
        status: "onTrack",
        statusLabel: "Mock status - on track",
      },
    ],
    drawRequests: [
      {
        address: "Mock build 1 address",
        buildId: "MOCK-BUILD-1",
        buildKey: "mock-build-1",
        eligibleDate: "2026-05-08",
        href: backofficeBuildWorkspaceHref("mock-build-1"),
        id: "mock-draw-1",
        label: "Mock draw request",
        requestedAmount: "$0",
        statusLabel: "Pending",
      },
    ],
    metrics: [
      {
        detail: "Mock metric - seed demo_drawflow data to replace this",
        id: "draw-requests",
        label: "Draw requests",
        tone: "warning",
        trend: "Mock trend - no demo_ rows loaded",
        value: 0,
      },
      {
        detail: "Mock metric - no persistent active builds loaded",
        id: "active-builds",
        label: "Active builds",
        tone: "default",
        trend: "Mock trend - waiting for Convex demo tables",
        value: 1,
      },
      {
        detail: "Mock metric - no persistent proposals loaded",
        id: "proposals",
        label: "Proposals",
        tone: "default",
        trend: "Mock trend - waiting for generated demo proposals",
        value: 0,
      },
      {
        detail: "Mock metric - no persistent milestones loaded",
        id: "milestones",
        label: "Milestones",
        tone: "success",
        trend: "Mock trend - evidence queue unavailable",
        value: 1,
      },
    ],
    milestoneColumns: MILESTONE_KANBAN_COLUMNS,
    milestones: [
      {
        address: "Mock build 1 address",
        buildKey: "mock-build-1",
        buildId: "MOCK-BUILD-1",
        column: "backlog",
        href: "/backoffice/builds/mock-build-1?milestone=mock-milestone-1",
        id: "mock-milestone-1",
        milestoneKey: "mock-milestone-1",
        name: "Mock milestone - seed demo_milestones",
        priority: "medium",
        reviewerInitials: "MK",
      },
    ],
    proposalColumns: [
      { id: "draft", name: "Draft" },
      { id: "submitted", name: "Submitted" },
      { id: "approved", name: "Approved" },
      { id: "closed", name: "Closed" },
    ],
    proposals: [
      {
        address: "Mock proposal address",
        builder: "Mock builder - demo table has no builder company",
        column: "draft",
        id: "mock-proposal-1",
        isMockAddress: true,
        isMockBuilder: true,
        isMockLtv: true,
        loanAmount: "$0",
        ltv: 0,
        name: "Mock proposal - seed demo proposals",
        statusLabel: "Mock status",
      },
    ],
    quickActions: [
      {
        actionLabel: "Mock action - seed demo events",
        address: "Mock build 1 address",
        ageLabel: "Mock age",
        authorityLabel: "Mock authority",
        blocker: "Mock blocker",
        buildId: "MOCK-BUILD-1",
        dueLabel: "Mock due",
        entityLabel: "Mock build 1 · Mock milestone",
        href: backofficeBuildWorkspaceHref("mock-build-1"),
        id: "mock-action-1",
        ownerLabel: "Unassigned",
        recommendationLabel: "Mock recommendation",
        title: "Mock quick action",
        type: "milestone",
      },
    ],
    scheduleDate: new Date(2026, 4, 8),
    scheduleEvents: [
      {
        date: "2026-05-08T09:00:00.000Z",
        id: "mock-schedule-1",
        kind: "milestoneReview",
        label: "Mock milestone review",
      },
    ],
  };
}
