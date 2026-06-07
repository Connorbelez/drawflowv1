import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery } from "convex/react";
import { toast } from "sonner";

import { Frame, FramePanel } from "#/components/ui/frame.tsx";
import type { BuildDetailSubTab } from "#/features/backoffice-build-detail/BuildDetailTabs.tsx";
import type { CalendarTimeframe } from "#/features/calendar-workspace/calendarTypes.ts";
import {
  ProductionBuildDetailSurface,
  type ProductionBuildDetail,
  type ProductionBuildDetailActions,
} from "#/features/backoffice-build-detail/ProductionBuildDetailSurface.tsx";
import {
  getVisualParityActiveBuildDetail,
  getVisualParityActiveBuildTimelineWorkspace,
  isProductionVisualParityFixtureEnabled,
} from "#/features/production-proposals/visualParityFixtures.ts";
import { api } from "../../../../../convex/_generated/api";
import type { Id } from "../../../../../convex/_generated/dataModel";

type BuildDetailSearch = {
  timeframe?: CalendarTimeframe;
  milestone?: string;
  tab?:
    | "calendar"
    | "details"
    | "evidence"
    | "gantt"
    | "materials"
    | "timeline";
  rail?: "open" | "closed";
};

export const Route = createFileRoute("/backoffice/builds/$buildId")({
  validateSearch: (search: Record<string, unknown>): BuildDetailSearch => {
    const tab =
      search.tab === "timeline" ||
      search.tab === "evidence" ||
      search.tab === "materials" ||
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
    const timeframe =
      search.timeframe === "day" ||
      search.timeframe === "week" ||
      search.timeframe === "month" ||
      search.timeframe === "quarter" ||
      search.timeframe === "agenda"
        ? (search.timeframe as CalendarTimeframe)
        : undefined;
    const out: BuildDetailSearch = {};
    if (milestone !== undefined) out.milestone = milestone;
    if (tab !== undefined) out.tab = tab;
    if (rail !== undefined) out.rail = rail;
    if (timeframe !== undefined) out.timeframe = timeframe;
    return out;
  },
  component: RouteComponent,
});

