import { useMutation } from "convex/react";
import { addDays, differenceInDays } from "date-fns";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { BuildWorkspaceDemo } from "#/features/build-workspace-demo/BuildWorkspaceDemo.tsx";
import {
  contractorPlanningFromTimelinePlanning,
  parseGanttMilestoneScopeId,
} from "#/features/build-workspace-demo/build-workspace-contractor-planning.ts";
import type {
  AddMilestoneInput,
  AuditEvent,
  BuildWorkspaceAdapter,
  BuildWorkspaceState,
  DependencyHardness,
  DrawGroup,
  Milestone,
  MilestoneDependency,
  MilestonePatch,
  OptimizationPlan,
  OptimizationPlanId,
  OutboxEvent,
  SiteVisitReportDraft,
  SubmilestoneParentTarget,
  WorkspaceIssue,
  WorkspaceRole,
} from "#/features/build-workspace-demo/types.ts";
import { BuildWorkspaceProvider } from "#/features/build-workspace-demo/workspace-adapter.tsx";
import type { ContractorPlanningModel } from "#/features/contractors/ContractorPlanningPanel.tsx";
import type {
  ContractorAssignmentCostDraft,
  ContractorProfileDraft,
} from "#/features/contractors/ContractorQuickAddDrawer.tsx";
import { localDateFromIsoDate } from "#/features/production-proposals/proposalScheduleDates.ts";
import type { ConvexTimelineWorkspace } from "#/features/timeline-workspace/-timeline-convex-adapter.ts";
import type { IsometricIconKey } from "#/features/timeline-workspace/-timeline-share-snapshot.ts";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";

const BASE_DATE = new Date(2026, 5, 1);
const DRAW_FEE_DOLLARS = 500;
const DEFAULT_INTEREST_RATE_PCT = 9.25;

export interface ProposalGanttSubmilestoneDraft {
  budgetCents?: number;
  durationDays?: number;
  key: string;
  name: string;
  order: number;
  startDay?: number;
}

export interface ProposalGanttMilestoneDraft {
  budgetCents: number;
  dayEnd: number;
  dayStart: number;
  dependencyKeys: string[];
  durationDays: number;
  icon?: IsometricIconKey;
  key: string;
  name: string;
  order: number;
  submilestones: ProposalGanttSubmilestoneDraft[];
}

export interface ProposalGanttDrawDraft {
  amountCents: number;
  customDate?: boolean;
  drawKey: string;
  label: string;
  milestoneKey?: string;
  order?: number;
  timingDay: number;
}

export interface DerivedProposalDrawGroup {
  amountCents: number;
  draw: ProposalGanttDrawDraft;
  drawAvailabilityCents: number;
  endDay: number;
  groupMilestones: ProposalGanttMilestoneDraft[];
  order: number;
  startDay: number;
  submilestones: Array<
    ProposalGanttSubmilestoneDraft & {
      groupOrdinal: number;
      milestoneKey: string;
      milestoneName: string;
    }
  >;
}

export interface ProposalGanttSubmilestoneRow {
  budgetCents: number;
  dayEnd: number;
  dayStart: number;
  durationDays: number;
  id: string;
  milestoneKey: string;
  milestoneName: string;
  milestoneOrder: number;
  name: string;
  order: number;
  submilestone: ProposalGanttSubmilestoneDraft;
  submilestoneKey: string;
}

export interface ProductionProposalGanttWorkspaceProps {
  baseDate?: string;
  borrowerCoPayBps: number;
  borrowerWorkingCapitalLimitCents: number;
  buildName: string;
  contractorPlanning?: ContractorPlanningModel | null;
  draws: ProposalGanttDrawDraft[];
  lenderDrawPolicyLimitCents: number;
  location: string;
  milestones: ProposalGanttMilestoneDraft[];
  onAssignContractorToMilestone?: (input: {
    assignmentCost?: ContractorAssignmentCostDraft;
    contractorId: string;
    milestoneId: string;
    role: string;
    submilestoneKeys?: string[];
  }) => Promise<void>;
  onCreateAndAssignContractor?: (input: {
    assignmentCost?: ContractorAssignmentCostDraft;
    contractor: ContractorProfileDraft;
    milestoneId: string;
    role: string;
    submilestoneKeys?: string[];
  }) => Promise<void>;
  onDrawsChange: (draws: ProposalGanttDrawDraft[]) => void;
  onMilestonesChange: (milestones: ProposalGanttMilestoneDraft[]) => void;
  onSubmit?: () => void;
  proposalStatus: "draft" | "submitted" | "approved" | "closed";
}

export interface ProductionProposalTimelineGanttWorkspaceProps {
  persistenceMode?: "convex" | "noop";
  proposalId: Id<"buildProposals">;
  workosOrganizationId: string;
  workspace: ConvexTimelineWorkspace & {
    activeBuild?: { startDate?: string } | null;
    contractorPlanning?: ContractorPlanningModel | null;
    proposal: {
      borrowerCoPayBps?: number;
      borrowerWorkingCapitalLimitCents?: number;
      buildName: string;
      lenderDrawPolicyLimitCents?: number;
      location: string;
      proposedStartDate?: string;
      status: string;
      totalBudgetCents: number;
    };
  };
}

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

  useEffect(() => {
    if (lastAppliedWorkspaceSignature.current === workspaceSignature) {
      return;
    }
    lastAppliedWorkspaceSignature.current = workspaceSignature;
    setLocalMilestones(projected.milestones);
    setLocalDraws(projected.draws);
  }, [projected.draws, projected.milestones, workspaceSignature]);

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
      .catch((error) => {
        toast.error(
          error instanceof Error ? error.message : "Unable to submit proposal."
        );
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
      borrowerWorkingCapitalLimitCents={
        projected.borrowerWorkingCapitalLimitCents
      }
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
            }
          : undefined
      }
      onDrawsChange={persistDraws}
      onMilestonesChange={persistMilestones}
      onSubmit={handleSubmit}
      proposalStatus={projected.proposalStatus}
    />
  );
}

