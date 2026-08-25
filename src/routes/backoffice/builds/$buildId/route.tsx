import { createFileRoute, useNavigate } from "@tanstack/react-router";
import {
  useAction,
  useMutation,
  usePaginatedQuery,
  useQuery,
} from "convex/react";
import { Suspense, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { useRouteBreadcrumbProjection } from "#/components/route-breadcrumbs.tsx";
import { Frame, FramePanel } from "#/components/ui/frame.tsx";
import type { BuildDetailSubTab } from "#/features/backoffice-build-detail/BuildDetailTabs.tsx";
import { DocumentOperationIntentRegistry } from "#/features/backoffice-build-detail/documentOperationIntent.ts";
import {
  BuildDetailTabFallback,
  LazyBuilderStaffPermissionsPanel,
  LazyCostDocumentBatchWorkspace,
  LazyCostDocumentRoadmapReconciliation,
  LazyQuoteRoundComparisonSurface,
  LazyQuoteRoundsSurface,
} from "#/features/backoffice-build-detail/lazy-build-detail-tabs.tsx";
import {
  type ProductionBuildDetail,
  ProductionBuildDetailSurface,
  toProductionMilestoneSheetData,
} from "#/features/backoffice-build-detail/ProductionBuildDetailSurface.tsx";
import { SiteVisitScheduleIntentRegistry } from "#/features/backoffice-build-detail/siteVisitScheduleIntent.ts";
import { BuildDetailSheetHost } from "#/features/build-detail-targets/BuildDetailSheetHost.tsx";
import {
  filterMaterialPlanningActionsForPermissions,
} from "#/features/builder-staff/app-permissions.ts";
import type { CalendarTimeframe } from "#/features/calendar-workspace/calendarTypes.ts";
import type { CostDocumentSummary } from "#/features/cost-documents/CostDocumentRoadmapReconciliation.tsx";
import { buildCostDocumentSubmilestoneOptions } from "#/features/cost-documents/SingleCostDocumentCapture.tsx";
import type { DrawWorkflowCapabilities } from "#/features/draw-workflow/drawWorkflow.ts";
import { BackofficeNotificationReviewSurface } from "#/features/lender-portal/LenderNotificationReviewSurface.tsx";
import { isProductionVisualParityFixtureEnabled } from "#/features/production-proposals/visualParityConstants.ts";
import { canMakeActiveBuildFinalDecision } from "#/lib/auth/rbac.ts";
import { api } from "../../../../../convex/_generated/api";
import type { Id } from "../../../../../convex/_generated/dataModel";
import {
  resolveBuildBreadcrumbLabel,
  type BuildRouteAvailability,
} from "./-route-breadcrumb.ts";
import { resolveBackofficeBuildViewerCapacity } from "./-route-capacity.ts";
import { validateBuildDetailSearch } from "./-route-search.ts";
import { createBackofficeBuildDetailActions } from "./-route-actions.ts";

export { validateBuildDetailSearch } from "./-route-search.ts";

export const Route = createFileRoute("/backoffice/builds/$buildId")({
  staticData: {
    breadcrumb: {
      label: ({ params }) =>
        params.buildId ? "Loading build…" : "Build unavailable",
      params: ({ params }) =>
        params.buildId ? { buildId: params.buildId } : undefined,
      search: ({ search }) => search,
      to: "/backoffice/builds/$buildId",
    },
  },
  validateSearch: validateBuildDetailSearch,
  component: RouteComponent,
});

function RouteComponent() {
  const { buildId } = Route.useParams();
  const context = Route.useRouteContext();
  const search = validateBuildDetailSearch(
    Route.useSearch() as Record<string, unknown>
  );
  const navigate = useNavigate();
  const visualFixtureEnabled = isProductionVisualParityFixtureEnabled();
  const [visualParityDetail, setVisualParityDetail] =
    useState<ProductionBuildDetail | null>(null);
  const [visualParityTimeline, setVisualParityTimeline] = useState<
    unknown | null
  >(null);
  useEffect(() => {
    if (!visualFixtureEnabled) {
      setVisualParityDetail(null);
      setVisualParityTimeline(null);
      return;
    }
    let cancelled = false;
    void import("#/features/production-proposals/visualParityFixtures.ts").then(
      (mod) => {
        if (cancelled) {
          return;
        }
        setVisualParityDetail(mod.getVisualParityActiveBuildDetail(buildId));
        setVisualParityTimeline(
          mod.getVisualParityActiveBuildTimelineWorkspace(buildId)
        );
      }
    );
    return () => {
      cancelled = true;
    };
  }, [buildId, visualFixtureEnabled]);
  const documentOperationIntents = useRef(
    new DocumentOperationIntentRegistry()
  );
  const siteVisitScheduleIntents = useRef(
    new SiteVisitScheduleIntentRegistry()
  );
  const addDocument = useMutation(
    api.production_proposals.addActiveBuildDocument
  );
  const approveDraw = useMutation(
    api.production_proposals.approveActiveBuildDraw
  );
  const startDrawReview = useMutation(
    api.production_proposals.startActiveBuildDrawReview
  );
  const submitDrawForAdmin = useMutation(
    api.production_proposals.submitActiveBuildDrawForAdmin
  );
  const approveMilestone = useMutation(
    api.production_proposals.approveActiveBuildMilestone
  );
  const assignSiteVisit = useMutation(
    api.production_proposals.assignActiveBuildSiteVisit
  );
  const generateSiteVisitGuidance = useAction(
    (api as any).assistant.generateSiteVisitGuidance
  );
  const assignContractorToMilestone = useMutation(
    (api as any).production_proposals.assignActiveBuildContractorToMilestone
  );
  const removeContractorFromMilestone = useMutation(
    api.production_proposals.removeActiveBuildContractorFromMilestone
  );
  const attachAndInviteContractor = useMutation(
    (api as any).production_proposals.attachAndInviteActiveBuildContractor
  );
  const attachContractor = useMutation(
    api.production_proposals.attachActiveBuildContractor
  );
  const createContractor = useMutation(
    api.production_proposals.createContractorProfile
  );
  const sendContractorInvite = useMutation(
    (api as any).contractorOnboarding.sendContractorProfileInvite
  );
  const rejectDraw = useMutation(
    api.production_proposals.rejectActiveBuildDraw
  );
  const rejectMilestone = useMutation(
    api.production_proposals.rejectActiveBuildMilestone
  );
  const releaseDraw = useMutation(
    api.production_proposals.releaseActiveBuildDraw
  );
  const requestFacilityChange = useMutation(
    (api as any).production_proposals.requestActiveBuildFacilityChange
  );
  const requestBudgetRevision = useMutation(
    (api as any).production_proposals.requestActiveBuildBudgetRevision
  );
  const requestMilestoneInfo = useMutation(
    api.production_proposals.requestActiveBuildMilestoneInfo
  );
  const reviewEvidence = useMutation(
    api.production_proposals.reviewActiveBuildEvidence
  );
  const reviewFacilityChangeRequest = useMutation(
    (api as any).production_proposals.reviewActiveBuildFacilityChangeRequest
  );
  const reviewBudgetRevision = useMutation(
    (api as any).production_proposals.reviewActiveBuildBudgetRevision
  );
  const correctMilestoneStart = useMutation(
    (api as any).production_proposals.correctActiveBuildMilestoneStart
  );
  const retractMilestoneStart = useMutation(
    (api as any).production_proposals.retractActiveBuildMilestoneStart
  );
  const createActiveBuildCostItem = useMutation(
    api.production_proposals.createActiveBuildCostItem
  );
  const updateActiveBuildCostItem = useMutation(
    api.production_proposals.updateActiveBuildCostItem
  );
  const updateActiveBuildNonFinancialDetails = useMutation(
    (api as any).production_proposals.updateActiveBuildNonFinancialDetails
  );
  const deleteActiveBuildCostItem = useMutation(
    api.production_proposals.deleteActiveBuildCostItem
  );
  const reviseActiveBuildMilestoneSchedule = useMutation(
    (api as any).production_proposals.reviseActiveBuildMilestoneSchedule
  );
  const setEvidenceDueDate = useMutation(
    (api as any).production_proposals.setEvidenceDueDate
  );
  const setReviewTargetDate = useMutation(
    (api as any).production_proposals.setReviewTargetDate
  );
  const setAdminDecisionTargetDate = useMutation(
    (api as any).production_proposals.setAdminDecisionTargetDate
  );
  const setDrawReleaseTargetDate = useMutation(
    (api as any).production_proposals.setDrawReleaseTargetDate
  );
  const scheduleActiveBuildSiteVisit = useMutation(
    (api as any).production_proposals.scheduleActiveBuildSiteVisit
  );
  const rescheduleActiveBuildSiteVisit = useMutation(
    (api as any).production_proposals.rescheduleActiveBuildSiteVisit
  );
  const cancelActiveBuildSiteVisit = useMutation(
    (api as any).production_proposals.cancelActiveBuildSiteVisit
  );
  const requestLoanFacilityDateChange = useMutation(
    (api as any).production_proposals.requestLoanFacilityDateChange
  );
  const saveCalendarView = useMutation(
    (api as any).production_proposals.saveCalendarView
  );
  const createCalendarSyncSubscription = useMutation(
    (api as any).production_proposals.createCalendarSyncSubscription
  );
  const recordExternalCalendarSyncChange = useMutation(
    (api as any).production_proposals.recordExternalCalendarSyncChange
  );
  const activeTab = search.tab ?? "details";
  const tabNeedsTimeline = activeTab === "timeline" || activeTab === "gantt";
  const tabNeedsCalendar = activeTab === "calendar";
  const productionBuildQuery = useQuery(
    api.production_proposals.getActiveBuildDetailByString,
    visualFixtureEnabled
      ? "skip"
      : {
          buildId,
          workosOrganizationId: context.organizationId as string,
        }
  );
  const effectiveProductionBuild = visualFixtureEnabled
    ? visualParityDetail
    : productionBuildQuery;
  const notificationMilestoneKey = search.milestoneId
      ? effectiveProductionBuild?.milestones.find(
        (milestone: ProductionBuildDetail["milestones"][number]) =>
          String(milestone._id) === search.milestoneId
      )?.key
    : undefined;
  const selectedMilestoneKey = search.milestone ?? notificationMilestoneKey;
  const buildRouteAvailability = useQuery(
    api.production_proposals.getActiveBuildRouteAvailabilityByString,
    visualFixtureEnabled || productionBuildQuery !== null
      ? "skip"
      : {
          buildId,
          workosOrganizationId: context.organizationId as string,
        }
  ) as BuildRouteAvailability | undefined;
  useRouteBreadcrumbProjection(
    "/backoffice/builds/$buildId",
    resolveBuildBreadcrumbLabel({
      availability: buildRouteAvailability,
      detail: effectiveProductionBuild,
    })
  );
  const activeBuildIdForWorkspace = effectiveProductionBuild?.build?._id as any;
  const milestoneSiteVisitsQuery = useQuery(
    api.production_proposals.listBrokerageSiteVisits,
    visualFixtureEnabled || !activeBuildIdForWorkspace || !selectedMilestoneKey
      ? "skip"
      : {
          buildId: activeBuildIdForWorkspace,
          milestoneKey: selectedMilestoneKey,
          workosOrganizationId: context.organizationId as string,
        }
  );
  const costDocumentViewerRoles = [context.role, ...(context.roles ?? [])];
  const costDocumentLedgerActorCapacity = costDocumentViewerRoles.includes(
    "admin"
  )
    ? "admin"
    : costDocumentViewerRoles.includes("principle-broker")
      ? "principle-broker"
      : undefined;
  const costDocumentLedger = usePaginatedQuery(
    api.cost_documents.listCostDocumentRoadmapReconciliation,
    effectiveProductionBuild && selectedMilestoneKey
      ? ({
          ...(costDocumentLedgerActorCapacity
            ? { actorCapacity: costDocumentLedgerActorCapacity }
            : {}),
          buildId: activeBuildIdForWorkspace,
          organizationId: context.organizationId as string,
        } as never)
      : "skip",
    { initialNumItems: 5 }
  );
  useEffect(() => {
    if (costDocumentLedger.status === "CanLoadMore") {
      costDocumentLedger.loadMore(5);
    }
  }, [costDocumentLedger.loadMore, costDocumentLedger.status]);
  const timelineWorkspaceQuery = useQuery(
    (api as any).production_proposals.getActiveBuildTimelineWorkspace,
    visualFixtureEnabled || !tabNeedsTimeline
      ? "skip"
      : effectiveProductionBuild
        ? {
            buildId: activeBuildIdForWorkspace,
            workosOrganizationId: context.organizationId as string,
          }
        : "skip"
  );
  const effectiveTimelineWorkspace = visualFixtureEnabled
    ? visualParityTimeline
    : timelineWorkspaceQuery;
  const calendarWorkspaceQuery = useQuery(
    (api as any).production_proposals.getActiveBuildCalendarWorkspace,
    visualFixtureEnabled || !tabNeedsCalendar
      ? "skip"
      : effectiveProductionBuild
        ? {
            buildId: activeBuildIdForWorkspace,
            workosOrganizationId: context.organizationId as string,
          }
        : "skip"
  );

  const onChangeTab = (tab: BuildDetailSubTab, focus?: string) =>
    navigate({
      to: "/backoffice/builds/$buildId",
      params: { buildId },
      search: {
        ...search,
        costBatch: tab === "costs" ? search.costBatch : undefined,
        costDocument: tab === "costs" ? search.costDocument : undefined,
        costDocumentDraft:
          tab === "costs" ? search.costDocumentDraft : undefined,
        focus: focus ?? search.focus,
        roundId: tab === "quotes" ? search.roundId : undefined,
        tab,
      },
      replace: !focus || focus === search.focus,
    });

  const onChangeRail = (rail: "open" | "closed") =>
    navigate({
      to: "/backoffice/builds/$buildId",
      params: { buildId },
      search: { ...search, rail },
      replace: true,
    });

  const onChangeMilestone = (milestone?: string) =>
    navigate({
      to: "/backoffice/builds/$buildId",
      params: { buildId },
      resetScroll: false,
      search: { ...search, milestone },
      replace: true,
    });
  const onChangeCalendarTimeframe = (timeframe: CalendarTimeframe) =>
    navigate({
      to: "/backoffice/builds/$buildId",
      params: { buildId },
      search: { ...search, timeframe },
      replace: true,
    });

  if (effectiveProductionBuild === undefined) {
    return (
      <main className="grid min-h-[24rem] place-items-center bg-muted/30 p-4">
        <Frame>
          <FramePanel className="p-4 text-sm">
            Loading build detail...
          </FramePanel>
        </Frame>
      </main>
    );
  }

  if (effectiveProductionBuild) {
    const detail = effectiveProductionBuild as ProductionBuildDetail;
    const activeBuildId = detail.build._id as any;
    const workosOrganizationId = context.organizationId as string;
    const viewerRoles = [context.role, ...(context.roles ?? [])];
    const viewerCapacity = resolveBackofficeBuildViewerCapacity(viewerRoles);
    const appPermissions = detail.appPermissions;
    const canMakeFinalDecision = canMakeActiveBuildFinalDecision(viewerRoles);
    const costDocumentActorCapacity = viewerRoles.includes("admin")
      ? "admin"
      : viewerRoles.includes("principle-broker")
        ? "principle-broker"
        : undefined;
    const materialPlanningActions = filterMaterialPlanningActionsForPermissions(
      appPermissions,
      visualFixtureEnabled
        ? undefined
        : {
            create: (payload) =>
              createActiveBuildCostItem({
                ...payload,
                buildId: activeBuildId,
                workosOrganizationId,
              }).then(() => toast.success("Cost item added.")),
            delete: (item, reason) =>
              deleteActiveBuildCostItem({
                buildId: activeBuildId,
                itemId: item._id as any,
                reason,
                workosOrganizationId,
              }).then(() => toast.success("Cost item removed.")),
            update: (item, payload) =>
              updateActiveBuildCostItem({
                ...payload,
                buildId: activeBuildId,
                itemId: item._id as any,
                workosOrganizationId,
              }).then(() => toast.success("Cost item updated.")),
          }
    );
    const actions = createBackofficeBuildDetailActions({
      activeBuildId,
      appPermissions,
      canMakeFinalDecision,
      detail,
      documentOperationIntents,
      materialPlanningActions,
      operations: {
        addDocument,
        approveDraw,
        approveMilestone,
        assignContractorToMilestone,
        assignSiteVisit,
        attachAndInviteContractor,
        attachContractor,
        cancelActiveBuildSiteVisit,
        correctMilestoneStart,
        createContractor,
        createCalendarSyncSubscription,
        generateSiteVisitGuidance,
        rejectDraw,
        rejectMilestone,
        recordExternalCalendarSyncChange,
        releaseDraw,
        requestBudgetRevision,
        requestFacilityChange,
        requestLoanFacilityDateChange,
        requestMilestoneInfo,
        rescheduleActiveBuildSiteVisit,
        reviewBudgetRevision,
        reviewEvidence,
        reviewFacilityChangeRequest,
        reviseActiveBuildMilestoneSchedule,
        saveCalendarView,
        scheduleActiveBuildSiteVisit,
        sendContractorInvite,
        setAdminDecisionTargetDate,
        setDrawReleaseTargetDate,
        setEvidenceDueDate,
        setReviewTargetDate,
        startDrawReview,
        submitDrawForAdmin,
        updateActiveBuildNonFinancialDetails,
        removeContractorFromMilestone,
        retractMilestoneStart,
      },
      siteVisitScheduleIntents,
      workosOrganizationId,
    });
    const drawCapabilities: DrawWorkflowCapabilities = {
      canApprove: Boolean(actions.approveDraw),
      canOpenCanonical: true,
      canOpenReview:
        viewerCapacity !== "builder" && viewerCapacity !== "builder-staff",
      canReject: Boolean(actions.rejectDraw),
      canRelease: Boolean(actions.releaseDraw),
      canStartReview: Boolean(actions.startDrawReview),
      canSubmitForAdmin:
        Boolean(actions.submitDrawForAdmin) &&
        !canMakeFinalDecision &&
        viewerCapacity !== "admin" &&
        viewerCapacity !== "principle-broker",
    };
    const costDocumentSubmilestones = buildCostDocumentSubmilestoneOptions(
      detail.milestones ?? [],
      detail.submilestones ?? []
    );
    const notificationTarget =
      search.reviewCycleId &&
      search.reviewCycleNumber !== undefined &&
      (search.milestoneId || search.drawRequestId);
    if (notificationTarget) {
      return (
        <BackofficeNotificationReviewSurface
          milestoneData={
            effectiveProductionBuild && notificationMilestoneKey
              ? (toProductionMilestoneSheetData(
                  effectiveProductionBuild,
                  notificationMilestoneKey,
                  costDocumentLedger.results as CostDocumentSummary[]
                ) ?? undefined)
              : undefined
          }
          milestoneSiteVisits={milestoneSiteVisitsQuery}
          onClose={() =>
            void navigate({
              params: { buildId },
              search: { tab: search.tab },
              to: "/backoffice/builds/$buildId",
            })
          }
          reviewCycleId={search.reviewCycleId!}
          reviewCycleNumber={search.reviewCycleNumber!}
          target={
            search.milestoneId
              ? { kind: "milestone", milestoneId: search.milestoneId }
              : { drawRequestId: search.drawRequestId!, kind: "draw" }
          }
          viewerWorkosUserId={context.userId as string}
          workosOrganizationId={workosOrganizationId}
        />
      );
    }
    return (
      <BuildDetailSheetHost
        buildId={activeBuildId as Id<"activeBuilds">}
        detailTab={search.detailTab}
        focus={search.focus}
        organizationId={workosOrganizationId}
        viewerCapacity={viewerCapacity}
      >
        {(detailSheetHost) => (
          <ProductionBuildDetailSurface
            actions={actions}
            activeBuildId={activeBuildId}
            activeTab={search.tab ?? "details"}
            calendarTimeframe={search.timeframe}
            calendarWorkspace={calendarWorkspaceQuery as any}
            costDocuments={costDocumentLedger.results as CostDocumentSummary[]}
            contractorDetailHrefFor={(contractorId) =>
              `/backoffice/contractors/${contractorId}`
            }
            detailSheetHost={detailSheetHost}
            drawCapabilities={drawCapabilities}
            onOpenCanonicalTarget={detailSheetHost.controller.openTarget}
            onOpenCostDocument={(costDocument) =>
              navigate({
                params: { buildId },
                replace: false,
                search: {
                  ...search,
                  costDocument,
                  milestone: undefined,
                  tab: "costs",
                },
                to: "/backoffice/builds/$buildId",
              } as never)
            }
            costs={
              <Suspense fallback={<BuildDetailTabFallback label="costs" />}>
                {costDocumentActorCapacity ? (
                  <LazyCostDocumentBatchWorkspace
                    actorCapacity={costDocumentActorCapacity}
                    batchId={search.costBatch}
                    buildId={activeBuildId as Id<"activeBuilds">}
                    draftId={search.costDocumentDraft}
                    onBatchIdChange={(batchId) =>
                      navigate({
                        params: { buildId },
                        replace: Boolean(search.costBatch) || !batchId,
                        search: {
                          ...search,
                          costBatch: batchId,
                          costDocument: undefined,
                          costDocumentDraft: undefined,
                          tab: "costs",
                        },
                        to: "/backoffice/builds/$buildId",
                      } as never)
                    }
                    organizationId={workosOrganizationId}
                    reconciliation={{
                      onCostDocumentCorrectionStarted: ({ batchId, draftId }) =>
                        navigate({
                          params: { buildId },
                          replace: false,
                          search: {
                            ...search,
                            costBatch: batchId,
                            costDocument: undefined,
                            costDocumentDraft: draftId,
                            tab: "costs",
                          },
                          to: "/backoffice/builds/$buildId",
                        } as never),
                      onCostDocumentIdChange: (costDocumentId) =>
                        navigate({
                          params: { buildId },
                          replace: !costDocumentId,
                          search: {
                            ...search,
                            costBatch: undefined,
                            costDocument: costDocumentId,
                            costDocumentDraft: undefined,
                            tab: "costs",
                          },
                          to: "/backoffice/builds/$buildId",
                        } as never),
                      selectedCostDocumentId: search.costDocument,
                    }}
                    submilestones={costDocumentSubmilestones}
                  />
                ) : (
                  <LazyCostDocumentRoadmapReconciliation
                    actorCapacity={costDocumentActorCapacity}
                    buildId={activeBuildId as Id<"activeBuilds">}
                    interactionMode="brokerage-review"
                    onCloseCostDocument={() =>
                      navigate({
                        params: { buildId },
                        replace: true,
                        search: {
                          ...search,
                          costDocument: undefined,
                          tab: "costs",
                        },
                        to: "/backoffice/builds/$buildId",
                      } as never)
                    }
                    onOpenCostDocument={(costDocument) =>
                      navigate({
                        params: { buildId },
                        replace: false,
                        search: { ...search, costDocument, tab: "costs" },
                        to: "/backoffice/builds/$buildId",
                      } as never)
                    }
                    organizationId={workosOrganizationId}
                    selectedCostDocumentId={search.costDocument}
                    submilestones={costDocumentSubmilestones}
                  />
                )}
              </Suspense>
            }
            detail={detail}
            detailTab={search.detailTab}
            focusedReference={search.focus}
            fundingWorkspaceEnabled
            milestoneKey={search.milestone}
            milestoneSiteVisits={milestoneSiteVisitsQuery}
            onChangeCalendarTimeframe={onChangeCalendarTimeframe}
            onChangeMilestone={onChangeMilestone}
            onChangeRail={onChangeRail}
            onChangeTab={onChangeTab}
            quotes={
              <Suspense fallback={<BuildDetailTabFallback label="quotes" />}>
                {search.roundId ? (
                  <LazyQuoteRoundComparisonSurface
                    buildId={String(activeBuildId)}
                    onExit={() =>
                      navigate({
                        params: { buildId },
                        replace: true,
                        search: {
                          ...search,
                          roundId: undefined,
                          tab: "quotes",
                        },
                        to: "/backoffice/builds/$buildId",
                      } as never)
                    }
                    organizationId={workosOrganizationId}
                    quoteRoundId={search.roundId}
                    readerKind="backoffice"
                    readOnly
                  />
                ) : (
                  <LazyQuoteRoundsSurface
                    buildId={String(activeBuildId)}
                    onCreate={() =>
                      navigate({
                        params: { buildId },
                        search: {},
                        to: "/backoffice/builds/$buildId/quotes/new",
                      })
                    }
                    onOpen={(roundId) =>
                      navigate({
                        params: { buildId },
                        search: { roundId },
                        to: "/backoffice/builds/$buildId/quotes/new",
                      })
                    }
                    organizationId={workosOrganizationId}
                  />
                )}
              </Suspense>
            }
            rail={search.rail}
            staff={
              visualFixtureEnabled ? undefined : (
                <Suspense fallback={<BuildDetailTabFallback label="staff" />}>
                  <LazyBuilderStaffPermissionsPanel
                    buildId={activeBuildId as Id<"activeBuilds">}
                    initialSelectedWorkosUserId={
                      search.focus?.startsWith("participant:")
                        ? search.focus.slice("participant:".length)
                        : undefined
                    }
                    scope="activeBuild"
                    workosOrganizationId={workosOrganizationId}
                  />
                </Suspense>
              )
            }
            timelineWorkspace={effectiveTimelineWorkspace as any}
            viewerCapacity={viewerCapacity as any}
            viewerRole="lender"
            workosOrganizationId={workosOrganizationId}
          />
        )}
      </BuildDetailSheetHost>
    );
  }

  return (
    <main className="grid min-h-[24rem] place-items-center bg-muted/30 p-4">
      <Frame>
        <FramePanel className="p-4">
          <p className="font-medium">Build detail unavailable</p>
          <p className="mt-1 text-muted-foreground text-sm">
            No production active build was found for this ID, or your
            organization cannot access it.
          </p>
        </FramePanel>
      </Frame>
    </main>
  );
}
