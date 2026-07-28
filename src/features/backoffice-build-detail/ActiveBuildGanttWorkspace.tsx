"use client";

import { useMutation } from "convex/react";
import { useEffect, useMemo, useState } from "react";

import { BuildWorkspaceDemo } from "#/features/build-workspace-demo/BuildWorkspaceDemo.tsx";
import {
  contractorPlanningFromProductionDetail,
  parseGanttMilestoneScopeId,
} from "#/features/build-workspace-demo/build-workspace-contractor-planning.ts";
import type {
  AddMilestoneInput,
  AuditEvent,
  BuildWorkspaceAdapter,
  DependencyHardness,
  DrawGroup,
  EvidenceStatus,
  Milestone,
  MilestoneDependency,
  MilestonePatch,
  OptimizationPlan,
  OptimizationPlanId,
  OutboxEvent,
  SiteVisitReportDraft,
  WorkspaceIssue,
  WorkspaceRole,
} from "#/features/build-workspace-demo/types.ts";
import { BuildWorkspaceProvider } from "#/features/build-workspace-demo/workspace-adapter.tsx";
import { normalizeEvidenceFileForUpload } from "#/lib/evidence-image-normalization.ts";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import type { ProductionBuildDetail } from "./ProductionBuildDetailSurface";
import type { SiteVisitOrderRequest } from "./SiteVisitOrderDialog.tsx";

export interface ActiveBuildGanttWorkspaceProps {
  buildId: Id<"activeBuilds">;
  canApproveMilestones?: boolean;
  canRejectMilestones?: boolean;
  detail: ProductionBuildDetail;
  onRequestSiteVisit: (request: SiteVisitOrderRequest) => void;
  timelineWorkspace?: {
    evidenceAssets?: {
      evidenceKey: string;
      fileName: string;
      label: string;
      milestoneKey: string;
      mimeType: string;
      previewUrl?: string | null;
      sizeBytes: number;
      tag: string;
    }[];
    plan?: {
      currentDay: number;
    };
  } | null;
  viewerRole?: "builder" | "lender";
  workosOrganizationId: string;
}

