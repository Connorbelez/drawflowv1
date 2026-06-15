import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery } from "convex/react";
import { toast } from "sonner";

import { Frame, FramePanel } from "#/components/ui/frame.tsx";
import type { BuildDetailSubTab } from "#/features/backoffice-build-detail/BuildDetailTabs.tsx";
import {
  type ProductionBuildDetail,
  type ProductionBuildDetailActions,
  ProductionBuildDetailSurface,
} from "#/features/backoffice-build-detail/ProductionBuildDetailSurface.tsx";
import {
  canUseAppPermission,
  filterMaterialPlanningActionsForPermissions,
} from "#/features/builder-staff/app-permissions.ts";
import { BuilderStaffPermissionsPanel } from "#/features/builder-staff/BuilderStaffPermissionsPanel.tsx";
import type { CalendarTimeframe } from "#/features/calendar-workspace/calendarTypes.ts";
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
    | "staff"
    | "timeline";
  rail?: "open" | "closed";
};

export const Route = createFileRoute("/backoffice/builds/$buildId")({
  validateSearch: (search: Record<string, unknown>): BuildDetailSearch => {
    const tab =
      search.tab === "timeline" ||
      search.tab === "evidence" ||
      search.tab === "materials" ||
      search.tab === "staff" ||
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
    if (milestone !== undefined) {
      out.milestone = milestone;
    }
    if (tab !== undefined) {
      out.tab = tab;
    }
    if (rail !== undefined) {
      out.rail = rail;
    }
    if (timeframe !== undefined) {
      out.timeframe = timeframe;
    }
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
    api.production_proposals.addActiveBuildDocument
  );
  const addNote = useMutation(api.production_proposals.addActiveBuildNote);
  const approveDraw = useMutation(
    api.production_proposals.approveActiveBuildDraw
  );
  const approveMilestone = useMutation(
    api.production_proposals.approveActiveBuildMilestone
  );
  const assignSiteVisit = useMutation(
    api.production_proposals.assignActiveBuildSiteVisit
  );
  const assignContractorToMilestone = useMutation(
    (api as any).production_proposals.assignActiveBuildContractorToMilestone
  );
  const attachContractor = useMutation(
    api.production_proposals.attachActiveBuildContractor
  );
  const createContractor = useMutation(
    api.production_proposals.createContractorProfile
  );
  const rejectDraw = useMutation(
    api.production_proposals.rejectActiveBuildDraw
  );
  const rejectMilestone = useMutation(
    api.production_proposals.rejectActiveBuildMilestone
  );
  const releaseDraw = useMutation(
    api.production_proposals.releaseActiveBuildDraw
  );
  const requestFacilityChange = useMutation(
    (api as any).production_proposals.requestActiveBuildFacilityChange
  );
  const requestDraw = useMutation(
    api.production_proposals.requestActiveBuildDraw
  );
  const requestMilestoneInfo = useMutation(
    api.production_proposals.requestActiveBuildMilestoneInfo
  );
  const reviewEvidence = useMutation(
    api.production_proposals.reviewActiveBuildEvidence
  );
  const reviewFacilityChangeRequest = useMutation(
    (api as any).production_proposals.reviewActiveBuildFacilityChangeRequest
  );
  const startMilestoneWork = useMutation(
    api.production_proposals.startActiveBuildMilestone
  );
  const createActiveBuildCostItem = useMutation(
    api.production_proposals.createActiveBuildCostItem
  );
  const updateActiveBuildCostItem = useMutation(
    api.production_proposals.updateActiveBuildCostItem
  );
  const updateActiveBuildNonFinancialDetails = useMutation(
    (api as any).production_proposals.updateActiveBuildNonFinancialDetails
  );
  const deleteActiveBuildCostItem = useMutation(
    api.production_proposals.deleteActiveBuildCostItem
  );
  const reviseActiveBuildMilestoneSchedule = useMutation(
    (api as any).production_proposals.reviseActiveBuildMilestoneSchedule
  );
  const setEvidenceDueDate = useMutation(
    (api as any).production_proposals.setEvidenceDueDate
  );
  const setReviewTargetDate = useMutation(
    (api as any).production_proposals.setReviewTargetDate
  );
  const setAdminDecisionTargetDate = useMutation(
    (api as any).production_proposals.setAdminDecisionTargetDate
  );
  const setDrawReleaseTargetDate = useMutation(
    (api as any).production_proposals.setDrawReleaseTargetDate
  );
  const scheduleActiveBuildSiteVisit = useMutation(
    (api as any).production_proposals.scheduleActiveBuildSiteVisit
  );
  const rescheduleActiveBuildSiteVisit = useMutation(
    (api as any).production_proposals.rescheduleActiveBuildSiteVisit
  );
  const cancelActiveBuildSiteVisit = useMutation(
    (api as any).production_proposals.cancelActiveBuildSiteVisit
  );
  const requestLoanFacilityDateChange = useMutation(
    (api as any).production_proposals.requestLoanFacilityDateChange
  );
  const saveCalendarView = useMutation(
    (api as any).production_proposals.saveCalendarView
  );
  const createCalendarSyncSubscription = useMutation(
    (api as any).production_proposals.createCalendarSyncSubscription
  );
  const recordExternalCalendarSyncChange = useMutation(
    (api as any).production_proposals.recordExternalCalendarSyncChange
  );
  const productionBuildQuery = useQuery(
    api.production_proposals.getActiveBuildDetailByString,
    visualFixtureEnabled
      ? "skip"
      : {
          buildId,
          workosOrganizationId: context.organizationId as string,
        }
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
        : "skip"
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
        : "skip"
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
    const appPermissions = detail.appPermissions;
    const materialPlanningActions = filterMaterialPlanningActionsForPermissions(
      appPermissions,
      visualFixtureEnabled
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
          }
    );
    const actions: ProductionBuildDetailActions = {
      addDocument: canUseAppPermission(appPermissions, "evidence", "create")
        ? ({ documentType, fileName }) =>
            addDocument({
              buildId: activeBuildId,
              documentType,
              fileName,
              mimeType: "application/octet-stream",
              sizeBytes: 0,
              workosOrganizationId,
            })
        : undefined,
      addNote: ({ body, visibility }) =>
        addNote({
          body,
          buildId: activeBuildId,
          visibility,
          workosOrganizationId,
        }),
      approveDraw: canUseAppPermission(appPermissions, "draw", "update")
        ? (draw) =>
            approveDraw({
              buildId: activeBuildId,
              drawKey: draw.drawKey,
              note: "Approved from build detail workspace.",
              workosOrganizationId,
            })
        : undefined,
      approveMilestone: canUseAppPermission(
        appPermissions,
        "milestone",
        "update"
      )
        ? ({ milestoneKey, note }) =>
            approveMilestone({
              buildId: activeBuildId,
              milestoneKey,
              note,
              workosOrganizationId,
            })
        : undefined,
      assignSiteVisit: canUseAppPermission(appPermissions, "evidence", "update")
        ? ({ milestoneKey }) =>
            assignSiteVisit({
              buildId: activeBuildId,
              milestoneKey,
              note: "Assigned from build detail workspace.",
              requestedDay: 0,
              workosOrganizationId,
            })
        : undefined,
      assignContractorToMilestone: canUseAppPermission(
        appPermissions,
        "contractor",
        "update"
      )
        ? ({
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
            })
        : undefined,
      attachContractor: canUseAppPermission(
        appPermissions,
        "contractor",
        "update"
      )
        ? ({ contractorId, role }) =>
            attachContractor({
              buildId: activeBuildId,
              contractorId: contractorId as any,
              role,
              workosOrganizationId,
            })
        : undefined,
      createAndAttachContractor: canUseAppPermission(
        appPermissions,
        "contractor",
        "create"
      )
        ? async ({ contractor, role }) => {
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
          }
        : undefined,
      createAndAssignContractor: canUseAppPermission(
        appPermissions,
        "contractor",
        "create"
      )
        ? async ({ assignmentCost, contractor, milestoneKey, role }) => {
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
          }
        : undefined,
      rejectDraw: canUseAppPermission(appPermissions, "draw", "update")
        ? (draw) =>
            rejectDraw({
              buildId: activeBuildId,
              drawKey: draw.drawKey,
              note: "Rejected from build detail workspace.",
              workosOrganizationId,
            })
        : undefined,
      rejectMilestone: canUseAppPermission(
        appPermissions,
        "milestone",
        "update"
      )
        ? ({ milestoneKey }) =>
            rejectMilestone({
              buildId: activeBuildId,
              milestoneKey,
              note: "Rejected from build detail workspace.",
              workosOrganizationId,
            })
        : undefined,
      releaseDraw: canUseAppPermission(appPermissions, "draw", "update")
        ? (draw) =>
            releaseDraw({
              buildId: activeBuildId,
              drawKey: draw.drawKey,
              note: "Released from build detail workspace.",
              releaseDate: new Date().toISOString().slice(0, 10),
              workosOrganizationId,
            })
        : undefined,
      reviseMilestoneSchedule: canUseAppPermission(
        appPermissions,
        "milestone",
        "update"
      )
        ? (input) =>
            reviseActiveBuildMilestoneSchedule({
              ...input,
              buildId: activeBuildId,
              workosOrganizationId,
            }).then(() => toast.success("Milestone schedule revised."))
        : undefined,
      setEvidenceDueDate: canUseAppPermission(
        appPermissions,
        "evidence",
        "update"
      )
        ? (input) =>
            setEvidenceDueDate({
              ...input,
              buildId: activeBuildId,
              workosOrganizationId,
            }).then(() => toast.success("Evidence due date set."))
        : undefined,
      setReviewTargetDate: canUseAppPermission(
        appPermissions,
        "reminder",
        "create"
      )
        ? (input) =>
            setReviewTargetDate({
              ...input,
              buildId: activeBuildId,
              workosOrganizationId,
            }).then(() => toast.success("Review target date set."))
        : undefined,
      setAdminDecisionTargetDate: canUseAppPermission(
        appPermissions,
        "reminder",
        "create"
      )
        ? (input) =>
            setAdminDecisionTargetDate({
              ...input,
              buildId: activeBuildId,
              workosOrganizationId,
            }).then(() => toast.success("Admin decision target set."))
        : undefined,
      setDrawReleaseTargetDate: canUseAppPermission(
        appPermissions,
        "reminder",
        "create"
      )
        ? (input) =>
            setDrawReleaseTargetDate({
              ...input,
              buildId: activeBuildId,
              workosOrganizationId,
            }).then(() => toast.success("Draw release target set."))
        : undefined,
      scheduleSiteVisit: canUseAppPermission(
        appPermissions,
        "evidence",
        "update"
      )
        ? (input) =>
            scheduleActiveBuildSiteVisit({
              ...input,
              buildId: activeBuildId,
              workosOrganizationId,
            }).then(() => toast.success("Site visit scheduled."))
        : undefined,
      rescheduleSiteVisit: canUseAppPermission(
        appPermissions,
        "evidence",
        "update"
      )
        ? (input) =>
            rescheduleActiveBuildSiteVisit({
              ...input,
              buildId: activeBuildId,
              workosOrganizationId,
            }).then(() => toast.success("Site visit rescheduled."))
        : undefined,
      cancelSiteVisit: canUseAppPermission(appPermissions, "evidence", "update")
        ? (input) =>
            cancelActiveBuildSiteVisit({
              ...input,
              buildId: activeBuildId,
              workosOrganizationId,
            }).then(() => toast.success("Site visit cancelled."))
        : undefined,
      requestLoanFacilityDateChange: canUseAppPermission(
        appPermissions,
        "capitalEvent",
        "create"
      )
        ? (input) =>
            requestLoanFacilityDateChange({
              ...input,
              buildId: activeBuildId,
              workosOrganizationId,
            }).then(() => toast.success("Facility date change requested."))
        : undefined,
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
      requestFacilityChange: canUseAppPermission(
        appPermissions,
        "capitalEvent",
        "create"
      )
        ? (input) =>
            requestFacilityChange({
              ...input,
              buildId: activeBuildId,
              workosOrganizationId,
            })
        : undefined,
      requestDraw: canUseAppPermission(appPermissions, "draw", "update")
        ? (draw) =>
            requestDraw({
              amountCents: draw.amountCents,
              buildId: activeBuildId,
              drawKey: draw.drawKey,
              note: "Requested from build detail workspace.",
              workosOrganizationId,
            })
        : undefined,
      reviewFacilityChangeRequest: canUseAppPermission(
        appPermissions,
        "capitalEvent",
        "update"
      )
        ? (input) =>
            reviewFacilityChangeRequest({
              ...input,
              requestId: input.requestId as any,
              workosOrganizationId,
            })
        : undefined,
      requestMilestoneInfo: canUseAppPermission(
        appPermissions,
        "milestone",
        "update"
      )
        ? ({ milestoneKey, note }) =>
            requestMilestoneInfo({
              buildId: activeBuildId,
              milestoneKey,
              note,
              workosOrganizationId,
            })
        : undefined,
      reviewEvidence: canUseAppPermission(appPermissions, "evidence", "update")
        ? ({ accepted, milestoneKey, note }) =>
            reviewEvidence({
              accepted,
              buildId: activeBuildId,
              milestoneKey,
              note,
              workosOrganizationId,
            })
        : undefined,
      startMilestoneWork: canUseAppPermission(
        appPermissions,
        "milestone",
        "update"
      )
        ? ({ milestoneKey, note }) =>
            startMilestoneWork({
              buildId: activeBuildId,
              milestoneKey,
              note,
              workosOrganizationId,
            })
        : undefined,
      updateNonFinancialDetails: (input) =>
        updateActiveBuildNonFinancialDetails({
          ...input,
          buildId: activeBuildId,
          workosOrganizationId,
        }).then(() => toast.success("Build details updated.")),
      materialPlanning: materialPlanningActions,
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
        onChangeCalendarTimeframe={onChangeCalendarTimeframe}
        onChangeMilestone={onChangeMilestone}
        onChangeRail={onChangeRail}
        onChangeTab={onChangeTab}
        rail={search.rail}
        staff={
          visualFixtureEnabled ? undefined : (
            <BuilderStaffPermissionsPanel
              buildId={activeBuildId as Id<"activeBuilds">}
              scope="activeBuild"
              workosOrganizationId={workosOrganizationId}
            />
          )
        }
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
