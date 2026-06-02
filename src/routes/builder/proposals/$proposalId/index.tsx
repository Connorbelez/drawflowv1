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

type BuilderProposalSearch = {
  tab?: "calendar" | "contractors" | "gantt" | "materials" | "timeline";
  timeframe?: CalendarTimeframe;
};

export const Route = createFileRoute("/builder/proposals/$proposalId/")({
  ssr: false,
  validateSearch: (search: Record<string, unknown>): BuilderProposalSearch => {
    const tab =
      search.tab === "calendar" ||
      search.tab === "contractors" ||
      search.tab === "gantt" ||
      search.tab === "materials" ||
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
  const navigate = useNavigate();
  const workosOrganizationId = context.organizationId as string;
  const visualFixtureEnabled = isProductionVisualParityFixtureEnabled();
  const typedProposalId = proposalId as Id<"buildProposals">;
  const visualProposalDetail = useMemo(
    () => getVisualParityProposalDetail(proposalId),
    [proposalId],
  );
  const [visualCostItems, setVisualCostItems] = useState(
    () => visualProposalDetail.costItems ?? [],
  );
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
  const workspace = visualFixtureEnabled
    ? getVisualParityTimelineWorkspace(proposalId)
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
    visualFixtureEnabled
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

  const calendarAdapterActions: ProposalCalendarAdapterActions = {
    addEvidenceDueDate: (input) =>
      setEvidenceDueDate({
        ...input,
        proposalId: typedProposalId,
        workosOrganizationId,
      }).then(() => toast.success("Evidence due date set.")),
    addReviewTargetDate: (input) =>
      setReviewTargetDate({
        ...input,
        proposalId: typedProposalId,
        workosOrganizationId,
      }).then(() => toast.success("Review target date set.")),
    reviseDrawTiming: (input) =>
      reviseProposalDrawTiming({
        ...input,
        proposalId: typedProposalId,
        workosOrganizationId,
      }).then(() => toast.success("Draw timing revised.")),
    reviseMilestoneSchedule: (input) =>
      reviseProposalMilestoneSchedule({
        ...input,
        proposalId: typedProposalId,
        workosOrganizationId,
      }).then(() => toast.success("Milestone schedule revised.")),
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

  return (
    <section className="min-w-0 bg-muted/30 p-0 md:p-5">
      <Tabs
        className="gap-4"
        onValueChange={(value) =>
          void navigate({
            params: { proposalId },
            replace: true,
            search: {
              ...search,
              tab: value as BuilderProposalSearch["tab"],
            },
            to: "/builder/proposals/$proposalId",
          })
        }
        value={search.tab ?? "timeline"}
      >
        <Frame>
          <FramePanel className="flex flex-wrap items-center justify-between gap-3 p-3">
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
            </TabsList>
            <BuildPermitViewerDrawer permit={permit} size="sm" />
          </FramePanel>
        </Frame>
        <TabsPanel value="timeline">
          <ProductionTimelineWorkspace
            backofficeHref={`/backoffice/proposals/${proposalId}`}
            initialRole="builder"
            persistenceMode={visualFixtureEnabled ? "noop" : "convex"}
            proposalHref={`/builder/proposals/${proposalId}`}
            proposalId={typedProposalId}
            workspace={workspace}
            workosOrganizationId={workosOrganizationId}
          />
        </TabsPanel>
        <TabsPanel value="gantt">
          <ProductionProposalTimelineGanttWorkspace
            persistenceMode={visualFixtureEnabled ? "noop" : "convex"}
            proposalId={typedProposalId}
            workspace={workspace}
            workosOrganizationId={workosOrganizationId}
          />
        </TabsPanel>
        <TabsPanel value="calendar">
          <CalendarWorkspace
            actions={calendarActions}
            initialTimeframe={
              search.timeframe ?? effectiveCalendarWorkspace.defaultTimeframe
            }
            onCommitEdit={commitCalendarEdit}
            onCreateSyncSubscription={(input) =>
              createCalendarSyncSubscription({
                ...input,
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
                to: "/builder/proposals/$proposalId",
              })
            }
            workspace={effectiveCalendarWorkspace}
          />
        </TabsPanel>
        <TabsPanel value="contractors">
          <ProductionContractorPlanningTab
            initialRole="builder"
            persistenceMode={visualFixtureEnabled ? "noop" : "convex"}
            proposalId={typedProposalId}
            workspace={workspace}
            workosOrganizationId={workosOrganizationId}
          />
        </TabsPanel>
        <TabsPanel value="materials">
          <MaterialPlanningTab
            actions={
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
            }
            items={detail.costItems ?? []}
            milestones={proposalMaterialMilestones(detail)}
            scopeLabel="Builder Proposal"
          />
        </TabsPanel>
      </Tabs>
    </section>
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
