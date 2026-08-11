import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery } from "convex/react";
import { CheckCircle2, ExternalLink, Loader2, XCircle } from "lucide-react";
import { useReducedMotion } from "motion/react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import {
  AnimatedCurvedTimeline,
  type TimelineItem,
  type TimelineMarker,
} from "#/components/roadmap/AnimatedCurvedTimeline.tsx";
import { Badge } from "#/components/ui/badge.tsx";
import { Button } from "#/components/ui/button.tsx";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "#/components/ui/card.tsx";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "#/components/ui/dialog.tsx";
import { Frame, FramePanel } from "#/components/ui/frame.tsx";
import { Input } from "#/components/ui/input.tsx";
import { Label } from "#/components/ui/label.tsx";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "#/components/ui/table.tsx";
import { Textarea } from "#/components/ui/textarea.tsx";
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
import type { CalendarTimeframe } from "#/features/calendar-workspace/calendarTypes.ts";
import { ProductionContractorPlanningTab } from "#/features/production-proposals/ProductionContractorPlanningTab.tsx";
import { ProductionProposalTimelineGanttWorkspace } from "#/features/production-proposals/ProductionProposalGanttWorkspace.tsx";
import { ProductionProposalMilestoneWorksheetContainer } from "#/features/production-proposals/ProductionProposalMilestoneWorksheetContainer.tsx";
import { ProductionProposalReviewSurface } from "#/features/production-proposals/ProductionProposalSurfaces.tsx";
import { ProductionTimelineWorkspace } from "#/features/production-proposals/ProductionTimelineWorkspace.tsx";
import {
  createVisualParityCostItem,
  getVisualParityProposalDetail,
  getVisualParityTimelineWorkspace,
  isProductionVisualParityFixtureEnabled,
} from "#/features/production-proposals/visualParityFixtures.ts";
import {
  MilestoneCard,
  type MilestoneCardUpdate,
} from "#/features/timeline-workspace/-MilestoneCard.tsx";
import {
  TimelineCashflowCompoundChart,
  type TimelineCashflowCompoundDatum,
  type TimelineCashflowReferenceLine,
} from "#/features/timeline-workspace/-TimelineCashflowCompoundChart.tsx";
import {
  TimelineDrawAvailabilityChart,
  type TimelineDrawAvailabilityDatum,
  type TimelineDrawAvailabilityReferenceLine,
} from "#/features/timeline-workspace/-TimelineDrawAvailabilityChart.tsx";
import { TimelineEndNodeButton } from "#/features/timeline-workspace/-TimelineEndNodeButton.tsx";
import { getMilestoneEndX } from "#/features/timeline-workspace/-timeline-milestone-schedule.ts";
import type { DemoMilestone } from "#/features/timeline-workspace/-timeline-share-snapshot.ts";
import { getUserManagementAccessDecision } from "#/lib/auth/rbac.ts";
import { cn } from "#/lib/utils.ts";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";

const PROPOSAL_REVIEW_TIMELINE_SIZING = {
  cardWidth: 232,
  minNodeSpacingPx: 198,
  paddingX: 136,
  pixelsPerUnit: 6.4,
} as const;
const PROPOSAL_REVIEW_INTEREST_APR = 0.0925;
const proposalMilestoneStatusMap = {
  complete: "complete",
  ready: "ready",
  review: "ready",
  upcoming: "upcoming",
} as const satisfies Record<string, DemoMilestone["status"]>;

type ProposalReviewSearch = {
  tab?:
    | "calendar"
    | "closing"
    | "contractors"
    | "draws"
    | "gantt"
    | "milestones"
    | "materials"
    | "packet"
    | "review"
    | "staff"
    | "timeline";
  timeframe?: CalendarTimeframe;
};

type ProposalReviewRouteTab = NonNullable<ProposalReviewSearch["tab"]>;

const PROPOSAL_REVIEW_TABS = new Set<ProposalReviewRouteTab>([
  "calendar",
  "closing",
  "contractors",
  "draws",
  "gantt",
  "milestones",
  "materials",
  "packet",
  "review",
  "staff",
  "timeline",
]);
const PROPOSAL_REVIEW_TIMEFRAMES = new Set<CalendarTimeframe>([
  "agenda",
  "day",
  "month",
  "quarter",
  "week",
]);

export function validateProposalReviewSearch(
  search: Record<string, unknown>
): ProposalReviewSearch {
  const candidateTab =
    typeof search.tab === "string"
      ? (search.tab as ProposalReviewRouteTab)
      : undefined;
  const tab =
    candidateTab && PROPOSAL_REVIEW_TABS.has(candidateTab)
      ? candidateTab
      : undefined;
  const candidateTimeframe =
    typeof search.timeframe === "string"
      ? (search.timeframe as CalendarTimeframe)
      : undefined;
  const timeframe =
    candidateTimeframe && PROPOSAL_REVIEW_TIMEFRAMES.has(candidateTimeframe)
      ? candidateTimeframe
      : undefined;

  return {
    ...(tab ? { tab } : {}),
    ...(timeframe ? { timeframe } : {}),
  };
}

export function resolveProposalReviewRouteTab(
  search: ProposalReviewSearch
): ProposalReviewRouteTab {
  return search.tab ?? "packet";
}

export function shouldLoadProposalCalendarWorkspace(
  activeTab: ProposalReviewRouteTab
) {
  return activeTab === "calendar";
}

export function shouldLoadProposalContractorPlanning(
  activeTab: ProposalReviewRouteTab
) {
  return (
    activeTab === "contractors" ||
    activeTab === "gantt" ||
    activeTab === "milestones"
  );
}

export function shouldLoadProposalReviewBuilders(
  activeTab: ProposalReviewRouteTab
) {
  return activeTab === "packet" || activeTab === "review";
}

export function shouldMountProposalStaffPanel(
  activeTab: ProposalReviewRouteTab
) {
  return activeTab === "staff";
}

export const Route = createFileRoute("/backoffice/proposals/$planId")({
  ssr: false,
  staticData: {
    breadcrumb: {
      label: ({ params }) => params.planId,
      to: "/backoffice/proposals/$planId",
    },
  },
  validateSearch: validateProposalReviewSearch,
  component: ProposalReviewRoute,
});

type TabKey = "adjustments" | "timeline";
type DecisionModal = "approve" | "reject";

