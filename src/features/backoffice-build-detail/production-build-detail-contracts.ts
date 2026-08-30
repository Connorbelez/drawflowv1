import type { Id } from "../../../convex/_generated/dataModel";
import type {
  BuildDetailTarget,
  BuildDetailTargetContext,
} from "#/features/build-detail-targets/buildDetailTarget.ts";
import type { BuilderStaffAppPermissions } from "#/features/builder-staff/app-permissions.ts";
import type {
  CalendarFilters,
  CalendarSyncSubscriptionResult,
  CalendarTimeframe,
} from "#/features/calendar-workspace/calendarTypes.ts";
import type {
  ContractorAssignmentCostDraft,
  ContractorProfileDraft,
} from "#/features/contractors/ContractorQuickAddDrawer.tsx";
import type { MaterialPlanningActions, MaterialPlanningItem } from "#/features/material-planning/MaterialPlanningTab.tsx";
import type { DrawRequestReceipt } from "#/features/build-funding/BuildFundingWorkspace.tsx";
import type {
  SiteVisitGuidance,
  SiteVisitGuidanceGenerationInput,
  SiteVisitGuidanceGenerationResult,
  SiteVisitSubmilestoneGuidanceSection,
} from "./SiteVisitOrderDialog.tsx";
import type { MilestoneStartSource } from "./MilestoneStartDialog.tsx";

export type ProductionBuildStatus = "active" | "paused" | "completed" | string;
export type ProductionMilestoneStatus = "planned" | "in_progress" | "complete";
export type ProductionDrawStatus =
  | "planned"
  | "requested"
  | "in_review"
  | "ready_for_admin"
  | "approved_for_release"
  | "rejected"
  | "withdrawn"
  | "cancelled"
  | "released";

export type ProductionDrawId =
  | Id<"activeBuildDrawRequests">
  | Id<"plannedDrawScheduleRows">;
export type ProductionViewerCapacity =
  | "admin"
  | "broker"
  | "broker-staff"
  | "builder"
  | "builder-staff"
  | "principle-broker";

