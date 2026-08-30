"use client";
import {
  lazy,
  Suspense,
  useCallback,
  useMemo,
} from "react";
import { Frame, FramePanel } from "#/components/ui/frame.tsx";
import type { BuildDetailTarget } from "#/features/build-detail-targets/buildDetailTarget.ts";
import type { BuildDetailTargetContext } from "#/features/build-detail-targets/useBuildDetailTargetController.ts";
import {
  type ActiveBuildCalendarAdapterActions,
  buildActiveBuildCalendarActions,
  buildActiveBuildCalendarWorkspaceFromDetail,
  createActiveBuildCalendarEditHandler,
} from "#/features/calendar-workspace/adapters/activeBuildCalendarAdapter.ts";
import type {
  CalendarTimeframe,
  DrawFlowCalendarWorkspaceData,
} from "#/features/calendar-workspace/calendarTypes.ts";
import type {
  MaterialPlanningActions,
} from "#/features/material-planning/MaterialPlanningTab.tsx";
import type { ActiveBuildTimelineWorkspaceProps } from "./ActiveBuildTimelineWorkspace";
import {
  type BuildDetailSubTab,
} from "./BuildDetailTabs";
import {
  BuildDetailTabFallback,
  LazyActiveBuildGanttWorkspace,
  LazyCalendarWorkspace,
  LazyMaterialPlanningTab,
} from "./lazy-build-detail-tabs.tsx";

const LazyFieldRichTextPreview = lazy(() =>
  import("#/components/rich-text/field-rich-text.tsx").then((m) => ({
    default: m.FieldRichTextPreview,
  }))
);

import { initialsFor } from "./format";
import {
  type KanbanCardData,
  type KanbanColumn,
} from "./MilestoneKanban";
import {
  type SiteVisitOrderRequest,
} from "./SiteVisitOrderDialog.tsx";
import { productionMilestoneScheduleHealth } from "./production-schedule-health.ts";
import type {
  ProductionBuildDetail,
  ProductionBuildDetailActions,
  ProductionBuildProjection,
  ProductionDraw,
  ProductionMilestone,
  ProductionSubmilestone,
} from "./production-build-detail-contracts.ts";
import { contractorAssignmentsForMilestone } from "./production-build-detail-evidence-utils.ts";
import {
  addDaysSafe,
  clampPercent,
  isMilestoneApprovedForDrawAvailability,
} from "./production-build-detail-projection.ts";

export function ProductionBuildMaterialsTab({
  actions,
  detail,
  focusedReference,
  onOpenCanonicalTarget,
}: {
  actions?: MaterialPlanningActions;
  detail: ProductionBuildDetail;
  focusedReference?: string;
  onOpenCanonicalTarget?: (
    target: BuildDetailTarget,
    context?: BuildDetailTargetContext
  ) => void;
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
          canonicalId: submilestone._id,
          key: submilestone.key,
          milestoneKey: submilestone.milestoneKey,
          name: submilestone.name,
          order: submilestone.order,
        })),
    }));

  return (
    <Suspense fallback={<BuildDetailTabFallback label="materials" />}>
      <LazyMaterialPlanningTab
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
        onOpenSubmilestone={
          onOpenCanonicalTarget
            ? (submilestoneId) =>
                onOpenCanonicalTarget(
                  {
                    kind: "submilestone",
                    submilestoneId,
                  },
                  { selectedTab: "materials" }
                )
            : undefined
        }
        panelLayout="stacked"
        readOnly={!actions}
        scopeLabel="Active Build"
      />
    </Suspense>
  );
}

