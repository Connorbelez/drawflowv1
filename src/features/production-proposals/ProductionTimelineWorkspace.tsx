import { useMutation } from "convex/react";
import { useMemo } from "react";

import {
  canUseAppPermission,
  hasAnyAppPermission,
  PROPOSAL_TIMELINE_EDIT_PERMISSION_CHECKS,
} from "#/features/builder-staff/app-permissions.ts";
import { convexWorkspaceToTimelineState } from "#/features/timeline-workspace/-timeline-convex-adapter.ts";
import {
  TimelineWorkspace,
  type TimelineWorkspacePersistence,
} from "#/features/timeline-workspace/index.tsx";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { useProductionProposalCollaboration } from "./ProductionTimelineWorkspaceCollaboration";
import {
  buildCollaborationTargetHref,
  normalizeEvidenceAssetInput,
  normalizeProductionMilestoneInput,
  normalizeProductionMilestonePatch,
  productionTimelineStatus,
} from "./ProductionTimelineWorkspaceNormalization";
import {
  noopTimelineWorkspacePersistence,
  type ProductionTimelineWorkspaceProps,
} from "./ProductionTimelineWorkspaceTypes";

// biome-ignore lint/performance/noBarrelFile: Preserve the established public ProductionTimelineWorkspace facade exports.
export {
  buildCollaborationShareUrl,
  buildCollaborationTargetHref,
  normalizeSubmilestoneInput,
} from "./ProductionTimelineWorkspaceNormalization";
export type { ProductionTimelineWorkspaceProps } from "./ProductionTimelineWorkspaceTypes";