export interface ProductionBuildDetailActions {
  addDocument?: (input: {
    documentType: "permit" | "budget" | "plan" | "supporting";
    fileName: string;
    supersedesDocumentId?: string;
  }) => Promise<unknown> | unknown;
  approveDraw?: (draw: ProductionDraw) => Promise<unknown> | unknown;
  approveMilestone?: (input: {
    milestoneKey: string;
    note?: string;
  }) => Promise<unknown> | unknown;
  assignContractorToMilestone?: (input: {
    assignmentCost?: ContractorAssignmentCostDraft;
    contractorId: string;
    milestoneKey: string;
    role: string;
    submilestoneKeys?: string[];
  }) => Promise<unknown> | unknown;
  assignSiteVisit?: (input: {
    milestoneKey: string;
    note?: string;
    requestedTime?: string;
    siteVisitGuidance?: SiteVisitGuidance;
    submilestoneGuidanceSections?: SiteVisitSubmilestoneGuidanceSection[];
    submilestoneKeys?: string[];
  }) => Promise<unknown> | unknown;
  attachAndInviteContractor?: (input: {
    contractorId: string;
    role: string;
  }) => Promise<unknown> | unknown;
  attachContractor?: (input: {
    contractorId: string;
    role: string;
  }) => Promise<unknown> | unknown;
  cancelSiteVisit?: (input: {
    reason: string;
    visitId: string;
  }) => Promise<unknown> | unknown;
  correctMilestoneStart?: (input: {
    actualStartedAt: number;
    expectedRevision: number;
    idempotencyKey: string;
    milestoneKey: string;
    reason: string;
    source: MilestoneStartSource;
    submilestoneKey?: string;
  }) => Promise<unknown> | unknown;
  createAndAssignContractor?: (input: {
    assignmentCost?: ContractorAssignmentCostDraft;
    contractor: {
      availabilityWindows?: Array<{
        dayOfWeek: number;
        endMinute: number;
        startMinute: number;
        timezone: string;
      }>;
      capabilities?: Array<{
        capabilityKey: string;
        label: string;
        milestoneArchetypeKey?: string;
        trade?: string;
      }>;
      city?: string;
      defaultPayRateCents?: number;
      defaultPayRateUnit?: "hour" | "day" | "fixed";
      email?: string;
      equipment?: Array<{
        equipmentKey: string;
        name: string;
        quantity: number;
      }>;
      kind: "company" | "individual";
      name: string;
      phone?: string;
      trades: string[];
    };
    milestoneKey: string;
    role: string;
    submilestoneKeys?: string[];
  }) =>
    | Promise<string | void | { contractorId?: string }>
    | string
    | void
    | { contractorId?: string };
  createAndAttachContractor?: (input: {
    contractor: ContractorProfileDraft;
    role: string;
  }) =>
    | Promise<string | void | { contractorId?: string }>
    | string
    | void
    | { contractorId?: string };
  createCalendarSyncSubscription?: (input: {
    direction: "bidirectional" | "outbound";
    filters: CalendarFilters;
    provider: "google" | "ics" | "outlook";
    surface: "activeBuild" | "proposal";
  }) =>
    | Promise<CalendarSyncSubscriptionResult>
    | CalendarSyncSubscriptionResult
    | void;
  generateSiteVisitGuidance?: (
    input: SiteVisitGuidanceGenerationInput
  ) => Promise<SiteVisitGuidanceGenerationResult>;
  inviteContractor?: (contractorId: string) => Promise<unknown> | unknown;
  materialPlanning?: MaterialPlanningActions;
  recordExternalCalendarSyncChange?: (input: {
    changeKey: string;
    externalEventId?: string;
    payload: unknown;
    provider: "google" | "ics" | "outlook";
    subscriptionKey?: string;
  }) => Promise<unknown> | unknown;
  rejectDraw?: (input: {
    draw: ProductionDraw;
    reason: string;
  }) => Promise<unknown> | unknown;
  rejectMilestone?: (input: {
    milestoneKey: string;
  }) => Promise<unknown> | unknown;
  releaseDraw?: (draw: ProductionDraw) => Promise<unknown> | unknown;
  removeContractorFromMilestone?: (input: {
    assignmentId: string;
    contractorId: string;
    milestoneKey: string;
    reason: string;
    submilestoneKey?: string;
  }) => Promise<unknown> | unknown;
  requestBudgetRevision?: (input: {
    borrowerCoPayBps: number;
    borrowerStartingCashCents: number;
    lenderDrawPolicyLimitCents: number;
    reason: string;
  }) => Promise<unknown> | unknown;
  requestDraw?: (draw: ProductionDraw) => Promise<unknown> | unknown;
  requestDrawAmount?: (input: {
    amountCents: number;
    clientOperationId: string;
    drawKey: string;
    note?: string;
  }) => Promise<DrawRequestReceipt>;
  requestFacilityChange?: (input: {
    reason?: string;
    requestedPaybackDate?: string;
    requestedPrincipalCents?: number;
    requestType: "principalIncrease" | "paybackExtension";
  }) => Promise<unknown> | unknown;
  requestLoanFacilityDateChange?: (input: {
    reason: string;
    requestedPaybackDate: string;
  }) => Promise<unknown> | unknown;
  requestMilestoneInfo?: (input: {
    milestoneKey: string;
    note: string;
  }) => Promise<unknown> | unknown;
  rescheduleSiteVisit?: (input: {
    reason: string;
    requestedDay: number;
    requestedTime?: string;
    visitId: string;
  }) => Promise<unknown> | unknown;
  retractMilestoneStart?: (input: {
    expectedRevision: number;
    idempotencyKey: string;
    milestoneKey: string;
    reason: string;
    source: MilestoneStartSource;
    submilestoneKey?: string;
  }) => Promise<unknown> | unknown;
  reviewBudgetRevision?: (input: {
    note: string;
    requestId: string;
    status: "approved" | "rejected";
  }) => Promise<unknown> | unknown;
  reviewEvidence?: (input: {
    accepted: boolean;
    milestoneKey: string;
    note?: string;
  }) => Promise<unknown> | unknown;
  reviewFacilityChangeRequest?: (input: {
    note?: string;
    requestId: string;
    status: "approved" | "rejected";
  }) => Promise<unknown> | unknown;
  reviseMilestoneSchedule?: (input: {
    dayEnd: number;
    dayStart: number;
    milestoneKey: string;
    reason: string;
  }) => Promise<unknown> | unknown;
  saveCalendarView?: (input: {
    filters: CalendarFilters;
    isDefault?: boolean;
    label: string;
    timeframe: CalendarTimeframe;
    viewKey: string;
  }) => Promise<unknown> | unknown;
  scheduleSiteVisit?: (input: {
    milestoneKey: string;
    note?: string;
    requestedDay: number;
    requestedTime?: string;
    siteVisitGuidance?: SiteVisitGuidance;
    submilestoneGuidanceSections?: SiteVisitSubmilestoneGuidanceSection[];
    submilestoneKeys?: string[];
  }) => Promise<unknown> | unknown;
  setAdminDecisionTargetDate?: (input: {
    drawKey?: string;
    milestoneKey?: string;
    reason?: string;
    targetDate: string;
    targetTime?: string;
  }) => Promise<unknown> | unknown;
  setDrawReleaseTargetDate?: (input: {
    drawKey?: string;
    milestoneKey?: string;
    reason?: string;
    targetDate: string;
    targetTime?: string;
  }) => Promise<unknown> | unknown;
  setEvidenceDueDate?: (input: {
    drawKey?: string;
    milestoneKey?: string;
    reason?: string;
    targetDate: string;
    targetTime?: string;
  }) => Promise<unknown> | unknown;
  setReviewTargetDate?: (input: {
    drawKey?: string;
    milestoneKey?: string;
    reason?: string;
    targetDate: string;
    targetTime?: string;
  }) => Promise<unknown> | unknown;
  startDrawReview?: (draw: ProductionDraw) => Promise<unknown> | unknown;
  startMilestoneWork?: (input: {
    actualStartedAt: number;
    dependencyOverrideReason?: string;
    expectedRevision: number;
    idempotencyKey: string;
    milestoneKey: string;
    source: MilestoneStartSource;
    startParent?: boolean;
    submilestoneKey?: string;
  }) => Promise<unknown> | unknown;
  submitDrawForAdmin?: (draw: ProductionDraw) => Promise<unknown> | unknown;
  submitMilestoneCompletion?: (input: {
    actualCostCents?: number;
    actualStartedAt?: number;
    completedDay: number;
    dependencyOverrideReason?: string;
    idempotencyKey: string;
    milestoneKey: string;
    note?: string;
  }) => Promise<unknown> | unknown;
  updateNonFinancialDetails?: (input: {
    buildName: string;
    ianaTimezone?: string;
    location: string;
    locationLatitude?: number | null;
    locationLongitude?: number | null;
    locationPlaceId?: string | null;
    reason: string;
    startDate: string;
  }) => Promise<unknown> | unknown;
  updateSubmilestoneExecution?: (input: {
    actualCostCents?: number | null;
    actualStartedAt?: number;
    dependencyOverrideReason?: string;
    expectedRevision: number;
    fieldNote?: string | null;
    idempotencyKey?: string;
    milestoneKey: string;
    reason?: string;
    status?: ProductionMilestoneStatus;
    submilestoneKey: string;
  }) => Promise<unknown> | unknown;
  uploadSubmilestoneEvidence?: (input: {
    file: File;
    locationVerified: boolean;
    milestoneKey: string;
    submilestoneKey: string;
  }) => Promise<unknown> | unknown;
  withdrawDraw?: (drawKey: string) => Promise<unknown> | unknown;
}