export function ProductionProposalGanttWorkspace({
  baseDate,
  borrowerCoPayBps,
  borrowerWorkingCapitalLimitCents,
  buildName,
  contractorPlanning,
  draws,
  lenderDrawPolicyLimitCents,
  location,
  milestones,
  onAssignContractorToMilestone,
  onCreateAndAssignContractor,
  onDrawsChange,
  onMilestonesChange,
  onSubmit,
  proposalStatus,
}: ProductionProposalGanttWorkspaceProps) {
  const [role, setRole] = useState<WorkspaceRole>("builderLead");
  const [selectedMilestoneId, setSelectedMilestoneId] = useState(
    () => proposalMilestonesToGanttSubmilestoneRows(milestones)[0]?.id ?? ""
  );
  const [activePlanId, setActivePlanId] =
    useState<OptimizationPlanId>("capitalConstrained");
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
    borrowerWorkingCapitalLimitCents,
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

  const selectedId = selectedMilestoneId || mapped.selectedMilestoneId;
  const adapter: BuildWorkspaceAdapter = {
    ...mapped,
    activePlanId,
    assignContractorToMilestone: onAssignContractorToMilestone,
    contractorPlanning,
    createAndAssignContractor: onCreateAndAssignContractor,
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
    applyRecommendedPlan: async () => setActivePlanId("capitalConstrained"),
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
    setActivePlan: setActivePlanId,
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

export function proposalTimelineWorkspaceToGanttDraft(
  workspace: ConvexTimelineWorkspace & {
    proposal: {
      borrowerCoPayBps?: number;
      borrowerWorkingCapitalLimitCents?: number;
      buildName: string;
      lenderDrawPolicyLimitCents?: number;
      location: string;
      proposedStartDate?: string;
      status: string;
      totalBudgetCents: number;
    };
  }
) {
  const milestones = workspace.milestones
    .map<ProposalGanttMilestoneDraft>((milestone, index) => {
      const dayStart = Math.round(milestone.x);
      const durationDays = Math.max(1, Math.round(milestone.durationDays));
      return {
        budgetCents: Math.max(0, Math.round(milestone.budgetCents)),
        dayEnd: dayStart + durationDays,
        dayStart,
        dependencyKeys: milestone.dependencyKeys ?? [],
        durationDays,
        icon: milestone.icon,
        key: milestone.milestoneKey,
        name: milestone.name,
        order: milestone.order ?? index + 1,
        submilestones: milestone.submilestoneSnapshot.map(
          (submilestone, subIndex) => ({
            ...(submilestone.budgetCents === undefined
              ? {}
              : { budgetCents: submilestone.budgetCents }),
            ...(submilestone.durationDays === undefined
              ? {}
              : { durationDays: submilestone.durationDays }),
            key:
              submilestone.key ??
              `${milestone.milestoneKey}-sub-${String(subIndex + 1).padStart(2, "0")}`,
            name: submilestone.name,
            order: submilestone.order ?? subIndex + 1,
            ...(submilestone.startDay === undefined
              ? {}
              : { startDay: submilestone.startDay }),
          })
        ),
      };
    })
    .sort(
      (left, right) =>
        left.order - right.order || left.key.localeCompare(right.key)
    );
  const borrowerCoPayBps =
    workspace.plan.borrowerCoPayBps ?? workspace.proposal.borrowerCoPayBps ?? 0;
  const draws = normalizeProposalDrawRows({
    borrowerCoPayBps,
    draws: workspace.draws.map((draw, index) => ({
      amountCents: draw.amountCents,
      customDate: draw.customDate,
      drawKey: draw.drawKey,
      label: draw.label,
      milestoneKey: draw.itemMilestoneKey,
      order: index + 1,
      timingDay: Math.round(draw.x),
    })),
    milestones,
  });
  return {
    borrowerCoPayBps,
    borrowerWorkingCapitalLimitCents:
      workspace.plan.startingCashCents ??
      workspace.proposal.borrowerWorkingCapitalLimitCents ??
      0,
    buildName: workspace.proposal.buildName,
    draws,
    lenderDrawPolicyLimitCents:
      workspace.proposal.lenderDrawPolicyLimitCents ??
      (workspace.draws.reduce((total, draw) => total + draw.amountCents, 0) ||
        workspace.proposal.totalBudgetCents),
    location: workspace.proposal.location,
    milestones,
    proposalStatus: normalizeProposalStatus(workspace.proposal.status),
  };
}

export function deriveProposalDrawGroups({
  borrowerCoPayBps,
  draws,
  milestones,
}: {
  borrowerCoPayBps: number;
  draws: ProposalGanttDrawDraft[];
  milestones: ProposalGanttMilestoneDraft[];
}): DerivedProposalDrawGroup[] {
  const orderedMilestones = sortedMilestones(milestones);
  if (orderedMilestones.length === 0) {
    return [];
  }
  const orderedDraws = sortDrawsByBoundary(draws, orderedMilestones);
  const groups: DerivedProposalDrawGroup[] = [];
  let previousBoundaryIndex = -1;

  for (const draw of orderedDraws) {
    const boundaryIndex = Math.max(
      previousBoundaryIndex,
      resolveDrawBoundaryIndex(draw, orderedMilestones)
    );
    const groupMilestones = orderedMilestones.slice(
      previousBoundaryIndex + 1,
      boundaryIndex + 1
    );
    if (groupMilestones.length === 0) {
      continue;
    }
    groups.push(
      buildDerivedDrawGroup({
        borrowerCoPayBps,
        draw,
        groupMilestones,
        order: groups.length + 1,
      })
    );
    previousBoundaryIndex = boundaryIndex;
  }

  if (previousBoundaryIndex < orderedMilestones.length - 1) {
    const groupMilestones = orderedMilestones.slice(previousBoundaryIndex + 1);
    const last = groupMilestones.at(-1) ?? orderedMilestones.at(-1)!;
    groups.push(
      buildDerivedDrawGroup({
        borrowerCoPayBps,
        draw: {
          amountCents: groupMilestones.reduce(
            (total, milestone) =>
              total +
              calculateDrawAvailabilityCents(
                milestone.budgetCents,
                borrowerCoPayBps
              ),
            0
          ),
          drawKey: uniqueDrawKey(last.key, draws),
          label: `${last.name} reimbursement draw`,
          milestoneKey: last.key,
          timingDay: last.dayEnd,
        },
        groupMilestones,
        order: groups.length + 1,
      })
    );
  }

  return groups;
}

export function normalizeProposalDrawRows({
  borrowerCoPayBps,
  draws,
  milestones,
}: {
  borrowerCoPayBps: number;
  draws: ProposalGanttDrawDraft[];
  milestones: ProposalGanttMilestoneDraft[];
}): ProposalGanttDrawDraft[] {
  const groups = deriveProposalDrawGroups({
    borrowerCoPayBps,
    draws: draws.length ? draws : defaultDrawRows(milestones, borrowerCoPayBps),
    milestones,
  });

  return groups.map((group, index) => {
    const boundary = group.groupMilestones.at(-1);
    return {
      ...group.draw,
      amountCents: group.amountCents,
      label:
        group.draw.label ||
        `${boundary?.name ?? "Milestone"} reimbursement draw`,
      milestoneKey: boundary?.key,
      order: index + 1,
      timingDay: group.draw.customDate
        ? group.draw.timingDay
        : (boundary?.dayEnd ?? group.draw.timingDay),
    };
  });
}

export function mapProposalGanttWorkspace({
  activePlanId,
  baseDate = BASE_DATE,
  borrowerWorkingCapitalLimitCents,
  buildName,
  dependencies,
  drawGroups,
  issues,
  lenderDrawPolicyLimitCents,
  location,
  milestones,
  proposalStatus,
  role,
  selectedMilestoneId,
}: {
  activePlanId: OptimizationPlanId;
  baseDate?: Date;
  borrowerWorkingCapitalLimitCents: number;
  buildName: string;
  dependencies: MilestoneDependency[];
  drawGroups: DerivedProposalDrawGroup[];
  issues: WorkspaceIssue[];
  lenderDrawPolicyLimitCents: number;
  location: string;
  milestones: ProposalGanttMilestoneDraft[];
  proposalStatus: "draft" | "submitted" | "approved" | "closed";
  role: WorkspaceRole;
  selectedMilestoneId: string;
}): BuildWorkspaceState {
  const orderedMilestones = sortedMilestones(milestones);
  const submilestoneRows =
    proposalMilestonesToGanttSubmilestoneRows(orderedMilestones);
  const totalBudgetCents = orderedMilestones.reduce(
    (sum, milestone) => sum + milestone.budgetCents,
    0
  );
  const workspaceDrawGroups = drawGroups.map<DrawGroup>((group) => ({
    amount: centsToDollars(group.amountCents),
    eligibleAt: dateFromDay(group.draw.timingDay, baseDate),
    endAt: dateFromDay(group.endDay, baseDate),
    id: group.draw.drawKey,
    issues: issues.filter((issue) =>
      issue.drawGroupIds.includes(group.draw.drawKey)
    ),
    label: group.draw.label,
    order: group.order,
    plannedAt: dateFromDay(group.draw.timingDay, baseDate),
    rowIndex: indexOfSubmilestoneRow(
      submilestoneRows,
      group.submilestones[0]?.milestoneKey,
      group.submilestones[0]?.key
    ),
    rowSpan: Math.max(1, group.submilestones.length),
    startAt: dateFromDay(group.startDay, baseDate),
    status: "planned",
    timingDay: group.draw.timingDay,
    totalExposure: centsToDollars(group.amountCents),
    warningState: warningStateForDrawGroup(issues, group.draw.drawKey),
  }));
  const drawKeyBySubmilestoneRow = new Map<string, string>();
  for (const group of drawGroups) {
    for (const submilestone of group.submilestones) {
      drawKeyBySubmilestoneRow.set(
        ganttSubmilestoneRowId(submilestone.milestoneKey, submilestone.key),
        group.draw.drawKey
      );
    }
  }
  const dependencyFromIdsByRow = new Map<string, string[]>();
  const dependencyToIdsByRow = new Map<string, string[]>();
  for (const dependency of dependencies) {
    dependencyFromIdsByRow.set(dependency.toMilestoneId, [
      ...(dependencyFromIdsByRow.get(dependency.toMilestoneId) ?? []),
      dependency.fromMilestoneId,
    ]);
    dependencyToIdsByRow.set(dependency.fromMilestoneId, [
      ...(dependencyToIdsByRow.get(dependency.fromMilestoneId) ?? []),
      dependency.toMilestoneId,
    ]);
  }
  const workspaceMilestones = submilestoneRows.map<Milestone>((row) => ({
    actualCost: centsToDollars(row.budgetCents),
    blockedByKeys: dependencyFromIdsByRow.get(row.id) ?? [],
    blockingKeys: dependencyToIdsByRow.get(row.id) ?? [],
    blockingReasons: [],
    code: `${row.milestoneKey.toUpperCase()}.${row.order}`,
    completionReport: "",
    drawGroupId:
      drawKeyBySubmilestoneRow.get(row.id) ?? workspaceDrawGroups[0]?.id ?? "",
    endAt: dateFromDay(row.dayEnd, baseDate),
    estimatedCost: centsToDollars(row.budgetCents),
    estimatedDurationDays: row.durationDays,
    evidenceFiles: [],
    evidencePackages: [],
    evidenceStatus: "draft",
    id: row.id,
    isDragLocked: false,
    issues: issues.filter(
      (issue) =>
        issue.milestoneIds.includes(row.milestoneKey) ||
        issue.milestoneIds.includes(row.id)
    ),
    lane: drawKeyBySubmilestoneRow.get(row.id) ?? row.milestoneKey,
    name: row.name,
    notes: `${row.milestoneName} / sub-milestone ${row.order}`,
    progress: 0,
    requestedAmountCents: drawGroups.find((group) =>
      group.submilestones.some(
        (item) =>
          item.milestoneKey === row.milestoneKey &&
          item.key === row.submilestoneKey
      )
    )?.amountCents,
    requiresSiteVisit: false,
    reviewReports: [],
    siteVisitRequested: false,
    siteVisits: [],
    staffRecommendation: "",
    startAt: dateFromDay(row.dayStart, baseDate),
    status: proposalStatus === "draft" ? "proposed" : "notStarted",
    warningCount: issues.filter(
      (issue) =>
        issue.milestoneIds.includes(row.milestoneKey) ||
        issue.milestoneIds.includes(row.id)
    ).length,
  }));
  const optimizationPlans = buildProposalOptimizationPlans({
    activePlanId,
    borrowerWorkingCapitalLimitCents,
    drawGroups: workspaceDrawGroups,
    lenderDrawPolicyLimitCents,
    milestones: orderedMilestones,
  });

  return {
    activePlanId,
    auditEvents: buildDraftAuditEvents(orderedMilestones, workspaceDrawGroups),
    budget: {
      borrowerWorkingCapitalLimit: centsToDollars(
        borrowerWorkingCapitalLimitCents
      ),
      drawFeeBps: 0,
      interestRatePct: DEFAULT_INTEREST_RATE_PCT,
      lenderDrawPolicyLimit: centsToDollars(lenderDrawPolicyLimitCents),
      requestedLoanAmount: centsToDollars(lenderDrawPolicyLimitCents),
      totalBuildBudget: centsToDollars(totalBudgetCents),
      version: 1,
    },
    build: {
      borrowerName: "Builder borrower",
      buildName,
      lenderName: "FairLend Construction Capital",
      organizationId: "proposal-draft",
      phaseLabel: "Build Proposal planning workspace",
      proposalStatus: proposalStatus === "closed" ? "approved" : proposalStatus,
      siteAddress: location,
    },
    compilationStatus: issues.some((issue) => issue.severity === "blocking")
      ? "blocked"
      : "upToDate",
    dependencies,
    drawGroups: workspaceDrawGroups,
    isLoading: false,
    issues,
    milestones: workspaceMilestones,
    mode: "proposal",
    needsSeed: false,
    optimizationPlans,
    outboxEvents: buildDraftOutboxEvents(
      orderedMilestones,
      workspaceDrawGroups
    ),
    role,
    selectedMilestoneId:
      selectedMilestoneId || workspaceMilestones[0]?.id || "",
    terminalMessage:
      "Draft Gantt edits update the proposal package before save.",
    timelineBaseDate: baseDate,
    validationErrors: issues
      .filter((issue) => issue.severity === "blocking")
      .map((issue) => issue.message),
    validationWarnings: issues
      .filter((issue) => issue.severity === "warning")
      .map((issue) => issue.message),
  };
}

function warningStateForDrawGroup(
  issues: WorkspaceIssue[],
  drawGroupId: string
) {
  const relatedIssues = issues.filter((issue) =>
    issue.drawGroupIds.includes(drawGroupId)
  );
  if (relatedIssues.some((issue) => issue.severity === "blocking")) {
    return "critical" as const;
  }
  return relatedIssues.length > 0 ? ("warning" as const) : ("clear" as const);
}

function buildDerivedDrawGroup({
  borrowerCoPayBps,
  draw,
  groupMilestones,
  order,
}: {
  borrowerCoPayBps: number;
  draw: ProposalGanttDrawDraft;
  groupMilestones: ProposalGanttMilestoneDraft[];
  order: number;
}): DerivedProposalDrawGroup {
  const startDay = Math.min(
    ...groupMilestones.map((milestone) => milestone.dayStart)
  );
  const endDay = Math.max(
    ...groupMilestones.map((milestone) => milestone.dayEnd)
  );
  const derivedAmountCents = groupMilestones.reduce(
    (total, milestone) =>
      total +
      calculateDrawAvailabilityCents(milestone.budgetCents, borrowerCoPayBps),
    0
  );
  const amountCents =
    draw.amountCents > 0 ? Math.round(draw.amountCents) : derivedAmountCents;
  return {
    amountCents,
    draw: {
      ...draw,
      amountCents,
    },
    drawAvailabilityCents: derivedAmountCents,
    endDay,
    groupMilestones,
    order,
    startDay,
    submilestones: groupMilestones.flatMap((milestone) =>
      submilestonesForMilestone(milestone).map((submilestone, index) => ({
        ...submilestone,
        groupOrdinal: index + 1,
        milestoneKey: milestone.key,
        milestoneName: milestone.name,
      }))
    ),
  };
}

export function proposalMilestonesToGanttSubmilestoneRows(
  milestones: ProposalGanttMilestoneDraft[]
): ProposalGanttSubmilestoneRow[] {
  return sortedMilestones(milestones).flatMap((milestone) => {
    const submilestones = submilestonesForMilestone(milestone);
    const durationHints = submilestones.map((submilestone) =>
      Math.max(1, Math.round(submilestone.durationDays ?? 1))
    );
    const hasPersistedStarts = submilestones.some(
      (submilestone) => submilestone.startDay !== undefined
    );
    const durations = hasPersistedStarts
      ? durationHints
      : fitDurationsToTotal(
          durationHints,
          Math.max(1, milestone.dayEnd - milestone.dayStart)
        );
    const budgetHints = submilestones.map((submilestone, index) =>
      Math.max(1, Math.round(submilestone.budgetCents ?? durations[index] ?? 1))
    );
    const budgets = allocateIntegerTotal(
      Math.max(0, Math.round(milestone.budgetCents)),
      budgetHints
    );
    let cursor = milestone.dayStart;
    return submilestones.map((submilestone, index) => {
      const durationDays = durations[index] ?? 1;
      const dayStart =
        submilestone.startDay === undefined
          ? cursor
          : Math.round(submilestone.startDay);
      const dayEnd = dayStart + durationDays;
      cursor = dayEnd;
      return {
        budgetCents: budgets[index] ?? 0,
        dayEnd,
        dayStart,
        durationDays,
        id: ganttSubmilestoneRowId(milestone.key, submilestone.key),
        milestoneKey: milestone.key,
        milestoneName: milestone.name,
        milestoneOrder: milestone.order,
        name: submilestone.name,
        order: submilestone.order ?? index + 1,
        submilestone,
        submilestoneKey: submilestone.key,
      };
    });
  });
}

export function applyGanttSubmilestoneMoves(
  milestones: ProposalGanttMilestoneDraft[],
  moves: Array<{ endAt: Date | null; milestoneId: string; startAt: Date }>,
  baseDate = BASE_DATE
) {
  let nextMilestones = milestones;
  const movesByParent = new Map<string, typeof moves>();
  for (const move of moves) {
    const parentKey = resolveParentMilestoneKey(
      move.milestoneId,
      nextMilestones
    );
    if (!parentKey) {
      continue;
    }
    movesByParent.set(parentKey, [
      ...(movesByParent.get(parentKey) ?? []),
      move,
    ]);
  }

  for (const [parentKey, parentMoves] of movesByParent) {
    const milestone = nextMilestones.find((item) => item.key === parentKey);
    if (!milestone) {
      continue;
    }
    const rows = proposalMilestonesToGanttSubmilestoneRows([milestone]);
    const movedRowIds = new Set(parentMoves.map((move) => move.milestoneId));
    const deltas = parentMoves.map((move) => {
      const row = rows.find((item) => item.id === move.milestoneId);
      return row ? dayFromDate(move.startAt, baseDate) - row.dayStart : 0;
    });
    const uniqueDeltas = Array.from(new Set(deltas));
    if (movedRowIds.size === rows.length && uniqueDeltas.length === 1) {
      const delta = uniqueDeltas[0] ?? 0;
      nextMilestones = nextMilestones.map((item) =>
        item.key === parentKey ? shiftMilestoneDays(item, delta) : item
      );
      continue;
    }

    let nextMilestone = milestone;
    for (const move of parentMoves) {
      nextMilestone = applySingleGanttSubmilestoneMove(
        nextMilestone,
        move,
        baseDate
      );
    }
    nextMilestones = nextMilestones.map((item) =>
      item.key === parentKey ? nextMilestone : item
    );
  }

  return nextMilestones;
}

function applySingleGanttSubmilestoneMove(
  milestone: ProposalGanttMilestoneDraft,
  move: { endAt: Date | null; milestoneId: string; startAt: Date },
  baseDate: Date
) {
  const rows = proposalMilestonesToGanttSubmilestoneRows([milestone]);
  const rowIndex = rows.findIndex((row) => row.id === move.milestoneId);
  if (rowIndex < 0) {
    return milestone;
  }
  const targetStart = dayFromDate(move.startAt, baseDate);
  const targetEnd = dayFromDate(move.endAt ?? move.startAt, baseDate);
  const targetDuration = Math.max(1, targetEnd - targetStart);
  const nextSubmilestones = submilestonesForMilestone(milestone).map(
    (submilestone, index) => ({
      ...submilestone,
      budgetCents: rows[index]?.budgetCents,
      durationDays: rows[index]?.durationDays ?? submilestone.durationDays ?? 1,
      startDay: rows[index]?.dayStart ?? submilestone.startDay,
    })
  );

  nextSubmilestones[rowIndex] = {
    ...nextSubmilestones[rowIndex]!,
    durationDays: targetDuration,
    startDay: targetStart,
  };
  return normalizeMilestoneFromSubmilestones({
    ...milestone,
    submilestones: nextSubmilestones,
  });
}

function updateGanttSubmilestoneRow(
  milestones: ProposalGanttMilestoneDraft[],
  milestoneId: string,
  patch: MilestonePatch
) {
  const parentKey = resolveParentMilestoneKey(milestoneId, milestones);
  if (!parentKey) {
    return milestones;
  }
  return milestones.map((milestone) => {
    if (milestone.key !== parentKey) {
      return milestone;
    }
    const submilestones = submilestonesForMilestone(milestone).map(
      (submilestone) =>
        ganttSubmilestoneRowId(milestone.key, submilestone.key) === milestoneId
          ? {
              ...submilestone,
              budgetCents:
                patch.estimatedCost === undefined
                  ? submilestone.budgetCents
                  : dollarsToCents(patch.estimatedCost),
              durationDays:
                patch.estimatedDurationDays === undefined
                  ? submilestone.durationDays
                  : Math.max(1, Math.round(patch.estimatedDurationDays)),
              name: patch.name ?? submilestone.name,
            }
          : submilestone
    );
    return normalizeMilestoneFromSubmilestones({
      ...milestone,
      submilestones,
    });
  });
}

function reorderGanttSubmilestoneRow(
  milestones: ProposalGanttMilestoneDraft[],
  sourceRowId: string,
  targetRowId: string
) {
  const sourceParentKey = resolveParentMilestoneKey(sourceRowId, milestones);
  const targetParentKey = resolveParentMilestoneKey(targetRowId, milestones);
  if (!(sourceParentKey && targetParentKey)) {
    return milestones;
  }
  if (sourceParentKey !== targetParentKey) {
    const ordered = sortedMilestones(milestones);
    const fromIndex = ordered.findIndex(
      (milestone) => milestone.key === sourceParentKey
    );
    const toIndex = ordered.findIndex(
      (milestone) => milestone.key === targetParentKey
    );
    if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) {
      return milestones;
    }
    const next = [...ordered];
    const [moved] = next.splice(fromIndex, 1);
    if (!moved) {
      return milestones;
    }
    next.splice(toIndex, 0, moved);
    return next;
  }
  return milestones.map((milestone) => {
    if (milestone.key !== sourceParentKey) {
      return milestone;
    }
    const submilestones = submilestonesForMilestone(milestone);
    const fromIndex = submilestones.findIndex(
      (submilestone) =>
        ganttSubmilestoneRowId(milestone.key, submilestone.key) === sourceRowId
    );
    const toIndex = submilestones.findIndex(
      (submilestone) =>
        ganttSubmilestoneRowId(milestone.key, submilestone.key) === targetRowId
    );
    if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) {
      return milestone;
    }
    const next = [...submilestones];
    const [moved] = next.splice(fromIndex, 1);
    if (!moved) {
      return milestone;
    }
    next.splice(toIndex, 0, moved);
    return normalizeMilestoneFromSubmilestones({
      ...milestone,
      submilestones: next.map((submilestone, index) => ({
        ...submilestone,
        order: index + 1,
      })),
    });
  });
}