export function ProductionTimelineWorkspace({
  appPermissions,
  backofficeHref,
  embedded = false,
  headerActions,
  initialRole = "builder",
  lockedBannerActions,
  persistenceMode = "convex",
  prejoinedCollabToken = null,
  proposalHref,
  proposalId,
  workspace,
  workosOrganizationId,
}: ProductionTimelineWorkspaceProps) {
  const submitProposal = useMutation(api.production_proposals.submitProposal);
  const updatePlanState = useMutation(
    api.production_proposals.updateProductionTimelinePlanState
  );
  const createMilestone = useMutation(
    api.production_proposals.createProductionTimelineMilestone
  );
  const updateMilestone = useMutation(
    api.production_proposals.updateProductionTimelineMilestone
  );
  const deleteMilestone = useMutation(
    api.production_proposals.deleteProductionTimelineMilestone
  );
  const createDraw = useMutation(
    api.production_proposals.createProductionTimelineDraw
  );
  const updateDraw = useMutation(
    api.production_proposals.updateProductionTimelineDraw
  );
  const deleteDraw = useMutation(
    api.production_proposals.deleteProductionTimelineDraw
  );
  const replaceDrawSchedule = useMutation(
    api.production_proposals.replaceProductionTimelineDrawSchedule
  );
  const createCapitalEvent = useMutation(
    api.production_proposals.createProductionTimelineCapitalEvent
  );
  const createCashInfusion = useMutation(
    api.production_proposals.createProductionTimelineCashInfusion
  );
  const updateCapitalEvent = useMutation(
    api.production_proposals.updateProductionTimelineCapitalEvent
  );
  const deleteCapitalEvent = useMutation(
    api.production_proposals.deleteProductionTimelineCapitalEvent
  );
  const generateEvidenceUploadUrl = useMutation(
    api.production_proposals.generateProductionEvidenceUploadUrl
  );
  const createEvidenceAsset = useMutation(
    api.production_proposals.createProductionTimelineEvidenceAsset
  );
  const updateEvidenceAsset = useMutation(
    api.production_proposals.updateProductionTimelineEvidenceAsset
  );
  const deleteEvidenceAsset = useMutation(
    api.production_proposals.deleteProductionTimelineEvidenceAsset
  );
  const requestModification = useMutation(
    api.production_proposals.requestProductionTimelineModification
  );
  const reviewModificationRequest = useMutation(
    api.production_proposals.reviewProductionTimelineModificationRequest
  );
  const collaboration = useProductionProposalCollaboration({
    enabled: persistenceMode === "convex",
    prejoinedShareToken: prejoinedCollabToken,
    proposalId,
    shareTargetHref: buildCollaborationTargetHref(
      initialRole === "lender" ? proposalHref : backofficeHref
    ),
    workosOrganizationId,
  });

  const initialState = useMemo(
    () => convexWorkspaceToTimelineState(workspace),
    [workspace]
  );
  const hasTimelineEditPermission = hasAnyAppPermission(
    appPermissions,
    PROPOSAL_TIMELINE_EDIT_PERMISSION_CHECKS
  );
  const collaborationCanEdit =
    collaboration.canEdit && hasTimelineEditPermission;
  const canCreateCapitalEvent = canUseAppPermission(
    appPermissions,
    "capitalEvent",
    "create"
  );
  const canUpdateCapitalEvent = canUseAppPermission(
    appPermissions,
    "capitalEvent",
    "update"
  );
  const canDeleteCapitalEvent = canUseAppPermission(
    appPermissions,
    "capitalEvent",
    "delete"
  );
  const canCreateDraw = canUseAppPermission(appPermissions, "draw", "create");
  const canUpdateDraw = canUseAppPermission(appPermissions, "draw", "update");
  const canDeleteDraw = canUseAppPermission(appPermissions, "draw", "delete");
  const canCreateEvidence = canUseAppPermission(
    appPermissions,
    "evidence",
    "create"
  );
  const canUpdateEvidence = canUseAppPermission(
    appPermissions,
    "evidence",
    "update"
  );
  const canDeleteEvidence = canUseAppPermission(
    appPermissions,
    "evidence",
    "delete"
  );
  const canCreateMilestone =
    canUseAppPermission(appPermissions, "milestone", "create") ||
    canUseAppPermission(appPermissions, "submilestone", "create");
  const canUpdateMilestone =
    canUseAppPermission(appPermissions, "milestone", "update") ||
    canUseAppPermission(appPermissions, "submilestone", "update");
  const canDeleteMilestone =
    canUseAppPermission(appPermissions, "milestone", "delete") ||
    canUseAppPermission(appPermissions, "submilestone", "delete");
  const durableStatus = productionTimelineStatus(workspace.proposal);
  const convexPersistence = useMemo<TimelineWorkspacePersistence>(
    () => ({
      createCapitalEvent: (input) =>
        collaborationCanEdit && canCreateCapitalEvent
          ? createCapitalEvent({
              ...input,
              proposalId,
              workosOrganizationId,
            })
          : Promise.reject(
              new Error("Collaboration participant is view-only.")
            ),
      createCashInfusion: (input) =>
        collaborationCanEdit && canCreateCapitalEvent
          ? createCashInfusion({
              ...input,
              proposalId,
              workosOrganizationId,
            })
          : Promise.reject(
              new Error("Collaboration participant is view-only.")
            ),
      createDraw: (input) =>
        collaborationCanEdit && canCreateDraw
          ? createDraw({
              ...input,
              proposalId,
              workosOrganizationId,
            })
          : Promise.reject(
              new Error("Collaboration participant is view-only.")
            ),
      createEvidenceAsset: (input) =>
        collaborationCanEdit && canCreateEvidence
          ? createEvidenceAsset({
              ...input,
              asset: normalizeEvidenceAssetInput(input.asset),
              proposalId,
              workosOrganizationId,
            })
          : Promise.reject(
              new Error("Collaboration participant is view-only.")
            ),
      createMilestone: (input) =>
        collaborationCanEdit && canCreateMilestone
          ? createMilestone({
              milestone: normalizeProductionMilestoneInput(input.milestone),
              proposalId,
              workosOrganizationId,
            })
          : Promise.reject(
              new Error("Collaboration participant is view-only.")
            ),
      deleteCapitalEvent: (input) =>
        collaborationCanEdit && canDeleteCapitalEvent
          ? deleteCapitalEvent({
              ...input,
              proposalId,
              workosOrganizationId,
            })
          : Promise.reject(
              new Error("Collaboration participant is view-only.")
            ),
      deleteDraw: (input) =>
        collaborationCanEdit && canDeleteDraw
          ? deleteDraw({
              ...input,
              proposalId,
              workosOrganizationId,
            })
          : Promise.reject(
              new Error("Collaboration participant is view-only.")
            ),
      deleteEvidenceAsset: (input) =>
        collaborationCanEdit && canDeleteEvidence
          ? deleteEvidenceAsset({
              ...input,
              proposalId,
              workosOrganizationId,
            })
          : Promise.reject(
              new Error("Collaboration participant is view-only.")
            ),
      deleteMilestone: (input) =>
        collaborationCanEdit && canDeleteMilestone
          ? deleteMilestone({
              ...input,
              proposalId,
              workosOrganizationId,
            })
          : Promise.reject(
              new Error("Collaboration participant is view-only.")
            ),
      generateEvidenceUploadUrl: () =>
        collaborationCanEdit && canCreateEvidence
          ? generateEvidenceUploadUrl({
              proposalId,
              workosOrganizationId,
            })
          : Promise.reject(
              new Error("Collaboration participant is view-only.")
            ),
      requestModification: (input) =>
        collaborationCanEdit
          ? requestModification({
              ...input,
              proposalId,
              workosOrganizationId,
            })
          : Promise.reject(
              new Error("Collaboration participant is view-only.")
            ),
      reviewModificationRequest: (input) =>
        collaborationCanEdit
          ? reviewModificationRequest({
              ...input,
              requestId:
                input.requestId as Id<"proposalTimelineModificationRequests">,
              workosOrganizationId,
            })
          : Promise.reject(
              new Error("Collaboration participant is view-only.")
            ),
      replaceDrawSchedule: (input) =>
        collaborationCanEdit && canCreateDraw && canDeleteDraw
          ? replaceDrawSchedule({
              ...input,
              proposalId,
              workosOrganizationId,
            })
          : Promise.reject(
              new Error("Collaboration participant is view-only.")
            ),
      submitPlan: () =>
        collaborationCanEdit
          ? submitProposal({
              proposalId,
              workosOrganizationId,
            })
          : Promise.reject(
              new Error("Collaboration participant is view-only.")
            ),
      updateCapitalEvent: (input) =>
        collaborationCanEdit && canUpdateCapitalEvent
          ? updateCapitalEvent({
              ...input,
              proposalId,
              workosOrganizationId,
            })
          : Promise.reject(
              new Error("Collaboration participant is view-only.")
            ),
      updateDraw: (input) =>
        collaborationCanEdit && canUpdateDraw
          ? updateDraw({
              ...input,
              proposalId,
              workosOrganizationId,
            })
          : Promise.reject(
              new Error("Collaboration participant is view-only.")
            ),
      updateEvidenceAsset: (input) =>
        collaborationCanEdit && canUpdateEvidence
          ? updateEvidenceAsset({
              ...input,
              proposalId,
              workosOrganizationId,
            })
          : Promise.reject(
              new Error("Collaboration participant is view-only.")
            ),
      updateMilestone: (input) =>
        collaborationCanEdit && canUpdateMilestone
          ? updateMilestone({
              ...normalizeProductionMilestonePatch(input),
              proposalId,
              workosOrganizationId,
            })
          : Promise.reject(
              new Error("Collaboration participant is view-only.")
            ),
      updatePlanState: (input) =>
        collaborationCanEdit
          ? updatePlanState({
              ...input,
              proposalId,
              workosOrganizationId,
            })
          : Promise.reject(
              new Error("Collaboration participant is view-only.")
            ),
    }),
    [
      canCreateCapitalEvent,
      canCreateDraw,
      canCreateEvidence,
      canCreateMilestone,
      canDeleteCapitalEvent,
      canDeleteDraw,
      canDeleteEvidence,
      canDeleteMilestone,
      canUpdateCapitalEvent,
      canUpdateDraw,
      canUpdateEvidence,
      canUpdateMilestone,
      collaborationCanEdit,
      createCapitalEvent,
      createCashInfusion,
      createDraw,
      createEvidenceAsset,
      createMilestone,
      deleteCapitalEvent,
      deleteDraw,
      deleteEvidenceAsset,
      deleteMilestone,
      generateEvidenceUploadUrl,
      proposalId,
      requestModification,
      reviewModificationRequest,
      submitProposal,
      updateCapitalEvent,
      updateDraw,
      updateEvidenceAsset,
      updateMilestone,
      updatePlanState,
      replaceDrawSchedule,
      workosOrganizationId,
    ]
  );

  const persistence =
    persistenceMode === "noop"
      ? noopTimelineWorkspacePersistence
      : convexPersistence;

  return (
    <TimelineWorkspace
      allowRoleSwitching={false}
      collaboration={{
        cursors: collaboration.cursors,
        onCursorChange: collaboration.updateCursor,
        permission: collaboration.permission,
        toolbar: collaboration.toolbar,
      }}
      contractorPlanning={workspace.contractorPlanning}
      durableMeta={{
        backofficeHref,
        proposalHref,
        proposalSlug: String(proposalId),
        status: durableStatus,
      }}
      durablePlanId={proposalId}
      embedded={embedded}
      headerActions={headerActions}
      initialRole={initialRole}
      initialState={initialState}
      lockedBannerActions={lockedBannerActions}
      modificationRequests={workspace.modificationRequests ?? []}
      persistence={persistence}
      readOnly={!hasTimelineEditPermission}
      shareUrlPath="/proposal-preview"
      timelineSettingsProjection={null}
      workspaceMode="proposal"
    />
  );
}
