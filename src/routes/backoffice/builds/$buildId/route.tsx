import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery } from "convex/react";

import { Frame, FramePanel } from "#/components/ui/frame.tsx";
import type { BuildDetailSubTab } from "#/features/backoffice-build-detail/BuildDetailTabs.tsx";
import {
  ProductionBuildDetailSurface,
  type ProductionBuildDetail,
  type ProductionBuildDetailActions,
} from "#/features/backoffice-build-detail/ProductionBuildDetailSurface.tsx";
import { api } from "../../../../../convex/_generated/api";

type BuildDetailSearch = {
  milestone?: string;
  tab?: "details" | "timeline" | "calendar" | "gantt";
  rail?: "open" | "closed";
};

export const Route = createFileRoute("/backoffice/builds/$buildId")({
  validateSearch: (search: Record<string, unknown>): BuildDetailSearch => {
    const tab =
      search.tab === "timeline" ||
      search.tab === "calendar" ||
      search.tab === "gantt" ||
      search.tab === "details"
        ? (search.tab as BuildDetailSearch["tab"])
        : undefined;
    const milestone =
      typeof search.milestone === "string" ? search.milestone : undefined;
    const rail =
      search.rail === "closed" || search.rail === "open"
        ? (search.rail as BuildDetailSearch["rail"])
        : undefined;
    const out: BuildDetailSearch = {};
    if (milestone !== undefined) out.milestone = milestone;
    if (tab !== undefined) out.tab = tab;
    if (rail !== undefined) out.rail = rail;
    return out;
  },
  component: RouteComponent,
});

