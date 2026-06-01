"use client";

import { useMutation } from "convex/react";

import { ContractorPlanningPanel } from "#/features/contractors/ContractorPlanningPanel.tsx";

import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import type { ProductionTimelineWorkspaceProps } from "./ProductionTimelineWorkspace.tsx";

export interface ProductionContractorPlanningTabProps {
  canMutate?: boolean;
  initialRole?: "builder" | "lender";
  persistenceMode?: "convex" | "noop";
  proposalId: Id<"buildProposals">;
  workspace: Pick<
    ProductionTimelineWorkspaceProps["workspace"],
    "contractorPlanning" | "milestones"
  >;
  workosOrganizationId: string;
}

export function ProductionContractorPlanningTab({
  canMutate = true,
  initialRole = "builder",
  persistenceMode = "convex",
  proposalId,
  workspace,
  workosOrganizationId,
}: ProductionContractorPlanningTabProps) {
  const attachProposalContractor = useMutation(
    (api as any).production_proposals.attachProposalContractor,
  );
  const createAndAttachProposalContractor = useMutation(
    (api as any).production_proposals.createAndAttachProposalContractor,
  );
  const assignProposalContractorToMilestone = useMutation(
    (api as any).production_proposals.assignProposalContractorToMilestone,
  );

  const milestones = productionProposalMilestonesForContractors(workspace);
  const allowMutations = persistenceMode !== "noop" && canMutate;

  return (
    <ContractorPlanningPanel
      canMutate={allowMutations}
      milestones={milestones}
      onAssignToMilestone={({
        assignmentCost,
        contractorId,
        milestoneKey,
        role,
        submilestoneKeys,
      }) =>
        assignProposalContractorToMilestone({
          agreedRateCents: assignmentCost?.agreedRateCents,
          agreedRateUnit: assignmentCost?.agreedRateUnit,
          contractorId,
          estimatedCostCents: assignmentCost?.estimatedCostCents,
          estimatedHours: assignmentCost?.estimatedHours,
          milestoneKey,
          proposalId,
          role,
          submilestoneKeys,
          workosOrganizationId,
        })
      }
      onAttachExisting={({ contractorId, role }) =>
        attachProposalContractor({
          contractorId,
          proposalId,
          role,
          workosOrganizationId,
        })
      }
      onCreateAndAttach={({ contractor, role }) =>
        createAndAttachProposalContractor({
          contractor,
          proposalId,
          role,
          workosOrganizationId,
        })
      }
      planning={workspace.contractorPlanning}
      roleLabel={initialRole}
    />
  );
}

export function productionProposalMilestonesForContractors(
  workspace: Pick<
    ProductionTimelineWorkspaceProps["workspace"],
    "milestones"
  >,
) {
  return workspace.milestones.map((milestone: { key?: string; milestoneKey?: string; name: string; submilestoneSnapshot?: Array<{ key: string; name: string }> }) => ({
    ...milestone,
    milestoneKey: milestone.milestoneKey ?? milestone.key ?? "milestone",
  }));
}
