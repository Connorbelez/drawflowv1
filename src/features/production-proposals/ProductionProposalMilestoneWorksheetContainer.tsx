import { useMutation } from "convex/react";
import type { Id } from "../../../convex/_generated/dataModel";
import { api } from "../../../convex/_generated/api";
import type { TimelineMilestoneWorksheetRow } from "#/features/timeline-workspace/-TimelineMilestoneWorksheetTable.tsx";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { toast } from "sonner";

import type { ContractorPlanningModel } from "#/features/contractors/ContractorPlanningPanel.tsx";

import { syncMilestonesToProductionTimeline } from "./ProductionProposalGanttWorkspace.tsx";
import { ProductionProposalMilestoneWorksheet } from "./ProductionProposalMilestoneWorksheet.tsx";
import {
  productionProposalDetailToDraftMilestones,
  type ProductionProposalWorksheetDetail,
  worksheetRowsToGanttMilestoneDrafts,
} from "./productionMilestoneWorksheetAdapter.ts";

export function ProductionProposalMilestoneWorksheetContainer({
  contractorPlanning,
  detail,
  footerExtra,
  persistenceMode = "noop",
  proposalId,
  showHeading = false,
  templateTitle,
  workosOrganizationId,
}: {
  contractorPlanning?: ContractorPlanningModel | null;
  detail: ProductionProposalWorksheetDetail;
  footerExtra?: React.ReactNode;
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

  const projectedMilestones = useMemo(
    () => productionProposalDetailToDraftMilestones(detail),
    [detail]
  );
  const scheduleByMilestoneKey = useMemo(
    () => new Map(projectedMilestones.map((milestone) => [milestone.key, milestone])),
    [projectedMilestones]
  );
  const previousMilestonesRef = useRef(projectedMilestones);

  useEffect(() => {
    previousMilestonesRef.current = projectedMilestones;
  }, [projectedMilestones]);

  const canPersist =
    persistenceMode === "convex" && detail.proposal.status !== "closed";

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
      } catch (error) {
        toast.error(
          error instanceof Error
            ? error.message
            : "Unable to save milestone worksheet changes."
        );
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
      contractorPlanning={contractorPlanning}
      detail={detail}
      footerExtra={footer}
      onPersistRows={canPersist ? onPersistRows : undefined}
      showHeading={showHeading}
      templateTitle={templateTitle}
    />
  );
}
