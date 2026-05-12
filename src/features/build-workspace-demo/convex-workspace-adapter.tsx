import { useMutation, useQuery } from "convex/react";
import { useEffect, useMemo, useState } from "react";

import { api } from "../../../convex/_generated/api";
import type {
  AddMilestoneInput,
  AuditEvent,
  BuildWorkspaceAdapter,
  DependencyHardness,
  DrawGroup,
  DrawStatus,
  EvidenceStatus,
  Milestone,
  MilestoneDependency,
  MilestonePatch,
  OptimizationPlan,
  OptimizationPlanId,
  OutboxEvent,
  SiteVisitReportDraft,
  WorkspaceIssue,
  WorkspaceMode,
  WorkspaceRole,
} from "./types";

const EMPTY_WORKSPACE = {
  auditEvents: [],
  build: {
    borrowerName: "Harbor & Pine Builders",
    buildName: "Maple Ridge Townhomes",
    lenderName: "FairLend Construction Capital",
    organizationId: "org_fairlend_demo",
    phaseLabel: "DrawFlow demo",
    proposalStatus: "draft" as const,
    siteAddress: "Hamilton, ON",
  },
  budget: {
    borrowerWorkingCapitalLimit: 260_000,
    drawFeeBps: 0,
    interestRatePct: 12,
    lenderDrawPolicyLimit: 480_000,
    requestedLoanAmount: 1_963_000,
    totalBuildBudget: 1_963_000,
    version: 1,
  },
  dependencies: [],
  drawGroups: [],
  isLoading: true,
  issues: [],
  compilationStatus: "upToDate" as const,
  milestones: [],
  needsSeed: false,
  optimizationPlans: [],
  outboxEvents: [],
  selectedMilestoneId: "",
  validationErrors: [],
  validationWarnings: [],
};

const dollars = (cents = 0) => Math.round(cents / 100);
const cents = (dollarsValue = 0) => Math.round(dollarsValue * 100);
const isoDate = (date: Date) => date.toISOString().slice(0, 10);
const isoDateTime = (value?: number) =>
  typeof value === "number" ? new Date(value).toISOString() : undefined;

function mapMilestoneStatus(
  mode: WorkspaceMode,
  milestone: any
): Milestone["status"] {
  const status = milestone.displayStatus ?? milestone.status;

  if (mode === "proposal") {
    return milestone.blockingReasons?.length ? "blocked" : "proposed";
  }

  if (status === "completion_approved") {
    return "approved";
  }
  if (status === "claim_submitted") {
    return "underReview";
  }
  if (status === "submitted_for_review") {
    return "underReview";
  }
  if (status === "complete_pending_submission") {
    return "evidenceRequired";
  }
  if (status === "more_information_requested") {
    return "evidenceRequired";
  }
  if (status === "evidence_submitted") {
    return "evidenceSubmitted";
  }
  if (
    status === "in_progress_behind_schedule" ||
    status === "in_progress_on_schedule"
  ) {
    return "inProgress";
  }
  if (status === "capital_blocked" || milestone.blockingReasons?.length) {
    return "blocked";
  }
  return "notStarted";
}

function mapEvidenceStatus(milestone: any): EvidenceStatus {
  if (milestone.evidenceReviewStatus === "accepted") {
    return "accepted";
  }
  if (
    milestone.evidenceReviewStatus === "needs_info" ||
    milestone.evidenceReviewStatus === "more_information"
  ) {
    return "needsInfo";
  }
  if (milestone.evidenceReviewStatus === "submitted") {
    return "submitted";
  }
  if (milestone.latestEvidencePackage?.reviewStatus === "location_unverified") {
    return "locationUnverified";
  }
  if (milestone.evidenceCount > 0) {
    return "draft";
  }
  return "notStarted";
}

