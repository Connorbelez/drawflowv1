"use client";

import { CatchBoundary } from "@tanstack/react-router";
import {
  AlertTriangle,
  Banknote,
  CalendarClock,
  CheckCircle2,
  ChevronDown,
  CircleDot,
  ClipboardCheck,
  Copy,
  ExternalLink,
  FileCheck2,
  FileText,
  ImageIcon,
  MapPin,
  MessageSquare,
  Pencil,
  RefreshCw,
  ScrollText,
  UserCheck,
  XCircle,
} from "lucide-react";
import type * as React from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { GoogleAddressAutocomplete } from "#/components/address/GoogleAddressAutocomplete.tsx";
import { FieldRichTextPreview } from "#/components/rich-text/field-rich-text.tsx";
import { Badge } from "#/components/ui/badge.tsx";
import { Button } from "#/components/ui/button.tsx";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardPanel,
  CardTitle,
} from "#/components/ui/card.tsx";
import { Field, FieldDescription, FieldLabel } from "#/components/ui/field.tsx";
import { Frame, FramePanel } from "#/components/ui/frame.tsx";
import { Input } from "#/components/ui/input.tsx";
import {
  Sheet,
  SheetClose,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetPanel,
  SheetPopup,
  SheetTitle,
} from "#/components/ui/sheet.tsx";
import { Separator } from "#/components/ui/separator.tsx";
import { Tabs, TabsList, TabsPanel, TabsTab } from "#/components/ui/tabs.tsx";
import { Textarea } from "#/components/ui/textarea.tsx";
import { BuildCollaborationWorkspace } from "#/features/build-collaboration/BuildCollaborationWorkspace.tsx";
import {
  BuildFundingWorkspace,
  type DrawRequestReceipt,
  type FundingRejectDecision,
  type FundingRequestRecord,
  projectBuildFunding,
} from "#/features/build-funding/BuildFundingWorkspace.tsx";
import { DrawRejectionDialog } from "#/features/build-funding/DrawRejectionDialog.tsx";
import {
  BuildPermitViewerDrawer,
  firstPermitDocument,
} from "#/features/build-permit-viewer/BuildPermitViewerDrawer.tsx";
import { contractorPlanningFromProductionDetail } from "#/features/build-workspace-demo/build-workspace-contractor-planning.ts";
import type { BuilderStaffAppPermissions } from "#/features/builder-staff/app-permissions.ts";
import {
  type ActiveBuildCalendarAdapterActions,
  buildActiveBuildCalendarActions,
  buildActiveBuildCalendarWorkspaceFromDetail,
  createActiveBuildCalendarEditHandler,
} from "#/features/calendar-workspace/adapters/activeBuildCalendarAdapter.ts";
import { CalendarWorkspace } from "#/features/calendar-workspace/CalendarWorkspace.tsx";
import type {
  CalendarFilters,
  CalendarSyncSubscriptionResult,
  CalendarTimeframe,
  DrawFlowCalendarWorkspaceData,
} from "#/features/calendar-workspace/calendarTypes.ts";
import {
  type ContractorPlanningMilestone,
  ContractorPlanningPanel,
} from "#/features/contractors/ContractorPlanningPanel.tsx";
import {
  type ContractorAssignmentCostDraft,
  type ContractorProfileDraft,
  ContractorQuickAddDrawer,
} from "#/features/contractors/ContractorQuickAddDrawer.tsx";
import {
  type MaterialPlanningActions,
  type MaterialPlanningItem,
  MaterialPlanningTab,
} from "#/features/material-planning/MaterialPlanningTab.tsx";
import { useCopyToClipboard } from "#/hooks/use-copy-to-clipboard.ts";
import {
  convertHeicEvidenceBlobToJpeg,
  isBrowserPreviewableImageMime,
  isHeicLikeEvidenceImage,
} from "#/lib/evidence-image-normalization.ts";
import { createGoogleSatelliteMapUrl } from "#/lib/google-maps.ts";
import { cn } from "#/lib/utils.ts";
import { ActiveBuildGanttWorkspace } from "./ActiveBuildGanttWorkspace";
import {
  ActiveBuildTimelineWorkspace,
  type ActiveBuildTimelineWorkspaceProps,
} from "./ActiveBuildTimelineWorkspace";
import {
  BUILD_DETAIL_TABS,
  type BuildDetailSubTab,
  BuildDetailTabBar,
} from "./BuildDetailTabs";
import { ContractorsCard } from "./ContractorsCard";
import { EventRailSheet } from "./EventRail";
import {
  formatCents,
  formatCentsExact,
  formatDate,
  initialsFor,
} from "./format";
import {
  MilestoneDetailSheet,
  type MilestoneSheetData,
} from "./MilestoneDetailSheet";
import {
  type KanbanCardData,
  type KanbanColumn,
  MilestoneKanban,
} from "./MilestoneKanban";
import {
  type MilestoneStartConfirmation,
  MilestoneStartDialog,
  type MilestoneStartDialogRequest,
  type MilestoneStartSource,
} from "./MilestoneStartDialog.tsx";
import { SitePhotoCarousel } from "./SitePhotoCarousel";
import {
  type SiteVisitGuidance,
  type SiteVisitGuidanceGenerationInput,
  type SiteVisitGuidanceGenerationResult,
  type SiteVisitOrderConfirmation,
  SiteVisitOrderDialog,
  type SiteVisitOrderRequest,
} from "./SiteVisitOrderDialog.tsx";

type ProductionBuildStatus = "active" | "paused" | "completed" | string;
type ProductionMilestoneStatus = "planned" | "in_progress" | "complete";
type ProductionDrawStatus =
  | "planned"
  | "requested"
  | "in_review"
  | "ready_for_admin"
  | "approved_for_release"
  | "rejected"
  | "withdrawn"
  | "cancelled"
  | "released";

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
}

interface ProductionMilestone {
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
}

interface ProductionSubmilestone {
  _id: string;
  actualCostCents?: number;
  actualStartedAt?: number;
  budgetCents?: number;
  completedAt?: number;
  completedByWorkosUserId?: string;
  durationDays?: number;
  fieldNote?: string;
  key: string;
  milestoneKey: string;
  name: string;
  order: number;
  startDay?: number;
  startEventId?: string;
  startedByWorkosUserId?: string;
  startReportedAt?: number;
  startSource?: MilestoneStartSource;
  status: ProductionMilestoneStatus;
}

