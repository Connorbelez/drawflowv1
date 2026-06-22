"use client";

import {
  ChevronDown,
  CheckCircle2,
  ClipboardCheck,
  ExternalLink,
  FileCheck2,
  FileText,
  ImageIcon,
  MapPin,
  MessageSquare,
  Pencil,
  ScrollText,
  UserCheck,
} from "lucide-react";
import type * as React from "react";
import { useEffect, useMemo, useState } from "react";

import { GoogleAddressAutocomplete } from "#/components/address/GoogleAddressAutocomplete.tsx";
import { FieldRichTextPreview } from "#/components/rich-text/field-rich-text.tsx";
import { Badge } from "#/components/ui/badge.tsx";
import { Button } from "#/components/ui/button.tsx";
import {
  Card,
  CardContent,
  CardHeader,
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
import { Textarea } from "#/components/ui/textarea.tsx";
import {
  BuildPermitViewerDrawer,
  firstPermitDocument,
} from "#/features/build-permit-viewer/BuildPermitViewerDrawer.tsx";
import { CalendarWorkspace } from "#/features/calendar-workspace/CalendarWorkspace.tsx";
import {
  buildActiveBuildCalendarActions,
  buildActiveBuildCalendarWorkspaceFromDetail,
  createActiveBuildCalendarEditHandler,
  type ActiveBuildCalendarAdapterActions,
} from "#/features/calendar-workspace/adapters/activeBuildCalendarAdapter.ts";
import type {
  CalendarFilters,
  CalendarSyncSubscriptionResult,
  CalendarTimeframe,
  DrawFlowCalendarWorkspaceData,
} from "#/features/calendar-workspace/calendarTypes.ts";
import {
  ContractorQuickAddDrawer,
  type ContractorAssignmentCostDraft,
  type ContractorProfileDraft,
} from "#/features/contractors/ContractorQuickAddDrawer.tsx";
import {
  MaterialPlanningTab,
  type MaterialPlanningActions,
  type MaterialPlanningItem,
} from "#/features/material-planning/MaterialPlanningTab.tsx";
import type { BuilderStaffAppPermissions } from "#/features/builder-staff/app-permissions.ts";
import {
  isBrowserPreviewableImageMime,
  isHeicLikeEvidenceImage,
} from "#/lib/evidence-image-normalization.ts";
import { createGoogleSatelliteMapUrl } from "#/lib/google-maps.ts";
import { cn } from "#/lib/utils.ts";
import { BuildDetailTabBar, type BuildDetailSubTab } from "./BuildDetailTabs";
import { ActiveBuildGanttWorkspace } from "./ActiveBuildGanttWorkspace";
import {
  ActiveBuildTimelineWorkspace,
  type ActiveBuildTimelineWorkspaceProps,
} from "./ActiveBuildTimelineWorkspace";
import { ContractorsCard } from "./ContractorsCard";
import { EventRailSheet } from "./EventRail";
import {
  type KanbanCardData,
  type KanbanColumn,
  MilestoneKanban,
} from "./MilestoneKanban";
import {
  type MilestoneSheetData,
  MilestoneDetailSheet,
} from "./MilestoneDetailSheet";
import { SitePhotoCarousel } from "./SitePhotoCarousel";
import { formatCents, formatDate, initialsFor } from "./format";

type ProductionBuildStatus = "active" | "paused" | "completed" | string;
type ProductionMilestoneStatus = "planned" | "in_progress" | "complete";
type ProductionDrawStatus =
  | "planned"
  | "requested"
  | "approved"
  | "rejected"
  | "released";

export interface ProductionBuildDetailActions {
  addDocument?: (input: {
    documentType: "permit" | "budget" | "plan" | "supporting";
    fileName: string;
  }) => Promise<unknown> | unknown;
  addNote?: (input: {
    body: string;
    visibility: "internal" | "public";
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
  }) => Promise<unknown> | unknown;
  attachContractor?: (input: {
    contractorId: string;
    role: string;
  }) => Promise<unknown> | unknown;
  createAndAttachContractor?: (input: {
    contractor: ContractorProfileDraft;
    role: string;
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
  }) => Promise<unknown> | unknown;
  rejectDraw?: (draw: ProductionDraw) => Promise<unknown> | unknown;
  rejectMilestone?: (input: {
    milestoneKey: string;
  }) => Promise<unknown> | unknown;
  releaseDraw?: (draw: ProductionDraw) => Promise<unknown> | unknown;
  cancelSiteVisit?: (input: {
    reason: string;
    visitId: string;
  }) => Promise<unknown> | unknown;
  createCalendarSyncSubscription?: (input: {
    direction: "bidirectional" | "outbound";
    filters: CalendarFilters;
    provider: "google" | "ics" | "outlook";
    surface: "activeBuild" | "proposal";
  }) =>
    | Promise<CalendarSyncSubscriptionResult>
    | CalendarSyncSubscriptionResult
    | void;
  recordExternalCalendarSyncChange?: (input: {
    changeKey: string;
    externalEventId?: string;
    payload: unknown;
    provider: "google" | "ics" | "outlook";
    subscriptionKey?: string;
  }) => Promise<unknown> | unknown;
  rescheduleSiteVisit?: (input: {
    reason: string;
    requestedDay: number;
    requestedTime?: string;
    visitId: string;
  }) => Promise<unknown> | unknown;
  reviseMilestoneSchedule?: (input: {
    dayEnd: number;
    dayStart: number;
    milestoneKey: string;
    reason: string;
  }) => Promise<unknown> | unknown;
  requestFacilityChange?: (input: {
    reason?: string;
    requestedPaybackDate?: string;
    requestedPrincipalCents?: number;
    requestType: "principalIncrease" | "paybackExtension";
  }) => Promise<unknown> | unknown;
  requestDraw?: (draw: ProductionDraw) => Promise<unknown> | unknown;
  requestLoanFacilityDateChange?: (input: {
    reason: string;
    requestedPaybackDate: string;
  }) => Promise<unknown> | unknown;
  reviewFacilityChangeRequest?: (input: {
    note?: string;
    requestId: string;
    status: "approved" | "rejected";
  }) => Promise<unknown> | unknown;
  requestMilestoneInfo?: (input: {
    milestoneKey: string;
    note: string;
  }) => Promise<unknown> | unknown;
  reviewEvidence?: (input: {
    accepted: boolean;
    milestoneKey: string;
    note?: string;
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
  startMilestoneWork?: (input: {
    milestoneKey: string;
    note?: string;
  }) => Promise<unknown> | unknown;
  updateNonFinancialDetails?: (input: {
    buildName: string;
    location: string;
    locationLatitude?: number | null;
    locationLongitude?: number | null;
    locationPlaceId?: string | null;
    reason: string;
    startDate: string;
  }) => Promise<unknown> | unknown;
  materialPlanning?: MaterialPlanningActions;
}

export interface ProductionBuildDetail {
  appPermissions?: BuilderStaffAppPermissions | null;
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
    brokerageId?: string;
    createdAt?: number;
    updatedAt?: number;
  };
  capitalPlan?: {
    borrowerWorkingCapitalLimitCents: number;
    borrowerCoPayBps: number;
    lenderDrawPolicyLimitCents: number;
    version: number;
  } | null;
  draws: ProductionDraw[];
  loanFacility?: {
    principalCents: number;
    interestAnnualBps: number;
    interestStartsOn: "funds_released";
    paybackDate?: string;
    status: "active" | "closed";
  } | null;
  facilityChangeRequests?: ProductionFacilityChangeRequest[];
  auditEvents?: ProductionAuditEvent[];
  availableContractors?: ProductionAvailableContractor[];
  contractors?: ProductionAttachedContractor[];
  milestoneContractorAssignments?: ProductionMilestoneContractorAssignment[];
  costItems?: MaterialPlanningItem[];
  displayId?: string;
  documents?: ProductionDocument[];
  evidenceAssets?: ProductionEvidenceAsset[];
  milestones: ProductionMilestone[];
  notes?: {
    internal: ProductionNote[];
    public: ProductionNote[];
  };
  quickActionEvents?: ProductionRailEvent[];
  sitePhotos?: ProductionSitePhoto[];
  siteVisits?: ProductionSiteVisit[];
  submilestones: ProductionSubmilestone[];
}

interface ProductionMilestone {
  _id: string;
  key: string;
  name: string;
  order: number;
  budgetCents: number;
  drawAvailabilityCents: number;
  dayStart: number;
  dayEnd: number;
  durationDays: number;
  dependencyKeys: string[];
  completionClaim?: Record<string, unknown>;
  completionReview?: Record<string, any>;
  evidenceState?: string;
  isDragLocked?: boolean;
  policyState?: string;
  progressPercent?: number;
  startedAt?: number;
  status: ProductionMilestoneStatus;
  updatedAt?: number;
}

interface ProductionSubmilestone {
  _id: string;
  milestoneKey: string;
  key: string;
  name: string;
  order: number;
  budgetCents?: number;
  durationDays?: number;
  startDay?: number;
  status: ProductionMilestoneStatus;
}

interface ProductionDraw {
  _id: string;
  drawKey: string;
  label: string;
  order: number;
  timingDay: number;
  amountCents: number;
  milestoneKey?: string;
  requestNote?: string;
  requestReviewNote?: string;
  requestedAt?: string;
  reviewedAt?: string;
  releaseDate?: string;
  releaseNote?: string;
  releasedAt?: string;
  status: ProductionDrawStatus;
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
  reviewNote?: string;
  reviewedAt?: number;
  reviewerWorkosUserId?: string;
  status: "requested" | "approved" | "rejected";
  updatedAt?: number;
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
  storageId?: string;
  storageUrl?: string | null;
  url?: string | null;
}

interface ProductionNote {
  _id: string;
  authorPersona?: string;
  body: string;
  createdAt: number | string;
  visibility: "internal" | "public";
}

interface ProductionRailEvent {
  _id: string;
  createdAt: number;
  eventType: string;
  payloadPreview: string;
}

interface ProductionAuditEvent {
  _id: string;
  actorPersona: string;
  afterSummary?: string;
  beforeSummary?: string;
  createdAt: number;
  entityLabel?: string;
  entityType: string;
  eventType: string;
}

interface ProductionAttachedContractor {
  _id: string;
  contractorId?: string;
  agreedRateCents?: number;
  agreedRateUnit?: "hour" | "day" | "fixed";
  city?: string;
  defaultPayRateCents?: number;
  defaultPayRateUnit?: "hour" | "day" | "fixed";
  email?: string;
  hourlyRateCents?: number;
  name: string;
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
  name: string;
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
  milestoneKey: string;
  note?: string;
  recordNoteFormat?: "plain_text" | "html";
  recordNote?: string;
  requestedAt: string;
  requestedDay: number;
  status: string;
  tokenExpiresAt?: number;
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
  milestoneKey,
  onChangeMilestone,
  onChangeCalendarTimeframe,
  onChangeRail,
  onChangeTab,
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
  breadcrumbRootHref?: string;
  breadcrumbRootLabel?: string;
  breadcrumbSectionHref?: string;
  breadcrumbSectionLabel?: string;
  milestoneKey?: string;
  onChangeCalendarTimeframe?: (timeframe: CalendarTimeframe) => void;
  onChangeMilestone?: (milestoneKey?: string) => void;
  onChangeRail: (rail: "open" | "closed") => void;
  onChangeTab: (tab: BuildDetailSubTab) => void;
  rail?: "open" | "closed";
  staff?: React.ReactNode;
  timelineWorkspace?: ActiveBuildTimelineWorkspaceProps["workspace"] | null;
  visibleTabs?: BuildDetailSubTab[];
  viewerRole?: "builder" | "lender";
  workosOrganizationId?: string;
}) {
  const projection = useMemo(
    () => buildProductionBuildProjection(detail),
    [detail],
  );
  const currentDay = resolveProductionCurrentDay(detail, timelineWorkspace);
  const eventsOpen = rail === "open";
  const eventCount =
    (detail.auditEvents?.length ?? 0) + (detail.quickActionEvents?.length ?? 0);
  const permit = firstPermitDocument(detail.documents);
  const [localActiveMilestoneKey, setLocalActiveMilestoneKey] = useState<
    string | null
  >(milestoneKey ?? null);
  const [assignContractorMilestoneKey, setAssignContractorMilestoneKey] =
    useState<string | null>(null);
  const activeMilestoneKey = milestoneKey ?? localActiveMilestoneKey;
  const setActiveMilestoneKey = (next: string | null) => {
    setLocalActiveMilestoneKey(next);
    onChangeMilestone?.(next ?? undefined);
  };
  const sheetData = useMemo(
    () =>
      activeMilestoneKey
        ? buildMilestoneSheetData(
            detail,
            projection,
            activeMilestoneKey,
            currentDay,
          )
        : null,
    [activeMilestoneKey, currentDay, detail, projection],
  );

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
        {activeTab === "details" ? (
          <ProductionDetailsTab
            actions={actions}
            contractorDetailHrefFor={contractorDetailHrefFor}
            currentDay={currentDay}
            detail={detail}
            onAssignContractor={
              actions?.assignContractorToMilestone ||
              actions?.createAndAssignContractor
                ? (card) => setAssignContractorMilestoneKey(card.milestoneKey)
                : undefined
            }
            onCardClick={(card) => setActiveMilestoneKey(card.milestoneKey)}
            projection={projection}
          />
        ) : null}
        {activeTab === "timeline" ? (
          <ProductionTimelineTab
            activeBuildId={activeBuildId}
            detail={detail}
            timelineWorkspace={timelineWorkspace}
            viewerRole={viewerRole}
            workosOrganizationId={workosOrganizationId}
          />
        ) : null}
        {activeTab === "evidence" ? (
          <ProductionEvidenceTab
            actions={actions}
            detail={detail}
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
          />
        ) : null}
        {activeTab === "staff" ? staff : null}
        {activeTab === "calendar" ? (
          <ProductionCalendarTab
            actions={actions}
            calendarTimeframe={calendarTimeframe}
            calendarWorkspace={calendarWorkspace}
            detail={detail}
            onChangeCalendarTimeframe={onChangeCalendarTimeframe}
            onChangeTab={onChangeTab}
            workosOrganizationId={workosOrganizationId}
          />
        ) : null}
        {activeTab === "gantt" ? (
          <ProductionGanttTab
            activeBuildId={activeBuildId}
            detail={detail}
            timelineWorkspace={timelineWorkspace}
            workosOrganizationId={workosOrganizationId}
          />
        ) : null}
      </section>
      <EventRailSheet
        auditEvents={detail.auditEvents ?? []}
        onOpenChange={(open) => onChangeRail(open ? "open" : "closed")}
        onResolve={(_event) => {}}
        onView={(_event) => {}}
        open={eventsOpen}
        quickActionEvents={detail.quickActionEvents ?? []}
      />
      <MilestoneDetailSheet
        assignmentsSourceLabel="buildContractorAssignments"
        data={sheetData}
        eventsSourceLabel="activeBuildAuditEvents"
        onApprove={async (milestoneKey, note) => {
          await actions?.approveMilestone?.({ milestoneKey, note });
        }}
        onAssignContractor={
          actions?.assignContractorToMilestone ||
          actions?.createAndAssignContractor
            ? (milestoneKey) => setAssignContractorMilestoneKey(milestoneKey)
            : undefined
        }
        onAssignVisit={(milestoneKey) =>
          void actions?.assignSiteVisit?.({ milestoneKey })
        }
        onClose={() => setActiveMilestoneKey(null)}
        onReject={(milestoneKey) =>
          void actions?.rejectMilestone?.({ milestoneKey })
        }
        onRequestInfo={(milestoneKey, note) =>
          void actions?.requestMilestoneInfo?.({ milestoneKey, note })
        }
        onStartWork={(milestoneKey, note) => {
          void actions?.startMilestoneWork?.({ milestoneKey, note });
        }}
      />
      <ContractorQuickAddDrawer
        availableContractors={contractorAssignmentOptions(detail)}
        createLabel="Create and assign"
        description="Assign an existing build contractor or create a profile and attach it to this milestone scope."
        onAttachExisting={async ({ assignmentCost, contractorId, role }) => {
          if (!assignContractorMilestoneKey) return;
          await actions?.assignContractorToMilestone?.({
            assignmentCost,
            contractorId,
            milestoneKey: assignContractorMilestoneKey,
            role,
          });
        }}
        onCreate={async ({ assignmentCost, contractor, role }) => {
          if (!assignContractorMilestoneKey) return;
          await actions?.createAndAssignContractor?.({
            assignmentCost,
            contractor,
            milestoneKey: assignContractorMilestoneKey,
            role: role ?? "Contractor",
          });
        }}
        onOpenChange={(open) => {
          if (!open) setAssignContractorMilestoneKey(null);
        }}
        open={Boolean(assignContractorMilestoneKey)}
        requireRole
        showAssignmentCost
        title={
          assignContractorMilestoneKey
            ? `Assign contractor to ${assignContractorMilestoneKey}`
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

function ProductionDetailsTab({
  actions,
  contractorDetailHrefFor,
  currentDay,
  detail,
  onAssignContractor,
  onCardClick,
  projection,
}: {
  actions?: ProductionBuildDetailActions;
  contractorDetailHrefFor?: (contractorId: string) => string;
  currentDay: number;
  detail: ProductionBuildDetail;
  onAssignContractor?: (card: KanbanCardData) => void;
  onCardClick: (card: KanbanCardData) => void;
  projection: ProductionBuildProjection;
}) {
  const [showCompletedKanban, setShowCompletedKanban] = useState(false);
  const kanbanCards = useMemo(
    () => buildProductionKanbanCards(detail, projection, currentDay),
    [currentDay, detail, projection],
  );

  return (
    <div className="flex flex-col gap-4" data-testid="production-build-details">
      <section className="grid items-stretch gap-3 sm:gap-4 xl:grid-cols-[minmax(280px,0.85fr)_minmax(0,1.6fr)]">
        <ProductionBuildDetailsCard
          actions={actions}
          detail={detail}
          projection={projection}
        />
        <SitePhotoCarousel
          buildName={detail.build.buildName}
          photos={detail.sitePhotos ?? []}
          siteAddress={detail.build.location}
          siteLatitude={detail.build.locationLatitude}
          siteLongitude={detail.build.locationLongitude}
        />
      </section>

      <ProductionDrawsTable
        actions={actions}
        detail={detail}
        projection={projection}
      />

      <FacilityChangeRequestsCard actions={actions} detail={detail} />

      <MilestoneKanban
        cards={kanbanCards}
        onAssignContractor={onAssignContractor}
        onCardClick={onCardClick}
        onToggleShowCompleted={() => setShowCompletedKanban((prev) => !prev)}
        showCompleted={showCompletedKanban}
      />

      <section className="grid gap-3 sm:gap-4 xl:grid-cols-2">
        <ContractorsCard
          actions={{
            onAttachExisting: actions?.attachContractor
              ? (input) => {
                  void actions.attachContractor?.(input);
                }
              : undefined,
            onCreateAndAttach: actions?.createAndAttachContractor
              ? (input) => {
                  void actions.createAndAttachContractor?.(input);
                }
              : undefined,
            sourceLabel: "production_contractors",
          }}
          availableContractors={detail.availableContractors ?? []}
          buildId={detail.build._id}
          contractorDetailHrefFor={contractorDetailHrefFor}
          contractors={detail.contractors ?? []}
        />
        <ProductionDocumentsCard
          actions={actions}
          documents={detail.documents ?? []}
        />
      </section>

      <section className="grid gap-3 sm:gap-4 xl:grid-cols-2">
        <ProductionNotesCard
          actions={actions}
          notes={detail.notes?.internal ?? []}
          testIdPrefix="internal-notes"
          title="Internal Notes"
          variant="internal"
        />
        <ProductionNotesCard
          actions={actions}
          notes={detail.notes?.public ?? []}
          testIdPrefix="public-notes"
          title="Public Notes"
          variant="public"
        />
      </section>
    </div>
  );
}

function ProductionBuildDetailsCard({
  actions,
  detail,
  projection,
}: {
  actions?: ProductionBuildDetailActions;
  detail: ProductionBuildDetail;
  projection: ProductionBuildProjection;
}) {
  const completed = projection.milestones.filter(
    (milestone) => milestone.status === "complete",
  ).length;
  const percentComplete =
    projection.milestones.length > 0
      ? Math.round((completed / projection.milestones.length) * 100)
      : 0;
  const drawnCents = projection.draws
    .filter((draw) => draw.status === "released")
    .reduce((sum, draw) => sum + draw.amountCents, 0);
  const drawAvailableCents = projection.milestones.reduce(
    (sum, milestone) => sum + milestone.drawAvailabilityCents,
    0,
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
      <Card data-testid="production-build-details-card" id="ui-build-details">
        <CardHeader className="flex flex-row items-center justify-between gap-3 p-3 pb-2 sm:p-5 sm:pb-3">
          <CardTitle className="text-sm">Build Details</CardTitle>
          <div className="flex shrink-0 items-center gap-2">
            <span className="text-[11px] text-muted-foreground">
              active_builds
            </span>
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
        </CardHeader>
        <CardContent className="p-3 pt-0 sm:p-5 sm:pt-0">
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
              {formatDate(
                addDaysSafe(detail.build.startDate, projection.maxDay),
              )}
            </dd>
            <Label>% complete</Label>
            <dd className="flex min-w-0 items-center gap-2">
              <span className="tabular-nums">{percentComplete}%</span>
              <span
                aria-hidden
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
          <hr className="my-4 border-border" />
          <h3 className="mb-2 font-semibold text-sm">Loan Details</h3>
          <dl className="grid grid-cols-[minmax(0,1fr)] gap-y-1.5 text-sm sm:grid-cols-[120px_1fr]">
            <Label>Working capital limit</Label>
            <span className="min-w-0 break-words">
              {formatCents(
                detail.capitalPlan?.borrowerWorkingCapitalLimitCents ?? 0,
              )}
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
                    addDaysSafe(detail.build.startDate, projection.maxDay),
                  )}
            </span>
            <Label>Draw availability</Label>
            <span className="min-w-0 break-words">
              {formatCents(drawAvailableCents)} of{" "}
              {formatCents(detail.build.totalBudgetCents)}
            </span>
            <Label>Drawn to date</Label>
            <span className="min-w-0 break-words">
              {formatCents(drawnCents)}
            </span>
            <Label>Interest (annual)</Label>
            <span className="tabular-nums">
              {((detail.loanFacility?.interestAnnualBps ?? 0) / 100).toFixed(
                2,
              )}
              %
            </span>
            <Label>Interest starts</Label>
            <span>Funds released</span>
          </dl>
        </CardContent>
      </Card>
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

function BuildNonFinancialDetailsSheet({
  detail,
  onOpenChange,
  onSubmit,
  open,
}: {
  detail: ProductionBuildDetail;
  onOpenChange: (open: boolean) => void;
  onSubmit: NonNullable<ProductionBuildDetailActions["updateNonFinancialDetails"]>;
  open: boolean;
}) {
  const [buildName, setBuildName] = useState(detail.build.buildName);
  const [location, setLocation] = useState(detail.build.location);
  const [locationLatitude, setLocationLatitude] = useState<number | null>(
    detail.build.locationLatitude ?? null,
  );
  const [locationLongitude, setLocationLongitude] = useState<number | null>(
    detail.build.locationLongitude ?? null,
  );
  const [locationPlaceId, setLocationPlaceId] = useState<string | null>(
    detail.build.locationPlaceId ?? null,
  );
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [startDate, setStartDate] = useState(detail.build.startDate);
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
    [location, locationLatitude, locationLongitude],
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
        location: location.trim(),
        locationLatitude,
        locationLongitude,
        locationPlaceId,
        reason: reason.trim(),
        startDate: startDate.trim(),
      });
      onOpenChange(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to save build details.");
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
                      "Google did not return coordinates for that address.",
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
    <dt className="pt-1 text-[11px] text-muted-foreground uppercase sm:pt-0">
      {children}
    </dt>
  );
}

function ProductionDrawsTable({
  actions,
  detail,
  projection,
}: {
  actions?: ProductionBuildDetailActions;
  detail: ProductionBuildDetail;
  projection: ProductionBuildProjection;
}) {
  const [pendingDraw, setPendingDraw] = useState<string | null>(null);
  const [error, setError] = useState("");

  const run = async (
    draw: ProductionDraw,
    fn?: (draw: ProductionDraw) => Promise<unknown> | unknown,
  ) => {
    if (!fn || pendingDraw) return;
    setPendingDraw(draw.drawKey);
    setError("");
    try {
      await fn(draw);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setPendingDraw(null);
    }
  };

  return (
    <Card data-testid="build-detail-draws" id="draws-table">
      <CardHeader className="flex flex-row items-center justify-between gap-3 p-3 sm:p-4">
        <CardTitle className="text-sm">Draws</CardTitle>
        <span className="shrink-0 text-right text-[11px] text-muted-foreground">
          planned_draw_schedule_rows
        </span>
      </CardHeader>
      <CardContent className="p-3 pt-0 sm:p-4 sm:pt-0">
        <div className="overflow-x-auto rounded-md border border-border">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="bg-card/70 text-[10px] text-muted-foreground uppercase">
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
                      draw.status === "approved" ||
                      draw.status === "released"
                        ? formatCents(draw.amountCents)
                        : "-"}
                    </Td>
                    <Td>
                      {formatDate(
                        addDaysSafe(detail.build.startDate, draw.timingDay),
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
                        {draw.status === "planned" ||
                        draw.status === "rejected" ? (
                          <DrawActionButton
                            disabled={!actions?.requestDraw || pending}
                            label={pending ? "Requesting..." : "Request"}
                            onClick={() => run(draw, actions?.requestDraw)}
                            testId={`build-detail-draw-request-${draw.drawKey}`}
                          />
                        ) : null}
                        {draw.status === "requested" ? (
                          <>
                            <DrawActionButton
                              disabled={!actions?.approveDraw || pending}
                              label={pending ? "Approving..." : "Approve"}
                              onClick={() => run(draw, actions?.approveDraw)}
                              testId={`build-detail-draw-approve-${draw.drawKey}`}
                            />
                            <DrawActionButton
                              disabled={!actions?.rejectDraw || pending}
                              label="Reject"
                              onClick={() => run(draw, actions?.rejectDraw)}
                              testId={`build-detail-draw-reject-${draw.drawKey}`}
                            />
                          </>
                        ) : null}
                        {draw.status === "approved" ? (
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
                      </div>
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {error ? (
          <p className="mt-2 text-[11px] text-destructive" role="alert">
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
    String(Math.round((detail.loanFacility?.principalCents ?? 0) / 100)),
  );
  const [paybackDate, setPaybackDate] = useState(
    detail.loanFacility?.paybackDate ?? detail.build.startDate,
  );
  const [reason, setReason] = useState("");
  const [reviewNote, setReviewNote] = useState("");
  const [pending, setPending] = useState("");
  const [error, setError] = useState("");
  const requests = detail.facilityChangeRequests ?? [];
  const pendingRequests = requests.filter(
    (request) => request.status === "requested",
  );

  const run = async (key: string, fn?: () => Promise<unknown> | unknown) => {
    if (!fn || pending) return;
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
      }),
    );
  const requestPayback = () =>
    run("request-payback", () =>
      actions?.requestFacilityChange?.({
        reason: reason.trim() || undefined,
        requestedPaybackDate: paybackDate,
        requestType: "paybackExtension",
      }),
    );
  const review = (
    request: ProductionFacilityChangeRequest,
    status: "approved" | "rejected",
  ) =>
    run(`${status}-${request._id}`, () =>
      actions?.reviewFacilityChangeRequest?.({
        note: reviewNote.trim() || undefined,
        requestId: request._id,
        status,
      }),
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
            <p className="rounded-md border border-dashed border-border p-3 text-muted-foreground text-xs">
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
            <p className="mt-2 text-[11px] text-destructive" role="alert">
              {error}
            </p>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}

function facilityRequestLabel(request: ProductionFacilityChangeRequest) {
  if (request.requestType === "principalIncrease") {
    return `Principal increase to ${formatCents(
      request.requestedPayload.requestedPrincipalCents ?? 0,
    )}`;
  }
  return `Payback extension to ${formatDate(
    request.requestedPayload.requestedPaybackDate ?? "",
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
    "supporting",
  );
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  const onAdd = async () => {
    if (!name.trim() || !actions?.addDocument || pending) return;
    setPending(true);
    setError("");
    try {
      await actions.addDocument({ documentType: kind, fileName: name.trim() });
      setName("");
      setKind("supporting");
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
        <span className="text-[11px] text-muted-foreground tabular-nums">
          {documents.length}
        </span>
      </CardHeader>
      <CardContent className="p-3 pt-0 sm:p-4 sm:pt-0">
        <div
          className="mb-3 grid gap-2 md:grid-cols-[minmax(0,1fr)_120px_auto]"
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
          <button
            className="rounded-md bg-primary px-3 py-2 font-medium text-primary-foreground text-sm disabled:opacity-50 md:py-1.5"
            data-testid="documents-add"
            disabled={!name.trim() || !actions?.addDocument || pending}
            onClick={onAdd}
            type="button"
          >
            {pending ? "Adding..." : "Add"}
          </button>
        </div>
        {error ? (
          <p className="mb-2 text-[11px] text-destructive">{error}</p>
        ) : null}
        {documents.length === 0 ? (
          <p className="text-muted-foreground text-xs">No documents yet.</p>
        ) : (
          <ul className="space-y-1">
            {documents.map((document) => (
              <li
                className="flex flex-col items-start gap-1 rounded-md border border-border bg-background/40 p-2 text-sm sm:flex-row sm:items-center sm:justify-between"
                data-testid={`build-detail-document-${document._id}`}
                key={document._id}
              >
                <span className="truncate">
                  {document.name ?? document.fileName}
                </span>
                <div className="flex shrink-0 items-center gap-2 sm:ml-2">
                  <span className="text-[11px] text-muted-foreground">
                    {document.kind ?? document.documentType}
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

function ProductionNotesCard({
  actions,
  notes,
  testIdPrefix,
  title,
  variant,
}: {
  actions?: ProductionBuildDetailActions;
  notes: ProductionNote[];
  testIdPrefix: string;
  title: string;
  variant: "internal" | "public";
}) {
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState(false);
  const accent =
    variant === "internal" ? "border-amber-500/40" : "border-emerald-500/40";

  const onSave = async () => {
    if (!draft.trim() || !actions?.addNote || pending) return;
    setPending(true);
    try {
      await actions.addNote({ body: draft.trim(), visibility: variant });
      setDraft("");
    } finally {
      setPending(false);
    }
  };

  return (
    <Card className={`border-2 ${accent}`} data-testid={testIdPrefix}>
      <CardHeader className="flex flex-row items-center justify-between gap-3 p-3 sm:p-4">
        <CardTitle className="text-sm">{title}</CardTitle>
        <span className="shrink-0 text-right text-[11px] text-muted-foreground">
          {variant === "internal" ? "Lender-only" : "Borrower-visible"}
        </span>
      </CardHeader>
      <CardContent className="p-3 pt-0 sm:p-4 sm:pt-0">
        <div className="min-h-[120px] rounded-md border border-border bg-background/40 p-3">
          {notes.length === 0 ? (
            <p className="text-muted-foreground text-xs">No notes yet.</p>
          ) : (
            <ul className="space-y-2 text-xs">
              {notes.map((note) => (
                <li
                  data-testid={`${testIdPrefix}-item-${note._id}`}
                  key={note._id}
                >
                  <p className="text-[11px] text-muted-foreground">
                    {formatDate(note.createdAt)} - {note.authorPersona}
                  </p>
                  <p>{note.body}</p>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
          <textarea
            className="min-h-[56px] flex-1 rounded-md border border-border bg-background/40 p-2 text-xs"
            data-testid={`${testIdPrefix}-input`}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="Add a note..."
            value={draft}
          />
          <button
            className="rounded-md border border-border bg-card px-3 py-2 text-xs hover:bg-accent disabled:opacity-50 sm:self-start sm:py-1.5"
            data-testid={`${testIdPrefix}-save`}
            disabled={!draft.trim() || !actions?.addNote || pending}
            onClick={onSave}
            type="button"
          >
            {pending ? "Saving..." : "Save"}
          </button>
        </div>
      </CardContent>
    </Card>
  );
}

function ProductionTimelineTab({
  activeBuildId,
  detail,
  timelineWorkspace,
  viewerRole,
  workosOrganizationId,
}: {
  activeBuildId?: string;
  detail: ProductionBuildDetail;
  timelineWorkspace?: ActiveBuildTimelineWorkspaceProps["workspace"] | null;
  viewerRole: "builder" | "lender";
  workosOrganizationId?: string;
}) {
  if (
    !activeBuildId ||
    !workosOrganizationId ||
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
        initialRole={viewerRole}
        workspace={timelineWorkspace}
        workosOrganizationId={workosOrganizationId}
      />
    </div>
  );
}

function ProductionEvidenceTab({
  actions,
  detail,
  onOpenMilestone,
  projection,
}: {
  actions?: ProductionBuildDetailActions;
  detail: ProductionBuildDetail;
  onOpenMilestone: (milestoneKey: string) => void;
  projection: ProductionBuildProjection;
}) {
  const builderEvidence = useMemo(
    () => buildBuilderEvidenceRows(detail, projection),
    [detail, projection],
  );
  const completedSiteVisits = useMemo(
    () => buildCompletedSiteVisitRows(detail, projection),
    [detail, projection],
  );
  const locationUnverifiedCount = builderEvidence.filter(
    (row) => row.locationState === "unverified",
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
          onOpenMilestone={onOpenMilestone}
          rows={builderEvidence}
          title="Builder Submitted Evidence"
        />
        <EvidenceSourcePanel
          emptyLabel="No completed site visits yet."
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
  onOpenMilestone,
  rows,
  title,
}: {
  actions?: ProductionBuildDetailActions;
  emptyLabel: string;
  onOpenMilestone: (milestoneKey: string) => void;
  rows: ProductionEvidenceRow[];
  title: string;
}) {
  const [expandedRowId, setExpandedRowId] = useState<string | null>(
    rows[0]?.id ?? null,
  );
  const [pendingAction, setPendingAction] = useState<string | null>(null);

  useEffect(() => {
    if (expandedRowId && rows.some((row) => row.id === expandedRowId)) return;
    setExpandedRowId(rows[0]?.id ?? null);
  }, [expandedRowId, rows]);

  const reviewEvidence = async (
    row: ProductionEvidenceRow,
    accepted: boolean,
  ) => {
    if (!actions?.reviewEvidence || pendingAction) return;
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
                    current === row.id ? null : row.id,
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
    accepted: boolean,
  ) => Promise<void>;
  onToggleExpanded: () => void;
  pendingAction: string | null;
  row: ProductionEvidenceRow;
}) {
  const evidenceDate = row.submittedAt ?? row.completedAt;
  const submittedLabel =
    evidenceDate !== undefined ? formatDate(evidenceDate) : "Not dated";
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
                expanded && "rotate-180",
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
      data-testid={`production-evidence-asset-${asset.evidenceKey}`}
    >
      <div className="overflow-hidden rounded-md border bg-background">
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
  const [imageFailed, setImageFailed] = useState(false);
  const isImage = asset.mimeType.startsWith("image/");
  const canRenderDirectly = isBrowserPreviewableImageMime(asset.mimeType);
  const needsHeicConversion = isHeicLikeEvidenceImage({
    fileName: asset.fileName,
    mimeType: asset.mimeType,
  });
  const displayUrl =
    needsHeicConversion && canOpenAsset
      ? evidenceImagePreviewUrl(asset.previewUrl)
      : canRenderDirectly && canOpenAsset
        ? asset.previewUrl
        : null;

  if (isImage && displayUrl && !imageFailed) {
    return (
      <img
        alt={asset.label}
        className="aspect-[4/3] w-full object-cover"
        onError={() => setImageFailed(true)}
        src={displayUrl}
      />
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
        <div className="max-w-44 text-xs">
          HEIC preview unavailable. Open the original file.
        </div>
      ) : null}
    </div>
  );
}

function ProductionBuildMaterialsTab({
  actions,
  detail,
}: {
  actions?: MaterialPlanningActions;
  detail: ProductionBuildDetail;
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
      items={detail.costItems ?? []}
      panelLayout="stacked"
      milestones={milestones}
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
  onChangeCalendarTimeframe,
  onChangeTab,
  workosOrganizationId,
}: {
  actions?: ProductionBuildDetailActions;
  calendarTimeframe?: CalendarTimeframe;
  calendarWorkspace?: DrawFlowCalendarWorkspaceData | null;
  detail: ProductionBuildDetail;
  onChangeCalendarTimeframe?: (timeframe: CalendarTimeframe) => void;
  onChangeTab: (tab: BuildDetailSubTab) => void;
  workosOrganizationId?: string;
}) {
  const drawByKey = useMemo(
    () => new Map(detail.draws.map((draw) => [draw.drawKey, draw])),
    [detail.draws],
  );
  const adapterActions = useMemo<ActiveBuildCalendarAdapterActions>(
    () => ({
      approveDraw: (drawKey) => {
        const draw = drawByKey.get(drawKey);
        if (draw) return actions?.approveDraw?.(draw);
      },
      approveMilestone: (milestoneKey) =>
        actions?.approveMilestone?.({ milestoneKey }),
      assignSiteVisit: (milestoneKey) =>
        actions?.assignSiteVisit?.({ milestoneKey }),
      cancelSiteVisit: actions?.cancelSiteVisit,
      releaseDraw: (drawKey) => {
        const draw = drawByKey.get(drawKey);
        if (draw) return actions?.releaseDraw?.(draw);
      },
      requestDraw: (drawKey) => {
        const draw = drawByKey.get(drawKey);
        if (draw) return actions?.requestDraw?.(draw);
      },
      requestLoanFacilityDateChange:
        actions?.requestLoanFacilityDateChange ??
        ((input) =>
          actions?.requestFacilityChange?.({
            reason: input.reason,
            requestedPaybackDate: input.requestedPaybackDate,
            requestType: "paybackExtension",
          })),
      requestMilestoneInfo: actions?.requestMilestoneInfo,
      rescheduleSiteVisit: actions?.rescheduleSiteVisit,
      reviseMilestoneSchedule: actions?.reviseMilestoneSchedule,
      scheduleSiteVisit:
        actions?.scheduleSiteVisit ??
        ((input) =>
          actions?.assignSiteVisit?.({ milestoneKey: input.milestoneKey })),
      setAdminDecisionTargetDate: actions?.setAdminDecisionTargetDate,
      setDrawReleaseTargetDate: actions?.setDrawReleaseTargetDate,
      setEvidenceDueDate: actions?.setEvidenceDueDate,
      setReviewTargetDate: actions?.setReviewTargetDate,
      startMilestoneWork: (milestoneKey) =>
        actions?.startMilestoneWork?.({
          milestoneKey,
          note: "Started from calendar workspace.",
        }),
    }),
    [actions, drawByKey],
  );
  const effectiveWorkspace = useMemo(
    () =>
      calendarWorkspace ??
      buildActiveBuildCalendarWorkspaceFromDetail(detail, {
        organizationId: workosOrganizationId,
      }),
    [calendarWorkspace, detail, workosOrganizationId],
  );
  const calendarActions = useMemo(
    () =>
      buildActiveBuildCalendarActions(adapterActions, {
        baseDate: detail.build.startDate,
      }),
    [adapterActions, detail.build.startDate],
  );
  const commitEdit = useMemo(
    () =>
      createActiveBuildCalendarEditHandler({
        actions: adapterActions,
        baseDate: detail.build.startDate,
      }),
    [adapterActions, detail.build.startDate],
  );

  return (
    <div data-testid="production-build-calendar">
      <CalendarWorkspace
        actions={calendarActions}
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
  detail,
  timelineWorkspace,
  workosOrganizationId,
}: {
  activeBuildId?: string;
  detail: ProductionBuildDetail;
  timelineWorkspace?: ActiveBuildTimelineWorkspaceProps["workspace"] | null;
  workosOrganizationId?: string;
}) {
  if (
    !activeBuildId ||
    !workosOrganizationId ||
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
        detail={detail}
        timelineWorkspace={timelineWorkspace}
        workosOrganizationId={workosOrganizationId}
      />
    </div>
  );
}

function buildProductionKanbanCards(
  detail: ProductionBuildDetail,
  projection: ProductionBuildProjection,
  currentDay: number,
): KanbanCardData[] {
  const drawByMilestone = new Map(
    projection.draws
      .filter((draw) => draw.milestoneKey)
      .map((draw) => [draw.milestoneKey as string, draw]),
  );
  return projection.milestones.map((milestone) => {
    const draw = drawByMilestone.get(milestone.key);
    const submilestones =
      projection.submilestonesByMilestone.get(milestone.key) ?? [];
    const progressPercent =
      typeof milestone.progressPercent === "number"
        ? clampPercent(milestone.progressPercent)
        : submilestones.length > 0
          ? Math.round(
              (submilestones.filter((sub) => sub.status === "complete").length /
                submilestones.length) *
                100,
            )
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
        }),
      ),
      drawGroupKey: draw?.drawKey ?? milestone.key,
      evidenceReviewStatus: milestone.evidenceState,
      forecastEndDate: addDaysSafe(detail.build.startDate, milestone.dayEnd),
      forecastStartDate: addDaysSafe(
        detail.build.startDate,
        milestone.dayStart,
      ),
      milestoneId: milestone._id,
      milestoneKey: milestone.key,
      name: milestone.name,
      progressPercent,
      requestedAmountCents:
        draw?.status === "requested" ||
        draw?.status === "approved" ||
        draw?.status === "released"
          ? draw.amountCents
          : undefined,
      requiresSiteVisit:
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
  if (milestone.completionReview?.siteVisit?.status === "requested") {
    return { canStartWork: false, column: "SiteVisit", status: "review" };
  }
  if (
    draw?.status === "requested" ||
    milestone.evidenceState === "Info requested"
  ) {
    return { canStartWork: false, column: "NeedsApproval", status: "review" };
  }
  if (milestone.status === "complete") {
    return {
      canStartWork: false,
      column: "MarkedComplete",
      status: "completion_approved",
    };
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
    projection,
  );
  const hasStarted = productionMilestoneHasStartedWorkflow(milestone, draw);
  const isPastEnd = currentDay > milestone.dayEnd;
  if (hasStarted) {
    return {
      canStartWork: false,
      column: "InProgress",
      status: isPastEnd
        ? "in_progress_behind_schedule"
        : "in_progress_on_schedule",
    };
  }
  if (!dependenciesReady) {
    return {
      canStartWork: false,
      column: "Backlog",
      status: currentDay >= milestone.dayStart ? "blocked" : "planned",
    };
  }
  if (currentDay >= milestone.dayStart) {
    return {
      canStartWork: true,
      column: "InProgress",
      status: isPastEnd ? "in_progress_behind_schedule" : "ready_to_start",
    };
  }
  return { canStartWork: false, column: "Backlog", status: "planned" };
}

function productionMilestoneDependenciesSatisfied(
  milestone: ProductionMilestone,
  projection: ProductionBuildProjection,
) {
  const byKey = new Map(projection.milestones.map((row) => [row.key, row]));
  return (milestone.dependencyKeys ?? []).every(
    (key) => byKey.get(key)?.status === "complete",
  );
}

function productionMilestoneHasStartedWorkflow(
  milestone: ProductionMilestone,
  draw?: ProductionDraw,
) {
  if (milestone.status === "in_progress") return true;
  if ((milestone.progressPercent ?? 0) > 0) return true;
  if (
    draw?.status === "requested" ||
    draw?.status === "approved" ||
    draw?.status === "released"
  ) {
    return true;
  }
  const evidenceState = String(milestone.evidenceState ?? "").toLowerCase();
  return Boolean(
    evidenceState &&
    !["draft package", "not started", "planned"].includes(evidenceState),
  );
}

function buildMilestoneSheetData(
  detail: ProductionBuildDetail,
  projection: ProductionBuildProjection,
  milestoneKey: string,
  currentDay: number,
): MilestoneSheetData | null {
  const milestone = projection.milestones.find(
    (row) => row.key === milestoneKey,
  );
  if (!milestone) return null;
  const draw = projection.draws.find(
    (row) => row.milestoneKey === milestoneKey,
  );
  const state = resolveProductionMilestoneKanbanState({
    currentDay,
    draw,
    milestone,
    projection,
  });
  const events = (detail.auditEvents ?? [])
    .filter((event) => event.eventType.includes("milestone"))
    .slice(0, 6)
    .map((event) => ({
      _id: event._id,
      actor: event.actorPersona,
      createdAt: event.createdAt,
      title: event.eventType.replace(/[._]/g, " "),
    }));
  return {
    canStartWork: state.canStartWork,
    column: state.column,
    contractors: contractorAssignmentsForMilestone(detail, milestone.key).map(
      (contractor) => ({
        initials: initialsFor(contractor.name),
        name: contractor.name,
        role: contractor.role,
      }),
    ),
    drawGroupKey: draw?.drawKey ?? milestone.key,
    milestoneKey: milestone.key,
    name: milestone.name,
    recentEvents: events,
    requestedAmountCents: draw?.amountCents,
    submittedAt: draw?.requestedAt ? Date.parse(draw.requestedAt) : undefined,
  };
}

function resolveProductionCurrentDay(
  detail: ProductionBuildDetail,
  timelineWorkspace?: ActiveBuildTimelineWorkspaceProps["workspace"] | null,
) {
  const timelineDay = timelineWorkspace?.plan?.currentDay;
  if (typeof timelineDay === "number" && Number.isFinite(timelineDay)) {
    return Math.round(timelineDay);
  }
  return daysBetweenProductionDates(
    detail.build.startDate,
    new Date().toISOString(),
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
    Math.round((parseDay(endIso) - parseDay(startIso)) / 86_400_000),
  );
}

function clampPercent(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function buildProductionBuildProjection(
  detail: ProductionBuildDetail,
): ProductionBuildProjection {
  const milestones = [...detail.milestones].sort((a, b) => a.order - b.order);
  const draws = [...detail.draws].sort((a, b) => a.order - b.order);
  const submilestones = [...detail.submilestones].sort(
    (a, b) => a.order - b.order,
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
    ...draws.map((draw) => draw.timingDay + 14),
  );
  const calendarIsoDates = new Set<string>();
  for (const milestone of milestones) {
    calendarIsoDates.add(
      addDaysSafe(detail.build.startDate, milestone.dayStart),
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
  if (!year || !month || !day) {
    return new Date(isoDate);
  }
  return new Date(year, month - 1, day);
}

function statusLabel(status: ProductionBuildStatus): string {
  return status.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function drawStatusLabel(status: ProductionDrawStatus): string {
  switch (status) {
    case "approved":
      return "Approved";
    case "rejected":
      return "Rejected";
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
  projection: ProductionBuildProjection,
): ProductionEvidenceRow[] {
  const drawByMilestone = new Map(
    projection.draws
      .filter((draw) => draw.milestoneKey)
      .map((draw) => [draw.milestoneKey as string, draw]),
  );
  return projection.milestones
    .map((milestone) => {
      const assets = evidenceAssetsForMilestone(detail, milestone.key).filter(
        (asset) => !isSiteVisitEvidenceAsset(asset),
      );
      if (!hasBuilderSubmittedEvidence(milestone) && assets.length === 0) {
        return null;
      }
      const claim = milestone.completionClaim;
      const review = milestone.completionReview;
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
        stringFromRecord(review, "status") ??
        milestone.evidenceState ??
        "Submitted";
      return {
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
      } satisfies ProductionEvidenceRow;
    })
    .filter((row): row is ProductionEvidenceRow => row !== null);
}

function buildCompletedSiteVisitRows(
  detail: ProductionBuildDetail,
  projection: ProductionBuildProjection,
): ProductionEvidenceRow[] {
  const milestoneByKey = new Map(
    projection.milestones.map((milestone) => [milestone.key, milestone]),
  );
  const drawByMilestone = new Map(
    projection.draws
      .filter((draw) => draw.milestoneKey)
      .map((draw) => [draw.milestoneKey as string, draw]),
  );
  const rows = new Map<string, ProductionEvidenceRow>();
  const addVisit = (visit: ProductionSiteVisit) => {
    if (visit.status !== "complete") return;
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
      a.completedAt ?? a.submittedAt ?? "",
    ),
  );
}

function hasBuilderSubmittedEvidence(milestone: ProductionMilestone) {
  if (milestone.completionClaim) return true;
  const state = String(milestone.evidenceState ?? "").toLowerCase();
  if (!state) return false;
  return !["draft package", "not started", "planned"].includes(state);
}

function evidenceLocationState(
  detail: ProductionBuildDetail,
  milestoneKey: string,
  scopedAssets = evidenceAssetsForMilestone(detail, milestoneKey),
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
        String(value).toLowerCase().includes(milestoneKey.toLowerCase()),
      ),
  );
  if (relatedPhotos.some((photo) => photo.locationVerified === false)) {
    return "unverified";
  }
  if (relatedPhotos.some((photo) => photo.locationVerified === true)) {
    return "verified";
  }
  return undefined;
}

function evidenceAssetsForMilestone(
  detail: ProductionBuildDetail,
  milestoneKey: string,
) {
  return (detail.evidenceAssets ?? []).filter(
    (asset) => asset.milestoneKey === milestoneKey,
  );
}

function siteVisitEvidenceAssetsForVisit(
  detail: ProductionBuildDetail,
  visit: ProductionSiteVisit,
) {
  const milestoneAssets = evidenceAssetsForMilestone(
    detail,
    visit.milestoneKey,
  );
  const visitId = visit.visitId ?? visit._id;
  const visitAssets = milestoneAssets.filter((asset) => {
    const source = String(asset.source ?? "");
    return (
      isSiteVisitEvidenceAsset(asset) &&
      (!visitId || source.includes(String(visitId)))
    );
  });
  if (visitAssets.length > 0) return visitAssets;
  return milestoneAssets.filter(isSiteVisitEvidenceAsset);
}

function isSiteVisitEvidenceAsset(asset: ProductionEvidenceAsset) {
  return String(asset.source ?? "")
    .toLowerCase()
    .includes("site_visit");
}

function isUsableEvidenceUrl(url?: string | null) {
  if (!url) return false;
  return !(
    url.startsWith("production-evidence://") ||
    url.startsWith("production-build://")
  );
}

function evidenceImagePreviewUrl(url?: string | null) {
  if (!url) return null;
  const siteUrl = import.meta.env.VITE_CONVEX_SITE_URL;
  if (!siteUrl) return null;
  return `${siteUrl}/evidence-image-preview?url=${encodeURIComponent(url)}`;
}

function formatBytes(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"] as const;
  const exponent = Math.min(
    Math.floor(Math.log(bytes) / Math.log(1024)),
    units.length - 1,
  );
  const value = bytes / 1024 ** exponent;
  return `${value >= 10 || exponent === 0 ? Math.round(value) : value.toFixed(1)} ${units[exponent]}`;
}

function evidenceStatusLabel(status: string): string {
  if (!status) return "Submitted";
  return status
    .replace(/_/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function evidenceStatusVariant(
  status: string,
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

function stringFromRecord(
  value: Record<string, unknown> | undefined,
  key: string,
) {
  const raw = value?.[key];
  return typeof raw === "string" && raw.trim() ? raw : undefined;
}

function numberFromRecord(
  value: Record<string, unknown> | undefined,
  key: string,
) {
  const raw = value?.[key];
  return typeof raw === "number" && Number.isFinite(raw) ? raw : undefined;
}

function siteVisitFromCompletionReview(
  review: Record<string, any> | undefined,
): Partial<ProductionSiteVisit> | null {
  const raw = review?.siteVisit;
  return raw && typeof raw === "object" ? raw : null;
}

function statusBadgeVariant(
  status: ProductionBuildStatus,
): React.ComponentProps<typeof Badge>["variant"] {
  if (status === "completed") return "success";
  if (status === "paused") return "warning";
  return "info";
}

function drawBadgeVariant(
  status: ProductionDrawStatus,
): React.ComponentProps<typeof Badge>["variant"] {
  if (status === "released") return "success";
  if (status === "requested") return "warning";
  if (status === "approved") return "info";
  if (status === "rejected") return "destructive";
  return "outline";
}

function contractorAssignmentsForMilestone(
  detail: ProductionBuildDetail,
  milestoneKey: string,
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
  submilestoneKey: string,
) {
  return (
    detail.submilestones.find(
      (submilestone) =>
        submilestone.milestoneKey === milestoneKey &&
        submilestone.key === submilestoneKey,
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
      name: string;
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
      name: contractor.name,
      trades: contractor.trades,
    });
  }
  for (const contractor of detail.availableContractors ?? []) {
    byId.set(contractor._id, {
      _id: contractor._id,
      city: contractor.city,
      defaultPayRateCents: contractor.defaultPayRateCents,
      defaultPayRateUnit: contractor.defaultPayRateUnit,
      name: contractor.name,
      trades: contractor.trades,
    });
  }
  return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name));
}