export function ProductionCalendarTab({
  actions,
  calendarTimeframe,
  calendarWorkspace,
  detail,
  focusedReference,
  onChangeCalendarTimeframe,
  onChangeTab,
  onOpenMilestone,
  onOpenCanonicalTarget,
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
  onOpenMilestone: (milestoneKey: string) => void;
  onOpenCanonicalTarget?: (
    target: BuildDetailTarget,
    context?: BuildDetailTargetContext
  ) => void;
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
  const openCalendarDetail = useCallback(
    (event: DrawFlowCalendarWorkspaceData["events"][number]) => {
      if (event.entity.type === "submilestone") {
        if (
          !(
            onOpenCanonicalTarget &&
            detail.submilestones.some(
              (submilestone) => submilestone._id === event.entity.id
            )
          )
        ) {
          return "fallback" as const;
        }
        onOpenCanonicalTarget(
          {
            kind: "submilestone",
            submilestoneId: event.entity.id,
          },
          { selectedTab: "overview" }
        );
        return "handled" as const;
      }
      if (event.entity.type === "milestone" && event.entity.id) {
        const milestone = detail.milestones.find(
          (candidate) => candidate._id === event.entity.id
        );
        if (milestone) {
          onOpenMilestone(milestone.key);
          onChangeTab("details");
          return "handled" as const;
        }
      }
      return "fallback" as const;
    },
    [
      detail.milestones,
      detail.submilestones,
      onChangeTab,
      onOpenCanonicalTarget,
      onOpenMilestone,
    ]
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
      <Suspense fallback={<BuildDetailTabFallback label="calendar" />}>
        <LazyCalendarWorkspace
          actions={calendarActions}
          initialSelectedEventId={focusedSiteVisitEventId}
          initialTimeframe={
            calendarTimeframe ?? effectiveWorkspace.defaultTimeframe
          }
          onCommitEdit={commitEdit}
          onCreateSyncSubscription={actions?.createCalendarSyncSubscription}
          onOpenDetail={openCalendarDetail}
          onRecordExternalSyncChange={actions?.recordExternalCalendarSyncChange}
          onSaveView={actions?.saveCalendarView}
          onTimeframeChange={onChangeCalendarTimeframe}
          workspace={effectiveWorkspace}
        />
      </Suspense>
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

export function ProductionGanttTab({
  activeBuildId,
  actions,
  detail,
  onOpenCanonicalTarget,
  onRequestSiteVisit,
  onStartWork,
  timelineWorkspace,
  viewerRole,
  workosOrganizationId,
}: {
  activeBuildId?: string;
  actions?: ProductionBuildDetailActions;
  detail: ProductionBuildDetail;
  onOpenCanonicalTarget?: (
    target: BuildDetailTarget,
    context?: BuildDetailTargetContext
  ) => void;
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
      <Suspense fallback={<BuildDetailTabFallback label="Gantt" />}>
        <LazyActiveBuildGanttWorkspace
          buildId={activeBuildId as any}
          canApproveMilestones={Boolean(actions?.approveMilestone)}
          canRejectMilestones={Boolean(actions?.rejectMilestone)}
          detail={detail}
          onOpenCanonicalTarget={onOpenCanonicalTarget}
          onRequestSiteVisit={onRequestSiteVisit}
          onStartWork={onStartWork}
          timelineWorkspace={timelineWorkspace}
          viewerRole={viewerRole}
          workosOrganizationId={workosOrganizationId}
        />
      </Suspense>
    </div>
  );
}

export function buildProductionKanbanCards(
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
        submilestoneId: submilestone._id,
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

export function resolveProductionMilestoneKanbanState({
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
  const scheduleHealth = productionMilestoneScheduleHealth(
    milestone,
    projection.submilestonesByMilestone.get(milestone.key) ?? [],
    currentDay,
  );
  if (scheduleHealth.health === "behind_schedule") {
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

export function productionMilestoneDependenciesSatisfied(
  milestone: ProductionMilestone,
  projection: ProductionBuildProjection
) {
  const byKey = new Map(projection.milestones.map((row) => [row.key, row]));
  return (milestone.dependencyKeys ?? []).every(
    (key) => byKey.get(key)?.status === "complete"
  );
}

export function productionMilestoneHasStartedWorkflow(
  milestone: ProductionMilestone,
  draw?: ProductionDraw
) {
  if (milestone.status === "in_progress") {
    return true;
  }
  return Boolean(milestone.actualStartedAt ?? milestone.startedAt);
}
