"use client";

import type * as React from "react";
import {
  lazy,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { toast } from "sonner";

import type { BrokerageSiteVisitsResult } from "#/features/backoffice-site-visits/site-visit-types.ts";
import {
  type BuildDetailSheetHostState,
} from "#/features/build-detail-targets/BuildDetailSheetHost.tsx";
import type { BuildSubmilestoneDetailTab } from "#/features/build-detail-targets/buildDetailTab.ts";
import type { BuildDetailTarget } from "#/features/build-detail-targets/buildDetailTarget.ts";
import type { BuildDetailTargetContext } from "#/features/build-detail-targets/useBuildDetailTargetController.ts";
import {
  firstPermitDocument,
} from "#/features/build-permit-viewer/BuildPermitViewerDrawer.tsx";
import type {
  CalendarTimeframe,
  DrawFlowCalendarWorkspaceData,
} from "#/features/calendar-workspace/calendarTypes.ts";
import type { CostDocumentSummary } from "#/features/cost-documents/CostDocumentRoadmapReconciliation.tsx";
import {
  type DrawWorkflowCapabilities,
} from "#/features/draw-workflow/drawWorkflow.ts";
import { useBuildCollaborationReadMutation } from "#/features/build-collaboration/BuildCollaborationMutationGate.tsx";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import type { ActiveBuildTimelineWorkspaceProps } from "./ActiveBuildTimelineWorkspace";
import {
  BUILD_DETAIL_TABS,
  type BuildDetailSubTab,
} from "./BuildDetailTabs";

const LazyFieldRichTextPreview = lazy(() =>
  import("#/components/rich-text/field-rich-text.tsx").then((m) => ({
    default: m.FieldRichTextPreview,
  }))
);

import {
  type MilestoneStartConfirmation,
  type MilestoneStartDialogRequest,
  type MilestoneStartSource,
} from "./MilestoneStartDialog.tsx";
import {
  type SiteVisitOrderConfirmation,
  type SiteVisitOrderRequest,
} from "./SiteVisitOrderDialog.tsx";
import type {
  ProductionBuildDetail,
  ProductionBuildDetailActions,
  ProductionMilestone,
  ProductionViewerCapacity,
} from "./production-build-detail-contracts.ts";
import {
  addDaysSafe,
  buildMilestoneSheetData,
  buildProductionBuildProjection,
  resolveProductionCurrentDay,
} from "./production-build-detail-projection.ts";
import { ProductionBuildDetailSurfaceView } from "./production-build-detail-surface-view.tsx";

export function ProductionBuildDetailSurfaceContent({
  actions,
  activeBuildId,
  activeTab,
  calendarTimeframe,
  calendarWorkspace,
  contractorDetailHrefFor,
  costDocuments,
  costs,
  breadcrumbRootHref = "/backoffice",
  breadcrumbRootLabel = "Backoffice",
  breadcrumbSectionHref = "/backoffice/builds",
  breadcrumbSectionLabel = "Builds",
  detail,
  detailSheetHost,
  detailTab,
  drawCapabilities,
  focusedReference,
  fundingWorkspaceEnabled = false,
  milestoneKey,
  milestoneSiteVisits,
  onChangeMilestone,
  onChangeCalendarTimeframe,
  onChangeRail,
  onChangeTab,
  onOpenCanonicalTarget,
  onOpenCostDocument,
  prototypeMilestoneStartTrigger = false,
  quotes,
  rail,
  staff,
  timelineWorkspace,
  visibleTabs,
  viewerCapacity,
  viewerRole = "lender",
  workosOrganizationId,
}: {
  activeTab: BuildDetailSubTab;
  activeBuildId?: string;
  actions?: ProductionBuildDetailActions;
  calendarTimeframe?: CalendarTimeframe;
  calendarWorkspace?: DrawFlowCalendarWorkspaceData | null;
  contractorDetailHrefFor?: (contractorId: string) => string;
  costDocuments?: CostDocumentSummary[];
  costs?: React.ReactNode;
  detail: ProductionBuildDetail;
  detailSheetHost?: BuildDetailSheetHostState;
  detailTab?: BuildSubmilestoneDetailTab;
  drawCapabilities?: DrawWorkflowCapabilities;
  focusedReference?: string;
  fundingWorkspaceEnabled?: boolean;
  breadcrumbRootHref?: string;
  breadcrumbRootLabel?: string;
  breadcrumbSectionHref?: string;
  breadcrumbSectionLabel?: string;
  milestoneKey?: string;
  milestoneSiteVisits?: BrokerageSiteVisitsResult;
  onChangeCalendarTimeframe?: (timeframe: CalendarTimeframe) => void;
  onChangeMilestone?: (milestoneKey?: string, focus?: string) => void;
  onChangeRail: (rail: "open" | "closed") => void;
  onChangeTab: (tab: BuildDetailSubTab, focus?: string) => void;
  onOpenCanonicalTarget?: (
    target: BuildDetailTarget,
    context?: BuildDetailTargetContext
  ) => void;
  onOpenCostDocument?: (costDocumentId: string) => void;
  /** PROTOTYPE — exposes the real trigger for planned milestones before the production state model changes. */
  prototypeMilestoneStartTrigger?: boolean;
  quotes?: React.ReactNode;
  rail?: "open" | "closed";
  staff?: React.ReactNode;
  timelineWorkspace?: ActiveBuildTimelineWorkspaceProps["workspace"] | null;
  visibleTabs?: BuildDetailSubTab[];
  viewerCapacity?: ProductionViewerCapacity;
  viewerRole?: "builder" | "lender";
  workosOrganizationId?: string;
}) {
  const projection = useMemo(
    () => buildProductionBuildProjection(detail),
    [detail]
  );
  const authorizeCostDocumentPage = useBuildCollaborationReadMutation(
    api.build_collaboration_assets.authorizeBuildCollaborationAssetDownload
  );
  const currentDay = resolveProductionCurrentDay(detail, timelineWorkspace);
  const eventsOpen = rail === "open";
  const eventCount =
    (detail.auditEvents?.length ?? 0) + (detail.quickActionEvents?.length ?? 0);
  const activeTabLabel =
    BUILD_DETAIL_TABS.find((tab) => tab.value === activeTab)?.label ?? "Build";
  const workflowCapabilities =
    drawCapabilities ??
    ({
      canApprove: Boolean(actions?.approveDraw),
      canOpenCanonical: true,
      canOpenReview:
        viewerRole === "lender" &&
        viewerCapacity !== "builder" &&
        viewerCapacity !== "builder-staff",
      canReject: Boolean(actions?.rejectDraw),
      canRelease: Boolean(actions?.releaseDraw),
      canStartReview: Boolean(actions?.startDrawReview),
      canSubmitForAdmin:
        Boolean(actions?.submitDrawForAdmin) &&
        viewerCapacity !== "admin" &&
        viewerCapacity !== "principle-broker",
    } satisfies DrawWorkflowCapabilities);
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
  const [milestoneStartRevisionError, setMilestoneStartRevisionError] =
    useState<string | null>(null);
  const [canonicalDetailRetryVersion, setCanonicalDetailRetryVersion] =
    useState(0);
  const milestoneStartRequest = milestoneStartController?.request ?? null;
  const [localFocusedReference, setLocalFocusedReference] = useState<
    string | undefined
  >(focusedReference);
  const effectiveFocusedReference = localFocusedReference ?? focusedReference;
  useEffect(() => {
    setLocalFocusedReference(focusedReference);
  }, [focusedReference]);
  const focusedSubmilestoneId = effectiveFocusedReference?.startsWith(
    "submilestone:"
  )
    ? effectiveFocusedReference.slice("submilestone:".length)
    : undefined;
  const detailTargetReplacesParentSheet =
    effectiveFocusedReference?.startsWith("draw:") ||
    effectiveFocusedReference?.startsWith("submilestone:") ||
    effectiveFocusedReference?.startsWith("actionItem:");
  const activeMilestoneKey = detailTargetReplacesParentSheet
    ? null
    : (milestoneKey ?? localActiveMilestoneKey);
  const activeMilestone = activeMilestoneKey
    ? (projection.milestones.find(
        (milestone) => milestone.key === activeMilestoneKey
      ) ?? null)
    : null;
  const setActiveMilestoneKey = useCallback(
    (next: string | null) => {
      setLocalActiveMilestoneKey(next);
      let milestoneReference: string | undefined;
      if (next) {
        const milestone = detail.milestones.find(
          (candidate) => candidate.key === next
        );
        if (milestone) {
          milestoneReference = `milestone:${milestone._id}`;
          setLocalFocusedReference(milestoneReference);
        }
      }
      if (onChangeMilestone) {
        onChangeMilestone(next ?? undefined, milestoneReference);
      } else if (milestoneReference) {
        onChangeTab("details", milestoneReference);
      }
    },
    [detail.milestones, onChangeMilestone, onChangeTab]
  );
  useEffect(() => {
    if (focusedReference?.startsWith("milestone:")) {
      const entityId = focusedReference.slice("milestone:".length);
      setLocalActiveMilestoneKey(
        detail.milestones.find((milestone) => milestone._id === entityId)
          ?.key ?? null
      );
      return;
    }
    if (
      focusedReference?.startsWith("submilestone:") ||
      focusedReference?.startsWith("actionItem:")
    ) {
      setLocalActiveMilestoneKey(null);
    }
  }, [detail.milestones, focusedReference]);
  const sheetData = useMemo(() => {
    const data = activeMilestoneKey
      ? buildMilestoneSheetData(
          detail,
          projection,
          activeMilestoneKey,
          currentDay,
          costDocuments
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
    costDocuments,
    detail,
    projection,
    viewerRole,
  ]);
  const openSubmilestoneReview = useCallback(
    (submilestoneKey: string) => {
      const submilestone = detail.submilestones.find(
        (candidate) => candidate.key === submilestoneKey
      );
      if (!(submilestone && onOpenCanonicalTarget)) {
        return;
      }
      onOpenCanonicalTarget(
        { kind: "submilestone", submilestoneId: submilestone._id },
        { selectedTab: "review" }
      );
    },
    [detail.submilestones, onOpenCanonicalTarget]
  );
  const openCostDocumentPage = useCallback(
    async (page: { assetId: string }) => {
      if (!workosOrganizationId) {
        toast.error("The source file is unavailable without Build access.");
        return;
      }
      try {
        const url = await authorizeCostDocumentPage({
          assetId: page.assetId as Id<"buildCollaborationAssets">,
          buildId: detail.build._id as Id<"activeBuilds">,
          organizationId: workosOrganizationId,
        });
        window.open(url, "_blank", "noopener,noreferrer");
      } catch (error) {
        toast.error(
          error instanceof Error
            ? error.message
            : "The source file is no longer available."
        );
      }
    }, [
      authorizeCostDocumentPage,
      detail.build._id,
      workosOrganizationId,
    ]
  );
  const openCanonicalReference = useCallback(
    (reference: { entityId: string; entityKind: string; href: string }) => {
      if (reference.entityKind === "milestone") {
        const milestone = detail.milestones.find(
          (candidate) => candidate._id === reference.entityId
        );
        if (!milestone) {
          return;
        }
        setActiveMilestoneKey(milestone.key);
        return;
      }
      if (reference.entityKind === "submilestone") {
        const submilestone = detail.submilestones.find(
          (candidate) => candidate._id === reference.entityId
        );
        if (!(onOpenCanonicalTarget && submilestone)) {
          return;
        }
        onOpenCanonicalTarget(
          {
            kind: "submilestone",
            submilestoneId: submilestone._id,
          },
          { selectedTab: "collaboration" }
        );
        return;
      }
      if (reference.entityKind === "siteVisit") {
        const siteVisit = detail.siteVisits?.find(
          (candidate) => candidate._id === reference.entityId
        );
        if (!siteVisit) {
          return;
        }
        const focusedVisit = `siteVisit:${siteVisit._id}`;
        setLocalFocusedReference(focusedVisit);
        onChangeTab("calendar", focusedVisit);
        setActiveMilestoneKey(siteVisit.milestoneKey);
        return;
      }
      if (reference.entityKind === "actionItem") {
        // Action Items remain generic collaboration targets. The route-owned
        // target resolver will promote a generated companion to its canonical
        // Sub-milestone; a manual Action Item therefore stays in the reusable
        // collaboration detail sheet without manufacturing a child target.
        onChangeTab("details", `actionItem:${reference.entityId}`);
      }
    },
    [
      detail.milestones,
      detail.siteVisits,
      detail.submilestones,
      onChangeTab,
      onOpenCanonicalTarget,
      setActiveMilestoneKey,
    ]
  );
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
    // Convex treats legacy milestone and sub-milestone rows without
    // workflowRevision as canonical revision 0. Keep the sub-milestone token
    // scoped to that row; a parent revision is not a substitute for it.
    const expectedRevision = submilestone
      ? (submilestone.workflowRevision ?? 0)
      : (milestone.workflowRevision ?? 0);
    if (expectedRevision === undefined) {
      setMilestoneStartRevisionError(
        "Refresh this Build detail before changing the start; the canonical workflow revision is unavailable."
      );
      setMilestoneStartController(null);
      return;
    }
    setMilestoneStartRevisionError(null);
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
      expectedRevision,
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
      if (
        input.actualStartedAt === undefined ||
        input.expectedRevision === undefined ||
        !input.reason
      ) {
        throw new Error("A corrected actual start and reason are required.");
      }
      return await actions?.correctMilestoneStart?.({
        actualStartedAt: input.actualStartedAt,
        expectedRevision: input.expectedRevision,
        idempotencyKey: input.idempotencyKey,
        milestoneKey: input.milestoneKey,
        reason: input.reason,
        source: input.source,
        submilestoneKey: input.submilestoneKey,
      });
    }
    if (input.action === "retract") {
      if (input.expectedRevision === undefined || !input.reason) {
        throw new Error("A retraction reason is required.");
      }
      return await actions?.retractMilestoneStart?.({
        expectedRevision: input.expectedRevision,
        idempotencyKey: input.idempotencyKey,
        milestoneKey: input.milestoneKey,
        reason: input.reason,
        source: input.source,
        submilestoneKey: input.submilestoneKey,
      });
    }
    if (
      input.actualStartedAt === undefined ||
      input.expectedRevision === undefined
    ) {
      throw new Error("An actual start is required.");
    }
    return await actions?.startMilestoneWork?.({
      actualStartedAt: input.actualStartedAt,
      dependencyOverrideReason: input.dependencyOverrideReason,
      expectedRevision: input.expectedRevision,
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
        submilestoneGuidanceSections: input.submilestoneGuidanceSections,
        submilestoneKeys: input.submilestoneKeys,
      });
    }
    return await actions?.assignSiteVisit?.({
      milestoneKey: input.milestoneKey,
      ...(input.note ? { note: input.note } : {}),
      ...(input.requestedTime ? { requestedTime: input.requestedTime } : {}),
      siteVisitGuidance: input.siteVisitGuidance,
      submilestoneGuidanceSections: input.submilestoneGuidanceSections,
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
    <ProductionBuildDetailSurfaceView
      actions={actions}
      activeBuildId={activeBuildId}
      activeMilestone={activeMilestone}
      activeMilestoneKey={activeMilestoneKey}
      activeTab={activeTab}
      activeTabLabel={activeTabLabel}
      assignContractorTarget={assignContractorTarget}
      breadcrumbRootHref={breadcrumbRootHref}
      breadcrumbRootLabel={breadcrumbRootLabel}
      breadcrumbSectionHref={breadcrumbSectionHref}
      breadcrumbSectionLabel={breadcrumbSectionLabel}
      calendarTimeframe={calendarTimeframe}
      calendarWorkspace={calendarWorkspace}
      canonicalDetailRetryVersion={canonicalDetailRetryVersion}
      confirmMilestoneStart={confirmMilestoneStart}
      confirmSiteVisitOrder={confirmSiteVisitOrder}
      confirmStartAndCompletion={confirmStartAndCompletion}
      contractorDetailHrefFor={contractorDetailHrefFor}
      costDocuments={costDocuments}
      costs={costs}
      currentDay={currentDay}
      detail={detail}
      detailSheetHost={detailSheetHost}
      detailTab={detailTab}
      effectiveFocusedReference={effectiveFocusedReference}
      eventCount={eventCount}
      eventsOpen={eventsOpen}
      focusedSubmilestoneId={focusedSubmilestoneId}
      fundingWorkspaceEnabled={fundingWorkspaceEnabled}
      milestoneSiteVisits={milestoneSiteVisits}
      milestoneStartController={milestoneStartController}
      milestoneStartRequest={milestoneStartRequest}
      milestoneStartRevisionError={milestoneStartRevisionError}
      onChangeCalendarTimeframe={onChangeCalendarTimeframe}
      onChangeRail={onChangeRail}
      onChangeTab={onChangeTab}
      onOpenCanonicalTarget={onOpenCanonicalTarget}
      onOpenCostDocument={onOpenCostDocument}
      openCanonicalReference={openCanonicalReference}
      openCostDocumentPage={openCostDocumentPage}
      openMilestoneStart={openMilestoneStart}
      openSubmilestoneReview={openSubmilestoneReview}
      permit={permit}
      projection={projection}
      quotes={quotes}
      requestSiteVisit={requestSiteVisit}
      setActiveMilestoneKey={setActiveMilestoneKey}
      setAssignContractorTarget={setAssignContractorTarget}
      setCanonicalDetailRetryVersion={setCanonicalDetailRetryVersion}
      setLocalFocusedReference={setLocalFocusedReference}
      setMilestoneStartController={setMilestoneStartController}
      setSiteVisitOrderRequest={setSiteVisitOrderRequest}
      sheetData={sheetData}
      siteVisitOrderMilestone={siteVisitOrderMilestone}
      siteVisitOrderRequest={siteVisitOrderRequest}
      siteVisitOrderSubmilestones={siteVisitOrderSubmilestones}
      staff={staff}
      timelineWorkspace={timelineWorkspace}
      viewerCapacity={viewerCapacity}
      viewerRole={viewerRole}
      visibleTabs={visibleTabs}
      workflowCapabilities={workflowCapabilities}
      workosOrganizationId={workosOrganizationId}
    />
  );
}
