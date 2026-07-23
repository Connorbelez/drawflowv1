import { useMutation, useQuery } from "convex/react";
import { useEffect, useMemo } from "react";

import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import type { BuilderDashboardData } from "./types";

type GenerateInput = {
  allowRegenerate?: boolean;
  draftId: Id<"demo_builderProposalDrafts">;
  estimatedStartDate?: string;
  originalBudgetCents: number;
  templateKey: string;
};

export function useBuilderProposalDemo(
  draftId?: Id<"demo_builderProposalDrafts">
) {
  const dashboard = useQuery(
    api.demo_builder_proposals.demo_getBuilderDashboard,
    draftId ? { draftId } : {}
  ) as BuilderDashboardData | undefined;

  const seedDemo = useMutation(
    api.demo_builder_proposals.demo_seedBuilderProposalDemo
  );
  const resetDemo = useMutation(
    api.demo_builder_proposals.demo_resetBuilderProposalDemo
  );
  const startDraft = useMutation(
    api.demo_builder_proposals.demo_startBuilderProposal
  );
  const generateMilestones = useMutation(
    api.demo_builder_proposals.demo_generateBuilderProposalMilestones
  );
  const toggleMilestone = useMutation(
    api.demo_builder_proposals.demo_toggleBuilderProposalMilestone
  );
  const updateMilestone = useMutation(
    api.demo_builder_proposals.demo_updateBuilderProposalMilestone
  );
  const reorderMilestone = useMutation(
    api.demo_builder_proposals.demo_reorderBuilderProposalMilestone
  );
  const addBankItem = useMutation(
    api.demo_builder_proposals.demo_addBuilderProposalBankItem
  );
  const createCustomMilestone = useMutation(
    api.demo_builder_proposals.demo_createBuilderProposalCustomMilestone
  );
  const updateCashAvailability = useMutation(
    api.demo_builder_proposals.demo_updateBuilderProposalCashAvailability
  );
  const finalizeBoundary = useMutation(
    api.demo_builder_proposals.demo_finalizeBuilderProposalBoundary
  );

  useEffect(() => {
    if (dashboard?.needsSeed) {
      void seedDemo({});
    }
  }, [dashboard?.needsSeed, seedDemo]);

  return useMemo(
    () => ({
      addBankItem,
      createCustomMilestone,
      dashboard,
      finalizeBoundary,
      generateMilestones: (input: GenerateInput) => generateMilestones(input),
      isLoading: dashboard === undefined,
      resetDemo,
      reorderMilestone,
      startDraft,
      toggleMilestone,
      updateCashAvailability,
      updateMilestone,
    }),
    [
      addBankItem,
      createCustomMilestone,
      dashboard,
      finalizeBoundary,
      generateMilestones,
      resetDemo,
      reorderMilestone,
      startDraft,
      toggleMilestone,
      updateCashAvailability,
      updateMilestone,
    ]
  );
}