function RouteComponent() {
  const { buildId } = Route.useParams();
  const context = Route.useRouteContext();
  const search = Route.useSearch();
  const navigate = useNavigate();
  const visualFixtureEnabled = isProductionVisualParityFixtureEnabled();
  const addDocument = useMutation(
    api.production_proposals.addActiveBuildDocument,
  );
  const addNote = useMutation(api.production_proposals.addActiveBuildNote);
  const approveDraw = useMutation(
    api.production_proposals.approveActiveBuildDraw,
  );
  const approveMilestone = useMutation(
    api.production_proposals.approveActiveBuildMilestone,
  );
  const assignSiteVisit = useMutation(
    api.production_proposals.assignActiveBuildSiteVisit,
  );
  const assignContractorToMilestone = useMutation(
    (api as any).production_proposals.assignActiveBuildContractorToMilestone,
  );
  const attachContractor = useMutation(
    api.production_proposals.attachActiveBuildContractor,
  );
  const createContractor = useMutation(
    api.production_proposals.createContractorProfile,
  );
  const rejectDraw = useMutation(
    api.production_proposals.rejectActiveBuildDraw,
  );
  const rejectMilestone = useMutation(
    api.production_proposals.rejectActiveBuildMilestone,
  );
  const releaseDraw = useMutation(
    api.production_proposals.releaseActiveBuildDraw,
  );
  const requestFacilityChange = useMutation(
    (api as any).production_proposals.requestActiveBuildFacilityChange,
  );
  const requestDraw = useMutation(
    api.production_proposals.requestActiveBuildDraw,
  );
  const requestMilestoneInfo = useMutation(
    api.production_proposals.requestActiveBuildMilestoneInfo,
  );
  const reviewEvidence = useMutation(
    api.production_proposals.reviewActiveBuildEvidence,
  );
  const reviewFacilityChangeRequest = useMutation(
    (api as any).production_proposals.reviewActiveBuildFacilityChangeRequest,
  );
  const startMilestoneWork = useMutation(
    api.production_proposals.startActiveBuildMilestone,
  );
  const createActiveBuildCostItem = useMutation(
    api.production_proposals.createActiveBuildCostItem,
  );
  const updateActiveBuildCostItem = useMutation(
    api.production_proposals.updateActiveBuildCostItem,
  );
  const updateActiveBuildNonFinancialDetails = useMutation(
    (api as any).production_proposals.updateActiveBuildNonFinancialDetails,
  );
  const deleteActiveBuildCostItem = useMutation(
    api.production_proposals.deleteActiveBuildCostItem,
  );
  const reviseActiveBuildMilestoneSchedule = useMutation(
    (api as any).production_proposals.reviseActiveBuildMilestoneSchedule,
  );
  const setEvidenceDueDate = useMutation(
    (api as any).production_proposals.setEvidenceDueDate,
  );
  const setReviewTargetDate = useMutation(
    (api as any).production_proposals.setReviewTargetDate,
  );
  const setAdminDecisionTargetDate = useMutation(
    (api as any).production_proposals.setAdminDecisionTargetDate,
  );
  const setDrawReleaseTargetDate = useMutation(
    (api as any).production_proposals.setDrawReleaseTargetDate,
  );
  const scheduleActiveBuildSiteVisit = useMutation(
    (api as any).production_proposals.scheduleActiveBuildSiteVisit,
  );
  const rescheduleActiveBuildSiteVisit = useMutation(
    (api as any).production_proposals.rescheduleActiveBuildSiteVisit,
  );
  const cancelActiveBuildSiteVisit = useMutation(
    (api as any).production_proposals.cancelActiveBuildSiteVisit,
  );
  const requestLoanFacilityDateChange = useMutation(
    (api as any).production_proposals.requestLoanFacilityDateChange,
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
  const productionBuildQuery = useQuery(
    api.production_proposals.getActiveBuildDetailByString,
    visualFixtureEnabled
      ? "skip"
      : {
          buildId,
          workosOrganizationId: context.organizationId as string,
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
            workosOrganizationId: context.organizationId as string,
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
            workosOrganizationId: context.organizationId as string,
          }
        : "skip",
  );

  const onChangeTab = (tab: BuildDetailSubTab) =>
    navigate({
      to: "/backoffice/builds/$buildId",
      params: { buildId },
      search: { ...search, tab },
      replace: true,
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
      assignContractorToMilestone: ({
        assignmentCost,
        contractorId,
        milestoneKey,
        role,
        submilestoneKeys,
      }) =>
        assignContractorToMilestone({
          ...assignmentCost,
          buildId: activeBuildId,
          contractorId: contractorId as any,
          milestoneKey,
          role,
          submilestoneKeys,
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
          ...contractor,
          brokerageId: detail.build.brokerageId as any,
          workosOrganizationId,
        });
        await attachContractor({
          buildId: activeBuildId,
          contractorId,
          role,
          workosOrganizationId,
        });
      },
      createAndAssignContractor: async ({
        assignmentCost,
        contractor,
        milestoneKey,
        role,
      }) => {
        const contractorId = await createContractor({
          ...contractor,
          brokerageId: detail.build.brokerageId as any,
          workosOrganizationId,
        });
        await assignContractorToMilestone({
          ...assignmentCost,
          buildId: activeBuildId,
          contractorId,
          milestoneKey,
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
      reviseMilestoneSchedule: (input) =>
        reviseActiveBuildMilestoneSchedule({
          ...input,
          buildId: activeBuildId,
          workosOrganizationId,
        }).then(() => toast.success("Milestone schedule revised.")),
      setEvidenceDueDate: (input) =>
        setEvidenceDueDate({
          ...input,
          buildId: activeBuildId,
          workosOrganizationId,
        }).then(() => toast.success("Evidence due date set.")),
      setReviewTargetDate: (input) =>
        setReviewTargetDate({
          ...input,
          buildId: activeBuildId,
          workosOrganizationId,
        }).then(() => toast.success("Review target date set.")),
      setAdminDecisionTargetDate: (input) =>
        setAdminDecisionTargetDate({
          ...input,
          buildId: activeBuildId,
          workosOrganizationId,
        }).then(() => toast.success("Admin decision target set.")),
      setDrawReleaseTargetDate: (input) =>
        setDrawReleaseTargetDate({
          ...input,
          buildId: activeBuildId,
          workosOrganizationId,
        }).then(() => toast.success("Draw release target set.")),
      scheduleSiteVisit: (input) =>
        scheduleActiveBuildSiteVisit({
          ...input,
          buildId: activeBuildId,
          workosOrganizationId,
        }).then(() => toast.success("Site visit scheduled.")),
      rescheduleSiteVisit: (input) =>
        rescheduleActiveBuildSiteVisit({
          ...input,
          buildId: activeBuildId,
          workosOrganizationId,
        }).then(() => toast.success("Site visit rescheduled.")),
      cancelSiteVisit: (input) =>
        cancelActiveBuildSiteVisit({
          ...input,
          buildId: activeBuildId,
          workosOrganizationId,
        }).then(() => toast.success("Site visit cancelled.")),
      requestLoanFacilityDateChange: (input) =>
        requestLoanFacilityDateChange({
          ...input,
          buildId: activeBuildId,
          workosOrganizationId,
        }).then(() => toast.success("Facility date change requested.")),
      saveCalendarView: (input) =>
        saveCalendarView({
          ...input,
          surface: "activeBuild",
          workosOrganizationId,
        }),
      createCalendarSyncSubscription: (input) =>
        createCalendarSyncSubscription({
          ...input,
          buildId:
            input.surface === "activeBuild"
              ? (input.sourceId as Id<"activeBuilds">)
              : undefined,
          workosOrganizationId,
        }),
      recordExternalCalendarSyncChange: (input) =>
        recordExternalCalendarSyncChange({
          ...input,
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
      reviewEvidence: ({ accepted, milestoneKey, note }) =>
        reviewEvidence({
          accepted,
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
      updateNonFinancialDetails: (input) =>
        updateActiveBuildNonFinancialDetails({
          ...input,
          buildId: activeBuildId,
          workosOrganizationId,
        }).then(() => toast.success("Build details updated.")),
      materialPlanning: visualFixtureEnabled
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
          },
    };
    return (
      <ProductionBuildDetailSurface
        actions={actions}
        activeBuildId={activeBuildId}
        activeTab={search.tab ?? "details"}
        calendarTimeframe={search.timeframe}
        calendarWorkspace={calendarWorkspaceQuery as any}
        contractorDetailHrefFor={(contractorId) =>
          `/backoffice/contractors/${contractorId}`
        }
        detail={detail}
        milestoneKey={search.milestone}
        onChangeMilestone={onChangeMilestone}
        onChangeCalendarTimeframe={onChangeCalendarTimeframe}
        onChangeRail={onChangeRail}
        onChangeTab={onChangeTab}
        rail={search.rail}
        timelineWorkspace={effectiveTimelineWorkspace as any}
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