export function buildGanttSubmilestoneParentTargets(
  milestones: ProposalGanttMilestoneDraft[],
  milestoneId: string
): SubmilestoneParentTarget[] {
  const rows = proposalMilestonesToGanttSubmilestoneRows(milestones);
  const sourceRow = rows.find((row) => row.id === milestoneId);
  if (!sourceRow) {
    return [];
  }
  const sourceParentRows = rows.filter(
    (row) => row.milestoneKey === sourceRow.milestoneKey
  );
  const sourceNeedsOneSubmilestone = sourceParentRows.length <= 1;

  return sortedMilestones(milestones)
    .filter((milestone) => milestone.key !== sourceRow.milestoneKey)
    .map((milestone) => ({
      disabled: sourceNeedsOneSubmilestone,
      id: milestone.key,
      label: milestone.name,
      reason: sourceNeedsOneSubmilestone
        ? "Parent needs at least one sub-milestone"
        : undefined,
    }));
}

export function moveGanttSubmilestoneToParent(
  milestones: ProposalGanttMilestoneDraft[],
  sourceRowId: string,
  targetParentKey: string
) {
  return prepareGanttSubmilestoneParentMove(
    milestones,
    sourceRowId,
    targetParentKey
  ).milestones;
}

function prepareGanttSubmilestoneParentMove(
  milestones: ProposalGanttMilestoneDraft[],
  sourceRowId: string,
  targetParentKey: string
): { milestones: ProposalGanttMilestoneDraft[]; movedRowId?: string } {
  const rows = proposalMilestonesToGanttSubmilestoneRows(milestones);
  const sourceRow = rows.find((row) => row.id === sourceRowId);
  const targetMilestone = milestones.find(
    (milestone) => milestone.key === targetParentKey
  );
  if (!(sourceRow && targetMilestone)) {
    return { milestones };
  }
  if (sourceRow.milestoneKey === targetParentKey) {
    return { milestones, movedRowId: sourceRowId };
  }
  const sourceRows = rows.filter(
    (row) => row.milestoneKey === sourceRow.milestoneKey
  );
  if (sourceRows.length <= 1) {
    return { milestones, movedRowId: sourceRowId };
  }
  const targetRows = rows.filter((row) => row.milestoneKey === targetParentKey);
  const movedSubmilestoneKey = uniqueSubmilestoneKey(
    sourceRow.submilestoneKey,
    new Set(targetRows.map((row) => row.submilestoneKey))
  );
  const movedSubmilestone = materializeGanttSubmilestoneRow(
    sourceRow,
    movedSubmilestoneKey
  );
  const movedRowId = ganttSubmilestoneRowId(
    targetParentKey,
    movedSubmilestoneKey
  );

  return {
    milestones: milestones.map((milestone) => {
      if (milestone.key === sourceRow.milestoneKey) {
        return normalizeMilestoneFromSubmilestones(
          {
            ...milestone,
            submilestones: sourceRows
              .filter((row) => row.id !== sourceRowId)
              .map((row, index) => ({
                ...materializeGanttSubmilestoneRow(row),
                order: index + 1,
              })),
          },
          { fitToSubmilestoneBounds: true }
        );
      }
      if (milestone.key === targetParentKey) {
        return normalizeMilestoneFromSubmilestones(
          {
            ...milestone,
            submilestones: [
              ...targetRows.map((row, index) => ({
                ...materializeGanttSubmilestoneRow(row),
                order: index + 1,
              })),
              {
                ...movedSubmilestone,
                order: targetRows.length + 1,
              },
            ],
          },
          { fitToSubmilestoneBounds: true }
        );
      }
      return milestone;
    }),
    movedRowId,
  };
}