function RouteComponent() {
  const { buildId } = Route.useParams();
  const context = Route.useRouteContext();
  const search = Route.useSearch();
  const navigate = useNavigate();
  const addDocument = useMutation(api.production_proposals.addActiveBuildDocument);
  const addNote = useMutation(api.production_proposals.addActiveBuildNote);
  const approveDraw = useMutation(api.production_proposals.approveActiveBuildDraw);
  const approveMilestone = useMutation(
    api.production_proposals.approveActiveBuildMilestone,
  );
  const assignSiteVisit = useMutation(
    api.production_proposals.assignActiveBuildSiteVisit,
  );
  const attachContractor = useMutation(
    api.production_proposals.attachActiveBuildContractor,
  );
  const createContractor = useMutation(
    api.production_proposals.createContractorProfile,
  );
  const rejectDraw = useMutation(api.production_proposals.rejectActiveBuildDraw);
  const rejectMilestone = useMutation(
    api.production_proposals.rejectActiveBuildMilestone,
  );
  const releaseDraw = useMutation(api.production_proposals.releaseActiveBuildDraw);
  const requestFacilityChange = useMutation(
    (api as any).production_proposals.requestActiveBuildFacilityChange,
  );
  const requestDraw = useMutation(api.production_proposals.requestActiveBuildDraw);
  const requestMilestoneInfo = useMutation(
    api.production_proposals.requestActiveBuildMilestoneInfo,
  );
  const reviewFacilityChangeRequest = useMutation(
    (api as any).production_proposals.reviewActiveBuildFacilityChangeRequest,
  );
  const startMilestoneWork = useMutation(
    api.production_proposals.startActiveBuildMilestone,
  );
  const productionBuild = useQuery(
    api.production_proposals.getActiveBuildDetailByString,
    {
      buildId,
      workosOrganizationId: context.organizationId as string,
    },
  );
  const activeBuildIdForWorkspace = productionBuild?.build?._id as any;
  const timelineWorkspace = useQuery(
    (api as any).production_proposals.getActiveBuildTimelineWorkspace,
    productionBuild
      ? {
          buildId: activeBuildIdForWorkspace,
          workosOrganizationId: context.organizationId as string,
        }
      : "skip",
  );

  const onChangeTab = (tab: BuildDetailSubTab) =>
    navigate({
      to: "/backoffice/builds/$buildId",
      params: { buildId },
      search: (prev) => ({ ...prev, tab }),
      replace: true,
    });

  const onChangeRail = (rail: "open" | "closed") =>
    navigate({
      to: "/backoffice/builds/$buildId",
      params: { buildId },
      search: (prev) => ({ ...prev, rail }),
      replace: true,
    });

  const onChangeMilestone = (milestone?: string) =>
    navigate({
      to: "/backoffice/builds/$buildId",
      params: { buildId },
      search: (prev) => ({ ...prev, milestone }),
      replace: true,
    });

  if (productionBuild === undefined) {
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

  if (productionBuild) {
    const detail = productionBuild as ProductionBuildDetail;
    const activeBuildId = detail.build._id as any;
    const workosOrganizationId = context.organizationId as string;
    const actions: ProductionBuildDetailActions = {
      addDocument: ({ documentType, fileName }) =>
        addDocument({
          buildId: activeBuildId,
          documentType,
          fileName,
          mimeType: "application/octet-stream",
          sizeBytes: 0,
          workosOrganizationId,
        }),
      addNote: ({ body, visibility }) =>
        addNote({
          body,
          buildId: activeBuildId,
          visibility,
          workosOrganizationId,
        }),
      approveDraw: (draw) =>
        approveDraw({
          buildId: activeBuildId,
          drawKey: draw.drawKey,
          note: "Approved from build detail workspace.",
          workosOrganizationId,
        }),
      approveMilestone: ({ milestoneKey, note }) =>
        approveMilestone({
          buildId: activeBuildId,
          milestoneKey,
          note,
          workosOrganizationId,
        }),
      assignSiteVisit: ({ milestoneKey }) =>
        assignSiteVisit({
          buildId: activeBuildId,
          milestoneKey,
          note: "Assigned from build detail workspace.",
          requestedDay: 0,
          workosOrganizationId,
        }),
      attachContractor: ({ contractorId, role }) =>
        attachContractor({
          buildId: activeBuildId,
          contractorId: contractorId as any,
          role,
          workosOrganizationId,
        }),
      createAndAttachContractor: async ({ contractor, role }) => {
        const contractorId = await createContractor({
          brokerageId: detail.build.brokerageId as any,
          email: contractor.email,
          name: contractor.name,
          phone: contractor.phone,
          trades: contractor.trades,
          workosOrganizationId,
        });
        await attachContractor({
          buildId: activeBuildId,
          contractorId,
          role,
          workosOrganizationId,
        });
      },
      rejectDraw: (draw) =>
        rejectDraw({
          buildId: activeBuildId,
          drawKey: draw.drawKey,
          note: "Rejected from build detail workspace.",
          workosOrganizationId,
        }),
      rejectMilestone: ({ milestoneKey }) =>
        rejectMilestone({
          buildId: activeBuildId,
          milestoneKey,
          note: "Rejected from build detail workspace.",
          workosOrganizationId,
        }),
      releaseDraw: (draw) =>
        releaseDraw({
          buildId: activeBuildId,
          drawKey: draw.drawKey,
          note: "Released from build detail workspace.",
          releaseDate: new Date().toISOString().slice(0, 10),
          workosOrganizationId,
        }),
      requestFacilityChange: (input) =>
        requestFacilityChange({
          ...input,
          buildId: activeBuildId,
          workosOrganizationId,
        }),
      requestDraw: (draw) =>
        requestDraw({
          amountCents: draw.amountCents,
          buildId: activeBuildId,
          drawKey: draw.drawKey,
          note: "Requested from build detail workspace.",
          workosOrganizationId,
        }),
      reviewFacilityChangeRequest: (input) =>
        reviewFacilityChangeRequest({
          ...input,
          requestId: input.requestId as any,
          workosOrganizationId,
        }),
      requestMilestoneInfo: ({ milestoneKey, note }) =>
        requestMilestoneInfo({
          buildId: activeBuildId,
          milestoneKey,
          note,
          workosOrganizationId,
        }),
      startMilestoneWork: ({ milestoneKey, note }) =>
        startMilestoneWork({
          buildId: activeBuildId,
          milestoneKey,
          note,
          workosOrganizationId,
        }),
    };
    return (
      <ProductionBuildDetailSurface
        actions={actions}
        activeBuildId={activeBuildId}
        activeTab={search.tab ?? "details"}
        detail={detail}
        milestoneKey={search.milestone}
        onChangeMilestone={onChangeMilestone}
        onChangeRail={onChangeRail}
        onChangeTab={onChangeTab}
        rail={search.rail}
        timelineWorkspace={timelineWorkspace as any}
        workosOrganizationId={workosOrganizationId}
      />
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
