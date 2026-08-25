import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery } from "convex/react";
import { Loader2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { Frame, FramePanel } from "#/components/ui/frame.tsx";
import {
  canUseAppPermission,
  filterMaterialPlanningActionsForPermissions,
  hasAnyAppPermission,
} from "#/features/builder-staff/app-permissions.ts";
import { BuilderStaffPermissionsPanel } from "#/features/builder-staff/BuilderStaffPermissionsPanel.tsx";
import {
  createProposalCalendarEditHandler,
  type ProposalCalendarAdapterActions,
} from "#/features/calendar-workspace/adapters/proposalCalendarAdapter.ts";
import type {
  CalendarFilters,
  CalendarReminderEventInput,
  CalendarSyncSubscriptionResult,
  CalendarTimeframe,
} from "#/features/calendar-workspace/calendarTypes.ts";
import { BuilderNotificationReviewSurface } from "#/features/lender-portal/LenderNotificationReviewSurface.tsx";
import { BuilderProposalConfirmationStatus } from "#/features/production-proposals/BuilderProposalConfirmationStatus.tsx";
import { ProductionContractorPlanningTab } from "#/features/production-proposals/ProductionContractorPlanningTab.tsx";
import { ProductionProposalTimelineGanttWorkspace } from "#/features/production-proposals/ProductionProposalGanttWorkspace.tsx";
import { ProductionProposalMilestoneWorksheetContainer } from "#/features/production-proposals/ProductionProposalMilestoneWorksheetContainer.tsx";
import {
  ProductionProposalReviewSurface,
  type ProductionReviewTab,
} from "#/features/production-proposals/ProductionProposalSurfaces.tsx";
import { ProductionTimelineWorkspace } from "#/features/production-proposals/ProductionTimelineWorkspace.tsx";
import {
  createVisualParityCostItem,
  getVisualParityProposalDetail,
  getVisualParityTimelineWorkspace,
  isProductionVisualParityFixtureEnabled,
} from "#/features/production-proposals/visualParityFixtures.ts";
import { api } from "../../../../../convex/_generated/api";
import type { Id } from "../../../../../convex/_generated/dataModel";
import type { BuildCollaborationRole } from "../../../../../convex/build_collaboration_model";

export type BuilderProposalSearch = {
  drawRequestId?: string;
  milestoneId?: string;
  reviewCycleId?: string;
  reviewCycleNumber?: number;
  tab?: ProductionReviewTab;
  timeframe?: CalendarTimeframe;
};

const BUILDER_PROPOSAL_TABS = new Set<ProductionReviewTab>([
  "calendar",
  "closing",
  "contractors",
  "draws",
  "gantt",
  "milestones",
  "materials",
  "packet",
  "review",
  "staff",
  "timeline",
]);
const CALENDAR_TIMEFRAMES = new Set<CalendarTimeframe>([
  "agenda",
  "day",
  "month",
  "quarter",
  "week",
]);
const POSITIVE_INTEGER_SEARCH_VALUE = /^[1-9]\d*$/;

type BuilderProposalRouteTab = ProductionReviewTab;

export function validateBuilderProposalSearch(
  search: Record<string, unknown>
): BuilderProposalSearch {
  const candidateTab =
    typeof search.tab === "string"
      ? (search.tab as ProductionReviewTab)
      : undefined;
  const tab =
    candidateTab && BUILDER_PROPOSAL_TABS.has(candidateTab)
      ? candidateTab
      : undefined;
  const candidateTimeframe =
    typeof search.timeframe === "string"
      ? (search.timeframe as CalendarTimeframe)
      : undefined;
  const timeframe =
    candidateTimeframe && CALENDAR_TIMEFRAMES.has(candidateTimeframe)
      ? candidateTimeframe
      : undefined;
  const reviewCycleNumber = normalizeReviewCycleNumber(
    search.reviewCycleNumber
  );

  return {
    ...(typeof search.drawRequestId === "string"
      ? { drawRequestId: search.drawRequestId }
      : {}),
    ...(typeof search.milestoneId === "string"
      ? { milestoneId: search.milestoneId }
      : {}),
    ...(typeof search.reviewCycleId === "string"
      ? { reviewCycleId: search.reviewCycleId }
      : {}),
    ...(reviewCycleNumber === undefined ? {} : { reviewCycleNumber }),
    ...(tab ? { tab } : {}),
    ...(timeframe ? { timeframe } : {}),
  };
}

function normalizeReviewCycleNumber(value: unknown) {
  if (typeof value === "number") {
    return Number.isSafeInteger(value) && value > 0 ? value : undefined;
  }
  if (typeof value !== "string" || !POSITIVE_INTEGER_SEARCH_VALUE.test(value)) {
    return;
  }
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : undefined;
}

export function resolveBuilderProposalRouteTab(
  search: BuilderProposalSearch
): BuilderProposalRouteTab {
  return search.tab ?? "packet";
}

export function shouldLoadBuilderProposalCalendarWorkspace(
  activeTab: BuilderProposalRouteTab
) {
  return activeTab === "calendar";
}

export function shouldLoadBuilderProposalContractorPlanning(
  activeTab: BuilderProposalRouteTab
) {
  return (
    activeTab === "contractors" ||
    activeTab === "gantt" ||
    activeTab === "milestones"
  );
}

export function shouldMountBuilderProposalStaffPanel(
  activeTab: BuilderProposalRouteTab
) {
  return activeTab === "staff";
}

export const Route = createFileRoute("/builder/proposals/$proposalId/")({
  ssr: false,
  validateSearch: validateBuilderProposalSearch,
  component: BuilderProductionProposalRoute,
});

function BuilderProductionProposalRoute() {
  const { proposalId } = Route.useParams();
  const search = Route.useSearch();
  const context = Route.useRouteContext();
  return (
    <BuilderProductionProposalWorkspace
      includeStaffTab
      proposalId={proposalId}
      routeBase="/builder"
      search={search}
      viewerCapacity="builder"
      workosOrganizationId={context.organizationId as string}
    />
  );
}

export function BuilderProductionProposalWorkspace({
  includeStaffTab,
  proposalId,
  routeBase,
  search,
  viewerCapacity = routeBase === "/builder-staff" ? "builder-staff" : "builder",
  workosOrganizationId,
}: {
  includeStaffTab: boolean;
  proposalId: string;
  routeBase: "/builder" | "/builder-staff";
  search: BuilderProposalSearch;
  viewerCapacity?: BuildCollaborationRole;
  workosOrganizationId: string;
}) {
  const navigate = useNavigate();
  const visualFixtureEnabled = isProductionVisualParityFixtureEnabled();
  const typedProposalId = proposalId as Id<"buildProposals">;
  const visualProposalDetail = useMemo(
    () => getVisualParityProposalDetail(proposalId),
    [proposalId]
  );
  const [visualCostItems, setVisualCostItems] = useState(
    () => visualProposalDetail.costItems ?? []
  );
  const [confirmationHistoryLimit, setConfirmationHistoryLimit] = useState(20);
  const activeProposalTab = resolveBuilderProposalRouteTab(search);
  const loadCalendarWorkspace =
    shouldLoadBuilderProposalCalendarWorkspace(activeProposalTab);
  const loadContractorPlanning =
    shouldLoadBuilderProposalContractorPlanning(activeProposalTab);
  useEffect(() => {
    setVisualCostItems(visualProposalDetail.costItems ?? []);
  }, [visualProposalDetail]);
  const visualMaterialPlanningActions = useMemo(
    () => ({
      create: (payload: Parameters<typeof createVisualParityCostItem>[0]) => {
        setVisualCostItems((current) => [
          ...current,
          createVisualParityCostItem(payload, `${current.length + 1}`),
        ]);
      },
      delete: (item: { _id: string }) => {
        setVisualCostItems((current) =>
          current.filter((candidate) => candidate._id !== item._id)
        );
      },
      update: (
        item: { _id: string },
        payload: Parameters<typeof createVisualParityCostItem>[0]
      ) => {
        setVisualCostItems((current) =>
          current.map((candidate) =>
            candidate._id === item._id
              ? {
                  ...createVisualParityCostItem(payload, candidate._id),
                  _id: item._id,
                }
              : candidate
          )
        );
      },
    }),
    []
  );
  const workspaceQuery = useQuery(
    api.production_proposals.getProductionTimelineWorkspace,
    visualFixtureEnabled
      ? "skip"
      : {
          proposalId: typedProposalId,
          workosOrganizationId,
        }
  );
  const contractorPlanningQuery = useQuery(
    (api as any).production_proposals.getProposalContractorPlanning,
    visualFixtureEnabled || !loadContractorPlanning
      ? "skip"
      : {
          proposalId: typedProposalId,
          workosOrganizationId,
        }
  );
  const workspace = visualFixtureEnabled
    ? getVisualParityTimelineWorkspace(proposalId)
    : workspaceQuery
      ? {
          ...workspaceQuery,
          contractorPlanning: contractorPlanningQuery ?? undefined,
        }
      : workspaceQuery;
  const detailQuery = useQuery(
    api.production_proposals.getProposalDetailByString,
    visualFixtureEnabled
      ? "skip"
      : {
          proposalId,
          workosOrganizationId,
        }
  );
  const detail = visualFixtureEnabled
    ? { ...visualProposalDetail, costItems: visualCostItems }
    : detailQuery;
  const confirmationStateQuery = useQuery(
    api.production_proposals.getBuilderProposalConfirmationState,
    visualFixtureEnabled
      ? "skip"
      : {
          historyPaginationOpts: {
            cursor: null,
            numItems: confirmationHistoryLimit,
          },
          proposalId: typedProposalId,
          workosOrganizationId,
        }
  );
  const calendarWorkspaceQuery = useQuery(
    (api as any).production_proposals.getProposalCalendarWorkspace,
    visualFixtureEnabled || !loadCalendarWorkspace
      ? "skip"
      : {
          proposalId: typedProposalId,
          workosOrganizationId,
        }
  );
  const calendarAssignableParticipantsQuery = useQuery(
    (api as any).production_proposals
      .listProposalCalendarAssignableParticipants,
    visualFixtureEnabled || !detail || !loadCalendarWorkspace
      ? "skip"
      : {
          proposalId: typedProposalId,
          workosOrganizationId,
        }
  );
  const createProposalCostItem = useMutation(
    api.production_proposals.createProposalCostItem
  );
  const updateProposalCostItem = useMutation(
    api.production_proposals.updateProposalCostItem
  );
  const deleteProposalCostItem = useMutation(
    api.production_proposals.deleteProposalCostItem
  );
  const submitProductionProposal = useMutation(
    api.production_proposals.submitProposal
  );
  const createProductionTimelineMilestone = useMutation(
    api.production_proposals.createProductionTimelineMilestone
  );
  const updateProductionTimelineMilestone = useMutation(
    api.production_proposals.updateProductionTimelineMilestone
  );
  const updateProductionProposalProposedStartDate = useMutation(
    api.production_proposals.updateProductionProposalProposedStartDate
  );
  const generateProposalDocumentUploadUrl = useMutation(
    api.production_proposals.generateProposalDocumentUploadUrl
  );
  const addProposalDocument = useMutation(
    (api as any).production_proposals.addProposalDocument
  );
  const reviseProposalMilestoneSchedule = useMutation(
    (api as any).production_proposals.reviseProposalMilestoneSchedule
  );
  const setEvidenceDueDate = useMutation(
    (api as any).production_proposals.setEvidenceDueDate
  );
  const setReviewTargetDate = useMutation(
    (api as any).production_proposals.setReviewTargetDate
  );
  const saveCalendarView = useMutation(
    (api as any).production_proposals.saveCalendarView
  );
  const createProposalReminderCalendarEvent = useMutation(
    (api as any).production_proposals.createProposalReminderCalendarEvent
  );
  const updateProposalReminderCalendarEvent = useMutation(
    (api as any).production_proposals.updateProposalReminderCalendarEvent
  );
  const deleteProposalReminderCalendarEvent = useMutation(
    (api as any).production_proposals.deleteProposalReminderCalendarEvent
  );
  const createCalendarSyncSubscription = useMutation(
    (api as any).production_proposals.createCalendarSyncSubscription
  );
  const recordExternalCalendarSyncChange = useMutation(
    (api as any).production_proposals.recordExternalCalendarSyncChange
  );

  if (!(workspace && detail)) {
    return (
      <div className="grid min-h-[24rem] place-items-center">
        <div className="flex items-center gap-2 rounded-lg border bg-background p-4 text-sm">
          <Loader2 className="size-4 animate-spin" />
          Loading production proposal...
        </div>
      </div>
    );
  }

  const appPermissions = detail.appPermissions;
  const isDraftProposal = detail.proposal.status === "draft";
  const canMutateContractors =
    isDraftProposal &&
    hasAnyAppPermission(appPermissions, [
      ["contractor", "create"],
      ["contractor", "update"],
    ]);
  const canViewContractors = canUseAppPermission(
    appPermissions,
    "contractor",
    "view"
  );
  const canEditProposalMilestones =
    isDraftProposal &&
    hasAnyAppPermission(appPermissions, [
      ["milestone", "create"],
      ["milestone", "delete"],
      ["milestone", "update"],
      ["submilestone", "create"],
      ["submilestone", "delete"],
      ["submilestone", "update"],
    ]);
  const canUploadProposalDocuments =
    isDraftProposal &&
    canUseAppPermission(appPermissions, "evidence", "create");
  const proposalEditorPersistenceMode =
    visualFixtureEnabled || !canEditProposalMilestones ? "noop" : "convex";
  const materialPlanningActions = isDraftProposal
    ? filterMaterialPlanningActionsForPermissions(
        appPermissions,
        visualFixtureEnabled
          ? visualMaterialPlanningActions
          : {
              create: (payload) =>
                createProposalCostItem({
                  ...payload,
                  proposalId: typedProposalId,
                  workosOrganizationId,
                }).then(() => toast.success("Cost item added.")),
              delete: (item, reason) =>
                deleteProposalCostItem({
                  itemId: item._id as any,
                  proposalId: typedProposalId,
                  reason,
                  workosOrganizationId,
                }).then(() => toast.success("Cost item removed.")),
              update: (item, payload) =>
                updateProposalCostItem({
                  ...payload,
                  itemId: item._id as any,
                  proposalId: typedProposalId,
                  workosOrganizationId,
                }).then(() => toast.success("Cost item updated.")),
            }
      )
    : undefined;
  const calendarAdapterActions: ProposalCalendarAdapterActions = {
    addEvidenceDueDate:
      isDraftProposal &&
      canUseAppPermission(appPermissions, "evidence", "update")
        ? (input) =>
            setEvidenceDueDate({
              ...input,
              proposalId: typedProposalId,
              workosOrganizationId,
            }).then(() => toast.success("Evidence due date set."))
        : undefined,
    addReviewTargetDate:
      isDraftProposal &&
      canUseAppPermission(appPermissions, "reminder", "create")
        ? (input) =>
            setReviewTargetDate({
              ...input,
              proposalId: typedProposalId,
              workosOrganizationId,
            }).then(() => toast.success("Review target date set."))
        : undefined,
    reviseDrawTiming: undefined,
    reviseMilestoneSchedule:
      isDraftProposal &&
      canUseAppPermission(appPermissions, "milestone", "update")
        ? (input) =>
            reviseProposalMilestoneSchedule({
              ...input,
              proposalId: typedProposalId,
              workosOrganizationId,
            }).then(() => toast.success("Milestone schedule revised."))
        : undefined,
  };
  const commitCalendarEdit = createProposalCalendarEditHandler({
    actions: calendarAdapterActions,
    baseDate:
      detail.activeBuild?.startDate ??
      detail.proposal.proposedStartDate ??
      "2026-06-01",
  });

  const notificationTarget =
    search.reviewCycleId &&
    search.reviewCycleNumber !== undefined &&
    (search.milestoneId || search.drawRequestId);
  if (notificationTarget) {
    return (
      <BuilderNotificationReviewSurface
        onClose={() =>
          navigate({
            params: { proposalId },
            search: { tab: search.tab },
            to: "/builder/proposals/$proposalId/",
          }).catch(() => undefined)
        }
        onOpenBuild={({ buildId, milestoneKey }) =>
          navigate({
            params: { buildId },
            search: { milestone: milestoneKey, tab: "milestones" },
            to: "/builder/builds/$buildId/",
          }).catch(() => undefined)
        }
        onResubmitted={({ cycleId, cycleNumber }) =>
          navigate({
            params: { proposalId },
            replace: true,
            search: {
              ...(search.milestoneId
                ? { milestoneId: search.milestoneId }
                : { drawRequestId: search.drawRequestId }),
              reviewCycleId: cycleId,
              reviewCycleNumber: cycleNumber,
              tab: search.tab,
            },
            to: "/builder/proposals/$proposalId/",
          }).catch(() => undefined)
        }
        reviewCycleId={search.reviewCycleId!}
        reviewCycleNumber={search.reviewCycleNumber!}
        target={
          search.milestoneId
            ? { kind: "milestone", milestoneId: search.milestoneId }
            : { drawRequestId: search.drawRequestId!, kind: "draw" }
        }
        viewerWorkosUserId=""
        workosOrganizationId={workosOrganizationId}
      />
    );
  }

  return (
    <ProductionProposalReviewSurface
      calendarAdapterActions={calendarAdapterActions}
      calendarAssignableParticipants={calendarAssignableParticipantsQuery ?? []}
      calendarTimeframe={search.timeframe}
      calendarWorkspace={calendarWorkspaceQuery as any}
      contractors={
        canViewContractors ? (
          activeProposalTab === "contractors" &&
          loadContractorPlanning &&
          contractorPlanningQuery === undefined ? (
            <DeferredBuilderProposalTabPanel
              label="Contractor planning"
              loading
            />
          ) : (
            <ProductionContractorPlanningTab
              canMutate={canMutateContractors}
              initialRole="builder"
              persistenceMode={
                visualFixtureEnabled || !isDraftProposal ? "noop" : "convex"
              }
              proposalId={typedProposalId}
              workosOrganizationId={workosOrganizationId}
              workspace={workspace}
            />
          )
        ) : undefined
      }
      detail={detail}
      gantt={
        <ProductionProposalTimelineGanttWorkspace
          persistenceMode={
            visualFixtureEnabled || !isDraftProposal ? "noop" : "convex"
          }
          proposalId={typedProposalId}
          workosOrganizationId={workosOrganizationId}
          workspace={workspace}
        />
      }
      initialActiveTab={activeProposalTab}
      approvalStatusSurface={
        visualFixtureEnabled ? undefined : confirmationStateQuery ? (
          <BuilderProposalConfirmationStatus
            onLoadMoreHistory={() =>
              setConfirmationHistoryLimit((current) => current + 20)
            }
            state={confirmationStateQuery}
          />
        ) : (
          <div
            className="flex items-center gap-2 text-muted-foreground text-sm"
            role="status"
          >
            <Loader2 aria-hidden className="size-4 animate-spin" />
            Loading proposal confirmation status…
          </div>
        )
      }
      materialPlanningActions={materialPlanningActions}
      milestones={
        <ProductionProposalMilestoneWorksheetContainer
          canMutateContractors={!visualFixtureEnabled && isDraftProposal}
          contractorPlanning={workspace.contractorPlanning}
          detail={detail}
          materialPlanningActions={materialPlanningActions}
          persistenceMode={proposalEditorPersistenceMode}
          proposalId={typedProposalId}
          scopeRoute="builder-proposal"
          showHeading
          templateTitle={detail.proposal.buildName}
          viewerCapacity={viewerCapacity}
          workosOrganizationId={workosOrganizationId}
        />
      }
      onChangeCalendarTimeframe={(timeframe) =>
        void navigate({
          params: { proposalId },
          replace: true,
          search: { ...search, timeframe },
          to: `${routeBase}/proposals/$proposalId`,
        } as never)
      }
      onChangeReviewTab={(tab) =>
        void navigate({
          params: { proposalId },
          replace: true,
          search: { ...search, tab },
          to: `${routeBase}/proposals/$proposalId`,
        } as never)
      }
      onCommitCalendarEdit={commitCalendarEdit}
      onCreateCalendarReminderEvent={
        canUseAppPermission(appPermissions, "reminder", "create")
          ? (input: CalendarReminderEventInput) =>
              createProposalReminderCalendarEvent({
                ...input,
                proposalId: typedProposalId,
                workosOrganizationId,
              })
          : undefined
      }
      onCreateCalendarSyncSubscription={(input: {
        direction: "bidirectional" | "outbound";
        filters: CalendarFilters;
        provider: "google" | "ics" | "outlook";
        sourceId: string;
        surface: "activeBuild" | "proposal";
      }) =>
        createCalendarSyncSubscription({
          ...input,
          proposalId:
            input.surface === "proposal"
              ? (input.sourceId as Id<"buildProposals">)
              : undefined,
          workosOrganizationId,
        }) as Promise<CalendarSyncSubscriptionResult>
      }
      onCreatePacketMilestone={
        canEditProposalMilestones
          ? (milestone) =>
              createProductionTimelineMilestone({
                milestone,
                proposalId: typedProposalId,
                workosOrganizationId,
              }).then(() => toast.success("Milestone added."))
          : undefined
      }
      onDeleteCalendarReminderEvent={
        canUseAppPermission(appPermissions, "reminder", "delete")
          ? (input) =>
              deleteProposalReminderCalendarEvent({
                ...input,
                eventId: input.eventId as Id<"calendarReminderEvents">,
                proposalId: typedProposalId,
                workosOrganizationId,
              })
          : undefined
      }
      onRecordExternalCalendarSyncChange={(input) =>
        recordExternalCalendarSyncChange({
          ...input,
          workosOrganizationId,
        })
      }
      onSaveCalendarView={(input) =>
        saveCalendarView({
          ...input,
          surface: "proposal",
          workosOrganizationId,
        })
      }
      onSubmit={
        canEditProposalMilestones
          ? () =>
              submitProductionProposal({
                proposalId: typedProposalId,
                workosOrganizationId,
              }).then(() =>
                toast.success("Proposal submitted to lender review.")
              )
          : undefined
      }
      onUpdateCalendarReminderEvent={
        canUseAppPermission(appPermissions, "reminder", "update")
          ? (input) =>
              updateProposalReminderCalendarEvent({
                ...input,
                eventId: input.eventId as Id<"calendarReminderEvents">,
                proposalId: typedProposalId,
                workosOrganizationId,
              })
          : undefined
      }
      onUpdateDraw={undefined}
      onUpdatePacketMilestone={
        canEditProposalMilestones
          ? (milestoneKey, patch) =>
              updateProductionTimelineMilestone({
                ...patch,
                milestoneKey,
                proposalId: typedProposalId,
                workosOrganizationId,
              }).then(() => toast.success("Milestone updated."))
          : undefined
      }
      onUpdateProposedStartDate={
        canEditProposalMilestones
          ? (proposedStartDate) =>
              updateProductionProposalProposedStartDate({
                proposalId: typedProposalId,
                proposedStartDate,
                workosOrganizationId,
              }).then(() => toast.success("Proposed start date updated."))
          : undefined
      }
      onUploadPermitDocument={
        canUploadProposalDocuments
          ? async (file) => {
              const uploadUrl = await generateProposalDocumentUploadUrl({
                proposalId: typedProposalId,
                workosOrganizationId,
              });
              const response = await fetch(uploadUrl, {
                body: file,
                headers: {
                  "Content-Type": file.type || "application/pdf",
                },
                method: "POST",
              });
              if (!response.ok) {
                throw new Error(`Permit upload failed for ${file.name}.`);
              }
              const { storageId } = (await response.json()) as {
                storageId: string;
              };
              await addProposalDocument({
                documentType: "permit",
                fileName: file.name,
                mimeType: file.type || "application/pdf",
                proposalId: typedProposalId,
                sizeBytes: file.size,
                storageId: storageId as Id<"_storage">,
                workosOrganizationId,
              });
            }
          : undefined
      }
      staff={
        visualFixtureEnabled || !includeStaffTab ? undefined : (
          <>
            {shouldMountBuilderProposalStaffPanel(activeProposalTab) ? (
              <BuilderStaffPermissionsPanel
                proposalId={typedProposalId}
                scope="proposal"
                workosOrganizationId={workosOrganizationId}
              />
            ) : (
              <DeferredBuilderProposalTabPanel label="Staff permissions" />
            )}
          </>
        )
      }
      timeline={
        <ProductionTimelineWorkspace
          appPermissions={appPermissions}
          backofficeHref={`/backoffice/proposals/${proposalId}`}
          embedded
          initialRole="builder"
          persistenceMode={
            visualFixtureEnabled || !isDraftProposal ? "noop" : "convex"
          }
          proposalHref={`${routeBase}/proposals/${proposalId}`}
          proposalId={typedProposalId}
          workosOrganizationId={workosOrganizationId}
          workspace={workspace}
        />
      }
    />
  );
}

function DeferredBuilderProposalTabPanel({
  label,
  loading = false,
}: {
  label: string;
  loading?: boolean;
}) {
  return (
    <Frame>
      <FramePanel className="flex min-h-40 items-center justify-center p-6">
        <div className="flex items-center gap-2 text-muted-foreground text-sm">
          {loading ? <Loader2 className="size-4 animate-spin" /> : null}
          {loading ? `Loading ${label.toLowerCase()}...` : label}
        </div>
      </FramePanel>
    </Frame>
  );
}