function mapDrawStatus(mode: WorkspaceMode, group: any): DrawStatus {
  if (group.status === "release_approved") {
    return "released";
  }
  if (
    mode === "active" &&
    (group.status === "active" || group.status === "partially_eligible")
  ) {
    return "evidencePending";
  }
  if (group.status === "future" || group.status === "blocked") {
    return "blocked";
  }
  return "planned";
}

function actorToRole(actorPersona?: string): WorkspaceRole {
  if (actorPersona === "lender_admin") {
    return "lenderAdmin";
  }
  if (actorPersona === "site_visitor") {
    return "siteVisitor";
  }
  return "builderLead";
}

function roleToPersona(role: WorkspaceRole) {
  if (role === "lenderAdmin") {
    return "lender_admin";
  }
  if (role === "siteVisitor") {
    return "site_visitor";
  }
  return "builder_lead";
}

function mapWorkspace(
  mode: WorkspaceMode,
  workspace: any,
  selectedMilestoneId: string,
  locallyDismissedIssueKeys: Set<string>
) {
  const issues: WorkspaceIssue[] = (workspace?.issues ?? []).map(
    (issue: any) => ({
      code: issue.code,
      conditionHash: issue.conditionHash,
      dependencyIds: issue.dependencyIds ?? [],
      dismissible: Boolean(issue.dismissible),
      dismissed: Boolean(issue.dismissed),
      drawGroupIds: issue.drawGroupIds ?? [],
      id: issue.id,
      impact: issue.impact,
      message: issue.message,
      milestoneIds: issue.milestoneIds ?? [],
      quickFix: issue.quickFix,
      scope: issue.scope,
      severity: issue.severity,
      title: issue.title,
    })
  );
  const visibleIssues = issues.filter(
    (issue) =>
      !(
        issue.dismissed ||
        locallyDismissedIssueKeys.has(`${issue.id}:${issue.conditionHash}`)
      )
  );
  const milestones: Milestone[] = (workspace?.milestones ?? []).map(
    (milestone: any) => {
      const start =
        mode === "active"
          ? milestone.forecastStartDate
          : milestone.plannedStartDate;
      const end =
        mode === "active"
          ? milestone.forecastEndDate
          : milestone.plannedEndDate;
      return {
        actualCost: dollars(milestone.requestedAmountCents ?? 0),
        blockedByKeys: milestone.blockedByKeys ?? [],
        blockingKeys: milestone.blockingKeys ?? [],
        blockingReasons: milestone.blockingReasons ?? [],
        code: milestone.code,
        completionReport: milestone.latestReview?.notes ?? "",
        drawGroupId: milestone.drawGroupKey,
        endAt: new Date(`${end}T12:00:00`),
        estimatedCost: dollars(milestone.approvedValueCents),
        estimatedDurationDays: milestone.durationDays,
        evidenceFiles: (milestone.evidenceFiles ?? []).map((file: any) => ({
          fileName: file.fileName,
          id: file.id,
          isSample: Boolean(file.isSample),
          mimeType: file.mimeType,
          sizeBytes: file.sizeBytes,
          uploadedAt: new Date(file.uploadedAt).toISOString(),
          uploadedByPersona: file.uploadedByPersona,
        })),
        evidencePackages: (milestone.evidencePackages ?? []).map(
          (pkg: any) => ({
            createdAt: new Date(pkg.createdAt).toISOString(),
            frozenAt: isoDateTime(pkg.frozenAt),
            id: pkg._id,
            reviewStatus: pkg.reviewStatus,
            status: pkg.status,
            submittedAt: isoDateTime(pkg.submittedAt),
          })
        ),
        evidenceStatus: mapEvidenceStatus(milestone),
        id: milestone.key,
        isDragLocked: Boolean(milestone.isDragLocked),
        issues: visibleIssues.filter((issue) =>
          issue.milestoneIds.includes(milestone.key)
        ),
        lane: milestone.type ?? milestone.drawGroupKey,
        name: milestone.name,
        notes: (milestone.blockingReasons ?? []).join("; "),
        progress: milestone.progressPercent,
        requestedAmountCents: milestone.requestedAmountCents,
        requiresSiteVisit: Boolean(milestone.requiresSiteVisit),
        reviewReports: (milestone.reviewReports ?? []).map((report: any) => ({
          createdAt: new Date(report.createdAt).toISOString(),
          id: report._id,
          notes: report.notes,
          outcome: report.outcome,
          reviewerPersona: report.reviewerPersona,
        })),
        siteVisitRequested: Boolean(milestone.latestSiteVisit),
        siteVisits: (milestone.siteVisits ?? []).map((visit: any) => ({
          assignedPersona: visit.assignedPersona,
          claimedAt: isoDateTime(visit.claimedAt),
          completedAt: isoDateTime(visit.completedAt),
          completionObserved: visit.completionObserved,
          createdAt: new Date(visit.createdAt).toISOString(),
          id: visit._id,
          notes: visit.notes,
          recommendedOutcome: visit.recommendedOutcome,
          riskFlags: visit.riskFlags ?? [],
          status: visit.status,
        })),
        staffRecommendation: milestone.latestReview?.outcome ?? "",
        startAt: new Date(`${start}T12:00:00`),
        status: mapMilestoneStatus(mode, milestone),
        warningCount:
          visibleIssues.filter((issue) =>
            issue.milestoneIds.includes(milestone.key)
          ).length + (milestone.blockingReasons?.length ?? 0),
      };
    }
  );

  const drawGroups: DrawGroup[] = (workspace?.drawGroups ?? []).map(
    (group: any) => ({
      amount: dollars(group.approvedValueCents),
      endAt: new Date(`${group.endDate}T12:00:00`),
      eligibleAt: new Date(`${group.eligibleDate ?? group.endDate}T12:00:00`),
      id: group.key,
      label: group.label,
      order: group.order,
      rowIndex: Math.max(0, (group.firstRow ?? group.order) - 1),
      rowSpan: Math.max(
        1,
        (group.lastRow ?? group.order) - (group.firstRow ?? group.order) + 1
      ),
      startAt: new Date(`${group.startDate}T12:00:00`),
      status: mapDrawStatus(mode, group),
      totalExposure: dollars(group.requestedValueCents),
      warningState: visibleIssues.some(
        (issue) =>
          issue.drawGroupIds.includes(group.key) &&
          issue.severity === "blocking"
      )
        ? "critical"
        : visibleIssues.some((issue) =>
              issue.drawGroupIds.includes(group.key)
            ) || group.status === "active"
          ? "warning"
          : "clear",
      issues: visibleIssues.filter((issue) =>
        issue.drawGroupIds.includes(group.key)
      ),
    })
  );

  const dependencies: MilestoneDependency[] = (
    workspace?.dependencies ?? []
  ).map((dependency: any) => ({
    fromMilestoneId: dependency.blockerKey,
    hardness: dependency.type === "soft_dependency" ? "soft" : "hard",
    id: dependency._id,
    isSystem: dependency.isSystem,
    toMilestoneId: dependency.blockedKey,
    type: dependency.type,
  }));

  const summary = workspace?.summary ?? {};
  const latestRun = workspace?.latestPlanningRun;
  const optimizationPlans: OptimizationPlan[] = [
    {
      durationDays: 365,
      id: "cheapestFeasible",
      label: "Cheapest Feasible",
      peakWorkingCapital: dollars(summary.workingCapitalLimitCents),
      projectedInterest: dollars(summary.interestEstimateCents),
      summary: "Lowest fee count while respecting lender policy.",
      totalFees: dollars(summary.drawFeesCents),
      warning: summary.validationWarnings?.[0] ?? "No current warnings.",
    },
    {
      durationDays: 300,
      id: "fastest",
      label: "Fastest",
      peakWorkingCapital: dollars(summary.projectedCapitalDrawnCents),
      projectedInterest: dollars(summary.interestEstimateCents),
      summary: "Compresses eligible work where dependencies allow.",
      totalFees: dollars(summary.drawFeesCents),
      warning: "May increase borrower working-capital pressure.",
    },
    {
      durationDays: latestRun?.recommendedDrawCount
        ? latestRun.recommendedDrawCount * 30
        : 330,
      id: "capitalConstrained",
      label: "Capital-Constrained",
      peakWorkingCapital: dollars(summary.workingCapitalLimitCents),
      projectedInterest: dollars(
        latestRun?.interestEstimateCents ?? summary.interestEstimateCents
      ),
      summary: "Keeps draw groups inside the CAD $260k working-capital cap.",
      totalFees: dollars(summary.drawFeesCents),
      warning: summary.validationErrors?.length
        ? `${summary.validationErrors.length} blockers before submit.`
        : "Ready for proposal submission.",
    },
  ];

  return {
    auditEvents: (workspace?.auditEvents ?? []).map(
      (event: any): AuditEvent => ({
        actor: event.actorPersona,
        command: event.command,
        id: event._id,
        message: event.eventType,
        reason: event.reason ?? event.afterSummary,
        role: actorToRole(event.actorPersona),
        timestamp: new Date(event.createdAt).toISOString(),
        type:
          event.entityType === "dependency"
            ? "dependencyChanged"
            : event.entityType === "draw_group"
              ? "drawChanged"
              : event.entityType === "evidence"
                ? "evidenceChanged"
                : event.eventType?.includes("ProposalSubmitted")
                  ? "proposalSubmitted"
                  : "milestoneChanged",
      })
    ),
    build: {
      borrowerName: "Harbor & Pine Builders",
      buildName: workspace?.build?.name ?? "Maple Ridge Townhomes",
      lenderName: "FairLend Construction Capital",
      organizationId: "org_fairlend_demo",
      phaseLabel:
        mode === "active"
          ? "Active reimbursement workspace"
          : "Build Proposal / Roadmap Draft",
      proposalStatus:
        workspace?.build?.status === "submitted"
          ? ("submitted" as const)
          : ("draft" as const),
      siteAddress: "Hamilton, ON",
    },
    budget: {
      borrowerWorkingCapitalLimit: dollars(
        workspace?.build?.workingCapitalLimitCents
      ),
      drawFeeBps: 0,
      interestRatePct: (workspace?.build?.interestAnnualBps ?? 1200) / 100,
      lenderDrawPolicyLimit: dollars(
        workspace?.build?.lenderDrawPolicyLimitCents
      ),
      requestedLoanAmount: dollars(summary.approvedProjectValueCents),
      totalBuildBudget: dollars(summary.approvedProjectValueCents),
      version: workspace?.build?.seedVersion ?? 1,
    },
    dependencies,
    drawGroups,
    issues: visibleIssues,
    latestPlanningRun: latestRun,
    milestones,
    optimizationPlans,
    outboxEvents: (workspace?.outboxEvents ?? []).map(
      (event: any): OutboxEvent => ({
        eventType: event.eventType,
        id: event._id,
        payloadPreview: event.payloadPreview,
        relatedEntity: event.relatedEntity,
        status: event.status,
        timestamp: new Date(event.createdAt).toISOString(),
      })
    ),
    selectedMilestoneId: selectedMilestoneId || milestones[0]?.id || "",
    terminalMessage:
      workspace?.build?.status === "submitted"
        ? "Proposal submitted for review. Approval workflow is out of scope for this demo."
        : undefined,
    validationErrors: summary.validationErrors ?? [],
    validationWarnings: summary.validationWarnings ?? [],
    compilationStatus:
      mode === "proposal" && (summary.validationErrors ?? []).length > 0
        ? ("blocked" as const)
        : ("upToDate" as const),
  };
}

