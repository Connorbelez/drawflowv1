import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery } from "convex/react";
import { Loader2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { Frame, FramePanel } from "#/components/ui/frame.tsx";
import { Tabs, TabsList, TabsPanel, TabsTab } from "#/components/ui/tabs.tsx";
import {
  BuildPermitViewerDrawer,
  firstPermitDocument,
} from "#/features/build-permit-viewer/BuildPermitViewerDrawer.tsx";
import { BuilderStaffPermissionsPanel } from "#/features/builder-staff/BuilderStaffPermissionsPanel.tsx";
import {
  canUseAppPermission,
  filterMaterialPlanningActionsForPermissions,
  hasAnyAppPermission,
} from "#/features/builder-staff/app-permissions.ts";
import { MaterialPlanningTab } from "#/features/material-planning/MaterialPlanningTab.tsx";
import { CalendarWorkspace } from "#/features/calendar-workspace/CalendarWorkspace.tsx";
import {
  buildProposalCalendarActions,
  buildProposalCalendarWorkspaceFromDetail,
  createProposalCalendarEditHandler,
  type ProposalCalendarAdapterActions,
} from "#/features/calendar-workspace/adapters/proposalCalendarAdapter.ts";
import type { CalendarTimeframe } from "#/features/calendar-workspace/calendarTypes.ts";
import { ProductionContractorPlanningTab } from "#/features/production-proposals/ProductionContractorPlanningTab.tsx";
import { ProductionProposalTimelineGanttWorkspace } from "#/features/production-proposals/ProductionProposalGanttWorkspace.tsx";
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
  tab?:
    | "calendar"
    | "contractors"
    | "gantt"
    | "materials"
    | "staff"
    | "timeline";
  timeframe?: CalendarTimeframe;
};

type BuilderProposalRouteTab = NonNullable<BuilderProposalSearch["tab"]>;

export function resolveBuilderProposalRouteTab(
  search: BuilderProposalSearch,
): BuilderProposalRouteTab {
  return search.tab ?? "timeline";
}

export function shouldLoadBuilderProposalCalendarWorkspace(
  activeTab: BuilderProposalRouteTab,
) {
  return activeTab === "calendar";
}

export function shouldLoadBuilderProposalContractorPlanning(
  activeTab: BuilderProposalRouteTab,
) {
  return activeTab === "contractors" || activeTab === "gantt";
}

export function shouldMountBuilderProposalStaffPanel(
  activeTab: BuilderProposalRouteTab,
) {
  return activeTab === "staff";
}