export function ActiveBuildGanttWorkspace({
  buildId,
  canApproveMilestones = false,
  canRejectMilestones = false,
  detail,
  onRequestSiteVisit,
  timelineWorkspace,
  viewerRole = "lender",
  workosOrganizationId,
}: ActiveBuildGanttWorkspaceProps) {
  const productionApi = (api as any).production_proposals;
  const updateMilestoneMutation = useMutation(
    productionApi.updateActiveBuildTimelineMilestone
  );
  const createMilestoneMutation = useMutation(
    productionApi.createActiveBuildTimelineMilestone
  );
  const createEvidenceMutation = useMutation(
    productionApi.createActiveBuildTimelineEvidenceAsset
  );
  const generateEvidenceUploadUrl = useMutation(
    productionApi.generateActiveBuildEvidenceUploadUrl
  );
  const submitCompletionClaim = useMutation(
    productionApi.submitActiveBuildMilestoneCompletion
  );
  const approveMilestone = useMutation(
    productionApi.approveActiveBuildMilestone
  );
  const rejectMilestone = useMutation(productionApi.rejectActiveBuildMilestone);
  const requestMoreInfo = useMutation(
    productionApi.requestActiveBuildMilestoneInfo
  );
  const recordSiteVisit = useMutation(productionApi.recordActiveBuildSiteVisit);
  const reviewEvidence = useMutation(productionApi.reviewActiveBuildEvidence);
  const assignContractorToMilestone = useMutation(
    productionApi.assignActiveBuildContractorToMilestone
  );
  const attachContractor = useMutation(
    productionApi.attachActiveBuildContractor
  );
  const createContractor = useMutation(productionApi.createContractorProfile);
  const createDraw = useMutation(productionApi.createActiveBuildTimelineDraw);
  const updateDraw = useMutation(productionApi.updateActiveBuildTimelineDraw);
  const deleteDraw = useMutation(productionApi.deleteActiveBuildTimelineDraw);

  const preferredRole: WorkspaceRole =
    viewerRole === "builder" ? "builderLead" : "lenderAdmin";
  const [role, setRole] = useState<WorkspaceRole>(preferredRole);
  const [selectedMilestoneId, setSelectedMilestoneId] = useState("");
  const [activePlanId, setActivePlanId] =
    useState<OptimizationPlanId>("capitalConstrained");
  const [dismissedIssueKeys, setDismissedIssueKeys] = useState(
    () => new Set<string>()
  );

  useEffect(() => {
    setRole((currentRole) =>
      currentRole === preferredRole ? currentRole : preferredRole
    );
  }, [preferredRole]);

  const mapped = useMemo(
    () =>
      mapActiveBuildWorkspace({
        activePlanId,
        detail,
        dismissedIssueKeys,
        role,
        selectedMilestoneId,
        timelineWorkspace,
      }),
    [
      activePlanId,
      detail,
      dismissedIssueKeys,
      role,
      selectedMilestoneId,
      timelineWorkspace,
    ]
  );
  const selectedId = selectedMilestoneId || mapped.selectedMilestoneId;
  const dependencies = mapped.dependencies;

  const contractorPlanning = useMemo(
    () => contractorPlanningFromProductionDetail(detail),
    [detail]
  );

  const adapter = useMemo<BuildWorkspaceAdapter>(
    () => ({
      ...mapped,
      activePlanId,
      assignContractorToMilestone: async ({
        assignmentCost,
        contractorId,
        milestoneId,
        role,
        submilestoneKeys,
      }) => {
        const scope = parseGanttMilestoneScopeId(milestoneId);
        await assignContractorToMilestone({
          ...assignmentCost,
          buildId,
          contractorId: contractorId as Id<"contractors">,
          milestoneKey: scope.milestoneKey,
          role,
          submilestoneKeys: submilestoneKeys ?? scope.submilestoneKeys,
          workosOrganizationId,
        });
      },
      contractorPlanning,
      createAndAssignContractor: async ({
        assignmentCost,
        contractor,
        milestoneId,
        role,
        submilestoneKeys,
      }) => {
        const scope = parseGanttMilestoneScopeId(milestoneId);
        const contractorId = await createContractor({
          ...contractor,
          brokerageId: detail.build.brokerageId as Id<"brokerages">,
          workosOrganizationId,
        });
        await attachContractor({
          buildId,
          contractorId,
          role,
          workosOrganizationId,
        });
        await assignContractorToMilestone({
          ...assignmentCost,
          buildId,
          contractorId,
          milestoneKey: scope.milestoneKey,
          role,
          submilestoneKeys: submilestoneKeys ?? scope.submilestoneKeys,
          workosOrganizationId,
        });
      },
      isLoading: false,
      mode: "active",
      resolveContractorMilestoneKey: (milestoneId) =>
        parseGanttMilestoneScopeId(milestoneId).milestoneKey,
      needsSeed: false,
      role,
      selectedMilestoneId: selectedId,
      addDependency: async (fromMilestoneId, toMilestoneId) => {
        const target = detail.milestones.find(
          (milestone) => milestone.key === toMilestoneId
        );
        if (!target) {
          return;
        }
        await updateMilestoneMutation({
          buildId,
          dependencyKeys: Array.from(
            new Set([...(target.dependencyKeys ?? []), fromMilestoneId])
          ),
          milestoneKey: toMilestoneId,
          workosOrganizationId,
        });
      },
      addMilestone: async (input: AddMilestoneInput) => {
        const nextOrder = detail.milestones.length + 1;
        const startDay = input.startAt
          ? dayFromDate(detail.build.startDate, input.startAt)
          : nextOrder * 14;
        const durationDays = Math.max(
          1,
          Math.round(input.estimatedDurationDays)
        );
        await createMilestoneMutation({
          buildId,
          milestone: {
            budgetCents: cents(input.estimatedCost),
            dayEnd: startDay + durationDays,
            dayStart: startDay,
            dependencyKeys: [],
            durationDays,
            evidenceState: "Draft package",
            milestoneKey: slugifyMilestone(input.name, nextOrder),
            name: input.name,
            order: nextOrder,
            policyState: "Approved reimbursement policy",
            submilestones: [],
            x: startDay,
          },
          workosOrganizationId,
        });
      },
      addSampleEvidence: async (milestoneId) => {
        await createEvidenceMutation({
          asset: {
            evidenceKey: `sample-${milestoneId}-${Date.now()}`,
            fileName: `${milestoneId}-field-photo.jpg`,
            label: "Field progress photo",
            locationVerified: true,
            milestoneKey: milestoneId,
            mimeType: "image/jpeg",
            sizeBytes: 0,
            source: "active_build_sample_evidence",
            tag: "Site photo",
          },
          buildId,
          workosOrganizationId,
        });
      },
      applyIssueQuickFix: async (issue) => {
        const targetId = issue.quickFix?.targetId ?? issue.milestoneIds[0];
        if (targetId) {
          setSelectedMilestoneId(targetId);
        }
      },
      applyRecommendedPlan: async () => {
        setActivePlanId("capitalConstrained");
      },
      approveMilestone: async (milestoneId, reason) => {
        if (!canApproveMilestones) {
          throw new Error("You do not have permission to approve milestones.");
        }
        await approveMilestone({
          buildId,
          milestoneKey: milestoneId,
          note: reason,
          workosOrganizationId,
        });
      },
      batchMoveMilestoneDates: async (moves, reason) => {
        await Promise.all(
          moves.map((move) =>
            updateMilestoneMutation({
              buildId,
              dayEnd: dayFromDate(
                detail.build.startDate,
                move.endAt ?? move.startAt
              ),
              dayStart: dayFromDate(detail.build.startDate, move.startAt),
              milestoneKey: move.milestoneId,
              workosOrganizationId,
            })
          )
        );
        void reason;
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
        const source = detail.draws.find(
          (draw) => draw.drawKey === sourceDrawGroupId
        );
        const target = detail.draws.find(
          (draw) => draw.drawKey === targetDrawGroupId
        );
        if (!(source && target)) {
          return;
        }
        await updateDraw({
          amountCents: source.amountCents + target.amountCents,
          buildId,
          drawKey: target.drawKey,
          workosOrganizationId,
        });
        await deleteDraw({
          buildId,
          drawKey: source.drawKey,
          workosOrganizationId,
        });
      },
      moveMilestoneDates: async (milestoneId, startAt, endAt) => {
        await updateMilestoneMutation({
          buildId,
          dayEnd: dayFromDate(detail.build.startDate, endAt ?? startAt),
          dayStart: dayFromDate(detail.build.startDate, startAt),
          milestoneKey: milestoneId,
          workosOrganizationId,
        });
      },
      moveMilestoneToDrawGroup: async (milestoneId, drawGroupId) => {
        await updateDraw({
          buildId,
          drawKey: drawGroupId,
          itemMilestoneKey: milestoneId,
          workosOrganizationId,
        });
      },
      recomputeProposalPlan: async () => undefined,
      rejectMilestone: async (milestoneId, reason) => {
        if (!canRejectMilestones) {
          throw new Error("You do not have permission to reject milestones.");
        }
        await rejectMilestone({
          buildId,
          milestoneKey: milestoneId,
          note: reason,
          workosOrganizationId,
        });
      },
      removeDependency: async (dependencyId) => {
        const dependency = dependencies.find(
          (item) => item.id === dependencyId
        );
        const target = detail.milestones.find(
          (milestone) => milestone.key === dependency?.toMilestoneId
        );
        if (!(dependency && target)) {
          return;
        }
        await updateMilestoneMutation({
          buildId,
          dependencyKeys: (target.dependencyKeys ?? []).filter(
            (key) => key !== dependency.fromMilestoneId
          ),
          milestoneKey: target.key,
          workosOrganizationId,
        });
      },
      reorderMilestone: async (milestoneId, direction) => {
        const sorted = [...detail.milestones].sort((a, b) => a.order - b.order);
        const fromIndex = sorted.findIndex(
          (milestone) => milestone.key === milestoneId
        );
        const toIndex = direction === "up" ? fromIndex - 1 : fromIndex + 1;
        if (fromIndex < 0 || toIndex < 0 || toIndex >= sorted.length) {
          return;
        }
        await Promise.all([
          updateMilestoneMutation({
            buildId,
            milestoneKey: sorted[fromIndex].key,
            order: sorted[toIndex].order,
            workosOrganizationId,
          }),
          updateMilestoneMutation({
            buildId,
            milestoneKey: sorted[toIndex].key,
            order: sorted[fromIndex].order,
            workosOrganizationId,
          }),
        ]);
      },
      reorderMilestoneAbsolute: async (milestoneId, _fromIndex, toIndex) => {
        await updateMilestoneMutation({
          buildId,
          milestoneKey: milestoneId,
          order: toIndex + 1,
          workosOrganizationId,
        });
      },
      requestMoreInformation: async (milestoneId, reason) => {
        await requestMoreInfo({
          buildId,
          milestoneKey: milestoneId,
          note: reason,
          workosOrganizationId,
        });
      },
      requestSiteVisit: async (milestoneId, reason, includedMilestoneIds) => {
        onRequestSiteVisit({
          milestoneKey: milestoneId,
          note: reason,
          requestedDay: dayFromDate(detail.build.startDate, new Date()),
        });
        void includedMilestoneIds;
        return;
      },
      resetWorkspace: async () => undefined,
      reviewEvidence: async (milestoneId, accepted, reason) => {
        await reviewEvidence({
          accepted,
          buildId,
          milestoneKey: milestoneId,
          note: reason,
          workosOrganizationId,
        });
      },
      selectMilestone: setSelectedMilestoneId,
      setActivePlan: setActivePlanId,
      setDependencyHardness: async (
        dependencyId: string,
        _hardness: DependencyHardness
      ) => {
        const dependency = dependencies.find(
          (item) => item.id === dependencyId
        );
        if (dependency) {
          await updateMilestoneMutation({
            buildId,
            dependencyKeys:
              detail.milestones.find(
                (milestone) => milestone.key === dependency.toMilestoneId
              )?.dependencyKeys ?? [],
            milestoneKey: dependency.toMilestoneId,
            workosOrganizationId,
          });
        }
      },
      setMilestoneDragLocked: async (milestoneId, locked) => {
        await updateMilestoneMutation({
          buildId,
          isDragLocked: locked,
          milestoneKey: milestoneId,
          workosOrganizationId,
        });
      },
      setRole,
      splitDrawGroup: async (drawGroupId, afterMilestoneId) => {
        const source = detail.draws.find(
          (draw) => draw.drawKey === drawGroupId
        );
        const milestone = detail.milestones.find(
          (item) => item.key === afterMilestoneId
        );
        if (!(source && milestone)) {
          return;
        }
        await createDraw({
          amountCents: milestone.drawAvailabilityCents,
          buildId,
          drawKey: `${source.drawKey}-${milestone.key}`,
          itemMilestoneKey: milestone.key,
          label: `${milestone.name} reimbursement draw`,
          order: source.order + 1,
          workosOrganizationId,
          x: milestone.dayEnd,
        });
      },
      submitCompletionClaim: async (milestoneId, requestedAmountCents) => {
        const milestone = detail.milestones.find(
          (item) => item.key === milestoneId
        );
        await submitCompletionClaim({
          actualCostCents: requestedAmountCents,
          buildId,
          completedDay:
            milestone?.dayEnd ??
            dayFromDate(detail.build.startDate, new Date()),
          milestoneKey: milestoneId,
          note: "Completion submitted from build workspace.",
          workosOrganizationId,
        });
      },
      submitProposal: async () => undefined,
      submitSiteVisitReport: async (
        milestoneId: string,
        report: SiteVisitReportDraft
      ) => {
        const visit = detail.siteVisits
          ?.filter((item) => item.milestoneKey === milestoneId)
          .at(-1);
        if (!visit) {
          return;
        }
        await recordSiteVisit({
          buildId,
          milestoneKey: milestoneId,
          note: report.notes,
          status: report.completionObserved ? "complete" : "cancelled",
          visitId: visit.visitId,
          workosOrganizationId,
        });
      },
      updateForecastDates: async (milestoneId, startAt, endAt) => {
        await updateMilestoneMutation({
          buildId,
          dayEnd: dayFromDate(detail.build.startDate, endAt),
          dayStart: dayFromDate(detail.build.startDate, startAt),
          milestoneKey: milestoneId,
          workosOrganizationId,
        });
      },
      updateMilestone: async (milestoneId, patch: MilestonePatch) => {
        await updateMilestoneMutation({
          buildId,
          ...(patch.actualCost === undefined
            ? {}
            : { budgetCents: cents(patch.actualCost) }),
          ...(patch.estimatedCost === undefined
            ? {}
            : { budgetCents: cents(patch.estimatedCost) }),
          ...(patch.estimatedDurationDays === undefined
            ? {}
            : {
                durationDays: Math.max(
                  1,
                  Math.round(patch.estimatedDurationDays)
                ),
              }),
          ...(patch.evidenceStatus === undefined
            ? {}
            : { evidenceState: evidenceStateLabel(patch.evidenceStatus) }),
          ...(patch.name === undefined ? {} : { name: patch.name }),
          ...(patch.progress === undefined
            ? {}
            : {
                progressPercent: patch.progress,
                status:
                  patch.progress >= 100
                    ? "complete"
                    : patch.progress > 0
                      ? "in_progress"
                      : "planned",
              }),
          milestoneKey: milestoneId,
          workosOrganizationId,
        });
      },
      updateProgress: async (milestoneId, progress) => {
        await updateMilestoneMutation({
          buildId,
          milestoneKey: milestoneId,
          progressPercent: progress,
          status:
            progress >= 100
              ? "complete"
              : progress > 0
                ? "in_progress"
                : "planned",
          workosOrganizationId,
        });
      },
      uploadEvidence: async (milestoneId, file, geofencePassed) => {
        const uploadFile = await normalizeEvidenceFileForUpload(file);
        const uploadUrl = await generateEvidenceUploadUrl({
          buildId,
          workosOrganizationId,
        });
        const response = await fetch(uploadUrl, {
          body: uploadFile,
          headers: {
            "Content-Type": uploadFile.type || "application/octet-stream",
          },
          method: "POST",
        });
        if (!response.ok) {
          throw new Error("Evidence upload failed.");
        }
        const { storageId } = await response.json();
        await createEvidenceMutation({
          asset: {
            evidenceKey: `upload-${milestoneId}-${Date.now()}`,
            fileName: uploadFile.name,
            label: uploadFile.name,
            locationVerified: geofencePassed,
            milestoneKey: milestoneId,
            mimeType: uploadFile.type || "application/octet-stream",
            sizeBytes: uploadFile.size,
            source: "active_build_workspace_upload",
            storageId,
            tag: geofencePassed ? "Evidence" : "Location unverified evidence",
          },
          buildId,
          workosOrganizationId,
        });
      },
    }),
    [
      activePlanId,
      approveMilestone,
      assignContractorToMilestone,
      attachContractor,
      buildId,
      canApproveMilestones,
      canRejectMilestones,
      contractorPlanning,
      createContractor,
      createDraw,
      createEvidenceMutation,
      createMilestoneMutation,
      deleteDraw,
      dependencies,
      detail,
      generateEvidenceUploadUrl,
      mapped,
      onRequestSiteVisit,
      recordSiteVisit,
      rejectMilestone,
      requestMoreInfo,
      reviewEvidence,
      role,
      selectedId,
      submitCompletionClaim,
      updateDraw,
      updateMilestoneMutation,
      workosOrganizationId,
    ]
  );

  return (
    <BuildWorkspaceProvider workspace={adapter}>
      <BuildWorkspaceDemo
        canFinalizeMilestones={canApproveMilestones && canRejectMilestones}
        layout="embedded"
        showPrimaryAction={false}
        showRoleSelector={false}
        viewer={viewerRole}
      />
    </BuildWorkspaceProvider>
  );
}

