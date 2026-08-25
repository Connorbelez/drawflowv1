import type { Id } from "../../../convex/_generated/dataModel";
import type { ContractorPlanningModel } from "#/features/contractors/ContractorPlanningPanel.tsx";
import type {
  TimelineItem,
  TimelineRange,
} from "#/components/roadmap/AnimatedCurvedTimeline.tsx";
import type { ReactNode } from "react";
import type {
  DemoCapitalSpike,
  DemoDraw,
  DemoEvidenceAsset,
  DemoMilestone,
  TimelineShareState,
} from "./-timeline-share-snapshot.ts";

export interface DrawEditDraft {
  amount: string;
  x: string;
}

export interface CapitalSpikeEditDraft {
  amount: string;
  interestAnnualPercent: string;
  label: string;
  x: string;
}

export type TimelineDemoRole = "builder" | "lender";

export interface PendingNormalizedInsertSelection {
  itemId: string;
  x: number;
}

export interface TimelineSiteVisitRequestInput {
  includedItemIds?: string[];
  note?: string;
  requestedDay: number;
  status?: string;
  tokenExpiresAt?: number;
  url?: string;
  visitId?: string;
}

export interface CashflowDatum {
  budget: number;
  capitalSpikeAmount: number;
  cashInfusionAmount: number;
  cashOnHand: number;
  day: number;
  drawAmount: number;
  drawCapacityUnlocked: number;
  event: "capitalSpike" | "cashInfusion" | "draw" | "milestone" | "start";
  id: string;
  milestoneDrawAvailability?: number;
  milestoneEndDay?: number;
  milestoneId?: string;
  milestoneTotalBudget?: number;
  name: string;
  sortOrder?: number;
  [key: string]: unknown;
}

export interface DrawAvailabilityDatum {
  additionalAvailableDraw: number;
  day: number;
  interestAnnualBps?: number;
  interestBearingDraw: number;
  name: string;
  totalAvailableDraw: number;
  totalInterestAccrued: number;
  totalUnlockedDraw: number;
  [key: string]: unknown;
}

export interface CumulativeDrawPosition {
  availableToDraw: number;
  day: number;
  totalDrawn: number;
  totalUnlocked: number;
}

export interface CashShortfallPoint {
  cashBeforeMilestone: number;
  cashOnHand: number;
  day: number;
  milestone: string;
  milestoneCost: number;
  shortfall: number;
}

export interface FinancialOverview {
  drawCount: number;
  drawFeesPaid: number;
  interestPaid: number;
  totalDrawReleased: number;
}

export interface DrawRequestLimit {
  alreadyDrawn: number;
  availableLimit: number;
  remainingAfterRequest: number;
  totalUnlocked: number;
}

export interface TimelineResponsiveSizing {
  barSize: number;
  cardWidth: number;
  endCardWidth: number;
  minNodeSpacingPx: number;
  paddingX: number;
  pixelsPerUnit: number;
  yAxisWidth: number;
}

export type TimelineWorkspaceMode = "demo" | "live" | "proposal";

export interface TimelineWorkspaceProps {
  allowRoleSwitching?: boolean;
  canApproveMilestoneCompletion?: boolean;
  collaboration?: TimelineWorkspaceCollaboration;
  contractorPlanning?: ContractorPlanningModel | null;
  durableMeta?: {
    backofficeHref: string;
    buildKey?: string;
    liveBuildHref?: string;
    proposalHref: string;
    proposalSlug: string;
    status: string;
  };
  durablePlanId?: string;
  embedded?: boolean;
  headerActions?: ReactNode;
  initialRole?: TimelineDemoRole;
  initialState?: TimelineShareState;
  lockedBannerActions?: ReactNode;
  modificationRequests?: TimelineModificationRequestView[];
  onOpenSubmilestone?: (submilestoneId: Id<"buildSubmilestones">) => void;
  persistence?: TimelineWorkspacePersistence;
  readOnly?: boolean;
  shareUrlPath?: string;
  showWorkspaceHeader?: boolean;
  timelineSettingsProjection?: unknown;
  workspaceMode?: TimelineWorkspaceMode;
}