interface ProductionDraw {
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

interface ProductionPlannedDraw {
  _id?: string;
  amountCents: number;
  drawKey: string;
  label: string;
  order: number;
  timingDay: number;
}

interface ProductionFacilityChangeRequest {
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
}

interface ProductionBudgetRevisionRequest {
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

interface ProductionSitePhoto {
  caption: string;
  evidenceKey?: string;
  locationVerified?: boolean;
  takenAt: string;
  url: string;
}

interface ProductionEvidenceAsset {
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
  submilestoneKey?: string;
  tag: string;
  updatedAt?: number;
}

interface ProductionDocument {
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

interface ProductionRailEvent {
  _id: string;
  actionLabel: string;
  body: string;
  createdAt: number;
  entityLabel: string;
  entityType: string;
  href: string;
  resolutionMode: "domain" | "recipient";
  sourceLabel: string;
  title: string;
}

interface ProductionAuditEvent {
  _id: string;
  actorPersona: string;
  afterSummary?: string;
  beforeSummary?: string;
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

interface ProductionAttachedContractor {
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

interface ProductionAvailableContractor {
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

interface ProductionMilestoneContractorAssignment {
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

interface ProductionSiteVisit {
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
  submilestoneKeys?: string[];
  tokenConsumedAt?: number;
  tokenExpiresAt?: number;
  tokenOpenedAt?: number;
  updatedAt?: number;
  url?: string;
  visitId: string;
}

type ProductionEvidenceSource = "builder" | "site_visit";

interface ProductionEvidenceRow {
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
  submittedAt?: string;
}

interface ProductionBuildProjection {
  calendarDates: Date[];
  draws: ProductionDraw[];
  maxDay: number;
  milestones: ProductionMilestone[];
  submilestonesByMilestone: Map<string, ProductionSubmilestone[]>;
}

export function ProductionBuildDetailSurface({
  actions,
  activeBuildId,
  activeTab,
  calendarTimeframe,
  calendarWorkspace,
  contractorDetailHrefFor,
  breadcrumbRootHref = "/backoffice",
  breadcrumbRootLabel = "Backoffice",
  breadcrumbSectionHref = "/backoffice/builds",
  breadcrumbSectionLabel = "Builds",
  detail,
  focusedReference,
  fundingWorkspaceEnabled = false,
  milestoneKey,
  onChangeMilestone,
  onChangeCalendarTimeframe,
  onChangeRail,
  onChangeTab,
  prototypeMilestoneStartTrigger = false,
  rail,
  staff,
  timelineWorkspace,
  visibleTabs,
  viewerRole = "lender",
  workosOrganizationId,
}: {
  activeTab: BuildDetailSubTab;
  activeBuildId?: string;
  actions?: ProductionBuildDetailActions;
  calendarTimeframe?: CalendarTimeframe;
  calendarWorkspace?: DrawFlowCalendarWorkspaceData | null;
  contractorDetailHrefFor?: (contractorId: string) => string;
  detail: ProductionBuildDetail;
  focusedReference?: string;
  fundingWorkspaceEnabled?: boolean;
  breadcrumbRootHref?: string;
  breadcrumbRootLabel?: string;
  breadcrumbSectionHref?: string;
  breadcrumbSectionLabel?: string;
  milestoneKey?: string;
  onChangeCalendarTimeframe?: (timeframe: CalendarTimeframe) => void;
  onChangeMilestone?: (milestoneKey?: string) => void;
  onChangeRail: (rail: "open" | "closed") => void;
  onChangeTab: (tab: BuildDetailSubTab, focus?: string) => void;
  /** PROTOTYPE — exposes the real trigger for planned milestones before the production state model changes. */
  prototypeMilestoneStartTrigger?: boolean;
  rail?: "open" | "closed";
  staff?: React.ReactNode;
  timelineWorkspace?: ActiveBuildTimelineWorkspaceProps["workspace"] | null;
  visibleTabs?: BuildDetailSubTab[];
  viewerRole?: "builder" | "lender";
  workosOrganizationId?: string;
}) {
  const projection = useMemo(
    () => buildProductionBuildProjection(detail),
    [detail]
  );
  const currentDay = resolveProductionCurrentDay(detail, timelineWorkspace);
  const eventsOpen = rail === "open";
  const eventCount =
    (detail.auditEvents?.length ?? 0) + (detail.quickActionEvents?.length ?? 0);
  const activeTabLabel =
    BUILD_DETAIL_TABS.find((tab) => tab.value === activeTab)?.label ?? "Build";
  const permit = firstPermitDocument(detail.documents);
  const [localActiveMilestoneKey, setLocalActiveMilestoneKey] = useState<
    string | null
  >(milestoneKey ?? null);
  const [assignContractorTarget, setAssignContractorTarget] = useState<{
    milestoneKey: string;
    submilestoneKeys?: string[];
  } | null>(null);
  const [siteVisitOrderRequest, setSiteVisitOrderRequest] =
    useState<SiteVisitOrderRequest | null>(null);
  const [milestoneStartController, setMilestoneStartController] = useState<{
    onCancel?: () => void;
    onConfirm?: (
      input: MilestoneStartConfirmation
    ) => Promise<unknown> | unknown;
    request: MilestoneStartDialogRequest;
  } | null>(null);
  const milestoneStartRequest = milestoneStartController?.request ?? null;
  const [localFocusedReference, setLocalFocusedReference] = useState<
    string | undefined
  >(focusedReference);
  const effectiveFocusedReference = localFocusedReference ?? focusedReference;
  useEffect(() => {
    setLocalFocusedReference(focusedReference);
  }, [focusedReference]);
  const activeMilestoneKey = milestoneKey ?? localActiveMilestoneKey;
  const activeMilestone = activeMilestoneKey
    ? (projection.milestones.find(
        (milestone) => milestone.key === activeMilestoneKey
      ) ?? null)
    : null;
  const setActiveMilestoneKey = (next: string | null) => {
    setLocalActiveMilestoneKey(next);
    onChangeMilestone?.(next ?? undefined);
  };
  useEffect(() => {
    if (focusedReference?.startsWith("milestone:")) {
      const entityId = focusedReference.slice("milestone:".length);
      setLocalActiveMilestoneKey(
        detail.milestones.find((milestone) => milestone._id === entityId)
          ?.key ?? null
      );
      return;
    }
    if (focusedReference?.startsWith("submilestone:")) {
      const entityId = focusedReference.slice("submilestone:".length);
      setLocalActiveMilestoneKey(
        detail.submilestones.find(
          (submilestone) => submilestone._id === entityId
        )?.milestoneKey ?? null
      );
    }
  }, [detail.milestones, detail.submilestones, focusedReference]);
  const sheetData = useMemo(() => {
    const data = activeMilestoneKey
      ? buildMilestoneSheetData(
          detail,
          projection,
          activeMilestoneKey,
          currentDay
        )
      : null;
    return data &&
      viewerRole === "builder" &&
      activeMilestone?.status === "planned"
      ? { ...data, canStartWork: Boolean(actions?.startMilestoneWork) }
      : data;
  }, [
    actions?.startMilestoneWork,
    activeMilestone?.status,
    activeMilestoneKey,
    currentDay,
    detail,
    projection,
    viewerRole,
  ]);
  const openMilestoneStart = (
    milestoneKey: string,
    source: MilestoneStartSource,
    submilestoneKey?: string,
    action: "correct" | "retract" | "start" = "start"
  ) => {
    const milestone = detail.milestones.find(
      (candidate) => candidate.key === milestoneKey
    );
    const submilestone = submilestoneKey
      ? detail.submilestones.find(
          (candidate) =>
            candidate.milestoneKey === milestoneKey &&
            candidate.key === submilestoneKey
        )
      : undefined;
    if (!milestone) {
      return;
    }
    const dependencyBlockers = milestone.dependencyKeys
      .map((key) =>
        detail.milestones.find((candidate) => candidate.key === key)
      )
      .filter(
        (
          candidate
        ): candidate is ProductionMilestone & {
          status: "in_progress" | "planned";
        } =>
          Boolean(
            candidate &&
              (candidate.status === "planned" ||
                candidate.status === "in_progress")
          )
      )
      .map((candidate) => ({
        milestoneKey: candidate.key,
        milestoneName: candidate.name,
        status: candidate.status,
      }));
    const request: MilestoneStartDialogRequest = {
      action,
      actualStartedAt:
        submilestone?.actualStartedAt ?? milestone.actualStartedAt,
      buildName: detail.build.buildName,
      dependencyBlockers: action === "start" ? dependencyBlockers : [],
      milestoneKey,
      milestoneName: milestone.name,
      plannedStartDate: addDaysSafe(
        detail.build.startDate,
        submilestone?.startDay ?? milestone.dayStart
      ),
      scope: submilestone ? "submilestone" : "milestone",
      source,
      startParent: Boolean(
        submilestone && viewerRole === "builder" && !milestone.actualStartedAt
      ),
      submilestoneKey: submilestone?.key,
      submilestoneName: submilestone?.name,
    };
    setMilestoneStartController({ request });
    return request;
  };
  const confirmMilestoneStart = async (input: MilestoneStartConfirmation) => {
    if (milestoneStartController?.onConfirm) {
      return await milestoneStartController.onConfirm(input);
    }
    if (input.action === "correct") {
      if (input.actualStartedAt === undefined || !input.reason) {
        throw new Error("A corrected actual start and reason are required.");
      }
      return await actions?.correctMilestoneStart?.({
        actualStartedAt: input.actualStartedAt,
        idempotencyKey: input.idempotencyKey,
        milestoneKey: input.milestoneKey,
        reason: input.reason,
        source: input.source,
        submilestoneKey: input.submilestoneKey,
      });
    }
    if (input.action === "retract") {
      if (!input.reason) {
        throw new Error("A retraction reason is required.");
      }
      return await actions?.retractMilestoneStart?.({
        idempotencyKey: input.idempotencyKey,
        milestoneKey: input.milestoneKey,
        reason: input.reason,
        source: input.source,
        submilestoneKey: input.submilestoneKey,
      });
    }
    if (input.actualStartedAt === undefined) {
      throw new Error("An actual start is required.");
    }
    return await actions?.startMilestoneWork?.({
      actualStartedAt: input.actualStartedAt,
      dependencyOverrideReason: input.dependencyOverrideReason,
      idempotencyKey: input.idempotencyKey,
      milestoneKey: input.milestoneKey,
      source: input.source,
      startParent: input.startParent,
      submilestoneKey: input.submilestoneKey,
    });
  };
  const confirmStartAndCompletion = <T,>(
    request: MilestoneStartDialogRequest,
    execute: (input: MilestoneStartConfirmation) => Promise<T> | T
  ) =>
    new Promise<T>((resolve, reject) => {
      setMilestoneStartController({
        onCancel: () =>
          reject(new Error("Actual start confirmation was cancelled.")),
        onConfirm: async (input) => {
          try {
            const result = await execute(input);
            resolve(result);
            return result;
          } catch (error) {
            reject(error);
            throw error;
          }
        },
        request,
      });
    });
  const siteVisitOrderMilestone = siteVisitOrderRequest
    ? (detail.milestones.find(
        (milestone) => milestone.key === siteVisitOrderRequest.milestoneKey
      ) ?? null)
    : null;
  const siteVisitOrderSubmilestones = siteVisitOrderRequest
    ? detail.submilestones
        .filter(
          (submilestone) =>
            submilestone.milestoneKey === siteVisitOrderRequest.milestoneKey
        )
        .sort((left, right) => left.order - right.order)
    : [];
  const requestSiteVisit = (request: SiteVisitOrderRequest) => {
    setSiteVisitOrderRequest(request);
  };
  const confirmSiteVisitOrder = async (input: SiteVisitOrderConfirmation) => {
    if (input.requestedDay !== undefined && actions?.scheduleSiteVisit) {
      return await actions.scheduleSiteVisit({
        milestoneKey: input.milestoneKey,
        ...(input.note ? { note: input.note } : {}),
        requestedDay: input.requestedDay,
        ...(input.requestedTime ? { requestedTime: input.requestedTime } : {}),
        siteVisitGuidance: input.siteVisitGuidance,
        submilestoneKeys: input.submilestoneKeys,
      });
    }
    return await actions?.assignSiteVisit?.({
      milestoneKey: input.milestoneKey,
      ...(input.note ? { note: input.note } : {}),
      ...(input.requestedTime ? { requestedTime: input.requestedTime } : {}),
      siteVisitGuidance: input.siteVisitGuidance,
      submilestoneKeys: input.submilestoneKeys,
    });
  };

  useEffect(() => {
    if (!effectiveFocusedReference) {
      return;
    }
    const focusKind = effectiveFocusedReference.slice(
      0,
      effectiveFocusedReference.indexOf(":")
    );
    if (
      focusKind === "milestone" ||
      focusKind === "participant" ||
      focusKind === "siteVisit"
    ) {
      return;
    }
    let cancelled = false;
    let attempts = 0;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    const focusTarget = () => {
      if (cancelled) {
        return;
      }
      const target = Array.from(
        document.querySelectorAll<HTMLElement>("[data-collaboration-focus]")
      ).find(
        (candidate) =>
          candidate.dataset.collaborationFocus === effectiveFocusedReference
      );
      if (!target) {
        attempts += 1;
        if (attempts < 40) {
          retryTimer = setTimeout(focusTarget, 80);
        }
        return;
      }
      target.tabIndex = -1;
      target.focus({ preventScroll: true });
      target.scrollIntoView?.({ behavior: "smooth", block: "center" });
      target.dataset.collaborationFocused = "true";
      target.classList.add("ring-2", "ring-primary", "ring-offset-2");
      retryTimer = setTimeout(() => {
        delete target.dataset.collaborationFocused;
        target.classList.remove("ring-2", "ring-primary", "ring-offset-2");
      }, 1800);
    };
    retryTimer = setTimeout(focusTarget, 0);
    return () => {
      cancelled = true;
      if (retryTimer) {
        clearTimeout(retryTimer);
      }
    };
  }, [activeTab, effectiveFocusedReference]);

  return (
    <main
      className="min-h-[calc(100vh-4rem)] min-w-0 bg-muted/30 px-2"
      data-testid="production-build-detail-route"
    >
      <section className="flex min-w-0 flex-col gap-3 px-0 py-3 sm:gap-4 sm:py-4 md:gap-5 md:py-0">
      <ProductionBuildHeader
        breadcrumbRootHref={breadcrumbRootHref}
        breadcrumbRootLabel={breadcrumbRootLabel}
        breadcrumbSectionHref={breadcrumbSectionHref}
        breadcrumbSectionLabel={breadcrumbSectionLabel}
        detail={detail}
        eventCount={eventCount}
        onOpenEvents={() => onChangeRail("open")}
        permit={permit}
      />
      <BuildDetailTabBar
        activeTab={activeTab}
        onChangeTab={onChangeTab}
        tabs={visibleTabs}
      />
      <section
        aria-label={`${activeTabLabel} workspace`}
        className="min-w-0"
        data-testid="active-build-workspace-section"
      >
        {activeTab === "details" ? (
          <ProductionDetailsTab
            actions={actions}
            currentDay={currentDay}
            detail={detail}
            focusedReference={effectiveFocusedReference}
            fundingWorkspaceEnabled={fundingWorkspaceEnabled}
            onChangeTab={onChangeTab}
            onFocusReference={setLocalFocusedReference}
            onOpenMilestone={setActiveMilestoneKey}
            projection={projection}
            viewerRole={viewerRole}
            workosOrganizationId={workosOrganizationId}
          />
        ) : null}
        {activeTab === "documents" ? (
          <ProductionDocumentsTab actions={actions} detail={detail} />
        ) : null}
        {activeTab === "milestones" ? (
          <ProductionMilestonesTab
            currentDay={currentDay}
            detail={detail}
            onAssignContractor={
              actions?.assignContractorToMilestone ||
              actions?.createAndAssignContractor
                ? (card) =>
                    setAssignContractorTarget({
                      milestoneKey: card.milestoneKey,
                    })
                : undefined
            }
            onCardClick={(card) => setActiveMilestoneKey(card.milestoneKey)}
            onStartWork={
              viewerRole === "builder" && actions?.startMilestoneWork
                ? (milestoneKey) =>
                    openMilestoneStart(milestoneKey, "milestone_card")
                : undefined
            }
            projection={projection}
            viewerRole={viewerRole}
          />
        ) : null}
        {activeTab === "contractors" ? (
          <ProductionContractorsTab
            actions={actions}
            contractorDetailHrefFor={contractorDetailHrefFor}
            detail={detail}
            viewerRole={viewerRole}
          />
        ) : null}
        {activeTab === "timeline" ? (
          <ProductionTimelineTab
            actions={actions}
            activeBuildId={activeBuildId}
            detail={detail}
            onRequestSiteVisit={requestSiteVisit}
            timelineWorkspace={timelineWorkspace}
            viewerRole={viewerRole}
            workosOrganizationId={workosOrganizationId}
          />
        ) : null}
        {activeTab === "evidence" ? (
          <ProductionEvidenceTab
            actions={actions}
            detail={detail}
            focusedReference={effectiveFocusedReference}
            onOpenMilestone={(milestoneKey) =>
              setActiveMilestoneKey(milestoneKey)
            }
            projection={projection}
          />
        ) : null}
        {activeTab === "materials" ? (
          <ProductionBuildMaterialsTab
            actions={actions?.materialPlanning}
            detail={detail}
            focusedReference={effectiveFocusedReference}
          />
        ) : null}
        {activeTab === "staff" ? staff : null}
        {activeTab === "calendar" ? (
          <ProductionCalendarTab
            actions={actions}
            calendarTimeframe={calendarTimeframe}
            calendarWorkspace={calendarWorkspace}
            detail={detail}
            focusedReference={effectiveFocusedReference}
            onChangeCalendarTimeframe={onChangeCalendarTimeframe}
            onChangeTab={onChangeTab}
            onRequestSiteVisit={requestSiteVisit}
            onStartWork={
              viewerRole === "builder" && actions?.startMilestoneWork
                ? (milestoneKey) => openMilestoneStart(milestoneKey, "calendar")
                : undefined
            }
            workosOrganizationId={workosOrganizationId}
          />
        ) : null}
        {activeTab === "gantt" ? (
          <ProductionGanttTab
            actions={actions}
            activeBuildId={activeBuildId}
            detail={detail}
            onRequestSiteVisit={requestSiteVisit}
            onStartWork={
              viewerRole === "builder" && actions?.startMilestoneWork
                ? (milestoneKey) => openMilestoneStart(milestoneKey, "gantt")
                : undefined
            }
            timelineWorkspace={timelineWorkspace}
            viewerRole={viewerRole}
            workosOrganizationId={workosOrganizationId}
          />
        ) : null}
      </section>
      </section>
      <EventRailSheet
        auditEvents={detail.auditEvents ?? []}
        onOpenChange={(open) => onChangeRail(open ? "open" : "closed")}
        open={eventsOpen}
        quickActionEvents={detail.quickActionEvents ?? []}
      />
      {viewerRole === "lender" && activeMilestone ? (
        <MilestoneCompletionReviewSheet
          actions={actions}
          detail={detail}
          focusedSubmilestoneId={
            effectiveFocusedReference?.startsWith("submilestone:")
              ? effectiveFocusedReference.slice("submilestone:".length)
              : undefined
          }
          milestone={activeMilestone}
          onAmendStart={
            actions?.correctMilestoneStart || actions?.retractMilestoneStart
              ? (action) =>
                  openMilestoneStart(
                    activeMilestone.key,
                    "milestone_detail",
                    undefined,
                    action
                  )
              : undefined
          }
          onOpenChange={(open) => {
            if (!open) {
              setActiveMilestoneKey(null);
            }
          }}
          onRequestSiteVisit={requestSiteVisit}
          open
          projection={projection}
        />
      ) : (
        <MilestoneDetailSheet
          assignmentsSourceLabel="buildContractorAssignments"
          data={sheetData}
          eventsSourceLabel="activeBuildAuditEvents"
          focusedSubmilestoneId={
            effectiveFocusedReference?.startsWith("submilestone:")
              ? effectiveFocusedReference.slice("submilestone:".length)
              : undefined
          }
          focusedSubmilestoneKey={
            effectiveFocusedReference?.startsWith("submilestone:")
              ? detail.submilestones.find(
                  (submilestone) =>
                    submilestone._id ===
                    effectiveFocusedReference.slice("submilestone:".length)
                )?.key
              : undefined
          }
          key={activeMilestoneKey ?? "milestone-sheet"}
          onAmendStart={
            actions?.correctMilestoneStart || actions?.retractMilestoneStart
              ? (action, milestoneKey, submilestoneKey) =>
                  openMilestoneStart(
                    milestoneKey,
                    submilestoneKey
                      ? "submilestone_detail"
                      : "milestone_detail",
                    submilestoneKey,
                    action
                  )
              : undefined
          }
          onAssignContractor={
            actions?.assignContractorToMilestone ||
            actions?.createAndAssignContractor
              ? (milestoneKey, submilestoneKey) =>
                  setAssignContractorTarget({
                    milestoneKey,
                    ...(submilestoneKey
                      ? { submilestoneKeys: [submilestoneKey] }
                      : {}),
                  })
              : undefined
          }
          onClose={() => setActiveMilestoneKey(null)}
          onStartSubmilestone={
            actions?.startMilestoneWork
              ? (milestoneKey, submilestoneKey, source) =>
                  openMilestoneStart(milestoneKey, source, submilestoneKey)
              : undefined
          }
          onStartWork={
            actions?.startMilestoneWork
              ? (milestoneKey) =>
                  openMilestoneStart(milestoneKey, "milestone_detail")
              : undefined
          }
          onSubmitCompletion={
            actions?.submitMilestoneCompletion
              ? (input) => {
                  if (activeMilestone?.actualStartedAt) {
                    return actions.submitMilestoneCompletion?.(input);
                  }
                  const request = openMilestoneStart(
                    input.milestoneKey,
                    "completion_catch_up"
                  );
                  if (!request) {
                    throw new Error("Milestone start target is unavailable.");
                  }
                  return confirmStartAndCompletion(request, (confirmation) => {
                    if (confirmation.actualStartedAt === undefined) {
                      throw new Error("An actual start is required.");
                    }
                    return actions.submitMilestoneCompletion?.({
                      ...input,
                      actualStartedAt: confirmation.actualStartedAt,
                      dependencyOverrideReason:
                        confirmation.dependencyOverrideReason,
                      idempotencyKey: confirmation.idempotencyKey,
                    });
                  });
                }
              : undefined
          }
          onUpdateSubmilestone={
            actions?.updateSubmilestoneExecution
              ? (input) => {
                  const target = detail.submilestones.find(
                    (candidate) =>
                      candidate.milestoneKey === input.milestoneKey &&
                      candidate.key === input.submilestoneKey
                  );
                  if (input.status !== "complete" || target?.actualStartedAt) {
                    return actions.updateSubmilestoneExecution?.(input);
                  }
                  const request = openMilestoneStart(
                    input.milestoneKey,
                    "completion_catch_up",
                    input.submilestoneKey
                  );
                  if (!request) {
                    throw new Error(
                      "Submilestone start target is unavailable."
                    );
                  }
                  return confirmStartAndCompletion(request, (confirmation) => {
                    if (confirmation.actualStartedAt === undefined) {
                      throw new Error("An actual start is required.");
                    }
                    return actions.updateSubmilestoneExecution?.({
                      ...input,
                      actualStartedAt: confirmation.actualStartedAt,
                      dependencyOverrideReason:
                        confirmation.dependencyOverrideReason,
                      idempotencyKey: confirmation.idempotencyKey,
                    });
                  });
                }
              : undefined
          }
          onUploadEvidence={actions?.uploadSubmilestoneEvidence}
        />
      )}
      {milestoneStartRequest ? (
        <MilestoneStartDialog
          onClose={() => {
            milestoneStartController?.onCancel?.();
            setMilestoneStartController(null);
          }}
          onConfirm={confirmMilestoneStart}
          request={milestoneStartRequest}
        />
      ) : null}
      <SiteVisitOrderDialog
        build={{
          location: detail.build.location,
          name: detail.build.buildName,
        }}
        milestone={siteVisitOrderMilestone}
        onConfirm={confirmSiteVisitOrder}
        onGenerate={actions?.generateSiteVisitGuidance}
        onOpenChange={(open) => {
          if (!open) {
            setSiteVisitOrderRequest(null);
          }
        }}
        open={Boolean(siteVisitOrderRequest && siteVisitOrderMilestone)}
        request={siteVisitOrderRequest}
        submilestones={siteVisitOrderSubmilestones}
      />
      <ContractorQuickAddDrawer
        availableContractors={contractorAssignmentOptions(detail)}
        createLabel="Create and assign"
        description="Assign an existing build contractor or create a profile and attach it to this milestone scope."
        onAttachExisting={async ({ assignmentCost, contractorId, role }) => {
          if (!assignContractorTarget) {
            return;
          }
          await actions?.assignContractorToMilestone?.({
            assignmentCost,
            contractorId,
            milestoneKey: assignContractorTarget.milestoneKey,
            role,
            submilestoneKeys: assignContractorTarget.submilestoneKeys,
          });
        }}
        onCreate={async ({ assignmentCost, contractor, role }) => {
          if (!assignContractorTarget) {
            return;
          }
          return actions?.createAndAssignContractor?.({
            assignmentCost,
            contractor,
            milestoneKey: assignContractorTarget.milestoneKey,
            role: role ?? "Contractor",
            submilestoneKeys: assignContractorTarget.submilestoneKeys,
          });
        }}
        onInviteCreatedContractor={
          actions?.inviteContractor
            ? async (contractorId) => {
                await actions.inviteContractor?.(contractorId);
              }
            : undefined
        }
        onOpenChange={(open) => {
          if (!open) {
            setAssignContractorTarget(null);
          }
        }}
        open={Boolean(assignContractorTarget)}
        requireRole
        showAssignmentCost
        title={
          assignContractorTarget
            ? `Assign contractor to ${assignContractorTarget.submilestoneKeys?.[0] ?? assignContractorTarget.milestoneKey}`
            : "Assign contractor"
        }
      />
    </main>
  );
}

function ProductionBuildHeader({
  breadcrumbRootHref,
  breadcrumbRootLabel,
  breadcrumbSectionHref,
  breadcrumbSectionLabel,
  detail,
  eventCount,
  onOpenEvents,
  permit,
}: {
  breadcrumbRootHref: string;
  breadcrumbRootLabel: string;
  breadcrumbSectionHref: string;
  breadcrumbSectionLabel: string;
  detail: ProductionBuildDetail;
  eventCount: number;
  onOpenEvents: () => void;
  permit: ReturnType<typeof firstPermitDocument>;
}) {
  return (
    <Frame>
      <FramePanel className="flex flex-col gap-4 p-3 sm:p-4 md:flex-row md:items-end md:justify-between">
        <div className="min-w-0">
          <nav
            aria-label="Breadcrumbs"
            className="mb-3 flex min-w-0 items-center gap-2 overflow-x-auto text-muted-foreground text-xs"
          >
            <a className="hover:text-foreground" href={breadcrumbRootHref}>
              {breadcrumbRootLabel}
            </a>
            <span>/</span>
            <a className="hover:text-foreground" href={breadcrumbSectionHref}>
              {breadcrumbSectionLabel}
            </a>
          </nav>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={statusBadgeVariant(detail.build.status)}>
              {statusLabel(detail.build.status)}
            </Badge>
            <span className="text-muted-foreground text-xs">
              Production active Build
            </span>
          </div>
          <h1 className="mt-2 max-w-full text-wrap break-words font-semibold text-xl tracking-tight sm:text-2xl">
            {detail.build.buildName}
          </h1>
          <p className="mt-1 flex min-w-0 items-start gap-1.5 text-muted-foreground text-sm">
            <MapPin className="size-4" />
            <span className="min-w-0 text-wrap break-words">
              {detail.build.location}
            </span>
          </p>
        </div>
        <div className="flex w-full flex-col gap-3 md:min-w-72 md:max-w-sm">
          <div className="flex flex-wrap items-center justify-end gap-2">
            <BuildPermitViewerDrawer permit={permit} size="sm" />
            <Button
              data-testid="build-detail-events-trigger"
              onClick={onOpenEvents}
              size="sm"
              type="button"
              variant="outline"
            >
              <ScrollText aria-hidden="true" className="size-4" />
              Events
              {eventCount > 0 ? (
                <Badge
                  className="ml-1 tabular-nums"
                  size="sm"
                  variant="secondary"
                >
                  {eventCount}
                </Badge>
              ) : null}
            </Button>
          </div>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <HeaderStat
              label="Start"
              value={formatDate(detail.build.startDate)}
            />
            <HeaderStat
              label="Budget"
              value={formatCents(detail.build.totalBudgetCents)}
            />
          </div>
        </div>
      </FramePanel>
    </Frame>
  );
}

function HeaderStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-md border bg-background/60 px-3 py-2">
      <p className="text-muted-foreground text-xs">{label}</p>
      <p className="truncate font-medium tabular-nums">{value}</p>
    </div>
  );
}

function BuildCollaborationErrorFallback({
  reset,
}: {
  error: Error;
  reset: () => void;
}) {
  return (
    <Frame data-testid="build-collaboration-error">
      <FramePanel className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="font-medium text-sm">
            Collaboration is temporarily unavailable
          </p>
          <p className="mt-1 text-muted-foreground text-sm">
            Build Overview is still available. Retry this workspace without
            reloading the Build.
          </p>
        </div>
        <Button onClick={reset} size="sm" type="button" variant="outline">
          <RefreshCw aria-hidden="true" className="size-4" />
          Retry collaboration
        </Button>
      </FramePanel>
    </Frame>
  );
}

function ProductionDetailsTab({
  actions,
  currentDay,
  detail,
  focusedReference,
  fundingWorkspaceEnabled,
  onChangeTab,
  onFocusReference,
  onOpenMilestone,
  projection,
  viewerRole,
  workosOrganizationId,
}: {
  actions?: ProductionBuildDetailActions;
  currentDay: number;
  detail: ProductionBuildDetail;
  focusedReference?: string;
  fundingWorkspaceEnabled: boolean;
  onChangeTab: (tab: BuildDetailSubTab, focus?: string) => void;
  onFocusReference: (focus?: string) => void;
  onOpenMilestone: (milestoneKey: string) => void;
  projection: ProductionBuildProjection;
  viewerRole: "builder" | "lender";
  workosOrganizationId?: string;
}) {
  const [activeOverviewSection, setActiveOverviewSection] =
    useState<BuildOverviewSection>("current");
  useEffect(() => {
    if (focusedReference?.startsWith("draw:")) {
      setActiveOverviewSection("draws");
    }
  }, [focusedReference]);

  const showSitePhotos = activeOverviewSection !== "draws";

  return (
    <div className="flex flex-col gap-6" data-testid="production-build-details">
      <section
        className={cn(
          "grid items-stretch",
          showSitePhotos &&
            "xl:grid-cols-[minmax(0,2fr)_auto_minmax(320px,1fr)]"
        )}
        data-testid="build-overview-layout"
      >
        <ProductionBuildDetailsCard
          actions={actions}
          activeSection={activeOverviewSection}
          currentDay={currentDay}
          detail={detail}
          fundingWorkspaceEnabled={fundingWorkspaceEnabled}
          onOpenMilestone={onOpenMilestone}
          onSectionChange={setActiveOverviewSection}
          projection={projection}
          viewerRole={viewerRole}
        />
        {showSitePhotos ? (
          <>
            <Separator className="my-5 xl:hidden" />
            <Separator className="mx-5 hidden xl:block" orientation="vertical" />
            <SitePhotoCarousel
              buildName={detail.build.buildName}
              photos={detail.sitePhotos ?? []}
              siteAddress={detail.build.location}
              siteLatitude={detail.build.locationLatitude}
              siteLongitude={detail.build.locationLongitude}
            />
          </>
        ) : null}
      </section>

      <header className="scroll-mt-24 space-y-1" id="build-collaboration">
        <h2 className="font-semibold text-xl leading-snug">
          Build collaboration
        </h2>
        <p className="text-muted-foreground text-sm">
          Coordinate updates, linked Build work, decisions, and Action Items
          with every authorized participant.
        </p>
      </header>

      <CatchBoundary
        errorComponent={BuildCollaborationErrorFallback}
        getResetKey={() =>
          `${detail.build._id}:${workosOrganizationId ?? "unscoped"}`
        }
      >
        <BuildCollaborationWorkspace
          buildId={detail.build._id}
          focusedReference={focusedReference}
          onOpenReference={(reference) => {
            const nextFocus = `${reference.entityKind}:${reference.entityId}`;
            onFocusReference(nextFocus);
            window.history.replaceState(
              window.history.state,
              "",
              reference.href
            );
            if (reference.entityKind === "milestone") {
              const milestone = detail.milestones.find(
                (candidate) => candidate._id === reference.entityId
              );
              if (milestone) {
                onOpenMilestone(milestone.key);
                return;
              }
            }
            if (reference.entityKind === "submilestone") {
              const submilestone = detail.submilestones.find(
                (candidate) => candidate._id === reference.entityId
              );
              if (submilestone) {
                onOpenMilestone(submilestone.milestoneKey);
                return;
              }
            }
            if (reference.entityKind === "draw") {
              setActiveOverviewSection("draws");
              document
                .querySelector('[data-testid="production-build-details-card"]')
                ?.scrollIntoView({ behavior: "smooth", block: "start" });
              return;
            }
            const tabByKind: Partial<Record<string, BuildDetailSubTab>> = {
              actionItem: "details",
              document: "documents",
              evidenceAsset: "evidence",
              evidencePackage: "evidence",
              material: "materials",
              participant: "details",
              siteVisit: "calendar",
            };
            const tab = tabByKind[reference.entityKind];
            if (tab) {
              onChangeTab(tab, nextFocus);
            }
          }}
          organizationId={workosOrganizationId}
        />
      </CatchBoundary>
    </div>
  );
}

type BuildOverviewSection = "current" | "draws" | "build" | "loan";

function fundingRequestAction(
  draws: ProductionDraw[],
  action?: (draw: ProductionDraw) => Promise<unknown> | unknown
) {
  if (!action) {
    return;
  }
  return (request: FundingRequestRecord) => {
    const draw = draws.find((row) => row.drawKey === request.drawKey);
    if (!draw) {
      throw new Error("This draw request is no longer available.");
    }
    return action(draw);
  };
}

function fundingRejectAction(
  draws: ProductionDraw[],
  action?: ProductionBuildDetailActions["rejectDraw"]
) {
  if (!action) {
    return;
  }
  return (decision: FundingRejectDecision) => {
    const draw = draws.find((row) => row.drawKey === decision.request.drawKey);
    if (!draw) {
      throw new Error("This draw request is no longer available.");
    }
    return action({ draw, reason: decision.reason });
  };
}

function ProductionBuildDetailsCard({
  activeSection,
  actions,
  currentDay,
  detail,
  fundingWorkspaceEnabled,
  onOpenMilestone,
  onSectionChange,
  projection,
  viewerRole,
}: {
  activeSection: BuildOverviewSection;
  actions?: ProductionBuildDetailActions;
  currentDay: number;
  detail: ProductionBuildDetail;
  fundingWorkspaceEnabled: boolean;
  onOpenMilestone: (milestoneKey: string) => void;
  onSectionChange: (section: BuildOverviewSection) => void;
  projection: ProductionBuildProjection;
  viewerRole: "builder" | "lender";
}) {
  const currentOverview = useMemo(
    () => buildCurrentBuildOverview(detail, projection, currentDay),
    [currentDay, detail, projection]
  );
  const siteVisitsOpen =
    detail.siteVisits?.filter((visit) => visit.status === "requested").length ??
    0;
  const openWarnings =
    projection.draws.filter((draw) => draw.status === "rejected").length +
    (detail.sitePhotos?.filter((photo) => photo.locationVerified === false)
      .length ?? 0);
  const [editOpen, setEditOpen] = useState(false);
  return (
    <>
      <section
        className="min-w-0"
        data-testid="production-build-details-card"
        id="ui-build-details"
      >
        <header className="mb-1 flex items-center justify-between gap-3">
          <h2 className="font-semibold text-sm">Build Overview</h2>
          <div className="flex shrink-0 items-center gap-2">
            <span className="text-muted-foreground text-xs">active_builds</span>
            {actions?.updateNonFinancialDetails ? (
              <Button
                aria-label="Edit build details"
                data-testid="edit-build-details-trigger"
                onClick={() => setEditOpen(true)}
                size="icon-xs"
                type="button"
                variant="outline"
              >
                <Pencil aria-hidden="true" className="size-3.5" />
              </Button>
            ) : null}
          </div>
        </header>
        <Tabs
          onValueChange={(value) =>
            onSectionChange(value as BuildOverviewSection)
          }
          value={activeSection}
        >
          <TabsList
            aria-label="Build overview sections"
            className="mt-2 mb-4"
            variant="underline"
          >
            <TabsTab data-testid="build-overview-tab-current" value="current">
              Current
            </TabsTab>
            <TabsTab data-testid="build-overview-tab-draws" value="draws">
              Draws
            </TabsTab>
            <TabsTab data-testid="build-overview-tab-build" value="build">
              Build
            </TabsTab>
            <TabsTab data-testid="build-overview-tab-loan" value="loan">
              Loan
            </TabsTab>
          </TabsList>

          <TabsPanel value="current">
            <CurrentBuildOverviewPanel
              actions={actions}
              currentDay={currentDay}
              currentOverview={currentOverview}
              detail={detail}
              onReviewMilestone={(milestone) =>
                onOpenMilestone(milestone.key)
              }
              projection={projection}
              viewerRole={viewerRole}
            />
          </TabsPanel>

          <TabsPanel value="draws">
            <div className="space-y-4">
              {fundingWorkspaceEnabled ||
              (viewerRole === "builder" &&
                (actions?.requestDrawAmount ||
                  detail.plannedDraws !== undefined)) ? (
                <BuildFundingWorkspace
                  model={projectBuildFunding({
                    availability: detail.drawFunding,
                    canRequest: Boolean(actions?.requestDrawAmount),
                    buildLabel: detail.build.buildName,
                    facilityCents: detail.loanFacility?.principalCents,
                    milestones: detail.milestones,
                    plannedDraws:
                      detail.plannedDraws ??
                      detail.draws.filter(
                        (draw) => draw.status === "planned"
                      ),
                    requests: detail.draws.filter(
                      (
                        draw
                      ): draw is ProductionDraw & {
                        status: Exclude<ProductionDrawStatus, "planned">;
                      } => draw.status !== "planned"
                    ),
                    startDate: detail.build.startDate,
                  })}
                  onApproveDraw={fundingRequestAction(
                    detail.draws,
                    actions?.approveDraw
                  )}
                  onOpenMilestone={onOpenMilestone}
                  onRejectDraw={fundingRejectAction(
                    detail.draws,
                    actions?.rejectDraw
                  )}
                  onReleaseDraw={fundingRequestAction(
                    detail.draws,
                    actions?.releaseDraw
                  )}
                  onRequestDraw={actions?.requestDrawAmount}
                  onStartDrawReview={fundingRequestAction(
                    detail.draws,
                    actions?.startDrawReview
                  )}
                  onSubmitDrawForAdmin={fundingRequestAction(
                    detail.draws,
                    actions?.submitDrawForAdmin
                  )}
                  onWithdrawDraw={
                    actions?.withdrawDraw
                      ? async (requestKey) =>
                          await actions.withdrawDraw?.(requestKey)
                      : undefined
                  }
                  viewerRole={viewerRole}
                />
              ) : (
                <DrawOverviewPanel
                  actions={actions}
                  currentOverview={currentOverview}
                  detail={detail}
                  projection={projection}
                  viewerRole={viewerRole}
                />
              )}
              <FacilityChangeRequestsCard actions={actions} detail={detail} />
              <BudgetRevisionCard
                actions={actions}
                detail={detail}
                viewerRole={viewerRole}
              />
            </div>
          </TabsPanel>

          <TabsPanel value="build">
            <BuildMetadataPanel
              detail={detail}
              openWarnings={openWarnings}
              projection={projection}
              siteVisitsOpen={siteVisitsOpen}
            />
          </TabsPanel>

          <TabsPanel value="loan">
            <LoanMetadataPanel
              currentOverview={currentOverview}
              detail={detail}
              projection={projection}
            />
          </TabsPanel>
        </Tabs>
      </section>
      {actions?.updateNonFinancialDetails ? (
        <BuildNonFinancialDetailsSheet
          detail={detail}
          onOpenChange={setEditOpen}
          onSubmit={actions.updateNonFinancialDetails}
          open={editOpen}
        />
      ) : null}
    </>
  );
}

interface CurrentMilestoneHorizon {
  behindSchedule: ProductionMilestone[];
  current: ProductionMilestone[];
  next: ProductionMilestone | null;
}

interface CurrentBuildOverview {
  committedDrawCents: number;
  currentAvailabilityCents: number;
  drawnCents: number;
  milestoneHorizon: CurrentMilestoneHorizon;
  percentComplete: number;
  requestableAmountCents: number;
  totalApprovedCents: number;
  upcomingDraw: ProductionDraw | null;
}

function CurrentBuildOverviewPanel({
  actions,
  currentDay,
  currentOverview,
  detail,
  onReviewMilestone,
  projection,
  viewerRole,
}: {
  actions?: ProductionBuildDetailActions;
  currentDay: number;
  currentOverview: CurrentBuildOverview;
  detail: ProductionBuildDetail;
  onReviewMilestone: (milestone: ProductionMilestone) => void;
  projection: ProductionBuildProjection;
  viewerRole: "builder" | "lender";
}) {
  const horizon = currentOverview.milestoneHorizon;
  const activeDrawRequests = useMemo(
    () =>
      projection.draws
        .filter(
          (draw) =>
            draw.status === "requested" ||
            draw.status === "in_review" ||
            draw.status === "ready_for_admin" ||
            draw.status === "approved_for_release"
        )
        .slice()
        .sort(compareDrawsMostRecentFirst),
    [projection.draws]
  );
  const [pendingDrawAction, setPendingDrawAction] = useState<string | null>(
    null
  );
  const [drawActionError, setDrawActionError] = useState("");
  const runDrawAction = async (
    actionKey: string,
    draw: ProductionDraw,
    fn?: (draw: ProductionDraw) => Promise<unknown> | unknown
  ) => {
    if (!fn || pendingDrawAction) {
      return false;
    }
    setPendingDrawAction(`${actionKey}:${draw.drawKey}`);
    setDrawActionError("");
    try {
      await fn(draw);
      return true;
    } catch (cause) {
      setDrawActionError(
        cause instanceof Error ? cause.message : "Unable to update draw."
      );
      return false;
    } finally {
      setPendingDrawAction(null);
    }
  };

  return (
    <div className="grid gap-4" data-testid="build-overview-current-panel">
      <CurrentActiveDrawRequestsSection
        actions={actions}
        activeDrawRequests={activeDrawRequests}
        detail={detail}
        drawActionError={drawActionError}
        onRunAction={runDrawAction}
        pendingActionKey={pendingDrawAction}
        viewerRole={viewerRole}
      />

      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h3 className="font-semibold text-sm">Schedule horizon</h3>
          <p className="text-muted-foreground text-xs">
            Timing, ownership, and approved budget against the Build roadmap.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge size="sm" variant="outline">
            Build day {currentDay}
          </Badge>
          <Badge size="sm" variant="info">
            {currentOverview.percentComplete}% complete
          </Badge>
        </div>
      </div>

      <Frame data-testid="current-milestone-horizon">
        <CurrentMilestoneHorizonSection
          currentDay={currentDay}
          description="Incomplete work past its planned end date."
          detail={detail}
          emptyMessage="No milestones are behind schedule."
          lane="behind-schedule"
          milestones={horizon.behindSchedule}
          onReviewMilestone={onReviewMilestone}
          projection={projection}
          title="Behind Schedule Milestones"
          viewerRole={viewerRole}
        />
        <CurrentMilestoneHorizonSection
          currentDay={currentDay}
          description="Active work and completion submissions in flight."
          detail={detail}
          emptyMessage="No milestones are currently active."
          lane="current"
          milestones={horizon.current}
          onReviewMilestone={onReviewMilestone}
          projection={projection}
          title="Current Milestones"
          viewerRole={viewerRole}
        />
        <CurrentMilestoneHorizonSection
          currentDay={currentDay}
          description="The next incomplete milestone in the approved roadmap."
          detail={detail}
          emptyMessage="No upcoming milestone remains."
          lane="next-upcoming"
          milestones={horizon.next ? [horizon.next] : []}
          onReviewMilestone={onReviewMilestone}
          projection={projection}
          title="Next Upcoming Milestone"
          viewerRole={viewerRole}
        />
      </Frame>
    </div>
  );
}

function CurrentActiveDrawRequestsSection({
  actions,
  activeDrawRequests,
  detail,
  drawActionError,
  onRunAction,
  pendingActionKey,
  viewerRole,
}: {
  actions?: ProductionBuildDetailActions;
  activeDrawRequests: ProductionDraw[];
  detail: ProductionBuildDetail;
  drawActionError: string;
  onRunAction: (
    actionKey: string,
    draw: ProductionDraw,
    fn?: (draw: ProductionDraw) => Promise<unknown> | unknown
  ) => Promise<boolean>;
  pendingActionKey: string | null;
  viewerRole: "builder" | "lender";
}) {
  return (
    <Frame data-testid="current-active-draw-requests">
      <FramePanel
        className={cn(
          "p-3 sm:p-4",
          activeDrawRequests.length > 0 &&
            "border-primary/25 bg-primary/[0.035]"
        )}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-2.5">
            <span
              className={cn(
                "grid size-7 shrink-0 place-items-center rounded-md bg-muted text-muted-foreground",
                activeDrawRequests.length > 0 && "bg-primary/12 text-primary"
              )}
            >
              <Banknote aria-hidden="true" className="size-3.5" />
            </span>
            <div className="min-w-0">
              <h4 className="font-semibold text-sm">Active draw requests</h4>
              <p className="mt-0.5 max-w-[65ch] text-muted-foreground text-xs">
                Reimbursement requests awaiting lender approval or fund release.
              </p>
            </div>
          </div>
          <Badge
            aria-label={`${activeDrawRequests.length} active draw requests`}
            size="sm"
            variant={activeDrawRequests.length > 0 ? "info" : "outline"}
          >
            {activeDrawRequests.length}
          </Badge>
        </div>

        {activeDrawRequests.length > 0 ? (
          <div className="mt-4 grid gap-2">
            {activeDrawRequests.map((draw) => (
              <DrawSummaryItem
                actions={actions}
                actionTestIdPrefix="current-draw"
                detail={detail}
                draw={draw}
                key={draw.drawKey}
                onRunAction={onRunAction}
                pendingActionKey={pendingActionKey}
                viewerRole={viewerRole}
              />
            ))}
          </div>
        ) : (
          <p
            className="mt-4 border-border border-t pt-3 text-muted-foreground text-sm"
            data-testid="current-active-draw-requests-empty"
          >
            No active draw requests.
          </p>
        )}

        {drawActionError ? (
          <p className="mt-3 text-destructive text-xs" role="alert">
            {drawActionError}
          </p>
        ) : null}
      </FramePanel>
    </Frame>
  );
}

type CurrentMilestoneHorizonLane =
  | "behind-schedule"
  | "current"
  | "next-upcoming";

function CurrentMilestoneHorizonSection({
  currentDay,
  description,
  detail,
  emptyMessage,
  lane,
  milestones,
  onReviewMilestone,
  projection,
  title,
  viewerRole,
}: {
  currentDay: number;
  description: string;
  detail: ProductionBuildDetail;
  emptyMessage: string;
  lane: CurrentMilestoneHorizonLane;
  milestones: ProductionMilestone[];
  onReviewMilestone: (milestone: ProductionMilestone) => void;
  projection: ProductionBuildProjection;
  title: string;
  viewerRole: "builder" | "lender";
}) {
  const sectionTestId =
    lane === "behind-schedule"
      ? "behind-schedule-milestones"
      : lane === "current"
        ? "current-milestones"
        : "next-upcoming-milestone";
  return (
    <FramePanel
      className={cn(
        "p-3 sm:p-4",
        lane === "behind-schedule" &&
          "border-destructive/25 bg-destructive/[0.035]",
        lane === "current" && "border-primary/25 bg-primary/[0.035]"
      )}
      data-testid={sectionTestId}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-2.5">
          <span
            className={cn(
              "grid size-7 shrink-0 place-items-center rounded-md bg-muted text-muted-foreground",
              lane === "behind-schedule" &&
                "bg-destructive/10 text-destructive",
              lane === "current" && "bg-primary/12 text-primary"
            )}
          >
            {lane === "behind-schedule" ? (
              <AlertTriangle aria-hidden="true" className="size-3.5" />
            ) : lane === "current" ? (
              <CircleDot aria-hidden="true" className="size-3.5" />
            ) : (
              <CalendarClock aria-hidden="true" className="size-3.5" />
            )}
          </span>
          <div className="min-w-0">
            <h4 className="font-semibold text-sm">{title}</h4>
            <p className="mt-0.5 max-w-[65ch] text-muted-foreground text-xs">
              {description}
            </p>
          </div>
        </div>
        <Badge
          aria-label={`${milestones.length} ${title.toLowerCase()}`}
          size="sm"
          variant={
            lane === "behind-schedule"
              ? "error"
              : lane === "current"
                ? "info"
                : "outline"
          }
        >
          {milestones.length}
        </Badge>
      </div>

      {milestones.length > 0 ? (
        <div className="mt-4 grid gap-4">
          {milestones.map((milestone) => (
            <CurrentMilestoneHorizonItem
              currentDay={currentDay}
              detail={detail}
              key={milestone.key}
              lane={lane}
              milestone={milestone}
              onReviewMilestone={onReviewMilestone}
              projection={projection}
              viewerRole={viewerRole}
            />
          ))}
        </div>
      ) : (
        <p
          className="mt-4 border-border border-t pt-3 text-muted-foreground text-sm"
          data-testid={`${sectionTestId}-empty`}
        >
          {emptyMessage}
        </p>
      )}
    </FramePanel>
  );
}

function CurrentMilestoneHorizonItem({
  currentDay,
  detail,
  lane,
  milestone,
  onReviewMilestone,
  projection,
  viewerRole,
}: {
  currentDay: number;
  detail: ProductionBuildDetail;
  lane: CurrentMilestoneHorizonLane;
  milestone: ProductionMilestone;
  onReviewMilestone: (milestone: ProductionMilestone) => void;
  projection: ProductionBuildProjection;
  viewerRole: "builder" | "lender";
}) {
  const contractors = contractorAssignmentsForMilestone(detail, milestone.key);
  const submilestones =
    projection.submilestonesByMilestone.get(milestone.key) ?? [];
  const progressPercent = milestoneProgressPercent(milestone, submilestones);
  const isOperationallyActive = isCurrentActiveMilestone(milestone);
  const actionLabel =
    viewerRole === "lender"
      ? "Review milestone completion"
      : "Complete Milestone";
  const daysBehind = Math.max(0, currentDay - milestone.dayEnd);
  const itemTestId = isOperationallyActive
    ? `current-milestone-${milestone.key}`
    : `${lane}-milestone-${milestone.key}`;

  return (
    <article
      className="grid gap-3 border-border border-t pt-4 first:border-t-0 first:pt-0"
      data-schedule-lane={lane}
      data-testid={itemTestId}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h5 className="break-words font-semibold text-base">
              {milestone.name}
            </h5>
            <MilestoneHorizonStatusBadge
              daysBehind={daysBehind}
              lane={lane}
              milestone={milestone}
            />
          </div>
        </div>
        {isOperationallyActive ? (
          <Button
            className="shrink-0"
            data-testid={`current-milestone-review-${milestone.key}`}
            onClick={() => onReviewMilestone(milestone)}
            size="sm"
            type="button"
          >
            <CheckCircle2 aria-hidden="true" />
            {actionLabel}
          </Button>
        ) : null}
      </div>

      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        <OverviewMetric
          label="Budget"
          value={formatCents(milestone.budgetCents)}
        />
        <OverviewMetric
          label="Planned start"
          truncateValue={false}
          value={formatDate(
            addDaysSafe(detail.build.startDate, milestone.dayStart)
          )}
        />
        <OverviewMetric
          label="Planned end"
          truncateValue={false}
          value={formatDate(
            addDaysSafe(detail.build.startDate, milestone.dayEnd)
          )}
        />
        <OverviewMetric
          label="Draw unlock"
          value={formatCents(milestone.drawAvailabilityCents)}
        />
      </div>

      <MilestoneContractorList
        contractors={contractors}
        milestoneKey={milestone.key}
      />

      {milestone.reconciliationState === "warning" &&
      milestone.reconciliationIssues?.length ? (
        <div
          aria-live="polite"
          className="grid gap-1 text-amber-700 text-xs dark:text-amber-300"
          data-testid={`milestone-reconciliation-${milestone.key}`}
          role="status"
        >
          <span className="font-medium">Milestone data needs review</span>
          {milestone.reconciliationIssues.map((issue) => (
            <span key={issue.code}>{issue.message}</span>
          ))}
        </div>
      ) : null}

      {isOperationallyActive ? (
        <div>
          <div className="flex items-center justify-between gap-3 text-xs">
            <span className="text-muted-foreground">Progress</span>
            <span className="tabular-nums">{progressPercent}%</span>
          </div>
          <span
            aria-hidden="true"
            className="mt-1 block h-1.5 overflow-hidden rounded-full bg-muted"
          >
            <span
              className="block h-full bg-primary"
              style={{ width: `${progressPercent}%` }}
            />
          </span>
        </div>
      ) : null}
    </article>
  );
}

function MilestoneHorizonStatusBadge({
  daysBehind,
  lane,
  milestone,
}: {
  daysBehind: number;
  lane: CurrentMilestoneHorizonLane;
  milestone: ProductionMilestone;
}) {
  if (lane === "behind-schedule") {
    return (
      <>
        <Badge size="sm" variant="error">
          {daysBehind} day{daysBehind === 1 ? "" : "s"} behind
        </Badge>
        <Badge
          size="sm"
          variant={
            milestoneHasPendingCompletionClaim(milestone)
              ? "warning"
              : milestone.status === "in_progress"
                ? "info"
                : "outline"
          }
        >
          {milestoneHasPendingCompletionClaim(milestone)
            ? "Completion submitted"
            : milestone.status === "in_progress"
              ? "In progress"
              : "Not started"}
        </Badge>
      </>
    );
  }
  if (milestoneHasPendingCompletionClaim(milestone)) {
    return (
      <Badge size="sm" variant="warning">
        Completion submitted
      </Badge>
    );
  }
  return (
    <Badge size="sm" variant={lane === "current" ? "info" : "outline"}>
      {lane === "current" ? "In progress" : "Upcoming"}
    </Badge>
  );
}

function MilestoneContractorList({
  contractors,
  milestoneKey,
}: {
  contractors: ReturnType<typeof contractorAssignmentsForMilestone>;
  milestoneKey: string;
}) {
  return (
    <div>
      <p className="mb-2 text-muted-foreground text-xs uppercase">
        Assigned contractors
      </p>
      {contractors.length > 0 ? (
        <ul className="flex flex-wrap gap-x-5 gap-y-2">
          {contractors.map((contractor) => (
            <li
              className="flex min-w-0 items-center gap-2 text-sm"
              data-testid={`current-milestone-contractor-${milestoneKey}`}
              key={`${milestoneKey}-${contractor.name}-${contractor.role ?? ""}`}
            >
              <span className="grid size-7 shrink-0 place-items-center rounded-md bg-primary/15 font-semibold text-primary text-xs">
                {initialsFor(contractor.name)}
              </span>
              <span className="min-w-0">
                <span className="break-words font-medium">
                  {contractor.name}
                </span>
                {contractor.role ? (
                  <span className="ml-2 text-muted-foreground text-xs">
                    {contractor.role}
                  </span>
                ) : null}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-muted-foreground text-sm">
          No contractors assigned.
        </p>
      )}
    </div>
  );
}

function DrawOverviewPanel({
  actions,
  currentOverview,
  detail,
  projection,
  viewerRole,
}: {
  actions?: ProductionBuildDetailActions;
  currentOverview: CurrentBuildOverview;
  detail: ProductionBuildDetail;
  projection: ProductionBuildProjection;
  viewerRole: "builder" | "lender";
}) {
  const [pendingDrawAction, setPendingDrawAction] = useState<string | null>(
    null
  );
  const [drawActionError, setDrawActionError] = useState("");
  const canRequestDraw =
    Boolean(actions?.requestDraw) &&
    Boolean(currentOverview.upcomingDraw) &&
    isRequestableDrawStatus(currentOverview.upcomingDraw?.status) &&
    currentOverview.requestableAmountCents > 0 &&
    !pendingDrawAction;
  const inFlightDraws = projection.draws
    .filter(
      (draw) =>
        draw.status === "requested" ||
        draw.status === "in_review" ||
        draw.status === "ready_for_admin" ||
        draw.status === "approved_for_release"
    )
    .slice()
    .sort(compareDrawsMostRecentFirst);
  const approvalQueueDraws = inFlightDraws.filter(
    (draw) =>
      draw.status === "requested" ||
      draw.status === "in_review" ||
      draw.status === "ready_for_admin" ||
      draw.status === "approved_for_release"
  );
  const pastDraws = projection.draws
    .filter((draw) => draw.status === "released")
    .slice()
    .sort(compareDrawsMostRecentFirst);
  const scheduledDraws = projection.draws
    .filter((draw) => isRequestableDrawStatus(draw.status))
    .slice()
    .sort(compareDrawsScheduleFirst);
  const remainingFacilityCents = Math.max(
    0,
    currentOverview.totalApprovedCents - currentOverview.committedDrawCents
  );
  const runDrawAction = async (
    actionKey: string,
    draw: ProductionDraw,
    fn?: (draw: ProductionDraw) => Promise<unknown> | unknown
  ) => {
    if (!fn || pendingDrawAction) {
      return false;
    }
    setPendingDrawAction(`${actionKey}:${draw.drawKey}`);
    setDrawActionError("");
    try {
      await fn(draw);
      return true;
    } catch (cause) {
      setDrawActionError(
        cause instanceof Error ? cause.message : "Unable to update draw."
      );
      return false;
    } finally {
      setPendingDrawAction(null);
    }
  };
  const requestDrawNow = async () => {
    const requestDraw = actions?.requestDraw;
    const upcomingDraw = currentOverview.upcomingDraw;
    if (
      !(requestDraw && upcomingDraw) ||
      currentOverview.requestableAmountCents <= 0 ||
      pendingDrawAction
    ) {
      return;
    }
    await runDrawAction(
      "request",
      {
        ...upcomingDraw,
        amountCents: currentOverview.requestableAmountCents,
      },
      requestDraw
    );
  };

  return (
    <div className="grid gap-4" data-testid="draw-overview-panel">
      <section className="grid gap-3">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h3 className="font-semibold text-sm">Draw overview</h3>
            <p className="text-muted-foreground text-xs">
              Availability, requests, approvals, releases, and scheduled draws.
            </p>
          </div>
          {currentOverview.upcomingDraw ? (
            <StatusChip status={currentOverview.upcomingDraw.status} />
          ) : null}
        </div>

        <div className="grid gap-2 sm:grid-cols-3">
          <OverviewMetric
            label="Available now"
            testId="draw-overview-availability"
            value={formatCents(currentOverview.currentAvailabilityCents)}
          />
          <OverviewMetric
            label="Total approved"
            testId="draw-overview-total-approved"
            value={formatCents(currentOverview.totalApprovedCents)}
          />
          <OverviewMetric
            label="Committed draws"
            testId="draw-overview-committed-draws"
            value={formatCents(currentOverview.committedDrawCents)}
          />
          <OverviewMetric
            label="Drawn to date"
            testId="draw-overview-drawn-to-date"
            value={formatCents(currentOverview.drawnCents)}
          />
          <OverviewMetric
            label="Remaining facility"
            testId="draw-overview-remaining-facility"
            value={formatCents(remainingFacilityCents)}
          />
          <OverviewMetric
            label="Requestable now"
            testId="draw-overview-requestable-now"
            value={formatCents(currentOverview.requestableAmountCents)}
          />
        </div>
      </section>

      {viewerRole === "builder" ? (
        <section className="grid gap-3 border-border border-t pt-4">
          {currentOverview.upcomingDraw ? (
            <div
              className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto]"
              data-testid="draw-overview-upcoming-draw"
            >
              <div className="min-w-0">
                <p className="text-muted-foreground text-xs uppercase">
                  Upcoming draw
                </p>
                <p className="break-words font-medium text-sm">
                  {currentOverview.upcomingDraw.label}
                </p>
                <p className="mt-1 text-muted-foreground text-xs">
                  Planned{" "}
                  {formatDate(
                    addDaysSafe(
                      detail.build.startDate,
                      currentOverview.upcomingDraw.timingDay
                    )
                  )}{" "}
                  · planned amount{" "}
                  {formatCents(currentOverview.upcomingDraw.amountCents)}
                </p>
                <p className="mt-1 text-muted-foreground text-xs">
                  Requestable now:{" "}
                  {formatCents(currentOverview.requestableAmountCents)}
                </p>
              </div>
              <Button
                className="self-start"
                data-testid="draw-overview-request-now"
                disabled={!canRequestDraw}
                loading={pendingDrawAction?.startsWith("request:") ?? false}
                onClick={requestDrawNow}
                size="sm"
                type="button"
              >
                Request draw now
              </Button>
            </div>
          ) : (
            <p className="text-muted-foreground text-sm">
              No upcoming draw remains.
            </p>
          )}
        </section>
      ) : (
        <section
          className="grid gap-3 border-border border-t pt-4"
          data-testid="draw-overview-approval-queue"
        >
          <div>
            <h3 className="font-semibold text-sm">Draw approval queue</h3>
            <p className="text-muted-foreground text-xs">
              Review requested reimbursements, reject missing support, and
              release approved funds.
            </p>
          </div>
          {approvalQueueDraws.length > 0 ? (
            <div className="grid gap-2">
              {approvalQueueDraws.map((draw) => (
                <DrawSummaryItem
                  actions={actions}
                  detail={detail}
                  draw={draw}
                  key={draw.drawKey}
                  onRunAction={runDrawAction}
                  pendingActionKey={pendingDrawAction}
                  viewerRole={viewerRole}
                />
              ))}
            </div>
          ) : (
            <p className="rounded-md border border-dashed p-3 text-muted-foreground text-sm">
              No draw requests are waiting for lender action.
            </p>
          )}
        </section>
      )}

      {drawActionError ? (
        <p className="text-destructive text-xs" role="alert">
          {drawActionError}
        </p>
      ) : null}

      <DrawSummaryList
        detail={detail}
        draws={inFlightDraws}
        emptyLabel="No draw requests are currently awaiting approval or release."
        testId="draw-overview-in-flight-draws"
        title="In-flight draws"
      />
      <DrawSummaryList
        detail={detail}
        draws={pastDraws}
        emptyLabel="No released draws yet."
        testId="draw-overview-past-draws"
        title="Past draws"
      />
      <DrawSummaryList
        detail={detail}
        draws={scheduledDraws}
        emptyLabel="No scheduled draws remain."
        testId="draw-overview-scheduled-draws"
        title="Upcoming schedule"
      />
    </div>
  );
}

function DrawSummaryList({
  actions,
  detail,
  draws,
  emptyLabel,
  onRunAction,
  pendingActionKey,
  testId,
  title,
  viewerRole,
}: {
  actions?: ProductionBuildDetailActions;
  detail: ProductionBuildDetail;
  draws: ProductionDraw[];
  emptyLabel: string;
  onRunAction?: (
    actionKey: string,
    draw: ProductionDraw,
    fn?: (draw: ProductionDraw) => Promise<unknown> | unknown
  ) => Promise<boolean>;
  pendingActionKey?: string | null;
  testId: string;
  title: string;
  viewerRole?: "builder" | "lender";
}) {
  return (
    <section
      className="grid gap-3 border-border border-t pt-4"
      data-testid={testId}
    >
      <div>
        <h3 className="font-semibold text-sm">{title}</h3>
        <p className="text-muted-foreground text-xs">
          {draws.length} draw{draws.length === 1 ? "" : "s"}
        </p>
      </div>
      {draws.length > 0 ? (
        <div className="grid gap-2">
          {draws.map((draw) => (
            <DrawSummaryItem
              actions={actions}
              detail={detail}
              draw={draw}
              key={draw.drawKey}
              onRunAction={onRunAction}
              pendingActionKey={pendingActionKey}
              viewerRole={viewerRole}
            />
          ))}
        </div>
      ) : (
        <p className="rounded-md border border-dashed p-3 text-muted-foreground text-sm">
          {emptyLabel}
        </p>
      )}
    </section>
  );
}

function DrawSummaryItem({
  actions,
  actionTestIdPrefix = "draw-overview",
  detail,
  draw,
  onRunAction,
  pendingActionKey,
  viewerRole,
}: {
  actions?: ProductionBuildDetailActions;
  actionTestIdPrefix?: string;
  detail: ProductionBuildDetail;
  draw: ProductionDraw;
  onRunAction?: (
    actionKey: string,
    draw: ProductionDraw,
    fn?: (draw: ProductionDraw) => Promise<unknown> | unknown
  ) => Promise<boolean>;
  pendingActionKey?: string | null;
  viewerRole?: "builder" | "lender";
}) {
  const milestoneName =
    draw.milestoneKey === undefined
      ? null
      : (detail.milestones.find(
          (milestone) => milestone.key === draw.milestoneKey
        )?.name ?? null);
  const plannedDate = addDaysSafe(detail.build.startDate, draw.timingDay);
  const releasedAt = draw.releasedAt ?? draw.releaseDate;

  return (
    <div
      className="grid gap-2 rounded-md border bg-background/60 p-3 sm:grid-cols-[minmax(0,1fr)_auto]"
      data-collaboration-focus={`draw:${draw._id}`}
      data-testid={`${actionTestIdPrefix}-draw-${draw.drawKey}`}
    >
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <p className="break-words font-medium text-sm">{draw.label}</p>
          <StatusChip status={draw.status} />
        </div>
        <p className="mt-1 text-muted-foreground text-xs">
          {milestoneName ? `${milestoneName} · ` : ""}
          Planned {formatDate(plannedDate)}
        </p>
        <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-muted-foreground text-xs">
          {draw.requestedAt ? (
            <span>Requested {formatDate(draw.requestedAt)}</span>
          ) : null}
          {draw.reviewedAt ? (
            <span>Reviewed {formatDate(draw.reviewedAt)}</span>
          ) : null}
          {releasedAt ? <span>Released {formatDate(releasedAt)}</span> : null}
        </div>
        {draw.requestNote ? (
          <p className="mt-2 text-muted-foreground text-xs">
            {draw.requestNote}
          </p>
        ) : null}
      </div>
      <div className="grid gap-2 text-left sm:justify-items-end sm:text-right">
        <p className="text-muted-foreground text-xs uppercase">Amount</p>
        <p className="font-semibold text-sm tabular-nums">
          {formatCents(draw.amountCents)}
        </p>
        {viewerRole === "lender" && onRunAction ? (
          <DrawActionGroup
            actions={actions}
            actionTestIdPrefix={actionTestIdPrefix}
            buildLabel={detail.build.buildName}
            draw={draw}
            onRunAction={onRunAction}
            pendingActionKey={pendingActionKey}
          />
        ) : null}
      </div>
    </div>
  );
}

function DrawActionGroup({
  actions,
  actionTestIdPrefix = "draw-overview",
  buildLabel,
  draw,
  onRunAction,
  pendingActionKey,
}: {
  actions?: ProductionBuildDetailActions;
  actionTestIdPrefix?: string;
  buildLabel: string;
  draw: ProductionDraw;
  onRunAction: (
    actionKey: string,
    draw: ProductionDraw,
    fn?: (draw: ProductionDraw) => Promise<unknown> | unknown
  ) => Promise<boolean>;
  pendingActionKey?: string | null;
}) {
  const isPending = (actionKey: string) =>
    pendingActionKey === `${actionKey}:${draw.drawKey}`;

  if (draw.status === "requested") {
    return (
      <DrawActionButton
        disabled={!actions?.startDrawReview || Boolean(pendingActionKey)}
        label={isPending("start") ? "Starting..." : "Start review"}
        onClick={() => onRunAction("start", draw, actions?.startDrawReview)}
        testId={`draw-overview-start-${draw.drawKey}`}
      />
    );
  }

  if (draw.status === "in_review") {
    return (
      <DrawActionButton
        disabled={!actions?.submitDrawForAdmin || Boolean(pendingActionKey)}
        label={isPending("submit") ? "Sending..." : "Send to admin"}
        onClick={() => onRunAction("submit", draw, actions?.submitDrawForAdmin)}
        testId={`draw-overview-submit-${draw.drawKey}`}
      />
    );
  }

  if (draw.status === "ready_for_admin") {
    return (
      <div className="flex flex-wrap gap-1 sm:justify-end">
        <DrawActionButton
          disabled={!actions?.approveDraw || Boolean(pendingActionKey)}
          label={isPending("approve") ? "Approving..." : "Approve for release"}
          onClick={() => onRunAction("approve", draw, actions?.approveDraw)}
          testId={`${actionTestIdPrefix}-approve-${draw.drawKey}`}
        />
        <DrawRejectionDialog
          amountCents={draw.amountCents}
          buildLabel={buildLabel}
          disabled={!actions?.rejectDraw || Boolean(pendingActionKey)}
          loading={isPending("reject")}
          onReject={(reason) =>
            onRunAction("reject", draw, (targetDraw) =>
              actions?.rejectDraw?.({ draw: targetDraw, reason })
            )
          }
          requestKey={draw.drawKey}
          requestLabel={draw.label}
          triggerTestId={`${actionTestIdPrefix}-reject-${draw.drawKey}`}
        />
      </div>
    );
  }

  if (draw.status === "approved_for_release") {
    return (
      <DrawActionButton
        disabled={!actions?.releaseDraw || Boolean(pendingActionKey)}
        label={isPending("release") ? "Releasing..." : "Release"}
        onClick={() => onRunAction("release", draw, actions?.releaseDraw)}
        testId={`${actionTestIdPrefix}-release-${draw.drawKey}`}
      />
    );
  }

  return null;
}

function BuildMetadataPanel({
  detail,
  openWarnings,
  projection,
  siteVisitsOpen,
}: {
  detail: ProductionBuildDetail;
  openWarnings: number;
  projection: ProductionBuildProjection;
  siteVisitsOpen: number;
}) {
  const percentComplete = buildPercentComplete(projection.milestones);
  return (
    <div data-testid="build-overview-build-panel">
      <h3 className="mb-3 font-semibold text-sm">Build Details</h3>
      <dl className="grid grid-cols-[minmax(0,1fr)] gap-y-1.5 text-sm sm:grid-cols-[120px_minmax(0,1fr)]">
        <Label>Loan number</Label>
        <dd className="min-w-0 break-words tabular-nums">
          FL-{detail.displayId ?? detail.build._id}
        </dd>
        <Label>Address</Label>
        <dd className="min-w-0 break-words">{detail.build.location}</dd>
        <Label>Latitude</Label>
        <dd className="min-w-0 break-words tabular-nums">
          {formatCoordinate(detail.build.locationLatitude)}
        </dd>
        <Label>Longitude</Label>
        <dd className="min-w-0 break-words tabular-nums">
          {formatCoordinate(detail.build.locationLongitude)}
        </dd>
        <Label>Project start</Label>
        <dd className="min-w-0 break-words">
          {formatDate(detail.build.startDate)}
        </dd>
        <Label>Roadmap end</Label>
        <dd className="min-w-0 break-words">
          {formatDate(addDaysSafe(detail.build.startDate, projection.maxDay))}
        </dd>
        <Label>% complete</Label>
        <dd className="flex min-w-0 items-center gap-2">
          <span className="tabular-nums">{percentComplete}%</span>
          <span
            aria-hidden="true"
            className="h-1.5 min-w-16 flex-1 overflow-hidden rounded-full bg-muted sm:w-24 sm:flex-none"
          >
            <span
              className="block h-full bg-primary"
              style={{ width: `${Math.min(100, percentComplete)}%` }}
            />
          </span>
        </dd>
        <Label>Open warnings</Label>
        <dd className={openWarnings > 0 ? "text-amber-400" : undefined}>
          {openWarnings}
        </dd>
        <Label>Site visits open</Label>
        <dd>{siteVisitsOpen}</dd>
      </dl>
    </div>
  );
}

function LoanMetadataPanel({
  currentOverview,
  detail,
  projection,
}: {
  currentOverview: CurrentBuildOverview;
  detail: ProductionBuildDetail;
  projection: ProductionBuildProjection;
}) {
  return (
    <div data-testid="build-overview-loan-panel">
      <h3 className="mb-3 font-semibold text-sm">Loan Details</h3>
      <dl className="grid grid-cols-[minmax(0,1fr)] gap-y-1.5 text-sm sm:grid-cols-[120px_1fr]">
        <Label>Borrower starting cash</Label>
        <span className="min-w-0 break-words">
          {formatCents(detail.capitalPlan?.borrowerStartingCashCents ?? 0)}
        </span>
        <Label>Lender policy limit</Label>
        <span className="min-w-0 break-words">
          {formatCents(detail.capitalPlan?.lenderDrawPolicyLimitCents ?? 0)}
        </span>
        <Label>Approved principal</Label>
        <span className="min-w-0 break-words">
          {formatCents(detail.loanFacility?.principalCents ?? 0)}
        </span>
        <Label>Payback date</Label>
        <span className="min-w-0 break-words">
          {detail.loanFacility?.paybackDate
            ? formatDate(detail.loanFacility.paybackDate)
            : formatDate(
                addDaysSafe(detail.build.startDate, projection.maxDay)
              )}
        </span>
        <Label>Draw availability</Label>
        <span className="min-w-0 break-words">
          {formatCents(currentOverview.currentAvailabilityCents)} of{" "}
          {formatCents(currentOverview.totalApprovedCents)}
        </span>
        <Label>Drawn to date</Label>
        <span className="min-w-0 break-words">
          {formatCents(currentOverview.drawnCents)}
        </span>
        <Label>Interest (annual)</Label>
        <span className="tabular-nums">
          {((detail.loanFacility?.interestAnnualBps ?? 0) / 100).toFixed(2)}%
        </span>
        <Label>Interest starts</Label>
        <span>Funds released</span>
      </dl>
    </div>
  );
}

function OverviewMetric({
  label,
  testId,
  truncateValue = true,
  value,
}: {
  label: string;
  testId?: string;
  truncateValue?: boolean;
  value: string;
}) {
  return (
    <div
      className="min-w-0 rounded-md bg-muted/50 px-3 py-2"
      data-testid={testId}
    >
      <p className="text-muted-foreground text-xs uppercase">{label}</p>
      <p
        className={cn(
          "break-words font-semibold text-sm tabular-nums",
          truncateValue && "truncate"
        )}
      >
        {value}
      </p>
    </div>
  );
}

function MilestoneCompletionReviewSheet({
  actions,
  detail,
  focusedSubmilestoneId,
  milestone,
  onAmendStart,
  onOpenChange,
  onRequestSiteVisit,
  open,
  projection,
}: {
  actions?: ProductionBuildDetailActions;
  detail: ProductionBuildDetail;
  focusedSubmilestoneId?: string;
  milestone: ProductionMilestone;
  onAmendStart?: (action: "correct" | "retract") => void;
  onOpenChange: (open: boolean) => void;
  onRequestSiteVisit: (request: SiteVisitOrderRequest) => void;
  open: boolean;
  projection: ProductionBuildProjection;
}) {
  const [note, setNote] = useState("");
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [actionSuccess, setActionSuccess] = useState("");
  const [locallyCancelledVisitIds, setLocallyCancelledVisitIds] = useState<
    Set<string>
  >(() => new Set());
  const builderRows = useMemo(
    () =>
      buildBuilderEvidenceRows(detail, projection).filter(
        (row) => row.milestoneKey === milestone.key
      ),
    [detail, milestone.key, projection]
  );
  const siteVisitRows = useMemo(
    () =>
      buildCompletedSiteVisitRows(detail, projection).filter(
        (row) => row.milestoneKey === milestone.key
      ),
    [detail, milestone.key, projection]
  );
  const siteVisits = useMemo(
    () =>
      siteVisitsForMilestone(detail, milestone).filter(
        (visit) => !locallyCancelledVisitIds.has(siteVisitIdentity(visit))
      ),
    [detail, locallyCancelledVisitIds, milestone]
  );
  const latestVisit = siteVisits[0] ?? null;
  const scopeRows = useMemo(
    () =>
      detail.submilestones
        .filter((row) => row.milestoneKey === milestone.key)
        .sort((a, b) => a.order - b.order),
    [detail.submilestones, milestone.key]
  );
  const contractorRows = useMemo(
    () => contractorAssignmentsForMilestone(detail, milestone.key),
    [detail, milestone.key]
  );
  const materialRows = useMemo(
    () =>
      (detail.costItems ?? []).filter(
        (item) => item.milestoneKey === milestone.key
      ),
    [detail.costItems, milestone.key]
  );
  const completedScopeCount = scopeRows.filter(
    (row) => row.status === "complete"
  ).length;
  const milestoneApproved = isMilestoneApprovedForDrawAvailability(milestone);
  const builderEvidenceAccepted =
    builderRows.length > 0 &&
    builderRows.every((row) => evidenceStatusIsAccepted(row.status));
  const approvalExceptions = [
    ...(scopeRows.length > 0 && completedScopeCount < scopeRows.length
      ? [
          `${completedScopeCount}/${scopeRows.length} scope items are marked complete.`,
        ]
      : []),
    ...(builderRows.length === 0
      ? ["No builder evidence package is attached."]
      : []),
    ...(builderRows.some((row) => row.locationState === "unverified")
      ? ["Builder evidence location is unverified."]
      : []),
    ...(latestVisit &&
    latestVisit.status !== "complete" &&
    latestVisit.status !== "cancelled"
      ? [
          siteVisitTokenStateLabel(latestVisit) === "Expired"
            ? "The site visit token expired before a report was completed."
            : "The ordered site visit does not have a completed report.",
        ]
      : []),
  ];
  const decisionNote = note.trim();
  const approvalNoteRequired = approvalExceptions.length > 0;
  const claimSubmittedAt = stringFromRecord(
    milestone.completionClaim,
    "submittedAt"
  );
  const completedDay = numberFromRecord(
    milestone.completionClaim,
    "completedDay"
  );
  const completionDate =
    completedDay === undefined
      ? undefined
      : addDaysSafe(detail.build.startDate, completedDay);
  const claimNote = stringFromRecord(milestone.completionClaim, "note");

  useEffect(() => {
    if (!open) {
      return;
    }
    setNote("");
    setPendingAction(null);
    setError("");
    setActionSuccess("");
  }, [milestone.key, open]);

  useEffect(() => {
    setLocallyCancelledVisitIds(new Set());
  }, [milestone.key]);

  async function runReviewAction(
    actionKey: string,
    fallbackError: string,
    action: () => Promise<unknown> | unknown
  ) {
    if (pendingAction) {
      return false;
    }
    setPendingAction(actionKey);
    setError("");
    setActionSuccess("");
    try {
      await action();
      setActionSuccess(
        actionKey === "approve-completion"
          ? "Milestone completion approved. Close this review to return to the updated board."
          : actionKey === "approve-evidence"
            ? "Builder evidence approved."
            : actionKey === "request-info"
              ? "More information requested from the builder."
              : ""
      );
      return true;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : fallbackError);
      return false;
    } finally {
      setPendingAction(null);
    }
  }

  const approveCompletion = () => {
    if (approvalNoteRequired && !decisionNote) {
      setError("A decision rationale is required to approve with exceptions.");
      return Promise.resolve(false);
    }
    return runReviewAction(
      "approve-completion",
      "Unable to approve milestone completion.",
      () =>
        actions?.approveMilestone?.({
          milestoneKey: milestone.key,
          note: decisionNote || "Approved from milestone completion review.",
        })
    );
  };
  const requestInfo = () => {
    if (!decisionNote) {
      setError("Describe what the builder must clarify.");
      return Promise.resolve(false);
    }
    return runReviewAction(
      "request-info",
      "Unable to request more information.",
      () =>
        actions?.requestMilestoneInfo
          ? actions.requestMilestoneInfo({
              milestoneKey: milestone.key,
              note: decisionNote,
            })
          : actions?.reviewEvidence?.({
              accepted: false,
              milestoneKey: milestone.key,
              note: decisionNote,
            })
    );
  };
  const approveBuilderEvidence = () =>
    runReviewAction(
      "approve-evidence",
      "Unable to approve builder evidence.",
      () =>
        actions?.reviewEvidence?.({
          accepted: true,
          milestoneKey: milestone.key,
          note:
            note.trim() ||
            "Builder evidence approved from milestone completion review.",
        })
    );
  const regenerateSiteVisitToken = () =>
    runReviewAction(
      "regenerate-site-visit-token",
      "Unable to regenerate site visit token.",
      () => actions?.assignSiteVisit?.({ milestoneKey: milestone.key })
    );
  const cancelSiteVisit = async (visit: ProductionSiteVisit) => {
    const cancelled = await runReviewAction(
      "cancel-site-visit",
      "Unable to cancel site visit.",
      () =>
        actions?.cancelSiteVisit?.({
          reason: note.trim() || "Cancelled from milestone completion review.",
          visitId: visit.visitId,
        })
    );
    if (cancelled) {
      setLocallyCancelledVisitIds((current) => {
        const next = new Set(current);
        next.add(siteVisitIdentity(visit));
        return next;
      });
    }
  };

  return (
    <Sheet onOpenChange={onOpenChange} open={open}>
      <SheetPopup className="sm:max-w-4xl" side="right" variant="inset">
        <SheetHeader>
          <SheetTitle>Review milestone completion</SheetTitle>
          <SheetDescription>
            Reconcile the builder claim, assigned scope, evidence, and field
            verification before releasing {milestone.name} funding.
          </SheetDescription>
        </SheetHeader>

        <SheetPanel className="flex flex-col gap-4">
          <Card
            className="rounded-xl shadow-none"
            data-testid="milestone-completion-review-summary"
            render={<section />}
          >
            <CardHeader className="gap-1 p-4 pb-3">
              <p className="text-muted-foreground text-xs uppercase tracking-wide">
                Builder completion claim
              </p>
              <CardTitle className="text-lg">{milestone.name}</CardTitle>
              <CardDescription className="text-xs">
                {claimNote ??
                  "No builder note was supplied with this completion claim."}
              </CardDescription>
              <CardAction>
                <Badge
                  variant={
                    milestoneHasPendingCompletionClaim(milestone)
                      ? "warning"
                      : "info"
                  }
                >
                  {milestoneHasPendingCompletionClaim(milestone)
                    ? "Completion submitted"
                    : "In progress"}
                </Badge>
              </CardAction>
            </CardHeader>
            <CardPanel className="px-4 pt-0 pb-4">
              <dl className="grid divide-y border-y text-sm sm:grid-cols-3 sm:divide-x sm:divide-y-0">
                <ReviewFact
                  label="Submitted"
                  value={claimSubmittedAt ? formatDate(claimSubmittedAt) : "-"}
                />
                <ReviewFact
                  label="Completed"
                  value={completionDate ? formatDate(completionDate) : "-"}
                />
                <ReviewFact
                  label="Draw unlock"
                  value={formatCentsExact(milestone.drawAvailabilityCents)}
                />
              </dl>
              <div className="mt-3 flex flex-wrap gap-2">
                <Badge
                  variant={
                    completedScopeCount === scopeRows.length
                      ? "success"
                      : "warning"
                  }
                >
                  {completedScopeCount}/{scopeRows.length} scope items complete
                </Badge>
                <Badge variant={builderRows.length > 0 ? "info" : "error"}>
                  {builderRows.length} evidence{" "}
                  {builderRows.length === 1 ? "package" : "packages"}
                </Badge>
                <Badge
                  variant={
                    latestVisit?.status === "complete" ? "success" : "secondary"
                  }
                >
                  {latestVisit
                    ? siteVisitStateLabel(latestVisit)
                    : "No field review"}
                </Badge>
              </div>
            </CardPanel>
          </Card>

          <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1.25fr)_minmax(18rem,0.75fr)]">
            <div className="grid gap-4">
              <Card
                className="rounded-xl shadow-none"
                data-testid="milestone-review-scope"
                render={<section />}
              >
                <CardHeader className="p-4 pb-3">
                  <CardTitle className="text-sm">Claimed scope</CardTitle>
                  <CardDescription className="text-xs">
                    Submilestones the builder says are complete for this unlock.
                  </CardDescription>
                  <CardAction>
                    <Badge
                      variant={
                        completedScopeCount === scopeRows.length
                          ? "success"
                          : "warning"
                      }
                    >
                      {completedScopeCount}/{scopeRows.length}
                    </Badge>
                  </CardAction>
                </CardHeader>
                <CardPanel className="px-4 pt-0 pb-4">
                  {scopeRows.length > 0 ? (
                    <ul className="divide-y border-y">
                      {scopeRows.map((row) => (
                        <li
                          className="flex items-center justify-between gap-3 py-2.5"
                          data-collaboration-focus={`submilestone:${row._id}`}
                          data-collaboration-focused={
                            row._id === focusedSubmilestoneId
                              ? "true"
                              : undefined
                          }
                          key={row.key}
                        >
                          <div className="min-w-0">
                            <p className="truncate font-medium text-sm">
                              {row.name}
                            </p>
                            <p className="text-muted-foreground text-xs">
                              {row.budgetCents
                                ? formatCentsExact(row.budgetCents)
                                : "No separate budget"}
                            </p>
                          </div>
                          <Badge
                            variant={
                              row.status === "complete"
                                ? "success"
                                : row.status === "in_progress"
                                  ? "warning"
                                  : "secondary"
                            }
                          >
                            {submilestoneReviewStatus(row.status)}
                          </Badge>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="border-y py-3 text-muted-foreground text-sm">
                      No submilestones are attached to this milestone.
                    </p>
                  )}
                </CardPanel>
              </Card>

              <Card
                className="rounded-xl shadow-none"
                data-testid="milestone-completion-builder-evidence"
                render={<section />}
              >
                <CardHeader className="p-4 pb-3">
                  <CardTitle className="text-sm">
                    Builder submitted evidence
                  </CardTitle>
                  <CardDescription className="text-xs">
                    Verify the claimed work, location, and file dates before
                    approval.
                  </CardDescription>
                  <CardAction>
                    <Badge variant={builderRows.length > 0 ? "info" : "error"}>
                      {builderRows.length}{" "}
                      {builderRows.length === 1 ? "package" : "packages"}
                    </Badge>
                  </CardAction>
                </CardHeader>
                <CardPanel className="grid gap-3 px-4 pt-0 pb-3">
                  {builderRows.length > 0 ? (
                    builderRows.map((row) => (
                      <div
                        className="border-t pt-3 first:border-t-0 first:pt-0"
                        data-testid={`milestone-review-builder-evidence-${row.id}`}
                        key={row.id}
                      >
                        <EvidenceReviewSummary row={row} />
                        <EvidenceAssetPackage row={row} />
                      </div>
                    ))
                  ) : (
                    <p className="border-y py-3 text-muted-foreground text-sm">
                      No builder evidence files are attached to this completion
                      request.
                    </p>
                  )}
                </CardPanel>
                {builderRows.length > 0 ? (
                  <CardFooter className="border-t px-4 py-2.5">
                    {builderEvidenceAccepted ? (
                      <Badge variant="success">
                        <CheckCircle2 aria-hidden="true" />
                        Evidence approved
                      </Badge>
                    ) : (
                      <Button
                        disabled={
                          !actions?.reviewEvidence || pendingAction !== null
                        }
                        loading={pendingAction === "approve-evidence"}
                        onClick={() => approveBuilderEvidence()}
                        size="sm"
                        type="button"
                        variant="outline"
                      >
                        <FileCheck2 aria-hidden="true" />
                        Approve evidence
                      </Button>
                    )}
                  </CardFooter>
                ) : null}
              </Card>
            </div>

            <div className="grid gap-4">
              <Card
                className="rounded-xl shadow-none"
                data-testid="milestone-review-contractors"
                render={<section />}
              >
                <CardHeader className="p-4 pb-3">
                  <CardTitle className="text-sm">Responsible parties</CardTitle>
                  <CardDescription className="text-xs">
                    Contractors assigned to deliver or verify this scope.
                  </CardDescription>
                </CardHeader>
                <CardPanel className="px-4 pt-0 pb-4">
                  {contractorRows.length > 0 ? (
                    <ul className="divide-y border-y">
                      {contractorRows.map((row) => (
                        <li className="py-2.5" key={`${row.name}-${row.role}`}>
                          <p className="font-medium text-sm">{row.name}</p>
                          <p className="text-muted-foreground text-xs">
                            {row.role}
                          </p>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="border-y py-3 text-muted-foreground text-sm">
                      No contractors assigned.
                    </p>
                  )}
                </CardPanel>
              </Card>

              <Card
                className="rounded-xl shadow-none"
                data-testid="milestone-review-materials"
                render={<section />}
              >
                <CardHeader className="p-4 pb-3">
                  <CardTitle className="text-sm">
                    Materials and equipment
                  </CardTitle>
                  <CardDescription className="text-xs">
                    Cost items attached to this milestone and its submilestones.
                  </CardDescription>
                </CardHeader>
                <CardPanel className="px-4 pt-0 pb-4">
                  {materialRows.length > 0 ? (
                    <ul className="divide-y border-y">
                      {materialRows.map((item) => (
                        <li
                          className="flex items-start justify-between gap-3 py-2.5"
                          key={item._id}
                        >
                          <div className="min-w-0">
                            <p className="font-medium text-sm">{item.title}</p>
                            <p className="text-muted-foreground text-xs">
                              {item.supplier ?? "Supplier not recorded"}
                            </p>
                          </div>
                          <p className="shrink-0 font-medium text-sm tabular-nums">
                            {formatCentsExact(materialPlanningItemTotal(item))}
                          </p>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="border-y py-3 text-muted-foreground text-sm">
                      No materials or equipment attached.
                    </p>
                  )}
                </CardPanel>
              </Card>

              <Card
                className="rounded-xl shadow-none"
                data-testid="milestone-completion-site-visit"
                render={<section />}
              >
                <CardHeader className="p-4 pb-3">
                  <CardTitle className="text-sm">Site visit</CardTitle>
                  <CardDescription className="text-xs">
                    Order a site visit or review the completed field report.
                  </CardDescription>
                  {latestVisit ? (
                    <CardAction>
                      <Badge variant={siteVisitBadgeVariant(latestVisit)}>
                        {siteVisitStateLabel(latestVisit)}
                      </Badge>
                    </CardAction>
                  ) : null}
                </CardHeader>
                <CardPanel className="px-4 pt-0 pb-3">
                  {latestVisit ? (
                    <SiteVisitReviewState
                      canCancel={Boolean(actions?.cancelSiteVisit)}
                      canRegenerate={Boolean(actions?.assignSiteVisit)}
                      onCancel={() => cancelSiteVisit(latestVisit)}
                      onRegenerate={regenerateSiteVisitToken}
                      pendingAction={pendingAction}
                      visit={latestVisit}
                    />
                  ) : (
                    <p className="border-y py-3 text-muted-foreground text-sm">
                      No site visit has been ordered for this milestone.
                    </p>
                  )}
                  {latestVisit?.status === "complete" ? (
                    <CompletedSiteVisitReview
                      rows={siteVisitRows}
                      visit={latestVisit}
                    />
                  ) : null}
                </CardPanel>
                {latestVisit?.status !== "requested" &&
                latestVisit?.status !== "complete" ? (
                  <CardFooter className="border-t px-4 py-2.5">
                    <Button
                      disabled={
                        !actions?.assignSiteVisit || pendingAction !== null
                      }
                      onClick={() => {
                        onRequestSiteVisit({
                          milestoneKey: milestone.key,
                          ...(note.trim() ? { note: note.trim() } : {}),
                        });
                      }}
                      size="sm"
                      type="button"
                    >
                      <ClipboardCheck aria-hidden="true" />
                      Order site visit
                    </Button>
                  </CardFooter>
                ) : null}
              </Card>
            </div>
          </div>

          <Card className="rounded-xl shadow-none" render={<section />}>
            <CardHeader className="p-4 pb-3">
              <CardTitle className="text-sm">Reviewer decision</CardTitle>
              <CardDescription className="text-xs">
                Record the rationale that will accompany approval or a request
                for more information.
              </CardDescription>
            </CardHeader>
            <CardPanel className="px-4 pt-0 pb-4">
              <label
                className="mb-2 block font-medium text-sm"
                htmlFor="milestone-completion-review-note"
              >
                Decision rationale
                {approvalNoteRequired && !milestoneApproved ? (
                  <span className="text-destructive"> (required)</span>
                ) : null}
              </label>
              {approvalExceptions.length > 0 && !milestoneApproved ? (
                <div
                  className="mb-3 rounded-lg border border-warning/30 bg-warning/8 p-3"
                  data-testid="milestone-review-exceptions"
                >
                  <div className="flex items-center gap-2 font-medium text-sm">
                    <AlertTriangle
                      aria-hidden="true"
                      className="size-4 text-warning"
                    />
                    Approval requires an override rationale
                  </div>
                  <ul className="mt-2 list-disc space-y-1 pl-5 text-muted-foreground text-xs">
                    {approvalExceptions.map((exception) => (
                      <li key={exception}>{exception}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
              <Textarea
                disabled={milestoneApproved || pendingAction !== null}
                id="milestone-completion-review-note"
                onChange={(event) => setNote(event.currentTarget.value)}
                placeholder="State what was verified, or what the builder must clarify."
                value={note}
              />
              {error ? (
                <p className="mt-2 text-destructive text-sm" role="alert">
                  {error}
                </p>
              ) : null}
              {actionSuccess ? (
                <p
                  className="mt-2 flex items-center gap-2 text-sm text-success"
                  role="status"
                >
                  <CheckCircle2 aria-hidden="true" className="size-4" />
                  {actionSuccess}
                </p>
              ) : null}
            </CardPanel>
          </Card>
        </SheetPanel>

        <SheetFooter>
          <SheetClose render={<Button type="button" variant="ghost" />}>
            Close
          </SheetClose>
          {milestone.actualStartedAt && onAmendStart ? (
            <>
              <Button
                onClick={() => onAmendStart("correct")}
                type="button"
                variant="outline"
              >
                Correct start
              </Button>
              <Button
                onClick={() => onAmendStart("retract")}
                type="button"
                variant="ghost"
              >
                Retract start
              </Button>
            </>
          ) : null}
          {milestoneApproved ? (
            <Badge variant="success">
              <CheckCircle2 aria-hidden="true" />
              Completion approved
            </Badge>
          ) : (
            <>
              <Button
                disabled={
                  !(actions?.requestMilestoneInfo || actions?.reviewEvidence) ||
                  pendingAction !== null ||
                  !decisionNote
                }
                loading={pendingAction === "request-info"}
                onClick={() => {
                  requestInfo();
                }}
                type="button"
                variant="outline"
              >
                <MessageSquare aria-hidden="true" />
                Request more info
              </Button>
              <Button
                disabled={
                  !actions?.approveMilestone ||
                  pendingAction !== null ||
                  (approvalNoteRequired && !decisionNote)
                }
                loading={pendingAction === "approve-completion"}
                onClick={() => {
                  approveCompletion();
                }}
                type="button"
              >
                <CheckCircle2 aria-hidden="true" />
                Approve completion
              </Button>
            </>
          )}
        </SheetFooter>
      </SheetPopup>
    </Sheet>
  );
}

function ReviewFact({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 px-3 py-2.5 first:pl-0 last:pr-0 sm:last:pr-3 sm:first:pl-3">
      <dt className="text-muted-foreground text-xs uppercase">{label}</dt>
      <dd className="truncate font-medium tabular-nums">{value}</dd>
    </div>
  );
}

function submilestoneReviewStatus(status: ProductionMilestoneStatus) {
  if (status === "complete") {
    return "Complete";
  }
  if (status === "in_progress") {
    return "In progress";
  }
  return "Not started";
}

function materialPlanningItemTotal(item: MaterialPlanningItem) {
  return item.totalCents ?? item.costCents * item.quantity;
}

function EvidenceReviewSummary({ row }: { row: ProductionEvidenceRow }) {
  return (
    <div className="mb-3 flex flex-wrap items-center gap-2">
      <Badge variant={evidenceStatusVariant(row.status)}>
        {evidenceStatusLabel(row.status)}
      </Badge>
      <Badge variant={row.locationState === "verified" ? "success" : "warning"}>
        {row.locationState === "verified"
          ? "Location verified"
          : "Location unverified"}
      </Badge>
      <Badge size="sm" variant="outline">
        {row.submittedAt ? formatDate(row.submittedAt) : "Not dated"}
      </Badge>
    </div>
  );
}

function SiteVisitReviewState({
  canCancel,
  canRegenerate,
  onCancel,
  onRegenerate,
  pendingAction,
  visit,
}: {
  canCancel: boolean;
  canRegenerate: boolean;
  onCancel: () => void;
  onRegenerate: () => void;
  pendingAction: string | null;
  visit: ProductionSiteVisit;
}) {
  const { copyToClipboard, isCopied } = useCopyToClipboard();
  const tokenUrl = visit.url;
  const tokenValue = visit.visitId;
  const tokenExpired = Boolean(
    visit.tokenExpiresAt && visit.tokenExpiresAt <= Date.now()
  );
  const canOperateOnToken =
    visit.status !== "complete" &&
    visit.status !== "cancelled" &&
    !visit.tokenConsumedAt;
  const canUseToken = canOperateOnToken && !tokenExpired;

  return (
    <div className="grid gap-3" data-testid="site-visit-token-panel">
      <dl className="grid gap-2 text-sm sm:grid-cols-3">
        <ReviewFact label="State" value={siteVisitStateLabel(visit)} />
        <ReviewFact
          label="Ordered"
          value={formatSiteVisitDateTime(visit.requestedAt)}
        />
        <ReviewFact
          label="Opened"
          value={formatSiteVisitDateTime(visit.tokenOpenedAt)}
        />
        <ReviewFact
          label="Token state"
          value={siteVisitTokenStateLabel(visit)}
        />
        <ReviewFact
          label="Token expires"
          value={formatSiteVisitDateTime(visit.tokenExpiresAt)}
        />
        <ReviewFact
          label="Completed"
          value={formatSiteVisitDateTime(visit.completedAt)}
        />
      </dl>

      <div className="grid gap-3 rounded-md border bg-card p-3">
        <div className="grid gap-1">
          <p className="text-muted-foreground text-xs uppercase">Token</p>
          <code
            className="min-w-0 break-all rounded-sm bg-muted px-2 py-1 text-xs"
            data-testid="site-visit-token-value"
          >
            {tokenValue}
          </code>
        </div>
        {tokenUrl ? (
          <div className="grid gap-1">
            <p className="text-muted-foreground text-xs uppercase">
              Token link
            </p>
            <code
              className="min-w-0 break-all rounded-sm bg-muted px-2 py-1 text-xs"
              data-testid="site-visit-token-url"
            >
              {tokenUrl}
            </code>
          </div>
        ) : null}
        {visit.requestedTime ? (
          <p className="text-muted-foreground text-xs">
            Requested time: {visit.requestedTime}
          </p>
        ) : null}
        {visit.tokenConsumedAt ? (
          <p className="text-muted-foreground text-xs">
            Token consumed {formatSiteVisitDateTime(visit.tokenConsumedAt)}
          </p>
        ) : null}
      </div>

      <div className="flex flex-wrap gap-2">
        {tokenUrl && canUseToken ? (
          <Button
            render={
              // biome-ignore lint/a11y/useAnchorContent: Button supplies the rendered anchor text.
              <a
                aria-label="Open site visit token link"
                href={tokenUrl}
                rel="noreferrer"
                target="_blank"
              />
            }
            size="sm"
            variant="outline"
          >
            <ExternalLink aria-hidden="true" />
            Open token link
          </Button>
        ) : null}
        {canUseToken ? (
          <Button
            onClick={() => copyToClipboard(tokenValue)}
            size="sm"
            type="button"
            variant="outline"
          >
            <Copy aria-hidden="true" />
            {isCopied ? "Copied" : "Copy token"}
          </Button>
        ) : null}
        {tokenUrl && canUseToken ? (
          <Button
            onClick={() => copyToClipboard(tokenUrl)}
            size="sm"
            type="button"
            variant="outline"
          >
            <Copy aria-hidden="true" />
            Copy link
          </Button>
        ) : null}
        <Button
          disabled={
            !(canRegenerate && canOperateOnToken) || pendingAction !== null
          }
          loading={pendingAction === "regenerate-site-visit-token"}
          onClick={onRegenerate}
          size="sm"
          type="button"
          variant="outline"
        >
          <RefreshCw aria-hidden="true" />
          Regenerate token
        </Button>
        {canOperateOnToken ? (
          <Button
            disabled={!canCancel || pendingAction !== null}
            loading={pendingAction === "cancel-site-visit"}
            onClick={onCancel}
            size="sm"
            type="button"
            variant="outline"
          >
            <XCircle aria-hidden="true" />
            Cancel site visit
          </Button>
        ) : null}
      </div>
    </div>
  );
}

function CompletedSiteVisitReview({
  rows,
  visit,
}: {
  rows: ProductionEvidenceRow[];
  visit: ProductionSiteVisit;
}) {
  return (
    <div className="grid gap-3" data-testid="completed-site-visit-review">
      {visit.recordNote ? (
        visit.recordNoteFormat === "html" ? (
          <FieldRichTextPreview
            ariaLabel="Completed site visit report"
            value={visit.recordNote}
          />
        ) : (
          <p className="rounded-md border bg-card p-3 text-sm">
            {visit.recordNote}
          </p>
        )
      ) : (
        <p className="rounded-md border border-dashed p-4 text-muted-foreground text-sm">
          Site visit is complete, but no report note is attached.
        </p>
      )}
      {rows.length > 0 ? (
        rows.map((row) => (
          <div
            className="rounded-md border bg-card p-3"
            data-testid={`milestone-review-site-visit-${row.id}`}
            key={row.id}
          >
            <EvidenceReviewSummary row={row} />
            <EvidenceAssetPackage row={row} />
          </div>
        ))
      ) : (
        <p className="rounded-md border border-dashed p-4 text-muted-foreground text-sm">
          No site visit files are attached.
        </p>
      )}
    </div>
  );
}

function BuildNonFinancialDetailsSheet({
  detail,
  onOpenChange,
  onSubmit,
  open,
}: {
  detail: ProductionBuildDetail;
  onOpenChange: (open: boolean) => void;
  onSubmit: NonNullable<
    ProductionBuildDetailActions["updateNonFinancialDetails"]
  >;
  open: boolean;
}) {
  const [buildName, setBuildName] = useState(detail.build.buildName);
  const [location, setLocation] = useState(detail.build.location);
  const [locationLatitude, setLocationLatitude] = useState<number | null>(
    detail.build.locationLatitude ?? null
  );
  const [locationLongitude, setLocationLongitude] = useState<number | null>(
    detail.build.locationLongitude ?? null
  );
  const [locationPlaceId, setLocationPlaceId] = useState<string | null>(
    detail.build.locationPlaceId ?? null
  );
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [startDate, setStartDate] = useState(detail.build.startDate);
  const [ianaTimezone, setIanaTimezone] = useState(detail.build.timezone ?? "");
  const [error, setError] = useState<string | null>(null);
  const [locationResolving, setLocationResolving] = useState(false);
  const [locationResolutionError, setLocationResolutionError] = useState<
    string | null
  >(null);

  useEffect(() => {
    if (!open) {
      return;
    }
    setBuildName(detail.build.buildName);
    setLocation(detail.build.location);
    setLocationLatitude(detail.build.locationLatitude ?? null);
    setLocationLongitude(detail.build.locationLongitude ?? null);
    setLocationPlaceId(detail.build.locationPlaceId ?? null);
    setReason("");
    setSaving(false);
    setStartDate(detail.build.startDate);
    setIanaTimezone(detail.build.timezone ?? "");
    setError(null);
    setLocationResolving(false);
    setLocationResolutionError(null);
  }, [detail, open]);

  const satelliteMapUrl = useMemo(
    () =>
      createGoogleSatelliteMapUrl({
        address: location,
        latitude: locationLatitude,
        longitude: locationLongitude,
        markerLabel: "B",
        size: "640x360",
        zoom: 19,
      }),
    [location, locationLatitude, locationLongitude]
  );

  const canSave =
    buildName.trim().length > 0 &&
    location.trim().length > 0 &&
    /^\d{4}-\d{2}-\d{2}$/.test(startDate.trim()) &&
    reason.trim().length > 0 &&
    !locationResolving &&
    !saving;

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSave) {
      setError("Title, address, project start, and audit reason are required.");
      return;
    }

    setSaving(true);
    setError(null);
    try {
      await onSubmit({
        buildName: buildName.trim(),
        ...(ianaTimezone.trim() ? { ianaTimezone: ianaTimezone.trim() } : {}),
        location: location.trim(),
        locationLatitude,
        locationLongitude,
        locationPlaceId,
        reason: reason.trim(),
        startDate: startDate.trim(),
      });
      onOpenChange(false);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Unable to save build details."
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <Sheet onOpenChange={onOpenChange} open={open}>
      <SheetPopup side="right" variant="inset">
        <SheetHeader>
          <SheetTitle>Edit build details</SheetTitle>
          <SheetDescription>
            Update non-financial build identity and location metadata.
          </SheetDescription>
        </SheetHeader>
        <form className="contents" onSubmit={handleSubmit}>
          <SheetPanel className="flex flex-col gap-5">
            <Field name="buildName">
              <FieldLabel>Build title</FieldLabel>
              <Input
                data-testid="build-details-title-input"
                onChange={(event) => setBuildName(event.currentTarget.value)}
                value={buildName}
              />
            </Field>
            <Field name="location">
              <FieldLabel>Address</FieldLabel>
              <GoogleAddressAutocomplete
                onChange={(nextLocation, meta) => {
                  setLocation(nextLocation);
                  if (meta?.source !== "selection") {
                    setLocationLatitude(null);
                    setLocationLongitude(null);
                    setLocationPlaceId(null);
                    setLocationResolutionError(null);
                  }
                }}
                onPlaceSelect={(_suggestion, details) => {
                  if (!details) {
                    setLocationResolutionError(
                      "Google did not return coordinates for that address."
                    );
                    return;
                  }
                  setLocation(details.formattedAddress);
                  setLocationLatitude(details.latitude);
                  setLocationLongitude(details.longitude);
                  setLocationPlaceId(details.placeId);
                  setLocationResolutionError(null);
                }}
                onResolvingChange={setLocationResolving}
                placeholder="Search build address"
                testId="build-details-address-input"
                value={location}
              />
              <FieldDescription>
                Selecting a Google result resolves the stored coordinates.
              </FieldDescription>
              {locationResolutionError ? (
                <p className="text-destructive-foreground text-xs">
                  {locationResolutionError}
                </p>
              ) : null}
            </Field>
            <Field name="startDate">
              <FieldLabel>Project start</FieldLabel>
              <Input
                data-testid="build-details-start-date-input"
                onChange={(event) => setStartDate(event.currentTarget.value)}
                type="date"
                value={startDate}
              />
            </Field>
            <Field name="ianaTimezone">
              <FieldLabel htmlFor="build-details-timezone-input">
                Build timezone (IANA)
              </FieldLabel>
              <Input
                data-testid="build-details-timezone-input"
                id="build-details-timezone-input"
                onChange={(event) => setIanaTimezone(event.currentTarget.value)}
                placeholder="America/Toronto"
                value={ianaTimezone}
              />
              <FieldDescription>
                Leave blank to preserve a legacy Build with unknown timezone;
                enter an explicit IANA timezone to repair it.
              </FieldDescription>
            </Field>
            <Frame>
              <FramePanel className="p-4">
                <h3 className="mb-3 font-semibold text-sm">
                  Location metadata
                </h3>
                <dl className="grid grid-cols-[110px_minmax(0,1fr)] gap-y-2 text-sm">
                  <Label>Latitude</Label>
                  <dd className="min-w-0 break-words tabular-nums">
                    {formatCoordinate(locationLatitude)}
                  </dd>
                  <Label>Longitude</Label>
                  <dd className="min-w-0 break-words tabular-nums">
                    {formatCoordinate(locationLongitude)}
                  </dd>
                  <Label>Place ID</Label>
                  <dd className="min-w-0 break-words text-muted-foreground text-xs">
                    {locationPlaceId ?? "Not resolved"}
                  </dd>
                </dl>
              </FramePanel>
            </Frame>
            <Frame>
              <FramePanel className="p-4">
                <h3 className="mb-3 font-semibold text-sm">
                  Satellite preview
                </h3>
                {satelliteMapUrl ? (
                  <img
                    alt="Selected build location satellite map"
                    className="aspect-video w-full rounded-lg border border-border object-cover"
                    data-testid="build-details-satellite-map"
                    height={360}
                    src={satelliteMapUrl}
                    width={640}
                  />
                ) : (
                  <div className="grid aspect-video w-full place-items-center rounded-lg border border-border bg-muted text-center text-muted-foreground">
                    <div className="p-4">
                      <MapPin
                        aria-hidden="true"
                        className="mx-auto mb-2 size-6 text-primary"
                      />
                      <p className="font-medium text-sm">
                        Satellite map unavailable
                      </p>
                      <p className="mt-1 text-xs">
                        Select a Google address or configure Maps.
                      </p>
                    </div>
                  </div>
                )}
              </FramePanel>
            </Frame>
            <Field name="reason">
              <FieldLabel>Audit reason</FieldLabel>
              <Textarea
                data-testid="build-details-reason-input"
                onChange={(event) => setReason(event.currentTarget.value)}
                placeholder="Why are these build details changing?"
                value={reason}
              />
            </Field>
            {error ? (
              <p className="text-destructive-foreground text-sm" role="alert">
                {error}
              </p>
            ) : null}
          </SheetPanel>
          <SheetFooter>
            <SheetClose render={<Button type="button" variant="ghost" />}>
              Cancel
            </SheetClose>
            <Button
              data-testid="build-details-save"
              disabled={!canSave}
              loading={saving}
              type="submit"
            >
              Save changes
            </Button>
          </SheetFooter>
        </form>
      </SheetPopup>
    </Sheet>
  );
}

function formatCoordinate(value: number | null | undefined) {
  return typeof value === "number" ? value.toFixed(6) : "Not resolved";
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <dt className="pt-1 text-muted-foreground text-xs uppercase sm:pt-0">
      {children}
    </dt>
  );
}

export function ProductionDrawsTable({
  actions,
  detail,
  projection,
  viewerRole,
}: {
  actions?: ProductionBuildDetailActions;
  detail: ProductionBuildDetail;
  projection: ProductionBuildProjection;
  viewerRole: "builder" | "lender";
}) {
  const [pendingDraw, setPendingDraw] = useState<string | null>(null);
  const [error, setError] = useState("");

  const run = async (
    draw: ProductionDraw,
    fn?: (draw: ProductionDraw) => Promise<unknown> | unknown
  ) => {
    if (!fn || pendingDraw) {
      return false;
    }
    setPendingDraw(draw.drawKey);
    setError("");
    try {
      await fn(draw);
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      return false;
    } finally {
      setPendingDraw(null);
    }
  };

  return (
    <Card data-testid="build-detail-draws" id="draws-table">
      <CardHeader className="flex flex-row items-center justify-between gap-3 p-3 sm:p-4">
        <CardTitle className="text-sm">Draws</CardTitle>
        <span className="shrink-0 text-right text-muted-foreground text-xs">
          planned_draw_schedule_rows
        </span>
      </CardHeader>
      <CardContent className="p-3 pt-0 sm:p-4 sm:pt-0">
        <div className="overflow-x-auto rounded-md border border-border">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="bg-card/70 text-muted-foreground text-xs uppercase">
              <tr>
                <Th>Draw</Th>
                <Th>Approved</Th>
                <Th>Requested</Th>
                <Th>Planned</Th>
                <Th>Actual</Th>
                <Th>Status</Th>
                <Th>Actions</Th>
              </tr>
            </thead>
            <tbody>
              {projection.draws.map((draw) => {
                const pending = pendingDraw === draw.drawKey;
                return (
                  <tr
                    className="border-border border-t"
                    data-draw-key={draw.drawKey}
                    data-testid={`build-detail-draw-row-${draw.drawKey}`}
                    key={draw.drawKey}
                  >
                    <Td>{draw.label}</Td>
                    <Td className="tabular-nums">
                      {formatCents(draw.amountCents)}
                    </Td>
                    <Td className="tabular-nums">
                      {draw.status === "requested" ||
                      draw.status === "in_review" ||
                      draw.status === "ready_for_admin" ||
                      draw.status === "approved_for_release" ||
                      draw.status === "released"
                        ? formatCents(draw.amountCents)
                        : "-"}
                    </Td>
                    <Td>
                      {formatDate(
                        addDaysSafe(detail.build.startDate, draw.timingDay)
                      )}
                    </Td>
                    <Td>
                      {draw.releaseDate ? formatDate(draw.releaseDate) : "-"}
                    </Td>
                    <Td>
                      <StatusChip status={draw.status} />
                    </Td>
                    <Td>
                      <div className="flex flex-wrap justify-end gap-1 sm:justify-start">
                        {viewerRole === "builder" &&
                        (draw.status === "planned" ||
                          draw.status === "rejected") ? (
                          <DrawActionButton
                            disabled={!actions?.requestDraw || pending}
                            label={pending ? "Requesting..." : "Request"}
                            onClick={() => run(draw, actions?.requestDraw)}
                            testId={`build-detail-draw-request-${draw.drawKey}`}
                          />
                        ) : null}
                        {viewerRole === "lender" &&
                        draw.status === "requested" ? (
                          <DrawActionButton
                            disabled={!actions?.startDrawReview || pending}
                            label={pending ? "Starting..." : "Start review"}
                            onClick={() => run(draw, actions?.startDrawReview)}
                            testId={`build-detail-draw-start-${draw.drawKey}`}
                          />
                        ) : null}
                        {viewerRole === "lender" &&
                        draw.status === "in_review" ? (
                          <DrawActionButton
                            disabled={!actions?.submitDrawForAdmin || pending}
                            label={pending ? "Sending..." : "Send to admin"}
                            onClick={() =>
                              run(draw, actions?.submitDrawForAdmin)
                            }
                            testId={`build-detail-draw-submit-${draw.drawKey}`}
                          />
                        ) : null}
                        {viewerRole === "lender" &&
                        draw.status === "ready_for_admin" ? (
                          <>
                            <DrawActionButton
                              disabled={!actions?.approveDraw || pending}
                              label={
                                pending ? "Approving..." : "Approve for release"
                              }
                              onClick={() => run(draw, actions?.approveDraw)}
                              testId={`build-detail-draw-approve-${draw.drawKey}`}
                            />
                            <DrawRejectionDialog
                              amountCents={draw.amountCents}
                              buildLabel={detail.build.buildName}
                              disabled={!actions?.rejectDraw || pending}
                              loading={pending}
                              onReject={(reason) =>
                                run(draw, (targetDraw) =>
                                  actions?.rejectDraw?.({
                                    draw: targetDraw,
                                    reason,
                                  })
                                )
                              }
                              requestKey={draw.drawKey}
                              requestLabel={draw.label}
                              triggerTestId={`build-detail-draw-reject-${draw.drawKey}`}
                            />
                          </>
                        ) : null}
                        {viewerRole === "lender" &&
                        draw.status === "approved_for_release" ? (
                          <DrawActionButton
                            disabled={!actions?.releaseDraw || pending}
                            label={pending ? "Releasing..." : "Release"}
                            onClick={() => run(draw, actions?.releaseDraw)}
                            testId={`build-detail-draw-release-${draw.drawKey}`}
                          />
                        ) : null}
                        {draw.status === "released" ? (
                          <span className="text-muted-foreground text-xs">
                            Released
                          </span>
                        ) : null}
                        {viewerRole === "lender" &&
                        (draw.status === "planned" ||
                          draw.status === "rejected") ? (
                          <span className="text-muted-foreground text-xs">
                            Awaiting request
                          </span>
                        ) : null}
                        {viewerRole === "builder" &&
                        (draw.status === "requested" ||
                          draw.status === "in_review" ||
                          draw.status === "ready_for_admin") ? (
                          <span className="text-muted-foreground text-xs">
                            In lender review
                          </span>
                        ) : null}
                        {viewerRole === "builder" &&
                        draw.status === "approved_for_release" ? (
                          <span className="text-muted-foreground text-xs">
                            Awaiting release
                          </span>
                        ) : null}
                      </div>
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {error ? (
          <p className="mt-2 text-destructive text-xs" role="alert">
            {error}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}

function DrawActionButton({
  disabled,
  label,
  onClick,
  testId,
}: {
  disabled?: boolean;
  label: string;
  onClick: () => void;
  testId: string;
}) {
  return (
    <button
      className="rounded-md border border-primary/40 bg-primary/20 px-2 py-1 text-xs disabled:opacity-50"
      data-testid={testId}
      disabled={disabled}
      onClick={onClick}
      type="button"
    >
      {label}
    </button>
  );
}

function FacilityChangeRequestsCard({
  actions,
  detail,
}: {
  actions?: ProductionBuildDetailActions;
  detail: ProductionBuildDetail;
}) {
  const [principalText, setPrincipalText] = useState(
    String(Math.round((detail.loanFacility?.principalCents ?? 0) / 100))
  );
  const [paybackDate, setPaybackDate] = useState(
    detail.loanFacility?.paybackDate ?? detail.build.startDate
  );
  const [reason, setReason] = useState("");
  const [reviewNote, setReviewNote] = useState("");
  const [pending, setPending] = useState("");
  const [error, setError] = useState("");
  const requests = detail.facilityChangeRequests ?? [];
  const pendingRequests = requests.filter(
    (request) => request.status === "requested"
  );

  const run = async (key: string, fn?: () => Promise<unknown> | unknown) => {
    if (!fn || pending) {
      return;
    }
    setPending(key);
    setError("");
    try {
      await fn();
      if (key.startsWith("request")) {
        setReason("");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setPending("");
    }
  };

  const requestPrincipal = () =>
    run("request-principal", () =>
      actions?.requestFacilityChange?.({
        reason: reason.trim() || undefined,
        requestedPrincipalCents: Math.round(Number(principalText) * 100),
        requestType: "principalIncrease",
      })
    );
  const requestPayback = () =>
    run("request-payback", () =>
      actions?.requestFacilityChange?.({
        reason: reason.trim() || undefined,
        requestedPaybackDate: paybackDate,
        requestType: "paybackExtension",
      })
    );
  const review = (
    request: ProductionFacilityChangeRequest,
    status: "approved" | "rejected"
  ) =>
    run(`${status}-${request._id}`, () =>
      actions?.reviewFacilityChangeRequest?.({
        note: reviewNote.trim() || undefined,
        requestId: request._id,
        status,
      })
    );

  return (
    <Card data-testid="facility-change-requests">
      <CardHeader className="flex flex-row items-center justify-between gap-3 p-3 sm:p-4">
        <div>
          <CardTitle className="text-sm">Capital and term requests</CardTitle>
          <p className="mt-1 text-muted-foreground text-xs">
            Builder requests for principal increases and payback extensions.
          </p>
        </div>
        <Badge variant={pendingRequests.length > 0 ? "default" : "outline"}>
          {pendingRequests.length} pending
        </Badge>
      </CardHeader>
      <CardContent className="grid gap-3 p-3 pt-0 sm:p-4 sm:pt-0 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <div className="rounded-md border border-border bg-background/40 p-3">
          <dl className="grid gap-2 text-sm sm:grid-cols-[130px_1fr]">
            <Label>Current principal</Label>
            <dd className="font-medium tabular-nums">
              {formatCents(detail.loanFacility?.principalCents ?? 0)}
            </dd>
            <Label>Current payback</Label>
            <dd className="font-medium">
              {detail.loanFacility?.paybackDate
                ? formatDate(detail.loanFacility.paybackDate)
                : "Not set"}
            </dd>
          </dl>
          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            <label className="grid gap-1 text-xs">
              <span className="font-medium">Requested principal</span>
              <input
                className="rounded-md border border-border bg-background px-2 py-2 tabular-nums"
                data-testid="facility-principal-input"
                min={0}
                onChange={(event) => setPrincipalText(event.target.value)}
                step={5000}
                type="number"
                value={principalText}
              />
            </label>
            <label className="grid gap-1 text-xs">
              <span className="font-medium">Requested payback date</span>
              <input
                className="rounded-md border border-border bg-background px-2 py-2"
                data-testid="facility-payback-input"
                onChange={(event) => setPaybackDate(event.target.value)}
                type="date"
                value={paybackDate}
              />
            </label>
          </div>
          <textarea
            className="mt-2 min-h-[64px] w-full rounded-md border border-border bg-background p-2 text-xs"
            data-testid="facility-change-reason"
            onChange={(event) => setReason(event.target.value)}
            placeholder="Reason for the request"
            value={reason}
          />
          <div className="mt-2 flex flex-wrap gap-2">
            <DrawActionButton
              disabled={!actions?.requestFacilityChange || Boolean(pending)}
              label={
                pending === "request-principal"
                  ? "Requesting..."
                  : "Request principal"
              }
              onClick={requestPrincipal}
              testId="facility-request-principal"
            />
            <DrawActionButton
              disabled={!actions?.requestFacilityChange || Boolean(pending)}
              label={
                pending === "request-payback"
                  ? "Requesting..."
                  : "Request extension"
              }
              onClick={requestPayback}
              testId="facility-request-payback"
            />
          </div>
        </div>
        <div className="rounded-md border border-border bg-background/40 p-3">
          <div className="mb-2 flex flex-col gap-2 sm:flex-row sm:items-center">
            <p className="font-medium text-sm">Review queue</p>
            <input
              className="min-w-0 flex-1 rounded-md border border-border bg-background px-2 py-1.5 text-xs"
              data-testid="facility-review-note"
              onChange={(event) => setReviewNote(event.target.value)}
              placeholder="Review note"
              value={reviewNote}
            />
          </div>
          {requests.length === 0 ? (
            <p className="rounded-md border border-border border-dashed p-3 text-muted-foreground text-xs">
              No capital or term requests have been submitted.
            </p>
          ) : (
            <ul className="space-y-2">
              {requests.slice(0, 5).map((request) => (
                <li
                  className="rounded-md border border-border bg-card/50 p-2 text-xs"
                  data-testid={`facility-change-request-${request._id}`}
                  key={request._id}
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="font-medium">
                        {facilityRequestLabel(request)}
                      </p>
                      <p className="text-muted-foreground">
                        {formatDate(request.createdAt)} by{" "}
                        {request.requestedByWorkosUserId}
                      </p>
                    </div>
                    <StatusPill status={request.status} />
                  </div>
                  {request.reason ? (
                    <p className="mt-2 text-muted-foreground">
                      {request.reason}
                    </p>
                  ) : null}
                  {request.status === "requested" ? (
                    <div className="mt-2 flex flex-wrap gap-2">
                      <DrawActionButton
                        disabled={
                          !actions?.reviewFacilityChangeRequest ||
                          Boolean(pending)
                        }
                        label="Approve"
                        onClick={() => review(request, "approved")}
                        testId={`facility-approve-${request._id}`}
                      />
                      <DrawActionButton
                        disabled={
                          !actions?.reviewFacilityChangeRequest ||
                          Boolean(pending)
                        }
                        label="Deny"
                        onClick={() => review(request, "rejected")}
                        testId={`facility-deny-${request._id}`}
                      />
                    </div>
                  ) : request.reviewNote ? (
                    <p className="mt-2 text-muted-foreground">
                      Review: {request.reviewNote}
                    </p>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
          {error ? (
            <p className="mt-2 text-destructive text-xs" role="alert">
              {error}
            </p>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}

function BudgetRevisionCard({
  actions,
  detail,
  viewerRole,
}: {
  actions?: ProductionBuildDetailActions;
  detail: ProductionBuildDetail;
  viewerRole: "builder" | "lender";
}) {
  const current = detail.capitalPlan;
  const requests = detail.budgetRevisionRequests ?? [];
  const pendingRequest = requests.find(
    (request) => request.status === "requested"
  );
  const [workingCapital, setWorkingCapital] = useState(
    String(Math.round((current?.borrowerStartingCashCents ?? 0) / 100))
  );
  const [policyLimit, setPolicyLimit] = useState(
    String(Math.round((current?.lenderDrawPolicyLimitCents ?? 0) / 100))
  );
  const [loanPercentage, setLoanPercentage] = useState(
    String((10_000 - (current?.borrowerCoPayBps ?? 0)) / 100)
  );
  const [reason, setReason] = useState("");
  const [reviewNote, setReviewNote] = useState("");
  const [pendingAction, setPendingAction] = useState("");
  const [error, setError] = useState("");

  const run = async (key: string, action: () => Promise<unknown> | unknown) => {
    if (pendingAction) {
      return;
    }
    setPendingAction(key);
    setError("");
    try {
      await action();
      setReason("");
      setReviewNote("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setPendingAction("");
    }
  };
  const requestRevision = () =>
    run("request", () =>
      actions?.requestBudgetRevision?.({
        borrowerCoPayBps: 10_000 - Math.round(Number(loanPercentage) * 100),
        borrowerStartingCashCents: Math.round(Number(workingCapital) * 100),
        lenderDrawPolicyLimitCents: Math.round(Number(policyLimit) * 100),
        reason: reason.trim(),
      })
    );
  const reviewRevision = (status: "approved" | "rejected") => {
    if (!pendingRequest) {
      return;
    }
    return run(status, () =>
      actions?.reviewBudgetRevision?.({
        note: reviewNote.trim(),
        requestId: pendingRequest._id,
        status,
      })
    );
  };

  return (
    <Card data-testid="budget-revision-governance">
      <CardHeader className="flex flex-row items-start justify-between gap-3 p-3 sm:p-4">
        <div>
          <CardTitle className="text-sm">Budget governance</CardTitle>
          <p className="mt-1 text-muted-foreground text-xs">
            Versioned capital-plan revisions preserve every prior governing
            Budget.
          </p>
        </div>
        <Badge variant={pendingRequest ? "warning" : "outline"}>
          {current ? `Capital plan v${current.version}` : "No active version"}
        </Badge>
      </CardHeader>
      <CardContent className="grid gap-4 p-3 pt-0 sm:p-4 sm:pt-0 lg:grid-cols-2">
        {viewerRole === "builder" ? (
          <section aria-label="Request budget revision" className="grid gap-3">
            <div className="grid gap-2 sm:grid-cols-3">
              <label
                className="grid gap-1 text-xs"
                htmlFor="budget-working-capital"
              >
                <span className="font-medium">Working capital ($)</span>
                <Input
                  data-testid="budget-working-capital"
                  id="budget-working-capital"
                  min="0"
                  onChange={(event) => setWorkingCapital(event.target.value)}
                  type="number"
                  value={workingCapital}
                />
              </label>
              <label
                className="grid gap-1 text-xs"
                htmlFor="budget-policy-limit"
              >
                <span className="font-medium">Draw policy limit ($)</span>
                <Input
                  data-testid="budget-policy-limit"
                  id="budget-policy-limit"
                  min="0"
                  onChange={(event) => setPolicyLimit(event.target.value)}
                  type="number"
                  value={policyLimit}
                />
              </label>
              <label
                className="grid gap-1 text-xs"
                htmlFor="budget-loan-percentage"
              >
                <span className="font-medium">Loan Percentage (%)</span>
                <Input
                  data-testid="budget-loan-percentage"
                  id="budget-loan-percentage"
                  max="100"
                  min="0"
                  onChange={(event) => setLoanPercentage(event.target.value)}
                  type="number"
                  value={loanPercentage}
                />
              </label>
            </div>
            <Textarea
              aria-label="Budget revision reason"
              onChange={(event) => setReason(event.target.value)}
              placeholder="Explain the variance and affected work"
              value={reason}
            />
            <Button
              disabled={
                !(actions?.requestBudgetRevision && reason.trim()) ||
                Boolean(pendingRequest) ||
                Boolean(pendingAction)
              }
              onClick={requestRevision}
              size="sm"
              type="button"
            >
              {pendingAction === "request" ? "Submitting…" : "Request revision"}
            </Button>
          </section>
        ) : (
          <section aria-label="Review budget revision" className="grid gap-3">
            <Textarea
              aria-label="Budget revision decision note"
              disabled={!pendingRequest}
              onChange={(event) => setReviewNote(event.target.value)}
              placeholder="Record the admin decision rationale"
              value={reviewNote}
            />
            <div className="flex flex-wrap gap-2">
              <Button
                disabled={
                  !(
                    actions?.reviewBudgetRevision &&
                    pendingRequest &&
                    reviewNote.trim()
                  ) || Boolean(pendingAction)
                }
                onClick={() => reviewRevision("approved")}
                size="sm"
                type="button"
              >
                Approve revision
              </Button>
              <Button
                disabled={
                  !(
                    actions?.reviewBudgetRevision &&
                    pendingRequest &&
                    reviewNote.trim()
                  ) || Boolean(pendingAction)
                }
                onClick={() => reviewRevision("rejected")}
                size="sm"
                type="button"
                variant="destructive"
              >
                Reject revision
              </Button>
            </div>
          </section>
        )}
        <section aria-label="Budget version history" className="grid gap-2">
          {requests.length ? (
            requests.slice(0, 5).map((request) => (
              <Card key={request._id}>
                <CardContent className="grid gap-1 p-3 text-xs">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-medium">
                      v{request.baseVersion} → v{request.baseVersion + 1}
                    </span>
                    <StatusPill status={request.status} />
                  </div>
                  <span>
                    {request.varianceCents >= 0 ? "+" : ""}
                    {formatCents(request.varianceCents)} policy variance
                  </span>
                  <span className="text-muted-foreground">
                    {request.reason}
                  </span>
                  {request.reviewNote ? (
                    <span className="text-muted-foreground">
                      Decision: {request.reviewNote}
                    </span>
                  ) : null}
                </CardContent>
              </Card>
            ))
          ) : (
            <p className="text-muted-foreground text-xs">
              No Budget revisions have been requested. Capital plan v
              {current?.version ?? 1}
              remains governing.
            </p>
          )}
        </section>
        {error ? (
          <p className="text-destructive text-xs lg:col-span-2" role="alert">
            {error}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}

function facilityRequestLabel(request: ProductionFacilityChangeRequest) {
  if (request.requestType === "principalIncrease") {
    return `Principal increase to ${formatCents(
      request.requestedPayload.requestedPrincipalCents ?? 0
    )}`;
  }
  return `Payback extension to ${formatDate(
    request.requestedPayload.requestedPaybackDate ?? ""
  )}`;
}

function StatusPill({ status }: { status: string }) {
  return (
    <Badge variant={status === "approved" ? "default" : "outline"}>
      {status}
    </Badge>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return <th className="px-3 py-2 text-left font-medium">{children}</th>;
}

function Td({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <td className={cn("px-3 py-2 align-top", className)}>{children}</td>;
}

function StatusChip({ status }: { status: ProductionDrawStatus }) {
  return (
    <Badge variant={drawBadgeVariant(status)}>{drawStatusLabel(status)}</Badge>
  );
}

function ProductionDocumentsCard({
  actions,
  documents,
}: {
  actions?: ProductionBuildDetailActions;
  documents: ProductionDocument[];
}) {
  const [name, setName] = useState("");
  const [kind, setKind] = useState<"permit" | "budget" | "plan" | "supporting">(
    "supporting"
  );
  const [supersedesDocumentId, setSupersedesDocumentId] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  const onAdd = async () => {
    if (!(name.trim() && actions?.addDocument) || pending) {
      return;
    }
    setPending(true);
    setError("");
    try {
      await actions.addDocument({
        documentType: kind,
        fileName: name.trim(),
        supersedesDocumentId: supersedesDocumentId || undefined,
      });
      setName("");
      setKind("supporting");
      setSupersedesDocumentId("");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setPending(false);
    }
  };

  return (
    <Card data-testid="build-detail-documents" id="documents">
      <CardHeader className="flex flex-row items-center justify-between p-3 sm:p-4">
        <CardTitle className="text-sm">Documents</CardTitle>
        <span className="text-muted-foreground text-xs tabular-nums">
          {documents.length}
        </span>
      </CardHeader>
      <CardContent className="p-3 pt-0 sm:p-4 sm:pt-0">
        <div
          className="mb-3 grid gap-2 md:grid-cols-[minmax(0,1fr)_120px_minmax(180px,auto)_auto]"
          data-testid="documents-add-form"
        >
          <input
            aria-label="Document name"
            className="rounded-md border border-border bg-background px-2 py-1.5 text-sm outline-none focus:border-primary"
            data-testid="documents-name"
            onChange={(event) => setName(event.target.value)}
            placeholder="e.g. Inspection_2026-08.pdf"
            value={name}
          />
          <select
            aria-label="Document kind"
            className="rounded-md border border-border bg-background px-2 py-1.5 text-sm outline-none focus:border-primary"
            data-testid="documents-kind"
            onChange={(event) => setKind(event.target.value as typeof kind)}
            value={kind}
          >
            {["permit", "budget", "plan", "supporting"].map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
          <select
            aria-label="Document version relationship"
            className="rounded-md border border-border bg-background px-2 py-1.5 text-sm outline-none focus:border-primary"
            data-testid="documents-supersedes"
            onChange={(event) => {
              const documentId = event.target.value;
              setSupersedesDocumentId(documentId);
              const selected = documents.find(
                (document) => document._id === documentId
              );
              const selectedType = selected?.documentType ?? selected?.kind;
              if (
                selectedType === "permit" ||
                selectedType === "budget" ||
                selectedType === "plan" ||
                selectedType === "supporting"
              ) {
                setKind(selectedType);
              }
            }}
            value={supersedesDocumentId}
          >
            <option value="">New Document</option>
            {documents
              .filter((document) => document.status !== "superseded")
              .map((document) => (
                <option key={document._id} value={document._id}>
                  Supersede {document.name ?? document.fileName} v
                  {document.version ?? 1}
                </option>
              ))}
          </select>
          <button
            className="rounded-md bg-primary px-3 py-2 font-medium text-primary-foreground text-sm disabled:opacity-50 md:py-1.5"
            data-testid="documents-add"
            disabled={!(name.trim() && actions?.addDocument) || pending}
            onClick={onAdd}
            type="button"
          >
            {pending ? "Adding..." : "Add"}
          </button>
        </div>
        {error ? (
          <p className="mb-2 text-destructive text-xs">{error}</p>
        ) : null}
        {documents.length === 0 ? (
          <p className="text-muted-foreground text-xs">No documents yet.</p>
        ) : (
          <ul className="space-y-1">
            {documents.map((document) => (
              <li
                className="flex flex-col items-start gap-1 rounded-md border border-border bg-background/40 p-2 text-sm sm:flex-row sm:items-center sm:justify-between"
                data-collaboration-focus={`document:${document._id}`}
                data-testid={`build-detail-document-${document._id}`}
                key={document._id}
              >
                <span className="truncate">
                  {document.name ?? document.fileName}
                </span>
                <div className="flex shrink-0 items-center gap-2 sm:ml-2">
                  <span className="text-muted-foreground text-xs">
                    {document.kind ?? document.documentType}
                    {` · v${document.version ?? 1}`}
                    {document.status ? ` · ${document.status}` : ""}
                    {document.sizeBytes
                      ? ` - ${Math.round(document.sizeBytes / 1024)}KB`
                      : ""}
                  </span>
                  {(document.kind === "permit" ||
                    document.documentType === "permit") &&
                  (document.storageUrl || document.url) ? (
                    <Button
                      render={
                        <a
                          data-testid={`build-detail-document-${document._id}-view`}
                          href={document.storageUrl ?? document.url ?? ""}
                          rel="noreferrer"
                          target="_blank"
                        />
                      }
                      size="xs"
                      variant="outline"
                    >
                      <ExternalLink />
                      View
                    </Button>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function ProductionMilestonesTab({
  currentDay,
  detail,
  onAssignContractor,
  onCardClick,
  onStartWork,
  projection,
  viewerRole,
}: {
  currentDay: number;
  detail: ProductionBuildDetail;
  onAssignContractor?: (card: KanbanCardData) => void;
  onCardClick: (card: KanbanCardData) => void;
  onStartWork?: (milestoneKey: string) => void;
  projection: ProductionBuildProjection;
  viewerRole: "builder" | "lender";
}) {
  const [showCompletedKanban, setShowCompletedKanban] = useState(false);
  const kanbanCards = useMemo(
    () => buildProductionKanbanCards(detail, projection, currentDay),
    [currentDay, detail, projection]
  );

  return (
    <div className="grid gap-4" data-testid="production-build-milestones">
      <MilestoneKanban
        cards={kanbanCards}
        onAssignContractor={onAssignContractor}
        onCardClick={onCardClick}
        onStartWork={
          onStartWork ? (card) => onStartWork(card.milestoneKey) : undefined
        }
        onToggleShowCompleted={() => setShowCompletedKanban((prev) => !prev)}
        showCompleted={showCompletedKanban}
        viewerRole={viewerRole}
      />
    </div>
  );
}

function ProductionDocumentsTab({
  actions,
  detail,
}: {
  actions?: ProductionBuildDetailActions;
  detail: ProductionBuildDetail;
}) {
  return (
    <div data-testid="production-build-documents">
      <ProductionDocumentsCard
        actions={actions}
        documents={detail.documents ?? []}
      />
    </div>
  );
}

function ProductionContractorsTab({
  actions,
  contractorDetailHrefFor,
  detail,
  viewerRole,
}: {
  actions?: ProductionBuildDetailActions;
  contractorDetailHrefFor?: (contractorId: string) => string;
  detail: ProductionBuildDetail;
  viewerRole: "builder" | "lender";
}) {
  const planning = useMemo(
    () => contractorPlanningFromProductionDetail(detail),
    [detail]
  );
  const milestones = useMemo(
    () => productionBuildMilestonesForContractors(detail),
    [detail]
  );

  return (
    <div className="space-y-4" data-testid="production-build-contractors">
      <ContractorsCard
        actions={contractorsCardActions(actions)}
        availableContractors={detail.availableContractors ?? []}
        buildId={detail.build._id}
        contractorDetailHrefFor={contractorDetailHrefFor}
        contractors={detail.contractors ?? []}
      />
      <ContractorPlanningPanel
        canMutate={Boolean(
          actions?.assignContractorToMilestone ||
            actions?.removeContractorFromMilestone ||
            actions?.attachAndInviteContractor ||
            actions?.attachContractor ||
            actions?.createAndAttachContractor
        )}
        milestones={milestones}
        onAssignToMilestone={
          actions?.assignContractorToMilestone
            ? async ({
                assignmentCost,
                contractorId,
                milestoneKey,
                role,
                submilestoneKeys,
              }) => {
                await actions.assignContractorToMilestone?.({
                  assignmentCost,
                  contractorId,
                  milestoneKey,
                  role,
                  submilestoneKeys,
                });
              }
            : undefined
        }
        onAttachAndInviteExisting={
          actions?.attachAndInviteContractor
            ? async ({ contractorId, role }) => {
                await actions.attachAndInviteContractor?.({
                  contractorId,
                  role,
                });
              }
            : undefined
        }
        onAttachExisting={
          actions?.attachContractor
            ? async ({ contractorId, role }) => {
                await actions.attachContractor?.({ contractorId, role });
              }
            : undefined
        }
        onCreateAndAttach={
          actions?.createAndAttachContractor
            ? ({ contractor, role }) =>
                actions.createAndAttachContractor?.({
                  contractor,
                  role: role ?? contractor.trades[0] ?? "Contractor",
                })
            : undefined
        }
        onInviteCreatedContractor={
          actions?.inviteContractor
            ? async (contractorId) => {
                await actions.inviteContractor?.(contractorId);
              }
            : undefined
        }
        onRemoveFromMilestone={
          actions?.removeContractorFromMilestone
            ? async (input) => {
                await actions.removeContractorFromMilestone?.(input);
              }
            : undefined
        }
        planning={planning}
        roleLabel={viewerRole}
      />
    </div>
  );
}

function productionBuildMilestonesForContractors(
  detail: ProductionBuildDetail
): ContractorPlanningMilestone[] {
  return [...detail.milestones]
    .sort((a, b) => a.order - b.order)
    .map((milestone) => ({
      milestoneKey: milestone.key,
      name: milestone.name,
      submilestoneSnapshot: (detail.submilestones ?? [])
        .filter((submilestone) => submilestone.milestoneKey === milestone.key)
        .sort((a, b) => a.order - b.order)
        .map((submilestone) => ({
          key: submilestone.key,
          name: submilestone.name,
        })),
    }));
}

export function contractorsCardActions(actions?: ProductionBuildDetailActions) {
  return {
    onAttachAndInviteExisting: actions?.attachAndInviteContractor
      ? async (input: { contractorId: string; role: string }) => {
          await actions.attachAndInviteContractor?.(input);
        }
      : undefined,
    onAttachExisting: actions?.attachContractor
      ? async (input: { contractorId: string; role: string }) => {
          await actions.attachContractor?.(input);
        }
      : undefined,
    onCreateAndAttach: actions?.createAndAttachContractor
      ? (input: { contractor: ContractorProfileDraft; role: string }) =>
          actions.createAndAttachContractor?.(input)
      : undefined,
    onInviteCreatedContractor: actions?.inviteContractor
      ? async (contractorId: string) => {
          await actions.inviteContractor?.(contractorId);
        }
      : undefined,
    sourceLabel: "production_contractors",
  };
}

function ProductionTimelineTab({
  activeBuildId,
  actions,
  detail,
  onRequestSiteVisit,
  timelineWorkspace,
  viewerRole,
  workosOrganizationId,
}: {
  activeBuildId?: string;
  actions?: ProductionBuildDetailActions;
  detail: ProductionBuildDetail;
  onRequestSiteVisit: (request: SiteVisitOrderRequest) => void;
  timelineWorkspace?: ActiveBuildTimelineWorkspaceProps["workspace"] | null;
  viewerRole: "builder" | "lender";
  workosOrganizationId?: string;
}) {
  if (
    !(activeBuildId && workosOrganizationId) ||
    timelineWorkspace === undefined
  ) {
    return (
      <Frame data-testid="production-build-timeline-loading">
        <FramePanel className="grid min-h-[28rem] place-items-center p-6 text-muted-foreground text-sm">
          Loading production timeline workspace...
        </FramePanel>
      </Frame>
    );
  }
  if (timelineWorkspace === null) {
    return (
      <Frame data-testid="production-build-timeline-unavailable">
        <FramePanel className="p-4 text-sm">
          Production timeline workspace is unavailable for this build.
        </FramePanel>
      </Frame>
    );
  }
  return (
    <div data-testid="production-build-timeline">
      <ActiveBuildTimelineWorkspace
        appPermissions={detail.appPermissions}
        backofficeHref="/backoffice"
        buildHref={`/backoffice/builds/${detail.build._id}`}
        buildId={activeBuildId as any}
        canApproveMilestones={Boolean(actions?.approveMilestone)}
        canRecordSiteVisits={Boolean(actions?.reviewEvidence)}
        canRequestMilestoneInfo={Boolean(actions?.requestMilestoneInfo)}
        canRequestSiteVisits={Boolean(actions?.assignSiteVisit)}
        canReviewDraws={Boolean(actions?.approveDraw && actions?.rejectDraw)}
        initialRole={viewerRole}
        onRequestSiteVisit={onRequestSiteVisit}
        workosOrganizationId={workosOrganizationId}
        workspace={timelineWorkspace}
      />
    </div>
  );
}

function ProductionEvidenceTab({
  actions,
  detail,
  focusedReference,
  onOpenMilestone,
  projection,
}: {
  actions?: ProductionBuildDetailActions;
  detail: ProductionBuildDetail;
  focusedReference?: string;
  onOpenMilestone: (milestoneKey: string) => void;
  projection: ProductionBuildProjection;
}) {
  const builderEvidence = useMemo(
    () => buildBuilderEvidenceRows(detail, projection),
    [detail, projection]
  );
  const completedSiteVisits = useMemo(
    () => buildCompletedSiteVisitRows(detail, projection),
    [detail, projection]
  );
  const locationUnverifiedCount = builderEvidence.filter(
    (row) => row.locationState === "unverified"
  ).length;
  const totalEvidence = builderEvidence.length + completedSiteVisits.length;

  return (
    <div
      className="flex flex-col gap-4"
      data-testid="production-build-evidence"
    >
      <Frame>
        <FramePanel className="p-4 sm:p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="info">Unified evidence</Badge>
                {locationUnverifiedCount > 0 ? (
                  <Badge variant="warning">
                    {locationUnverifiedCount} location unverified
                  </Badge>
                ) : null}
              </div>
              <h2 className="mt-3 font-semibold text-lg">Evidence</h2>
              <p className="mt-1 max-w-3xl text-muted-foreground text-sm">
                Builder milestone evidence and completed site visits are grouped
                here with source labels, review state, and milestone context.
              </p>
            </div>
            <div className="grid min-w-0 grid-cols-3 gap-2 text-sm lg:min-w-[24rem]">
              <EvidenceSummaryStat
                icon={<FileCheck2 aria-hidden="true" className="size-4" />}
                label="Builder"
                value={builderEvidence.length}
              />
              <EvidenceSummaryStat
                icon={<ClipboardCheck aria-hidden="true" className="size-4" />}
                label="Site visits"
                value={completedSiteVisits.length}
              />
              <EvidenceSummaryStat
                icon={<CheckCircle2 aria-hidden="true" className="size-4" />}
                label="Total"
                value={totalEvidence}
              />
            </div>
          </div>
        </FramePanel>
      </Frame>

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1.25fr)_minmax(320px,0.75fr)]">
        <EvidenceSourcePanel
          actions={actions}
          emptyLabel="No builder-submitted milestone evidence yet."
          focusedReference={focusedReference}
          onOpenMilestone={onOpenMilestone}
          rows={builderEvidence}
          title="Builder Submitted Evidence"
        />
        <EvidenceSourcePanel
          emptyLabel="No completed site visits yet."
          focusedReference={focusedReference}
          onOpenMilestone={onOpenMilestone}
          rows={completedSiteVisits}
          title="Completed Site Visits"
        />
      </section>
    </div>
  );
}

function EvidenceSummaryStat({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
}) {
  return (
    <div className="min-w-0 rounded-lg border bg-background/70 px-3 py-2">
      <div className="flex items-center gap-2 text-muted-foreground text-xs">
        {icon}
        <span className="truncate">{label}</span>
      </div>
      <p className="mt-1 font-semibold text-lg tabular-nums">{value}</p>
    </div>
  );
}

function EvidenceSourcePanel({
  actions,
  emptyLabel,
  focusedReference,
  onOpenMilestone,
  rows,
  title,
}: {
  actions?: ProductionBuildDetailActions;
  emptyLabel: string;
  focusedReference?: string;
  onOpenMilestone: (milestoneKey: string) => void;
  rows: ProductionEvidenceRow[];
  title: string;
}) {
  const [expandedRowId, setExpandedRowId] = useState<string | null>(
    rows[0]?.id ?? null
  );
  const [pendingAction, setPendingAction] = useState<string | null>(null);

  useEffect(() => {
    if (expandedRowId && rows.some((row) => row.id === expandedRowId)) {
      return;
    }
    setExpandedRowId(rows[0]?.id ?? null);
  }, [expandedRowId, rows]);

  useEffect(() => {
    if (!focusedReference) {
      return;
    }
    const focusedRow = rows.find((row) =>
      row.assets.some(
        (asset) =>
          focusedReference === `evidenceAsset:${asset._id}` ||
          focusedReference === `evidencePackage:${asset.evidenceKey}`
      )
    );
    if (focusedRow) {
      setExpandedRowId(focusedRow.id);
    }
  }, [focusedReference, rows]);

  const reviewEvidence = async (
    row: ProductionEvidenceRow,
    accepted: boolean
  ) => {
    if (!actions?.reviewEvidence || pendingAction) {
      return;
    }
    const actionKey = `${accepted ? "approve" : "request-info"}:${row.id}`;
    setPendingAction(actionKey);
    try {
      await actions.reviewEvidence({
        accepted,
        milestoneKey: row.milestoneKey,
        note: accepted
          ? "Evidence approved from build evidence tab."
          : "More information requested from build evidence tab.",
      });
    } finally {
      setPendingAction(null);
    }
  };

  return (
    <Frame>
      <FramePanel className="p-0">
        <div className="flex items-center justify-between gap-3 border-b px-4 py-3">
          <h3 className="font-semibold text-sm">{title}</h3>
          <Badge size="sm" variant={rows.length > 0 ? "secondary" : "outline"}>
            {rows.length}
          </Badge>
        </div>
        {rows.length === 0 ? (
          <div className="px-4 py-8 text-muted-foreground text-sm">
            {emptyLabel}
          </div>
        ) : (
          <div className="divide-y">
            {rows.map((row) => (
              <EvidenceRowItem
                actions={actions}
                expanded={expandedRowId === row.id}
                key={row.id}
                onOpenMilestone={onOpenMilestone}
                onReviewEvidence={reviewEvidence}
                onToggleExpanded={() =>
                  setExpandedRowId((current) =>
                    current === row.id ? null : row.id
                  )
                }
                pendingAction={pendingAction}
                row={row}
              />
            ))}
          </div>
        )}
      </FramePanel>
    </Frame>
  );
}

function EvidenceRowItem({
  actions,
  expanded,
  onOpenMilestone,
  onReviewEvidence,
  onToggleExpanded,
  pendingAction,
  row,
}: {
  actions?: ProductionBuildDetailActions;
  expanded: boolean;
  onOpenMilestone: (milestoneKey: string) => void;
  onReviewEvidence: (
    row: ProductionEvidenceRow,
    accepted: boolean
  ) => Promise<void>;
  onToggleExpanded: () => void;
  pendingAction: string | null;
  row: ProductionEvidenceRow;
}) {
  const evidenceDate = row.submittedAt ?? row.completedAt;
  const submittedLabel =
    evidenceDate === undefined ? "Not dated" : formatDate(evidenceDate);
  const statusAlreadyReportsLocation = row.status
    .toLowerCase()
    .includes("location");
  const approveActionKey = `approve:${row.id}`;
  const requestInfoActionKey = `request-info:${row.id}`;

  return (
    <div
      className="px-4 py-4"
      data-testid={`production-evidence-row-${row.id}`}
    >
      <div className="grid gap-3 2xl:grid-cols-[minmax(0,1fr)_auto] 2xl:items-start">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={row.source === "builder" ? "info" : "success"}>
              {row.source === "builder" ? (
                <FileCheck2 aria-hidden="true" className="size-3" />
              ) : (
                <UserCheck aria-hidden="true" className="size-3" />
              )}
              {row.source === "builder" ? "Builder submitted" : "Site visit"}
            </Badge>
            <Badge variant={evidenceStatusVariant(row.status)}>
              {evidenceStatusLabel(row.status)}
            </Badge>
            {row.locationState === "unverified" &&
            !statusAlreadyReportsLocation ? (
              <Badge variant="warning">Location unverified</Badge>
            ) : row.locationState === "verified" ? (
              <Badge variant="success">Location verified</Badge>
            ) : null}
            <Badge size="sm" variant="outline">
              {row.assets.length} file{row.assets.length === 1 ? "" : "s"}
            </Badge>
          </div>
          <h4 className="mt-2 font-semibold text-sm">{row.milestoneName}</h4>
          <dl className="mt-2 grid gap-2 text-xs sm:grid-cols-3">
            <div>
              <dt className="text-muted-foreground">Milestone</dt>
              <dd className="font-medium">{row.milestoneKey}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">
                {row.source === "builder" ? "Submitted" : "Completed"}
              </dt>
              <dd className="font-medium tabular-nums">{submittedLabel}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Availability</dt>
              <dd className="font-medium tabular-nums">
                {row.amountCents === undefined
                  ? "Not set"
                  : formatCents(row.amountCents)}
              </dd>
            </div>
          </dl>
          {row.note ? (
            row.noteFormat === "html" ? (
              <FieldRichTextPreview
                ariaLabel={`${row.milestoneName} field report`}
                className="mt-3 max-w-3xl"
                value={row.note}
              />
            ) : (
              <p className="mt-3 max-w-3xl text-muted-foreground text-xs">
                {row.note}
              </p>
            )
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2 2xl:justify-end">
          <Button
            onClick={onToggleExpanded}
            size="sm"
            type="button"
            variant="outline"
          >
            <ChevronDown
              aria-hidden="true"
              className={cn(
                "size-4 transition-transform",
                expanded && "rotate-180"
              )}
            />
            {expanded ? "Hide evidence" : "View evidence"}
          </Button>
          <Button
            onClick={() => onOpenMilestone(row.milestoneKey)}
            size="sm"
            type="button"
            variant="outline"
          >
            <ExternalLink aria-hidden="true" className="size-4" />
            Open milestone
          </Button>
          {row.source === "builder" && actions?.reviewEvidence ? (
            <>
              <Button
                loading={pendingAction === approveActionKey}
                onClick={() => void onReviewEvidence(row, true)}
                size="sm"
                type="button"
                variant="default"
              >
                <CheckCircle2 aria-hidden="true" className="size-4" />
                Approve evidence
              </Button>
              <Button
                loading={pendingAction === requestInfoActionKey}
                onClick={() => void onReviewEvidence(row, false)}
                size="sm"
                type="button"
                variant="outline"
              >
                <MessageSquare aria-hidden="true" className="size-4" />
                Request info
              </Button>
            </>
          ) : null}
        </div>
      </div>
      {expanded ? <EvidenceAssetPackage row={row} /> : null}
    </div>
  );
}

function EvidenceAssetPackage({ row }: { row: ProductionEvidenceRow }) {
  return (
    <div
      className="mt-4 rounded-lg border bg-background/60 p-3"
      data-testid={`production-evidence-package-${row.id}`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="font-medium text-sm">Evidence package</p>
          <p className="text-muted-foreground text-xs">
            Files attached to {row.milestoneName}
          </p>
        </div>
        <Badge variant={row.assets.length > 0 ? "secondary" : "outline"}>
          {row.assets.length} file{row.assets.length === 1 ? "" : "s"}
        </Badge>
      </div>
      {row.assets.length === 0 ? (
        <p className="mt-4 rounded-md border border-dashed p-4 text-muted-foreground text-sm">
          No files are attached to this evidence package yet. The milestone
          claim is still visible for review, but there are no uploaded assets to
          inspect.
        </p>
      ) : (
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {row.assets.map((asset) => (
            <EvidenceAssetTile asset={asset} key={asset.evidenceKey} />
          ))}
        </div>
      )}
    </div>
  );
}

function EvidenceAssetTile({ asset }: { asset: ProductionEvidenceAsset }) {
  const canOpenAsset = isUsableEvidenceUrl(asset.previewUrl);
  return (
    <div
      className="min-w-0 rounded-lg border bg-card p-3"
      data-collaboration-focus={
        asset._id ? `evidenceAsset:${asset._id}` : undefined
      }
      data-testid={`production-evidence-asset-${asset.evidenceKey}`}
    >
      <div
        className="overflow-hidden rounded-md border bg-background"
        data-collaboration-focus={`evidencePackage:${asset.evidenceKey}`}
      >
        <EvidenceAssetPreview asset={asset} canOpenAsset={canOpenAsset} />
      </div>
      <div className="mt-3 min-w-0">
        <p className="truncate font-medium text-sm">{asset.label}</p>
        <p className="truncate text-muted-foreground text-xs">
          {asset.fileName}
        </p>
        <dl className="mt-3 grid grid-cols-2 gap-2 text-xs">
          <div>
            <dt className="text-muted-foreground">Type</dt>
            <dd className="truncate">{asset.mimeType}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Size</dt>
            <dd>{formatBytes(asset.sizeBytes)}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Tag</dt>
            <dd className="truncate">{asset.tag}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Location</dt>
            <dd>{asset.locationVerified ? "Verified" : "Unverified"}</dd>
          </div>
        </dl>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {canOpenAsset ? (
          <Button
            render={
              <a
                href={asset.previewUrl ?? ""}
                rel="noreferrer"
                target="_blank"
              />
            }
            size="sm"
            variant="outline"
          >
            <ExternalLink aria-hidden="true" className="size-4" />
            Open file
          </Button>
        ) : (
          <Button disabled size="sm" type="button" variant="outline">
            <ExternalLink aria-hidden="true" className="size-4" />
            File unavailable
          </Button>
        )}
      </div>
    </div>
  );
}

function EvidenceAssetPreview({
  asset,
  canOpenAsset,
}: {
  asset: ProductionEvidenceAsset;
  canOpenAsset: boolean;
}) {
  const isImage = asset.mimeType.startsWith("image/");
  const canRenderDirectly = isBrowserPreviewableImageMime(asset.mimeType);
  const needsHeicConversion = isHeicLikeEvidenceImage({
    fileName: asset.fileName,
    mimeType: asset.mimeType,
  });
  const shouldAutoPrepareHeic = needsHeicConversion && canOpenAsset;
  const [imageFailed, setImageFailed] = useState(false);
  const [imageLoading, setImageLoading] = useState(shouldAutoPrepareHeic);
  const [heicPreviewRequested, setHeicPreviewRequested] = useState(
    shouldAutoPrepareHeic
  );
  const [heicPreviewUrl, setHeicPreviewUrl] = useState<string | null>(null);
  const heicPreviewAbortRef = useRef<AbortController | null>(null);
  const heicObjectUrlRef = useRef<string | null>(null);
  const displayUrl =
    needsHeicConversion && canOpenAsset && heicPreviewRequested
      ? heicPreviewUrl
      : canRenderDirectly && canOpenAsset
        ? asset.previewUrl
        : null;

  useEffect(
    () => () => {
      heicPreviewAbortRef.current?.abort();
      if (heicObjectUrlRef.current) {
        URL.revokeObjectURL(heicObjectUrlRef.current);
      }
    },
    []
  );

  const requestHeicPreview = useCallback(async () => {
    heicPreviewAbortRef.current?.abort();
    if (heicObjectUrlRef.current) {
      URL.revokeObjectURL(heicObjectUrlRef.current);
      heicObjectUrlRef.current = null;
    }
    const controller = new AbortController();
    heicPreviewAbortRef.current = controller;
    setImageFailed(false);
    setImageLoading(true);
    setHeicPreviewRequested(true);
    setHeicPreviewUrl(null);

    try {
      const sourceProxyUrl = evidenceImageSourceUrl(asset.previewUrl);
      if (!sourceProxyUrl) {
        throw new Error("HEIC source proxy is unavailable.");
      }
      const response = await fetch(sourceProxyUrl, {
        signal: controller.signal,
      });
      if (!response.ok) {
        throw new Error("Unable to download the original HEIC image.");
      }
      const jpegBlob = await convertHeicEvidenceBlobToJpeg(
        await response.blob(),
        asset.fileName
      );
      if (controller.signal.aborted) {
        return;
      }
      const objectUrl = URL.createObjectURL(jpegBlob);
      heicObjectUrlRef.current = objectUrl;
      setHeicPreviewUrl(objectUrl);
    } catch {
      if (controller.signal.aborted) {
        return;
      }
      const serverFallbackUrl = evidenceImagePreviewUrl(asset.previewUrl);
      if (serverFallbackUrl) {
        setHeicPreviewUrl(serverFallbackUrl);
        return;
      }
      setImageFailed(true);
      setImageLoading(false);
    }
  }, [asset.fileName, asset.previewUrl]);

  useEffect(() => {
    if (shouldAutoPrepareHeic) {
      void requestHeicPreview();
    }
  }, [requestHeicPreview, shouldAutoPrepareHeic]);

  if (needsHeicConversion && canOpenAsset && !heicPreviewRequested) {
    return (
      <div className="flex aspect-[4/3] flex-col items-center justify-center gap-3 p-4 text-center">
        <ImageIcon
          aria-hidden="true"
          className="size-8 text-muted-foreground"
        />
        <div>
          <p className="font-medium text-sm">HEIC preview converts on demand</p>
          <p className="mt-1 max-w-52 text-muted-foreground text-xs">
            The original file is ready. Load the browser preview only when you
            need to inspect it.
          </p>
        </div>
        <Button
          onClick={() => {
            void requestHeicPreview();
          }}
          size="sm"
          type="button"
          variant="outline"
        >
          <ImageIcon aria-hidden="true" className="size-4" />
          Load preview
        </Button>
      </div>
    );
  }

  if (needsHeicConversion && imageLoading && !displayUrl) {
    return (
      <div
        aria-live="polite"
        className="flex aspect-[4/3] flex-col items-center justify-center gap-2 bg-muted/40 p-4 text-center text-muted-foreground"
      >
        <RefreshCw aria-hidden="true" className="size-5 animate-spin" />
        <p className="text-xs">Preparing HEIC preview…</p>
      </div>
    );
  }

  if (isImage && displayUrl && !imageFailed) {
    return (
      <div className="relative aspect-[4/3]">
        <img
          alt={asset.label}
          className={cn(
            "h-full w-full object-cover transition-opacity",
            imageLoading && "opacity-0"
          )}
          decoding="async"
          loading="lazy"
          onError={() => {
            setImageFailed(true);
            setImageLoading(false);
          }}
          onLoad={() => setImageLoading(false)}
          src={displayUrl}
        />
        {imageLoading ? (
          <div
            aria-live="polite"
            className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-muted/40 p-4 text-center text-muted-foreground"
          >
            <RefreshCw aria-hidden="true" className="size-5 animate-spin" />
            <p className="text-xs">Converting HEIC preview…</p>
          </div>
        ) : null}
      </div>
    );
  }
  return (
    <div className="flex aspect-[4/3] flex-col items-center justify-center gap-2 p-3 text-center text-muted-foreground">
      {isImage ? (
        <ImageIcon aria-hidden="true" className="size-8" />
      ) : (
        <FileText aria-hidden="true" className="size-8" />
      )}
      {needsHeicConversion ? (
        <>
          <div className="max-w-52 text-xs">
            The HEIC preview could not be converted. You can retry or open the
            original file.
          </div>
          {canOpenAsset ? (
            <Button
              onClick={() => {
                void requestHeicPreview();
              }}
              size="sm"
              type="button"
              variant="outline"
            >
              <RefreshCw aria-hidden="true" className="size-4" />
              Retry preview
            </Button>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

function ProductionBuildMaterialsTab({
  actions,
  detail,
  focusedReference,
}: {
  actions?: MaterialPlanningActions;
  detail: ProductionBuildDetail;
  focusedReference?: string;
}) {
  const submilestonesByMilestone = new Map<string, ProductionSubmilestone[]>();
  for (const submilestone of detail.submilestones) {
    const next = submilestonesByMilestone.get(submilestone.milestoneKey) ?? [];
    next.push(submilestone);
    submilestonesByMilestone.set(submilestone.milestoneKey, next);
  }
  const milestones = detail.milestones
    .slice()
    .sort((a, b) => a.order - b.order)
    .map((milestone) => ({
      budgetCents: milestone.budgetCents,
      key: milestone.key,
      name: milestone.name,
      order: milestone.order,
      submilestones: (submilestonesByMilestone.get(milestone.key) ?? [])
        .slice()
        .sort((a, b) => a.order - b.order)
        .map((submilestone) => ({
          key: submilestone.key,
          milestoneKey: submilestone.milestoneKey,
          name: submilestone.name,
          order: submilestone.order,
        })),
    }));

  return (
    <MaterialPlanningTab
      actions={actions}
      budgetTreatmentEnabled
      focusedItemId={
        focusedReference?.startsWith("material:")
          ? focusedReference.slice("material:".length)
          : undefined
      }
      items={detail.costItems ?? []}
      lockBudgetTreatment
      milestones={milestones}
      panelLayout="stacked"
      readOnly={!actions}
      scopeLabel="Active Build"
    />
  );
}

function ProductionCalendarTab({
  actions,
  calendarTimeframe,
  calendarWorkspace,
  detail,
  focusedReference,
  onChangeCalendarTimeframe,
  onChangeTab,
  onRequestSiteVisit,
  onStartWork,
  workosOrganizationId,
}: {
  actions?: ProductionBuildDetailActions;
  calendarTimeframe?: CalendarTimeframe;
  calendarWorkspace?: DrawFlowCalendarWorkspaceData | null;
  detail: ProductionBuildDetail;
  focusedReference?: string;
  onChangeCalendarTimeframe?: (timeframe: CalendarTimeframe) => void;
  onChangeTab: (tab: BuildDetailSubTab) => void;
  onRequestSiteVisit: (request: SiteVisitOrderRequest) => void;
  onStartWork?: (milestoneKey: string) => void;
  workosOrganizationId?: string;
}) {
  const drawByKey = useMemo(
    () => new Map(detail.draws.map((draw) => [draw.drawKey, draw])),
    [detail.draws]
  );
  const adapterActions = useMemo<ActiveBuildCalendarAdapterActions>(
    () => ({
      ...(actions?.approveDraw
        ? {
            approveDraw: (drawKey: string) => {
              const draw = drawByKey.get(drawKey);
              if (draw) {
                return actions.approveDraw?.(draw);
              }
            },
          }
        : {}),
      ...(actions?.approveMilestone
        ? {
            approveMilestone: (milestoneKey: string) =>
              actions.approveMilestone?.({ milestoneKey }),
          }
        : {}),
      ...(actions?.assignSiteVisit
        ? {
            assignSiteVisit: (milestoneKey: string) =>
              onRequestSiteVisit({ milestoneKey }),
          }
        : {}),
      cancelSiteVisit: actions?.cancelSiteVisit,
      ...(actions?.releaseDraw
        ? {
            releaseDraw: (drawKey: string) => {
              const draw = drawByKey.get(drawKey);
              if (draw) {
                return actions.releaseDraw?.(draw);
              }
            },
          }
        : {}),
      ...(actions?.requestDraw
        ? {
            requestDraw: (drawKey: string) => {
              const draw = drawByKey.get(drawKey);
              if (draw) {
                return actions.requestDraw?.(draw);
              }
            },
          }
        : {}),
      ...(actions?.requestLoanFacilityDateChange ||
      actions?.requestFacilityChange
        ? {
            requestLoanFacilityDateChange:
              actions?.requestLoanFacilityDateChange ??
              ((input: { reason: string; requestedPaybackDate: string }) =>
                actions?.requestFacilityChange?.({
                  reason: input.reason,
                  requestedPaybackDate: input.requestedPaybackDate,
                  requestType: "paybackExtension",
                })),
          }
        : {}),
      requestMilestoneInfo: actions?.requestMilestoneInfo,
      rescheduleSiteVisit: actions?.rescheduleSiteVisit,
      reviseMilestoneSchedule: actions?.reviseMilestoneSchedule,
      ...(actions?.scheduleSiteVisit || actions?.assignSiteVisit
        ? {
            scheduleSiteVisit: (input: SiteVisitOrderRequest) =>
              onRequestSiteVisit(input),
          }
        : {}),
      setAdminDecisionTargetDate: actions?.setAdminDecisionTargetDate,
      setDrawReleaseTargetDate: actions?.setDrawReleaseTargetDate,
      setEvidenceDueDate: actions?.setEvidenceDueDate,
      setReviewTargetDate: actions?.setReviewTargetDate,
      ...(onStartWork
        ? {
            startMilestoneWork: (milestoneKey: string) =>
              onStartWork(milestoneKey),
          }
        : {}),
    }),
    [actions, drawByKey, onRequestSiteVisit, onStartWork]
  );
  const effectiveWorkspace = useMemo(
    () =>
      calendarWorkspace ??
      buildActiveBuildCalendarWorkspaceFromDetail(detail, {
        organizationId: workosOrganizationId,
      }),
    [calendarWorkspace, detail, workosOrganizationId]
  );
  const focusedSiteVisitEventId = useMemo(() => {
    if (!focusedReference?.startsWith("siteVisit:")) {
      return;
    }
    const siteVisitId = focusedReference.slice("siteVisit:".length);
    const visit = detail.siteVisits?.find(
      (candidate) => candidate._id === siteVisitId
    );
    return visit ? `activeBuild:siteVisit:${visit.visitId}` : undefined;
  }, [detail.siteVisits, focusedReference]);
  const calendarActions = useMemo(
    () =>
      buildActiveBuildCalendarActions(adapterActions, {
        baseDate: detail.build.startDate,
      }),
    [adapterActions, detail.build.startDate]
  );
  const commitEdit = useMemo(
    () =>
      createActiveBuildCalendarEditHandler({
        actions: adapterActions,
        baseDate: detail.build.startDate,
      }),
    [adapterActions, detail.build.startDate]
  );

  return (
    <div data-testid="production-build-calendar">
      <CalendarWorkspace
        actions={calendarActions}
        initialSelectedEventId={focusedSiteVisitEventId}
        initialTimeframe={
          calendarTimeframe ?? effectiveWorkspace.defaultTimeframe
        }
        onCommitEdit={commitEdit}
        onCreateSyncSubscription={actions?.createCalendarSyncSubscription}
        onRecordExternalSyncChange={actions?.recordExternalCalendarSyncChange}
        onSaveView={actions?.saveCalendarView}
        onTimeframeChange={onChangeCalendarTimeframe}
        workspace={effectiveWorkspace}
      />
      <div className="sr-only">
        <button onClick={() => onChangeTab("timeline")} type="button">
          Jump to timeline
        </button>
        <button onClick={() => onChangeTab("gantt")} type="button">
          Jump to Gantt
        </button>
      </div>
    </div>
  );
}

function ProductionGanttTab({
  activeBuildId,
  actions,
  detail,
  onRequestSiteVisit,
  onStartWork,
  timelineWorkspace,
  viewerRole,
  workosOrganizationId,
}: {
  activeBuildId?: string;
  actions?: ProductionBuildDetailActions;
  detail: ProductionBuildDetail;
  onRequestSiteVisit: (request: SiteVisitOrderRequest) => void;
  onStartWork?: (milestoneKey: string) => void;
  timelineWorkspace?: ActiveBuildTimelineWorkspaceProps["workspace"] | null;
  viewerRole: "builder" | "lender";
  workosOrganizationId?: string;
}) {
  if (
    !(activeBuildId && workosOrganizationId) ||
    timelineWorkspace === undefined
  ) {
    return (
      <Frame data-testid="production-build-gantt-loading">
        <FramePanel className="grid min-h-[28rem] place-items-center p-6 text-muted-foreground text-sm">
          Loading production Gantt workspace...
        </FramePanel>
      </Frame>
    );
  }
  return (
    <div className="min-h-[42rem]" data-testid="production-build-gantt">
      <ActiveBuildGanttWorkspace
        buildId={activeBuildId as any}
        canApproveMilestones={Boolean(actions?.approveMilestone)}
        canRejectMilestones={Boolean(actions?.rejectMilestone)}
        detail={detail}
        onRequestSiteVisit={onRequestSiteVisit}
        onStartWork={onStartWork}
        timelineWorkspace={timelineWorkspace}
        viewerRole={viewerRole}
        workosOrganizationId={workosOrganizationId}
      />
    </div>
  );
}

function buildProductionKanbanCards(
  detail: ProductionBuildDetail,
  projection: ProductionBuildProjection,
  currentDay: number
): KanbanCardData[] {
  const drawByMilestone = new Map(
    projection.draws
      .filter((draw) => draw.milestoneKey)
      .map((draw) => [draw.milestoneKey as string, draw])
  );
  return projection.milestones.map((milestone) => {
    const draw = drawByMilestone.get(milestone.key);
    const submilestones =
      projection.submilestonesByMilestone.get(milestone.key) ?? [];
    const progressPercent =
      typeof milestone.normalizedProgressPercent === "number"
        ? clampPercent(milestone.normalizedProgressPercent)
        : submilestones.length > 0
          ? Math.round(
              (submilestones.filter((sub) => sub.status === "complete").length /
                submilestones.length) *
                100
            )
          : typeof milestone.progressPercent === "number"
            ? clampPercent(milestone.progressPercent)
            : milestone.status === "complete"
              ? 100
              : milestone.status === "in_progress"
                ? 50
                : 0;
    const state = resolveProductionMilestoneKanbanState({
      currentDay,
      draw,
      milestone,
      projection,
    });
    return {
      approvedValueCents: milestone.drawAvailabilityCents,
      code: milestone.key.toUpperCase(),
      column: state.column,
      contractors: contractorAssignmentsForMilestone(detail, milestone.key).map(
        (contractor) => ({
          initials: initialsFor(contractor.name),
          name: contractor.name,
        })
      ),
      drawGroupKey: draw?.drawKey ?? milestone.key,
      evidenceReviewStatus: milestone.evidenceState,
      forecastEndDate: addDaysSafe(detail.build.startDate, milestone.dayEnd),
      forecastStartDate: addDaysSafe(
        detail.build.startDate,
        milestone.dayStart
      ),
      milestoneId: milestone._id,
      milestoneKey: milestone.key,
      name: milestone.name,
      progressPercent,
      requestedAmountCents:
        draw?.status === "requested" ||
        draw?.status === "in_review" ||
        draw?.status === "ready_for_admin" ||
        draw?.status === "approved_for_release" ||
        draw?.status === "released"
          ? draw.amountCents
          : undefined,
      requiresSiteVisit:
        !isMilestoneApprovedForDrawAvailability(milestone) &&
        milestone.completionReview?.siteVisit?.status === "requested",
      status: state.status,
      submittedAt: draw?.requestedAt
        ? Date.parse(draw.requestedAt)
        : milestone.updatedAt,
      submilestones: submilestones.map((submilestone) => ({
        budgetCents: submilestone.budgetCents,
        durationDays: submilestone.durationDays,
        key: submilestone.key,
        name: submilestone.name,
        order: submilestone.order,
        startDay: submilestone.startDay,
        status:
          submilestone.status === "complete"
            ? "done"
            : submilestone.status === "in_progress"
              ? "in_progress"
              : "todo",
      })),
      type: "construction",
    };
  });
}

function resolveProductionMilestoneKanbanState({
  currentDay,
  draw,
  milestone,
  projection,
}: {
  currentDay: number;
  draw?: ProductionDraw;
  milestone: ProductionMilestone;
  projection: ProductionBuildProjection;
}): {
  canStartWork: boolean;
  column: KanbanColumn;
  status: string;
} {
  if (isMilestoneApprovedForDrawAvailability(milestone)) {
    return {
      canStartWork: false,
      column: "MarkedComplete",
      status: "completion_approved",
    };
  }
  if (milestone.completionReview?.siteVisit?.status === "requested") {
    return { canStartWork: false, column: "SiteVisit", status: "review" };
  }
  if (
    draw?.status === "requested" ||
    milestone.evidenceState === "Info requested"
  ) {
    return { canStartWork: false, column: "NeedsApproval", status: "review" };
  }
  if (milestone.completionClaim) {
    return {
      canStartWork: false,
      column: "MarkedComplete",
      status: "completion_requested",
    };
  }
  const dependenciesReady = productionMilestoneDependenciesSatisfied(
    milestone,
    projection
  );
  const hasStarted = productionMilestoneHasStartedWorkflow(milestone, draw);
  const isPastEnd = currentDay > milestone.dayEnd;
  if (isPastEnd) {
    return {
      canStartWork: !hasStarted,
      column: "BehindSchedule",
      status: hasStarted ? "in_progress_behind_schedule" : "blocked",
    };
  }
  if (hasStarted) {
    return {
      canStartWork: false,
      column: "InProgress",
      status: "in_progress_on_schedule",
    };
  }
  if (!dependenciesReady) {
    return {
      canStartWork: true,
      column: "Backlog",
      status: currentDay >= milestone.dayStart ? "blocked" : "planned",
    };
  }
  if (currentDay >= milestone.dayStart) {
    return {
      canStartWork: true,
      column: "InProgress",
      status: "ready_to_start",
    };
  }
  return { canStartWork: true, column: "Backlog", status: "planned" };
}

function productionMilestoneDependenciesSatisfied(
  milestone: ProductionMilestone,
  projection: ProductionBuildProjection
) {
  const byKey = new Map(projection.milestones.map((row) => [row.key, row]));
  return (milestone.dependencyKeys ?? []).every(
    (key) => byKey.get(key)?.status === "complete"
  );
}

function productionMilestoneHasStartedWorkflow(
  milestone: ProductionMilestone,
  draw?: ProductionDraw
) {
  if (milestone.status === "in_progress") {
    return true;
  }
  return Boolean(milestone.actualStartedAt ?? milestone.startedAt);
}

function buildMilestoneSheetData(
  detail: ProductionBuildDetail,
  projection: ProductionBuildProjection,
  milestoneKey: string,
  currentDay: number
): MilestoneSheetData | null {
  const milestone = projection.milestones.find(
    (row) => row.key === milestoneKey
  );
  if (!milestone) {
    return null;
  }
  const draw = projection.draws.find(
    (row) => row.milestoneKey === milestoneKey
  );
  const state = resolveProductionMilestoneKanbanState({
    currentDay,
    draw,
    milestone,
    projection,
  });
  const events = (detail.auditEvents ?? [])
    .filter((event) =>
      ["milestone", "evidence", "site_visit"].some((scope) =>
        event.eventType.includes(scope)
      )
    )
    .slice(0, 6)
    .map((event) => ({
      _id: event._id,
      actor: event.actorPersona,
      createdAt: event.createdAt,
      title: event.eventType.replace(/[._]/g, " "),
    }));
  const reviewStatus = stringFromRecord(milestone.completionReview, "status");
  const reviewNote = stringFromRecord(
    milestone.completionReview,
    "note"
  )?.trim();
  const reviewRequestedAt = stringFromRecord(
    milestone.completionReview,
    "reviewedAt"
  );
  const parsedReviewRequestedAt = reviewRequestedAt
    ? Date.parse(reviewRequestedAt)
    : Number.NaN;
  const completionSubmittedAt = stringFromRecord(
    milestone.completionClaim,
    "submittedAt"
  );
  const parsedSubmittedAt = completionSubmittedAt
    ? Date.parse(completionSubmittedAt)
    : Number.NaN;
  const sourceSubmilestones = detail.submilestones
    .filter((row) => row.milestoneKey === milestone.key)
    .sort((left, right) => left.order - right.order);
  const explicitBudgetCents = sourceSubmilestones.reduce(
    (sum, row) => sum + Math.max(0, row.budgetCents ?? 0),
    0
  );
  const missingBudgetCount = sourceSubmilestones.filter(
    (row) => !row.budgetCents || row.budgetCents <= 0
  ).length;
  const distributedBudgetCents = Math.round(
    Math.max(0, milestone.budgetCents - explicitBudgetCents) /
      Math.max(1, missingBudgetCount)
  );
  return {
    actualStartedAt: milestone.actualStartedAt,
    canStartWork: state.canStartWork,
    column: state.column,
    contractors: contractorAssignmentsForMilestone(detail, milestone.key).map(
      (contractor) => ({
        initials: initialsFor(contractor.name),
        name: contractor.name,
        role: contractor.role,
      })
    ),
    drawGroupKey: draw?.drawKey ?? milestone.key,
    currentDay,
    milestoneKey: milestone.key,
    name: milestone.name,
    plannedBudgetCents: milestone.budgetCents,
    plannedEndDate: addDaysSafe(detail.build.startDate, milestone.dayEnd),
    plannedStartDate: addDaysSafe(detail.build.startDate, milestone.dayStart),
    recentEvents: events,
    status: milestone.status,
    reviewRequest:
      reviewStatus === "revisionRequested" && reviewNote
        ? {
            note: reviewNote,
            ...(Number.isFinite(parsedReviewRequestedAt)
              ? { requestedAt: parsedReviewRequestedAt }
              : {}),
          }
        : undefined,
    requestedAmountCents:
      milestone.drawAvailabilityCents > 0
        ? milestone.drawAvailabilityCents
        : draw?.amountCents,
    submittedAt: Number.isFinite(parsedSubmittedAt)
      ? parsedSubmittedAt
      : undefined,
    submilestones: sourceSubmilestones.map((submilestone) => {
      const startDay =
        submilestone.startDay ??
        milestone.dayStart + Math.max(0, submilestone.order - 1);
      const durationDays = Math.max(1, submilestone.durationDays ?? 1);
      const assignments = (detail.milestoneContractorAssignments ?? [])
        .filter(
          (assignment) =>
            assignment.milestoneKey === milestone.key &&
            assignment.submilestoneKey === submilestone.key
        )
        .map((assignment) => ({
          actualCostCents: assignment.actualCostCents,
          actualHours: assignment.actualHours,
          agreedRateCents: assignment.agreedRateCents,
          agreedRateUnit: assignment.agreedRateUnit,
          contractorId: assignment.contractorId,
          costNotes: assignment.costNotes,
          estimatedCostCents: assignment.estimatedCostCents,
          estimatedHours: assignment.estimatedHours,
          name: assignment.contractor?.name ?? "Assigned contractor",
          role: assignment.role,
          status: assignment.status,
        }));
      const materials = (detail.costItems ?? [])
        .filter((item) =>
          item.relevantSubmilestoneKeys.includes(submilestone.key)
        )
        .map((item) => ({
          description: item.description,
          id: item._id,
          quantity: item.quantity,
          supplier: item.supplier,
          title: item.title,
          totalCents: materialPlanningItemTotal(item),
          type: item.itemType,
        }));
      const evidence = (detail.evidenceAssets ?? [])
        .filter(
          (asset) =>
            asset.milestoneKey === milestone.key &&
            asset.submilestoneKey === submilestone.key
        )
        .map((asset) => ({
          createdAt: asset.createdAt,
          evidenceKey: asset.evidenceKey,
          fileName: asset.fileName,
          label: asset.label,
          locationVerified: asset.locationVerified ?? false,
          mimeType: asset.mimeType,
          previewUrl: asset.previewUrl,
          sizeBytes: asset.sizeBytes,
          source: asset.source,
          tag: asset.tag,
        }));
      const siteVisits = (detail.siteVisits ?? [])
        .filter(
          (visit) =>
            visit.milestoneKey === milestone.key &&
            (visit.submilestoneKeys ?? []).includes(submilestone.key)
        )
        .map((visit) => ({
          completedAt: visit.completedAt,
          note: visit.note,
          recordNote: visit.recordNote,
          recordNoteFormat: visit.recordNoteFormat,
          requestedAt: visit.requestedAt,
          status: visit.status,
          visitId: visit.visitId,
        }));
      return {
        actualStartedAt: submilestone.actualStartedAt,
        actualCostCents: submilestone.actualCostCents,
        assignments,
        budgetCents:
          submilestone.budgetCents && submilestone.budgetCents > 0
            ? submilestone.budgetCents
            : distributedBudgetCents,
        completedAt: submilestone.completedAt,
        completedByWorkosUserId: submilestone.completedByWorkosUserId,
        description:
          materials.find((item) => item.description)?.description ??
          `Complete and document the ${submilestone.name.toLowerCase()} scope against the approved construction roadmap.`,
        endDate: addDaysSafe(
          detail.build.startDate,
          startDay + durationDays - 1
        ),
        evidence,
        fieldNote: submilestone.fieldNote,
        key: submilestone.key,
        materials,
        name: submilestone.name,
        order: submilestone.order,
        siteVisits,
        startDate: addDaysSafe(detail.build.startDate, startDay),
        status: submilestone.status,
      };
    }),
  };
}

function resolveProductionCurrentDay(
  detail: ProductionBuildDetail,
  timelineWorkspace?: ActiveBuildTimelineWorkspaceProps["workspace"] | null
) {
  const timelineDay = timelineWorkspace?.plan?.currentDay;
  if (typeof timelineDay === "number" && Number.isFinite(timelineDay)) {
    return Math.round(timelineDay);
  }
  return daysBetweenProductionDates(
    detail.build.startDate,
    new Date().toISOString()
  );
}

function daysBetweenProductionDates(startIso: string, endIso: string) {
  const parseDay = (value: string) => {
    const dayPart = value.includes("T") ? value.slice(0, 10) : value;
    const ms = Date.parse(`${dayPart}T00:00:00Z`);
    return Number.isFinite(ms) ? ms : Date.now();
  };
  return Math.max(
    0,
    Math.round((parseDay(endIso) - parseDay(startIso)) / 86_400_000)
  );
}

function clampPercent(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function buildProductionBuildProjection(
  detail: ProductionBuildDetail
): ProductionBuildProjection {
  const milestones = [...detail.milestones].sort((a, b) => a.order - b.order);
  const draws = [...detail.draws].sort((a, b) => a.order - b.order);
  const submilestones = [...detail.submilestones].sort(
    (a, b) => a.order - b.order
  );
  const submilestonesByMilestone = new Map<string, ProductionSubmilestone[]>();
  for (const submilestone of submilestones) {
    const list = submilestonesByMilestone.get(submilestone.milestoneKey) ?? [];
    list.push(submilestone);
    submilestonesByMilestone.set(submilestone.milestoneKey, list);
  }
  const maxDay = Math.max(
    60,
    ...milestones.map((milestone) => milestone.dayEnd + 14),
    ...draws.map((draw) => draw.timingDay + 14)
  );
  const calendarIsoDates = new Set<string>();
  for (const milestone of milestones) {
    calendarIsoDates.add(
      addDaysSafe(detail.build.startDate, milestone.dayStart)
    );
    calendarIsoDates.add(addDaysSafe(detail.build.startDate, milestone.dayEnd));
  }
  for (const draw of draws) {
    calendarIsoDates.add(addDaysSafe(detail.build.startDate, draw.timingDay));
  }

  return {
    calendarDates: [...calendarIsoDates].map(dateFromIso),
    draws,
    maxDay,
    milestones,
    submilestonesByMilestone,
  };
}

function buildCurrentBuildOverview(
  detail: ProductionBuildDetail,
  projection: ProductionBuildProjection,
  currentDay: number
): CurrentBuildOverview {
  const incompleteMilestones = projection.milestones.filter(
    (milestone) => !isMilestoneApprovedForDrawAvailability(milestone)
  );
  const behindSchedule = incompleteMilestones
    .filter((milestone) => currentDay > milestone.dayEnd)
    .sort(compareMilestonesMostOverdueFirst);
  const behindScheduleKeys = new Set(
    behindSchedule.map((milestone) => milestone.key)
  );
  const current = incompleteMilestones
    .filter(
      (milestone) =>
        !behindScheduleKeys.has(milestone.key) &&
        isCurrentActiveMilestone(milestone)
    )
    .sort(compareMilestonesMostRecentFirst);
  const currentKeys = new Set(current.map((milestone) => milestone.key));
  const next =
    incompleteMilestones
      .filter(
        (milestone) =>
          !(
            behindScheduleKeys.has(milestone.key) ||
            currentKeys.has(milestone.key)
          )
      )
      .sort(compareMilestonesScheduleFirst)[0] ?? null;
  const approvedMilestoneAvailabilityCents = projection.milestones
    .filter(isMilestoneApprovedForDrawAvailability)
    .reduce((sum, milestone) => sum + milestone.drawAvailabilityCents, 0);
  const committedDrawCents = projection.draws
    .filter((draw) => isCommittedDrawStatus(draw.status))
    .reduce((sum, draw) => sum + draw.amountCents, 0);
  const drawnCents = projection.draws
    .filter((draw) => draw.status === "released")
    .reduce((sum, draw) => sum + draw.amountCents, 0);
  const currentAvailabilityCents = Math.max(
    0,
    approvedMilestoneAvailabilityCents - committedDrawCents
  );
  const totalApprovedCents =
    detail.loanFacility?.principalCents ??
    detail.capitalPlan?.lenderDrawPolicyLimitCents ??
    detail.build.totalBudgetCents;
  const upcomingDraw = resolveUpcomingDraw(projection.draws);
  const requestableAmountCents =
    upcomingDraw && isRequestableDrawStatus(upcomingDraw.status)
      ? Math.min(upcomingDraw.amountCents, currentAvailabilityCents)
      : 0;

  return {
    committedDrawCents,
    currentAvailabilityCents,
    drawnCents,
    milestoneHorizon: {
      behindSchedule,
      current,
      next,
    },
    percentComplete: buildPercentComplete(projection.milestones),
    requestableAmountCents,
    totalApprovedCents,
    upcomingDraw,
  };
}

function compareMilestonesMostOverdueFirst(
  left: ProductionMilestone,
  right: ProductionMilestone
): number {
  return left.dayEnd - right.dayEnd || left.order - right.order;
}

function compareMilestonesScheduleFirst(
  left: ProductionMilestone,
  right: ProductionMilestone
): number {
  return left.dayStart - right.dayStart || left.order - right.order;
}

function compareMilestonesMostRecentFirst(
  left: ProductionMilestone,
  right: ProductionMilestone
): number {
  const scoreDelta =
    milestoneRecentActivityScore(right) - milestoneRecentActivityScore(left);
  if (scoreDelta !== 0) {
    return scoreDelta;
  }
  return right.order - left.order;
}

function milestoneRecentActivityScore(milestone: ProductionMilestone): number {
  const submittedAt = stringFromRecord(
    milestone.completionClaim,
    "submittedAt"
  );
  const reviewedAt = stringFromRecord(milestone.completionReview, "reviewedAt");
  const parsedDates = [submittedAt, reviewedAt]
    .map((value) => (value ? Date.parse(value) : Number.NaN))
    .filter(Number.isFinite);
  if (parsedDates.length > 0) {
    return Math.max(...parsedDates);
  }
  if (typeof milestone.updatedAt === "number") {
    return milestone.updatedAt;
  }
  return milestone.dayEnd;
}

function isCurrentActiveMilestone(milestone: ProductionMilestone): boolean {
  return (
    milestone.status === "in_progress" ||
    milestoneHasPendingCompletionClaim(milestone)
  );
}

function milestoneHasPendingCompletionClaim(
  milestone: ProductionMilestone
): boolean {
  const reviewStatus = stringFromRecord(milestone.completionReview, "status");
  return (
    milestone.status !== "complete" &&
    Boolean(milestone.completionClaim) &&
    reviewStatus !== "approved"
  );
}

function isMilestoneApprovedForDrawAvailability(
  milestone: ProductionMilestone
): boolean {
  return (
    milestone.status === "complete" ||
    stringFromRecord(milestone.completionReview, "status") === "approved"
  );
}

function isCommittedDrawStatus(status: ProductionDrawStatus): boolean {
  return (
    status === "requested" ||
    status === "in_review" ||
    status === "ready_for_admin" ||
    status === "approved_for_release" ||
    status === "released"
  );
}

function isRequestableDrawStatus(
  status: ProductionDrawStatus | undefined
): boolean {
  return status === "planned" || status === "rejected";
}

function resolveUpcomingDraw(draws: ProductionDraw[]): ProductionDraw | null {
  return (
    draws
      .filter(
        (draw) => draw.status !== "released" && draw.status !== "cancelled"
      )
      .slice()
      .sort((a, b) => {
        const statusDelta =
          upcomingDrawStatusPriority(a.status) -
          upcomingDrawStatusPriority(b.status);
        if (statusDelta !== 0) {
          return statusDelta;
        }
        if (a.order !== b.order) {
          return a.order - b.order;
        }
        return a.timingDay - b.timingDay;
      })[0] ?? null
  );
}

function compareDrawsMostRecentFirst(
  left: ProductionDraw,
  right: ProductionDraw
): number {
  const scoreDelta =
    drawRecentActivityScore(right) - drawRecentActivityScore(left);
  if (scoreDelta !== 0) {
    return scoreDelta;
  }
  return right.order - left.order;
}

function drawRecentActivityScore(draw: ProductionDraw): number {
  const activityDates = [
    draw.releasedAt,
    draw.releaseDate,
    draw.reviewedAt,
    draw.requestedAt,
  ]
    .map((value) => (value ? Date.parse(value) : Number.NaN))
    .filter(Number.isFinite);
  if (activityDates.length > 0) {
    return Math.max(...activityDates);
  }
  return draw.timingDay;
}

function compareDrawsScheduleFirst(
  left: ProductionDraw,
  right: ProductionDraw
): number {
  if (left.order !== right.order) {
    return left.order - right.order;
  }
  return left.timingDay - right.timingDay;
}

function siteVisitsForMilestone(
  detail: ProductionBuildDetail,
  milestone: ProductionMilestone
): ProductionSiteVisit[] {
  const visits = (detail.siteVisits ?? []).filter(
    (visit) => visit.milestoneKey === milestone.key
  );
  const reviewedVisit = siteVisitFromCompletionReview(
    milestone.completionReview
  );
  const merged = new Map<string, ProductionSiteVisit>();
  if (reviewedVisit) {
    const visitId = reviewedVisit.visitId ?? milestone.key;
    merged.set(visitId, {
      milestoneKey: milestone.key,
      requestedAt: reviewedVisit.requestedAt ?? reviewedVisit.completedAt ?? "",
      requestedDay: reviewedVisit.requestedDay ?? milestone.dayEnd,
      status: reviewedVisit.status ?? "requested",
      visitId,
      ...(reviewedVisit._id ? { _id: reviewedVisit._id } : {}),
      ...(reviewedVisit.completedAt
        ? { completedAt: reviewedVisit.completedAt }
        : {}),
      ...(reviewedVisit.note ? { note: reviewedVisit.note } : {}),
      ...(reviewedVisit.recordNote
        ? { recordNote: reviewedVisit.recordNote }
        : {}),
      ...(reviewedVisit.recordNoteFormat
        ? { recordNoteFormat: reviewedVisit.recordNoteFormat }
        : {}),
      ...(reviewedVisit.requestedTime
        ? { requestedTime: reviewedVisit.requestedTime }
        : {}),
      ...(reviewedVisit.tokenConsumedAt
        ? { tokenConsumedAt: reviewedVisit.tokenConsumedAt }
        : {}),
      ...(reviewedVisit.tokenExpiresAt
        ? { tokenExpiresAt: reviewedVisit.tokenExpiresAt }
        : {}),
      ...(reviewedVisit.tokenOpenedAt
        ? { tokenOpenedAt: reviewedVisit.tokenOpenedAt }
        : {}),
      ...(reviewedVisit.url ? { url: reviewedVisit.url } : {}),
    });
  }
  // Canonical site-visit rows must win over the completion-review snapshot.
  // Otherwise a stale "requested" snapshot can overwrite a newly cancelled
  // visit and leave the lender interface looking active after the mutation.
  for (const visit of visits) {
    merged.set(siteVisitIdentity(visit), visit);
  }
  return [...merged.values()]
    .filter((visit) => visit.status !== "cancelled")
    .sort(
      (a, b) =>
        siteVisitRecentActivityScore(b) - siteVisitRecentActivityScore(a)
    );
}

function siteVisitIdentity(visit: ProductionSiteVisit) {
  return visit.visitId ?? visit._id ?? `${visit.milestoneKey}-visit`;
}

function siteVisitRecentActivityScore(visit: ProductionSiteVisit): number {
  if (visit.completedAt) {
    const completed = Date.parse(visit.completedAt);
    if (Number.isFinite(completed)) {
      return completed;
    }
  }
  if (typeof visit.tokenOpenedAt === "number") {
    return visit.tokenOpenedAt;
  }
  if (typeof visit.updatedAt === "number") {
    return visit.updatedAt;
  }
  const requested = Date.parse(visit.requestedAt);
  if (Number.isFinite(requested)) {
    return requested;
  }
  return typeof visit.createdAt === "number" ? visit.createdAt : 0;
}

function siteVisitStateLabel(visit: ProductionSiteVisit): string {
  if (visit.status === "complete") {
    return "Site visit completed";
  }
  if (visit.status === "cancelled") {
    return "Site visit cancelled";
  }
  if (visit.tokenOpenedAt) {
    return "Site visit in progress";
  }
  return "Site visit ordered";
}

function siteVisitTokenStateLabel(visit: ProductionSiteVisit): string {
  if (visit.status === "complete" || visit.tokenConsumedAt) {
    return "Consumed";
  }
  if (visit.status === "cancelled") {
    return "Cancelled";
  }
  if (visit.tokenExpiresAt && visit.tokenExpiresAt <= Date.now()) {
    return "Expired";
  }
  if (visit.tokenOpenedAt) {
    return "Opened";
  }
  return "Active";
}

function formatSiteVisitDateTime(value?: string | number): string {
  if (value === undefined || value === null || value === "") {
    return "-";
  }
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) {
    return "-";
  }
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function siteVisitBadgeVariant(
  visit: ProductionSiteVisit
): React.ComponentProps<typeof Badge>["variant"] {
  if (visit.status === "complete") {
    return "success";
  }
  if (visit.status === "cancelled") {
    return "destructive";
  }
  return visit.tokenOpenedAt ? "warning" : "info";
}

function upcomingDrawStatusPriority(status: ProductionDrawStatus): number {
  if (status === "planned" || status === "rejected") {
    return 0;
  }
  if (status === "requested") {
    return 1;
  }
  if (status === "in_review") {
    return 2;
  }
  if (status === "ready_for_admin") {
    return 3;
  }
  if (status === "approved_for_release") {
    return 4;
  }
  return 5;
}

function buildPercentComplete(milestones: ProductionMilestone[]): number {
  const completed = milestones.filter(
    (milestone) => milestone.status === "complete"
  ).length;
  return milestones.length > 0
    ? Math.round((completed / milestones.length) * 100)
    : 0;
}

function milestoneProgressPercent(
  milestone: ProductionMilestone,
  submilestones: ProductionSubmilestone[]
): number {
  if (typeof milestone.normalizedProgressPercent === "number") {
    return clampPercent(milestone.normalizedProgressPercent);
  }
  if (typeof milestone.progressPercent === "number") {
    return clampPercent(milestone.progressPercent);
  }
  if (submilestones.length > 0) {
    return clampPercent(
      (submilestones.filter(
        (submilestone) => submilestone.status === "complete"
      ).length /
        submilestones.length) *
        100
    );
  }
  if (milestone.status === "complete") {
    return 100;
  }
  return milestone.status === "in_progress" ? 50 : 0;
}

function addDaysSafe(isoDate: string, days: number): string {
  const base = dateFromIso(isoDate);
  if (Number.isNaN(base.valueOf())) {
    return isoDate;
  }
  const next = new Date(base);
  next.setDate(base.getDate() + days);
  return next.toISOString().slice(0, 10);
}

function dateFromIso(isoDate: string): Date {
  const [year, month, day] = isoDate.split("-").map(Number);
  if (!(year && month && day)) {
    return new Date(isoDate);
  }
  return new Date(year, month - 1, day);
}

function statusLabel(status: ProductionBuildStatus): string {
  return status.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function drawStatusLabel(status: ProductionDrawStatus): string {
  switch (status) {
    case "approved_for_release":
      return "Approved for release";
    case "in_review":
      return "In review";
    case "ready_for_admin":
      return "Ready for admin";
    case "rejected":
      return "Rejected";
    case "cancelled":
      return "Cancelled";
    case "requested":
      return "Requested";
    case "released":
      return "Released";
    default:
      return "Planned";
  }
}

function buildBuilderEvidenceRows(
  detail: ProductionBuildDetail,
  projection: ProductionBuildProjection
): ProductionEvidenceRow[] {
  const drawByMilestone = new Map(
    projection.draws
      .filter((draw) => draw.milestoneKey)
      .map((draw) => [draw.milestoneKey as string, draw])
  );
  return projection.milestones.flatMap((milestone) => {
    const assets = evidenceAssetsForMilestone(detail, milestone.key).filter(
      (asset) => !isSiteVisitEvidenceAsset(asset)
    );
    if (!hasBuilderSubmittedEvidence(milestone) && assets.length === 0) {
      return [];
    }
    const claim = milestone.completionClaim;
    const review = milestone.completionReview;
    const evidenceReview =
      review?.evidenceReview &&
      typeof review.evidenceReview === "object" &&
      !Array.isArray(review.evidenceReview)
        ? (review.evidenceReview as Record<string, unknown>)
        : undefined;
    const completedDay = numberFromRecord(claim, "completedDay");
    const submittedAt =
      stringFromRecord(claim, "submittedAt") ??
      stringFromRecord(review, "reviewedAt") ??
      (completedDay === undefined
        ? undefined
        : addDaysSafe(detail.build.startDate, completedDay));
    const note =
      stringFromRecord(claim, "note") ?? stringFromRecord(review, "note");
    const status =
      evidenceReview?.accepted === true
        ? "Accepted"
        : evidenceReview?.accepted === false
          ? "Info requested"
          : (stringFromRecord(review, "status") ??
            milestone.evidenceState ??
            "Submitted");
    const row: ProductionEvidenceRow = {
      amountCents:
        drawByMilestone.get(milestone.key)?.amountCents ??
        milestone.drawAvailabilityCents,
      assets,
      id: `builder-${milestone.key}`,
      locationState: evidenceLocationState(detail, milestone.key),
      milestoneKey: milestone.key,
      milestoneName: milestone.name,
      note,
      source: "builder",
      status,
      submittedAt,
    };
    return [row];
  });
}

function buildCompletedSiteVisitRows(
  detail: ProductionBuildDetail,
  projection: ProductionBuildProjection
): ProductionEvidenceRow[] {
  const milestoneByKey = new Map(
    projection.milestones.map((milestone) => [milestone.key, milestone])
  );
  const drawByMilestone = new Map(
    projection.draws
      .filter((draw) => draw.milestoneKey)
      .map((draw) => [draw.milestoneKey as string, draw])
  );
  const rows = new Map<string, ProductionEvidenceRow>();
  const addVisit = (visit: ProductionSiteVisit) => {
    if (visit.status !== "complete") {
      return;
    }
    const milestone = milestoneByKey.get(visit.milestoneKey);
    const key = visit.visitId || visit._id || visit.milestoneKey;
    const assets = siteVisitEvidenceAssetsForVisit(detail, visit);
    rows.set(key, {
      amountCents:
        drawByMilestone.get(visit.milestoneKey)?.amountCents ??
        milestone?.drawAvailabilityCents,
      assets,
      completedAt: visit.completedAt,
      id: `site-visit-${key}`,
      locationState: evidenceLocationState(detail, visit.milestoneKey, assets),
      milestoneKey: visit.milestoneKey,
      milestoneName: milestone?.name ?? visit.milestoneKey,
      note: visit.recordNote ?? visit.note,
      noteFormat: visit.recordNote ? visit.recordNoteFormat : undefined,
      source: "site_visit",
      status: visit.status,
      submittedAt: visit.requestedAt,
    });
  };

  for (const visit of detail.siteVisits ?? []) {
    addVisit(visit);
  }
  for (const milestone of projection.milestones) {
    const siteVisit = siteVisitFromCompletionReview(milestone.completionReview);
    if (siteVisit?.status === "complete") {
      addVisit({
        milestoneKey: milestone.key,
        requestedAt: siteVisit.requestedAt ?? siteVisit.completedAt ?? "",
        requestedDay: siteVisit.requestedDay ?? milestone.dayEnd,
        status: siteVisit.status,
        visitId: siteVisit.visitId ?? milestone.key,
        ...(siteVisit.completedAt
          ? { completedAt: siteVisit.completedAt }
          : {}),
        ...(siteVisit.note ? { note: siteVisit.note } : {}),
        ...(siteVisit.recordNote ? { recordNote: siteVisit.recordNote } : {}),
        ...(siteVisit.recordNoteFormat
          ? { recordNoteFormat: siteVisit.recordNoteFormat }
          : {}),
        ...(siteVisit.tokenExpiresAt
          ? { tokenExpiresAt: siteVisit.tokenExpiresAt }
          : {}),
      });
    }
  }
  return [...rows.values()].sort((a, b) =>
    (b.completedAt ?? b.submittedAt ?? "").localeCompare(
      a.completedAt ?? a.submittedAt ?? ""
    )
  );
}

function hasBuilderSubmittedEvidence(milestone: ProductionMilestone) {
  if (milestone.completionClaim) {
    return true;
  }
  const state = String(milestone.evidenceState ?? "").toLowerCase();
  if (!state) {
    return false;
  }
  return !["draft package", "not started", "planned"].includes(state);
}

function evidenceLocationState(
  detail: ProductionBuildDetail,
  milestoneKey: string,
  scopedAssets = evidenceAssetsForMilestone(detail, milestoneKey)
): ProductionEvidenceRow["locationState"] {
  if (scopedAssets.some((asset) => asset.locationVerified === false)) {
    return "unverified";
  }
  if (scopedAssets.some((asset) => asset.locationVerified === true)) {
    return "verified";
  }
  const relatedPhotos = (detail.sitePhotos ?? []).filter((photo) =>
    [photo.caption, photo.evidenceKey]
      .filter(Boolean)
      .some((value) =>
        String(value).toLowerCase().includes(milestoneKey.toLowerCase())
      )
  );
  if (relatedPhotos.some((photo) => photo.locationVerified === false)) {
    return "unverified";
  }
  if (relatedPhotos.some((photo) => photo.locationVerified === true)) {
    return "verified";
  }
  return;
}

function evidenceAssetsForMilestone(
  detail: ProductionBuildDetail,
  milestoneKey: string
) {
  return (detail.evidenceAssets ?? []).filter(
    (asset) => asset.milestoneKey === milestoneKey
  );
}

function siteVisitEvidenceAssetsForVisit(
  detail: ProductionBuildDetail,
  visit: ProductionSiteVisit
) {
  const milestoneAssets = evidenceAssetsForMilestone(
    detail,
    visit.milestoneKey
  );
  const visitId = visit.visitId ?? visit._id;
  const visitAssets = milestoneAssets.filter((asset) => {
    const source = String(asset.source ?? "");
    return (
      isSiteVisitEvidenceAsset(asset) &&
      (!visitId || source.includes(String(visitId)))
    );
  });
  if (visitAssets.length > 0) {
    return visitAssets;
  }
  return milestoneAssets.filter(isSiteVisitEvidenceAsset);
}

function isSiteVisitEvidenceAsset(asset: ProductionEvidenceAsset) {
  return String(asset.source ?? "")
    .toLowerCase()
    .includes("site_visit");
}

function isUsableEvidenceUrl(url?: string | null) {
  if (!url) {
    return false;
  }
  return !(
    url.startsWith("production-evidence://") ||
    url.startsWith("production-build://")
  );
}

function evidenceImagePreviewUrl(url?: string | null) {
  if (!url) {
    return null;
  }
  const siteUrl = import.meta.env.VITE_CONVEX_SITE_URL;
  if (!siteUrl) {
    return null;
  }
  return `${siteUrl}/evidence-image-preview?url=${encodeURIComponent(url)}`;
}

function evidenceImageSourceUrl(url?: string | null) {
  if (!url) {
    return null;
  }
  const siteUrl = import.meta.env.VITE_CONVEX_SITE_URL;
  if (!siteUrl) {
    return null;
  }
  return `${siteUrl}/evidence-image-source?url=${encodeURIComponent(url)}`;
}

function formatBytes(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return "0 B";
  }
  const units = ["B", "KB", "MB", "GB"] as const;
  const exponent = Math.min(
    Math.floor(Math.log(bytes) / Math.log(1024)),
    units.length - 1
  );
  const value = bytes / 1024 ** exponent;
  return `${value >= 10 || exponent === 0 ? Math.round(value) : value.toFixed(1)} ${units[exponent]}`;
}

function evidenceStatusLabel(status: string): string {
  if (!status) {
    return "Submitted";
  }
  return status
    .replace(/_/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function evidenceStatusVariant(
  status: string
): React.ComponentProps<typeof Badge>["variant"] {
  const normalized = status.toLowerCase();
  if (
    normalized.includes("approved") ||
    normalized.includes("accepted") ||
    normalized === "complete"
  ) {
    return "success";
  }
  if (
    normalized.includes("rejected") ||
    normalized.includes("failed") ||
    normalized.includes("declined")
  ) {
    return "destructive";
  }
  if (
    normalized.includes("info") ||
    normalized.includes("revision") ||
    normalized.includes("unverified") ||
    normalized.includes("requested")
  ) {
    return "warning";
  }
  if (normalized.includes("submitted") || normalized.includes("claim")) {
    return "info";
  }
  return "outline";
}

function evidenceStatusIsAccepted(status: string): boolean {
  const normalized = status.toLowerCase();
  return (
    normalized.includes("approved") ||
    normalized.includes("accepted") ||
    normalized === "complete"
  );
}

function stringFromRecord(
  value: Record<string, unknown> | undefined,
  key: string
) {
  const raw = value?.[key];
  return typeof raw === "string" && raw.trim() ? raw : undefined;
}

function numberFromRecord(
  value: Record<string, unknown> | undefined,
  key: string
) {
  const raw = value?.[key];
  return typeof raw === "number" && Number.isFinite(raw) ? raw : undefined;
}

function siteVisitFromCompletionReview(
  review: Record<string, any> | undefined
): Partial<ProductionSiteVisit> | null {
  const raw = review?.siteVisit;
  return raw && typeof raw === "object" ? raw : null;
}

function statusBadgeVariant(
  status: ProductionBuildStatus
): React.ComponentProps<typeof Badge>["variant"] {
  if (status === "completed") {
    return "success";
  }
  if (status === "paused") {
    return "warning";
  }
  return "info";
}

function drawBadgeVariant(
  status: ProductionDrawStatus
): React.ComponentProps<typeof Badge>["variant"] {
  if (status === "released") {
    return "success";
  }
  if (status === "requested") {
    return "warning";
  }
  if (status === "in_review") {
    return "info";
  }
  if (status === "ready_for_admin" || status === "approved_for_release") {
    return "info";
  }
  if (status === "rejected") {
    return "destructive";
  }
  return "outline";
}

function contractorAssignmentsForMilestone(
  detail: ProductionBuildDetail,
  milestoneKey: string
) {
  const profileById = new Map<string, { name: string; trades?: string[] }>();
  for (const contractor of detail.contractors ?? []) {
    profileById.set(contractor.contractorId ?? contractor._id, contractor);
  }
  for (const contractor of detail.availableContractors ?? []) {
    profileById.set(contractor._id, contractor);
  }

  return (detail.milestoneContractorAssignments ?? [])
    .filter((assignment) => assignment.milestoneKey === milestoneKey)
    .map((assignment) => {
      const profile =
        assignment.contractor ??
        profileById.get(String(assignment.contractorId));
      const submilestoneName = assignment.submilestoneKey
        ? submilestoneNameFor(detail, milestoneKey, assignment.submilestoneKey)
        : undefined;
      return {
        name: profile?.name ?? "Assigned contractor",
        role: submilestoneName
          ? `${assignment.role} · ${submilestoneName}`
          : assignment.role,
      };
    });
}

function submilestoneNameFor(
  detail: ProductionBuildDetail,
  milestoneKey: string,
  submilestoneKey: string
) {
  return (
    detail.submilestones.find(
      (submilestone) =>
        submilestone.milestoneKey === milestoneKey &&
        submilestone.key === submilestoneKey
    )?.name ?? submilestoneKey
  );
}

function contractorAssignmentOptions(detail: ProductionBuildDetail) {
  const byId = new Map<
    string,
    {
      _id: string;
      city?: string;
      defaultPayRateCents?: number;
      defaultPayRateUnit?: "hour" | "day" | "fixed";
      email?: string;
      name: string;
      onboardingStatus?: "profile_only" | "invited" | "account_linked";
      trades?: string[];
    }
  >();
  for (const contractor of detail.contractors ?? []) {
    const id = contractor.contractorId ?? contractor._id;
    byId.set(id, {
      _id: id,
      city: contractor.city,
      defaultPayRateCents:
        contractor.payRateCents ??
        contractor.agreedRateCents ??
        contractor.defaultPayRateCents ??
        contractor.hourlyRateCents,
      defaultPayRateUnit:
        contractor.payRateUnit ??
        contractor.agreedRateUnit ??
        contractor.defaultPayRateUnit,
      email: contractor.email,
      name: contractor.name,
      onboardingStatus: contractor.onboardingStatus,
      trades: contractor.trades,
    });
  }
  for (const contractor of detail.availableContractors ?? []) {
    byId.set(contractor._id, {
      _id: contractor._id,
      city: contractor.city,
      defaultPayRateCents: contractor.defaultPayRateCents,
      defaultPayRateUnit: contractor.defaultPayRateUnit,
      email: contractor.email,
      name: contractor.name,
      onboardingStatus: contractor.onboardingStatus,
      trades: contractor.trades,
    });
  }
  return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name));
}