function mapActiveBuildWorkspace({
  activePlanId,
  detail,
  dismissedIssueKeys,
  role,
  selectedMilestoneId,
  timelineWorkspace,
}: {
  activePlanId: OptimizationPlanId;
  detail: ProductionBuildDetail;
  dismissedIssueKeys: Set<string>;
  role: WorkspaceRole;
  selectedMilestoneId: string;
  timelineWorkspace?: ActiveBuildGanttWorkspaceProps["timelineWorkspace"];
}): Omit<
  BuildWorkspaceAdapter,
  | "addDependency"
  | "addMilestone"
  | "addSampleEvidence"
  | "applyIssueQuickFix"
  | "applyRecommendedPlan"
  | "approveMilestone"
  | "batchMoveMilestoneDates"
  | "claimSiteVisit"
  | "dismissIssue"
  | "mergeDrawGroups"
  | "moveMilestoneDates"
  | "moveMilestoneToDrawGroup"
  | "recomputeProposalPlan"
  | "rejectMilestone"
  | "removeDependency"
  | "reorderMilestone"
  | "reorderMilestoneAbsolute"
  | "requestMoreInformation"
  | "requestSiteVisit"
  | "resetWorkspace"
  | "reviewEvidence"
  | "selectMilestone"
  | "setActivePlan"
  | "setDependencyHardness"
  | "setMilestoneDragLocked"
  | "setRole"
  | "splitDrawGroup"
  | "submitCompletionClaim"
  | "submitProposal"
  | "submitSiteVisitReport"
  | "updateForecastDates"
  | "updateMilestone"
  | "updateProgress"
  | "uploadEvidence"
