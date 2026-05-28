"use client";

import { MapPin } from "lucide-react";
import type * as React from "react";
import { useMemo, useState } from "react";

import { Badge } from "#/components/ui/badge.tsx";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "#/components/ui/card.tsx";
import { Calendar } from "#/components/ui/calendar.tsx";
import { Frame, FramePanel } from "#/components/ui/frame.tsx";
import { cn } from "#/lib/utils.ts";
import {
  BuildDetailTabBar,
  type BuildDetailSubTab,
} from "./BuildDetailTabs";
import { ActiveBuildGanttWorkspace } from "./ActiveBuildGanttWorkspace";
import {
  ActiveBuildTimelineWorkspace,
  type ActiveBuildTimelineWorkspaceProps,
} from "./ActiveBuildTimelineWorkspace";
import { ContractorsCard } from "./ContractorsCard";
import { EventRail } from "./EventRail";
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
  }) => Promise<void> | void;
  addNote?: (input: {
    body: string;
    visibility: "internal" | "public";
  }) => Promise<void> | void;
  approveDraw?: (draw: ProductionDraw) => Promise<void> | void;
  approveMilestone?: (input: {
    milestoneKey: string;
    note?: string;
  }) => Promise<void> | void;
  assignSiteVisit?: (input: { milestoneKey: string }) => Promise<void> | void;
  attachContractor?: (input: {
    contractorId: string;
    role: string;
  }) => Promise<void> | void;
  createAndAttachContractor?: (input: {
    contractor: {
      name: string;
      kind: "company" | "individual";
      hourlyRateCents: number;
      city: string;
      trades: string[];
      skills: string[];
      phone?: string;
      email?: string;
    };
    role: string;
  }) => Promise<void> | void;
  rejectDraw?: (draw: ProductionDraw) => Promise<void> | void;
  rejectMilestone?: (input: { milestoneKey: string }) => Promise<void> | void;
  releaseDraw?: (draw: ProductionDraw) => Promise<void> | void;
  requestFacilityChange?: (input: {
    reason?: string;
    requestedPaybackDate?: string;
    requestedPrincipalCents?: number;
    requestType: "principalIncrease" | "paybackExtension";
  }) => Promise<void> | void;
  requestDraw?: (draw: ProductionDraw) => Promise<void> | void;
  reviewFacilityChangeRequest?: (input: {
    note?: string;
    requestId: string;
    status: "approved" | "rejected";
  }) => Promise<void> | void;
  requestMilestoneInfo?: (input: {
    milestoneKey: string;
    note: string;
  }) => Promise<void> | void;
  startMilestoneWork?: (input: {
    milestoneKey: string;
    note?: string;
  }) => Promise<void> | void;
}