export interface ProductionBuildDetail {
  appPermissions?: BuilderStaffAppPermissions | null;
  auditEvents?: ProductionAuditEvent[];
  availableContractors?: ProductionAvailableContractor[];
  budgetRevisionRequests?: ProductionBudgetRevisionRequest[];
  build: {
    _id: string;
    buildName: string;
    location: string;
    status: ProductionBuildStatus;
    startDate: string;
    totalBudgetCents: number;
    locationLatitude?: number;
    locationLongitude?: number;
    locationPlaceId?: string;
    timezone?: string;
    brokerageId?: string;
    createdAt?: number;
    updatedAt?: number;
  };
  builderContact?: {
    contactName?: string;
    displayName: string;
    email?: string;
    role?: string;
  };
  capitalPlan?: {
    borrowerStartingCashCents: number;
    borrowerCoPayBps: number;
    lenderDrawPolicyLimitCents: number;
    version: number;
  } | null;
  contractors?: ProductionAttachedContractor[];
  costItems?: MaterialPlanningItem[];
  displayId?: string;
  documents?: ProductionDocument[];
  drawFunding?: {
    approvedMilestoneCents: number;
    availableCents: number;
    facilityCents: number;
    reservedCents: number;
    unlockedCents: number;
  };
  draws: ProductionDraw[];
  evidenceAssets?: ProductionEvidenceAsset[];
  facilityChangeRequests?: ProductionFacilityChangeRequest[];
  loanFacility?: {
    principalCents: number;
    interestAnnualBps: number;
    interestStartsOn: "funds_released";
    paybackDate?: string;
    status: "active" | "closed";
  } | null;
  milestoneContractorAssignments?: ProductionMilestoneContractorAssignment[];
  milestones: ProductionMilestone[];
  plannedDraws?: ProductionPlannedDraw[];
  quickActionEvents?: ProductionRailEvent[];
  sitePhotos?: ProductionSitePhoto[];
  siteVisits?: ProductionSiteVisit[];
  submilestones: ProductionSubmilestone[];
  viewerBuildRoles?: string[];
}

