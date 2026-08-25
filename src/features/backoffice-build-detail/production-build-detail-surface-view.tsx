"use client";

import type * as React from "react";
import type { Dispatch, SetStateAction } from "react";

import { Frame, FramePanel } from "#/components/ui/frame.tsx";
import type { BrokerageSiteVisitsResult } from "#/features/backoffice-site-visits/site-visit-types.ts";
import {
  BuildDetailIntegritySheet,
  type BuildDetailSheetHostState,
} from "#/features/build-detail-targets/BuildDetailSheetHost.tsx";
import type { BuildSubmilestoneDetailTab } from "#/features/build-detail-targets/buildDetailTab.ts";
import type {
  BuildDetailTarget,
  BuildDetailTargetContext,
} from "#/features/build-detail-targets/buildDetailTarget.ts";
import { SubmilestoneDetailSheet } from "#/features/build-submilestone-detail/SubmilestoneDetailSheet.tsx";
import { ContractorQuickAddDrawer } from "#/features/contractors/ContractorQuickAddDrawer.tsx";
import type {
  CalendarTimeframe,
  DrawFlowCalendarWorkspaceData,
} from "#/features/calendar-workspace/calendarTypes.ts";
import type { CostDocumentSummary } from "#/features/cost-documents/CostDocumentRoadmapReconciliation.tsx";
import type { DrawWorkflowCapabilities } from "#/features/draw-workflow/drawWorkflow.ts";
import type { Id } from "../../../convex/_generated/dataModel";
import type { ActiveBuildTimelineWorkspaceProps } from "./ActiveBuildTimelineWorkspace";
import {
  type BuildDetailSubTab,
  BuildDetailTabBar,
} from "./BuildDetailTabs";
import {
  DeferredBuildCollaborationWorkspace,
  preloadBuildDetailTab,
} from "./lazy-build-detail-tabs.tsx";
import { EventRailSheet } from "./EventRail";
import { MilestoneCollaborationAggregate } from "./MilestoneCollaborationAggregate.tsx";
import { MilestoneReviewMenuItems } from "./MilestoneReviewMenuItems.tsx";
import {
  MilestoneDetailSheet,
  type MilestoneSheetData,
} from "./MilestoneDetailSheet";
import {
  type MilestoneStartConfirmation,
  MilestoneStartDialog,
  type MilestoneStartDialogRequest,
  type MilestoneStartSource,
} from "./MilestoneStartDialog.tsx";
import {
  type SiteVisitOrderConfirmation,
  SiteVisitOrderDialog,
  type SiteVisitOrderRequest,
} from "./SiteVisitOrderDialog.tsx";
import type {
  ProductionBuildDetail,
  ProductionBuildDetailActions,
  ProductionBuildProjection,
  ProductionMilestone,
  ProductionSubmilestone,
  ProductionViewerCapacity,
} from "./production-build-detail-contracts.ts";
import {
  ProductionBuildMaterialsTab,
  ProductionCalendarTab,
  ProductionGanttTab,
} from "./production-build-detail-workspaces.tsx";
import {
  ProductionContractorsTab,
  ProductionDocumentsTab,
  ProductionMilestonesTab,
} from "./production-build-detail-support.tsx";
import {
  ProductionEvidenceTab,
  ProductionTimelineTab,
} from "./production-build-detail-evidence.tsx";
import {
  ProductionDetailsTab,
  ProductionBuildHeader,
} from "./production-build-detail-header.tsx";
import { contractorAssignmentOptions } from "./production-build-detail-evidence-utils.ts";

type AssignContractorTarget = {
  milestoneKey: string;
  submilestoneKeys?: string[];
};

type MilestoneStartController = {
  onCancel?: () => void;
  onConfirm?: (
    input: MilestoneStartConfirmation
  ) => Promise<unknown> | unknown;
  request: MilestoneStartDialogRequest;
};