> {
  const sortedMilestones = [...detail.milestones].sort(
    (a, b) => a.order - b.order || a.key.localeCompare(b.key)
  );
  const sortedDraws = [...detail.draws].sort(
    (a, b) => a.order - b.order || a.drawKey.localeCompare(b.drawKey)
  );
  const evidenceByMilestone = new Map<
    string,
    NonNullable<typeof timelineWorkspace>["evidenceAssets"]
  >();
  for (const asset of timelineWorkspace?.evidenceAssets ?? []) {
    const current = evidenceByMilestone.get(asset.milestoneKey) ?? [];
    current.push(asset);
    evidenceByMilestone.set(asset.milestoneKey, current);
  }
  const drawByMilestone = new Map(
    sortedDraws
      .filter((draw) => draw.milestoneKey)
      .map((draw) => [draw.milestoneKey as string, draw])
  );
  const currentDay =
    typeof timelineWorkspace?.plan?.currentDay === "number"
      ? timelineWorkspace.plan.currentDay
      : dayFromDate(detail.build.startDate, new Date());
  const issues = buildWorkspaceIssues(detail, dismissedIssueKeys);
  const dependencies: MilestoneDependency[] = sortedMilestones.flatMap(
    (milestone) =>
      (milestone.dependencyKeys ?? []).map((dependencyKey) => ({
        fromMilestoneId: dependencyKey,
        hardness: "hard" as const,
        id: `${dependencyKey}->${milestone.key}`,
        isSystem: false,
        toMilestoneId: milestone.key,
        type: "hard_blocker",
      }))
  );
  const milestones: Milestone[] = sortedMilestones.map((milestone) => {
    const draw = drawByMilestone.get(milestone.key) ?? sortedDraws[0];
    const evidenceAssets = evidenceByMilestone.get(milestone.key) ?? [];
    const siteVisits =
      detail.siteVisits?.filter(
        (visit) => visit.milestoneKey === milestone.key
      ) ?? [];
    return {
      actualCost: centsToDollars(
        typeof milestone.completionClaim?.actualCostCents === "number"
          ? milestone.completionClaim.actualCostCents
          : milestone.budgetCents
      ),
      blockedByKeys: milestone.dependencyKeys ?? [],
      blockingKeys: sortedMilestones
        .filter((item) => item.dependencyKeys?.includes(milestone.key))
        .map((item) => item.key),
      blockingReasons: dependencyBlockers(milestone, sortedMilestones),
      code: milestone.key.toUpperCase(),
      completionReport:
        typeof milestone.completionClaim?.note === "string"
          ? milestone.completionClaim.note
          : "",
      drawGroupId: draw?.drawKey ?? `draw-${milestone.order}`,
      endAt: dateFromDay(detail.build.startDate, milestone.dayEnd),
      estimatedCost: centsToDollars(milestone.budgetCents),
      estimatedDurationDays: milestone.durationDays,
      evidenceFiles: evidenceAssets.map((asset) => ({
        fileName: asset.fileName,
        id: asset.evidenceKey,
        isSample: !asset.previewUrl,
        mimeType: asset.mimeType,
        sizeBytes: asset.sizeBytes,
        uploadedAt: new Date().toISOString(),
        uploadedByPersona: "production_user",
      })),
      evidencePackages: evidenceAssets.length
        ? [
            {
              createdAt: new Date().toISOString(),
              id: `pkg-${milestone.key}`,
              reviewStatus: milestone.evidenceState ?? "Submitted package",
              status: "submitted",
              submittedAt: new Date().toISOString(),
            },
          ]
        : [],
      evidenceStatus: mapEvidenceStatus(milestone),
      id: milestone.key,
      isDragLocked: Boolean(milestone.isDragLocked),
      issues: issues.filter((issue) =>
        issue.milestoneIds.includes(milestone.key)
      ),
      lane: draw?.drawKey ?? `draw-${milestone.order}`,
      name: milestone.name,
      notes: milestone.policyState ?? "",
      progress:
        typeof milestone.progressPercent === "number"
          ? milestone.progressPercent
          : milestone.status === "complete"
            ? 100
            : milestone.status === "in_progress"
              ? 50
              : 0,
      requestedAmountCents: draw?.amountCents,
      requiresSiteVisit: Boolean(milestone.completionReview?.siteVisit),
      reviewReports: milestone.completionReview
        ? [
            {
              createdAt:
                milestone.completionReview.reviewedAt ??
                new Date().toISOString(),
              id: `review-${milestone.key}`,
              notes: milestone.completionReview.note ?? "",
              outcome: milestone.completionReview.status ?? "pending",
              reviewerPersona: "lender_admin",
            },
          ]
        : [],
      siteVisitRequested: siteVisits.some(
        (visit) => visit.status === "requested"
      ),
      siteVisits: siteVisits.map((visit) => ({
        assignedPersona: "site_visitor",
        completedAt: visit.completedAt,
        completionObserved: visit.status === "complete",
        createdAt: visit.requestedAt,
        id: visit.visitId,
        notes: visit.recordNote ?? visit.note,
        recommendedOutcome: visit.status,
        requestReason: visit.note,
        riskFlags: [],
        status: visit.status,
        targetMilestoneKeys: [visit.milestoneKey],
        tokenExpiresAt: new Date(visit.tokenExpiresAt).toISOString(),
      })),
      staffRecommendation: milestone.completionReview?.status ?? "",
      startAt: dateFromDay(detail.build.startDate, milestone.dayStart),
      status: mapMilestoneStatus(milestone, currentDay, sortedMilestones),
      warningCount: issues.filter((issue) =>
        issue.milestoneIds.includes(milestone.key)
      ).length,
    };
  });
  const drawGroups: DrawGroup[] = sortedDraws.map((draw, index) => {
    const scopedMilestones = milestones.filter(
      (milestone) => milestone.drawGroupId === draw.drawKey
    );
    const fallbackMilestone = sortedMilestones.find(
      (milestone) => milestone.key === draw.milestoneKey
    );
    const firstOrder =
      Math.min(
        ...scopedMilestones.map((milestone) =>
          sortedMilestones.findIndex((item) => item.key === milestone.id)
        )
      ) ||
      fallbackMilestone?.order - 1 ||
      index;
    return {
      amount: centsToDollars(draw.amountCents),
      eligibleAt: dateFromDay(detail.build.startDate, draw.timingDay),
      endAt: dateFromDay(
        detail.build.startDate,
        Math.max(draw.timingDay, fallbackMilestone?.dayEnd ?? draw.timingDay)
      ),
      id: draw.drawKey,
      issues: issues.filter((issue) =>
        issue.drawGroupIds.includes(draw.drawKey)
      ),
      label: draw.label,
      order: draw.order,
      plannedAt: dateFromDay(detail.build.startDate, draw.timingDay),
      rowIndex: Math.max(0, firstOrder),
      rowSpan: Math.max(1, scopedMilestones.length || 1),
      startAt: dateFromDay(
        detail.build.startDate,
        fallbackMilestone?.dayStart ?? draw.timingDay
      ),
      status: mapDrawStatus(draw),
      totalExposure: centsToDollars(draw.amountCents),
      warningState: issues.some(
        (issue) =>
          issue.drawGroupIds.includes(draw.drawKey) &&
          issue.severity === "blocking"
      )
        ? "critical"
        : issues.some((issue) => issue.drawGroupIds.includes(draw.drawKey))
          ? "warning"
          : "clear",
    };
  });
  const auditEvents: AuditEvent[] = (detail.auditEvents ?? []).map((event) => ({
    actor: event.actorPersona,
    command: event.eventType,
    id: event._id,
    message: event.eventType,
    reason: event.afterSummary ?? event.beforeSummary,
    role: event.actorPersona?.includes("site")
      ? "siteVisitor"
      : event.actorPersona?.includes("builder")
        ? "builderLead"
        : "lenderAdmin",
    timestamp: new Date(event.createdAt).toISOString(),
    type: event.eventType.includes("draw")
      ? "drawChanged"
      : event.eventType.includes("evidence")
        ? "evidenceChanged"
        : event.eventType.includes("approval")
          ? "approvalChanged"
          : "milestoneChanged",
  }));
  const outboxEvents: OutboxEvent[] = (detail.quickActionEvents ?? []).map(
    (event) => ({
      eventType: event.eventType,
      id: event._id,
      payloadPreview: event.payloadPreview,
      relatedEntity: detail.build._id,
      status: "pending",
      timestamp: new Date(event.createdAt).toISOString(),
    })
  );

  return {
    activePlanId,
    auditEvents,
    budget: {
      borrowerWorkingCapitalLimit: centsToDollars(
        detail.capitalPlan?.borrowerWorkingCapitalLimitCents ?? 0
      ),
      drawFeeBps: 0,
      interestRatePct: (detail.loanFacility?.interestAnnualBps ?? 0) / 100,
      lenderDrawPolicyLimit: centsToDollars(
        detail.capitalPlan?.lenderDrawPolicyLimitCents ?? 0
      ),
      requestedLoanAmount: centsToDollars(
        detail.loanFacility?.principalCents ?? 0
      ),
      totalBuildBudget: centsToDollars(detail.build.totalBudgetCents),
      version: detail.capitalPlan?.version ?? 1,
    },
    build: {
      borrowerName: "Builder borrower",
      buildName: detail.build.buildName,
      lenderName: "FairLend Construction Capital",
      organizationId: "production",
      phaseLabel: "Active reimbursement workspace",
      proposalStatus: "approved",
      siteAddress: detail.build.location,
    },
    compilationStatus: issues.some((issue) => issue.severity === "blocking")
      ? "blocked"
      : "upToDate",
    dependencies,
    drawGroups,
    isLoading: false,
    issues,
    milestones,
    mode: "active",
    needsSeed: false,
    optimizationPlans: buildOptimizationPlans(detail, drawGroups),
    outboxEvents,
    role,
    selectedMilestoneId: selectedMilestoneId || milestones[0]?.id || "",
    terminalMessage: undefined,
    validationErrors: issues
      .filter((issue) => issue.severity === "blocking")
      .map((issue) => issue.message),
    validationWarnings: issues
      .filter((issue) => issue.severity === "warning")
      .map((issue) => issue.message),
  };
}