function ProposalReviewRoute() {
  const { planId } = Route.useParams();
  const search = Route.useSearch();
  const context = Route.useRouteContext();
  const navigate = useNavigate();
  const workosOrganizationId = context.organizationId as string;
  const userManagementAccess = getUserManagementAccessDecision({
    isAuthenticated: Boolean(context.userId),
    organizationId: context.organizationId,
    pathname: "/backoffice/onboard-builder",
    roles: [context.role, ...(context.roles ?? [])],
    workspace: "backoffice",
  });
  const canOnboardBuilder = userManagementAccess.status === "allowed";
  const canManageBrokerAssignment = userManagementAccess.status === "allowed";
  const visualFixtureEnabled = isProductionVisualParityFixtureEnabled();
  const visualProposalDetail = useMemo(
    () => getVisualParityProposalDetail(planId),
    [planId]
  );
  const [visualCostItems, setVisualCostItems] = useState(
    () => visualProposalDetail.costItems ?? []
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
  const joinSession = useMutation(api.proposal_collaboration.joinSession);
  const activeReviewTab = resolveProposalReviewRouteTab(search);
  const loadCalendarWorkspace =
    shouldLoadProposalCalendarWorkspace(activeReviewTab);
  const loadContractorPlanning =
    shouldLoadProposalContractorPlanning(activeReviewTab);
  const loadReviewBuilders = shouldLoadProposalReviewBuilders(activeReviewTab);
  const collabToken = useMemo(
    () =>
      typeof window === "undefined"
        ? null
        : new URLSearchParams(window.location.search).get("collab"),
    []
  );
  const [collabJoinState, setCollabJoinState] = useState<
    "idle" | "joined" | "joining"
  >(collabToken ? "joining" : "joined");

  useEffect(() => {
    if (!(collabToken && collabJoinState === "joining")) {
      return;
    }
    void joinSession({ shareToken: collabToken, workosOrganizationId })
      .then(() => {
        setCollabJoinState("joined");
        toast.success("Joined live collaboration.");
      })
      .catch((error) => {
        setCollabJoinState("idle");
        toast.error(
          error instanceof Error
            ? error.message
            : "Unable to join live collaboration."
        );
      });
  }, [collabJoinState, collabToken, joinSession, workosOrganizationId]);

  const productionDetailQuery = useQuery(
    api.production_proposals.getProposalDetailByString,
    visualFixtureEnabled || collabJoinState === "joining"
      ? "skip"
      : { proposalId: planId, workosOrganizationId }
  );
  const productionDetail = visualFixtureEnabled
    ? { ...visualProposalDetail, costItems: visualCostItems }
    : productionDetailQuery;
  const productionWorkspaceQuery = useQuery(
    api.production_proposals.getProductionTimelineWorkspace,
    visualFixtureEnabled || !productionDetail
      ? "skip"
      : {
          proposalId: planId as Id<"buildProposals">,
          workosOrganizationId,
        }
  );
  const productionContractorPlanningQuery = useQuery(
    (api as any).production_proposals.getProposalContractorPlanning,
    visualFixtureEnabled || !productionDetail || !loadContractorPlanning
      ? "skip"
      : {
          proposalId: planId as Id<"buildProposals">,
          workosOrganizationId,
        }
  );
  const productionWorkspace = visualFixtureEnabled
    ? getVisualParityTimelineWorkspace(planId)
    : productionWorkspaceQuery
      ? {
          ...productionWorkspaceQuery,
          contractorPlanning: productionContractorPlanningQuery ?? undefined,
        }
      : productionWorkspaceQuery;
  const productionCalendarWorkspaceQuery = useQuery(
    (api as any).production_proposals.getProposalCalendarWorkspace,
    visualFixtureEnabled || !productionDetail || !loadCalendarWorkspace
      ? "skip"
      : {
          proposalId: planId as Id<"buildProposals">,
          workosOrganizationId,
        }
  );
  const calendarAssignableParticipantsQuery = useQuery(
    (api as any).production_proposals
      .listProposalCalendarAssignableParticipants,
    visualFixtureEnabled || !productionDetail || !loadCalendarWorkspace
      ? "skip"
      : {
          proposalId: planId as Id<"buildProposals">,
          workosOrganizationId,
        }
  );
  const buildersQuery = useQuery(
    api.production_proposals.listBrokerageBuilders,
    visualFixtureEnabled || !productionDetail || !loadReviewBuilders
      ? "skip"
      : { workosOrganizationId }
  );
  const assignableBrokersQuery = useQuery(
    api.builderRoster.listAssignableBrokers,
    visualFixtureEnabled ||
      !productionDetail ||
      !loadReviewBuilders ||
      !canManageBrokerAssignment
      ? "skip"
      : {}
  );
  const requestProductionChanges = useMutation(
    api.production_proposals.requestChanges
  );
  const assignProposalBuilder = useMutation(
    api.production_proposals.assignProposalBuilder
  );
  const assignProposalBroker = useMutation(
    api.production_proposals.assignProposalBroker
  );
  const unassignDraftBuilder = useMutation(
    api.production_proposals.unassignDraftBuilder
  );
  const createDraftProposalClaimLink = useMutation(
    api.production_proposals.createDraftProposalClaimLink
  );
  const rejectProductionProposal = useMutation(
    api.production_proposals.rejectProposal
  );
  const approveProductionProposal = useMutation(
    api.production_proposals.approveProposal
  );
  const recordProductionClosing = useMutation(
    api.production_proposals.recordOfflineClosing
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
  const updateProductionTimelineDraw = useMutation(
    api.production_proposals.updateProductionTimelineDraw
  );
  const createProductionTimelineMilestone = useMutation(
    api.production_proposals.createProductionTimelineMilestone
  );
  const updateProductionTimelineMilestone = useMutation(
    api.production_proposals.updateProductionTimelineMilestone
  );
  const updateProductionProposalApprovedAmount = useMutation(
    api.production_proposals.updateProductionProposalApprovedAmount
  );
  const updateProductionProposalInterestRate = useMutation(
    api.production_proposals.updateProductionProposalInterestRate
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

  if (collabJoinState === "joining") {
    return (
      <div className="grid min-h-[24rem] place-items-center">
        <div className="flex items-center gap-2 rounded-lg border bg-background p-4 text-sm">
          <Loader2 className="size-4 animate-spin" />
          Joining live collaboration...
        </div>
      </div>
    );
  }

  //ToDo: BIG CODESMELL
  if (productionDetail && productionWorkspace) {
    const proposalId = planId as Id<"buildProposals">;
    const appPermissions = productionDetail.appPermissions;
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
                proposalId,
                workosOrganizationId,
              }).then(() => toast.success("Cost item added.")),
            delete: (item, reason) =>
              deleteProposalCostItem({
                itemId: item._id as any,
                proposalId,
                reason,
                workosOrganizationId,
              }).then(() => toast.success("Cost item removed.")),
            update: (item, payload) =>
              updateProposalCostItem({
                ...payload,
                itemId: item._id as any,
                proposalId,
                workosOrganizationId,
              }).then(() => toast.success("Cost item updated.")),
          }
    );
    const canMutateContractors = hasAnyAppPermission(appPermissions, [
      ["contractor", "create"],
      ["contractor", "update"],
    ]);
    const canViewContractors = canUseAppPermission(
      appPermissions,
      "contractor",
      "view"
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
              proposalId,
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
              proposalId,
              workosOrganizationId,
            }).then(() => toast.success("Review target date set."))
        : undefined,
      reviseDrawTiming: canUseAppPermission(appPermissions, "draw", "update")
        ? (input) =>
            reviseProposalDrawTiming({
              ...input,
              proposalId,
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
              proposalId,
              workosOrganizationId,
            }).then(() => toast.success("Milestone schedule revised."))
        : undefined,
    };
    const commitCalendarEdit = createProposalCalendarEditHandler({
      actions: calendarAdapterActions,
      baseDate: productionDetail.activeBuild?.startDate ?? "2026-06-01",
    });
    return (
      <ProductionProposalReviewSurface
        assignableBrokerages={assignableBrokersQuery?.brokerages ?? []}
        brokerOptionsPending={
          canManageBrokerAssignment && assignableBrokersQuery === undefined
        }
        builders={buildersQuery ?? []}
        calendarAdapterActions={calendarAdapterActions}
        calendarAssignableParticipants={
          calendarAssignableParticipantsQuery ?? []
        }
        calendarTimeframe={search.timeframe}
        calendarWorkspace={productionCalendarWorkspaceQuery as any}
        contractors={
          canViewContractors ? (
            activeReviewTab === "contractors" &&
            loadContractorPlanning &&
            productionContractorPlanningQuery === undefined ? (
              <DeferredProposalTabPanel label="Contractor planning" loading />
            ) : (
              <ProductionContractorPlanningTab
                canMutate={canMutateContractors}
                initialRole="lender"
                persistenceMode={visualFixtureEnabled ? "noop" : "convex"}
                proposalId={proposalId}
                workosOrganizationId={workosOrganizationId}
                workspace={productionWorkspace}
              />
            )
          ) : undefined
        }
        detail={productionDetail}
        gantt={
          <ProductionProposalTimelineGanttWorkspace
            persistenceMode={visualFixtureEnabled ? "noop" : "convex"}
            proposalId={proposalId}
            workosOrganizationId={workosOrganizationId}
            workspace={productionWorkspace}
          />
        }
        initialActiveTab={search.tab}
        materialPlanningActions={materialPlanningActions}
        milestones={
          <ProductionProposalMilestoneWorksheetContainer
            canMutateContractors={!visualFixtureEnabled}
            contractorPlanning={productionWorkspace.contractorPlanning}
            detail={productionDetail}
            materialPlanningActions={materialPlanningActions}
            persistenceMode={proposalEditorPersistenceMode}
            proposalId={proposalId}
            scopeRoute="backoffice-proposal"
            showHeading
            templateTitle={productionDetail.proposal.buildName}
            workosOrganizationId={workosOrganizationId}
          />
        }
        onApprove={(reason, permitWaiverReason) =>
          approveProductionProposal({
            permitWaiverReason,
            proposalId,
            reason,
            workosOrganizationId,
          }).then(() =>
            toast.success("Proposal approved.", {
              description:
                "The proposal is ready for closing. Live build controls stay locked until closing is recorded.",
            })
          )
        }
        onAssignBroker={
          canManageBrokerAssignment
            ? (assignedBrokerWorkosUserId, reason) =>
                assignProposalBroker({
                  assignedBrokerWorkosUserId,
                  proposalId,
                  reason,
                  workosOrganizationId,
                })
            : undefined
        }
        onAssignBuilder={(builderProfileId) =>
          assignProposalBuilder({
            builderProfileId: builderProfileId as Id<"builderProfiles">,
            proposalId,
            workosOrganizationId,
          })
        }
        onChangeCalendarTimeframe={(timeframe) =>
          void navigate({
            params: { planId },
            replace: true,
            search: { ...search, timeframe },
            to: "/backoffice/proposals/$planId",
          })
        }
        onChangeReviewTab={(tab) =>
          void navigate({
            params: { planId },
            replace: true,
            search: { ...search, tab },
            to: "/backoffice/proposals/$planId",
          })
        }
        onClose={(buildStartDate, reason, ianaTimezone) =>
          recordProductionClosing({
            buildStartDate,
            ianaTimezone,
            loanFacility: {
              interestAnnualBps:
                productionDetail.proposal.interestAnnualBps ?? 925,
              principalCents:
                productionDetail.proposal.lenderDrawPolicyLimitCents,
            },
            proposalId,
            reason,
            workosOrganizationId,
          }).then((result) => {
            toast.success("Closing recorded.");
            void navigate({
              params: { buildId: result.buildId },
              to: "/backoffice/builds/$buildId",
            });
          })
        }
        onCommitCalendarEdit={commitCalendarEdit}
        onCreateCalendarReminderEvent={
          canUseAppPermission(appPermissions, "reminder", "create")
            ? (input) =>
                createProposalReminderCalendarEvent({
                  ...input,
                  proposalId,
                  workosOrganizationId,
                })
            : undefined
        }
        onCreateCalendarSyncSubscription={(input) =>
          createCalendarSyncSubscription({
            ...input,
            proposalId:
              input.surface === "proposal"
                ? (input.sourceId as Id<"buildProposals">)
                : undefined,
            workosOrganizationId,
          })
        }
        onCreateClaimLink={() =>
          createDraftProposalClaimLink({
            proposalId,
            workosOrganizationId,
          })
        }
        onCreatePacketMilestone={
          canUseAppPermission(appPermissions, "milestone", "create")
            ? (milestone) =>
                createProductionTimelineMilestone({
                  milestone,
                  proposalId,
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
                  proposalId,
                  workosOrganizationId,
                })
            : undefined
        }
        onOnboardBuilder={
          canOnboardBuilder
            ? () =>
                navigate({
                  search: { proposalId: planId },
                  to: "/backoffice/onboard-builder",
                })
            : undefined
        }
        onRecordExternalCalendarSyncChange={(input) =>
          recordExternalCalendarSyncChange({
            ...input,
            workosOrganizationId,
          })
        }
        onReject={(reason) =>
          rejectProductionProposal({
            proposalId,
            reason,
            workosOrganizationId,
          }).then(() => toast.success("Proposal rejected."))
        }
        onRequestChanges={(reason) =>
          requestProductionChanges({
            proposalId,
            reason,
            workosOrganizationId,
          }).then(() => toast.success("Changes requested."))
        }
        onSaveCalendarView={(input) =>
          saveCalendarView({
            ...input,
            surface: "proposal",
            workosOrganizationId,
          })
        }
        onUnassignBuilder={() =>
          unassignDraftBuilder({
            proposalId,
            workosOrganizationId,
          })
        }
        onUpdateApprovedAmount={(approvedAmountCents) =>
          updateProductionProposalApprovedAmount({
            approvedAmountCents,
            proposalId,
            workosOrganizationId,
          })
        }
        onUpdateCalendarReminderEvent={
          canUseAppPermission(appPermissions, "reminder", "update")
            ? (input) =>
                updateProposalReminderCalendarEvent({
                  ...input,
                  eventId: input.eventId as Id<"calendarReminderEvents">,
                  proposalId,
                  workosOrganizationId,
                })
            : undefined
        }
        onUpdateDraw={
          canUseAppPermission(appPermissions, "draw", "update")
            ? (drawKey, patch) =>
                (productionDetail.proposal.status === "draft"
                  ? updateProductionTimelineDraw({
                      amountCents: patch.amountCents,
                      drawKey,
                      label: patch.label,
                      proposalId,
                      workosOrganizationId,
                      x: patch.timingDay,
                    })
                  : updateProductionDrawScheduleRow({
                      amountCents: patch.amountCents,
                      drawKey,
                      label: patch.label,
                      proposalId,
                      reason: patch.reason,
                      timingDay: patch.timingDay,
                      workosOrganizationId,
                    })
                ).then(() => toast.success("Draw schedule updated."))
            : undefined
        }
        onUpdateInterestRate={(interestAnnualBps) =>
          updateProductionProposalInterestRate({
            interestAnnualBps,
            proposalId,
            workosOrganizationId,
          })
        }
        onUpdatePacketMilestone={
          canUseAppPermission(appPermissions, "milestone", "update")
            ? (milestoneKey, patch) =>
                updateProductionTimelineMilestone({
                  ...patch,
                  milestoneKey,
                  proposalId,
                  workosOrganizationId,
                }).then(() => toast.success("Milestone updated."))
            : undefined
        }
        onUpdateProposedStartDate={
          canUseAppPermission(appPermissions, "milestone", "update")
            ? (proposedStartDate) =>
                updateProductionProposalProposedStartDate({
                  proposalId,
                  proposedStartDate,
                  workosOrganizationId,
                })
            : undefined
        }
        onUploadPermitDocument={
          canUploadProposalDocuments
            ? async (file) => {
                const uploadUrl = await generateProposalDocumentUploadUrl({
                  proposalId,
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
                  proposalId,
                  sizeBytes: file.size,
                  storageId: storageId as Id<"_storage">,
                  workosOrganizationId,
                });
              }
            : undefined
        }
        staff={
          visualFixtureEnabled ? undefined : shouldMountProposalStaffPanel(
              activeReviewTab
            ) ? (
            <BuilderStaffPermissionsPanel
              proposalId={proposalId}
              scope="proposal"
              workosOrganizationId={workosOrganizationId}
            />
          ) : (
            <DeferredProposalTabPanel label="Staff permissions" />
          )
        }
        timeline={
          <ProductionTimelineWorkspace
            appPermissions={appPermissions}
            backofficeHref={`/backoffice/proposals/${planId}`}
            embedded
            initialRole="lender"
            lockedBannerActions={
              productionDetail.proposal.status === "submitted" ? (
                <ProposalTimelineReviewBannerActions
                  hasPermitOrWaiver={Boolean(
                    productionDetail.permitWaiver ||
                      productionDetail.documents?.some(
                        (document: { documentType?: string }) =>
                          document.documentType === "permit"
                      )
                  )}
                  onApprove={(reason, permitWaiverReason) =>
                    approveProductionProposal({
                      permitWaiverReason,
                      proposalId,
                      reason,
                      workosOrganizationId,
                    }).then(() =>
                      toast.success("Proposal approved.", {
                        description:
                          "The proposal is ready for closing. Live build controls stay locked until closing is recorded.",
                      })
                    )
                  }
                  onReject={(reason) =>
                    rejectProductionProposal({
                      proposalId,
                      reason,
                      workosOrganizationId,
                    }).then(() => toast.success("Proposal rejected."))
                  }
                  onRequestChanges={(reason) =>
                    requestProductionChanges({
                      proposalId,
                      reason,
                      workosOrganizationId,
                    }).then(() => toast.success("Changes requested."))
                  }
                />
              ) : undefined
            }
            persistenceMode={visualFixtureEnabled ? "noop" : "convex"}
            prejoinedCollabToken={
              collabJoinState === "joined" ? collabToken : null
            }
            proposalHref={`/builder/proposals/${planId}`}
            proposalId={proposalId}
            workosOrganizationId={workosOrganizationId}
            workspace={productionWorkspace}
          />
        }
      />
    );
  }

  if (
    productionDetail === undefined ||
    (productionDetail && productionWorkspace === undefined)
  ) {
    return (
      <main className="grid min-h-[calc(100vh-4rem)] place-items-center bg-muted/30">
        <div className="flex items-center gap-2 rounded-lg border bg-background p-4 text-sm">
          <Loader2 className="size-4 animate-spin" />
          Loading production proposal...
        </div>
      </main>
    );
  }

  return <ProductionProposalNotFound planId={planId} />;
}

