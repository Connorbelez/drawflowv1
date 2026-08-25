import { useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery } from "convex/react";
import { Loader2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { Frame, FramePanel } from "#/components/ui/frame.tsx";
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
import { ProductionContractorPlanningTab } from "#/features/production-proposals/ProductionContractorPlanningTab.tsx";
import { ProductionProposalTimelineGanttWorkspace } from "#/features/production-proposals/ProductionProposalGanttWorkspace.tsx";
import { ProductionProposalMilestoneWorksheetContainer } from "#/features/production-proposals/ProductionProposalMilestoneWorksheetContainer.tsx";
import {
  type ProductionProposalDetail,
  ProductionProposalReviewSurface,
} from "#/features/production-proposals/ProductionProposalSurfaces.tsx";
import { ProductionTimelineWorkspace } from "#/features/production-proposals/ProductionTimelineWorkspace.tsx";
import { ProposalReviewPolicyControl } from "#/features/production-proposals/ProposalReviewPolicyControl.tsx";
import type { ProductionProposalWorksheetDetail } from "#/features/production-proposals/productionMilestoneWorksheetAdapter.ts";
import {
  createVisualParityCostItem,
  getVisualParityProposalDetail,
  getVisualParityTimelineWorkspace,
  isProductionVisualParityFixtureEnabled,
} from "#/features/production-proposals/visualParityFixtures.ts";
import { getUserManagementAccessDecision } from "#/lib/auth/rbac.ts";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import type { BuildCollaborationRole } from "../../../convex/build_collaboration_model";
import {
  ProposalApprovalStatusSurface,
  type ProposalApprovalDetail,
} from "./-proposal-approval-status-surface.tsx";
import {
  BackofficeProposalLifecycleActions,
  DeferredProposalTabPanel,
  ProductionProposalNotFound,
  type ProposalReviewSearch,
  ProposalTimelineReviewBannerActions,
  resolveProposalReviewRouteTab,
  shouldLoadProposalCalendarWorkspace,
  shouldLoadProposalContractorPlanning,
  shouldLoadProposalReviewBuilders,
  shouldMountProposalStaffPanel,
} from "./-proposal-review-route-support.tsx";
import { resolveBackofficeBuildViewerCapacity } from "./builds/$buildId/-route-capacity.ts";

export type ProposalReviewRouteContext = {
  organizationId?: string | null;
  role?: string | null;
  roles?: string[];
  userId?: string | null;
};

export type ProposalReviewRouteContentProps = {
  context: ProposalReviewRouteContext;
  navigate: ReturnType<typeof useNavigate>;
  planId: string;
  search: ProposalReviewSearch;
};

export function ProposalReviewRouteContent({
  context,
  navigate,
  planId,
  search,
}: ProposalReviewRouteContentProps) {
  const workosOrganizationId = context.organizationId as string;
  const viewerCapacity = resolveBackofficeBuildViewerCapacity([
    context.role,
    ...(context.roles ?? []),
  ]) as BuildCollaborationRole | undefined;
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
  const [lenderAssignmentDialogOpen, setLenderAssignmentDialogOpen] =
    useState(false);
  const [
    proposalConfirmationHistoryLimit,
    setProposalConfirmationHistoryLimit,
  ] = useState(20);
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
  const proposalReviewControlQuery = useQuery(
    api.production_proposals.getProposalPhase3ReviewControl,
    visualFixtureEnabled ||
      !productionDetail ||
      !canManageBrokerAssignment ||
      (productionDetail.proposal.status !== "approved" &&
        productionDetail.proposal.status !== "closed")
      ? "skip"
      : {
          proposalId: planId as Id<"buildProposals">,
          workosOrganizationId,
        }
  );
  const proposalRemediationQuery = useQuery(
    api.production_proposals.getBackofficeProposalRemediation,
    visualFixtureEnabled ||
      !productionDetail ||
      !canManageBrokerAssignment ||
      productionDetail.proposal.status !== "approved"
      ? "skip"
      : {
          historyPaginationOpts: {
            cursor: null,
            numItems: proposalConfirmationHistoryLimit,
          },
          proposalId: planId as Id<"buildProposals">,
          workosOrganizationId,
        }
  );
  const lenderOrganizationsQuery = useQuery(
    api.production_proposals.listEligibleExternalLenderOrganizations,
    visualFixtureEnabled ||
      !lenderAssignmentDialogOpen ||
      !productionDetail ||
      !canManageBrokerAssignment ||
      productionDetail.proposal.status !== "approved"
      ? "skip"
      : {
          proposalId: planId as Id<"buildProposals">,
          workosOrganizationId,
        }
  );
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
  const submitProductionProposal = useMutation(
    api.production_proposals.submitProposal
  );
  const approveProductionProposal = useMutation(
    api.production_proposals.approveProposal
  );
  const assignExternalLender = useMutation(
    api.production_proposals.assignExternalLenderOrganization
  );
  const repairMissingLenderConfirmation = useMutation(
    api.production_proposals.repairMissingLenderProposalConfirmation
  );
  const configureProposalReviewPolicy = useMutation(
    api.production_proposals.configureProposalReviewPolicy
  );
  const publishProposalRevision = useMutation(
    api.production_proposals.publishProposalRevision
  );
  const lockProposalReviewPolicy = useMutation(
    api.production_proposals.lockProposalReviewPolicy
  );
  const withdrawExternalLender = useMutation(
    api.production_proposals.withdrawExternalLenderAssignment
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
    const reviewDetail = productionDetail as ProductionProposalDetail;
    const worksheetDetail = productionDetail as ProductionProposalWorksheetDetail;
    const closingPolicyReady = Boolean(
      proposalReviewControlQuery?.lockedReviewPolicyId
    );
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
        approvalStatusSurface={
          <ProposalApprovalStatusSurface
            assignExternalLender={assignExternalLender}
            canManageBrokerAssignment={canManageBrokerAssignment}
            lenderOrganizationsQuery={lenderOrganizationsQuery}
            navigate={navigate}
            planId={planId}
            productionDetail={productionDetail as ProposalApprovalDetail}
            proposalId={proposalId}
            proposalRemediationQuery={proposalRemediationQuery}
            publishProposalRevision={publishProposalRevision}
            repairMissingLenderConfirmation={repairMissingLenderConfirmation}
            search={search}
            setLenderAssignmentDialogOpen={setLenderAssignmentDialogOpen}
            setProposalConfirmationHistoryLimit={
              setProposalConfirmationHistoryLimit
            }
            visualFixtureEnabled={visualFixtureEnabled}
            withdrawExternalLender={withdrawExternalLender}
            workosOrganizationId={workosOrganizationId}
          />
        }
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
        closingPolicyReady={closingPolicyReady}
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
        detail={reviewDetail}
        gantt={
          <ProductionProposalTimelineGanttWorkspace
            persistenceMode={visualFixtureEnabled ? "noop" : "convex"}
            proposalId={proposalId}
            workosOrganizationId={workosOrganizationId}
            workspace={productionWorkspace}
          />
        }
        initialActiveTab={search.tab}
        lifecycleActions={
          <BackofficeProposalLifecycleActions
            activeBuildId={productionDetail.activeBuild?._id}
            closingPolicyReady={closingPolicyReady}
            onActivated={(buildId) =>
              navigate({
                params: { buildId },
                to: "/backoffice/builds/$buildId",
              })
            }
            proposal={{
              _id: String(proposalId),
              buildName: productionDetail.proposal.buildName,
              interestAnnualBps: productionDetail.proposal.interestAnnualBps,
              principalCents: reviewDetail.loanFacility?.principalCents,
              status: productionDetail.proposal.status,
            }}
            workosOrganizationId={workosOrganizationId}
          />
        }
        materialPlanningActions={materialPlanningActions}
        milestones={
          <ProductionProposalMilestoneWorksheetContainer
            canMutateContractors={!visualFixtureEnabled}
            contractorPlanning={productionWorkspace.contractorPlanning}
            detail={worksheetDetail}
            materialPlanningActions={materialPlanningActions}
            persistenceMode={proposalEditorPersistenceMode}
            proposalId={proposalId}
            scopeRoute="backoffice-proposal"
            showHeading
            templateTitle={productionDetail.proposal.buildName}
            viewerCapacity={viewerCapacity}
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
        onSubmit={
          visualFixtureEnabled
            ? async () => undefined
            : () =>
                submitProductionProposal({
                  proposalId: proposalId as Id<"buildProposals">,
                  workosOrganizationId,
                }).then(() =>
                  toast.success("Proposal submitted.", {
                    description: "The proposal is now ready for lender review.",
                  })
                )
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
        reviewPolicySurface={
          proposalReviewControlQuery ? (
            <ProposalReviewPolicyControl
              control={proposalReviewControlQuery}
              onConfigure={(command) =>
                configureProposalReviewPolicy({
                  ...command,
                  proposalId,
                  workosOrganizationId,
                })
              }
              onLock={(command) =>
                lockProposalReviewPolicy({
                  ...command,
                  proposalId,
                  workosOrganizationId,
                })
              }
              onPublish={(command) =>
                publishProposalRevision({
                  ...command,
                  proposalId,
                  workosOrganizationId,
                })
              }
              proposalId={proposalId}
              proposalStatus={productionDetail.proposal.status}
            />
          ) : !visualFixtureEnabled && canManageBrokerAssignment ? (
            <Frame>
              <FramePanel
                className="flex items-center gap-2 p-5 text-muted-foreground text-sm"
                role="status"
              >
                <Loader2 aria-hidden className="size-4 animate-spin" />
                Loading review policy controls...
              </FramePanel>
            </Frame>
          ) : undefined
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