function buildWorkspaceIssues(
  detail: ProductionBuildDetail,
  dismissedIssueKeys: Set<string>
): WorkspaceIssue[] {
  const issues: WorkspaceIssue[] = [];
  const knownMilestones = new Set(
    detail.milestones.map((milestone) => milestone.key)
  );
  for (const milestone of detail.milestones) {
    for (const dependencyKey of milestone.dependencyKeys ?? []) {
      if (!knownMilestones.has(dependencyKey)) {
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
    if (
      milestone.status === "complete" &&
      !String(milestone.evidenceState ?? "")
        .toLowerCase()
        .includes("accepted")
    ) {
      issues.push(
        issueRow({
          code: "evidence_review_pending",
          id: `evidence-pending-${milestone.key}`,
          message: `${milestone.name} is complete with evidence still awaiting lender acceptance.`,
          milestoneIds: [milestone.key],
          severity: "warning",
          title: "Evidence review pending",
        })
      );
    }
    if (
      String(milestone.evidenceState ?? "")
        .toLowerCase()
        .includes("location")
    ) {
      issues.push(
        issueRow({
          code: "location_unverified",
          id: `location-unverified-${milestone.key}`,
          message: `${milestone.name} has evidence with unverified location.`,
          milestoneIds: [milestone.key],
          severity: "warning",
          title: "Location unverified",
        })
      );
    }
  }
  for (const draw of detail.draws) {
    if (draw.status === "rejected") {
      issues.push(
        issueRow({
          code: "draw_rejected",
          drawGroupIds: [draw.drawKey],
          id: `draw-rejected-${draw.drawKey}`,
          message: `${draw.label} was rejected and needs borrower correction.`,
          severity: "blocking",
          title: "Draw rejected",
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

function buildOptimizationPlans(
  detail: ProductionBuildDetail,
  drawGroups: DrawGroup[]
): OptimizationPlan[] {
  const totalFees = drawGroups.length * 500;
  const exposure = drawGroups.reduce(
    (max, draw) => Math.max(max, draw.totalExposure),
    0
  );
  const principal = centsToDollars(detail.loanFacility?.principalCents ?? 0);
  return [
    {
      durationDays: Math.max(...detail.milestones.map((m) => m.dayEnd), 0),
      id: "cheapestFeasible",
      label: "Cheapest Feasible",
      peakWorkingCapital: exposure,
      projectedInterest: Math.round(principal * 0.03),
      summary:
        "Current production reimbursement grouping with minimum draw count.",
      totalFees,
      warning: "Uses active build schedule and production draw rows.",
    },
    {
      durationDays: Math.max(
        1,
        Math.round(
          Math.max(...detail.milestones.map((m) => m.dayEnd), 1) * 0.85
        )
      ),
      id: "fastest",
      label: "Fastest",
      peakWorkingCapital: Math.round(exposure * 1.15),
      projectedInterest: Math.round(principal * 0.025),
      summary:
        "Compresses unlocked milestones where dependency policy permits.",
      totalFees,
      warning: "May increase working-capital pressure.",
    },
    {
      durationDays: Math.max(...detail.milestones.map((m) => m.dayEnd), 0),
      id: "capitalConstrained",
      label: "Capital-Constrained",
      peakWorkingCapital: centsToDollars(
        detail.capitalPlan?.borrowerWorkingCapitalLimitCents ?? 0
      ),
      projectedInterest: Math.round(principal * 0.028),
      summary:
        "Keeps reimbursement cadence inside borrower capital constraints.",
      totalFees,
      warning: "Ready for active-build governance.",
    },
  ];
}

function mapMilestoneStatus(
  milestone: ProductionBuildDetail["milestones"][number],
  currentDay: number,
  milestones: ProductionBuildDetail["milestones"]
) {
  if (milestone.status === "complete") {
    return "approved";
  }
  if (milestone.completionClaim) {
    return "underReview";
  }
  if (
    String(milestone.evidenceState ?? "")
      .toLowerCase()
      .includes("required")
  ) {
    return "evidenceRequired";
  }
  if (
    String(milestone.evidenceState ?? "")
      .toLowerCase()
      .includes("submitted")
  ) {
    return "evidenceSubmitted";
  }
  if (milestone.status === "in_progress") {
    return "inProgress";
  }
  if (dependencyBlockers(milestone, milestones).length > 0) {
    return currentDay >= milestone.dayStart ? "blocked" : "notStarted";
  }
  if (currentDay >= milestone.dayStart) {
    return "inProgress";
  }
  return "notStarted";
}

function mapEvidenceStatus(
  milestone: ProductionBuildDetail["milestones"][number]
): EvidenceStatus {
  const state = String(milestone.evidenceState ?? "").toLowerCase();
  if (state.includes("accepted") || state.includes("approved")) {
    return "accepted";
  }
  if (state.includes("info") || state.includes("rejected")) {
    return "needsInfo";
  }
  if (state.includes("location")) {
    return "locationUnverified";
  }
  if (state.includes("submitted") || state.includes("completion")) {
    return "submitted";
  }
  if (state.includes("draft")) {
    return "draft";
  }
  return "notStarted";
}

function mapDrawStatus(draw: ProductionBuildDetail["draws"][number]) {
  if (draw.status === "released") {
    return "released";
  }
  if (draw.status === "approved") {
    return "readyForRelease";
  }
  if (draw.status === "requested") {
    return "evidencePending";
  }
  if (draw.status === "rejected") {
    return "blocked";
  }
  return "planned";
}

function dependencyBlockers(
  milestone: ProductionBuildDetail["milestones"][number],
  milestones: ProductionBuildDetail["milestones"]
) {
  const byKey = new Map(milestones.map((item) => [item.key, item]));
  return (milestone.dependencyKeys ?? [])
    .map((key) => byKey.get(key))
    .filter((item) => item && item.status !== "complete")
    .map((item) => `${item?.name} must be complete first.`);
}

function evidenceStateLabel(status: EvidenceStatus) {
  if (status === "accepted") {
    return "Accepted";
  }
  if (status === "needsInfo") {
    return "Info requested";
  }
  if (status === "locationUnverified") {
    return "Location unverified";
  }
  if (status === "submitted") {
    return "Submitted package";
  }
  if (status === "draft") {
    return "Draft package";
  }
  return "Not started";
}

function dateFromDay(startDate: string, day: number) {
  const startMs = Date.parse(`${startDate.slice(0, 10)}T12:00:00`);
  const safeStartMs = Number.isFinite(startMs) ? startMs : Date.now();
  return new Date(safeStartMs + Math.round(day) * 86_400_000);
}

function dayFromDate(startDate: string, date: Date) {
  const startMs = Date.parse(`${startDate.slice(0, 10)}T12:00:00`);
  const safeStartMs = Number.isFinite(startMs) ? startMs : Date.now();
  return Math.max(0, Math.round((date.getTime() - safeStartMs) / 86_400_000));
}

function slugifyMilestone(name: string, order: number) {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
  return slug || `milestone-${order}`;
}

function cents(value: number) {
  return Math.max(0, Math.round(value * 100));
}

function centsToDollars(value: number) {
  return Math.round(value / 100);
}