function ProposalTimelineReviewBannerActions({
  hasPermitOrWaiver,
  onApprove,
  onReject,
  onRequestChanges,
}: {
  hasPermitOrWaiver: boolean;
  onApprove: (
    reason: string,
    permitWaiverReason?: string
  ) => Promise<unknown> | unknown;
  onReject: (reason: string) => Promise<unknown> | unknown;
  onRequestChanges: (reason: string) => Promise<unknown> | unknown;
}) {
  const [reason, setReason] = useState("");
  const [permitWaiverReason, setPermitWaiverReason] = useState("");
  const [pendingDecision, setPendingDecision] = useState<
    "approve" | "reject" | "requestChanges" | null
  >(null);
  const reviewReason = reason.trim();
  const waiverReason = permitWaiverReason.trim();

  async function runDecision(
    decision: "approve" | "reject" | "requestChanges"
  ) {
    if (!reviewReason) {
      toast.error("Decision reason required.", {
        description:
          "Add the audit reason before requesting changes, rejecting, or approving.",
      });
      return;
    }
    if (decision === "approve" && !hasPermitOrWaiver && !waiverReason) {
      toast.error("Permit waiver reason required.", {
        description:
          "No permit PDF is linked, so approval needs a recorded waiver reason.",
      });
      return;
    }

    setPendingDecision(decision);
    try {
      if (decision === "approve") {
        await onApprove(reviewReason, waiverReason || undefined);
      } else if (decision === "reject") {
        await onReject(reviewReason);
      } else {
        await onRequestChanges(reviewReason);
      }
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Unable to update proposal review."
      );
    } finally {
      setPendingDecision(null);
    }
  }

  return (
    <div
      className="grid w-full min-w-0 gap-2 sm:min-w-96"
      data-testid="timeline-proposal-review-actions"
    >
      <div className="grid gap-1.5">
        <Label htmlFor="timeline-proposal-review-reason">Decision reason</Label>
        <Input
          id="timeline-proposal-review-reason"
          onChange={(event) => setReason(event.target.value)}
          placeholder="Required audit reason"
          value={reason}
        />
      </div>
      {hasPermitOrWaiver ? null : (
        <div className="grid gap-1.5">
          <Label htmlFor="timeline-proposal-permit-waiver">
            Permit waiver reason
          </Label>
          <Textarea
            id="timeline-proposal-permit-waiver"
            onChange={(event) => setPermitWaiverReason(event.target.value)}
            placeholder="Required before approving without a permit PDF"
            rows={2}
            value={permitWaiverReason}
          />
        </div>
      )}
      <div className="flex min-w-0 flex-wrap gap-2 sm:justify-end">
        <Button
          disabled={pendingDecision !== null}
          onClick={() => void runDecision("requestChanges")}
          size="sm"
          variant="outline"
        >
          {pendingDecision === "requestChanges"
            ? "Requesting..."
            : "Request Changes"}
        </Button>
        <Button
          disabled={pendingDecision !== null}
          onClick={() => void runDecision("reject")}
          size="sm"
          variant="destructive"
        >
          {pendingDecision === "reject" ? "Rejecting..." : "Reject"}
        </Button>
        <Button
          data-testid="timeline-approve-proposal"
          disabled={pendingDecision !== null}
          onClick={() => void runDecision("approve")}
          size="sm"
        >
          {pendingDecision === "approve" ? "Approving..." : "Approve Proposal"}
        </Button>
      </div>
    </div>
  );
}

