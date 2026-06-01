import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery } from "convex/react";
import { Loader2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { Frame, FramePanel } from "#/components/ui/frame.tsx";
import { Tabs, TabsList, TabsPanel, TabsTab } from "#/components/ui/tabs.tsx";
import { MaterialPlanningTab } from "#/features/material-planning/MaterialPlanningTab.tsx";
import { ProductionTimelineWorkspace } from "#/features/production-proposals/ProductionTimelineWorkspace.tsx";
import {
  createVisualParityCostItem,
  getVisualParityProposalDetail,
  getVisualParityTimelineWorkspace,
  isProductionVisualParityFixtureEnabled,
} from "#/features/production-proposals/visualParityFixtures.ts";
import { api } from "../../../../../convex/_generated/api";
import type { Id } from "../../../../../convex/_generated/dataModel";

export const Route = createFileRoute("/builder/proposals/$proposalId/")({
  ssr: false,
  component: BuilderProductionProposalRoute,
});

function BuilderProductionProposalRoute() {
  const { proposalId } = Route.useParams();
  const context = Route.useRouteContext();
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
  const createProposalCostItem = useMutation(
    api.production_proposals.createProposalCostItem,
  );
  const updateProposalCostItem = useMutation(
    api.production_proposals.updateProposalCostItem,
  );
  const deleteProposalCostItem = useMutation(
    api.production_proposals.deleteProposalCostItem,
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

  return (
    <section className="min-w-0 bg-muted/30 p-3 md:p-5">
      <Tabs className="gap-4" defaultValue="timeline">
        <Frame>
          <FramePanel className="p-3">
            <TabsList
              aria-label="Builder proposal sections"
              className="justify-start overflow-x-auto"
              variant="underline"
            >
              <TabsTab value="timeline">Timeline</TabsTab>
              <TabsTab value="materials">Materials</TabsTab>
            </TabsList>
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