export interface ProductionBuildDetail {
  build: {
    _id: string;
    buildName: string;
    location: string;
    status: ProductionBuildStatus;
    startDate: string;
    totalBudgetCents: number;
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
  displayId?: string;
  documents?: ProductionDocument[];
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

interface ProductionDocument {
  _id: string;
  documentType?: string;
  fileName?: string;
  kind?: string;
  name?: string;
  sizeBytes?: number;
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
  email?: string;
  name: string;
  role: string;
  trades?: string[];
}

interface ProductionAvailableContractor {
  _id: string;
  city: string;
  name: string;
  skills?: string[];
  trades?: string[];
}

interface ProductionSiteVisit {
  _id?: string;
  completedAt?: string;
  milestoneKey: string;
  note?: string;
  recordNote?: string;
  requestedAt: string;
  requestedDay: number;
  status: string;
  tokenExpiresAt?: number;
  visitId: string;
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
  detail,
  milestoneKey,
  onChangeMilestone,
  onChangeRail,
  onChangeTab,
  rail,
  timelineWorkspace,
  workosOrganizationId,
}: {
  activeTab: BuildDetailSubTab;
  activeBuildId?: string;
  actions?: ProductionBuildDetailActions;
  detail: ProductionBuildDetail;
  milestoneKey?: string;
  onChangeMilestone?: (milestoneKey?: string) => void;
  onChangeRail: (rail: "open" | "closed") => void;
  onChangeTab: (tab: BuildDetailSubTab) => void;
  rail?: "open" | "closed";
  timelineWorkspace?: ActiveBuildTimelineWorkspaceProps["workspace"] | null;
  workosOrganizationId?: string;
}) {
  const projection = useMemo(
    () => buildProductionBuildProjection(detail),
    [detail],
  );
  const currentDay = resolveProductionCurrentDay(detail, timelineWorkspace);
  const railCollapsed = rail === "closed";
  const [localActiveMilestoneKey, setLocalActiveMilestoneKey] = useState<
    string | null
  >(milestoneKey ?? null);
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
      className={cn(
        "grid min-h-[calc(100vh-4rem)] overflow-x-hidden bg-muted/30",
        railCollapsed
          ? "xl:grid-cols-[minmax(0,1fr)_56px]"
          : "grid-cols-1 xl:grid-cols-[minmax(0,1fr)_340px]",
      )}
      data-testid="production-build-detail-route"
    >
      <section className="flex min-w-0 flex-col gap-3 px-2 py-3 sm:gap-4 sm:p-4 md:gap-5 md:p-6">
        <ProductionBuildHeader detail={detail} />
        <BuildDetailTabBar activeTab={activeTab} onChangeTab={onChangeTab} />
        <ProductionMobileEventDigest
          auditEvents={detail.auditEvents ?? []}
          quickActionEvents={detail.quickActionEvents ?? []}
        />
        {activeTab === "details" ? (
          <ProductionDetailsTab
            actions={actions}
            currentDay={currentDay}
            detail={detail}
            onCardClick={(card) => setActiveMilestoneKey(card.milestoneKey)}
            projection={projection}
          />
        ) : null}
        {activeTab === "timeline" ? (
          <ProductionTimelineTab
            activeBuildId={activeBuildId}
            detail={detail}
            timelineWorkspace={timelineWorkspace}
            workosOrganizationId={workosOrganizationId}
          />
        ) : null}
        {activeTab === "calendar" ? (
          <ProductionCalendarTab detail={detail} projection={projection} />
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
      <EventRail
        auditEvents={detail.auditEvents ?? []}
        collapsed={railCollapsed}
        onResolve={(_event) => {}}
        onToggleCollapsed={() =>
          onChangeRail(railCollapsed ? "open" : "closed")
        }
        onView={(_event) => {}}
        quickActionEvents={detail.quickActionEvents ?? []}
      />
      <MilestoneDetailSheet
        assignmentsSourceLabel="buildContractorAssignments"
        data={sheetData}
        eventsSourceLabel="activeBuildAuditEvents"
        onApprove={async (milestoneKey, note) =>
          actions?.approveMilestone?.({ milestoneKey, note })
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
        onStartWork={(milestoneKey, note) =>
          actions?.startMilestoneWork?.({ milestoneKey, note })
        }
      />
    </main>
  );
}

function ProductionBuildHeader({ detail }: { detail: ProductionBuildDetail }) {
  return (
    <Frame>
      <FramePanel className="flex flex-col gap-4 p-3 sm:p-4 md:flex-row md:items-end md:justify-between">
        <div className="min-w-0">
          <nav
            aria-label="Breadcrumbs"
            className="mb-3 flex min-w-0 items-center gap-2 overflow-x-auto text-muted-foreground text-xs"
          >
            <a className="hover:text-foreground" href="/backoffice">
              Backoffice
            </a>
            <span>/</span>
            <a className="hover:text-foreground" href="/backoffice/builds">
              Builds
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
        <div className="grid w-full grid-cols-2 gap-2 text-sm md:min-w-72 md:max-w-sm">
          <HeaderStat label="Start" value={formatDate(detail.build.startDate)} />
          <HeaderStat
            label="Budget"
            value={formatCents(detail.build.totalBudgetCents)}
          />
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

function ProductionMobileEventDigest({
  auditEvents,
  quickActionEvents,
}: {
  auditEvents: ProductionAuditEvent[];
  quickActionEvents: ProductionRailEvent[];
}) {
  const latestEvent = quickActionEvents[0] ?? auditEvents[0];

  return (
    <Card className="xl:hidden" data-testid="production-build-mobile-events">
      <CardHeader className="flex flex-row items-center justify-between gap-3 p-3 pb-2">
        <CardTitle className="text-sm">Events</CardTitle>
        <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[11px] text-foreground tabular-nums">
          {quickActionEvents.length + auditEvents.length}
        </span>
      </CardHeader>
      <CardContent className="p-3 pt-0">
        {latestEvent ? (
          <p className="line-clamp-2 text-muted-foreground text-xs">
            {"payloadPreview" in latestEvent
              ? latestEvent.payloadPreview
              : latestEvent.afterSummary ??
                latestEvent.entityLabel ??
                latestEvent.eventType}
          </p>
        ) : (
          <p className="text-muted-foreground text-xs">No events yet.</p>
        )}
      </CardContent>
    </Card>
  );
}

function ProductionDetailsTab({
  actions,
  currentDay,
  detail,
  onCardClick,
  projection,
}: {
  actions?: ProductionBuildDetailActions;
  currentDay: number;
  detail: ProductionBuildDetail;
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
        <ProductionBuildDetailsCard detail={detail} projection={projection} />
        <SitePhotoCarousel photos={detail.sitePhotos ?? []} />
      </section>

      <ProductionDrawsTable
        actions={actions}
        detail={detail}
        projection={projection}
      />

      <FacilityChangeRequestsCard actions={actions} detail={detail} />

      <MilestoneKanban
        cards={kanbanCards}
        onCardClick={onCardClick}
        onToggleShowCompleted={() => setShowCompletedKanban((prev) => !prev)}
        showCompleted={showCompletedKanban}
      />

      <section className="grid gap-3 sm:gap-4 xl:grid-cols-2">
        <ContractorsCard
          actions={{
            onAttachExisting: actions?.attachContractor,
            onCreateAndAttach: actions?.createAndAttachContractor,
            sourceLabel: "production_contractors",
          }}
          availableContractors={detail.availableContractors ?? []}
          buildId={detail.build._id}
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
  detail,
  projection,
}: {
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
  const siteVisitsOpen = detail.siteVisits?.filter(
    (visit) => visit.status === "requested",
  ).length ?? 0;
  const openWarnings =
    projection.draws.filter((draw) => draw.status === "rejected").length +
    (detail.sitePhotos?.filter((photo) => photo.locationVerified === false)
      .length ?? 0);

  return (
    <Card data-testid="production-build-details-card" id="ui-build-details">
      <CardHeader className="flex flex-row items-center justify-between gap-3 p-3 pb-2 sm:p-5 sm:pb-3">
        <CardTitle className="text-sm">Build Details</CardTitle>
        <span className="shrink-0 text-[11px] text-muted-foreground">
          active_builds
        </span>
      </CardHeader>
      <CardContent className="p-3 pt-0 sm:p-5 sm:pt-0">
        <dl className="grid grid-cols-[minmax(0,1fr)] gap-y-1.5 text-sm sm:grid-cols-[120px_minmax(0,1fr)]">
          <Label>Loan number</Label>
          <dd className="min-w-0 break-words tabular-nums">
            FL-{detail.displayId ?? detail.build._id}
          </dd>
          <Label>Address</Label>
          <dd className="min-w-0 break-words">{detail.build.location}</dd>
          <Label>Project start</Label>
          <dd className="min-w-0 break-words">{formatDate(detail.build.startDate)}</dd>
          <Label>Roadmap end</Label>
          <dd className="min-w-0 break-words">
            {formatDate(addDaysSafe(detail.build.startDate, projection.maxDay))}
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
          <span className="min-w-0 break-words">{formatCents(detail.loanFacility?.principalCents ?? 0)}</span>
          <Label>Payback date</Label>
          <span className="min-w-0 break-words">
            {detail.loanFacility?.paybackDate
              ? formatDate(detail.loanFacility.paybackDate)
              : formatDate(addDaysSafe(detail.build.startDate, projection.maxDay))}
          </span>
          <Label>Draw availability</Label>
          <span className="min-w-0 break-words">
            {formatCents(drawAvailableCents)} of{" "}
            {formatCents(detail.build.totalBudgetCents)}
          </span>
          <Label>Drawn to date</Label>
          <span className="min-w-0 break-words">{formatCents(drawnCents)}</span>
          <Label>Interest (annual)</Label>
          <span className="tabular-nums">
            {((detail.loanFacility?.interestAnnualBps ?? 0) / 100).toFixed(2)}%
          </span>
          <Label>Interest starts</Label>
          <span>Funds released</span>
        </dl>
      </CardContent>
    </Card>
  );
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
    fn?: (draw: ProductionDraw) => Promise<void> | void,
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
                      {formatDate(addDaysSafe(detail.build.startDate, draw.timingDay))}
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
  const pendingRequests = requests.filter((request) => request.status === "requested");

  const run = async (key: string, fn?: () => Promise<void> | void) => {
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
              label={pending === "request-principal" ? "Requesting..." : "Request principal"}
              onClick={requestPrincipal}
              testId="facility-request-principal"
            />
            <DrawActionButton
              disabled={!actions?.requestFacilityChange || Boolean(pending)}
              label={pending === "request-payback" ? "Requesting..." : "Request extension"}
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
                    <p className="mt-2 text-muted-foreground">{request.reason}</p>
                  ) : null}
                  {request.status === "requested" ? (
                    <div className="mt-2 flex flex-wrap gap-2">
                      <DrawActionButton
                        disabled={!actions?.reviewFacilityChangeRequest || Boolean(pending)}
                        label="Approve"
                        onClick={() => review(request, "approved")}
                        testId={`facility-approve-${request._id}`}
                      />
                      <DrawActionButton
                        disabled={!actions?.reviewFacilityChangeRequest || Boolean(pending)}
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
  return <Badge variant={status === "approved" ? "default" : "outline"}>{status}</Badge>;
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
  return <Badge variant={drawBadgeVariant(status)}>{drawStatusLabel(status)}</Badge>;
}

function ProductionDocumentsCard({
  actions,
  documents,
}: {
  actions?: ProductionBuildDetailActions;
  documents: ProductionDocument[];
}) {
  const [name, setName] = useState("");
  const [kind, setKind] = useState<
    "permit" | "budget" | "plan" | "supporting"
  >("supporting");
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
                <span className="shrink-0 text-[11px] text-muted-foreground sm:ml-2">
                  {document.kind ?? document.documentType}
                  {document.sizeBytes
                    ? ` - ${Math.round(document.sizeBytes / 1024)}KB`
                    : ""}
                </span>
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
                <li data-testid={`${testIdPrefix}-item-${note._id}`} key={note._id}>
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

function DescriptionRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 border-border border-b pb-2 last:border-b-0 last:pb-0">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-medium tabular-nums">{value}</span>
    </div>
  );
}

function ProductionTimelineTab({
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
  if (!activeBuildId || !workosOrganizationId || timelineWorkspace === undefined) {
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
        backofficeHref="/backoffice"
        buildHref={`/backoffice/builds/${detail.build._id}`}
        buildId={activeBuildId as any}
        initialRole="lender"
        workspace={timelineWorkspace}
        workosOrganizationId={workosOrganizationId}
      />
    </div>
  );
}

function ProductionCalendarTab({
  detail,
  projection,
}: {
  detail: ProductionBuildDetail;
  projection: ProductionBuildProjection;
}) {
  return (
    <div
      className="grid gap-4 xl:grid-cols-[auto_1fr]"
      data-testid="production-build-calendar"
    >
      <Frame>
        <FramePanel className="p-4">
          <Calendar
            mode="multiple"
            selected={projection.calendarDates}
            showOutsideDays
          />
        </FramePanel>
      </Frame>
      <Card>
        <CardHeader className="p-4">
          <CardTitle className="text-base">Calendar milestones</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 p-4 pt-0">
          {projection.milestones.map((milestone) => (
            <div
              className="grid gap-3 rounded-md border bg-background/60 p-3 text-sm md:grid-cols-[1fr_auto]"
              key={milestone._id}
            >
              <div className="min-w-0">
                <p className="truncate font-medium">{milestone.name}</p>
                <p className="text-muted-foreground text-xs">
                  {formatDate(addDaysSafe(detail.build.startDate, milestone.dayStart))}{" "}
                  to{" "}
                  {formatDate(addDaysSafe(detail.build.startDate, milestone.dayEnd))}
                </p>
              </div>
              <Badge variant={milestoneBadgeVariant(milestone.status)}>
                {milestoneStatusLabel(milestone.status)}
              </Badge>
            </div>
          ))}
        </CardContent>
      </Card>
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
  if (!activeBuildId || !workosOrganizationId || timelineWorkspace === undefined) {
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
      contractors:
        detail.contractors?.map((contractor) => ({
          initials: initialsFor(contractor.name),
          name: contractor.name,
        })) ?? [],
      drawGroupKey: draw?.drawKey ?? milestone.key,
      evidenceReviewStatus: milestone.evidenceState,
      forecastEndDate: addDaysSafe(detail.build.startDate, milestone.dayEnd),
      forecastStartDate: addDaysSafe(detail.build.startDate, milestone.dayStart),
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
  if (draw?.status === "requested" || milestone.evidenceState === "Info requested") {
    return { canStartWork: false, column: "NeedsApproval", status: "review" };
  }
  if (milestone.status === "complete") {
    return {
      canStartWork: false,
      column: "MarkedComplete",
      status: "completion_approved",
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
  if (milestone.completionClaim) return true;
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
  const milestone = projection.milestones.find((row) => row.key === milestoneKey);
  if (!milestone) return null;
  const draw = projection.draws.find((row) => row.milestoneKey === milestoneKey);
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
    contractors:
      detail.contractors?.map((contractor) => ({
        initials: initialsFor(contractor.name),
        name: contractor.name,
        role: contractor.role,
      })) ?? [],
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
    calendarIsoDates.add(addDaysSafe(detail.build.startDate, milestone.dayStart));
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

function milestoneStatusLabel(status: ProductionMilestoneStatus): string {
  switch (status) {
    case "in_progress":
      return "In progress";
    case "complete":
      return "Complete";
    default:
      return "Planned";
  }
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

function statusBadgeVariant(
  status: ProductionBuildStatus,
): React.ComponentProps<typeof Badge>["variant"] {
  if (status === "completed") return "success";
  if (status === "paused") return "warning";
  return "info";
}

function milestoneBadgeVariant(
  status: ProductionMilestoneStatus,
): React.ComponentProps<typeof Badge>["variant"] {
  if (status === "complete") return "success";
  if (status === "in_progress") return "warning";
  return "outline";
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
