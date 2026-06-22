import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery } from "convex/react";

import { Frame, FramePanel } from "#/components/ui/frame.tsx";
import { BuilderStaffPermissionsPanel } from "#/features/builder-staff/BuilderStaffPermissionsPanel.tsx";
import { canUseAppPermission } from "#/features/builder-staff/app-permissions.ts";
import {
  ProductionBuildDetailSurface,
  type ProductionBuildDetail,
  type ProductionBuildDetailActions,
} from "#/features/backoffice-build-detail/ProductionBuildDetailSurface.tsx";
import type { BuildDetailSubTab } from "#/features/backoffice-build-detail/BuildDetailTabs.tsx";
import type { CalendarTimeframe } from "#/features/calendar-workspace/calendarTypes.ts";
import {
  getVisualParityActiveBuildDetail,
  getVisualParityActiveBuildTimelineWorkspace,
  isProductionVisualParityFixtureEnabled,
} from "#/features/production-proposals/visualParityFixtures.ts";
import { api } from "../../../../../convex/_generated/api";
import type { Id } from "../../../../../convex/_generated/dataModel";

export type BuilderBuildSearch = {
  timeframe?: CalendarTimeframe;
  milestone?: string;
  tab?:
    | "calendar"
    | "details"
    | "evidence"
    | "gantt"
    | "materials"
    | "staff"
    | "timeline";
  rail?: "open" | "closed";
};

export const Route = createFileRoute("/builder/builds/$buildId/")({
  validateSearch: (search: Record<string, unknown>): BuilderBuildSearch => {
    const tab =
      search.tab === "timeline" ||
      search.tab === "evidence" ||
      search.tab === "materials" ||
      search.tab === "staff" ||
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
    const timeframe =
      search.timeframe === "day" ||
      search.timeframe === "week" ||
      search.timeframe === "month" ||
      search.timeframe === "quarter" ||
      search.timeframe === "agenda"
        ? (search.timeframe as CalendarTimeframe)
        : undefined;
    return {
      ...(timeframe ? { timeframe } : {}),
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
  return (
    <BuilderBuildWorkspaceRoute
      buildId={buildId}
      enableContractorLinks
      includeStaffTab
      routeBase="/builder"
      search={search}
      workosOrganizationId={context.organizationId as string}
    />
  );
}

export function BuilderBuildWorkspaceRoute({
  buildId,
  enableContractorLinks,
  includeStaffTab,
  routeBase,
  search,
  workosOrganizationId,
}: {
  buildId: string;
  enableContractorLinks: boolean;
  includeStaffTab: boolean;
  routeBase: "/builder" | "/builder-staff";
  search: BuilderBuildSearch;
  workosOrganizationId: string;
}) {
  const navigate = useNavigate();
  const visualFixtureEnabled = isProductionVisualParityFixtureEnabled();
  const productionBuildQuery = useQuery(
    api.production_proposals.getActiveBuildDetailByString,
    visualFixtureEnabled
      ? "skip"
      : {
          buildId,
          workosOrganizationId,
        },
  );
  const effectiveProductionBuild = visualFixtureEnabled
    ? getVisualParityActiveBuildDetail(buildId)
    : productionBuildQuery;
  const activeBuildIdForWorkspace = effectiveProductionBuild?.build?._id as any;
  const timelineWorkspaceQuery = useQuery(
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
    : timelineWorkspaceQuery;
  const calendarWorkspaceQuery = useQuery(
    (api as any).production_proposals.getActiveBuildCalendarWorkspace,
    visualFixtureEnabled
      ? "skip"
      : effectiveProductionBuild
        ? {
            buildId: activeBuildIdForWorkspace,
            workosOrganizationId,
          }
        : "skip",
  );
  const requestDraw = useMutation(
    api.production_proposals.requestActiveBuildDraw,
  );
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
      search: { ...search, tab },
      to: `${routeBase}/builds/$buildId` as never,
    });
  const onChangeRail = (rail: "open" | "closed") =>
    navigate({
      params: { buildId },
      replace: true,
      search: { ...search, rail },
      to: `${routeBase}/builds/$buildId` as never,
    });
  const onChangeMilestone = (milestone?: string) =>
    navigate({
      params: { buildId },
      replace: true,
      search: { ...search, milestone },
      to: `${routeBase}/builds/$buildId` as never,
    });
  const onChangeCalendarTimeframe = (timeframe: CalendarTimeframe) =>
    navigate({
      params: { buildId },
      replace: true,
      search: { ...search, timeframe },
      to: `${routeBase}/builds/$buildId` as never,
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
  const appPermissions = detail.appPermissions;
  const actions: ProductionBuildDetailActions = {
    requestDraw: canUseAppPermission(appPermissions, "draw", "update")
      ? (draw) =>
          requestDraw({
            amountCents: draw.amountCents,
            buildId: activeBuildId,
            drawKey: draw.drawKey,
            note: "Requested from builder build workspace.",
            workosOrganizationId,
          })
      : undefined,
    requestFacilityChange: canUseAppPermission(
      appPermissions,
      "capitalEvent",
      "create",
    )
      ? (input) =>
          requestFacilityChange({
            ...input,
            buildId: activeBuildId,
            workosOrganizationId,
          })
      : undefined,
    requestLoanFacilityDateChange: canUseAppPermission(
      appPermissions,
      "capitalEvent",
      "create",
    )
      ? (input) =>
          requestFacilityChange({
            reason: input.reason,
            requestedPaybackDate: input.requestedPaybackDate,
            requestType: "paybackExtension",
            buildId: activeBuildId,
            workosOrganizationId,
          })
      : undefined,
    startMilestoneWork: canUseAppPermission(
      appPermissions,
      "milestone",
      "update",
    )
      ? () => undefined
      : undefined,
    submitMilestoneCompletion:
      canUseAppPermission(appPermissions, "milestone", "update") &&
      canUseAppPermission(appPermissions, "evidence", "update")
        ? ({
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
            })
        : undefined,
  } as ProductionBuildDetailActions;

  return (
    <ProductionBuildDetailSurface
      actions={actions}
      activeBuildId={activeBuildId}
      activeTab={search.tab ?? "details"}
      calendarTimeframe={search.timeframe}
      calendarWorkspace={calendarWorkspaceQuery as any}
      breadcrumbRootHref={routeBase}
      breadcrumbRootLabel="Builder"
      breadcrumbSectionHref={`${routeBase}/builds`}
      breadcrumbSectionLabel="Live Builds"
      contractorDetailHrefFor={
        enableContractorLinks
          ? (contractorId) => `/builder/contractors/${contractorId}`
          : undefined
      }
      detail={detail}
      milestoneKey={search.milestone}
      onChangeMilestone={onChangeMilestone}
      onChangeCalendarTimeframe={onChangeCalendarTimeframe}
      onChangeRail={onChangeRail}
      onChangeTab={onChangeTab}
      rail={search.rail}
      staff={
        visualFixtureEnabled || !includeStaffTab ? undefined : (
          <BuilderStaffPermissionsPanel
            buildId={activeBuildId as Id<"activeBuilds">}
            scope="activeBuild"
            workosOrganizationId={workosOrganizationId}
          />
        )
      }
      timelineWorkspace={effectiveTimelineWorkspace as any}
      visibleTabs={
        includeStaffTab
          ? undefined
          : ["details", "timeline", "evidence", "materials", "calendar", "gantt"]
      }
      viewerRole="builder"
      workosOrganizationId={workosOrganizationId}
    />
  );
}