export type TimelineDemoWorkspaceProps = TimelineWorkspaceProps;

export interface TimelineWorkspaceCollaboration {
  cursors?: TimelineWorkspaceRemoteCursor[];
  onCursorChange?: (cursor: { x: number; y: number } | null) => void;
  permission?: "edit" | "view" | null;
  toolbar?: ReactNode;
}

export interface TimelineWorkspaceRemoteCursor {
  color?: string;
  cursor?: { x: number; y: number } | null;
  name: string;
  userId: string;
}

export interface TimelineModificationRequestView {
  _id?: string;
  milestoneKey?: string;
  reason?: string;
  requestedPayload: any;
  requestType: "createMilestone" | "deleteMilestone" | "updateMilestoneBudget";
  reviewNote?: string;
  status: "approved" | "rejected" | "requested";
}

export interface TimelinePlanStatePersistenceInput {
  currentDay: number;
  minimumCashReserveCents?: number;
  progressValue: number;
  rangeMax: number;
  rangeMin: number;
  routeState: {
    activeCapitalSpikeId?: string;
    activeDrawId?: string;
    activeMilestoneKey?: string;
    selectedPanelOpen: boolean;
    straightLine: boolean;
  };
  startingCashCents: number;
}

export type DemoTimelinePlanStateMutationInput = Omit<
  TimelinePlanStatePersistenceInput,
  "minimumCashReserveCents"
>;

export interface TimelineWorkspacePersistence {
  createCapitalEvent?: (input: any) => Promise<unknown>;
  createCashInfusion?: (input: any) => Promise<unknown>;
  createDraw?: (input: any) => Promise<unknown>;
  createEvidenceAsset?: (input: any) => Promise<unknown>;
  createMilestone?: (input: any) => Promise<unknown>;
  deleteCapitalEvent?: (input: any) => Promise<unknown>;
  deleteDraw?: (input: any) => Promise<unknown>;
  deleteEvidenceAsset?: (input: any) => Promise<unknown>;
  deleteMilestone?: (input: any) => Promise<unknown>;
  generateEvidenceUploadUrl?: () => Promise<string>;
  recordMilestoneSiteVisit?: (input: any) => Promise<unknown>;
  replaceDrawSchedule?: (input: any) => Promise<unknown>;
  requestMilestoneSiteVisit?: (
    input: any
  ) => Promise<TimelineSiteVisitRequestInput | void>;
  requestModification?: (input: any) => Promise<unknown>;
  reviewDrawRequest?: (input: any) => Promise<unknown>;
  reviewMilestoneCompletion?: (input: any) => Promise<unknown>;
  reviewModificationRequest?: (input: any) => Promise<unknown>;
  submitDrawRequest?: (input: any) => Promise<unknown>;
  submitMilestoneCompletion?: (input: any) => Promise<unknown>;
  submitPlan?: () => Promise<unknown>;
  updateCapitalEvent?: (input: any) => Promise<unknown>;
  updateDraw?: (input: any) => Promise<unknown>;
  updateEvidenceAsset?: (input: any) => Promise<unknown>;
  updateMilestone?: (input: any) => Promise<unknown>;
  updatePlanState?: (
    input: TimelinePlanStatePersistenceInput
  ) => Promise<unknown>;
}

export interface TimelineCompletionClaimInput {
  actualCost?: number;
  completedDay: number;
  note?: string;
  qualityNote?: string;
  qualityRating?: number;
}

export type TimelineWorkspaceTimelineItem = TimelineItem<DemoMilestone>;
export type TimelineWorkspaceRange = TimelineRange;
export type TimelineWorkspaceDraw = DemoDraw;
export type TimelineWorkspaceCapitalSpike = DemoCapitalSpike;
export type TimelineWorkspaceEvidenceAsset = DemoEvidenceAsset;