function materializeGanttSubmilestoneRow(
  row: ProposalGanttSubmilestoneRow,
  key = row.submilestoneKey
): ProposalGanttSubmilestoneDraft {
  return {
    ...row.submilestone,
    budgetCents: row.budgetCents,
    durationDays: row.durationDays,
    key,
    startDay: row.dayStart,
  };
}

function normalizeMilestoneFromSubmilestones(
  milestone: ProposalGanttMilestoneDraft,
  options: { fitToSubmilestoneBounds?: boolean } = {}
) {
  const submilestones = submilestonesForMilestone(milestone).map(
    (submilestone, index) => ({
      ...submilestone,
      durationDays: Math.max(1, Math.round(submilestone.durationDays ?? 1)),
      order: index + 1,
    })
  );
  const budgetCents = submilestones.reduce(
    (total, submilestone) =>
      total + Math.max(0, Math.round(submilestone.budgetCents ?? 0)),
    0
  );
  let cursor = milestone.dayStart;
  let largestSubmilestoneEnd = milestone.dayStart;
  let earliestSubmilestoneStart = Number.POSITIVE_INFINITY;
  const scheduledSubmilestones = submilestones.map((submilestone) => {
    const startDay =
      submilestone.startDay === undefined
        ? cursor
        : Math.max(0, Math.round(submilestone.startDay));
    const durationDays = Math.max(
      1,
      Math.round(submilestone.durationDays ?? 1)
    );
    const endDay = startDay + durationDays;
    cursor = endDay;
    largestSubmilestoneEnd = Math.max(largestSubmilestoneEnd, endDay);
    earliestSubmilestoneStart = Math.min(earliestSubmilestoneStart, startDay);
    return {
      ...submilestone,
      durationDays,
      startDay,
    };
  });
  const dayStart =
    options.fitToSubmilestoneBounds &&
    Number.isFinite(earliestSubmilestoneStart)
      ? earliestSubmilestoneStart
      : milestone.dayStart;
  const durationDays = options.fitToSubmilestoneBounds
    ? Math.max(1, largestSubmilestoneEnd - dayStart)
    : Math.max(
        Math.max(1, Math.round(milestone.durationDays)),
        largestSubmilestoneEnd - milestone.dayStart
      );
  return {
    ...milestone,
    budgetCents: budgetCents || milestone.budgetCents,
    dayEnd: dayStart + durationDays,
    dayStart,
    durationDays,
    submilestones: scheduledSubmilestones,
  };
}