type ProductionBuildDetailSurfaceViewProps = {
  actions?: ProductionBuildDetailActions;
  activeBuildId?: string;
  activeMilestone: ProductionMilestone | null;
  activeMilestoneKey: string | null;
  activeTab: BuildDetailSubTab;
  activeTabLabel: string;
  assignContractorTarget: AssignContractorTarget | null;
  breadcrumbRootHref: string;
  breadcrumbRootLabel: string;
  breadcrumbSectionHref: string;
  breadcrumbSectionLabel: string;
  calendarTimeframe?: CalendarTimeframe;
  calendarWorkspace?: DrawFlowCalendarWorkspaceData | null;
  canonicalDetailRetryVersion: number;
  confirmMilestoneStart: (
    input: MilestoneStartConfirmation
  ) => Promise<unknown> | unknown;
  confirmSiteVisitOrder: (
    input: SiteVisitOrderConfirmation
  ) => Promise<unknown> | unknown;
  confirmStartAndCompletion: <T>(
    request: MilestoneStartDialogRequest,
    execute: (input: MilestoneStartConfirmation) => Promise<T> | T
  ) => Promise<T>;
  contractorDetailHrefFor?: (contractorId: string) => string;
  costDocuments?: CostDocumentSummary[];
  costs?: React.ReactNode;
  currentDay: number;
  detail: ProductionBuildDetail;
  detailSheetHost?: BuildDetailSheetHostState;
  detailTab?: BuildSubmilestoneDetailTab;
  effectiveFocusedReference?: string;
  eventCount: number;
  eventsOpen: boolean;
  focusedSubmilestoneId?: string;
  fundingWorkspaceEnabled: boolean;
  milestoneSiteVisits?: BrokerageSiteVisitsResult;
  milestoneStartController: MilestoneStartController | null;
  milestoneStartRequest: MilestoneStartDialogRequest | null;
  milestoneStartRevisionError: string | null;
  onChangeCalendarTimeframe?: (timeframe: CalendarTimeframe) => void;
  onChangeRail: (rail: "open" | "closed") => void;
  onChangeTab: (tab: BuildDetailSubTab, focus?: string) => void;
  onOpenCanonicalTarget?: (
    target: BuildDetailTarget,
    context?: BuildDetailTargetContext
  ) => void;
  onOpenCostDocument?: (costDocumentId: string) => void;
  openCanonicalReference: (reference: {
    entityId: string;
    entityKind: string;
    href: string;
  }) => void;
  openCostDocumentPage: (page: { assetId: string }) => Promise<void>;
  openMilestoneStart: (
    milestoneKey: string,
    source: MilestoneStartSource,
    submilestoneKey?: string,
    action?: "correct" | "retract" | "start"
  ) => MilestoneStartDialogRequest | undefined;
  openSubmilestoneReview: (submilestoneKey: string) => void;
  permit: ReturnType<typeof import("#/features/build-permit-viewer/BuildPermitViewerDrawer.tsx").firstPermitDocument>;
  projection: ProductionBuildProjection;
  quotes?: React.ReactNode;
  requestSiteVisit: (request: SiteVisitOrderRequest) => void;
  setActiveMilestoneKey: (next: string | null) => void;
  setAssignContractorTarget: Dispatch<
    SetStateAction<AssignContractorTarget | null>
  >;
  setCanonicalDetailRetryVersion: Dispatch<SetStateAction<number>>;
  setLocalFocusedReference: Dispatch<SetStateAction<string | undefined>>;
  setMilestoneStartController: Dispatch<
    SetStateAction<MilestoneStartController | null>
  >;
  setSiteVisitOrderRequest: Dispatch<
    SetStateAction<SiteVisitOrderRequest | null>
  >;
  sheetData: MilestoneSheetData | null;
  siteVisitOrderMilestone: ProductionMilestone | null;
  siteVisitOrderRequest: SiteVisitOrderRequest | null;
  siteVisitOrderSubmilestones: ProductionSubmilestone[];
  staff?: React.ReactNode;
  timelineWorkspace?: ActiveBuildTimelineWorkspaceProps["workspace"] | null;
  viewerCapacity?: ProductionViewerCapacity;
  viewerRole: "builder" | "lender";
  visibleTabs?: BuildDetailSubTab[];
  workflowCapabilities: DrawWorkflowCapabilities;
  workosOrganizationId?: string;
};

