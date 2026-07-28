import { useMutation } from "convex/react";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { toast } from "sonner";
import type { ContractorPlanningModel } from "#/features/contractors/ContractorPlanningPanel.tsx";
import type { MaterialPlanningActions } from "#/features/material-planning/MaterialPlanningTab.tsx";
import type {
  TimelineMilestoneWorksheetRow,
  WorksheetContractorActions,
} from "#/features/timeline-workspace/-TimelineMilestoneWorksheetTable.tsx";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";

import { syncMilestonesToProductionTimeline } from "./ProductionProposalGanttWorkspace.tsx";
import { ProductionProposalMilestoneWorksheet } from "./ProductionProposalMilestoneWorksheet.tsx";
import {
  type ProductionProposalWorksheetDetail,
  productionProposalDetailToDraftMilestones,
  worksheetRowsToGanttMilestoneDrafts,
} from "./productionMilestoneWorksheetAdapter.ts";

export function ProductionProposalMilestoneWorksheetContainer({
  canMutateContractors = true,
  contractorPlanning,
  detail,
  footerExtra,
  materialPlanningActions,
  persistenceMode = "noop",
  proposalId,
  showHeading = false,
  templateTitle,
  workosOrganizationId,
}: {
  canMutateContractors?: boolean;
  contractorPlanning?: ContractorPlanningModel | null;
  detail: ProductionProposalWorksheetDetail;
  footerExtra?: React.ReactNode;
  materialPlanningActions?: MaterialPlanningActions;
  persistenceMode?: "convex" | "noop";
  proposalId: Id<"buildProposals">;
  showHeading?: boolean;
  templateTitle: string;
  workosOrganizationId: string;
}) {
  const updateMilestone = useMutation(
    api.production_proposals.updateProductionTimelineMilestone
  );
  const createMilestone = useMutation(
    api.production_proposals.createProductionTimelineMilestone
  );
  const deleteMilestone = useMutation(
    api.production_proposals.deleteProductionTimelineMilestone
  );
  const attachProposalContractor = useMutation(
    (api as any).production_proposals.attachProposalContractor
  );
  const attachAndInviteProposalContractor = useMutation(
    (api as any).production_proposals.attachAndInviteProposalContractor
  );
  const createAndAttachProposalContractor = useMutation(
    (api as any).production_proposals.createAndAttachProposalContractor
  );
  const sendContractorInvite = useMutation(
    (api as any).contractorOnboarding.sendContractorProfileInvite
  );

  const projectedMilestones = useMemo(
    () => productionProposalDetailToDraftMilestones(detail),
    [detail]
  );
  const scheduleByMilestoneKey = useMemo(
    () =>
      new Map(
        projectedMilestones.map((milestone) => [milestone.key, milestone])
      ),
    [projectedMilestones]
  );
  const previousMilestonesRef = useRef(projectedMilestones);
  const saveToastIdRef = useRef<string | number | null>(null);

  useEffect(() => {
    previousMilestonesRef.current = projectedMilestones;
  }, [projectedMilestones]);

  const canPersist =
    persistenceMode === "convex" && detail.proposal.status !== "closed";
  // Keep create/attach available whenever the surface is live. Server-side
  // authorization still enforces contractor permissions on each mutation.
  // Do not couple this to milestone worksheet persistenceMode — milestone
  // edits can be locked while crew creation remains valid.
  const allowContractorMutations =
    canMutateContractors && detail.proposal.status !== "closed";

  const contractorActions = useMemo<WorksheetContractorActions | undefined>(
    () =>
      allowContractorMutations
        ? {
            availableContractors:
              contractorPlanning?.availableContractors ?? [],
            onAttachAndInviteExisting: ({ contractorId, role }) =>
              attachAndInviteProposalContractor({
                contractorId: contractorId as Id<"contractorProfiles">,
                proposalId,
                role,
                workosOrganizationId,
              }),
            onAttachExisting: ({ contractorId, role }) =>
              attachProposalContractor({
                contractorId: contractorId as Id<"contractorProfiles">,
                proposalId,
                role,
                workosOrganizationId,
              }),
            onCreate: ({ contractor, role }) =>
              createAndAttachProposalContractor({
                contractor,
                proposalId,
                role,
                workosOrganizationId,
              }),
            onInviteCreatedContractor: (contractorId) =>
              sendContractorInvite({
                contractorId: contractorId as Id<"contractorProfiles">,
                workosOrganizationId,
              }),
          }
        : undefined,
    [
      allowContractorMutations,
      attachAndInviteProposalContractor,
      attachProposalContractor,
      contractorPlanning?.availableContractors,
      createAndAttachProposalContractor,
      proposalId,
      sendContractorInvite,
      workosOrganizationId,
    ]
  );

  const onPersistRows = useCallback(
    async (nextRows: TimelineMilestoneWorksheetRow[]) => {
      if (!canPersist) {
        return;
      }

      const nextMilestones = worksheetRowsToGanttMilestoneDrafts(
        nextRows,
        scheduleByMilestoneKey
      );
      const previousMilestones = previousMilestonesRef.current;

      saveToastIdRef.current = toast.loading("Saving...", {
        id: saveToastIdRef.current ?? undefined,
      });

      try {
        await syncMilestonesToProductionTimeline({
          createMilestone,
          deleteMilestone,
          nextMilestones,
          previousMilestones,
          proposalId,
          updateMilestone,
          workosOrganizationId,
        });
        previousMilestonesRef.current = nextMilestones;
        toast.success("Saved", {
          id: saveToastIdRef.current ?? undefined,
        });
      } catch (error) {
        toast.error(
          error instanceof Error
            ? error.message
            : "Unable to save milestone worksheet changes.",
          {
            id: saveToastIdRef.current ?? undefined,
          }
        );
      } finally {
        saveToastIdRef.current = null;
      }
    },
    [
      canPersist,
      createMilestone,
      deleteMilestone,
      proposalId,
      scheduleByMilestoneKey,
      updateMilestone,
      workosOrganizationId,
    ]
  );

  const footer = footerExtra ?? (
    <div className="timeline-blueprint-metric">
      <span>Proposal budget</span>
      <strong>
        {new Intl.NumberFormat("en-US", {
          currency: "USD",
          maximumFractionDigits: 0,
          style: "currency",
        }).format(detail.proposal.totalBudgetCents / 100)}
      </strong>
    </div>
  );

  return (
    <ProductionProposalMilestoneWorksheet
      contractorActions={contractorActions}
      contractorPlanning={contractorPlanning}
      detail={detail}
      footerExtra={footer}
      materialPlanningActions={materialPlanningActions}
      onPersistRows={canPersist ? onPersistRows : undefined}
      showHeading={showHeading}
      templateTitle={templateTitle}
    />
  );
}
