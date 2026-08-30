import { useMutation } from "convex/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { BuildWorkspaceDemo } from "#/features/build-workspace-demo/BuildWorkspaceDemo.tsx";
import {
  contractorPlanningFromTimelinePlanning,
  parseGanttMilestoneScopeId,
} from "#/features/build-workspace-demo/build-workspace-contractor-planning.ts";
import type {
  AddMilestoneInput,
  BuildWorkspaceAdapter,
  MilestonePatch,
  OptimizationPlan,
  OptimizationPlanId,
  SiteVisitReportDraft,
  WorkspaceRole,
} from "#/features/build-workspace-demo/types.ts";
import { BuildWorkspaceProvider } from "#/features/build-workspace-demo/workspace-adapter.tsx";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import {
  syncDrawsToProductionTimeline,
  syncMilestonesToProductionTimeline,
} from "./ProductionProposalGanttWorkspacePersistence.ts";
import {
  buildProposalGanttIssues,
  buildSubmilestoneDependencies,
  deriveProposalDrawGroups,
  mapProposalGanttWorkspace,
  normalizeProposalDrawRows,
  proposalTimelineWorkspaceToGanttDraft,
} from "./ProductionProposalGanttWorkspacePlanning.ts";
import {
  applyGanttSubmilestoneMoves,
  buildGanttSubmilestoneParentTargets,
  prepareGanttSubmilestoneParentMove,
  proposalMilestonesToGanttSubmilestoneRows,
  reorderGanttSubmilestoneRow,
  resolveParentMilestoneKey,
  updateGanttSubmilestoneRow,
} from "./ProductionProposalGanttWorkspaceRows.ts";
import type {
  ProductionProposalGanttWorkspaceProps,
  ProductionProposalTimelineGanttWorkspaceProps,
  ProposalGanttDrawDraft,
  ProposalGanttMilestoneDraft,
} from "./ProductionProposalGanttWorkspaceTypes.ts";
import {
  calculateDrawAvailabilityCents,
  dayFromDate,
  dollarsToCents,
  normalizeMilestoneOrders,
  proposalBaseDateFromIso,
  sortedMilestones,
  uniqueDrawKey,
  uniqueMilestoneKey,
} from "./ProductionProposalGanttWorkspaceUtils.ts";

export type {
  DerivedProposalDrawGroup,
  ProductionProposalGanttWorkspaceProps,
  ProductionProposalTimelineGanttWorkspaceProps,
  ProposalGanttDrawDraft,
  ProposalGanttMilestoneDraft,
  ProposalGanttSubmilestoneDraft,
  ProposalGanttSubmilestoneRow,
} from "./ProductionProposalGanttWorkspaceTypes.ts";

// biome-ignore lint/performance/noBarrelFile: Preserve the established public Gantt facade exports.
export {
  deriveProposalDrawGroups,
  mapProposalGanttWorkspace,
  normalizeProposalDrawRows,
  proposalTimelineWorkspaceToGanttDraft,
} from "./ProductionProposalGanttWorkspacePlanning.ts";
export {
  applyGanttSubmilestoneMoves,
  buildGanttSubmilestoneParentTargets,
  moveGanttSubmilestoneToParent,
  proposalMilestonesToGanttSubmilestoneRows,
} from "./ProductionProposalGanttWorkspaceRows.ts";
export { syncMilestonesToProductionTimeline } from "./ProductionProposalGanttWorkspacePersistence.ts";