function shiftMilestoneDays(
  milestone: ProposalGanttMilestoneDraft,
  deltaDays: number
) {
  const nextDayStart = Math.max(0, milestone.dayStart + deltaDays);
  const durationDays = Math.max(1, milestone.dayEnd - milestone.dayStart);
  return {
    ...milestone,
    dayEnd: nextDayStart + durationDays,
    dayStart: nextDayStart,
    durationDays,
    submilestones: milestone.submilestones.map((submilestone) => ({
      ...submilestone,
      ...(submilestone.startDay === undefined
        ? {}
        : { startDay: Math.max(0, submilestone.startDay + deltaDays) }),
    })),
  };
}

function submilestonesForMilestone(
  milestone: ProposalGanttMilestoneDraft
): ProposalGanttSubmilestoneDraft[] {
  const rows = milestone.submilestones.length
    ? milestone.submilestones
    : [
        {
          budgetCents: milestone.budgetCents,
          durationDays: milestone.durationDays,
          key: `${milestone.key}-scope`,
          name: milestone.name,
          order: 1,
          startDay: milestone.dayStart,
        },
      ];
  return [...rows].sort(
    (left, right) =>
      left.order - right.order || left.key.localeCompare(right.key)
  );
}

function resolveParentMilestoneKey(
  ganttMilestoneId: string,
  milestones: ProposalGanttMilestoneDraft[]
) {
  if (milestones.some((milestone) => milestone.key === ganttMilestoneId)) {
    return ganttMilestoneId;
  }
  const [parentKey] = ganttMilestoneId.split("::");
  return parentKey &&
    milestones.some((milestone) => milestone.key === parentKey)
    ? parentKey
    : undefined;
}