function DeferredProposalTabPanel({
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

function ProductionProposalNotFound({ planId }: { planId: string }) {
  return (
    <main className="min-h-[calc(100vh-4rem)] bg-muted/30 p-4">
      <Frame className="mx-auto max-w-2xl">
        <FramePanel className="p-6">
          <Badge variant="outline">Production proposal</Badge>
          <h1 className="mt-3 font-semibold text-2xl tracking-tight">
            Proposal not found
          </h1>
          <p className="mt-2 text-muted-foreground text-sm">
            No production proposal exists for {planId}.
          </p>
          <div className="mt-5 flex flex-wrap gap-2">
            <Button render={<a href="/backoffice/proposals" />}>
              Back to proposals
            </Button>
          </div>
        </FramePanel>
      </Frame>
    </main>
  );
}

export function ProposalReviewSurface({
  approvePlan,
  navigateToBuild,
  planId,
  rejectPlan,
  updateDraw,
  updateMilestone,
  viewModel,
}: {
  approvePlan: (args: {
    adminNote?: string;
    planId: string;
    startDate: number;
  }) => Promise<{ buildKey?: string }>;
  navigateToBuild: (buildKey: string) => void;
  planId: string;
  rejectPlan: (args: {
    adminNote?: string;
    planId: string;
    reason?: string;
  }) => Promise<unknown>;
  updateDraw: (args: {
    amountCents?: number;
    drawKey: string;
    planId: string;
  }) => Promise<unknown>;
  updateMilestone: (args: {
    budgetCents?: number;
    dayEnd?: number;
    dayStart?: number;
    durationDays?: number;
    milestoneKey: string;
    planId: string;
  }) => Promise<unknown>;
  viewModel: any;
}) {
  const prefersReducedMotion = useReducedMotion();
  const [probeValue, setProbeValue] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState<TabKey>("timeline");
  const [startDate, setStartDate] = useState("");
  const [adminNote, setAdminNote] = useState("");
  const [rejectReason, setRejectReason] = useState("");
  const [decisionModal, setDecisionModal] = useState<DecisionModal | null>(
    null
  );
  const [isApproving, setIsApproving] = useState(false);
  const [isRejecting, setIsRejecting] = useState(false);
  const [terminalBuild, setTerminalBuild] = useState<{
    buildKey?: string;
  } | null>(null);

  const chartData = useMemo(() => buildReviewChartData(viewModel), [viewModel]);
  const timelineItems = useMemo(
    () => buildTimelineItems(viewModel),
    [viewModel]
  );
  const timelineMarkers = useMemo(
    () => buildProposalTimelineMarkers(viewModel),
    [viewModel]
  );
  const startingCash = centsToDollars(viewModel?.plan?.startingCashCents ?? 0);
  const timelineRange = useMemo(
    () => ({ max: chartData.maxDay + 10, min: 0, unit: "days" as const }),
    [chartData.maxDay]
  );
  const xDomain = useMemo(
    () => [timelineRange.min, timelineRange.max] as [number, number],
    [timelineRange.max, timelineRange.min]
  );
  const probeReferenceLines = useMemo(
    () =>
      buildProposalProbeReferenceLines(
        probeValue,
        chartData.cashflow,
        chartData.drawAvailability,
        startingCash
      ),
    [chartData.cashflow, chartData.drawAvailability, probeValue, startingCash]
  );
  const snapshotMilestones = viewModel?.snapshot?.milestones ?? [];
  const workingMilestones = viewModel?.workingCopy?.milestones ?? [];
  const snapshotDraws = viewModel?.snapshot?.draws ?? [];
  const workingDraws = viewModel?.workingCopy?.draws ?? [];
  const plan = viewModel?.plan;
  const canEditTimeline = plan?.status === "submitted";
  const approvalValidation = useMemo(
    () => validateApprovalStartDate(startDate, plan?.status),
    [plan?.status, startDate]
  );
  const canAttemptApproval = plan?.status === "submitted" && !terminalBuild;

  const openApproveModal = useCallback(() => {
    setStartDate(
      (current) => current || getDefaultApprovalStartDateInput(plan)
    );
    setDecisionModal("approve");
  }, [plan]);

  const openRejectModal = useCallback(() => {
    setDecisionModal("reject");
  }, []);

  const tabs = [
    ["timeline", "Timeline"],
    ...(plan?.status === "submitted" ? [["adjustments", "Adjustments"]] : []),
  ] as const;

  const handleMilestoneUpdate = useCallback(
    (milestoneKey: string, patch: MilestoneCardUpdate) => {
      if (!canEditTimeline) {
        return;
      }

      const milestone = workingMilestones.find(
        (row: ProposalReviewMilestone) => row.milestoneKey === milestoneKey
      );
      if (!milestone) {
        return;
      }

      const mutationArgs = buildProposalMilestoneMutationArgs(
        milestone,
        milestoneKey,
        patch,
        planId
      );
      if (!mutationArgs) {
        return;
      }

      void updateMilestone(mutationArgs)
        .then(() => {
          toast.success("Milestone updated.");
        })
        .catch((error) => {
          toast.error(
            error instanceof Error ? error.message : "Milestone update failed."
          );
        });
    },
    [canEditTimeline, planId, updateMilestone, workingMilestones]
  );

  if (viewModel === undefined) {
    return (
      <main className="grid min-h-[calc(100vh-4rem)] place-items-center bg-muted/30">
        <div className="flex items-center gap-2 rounded-lg border bg-background p-4 text-sm">
          <Loader2 className="size-4 animate-spin" />
          Loading proposal review...
        </div>
      </main>
    );
  }

  const approve = async () => {
    if (!canAttemptApproval) {
      toast.error("This proposal is no longer awaiting approval.");
      return;
    }

    if (!approvalValidation.ok) {
      toast.error(approvalValidation.message);
      return;
    }

    setIsApproving(true);
    try {
      const result = await approvePlan({
        adminNote: adminNote || undefined,
        planId,
        startDate: approvalValidation.parsed,
      });
      setTerminalBuild({ buildKey: result.buildKey });
      setDecisionModal(null);
      toast.success("Proposal approved and promoted.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Approval failed.");
    } finally {
      setIsApproving(false);
    }
  };

  const reject = async () => {
    setIsRejecting(true);
    try {
      await rejectPlan({
        adminNote: adminNote || undefined,
        planId,
        reason: rejectReason || undefined,
      });
      setDecisionModal(null);
      toast.success("Proposal archived.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Archive failed.");
    } finally {
      setIsRejecting(false);
    }
  };

  const terminal = terminalBuild || plan?.status !== "submitted";

  return (
    <main className="min-h-[calc(100vh-4rem)] bg-muted/30 p-4">
      <div className="mx-auto flex max-w-7xl flex-col gap-4">
        <Frame>
          <FramePanel className="flex flex-col gap-3 p-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-muted-foreground text-xs uppercase tracking-wide">
                Proposal review · {plan?.ownerPersona ?? "builder"}
              </p>
              <h1 className="font-semibold text-2xl tracking-tight">
                {plan?.buildName ?? "Timeline proposal"}
              </h1>
              <p className="mt-1 text-muted-foreground text-sm">
                Frozen snapshot compared with lender working copy.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {terminalBuild?.buildKey ? (
                <Button
                  onClick={() => navigateToBuild(terminalBuild.buildKey ?? "")}
                >
                  <ExternalLink />
                  Open active build
                </Button>
              ) : null}
              <Button
                data-ixc-ref="UI-REJECT-BUTTON"
                disabled={Boolean(terminal)}
                onClick={openRejectModal}
                variant="destructive"
              >
                <XCircle />
                Reject / Archive
              </Button>
              <Button
                data-ixc-ref="UI-APPROVE-BUTTON"
                disabled={!canAttemptApproval}
                onClick={openApproveModal}
              >
                <CheckCircle2 />
                Approve
              </Button>
            </div>
          </FramePanel>
        </Frame>

        <Card>
          <CardHeader className="border-b p-4">
            <div
              aria-label="Proposal review sections"
              className="flex flex-wrap gap-2"
              data-ixc-ref="UI-REVIEW-TABS"
              data-testid="proposal-review-tabs"
              role="tablist"
            >
              {tabs.map(([key, label]) => (
                <Button
                  aria-selected={activeTab === key}
                  data-ixc-ref={`UI-REVIEW-TAB-${label.toUpperCase().replaceAll(" ", "-")}`}
                  key={key}
                  onClick={() => setActiveTab(key as TabKey)}
                  role="tab"
                  variant={activeTab === key ? "secondary" : "ghost"}
                >
                  {label}
                </Button>
              ))}
            </div>
          </CardHeader>
          <CardContent className="p-4" role="tabpanel">
            {activeTab === "timeline" ? (
              <div
                className="flex min-w-0 flex-col gap-8"
                data-testid="proposal-review-timeline-stack"
              >
                <section
                  aria-label="Cashflow"
                  className="min-w-0"
                  data-testid="proposal-review-cashflow-section"
                >
                  <TimelineCashflowCompoundChart
                    data={chartData.cashflow}
                    onProbeChange={setProbeValue}
                    referenceLines={probeReferenceLines.cashflow}
                    xDomain={xDomain}
                    xTicks={chartData.ticks}
                    yDomain={[0, chartData.maxValue]}
                  />
                </section>
                <section
                  aria-label="Construction timeline"
                  className="relative z-30 min-w-0 overflow-visible"
                  data-testid="proposal-review-timeline-section"
                >
                  <AnimatedCurvedTimeline<DemoMilestone>
                    cardWidth={PROPOSAL_REVIEW_TIMELINE_SIZING.cardWidth}
                    className="min-w-0"
                    endCardWidth={276}
                    formatValue={(value) => `Day ${Math.round(value)}`}
                    getItemEndValue={(item) =>
                      workingMilestones.find(
                        (row: ProposalReviewMilestone) =>
                          row.milestoneKey === item.id
                      )?.dayEnd ?? getMilestoneEndX(item)
                    }
                    hoverValue={probeValue}
                    items={timelineItems}
                    markerStackProximityPx={88}
                    markers={timelineMarkers}
                    minNodeSpacingPx={
                      PROPOSAL_REVIEW_TIMELINE_SIZING.minNodeSpacingPx
                    }
                    onHoverValueChange={setProbeValue}
                    paddingX={PROPOSAL_REVIEW_TIMELINE_SIZING.paddingX}
                    pixelsPerUnit={
                      PROPOSAL_REVIEW_TIMELINE_SIZING.pixelsPerUnit
                    }
                    range={timelineRange}
                    renderCard={(item, context) => (
                      <MilestoneCard
                        active={context.active}
                        complete={false}
                        item={item}
                        onUpdate={handleMilestoneUpdate}
                        readOnly={!canEditTimeline}
                        reducedMotion={Boolean(prefersReducedMotion)}
                      />
                    )}
                    renderEndNode={(item, context) => (
                      <TimelineEndNodeButton
                        active={context.active}
                        complete={false}
                        item={item}
                        onClick={() => context.activate()}
                        reducedMotion={Boolean(prefersReducedMotion)}
                        testIdPrefix="proposal-review-timeline"
                      />
                    )}
                    straightLine
                  />
                </section>
                <section
                  aria-label="Draw availability"
                  className="min-w-0"
                  data-testid="proposal-review-draw-availability-section"
                >
                  <TimelineDrawAvailabilityChart
                    data={chartData.drawAvailability}
                    formatMoney={formatCompactMoney}
                    formatTimelineDay={(value) => `Day ${Math.round(value)}`}
                    onProbeChange={setProbeValue}
                    referenceLines={probeReferenceLines.drawAvailability}
                    xDomain={xDomain}
                    xTicks={chartData.ticks}
                    yDomain={[0, chartData.maxValue]}
                  />
                </section>
              </div>
            ) : null}
            {activeTab === "adjustments" ? (
              <div className="grid gap-4 xl:grid-cols-2">
                <MilestoneAdjustmentsTable
                  milestones={workingMilestones}
                  onCommit={(milestoneKey, patch) => {
                    const milestone = workingMilestones.find(
                      (row: ProposalReviewMilestone) =>
                        row.milestoneKey === milestoneKey
                    );
                    if (!milestone) {
                      return;
                    }

                    const mutationArgs = buildProposalMilestoneMutationArgs(
                      milestone,
                      milestoneKey,
                      patch,
                      planId
                    );
                    if (!mutationArgs) {
                      return;
                    }

                    void updateMilestone(mutationArgs)
                      .then(() => {
                        toast.success("Milestone updated.");
                      })
                      .catch((error) => {
                        toast.error(
                          error instanceof Error
                            ? error.message
                            : "Milestone update failed."
                        );
                      });
                  }}
                  snapshotMilestones={snapshotMilestones}
                />
                <ComparisonTable
                  label="Draws"
                  rows={workingDraws.map((draw: any) => {
                    const frozen = snapshotDraws.find(
                      (row: any) => row.sourceTimelineDrawId === draw._id
                    );
                    return {
                      id: draw.drawKey,
                      name: draw.label,
                      snapshot: frozen?.amountCents,
                      working: draw.amountCents,
                      onCommit: (value: number) =>
                        updateDraw({
                          amountCents: value,
                          drawKey: draw.drawKey,
                          planId,
                        }),
                    };
                  })}
                />
              </div>
            ) : null}
          </CardContent>
        </Card>

        <ProposalDecisionDialog
          adminNote={adminNote}
          approvalValidation={approvalValidation}
          buildName={plan?.buildName ?? "Timeline proposal"}
          isApproving={isApproving}
          isRejecting={isRejecting}
          modal={decisionModal}
          onAdminNoteChange={setAdminNote}
          onApprove={() => void approve()}
          onOpenChange={(open) => {
            if (!open) {
              setDecisionModal(null);
            }
          }}
          onReject={() => void reject()}
          onRejectReasonChange={setRejectReason}
          onStartDateChange={setStartDate}
          rejectReason={rejectReason}
          startDate={startDate}
        />
      </div>
    </main>
  );
}

function ProposalDecisionDialog({
  adminNote,
  approvalValidation,
  buildName,
  isApproving,
  isRejecting,
  modal,
  onAdminNoteChange,
  onApprove,
  onOpenChange,
  onReject,
  onRejectReasonChange,
  onStartDateChange,
  rejectReason,
  startDate,
}: {
  adminNote: string;
  approvalValidation: ReturnType<typeof validateApprovalStartDate>;
  buildName: string;
  isApproving: boolean;
  isRejecting: boolean;
  modal: DecisionModal | null;
  onAdminNoteChange: (value: string) => void;
  onApprove: () => void;
  onOpenChange: (open: boolean) => void;
  onReject: () => void;
  onRejectReasonChange: (value: string) => void;
  onStartDateChange: (value: string) => void;
  rejectReason: string;
  startDate: string;
}) {
  const isApprove = modal === "approve";

  return (
    <Dialog onOpenChange={onOpenChange} open={modal !== null}>
      <DialogContent
        className="sm:max-w-md"
        data-testid={
          isApprove ? "proposal-approve-dialog" : "proposal-reject-dialog"
        }
      >
        <DialogHeader>
          <DialogTitle>
            {isApprove ? "Approve proposal" : "Reject / archive proposal"}
          </DialogTitle>
          <DialogDescription>
            {isApprove
              ? `Promote ${buildName} to an active build. Milestone and draw dates are anchored to the project start date you choose.`
              : `Archive ${buildName} and remove it from the submitted proposals queue.`}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 px-6 pb-2">
          {isApprove ? (
            <>
              <div className="grid gap-2">
                <Label htmlFor="proposal-approval-start-date">
                  Project start date
                </Label>
                <Input
                  data-ixc-ref="UI-START-DATE"
                  id="proposal-approval-start-date"
                  min={getDefaultApprovalStartDateInput({
                    status: "submitted",
                  })}
                  onChange={(event) =>
                    onStartDateChange(event.currentTarget.value)
                  }
                  type="date"
                  value={startDate}
                />
                <p className="text-muted-foreground text-xs">
                  Must be today or later (UTC). Defaults to today.
                </p>
                {!approvalValidation.ok && startDate ? (
                  <p className="text-destructive text-xs" role="alert">
                    {approvalValidation.message}
                  </p>
                ) : null}
              </div>
              <div className="grid gap-2">
                <Label htmlFor="proposal-approval-admin-note">
                  Admin note{" "}
                  <span className="font-normal text-muted-foreground">
                    (optional)
                  </span>
                </Label>
                <Textarea
                  data-ixc-ref="UI-ADMIN-NOTE"
                  id="proposal-approval-admin-note"
                  onChange={(event) =>
                    onAdminNoteChange(event.currentTarget.value)
                  }
                  placeholder="Note sent to the builder with approval"
                  rows={3}
                  value={adminNote}
                />
              </div>
            </>
          ) : (
            <>
              <div className="grid gap-2">
                <Label htmlFor="proposal-archive-reason">
                  Archive reason{" "}
                  <span className="font-normal text-muted-foreground">
                    (optional)
                  </span>
                </Label>
                <Textarea
                  id="proposal-archive-reason"
                  onChange={(event) =>
                    onRejectReasonChange(event.currentTarget.value)
                  }
                  placeholder="Why this proposal is being archived"
                  rows={3}
                  value={rejectReason}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="proposal-archive-admin-note">
                  Admin note{" "}
                  <span className="font-normal text-muted-foreground">
                    (optional)
                  </span>
                </Label>
                <Textarea
                  id="proposal-archive-admin-note"
                  onChange={(event) =>
                    onAdminNoteChange(event.currentTarget.value)
                  }
                  placeholder="Internal note for the builder record"
                  rows={3}
                  value={adminNote}
                />
              </div>
            </>
          )}
        </div>

        <DialogFooter>
          <Button
            onClick={() => onOpenChange(false)}
            type="button"
            variant="outline"
          >
            Cancel
          </Button>
          {isApprove ? (
            <Button
              data-ixc-ref="UI-APPROVE-CONFIRM"
              data-testid="proposal-approve-confirm"
              disabled={!approvalValidation.ok || isApproving}
              onClick={onApprove}
            >
              {isApproving ? (
                <Loader2 className="animate-spin" />
              ) : (
                <CheckCircle2 />
              )}
              Confirm approval
            </Button>
          ) : (
            <Button
              data-ixc-ref="UI-REJECT-CONFIRM"
              data-testid="proposal-reject-confirm"
              disabled={isRejecting}
              onClick={onReject}
              variant="destructive"
            >
              {isRejecting ? <Loader2 className="animate-spin" /> : <XCircle />}
              Confirm archive
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function MilestoneAdjustmentsTable({
  milestones,
  onCommit,
  snapshotMilestones,
}: {
  milestones: ProposalReviewMilestone[];
  onCommit: (milestoneKey: string, patch: MilestoneCardUpdate) => void;
  snapshotMilestones: ProposalReviewSnapshotMilestone[];
}) {
  return (
    <Card className="xl:col-span-2">
      <CardHeader className="border-b p-4">
        <CardTitle className="text-base">Milestones</CardTitle>
      </CardHeader>
      <CardContent className="overflow-x-auto p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Snapshot</TableHead>
              <TableHead>Planned cost</TableHead>
              <TableHead>Start day</TableHead>
              <TableHead>Duration</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {milestones.map((milestone) => {
              const frozen = snapshotMilestones.find(
                (row) => row.sourceTimelineMilestoneId === milestone._id
              );
              const workingStart = milestone.x ?? milestone.dayStart;
              const snapshotCostDiff =
                frozen !== undefined &&
                frozen.budgetCents !== milestone.budgetCents;
              const snapshotStartDiff =
                frozen !== undefined && frozen.dayStart !== workingStart;
              const snapshotDurationDiff =
                frozen !== undefined &&
                frozen.durationDays !== milestone.durationDays;
              const hasDiff =
                snapshotCostDiff || snapshotStartDiff || snapshotDurationDiff;

              return (
                <TableRow
                  data-testid={`proposal-milestone-adjustment-${milestone.milestoneKey}`}
                  key={milestone.milestoneKey}
                >
                  <TableCell className="min-w-40 font-medium">
                    <div className="flex items-center gap-2">
                      <span>{milestone.name}</span>
                      {hasDiff ? (
                        <Badge
                          className="shrink-0"
                          data-ixc-ref="UI-DIFF-PILL"
                          variant="warning"
                        >
                          diff
                        </Badge>
                      ) : null}
                    </div>
                  </TableCell>
                  <TableCell className="min-w-44 text-muted-foreground text-sm">
                    {frozen ? (
                      <div className="grid gap-0.5">
                        <span>{formatCents(frozen.budgetCents)}</span>
                        <span>Day {frozen.dayStart}</span>
                        <span>{frozen.durationDays} days</span>
                      </div>
                    ) : (
                      "—"
                    )}
                  </TableCell>
                  <TableCell>
                    <AdjustmentNumberInput
                      ariaLabel={`Edit ${milestone.name} planned cost`}
                      diff={snapshotCostDiff}
                      onCommit={(value) =>
                        onCommit(milestone.milestoneKey, { amount: value })
                      }
                      testId={`proposal-adjust-cost-${milestone.milestoneKey}`}
                      value={Math.round(milestone.budgetCents / 100)}
                    />
                  </TableCell>
                  <TableCell>
                    <AdjustmentNumberInput
                      ariaLabel={`Edit ${milestone.name} start day`}
                      diff={snapshotStartDiff}
                      min={0}
                      onCommit={(value) =>
                        onCommit(milestone.milestoneKey, { x: value })
                      }
                      prefix="Day "
                      testId={`proposal-adjust-start-${milestone.milestoneKey}`}
                      value={workingStart}
                    />
                  </TableCell>
                  <TableCell>
                    <AdjustmentNumberInput
                      ariaLabel={`Edit ${milestone.name} duration`}
                      diff={snapshotDurationDiff}
                      min={1}
                      onCommit={(value) =>
                        onCommit(milestone.milestoneKey, {
                          durationDays: value,
                        })
                      }
                      suffix=" days"
                      testId={`proposal-adjust-duration-${milestone.milestoneKey}`}
                      value={milestone.durationDays}
                    />
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function AdjustmentNumberInput({
  ariaLabel,
  diff = false,
  min,
  onCommit,
  prefix,
  suffix,
  testId,
  value,
}: {
  ariaLabel: string;
  diff?: boolean;
  min?: number;
  onCommit: (value: number) => void;
  prefix?: string;
  suffix?: string;
  testId: string;
  value: number;
}) {
  return (
    <div className="flex items-center gap-2">
      {prefix ? (
        <span className="text-muted-foreground text-xs">{prefix}</span>
      ) : null}
      <Input
        aria-label={ariaLabel}
        className="max-w-28"
        data-testid={testId}
        defaultValue={value}
        key={`${testId}-${value}`}
        min={min}
        onBlur={(event) => {
          const nextValue = Math.round(Number(event.currentTarget.value));
          if (!Number.isFinite(nextValue)) {
            return;
          }
          if (min !== undefined && nextValue < min) {
            return;
          }
          if (nextValue !== value) {
            onCommit(nextValue);
          }
        }}
        step={1}
        type="number"
      />
      {suffix ? (
        <span className="text-muted-foreground text-xs">{suffix}</span>
      ) : null}
      {diff ? (
        <Badge
          className="shrink-0"
          data-ixc-ref="UI-DIFF-PILL"
          variant="warning"
        >
          diff
        </Badge>
      ) : null}
    </div>
  );
}

function ComparisonTable({
  label,
  rows,
}: {
  label: string;
  rows: {
    id: string;
    name: string;
    onCommit: (value: number) => Promise<unknown>;
    snapshot?: number;
    working: number;
  }[];
}) {
  return (
    <Card>
      <CardHeader className="border-b p-4">
        <CardTitle className="text-base">{label}</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Snapshot</TableHead>
              <TableHead>Working copy</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.id}>
                <TableCell>{row.name}</TableCell>
                <TableCell>{formatCents(row.snapshot ?? 0)}</TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <Input
                      aria-label={`Edit ${row.name}`}
                      className="max-w-36"
                      defaultValue={Math.round(row.working / 100)}
                      onBlur={(event) => {
                        const nextValue = Math.round(
                          Number(event.currentTarget.value) * 100
                        );
                        if (Number.isFinite(nextValue)) {
                          void row.onCommit(nextValue);
                        }
                      }}
                      type="number"
                    />
                    {row.snapshot === row.working ? null : (
                      <Badge
                        className={cn("shrink-0")}
                        data-ixc-ref="UI-DIFF-PILL"
                        variant="warning"
                      >
                        diff
                      </Badge>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

export function buildProposalMilestoneMutationArgs(
  milestone: ProposalReviewMilestone,
  milestoneKey: string,
  patch: MilestoneCardUpdate,
  planId: string
) {
  const mutationArgs: {
    budgetCents?: number;
    dayEnd?: number;
    dayStart?: number;
    durationDays?: number;
    milestoneKey: string;
    planId: string;
  } = {
    milestoneKey,
    planId,
  };

  if (patch.amount !== undefined) {
    mutationArgs.budgetCents = dollarsToCents(patch.amount);
  }

  const nextDayStart =
    patch.x === undefined
      ? Math.round(milestone.x ?? milestone.dayStart)
      : Math.round(patch.x);

  if (patch.x !== undefined) {
    mutationArgs.dayStart = nextDayStart;
  }

  if (patch.durationDays !== undefined) {
    mutationArgs.durationDays = Math.max(1, Math.round(patch.durationDays));
    mutationArgs.dayEnd = nextDayStart + mutationArgs.durationDays;
  }

  if (
    mutationArgs.budgetCents === undefined &&
    mutationArgs.dayStart === undefined &&
    mutationArgs.durationDays === undefined
  ) {
    return null;
  }

  return mutationArgs;
}

export function buildProposalTimelineMarkers(viewModel: any): TimelineMarker[] {
  const draws = viewModel?.workingCopy?.draws ?? [];
  const capitalEvents = viewModel?.workingCopy?.capitalEvents ?? [];

  return [
    ...draws.map((draw: ProposalReviewDraw) => ({
      id: `draw-${draw.drawKey}`,
      label: draw.label,
      sublabel: `${formatProbeMoney(centsToDollars(draw.amountCents))} · Day ${Math.round(draw.x)}`,
      tone: "accent" as const,
      x: draw.x,
    })),
    ...capitalEvents
      .filter(
        (event: ProposalReviewCapitalEvent) =>
          !isInitialBorrowerCapitalEvent(event.label)
      )
      .map((event: ProposalReviewCapitalEvent) => ({
        id: `capital-spike-${event.capitalEventKey}`,
        label: event.label,
        sublabel: `${formatProbeMoney(centsToDollars(event.amountCents))} · Day ${Math.round(event.x)}`,
        tone:
          event.eventKind === "cashInfusion"
            ? ("today" as const)
            : ("warning" as const),
        x: event.x,
      })),
  ];
}

export function buildProposalTimelineItems(
  viewModel: any
): TimelineItem<DemoMilestone>[] {
  return (viewModel?.workingCopy?.milestones ?? []).map(
    (milestone: ProposalReviewMilestone) => ({
      data: {
        amount: centsToDollars(milestone.budgetCents),
        draw: milestone.drawKey ?? "Reimbursement draw",
        durationDays: milestone.durationDays,
        evidence: milestone.evidenceState,
        icon: milestone.icon,
        name: milestone.name,
        policy: milestone.policyState,
        status: proposalMilestoneStatusMap[milestone.status] ?? "upcoming",
        subMilestones: (milestone.submilestoneSnapshot ?? []).map(
          (row) => row.name
        ),
      },
      eyebrow: `Milestone ${milestone.order}`,
      id: milestone.milestoneKey,
      label: milestone.name,
      lane: milestone.lane,
      markerLabel: milestone.markerLabel ?? String(milestone.order),
      tone: milestone.tone,
      x: milestone.x ?? milestone.dayStart,
    })
  );
}

type ProposalReviewDraw = {
  amountCents: number;
  drawKey: string;
  label: string;
  x: number;
};

type ProposalReviewCapitalEvent = {
  amountCents: number;
  capitalEventKey: string;
  eventKind?: "cashInfusion" | "cost";
  label: string;
  x: number;
};

type ProposalReviewSnapshotMilestone = {
  budgetCents: number;
  dayStart: number;
  durationDays: number;
  sourceTimelineMilestoneId: string;
};

type ProposalReviewMilestone = {
  _id: string;
  budgetCents: number;
  dayEnd: number;
  dayStart: number;
  drawKey?: string;
  durationDays: number;
  evidenceState: string;
  icon: DemoMilestone["icon"];
  lane?: number;
  markerLabel?: string;
  milestoneKey: string;
  name: string;
  order: number;
  policyState: string;
  status: keyof typeof proposalMilestoneStatusMap;
  submilestoneSnapshot?: { name: string }[];
  tone?: TimelineItem<DemoMilestone>["tone"];
  x?: number;
};

function buildTimelineItems(viewModel: any): TimelineItem<DemoMilestone>[] {
  return buildProposalTimelineItems(viewModel);
}

export function buildReviewChartData(viewModel: any) {
  const milestones = viewModel?.workingCopy?.milestones ?? [];
  const draws = viewModel?.workingCopy?.draws ?? [];
  const capitalEvents = viewModel?.workingCopy?.capitalEvents ?? [];
  const startingCash = centsToDollars(viewModel?.plan?.startingCashCents ?? 0);
  const cashEvents = [
    ...milestones.map((row: any) => ({
      amount: centsToDollars(row.budgetCents),
      day: row.dayStart,
      drawCapacityUnlocked: centsToDollars(
        row.drawAvailabilityCents ?? row.budgetCents
      ),
      event: "milestone" as const,
      id: row.milestoneKey,
      name: row.name,
      sort: 1,
    })),
    ...capitalEvents
      .filter((row: any) => !isInitialBorrowerCapitalEvent(row.label))
      .map((row: any) => ({
        amount: centsToDollars(row.amountCents),
        day: row.x,
        event: "capitalSpike" as const,
        id: row.capitalEventKey,
        name: row.label,
        sort: 2,
      })),
    ...draws.map((row: any) => ({
      amount: centsToDollars(row.amountCents),
      day: row.x,
      event: "draw" as const,
      id: row.drawKey,
      name: row.label,
      sort: 3,
    })),
  ].sort((a, b) => a.day - b.day || a.sort - b.sort);
  let cashOnHand = startingCash;
  const cashflow: TimelineCashflowCompoundDatum[] = [
    {
      budget: 0,
      capitalSpikeAmount: 0,
      cashOnHand,
      day: 0,
      event: "start" as const,
      id: "starting-cash",
      name: "Initial cash on hand",
    },
  ];
  for (const event of cashEvents) {
    if (event.event === "draw") {
      cashOnHand += event.amount;
      cashflow.push({
        budget: 0,
        capitalSpikeAmount: 0,
        cashOnHand,
        day: event.day,
        event: "draw" as const,
        id: event.id,
        name: event.name,
      });
      continue;
    }
    cashOnHand -= event.amount;
    const reimbursableBudget =
      event.event === "milestone"
        ? Math.min(event.amount, event.drawCapacityUnlocked)
        : 0;
    cashflow.push({
      budget: event.event === "milestone" ? event.amount : 0,
      capitalSpikeAmount: event.event === "capitalSpike" ? event.amount : 0,
      cashOnHand,
      day: event.day,
      event: event.event,
      id: event.id,
      name: event.name,
      outOfPocketBudget:
        event.event === "milestone"
          ? Math.max(0, event.amount - reimbursableBudget)
          : 0,
      reimbursableBudget,
    });
  }
  let unlockedDraw = 0;
  let releasedDraw = 0;
  let previousAvailabilityDay = 0;
  let totalInterestAccrued = 0;
  const availabilityEvents = [
    ...milestones.map((row: any) => ({
      amount: centsToDollars(row.budgetCents),
      day: row.dayEnd,
      label: `${row.name} completion`,
      type: "unlock" as const,
    })),
    ...draws.map((row: any) => ({
      amount: centsToDollars(row.amountCents),
      day: row.x,
      label: row.label,
      type: "release" as const,
    })),
  ].sort((a, b) => a.day - b.day);
  const drawAvailability = availabilityEvents.map((event) => {
    totalInterestAccrued += calculateProposalDailyCompoundedInterest(
      releasedDraw + totalInterestAccrued,
      event.day - previousAvailabilityDay
    );
    previousAvailabilityDay = event.day;

    if (event.type === "unlock") {
      unlockedDraw += event.amount;
    } else {
      releasedDraw += event.amount;
    }
    return {
      additionalAvailableDraw: Math.max(0, unlockedDraw - releasedDraw),
      day: event.day,
      interestBearingDraw: releasedDraw,
      name: event.label,
      totalInterestAccrued,
      totalAvailableDraw: unlockedDraw,
    };
  });
  const maxDay = Math.max(
    30,
    ...milestones.map((row: any) => row.dayEnd),
    ...draws.map((row: any) => row.x),
    ...capitalEvents.map((row: any) => row.x)
  );
  const maxValue = Math.max(
    100_000,
    startingCash,
    ...cashflow.flatMap((row) => [
      Math.abs(row.cashOnHand),
      row.budget,
      row.capitalSpikeAmount,
    ]),
    ...drawAvailability.flatMap((row) => [
      row.additionalAvailableDraw,
      row.interestBearingDraw,
      row.totalAvailableDraw,
    ])
  );
  return {
    cashflow,
    drawAvailability,
    maxDay,
    maxValue,
    ticks: Array.from({ length: 6 }, (_, index) =>
      Math.round((maxDay / 5) * index)
    ),
  };
}

export function buildProposalProbeReferenceLines(
  probeValue: number | null,
  cashflow: TimelineCashflowCompoundDatum[],
  drawAvailability: TimelineDrawAvailabilityDatum[],
  startingCash: number
): {
  cashflow: TimelineCashflowReferenceLine[];
  drawAvailability: TimelineDrawAvailabilityReferenceLine[];
} {
  if (probeValue === null) {
    return { cashflow: [], drawAvailability: [] };
  }

  const probeCashOnHand = interpolateProposalCashOnHand(
    cashflow,
    probeValue,
    startingCash
  );
  const probeDrawAvailability = interpolateProposalDrawAvailability(
    drawAvailability,
    Math.round(probeValue)
  );

  return {
    cashflow: [
      {
        label: [
          `Day ${Math.round(probeValue)}`,
          `Cash on hand ${formatProbeMoney(probeCashOnHand)}`,
        ],
        opacity: 0.78,
        stroke: "oklch(0.62 0.22 25)",
        strokeDasharray: "4 3",
        x: probeValue,
      },
    ],
    drawAvailability: [
      {
        label: [
          `Delta ${formatProbeMoney(
            probeDrawAvailability.additionalAvailableDraw
          )}`,
          `Interest-bearing ${formatProbeMoney(
            probeDrawAvailability.interestBearingDraw
          )}`,
          `Total interest ${formatProbeMoney(
            probeDrawAvailability.totalInterestAccrued
          )}`,
        ],
        opacity: 0.82,
        stroke: "oklch(0.6 0.18 240)",
        strokeDasharray: "4 3",
        x: probeValue,
      },
    ],
  };
}

function interpolateProposalCashOnHand(
  data: TimelineCashflowCompoundDatum[],
  value: number,
  startingCash: number
) {
  if (data.length === 0) {
    return startingCash;
  }

  const sorted = [...data].sort(
    (a, b) => a.day - b.day || a.id.localeCompare(b.id)
  );
  let previous = sorted[0];

  if (!previous) {
    return startingCash;
  }

  if (value <= previous.day) {
    return previous.cashOnHand;
  }

  for (const point of sorted.slice(1)) {
    if (point.day < value) {
      previous = point;
      continue;
    }

    if (point.day === value || point.day === previous.day) {
      return point.cashOnHand;
    }

    const ratio = (value - previous.day) / (point.day - previous.day);

    return (
      previous.cashOnHand + (point.cashOnHand - previous.cashOnHand) * ratio
    );
  }

  return previous.cashOnHand;
}

function interpolateProposalDrawAvailability(
  data: TimelineDrawAvailabilityDatum[],
  value: number
) {
  const fallback: TimelineDrawAvailabilityDatum = {
    additionalAvailableDraw: 0,
    day: value,
    interestBearingDraw: 0,
    name: "No draw capacity",
    totalInterestAccrued: 0,
    totalAvailableDraw: 0,
  };

  if (data.length === 0) {
    return fallback;
  }

  let current = data[0] ?? fallback;

  for (const point of data) {
    if (point.day > value) {
      break;
    }

    current = point;
  }

  return {
    ...current,
    day: value,
    totalInterestAccrued:
      current.totalInterestAccrued +
      calculateProposalDailyCompoundedInterest(
        current.interestBearingDraw + current.totalInterestAccrued,
        Math.max(0, value - current.day)
      ),
  };
}

function calculateProposalDailyCompoundedInterest(
  principal: number,
  elapsedDays: number
) {
  if (principal <= 0 || elapsedDays <= 0) {
    return 0;
  }

  return (
    principal * ((1 + PROPOSAL_REVIEW_INTEREST_APR / 365) ** elapsedDays - 1)
  );
}

function formatProbeMoney(value: number) {
  return new Intl.NumberFormat("en-US", {
    currency: "USD",
    maximumFractionDigits: 0,
    style: "currency",
  }).format(value);
}

export function formatUtcDateInputValue(epochMs: number) {
  const date = new Date(epochMs);
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function getDefaultApprovalStartDateInput(plan?: {
  startDate?: number;
  status?: string;
}) {
  if (plan?.status !== "submitted") {
    return "";
  }

  const todayUtc = floorUtcMidnight(Date.now());
  if (plan.startDate !== undefined && plan.startDate >= todayUtc) {
    return formatUtcDateInputValue(plan.startDate);
  }

  return formatUtcDateInputValue(Date.now());
}

export function validateApprovalStartDate(
  startDate: string,
  status?: string
):
  | {
      message: string;
      ok: false;
      reason: "invalid_date" | "missing_date" | "not_submitted" | "past_date";
    }
  | { ok: true; parsed: number } {
  if (status !== "submitted") {
    return {
      message: "This proposal is no longer awaiting approval.",
      ok: false,
      reason: "not_submitted",
    };
  }

  if (!startDate.trim()) {
    return {
      message:
        "Choose an approval start date (today or later) in Admin decision before approving.",
      ok: false,
      reason: "missing_date",
    };
  }

  const parsed = Date.parse(`${startDate}T00:00:00.000Z`);
  if (!Number.isFinite(parsed)) {
    return {
      message: "Approval start date is invalid.",
      ok: false,
      reason: "invalid_date",
    };
  }

  if (parsed < floorUtcMidnight(Date.now())) {
    return {
      message: "Start date must be today or later (UTC).",
      ok: false,
      reason: "past_date",
    };
  }

  return { ok: true, parsed };
}

function floorUtcMidnight(epochMs: number) {
  const date = new Date(epochMs);
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

function formatCents(value: number) {
  return new Intl.NumberFormat("en-US", {
    currency: "USD",
    maximumFractionDigits: 0,
    style: "currency",
  }).format(value / 100);
}

function formatCompactMoney(value: number) {
  return new Intl.NumberFormat("en-US", {
    notation: "compact",
    style: "currency",
    currency: "USD",
  }).format(value);
}

function centsToDollars(value: number) {
  return Math.round(value / 100);
}

function dollarsToCents(value: number) {
  return Math.round(value * 100);
}

function isInitialBorrowerCapitalEvent(label: string) {
  return /^(borrower reserve|initial cash|cash on hand)$/i.test(label.trim());
}