export function ProductionProposalTimelineGanttWorkspace({
  persistenceMode = "convex",
  proposalId,
  workspace,
  workosOrganizationId,
}: ProductionProposalTimelineGanttWorkspaceProps) {
  const productionApi = api.production_proposals as any;
  const createAndAttachProposalContractor = useMutation(
    productionApi.createAndAttachProposalContractor
  );
  const sendContractorInvite = useMutation(
    (api as any).contractorOnboarding.sendContractorProfileInvite
  );
  const assignProposalContractorToMilestone = useMutation(
    productionApi.assignProposalContractorToMilestone
  );
  const updateMilestone = useMutation(
    api.production_proposals.updateProductionTimelineMilestone
  );
  const createMilestone = useMutation(
    api.production_proposals.createProductionTimelineMilestone
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
  const submitProposal = useMutation(api.production_proposals.submitProposal);
  const selectProposalPlan = useMutation(productionApi.selectProposalPlan);

  const projected = useMemo(
    () => proposalTimelineWorkspaceToGanttDraft(workspace),
    [workspace]
  );
  const workspaceSignature = useMemo(
    () =>
      JSON.stringify({
        draws: projected.draws,
        milestones: projected.milestones,
      }),
    [projected.draws, projected.milestones]
  );
  const lastAppliedWorkspaceSignature = useRef("");
  const [localMilestones, setLocalMilestones] = useState(projected.milestones);
  const [localDraws, setLocalDraws] = useState(projected.draws);
  const [selectedPlanId, setSelectedPlanId] = useState<
    OptimizationPlanId | undefined
  >(workspace.proposal.selectedPlan?.planKey);

  useEffect(() => {
    if (lastAppliedWorkspaceSignature.current === workspaceSignature) {
      return;
    }
    lastAppliedWorkspaceSignature.current = workspaceSignature;
    setLocalMilestones(projected.milestones);
    setLocalDraws(projected.draws);
  }, [projected.draws, projected.milestones, workspaceSignature]);

  useEffect(() => {
    setSelectedPlanId(workspace.proposal.selectedPlan?.planKey);
  }, [workspace.proposal.selectedPlan?.planKey]);

  const persistMilestones = (nextMilestones: ProposalGanttMilestoneDraft[]) => {
    const previousMilestones = localMilestones;
    setLocalMilestones(nextMilestones);
    if (persistenceMode === "noop") {
      return;
    }
    void syncMilestonesToProductionTimeline({
      createMilestone,
      deleteMilestone,
      nextMilestones,
      previousMilestones,
      proposalId,
      updateMilestone,
      workosOrganizationId,
    }).catch((error) => {
      toast.error(
        error instanceof Error
          ? error.message
          : "Unable to save Gantt milestones."
      );
    });
  };

  const persistDraws = (nextDraws: ProposalGanttDrawDraft[]) => {
    const previousDraws = localDraws;
    setLocalDraws(nextDraws);
    if (persistenceMode === "noop") {
      return;
    }
    void syncDrawsToProductionTimeline({
      createDraw,
      deleteDraw,
      nextDraws,
      previousDraws,
      proposalId,
      updateDraw,
      workosOrganizationId,
    }).catch((error) => {
      toast.error(
        error instanceof Error ? error.message : "Unable to save Gantt draws."
      );
    });
  };

  const handleSubmit = () => {
    if (persistenceMode === "noop") {
      return;
    }
    void submitProposal({ proposalId, workosOrganizationId })
      .then(() => toast.success("Proposal submitted."))
      .catch(() => {
        toast.error(
          "Unable to submit proposal. Review the proposal and try again."
        );
      });
  };

  const handleSelectPlan = (plan: OptimizationPlan) => {
    if (persistenceMode === "noop") {
      setSelectedPlanId(plan.id);
      return;
    }
    setSelectedPlanId(undefined);
    void selectProposalPlan({
      metrics: {
        drawCount: localDraws.length,
        drawFeesCents: Math.round(plan.totalFees * 100),
        interestCostCents: Math.round(plan.projectedInterest * 100),
        minimumCashReserveCents: workspace.plan.minimumCashReserveCents ?? 0,
        projectedDurationDays: plan.durationDays,
        requiredWorkingCapitalCents: Math.round(plan.peakWorkingCapital * 100),
        startingCashCents: workspace.plan.startingCashCents,
        totalCostCents: Math.round(
          (plan.totalFees + plan.projectedInterest) * 100
        ),
        totalDrawAmountCents: localDraws.reduce(
          (total, draw) => total + draw.amountCents,
          0
        ),
      },
      planKey: plan.id,
      proposalId,
      recommendationReason: plan.summary,
      workosOrganizationId,
    })
      .then(() => {
        setSelectedPlanId(plan.id);
        toast.success(`${plan.label} selected for proposal submission.`);
      })
      .catch(() => {
        toast.error("Unable to select this proposal plan. Try again.");
      });
  };

  const contractorPlanning = contractorPlanningFromTimelinePlanning(
    workspace.contractorPlanning
  );
  const allowContractorMutations = persistenceMode !== "noop";

  return (
    <ProductionProposalGanttWorkspace
      baseDate={
        workspace.activeBuild?.startDate ?? workspace.proposal.proposedStartDate
      }
      borrowerCoPayBps={projected.borrowerCoPayBps}
      borrowerStartingCashCents={projected.borrowerStartingCashCents}
      buildName={projected.buildName}
      contractorPlanning={contractorPlanning}
      draws={localDraws}
      lenderDrawPolicyLimitCents={projected.lenderDrawPolicyLimitCents}
      location={projected.location}
      milestones={localMilestones}
      onAssignContractorToMilestone={
        allowContractorMutations
          ? async ({
              assignmentCost,
              contractorId,
              milestoneId,
              role,
              submilestoneKeys,
            }) => {
              const scope = parseGanttMilestoneScopeId(milestoneId);
              await assignProposalContractorToMilestone({
                agreedRateCents: assignmentCost?.agreedRateCents,
                agreedRateUnit: assignmentCost?.agreedRateUnit,
                contractorId,
                estimatedCostCents: assignmentCost?.estimatedCostCents,
                estimatedHours: assignmentCost?.estimatedHours,
                milestoneKey: scope.milestoneKey,
                proposalId,
                role,
                submilestoneKeys: submilestoneKeys ?? scope.submilestoneKeys,
                workosOrganizationId,
              });
            }
          : undefined
      }
      onCreateAndAssignContractor={
        allowContractorMutations
          ? async ({
              assignmentCost,
              contractor,
              milestoneId,
              role,
              submilestoneKeys,
            }) => {
              const scope = parseGanttMilestoneScopeId(milestoneId);
              const { contractorId } = await createAndAttachProposalContractor({
                contractor,
                proposalId,
                role,
                workosOrganizationId,
              });
              await assignProposalContractorToMilestone({
                agreedRateCents: assignmentCost?.agreedRateCents,
                agreedRateUnit: assignmentCost?.agreedRateUnit,
                contractorId,
                estimatedCostCents: assignmentCost?.estimatedCostCents,
                estimatedHours: assignmentCost?.estimatedHours,
                milestoneKey: scope.milestoneKey,
                proposalId,
                role,
                submilestoneKeys: submilestoneKeys ?? scope.submilestoneKeys,
                workosOrganizationId,
              });
              return contractorId;
            }
          : undefined
      }
      onDrawsChange={persistDraws}
      onInviteContractor={
        allowContractorMutations
          ? (contractorId) =>
              sendContractorInvite({
                contractorId: contractorId as Id<"contractorProfiles">,
                workosOrganizationId,
              })
          : undefined
      }
      onMilestonesChange={persistMilestones}
      onSelectPlan={handleSelectPlan}
      onSubmit={handleSubmit}
      proposalStatus={projected.proposalStatus}
      selectedPlanId={selectedPlanId}
    />
  );
}

export function ProductionProposalGanttWorkspace({
  baseDate,
  borrowerCoPayBps,
  borrowerStartingCashCents,
  buildName,
  contractorPlanning,
  draws,
  lenderDrawPolicyLimitCents,
  location,
  milestones,
  onAssignContractorToMilestone,
  onCreateAndAssignContractor,
  onInviteContractor,
  onDrawsChange,
  onMilestonesChange,
  onSelectPlan,
  onSubmit,
  proposalStatus,
  selectedPlanId,
}: ProductionProposalGanttWorkspaceProps) {
  const [role, setRole] = useState<WorkspaceRole>("builderLead");
  const [selectedMilestoneId, setSelectedMilestoneId] = useState(
    () => proposalMilestonesToGanttSubmilestoneRows(milestones)[0]?.id ?? ""
  );
  const [activePlanId, setActivePlanId] = useState<OptimizationPlanId>(
    selectedPlanId ?? "capitalConstrained"
  );
  const [dismissedIssueKeys, setDismissedIssueKeys] = useState(
    () => new Set<string>()
  );
  const timelineBaseDate = useMemo(
    () => proposalBaseDateFromIso(baseDate),
    [baseDate]
  );

  const normalizedDraws = useMemo(
    () =>
      normalizeProposalDrawRows({
        borrowerCoPayBps,
        draws,
        milestones,
      }),
    [borrowerCoPayBps, draws, milestones]
  );
  const derivedGroups = useMemo(
    () =>
      deriveProposalDrawGroups({
        borrowerCoPayBps,
        draws: normalizedDraws,
        milestones,
      }),
    [borrowerCoPayBps, milestones, normalizedDraws]
  );
  const issues = useMemo(
    () =>
      buildProposalGanttIssues({
        dismissedIssueKeys,
        drawGroups: derivedGroups,
        milestones,
      }),
    [derivedGroups, dismissedIssueKeys, milestones]
  );
  const dependencies = useMemo(
    () => buildSubmilestoneDependencies(milestones),
    [milestones]
  );

  const commitMilestones = (nextMilestones: ProposalGanttMilestoneDraft[]) => {
    const normalizedMilestones = normalizeMilestoneOrders(nextMilestones);
    onMilestonesChange(normalizedMilestones);
    onDrawsChange(
      normalizeProposalDrawRows({
        borrowerCoPayBps,
        draws: normalizedDraws,
        milestones: normalizedMilestones,
      })
    );
  };

  const commitDraws = (nextDraws: ProposalGanttDrawDraft[]) => {
    onDrawsChange(
      normalizeProposalDrawRows({
        borrowerCoPayBps,
        draws: nextDraws,
        milestones,
      })
    );
  };

  const mapped = mapProposalGanttWorkspace({
    activePlanId,
    baseDate: timelineBaseDate,
    borrowerStartingCashCents,
    buildName,
    dependencies,
    drawGroups: derivedGroups,
    issues,
    lenderDrawPolicyLimitCents,
    location,
    milestones,
    proposalStatus,
    role,
    selectedMilestoneId,
  });

  const selectPlan = (planId: OptimizationPlanId) => {
    setActivePlanId(planId);
    const plan = mapped.optimizationPlans.find((item) => item.id === planId);
    if (plan) {
      onSelectPlan?.(plan);
    }
  };
  const selectedId = selectedMilestoneId || mapped.selectedMilestoneId;
  const adapter: BuildWorkspaceAdapter = {
    ...mapped,
    activePlanId,
    assignContractorToMilestone: onAssignContractorToMilestone,
    contractorPlanning,
    createAndAssignContractor: onCreateAndAssignContractor,
    inviteContractor: onInviteContractor,
    resolveContractorMilestoneKey: (milestoneId) =>
      resolveParentMilestoneKey(milestoneId, milestones) ??
      parseGanttMilestoneScopeId(milestoneId).milestoneKey,
    addDependency: async (fromMilestoneId, toMilestoneId) => {
      const fromParentKey = resolveParentMilestoneKey(
        fromMilestoneId,
        milestones
      );
      const toParentKey = resolveParentMilestoneKey(toMilestoneId, milestones);
      if (!(fromParentKey && toParentKey) || fromParentKey === toParentKey) {
        return;
      }
      commitMilestones(
        milestones.map((milestone) =>
          milestone.key === toParentKey
            ? {
                ...milestone,
                dependencyKeys: Array.from(
                  new Set([...milestone.dependencyKeys, fromParentKey])
                ),
              }
            : milestone
        )
      );
    },
    addMilestone: async (input: AddMilestoneInput) => {
      const ordered = sortedMilestones(milestones);
      const last = ordered.at(-1);
      const order = ordered.length + 1;
      const durationDays = Math.max(1, Math.round(input.estimatedDurationDays));
      const dayStart = input.startAt
        ? dayFromDate(input.startAt, timelineBaseDate)
        : (last?.dayEnd ?? 0);
      const key = uniqueMilestoneKey(input.name, milestones);
      commitMilestones([
        ...ordered,
        {
          budgetCents: dollarsToCents(input.estimatedCost),
          dayEnd: dayStart + durationDays,
          dayStart,
          dependencyKeys: [],
          durationDays,
          key,
          name: input.name.trim() || "New milestone",
          order,
          submilestones: [
            {
              budgetCents: dollarsToCents(input.estimatedCost),
              durationDays,
              key: `${key}-scope`,
              name: input.name.trim() || "New milestone scope",
              order: 1,
            },
          ],
        },
      ]);
      commitDraws([
        ...normalizedDraws,
        {
          amountCents: calculateDrawAvailabilityCents(
            dollarsToCents(input.estimatedCost),
            borrowerCoPayBps
          ),
          drawKey: `draw-${String(order).padStart(2, "0")}`,
          label: `${input.name.trim() || "New milestone"} reimbursement draw`,
          milestoneKey: key,
          order,
          timingDay: dayStart + durationDays,
        },
      ]);
    },
    addSampleEvidence: async () => undefined,
    applyIssueQuickFix: async (issue) => {
      const targetId = issue.quickFix?.targetId ?? issue.milestoneIds[0];
      if (targetId) {
        setSelectedMilestoneId(targetId);
      }
    },
    applyRecommendedPlan: async () => selectPlan("capitalConstrained"),
    approveMilestone: async () => undefined,
    batchMoveMilestoneDates: async (moves) => {
      commitMilestones(
        applyGanttSubmilestoneMoves(milestones, moves, timelineBaseDate)
      );
    },
    claimSiteVisit: async () => undefined,
    dismissIssue: async (issue) => {
      setDismissedIssueKeys((current) => {
        const next = new Set(current);
        next.add(`${issue.id}:${issue.conditionHash}`);
        return next;
      });
    },
    mergeDrawGroups: async (sourceDrawGroupId, targetDrawGroupId) => {
      if (sourceDrawGroupId === targetDrawGroupId) {
        return;
      }
      commitDraws(
        normalizedDraws.filter((draw) => draw.drawKey !== sourceDrawGroupId)
      );
    },
    moveMilestoneDates: async (milestoneId, startAt, endAt) => {
      commitMilestones(
        applyGanttSubmilestoneMoves(
          milestones,
          [
            {
              milestoneId,
              startAt,
              endAt,
            },
          ],
          timelineBaseDate
        )
      );
    },
    moveMilestoneToDrawGroup: async (milestoneId, drawGroupId) => {
      const draw = normalizedDraws.find((row) => row.drawKey === drawGroupId);
      if (!draw) {
        return;
      }
      const parentKey = resolveParentMilestoneKey(milestoneId, milestones);
      if (!parentKey) {
        return;
      }
      commitDraws(
        normalizedDraws.map((row) =>
          row.drawKey === draw.drawKey
            ? {
                ...row,
                milestoneKey: parentKey,
              }
            : row
        )
      );
    },
    listSubmilestoneParentTargets: (milestoneId) =>
      buildGanttSubmilestoneParentTargets(milestones, milestoneId),
    moveSubmilestoneToParent: async (milestoneId, parentMilestoneKey) => {
      if (proposalStatus !== "draft") {
        return;
      }
      const result = prepareGanttSubmilestoneParentMove(
        milestones,
        milestoneId,
        parentMilestoneKey
      );
      if (result.milestones === milestones) {
        return;
      }
      commitMilestones(result.milestones);
      if (result.movedRowId) {
        setSelectedMilestoneId(result.movedRowId);
      }
    },
    recomputeProposalPlan: async () => undefined,
    rejectMilestone: async () => undefined,
    removeDependency: async (dependencyId) => {
      const dependency = dependencies.find((item) => item.id === dependencyId);
      if (!dependency) {
        return;
      }
      const fromParentKey = resolveParentMilestoneKey(
        dependency.fromMilestoneId,
        milestones
      );
      const toParentKey = resolveParentMilestoneKey(
        dependency.toMilestoneId,
        milestones
      );
      if (!(fromParentKey && toParentKey)) {
        return;
      }
      commitMilestones(
        milestones.map((milestone) =>
          milestone.key === toParentKey
            ? {
                ...milestone,
                dependencyKeys: milestone.dependencyKeys.filter(
                  (key) => key !== fromParentKey
                ),
              }
            : milestone
        )
      );
    },
    reorderMilestone: async (milestoneId, direction) => {
      const rows = proposalMilestonesToGanttSubmilestoneRows(milestones);
      const fromIndex = rows.findIndex((row) => row.id === milestoneId);
      const toIndex = direction === "up" ? fromIndex - 1 : fromIndex + 1;
      const target = rows[toIndex];
      if (fromIndex < 0 || !target) {
        return;
      }
      commitMilestones(
        reorderGanttSubmilestoneRow(milestones, milestoneId, target.id)
      );
    },
    reorderMilestoneAbsolute: async (milestoneId, _fromIndex, toIndex) => {
      const rows = proposalMilestonesToGanttSubmilestoneRows(milestones);
      const target = rows[Math.max(0, Math.min(toIndex, rows.length - 1))];
      if (!target) {
        return;
      }
      commitMilestones(
        reorderGanttSubmilestoneRow(milestones, milestoneId, target.id)
      );
    },
    requestMoreInformation: async () => undefined,
    requestSiteVisit: async () => undefined,
    resetWorkspace: async () => undefined,
    reviewEvidence: async () => undefined,
    selectMilestone: setSelectedMilestoneId,
    selectedMilestoneId: selectedId,
    selectedPlanId,
    setActivePlan: selectPlan,
    setDependencyHardness: async () => undefined,
    setMilestoneDragLocked: async () => undefined,
    setRole,
    splitDrawGroup: async (_drawGroupId, afterMilestoneId) => {
      const parentKey = resolveParentMilestoneKey(afterMilestoneId, milestones);
      const milestone = milestones.find((item) => item.key === parentKey);
      if (!milestone) {
        return;
      }
      const existing = normalizedDraws.find(
        (draw) => draw.milestoneKey === milestone.key
      );
      if (existing) {
        return;
      }
      commitDraws([
        ...normalizedDraws,
        {
          amountCents: calculateDrawAvailabilityCents(
            milestone.budgetCents,
            borrowerCoPayBps
          ),
          drawKey: uniqueDrawKey(milestone.key, normalizedDraws),
          label: `${milestone.name} reimbursement draw`,
          milestoneKey: milestone.key,
          timingDay: milestone.dayEnd,
        },
      ]);
    },
    submitCompletionClaim: async () => undefined,
    submitProposal: async () => onSubmit?.(),
    submitSiteVisitReport: async (
      _milestoneId: string,
      _report: SiteVisitReportDraft
    ) => undefined,
    updateForecastDates: async (milestoneId, startAt, endAt) => {
      commitMilestones(
        applyGanttSubmilestoneMoves(
          milestones,
          [
            {
              milestoneId,
              startAt,
              endAt,
            },
          ],
          timelineBaseDate
        )
      );
    },
    updateMilestone: async (milestoneId, patch: MilestonePatch) => {
      commitMilestones(
        updateGanttSubmilestoneRow(milestones, milestoneId, patch)
      );
    },
    updateDrawGroup: async (drawGroupId, patch) => {
      commitDraws(
        normalizedDraws.map((draw) =>
          draw.drawKey === drawGroupId
            ? {
                ...draw,
                ...(patch.amount === undefined
                  ? {}
                  : { amountCents: dollarsToCents(patch.amount) }),
                ...(patch.label === undefined ? {} : { label: patch.label }),
                ...(patch.timingDay === undefined
                  ? {}
                  : { customDate: true, timingDay: patch.timingDay }),
              }
            : draw
        )
      );
    },
    updateProgress: async () => undefined,
    uploadEvidence: async () => undefined,
  };

  return (
    <BuildWorkspaceProvider workspace={adapter}>
      <BuildWorkspaceDemo layout="embedded" />
    </BuildWorkspaceProvider>
  );
}