export interface ProductionMilestone {
  _id: string;
  actualStartedAt?: number;
  budgetCents: number;
  completedSubmilestoneCount?: number;
  completionClaim?: Record<string, unknown>;
  completionReview?: Record<string, any>;
  dayEnd: number;
  dayStart: number;
  dependencyKeys: string[];
  drawAvailabilityCents: number;
  durationDays: number;
  evidenceState?: string;
  isDragLocked?: boolean;
  key: string;
  name: string;
  normalizedProgressPercent?: number;
  order: number;
  policyState?: string;
  progressPercent?: number;
  reconciliationIssues?: Array<{
    code: string;
    message: string;
    severity: "warning";
  }>;
  reconciliationState?: "consistent" | "warning";
  siteVisitGuidance?: SiteVisitGuidance;
  startEventId?: string;
  startedAt?: number;
  startedByWorkosUserId?: string;
  startReportedAt?: number;
  startSource?: MilestoneStartSource;
  status: ProductionMilestoneStatus;
  totalSubmilestoneCount?: number;
  updatedAt?: number;
  workflowRevision?: number;
}

export interface ProductionSubmilestone {
  _id: Id<"buildSubmilestones">;
  actualCostCents?: number;
  actualStartedAt?: number;
  budgetCents?: number;
  completedAt?: number;
  completedByWorkosUserId?: string;
  durationDays?: number;
  evidenceReviewState?:
    | "approved"
    | "changes_requested"
    | "in_review"
    | "not_ready";
  fieldNote?: string;
  key: string;
  milestoneKey: string;
  name: string;
  order: number;
  reviewDecisionState?:
    | "approved"
    | "changes_requested"
    | "in_review"
    | "reopened";
  startDay?: number;
  startEventId?: string;
  startedByWorkosUserId?: string;
  startReportedAt?: number;
  startSource?: MilestoneStartSource;
  status: ProductionMilestoneStatus;
  workflowRevision?: number;
}

export interface ProductionDraw {
  _id: string;
  amountCents: number;
  drawKey: string;
  label: string;
  milestoneKey?: string;
  order: number;
  releaseDate?: string;
  releasedAt?: string;
  releaseNote?: string;
  requestedAt?: string;
  requestNote?: string;
  requestReviewNote?: string;
  reviewedAt?: string;
  sourceAllocations?: Array<{
    amountCents: number;
    drawGroupKey: string;
    milestoneKey: string;
    milestoneName: string;
    sourceOrder: number;
  }>;
  status: ProductionDrawStatus;
  timingDay: number;
  withdrawalNote?: string;
  withdrawnAt?: string;
  workOrderKey?: string;
}

export interface ProductionPlannedDraw {
  _id?: string;
  amountCents: number;
  drawKey: string;
  label: string;
  order: number;
  timingDay: number;
}

export interface ProductionFacilityChangeRequest {
  _id: string;
  createdAt: number;
  priorState?: {
    paybackDate?: string;
    principalCents?: number;
  };
  reason?: string;
  requestedByWorkosUserId: string;
  requestedPayload: {
    requestedPaybackDate?: string;
    requestedPrincipalCents?: number;
  };
  requestType: "principalIncrease" | "paybackExtension";
  reviewedAt?: number;
  reviewerWorkosUserId?: string;
  reviewNote?: string;
  status: "requested" | "approved" | "rejected";
  updatedAt?: number;
  workflowRevision?: number;
}

export interface ProductionBudgetRevisionRequest {
  _id: string;
  approvedCapitalPlanId?: string;
  baseVersion: number;
  createdAt: number;
  priorState: {
    borrowerCoPayBps: number;
    borrowerStartingCashCents: number;
    lenderDrawPolicyLimitCents: number;
    version: number;
  };
  reason: string;
  requestedByWorkosUserId: string;
  requestedPayload: {
    borrowerCoPayBps: number;
    borrowerStartingCashCents: number;
    lenderDrawPolicyLimitCents: number;
  };
  reviewerWorkosUserId?: string;
  reviewNote?: string;
  status: "requested" | "approved" | "rejected";
  varianceCents: number;
}