function firstSubmilestoneRowId(
  milestoneKey: string,
  milestones: ProposalGanttMilestoneDraft[]
) {
  return proposalMilestonesToGanttSubmilestoneRows(milestones).find(
    (row) => row.milestoneKey === milestoneKey
  )?.id;
}

function lastSubmilestoneRowId(
  milestoneKey: string,
  milestones: ProposalGanttMilestoneDraft[]
) {
  return proposalMilestonesToGanttSubmilestoneRows(milestones)
    .filter((row) => row.milestoneKey === milestoneKey)
    .at(-1)?.id;
}

function ganttSubmilestoneRowId(milestoneKey: string, submilestoneKey: string) {
  return `${milestoneKey}::${submilestoneKey}`;
}

function allocateIntegerTotal(total: number, weights: number[]) {
  if (weights.length === 0) {
    return [];
  }
  const normalizedTotal = Math.max(0, Math.round(total));
  if (normalizedTotal === 0) {
    return weights.map(() => 0);
  }
  const normalizedWeights = weights.map((weight) =>
    Math.max(1, Math.round(weight))
  );
  const weightTotal = normalizedWeights.reduce(
    (sum, weight) => sum + weight,
    0
  );
  const floors = normalizedWeights.map((weight) =>
    Math.floor((normalizedTotal * weight) / weightTotal)
  );
  let remainder =
    normalizedTotal - floors.reduce((sum, value) => sum + value, 0);
  const ranked = normalizedWeights
    .map((weight, index) => ({
      index,
      remainder: (normalizedTotal * weight) / weightTotal - floors[index]!,
    }))
    .sort(
      (left, right) =>
        right.remainder - left.remainder || left.index - right.index
    );
  for (const row of ranked) {
    if (remainder <= 0) {
      break;
    }
    floors[row.index] = (floors[row.index] ?? 0) + 1;
    remainder -= 1;
  }
  return floors;
}

function fitDurationsToTotal(durations: number[], total: number) {
  if (durations.length === 0) {
    return [];
  }
  const target = Math.max(durations.length, Math.round(total));
  return allocateIntegerTotal(target, durations).map((duration) =>
    Math.max(1, duration)
  );
}

function defaultDrawRows(
  milestones: ProposalGanttMilestoneDraft[],
  borrowerCoPayBps: number
): ProposalGanttDrawDraft[] {
  return sortedMilestones(milestones).map((milestone, index) => ({
    amountCents: calculateDrawAvailabilityCents(
      milestone.budgetCents,
      borrowerCoPayBps
    ),
    drawKey: `draw-${String(index + 1).padStart(2, "0")}`,
    label: `${milestone.name} reimbursement draw`,
    milestoneKey: milestone.key,
    order: index + 1,
    timingDay: milestone.dayEnd,
  }));
}

function buildSubmilestoneDependencies(
  milestones: ProposalGanttMilestoneDraft[]
): MilestoneDependency[] {
  return sortedMilestones(milestones).flatMap((milestone) =>
    milestone.dependencyKeys.flatMap((dependencyKey) => {
      const fromMilestoneId = lastSubmilestoneRowId(dependencyKey, milestones);
      const toMilestoneId = firstSubmilestoneRowId(milestone.key, milestones);
      if (!(fromMilestoneId && toMilestoneId)) {
        return [];
      }
      return [
        {
          fromMilestoneId,
          hardness: "hard" as DependencyHardness,
          id: `${dependencyKey}->${milestone.key}`,
          isSystem: false,
          toMilestoneId,
          type: "hard_blocker",
        },
      ];
    })
  );
}

function buildProposalGanttIssues({
  dismissedIssueKeys,
  drawGroups,
  milestones,
}: {
  dismissedIssueKeys: Set<string>;
  drawGroups: DerivedProposalDrawGroup[];
  milestones: ProposalGanttMilestoneDraft[];
}): WorkspaceIssue[] {
  const issues: WorkspaceIssue[] = [];
  const milestoneKeys = new Set(milestones.map((milestone) => milestone.key));
  for (const milestone of milestones) {
    if (milestone.dayEnd <= milestone.dayStart) {
      issues.push(
        issueRow({
          code: "invalid_milestone_window",
          id: `invalid-window-${milestone.key}`,
          message: `${milestone.name} must end after it starts.`,
          milestoneIds: [milestone.key],
          severity: "blocking",
          title: "Invalid milestone window",
        })
      );
    }
    for (const dependencyKey of milestone.dependencyKeys) {
      if (!milestoneKeys.has(dependencyKey)) {
        issues.push(
          issueRow({
            code: "missing_dependency",
            id: `missing-dependency-${milestone.key}-${dependencyKey}`,
            message: `${milestone.name} references missing dependency ${dependencyKey}.`,
            milestoneIds: [milestone.key],
            severity: "blocking",
            title: "Missing dependency",
          })
        );
      }
    }
  }
  for (const drawGroup of drawGroups) {
    if (drawGroup.amountCents > drawGroup.drawAvailabilityCents) {
      const overageCents =
        drawGroup.amountCents - drawGroup.drawAvailabilityCents;
      issues.push(
        issueRow({
          code: "draw_amount_exceeds_availability",
          drawGroupIds: [drawGroup.draw.drawKey],
          id: `draw-over-availability-${drawGroup.draw.drawKey}`,
          message: `${drawGroup.draw.label} exceeds current draw availability by ${formatCents(overageCents)} to keep cash on hand non-negative.`,
          severity: "warning",
          title: "Draw exceeds availability",
        })
      );
    }
    if (drawGroup.submilestones.length === 0) {
      issues.push(
        issueRow({
          code: "draw_group_without_submilestones",
          drawGroupIds: [drawGroup.draw.drawKey],
          id: `draw-group-empty-${drawGroup.draw.drawKey}`,
          message: `${drawGroup.draw.label} has no sub-milestones in its derived group.`,
          severity: "warning",
          title: "No sub-milestones",
        })
      );
    }
  }

  return issues.filter(
    (issue) => !dismissedIssueKeys.has(`${issue.id}:${issue.conditionHash}`)
  );
}

