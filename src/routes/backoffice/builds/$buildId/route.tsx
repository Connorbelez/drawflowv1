import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useAction, useMutation, useQuery } from "convex/react";
import { Suspense, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { Frame, FramePanel } from "#/components/ui/frame.tsx";
import { useRouteBreadcrumbProjection } from "#/components/route-breadcrumbs.tsx";
import type { BuildDetailSubTab } from "#/features/backoffice-build-detail/BuildDetailTabs.tsx";
import { DocumentOperationIntentRegistry } from "#/features/backoffice-build-detail/documentOperationIntent.ts";
import {
  BuildDetailTabFallback,
  LazyBuilderStaffPermissionsPanel,
  LazyCostDocumentBatchWorkspace,
  LazyCostDocumentRoadmapReconciliation,
  LazyQuoteRoundComparisonSurface,
  LazyQuoteRoundsSurface,
} from "#/features/backoffice-build-detail/lazy-build-detail-tabs.tsx";
import {
  type ProductionBuildDetail,
  type ProductionBuildDetailActions,
  ProductionBuildDetailSurface,
} from "#/features/backoffice-build-detail/ProductionBuildDetailSurface.tsx";
import { BuildDetailSheetHost } from "#/features/build-detail-targets/BuildDetailSheetHost.tsx";
import { SiteVisitScheduleIntentRegistry } from "#/features/backoffice-build-detail/siteVisitScheduleIntent.ts";
import {
  canUseAppPermission,
  filterMaterialPlanningActionsForPermissions,
} from "#/features/builder-staff/app-permissions.ts";
import type { CalendarTimeframe } from "#/features/calendar-workspace/calendarTypes.ts";
import { buildCostDocumentSubmilestoneOptions } from "#/features/cost-documents/SingleCostDocumentCapture.tsx";
import type { DrawWorkflowCapabilities } from "#/features/draw-workflow/drawWorkflow.ts";
import { isProductionVisualParityFixtureEnabled } from "#/features/production-proposals/visualParityConstants.ts";
import { canMakeActiveBuildFinalDecision } from "#/lib/auth/rbac.ts";
import { api } from "../../../../../convex/_generated/api";
import type { Id } from "../../../../../convex/_generated/dataModel";
import {
  resolveBuildBreadcrumbLabel,
  type BuildRouteAvailability,
} from "./-route-breadcrumb.ts";
import { validateBuildDetailSearch } from "./-route-search.ts";
import { resolveBackofficeBuildViewerCapacity } from "./-route-capacity.ts";

export { validateBuildDetailSearch } from "./-route-search.ts";

export const Route = createFileRoute("/backoffice/builds/$buildId")({
  staticData: {
    breadcrumb: {
      label: ({ params }) =>
        params.buildId ? "Loading build…" : "Build unavailable",
      params: ({ params }) =>
        params.buildId ? { buildId: params.buildId } : undefined,
      search: ({ search }) => search,
      to: "/backoffice/builds/$buildId",
    },
  },
  validateSearch: validateBuildDetailSearch,
  component: RouteComponent,
});

function RouteComponent() {
  const { buildId } = Route.useParams();
  const context = Route.useRouteContext();
  const search = Route.useSearch();
  const navigate = useNavigate();
  const visualFixtureEnabled = isProductionVisualParityFixtureEnabled();
  const [visualParityDetail, setVisualParityDetail] =
    useState<ProductionBuildDetail | null>(null);
  const [visualParityTimeline, setVisualParityTimeline] = useState<
    unknown | null
  >(null);
  useEffect(() => {
    if (!visualFixtureEnabled) {
      setVisualParityDetail(null);
      setVisualParityTimeline(null);
      return;
    }
    let cancelled = false;
    void import("#/features/production-proposals/visualParityFixtures.ts").then(
      (mod) => {
        if (cancelled) {
          return;
        }
        setVisualParityDetail(mod.getVisualParityActiveBuildDetail(buildId));
        setVisualParityTimeline(
          mod.getVisualParityActiveBuildTimelineWorkspace(buildId),
        );
      },
    );
    return () => {
      cancelled = true;
    };
  }, [buildId, visualFixtureEnabled]);
  const documentOperationIntents = useRef(
    new DocumentOperationIntentRegistry(),
  );
  const siteVisitScheduleIntents = useRef(
    new SiteVisitScheduleIntentRegistry(),
  );
  const addDocument = useMutation(
    api.production_proposals.addActiveBuildDocument,
  );
  const approveDraw = useMutation(
    api.production_proposals.approveActiveBuildDraw,
  );
  const startDrawReview = useMutation(
    api.production_proposals.startActiveBuildDrawReview,
  );
  const submitDrawForAdmin = useMutation(
    api.production_proposals.submitActiveBuildDrawForAdmin,
  );
  const approveMilestone = useMutation(
    api.production_proposals.approveActiveBuildMilestone,
  );
  const assignSiteVisit = useMutation(
    api.production_proposals.assignActiveBuildSiteVisit,
  );
  const generateSiteVisitGuidance = useAction(
    (api as any).assistant.generateSiteVisitGuidance,
  );
  const assignContractorToMilestone = useMutation(
    (api as any).production_proposals.assignActiveBuildContractorToMilestone,
  );
  const removeContractorFromMilestone = useMutation(
    api.production_proposals.removeActiveBuildContractorFromMilestone,
  );
  const attachAndInviteContractor = useMutation(
    (api as any).production_proposals.attachAndInviteActiveBuildContractor,
  );
  const attachContractor = useMutation(
    api.production_proposals.attachActiveBuildContractor,
  );
  const createContractor = useMutation(
    api.production_proposals.createContractorProfile,
  );
  const sendContractorInvite = useMutation(
    (api as any).contractorOnboarding.sendContractorProfileInvite,
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
  const requestBudgetRevision = useMutation(
    (api as any).production_proposals.requestActiveBuildBudgetRevision,
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
  const reviewBudgetRevision = useMutation(
    (api as any).production_proposals.reviewActiveBuildBudgetRevision,
  );
  const correctMilestoneStart = useMutation(
    (api as any).production_proposals.correctActiveBuildMilestoneStart,
  );
  const retractMilestoneStart = useMutation(
    (api as any).production_proposals.retractActiveBuildMilestoneStart,
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
  const activeTab = search.tab ?? "details";
  const tabNeedsTimeline = activeTab === "timeline" || activeTab === "gantt";
  const tabNeedsCalendar = activeTab === "calendar";
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
    ? visualParityDetail
    : productionBuildQuery;
  const buildRouteAvailability = useQuery(
    api.production_proposals.getActiveBuildRouteAvailabilityByString,
    visualFixtureEnabled || productionBuildQuery !== null
      ? "skip"
      : {
          buildId,
          workosOrganizationId: context.organizationId as string,
        },
  ) as BuildRouteAvailability | undefined;
  useRouteBreadcrumbProjection(
    "/backoffice/builds/$buildId",
    resolveBuildBreadcrumbLabel({
      availability: buildRouteAvailability,
      detail: effectiveProductionBuild,
    }),
  );
  const activeBuildIdForWorkspace = effectiveProductionBuild?.build?._id as any;
  const timelineWorkspaceQuery = useQuery(
    (api as any).production_proposals.getActiveBuildTimelineWorkspace,
    visualFixtureEnabled || !tabNeedsTimeline
      ? "skip"
      : effectiveProductionBuild
        ? {
            buildId: activeBuildIdForWorkspace,
            workosOrganizationId: context.organizationId as string,
          }
        : "skip",
  );
  const effectiveTimelineWorkspace = visualFixtureEnabled
    ? visualParityTimeline
    : timelineWorkspaceQuery;
  const calendarWorkspaceQuery = useQuery(
    (api as any).production_proposals.getActiveBuildCalendarWorkspace,
    visualFixtureEnabled || !tabNeedsCalendar
      ? "skip"
      : effectiveProductionBuild
        ? {
            buildId: activeBuildIdForWorkspace,
            workosOrganizationId: context.organizationId as string,
          }
        : "skip",
  );

  const onChangeTab = (tab: BuildDetailSubTab, focus?: string) =>
    navigate({
      to: "/backoffice/builds/$buildId",
      params: { buildId },
      search: {
        ...search,
        costBatch: tab === "costs" ? search.costBatch : undefined,
        costDocument: tab === "costs" ? search.costDocument : undefined,
        costDocumentDraft:
          tab === "costs" ? search.costDocumentDraft : undefined,
        focus: focus ?? search.focus,
        roundId: tab === "quotes" ? search.roundId : undefined,
        tab,
      },
      replace: !focus || focus === search.focus,
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
      resetScroll: false,
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
    const viewerRoles = [context.role, ...(context.roles ?? [])];
    const viewerCapacity = resolveBackofficeBuildViewerCapacity(viewerRoles);
    const appPermissions = detail.appPermissions;
    const canMakeFinalDecision = canMakeActiveBuildFinalDecision(viewerRoles);
    const costDocumentActorCapacity = viewerRoles.includes("admin")
      ? "admin"
      : viewerRoles.includes("principle-broker")
        ? "principle-broker"
        : undefined;
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
          },
    );
    const actions: ProductionBuildDetailActions = {
      addDocument: canUseAppPermission(appPermissions, "evidence", "create")
        ? async (input) => {
            const clientOperationId =
              documentOperationIntents.current.keyFor(input);
            const result = await addDocument({
              buildId: activeBuildId,
              clientOperationId,
              ...input,
              mimeType: "application/octet-stream",
              sizeBytes: 0,
              workosOrganizationId,
            });
            documentOperationIntents.current.confirm(input);
            toast.success("Document added.");
            return result;
          }
        : undefined,
      approveDraw:
        canMakeFinalDecision &&
        canUseAppPermission(appPermissions, "draw", "update")
          ? (draw) =>
              approveDraw({
                buildId: activeBuildId,
                drawKey: draw.drawKey,
                note: "Approved for release from build detail workspace.",
                workosOrganizationId,
              })
          : undefined,
      approveMilestone:
        canMakeFinalDecision &&
        canUseAppPermission(appPermissions, "milestone", "update")
          ? ({ milestoneKey, note }) =>
              approveMilestone({
                buildId: activeBuildId,
                milestoneKey,
                note,
                workosOrganizationId,
              })
          : undefined,
      assignSiteVisit: canUseAppPermission(appPermissions, "evidence", "update")
        ? async (input) => {
            const intent = { ...input, requestedDay: 0 };
            const idempotencyKey =
              siteVisitScheduleIntents.current.keyFor(intent);
            const result = await assignSiteVisit({
              buildId: activeBuildId,
              idempotencyKey,
              milestoneKey: input.milestoneKey,
              note: input.note ?? "Assigned from build detail workspace.",
              requestedDay: 0,
              requestedTime: input.requestedTime,
              siteVisitGuidance: input.siteVisitGuidance,
              submilestoneGuidanceSections:
                input.submilestoneGuidanceSections,
              submilestoneKeys: input.submilestoneKeys,
              workosOrganizationId,
            });
            siteVisitScheduleIntents.current.confirm(intent);
            toast.success("Site visit assigned.");
            return result;
          }
        : undefined,
      generateSiteVisitGuidance: canUseAppPermission(
        appPermissions,
        "evidence",
        "update",
      )
        ? (input) =>
            generateSiteVisitGuidance({
              ...input,
              workosOrganizationId,
            })
        : undefined,
      assignContractorToMilestone: canUseAppPermission(
        appPermissions,
        "contractor",
        "update",
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
      removeContractorFromMilestone: canUseAppPermission(
        appPermissions,
        "contractor",
        "update",
      )
        ? ({ contractorId, milestoneKey, reason, submilestoneKey }) =>
            removeContractorFromMilestone({
              buildId: activeBuildId,
              contractorId: contractorId as Id<"contractorProfiles">,
              milestoneKey,
              reason,
              submilestoneKey,
              workosOrganizationId,
            })
        : undefined,
      attachAndInviteContractor:
        canUseAppPermission(appPermissions, "contractor", "create") &&
        canUseAppPermission(appPermissions, "contractor", "update")
          ? ({ contractorId, role }) =>
              attachAndInviteContractor({
                buildId: activeBuildId,
                contractorId: contractorId as Id<"contractorProfiles">,
                role,
                workosOrganizationId,
              })
          : undefined,
      attachContractor: canUseAppPermission(
        appPermissions,
        "contractor",
        "update",
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
        "create",
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
            return contractorId;
          }
        : undefined,
      createAndAssignContractor: canUseAppPermission(
        appPermissions,
        "contractor",
        "create",
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
            return contractorId;
          }
        : undefined,
      inviteContractor: canUseAppPermission(
        appPermissions,
        "contractor",
        "create",
      )
        ? (contractorId) =>
            sendContractorInvite({
              contractorId: contractorId as Id<"contractorProfiles">,
              workosOrganizationId,
            })
        : undefined,
      rejectDraw:
        canMakeFinalDecision &&
        canUseAppPermission(appPermissions, "draw", "update")
          ? ({ draw, reason }) =>
              rejectDraw({
                buildId: activeBuildId,
                drawKey: draw.drawKey,
                note: reason,
                workosOrganizationId,
              })
          : undefined,
      rejectMilestone:
        canMakeFinalDecision &&
        canUseAppPermission(appPermissions, "milestone", "update")
          ? ({ milestoneKey }) =>
              rejectMilestone({
                buildId: activeBuildId,
                milestoneKey,
                note: "Rejected from build detail workspace.",
                workosOrganizationId,
              })
          : undefined,
      releaseDraw:
        canMakeFinalDecision &&
        canUseAppPermission(appPermissions, "draw", "update")
          ? (draw) =>
              releaseDraw({
                buildId: activeBuildId,
                drawKey: draw.drawKey,
                note: "Released from build detail workspace.",
                releaseDate: new Date().toISOString().slice(0, 10),
                workosOrganizationId,
              })
          : undefined,
      startDrawReview: canUseAppPermission(appPermissions, "draw", "update")
        ? (draw) =>
            startDrawReview({
              buildId: activeBuildId,
              drawKey: draw.drawKey,
              note: "Review started from build detail workspace.",
              workosOrganizationId,
            })
        : undefined,
      submitDrawForAdmin: canUseAppPermission(appPermissions, "draw", "update")
        ? (draw) =>
            submitDrawForAdmin({
              buildId: activeBuildId,
              drawKey: draw.drawKey,
              note: "Operations review complete; recommend admin approval.",
              workosOrganizationId,
            })
        : undefined,
      reviseMilestoneSchedule: canUseAppPermission(
        appPermissions,
        "milestone",
        "update",
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
        "update",
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
        "create",
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
        "create",
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
        "create",
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
        "update",
      )
        ? async (input) => {
            const idempotencyKey =
              siteVisitScheduleIntents.current.keyFor(input);
            const result = await scheduleActiveBuildSiteVisit({
              ...input,
              buildId: activeBuildId,
              idempotencyKey,
              workosOrganizationId,
            });
            siteVisitScheduleIntents.current.confirm(input);
            toast.success("Site visit scheduled.");
            return result;
          }
        : undefined,
      rescheduleSiteVisit: canUseAppPermission(
        appPermissions,
        "evidence",
        "update",
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
        "create",
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
        "create",
      )
        ? (input) =>
            requestFacilityChange({
              ...input,
              buildId: activeBuildId,
              workosOrganizationId,
            })
        : undefined,
      requestBudgetRevision: canUseAppPermission(
        appPermissions,
        "capitalEvent",
        "create",
      )
        ? (input) =>
            requestBudgetRevision({
              ...input,
              buildId: activeBuildId,
              workosOrganizationId,
            })
        : undefined,
      reviewFacilityChangeRequest: canUseAppPermission(
        appPermissions,
        "capitalEvent",
        "update",
      )
        ? (input) =>
            reviewFacilityChangeRequest({
              ...input,
              requestId: input.requestId as any,
              workosOrganizationId,
            })
        : undefined,
      reviewBudgetRevision: canUseAppPermission(
        appPermissions,
        "capitalEvent",
        "update",
      )
        ? (input) =>
            reviewBudgetRevision({
              ...input,
              requestId: input.requestId as any,
              workosOrganizationId,
            })
        : undefined,
      requestMilestoneInfo: canUseAppPermission(
        appPermissions,
        "milestone",
        "update",
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
      correctMilestoneStart: canUseAppPermission(
        appPermissions,
        "milestone",
        "update",
      )
        ? (input) =>
            correctMilestoneStart({
              ...input,
              buildId: activeBuildId,
              workosOrganizationId,
            })
        : undefined,
      retractMilestoneStart: canUseAppPermission(
        appPermissions,
        "milestone",
        "update",
      )
        ? (input) =>
            retractMilestoneStart({
              ...input,
              buildId: activeBuildId,
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
    const drawCapabilities: DrawWorkflowCapabilities = {
      canApprove: Boolean(actions.approveDraw),
      canOpenReview:
        viewerCapacity !== "builder" && viewerCapacity !== "builder-staff",
      canReject: Boolean(actions.rejectDraw),
      canRelease: Boolean(actions.releaseDraw),
      canStartReview: Boolean(actions.startDrawReview),
      canSubmitForAdmin:
        Boolean(actions.submitDrawForAdmin) &&
        !canMakeFinalDecision &&
        viewerCapacity !== "admin" &&
        viewerCapacity !== "principle-broker",
    };
    const costDocumentSubmilestones = buildCostDocumentSubmilestoneOptions(
      detail.milestones ?? [],
      detail.submilestones ?? [],
    );
    return (
      <BuildDetailSheetHost
        buildId={activeBuildId as Id<"activeBuilds">}
        detailTab={search.detailTab}
        focus={search.focus}
        organizationId={workosOrganizationId}
        viewerCapacity={viewerCapacity}
      >
        {(detailSheetHost) => (
      <ProductionBuildDetailSurface
        actions={actions}
        activeBuildId={activeBuildId}
        activeTab={search.tab ?? "details"}
        calendarTimeframe={search.timeframe}
        calendarWorkspace={calendarWorkspaceQuery as any}
        contractorDetailHrefFor={(contractorId) =>
              `/backoffice/contractors/${contractorId}`
            }
            detailSheetHost={detailSheetHost}
            drawCapabilities={drawCapabilities}
            onOpenCanonicalTarget={detailSheetHost.controller.openTarget}
            costs={
              <Suspense fallback={<BuildDetailTabFallback label="costs" />}>
            {costDocumentActorCapacity ? (
              <LazyCostDocumentBatchWorkspace
                actorCapacity={costDocumentActorCapacity}
                batchId={search.costBatch}
                buildId={activeBuildId as Id<"activeBuilds">}
                draftId={search.costDocumentDraft}
                onBatchIdChange={(batchId) =>
                  navigate({
                    params: { buildId },
                    replace: Boolean(search.costBatch) || !batchId,
                    search: {
                      ...search,
                      costBatch: batchId,
                      costDocument: undefined,
                      costDocumentDraft: undefined,
                      tab: "costs",
                    },
                    to: "/backoffice/builds/$buildId",
                  } as never)
                }
                organizationId={workosOrganizationId}
                reconciliation={{
                  onCostDocumentCorrectionStarted: ({ batchId, draftId }) =>
                    navigate({
                      params: { buildId },
                      replace: false,
                      search: {
                        ...search,
                        costBatch: batchId,
                        costDocument: undefined,
                        costDocumentDraft: draftId,
                        tab: "costs",
                      },
                      to: "/backoffice/builds/$buildId",
                    } as never),
                  onCostDocumentIdChange: (costDocumentId) =>
                    navigate({
                      params: { buildId },
                      replace: !costDocumentId,
                      search: {
                        ...search,
                        costBatch: undefined,
                        costDocument: costDocumentId,
                        costDocumentDraft: undefined,
                        tab: "costs",
                      },
                      to: "/backoffice/builds/$buildId",
                    } as never),
                  selectedCostDocumentId: search.costDocument,
                }}
                submilestones={costDocumentSubmilestones}
              />
            ) : (
              <LazyCostDocumentRoadmapReconciliation
                actorCapacity={costDocumentActorCapacity}
                buildId={activeBuildId as Id<"activeBuilds">}
                interactionMode="brokerage-review"
                onCloseCostDocument={() =>
                  navigate({
                    params: { buildId },
                    replace: true,
                    search: {
                      ...search,
                      costDocument: undefined,
                      tab: "costs",
                    },
                    to: "/backoffice/builds/$buildId",
                  } as never)
                }
                onOpenCostDocument={(costDocument) =>
                  navigate({
                    params: { buildId },
                    replace: false,
                    search: { ...search, costDocument, tab: "costs" },
                    to: "/backoffice/builds/$buildId",
                  } as never)
                }
                organizationId={workosOrganizationId}
                selectedCostDocumentId={search.costDocument}
                submilestones={costDocumentSubmilestones}
              />
            )}
          </Suspense>
        }
        detail={detail}
        detailTab={search.detailTab}
        focusedReference={search.focus}
        fundingWorkspaceEnabled
        milestoneKey={search.milestone}
        onChangeCalendarTimeframe={onChangeCalendarTimeframe}
        onChangeMilestone={onChangeMilestone}
        onChangeRail={onChangeRail}
        onChangeTab={onChangeTab}
        quotes={
          <Suspense fallback={<BuildDetailTabFallback label="quotes" />}>
            {search.roundId ? (
              <LazyQuoteRoundComparisonSurface
                buildId={String(activeBuildId)}
                onExit={() =>
                  navigate({
                    params: { buildId },
                    replace: true,
                    search: { ...search, roundId: undefined, tab: "quotes" },
                    to: "/backoffice/builds/$buildId",
                  } as never)
                }
                organizationId={workosOrganizationId}
                quoteRoundId={search.roundId}
                readerKind="backoffice"
                readOnly
              />
            ) : (
              <LazyQuoteRoundsSurface
                buildId={String(activeBuildId)}
                onCreate={() =>
                  navigate({
                    params: { buildId },
                    search: {},
                    to: "/backoffice/builds/$buildId/quotes/new",
                  })
                }
                onOpen={(roundId) =>
                  navigate({
                    params: { buildId },
                    search: { roundId },
                    to: "/backoffice/builds/$buildId/quotes/new",
                  })
                }
                organizationId={workosOrganizationId}
              />
            )}
          </Suspense>
        }
        rail={search.rail}
        staff={
          visualFixtureEnabled ? undefined : (
            <Suspense fallback={<BuildDetailTabFallback label="staff" />}>
              <LazyBuilderStaffPermissionsPanel
                buildId={activeBuildId as Id<"activeBuilds">}
                initialSelectedWorkosUserId={
                  search.focus?.startsWith("participant:")
                    ? search.focus.slice("participant:".length)
                    : undefined
                }
                scope="activeBuild"
                workosOrganizationId={workosOrganizationId}
              />
            </Suspense>
          )
        }
        timelineWorkspace={effectiveTimelineWorkspace as any}
        viewerCapacity={viewerCapacity}
        viewerRole="lender"
        workosOrganizationId={workosOrganizationId}
      />
        )}
      </BuildDetailSheetHost>
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
