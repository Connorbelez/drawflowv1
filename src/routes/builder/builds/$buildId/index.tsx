import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery } from "convex/react";

import { Frame, FramePanel } from "#/components/ui/frame.tsx";
import {
  ProductionBuildDetailSurface,
  type ProductionBuildDetail,
  type ProductionBuildDetailActions,
} from "#/features/backoffice-build-detail/ProductionBuildDetailSurface.tsx";
import type { BuildDetailSubTab } from "#/features/backoffice-build-detail/BuildDetailTabs.tsx";
import {
  getVisualParityActiveBuildDetail,
  getVisualParityActiveBuildTimelineWorkspace,
  isProductionVisualParityFixtureEnabled,
} from "#/features/production-proposals/visualParityFixtures.ts";
import { api } from "../../../../../convex/_generated/api";

type BuilderBuildSearch = {
  milestone?: string;
  tab?: "details" | "timeline" | "calendar" | "gantt";
  rail?: "open" | "closed";
};

export const Route = createFileRoute("/builder/builds/$buildId/")({
  validateSearch: (search: Record<string, unknown>): BuilderBuildSearch => {
    const tab =
      search.tab === "timeline" ||
      search.tab === "calendar" ||
      search.tab === "gantt" ||
      search.tab === "details"
        ? (search.tab as BuilderBuildSearch["tab"])
        : undefined;
    const milestone =
      typeof search.milestone === "string" ? search.milestone : undefined;
    const rail =
      search.rail === "closed" || search.rail === "open"
        ? (search.rail as BuilderBuildSearch["rail"])
        : undefined;
    return {
      ...(milestone ? { milestone } : {}),
      ...(rail ? { rail } : {}),
      ...(tab ? { tab } : {}),
    };
  },
  component: BuilderBuildRoute,
});

function BuilderBuildRoute() {
  const { buildId } = Route.useParams();
  const context = Route.useRouteContext();
  const search = Route.useSearch();
  const navigate = useNavigate();
  const workosOrganizationId = context.organizationId as string;
  const visualFixtureEnabled = isProductionVisualParityFixtureEnabled();
  const productionBuild = useQuery(
    api.production_proposals.getActiveBuildDetailByString,
    visualFixtureEnabled
      ? "skip"
      : {
          buildId,
          workosOrganizationId,
        },
  );
  const visualBuild = visualFixtureEnabled
    ? getVisualParityActiveBuildDetail(buildId)
    : null;
  const effectiveProductionBuild = visualFixtureEnabled
    ? visualBuild
    : productionBuild;
  const activeBuildIdForWorkspace = effectiveProductionBuild?.build?._id as any;
  const timelineWorkspace = useQuery(
    (api as any).production_proposals.getActiveBuildTimelineWorkspace,
    visualFixtureEnabled
      ? "skip"
      : effectiveProductionBuild
      ? {
          buildId: activeBuildIdForWorkspace,
          workosOrganizationId,
        }
      : "skip",
  );
  const effectiveTimelineWorkspace = visualFixtureEnabled
    ? getVisualParityActiveBuildTimelineWorkspace(buildId)
    : timelineWorkspace;
  const requestDraw = useMutation(api.production_proposals.requestActiveBuildDraw);
  const requestFacilityChange = useMutation(
    (api as any).production_proposals.requestActiveBuildFacilityChange,
  );
  const submitMilestoneCompletion = useMutation(
    (api as any).production_proposals.submitActiveBuildMilestoneCompletion,
  );

  const onChangeTab = (tab: BuildDetailSubTab) =>
    navigate({
      params: { buildId },
      replace: true,
      search: (prev) => ({ ...prev, tab }),
      to: "/builder/builds/$buildId",
    });
  const onChangeRail = (rail: "open" | "closed") =>
    navigate({
      params: { buildId },
      replace: true,
      search: (prev) => ({ ...prev, rail }),
      to: "/builder/builds/$buildId",
    });
  const onChangeMilestone = (milestone?: string) =>
    navigate({
      params: { buildId },
      replace: true,
      search: (prev) => ({ ...prev, milestone }),
      to: "/builder/builds/$buildId",
    });

  if (effectiveProductionBuild === undefined) {
    return (
      <main className="grid min-h-[24rem] place-items-center bg-muted/30 p-4">
        <Frame>
          <FramePanel className="p-4 text-sm">Loading build detail...</FramePanel>
        </Frame>
      </main>
    );
  }

  if (!effectiveProductionBuild) {
    return (
      <main className="grid min-h-[24rem] place-items-center bg-muted/30 p-4">
        <Frame>
          <FramePanel className="p-4">
            <p className="font-medium">Build detail unavailable</p>
            <p className="mt-1 text-muted-foreground text-sm">
              No production active build was found for this ID, or your builder
              account cannot access it.
            </p>
          </FramePanel>
        </Frame>
      </main>
    );
  }

  const detail = effectiveProductionBuild as ProductionBuildDetail;
  const activeBuildId = detail.build._id as any;
  const actions: ProductionBuildDetailActions = {
    requestDraw: (draw) =>
      requestDraw({
        amountCents: draw.amountCents,
        buildId: activeBuildId,
        drawKey: draw.drawKey,
        note: "Requested from builder build workspace.",
        workosOrganizationId,
      }),
    requestFacilityChange: (input) =>
      requestFacilityChange({
        ...input,
        buildId: activeBuildId,
        workosOrganizationId,
      }),
    startMilestoneWork: () => undefined,
    submitMilestoneCompletion: ({
      actualCostCents,
      completedDay,
      milestoneKey,
      note,
      qualityNote,
      qualityRating,
    }: any) =>
      submitMilestoneCompletion({
        actualCostCents,
        buildId: activeBuildId,
        completedDay: completedDay ?? 0,
        milestoneKey,
        note,
        qualityNote,
        qualityRating,
        workosOrganizationId,
      }),
  } as ProductionBuildDetailActions;

  return (
    <ProductionBuildDetailSurface
      actions={actions}
      activeBuildId={activeBuildId}
      activeTab={search.tab ?? "details"}
      contractorDetailHrefFor={(contractorId) =>
        `/builder/contractors/${contractorId}`
      }
      detail={detail}
      milestoneKey={search.milestone}
      onChangeMilestone={onChangeMilestone}
      onChangeRail={onChangeRail}
      onChangeTab={onChangeTab}
      rail={search.rail}
      timelineWorkspace={effectiveTimelineWorkspace as any}
      viewerRole="builder"
      workosOrganizationId={workosOrganizationId}
    />
  );
}
