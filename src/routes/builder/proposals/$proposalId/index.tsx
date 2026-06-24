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

export type BuilderProposalSearch = {
  tab?: ProductionReviewTab;
  timeframe?: CalendarTimeframe;
};

type BuilderProposalRouteTab = ProductionReviewTab;

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
  validateSearch: (search: Record<string, unknown>): BuilderProposalSearch => {
    const tab =
      search.tab === "calendar" ||
      search.tab === "closing" ||
      search.tab === "contractors" ||
      search.tab === "draws" ||
      search.tab === "gantt" ||
      search.tab === "milestones" ||
      search.tab === "materials" ||
      search.tab === "packet" ||
      search.tab === "review" ||
      search.tab === "staff" ||
      search.tab === "timeline"
        ? (search.tab as BuilderProposalSearch["tab"])
        : undefined;
    const timeframe =
      search.timeframe === "day" ||
      search.timeframe === "week" ||
      search.timeframe === "month" ||
      search.timeframe === "quarter" ||
      search.timeframe === "agenda"
        ? (search.timeframe as CalendarTimeframe)
        : undefined;
    return {
      ...(tab ? { tab } : {}),
      ...(timeframe ? { timeframe } : {}),
    };
  },
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
      workosOrganizationId={context.organizationId as string}
    />
  );
}

export function BuilderProductionProposalWorkspace({
  includeStaffTab,
  proposalId,
  routeBase,
  search,
  workosOrganizationId,
}: {
  includeStaffTab: boolean;
  proposalId: string;
  routeBase: "/builder" | "/builder-staff";
  search: BuilderProposalSearch;
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
  const updateProductionDrawScheduleRow = useMutation(
    api.production_proposals.updateSubmittedProposalDrawScheduleRow
  );
  const submitProductionProposal = useMutation(
    api.production_proposals.submitProposal
  );
  const updateProductionTimelineDraw = useMutation(
    api.production_proposals.updateProductionTimelineDraw
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
  const reviseProposalDrawTiming = useMutation(
    (api as any).production_proposals.reviseProposalDrawTiming
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
  const canMutateContractors = hasAnyAppPermission(appPermissions, [
    ["contractor", "create"],
    ["contractor", "update"],
  ]);
  const canViewContractors = canUseAppPermission(
    appPermissions,
    "contractor",
    "view"
  );
  const canEditProposalMilestones = hasAnyAppPermission(appPermissions, [
    ["milestone", "create"],
    ["milestone", "delete"],
    ["milestone", "update"],
    ["submilestone", "create"],
    ["submilestone", "delete"],
    ["submilestone", "update"],
  ]);
  const canUploadProposalDocuments = canUseAppPermission(
    appPermissions,
    "evidence",
    "create"
  );
  const proposalEditorPersistenceMode =
    visualFixtureEnabled || !canEditProposalMilestones ? "noop" : "convex";
  const materialPlanningActions = filterMaterialPlanningActionsForPermissions(
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
  );
  const calendarAdapterActions: ProposalCalendarAdapterActions = {
    addEvidenceDueDate: canUseAppPermission(
      appPermissions,
      "evidence",
      "update"
    )
      ? (input) =>
          setEvidenceDueDate({
            ...input,
            proposalId: typedProposalId,
            workosOrganizationId,
          }).then(() => toast.success("Evidence due date set."))
      : undefined,
    addReviewTargetDate: canUseAppPermission(
      appPermissions,
      "reminder",
      "create"
    )
      ? (input) =>
          setReviewTargetDate({
            ...input,
            proposalId: typedProposalId,
            workosOrganizationId,
          }).then(() => toast.success("Review target date set."))
      : undefined,
    reviseDrawTiming: canUseAppPermission(appPermissions, "draw", "update")
      ? (input) =>
          reviseProposalDrawTiming({
            ...input,
            proposalId: typedProposalId,
            workosOrganizationId,
          }).then(() => toast.success("Draw timing revised."))
      : undefined,
    reviseMilestoneSchedule: canUseAppPermission(
      appPermissions,
      "milestone",
      "update"
    )
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
              persistenceMode={visualFixtureEnabled ? "noop" : "convex"}
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
          persistenceMode={visualFixtureEnabled ? "noop" : "convex"}
          proposalId={typedProposalId}
          workosOrganizationId={workosOrganizationId}
          workspace={workspace}
        />
      }
      initialActiveTab={activeProposalTab}
      materialPlanningActions={materialPlanningActions}
      milestones={
        <ProductionProposalMilestoneWorksheetContainer
          contractorPlanning={workspace.contractorPlanning}
          detail={detail}
          persistenceMode={proposalEditorPersistenceMode}
          proposalId={typedProposalId}
          showHeading
          templateTitle={detail.proposal.buildName}
          workosOrganizationId={workosOrganizationId}
        />
      }
      onChangeCalendarTimeframe={(timeframe) =>
        void navigate({
          params: { proposalId },
          replace: true,
          search: { ...search, timeframe },
          to: `${routeBase}/proposals/$proposalId` as never,
        })
      }
      onChangeReviewTab={(tab) =>
        void navigate({
          params: { proposalId },
          replace: true,
          search: { ...search, tab },
          to: `${routeBase}/proposals/$proposalId` as never,
        })
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
        canUseAppPermission(appPermissions, "milestone", "create")
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
              }).then(() => toast.success("Proposal submitted to lender review."))
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
      onUpdateDraw={
        canUseAppPermission(appPermissions, "draw", "update")
          ? (drawKey, patch) =>
              (detail.proposal.status === "draft"
                ? updateProductionTimelineDraw({
                    amountCents: patch.amountCents,
                    drawKey,
                    label: patch.label,
                    proposalId: typedProposalId,
                    workosOrganizationId,
                    x: patch.timingDay,
                  })
                : updateProductionDrawScheduleRow({
                    amountCents: patch.amountCents,
                    drawKey,
                    label: patch.label,
                    proposalId: typedProposalId,
                    reason: patch.reason,
                    timingDay: patch.timingDay,
                    workosOrganizationId,
                  })
              ).then(() => toast.success("Draw schedule updated."))
          : undefined
      }
      onUpdatePacketMilestone={
        canUseAppPermission(appPermissions, "milestone", "update")
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
        canUseAppPermission(appPermissions, "milestone", "update")
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
          persistenceMode={visualFixtureEnabled ? "noop" : "convex"}
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