export interface ProductionSitePhoto {
  caption: string;
  evidenceKey?: string;
  locationVerified?: boolean;
  takenAt: string;
  url: string;
}

export interface ProductionEvidenceAsset {
  _id?: string;
  contractorIds?: string[];
  createdAt?: number;
  evidenceKey: string;
  fileName: string;
  label: string;
  locationVerified?: boolean;
  milestoneKey: string;
  mimeType: string;
  previewUrl?: string | null;
  sizeBytes: number;
  source?: string;
  submilestoneId?: Id<"buildSubmilestones">;
  submilestoneKey?: string;
  tag: string;
  updatedAt?: number;
}

export interface ProductionDocument {
  _id: string;
  documentType?: string;
  fileName?: string;
  kind?: string;
  mimeType?: string;
  name?: string;
  sizeBytes?: number;
  status?: string;
  storageId?: string;
  storageUrl?: string | null;
  url?: string | null;
  version?: number;
}

export interface ProductionRailEvent {
  _id: string;
  actionLabel: string;
  body: string;
  canonicalTarget?: BuildDetailTarget;
  canonicalTargetContext?: BuildDetailTargetContext;
  createdAt: number;
  entityLabel: string;
  entityType: string;
  href: string;
  resolutionMode: "domain" | "recipient";
  sourceLabel: string;
  title: string;
}

export interface ProductionAuditEvent {
  _id: string;
  actorPersona: string;
  afterSummary?: string;
  beforeSummary?: string;
  canonicalTarget?: BuildDetailTarget;
  canonicalTargetContext?: BuildDetailTargetContext;
  changes?: Array<{
    after: string;
    before: string;
    field: string;
  }>;
  command?: string;
  createdAt: number;
  entityLabel?: string;
  entityType: string;
  eventType: string;
  reason?: string;
  warnings?: string[];
}

export interface ProductionAttachedContractor {
  _id: string;
  agreedRateCents?: number;
  agreedRateUnit?: "hour" | "day" | "fixed";
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
}

export interface ProductionAvailableContractor {
  _id: string;
  city?: string;
  defaultPayRateCents?: number;
  defaultPayRateUnit?: "hour" | "day" | "fixed";
  email?: string;
  name: string;
  onboardingStatus?: "profile_only" | "invited" | "account_linked";
  skills?: string[];
  trades?: string[];
}

export interface ProductionMilestoneContractorAssignment {
  _id: string;
  actualCostCents?: number;
  actualHours?: number;
  agreedRateCents?: number;
  agreedRateUnit?: "hour" | "day" | "fixed";
  contractor?: {
    _id: string;
    name: string;
    trades?: string[];
  };
  contractorId: string;
  costNotes?: string;
  estimatedCostCents?: number;
  estimatedHours?: number;
  milestoneKey: string;
  postHoc?: boolean;
  role: string;
  status: string;
  submilestoneKey?: string;
}

export interface ProductionSiteVisit {
  _id?: string;
  completedAt?: string;
  createdAt?: number;
  milestoneKey: string;
  note?: string;
  recordNote?: string;
  recordNoteFormat?: "plain_text" | "html";
  requestedAt: string;
  requestedDay: number;
  requestedTime?: string;
  status: string;
  submilestoneIds?: Id<"buildSubmilestones">[];
  submilestoneKeys?: string[];
  tokenConsumedAt?: number;
  tokenExpiresAt?: number;
  tokenOpenedAt?: number;
  updatedAt?: number;
  url?: string;
  visitId: string;
}

export type ProductionEvidenceSource = "builder" | "site_visit";

export interface ProductionEvidenceRow {
  amountCents?: number;
  assets: ProductionEvidenceAsset[];
  completedAt?: string;
  id: string;
  locationState?: "unverified" | "verified";
  milestoneKey: string;
  milestoneName: string;
  note?: string;
  noteFormat?: "plain_text" | "html";
  source: ProductionEvidenceSource;
  status: string;
  submilestoneId?: Id<"buildSubmilestones">;
  submittedAt?: string;
}

export interface ProductionBuildProjection {
  calendarDates: Date[];
  draws: ProductionDraw[];
  maxDay: number;
  milestones: ProductionMilestone[];
  submilestonesByMilestone: Map<string, ProductionSubmilestone[]>;
}