function issueRow(input: {
  code: string;
  drawGroupIds?: string[];
  id: string;
  message: string;
  milestoneIds?: string[];
  severity: WorkspaceIssue["severity"];
  title: string;
}): WorkspaceIssue {
  return {
    code: input.code,
    conditionHash: input.id,
    dependencyIds: [],
    dismissible: true,
    dismissed: false,
    drawGroupIds: input.drawGroupIds ?? [],
    id: input.id,
    impact: input.message,
    message: input.message,
    milestoneIds: input.milestoneIds ?? [],
    quickFix: {
      action: "openMilestoneEditor",
      label: "Open",
      targetId: input.milestoneIds?.[0],
    },
    scope: input.drawGroupIds?.length ? "drawGroup" : "milestone",
    severity: input.severity,
    title: input.title,
  };
}

function buildProposalOptimizationPlans({
  borrowerWorkingCapitalLimitCents,
  drawGroups,
  lenderDrawPolicyLimitCents,
  milestones,
}: {
  activePlanId: OptimizationPlanId;
  borrowerWorkingCapitalLimitCents: number;
  drawGroups: DrawGroup[];
  lenderDrawPolicyLimitCents: number;
  milestones: ProposalGanttMilestoneDraft[];
}): OptimizationPlan[] {
  const durationDays = Math.max(
    1,
    ...milestones.map((milestone) => milestone.dayEnd)
  );
  const totalFees = drawGroups.length * DRAW_FEE_DOLLARS;
  const peakWorkingCapital = Math.max(
    centsToDollars(borrowerWorkingCapitalLimitCents),
    ...drawGroups.map((drawGroup) => drawGroup.totalExposure)
  );
  const principalDollars = centsToDollars(lenderDrawPolicyLimitCents);
  return [
    {
      durationDays,
      id: "cheapestFeasible",
      label: "Cheapest Feasible",
      peakWorkingCapital,
      projectedInterest: Math.round(principalDollars * 0.025),
      summary:
        "Uses the fewest derived reimbursement draw boundaries currently staged.",
      totalFees,
      warning: "Lowest fee count may increase borrower carrying pressure.",
    },
    {
      durationDays: Math.max(1, Math.round(durationDays * 0.85)),
      id: "fastest",
      label: "Fastest",
      peakWorkingCapital: Math.round(peakWorkingCapital * 1.15),
      projectedInterest: Math.round(principalDollars * 0.02),
      summary:
        "Compresses feasible milestone windows while preserving dependencies.",
      totalFees,
      warning:
        "May require more borrower working capital before reimbursement.",
    },
    {
      durationDays,
      id: "capitalConstrained",
      label: "Capital-Constrained",
      peakWorkingCapital: centsToDollars(borrowerWorkingCapitalLimitCents),
      projectedInterest: Math.round(principalDollars * 0.022),
      summary:
        "Keeps derived draw groups aligned to the borrower working capital limit.",
      totalFees,
      warning: "Ready to save into the Build Proposal draft package.",
    },
  ];
}

function buildDraftAuditEvents(
  milestones: ProposalGanttMilestoneDraft[],
  drawGroups: DrawGroup[]
): AuditEvent[] {
  return [
    {
      actor: "proposal_editor",
      command: "draft.gantt.loaded",
      id: "draft-gantt-loaded",
      message: `${milestones.length} milestones and ${drawGroups.length} derived draw groups loaded.`,
      role: "builderLead",
      timestamp: new Date().toISOString(),
      type: "milestoneChanged",
    },
  ];
}

function buildDraftOutboxEvents(
  milestones: ProposalGanttMilestoneDraft[],
  drawGroups: DrawGroup[]
): OutboxEvent[] {
  return [
    {
      eventType: "proposal.draft.gantt_ready",
      id: "draft-gantt-outbox",
      payloadPreview: JSON.stringify({
        drawGroups: drawGroups.length,
        milestones: milestones.length,
      }),
      relatedEntity: "buildProposal",
      status: "draft",
      timestamp: new Date().toISOString(),
    },
  ];
}

function sortDrawsByBoundary(
  draws: ProposalGanttDrawDraft[],
  milestones: ProposalGanttMilestoneDraft[]
) {
  return [...draws]
    .filter((draw) => draw.drawKey.trim().length > 0)
    .sort((left, right) => {
      const leftBoundary = resolveDrawBoundaryIndex(left, milestones);
      const rightBoundary = resolveDrawBoundaryIndex(right, milestones);
      return (
        leftBoundary - rightBoundary ||
        (left.order ?? 0) - (right.order ?? 0) ||
        left.drawKey.localeCompare(right.drawKey)
      );
    });
}

export async function syncMilestonesToProductionTimeline({
  createMilestone,
  deleteMilestone,
  nextMilestones,
  previousMilestones,
  proposalId,
  updateMilestone,
  workosOrganizationId,
}: {
  createMilestone: (input: any) => Promise<unknown>;
  deleteMilestone: (input: any) => Promise<unknown>;
  nextMilestones: ProposalGanttMilestoneDraft[];
  previousMilestones: ProposalGanttMilestoneDraft[];
  proposalId: Id<"buildProposals">;
  updateMilestone: (input: any) => Promise<unknown>;
  workosOrganizationId: string;
}) {
  const previousByKey = new Map(
    previousMilestones.map((milestone) => [milestone.key, milestone])
  );
  const nextByKey = new Map(
    nextMilestones.map((milestone) => [milestone.key, milestone])
  );

  for (const previous of previousMilestones) {
    if (!nextByKey.has(previous.key)) {
      await deleteMilestone({
        milestoneKey: previous.key,
        proposalId,
        workosOrganizationId,
      });
    }
  }

  for (const milestone of nextMilestones) {
    const previous = previousByKey.get(milestone.key);
    if (!previous) {
      await createMilestone({
        milestone: productionTimelineMilestoneInputFromDraft(milestone),
        proposalId,
        workosOrganizationId,
      });
      continue;
    }
    const patch = productionTimelineMilestonePatch(previous, milestone);
    if (Object.keys(patch).length > 0) {
      await updateMilestone({
        ...patch,
        milestoneKey: milestone.key,
        proposalId,
        workosOrganizationId,
      });
    }
  }
}

async function syncDrawsToProductionTimeline({
  createDraw,
  deleteDraw,
  nextDraws,
  previousDraws,
  proposalId,
  updateDraw,
  workosOrganizationId,
}: {
  createDraw: (input: any) => Promise<unknown>;
  deleteDraw: (input: any) => Promise<unknown>;
  nextDraws: ProposalGanttDrawDraft[];
  previousDraws: ProposalGanttDrawDraft[];
  proposalId: Id<"buildProposals">;
  updateDraw: (input: any) => Promise<unknown>;
  workosOrganizationId: string;
}) {
  const previousByKey = new Map(
    previousDraws.map((draw) => [draw.drawKey, draw])
  );
  const nextByKey = new Map(nextDraws.map((draw) => [draw.drawKey, draw]));

  for (const previous of previousDraws) {
    if (!nextByKey.has(previous.drawKey)) {
      await deleteDraw({
        drawKey: previous.drawKey,
        proposalId,
        workosOrganizationId,
      });
    }
  }

  for (const draw of nextDraws) {
    const previous = previousByKey.get(draw.drawKey);
    if (!previous) {
      await createDraw({
        amountCents: draw.amountCents,
        customDate: draw.customDate ?? true,
        drawKey: draw.drawKey,
        itemMilestoneKey: draw.milestoneKey,
        label: draw.label,
        order: draw.order,
        proposalId,
        workosOrganizationId,
        x: draw.timingDay,
      });
      continue;
    }
    const patch = productionTimelineDrawPatch(previous, draw);
    if (Object.keys(patch).length > 0) {
      await updateDraw({
        ...patch,
        drawKey: draw.drawKey,
        proposalId,
        workosOrganizationId,
      });
    }
  }
}