export const Route = createFileRoute("/builder/proposals/$proposalId/")({
  ssr: false,
  validateSearch: (search: Record<string, unknown>): BuilderProposalSearch => {
    const tab =
      search.tab === "calendar" ||
      search.tab === "contractors" ||
      search.tab === "gantt" ||
      search.tab === "materials" ||
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
    [proposalId],
  );
  const [visualCostItems, setVisualCostItems] = useState(
    () => visualProposalDetail.costItems ?? [],
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
          current.filter((candidate) => candidate._id !== item._id),
        );
      },
      update: (
        item: { _id: string },
        payload: Parameters<typeof createVisualParityCostItem>[0],
      ) => {
        setVisualCostItems((current) =>
          current.map((candidate) =>
            candidate._id === item._id
              ? { ...createVisualParityCostItem(payload, candidate._id), _id: item._id }
              : candidate,
          ),
        );
      },
    }),
    [],
  );
  const workspaceQuery = useQuery(
    api.production_proposals.getProductionTimelineWorkspace,
    visualFixtureEnabled
      ? "skip"
      : {
          proposalId: typedProposalId,
          workosOrganizationId,
        },
  );
  const contractorPlanningQuery = useQuery(
    (api as any).production_proposals.getProposalContractorPlanning,
    visualFixtureEnabled || !loadContractorPlanning
      ? "skip"
      : {
          proposalId: typedProposalId,
          workosOrganizationId,
        },
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
        },
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
        },
  );
  const createProposalCostItem = useMutation(
    api.production_proposals.createProposalCostItem,
  );
  const updateProposalCostItem = useMutation(
    api.production_proposals.updateProposalCostItem,
  );
  const deleteProposalCostItem = useMutation(
    api.production_proposals.deleteProposalCostItem,
  );
  const reviseProposalMilestoneSchedule = useMutation(
    (api as any).production_proposals.reviseProposalMilestoneSchedule,
  );
  const reviseProposalDrawTiming = useMutation(
    (api as any).production_proposals.reviseProposalDrawTiming,
  );
  const setEvidenceDueDate = useMutation(
    (api as any).production_proposals.setEvidenceDueDate,
  );
  const setReviewTargetDate = useMutation(
    (api as any).production_proposals.setReviewTargetDate,
  );
  const saveCalendarView = useMutation(
    (api as any).production_proposals.saveCalendarView,
  );
  const createCalendarSyncSubscription = useMutation(
    (api as any).production_proposals.createCalendarSyncSubscription,
  );
  const recordExternalCalendarSyncChange = useMutation(
    (api as any).production_proposals.recordExternalCalendarSyncChange,
  );

  if (!workspace || !detail) {
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
        },
  );
  const calendarAdapterActions: ProposalCalendarAdapterActions = {
    addEvidenceDueDate: canUseAppPermission(
      appPermissions,
      "evidence",
      "update",
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
      "create",
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
      "update",
    )
      ? (input) =>
          reviseProposalMilestoneSchedule({
            ...input,
            proposalId: typedProposalId,
            workosOrganizationId,
          }).then(() => toast.success("Milestone schedule revised."))
      : undefined,
  };
  const effectiveCalendarWorkspace =
    (calendarWorkspaceQuery as any) ??
    buildProposalCalendarWorkspaceFromDetail(detail);
  const calendarActions = buildProposalCalendarActions(calendarAdapterActions);
  const commitCalendarEdit = createProposalCalendarEditHandler({
    actions: calendarAdapterActions,
    baseDate: detail.activeBuild?.startDate ?? "2026-06-01",
  });
  const permit = firstPermitDocument(detail.documents);

  const proposalTabPanelClassName = "w-full min-w-0";

  return (
    <section className="w-full min-w-0 bg-muted/30 p-0 md:p-5">
      <Tabs
        className="flex w-full min-w-0 flex-col gap-4"
        onValueChange={(value) =>
          void navigate({
            params: { proposalId },
            replace: true,
            search: {
              ...search,
              tab: value as BuilderProposalSearch["tab"],
            },
            to: `${routeBase}/proposals/$proposalId` as never,
          })
        }
        value={search.tab ?? "timeline"}
      >
        <Frame className="w-full min-w-0">
          <FramePanel className="flex w-full min-w-0 flex-wrap items-center justify-between gap-3 p-3">
            <TabsList
              aria-label="Builder proposal sections"
              className="justify-start overflow-x-auto"
              variant="underline"
            >
              <TabsTab value="timeline">Timeline</TabsTab>
              <TabsTab value="gantt">Gantt</TabsTab>
              <TabsTab value="calendar">Calendar</TabsTab>
              <TabsTab value="contractors">Contractors</TabsTab>
              <TabsTab value="materials">Materials</TabsTab>
              {visualFixtureEnabled || !includeStaffTab ? null : (
                <TabsTab value="staff">Staff</TabsTab>
              )}
            </TabsList>
            <BuildPermitViewerDrawer permit={permit} size="sm" />
          </FramePanel>
        </Frame>
        <div className="w-full min-w-0">
        <TabsPanel className={proposalTabPanelClassName} value="timeline">
          <div className="w-full min-w-0 overflow-x-auto">
            <ProductionTimelineWorkspace
              appPermissions={appPermissions}
              backofficeHref={`/backoffice/proposals/${proposalId}`}
              embedded
              initialRole="builder"
              persistenceMode={visualFixtureEnabled ? "noop" : "convex"}
              proposalHref={`${routeBase}/proposals/${proposalId}`}
              proposalId={typedProposalId}
              workspace={workspace}
              workosOrganizationId={workosOrganizationId}
            />
          </div>
        </TabsPanel>
        <TabsPanel className={proposalTabPanelClassName} value="gantt">
          <div className="w-full min-w-0 overflow-x-auto">
            <ProductionProposalTimelineGanttWorkspace
              persistenceMode={visualFixtureEnabled ? "noop" : "convex"}
              proposalId={typedProposalId}
              workspace={workspace}
              workosOrganizationId={workosOrganizationId}
            />
          </div>
        </TabsPanel>
        <TabsPanel className={proposalTabPanelClassName} value="calendar">
          <CalendarWorkspace
            actions={calendarActions}
            initialTimeframe={
              search.timeframe ?? effectiveCalendarWorkspace.defaultTimeframe
            }
            onCommitEdit={commitCalendarEdit}
            onCreateSyncSubscription={(input) =>
              createCalendarSyncSubscription({
                ...input,
                proposalId:
                  input.surface === "proposal"
                    ? (input.sourceId as Id<"buildProposals">)
                    : undefined,
                workosOrganizationId,
              })
            }
            onRecordExternalSyncChange={(input) =>
              recordExternalCalendarSyncChange({
                ...input,
                workosOrganizationId,
              })
            }
            onSaveView={(input) =>
              saveCalendarView({
                ...input,
                surface: "proposal",
                workosOrganizationId,
              })
            }
            onTimeframeChange={(timeframe) =>
              void navigate({
                params: { proposalId },
                replace: true,
                search: { ...search, timeframe },
                to: `${routeBase}/proposals/$proposalId` as never,
              })
            }
            workspace={effectiveCalendarWorkspace}
          />
        </TabsPanel>
        <TabsPanel className={proposalTabPanelClassName} value="contractors">
          {activeProposalTab === "contractors" &&
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
              workspace={workspace}
              workosOrganizationId={workosOrganizationId}
            />
          )}
        </TabsPanel>
        <TabsPanel className={proposalTabPanelClassName} value="materials">
          <MaterialPlanningTab
            actions={
              materialPlanningActions
            }
            items={detail.costItems ?? []}
            milestones={proposalMaterialMilestones(detail)}
            scopeLabel="Builder Proposal"
          />
        </TabsPanel>
        {visualFixtureEnabled || !includeStaffTab ? null : (
          <TabsPanel className={proposalTabPanelClassName} value="staff">
            {shouldMountBuilderProposalStaffPanel(activeProposalTab) ? (
              <BuilderStaffPermissionsPanel
                proposalId={typedProposalId}
                scope="proposal"
                workosOrganizationId={workosOrganizationId}
              />
            ) : (
              <DeferredBuilderProposalTabPanel label="Staff permissions" />
            )}
          </TabsPanel>
        )}
        </div>
      </Tabs>
    </section>
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

function proposalMaterialMilestones(detail: any) {
  const submilestonesByMilestone = new Map<string, any[]>();
  for (const submilestone of detail.submilestones ?? []) {
    const next = submilestonesByMilestone.get(submilestone.milestoneKey) ?? [];
    next.push(submilestone);
    submilestonesByMilestone.set(submilestone.milestoneKey, next);
  }
  return (detail.milestones ?? []).map((milestone: any) => ({
    budgetCents: milestone.budgetCents,
    key: milestone.key,
    name: milestone.name,
    order: milestone.order,
    submilestones: (submilestonesByMilestone.get(milestone.key) ?? []).map(
      (submilestone) => ({
        key: submilestone.key,
        milestoneKey: submilestone.milestoneKey,
        name: submilestone.name,
        order: submilestone.order,
      }),
    ),
  }));
}