export function useConvexBuildWorkspace(
  mode: WorkspaceMode
): BuildWorkspaceAdapter {
  const workspace = useQuery(api.demo_drawflow.demo_getWorkspace, {
    scenario: mode,
  });
  const seedDemo = useMutation(api.demo_drawflow.demo_seedDrawFlowDemo);
  const resetDemo = useMutation(api.demo_drawflow.demo_resetDrawFlowDemo);
  const updateProgressMutation = useMutation(
    api.demo_drawflow.demo_updateMilestoneProgress
  );
  const updateForecastMutation = useMutation(
    api.demo_drawflow.demo_updateForecastDatesWithReason
  );
  const batchMoveDatesMutation = useMutation(
    api.demo_drawflow.demo_batchMoveMilestoneDates
  );
  const setDragLockedMutation = useMutation(
    api.demo_drawflow.demo_setMilestoneDragLocked
  );
  const addSampleMutation = useMutation(
    api.demo_drawflow.demo_addSampleEvidence
  );
  const uploadMutation = useMutation(
    api.demo_drawflow.demo_registerUploadedEvidenceMetadata
  );
  const submitClaimMutation = useMutation(
    api.demo_drawflow.demo_submitCompletionClaim
  );
  const reviewEvidenceMutation = useMutation(
    api.demo_drawflow.demo_reviewEvidence
  );
  const requestVisitMutation = useMutation(
    api.demo_drawflow.demo_requestSiteVisit
  );
  const claimVisitMutation = useMutation(api.demo_drawflow.demo_claimSiteVisit);
  const submitVisitMutation = useMutation(
    api.demo_drawflow.demo_submitSiteVisitReport
  );
  const approveMutation = useMutation(
    api.demo_drawflow.demo_approveMilestoneCompletion
  );
  const rejectMutation = useMutation(
    api.demo_drawflow.demo_rejectMilestoneCompletion
  );
  const updateValueMutation = useMutation(
    api.demo_drawflow.demo_updateProposalMilestoneValue
  );
  const updateDurationMutation = useMutation(
    api.demo_drawflow.demo_updateProposalMilestoneDuration
  );
  const updateDatesMutation = useMutation(
    api.demo_drawflow.demo_updateProposalMilestonePlannedDates
  );
  const moveToDrawGroupMutation = useMutation(
    api.demo_drawflow.demo_moveProposalMilestoneToDrawGroup
  );
  const reorderMutation = useMutation(
    api.demo_drawflow.demo_reorderProposalMilestones
  );
  const reorderAbsoluteMutation = useMutation(
    api.demo_drawflow.demo_reorderProposalMilestoneAbsolute
  );
  const addMilestoneMutation = useMutation(
    api.demo_drawflow.demo_addProposalMilestone
  );
  const addDependencyMutation = useMutation(
    api.demo_drawflow.demo_addProposalDependency
  );
  const removeDependencyMutation = useMutation(
    api.demo_drawflow.demo_removeProposalDependency
  );
  const analyzeMutation = useMutation(
    api.demo_drawflow.demo_recomputeProposalPlan
  );
  const applyPlanMutation = useMutation(
    api.demo_drawflow.demo_applyProposalPlanRecommendation
  );
  const splitMutation = useMutation(
    api.demo_drawflow.demo_splitProposalDrawGroup
  );
  const mergeMutation = useMutation(
    api.demo_drawflow.demo_mergeProposalDrawGroups
  );
  const submitProposalMutation = useMutation(
    api.demo_drawflow.demo_submitProposal
  );
  const dismissIssueMutation = useMutation(
    api.demo_drawflow.demo_dismissWorkspaceIssue
  );
  const quickFixMutation = useMutation(
    api.demo_drawflow.demo_applyWorkspaceIssueQuickFix
  );

  const [role, setRole] = useState<WorkspaceRole>("builderLead");
  const [selectedMilestoneId, setSelectedMilestoneId] = useState("");
  const [locallyDismissedIssueKeys, setLocallyDismissedIssueKeys] = useState(
    () => new Set<string>()
  );
  const [activePlanId, setActivePlanId] =
    useState<OptimizationPlanId>("capitalConstrained");

  useEffect(() => {
    if (workspace?.needsSeed) {
      void seedDemo({});
    }
  }, [workspace?.needsSeed, seedDemo]);

  const mapped = useMemo(
    () =>
      mapWorkspace(
        mode,
        workspace,
        selectedMilestoneId,
        locallyDismissedIssueKeys
      ),
    [mode, workspace, selectedMilestoneId, locallyDismissedIssueKeys]
  );

  useEffect(() => {
    if (!selectedMilestoneId && mapped.selectedMilestoneId) {
      setSelectedMilestoneId(mapped.selectedMilestoneId);
    }
  }, [mapped.selectedMilestoneId, selectedMilestoneId]);

  const findDependency = (dependencyId: string) =>
    mapped.dependencies.find((dependency) => dependency.id === dependencyId);

  return {
    ...EMPTY_WORKSPACE,
    ...mapped,
    activePlanId,
    isLoading: workspace === undefined,
    mode,
    needsSeed: Boolean(workspace?.needsSeed),
    role,
    addDependency: async (fromMilestoneId, toMilestoneId, hardness) => {
      await addDependencyMutation({
        blockedKey: toMilestoneId,
        blockerKey: fromMilestoneId,
        dependencyType:
          hardness === "soft" ? "soft_dependency" : "hard_blocker",
      });
    },
    addMilestone: async (input: AddMilestoneInput) => {
      await addMilestoneMutation({
        drawGroupKey: input.drawGroupId,
        durationDays: input.estimatedDurationDays,
        name: input.name,
        plannedStartDate: input.startAt ? isoDate(input.startAt) : undefined,
        valueCents: cents(input.estimatedCost),
      });
    },
    addSampleEvidence: async (milestoneId) => {
      await addSampleMutation({
        milestoneKey: milestoneId,
        persona: roleToPersona(role),
      });
    },
    applyRecommendedPlan: async () => {
      await applyPlanMutation({});
      setActivePlanId("capitalConstrained");
    },
    applyIssueQuickFix: async (issue) => {
      if (!issue.quickFix) {
        return;
      }
      if (issue.quickFix.action === "openMilestoneEditor") {
        setSelectedMilestoneId(
          issue.quickFix.targetId ?? issue.milestoneIds[0] ?? ""
        );
        return;
      }
      if (issue.quickFix.action === "applyRecommendedPlan") {
        await applyPlanMutation({});
        setActivePlanId("capitalConstrained");
        return;
      }
      await quickFixMutation({
        action: issue.quickFix.action,
        issueId: issue.id,
        targetId: issue.quickFix.targetId,
      });
    },
    approveMilestone: async (milestoneId, reason) => {
      await approveMutation({
        milestoneKey: milestoneId,
        overrideReason: reason,
        persona: roleToPersona(role),
      });
    },
    claimSiteVisit: async (milestoneId) => {
      await claimVisitMutation({
        milestoneKey: milestoneId,
        persona: "site_visitor",
      });
    },
    mergeDrawGroups: async (sourceDrawGroupId) => {
      await mergeMutation({ drawGroupKey: sourceDrawGroupId });
    },
    dismissIssue: async (issue, reason) => {
      setLocallyDismissedIssueKeys((current) => {
        const next = new Set(current);
        next.add(`${issue.id}:${issue.conditionHash}`);
        return next;
      });
      await dismissIssueMutation({
        actorPersona: roleToPersona(role),
        conditionHash: issue.conditionHash,
        drawGroupKey: issue.drawGroupIds[0],
        issueCode: issue.code,
        issueId: issue.id,
        milestoneKey: issue.milestoneIds[0],
        reason,
        scenario: mode,
      });
    },
    batchMoveMilestoneDates: async (
      milestoneMoves,
      reason,
      source = "selection",
      sourceId
    ) => {
      if (milestoneMoves.length === 0) {
        return;
      }
      if (mode === "active") {
        const changeReason =
          reason ?? window.prompt("Reason for forecast batch change") ?? "";
        if (!changeReason.trim()) {
          throw new Error("Forecast change reason is required.");
        }
        await batchMoveDatesMutation({
          moves: milestoneMoves.map((move) => ({
            endDate: isoDate(move.endAt ?? move.startAt),
            milestoneKey: move.milestoneId,
            startDate: isoDate(move.startAt),
          })),
          persona: roleToPersona(role),
          reason: changeReason,
          scenario: mode,
          source,
          sourceKey: sourceId,
        });
        return;
      }
      await batchMoveDatesMutation({
        moves: milestoneMoves.map((move) => ({
          endDate: isoDate(move.endAt ?? move.startAt),
          milestoneKey: move.milestoneId,
          startDate: isoDate(move.startAt),
        })),
        persona: roleToPersona(role),
        scenario: mode,
        source,
        sourceKey: sourceId,
      });
    },
    moveMilestoneDates: async (milestoneId, startAt, endAt, reason) => {
      if (mode === "active") {
        const changeReason =
          reason ?? window.prompt("Reason for forecast change") ?? "";
        if (!changeReason.trim()) {
          throw new Error("Forecast change reason is required.");
        }
        await updateForecastMutation({
          forecastEndDate: isoDate(endAt ?? startAt),
          forecastStartDate: isoDate(startAt),
          milestoneKey: milestoneId,
          persona: roleToPersona(role),
          reason: changeReason,
        });
        return;
      }
      await updateDatesMutation({
        milestoneKey: milestoneId,
        plannedEndDate: isoDate(endAt ?? startAt),
        plannedStartDate: isoDate(startAt),
      });
    },
    setMilestoneDragLocked: async (milestoneId, locked) => {
      await setDragLockedMutation({
        locked,
        milestoneKey: milestoneId,
        persona: roleToPersona(role),
        scenario: mode,
      });
    },
    moveMilestoneToDrawGroup: async (milestoneId, drawGroupId) => {
      await moveToDrawGroupMutation({
        drawGroupKey: drawGroupId,
        milestoneKey: milestoneId,
      });
    },
    recomputeProposalPlan: async () => {
      await analyzeMutation({ runType: "explicit" });
    },
    rejectMilestone: async (milestoneId, reason) => {
      await rejectMutation({
        milestoneKey: milestoneId,
        persona: roleToPersona(role),
        reason,
      });
    },
    removeDependency: async (dependencyId) => {
      const dependency = findDependency(dependencyId);
      if (!dependency) {
        return;
      }
      await removeDependencyMutation({
        blockedKey: dependency.toMilestoneId,
        blockerKey: dependency.fromMilestoneId,
      });
    },
    reorderMilestone: async (milestoneId, direction) => {
      await reorderMutation({ direction, milestoneKey: milestoneId });
    },
    reorderMilestoneAbsolute: async (milestoneId, fromIndex, toIndex) => {
      await reorderAbsoluteMutation({
        fromIndex,
        milestoneKey: milestoneId,
        toIndex,
      });
    },
    requestMoreInformation: async (milestoneId, reason) => {
      await reviewEvidenceMutation({
        milestoneKey: milestoneId,
        notes: reason,
        outcome: "more_information",
        persona: roleToPersona(role),
      });
    },
    requestSiteVisit: async (milestoneId, reason) => {
      await requestVisitMutation({
        milestoneKey: milestoneId,
        persona: roleToPersona(role),
        reason,
      });
    },
    resetWorkspace: async () => {
      await resetDemo({});
      setSelectedMilestoneId("");
      setLocallyDismissedIssueKeys(new Set());
      setRole("builderLead");
    },
    reviewEvidence: async (milestoneId, accepted, reason) => {
      await reviewEvidenceMutation({
        milestoneKey: milestoneId,
        notes: reason,
        outcome: accepted ? "accepted" : "more_information",
        persona: roleToPersona(role),
      });
    },
    selectMilestone: setSelectedMilestoneId,
    setActivePlan: setActivePlanId,
    setDependencyHardness: async (
      dependencyId,
      hardness: DependencyHardness
    ) => {
      const dependency = findDependency(dependencyId);
      if (!dependency || dependency.isSystem) {
        throw new Error("System dependencies cannot be changed.");
      }
      await removeDependencyMutation({
        blockedKey: dependency.toMilestoneId,
        blockerKey: dependency.fromMilestoneId,
      });
      await addDependencyMutation({
        blockedKey: dependency.toMilestoneId,
        blockerKey: dependency.fromMilestoneId,
        dependencyType:
          hardness === "soft" ? "soft_dependency" : "hard_blocker",
      });
    },
    setRole,
    splitDrawGroup: async (drawGroupId, afterMilestoneId) => {
      await splitMutation({
        afterMilestoneKey: afterMilestoneId,
        drawGroupKey: drawGroupId,
      });
    },
    submitCompletionClaim: async (milestoneId, requestedAmountCents) => {
      await submitClaimMutation({
        milestoneKey: milestoneId,
        persona: roleToPersona(role),
        requestedAmountCents,
      });
    },
    submitProposal: async () => {
      await submitProposalMutation({});
    },
    submitSiteVisitReport: async (
      milestoneId,
      report: SiteVisitReportDraft
    ) => {
      await submitVisitMutation({
        completionObserved: report.completionObserved,
        milestoneKey: milestoneId,
        notes: report.notes,
        persona: "site_visitor",
        recommendedOutcome: report.recommendedOutcome,
      });
    },
    updateForecastDates: async (milestoneId, startAt, endAt, reason) => {
      await updateForecastMutation({
        forecastEndDate: isoDate(endAt),
        forecastStartDate: isoDate(startAt),
        milestoneKey: milestoneId,
        persona: roleToPersona(role),
        reason,
      });
    },
    updateMilestone: async (milestoneId, patch: MilestonePatch) => {
      if (mode === "active") {
        if (patch.progress !== undefined) {
          await updateProgressMutation({
            milestoneKey: milestoneId,
            mode: patch.progress >= 100 ? "mark_complete" : "set_progress",
            persona: roleToPersona(role),
            progressPercent: patch.progress,
          });
        }
        return;
      }
      if (patch.estimatedCost !== undefined) {
        await updateValueMutation({
          milestoneKey: milestoneId,
          valueCents: cents(patch.estimatedCost),
        });
      }
      if (patch.estimatedDurationDays !== undefined) {
        await updateDurationMutation({
          durationDays: patch.estimatedDurationDays,
          milestoneKey: milestoneId,
        });
      }
    },
    updateProgress: async (milestoneId, progress) => {
      await updateProgressMutation({
        milestoneKey: milestoneId,
        mode: progress >= 100 ? "mark_complete" : "set_progress",
        persona: roleToPersona(role),
        progressPercent: progress,
      });
    },
    uploadEvidence: async (milestoneId, file, geofencePassed) => {
      await uploadMutation({
        fileName: file.name,
        milestoneKey: milestoneId,
        mimeType: file.type || "application/octet-stream",
        persona: roleToPersona(role),
        sizeBytes: file.size,
      });
      if (!geofencePassed) {
        // Metadata is retained even when location cannot be verified.
        await uploadMutation({
          fileName: `${file.name}.location-unverified`,
          milestoneKey: milestoneId,
          mimeType: "application/json",
          persona: roleToPersona(role),
          sizeBytes: 0,
        });
      }
    },
  };
}