function productionTimelineMilestoneInputFromDraft(
  milestone: ProposalGanttMilestoneDraft
) {
  return {
    budgetCents: milestone.budgetCents,
    dayEnd: milestone.dayEnd,
    dayStart: milestone.dayStart,
    dependencyKeys: milestone.dependencyKeys,
    durationDays: milestone.durationDays,
    evidenceState: "Draft package",
    ...(milestone.icon ? { icon: milestone.icon } : {}),
    markerLabel: String(milestone.order),
    milestoneKey: milestone.key,
    name: milestone.name,
    order: milestone.order,
    policyState: "Draft policy review",
    submilestones: milestone.submilestones,
    x: milestone.dayStart,
  };
}

function productionTimelineMilestonePatch(
  previous: ProposalGanttMilestoneDraft,
  next: ProposalGanttMilestoneDraft
) {
  return {
    ...(previous.budgetCents === next.budgetCents
      ? {}
      : { budgetCents: next.budgetCents }),
    ...(previous.dayEnd === next.dayEnd ? {} : { dayEnd: next.dayEnd }),
    ...(previous.dayStart === next.dayStart ? {} : { dayStart: next.dayStart }),
    ...(sameStringArray(previous.dependencyKeys, next.dependencyKeys)
      ? {}
      : { dependencyKeys: next.dependencyKeys }),
    ...(previous.durationDays === next.durationDays
      ? {}
      : { durationDays: next.durationDays }),
    ...(previous.icon === next.icon || next.icon === undefined
      ? {}
      : { icon: next.icon }),
    ...(previous.name === next.name ? {} : { name: next.name }),
    ...(previous.order === next.order ? {} : { order: next.order }),
    ...(sameSubmilestones(previous.submilestones, next.submilestones)
      ? {}
      : { submilestones: next.submilestones }),
  };
}

function productionTimelineDrawPatch(
  previous: ProposalGanttDrawDraft,
  next: ProposalGanttDrawDraft
) {
  const patch = {
    ...(previous.amountCents === next.amountCents
      ? {}
      : { amountCents: next.amountCents }),
    ...(previous.label === next.label ? {} : { label: next.label }),
    ...(previous.milestoneKey === next.milestoneKey ||
    next.milestoneKey === undefined
      ? {}
      : { itemMilestoneKey: next.milestoneKey }),
    ...(previous.order === next.order ? {} : { order: next.order }),
    ...(previous.timingDay === next.timingDay ? {} : { x: next.timingDay }),
  };
  return Object.keys(patch).length === 0
    ? patch
    : { ...patch, customDate: true };
}

function sameStringArray(left: string[], right: string[]) {
  return (
    left.length === right.length &&
    left.every((value, index) => value === right[index])
  );
}

function sameSubmilestones(
  left: ProposalGanttSubmilestoneDraft[],
  right: ProposalGanttSubmilestoneDraft[]
) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function normalizeProposalStatus(
  status: string
): "draft" | "submitted" | "approved" | "closed" {
  if (
    status === "draft" ||
    status === "submitted" ||
    status === "approved" ||
    status === "closed"
  ) {
    return status;
  }
  return "submitted";
}

function resolveDrawBoundaryIndex(
  draw: ProposalGanttDrawDraft,
  milestones: ProposalGanttMilestoneDraft[]
) {
  const byMilestone = draw.milestoneKey
    ? milestones.findIndex((milestone) => milestone.key === draw.milestoneKey)
    : -1;
  if (byMilestone >= 0) {
    return byMilestone;
  }
  let byTimingDay = -1;
  for (let index = milestones.length - 1; index >= 0; index -= 1) {
    if (milestones[index]!.dayEnd <= draw.timingDay) {
      byTimingDay = index;
      break;
    }
  }
  return byTimingDay >= 0 ? byTimingDay : milestones.length - 1;
}

function normalizeMilestoneOrders(milestones: ProposalGanttMilestoneDraft[]) {
  return sortedMilestones(milestones).map((milestone, index) => ({
    ...milestone,
    dayEnd: Math.max(milestone.dayStart + 1, Math.round(milestone.dayEnd)),
    dayStart: Math.max(0, Math.round(milestone.dayStart)),
    durationDays: Math.max(
      1,
      Math.round(
        milestone.durationDays || milestone.dayEnd - milestone.dayStart
      )
    ),
    order: index + 1,
    submilestones: milestone.submilestones.map((submilestone, subIndex) => ({
      ...submilestone,
      order: submilestone.order ?? subIndex + 1,
    })),
  }));
}

function sortedMilestones(milestones: ProposalGanttMilestoneDraft[]) {
  return [...milestones].sort(
    (left, right) =>
      left.order - right.order || left.key.localeCompare(right.key)
  );
}

function indexOfSubmilestoneRow(
  rows: ProposalGanttSubmilestoneRow[],
  milestoneKey: string | undefined,
  submilestoneKey: string | undefined
) {
  return Math.max(
    0,
    rows.findIndex(
      (row) =>
        row.milestoneKey === milestoneKey &&
        (submilestoneKey === undefined ||
          row.submilestoneKey === submilestoneKey)
    )
  );
}

function calculateDrawAvailabilityCents(
  budgetCents: number,
  borrowerCoPayBps: number
) {
  const reimbursableBps = Math.max(
    0,
    Math.min(10_000, 10_000 - borrowerCoPayBps)
  );
  return Math.max(0, Math.round((budgetCents * reimbursableBps) / 10_000));
}

function uniqueMilestoneKey(
  name: string,
  milestones: ProposalGanttMilestoneDraft[]
) {
  const existing = new Set(milestones.map((milestone) => milestone.key));
  const base = slugify(name) || "milestone";
  let key = base;
  let index = 2;
  while (existing.has(key)) {
    key = `${base}-${index}`;
    index += 1;
  }
  return key;
}

function uniqueSubmilestoneKey(baseKey: string, existing: Set<string>) {
  if (!existing.has(baseKey)) {
    return baseKey;
  }
  let index = 2;
  let key = `${baseKey}-${index}`;
  while (existing.has(key)) {
    index += 1;
    key = `${baseKey}-${index}`;
  }
  return key;
}

function uniqueDrawKey(milestoneKey: string, draws: ProposalGanttDrawDraft[]) {
  const existing = new Set(draws.map((draw) => draw.drawKey));
  const base = `${milestoneKey}-draw`;
  let key = base;
  let index = 2;
  while (existing.has(key)) {
    key = `${base}-${index}`;
    index += 1;
  }
  return key;
}

function slugify(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function proposalBaseDateFromIso(value?: string) {
  if (!value) {
    return BASE_DATE;
  }
  try {
    return localDateFromIsoDate(value);
  } catch {
    return BASE_DATE;
  }
}

function dateFromDay(day: number, baseDate = BASE_DATE) {
  return addDays(baseDate, Math.round(day));
}

function dayFromDate(date: Date, baseDate = BASE_DATE) {
  return differenceInDays(date, baseDate);
}

function centsToDollars(cents: number) {
  return Math.round(cents) / 100;
}

function formatCents(cents: number) {
  return new Intl.NumberFormat("en-US", {
    currency: "USD",
    maximumFractionDigits: 0,
    style: "currency",
  }).format(centsToDollars(cents));
}

function dollarsToCents(dollars: number) {
  return Math.max(0, Math.round(dollars * 100));
}