export function ProductionBuildDetailSurfaceView({
  actions,
  activeBuildId,
  activeMilestone,
  activeMilestoneKey,
  activeTab,
  activeTabLabel,
  assignContractorTarget,
  breadcrumbRootHref,
  breadcrumbRootLabel,
  breadcrumbSectionHref,
  breadcrumbSectionLabel,
  calendarTimeframe,
  calendarWorkspace,
  canonicalDetailRetryVersion,
  confirmMilestoneStart,
  confirmSiteVisitOrder,
  confirmStartAndCompletion,
  contractorDetailHrefFor,
  costDocuments,
  costs,
  currentDay,
  detail,
  detailSheetHost,
  detailTab,
  effectiveFocusedReference,
  eventCount,
  eventsOpen,
  focusedSubmilestoneId,
  fundingWorkspaceEnabled,
  milestoneSiteVisits,
  milestoneStartController,
  milestoneStartRequest,
  milestoneStartRevisionError,
  onChangeCalendarTimeframe,
  onChangeRail,
  onChangeTab,
  onOpenCanonicalTarget,
  onOpenCostDocument,
  openCanonicalReference,
  openCostDocumentPage,
  openMilestoneStart,
  openSubmilestoneReview,
  permit,
  projection,
  quotes,
  requestSiteVisit,
  setActiveMilestoneKey,
  setAssignContractorTarget,
  setCanonicalDetailRetryVersion,
  setLocalFocusedReference,
  setMilestoneStartController,
  setSiteVisitOrderRequest,
  sheetData,
  siteVisitOrderMilestone,
  siteVisitOrderRequest,
  siteVisitOrderSubmilestones,
  staff,
  timelineWorkspace,
  viewerCapacity,
  viewerRole,
  visibleTabs,
  workflowCapabilities,
  workosOrganizationId,
}: ProductionBuildDetailSurfaceViewProps) {

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
          onPreloadTab={preloadBuildDetailTab}
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
              detailSheetHost={detailSheetHost}
              detailTab={detailTab}
              drawCapabilities={workflowCapabilities}
              focusedReference={effectiveFocusedReference}
              fundingWorkspaceEnabled={fundingWorkspaceEnabled}
              onChangeTab={onChangeTab}
              onFocusReference={setLocalFocusedReference}
              onOpenCanonicalTarget={onOpenCanonicalTarget}
              onOpenMilestone={setActiveMilestoneKey}
              projection={projection}
              viewerCapacity={viewerCapacity}
              viewerRole={viewerRole}
              workosOrganizationId={workosOrganizationId}
            />
          ) : null}
          {activeTab === "documents" ? (
            <ProductionDocumentsTab actions={actions} detail={detail} />
          ) : null}
          {activeTab === "costs" ? costs : null}
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
              onOpenCanonicalTarget={onOpenCanonicalTarget}
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
              onOpenCanonicalTarget={onOpenCanonicalTarget}
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
              onOpenCanonicalTarget={onOpenCanonicalTarget}
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
              onOpenCanonicalTarget={onOpenCanonicalTarget}
            />
          ) : null}
          {activeTab === "quotes" ? quotes : null}
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
              onOpenCanonicalTarget={onOpenCanonicalTarget}
              onOpenMilestone={setActiveMilestoneKey}
              onRequestSiteVisit={requestSiteVisit}
              onStartWork={
                viewerRole === "builder" && actions?.startMilestoneWork
                  ? (milestoneKey) =>
                      openMilestoneStart(milestoneKey, "calendar")
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
              onOpenCanonicalTarget={onOpenCanonicalTarget}
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
      {activeTab !== "details" &&
      detailSheetHost &&
      (detailSheetHost.target?.kind === "actionItem" ||
        effectiveFocusedReference?.startsWith("actionItem:")) ? (
        <div
          aria-hidden="true"
          className="hidden"
          data-testid="production-external-action-item-workspace"
        >
          <DeferredBuildCollaborationWorkspace
            buildId={detail.build._id}
            detailSheetHost={detailSheetHost}
            detailTab={detailTab}
            drawCapabilities={workflowCapabilities}
            eager
            focusedReference={effectiveFocusedReference}
            organizationId={workosOrganizationId}
            viewerCapacity={viewerCapacity}
          />
        </div>
      ) : null}
      <EventRailSheet
        auditEvents={detail.auditEvents ?? []}
        onOpenCanonicalTarget={onOpenCanonicalTarget}
        onOpenChange={(open) => onChangeRail(open ? "open" : "closed")}
        open={eventsOpen}
        quickActionEvents={detail.quickActionEvents ?? []}
      />
      {detailSheetHost?.integrityError ? (
        <BuildDetailIntegritySheet
          error={detailSheetHost.integrityError}
          onClose={detailSheetHost.controller.close}
        />
      ) : null}
      {detailSheetHost?.target?.kind === "submilestone" ? (
        <SubmilestoneDetailSheet
          buildId={detail.build._id as Id<"activeBuilds">}
          buildSubmilestoneId={detailSheetHost.target.submilestoneId}
          canGoBack={detailSheetHost.controller.canGoBack}
          canGoForward={detailSheetHost.controller.canGoForward}
          companionActionItemId={detailSheetHost.target.companionId}
          costDocuments={costDocuments}
          key={`${detailSheetHost.target.submilestoneId}:${canonicalDetailRetryVersion}`}
          onGoBack={detailSheetHost.controller.back}
          onGoForward={detailSheetHost.controller.forward}
          onOpenChange={(open) => {
            if (!open) {
              detailSheetHost.controller.close();
            }
          }}
          onOpenCostDocument={onOpenCostDocument}
          onOpenTarget={detailSheetHost.controller.openTarget}
          onReferenceOpen={openCanonicalReference}
          onRetry={() =>
            setCanonicalDetailRetryVersion((version) => version + 1)
          }
          onSelectedTabChange={detailSheetHost.controller.selectTab}
          open
          organizationId={workosOrganizationId ?? ""}
          readOnly={detailSheetHost.readOnly}
          selectedTab={detailTab}
          viewerCapacity={viewerCapacity}
        />
      ) : null}
      <MilestoneDetailSheet
        assignmentsSourceLabel="buildContractorAssignments"
        collaboration={
          workosOrganizationId ? (
            <MilestoneCollaborationAggregate
              buildId={detail.build._id as Id<"activeBuilds">}
              onOpenCanonicalTarget={onOpenCanonicalTarget}
              organizationId={workosOrganizationId}
              readOnly
              rows={sheetData?.submilestones ?? []}
              viewerCapacity={viewerCapacity}
            />
          ) : undefined
        }
        data={sheetData}
        eventsSourceLabel="activeBuildAuditEvents"
        focusedSubmilestoneId={focusedSubmilestoneId}
        focusedSubmilestoneKey={
          detail.submilestones.find(
            (submilestone) => submilestone._id === focusedSubmilestoneId
          )?.key
        }
        key={activeMilestoneKey ?? "milestone-sheet"}
        onAmendStart={
          actions?.correctMilestoneStart || actions?.retractMilestoneStart
            ? (action, milestoneKey) =>
                openMilestoneStart(
                  milestoneKey,
                  "milestone_detail",
                  undefined,
                  action
                )
            : undefined
        }
        onApprove={
          viewerRole === "lender" && actions?.approveMilestone
            ? (milestoneKey, note) =>
                actions.approveMilestone?.({ milestoneKey, note })
            : undefined
        }
        onAssignVisit={
          viewerRole === "lender" &&
          (actions?.assignSiteVisit || actions?.scheduleSiteVisit)
            ? (milestoneKey) => requestSiteVisit({ milestoneKey })
            : undefined
        }
        onClose={() => setActiveMilestoneKey(null)}
        onOpenCanonicalTarget={onOpenCanonicalTarget}
        onOpenCostDocument={onOpenCostDocument}
        onOpenCostDocumentPage={openCostDocumentPage}
        onReject={
          viewerRole === "lender" && actions?.rejectMilestone
            ? (milestoneKey) => actions.rejectMilestone?.({ milestoneKey })
            : undefined
        }
        onRequestInfo={
          viewerRole === "lender" && actions?.requestMilestoneInfo
            ? (milestoneKey, note) =>
                actions.requestMilestoneInfo?.({ milestoneKey, note })
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
        renderSubmilestoneReviewItems={
          viewerRole === "lender" && workosOrganizationId
            ? (row) => (
                <MilestoneReviewMenuItems
                  buildId={detail.build._id as Id<"activeBuilds">}
                  onOpenReview={openSubmilestoneReview}
                  organizationId={workosOrganizationId}
                  readOnly={false}
                  row={row}
                  viewerCapacity={viewerCapacity}
                />
              )
            : undefined
        }
        siteVisits={milestoneSiteVisits}
      />
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
      {milestoneStartRevisionError ? (
        <Frame aria-live="assertive" role="alert">
          <FramePanel className="border-destructive/35 p-3 text-destructive-text text-sm">
            {milestoneStartRevisionError}
          </FramePanel>
        </Frame>
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
